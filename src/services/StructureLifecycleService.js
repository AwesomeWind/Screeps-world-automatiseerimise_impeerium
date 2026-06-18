import BaseService from '../core/BaseService.js';
import { getSourceOutputPolicy } from '../planning/CityAssetPolicy.js';
import { getActivePlannedStructure, getPlannedStructuresByRole, getStructureLifecycle, samePos } from '../planning/CityPlanHelpers.js';
import { recordLifecycleTransitionFailure } from '../planning/CityPlanDebug.js';
import { getControllerLinkAsset, getSourceLinkAsset } from '../planning/CityPlanLegacyAdapter.js';
import { shouldUseStrictSourceRuntime } from '../planning/RuntimeReadiness.js';
import { getSourceIds, SOURCE_RUNTIME_MODES } from '../planning/SourceRuntimeState.js';
import { transitionAssetLifecycle } from '../planning/CityPlanSchema.js';

const RETIRE_READY_STABLE_TICKS = 1500;
const RETIRE_CONTAINER_ENERGY_THRESHOLD = 50;
const ROAD_RETIRE_TICKS = 500;

class StructureLifecycleService extends BaseService {
    analyze() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            this.promoteRetiredReady(room);
        }
    }

    run() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            this.destroyRetiredReady(room);
        }
    }

    promoteRetiredReady(room) {
        if (!this.isRoomSafe(room.name)) return;

        const roomMemory = Memory.rooms && Memory.rooms[room.name];
        const cityPlan = roomMemory && roomMemory.cityPlan;
        const linkNetwork = roomMemory && roomMemory.linkNetwork;
        if (!cityPlan) return;
        const strictRuntimePolicy = shouldUseStrictSourceRuntime(roomMemory);

        this.promoteRoadLifecycle(cityPlan);
        if (!cityPlan.controller || !linkNetwork || !linkNetwork.sources || !linkNetwork.controller) return;

        for (const sourceId of getSourceIds(cityPlan)) {
            const sourcePolicy = getSourceOutputPolicy(cityPlan, sourceId, {
                sourceRuntimeAllowLegacyFallback: !strictRuntimePolicy
            });
            if (!sourcePolicy.linkPrimary) continue;

            const sourceContainer = getActivePlannedStructure(cityPlan, 'source_container', { sourceId });
            if (!sourceContainer) continue;
            if (getStructureLifecycle(cityPlan, sourceContainer).state !== 'retiring') continue;

            const sourceState = linkNetwork.sources[sourceId];
            if (!sourceState || sourceState.mode !== SOURCE_RUNTIME_MODES.LINK_PRIMARY || (sourceState.stableTicks || 0) < RETIRE_READY_STABLE_TICKS) continue;

            const sourceLink = this.findSourceLink(room, cityPlan, sourceId);
            const controllerLink = this.findControllerLink(room, cityPlan);
            if (!sourceLink || !controllerLink) continue;

            const structure = this.findStructureAtPos(room, sourceContainer.pos, STRUCTURE_CONTAINER);
            if (!structure) continue;
            const energy = structure.store && structure.store.getUsedCapacity ? structure.store.getUsedCapacity(RESOURCE_ENERGY) : 0;
            if (energy > RETIRE_CONTAINER_ENERGY_THRESHOLD) continue;

            const sourceTransition = transitionAssetLifecycle(sourceContainer, 'retired_ready');
            if (sourceTransition.valid) {
                sourceContainer.lifecycle = sourceTransition.asset.lifecycle;
            }
            else {
                this.recordTransitionFailure(room.name, sourceContainer, 'retired_ready', sourceTransition.error);
            }
        }

        const controllerContainer = getActivePlannedStructure(cityPlan, 'controller_container');
        if (!controllerContainer) return;
        if (getStructureLifecycle(cityPlan, controllerContainer).state !== 'retiring') return;
        if ((linkNetwork.controller.stableTicks || 0) < RETIRE_READY_STABLE_TICKS) return;

        const controllerLink = this.findControllerLink(room, cityPlan);
        if (!controllerLink) return;

        const controllerStructure = this.findStructureAtPos(room, controllerContainer.pos, STRUCTURE_CONTAINER);
        if (!controllerStructure) return;
        const controllerEnergy = controllerStructure.store && controllerStructure.store.getUsedCapacity
            ? controllerStructure.store.getUsedCapacity(RESOURCE_ENERGY)
            : 0;
        if (controllerEnergy > RETIRE_CONTAINER_ENERGY_THRESHOLD) return;

        const controllerTransition = transitionAssetLifecycle(controllerContainer, 'retired_ready');
        if (controllerTransition.valid) {
            controllerContainer.lifecycle = controllerTransition.asset.lifecycle;
        }
        else {
            this.recordTransitionFailure(room.name, controllerContainer, 'retired_ready', controllerTransition.error);
        }
    }

    promoteRoadLifecycle(cityPlan) {
        const now = typeof Game.time === 'number' ? Game.time : 0;
        const roads = getPlannedStructuresByRole(cityPlan, 'logistics_road');
        for (const road of roads) {
            const lifecycle = getStructureLifecycle(cityPlan, road);
            if (lifecycle.state === 'low_priority') {
                const lowPrioritySince = road.lifecycle && road.lifecycle.lowPrioritySince ? road.lifecycle.lowPrioritySince : road.lifecycle && road.lifecycle.lastPlannedAt;
                if (lowPrioritySince !== undefined && now - lowPrioritySince >= ROAD_RETIRE_TICKS) {
                    const roadTransition = transitionAssetLifecycle(road, 'retiring');
                    if (roadTransition.valid) {
                        road.lifecycle = {
                            ...roadTransition.asset.lifecycle,
                            retiringSince: now
                        };
                    }
                    else {
                        this.recordTransitionFailure(road.pos && road.pos.roomName, road, 'retiring', roadTransition.error);
                    }
                }
            }
            else if (lifecycle.state === 'retiring') {
                const retiringSince = road.lifecycle && road.lifecycle.retiringSince ? road.lifecycle.retiringSince : road.lifecycle && road.lifecycle.lowPrioritySince;
                if (retiringSince !== undefined && now - retiringSince >= ROAD_RETIRE_TICKS) {
                    const roadTransition = transitionAssetLifecycle(road, 'retired_ready');
                    if (roadTransition.valid) {
                        road.lifecycle = roadTransition.asset.lifecycle;
                    }
                    else {
                        this.recordTransitionFailure(road.pos && road.pos.roomName, road, 'retired_ready', roadTransition.error);
                    }
                }
            }
        }
    }

    destroyRetiredReady(room) {
        if (!this.isRoomSafe(room.name)) return;

        const roomMemory = Memory.rooms && Memory.rooms[room.name];
        const cityPlan = roomMemory && roomMemory.cityPlan;
        if (!cityPlan) return;

        const retiringContainers = getPlannedStructuresByRole(cityPlan, 'source_container')
            .concat(getPlannedStructuresByRole(cityPlan, 'controller_container'));
        for (const planned of retiringContainers) {
            if (getStructureLifecycle(cityPlan, planned).state !== 'retired_ready') continue;

            const structure = this.findStructureAtPos(room, planned.pos, STRUCTURE_CONTAINER);
            if (!structure || typeof structure.destroy !== 'function') continue;
            const energy = structure.store && structure.store.getUsedCapacity ? structure.store.getUsedCapacity(RESOURCE_ENERGY) : 0;
            if (energy > RETIRE_CONTAINER_ENERGY_THRESHOLD) continue;
            structure.destroy();
        }
    }

    isRoomSafe(roomName) {
        const roomPhase = global.RoomPhase && global.RoomPhase[roomName];
        if (roomPhase && roomPhase.energyPosture !== 'normal') return false;

        let miners = 0;
        let haulers = 0;
        let upgraders = 0;
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            const homeRoom = creep.memory && (creep.memory.homeRoom || (creep.room && creep.room.name));
            if (homeRoom !== roomName) continue;
            if (creep.memory.role === 'miner') miners++;
            if (creep.memory.role === 'hauler') haulers++;
            if (creep.memory.role === 'upgrader') upgraders++;
        }
        return miners > 0 && haulers > 0 && upgraders > 0;
    }
    findSourceLink(room, cityPlan, sourceId) {
        const sourceLinkAsset = getSourceLinkAsset(cityPlan, sourceId, { allowLegacyFallback: false });
        return this.findStructureAtPos(room, sourceLinkAsset && sourceLinkAsset.pos, STRUCTURE_LINK);
    }

    findControllerLink(room, cityPlan) {
        const controllerLinkAsset = getControllerLinkAsset(cityPlan, { allowLegacyFallback: false });
        return this.findStructureAtPos(room, controllerLinkAsset && controllerLinkAsset.pos, STRUCTURE_LINK);
    }

    findStructureAtPos(room, pos, structureType) {
        if (!room || !pos || !room.find) return null;
        const structures = room.find(FIND_STRUCTURES);
        return structures.find((structure) => {
            return structure.structureType === structureType &&
                structure.pos &&
                samePos(structure.pos, pos);
        }) || null;
    }

    recordTransitionFailure(roomName, asset, toState, error) {
        if (!roomName || !asset) return;
        recordLifecycleTransitionFailure(roomName, {
            service: 'StructureLifecycleService',
            role: asset.role,
            id: asset.id,
            from: asset.lifecycle && asset.lifecycle.state ? asset.lifecycle.state : 'active',
            to: toState,
            error
        });
    }
}

export default StructureLifecycleService;
