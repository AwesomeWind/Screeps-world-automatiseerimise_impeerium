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

async function stoppedTailScene() {
    const model = await load();
    const state = await start();
    state.current.slots.scout = { calls: 1, name: 'ScoutA', bodyCost: 50, cost: 50, callState: 'result_known', result: 0,
        requestId: 'request-A', deadline: 106, acceptedAt: 101,
        ledgerStage: 'applied', nativeResult: 0, ledgerApplication: { applied: true, cost: 50 },
        receiptBinding: { identity: { ...state.current.identity }, requestId: 'request-A', name: 'ScoutA', tick: 101 } };
    return model.advanceEconomicTrial(state, { kind: 'evaluate' }, facts({ guardEnabled: false }), clock(102)).state;
}
const tailQuery = () => ({ remoteId: 'W1N1:W1N2', epoch: 1, trialId: 'econ-one', sequence: 1,
    role: 'scout', name: 'ScoutA', action: 'return' });

test('econ_p5_return_permission_has_absolute_tail_bound', async () => {
    const model = await load();
    const closed = await stoppedTailScene();
    assert.equal(closed.current.outcome.stopReason, 'guard_disabled');
    const gate = model.economicTrialPermission(closed, tailQuery(), clock(403));
    assert.equal(gate.allowed, false);
});

for (const [label, change] of [
    ['infinite_expiry', session => { session.tailExpiresAtTick = Infinity; }],
    ['nan_expiry', session => { session.tailExpiresAtTick = NaN; }],
    ['string_expiry', session => { session.tailExpiresAtTick = '999999999999'; }],
    ['extended_expiry', session => { session.tailExpiresAtTick++; }],
    ['shortened_expiry', session => { session.tailExpiresAtTick--; }],
    ['null_expiry', session => { session.tailExpiresAtTick = null; }],
    ['negative_expiry', session => { session.tailExpiresAtTick = -1; }],
    ['string_close_tick', session => { session.closeAppliedAtTick = String(session.closeAppliedAtTick); }],
    ['shifted_close_and_expiry', session => { session.closeAppliedAtTick++; session.tailExpiresAtTick++; }],
    ['missing_close_tick', session => { delete session.closeAppliedAtTick; }],
]) {
    test('tail_deadline_corrupt_' + label, async () => {
        const model = await load();
        const state = await stoppedTailScene();
        change(state.current);
        const before = structuredClone(state);
        assert.equal(model.validEconomicTrialState(state), false);
        assert.equal(model.economicTrialPermission(state, tailQuery(), clock(103)).allowed, false);
        const result = model.advanceEconomicTrial(state, { kind: 'evaluate' }, facts({ closed: true }), clock(103));
        assert.equal(result.permit.reason, 'state_invalid');
        assert.ok(result.effects.some(effect => effect.type === 'emergency_close'));
        assert.deepEqual(result.state, before);
        const restored = JSON.parse(JSON.stringify(state));
        assert.equal(model.validEconomicTrialState(restored), false);
        assert.equal(model.economicTrialPermission(restored, tailQuery(), clock(103)).allowed, false);
    });
}

test('tail_deadline_active_session_cannot_carry_stop_window', async () => {
    const model = await load();
    const state = await start();
    state.current.closeAppliedAtTick = 101;
    state.current.tailExpiresAtTick = 401;
    assert.equal(model.validEconomicTrialState(state), false);
});

test('tail_deadline_legacy_absent_fields_stay_absent_and_do_not_authorize_return', async () => {
    const model = await load();
    const state = await stoppedTailScene();
    delete state.current.closeAppliedAtTick;
    delete state.current.tailExpiresAtTick;
    const before = structuredClone(state);
    assert.equal(model.validEconomicTrialState(state), true);
    assert.equal(model.economicTrialPermission(state, tailQuery(), clock(103)).allowed, false);
    assert.deepEqual(state, before);
});

test('tail_deadline_exact_boundary_remains_fixed_after_json_reload', async () => {
    const model = await load();
    const state = JSON.parse(JSON.stringify(await stoppedTailScene()));
    assert.equal(state.current.tailExpiresAtTick, 402);
    assert.equal(model.economicTrialPermission(state, tailQuery(), clock(402)).allowed, true);
    assert.equal(model.economicTrialPermission(state, tailQuery(), clock(403)).allowed, false);
});

for (const tick of ['103', Infinity, NaN, -1, 101]) {
    test('tail_deadline_invalid_or_before_stop_clock_' + String(tick), async () => {
        const model = await load();
        const state = await stoppedTailScene();
        assert.equal(model.economicTrialPermission(state, tailQuery(), clock(tick)).allowed, false);
    });
}

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

for (const [name, change] of [
    ['unknown_event_without_amount', session => { session.evidence.unknownEvents = 1; }],
    ['spawn_call_in_progress', session => { Object.assign(session.slots.scout,
        { calls: 1, callState: 'call_started', callTick: 101, bodyCost: 50 }); }],
    ['spawn_ledger_applying', session => { Object.assign(session.slots.scout,
        { calls: 1, callState: 'call_started', callTick: 101, bodyCost: 50, ledgerStage: 'applying' }); }],
    ['spawn_receipt_not_bound', session => { Object.assign(session.slots.scout,
        { calls: 1, callState: 'result_known', bodyCost: 50, nativeResult: 0,
            ledgerStage: 'applied', ledgerApplication: { applied: true, cost: 50 } }); }],
    ['infrastructure_applying', session => { session.infrastructureAttempt =
        { stage: 'applying', upperBound: 5, tick: 101 }; }],
    ['infrastructure_evidence_pending', session => { session.infrastructureAttempt =
        { stage: 'applied', application: { applied: true, known: true, cost: 5 }, tick: 101 }; }],
    ['infrastructure_application_failed', session => { session.infrastructureAttempt =
        { stage: 'applied', evidenceApplied: true, application: { applied: false }, tick: 101 }; }],
    ['logistics_evidence_pending', session => { session.outbox =
        [{ key: 'pending-evidence', stage: 'applied', resolution: {}, application: { applied: true, credited: 100 } }]; }],
    ['logistics_application_failed', session => { session.outbox =
        [{ key: 'failed-application', stage: 'applied', evidenceApplied: true, resolution: {}, application: { applied: false } }]; }],
]) {
    test('settlement_summary_pending_' + name, async () => {
        const model = await load();
        const state = await start();
        change(state.current);
        assert.equal(model.validEconomicTrialState(state), true);
        const before = JSON.stringify(state);
        const summary = model.summarizeEconomicTrial(state, clock());
        assert.equal(summary.current.settlement.knownNetEnergy, 0);
        assert.equal(summary.current.settlement.netEnergy, null);
        assert.equal(JSON.stringify(state), before);
        const restored = JSON.parse(JSON.stringify(state));
        assert.equal(model.summarizeEconomicTrial(restored, clock(102)).current.settlement.netEnergy, null);
    });
}

test('settlement_summary_known_negative_net_remains_numeric', async () => {
    const model = await load();
    const state = await start();
    state.current.evidence.confirmedSpawnCost = 50;
    state.current.evidence.confirmedInfrastructureCost = 5;
    state.current.evidence.returnedEnergy = 20;
    state.current.infrastructureAttempt = { stage: 'applied', evidenceApplied: true,
        application: { applied: true, known: true, cost: 5 } };
    state.current.outbox = [{ key: 'finished', stage: 'applied', evidenceApplied: true,
        resolution: {}, application: { applied: true, credited: 20 } }];
    const summary = model.summarizeEconomicTrial(state, clock());
    assert.equal(summary.current.settlement.knownNetEnergy, -35);
    assert.equal(summary.current.settlement.netEnergy, -35);
    assert.equal(summary.current.tailStatus, 'unverified');
});

test('settlement_summary_previous_unknown_does_not_poison_current', async () => {
    const model = await load();
    const state = await start();
    state.previous = structuredClone(state.current);
    state.previous.identity.trialId = 'old-trial';
    state.previous.evidence.unknownEvents = 1;
    const summary = model.summarizeEconomicTrial(state, clock());
    assert.equal(summary.current.settlement.netEnergy, 0);
    assert.equal(summary.previous.settlement.netEnergy, null);
});

const corruptAmounts = [
    ['string', '0'], ['negative', -1], ['fraction', 0.5], ['infinite', Infinity],
    ['nan', NaN], ['null', null], ['boolean', true], ['object', {}]
];
for (const field of ['infrastructureUnknownUpperBound', 'logisticsUnknownEnergyUpperBound', 'tailReturnedEnergy', 'pickups', 'delivered']) {
    for (const [label, value] of corruptAmounts) {
        test('settlement_amount_corrupt_' + field + '_' + label, async () => {
            const model = await load();
            const state = await start();
            state.current.scopeCheckedAt = 101;
            if (['pickups', 'delivered'].includes(field)) state.current.evidence[field]['trip:corrupt'] = value;
            else state.current.evidence[field] = value;
            const before = structuredClone(state);
            assert.equal(model.validEconomicTrialState(state), false);
            const gate = model.economicTrialPermission(state, { remoteId: 'W1N1:W1N2', role: 'scout', action: 'spawn' }, clock());
            assert.equal(gate.allowed, false);
            assert.equal(gate.reason, 'state_invalid');
            const result = model.advanceEconomicTrial(state, { kind: 'evaluate' }, facts(), clock());
            assert.ok(result.effects.some(effect => effect.type === 'emergency_close'));
            assert.deepEqual(result.state, before);
            assert.equal(model.summarizeEconomicTrial(state, clock()).status, 'state_invalid');
            assert.equal(model.validEconomicTrialState(JSON.parse(JSON.stringify(state))), false);
        });
    }
}

test('settlement_amount_legacy_absence_is_retained', async () => {
    const model = await load();
    const state = await start();
    const before = structuredClone(state);
    assert.equal(model.validEconomicTrialState(state), true);
    const summary = model.summarizeEconomicTrial(state, clock());
    assert.equal(summary.current.settlement.netEnergy, 0);
    assert.equal(state.current.evidence.infrastructureUnknownUpperBound, undefined);
    assert.equal(state.current.evidence.logisticsUnknownEnergyUpperBound, undefined);
    assert.equal(state.current.evidence.tailReturnedEnergy, undefined);
    assert.deepEqual(state, before);
});

test('settlement_amount_integer_zeroes_and_provenance_remain_valid', async () => {
    const model = await load();
    const state = await start();
    Object.assign(state.current.evidence, { infrastructureUnknownUpperBound: 0,
        logisticsUnknownEnergyUpperBound: 0, tailReturnedEnergy: 0,
        pickups: { 'trip:known': 100 }, delivered: { 'trip:known': 0 } });
    const before = structuredClone(state);
    assert.equal(model.validEconomicTrialState(state), true);
    assert.equal(model.summarizeEconomicTrial(state, clock()).current.settlement.netEnergy, 0);
    assert.deepEqual(state, before);
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
