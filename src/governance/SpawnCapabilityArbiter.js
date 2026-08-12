const DEFAULT_FALLBACK_SUSPEND_COUNT = 3;
const VALID_BODY_PART_TYPES = new Set([
    'move',
    'work',
    'carry',
    'attack',
    'ranged_attack',
    'heal',
    'claim',
    'tough'
]);

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isStringArray(value) {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isValidBodyPart(part) {
    if (typeof part === 'string') return VALID_BODY_PART_TYPES.has(part);
    return isRecord(part) && VALID_BODY_PART_TYPES.has(part.type);
}

function isValidControlDecision(decision) {
    if (!isRecord(decision) || !isStringArray(decision.reasons)) return false;
    if (decision.action === 'fallback') {
        return decision.effectiveMode === 'shadow' && decision.adoptedSource === 'legacy';
    }
    if (decision.action === 'replace' || decision.action === 'suppress') {
        return decision.effectiveMode === 'active' && decision.adoptedSource === 'governor';
    }
    if (decision.action === 'keep') {
        return decision.adoptedSource === 'legacy' &&
            (decision.effectiveMode === 'active' || decision.effectiveMode === 'shadow');
    }
    return false;
}

function fallback(legacyIntents, requestedMode, reasons) {
    return {
        intents: Array.isArray(legacyIntents) ? [...legacyIntents] : [],
        requestedMode,
        effectiveMode: 'shadow',
        adoptedSource: 'legacy',
        action: 'fallback',
        reasons: [...reasons]
    };
}

function invalidInputReasons({ roomName, legacyIntents, governorCandidate, governorDecision, readiness, safety }) {
    const reasons = [];
    const quotaKey = `upgrader:${roomName}:controller`;
    if (typeof roomName !== 'string' || roomName.length === 0) reasons.push('invalid_room_name');
    if (!Array.isArray(legacyIntents)) reasons.push('invalid_legacy_intents');
    if (!isRecord(governorCandidate) || governorCandidate.quotaKey !== quotaKey || governorCandidate.role !== 'upgrader' ||
        !Array.isArray(governorCandidate.body) || governorCandidate.body.length === 0 ||
        !governorCandidate.body.every(isValidBodyPart) ||
        !isRecord(governorCandidate.memory) || !isNonNegativeNumber(governorCandidate.priority) ||
        !isRecord(governorDecision) || governorCandidate.priority !== governorDecision.priority) {
        reasons.push('invalid_governor_candidate');
    }
    if (!isRecord(governorDecision) || !isNonNegativeNumber(governorDecision.gap) ||
        typeof governorDecision.budgetBlocked !== 'boolean' || !isNonNegativeNumber(governorDecision.priority) ||
        !isNonNegativeNumber(governorDecision.current) || !isNonNegativeNumber(governorDecision.spawning) ||
        !isStringArray(governorDecision.reasons)) {
        reasons.push('invalid_governor_decision');
    }
    if (!isRecord(readiness) || typeof readiness.ready !== 'boolean' || !isStringArray(readiness.blockers)) {
        reasons.push('invalid_readiness');
    }
    const validCpuModes = ['normal', 'constrained', 'recovery', 'critical'];
    if (!isRecord(safety) ||
        typeof safety.emergencyDisable !== 'boolean' ||
        typeof safety.snapshotPresent !== 'boolean' ||
        typeof safety.snapshotFresh !== 'boolean' ||
        typeof safety.coreHealthy !== 'boolean' ||
        typeof safety.lifecycleEligible !== 'boolean' ||
        !validCpuModes.includes(safety.cpuMode) ||
        typeof safety.controllerEmergency !== 'boolean' ||
        typeof safety.autoSuspended !== 'boolean') {
        reasons.push('invalid_safety');
    }
    return reasons;
}

function safetyFallbackReasons(readiness, safety) {
    const reasons = [];
    if (safety.emergencyDisable) reasons.push('emergency_disabled');
    if (!safety.snapshotPresent) reasons.push('snapshot_missing');
    if (!safety.snapshotFresh) reasons.push('snapshot_stale');
    if (!safety.coreHealthy) reasons.push('core_capability_critical');
    if (!safety.lifecycleEligible) reasons.push('lifecycle_ineligible');
    if (safety.cpuMode === 'critical') reasons.push('cpu_critical');
    if (!readiness.ready) reasons.push('readiness_not_ready', ...readiness.blockers);
    if (safety.autoSuspended) reasons.push('auto_suspended');
    return reasons;
}

export function arbitrateUpgradeWork({
    roomName,
    legacyIntents,
    governorCandidate,
    governorDecision,
    readiness,
    safety,
    requestedMode
}) {
    if (requestedMode === 'shadow') {
        return {
            intents: [...legacyIntents],
            requestedMode,
            effectiveMode: 'shadow',
            adoptedSource: 'legacy',
            action: 'keep',
            reasons: []
        };
    }

    if (requestedMode === 'active') {
        const invalidReasons = invalidInputReasons({ roomName, legacyIntents, governorCandidate, governorDecision, readiness, safety });
        if (invalidReasons.length > 0) return fallback(legacyIntents, requestedMode, invalidReasons);
        const unsafeReasons = safetyFallbackReasons(readiness, safety);
        if (unsafeReasons.length > 0) return fallback(legacyIntents, requestedMode, unsafeReasons);
        const quotaKey = `upgrader:${roomName}:controller`;
        const shouldSuppress = governorDecision.budgetBlocked || governorDecision.gap <= 0;
        const emergencyCandidateRequired = safety.controllerEmergency && governorDecision.current + governorDecision.spawning === 0;
        if (shouldSuppress && safety.controllerEmergency && !emergencyCandidateRequired) {
            return {
                intents: [...legacyIntents],
                requestedMode,
                effectiveMode: 'active',
                adoptedSource: 'legacy',
                action: 'keep',
                reasons: [...governorDecision.reasons, 'controller_emergency_keep_legacy']
            };
        }
        if (shouldSuppress && !emergencyCandidateRequired) {
            return {
                intents: legacyIntents.filter((intent) => !intent || intent.quotaKey !== quotaKey),
                requestedMode,
                effectiveMode: 'active',
                adoptedSource: 'governor',
                action: 'suppress',
                reasons: Array.isArray(governorDecision.reasons) ? [...governorDecision.reasons] : []
            };
        }
        const intents = [];
        let replaced = false;
        for (const intent of legacyIntents) {
            if (intent && intent.quotaKey === quotaKey) {
                if (!replaced) intents.push(governorCandidate);
                replaced = true;
            } else {
                intents.push(intent);
            }
        }
        if (!replaced) intents.push(governorCandidate);
        return {
            intents,
            requestedMode,
            effectiveMode: 'active',
            adoptedSource: 'governor',
            action: 'replace',
            reasons: emergencyCandidateRequired
                ? [...governorDecision.reasons, 'controller_emergency_replace']
                : [...governorDecision.reasons]
        };
    }

    return fallback(legacyIntents, requestedMode, ['invalid_requested_mode']);
}

export function advanceUpgradeWorkControl({
    previous,
    requestedMode,
    decision,
    fallbackSuspendCount,
    tick
}) {
    const prior = isRecord(previous) ? previous : {};
    const effectiveDecision = isValidControlDecision(decision)
        ? decision
        : {
            effectiveMode: 'shadow',
            adoptedSource: 'legacy',
            action: 'fallback',
            reasons: ['invalid_control_decision']
        };
    const previousFallbackCount = Number.isSafeInteger(prior.fallbackCount) && prior.fallbackCount >= 0
        ? prior.fallbackCount
        : 0;
    const isFallback = effectiveDecision.action === 'fallback';
    const wasSuspended = prior.autoSuspended === true;
    const rearmed = wasSuspended && prior.requestedMode === 'shadow' && requestedMode === 'active';
    const lockedSuspended = wasSuspended && !rearmed;
    const previousConsecutiveFallbacks = rearmed ? 0 : previousFallbackCount;
    const fallbackCount = lockedSuspended ? previousFallbackCount : isFallback ? previousConsecutiveFallbacks + 1 : 0;
    const suspendThreshold = Number.isSafeInteger(fallbackSuspendCount) && fallbackSuspendCount > 0
        ? fallbackSuspendCount
        : DEFAULT_FALLBACK_SUSPEND_COUNT;
    const autoSuspended = lockedSuspended || (!rearmed && fallbackCount >= suspendThreshold);
    const newlySuspended = !lockedSuspended && autoSuspended;
    const reasons = [...effectiveDecision.reasons];
    const transitionEvents = [];
    if (rearmed) transitionEvents.push({ type: 'upgrade_work_rearmed', at: tick });
    if (newlySuspended) transitionEvents.push({ type: 'upgrade_work_auto_suspended', at: tick });

    return {
        requestedMode,
        effectiveMode: effectiveDecision.effectiveMode,
        adoptedSource: effectiveDecision.adoptedSource,
        action: effectiveDecision.action,
        reasons,
        fallbackCount,
        fallbackReason: lockedSuspended ? prior.fallbackReason || null : isFallback ? reasons[0] || null : null,
        autoSuspended,
        suspendedAt: newlySuspended ? tick : lockedSuspended ? prior.suspendedAt : null,
        lastDecisionAt: tick,
        rearmed,
        transitionEvents
    };
}
