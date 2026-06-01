const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertFile(relativePath) {
    const fullPath = path.join(root, relativePath);
    assert.ok(fs.existsSync(fullPath), `${relativePath} should exist`);
    return read(relativePath);
}

function assertContains(source, text, label) {
    assert.ok(source.includes(text), `${label} should include ${text}`);
}

const expectedFiles = [
    'src/main.js',
    'src/core/EventBus.js',
    'src/core/BaseService.js',
    'src/core/TaskTypes.js',
    'src/core/ActionParser.js',
    'src/core/BodyBuilder.js',
    'src/services/RoomCacheService.js',
    'src/services/SpawnService.js',
    'src/services/LogisticsService.js',
    'src/services/SecurityService.js',
    'src/services/TowerDefenseService.js',
    'src/services/LabService.js',
    'src/services/MarketService.js',
    'src/services/RemoteMiningService.js',
    'src/strategies/MinerStrategyService.js',
    'src/strategies/BuilderStrategyService.js',
    'src/strategies/HaulerStrategyService.js',
    'src/strategies/UpgraderStrategyService.js',
    'src/strategies/DefenderStrategyService.js',
    'src/planning/BaseBlueprint.js',
    'src/planning/CityPlannerService.js',
    'src/planning/RoadPlannerService.js',
    'src/config/MemoryConfig.js'
];

for (const file of expectedFiles) {
    assertFile(file);
}

const actionParser = read('src/core/ActionParser.js');
for (const taskType of ['HARVEST', 'TRANSFER', 'WITHDRAW', 'PICKUP', 'BUILD', 'UPGRADE', 'ATTACK', 'RESERVE', 'MOVE_TO']) {
    assertContains(actionParser, `case TaskTypes.${taskType}`, `ActionParser ${taskType}`);
}

const main = read('src/main.js');
for (const phase of ['init();', 'analyze();', 'EventBus.dispatch();', 'run();', 'cleanup();']) {
    assertContains(main, phase, 'main lifecycle');
}

const distPath = path.join(root, 'dist', 'main.js');
if (fs.existsSync(distPath)) {
    const dist = read('dist/main.js');
    assert.ok(!dist.includes("require('src/"), 'dist/main.js should not keep src absolute requires');
    assert.ok(!dist.includes('require("src/'), 'dist/main.js should not keep src absolute requires');
}

async function runBehaviorChecks() {
    global.OK = 0;
    global.ERR_FULL = -8;
    global.ERR_NOT_ENOUGH_RESOURCES = -6;
    global.ERR_NOT_IN_RANGE = -9;
    global.ERR_INVALID_TARGET = -7;
    global.ERR_INVALID_ARGS = -10;
    global.ERR_NO_BODYPART = -12;
    global.ERR_NO_PATH = -2;
    global.RESOURCE_ENERGY = 'energy';
    global.WORK = 'work';
    global.CARRY = 'carry';
    global.MOVE = 'move';
    global.BODYPART_COST = { work: 100, carry: 50, move: 50 };
    global._ = {
        filter: (collection, predicate) => Object.values(collection).filter(predicate)
    };
    global.FIND_MY_STRUCTURES = 1;
    global.FIND_DROPPED_RESOURCES = 2;
    global.FIND_SOURCES = 3;
    global.FIND_STRUCTURES = 4;
    global.FIND_CONSTRUCTION_SITES = 5;
    global.FIND_MY_SPAWNS = 6;
    global.STRUCTURE_SPAWN = 'spawn';
    global.STRUCTURE_EXTENSION = 'extension';
    global.STRUCTURE_TOWER = 'tower';
    global.STRUCTURE_STORAGE = 'storage';
    global.STRUCTURE_ROAD = 'road';
    global.STRUCTURE_CONTAINER = 'container';
    global.STRUCTURE_WALL = 'constructedWall';
    global.STRUCTURE_RAMPART = 'rampart';
    global.TERRAIN_MASK_WALL = 1;
    global.RoomPosition = class RoomPosition {
        constructor(x, y, roomName) {
            this.x = x;
            this.y = y;
            this.roomName = roomName;
        }
    };

    const { default: ActionParser } = await import('../core/ActionParser.js');
    const { default: BodyBuilder } = await import('../core/BodyBuilder.js');
    const { default: EventBus } = await import('../core/EventBus.js');
    const { default: MinerStrategyService } = await import('../strategies/MinerStrategyService.js');
    const { default: HaulerStrategyService } = await import('../strategies/HaulerStrategyService.js');
    const { default: UpgraderStrategyService } = await import('../strategies/UpgraderStrategyService.js');
    const { default: BuilderStrategyService } = await import('../strategies/BuilderStrategyService.js');
    const { default: DefenderStrategyService } = await import('../strategies/DefenderStrategyService.js');
    const { default: MemoryConfig } = await import('../config/MemoryConfig.js');
    const { default: CityPlannerService } = await import('../planning/CityPlannerService.js');
    const { default: RoadPlannerService } = await import('../planning/RoadPlannerService.js');

    assertContains(main, 'UpgraderStrategyService', 'main services');

    const smallMinerBody = BodyBuilder.build('miner', {
        energyAvailable: 250,
        energyCapacityAvailable: 250
    }, { phase: 'early' });
    assert.deepStrictEqual(smallMinerBody.body, [WORK, WORK, MOVE], 'miner body should use stationary WORK/MOVE parts when possible');
    assert.strictEqual(smallMinerBody.capacity.workParts, 2, 'miner body should report work part capacity');
    const bootstrapMinerBody = BodyBuilder.build('miner', {
        energyAvailable: 100,
        energyCapacityAvailable: 300
    }, { phase: 'bootstrap' });
    assert.ok(bootstrapMinerBody.body.includes(WORK), 'miner body should never degrade to move-only');

    const earlyMinerLowEnergy = BodyBuilder.build('miner', {
        energyAvailable: 250,
        energyCapacityAvailable: 550
    }, { phase: 'early' });
    const earlyMinerHighEnergy = BodyBuilder.build('miner', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { phase: 'early' });
    assert.deepStrictEqual(earlyMinerLowEnergy.body, earlyMinerHighEnergy.body, 'same phase miner body should not change with current available energy');

    const largeHaulerBody = BodyBuilder.build('hauler', {
        energyAvailable: 500,
        energyCapacityAvailable: 500
    }, { phase: 'stable' });
    assert.ok(largeHaulerBody.capacity.carryParts > 2, 'hauler body should scale carry capacity with available energy');
    const upgraderBody = BodyBuilder.build('upgrader', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { phase: 'early' });
    assert.ok(upgraderBody.body.includes(WORK) && upgraderBody.body.includes(CARRY), 'upgrader body should include work and carry parts');

    global.Game = {
        time: 1,
        getObjectById: () => ({ id: 'source1', pos: {} })
    };

    const fullMiner = {
        memory: { task: { type: 'HARVEST', targetId: 'source1' } },
        harvest: () => ERR_FULL,
        pos: {}
    };
    ActionParser.run(fullMiner);
    assert.strictEqual(fullMiner.memory.task, null, 'HARVEST should end when creep store is full');

    let moveRange = null;
    const exactMoveCreep = {
        memory: { task: { type: 'MOVE_TO', pos: { x: 10, y: 10, roomName: 'W1N1' }, range: 0 } },
        pos: {
            inRangeTo: () => false
        },
        moveTo: (pos, opts) => {
            moveRange = opts.range;
            return OK;
        }
    };
    ActionParser.run(exactMoveCreep);
    assert.strictEqual(moveRange, 0, 'MOVE_TO should preserve explicit range 0 for planned positions');

    const noPathMoveCreep = {
        memory: { task: { type: 'MOVE_TO', pos: { x: 10, y: 10, roomName: 'W1N1' }, range: 0 } },
        pos: {
            inRangeTo: () => false
        },
        moveTo: () => ERR_NO_PATH
    };
    ActionParser.run(noPathMoveCreep);
    assert.strictEqual(noPathMoveCreep.memory.task, null, 'MOVE_TO should clear when no path can be found');

    const staleTransferCreep = {
        memory: { task: { type: 'TRANSFER', targetId: 'spawn1', resourceType: RESOURCE_ENERGY } },
        transfer: () => ERR_INVALID_TARGET,
        pos: { inRangeTo: () => true }
    };
    ActionParser.run(staleTransferCreep);
    assert.strictEqual(staleTransferCreep.memory.task, null, 'TRANSFER should clear stale invalid targets');

    const spawn = {
        id: 'spawn1',
        structureType: STRUCTURE_SPAWN,
        store: {
            getFreeCapacity: () => 300
        }
    };
    const room = {
        name: 'W1N1',
        find: () => [spawn]
    };
    const miner = {
        name: 'Miner1',
        room,
        memory: {
            role: 'miner',
            homeRoom: 'W1N1',
            sourceId: 'source1',
            miningPos: { x: 10, y: 10, roomName: 'W1N1' }
        },
        pos: {
            inRangeTo: () => true
        },
        store: {
            getFreeCapacity: () => 0,
            getUsedCapacity: () => 50
        }
    };

    const service = new MinerStrategyService('MinerStrategy');
    service.assignMiningTask(miner);
    assert.deepStrictEqual(miner.memory.task, {
        type: 'HARVEST',
        targetId: 'source1'
    }, 'stationary miner should keep harvesting instead of delivering energy');

    Game.getObjectById = (id) => {
        if (id === 'source1') return { id, pos: { x: 10, y: 10, roomName: 'W1N1' } };
        if (id === 'source2') return { id, pos: { x: 20, y: 20, roomName: 'W1N1' } };
        return null;
    };
    global.Game.creeps = {
        MinerA: { memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' }, body: [{ type: WORK }, { type: WORK }] }
    };
    global.RoomCache = {
        W1N1: {
            sources: ['source1', 'source2']
        }
    };
    const assignedSource = service.pickSource(miner);
    assert.strictEqual(assignedSource, 'source2', 'miner source assignment should prefer the less-covered source');

    EventBus.topics = {};
    Game.rooms = {
        W1N1: {
            name: 'W1N1',
            energyAvailable: 550,
            energyCapacityAvailable: 550
        }
    };
    Game.creeps = {
        MinerA: { memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' }, body: [{ type: WORK }, { type: WORK }] },
        MinerB: { memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' }, body: [{ type: WORK }, { type: WORK }] }
    };
    service.ensureMiners('W1N1');
    assert.ok(EventBus.topics.REQ_SPAWN && EventBus.topics.REQ_SPAWN.length === 1, 'miner spawning should cover uncovered sources, not just total miner count');
    assert.ok(!EventBus.topics.REQ_SPAWN[0].data.body.includes(CARRY), 'stationary miner spawn body should not include carry parts');

    EventBus.topics = {};
    Game.map = {
        getRoomTerrain: () => ({
            get: (x, y) => (x === 9 && y === 9 ? 0 : TERRAIN_MASK_WALL)
        })
    };
    Game.getObjectById = (id) => id === 'source1' ? { id, pos: { x: 10, y: 10, roomName: 'W1N1' } } : null;
    global.RoomCache = { W1N1: { sources: ['source1'] } };
    Game.creeps = {
        MinerA: {
            memory: {
                role: 'miner',
                homeRoom: 'W1N1',
                sourceId: 'source1',
                miningPos: { x: 9, y: 9, roomName: 'W1N1' }
            },
            body: [{ type: WORK }, { type: WORK }]
        }
    };
    service.ensureMiners('W1N1');
    assert.ok(!EventBus.topics.REQ_SPAWN, 'miner spawning should not exceed source open mining positions');

    Game.map = {
        getRoomTerrain: () => ({
            get: () => 0
        })
    };
    const blockedMiningPositions = service.getOpenMiningPositions({
        name: 'W1N1',
        find: (type) => type === FIND_STRUCTURES ? [{
            structureType: STRUCTURE_SPAWN,
            pos: { x: 9, y: 9 }
        }] : []
    }, { id: 'source1', pos: { x: 10, y: 10, roomName: 'W1N1' } });
    assert.ok(!blockedMiningPositions.some((pos) => pos.x === 9 && pos.y === 9), 'source mining positions should exclude blocking structures');

    const droppedEnergy = {
        id: 'drop1',
        resourceType: RESOURCE_ENERGY,
        amount: 100,
        pos: {
            getRangeTo: (pos) => Math.abs(pos.x - 10) + Math.abs(pos.y - 10)
        }
    };
    const haulerRoom = {
        name: 'W1N1',
        find: (type) => {
            if (type === FIND_DROPPED_RESOURCES) return [droppedEnergy];
            if (type === FIND_MY_STRUCTURES) return [spawn];
            return [];
        }
    };
    const hauler = {
        room: haulerRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        store: {
            getUsedCapacity: () => 0,
            getFreeCapacity: () => 150
        }
    };
    const haulerService = new HaulerStrategyService('HaulerStrategy');
    haulerService.assignFallbackTask(hauler);
    assert.deepStrictEqual(hauler.memory.task, {
        type: 'PICKUP',
        targetId: 'drop1'
    }, 'empty hauler should pick up source-adjacent dropped energy');

    EventBus.topics = {};
    Game.rooms.W1N1 = {
        name: 'W1N1',
        storage: null,
        energyAvailable: 500,
        energyCapacityAvailable: 500
    };
    Game.creeps = {};
    haulerService.ensureHaulers(Game.rooms.W1N1);
    assert.ok(EventBus.topics.REQ_SPAWN && EventBus.topics.REQ_SPAWN.length === 1, 'hauler strategy should request haulers when under capacity');
    assert.ok(EventBus.topics.REQ_SPAWN[0].data.body.length > 6, 'hauler spawn body should scale beyond the old fixed body when energy allows');

    const controller = { id: 'controller1', pos: { x: 25, y: 25, roomName: 'W1N1' } };
    const upgraderRoom = {
        name: 'W1N1',
        controller,
        storage: {
            id: 'storage1',
            store: { getUsedCapacity: () => 1000 }
        },
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        find: () => []
    };
    EventBus.topics = {};
    Game.rooms.W1N1 = upgraderRoom;
    Game.creeps = {};
    const upgraderService = new UpgraderStrategyService('UpgraderStrategy');
    upgraderService.ensureUpgraders(upgraderRoom);
    assert.ok(EventBus.topics.REQ_SPAWN && EventBus.topics.REQ_SPAWN[0].data.role === 'upgrader', 'upgrader strategy should request upgrader creeps');

    const emptyUpgrader = {
        room: upgraderRoom,
        memory: { role: 'upgrader', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 0 }
    };
    upgraderService.assignUpgraderTask(emptyUpgrader);
    assert.deepStrictEqual(emptyUpgrader.memory.task, {
        type: 'WITHDRAW',
        targetId: 'storage1',
        resourceType: RESOURCE_ENERGY
    }, 'empty upgrader should withdraw energy');

    const loadedUpgrader = {
        room: upgraderRoom,
        memory: { role: 'upgrader', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    upgraderService.assignUpgraderTask(loadedUpgrader);
    assert.deepStrictEqual(loadedUpgrader.memory.task, {
        type: 'UPGRADE',
        targetId: 'controller1'
    }, 'loaded upgrader should upgrade controller');

    const builderService = new BuilderStrategyService('BuilderStrategy');
    const buildSite = { id: 'site1' };
    global.RoomCache.W1N1 = { constructionSites: ['site1'] };
    const builder = {
        room: { name: 'W1N1', controller, find: () => [] },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    builderService.assignBuilderTask(builder);
    assert.deepStrictEqual(builder.memory.task, { type: 'BUILD', targetId: 'site1' }, 'loaded builder should build construction sites before other work');

    const defenderService = new DefenderStrategyService('DefenderStrategy');
    global.Security = { W1N1: { primaryTargetId: 'hostile1' } };
    const defender = {
        room: { name: 'W1N1' },
        memory: { role: 'defender', targetRoom: 'W1N1' }
    };
    Game.creeps = { Defender1: defender };
    defenderService.analyze();
    assert.deepStrictEqual(defender.memory.task, { type: 'ATTACK', targetId: 'hostile1' }, 'defender should attack the primary security target');

    global.Memory = {
        rooms: {
            W1N1: {
                serviceFlags: { planning: true }
            }
        },
        empire: {}
    };
    const cityPlanner = new CityPlannerService('CityPlanner');
    const sourceForPlan = { id: 'source1', pos: { x: 10, y: 10, roomName: 'W1N1' } };
    const controllerForPlan = { id: 'controller1', my: true, level: 4, pos: { x: 25, y: 25, roomName: 'W1N1' } };
    const spawnForPlan = { id: 'spawn1', pos: { x: 15, y: 15, roomName: 'W1N1' }, structureType: STRUCTURE_SPAWN };
    Game.map = {
        getRoomTerrain: () => ({
            get: () => 0
        })
    };
    const cityRoom = {
        name: 'W1N1',
        controller: controllerForPlan,
        storage: { pos: { x: 20, y: 20, roomName: 'W1N1' } },
        find: (type) => {
            if (type === FIND_MY_SPAWNS) return [spawnForPlan];
            if (type === FIND_SOURCES) return [sourceForPlan];
            if (type === FIND_STRUCTURES) return [spawnForPlan];
            if (type === FIND_CONSTRUCTION_SITES) return [];
            return [];
        }
    };
    const firstCenter = MemoryConfig.baseCenter(cityRoom);
    assert.deepStrictEqual(Memory.rooms.W1N1.baseCenter, { x: 15, y: 15, roomName: 'W1N1' }, 'base center should be persisted from the initial spawn');
    assert.strictEqual(firstCenter.x, 15, 'base center should not drift to storage after it is persisted');

    const cityPlan = cityPlanner.buildCityPlan(cityRoom, firstCenter);
    assert.strictEqual(cityPlan.version, 1, 'city plan should be versioned');
    assert.ok(cityPlan.sources.source1.primaryMiningPos, 'city plan should include source mining positions');
    assert.ok(cityPlan.sources.source1.containerPos, 'city plan should include source container position');
    assert.ok(cityPlan.controller.containerPos, 'city plan should include controller container position');
    assert.ok(cityPlan.roadAnchors.length >= 2, 'city plan should expose road anchors for source and controller zones');

    const containerSites = [];
    const previousRoomPosition = global.RoomPosition;
    global.RoomPosition = class RoomPosition {
        constructor(x, y, roomName) {
            this.x = x;
            this.y = y;
            this.roomName = roomName;
        }
        createConstructionSite(structureType) {
            containerSites.push({ x: this.x, y: this.y, roomName: this.roomName, structureType });
            return OK;
        }
    };
    Memory.rooms.W1N1.cityPlan = cityPlan;
    cityPlanner.placePlannedContainers(cityRoom, cityPlan);
    assert.ok(containerSites.some((site) => site.structureType === STRUCTURE_CONTAINER), 'city planner should create planned container sites');
    global.RoomPosition = previousRoomPosition;

    const plannedMiner = {
        name: 'MinerPlanned',
        room: cityRoom,
        memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' },
        pos: { inRangeTo: () => false },
        store: { getFreeCapacity: () => 0 }
    };
    Game.getObjectById = (id) => id === 'source1' ? sourceForPlan : null;
    service.assignMiningTask(plannedMiner);
    assert.deepStrictEqual(plannedMiner.memory.miningPos, cityPlan.sources.source1.primaryMiningPos, 'miner should prefer cityPlan source mining position');

    const plannedUpgrader = {
        room: cityRoom,
        memory: { role: 'upgrader', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    upgraderService.assignUpgraderTask(plannedUpgrader);
    assert.deepStrictEqual(plannedUpgrader.memory.task, {
        type: 'MOVE_TO',
        pos: cityPlan.controller.primaryUpgradePos,
        range: 0
    }, 'upgrader should move to the planned controller upgrade position before upgrading');

    const matrixValues = new Map();
    class CostMatrix {
        set(x, y, value) {
            matrixValues.set(`${x},${y}`, value);
        }
        get(x, y) {
            return matrixValues.get(`${x},${y}`) || 0;
        }
    }

    global.PathFinder = {
        CostMatrix,
        search: () => ({
            incomplete: false,
            path: [{ x: 10, y: 9 }, { x: 10, y: 8 }]
        })
    };
    global.RoomPosition = class RoomPosition {
        constructor(x, y, roomName) {
            this.x = x;
            this.y = y;
            this.roomName = roomName;
        }
    };
    Game.map = {
        getRoomTerrain: () => ({
            get: (x, y) => (x === 10 && y === 9 ? TERRAIN_MASK_WALL : 0)
        })
    };
    Game.getObjectById = (id) => {
        if (id === 'source1') return { id, pos: { x: 10, y: 8, roomName: 'W1N1' } };
        if (id === 'controller1') return { id, pos: { x: 12, y: 10, roomName: 'W1N1' } };
        return null;
    };

    const roadPlanner = new RoadPlannerService('RoadPlanner');
    const roadRoom = {
        name: 'W1N1',
        find: (type) => type === FIND_MY_STRUCTURES ? [{
            structureType: STRUCTURE_SPAWN,
            pos: { x: 11, y: 10 }
        }] : []
    };
    const roadNetwork = roadPlanner.planRoads(roadRoom, {
        centerPos: new RoomPosition(10, 10, 'W1N1'),
        sources: ['source1'],
        controller: 'controller1'
    });
    assert.ok(!roadNetwork.includes('10,9'), 'road network should not include wall terrain');
    assert.ok(!roadNetwork.includes('11,10'), 'road network should not place roads on blueprint or structure tiles');
}

runBehaviorChecks()
    .then(() => console.log('smoke checks passed'))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
