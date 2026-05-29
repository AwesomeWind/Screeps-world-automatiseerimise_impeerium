const BaseService = require('core/BaseService');
const EventBus = require('core/EventBus');
const TaskTypes = require('core/TaskTypes');

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
        const desired = room.find(FIND_CONSTRUCTION_SITES).length > 0 ? 2 : 1;
        if (builders.length >= desired) return;

        EventBus.publish('REQ_SPAWN', 30, {
            roomName: room.name,
            role: 'builder',
            body: [WORK, CARRY, CARRY, MOVE, MOVE],
            memory: { role: 'builder', homeRoom: room.name }
        }, 3);
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
        const dropped = room.find(FIND_DROPPED_RESOURCES, {
            filter: (resource) => resource.resourceType === RESOURCE_ENERGY && resource.amount > 50
        });
        return dropped[0] || null;
    }
}

module.exports = BuilderStrategyService;
