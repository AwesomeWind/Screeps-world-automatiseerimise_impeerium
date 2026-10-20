const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createReconTrialFixture } = require('./helpers/recon-trial-fixture.cjs');

function dangerEnemy(roomName = 'W1N2') {
    return { id: 'hostile-A', name: 'visitor', owner: { username: 'Invader' },
        pos: new RoomPosition(5, 5, roomName), body: [{ type: MOVE, hits: 100 }] };
}

for (const fault of ['normal', 'recorder', 'owner', 'body', 'normalize', 'pending_write', 'final_write', 'schema', 'cpu']) {
    test(`danger_record_failure_never_delays_shutdown_${fault}`, async () => {
        const { recordStoppedTrialDanger } = await import('../services/RemoteDangerEvidence.js');
        const seen = [];
        let writes = 0;
        const scene = await createReconTrialFixture({ guardOptions: { dangerRecorder(transition, deps) {
            seen.push({ enabled: Memory.empire.remoteRooms.W1N2.enabled,
                hold: Memory.empire.remoteRooms.W1N2.hold,
                recon: Memory.empire.remoteMining.operations['W1N1:W1N2'].allowRecon,
                outbound: global.RemoteReconTrial.permit.allowOutbound,
                spawn: global.RemoteReconTrial.permit.allowSpawn,
                outboundTask: Object.values(Game.creeps).some(actor => actor.memory.task?.pos?.roomName === 'W1N2') });
            if (fault === 'recorder') throw new Error('injected recorder failure');
            const overrides = { ...deps };
            if (fault === 'normalize') overrides.normalizeActor = () => { throw new Error('normalizer failed'); };
            if (['pending_write', 'final_write'].includes(fault)) overrides.writeStore = value => {
                writes++;
                if (fault === 'pending_write' || writes === 2) throw new Error('injected write failure');
                Memory.empire.remoteMining.dangerEvidence = value;
            };
            return recordStoppedTrialDanger(transition, overrides);
        } } });
        scene.prepare(); scene.advance();
        for (let tick = 102; tick <= 104; tick++) scene.advance({ tick });
        const expires = scene.state.current.expiresAtTick;
        const wall = scene.state.current.expiresAtMs;
        const controls = structuredClone(Memory.empire.control.policy);
        const enemy = dangerEnemy();
        if (fault === 'owner' || fault === 'body') Object.defineProperty(enemy, fault, { get() { throw new Error('field failed'); } });
        if (fault === 'schema') Memory.empire.remoteMining.dangerEvidence = { schemaVersion: 99, records: [] };
        if (fault === 'cpu') Game.cpu.getUsed = () => 16;
        scene.fixture.visibleHostiles.push(enemy);
        const moveStart = scene.moves.length;
        assert.doesNotThrow(() => scene.advance({ visibility: true }));
        assert.deepEqual(seen, [{ enabled: false, hold: true, recon: false, outbound: false, spawn: false, outboundTask: false }]);
        assert.equal(scene.state.current.outcome.stopReason, 'danger');
        assert.equal(scene.state.current.outcome.decidedAtTick, Game.time);
        assert.equal(scene.state.current.expiresAtTick, expires);
        assert.equal(scene.state.current.expiresAtMs, wall);
        assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.reconTrialId).length, 1);
        assert.ok(scene.moves.slice(moveStart).every(move => move.goal?.roomName !== 'W1N2'));
        assert.deepEqual(Memory.empire.control.policy, { ...controls,
            remoteMining: { ...controls.remoteMining, enabled: false } });
        const data = Memory.empire.remoteMining.dangerEvidence;
        if (fault === 'normal') assert.equal(data.records[0].actors[0].id, 'hostile-A');
        if (fault === 'normalize') assert.equal(data.records[0].captureReason, 'normalize_failed');
        if (fault === 'owner' || fault === 'body') assert.equal(data.records[0].captureStatus, 'partial');
        if (fault === 'schema') assert.equal(data.schemaVersion, 99);
        if (fault === 'pending_write') assert.equal(data, undefined);
        if (fault === 'final_write') assert.equal(data.records[0].captureStatus, 'failed');
        if (fault === 'cpu') assert.equal(data.records[0].captureStatus, 'skipped_cpu');
        scene.advance();
        assert.equal(scene.state.current.status, 'aborted');
        assert.ok(scene.state.current.closureVerifiedAtTick > scene.state.current.closeAppliedAtTick);
        assert.equal(seen.length, 1);
    });
}

test('danger_capture_home_reason_uses_home_room', async () => {
    const scene = await createReconTrialFixture(); scene.prepare(); scene.advance();
    scene.fixture.visibleHostiles.push(dangerEnemy('W1N1'));
    scene.advance();
    const record = Memory.empire.remoteMining.dangerEvidence.records[0];
    assert.equal(record.stopReason, 'home_danger');
    assert.equal(record.observedRoom, 'W1N1');
    assert.equal(record.actors[0].pos.roomName, 'W1N1');
});

test('danger_hook_skipped_for_other_stop_causes', async () => {
    let reads = 0;
    const scene = await createReconTrialFixture({ guardOptions: { dangerRecorder() { reads++; } } });
    scene.prepare(); scene.advance();
    Memory.empire.remoteRooms.W1N2.hold = true;
    scene.advance();
    assert.equal(reads, 0);
    assert.equal(Memory.empire.remoteMining.dangerEvidence, undefined);
});

test('danger_guard_still_closes_when_remote_p2_skipped', async () => {
    const scene = await createReconTrialFixture(); scene.prepare(); scene.advance();
    scene.fixture.visibleHostiles.push(dangerEnemy());
    scene.advance({ visibility: true, skipRemote: true });
    assert.equal(scene.state.current.outcome.stopReason, 'danger');
    assert.equal(Memory.empire.remoteRooms.W1N2.enabled, false);
    assert.equal(Memory.empire.remoteMining.dangerEvidence.records[0].actors[0].id, 'hostile-A');
});

async function stoppedDangerScene(options = {}) {
    const scene = await createReconTrialFixture(options);
    scene.prepare(); scene.advance();
    scene.fixture.visibleHostiles.push(dangerEnemy());
    scene.advance({ visibility: true });
    assert.equal(scene.state.current.status, 'stopping');
    return scene;
}

test('danger_success_survives_memory_roundtrip_and_reset', async () => {
    const scene = await stoppedDangerScene();
    const snapshot = structuredClone(Memory.empire.remoteMining.dangerEvidence);
    const outcome = structuredClone(scene.state.current.outcome);
    scene.restoreMemory();
    for (const actor of Object.values(Game.creeps)) assert.equal(actor.memory, Memory.creeps[actor.name]);
    scene.advance({ visibility: false });
    assert.deepEqual(Memory.empire.remoteMining.dangerEvidence, snapshot);
    assert.deepEqual(scene.state.current.outcome, outcome);
    assert.equal(scene.state.current.status, 'aborted');
    assert.ok(scene.state.current.closureVerifiedAtTick > scene.state.current.closeAppliedAtTick);
    assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.reconTrialId).length, 1);
});

test('danger_reset_fixture_uses_current_memory', async () => {
    const scene = await stoppedDangerScene();
    const oldMemory = Memory;
    scene.restoreMemory();
    scene.prepare({ id: 'trial-two', sequence: 2 });
    assert.equal(Memory.empire.remoteRooms.W1N2.enabled, true);
    assert.equal(oldMemory.empire.remoteRooms.W1N2.enabled, false);
    assert.equal(scene.fixture.memory, Memory);
});

test('danger_pending_reset_is_interrupted_not_backfilled', async () => {
    const model = await import('../services/RemoteDangerEvidenceModel.js');
    let context;
    let captures = 0;
    const scene = await stoppedDangerScene({ guardOptions: { dangerRecorder(transition) {
        captures++;
        context = model.dangerContextForStop(transition.before, transition.after, transition.clock);
        Memory.empire.remoteMining.dangerEvidence = model.beginDangerEvidence(undefined, context).next;
        return { attempted: true, persisted: true, captureStatus: 'pending' };
    } } });
    const pending = structuredClone(Memory.empire.remoteMining.dangerEvidence);
    scene.restoreMemory();
    scene.fixture.visibleHostiles.splice(0, Infinity, { ...dangerEnemy(), id: 'different-enemy' });
    scene.advance({ visibility: true });
    assert.equal(captures, 1);
    assert.deepEqual(Memory.empire.remoteMining.dangerEvidence, pending);
    const summary = model.dangerEvidenceSummary(pending, context, Game.time, 100);
    assert.equal(summary.effectiveStatus, 'interrupted');
    assert.equal(summary.rawCaptureStatus, 'pending');
    assert.ok(!JSON.stringify(pending).includes('different-enemy'));
    assert.equal(scene.state.current.status, 'aborted');
});

test('danger_committed_terminal_record_survives_new_module_instance', async () => {
    const options = { guardOptions: {} };
    const scene = await stoppedDangerScene(options);
    const snapshot = structuredClone(Memory.empire.remoteMining.dangerEvidence);
    const freshAdapter = await import('../services/RemoteDangerEvidence.js?reset-evidence=1');
    let replays = 0;
    options.guardOptions.dangerRecorder = (...args) => { replays++; return freshAdapter.recordStoppedTrialDanger(...args); };
    scene.restoreMemory();
    scene.advance();
    assert.equal(replays, 0);
    assert.deepEqual(Memory.empire.remoteMining.dangerEvidence, snapshot);
    assert.equal(scene.state.current.status, 'aborted');
});

test('danger_terminal_result_is_not_overwritten', async () => {
    const scene = await stoppedDangerScene();
    const snapshot = structuredClone(Memory.empire.remoteMining.dangerEvidence);
    const outcome = structuredClone(scene.state.current.outcome);
    scene.restoreMemory();
    scene.fixture.visibleHostiles.splice(0, Infinity, { ...dangerEnemy(), id: 'later-enemy' });
    for (let index = 0; index < 3; index++) scene.advance({ visibility: index !== 1 });
    assert.deepEqual(Memory.empire.remoteMining.dangerEvidence, snapshot);
    assert.deepEqual(scene.state.current.outcome, outcome);
});

test('danger_legacy_aborted_trial_reports_not_recorded', async () => {
    const scene = await stoppedDangerScene();
    delete Memory.empire.remoteMining.dangerEvidence;
    scene.restoreMemory(); scene.advance();
    assert.equal(Memory.empire.remoteMining.dangerEvidence, undefined);
    const { dangerEvidenceSummary } = await import('../services/RemoteDangerEvidenceModel.js');
    const current = scene.state.current;
    assert.equal(dangerEvidenceSummary(undefined, { identity: current.identity,
        decidedAtTick: current.outcome.decidedAtTick, stopReason: current.outcome.stopReason }, Game.time, 100).effectiveStatus, 'not_recorded');
});

test('danger_schema_corruption_does_not_poison_guard', async () => {
    const scene = await stoppedDangerScene();
    Memory.empire.remoteMining.dangerEvidence = { schemaVersion: 99, records: ['preserve-me'] };
    scene.restoreMemory(); scene.advance();
    assert.equal(scene.state.current.status, 'aborted');
    assert.equal(global.RemoteReconTrial.permit.allowOutbound, false);
    assert.deepEqual(Memory.empire.remoteMining.dangerEvidence, { schemaVersion: 99, records: ['preserve-me'] });
});

test('danger_default_off_has_no_namespace_or_capture', async () => {
    let calls = 0;
    const scene = await createReconTrialFixture({ guardOptions: {
        dangerRecorder() { calls++; }, dangerReader() { calls++; }
    } });
    scene.runTick(); scene.advance();
    assert.equal(calls, 0);
    assert.equal(Memory.empire.remoteMining.dangerEvidence, undefined);
    assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.reconTrialId).length, 0);
});

test('danger_summary_failure_preserves_control_summary', async () => {
    const scene = await stoppedDangerScene({ guardOptions: { dangerReader() { throw new Error('reader failed'); } } });
    assert.equal(global.RemoteReconTrial.summary.status, 'stopping');
    assert.equal(global.RemoteReconTrial.permit.allowOutbound, false);
    assert.equal(global.RemoteReconTrial.summary.dangerEvidence.current.effectiveStatus, 'read_failed');
    scene.advance();
    assert.equal(global.RemoteReconTrial.summary.status, 'aborted');
    assert.equal(Memory.empire.remoteMining.dangerEvidence.records[0].captureStatus, 'captured');
});

test('danger_summary_does_not_duplicate_actors_and_metrics_preserves_times', async () => {
    const scene = await stoppedDangerScene(); scene.advance();
    const { default: Metrics } = await import('../services/EmpireMetricsService.js');
    const metrics = new Metrics('EmpireMetrics');
    Memory.empire.control.policy.telemetry.metricsInterval = 1;
    metrics.cleanup();
    const first = structuredClone(Memory.empire.control.metrics.reconTrial);
    const before = first.dangerEvidence.current;
    assert.equal(before.effectiveStatus, 'captured');
    assert.equal(before.actors, undefined);
    assert.ok(JSON.stringify(before).length <= 1500);
    const record = structuredClone(Memory.empire.remoteMining.dangerEvidence);
    scene.advance(); metrics.cleanup();
    const after = Memory.empire.control.metrics.reconTrial;
    assert.ok(after.capturedAt > first.capturedAt);
    assert.equal(after.dangerEvidence.current.capturedAtTick, before.capturedAtTick);
    assert.equal(after.dangerEvidence.current.decidedAtTick, before.decidedAtTick);
    assert.deepEqual(Memory.empire.remoteMining.dangerEvidence, record);
});

test('danger_telemetry_disabled_does_not_disable_guard_capture', async () => {
    const scene = await createReconTrialFixture(); scene.prepare(); scene.advance();
    Memory.empire.control.policy.telemetry.enabled = false;
    scene.fixture.visibleHostiles.push(dangerEnemy());
    scene.advance({ visibility: true });
    assert.equal(Memory.empire.remoteMining.dangerEvidence.records[0].captureStatus, 'captured');
    assert.equal(scene.state.current.outcome.stopReason, 'danger');
    assert.equal(Memory.empire.control.metrics.reconTrial, undefined);
});

test('danger_snapshot_never_authorizes_economy', async () => {
    const scene = await createReconTrialFixture(); scene.prepare(); scene.advance();
    const enemy = dangerEnemy(); enemy.owner.username = 'TrustedAlly';
    scene.fixture.visibleHostiles.push(enemy); scene.advance({ visibility: true });
    assert.equal(Memory.empire.remoteMining.dangerEvidence.records[0].actors[0].ownerUsername, 'TrustedAlly');
    assert.equal(scene.state.current.outcome.stopReason, 'danger');
    assert.equal(global.RemoteMining['W1N1:W1N2'].state.allowEconomicDeparture, false);
    assert.equal(Memory.empire.control.policy.goalPlanning.enabled, false);
    assert.equal(scene.fixture.spawnCalls.filter(call => ['remoteMiner', 'remoteHauler'].includes(call.memory.role)).length, 0);
});

test('danger_corrupt_captured_record_does_not_poison_shutdown', async () => {
    const m = await import('../services/RemoteDangerEvidenceModel.js');
    const scene = await createReconTrialFixture(); scene.prepare(); scene.advance();
    const clock = { tick: Game.time, nowMs: 1000000, codeVersion: global.EmpireServicesVersion };
    const context = m.dangerContextForStop(undefined, { ...scene.state.current,
        outcome: { decidedAtTick: Game.time, stopReason: 'danger' } }, clock);
    const damaged = m.beginDangerEvidence(undefined, context).next;
    damaged.records[0].captureStatus = 'captured';
    Memory.empire.remoteMining.dangerEvidence = damaged;
    const before = structuredClone(damaged);
    scene.fixture.visibleHostiles.push(dangerEnemy());
    scene.advance({ visibility: true });
    assert.equal(global.RemoteReconTrial.summary.dangerEvidence.current.effectiveStatus, 'store_invalid');
    assert.deepEqual(Memory.empire.remoteMining.dangerEvidence, before);
    assert.equal(global.RemoteReconTrial.permit.allowOutbound, false);
    scene.advance();
    assert.equal(scene.state.current.status, 'aborted');
    assert.ok(scene.state.current.closureVerifiedAtTick > scene.state.current.closeAppliedAtTick);
});

test('trial_runtime_default_off_keeps_namespace_absent', async () => {
    const scene = await createReconTrialFixture();
    scene.runTick();
    scene.advance();
    assert.equal(scene.state, undefined);
    assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.remoteId).length, 0);
});

test('trial_guard_precedes_remote_and_actions', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
    assert.ok(main.indexOf("new GoalPlanService(") < main.indexOf("new RemoteReconTrialService("));
    assert.ok(main.indexOf("new RemoteReconTrialService(") < main.indexOf("new RemoteMiningService("));
    const names = scene.phases.filter(value => value.phase === 'analyze').map(value => value.name);
    assert.ok(names.indexOf('RemoteReconTrial') < names.indexOf('RemoteMining'));
    assert.ok(names.indexOf('RemoteMining') < names.indexOf('Spawn'));
    assert.equal(scene.state.current.expiresAtTick, 401);
});

test('trial_expiry_survives_runtime_and_scheduler_changes', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    global.Memory = JSON.parse(JSON.stringify(Memory));
    for (const creep of Object.values(Game.creeps)) creep.memory = Memory.creeps[creep.name];
    scene.resetRuntime();
    scene.setNowMs(2200000);
    scene.advance({ skipRemote: true });
    assert.equal(scene.state.current.status, 'stopping');
    assert.equal(scene.state.current.expiresAtTick, 401);
    assert.equal(Memory.empire.remoteRooms.W1N2.enabled, false);
    const { default: Scheduler } = await import('../core/ServiceScheduler.js');
    Memory.empire.control.policy.scheduler.enforce = true;
    Memory.empire.control.runtime.cpuMode = 'critical';
    assert.equal(Scheduler.decision('RemoteReconTrial', 'run').tier, 'P0');
    assert.equal(Scheduler.decision('RemoteReconTrial', 'run').shouldRun, true);
    assert.equal(Scheduler.decision('RemoteMining', 'analyze').shouldRun, false);
});

test('trial_expiry_clears_existing_outbound_task', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    for (let tick = 102; tick <= 104; tick++) scene.advance({ tick });
    assert.equal(scene.scout.memory.task.type, 'MOVE_TO');
    const leg = structuredClone(scene.scout.memory.remoteLeg);
    const before = scene.moves.length;
    scene.setNowMs(2200000);
    scene.advance();
    assert.equal(scene.moves.length, before);
    assert.equal(scene.scout.memory.remoteLeg.startedAt, leg.startedAt);
    assert.equal(scene.scout.memory.remoteLeg.expiresAt, leg.expiresAt);
    assert.equal(scene.state.current.status, 'stopping');
});

for (const gate of ['hold', 'disabled', 'core', 'controller', 'danger', 'receiver', 'goal']) {
    test(`trial_current_protection_gates_are_intersected_${gate}`, async () => {
        const scene = await createReconTrialFixture();
        scene.prepare();
        scene.advance();
        if (gate === 'hold') Memory.empire.remoteRooms.W1N2.hold = true;
        if (gate === 'disabled') Memory.empire.control.policy.remoteMining.enabled = false;
        if (gate === 'core') global.RoomPhase.W1N1.recovery.coreUsable.miner = 0;
        if (gate === 'controller') scene.fixture.home.controller.ticksToDowngrade = 4999;
        if (gate === 'danger') scene.fixture.visibleHostiles.push({ pos: new RoomPosition(5, 5, 'W1N1') });
        if (gate === 'receiver') scene.fixture.homeSink.store.energy = 980001;
        if (gate === 'goal') Memory.empire.control.policy.goalPlanning.enabled = true;
        scene.advance();
        assert.equal(scene.state.current.status, 'stopping');
        assert.equal(Memory.empire.remoteRooms.W1N2.enabled, false);
        assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.remoteId).length, 1);
        if (gate === 'goal') assert.equal(Memory.empire.control.policy.goalPlanning.enabled, true);
    });
}

test('trial_freshness_and_scope_are_not_optional', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    const { getReconTrialPermit } = await import('../services/RemoteReconTrialService.js');
    scene.advance({ skipRemote: true });
    const permit = getReconTrialPermit({ remoteId: 'W1N1:W1N2', epoch: 1, action: 'outbound' });
    assert.equal(permit.allowSpawn, false);
    assert.equal(permit.allowOutbound, false);
    assert.equal(getReconTrialPermit({ remoteId: 'other', epoch: 1 }).managed, false);
});

test('trial_spawn_intake_revoked_before_run', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    let requestId;
    let initialEnergy;
    scene.advance({ betweenDispatchAndRun() {
        const spawn = scene.fixture.services.find(service => service.name === 'Spawn');
        const task = spawn.pendingTasks.find(task => task.data.memory.reconTrialId);
        requestId = task.requestId;
        initialEnergy = spawn.energyBalance.W1N1 + task.cost;
        Memory.empire.control.policy.remoteMining.reconTrial.enabled = false;
    } });
    const budget = Memory.empire.remoteMining.budgets.W1N1;
    const spawn = scene.fixture.services.find(service => service.name === 'Spawn');
    assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.remoteId).length, 0);
    assert.equal(spawn.energyBalance.W1N1, initialEnergy);
    assert.equal(budget.grants[requestId], undefined);
    assert.equal(scene.state.current.spawn.callState, 'not_called');
    assert.equal(scene.fixture.ledger.spawnCostUnknown || 0, 0);
});

for (const point of ['before_native', 'after_native', 'after_ledger']) {
    test(`trial_spawn_interrupted_call_is_not_replayed_${point}`, async () => {
        const scene = await createReconTrialFixture();
        scene.prepare();
        if (point === 'after_ledger') {
            scene.fixture.services.find(service => service.name === 'Spawn').createSpawnMemoryRecord = () => { throw new Error('injected after ledger'); };
        } else {
            for (const spawn of Object.values(Game.spawns)) {
                const original = spawn.spawnCreep.bind(spawn);
                spawn.spawnCreep = (...args) => {
                    if (point === 'before_native') throw new Error('injected before native');
                    original(...args);
                    throw new Error('injected after native');
                };
            }
        }
        assert.throws(() => scene.advance(), /injected/);
        const bound = scene.state.current.spawn.requestId;
        assert.ok(scene.state.current.spawn.callState, 'the execution phase must survive the interruption');
        scene.resetRuntime();
        for (let tick = 102; tick <= 105; tick++) scene.advance({ tick });
        assert.ok(scene.fixture.spawnCalls.filter(call => call.memory.remoteId && call.result === OK).length <= 1);
        assert.equal(scene.state.current.spawn.requestId, bound);
        if (point !== 'after_ledger') {
            assert.equal(scene.state.current.outcome.stopReason, 'spawn_unknown');
            assert.ok(Memory.empire.remoteMining.budgets.W1N1.grants[bound]);
        }
    });
}

test('trial_spawn_duplicate_events_two_spawns', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    scene.advance();
    const calls = scene.fixture.spawnCalls.filter(call => call.memory.reconTrialId);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, [MOVE]);
    assert.equal(scene.fixture.ledger.spawnEnergyConfirmed, 50);
    const receipt = Memory.empire.remoteMining.budgets.W1N1.receipts[scene.state.current.spawn.requestId];
    assert.equal(receipt.cost, 50);
});

test('trial_spawn_failure_keeps_original_request_deadline', async () => {
    const scene = await createReconTrialFixture();
    scene.fixture.results.spawn = ERR_BUSY;
    scene.prepare();
    scene.advance();
    const { requestId, deadline } = scene.state.current.spawn;
    for (let tick = 102; tick <= deadline + 1; tick++) scene.advance({ tick });
    assert.equal(scene.state.current.spawn.requestId, requestId);
    assert.equal(scene.state.current.spawn.deadline, deadline);
    assert.equal(scene.state.current.outcome.stopReason, 'spawn_request_expired');
    assert.equal(scene.state.current.spawn.acceptedAt, undefined);
});

test('trial_successful_spawn_outlives_request_deadline', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    const { deadline } = scene.state.current.spawn;
    for (let tick = 102; tick <= deadline + 2; tick++) scene.advance({ tick });
    assert.equal(scene.state.current.status, 'travelling');
    assert.ok(scene.moves.length > 0);
    assert.equal(scene.state.current.expiresAtTick, 401);
    assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.remoteId).length, 1);
});

test('trial_death_does_not_create_replacement', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    delete Game.creeps[scene.scout.name];
    for (const spawn of Object.values(Game.spawns)) spawn.spawning = null;
    scene.advance();
    assert.equal(scene.state.current.outcome.stopReason, 'actor_missing');
    assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.remoteId).length, 1);
    assert.equal((global.SpawnDemands.W1N1 || []).filter(demand => demand.memory?.remoteId).length, 0);
});

test('trial_old_execution_and_foreign_grants_are_preserved', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    const budget = Memory.empire.remoteMining.budgets.W1N1;
    const old = { requestId: 'old', remoteId: 'W1N1:W1N2', epoch: 1, maxEnergy: 50,
        deadline: 300, executing: true, executingAt: 101 };
    budget.grants.old = old;
    const other = { ...old, requestId: 'other', remoteId: 'other' };
    budget.grants.other = other;
    Memory.empire.remoteRooms.W1N2.hold = true;
    scene.advance();
    assert.ok(budget.grants.old);
    assert.deepEqual(budget.grants.other, other);
});

for (const forged of ['sequence', 'id', 'request', 'body', 'grant']) {
    test(`trial_only_one_move_body_and_matching_identity_${forged}`, async () => {
        const scene = await createReconTrialFixture();
        scene.prepare();
        scene.advance({ betweenDispatchAndRun() {
            const task = scene.fixture.services.find(service => service.name === 'Spawn').pendingTasks.find(task => task.data.memory.reconTrialId);
            if (forged === 'sequence') task.data.memory.reconTrialSequence++;
            if (forged === 'id') task.data.memory.reconTrialId = 'wrong';
            if (forged === 'request') task.data.requestId = 'wrong';
            if (forged === 'body') task.data.body = [MOVE, MOVE];
            if (forged === 'grant') {
                const budget = Memory.empire.remoteMining.budgets.W1N1;
                budget.grants.alias = { ...budget.grants[task.data.grantId], requestId: 'alias', executing: false };
                task.data.grantId = 'alias';
            }
        } });
        assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.remoteId).length, 0);
    });
}

async function enterRemote(scene) {
    for (let tick = 102; tick <= 104; tick++) scene.advance({ tick });
    scene.advance({ tick: 105, positions: { [scene.scout.name]: { x: 25, y: 49, roomName: 'W1N1' } } });
    scene.advance({ tick: 106, visibility: true });
    assert.equal(scene.scout.pos.roomName, 'W1N2');
}

test('trial_birth_and_movement_require_game_evidence', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.setBlocked(true);
    scene.advance();
    assert.equal(scene.state.current.evidence.bornAt, undefined);
    for (let tick = 102; tick <= 106; tick++) scene.advance({ tick });
    assert.equal(scene.state.current.evidence.bornAt, 104);
    assert.equal(scene.state.current.evidence.firstMovementAt, undefined);
    assert.ok(scene.moves.some(move => move.result === OK));
    scene.setBlocked(false);
    scene.advance();
    scene.advance();
    assert.equal(scene.state.current.evidence.firstMovementAt, 108);
});

test('trial_safety_is_current_session_and_continuous', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    scene.fixture.operation.safeTicks = 100;
    await enterRemote(scene);
    const enteredAt = scene.state.current.evidence.enteredRemoteAt;
    for (let tick = Game.time + 1; tick < enteredAt + 99; tick++) scene.advance({ tick, visibility: true });
    assert.equal(scene.state.current.evidence.safeStreak, 99);
    assert.equal(scene.state.current.status, 'observing');
    scene.advance({ visibility: true });
    assert.equal(scene.state.current.status, 'stopping');
    assert.equal(scene.state.current.outcome.verdict, 'completed');
    assert.equal(scene.state.current.evidence.safeStreak, 100);
    scene.advance({ visibility: true });
    assert.equal(scene.state.current.status, 'completed');
    assert.ok(scene.state.current.closureVerifiedAtTick > scene.state.current.closeAppliedAtTick);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
});

test('trial_evidence_getters_and_scope_isolation', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    const pos = scene.fixture.source.pos;
    scene.fixture.source.pos = Object.create(Object.getPrototypeOf(pos), {
        x: { get: () => pos.x }, y: { get: () => pos.y }, roomName: { get: () => pos.roomName }
    });
    await enterRemote(scene);
    assert.equal(scene.state.current.evidence.route.valid, true);
    assert.equal(scene.state.current.evidence.route.receiverId, 'HomeSink');
    assert.equal(Memory.empire.remoteRooms.W1N2.sourceId, null);
    assert.equal(scene.fixture.createdSites.length, 0);
});

test('trial_visible_route_is_read_only', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    assert.equal(scene.state.current.evidence.routeCheckedAt, undefined);
    await enterRemote(scene);
    const { collectReconTrialFacts } = await import('../services/RemoteReconTrialFacts.js');
    const before = JSON.stringify(Memory);
    const result = collectReconTrialFacts(global.RemoteMining['W1N1:W1N2'], {
        tick: Game.time, nowMs: 1000000, codeVersion: 'trial-v1'
    });
    assert.equal(result.sourceValid, true);
    assert.equal(result.visibleRoute.valid, true);
    assert.ok(result.visibleRoute.outboundTicks > 0);
    assert.equal(JSON.stringify(Memory), before);
    assert.equal(scene.fixture.spawnCalls.some(call => call.memory.role === 'remoteMiner'), false);
});

test('trial_closure_requires_next_tick_confirmation', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    Memory.empire.remoteRooms.W1N2.hold = true;
    scene.advance();
    assert.equal(scene.state.current.status, 'stopping');
    assert.equal(scene.state.current.closureVerifiedAtTick, undefined);
    scene.advance();
    assert.equal(scene.state.current.status, 'aborted');
    const outcome = structuredClone(scene.state.current.outcome);
    Memory.empire.remoteRooms.W1N2.enabled = true;
    Memory.empire.remoteRooms.W1N2.hold = false;
    Memory.empire.control.policy.remoteMining.enabled = true;
    scene.advance();
    assert.equal(Memory.empire.remoteRooms.W1N2.enabled, false);
    assert.deepEqual(scene.state.current.outcome, outcome);
    assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.remoteId).length, 1);
});

test('trial_settlement_does_not_rewrite_outcome', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    for (const spawn of Object.values(Game.spawns)) spawn.spawnCreep = () => { throw new Error('lost call'); };
    assert.throws(() => scene.advance(), /lost call/);
    scene.resetRuntime();
    scene.advance();
    scene.advance();
    const outcome = structuredClone(scene.state.current.outcome);
    const requestId = scene.state.current.spawn.requestId;
    assert.equal(scene.state.current.settlement.unknownUpperBound, 50);
    const { recordSpawnResult } = await import('../services/RemoteMiningLedger.js');
    recordSpawnResult(Memory.empire.remoteMining.budgets.W1N1, scene.fixture.ledger,
        { requestId, result: OK, name: scene.state.current.spawn.name, body: [MOVE] }, Game.time);
    scene.advance();
    assert.equal(scene.state.current.settlement.confirmedCost, 50);
    assert.equal(scene.state.current.settlement.unknownUpperBound, 0);
    assert.deepEqual(scene.state.current.outcome, outcome);
});

test('trial_stop_and_release_are_scope_limited', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    Memory.empire.remoteRooms.W2N1 = { enabled: true, baseRoom: 'W1N1', sourceId: null,
        homeDeliveryTargetIds: ['HomeSink'], allowContainerBuild: false, reserveController: false };
    scene.advance();
    assert.equal(Memory.empire.remoteRooms.W1N2.enabled, false);
    assert.equal(Memory.empire.remoteRooms.W2N1.enabled, true);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, true);
    assert.equal(scene.state.current.moduleShutdownConflict, true);
});

test('trial_release_restores_unmanaged_mode_without_enabling', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    Memory.empire.remoteRooms.W1N2.hold = true;
    scene.advance();
    scene.advance();
    delete Game.creeps[scene.scout.name];
    for (const spawn of Object.values(Game.spawns)) spawn.spawning = null;
    const start = Game.time + 1;
    Memory.empire.control.policy.remoteMining.reconTrial.request = {
        schemaVersion: 1, action: 'release', id: 'release', targetTrialId: 'trial-one', sequence: 2,
        remoteId: 'W1N1:W1N2', epoch: 1, codeVersion: 'trial-v1', activateAtTick: start,
        expiresAtTick: start + 300, issuedAtMs: 1000000, expiresAtMs: 2200000
    };
    scene.advance();
    assert.equal(scene.state.current.managed, false);
    const { getReconTrialPermit } = await import('../services/RemoteReconTrialService.js');
    assert.equal(getReconTrialPermit({ remoteId: 'W1N1:W1N2', epoch: 1 }).managed, false);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
});

test('trial_metrics_disabled_does_not_disable_guard', async () => {
    const scene = await createReconTrialFixture();
    Memory.empire.control.policy.telemetry.enabled = false;
    scene.prepare();
    scene.advance();
    scene.setNowMs(2200000);
    scene.advance();
    scene.advance();
    assert.equal(scene.state.current.status, 'aborted');
    assert.equal(Memory.empire.remoteRooms.W1N2.enabled, false);
    assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.remoteId).length, 1);
});

test('trial_offline_connection_never_controls_safety', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    scene.advance({ tick: 401 });
    assert.equal(scene.state.current.outcome.stopReason, 'tick_expired');
    scene.advance();
    assert.equal(scene.state.current.status, 'aborted');
    assert.equal(scene.state.current.expiresAtTick, 401);
    assert.equal(Memory.empire.remoteRooms.W1N2.hold, true);
});

test('trial_existing_recovery_and_reservations_unchanged', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    scene.advance();
    scene.advance();
    scene.advance();
    scene.advance();
    const original = structuredClone(scene.scout.memory.remoteLeg);
    scene.setBlocked(true);
    for (let tick = 106; tick <= 114; tick++) scene.advance({ tick });
    assert.equal(scene.scout.memory.remoteLeg.retryCount, 1);
    assert.equal(scene.state.current.evidence.onlineRecoveryCovered, false,
        'movement before a retry cannot prove that the retry recovered');
    scene.setBlocked(false);
    scene.advance();
    scene.advance();
    assert.equal(scene.state.current.evidence.onlineRecoveryCovered, true);
    assert.equal(scene.scout.memory.remoteLeg.startedAt, original.startedAt);
    assert.equal(scene.scout.memory.remoteLeg.expiresAt, original.expiresAt);
    assert.equal(Memory.empire.control.policy.remoteMining.spawnEnergyLimit, 2000);
    assert.equal(Memory.empire.control.policy.resourceReservations.maxTaskTicks, 50);
});

for (const phase of ['waiting_spawn', 'spawning', 'travelling', 'observing', 'stopping', 'aborted']) {
    test(`trial_terminal_replay_and_runtime_reset_matrix_${phase}`, async () => {
        const scene = await createReconTrialFixture();
        if (phase === 'waiting_spawn') for (const spawn of Object.values(Game.spawns)) spawn.spawning = { name: 'core', remainingTime: 20 };
        scene.prepare();
        scene.advance();
        if (phase === 'travelling') for (let tick = 102; tick <= 104; tick++) scene.advance({ tick });
        if (phase === 'observing') await enterRemote(scene);
        if (['stopping', 'aborted'].includes(phase)) {
            Memory.empire.remoteRooms.W1N2.hold = true;
            scene.advance();
            if (phase === 'aborted') scene.advance();
        }
        assert.equal(scene.state.current.status, phase);
        const deadline = scene.state.current.expiresAtTick;
        const started = scene.state.current.startedAtTick;
        const outcome = structuredClone(scene.state.current.outcome);
        global.Memory = JSON.parse(JSON.stringify(Memory));
        for (const creep of Object.values(Game.creeps)) creep.memory = Memory.creeps[creep.name];
        scene.resetRuntime();
        scene.advance({ visibility: phase === 'observing' });
        assert.equal(scene.state.current.startedAtTick, started);
        assert.equal(scene.state.current.expiresAtTick, deadline);
        if (outcome) assert.deepEqual(scene.state.current.outcome, outcome);
        assert.ok(scene.fixture.spawnCalls.filter(call => call.memory.remoteId && call.result === OK).length <= 1);
    });
}

test('trial_unknown_schema_is_preserved_without_crashing_core_services', async () => {
    const scene = await createReconTrialFixture();
    scene.runTick();
    const corrupt = { schemaVersion: 99, current: { managed: true }, privateEvidence: 'preserve' };
    Memory.empire.remoteMining.reconTrials = corrupt;
    scene.advance();
    assert.deepEqual(scene.state, corrupt);
    assert.equal(global.RemoteReconTrial.permit.allowSpawn, false);
    assert.ok(global.SpawnBureau.W1N1);
});

test('trial_summary_is_exported_without_creating_goals', async () => {
    const scene = await createReconTrialFixture();
    const { default: Metrics } = await import('../services/EmpireMetricsService.js');
    scene.fixture.services.push(new Metrics('EmpireMetrics'));
    scene.prepare();
    scene.advance();
    for (let tick = 102; tick <= 110; tick++) scene.advance({ tick });
    const summary = Memory.empire.control.metrics.reconTrial;
    assert.equal(summary.current.trialId, 'trial-one');
    assert.equal(summary.capturedAt, 110);
    assert.equal(Object.hasOwn(Memory.empire.control, 'goals'), false);
    assert.equal(Object.hasOwn(Memory.empire.control, 'plans'), false);
});

test('trial_pending_activation_never_creates_grants_or_spawn_demands', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.runTick();
    assert.equal((global.SpawnDemands.W1N1 || []).filter(demand => demand.memory?.remoteId).length, 0);
    assert.equal(Object.keys(Memory.empire.remoteMining.budgets.W1N1.grants || {}).length, 0);
    assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.remoteId).length, 0);
    scene.advance();
    assert.equal(scene.state.current.status, 'spawning');
    assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.remoteId).length, 1);
});

test('trial_closure_reapplied_after_manual_override_needs_another_tick', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    Memory.empire.remoteRooms.W1N2.hold = true;
    scene.advance();
    Memory.empire.control.policy.remoteMining.enabled = true;
    scene.advance();
    assert.equal(scene.state.current.status, 'stopping');
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(scene.state.current.closeAppliedAtTick, Game.time);
    scene.advance();
    assert.equal(scene.state.current.status, 'aborted');
    assert.equal(scene.state.current.closureVerifiedAtTick, Game.time);
});

for (const field of ['safeStreak', 'lastSafeTick', 'scopeCheckedAt', 'acceptedAt', 'callState', 'managed', 'position']) {
    test(`review_corrupt_persisted_${field}_is_preserved_and_refused`, async () => {
        const scene = await createReconTrialFixture();
        scene.prepare();
        scene.advance();
        await enterRemote(scene);
        const current = scene.state.current;
        if (field === 'safeStreak') current.evidence.safeStreak = '99';
        if (field === 'lastSafeTick') current.evidence.lastSafeTick = Game.time + 100;
        if (field === 'scopeCheckedAt') current.scopeCheckedAt = Game.time + 100;
        if (field === 'acceptedAt') current.spawn.acceptedAt = '101';
        if (field === 'callState') { current.spawn.callState = 'call_started'; delete current.spawn.callTick; }
        if (field === 'managed') current.managed = false;
        if (field === 'position') current.evidence.lastPosition.x = 999;
        const before = structuredClone(scene.state);
        scene.advance({ visibility: true });
        assert.deepEqual(scene.state, before);
        assert.equal(global.RemoteReconTrial.permit.reason, 'state_invalid');
        assert.equal(global.RemoteReconTrial.permit.allowSpawn, false);
        assert.equal(global.RemoteReconTrial.permit.allowOutbound, false);
    });
}

for (const field of ['budget', 'remote', 'epoch']) {
    test(`review_cancel_preserves_foreign_${field}_with_same_trial_labels`, async () => {
        const scene = await createReconTrialFixture();
        scene.prepare();
        scene.advance();
        const requestId = scene.state.current.spawn.requestId;
        const name = field === 'budget' ? 'W9N9' : 'W1N1';
        const budgets = Memory.empire.remoteMining.budgets;
        budgets[name] ??= { grants: {}, receipts: {}, buckets: [] };
        budgets[name].grants[requestId] = { requestId, trialId: 'trial-one', trialSequence: 1,
            remoteId: field === 'epoch' ? 'W1N1:W1N2' : 'W9N9:W9N8', epoch: field === 'epoch' ? 2 : 1,
            deadline: 300, maxEnergy: 50, executing: false };
        const original = structuredClone(budgets[name]);
        Memory.empire.remoteRooms.W1N2.hold = true;
        scene.advance();
        assert.deepEqual(budgets[name], original);
    });
}

test('review_confirmed_cost_survives_receipt_retention_window', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    Memory.empire.remoteRooms.W1N2.hold = true;
    scene.advance();
    scene.advance();
    assert.equal(scene.state.current.settlement.confirmedCost, 50);
    const outcome = structuredClone(scene.state.current.outcome);
    scene.advance({ tick: 1200 });
    assert.equal(Memory.empire.remoteMining.budgets.W1N1.receipts[scene.state.current.spawn.requestId], undefined);
    assert.equal(scene.state.current.settlement.confirmedCost, 50);
    assert.equal(scene.state.current.settlement.unknownUpperBound, 0);
    assert.deepEqual(scene.state.current.outcome, outcome);
});

test('trial_cost_baseline_does_not_mix_prior_operation_spending', async () => {
    const scene = await createReconTrialFixture();
    scene.runTick();
    scene.fixture.ledger.spawnEnergyConfirmed = 100;
    Memory.empire.remoteMining.budgets.W1N1.buckets = [{ start: 100, amount: 100 }];
    scene.prepare();
    scene.advance();
    assert.equal(scene.state.current.evidence.spawnEnergyBaseline, 100);
    assert.equal(scene.fixture.ledger.spawnEnergyConfirmed, 150);
    assert.equal(scene.state.current.settlement.confirmedCost, 50);
});

test('review_known_spawn_failure_can_recover_on_original_request', async () => {
    const scene = await createReconTrialFixture();
    scene.fixture.results.spawn = ERR_BUSY;
    scene.prepare();
    scene.advance();
    const original = structuredClone(scene.state.current.spawn);
    delete scene.fixture.results.spawn;
    scene.advance();
    const calls = scene.fixture.spawnCalls.filter(call => call.memory.reconTrialId);
    assert.deepEqual(calls.map(call => call.result), [ERR_BUSY, OK]);
    assert.equal(scene.state.current.spawn.requestId, original.requestId);
    assert.equal(scene.state.current.spawn.deadline, original.deadline);
    assert.equal(scene.fixture.ledger.spawnEnergyConfirmed, 50);
    assert.equal(scene.state.current.status, 'spawning');
});

test('review_known_failure_retry_still_respects_alert_cooldown', async () => {
    const scene = await createReconTrialFixture();
    scene.fixture.results.spawn = ERR_BUSY;
    scene.prepare();
    scene.advance();
    delete scene.fixture.results.spawn;
    scene.fixture.operation.lastAlertAt = Game.time;
    scene.advance();
    assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.reconTrialId).length, 1);
    assert.equal(global.RemoteMining['W1N1:W1N2'].state.allowRecon, false);
});

test('review_new_trial_does_not_reuse_old_request_cooldown_exemption', async () => {
    const scene = await createReconTrialFixture();
    scene.fixture.results.spawn = ERR_BUSY;
    scene.prepare();
    scene.advance();
    const deadline = scene.state.current.spawn.deadline;
    for (let tick = Game.time + 1; tick <= deadline + 2; tick++) scene.advance({ tick });
    assert.equal(scene.state.current.status, 'aborted');
    const count = scene.fixture.spawnCalls.filter(call => call.memory.reconTrialId).length;
    delete scene.fixture.results.spawn;
    scene.prepare({ sequence: 2, id: 'trial-two' });
    scene.advance();
    assert.equal(scene.state.current.identity.sequence, 2);
    assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.reconTrialId).length, count);
    assert.equal(scene.state.current.spawn.requestId, undefined);
    assert.ok(global.RemoteMining['W1N1:W1N2'].state.reasons.includes('recon_cooldown'));
});

test('review_release_cannot_borrow_scope_closed_to_ignore_module_open', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    Memory.empire.remoteRooms.W2N1 = { enabled: true, baseRoom: 'W1N1', sourceId: null,
        homeDeliveryTargetIds: ['HomeSink'], allowContainerBuild: false, reserveController: false };
    scene.advance();
    scene.advance();
    delete Game.creeps[scene.scout.name];
    for (const spawn of Object.values(Game.spawns)) spawn.spawning = null;
    const start = Game.time + 1;
    Memory.empire.control.policy.remoteMining.reconTrial.request = { schemaVersion: 1, action: 'release', id: 'release',
        targetTrialId: 'trial-one', sequence: 2, remoteId: 'W1N1:W1N2', epoch: 1, codeVersion: 'trial-v1',
        activateAtTick: start, expiresAtTick: start + 300, issuedAtMs: 1000000, expiresAtMs: 2200000 };
    scene.advance();
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, true);
    assert.equal(scene.state.current.managed, true);
    assert.equal(scene.state.lastRejection.reason, 'release_blocked');
});

test('review_managed_safe_return_rechecks_current_home_health', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    scene.advance();
    await enterRemote(scene);
    Memory.empire.remoteRooms.W1N2.hold = true;
    scene.advance({ visibility: true });
    assert.equal(scene.scout.memory.remoteLeg.state, 'returning');
    assert.equal(scene.scout.memory.task.pos.roomName, 'W1N1');
    const returnDeadline = scene.scout.memory.remoteLeg.expiresAt;
    const before = scene.moves.length;
    global.RoomPhase.W1N1.recovery.mode = 'recovering';
    scene.advance({ visibility: true });
    assert.equal(scene.moves.length, before);
    global.RoomPhase.W1N1.recovery.mode = 'normal';
    scene.advance({ visibility: true });
    assert.equal(scene.scout.memory.remoteLeg.expiresAt, returnDeadline);
});

test('review_final_spawn_check_propagates_reducer_revocation', async () => {
    const scene = await createReconTrialFixture();
    scene.prepare();
    const remote = scene.fixture.services.find(service => service.name === 'RemoteMining');
    remote.run = () => { global.RoomPhase.W1N1.recovery.mode = 'recovering'; };
    scene.advance();
    assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.reconTrialId).length, 0);
    assert.equal(scene.state.current.outcome.stopReason, 'home_unavailable');
    assert.equal(scene.state.current.spawn.callState, 'not_called');
    assert.equal(Object.keys(Memory.empire.remoteMining.budgets.W1N1.grants).length, 0);
});

for (const field of ['unrelated_null', 'receivers', 'container']) {
    test(`review_malformed_raw_${field}_does_not_crash_core`, async () => {
        const scene = await createReconTrialFixture();
        scene.prepare();
        scene.advance();
        if (field === 'unrelated_null') Memory.empire.remoteRooms.invalid = null;
        if (field === 'receivers') Memory.empire.remoteRooms.W1N2.homeDeliveryTargetIds = 'HomeSink';
        if (field === 'container') Memory.empire.remoteRooms.W1N2.containerPos = { x: 999, y: 20, roomName: 'W1N2' };
        scene.advance();
        assert.ok(global.SpawnBureau.W1N1);
        if (field === 'unrelated_null') {
            assert.equal(Memory.empire.remoteRooms.invalid, null);
            assert.equal(scene.state.current.status, 'spawning');
        } else {
            assert.equal(scene.state.current.status, 'stopping');
            assert.equal(Memory.empire.remoteRooms.W1N2.enabled, false);
        }
    });
}
