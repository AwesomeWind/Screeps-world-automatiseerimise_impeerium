const test = require('node:test');
const assert = require('node:assert/strict');
const modulePath = '../services/TrialEvidenceWindowModel.js';
const load = () => import(modulePath).catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('TrialEvidenceWindowModel.js')) return {};
    throw error;
});
const clock = {tick: 100, nowMs: 1000000, codeVersion: 'econ-v1'};
const request = (extra = {}) => ({schemaVersion: 1, id: 'window-one', nativeId: 'native-one',
    identity: {trialId: 'econ-one', sequence: 3, remoteId: 'W49N41:W48N41', epoch: 1, codeVersion: 'econ-v1'},
    profileId: 'w49n41-w48n41-first-delivery-evidence-v1', issuedAtMs: clock.nowMs,
    expiresAtMs: clock.nowMs + 5400000, acceptNotBeforeTick: 100, acceptNotAfterTick: 110, ...extra});

test('request_freshness_and_admission_bounds', async () => {
    const m = await load();
    assert.equal(typeof m.validateEvidenceRequest, 'function', 'new observation request contract is required');
    const valid = (q, c = clock) => m.validateEvidenceRequest(q, m.EVIDENCE_PROFILE, c).valid;
    assert.equal(valid(request()), true);
    assert.equal(valid(request(), {...clock, nowMs: clock.nowMs + 30000}), true);
    assert.equal(valid(request(), {...clock, nowMs: clock.nowMs + 30001}), false);
    for (const q of [request({issuedAtMs: clock.nowMs + 1}), request({expiresAtMs: clock.nowMs + 5400001}),
        request({id: 'x'.repeat(33)}), request({id: 'unsafe:id'}), request({acceptNotAfterTick: 111}),
        request({acceptNotAfterTick: 99}), request({identity: {...request().identity, sequence: 0}})]) assert.equal(valid(q), false);
    assert.equal(valid(request({id: 'x'.repeat(32)})), true);
    assert.equal(valid(request(), {...clock, tick: 111}), false);
    assert.equal(valid(request(), {...clock, nowMs: NaN}), false);
});

test('default_off_does_not_create_window', async () => {
    const {DEFAULT_EMPIRE_POLICY} = await import('../config/EmpirePolicy.js');
    assert.deepEqual(DEFAULT_EMPIRE_POLICY.remoteMining.evidenceWindow, {enabled: false, request: null});
    assert.equal(DEFAULT_EMPIRE_POLICY.remoteMining.enabled, false);
    assert.equal(DEFAULT_EMPIRE_POLICY.goalPlanning.enabled, false);
    assert.equal(DEFAULT_EMPIRE_POLICY.scheduler.enforce, false);
});

module.exports = {clock, request};

test('identity_tuple_and_parent_wait_isolation', async () => {
    const m = await load();
    assert.equal(typeof m.advanceEvidenceWindow, 'function');
    const {admittedEvidenceInputs} = require('./helpers/trial-evidence-window-fixture.cjs');
    const x = await admittedEvidenceInputs();
    const arm = m.advanceEvidenceWindow(undefined, {type: 'arm', request: x.request}, x.clock, x.profile).store;
    assert.equal(arm.current.capture.phase, 'armed');
    for (const key of ['trialId', 'sequence', 'remoteId', 'epoch', 'codeVersion']) {
        const admission = structuredClone(x.admission);
        admission.nativeState.current.admittedIdentity[key] = key === 'sequence' || key === 'epoch' ? 999 : 'other';
        assert.equal(m.advanceEvidenceWindow(arm, {type: 'bind', admission}, x.admittedClock, x.profile).changed, false, key);
    }
    const bound = m.advanceEvidenceWindow(arm, {type: 'bind', admission: x.admission}, x.admittedClock, x.profile).store;
    assert.equal(bound.current.capture.phase, 'recording');
    assert.equal(bound.current.header.receiverId, x.admission.economicState.current.receiverId);
    assert.equal(bound.current.bounds.startedAtTick, x.admission.economicState.current.startedAtTick);
    assert.equal(arm.current.header.receiverId, null);
});

test('armed_and_tail_boundaries', async () => {
    const m = await load();
    assert.equal(typeof m.advanceEvidenceWindow, 'function');
    const arm = m.advanceEvidenceWindow(undefined, {type: 'arm', request: request()}, clock).store;
    const waiting = m.advanceEvidenceWindow(arm, {type: 'bind', admission: {}}, {...clock, tick: 120});
    assert.equal(waiting.store.current.capture.phase, 'armed');
    const expired = m.advanceEvidenceWindow(arm, {type: 'bind', admission: {}}, {...clock, tick: 121});
    assert.equal(expired.store.current.capture.phase, 'sealed');
    assert.equal(expired.store.current.seal.reason, 'not_started');
    assert.equal(expired.store.current.capture.latestProof, null);
});

test('sealed_successor_preserves_both_windows', async () => {
    const m = await load();
    assert.equal(typeof m.advanceEvidenceWindow, 'function');
    let s = m.advanceEvidenceWindow(undefined, {type: 'arm', request: request()}, clock).store;
    s = m.advanceEvidenceWindow(s, {type: 'seal', reason: 'not_started'}, clock).store;
    const old = structuredClone(s.current);
    assert.equal(m.advanceEvidenceWindow(s, {type: 'arm', request: request({id: 'two'})}, clock).changed, false);
    s = m.advanceEvidenceWindow(s, {type: 'arm', request: request({id: 'two', successorOf: 'window-one'})}, clock).store;
    assert.deepEqual(s.previous, old);
    s = m.advanceEvidenceWindow(s, {type: 'seal', reason: 'not_started'}, clock).store;
    assert.equal(m.advanceEvidenceWindow(s, {type: 'arm', request: request({id: 'three', successorOf: 'two'})}, clock).changed, false);
    assert.equal(m.validEvidenceStore({...s, schemaVersion: 2}), false);
});

test('request_rejects_unlisted_fields_and_snapshot_scope_cannot_drift', async () => {
    const m = await load();
    assert.equal(m.validateEvidenceRequest(request({arbitraryMemory: {secret: 'must-not-copy'}}), m.EVIDENCE_PROFILE, clock).valid, false);
    const armed = m.advanceEvidenceWindow(undefined, {type: 'arm', request: request()}, clock).store;
    for (const mutate of [w => {w.header.identity.sequence = 0;}, w => {w.bounds.expiresAtMs = NaN;},
        w => {w.capture.phase = 'sealed'; w.seal = null;}, w => {w.capture.lastTick = 5;},
        w => {w.header.request.identity.codeVersion = 'other';}]) {
        const s = structuredClone(armed); mutate(s.current);
        assert.equal(m.validEvidenceStore(s), false);
    }
});

async function recording() {
    const m = await load();
    const x = await require('./helpers/trial-evidence-window-fixture.cjs').admittedEvidenceInputs();
    let store = m.advanceEvidenceWindow(undefined, {type: 'arm', request: x.request}, x.clock, x.profile).store;
    store = m.advanceEvidenceWindow(store, {type: 'bind', admission: x.admission}, x.admittedClock, x.profile).store;
    return {m, x, store, start: store.current.bounds.startedAtTick};
}
function packet(store, tick, nowMs) {
    return {windowId: store.current.header.id, observedTick: tick, eventTick: tick - 1, observedAtMs: nowMs,
        codeVersion: store.current.header.identity.codeVersion, row: [tick, nowMs, 0, 0, null, null, null, null, 0, 0, 0],
        snapshot: null, milestones: [], proof: null, coverage: {complete: true}};
}
test('immutable_tick_packets_dedupe_and_conflicts_never_overwrite', async () => {
    const {m, x, store, start} = await recording();
    const clock = {...x.admittedClock, tick: start}, p = packet(store, start, clock.nowMs);
    const first = m.advanceEvidenceWindow(store, {type: 'capture', packet: p}, clock, x.profile);
    assert.equal(first.store.current.tickRows.length, 1);
    assert.equal(m.advanceEvidenceWindow(first.store, {type: 'capture', packet: p}, clock, x.profile).changed, false);
    const conflict = structuredClone(p); conflict.row[5] = 99;
    const r = m.advanceEvidenceWindow(first.store, {type: 'capture', packet: conflict}, clock, x.profile);
    assert.equal(r.store.current.tickRows.length, 1);
    assert.equal(r.store.current.tickRows[0][5], null);
    assert.equal(r.store.current.capture.partial, true);
});

test('row_1303_and_row_1304_are_distinct_bounds', async () => {
    const {m, store, start} = await recording();
    const w = store.current;
    w.tickRows = Array.from({length: 1303}, (_, i) => packet(store, start + i, 1000000 + i).row);
    w.capture.firstTick = start; w.capture.lastTick = start + 1302;
    assert.equal(m.validEvidenceStore(store), true);
    w.tickRows.push(packet(store, start + 1303, 1001303).row);
    w.capture.lastTick++;
    assert.equal(m.validEvidenceStore(store), false);
});

for (const [kind, limit] of [['snapshots', 80], ['milestones', 64]]) test(kind + '_exact_limit_and_plus_one', async () => {
    const {m, store} = await recording();
    store.current[kind] = Array.from({length: limit}, (_, i) => ({observedTick: i, type: 'capacity_fixture'}));
    assert.equal(m.validEvidenceStore(store), true);
    store.current[kind].push({observedTick: limit, type: 'capacity_fixture'});
    assert.equal(m.validEvidenceStore(store), false);
});

test('capacity_counts_actual_utf16_and_two_windows_without_eviction', async () => {
    const {m, store} = await recording();
    const w = store.current;
    w.capture.padding = '';
    w.capture.padding = '界'.repeat(131072 - JSON.stringify(w).length);
    assert.equal(JSON.stringify(w).length, 131072);
    assert.ok(Buffer.byteLength(JSON.stringify(w), 'utf8') > 131072);
    assert.equal(m.validEvidenceStore(store), true);
    w.capture.padding += 'x';
    assert.equal(m.validEvidenceStore(store), false);
    w.capture.padding = '';
    w.capture.phase = 'sealed'; w.seal = {reason: 'partial', atTick: w.bounds.startedAtTick, atMs: 1000000};
    w.capture.padding = 'x'.repeat(131072 - JSON.stringify(w).length);
    store.previous = structuredClone(w);
    assert.equal(m.validEvidenceStore(store), true);
    const before = JSON.stringify(store);
    const refused = m.advanceEvidenceWindow(store, {type: 'arm', request: request({id: 'third', successorOf: w.header.id})}, clock);
    assert.equal(refused.changed, false);
    assert.equal(JSON.stringify(store), before);
    store.wrapperPadding = '';
    store.wrapperPadding = 'x'.repeat(270336 - JSON.stringify(store).length);
    assert.equal(m.validEvidenceStore(store), true);
    store.wrapperPadding += 'x';
    assert.equal(m.validEvidenceStore(store), false);
});

for (const [index, invalid] of [[2, 128], [3, 1], [4, -1], [5, '10'], [6, NaN], [7, 0.5], [8, 131072], [9, 1], [10, 256]]) {
    test('invalid_row_column_' + index, async () => {
        const {m, x, store, start} = await recording();
        const p = packet(store, start, x.admittedClock.nowMs); p.row[index] = invalid;
        const r = m.advanceEvidenceWindow(store, {type: 'capture', packet: p}, {...x.admittedClock, tick: start}, x.profile);
        assert.equal(r.changed, false);
        assert.equal(store.current.tickRows.length, 0);
    });
}

test('tail_last_confirmation_tick_does_not_extend_execution_deadline', async () => {
    const {m, x, store, start} = await recording();
    const p = packet(store, start, x.admittedClock.nowMs);
    p.proof = {outcome: {verdict: 'aborted', decidedAtTick: start}, closeAppliedAtTick: start, tailExpiresAtTick: start + 300};
    let s = m.advanceEvidenceWindow(store, {type: 'capture', packet: p}, {...x.admittedClock, tick: start}, x.profile).store;
    assert.equal(s.current.bounds.maxObservedTick, start + 302);
    for (const delta of [300, 301, 302]) {
        const c = {...x.admittedClock, tick: start + delta};
        s = m.advanceEvidenceWindow(s, {type: 'capture', packet: packet(s, c.tick, c.nowMs)}, c, x.profile).store;
        assert.equal(s.current.tickRows.at(-1)[0], c.tick);
    }
    const c = {...x.admittedClock, tick: start + 303};
    s = m.advanceEvidenceWindow(s, {type: 'capture', packet: packet(s, c.tick, c.nowMs)}, c, x.profile).store;
    assert.equal(s.current.tickRows.at(-1)[0], start + 302);
    assert.equal(s.current.capture.phase, 'sealed');
    assert.equal(store.current.header.originalWindow.expiresAtTick, x.admission.economicState.current.expiresAtTick);
});

test('character_capacity_seals_partial_without_evicting_previous_facts', async () => {
    const {m, x, store, start} = await recording();
    const p = packet(store, start, x.admittedClock.nowMs);
    let s = m.advanceEvidenceWindow(store, {type: 'capture', packet: p}, {...x.admittedClock, tick: start}, x.profile).store;
    s.current.capture.padding = '';
    s.current.capture.padding = 'x'.repeat(130900 - JSON.stringify(s.current).length);
    const old = structuredClone(s.current.tickRows);
    const next = packet(s, start + 1, x.admittedClock.nowMs + 1);
    next.snapshot = {observedTick: start + 1, data: 'x'.repeat(1000)};
    const r = m.advanceEvidenceWindow(s, {type: 'capture', packet: next}, {...x.admittedClock, tick: start + 1, nowMs: next.observedAtMs}, x.profile);
    assert.equal(r.store.current.capture.phase, 'sealed');
    assert.equal(r.store.current.seal.reason, 'capacity');
    assert.equal(r.store.current.capture.partial, true);
    assert.deepEqual(r.store.current.tickRows, old);
    assert.ok(JSON.stringify(r.store.current).length <= 131072);
});

for (const kind of ['configFingerprint', 'tick_window', 'wall_window', 'containerPos']) {
    test('review_canonical_start_cross_object_' + kind, async () => {
        const {m, x} = await recording();
        const store = m.advanceEvidenceWindow(undefined, {type: 'arm', request: x.request}, x.clock, x.profile).store;
        const admission = structuredClone(x.admission), current = admission.economicState.current;
        if (kind === 'configFingerprint') current.configFingerprint += ':different';
        if (kind === 'tick_window') {current.startedAtTick--; current.expiresAtTick--;}
        if (kind === 'wall_window') {current.issuedAtMs--; current.expiresAtMs--;}
        if (kind === 'containerPos') current.containerPos.x++;
        const {validEconomicTrialState} = await import('../services/RemoteEconomicTrialModel.js');
        assert.equal(validEconomicTrialState(admission.economicState), true, 'individually valid state with inconsistent canonical start');
        assert.equal(m.advanceEvidenceWindow(store, {type: 'bind', admission}, x.admittedClock, x.profile).changed, false);
    });
}
