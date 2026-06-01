import BaseService from '../core/BaseService.js';
import EventBus from '../core/EventBus.js';
import TaskTypes from '../core/TaskTypes.js';
import BodyBuilder from '../core/BodyBuilder.js';

class HaulerStrategyService extends BaseService {
    analyze() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            this.ensureHaulers(room);
        }

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role === 'hauler' && !creep.memory.task) {
                this.assignFallbackTask(creep);
            }
        }
    }

    ensureHaulers(room) {
        const haulers = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.memory.homeRoom === room.name);
        const desired = room.storage ? 3 : 2;
        if (haulers.length >= desired) return;
        const bodySpec = BodyBuilder.build('hauler', room, { phase: room.storage ? 'stable' : 'early' });

        EventBus.publish('REQ_SPAWN', 40, {
            roomName: room.name,
            role: 'hauler',
            body: bodySpec.body,
            memory: { role: 'hauler', homeRoom: room.name }
        }, 3);
    }

    assignFallbackTask(creep) {
        const defcon = global.Security && global.Security[creep.room.name] ? global.Security[creep.room.name].defcon : 5;

        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            const sourceEnergy = this.findSourceEnergy(creep.room);
            if (sourceEnergy) {
                creep.memory.task = sourceEnergy.withdraw ? {
                    type: TaskTypes.WITHDRAW,
                    targetId: sourceEnergy.id,
                    resourceType: RESOURCE_ENERGY
                } : {
                    type: TaskTypes.PICKUP,
                    targetId: sourceEnergy.id
                };
                return;
            }
            if (creep.room.storage && creep.room.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                creep.memory.task = {
                    type: TaskTypes.WITHDRAW,
                    targetId: creep.room.storage.id,
                    resourceType: RESOURCE_ENERGY
                };
            }
            return;
        }

        const target = defcon <= 2 ? this.findDefenseEnergyTarget(creep.room) : this.findEconomyEnergyTarget(creep.room);
        if (target) {
            creep.memory.task = {
                type: TaskTypes.TRANSFER,
                targetId: target.id,
                resourceType: RESOURCE_ENERGY
            };
        }
    }

    findSourceEnergy(room) {
        const cache = global.RoomCache && global.RoomCache[room.name];
        const sources = cache && cache.sources ? cache.sources.map((id) => Game.getObjectById(id)).filter(Boolean) : [];

        const dropped = room.find(FIND_DROPPED_RESOURCES, {
            filter: (resource) => resource.resourceType === RESOURCE_ENERGY && resource.amount > 50
        }).filter((resource) => sources.length === 0 || sources.some((source) => resource.pos.getRangeTo(source.pos) <= 2))
            .sort((a, b) => b.amount - a.amount);
        if (dropped.length > 0) return dropped[0];

        const containers = room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_CONTAINER &&
                    structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
                    (sources.length === 0 || sources.some((source) => structure.pos.getRangeTo(source.pos) <= 2));
            }
        }).sort((a, b) => b.store.getUsedCapacity(RESOURCE_ENERGY) - a.store.getUsedCapacity(RESOURCE_ENERGY));
        if (containers.length > 0) return { id: containers[0].id, withdraw: true };

        return null;
    }

    findDefenseEnergyTarget(room) {
        const targets = room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType === STRUCTURE_TOWER ||
                    structure.structureType === STRUCTURE_SPAWN ||
                    structure.structureType === STRUCTURE_EXTENSION) &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
        });
        return targets[0] || null;
    }

    findEconomyEnergyTarget(room) {
        const targets = room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType === STRUCTURE_SPAWN ||
                    structure.structureType === STRUCTURE_EXTENSION ||
                    structure.structureType === STRUCTURE_TOWER) &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
        });
        if (targets.length > 0) return targets[0];
        if (room.storage && room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) return room.storage;
        return null;
    }
}

export default HaulerStrategyService;
