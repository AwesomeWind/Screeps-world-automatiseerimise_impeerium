const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {admittedEvidenceInputs} = require('./helpers/trial-evidence-window-fixture.cjs');
const load = () => import('../services/TrialEvidenceWindowService.js').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('TrialEvidenceWindowService.js')) return {};
    throw error;
});

test('disabled_service_is_observationally_inert', async () => {
    const {default: Service} = await load();
    assert.equal(typeof Service, 'function');
    const x = await admittedEvidenceInputs();
    Memory.empire.control.policy.remoteMining.evidenceWindow = {enabled: false, request: null};
    const before = JSON.stringify(Memory);
    let calls = 0;
    const service = new Service('TrialEvidenceWindow', {factsDeps: {readEvents() {calls++; throw Error('forbidden');}}});
    for (const phase of ['init', 'analyze', 'run', 'cleanup']) service[phase]();
    assert.equal(calls, 0);
    assert.equal(JSON.stringify(Memory), before);
    assert.equal(Memory.empire.remoteMining.evidenceWindows, undefined);
});

test('cleanup_last_preserves_p0_and_action_order', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
    assert.ok(source.indexOf("new TrialEvidenceWindowService(") > source.indexOf("new EmpireMetricsService("));
    assert.ok(source.indexOf("ActionParser.run(Game.creeps[name])") < source.indexOf("runServicePhase(services, 'cleanup')"));
    assert.ok(source.indexOf("runServicePhase(services, 'cleanup')") < source.indexOf('RuntimeTelemetry.finishTick()'));
    const {default: scheduler} = await import('../core/ServiceScheduler.js');
    await admittedEvidenceInputs();
    assert.equal(scheduler.decision('TrialEvidenceWindow', 'cleanup').tier, 'P3');
    assert.equal(scheduler.decision('TrialEvidenceWindow', 'cleanup').shouldRun, true);
});

test('capture_failures_do_not_control_business_close', async () => {
    const {default: Service} = await load();
    assert.equal(typeof Service, 'function');
    const x = await admittedEvidenceInputs();
    const m = await import('../services/TrialEvidenceWindowModel.js');
    let store = m.advanceEvidenceWindow(undefined, {type: 'arm', request: x.request}, x.clock, x.profile).store;
    Memory.empire.control.policy.remoteMining.evidenceWindow = {enabled: true, request: x.request};
    const observer = new Service('TrialEvidenceWindow', {profile: x.profile, now: () => x.f.clock().nowMs,
        readStore: () => store, writeStore: value => {store = value;},
        factsDeps: {readBusiness() {throw Error('must not control close');}}});
    x.f.scene.f.services.push(observer);
    x.f.advance({nowMs: Memory.empire.remoteMining.nativeEconomicOps.current.request.stopAtMs});
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.ok(x.f.scene.current.outcome);
    assert.equal(Memory.empire.remoteRooms[x.profile.targetRoom].hold, true);
});

test('cpu_reserve_soft_budget_and_unreadable_clock', async () => {
    const {default: Service} = await load();
    assert.equal(typeof Service, 'function');
    const x = await admittedEvidenceInputs();
    Memory.empire.control.policy.remoteMining.evidenceWindow = {enabled: true, request: x.request};
    for (const sample of [{used: 0, tickLimit: 20, bucket: 4999}, {used: 14, tickLimit: 20, bucket: 5000},
        {used: NaN, tickLimit: 20, bucket: 10000}, null]) {
        let writes = 0;
        const service = new Service('TrialEvidenceWindow', {profile: x.profile, now: () => x.clock.nowMs,
            readCpu: () => sample, readStore: () => undefined, writeStore() {writes++;}});
        service.cleanup();
        assert.equal(writes, 0);
    }
});

test('commit_readback_and_json_reload', async () => {
    const {default: Service} = await load();
    assert.equal(typeof Service, 'function');
    const x = await admittedEvidenceInputs();
    const {advanceEvidenceWindow: advance} = await import('../services/TrialEvidenceWindowModel.js');
    const candidate = advance(undefined, {type: 'arm', request: x.request}, x.clock, x.profile).store;
    let store, writes = 0;
    const service = new Service('TrialEvidenceWindow', {readStore: () => store, writeStore: value => {
        writes++; store = JSON.parse(JSON.stringify(value)); throw Error('write response lost');
    }});
    assert.equal(service.commitEvidenceCandidate(undefined, candidate, 'window-one:100').status, 'committed');
    assert.equal(writes, 2, 'one durable prepare marker and one distinct packet commit, neither replayed');
    const unknown = new Service('TrialEvidenceWindow', {readStore: () => undefined,
        writeStore() {writes++; throw Error('write unknown');}});
    assert.equal(unknown.commitEvidenceCandidate(undefined, candidate, 'window-one:100').status, 'unknown');
    const count = writes;
    assert.equal(unknown.commitEvidenceCandidate(undefined, candidate, 'window-one:100').status, 'unknown');
    assert.equal(writes, count);
    assert.deepEqual(store, candidate);
});

test('enabled_disabled_fault_execution_parity', async () => {
    const {createTrialEvidenceFixture} = require('./helpers/trial-evidence-window-fixture.cjs');
    const runs = [];
    for (const mode of ['disabled', 'enabled', 'fault']) {
        const f = await createTrialEvidenceFixture(mode === 'fault' ? {observerOptions: {collectPacket() {throw Error('capture failure');}}} : {});
        f.submit(mode !== 'disabled');
        for (let i = 0; i < 350 && !f.x.scene.current?.firstDelivery; i++) f.advance();
        assert.ok(f.x.scene.current?.firstDelivery, mode + ' must use original real delivery path');
        for (let i = 0; i < 3; i++) f.advance();
        runs.push({state: structuredClone(f.x.scene.state), actions: structuredClone(f.x.scene.calls),
            spawnCalls: structuredClone(f.x.scene.f.spawnCalls)});
        if (mode === 'enabled') {
            assert.ok(f.window?.tickRows.length > 100, 'observation must actually run through admission');
            const report = global.TrialEvidenceWindow.report('window-one');
            assert.equal(report.apiEvidence.semanticsLevel, 'simulated');
            assert.equal(report.firstDeliveryNewEnergyLowerBound, null);
            assert.equal(report.sections.delivery.status, 'proved');
            assert.equal(new Set(f.eventCalls.map(item => item.tick + ':' + item.room)).size, f.eventCalls.length);
        }
    }
    assert.deepEqual(runs[1], runs[0]);
    assert.deepEqual(runs[2], runs[0]);
});

test('fresh_birth_then_real_movement_is_not_spawn_exit_position', async () => {
    const {createTrialEvidenceFixture} = require('./helpers/trial-evidence-window-fixture.cjs');
    const f = await createTrialEvidenceFixture();
    f.submit();
    for (let i = 0; i < 30 && !f.window?.milestones.some(item => item.type === 'moved_scout'); i++) f.advance();
    const born = f.window.milestones.find(item => item.type === 'born_scout');
    const moved = f.window.milestones.find(item => item.type === 'moved_scout');
    assert.ok(born && moved);
    assert.ok(moved.observedTick > born.observedTick, 'birth tile is not an observed move of an already born actor');
});

test('pending_commit_survives_json_reload_as_irreversible_gap', async () => {
    const {default: Service} = await load();
    const m = await import('../services/TrialEvidenceWindowModel.js');
    const x = await admittedEvidenceInputs();
    const original = m.advanceEvidenceWindow(undefined, {type: 'arm', request: x.request}, x.clock, x.profile).store;
    original.current.capture.pending = {key: 'old:unknown', tick: x.clock.tick};
    let store = JSON.parse(JSON.stringify(original));
    Memory.empire.control.policy.remoteMining.evidenceWindow = {enabled: true, request: x.request};
    const observer = new Service('TrialEvidenceWindow', {profile: x.profile, now: () => x.admittedClock.nowMs,
        readStore: () => store, writeStore: value => {store = value;}});
    observer.cleanup();
    assert.equal(store.current.capture.partial, true);
    assert.ok(store.current.capture.flags & 128);
});

test('same_tick_rebuild_does_not_replay_pending_write', async () => {
    const {default: Service} = await load();
    const m = await import('../services/TrialEvidenceWindowModel.js');
    const x = await admittedEvidenceInputs();
    let store = m.advanceEvidenceWindow(undefined, {type: 'arm', request: x.request}, x.clock, x.profile).store;
    store.current.capture.pending = {key: x.request.id + ':' + Game.time + ':bind', tick: Game.time};
    store = JSON.parse(JSON.stringify(store));
    Memory.empire.control.policy.remoteMining.evidenceWindow = {enabled: true, request: x.request};
    let writes = 0;
    const observer = new Service('TrialEvidenceWindow', {profile: x.profile, now: () => x.admittedClock.nowMs,
        readStore: () => store, writeStore: next => {writes++; store = next;}});
    observer.cleanup();
    assert.equal(writes, 0);
});

test('commit_never_writes_a_pending_marker_over_character_limit', async () => {
    const {default: Service} = await load();
    const m = await import('../services/TrialEvidenceWindowModel.js');
    const x = await admittedEvidenceInputs();
    let store = m.advanceEvidenceWindow(undefined, {type: 'arm', request: x.request}, x.clock, x.profile).store;
    store.current.capture.padding = '';
    store.current.capture.padding = 'x'.repeat(131072 - JSON.stringify(store.current).length);
    const candidate = structuredClone(store); candidate.current.capture.revision++;
    let max = 0;
    const observer = new Service('TrialEvidenceWindow', {readStore: () => store,
        writeStore: value => {max = Math.max(max, JSON.stringify(value.current).length); store = value;}});
    observer.commitEvidenceCandidate(store, candidate, 'window:capacity');
    assert.ok(max <= 131072);
});

test('native_tail_permission_recorded_with_actual_actor_name', async () => {
    const {createTrialEvidenceFixture} = require('./helpers/trial-evidence-window-fixture.cjs');
    const f = await createTrialEvidenceFixture(); f.submit();
    for (let i = 0; i < 350 && !f.x.scene.current.firstDelivery; i++) f.advance();
    const {EVIDENCE_STATE_BITS: B} = await import('../services/TrialEvidenceWindowModel.js');
    assert.ok(f.window.tickRows.at(-1)[9] & B.tailPermission, 'original permit requires bound name');
});

test('json_reload_preserves_identity_deadlines_and_single_packet_per_tick', async () => {
    const {createTrialEvidenceFixture} = require('./helpers/trial-evidence-window-fixture.cjs');
    const f = await createTrialEvidenceFixture(); f.submit();
    for (let i = 0; i < 80; i++) f.advance();
    const header = structuredClone(f.window.header), bounds = structuredClone(f.window.bounds);
    const rows = structuredClone(f.window.tickRows), names = Object.keys(Game.creeps);
    f.restoreMemory();
    assert.deepEqual(Object.keys(Game.creeps), names);
    assert.deepEqual(f.window.tickRows, rows);
    f.advance();
    assert.deepEqual(f.window.header, header);
    assert.deepEqual(f.window.bounds, bounds);
    assert.deepEqual(f.window.tickRows.slice(0, rows.length), rows);
    assert.equal(f.window.tickRows.length, rows.length + 1);
    f.observer.cleanup();
    assert.equal(f.window.tickRows.length, rows.length + 1);
});

for (const stage of ['readBusiness', 'readEvents', 'serialize', 'write_before', 'write_after', 'read_store']) {
    test('original_close_survives_observer_' + stage, async () => {
        const {default: Service} = await load();
        const m = await import('../services/TrialEvidenceWindowModel.js');
        const facts = await import('../services/TrialEvidenceWindowFacts.js');
        const x = await admittedEvidenceInputs();
        let store = m.advanceEvidenceWindow(undefined, {type: 'arm', request: x.request}, x.clock, x.profile).store;
        store = m.advanceEvidenceWindow(store, {type: 'bind', admission: x.admission}, x.admittedClock, x.profile).store;
        Memory.empire.control.policy.remoteMining.evidenceWindow = {enabled: true, request: x.request};
        const fail = () => {throw Error('SECRET_FIXTURE_EXCEPTION_MUST_NOT_BE_SAVED');};
        const options = {profile: x.profile, now: () => x.f.clock().nowMs, readStore: () => store, writeStore: v => {store = v;}};
        if (stage === 'readBusiness') options.factsDeps = {readBusiness: fail};
        if (stage === 'readEvents') options.factsDeps = {readEvents: fail};
        if (stage === 'read_store') options.readStore = fail;
        if (stage === 'write_before') options.writeStore = fail;
        if (stage === 'write_after') options.writeStore = v => {store = v; fail();};
        if (stage === 'serialize') options.collectPacket = (...args) => {
            const p = facts.collectEvidencePacket(...args); p.snapshot = {self: null}; p.snapshot.self = p.snapshot; return p;
        };
        x.f.scene.f.services.push(new Service('TrialEvidenceWindow', options));
        x.f.advance({nowMs: Memory.empire.remoteMining.nativeEconomicOps.current.request.stopAtMs});
        assert.ok(x.f.scene.current.outcome);
        assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
        assert.equal(Memory.empire.remoteRooms[x.profile.targetRoom].hold, true);
        assert.ok(!JSON.stringify(store).includes('SECRET_FIXTURE_EXCEPTION'));
    });
}

test('cpu_soft_overrun_skips_optional_collection_without_resetting_window', async () => {
    const {default: Service} = await load();
    const m = await import('../services/TrialEvidenceWindowModel.js');
    const x = await admittedEvidenceInputs();
    let store = m.advanceEvidenceWindow(undefined, {type: 'arm', request: x.request}, x.clock, x.profile).store;
    store = m.advanceEvidenceWindow(store, {type: 'bind', admission: x.admission}, x.admittedClock, x.profile).store;
    const original = structuredClone(store.current.bounds);
    Memory.empire.control.policy.remoteMining.evidenceWindow = {enabled: true, request: x.request};
    let used = 13, writes = 0, calls = 0, optionalReads = 0;
    const observer = new Service('TrialEvidenceWindow', {profile: x.profile, now: () => x.admittedClock.nowMs,
        readStore: () => store, writeStore: value => {writes++; store = value;},
        readCpu: () => ({used, tickLimit: 20, bucket: 5000}), factsDeps: {
            readEvents: () => {calls++; used = 15.1; return [];},
            readReservations: () => {optionalReads++; return {};}}});
    observer.cleanup();
    assert.equal(calls, 1);
    assert.equal(writes, 0);
    assert.equal(optionalReads, 0, 'after event API exhausts soft budget no optional owner stage runs');
    assert.equal(store.current.tickRows.length, 0);
    assert.deepEqual(store.current.bounds, original);
});

test('persisted_scope_drift_cannot_expand_compiled_room_reads', async () => {
    const {default: Service} = await load();
    const m = await import('../services/TrialEvidenceWindowModel.js');
    const x = await admittedEvidenceInputs();
    let s = m.advanceEvidenceWindow(undefined, {type: 'arm', request: x.request}, x.clock, x.profile).store;
    s = m.advanceEvidenceWindow(s, {type: 'bind', admission: x.admission}, x.admittedClock, x.profile).store;
    s.current.header.baseRoom = 'W2N2';
    s.current.header.identity.remoteId = 'W2N2:' + x.profile.targetRoom;
    s.current.header.request.identity.remoteId = s.current.header.identity.remoteId;
    const rooms = [];
    Memory.empire.control.policy.remoteMining.evidenceWindow = {enabled: true, request: structuredClone(s.current.header.request)};
    const service = new Service('TrialEvidenceWindow', {profile: x.profile, now: () => x.admittedClock.nowMs,
        readStore: () => s, writeStore: value => {s = value;}, factsDeps: {readRoom: name => {rooms.push(name); return null;}}});
    service.cleanup();
    assert.deepEqual(rooms, []);
    assert.equal(service.lastError, 'scope_mismatch');
});

test('last_legal_tail_transfer_is_confirmed_next_tick_and_facade_stays_readonly', async () => {
    const {createTrialEvidenceFixture} = require('./helpers/trial-evidence-window-fixture.cjs');
    const f = await createTrialEvidenceFixture(); f.submit();
    let hauler;
    for (let i = 0; i < 350; i++) {
        f.advance();
        hauler = Game.creeps[f.x.scene.current.slots.remoteHauler.name];
        if (hauler?.store.energy > 0) break;
    }
    assert.equal(hauler.store.energy, 400, 'real original pickup before stopping');
    assert.equal(Object.values(f.x.scene.current.evidence.pickups)[0], 400);
    // Controlled external room condition: receiver stays full while the original actor returns.
    // No trip, receipt, grant, unknown or safety counter is fabricated or cleared.
    f.x.scene.f.homeSink.store.energy = 300000;
    Memory.empire.control.policy.remoteMining.enabled = false;
    f.advance();
    const expiry = f.x.scene.current.tailExpiresAtTick, outcome = structuredClone(f.x.scene.current.outcome);
    assert.equal(expiry, outcome.decidedAtTick + 300);
    while (Game.time < expiry - 1) f.advance();
    f.x.scene.f.homeSink.store.energy = 20000;
    f.advance();
    assert.equal(Game.time, expiry);
    assert.ok(f.x.scene.calls.some(call => call.tick === expiry && call.method === 'transfer' && call.result === OK));
    assert.equal(f.x.scene.current.evidence.tailReturnedEnergy ?? 0, 0, 'accepted action is not same-tick income');
    f.advance();
    assert.equal(f.x.scene.current.evidence.tailReturnedEnergy, 400);
    assert.equal(f.window.tickRows.at(-1)[0], expiry + 1);
    assert.equal(f.window.tickRows.at(-1)[7], 400);
    assert.deepEqual(f.x.scene.current.outcome, outcome);
    assert.equal(f.x.scene.current.firstDelivery, undefined, 'tail income does not rewrite aborted first outcome');
    f.advance();
    assert.equal(f.window.tickRows.at(-1)[0], expiry + 2);
    f.advance();
    assert.equal(f.window.tickRows.at(-1)[0], expiry + 2);
    assert.equal(f.window.capture.phase, 'sealed');
    const before = JSON.stringify(Memory), revision = f.window.capture.revision;
    const game = Game;
    global.Game = new Proxy({}, {get() {throw Error('sealed read must not use current Game');}});
    try {
        const facade = global.TrialEvidenceWindow;
        assert.deepEqual(Object.keys(facade).sort(), ['readPage', 'report', 'status']);
        assert.equal(facade.status('window-one').revision, revision);
        assert.equal(facade.report('window-one').outcome.verdict, 'aborted');
        assert.equal(facade.report('window-one').sections.controlClosure.status, 'proved');
        let offset = 0, rows = 0;
        do {
            const page = facade.readPage('window-one', 'rows', offset, 128);
            assert.equal(page.revision, revision);
            assert.ok(JSON.stringify(page).length <= 16384);
            rows += page.items.length; offset = page.nextOffset;
        } while (offset !== null);
        assert.equal(rows, f.window.tickRows.length);
        assert.equal(JSON.stringify(Memory), before);
    } finally {global.Game = game;}
});

test('unknown_arm_is_not_regenerated_with_new_tick', async () => {
    const {default: Service} = await load();
    const x = await admittedEvidenceInputs();
    Memory.empire.control.policy.remoteMining.evidenceWindow = {enabled: true, request: x.request};
    let writes = 0;
    const observer = new Service('TrialEvidenceWindow', {profile: x.profile, now: () => x.admittedClock.nowMs,
        readStore: () => undefined, writeStore() {writes++; throw Error('unknown arm');}});
    observer.cleanup();
    assert.equal(writes, 1);
    Game.time++;
    observer.cleanup();
    assert.equal(writes, 1, 'new observed tick is not permission to regenerate an unknown arm');
});

test('explicit_successor_does_not_inherit_old_runtime_gap', async () => {
    const {default: Service} = await load();
    const m = await import('../services/TrialEvidenceWindowModel.js');
    const x = await admittedEvidenceInputs();
    let store = m.advanceEvidenceWindow(undefined, {type: 'arm', request: x.request}, x.clock, x.profile).store;
    store = m.advanceEvidenceWindow(store, {type: 'seal', reason: 'partial'}, x.clock, x.profile).store;
    Memory.empire.control.policy.remoteMining.evidenceWindow = {enabled: true,
        request: {...x.request, id: 'new-window', successorOf: x.request.id}};
    const observer = new Service('TrialEvidenceWindow', {profile: x.profile, now: () => x.admittedClock.nowMs,
        readStore: () => store, writeStore: value => {store = value;}});
    observer.partial = true;
    observer.cleanup();
    assert.equal(store.current.header.id, 'new-window');
    assert.equal(observer.partial, false);
});

test('review_successor_unknown_survives_json_rebuild_without_replay', async () => {
    const {default: Service} = await load(), m = await import('../services/TrialEvidenceWindowModel.js');
    const x = await admittedEvidenceInputs();
    let store = m.advanceEvidenceWindow(undefined, {type: 'arm', request: x.request}, x.clock, x.profile).store;
    store = m.advanceEvidenceWindow(store, {type: 'seal', reason: 'not_started'}, x.clock, x.profile).store;
    const sealed = structuredClone(store.current);
    const q = {...x.request, id: 'successor', successorOf: x.request.id};
    Memory.empire.control.policy.remoteMining.evidenceWindow = {enabled: true, request: q};
    let writes = 0;
    const options = {profile: x.profile, now: () => x.admittedClock.nowMs, readStore: () => store,
        writeStore: v => {writes++; if (writes === 2) throw Error('final write unknown'); store = v;}};
    new Service('TrialEvidenceWindow', options).cleanup();
    assert.equal(writes, 2);
    store = JSON.parse(JSON.stringify(store)); Game.time++;
    const before = JSON.stringify(store), count = writes;
    new Service('TrialEvidenceWindow', options).cleanup();
    assert.equal(writes, count);
    assert.equal(JSON.stringify(store), before);
    assert.deepEqual(store.current, sealed, 'pending belongs to the store envelope, never mutates a sealed window');
});

test('review_capacity_seal_commits_at_service_boundary_and_survives_rebuild', async () => {
    const {default: Service} = await load(), m = await import('../services/TrialEvidenceWindowModel.js');
    const x = await admittedEvidenceInputs();
    let store = m.advanceEvidenceWindow(undefined, {type: 'arm', request: x.request}, x.clock, x.profile).store;
    store = m.advanceEvidenceWindow(store, {type: 'bind', admission: x.admission}, x.admittedClock, x.profile).store;
    const facts = await import('../services/TrialEvidenceWindowFacts.js');
    const first = facts.collectEvidencePacket(store.current, x.f.clock());
    store = m.advanceEvidenceWindow(store, {type: 'capture', packet: first}, x.f.clock(), x.profile).store;
    store.current.capture.padding = '';
    store.current.capture.padding = 'x'.repeat(131040 - JSON.stringify(store.current).length);
    const oldRows = structuredClone(store.current.tickRows);
    Memory.empire.control.policy.remoteMining.evidenceWindow = {enabled: true, request: x.request};
    for (let i = 0; i < 3; i++) x.f.advance(); // birth milestone requires a fresh detailed packet beyond remaining space
    const options = {profile: x.profile, now: () => x.f.clock().nowMs, readStore: () => store, writeStore: v => {store = v;}};
    new Service('TrialEvidenceWindow', options).cleanup();
    assert.equal(store.current.capture.phase, 'sealed');
    assert.equal(store.current.seal.reason, 'capacity');
    assert.deepEqual(store.current.tickRows, oldRows);
    store = JSON.parse(JSON.stringify(store)); Game.time++;
    const before = JSON.stringify(store); new Service('TrialEvidenceWindow', options).cleanup();
    assert.equal(JSON.stringify(store), before);
});

test('review_commit_cpu_exhausted_after_pending_never_calls_final_write', async () => {
    const {default: Service} = await load(), m = await import('../services/TrialEvidenceWindowModel.js');
    const x = await admittedEvidenceInputs();
    const candidate = m.advanceEvidenceWindow(undefined, {type: 'arm', request: x.request}, x.clock, x.profile).store;
    let used = 0, store, writes = 0;
    const service = new Service('TrialEvidenceWindow', {readStore: () => store,
        readCpu: () => ({used, tickLimit: 20, bucket: 10000}), writeStore: v => {writes++; store = v; used = 2.1;}});
    const result = service.commitEvidenceCandidate(undefined, candidate, 'window-one:100:arm');
    assert.equal(result.status, 'unknown');
    assert.equal(writes, 1);
    assert.ok(store.pending || store.current.capture.pending);
});

test('review_unclassified_actor_store_change_is_a_source_gap', async () => {
    const {createTrialEvidenceFixture} = require('./helpers/trial-evidence-window-fixture.cjs');
    const f = await createTrialEvidenceFixture(); f.submit();
    let miner;
    for (let i = 0; i < 250; i++) {
        f.advance(); miner = Game.creeps[f.x.scene.current.slots.remoteMiner.name];
        if (miner && !miner.spawning && f.window.binding.remoteMiner?.bornAtTick < Game.time) break;
    }
    assert.ok(miner && !miner.spawning);
    miner.store.energy += 10; // controlled external resource input with no classified event
    f.advance();
    assert.equal(f.window.capture.latestProof.actorFlow.remoteMiner.known, false);
    assert.equal(f.window.capture.latestProof.actorFlow.remoteMiner.reason, 'unclassified_energy_change');
    assert.equal(f.window.capture.provenance.incomplete, true);
    assert.equal(f.window.capture.latestProof.settlement.returnedEnergy, 0);
});
