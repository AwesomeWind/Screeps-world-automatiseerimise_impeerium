const test = require('node:test');
const assert = require('node:assert/strict');
const {ids, clock, gate, packet, admitted} = require('./helpers/home-evidence-data.cjs');
const load = () => import('../services/HomeEvidenceWindowReport.js').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('HomeEvidenceWindowReport.js')) return {};
    throw error;
});
async function pair(event = 5) {
    const {m, store} = await admitted();
    const before = packet(), after = packet(101);
    const target = event === 5 ? ids.source : ids.storage;
    for (const p of [before, after]) for (const id of [ids.miner, target]) p.objects[id] = {id, exists: true,
        kind: id === ids.miner ? 'creep' : event === 5 ? 'source' : 'storage', role: id === ids.miner ? 'miner' : null,
        my: id === ids.source ? null : true, pos: {x: 20, y: 20, roomName: 'W49N41'}, energy: 100};
    after.objects[ids.miner].energy += event === 5 ? 2 : -2;
    after.objects[target].energy += event === 5 ? -2 : 2;
    after.events = [{event, roomName: 'W49N41', index: 0, objectId: ids.miner, targetId: target,
        resourceType: event === 5 ? null : 'energy', amount: 2}];
    after.api.nativeCount = 1;
    let s = m.advanceHomeEvidence(store, {type: 'capture', packet: before, gate: gate()}, clock).store;
    s = m.advanceHomeEvidence(s, {type: 'capture', packet: after, gate: gate(101)}, {...clock, tick: 101, nowMs: after.observedAtMs}).store;
    return s;
}
module.exports.pair = pair;

test('home_report_requires_real_pairs_and_no_economic_permission', async () => {
    const r = await load(); assert.equal(typeof r.summarizeHomeEvidence, 'function', 'home report required');
    const s = await pair(); const report = r.summarizeHomeEvidence(s);
    assert.equal(report.harvest.consistentObservations, 1); assert.equal(report.transfer.consistentObservations, 0);
    assert.equal(report.productionSemantics, 'simulated_only'); assert.equal(report.economicAcceptance, 'not_performed');
    assert.equal(report.passed, undefined); assert.equal(report.permission, undefined); assert.equal(report.settlement, undefined);
});
test('home_report_first_row_and_missing_transition_never_count', async () => {
    const r = await load(); assert.equal(typeof r.summarizeHomeEvidence, 'function');
    const s = await pair(); s.window.rows.splice(0, 1);
    assert.equal(r.summarizeHomeEvidence(s).harvest.consistentObservations, 0);
    assert.equal(r.summarizeHomeEvidence(s).coverage.contiguousFromStart, false);
    const gap = await pair(); gap.window.rows[1].observedTick = 102; gap.window.rows[1].declaredEventTick = 101;
    gap.window.capture.lastCommittedTick = 102;
    assert.equal(r.summarizeHomeEvidence(gap).harvest.consistentObservations, 0);
});
test('home_report_withdraw_is_not_positive_transfer', async () => {
    const r = await load(); assert.equal(typeof r.summarizeHomeEvidence, 'function');
    const forward = await pair(12); assert.equal(r.summarizeHomeEvidence(forward).transfer.consistentObservations, 1);
    const reverse = await pair(12); reverse.window.rows[1].objects[ids.miner].energy = 102;
    reverse.window.rows[1].objects[ids.storage].energy = 98;
    const report = r.summarizeHomeEvidence(reverse);
    assert.equal(report.transfer.consistentObservations, 0); assert.equal(report.withdrawCandidate.observations, 1);
    assert.equal(report.withdrawCandidate.status, 'unverified');
});
test('home_report_foreign_touch_regeneration_missing_endpoint_and_link_are_unproved', async () => {
    const r = await load(); assert.equal(typeof r.summarizeHomeEvidence, 'function');
    for (const mutate of [s => {s.window.rows[1].objects[ids.source].energy = 3000;},
        s => {s.window.rows[0].objects[ids.source].energy = null;},
        s => {s.window.rows[1].events.push({...s.window.rows[1].events[0], index: 1, objectId: '1'.repeat(24)}); s.window.rows[1].api.nativeCount = 2;},
        s => {s.window.rows[1].api.shapeValid = false; s.window.rows[1].coverage.complete = false;},
        s => {s.window.rows[1].coverage = {complete: false, reasons: ['events_overflow']};}]) {
        const s = await pair(); mutate(s); assert.equal(r.summarizeHomeEvidence(s).harvest.consistentObservations, 0);
    }
    const link = await pair(12); for (const row of link.window.rows) row.objects[ids.miner].kind = 'link';
    assert.equal(r.summarizeHomeEvidence(link).transfer.consistentObservations, 0);
});
test('home_report_readonly_pages_do_not_use_current_game_or_mutate_store', async () => {
    const r = await load(); assert.equal(typeof r.readHomeEvidencePage, 'function');
    const s = await pair(), before = JSON.stringify(s), report = r.summarizeHomeEvidence(s);
    global.Game = {time: 999999}; global.Memory = {unrelated: {energy: 999}};
    assert.deepEqual(r.summarizeHomeEvidence(s), report);
    assert.equal(r.readHomeEvidencePage(s, 0, 100).items.length, 2);
    assert.equal(r.readHomeEvidencePage(s, -1, 1).error, 'invalid_page');
    assert.equal(r.homeEvidenceStatus(undefined).error, 'missing_window');
    assert.equal(JSON.stringify(s), before);
});
test('home_report_pending_and_unknown_events_are_not_measured_zero', async () => {
    const r = await load(); assert.equal(typeof r.summarizeHomeEvidence, 'function');
    const s = await pair(); s.window.pending = {key: 'capture:101', stage: 'capture', tick: 101};
    const report = r.summarizeHomeEvidence(s);
    assert.equal(report.coverage.partial, true); assert.equal(report.harvest.consistentObservations, 0);
    const {store} = await admitted();
    assert.equal(r.summarizeHomeEvidence(store).harvest.observedAmount, null);
    assert.equal(r.summarizeHomeEvidence(store).method.status, 'missing');
});

test('home_report_unknown_cpu_stays_null', async () => {
    const r = await load();
    const unknown = await pair();
    for (const row of unknown.window.rows) {row.cpu = {usedBefore: null, tickLimit: null, bucket: null, captureCpu: null}; row.coverage = {complete: false, reasons: ['cpu_skipped']};}
    assert.equal(r.summarizeHomeEvidence(unknown).cpu.maxCaptureCpu, null);
});
test('home_report_impossible_native_count_is_corrupt', async () => {
    const r = await load();
    const inconsistent = await pair(); inconsistent.window.rows[1].api.nativeCount = 0;
    assert.equal(r.summarizeHomeEvidence(inconsistent).error, 'corrupt');
});

test('home_report_amount_overflow_never_restarts_from_a_later_small_amount', async () => {
    const r = await load(), {m, store} = await admitted();
    const max = Number.MAX_SAFE_INTEGER;
    const energies = [[0, max, 0, 0], [max, 0, 0, 0], [0, max, max, 0], [1, max - 1, max, 0], [0, max, max, 1], [2, max - 2, max, 1]];
    const actions = [null, [5, ids.source, max], [12, ids.storage, max], [5, ids.source, 1], [12, ids.hauler, 1], [5, ids.source, 2]];
    let s = store;
    for (let i = 0; i < energies.length; i++) {
        const p = packet(100 + i);
        for (const [index, id] of [ids.miner, ids.source, ids.storage, ids.hauler].entries()) {
            p.objects[id] = {id, exists: true, kind: [ids.miner, ids.hauler].includes(id) ? 'creep' : id === ids.source ? 'source' : 'storage',
                role: id === ids.miner ? 'miner' : id === ids.hauler ? 'hauler' : null, my: id === ids.source ? null : true,
                pos: {x: 20, y: 20, roomName: 'W49N41'}, energy: energies[i][index]};
        }
        if (actions[i]) {const [event, targetId, amount] = actions[i];
            p.events = [{roomName: 'W49N41', index: 0, event, objectId: ids.miner, targetId, resourceType: event === 12 ? 'energy' : null, amount}]; p.api.nativeCount = 1;
        }
        s = m.advanceHomeEvidence(s, {type: 'capture', packet: p, gate: gate(100 + i)}, {...clock, tick: 100 + i, nowMs: p.observedAtMs}).store;
    }
    assert.equal(r.summarizeHomeEvidence(s).harvest.consistentObservations, 3);
    assert.equal(r.summarizeHomeEvidence(s).harvest.observedAmount, null);
});

test('home_report_unaccounted_events_cannot_be_excused_as_unrelated_missing_object', async () => {
    const r = await load(), s = await pair();
    s.window.rows[1].api.nativeCount = 2;
    s.window.rows[1].coverage = {complete: false, reasons: ['objects_missing']};
    assert.equal(r.summarizeHomeEvidence(s).harvest.consistentObservations, 0);
});

test('home_review_distinguishes_absent_events_from_present_unproved_flow', async () => {
    const r = await load(); const {store} = await admitted();
    assert.equal(r.summarizeHomeEvidence(store).harvest.observedEvents, 0);
    const regenerated = await pair(); regenerated.window.rows[1].objects[ids.source].energy = 3000;
    const report = r.summarizeHomeEvidence(regenerated);
    assert.equal(report.harvest.observedEvents, 1); assert.equal(report.harvest.status, 'unproved');
    assert.ok(report.harvest.unprovedReasons.includes('delta_mismatch')); assert.equal(report.harvest.observedAmount, null);
    const concurrent = await pair(); concurrent.window.rows[1].events.push({...concurrent.window.rows[1].events[0], index: 1, objectId: '1'.repeat(24)});
    concurrent.window.rows[1].api.nativeCount = 2;
    assert.ok(r.summarizeHomeEvidence(concurrent).harvest.unprovedReasons.includes('concurrency'));
});
