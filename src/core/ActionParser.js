import TaskTypes from './TaskTypes.js';

function clearTask(creep) {
    creep.memory.task = null;
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

function moveToTarget(creep, target, task, range) {
    if (!target || !target.pos) return ERR_INVALID_TARGET;
    return creep.moveTo(target.pos, {
        reusePath: task.reusePath === undefined ? 10 : task.reusePath,
        range,
        visualizePathStyle: task.visualize ? { stroke: '#ffaa00' } : undefined
    });
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

function updateMoveProgress(creep, task) {
    const now = typeof Game !== 'undefined' && Game.time !== undefined ? Game.time : 0;
    const pos = currentPos(creep);
    const stuckLimit = task.stuckLimit === undefined ? 5 : task.stuckLimit;
    const maxTicks = task.maxTicks === undefined ? 50 : task.maxTicks;

    if (task.startedAt === undefined) task.startedAt = now;
    if (!task.lastPos) {
        task.lastPos = pos;
        task.stuckTicks = 0;
        return true;
    }

    if (samePos(task.lastPos, pos)) task.stuckTicks = (task.stuckTicks || 0) + 1;
    else {
        task.lastPos = pos;
        task.stuckTicks = 0;
    }

    if ((task.stuckTicks || 0) >= stuckLimit) return false;
    return now - task.startedAt <= maxTicks;
}

const ActionParser = {
    run(creep) {
        const task = creep.memory.task;
        if (!task || !task.type) return;

        const target = targetFromTask(task);
        if (!target) {
            clearTask(creep);
            return;
        }

        let result = OK;
        let range = 1;

        switch (task.type) {
            case TaskTypes.HARVEST:
                result = creep.harvest(target);
                if (result === ERR_NOT_ENOUGH_RESOURCES || result === ERR_FULL || result === ERR_INVALID_TARGET || result === OK) clearTask(creep);
                break;
            case TaskTypes.TRANSFER:
                result = creep.transfer(target, task.resourceType || RESOURCE_ENERGY, task.amount);
                if (result === OK || result === ERR_FULL || result === ERR_NOT_ENOUGH_RESOURCES || result === ERR_INVALID_TARGET) clearTask(creep);
                break;
            case TaskTypes.WITHDRAW:
                result = creep.withdraw(target, task.resourceType || RESOURCE_ENERGY, task.amount);
                if (result === OK || result === ERR_NOT_ENOUGH_RESOURCES || result === ERR_FULL || result === ERR_INVALID_TARGET) clearTask(creep);
                break;
            case TaskTypes.PICKUP:
                result = creep.pickup(target);
                if (result === OK || result === ERR_NOT_ENOUGH_RESOURCES || result === ERR_FULL || result === ERR_INVALID_TARGET) clearTask(creep);
                break;
            case TaskTypes.BUILD:
                result = creep.build(target);
                if (result === OK || result === ERR_NOT_ENOUGH_RESOURCES || result === ERR_INVALID_TARGET) clearTask(creep);
                break;
            case TaskTypes.REPAIR:
                result = creep.repair(target);
                if (result === ERR_NOT_ENOUGH_RESOURCES || result === ERR_INVALID_TARGET || repairTargetReached(task, target)) clearTask(creep);
                break;
            case TaskTypes.UPGRADE:
                range = 3;
                result = creep.upgradeController(target);
                if (result === ERR_NOT_ENOUGH_RESOURCES || result === ERR_INVALID_TARGET) clearTask(creep);
                break;
            case TaskTypes.ATTACK:
                result = creep.attack(target);
                if (result === ERR_INVALID_TARGET) clearTask(creep);
                break;
            case TaskTypes.RANGED_ATTACK:
                range = 3;
                result = creep.rangedAttack(target);
                if (result === OK || result === ERR_INVALID_TARGET) clearTask(creep);
                break;
            case TaskTypes.RESERVE:
                result = creep.reserveController(target);
                if (result === ERR_INVALID_TARGET || result === ERR_NO_BODYPART) clearTask(creep);
                break;
            case TaskTypes.MOVE_TO:
                range = task.range === undefined ? 1 : task.range;
                if (creep.pos.inRangeTo(target.pos, range)) clearTask(creep);
                else if (!updateMoveProgress(creep, task)) clearTask(creep);
                else result = ERR_NOT_IN_RANGE;
                break;
            default:
                console.log(`[ActionParser] unknown task type: ${task.type}`);
                clearTask(creep);
                return;
        }

        if (result === ERR_NOT_IN_RANGE) {
            result = moveToTarget(creep, target, task, range);
            if (result === ERR_NO_PATH || result === ERR_INVALID_TARGET) clearTask(creep);
        } else if (result === ERR_INVALID_ARGS || result === ERR_NO_BODYPART) {
            clearTask(creep);
        }
    }
};

export default ActionParser;
