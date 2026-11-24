const assert = require('node:assert/strict');
const test = require('node:test');
const {actorId, spawnId, supplyRecord} = require('./helpers/local-spawn-supply-data.cjs');
const load = () => import('../services/LocalSpawnSupplyProof.js');

test('positive_100_units', async () => {
    const {verifySpawnSupply} = await load();
    assert.deepEqual(verifySpawnSupply(supplyRecord().frame),
        {tick: 2014, actionTick: 2013, actorId, spawnId, amount: 100});
});

test('rejects_wrong_tick_amount_direction_or_concurrency', async () => {
    const {verifySpawnSupply} = await load();
    for (const change of [
        row => { row.tick--; },
        row => { row.tick++; },
        row => { row.transfers[0][2] = 0; },
        row => { row.transfers[0][2] = -100; },
        row => { row.transfers[0] = [spawnId, actorId, 100, 'energy']; },
        row => { row.transfers.push([spawnId, actorId, 1, 'energy']); },
        row => { row.eventCount = 129; },
        row => { row.action.after = 99; }
    ]) {
        const {frame} = supplyRecord();
        change(frame);
        assert.equal(verifySpawnSupply(frame), null);
    }
});

test('capture_record_requires_bound_birth', async () => {
    const {validateLocalSpawnSupplyRecord} = await load();
    assert.equal(validateLocalSpawnSupplyRecord(supplyRecord()), true);
    for (const change of [
        row => { row.shard = 'shard2'; },
        row => { row.birth.roomName = 'W48N41'; },
        row => { row.birth.role = 'miner'; },
        row => { row.birth.state = 'calling'; },
        row => { row.birth.bornAt = row.frame.tick; },
        row => { row.birth.observeUntil = row.frame.tick - 1; },
        row => { row.birth.requestId = 'REQ_SPAWN_1999_0'; },
        row => { row.birth.quotaKey = 'hauler:W48N41:core'; },
        row => { row.source = 'simulated'; }
    ]) {
        const row = supplyRecord();
        change(row);
        assert.equal(validateLocalSpawnSupplyRecord(row), false);
    }
});
