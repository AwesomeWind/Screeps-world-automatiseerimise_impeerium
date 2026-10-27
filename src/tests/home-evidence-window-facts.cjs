const test = require('node:test');
const assert = require('node:assert/strict');
const {ids, clock, admitted} = require('./helpers/home-evidence-data.cjs');
const {installGlobals, store} = require('./helpers/remote-mining-fixture.cjs');
const load = () => import('../services/HomeEvidenceWindowFacts.js').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('HomeEvidenceWindowFacts.js')) return {};
    throw error;
});
async function scene() {
    installGlobals({nativePositions: true});
    const {DEFAULT_EMPIRE_POLICY} = await import('../config/EmpirePolicy.js');
    global.Memory = {empire: {control: {policy: structuredClone(DEFAULT_EMPIRE_POLICY)}, market: {enabled: false}},
        creeps: {Miner: {role: 'miner'}, Hauler: {role: 'hauler'}}};
    const pos = () => new RoomPosition(20, 20, 'W49N41');
    const miner = {id: ids.miner, name: 'Miner', my: true, spawning: false, pos: pos(), store: store(0), body: [{type: WORK}]};
    const hauler = {id: ids.hauler, name: 'Hauler', my: true, spawning: false, pos: pos(), store: store(10), body: [{type: CARRY}]};
    const source = {id: ids.source, energy: 3000, energyCapacity: 3000, pos: pos()};
    const storage = {id: ids.storage, structureType: 'storage', my: true, pos: pos(), store: store(10000, 1000000)};
    const objects = {[miner.id]: miner, [hauler.id]: hauler, [source.id]: source, [storage.id]: storage};
    const room = {name: 'W49N41', controller: {my: true}, storage,
        find: type => type === FIND_SOURCES ? [source] : type === FIND_STRUCTURES ? [storage] : [], getEventLog: () => []};
    global.Game = {time: 100, shard: {name: 'shard3'}, rooms: {W49N41: room}, creeps: {Miner: miner, Hauler: hauler},
        getObjectById: id => objects[id] ?? null, cpu: {getUsed: () => 0, tickLimit: 20, bucket: 10000}};
    global.RoomPhase = {W49N41: {recovery: {mode: 'normal'}}}; global.RemoteMining = {};
    return {miner, hauler, source, storage, room, objects};
}
module.exports.scene = scene;

test('home_facts_no_economic_state_needed_and_readonly', async () => {
    const m = await load(); assert.equal(typeof m.collectHomeObservationGate, 'function', 'natural observation facts required');
    await scene(); const before = JSON.stringify(Memory);
    const gate = m.collectHomeObservationGate(clock);
    assert.equal(gate.known, true); assert.equal(gate.closed, true); assert.equal(gate.homeReady, true);
    const selection = m.selectHomeEvidenceObjects(clock);
    assert.deepEqual(selection.cohort.map(c => c.id), [ids.miner, ids.hauler]);
    assert.equal(JSON.stringify(Memory), before);
});
test('home_facts_expired_envelope_does_not_grant_permission', async () => {
    const m = await load(); assert.equal(typeof m.collectHomeObservationGate, 'function');
    await scene(); Memory.empire.control.policy.remoteMining.reconTrial.request = {enabled: true, expiresAtMs: 1};
    const old = JSON.stringify(Memory);
    assert.equal(m.collectHomeObservationGate(clock).closed, true);
    assert.equal(JSON.stringify(Memory), old);
});
test('home_facts_fresh_scope_open_or_unknown_refuses', async () => {
    const m = await load(); assert.equal(typeof m.collectHomeObservationGate, 'function');
    await scene();
    const op = {epoch: 1, evaluatedAt: 100, allowRecon: false, allowEconomicDeparture: false};
    Memory.empire.remoteMining = {operations: {'W49N41:W48N41': op}};
    Memory.empire.remoteRooms = {W48N41: {baseRoom: 'W49N41', enabled: false, hold: true}};
    assert.equal(m.collectHomeObservationGate(clock).known, false, 'existing operation without actual scope is not an empty set');
    global.RemoteMining['W49N41:W48N41'] = {operation: op, state: {allowRecon: false, allowEconomicDeparture: false}};
    assert.equal(m.collectHomeObservationGate(clock).closed, true);
    op.allowRecon = true;
    assert.equal(m.collectHomeObservationGate(clock).closed, false);
    op.allowRecon = false; op.evaluatedAt--;
    assert.equal(m.collectHomeObservationGate(clock).known, false);
});
test('home_facts_native_position_and_fixed_identity_are_not_enumeration_based', async () => {
    const m = await load(); assert.equal(typeof m.collectHomeEvidencePacket, 'function');
    const s = await scene(), {store} = await admitted();
    const p = m.collectHomeEvidencePacket(store.window, clock, {simulatedEvents: true});
    assert.deepEqual(p.objects[ids.miner].pos, {x: 20, y: 20, roomName: 'W49N41'});
    assert.equal(p.objects[ids.source].energy, 3000); assert.equal(p.declaredEventTick, 99);
    s.miner.name = 'Replacement';
    const missing = m.collectHomeEvidencePacket(store.window, clock, {simulatedEvents: true});
    assert.equal(missing.objects[ids.miner].exists, null); assert.equal(missing.coverage.complete, false);
});
test('home_facts_selection_stable_200_201_and_16_object_cap', async () => {
    const m = await load(); assert.equal(typeof m.selectHomeEvidenceObjects, 'function');
    const s = await scene();
    for (let i = 0; i < 198; i++) Game.creeps['foreign' + i] = {name: 'foreign' + i, my: false};
    // Sources/structures are candidates too, so total traversal, not only matching creeps, is bounded.
    assert.equal(m.selectHomeEvidenceObjects(clock).complete, false);
    for (let i = 0; i < 198; i++) delete Game.creeps['foreign' + i];
    const containers = Array.from({length: 17}, (_, i) => ({id: i.toString(16).padStart(24, '0'), structureType: 'container', my: true,
        pos: new RoomPosition(10, 10, 'W49N41'), store: store(10)}));
    containers.forEach(c => {s.objects[c.id] = c;});
    s.room.find = type => type === FIND_SOURCES ? [s.source] : type === FIND_STRUCTURES ? containers : [];
    const selection = m.selectHomeEvidenceObjects(clock);
    assert.equal(selection.complete, true); assert.equal(selection.objectIds.length, 16);
    assert.deepEqual(m.selectHomeEvidenceObjects(clock), selection);
});
test('home_facts_event_whitelist_overflow_and_per_tick_dedupe', async () => {
    const m = await load(); assert.equal(typeof m.collectHomeEvidencePacket, 'function');
    const s = await scene(), {store} = await admitted(); let calls = 0;
    s.room.getEventLog = () => {calls++; return Array.from({length: 129}, () => ({event: 5, objectId: ids.miner,
        data: {targetId: ids.source, amount: 2, private: 'MUST_NOT_COPY'}}));};
    const p = m.collectHomeEvidencePacket(store.window, clock, {simulatedEvents: true});
    const q = m.collectHomeEvidencePacket(store.window, clock, {simulatedEvents: true});
    assert.equal(calls, 1); assert.equal(p.events.length, 32); assert.equal(q.coverage.complete, false);
    assert.ok(p.coverage.reasons.includes('events_overflow')); assert.equal(JSON.stringify(p).includes('MUST_NOT_COPY'), false);
});
test('home_facts_unavailable_or_malformed_api_and_invalid_energy_are_unknown', async () => {
    const m = await load(); assert.equal(typeof m.collectHomeEvidencePacket, 'function');
    for (const provider of [undefined, () => {throw Error('private error');}, () => ({}), () => [{event: 5, objectId: ids.miner, data: {targetId: ids.source, amount: '2'}}]]) {
        const s = await scene(), {store} = await admitted(); s.room.getEventLog = provider; s.source.energy = NaN;
        const p = m.collectHomeEvidencePacket(store.window, clock);
        assert.equal(p.coverage.complete, false); assert.equal(p.objects[ids.source].energy, null);
        assert.equal(p.api.semantics, 'unverified'); assert.equal(JSON.stringify(p).includes('private error'), false);
    }
});

test('home_facts_malformed_unselected_resource_event_makes_flow_coverage_unknown', async () => {
    const m = await load(), s = await scene(), {store} = await admitted();
    s.room.getEventLog = () => [{event: 12, objectId: '1'.repeat(24), data: {amount: 2, resourceType: 'energy'}}];
    const p = m.collectHomeEvidencePacket(store.window, clock);
    assert.equal(p.coverage.complete, false); assert.ok(p.coverage.reasons.includes('events_invalid'));
});

test('home_release_retained_enabled_envelopes_require_exact_terminal_expired_proof', async () => {
    const saved = require('./fixtures/home-retained-closed.json');
    const oldStatus = {remotePolicy: saved.remotePolicy, config: saved.config, store: saved.economic};
    const oldRuntime = {tick: saved.observedTick, recon: saved.recon, native: saved.native, operation: {epoch: saved.epoch}};
    const m = await load(); await scene();
    const now = {tick: oldRuntime.tick + 100, nowMs: 1793065104443, codeVersion: clock.codeVersion, shard: 'shard3'};
    Game.time = now.tick;
    Memory.empire.control.policy.remoteMining = structuredClone(oldStatus.remotePolicy);
    Memory.empire.remoteRooms = {W48N41: structuredClone(oldStatus.config)};
    const op = {epoch: oldRuntime.operation.epoch, evaluatedAt: now.tick, allowRecon: false, allowEconomicDeparture: false};
    Memory.empire.remoteMining = {economicTrials: structuredClone(oldStatus.store), reconTrials: structuredClone(oldRuntime.recon),
        nativeEconomicOps: structuredClone(oldRuntime.native), operations: {'W49N41:W48N41': op}};
    global.RemoteMining = {'W49N41:W48N41': {operation: op, state: {allowRecon: false, allowEconomicDeparture: false}}};
    const before = JSON.stringify(Memory);
    assert.equal(Memory.empire.control.policy.remoteMining.reconTrial.enabled, true);
    assert.equal(Memory.empire.control.policy.remoteMining.economicTrial.enabled, true);
    assert.equal(m.collectHomeObservationGate(now).closed, true, 'expired retained envelopes must not masquerade as live permission');
    assert.equal(JSON.stringify(Memory), before);
    for (const kind of ['economicTrial', 'reconTrial']) {
        const envelope = Memory.empire.control.policy.remoteMining[kind], original = structuredClone(envelope);
        for (const change of [q => {q.expiresAtMs = now.nowMs + 1;}, q => {q.expiresAtTick = now.tick + 1;},
            q => {if (kind === 'economicTrial') q.id = 'foreign'; else q.targetTrialId = 'foreign';}]) {
            envelope.request = structuredClone(original.request); change(envelope.request);
            assert.equal(m.collectHomeObservationGate(now).closed, false, kind + ' cannot accept fresh or foreign envelope');
        }
        Memory.empire.control.policy.remoteMining[kind] = original;
    }
    op.allowEconomicDeparture = true;
    assert.equal(m.collectHomeObservationGate(now).closed, false);
});
