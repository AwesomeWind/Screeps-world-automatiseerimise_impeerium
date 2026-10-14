export const TASK_VERSION = 1;
const taskReservations = new WeakMap();

export function registerTaskReservation(task, reservation) {
    taskReservations.set(task, reservation);
}

export function observeTaskResource(creep, target) {
    const meta = creep.memory.taskMeta;
    if (!meta || !meta.logisticsReservation) return;
    const resourceType = meta.logisticsReservation.resourceType;
    const amount = (object) => {
        if (object.store && typeof object.store.getUsedCapacity === 'function') return object.store.getUsedCapacity(resourceType);
        if (object.resourceType === resourceType && Number.isFinite(object.amount)) return object.amount;
        return null;
    };
    meta.logisticsObservation = { tick: Game.time, ownerAmount: amount(creep), targetAmount: amount(target) };
}

export function assignTask(creep, task) {
    if (!creep || !creep.memory) return task;
    creep.memory.task = task;
    creep.memory.taskMeta = {
        ownerRole: creep.memory.role || null,
        assignedAt: Game.time,
        taskVersion: TASK_VERSION
    };
    const reservation = taskReservations.get(task);
    if (reservation) creep.memory.taskMeta.logisticsReservation = { ...reservation };
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
    const meta = creep.memory.taskMeta;
    if (meta && meta.logisticsReservation) {
        creep.memory.lastTaskClear.logisticsReservation = { ...meta.logisticsReservation };
        if (meta.logisticsObservation) creep.memory.lastTaskClear.logisticsObservation = { ...meta.logisticsObservation };
    }
    creep.memory.task = null;
    delete creep.memory.taskMeta;
}
