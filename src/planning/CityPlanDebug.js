import { getSourceOutputPolicy } from './CityAssetPolicy.js';
import { getCityWorkPositions } from './CityWorkPositionPolicy.js';
import { getSourceIds, getSourceRuntimeState, SOURCE_RUNTIME_MODES } from './SourceRuntimeState.js';
import { CITY_PLAN_SCHEMA_VERSION, validateCityPlan } from './CityPlanSchema.js';

const MAX_TRANSITION_FAILURES = 20;
const ASSET_FALLBACK_ROLES = [
    'controller_container',
    'controller_link',
    'source_container',
    'source_link'
];

function recordLifecycleTransitionFailure(roomName, failure) {
    if (typeof Memory === 'undefined' || !roomName || !failure) return;
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    const roomMemory = Memory.rooms[roomName];
    if (!Array.isArray(roomMemory.cityPlanTransitionFailures)) {
        roomMemory.cityPlanTransitionFailures = [];
    }
    roomMemory.cityPlanTransitionFailures.push({
        tick: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
        ...failure
    });
    if (roomMemory.cityPlanTransitionFailures.length > MAX_TRANSITION_FAILURES) {
        roomMemory.cityPlanTransitionFailures = roomMemory.cityPlanTransitionFailures.slice(-MAX_TRANSITION_FAILURES);
    }
}

function buildCityPlanDebug(roomName, cityPlan = {}) {
    const plannedStructures = Array.isArray(cityPlan.plannedStructures) ? cityPlan.plannedStructures : [];
    const assetCountsByRole = {};
    const assetCountsByLifecycle = {};

    for (const entry of plannedStructures) {
        const role = entry && entry.role ? entry.role : 'unknown';
        const lifecycleState = entry && entry.lifecycle && entry.lifecycle.state ? entry.lifecycle.state : 'active';
        assetCountsByRole[role] = (assetCountsByRole[role] || 0) + 1;
        assetCountsByLifecycle[lifecycleState] = (assetCountsByLifecycle[lifecycleState] || 0) + 1;
    }

    const legacyFallbacks = [];

    const sourceOutputPolicies = {};
    const sourceRuntime = {
        byMode: {
            [SOURCE_RUNTIME_MODES.CONTAINER]: 0,
            [SOURCE_RUNTIME_MODES.LINK_TRANSITION]: 0,
            [SOURCE_RUNTIME_MODES.LINK_PRIMARY]: 0,
            [SOURCE_RUNTIME_MODES.INVALID]: 0
        },
        invalidSources: [],
        canonical: {
            totalSources: countCanonicalSourceRuntimeSources(cityPlan),
            missingSources: [],
            fallbackSources: [],
            mismatchedSources: []
        }
    };
    for (const sourceId of getSourceIds(cityPlan)) {
        sourceOutputPolicies[sourceId] = getSourceOutputPolicy(cityPlan, sourceId, {
            sourceRuntimeAllowLegacyFallback: true
        });
        const runtimeState = getSourceRuntimeState(cityPlan, sourceId);
        const runtimeMode = runtimeState.runtimeMode || SOURCE_RUNTIME_MODES.INVALID;
        sourceRuntime.byMode[runtimeMode] = (sourceRuntime.byMode[runtimeMode] || 0) + 1;
        if (!runtimeState.valid) {
            sourceRuntime.invalidSources.push({
                sourceId,
                preferredOutputRole: runtimeState.preferredOutputRole,
                deliveryMode: runtimeState.deliveryMode,
                error: runtimeState.error
            });
        }

        const canonicalRuntime = getCanonicalSourceRuntimeEntry(cityPlan, sourceId);
        if (!canonicalRuntime) {
            sourceRuntime.canonical.missingSources.push(sourceId);
            sourceRuntime.canonical.fallbackSources.push(sourceId);
        }
    }

    const roomMemory = typeof Memory !== 'undefined' && Memory.rooms ? Memory.rooms[roomName] : null;
    const migration = roomMemory && roomMemory.cityPlanMigration ? { ...roomMemory.cityPlanMigration } : null;
    const transitionFailures = roomMemory && Array.isArray(roomMemory.cityPlanTransitionFailures)
        ? roomMemory.cityPlanTransitionFailures.slice()
        : [];
    const workPositions = getCityWorkPositions(cityPlan);
    const sourceMiningCount = countSourceMiningWorkPositions(workPositions);
    const hasControllerUpgrade = !!(workPositions.controller &&
        workPositions.controller.upgrade &&
        workPositions.controller.upgrade.primary);
    const legacyFallbackSummary = summarizeLegacyFallbacks(legacyFallbacks);
    const assetFallbackReadiness = buildAssetFallbackReadiness(legacyFallbackSummary);
    const validation = validateCityPlan(cityPlan);
    const v3Readiness = {
        schemaCurrent: cityPlan.schemaVersion === CITY_PLAN_SCHEMA_VERSION,
        migrationObserved: !!migration,
        legacyFallbackFree: legacyFallbackSummary.total === 0,
        assetFallbackFree: legacyFallbackSummary.total === 0,
        assetFallbackObservationStable: false,
        sourceRuntimeCanonicalComplete: sourceRuntime.canonical.missingSources.length === 0,
        sourceRuntimeStorageConsistent: sourceRuntime.canonical.mismatchedSources.length === 0,
        sourceRuntimeFallbackFree: sourceRuntime.canonical.fallbackSources.length === 0,
        sourceRuntimeValid: sourceRuntime.invalidSources.length === 0,
        readyForRuntimeFallbackDisable: false,
        readyForFallbackDisable: false,
        readyForAssetFallbackDisable: false
    };
    for (const role of ASSET_FALLBACK_ROLES) {
        assetFallbackReadiness[role].readyForDisable = assetFallbackReadiness[role].fallbackFree;
    }
    v3Readiness.readyForRuntimeFallbackDisable = v3Readiness.schemaCurrent &&
        v3Readiness.migrationObserved &&
        v3Readiness.sourceRuntimeCanonicalComplete &&
        v3Readiness.sourceRuntimeFallbackFree &&
        v3Readiness.sourceRuntimeValid;
    v3Readiness.readyForFallbackDisable = v3Readiness.schemaCurrent &&
        v3Readiness.migrationObserved &&
        v3Readiness.legacyFallbackFree &&
        v3Readiness.sourceRuntimeValid;

    return {
        updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
        schemaVersion: cityPlan.schemaVersion,
        validation,
        assetCountsByRole,
        assetCountsByLifecycle,
        workPositions: {
            sourceMiningCount,
            hasControllerUpgrade
        },
        sourceRuntime,
        assetFallbackReadiness,
        legacyFallbacks,
        legacyFallbackSummary,
        migration,
        assetImportObservation: null,
        assetImportExecution: null,
        assetImportRehearsal: null,
        assetImportRetirementGate: null,
        assetImportRollout: null,
        assetImportRollbackGate: null,
        v3Readiness,
        legacyCleanupReadiness: null,
        legacyWorkPositionCleanupReadiness: null,
        legacyCleanupExecution: null,
        transitionFailures,
        sourceOutputPolicies
    };
}

function countSourceMiningWorkPositions(workPositions = {}) {
    const sources = workPositions.sources;
    if (!sources || typeof sources !== 'object') return 0;

    let count = 0;
    for (const sourceId of Object.keys(sources)) {
        if (sources[sourceId] &&
            sources[sourceId].mining &&
            sources[sourceId].mining.primary) {
            count++;
        }
    }
    return count;
}

function summarizeLegacyFallbacks(legacyFallbacks = []) {
    const summary = {
        total: legacyFallbacks.length,
        byRole: {},
        bySource: {}
    };

    for (const fallback of legacyFallbacks) {
        const role = fallback && fallback.role ? fallback.role : 'unknown';
        summary.byRole[role] = (summary.byRole[role] || 0) + 1;
        if (fallback && fallback.sourceId) {
            summary.bySource[fallback.sourceId] = (summary.bySource[fallback.sourceId] || 0) + 1;
        }
    }

    return summary;
}

function buildAssetFallbackReadiness(legacyFallbackSummary = {}) {
    const byRole = legacyFallbackSummary.byRole || {};
    const readiness = {};

    for (const role of ASSET_FALLBACK_ROLES) {
        const fallbackCount = byRole[role] || 0;
        readiness[role] = {
            fallbackCount,
            fallbackFree: fallbackCount === 0,
            readyForDisable: false
        };
    }

    return readiness;
}

function countCanonicalSourceRuntimeSources(cityPlan = {}) {
    const runtimeSources = cityPlan.sourceRuntime && cityPlan.sourceRuntime.sources;
    if (!runtimeSources || typeof runtimeSources !== 'object') return 0;
    return Object.keys(runtimeSources).length;
}

function getCanonicalSourceRuntimeEntry(cityPlan = {}, sourceId) {
    const runtimeSources = cityPlan.sourceRuntime && cityPlan.sourceRuntime.sources;
    const entry = runtimeSources && runtimeSources[sourceId];
    if (!entry || typeof entry !== 'object') return null;
    return entry;
}

export {
    buildCityPlanDebug,
    recordLifecycleTransitionFailure
};
