import EventBus from './core/EventBus.js';
import MemoryConfig from './config/MemoryConfig.js';
import ActionParser from './core/ActionParser.js';

import RoomCacheService from './services/RoomCacheService.js';
import SpawnService from './services/SpawnService.js';
import LogisticsService from './services/LogisticsService.js';
import SecurityService from './services/SecurityService.js';
import TowerDefenseService from './services/TowerDefenseService.js';
import LabService from './services/LabService.js';
import MarketService from './services/MarketService.js';
import RemoteMiningService from './services/RemoteMiningService.js';

import MinerStrategyService from './strategies/MinerStrategyService.js';
import BuilderStrategyService from './strategies/BuilderStrategyService.js';
import HaulerStrategyService from './strategies/HaulerStrategyService.js';
import DefenderStrategyService from './strategies/DefenderStrategyService.js';

import CityPlannerService from './planning/CityPlannerService.js';
import RoadPlannerService from './planning/RoadPlannerService.js';

const SERVICE_VERSION = 3;

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

export function loop() {
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
}
