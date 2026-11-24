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
    return {schemaVersion: 2, runId: 'run-a', pollId: tick,
        pair:{memoryRequestId:'run-a-'+tick+'-1',timeRequestId:'run-a-'+tick+'-2'},
        readOnly: true, shard: expected.shard, roomName: expected.roomName,
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
    return {runId: 'run-a', startTick: 100, lastTick: 100 + ticks, observedTicks: ticks, snapshots: 201,
        stopReason: 'window_reached_review_required', acceptancePassed: false};
}

const collectorScripts = ['single-room-observation.mjs', 'single-room-pilot-review.mjs'];

function copyCollectorScripts(folder, scripts) {
    const fs = require('node:fs');
    const path = require('node:path');
    for (const name of collectorScripts) {
        fs.copyFileSync(path.resolve(__dirname, '../../scripts', name), path.join(scripts, name));
    }
    const relative = 'src/services/LocalSpawnSupplyProof.js';
    const target = path.join(folder, relative);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(path.resolve(__dirname, '../..', relative), target);
    return () => {
        fs.rmSync(target);
        fs.rmdirSync(path.dirname(target));
        fs.rmdirSync(path.join(folder, 'src'));
    };
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
    const removeProofModule = copyCollectorScripts(folder, dir);
    const tokenPath = path.join(folder, '.secret.json');
    const mockPath = path.join(folder, 'mock.mjs');
    const outputDir = path.join(folder, 'output');
    fs.mkdirSync(outputDir);
    const rows = path.join(outputDir, 'observed.jsonl');
    t.after(() => {
        removeProofModule();
        for (const target of [...collectorScripts.map(file => path.join(dir, file)), tokenPath, mockPath, rows, rows + '.requests.jsonl', path.join(outputDir, 'drift.jsonl'), path.join(outputDir, 'drift.jsonl.requests.jsonl')]) {
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
        'const realSetTimeout = globalThis.setTimeout;',
        'globalThis.setTimeout = (callback, delay) => delay === 30000 ? (callback(),0) : realSetTimeout(callback, delay);',
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
        return spawnSync(process.execPath, ['--import', pathToFileURL(mockPath).href, path.join(dir, collectorScripts[0]),
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

test('collector can use an explicit read-only transport without a worktree secret', (t) => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const {spawnSync} = require('node:child_process');
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-pilot-transport-'));
    const scripts = path.join(folder, 'scripts');
    const data = path.join(folder, 'data');
    fs.mkdirSync(scripts);
    fs.mkdirSync(data);
    const removeProofModule = copyCollectorScripts(folder, scripts);
    const transport = path.join(folder, 'transport.mjs');
    fs.writeFileSync(transport, [
        'export async function createObservationTransport(target) {',
        '    if (target.shard !== "shard3" || target.roomName !== "W49N41") throw Error("wrong target");',
        '    return {branch: "default",',
        '        async get(endpoint) {',
        '            if (endpoint === "/api/user/code?branch=default") return {modules:{main:"const SERVICE_VERSION = \'proof\';"}};',
        '            if (endpoint === "/api/user/memory?shard=shard3") return {data: JSON.stringify({empire:{control:{telemetry:{codeVersion:"proof"}}}})};',
        '            if (endpoint === "/api/game/time?shard=shard3") return {time: 84313711};',
        '            throw Error("unexpected request");',
        '        }, close() {console.error("transport disposed");}};',
        '}'
    ].join('\n'));
    t.after(() => {
        removeProofModule();
        for (const file of [...collectorScripts.map(name => path.join(scripts, name)), transport, path.join(data, 'snapshot.jsonl'), path.join(data, 'snapshot.jsonl.requests.jsonl')]) {
            fs.rmSync(file, {force: true});
        }
        fs.rmdirSync(scripts);
        fs.rmdirSync(data);
        fs.rmdirSync(folder);
    });
    const run = spawnSync(process.execPath, [path.join(scripts, collectorScripts[0]), '--transport-module', 'transport.mjs',
        '--output', path.join('data', 'snapshot.jsonl')], {cwd: folder, encoding: 'utf8', timeout: 10000});
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).startTick, 84313711);
    assert.match(run.stderr, /transport disposed/);
});

const retainedClock = {tick: 84313981, nowMs: 1794879000000};
function retainedClosedFrame() {
    const sealed = require('./fixtures/native-successor-10-closed.json');
    return {empire: {
        control: {policy: {remoteMining: {
            enabled: false, economicTrial: structuredClone(sealed.economicSettings),
            reconTrial: {enabled: true, request: {schemaVersion: 1, action: 'release', id: 'econ-release-6',
                targetTrialId: 'w48-20261021-01', sequence: 6, remoteId: 'W49N41:W48N41', epoch: 1,
                codeVersion: '1792555927985', activateAtTick: 83781309, issuedAtMs: 1792571575599,
                expiresAtTick: 83781609, expiresAtMs: 1792572775599}}
        }}},
        remoteRooms: {W48N41: {enabled: false, hold: true}},
        remoteMining: {
            operations: {'W49N41:W48N41': {status: 'disabled', allowRecon: false, allowEconomicDeparture: false}},
            reconTrials: {lastSequence: 6, current: {
                identity: {trialId: 'w48-20261021-01', sequence: 5, remoteId: 'W49N41:W48N41', epoch: 1, codeVersion: '1792555927985'},
                status: 'completed', managed: false, scopeAllowsOutbound: false,
                closeAppliedAtTick: 83778708, closureVerifiedAtTick: 83778709}},
            economicTrials: structuredClone(sealed.economic)
        }
    }};
}

test('real retained envelopes are closed only with expiry, matched terminal proofs and actual closed scopes', () => {
    const input = retainedClosedFrame();
    const proof = projectPilotProof(input, 'W49N41', retainedClock);
    assert.equal(proof.controls.recon, false);
    assert.equal(proof.controls.economicTrial, false);
    assert.equal(proof.historicalRequests.recon.enabled, true);
    assert.equal(proof.historicalRequests.economicTrial.enabled, true);
    assert.equal(input.empire.control.policy.remoteMining.reconTrial.enabled, true);
});

test('an open operation, bad identity, active window or missing shutdown proof still fails closed', () => {
    const changes = [
        [data => data.remoteMining.operations['W49N41:W48N41'].allowEconomicDeparture = true, 'economicTrial'],
        [data => data.remoteMining.economicTrials.current.identity.epoch++, 'economicTrial'],
        [data => data.control.policy.remoteMining.economicTrial.request.expiresAtTick = retainedClock.tick, 'economicTrial'],
        [data => data.control.policy.remoteMining.reconTrial.request.expiresAtMs = retainedClock.nowMs, 'recon'],
        [data => delete data.remoteMining.reconTrials.current.closureVerifiedAtTick, 'recon'],
        [data => delete data.remoteMining.operations['W49N41:W48N41'], 'recon'],
        [data => data.remoteRooms.W48N41.enabled = true, 'recon']
    ];
    for (const [edit, flag] of changes) {
        const memory = retainedClosedFrame();
        edit(memory.empire);
        assert.equal(projectPilotProof(memory, 'W49N41', retainedClock).controls[flag], true);
    }
    const noClock = projectPilotProof(retainedClosedFrame(), 'W49N41');
    assert.equal(noClock.controls.recon, true);
    assert.equal(noClock.controls.economicTrial, true);
});

function runInstrumentedCollector(t, fixture, args = []) {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const {spawnSync} = require('node:child_process');
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-pilot-evidence-'));
    const scripts = path.join(folder, 'scripts');
    const data = path.join(folder, 'data');
    fs.mkdirSync(scripts);
    fs.mkdirSync(data);
    const removeProofModule = copyCollectorScripts(folder, scripts);
    fs.writeFileSync(path.join(folder, 'transport.mjs'), fixture);
    t.after(() => {
        removeProofModule();
        for (const directory of [data, scripts, folder]) {
            for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
                if (entry.isFile()) fs.rmSync(path.join(directory, entry.name));
            }
            fs.rmdirSync(directory);
        }
    });
    const output = path.join(data, 'samples.jsonl');
    const run = spawnSync(process.execPath, [path.join(scripts, 'single-room-observation.mjs'),
        '--transport-module', 'transport.mjs', '--output', path.relative(folder, output), ...args],
    {cwd: folder, encoding: 'utf8', timeout: 10000});
    return {run, output, fs, folder};
}

test('collector correlates individual reads and saves first failure in its terminal output', t => {
    const {run, output, fs} = runInstrumentedCollector(t, [
        'export function createObservationTransport({recordRequest}) {',
        '  return {branch:"default", async get(endpoint,{requestId,pollId}) {',
        '    recordRequest({requestId,pollId,event:"fixture_response"});',
        '    if(endpoint.startsWith("/api/user/code"))return {modules:{main:"const SERVICE_VERSION = \'proof\';"}};',
        '    if(endpoint.startsWith("/api/user/memory"))throw Object.assign(Error("fixture reset"),{code:"ECONNRESET"});',
        '    return {time:84313711};',
        '  }};',
        '}'
    ].join('\n'));
    assert.equal(run.status, 1);
    assert.match(run.stderr, /ECONNRESET/);
    const terminal = JSON.parse(run.stdout);
    const events = fs.readFileSync(output + '.requests.jsonl', 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const started = events.filter(entry => entry.event === 'read_started');
    assert.equal(new Set(started.map(entry => entry.requestId)).size, 3);
    assert.ok(started.every(entry => entry.runId === terminal.runId));
    const sampling = started.filter(entry => entry.pollId === 1);
    assert.equal(sampling.length, 2);
    assert.equal(terminal.primaryFailure.requestId, sampling.find(entry => entry.endpoint.includes('/memory')).requestId);
    assert.equal(terminal.primaryFailure.code, 'ECONNRESET');
    assert.equal(terminal.snapshots, 0);
});

test('a first failed read cancels its sibling without waiting for the sibling or cleanup timeout', t => {
    const {run, output, fs} = runInstrumentedCollector(t, [
        'export function createObservationTransport() {',
        '  return {branch:"default", async get(endpoint, {signal}) {',
        '    if(endpoint.startsWith("/api/user/code"))return {modules:{main:"const SERVICE_VERSION = \'proof\';"}};',
        '    if(endpoint.startsWith("/api/user/memory"))throw Object.assign(Error("reset"),{code:"ECONNRESET"});',
        '    return new Promise((_, reject) => {',
        '      const hold = setInterval(()=>{},1000);',
        '      signal?.addEventListener("abort",()=>{clearInterval(hold);reject(Object.assign(Error("late cancellation"),{code:"ERR_CANCELED",observation:{abortSource:"sibling_after_failure"}}));},{once:true});',
        '    });',
        '  }, close:()=>new Promise(()=>{})};',
        '}'
    ].join('\n'));
    assert.equal(run.error, undefined);
    assert.equal(run.status, 1);
    const terminal = JSON.parse(run.stdout);
    assert.equal(terminal.primaryFailure.code, 'ECONNRESET');
    const events = fs.readFileSync(output + '.requests.jsonl', 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const sibling = events.find(entry => entry.event === 'read_failed' && entry.endpoint.includes('/game/time'));
    assert.equal(sibling.code, 'ERR_CANCELED');
    assert.equal(sibling.abortSource, 'sibling_after_failure');
    assert.equal(sibling.causeRequestId, terminal.primaryFailure.requestId);
    assert.equal(terminal.snapshots, 0);
});

test('an independent timeout in the second read retains its own source after the first failure', t => {
    const {run, output, fs} = runInstrumentedCollector(t, [
        'export function createObservationTransport() {',
        '    return {branch:"default", async get(endpoint) {',
        '        if(endpoint.startsWith("/api/user/code"))return {modules:{main:"const SERVICE_VERSION = \'proof\';"}};',
        '        if(endpoint.startsWith("/api/user/memory"))throw Object.assign(Error("reset"),{code:"ECONNRESET"});',
        '        throw Object.assign(Error("own timeout"),{code:"ERR_CANCELED", observation:{abortSource:"request_deadline"}});',
        '    }};',
        '}'
    ].join('\n'));
    assert.equal(run.status,1);
    const rows=fs.readFileSync(output+'.requests.jsonl','utf8').trim().split('\n').map(line=>JSON.parse(line));
    const other=rows.find(row=>row.event==='read_failed' && row.endpoint.includes('/game/time'));
    assert.equal(other.abortSource,'request_deadline');
    assert.equal(other.causeRequestId,null);
});

test('a window cannot combine samples from two runs of the same version', () => {
    const rows = windowRows().map((row,index)=>{
        const runId=index<100?'run-a':'run-b', pollId=index+1;
        const prefix=[runId,pollId,''].join('-');
        return {...row,runId,pollId,pair:{memoryRequestId:prefix+'1',timeRequestId:prefix+'2'}};
    });
    const result = reviewPilotWindow(rows,{...summary(),runId:'run-a'},expected);
    assert.equal(result.windowComplete,false);
    assert.equal(result.windowReadyForReview,false);
    assert.equal(result.identityFailures[0].index,100);
});

test('successful but time-inconsistent pairs cannot add a sample to a pilot window', t => {
    const {createHash} = require('node:crypto');
    const main = "const SERVICE_VERSION = 'proof';";
    const hash = value => createHash('sha256').update(value).digest('hex');
    const fixture = [
        'const real=setTimeout;globalThis.setTimeout=(fn,ms)=>ms===30000?(fn(),0):real(fn,ms);',
        'export function createObservationTransport() {',
        '    let tick=100;',
        '    return {branch:"default",async get(endpoint) {',
        '        if(endpoint.startsWith("/api/user/code"))return {modules:{main:'+JSON.stringify(main)+',"main.js.map":"map"}};',
        '        if(endpoint.startsWith("/api/game/time")){const time=tick;tick+=25;return {time};}',
        '        const proof={empire:{control:{policy:{spawnIntake:{localReplacementPilotRoom:"W49N41"},',
        '          remoteMining:{enabled:false,reconTrial:{enabled:false},economicTrial:{enabled:false},nativeTrialOps:{enabled:false},',
        '            evidenceWindow:{enabled:false}},goalPlanning:{enabled:false},homeEvidence:{enabled:false},',
        '          roomGovernor:{shadow:true},scheduler:{enforce:false}},',
        '          telemetry:{codeVersion:"proof",updatedAt:100},',
        '          metrics:{rooms:{W49N41:{codeVersion:"proof",capturedAt:100}}}},market:{enabled:false}}};',
        '        return {data:JSON.stringify(proof)};',
        '    }};',
        '}'
    ].join('\n');
    const {run, output, fs} = runInstrumentedCollector(t,fixture,['--target-ticks','10000',
        '--expected-pilot-room','W49N41','--expected-main-sha',hash(main),'--expected-map-sha',hash('map')]);
    const terminal=JSON.parse(run.stdout);
    assert.equal(run.status,1);
    assert.equal(terminal.stopReason,'sample_pair_inconsistent');
    assert.equal(terminal.lastTick,100);
    assert.equal(terminal.snapshots,1);
    const only=JSON.parse(fs.readFileSync(output,'utf8').trim());
    assert.equal(only.runId,terminal.runId);
    assert.equal(only.pollId,1);
    assert.notEqual(only.pair.memoryRequestId,only.pair.timeRequestId);

    const versionMismatch = fixture.replace('tick+=25','tick+=5')
        .replace('W49N41:{codeVersion:"proof",capturedAt:100}', 'W49N41:{codeVersion:tick===100?"proof":"previous",capturedAt:100}');
    const mismatched = runInstrumentedCollector(t,versionMismatch,['--target-ticks','10000',
        '--expected-pilot-room','W49N41','--expected-main-sha',hash(main),'--expected-map-sha',hash('map')]);
    const mismatchTerminal = JSON.parse(mismatched.run.stdout);
    assert.equal(mismatchTerminal.stopReason,'sample_pair_inconsistent');
    assert.equal(mismatchTerminal.snapshots,1);
    assert.equal(mismatchTerminal.lastTick,100);
});

function runOrderedPilotFixture(t, frames, {closed = false, extraArgs = []} = {}) {
    const {createHash} = require('node:crypto');
    const version = '1794822619406';
    const main = "const SERVICE_VERSION = '" + version + "';";
    const hash = value => createHash('sha256').update(value).digest('hex');
    const fixture = [
        'const real=setTimeout;globalThis.setTimeout=(fn,ms)=>ms===30000?(fn(),0):real(fn,ms);',
        'const frames=' + JSON.stringify(frames) + ';',
        'export function createObservationTransport() {',
        '    let index=-1, memoryFinished=false;',
        '    return {branch:"default",async get(endpoint) {',
        '        if(endpoint.startsWith("/api/user/code"))return {modules:{main:'+JSON.stringify(main)+',"main.js.map":"map"}};',
        '        if(endpoint.startsWith("/api/game/time")) {',
        '            const clock=frames[index];',
        '            if(clock?.clockError)throw Object.assign(Error("clock failed"),{code:clock.clockError});',
        '            return {time:memoryFinished?clock?.clock:(clock?.earlyClock??clock?.clock)};',
        '        }',
        '        const frame=frames[++index]; memoryFinished=false;',
        '        if(!frame||frame.memoryError)throw Object.assign(Error("memory failed"),{code:frame?.memoryError??"FIXTURE_FINISHED"});',
        '        await new Promise(resolve=>setImmediate(resolve));',
        '        memoryFinished=true;',
        '        if(frame.badJson)return {data:"{invalid"};',
        '        const policy={spawnIntake:{localReplacementPilotRoom:Object.hasOwn(frame,"pilotSelector")?frame.pilotSelector:"W49N41"},',
        '          remoteMining:{enabled:false,reconTrial:{enabled:false},economicTrial:{enabled:false},nativeTrialOps:{enabled:false},',
        '          evidenceWindow:{enabled:false}}, goalPlanning:{enabled:false},homeEvidence:{enabled:false},',
        '          roomGovernor:{shadow:true},scheduler:{enforce:false}};',
        '        const control={policy, telemetry:{updatedAt:frame.telemetryTick,codeVersion:frame.version??"1794822619406"},',
        '          metrics:{rooms:{W49N41:{capturedAt:frame.roomTick,codeVersion:frame.roomVersion??"1794822619406"}}}};',
        '        return {data:JSON.stringify({empire:{control,market:{enabled:false}}})};',
        '    }};',
        '}'
    ].join('\n');
    const mode = closed ? ['--verify-closed-pilot-room','W49N41'] : ['--target-ticks','10000','--expected-pilot-room','W49N41'];
    const {run, output, fs} = runInstrumentedCollector(t,fixture,[...mode,
        '--expected-main-sha',hash(main),'--expected-map-sha',hash('map'),...extraArgs]);
    assert.equal(run.error,undefined);
    const readRows = path => fs.readFileSync(path,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
    return {status:run.status,terminal:JSON.parse(run.stdout),samples:readRows(output),events:readRows(output+'.requests.jsonl')};
}

test('pilot reads Memory to completion before starting the clock on the poll 151 values', t => {
    const result = runOrderedPilotFixture(t,[
        {telemetryTick:84317932,roomTick:84317930,clock:84317932},
        {telemetryTick:84317932,roomTick:84317940,earlyClock:84317939,clock:84317940}
    ]);
    assert.deepEqual(result.samples.map(row=>row.gameTime),[84317932,84317940]);
    const second = result.events.filter(row=>row.pollId===2);
    const completed = second.findIndex(row=>row.event==='read_complete' && row.endpoint.includes('/memory'));
    const clockStarted = second.findIndex(row=>row.event==='read_started' && row.endpoint.includes('/game/time'));
    assert.ok(completed>=0 && completed<clockStarted);
    assert.equal(second.filter(row=>row.event==='read_started').length,2);
    assert.equal(result.terminal.lastTick,84317940);
});

test('pilot never launches the clock after an invalid or failed Memory read', t => {
    for(const frame of [{memoryError:'ECONNRESET'}, {badJson:true,clock:84317940}, {roomTick:84317940,clock:84317940}]){
        const result=runOrderedPilotFixture(t,[frame]);
        assert.equal(result.samples.length,0);
        assert.equal(result.events.filter(row=>row.event==='read_started' && row.endpoint.includes('/game/time')).length,0);
    }
});

test('ordered pilot pairs still reject future, stale, regressed or failed clocks', t => {
    const good={telemetryTick:84317932,roomTick:84317930,clock:84317932};
    const cases=[
        [{telemetryTick:84317932,roomTick:84317940,clock:84317939},'sample_pair_inconsistent'],
        [{telemetryTick:84317932,roomTick:84317940,clock:84317943},'sample_pair_inconsistent'],
        [{telemetryTick:84317931,roomTick:84317930,clock:84317931},'world_clock_regressed'],
        [{telemetryTick:84317932,roomTick:84317940,clockError:'ERR_CANCELED'},'read_failed']
    ];
    for(const [frame,stopReason] of cases){
        const result=runOrderedPilotFixture(t,[good,frame]);
        assert.equal(result.terminal.stopReason,stopReason);
        assert.equal(result.terminal.lastTick,84317932);
        assert.deepEqual(result.samples.map(row=>row.gameTime),[84317932]);
    }
    const atTen=runOrderedPilotFixture(t,[good,{telemetryTick:84317932,roomTick:84317940,clock:84317942}]);
    assert.deepEqual(atTen.samples.map(row=>row.gameTime),[84317932,84317942]);
});

test('closed pilot verification runs the ordered path for exactly one fresh pair', t => {
    const result=runOrderedPilotFixture(t,[
        {telemetryTick:84317932,roomTick:84317940,earlyClock:84317939,clock:84317940,pilotSelector:null}
    ],{closed:true});
    assert.equal(result.terminal.stopReason,'closed_pilot_snapshot');
    assert.equal(result.terminal.snapshots,1);
    assert.equal(result.terminal.observedTicks,0);
    assert.equal(result.terminal.acceptancePassed,false);
    assert.equal(result.samples[0].gameTime,84317940);
    assert.equal(result.samples[0].pilotProof.controls.pilotRoom,null);
    const pair=result.events.filter(row=>row.pollId===1);
    const starts=pair.filter(row=>row.event==='read_started');
    assert.equal(starts.length,2);
    assert.ok(pair.findIndex(row=>row.event==='read_complete'&&row.endpoint.includes('/memory')) <
        pair.findIndex(row=>row.event==='read_started'&&row.endpoint.includes('/game/time')));
});

test('closed pilot verification fails with no sample on opened selection or a bad fingerprint', t => {
    const frame={telemetryTick:84317932,roomTick:84317940,clock:84317940,pilotSelector:'W49N41'};
    const opened=runOrderedPilotFixture(t,[frame],{closed:true});
    assert.equal(opened.terminal.stopReason,'pilot_controls_missing_or_changed');
    assert.equal(opened.samples.length,0);
    const badHash=runOrderedPilotFixture(t,[{...frame,pilotSelector:null}],{
        closed:true,extraArgs:['--expected-main-sha','f'.repeat(64)]});
    assert.equal(badHash.terminal.stopReason,'read_failed');
    assert.equal(badHash.samples.length,0);
    assert.equal(badHash.events.filter(row=>row.pollId===1&&row.event==='read_started').length,0);
});

test('the ordered closed verification rejects a conflicting active window before issuing reads', t => {
    const result=runOrderedPilotFixture(t,[],{closed:true,extraArgs:['--expected-pilot-room','W49N41','--target-ticks','10000']});
    assert.equal(result.terminal.snapshots,0);
    assert.equal(result.events.filter(row=>row.event==='read_started').length,0);
});

test('a closed pilot snapshot reports changed runtime version as a failed command', t => {
    const result=runOrderedPilotFixture(t,[
        {telemetryTick:84317932,roomTick:84317940,clock:84317940,pilotSelector:null,version:'previous',roomVersion:'previous'}
    ],{closed:true});
    assert.equal(result.terminal.stopReason,'version_missing_or_changed');
    assert.equal(result.samples.length,0);
    assert.equal(result.status,1);
});

function persistedSupplySamples() {
    const {supplyRecord} = require('./helpers/local-spawn-supply-data.cjs');
    const persisted = supplyRecord();
    persisted.version = expected.serviceVersion;
    const release = {...expected, mapSha256: 'b'.repeat(64)};
    const frames = [sample(2000), sample(2030)];
    for (const row of frames) {
        row.deployedMapSha256 = release.mapSha256;
        row.room.recovery = {mode: 'normal'};
    }
    frames[1].pilotProof.spawnSupply = [persisted];
    return {persisted, frames, release, terminal: {runId: 'run-a', stopReason: 'read_failed'}};
}

test('persisted_supply_arrives_after_birth_receipt_expired', () => {
    const {persisted, frames, release, terminal} = persistedSupplySamples();
    const memory = {empire: {
        control: {policy: {spawnIntake: {localReplacementPilotRoom: expected.roomName}},
            telemetry: {codeVersion: expected.serviceVersion, updatedAt: 2030}},
        observations: {localSpawnSupply: {schemaVersion: 1, records: [persisted]}}
    }};
    const projection = projectPilotProof(memory, expected.roomName, {tick: 2030});
    assert.deepEqual(projection.spawnSupply, [persisted]);
    assert.equal(projection.receipts.length, 0);

    const report = reviewPilotWindow(frames, terminal, release);
    assert.equal(report.spawnEvidence.births[0].requestId, persisted.birth.requestId);
    assert.equal(report.spawnEvidence.energyDeliveries[0].amount, 100);
    assert.equal(report.spawnEvidence.energyDeliveries[0].tick, 2014);
    assert.deepEqual(report.spawnEvidence.recoveryModesObserved, ['normal']);
    assert.equal(report.windowComplete, false);
    assert.equal(report.acceptancePassed, false);
});

test('rejects_foreign_run_version_future_tick_and_event_conflict', () => {
    for (const change of [
        ({frames}) => { frames[1].runId = 'old-window'; },
        ({persisted}) => { persisted.version = 'older'; },
        ({persisted}) => { persisted.shard = 'shard2'; },
        ({persisted}) => { persisted.birth.name = 'foreign'; persisted.birth.quotaKey = 'hauler:W48N41:core'; },
        ({persisted}) => { persisted.source = 'simulated'; },
        ({persisted}) => { persisted.frame.tick += 1; },
        ({frames}) => { frames[1].gameTime = 2013; frames[1].room.capturedAt = 2013; frames[1].pilotProof.telemetryTick = 2013; },
        ({frames}) => { frames[0].gameTime = 2001; frames[0].room.capturedAt = 2001; frames[0].pilotProof.telemetryTick = 2001; },
        ({frames}) => { frames[1].room.capturedAt -= 11; }
    ]) {
        const fixture = persistedSupplySamples();
        change(fixture);
        const report = reviewPilotWindow(fixture.frames, fixture.terminal, fixture.release);
        assert.equal(report.spawnEvidence.energyDeliveryProven, false);
    }
});

test('legacy_and_persisted_evidence_merge_once', () => {
    const {persisted, frames, release, terminal} = persistedSupplySamples();
    const legacy = {
        schemaVersion: 1, runId: terminal.runId, release: {...release, version: release.serviceVersion},
        room: release.roomName, name: persisted.birth.name, requestId: persisted.birth.requestId,
        frame: {...structuredClone(persisted.frame), version: persisted.version, shard: persisted.shard}
    };
    assert.equal(reviewPilotWindow(frames, terminal, release, [legacy]).spawnEvidence.energyDeliveries.length, 1);
    legacy.frame.action.after = 190;
    legacy.frame.actor.energy = 10;
    legacy.frame.transfers[0][2] = 90;
    const report = reviewPilotWindow(frames, terminal, release, [legacy]);
    assert.equal(report.spawnEvidence.energyDeliveryProven, false);
    assert.ok(report.spawnEvidence.energyEvidenceGaps.some(row => row.reason === 'conflicting_supply_probe'));
});
