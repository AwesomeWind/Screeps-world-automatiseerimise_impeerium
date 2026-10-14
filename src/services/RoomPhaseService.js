import BaseService from '../core/BaseService.js';
import { currentCreepPopulation } from '../core/CreepPopulation.js';
import { ensureEmpireControl } from '../config/EmpirePolicy.js';
import { isControllerContainerAsset } from '../planning/CityPlanLegacyAdapter.js';

const SPAWN_RESCUE_ENTER_RATIO = 0.5;
const SPAWN_RESCUE_EXIT_RATIO = 0.85;
const STORAGE_RESCUE_RESERVE = 1000;
// Screeps Spawn 自动回充的规则上限，不是经济 policy 阈值。
const SPAWN_AUTO_REGEN_LIMIT = 300;

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
            maintenancePressure: maintenanceTargets.length,
            recovery: this.buildRecovery(room, spawnEnergy, storageEnergy, energyPosture)
        };
    }

    buildRecovery(room, spawnEnergy, storageEnergy, energyPosture) {
        const policy = ensureEmpireControl().policy.economyRecovery;
        const coreUsable = { miner: 0, hauler: 0 };
        const coreUpcoming = { miner: 0, hauler: 0 };
        let carriedEnergy = 0;
        for (const entry of currentCreepPopulation()) {
            if (entry.roomName !== room.name) continue;
            if (entry.memory.role === 'hauler' && ['active', 'retiring'].includes(entry.state) && entry.activeParts.carry > 0) {
                const creep = Game.creeps[entry.name];
                if (creep && creep.room && creep.room.name === room.name && creep.store && creep.store.getUsedCapacity) {
                    const energy = creep.store.getUsedCapacity(RESOURCE_ENERGY);
                    if (Number.isFinite(energy) && energy > 0) carriedEnergy += energy;
                }
            }
            if (!entry.coversQuota || coreUsable[entry.memory.role] === undefined) continue;
            if (entry.state === 'active' && entry.bodyKnown) coreUsable[entry.memory.role]++;
            if (['spawning', 'accepted'].includes(entry.state)) coreUpcoming[entry.memory.role]++;
        }
        const hasSpawn = Object.values(Game.spawns || {}).some(spawn => spawn.room && spawn.room.name === room.name &&
            (typeof spawn.isActive !== 'function' || spawn.isActive()));
        const minerGap = coreUsable.miner === 0;
        const haulerGap = coreUsable.hauler === 0;
        const neededEnergy = minerGap && coreUpcoming.miner === 0 ? BODYPART_COST[WORK] + BODYPART_COST[MOVE] :
            (haulerGap && coreUpcoming.hauler === 0 ? BODYPART_COST[CARRY] + BODYPART_COST[MOVE] : 0);
        let replenishable = carriedEnergy;
        if (neededEnergy > spawnEnergy.current && coreUsable.hauler > 0) {
            const cityPlan = Memory.rooms && Memory.rooms[room.name] && Memory.rooms[room.name].cityPlan;
            const stores = [room.storage, room.terminal, ...(room.find ? room.find(FIND_STRUCTURES) : [])];
            const seen = new Set();
            for (const target of stores) {
                if (!target || seen.has(target.id) || !target.store || !target.store.getUsedCapacity) continue;
                seen.add(target.id);
                if (cityPlan && isControllerContainerAsset(cityPlan, target)) continue;
                if (target === room.storage || target === room.terminal || target.structureType === STRUCTURE_CONTAINER) replenishable += target.store.getUsedCapacity(RESOURCE_ENERGY) || 0;
            }
            for (const drop of room.find ? room.find(FIND_DROPPED_RESOURCES) : []) {
                if (drop.resourceType === RESOURCE_ENERGY) replenishable += drop.amount || 0;
            }
        }
        const canRegenerate = hasSpawn && (room.energyAvailable || 0) < SPAWN_AUTO_REGEN_LIMIT && neededEnergy <= SPAWN_AUTO_REGEN_LIMIT;
        const awaitingRegeneration = canRegenerate && neededEnergy > spawnEnergy.current + replenishable;
        const roomMemory = Memory.rooms && Memory.rooms[room.name];
        const previousSpawnRescue = roomMemory && roomMemory.recoverySpawnRescue === true;
        const spawnRescue = spawnEnergy.ratio < SPAWN_RESCUE_ENTER_RATIO ||
            (previousSpawnRescue && spawnEnergy.ratio < SPAWN_RESCUE_EXIT_RATIO);
        if (roomMemory) roomMemory.recoverySpawnRescue = spawnRescue;
        const blockedBy = [];
        if (!hasSpawn) blockedBy.push('owned_spawn_missing');
        if (!canRegenerate && neededEnergy > spawnEnergy.current + replenishable && coreUsable.miner === 0 && coreUpcoming.miner === 0) blockedBy.push('recovery_energy_unavailable');
        if (!canRegenerate && haulerGap && coreUpcoming.hauler === 0 && spawnEnergy.current + carriedEnergy < BODYPART_COST[CARRY] + BODYPART_COST[MOVE]) blockedBy.push('transport_bootstrap_unavailable');
        let mode = 'normal';
        if (blockedBy.length > 0) mode = 'support_required';
        else if (minerGap) mode = 'miner_gap';
        else if (haulerGap) mode = 'hauler_gap';
        else if (energyPosture !== 'normal' || spawnRescue) mode = 'spawn_energy';
        else if (room.storage && Number.isFinite(policy.reserveCritical) && storageEnergy < policy.reserveCritical) mode = 'reserve_low';
        const reasons = mode === 'normal' ? [] : [mode];
        if (awaitingRegeneration) reasons.push('awaiting_spawn_regeneration');
        return { mode, reasons, evaluatedAt: Game.time, coreUsable, coreUpcoming, blockedBy };
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

        for (const entry of currentCreepPopulation()) {
            if (!entry.coversQuota || entry.roomName !== roomName) continue;
            if (counts[entry.memory.role] !== undefined) counts[entry.memory.role]++;
        }

        return counts;
    }
}

export default RoomPhaseService;
