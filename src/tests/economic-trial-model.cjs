const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../services/RemoteEconomicTrialModel.js');
const clock = (tick = 101, nowMs = 1000000) => ({ tick, nowMs, codeVersion: 'econ-v1' });
const request = (extra = {}) => ({ schemaVersion: 1, action: 'start', id: 'econ-one', sequence: 1,
    remoteId: 'W1N1:W1N2', epoch: 1, codeVersion: 'econ-v1', activateAtTick: 101,
    expiresAtTick: 1101, issuedAtMs: 1000000, expiresAtMs: 6400000, configFingerprint: 'config-A', ...extra });
const facts = (extra = {}) => ({ guardEnabled: true, request: request(), configFingerprint: 'config-A',
    remoteId: 'W1N1:W1N2', baseRoom: 'W1N1', targetRoom: 'W1N2', epoch: 1,
    controlSafe: true, isolated: true, homeHealthy: true, receiverFree: 300000, budgetSafe: true,
    oldActors: false, unsettled: false, reconLocked: false, scopeFresh: true,
    remoteVisible: false, remoteSafe: false, sourceValid: false, routeValid: false, actors: [], ...extra });
async function start(extra = {}) {
    return (await load()).advanceEconomicTrial(undefined, { kind: 'evaluate' }, facts(extra), clock()).state;
}

async function modelWithObservedVision() {
    const model = await load();
    return model.advanceEconomicTrial(await start(), { kind: 'scope_observed' }, facts({ remoteVisible: true,
        remoteSafe: true, sourceValid: true, routeValid: true }), clock()).state;
}

async function terminalModelWithVision() {
    const model = await load();
    let state = await modelWithObservedVision();
    state = model.advanceEconomicTrial(state, { kind: 'evaluate' }, facts({ guardEnabled: false }), clock(102)).state;
    return model.advanceEconomicTrial(state, { kind: 'end_tick' }, facts({ guardEnabled: false, closed: true }), clock(103)).state;
}

test('vision_session_new_session_initializes_explicitly_without_history', async () => {
    const model = await load();
    let state = await terminalModelWithVision();
    const release = request({ action: 'release', id: 'release-one', sequence: 2, targetTrialId: 'econ-one',
        activateAtTick: 104, expiresAtTick: 1104 });
    state = model.advanceEconomicTrial(state, { kind: 'evaluate' }, facts({ request: release, closed: true }), clock(104)).state;
    const previous = JSON.stringify(state.current);
    const next = request({ id: 'econ-two', sequence: 3, activateAtTick: 105, expiresAtTick: 1105 });
    state = model.advanceEconomicTrial(state, { kind: 'evaluate' }, facts({ request: next }), clock(105)).state;
    assert.equal(state.current.identity.trialId, 'econ-two');
    assert.equal(state.current.visionAcquired, false);
    assert.equal(state.current.safeStreak, 0);
    assert.equal(state.current.lastSafeTick, undefined);
    assert.equal(state.current.safeStartedAtTick, undefined);
    assert.equal(state.current.evidence.confirmedSpawnCost, 0);
    assert.equal(state.current.evidence.unknownEnergyUpperBound, 0);
    assert.equal(JSON.stringify(state.previous), previous);
});

for (const remoteVisible of [false, true]) test('vision_session_managed_terminal_requires_release_' + remoteVisible, async () => {
    const model = await load();
    const state = await terminalModelWithVision();
    const previous = JSON.stringify(state.current);
    const next = request({ id: 'econ-two', sequence: 2, activateAtTick: 104, expiresAtTick: 1104 });
    const result = model.advanceEconomicTrial(state, { kind: 'evaluate' }, facts({ request: next,
        remoteVisible, remoteSafe: remoteVisible, sourceValid: remoteVisible, routeValid: remoteVisible, closed: true }), clock(104));
    assert.equal(result.state.lastRejection?.reason, 'release_required');
    assert.equal(result.state.lastSequence, 1);
    assert.equal(JSON.stringify(result.state.current), previous);
    assert.equal(result.state.previous, null);
});

for (const event of ['evaluate', 'end_tick']) for (const replacement of [false, true]) {
    test('vision_session_live_loss_closes_without_scope_' + event + '_' + replacement, async () => {
        const model = await load();
        const state = await modelWithObservedVision();
        const next = replacement ? request({ id: 'replacement', sequence: 2, activateAtTick: 102, expiresAtTick: 1102 }) : request();
        const result = model.advanceEconomicTrial(state, { kind: event }, facts({ request: next,
            remoteVisible: false, fatalReason: null }), clock(102));
        assert.equal(result.state.current.identity.trialId, 'econ-one');
        assert.equal(result.state.current.outcome?.stopReason, 'vision_lost');
        assert.equal(result.state.current.closeAppliedAtTick, 102);
        assert.ok(result.effects.some(effect => effect.type === 'close_scope'));
        if (replacement && event === 'evaluate') assert.equal(result.state.lastRejection.reason, 'trial_in_progress');
    });
}

test('vision_session_legacy_missing_flag_is_not_fabricated_vision', async () => {
    const model = await load();
    const state = await start();
    delete state.current.visionAcquired;
    const before = JSON.stringify(state);
    assert.equal(model.validEconomicTrialState(state), true);
    const result = model.advanceEconomicTrial(state, { kind: 'evaluate' }, facts(), clock(102));
    assert.equal(result.state.current.outcome, undefined);
    assert.equal(result.state.current.safeStreak, 0);
    assert.equal(JSON.stringify(state), before);
});

for (const flag of [null, 'true', 1, {}]) test('vision_session_invalid_flag_keeps_raw_and_fails_closed_' + JSON.stringify(flag), async () => {
    const model = await load();
    const state = await start(); state.current.visionAcquired = flag;
    const before = JSON.stringify(state);
    const result = model.advanceEconomicTrial(state, { kind: 'evaluate' }, facts(), clock(102));
    assert.equal(result.permit.reason, 'state_invalid');
    assert.ok(result.effects.some(effect => effect.type === 'emergency_close'));
    assert.equal(JSON.stringify(result.state), before);
});

test('econ_p1_default_off', async () => {
    const model = await load();
    const result = model.advanceEconomicTrial(undefined, { kind: 'evaluate' }, { guardEnabled: false }, clock());
    assert.equal(result.state, undefined);
    assert.equal(result.permit.managed, false);
    assert.deepEqual(result.effects, []);
    const { DEFAULT_EMPIRE_POLICY } = await import('../config/EmpirePolicy.js');
    assert.deepEqual(DEFAULT_EMPIRE_POLICY.remoteMining.economicTrial, { enabled: false, request: null });
});
test('econ_p1_invalid_request_preserves_raw', async () => {
    const model = await load();
    for (const raw of [[], { schemaVersion: 999 }, { schemaVersion: 1, current: {} }]) {
        const before = structuredClone(raw);
        const result = model.advanceEconomicTrial(raw, { kind: 'evaluate' }, facts(), clock());
        assert.deepEqual(raw, before);
        assert.deepEqual(result.state, before);
        assert.equal(result.permit.allowed, false);
    }
    for (const patch of [{ sequence: 0 }, { epoch: 2 }, { codeVersion: 'old' }, { configFingerprint: null }, { expiresAtTick: 1102 }]) {
        const result = model.advanceEconomicTrial(undefined, { kind: 'evaluate' }, facts({ request: request(patch) }), clock());
        assert.equal(result.state.current, null);
        assert.equal(result.permit.allowed, false);
    }
});
test('econ_p1_deadlines_and_replay', async () => {
    const model = await load();
    const initial = await start();
    assert.equal(initial.current.status, 'recon');
    assert.equal(initial.current.expiresAtTick, 1101);
    for (const [time, patch, reason] of [
        [clock(1101), {}, 'tick_expired'], [clock(102, 6400000), {}, 'wall_expired'],
        [clock(102, 999999), {}, 'clock_invalid'], [clock(103), {}, 'tick_gap'],
        [{ ...clock(102), codeVersion: 'old' }, {}, 'identity_changed'],
        [clock(102), { configFingerprint: 'changed' }, 'config_changed'],
        [clock(102), { guardEnabled: false }, 'guard_disabled']
    ]) {
        const result = model.advanceEconomicTrial(JSON.parse(JSON.stringify(initial)), { kind: 'evaluate' }, facts(patch), time);
        assert.equal(result.state.current.outcome.stopReason, reason);
        assert.equal(result.state.current.expiresAtTick, 1101);
        assert.equal(result.effects.some(effect => effect.type === 'close_scope'), true);
    }
    const replay = model.advanceEconomicTrial(initial, { kind: 'evaluate' }, facts(), clock());
    assert.equal(replay.state.previous, null);
    assert.equal(replay.state.current.startedAtTick, 101);
});
test('econ_p1_old_recon_lock', async () => {
    const model = await load();
    for (const patch of [{ oldActors: true }, { unsettled: true }, { reconLocked: true }]) {
        const result = model.advanceEconomicTrial(undefined, { kind: 'evaluate' }, facts(patch), clock());
        assert.equal(result.state.current, null);
        assert.equal(result.permit.allowed, false);
    }
    const initial = await start();
    const stopped = model.advanceEconomicTrial(initial, { kind: 'evaluate' }, facts({ guardEnabled: false }), clock(102));
    assert.equal(stopped.state.current.status, 'stopping');
    const closed = model.advanceEconomicTrial(stopped.state, { kind: 'evaluate' }, facts({ guardEnabled: false, closed: true }), clock(103));
    assert.equal(closed.state.current.status, 'terminal');
    assert.equal(closed.state.current.closureVerifiedAtTick, 103);
    assert.equal(model.economicTrialPermission(closed.state, { remoteId: 'W1N1:W1N2', action: 'spawn', role: 'scout' }, clock(103)).allowed, false);
});

module.exports = { clock, request, facts, start };

test('econ_p5_return_permission_has_absolute_tail_bound', async () => {
    const model = await load();
    const state = await start();
    state.current.slots.scout = { calls: 1, name: 'ScoutA', bodyCost: 50, cost: 50, callState: 'result_known', result: 0,
        requestId: 'request-A', deadline: 106, acceptedAt: 101,
        ledgerStage: 'applied', nativeResult: 0, ledgerApplication: { applied: true, cost: 50 },
        receiptBinding: { identity: { ...state.current.identity }, requestId: 'request-A', name: 'ScoutA', tick: 101 } };
    const closed = model.advanceEconomicTrial(state, { kind: 'evaluate' }, facts({ guardEnabled: false }), clock(102)).state;
    assert.equal(closed.current.outcome.stopReason, 'guard_disabled');
    const gate = model.economicTrialPermission(closed, { remoteId: 'W1N1:W1N2', epoch: 1, trialId: 'econ-one', sequence: 1,
        role: 'scout', name: 'ScoutA', action: 'return' }, clock(403));
    assert.equal(gate.allowed, false);
});

function deliveryScene() {
    return {
        identity: { trialId: 'econ-one', sequence: 1, remoteId: 'W1N1:W1N2', epoch: 1, codeVersion: 'econ-v1' },
        startedAtTick: 101, baseRoom: 'W1N1', targetRoom: 'W1N2', containerId: 'RemoteContainer', receiverId: 'HomeSink',
        slots: { remoteHauler: { name: 'HaulerA', acceptedAt: 101 } },
        evidence: { confirmedSpawnCost: 200, confirmedInfrastructureCost: 10, unknownEnergyUpperBound: 0,
            unknownEvents: 0, returnedEnergy: 0, pickups: { 'trip:HaulerA:1:1': 400 }, delivered: {} }
    };
}
function deliveryResolution(extra = {}) {
    return { creepName: 'HaulerA', ownerRole: 'remoteHauler', reservationId: '109:1:HaulerA',
        assignedAt: 109, sequence: 1, actionTick: 110, resourceType: 'energy', targetId: 'HomeSink',
        targetRoom: 'W1N1', status: 'confirmed', confirmedAmount: 100, reservedAmount: 400,
        context: { ...deliveryScene().identity, tripId: 'HaulerA:1:1', leg: 'home_delivery' }, ...extra };
}
test('econ_p4_partial_delivery_and_tail_are_separate', async () => {
    const { applyEconomicResolution } = await import('../services/RemoteEconomicTrialEvidence.js');
    const scene = deliveryScene();
    const first = applyEconomicResolution(scene, deliveryResolution(), { applied: true, credited: 100 }, clock(111));
    assert.equal(first.firstDelivery.amount, 100);
    assert.equal(first.evidence.returnedEnergy, 100);
    scene.evidence = first.evidence;
    scene.outcome = { verdict: 'completed' };
    const tail = applyEconomicResolution(scene, deliveryResolution(), { applied: true, credited: 100 }, clock(112));
    assert.equal(tail.firstDelivery, undefined);
    assert.equal(tail.evidence.tailReturnedEnergy, 100);
    assert.equal(tail.evidence.returnedEnergy, 200);
});
for (const [name, patch] of [
    ['other_actor', { creepName: 'Other' }], ['other_role', { ownerRole: 'remoteMiner' }],
    ['old_epoch', { context: { ...deliveryResolution().context, epoch: 0 } }],
    ['old_trial', { context: { ...deliveryResolution().context, trialId: 'old' } }],
    ['other_sequence', { context: { ...deliveryResolution().context, sequence: 2 } }],
    ['old_version', { context: { ...deliveryResolution().context, codeVersion: 'old' } }],
    ['same_tick', { actionTick: 111 }], ['old_assignment', { assignedAt: 100 }],
    ['wrong_target', { targetId: 'StorageA' }], ['wrong_room', { targetRoom: 'W1N2' }],
    ['wrong_resource', { resourceType: 'H' }], ['source_leg', { context: { ...deliveryResolution().context, leg: 'source_deposit' } }],
    ['zero', { confirmedAmount: 0 }], ['future_assignment', { assignedAt: 112 }],
    ['unknown', { status: 'unknown', confirmedAmount: 0 }]
]) {
    test('econ_p4_reject_' + name, async () => {
        const { applyEconomicResolution } = await import('../services/RemoteEconomicTrialEvidence.js');
        const result = applyEconomicResolution(deliveryScene(), deliveryResolution(patch), { applied: true, credited: 100 }, clock(111));
        assert.equal(result.firstDelivery, undefined);
        assert.ok(result.reason);
    });
}
test('econ_p4_missing_pickup_excess_delivery_and_not_applied', async () => {
    const { applyEconomicResolution } = await import('../services/RemoteEconomicTrialEvidence.js');
    for (const variant of ['no_pickup', 'excess', 'not_applied']) {
        const scene = deliveryScene();
        if (variant === 'no_pickup') scene.evidence.pickups = {};
        if (variant === 'excess') scene.evidence.delivered['trip:HaulerA:1:1'] = 350;
        const result = applyEconomicResolution(scene, deliveryResolution(), { applied: variant !== 'not_applied', credited: 100 }, clock(111));
        assert.equal(result.firstDelivery, undefined);
        assert.equal(result.evidence.returnedEnergy, 0);
    }
});
test('econ_p5_new_session_cost_unknown_and_streak_are_zero', async () => {
    const model = await load();
    const one = await start();
    one.current.evidence.unknownEvents = 2;
    let state = model.advanceEconomicTrial(one, { kind: 'evaluate' }, facts({ guardEnabled: false }), clock(102)).state;
    state = model.advanceEconomicTrial(state, { kind: 'evaluate' }, facts({ guardEnabled: false, closed: true }), clock(103)).state;
    const release = request({ action: 'release', id: 'release-one', sequence: 2, targetTrialId: 'econ-one', activateAtTick: 104, expiresAtTick: 1104 });
    state = model.advanceEconomicTrial(state, { kind: 'evaluate' }, facts({ request: release, closed: true }), clock(104)).state;
    assert.equal(state.current.managed, false);
    state = model.advanceEconomicTrial(state, { kind: 'evaluate' }, facts({ request: request({ id: 'econ-two', sequence: 3,
        activateAtTick: 105, expiresAtTick: 1105 }) }), clock(105)).state;
    assert.equal(state.current.identity.trialId, 'econ-two');
    assert.equal(state.current.evidence.unknownEvents, 0);
    assert.equal(state.current.evidence.confirmedSpawnCost, 0);
    assert.equal(state.current.safeStreak, 0);
    assert.equal(state.previous.evidence.unknownEvents, 2);
});

test('econ_p5_outbox_capacity_preserves_invalid_raw', async () => {
    const model = await load();
    const state = await start();
    state.current.outbox = Array.from({ length: 17 }, (_, i) => ({ key: String(i), stage: 'prepared', resolution: {} }));
    const before = JSON.stringify(state);
    const result = model.advanceEconomicTrial(state, { kind: 'evaluate' }, facts(), clock(102));
    assert.equal(JSON.stringify(state), before);
    assert.equal(result.permit.allowed, false);
    assert.ok(result.effects.some(effect => effect.type === 'emergency_close'));
});

test('review_release_requires_valid_request_identity_and_schema', async () => {
    const model = await load();
    let state = await start();
    state = model.advanceEconomicTrial(state, { kind: 'evaluate' }, facts({ guardEnabled: false }), clock(102)).state;
    state = model.advanceEconomicTrial(state, { kind: 'evaluate' }, facts({ guardEnabled: false, closed: true }), clock(103)).state;
    for (const patch of [{ schemaVersion: 999 }, { epoch: 2 }, { codeVersion: 'other' }]) {
        const release = request({ action: 'release', id: 'release-one', sequence: 2, targetTrialId: 'econ-one',
            activateAtTick: 104, expiresAtTick: 1104, ...patch });
        const result = model.advanceEconomicTrial(state, { kind: 'evaluate' }, facts({ request: release, closed: true }), clock(104));
        assert.equal(result.state.current.managed, true);
        assert.equal(result.state.lastRejection.reason, 'release_blocked');
    }
});
