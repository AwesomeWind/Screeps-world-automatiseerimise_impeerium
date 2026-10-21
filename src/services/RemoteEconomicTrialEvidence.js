export const ECONOMIC_ROLE_LIMITS = Object.freeze({ scout: 50, remoteMiner: 800, remoteHauler: 800 });

export function reduceEconomicTrialEvidence(current) {
    const previous = current.evidence;
    const evidence = JSON.parse(JSON.stringify(previous));
    evidence.confirmedSpawnCost = Object.values(current.slots).reduce((sum, slot) => sum + (slot.cost || 0), 0);
    evidence.unknownEnergyUpperBound = Object.values(current.slots).reduce((sum, slot) =>
        sum + (slot.unknownUpperBound || 0), 0) + (evidence.infrastructureUnknownUpperBound || 0);
    return evidence;
}

export function economicSpawnReceipt(session, role, facts, clock) {
    const slot = session.slots[role];
    const receipt = facts.receipts?.[slot.requestId];
    if (slot.ledgerStage !== 'applied' || slot.nativeResult !== 0 || slot.ledgerApplication?.applied !== true ||
        slot.ledgerApplication.cost !== slot.bodyCost || !receipt || receipt.name !== slot.name || receipt.remoteId !== session.identity.remoteId ||
        receipt.epoch !== session.identity.epoch || !Number.isSafeInteger(receipt.tick) ||
        receipt.tick < session.startedAtTick || receipt.tick > clock.tick ||
        !Number.isFinite(slot.bodyCost) || receipt.cost !== slot.bodyCost ||
        receipt.cost <= 0 || receipt.cost > ECONOMIC_ROLE_LIMITS[role]) return null;
    return receipt;
}

export function economicResolutionKey(resolution) {
    return [resolution.creepName, resolution.reservationId, resolution.assignedAt, resolution.sequence].join('|');
}

export function economicResolutionIdentity(session, resolution) {
    const context = resolution?.context;
    const slot = session.slots.remoteHauler;
    const identity = session.identity;
    return !!context && ['trialId', 'sequence', 'remoteId', 'epoch', 'codeVersion'].every(key => context[key] === identity[key]) &&
        resolution.ownerRole === 'remoteHauler' && resolution.creepName === slot.name && Number.isSafeInteger(slot.acceptedAt) &&
        typeof resolution.reservationId === 'string' && resolution.reservationId.length <= 200 &&
        Number.isSafeInteger(resolution.assignedAt) && resolution.assignedAt >= slot.acceptedAt &&
        Number.isSafeInteger(resolution.sequence) && resolution.sequence > 0 &&
        typeof context.tripId === 'string' && context.tripId.length <= 200 &&
        context.tripId.startsWith(slot.name + ':' + identity.epoch + ':') &&
        ['pickup', 'home_delivery'].includes(context.leg) && resolution.resourceType === 'energy';
}

export function applyEconomicResolution(session, resolution, application, clock) {
    const evidence = JSON.parse(JSON.stringify(session.evidence));
    const fail = reason => ({ evidence, reason });
    if (!economicResolutionIdentity(session, resolution)) return fail('resolution_identity_invalid');
    if (!application?.applied) return fail('ledger_application_unknown');
    if (resolution.status !== 'confirmed') {
        if (resolution.status === 'unknown') {
            evidence.unknownEvents++;
            evidence.logisticsUnknownEnergyUpperBound = (evidence.logisticsUnknownEnergyUpperBound || 0) +
                (Number.isSafeInteger(resolution.reservedAmount) ? resolution.reservedAmount : 0);
        }
        return fail(resolution.status === 'unknown' ? 'logistics_unknown' : 'logistics_released');
    }
    const amount = resolution.confirmedAmount;
    if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(resolution.actionTick) ||
        resolution.actionTick < session.startedAtTick || resolution.actionTick < resolution.assignedAt ||
        resolution.actionTick >= clock.tick) return fail('confirmation_invalid');
    const trip = 'trip:' + resolution.context.tripId;
    const pickup = resolution.context.leg === 'pickup';
    const expectedTarget = pickup ? session.containerId : session.receiverId;
    const expectedRoom = pickup ? session.targetRoom : session.baseRoom;
    if (resolution.targetId !== expectedTarget || resolution.targetRoom !== expectedRoom) return fail('resolution_target_invalid');
    if (pickup) {
        if (!Object.hasOwn(evidence.pickups, trip) && Object.keys(evidence.pickups).length >= 16) return fail('provenance_capacity');
        evidence.pickups[trip] = (evidence.pickups[trip] || 0) + amount;
        return { evidence };
    }
    const delivered = evidence.delivered[trip] || 0;
    if (application.credited !== amount || (evidence.pickups[trip] || 0) < delivered + amount) {
        evidence.unknownEvents++;
        evidence.logisticsUnknownEnergyUpperBound = (evidence.logisticsUnknownEnergyUpperBound || 0) + amount;
        return fail('delivery_provenance_unknown');
    }
    evidence.delivered[trip] = delivered + amount;
    evidence.returnedEnergy += amount;
    if (session.outcome) {
        evidence.tailReturnedEnergy = (evidence.tailReturnedEnergy || 0) + amount;
        return { evidence };
    }
    return { evidence, firstDelivery: { identity: { ...session.identity }, key: economicResolutionKey(resolution),
        tripId: resolution.context.tripId, targetId: resolution.targetId, amount, confirmedAtTick: clock.tick,
        assignedAt: resolution.assignedAt, reservationId: resolution.reservationId, sequence: resolution.sequence } };
}
