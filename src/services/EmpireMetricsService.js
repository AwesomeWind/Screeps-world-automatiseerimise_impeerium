import BaseService from '../core/BaseService.js';
import { ensureEmpireControl } from '../config/EmpirePolicy.js';
import { beginObservationTick, prepareObservationSample, pauseObservation } from '../core/MetricObservationWindow.js';

function compactUpgradeWorkControl(roomName, governor, bureau, roomControl) {
    const upgradeCapability = governor && governor.capabilities && governor.capabilities.upgradeWork;
    const recommendation = governor && Array.isArray(governor.spawnRecommendations)
        ? governor.spawnRecommendations.find((entry) => entry && entry.capability === 'upgradeWork')
        : undefined;
    const legacyIntents = bureau && Array.isArray(bureau.legacyIntents) ? bureau.legacyIntents : undefined;
    const arbitration = bureau && bureau.arbitration && bureau.arbitration.upgradeWork;
    const persistent = roomControl && roomControl.capabilityControl && roomControl.capabilityControl.upgradeWork;
    const quotaKey = `upgrader:${roomName}:controller`;

    return {
        legacyIntentPresent: legacyIntents === undefined
            ? null
            : legacyIntents.some((intent) => intent && intent.quotaKey === quotaKey),
        governorRecommended: recommendation === undefined && !(governor && Array.isArray(governor.spawnRecommendations))
            ? null
            : recommendation !== undefined,
        adoptedSource: arbitration && typeof arbitration.adoptedSource === 'string' ? arbitration.adoptedSource : null,
        action: arbitration && typeof arbitration.action === 'string' ? arbitration.action : null,
        current: upgradeCapability && Number.isFinite(upgradeCapability.current) ? upgradeCapability.current : null,
        spawning: upgradeCapability && Number.isFinite(upgradeCapability.spawning) ? upgradeCapability.spawning : null,
        required: upgradeCapability && Number.isFinite(upgradeCapability.required) ? upgradeCapability.required : null,
        gap: upgradeCapability && Number.isFinite(upgradeCapability.gap) ? upgradeCapability.gap : null,
        fallbackCount: persistent && Number.isFinite(persistent.fallbackCount) ? persistent.fallbackCount : null,
        autoSuspended: persistent && typeof persistent.autoSuspended === 'boolean' ? persistent.autoSuspended : null
    };
}

function compactRecovery(recovery) {
    if (!recovery) return null;
    return {
        mode: recovery.mode || null,
        reasons: Array.isArray(recovery.reasons) ? recovery.reasons.slice(0, 8) : [],
        evaluatedAt: Number.isFinite(recovery.evaluatedAt) ? recovery.evaluatedAt : null,
        coreUsable: recovery.coreUsable ? { miner: recovery.coreUsable.miner, hauler: recovery.coreUsable.hauler } : null,
        coreUpcoming: recovery.coreUpcoming ? { miner: recovery.coreUpcoming.miner, hauler: recovery.coreUpcoming.hauler } : null,
        blockedBy: Array.isArray(recovery.blockedBy) ? recovery.blockedBy.slice(0, 8) : []
    };
}

function compactCoreCapabilities(governor) {
    const capabilities = {};
    for (const name of ['harvestWork', 'logisticsCarry']) {
        const capability = governor && governor.capabilities && governor.capabilities[name];
        capabilities[name] = {};
        for (const field of ['current', 'spawning', 'retiring', 'required', 'gap']) {
            capabilities[name][field] = capability && Number.isFinite(capability[field]) ? capability[field] : null;
        }
    }
    return capabilities;
}

function constructionProgress(roomName) {
    const cache = global.RoomCache && global.RoomCache[roomName];
    if (!cache || !Array.isArray(cache.constructionSites) || typeof Game.getObjectById !== 'function') return null;
    let progress = 0;
    for (const id of cache.constructionSites) {
        const site = Game.getObjectById(id);
        if (!site || !Number.isFinite(site.progress)) return null;
        progress += site.progress;
    }
    return progress;
}

class EmpireMetricsService extends BaseService {
    cleanup() {
        const control = ensureEmpireControl();
        if (control.policy.telemetry.enabled === false) return;
        this.prepareRemoteObservation(control);
        const interval = Math.max(1, control.policy.telemetry.metricsInterval || 10);
        if (Game.time % interval !== 0) return;

        if (global.RemoteReconTrial?.summary) {
            control.metrics.reconTrial = { ...global.RemoteReconTrial.summary, capturedAt: Game.time };
        }
        if (global.GoalPlan) {
            const summary = global.GoalPlan.summary || {};
            const fresh = global.GoalPlan.tick === Game.time;
            control.metrics.goalPlanning = { capturedAt: Game.time, status: fresh ? global.GoalPlan.status : 'stale',
                goalCount: summary.goalCount || 0, planCount: summary.planCount || 0,
                achievedCount: summary.achievedCount || 0, readyCount: fresh ? summary.readyCount || 0 : 0,
                blockedCount: summary.blockedCount || 0, reasonCodes: (summary.reasonCodes || []).slice(0, 8) };
        }

        const roleCountsByRoom = {};
        for (const name in Game.creeps) {
            const memory = Game.creeps[name].memory || {};
            if (!memory.homeRoom || !memory.role) continue;
            if (!roleCountsByRoom[memory.homeRoom]) roleCountsByRoom[memory.homeRoom] = {};
            roleCountsByRoom[memory.homeRoom][memory.role] =
                (roleCountsByRoom[memory.homeRoom][memory.role] || 0) + 1;
        }

        const spawningByRoom = {};
        for (const name in Game.spawns) {
            const spawn = Game.spawns[name];
            if (!spawn.spawning || !spawn.room) continue;
            spawningByRoom[spawn.room.name] = (spawningByRoom[spawn.room.name] || 0) + 1;
        }

        if (!control.metrics.rooms) control.metrics.rooms = {};
        const energyResource = typeof RESOURCE_ENERGY === 'undefined' ? 'energy' : RESOURCE_ENERGY;
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            const phase = global.RoomPhase && global.RoomPhase[roomName] ? global.RoomPhase[roomName] : {};
            const market = global.ResourceMarket && global.ResourceMarket[roomName]
                ? global.ResourceMarket[roomName]
                : null;
            const governor = global.RoomGovernor && global.RoomGovernor[roomName]
                ? global.RoomGovernor[roomName]
                : null;
            const bureau = global.SpawnBureau && global.SpawnBureau[roomName]
                ? global.SpawnBureau[roomName]
                : null;
            const roomControl = control.rooms && control.rooms[roomName] ? control.rooms[roomName] : null;
            const comparison = governor && governor.comparison ? governor.comparison : null;
            const storageEnergy = room.storage && room.storage.store && typeof room.storage.store.getUsedCapacity === 'function'
                ? (room.storage.store.getUsedCapacity(energyResource) || 0)
                : 0;

            control.metrics.rooms[roomName] = {
                capturedAt: Game.time,
                codeVersion: global.EmpireTelemetry ? global.EmpireTelemetry.codeVersion : (global.EmpireServicesVersion || null),
                recovery: compactRecovery(phase.recovery),
                spawnIntake: global.SpawnIntake && global.SpawnIntake[roomName] ? {
                    ...global.SpawnIntake[roomName], reasons: { ...global.SpawnIntake[roomName].reasons }
                } : null,
                coreCapabilities: compactCoreCapabilities(governor),
                controllerTicksToDowngrade: Number.isFinite(room.controller.ticksToDowngrade) ? room.controller.ticksToDowngrade : null,
                controllerLevel: Number.isFinite(room.controller.level) ? room.controller.level : null,
                controllerProgress: Number.isFinite(room.controller.progress) ? room.controller.progress : null,
                constructionProgressSum: constructionProgress(roomName),
                phase: phase.phase || null,
                energyPosture: phase.energyPosture || null,
                energyAvailable: room.energyAvailable || 0,
                energyCapacity: room.energyCapacityAvailable || 0,
                spawnEnergyRatio: phase.spawnEnergyRatio === undefined ? null : phase.spawnEnergyRatio,
                storageEnergy,
                constructionPressure: phase.constructionPressure || 0,
                maintenancePressure: phase.maintenancePressure || 0,
                roleCounts: roleCountsByRoom[roomName] || {},
                spawningCount: spawningByRoom[roomName] || 0,
                resourceMarketStats: market && market.stats ? { ...market.stats } : {},
                resourceFeedbackTotals: market && market.feedbackTotals ? { ...market.feedbackTotals } : {},
                governorLifecycle: governor ? governor.lifecycle || null : null,
                governorHealth: governor && governor.health && governor.health.overall
                    ? {
                        status: governor.health.overall.status,
                        score: governor.health.overall.score
                    }
                    : null,
                governorStaleFor: governor && governor.staleFor !== undefined ? governor.staleFor : null,
                spawnDecisionDiff: comparison
                    ? {
                        matched: comparison.matched.length,
                        missing: comparison.missing.length,
                        excess: comparison.excess.length,
                        priorityMismatches: comparison.priorityMismatches.length,
                        bodyProfileMismatches: comparison.bodyProfileMismatches.length
                    }
                    : null,
                upgradeWorkControl: compactUpgradeWorkControl(roomName, governor, bureau, roomControl)
            };
            const historyInterval = Math.max(1, control.policy.telemetry.metricsHistoryInterval || 50);
            if (Game.time % historyInterval === 0) this.recordHistory(control, roomName);
        }
    }

    prepareRemoteObservation(control) {
        const scope = Object.values(global.RemoteMining || {}).find(value => value.config.enabled && value.operation.status !== 'disabled');
        const telemetry = global.EmpireTelemetry;
        if (!scope || !control.policy.remoteMining.enabled) {
            if (control.metrics.remoteObservation) control.metrics.remoteObservation = pauseObservation(
                control.metrics.remoteObservation, { tick: Game.time, reason: 'pilot_disabled' });
            return;
        }
        if (!telemetry?.enabled || telemetry.tick !== Game.time) return;
        const operation = scope.operation;
        const home = scope.facts.home;
        const recovery = global.RoomPhase?.[scope.config.baseRoom]?.recovery;
        const market = global.ResourceMarket?.[scope.config.baseRoom];
        const identity = { codeVersion: telemetry.codeVersion, scopeId: operation.remoteId, epoch: operation.epoch };
        let state = beginObservationTick(control.metrics.remoteObservation, { tick: telemetry.tick, ...identity });
        const ownerCount = ['supply', 'demand'].reduce((sum, side) => sum + Object.values(market?.reservations?.[side] || {})
            .filter(Boolean).reduce((count, record) => count + Object.keys(record.owners || {}).length, 0), 0);
        const finite = value => Number.isFinite(value) ? value : null;
        const ledger = operation.ledger;
        const coreGap = role => Number.isFinite(recovery?.coreUsable?.[role]) ? Math.max(0, 1 - recovery.coreUsable[role]) : null;
        state = prepareObservationSample(state, { tick: Game.time, identity,
            fields: {
                controllerProgress: finite(home?.controller?.progress), controllerLevel: finite(home?.controller?.level),
                controllerDowngrade: finite(home?.controller?.ticksToDowngrade),
                coreMinerGap: coreGap('miner'), coreHaulerGap: coreGap('hauler'),
                homeReserve: home?.storage?.store ? finite(home.storage.store.getUsedCapacity(RESOURCE_ENERGY)) : null,
                sinkCapacity: scope.config.homeDeliveryTargetIds.reduce((sum, id) => {
                    const target = Game.getObjectById(id);
                    return sum + (target?.store?.getFreeCapacity(RESOURCE_ENERGY) || 0);
                }, 0),
                reservationOwners: ownerCount, transportGap: finite(operation.transportCapacity?.gap),
                outboundTicks: finite(operation.route?.outboundTicks), inboundTicks: finite(operation.route?.inboundTicks),
                rollingCpuP95: finite(control.telemetry.totalCpuP95),
                spawnEnergyUnknownUpperBound: ledger.spawnEnergyUnknownUpperBound || 0
            },
            counters: {
                returnedEnergyConfirmed: ledger.returnedEnergyConfirmed || 0,
                spawnEnergyConfirmed: ledger.spawnEnergyConfirmed || 0,
                spawnCostUnknown: ledger.spawnCostUnknown || 0,
                infrastructureEnergyConfirmed: ledger.infrastructureEnergyConfirmed || 0,
                infrastructureEnergyUnknownUpperBound: ledger.infrastructureEnergyUnknownUpperBound || 0,
                confirmationUnknown: ledger.confirmationUnknown || 0,
                reservationReleased: ledger.reservationReleased || 0,
                carriedLossUnknownUpperBound: ledger.carriedLossUnknownUpperBound || 0,
                pickedUpEnergyConfirmed: ledger.pickedUpEnergyConfirmed || 0
            },
            flags: {
                state_active: operation.status === 'active', state_preparing: operation.status === 'preparing',
                state_discovering: operation.status === 'discovering', state_suspended: operation.status === 'suspended',
                state_recovering: operation.status === 'recovering', state_awaiting_source_selection: operation.status === 'awaiting_source_selection',
                existingContainer: operation.containerReady === true,
                containerWork: (ledger.infrastructureEnergyConfirmed || 0) > 0,
                homeHealthy: scope.facts.homeHealthy === true, returnedEnergy: (ledger.returnedEnergyConfirmed || 0) > 0,
                roleReplacement: operation.replacementObserved === true,
                dangerPause: operation.reasons.includes('danger'), fullSink: !scope.facts.sinkAvailable,
                budgetPause: operation.reasons.includes('spawn_budget') || operation.reasons.includes('infrastructure_budget'),
                manualHold: scope.config.hold === true,
                spawnCostUnknown: (ledger.spawnCostUnknown || 0) > 0
            }
        });
        control.metrics.remoteObservation = state;
    }

    recordHistory(control, roomName) {
        if (!control.metrics.histories) control.metrics.histories = {};
        const latest = control.metrics.rooms[roomName];
        let history = control.metrics.histories[roomName];
        if (!history || history.codeVersion !== latest.codeVersion || !Array.isArray(history.samples)) {
            history = { codeVersion: latest.codeVersion, samples: [] };
            control.metrics.histories[roomName] = history;
        }
        if (history.samples.length && history.samples[history.samples.length - 1].tick === Game.time) return;
        history.samples.push({
            tick: Game.time, codeVersion: latest.codeVersion,
            energyAvailable: latest.energyAvailable, storageEnergy: latest.storageEnergy,
            spawnEnergyRatio: latest.spawnEnergyRatio, controllerTicksToDowngrade: latest.controllerTicksToDowngrade,
            controllerLevel: latest.controllerLevel, controllerProgress: latest.controllerProgress,
            constructionPressure: latest.constructionPressure, constructionProgressSum: latest.constructionProgressSum,
            recoveryMode: latest.recovery ? latest.recovery.mode : null,
            spawnIntake: latest.spawnIntake,
            coreUsable: latest.recovery ? latest.recovery.coreUsable : null,
            coreUpcoming: latest.recovery ? latest.recovery.coreUpcoming : null,
            logistics: { ...latest.resourceMarketStats },
            logisticsTotals: { ...latest.resourceFeedbackTotals },
            totalCpu: global.EmpireTelemetry && Number.isFinite(global.EmpireTelemetry.totalCpu) ? global.EmpireTelemetry.totalCpu : null,
            cpuBucket: Game.cpu && Number.isFinite(Game.cpu.bucket) ? Game.cpu.bucket : null
        });
        const requested = control.policy.telemetry.metricsHistoryLimit;
        const limit = Math.min(50, Number.isSafeInteger(requested) && requested > 0 ? requested : 50);
        if (history.samples.length > limit) history.samples.splice(0, history.samples.length - limit);
    }
}

export default EmpireMetricsService;
