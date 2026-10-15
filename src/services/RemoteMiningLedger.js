function initializeBudget(budget) {
    if (!Array.isArray(budget.buckets)) budget.buckets = [];
    if (!budget.grants) budget.grants = {};
    if (!budget.receipts) budget.receipts = {};
}

function limitsValid(policy) {
    return policy && Number.isSafeInteger(policy.spawnEnergyLimit) && policy.spawnEnergyLimit >= 0 &&
        policy.windowTicks === 1000 && policy.budgetBucketTicks === 50 &&
        Number.isSafeInteger(policy.maxGrants) && policy.maxGrants > 0 && policy.maxGrants <= 16 &&
        Number.isSafeInteger(policy.maxReceipts) && policy.maxReceipts > 0 && policy.maxReceipts <= 16;
}

function prune(budget, tick) {
    initializeBudget(budget);
    budget.buckets = budget.buckets.filter(bucket => bucket.start + 50 > tick - 1000);
    for (const [id, grant] of Object.entries(budget.grants)) {
        if (grant.deadline < tick && !grant.executing) delete budget.grants[id];
    }
    for (const [id, receipt] of Object.entries(budget.receipts)) {
        if (receipt.tick + 1050 < tick) delete budget.receipts[id];
    }
}

function committedAmount(budget) {
    return budget.buckets.reduce((sum, bucket) => sum + bucket.amount, 0) +
        Object.values(budget.grants).reduce((sum, grant) => sum + grant.maxEnergy, 0);
}

export function reserveSpawnGrant(budget, request, tick, policy) {
    prune(budget, tick);
    if (!limitsValid(policy) || !Number.isSafeInteger(request.maxEnergy) || request.maxEnergy <= 0 ||
        !Number.isSafeInteger(request.deadline) || request.deadline < tick) return { granted: false, reason: 'invalid_budget' };
    if (budget.receipts[request.requestId]) return { granted: false, reason: 'settled_request' };
    const existing = budget.grants[request.requestId];
    if (existing) return { granted: !existing.executing && existing.remoteId === request.remoteId && existing.epoch === request.epoch && existing.deadline === request.deadline, grantId: request.requestId, reason: 'existing_grant' };
    if (Object.keys(budget.grants).length >= policy.maxGrants || Object.keys(budget.receipts).length + Object.keys(budget.grants).length >= policy.maxReceipts) return { granted: false, reason: 'receipt_capacity' };
    if (committedAmount(budget) + request.maxEnergy > policy.spawnEnergyLimit) return { granted: false, reason: 'spawn_budget' };
    budget.grants[request.requestId] = { ...request, issuedAt: tick, executing: false };
    return { granted: true, grantId: request.requestId };
}

export function validateSpawnGrant(budget, request, operation, tick) {
    initializeBudget(budget);
    const grant = budget.grants[request.grantId || request.requestId];
    const allowed = !!grant && grant.deadline >= tick && (!grant.executing || request.stage === 'run') &&
        grant.remoteId === request.remoteId && grant.epoch === operation.epoch &&
        (request.role === undefined || request.role === grant.role) &&
        (request.quotaKey === undefined || request.quotaKey === grant.quotaKey) &&
        request.epoch === operation.epoch && operation.config && operation.config.enabled === true &&
        (grant.role === 'scout' && operation.allowRecon === true ||
            ['active', 'preparing', 'discovering', 'recovering'].includes(operation.status));
    return { allowed, reason: allowed ? null : 'stale_remote_grant', grant };
}

export function recordSpawnResult(budget, ledger, result, tick) {
    initializeBudget(budget);
    if (budget.receipts[result.requestId]) return { applied: false, reason: 'already_charged' };
    const grant = budget.grants[result.requestId];
    if (!grant) return { applied: false, reason: 'missing_grant' };
    if (result.result !== OK) { delete budget.grants[result.requestId]; return { applied: false, reason: 'spawn_failed' }; }
    const cost = result.body.reduce((sum, part) => sum + BODYPART_COST[part], 0);
    const start = Math.floor(tick / 50) * 50;
    let bucket = budget.buckets.find(value => value.start === start);
    if (!bucket) { bucket = { start, amount: 0 }; budget.buckets.push(bucket); }
    bucket.amount += cost;
    budget.receipts[result.requestId] = { tick, cost, name: result.name, remoteId: grant.remoteId, epoch: grant.epoch };
    ledger.spawnEnergyConfirmed = (ledger.spawnEnergyConfirmed || 0) + cost;
    delete budget.grants[result.requestId];
    return { applied: true, cost };
}

export function cancelSpawnGrant(budget, requestId) {
    initializeBudget(budget);
    const grant = budget.grants[requestId];
    if (!grant || grant.executing) return false;
    delete budget.grants[requestId];
    return true;
}

export function reserveInfrastructureAttempt(budget, context, upperBound, tick) {
    if (!budget.infrastructure) budget.infrastructure = { buckets: [], pending: {}, receipts: {} };
    const infra = budget.infrastructure;
    infra.buckets = infra.buckets.filter(bucket => bucket.start + 50 > tick - 1000);
    const existing = infra.pending[context.attemptId];
    if (existing) return { granted: true };
    const limit = budget.infrastructureEnergyLimit;
    const spent = infra.buckets.reduce((sum, bucket) => sum + bucket.amount, 0);
    const pending = Object.values(infra.pending).reduce((sum, entry) => sum + entry.upperBound, 0);
    if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isSafeInteger(upperBound) || upperBound <= 0 ||
        Object.keys(infra.pending).length >= 16 || spent + pending + upperBound > limit) return { granted: false, reason: 'infrastructure_budget' };
    infra.pending[context.attemptId] = { ...context, upperBound, tick };
    return { granted: true };
}

export function remoteBudgetStatus(budget, policy, tick) {
    prune(budget, tick);
    const infra = budget.infrastructure;
    if (infra) {
        infra.buckets = infra.buckets.filter(bucket => bucket.start + 50 > tick - 1000);
        for (const [name, receipt] of Object.entries(infra.receipts)) {
            if (!Game.creeps[name] && receipt.tick < tick - 50) delete infra.receipts[name];
        }
    }
    return {
        spawnUnknown: Object.values(budget.grants).some(grant => grant.executing && grant.unknownReported),
        spawnExhausted: !limitsValid(policy) || budget.buckets.reduce((sum, bucket) => sum + bucket.amount, 0) >= policy.spawnEnergyLimit,
        infrastructureExhausted: !Number.isSafeInteger(policy.infrastructureEnergyLimit) || policy.infrastructureEnergyLimit < 0 ||
            (infra?.buckets || []).reduce((sum, bucket) => sum + bucket.amount, 0) >= policy.infrastructureEnergyLimit
    };
}

export function reconcileSpawnExecution(budget, operation, tick) {
    const ledger = operation.ledger;
    let unresolvedUpper = 0;
    for (const grant of Object.values(budget.grants || {})) {
        if (grant.remoteId !== operation.remoteId || grant.epoch !== operation.epoch || !grant.executing ||
            (grant.executingAt ?? grant.issuedAt ?? tick - 1) >= tick) continue;
        const backup = Object.entries(Memory.empire.spawningCreeps || {}).find(([name, record]) => {
            const memory = record?.memory;
            const evidence = Game.spawns[record?.spawnName]?.spawning?.name === name ||
                Game.creeps[name]?.memory?.remoteId === operation.remoteId || record?.acceptedAt === tick;
            return record?.schemaVersion === 2 && record.requestId === grant.requestId &&
                record.spawnRoom === operation.config.baseRoom && evidence &&
                memory?.remoteId === operation.remoteId && memory.epoch === operation.epoch &&
                memory.role === grant.role && memory.quotaKey === grant.quotaKey &&
                Number.isSafeInteger(record.acceptedAt) && record.acceptedAt <= tick &&
                Array.isArray(record.body) && record.body.length > 0 &&
                record.body.every(part => Number.isFinite(BODYPART_COST[part])) &&
                record.body.reduce((sum, part) => sum + BODYPART_COST[part], 0) <= grant.maxEnergy;
        });
        if (backup) {
            const [name, record] = backup;
            recordSpawnResult(budget, ledger, {
                requestId: grant.requestId, name, result: OK, body: record.body, acceptedAt: record.acceptedAt
            }, record.acceptedAt);
            continue;
        }
        if (!grant.unknownReported) {
            grant.unknownReported = true;
            ledger.spawnCostUnknown = (ledger.spawnCostUnknown || 0) + 1;
        }
        unresolvedUpper += grant.maxEnergy;
    }
    ledger.spawnEnergyUnknownUpperBound = unresolvedUpper;
}

export function recordInfrastructureResult(budget, ledger, observation, currentFacts, tick) {
    const infra = budget.infrastructure;
    if (!infra || !observation || !observation.context || !observation.before || !Number.isSafeInteger(observation.tick) || observation.tick >= tick) return { applied: false };
    const context = observation.context;
    const receipt = infra.receipts[context.creepName];
    if (receipt && receipt.tick >= observation.tick) return { applied: false, reason: 'already_observed' };
    const pending = infra.pending[context.attemptId];
    if (!pending) return { applied: false, reason: 'missing_attempt' };
    let cost = 0;
    let known = !observation.attempted || observation.result !== OK;
    if (context.executionUnknown) {
        known = false;
        cost = pending.upperBound;
    } else if (!known) {
        const before = observation.before;
        const delta = before.ownerEnergy - currentFacts.ownerEnergy;
        const targetDelta = observation.actionType === 'BUILD' ? currentFacts.targetProgress - before.targetProgress : currentFacts.targetHits - before.targetHits;
        const expected = observation.actionType === 'BUILD' ? delta : delta * 100;
        known = [delta,targetDelta].every(Number.isFinite) && delta > 0 && delta <= pending.upperBound && targetDelta === expected && !context.boosted;
        cost = known ? delta : pending.upperBound;
    }
    if (cost) {
        const start = Math.floor(observation.tick / 50) * 50;
        let bucket = infra.buckets.find(value => value.start === start);
        if (!bucket) { bucket = { start, amount: 0 }; infra.buckets.push(bucket); }
        bucket.amount += cost;
        const field = known ? 'infrastructureEnergyConfirmed' : 'infrastructureEnergyUnknownUpperBound';
        ledger[field] = (ledger[field] || 0) + cost;
    }
    infra.receipts[context.creepName] = { tick: observation.tick, id: observation.id };
    delete infra.pending[context.attemptId];
    return { applied: true, known, cost };
}

export function recordRemoteResolution(ledger, resolution, currentEpoch, allowedHomeTargets) {
    const context = resolution && resolution.context;
    if (!context || context.epoch !== currentEpoch || resolution.ownerRole !== 'remoteHauler' ||
        typeof context.remoteId !== 'string' || typeof context.tripId !== 'string') return { applied: false, reason: 'invalid_remote_context' };
    const actor = Game.creeps[resolution.creepName];
    if ((!actor && resolution.status !== 'unknown') || actor && (actor.memory.remoteId !== context.remoteId ||
        actor.memory.epoch !== currentEpoch)) return { applied: false, reason: 'actor_identity_missing' };
    if (!ledger.settlementReceipts) ledger.settlementReceipts = {};
    for (const [name, receipt] of Object.entries(ledger.settlementReceipts)) {
        if (!Game.creeps[name] && Game.time - receipt.assignedAt > 50) delete ledger.settlementReceipts[name];
    }
    const previous = ledger.settlementReceipts[resolution.creepName];
    if (previous && (previous.id === resolution.reservationId || previous.assignedAt > resolution.assignedAt ||
        previous.assignedAt === resolution.assignedAt && previous.sequence >= resolution.sequence)) return { applied: false, reason: 'already_settled' };
    if (!previous && Object.keys(ledger.settlementReceipts).length >= 16) { ledger.settlementOverflow = (ledger.settlementOverflow || 0) + 1; return { applied: false, reason: 'receipt_capacity' }; }
    if (!Number.isSafeInteger(resolution.assignedAt) || !Number.isSafeInteger(resolution.sequence)) return { applied: false, reason: 'invalid_resolution_identity' };
    ledger.settlementReceipts[resolution.creepName] = { id: resolution.reservationId, assignedAt: resolution.assignedAt, sequence: resolution.sequence };
    if (resolution.status === 'unknown') ledger.confirmationUnknown = (ledger.confirmationUnknown || 0) + 1;
    if (resolution.status === 'released') ledger.reservationReleased = (ledger.reservationReleased || 0) + 1;
    if (resolution.status !== 'confirmed' || !Number.isFinite(resolution.confirmedAmount) || resolution.confirmedAmount <= 0) return { applied: true, credited: 0 };
    if (context.leg === 'home_delivery' && resolution.resourceType === RESOURCE_ENERGY && allowedHomeTargets.includes(resolution.targetId) && resolution.targetRoom === actor.memory.homeRoom) {
        ledger.returnedEnergyConfirmed = (ledger.returnedEnergyConfirmed || 0) + resolution.confirmedAmount;
        return { applied: true, credited: resolution.confirmedAmount };
    }
    if (context.leg === 'pickup') ledger.pickedUpEnergyConfirmed = (ledger.pickedUpEnergyConfirmed || 0) + resolution.confirmedAmount;
    return { applied: true, credited: 0 };
}
