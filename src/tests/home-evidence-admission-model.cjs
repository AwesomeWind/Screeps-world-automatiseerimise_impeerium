const {test} = require('node:test');
const assert = require('node:assert/strict');
const {clock, request, selection, gate, packet, admitted} = require('./helpers/home-evidence-data.cjs');
const load = () => import('../services/HomeEvidenceWindowModel.js');
async function reserved() {
    const m = await load();
    return {m, store: m.advanceHomeEvidence(undefined, {type: 'reserve', request: request()}, clock).store};
}
test('v2_reserved_is_not_admitted', async () => {
    const {m, store} = await reserved();
    assert.equal(store?.schemaVersion, 2);
    assert.equal(store.window, null);
    assert.equal(store.admission.status, 'reserved');
    assert.equal(store.admission.firstOutcome, null);
    assert.equal(m.validHomeEvidenceStore(store), true);
});
test('first_rejection_survives_late_invalid_request', async () => {
    const {m, store} = await reserved();
    const rejected = m.advanceHomeEvidence(store, {type: 'reject', reason: 'home_not_ready', stage: 'gate'}, clock).store;
    assert.equal(rejected.admission.firstOutcome.reason, 'home_not_ready');
    const late = {...clock, tick: 101, nowMs: clock.nowMs + 1};
    const after = m.advanceHomeEvidence(rejected, {type: 'reject', reason: 'invalid_request', stage: 'entry'}, late);
    assert.equal(after.changed, false);
    assert.deepEqual(after.store, rejected);
});
test('admit_requires_same_anchor_reserved_identity', async () => {
    const {m, store} = await reserved();
    const e = {type: 'admit', request: request(), selection: selection(), gate: gate()};
    assert.equal(m.advanceHomeEvidence(store, e, {...clock, tick: 101}).changed, false);
    assert.equal(m.advanceHomeEvidence(store, {...e, request: request({id: 'foreign'})}, clock).changed, false);
    const a = m.advanceHomeEvidence(store, e, clock).store;
    assert.equal(a.admission.status, 'accepted');
    assert.equal(a.window.rows.length, 0);
    assert.equal(a.window.bounds.lastAllowedTick, 199);
    assert.equal(a.window.bounds.expiresAtMs, request().expiresAtMs);
    assert.equal(m.validHomeEvidenceStore(a), true);
    const row = m.advanceHomeEvidence(a, {type: 'capture', packet: packet(), gate: gate()}, clock);
    assert.equal(row.store.window.rows.length, 1);
});
test('v1_remains_readable_without_migration', async () => {
    const {m, store} = await admitted();
    assert.equal(store.schemaVersion, 1);
    assert.equal(m.validHomeEvidenceStore(store), true);
    assert.equal(m.advanceHomeEvidence(store, {type: 'reserve', request: request()}, clock).changed, false);
});
test('reserve_has_exact_anchor_and_original_freshness', async () => {
    const m = await load();
    for (const c of [{...clock, tick: 101}, {...clock, nowMs: clock.nowMs + 30001}, {...clock, nowMs: request().expiresAtMs}]) {
        assert.equal(m.advanceHomeEvidence(undefined, {type: 'reserve', request: request()}, c).changed, false);
    }
    assert.equal(m.advanceHomeEvidence(undefined, {type: 'reserve', request: request()}, {...clock, nowMs: clock.nowMs + 30000}).changed, true);
});
test('v2_rejects_foreign_fields_and_inconsistent_outcome', async () => {
    const {m, store} = await reserved();
    const copy = () => structuredClone(store);
    let x = copy(); x.admission.extra = true; assert.equal(m.validHomeEvidenceStore(x), false);
    x = copy(); x.admission.status = 'accepted'; assert.equal(m.validHomeEvidenceStore(x), false);
    x = copy(); x.admission.firstSeen.tick++; assert.equal(m.validHomeEvidenceStore(x), false);
    x = copy(); x.pending = {key: 'foreign', kind: 'admit', tick: 100}; assert.equal(m.validHomeEvidenceStore(x), false);
});
test('pending_kind_and_accepted_outcome_must_match_the_proven_transition', async () => {
    const {m, store} = await reserved();
    store.pending = {key: m.homeCommitKey(store.admission.request, 'admit'), kind: 'admit', tick: 100};
    assert.equal(m.validHomeEvidenceStore(store), false);
    const {store: accepted} = await require('./helpers/home-evidence-data.cjs').admittedV2();
    accepted.admission.firstOutcome.nowMs += 30001;
    assert.equal(m.validHomeEvidenceStore(accepted), false);
});
test('diagnostic_limit_counts_utf16_and_does_not_delete_existing_rows', async () => {
    const {m, store} = await reserved();
    const original = structuredClone(store);
    store.admission.cpu.unbounded = '界'.repeat(8192);
    assert.equal(m.validHomeEvidenceStore(store), false);
    assert.deepEqual(m.advanceHomeEvidence(original, {type: 'reserve', request: request({id: 'replacement'})}, clock).store, original);
});
