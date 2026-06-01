import BaseService from '../core/BaseService.js';
import EventBus from '../core/EventBus.js';
import TaskTypes from '../core/TaskTypes.js';
import BodyBuilder from '../core/BodyBuilder.js';

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
        const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader' && creep.memory.homeRoom === room.name);
        const desired = room.storage ? 2 : 1;
        if (upgraders.length >= desired) return;

        const bodySpec = BodyBuilder.build('upgrader', room, { phase: room.storage ? 'stable' : 'early' });
        EventBus.publish('REQ_SPAWN', 35, {
            roomName: room.name,
            role: 'upgrader',
            body: bodySpec.body,
            memory: { role: 'upgrader', homeRoom: room.name }
        }, 3);
    }

    assignUpgraderTask(creep) {
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            const energySource = this.findEnergySource(creep.room);
            if (energySource) {
                creep.memory.task = energySource.withdraw ? {
                    type: TaskTypes.WITHDRAW,
                    targetId: energySource.id,
                    resourceType: RESOURCE_ENERGY
                } : {
                    type: TaskTypes.PICKUP,
                    targetId: energySource.id
                };
            }
            return;
        }

        const upgradePos = this.getPlannedUpgradePos(creep.room.name);
        if (upgradePos && (!creep.pos || !creep.pos.inRangeTo || !creep.pos.inRangeTo(upgradePos.x, upgradePos.y, 0))) {
            creep.memory.task = {
                type: TaskTypes.MOVE_TO,
                pos: upgradePos,
                range: 0
            };
            return;
        }

        if (creep.room.controller) {
            creep.memory.task = { type: TaskTypes.UPGRADE, targetId: creep.room.controller.id };
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

    findEnergySource(room) {
        if (room.storage && room.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            return { id: room.storage.id, withdraw: true };
        }

        const containers = room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_CONTAINER &&
                    structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
            }
        }).sort((a, b) => b.store.getUsedCapacity(RESOURCE_ENERGY) - a.store.getUsedCapacity(RESOURCE_ENERGY));
        if (containers.length > 0) return { id: containers[0].id, withdraw: true };

        const dropped = room.find(FIND_DROPPED_RESOURCES, {
            filter: (resource) => resource.resourceType === RESOURCE_ENERGY && resource.amount > 50
        }).sort((a, b) => b.amount - a.amount);
        return dropped[0] || null;
    }
}

export default UpgraderStrategyService;
