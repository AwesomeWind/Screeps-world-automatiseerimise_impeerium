const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../services/RemoteReconTrialModel.js');
const clock = (tick = 101, nowMs = 1003000) => ({ tick, nowMs, codeVersion: 'trial-v1' });
const request = (extra = {}) => ({ schemaVersion: 1, action: 'start', id: 'trial-one', sequence: 1,
    remoteId: 'W1N1:W1N2', epoch: 1, codeVersion: 'trial-v1', activateAtTick: 101,
    expiresAtTick: 401, issuedAtMs: 1000000, expiresAtMs: 2200000, candidateSourceId: 'source-A', ...extra });
const facts = (extra = {}) => ({ guardEnabled: true, request: request(), configFingerprint: 'config-A',
    remoteId: 'W1N1:W1N2', baseRoom: 'W1N1', targetRoom: 'W1N2', epoch: 1, controlSafe: true, isolated: true, homeHealthy: true,
    receiverFree: 20000, budgetSafe: true, oldActors: false, unsettled: false,
    scopeFresh: true, existingReconAllowed: true, actors: [], moduleClosed: extra.closed === true, ...extra });
async function start(extra = {}) {
    const model = await load();
    return model.advanceReconTrial(undefined, { kind: 'begin_tick' }, facts(extra), clock()).state;
}

test('trial_default_off_is_absent', async () => {
    const model = await load();
    const result = model.advanceReconTrial(undefined, { kind: 'begin_tick' }, { guardEnabled: false, request: null }, clock());
    assert.equal(result.state, undefined);
    assert.equal(result.permit.managed, false);
    assert.deepEqual(result.effects, []);
});

test('trial_start_only_at_activation_tick', async () => {
    const { advanceReconTrial } = await load();
    assert.equal(advanceReconTrial(undefined, { kind: 'begin_tick' }, facts(), clock(100)).state, undefined);
    const active = await start();
    assert.equal(active.current.status, 'waiting_spawn');
    const missed = advanceReconTrial(undefined, { kind: 'begin_tick' }, facts(), clock(102));
    assert.equal(missed.permit.allowSpawn, false);
    assert.equal(missed.state.lastRejection.reason, 'activation_missed');
});

test('trial_absolute_deadlines_do_not_restart', async () => {
    const { advanceReconTrial, reconTrialPermission } = await load();
    const state = await start();
    assert.equal(state.current.expiresAtTick, 401);
    const restored = JSON.parse(JSON.stringify(state));
    assert.equal(reconTrialPermission(restored, { remoteId: 'W1N1:W1N2', epoch: 1, action: 'outbound' }, clock(400)).allowOutbound, false,
        'a new tick needs a fresh scope before departure');
    // A future sample is a continuity failure, rather than permission to restart a lease.
    const expired = advanceReconTrial(restored, { kind: 'begin_tick' }, facts(), clock(401));
    assert.equal(expired.state.current.status, 'stopping');
    assert.equal(expired.state.current.outcome.stopReason, 'tick_expired');
    assert.equal(expired.state.current.expiresAtTick, 401);
    const wall = advanceReconTrial(state, { kind: 'begin_tick' }, facts(), clock(102, 2200000));
    assert.equal(wall.state.current.outcome.stopReason, 'wall_expired');
});

test('trial_request_replay_and_corrupt_state', async () => {
    const { advanceReconTrial } = await load();
    const state = await start();
    const replayed = advanceReconTrial(state, { kind: 'begin_tick' }, facts(), clock());
    assert.deepEqual(replayed.state, state);
    for (const invalid of [{ schemaVersion: 99 }, [], { schemaVersion: 1, lastSequence: -1 },
        { ...state, current: { ...state.current, status: 'unknown' } }]) {
        const snapshot = structuredClone(invalid);
        const result = advanceReconTrial(invalid, { kind: 'begin_tick' }, facts(), clock());
        assert.deepEqual(result.state, snapshot);
        assert.equal(result.permit.allowSpawn, false);
        assert.equal(result.permit.managed, true);
    }
    const rejected = advanceReconTrial({ ...state, current: null }, { kind: 'begin_tick' }, facts(), clock());
    assert.equal(rejected.state.lastRejection.reason, 'sequence_replayed');
});

test('trial_request_invalid_values_do_not_create_active_sessions', async () => {
    const { advanceReconTrial } = await load();
    for (const bad of [{ sequence: 0 }, { sequence: '1' }, { id: '' }, { id: 'a'.repeat(65) },
        { expiresAtTick: 402 }, { expiresAtMs: 2200001 }, { codeVersion: 'other' }, { epoch: 2 },
        { candidateSourceId: null }, { issuedAtMs: 1100000 }, { action: 'unknown' }]) {
        const result = advanceReconTrial(undefined, { kind: 'begin_tick' }, facts({ request: request(bad) }), clock());
        assert.equal(result.state.current, null, JSON.stringify(bad));
        assert.equal(result.permit.allowSpawn, false);
    }
});

test('trial_config_clock_and_identity_changes_stop', async () => {
    const { advanceReconTrial } = await load();
    const state = await start();
    for (const [patch, time, reason] of [
        [{ configFingerprint: 'changed' }, clock(102), 'config_changed'],
        [{ epoch: 2 }, clock(102), 'identity_changed'],
        [{}, { ...clock(102), codeVersion: 'trial-v2' }, 'identity_changed'],
        [{}, clock(102, 999999), 'clock_invalid'], [{}, clock(102, NaN), 'clock_invalid'],
        [{ guardEnabled: false }, clock(102), 'guard_disabled']
    ]) {
        const result = advanceReconTrial(state, { kind: 'begin_tick' }, facts(patch), time);
        assert.equal(result.state.current.outcome.stopReason, reason);
        assert.equal(result.state.current.expiresAtTick, 401);
    }
    assert.equal(state.current.outcome, undefined);
});

test('trial_terminal_result_and_events_are_bounded', async () => {
    const { advanceReconTrial } = await load();
    let state = await start();
    for (let tick = 102; tick <= 135; tick++) {
        state = advanceReconTrial(state, { kind: 'begin_tick' }, facts(), clock(tick)).state;
        state = advanceReconTrial(state, { kind: 'scope_observed' }, facts(), clock(tick)).state;
    }
    const stopped = advanceReconTrial(state, { kind: 'begin_tick' }, facts({ fatalReason: 'manual_hold' }), clock(136)).state;
    const frozen = structuredClone(stopped.current.outcome);
    state = advanceReconTrial(stopped, { kind: 'begin_tick' }, facts({ closed: true }), clock(137)).state;
    assert.equal(state.current.status, 'aborted');
    state = advanceReconTrial(state, { kind: 'begin_tick' }, facts(), clock(138)).state;
    assert.deepEqual(state.current.outcome, frozen);
    assert.ok(state.current.events.length <= 20);
    assert.equal(state.previous, null);
});

test('trial_release_requires_settled_closed_scope', async () => {
    const { advanceReconTrial } = await load();
    let state = await start();
    state = advanceReconTrial(state, { kind: 'begin_tick' }, facts({ fatalReason: 'manual_hold' }), clock(102)).state;
    state = advanceReconTrial(state, { kind: 'begin_tick' }, facts({ closed: true }), clock(103)).state;
    const release = request({ id: 'release-one', sequence: 2, action: 'release', targetTrialId: 'trial-one',
        activateAtTick: 104, expiresAtTick: 404 });
    for (const patch of [{ unsettled: true }, { oldActors: true }, { closed: false }]) {
        const result = advanceReconTrial(state, { kind: 'begin_tick' }, facts({ request: release, closed: true, ...patch }), clock(104));
        assert.equal(result.state.current.managed, true);
    }
    const result = advanceReconTrial(state, { kind: 'begin_tick' }, facts({ request: release, closed: true }), clock(104));
    assert.equal(result.state.current.managed, false);
    assert.equal(result.state.lastSequence, 2);
    assert.equal(result.effects.length, 0);
    assert.equal(result.permit.managed, false);
});

test('trial_spawn_claim_and_permit_are_scoped_and_single_use', async () => {
    const { advanceReconTrial, reconTrialPermission } = await load();
    let state = await start();
    state = advanceReconTrial(state, { kind: 'scope_observed' }, facts(), clock()).state;
    const query = { remoteId: 'W1N1:W1N2', epoch: 1, action: 'spawn', trialId: 'trial-one', sequence: 1 };
    assert.equal(reconTrialPermission(state, query, clock()).allowSpawn, true);
    state = advanceReconTrial(state, { kind: 'spawn_bound', requestId: 'req', deadline: 106 }, facts(), clock()).state;
    state = advanceReconTrial(state, { kind: 'spawn_intake', name: 'Scout', spawnName: 'Spawn1' }, facts(), clock()).state;
    state = advanceReconTrial(state, { kind: 'spawn_call_started', name: 'Scout', spawnName: 'Spawn1' }, facts(), clock()).state;
    assert.equal(state.current.spawn.callState, 'call_started');
    assert.equal(reconTrialPermission(state, { ...query, requestId: 'req' }, clock()).allowSpawn, false);
    state = advanceReconTrial(state, { kind: 'spawn_result', result: 0, name: 'Scout' }, facts(), clock()).state;
    assert.equal(state.current.spawn.acceptedAt, 101);
    assert.equal(state.current.status, 'spawning');
    assert.equal(reconTrialPermission(state, { ...query, action: 'outbound' }, clock()).allowOutbound, true);
    assert.equal(reconTrialPermission(state, { ...query, sequence: 2 }, clock()).allowSpawn, false);
});

test('trial_birth_movement_and_safety_need_fresh_session_evidence', async () => {
    const { advanceReconTrial } = await load();
    let state = await start();
    for (const event of [{ kind: 'spawn_bound', requestId: 'req', deadline: 106 },
        { kind: 'spawn_result', result: 0, name: 'Scout' }]) {
        state = advanceReconTrial(state, event, facts(), clock()).state;
    }
    const actor = { name: 'Scout', trialId: 'trial-one', sequence: 1, epoch: 1, hasMove: true,
        pos: { x: 10, y: 11, roomName: 'W1N1' }, spawning: true };
    let sample = facts({ actors: [actor], sourceValid: true, visibleRoute: { valid: true } });
    state = advanceReconTrial(state, { kind: 'scope_observed' }, sample, clock()).state;
    assert.equal(state.current.evidence.bornAt, undefined);
    for (let tick = 102; tick <= 202; tick++) {
        const pos = tick === 102 ? actor.pos : { x: 1, y: 25, roomName: 'W1N2' };
        sample = facts({ actors: [{ ...actor, spawning: false, pos }], remoteSafe: tick >= 103,
            sourceValid: true, visibleRoute: { valid: true } });
        state = advanceReconTrial(state, { kind: 'begin_tick' }, sample, clock(tick)).state;
        state = advanceReconTrial(state, { kind: 'scope_observed' }, sample, clock(tick)).state;
        if (tick === 102) assert.equal(state.current.evidence.firstMovementAt, undefined);
        if (tick === 201) assert.equal(state.current.evidence.safeStreak, 99);
    }
    assert.equal(state.current.evidence.bornAt, 102);
    assert.equal(state.current.evidence.firstMovementAt, 103);
    assert.equal(state.current.evidence.safeStreak, 100);
    assert.equal(state.current.status, 'stopping');
    assert.equal(state.current.outcome.verdict, 'completed');
    assert.equal(state.current.spawn.deadline, 106);
});

test('trial_unknown_call_and_actor_loss_abort_without_new_budget', async () => {
    const { advanceReconTrial } = await load();
    let state = await start();
    state = advanceReconTrial(state, { kind: 'spawn_bound', requestId: 'req', deadline: 106 }, facts(), clock()).state;
    state = advanceReconTrial(state, { kind: 'spawn_call_started', name: 'Scout' }, facts(), clock()).state;
    const unknown = advanceReconTrial(state, { kind: 'begin_tick' }, facts(), clock(102));
    assert.equal(unknown.state.current.outcome.stopReason, 'spawn_unknown');
    assert.equal(unknown.state.current.spawn.callState, 'call_started');
});


test('settle_p2_old_unknown_fact_cannot_enter_new_admission', async () => {
    const { advanceReconTrial } = await load();
    let state = await start();
    state = advanceReconTrial(state, { kind: 'begin_tick' }, facts({ fatalReason: 'manual_hold' }), clock(102)).state;
    state = advanceReconTrial(state, { kind: 'begin_tick' }, facts({ closed: true }), clock(103)).state;
    state.current.settlement = { confirmedCost: null, unknownUpperBound: 50, updatedAtTick: 102 };
    const previous = structuredClone(state.current);
    const nextRequest = request({ id: 'trial-two', sequence: 2, activateAtTick: 104, expiresAtTick: 404 });
    const result = advanceReconTrial(state, { kind: 'begin_tick' }, facts({ request: nextRequest,
        settlement: previous.settlement, settlementEvidence: { identity: previous.identity, requestId: null, receipt: null } }), clock(104));
    assert.equal(result.state.current.identity.trialId, 'trial-two');
    assert.deepEqual(result.state.current.settlement, { confirmedCost: 0, unknownUpperBound: 0, updatedAtTick: 104 });
    assert.deepEqual(result.state.previous, previous);
});
test('settle_p3_same_tick_repeated_export_is_readonly', async () => {
    const { advanceReconTrial, summarizeReconTrial } = await load();
    let state = await start();
    state = advanceReconTrial(state, { kind: 'begin_tick' }, facts(), clock()).state;
    const before = structuredClone(state);
    for (let i = 0; i < 3; i++) summarizeReconTrial(state, clock(102));
    assert.deepEqual(state, before);
});


test('settle_review_receipt_and_failure_conflict_keeps_real_charge', async () => {
    const { reduceReconTrialSettlement } = await loadSettlement();
    const session = await settlementSession({ requestId: 'B:req', name: 'B-scout', callState: 'result_known',
        result: -4, callTick: 314 });
    const result = reduceReconTrialSettlement(session, settlementEvidence(session), { tick: 315 });
    assert.equal(result.settlement.confirmedCost, 50);
    assert.equal(result.settlement.unknownUpperBound, 0);
    assert.equal(result.sourceStatus, 'invalid_evidence');
});

const loadSettlement = () => import('../services/RemoteReconTrialSettlement.js');
const settlementIdentity = { trialId: 'B', sequence: 2, remoteId: 'W1N1:W1N2', epoch: 1, codeVersion: 'trial-v1' };
async function settlementSession(spawn = {}) {
    const module = await loadSettlement();
    const initial = module.createReconTrialSettlement(settlementIdentity, 313);
    return { identity: { ...settlementIdentity }, startedAtTick: 313, status: 'waiting_spawn', spawn,
        settlement: initial.settlement, settlementBinding: initial.binding };
}
function settlementEvidence(session, patch = {}) {
    return { identity: { ...session.identity }, requestId: session.spawn.requestId ?? null,
        receipt: { requestId: session.spawn.requestId, name: session.spawn.name, remoteId: session.identity.remoteId,
            epoch: session.identity.epoch, cost: 50, tick: 314, ...patch } };
}
test('settle_p1_init', async () => {
    const { createReconTrialSettlement } = await loadSettlement();
    const identity = { ...settlementIdentity };
    const initial = createReconTrialSettlement(identity, 313);
    assert.deepEqual(initial.settlement, { confirmedCost: 0, unknownUpperBound: 0, updatedAtTick: 313 });
    assert.equal(initial.binding.requestId, null);
    identity.trialId = 'mutated';
    assert.equal(initial.binding.identity.trialId, 'B');
});
for (const [name, spawn, expected] of [
    ['unstarted', {}, [0, 0]], ['intake', { callState: 'not_started' }, [0, 0]],
    ['not_called', { callState: 'not_called' }, [0, 0]],
    ['failed', { callState: 'result_known', result: -4 }, [0, 0]],
    ['call_started', { callState: 'call_started', callTick: 314 }, [null, 50]],
    ['ok_without_receipt', { callState: 'result_known', result: 0, acceptedAt: 314 }, [null, 50]]
]) {
    test('settle_p1_post_event_states_' + name, async () => {
        const { reduceReconTrialSettlement } = await loadSettlement();
        const session = await settlementSession({ requestId: 'B:req', name: 'B-scout', ...spawn });
        const before = structuredClone(session);
        const result = reduceReconTrialSettlement(session, null, { tick: 315 });
        assert.deepEqual([result.settlement.confirmedCost, result.settlement.unknownUpperBound], expected);
        assert.deepEqual(session, before);
    });
}
for (const [field, value] of Object.entries({ trialId: 'A', sequence: 1, remoteId: 'W9N9:W9N8', epoch: 2, codeVersion: 'old' })) {
    test('settle_p1_identity_mismatch_' + field, async () => {
        const { reduceReconTrialSettlement } = await loadSettlement();
        const session = await settlementSession({ requestId: 'B:req', name: 'B-scout', callState: 'call_started', callTick: 314 });
        const evidence = settlementEvidence(session);
        evidence.identity[field] = value;
        const result = reduceReconTrialSettlement(session, evidence, { tick: 315 });
        assert.deepEqual([result.settlement.confirmedCost, result.settlement.unknownUpperBound], [null, 50]);
        assert.equal(result.sourceStatus, 'invalid_evidence');
    });
}
for (const [name, patch] of [
    ['request', { requestId: 'A:req' }], ['name', { name: 'old-scout' }],
    ['remote', { remoteId: 'other' }], ['epoch', { epoch: 7 }],
    ['cost', { cost: 49 }], ['string_cost', { cost: '50' }],
    ['early', { tick: 312 }], ['before_call', { tick: 313 }], ['future', { tick: 316 }], ['fraction', { tick: 314.5 }]
]) {
    test('settle_p1_receipt_reject_' + name, async () => {
        const { reduceReconTrialSettlement } = await loadSettlement();
        const session = await settlementSession({ requestId: 'B:req', name: 'B-scout', callState: 'call_started', callTick: 314 });
        const result = reduceReconTrialSettlement(session, settlementEvidence(session, patch), { tick: 315 });
        assert.deepEqual([result.settlement.confirmedCost, result.settlement.unknownUpperBound], [null, 50]);
        assert.equal(result.sourceStatus, 'invalid_evidence');
    });
}
test('settle_p1_receipt_late_valid_and_bad_input_preserves_proven_cost', async () => {
    const { reduceReconTrialSettlement } = await loadSettlement();
    const session = await settlementSession({ requestId: 'B:req', name: 'B-scout', callState: 'call_started', callTick: 314 });
    const result = reduceReconTrialSettlement(session, settlementEvidence(session, { tick: 700 }), { tick: 701 });
    assert.deepEqual(result.settlement, { confirmedCost: 50, unknownUpperBound: 0, updatedAtTick: 701 });
    session.settlement = result.settlement; session.settlementBinding = result.binding;
    const next = reduceReconTrialSettlement(session, settlementEvidence(session, { name: 'wrong' }), { tick: 702 });
    assert.deepEqual(next.settlement, session.settlement);
    assert.deepEqual(next.binding, session.settlementBinding);
    assert.equal(next.sourceStatus, 'invalid_evidence');
});
test('settle_p1_equal_amount_wrong_binding', async () => {
    const { reduceReconTrialSettlement } = await loadSettlement();
    const session = await settlementSession();
    session.settlement = { confirmedCost: 50, unknownUpperBound: 0, updatedAtTick: 101 };
    session.settlementBinding.identity.trialId = 'A';
    session.settlementBinding.confirmedReceiptTick = 101;
    const result = reduceReconTrialSettlement(session, null, { tick: 313 });
    assert.deepEqual(result.settlement, { confirmedCost: 0, unknownUpperBound: 0, updatedAtTick: 313 });
    assert.equal(result.sourceStatus, 'invalid_evidence');
});

for (const [name, corrupt] of [
    ['missing', s => { delete s.settlementBinding; }],
    ['array', s => { s.settlementBinding = []; }],
    ['schema', s => { s.settlementBinding.schemaVersion = 99; }],
    ['identity', s => { s.settlementBinding.identity.sequence = 1; }],
    ['future_receipt', s => { s.settlementBinding.confirmedReceiptTick = 999; }]
]) {
    test('settle_p4_invalid_proof_' + name, async () => {
        const { reduceReconTrialSettlement, reconTrialSettlementSourceStatus } = await loadSettlement();
        const session = await settlementSession({ requestId: 'B:req', name: 'B-scout', callState: 'call_started', callTick: 314 });
        const confirmed = reduceReconTrialSettlement(session, settlementEvidence(session), { tick: 315 });
        session.settlement = confirmed.settlement; session.settlementBinding = confirmed.binding;
        session.settlementSourceStatus = 'scoped';
        corrupt(session);
        const before = structuredClone(session);
        const result = reduceReconTrialSettlement(session, null, { tick: 316 });
        assert.equal(result.settlement.confirmedCost, null);
        assert.equal(result.settlement.unknownUpperBound, 50);
        assert.equal(result.sourceStatus, 'invalid_evidence');
        assert.equal(reconTrialSettlementSourceStatus(session), 'invalid_evidence');
        assert.deepEqual(session, before);
    });
}
