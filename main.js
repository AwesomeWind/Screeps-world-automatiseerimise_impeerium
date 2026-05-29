const EventBus = require('core/EventBus');
const MemoryConfig = require('config/MemoryConfig');
const ActionParser = require('core/ActionParser');

const RoomCacheService = require('services/RoomCacheService');
const SpawnService = require('services/SpawnService');
const LogisticsService = require('services/LogisticsService');
const SecurityService = require('services/SecurityService');
const TowerDefenseService = require('services/TowerDefenseService');
const LabService = require('services/LabService');
const MarketService = require('services/MarketService');
const RemoteMiningService = require('services/RemoteMiningService');

const MinerStrategyService = require('strategies/MinerStrategyService');
const BuilderStrategyService = require('strategies/BuilderStrategyService');
const HaulerStrategyService = require('strategies/HaulerStrategyService');
const DefenderStrategyService = require('strategies/DefenderStrategyService');

const CityPlannerService = require('planning/CityPlannerService');
const RoadPlannerService = require('planning/RoadPlannerService');

const SERVICE_VERSION = 1;

function createServices() {
    EventBus.clearSubscribers();
    return [
        new RoomCacheService('RoomCache'),
        new SecurityService('Security'),
        new SpawnService('Spawn'),
        new LogisticsService('Logistics'),
        new MinerStrategyService('MinerStrategy'),
        new BuilderStrategyService('BuilderStrategy'),
        new HaulerStrategyService('HaulerStrategy'),
        new DefenderStrategyService('DefenderStrategy'),
        new TowerDefenseService('TowerDefense'),
        new CityPlannerService('CityPlanner'),
        new RoadPlannerService('RoadPlanner'),
        new LabService('Lab'),
        new MarketService('Market'),
        new RemoteMiningService('RemoteMining')
    ];
}

function getServices() {
    if (!global.EmpireServices || global.EmpireServicesVersion !== SERVICE_VERSION) {
        global.EmpireServices = createServices();
        global.EmpireServicesVersion = SERVICE_VERSION;
    }
    return global.EmpireServices;
}

function mountMemoryProxy() {
    if (global.LastMemory && global.lastMemoryTick === Game.time - 1) {
        delete global.Memory;
        global.Memory = global.LastMemory;
        RawMemory._parsed = global.LastMemory;
    } else {
        Memory;
        global.LastMemory = RawMemory._parsed;
    }
    global.lastMemoryTick = Game.time;
}

module.exports.loop = function () {
    mountMemoryProxy();
    MemoryConfig.ensureDefaults();

    const services = getServices();

    EventBus.beginTick();

    for (const service of services) service.init();
    for (const service of services) service.analyze();

    EventBus.dispatch();

    for (const service of services) service.run();
    for (const name in Game.creeps) ActionParser.run(Game.creeps[name]);
    for (const service of services) service.cleanup();
};
