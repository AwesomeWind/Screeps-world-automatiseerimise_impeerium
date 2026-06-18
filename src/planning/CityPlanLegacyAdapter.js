import { getActivePlannedStructure, samePos } from './CityPlanHelpers.js';

function legacyAsset(role, structureType, pos, scope = null) {
    if (!pos) return null;
    const entry = {
        id: `legacy:${role}:${pos.roomName}:${pos.x},${pos.y}`,
        role,
        structureType,
        pos,
        lifecycle: { state: 'active', activeFromRcl: 1 }
    };
    if (scope) entry.scope = scope;
    return entry;
}

function resolvedAsset(asset, source) {
    return {
        asset,
        source,
        legacyFallbackUsed: source === 'legacy'
    };
}

function emptyResolvedAsset() {
    return {
        asset: null,
        source: 'none',
        legacyFallbackUsed: false
    };
}

function missingResolvedAsset() {
    return {
        asset: null,
        source: 'missing',
        legacyFallbackUsed: false
    };
}

function getPlannedOrLegacyAsset(planned, legacy, options = {}) {
    const allowLegacyFallback = options.allowLegacyFallback !== false;
    if (planned) return resolvedAsset(planned, 'planned');
    if (allowLegacyFallback && legacy) return resolvedAsset(legacy, 'legacy');
    if (!allowLegacyFallback && legacy) return missingResolvedAsset();
    return emptyResolvedAsset();
}

function resolveControllerContainerAsset(cityPlan = {}, options = {}) {
    const planned = getActivePlannedStructure(cityPlan, 'controller_container');
    const legacy = legacyAsset('controller_container', STRUCTURE_CONTAINER, cityPlan.controller && cityPlan.controller.containerPos);
    return getPlannedOrLegacyAsset(planned, legacy, options);
}

function getControllerContainerAsset(cityPlan = {}, options = {}) {
    return resolveControllerContainerAsset(cityPlan, options).asset;
}

function resolveSourceContainerAsset(cityPlan = {}, sourceId, options = {}) {
    const planned = getActivePlannedStructure(cityPlan, 'source_container', { sourceId });
    const legacySource = cityPlan.sources && cityPlan.sources[sourceId];
    const legacy = legacyAsset('source_container', STRUCTURE_CONTAINER, legacySource && legacySource.containerPos, { sourceId });
    return getPlannedOrLegacyAsset(planned, legacy, options);
}

function getSourceContainerAsset(cityPlan = {}, sourceId, options = {}) {
    return resolveSourceContainerAsset(cityPlan, sourceId, options).asset;
}

function resolveControllerLinkAsset(cityPlan = {}, options = {}) {
    const planned = getActivePlannedStructure(cityPlan, 'controller_link');
    const legacy = legacyAsset('controller_link', STRUCTURE_LINK, cityPlan.controller && cityPlan.controller.linkPos);
    return getPlannedOrLegacyAsset(planned, legacy, options);
}

function getControllerLinkAsset(cityPlan = {}, options = {}) {
    return resolveControllerLinkAsset(cityPlan, options).asset;
}

function resolveSourceLinkAsset(cityPlan = {}, sourceId, options = {}) {
    const planned = getActivePlannedStructure(cityPlan, 'source_link', { sourceId });
    const legacySource = cityPlan.sources && cityPlan.sources[sourceId];
    const legacy = legacyAsset('source_link', STRUCTURE_LINK, legacySource && legacySource.linkPos, { sourceId });
    return getPlannedOrLegacyAsset(planned, legacy, options);
}

function getSourceLinkAsset(cityPlan = {}, sourceId, options = {}) {
    return resolveSourceLinkAsset(cityPlan, sourceId, options).asset;
}

function isControllerContainerAsset(cityPlan = {}, structure) {
    if (!structure || structure.structureType !== STRUCTURE_CONTAINER || !structure.pos) return false;
    const asset = getControllerContainerAsset(cityPlan);
    return !!(asset && samePos(asset.pos, structure.pos));
}

function isSourceContainerAsset(cityPlan = {}, structure, sourceId, options = {}) {
    if (!structure || structure.structureType !== STRUCTURE_CONTAINER || !structure.pos) return false;
    if (sourceId) {
        const asset = getSourceContainerAsset(cityPlan, sourceId, options);
        return !!(asset && samePos(asset.pos, structure.pos));
    }
    const planned = Array.isArray(cityPlan.plannedStructures) ?
        cityPlan.plannedStructures.find((entry) => entry.role === 'source_container' && entry.structureType === STRUCTURE_CONTAINER && samePos(entry.pos, structure.pos)) :
        null;
    if (planned) return true;
    if (options.allowLegacyFallback === false) return false;
    if (!cityPlan.sources) return false;
    for (const id of Object.keys(cityPlan.sources)) {
        if (isSourceContainerAsset(cityPlan, structure, id, options)) return true;
    }
    return false;
}

function isControllerLinkAsset(cityPlan = {}, structure) {
    if (!structure || structure.structureType !== STRUCTURE_LINK || !structure.pos) return false;
    const asset = getControllerLinkAsset(cityPlan);
    return !!(asset && samePos(asset.pos, structure.pos));
}

function isSourceLinkAsset(cityPlan = {}, structure, sourceId) {
    if (!structure || structure.structureType !== STRUCTURE_LINK || !structure.pos) return false;
    if (sourceId) {
        const asset = getSourceLinkAsset(cityPlan, sourceId);
        return !!(asset && samePos(asset.pos, structure.pos));
    }
    const planned = Array.isArray(cityPlan.plannedStructures) ?
        cityPlan.plannedStructures.find((entry) => entry.role === 'source_link' && entry.structureType === STRUCTURE_LINK && samePos(entry.pos, structure.pos)) :
        null;
    if (planned) return true;
    if (!cityPlan.sources) return false;
    for (const id of Object.keys(cityPlan.sources)) {
        if (isSourceLinkAsset(cityPlan, structure, id)) return true;
    }
    return false;
}

export {
    resolveControllerContainerAsset,
    resolveSourceContainerAsset,
    resolveControllerLinkAsset,
    resolveSourceLinkAsset,
    getControllerContainerAsset,
    getSourceContainerAsset,
    getControllerLinkAsset,
    getSourceLinkAsset,
    isControllerContainerAsset,
    isSourceContainerAsset,
    isControllerLinkAsset,
    isSourceLinkAsset
};
