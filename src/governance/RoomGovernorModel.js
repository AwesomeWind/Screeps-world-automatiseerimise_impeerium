function requirement(required, confidence = 'measured', reasons = []) {
    return { required, confidence, reasons };
}

export function requiredCapabilities(facts, policy, lifecycle = null, budgets = null) {
    const thresholds = policy.thresholds;
    const sourceCount = facts.sourceCount;
    const harvestRequired = sourceCount === null ? null : sourceCount * thresholds.sourceWorkPerSource;
    const estimatedDistance = facts.haulDistanceEstimate === null && sourceCount !== null
        ? sourceCount * 10
        : facts.haulDistanceEstimate;
    const logisticsRequired = estimatedDistance === null
        ? null
        : Math.ceil(thresholds.sourceEnergyPerTick * 2 * estimatedDistance / thresholds.carryCapacityPerPart);
    const constructionPressure = facts.constructionPressure;
    const maintenancePressure = facts.maintenancePressure;
    let upgradeRequired = 0;
    if (lifecycle === 'self_sufficient') upgradeRequired = 1;
    else if (lifecycle === 'developing') upgradeRequired = 3;
    else if (lifecycle === 'mature' || lifecycle === 'industrial') upgradeRequired = 5;
    if (budgets && budgets.upgrade.blocked) upgradeRequired = 0;
    return {
        harvestWork: requirement(harvestRequired, sourceCount === null ? 'unknown' : 'measured', sourceCount === null ? ['source_count_unknown'] : []),
        logisticsCarry: requirement(logisticsRequired, facts.haulDistanceEstimate === null ? 'estimated' : 'measured', facts.haulDistanceEstimate === null ? ['estimated_distance'] : []),
        buildWork: requirement(constructionPressure === null ? null : (constructionPressure === 0 ? 0 : Math.min(6, Math.max(1, Math.ceil(constructionPressure / 3))))),
        repairWork: requirement(maintenancePressure === null ? null : (maintenancePressure === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(maintenancePressure / 3))))),
        upgradeWork: requirement(upgradeRequired),
        defenseScore: requirement(facts.security.hostileStrength)
    };
}

function budget(posture, weight, blocked = false, reasons = []) {
    return { posture, weight, energyCap: null, blocked, reasons };
}

export function evaluateBudgets(facts, health, policy) {
    const coreCritical = health.survival.status === 'critical' ||
        health.harvest.status === 'critical' ||
        health.logistics.status === 'critical';
    const threatened = facts.security.hostileStrength !== null && facts.security.hostileStrength > 0;
    const lowReserve = facts.hasStorage && facts.storageEnergy < policy.thresholds.reserveCritical;
    const constructionReasons = coreCritical ? ['core_capability_critical'] : [];
    const upgradeReasons = [];
    if (coreCritical) upgradeReasons.push('core_capability_critical');
    if (lowReserve) upgradeReasons.push('reserve_below_critical');
    const supportReasons = [...upgradeReasons];
    return {
        survival: budget('protected', 100, false, ['safety_floor']),
        defense: budget(threatened ? 'protected' : 'normal', threatened ? 100 : 40, false, threatened ? ['active_threat'] : []),
        spawn: budget(coreCritical ? 'protected' : 'normal', coreCritical ? 95 : 80, false, coreCritical ? ['core_replacement'] : []),
        maintenance: budget(
            facts.maintenancePressure !== null && facts.maintenancePressure > policy.thresholds.maintenanceHigh ? 'protected' : 'normal',
            65,
            false,
            facts.maintenancePressure !== null && facts.maintenancePressure > policy.thresholds.maintenanceHigh ? ['maintenance_pressure_high'] : []
        ),
        construction: budget(coreCritical ? 'limited' : 'normal', 50, coreCritical, constructionReasons),
        upgrade: budget(upgradeReasons.length > 0 ? 'limited' : 'normal', 35, upgradeReasons.length > 0, upgradeReasons),
        reserve: budget(lowReserve ? 'protected' : 'normal', lowReserve ? 90 : 55, false, lowReserve ? ['reserve_below_critical'] : []),
        support: budget(supportReasons.length > 0 ? 'limited' : 'normal', 20, supportReasons.length > 0, supportReasons)
    };
}

function currentCapability(facts, capability) {
    if (capability === 'defenseScore' && facts.security.defenseStrength !== null) {
        return facts.security.defenseStrength;
    }
    return facts.capabilities[capability] || 0;
}

export function evaluateCapabilityGaps(facts, requirements) {
    const result = {};
    for (const capability in requirements) {
        const current = currentCapability(facts, capability);
        const spawning = facts.spawningCapabilities[capability] || 0;
        const retiring = facts.retiringCapabilities[capability] || 0;
        const required = requirements[capability].required;
        result[capability] = {
            current,
            spawning,
            retiring,
            required,
            gap: required === null ? null : Math.max(0, required - current - spawning),
            confidence: requirements[capability].confidence,
            reasons: [...requirements[capability].reasons]
        };
    }
    return result;
}

const RECOMMENDATION_POLICY = {
    harvestWork: { suggestedRole: 'miner', bodyProfile: 'miner', priority: 80, budget: 'spawn' },
    logisticsCarry: { suggestedRole: 'hauler', bodyProfile: 'hauler', priority: 70, budget: 'spawn' },
    buildWork: { suggestedRole: 'builder', bodyProfile: 'builder', priority: 50, budget: 'construction' },
    repairWork: { suggestedRole: 'repairer', bodyProfile: 'repairer', priority: 55, budget: 'maintenance' },
    upgradeWork: { suggestedRole: 'upgrader', bodyProfile: 'upgrader', priority: 35, budget: 'upgrade' },
    defenseScore: { suggestedRole: 'defender', bodyProfile: 'melee_defender', priority: 85, budget: 'defense' }
};

export function buildSpawnRecommendations(capabilities, budgets) {
    const recommendations = [];
    for (const capability in RECOMMENDATION_POLICY) {
        const state = capabilities[capability];
        const mapping = RECOMMENDATION_POLICY[capability];
        if (!state || state.gap === null || state.gap <= 0) continue;
        if (budgets[mapping.budget] && budgets[mapping.budget].blocked) continue;
        recommendations.push({
            capability,
            suggestedRole: mapping.suggestedRole,
            bodyProfile: mapping.bodyProfile,
            priority: mapping.priority,
            requiredCapacity: state.gap,
            reasons: [`${capability}_gap`, ...state.reasons]
        });
    }
    return recommendations.sort((a, b) => b.priority - a.priority);
}

function statusForScore(score, policy) {
    if (score === null) return 'unknown';
    if (score <= policy.thresholds.criticalScore) return 'critical';
    if (score <= policy.thresholds.strainedScore) return 'strained';
    return 'healthy';
}

function ratioHealth(current, required, policy, reason) {
    if (required === null) {
        return { score: null, status: 'unknown', reasons: [`${reason}_requirement_unknown`], evidence: { current, required } };
    }
    const score = required <= 0 ? 100 : Math.min(100, Math.round(current / required * 100));
    return {
        score,
        status: statusForScore(score, policy),
        reasons: score < 100 ? [`${reason}_capacity_shortfall`] : [],
        evidence: { current, required }
    };
}

function survivalHealth(facts, requirements, policy) {
    const reasons = [];
    let score = 100;
    if (!facts.hasSpawn) {
        score = 0;
        reasons.push('spawn_missing');
    }
    if (requirements.harvestWork.required !== null && facts.capabilities.harvestWork <= 0) {
        score = Math.min(score, 20);
        reasons.push('harvest_missing');
    }
    if (requirements.logisticsCarry.required !== null && facts.capabilities.logisticsCarry <= 0) {
        score = Math.min(score, 20);
        reasons.push('logistics_missing');
    }
    if (facts.spawnEnergyRatio !== null && facts.spawnEnergyRatio < policy.thresholds.spawnEnergyCriticalRatio) {
        score = Math.min(score, 50);
        reasons.push('spawn_energy_low');
    }
    const hostile = facts.security.hostileStrength;
    const defense = facts.security.defenseStrength;
    if (hostile !== null && hostile > 0 && defense !== null && defense < hostile) {
        score = Math.min(score, Math.round(defense / hostile * 100));
        reasons.push('defense_shortfall');
    }
    return {
        score,
        status: statusForScore(score, policy),
        reasons,
        evidence: {
            hasSpawn: facts.hasSpawn,
            spawnEnergyRatio: facts.spawnEnergyRatio,
            hostileStrength: hostile,
            defenseStrength: defense
        }
    };
}

function infrastructureHealth(facts, requirements, policy) {
    const build = ratioHealth(facts.capabilities.buildWork, requirements.buildWork.required, policy, 'build');
    const repair = ratioHealth(facts.capabilities.repairWork, requirements.repairWork.required, policy, 'repair');
    const knownScores = [build.score, repair.score].filter((score) => score !== null);
    if (knownScores.length === 0) {
        return { score: null, status: 'unknown', reasons: ['infrastructure_requirements_unknown'], evidence: { build, repair } };
    }
    const score = Math.min(...knownScores);
    return {
        score,
        status: statusForScore(score, policy),
        reasons: [...build.reasons, ...repair.reasons],
        evidence: { build, repair }
    };
}

function reservesHealth(facts, policy) {
    if (!facts.hasStorage) {
        return { score: null, status: 'unknown', reasons: ['storage_unavailable'], evidence: { storageEnergy: facts.storageEnergy } };
    }
    const target = policy.thresholds.reserveMature;
    const score = target <= 0 ? 100 : Math.min(100, Math.round(facts.storageEnergy / target * 100));
    return {
        score,
        status: statusForScore(score, policy),
        reasons: score < 100 ? ['reserve_below_mature_target'] : [],
        evidence: { storageEnergy: facts.storageEnergy, target }
    };
}

export function evaluateHealth(facts, requirements, policy) {
    const survival = survivalHealth(facts, requirements, policy);
    const harvest = ratioHealth(facts.capabilities.harvestWork, requirements.harvestWork.required, policy, 'harvest');
    const logistics = ratioHealth(facts.capabilities.logisticsCarry, requirements.logisticsCarry.required, policy, 'logistics');
    const infrastructure = infrastructureHealth(facts, requirements, policy);
    const reserves = reservesHealth(facts, policy);
    const dimensions = { survival, harvest, logistics, infrastructure, reserves };
    const core = [survival, harvest, logistics];
    let overallStatus;
    if (core.some((dimension) => dimension.status === 'critical')) overallStatus = 'critical';
    else {
        const known = Object.values(dimensions).filter((dimension) => dimension.status !== 'unknown');
        if (known.some((dimension) => dimension.status === 'critical')) overallStatus = 'critical';
        else if (known.some((dimension) => dimension.status === 'strained')) overallStatus = 'strained';
        else overallStatus = known.length > 0 ? 'healthy' : 'unknown';
    }
    const knownScores = Object.values(dimensions).map((dimension) => dimension.score).filter((score) => score !== null);
    return {
        ...dimensions,
        overall: {
            score: knownScores.length > 0 ? Math.min(...knownScores) : null,
            status: overallStatus,
            reasons: core.filter((dimension) => dimension.status === 'critical').flatMap((dimension) => dimension.reasons)
        }
    };
}

export function candidateLifecycle(facts, requirements, health, policy) {
    if (!facts.hasSpawn) return 'claimed';
    const harvestRequired = requirements.harvestWork.required;
    const logisticsRequired = requirements.logisticsCarry.required;
    if ((harvestRequired !== null && facts.capabilities.harvestWork < harvestRequired) ||
        (logisticsRequired !== null && facts.capabilities.logisticsCarry < logisticsRequired)) {
        return 'bootstrap';
    }
    if (!facts.hasStorage) return 'self_sufficient';
    const coreHealthyEnough = health.survival.status !== 'critical' &&
        health.harvest.status !== 'critical' &&
        health.logistics.status !== 'critical';
    if (facts.hasTerminal && facts.hasIndustrialInfrastructure &&
        facts.storageEnergy >= policy.thresholds.reserveIndustrial &&
        health.overall.status === 'healthy') {
        return 'industrial';
    }
    if (facts.storageEnergy >= policy.thresholds.reserveMature &&
        coreHealthyEnough &&
        (facts.maintenancePressure === null || facts.maintenancePressure <= policy.thresholds.maintenanceHigh)) {
        return 'mature';
    }
    return 'developing';
}

export function resolveLifecycle(previousState, candidate, emergency, policy) {
    if (!previousState || !previousState.lifecycle) {
        return { lifecycle: candidate, pendingLifecycle: null, stableSamples: 0, transitioned: true };
    }
    if (candidate === previousState.lifecycle) {
        return { lifecycle: previousState.lifecycle, pendingLifecycle: null, stableSamples: 0, transitioned: false };
    }
    if (emergency) {
        return { lifecycle: candidate, pendingLifecycle: null, stableSamples: 0, transitioned: true };
    }
    const stableSamples = previousState.pendingLifecycle === candidate
        ? (previousState.stableSamples || 0) + 1
        : 1;
    if (stableSamples >= policy.stableSamples) {
        return { lifecycle: candidate, pendingLifecycle: null, stableSamples: 0, transitioned: true };
    }
    return {
        lifecycle: previousState.lifecycle,
        pendingLifecycle: candidate,
        stableSamples,
        transitioned: false
    };
}

export function evaluateRoomGovernor(facts, previousState, policy) {
    const baseRequirements = requiredCapabilities(facts, policy);
    const health = evaluateHealth(facts, baseRequirements, policy);
    const candidate = candidateLifecycle(facts, baseRequirements, health, policy);
    const emergency = !facts.hasSpawn ||
        (baseRequirements.harvestWork.required !== null && baseRequirements.harvestWork.required > 0 && facts.capabilities.harvestWork <= 0) ||
        (baseRequirements.logisticsCarry.required !== null && baseRequirements.logisticsCarry.required > 0 && facts.capabilities.logisticsCarry <= 0);
    const lifecycleState = resolveLifecycle(previousState, candidate, emergency, policy);
    const budgets = evaluateBudgets(facts, health, policy);
    const requirements = requiredCapabilities(facts, policy, lifecycleState.lifecycle, budgets);
    const capabilities = evaluateCapabilityGaps(facts, requirements);
    const spawnRecommendations = buildSpawnRecommendations(capabilities, budgets);
    return {
        candidateLifecycle: candidate,
        lifecycle: lifecycleState.lifecycle,
        lifecycleState,
        emergency,
        health,
        requirements,
        budgets,
        capabilities,
        spawnRecommendations
    };
}
