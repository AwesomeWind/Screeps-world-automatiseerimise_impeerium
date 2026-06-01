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
    global.RESOURCE_ENERGY = 'energy';
    global.FIND_MY_STRUCTURES = 1;
    global.STRUCTURE_SPAWN = 'spawn';
    global.STRUCTURE_EXTENSION = 'extension';
    global.STRUCTURE_TOWER = 'tower';
    global.STRUCTURE_STORAGE = 'storage';
    global.STRUCTURE_ROAD = 'road';
    global.STRUCTURE_CONTAINER = 'container';
    global.STRUCTURE_WALL = 'constructedWall';
    global.STRUCTURE_RAMPART = 'rampart';
    global.TERRAIN_MASK_WALL = 1;

    const { default: ActionParser } = await import('../core/ActionParser.js');
    const { default: MinerStrategyService } = await import('../strategies/MinerStrategyService.js');
    const { default: RoadPlannerService } = await import('../planning/RoadPlannerService.js');

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
        memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' },
        store: {
            getFreeCapacity: () => 0,
            getUsedCapacity: () => 50
        }
    };

    const service = new MinerStrategyService('MinerStrategy');
    service.assignMiningTask(miner);
    assert.deepStrictEqual(miner.memory.task, {
        type: 'TRANSFER',
        targetId: 'spawn1',
        resourceType: 'energy'
    }, 'full miner should deliver energy instead of harvesting again');

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
