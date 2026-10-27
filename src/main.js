import EventBus from './core/EventBus.js';
import MemoryConfig from './config/MemoryConfig.js';
import ActionParser from './core/ActionParser.js';
import RuntimeTelemetry from './core/RuntimeTelemetry.js';
import ServiceScheduler from './core/ServiceScheduler.js';

import RoomCacheService from './services/RoomCacheService.js';
import RoomPhaseService from './services/RoomPhaseService.js';
import RoomGovernorService from './services/RoomGovernorService.js';
import GoalPlanService from './services/GoalPlanService.js';
import RemoteReconTrialService from './services/RemoteReconTrialService.js';
import RemoteEconomicTrialService from './services/RemoteEconomicTrialService.js';
import NativeEconomicTrialOpsService from './services/NativeEconomicTrialOpsService.js';
import SpawnBureauService from './services/SpawnBureauService.js';
import SpawnService from './services/SpawnService.js';
import CreepRetirementService from './services/CreepRetirementService.js';
import LinkService from './services/LinkService.js';
import StructureLifecycleService from './services/StructureLifecycleService.js';
import CityPlanDebugService from './services/CityPlanDebugService.js';
import TaskGuardService from './services/TaskGuardService.js';
import ResourceMarketService from './services/ResourceMarketService.js';
import SecurityService from './services/SecurityService.js';
import WarIntelService from './services/WarIntelService.js';
import WarStrategyService from './services/WarStrategyService.js';
import CombatPlannerService from './services/CombatPlannerService.js';
import TowerDefenseService from './services/TowerDefenseService.js';
import LabService from './services/LabService.js';
import MarketService from './services/MarketService.js';
import RemoteMiningService from './services/RemoteMiningService.js';
import EmpireMetricsService from './services/EmpireMetricsService.js';
import TrialEvidenceWindowService from './services/TrialEvidenceWindowService.js';
import HomeEvidenceWindowService from './services/HomeEvidenceWindowService.js';

import MinerStrategyService from './strategies/MinerStrategyService.js';
import RemoteMiningStrategyService from './strategies/RemoteMiningStrategyService.js';
import BuilderStrategyService from './strategies/BuilderStrategyService.js';
import RepairerStrategyService from './strategies/RepairerStrategyService.js';
import HaulerStrategyService from './strategies/HaulerStrategyService.js';
import UpgraderStrategyService from './strategies/UpgraderStrategyService.js';
import DefenderStrategyService from './strategies/DefenderStrategyService.js';

import CityPlannerService from './planning/CityPlannerService.js';
import DefensePlannerService from './planning/DefensePlannerService.js';
import MaintenancePlannerService from './planning/MaintenancePlannerService.js';
import RoadPlannerService from './planning/RoadPlannerService.js';

const SERVICE_VERSION = '__SERVICE_VERSION__';

function createServices() {
    EventBus.clearSubscribers();
    return [
        new RoomCacheService('RoomCache'),
        new WarIntelService('WarIntel'),
        new WarStrategyService('WarStrategy'),
        new CombatPlannerService('CombatPlanner'),
        new SecurityService('Security'),
        new RoomPhaseService('RoomPhase'),
        new RoomGovernorService('RoomGovernor'),
        new GoalPlanService('GoalPlan'),
        new RemoteReconTrialService('RemoteReconTrial'),
        new NativeEconomicTrialOpsService('NativeEconomicTrialOps'),
        new RemoteEconomicTrialService('RemoteEconomicTrial'),
        new RemoteMiningService('RemoteMining'),
        new SpawnBureauService('SpawnBureau'),
        new SpawnService('Spawn'),
        new TaskGuardService('TaskGuard'),
        new ResourceMarketService('ResourceMarket'),
        new RemoteMiningStrategyService('RemoteMiningStrategy'),
        new MinerStrategyService('MinerStrategy'),
        new BuilderStrategyService('BuilderStrategy'),
        new RepairerStrategyService('RepairerStrategy'),
        new HaulerStrategyService('HaulerStrategy'),
        new UpgraderStrategyService('UpgraderStrategy'),
        new DefenderStrategyService('DefenderStrategy'),
        new LinkService('Link'),
        new StructureLifecycleService('StructureLifecycle'),
        new CityPlanDebugService('CityPlanDebug'),
        new CreepRetirementService('CreepRetirement'),
        new TowerDefenseService('TowerDefense'),
        new CityPlannerService('CityPlanner'),
        new DefensePlannerService('DefensePlanner'),
        new MaintenancePlannerService('MaintenancePlanner'),
        new RoadPlannerService('RoadPlanner'),
        new LabService('Lab'),
        new MarketService('Market'),
        new EmpireMetricsService('EmpireMetrics'),
        new TrialEvidenceWindowService('TrialEvidenceWindow'),
        new HomeEvidenceWindowService('HomeEvidenceWindow')
    ];
}

function getServices() {
    if (!global.EmpireServices || global.EmpireServicesVersion !== SERVICE_VERSION) {
        global.EmpireServices = createServices();
        global.EmpireServicesVersion = SERVICE_VERSION;
    }
    return global.EmpireServices;
}

function prepareMemory() {
    Memory;
}

function runServicePhase(services, phase) {
    for (const service of services) {
        const decision = ServiceScheduler.decision(service.name, phase);
        if (!decision.shouldRun) continue;
        RuntimeTelemetry.measure(service.name, phase, () => service[phase]());
    }
}

export function loop() {
    prepareMemory();
    MemoryConfig.ensureDefaults();
    RuntimeTelemetry.beginTick(SERVICE_VERSION);
    ServiceScheduler.beginTick();

    const services = getServices();
    EventBus.beginTick();

    runServicePhase(services, 'init');
    runServicePhase(services, 'analyze');

    RuntimeTelemetry.measure('EventBus', 'dispatch', () => EventBus.dispatch());

    runServicePhase(services, 'run');
    RuntimeTelemetry.measure('ActionParser', 'run', () => {
        for (const name in Game.creeps) ActionParser.run(Game.creeps[name]);
    });
    runServicePhase(services, 'cleanup');
    RuntimeTelemetry.finishTick();
}
