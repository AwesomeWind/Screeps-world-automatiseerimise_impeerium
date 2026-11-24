import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {verifySpawnSupply, validateLocalSpawnSupplyStore} from '../src/services/LocalSpawnSupplyProof.js';

export {verifySpawnSupply};


const CLOSED_FEATURES = ['remoteMining', 'recon', 'economicTrial', 'nativeTrialOps', 'goalPlanning',
    'market', 'homeEvidence', 'trialEvidence'];
const RECEIPT_FIELDS = ['requestId', 'roomName', 'quotaKey', 'role', 'name', 'spawnName', 'cost',
    'state', 'admittedAt', 'expireAt', 'observeUntil', 'callStartedAt', 'result', 'resultAt', 'spawningSeenAt', 'bornAt'];
const RECEIPT_IDENTITY = ['name', 'role', 'quotaKey', 'spawnName', 'cost', 'admittedAt', 'expireAt', 'observeUntil'];
const RECOVERY_MODES = new Set(['normal', 'miner_gap', 'hauler_gap', 'spawn_energy', 'reserve_low', 'support_required']);

function legacyRequestClosed(envelope, trials, empire, roomName, clock, kind) {
    const request = envelope?.request;
    const session = trials?.current;
    const identity = session?.identity;
    const tick = clock?.tick;
    const nowMs = clock?.nowMs;
    if (!request || !identity || request.schemaVersion !== 1 || typeof request.id !== 'string' || !request.id.length ||
        typeof identity.trialId !== 'string' || typeof request.remoteId !== 'string' || typeof request.codeVersion !== 'string' ||
        !Number.isSafeInteger(request.sequence) || !Number.isSafeInteger(request.epoch) ||
        !Number.isSafeInteger(request.activateAtTick) || !Number.isSafeInteger(request.issuedAtMs) ||
        request.activateAtTick >= request.expiresAtTick || request.issuedAtMs >= request.expiresAtMs ||
        !Number.isSafeInteger(tick) || !Number.isSafeInteger(nowMs) ||
        !Number.isSafeInteger(request.expiresAtTick) || !Number.isSafeInteger(request.expiresAtMs) ||
        tick <= request.expiresAtTick || nowMs <= request.expiresAtMs ||
        !Number.isSafeInteger(session.closeAppliedAtTick) || !Number.isSafeInteger(session.closureVerifiedAtTick) ||
        session.closureVerifiedAtTick <= session.closeAppliedAtTick || session.closureVerifiedAtTick > tick ||
        request.sequence !== trials.lastSequence || request.remoteId !== identity.remoteId ||
        request.epoch !== identity.epoch || request.codeVersion !== identity.codeVersion) return false;

    const target = identity.remoteId.startsWith(roomName + ':') ? identity.remoteId.split(':')[1] : null;
    const config = target && empire.remoteRooms?.[target];
    const operation = empire.remoteMining?.operations?.[identity.remoteId];
    if (empire.control?.policy?.remoteMining?.enabled !== false || config?.enabled !== false ||
        operation?.allowRecon !== false || operation?.allowEconomicDeparture !== false) return false;

    if (kind === 'recon') {
        return request.action === 'release' && request.targetTrialId === identity.trialId &&
            request.sequence === identity.sequence + 1 && ['completed', 'aborted'].includes(session.status) &&
            session.managed === false && session.scopeAllowsOutbound === false;
    }
    return request.action === 'start' && request.id === identity.trialId && request.sequence === identity.sequence &&
        session.status === 'terminal' && session.managed === true &&
        typeof request.configFingerprint === 'string' && request.configFingerprint === session.configFingerprint &&
        request.activateAtTick === session.startedAtTick &&
        request.issuedAtMs === session.issuedAtMs && request.expiresAtTick === session.expiresAtTick &&
        request.expiresAtMs === session.expiresAtMs && Number.isSafeInteger(session.tailExpiresAtTick) &&
        tick > session.tailExpiresAtTick;
}

export function projectPilotProof(memory, roomName, clock) {
    const empire = memory.empire;
    const control = empire?.control;
    const policy = control?.policy;
    const remote = policy?.remoteMining;
    const historicalRequests = {};
    function remotePermission(kind, envelope, trials) {
        if (envelope?.enabled !== true) return envelope?.enabled ?? null;
        const closed = legacyRequestClosed(envelope, trials, empire, roomName, clock, kind);
        historicalRequests[kind] = {enabled: true, id: envelope.request?.id ?? null, verifiedInactive: closed};
        return !closed;
    }
    const recon = remotePermission('recon', remote?.reconTrial, empire?.remoteMining?.reconTrials);
    const economicTrial = remotePermission('economicTrial', remote?.economicTrial, empire?.remoteMining?.economicTrials);
    const actualRemotePermission = Object.values(empire?.remoteRooms || {}).some(config => config?.enabled === true) ||
        Object.values(empire?.remoteMining?.operations || {}).some(operation =>
            operation?.allowRecon === true || operation?.allowEconomicDeparture === true);
    const receipts = Object.values(empire?.localSpawnReceipts || {})
        .filter(row => row?.roomName === roomName).slice(0, 200)
        .map(row => Object.fromEntries(RECEIPT_FIELDS.map(field => [field, row[field] ?? null])));
    const supply = empire?.observations?.localSpawnSupply;
    let supplyProjection = {};
    if (supply !== undefined && policy?.spawnIntake?.localReplacementPilotRoom === roomName) {
        if (validateLocalSpawnSupplyStore(supply)) {
            supplyProjection = {spawnSupply: supply.records.filter(row => row.roomName === roomName &&
                row.version === control?.telemetry?.codeVersion && row.frame.tick <= clock?.tick)};
        } else {
            supplyProjection = {spawnSupplyStatus: 'invalid_store'};
        }
    }
    return {
        telemetryTick: control?.telemetry?.updatedAt ?? null,
        controls: {
            pilotRoom: policy?.spawnIntake?.localReplacementPilotRoom ?? null,
            remoteMining: actualRemotePermission ? true : remote?.enabled ?? null,
            recon,
            economicTrial,
            nativeTrialOps: remote?.nativeTrialOps?.enabled ?? null,
            goalPlanning: policy?.goalPlanning?.enabled ?? null,
            market: empire?.market?.enabled ?? null,
            homeEvidence: policy?.homeEvidence?.enabled ?? null,
            trialEvidence: remote?.evidenceWindow?.enabled ?? null
        },
        historicalRequests,
        receipts,
        ...supplyProjection
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

function hasBoundPair(sample, runId, priorPoll) {
    if (runId === null || sample.schemaVersion !== 2 || sample.runId !== runId ||
        !Number.isSafeInteger(sample.pollId) || sample.pollId <= priorPoll) return false;
    const ids = [sample.pair?.memoryRequestId, sample.pair?.timeRequestId];
    const prefix = [runId, sample.pollId, ''].join('-');
    return ids[0] !== ids[1] && ids.every(id => typeof id === 'string' &&
        id.startsWith(prefix) && /^[1-9][0-9]*$/.test(id.slice(prefix.length)));
}

export function reviewSpawnSupply(evidence, {births,runId,startTick,lastTick,expected}) {
    const byRequest=new Map(births.map(row=>[row.requestId,row]));
    const deliveries=new Map();
    const conflicts=new Set(), gaps=[];
    for (const [index,row] of evidence.entries()) {
        if (row?.unreadable) {
            gaps.push({index,reason:'unreadable_probe'});
            continue;
        }
        const release=row?.release, frame=row?.frame;
        if (runId===null || row?.schemaVersion!==1 || row.runId!==runId || row.room!==expected.roomName ||
            release?.roomName!==expected.roomName || release?.shard!==expected.shard || release?.branch!==expected.branch ||
            release?.version!==expected.serviceVersion || release.mainSha256!==expected.mainSha256 ||
            !expected.mapSha256 || release.mapSha256!==expected.mapSha256 ||
            frame?.version!==expected.serviceVersion || frame?.shard!==expected.shard) {
            gaps.push({index,reason:'probe_identity_mismatch'});
            continue;
        }
        const birth=byRequest.get(row.requestId);
        if (!birth || birth.name!==row.name || birth.role!==frame.actor?.role) {
            gaps.push({index,reason:'matching_birth_missing'});
            continue;
        }
        const proof=verifySpawnSupply(frame);
        if (!proof || proof.actionTick<birth.bornAt || proof.actionTick<startTick || proof.tick>lastTick) {
            gaps.push({index,reason:'next_tick_supply_unproved'});
            continue;
        }
        const key=row.requestId+':'+proof.actionTick;
        if (conflicts.has(key)) continue;
        const prior=deliveries.get(key);
        if (prior && ['actorId','spawnId','amount'].some(field=>prior[field]!==proof[field])) {
            deliveries.delete(key);
            conflicts.add(key);
            gaps.push({index,reason:'conflicting_supply_probe'});
            continue;
        }
        deliveries.set(key,{requestId:row.requestId,name:row.name,...proof});
    }
    return {deliveries:[...deliveries.values()],gaps};
}

export function readPilotSupplyEvidence(directory) {
    return fs.readdirSync(directory,{withFileTypes:true})
        .filter(entry=>entry.isFile() && /^supply-\d+-result\.json$/.test(entry.name))
        .map(entry=>{
            try { return JSON.parse(fs.readFileSync(new URL(entry.name,directory),'utf8')); }
            catch { return {unreadable:true}; }
        });
}

function collectSavedSupply(proof, tick, startTick, expected, records, conflicts, gaps) {
    if (proof?.spawnSupplyStatus === 'invalid_store' || proof?.spawnSupply !== undefined &&
        !validateLocalSpawnSupplyStore({schemaVersion: 1, records: proof.spawnSupply})) {
        gaps.push({tick, reason: 'invalid_supply_store'});
        return;
    }
    for (const row of proof?.spawnSupply ?? []) {
        if (row.birth.admittedAt < startTick) continue;
        if (row.frame.tick > tick || row.roomName !== expected.roomName || row.shard !== expected.shard ||
            row.version !== expected.serviceVersion) {
            gaps.push({tick, reason: 'saved_supply_identity_mismatch'});
            continue;
        }
        const key = row.birth.requestId;
        if (conflicts.has(key)) continue;
        if (records.has(key) && !isDeepStrictEqual(records.get(key), row)) {
            records.delete(key);
            conflicts.add(key);
            gaps.push({tick, reason: 'conflicting_saved_supply'});
        } else {
            records.set(key, row);
        }
    }
}

export function reviewPilotWindow(samples, summary, expected, supplyEvidence = []) {
    if (!Array.isArray(samples)) throw new Error('Expected observation rows');
    if (!/^[a-f0-9]{64}$/.test(expected.mainSha256) ||
        typeof expected.serviceVersion !== 'string' || !expected.serviceVersion.length ||
        !expected.branch || !expected.shard || !expected.roomName) throw new Error('Expected release identity is incomplete');
    let lastTick;
    let lastPoll = 0;
    const runId = typeof summary?.runId === 'string' && summary.runId.length ? summary.runId : null;
    let largestGap = 0;
    const identityFailures = [];
    const safetyFailures = [];
    const telemetry = {staleTicks: [], missingTicks: [], futureTicks: [], staleRoomMetricsTicks: [],
        missingRoomMetricsTicks: [], futureRoomMetricsTicks: []};
    const receipts = new Map();
    const conflictedReceipts = new Set();
    const savedSupply = new Map();
    const conflictingSupply = new Set();
    const supplyGaps = [];
    const recoveryModes = new Set();
    const startTick = samples[0]?.gameTime;
    const invalidReceiptTicks = new Set();

    for (const [index, sample] of samples.entries()) {
        const tick = sample?.gameTime;
        const mismatch = sample?.readOnly !== true || sample.shard !== expected.shard ||
            sample.roomName !== expected.roomName || sample.branch !== expected.branch ||
            sample.codeVersion !== expected.serviceVersion || sample.deployedServiceVersion !== expected.serviceVersion ||
            sample.deployedMainSha256 !== expected.mainSha256 || sample.expectedMainSha256 !== expected.mainSha256 ||
            sample.artifactMatches !== true || (expected.mapSha256 && sample.deployedMapSha256 !== expected.mapSha256) ||
            !Number.isSafeInteger(tick) || (lastTick !== undefined && tick <= lastTick) ||
            ((runId !== null || sample.schemaVersion === 2) && !hasBoundPair(sample, runId, lastPoll));
        if (Number.isSafeInteger(sample?.pollId)) lastPoll = Math.max(lastPoll, sample.pollId);
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

        const freshRoom = Number.isSafeInteger(roomTick) && sample.room.codeVersion === expected.serviceVersion &&
            roomTick <= tick && tick - roomTick <= 10;
        if (!mismatch && differences.length === 0 && freshRoom &&
            Number.isSafeInteger(telemetryTick) && telemetryTick <= tick && tick - telemetryTick <= 10) {
            const mode = sample.room.recovery?.mode;
            if (roomTick >= startTick && RECOVERY_MODES.has(mode)) recoveryModes.add(mode);
            if (expected.mapSha256) {
                collectSavedSupply(proof, tick, startTick, expected, savedSupply, conflictingSupply, supplyGaps);
            }
        }

        for (const row of Array.isArray(proof?.receipts) ? proof.receipts : []) {
            if (!inspectReceipt(row, tick, expected.roomName)) {
                invalidReceiptTicks.add(tick);
                continue;
            }
            if (row.admittedAt < startTick || conflictedReceipts.has(row.requestId)) continue;
            const previous = receipts.get(row.requestId);
            if (previous && RECEIPT_IDENTITY
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
    const windowComplete = runId !== null && observedTicks >= 10000 && identityFailures.length === 0 &&
        summary?.stopReason === 'window_reached_review_required' && summary.acceptancePassed === false &&
        summary.startTick === startTick && summary.lastTick === lastTick && summary.observedTicks === observedTicks &&
        summary.snapshots === samples.length;
    const boundRunId = identityFailures.length || safetyFailures.length ? null : runId;
    const savedEvidence = [];
    if (boundRunId !== null) {
        for (const [requestId, row] of savedSupply) {
            const known = receipts.get(requestId);
            if (conflictedReceipts.has(requestId) || known &&
                (RECEIPT_IDENTITY.some(field => known[field] !== row.birth[field]) ||
                    ['not_called', 'failed'].includes(known.state) ||
                    known.state === 'born' && known.bornAt !== row.birth.bornAt)) {
                supplyGaps.push({tick: row.frame.tick, reason: 'saved_supply_birth_conflict'});
                conflictingSupply.add(requestId);
                continue;
            }
            if (!known || known.state !== 'born') receipts.set(requestId, {...known, ...row.birth});
            savedEvidence.push({schemaVersion: 1, runId: boundRunId, room: row.roomName,
                requestId, name: row.birth.name, release: {...expected, version: row.version},
                frame: {...row.frame, version: row.version, shard: row.shard}});
        }
    }
    const spawnRows = [...receipts.values()];
    const births=spawnRows.filter(row=>row.state==='born'&&Number.isSafeInteger(row.bornAt));
    const supply = reviewSpawnSupply([...supplyEvidence, ...savedEvidence]
        .filter(row => !conflictingSupply.has(row?.requestId)), {births, runId: boundRunId, startTick, lastTick, expected});
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
            births,
            recoveryModesObserved: [...recoveryModes],
            observedSpawning: spawnRows.filter(row => Number.isSafeInteger(row.spawningSeenAt)),
            unresolved: spawnRows.filter(row => ['calling', 'unknown'].includes(row.state)),
            energyDeliveryProven: supply.deliveries.length>0,
            energyDeliveries: supply.deliveries,
            energyEvidenceGaps: [...supplyGaps, ...supply.gaps]
        }
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [samplesPath, terminalPath, expectedPath, supplyDirectory] = process.argv.slice(2);
    if (!samplesPath || !terminalPath || !expectedPath || process.argv.length > 6) {
        throw new Error('Usage: node single-room-pilot-review.mjs observation.jsonl terminal.json expected.json [supply-directory]');
    }
    const readJson = pathname => JSON.parse(fs.readFileSync(pathname, 'utf8'));
    const rows = fs.readFileSync(samplesPath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    const supply = supplyDirectory ? readPilotSupplyEvidence(pathToFileURL(path.resolve(supplyDirectory)+path.sep)) : [];
    const report = reviewPilotWindow(rows, readJson(terminalPath), readJson(expectedPath), supply);
    console.log(JSON.stringify(report, null, 2));
    if (!report.windowReadyForReview) process.exitCode = 1;
}
