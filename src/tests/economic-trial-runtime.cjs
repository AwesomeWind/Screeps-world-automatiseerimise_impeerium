const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createEconomicTrialFixture } = require('./helpers/economic-trial-fixture.cjs');

test('econ_p1_runtime_default_off_and_order', async () => {
    const scene = await createEconomicTrialFixture();
    scene.advance();
    assert.equal(scene.state, undefined);
    assert.equal(Memory.empire.control.goals, undefined);
    assert.equal(scene.f.spawnCalls.filter(call => call.memory.economicTrialId).length, 0);
    const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
    assert.ok(main.indexOf('new RemoteReconTrialService(') < main.indexOf('new RemoteEconomicTrialService('));
    assert.ok(main.indexOf('new RemoteEconomicTrialService(') < main.indexOf('new RemoteMiningService('));
    const { default: Scheduler } = await import('../core/ServiceScheduler.js');
    Game.cpu.bucket = 0;
    Scheduler.beginTick();
    assert.equal(Scheduler.decision('RemoteEconomicTrial', 'run').tier, 'P0');
});

test('econ_p2_three_slots_two_spawns', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare(); scene.advance();
    assert.equal(scene.current.status, 'recon');
    const slot = scene.current.slots.scout;
    assert.ok(slot.requestId);
    assert.equal(slot.calls, 1);
    assert.equal(slot.cost, 50);
    assert.equal(scene.f.spawnCalls.filter(call => call.memory.economicTrialId).length, 1);
    scene.advance();
    assert.equal(scene.f.spawnCalls.filter(call => call.memory.economicTrialId).length, 1);
    assert.equal(scene.current.slots.remoteMiner.calls, 0);
    assert.equal(scene.current.slots.remoteHauler.calls, 0);
});

test('econ_p2_retry_keeps_request_deadline', async () => {
    const scene = await createEconomicTrialFixture();
    scene.f.results.spawn = ERR_BUSY;
    scene.prepare(); scene.advance();
    const first = structuredClone(scene.current.slots.scout);
    scene.advance();
    assert.equal(scene.current.slots.scout.requestId, first.requestId);
    assert.equal(scene.current.slots.scout.deadline, first.deadline);
    assert.equal(scene.f.spawnCalls.filter(call => call.memory.economicTrialId).length, 2);
    scene.advance();
    assert.equal(scene.f.spawnCalls.filter(call => call.memory.economicTrialId).length, 2);
    assert.ok(scene.current.outcome);
});

test('econ_p2_unknown_keeps_claim', async () => {
    const scene = await createEconomicTrialFixture({ onSpawn() { throw new Error('engine interruption'); } });
    scene.prepare();
    assert.throws(() => scene.advance(), /engine interruption/);
    const requestId = scene.current.slots.scout.requestId;
    assert.equal(scene.current.slots.scout.callState, 'call_started');
    scene.restoreMemory(); scene.advance();
    assert.equal(scene.current.outcome.stopReason, 'spawn_unknown');
    assert.ok(Memory.empire.remoteMining.budgets.W1N1.grants[requestId]);
    assert.equal(scene.current.evidence.unknownEnergyUpperBound, 50);
    assert.equal(scene.f.spawnCalls.length, 0);
});

test('econ_p3_fresh_safe_streak_and_role_costs', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare(); scene.advance();
    let reached = false;
    for (let i = 0; i < 300 && !scene.current.outcome; i++) {
        if (scene.current.safeStreak > 0 && scene.current.safeStreak < 100) {
            assert.equal(scene.f.spawnCalls.filter(call => call.memory.role === 'remoteMiner').length, 0);
        }
        if (scene.current.slots.remoteHauler.acceptedAt !== undefined) { reached = true; break; }
        scene.advance();
    }
    assert.equal(reached, true, JSON.stringify(scene.current.outcome));
    assert.equal(scene.current.safeStreak, 100);
    for (const role of ['scout', 'remoteMiner', 'remoteHauler']) {
        const calls = scene.f.spawnCalls.filter(call => call.memory.economicTrialId && call.memory.role === role && call.result === OK);
        assert.equal(calls.length, 1);
        assert.equal(scene.current.slots[role].cost, calls[0].cost);
    }
    assert.ok(scene.current.evidence.confirmedSpawnCost <= 1650);
    assert.equal(scene.current.evidence.confirmedSpawnCost,
        scene.f.spawnCalls.filter(call => call.memory.economicTrialId && call.result === OK).reduce((sum, call) => sum + call.cost, 0));
    const scout = Game.creeps[scene.current.slots.scout.name];
    assert.equal(scout.pos.roomName, 'W1N2');
});

test('econ_p3_revoke_after_intake_or_strategy', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare(); scene.advance({ betweenDispatchAndRun() {
        Memory.empire.control.policy.remoteMining.economicTrial.enabled = false;
    } });
    assert.equal(scene.f.spawnCalls.filter(call => call.memory.economicTrialId).length, 0);
    assert.ok(scene.current.outcome);
    assert.equal(Object.values(Memory.empire.remoteMining.budgets.W1N1.grants || {}).length, 0);
});

test('econ_p3_old_harvest_and_missing_adapter_denied', async () => {
    const scene = await createEconomicTrialFixture({ visible: true });
    scene.prepare(); scene.advance();
    const actor = scene.f.actor('ForgedMiner', 'remoteMiner', [WORK, CARRY, MOVE], 'W1N2', {
        remoteId: 'W1N1:W1N2', epoch: 1, targetRoom: 'W1N2', sourceId: 'remoteSourceA',
        economicTrialId: 'econ-one', economicTrialSequence: 1
    });
    actor.pos = new RoomPosition(20, 20, 'W1N2');
    const { assignTask } = await import('../core/TaskMetadata.js');
    assignTask(actor, { type: 'HARVEST', targetId: 'remoteSourceA' });
    scene.f.ActionParser.run(actor);
    assert.equal(scene.calls.filter(call => call.name === actor.name && call.method === 'harvest').length, 0);
    assignTask(actor, { type: 'HARVEST', targetId: 'remoteSourceA' });
    delete global.RemoteEconomicTrial;
    scene.f.ActionParser.run(actor);
    assert.equal(scene.calls.filter(call => call.name === actor.name && call.method === 'harvest').length, 0);
});

test('econ_p3_no_scout_means_no_safe_streak', async () => {
    const scene = await createEconomicTrialFixture({ visible: true });
    scene.prepare(); scene.advance();
    assert.equal(scene.current.safeStreak, 0);
    assert.equal(scene.f.spawnCalls.filter(call => call.memory.economicTrialId && call.memory.role === 'scout').length, 1);
});

async function until(scene, predicate, maximum = 700) {
    for (let i = 0; i < maximum; i++) {
        if (predicate()) return;
        scene.advance();
    }
    assert.fail('scenario did not reach requested boundary: ' + JSON.stringify(scene.current?.outcome));
}
test('econ_p4_real_next_tick_delivery_and_stop', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare(); scene.advance();
    await until(scene, () => scene.calls.some(call => call.method === 'transfer' && call.targetId === 'HomeSink' && call.result === OK));
    assert.equal(scene.current.firstDelivery, undefined);
    const acceptedTick = Game.time;
    scene.advance();
    assert.ok(scene.current.firstDelivery);
    assert.equal(scene.current.firstDelivery.confirmedAtTick, acceptedTick + 1);
    assert.equal(scene.current.outcome.verdict, 'completed');
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(Memory.empire.remoteRooms.W1N2.hold, true);
    const firstCount = scene.calls.length;
    scene.advance();
    assert.equal(scene.current.closureVerifiedAtTick, acceptedTick + 2);
    assert.equal(scene.calls.slice(firstCount).filter(call => ['harvest', 'withdraw', 'build', 'repair'].includes(call.method)).length, 0);
    assert.ok(scene.current.evidence.returnedEnergy > 0);
    assert.equal(scene.current.evidence.returnedEnergy, scene.f.ledger.returnedEnergyConfirmed);
    assert.ok(Object.values(scene.current.evidence.pickups).some(amount => amount >= scene.current.firstDelivery.amount));
    assert.ok(scene.current.outbox.every(item => item.stage === 'applied'));
});
test('econ_p4_owner_removed_before_consume', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare(); scene.advance();
    await until(scene, () => scene.calls.some(call => call.method === 'transfer' && call.targetId === 'HomeSink' && call.result === OK));
    const original = scene.f.market.consumeRemoteResolutions;
    scene.f.market.consumeRemoteResolutions = resolutions => {
        if (resolutions.some(value => value.context.leg === 'home_delivery')) throw new Error('before consumer');
        return original.call(scene.f.market, resolutions);
    };
    assert.throws(() => scene.advance(), /before consumer/);
    assert.ok(scene.current.outbox.some(item => item.stage === 'prepared' && item.resolution.context.leg === 'home_delivery'));
    scene.restoreMemory(); scene.advance();
    assert.equal(scene.current.outcome.verdict, 'completed');
    assert.ok(scene.current.firstDelivery.amount > 0);
    const credit = scene.f.ledger.returnedEnergyConfirmed;
    scene.advance();
    assert.equal(scene.f.ledger.returnedEnergyConfirmed, credit);
});
test('econ_p4_checkpoint_failure_retains_owner_and_closes', async () => {
    let fail = false;
    const scene = await createEconomicTrialFixture({ guardOptions: { checkpointWriter() { if (fail) throw new Error('checkpoint storage failure'); } } });
    scene.prepare(); scene.advance();
    await until(scene, () => scene.calls.some(call => call.method === 'transfer' && call.targetId === 'HomeSink' && call.result === OK));
    fail = true;
    scene.advance();
    assert.ok(scene.current.outcome);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    const owners = Object.values(Memory.rooms.W1N1.resourceMarket.reservations.demand).flatMap(record => Object.values(record.owners || {}));
    assert.ok(owners.some(owner => owner.context?.leg === 'home_delivery'));
    assert.equal(scene.current.firstDelivery, undefined);
});

test('econ_p5_bounded_tail_and_reset', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare(); scene.advance();
    await until(scene, () => !!scene.current.firstDelivery);
    const before = structuredClone(scene.current);
    scene.restoreMemory(); scene.advance();
    assert.deepEqual(scene.current.identity, before.identity);
    assert.deepEqual(scene.current.firstDelivery, before.firstDelivery);
    assert.deepEqual(scene.current.outcome, before.outcome);
    assert.equal(scene.current.evidence.confirmedSpawnCost, before.evidence.confirmedSpawnCost);
    const scout = Game.creeps[scene.current.slots.scout.name];
    scout.pos = new RoomPosition(25, 1, 'W1N2');
    scout.room = scene.f.remote;
    Game.rooms.W1N2 = scene.f.remote;
    Game.time = before.outcome.decidedAtTick + 301;
    const { assignTask } = await import('../core/TaskMetadata.js');
    assignTask(scout, { type: 'MOVE_TO', pos: { x: 10, y: 10, roomName: 'W1N1' }, path: [
        new RoomPosition(25, 0, 'W1N2'), new RoomPosition(25, 49, 'W1N1') ], allowedRooms: ['W1N1', 'W1N2'] });
    global.RemoteEconomicTrial.evaluatedAt = Game.time;
    const count = scene.calls.length;
    scene.f.ActionParser.run(scout);
    assert.equal(scene.calls.length, count);
});

for (const [label, change] of [
    ['guard_off', () => { Memory.empire.control.policy.remoteMining.economicTrial.enabled = false; }],
    ['goal_on', () => { Memory.empire.control.policy.goalPlanning.enabled = true; }],
    ['danger', scene => { scene.f.visibleHostiles.push({ pos: new RoomPosition(25, 25, 'W1N2') }); }],
    ['foreign', scene => { scene.f.remote.controller.owner = { username: 'enemy' }; }],
    ['receiver_full', scene => { scene.f.homeSink.store.energy = 299999; }],
    ['controller', scene => { scene.f.home.controller.ticksToDowngrade = 4999; }],
    ['home_core', () => { global.RoomPhase.W1N1.recovery.coreUsable.miner = 0; }],
    ['config', () => { Memory.empire.control.policy.remoteMining.bodyEnergyLimits.remoteMiner = 900; }],
    ['version', () => { global.EmpireServicesVersion = 'new-version'; }]
]) {
    test('econ_p5_stop_matrix_' + label, async () => {
        const scene = await createEconomicTrialFixture();
        scene.prepare(); scene.advance();
        await until(scene, () => scene.current.safeStreak >= 2);
        change(scene);
        const before = scene.calls.length;
        scene.advance();
        assert.ok(scene.current.outcome);
        assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
        assert.equal(scene.calls.slice(before).filter(call => ['harvest', 'withdraw', 'build', 'repair'].includes(call.method)).length, 0);
    });
}
test('econ_p5_applying_after_ledger_is_unknown_no_replay', async () => {
    let fail = false;
    const scene = await createEconomicTrialFixture({ guardOptions: { afterLedger(resolution) {
        if (fail && resolution.context.leg === 'home_delivery') throw new Error('after ledger interruption');
    } } });
    scene.prepare(); scene.advance();
    await until(scene, () => scene.calls.some(call => call.method === 'transfer' && call.targetId === 'HomeSink' && call.result === OK));
    fail = true;
    assert.throws(() => scene.advance(), /after ledger interruption/);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    const credit = scene.f.ledger.returnedEnergyConfirmed;
    assert.ok(credit > 0);
    scene.restoreMemory(); scene.advance();
    assert.equal(scene.current.outcome.stopReason, 'ledger_application_unknown');
    assert.equal(scene.current.firstDelivery, undefined);
    assert.equal(scene.f.ledger.returnedEnergyConfirmed, credit);
    assert.ok(scene.current.evidence.logisticsUnknownEnergyUpperBound >= credit);
});

test('econ_p5_record_fault_does_not_block_close', async () => {
    const scene = await createEconomicTrialFixture({ guardOptions: { detailRecorder() { throw new Error('optional detail failed'); } } });
    scene.prepare(); scene.advance();
    await until(scene, () => !!scene.current.outcome);
    assert.equal(scene.current.outcome.verdict, 'completed');
    scene.advance();
    assert.ok(scene.current.closureVerifiedAtTick);
});

test('econ_p5_corrupt_slot_does_not_authorize', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare(); scene.advance();
    scene.current.slots.remoteMiner = { calls: -10, cost: -800, acceptedAt: 0 };
    scene.advance();
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(scene.f.spawnCalls.filter(call => call.memory.role === 'remoteMiner').length, 0);
});

test('econ_p5_unexpected_actor_loss_stops_no_replacement', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare(); scene.advance();
    const scoutName = scene.current.slots.scout.name;
    delete Game.creeps[scoutName];
    for (const spawn of Object.values(Game.spawns)) spawn.spawning = null;
    delete Memory.empire.spawningCreeps[scoutName];
    scene.advance();
    assert.ok(scene.current.outcome);
    assert.equal(scene.f.spawnCalls.filter(call => call.memory.role === 'scout').length, 1);
});

test('econ_p2_grant_tag_mutation_before_native_denied', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare();
    scene.advance({ betweenDispatchAndRun() {
        const slot = scene.current.slots.scout;
        Memory.empire.remoteMining.budgets.W1N1.grants[slot.requestId].economicTrialSequence = 999;
    } });
    assert.equal(scene.f.spawnCalls.filter(call => call.memory.economicTrialId).length, 0);
    assert.ok(scene.current.outcome);
});
test('econ_p5_bad_control_shape_closes_without_throw', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare(); scene.advance();
    Memory.empire.remoteMining.economicTrials.current.identity = null;
    assert.doesNotThrow(() => scene.advance());
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
});

test('econ_p3_container_creation_rechecks_guard_before_native', async () => {
    const scene = await createEconomicTrialFixture({ containerBuilt: false });
    scene.prepare(); scene.advance();
    await until(scene, () => scene.current.safeStreak === 99);
    const sites = scene.f.createdSites.length;
    scene.advance({ betweenDispatchAndRun() { Memory.empire.control.policy.remoteMining.economicTrial.enabled = false; } });
    assert.equal(scene.f.createdSites.length, sites);
    assert.ok(scene.current.outcome);
});
test('econ_p2_infrastructure_actual_cost_and_unknown_stop', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare(); scene.advance();
    await until(scene, () => scene.current.slots.remoteMiner.name &&
        Game.creeps[scene.current.slots.remoteMiner.name]?.pos.inRangeTo(scene.f.container.pos, 0));
    scene.f.container.hits = 50000;
    await until(scene, () => scene.calls.some(call => call.method === 'repair' && call.result === OK));
    scene.advance();
    assert.ok(scene.current.evidence.confirmedInfrastructureCost > 0);
    assert.equal(scene.current.evidence.confirmedInfrastructureCost, scene.f.ledger.infrastructureEnergyConfirmed);
    // An unexplained target change must remain unknown, rather than relaxing the ledger algorithm.
    scene.f.container.hits += 123;
    scene.advance();
    assert.ok(scene.current.outcome);
    assert.ok(scene.current.evidence.unknownEnergyUpperBound > 0);
});

test('econ_p4_local_worker_confirmation_is_not_trial_evidence', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare(); scene.advance();
    const worker = scene.f.actor('LocalBuilder', 'builder', [WORK, CARRY, MOVE]);
    worker.pos = new RoomPosition(10, 11, 'W1N1');
    const { reserveForTask } = await import('../services/ResourceReservationFeedback.js');
    const { assignTask } = await import('../core/TaskMetadata.js');
    const task = { type: 'WITHDRAW', targetId: 'HomeSink', resourceType: RESOURCE_ENERGY, amount: 50 };
    assert.equal(reserveForTask(global.ResourceMarket.W1N1, 'supply', { id: 'local-energy', resourceType: RESOURCE_ENERGY },
        50, worker, task), true);
    assignTask(worker, task);
    scene.f.ActionParser.run(worker);
    scene.f.market.cleanup();
    scene.advance();
    assert.equal(worker.store.energy, 50);
    assert.equal(scene.current.outcome, undefined);
    assert.equal(scene.current.outbox.length, 0);
});

test('econ_p6_summary_is_read_only_and_metrics_independent', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare(); scene.advance();
    Memory.empire.control.policy.telemetry.enabled = false;
    await until(scene, () => !!scene.current.firstDelivery);
    const before = JSON.stringify(scene.state);
    const { summarizeEconomicTrial } = await import('../services/RemoteEconomicTrialModel.js');
    const summary = summarizeEconomicTrial(scene.state, { tick: Game.time, nowMs: 1000000, codeVersion: 'econ-v1' });
    assert.equal(JSON.stringify(scene.state), before);
    assert.equal(summary.current.settlement.netEnergy,
        scene.current.evidence.returnedEnergy - scene.current.evidence.confirmedSpawnCost - scene.current.evidence.confirmedInfrastructureCost);
    assert.equal(Memory.empire.control.goals, undefined);
    assert.equal(Memory.empire.control.policy.goalPlanning.enabled, false);
    assert.equal(Memory.empire.market.enabled, false);
});
test('econ_p5_receipt_expiry_keeps_bound_cost', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare(); scene.advance();
    const cost = scene.current.evidence.confirmedSpawnCost;
    delete Memory.empire.remoteMining.budgets.W1N1.receipts[scene.current.slots.scout.requestId];
    scene.restoreMemory(); scene.advance();
    assert.equal(scene.current.evidence.confirmedSpawnCost, cost);
    assert.equal(scene.current.slots.scout.receiptBinding.name, scene.current.slots.scout.name);
});

test('econ_p5_failed_handoff_does_not_extend_owner_deadline', async () => {
    let fail = false;
    const scene = await createEconomicTrialFixture({ guardOptions: { checkpointWriter() { if (fail) throw new Error('handoff failed'); } } });
    scene.prepare(); scene.advance();
    await until(scene, () => scene.calls.some(call => call.method === 'transfer' && call.targetId === 'HomeSink' && call.result === OK));
    fail = true; scene.advance();
    const records = () => Object.values(Memory.rooms.W1N1.resourceMarket.reservations.demand).flatMap(record => Object.values(record.owners || {}));
    const owner = records()[0];
    const deadline = owner.maxExpiresAt;
    assert.equal(deadline, owner.assignedAt + 50);
    while (Game.time <= deadline) scene.advance();
    assert.equal(records().length, 0);
    assert.ok(scene.current.failedHandoff);
    assert.ok(scene.current.evidence.logisticsUnknownEnergyUpperBound > 0);
});

for (const badStreak of ['100', null, -1, 101]) {
    test('review_safe_streak_corruption_denies_' + String(badStreak), async () => {
        const scene = await createEconomicTrialFixture({ visible: true });
        scene.prepare(); scene.advance();
        await until(scene, () => scene.current.safeStreak === 1);
        scene.current.safeStreak = badStreak;
        scene.restoreMemory(); scene.advance();
        assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
        assert.equal(scene.f.spawnCalls.filter(call => call.memory.role === 'remoteMiner').length, 0);
        assert.equal(scene.current.safeStreak, badStreak);
    });
}
test('review_safe_streak_numeric_jump_denied', async () => {
    const scene = await createEconomicTrialFixture({ visible: true });
    scene.prepare(); scene.advance();
    await until(scene, () => scene.current.safeStreak === 1);
    scene.current.safeStreak = 100;
    scene.restoreMemory(); scene.advance();
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(scene.f.spawnCalls.filter(call => call.memory.role === 'remoteMiner').length, 0);
});
function removeTrialActors(scene) {
    for (const actor of Object.values(Game.creeps)) if (actor.memory.economicTrialId) {
        delete Game.creeps[actor.name];
        delete Memory.empire.spawningCreeps[actor.name];
    }
}
function releaseRequest(scene) {
    const settings = Memory.empire.control.policy.remoteMining.economicTrial;
    settings.request = { ...settings.request, action: 'release', id: 'release-one', sequence: 2,
        targetTrialId: scene.current.identity.trialId, activateAtTick: Game.time + 1, expiresAtTick: Game.time + 1001 };
}
test('review_unsettled_infrastructure_blocks_release', async () => {
    const scene = await createEconomicTrialFixture({ guardOptions: { afterInfrastructureLedger() { throw new Error('infra interrupted'); } } });
    scene.prepare(); scene.advance();
    await until(scene, () => scene.current.slots.remoteMiner.name &&
        Game.creeps[scene.current.slots.remoteMiner.name]?.pos.inRangeTo(scene.f.container.pos, 0));
    scene.f.container.hits = 50000;
    await until(scene, () => scene.calls.some(call => call.method === 'repair' && call.result === OK));
    assert.throws(() => scene.advance(), /infra interrupted/);
    scene.advance();
    removeTrialActors(scene);
    releaseRequest(scene);
    scene.advance();
    assert.equal(scene.current.managed, true);
    assert.equal(scene.state.lastRejection.reason, 'release_blocked');
    assert.equal(scene.current.infrastructureAttempt.stage, 'applying');
});
test('review_single_spawn_finishes_without_request_renewal', async () => {
    const scene = await createEconomicTrialFixture();
    delete Game.spawns.Spawn2;
    scene.prepare(); scene.advance();
    let deadline;
    for (let i = 0; i < 850 && !scene.current.outcome; i++) {
        if (scene.current.slots.remoteHauler.requestId) deadline ??= scene.current.slots.remoteHauler.deadline;
        scene.advance();
    }
    assert.equal(scene.current.outcome?.verdict, 'completed', JSON.stringify(scene.current.outcome));
    assert.equal(scene.current.slots.remoteHauler.deadline, deadline);
    assert.equal(scene.f.spawnCalls.filter(call => call.memory.economicTrialId).length, 3);
});
test('review_not_started_reset_is_not_unknown', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare();
    assert.throws(() => scene.advance({ betweenDispatchAndRun() { throw new Error('before run'); } }), /before run/);
    const before = structuredClone(scene.current.slots.scout);
    assert.equal(before.callState, 'not_started');
    assert.equal(before.calls, 0);
    scene.restoreMemory(); scene.advance();
    assert.equal(scene.current.outcome, undefined);
    assert.equal(scene.current.slots.scout.calls, 1);
    assert.equal(scene.current.slots.scout.requestId, before.requestId);
    assert.equal(scene.current.slots.scout.deadline, before.deadline);
    assert.equal(scene.current.evidence.unknownEnergyUpperBound, 0);
    assert.equal(scene.f.ledger.spawnEnergyUnknownUpperBound, 0);
});
test('review_partial_spawn_receipt_is_not_completed_accounting', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare();
    assert.throws(() => scene.advance({ betweenDispatchAndRun() {
        Object.defineProperty(scene.f.ledger, 'spawnEnergyConfirmed', { configurable: true, enumerable: true,
            get() { return 0; }, set() { throw new Error('receipt before aggregate'); } });
    } }), /receipt before aggregate/);
    const requestId = scene.current.slots.scout.requestId;
    assert.ok(Memory.empire.remoteMining.budgets.W1N1.receipts[requestId]);
    scene.restoreMemory(); scene.advance();
    assert.equal(scene.current.evidence.confirmedSpawnCost, 0);
    assert.equal(scene.current.evidence.unknownEnergyUpperBound, 50);
    assert.equal(scene.f.ledger.spawnEnergyConfirmed, 0);
    assert.equal(scene.f.ledger.spawnEnergyUnknownUpperBound, 50);
    assert.ok(Memory.empire.remoteMining.budgets.W1N1.grants[requestId]);
    assert.equal(global.RemoteEconomicTrial.summary.current.settlement.netEnergy, null);
});
test('review_release_then_pending_start_cannot_run_unmanaged', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare(); scene.advance();
    await until(scene, () => !!scene.current.firstDelivery);
    scene.advance(); removeTrialActors(scene); releaseRequest(scene); scene.advance();
    assert.equal(scene.current.managed, false);
    const activation = Game.time + 5;
    scene.prepare({ id: 'econ-two', sequence: 3, activateAtTick: activation, expiresAtTick: activation + 1000 });
    const count = scene.f.spawnCalls.length;
    scene.advance();
    assert.equal(scene.state.lastRejection.reason, 'activation_pending');
    assert.equal(scene.f.spawnCalls.length, count);
});

test('econ_p3_role_target_action_matrix', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare(); scene.advance();
    await until(scene, () => ['scout', 'remoteMiner', 'remoteHauler'].every(role => {
        const actor = Game.creeps[scene.current.slots[role].name];
        return actor && !actor.spawning;
    }));
    const { assignTask } = await import('../core/TaskMetadata.js');
    const cases = [
        ['scout', { type: 'HARVEST', targetId: 'remoteSourceA' }],
        ['scout', { type: 'REPAIR', targetId: 'RemoteContainer' }],
        ['remoteMiner', { type: 'HARVEST', targetId: 'remoteSourceB' }],
        ['remoteMiner', { type: 'WITHDRAW', targetId: 'RemoteContainer', resourceType: RESOURCE_ENERGY }],
        ['remoteMiner', { type: 'TRANSFER', targetId: 'HomeSink', resourceType: RESOURCE_ENERGY }],
        ['remoteHauler', { type: 'HARVEST', targetId: 'remoteSourceA' }],
        ['remoteHauler', { type: 'REPAIR', targetId: 'RemoteContainer' }],
        ['remoteHauler', { type: 'RESERVE', targetId: 'controller:W1N2' }]
    ];
    for (const [role, task] of cases) {
        const actor = Game.creeps[scene.current.slots[role].name];
        const count = scene.calls.length;
        assignTask(actor, task);
        scene.f.ActionParser.run(actor);
        assert.equal(scene.calls.length, count, role + ':' + task.type);
        assert.equal(actor.memory.lastTaskClear.reason, 'economic_trial_action_denied');
    }
});

test('econ_p1_malformed_enabled_policy_cannot_fall_back_to_unmanaged', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare();
    Memory.empire.control.policy.remoteMining.economicTrial.enabled = 'true';
    scene.advance();
    assert.equal(scene.state, undefined);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(scene.f.spawnCalls.filter(call => ['scout', 'remoteMiner', 'remoteHauler'].includes(call.memory.role)).length, 0);
});
test('econ_p5_corrupt_identity_does_not_block_local_worker', async () => {
    const scene = await createEconomicTrialFixture();
    scene.prepare(); scene.advance();
    const worker = scene.f.actor('LocalWorker', 'builder', [WORK, CARRY, MOVE]);
    worker.pos = new RoomPosition(10, 11, 'W1N1');
    const { assignTask } = await import('../core/TaskMetadata.js');
    assignTask(worker, { type: 'WITHDRAW', targetId: 'HomeSink', resourceType: RESOURCE_ENERGY, amount: 50 });
    scene.current.identity = null;
    scene.advance();
    assert.equal(scene.calls.filter(call => call.name === worker.name && call.method === 'withdraw' && call.result === OK).length, 1);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
});
