import BaseService from '../core/BaseService.js';

const SPAWN_RESCUE_ENTER_RATIO = 0.5;
const SPAWN_RESCUE_EXIT_RATIO = 0.85;
const STORAGE_RESCUE_RESERVE = 1000;

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
        const spawnEnergy = this.spawnEnergyState(room);
        const storageEnergy = this.storageEnergy(room);
        const energyPosture = this.energyPostureFor(room, roles, hasStorage, spawnEnergy, storageEnergy);
        this.persistEnergyPosture(roomName, energyPosture);

        return {
            phase,
            hasStorage,
            hasTerminal,
            energyCritical: (room.energyAvailable || 0) < Math.max(200, Math.floor((room.energyCapacityAvailable || 0) * 0.7)),
            spawnEnergyRatio: spawnEnergy.ratio,
            storageEnergy,
            energyPosture,
            storageRescueActive: energyPosture === 'spawn_rescue' || energyPosture === 'bootstrap_rescue',
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

    spawnEnergyState(room) {
        let current = 0;
        let capacity = 0;
        const structures = room.find ? room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType === STRUCTURE_SPAWN ||
                    structure.structureType === STRUCTURE_EXTENSION) &&
                    structure.store &&
                    structure.store.getUsedCapacity &&
                    structure.store.getFreeCapacity;
            }
        }) : [];

        for (const structure of structures) {
            const used = structure.store.getUsedCapacity(RESOURCE_ENERGY);
            const free = structure.store.getFreeCapacity(RESOURCE_ENERGY);
            current += used;
            capacity += used + free;
        }

        if (capacity === 0) {
            current = room.energyAvailable || 0;
            capacity = room.energyCapacityAvailable || current || 0;
        }

        return {
            current,
            capacity,
            ratio: capacity > 0 ? current / capacity : 1
        };
    }

    storageEnergy(room) {
        if (!room.storage || !room.storage.store || !room.storage.store.getUsedCapacity) return 0;
        return room.storage.store.getUsedCapacity(RESOURCE_ENERGY);
    }

    energyPostureFor(room, roles, hasStorage, spawnEnergy, storageEnergy) {
        if (!hasStorage || storageEnergy <= 0) return 'normal';

        const recoveryCost = BODYPART_COST[WORK] + BODYPART_COST[MOVE];
        if (roles.miner === 0 && spawnEnergy.current < recoveryCost) return 'bootstrap_rescue';

        if (storageEnergy <= STORAGE_RESCUE_RESERVE) return 'normal';

        const previous = Memory.rooms &&
            Memory.rooms[room.name] &&
            Memory.rooms[room.name].energyPosture;
        if (previous === 'spawn_rescue' && spawnEnergy.ratio < SPAWN_RESCUE_EXIT_RATIO) {
            return 'spawn_rescue';
        }
        if (spawnEnergy.ratio < SPAWN_RESCUE_ENTER_RATIO) return 'spawn_rescue';
        return 'normal';
    }

    persistEnergyPosture(roomName, energyPosture) {
        if (typeof Memory === 'undefined') return;
        if (!Memory.rooms) Memory.rooms = {};
        if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
        Memory.rooms[roomName].energyPosture = energyPosture;
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
