import { CITY_PLAN_SCHEMA_VERSION } from './CityPlanSchema.js';
import { SOURCE_DELIVERY_MODES, SOURCE_OUTPUT_ROLES } from './SourceRuntimeState.js';

function migrateCityPlanToCurrent(cityPlan = {}) {
    return migrateCityPlan(cityPlan, CITY_PLAN_SCHEMA_VERSION);
}

function migrateCityPlan(cityPlan = {}, targetVersion = CITY_PLAN_SCHEMA_VERSION, options = {}) {
    if (!cityPlan || typeof cityPlan !== 'object') {
        return {
            changed: false,
            cityPlan,
            fromVersion: null,
            toVersion: targetVersion,
            warnings: ['cityPlan is not an object'],
            changes: emptyChanges(),
            assetImportReadiness: emptyAssetImportReadiness()
        };
    }

    const fromVersion = typeof cityPlan.schemaVersion === 'number' ? cityPlan.schemaVersion : null;
    if (fromVersion === targetVersion) {
        return {
            changed: false,
            cityPlan,
            fromVersion,
            toVersion: targetVersion,
            warnings: [],
            changes: emptyChanges(),
            assetImportReadiness: buildAssetImportReadiness(cityPlan)
        };
    }

    const nextPlan = {
        ...cityPlan,
        sources: { ...(cityPlan.sources || {}) },
        sourceRuntime: cloneSourceRuntime(cityPlan.sourceRuntime),
        controller: cityPlan.controller ? { ...cityPlan.controller } : {},
        workPositions: cloneWorkPositions(cityPlan.workPositions),
        plannedStructures: clonePlannedStructures(cityPlan.plannedStructures)
    };
    const warnings = [];
    const changes = emptyChanges();
    const assetImportReadiness = buildAssetImportReadiness(nextPlan);
    const migrationOptions = normalizeMigrationOptions(options);

    migrateCanonicalSourceRuntime(nextPlan, changes);
    migrateWorkPositions(nextPlan, changes);
    if (migrationOptions.assetImportMode === 'enabled') {
        migratePlannedStructures(nextPlan, changes, assetImportReadiness);
    }

    nextPlan.schemaVersion = targetVersion;
    assetImportReadiness.legacyAssetImportUsed = assetImportReadiness.regeneratedAssetRoles.length > 0;
    assetImportReadiness.readyForAssetImportRemoval = assetImportReadiness.canonicalCompleteBeforeImport &&
        !assetImportReadiness.legacyAssetImportUsed;

    return {
        changed: true,
        cityPlan: nextPlan,
        fromVersion,
        toVersion: targetVersion,
        warnings,
        changes,
        assetImportReadiness
    };
}

function emptyChanges() {
    return {
        plannedStructuresAdded: 0,
        workPositionsAdded: 0,
        runtimeDefaultsAdded: 0,
        sourceRuntimeEntriesAdded: 0,
        legacyStoragePreserved: true
    };
}

function emptyAssetImportReadiness() {
    return {
        canonicalCompleteBeforeImport: false,
        legacyAssetImportUsed: false,
        missingCanonicalAssetRoles: [],
        regeneratedAssetRoles: [],
        readyForAssetImportRemoval: false
    };
}

function normalizeMigrationOptions(options = {}) {
    return {
        assetImportMode: options && options.assetImportMode === 'disabled' ? 'disabled' : 'enabled'
    };
}

function cloneWorkPositions(workPositions) {
    return {
        ...(workPositions || {}),
        sources: { ...((workPositions && workPositions.sources) || {}) },
        controller: {
            ...((workPositions && workPositions.controller) || {}),
            upgrade: {
                ...(((workPositions && workPositions.controller) && workPositions.controller.upgrade) || {})
            }
        }
    };
}

function clonePlannedStructures(plannedStructures) {
    return Array.isArray(plannedStructures) ? plannedStructures.map((entry) => ({ ...entry })) : [];
}

function cloneSourceRuntime(sourceRuntime) {
    return {
        ...(sourceRuntime || {}),
        sources: { ...((sourceRuntime && sourceRuntime.sources) || {}) }
    };
}

function migrateCanonicalSourceRuntime(cityPlan, changes) {
    if (!cityPlan.sourceRuntime) cityPlan.sourceRuntime = { sources: {} };
    if (!cityPlan.sourceRuntime.sources) cityPlan.sourceRuntime.sources = {};

    for (const sourceId of Object.keys(cityPlan.sources || {})) {
        const sourcePlan = cityPlan.sources[sourceId];
        if (!sourcePlan || typeof sourcePlan !== 'object') continue;

        if (!cityPlan.sourceRuntime.sources[sourceId] || typeof cityPlan.sourceRuntime.sources[sourceId] !== 'object') {
            cityPlan.sourceRuntime.sources[sourceId] = {};
            changes.sourceRuntimeEntriesAdded += 1;
        }

        const runtimeEntry = cityPlan.sourceRuntime.sources[sourceId];
        if (!runtimeEntry.preferredOutputRole) {
            runtimeEntry.preferredOutputRole = SOURCE_OUTPUT_ROLES.CONTAINER;
            changes.runtimeDefaultsAdded += 1;
        }
        if (!runtimeEntry.deliveryMode) {
            runtimeEntry.deliveryMode = SOURCE_DELIVERY_MODES.CONTAINER;
            changes.runtimeDefaultsAdded += 1;
        }
    }
}

function migrateWorkPositions(cityPlan, changes) {
    for (const sourceId of Object.keys(cityPlan.sources || {})) {
        const sourcePlan = cityPlan.sources[sourceId];
        if (!sourcePlan || !sourcePlan.primaryMiningPos) continue;
        if (!cityPlan.workPositions.sources[sourceId]) {
            cityPlan.workPositions.sources[sourceId] = {};
        }
        if (!cityPlan.workPositions.sources[sourceId].mining) {
            cityPlan.workPositions.sources[sourceId].mining = {};
        }
        if (!cityPlan.workPositions.sources[sourceId].mining.primary) {
            cityPlan.workPositions.sources[sourceId].mining.primary = sourcePlan.primaryMiningPos;
            changes.workPositionsAdded += 1;
        }
    }

    if (cityPlan.controller && cityPlan.controller.primaryUpgradePos) {
        if (!cityPlan.workPositions.controller.upgrade.primary) {
            cityPlan.workPositions.controller.upgrade.primary = cityPlan.controller.primaryUpgradePos;
            changes.workPositionsAdded += 1;
        }
    }
}

function migratePlannedStructures(cityPlan, changes, assetImportReadiness) {
    for (const sourceId of Object.keys(cityPlan.sources || {})) {
        const sourcePlan = cityPlan.sources[sourceId];
        if (!sourcePlan) continue;
        maybeAddStructure(cityPlan.plannedStructures, changes, {
            id: `${sourceId}:container`,
            role: 'source_container',
            structureType: STRUCTURE_CONTAINER,
            pos: sourcePlan.containerPos,
            scope: { sourceId },
            phase: 'bootstrap',
            group: 'logistics',
            lifecycle: {
                state: 'active',
                activeFromRcl: 1,
                activeUntilRcl: 5,
                replacement: `${sourceId}:link`,
                retirementPolicy: 'defer_until_replacement_online'
            }
        }, (entry) => entry.role === 'source_container' && entry.scope && entry.scope.sourceId === sourceId, assetImportReadiness);
        maybeAddStructure(cityPlan.plannedStructures, changes, {
            id: `${sourceId}:link`,
            role: 'source_link',
            structureType: STRUCTURE_LINK,
            pos: sourcePlan.linkPos,
            scope: { sourceId },
            phase: 'logistics_link',
            group: 'logistics',
            lifecycle: {
                state: 'planned',
                activeFromRcl: 5
            }
        }, (entry) => entry.role === 'source_link' && entry.scope && entry.scope.sourceId === sourceId, assetImportReadiness);
    }

    maybeAddStructure(cityPlan.plannedStructures, changes, {
        id: 'controller:container',
        role: 'controller_container',
        structureType: STRUCTURE_CONTAINER,
        pos: cityPlan.controller && cityPlan.controller.containerPos,
        phase: 'bootstrap',
        group: 'logistics',
        lifecycle: {
            state: 'active',
            activeFromRcl: 1,
            replacement: 'controller:link',
            retirementPolicy: 'defer_until_replacement_online'
        }
    }, (entry) => entry.role === 'controller_container', assetImportReadiness);
    maybeAddStructure(cityPlan.plannedStructures, changes, {
        id: 'controller:link',
        role: 'controller_link',
        structureType: STRUCTURE_LINK,
        pos: cityPlan.controller && cityPlan.controller.linkPos,
        phase: 'logistics_link',
        group: 'logistics',
        lifecycle: {
            state: 'planned',
            activeFromRcl: 5
        }
    }, (entry) => entry.role === 'controller_link', assetImportReadiness);
}

function maybeAddStructure(plannedStructures, changes, entry, duplicateMatcher, assetImportReadiness) {
    if (!entry || !entry.pos) return false;
    if (plannedStructures.some((candidate) => candidate && candidate.id === entry.id)) return false;
    if (plannedStructures.some((candidate) => candidate && duplicateMatcher(candidate))) return false;
    plannedStructures.push(entry);
    changes.plannedStructuresAdded += 1;
    if (assetImportReadiness) {
        pushUnique(assetImportReadiness.regeneratedAssetRoles, entry.role);
    }
    return true;
}

function buildAssetImportReadiness(cityPlan = {}) {
    const readiness = emptyAssetImportReadiness();
    const missingRoles = new Set();
    let missingAny = false;

    for (const sourceId of Object.keys(cityPlan.sources || {})) {
        const sourcePlan = cityPlan.sources[sourceId];
        if (!sourcePlan) continue;
        if (sourcePlan.containerPos && !hasPlannedStructure(cityPlan.plannedStructures, (entry) =>
            entry.role === 'source_container' && entry.scope && entry.scope.sourceId === sourceId
        )) {
            missingRoles.add('source_container');
            missingAny = true;
        }
        if (sourcePlan.linkPos && !hasPlannedStructure(cityPlan.plannedStructures, (entry) =>
            entry.role === 'source_link' && entry.scope && entry.scope.sourceId === sourceId
        )) {
            missingRoles.add('source_link');
            missingAny = true;
        }
    }

    if (cityPlan.controller && cityPlan.controller.containerPos &&
        !hasPlannedStructure(cityPlan.plannedStructures, (entry) => entry.role === 'controller_container')) {
        missingRoles.add('controller_container');
        missingAny = true;
    }
    if (cityPlan.controller && cityPlan.controller.linkPos &&
        !hasPlannedStructure(cityPlan.plannedStructures, (entry) => entry.role === 'controller_link')) {
        missingRoles.add('controller_link');
        missingAny = true;
    }

    readiness.canonicalCompleteBeforeImport = !missingAny;
    readiness.missingCanonicalAssetRoles = Array.from(missingRoles);
    readiness.readyForAssetImportRemoval = readiness.canonicalCompleteBeforeImport;
    return readiness;
}

function hasPlannedStructure(plannedStructures, matcher) {
    return Array.isArray(plannedStructures) && plannedStructures.some((entry) => entry && matcher(entry));
}

function pushUnique(list, value) {
    if (!Array.isArray(list) || list.includes(value)) return;
    list.push(value);
}

export {
    migrateCityPlan,
    migrateCityPlanToCurrent
};
