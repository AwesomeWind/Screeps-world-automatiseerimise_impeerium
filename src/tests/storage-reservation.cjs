const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRemoteFixture } = require('./helpers/remote-mining-fixture.cjs');

async function fixture(energy = 999750) {
    const f = await createRemoteFixture({ manualSettlement: true, policyEnabled: false });
    const metadata = await import('../core/TaskMetadata.js');
    const feedback = await import('../services/ResourceReservationFeedback.js');
    f.homeSink.pos = new RoomPosition(31, 24, 'W1N1');
    f.homeSink.store.energy = energy;
    f.worker = name => {
        const worker = f.actor(name, 'builder', [WORK, CARRY, CARRY, MOVE]);
        worker.pos = new RoomPosition(31, 23, 'W1N1');
        return worker;
    };
    const first = f.worker('First');
    const second = f.worker('Second');
    Game.creeps = { First: first, Second: second };
    f.objects.FarDrop = { id: 'FarDrop', pos: new RoomPosition(21, 26, 'W1N1'), resourceType: RESOURCE_ENERGY, amount: 500 };
    f.storage = { id: 'supply:HomeSink:energy', targetId: 'HomeSink', kind: 'withdraw', resourceType: RESOURCE_ENERGY, amount: energy, priority: 45 };
    f.drop = { id: 'supply:FarDrop:energy', targetId: 'FarDrop', kind: 'dropped', resourceType: RESOURCE_ENERGY, amount: 500, priority: 60 };
    f.market.init();
    f.book = f.market.ensureMarketShape({ supplies: [f.storage], roomName: 'W1N1' }, 'W1N1');
    global.ResourceMarket.W1N1 = f.book;
    f.request = (worker, amount = 100) => {
        const result = f.market.requestResource(worker, { purpose: 'build', amount });
        if (result.task) metadata.assignTask(worker, result.task);
        return result;
    };
    f.owners = () => Object.values(f.book.reservations.supply).flatMap(record => Object.values(record.owners || {}));
    return Object.assign(f, { first, second, metadata, feedback });
}

test('storage_quantity_two_workers_keep_nearby_storage_in_both_supply_orders', async () => {
    for (const droppedFirst of [false, true]) {
        const f = await fixture();
        f.book.supplies = droppedFirst ? [f.drop, f.storage] : [f.storage, f.drop];
        assert.equal(f.request(f.first).task.targetId, 'HomeSink');
        assert.equal(f.request(f.second).task.targetId, 'HomeSink');
        assert.equal(f.market.getAvailableSupplyAmount(f.book, f.storage), 999550);
        assert.deepEqual(f.owners().map(owner => owner.amount), [100, 100]);
        assert.ok(f.owners().every(owner => owner.allocationMode === 'quantity'));
    }
});

test('storage_quantity_partial_stock_limits_total_allocation', async () => {
    const f = await fixture(150);
    assert.equal(f.request(f.first).mode, 'self_fetch');
    assert.equal(f.request(f.second).mode, 'self_fetch');
    assert.deepEqual(f.owners().map(owner => owner.amount), [100, 50]);
    const third = f.worker('Third');
    assert.equal(f.request(third).mode, 'unavailable');
    assert.equal(f.market.getAvailableSupplyAmount(f.book, f.storage), 0);
});

test('storage_quantity_event_alias_cannot_double_allocate_physical_stock', async () => {
    const f = await fixture(150);
    f.request(f.first);
    const alias = { ...f.storage, id: 'event-supply:HomeSink:energy:100' };
    f.book.supplies = [alias];
    assert.equal(f.market.getAvailableSupplyAmount(f.book, alias), 50);
    assert.equal(f.request(f.second).mode, 'self_fetch');
    assert.equal(f.feedback.reservedTargetAmount(f.book, 'supply', 'HomeSink', RESOURCE_ENERGY), 150);
    assert.equal(f.feedback.reserveForTask(f.book, 'supply', f.storage, 1, f.worker('Third'),
        { type: 'WITHDRAW', targetId: 'HomeSink', resourceType: RESOURCE_ENERGY, amount: 1 }), false);
});

test('storage_quantity_receiver_rechecks_live_and_advertised_stock', async () => {
    const f = await fixture(150);
    f.request(f.first);
    f.homeSink.store.energy = 120;
    assert.equal(f.market.getAvailableSupplyAmount(f.book, f.storage), 20);
    assert.equal(f.feedback.reserveForTask(f.book, 'supply', f.storage, 21, f.second,
        { type: 'WITHDRAW', targetId: 'HomeSink', resourceType: RESOURCE_ENERGY, amount: 21 }), false);
    f.storage.amount = 110;
    assert.equal(f.market.getAvailableSupplyAmount(f.book, f.storage), 10);
});

for (const energy of [0, NaN, Infinity, -1]) {
    test('storage_quantity_rejects_invalid_or_empty_stock_' + energy, async () => {
        const f = await fixture(energy);
        assert.equal(f.request(f.first).mode, 'unavailable');
        assert.equal(f.owners().length, 0);
    });
}

test('storage_quantity_task_amount_equals_each_owner_allocation', async () => {
    const f = await fixture(150);
    const first = f.request(f.first);
    const second = f.request(f.second);
    assert.equal(first.task.amount, 100);
    assert.equal(second.task.amount, 50);
    assert.equal(f.second.memory.taskMeta.logisticsReservation.amount, 50);
    assert.equal(f.second.memory.taskMeta.logisticsReservation.allocationMode, 'quantity');
});

test('storage_quantity_old_unbounded_owner_stays_exclusive', async () => {
    const f = await fixture();
    f.request(f.first);
    delete f.owners()[0].allocationMode;
    delete f.first.memory.task.amount;
    assert.equal(f.market.getAvailableSupplyAmount(f.book, f.storage), 0);
    assert.equal(f.request(f.second).mode, 'unavailable');
});

for (const entryId of ['supply:HomeSink:energy', 'event-supply:HomeSink:energy:99', 'storage:HomeSink', 'unmapped-old-supply']) {
    test('storage_quantity_anonymous_claim_blocks_until_original_expiry_' + entryId, async () => {
        const f = await fixture();
        f.book.reservations.supply[entryId] = { amount: 100, expiresAt: 105 };
        assert.equal(f.request(f.first).mode, 'unavailable');
        assert.equal(f.book.reservations.supply[entryId].amount, 100);
        Game.time = 106;
        assert.equal(f.request(f.first).mode, 'self_fetch');
    });
}

for (const alias of [false, true]) {
    test('storage_quantity_compatibility_writer_cannot_replace_or_join_owner_' + alias, async () => {
        const f = await fixture();
        f.request(f.first);
        const before = JSON.stringify(f.book.reservations.supply);
        if (alias) f.book.supplies = [{ ...f.storage, id: 'event-supply:HomeSink:energy:100' }];
        const { planMobileWorkerEnergyTask } = await import('../services/ResourceMarketService.js');
        global.ResourceMarketService = null;
        const task = planMobileWorkerEnergyTask(f.second);
        assert.ok(!task || task.type === 'WAIT_SUPPLY', 'legacy writer must not return an unreserved withdrawal');
        assert.equal(JSON.stringify(f.book.reservations.supply), before);
    });
}

test('storage_quantity_legacy_planner_without_market_keeps_existing_fallback', async () => {
    const f = await fixture();
    const { planMobileWorkerEnergyTask } = await import('../services/ResourceMarketService.js');
    global.ResourceMarketService = null;
    global.ResourceMarket = {};
    const task = planMobileWorkerEnergyTask(f.first);
    assert.equal(task.type, 'WITHDRAW');
    assert.equal(task.targetId, 'HomeSink');
});

test('storage_quantity_remote_context_never_joins_shared_claims', async () => {
    const f = await fixture();
    const task = { type: 'WITHDRAW', targetId: 'HomeSink', resourceType: RESOURCE_ENERGY, amount: 100 };
    assert.equal(f.feedback.reserveForTask(f.book, 'supply', f.storage, 100, f.first, task, { remoteId: 'W1N1:W1N2' }), true);
    assert.equal(f.owners()[0].allocationMode, undefined);
    assert.equal(f.request(f.second).mode, 'unavailable');
});

for (const kind of ['dropped', 'container', 'terminal']) {
    test('storage_quantity_other_supplies_remain_exclusive_' + kind, async () => {
        const f = await fixture();
        if (kind === 'dropped') f.book.supplies = [f.drop];
        else f.homeSink.structureType = kind;
        assert.equal(f.request(f.first).mode, 'self_fetch');
        assert.equal(f.request(f.second).mode, 'unavailable');
        assert.equal(f.owners()[0].allocationMode, undefined);
    });
}

test('storage_quantity_other_resource_claim_does_not_hide_energy', async () => {
    const f = await fixture();
    f.book.reservations.supply['supply:HomeSink:U'] = {
        amount: 50, expiresAt: 105, owners: { old: { targetId: 'HomeSink', resourceType: 'U', amount: 50 } }
    };
    assert.equal(f.request(f.first).mode, 'self_fetch');
});

test('storage_quantity_missing_target_has_no_available_stock_or_new_owner', async () => {
    const f = await fixture();
    delete f.objects.HomeSink;
    assert.equal(f.request(f.first).mode, 'unavailable');
    assert.equal(f.owners().length, 0);
});

for (const reason of ['cancel', 'dead', 'replace']) {
    test('storage_quantity_release_only_one_owner_' + reason, async () => {
        const f = await fixture();
        f.request(f.first);
        f.request(f.second);
        const survivingId = f.second.memory.taskMeta.logisticsReservation.reservationId;
        if (reason === 'dead') delete Game.creeps.First;
        else if (reason === 'replace') f.metadata.assignTask(f.first, { type: 'MOVE_TO', pos: { x: 30, y: 23, roomName: 'W1N1' } });
        else f.metadata.clearTaskState(f.first, 'test_cancel');
        f.market.cleanup();
        assert.deepEqual(f.owners().map(owner => owner.reservationId), [survivingId]);
        f.market.cleanup();
        assert.equal(f.owners().length, 1);
        assert.equal(f.market.getAvailableSupplyAmount(f.book, f.storage), 999650);
    });
}

test('storage_quantity_ok_waits_for_next_tick_and_matches_actual_store_deltas', async () => {
    const f = await fixture(1000);
    const result = f.request(f.first);
    let amountSent;
    f.first.withdraw = (target, resource, amount) => { amountSent = amount; return OK; };
    f.ActionParser.run(f.first);
    assert.equal(amountSent, result.task.amount);
    f.market.cleanup();
    assert.equal(f.owners()[0].status, 'awaiting_confirmation');
    assert.equal(f.book.stats.confirmedPickupAmount || 0, 0);
    Game.time++;
    f.first.store.energy = 100;
    f.homeSink.store.energy = 900;
    f.market.cleanup();
    assert.equal(f.owners().length, 0);
    assert.equal(f.book.stats.confirmedPickupAmount, 100);
    f.market.cleanup();
    assert.equal(f.book.stats.confirmedPickupAmount, 100);
});

test('storage_quantity_concurrent_store_deltas_stay_unknown_and_release_owners', async () => {
    const f = await fixture(1000);
    f.request(f.first);
    f.request(f.second);
    f.ActionParser.run(f.first);
    f.ActionParser.run(f.second);
    f.market.cleanup();
    assert.equal(f.owners().length, 2);
    assert.ok(f.owners().every(owner => owner.status === 'awaiting_confirmation'));
    Game.time++;
    f.first.store.energy = 100;
    f.second.store.energy = 100;
    f.homeSink.store.energy = 800;
    f.market.cleanup();
    assert.equal(f.owners().length, 0);
    assert.equal(f.book.stats.confirmationUnknown, 2);
    assert.equal(f.book.stats.confirmedPickupAmount || 0, 0);
    f.market.cleanup();
    assert.equal(f.book.stats.confirmationUnknown, 2);
});

test('storage_quantity_global_reset_preserves_claims_and_metadata', async () => {
    const f = await fixture();
    f.request(f.first);
    f.request(f.second);
    const ids = f.owners().map(owner => owner.reservationId).sort();
    global.Memory = JSON.parse(JSON.stringify(Memory));
    for (const creep of Object.values(Game.creeps)) creep.memory = Memory.creeps[creep.name];
    f.market = new f.market.constructor('ResourceMarket');
    f.market.init();
    f.market.analyze();
    f.book = global.ResourceMarket.W1N1;
    assert.deepEqual(f.owners().map(owner => owner.reservationId).sort(), ids);
    assert.equal(f.market.getAvailableSupplyAmount(f.book, f.storage), 999550);
    f.metadata.clearTaskState(f.first, 'test_cancel_after_reset');
    f.market.cleanup();
    assert.deepEqual(f.owners().map(owner => owner.reservationId), [ids[1]]);
});

test('storage_quantity_bounded_renewal_keeps_original_deadline', async () => {
    const f = await fixture();
    const { default: TaskGuard } = await import('../core/TaskGuard.js');
    f.request(f.first);
    Game.time = 106;
    f.market.cleanup();
    assert.equal(f.owners()[0].maxExpiresAt, 150);
    assert.equal(f.owners()[0].expiresAt, 111);
    Game.time = 150;
    f.market.cleanup();
    assert.equal(f.owners()[0].expiresAt, 150);
    Game.time = 151;
    assert.equal(TaskGuard.validate(f.first, f.first.memory.task).valid, false);
    f.market.cleanup();
    assert.equal(f.owners().length, 0);
});

test('storage_quantity_owner_cap_still_blocks_the_201st_claim', async () => {
    const f = await fixture();
    for (let i = 0; i < 200; i++) assert.equal(f.request(f.worker('Worker' + i), 1).mode, 'self_fetch');
    assert.equal(f.request(f.worker('Overflow'), 1).mode, 'unavailable');
    assert.equal(f.owners().length, 200);
    assert.ok(f.book.stats.reservationBlocked > 0);
});

test('storage_quantity_writer_rejects_amount_above_actor_capacity', async () => {
    const f = await fixture();
    const task = { type: 'WITHDRAW', targetId: 'HomeSink', resourceType: RESOURCE_ENERGY, amount: 101 };
    assert.equal(f.feedback.reserveForTask(f.book, 'supply', f.storage, 101, f.first, task), false);
    assert.equal(f.owners().length, 0);
});

test('storage_quantity_writer_rejects_resource_mismatch', async () => {
    const f = await fixture();
    assert.equal(f.feedback.reserveForTask(f.book, 'supply', f.storage, 10, f.first,
        { type: 'WITHDRAW', targetId: 'HomeSink', resourceType: 'U', amount: 10 }), false);
});

test('storage_quantity_compatibility_anonymous_claim_is_exclusive_to_new_owners', async () => {
    const f = await fixture();
    const { planMobileWorkerEnergyTask } = await import('../services/ResourceMarketService.js');
    global.ResourceMarketService = null;
    assert.equal(planMobileWorkerEnergyTask(f.first).targetId, 'HomeSink');
    const record = JSON.stringify(f.book.reservations.supply);
    global.ResourceMarketService = f.market;
    assert.equal(f.request(f.second).mode, 'unavailable');
    assert.equal(JSON.stringify(f.book.reservations.supply), record);
});

for (const amount of [-100, NaN, Infinity, null, undefined]) {
    test('storage_quantity_malformed_anonymous_amount_cannot_increase_stock_' + amount, async () => {
        const f = await fixture(1000);
        f.book.reservations.supply[f.storage.id] = { amount, expiresAt: 105 };
        assert.equal(f.market.getAvailableSupplyAmount(f.book, f.storage), 0);
        assert.equal(f.request(f.first).mode, 'unavailable');
        assert.equal(f.owners().length, 0);
        Game.time = 106;
        assert.equal(f.request(f.first).mode, 'self_fetch');
    });
}

for (const change of ['not_owned', 'foreign_room', 'different_home_storage']) {
    test('storage_quantity_non_home_or_unowned_storage_keeps_exclusive_mode_' + change, async () => {
        const f = await fixture();
        if (change === 'not_owned') f.homeSink.my = false;
        if (change === 'foreign_room') f.homeSink.pos = new RoomPosition(31, 24, 'W1N2');
        if (change === 'different_home_storage') f.home.storage = { id: 'OtherStorage' };
        if (change === 'foreign_room') {
            assert.equal(f.request(f.first).mode, 'unavailable');
            assert.equal(f.owners().length, 0);
            return;
        }
        assert.equal(f.request(f.first).mode, 'self_fetch');
        assert.equal(f.owners()[0].allocationMode, undefined);
        assert.equal(f.request(f.second).mode, 'unavailable');
    });
}
