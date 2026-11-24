const assert = require('node:assert/strict');
const {before, test} = require('node:test');
const {actorId, spawnId, roomName, supplyRecord, version} = require('./helpers/local-spawn-supply-data.cjs');

let Observer;
let assignTask;
before(async () => {
    ({default: Observer} = await import('../services/LocalSpawnSupplyEvidenceService.js'));
    ({assignTask} = await import('../core/TaskMetadata.js'));
});

function world() {
    const {birth, frame} = supplyRecord();
    Object.assign(global, {OK: 0, EVENT_TRANSFER: 12, RESOURCE_ENERGY: 'energy', STRUCTURE_SPAWN: 'spawn',
        EmpireServicesVersion: version});
    let reads = 0;
    let used = 10;
    const events = [{event: EVENT_TRANSFER, objectId: actorId, data: {targetId: spawnId, amount: 100, resourceType: 'energy'}}];
    const room = {
        name: roomName, controller: {my: true},
        getEventLog() { reads++; return events; }
    };
    const actor = {
        id: actorId, my: true, name: birth.name, spawning: false, room, store: {energy: 0},
        memory: {
            localSpawnRequestId: birth.requestId, role: birth.role, quotaKey: birth.quotaKey, homeRoom: roomName,
            lastTaskClear: {
                tick: frame.action.tick, reason: 'transfer_completed', result: OK, taskType: 'TRANSFER', targetId: spawnId,
                logisticsReservation: {targetId: spawnId, resourceType: 'energy', side: 'demand', taskType: 'TRANSFER',
                    creepName: birth.name, roomName},
                logisticsObservation: {...frame.action.before}
            }
        }
    };
    const spawn = {id: spawnId, structureType: STRUCTURE_SPAWN, my: true, room, store: {energy: 200}};
    global.Game = {
        time: frame.tick, shard: {name: 'shard3'}, rooms: {[roomName]: room}, creeps: {[birth.name]: actor},
        getObjectById: id => id === spawnId ? spawn : null,
        cpu: {bucket: 10000, tickLimit: 500, getUsed: () => used}
    };
    global.Memory = {empire: {control: {policy: {spawnIntake: {localReplacementPilotRoom: roomName}}},
        localSpawnReceipts: {[birth.requestId]: birth}}};
    return {
        observer: new Observer('LocalSpawnSupplyEvidence'), room, actor, spawn, birth, events,
        addCpu: amount => { used += amount; }, reads: () => reads,
        store: () => Memory.empire.observations?.localSpawnSupply
    };
}

test('capture_before_reassignment_finishes_after_core_cleanup', () => {
    const f = world();
    f.observer.init();
    assert.equal(f.reads(), 0);
    assert.equal(f.store(), undefined);
    assignTask(f.actor, {type: 'WITHDRAW', targetId: 'storage'});
    assert.equal(f.actor.memory.lastTaskClear, undefined);
    f.addCpu(20);
    f.observer.cleanup();
    assert.equal(f.reads(), 1);
    assert.deepEqual(f.store().records, [supplyRecord()]);
    assert.equal(f.actor.memory.task.type, 'WITHDRAW');
});

test('disabled_or_revoked_skips_native_read', () => {
    for (const duringInit of [true, false]) {
        const f = world();
        const intake = Memory.empire.control.policy.spawnIntake;
        if (duringInit) intake.localReplacementPilotRoom = null;
        f.observer.init();
        intake.localReplacementPilotRoom = null;
        f.observer.cleanup();
        assert.equal(f.store(), undefined);
        assert.equal(f.reads(), 0);
    }
});

test('scope_change_during_read_does_not_append', () => {
    const f = world();
    f.observer.init();
    f.room.getEventLog = () => {
        Memory.empire.control.policy.spawnIntake.localReplacementPilotRoom = null;
        return f.events;
    };
    f.observer.cleanup();
    assert.equal(f.store(), undefined);
});

test('missed_tick_or_changed_runtime_discards_candidate', () => {
    for (const change of [
        () => { Game.time++; },
        () => { global.EmpireServicesVersion = 'other'; },
        () => { Game.shard.name = 'shard2'; }
    ]) {
        const f = world();
        f.observer.init();
        change();
        f.observer.cleanup();
        assert.equal(f.reads(), 0);
        assert.equal(f.store(), undefined);
    }
});

test('foreign_or_ambiguous_logistics_never_records', () => {
    for (const change of [
        f => { f.actor.my = false; },
        f => { f.actor.memory.localSpawnRequestId = 'other'; },
        f => { f.birth.observeUntil = Game.time - 1; },
        f => { f.spawn.structureType = 'extension'; },
        f => { f.actor.memory.lastTaskClear.result = -9; },
        f => { f.actor.memory.lastTaskClear.logisticsReservation.resourceType = 'other'; },
        f => { f.actor.memory.lastTaskClear.logisticsReservation.side = 'supply'; },
        f => { f.actor.memory.lastTaskClear.logisticsReservation.creepName = 'other'; },
        f => { f.events.push({event: EVENT_TRANSFER, objectId: spawnId, data: {targetId: actorId, amount: 1, resourceType: 'energy'}}); },
        f => { f.events.length = 0; },
        f => { f.events.push(null); },
        f => { f.events.push(...Array.from({length: 128}, () => ({event: 1, objectId: actorId}))); },
        f => { f.room.getEventLog = undefined; }
    ]) {
        const f = world();
        change(f);
        f.observer.init();
        f.observer.cleanup();
        assert.equal(f.store(), undefined);
    }
});

test('soft_budget_stops_before_native_read_or_persistence', () => {
    {
        const f = world();
        Game.cpu.bucket = 4999;
        f.observer.init();
        f.observer.cleanup();
        assert.equal(f.reads(), 0);
    }
    {
        const f = world();
        f.observer.init();
        f.room.getEventLog = () => { f.addCpu(2); return f.events; };
        f.observer.cleanup();
        assert.equal(f.store(), undefined);
    }
});

test('bounded_store_does_not_overwrite_on_fault', () => {
    for (const current of [
        {schemaVersion: 5, records: []},
        {schemaVersion: 1, records: Array.from({length: 16}, (_, index) => {
            const record = supplyRecord();
            record.birth.requestId = 'REQ_SPAWN_2000_' + (index + 1);
            return record;
        })}
    ]) {
        const f = world();
        Memory.empire.observations = {localSpawnSupply: current};
        f.observer.init();
        f.observer.cleanup();
        assert.equal(f.store(), current);
    }
});

test('reset_preserves_first_record_and_failures_do_not_retry', () => {
    for (const afterWrite of [false, true]) {
        const f = world();
        let stored;
        let attempts = 0;
        Memory.empire.observations = Object.defineProperty({}, 'localSpawnSupply', {
            get: () => stored,
            set(value) { attempts++; if (afterWrite) stored = value; throw Error('indeterminate'); }
        });
        f.observer.init();
        assert.doesNotThrow(() => f.observer.cleanup());
        f.observer.init();
        f.observer.cleanup();
        assert.equal(attempts, 1);
        assert.equal(stored?.records.length ?? 0, afterWrite ? 1 : 0);
        Memory.empire.observations = JSON.parse(JSON.stringify({localSpawnSupply: stored}));
        Game.time++;
        const next = new Observer('LocalSpawnSupplyEvidence');
        next.init();
        next.cleanup();
        assert.deepEqual(f.store(), stored);
    }
});
