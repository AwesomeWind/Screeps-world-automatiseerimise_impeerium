const test = require('node:test');
const assert = require('node:assert/strict');
const {admittedEvidenceInputs} = require('./helpers/trial-evidence-window-fixture.cjs');
const load = () => import('../services/TrialEvidenceWindowFacts.js').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('TrialEvidenceWindowFacts.js')) return {};
    throw error;
});
async function bound(options) {
    const x = await admittedEvidenceInputs(options);
    const m = await import('../services/TrialEvidenceWindowModel.js');
    let s = m.advanceEvidenceWindow(undefined, {type: 'arm', request: x.request}, x.clock, x.profile).store;
    s = m.advanceEvidenceWindow(s, {type: 'bind', admission: x.admission}, x.admittedClock, x.profile).store;
    return {...x, window: s.current};
}

test('previous_tick_events_require_bound_actor_and_source', async () => {
    const facts = await load();
    assert.equal(typeof facts.normalizeEvidenceEvents, 'function');
    const identity = {trialId: 'one', sequence: 3, epoch: 1, remoteId: 'A:B', codeVersion: 'v'};
    const context = {eventTick: 100, startedAtTick: 100, sourceId: 'source', containerId: 'container', receiverId: 'receiver',
        targetRoom: 'B', baseRoom: 'A', binding: {remoteMiner: {id: 'miner', identity}, remoteHauler: {id: 'hauler', identity}}, identity};
    const event = {event: 5, objectId: 'miner', data: {targetId: 'source', amount: 10}};
    const result = facts.normalizeEvidenceEvents([{roomName: 'B', index: 0, item: event}], context);
    assert.equal(result.harvestEnergy, 10);
    for (const item of [{...event, objectId: 'old-miner'}, {...event, data: {...event.data, targetId: 'other'}},
        {...event, data: {...event.data, amount: 1.5}}, {...event, data: {...event.data, amount: -1}},
        {...event, data: {...event.data, amount: Number.MAX_SAFE_INTEGER + 1}}]) {
        const r = facts.normalizeEvidenceEvents([{roomName: 'B', index: 0, item}], context);
        assert.notEqual(r.harvestEnergy, 10);
    }
    assert.equal(facts.normalizeEvidenceEvents([{roomName: 'B', index: 0, item: event}], {...context, eventTick: 99}).harvestEnergy, null);
    const duplicate = [{roomName: 'B', index: 0, item: event}, {roomName: 'B', index: 0, item: event}];
    assert.equal(facts.normalizeEvidenceEvents(duplicate, context).harvestEnergy, 10);
    duplicate[1] = {...duplicate[1], item: {...event, data: {...event.data, amount: 20}}};
    assert.equal(facts.normalizeEvidenceEvents(duplicate, context).complete, false);
});

test('ok_without_applied_event_is_not_production', async () => {
    const facts = await load();
    assert.equal(typeof facts.collectEvidencePacket, 'function');
    const x = await bound(), before = JSON.stringify(Memory);
    x.f.scene.f.home.getEventLog = () => [];
    const p = facts.collectEvidencePacket(x.window, x.f.clock());
    assert.equal(p.eventTick, p.observedTick - 1);
    assert.equal(p.row[5], null, 'no matching positive event cannot prove production');
    assert.equal(p.proof.apiEvidence.semanticsLevel, 'unverified');
    assert.equal(JSON.stringify(Memory), before);
});

test('bounded_reads_and_missing_are_not_zero', async () => {
    const facts = await load();
    assert.equal(typeof facts.collectEvidencePacket, 'function');
    const x = await bound();
    let calls = 0;
    const deps = {readEvents: () => { calls++; return Array.from({length: 129}, () => ({event: 99, objectId: 'x', data: {}})); }};
    const packet = facts.collectEvidencePacket(x.window, x.f.clock(), deps);
    assert.ok(calls <= 2);
    assert.equal(packet.coverage.complete, false);
    assert.ok(packet.row[10] & 16);
    const absent = facts.collectEvidencePacket(x.window, x.f.clock(), {readRoom: () => null});
    assert.equal(absent.row[5], null);
    assert.equal(absent.proof.apiEvidence.methodSupported, false);
});

test('foreign_inputs_and_unverified_semantics', async () => {
    const facts = await load();
    assert.equal(typeof facts.normalizeEvidenceEvents, 'function');
    const r = facts.normalizeEvidenceEvents([{roomName: 'B', index: 0, item: {event: 12, objectId: 'foreign',
        data: {targetId: 'container', amount: 10, resourceType: 'energy'}}}], {
        eventTick: 100, startedAtTick: 100, targetRoom: 'B', baseRoom: 'A', containerId: 'container', binding: {}, identity: {}});
    assert.equal(r.foreignInput, true);
    assert.equal(r.sourceDepositEnergy, null);
});

test('exact_128_events_and_200_entries_are_observed_before_overflow', async () => {
    const facts = await load(), x = await bound();
    x.f.advance(); // T-1 is now inside the admitted session, not the old parent tick.
    Game.rooms[x.profile.targetRoom] = x.f.scene.f.remote;
    const business = facts.readEvidenceBusiness();
    const original = structuredClone(business.budgets);
    const table = n => Object.fromEntries(Array.from({length: n}, (_, i) => [String(i), {}]));
    let inspected = 0;
    const log = Array.from({length: 128}, (_, index) => ({event: 99, get objectId() {inspected++; return 'id-' + index;}, data: {}}));
    const deps = {readBusiness: () => ({...business, budgets: {...original, [x.profile.baseRoom]: {grants: table(200), infrastructure: {pending: {}}}}}),
        readReservations: () => ({supply: {one: {owners: table(200)}}, demand: {}}),
        readEvents: room => room.name === x.profile.baseRoom ? log : []};
    const p = facts.collectEvidencePacket(x.window, x.f.clock(), deps);
    assert.equal(p.proof.grants.count, 200);
    assert.equal(p.proof.owners.count, 200);
    assert.equal(p.row[10] & 16, 0);
    assert.ok(inspected >= 128, 'all 128 events are inspected');
    const tooMany = facts.collectEvidencePacket(x.window, x.f.clock(), {...deps,
        readReservations: () => ({supply: {one: {owners: table(201)}}, demand: {}})});
    assert.equal(tooMany.proof.owners.known, false);
    assert.equal(tooMany.proof.owners.count, null);
});

test('opening_inventory_is_observed_at_admission_or_stays_unknown', async () => {
    const facts = await load(), visible = await bound({visible: true});
    const p = facts.collectEvidencePacket(visible.window, visible.f.clock());
    assert.equal(p.provenance.openingEnergy, 500);
    const hidden = await bound();
    hidden.f.advance();
    Game.rooms[hidden.profile.targetRoom] = hidden.f.scene.f.remote;
    const late = facts.collectEvidencePacket(hidden.window, hidden.f.clock());
    assert.equal(late.provenance.openingEnergy, null);
});

test('overflowed_native_amount_does_not_become_known_again_on_later_event', async () => {
    const facts = await load(), identity = {trialId: 'one', sequence: 1, remoteId: 'A:B', epoch: 1, codeVersion: 'v'};
    const context = {eventTick: 101, startedAtTick: 100, baseRoom: 'A', targetRoom: 'B', sourceId: 'source',
        identity, binding: {remoteMiner: {id: 'miner', identity}}};
    const events = [Number.MAX_SAFE_INTEGER, 1, 1].map((amount, index) => ({roomName: 'B', index,
        item: {event: 5, objectId: 'miner', data: {targetId: 'source', amount}}}));
    const r = facts.normalizeEvidenceEvents(events, context);
    assert.equal(r.complete, false);
    assert.equal(r.harvestEnergy, null);
});

for (const recipient of ['miner', 'hauler']) test('review_foreign_energy_into_bound_' + recipient, async () => {
    const facts = await load(), identity = {trialId: 'one', sequence: 1, remoteId: 'A:B', epoch: 1, codeVersion: 'v'};
    const r = facts.normalizeEvidenceEvents([{roomName: 'B', index: 0, item: {event: 12, objectId: 'foreign',
        data: {targetId: recipient, amount: 80, resourceType: 'energy'}}}], {eventTick: 101, startedAtTick: 100,
        baseRoom: 'A', targetRoom: 'B', containerId: 'container', receiverId: 'receiver', identity,
        binding: {remoteMiner: {id: 'miner', identity}, remoteHauler: {id: 'hauler', identity}}});
    assert.equal(r.foreignInput, true, 'actor inputs cannot be hidden by a balanced container delta');
});
