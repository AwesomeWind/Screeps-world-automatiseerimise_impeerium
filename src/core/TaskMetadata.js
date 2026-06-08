export const TASK_VERSION = 1;

export function assignTask(creep, task) {
    if (!creep || !creep.memory) return task;
    creep.memory.task = task;
    creep.memory.taskMeta = {
        ownerRole: creep.memory.role || null,
        assignedAt: Game.time,
        taskVersion: TASK_VERSION
    };
    delete creep.memory.lastTaskClear;
    return task;
}

export function clearTaskState(creep, reason = 'task_cleared', details = {}) {
    if (!creep || !creep.memory) return;
    const task = creep.memory.task;
    if (!task) return;
    creep.memory.lastTaskClear = {
        reason,
        tick: Game.time,
        taskType: task && task.type ? task.type : null,
        targetId: task && task.targetId ? task.targetId : null,
        ...details
    };
    creep.memory.task = null;
    delete creep.memory.taskMeta;
}
