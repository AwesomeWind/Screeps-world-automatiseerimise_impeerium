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

export function isQuantityStorageSupply(market, targetId, resourceType, context) {
    if (!market || context || resourceType !== RESOURCE_ENERGY) return false;
    const room = Game.rooms[market.roomName];
    const target = Game.getObjectById(targetId);
    return !!(room?.controller?.my && room.storage?.id === targetId && target?.my === true &&
        target.structureType === STRUCTURE_STORAGE && target.pos?.roomName === market.roomName &&
        typeof target.store?.getUsedCapacity === 'function');
}

function anonymousSupplyTarget(market, entryId) {
    const entry = market.supplies?.find(supply => supply.id === entryId);
    if (entry) return entry;
    const canonical = /^(?:supply|event-supply):([^:]+):([^:]+)(?::\d+)?$/.exec(entryId);
    if (canonical) return { targetId: canonical[1], resourceType: canonical[2] };
    const legacy = /^(?:storage|container|dropped):([^:]+)$/.exec(entryId);
    return legacy ? { targetId: legacy[1], resourceType: RESOURCE_ENERGY } : null;
}

function hasExclusiveSupplyClaim(market, targetId, resourceType) {
    for (const [entryId, record] of Object.entries(market.reservations?.supply || {})) {
        if (!record || record.expiresAt < Game.time) continue;
        for (const owner of Object.values(record.owners || {})) {
            if (!owner.targetId || !owner.resourceType) return true;
            if (owner.targetId === targetId && owner.resourceType === resourceType &&
                (owner.allocationMode !== 'quantity' || owner.context || !Number.isSafeInteger(owner.amount) || owner.amount <= 0)) return true;
        }
        const anonymous = record.owners ?
            (record.anonymousExpiresAt >= Game.time ? record.anonymousAmount : 0) : record.amount;
        // Old anonymous claims, including unknown amounts, cannot safely join quantity allocation.
        if (anonymous !== 0) {
            const target = anonymousSupplyTarget(market, entryId);
            if (!target || target.targetId === targetId && target.resourceType === resourceType) return true;
        }
    }
    return false;
}

export function availableSupplyAmount(market, supply, { exclusive = false } = {}) {
    const advertised = supply.amount || 0;
    if (!market) return advertised;
    if (supply.kind === 'withdraw') {
        const target = Game.getObjectById(supply.targetId);
        if (!target?.store) return 0;
        if (isQuantityStorageSupply(market, supply.targetId, supply.resourceType)) {
            const stock = target.store.getUsedCapacity(supply.resourceType);
            if (!Number.isFinite(stock) || stock <= 0 || typeof advertised !== 'number' || advertised <= 0 ||
                hasExclusiveSupplyClaim(market, supply.targetId, supply.resourceType)) return 0;
            const reserved = reservedTargetAmount(market, 'supply', supply.targetId, supply.resourceType);
            if (!Number.isFinite(reserved) || exclusive && reserved > 0) return 0;
            return Math.max(0, Math.min(advertised, stock) - reserved);
        }
    }
    const reservation = market.reservations?.supply?.[supply.id];
    if (exclusive && reservedTargetAmount(market, 'supply', supply.targetId, supply.resourceType) > 0) return 0;
    return reservation && reservation.expiresAt >= Game.time ? 0 : advertised;
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
    const quantitySupply = side === 'supply' && task.type === 'WITHDRAW' &&
        !creep.memory.role?.startsWith('remote') && isQuantityStorageSupply(market, task.targetId, entry.resourceType, context);
    let supplyOccupied = false;
    if (side === 'supply') {
        if (quantitySupply) {
            const free = creep.store?.getFreeCapacity?.(entry.resourceType);
            const available = availableSupplyAmount(market, { ...entry, targetId: task.targetId, kind: 'withdraw' });
            const wrongResource = task.resourceType && task.resourceType !== entry.resourceType;
            supplyOccupied = !Number.isSafeInteger(amount) || !Number.isFinite(free) || amount > free ||
                !!wrongResource || amount > available;
        } else {
            supplyOccupied = !target || reservedTargetAmount(market, side, task.targetId, entry.resourceType) > 0;
        }
    }
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
    if (quantitySupply) {
        owner.allocationMode = 'quantity';
        task.amount = amount;
    }
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

export function reconcileReservations(reservations, stats, totals, checkpoint) {
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
                if (owner.deferredResolution) resolution = owner.deferredResolution;
                else if (owner.status === 'awaiting_confirmation') {
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
                const resolved = owner.deferredResolution || { reservationId: id, creepName: owner.creepName, ownerRole: owner.ownerRole,
                    assignedAt: owner.assignedAt, sequence: owner.sequence, context: owner.context,
                    actionTick: owner.resultAt, reservedAmount: owner.amount,
                    resourceType: owner.resourceType, targetId: owner.targetId, targetRoom: owner.targetRoom, ...resolution };
                if (checkpoint) {
                    let accepted = false;
                    try { accepted = checkpoint(resolved) === true; } catch { /* Keep the owner until a safe handoff. */ }
                    if (!accepted) { owner.deferredResolution = resolved; continue; }
                }
                resolutions.push(resolved);
                delete record.owners[id];
                if (clearedThis) delete clear.logisticsReservation;
            }
            aggregate(record, Game.time);
            if (record.amount <= 0 || record.expiresAt < Game.time) delete reservations[side][entryId];
        }
    }
    return resolutions;
}
