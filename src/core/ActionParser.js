import TaskTypes from './TaskTypes.js';
import WorkPositionCoordinator from './WorkPositionCoordinator.js';
import { clearTaskState, observeTaskResource, observeTaskAction, recordTaskActionResult } from './TaskMetadata.js';

function clearTask(creep, reason, result, details = {}) {
    clearTaskState(creep, reason, { ...details, ...(result === undefined ? {} : { result }) });
}

function targetFromTask(task) {
    if (task.targetId) return Game.getObjectById(task.targetId);
    if (task.pos) return { pos: new RoomPosition(task.pos.x, task.pos.y, task.pos.roomName) };
    return null;
}

function repairTargetReached(task, target) {
    if (!target || target.hits === undefined) return true;
    if (task.targetHits === undefined) return target.hits >= target.hitsMax;
    return target.hits >= task.targetHits;
}

function roomPos(pos) {
    if (!pos) return null;
    return new RoomPosition(pos.x, pos.y, pos.roomName);
}

function structureAt(creep, structureType) {
    if (!creep.room || typeof creep.room.find !== 'function') return false;
    const structures = creep.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === structureType &&
            structure.pos &&
            structure.pos.x === creep.pos.x &&
            structure.pos.y === creep.pos.y
    });
    return structures.length > 0;
}

function plannedWorkTarget(creep, task) {
    if (!task.workPos) return null;
    if (samePos(currentPos(creep), task.workPos)) return null;
    return { pos: roomPos(task.workPos) };
}

function canWorkFromCurrentPos(creep, target) {
    return creep.pos &&
        typeof creep.pos.inRangeTo === 'function' &&
        target &&
        target.pos &&
        creep.pos.inRangeTo(target.pos, 1) &&
        !structureAt(creep, STRUCTURE_ROAD);
}

function ensureWorkPos(creep, task, target) {
    if (!creep.room || !target || !target.pos) return task.workPos || null;
    if (WorkPositionCoordinator.isValidWorkPos(creep.room, creep, target, task.workPos)) {
        return task.workPos;
    }

    const reservation = WorkPositionCoordinator.refresh(creep.room, creep, target, task.workPos);
    if (!reservation) {
        delete task.workPos;
        delete task.workPosReservedAt;
        return null;
    }

    task.workPos = reservation.workPos;
    task.workPosReservedAt = reservation.workPosReservedAt;
    return task.workPos;
}

function moveToTarget(creep, target, task, range) {
    if (!target || !target.pos) return ERR_INVALID_TARGET;
    if (task.path) {
        return creep.moveByPath(nativeMovePath(creep, task));
    }
    return creep.moveTo(target.pos, {
        reusePath: task.reusePath === undefined ? 10 : task.reusePath,
        range,
        visualizePathStyle: task.visualize ? { stroke: '#ffaa00' } : undefined
    });
}

function nativeMovePath(creep, task) {
    const path = task.path.map(pos => new RoomPosition(pos.x, pos.y, pos.roomName));
    const from = creep.pos, first = path[0];
    if (task.type !== TaskTypes.MOVE_TO || !first || task.allowedRooms.length !== 2 ||
        first.roomName === from.roomName || path.some(pos => samePos(pos, from)) ||
        (from.x === 0 || from.x === 49) && (from.y === 0 || from.y === 49)) return path;
    const exits = Game.map?.describeExits?.(from.roomName) || {};
    const pairedExit = exits[LEFT] === first.roomName && from.x === 0 && first.x === 49 && from.y === first.y ||
        exits[RIGHT] === first.roomName && from.x === 49 && first.x === 0 && from.y === first.y ||
        exits[TOP] === first.roomName && from.y === 0 && first.y === 49 && from.x === first.x ||
        exits[BOTTOM] === first.roomName && from.y === 49 && first.y === 0 && from.x === first.x;
    // Native moveByPath needs the origin for a first step already in the next
    // room. Anchor only paired exits; ordinary off-path movement must fail.
    if (pairedExit) path.unshift(new RoomPosition(from.x, from.y, from.roomName));
    return path;
}

function samePos(a, b) {
    return a && b && a.x === b.x && a.y === b.y && a.roomName === b.roomName;
}

function currentPos(creep) {
    return {
        x: creep.pos.x,
        y: creep.pos.y,
        roomName: creep.pos.roomName
    };
}

function positionSnapshot(pos) {
    return pos ? { x: pos.x, y: pos.y, roomName: pos.roomName } : null;
}

function moveFailureDetails(task, failure) {
    return {
        movementFailure: failure,
        moveGoal: positionSnapshot(task.pos),
        legExpiresAt: task.expiresAt ?? null
    };
}

function recordMoveAttempt(creep, task, result) {
    let failure = null;
    if (result === ERR_NOT_FOUND) failure = 'path_lost';
    else if (result === ERR_TIRED) failure = 'fatigue';
    else if (result === ERR_BUSY) failure = 'busy';
    else if (result !== OK) failure = 'move_rejected';
    creep.memory.lastMoveAttempt = {
        tick: Game.time,
        from: currentPos(creep),
        goal: positionSnapshot(task.pos),
        pathFirst: positionSnapshot(task.path[0]),
        result,
        failure,
        spawning: !!creep.spawning,
        fatigue: creep.fatigue || 0
    };
}

function updateMoveProgress(creep, task) {
    const now = typeof Game !== 'undefined' && Game.time !== undefined ? Game.time : 0;
    if (Number.isFinite(task.expiresAt) && now > task.expiresAt) return 'leg_expired';
    const pos = currentPos(creep);
    const stuckLimit = task.stuckLimit === undefined ? 5 : task.stuckLimit;
    const maxTicks = task.maxTicks === undefined ? 50 : task.maxTicks;

    if (task.startedAt === undefined) task.startedAt = now;
    if (!task.lastPos) {
        task.lastPos = pos;
        task.stuckTicks = 0;
        return null;
    }

    if (samePos(task.lastPos, pos) && !(task.ignoreFatigueForStuck && creep.fatigue > 0)) task.stuckTicks = (task.stuckTicks || 0) + 1;
    else {
        task.lastPos = pos;
        task.stuckTicks = 0;
    }

    if (now - task.startedAt > maxTicks) return 'leg_expired';
    if ((task.stuckTicks || 0) >= stuckLimit) return 'stuck';
    return null;
}

const ActionParser = {
    run(creep) {
        if (creep.spawning) return;
        const task = creep.memory.task;
        if (!task || !task.type) return;
        const economic = global.RemoteEconomicTrial;
        const currentTrial = globalThis.Memory?.empire?.remoteMining?.economicTrials?.current;
        const configuredTrial = globalThis.Memory?.empire?.control?.policy?.remoteMining?.economicTrial;
        const remoteActor = !!creep.memory.remoteId;
        const managedEconomic = !!creep.memory.economicTrialId || remoteActor &&
            (currentTrial?.managed && creep.memory.remoteId === currentTrial.identity?.remoteId ||
            configuredTrial?.enabled === true && creep.memory.remoteId === configuredTrial.request?.remoteId);
        if (managedEconomic || remoteActor && economic?.evaluatedAt === Game.time) {
            let allowed = false;
            try {
                allowed = economic?.evaluatedAt === Game.time && economic.service?.beforeAction(creep, task).allowed === true;
            } catch { /* A missing or failed guard cannot authorize an engine call. */ }
            if (!allowed) {
                if (['BUILD', 'REPAIR'].includes(task.type)) {
                    const workTarget = targetFromTask(task);
                    if (workTarget) {
                        observeTaskAction(creep, workTarget);
                        recordTaskActionResult(creep, { attempted: false, actionType: task.type, result: null });
                    }
                }
                clearTask(creep, 'economic_trial_action_denied'); return;
            }
        }
        if (task.path && (!Array.isArray(task.path) || !task.path.length || task.path.length > 300 ||
            !Array.isArray(task.allowedRooms) || task.allowedRooms.length > 2 ||
            !task.allowedRooms.includes(creep.room.name) || !task.allowedRooms.includes(task.pos && task.pos.roomName) ||
            !task.path.every(pos => pos && Number.isInteger(pos.x) && Number.isInteger(pos.y) && pos.x >= 0 && pos.x <= 49 && pos.y >= 0 && pos.y <= 49 && task.allowedRooms.includes(pos.roomName)))) {
            clearTask(creep,'move_invalid_path');
            return;
        }

        const target = targetFromTask(task);
        if (!target) {
            clearTask(creep, 'target_missing');
            return;
        }
        if ([TaskTypes.TRANSFER, TaskTypes.WITHDRAW, TaskTypes.PICKUP].includes(task.type)) observeTaskResource(creep, target);
        if ([TaskTypes.BUILD, TaskTypes.REPAIR].includes(task.type)) {
            observeTaskAction(creep, target);
            recordTaskActionResult(creep, { attempted: false, actionType: task.type, result: null });
        }

        let result = OK;
        let range = 1;
        let movementTarget = target;

        switch (task.type) {
            case TaskTypes.HARVEST:
                result = creep.harvest(target);
                if (result === ERR_NOT_ENOUGH_RESOURCES) clearTask(creep, 'harvest_no_resource', result);
                if (result === ERR_FULL) clearTask(creep, 'harvest_full', result);
                if (result === ERR_INVALID_TARGET) clearTask(creep, 'harvest_invalid_target', result);
                if (result === OK) clearTask(creep, 'harvest_completed_tick', result);
                break;
            case TaskTypes.TRANSFER:
                result = creep.transfer(target, task.resourceType || RESOURCE_ENERGY, task.amount);
                if (result === OK) clearTask(creep, 'transfer_completed', result);
                if (result === ERR_FULL) clearTask(creep, 'transfer_target_full', result);
                if (result === ERR_NOT_ENOUGH_RESOURCES) clearTask(creep, 'transfer_no_resource', result);
                if (result === ERR_INVALID_TARGET) clearTask(creep, 'transfer_invalid_target', result);
                break;
            case TaskTypes.WITHDRAW:
                result = creep.withdraw(target, task.resourceType || RESOURCE_ENERGY, task.amount);
                if (result === OK) clearTask(creep, 'withdraw_completed', result);
                if (result === ERR_NOT_ENOUGH_RESOURCES) clearTask(creep, 'withdraw_no_resource', result);
                if (result === ERR_FULL) clearTask(creep, 'withdraw_full', result);
                if (result === ERR_INVALID_TARGET) clearTask(creep, 'withdraw_invalid_target', result);
                break;
            case TaskTypes.PICKUP:
                result = creep.pickup(target);
                if (result === OK) clearTask(creep, 'pickup_completed', result);
                if (result === ERR_NOT_ENOUGH_RESOURCES) clearTask(creep, 'pickup_no_resource', result);
                if (result === ERR_FULL) clearTask(creep, 'pickup_full', result);
                if (result === ERR_INVALID_TARGET) clearTask(creep, 'pickup_invalid_target', result);
                break;
            case TaskTypes.BUILD:
                if (!canWorkFromCurrentPos(creep, target)) {
                    ensureWorkPos(creep, task, target);
                    const workTarget = plannedWorkTarget(creep, task);
                    if (workTarget) {
                        result = ERR_NOT_IN_RANGE;
                        movementTarget = workTarget;
                        range = 0;
                        break;
                    }
                }
                result = creep.build(target);
                recordTaskActionResult(creep, { attempted: true, actionType: task.type, result });
                if (result === ERR_NOT_ENOUGH_RESOURCES) clearTask(creep, 'build_no_energy', result);
                if (result === ERR_INVALID_TARGET) clearTask(creep, 'build_invalid_target', result);
                break;
            case TaskTypes.REPAIR:
                if (!canWorkFromCurrentPos(creep, target)) {
                    ensureWorkPos(creep, task, target);
                    const workTarget = plannedWorkTarget(creep, task);
                    if (workTarget) {
                        result = ERR_NOT_IN_RANGE;
                        movementTarget = workTarget;
                        range = 0;
                        break;
                    }
                }
                result = creep.repair(target);
                recordTaskActionResult(creep, { attempted: true, actionType: task.type, result });
                if (result === ERR_NOT_ENOUGH_RESOURCES) clearTask(creep, 'repair_no_energy', result);
                if (result === ERR_INVALID_TARGET) clearTask(creep, 'repair_invalid_target', result);
                if (repairTargetReached(task, target)) clearTask(creep, 'repair_target_reached', result);
                break;
            case TaskTypes.UPGRADE:
                range = 3;
                result = creep.upgradeController(target);
                if (result === ERR_NOT_ENOUGH_RESOURCES) clearTask(creep, 'upgrade_no_energy', result);
                if (result === ERR_INVALID_TARGET) clearTask(creep, 'upgrade_invalid_target', result);
                break;
            case TaskTypes.ATTACK:
                result = creep.attack(target);
                if (result === ERR_INVALID_TARGET) clearTask(creep, 'attack_invalid_target', result);
                break;
            case TaskTypes.RANGED_ATTACK:
                range = 3;
                result = creep.rangedAttack(target);
                if (result === OK) clearTask(creep, 'ranged_attack_completed_tick', result);
                if (result === ERR_INVALID_TARGET) clearTask(creep, 'ranged_attack_invalid_target', result);
                break;
            case TaskTypes.RESERVE:
                result = creep.reserveController(target);
                if (result === ERR_INVALID_TARGET) clearTask(creep, 'reserve_invalid_target', result);
                if (result === ERR_NO_BODYPART) clearTask(creep, 'reserve_no_bodypart', result);
                break;
            case TaskTypes.MOVE_TO: {
                range = task.range === undefined ? 1 : task.range;
                if (creep.pos.inRangeTo(target.pos, range)) clearTask(creep, 'move_arrived');
                else {
                    const failure = updateMoveProgress(creep, task);
                    if (failure) clearTask(creep, 'move_stuck_or_expired', undefined, moveFailureDetails(task, failure));
                    else result = ERR_NOT_IN_RANGE;
                }
                break;
            }
            default:
                console.log(`[ActionParser] unknown task type: ${task.type}`);
                clearTask(creep, 'unknown_task_type');
                return;
        }

        if (result === ERR_NOT_IN_RANGE) {
            result = moveToTarget(creep, movementTarget, task, range);
            if (task.type === TaskTypes.MOVE_TO && task.path) recordMoveAttempt(creep, task, result);
            if (result === ERR_NOT_FOUND && task.type === TaskTypes.MOVE_TO && task.path) {
                clearTask(creep, 'move_path_lost', result, moveFailureDetails(task, 'path_lost'));
            }
            if (result === ERR_NO_PATH) clearTask(creep, 'move_no_path', result);
            if (result === ERR_INVALID_TARGET) clearTask(creep, 'move_invalid_target', result);
        } else if (result === ERR_INVALID_ARGS || result === ERR_NO_BODYPART) {
            clearTask(creep, result === ERR_INVALID_ARGS ? 'action_invalid_args' : 'action_no_bodypart', result);
        }
    }
};

export default ActionParser;
