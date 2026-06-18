function samePos(left, right) {
    return !!left && !!right &&
        left.x === right.x &&
        left.y === right.y &&
        left.roomName === right.roomName;
}

function matchesScope(entry, scope = {}) {
    if (!scope || Object.keys(scope).length === 0) return true;
    const entryScope = entry && entry.scope ? entry.scope : {};
    for (const key of Object.keys(scope)) {
        if (entryScope[key] !== scope[key]) return false;
    }
    return true;
}

function normalizeLifecycle(entry) {
    const lifecycle = entry && entry.lifecycle ? entry.lifecycle : {};
    return {
        state: lifecycle.state || 'active',
        activeFromRcl: lifecycle.activeFromRcl === undefined ? 1 : lifecycle.activeFromRcl,
        activeUntilRcl: lifecycle.activeUntilRcl,
        replacement: lifecycle.replacement || null,
        retirementPolicy: lifecycle.retirementPolicy || null
    };
}

function isLifecycleActive(entry) {
    const lifecycle = normalizeLifecycle(entry);
    return lifecycle.state === 'active' || lifecycle.state === 'planned';
}

function getPlannedStructures(cityPlan) {
    return cityPlan && Array.isArray(cityPlan.plannedStructures) ? cityPlan.plannedStructures : [];
}

function getPlannedStructuresByRole(cityPlan, role, scope = null) {
    return getPlannedStructures(cityPlan).filter((entry) => {
        return entry.role === role && matchesScope(entry, scope || {});
    });
}

function getPlannedStructuresByPhase(cityPlan, phase) {
    return getPlannedStructures(cityPlan).filter((entry) => entry.phase === phase);
}

function getPlannedStructuresByGroup(cityPlan, group) {
    return getPlannedStructures(cityPlan).filter((entry) => entry.group === group);
}

function getActivePlannedStructure(cityPlan, role, scope = null) {
    const entries = getPlannedStructuresByRole(cityPlan, role, scope);
    return entries.find(isLifecycleActive) || entries[0] || null;
}

function findPlannedStructureAtPos(cityPlan, pos, structureType = null) {
    return getPlannedStructures(cityPlan).find((entry) => {
        if (structureType && entry.structureType !== structureType) return false;
        return samePos(entry.pos, pos);
    }) || null;
}

function findPlannedStructureForObject(cityPlan, structureOrEntry) {
    if (!structureOrEntry) return null;
    if (structureOrEntry.role && structureOrEntry.pos) return structureOrEntry;
    return findPlannedStructureAtPos(cityPlan, structureOrEntry.pos, structureOrEntry.structureType);
}

function getStructureLifecycle(cityPlan, structureOrEntry) {
    if (!structureOrEntry) return normalizeLifecycle(null);
    if (structureOrEntry.lifecycle) return normalizeLifecycle(structureOrEntry);
    const planned = findPlannedStructureForObject(cityPlan, structureOrEntry);
    return normalizeLifecycle(planned);
}

function getPlannedRole(cityPlan, structureOrEntry) {
    const planned = findPlannedStructureForObject(cityPlan, structureOrEntry);
    return planned && planned.role ? planned.role : null;
}

function getPlannedGroup(cityPlan, structureOrEntry) {
    const planned = findPlannedStructureForObject(cityPlan, structureOrEntry);
    return planned && planned.group ? planned.group : null;
}

function getPlannedLifecycleState(cityPlan, structureOrEntry) {
    return getStructureLifecycle(cityPlan, structureOrEntry).state;
}

function isLifecycleState(structureOrEntry, states = []) {
    if (!structureOrEntry || !Array.isArray(states) || states.length === 0) return false;
    const lifecycle = structureOrEntry.lifecycle ? normalizeLifecycle(structureOrEntry) : normalizeLifecycle(null);
    return states.includes(lifecycle.state);
}

function getHubPlan(cityPlan) {
    return cityPlan && cityPlan.hub ? cityPlan.hub : null;
}

export {
    samePos,
    getPlannedStructuresByRole,
    getPlannedStructuresByPhase,
    getPlannedStructuresByGroup,
    getActivePlannedStructure,
    findPlannedStructureAtPos,
    findPlannedStructureForObject,
    getPlannedRole,
    getPlannedGroup,
    getPlannedLifecycleState,
    isLifecycleState,
    getHubPlan,
    getStructureLifecycle
};
