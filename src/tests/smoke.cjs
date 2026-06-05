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
    'src/services/SpawnBureauService.js',
    'src/services/SpawnService.js',
    'src/services/LogisticsService.js',
    'src/services/ResourceMarketService.js',
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
    'src/strategies/RepairerStrategyService.js',
    'src/strategies/HaulerStrategyService.js',
    'src/strategies/UpgraderStrategyService.js',
    'src/strategies/DefenderStrategyService.js',
    'src/planning/BaseBlueprint.js',
    'src/planning/CityPlannerService.js',
    'src/planning/DefensePlannerService.js',
    'src/planning/MaintenancePlannerService.js',
    'src/planning/RoadPlannerService.js',
    'src/config/MemoryConfig.js'
];

for (const file of expectedFiles) {
    assertFile(file);
}

const actionParser = read('src/core/ActionParser.js');
for (const taskType of ['HARVEST', 'TRANSFER', 'WITHDRAW', 'PICKUP', 'BUILD', 'REPAIR', 'UPGRADE', 'ATTACK', 'RANGED_ATTACK', 'RESERVE', 'MOVE_TO']) {
    assertContains(actionParser, `case TaskTypes.${taskType}`, `ActionParser ${taskType}`);
}
assertContains(read('src/services/ResourceMarketService.js'), 'planWorkerEnergyTask', 'resource market should expose worker energy planning');
assertContains(read('src/services/ResourceMarketService.js'), 'planMobileWorkerEnergyTask', 'resource market should split mobile worker energy planning');
assertContains(read('src/services/ResourceMarketService.js'), 'planStationaryWorkerEnergyTask', 'resource market should split stationary worker energy planning');
assertContains(read('src/strategies/BuilderStrategyService.js'), 'planWorkerEnergyTask', 'builder strategy should consume resource market energy planning');
assertNotContains(read('src/strategies/BuilderStrategyService.js'), 'assignRepairerTask', 'builder strategy should not own repairer task assignment');
assertContains(read('src/strategies/UpgraderStrategyService.js'), 'planWorkerEnergyTask', 'upgrader strategy should consume resource market energy planning');
assertContains(read('src/strategies/RepairerStrategyService.js'), 'planWorkerEnergyTask', 'repairer strategy should consume resource market energy planning');
assertContains(read('src/strategies/HaulerStrategyService.js'), 'assignHauler', 'hauler strategy should delegate task assignment to resource market');

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
assertContains(main, 'SpawnBureauService', 'main should include spawn bureau service');
assertContains(main, 'ResourceMarketService', 'main should include resource market service');
assertContains(main, 'DefensePlannerService', 'main should include defense planner service');
assertContains(main, 'MaintenancePlannerService', 'main should include maintenance planner service');
assertContains(main, 'RepairerStrategyService', 'main should include repairer strategy service');
assertNotContains(main, "new LogisticsService('Logistics')", 'main should not run old logistics dispatcher');
assert.ok(main.indexOf("new WarIntelService('WarIntel')") < main.indexOf("new SecurityService('Security')"), 'war intel should run before security bridge');
assert.ok(main.indexOf("new SecurityService('Security')") < main.indexOf("new SpawnBureauService('SpawnBureau')"), 'security bridge should run before spawn bureau');
assert.ok(main.indexOf("new SpawnBureauService('SpawnBureau')") < main.indexOf("new SpawnService('Spawn')"), 'spawn bureau should publish before spawn service executes');
assert.ok(main.indexOf("new CityPlannerService('CityPlanner')") < main.indexOf("new DefensePlannerService('DefensePlanner')"), 'city planner should populate the city plan before defense planner reads it');

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
    global.RESOURCE_UTRIUM = 'U';
    global.RESOURCE_LEMERGIUM = 'L';
    global.RESOURCE_UTRIUM_LEMERGITE = 'UL';
    global.WORK = 'work';
    global.CARRY = 'carry';
    global.MOVE = 'move';
    global.CLAIM = 'claim';
    global.BODYPART_COST = { work: 100, carry: 50, move: 50, attack: 80, ranged_attack: 150, heal: 250, tough: 10, claim: 600 };
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
    global.FIND_MY_CREEPS = 8;
    global.STRUCTURE_SPAWN = 'spawn';
    global.STRUCTURE_EXTENSION = 'extension';
    global.STRUCTURE_TOWER = 'tower';
    global.STRUCTURE_STORAGE = 'storage';
    global.STRUCTURE_TERMINAL = 'terminal';
    global.STRUCTURE_LAB = 'lab';
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
    const { default: RepairerStrategyService } = await import('../strategies/RepairerStrategyService.js');
    const { default: DefenderStrategyService } = await import('../strategies/DefenderStrategyService.js');
    const { default: SecurityService } = await import('../services/SecurityService.js');
    const { default: WarIntelService } = await import('../services/WarIntelService.js');
    const { default: WarStrategyService } = await import('../services/WarStrategyService.js');
    const { default: CombatPlannerService } = await import('../services/CombatPlannerService.js');
    const { default: SpawnBureauService } = await import('../services/SpawnBureauService.js');
    const { default: SpawnService } = await import('../services/SpawnService.js');
    const { default: ResourceMarketService } = await import('../services/ResourceMarketService.js');
    const { default: LabService } = await import('../services/LabService.js');
    const { default: RemoteMiningService } = await import('../services/RemoteMiningService.js');
    const { default: TowerDefenseService } = await import('../services/TowerDefenseService.js');
    const { default: MemoryConfig } = await import('../config/MemoryConfig.js');
    const { default: CityPlannerService } = await import('../planning/CityPlannerService.js');
    const { default: DefensePlannerService } = await import('../planning/DefensePlannerService.js');
    const { default: MaintenancePlannerService } = await import('../planning/MaintenancePlannerService.js');
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
    const emergencyHaulerBody = BodyBuilder.build('hauler', {
        energyAvailable: 500,
        energyCapacityAvailable: 500
    }, { bodyProfile: 'emergency_hauler' });
    assert.ok(emergencyHaulerBody.body.length < largeHaulerBody.body.length, 'emergency hauler body should be smaller than standard logistics body');
    const upgraderBody = BodyBuilder.build('upgrader', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { phase: 'early' });
    assert.ok(upgraderBody.body.includes(WORK) && upgraderBody.body.includes(CARRY), 'upgrader body should include work and carry parts');
    const stationaryUpgraderBody = BodyBuilder.build('upgrader', {
        energyAvailable: 300,
        energyCapacityAvailable: 300
    }, { bodyProfile: 'stationary_upgrader' });
    const mobileUpgraderBody = BodyBuilder.build('upgrader', {
        energyAvailable: 300,
        energyCapacityAvailable: 300
    }, { bodyProfile: 'upgrader' });
    assert.ok(stationaryUpgraderBody.capacity.workParts > mobileUpgraderBody.capacity.workParts, 'stationary upgrader body should bias work parts over the mobile profile');
    assert.ok(stationaryUpgraderBody.capacity.carryParts <= mobileUpgraderBody.capacity.carryParts, 'stationary upgrader body should not spend more on carry than the mobile profile');
    const builder300Body = BodyBuilder.build('builder', {
        energyAvailable: 300,
        energyCapacityAvailable: 300
    });
    const builder550Body = BodyBuilder.build('builder', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    });
    assert.ok(builder550Body.body.length > builder300Body.body.length, 'builder body should scale when RCL2 energy capacity increases');
    const mobileBuilderBody = BodyBuilder.build('builder', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { bodyProfile: 'mobile_builder' });
    const suppliedBuilderBody = BodyBuilder.build('builder', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { bodyProfile: 'supplied_builder' });
    assert.ok(suppliedBuilderBody.capacity.workParts > mobileBuilderBody.capacity.workParts, 'supplied builder should bias work parts when logistics can feed it');
    assert.ok(mobileBuilderBody.capacity.carryParts >= suppliedBuilderBody.capacity.carryParts, 'mobile builder should keep more carry capacity for self-supply');
    const repairerBody = BodyBuilder.build('repairer', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { bodyProfile: 'repairer' });
    assert.ok(repairerBody.capacity.workParts >= 2 && repairerBody.capacity.carryParts >= 1, 'repairer profile should support sustained repair work');
    const defender550Body = BodyBuilder.build('defender', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { bodyProfile: 'melee_defender' });
    assert.ok(defender550Body.body.includes(ATTACK) && defender550Body.body.includes(TOUGH), 'defender body profile should include combat parts');
    const rangedDefenderBody = BodyBuilder.build('defender', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { bodyProfile: 'ranged_defender' });
    assert.ok(rangedDefenderBody.body.includes(RANGED_ATTACK) && rangedDefenderBody.body.includes(MOVE), 'ranged defender profile should include ranged attack and movement');
    const reserver650Body = BodyBuilder.build('reserver', {
        energyAvailable: 650,
        energyCapacityAvailable: 650
    }, { bodyProfile: 'reserver' });
    assert.deepStrictEqual(reserver650Body.body, [CLAIM, MOVE], 'reserver should degrade to a single claim pair when room capacity is limited');
    const reserver1300Body = BodyBuilder.build('reserver', {
        energyAvailable: 1300,
        energyCapacityAvailable: 1300
    }, { bodyProfile: 'reserver' });
    assert.deepStrictEqual(reserver1300Body.body, [CLAIM, CLAIM, MOVE, MOVE], 'reserver should scale up when room capacity supports a full reserve body');
    const standardRemoteMinerBody = BodyBuilder.build('remoteMiner', {
        energyAvailable: 650,
        energyCapacityAvailable: 650
    }, { bodyProfile: 'remote_miner' });
    const travelRemoteMinerBody = BodyBuilder.build('remoteMiner', {
        energyAvailable: 650,
        energyCapacityAvailable: 650
    }, { bodyProfile: 'remote_travel_miner' });
    assert.ok(travelRemoteMinerBody.capacity.moveParts > standardRemoteMinerBody.capacity.moveParts, 'long-distance remote miner should trade some work for movement');

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

    let rangedTargetId = null;
    const rangedAttackCreep = {
        memory: { task: { type: 'RANGED_ATTACK', targetId: 'hostileRangedTarget' } },
        rangedAttack: (target) => {
            rangedTargetId = target.id;
            return OK;
        },
        pos: {}
    };
    Game.getObjectById = (id) => ({ id, pos: {} });
    ActionParser.run(rangedAttackCreep);
    assert.strictEqual(rangedTargetId, 'hostileRangedTarget', 'RANGED_ATTACK should execute creep.rangedAttack');
    assert.strictEqual(rangedAttackCreep.memory.task, null, 'RANGED_ATTACK should clear after successful attack');

    let repairedTargetId = null;
    const repairCreep = {
        memory: { task: { type: 'REPAIR', targetId: 'rampartRepairTarget', targetHits: 5000 } },
        repair: (target) => {
            repairedTargetId = target.id;
            return OK;
        },
        pos: {}
    };
    Game.getObjectById = (id) => ({ id, hits: 2500, pos: {} });
    ActionParser.run(repairCreep);
    assert.strictEqual(repairedTargetId, 'rampartRepairTarget', 'REPAIR should execute creep.repair');
    assert.deepStrictEqual(repairCreep.memory.task, { type: 'REPAIR', targetId: 'rampartRepairTarget', targetHits: 5000 }, 'REPAIR should keep the task while the target is still below targetHits');

    const completedRepairCreep = {
        memory: { task: { type: 'REPAIR', targetId: 'roadAtTarget', targetHits: 5000 } },
        repair: () => OK,
        pos: {}
    };
    Game.getObjectById = (id) => ({ id, hits: 5000, pos: {} });
    ActionParser.run(completedRepairCreep);
    assert.strictEqual(completedRepairCreep.memory.task, null, 'REPAIR should clear after the target reaches targetHits');

    const stuckMoveCreep = {
        memory: { task: { type: 'MOVE_TO', pos: { x: 10, y: 10, roomName: 'W1N1' }, range: 0, stuckLimit: 2 } },
        pos: {
            x: 5,
            y: 5,
            roomName: 'W1N1',
            inRangeTo: () => false
        },
        moveTo: () => OK
    };
    ActionParser.run(stuckMoveCreep);
    Game.time++;
    ActionParser.run(stuckMoveCreep);
    Game.time++;
    ActionParser.run(stuckMoveCreep);
    assert.strictEqual(stuckMoveCreep.memory.task, null, 'MOVE_TO should clear when creep stays stuck for too many ticks');

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
            controller: { my: true },
            energyAvailable: 550,
            energyCapacityAvailable: 550,
            find: () => []
        }
    };
    Game.creeps = {
        MinerA: { memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' }, body: [{ type: WORK }, { type: WORK }] },
        MinerB: { memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' }, body: [{ type: WORK }, { type: WORK }] }
    };
    service.ensureMiners('W1N1');
    assert.ok(!EventBus.topics.REQ_SPAWN, 'miner strategy should not publish spawn requests after spawn bureau owns spawning');
    const spawnBureau = new SpawnBureauService('SpawnBureau');
    spawnBureau.analyze();
    const uncoveredMinerRequest = EventBus.topics.REQ_SPAWN &&
        EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'miner' && event.data.memory.sourceId === 'source2');
    assert.ok(uncoveredMinerRequest, 'spawn bureau should cover uncovered sources, not just total miner count');
    assert.ok(!uncoveredMinerRequest.data.body.includes(CARRY), 'stationary miner spawn body should not include carry parts');

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
    spawnBureau.analyze();
    assert.ok(!EventBus.topics.REQ_SPAWN ||
        !EventBus.topics.REQ_SPAWN.some((event) => event.data.role === 'miner'), 'miner spawning should not exceed source open mining positions');

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
    spawnBureau.analyze();
    assert.ok(!EventBus.topics.REQ_SPAWN ||
        !EventBus.topics.REQ_SPAWN.some((event) => event.data.role === 'miner'), 'bootstrap room should not request a second pure miner before an energy hauler exists');

    EventBus.topics = {};
    Game.creeps = {};
    global.RoomCache = { W1N1: { sources: ['source1'] } };
    Memory.creeps = {
        MinerSpawning: {
            role: 'miner',
            homeRoom: 'W1N1',
            sourceId: 'source1'
        }
    };
    spawnBureau.analyze();
    assert.ok(!EventBus.topics.REQ_SPAWN ||
        !EventBus.topics.REQ_SPAWN.some((event) => event.data.role === 'miner'), 'miner spawning should count miner memory created while a creep is still spawning');

    EventBus.topics = {};
    Game.map = {
        getRoomTerrain: () => ({
            get: (x, y) => ((x === 9 && y === 10) || (x === 10 && y === 11) ? 0 : TERRAIN_MASK_WALL)
        })
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true },
        storage: null,
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        find: () => []
    };
    Game.getObjectById = (id) => id === 'source1' ? { id, pos: { x: 10, y: 10, roomName: 'W1N1' } } : null;
    global.RoomCache = { W1N1: { sources: ['source1'] } };
    Game.creeps = {
        MinerLeft: {
            room: { name: 'W1N1' },
            memory: { role: 'miner', sourceId: 'source1' },
            body: [{ type: WORK }, { type: WORK }]
        },
        MinerBottom: {
            room: { name: 'W1N1' },
            memory: { role: 'miner', sourceId: 'source1' },
            body: [{ type: WORK }, { type: WORK }]
        }
    };
    Memory.creeps = {};
    spawnBureau.analyze();
    assert.ok(!EventBus.topics.REQ_SPAWN ||
        !EventBus.topics.REQ_SPAWN.some((event) => event.data.role === 'miner'), 'spawn bureau should count live miners without homeRoom against source mining slots');

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

    Game.map = {
        getRoomTerrain: () => ({
            get: (x, y) => ((x === 9 && y === 10) || (x === 10 && y === 11) ? 0 : TERRAIN_MASK_WALL)
        })
    };
    global.Memory = {
        rooms: {
            W1N1: {
                cityPlan: {
                    sources: {
                        source1: {
                            primaryMiningPos: { x: 9, y: 10, roomName: 'W1N1' }
                        }
                    }
                }
            }
        },
        creeps: {},
        empire: {}
    };
    const twoSlotRoom = {
        name: 'W1N1',
        find: (type) => type === FIND_STRUCTURES || type === FIND_HOSTILE_CREEPS ? [] : []
    };
    const twoSlotSource = { id: 'source1', pos: { x: 10, y: 10, roomName: 'W1N1' } };
    const plannedOccupant = {
        name: 'MinerOnPlanned',
        room: twoSlotRoom,
        memory: {
            role: 'miner',
            homeRoom: 'W1N1',
            sourceId: 'source1',
            miningPos: { x: 9, y: 10, roomName: 'W1N1' }
        }
    };
    const secondMiner = {
        name: 'MinerSecond',
        room: twoSlotRoom,
        memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' },
        pos: {
            x: 8,
            y: 10,
            roomName: 'W1N1',
            inRangeTo: () => false
        }
    };
    Game.creeps = { MinerOnPlanned: plannedOccupant, MinerSecond: secondMiner };
    Game.getObjectById = (id) => id === 'source1' ? twoSlotSource : null;
    service.assignMiningTask(secondMiner);
    assert.deepStrictEqual(secondMiner.memory.miningPos, { x: 10, y: 11, roomName: 'W1N1' }, 'miner should choose an unoccupied valid mining position when planned position is occupied');

    const haulerRoom = { name: 'W1N1' };
    const hauler = {
        room: haulerRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        store: {
            getUsedCapacity: () => 0,
            getFreeCapacity: () => 150
        }
    };
    const haulerService = new HaulerStrategyService('HaulerStrategy');
    global.ResourceMarketService = {
        assignHauler: (creep) => {
            creep.memory.task = { type: 'PICKUP', targetId: 'drop1' };
            return true;
        }
    };
    haulerService.assignHaulerTask(hauler);
    assert.deepStrictEqual(hauler.memory.task, {
        type: 'PICKUP',
        targetId: 'drop1'
    }, 'hauler strategy should delegate empty-hauler assignment to resource market');

    const loadedHaulerWithFullEconomy = {
        room: { name: 'W1N1' },
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        store: {
            getUsedCapacity: () => 100
        }
    };
    global.ResourceMarketService.assignHauler = (creep) => {
        creep.memory.task = {
            type: 'TRANSFER',
            targetId: 'depositContainer',
            resourceType: RESOURCE_ENERGY
        };
        return true;
    };
    haulerService.assignHaulerTask(loadedHaulerWithFullEconomy);
    assert.deepStrictEqual(loadedHaulerWithFullEconomy.memory.task, {
        type: 'TRANSFER',
        targetId: 'depositContainer',
        resourceType: RESOURCE_ENERGY
    }, 'hauler strategy should delegate loaded-hauler assignment to resource market');

    EventBus.topics = {};
    Game.rooms.W1N1 = {
        name: 'W1N1',
        storage: null,
        energyAvailable: 500,
        energyCapacityAvailable: 500
    };
    Game.creeps = {};
    haulerService.ensureHaulers(Game.rooms.W1N1);
    assert.ok(!EventBus.topics.REQ_SPAWN, 'hauler strategy should not publish spawn requests after spawn bureau owns spawning');
    spawnBureau.analyze();
    assert.ok(EventBus.topics.REQ_SPAWN && EventBus.topics.REQ_SPAWN.some((event) => event.data.role === 'hauler'), 'spawn bureau should request haulers when under capacity');
    const haulerRequest = EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'hauler');
    assert.ok(haulerRequest.data.body.length <= 4, 'first hauler spawn body should stay compact for faster logistics recovery');

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
    assert.ok(!EventBus.topics.REQ_SPAWN, 'upgrader strategy should not publish spawn requests after spawn bureau owns spawning');
    Game.creeps = {
        MinerCore: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        HaulerCore: { memory: { role: 'hauler', homeRoom: 'W1N1' } }
    };
    spawnBureau.analyze();
    assert.ok(EventBus.topics.REQ_SPAWN && EventBus.topics.REQ_SPAWN.some((event) => event.data.role === 'upgrader'), 'spawn bureau should request upgrader creeps');

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
    spawnBureau.analyze();
    const firstUpgraderRequest = EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'upgrader');
    assert.ok(firstUpgraderRequest.priority > 50, 'first upgrader should outrank continued miner expansion once mining logistics exist');

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

    const controllerContainer = {
        id: 'controllerContainer1',
        structureType: STRUCTURE_CONTAINER,
        pos: { x: 24, y: 25, roomName: 'W1N1' },
        store: { getUsedCapacity: () => 150 }
    };
    Memory.rooms.W1N1 = {
        cityPlan: {
            controller: {
                primaryUpgradePos: { x: 24, y: 25, roomName: 'W1N1' },
                containerPos: { x: 24, y: 25, roomName: 'W1N1' }
            }
        }
    };
    Game.getObjectById = (id) => {
        if (id === 'controller1') return controller;
        if (id === 'controllerContainer1') return controllerContainer;
        return null;
    };
    global.ResourceMarket = { W1N1: { supplyMode: 'hauler_supply' } };
    const stationedUpgrader = {
        id: 'upgrader1',
        name: 'Upgrader1',
        room: {
            name: 'W1N1',
            controller,
            storage: { id: 'storage1', store: { getUsedCapacity: () => 1000 } },
            find: (type) => type === FIND_STRUCTURES ? [controllerContainer] : []
        },
        pos: { inRangeTo: (x, y, range) => x === 24 && y === 25 && range === 0 },
        memory: { role: 'upgrader', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 }
    };
    EventBus.topics = {};
    upgraderService.assignUpgraderTask(stationedUpgrader);
    assert.deepStrictEqual(stationedUpgrader.memory.task, {
        type: 'WITHDRAW',
        targetId: 'controllerContainer1',
        resourceType: RESOURCE_ENERGY
    }, 'upgrader should withdraw from controller container before waiting for hauler supply');

    controllerContainer.store.getUsedCapacity = () => 0;
    const waitingUpgrader = {
        id: 'upgrader2',
        name: 'Upgrader2',
        room: stationedUpgrader.room,
        pos: stationedUpgrader.pos,
        memory: { role: 'upgrader', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 }
    };
    EventBus.topics = {};
    upgraderService.assignUpgraderTask(waitingUpgrader);
    assert.strictEqual(waitingUpgrader.memory.task, undefined, 'upgrader should wait when controller container is empty in hauler supply mode');
    assert.ok(EventBus.topics.REQ_RESOURCE && EventBus.topics.REQ_RESOURCE.some((event) => event.data.targetId === 'controllerContainer1'), 'upgrader should request hauler refill for controller container');
    global.ResourceMarket = {};

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
    assert.ok(!EventBus.topics.REQ_SPAWN, 'builder strategy should not publish spawn requests after spawn bureau owns spawning');
    spawnBureau.analyze();
    const firstBuilderRequest = EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'builder');
    assert.ok(firstBuilderRequest.priority > 50, 'first builder should outrank continued miner expansion when construction sites exist and core economy is online');
    assert.strictEqual(firstBuilderRequest.data.memory.bodyProfile, undefined, 'spawn memory should not leak body profile details');
    assert.ok(firstBuilderRequest.data.body.filter((part) => part === CARRY).length >= firstBuilderRequest.data.body.filter((part) => part === WORK).length, 'mobile builder should preserve carry capacity before storage logistics exist');

    EventBus.topics = {};
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller,
        storage: { id: 'storage1', store: { getUsedCapacity: () => 2000 } },
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        find: (type) => type === FIND_CONSTRUCTION_SITES ? [buildSite] : []
    };
    Game.creeps = {
        MinerCore: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        HaulerCore: { memory: { role: 'hauler', homeRoom: 'W1N1' } },
        UpgraderCore: { memory: { role: 'upgrader', homeRoom: 'W1N1' } }
    };
    spawnBureau.analyze();
    const suppliedBuilderRequest = EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'builder');
    assert.ok(
        suppliedBuilderRequest.data.body.filter((part) => part === WORK).length >
        suppliedBuilderRequest.data.body.filter((part) => part === CARRY).length,
        'storage-backed builder should use a supplied work-heavy body'
    );

    EventBus.topics = {};
    Memory.rooms.W1N1.maintenancePlan = {
        quotas: { urgent: 1, routine: 1, longTerm: 0 },
        targets: [
            { id: 'urgentContainer', executor: 'builder', urgency: 'urgent', priority: 95 },
            { id: 'routineRoad1', executor: 'builder', urgency: 'routine', priority: 60 },
            { id: 'routineRoad2', executor: 'builder', urgency: 'routine', priority: 59 },
            { id: 'routineRoad3', executor: 'builder', urgency: 'routine', priority: 58 }
        ]
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller,
        storage: { id: 'storage1', store: { getUsedCapacity: () => 20000 } },
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        find: (type) => type === FIND_CONSTRUCTION_SITES ? [] : []
    };
    Game.creeps = {
        MinerCore: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        HaulerCore: { memory: { role: 'hauler', homeRoom: 'W1N1' } },
        UpgraderCore: { memory: { role: 'upgrader', homeRoom: 'W1N1' } },
        BuilderCore: { memory: { role: 'builder', homeRoom: 'W1N1' } }
    };
    spawnBureau.analyze();
    const repairerRequest = EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'repairer');
    assert.ok(repairerRequest, 'spawn bureau should request a repairer when maintenance backlog exceeds routine quota');
    assert.strictEqual(repairerRequest.data.memory.role, 'repairer', 'repairer spawn request should persist repairer role memory');

    EventBus.topics = {};
    Memory.rooms.W1N1.maintenancePlan = {
        quotas: { urgent: 3, routine: 5, longTerm: 6 },
        targets: [
            { id: 'roadMaintenance1', executor: 'builder', urgency: 'urgent', structureType: STRUCTURE_ROAD, priority: 70 },
            { id: 'roadMaintenance2', executor: 'builder', urgency: 'urgent', structureType: STRUCTURE_ROAD, priority: 69 }
        ]
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller,
        storage: { id: 'storage1', store: { getUsedCapacity: () => 20000 } },
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        find: (type) => type === FIND_CONSTRUCTION_SITES ? [] : []
    };
    Game.creeps = {
        MinerCore: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        HaulerCore: { memory: { role: 'hauler', homeRoom: 'W1N1' } },
        UpgraderCore: { memory: { role: 'upgrader', homeRoom: 'W1N1' } }
    };
    spawnBureau.analyze();
    const maintenanceRepairerRequest = EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'repairer');
    assert.ok(maintenanceRepairerRequest, 'spawn bureau should request a repairer when maintenance targets exist but there is no maintenance workforce');

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

    const makeStore = (resources, capacity = 1000) => ({
        getUsedCapacity: (resourceType) => {
            if (resourceType) return resources[resourceType] || 0;
            return Object.values(resources).reduce((sum, value) => sum + value, 0);
        },
        getFreeCapacity: (resourceType) => {
            const used = resourceType ? (resources[resourceType] || 0) : Object.values(resources).reduce((sum, value) => sum + value, 0);
            return Math.max(0, capacity - used);
        },
        [Symbol.iterator]: function* () {
            for (const resourceType of Object.keys(resources)) yield resourceType;
        }
    });

    const marketSpawn = {
        id: 'marketSpawn',
        structureType: STRUCTURE_SPAWN,
        pos: { x: 20, y: 20, roomName: 'W1N1' },
        store: makeStore({ energy: 0 }, 300)
    };
    const marketStorage = {
        id: 'marketStorage',
        structureType: STRUCTURE_STORAGE,
        pos: { x: 10, y: 10, roomName: 'W1N1' },
        store: makeStore({ energy: 1000, U: 300 }, 2000)
    };
    const marketTerminal = {
        id: 'marketTerminal',
        structureType: STRUCTURE_TERMINAL,
        pos: { x: 12, y: 10, roomName: 'W1N1' },
        store: makeStore({ energy: 100, L: 500 }, 3000)
    };
    const marketLab = {
        id: 'marketLab',
        structureType: STRUCTURE_LAB,
        pos: { x: 15, y: 15, roomName: 'W1N1' },
        store: makeStore({ UL: 50 }, 500)
    };
    const marketControllerContainer = {
        id: 'marketControllerContainer',
        structureType: STRUCTURE_CONTAINER,
        pos: { x: 24, y: 25, roomName: 'W1N1' },
        store: makeStore({ energy: 150 }, 2000)
    };
    const marketDrop = {
        id: 'marketDrop',
        resourceType: RESOURCE_ENERGY,
        amount: 250,
        pos: { x: 9, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 9) + Math.abs(pos.y - 10) }
    };
    const marketRoom = {
        name: 'W1N1',
        controller: { my: true, pos: { x: 25, y: 25, roomName: 'W1N1' } },
        storage: marketStorage,
        terminal: marketTerminal,
        find: (type, opts = {}) => {
            let results = [];
            if (type === FIND_DROPPED_RESOURCES) results = [marketDrop];
            if (type === FIND_MY_STRUCTURES) results = [marketSpawn, marketStorage, marketTerminal, marketLab];
            if (type === FIND_STRUCTURES) results = [marketSpawn, marketStorage, marketTerminal, marketLab, marketControllerContainer];
            if (opts.filter) return results.filter(opts.filter);
            return results;
        }
    };
    const marketObjects = {
        marketSpawn,
        marketStorage,
        marketTerminal,
        marketLab,
        marketControllerContainer,
        marketDrop
    };
    Memory.rooms.W1N1 = {
        cityPlan: {
            controller: {
                containerPos: { x: 24, y: 25, roomName: 'W1N1' }
            }
        }
    };
    Game.rooms = { W1N1: marketRoom };
    Game.getObjectById = (id) => marketObjects[id] || Game.creeps[id] || null;
    Game.creeps = {
        HaulerA: {
            name: 'HaulerA',
            room: marketRoom,
            memory: { role: 'hauler', homeRoom: 'W1N1' },
            pos: { x: 8, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 8) + Math.abs(pos.y - 10) },
            store: makeStore({}, 100),
            body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
        },
        HaulerB: {
            name: 'HaulerB',
            room: marketRoom,
            memory: { role: 'hauler', homeRoom: 'W1N1' },
            pos: { x: 8, y: 11, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 8) + Math.abs(pos.y - 11) },
            store: makeStore({}, 100),
            body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
        }
    };
    global.ResourceMarket = {};
    EventBus.topics = {};
    EventBus.clearSubscribers();
    const resourceMarket = new ResourceMarketService('ResourceMarket');
    resourceMarket.init();
    resourceMarket.analyze();
    assert.ok(global.ResourceMarket.W1N1.supplies.some((supply) => supply.targetId === 'marketDrop' && supply.resourceType === RESOURCE_ENERGY), 'resource market should discover dropped energy supply');
    assert.ok(global.ResourceMarket.W1N1.supplies.some((supply) => supply.targetId === 'marketStorage' && supply.resourceType === RESOURCE_UTRIUM), 'resource market should discover storage mineral supply');
    assert.ok(global.ResourceMarket.W1N1.supplies.some((supply) => supply.targetId === 'marketTerminal' && supply.resourceType === RESOURCE_LEMERGIUM), 'resource market should discover terminal mineral supply');
    assert.ok(global.ResourceMarket.W1N1.supplies.some((supply) => supply.targetId === 'marketLab' && supply.resourceType === RESOURCE_UTRIUM_LEMERGITE), 'resource market should discover lab compound supply');
    const spawnDemand = global.ResourceMarket.W1N1.demands.find((demand) => demand.targetId === 'marketSpawn');
    assert.strictEqual(spawnDemand.demandType, 'pull', 'economy energy demand should declare pull semantics');
    assert.strictEqual(spawnDemand.currentAmount, 0, 'economy energy demand should record current store amount');
    assert.strictEqual(spawnDemand.targetAmount, 300, 'economy energy demand should record target store amount');
    const controllerBufferDemand = global.ResourceMarket.W1N1.demands.find((demand) => demand.targetId === 'marketControllerContainer' && demand.demandType === 'buffer');
    assert.ok(controllerBufferDemand, 'resource market should create controller buffer demand from city plan');
    assert.strictEqual(controllerBufferDemand.demandType, 'buffer', 'controller container should be tracked as buffer demand');
    assert.strictEqual(controllerBufferDemand.minAmount, 200, 'controller buffer demand should define a refill floor');
    assert.deepStrictEqual(Game.creeps.HaulerA.memory.task, { type: 'PICKUP', targetId: 'marketDrop' }, 'resource market should assign first empty hauler to picked-up dropped resource');
    assert.ok(Game.creeps.HaulerB.memory.task.targetId !== 'marketDrop', 'resource market reservations should prevent duplicate dropped resource pickup assignment');

    EventBus.topics = {};
    Game.creeps = {
        HaulerLoaded: {
            name: 'HaulerLoaded',
            room: marketRoom,
            memory: { role: 'hauler', homeRoom: 'W1N1' },
            pos: { x: 11, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 11) + Math.abs(pos.y - 10) },
            store: makeStore({ U: 100 }, 100),
            body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
        }
    };
    resourceMarket.init();
    EventBus.publish('REQ_RESOURCE', 85, {
        roomName: 'W1N1',
        action: 'move',
        resourceType: RESOURCE_UTRIUM,
        amount: 100,
        targetId: 'marketTerminal',
        priority: 85,
        purpose: 'terminal_balance'
    }, 3);
    EventBus.dispatch();
    assert.deepStrictEqual(Game.creeps.HaulerLoaded.memory.task, {
        type: 'TRANSFER',
        targetId: 'marketTerminal',
        resourceType: RESOURCE_UTRIUM,
        amount: 100
    }, 'resource market should fulfill explicit arbitrary resource move requests');

    EventBus.topics = {};
    const fullHauler = {
        name: 'FullHauler',
        room: marketRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        pos: { x: 11, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 11) + Math.abs(pos.y - 10) },
        store: makeStore({ energy: 100 }, 100),
        body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
    };
    Game.creeps = { FullHauler: fullHauler };
    resourceMarket.init();
    resourceMarket.assignHauler(fullHauler);
    assert.deepStrictEqual(fullHauler.memory.task, {
        type: 'TRANSFER',
        targetId: 'marketSpawn',
        resourceType: RESOURCE_ENERGY
    }, 'loaded hauler should prioritize spawn energy demand from resource market');

    const repairDemandRoom = {
        name: 'W1N1',
        controller: { my: true },
        storage: null,
        find: (type, opts = {}) => {
            let results = [];
            if (type === FIND_DROPPED_RESOURCES) results = [];
            if (type === FIND_MY_STRUCTURES) results = [];
            if (type === FIND_STRUCTURES) results = [];
            if (opts.filter) return results.filter(opts.filter);
            return results;
        }
    };
    const supplyHauler = {
        name: 'SupplyHauler',
        id: 'supplyHaulerId',
        room: repairDemandRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        pos: { x: 10, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 10) + Math.abs(pos.y - 10) },
        store: makeStore({ energy: 100 }, 100),
        body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
    };
    const marketWaitingRepairer = {
        name: 'MarketWaitingRepairer',
        id: 'marketWaitingRepairerId',
        room: repairDemandRoom,
        memory: { role: 'repairer', homeRoom: 'W1N1' },
        pos: { x: 12, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 12) + Math.abs(pos.y - 10) },
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 },
        body: [{ type: WORK }, { type: CARRY }, { type: MOVE }]
    };
    Game.rooms = { W1N1: repairDemandRoom };
    Game.creeps = { SupplyHauler: supplyHauler, MarketWaitingRepairer: marketWaitingRepairer };
    Game.getObjectById = (id) => Game.creeps[id] || null;
    global.ResourceMarket = {};
    resourceMarket.init();
    resourceMarket.analyze();
    assert.deepStrictEqual(supplyHauler.memory.task, {
        type: 'TRANSFER',
        targetId: 'marketWaitingRepairerId',
        resourceType: RESOURCE_ENERGY,
        amount: 50
    }, 'resource market should assign loaded hauler to waiting repairer before worker strategies publish late demands');
    supplyHauler.memory.task = undefined;
    resourceMarket.init();
    resourceMarket.buildRoomMarket(repairDemandRoom);
    EventBus.publish('REQ_RESOURCE', 60, {
        roomName: 'W1N1',
        action: 'demand',
        resourceType: RESOURCE_ENERGY,
        amount: 50,
        targetId: 'marketWaitingRepairerId',
        purpose: 'repairer_work'
    }, 2);
    EventBus.dispatch();
    const repairerDemands = global.ResourceMarket.W1N1.demands.filter((demand) => {
        return demand.targetId === 'marketWaitingRepairerId' &&
            demand.resourceType === RESOURCE_ENERGY &&
            demand.purpose === 'repairer_work';
    });
    assert.strictEqual(repairerDemands.length, 1, 'resource market should deduplicate pre-scanned worker demand and late repairer resource request');
    Game.rooms = { W1N1: marketRoom };
    Game.getObjectById = (id) => marketObjects[id] || Game.creeps[id] || null;

    const weakLogisticsRoom = {
        name: 'W1N1',
        controller,
        storage: marketStorage,
        find: (type) => type === FIND_STRUCTURES ? [marketStorage] : []
    };
    const marketBuilder = new BuilderStrategyService('BuilderStrategy');
    const marketRepairerService = new RepairerStrategyService('RepairerStrategy');
    const emptySelfSupplyBuilder = {
        room: weakLogisticsRoom,
        memory: { role: 'builder', homeRoom: 'W1N1' },
        body: [{ type: WORK }, { type: CARRY }, { type: MOVE }],
        store: { getUsedCapacity: () => 0 }
    };
    Game.creeps = {
        BuilderNeedingEnergy: emptySelfSupplyBuilder,
        HaulerTiny: { memory: { role: 'hauler', homeRoom: 'W1N1' }, body: [{ type: CARRY }] }
    };
    global.ResourceMarket = { W1N1: { supplyMode: 'self_supply' } };
    marketBuilder.assignBuilderTask(emptySelfSupplyBuilder);
    assert.deepStrictEqual(emptySelfSupplyBuilder.memory.task, {
        type: 'WITHDRAW',
        targetId: 'marketStorage',
        resourceType: RESOURCE_ENERGY
    }, 'builder should self-supply energy when room logistics capacity is insufficient');

    const suppliedBuilder = {
        name: 'SuppliedBuilder',
        id: 'suppliedBuilderId',
        room: weakLogisticsRoom,
        memory: { role: 'builder', homeRoom: 'W1N1' },
        body: [{ type: WORK }, { type: CARRY }, { type: MOVE }],
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 }
    };
    Game.creeps = {
        SuppliedBuilder: suppliedBuilder,
        HaulerStrong: { memory: { role: 'hauler', homeRoom: 'W1N1' }, body: [{ type: CARRY }, { type: CARRY }, { type: CARRY }, { type: CARRY }, { type: CARRY }, { type: CARRY }] }
    };
    global.ResourceMarket = { W1N1: { supplyMode: 'hauler_supply' } };
    EventBus.topics = {};
    marketBuilder.assignBuilderTask(suppliedBuilder);
    assert.deepStrictEqual(suppliedBuilder.memory.task, {
        type: 'WITHDRAW',
        targetId: 'marketStorage',
        resourceType: RESOURCE_ENERGY
    }, 'builder should self-supply from storage for mobile work even when logistics capacity is sufficient');
    assert.ok(!EventBus.topics.REQ_RESOURCE || !EventBus.topics.REQ_RESOURCE.some((event) => event.data.targetId === 'suppliedBuilderId'), 'builder should not wait for hauler delivery when local storage is available');

    const suppliedRepairer = {
        name: 'SuppliedRepairer',
        id: 'suppliedRepairerId',
        room: weakLogisticsRoom,
        memory: { role: 'repairer', homeRoom: 'W1N1' },
        body: [{ type: WORK }, { type: CARRY }, { type: MOVE }],
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 }
    };
    EventBus.topics = {};
    marketRepairerService.assignRepairerTask(suppliedRepairer);
    assert.deepStrictEqual(suppliedRepairer.memory.task, {
        type: 'WITHDRAW',
        targetId: 'marketStorage',
        resourceType: RESOURCE_ENERGY
    }, 'repairer should self-supply from storage for mobile work even when logistics capacity is sufficient');
    assert.ok(!EventBus.topics.REQ_RESOURCE || !EventBus.topics.REQ_RESOURCE.some((event) => event.data.targetId === 'suppliedRepairerId'), 'repairer should not wait for hauler delivery when local storage is available');

    const noLocalSupplyRoom = {
        name: 'W1N1',
        controller,
        storage: null,
        find: () => []
    };
    const waitingBuilder = {
        name: 'WaitingBuilder',
        id: 'waitingBuilderId',
        room: noLocalSupplyRoom,
        memory: { role: 'builder', homeRoom: 'W1N1' },
        body: [{ type: WORK }, { type: CARRY }, { type: MOVE }],
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 }
    };
    EventBus.topics = {};
    marketBuilder.assignBuilderTask(waitingBuilder);
    assert.strictEqual(waitingBuilder.memory.task, undefined, 'builder should wait when ResourceMarket cannot find a local energy source');
    assert.ok(EventBus.topics.REQ_RESOURCE && EventBus.topics.REQ_RESOURCE.some((event) => event.data.targetId === 'waitingBuilderId'), 'builder should publish resource demand when ResourceMarket returns wait_supply');

    const waitingRepairer = {
        name: 'WaitingRepairer',
        id: 'waitingRepairerId',
        room: noLocalSupplyRoom,
        memory: { role: 'repairer', homeRoom: 'W1N1' },
        body: [{ type: WORK }, { type: CARRY }, { type: MOVE }],
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 }
    };
    EventBus.topics = {};
    marketRepairerService.assignRepairerTask(waitingRepairer);
    assert.strictEqual(waitingRepairer.memory.task, undefined, 'repairer should wait when ResourceMarket cannot find a local energy source');
    assert.ok(EventBus.topics.REQ_RESOURCE && EventBus.topics.REQ_RESOURCE.some((event) => event.data.targetId === 'waitingRepairerId'), 'repairer should publish resource demand when ResourceMarket returns wait_supply');

    EventBus.topics = {};
    global.REACTIONS = { U: { L: RESOURCE_UTRIUM_LEMERGITE } };
    const labService = new LabService('Lab');
    labService.requestLabDelivery('marketLab', RESOURCE_UTRIUM, 100);
    assert.ok(EventBus.topics.REQ_RESOURCE && EventBus.topics.REQ_RESOURCE.some((event) => event.data.action === 'demand' && event.data.resourceType === RESOURCE_UTRIUM), 'lab delivery should publish REQ_RESOURCE demand');
    assert.ok(!EventBus.topics.REQ_LOGISTICS, 'lab delivery should not publish old logistics requests');

    const compoundHauler = {
        name: 'CompoundHauler',
        room: marketRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        pos: { x: 14, y: 15, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 14) + Math.abs(pos.y - 15) },
        store: makeStore({ UL: 50 }, 100),
        body: [{ type: CARRY }, { type: MOVE }]
    };
    Game.creeps = { CompoundHauler: compoundHauler };
    resourceMarket.init();
    resourceMarket.assignHauler(compoundHauler);
    assert.deepStrictEqual(compoundHauler.memory.task, {
        type: 'TRANSFER',
        targetId: 'marketTerminal',
        resourceType: RESOURCE_UTRIUM_LEMERGITE
    }, 'loaded hauler should store lab compounds in terminal when no explicit demand exists');

    EventBus.topics = {};
    global.Memory.empire.remoteRooms = { W2N2: { enabled: true, baseRoom: 'W1N1' } };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true },
        energyAvailable: 650,
        energyCapacityAvailable: 650,
        find: () => []
    };
    Game.rooms.W2N2 = {
        name: 'W2N2',
        controller: { reservation: { ticksToEnd: 500 } },
        find: (type) => type === FIND_SOURCES ? [] : []
    };
    const remoteMiningService = new RemoteMiningService('RemoteMining');
    remoteMiningService.analyze();
    const reserverRequest = EventBus.topics.REQ_SPAWN && EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'reserver');
    assert.deepStrictEqual(reserverRequest.data.body, [CLAIM, MOVE], 'remote mining reserver demand should use the scaled reserver body');

    EventBus.topics = {};
    global.Memory.empire.remoteRooms = { W3N3: { enabled: true, baseRoom: 'W1N1', distance: 60 } };
    Game.creeps = {};
    Game.rooms.W3N3 = {
        name: 'W3N3',
        controller: { reservation: { ticksToEnd: 2000 } },
        find: (type) => type === FIND_SOURCES ? [{ id: 'remoteSource1' }] : []
    };
    remoteMiningService.analyze();
    const remoteMinerRequest = EventBus.topics.REQ_SPAWN && EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'remoteMiner');
    assert.ok(
        remoteMinerRequest.data.body.filter((part) => part === MOVE).length >
        standardRemoteMinerBody.capacity.moveParts,
        'long-distance remote miner demand should use a travel-heavy body'
    );

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

    const rangedDefender = {
        room: fallbackDefenderRoom,
        memory: { role: 'defender', targetRoom: 'W1N1' },
        body: [{ type: RANGED_ATTACK }, { type: MOVE }]
    };
    Game.creeps = { RangedDefender: rangedDefender };
    defenderService.analyze();
    assert.deepStrictEqual(rangedDefender.memory.task, { type: 'RANGED_ATTACK', targetId: 'hostileFallback' }, 'ranged defenders should use ranged attack tasks');

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
    assert.ok(!global.SpawnDemands || !global.SpawnDemands.W1N1, 'security service should not demand more defenders while one is already spawning');

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
    assert.ok(!global.SpawnDemands || !global.SpawnDemands.W1N1, 'security service should not demand weak defenders against overwhelming ranged threats');

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
    assert.ok(global.SpawnDemands.W1N1 && global.SpawnDemands.W1N1[0].role === 'defender', 'security service should express defender demand only when it can contest the threat');
    EventBus.topics = {};
    spawnBureau.analyze();
    assert.ok(EventBus.topics.REQ_SPAWN && EventBus.topics.REQ_SPAWN.some((event) => event.data.role === 'defender'), 'spawn bureau should publish defender requests from war demand');

    EventBus.topics = {};
    global.Security = {};
    global.SpawnDemands = {};
    const lightRangedHostile = {
        id: 'lightRangedHostile',
        owner: { username: 'Enemy' },
        getActiveBodyparts: (part) => part === RANGED_ATTACK ? 1 : 0
    };
    Game.creeps = {};
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true, level: 4 },
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        find: (type) => type === FIND_HOSTILE_CREEPS ? [lightRangedHostile] : []
    };
    securityService.analyze();
    assert.ok(global.SpawnDemands.W1N1 && global.SpawnDemands.W1N1[0].bodyProfile === 'ranged_defender', 'security service should request ranged defenders against ranged threats it can contest');

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
    global.CONTROLLER_STRUCTURES = {
        [STRUCTURE_EXTENSION]: { 4: 20, 6: 40, 8: 60 },
        [STRUCTURE_TOWER]: { 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 6 },
        [STRUCTURE_STORAGE]: { 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 }
    };
    const cityPlanner = new CityPlannerService('CityPlanner');
    const defensePlanner = new DefensePlannerService('DefensePlanner');
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
    const coreDefensePlan = defensePlanner.buildDefensePlan(cityRoom, cityPlan);
    assert.strictEqual(coreDefensePlan.mode, 'core_fortress', 'early defense planning should start in core fortress mode');
    assert.ok(coreDefensePlan.towers.length > 0, 'defense plan should own tower positions');
    assert.ok(coreDefensePlan.ramparts.some((entry) => entry.reason === 'spawn'), 'core fortress plan should protect the spawn with ramparts');
    assert.ok(coreDefensePlan.repairTargets.rampartHits > 0, 'defense plan should define repair targets');

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
    assert.ok(!containerSites.some((site) => site.structureType === STRUCTURE_TOWER), 'city planner should no longer place tower sites directly');
    global.RoomPosition = previousRoomPosition;

    const defenseSites = [];
    global.RoomPosition = class RoomPosition {
        constructor(x, y, roomName) {
            this.x = x;
            this.y = y;
            this.roomName = roomName;
        }
        createConstructionSite(structureType) {
            defenseSites.push({ x: this.x, y: this.y, roomName: this.roomName, structureType });
            return OK;
        }
    };
    Game.time = 100;
    Game.rooms.W1N1 = cityRoom;
    global.RoomCache = { W1N1: {} };
    defensePlanner.analyze();
    assert.ok(defenseSites.some((site) => site.structureType === STRUCTURE_TOWER), 'defense planner should place tower sites from the defense build queue');
    assert.ok(defenseSites.some((site) => site.structureType === STRUCTURE_RAMPART), 'defense planner should place rampart sites from the defense build queue');
    assert.ok(defenseSites.length <= Memory.rooms.W1N1.cityPlan.defense.buildLimitPerRun, 'defense planner should throttle site creation per planning pass');
    global.RoomPosition = previousRoomPosition;

    const assetRoom = {
        name: 'W1N1',
        controller: { id: 'controller1', my: true, level: 6, pos: { x: 25, y: 25, roomName: 'W1N1' } },
        storage: { id: 'storage1', pos: { x: 20, y: 20, roomName: 'W1N1' }, store: { getUsedCapacity: () => 20000 } },
        find: (type) => {
            if (type === FIND_MY_SPAWNS) return [spawnForPlan];
            if (type === FIND_SOURCES) return [sourceForPlan];
            if (type === FIND_STRUCTURES) {
                return [
                    spawnForPlan,
                    { id: 'sourceContainer1', structureType: STRUCTURE_CONTAINER, pos: { x: 11, y: 10, roomName: 'W1N1' } },
                    { id: 'controllerContainer1', structureType: STRUCTURE_CONTAINER, pos: { x: 24, y: 25, roomName: 'W1N1' } },
                    { id: 'tower1', structureType: STRUCTURE_TOWER, pos: { x: 17, y: 12, roomName: 'W1N1' }, store: { getUsedCapacity: () => 1000 } },
                    { id: 'tower2', structureType: STRUCTURE_TOWER, pos: { x: 12, y: 17, roomName: 'W1N1' }, store: { getUsedCapacity: () => 1000 } }
                ];
            }
            if (type === FIND_CONSTRUCTION_SITES) return [];
            return [];
        }
    };
    const assetPlan = cityPlanner.buildCityPlan(assetRoom, firstCenter);
    const assetDefensePlan = defensePlanner.buildDefensePlan(assetRoom, assetPlan);
    assert.strictEqual(assetDefensePlan.mode, 'asset_protection', 'mid-game defense should activate asset protection mode');
    assert.ok(assetDefensePlan.ramparts.some((entry) => entry.reason === 'source_container'), 'asset protection should include source container ramparts');

    const territorialRoom = {
        name: 'W1N1',
        controller: { id: 'controller1', my: true, level: 8, pos: { x: 25, y: 25, roomName: 'W1N1' } },
        storage: { id: 'storage1', pos: { x: 20, y: 20, roomName: 'W1N1' }, store: { getUsedCapacity: () => 100000 } },
        find: (type) => {
            if (type === FIND_MY_SPAWNS) return [spawnForPlan];
            if (type === FIND_SOURCES) return [sourceForPlan];
            if (type === FIND_STRUCTURES) {
                return [
                    spawnForPlan,
                    { id: 'tower1', structureType: STRUCTURE_TOWER, pos: { x: 17, y: 12, roomName: 'W1N1' }, store: { getUsedCapacity: () => 1000 } },
                    { id: 'tower2', structureType: STRUCTURE_TOWER, pos: { x: 12, y: 17, roomName: 'W1N1' }, store: { getUsedCapacity: () => 1000 } },
                    { id: 'tower3', structureType: STRUCTURE_TOWER, pos: { x: 18, y: 18, roomName: 'W1N1' }, store: { getUsedCapacity: () => 1000 } }
                ];
            }
            if (type === FIND_CONSTRUCTION_SITES) return [];
            return [];
        }
    };
    const territorialPlan = cityPlanner.buildCityPlan(territorialRoom, firstCenter);
    const territorialDefensePlan = defensePlanner.buildDefensePlan(territorialRoom, territorialPlan);
    assert.strictEqual(territorialDefensePlan.mode, 'territorial_gate', 'late-game defense should expand to territorial gate mode');
    assert.ok(territorialDefensePlan.gates.length > 0, 'territorial defense should plan gate positions');
    assert.ok(territorialDefensePlan.chokes.length > 0, 'territorial defense should identify choke anchors');

    const maintenancePlanner = new MaintenancePlannerService('MaintenancePlanner');
    const maintenanceStructures = [
        { id: 'spawnDamaged', structureType: STRUCTURE_SPAWN, hits: 3500, hitsMax: 5000, pos: { x: 15, y: 15, roomName: 'W1N1' } },
        { id: 'mainRoad', structureType: STRUCTURE_ROAD, hits: 1200, hitsMax: 5000, pos: { x: 16, y: 15, roomName: 'W1N1' } },
        { id: 'sourceContainer1', structureType: STRUCTURE_CONTAINER, hits: 90000, hitsMax: 250000, pos: { x: 11, y: 10, roomName: 'W1N1' }, store: { getUsedCapacity: () => 500 } },
        { id: 'rampartEmergency', structureType: STRUCTURE_RAMPART, hits: 800, hitsMax: 300000000, pos: { x: 17, y: 15, roomName: 'W1N1' } },
        { id: 'wallRoutine', structureType: STRUCTURE_WALL, hits: 3000, hitsMax: 300000000, pos: { x: 18, y: 15, roomName: 'W1N1' } }
    ];
    const maintenanceRoom = {
        name: 'W1N1',
        controller: { id: 'controller1', my: true, level: 6, pos: { x: 25, y: 25, roomName: 'W1N1' } },
        storage: { id: 'storage1', pos: { x: 20, y: 20, roomName: 'W1N1' }, store: { getUsedCapacity: () => 30000 } },
        find: (type) => {
            if (type === FIND_MY_SPAWNS) return [spawnForPlan];
            if (type === FIND_SOURCES) return [sourceForPlan];
            if (type === FIND_STRUCTURES) return maintenanceStructures;
            if (type === FIND_CONSTRUCTION_SITES) return [];
            return [];
        }
    };
    Memory.rooms.W1N1.cityPlan = {
        ...assetPlan,
        defense: {
            repairTargets: {
                rampartHits: 100000,
                wallHits: 50000
            }
        }
    };
    const maintenancePlan = maintenancePlanner.buildMaintenancePlan(maintenanceRoom, Memory.rooms.W1N1.cityPlan);
    assert.strictEqual(maintenancePlan.version, 1, 'maintenance plan should be versioned');
    assert.ok(maintenancePlan.targets.some((target) => target.id === 'spawnDamaged' && target.repairClass === 'core'), 'maintenance plan should include damaged core structures');
    assert.ok(maintenancePlan.targets.some((target) => target.id === 'mainRoad' && target.repairClass === 'economic'), 'maintenance plan should include damaged roads');
    assert.ok(maintenancePlan.targets.some((target) => target.id === 'sourceContainer1' && target.repairClass === 'decay'), 'maintenance plan should include containers');
    assert.ok(maintenancePlan.targets.some((target) => target.id === 'rampartEmergency' && target.executor === 'tower'), 'maintenance plan should route emergency rampart repair to towers');
    assert.ok(maintenancePlan.targets.some((target) => target.id === 'wallRoutine' && target.repairClass === 'defense'), 'maintenance plan should include walls with defense targets');
    assert.strictEqual(maintenancePlan.targets[0].id, 'rampartEmergency', 'maintenance plan should sort urgent defense emergencies first');

    let repairedDefense = null;
    const towerDefense = new TowerDefenseService('TowerDefense');
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true, level: 8 },
        find: (type, opts) => {
            if (type === FIND_MY_STRUCTURES) {
                const structures = [{
                    id: 'tower1',
                    structureType: STRUCTURE_TOWER,
                    store: { getUsedCapacity: () => 1000 },
                    attack: () => OK,
                    heal: () => OK,
                    repair: (target) => {
                        repairedDefense = target.id;
                        return OK;
                    }
                }];
                if (typeof opts === 'object' && opts && opts.filter) return structures.filter(opts.filter);
                return structures;
            }
            if (type === FIND_MY_CREEPS) return [];
            if (type === FIND_STRUCTURES) {
                return [{
                    id: 'rampart1',
                    structureType: STRUCTURE_RAMPART,
                    hits: 10000
                }];
            }
            return [];
        }
    };
    Memory.rooms.W1N1.cityPlan = {
        defense: {
            repairTargets: {
                rampartHits: 5000,
                wallHits: 0
            }
        }
    };
    Memory.rooms.W1N1.maintenancePlan = {
        targets: [
            { id: 'mainRoad', executor: 'builder', structureType: STRUCTURE_ROAD, priority: 60 },
            { id: 'rampart1', executor: 'tower', structureType: STRUCTURE_RAMPART, priority: 95 }
        ]
    };
    towerDefense.run();
    assert.strictEqual(repairedDefense, 'rampart1', 'tower defense should consume emergency defense targets from the maintenance plan');
    Memory.rooms.W1N1.cityPlan = cityPlan;

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

    const repairBuilder = {
        room: {
            name: 'W1N1',
            controller,
            find: () => []
        },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    global.RoomCache.W1N1 = { constructionSites: [] };
    Memory.rooms.W1N1.maintenancePlan = {
        quotas: { urgent: 3, routine: 0, longTerm: 0 },
        targets: [
            { id: 'routineRoad', executor: 'builder', urgency: 'routine', structureType: STRUCTURE_ROAD, priority: 95, targetHits: 5000 },
            { id: 'urgentContainer', executor: 'builder', urgency: 'urgent', structureType: STRUCTURE_CONTAINER, priority: 80, targetHits: 250000 }
        ]
    };
    Game.getObjectById = (id) => {
        if (id === 'routineRoad') return { id, hits: 700, hitsMax: 5000, pos: {} };
        if (id === 'urgentContainer') return { id, hits: 50000, hitsMax: 250000, pos: {} };
        if (id === 'controller1') return { id, pos: {} };
        return null;
    };
    builderService.assignBuilderTask(repairBuilder);
    assert.deepStrictEqual(repairBuilder.memory.task, {
        type: 'REPAIR',
        targetId: 'urgentContainer',
        targetHits: 250000
    }, 'loaded builder should prefer urgent maintenance targets over routine targets excluded by quotas');

    const quotaBlockedBuilder = {
        room: {
            name: 'W1N1',
            controller,
            find: () => []
        },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    Memory.rooms.W1N1.maintenancePlan = {
        quotas: { urgent: 0, routine: 0, longTerm: 0 },
        targets: [
            { id: 'routineRoad', executor: 'builder', urgency: 'routine', structureType: STRUCTURE_ROAD, priority: 95, targetHits: 5000 }
        ]
    };
    Game.getObjectById = (id) => {
        if (id === 'routineRoad') return { id, hits: 700, hitsMax: 5000, pos: {} };
        if (id === 'controller1') return { id, pos: {} };
        return null;
    };
    builderService.assignBuilderTask(quotaBlockedBuilder);
    assert.deepStrictEqual(quotaBlockedBuilder.memory.task, {
        type: 'REPAIR',
        targetId: 'routineRoad',
        targetHits: 5000
    }, 'builder should consume low-priority maintenance before falling back to upgrading');

    const repairerService = new RepairerStrategyService('RepairerStrategy');
    const repairer = {
        room: {
            name: 'W1N1',
            controller,
            find: () => []
        },
        memory: { role: 'repairer', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    Memory.rooms.W1N1.maintenancePlan = {
        quotas: { urgent: 0, routine: 0, longTerm: 0 },
        targets: [
            { id: 'routineRoad', executor: 'builder', urgency: 'routine', structureType: STRUCTURE_ROAD, priority: 95, targetHits: 5000 }
        ]
    };
    Game.getObjectById = (id) => {
        if (id === 'routineRoad') return { id, hits: 700, hitsMax: 5000, pos: {} };
        if (id === 'controller1') return { id, pos: {} };
        return null;
    };
    repairerService.assignRepairerTask(repairer);
    assert.deepStrictEqual(repairer.memory.task, {
        type: 'REPAIR',
        targetId: 'routineRoad',
        targetHits: 5000
    }, 'repairer should consume maintenance backlog even when builder quotas are exhausted');

    const stalePlanRepairer = {
        room: {
            name: 'W1N1',
            controller: {
                id: 'controller1'
            }
        },
        store: {
            getUsedCapacity: () => 50
        },
        memory: { role: 'repairer', homeRoom: 'W1N1' },
        pos: {}
    };
    Memory.rooms.W1N1.maintenancePlan = {
        targets: [
            { id: 'fullRoad', executor: 'builder', urgency: 'routine', structureType: STRUCTURE_ROAD, priority: 95, targetHits: 5000 },
            { id: 'damagedRoad', executor: 'builder', urgency: 'routine', structureType: STRUCTURE_ROAD, priority: 94, targetHits: 5000 }
        ]
    };
    Game.getObjectById = (id) => {
        if (id === 'fullRoad') return { id, hits: 5000, hitsMax: 5000, pos: {} };
        if (id === 'damagedRoad') return { id, hits: 700, hitsMax: 5000, pos: {} };
        if (id === 'controller1') return { id, pos: {} };
        return null;
    };
    repairerService.assignRepairerTask(stalePlanRepairer);
    assert.deepStrictEqual(stalePlanRepairer.memory.task, {
        type: 'REPAIR',
        targetId: 'damagedRoad',
        targetHits: 5000
    }, 'repairer should skip stale maintenance targets that already meet their targetHits');

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
