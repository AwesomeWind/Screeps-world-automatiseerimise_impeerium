const SOURCE_OUTPUT_ROLES = {
    CONTAINER: 'source_container',
    LINK: 'source_link'
};

const SOURCE_DELIVERY_MODES = {
    CONTAINER: 'container',
    TRANSITION: 'transition',
    LINK_PRIMARY: 'link_primary'
};

const SOURCE_RUNTIME_MODES = {
    CONTAINER: 'container',
    LINK_TRANSITION: 'link_transition',
    LINK_PRIMARY: 'link_primary',
    INVALID: 'invalid'
};

const SOURCE_RUNTIME_EVENTS = {
    LINK_OUTPUT_PLANNED: 'link_output_planned',
    LINK_NETWORK_ONLINE: 'link_network_online',
    CONTAINER_OUTPUT_SELECTED: 'container_output_selected'
};

const DEFAULT_PREFERRED_OUTPUT_ROLE = SOURCE_OUTPUT_ROLES.CONTAINER;
const DEFAULT_DELIVERY_MODE = SOURCE_DELIVERY_MODES.CONTAINER;
const ALLOWED_RUNTIME_FIELDS = ['preferredOutputRole', 'deliveryMode'];

function getSourceRuntimeState(cityPlan = {}, sourceId, options = {}) {
    const sourcePlan = cityPlan.sources && cityPlan.sources[sourceId];
    const canonicalRuntime = getCanonicalSourceRuntimeEntry(cityPlan, sourceId);
    const allowLegacyFallback = options.allowLegacyFallback !== false;
    if (!canonicalRuntime && !allowLegacyFallback) {
        return {
            sourceId,
            preferredOutputRole: null,
            deliveryMode: null,
            runtimeMode: SOURCE_RUNTIME_MODES.INVALID,
            valid: false,
            error: `missing canonical source runtime state: ${sourceId}`,
            hasSourcePlan: !!sourcePlan
        };
    }
    const preferredOutputRole = canonicalRuntime && canonicalRuntime.preferredOutputRole ?
        canonicalRuntime.preferredOutputRole :
        DEFAULT_PREFERRED_OUTPUT_ROLE;
    const deliveryMode = canonicalRuntime && canonicalRuntime.deliveryMode ?
        canonicalRuntime.deliveryMode :
        DEFAULT_DELIVERY_MODE;
    const resolved = resolveSourceRuntimeMode(preferredOutputRole, deliveryMode);
    return {
        sourceId,
        preferredOutputRole,
        deliveryMode,
        runtimeMode: resolved.runtimeMode,
        valid: resolved.valid,
        error: resolved.error,
        hasSourcePlan: !!sourcePlan
    };
}

function setSourceRuntimeState(cityPlan, sourceId, patch = {}) {
    if (!cityPlan || !sourceId || !patch) return;
    if (!cityPlan.sources) cityPlan.sources = {};
    if (!cityPlan.sources[sourceId]) cityPlan.sources[sourceId] = {};
    if (!cityPlan.sourceRuntime) cityPlan.sourceRuntime = {};
    if (!cityPlan.sourceRuntime.sources) cityPlan.sourceRuntime.sources = {};
    if (!cityPlan.sourceRuntime.sources[sourceId]) cityPlan.sourceRuntime.sources[sourceId] = {};

    for (const field of ALLOWED_RUNTIME_FIELDS) {
        if (patch[field] !== undefined) {
            cityPlan.sourceRuntime.sources[sourceId][field] = patch[field];
        }
    }
}

function promoteSourceToLinkPrimary(cityPlan, sourceId) {
    setSourceRuntimeState(cityPlan, sourceId, {
        preferredOutputRole: SOURCE_OUTPUT_ROLES.LINK,
        deliveryMode: SOURCE_DELIVERY_MODES.LINK_PRIMARY
    });
}

function setSourceLinkOutputTransition(cityPlan, sourceId) {
    setSourceRuntimeState(cityPlan, sourceId, {
        preferredOutputRole: SOURCE_OUTPUT_ROLES.LINK,
        deliveryMode: SOURCE_DELIVERY_MODES.TRANSITION
    });
}

function setSourceContainerOutput(cityPlan, sourceId) {
    setSourceRuntimeState(cityPlan, sourceId, {
        preferredOutputRole: SOURCE_OUTPUT_ROLES.CONTAINER,
        deliveryMode: SOURCE_DELIVERY_MODES.CONTAINER
    });
}

function transitionSourceRuntimeState(cityPlan, sourceId, event, context = {}) {
    const currentState = getSourceRuntimeState(cityPlan, sourceId);
    const from = currentState.runtimeMode;
    const nextState = resolveTransitionTarget(event);

    if (!nextState) {
        return {
            changed: false,
            event,
            from,
            to: null,
            state: currentState,
            error: `unknown source runtime event: ${event}`
        };
    }

    if (!isAllowedTransition(from, nextState, context)) {
        return {
            changed: false,
            event,
            from,
            to: nextState,
            state: currentState,
            error: `illegal source runtime transition: ${from} -> ${nextState}`
        };
    }

    if (nextState === SOURCE_RUNTIME_MODES.LINK_TRANSITION) {
        setSourceLinkOutputTransition(cityPlan, sourceId);
    } else if (nextState === SOURCE_RUNTIME_MODES.LINK_PRIMARY) {
        promoteSourceToLinkPrimary(cityPlan, sourceId);
    } else if (nextState === SOURCE_RUNTIME_MODES.CONTAINER) {
        setSourceContainerOutput(cityPlan, sourceId);
    }

    const state = getSourceRuntimeState(cityPlan, sourceId);

    return {
        changed: true,
        event,
        from,
        to: nextState,
        state,
        error: null
    };
}

function resolveSourceRuntimeMode(preferredOutputRole, deliveryMode) {
    if (preferredOutputRole === SOURCE_OUTPUT_ROLES.CONTAINER && deliveryMode === SOURCE_DELIVERY_MODES.CONTAINER) {
        return { runtimeMode: SOURCE_RUNTIME_MODES.CONTAINER, valid: true, error: null };
    }
    if (preferredOutputRole === SOURCE_OUTPUT_ROLES.LINK && deliveryMode === SOURCE_DELIVERY_MODES.TRANSITION) {
        return { runtimeMode: SOURCE_RUNTIME_MODES.LINK_TRANSITION, valid: true, error: null };
    }
    if (preferredOutputRole === SOURCE_OUTPUT_ROLES.LINK && deliveryMode === SOURCE_DELIVERY_MODES.LINK_PRIMARY) {
        return { runtimeMode: SOURCE_RUNTIME_MODES.LINK_PRIMARY, valid: true, error: null };
    }
    return {
        runtimeMode: SOURCE_RUNTIME_MODES.INVALID,
        valid: false,
        error: `invalid source runtime combination: ${preferredOutputRole} + ${deliveryMode}`
    };
}

function resolveTransitionTarget(event) {
    if (event === SOURCE_RUNTIME_EVENTS.LINK_OUTPUT_PLANNED) return SOURCE_RUNTIME_MODES.LINK_TRANSITION;
    if (event === SOURCE_RUNTIME_EVENTS.LINK_NETWORK_ONLINE) return SOURCE_RUNTIME_MODES.LINK_PRIMARY;
    if (event === SOURCE_RUNTIME_EVENTS.CONTAINER_OUTPUT_SELECTED) return SOURCE_RUNTIME_MODES.CONTAINER;
    return null;
}

function isAllowedTransition(from, to, context = {}) {
    if (from === SOURCE_RUNTIME_MODES.INVALID) return false;
    if (from === to) return true;
    if (from === SOURCE_RUNTIME_MODES.CONTAINER && to === SOURCE_RUNTIME_MODES.LINK_TRANSITION) return true;
    if (from === SOURCE_RUNTIME_MODES.LINK_TRANSITION && to === SOURCE_RUNTIME_MODES.LINK_PRIMARY) return true;
    if (from === SOURCE_RUNTIME_MODES.LINK_TRANSITION && to === SOURCE_RUNTIME_MODES.CONTAINER) return true;
    if (from === SOURCE_RUNTIME_MODES.LINK_PRIMARY && to === SOURCE_RUNTIME_MODES.CONTAINER) return true;
    if (from === SOURCE_RUNTIME_MODES.CONTAINER && to === SOURCE_RUNTIME_MODES.LINK_PRIMARY) {
        return !!context.allowDirectPromotion;
    }
    return false;
}

function getSourceIds(cityPlan = {}) {
    const sourceIds = new Set();

    if (cityPlan.sources) {
        for (const sourceId of Object.keys(cityPlan.sources)) {
            sourceIds.add(sourceId);
        }
    }

    if (cityPlan.sourceRuntime && cityPlan.sourceRuntime.sources) {
        for (const sourceId of Object.keys(cityPlan.sourceRuntime.sources)) {
            sourceIds.add(sourceId);
        }
    }

    if (Array.isArray(cityPlan.plannedStructures)) {
        for (const entry of cityPlan.plannedStructures) {
            if (entry && entry.scope && entry.scope.sourceId) {
                sourceIds.add(entry.scope.sourceId);
            }
        }
    }

    return Array.from(sourceIds);
}

function getCanonicalSourceRuntimeEntry(cityPlan = {}, sourceId) {
    const runtimeSources = cityPlan.sourceRuntime && cityPlan.sourceRuntime.sources;
    const entry = runtimeSources && runtimeSources[sourceId];
    if (!entry || typeof entry !== 'object') return null;
    return entry;
}

export {
    SOURCE_OUTPUT_ROLES,
    SOURCE_DELIVERY_MODES,
    SOURCE_RUNTIME_MODES,
    SOURCE_RUNTIME_EVENTS,
    resolveSourceRuntimeMode,
    getSourceRuntimeState,
    setSourceRuntimeState,
    promoteSourceToLinkPrimary,
    setSourceLinkOutputTransition,
    setSourceContainerOutput,
    transitionSourceRuntimeState,
    getSourceIds
};
