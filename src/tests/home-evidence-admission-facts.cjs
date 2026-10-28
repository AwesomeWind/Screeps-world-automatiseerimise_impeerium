const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHomeFixture} = require('./helpers/home-evidence-window-fixture.cjs');
const load = () => import('../services/HomeEvidenceWindowFacts.js');
test('gate_diagnostics_do_not_change_original_result', async () => {
    const f = await createHomeFixture(), m = await load();
    const result = m.inspectHomeObservationGate(f.clock());
    assert.deepEqual(result.gate, m.collectHomeObservationGate(f.clock()));
    assert.equal(result.diagnostic.homeNormal, true);
    assert.equal(result.diagnostic.controlTypes, true);
    RoomPhase.W49N41.recovery.mode = 'spawn_energy';
    const rejected = m.inspectHomeObservationGate(f.clock());
    assert.equal(rejected.gate.reason, 'home_not_ready');
    assert.equal(rejected.diagnostic.homeNormal, false);
});
test('scope_copy_and_stale_operation_rejected', async () => {
    const f = await createHomeFixture(), m = await load();
    const op = {evaluatedAt: Game.time, allowRecon: false, allowEconomicDeparture: false};
    Memory.empire.remoteMining = {operations: {scope: op}};
    global.RemoteMining = {scope: {operation: {...op}, state: {allowRecon: false, allowEconomicDeparture: false}}};
    let r = m.inspectHomeObservationGate(f.clock());
    assert.equal(r.gate.known, false); assert.equal(r.diagnostic.scopeIdentity, false);
    RemoteMining.scope.operation = op; op.evaluatedAt--;
    r = m.inspectHomeObservationGate(f.clock());
    assert.equal(r.gate.known, false); assert.equal(r.diagnostic.operationFresh, false);
});
test('missing_roles_keeps_no_cohort_reason', async () => {
    const f = await createHomeFixture(), m = await load();
    Memory.creeps = {};
    const r = m.inspectHomeEvidenceSelection(f.clock());
    assert.equal(r.selection.reason, 'no_cohort');
    assert.equal(r.diagnostic.reason, 'no_cohort');
    assert.equal(r.diagnostic.visited, 3);
    assert.equal(r.diagnostic.eligibleRoles, 0);
});
test('selection_counts_all_candidates_and_preserves_16_object_cap', async () => {
    const f = await createHomeFixture(), m = await load();
    const original = f.room.find;
    const extra = Array.from({length: 197}, (_, i) => ({id: i.toString(16).padStart(24, '0'), structureType: 'road'}));
    f.room.find = type => type === FIND_STRUCTURES ? extra : original(type);
    const r = m.inspectHomeEvidenceSelection(f.clock());
    assert.equal(r.selection.reason, 'candidate_limit');
    assert.equal(r.diagnostic.visited, 201);
    assert.equal(r.diagnostic.reason, 'candidate_limit');
    f.room.find = original;
    assert.deepEqual(m.inspectHomeEvidenceSelection(f.clock()).selection, m.selectHomeEvidenceObjects(f.clock()));
});
test('unvisited_gate_details_stay_null_and_no_business_writes', async () => {
    const f = await createHomeFixture(), m = await load();
    Memory.empire.control.policy.remoteMining.enabled = null;
    const before = JSON.stringify(Memory);
    const r = m.inspectHomeObservationGate(f.clock());
    assert.equal(r.diagnostic.controlTypes, false);
    assert.equal(r.diagnostic.homeNormal, null);
    assert.equal(JSON.stringify(Memory), before);
});
test('invalid_configuration_is_unknown_not_known_closed', async () => {
    const f = await createHomeFixture(), m = await load();
    Memory.empire.remoteRooms = {W48N41: {enabled: false, hold: null}};
    const r = m.inspectHomeObservationGate(f.clock());
    assert.equal(r.gate.known, false);
    assert.equal(r.diagnostic.configsClosed, null);
});
test('review_unvisited_scope_details_are_unknown_after_stale_operation', async () => {
    const f = await createHomeFixture(), m = await load();
    const op = {evaluatedAt: Game.time - 1, allowRecon: false, allowEconomicDeparture: false};
    Memory.empire.remoteMining = {operations: {scope: op}};
    global.RemoteMining = {scope: {operation: op, state: {allowRecon: false, allowEconomicDeparture: false}}};
    const d = m.inspectHomeObservationGate(f.clock()).diagnostic;
    assert.equal(d.operationFresh, false);
    assert.equal(d.scopeIdentity, null); assert.equal(d.scopeClosed, null);
});
