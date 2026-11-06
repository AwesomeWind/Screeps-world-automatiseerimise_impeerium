const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSuccessorFixture } = require('./helpers/native-economic-successor-fixture.cjs');

test('successor_p1_terminal_parent_routes_v2_without_legacy_fallback', async () => {
    const f = await createSuccessorFixture();
    f.toParentTerminal();
    f.retireSettledRemoteActors();
    const model = await import('../services/NativeEconomicTrialOpsModel.js');
    const raw = structuredClone(Memory.empire.remoteMining.nativeEconomicOps),
        q = f.makeSuccessorRequest();
    const result = model.advanceNativeEconomicOps(
        raw,
        { kind: 'evaluate' },
        { settings: { enabled: true, request: q } },
        f.s.clock(),
        f.s.profile
    );
    assert.equal(result.error, 'successor_parent_facts_missing');
    assert.deepEqual(result.state, raw);
    assert.deepEqual(result.effects, []);
});

test('successor_p1_request_fields_clock_and_wire', async () => {
    const f = await createSuccessorFixture();
    f.toParentTerminal();
    f.retireSettledRemoteActors();
    const m = await import('../services/NativeEconomicTrialOpsSuccessorProtocol.js').catch(() => ({}));
    assert.equal(typeof m.validateNativeSuccessorRequest, 'function');
    const p = { ...f.s.profile, id: 'w49n41-w48n41-first-delivery-v2' },
        q = f.makeSuccessorRequest(),
        clock = f.s.clock();
    assert.equal(m.validateNativeSuccessorRequest(q, p, clock).valid, true);
    assert.ok(JSON.stringify(m.makeNativeSuccessorSubmission(q, p)).length <= 1024);
    for (const mutate of [
        (v) => delete v.parent,
        (v) => (v.extra = true),
        (v) => (v.id = 'a'.repeat(33)),
        (v) => (v.parent.identity.epoch = 0),
        (v) => v.releaseSequence++,
        (v) => v.startSequence++,
        (v) => (v.allowHold = false),
        (v) => (v.parent.settlement.unknownEvents = 1),
        (v) => (v.codeVersion = 'wrong'),
        (v) => (v.acceptNotAfterTick = v.acceptNotBeforeTick + 11),
        (v) => (v.issuedAtMs = clock.nowMs - 30001),
        (v) => (v.notAfterMs = v.stopAtMs + 119999),
        (v) => (v.notAfterMs = v.issuedAtMs + 5400001)
    ]) {
        const changed = structuredClone(q);
        mutate(changed);
        assert.equal(m.validateNativeSuccessorRequest(changed, p, clock).valid, false, JSON.stringify(changed));
    }
    const edge = structuredClone(q);
    edge.id = 'a'.repeat(32);
    assert.equal(m.validateNativeSuccessorRequest(edge, p, clock).valid, true);
    assert.equal(m.validateNativeSuccessorRequest(q, p, { ...clock, tick: q.acceptNotAfterTick + 1 }).valid, false);
});

async function parentScene() {
    const f = await createSuccessorFixture();
    f.toParentTerminal();
    f.retireSettledRemoteActors();
    f.q = f.submitSuccessor();
    f.profile = { ...f.s.profile, id: f.q.profileId };
    return f;
}
test('successor_p2_real_parent_proof_readonly_and_admit_once', async () => {
    const f = await parentScene(),
        m = await import('../services/NativeEconomicTrialOpsFacts.js');
    assert.equal(typeof m.collectNativeSuccessorFacts, 'function');
    const before = JSON.stringify(Memory),
        facts = m.collectNativeSuccessorFacts(f.profile, f.s.clock());
    assert.equal(JSON.stringify(Memory), before);
    assert.deepEqual(facts.parentProof, { valid: true, reason: null });
    const model = await import('../services/NativeEconomicTrialOpsModel.js');
    const old = structuredClone(Memory.empire.remoteMining.nativeEconomicOps);
    const result = model.advanceNativeEconomicOps(old, { kind: 'evaluate' }, facts, f.s.clock(), f.profile);
    assert.equal(result.state.schemaVersion, 2);
    assert.equal(model.validNativeEconomicOpsState(result.state), true);
    assert.equal(result.state.current.request.id, f.q.id);
    assert.equal(result.state.lastAcceptedStartSequence, 5);
    assert.deepEqual(result.state.previous, old.current);
    assert.deepEqual(result.state.history[0].settings.nativeTrialOps, { enabled: true, request: f.q });
    assert.deepEqual(result.effects, []);
    const again = model.advanceNativeEconomicOps(result.state, { kind: 'evaluate' }, facts, f.s.clock(), f.profile);
    assert.equal(again.state.history.length, 1);
});
test('successor_p2_pending_and_unknown_matrix', async () => {
    const f = await parentScene(),
        { collectNativeSuccessorFacts: collect } = await import('../services/NativeEconomicTrialOpsFacts.js');
    assert.equal(typeof collect, 'function');
    const base = structuredClone(Memory),
        remote = () => Memory.empire.remoteMining;
    for (const mutate of [
        () => remote().economicTrials.current.evidence.unknownEvents++,
        () => delete remote().economicTrials.current.evidence.unknownEnergyUpperBound,
        () => (remote().economicTrials.current.evidence.logisticsUnknownEnergyUpperBound = undefined),
        () => (remote().economicTrials.current.evidence.logisticsUnknownEnergyUpperBound = NaN),
        () => (remote().economicTrials.current.managed = false),
        () => (remote().nativeEconomicOps.current.controlClosureConfirmed = false),
        () => (remote().budgets[f.profile.baseRoom].grants.unsettled = { unknownReported: true }),
        () => delete remote().operations[f.profile.remoteId].ledger,
        () => (remote().economicTrials.current.slots.remoteMiner.callState = 'call_started')
    ]) {
        global.Memory = structuredClone(base);
        mutate();
        assert.equal(collect(f.profile, f.s.clock()).parentProof.valid, false);
    }
    global.Memory = base;
});
test('successor_p2_lossless_flat_archive_and_capacity', async () => {
    const f = await parentScene(),
        p = await import('../services/NativeEconomicTrialOpsSuccessorProtocol.js');
    assert.equal(typeof p.encodeNativeSnapshot, 'function');
    const raw = Memory.empire.remoteMining.nativeEconomicOps;
    assert.deepEqual(p.decodeNativeSnapshot(p.encodeNativeSnapshot(raw), []), raw);
    const v2 = { schemaVersion: 2, history: [{ id: 'old' }], extra: { optional: 'kept' } };
    const encoded = p.encodeNativeSnapshot(v2);
    assert.equal(Object.hasOwn(encoded, 'history'), false);
    assert.deepEqual(p.decodeNativeSnapshot(encoded, v2.history), v2);
    assert.throws(() => p.decodeNativeSnapshot(encoded, []));
    assert.throws(() => p.decodeNativeSnapshot({ ...encoded, historyRefs: ['old', 'old'] }, v2.history));
});


test('successor_archive_previous_reference_decodes_the_real_parent_losslessly', async () => {
    const { native } = require('./fixtures/native-successor-03-terminal.json'),
        { encodeNativeSnapshot, decodeNativeSnapshot } = await import('../services/NativeEconomicTrialOpsSuccessorProtocol.js');
    const inline = { ...encodeNativeSnapshot(native), previous: native.previous };
    delete inline.previousRef;
    const compact = { ...inline, previousRef: native.history.at(-1).id };
    delete compact.previous;
    const before = structuredClone(compact), prefix = structuredClone(native.history);
    const restored = decodeNativeSnapshot(compact, native.history);
    assert.deepEqual(restored, native);
    restored.previous.stage = 'changed in caller';
    assert.deepEqual(native.history, prefix);
    assert.deepEqual(compact, before);
    assert.deepEqual(decodeNativeSnapshot({ ...inline, previous: native.previous }, native.history), native);
});

test('successor_archive_previous_reference_rejects_noncanonical_targets', async () => {
    const { native } = require('./fixtures/native-successor-03-terminal.json'),
        { encodeNativeSnapshot, decodeNativeSnapshot } = await import('../services/NativeEconomicTrialOpsSuccessorProtocol.js');
    const inline = { ...encodeNativeSnapshot(native), previous: native.previous };
    delete inline.previousRef;
    const compact = { ...inline, previousRef: native.history.at(-1).id };
    delete compact.previous;
    for (const [snapshot, history] of [
        [{ ...compact, previous: inline.previous }, native.history],
        [{ ...compact, previousRef: 'missing' }, native.history],
        [{ ...compact, previousRef: native.history[0].id }, native.history],
        [{ ...compact, previousRef: native.current.request.id }, native.history],
        [{ ...compact, previousRef: null }, native.history],
        [{ ...compact, current: { ...compact.current, archiveRef: 'wrong' } }, native.history],
        [compact, [...native.history].reverse()],
        [{ ...compact, historyRefs: [compact.previousRef, compact.previousRef] }, [native.history.at(-1), native.history.at(-1)]],
        [compact, [native.history[0], { ...native.history[1], nativeSnapshot: {} }]],
        [compact, [native.history[0], { ...native.history[1], nativeSnapshot: native.history[0].nativeSnapshot }]]
    ]) assert.throws(() => decodeNativeSnapshot(snapshot, history), /Invalid native .*references?/);
});

function until(f, predicate, max = 30) {
    for (let i = 0; i < max && !predicate(); i++) f.advance();
    assert.ok(predicate(), JSON.stringify(Memory.empire.remoteMining.nativeEconomicOps.current));
}
test('successor_p3_two_tick_archive_then_release_and_closed_prepare', async () => {
    const f = await parentScene(),
        old = structuredClone(f.scene.current),
        calls = f.scene.f.spawnCalls.length;
    f.advance();
    assert.equal(Memory.empire.remoteMining.nativeEconomicOps.schemaVersion, 2);
    assert.equal(Memory.empire.remoteMining.nativeEconomicOps.current.stage, 'preflight');
    assert.equal(f.scene.state.lastSequence, 3);
    until(f, () => Memory.empire.remoteMining.nativeEconomicOps.current.stage === 'start_prepared');
    assert.equal(f.scene.state.lastSequence, 4);
    assert.deepEqual(f.scene.current, { ...old, managed: false });
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(Memory.empire.control.policy.remoteMining.economicTrial.enabled, false);
    assert.equal(f.scene.f.spawnCalls.length, calls);
    const n = Memory.empire.remoteMining.nativeEconomicOps.current;
    assert.equal(n.intents.replace_release_request.status, 'applied');
    assert.equal(n.startRequest.expiresAtTick, n.startRequest.activateAtTick + 1000);
});
test('successor_p3_before_write_cas_changed_refuses', async () => {
    const f = await parentScene(),
        service = f.scene.f.services.find((s) => s.name === 'NativeEconomicTrialOps');
    const original = service.applyEffect.bind(service);
    let tested = false;
    service.applyEffect = (effect) => {
        if (effect.type === 'replace_release_request') {
            f.scene.current.evidence.returnedEnergy++;
            tested = true;
        }
        return original(effect);
    };
    until(
        f,
        () =>
            Memory.empire.remoteMining.nativeEconomicOps.current.request.id === f.q.id &&
            Memory.empire.remoteMining.nativeEconomicOps.current.stage === 'terminal'
    );
    assert.equal(tested, true);
    assert.equal(f.scene.state.lastSequence, 3);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
});

test('successor_p4_released_parent_window_does_not_block_other_identity', async () => {
    const f = await createSuccessorFixture();
    f.toParentTerminal();
    f.retireSettledRemoteActors();
    const old = structuredClone(Memory.empire.remoteMining.nativeEconomicOps),
        parent = f.scene.current;
    const p = Memory.empire.control.policy.remoteMining;
    function request(action, sequence) {
        return {
            schemaVersion: 1,
            action,
            id: action + '-other',
            sequence,
            ...(action === 'release' ? { targetTrialId: parent.identity.trialId } : {}),
            remoteId: f.s.profile.remoteId,
            epoch: 1,
            codeVersion: global.EmpireServicesVersion,
            configFingerprint: parent.configFingerprint,
            activateAtTick: Game.time + 1,
            expiresAtTick: Game.time + 1001,
            issuedAtMs: f.s.clock().nowMs,
            expiresAtMs: f.s.clock().nowMs + 5400000
        };
    }
    p.economicTrial = { enabled: true, request: request('release', 4) };
    f.advance();
    assert.equal(f.scene.current.managed, false);
    p.economicTrial = { enabled: true, request: request('start', 5) };
    p.enabled = true;
    Object.assign(Memory.empire.remoteRooms.W1N2, { enabled: true, hold: false });
    const { collectEconomicTrialFacts } = await import('../services/RemoteEconomicTrialFacts.js');
    assert.equal(collectEconomicTrialFacts(null, f.s.clock()).fatalReason, null);
    assert.deepEqual(Memory.empire.remoteMining.nativeEconomicOps, old);
});
test('successor_p4_old_delayed_hold_cannot_stop_child', async () => {
    const f = await parentScene(),
        old = structuredClone(Memory.empire.remoteMining.nativeEconomicOps.current);
    until(f, () => f.scene.current.identity.trialId === f.q.trialId);
    assert.equal(Memory.empire.remoteMining.nativeEconomicOps.current.stage, 'observing');
    const service = f.scene.f.services.find((s) => s.name === 'NativeEconomicTrialOps');
    assert.equal(service.requestOwnedStop('late-old-callback', old), false);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, true);
});

test('successor_p5_history_summary_and_rejection_are_readonly', async () => {
    const f = await parentScene();
    until(f, () => f.scene.current.identity.trialId === f.q.trialId);
    const before = JSON.stringify(Memory),
        summary = global.RemoteTrialOps.status(f.q.id);
    assert.equal(summary.id, f.q.id);
    assert.equal(summary.stage, 'observing');
    assert.equal(summary.archive.oldIdentity.sequence, 3);
    assert.equal(summary.economic.settlement.confirmedSpawnCost, 50);
    assert.equal(JSON.stringify(Memory), before);
});
for (const boundary of ['preflight', 'release_confirming', 'start_prepared', 'observing']) {
    test('successor_p5_reset_preserves_requests_' + boundary, async () => {
        const f = await parentScene();
        until(
            f,
            () =>
                Memory.empire.remoteMining.nativeEconomicOps.current.request.id === f.q.id &&
                Memory.empire.remoteMining.nativeEconomicOps.current.stage === boundary
        );
        const native = structuredClone(Memory.empire.remoteMining.nativeEconomicOps),
            count = f.scene.f.spawnCalls.length;
        f.restoreMemory();
        f.advance();
        assert.deepEqual(Memory.empire.remoteMining.nativeEconomicOps.history, native.history);
        assert.deepEqual(Memory.empire.remoteMining.nativeEconomicOps.current.request, native.current.request);
        if (native.current.startRequest)
            assert.deepEqual(
                Memory.empire.remoteMining.nativeEconomicOps.current.startRequest,
                native.current.startRequest
            );
        assert.ok(f.scene.f.spawnCalls.length <= count + 1);
    });
}
test('successor_p5_unknown_activation_result_closes_before_guard', async () => {
    const f = await parentScene(),
        service = f.scene.f.services.find((s) => s.name === 'NativeEconomicTrialOps');
    until(f, () => Memory.empire.remoteMining.nativeEconomicOps.current.stage === 'start_prepared');
    const count = f.scene.f.spawnCalls.length,
        original = service.persist.bind(service);
    service.persist = (state) => {
        if (state.current.intents.activate_start?.status === 'applied') throw new Error('result record lost');
        original(state);
    };
    f.advance();
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(Memory.empire.control.policy.remoteMining.economicTrial.enabled, false);
    assert.equal(f.scene.f.spawnCalls.length, count);
    service.persist = original;
    for (let i = 0; i < 3; i++) f.advance();
    assert.equal(f.scene.f.spawnCalls.length, count);
    assert.equal(Memory.empire.remoteMining.nativeEconomicOps.current.unknownEffect, true);
});
test('successor_p5_own_deadline_remains_action_gate_and_hold_right', async () => {
    const f = await parentScene();
    until(f, () => f.scene.current.identity.trialId === f.q.trialId);
    f.s.setNowMs(f.q.stopAtMs);
    const { collectEconomicTrialFacts } = await import('../services/RemoteEconomicTrialFacts.js');
    assert.equal(collectEconomicTrialFacts(null, f.s.clock()).fatalReason, 'native_ops_window_expired');
    const service = f.scene.f.services.find((s) => s.name === 'NativeEconomicTrialOps');
    assert.equal(service.requestOwnedStop('deadline'), true);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
});
test('successor_p5_record_failure_still_closes_owned_session', async () => {
    const f = await parentScene();
    until(f, () => f.scene.current.identity.trialId === f.q.trialId);
    const service = f.scene.f.services.find((s) => s.name === 'NativeEconomicTrialOps');
    service.persist = () => {
        throw new Error('record capacity failure');
    };
    service.summarize = () => {
        throw new Error('summary failure');
    };
    f.advance();
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(Memory.empire.remoteRooms.W1N2.hold, true);
});

test('successor_p6_two_generations_real_first_delivery', async () => {
    const f = await createSuccessorFixture();
    f.toParentTerminal();
    f.retireSettledRemoteActors();
    // Advance the actual budget window; never clear old buckets to obtain new money.
    for (let i = 0; i < 1051; i++) f.advance();
    const old = structuredClone(f.scene.current),
        q = f.submitSuccessor();
    until(f, () => f.scene.current.identity.trialId === q.trialId);
    assert.equal(f.scene.current.safeStreak, 0);
    assert.equal(f.scene.current.visionAcquired, false);
    until(f, () => Memory.empire.remoteMining.nativeEconomicOps.current.stage === 'terminal', 950);
    assert.equal(f.scene.current.outcome.stopReason, 'first_delivery');
    assert.ok(f.scene.current.evidence.returnedEnergy > 0);
    const calls = f.scene.f.spawnCalls.filter((c) => c.memory.economicTrialId === q.trialId);
    assert.deepEqual(calls.map((c) => c.memory.role).sort(), ['remoteHauler', 'remoteMiner', 'scout']);
    assert.equal(
        f.scene.current.evidence.confirmedSpawnCost,
        calls.reduce((sum, c) => sum + c.cost, 0)
    );
    assert.deepEqual(f.scene.state.previous, { ...old, managed: false });
    assert.equal(Memory.empire.remoteMining.nativeEconomicOps.current.controlClosureConfirmed, true);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(global.RemoteTrialOps.status(q.id).economic.tailStatus, 'unverified');
    f.retireSettledRemoteActors();
    for (let i = 0; i < 1051; i++) f.advance();
    const next = f.submitSuccessor(f.makeSuccessorRequest({ id: 'native-third', trialId: 'economic-third' }));
    until(f, () => f.scene.current.identity.trialId === next.trialId);
    assert.equal(Memory.empire.remoteMining.nativeEconomicOps.history.length, 2);
    assert.equal(f.scene.current.identity.sequence, 7);
    const compactHistory = structuredClone(Memory.empire.remoteMining.nativeEconomicOps.history);
    const previousSummary = global.RemoteTrialOps.status(q.id);
    assert.equal(compactHistory.at(-1).nativeSnapshot.previousRef, compactHistory[0].id);
    assert.equal(previousSummary.controlClosureConfirmed, true);
    delete global.RemoteTrialOps;
    f.restoreMemory();
    f.advance();
    const restoredSummary = global.RemoteTrialOps.status(q.id);
    assert.deepEqual(Memory.empire.remoteMining.nativeEconomicOps.history, compactHistory);
    assert.deepEqual(restoredSummary.economic.settlement, previousSummary.economic.settlement);
    assert.equal(restoredSummary.economic.closureVerifiedAtTick, previousSummary.economic.closureVerifiedAtTick);
    assert.equal(restoredSummary.controlClosureConfirmed, true);
    let capacityRefused = false;
    for (let cycle = 0; cycle < 3; cycle++) {
        until(f, () => Memory.empire.remoteMining.nativeEconomicOps.current.stage === 'terminal', 950);
        f.retireSettledRemoteActors();
        for (let i = 0; i < 1051; i++) f.advance();
        const before = structuredClone(Memory.empire.remoteMining.nativeEconomicOps);
        const request = f.submitSuccessor(
            f.makeSuccessorRequest({ id: 'capacity-' + cycle, trialId: 'capacity-econ-' + cycle })
        );
        until(
            f,
            () =>
                Memory.empire.remoteMining.nativeEconomicOps.current.request.id === request.id ||
                Memory.empire.remoteMining.nativeEconomicOps.lastRejection?.id === request.id
        );
        const now = Memory.empire.remoteMining.nativeEconomicOps;
        if (now.lastRejection?.id === request.id) {
            assert.equal(now.lastRejection.reason, 'history_capacity');
            assert.deepEqual(now.history, before.history);
            assert.deepEqual(now.current, before.current);
            capacityRefused = true;
            break;
        }
        assert.ok(now.history.length <= 4);
    }
    assert.equal(capacityRefused, true);
});

test('successor_p6_rejected_trial_identity_cannot_be_reused_under_new_native_id', async () => {
    const f = await parentScene(),
        factsModule = await import('../services/NativeEconomicTrialOpsFacts.js');
    const model = await import('../services/NativeEconomicTrialOpsModel.js');
    f.q.parent.settlement.spawnEnergy++;
    const raw = Memory.empire.remoteMining.nativeEconomicOps;
    const rejected = model.advanceNativeEconomicOps(
        raw,
        { kind: 'evaluate' },
        factsModule.collectNativeSuccessorFacts(f.profile, f.s.clock()),
        f.s.clock(),
        f.profile
    );
    assert.ok(rejected.error);
    Memory.empire.remoteMining.nativeEconomicOps = rejected.state;
    const q = f.makeSuccessorRequest({ id: 'different-native', trialId: f.q.trialId });
    f.submitSuccessor(q);
    const result = model.advanceNativeEconomicOps(
        rejected.state,
        { kind: 'evaluate' },
        factsModule.collectNativeSuccessorFacts(f.profile, f.s.clock()),
        f.s.clock(),
        f.profile
    );
    assert.equal(result.error, 'request_replayed');
    assert.equal(result.state.schemaVersion, 1);
});
test('successor_p2_oversize_archive_preserves_parent_and_refuses_admission', async () => {
    const f = await parentScene(),
        m = await import('../services/NativeEconomicTrialOpsModel.js');
    const { collectNativeSuccessorFacts } = await import('../services/NativeEconomicTrialOpsFacts.js');
    const raw = Memory.empire.remoteMining.nativeEconomicOps;
    raw.retainedOptionalProof = 'x'.repeat(60000);
    const result = m.advanceNativeEconomicOps(
        raw,
        { kind: 'evaluate' },
        collectNativeSuccessorFacts(f.profile, f.s.clock()),
        f.s.clock(),
        f.profile
    );
    assert.equal(result.error, 'history_capacity');
    assert.equal(result.state.schemaVersion, 1);
    assert.equal(result.state.retainedOptionalProof, raw.retainedOptionalProof);
    assert.deepEqual(result.state.current, raw.current);
});

test('successor_p5_parent_start_window_must_match_economic_record', async () => {
    const f = await parentScene(),
        { collectNativeSuccessorFacts: collect } = await import('../services/NativeEconomicTrialOpsFacts.js');
    const req = Memory.empire.remoteMining.nativeEconomicOps.current.startRequest;
    req.activateAtTick++;
    req.expiresAtTick++;
    assert.equal(collect(f.profile, f.s.clock()).parentProof.valid, false);
});
test('successor_p5_observing_identity_and_intent_clock_are_validated', async () => {
    const f = await parentScene();
    until(f, () => f.scene.current.identity.trialId === f.q.trialId);
    const { validNativeEconomicOpsState: valid } = await import('../services/NativeEconomicTrialOpsModel.js');
    const raw = structuredClone(Memory.empire.remoteMining.nativeEconomicOps);
    const future = structuredClone(raw);
    future.current.intents.activate_start.tick = future.current.lastTick + 1;
    assert.equal(valid(future), false);
    const wrong = structuredClone(raw);
    wrong.current.admittedIdentity.sequence++;
    assert.equal(valid(wrong), false);
});
for (const [name, mutate] of [
    ['disabled', () => (Memory.empire.control.policy.remoteMining.nativeTrialOps.enabled = false)],
    ['policy_missing', () => delete Memory.empire.control.policy.remoteMining.nativeTrialOps.request],
    ['policy_changed', () => (Memory.empire.control.policy.remoteMining.nativeTrialOps.request.trialId = 'unrelated')],
    ['record_missing', () => delete Memory.empire.remoteMining.nativeEconomicOps],
    ['record_schema', () => (Memory.empire.remoteMining.nativeEconomicOps.schemaVersion = 99)]
])
    test('successor_p4_own_control_denies_' + name, async () => {
        const f = await parentScene();
        until(f, () => f.scene.current.identity.trialId === f.q.trialId);
        mutate();
        const { collectEconomicTrialFacts } = await import('../services/RemoteEconomicTrialFacts.js');
        assert.ok(collectEconomicTrialFacts(null, f.s.clock()).fatalReason?.startsWith('native_ops_'));
    });
test('successor_p4_same_tick_action_cutoff', async () => {
    const f = await parentScene();
    until(f, () => f.scene.current.identity.trialId === f.q.trialId);
    for (let i = 0; i < 4; i++) f.advance();
    f.advance({
        beforeActionParser() {
            f.s.setNowMs(f.q.stopAtMs);
        }
    });
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(f.scene.calls.filter((c) => c.tick === Game.time && c.method === 'moveByPath').length, 0);
});
test('successor_p6_fresh_safe99_single_spawn_home_replacement_waits', async () => {
    const f = await createSuccessorFixture();
    delete Game.spawns.Spawn2;
    f.toParentTerminal();
    f.retireSettledRemoteActors();
    for (let i = 0; i < 1051; i++) f.advance();
    const q = f.submitSuccessor();
    until(f, () => f.scene.current.identity.trialId === q.trialId);
    until(f, () => f.scene.current.safeStreak === 99, 400);
    Game.creeps.CoreHaulerB.ticksToLive = 1;
    Game.creeps.CoreHaulerC.ticksToLive = 1;
    const expires = f.scene.current.expiresAtTick;
    f.advance();
    const began = Game.time;
    assert.ok(Game.spawns.Spawn1.spawning.name.startsWith('hauler_'));
    for (let i = 0; i < 35 && Game.spawns.Spawn1.spawning?.name.startsWith('hauler_'); i++) {
        assert.equal(f.scene.current.slots.remoteMiner.requestId, undefined);
        assert.equal(f.scene.current.outcome, undefined);
        f.advance();
    }
    assert.ok(Game.time - began >= 30);
    assert.equal(f.scene.current.slots.remoteMiner.calls, 1);
    assert.equal(f.scene.current.slots.remoteMiner.deadline, f.scene.current.slots.remoteMiner.admissionTick + 5);
    assert.equal(f.scene.current.expiresAtTick, expires);
});

test('successor_p2_historical_production_v1_archive_is_compatible', async () => {
    const frozen = require('./fixtures/native-economic-ops-terminal-v1.json');
    const model = await import('../services/NativeEconomicTrialOpsModel.js');
    const p = await import('../services/NativeEconomicTrialOpsSuccessorProtocol.js');
    assert.equal(model.validNativeEconomicOpsState(frozen.native), true);
    const c = frozen.economic.current,
        n = frozen.native.current;
    const clock = {
        tick: c.closureVerifiedAtTick + 100,
        nowMs: n.request.notAfterMs + 100000,
        codeVersion: 'fixture-new-code'
    };
    const q = {
        schemaVersion: 2,
        id: 'fixture-next',
        profileId: p.NATIVE_SUCCESSOR_PROFILE.id,
        codeVersion: clock.codeVersion,
        parent: {
            nativeId: n.request.id,
            identity: structuredClone(c.identity),
            closureVerifiedAtTick: c.closureVerifiedAtTick,
            settlement: {
                spawnEnergy: 50,
                infrastructureEnergy: 0,
                returnedEnergy: 0,
                unknownEvents: 0,
                unknownUpperBound: 0
            }
        },
        trialId: 'fixture-econ-next',
        releaseSequence: 4,
        startSequence: 5,
        issuedAtMs: clock.nowMs,
        stopAtMs: clock.nowMs + 5280000,
        notAfterMs: clock.nowMs + 5400000,
        acceptNotBeforeTick: clock.tick,
        acceptNotAfterTick: clock.tick + 10,
        allowParentArchive: true,
        allowEconomicRelease: true,
        allowStart: true,
        allowHold: true
    };
    assert.equal(p.validateNativeSuccessorRequest(q, p.NATIVE_SUCCESSOR_PROFILE, clock).valid, true);
    assert.equal(p.nativeParentEvidenceMatches(q, frozen.native, frozen.economic), true);
    const settings = { enabled: true, request: q };
    const facts = {
        settings,
        nativeState: frozen.native,
        economicState: frozen.economic,
        parentProof: { valid: true, reason: null },
        archiveInputs: { economicTrial: { enabled: true, request: n.startRequest }, nativeTrialOps: settings }
    };
    const result = model.advanceNativeEconomicOps(
        frozen.native,
        { kind: 'evaluate' },
        facts,
        clock,
        p.NATIVE_SUCCESSOR_PROFILE
    );
    assert.equal(model.validNativeEconomicOpsState(result.state), true);
    assert.deepEqual(p.decodeNativeSnapshot(result.state.history[0].nativeSnapshot, []), frozen.native);
    assert.deepEqual(result.state.history[0].economicState, frozen.economic);
});
test('successor_p2_rejection_capacity_is_not_reset_for_new_identity', async () => {
    const f = await parentScene(),
        m = await import('../services/NativeEconomicTrialOpsModel.js');
    const { collectNativeSuccessorFacts } = await import('../services/NativeEconomicTrialOpsFacts.js');
    for (let i = 0; i < 16; i++) {
        const q = f.makeSuccessorRequest({ id: 'bad-' + i, trialId: 'bad-trial-' + i });
        q.parent.settlement.spawnEnergy++;
        f.submitSuccessor(q);
        const result = m.advanceNativeEconomicOps(
            Memory.empire.remoteMining.nativeEconomicOps,
            { kind: 'evaluate' },
            collectNativeSuccessorFacts(f.profile, f.s.clock()),
            f.s.clock(),
            f.profile
        );
        assert.ok(result.error);
        Memory.empire.remoteMining.nativeEconomicOps = result.state;
    }
    f.submitSuccessor(f.makeSuccessorRequest({ id: 'would-be-new', trialId: 'would-be-new-trial' }));
    const result = m.advanceNativeEconomicOps(
        Memory.empire.remoteMining.nativeEconomicOps,
        { kind: 'evaluate' },
        collectNativeSuccessorFacts(f.profile, f.s.clock()),
        f.s.clock(),
        f.profile
    );
    assert.equal(result.error, 'rejection_capacity');
    assert.equal(result.state.rejections.length, 16);
    assert.equal(result.state.lastAcceptedStartSequence, 3);
});

test('successor_p2_parent_cannot_claim_future_closure_or_wall_clock', async () => {
    const f = await parentScene(),
        { collectNativeSuccessorFacts: collect } = await import('../services/NativeEconomicTrialOpsFacts.js');
    const n = Memory.empire.remoteMining.nativeEconomicOps.current;
    n.lastNowMs = f.s.clock().nowMs + 1;
    assert.equal(collect(f.profile, f.s.clock()).parentProof.valid, false);
});
test('successor_p2_legacy_optional_history_is_preserved_not_interpreted_as_v2', async () => {
    const f = await parentScene(),
        m = await import('../services/NativeEconomicTrialOpsModel.js');
    const { collectNativeSuccessorFacts } = await import('../services/NativeEconomicTrialOpsFacts.js');
    const raw = Memory.empire.remoteMining.nativeEconomicOps;
    raw.history = { legacyOptional: 'preserve' };
    const result = m.advanceNativeEconomicOps(
        raw,
        { kind: 'evaluate' },
        collectNativeSuccessorFacts(f.profile, f.s.clock()),
        f.s.clock(),
        f.profile
    );
    assert.equal(result.state.schemaVersion, 2);
    assert.deepEqual(result.state.history[0].nativeSnapshot.history, raw.history);
});

test('successor_review_binding_without_call_state_cannot_admit_parent', async () => {
    const f = await parentScene();
    const { validEconomicTrialState } = await import('../services/RemoteEconomicTrialModel.js');
    const { collectNativeSuccessorFacts } = await import('../services/NativeEconomicTrialOpsFacts.js');
    const model = await import('../services/NativeEconomicTrialOpsModel.js');
    const c = f.scene.current;
    c.slots.remoteMiner = {
        calls: 0,
        requestId: 'old-binding',
        deadline: Math.min(c.startedAtTick + 5, c.expiresAtTick - 1),
        admissionStage: 'binding',
        admissionTick: c.startedAtTick,
        admissionSpawnName: 'Spawn1'
    };
    assert.equal(validEconomicTrialState(f.scene.state), true);
    const before = JSON.stringify(Memory);
    const facts = collectNativeSuccessorFacts(f.profile, f.s.clock());
    assert.equal(facts.quiet, false);
    assert.equal(facts.parentProof.valid, false);
    const result = model.advanceNativeEconomicOps(
        Memory.empire.remoteMining.nativeEconomicOps,
        { kind: 'evaluate' },
        facts,
        f.s.clock(),
        f.profile
    );
    assert.equal(result.state.schemaVersion, 1);
    assert.equal(result.state.lastAcceptedStartSequence, 3);
    assert.deepEqual(result.effects, []);
    assert.equal(JSON.stringify(Memory), before);
});

for (const field of ['window', 'identity'])
    test('successor_review_canonical_start_tamper_denied_before_spawn_' + field, async () => {
        const f = await parentScene();
        until(f, () => Memory.empire.remoteMining.nativeEconomicOps.current.stage === 'start_prepared');
        const service = f.scene.f.services.find((s) => s.name === 'NativeEconomicTrialOps');
        const original = service.applyEffect.bind(service);
        const count = f.scene.f.spawnCalls.length;
        service.applyEffect = (effect) => {
            const result = original(effect);
            if (result && effect.type === 'activate_start') {
                const q = Memory.empire.control.policy.remoteMining.economicTrial.request;
                if (field === 'window') {
                    q.issuedAtMs -= 1000;
                    q.expiresAtMs -= 1000;
                } else {
                    q.id = 'unexpected-economic';
                }
            }
            return result;
        };
        f.advance();
        assert.equal(f.scene.f.spawnCalls.length, count);
        assert.equal(f.scene.state.lastSequence, 4);
        assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
        assert.equal(Memory.empire.remoteRooms.W1N2.hold, true);
        assert.equal(Memory.empire.remoteMining.nativeEconomicOps.current.closedBeforeAdmission, true);
    });

for (const [name, mutate] of [
    [
        'goal',
        () => {
            Memory.empire.control.policy.goalPlanning.enabled = true;
        }
    ],
    [
        'market',
        () => {
            Memory.empire.market.enabled = true;
        }
    ],
    [
        'shadow',
        () => {
            Memory.empire.control.policy.roomGovernor.shadow = false;
        }
    ],
    [
        'enforce',
        () => {
            Memory.empire.control.policy.scheduler.enforce = true;
        }
    ],
    [
        'home_recovery',
        () => {
            global.RoomPhase.W1N1.recovery.mode = 'spawn_energy';
        }
    ],
    [
        'home_core',
        () => {
            global.RoomPhase.W1N1.recovery.coreUsable.miner = 0;
        }
    ],
    [
        'receiver',
        () => {
            Game.rooms.W1N1.terminal.store.energy = 299999;
        }
    ],
    [
        'epoch',
        () => {
            Memory.empire.remoteMining.operations['W1N1:W1N2'].epoch++;
        }
    ]
])
    test('successor_p6_parent_protected_gate_' + name, async () => {
        const f = await parentScene();
        const { collectNativeSuccessorFacts } = await import('../services/NativeEconomicTrialOpsFacts.js');
        const model = await import('../services/NativeEconomicTrialOpsModel.js');
        mutate();
        const result = model.advanceNativeEconomicOps(
            Memory.empire.remoteMining.nativeEconomicOps,
            { kind: 'evaluate' },
            collectNativeSuccessorFacts(f.profile, f.s.clock()),
            f.s.clock(),
            f.profile
        );
        assert.ok(result.error);
        assert.equal(result.state.schemaVersion, 1);
        assert.equal(result.state.lastAcceptedStartSequence, 3);
        assert.deepEqual(result.effects, []);
    });

test('successor_p6_default_closed_preserves_existing_native_record', async () => {
    const f = await createSuccessorFixture();
    f.toParentTerminal();
    f.retireSettledRemoteActors();
    const before = JSON.stringify(Memory.empire.remoteMining.nativeEconomicOps);
    for (let i = 0; i < 5; i++) f.advance();
    assert.equal(JSON.stringify(Memory.empire.remoteMining.nativeEconomicOps), before);
    assert.equal(Memory.empire.control.policy.remoteMining.nativeTrialOps.enabled, false);
});

test('successor_review_owned_stop_does_not_depend_on_history_read', async () => {
    const f = await parentScene();
    until(f, () => f.scene.current.identity.trialId === f.q.trialId);
    const service = f.scene.f.services.find((s) => s.name === 'NativeEconomicTrialOps');
    Memory.empire.remoteMining.nativeEconomicOps.history = null;
    assert.equal(service.requestOwnedStop('history-record-damaged'), true);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(Memory.empire.remoteRooms.W1N2.hold, true);
    assert.equal(Memory.empire.remoteMining.nativeEconomicOps.history, null);
});

test('successor_archive_real_03_switches_to_04_within_the_original_capacity', async () => {
    const { createTerminal03Replay } = require('./helpers/native-successor-03-replay.cjs');
    const r = await createTerminal03Replay();
    const before = structuredClone(r.old);
    const admitted = r.advance();
    assert.equal(admitted.error, undefined);
    assert.deepEqual(admitted.effects, []);
    assert.equal(admitted.state.current.stage, 'preflight');
    assert.deepEqual(admitted.state.history.slice(0, -1), before.native.history);
    const archive = admitted.state.history.at(-1);
    assert.equal(archive.nativeSnapshot.previousRef, before.native.history.at(-1).id);
    assert.equal(Object.hasOwn(archive.nativeSnapshot, 'previous'), false);
    assert.deepEqual(r.protocol.decodeNativeSnapshot(archive.nativeSnapshot, before.native.history), before.native);
    assert.deepEqual(archive.economicState, before.economic);
    assert.deepEqual(archive.settings.economicTrial, before.economicSettings);
    assert.equal(JSON.stringify({ ...admitted.state, current: null }).length, 47345);
    const persisted = JSON.parse(JSON.stringify(admitted));
    const child = r.switchToChild(persisted);
    assert.deepEqual(child.effects, ['replace_release_request', 'prepare_start', 'activate_start']);
    assert.deepEqual(r.facts.economicState.previous, { ...before.economic.current, managed: false });
    assert.equal(r.facts.economicState.current.evidence.confirmedSpawnCost, 0);
    assert.equal(r.model.validNativeSuccessorState(JSON.parse(JSON.stringify(child.state))), true);
    assert.deepEqual(r.old, before);
});

test('successor_archive_preserves_inline_previous_when_the_values_differ', async () => {
    const { native } = require('./fixtures/native-successor-03-terminal.json'),
        { encodeNativeSnapshot, decodeNativeSnapshot } = await import('../services/NativeEconomicTrialOpsSuccessorProtocol.js');
    const raw = structuredClone(native);
    raw.previous.observations.extra = 'distinct evidence';
    const encoded = encodeNativeSnapshot(raw);
    assert.equal(Object.hasOwn(encoded, 'previousRef'), false);
    assert.deepEqual(decodeNativeSnapshot(encoded, raw.history), raw);
});

test('successor_archive_still_rejects_over_capacity_without_evicting_the_parent', async () => {
    const { createTerminal03Replay } = require('./helpers/native-successor-03-replay.cjs');
    const r = await createTerminal03Replay();
    r.facts.archiveInputs.extra = 'x'.repeat(2500);
    const result = r.advance();
    assert.equal(result.error, 'history_capacity');
    assert.deepEqual(result.effects, []);
    assert.deepEqual(result.state.history, r.old.native.history);
    assert.deepEqual(result.state.current, r.old.native.current);
});


test('successor_archive_real_03_summary_keeps_fees_and_closure_after_json_reload', async () => {
    const { createTerminal03Replay } = require('./helpers/native-successor-03-replay.cjs');
    const r = await createTerminal03Replay();
    const { summarizeNativeEconomicOps } = await import('../services/NativeEconomicTrialOpsEvidence.js');
    const { state } = r.switchToChild(r.advance());
    const restored = JSON.parse(JSON.stringify(state));
    const summary = summarizeNativeEconomicOps(restored, r.facts.economicState, r.clock);
    const parent = summary.history.at(-1);
    assert.equal(parent.id, r.old.native.current.request.id);
    assert.equal(parent.controlClosureConfirmed, true);
    assert.equal(parent.economic.closeAppliedAtTick, 84084310);
    assert.equal(parent.economic.closureVerifiedAtTick, 84084311);
    assert.equal(parent.economic.settlement.confirmedSpawnCost, 50);
    assert.equal(parent.economic.settlement.returnedEnergy, 0);
    assert.equal(summary.current.archive.oldCosts.confirmedSpawnCost, 50);
    assert.deepEqual(summary.current.archive.originalWindow, restored.history.at(-1).originalWindow);
    assert.equal(summary.current.economic.settlement.confirmedSpawnCost, 0);
    delete restored.history.at(-1).nativeSnapshot.previousRef;
    assert.equal(summarizeNativeEconomicOps(restored, r.facts.economicState, r.clock).status, 'state_invalid');
});

test('successor_clock_04_retains_distinct_tick_and_wall_evidence', async () => {
    const { createRelease04Replay } = require('./helpers/native-release-04-replay.cjs');
    const r = await createRelease04Replay();
    const tick = r.written.lastTick, now = r.written.lastNowMs;
    for (const [step, elapsed, tickDiscontinuous, wallClockBackwards] of [
        [3, r.stopped.lastNowMs - now, true, false],
        [1, -1, false, true],
        [3, -1, true, true]
    ]) {
        const result = r.evaluate(tick + step, now + elapsed);
        const restored = JSON.parse(JSON.stringify(result.state));
        const { clockDiscontinuity, ...outcome } = restored.current.outcome;
        assert.equal(outcome.reason, 'clock_discontinuity');
        assert.deepEqual(clockDiscontinuity, {
            previousTick: tick, previousNowMs: now, tick: tick + step, nowMs: now + elapsed,
            phase: 'release_confirming', releaseActivateAtTick: tick + 1, tickDiscontinuous, wallClockBackwards
        });
        assert.deepEqual(result.effects, []);
        assert.deepEqual(restored.history, r.state.history);
        assert.deepEqual(restored.current.releaseRequest, r.written.releaseRequest);
        assert.deepEqual(r.evaluate(tick + step + 1, now + elapsed + 1, restored).state, restored);
    }
    const normal = r.evaluate(tick + 1, now + 1);
    assert.equal(normal.state.current.outcome, null);
    const missed = r.evaluate(tick + 3, r.stopped.lastNowMs);
    const { clockDiscontinuity, ...originalOutcome } = missed.state.current.outcome;
    assert.deepEqual({ ...missed.state.current, outcome: originalOutcome }, r.stopped);
});

test('successor_clock_evaluate_shares_its_phase_clock_with_facts', async () => {
    const { createRelease04Replay } = require('./helpers/native-release-04-replay.cjs');
    const r = await createRelease04Replay();
    const { default: Service } = await import('../services/NativeEconomicTrialOpsService.js');
    global.Memory = { empire: { remoteMining: { nativeEconomicOps: r.state },
        control: { policy: { remoteMining: { nativeTrialOps: r.facts.settings } } } } };
    const service = new Service('NativeEconomicTrialOps');
    let calls = 0, factClock;
    service.clock = () => r.clock(r.written.lastTick + 1, r.written.lastNowMs + ++calls);
    service.collectFacts = sampled => { factClock = sampled; return r.facts; };
    service.analyze();
    assert.equal(calls, 1);
    assert.equal(Memory.empire.remoteMining.nativeEconomicOps.current.lastNowMs, factClock.nowMs);
});


test('successor_release_04_cannot_unlock_parent_when_native_misses_or_stops_on_activation', async () => {
    const { createRelease04Replay } = require('./helpers/native-release-04-replay.cjs');
    const r = await createRelease04Replay();
    const ownership = await import('../services/NativeEconomicTrialOpsOwnership.js');
    const { advanceEconomicTrial } = await import('../services/RemoteEconomicTrialModel.js');
    const activate = r.written.releaseRequest.activateAtTick, before = r.written.lastNowMs;
    const armed = r.evaluate(activate, before + 1).state;
    const stopped = r.evaluate(activate, before - 1).state;
    const parent = r.parent.economic.current;
    const tagged = { ...r.written.releaseRequest, nativeSuccessorId: r.written.request.id };
    const armTagged = structuredClone(armed);
    armTagged.current.releaseRequest = tagged;
    const checks = [
        { name: 'native_stopped', state: stopped, settings: { ...r.facts.settings, enabled: false }, request: r.written.releaseRequest },
        { name: 'native_missed_evaluate', state: r.state, request: r.written.releaseRequest },
        { name: 'economic_wall_rollback', state: armed, now: before, request: r.written.releaseRequest },
        { name: 'stop_boundary', state: armed, now: r.written.request.stopAtMs, request: r.written.releaseRequest },
        { name: 'missing_owner', state: undefined, settings: {}, request: tagged },
        { name: 'wrong_marker', state: armTagged, request: { ...tagged, nativeSuccessorId: 'foreign' } },
        { name: 'wrong_parent', state: armTagged, request: { ...tagged, targetTrialId: 'foreign' } },
        { name: 'planned_or_unknown', state: armTagged, intent: 'planned', request: tagged },
        { name: 'unknown', state: armTagged, intent: 'unknown', request: tagged },
        { name: 'too_early', state: armTagged, tick: activate - 1, request: tagged },
        { name: 'too_late', state: armTagged, tick: activate + 1, request: tagged },
        { name: 'old_actors', state: armTagged, request: tagged, oldActors: true },
        { name: 'unsettled', state: armTagged, request: tagged, unsettled: true },
        { name: 'legacy_native_exact', state: armed, request: r.written.releaseRequest, allowed: true },
        { name: 'tagged_native_exact', state: armTagged, request: tagged, allowed: true },
        { name: 'independent_v1_exact', state: undefined, settings: {}, request: { ...r.written.releaseRequest, id: 'manual-release' }, allowed: true }
    ];
    for (const c of checks) {
        const native = structuredClone(c.state);
        if (c.intent) native.current.intents.replace_release_request.status = c.intent;
        const clock = r.clock(c.tick ?? activate, c.now ?? before + 2);
        const nativeRelease = ownership.resolveNativeSuccessorRelease?.({
            nativeState: native, nativeSettings: c.settings ?? r.facts.settings, economicState: r.parent.economic,
            request: c.request, clock
        });
        const result = advanceEconomicTrial(r.parent.economic, { kind: 'evaluate' }, {
            guardEnabled: true, request: c.request, nativeRelease, closed: true, oldActors: c.oldActors ?? false,
            unsettled: c.unsettled ?? false, remoteId: parent.identity.remoteId, epoch: parent.identity.epoch,
            configFingerprint: parent.configFingerprint
        }, clock);
        assert.equal(result.state.lastSequence, c.allowed ? 8 : 7, c.name);
        assert.deepEqual(result.state.current, { ...parent, managed: !c.allowed }, c.name);
        assert.deepEqual(result.effects, [], c.name);
        if (c.name === 'tagged_native_exact' || c.name === 'legacy_native_exact') {
            assert.equal(result.state.nativeReleaseReceipt.status, 'applied');
            assert.equal(result.state.nativeReleaseReceipt.reason, null);
            const duplicate = advanceEconomicTrial(result.state, { kind: 'evaluate' }, {
                guardEnabled: true, request: c.request, nativeRelease: { ...nativeRelease, allowed: false,
                    reason: 'native_release_parent_changed' }
            }, clock);
            assert.deepEqual(duplicate.state.nativeReleaseReceipt, result.state.nativeReleaseReceipt);
        }
        if (c.name === 'too_early' || c.name === 'too_late') assert.equal(result.state.nativeReleaseReceipt, undefined);
    }
});

test('successor_release_writer_marks_only_native_v2_release_and_uses_the_fixed_tick', async () => {
    const { createTerminal03Replay } = require('./helpers/native-successor-03-replay.cjs');
    const r = await createTerminal03Replay();
    const ready = r.advance();
    const result = r.switchToChild(ready);
    assert.equal(result.state.current.releaseRequest.nativeSuccessorId, r.request.id);
    assert.equal(Object.hasOwn(result.state.current.startRequest, 'nativeSuccessorId'), false);
    assert.equal(result.state.current.releaseRequest.activateAtTick, r.request.acceptNotBeforeTick + 2);
});


test('successor_release_receipt_survives_repeated_rejection_reload_and_status', async () => {
    const { createRelease04Replay } = require('./helpers/native-release-04-replay.cjs');
    const r = await createRelease04Replay();
    const { resolveNativeSuccessorRelease } = await import('../services/NativeEconomicTrialOpsOwnership.js');
    const { advanceEconomicTrial } = await import('../services/RemoteEconomicTrialModel.js');
    const { summarizeNativeEconomicOps } = await import('../services/NativeEconomicTrialOpsEvidence.js');
    const activate = r.written.releaseRequest.activateAtTick, before = r.written.lastNowMs;
    const stopped = r.evaluate(activate, before - 1).state;
    const parent = r.parent.economic.current;
    const request = r.written.releaseRequest;
    const at = r.clock(activate, before + 1);
    const nativeRelease = resolveNativeSuccessorRelease({ nativeState: stopped,
        nativeSettings: { ...r.facts.settings, enabled: false }, economicState: r.parent.economic, request, clock: at });
    const facts = { guardEnabled: true, request, nativeRelease, closed: true,
        remoteId: parent.identity.remoteId, epoch: parent.identity.epoch, configFingerprint: parent.configFingerprint };
    const first = advanceEconomicTrial(r.parent.economic, { kind: 'evaluate' }, facts, at);
    const expected = { nativeId: r.written.request.id, requestId: request.id, sequence: 8, tick: activate,
        nativeEvaluatedAt: activate, status: 'refused', reason: 'native_release_not_owned' };
    assert.deepEqual(first.state.nativeReleaseReceipt, expected);
    const saved = JSON.parse(JSON.stringify(first.state));
    for (const tick of [activate, activate + 1, activate + 2]) {
        const later = advanceEconomicTrial(saved, { kind: 'evaluate' }, facts, r.clock(tick, at.nowMs + 1));
        assert.deepEqual(later.state.nativeReleaseReceipt, expected);
        assert.equal(later.state.lastSequence, 7);
        assert.deepEqual(later.state.current, parent);
    }
    const tampered = { ...request, nativeSuccessorId: 'foreign' };
    const tamperedGate = resolveNativeSuccessorRelease({ nativeState: stopped,
        nativeSettings: r.facts.settings, economicState: saved, request: tampered, clock: at });
    const rejected = advanceEconomicTrial(saved, { kind: 'evaluate' },
        { ...facts, request: tampered, nativeRelease: tamperedGate }, at);
    assert.deepEqual(rejected.state.nativeReleaseReceipt, expected);
    const summary = summarizeNativeEconomicOps(JSON.parse(JSON.stringify(stopped)), saved, at);
    assert.deepEqual(summary.current.releaseReceipt, expected);
    assert.equal(summary.current.outcome.clockDiscontinuity.wallClockBackwards, true);
    assert.equal(summary.current.economic, null);
    assert.equal(summary.current.archive.oldCosts.confirmedSpawnCost, 50);
    const { default: Service } = await import('../services/NativeEconomicTrialOpsService.js');
    global.Memory = JSON.parse(JSON.stringify({ empire: { remoteMining: { nativeEconomicOps: stopped, economicTrials: saved } } }));
    delete global.RemoteTrialOps;
    const service = new Service('NativeEconomicTrialOps');
    service.clock = () => at;
    service.init();
    const restarted = global.RemoteTrialOps.status(r.written.request.id);
    assert.deepEqual(restarted.releaseReceipt, expected);
    assert.deepEqual(restarted.outcome, summary.current.outcome);
});

test('successor_release_clock_diagnostic_persist_failure_still_withdraws_owned_session', async () => {
    const f = await parentScene();
    until(f, () => f.scene.current.identity.trialId === f.q.trialId);
    const service = f.scene.f.services.find(s => s.name === 'NativeEconomicTrialOps');
    let failed = false;
    const persist = service.persist.bind(service);
    service.persist = state => {
        if (state.current.outcome?.clockDiscontinuity) { failed = true; throw Error('diagnostic persistence failure'); }
        return persist(state);
    };
    f.advance({ nowMs: f.s.clock().nowMs - 1 });
    assert.equal(failed, true);
    assert.equal(Memory.empire.control.policy.remoteMining.enabled, false);
    assert.equal(Memory.empire.remoteRooms.W1N2.hold, true);
});
