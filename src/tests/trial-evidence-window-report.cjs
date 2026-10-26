const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../services/TrialEvidenceWindowReport.js').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('TrialEvidenceWindowReport.js')) return {};
    throw error;
});
async function reportWindow() {
    const m = await import('../services/TrialEvidenceWindowModel.js');
    const clock = {tick: 100, nowMs: 1000000, codeVersion: 'test-v1'};
    const identity = {trialId: 'trial', sequence: 1, remoteId: m.EVIDENCE_PROFILE.remoteId, epoch: 1, codeVersion: clock.codeVersion};
    const request = {schemaVersion: 1, id: 'window', nativeId: 'native', identity, profileId: m.EVIDENCE_PROFILE.id,
        issuedAtMs: clock.nowMs, expiresAtMs: clock.nowMs + 5400000, acceptNotBeforeTick: 100, acceptNotAfterTick: 110};
    const w = m.advanceEvidenceWindow(undefined, {type: 'arm', request}, clock).store.current;
    w.header.receiverId = 'receiver';
    w.bounds.startedAtTick = 100; w.bounds.maxObservedTick = 1402;
    w.capture.phase = 'recording'; w.capture.firstTick = 100; w.capture.lastTick = 199;
    w.tickRows = Array.from({length: 100}, (_, i) => [100 + i, 1000000 + i, 127, 127, i + 1, null, null, null, 0, 0, 0]);
    const settlement = {confirmedSpawnCost: 50, confirmedInfrastructureCost: 0, returnedEnergy: 70,
        unknownEnergyUpperBound: 0, unknownEvents: 0, logisticsUnknownEnergyUpperBound: 0,
        knownNetEnergy: 20, netEnergy: 20};
    const proof = {identity, settlement, containerId: 'container', apiEvidence: {methodSupported: true, shapeValid: true,
        semanticsLevel: 'simulated', verificationRef: null}, firstDelivery: {identity, tripId: 'trip-one', amount: 70, targetId: 'receiver', confirmedAtTick: 199},
        pickups: {'trip:trip-one': 70}, delivered: {'trip:trip-one': 70}, outboxPending: 0, outcome: null};
    w.capture.latestProof = structuredClone(proof); w.capture.firstDeliveryProof = structuredClone(proof);
    w.capture.provenance = {openingEnergy: 20, containerId: 'container', harvest: 100, deposits: 80,
        incomplete: false, foreignInput: false, firstPickupTick: 150, tripId: 'trip-one'};
    w.binding.remoteMiner = {id: 'miner', birthEmpty: true};
    w.binding.remoteHauler = {id: 'hauler', birthEmpty: true};
    return w;
}

test('report_sections_keep_money_and_observation_unknown_separate', async () => {
    const r = await load();
    assert.equal(typeof r.summarizeEvidenceWindow, 'function');
    const w = await reportWindow();
    const before = JSON.stringify(w), summary = r.summarizeEvidenceWindow(w);
    assert.equal(summary.settlement.netEnergy, 20);
    assert.equal(summary.sections.production.status, 'unsupported', 'simulated events cannot prove production in game');
    assert.equal(summary.firstDeliveryNewEnergyLowerBound, null);
    assert.equal(summary.sections.production.observedHarvest, null, 'no matching event is not a measured zero');
    assert.equal(summary.passed, undefined);
    assert.equal(summary.permission, undefined);
    assert.equal(JSON.stringify(w), before);
    w.capture.latestProof.settlement.unknownEvents = 1;
    assert.equal(r.summarizeEvidenceWindow(w).settlement.netEnergy, null);
    w.capture.latestProof.settlement.unknownEvents = 0;
    w.capture.latestProof.settlement.netEnergy = -30;
    w.capture.latestProof.settlement.knownNetEnergy = -30;
    w.capture.latestProof.settlement.returnedEnergy = 20;
    assert.equal(r.summarizeEvidenceWindow(w).settlement.netEnergy, -30);
});

test('first_trip_lower_bound_is_conservative', async () => {
    const r = await load();
    assert.equal(typeof r.deriveFirstDeliveryNewEnergyLowerBound, 'function');
    const w = await reportWindow();
    assert.equal(r.deriveFirstDeliveryNewEnergyLowerBound(w).value, 50);
    w.capture.provenance.openingEnergy = 100;
    assert.equal(r.deriveFirstDeliveryNewEnergyLowerBound(w).value, 0);
    for (const change of [x => {x.capture.provenance.openingEnergy = null;}, x => {x.capture.provenance.foreignInput = true;},
        x => {x.binding.remoteMiner.birthEmpty = null;}, x => {x.capture.partial = true;},
        x => {x.capture.firstDeliveryProof.settlement.unknownEvents = 1;}, x => {x.capture.provenance.tripId = 'other';}]) {
        const x = structuredClone(w); change(x);
        assert.equal(r.deriveFirstDeliveryNewEnergyLowerBound(x).value, null);
    }
    const missingContainer = structuredClone(w);
    missingContainer.capture.firstDeliveryProof.containerId = null;
    assert.equal(r.deriveFirstDeliveryNewEnergyLowerBound(missingContainer).value, null);
});

test('sealed_pages_ignore_current_business', async () => {
    const r = await load();
    assert.equal(typeof r.readEvidencePage, 'function');
    const w = await reportWindow();
    w.capture.phase = 'sealed'; w.seal = {reason: 'partial', atTick: 200, atMs: 1000200, revision: w.capture.revision};
    for (let tick = 200; tick < 240; tick++) w.tickRows.push([tick, 1000000 + tick, 0, 0, null, null, null, null, 0, 0, 0]);
    w.capture.lastTick = 239;
    const store = {schemaVersion: 1, current: w, previous: null}, before = JSON.stringify(store);
    const page = r.readEvidencePage(store, 'window', 'rows', 0, 129);
    assert.ok(page.items.length > 0 && page.items.length <= 128, 'character cap can bind before row cap');
    assert.equal(page.nextOffset, page.items.length);
    assert.equal(page.items[0].observedTick, 100);
    assert.ok(JSON.stringify(page).length <= 16384);
    assert.equal(r.readEvidencePage(store, 'window', 'rows', -1, 1).error, 'invalid_page');
    assert.equal(r.readEvidencePage(store, 'window', 'rows', 0, NaN).error, 'invalid_page');
    const summary = r.summarizeEvidenceWindow(w);
    global.Memory = {empire: {remoteMining: {economicTrials: {current: {evidence: {returnedEnergy: 999999}}}}}};
    assert.deepEqual(r.summarizeEvidenceWindow(w), summary);
    assert.equal(JSON.stringify(store), before);
});

module.exports = {reportWindow};

test('safety_proof_requires_original_counter_and_bound_scout', async () => {
    const r = await load(), w = await reportWindow();
    w.tickRows.forEach(row => {row[4] = 0;});
    assert.equal(r.summarizeEvidenceWindow(w).sections.safety.status, 'missing');
    w.binding.scout = {id: 'scout', bornAtTick: 100, identity: structuredClone(w.header.identity)};
    w.tickRows.forEach((row, i) => {row[4] = i + 1; row[10] = 32;});
    w.capture.partial = true;
    assert.equal(r.summarizeEvidenceWindow(w).sections.safety.status, 'proved', 'unrelated owner coverage is reported separately');
    w.tickRows.splice(50, 1);
    assert.equal(r.summarizeEvidenceWindow(w).sections.safety.status, 'missing', 'two halves cannot be stitched');
});

test('delivery_and_tail_do_not_infer_empty_cargo_from_disappearance', async () => {
    const r = await load(), w = await reportWindow();
    w.capture.latestProof.outcome = {verdict: 'aborted', stopReason: 'commit_failed', decidedAtTick: 199};
    w.capture.firstDeliveryProof = null;
    w.tickRows.at(-1)[7] = 400;
    const summary = r.summarizeEvidenceWindow(w);
    assert.equal(summary.sections.delivery.status, 'missing');
    assert.equal(summary.outcome.verdict, 'aborted');
    assert.equal(summary.sections.tail.status, 'missing');
    assert.equal(summary.sections.tail.actorsHomeEmpty, false);
});

test('snapshot_page_limits_and_oversize_item_never_stall', async () => {
    const r = await load(), w = await reportWindow();
    w.snapshots = Array.from({length: 17}, (_, i) => ({observedTick: i}));
    const store = {schemaVersion: 1, current: w, previous: null};
    assert.equal(r.readEvidencePage(store, 'window', 'snapshots', 0, 17).items.length, 16);
    w.snapshots = [{observedTick: 100, fixturePayload: '界'.repeat(16384)}];
    assert.equal(r.readEvidencePage(store, 'window', 'snapshots', 0, 1).error, 'item_too_large');
    assert.equal(r.readEvidencePage(store, 'window', 'snapshots', 0, 1).nextOffset, null);
});

test('review_control_closure_needs_original_identity_guard_and_runtime_scope', async () => {
    const r = await load(), w = await reportWindow();
    const {EVIDENCE_STATE_BITS: B} = await import('../services/TrialEvidenceWindowModel.js');
    for (const row of w.tickRows.slice(-2)) {row[8] |= B.controlClosed; row[9] |= B.controlClosed;}
    assert.equal(r.summarizeEvidenceWindow(w).sections.controlClosure.quietNow, true);
    assert.equal(r.summarizeEvidenceWindow(w).sections.controlClosure.status, 'missing');
    const p = w.capture.latestProof;
    p.outcome = {verdict: 'aborted', decidedAtTick: 150}; p.closeAppliedAtTick = 150; p.closureVerifiedAtTick = 151;
    p.control = {identityKnown: true, settingsClosed: true, operationClosed: true, scopeClosed: true};
    assert.equal(r.summarizeEvidenceWindow(w).sections.controlClosure.status, 'proved');
    p.control.scopeClosed = false;
    assert.equal(r.summarizeEvidenceWindow(w).sections.controlClosure.status, 'missing');
    p.control.scopeClosed = true; w.tickRows.at(-1)[10] |= 64;
    assert.equal(r.summarizeEvidenceWindow(w).sections.controlClosure.status, 'missing');
});
