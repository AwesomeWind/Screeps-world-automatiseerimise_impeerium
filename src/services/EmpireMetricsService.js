import BaseService from '../core/BaseService.js';
import { ensureEmpireControl } from '../config/EmpirePolicy.js';

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

class EmpireMetricsService extends BaseService {
    cleanup() {
        const control = ensureEmpireControl();
        const interval = Math.max(1, control.policy.telemetry.metricsInterval || 10);
        if (Game.time % interval !== 0) return;

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
        }
    }
}

export default EmpireMetricsService;
