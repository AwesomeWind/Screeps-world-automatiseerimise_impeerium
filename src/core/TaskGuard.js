import TaskTypes from './TaskTypes.js';

const VALID_TASK_TYPES = new Set(Object.values(TaskTypes));
const ROLE_ALLOWLIST = {
    builder: new Set([TaskTypes.BUILD, TaskTypes.WITHDRAW, TaskTypes.PICKUP, TaskTypes.UPGRADE, TaskTypes.MOVE_TO]),
    repairer: new Set([TaskTypes.REPAIR, TaskTypes.WITHDRAW, TaskTypes.PICKUP, TaskTypes.UPGRADE, TaskTypes.MOVE_TO]),
    upgrader: new Set([TaskTypes.UPGRADE, TaskTypes.WITHDRAW, TaskTypes.PICKUP, TaskTypes.MOVE_TO]),
    hauler: new Set([TaskTypes.TRANSFER, TaskTypes.WITHDRAW, TaskTypes.PICKUP, TaskTypes.MOVE_TO]),
    miner: new Set([TaskTypes.HARVEST, TaskTypes.MOVE_TO]),
    remoteMiner: new Set([TaskTypes.HARVEST, TaskTypes.MOVE_TO]),
    defender: new Set([TaskTypes.ATTACK, TaskTypes.RANGED_ATTACK, TaskTypes.MOVE_TO]),
    reserver: new Set([TaskTypes.RESERVE, TaskTypes.MOVE_TO]),
    scout: new Set([TaskTypes.MOVE_TO])
};

function roomHasConstructionSites(room) {
    if (!room || typeof room.find !== 'function') return false;
    const sites = room.find(FIND_CONSTRUCTION_SITES);
    return Array.isArray(sites) && sites.length > 0;
}

function targetExists(task) {
    if (task.type === TaskTypes.MOVE_TO && task.pos) return true;
    if (!task.targetId) return false;
    return !!Game.getObjectById(task.targetId);
}

function roleAllowsTask(role, taskType) {
    const allowlist = ROLE_ALLOWLIST[role];
    if (!allowlist) return true;
    return allowlist.has(taskType);
}

function currentEnergy(creep) {
    return creep && creep.store && creep.store.getUsedCapacity ? creep.store.getUsedCapacity(RESOURCE_ENERGY) : 0;
}

function contextualValidation(creep, task) {
    const role = creep.memory && creep.memory.role;
    const energy = currentEnergy(creep);

    if (role === 'builder') {
        if ((task.type === TaskTypes.BUILD || task.type === TaskTypes.UPGRADE) && energy <= 0) {
            return { valid: false, reason: 'empty_worker_task' };
        }
        if (task.type === TaskTypes.UPGRADE && roomHasConstructionSites(creep.room)) {
            return { valid: false, reason: 'builder_should_build' };
        }
        if ((task.type === TaskTypes.WITHDRAW || task.type === TaskTypes.PICKUP) && energy > 0) {
            return { valid: false, reason: 'builder_already_fueled' };
        }
    }

    if (role === 'repairer') {
        if ((task.type === TaskTypes.REPAIR || task.type === TaskTypes.UPGRADE) && energy <= 0) {
            return { valid: false, reason: 'empty_worker_task' };
        }
        if ((task.type === TaskTypes.WITHDRAW || task.type === TaskTypes.PICKUP) && energy > 0) {
            return { valid: false, reason: 'repairer_already_fueled' };
        }
    }

    if (role === 'upgrader') {
        if (task.type === TaskTypes.UPGRADE && energy <= 0) {
            return { valid: false, reason: 'empty_worker_task' };
        }
        if ((task.type === TaskTypes.WITHDRAW || task.type === TaskTypes.PICKUP) && energy > 0) {
            return { valid: false, reason: 'upgrader_already_fueled' };
        }
    }

    return { valid: true };
}

const TaskGuard = {
    validate(creep, task) {
        if (!task) return { valid: true };
        if (!task.type || !VALID_TASK_TYPES.has(task.type)) {
            return { valid: false, reason: 'unknown_task_type' };
        }

        const taskMeta = creep && creep.memory ? creep.memory.taskMeta : null;
        if (task.ownerRole && creep.memory && task.ownerRole !== creep.memory.role) {
            return { valid: false, reason: 'owner_role_mismatch' };
        }
        if (taskMeta && taskMeta.ownerRole && creep.memory && taskMeta.ownerRole !== creep.memory.role) {
            return { valid: false, reason: 'owner_role_mismatch' };
        }
        if (task.expiresAt !== undefined && task.expiresAt < Game.time) {
            return { valid: false, reason: 'expired_task' };
        }
        const reservation = taskMeta && taskMeta.logisticsReservation;
        if (reservation && Number.isFinite(reservation.maxExpiresAt) && Game.time > reservation.maxExpiresAt) {
            return { valid: false, reason: 'expired_task' };
        }
        if (!roleAllowsTask(creep.memory && creep.memory.role, task.type)) {
            return { valid: false, reason: 'role_disallowed_task' };
        }
        if (!targetExists(task)) {
            return { valid: false, reason: 'missing_target' };
        }

        return contextualValidation(creep, task);
    }
};

export default TaskGuard;
