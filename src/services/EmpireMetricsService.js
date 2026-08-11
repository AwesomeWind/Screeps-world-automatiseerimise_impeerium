import BaseService from '../core/BaseService.js';
import { ensureEmpireControl } from '../config/EmpirePolicy.js';

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
                resourceMarketStats: market && market.stats ? { ...market.stats } : {}
            };
        }
    }
}

export default EmpireMetricsService;
