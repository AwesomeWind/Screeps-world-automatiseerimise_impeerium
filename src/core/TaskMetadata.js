export const TASK_VERSION = 1;
const taskReservations = new WeakMap();
const taskObservations = new WeakMap();

export function registerTaskObservation(task, context) {
    taskObservations.set(task, context);
}

export function observeTaskAction(creep, target) {
    const meta = creep.memory.taskMeta;
    if (!meta || !meta.observationContext) return;
    meta.actionBefore = { ownerEnergy: creep.store.getUsedCapacity(RESOURCE_ENERGY),
        targetProgress: Number.isFinite(target.progress) ? target.progress : null,
        targetHits: Number.isFinite(target.hits) ? target.hits : null, targetId: target.id };
}

export function recordTaskActionResult(creep, { attempted, actionType, result }) {
    const meta = creep.memory.taskMeta;
    if (!meta || !meta.observationContext || !meta.actionBefore) return;
    creep.memory.lastActionObservation = { id: `${creep.name}:${Game.time}:${actionType}`, tick: Game.time,
        actionType, attempted, result, context: { ...meta.observationContext }, before: { ...meta.actionBefore } };
}

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
    const context = taskObservations.get(task);
    if (context) creep.memory.taskMeta.observationContext = { ...context };
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
