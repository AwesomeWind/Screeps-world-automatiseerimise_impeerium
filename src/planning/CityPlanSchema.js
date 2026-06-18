import { resolveSourceRuntimeMode } from './SourceRuntimeState.js';

const CITY_PLAN_SCHEMA_VERSION = 4;

const ALLOWED_LIFECYCLE_STATES = new Set([
    'planned',
    'active',
    'transitioning',
    'link_primary',
    'low_priority',
    'retiring',
    'retired_ready'
]);

const ALLOWED_TRANSITIONS = {
    planned: new Set(['active']),
    active: new Set(['transitioning', 'link_primary', 'low_priority']),
    transitioning: new Set(['link_primary', 'retiring']),
    link_primary: new Set(['retiring']),
    low_priority: new Set(['retiring']),
    retiring: new Set(['retired_ready']),
    retired_ready: new Set([])
};

function validatePos(pos, label, errors) {
    if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number' || !pos.roomName) {
        errors.push(`${label} has invalid pos`);
    }
}

function validateCityPlan(cityPlan = {}) {
    const errors = [];
    const seenIds = new Set();
    const plannedStructures = Array.isArray(cityPlan.plannedStructures) ? cityPlan.plannedStructures : [];

    if (cityPlan.schemaVersion !== undefined && cityPlan.schemaVersion !== CITY_PLAN_SCHEMA_VERSION) {
        errors.push(`schemaVersion ${cityPlan.schemaVersion} does not match ${CITY_PLAN_SCHEMA_VERSION}`);
    }

    for (const entry of plannedStructures) {
        if (!entry || typeof entry !== 'object') {
            errors.push('planned structure entry must be an object');
            continue;
        }

        if (!entry.id) errors.push('planned structure missing id');
        else if (seenIds.has(entry.id)) errors.push(`planned structure duplicate id: ${entry.id}`);
        else seenIds.add(entry.id);

        if (!entry.role) errors.push(`planned structure ${entry.id || '<unknown>'} missing role`);
        if (!entry.structureType) errors.push(`planned structure ${entry.id || '<unknown>'} missing structureType`);

        validatePos(entry.pos, `planned structure ${entry.id || '<unknown>'}`, errors);

        const state = entry.lifecycle && entry.lifecycle.state ? entry.lifecycle.state : 'active';
        if (!ALLOWED_LIFECYCLE_STATES.has(state)) {
            errors.push(`planned structure ${entry.id || '<unknown>'} has invalid lifecycle state: ${state}`);
        }
    }

    const sourceWorkPositions = cityPlan.workPositions && cityPlan.workPositions.sources;
    if (sourceWorkPositions && typeof sourceWorkPositions === 'object') {
        for (const sourceId of Object.keys(sourceWorkPositions)) {
            const primary = sourceWorkPositions[sourceId] &&
                sourceWorkPositions[sourceId].mining &&
                sourceWorkPositions[sourceId].mining.primary;
            if (primary !== undefined && primary !== null) {
                validatePos(primary, `workPositions.sources.${sourceId}.mining.primary`, errors);
            }
        }
    }

    const controllerUpgradePos = cityPlan.workPositions &&
        cityPlan.workPositions.controller &&
        cityPlan.workPositions.controller.upgrade &&
        cityPlan.workPositions.controller.upgrade.primary;
    if (controllerUpgradePos !== undefined && controllerUpgradePos !== null) {
        validatePos(controllerUpgradePos, 'workPositions.controller.upgrade.primary', errors);
    }

    validateSourceRuntime(cityPlan.sourceRuntime, errors);

    return { valid: errors.length === 0, errors };
}

function validateSourceRuntime(sourceRuntime, errors) {
    if (sourceRuntime === undefined || sourceRuntime === null) return;
    if (typeof sourceRuntime !== 'object' || Array.isArray(sourceRuntime)) {
        errors.push('sourceRuntime must be an object');
        return;
    }

    const runtimeSources = sourceRuntime.sources;
    if (runtimeSources === undefined || runtimeSources === null) return;
    if (typeof runtimeSources !== 'object' || Array.isArray(runtimeSources)) {
        errors.push('sourceRuntime.sources must be an object');
        return;
    }

    for (const sourceId of Object.keys(runtimeSources)) {
        const entry = runtimeSources[sourceId];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            errors.push(`sourceRuntime.sources.${sourceId} must be an object`);
            continue;
        }

        if (!entry.preferredOutputRole) {
            errors.push(`sourceRuntime.sources.${sourceId} missing preferredOutputRole`);
        }
        if (!entry.deliveryMode) {
            errors.push(`sourceRuntime.sources.${sourceId} missing deliveryMode`);
        }
        if (!entry.preferredOutputRole || !entry.deliveryMode) continue;

        const resolved = resolveSourceRuntimeMode(entry.preferredOutputRole, entry.deliveryMode);
        if (!resolved.valid) {
            errors.push(`sourceRuntime.sources.${sourceId} ${resolved.error}`);
        }
    }
}

function transitionAssetLifecycle(asset, nextState) {
    if (!asset || !nextState) return { valid: false, error: 'asset and nextState are required' };
    const currentState = asset.lifecycle && asset.lifecycle.state ? asset.lifecycle.state : 'active';
    const allowed = ALLOWED_TRANSITIONS[currentState];
    if (!allowed || !allowed.has(nextState)) {
        return { valid: false, error: `illegal lifecycle transition: ${currentState} -> ${nextState}` };
    }
    return {
        valid: true,
        asset: {
            ...asset,
            lifecycle: {
                ...(asset.lifecycle || {}),
                state: nextState
            }
        }
    };
}

export {
    CITY_PLAN_SCHEMA_VERSION,
    validateCityPlan,
    transitionAssetLifecycle
};
