import { findPlannedStructureForObject, getPlannedGroup, getPlannedLifecycleState, getPlannedRole } from './CityPlanHelpers.js';
import { resolveSourceLinkAsset } from './CityPlanLegacyAdapter.js';
import { getSourceRuntimeState, SOURCE_DELIVERY_MODES, SOURCE_OUTPUT_ROLES, SOURCE_RUNTIME_MODES } from './SourceRuntimeState.js';

function getAssetPolicy(cityPlan, structureOrEntry) {
    const role = getPlannedRole(cityPlan, structureOrEntry);
    const group = getPlannedGroup(cityPlan, structureOrEntry);
    const lifecycleState = getPlannedLifecycleState(cityPlan, structureOrEntry);
    const structureType = structureOrEntry && structureOrEntry.structureType ? structureOrEntry.structureType : null;

    return {
        role,
        group,
        lifecycleState,
        structureType,
        logistics: buildLogisticsPolicy(role, lifecycleState, structureType),
        maintenance: buildMaintenancePolicy(role, lifecycleState, structureType),
        build: buildConstructionPolicy(role, group, lifecycleState)
    };
}

function buildLogisticsPolicy(role, lifecycleState, structureType) {
    const policy = {
        supplyMode: 'normal',
        supplyPriority: 45,
        demandMode: 'sink',
        demandPriority: 25,
        shouldSupply: false,
        shouldDemand: false
    };

    if (role === 'source_container') {
        if (lifecycleState === 'active' || lifecycleState === 'planned') {
            return { ...policy, supplyMode: 'active', supplyPriority: 45, shouldSupply: true };
        }
        if (lifecycleState === 'link_primary') {
            return { ...policy, supplyMode: 'fallback', supplyPriority: 20, shouldSupply: true };
        }
        return { ...policy, supplyMode: 'disabled', shouldSupply: false };
    }

    if (role === 'controller_container') {
        if (lifecycleState === 'active' || lifecycleState === 'planned') {
            return { ...policy, demandMode: 'buffer', demandPriority: 55, shouldDemand: true };
        }
        if (lifecycleState === 'link_primary') {
            return { ...policy, demandMode: 'buffer', demandPriority: 35, shouldDemand: true };
        }
        return { ...policy, demandMode: 'disabled', shouldDemand: false };
    }

    if (role === 'hub_terminal' || role === 'hub_storage') {
        return {
            ...policy,
            supplyMode: 'hub',
            supplyPriority: 65,
            demandMode: 'sink',
            demandPriority: 25,
            shouldSupply: true,
            shouldDemand: true
        };
    }

    if (structureType === STRUCTURE_STORAGE || structureType === STRUCTURE_TERMINAL || structureType === STRUCTURE_LAB) {
        return {
            ...policy,
            supplyMode: 'normal',
            supplyPriority: 45,
            demandMode: 'sink',
            demandPriority: 25,
            shouldSupply: true,
            shouldDemand: structureType === STRUCTURE_STORAGE || structureType === STRUCTURE_TERMINAL
        };
    }

    if (structureType === STRUCTURE_CONTAINER) {
        return {
            ...policy,
            supplyMode: 'normal',
            supplyPriority: 45,
            demandMode: 'sink',
            demandPriority: 25,
            shouldSupply: true,
            shouldDemand: true
        };
    }

    return policy;
}

function buildMaintenancePolicy(role, lifecycleState, structureType) {
    if (role === 'source_container') {
        if (lifecycleState === 'retired_ready') return { shouldRepair: false, repairMode: 'none' };
        if (lifecycleState === 'retiring') return { shouldRepair: true, repairMode: 'band', repairBelowRatio: 0.65, targetRatio: 0.9, reason: 'source_container_retiring', priority: 48 };
        if (lifecycleState === 'link_primary') return { shouldRepair: true, repairMode: 'band', repairBelowRatio: 0.7, targetRatio: 0.92, reason: 'source_container_link_primary', priority: 58 };
        return { shouldRepair: true, repairMode: 'band', repairBelowRatio: 0.75, targetRatio: 0.95, reason: 'source_container', priority: 82 };
    }

    if (role === 'controller_container') {
        if (lifecycleState === 'retired_ready') return { shouldRepair: false, repairMode: 'none' };
        if (lifecycleState === 'retiring') return { shouldRepair: true, repairMode: 'band', repairBelowRatio: 0.65, targetRatio: 0.9, reason: 'controller_container_retiring', priority: 46 };
        if (lifecycleState === 'link_primary') return { shouldRepair: true, repairMode: 'band', repairBelowRatio: 0.7, targetRatio: 0.92, reason: 'controller_container_link_primary', priority: 56 };
        return { shouldRepair: true, repairMode: 'band', repairBelowRatio: 0.75, targetRatio: 0.95, reason: 'controller_container', priority: 80 };
    }

    if (role === 'logistics_road') {
        if (lifecycleState === 'retiring' || lifecycleState === 'retired_ready') return { shouldRepair: false, repairMode: 'none' };
        if (lifecycleState === 'low_priority') return { shouldRepair: true, repairMode: 'band', repairBelowRatio: 0.45, targetRatio: 0.75, reason: 'logistics_road_low_priority', priority: 35 };
        return { shouldRepair: true, repairMode: 'band', repairBelowRatio: 0.65, targetRatio: 0.9, reason: `${structureType}_damage`, priority: 60 };
    }

    if (role === 'defense_rampart' && lifecycleState === 'low_priority') {
        return { shouldRepair: true, repairMode: 'defense_cap', targetHits: 25000, reason: 'defense_rampart_low_priority', priority: 45 };
    }

    if (role === 'defense_wall' && lifecycleState === 'low_priority') {
        return { shouldRepair: true, repairMode: 'defense_cap', targetHits: 25000, reason: 'defense_wall_low_priority', priority: 40 };
    }

    return { shouldRepair: true, repairMode: 'default' };
}

function buildConstructionPolicy(role, group, lifecycleState) {
    let priorityModifier = 0;
    let buildable = true;

    if (lifecycleState === 'retiring' || lifecycleState === 'retired_ready') {
        return { buildable: false, priorityModifier: -5000 };
    }
    if (lifecycleState === 'low_priority') priorityModifier -= 600;

    if (group === 'logistics') priorityModifier += 300;
    if (group === 'industry') priorityModifier += 0;

    if (role === 'hub_link') priorityModifier += 350;
    if (role === 'hub_terminal') priorityModifier += 250;
    if (role === 'hub_lab') priorityModifier += 180;
    if (role === 'mineral_extractor') priorityModifier += 50;

    return { buildable, priorityModifier };
}

function getLogisticsPolicy(cityPlan, structureOrEntry) {
    return getAssetPolicy(cityPlan, structureOrEntry).logistics;
}

function getMaintenancePolicy(cityPlan, structureOrEntry) {
    const policy = getAssetPolicy(cityPlan, structureOrEntry).maintenance;
    if (policy.repairMode === 'band' && structureOrEntry && structureOrEntry.hitsMax) {
        return {
            ...policy,
            repairBelow: Math.floor(structureOrEntry.hitsMax * policy.repairBelowRatio),
            targetHits: Math.floor(structureOrEntry.hitsMax * policy.targetRatio)
        };
    }
    return policy;
}

function getBuildPolicy(cityPlan, structureOrEntry) {
    return getAssetPolicy(cityPlan, structureOrEntry).build;
}

function getSourceOutputPolicy(cityPlan = {}, sourceId, runtime = {}) {
    const sourceRuntimeState = getSourceRuntimeState(cityPlan, sourceId, {
        allowLegacyFallback: runtime.sourceRuntimeAllowLegacyFallback === true
    });
    const preferredOutputRole = sourceRuntimeState.preferredOutputRole;
    const deliveryMode = sourceRuntimeState.deliveryMode === SOURCE_DELIVERY_MODES.CONTAINER ? null : sourceRuntimeState.deliveryMode;
    const resolvedSourceLinkAsset = resolveSourceLinkAsset(cityPlan, sourceId, { allowLegacyFallback: false });
    const runtimeMode = sourceRuntimeState.runtimeMode;
    const validRuntimeState = sourceRuntimeState.valid;
    const outputRole = runtimeMode === SOURCE_RUNTIME_MODES.LINK_TRANSITION || runtimeMode === SOURCE_RUNTIME_MODES.LINK_PRIMARY
        ? SOURCE_OUTPUT_ROLES.LINK
        : (preferredOutputRole === SOURCE_OUTPUT_ROLES.LINK ? SOURCE_OUTPUT_ROLES.LINK : SOURCE_OUTPUT_ROLES.CONTAINER);
    const usesLinkOutput = runtimeMode === SOURCE_RUNTIME_MODES.LINK_TRANSITION ||
        runtimeMode === SOURCE_RUNTIME_MODES.LINK_PRIMARY ||
        (!validRuntimeState && preferredOutputRole === SOURCE_OUTPUT_ROLES.LINK);
    const linkPrimary = runtimeMode === SOURCE_RUNTIME_MODES.LINK_PRIMARY;
    const transitioningToLink = runtimeMode === SOURCE_RUNTIME_MODES.LINK_TRANSITION;
    const sourceLinkOnline = !!runtime.sourceLinkOnline;
    const controllerLinkOnline = !!runtime.controllerLinkOnline;
    const normalEnergyPosture = runtime.normalEnergyPosture !== false;
    const stableTicks = typeof runtime.stableTicks === 'number' ? runtime.stableTicks : 0;
    const retireObservationTicks = typeof runtime.retireObservationTicks === 'number' ? runtime.retireObservationTicks : 1500;
    const shouldPromoteToLinkPrimary = usesLinkOutput && sourceLinkOnline && controllerLinkOnline && normalEnergyPosture;
    const shouldRetireSourceContainer = linkPrimary && stableTicks >= retireObservationTicks;

    return {
        sourceId,
        outputRole,
        bodyProfile: usesLinkOutput ? 'link_miner' : 'miner',
        preferredOutputRole,
        deliveryMode,
        runtimeMode,
        validRuntimeState,
        outputAssetRole: resolvedSourceLinkAsset.asset ? resolvedSourceLinkAsset.asset.role : null,
        outputAssetSource: resolvedSourceLinkAsset.source,
        usesLinkOutput,
        linkPrimary,
        transitioningToLink,
        containerPrimary: !usesLinkOutput,
        shouldUseLinkMiner: usesLinkOutput,
        shouldTransferToSourceLink: usesLinkOutput,
        shouldFallbackToSourceContainer: usesLinkOutput,
        shouldPromoteToLinkPrimary,
        shouldRetireSourceContainer
    };
}

function shouldParticipateInLogistics(cityPlan, structureOrEntry) {
    const policy = getLogisticsPolicy(cityPlan, structureOrEntry);
    return !!(policy.shouldSupply || policy.shouldDemand);
}

function shouldRepairAsset(cityPlan, structureOrEntry) {
    return !!getMaintenancePolicy(cityPlan, structureOrEntry).shouldRepair;
}

function shouldBuildAsset(cityPlan, structureOrEntry) {
    return !!getBuildPolicy(cityPlan, structureOrEntry).buildable;
}

export {
    getAssetPolicy,
    getLogisticsPolicy,
    getMaintenancePolicy,
    getBuildPolicy,
    getSourceOutputPolicy,
    shouldParticipateInLogistics,
    shouldRepairAsset,
    shouldBuildAsset
};
