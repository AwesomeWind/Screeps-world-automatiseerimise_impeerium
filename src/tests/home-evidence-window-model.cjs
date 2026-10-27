const test = require('node:test');
const assert = require('node:assert/strict');
const {clock, request, gate, selection, packet, admitted} = require('./helpers/home-evidence-data.cjs');
const load = () => import('../services/HomeEvidenceWindowModel.js').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('HomeEvidenceWindowModel.js')) return {};
    throw error;
});

test('home_default_off_and_request_schema', async () => {
    const m = await load(); assert.equal(typeof m.validateHomeEvidenceRequest, 'function', 'home request validator required');
    const {DEFAULT_EMPIRE_POLICY: p} = await import('../config/EmpirePolicy.js');
    assert.deepEqual(p.homeEvidence, {enabled: false, request: null, cpu: {minBucket: 5000, reserve: 5, capture: 2}});
    assert.equal(p.remoteMining.evidenceWindow.enabled, false); assert.equal(p.goalPlanning.enabled, false);
    assert.equal(m.validateHomeEvidenceRequest(request(), clock).valid, true);
    for (const patch of [{url: 'x'}, {id: 'bad:id'}, {schemaVersion: 2}, {shard: 'shard2'}, {roomName: 'W1N1'},
        {issuedAtMs: '1000000'}, {expiresAtMs: clock.nowMs + 600001}, {acceptNotAfterTick: 111}]) {
        assert.equal(m.validateHomeEvidenceRequest(request(patch), clock).valid, false);
    }
});
test('home_admission_clock_edges', async () => {
    const m = await load(); assert.equal(typeof m.validateHomeEvidenceRequest, 'function');
    for (const [delta, valid] of [[30000, true], [30001, false], [-1, false]]) assert.equal(m.validateHomeEvidenceRequest(request(), {...clock, nowMs: clock.nowMs + delta}).valid, valid);
    assert.equal(m.validateHomeEvidenceRequest(request(), {...clock, tick: 110}).valid, true);
    assert.equal(m.validateHomeEvidenceRequest(request(), {...clock, tick: 111}).valid, false);
});
test('home_single_window_and_id_conflict', async () => {
    const m = await load(); assert.equal(typeof m.advanceHomeEvidence, 'function');
    const {store} = await admitted(), original = JSON.stringify(store);
    assert.equal(m.validHomeEvidenceStore(store), true);
    for (const q of [request(), request({id: 'other'})]) assert.equal(m.advanceHomeEvidence(store, {type: 'admit', request: q, selection: selection(), gate: gate()}, clock).changed, false);
    assert.equal(JSON.stringify(store), original);
    const pending = structuredClone(store); pending.window.pending = {key: 'admit:100', stage: 'admit', tick: 100};
    assert.equal(m.advanceHomeEvidence(JSON.parse(JSON.stringify(pending)), {type: 'admit', request: request({id: 'next'})}, {...clock, tick: 101}).reason, 'pending_write');
});
test('home_one_hundred_observations_no_extension', async () => {
    const m = await load(); assert.equal(typeof m.advanceHomeEvidence, 'function');
    let {store} = await admitted(); assert.equal(store.window.bounds.lastAllowedTick, 199);
    for (let tick = 100; tick <= 199; tick++) store = m.advanceHomeEvidence(store, {type: 'capture', packet: packet(tick), gate: gate(tick)}, {...clock, tick, nowMs: packet(tick).observedAtMs}).store;
    assert.equal(store.window.rows.length, 100); assert.equal(store.window.capture.phase, 'sealed');
    const end = m.advanceHomeEvidence(store, {type: 'capture', packet: packet(200), gate: gate(200)}, {...clock, tick: 200});
    assert.equal(end.changed, false); assert.equal(end.store.window.rows.length, 100);
    const first = (await admitted()).store;
    const wallEnd = m.advanceHomeEvidence(first, {type: 'capture', packet: packet(), gate: gate()}, {...clock, nowMs: request().expiresAtMs});
    assert.equal(wallEnd.store.window.rows.length, 0); assert.equal(wallEnd.store.window.seal.reason, 'deadline');
});
test('home_duplicate_packet_idempotent_conflict_preserves_first', async () => {
    const m = await load(); assert.equal(typeof m.advanceHomeEvidence, 'function');
    let {store} = await admitted(); const event = {type: 'capture', packet: packet(), gate: gate()};
    store = m.advanceHomeEvidence(store, event, clock).store;
    assert.equal(m.advanceHomeEvidence(store, event, clock).changed, false);
    const different = structuredClone(event); different.packet.cpu.captureCpu = 1;
    const conflict = m.advanceHomeEvidence(store, different, clock).store;
    assert.deepEqual(conflict.window.rows[0], store.window.rows[0]); assert.equal(conflict.window.capture.partial, true);
    const reversed = m.advanceHomeEvidence(store, {type: 'capture', packet: packet(101), gate: gate(101)}, {...clock, tick: 101, nowMs: clock.nowMs - 1}).store;
    assert.equal(reversed.window.capture.phase, 'sealed'); assert.equal(reversed.window.seal.reason, 'invalid_clock');
});
test('home_withdraw_request_and_unknown_gate_stop_before_append', async () => {
    const m = await load(); assert.equal(typeof m.advanceHomeEvidence, 'function');
    const {store} = await admitted();
    const stopped = m.advanceHomeEvidence(store, {type: 'seal', reason: 'disabled'}, clock).store;
    assert.equal(stopped.window.capture.phase, 'sealed'); assert.equal(stopped.window.rows.length, 0);
    assert.equal(m.advanceHomeEvidence(store, {type: 'capture', packet: packet(), gate: {...gate(), known: false}}, clock).store.window.seal.reason, 'controls_unconfirmed');
    assert.equal(m.advanceHomeEvidence(undefined, {type: 'admit', request: request(), selection: selection(), gate: {...gate(), closed: false}}, clock).changed, false);
});
test('home_capacity_includes_pending_seal_and_strict_rows', async () => {
    const m = await load(); assert.equal(typeof m.validHomeEvidenceStore, 'function');
    const {store} = await admitted();
    const bad = structuredClone(store); bad.window.header.request.expiresAtMs++;
    assert.equal(m.validHomeEvidenceStore(bad), false);
    for (const patch of [{arbitraryMemory: {}}, {observedTick: '100'}, {declaredEventTick: 100}]) {
        assert.equal(m.advanceHomeEvidence(store, {type: 'capture', packet: packet(100, patch), gate: gate()}, clock).changed, false);
    }
    const many = structuredClone(store); const row = packet();
    row.coverage.reasons = ['objects_missing']; row.coverage.complete = false;
    // Legal packets with maximum-length cohort names consume real capacity without arbitrary padding fields.
    many.window.header.cohort.forEach((c, index) => {c.name = index + '界'.repeat(99);});
    for (let index = 0; index < 12; index++) many.window.header.objectIds.push(index.toString(16).padStart(24, '0'));
    row.objects = Object.fromEntries(many.window.header.objectIds.map(id => [id,
        {id, exists: false, kind: null, role: null, my: null, pos: null, energy: null}]));
    assert.equal(m.validHomeEvidenceStore(many), true);
    for (let tick = 100; tick < 200 && many.window.capture.phase !== 'sealed'; tick++) {
        row.observedTick = tick; row.declaredEventTick = tick - 1; row.observedAtMs = clock.nowMs + tick;
        const next = m.advanceHomeEvidence(many, {type: 'capture', packet: row, gate: gate(tick)}, {...clock, tick, nowMs: row.observedAtMs});
        Object.assign(many, next.store);
    }
    assert.ok(JSON.stringify(many).length <= 131072);
    assert.equal(many.window.seal.reason, 'capacity');
    assert.ok(many.window.rows.length < 100);
    assert.equal(m.validHomeEvidenceStore(many), true);
});
