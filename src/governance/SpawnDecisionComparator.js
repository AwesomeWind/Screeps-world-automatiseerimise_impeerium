function countParts(body, partType) {
    if (!Array.isArray(body)) return 0;
    let count = 0;
    for (const part of body) {
        if (part && typeof part === 'object' && part.hits !== undefined && part.hits <= 0) continue;
        const type = part && typeof part === 'object' ? part.type : part;
        if (type === partType) count++;
    }
    return count;
}

function scoreDefense(body) {
    return countParts(body, HEAL) * 100 +
        countParts(body, RANGED_ATTACK) * 60 +
        countParts(body, ATTACK) * 40 +
        countParts(body, TOUGH) * 5;
}

function capabilityForIntent(intent) {
    const role = intent.role || (intent.memory && intent.memory.role);
    if (role === 'miner') return 'harvestWork';
    if (role === 'hauler') return 'logisticsCarry';
    if (role === 'builder') return 'buildWork';
    if (role === 'repairer') return 'repairWork';
    if (role === 'upgrader') return 'upgradeWork';
    if (role === 'defender') return 'defenseScore';
    return null;
}

function intentCapacity(intent, capability) {
    if (capability === 'logisticsCarry') return countParts(intent.body, CARRY);
    if (capability === 'defenseScore') return scoreDefense(intent.body);
    if (capability && capability.endsWith('Work')) return countParts(intent.body, WORK);
    return 0;
}

function classifyExcess(intent) {
    const reason = intent.reason || '';
    if (intent.owner || intent.role === 'defender' || /war|hostile|security|defend/.test(reason)) {
        return 'external_or_safety';
    }
    return 'economic_excess';
}

export function compareSpawnDecisions(recommendations = [], intents = [], comparedAt = null) {
    const grouped = {};
    for (let index = 0; index < intents.length; index++) {
        const intent = intents[index];
        const capability = capabilityForIntent(intent);
        if (!capability) continue;
        if (!grouped[capability]) grouped[capability] = { capacity: 0, intents: [] };
        grouped[capability].capacity += intentCapacity(intent, capability);
        grouped[capability].intents.push({ intent, index });
    }

    const result = {
        matched: [],
        missing: [],
        excess: [],
        priorityMismatches: [],
        bodyProfileMismatches: [],
        comparedAt
    };
    const recommendedCapabilities = new Set();

    for (const recommendation of recommendations) {
        const capability = recommendation.capability;
        recommendedCapabilities.add(capability);
        const group = grouped[capability] || { capacity: 0, intents: [] };
        const comparison = {
            capability,
            requiredCapacity: recommendation.requiredCapacity,
            actualCapacity: group.capacity,
            intentCount: group.intents.length
        };
        if (group.capacity >= recommendation.requiredCapacity) result.matched.push(comparison);
        else result.missing.push({ ...comparison, reason: 'capacity_shortfall' });

        if (group.intents.length > 0) {
            const actualPriority = Math.max(...group.intents.map((entry) => entry.intent.priority || 0));
            if (actualPriority !== recommendation.priority) {
                result.priorityMismatches.push({
                    capability,
                    recommended: recommendation.priority,
                    actual: actualPriority
                });
            }
            const profiles = [...new Set(group.intents.map((entry) => entry.intent.bodyProfile || null))];
            if (!profiles.includes(recommendation.bodyProfile)) {
                result.bodyProfileMismatches.push({
                    capability,
                    recommended: recommendation.bodyProfile,
                    actual: profiles
                });
            }
        }
    }

    for (let index = 0; index < intents.length; index++) {
        const intent = intents[index];
        const capability = capabilityForIntent(intent);
        if (!capability || recommendedCapabilities.has(capability)) continue;
        result.excess.push({
            intentIndex: index,
            capability,
            role: intent.role || (intent.memory && intent.memory.role) || null,
            capacity: intentCapacity(intent, capability),
            classification: classifyExcess(intent)
        });
    }

    return result;
}
