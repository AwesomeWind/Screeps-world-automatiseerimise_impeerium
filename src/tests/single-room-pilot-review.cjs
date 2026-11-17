const assert = require('node:assert/strict');
const {before, test} = require('node:test');

let projectPilotProof, reviewPilotWindow;
before(async () => {
    ({projectPilotProof, reviewPilotWindow} = await import('../../scripts/single-room-pilot-review.mjs'));
});

const expected = {shard: 'shard3', roomName: 'W49N41', branch: 'default', serviceVersion: '1794822129804',
    mainSha256: 'a'.repeat(64)};
const controls = {pilotRoom: 'W49N41', remoteMining: false, recon: false, economicTrial: false, nativeTrialOps: false,
    goalPlanning: false, market: false, homeEvidence: false, trialEvidence: false};
const receipt = {requestId: 'REQ_SPAWN_140_0', roomName: 'W49N41', role: 'hauler', name: 'hauler-a', quotaKey: 'hauler:W49N41:core',
    state: 'born', admittedAt: 140, callStartedAt: 140, result: 0, resultAt: 140, expireAt: 141,
    spawningSeenAt: 141, bornAt: 152, observeUntil: 162};

function sample(tick, rows = []) {
    return {schemaVersion: 1, readOnly: true, shard: expected.shard, roomName: expected.roomName,
        branch: expected.branch, gameTime: tick, deployedMainSha256: expected.mainSha256,
        expectedMainSha256: expected.mainSha256, artifactMatches: true, codeVersion: expected.serviceVersion,
        deployedServiceVersion: expected.serviceVersion, runtimeTick: tick, schedulerEnforce: false, governorShadow: true,
        pilotProof: {controls, telemetryTick: tick, receipts: rows},
        room: {capturedAt: tick, codeVersion: expected.serviceVersion, controllerTicksToDowngrade: 150000,
            controllerProgress: tick, energyAvailable: 100 + tick}
    };
}

function windowRows() {
    return Array.from({length: 201}, (_, index) => sample(100 + index * 50, index === 1 ? [
        {...receipt, state: 'spawning', bornAt: undefined}
    ] : []));
}
function summary(ticks = 10000) {
    return {startTick: 100, lastTick: 100 + ticks, observedTicks: ticks, snapshots: 201,
        stopReason: 'window_reached_review_required', acceptancePassed: false};
}

test('projection keeps only relevant bounded evidence fields and preserves unknown', () => {
    const memory = {empire: {control: {policy: {spawnIntake: {localReplacementPilotRoom: 'W49N41'}},
        telemetry: {updatedAt: 150}}, market: {enabled: false}, localSpawnReceipts: {a: {...receipt, state: 'unknown',
        result: undefined, nested: 'irrelevant'}, other: {...receipt, roomName: 'W50N41'}}}};
    const proof = projectPilotProof(memory, 'W49N41');
    assert.equal(proof.telemetryTick, 150);
    assert.equal(proof.controls.market, false);
    assert.equal(proof.controls.goalPlanning, null);
    assert.equal(proof.receipts.length, 1);
    assert.equal(proof.receipts[0].state, 'unknown');
    assert.equal(proof.receipts[0].result, null);
    assert.equal(Object.hasOwn(proof.receipts[0], 'nested'), false);
});

test('completed window remains subject to scenario review', () => {
    const report = reviewPilotWindow(windowRows(), summary(), expected);
    assert.equal(report.windowReadyForReview, true);
    assert.equal(report.acceptancePassed, false);
    assert.deepEqual(report.identityFailures, []);
    assert.equal(report.spawnEvidence.births.length, 0);
    assert.equal(report.spawnEvidence.observedSpawning.length, 1);
    assert.equal(report.spawnEvidence.energyDeliveryProven, false);
});

test('elapsed ticks cannot pass when a run failed or when a file splices timestamps or versions', () => {
    const samples = windowRows();
    assert.equal(reviewPilotWindow(samples, {...summary(), stopReason: 'fetch_failed'}, expected).windowReadyForReview, false);
    samples[20] = {...samples[20], codeVersion: 'old'};
    samples[32] = {...samples[32], gameTime: samples[31].gameTime};
    const report = reviewPilotWindow(samples, summary(), expected);
    assert.equal(report.windowReadyForReview, false);
    assert.deepEqual(report.identityFailures.map(entry => entry.index), [20, 32]);
});

test('stale, future and missing safety facts remain explicit coverage gaps', () => {
    const samples = windowRows();
    samples[1] = {...samples[1], pilotProof: {...samples[1].pilotProof, telemetryTick: 139}};
    samples[2] = {...samples[2], room: {...samples[2].room, capturedAt: 201}};
    samples[3] = {...samples[3], pilotProof: {...samples[3].pilotProof, controls: {...controls, recon: null}}};
    const report = reviewPilotWindow(samples, summary(), expected);
    assert.equal(report.windowReadyForReview, false);
    assert.deepEqual(report.telemetry.staleTicks, [150]);
    assert.deepEqual(report.telemetry.futureRoomMetricsTicks, [200]);
    assert.deepEqual(report.safetyFailures.map(entry => entry.tick), [250]);
});

test('older receipts and contradictory identity never count as current birth', () => {
    const rows = [
        sample(150, [{...receipt, state: 'spawning', bornAt: undefined}]),
        sample(153, [{...receipt, name: 'different-actor'}])
    ];
    assert.equal(reviewPilotWindow(rows, null, expected).spawnEvidence.births.length, 0);
    const current = [
        sample(140, [{...receipt, state: 'admitted', bornAt: undefined, spawningSeenAt: undefined}]),
        sample(153, [{...receipt, name: 'different-actor'}])
    ];
    assert.deepEqual(reviewPilotWindow(current, null, expected).invalidReceiptTicks, [153]);
});

test('pilot collector checks both module hashes at the start and the end over its real CLI', t => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const {spawnSync} = require('node:child_process');
    const {createHash} = require('node:crypto');
    const {pathToFileURL} = require('node:url');
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-pilot-collector-'));
    const dir = path.join(folder, 'scripts');
    fs.mkdirSync(dir);
    const localScripts = ['single-room-pilot-review.mjs', 'single-room-observation.mjs'];
    for (const file of localScripts) fs.copyFileSync(path.resolve(__dirname, '../../scripts', file), path.join(dir, file));
    const tokenPath = path.join(folder, '.secret.json');
    const mockPath = path.join(folder, 'mock.mjs');
    const outputDir = path.join(folder, 'output');
    fs.mkdirSync(outputDir);
    const rows = path.join(outputDir, 'observed.jsonl');
    t.after(() => {
        for (const target of [...localScripts.map(file => path.join(dir, file)), tokenPath, mockPath, rows, path.join(outputDir, 'drift.jsonl')]) {
            fs.rmSync(target, {force: true});
        }
        fs.rmdirSync(dir);
        fs.rmdirSync(outputDir);
        fs.rmdirSync(folder);
    });
    fs.writeFileSync(tokenPath, JSON.stringify({main: {hostname: 'screeps.com', token: 'test-only', branch: 'default'}}));
    const code = {main: "const SERVICE_VERSION = 'test-version';", 'main.js.map': 'test-map'};
    const proofMemory = {empire: {control: {policy: {
        spawnIntake: {localReplacementPilotRoom: 'W49N41'}, scheduler: {enforce: false}, roomGovernor: {shadow: true},
        remoteMining: {enabled: false, reconTrial: {enabled: false}, economicTrial: {enabled: false},
            nativeTrialOps: {enabled: false}, evidenceWindow: {enabled: false}},
        goalPlanning: {enabled: false}, homeEvidence: {enabled: false}
    }, telemetry: {codeVersion: 'test-version'}, metrics: {rooms: {W49N41: {codeVersion: 'test-version'}}}},
    market: {enabled: false}}};
    fs.writeFileSync(mockPath, [
        'const modules = ' + JSON.stringify(code) + ';',
        'const memory = ' + JSON.stringify(proofMemory) + ';',
        'let tick = 1000, codeReads = 0;',
        'globalThis.setTimeout = callback => { callback(); return 0; };',
        'globalThis.fetch = async (url, options) => {',
        '  if (options.method !== "GET") throw new Error("Unexpected mutation");',
        '  let value; const path = url.pathname;',
        '  if (path === "/api/user/code") { codeReads++; value = {modules: {...modules}};',
        '    if (process.env.TEST_END_MAP_DRIFT && codeReads === 2) value.modules["main.js.map"] = "changed"; }',
        '  else if (path === "/api/user/memory") {',
        '    memory.empire.control.telemetry.updatedAt = tick;',
        '    memory.empire.control.metrics.rooms.W49N41.capturedAt = tick;',
        '    value = {data: JSON.stringify(memory)};',
        '  } else if (path === "/api/game/time") { value = {time: tick}; tick += 25; }',
        '  else throw new Error("Unexpected endpoint");',
        '  return {ok: true, json: async () => ({ok: true, ...value})};',
        '};'
    ].join('\n'));
    const sha = value => createHash('sha256').update(value).digest('hex');
    const mainSha256 = sha(code.main);
    const mapSha256 = sha(code['main.js.map']);
    function collect(output, env) {
        return spawnSync(process.execPath, ['--import', pathToFileURL(mockPath).href, path.join(dir, localScripts[1]),
            '--target-ticks', '10000', '--output', path.join('output', output),
            '--expected-pilot-room', 'W49N41', '--expected-main-sha', mainSha256, '--expected-map-sha', mapSha256],
        {cwd: folder, env, encoding: 'utf8', timeout: 10000});
    }
    const run = collect('observed.jsonl', process.env);
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    const snapshots = fs.readFileSync(rows, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const reviewed = reviewPilotWindow(snapshots, result, {...expected, mainSha256, mapSha256, serviceVersion: 'test-version'});
    assert.equal(reviewed.windowReadyForReview, true);
    assert.equal(reviewed.acceptancePassed, false);
    assert.equal(snapshots.length, 401);
    assert.equal(snapshots.at(-1).gameTime, 11000);

    const drift = collect('drift.jsonl', {...process.env, TEST_END_MAP_DRIFT: '1'});
    assert.equal(drift.status, 0, drift.stderr);
    assert.equal(JSON.parse(drift.stdout).stopReason, 'end_deployment_fingerprint_mismatch');
});
