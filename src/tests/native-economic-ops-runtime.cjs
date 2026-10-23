const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createNativeEconomicOpsFixture} = require('./helpers/native-economic-ops-fixture.cjs');
async function setup(options = {}) {
    const m = await import('../services/NativeEconomicTrialOpsService.js').catch(e => e.code === 'ERR_MODULE_NOT_FOUND' ? {} : Promise.reject(e));
    assert.equal(typeof m.default, 'function', 'native P0 service must exist');
    const s = await createNativeEconomicOpsFixture({nativeOps: true, ...options});
    return s;
}
async function until(s, predicate, max = 25) {
    for (let i = 0; i < max && !predicate(); i++) s.advance();
    assert.ok(predicate(), JSON.stringify(Memory.empire.remoteMining.nativeEconomicOps?.current));
}
test('native_ops_real_service_order_and_default_off', async () => {
    const s = await setup(); s.advance();
    assert.equal(Memory.empire.remoteMining.nativeEconomicOps, undefined);
    assert.deepEqual(Memory.empire.control.policy.remoteMining.economicTrial.request, s.profile.oldPreparation);
    const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
    assert.ok(main.indexOf("new RemoteReconTrialService(") < main.indexOf("new NativeEconomicTrialOpsService("));
    assert.ok(main.indexOf("new NativeEconomicTrialOpsService(") < main.indexOf("new RemoteEconomicTrialService("));
    const {default: scheduler} = await import('../core/ServiceScheduler.js');
    assert.equal(scheduler.decision('NativeEconomicTrialOps', 'analyze').tier, 'P0');
});
test('native_ops_real_guard_release_then_start', async () => {
    const s = await setup(); const old = structuredClone(s.profile.oldCurrent); s.submit();
    await until(s, () => s.scene.current?.identity.trialId === 'native-econ-one');
    assert.deepEqual(s.scene.state.previous, {...old, managed: false});
    assert.equal(s.scene.current.identity.sequence, 3);
    assert.equal(s.scene.current.safeStreak, 0);
    assert.equal(s.scene.current.visionAcquired, false);
    assert.equal(s.scene.current.evidence.confirmedSpawnCost, 50);
    assert.equal(s.scene.f.spawnCalls.filter(c => c.memory.economicTrialId === 'native-econ-one').length, 1);
});
test('native_ops_no_departure_between_prepare_and_activation', async () => {
    const s = await setup(); s.submit();
    await until(s, () => Memory.empire.remoteMining.nativeEconomicOps?.current.stage === 'start_prepared');
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(Memory.empire.control.policy.remoteMining.economicTrial.enabled, false);
    assert.equal(s.scene.f.spawnCalls.filter(c => c.memory.economicTrialId).length, 0);
    const original = structuredClone(Memory.empire.remoteMining.nativeEconomicOps.current.startRequest);
    s.advance();
    assert.equal(s.scene.current.identity.trialId, original.id);
    assert.equal(s.scene.current.expiresAtTick, original.expiresAtTick);
});
module.exports = {setup, until};

test('native_ops_no_network_full_first_delivery_path', async () => {
    const s = await setup({nativeMovement: true, nativePositions: true}); s.submit();
    await until(s, () => s.scene.current?.identity.trialId === 'native-econ-one');
    await until(s, () => s.scene.current?.outcome, 950);
    assert.equal(s.scene.current.outcome.stopReason, 'first_delivery');
    assert.ok(s.scene.current.evidence.returnedEnergy > 0);
    assert.equal(s.scene.current.safeStreak, 100);
    await until(s, () => Memory.empire.remoteMining.nativeEconomicOps.current.stage === 'terminal');
    const names = s.scene.f.spawnCalls.filter(call => call.memory.economicTrialId === 'native-econ-one');
    assert.deepEqual(names.map(call => call.memory.role).sort(), ['remoteHauler', 'remoteMiner', 'scout']);
    assert.equal(s.scene.current.evidence.confirmedSpawnCost, names.reduce((sum, call) => sum + call.cost, 0));
    const summary = global.RemoteTrialOps.status('native-one');
    assert.equal(summary.economic.tailStatus, 'unverified');
    assert.equal(summary.controlClosureConfirmed, true);
    assert.ok(summary.observations.firstMovementAt > summary.observations.bornAt);
    assert.ok(summary.observations.sourceSeenAt >= summary.observations.enteredRemoteAt);
    assert.equal(Memory.empire.control.policy.remoteMining.nativeTrialOps.enabled, false);
    const old = JSON.stringify(s.scene.state.previous), count = names.length;
    for (let i = 0; i < 5; i++) s.advance();
    assert.equal(JSON.stringify(s.scene.state.previous), old);
    assert.equal(s.scene.f.spawnCalls.filter(call => call.memory.economicTrialId === 'native-econ-one').length, count);
});
for (const boundary of ['archive_preparation', 'release_confirming', 'start_prepared', 'observing']) {
    test('native_ops_reset_at_each_intent_boundary_' + boundary, async () => {
        const s = await setup(); s.submit();
        await until(s, () => Memory.empire.remoteMining.nativeEconomicOps?.current.stage === boundary);
        const request = structuredClone(Memory.empire.remoteMining.nativeEconomicOps.current.request);
        const start = structuredClone(Memory.empire.remoteMining.nativeEconomicOps.current.startRequest);
        s.scene.restoreMemory(); s.advance();
        assert.deepEqual(Memory.empire.remoteMining.nativeEconomicOps.current.request, request);
        if (start) assert.deepEqual(Memory.empire.remoteMining.nativeEconomicOps.current.startRequest, start);
        assert.ok(s.scene.f.spawnCalls.filter(call => call.memory.economicTrialId === 'native-econ-one').length <= 1);
    });
}
for (const deadline of ['stopAtMs', 'notAfterMs']) test('native_ops_wall_tick_limit_and_server_gap_' + deadline, async () => {
    const s = await setup(); s.submit();
    await until(s, () => s.scene.current?.identity.trialId === 'native-econ-one');
    const time = Memory.empire.remoteMining.nativeEconomicOps.current.request[deadline];
    s.advance({nowMs: time});
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(Memory.empire.remoteRooms.W1N2.hold, true);
    assert.ok(s.scene.current.outcome);
});
test('native_ops_unknown_applied_does_not_advance', async () => {
    const s = await setup(); s.submit();
    await until(s, () => Memory.empire.remoteMining.nativeEconomicOps?.current.stage === 'archive_preparation');
    const service = s.scene.f.services.find(v => v.name === 'NativeEconomicTrialOps');
    const persist = service.persist.bind(service);
    service.persist = state => {
        if (state?.current?.intents.replace_release_request?.status === 'applied') throw new Error('lost result record');
        persist(state);
    };
    s.advance();
    assert.equal(Memory.empire.control.policy.remoteMining.economicTrial.request.action, 'release');
    s.scene.restoreMemory();
    for (let i = 0; i < 5; i++) s.advance();
    assert.equal(Memory.empire.remoteMining.nativeEconomicOps.current.unknownEffect, true);
    assert.equal(s.scene.f.spawnCalls.filter(c => c.memory.economicTrialId === 'native-econ-one').length, 0);
});
test('native_ops_intent_or_archive_failure_blocks_start', async () => {
    const s = await setup(); s.submit(); s.advance();
    const service = s.scene.f.services.find(v => v.name === 'NativeEconomicTrialOps');
    service.persist = () => {throw new Error('cannot persist intent');};
    s.advance();
    assert.deepEqual(Memory.empire.control.policy.remoteMining.economicTrial.request, s.profile.oldPreparation);
    assert.equal(s.scene.f.spawnCalls.filter(c => c.memory.economicTrialId).length, 0);
});
test('native_ops_record_failure_cannot_block_owned_close', async () => {
    const s = await setup(); s.submit();
    await until(s, () => s.scene.current?.identity.trialId === 'native-econ-one');
    const service = s.scene.f.services.find(v => v.name === 'NativeEconomicTrialOps');
    service.persist = () => {throw new Error('record failed');};
    s.advance();
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.ok(s.scene.current.outcome);
});
test('native_ops_activation_result_record_failure_withdraws_before_admission', async () => {
    const s = await setup(); s.submit();
    await until(s, () => Memory.empire.remoteMining.nativeEconomicOps?.current.stage === 'start_prepared');
    const service = s.scene.f.services.find(v => v.name === 'NativeEconomicTrialOps');
    const persist = service.persist.bind(service);
    service.persist = state => {
        if (state?.current?.intents.activate_start?.status === 'applied') throw new Error('activation record interrupted');
        persist(state);
    };
    s.advance();
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.notEqual(s.scene.current.identity.trialId, 'native-econ-one');
    assert.equal(s.scene.f.spawnCalls.filter(c => c.memory.economicTrialId === 'native-econ-one').length, 0);
});
for (const field of ['stopAtMs', 'codeVersion', 'trialId', 'startSequence']) test('native_ops_corrupt_request_cannot_renew_window_' + field, async () => {
    const s = await setup(); s.submit();
    await until(s, () => s.scene.current?.identity.trialId === 'native-econ-one');
    Memory.empire.remoteMining.nativeEconomicOps.current.request[field] = field === 'startSequence' ? 4 : 'corrupted';
    s.advance();
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
});
for (const condition of ['epoch', 'busy_spawn', 'energy']) test('native_ops_activation_rechecks_' + condition, async () => {
    const s = await setup(); s.submit();
    await until(s, () => Memory.empire.remoteMining.nativeEconomicOps?.current.stage === 'start_prepared');
    if (condition === 'epoch') Memory.empire.remoteMining.operations[s.profile.remoteId].epoch++;
    if (condition === 'busy_spawn') s.scene.f.spawns.Spawn1.spawning = {name: 'CoreBusy', remainingTime: 30};
    if (condition === 'energy') s.scene.f.home.energyAvailable = 0;
    s.advance();
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(s.scene.f.spawnCalls.filter(c => c.memory.economicTrialId === 'native-econ-one').length, 0);
});
test('native_ops_missed_activation_does_not_reschedule', async () => {
    const s = await setup(); s.submit();
    await until(s, () => Memory.empire.remoteMining.nativeEconomicOps?.current.stage === 'start_prepared');
    const original = structuredClone(Memory.empire.remoteMining.nativeEconomicOps.current.startRequest);
    Game.time++; s.advance();
    assert.deepEqual(Memory.empire.remoteMining.nativeEconomicOps.current.startRequest, original);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(s.scene.f.spawnCalls.filter(c => c.memory.economicTrialId === 'native-econ-one').length, 0);
});
test('native_ops_unknown_ledger_not_replayed', async () => {
    const s = await setup({onSpawn() {throw new Error('opaque engine boundary');}}); s.submit();
    let interrupted = false;
    for (let i = 0; i < 15; i++) {
        try {s.advance();} catch (e) {assert.match(e.message, /opaque engine/); interrupted = true; break;}
    }
    assert.ok(interrupted);
    const requestId = s.scene.current.slots.scout.requestId;
    s.scene.restoreMemory(); s.advance();
    assert.ok(Memory.empire.remoteMining.budgets.W1N1.grants[requestId]);
    assert.equal(s.scene.current.evidence.unknownEnergyUpperBound, 50);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
});
for (const condition of ['market', 'goal', 'core', 'receiver', 'danger', 'ledger_unknown']) {
    test('native_ops_running_safety_' + condition, async () => {
        const s = await setup({visible: true}); s.submit();
        await until(s, () => s.scene.current?.identity.trialId === 'native-econ-one');
        if (condition === 'market') Memory.empire.market.enabled = true;
        if (condition === 'goal') Memory.empire.control.policy.goalPlanning.enabled = true;
        if (condition === 'core') global.RoomPhase.W1N1.recovery.mode = 'critical';
        if (condition === 'receiver') s.scene.f.homeSink.store.energy = 299999;
        if (condition === 'danger') s.scene.f.visibleHostiles.push({pos: new RoomPosition(20, 20, 'W1N2')});
        if (condition === 'ledger_unknown') s.scene.f.operation.ledger.confirmationUnknown = 1;
        s.advance();
        assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
        assert.ok(s.scene.current.outcome);
    });
}
test('native_ops_summary_failure_not_permission', async () => {
    const s = await setup(); s.submit();
    await until(s, () => s.scene.current?.identity.trialId === 'native-econ-one');
    const service = s.scene.f.services.find(v => v.name === 'NativeEconomicTrialOps');
    service.summarize = () => {throw new Error('summary failed');};
    assert.equal(global.RemoteTrialOps.status('native-one').status, 'summary_failed');
    s.advance({nowMs: Memory.empire.remoteMining.nativeEconomicOps.current.request.stopAtMs});
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
});
test('native_ops_initial_refusal_survives_reset_without_rearming', async () => {
    const s = await setup(); s.submit(); s.scene.f.home.energyAvailable = 0;
    s.advance();
    assert.equal(Memory.empire.remoteMining.nativeEconomicOps?.current?.stage, 'terminal');
    s.scene.f.home.energyAvailable = 1900; s.scene.restoreMemory();
    for (let i = 0; i < 4; i++) s.advance();
    assert.equal(global.RemoteTrialOps.status('native-one').outcome.reason, 'preflight_refused');
    assert.deepEqual(Memory.empire.control.policy.remoteMining.economicTrial.request, s.profile.oldPreparation);
});
test('native_ops_invalid_request_rejection_is_durable', async () => {
    const s = await setup(); s.submit({codeVersion: 'wrong-version'}); s.advance();
    assert.equal(global.RemoteTrialOps.status('native-one')?.status, 'rejected');
    s.scene.restoreMemory(); s.advance();
    assert.equal(global.RemoteTrialOps.status('native-one')?.status, 'rejected');
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
});
test('native_ops_pending_hold_reset_still_withdraws_without_replaying_intent', async () => {
    const s = await setup(); s.submit();
    await until(s, () => s.scene.current?.identity.trialId === 'native-econ-one');
    const service = s.scene.f.services.find(v => v.name === 'NativeEconomicTrialOps');
    const perform = service.perform.bind(service);
    service.perform = effect => {if (effect.type !== 'hold_owned_session') perform(effect);};
    s.advance({nowMs: Memory.empire.remoteMining.nativeEconomicOps.current.request.stopAtMs});
    assert.equal(Memory.empire.remoteMining.nativeEconomicOps.current.intents.hold_owned_session.status, 'planned');
    s.scene.restoreMemory(); s.advance();
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.ok(s.scene.current.outcome);
    assert.equal(Memory.empire.remoteMining.nativeEconomicOps.current.intents.hold_owned_session.status, 'planned');
    await until(s, () => Memory.empire.remoteMining.nativeEconomicOps.current.stage === 'terminal');
    assert.equal(Memory.empire.remoteMining.nativeEconomicOps.current.unknownEffect, true);
});
test('native_ops_deadline_crosses_after_dispatch_before_spawn', async () => {
    const s = await setup(); s.submit();
    await until(s, () => Memory.empire.remoteMining.nativeEconomicOps?.current.stage === 'start_prepared');
    const stopAt = Memory.empire.remoteMining.nativeEconomicOps.current.request.stopAtMs;
    s.advance({betweenDispatchAndRun() {s.setNowMs(stopAt);}});
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(s.scene.f.spawnCalls.filter(c => c.memory.economicTrialId === 'native-econ-one').length, 0);
});
test('native_ops_deadline_crosses_before_creep_action', async () => {
    const s = await setup(); s.submit();
    await until(s, () => s.scene.current?.identity.trialId === 'native-econ-one');
    for (let i = 0; i < 4; i++) s.advance();
    const stopAt = Memory.empire.remoteMining.nativeEconomicOps.current.request.stopAtMs;
    s.advance({beforeActionParser() {s.setNowMs(stopAt);}});
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(s.scene.calls.filter(c => c.tick === Game.time && c.method === 'moveByPath').length, 0);
});
for (const [direction, target] of [['north', 'W1N2'], ['east', 'W0N1'], ['south', 'W1N0'], ['west', 'W2N1']]) {
    test('native_ops_cardinal_native_first_delivery_' + direction, async () => {
        const s = await setup({nativeMovement: true, nativePositions: true, roomNames: {base: 'W1N1', target}});
        assert.equal(s.profile.targetRoom, target);
        s.submit();
        await until(s, () => s.scene.current?.identity.trialId === 'native-econ-one');
        await until(s, () => s.scene.current?.outcome, 950);
        assert.equal(s.scene.current.outcome.stopReason, 'first_delivery');
        assert.equal(s.scene.current.safeStreak, 100);
        assert.ok(s.scene.current.evidence.returnedEnergy > 0);
        await until(s, () => Memory.empire.remoteMining.nativeEconomicOps.current.stage === 'terminal');
        assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    });
}
test('native_ops_absent_container_waits_for_real_infrastructure', async () => {
    const s = await setup({nativeMovement: true, nativePositions: true, containerBuilt: false});
    assert.equal(JSON.parse(s.profile.oldCurrent.configFingerprint).containerId, null);
    s.submit();
    await until(s, () => s.scene.f.createdSites.length > 0 || s.scene.current?.identity.trialId === 'native-econ-one' &&
        s.scene.current.outcome, 600);
    assert.equal(s.scene.current.outcome, undefined);
    assert.equal(s.scene.current.safeStreak, 100);
    assert.deepEqual(s.scene.f.createdSites.map(site => site.type), [STRUCTURE_CONTAINER]);
    assert.equal(s.scene.f.spawnCalls.filter(c => c.memory.role === 'remoteHauler').length, 0);
    s.advance({nowMs: Memory.empire.remoteMining.nativeEconomicOps.current.request.stopAtMs});
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
});
