import BaseService from '../core/BaseService.js';
import EventBus from '../core/EventBus.js';
import TaskTypes from '../core/TaskTypes.js';

class MinerStrategyService extends BaseService {
    init() {
        this.rooms = Object.keys(Game.rooms).filter((roomName) => {
            const room = Game.rooms[roomName];
            return room.controller && room.controller.my;
        });
    }

    analyze() {
        for (const roomName of this.rooms) {
            this.ensureMiners(roomName);
        }

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role === 'scout' && !creep.memory.task) {
                this.assignRoomMove(creep);
            }
            if (creep.memory.role === 'reserver' && !creep.memory.task) {
                this.assignReserveTask(creep);
            }
            if ((creep.memory.role === 'miner' || creep.memory.role === 'remoteMiner') && !creep.memory.task) {
                this.assignMiningTask(creep);
            }
        }
    }

    ensureMiners(roomName) {
        const cache = global.RoomCache && global.RoomCache[roomName];
        if (!cache) return;
        const miners = _.filter(Game.creeps, (creep) => creep.memory.role === 'miner' && creep.memory.homeRoom === roomName);
        if (miners.length >= cache.sources.length) return;

        EventBus.publish('REQ_SPAWN', 50, {
            roomName,
            role: 'miner',
            body: [WORK, WORK, CARRY, MOVE],
            memory: { role: 'miner', homeRoom: roomName }
        }, 3);
    }

    assignMiningTask(creep) {
        if (creep.memory.targetRoom && creep.room.name !== creep.memory.targetRoom) {
            this.assignRoomMove(creep);
            return;
        }

        if (creep.store.getFreeCapacity && creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            const target = this.findEnergyTarget(creep.room);
            if (target) {
                creep.memory.task = {
                    type: TaskTypes.TRANSFER,
                    targetId: target.id,
                    resourceType: RESOURCE_ENERGY
                };
            }
            return;
        }

        const sourceId = creep.memory.sourceId || this.pickSource(creep);
        if (!sourceId) return;
        creep.memory.sourceId = sourceId;
        creep.memory.task = { type: TaskTypes.HARVEST, targetId: sourceId };
    }

    assignRoomMove(creep) {
        if (!creep.memory.targetRoom || creep.room.name === creep.memory.targetRoom) return;
        creep.memory.task = {
            type: TaskTypes.MOVE_TO,
            pos: { x: 25, y: 25, roomName: creep.memory.targetRoom },
            range: 20
        };
    }

    assignReserveTask(creep) {
        if (!creep.memory.targetRoom) return;
        if (creep.room.name !== creep.memory.targetRoom) {
            this.assignRoomMove(creep);
            return;
        }
        if (creep.room.controller) {
            creep.memory.task = { type: TaskTypes.RESERVE, targetId: creep.room.controller.id };
        }
    }

    pickSource(creep) {
        const cache = global.RoomCache && global.RoomCache[creep.room.name];
        if (!cache || cache.sources.length === 0) return null;
        return cache.sources[creep.name.length % cache.sources.length];
    }

    findEnergyTarget(room) {
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

export default MinerStrategyService;
