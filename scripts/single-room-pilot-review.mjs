import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const CLOSED_FEATURES = ['remoteMining', 'recon', 'economicTrial', 'nativeTrialOps', 'goalPlanning',
    'market', 'homeEvidence', 'trialEvidence'];
const RECEIPT_FIELDS = ['requestId', 'roomName', 'quotaKey', 'role', 'name', 'spawnName', 'cost',
    'state', 'admittedAt', 'expireAt', 'observeUntil', 'callStartedAt', 'result', 'resultAt', 'spawningSeenAt', 'bornAt'];

export function projectPilotProof(memory, roomName) {
    const empire = memory.empire;
    const control = empire?.control;
    const policy = control?.policy;
    const remote = policy?.remoteMining;
    const receipts = Object.values(empire?.localSpawnReceipts || {})
        .filter(row => row?.roomName === roomName).slice(0, 200)
        .map(row => Object.fromEntries(RECEIPT_FIELDS.map(field => [field, row[field] ?? null])));
    return {
        telemetryTick: control?.telemetry?.updatedAt ?? null,
        controls: {
            pilotRoom: policy?.spawnIntake?.localReplacementPilotRoom ?? null,
            remoteMining: remote?.enabled ?? null,
            recon: remote?.reconTrial?.enabled ?? null,
            economicTrial: remote?.economicTrial?.enabled ?? null,
            nativeTrialOps: remote?.nativeTrialOps?.enabled ?? null,
            goalPlanning: policy?.goalPlanning?.enabled ?? null,
            market: empire?.market?.enabled ?? null,
            homeEvidence: policy?.homeEvidence?.enabled ?? null,
            trialEvidence: remote?.evidenceWindow?.enabled ?? null
        },
        receipts
    };
}

export function pilotControlDifferences({controls, governorShadow, schedulerEnforce}, roomName) {
    const differences = CLOSED_FEATURES.filter(feature => controls?.[feature] !== false);
    if (controls?.pilotRoom !== roomName) differences.push('pilotRoom');
    if (governorShadow !== true) differences.push('governorShadow');
    if (schedulerEnforce !== false) differences.push('schedulerEnforce');
    return differences;
}

function inspectReceipt(row, tick, roomName) {
    const identityTick = typeof row?.requestId === 'string' && /^REQ_SPAWN_(\d+)_\d+$/.exec(row.requestId);
    return identityTick && row.roomName === roomName && ['hauler', 'miner'].includes(row.role) &&
        typeof row.name === 'string' && typeof row.quotaKey === 'string' &&
        row.expireAt === Number(identityTick[1]) + 1 &&
        Number.isSafeInteger(row.admittedAt) && row.admittedAt >= Number(identityTick[1]) && row.admittedAt <= row.expireAt &&
        Number.isSafeInteger(row.observeUntil) && row.observeUntil >= tick && tick >= row.admittedAt &&
        (row.bornAt == null || (Number.isSafeInteger(row.bornAt) && row.bornAt >= row.admittedAt && row.bornAt <= tick)) &&
        (row.spawningSeenAt == null || (Number.isSafeInteger(row.spawningSeenAt) &&
            row.spawningSeenAt >= row.admittedAt && row.spawningSeenAt <= tick));
}

export function reviewPilotWindow(samples, summary, expected) {
    if (!Array.isArray(samples)) throw new Error('Expected observation rows');
    if (!/^[a-f0-9]{64}$/.test(expected.mainSha256) ||
        typeof expected.serviceVersion !== 'string' || !expected.serviceVersion.length ||
        !expected.branch || !expected.shard || !expected.roomName) throw new Error('Expected release identity is incomplete');
    let lastTick;
    let largestGap = 0;
    const identityFailures = [];
    const safetyFailures = [];
    const telemetry = {staleTicks: [], missingTicks: [], futureTicks: [], staleRoomMetricsTicks: [],
        missingRoomMetricsTicks: [], futureRoomMetricsTicks: []};
    const receipts = new Map();
    const conflictedReceipts = new Set();
    const startTick = samples[0]?.gameTime;
    const invalidReceiptTicks = new Set();

    for (const [index, sample] of samples.entries()) {
        const tick = sample?.gameTime;
        const mismatch = sample?.readOnly !== true || sample.shard !== expected.shard ||
            sample.roomName !== expected.roomName || sample.branch !== expected.branch ||
            sample.codeVersion !== expected.serviceVersion || sample.deployedServiceVersion !== expected.serviceVersion ||
            sample.deployedMainSha256 !== expected.mainSha256 || sample.expectedMainSha256 !== expected.mainSha256 ||
            sample.artifactMatches !== true || (expected.mapSha256 && sample.deployedMapSha256 !== expected.mapSha256) ||
            !Number.isSafeInteger(tick) || (lastTick !== undefined && tick <= lastTick);
        if (mismatch) identityFailures.push({index, tick: tick ?? null});
        if (Number.isSafeInteger(tick) && lastTick !== undefined) largestGap = Math.max(largestGap, tick - lastTick);
        if (Number.isSafeInteger(tick)) lastTick = tick;

        const proof = sample?.pilotProof;
        const differences = pilotControlDifferences({controls: proof?.controls, governorShadow: sample?.governorShadow,
            schedulerEnforce: sample?.schedulerEnforce}, expected.roomName);
        if (differences.length) safetyFailures.push({tick: tick ?? null, controls: differences});

        const telemetryTick = proof?.telemetryTick;
        if (!Number.isSafeInteger(telemetryTick)) telemetry.missingTicks.push(tick);
        else if (telemetryTick > tick) telemetry.futureTicks.push(tick);
        else if (tick - telemetryTick > 10) telemetry.staleTicks.push(tick);

        const roomTick = sample?.room?.capturedAt;
        if (!Number.isSafeInteger(roomTick) || sample.room.codeVersion !== expected.serviceVersion) telemetry.missingRoomMetricsTicks.push(tick);
        else if (roomTick > tick) telemetry.futureRoomMetricsTicks.push(tick);
        else if (tick - roomTick > 10) telemetry.staleRoomMetricsTicks.push(tick);

        for (const row of Array.isArray(proof?.receipts) ? proof.receipts : []) {
            if (!inspectReceipt(row, tick, expected.roomName)) {
                invalidReceiptTicks.add(tick);
                continue;
            }
            if (row.admittedAt < startTick || conflictedReceipts.has(row.requestId)) continue;
            const previous = receipts.get(row.requestId);
            if (previous && ['name', 'role', 'quotaKey', 'spawnName', 'cost', 'admittedAt', 'expireAt', 'observeUntil']
                .some(field => previous[field] !== row[field])) {
                invalidReceiptTicks.add(tick);
                conflictedReceipts.add(row.requestId);
                receipts.delete(row.requestId);
                continue;
            }
            receipts.set(row.requestId, row);
        }
    }

    const observedTicks = Number.isSafeInteger(startTick) && lastTick !== undefined ? lastTick - startTick : null;
    const windowComplete = observedTicks >= 10000 && identityFailures.length === 0 &&
        summary?.stopReason === 'window_reached_review_required' && summary.acceptancePassed === false &&
        summary.startTick === startTick && summary.lastTick === lastTick && summary.observedTicks === observedTicks &&
        summary.snapshots === samples.length;
    const spawnRows = [...receipts.values()];
    return {
        windowComplete,
        windowReadyForReview: windowComplete && safetyFailures.length === 0 &&
            invalidReceiptTicks.size === 0 && Object.values(telemetry).every(ticks => ticks.length === 0),
        acceptancePassed: false,
        startTick: startTick ?? null,
        lastTick: lastTick ?? null,
        observedTicks,
        sampleCount: samples.length,
        largestSampleGap: largestGap,
        identityFailures,
        safetyFailures,
        telemetry,
        invalidReceiptTicks: [...invalidReceiptTicks],
        spawnEvidence: {
            births: spawnRows.filter(row => row.state === 'born' && Number.isSafeInteger(row.bornAt)),
            observedSpawning: spawnRows.filter(row => Number.isSafeInteger(row.spawningSeenAt)),
            unresolved: spawnRows.filter(row => ['calling', 'unknown'].includes(row.state)),
            energyDeliveryProven: false
        }
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [samplesPath, terminalPath, expectedPath] = process.argv.slice(2);
    if (!samplesPath || !terminalPath || !expectedPath || process.argv.length !== 5) {
        throw new Error('Usage: node single-room-pilot-review.mjs observation.jsonl terminal.json expected.json');
    }
    const readJson = pathname => JSON.parse(fs.readFileSync(pathname, 'utf8'));
    const rows = fs.readFileSync(samplesPath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    const report = reviewPilotWindow(rows, readJson(terminalPath), readJson(expectedPath));
    console.log(JSON.stringify(report, null, 2));
    if (!report.windowReadyForReview) process.exitCode = 1;
}
