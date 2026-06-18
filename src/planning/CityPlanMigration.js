import { CITY_PLAN_SCHEMA_VERSION } from './CityPlanSchema.js';
import { SOURCE_DELIVERY_MODES, SOURCE_OUTPUT_ROLES } from './SourceRuntimeState.js';

function migrateCityPlanToCurrent(cityPlan = {}) {
    return migrateCityPlan(cityPlan, CITY_PLAN_SCHEMA_VERSION);
}

function migrateCityPlan(cityPlan = {}, targetVersion = CITY_PLAN_SCHEMA_VERSION) {
    if (!cityPlan || typeof cityPlan !== 'object') {
        return {
            changed: false,
            cityPlan,
            fromVersion: null,
            toVersion: targetVersion,
            warnings: ['cityPlan is not an object'],
            changes: emptyChanges()
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
            changes: emptyChanges()
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

    migrateCanonicalSourceRuntime(nextPlan, changes);
    migrateWorkPositions(nextPlan, changes);
    migratePlannedStructures(nextPlan, changes);

    nextPlan.schemaVersion = targetVersion;

    return {
        changed: true,
        cityPlan: nextPlan,
        fromVersion,
        toVersion: targetVersion,
        warnings,
        changes
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

function migratePlannedStructures(cityPlan, changes) {
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
        }, (entry) => entry.role === 'source_container' && entry.scope && entry.scope.sourceId === sourceId);
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
        }, (entry) => entry.role === 'source_link' && entry.scope && entry.scope.sourceId === sourceId);
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
    }, (entry) => entry.role === 'controller_container');
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
    }, (entry) => entry.role === 'controller_link');
}

function maybeAddStructure(plannedStructures, changes, entry, duplicateMatcher) {
    if (!entry || !entry.pos) return;
    if (plannedStructures.some((candidate) => candidate && candidate.id === entry.id)) return;
    if (plannedStructures.some((candidate) => candidate && duplicateMatcher(candidate))) return;
    plannedStructures.push(entry);
    changes.plannedStructuresAdded += 1;
}

export {
    migrateCityPlan,
    migrateCityPlanToCurrent
};
