const REQUIRED_PARTS = {
    scout: ['move'], reserver: ['claim', 'move'], remoteMiner: ['work', 'carry', 'move'], remoteHauler: ['carry', 'move']
};

export function normalizeRemoteConfig(remoteRoomName, raw, policy) {
    const reasons = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { valid: false, reasons: ['invalid_config'] };
    if (typeof raw.baseRoom !== 'string' || raw.baseRoom === remoteRoomName) reasons.push('invalid_base_room');
    if (raw.sourceId !== undefined && raw.sourceId !== null && typeof raw.sourceId !== 'string') reasons.push('invalid_source');
    if (!Array.isArray(raw.homeDeliveryTargetIds) || !raw.homeDeliveryTargetIds.length || !raw.homeDeliveryTargetIds.every(id => typeof id === 'string' && id.length)) reasons.push('config_upgrade_required');
    if (raw.containerPos && (!Number.isInteger(raw.containerPos.x) || !Number.isInteger(raw.containerPos.y) || raw.containerPos.x < 1 || raw.containerPos.x > 48 || raw.containerPos.y < 1 || raw.containerPos.y > 48 || raw.containerPos.roomName !== remoteRoomName)) reasons.push('invalid_container_position');
    if (policy.maxOperations !== 1) reasons.push('invalid_pilot_capacity');
    return { valid: !reasons.length, reasons, config: {
        enabled: raw.enabled === true, hold: raw.hold === true, baseRoom: raw.baseRoom, targetRoom: remoteRoomName,
        remoteId: `${raw.baseRoom}:${remoteRoomName}`, sourceId: raw.sourceId || null,
        containerId: raw.containerId || null, containerPos: raw.containerPos || null,
        allowContainerBuild: raw.allowContainerBuild === true, homeDeliveryTargetIds: raw.homeDeliveryTargetIds || [],
        reserveController: raw.reserveController === true
    } };
}

export function remoteActorIdentityMatches(memory, config) {
    if (!REQUIRED_PARTS[memory.role]) return false;
    const expected = { homeRoom: config.baseRoom, targetRoom: config.targetRoom,
        sourceId: config.sourceId, quotaKey: remoteQuotaKey(config, memory.role) };
    return Object.entries(expected).every(([key, value]) => memory[key] === undefined || memory[key] === value);
}

export function collectRemoteActors(population, remoteId, epoch, roleLimits, config) {
    const result = { covered: {}, physical: {}, usableParts: {}, replacing: {}, unknowns: [] };
    for (const role of Object.keys(REQUIRED_PARTS)) {
        result.covered[role] = 0; result.physical[role] = 0; result.replacing[role] = 0; result.usableParts[role] = {};
    }
    for (const entry of population) {
        const role = entry.memory.role;
        if (!REQUIRED_PARTS[role] || entry.memory.remoteId !== remoteId || entry.memory.epoch !== epoch || entry.state === 'invalid') continue;
        result.physical[role]++;
        const functional = (!config || remoteActorIdentityMatches(entry.memory, config)) &&
            (!entry.bodyKnown || REQUIRED_PARTS[role].every(part => (entry.activeParts[part] || 0) > 0));
        if (!entry.bodyKnown) result.unknowns.push(entry.name);
        if (entry.state === 'retiring' || !functional || entry.retireRequested || entry.memory.remoteRetiring) result.replacing[role]++;
        else if (entry.coversQuota) result.covered[role]++;
        if (entry.bodyKnown && entry.state === 'active' && functional && !entry.retireRequested && !entry.memory.remoteRetiring) {
            for (const [part, count] of Object.entries(entry.activeParts)) result.usableParts[role][part] = (result.usableParts[role][part] || 0) + count;
        }
    }
    result.canAdd = role => result.covered[role] < roleLimits[role] && result.physical[role] < roleLimits[role] + 1;
    return result;
}

export function collectRemoteIntel(room, tick, previousIntel = null) {
    if (!room) return previousIntel;
    const controller = room.controller;
    return {
        observedAt: tick, owner: controller?.owner?.username || null,
        reservation: controller?.reservation?.username || null,
        reservationTicks: controller?.reservation?.ticksToEnd ?? null,
        sourceIds: room.find(FIND_SOURCES).slice(0, 2).map(source => source.id),
        dangerZones: room.find(FIND_HOSTILE_CREEPS).slice(0, 10).map(actor => ({
            x: actor.pos.x, y: actor.pos.y, roomName: room.name, range: 4
        })),
        hostile: room.find(FIND_HOSTILE_CREEPS).length > 0
    };
}

export function canAttemptRecoveryRecon(operation, facts, policy, tick) {
    const reasons = [];
    if (operation.config.hold || !operation.config.enabled || !policy.enabled) reasons.push('manual_hold');
    if (!facts.homeHealthy || !facts.sinkAvailable || facts.homeDanger) reasons.push('home_unavailable');
    if (facts.foreignControl) reasons.push('foreign_control');
    if (!facts.entrance || !facts.reconRouteSafe) reasons.push('no_safe_entrance');
    if (Number.isFinite(operation.lastAlertAt) && tick - operation.lastAlertAt < policy.reconCooldownTicks ||
        !facts.reconActorExists && Number.isFinite(operation.lastReconAt) && tick - operation.lastReconAt < policy.reconCooldownTicks) reasons.push('recon_cooldown');
    return { allowed: reasons.length === 0, reasons };
}

export function evaluateRemoteState(operation, facts, policy, tick) {
    const reasons = [];
    const config = operation.config;
    if (!policy.enabled || !config.enabled) return { status: 'disabled', reasons: ['disabled'], allowEconomicDeparture: false, allowRecon: false };
    if (config.hold) reasons.push('manual_hold');
    if (facts.configInvalid) reasons.push('invalid_config');
    if (operation.pendingConfig) reasons.push('pending_config_change');
    if (!facts.home || !facts.home.controller || facts.home.controller.my !== true || !facts.activeSpawn) reasons.push('home_unavailable');
    if (!facts.homeRecovery || facts.homeRecovery.mode !== 'normal') reasons.push('home_recovery');
    if (facts.homeRecovery?.coreUsable && (facts.homeRecovery.coreUsable.miner < 1 || facts.homeRecovery.coreUsable.hauler < 1)) reasons.push('home_core_gap');
    if (!Number.isFinite(facts.home?.controller?.ticksToDowngrade) || facts.home.controller.ticksToDowngrade < facts.controllerEmergencyTicks) reasons.push('controller_emergency');
    if (!facts.adjacent) reasons.push('unsupported_route');
    if (!facts.sinkAvailable) reasons.push('home_sink_full_or_missing');
    if (facts.foreignControl || facts.remote && (!facts.remote.controller || facts.remote.controller.owner || (facts.remote.controller.reservation && facts.remote.controller.reservation.username !== facts.username))) reasons.push('foreign_control');
    if (facts.homeDanger) reasons.push('home_danger');
    if (facts.hostile) reasons.push('danger');
    if (facts.sourceInvalid) reasons.push('invalid_source_position');
    if (facts.economicRoute?.valid === false) reasons.push('unsupported_route');
    if (facts.budgetStatus?.spawnExhausted) reasons.push('spawn_budget');
    if (facts.budgetStatus?.spawnUnknown) reasons.push('spawn_cost_unknown');
    if (facts.budgetStatus?.infrastructureExhausted) reasons.push('infrastructure_budget');
    const stale = !facts.remote && (!operation.lastKnownIntel || tick - operation.lastKnownIntel.observedAt > policy.intelTtl);
    if (stale && operation.lastKnownIntel) reasons.push('stale_intel');
    if (facts.hostile || stale) {
        operation.recoveryRequired = true;
        operation.safeTicks = 0;
        if (facts.hostile) operation.lastAlertAt = tick;
    }
    if (reasons.length && !reasons.some(reason => !['danger', 'stale_intel'].includes(reason))) {
        const recon = canAttemptRecoveryRecon(operation, facts, policy, tick);
        return { status: 'suspended', reasons, allowEconomicDeparture: false, allowRecon: !facts.remote && recon.allowed };
    }
    if (reasons.length) return { status: 'suspended', reasons, allowEconomicDeparture: false, allowRecon: false };
    if (!facts.remote) {
        const recon = canAttemptRecoveryRecon(operation, facts, policy, tick);
        return { status: 'discovering', reasons: ['vision_missing', ...recon.reasons], allowEconomicDeparture: false, allowRecon: recon.allowed };
    }
    if (operation.recoveryRequired) {
        if (operation.lastSafeTick !== tick) operation.safeTicks = operation.lastSafeTick === tick - 1 ? (operation.safeTicks || 0) + 1 : 1;
        operation.lastSafeTick = tick;
        if (operation.safeTicks < policy.safeStreakTicks) return { status: 'recovering', reasons: ['safe_streak'], allowEconomicDeparture: false, allowRecon: false };
        operation.recoveryRequired = false;
        operation.lastDangerZones = [];
        operation.recoverySequence = (operation.recoverySequence || 0) + 1;
    }
    if (!config.sourceId) return { status: 'awaiting_source_selection', reasons: ['source_selection_required'], allowEconomicDeparture: false, allowRecon: false };
    if (!facts.source) return { status: 'suspended', reasons: ['source_missing'], allowEconomicDeparture: false, allowRecon: false };
    if (!facts.container && !config.allowContainerBuild) return { status: 'preparing', reasons: ['container_required'], allowEconomicDeparture: false, allowRecon: false };
    return { status: facts.container ? 'active' : 'preparing', reasons: [], allowEconomicDeparture: true, allowRecon: false };
}

export function remoteQuotaKey(config, role) {
    const suffix = ['remoteMiner', 'remoteHauler'].includes(role) ? `:${config.sourceId}` : '';
    return `${role}:${config.baseRoom}:${config.targetRoom}${suffix}`;
}

export function estimateRemoteHaulerNeed(facts, policy) {
    const values = ['sourceCapacity', 'regenTicks', 'minerWork', 'carryCapacity', 'outboundTicks', 'inboundTicks', 'handlingTicks', 'pendingEnergy'];
    if (!values.every(key => Number.isFinite(facts[key]) && facts[key] >= 0) ||
        facts.regenTicks <= 0 || facts.carryCapacity <= 0 || facts.minerWork <= 0) {
        return { desiredCount: 1, gap: null, known: false, reasons: ['throughput_unknown'] };
    }
    const production = Math.min(facts.sourceCapacity / facts.regenTicks, facts.minerWork * HARVEST_POWER);
    const cycleTicks = Math.max(1, facts.outboundTicks + facts.inboundTicks + facts.handlingTicks);
    const needed = Math.max(1, Math.ceil(production * cycleTicks / facts.carryCapacity));
    const desiredCount = Math.min(2, policy.roleLimits.remoteHauler, needed);
    return { desiredCount, gap: Math.max(0, production - desiredCount * facts.carryCapacity / cycleTicks), known: true, reasons: [] };
}
