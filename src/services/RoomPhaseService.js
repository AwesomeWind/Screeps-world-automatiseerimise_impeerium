import BaseService from '../core/BaseService.js';

class RoomPhaseService extends BaseService {
    analyze() {
        global.RoomPhase = {};

        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            global.RoomPhase[roomName] = this.buildPhase(room);
        }
    }

    buildPhase(room) {
        const roomName = room.name;
        const roles = this.roleCounts(roomName);
        const maintenancePlan = Memory.rooms &&
            Memory.rooms[roomName] &&
            Memory.rooms[roomName].maintenancePlan;
        const maintenanceTargets = maintenancePlan && maintenancePlan.targets ? maintenancePlan.targets : [];
        const constructionSites = room.find ? room.find(FIND_CONSTRUCTION_SITES).length : 0;

        const hasStorage = !!room.storage;
        const hasTerminal = !!room.terminal;
        const phase = this.phaseFor(room, roles, hasStorage, hasTerminal);

        return {
            phase,
            hasStorage,
            hasTerminal,
            energyCritical: (room.energyAvailable || 0) < Math.max(200, Math.floor((room.energyCapacityAvailable || 0) * 0.7)),
            logisticsMode: this.logisticsModeFor(phase, roles),
            constructionPressure: constructionSites,
            maintenancePressure: maintenanceTargets.length
        };
    }

    phaseFor(room, roles, hasStorage, hasTerminal) {
        if (hasTerminal) return 'terminal';
        if (hasStorage) return 'storage';
        if (roles.miner === 0 || roles.hauler === 0) return 'bootstrap';
        return 'early';
    }

    logisticsModeFor(phase, roles) {
        if ((phase === 'storage' || phase === 'terminal') && roles.hauler > 0) return 'hauler';
        return 'self_supply';
    }

    roleCounts(roomName) {
        const counts = {
            miner: 0,
            hauler: 0,
            upgrader: 0,
            builder: 0,
            repairer: 0
        };

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (!creep.memory) continue;
            if ((creep.memory.homeRoom || (creep.room && creep.room.name)) !== roomName) continue;
            if (counts[creep.memory.role] !== undefined) counts[creep.memory.role]++;
        }

        if (typeof Memory !== 'undefined' && Memory.creeps) {
            for (const name in Memory.creeps) {
                if (Game.creeps[name]) continue;
                const memory = Memory.creeps[name];
                if (!memory || memory.homeRoom !== roomName) continue;
                if (counts[memory.role] !== undefined) counts[memory.role]++;
            }
        }

        return counts;
    }
}

export default RoomPhaseService;
