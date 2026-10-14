import BaseService from '../core/BaseService.js';
import TaskTypes from '../core/TaskTypes.js';
import { assignTask } from '../core/TaskMetadata.js';
import { getControllerUpgradeWorkPosition } from '../planning/CityWorkPositionPolicy.js';
import { planWorkerEnergyTask } from '../services/ResourceMarketService.js';
import { recoveryRestricted, controllerEmergency } from '../services/RoomRecoveryPolicy.js';
import { getStructureLifecycle } from '../planning/CityPlanHelpers.js';
import { getControllerContainerAsset, getControllerLinkAsset } from '../planning/CityPlanLegacyAdapter.js';

class UpgraderStrategyService extends BaseService {
    analyze() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            this.ensureUpgraders(room);
        }

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role === 'upgrader' && !creep.memory.task) {
                this.assignUpgraderTask(creep);
            }
        }
    }

    ensureUpgraders(room) {
        return room;
    }

    getSpawnPriority(room) {
        if (this.countRole(room.name, 'upgrader') > 0) return 35;
        if (this.countRole(room.name, 'miner') > 0 && this.countRole(room.name, 'hauler') > 0) return 55;
        return 35;
    }

    countRole(roomName, role) {
        let count = 0;
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role === role && creep.memory.homeRoom === roomName) count++;
        }
        if (typeof Memory !== 'undefined' && Memory.creeps) {
            for (const name in Memory.creeps) {
                if (Game.creeps[name]) continue;
                const memory = Memory.creeps[name];
                if (memory.role === role && memory.homeRoom === roomName) count++;
            }
        }
        return count;
    }

    assignUpgraderTask(creep) {
        if (recoveryRestricted(creep.memory.homeRoom || creep.room.name) && !controllerEmergency(creep.room)) {
            creep.memory.recoveryState = { state: 'waiting_recovery', tick: Game.time };
            return;
        }
        delete creep.memory.recoveryState;
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            const controllerContainer = this.findControllerContainer(creep.room);
            const controllerContainerLifecycle = this.getControllerContainerLifecycle(creep.room, controllerContainer);
            const preferControllerLink = controllerContainerLifecycle === 'link_primary' ||
                controllerContainerLifecycle === 'retiring' ||
                controllerContainerLifecycle === 'retired_ready';
            const allowControllerContainer = controllerContainerLifecycle !== 'retired_ready';
            const controllerLink = this.findControllerLink(creep.room);

            if (preferControllerLink &&
                controllerLink &&
                controllerLink.store &&
                controllerLink.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                assignTask(creep, {
                    type: TaskTypes.WITHDRAW,
                    targetId: controllerLink.id,
                    resourceType: RESOURCE_ENERGY
                });
                return;
            }

            if (allowControllerContainer &&
                controllerContainer &&
                controllerContainer.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                assignTask(creep, {
                    type: TaskTypes.WITHDRAW,
                    targetId: controllerContainer.id,
                    resourceType: RESOURCE_ENERGY
                });
                return;
            }

            if (controllerLink && controllerLink.store && controllerLink.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                assignTask(creep, {
                    type: TaskTypes.WITHDRAW,
                    targetId: controllerLink.id,
                    resourceType: RESOURCE_ENERGY
                });
                return;
            }

            const market = global.ResourceMarketService;
            if (!market || !market.requestResource) {
                const roomMarket = global.ResourceMarket && global.ResourceMarket[creep.memory.homeRoom || creep.room.name];
                if (controllerContainer && roomMarket && roomMarket.supplyMode === 'hauler_supply') {
                    if (!roomMarket.demands) roomMarket.demands = [];
                    roomMarket.demands.push({
                        id: `compat-demand:${controllerContainer.id}:${RESOURCE_ENERGY}`,
                        roomName: creep.memory.homeRoom || creep.room.name,
                        targetId: controllerContainer.id,
                        resourceType: RESOURCE_ENERGY,
                        amount: creep.store.getFreeCapacity ? creep.store.getFreeCapacity(RESOURCE_ENERGY) : 50,
                        priority: 55,
                        purpose: 'upgrade',
                        demandType: 'buffer',
                        deliveryMode: 'haul',
                        producer: 'compat_upgrader'
                    });
                    return;
                }
                const energyTask = planWorkerEnergyTask(creep, {
                    priority: 55,
                    purpose: 'upgrade',
                    stationaryBufferTarget: controllerContainer,
                    supplyTargetId: (controllerContainer && controllerContainer.id) || creep.id || creep.name
                });
                if (energyTask) assignTask(creep, energyTask);
                return;
            }
            const response = market.requestResource(creep, {
                resourceType: RESOURCE_ENERGY,
                amount: creep.store.getFreeCapacity ? creep.store.getFreeCapacity(RESOURCE_ENERGY) : 50,
                purpose: 'upgrade',
                targetId: (controllerContainer && controllerContainer.id) || creep.id || creep.name,
                targetPos: controllerContainer && controllerContainer.pos ? controllerContainer.pos : (creep.pos ? { x: creep.pos.x, y: creep.pos.y, roomName: creep.pos.roomName } : null),
                priority: 55,
                allowedFulfillment: controllerContainer ? ['delivery'] : ['self_fetch', 'delivery']
            });
            if (response && response.mode === 'self_fetch') assignTask(creep, response.task);
            return;
        }

        const upgradePos = this.getPlannedUpgradePos(creep.room.name);
        if (upgradePos && (!creep.pos || !creep.pos.inRangeTo || !creep.pos.inRangeTo(upgradePos.x, upgradePos.y, 0))) {
            assignTask(creep, {
                type: TaskTypes.MOVE_TO,
                pos: upgradePos,
                range: 0
            });
            return;
        }

        if (creep.room.controller) {
            assignTask(creep, { type: TaskTypes.UPGRADE, targetId: creep.room.controller.id });
        }
    }

    getPlannedUpgradePos(roomName) {
        const cityPlan = Memory.rooms &&
            Memory.rooms[roomName] &&
            Memory.rooms[roomName].cityPlan;
        return getControllerUpgradeWorkPosition(cityPlan);
    }

    findControllerContainer(room) {
        if (!room || !room.find) return null;
        const containers = room.find(FIND_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_CONTAINER
        });
        if (containers.length === 0) return null;

        const cityPlan = Memory.rooms &&
            Memory.rooms[room.name] &&
            Memory.rooms[room.name].cityPlan;
        const controllerContainerAsset = getControllerContainerAsset(cityPlan, { allowLegacyFallback: false });
        if (controllerContainerAsset && controllerContainerAsset.pos) {
            const plannedContainer = containers.find((structure) => {
                return structure.pos &&
                    structure.pos.x === controllerContainerAsset.pos.x &&
                    structure.pos.y === controllerContainerAsset.pos.y &&
                    structure.pos.roomName === controllerContainerAsset.pos.roomName;
            });
            if (plannedContainer) return plannedContainer;
        }

        if (!room.controller || !room.controller.pos) return containers[0];
        const sorted = containers.slice().sort((a, b) => {
            const rangeA = a.pos && a.pos.getRangeTo ? a.pos.getRangeTo(room.controller.pos) : 99;
            const rangeB = b.pos && b.pos.getRangeTo ? b.pos.getRangeTo(room.controller.pos) : 99;
            return rangeA - rangeB;
        });
        return sorted[0] || null;
    }

    findControllerLink(room) {
        if (!room || !room.find) return null;
        const links = room.find(FIND_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_LINK
        });
        if (links.length === 0) return null;

        const cityPlan = Memory.rooms &&
            Memory.rooms[room.name] &&
            Memory.rooms[room.name].cityPlan;
        const controllerLinkAsset = getControllerLinkAsset(cityPlan, { allowLegacyFallback: false });
        if (controllerLinkAsset && controllerLinkAsset.pos) {
            const plannedLink = links.find((structure) => {
                return structure.pos &&
                    structure.pos.x === controllerLinkAsset.pos.x &&
                    structure.pos.y === controllerLinkAsset.pos.y &&
                    structure.pos.roomName === controllerLinkAsset.pos.roomName;
            });
            if (plannedLink) return plannedLink;
        }
        return null;
    }

    getControllerContainerLifecycle(room, controllerContainer) {
        if (!room || !controllerContainer) return 'active';
        const cityPlan = Memory.rooms &&
            Memory.rooms[room.name] &&
            Memory.rooms[room.name].cityPlan;
        if (!cityPlan) return 'active';
        const controllerContainerAsset = getControllerContainerAsset(cityPlan, { allowLegacyFallback: false });
        if (!controllerContainerAsset || !controllerContainerAsset.pos || controllerContainerAsset.role !== 'controller_container') return 'active';
        const sameContainer = controllerContainerAsset.pos.x === controllerContainer.pos.x &&
            controllerContainerAsset.pos.y === controllerContainer.pos.y &&
            controllerContainerAsset.pos.roomName === controllerContainer.pos.roomName;
        if (!sameContainer) return 'active';
        return getStructureLifecycle(cityPlan, controllerContainerAsset).state;
    }

}

export default UpgraderStrategyService;
