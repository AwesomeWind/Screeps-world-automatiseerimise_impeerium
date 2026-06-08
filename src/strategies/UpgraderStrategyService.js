import BaseService from '../core/BaseService.js';
import TaskTypes from '../core/TaskTypes.js';
import { assignTask } from '../core/TaskMetadata.js';
import { planWorkerEnergyTask } from '../services/ResourceMarketService.js';

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
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            const controllerContainer = this.findControllerContainer(creep.room);
            if (controllerContainer && controllerContainer.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                assignTask(creep, {
                    type: TaskTypes.WITHDRAW,
                    targetId: controllerContainer.id,
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
        if (typeof Memory === 'undefined') return null;
        const plan = Memory.rooms &&
            Memory.rooms[roomName] &&
            Memory.rooms[roomName].cityPlan &&
            Memory.rooms[roomName].cityPlan.controller;
        return plan ? plan.primaryUpgradePos : null;
    }

    getPlannedControllerContainerPos(roomName) {
        if (typeof Memory === 'undefined') return null;
        const plan = Memory.rooms &&
            Memory.rooms[roomName] &&
            Memory.rooms[roomName].cityPlan &&
            Memory.rooms[roomName].cityPlan.controller;
        return plan ? plan.containerPos : null;
    }

    findControllerContainer(room) {
        if (!room || !room.find) return null;
        const containers = room.find(FIND_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_CONTAINER
        });
        if (containers.length === 0) return null;

        const plannedPos = this.getPlannedControllerContainerPos(room.name);
        if (plannedPos) {
            const plannedContainer = containers.find((structure) => {
                return structure.pos &&
                    structure.pos.x === plannedPos.x &&
                    structure.pos.y === plannedPos.y &&
                    structure.pos.roomName === plannedPos.roomName;
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

}

export default UpgraderStrategyService;
