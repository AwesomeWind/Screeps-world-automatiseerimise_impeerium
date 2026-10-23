const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createAdmissionModelFixture, createAdmissionFixture, createAdmissionAdapterFixture} = require('./helpers/economic-spawn-admission-fixture.cjs');
const {createEconomicTrialFixture} = require('./helpers/economic-trial-fixture.cjs');

function begin(f) {
    return f.model.advanceEconomicTrial(f.state, f.event('spawn_admission_begin'), f.facts, f.clock()).state;
}
function intake(f, state) {
    return f.model.advanceEconomicTrial(state, {kind: 'spawn_event', type: 'intake', context: f.context}, f.facts, f.clock()).state;
}
test('admission_p1_begin_complete_and_legacy', async () => {
    const f = await createAdmissionModelFixture();
    const legacy = f.model.advanceEconomicTrial(f.state, {kind: 'spawn_bound', role: 'scout', requestId: 'legacy', deadline: 106}, f.facts, f.clock()).state;
    assert.equal(f.model.validEconomicTrialState(legacy), true);
    assert.equal(legacy.current.slots.scout.admissionStage, undefined);
    let state = begin(f);
    assert.equal(state.current.slots.scout.admissionStage, 'binding');
    state = intake(f, state);
    state = f.model.advanceEconomicTrial(state, f.event('spawn_admission_complete'), f.facts, f.clock()).state;
    assert.equal(state.current.slots.scout.admissionStage, 'admitted');
    assert.equal(state.current.slots.scout.calls, 0);
    assert.equal(f.model.validEconomicTrialState(state), true);
    assert.equal(f.model.economicTrialPermission(state, {...f.context, action: 'spawn', spawnCheckpoint: 'run'}, f.clock()).allowed, true);
});
test('admission_p1_binding_denies_run', async () => {
    const f = await createAdmissionModelFixture(), state = begin(f);
    assert.equal(state.current.slots.scout.admissionStage, 'binding');
    assert.equal(f.model.economicTrialPermission(state, {...f.context, action: 'spawn', spawnCheckpoint: 'intake'}, f.clock()).allowed, true);
    for (const spawnCheckpoint of [undefined, 'run']) assert.equal(f.model.economicTrialPermission(state,
        {...f.context, action: 'spawn', spawnCheckpoint}, f.clock()).allowed, false);
    const attempted = f.model.advanceEconomicTrial(intake(f, state), {kind: 'spawn_event', type: 'call_started', context: f.context}, f.facts, f.clock()).state;
    assert.equal(attempted.current.slots.scout.calls, 0);
    assert.ok(attempted.current.outcome);
});
test('admission_p1_bound_identity_deadline_are_immutable', async () => {
    const f = await createAdmissionModelFixture(), state = begin(f), original = structuredClone(state.current.slots.scout);
    const replaced = f.model.advanceEconomicTrial(state, {...f.event('spawn_admission_begin'), context: {...f.context, requestId: 'other', deadline: 107}}, f.facts, f.clock()).state;
    assert.deepEqual(replaced.current.slots.scout, original);
    assert.equal(original.deadline, 106);
    assert.equal(original.admissionTick, 101);
    assert.equal(original.admissionSpawnName, 'Spawn1');
    const late = f.model.advanceEconomicTrial(intake(f, state), f.event('spawn_admission_complete'), f.facts, f.clock(102)).state;
    assert.equal(late.current.slots.scout.admissionStage, 'binding');
    assert.ok(late.current.outcome);
});
test('admission_p1_incomplete_or_unknown_stage_rejected', async () => {
    const f = await createAdmissionModelFixture();
    for (const fields of [{admissionStage: 'binding'}, {admissionTick: 101},
        {admissionStage: 'unknown', admissionTick: 101, admissionSpawnName: 'Spawn1'}]) {
        const state = structuredClone(f.state);
        Object.assign(state.current.slots.scout, {requestId: 'one', deadline: 106}, fields);
        assert.equal(f.model.validEconomicTrialState(state), false);
    }
});

test('admission_p2_candidate_is_readonly', async () => {
    const f = await createAdmissionAdapterFixture(), before = JSON.stringify(Memory);
    assert.equal(typeof f.api.buildEconomicTrialSpawnCandidate, 'function');
    const candidate = f.api.buildEconomicTrialSpawnCandidate(f.scope, 'scout');
    assert.ok(candidate); assert.equal(candidate.offeredAtTick, Game.time);
    assert.equal(f.api.inspectEconomicTrialSpawnCandidate(candidate, f.data).allowed, true);
    assert.equal(JSON.stringify(Memory), before);
    assert.equal(Object.keys(candidate).length, 9);
});
test('admission_p2_exact_identity_and_fresh_tick', async () => {
    const f = await createAdmissionAdapterFixture();
    assert.equal(typeof f.api.buildEconomicTrialSpawnCandidate, 'function');
    const c = f.api.buildEconomicTrialSpawnCandidate(f.scope, 'scout');
    for (const invalid of [{...c, offeredAtTick: 100}, {...c, extra: true}, {...c, maxEnergy: 800},
        {...c, identity: {...c.identity, epoch: 2}}, {...c, identity: {...c.identity, codeVersion: 'old'}}]) {
        assert.equal(f.api.inspectEconomicTrialSpawnCandidate(invalid, f.data).allowed, false);
    }
    assert.equal(f.api.inspectEconomicTrialSpawnCandidate(c, {...f.data, body: ['carry', 'move']}).allowed, false);
});
function admissionContext(f) {
    return {...Memory.empire.remoteMining.economicTrials.current.identity, role: 'scout', baseRoom: 'W1N1',
        name: 'NewScout', spawnName: 'Spawn1', body: ['move'], data: f.data};
}
test('admission_p2_begin_budget_intake_then_complete', async () => {
    const f = await createAdmissionAdapterFixture();
    assert.equal(typeof f.api.beginEconomicTrialSpawnAdmission, 'function');
    const c = f.api.buildEconomicTrialSpawnCandidate(f.scope, 'scout');
    const result = f.api.beginEconomicTrialSpawnAdmission(c, admissionContext(f));
    assert.equal(result.allowed, true);
    const state = Memory.empire.remoteMining.economicTrials.current, slot = state.slots.scout;
    assert.equal(slot.admissionStage, 'binding'); assert.equal(slot.deadline, 106);
    const grant = Memory.empire.remoteMining.budgets.W1N1.grants[slot.requestId];
    assert.ok(grant); grant.executing = true; grant.executingAt = Game.time;
    assert.equal(f.api.completeEconomicTrialSpawnAdmission(result.context).allowed, true);
    assert.equal(Memory.empire.remoteMining.economicTrials.current.slots.scout.admissionStage, 'admitted');
    assert.equal(state.evidence.confirmedSpawnCost, 0);
    assert.equal(result.data.economicTrialCandidate, undefined);
});
test('admission_p2_partial_begin_cannot_be_reoffered', async () => {
    const f = await createAdmissionAdapterFixture();
    assert.equal(typeof f.api.beginEconomicTrialSpawnAdmission, 'function');
    const c = f.api.buildEconomicTrialSpawnCandidate(f.scope, 'scout');
    const one = f.api.beginEconomicTrialSpawnAdmission(c, admissionContext(f));
    assert.equal(one.allowed, true);
    const sequence = f.scope.operation.requestSequence;
    assert.equal(f.api.buildEconomicTrialSpawnCandidate(f.scope, 'scout'), null);
    assert.equal(f.api.beginEconomicTrialSpawnAdmission(c, admissionContext(f)).allowed, false);
    assert.equal(f.scope.operation.requestSequence, sequence);
    f.api.abortEconomicTrialSpawnAdmission(one.context, 'test_interrupted');
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
});

test('admission_p3_single_spawn_home_hauler_tie_waits', async () => {
    const p = await createAdmissionFixture(); p.toSafe99(); p.retireHomeHaulers(); p.advance();
    const slot = p.scene.current.slots.remoteMiner;
    assert.equal(slot.requestId, undefined);
    assert.equal(slot.deadline, undefined); assert.equal(slot.calls, 0);
    assert.equal(p.scene.current.outcome, undefined);
    assert.ok(Game.spawns.Spawn1.spawning.name.startsWith('hauler_'));
    assert.deepEqual(Object.keys(Memory.empire.remoteMining.budgets.W1N1.grants), []);
});
test('admission_p3_wait_30_ticks_then_admit_once', async () => {
    const p = await createAdmissionFixture(); p.toSafe99(); p.retireHomeHaulers();
    const original = {started: p.scene.current.startedAtTick, expires: p.scene.current.expiresAtTick, wall: p.scene.current.expiresAtMs};
    p.advance(); const began = Game.time;
    for (let i = 0; i < 35 && Game.spawns.Spawn1.spawning?.name.startsWith('hauler_'); i++) {
        assert.equal(p.scene.current.slots.remoteMiner.requestId, undefined);
        assert.equal(p.scene.current.outcome, undefined); p.advance();
    }
    const slot = p.scene.current.slots.remoteMiner;
    assert.ok(Game.time - began >= 30); assert.equal(slot.calls, 1);
    assert.equal(slot.admissionTick, Game.time); assert.equal(slot.deadline, Game.time + 5);
    assert.deepEqual({started: p.scene.current.startedAtTick, expires: p.scene.current.expiresAtTick, wall: p.scene.current.expiresAtMs}, original);
    assert.equal(p.scene.current.safeStreak, 100);
    assert.equal(p.scene.f.spawnCalls.filter(c => c.memory.role === 'remoteMiner').length, 1);
});
test('admission_p3_no_competitor', async () => {
    const p = await createAdmissionFixture(); p.toSafe99(); p.advance();
    assert.equal(p.scene.current.slots.remoteMiner.admissionStage, 'admitted');
    assert.equal(p.scene.current.slots.remoteMiner.acceptedAt, Game.time);
});
test('admission_p3_two_spawns_and_energy', async () => {
    for (const energy of [1900, 500]) {
        const p = await createAdmissionFixture({spawnCount: 2}); p.toSafe99(); p.retireHomeHaulers();
        p.scene.f.home.energyAvailable = energy;
        const before = p.scene.f.spawnCalls.length; p.advance();
        const calls = p.scene.f.spawnCalls.slice(before);
        assert.ok(calls.reduce((sum, c) => sum + c.cost, 0) <= energy);
        if (energy === 1900) {
            assert.deepEqual(calls.map(c => c.memory.role), ['hauler', 'remoteMiner']);
            assert.equal(p.scene.current.slots.remoteMiner.admissionStage, 'admitted');
        } else assert.equal(p.scene.current.slots.remoteMiner.requestId, undefined);
    }
});
test('admission_p3_canonical_event_deadline_and_receipts', async () => {
    const scene = await createEconomicTrialFixture(); scene.f.results.spawn = ERR_BUSY; scene.prepare();
    let task;
    scene.advance({betweenDispatchAndRun() {task = scene.f.services.find(s => s.name === 'Spawn').pendingTasks[0];}});
    const slot = structuredClone(scene.current.slots.scout);
    assert.equal(slot.admissionStage, 'admitted');
    assert.equal(task.event.expireAt, slot.deadline); assert.notEqual(task.event.id, slot.requestId);
    assert.equal(task.data.economicTrialCandidate, undefined);
    let backup;
    const spawnService = scene.f.services.find(s => s.name === 'Spawn'), originalRun = spawnService.run.bind(spawnService);
    spawnService.run = () => {originalRun(); backup = Object.values(Memory.empire.spawningCreeps).find(r => r.requestId === slot.requestId);};
    scene.f.results.spawn = OK; scene.advance();
    const receipt = Memory.empire.spawnRequestReceipts[slot.requestId];
    assert.ok(receipt); assert.equal(receipt.expireAt, slot.deadline);
    assert.equal(backup.requestId, slot.requestId); assert.equal(backup.requestExpiresAt, slot.deadline);
    assert.equal(scene.current.slots.scout.calls, 2);
    assert.equal(scene.current.slots.scout.admissionTick, slot.admissionTick);
});

for (const [field, value] of [['economicTrialId', 'foreign'], ['economicTrialSequence', 9], ['role', 'remoteMiner'],
    ['remoteId', 'elsewhere'], ['epoch', 9], ['quotaKey', 'foreign'], ['maxEnergy', 1]]) {
    test('admission_p4_complete_rechecks_grant_' + field, async () => {
        const f = await createAdmissionAdapterFixture();
        const c = f.api.buildEconomicTrialSpawnCandidate(f.scope, 'scout');
        const result = f.api.beginEconomicTrialSpawnAdmission(c, admissionContext(f));
        assert.equal(result.allowed, true);
        const grant = Memory.empire.remoteMining.budgets.W1N1.grants[result.context.requestId];
        grant.executing = true; grant.executingAt = Game.time; grant[field] = value;
        assert.equal(f.api.completeEconomicTrialSpawnAdmission(result.context).allowed, false);
        assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
        assert.equal(Memory.empire.remoteMining.economicTrials.current.slots.scout.calls, 0);
    });
}
test('admission_p4_eventbus_exception_still_denies_run', async () => {
    const scene = await createEconomicTrialFixture(), service = scene.f.services.find(s => s.name === 'Spawn');
    const init = service.init.bind(service), record = service.recordIntake.bind(service);
    service.init = () => {
        init(); const push = service.pendingTasks.push.bind(service.pendingTasks);
        service.pendingTasks.push = task => {
            push(task);
            const remote = Memory.empire.remoteMining;
            let saved = remote.economicTrials;
            Object.defineProperty(remote, 'economicTrials', {configurable: true, enumerable: true,
                get() {return saved;}, set(next) {
                    if (next.current.slots.scout.admissionStage === 'admitted') throw new Error('admitted write failed');
                    saved = next;
                }});
        };
    };
    service.recordIntake = (room, reason) => {if (reason === 'spawn_admission_failed') throw new Error('detail failed after withdrawal'); record(room, reason);};
    scene.prepare(); scene.advance();
    assert.equal(scene.f.spawnCalls.length, 0);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(service.energyBalance.W1N1, scene.f.home.energyAvailable);
    assert.equal(service.pendingTasks.length, 0);
});
test('admission_p4_reset_binding_never_reoffers', async () => {
    const f = await createAdmissionAdapterFixture();
    const result = f.api.beginEconomicTrialSpawnAdmission(f.api.buildEconomicTrialSpawnCandidate(f.scope, 'scout'), admissionContext(f));
    const slot = structuredClone(Memory.empire.remoteMining.economicTrials.current.slots.scout);
    f.scene.restoreMemory(); f.scene.advance();
    const current = Memory.empire.remoteMining.economicTrials.current;
    assert.equal(current.outcome.stopReason, 'spawn_admission_interrupted');
    assert.equal(current.slots.scout.requestId, slot.requestId);
    assert.equal(current.slots.scout.deadline, slot.deadline);
    assert.equal(f.scene.f.spawnCalls.length, 0); assert.equal(result.allowed, true);
});
test('admission_p4_known_retry_keeps_first_admission', async () => {
    const scene = await createEconomicTrialFixture(); scene.prepare();
    assert.throws(() => scene.advance({betweenDispatchAndRun() {throw new Error('reset before native');}}), /reset before native/);
    const original = structuredClone(scene.current.slots.scout);
    assert.equal(original.admissionStage, 'admitted'); assert.equal(original.calls, 0);
    scene.restoreMemory();
    Game.spawns[original.admissionSpawnName].spawning = {name: 'CoreBusy', remainingTime: 30};
    scene.advance();
    const slot = scene.current.slots.scout;
    assert.equal(slot.calls, 1); assert.equal(slot.requestId, original.requestId);
    assert.equal(slot.deadline, original.deadline); assert.equal(slot.admissionTick, original.admissionTick);
    assert.equal(slot.admissionSpawnName, original.admissionSpawnName);
    assert.notEqual(slot.name.split('_')[2], original.admissionSpawnName);
});
test('admission_p4_unknown_never_replays', async () => {
    let attempts = 0;
    const scene = await createEconomicTrialFixture({onSpawn() {attempts++; throw new Error('engine outcome unknown');}});
    scene.prepare(); assert.throws(() => scene.advance(), /engine outcome unknown/);
    const original = structuredClone(scene.current.slots.scout);
    assert.equal(original.callState, 'call_started');
    scene.restoreMemory(); scene.advance();
    assert.equal(attempts, 1); assert.equal(scene.current.outcome.stopReason, 'spawn_unknown');
    assert.equal(scene.current.slots.scout.requestId, original.requestId);
    assert.ok(scene.current.evidence.unknownEnergyUpperBound > 0);
});

test('admission_p5_abort_cannot_hold_released_or_foreign_session', async () => {
    for (const released of [false, true]) {
        const f = await createAdmissionAdapterFixture();
        const context = admissionContext(f);
        if (released) Memory.empire.remoteMining.economicTrials.current.managed = false;
        else context.trialId = 'foreign';
        f.api.abortEconomicTrialSpawnAdmission(context, 'stale_callback');
        assert.equal(Memory.empire.control.policy.remoteMining.enabled, true);
    }
});
for (const stage of ['before_dispatch', 'before_run']) for (const condition of ['hold', 'market', 'danger', 'receiver']) {
    test('admission_p5_gates_' + stage + '_' + condition, async () => {
        const scene = await createEconomicTrialFixture(); scene.prepare();
        const change = () => {
            if (condition === 'hold') Memory.empire.remoteRooms.W1N2.hold = true;
            if (condition === 'market') Memory.empire.market.enabled = true;
            if (condition === 'receiver') scene.f.homeSink.store.energy = 299999;
            if (condition === 'danger') scene.f.visibleHostiles.push({pos: new RoomPosition(10, 10, 'W1N1')});
        };
        if (stage === 'before_dispatch') {
            const bureau = scene.f.services.find(s => s.name === 'SpawnBureau'), original = bureau.analyze.bind(bureau);
            bureau.analyze = () => {original(); change();};
            scene.advance();
        } else scene.advance({betweenDispatchAndRun: change});
        assert.equal(scene.f.spawnCalls.length, 0);
        assert.equal(scene.current.slots.scout.calls, 0);
    });
}
test('admission_p5_budget_and_receipt_caps', async () => {
    for (const pending of [false, true]) {
        const f = await createAdmissionAdapterFixture();
        const candidate = f.api.buildEconomicTrialSpawnCandidate(f.scope, 'scout');
        const budget = Memory.empire.remoteMining.budgets.W1N1;
        if (pending) budget.grants.other = {requestId: 'other', remoteId: 'other-scope', epoch: 1, maxEnergy: 1951, deadline: 150, executing: false};
        else budget.buckets = [{start: 100, amount: 1951}];
        const result = f.api.beginEconomicTrialSpawnAdmission(candidate, admissionContext(f));
        assert.equal(result.allowed, false);
        assert.equal(Memory.empire.remoteMining.economicTrials.current.evidence.confirmedSpawnCost, 0);
        if (pending) assert.ok(budget.grants.other, 'other claim must be retained');
    }
    const scene = await createEconomicTrialFixture(); scene.prepare();
    Memory.empire.control.policy.spawnIntake.maxReceiptsPerRoom = 1;
    Memory.empire.spawnRequestReceipts = {existing: {roomName: 'W1N1', expireAt: 1000}};
    scene.advance();
    assert.equal(scene.current.slots.scout.requestId, undefined);
    assert.equal(scene.f.spawnCalls.length, 0);
});
test('admission_p5_stale_forged_duplicate_candidates', async () => {
    const p = await createAdmissionFixture(); p.toSafe99(); p.retireHomeHaulers(); p.advance();
    const offered = global.SpawnDemands.W1N1.find(d => d.role === 'remoteMiner');
    assert.ok(offered.economicTrialCandidate);
    const api = await import('../services/RemoteEconomicTrialService.js');
    const old = structuredClone(offered); p.advance();
    assert.equal(api.inspectEconomicTrialSpawnCandidate(old.economicTrialCandidate, old).allowed, false);
    assert.ok((p.scene.f.bus.topics.REQ_SPAWN || []).length <= 1);
    assert.equal(p.scene.current.slots.remoteMiner.requestId, undefined);
    const f = await createAdmissionAdapterFixture();
    const Spawn = f.scene.f.services.find(s => s.name === 'Spawn'); Spawn.init();
    const candidate = f.api.buildEconomicTrialSpawnCandidate(f.scope, 'scout');
    const event = {id: 'offer', data: {...f.data, economicTrialCandidate: candidate}, expireAt: Game.time, priority: 35};
    Spawn.handleSpawnRequest(event); Spawn.handleSpawnRequest({...event, id: 'duplicate'});
    assert.equal(Spawn.pendingTasks.length, 1);
    const id = Memory.empire.remoteMining.economicTrials.current.slots.scout.requestId;
    assert.equal(Object.keys(Memory.empire.remoteMining.budgets.W1N1.grants).length, 1);
    assert.equal(Spawn.pendingTasks[0].requestId, id);
});
test('admission_p5_default_and_legacy_compatibility', async () => {
    const p = await createAdmissionFixture(); p.advance();
    assert.equal(Memory.empire.remoteMining.nativeEconomicOps, undefined);
    assert.ok(!(global.SpawnDemands.W1N1 || []).some(d => d.economicTrialCandidate));
    const {NATIVE_OPS_PROFILE} = await import('../services/NativeEconomicTrialOpsProfile.js');
    const {validEconomicTrialState} = await import('../services/RemoteEconomicTrialModel.js');
    const old = structuredClone(NATIVE_OPS_PROFILE.oldCurrent), before = JSON.stringify(old);
    assert.equal(validEconomicTrialState({schemaVersion: 1, lastSequence: 1, current: old, previous: null}), true);
    assert.equal(JSON.stringify(old), before);
});
test('admission_p5_first_delivery_after_home_competition', async () => {
    const p = await createAdmissionFixture({containerBuilt: true}); p.toSafe99(); p.retireHomeHaulers();
    for (let i = 0; i < 900 && !p.scene.current.outcome; i++) p.advance();
    assert.equal(p.scene.current.outcome?.stopReason, 'first_delivery');
    assert.ok(p.scene.current.evidence.returnedEnergy > 0);
    const calls = p.scene.f.spawnCalls.filter(c => c.memory.economicTrialId === 'native-econ-one');
    assert.deepEqual(calls.map(c => c.memory.role).sort(), ['remoteHauler', 'remoteMiner', 'scout']);
    const costs = calls.reduce((sum, c) => sum + c.cost, 0);
    assert.equal(p.scene.current.evidence.confirmedSpawnCost, costs); assert.ok(costs <= 1650);
    assert.equal(p.scene.current.evidence.unknownEvents, 0);
    assert.equal(p.scene.state.previous.evidence.confirmedSpawnCost, 50);
    for (let i = 0; i < 4 && Memory.empire.remoteMining.nativeEconomicOps.current.stage !== 'terminal'; i++) p.advance();
    const summary = global.RemoteTrialOps.status('native-one');
    assert.equal(summary.controlClosureConfirmed, true); assert.equal(summary.economic.tailStatus, 'unverified');
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
});
for (const deadline of ['tick', 'native_wall']) test('admission_p5_waiting_does_not_extend_' + deadline, async () => {
    const p = await createAdmissionFixture(); p.toSafe99(); p.retireHomeHaulers(); p.advance();
    const expires = p.scene.current.expiresAtTick, request = Memory.empire.remoteMining.nativeEconomicOps.current.request;
    if (deadline === 'native_wall') p.advance({nowMs: request.stopAtMs});
    else p.advance({tick: expires});
    assert.ok(p.scene.current.outcome);
    assert.equal(p.scene.current.expiresAtTick, expires);
    assert.equal(p.scene.current.slots.remoteMiner.requestId, undefined);
    assert.equal(p.scene.f.spawnCalls.filter(c => c.memory.role === 'remoteMiner').length, 0);
});

test('admission_review_applying_is_not_proof_of_uncalled', async () => {
    const scene = await createEconomicTrialFixture(); scene.prepare();
    assert.throws(() => scene.advance({betweenDispatchAndRun() {throw new Error('interrupted');}}), /interrupted/);
    const slot = scene.current.slots.scout;
    assert.equal(slot.callState, 'not_started');
    slot.ledgerStage = 'applying';
    const before = JSON.stringify(scene.state), id = slot.requestId;
    scene.restoreMemory(); scene.advance();
    assert.equal(scene.f.spawnCalls.length, 0, 'contradictory applying evidence must not be cleared and replayed');
    assert.equal(JSON.stringify(scene.state), before, 'invalid raw record must be retained');
    assert.ok(Memory.empire.remoteMining.budgets.W1N1.grants[id]);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
});

for (const checkpoint of ['binding', 'grant', 'intake']) test('admission_p4_write_failure_at_' + checkpoint, async () => {
    const scene = await createEconomicTrialFixture(); scene.prepare();
    const service = scene.f.services.find(s => s.name === 'RemoteMining'), analyze = service.analyze.bind(service);
    service.analyze = () => {
        analyze();
        if (checkpoint === 'grant') {
            const budget = Memory.empire.remoteMining.budgets.W1N1;
            budget.grants = new Proxy(budget.grants, {set() {throw new Error('grant write interrupted');}});
        } else {
        const remote = Memory.empire.remoteMining;
        let saved = remote.economicTrials;
        Object.defineProperty(remote, 'economicTrials', {configurable: true, enumerable: true,
            get() {return saved;}, set(value) {
                const slot = value.current?.slots.scout;
                if (!value.current?.outcome && slot?.admissionStage === 'binding' &&
                    (checkpoint === 'binding' ? slot.callState === undefined : slot.callState === 'not_started')) {
                    throw new Error(checkpoint + ' write interrupted');
                }
                saved = value;
            }});
        }
    };
    scene.advance();
    assert.equal(scene.f.spawnCalls.length, 0);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(scene.current.slots.scout.calls, 0);
    const originalId = scene.current.slots.scout.requestId;
    scene.restoreMemory(); scene.advance();
    assert.equal(scene.f.spawnCalls.length, 0);
    assert.equal(scene.current.slots.scout.requestId, originalId);
});
