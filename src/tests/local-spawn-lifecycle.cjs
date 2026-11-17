const assert = require('node:assert/strict');
const {before, test} = require('node:test');
const {installGlobals, store} = require('./helpers/remote-mining-fixture.cjs');

const roomName = 'W49N41';
const quotaKey = 'hauler:W49N41:core';
let EventBus, SpawnService, Bureau, RoomPhase, ResourceMarket, ActionParser;

before(async () => {
    installGlobals();
    ({default: EventBus} = await import('../core/EventBus.js'));
    ({default: SpawnService} = await import('../services/SpawnService.js'));
    ({default: Bureau} = await import('../services/SpawnBureauService.js'));
    ({default: RoomPhase} = await import('../services/RoomPhaseService.js'));
    ({default: ResourceMarket} = await import('../services/ResourceMarketService.js'));
    ({default: ActionParser} = await import('../core/ActionParser.js'));
});

function world({pilot = true} = {}) {
    const room = {
        name: roomName, energyAvailable: 200, energyCapacityAvailable: 550,
        controller: {my: true, level: 6, ticksToDowngrade: 12000},
        storage: {store: store(10000)}, find: () => []
    };
    const calls = [];
    const spawn = {
        name: 'Spawn1', room, spawning: null, result: OK,
        spawnCreep(body, name, options) {
            calls.push({body, name, memory: options.memory});
            if (this.result instanceof Error) throw this.result;
            return this.result;
        }
    };
    global.Game = {time: 2000, rooms: {[roomName]: room}, spawns: {Spawn1: spawn}, creeps: {}};
    global.Memory = {creeps: {}, rooms: {[roomName]: {}}, empire: {control: {policy: {
        spawnIntake: {localReplacementPilotRoom: pilot ? roomName : null}
    }}}};
    global.RoomCache = {[roomName]: {sources: []}};
    global.RoomGovernor = {};
    global.SpawnDemands = {};
    Game.creeps.Miner = {room, memory: {role: 'miner', homeRoom: roomName},
        body: [{type: WORK, hits: 100}], ticksToLive: 1000};
    EventBus.topics = {};
    EventBus.clearSubscribers();
    EventBus.beginTick();
    return {room, spawn, calls, service: new SpawnService('Spawn')};
}

function offer() {
    new RoomPhase('RoomPhase').analyze();
    new Bureau('SpawnBureau').analyze();
    const event = EventBus.topics.REQ_SPAWN.find(row => row.data.memory.quotaKey === quotaKey);
    assert.ok(event);
    return event;
}

function resetService() {
    global.Memory = JSON.parse(JSON.stringify(Memory));
    EventBus.topics = {};
    EventBus.clearSubscribers();
    EventBus.beginTick();
    const service = new SpawnService('Spawn');
    service.init();
    return service;
}

const receipts = () => Memory.empire.localSpawnReceipts;

test('single-room pilot follows the same request from Spawn admission through native birth', () => {
    const {room, spawn, calls, service} = world();
    service.init();
    const request = offer();
    assert.equal(request.data.localReplacementPilot, true);
    assert.equal(request.expireAt, Game.time + 1);
    EventBus.dispatch();
    assert.equal(receipts()[request.id].state, 'admitted');
    assert.equal(service.handleSpawnRequest(request), true);
    service.run();
    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.equal(call.memory.localSpawnRequestId, request.id);
    assert.equal(receipts()[request.id].state, 'spawn_accepted');
    assert.equal(receipts()[request.id].expireAt, request.expireAt);
    assert.equal(Memory.empire.spawnRequestReceipts[request.id].name, call.name);

    Game.time++;
    spawn.spawning = {name: call.name};
    resetService();
    assert.equal(receipts()[request.id].state, 'spawning');
    new RoomPhase('RoomPhase').analyze();
    assert.equal(global.RoomPhase[roomName].recovery.coreUsable.hauler, 0);
    assert.equal(global.RoomPhase[roomName].recovery.coreUpcoming.hauler, 1);

    Game.time += call.body.length * CREEP_SPAWN_TIME;
    spawn.spawning = null;
    Game.creeps[call.name] = {room, memory: call.memory, ticksToLive: 1500,
        body: call.body.map(type => ({type, hits: 100}))};
    resetService().cleanup();
    new RoomPhase('RoomPhase').analyze();
    assert.equal(receipts()[request.id].state, 'born');
    assert.equal(global.RoomPhase[roomName].recovery.coreUsable.hauler, 1);
    assert.equal(Memory.empire.spawningCreeps[call.name], undefined);
});

test('busy Spawn creates no receipt and the original event may use its expiry tick only', () => {
    const {spawn, service, calls} = world();
    spawn.spawning = {name: 'Busy'};
    service.init();
    const request = offer();
    EventBus.dispatch();
    assert.equal(receipts()?.[request.id], undefined);
    assert.equal(global.SpawnIntake[roomName].lastReason, 'no_idle_spawn');

    Game.time = request.expireAt;
    spawn.spawning = null;
    EventBus.beginTick();
    service.init();
    EventBus.dispatch();
    service.run();
    assert.equal(calls.length, 1);
    assert.equal(receipts()[request.id].admittedAt, request.expireAt);

    Game.time++;
    service.init();
    service.handleSpawnRequest(request);
    service.run();
    assert.equal(calls.length, 1);
});

test('unknown call survives reset and blocks a fresh same-quota event through policy rollback', () => {
    const {spawn, service, calls} = world();
    spawn.result = new Error('interrupted after engine call began');
    service.init();
    const request = offer();
    EventBus.dispatch();
    service.run();
    assert.equal(receipts()[request.id].state, 'unknown');
    assert.equal(calls.length, 1);
    assert.equal(Memory.empire.spawnRequestReceipts[request.id], undefined);

    Game.time++;
    Memory.empire.control.policy.spawnIntake.localReplacementPilotRoom = null;
    const restored = resetService();
    const replacement = offer();
    assert.notEqual(replacement.id, request.id);
    assert.equal(replacement.data.localReplacementPilot, undefined);
    EventBus.dispatch();
    restored.run();
    assert.equal(calls.length, 1);
    assert.equal(global.SpawnIntake[roomName].reasons.local_spawn_in_flight, 1);
    assert.equal(receipts()[request.id].state, 'unknown');
});

test('known failure and revocation before call retain separate outcomes', () => {
    const {spawn, service, calls} = world();
    spawn.result = ERR_BUSY;
    service.init();
    const failed = offer();
    EventBus.dispatch();
    service.run();
    assert.equal(receipts()[failed.id].state, 'failed');
    assert.equal(receipts()[failed.id].result, ERR_BUSY);
    assert.equal(EventBus.topics.REQ_SPAWN.some(row => row.data.requestId === failed.id), false);

    Game.time++;
    const restored = resetService();
    const revoked = offer();
    EventBus.dispatch();
    Memory.empire.control.policy.spawnIntake.localReplacementPilotRoom = null;
    restored.run();
    assert.equal(receipts()[revoked.id].state, 'not_called');
    assert.equal(calls.length, 1);
});

test('a reset after the call marker never reissues the same request', () => {
    const {service, calls} = world();
    service.init();
    const request = offer();
    EventBus.dispatch();
    const receipt = receipts()[request.id];
    receipt.state = 'calling';
    receipt.callStartedAt = Game.time;
    Game.time++;
    const restored = resetService();
    assert.equal(receipts()[request.id].state, 'unknown');
    assert.equal(restored.handleSpawnRequest(request), true);
    restored.run();
    assert.equal(calls.length, 0);
});

test('newborn replacement uses the real market and action path to restore Spawn energy', () => {
    const {room, spawn, calls, service} = world();
    service.init();
    const request = offer();
    EventBus.dispatch();
    service.run();
    const [{name, body, memory}] = calls;

    Game.time += body.length * CREEP_SPAWN_TIME;
    spawn.id = 'spawn';
    spawn.structureType = STRUCTURE_SPAWN;
    spawn.pos = new RoomPosition(12, 10, roomName);
    spawn.store = store(100, 300);
    room.energyAvailable = 100;
    room.storage.id = 'storage';
    room.storage.structureType = STRUCTURE_STORAGE;
    room.storage.pos = new RoomPosition(10, 10, roomName);
    room.find = (type, options) => {
        const structures = [FIND_STRUCTURES, FIND_MY_STRUCTURES].includes(type) ? [spawn, room.storage] : [];
        return options?.filter ? structures.filter(options.filter) : structures;
    };
    Game.getObjectById = id => id === spawn.id ? spawn : (id === room.storage.id ? room.storage : null);
    let nextTick;
    const creep = {
        name, room, memory, body: body.map(type => ({type, hits: 100})), ticksToLive: 1500,
        pos: new RoomPosition(11, 10, roomName), store: store(0, 100),
        withdraw(target, resource, amount) {
            assert.equal(target.id, 'storage');
            assert.equal(resource, RESOURCE_ENERGY);
            nextTick = () => { target.store.energy -= amount; this.store.energy += amount; };
            return OK;
        },
        transfer(target, resource, amount) {
            assert.equal(target.id, 'spawn');
            assert.equal(resource, RESOURCE_ENERGY);
            const applied = amount ?? this.store.energy;
            nextTick = () => {
                target.store.energy += applied;
                room.energyAvailable += applied;
                this.store.energy -= applied;
            };
            return OK;
        }
    };
    Game.creeps[name] = creep;
    resetService().cleanup();
    assert.equal(receipts()[request.id].state, 'born');
    new RoomPhase('RoomPhase').analyze();
    assert.equal(global.RoomPhase[roomName].recovery.coreUsable.hauler, 1);
    assert.equal(global.RoomPhase[roomName].recovery.mode, 'spawn_energy');

    const market = new ResourceMarket('ResourceMarket');
    market.init();
    assert.equal(market.assignHauler(creep), true);
    assert.equal(creep.memory.task.type, 'WITHDRAW');
    ActionParser.run(creep);
    assert.equal(creep.store.energy, 0);
    Game.time++;
    nextTick();
    assert.equal(creep.store.energy, 100);
    market.init();
    assert.equal(market.assignHauler(creep), true);
    assert.equal(creep.memory.task.type, 'TRANSFER');
    ActionParser.run(creep);
    assert.equal(spawn.store.energy, 100);
    Game.time++;
    nextTick();
    assert.equal(spawn.store.energy, 200);
    assert.equal(creep.store.energy, 0);
});

test('default-off or another owned room preserves the original path without creating pilot history', () => {
    for (const otherRoom of [null, 'W50N41']) {
        const {service, calls} = world({pilot: false});
        Memory.empire.control.policy.spawnIntake.localReplacementPilotRoom = otherRoom;
        service.init();
        const request = offer();
        assert.equal(request.data.localReplacementPilot, undefined);
        EventBus.dispatch();
        service.run();
        assert.equal(calls.length, 1);
        assert.equal(receipts(), undefined);
        assert.equal(calls[0].memory.localSpawnRequestId, undefined);
    }
});

test('the allocated body and actor binding are stable if the queued event changes', () => {
    const {service, calls} = world();
    service.init();
    const request = offer();
    const original = [...request.data.body];
    EventBus.dispatch();
    request.data.body.push(WORK);
    request.data.memory.role = 'builder';
    request.expireAt += 100;
    service.run();
    assert.deepEqual(calls[0].body, original);
    assert.equal(calls[0].memory.role, 'hauler');
    assert.equal(receipts()[request.id].cost, 200);
    assert.equal(Memory.empire.spawnRequestReceipts[request.id].expireAt, Game.time + 1);
});

test('a readback-bound birth can resolve unknown without inventing an API result', () => {
    const {room, spawn, service, calls} = world();
    spawn.result = new Error('no confirmed result');
    service.init();
    const request = offer();
    EventBus.dispatch();
    service.run();
    const [{name, body, memory}] = calls;
    Game.time++;
    Game.creeps[name] = {room, memory: {...memory, localSpawnRequestId: 'different-request'}};
    resetService();
    assert.equal(receipts()[request.id].state, 'unknown');

    Game.time++;
    Game.creeps[name] = {room, memory, body: body.map(type => ({type, hits: 100})), ticksToLive: 1500};
    resetService();
    assert.equal(receipts()[request.id].state, 'born');
    assert.equal(receipts()[request.id].result, undefined);
    assert.equal(Memory.empire.spawnRequestReceipts[request.id], undefined);
    assert.equal(calls.length, 1);
});
