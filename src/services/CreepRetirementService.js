import BaseService from '../core/BaseService.js';
import { currentCreepPopulation } from '../core/CreepPopulation.js';
import { recoveryRestricted } from './RoomRecoveryPolicy.js';
import TaskTypes from '../core/TaskTypes.js';
import { assignTask } from '../core/TaskMetadata.js';

const IDLE_RETIRE_THRESHOLD = 100;
const RETIRABLE_ROLES = {
    builder: true,
    repairer: true,
    upgrader: true,
    hauler: true
};
const PROTECTED_LAST_ROLE = {
    hauler: true,
    upgrader: true,
    repairer: true
};

class CreepRetirementService extends BaseService {
    analyze() {
        const counts = this.roleCountsByRoom();

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (!creep || !creep.memory) continue;

            if (!RETIRABLE_ROLES[creep.memory.role]) {
                this.resetIdle(creep);
                continue;
            }

            const roomName = creep.memory.homeRoom || (creep.room && creep.room.name);
            if (recoveryRestricted(roomName)) {
                this.resetIdle(creep);
                continue;
            }
            const roomPhase = global.RoomPhase && global.RoomPhase[roomName];
            if (!this.isStableRoom(roomPhase, counts[roomName])) {
                this.resetRetirement(creep);
                continue;
            }

            if (creep.memory.task) {
                creep.memory.idleTicks = 0;
                if (creep.memory.retire) this.resetRetirement(creep);
                continue;
            }

            creep.memory.idleTicks = (creep.memory.idleTicks || 0) + 1;
            if (creep.memory.idleTicks < IDLE_RETIRE_THRESHOLD) continue;
            if (!this.canRetire(creep, counts[roomName])) continue;

            creep.memory.retire = true;
            creep.memory.retireReason = 'idle_surplus';
            if (!creep.memory.retireSince) creep.memory.retireSince = Game.time;

            const unloadTask = this.createUnloadTask(creep);
            if (unloadTask) {
                assignTask(creep, unloadTask);
                continue;
            }

            if (typeof creep.suicide === 'function') creep.suicide();
        }
    }

    roleCountsByRoom() {
        const counts = {};
        for (const entry of currentCreepPopulation()) {
            if (entry.state !== 'active' || !entry.coversQuota) continue;
            const roomName = entry.roomName;
            if (!roomName) continue;
            if (!counts[roomName]) counts[roomName] = {};
            counts[roomName][entry.memory.role] = (counts[roomName][entry.memory.role] || 0) + 1;
        }
        return counts;
    }

    isStableRoom(roomPhase, roleCounts = {}) {
        if (!roomPhase) return false;
        if (roomPhase.energyPosture && roomPhase.energyPosture !== 'normal') return false;
        return (roleCounts.miner || 0) > 0 &&
            (roleCounts.hauler || 0) > 0 &&
            (roleCounts.upgrader || 0) > 0;
    }

    canRetire(creep, roleCounts = {}) {
        const role = creep.memory.role;
        if (PROTECTED_LAST_ROLE[role] && (roleCounts[role] || 0) <= 1) return false;
        return true;
    }

    createUnloadTask(creep) {
        const resourceTypes = this.carriedResourceTypes(creep);
        if (resourceTypes.length === 0) return null;

        const room = creep.room || {};
        const target = room.storage || room.terminal;
        if (!target) return null;

        return {
            type: TaskTypes.TRANSFER,
            targetId: target.id,
            resourceType: resourceTypes[0]
        };
    }

    carriedResourceTypes(creep) {
        if (!creep.store || typeof creep.store.getUsedCapacity !== 'function') return [];
        const resourceTypes = [
            typeof RESOURCE_ENERGY === 'undefined' ? null : RESOURCE_ENERGY,
            typeof RESOURCE_UTRIUM === 'undefined' ? null : RESOURCE_UTRIUM,
            typeof RESOURCE_LEMERGIUM === 'undefined' ? null : RESOURCE_LEMERGIUM,
            typeof RESOURCE_UTRIUM_LEMERGITE === 'undefined' ? null : RESOURCE_UTRIUM_LEMERGITE
        ].filter(Boolean);
        return resourceTypes.filter((resourceType) => creep.store.getUsedCapacity(resourceType) > 0);
    }

    resetIdle(creep) {
        if (!creep || !creep.memory) return;
        creep.memory.idleTicks = 0;
        this.resetRetirement(creep);
    }

    resetRetirement(creep) {
        delete creep.memory.retire;
        delete creep.memory.retireReason;
        delete creep.memory.retireSince;
    }
}

export default CreepRetirementService;
