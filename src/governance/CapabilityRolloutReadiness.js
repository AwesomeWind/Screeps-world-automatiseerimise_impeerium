export const CAPABILITY_ROLLOUT_FIELDS = [
    'sampleCount',
    'knownSampleCount',
    'criticalSampleCount',
    'recommendationPresentCount',
    'recommendationFlipCount',
    'legacyMatchCount',
    'legacyMissingCount',
    'lastRecommendationPresent',
    'lastSampleAt',
    'lastErrorAt',
    'ready',
    'blockers'
];

const LIFECYCLE_RANK = {
    claimed: 0,
    bootstrap: 1,
    self_sufficient: 2,
    developing: 3,
    mature: 4,
    industrial: 5
};

const COUNT_FIELDS = [
    'sampleCount',
    'knownSampleCount',
    'criticalSampleCount',
    'recommendationPresentCount',
    'recommendationFlipCount',
    'legacyMatchCount',
    'legacyMissingCount'
];

function isNonNegativeFinite(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNonNegativeSafeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
}

function emptyRollout() {
    return {
        sampleCount: 0,
        knownSampleCount: 0,
        criticalSampleCount: 0,
        recommendationPresentCount: 0,
        recommendationFlipCount: 0,
        legacyMatchCount: 0,
        legacyMissingCount: 0,
        lastRecommendationPresent: null,
        lastSampleAt: null,
        lastErrorAt: null,
        ready: false,
        blockers: []
    };
}

function retainedCount(rollout, field) {
    return rollout && isNonNegativeSafeInteger(rollout[field]) ? rollout[field] : 0;
}

function retainedOptionalTick(rollout, field) {
    return rollout && (rollout[field] === null || isNonNegativeFinite(rollout[field]))
        ? rollout[field]
        : null;
}

function validSample(sample) {
    return sample
        && typeof sample === 'object'
        && typeof sample.known === 'boolean'
        && typeof sample.critical === 'boolean'
        && typeof sample.recommendationPresent === 'boolean'
        && typeof sample.legacyMatched === 'boolean'
        && typeof sample.legacyMissing === 'boolean'
        && isNonNegativeFinite(sample.sampledAt);
}

function invalidSampleRollout(prior) {
    const blockers = Array.isArray(prior.blockers) ? [...prior.blockers] : [];
    if (!blockers.includes('invalid_sample')) blockers.push('invalid_sample');
    return {
        sampleCount: retainedCount(prior, 'sampleCount'),
        knownSampleCount: retainedCount(prior, 'knownSampleCount'),
        criticalSampleCount: retainedCount(prior, 'criticalSampleCount'),
        recommendationPresentCount: retainedCount(prior, 'recommendationPresentCount'),
        recommendationFlipCount: retainedCount(prior, 'recommendationFlipCount'),
        legacyMatchCount: retainedCount(prior, 'legacyMatchCount'),
        legacyMissingCount: retainedCount(prior, 'legacyMissingCount'),
        lastRecommendationPresent: typeof prior.lastRecommendationPresent === 'boolean' ? prior.lastRecommendationPresent : null,
        lastSampleAt: retainedOptionalTick(prior, 'lastSampleAt'),
        lastErrorAt: retainedOptionalTick(prior, 'lastErrorAt'),
        ready: false,
        blockers
    };
}

function readinessPolicy(policy) {
    if (!policy || typeof policy !== 'object') return null;
    if (policy.capabilityControl && policy.capabilityControl.readiness) return policy.capabilityControl.readiness;
    return policy.readiness || policy;
}

function validRollout(rollout) {
    if (!rollout || typeof rollout !== 'object') return false;
    if (!CAPABILITY_ROLLOUT_FIELDS.every((field) => Object.prototype.hasOwnProperty.call(rollout, field))) return false;
    if (!COUNT_FIELDS.every((field) => isNonNegativeSafeInteger(rollout[field]))) return false;
    if (rollout.knownSampleCount > rollout.sampleCount || rollout.criticalSampleCount > rollout.sampleCount || rollout.recommendationPresentCount > rollout.sampleCount) return false;
    if (rollout.recommendationFlipCount > Math.max(0, rollout.sampleCount - 1)) return false;
    if (rollout.legacyMatchCount + rollout.legacyMissingCount > rollout.sampleCount) return false;
    if (typeof rollout.lastRecommendationPresent !== 'boolean' && rollout.lastRecommendationPresent !== null) return false;
    if (rollout.lastSampleAt !== null && !isNonNegativeFinite(rollout.lastSampleAt)) return false;
    if (rollout.sampleCount > 0 && !isNonNegativeFinite(rollout.lastSampleAt)) return false;
    if (rollout.lastErrorAt !== null && !isNonNegativeFinite(rollout.lastErrorAt)) return false;
    if (typeof rollout.ready !== 'boolean' || !Array.isArray(rollout.blockers)) return false;
    return true;
}

function validPolicy(policy) {
    return policy
        && isNonNegativeFinite(policy.minSamples)
        && isNonNegativeFinite(policy.minKnownRatio)
        && policy.minKnownRatio <= 1
        && isNonNegativeFinite(policy.maxCriticalRatio)
        && policy.maxCriticalRatio <= 1
        && isNonNegativeFinite(policy.maxFlipRatio)
        && policy.maxFlipRatio <= 1
        && isNonNegativeFinite(policy.maxSnapshotAge);
}

function ratiosFor(rollout) {
    const sampleCount = isNonNegativeFinite(rollout && rollout.sampleCount) ? rollout.sampleCount : 0;
    return {
        knownRatio: sampleCount > 0 && isNonNegativeFinite(rollout.knownSampleCount)
            ? rollout.knownSampleCount / sampleCount
            : 0,
        criticalRatio: sampleCount > 0 && isNonNegativeFinite(rollout.criticalSampleCount)
            ? rollout.criticalSampleCount / sampleCount
            : 0,
        recommendationFlipRatio: isNonNegativeFinite(rollout && rollout.recommendationFlipCount)
            ? rollout.recommendationFlipCount / Math.max(1, sampleCount - 1)
            : 0
    };
}

export function appendCapabilitySample(previous, sample) {
    const prior = previous && typeof previous === 'object' ? previous : emptyRollout();
    if (!validSample(sample)) return invalidSampleRollout(prior);
    const nextRecommendationPresent = sample && sample.recommendationPresent === true;
    const previousRecommendationPresent = typeof prior.lastRecommendationPresent === 'boolean'
        ? prior.lastRecommendationPresent
        : null;
    const sampleErrorAt = sample && isNonNegativeFinite(sample.lastErrorAt)
        ? sample.lastErrorAt
        : sample && isNonNegativeFinite(sample.errorAt)
            ? sample.errorAt
            : null;

    return {
        sampleCount: retainedCount(prior, 'sampleCount') + 1,
        knownSampleCount: retainedCount(prior, 'knownSampleCount') + (sample && sample.known === true ? 1 : 0),
        criticalSampleCount: retainedCount(prior, 'criticalSampleCount') + (sample && sample.critical === true ? 1 : 0),
        recommendationPresentCount: retainedCount(prior, 'recommendationPresentCount') + (nextRecommendationPresent ? 1 : 0),
        recommendationFlipCount: retainedCount(prior, 'recommendationFlipCount') + (previousRecommendationPresent !== null && previousRecommendationPresent !== nextRecommendationPresent ? 1 : 0),
        legacyMatchCount: retainedCount(prior, 'legacyMatchCount') + (sample && sample.legacyMatched === true ? 1 : 0),
        legacyMissingCount: retainedCount(prior, 'legacyMissingCount') + (sample && sample.legacyMissing === true ? 1 : 0),
        lastRecommendationPresent: nextRecommendationPresent,
        lastSampleAt: sample && isNonNegativeFinite(sample.sampledAt) ? sample.sampledAt : retainedOptionalTick(prior, 'lastSampleAt'),
        lastErrorAt: sampleErrorAt === null ? retainedOptionalTick(prior, 'lastErrorAt') : sampleErrorAt,
        ready: prior.ready === true,
        blockers: Array.isArray(prior.blockers) ? prior.blockers.filter((blocker) => blocker !== 'invalid_sample') : []
    };
}

export function evaluateCapabilityReadiness(rollout, current, policy, tick) {
    const blockers = [];
    const ratios = ratiosFor(rollout || {});
    const thresholds = readinessPolicy(policy);
    const validCurrent = current
        && typeof current === 'object'
        && Object.prototype.hasOwnProperty.call(LIFECYCLE_RANK, current.lifecycle)
        && isNonNegativeFinite(current.staleFor);

    if (!validRollout(rollout) || !validPolicy(thresholds) || !validCurrent || !isNonNegativeFinite(tick)) {
        return { ready: false, blockers: ['invalid_input'], ratios };
    }
    if (rollout.blockers.includes('invalid_sample')) {
        return { ready: false, blockers: ['invalid_sample'], ratios };
    }

    if (rollout.sampleCount < thresholds.minSamples) blockers.push('insufficient_samples');
    if (ratios.knownRatio < thresholds.minKnownRatio) blockers.push('known_ratio_low');
    if (ratios.criticalRatio > thresholds.maxCriticalRatio) blockers.push('critical_ratio_high');
    if (ratios.recommendationFlipRatio > thresholds.maxFlipRatio) blockers.push('recommendation_flip_ratio_high');
    if (current.staleFor > thresholds.maxSnapshotAge) blockers.push('snapshot_stale');
    if (LIFECYCLE_RANK[current.lifecycle] < LIFECYCLE_RANK.self_sufficient) blockers.push('lifecycle_ineligible');
    if (rollout.lastErrorAt !== null && tick - rollout.lastErrorAt <= thresholds.maxSnapshotAge) blockers.push('recent_governor_error');

    return {
        ready: blockers.length === 0,
        blockers,
        ratios
    };
}
