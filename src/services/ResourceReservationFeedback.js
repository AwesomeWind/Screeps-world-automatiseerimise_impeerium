import { registerTaskReservation } from '../core/TaskMetadata.js';
import { ensureEmpireControl, DEFAULT_EMPIRE_POLICY } from '../config/EmpirePolicy.js';

const SUCCESS_REASONS = new Set(['transfer_completed', 'withdraw_completed', 'pickup_completed']);

function policy() {
    const value = ensureEmpireControl().policy.resourceReservations;
    return value && Number.isSafeInteger(value.ttl) && value.ttl > 0 &&
        Number.isSafeInteger(value.maxTaskTicks) && value.maxTaskTicks >= value.ttl &&
        Number.isSafeInteger(value.maxOwnersPerRoom) && value.maxOwnersPerRoom > 0 && value.maxOwnersPerRoom <= 200
        ? value : null;
}

function increment(stats, key, amount = 1, totals) {
    stats[key] = (stats[key] || 0) + amount;
    if (totals) totals[key] = (totals[key] || 0) + amount;
}

function aggregate(record, tick) {
    const owners = Object.values(record.owners || {});
    const anonymous = record.anonymousExpiresAt >= tick ? record.anonymousAmount || 0 : 0;
    record.amount = anonymous + owners.reduce((sum, owner) => sum + owner.amount, 0);
    record.expiresAt = Math.max(anonymous > 0 ? record.anonymousExpiresAt : 0, ...owners.map(owner => owner.expiresAt));
}

export function reservedTargetAmount(market, side, targetId, resourceType) {
    let total = 0;
    for (const [entryId, record] of Object.entries(market.reservations?.[side] || {})) {
        if (!record || record.expiresAt < Game.time) continue;
        for (const owner of Object.values(record.owners || {})) {
            if (owner.targetId === targetId && (resourceType === undefined || owner.resourceType === resourceType)) total += owner.amount;
        }
        const prefix = `${side}:${targetId}:`;
        if (entryId.startsWith(prefix) && (resourceType === undefined || entryId === prefix + resourceType)) {
            total += record.owners ? (record.anonymousExpiresAt >= Game.time ? record.anonymousAmount || 0 : 0) : record.amount || 0;
        }
    }
    return total;
}

export function availableTargetCapacity(market, target, resourceType) {
    if (!target?.store?.getFreeCapacity) return null;
    const capacity = target.store.getCapacity?.(resourceType);
    const shared = Number.isFinite(capacity) && capacity === target.store.getCapacity?.();
    return Math.max(0, target.store.getFreeCapacity(resourceType) -
        reservedTargetAmount(market, 'demand', target.id || target.name, shared ? undefined : resourceType));
}

export function reserveForTask(market, side, entry, amount, creep, task, context) {
    const limits = policy();
    if (!limits) {
        increment(market.stats, 'reservationBlocked', 1, market.feedbackTotals);
        increment(market.stats, 'invalidReservationPolicy', 1, market.feedbackTotals);
        return false;
    }
    const reservations = market.reservations;
    const ownerCount = ['supply', 'demand'].reduce((sum, kind) => sum + Object.values(reservations[kind]).filter(Boolean).reduce((count, record) => count + Object.keys(record.owners || {}).length, 0), 0);
    if (ownerCount >= limits.maxOwnersPerRoom || !Number.isFinite(amount) || amount <= 0) {
        increment(market.stats, 'reservationBlocked', 1, market.feedbackTotals);
        return false;
    }
    const target = Game.getObjectById(task.targetId);
    const exceedsCapacity = side === 'demand' && target?.store?.getFreeCapacity &&
        amount > availableTargetCapacity(market, target, entry.resourceType);
    const supplyOccupied = side === 'supply' && reservedTargetAmount(market, side, task.targetId, entry.resourceType) > 0;
    if (exceedsCapacity || supplyOccupied) {
        increment(market.stats, 'reservationBlocked', 1, market.feedbackTotals);
        return false;
    }
    let record = reservations[side][entry.id];
    if (!record || record.expiresAt < Game.time) record = { amount: 0, owners: {} };
    if (!record.owners) {
        record.anonymousAmount = record.amount || 0;
        record.anonymousExpiresAt = record.expiresAt;
        record.owners = {};
    }
    reservations.sequence = (reservations.sequence || 0) + 1;
    const reservationId = `${Game.time}:${reservations.sequence}:${creep.name || creep.id}`;
    const owner = {
        reservationId, creepName: creep.name || creep.id, side, marketEntryId: entry.id,
        targetId: task.targetId, resourceType: entry.resourceType, amount, taskType: task.type,
        assignedAt: Game.time, expiresAt: Game.time + limits.ttl,
        maxExpiresAt: Game.time + limits.maxTaskTicks, status: 'assigned'
    };
    if (context) Object.assign(owner, { context: { ...context }, ownerRole: creep.memory.role,
        sequence: reservations.sequence, targetRoom: creep.room.name });
    record.owners[reservationId] = owner;
    aggregate(record, Game.time);
    reservations[side][entry.id] = record;
    registerTaskReservation(task, { ...owner, roomName: market.roomName });
    return true;
}

function resourceAmount(object, resourceType) {
    if (!object) return null;
    if (object.store && typeof object.store.getUsedCapacity === 'function') return object.store.getUsedCapacity(resourceType);
    if (object.resourceType === resourceType && Number.isFinite(object.amount)) return object.amount;
    return null;
}

function confirmOwner(owner, creep, stats, totals) {
    const observation = owner.observation;
    const target = Game.getObjectById(owner.targetId);
    const ownerAmount = resourceAmount(creep, owner.resourceType);
    const targetAmount = resourceAmount(target, owner.resourceType);
    if (!observation || ![ownerAmount, targetAmount, observation.ownerAmount, observation.targetAmount].every(Number.isFinite)) {
        increment(stats, 'confirmationUnknown', 1, totals);
        return { status: 'unknown', confirmedAmount: 0 };
    }
    const ownerDelta = owner.side === 'demand' ? observation.ownerAmount - ownerAmount : ownerAmount - observation.ownerAmount;
    const targetDelta = owner.side === 'demand' ? targetAmount - observation.targetAmount : observation.targetAmount - targetAmount;
    if (ownerDelta <= 0 || ownerDelta !== targetDelta) {
        increment(stats, 'confirmationUnknown', 1, totals);
        return { status: 'unknown', confirmedAmount: 0 };
    }
    increment(stats, 'confirmedResourceActions', 1, totals);
    increment(stats, owner.side === 'demand' ? 'confirmedDeliveryAmount' : 'confirmedPickupAmount', ownerDelta, totals);
    if (owner.resourceType === RESOURCE_ENERGY) {
        increment(stats, owner.side === 'demand' ? 'confirmedEnergyDeliveryAmount' : 'confirmedEnergyPickupAmount', ownerDelta, totals);
    }
    return { status: 'confirmed', confirmedAmount: ownerDelta };
}

export function reconcileReservations(reservations, stats, totals) {
    const limits = policy() || DEFAULT_EMPIRE_POLICY.resourceReservations;
    const resolutions = [];
    for (const side of ['supply', 'demand']) {
        for (const [entryId, record] of Object.entries(reservations[side] || {})) {
            if (!record || !record.owners) continue;
            for (const [id, owner] of Object.entries(record.owners)) {
                const creep = Game.creeps[owner.creepName];
                const clear = creep && creep.memory.lastTaskClear;
                const clearedThis = clear && clear.logisticsReservation && clear.logisticsReservation.reservationId === id;
                const currentRef = creep && creep.memory.taskMeta && creep.memory.taskMeta.logisticsReservation;
                let resolution;
                if (owner.status === 'awaiting_confirmation') {
                    if (Game.time <= owner.resultAt) continue;
                    resolution = confirmOwner(owner, creep, stats, totals);
                } else if (clearedThis && SUCCESS_REASONS.has(clear.reason) && clear.result === OK) {
                    owner.status = 'awaiting_confirmation';
                    owner.resultAt = clear.tick;
                    owner.observation = clear.logisticsObservation;
                    if (Game.time <= clear.tick) continue;
                    resolution = confirmOwner(owner, creep, stats, totals);
                } else if (creep && creep.memory.task && currentRef && currentRef.reservationId === id && Game.getObjectById(owner.targetId) && Game.time <= owner.maxExpiresAt) {
                    if (owner.expiresAt < Game.time) owner.expiresAt = Math.min(owner.maxExpiresAt, Game.time + limits.ttl);
                    continue;
                } else {
                    increment(stats, 'reservationReleased', 1, totals);
                    resolution = { status: 'released', confirmedAmount: 0 };
                }
                resolutions.push({ reservationId: id, creepName: owner.creepName, ownerRole: owner.ownerRole,
                    assignedAt: owner.assignedAt, sequence: owner.sequence, context: owner.context,
                    resourceType: owner.resourceType, targetId: owner.targetId, targetRoom: owner.targetRoom, ...resolution });
                delete record.owners[id];
                if (clearedThis) delete clear.logisticsReservation;
            }
            aggregate(record, Game.time);
            if (record.amount <= 0 || record.expiresAt < Game.time) delete reservations[side][entryId];
        }
    }
    return resolutions;
}
