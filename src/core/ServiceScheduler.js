import { ensureEmpireControl } from '../config/EmpirePolicy.js';
import { recordEmpireEvent } from './EmpireEventLog.js';

const P0 = new Set([
    'RoomCache', 'WarIntel', 'WarStrategy', 'CombatPlanner', 'Security', 'RoomPhase',
    'RemoteReconTrial', 'RemoteEconomicTrial', 'SpawnBureau', 'Spawn', 'TaskGuard', 'ResourceMarket', 'MinerStrategy',
    'BuilderStrategy', 'RepairerStrategy', 'HaulerStrategy', 'UpgraderStrategy',
    'DefenderStrategy', 'Link', 'StructureLifecycle', 'CreepRetirement', 'TowerDefense'
]);
const P1 = new Set(['EmpireMetrics', 'RoomGovernor']);
const P2 = new Set(['CityPlanner', 'DefensePlanner', 'MaintenancePlanner', 'RoadPlanner', 'Lab', 'Market', 'RemoteMining']);
const P3 = new Set(['CityPlanDebug']);

function tierFor(name) {
    if (P0.has(name)) return 'P0';
    if (P1.has(name)) return 'P1';
    if (P2.has(name)) return 'P2';
    if (P3.has(name)) return 'P3';
    return 'P0';
}

function nextMode(previous, bucket, policy) {
    if (bucket === null) return 'normal';
    if (bucket < policy.criticalBelow) return 'critical';
    if (previous === 'critical' && bucket < policy.recoveryAbove) return 'recovery';
    if (previous === 'recovery' && bucket < policy.recoveryAbove) return 'recovery';
    if (bucket < policy.constrainedBelow) return 'constrained';
    return 'normal';
}

function allowed(mode, tier, phase) {
    if (phase === 'init' || phase === 'cleanup') return true;
    if (mode === 'critical') return tier === 'P0' || tier === 'P1';
    if (mode === 'constrained' || mode === 'recovery') return tier !== 'P3';
    return true;
}

const ServiceScheduler = {
    beginTick() {
        const control = ensureEmpireControl();
        const policy = control.policy.scheduler;
        const previous = control.runtime.cpuMode || 'normal';
        const bucket = Game.cpu && typeof Game.cpu.bucket === 'number' ? Game.cpu.bucket : null;
        const mode = nextMode(previous, bucket, policy);
        control.runtime.cpuMode = mode;
        control.runtime.cpuBucket = bucket;
        control.runtime.cpuModeEvaluatedAt = Game.time;
        if (mode !== previous) {
            recordEmpireEvent('cpu_mode_changed', mode === 'critical' ? 'warning' : 'info', {
                from: previous,
                to: mode,
                bucket
            });
        }
        return mode;
    },

    decision(serviceName, phase) {
        const control = ensureEmpireControl();
        const mode = control.runtime.cpuMode || 'normal';
        const tier = tierFor(serviceName);
        const wouldRun = allowed(mode, tier, phase);
        const enforce = control.policy.scheduler.enforce === true;
        return {
            shouldRun: enforce ? wouldRun : true,
            wouldRun,
            tier,
            mode,
            reason: wouldRun ? 'scheduled' : `${mode}_${tier}_deferred_${phase}`
        };
    }
};

export default ServiceScheduler;
