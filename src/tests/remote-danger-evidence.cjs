const { test } = require('node:test');
const assert = require('node:assert/strict');

const loadModel = () => import('../services/RemoteDangerEvidenceModel.js');
const clock = (tick = 110) => ({ tick, nowMs: 1000000 + tick, codeVersion: 'trial-v1' });
const identity = (sequence = 1) => ({ trialId: 'trial-' + sequence, sequence,
    remoteId: 'W1N1:W1N2', epoch: 1, codeVersion: 'trial-v1' });
const stopped = (sequence = 1, tick = 110, reason = 'danger') => ({ identity: identity(sequence),
    baseRoom: 'W1N1', targetRoom: 'W1N2', outcome: { decidedAtTick: tick, stopReason: reason } });
const facts = (extra = {}) => ({ id: 'enemy-A', name: 'visitor', ownerUsername: 'someone',
    pos: { x: 49, y: 38, roomName: 'W1N2' },
    bodyFacts: { length: 3, parts: [{ type: 'move', hits: 100 }, { type: 'attack', hits: 0 },
        { type: 'heal', hits: 100, boost: 'LO' }], readComplete: true }, fieldErrors: [], ...extra });
function context(model, sequence = 1, tick = 110, reason = 'danger') {
    return model.dangerContextForStop(undefined, stopped(sequence, tick, reason), clock(tick));
}
function payload(model, extra = {}) {
    return { captureStatus: 'captured', captureReason: null, capturedAtTick: 110,
        capturedAtMs: 1000001 + (extra.capturedAtTick ?? 110), visibilityAtCapture: 'visible', hostileCount: 1,
        actors: [model.normalizeDangerActor(facts()).actor], ...extra };
}

test('danger_record_has_full_stop_identity', async () => {
    const m = await loadModel();
    const ctx = context(m);
    const first = m.beginDangerEvidence(undefined, ctx);
    assert.equal(first.claimed, true);
    assert.deepEqual(JSON.parse(first.key), ['trial-1', 1, 'W1N1:W1N2', 1, 'trial-v1', 110, 'danger']);
    assert.equal(first.next.records[0].captureStatus, 'pending');
    assert.equal(first.next.records[0].observedRoom, 'W1N2');
    assert.equal(context(m, 1, 110, 'home_danger').observedRoom, 'W1N1');
    assert.equal(m.dangerContextForStop(stopped(), stopped(), clock()), null);
    assert.equal(m.dangerContextForStop(undefined, stopped(1, 109), clock()), null);
    assert.equal(context(m, 1, 110, 'scope_stale'), null);
});

test('danger_actor_fields_are_observed_not_inferred', async () => {
    const m = await loadModel();
    const { actor, partial } = m.normalizeDangerActor(facts({ ownerUsername: undefined,
        controller: { sign: { username: 'Invader' } } }));
    assert.equal(actor.ownerUsername, null);
    assert.equal(partial, true);
    assert.equal(actor.id, 'enemy-A');
    assert.equal(actor.controller, undefined);
    assert.equal(m.normalizeDangerActor(facts({ name: 'x'.repeat(101) })).actor.name.length, 100);
    assert.equal(m.normalizeDangerActor(facts({ pos: { x: 50, y: 2, roomName: 'W1N2' } })).actor.pos, null);
});

test('danger_active_parts_exclude_destroyed_parts', async () => {
    const m = await loadModel();
    const actor = m.normalizeDangerActor(facts()).actor;
    assert.deepEqual(actor.activeParts, { move: 1, work: 0, carry: 0, attack: 0,
        ranged_attack: 0, heal: 1, tough: 0, claim: 0 });
    assert.equal(actor.hasBoosts, true);
    assert.equal(actor.body, undefined);
    for (const bodyFacts of [null, { length: 51, parts: [], readComplete: false },
        { length: 1, parts: [{ type: '__proto__', hits: 100 }], readComplete: true },
        { length: 1, parts: [{ type: 'move' }], readComplete: true }]) {
        const value = m.normalizeDangerActor(facts({ bodyFacts })).actor;
        assert.equal(value.activeParts, null);
        assert.notEqual(value.bodyStatus, 'known');
    }
});

test('danger_capture_is_json_data_only', async () => {
    const m = await loadModel();
    const begun = m.beginDangerEvidence(undefined, context(m));
    const result = m.finishDangerEvidence(begun.next, begun.key, payload(m), clock());
    assert.equal(result.applied, true);
    assert.deepEqual(JSON.parse(JSON.stringify(result.next)), result.next);
    const record = result.next.records[0];
    assert.equal(record.captureStatus, 'captured');
    assert.equal(record.detection, 'non_owned_creep');
    assert.equal(record.capturedAtTick, 110);
    const original = structuredClone(result.next);
    const repeated = m.finishDangerEvidence(result.next, begun.key, payload(m, { hostileCount: 9 }), clock());
    assert.equal(repeated.applied, false);
    assert.deepEqual(repeated.next, original);
});

test('danger_records_respect_all_limits', async () => {
    const m = await loadModel();
    const begun = m.beginDangerEvidence(undefined, context(m));
    const actors = Array.from({ length: 11 }, (_, index) => m.normalizeDangerActor(facts({
        id: String(index), name: '\u0001'.repeat(100), ownerUsername: '\u0002'.repeat(100)
    })).actor);
    const result = m.finishDangerEvidence(begun.next, begun.key, payload(m, { hostileCount: 11, actors }), clock());
    const record = result.next.records[0];
    assert.ok(record.actors.length <= 10);
    assert.equal(record.hostileCount, 11);
    assert.equal(record.actorsOmitted, 11 - record.actors.length);
    assert.equal(record.truncated, true);
    assert.equal(record.captureStatus, 'partial');
    assert.ok(JSON.stringify(record).length <= 12000);
    assert.ok(JSON.stringify(result.next).length <= 25000);
    const empty = m.finishDangerEvidence(begun.next, begun.key, payload(m, { hostileCount: 0, actors: [] }), clock());
    assert.equal(empty.next.records[0].captureReason, 'count_conflict');
});

test('danger_ledger_keeps_latest_two_incidents', async () => {
    const m = await loadModel();
    let store;
    for (let sequence = 1; sequence <= 3; sequence++) {
        const tick = 109 + sequence;
        const begun = m.beginDangerEvidence(store, context(m, sequence, tick));
        store = m.finishDangerEvidence(begun.next, begun.key, payload(m, { capturedAtTick: tick }), clock(tick)).next;
    }
    assert.deepEqual(store.records.map(record => record.identity.sequence), [3, 2]);
    const snapshot = structuredClone(store);
    m.dangerEvidenceSummary(store, null, 120, 100);
    assert.deepEqual(store, snapshot);
});

test('danger_record_unknown_schema_is_non_destructive', async () => {
    const m = await loadModel();
    for (const store of [{ schemaVersion: 99, records: [] }, { schemaVersion: 1, records: 'bad' },
        { schemaVersion: 1, records: [null] }, { schemaVersion: 1, records: [{ key: 'fake', captureStatus: 'captured' }] }]) {
        const snapshot = structuredClone(store);
        const result = m.beginDangerEvidence(store, context(m));
        assert.equal(result.claimed, false);
        assert.deepEqual(store, snapshot);
        assert.equal(result.next, store);
        assert.ok(['schema_unknown', 'store_invalid'].includes(result.reason));
    }
});

test('danger_pending_summary_does_not_backfill_or_write', async () => {
    const m = await loadModel();
    const ctx = context(m);
    const begun = m.beginDangerEvidence(undefined, ctx);
    const restored = JSON.parse(JSON.stringify(begun.next));
    const snapshot = structuredClone(restored);
    const summary = m.dangerEvidenceSummary(restored, ctx, 111, 100);
    assert.equal(summary.rawCaptureStatus, 'pending');
    assert.equal(summary.effectiveStatus, 'interrupted');
    assert.equal(summary.historical, true);
    assert.deepEqual(restored, snapshot);
    assert.equal(m.beginDangerEvidence(restored, ctx).claimed, false);
    assert.equal(m.finishDangerEvidence(restored, begun.key, payload(m, { capturedAtTick: 111 }), clock(111)).applied, false);
});

test('danger_summary_requires_exact_stop_reference', async () => {
    const m = await loadModel();
    const ctx = context(m);
    const begun = m.beginDangerEvidence(undefined, ctx);
    const store = m.finishDangerEvidence(begun.next, begun.key, payload(m), clock()).next;
    const summary = m.dangerEvidenceSummary(store, ctx, 211, 100);
    assert.equal(summary.stale, true);
    assert.equal(summary.ageTicks, 101);
    assert.equal(summary.actors, undefined);
    assert.ok(JSON.stringify(summary).length <= 1500);
    for (const reference of [null, { ...ctx, decidedAtTick: 111 }, { ...ctx, stopReason: 'home_danger' },
        { ...ctx, identity: { ...ctx.identity, codeVersion: 'other' } }]) {
        assert.equal(m.dangerEvidenceSummary(store, reference, 211, 100).effectiveStatus, 'not_recorded');
    }
});

module.exports = { clock, identity, stopped, facts, context, payload };

const loadAdapter = () => import('../services/RemoteDangerEvidence.js');
function captureScene() {
    let store;
    const calls = { reads: 0, writes: 0 };
    const enemy = { id: 'enemy-A', name: 'visitor', owner: { username: 'someone' },
        pos: { x: 49, y: 38, roomName: 'W1N2' }, body: facts().bodyFacts.parts };
    const deps = {
        readStore: () => store,
        writeStore(next) { calls.writes++; store = next; },
        readRoom: name => ({ name }),
        readActors() { calls.reads++; return [enemy]; },
        readCpu: () => ({ used: 0, tickLimit: 20 }), readPolicy: () => undefined, readClock: () => clock()
    };
    return { calls, enemy, deps, transition: { before: undefined, after: stopped(), clock: clock() },
        get store() { return store; }, set store(value) { store = value; } };
}

test('danger_policy_invalid_does_not_break_ensure', async () => {
    const { ensureEmpireControl } = await import('../config/EmpirePolicy.js');
    const { resolveDangerEvidencePolicy } = await loadModel();
    for (const raw of [null, [], 'bad', { reserveCpu: -1 }, { maxCaptureCpu: NaN }, { maxCaptureCpu: Infinity }]) {
        global.Memory = { empire: { control: { policy: { remoteMining: { dangerEvidence: raw } } } } };
        assert.doesNotThrow(() => ensureEmpireControl());
        assert.equal(Memory.empire.control.policy.remoteMining.dangerEvidence, raw);
        assert.equal(resolveDangerEvidencePolicy(raw).valid, false);
    }
    assert.deepEqual(resolveDangerEvidencePolicy(undefined).policy, { reserveCpu: 5, maxCaptureCpu: 2 });
    assert.deepEqual(resolveDangerEvidencePolicy({ reserveCpu: 0 }).policy, { reserveCpu: 0, maxCaptureCpu: 2 });
    assert.equal(resolveDangerEvidencePolicy({ maxCaptureCpu: 0 }).valid, true);
});

test('danger_adapter_captures_once_with_two_writes', async () => {
    const { recordStoppedTrialDanger } = await loadAdapter();
    const s = captureScene();
    const result = recordStoppedTrialDanger(s.transition, s.deps);
    assert.equal(result.persisted, true);
    assert.equal(s.store.records[0].actors[0].ownerUsername, 'someone');
    assert.equal(s.store.records[0].captureStatus, 'captured');
    assert.deepEqual(s.calls, { reads: 1, writes: 2 });
    recordStoppedTrialDanger(s.transition, s.deps);
    assert.deepEqual(s.calls, { reads: 1, writes: 2 });
});

for (const field of ['owner', 'body', 'pos']) {
    test(`danger_getter_throw_is_partial_${field}`, async () => {
        const { recordStoppedTrialDanger } = await loadAdapter();
        const s = captureScene();
        Object.defineProperty(s.enemy, field, { get() { throw new Error('private diagnostic text'); } });
        assert.doesNotThrow(() => recordStoppedTrialDanger(s.transition, s.deps));
        const record = s.store.records[0];
        assert.equal(record.captureStatus, 'partial');
        assert.equal(record.actors[0].id, 'enemy-A');
        assert.ok(!JSON.stringify(record).includes('private diagnostic text'));
    });
}

test('danger_actor_reader_throw_is_failed', async () => {
    const { recordStoppedTrialDanger } = await loadAdapter();
    const s = captureScene();
    s.deps.readActors = () => { s.calls.reads++; throw new Error('reader broke'); };
    recordStoppedTrialDanger(s.transition, s.deps);
    assert.equal(s.store.records[0].captureStatus, 'failed');
    assert.equal(s.store.records[0].captureReason, 'read_failed');
    assert.deepEqual(s.calls, { reads: 1, writes: 2 });
});

test('danger_not_visible_is_not_zero_hostiles', async () => {
    const { recordStoppedTrialDanger } = await loadAdapter();
    const s = captureScene();
    s.deps.readRoom = () => undefined;
    recordStoppedTrialDanger(s.transition, s.deps);
    assert.equal(s.store.records[0].captureStatus, 'unavailable');
    assert.equal(s.store.records[0].visibilityAtCapture, 'not_visible');
    assert.equal(s.store.records[0].hostileCount, null);
    assert.equal(s.calls.reads, 0);
});

test('danger_time_mismatch_does_not_read_later_actors', async () => {
    const { recordStoppedTrialDanger } = await loadAdapter();
    const s = captureScene();
    s.deps.readClock = () => clock(111);
    recordStoppedTrialDanger(s.transition, s.deps);
    assert.equal(s.store.records[0].captureStatus, 'unavailable');
    assert.equal(s.store.records[0].captureReason, 'time_mismatch');
    assert.equal(s.store.records[0].capturedAtTick, null);
    assert.equal(s.calls.reads, 0);
});

test('danger_empty_second_read_keeps_original_detection', async () => {
    const { recordStoppedTrialDanger } = await loadAdapter();
    const s = captureScene(); s.deps.readActors = () => [];
    recordStoppedTrialDanger(s.transition, s.deps);
    assert.equal(s.store.records[0].captureReason, 'count_conflict');
    assert.equal(s.store.records[0].detection, 'non_owned_creep');
    assert.equal(s.transition.after.outcome.stopReason, 'danger');
});

test('danger_store_unwritable_skips_actor_reads', async () => {
    const { recordStoppedTrialDanger } = await loadAdapter();
    const s = captureScene();
    s.deps.writeStore = () => { s.calls.writes++; throw new Error('storage down'); };
    const result = recordStoppedTrialDanger(s.transition, s.deps);
    assert.equal(result.persisted, false);
    assert.deepEqual(s.calls, { reads: 0, writes: 1 });
});

for (const phase of ['pending_after_write', 'final_after_write', 'final_before_write', 'both_final_writes']) {
    test(`danger_writer_ack_is_ambiguous_${phase}`, async () => {
        const { recordStoppedTrialDanger } = await loadAdapter();
        const s = captureScene();
        s.deps.writeStore = next => {
            s.calls.writes++;
            if (phase === 'pending_after_write' && s.calls.writes === 1 || phase === 'final_after_write' && s.calls.writes === 2) {
                s.store = next; throw new Error('stored but no ack');
            }
            if (phase === 'final_before_write' && s.calls.writes === 2 || phase === 'both_final_writes' && s.calls.writes >= 2) {
                throw new Error('not stored');
            }
            s.store = next;
        };
        assert.doesNotThrow(() => recordStoppedTrialDanger(s.transition, s.deps));
        assert.ok(s.calls.writes <= 3);
        const expected = phase === 'final_after_write' ? 'captured' : phase === 'final_before_write' ? 'failed' : 'pending';
        assert.equal(s.store.records[0].captureStatus, expected);
        const before = structuredClone(s.store);
        const counts = { ...s.calls };
        recordStoppedTrialDanger(s.transition, s.deps);
        assert.deepEqual(s.store, before);
        assert.deepEqual(s.calls, counts);
    });
}

test('danger_cpu_policy_limits_optional_work', async () => {
    const { recordStoppedTrialDanger } = await loadAdapter();
    const low = captureScene(); low.deps.readCpu = () => ({ used: 16, tickLimit: 20 });
    recordStoppedTrialDanger(low.transition, low.deps);
    assert.equal(low.store.records[0].captureStatus, 'skipped_cpu');
    assert.equal(low.calls.reads, 0);
    const limited = captureScene();
    let cpuReads = 0;
    limited.deps.readCpu = () => ({ used: cpuReads++ < 2 ? 0 : 2, tickLimit: 20 });
    limited.deps.readActors = () => [limited.enemy, { ...limited.enemy, id: 'enemy-B' }];
    recordStoppedTrialDanger(limited.transition, limited.deps);
    assert.equal(limited.store.records[0].captureStatus, 'partial');
    assert.equal(limited.store.records[0].captureReason, 'cpu_budget');
    assert.equal(limited.store.records[0].actors.length, 1);
});

for (const issue of ['cpu_missing', 'cpu_throw', 'policy_invalid']) {
    test(`danger_bad_cpu_or_policy_does_not_enable_anything_${issue}`, async () => {
        const { recordStoppedTrialDanger } = await loadAdapter();
        const s = captureScene();
        if (issue === 'cpu_missing') s.deps.readCpu = () => undefined;
        if (issue === 'cpu_throw') s.deps.readCpu = () => { throw new Error('cpu unavailable'); };
        if (issue === 'policy_invalid') s.deps.readPolicy = () => null;
        const before = structuredClone(s.transition);
        recordStoppedTrialDanger(s.transition, s.deps);
        assert.equal(s.calls.reads, 0);
        assert.deepEqual(s.transition, before);
        assert.ok(['skipped_cpu', 'failed'].includes(s.store.records[0].captureStatus));
    });
}

test('danger_historical_read_never_refreshes_observation', async () => {
    const { recordStoppedTrialDanger, readTrialDangerEvidence } = await loadAdapter();
    const s = captureScene(); recordStoppedTrialDanger(s.transition, s.deps);
    const original = structuredClone(s.store);
    const a = readTrialDangerEvidence({ state: { current: stopped(), previous: null }, clock: clock(111) },
        { ...s.deps, intelTtl: 100 });
    const b = readTrialDangerEvidence({ state: { current: stopped(), previous: null }, clock: clock(211) },
        { ...s.deps, intelTtl: 100 });
    assert.equal(a.current.ageTicks, 1);
    assert.equal(b.current.ageTicks, 101);
    assert.equal(b.current.stale, true);
    assert.equal(b.current.historical, true);
    assert.equal(b.current.actors, undefined);
    assert.equal(b.current.capturedAtTick, 110);
    assert.deepEqual(s.store, original);
    assert.deepEqual(s.calls, { reads: 1, writes: 2 });
    assert.equal(readTrialDangerEvidence({ state: undefined, clock: clock() }, s.deps), null);
});

test('danger_reader_joins_previous_by_full_reference_not_runtime_version', async () => {
    const m = await loadModel();
    const { readTrialDangerEvidence } = await loadAdapter();
    const s = captureScene();
    for (let seq = 1; seq <= 2; seq++) {
        const tick = 109 + seq;
        const begin = m.beginDangerEvidence(s.store, context(m, seq, tick));
        s.store = m.finishDangerEvidence(begin.next, begin.key, payload(m, { capturedAtTick: tick }), clock(tick)).next;
    }
    const state = { current: stopped(2, 111), previous: stopped(1) };
    const result = readTrialDangerEvidence({ state, clock: { ...clock(112), codeVersion: 'new-runtime' } },
        { ...s.deps, intelTtl: 100 });
    assert.ok(result.current.key.includes('trial-2'));
    assert.ok(result.previous.key.includes('trial-1'));
    assert.ok(result.previous.key.includes('trial-v1'));
    state.current.outcome.decidedAtTick++;
    assert.equal(readTrialDangerEvidence({ state, clock: clock(113) }, s.deps).current.effectiveStatus, 'not_recorded');
});

test('danger_summary_oversize_never_truncates_identity_key', async () => {
    const m = await loadModel();
    const after = stopped();
    after.baseRoom = '\u0002'.repeat(50); after.targetRoom = '\u0003'.repeat(49);
    after.identity = { ...after.identity, trialId: '\u0001'.repeat(64), codeVersion: '\u0004'.repeat(100),
        remoteId: after.baseRoom + ':' + after.targetRoom };
    const ctx = m.dangerContextForStop(undefined, after, { ...clock(), codeVersion: after.identity.codeVersion });
    const begun = m.beginDangerEvidence(undefined, ctx);
    assert.equal(begun.claimed, true);
    const actor = m.normalizeDangerActor(facts({ pos: { x: 1, y: 1, roomName: after.targetRoom } })).actor;
    const done = m.finishDangerEvidence(begun.next, begun.key, payload(m, { actors: [actor] }), clock());
    assert.equal(done.applied, true);
    const summary = m.dangerEvidenceSummary(done.next, ctx, 111, 100);
    assert.equal(summary.effectiveStatus, 'summary_oversize');
    assert.equal(summary.key, undefined);
    assert.ok(JSON.stringify(summary).length <= 1500);
});

test('danger_corrupt_captured_state_is_not_usable_or_rotated', async () => {
    const m = await loadModel();
    const ctx = context(m);
    const pending = m.beginDangerEvidence(undefined, ctx);
    const valid = m.finishDangerEvidence(pending.next, pending.key, payload(m), clock()).next;
    const relabeled = structuredClone(pending.next);
    relabeled.records[0].captureStatus = 'captured';
    const variants = [relabeled];
    for (const patch of [{ capturedAtTick: null }, { capturedAtMs: null }, { capturedAtMs: ctx.decisionAtMs - 1 },
        { visibilityAtCapture: null }, { visibilityAtCapture: 'not_visible' }, { hostileCount: null },
        { hostileCount: 2 }, { actors: [] }, { actorsOmitted: 2 }, { truncated: true }]) {
        const damaged = structuredClone(valid); Object.assign(damaged.records[0], patch); variants.push(damaged);
    }
    for (const patch of [{ ownerUsername: null }, { bodyStatus: 'partial', activeParts: null }, { bodyLength: null },
        { missingFields: ['name'] }, { textTruncated: true }]) {
        const damaged = structuredClone(valid); Object.assign(damaged.records[0].actors[0], patch); variants.push(damaged);
    }
    const inflated = structuredClone(valid);
    inflated.records[0].actors[0].activeParts.attack = 50;
    variants.push(inflated);
    for (const store of variants) {
        const before = structuredClone(store);
        assert.equal(m.dangerEvidenceSummary(store, ctx, 111, 100).effectiveStatus, 'store_invalid');
        const next = m.beginDangerEvidence(store, context(m, 2, 111));
        assert.equal(next.claimed, false);
        assert.equal(next.reason, 'store_invalid');
        assert.deepEqual(store, before);
    }
});

test('danger_size_crop_includes_final_omitted_count', async () => {
    const m = await loadModel();
    const actor = plain => m.normalizeDangerActor(facts({ id: '\u0001'.repeat(70), name: '\u0002'.repeat(70),
        ownerUsername: 'x'.repeat(plain), pos: { x: 1, y: 1, roomName: 'W1N2' },
        bodyFacts: { length: 1, parts: [{ type: 'move', hits: 100 }], readComplete: true } })).actor;
    const begun = m.beginDangerEvidence(undefined, context(m));
    const result = m.finishDangerEvidence(begun.next, begun.key, payload(m, {
        hostileCount: 100000, actors: [...Array(9).fill(actor(30)), actor(59)]
    }), clock());
    assert.equal(result.applied, true);
    const record = result.next.records[0];
    assert.equal(record.captureStatus, 'partial');
    assert.equal(record.captureReason, 'size_limit');
    assert.ok(record.actors.length > 0 && record.actors.length < 10);
    assert.equal(record.actorsOmitted, 100000 - record.actors.length);
    assert.ok(JSON.stringify(record).length <= 12000);
});
