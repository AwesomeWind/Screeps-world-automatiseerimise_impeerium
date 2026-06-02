import BaseService from '../core/BaseService.js';
import EventBus from '../core/EventBus.js';
import TaskTypes from '../core/TaskTypes.js';
import BodyBuilder from '../core/BodyBuilder.js';

class BuilderStrategyService extends BaseService {
    analyze() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            this.ensureBuilders(room);
        }

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role === 'builder' && !creep.memory.task) {
                this.assignBuilderTask(creep);
            }
        }
    }

    ensureBuilders(room) {
        const builders = _.filter(Game.creeps, (creep) => creep.memory.role === 'builder' && creep.memory.homeRoom === room.name);
        const desired = room.find(FIND_CONSTRUCTION_SITES).length > 0 ? 2 : 0;
        if (builders.length >= desired) return;

        const bodySpec = BodyBuilder.build('builder', room, { phase: room.storage ? 'stable' : 'early' });
        EventBus.publish('REQ_SPAWN', this.getSpawnPriority(room), {
            roomName: room.name,
            role: 'builder',
            body: bodySpec.body,
            memory: { role: 'builder', homeRoom: room.name }
        }, 3);
    }

    getSpawnPriority(room) {
        if (this.countRole(room.name, 'builder') > 0) return 30;
        if (room.find(FIND_CONSTRUCTION_SITES).length === 0) return 30;
        if (this.countRole(room.name, 'miner') > 0 &&
            this.countRole(room.name, 'hauler') > 0 &&
            this.countRole(room.name, 'upgrader') > 0) {
            return 54;
        }
        return 30;
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

    assignBuilderTask(creep) {
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            const energySource = this.findEnergySource(creep.room);
            if (energySource) {
                creep.memory.task = {
                    type: energySource.withdraw ? TaskTypes.WITHDRAW : TaskTypes.PICKUP,
                    targetId: energySource.id,
                    resourceType: RESOURCE_ENERGY
                };
            }
            return;
        }

        const cache = global.RoomCache && global.RoomCache[creep.room.name];
        const siteId = cache && cache.constructionSites[0];
        if (siteId) creep.memory.task = { type: TaskTypes.BUILD, targetId: siteId };
        else if (creep.room.controller) creep.memory.task = { type: TaskTypes.UPGRADE, targetId: creep.room.controller.id };
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
        });
        return dropped[0] || null;
    }
}

export default BuilderStrategyService;
