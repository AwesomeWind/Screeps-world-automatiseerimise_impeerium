import BaseService from '../core/BaseService.js';
import { getSourceOutputPolicy } from '../planning/CityAssetPolicy.js';
import { samePos } from '../planning/CityPlanHelpers.js';
import { getSourceIds, transitionSourceRuntimeState, SOURCE_RUNTIME_EVENTS, SOURCE_RUNTIME_MODES } from '../planning/SourceRuntimeState.js';
import {
    getControllerLinkAsset,
    getSourceLinkAsset,
    resolveControllerContainerAsset,
    resolveSourceContainerAsset
} from '../planning/CityPlanLegacyAdapter.js';
import { recordLifecycleTransitionFailure } from '../planning/CityPlanDebug.js';
import { transitionAssetLifecycle } from '../planning/CityPlanSchema.js';
import { shouldUseStrictSourceRuntime } from '../planning/RuntimeReadiness.js';

const CONTROLLER_LINK_TARGET = 600;
const LINK_RETIRE_OBSERVATION_TICKS = 1500;

class LinkService extends BaseService {
    analyze() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            this.updateRoomLifecycle(room);
        }
    }

    run() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            this.runTransfers(room);
        }
    }

    updateRoomLifecycle(room) {
        const roomMemory = Memory.rooms && Memory.rooms[room.name];
        const cityPlan = roomMemory && roomMemory.cityPlan;
        if (!cityPlan || !cityPlan.controller) return;
        const strictRuntimePolicy = shouldUseStrictSourceRuntime(roomMemory);
        const roomPhase = global.RoomPhase && global.RoomPhase[room.name];
        const isNormalPosture = !roomPhase || roomPhase.energyPosture === 'normal';
        const linkNetwork = this.ensureLinkNetwork(room.name);
        linkNetwork.updatedAt = this.getCurrentTick();

        const controllerLink = this.findControllerLink(room, cityPlan);
        const controllerEnergy = controllerLink && controllerLink.store && controllerLink.store.getUsedCapacity
            ? controllerLink.store.getUsedCapacity(RESOURCE_ENERGY)
            : 0;
        linkNetwork.controller.linkId = controllerLink ? controllerLink.id : null;
        linkNetwork.controller.linkEnergy = controllerEnergy;
        linkNetwork.controller.underfilledTicks = controllerEnergy < CONTROLLER_LINK_TARGET
            ? (linkNetwork.controller.underfilledTicks || 0) + 1
            : 0;
        linkNetwork.controller.stableTicks = controllerLink && isNormalPosture
            ? (linkNetwork.controller.stableTicks || 0) + 1
            : 0;

        for (const sourceId of getSourceIds(cityPlan)) {
            const sourceLink = this.findSourceLink(room, cityPlan, sourceId);
            const sourcePolicy = getSourceOutputPolicy(cityPlan, sourceId, {
                sourceLinkOnline: !!sourceLink,
                controllerLinkOnline: !!controllerLink,
                normalEnergyPosture: isNormalPosture,
                stableTicks: linkNetwork.sources[sourceId] && linkNetwork.sources[sourceId].stableTicks ? linkNetwork.sources[sourceId].stableTicks : 0,
                retireObservationTicks: LINK_RETIRE_OBSERVATION_TICKS,
                sourceRuntimeAllowLegacyFallback: !strictRuntimePolicy
            });
            if (!sourcePolicy.usesLinkOutput) continue;

            const sourceState = linkNetwork.sources[sourceId] || {
                mode: sourcePolicy.runtimeMode || SOURCE_RUNTIME_MODES.LINK_TRANSITION,
                linkId: null,
                linkEnergy: 0,
                lastTransferAt: 0,
                transferFailures: 0,
                fallbackContainerUsed: false,
                stableTicks: 0
            };
            const online = !!controllerLink && !!sourceLink && isNormalPosture;
            sourceState.mode = online ? SOURCE_RUNTIME_MODES.LINK_PRIMARY : (sourcePolicy.runtimeMode || SOURCE_RUNTIME_MODES.LINK_TRANSITION);
            sourceState.linkId = sourceLink ? sourceLink.id : null;
            sourceState.linkEnergy = sourceLink && sourceLink.store && sourceLink.store.getUsedCapacity
                ? sourceLink.store.getUsedCapacity(RESOURCE_ENERGY)
                : 0;
            sourceState.stableTicks = online ? (sourceState.stableTicks || 0) + 1 : 0;
            sourceState.fallbackContainerUsed = false;
            linkNetwork.sources[sourceId] = sourceState;

            if (!online) continue;

            transitionSourceRuntimeState(cityPlan, sourceId, SOURCE_RUNTIME_EVENTS.LINK_NETWORK_ONLINE, {
                allowDirectPromotion: true
            });
            this.setSourceContainerLifecycle(
                cityPlan,
                sourceId,
                sourceState.stableTicks >= LINK_RETIRE_OBSERVATION_TICKS ? 'retiring' : 'link_primary'
            );
        }

        this.setControllerContainerLifecycle(
            cityPlan,
            controllerLink && isNormalPosture && (linkNetwork.controller.stableTicks || 0) >= LINK_RETIRE_OBSERVATION_TICKS
                ? 'retiring'
                : (controllerLink && isNormalPosture ? 'link_primary' : 'active')
        );
    }

    runTransfers(room) {
        const roomMemory = Memory.rooms && Memory.rooms[room.name];
        const cityPlan = roomMemory && roomMemory.cityPlan;
        if (!cityPlan) return;
        const strictRuntimePolicy = shouldUseStrictSourceRuntime(roomMemory);

        const controllerLink = this.findControllerLink(room, cityPlan);
        if (!controllerLink || !controllerLink.store || !controllerLink.store.getUsedCapacity || !controllerLink.store.getFreeCapacity) return;

        const controllerEnergy = controllerLink.store.getUsedCapacity(RESOURCE_ENERGY);
        const controllerFree = controllerLink.store.getFreeCapacity(RESOURCE_ENERGY);
        if (controllerFree <= 0 || controllerEnergy >= CONTROLLER_LINK_TARGET) return;

        const readyLinks = [];
        for (const sourceId of getSourceIds(cityPlan)) {
            const sourcePolicy = getSourceOutputPolicy(cityPlan, sourceId, {
                sourceRuntimeAllowLegacyFallback: !strictRuntimePolicy
            });
            if (!sourcePolicy.linkPrimary) continue;

            const sourceLink = this.findSourceLink(room, cityPlan, sourceId);
            if (!sourceLink || !sourceLink.store || !sourceLink.store.getUsedCapacity) continue;
            if (sourceLink.store.getUsedCapacity(RESOURCE_ENERGY) <= 0) continue;
            if ((sourceLink.cooldown || 0) > 0) continue;
            if (typeof sourceLink.transferEnergy !== 'function') continue;
            readyLinks.push({
                sourceId,
                sourceLink,
                amount: sourceLink.store.getUsedCapacity(RESOURCE_ENERGY)
            });
        }

        if (readyLinks.length === 0) return;
        readyLinks.sort((left, right) => right.amount - left.amount);
        const selected = readyLinks[0];
        const result = selected.sourceLink.transferEnergy(controllerLink);
        const linkNetwork = this.ensureLinkNetwork(room.name);
        const sourceState = linkNetwork.sources[selected.sourceId] || {
            mode: SOURCE_RUNTIME_MODES.LINK_PRIMARY,
            linkId: selected.sourceLink.id,
            linkEnergy: selected.amount,
            lastTransferAt: 0,
            transferFailures: 0,
            fallbackContainerUsed: false,
            stableTicks: 0
        };
        if (result === OK) {
            sourceState.lastTransferAt = this.getCurrentTick();
            sourceState.transferFailures = 0;
        } else {
            sourceState.transferFailures = (sourceState.transferFailures || 0) + 1;
        }
        linkNetwork.sources[selected.sourceId] = sourceState;
    }

    setSourceContainerLifecycle(cityPlan, sourceId, state) {
        const resolved = resolveSourceContainerAsset(cityPlan, sourceId, { allowLegacyFallback: false });
        if (resolved.source !== 'planned' || !resolved.asset) return;
        const transition = transitionAssetLifecycle(resolved.asset, state);
        if (!transition.valid) {
            this.recordTransitionFailure(resolved.asset, state, transition.error);
            return;
        }
        resolved.asset.lifecycle = transition.asset.lifecycle;
    }

    setControllerContainerLifecycle(cityPlan, state) {
        const resolved = resolveControllerContainerAsset(cityPlan, { allowLegacyFallback: false });
        if (resolved.source !== 'planned' || !resolved.asset) return;
        const transition = transitionAssetLifecycle(resolved.asset, state);
        if (!transition.valid) {
            this.recordTransitionFailure(resolved.asset, state, transition.error);
            return;
        }
        resolved.asset.lifecycle = transition.asset.lifecycle;
    }

    recordTransitionFailure(asset, toState, error) {
        if (!asset || !asset.pos || !asset.pos.roomName) return;
        recordLifecycleTransitionFailure(asset.pos.roomName, {
            service: 'LinkService',
            role: asset.role,
            id: asset.id,
            from: asset.lifecycle && asset.lifecycle.state ? asset.lifecycle.state : 'active',
            to: toState,
            error
        });
    }

    findSourceLink(room, cityPlan, sourceId) {
        const sourceLinkAsset = getSourceLinkAsset(cityPlan, sourceId, { allowLegacyFallback: false });
        return this.findLinkAtPos(room, sourceLinkAsset && sourceLinkAsset.pos);
    }

    findControllerLink(room, cityPlan) {
        const controllerLinkAsset = getControllerLinkAsset(cityPlan, { allowLegacyFallback: false });
        return this.findLinkAtPos(room, controllerLinkAsset && controllerLinkAsset.pos);
    }

    findLinkAtPos(room, pos) {
        if (!room || !pos || !room.find) return null;
        const structures = room.find(FIND_STRUCTURES);
        return structures.find((structure) => {
            return structure.structureType === STRUCTURE_LINK &&
                structure.pos &&
                samePos(structure.pos, pos);
        }) || null;
    }

    ensureLinkNetwork(roomName) {
        if (!Memory.rooms) Memory.rooms = {};
        if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
        if (!Memory.rooms[roomName].linkNetwork) {
            Memory.rooms[roomName].linkNetwork = {
                updatedAt: 0,
                sources: {},
                controller: {
                    linkId: null,
                    linkEnergy: 0,
                    underfilledTicks: 0,
                    stableTicks: 0
                }
            };
        }
        return Memory.rooms[roomName].linkNetwork;
    }
    getCurrentTick() {
        return typeof Game.time === 'number' ? Game.time : Date.now();
    }
}

export default LinkService;
