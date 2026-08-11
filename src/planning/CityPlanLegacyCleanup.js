const OBSERVATION_STREAK_THRESHOLD = 3;
const CONTROLLER_ASSET_ROLES = [
    'controller_container',
    'controller_link'
];
const SOURCE_ASSET_ROLES = [
    'source_container',
    'source_link'
];

function buildLegacyCleanupReadiness(debugSummary = {}, observation = {}) {
    const v3Readiness = debugSummary.v3Readiness || {};
    const assetFallbackReadiness = debugSummary.assetFallbackReadiness || {};
    const assetImportRehearsal = debugSummary.assetImportRehearsal || {};
    const missingCanonicalAssetRoles = new Set(
        Array.isArray(assetImportRehearsal.missingCanonicalAssetRoles)
            ? assetImportRehearsal.missingCanonicalAssetRoles
            : []
    );
    const streakByRole = observation.streakByRole || {};
    const readyStreak = typeof observation.readyStreak === 'number' ? observation.readyStreak : 0;

    const roomReady = !!(v3Readiness.schemaCurrent &&
        v3Readiness.migrationObserved &&
        v3Readiness.sourceRuntimeValid &&
        v3Readiness.assetFallbackFree &&
        readyStreak >= OBSERVATION_STREAK_THRESHOLD);

    const readyRoles = [];
    const blockedRoles = [];
    const reasons = {};

    for (const role of [...CONTROLLER_ASSET_ROLES, ...SOURCE_ASSET_ROLES]) {
        const roleFallbackFree = !!(assetFallbackReadiness[role] && assetFallbackReadiness[role].fallbackFree);
        const canonicalAssetPresent = !missingCanonicalAssetRoles.has(role);
        const roleStreak = typeof streakByRole[role] === 'number' ? streakByRole[role] : 0;
        const roleReady = roomReady &&
            roleFallbackFree &&
            canonicalAssetPresent &&
            roleStreak >= OBSERVATION_STREAK_THRESHOLD;

        if (roleReady) {
            readyRoles.push(role);
            continue;
        }

        blockedRoles.push(role);
        reasons[role] = describeBlockedRole({
            roomReady,
            roleFallbackFree,
            canonicalAssetPresent,
            roleStreak
        });
    }

    return {
        roomReady,
        readyRoles,
        blockedRoles,
        reasons,
        readyForControllerAssetFieldRemoval: CONTROLLER_ASSET_ROLES.every((role) => readyRoles.includes(role)),
        readyForSourceAssetFieldRemoval: SOURCE_ASSET_ROLES.every((role) => readyRoles.includes(role))
    };
}

function cleanupLegacyAssetFields(cityPlan = {}, readiness = {}, options = {}) {
    if (!cityPlan || typeof cityPlan !== 'object') {
        return emptyCleanupResult(cityPlan);
    }

    const cleanupSourceFields = options.cleanupSourceFields === true;
    const removedFields = [];

    if (readiness.readyForControllerAssetFieldRemoval) {
        removeControllerLegacyAssetField(cityPlan, 'containerPos', removedFields);
        removeControllerLegacyAssetField(cityPlan, 'linkPos', removedFields);
    }

    if (cleanupSourceFields && readiness.readyForSourceAssetFieldRemoval) {
        cleanupLegacySourceAssetFields(cityPlan, removedFields);
    }

    return {
        changed: removedFields.length > 0,
        cityPlan,
        removedFields,
        controllerFieldsRemoved: removedFields.some((field) => field.startsWith('controller.')),
        sourceFieldsRemoved: removedFields.some((field) => field.startsWith('sources.'))
    };
}

function buildLegacyWorkPositionCleanupReadiness(cityPlan = {}, debugSummary = {}, observation = {}) {
    const v3Readiness = debugSummary.v3Readiness || {};
    const validation = debugSummary.validation || {};
    const readyStreak = typeof observation.readyStreak === 'number' ? observation.readyStreak : 0;
    const controllerReadyStreak = typeof observation.controllerReadyStreak === 'number' ? observation.controllerReadyStreak : 0;
    const sourceReadyStreak = typeof observation.sourceReadyStreak === 'number' ? observation.sourceReadyStreak : 0;
    const roomReady = !!(v3Readiness.schemaCurrent &&
        v3Readiness.migrationObserved &&
        validation.valid &&
        readyStreak >= OBSERVATION_STREAK_THRESHOLD);
    const blockedFields = [];
    const reasons = {};
    const controllerHasLegacy = !!(cityPlan.controller && cityPlan.controller.primaryUpgradePos);
    const controllerHasCanonical = !!(cityPlan.workPositions &&
        cityPlan.workPositions.controller &&
        cityPlan.workPositions.controller.upgrade &&
        cityPlan.workPositions.controller.upgrade.primary);
    const readyForControllerWorkPositionFieldRemoval = !controllerHasLegacy || (roomReady &&
        controllerHasCanonical &&
        controllerReadyStreak >= OBSERVATION_STREAK_THRESHOLD);

    if (controllerHasLegacy && !readyForControllerWorkPositionFieldRemoval) {
        blockedFields.push('controller.primaryUpgradePos');
        reasons['controller.primaryUpgradePos'] = describeBlockedWorkPositionField({
            roomReady,
            hasCanonical: controllerHasCanonical,
            readyStreak: controllerReadyStreak
        });
    }

    let sourceBlocked = false;
    for (const sourceId of Object.keys(cityPlan.sources || {})) {
        const sourcePlan = cityPlan.sources[sourceId];
        if (!sourcePlan || !sourcePlan.primaryMiningPos) continue;
        const hasCanonical = !!(cityPlan.workPositions &&
            cityPlan.workPositions.sources &&
            cityPlan.workPositions.sources[sourceId] &&
            cityPlan.workPositions.sources[sourceId].mining &&
            cityPlan.workPositions.sources[sourceId].mining.primary);
        const field = `sources.${sourceId}.primaryMiningPos`;
        if (!(roomReady && hasCanonical && sourceReadyStreak >= OBSERVATION_STREAK_THRESHOLD)) {
            sourceBlocked = true;
            blockedFields.push(field);
            reasons[field] = describeBlockedWorkPositionField({
                roomReady,
                hasCanonical,
                readyStreak: sourceReadyStreak
            });
        }
    }

    return {
        roomReady,
        blockedFields,
        reasons,
        readyForControllerWorkPositionFieldRemoval,
        readyForSourceWorkPositionFieldRemoval: !sourceBlocked
    };
}

function cleanupLegacyWorkPositionFields(cityPlan = {}, readiness = {}) {
    if (!cityPlan || typeof cityPlan !== 'object') {
        return {
            changed: false,
            cityPlan,
            removedFields: [],
            workPositionFieldsRemoved: false,
            controllerWorkPositionFieldsRemoved: false,
            sourceWorkPositionFieldsRemoved: false
        };
    }

    const removedFields = [];

    if (readiness.readyForControllerWorkPositionFieldRemoval &&
        cityPlan.controller &&
        cityPlan.controller.primaryUpgradePos !== undefined) {
        delete cityPlan.controller.primaryUpgradePos;
        removedFields.push('controller.primaryUpgradePos');
    }

    if (readiness.readyForSourceWorkPositionFieldRemoval) {
        for (const sourceId of Object.keys(cityPlan.sources || {})) {
            const sourcePlan = cityPlan.sources[sourceId];
            if (!sourcePlan || sourcePlan.primaryMiningPos === undefined) continue;
            delete sourcePlan.primaryMiningPos;
            removedFields.push(`sources.${sourceId}.primaryMiningPos`);
        }
    }

    return {
        changed: removedFields.length > 0,
        cityPlan,
        removedFields,
        workPositionFieldsRemoved: removedFields.some((field) => field.includes('primary')),
        controllerWorkPositionFieldsRemoved: removedFields.some((field) => field === 'controller.primaryUpgradePos'),
        sourceWorkPositionFieldsRemoved: removedFields.some((field) => field.includes('.primaryMiningPos'))
    };
}

function describeBlockedRole({ roomReady, roleFallbackFree, canonicalAssetPresent, roleStreak }) {
    if (!canonicalAssetPresent) return 'canonical_asset_missing';
    if (!roomReady) return 'room_gate_not_ready';
    if (!roleFallbackFree) return 'role_fallback_present';
    if (roleStreak < OBSERVATION_STREAK_THRESHOLD) return 'role_observation_unstable';
    return 'unknown';
}

function describeBlockedWorkPositionField({ roomReady, hasCanonical, readyStreak }) {
    if (!roomReady) return 'room_gate_not_ready';
    if (!hasCanonical) return 'canonical_work_position_missing';
    if (readyStreak < OBSERVATION_STREAK_THRESHOLD) return 'work_position_observation_unstable';
    return 'unknown';
}

function emptyCleanupResult(cityPlan) {
    return {
        changed: false,
        cityPlan,
        removedFields: [],
        controllerFieldsRemoved: false,
        sourceFieldsRemoved: false
    };
}

function removeControllerLegacyAssetField(cityPlan, key, removedFields) {
    if (!cityPlan.controller || cityPlan.controller[key] === undefined) return;
    delete cityPlan.controller[key];
    removedFields.push(`controller.${key}`);
}

function cleanupLegacySourceAssetFields(cityPlan, removedFields) {
    const sources = cityPlan.sources;
    if (!sources || typeof sources !== 'object') return;

    for (const sourceId of Object.keys(sources)) {
        const sourcePlan = sources[sourceId];
        if (!sourcePlan || typeof sourcePlan !== 'object') continue;
        if (sourcePlan.containerPos !== undefined) {
            delete sourcePlan.containerPos;
            removedFields.push(`sources.${sourceId}.containerPos`);
        }
        if (sourcePlan.linkPos !== undefined) {
            delete sourcePlan.linkPos;
            removedFields.push(`sources.${sourceId}.linkPos`);
        }
    }
}

export {
    buildLegacyCleanupReadiness,
    cleanupLegacyAssetFields,
    buildLegacyWorkPositionCleanupReadiness,
    cleanupLegacyWorkPositionFields
};
