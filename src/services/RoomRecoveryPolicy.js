import TaskTypes from '../core/TaskTypes.js';
import { ensureEmpireControl } from '../config/EmpirePolicy.js';
import { isSourceContainerAsset, isControllerContainerAsset } from '../planning/CityPlanLegacyAdapter.js';
import { getPlannedRole } from '../planning/CityPlanHelpers.js';

export function controllerEmergency(room) {
    const ticks = room && room.controller && room.controller.ticksToDowngrade;
    const threshold = ensureEmpireControl().policy.capabilityControl.controllerEmergencyTicks;
    return Number.isFinite(ticks) && ticks >= 0 && Number.isFinite(threshold) && ticks < threshold;
}

export function recoveryRestricted(roomName) {
    const policy = ensureEmpireControl().policy.economyRecovery;
    const phase = global.RoomPhase && global.RoomPhase[roomName];
    return policy.enabled === true && !!(phase && phase.recovery && phase.recovery.mode !== 'normal');
}

export function essentialConstruction(room, target) {
    if (!target) return false;
    if (target.structureType === STRUCTURE_SPAWN) return true;
    const cityPlan = Memory.rooms && Memory.rooms[room.name] && Memory.rooms[room.name].cityPlan;
    if (!cityPlan) return false;
    if (target.structureType === STRUCTURE_CONTAINER) {
        return isControllerContainerAsset(cityPlan, target) || isSourceContainerAsset(cityPlan, target, null, { allowLegacyFallback: false });
    }
    return ['source_link', 'controller_link'].includes(getPlannedRole(cityPlan, target));
}

export function urgentRepair(roomName, targetId) {
    const targets = Memory.rooms && Memory.rooms[roomName] && Memory.rooms[roomName].maintenancePlan && Memory.rooms[roomName].maintenancePlan.targets;
    return Array.isArray(targets) && targets.some(target => target.id === targetId && target.executor === 'repairer' && target.urgency === 'urgent');
}

export function recoveryAllowsTask(creep, task) {
    if (!task || !creep.room || !recoveryRestricted(creep.memory.homeRoom || creep.room.name)) return true;
    if (!['builder', 'repairer', 'upgrader'].includes(creep.memory.role)) return true;
    if (task.type === TaskTypes.BUILD) return essentialConstruction(creep.room, Game.getObjectById(task.targetId));
    if (task.type === TaskTypes.REPAIR) return urgentRepair(creep.room.name, task.targetId);
    if (task.type === TaskTypes.UPGRADE) return controllerEmergency(creep.room);
    if ([TaskTypes.WITHDRAW, TaskTypes.PICKUP].includes(task.type)) {
        if (controllerEmergency(creep.room)) return true;
        const workTarget = Game.getObjectById(creep.memory.recoveryWorkTargetId);
        return creep.memory.role === 'builder' ? essentialConstruction(creep.room, workTarget) :
            (creep.memory.role === 'repairer' && workTarget && urgentRepair(creep.room.name, workTarget.id));
    }
    return true;
}

export function recoveryAllowsRequest(creep, request) {
    if (!creep.room || !recoveryRestricted(creep.memory.homeRoom || creep.room.name)) return true;
    if (!['builder', 'repairer', 'upgrader'].includes(creep.memory.role) || request.resourceType && request.resourceType !== RESOURCE_ENERGY) return true;
    return recoveryAllowsTask(creep, { type: TaskTypes.WITHDRAW });
}
