const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createNativeEconomicOpsFixture} = require('./helpers/native-economic-ops-fixture.cjs');
const load = () => import('../services/NativeEconomicTrialOpsFacts.js').catch(e => e.code === 'ERR_MODULE_NOT_FOUND' ? {} : Promise.reject(e));

test('native_ops_facts_use_game_and_ledger_not_empty_global', async () => {
    const {collectNativeEconomicOpsFacts: collect} = await load();
    assert.equal(typeof collect, 'function');
    const s = await createNativeEconomicOpsFixture();
    global.RemoteMining = {};
    assert.equal(collect(s.profile, s.clock()).ready, true);
    s.scene.f.actor('OldRemote', 'scout', [MOVE], 'W1N1', {remoteId: s.profile.remoteId, epoch: 1});
    assert.equal(collect(s.profile, s.clock()).ready, false);
    assert.ok(collect(s.profile, s.clock()).reasons.includes('pending_scope'));
});
test('native_ops_known_preparation_exact_match', async () => {
    const {collectNativeEconomicOpsFacts: collect} = await load();
    assert.equal(typeof collect, 'function');
    for (const mutate of [
        s => {Memory.empire.control.policy.remoteMining.economicTrial.request.configFingerprint = 'x';},
        s => {Memory.empire.control.policy.remoteMining.economicTrial.request.expiresAtMs = 1;},
        s => {Memory.empire.remoteMining.economicTrials.current.evidence.confirmedSpawnCost = 0;},
        s => {Memory.empire.remoteMining.budgets.W1N1.grants.opaque = {unknownReported: true};},
        s => {delete global.RoomPhase.W1N1.recovery.coreUpcoming;},
        s => {s.scene.f.homeSink.store.energy = 299999;}
    ]) {
        const s = await createNativeEconomicOpsFixture();
        mutate(s); assert.equal(collect(s.profile, s.clock()).ready, false);
    }
});
test('native_ops_old_recon_release_latch_is_required', async () => {
    const {collectNativeEconomicOpsFacts: collect} = await load();
    assert.equal(typeof collect, 'function');
    const s = await createNativeEconomicOpsFixture();
    assert.equal(collect(s.profile, s.clock()).ready, true);
    Memory.empire.control.policy.remoteMining.reconTrial.enabled = false;
    assert.equal(collect(s.profile, s.clock()).ready, false);
});
test('native_ops_native_position_and_current_tick', async () => {
    const {collectNativeEconomicOpsFacts: collect} = await load();
    assert.equal(typeof collect, 'function');
    const s = await createNativeEconomicOpsFixture({nativePositions: true});
    const before = JSON.stringify(Memory);
    assert.equal(collect(s.profile, s.clock()).ready, true);
    assert.equal(JSON.stringify(Memory), before);
    assert.equal(collect(s.profile, {...s.clock(), tick: Game.time + 1}).ready, false);
});
test('native_ops_missing_entire_ledger_is_not_known_zero', async () => {
    const {collectNativeEconomicOpsFacts: collect} = await load();
    const s = await createNativeEconomicOpsFixture();
    delete s.scene.f.operation.ledger;
    const value = collect(s.profile, s.clock());
    assert.equal(value.ready, false);
    assert.equal(value.accountingKnown, false);
});
