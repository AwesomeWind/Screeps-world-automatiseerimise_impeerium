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

function assertNotContains(source, text, label) {
    assert.ok(!source.includes(text), `${label} should not include ${text}`);
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
    'src/services/WarIntelService.js',
    'src/services/WarStrategyService.js',
    'src/services/CombatPlannerService.js',
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
assertContains(main, "const SERVICE_VERSION = '__SERVICE_VERSION__';", 'main should use build-time service version placeholder');
assertNotContains(main, 'delete global.Memory', 'main should not replace the Screeps Memory object');
assertNotContains(main, 'RawMemory._parsed = global.LastMemory', 'main should not override RawMemory parsed cache');
assertContains(main, 'WarIntelService', 'main should include war intel service');
assertContains(main, 'WarStrategyService', 'main should include war strategy service');
assertContains(main, 'CombatPlannerService', 'main should include combat planner service');
assert.ok(main.indexOf("new WarIntelService('WarIntel')") < main.indexOf("new SecurityService('Security')"), 'war intel should run before security bridge');

const rollupConfig = read('rollup.config.js');
assertContains(rollupConfig, 'function serviceVersionPlugin()', 'rollup should define service version injection plugin');
assertContains(rollupConfig, "code.replaceAll('__SERVICE_VERSION__'", 'rollup should replace service version placeholder at build time');

const distPath = path.join(root, 'dist', 'main.js');
if (fs.existsSync(distPath)) {
    const dist = read('dist/main.js');
    assert.ok(!dist.includes("require('src/"), 'dist/main.js should not keep src absolute requires');
    assert.ok(!dist.includes('require("src/'), 'dist/main.js should not keep src absolute requires');
    assertNotContains(dist, 'delete global.Memory', 'dist should not replace the Screeps Memory object');
    assertNotContains(dist, 'RawMemory._parsed = global.LastMemory', 'dist should not override RawMemory parsed cache');
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
    global.BODYPART_COST = { work: 100, carry: 50, move: 50, attack: 80, ranged_attack: 150, heal: 250, tough: 10 };
    global._ = {
        filter: (collection, predicate) => Object.values(collection).filter(predicate)
    };
    global.FIND_MY_STRUCTURES = 1;
    global.FIND_DROPPED_RESOURCES = 2;
    global.FIND_SOURCES = 3;
    global.FIND_STRUCTURES = 4;
    global.FIND_CONSTRUCTION_SITES = 5;
    global.FIND_MY_SPAWNS = 6;
    global.FIND_HOSTILE_CREEPS = 7;
    global.STRUCTURE_SPAWN = 'spawn';
    global.STRUCTURE_EXTENSION = 'extension';
    global.STRUCTURE_TOWER = 'tower';
    global.STRUCTURE_STORAGE = 'storage';
    global.STRUCTURE_ROAD = 'road';
    global.STRUCTURE_CONTAINER = 'container';
    global.STRUCTURE_WALL = 'constructedWall';
    global.STRUCTURE_RAMPART = 'rampart';
    global.TERRAIN_MASK_WALL = 1;
    global.ATTACK = 'attack';
    global.RANGED_ATTACK = 'ranged_attack';
    global.HEAL = 'heal';
    global.TOUGH = 'tough';
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
    const { default: SecurityService } = await import('../services/SecurityService.js');
    const { default: WarIntelService } = await import('../services/WarIntelService.js');
    const { default: WarStrategyService } = await import('../services/WarStrategyService.js');
    const { default: CombatPlannerService } = await import('../services/CombatPlannerService.js');
    const { default: SpawnService } = await import('../services/SpawnService.js');
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

    EventBus.topics = {};
    Game.map = {
        getRoomTerrain: () => ({
            get: () => 0
        })
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true },
        storage: null,
        energyAvailable: 300,
        energyCapacityAvailable: 300
    };
    Game.getObjectById = (id) => ({ id, pos: { x: id === 'source1' ? 10 : 20, y: 10, roomName: 'W1N1' } });
    global.RoomCache = { W1N1: { sources: ['source1', 'source2'] } };
    Game.creeps = {
        MinerBootstrap: {
            memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' },
            body: [{ type: WORK }, { type: WORK }]
        }
    };
    global.Memory = { creeps: {}, rooms: {}, empire: {} };
    service.ensureMiners('W1N1');
    assert.ok(!EventBus.topics.REQ_SPAWN, 'bootstrap room should not request a second pure miner before an energy hauler exists');

    EventBus.topics = {};
    Game.creeps = {};
    Memory.creeps = {
        MinerSpawning: {
            role: 'miner',
            homeRoom: 'W1N1',
            sourceId: 'source1'
        }
    };
    service.ensureMiners('W1N1');
    assert.ok(!EventBus.topics.REQ_SPAWN, 'miner spawning should count miner memory created while a creep is still spawning');

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

    const dangerousMiningRoom = {
        name: 'W1N1',
        find: (type) => {
            if (type === FIND_HOSTILE_CREEPS) {
                return [{
                    pos: {
                        x: 7,
                        y: 7,
                        getRangeTo: (pos) => Math.max(Math.abs(pos.x - 7), Math.abs(pos.y - 7))
                    },
                    getActiveBodyparts: (part) => part === RANGED_ATTACK ? 1 : 0
                }];
            }
            if (type === FIND_STRUCTURES) return [];
            return [];
        }
    };
    const sourceNearHostile = { id: 'source1', pos: { x: 10, y: 10, roomName: 'W1N1' } };
    global.Memory = {
        rooms: {
            W1N1: {
                cityPlan: {
                    sources: {
                        source1: {
                            primaryMiningPos: { x: 9, y: 9, roomName: 'W1N1' }
                        }
                    }
                }
            }
        },
        empire: {}
    };
    const safeMiningPos = service.pickMiningPos(dangerousMiningRoom, sourceNearHostile, null);
    assert.notDeepStrictEqual(safeMiningPos, { x: 9, y: 9, roomName: 'W1N1' }, 'miner should not use planned mining positions inside hostile ranged attack range');
    assert.ok(!service.isPositionDangerous(dangerousMiningRoom, safeMiningPos), 'miner should choose a safe mining position when one exists');

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

    EventBus.topics = {};
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller,
        storage: null,
        energyAvailable: 300,
        energyCapacityAvailable: 300,
        find: () => []
    };
    Game.creeps = {
        MinerCore: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        HaulerCore: { memory: { role: 'hauler', homeRoom: 'W1N1' } }
    };
    upgraderService.ensureUpgraders(Game.rooms.W1N1);
    assert.ok(EventBus.topics.REQ_SPAWN[0].priority > 50, 'first upgrader should outrank continued miner expansion once mining logistics exist');

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

    EventBus.topics = {};
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller,
        storage: null,
        energyAvailable: 300,
        energyCapacityAvailable: 300,
        find: (type) => type === FIND_CONSTRUCTION_SITES ? [buildSite] : []
    };
    Game.creeps = {
        MinerCore: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        HaulerCore: { memory: { role: 'hauler', homeRoom: 'W1N1' } },
        UpgraderCore: { memory: { role: 'upgrader', homeRoom: 'W1N1' } }
    };
    builderService.ensureBuilders(Game.rooms.W1N1);
    assert.ok(EventBus.topics.REQ_SPAWN[0].priority > 50, 'first builder should outrank continued miner expansion when construction sites exist and core economy is online');

    const containerEnergy = {
        id: 'container1',
        structureType: STRUCTURE_CONTAINER,
        store: { getUsedCapacity: () => 200 }
    };
    const emptyBuilderWithContainer = {
        room: {
            name: 'W1N1',
            find: (type) => type === FIND_STRUCTURES ? [containerEnergy] : []
        },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 0 }
    };
    builderService.assignBuilderTask(emptyBuilderWithContainer);
    assert.deepStrictEqual(emptyBuilderWithContainer.memory.task, {
        type: 'WITHDRAW',
        targetId: 'container1',
        resourceType: RESOURCE_ENERGY
    }, 'empty builder should withdraw from energy containers before idling');

    const defenderService = new DefenderStrategyService('DefenderStrategy');
    global.Security = { W1N1: { primaryTargetId: 'hostile1' } };
    const defender = {
        room: { name: 'W1N1' },
        memory: { role: 'defender', targetRoom: 'W1N1' }
    };
    Game.creeps = { Defender1: defender };
    defenderService.analyze();
    assert.deepStrictEqual(defender.memory.task, { type: 'ATTACK', targetId: 'hostile1' }, 'defender should attack the primary security target');

    global.Security = {};
    const fallbackDefenderRoom = {
        name: 'W1N1',
        find: (type) => type === FIND_HOSTILE_CREEPS ? [{ id: 'hostileFallback' }] : []
    };
    const fallbackDefender = {
        room: fallbackDefenderRoom,
        memory: { role: 'defender', targetRoom: 'W1N1' }
    };
    Game.creeps = { DefenderFallback: fallbackDefender };
    defenderService.analyze();
    assert.deepStrictEqual(fallbackDefender.memory.task, { type: 'ATTACK', targetId: 'hostileFallback' }, 'defender should attack visible hostiles when security cache has no primary target');

    global.Security = { W1N1: { posture: 'defend' } };
    const healerHostile = {
        id: 'healerHostile',
        pos: { x: 20, y: 20 },
        getActiveBodyparts: (part) => part === HEAL ? 2 : 0
    };
    const attackerHostile = {
        id: 'attackerHostile',
        pos: { x: 21, y: 20 },
        getActiveBodyparts: (part) => part === ATTACK ? 3 : 0
    };
    const focusRoom = {
        name: 'W1N1',
        find: (type) => type === FIND_HOSTILE_CREEPS ? [attackerHostile, healerHostile] : []
    };
    const firstDefender = {
        room: focusRoom,
        memory: { role: 'defender', targetRoom: 'W1N1' },
        body: [{ type: ATTACK }, { type: MOVE }]
    };
    const secondDefender = {
        room: focusRoom,
        memory: { role: 'defender', targetRoom: 'W1N1' },
        body: [{ type: ATTACK }, { type: MOVE }]
    };
    Game.rooms.W1N1 = focusRoom;
    Game.creeps = { FirstDefender: firstDefender, SecondDefender: secondDefender };
    defenderService.analyze();
    assert.deepStrictEqual(firstDefender.memory.task, { type: 'ATTACK', targetId: 'healerHostile' }, 'defenders should focus the highest-value hostile target');
    assert.deepStrictEqual(secondDefender.memory.task, { type: 'ATTACK', targetId: 'healerHostile' }, 'all idle defenders should focus the same priority hostile target');

    global.Security = { W1N1: { posture: 'develop', primaryTargetId: 'strongRangedHostile' } };
    const rallySpawn = {
        id: 'spawn1',
        structureType: STRUCTURE_SPAWN,
        pos: { x: 15, y: 15, roomName: 'W1N1' }
    };
    const strongRangedForRetreat = {
        id: 'strongRangedHostile',
        pos: { x: 20, y: 20 },
        getActiveBodyparts: (part) => part === RANGED_ATTACK ? 8 : 0
    };
    const rallyRoom = {
        name: 'W1N1',
        find: (type) => {
            if (type === FIND_HOSTILE_CREEPS) return [strongRangedForRetreat];
            if (type === FIND_MY_STRUCTURES) return [rallySpawn];
            return [];
        }
    };
    const weakMeleeDefender = {
        room: rallyRoom,
        memory: { role: 'defender', targetRoom: 'W1N1' },
        body: [{ type: TOUGH }, { type: ATTACK }, { type: MOVE }]
    };
    Game.rooms.W1N1 = rallyRoom;
    Game.creeps = { WeakMeleeDefender: weakMeleeDefender };
    defenderService.analyze();
    assert.deepStrictEqual(weakMeleeDefender.memory.task, {
        type: 'MOVE_TO',
        pos: { x: 15, y: 15, roomName: 'W1N1' },
        range: 3
    }, 'weak melee defenders should rally instead of charging overwhelming ranged threats during develop posture');

    EventBus.topics = {};
    global.Security = {};
    global.Memory = {
        creeps: {
            DefenderSpawning: { role: 'defender', targetRoom: 'W1N1' }
        },
        rooms: {},
        empire: {}
    };
    Game.creeps = {};
    const hostilePlayer = {
        id: 'hostile1',
        owner: { username: 'Enemy' },
        getActiveBodyparts: (part) => part === ATTACK ? 1 : 0
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true },
        energyCapacityAvailable: 300,
        find: (type) => type === FIND_HOSTILE_CREEPS ? [hostilePlayer] : []
    };
    const securityService = new SecurityService('Security');
    securityService.analyze();
    assert.ok(!EventBus.topics.REQ_SPAWN, 'security service should not request more defenders while one is already spawning');

    EventBus.topics = {};
    global.Security = {};
    global.Memory = { creeps: {}, rooms: {}, empire: {} };
    Game.creeps = {};
    const strongRangedHostile = {
        id: 'strongRangedHostile',
        owner: { username: 'Enemy' },
        getActiveBodyparts: (part) => part === RANGED_ATTACK ? 8 : 0
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true, level: 2 },
        energyAvailable: 300,
        energyCapacityAvailable: 300,
        find: (type) => type === FIND_HOSTILE_CREEPS ? [strongRangedHostile] : []
    };
    securityService.analyze();
    assert.strictEqual(global.Security.W1N1.posture, 'develop', 'room should develop instead of feeding weak defenders into overwhelming ranged threats');
    assert.ok(!EventBus.topics.REQ_SPAWN, 'security service should not spawn weak defenders against overwhelming ranged threats');

    EventBus.topics = {};
    global.Security = {};
    const weakHostile = {
        id: 'weakHostile',
        owner: { username: 'Enemy' },
        getActiveBodyparts: (part) => part === ATTACK ? 1 : 0
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true, level: 2 },
        energyAvailable: 300,
        energyCapacityAvailable: 300,
        find: (type) => type === FIND_HOSTILE_CREEPS ? [weakHostile] : []
    };
    securityService.analyze();
    assert.strictEqual(global.Security.W1N1.posture, 'defend', 'room should defend when current defender body can contest the threat');
    assert.ok(EventBus.topics.REQ_SPAWN && EventBus.topics.REQ_SPAWN[0].data.role === 'defender', 'security service should spawn defenders only when they can contest the threat');

    const warHealer = {
        id: 'warHealer',
        pos: { x: 20, y: 20, roomName: 'W1N1' },
        getActiveBodyparts: (part) => part === HEAL ? 2 : 0
    };
    const warRanger = {
        id: 'warRanger',
        pos: { x: 22, y: 20, roomName: 'W1N1' },
        getActiveBodyparts: (part) => part === RANGED_ATTACK ? 3 : 0
    };
    const warSpawn = {
        id: 'spawn1',
        structureType: STRUCTURE_SPAWN,
        pos: { x: 15, y: 15, roomName: 'W1N1' }
    };
    const warRoom = {
        name: 'W1N1',
        controller: { my: true, level: 3 },
        energyCapacityAvailable: 550,
        find: (type) => {
            if (type === FIND_HOSTILE_CREEPS) return [warRanger, warHealer];
            if (type === FIND_MY_STRUCTURES) return [warSpawn];
            return [];
        }
    };
    Game.rooms.W1N1 = warRoom;
    Game.creeps = {
        DefenderA: {
            room: warRoom,
            memory: { role: 'defender', targetRoom: 'W1N1' },
            body: [
                { type: ATTACK }, { type: ATTACK }, { type: ATTACK }, { type: ATTACK }, { type: ATTACK },
                { type: ATTACK }, { type: ATTACK }, { type: ATTACK }, { type: ATTACK }, { type: ATTACK },
                { type: MOVE }, { type: MOVE }
            ]
        }
    };
    global.WarIntel = {};
    global.WarStrategy = {};
    global.CombatPlan = {};
    const warIntelService = new WarIntelService('WarIntel');
    warIntelService.analyze();
    assert.ok(global.WarIntel.W1N1.hostileStrength > 0, 'war intel should calculate hostile strength');
    assert.ok(global.WarIntel.W1N1.defenderStrength > 0, 'war intel should calculate defender strength');
    assert.ok(global.WarIntel.W1N1.dangerZones['20,20'], 'war intel should mark hostile positions as danger zones');
    assert.strictEqual(global.WarIntel.W1N1.primaryHostileId, 'warHealer', 'war intel should prioritize healer hostiles');

    const warStrategyService = new WarStrategyService('WarStrategy');
    warStrategyService.analyze();
    assert.strictEqual(global.WarStrategy.W1N1.posture, 'rally', 'war strategy should rally when defenders can contest but are below attack threshold');
    assert.strictEqual(global.WarStrategy.W1N1.primaryTargetId, 'warHealer', 'war strategy should carry forward the primary target');

    const combatPlannerService = new CombatPlannerService('CombatPlanner');
    combatPlannerService.analyze();
    assert.deepStrictEqual(global.CombatPlan.W1N1.rallyPoint, { x: 15, y: 15, roomName: 'W1N1' }, 'combat planner should use spawn as rally point');
    assert.strictEqual(global.CombatPlan.W1N1.primaryTargetId, 'warHealer', 'combat planner should plan focus fire on the primary target');
    assert.ok(global.CombatPlan.W1N1.avoidZones['20,20'], 'combat planner should expose danger zones for strategy services');

    global.WarIntel = {
        W1N1: {
            hostiles: [],
            hostileStrength: 0,
            defenderStrength: 0,
            towerStrength: 0,
            totalDefenseStrength: 0,
            dangerZones: {},
            safeRallyPoints: [],
            primaryHostileId: null
        }
    };
    global.WarStrategy = {};
    warStrategyService.analyze();
    assert.strictEqual(global.WarStrategy.W1N1.posture, 'recover', 'war strategy should recover when no hostiles are visible');

    global.Memory = {
        creeps: {
            CreepStillSpawning: { role: 'miner' },
            GoneCreep: { role: 'hauler' }
        },
        rooms: {},
        empire: {}
    };
    Game.spawns = {
        Spawn1: { spawning: { name: 'CreepStillSpawning' } }
    };
    Game.creeps = {};
    const spawnService = new SpawnService('Spawn');
    spawnService.cleanup();
    assert.ok(Memory.creeps.CreepStillSpawning, 'spawn cleanup should preserve memory for creeps that are still spawning');
    assert.ok(!Memory.creeps.GoneCreep, 'spawn cleanup should still remove dead creep memory');

    global.Memory = {
        creeps: {},
        rooms: {},
        empire: {}
    };
    const memorySpawn = {
        spawning: null,
        spawnCreep: () => OK
    };
    const memorySpawnService = new SpawnService('Spawn');
    memorySpawnService.pendingTasks = [{
        spawn: memorySpawn,
        name: 'MinerWithMemory',
        data: {
            body: [WORK, MOVE],
            memory: {
                role: 'miner',
                homeRoom: 'W1N1',
                sourceId: 'source1'
            }
        }
    }];
    Game.spawns = { Spawn1: memorySpawn };
    Game.creeps = {};
    memorySpawnService.run();
    memorySpawnService.cleanup();
    assert.deepStrictEqual(Memory.creeps.MinerWithMemory, {
        role: 'miner',
        homeRoom: 'W1N1',
        sourceId: 'source1'
    }, 'spawn service should persist memory for creeps accepted by spawnCreep');

    global.Game.time = 20;
    global.Memory = {
        creeps: {
            MinerPending: {
                role: 'miner',
                homeRoom: 'W1N1',
                sourceId: 'source1'
            }
        },
        rooms: {},
        empire: {
            spawningCreeps: {
                MinerPending: {
                    memory: {
                        role: 'miner',
                        homeRoom: 'W1N1',
                        sourceId: 'source1'
                    },
                    expireAt: 50
                }
            }
        }
    };
    Game.creeps = {};
    Game.spawns = { Spawn1: { spawning: null } };
    const pendingSpawnService = new SpawnService('Spawn');
    pendingSpawnService.cleanup();
    assert.deepStrictEqual(Memory.creeps.MinerPending, {
        role: 'miner',
        homeRoom: 'W1N1',
        sourceId: 'source1'
    }, 'spawn cleanup should preserve pending spawn memory even when spawn.spawning is temporarily unavailable');

    global.Memory = {
        creeps: {},
        rooms: {},
        empire: {
            spawningCreeps: {
                MinerRecovered: {
                    role: 'miner',
                    homeRoom: 'W1N1',
                    sourceId: 'source1'
                }
            }
        }
    };
    const recoveredCreep = { memory: {} };
    Game.creeps = { MinerRecovered: recoveredCreep };
    Game.spawns = {};
    const recoverySpawnService = new SpawnService('Spawn');
    recoverySpawnService.init();
    assert.deepStrictEqual(recoveredCreep.memory, {
        role: 'miner',
        homeRoom: 'W1N1',
        sourceId: 'source1'
    }, 'spawn service should restore missing creep memory before strategies analyze');

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
