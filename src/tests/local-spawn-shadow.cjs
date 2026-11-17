const assert = require('node:assert/strict');
const {before, test} = require('node:test');
const {installGlobals, store} = require('./helpers/remote-mining-fixture.cjs');

const roomName = 'W49N41';
let EventBus;
let Bureau;

before(async () => {
    installGlobals();
    ({default: EventBus} = await import('../core/EventBus.js'));
    ({default: Bureau} = await import('../services/SpawnBureauService.js'));
});

function world({energy = 550, capacity = 550, storage = true, recovery = 'normal',
    controller = 5000, population = {}, sourceIds = ['a'], sites = [], maintenancePlan} = {}) {
    const sources = Object.fromEntries(sourceIds.map((id, index) => [
        id, {id, pos: new RoomPosition(10 + index * 4, 10, roomName)}
    ]));
    const room = {
        name: roomName,
        energyAvailable: energy,
        energyCapacityAvailable: capacity,
        storage: storage ? {store: store(10000)} : null,
        controller: {my: true, level: 6, ticksToDowngrade: controller},
        find: type => type === FIND_CONSTRUCTION_SITES ? sites : []
    };
    const spawn = {name: 'Spawn1', room, spawning: null};
    global.Game = {
        time: 2000, rooms: {[roomName]: room}, spawns: {Spawn1: spawn}, creeps: {},
        map: {getRoomTerrain: () => ({get: () => 0})},
        getObjectById: id => sources[id] || null
    };
    global.Memory = {
        rooms: {[roomName]: {maintenancePlan}},
        creeps: {},
        empire: {spawningCreeps: {}}
    };
    global.RoomPhase = {[roomName]: {
        phase: storage ? 'storage' : 'early', hasStorage: storage, recovery: {mode: recovery}
    }};
    global.RoomCache = {[roomName]: {sources: sourceIds}};
    global.RoomGovernor = {};
    global.SpawnDemands = {};
    EventBus.topics = {};
    EventBus.beginTick();
    for (const [role, count] of Object.entries(population)) {
        for (let index = 0; index < count; index++) {
            const memory = {role, homeRoom: roomName, sourceId: role === 'miner' ? sourceIds[0] : undefined};
            const required = role === 'hauler' ? CARRY : WORK;
            const body = Array.from({length: role === 'miner' ? 5 : 1}, () => ({type: required, hits: 100}));
            Game.creeps[role + index] = {room, memory, ticksToLive: 1000, body};
        }
    }
    return {room, spawn};
}

function compare(room) {
    const bureau = new Bureau('SpawnBureau');
    const state = {intents: [], blockedDemands: []};
    const budgets = new Map();
    const build = bureau.buildIntent.bind(bureau);
    bureau.buildIntent = (sourceRoom, sourceState, intent) => {
        budgets.set(intent.quotaKey, intent.energyCapacity ?? (sourceRoom.energyCapacityAvailable || sourceRoom.energyAvailable || 0));
        return build(sourceRoom, sourceState, intent);
    };

    assert.equal(typeof bureau.replayLocalSpawnDecisions, 'function');
    const before = JSON.stringify(Memory);
    const replay = bureau.replayLocalSpawnDecisions(room);
    assert.equal(JSON.stringify(Memory), before, 'shadow may not normalize or save Memory');
    assert.deepEqual(EventBus.topics, {}, 'shadow may not publish');
    bureau.addEconomicIntents(room, state);
    const expected = state.intents.map(intent => ({
        ...intent,
        energyLimit: budgets.get(intent.quotaKey),
        cost: intent.body.reduce((sum, part) => sum + BODYPART_COST[part], 0)
    }));
    assert.deepEqual(replay.intents, expected);
    assert.deepEqual(replay.blockedDemands, state.blockedDemands);
    return replay;
}

test('local shadow preserves emergency miner priority, funded size and normal fallback', () => {
    for (const [energy, priority, energyLimit, cost] of [[149, 90, 550, 550], [150, 120, 150, 150]]) {
        const {room} = world({energy, population: {hauler: 3, upgrader: 2}});
        const {intents} = compare(room);
        assert.equal(intents[0].role, 'miner');
        assert.equal(intents[0].priority, priority);
        assert.equal(intents[0].energyLimit, energyLimit);
        assert.equal(intents[0].cost, cost);
    }
});

test('haulers use current energy for the first replacement and room capacity for later coverage', () => {
    const denied = compare(world({energy: 99, population: {miner: 1, upgrader: 2}}).room);
    assert.deepEqual(denied.blockedDemands, [
        {role: 'hauler', quotaKey: 'hauler:W49N41:core', reason: 'no_valid_body'}
    ]);
    for (const [count, priority, limit] of [[0, 90, 100], [1, 45, 550]]) {
        const {room} = world({energy: 100, population: {miner: 1, hauler: count, upgrader: 2}});
        const {intents} = compare(room);
        assert.equal(intents[0].role, 'hauler');
        assert.equal(intents[0].priority, priority);
        assert.equal(intents[0].energyLimit, limit);
    }
});

test('local shadow retains source order and treats unknown spawning body conservatively', () => {
    const {room, spawn} = world({energy: 550, sourceIds: ['a', 'b'], population: {hauler: 3, upgrader: 2}});
    assert.deepEqual(compare(room).intents.map(intent => [intent.memory.sourceId, intent.priority]), [['a', 120], ['b', 120]]);
    spawn.spawning = {name: 'PendingMiner'};
    Memory.creeps.PendingMiner = {role: 'miner', homeRoom: roomName, sourceId: 'a'};
    assert.deepEqual(compare(room).intents.map(intent => [intent.memory.sourceId, intent.priority]), [['b', 80]]);
});

test('Controller urgency enters below 5000, retaining recovery precedence and affordability', () => {
    for (const [controller, roles] of [[5000, ['miner']], [4999, ['miner', 'upgrader']]]) {
        const {room} = world({energy: 210, controller, recovery: 'miner_gap', population: {hauler: 3}});
        const {intents} = compare(room);
        assert.deepEqual(intents.map(intent => intent.role), roles);
        assert.equal(intents[0].priority, 120);
        if (controller === 4999) {
            assert.equal(intents[1].priority, 60);
            assert.equal(intents[1].energyLimit, 210);
        }
    }
});

test('ordinary work yields in recovery while essential construction and urgent maintenance use current energy', () => {
    const routine = {targets: [{executor: 'repairer', urgency: 'routine'}]};
    const urgent = {targets: [{executor: 'repairer', urgency: 'urgent'}]};
    const tower = {structureType: STRUCTURE_TOWER};
    const spawnSite = {structureType: STRUCTURE_SPAWN};
    const core = {miner: 1, hauler: 3, upgrader: 2};

    const normal = world({energy: 210, sites: [tower], maintenancePlan: routine, population: core});
    assert.deepEqual(compare(normal.room).intents.map(row => [row.role, row.priority, row.energyLimit]),
        [['builder', 55, 550], ['repairer', 44, 550]]);
    const restricted = world({energy: 210, sites: [tower], maintenancePlan: routine, population: core, recovery: 'reserve_low'});
    assert.deepEqual(compare(restricted.room).intents, []);
    const essential = world({energy: 210, sites: [spawnSite], maintenancePlan: urgent, population: core, recovery: 'reserve_low'});
    assert.deepEqual(compare(essential.room).intents.map(row => [row.role, row.priority, row.energyLimit]),
        [['builder', 55, 210], ['repairer', 58, 210]]);
});

test('bootstrap postpones a second miner until transport can be covered', () => {
    const {room} = world({energy: 100, capacity: 300, storage: false, sourceIds: ['a', 'b'], population: {miner: 1}});
    const {intents} = compare(room);
    assert.equal(intents.some(intent => intent.role === 'miner'), false);
    assert.equal(intents[0].role, 'hauler');
});

test('only affordable planned roles unlock the ordinary post-replacement chain', () => {
    const sites = [{structureType: STRUCTURE_TOWER}];
    const {room} = world({energy: 99, sites, population: {miner: 1}});
    const blocked = compare(room);
    assert.deepEqual(blocked.intents, []);
    assert.deepEqual(blocked.blockedDemands.map(row => row.role), ['hauler']);

    room.energyAvailable = 100;
    const funded = compare(room);
    assert.deepEqual(funded.intents.map(row => [row.role, row.priority, row.energyLimit]),
        [['hauler', 90, 100], ['upgrader', 60, 550], ['builder', 55, 550]]);
});

test('custom recovery controls and maintenance backlog match the old room policy', () => {
    const maintenancePlan = {targets: Array.from({length: 4}, () => ({executor: 'repairer', urgency: 'urgent'}))};
    const {room} = world({energy: 300, recovery: 'reserve_low', controller: 5499,
        population: {miner: 1, hauler: 3, repairer: 1}, maintenancePlan});
    Memory.empire.control = {policy: {
        economyRecovery: {enabled: false},
        capabilityControl: {controllerEmergencyTicks: 5500}
    }};
    assert.deepEqual(compare(room).intents.map(row => [row.role, row.priority, row.energyLimit]),
        [['upgrader', 60, 300], ['repairer', 52, 550]]);
});

test('ordinary SpawnBureau tick publishes only legacy requests', () => {
    const {room} = world({energy: 150, population: {hauler: 3, upgrader: 2}});
    const expected = compare(room);
    const bureau = new Bureau('SpawnBureau');
    bureau.replayLocalSpawnDecisions = () => assert.fail('legacy tick tried to run the separate replay');
    bureau.analyze();
    assert.deepEqual(EventBus.topics.REQ_SPAWN.map(event => ({
        role: event.data.role, priority: event.priority, expiry: event.expireAt
    })), expected.intents.map(intent => ({role: intent.role, priority: intent.priority, expiry: Game.time + 1})));
});
