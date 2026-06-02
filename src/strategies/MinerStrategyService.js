import BaseService from '../core/BaseService.js';
import EventBus from '../core/EventBus.js';
import TaskTypes from '../core/TaskTypes.js';
import BodyBuilder from '../core/BodyBuilder.js';

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
        if (this.shouldWaitForBootstrapHauler(roomName)) return;

        const sourceId = this.findUndercoveredSource(roomName, cache.sources);
        if (!sourceId) return;
        const room = Game.rooms[roomName];
        const bodySpec = BodyBuilder.build('miner', room, { phase: room.storage ? 'stable' : 'early' });

        EventBus.publish('REQ_SPAWN', 50, {
            roomName,
            role: 'miner',
            body: bodySpec.body,
            memory: { role: 'miner', homeRoom: roomName, sourceId }
        }, 3);
    }

    shouldWaitForBootstrapHauler(roomName) {
        const room = Game.rooms[roomName];
        if (!room || room.storage) return false;
        if ((room.energyCapacityAvailable || 0) > 300) return false;
        if (this.countRole(roomName, 'miner') === 0) return false;
        return this.countEnergySupportCreeps(roomName) === 0;
    }

    findUndercoveredSource(roomName, sourceIds) {
        let bestSourceId = null;
        let bestWorkParts = Infinity;
        const room = Game.rooms[roomName];

        for (const sourceId of sourceIds) {
            const source = Game.getObjectById(sourceId);
            if (!room || !source) continue;
            const openPositions = this.getOpenMiningPositions(room, source);
            if (this.countAssignedMiners(roomName, sourceId) >= openPositions.length) continue;

            const assignedWorkParts = this.countAssignedWorkParts(roomName, sourceId);
            if (assignedWorkParts === 0) return sourceId;
            if (assignedWorkParts < bestWorkParts) {
                bestSourceId = sourceId;
                bestWorkParts = assignedWorkParts;
            }
        }

        return bestWorkParts < 5 ? bestSourceId : null;
    }

    countAssignedMiners(roomName, sourceId) {
        let count = 0;
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role !== 'miner') continue;
            if (creep.memory.homeRoom !== roomName) continue;
            if (creep.memory.sourceId !== sourceId) continue;
            count++;
        }
        if (typeof Memory !== 'undefined' && Memory.creeps) {
            for (const name in Memory.creeps) {
                if (Game.creeps[name]) continue;
                const memory = Memory.creeps[name];
                if (memory.role !== 'miner') continue;
                if (memory.homeRoom !== roomName) continue;
                if (memory.sourceId !== sourceId) continue;
                count++;
            }
        }
        return count;
    }

    assignMiningTask(creep) {
        if (creep.memory.targetRoom && creep.room.name !== creep.memory.targetRoom) {
            this.assignRoomMove(creep);
            return;
        }

        const sourceId = creep.memory.sourceId || this.pickSource(creep);
        if (!sourceId) return;
        creep.memory.sourceId = sourceId;

        const source = Game.getObjectById(sourceId);
        if (!source) return;

        if (creep.memory.miningPos && this.isPositionDangerous(creep.room, creep.memory.miningPos)) {
            delete creep.memory.miningPos;
        }
        if (!creep.memory.miningPos) {
            creep.memory.miningPos = this.pickMiningPos(creep.room, source, creep);
        }
        if (!creep.memory.miningPos || this.isPositionDangerous(creep.room, creep.memory.miningPos)) return;
        if (creep.memory.miningPos && creep.pos && !creep.pos.inRangeTo(source.pos, 1)) {
            creep.memory.task = {
                type: TaskTypes.MOVE_TO,
                pos: creep.memory.miningPos,
                range: 0
            };
            return;
        }

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
        let bestSourceId = null;
        let bestWorkParts = Infinity;

        for (const sourceId of cache.sources) {
            const assignedWorkParts = this.countAssignedWorkParts(creep.room.name, sourceId);
            if (assignedWorkParts < bestWorkParts) {
                bestSourceId = sourceId;
                bestWorkParts = assignedWorkParts;
            }
        }

        return bestSourceId;
    }

    countAssignedWorkParts(roomName, sourceId) {
        let workParts = 0;
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role !== 'miner') continue;
            if (creep.memory.homeRoom !== roomName) continue;
            if (creep.memory.sourceId !== sourceId) continue;
            workParts += this.countBodyParts(creep, WORK);
        }
        if (typeof Memory !== 'undefined' && Memory.creeps) {
            for (const name in Memory.creeps) {
                if (Game.creeps[name]) continue;
                const memory = Memory.creeps[name];
                if (memory.role !== 'miner') continue;
                if (memory.homeRoom !== roomName) continue;
                if (memory.sourceId !== sourceId) continue;
                workParts += this.countBodyParts({ body: memory.body }, WORK);
            }
        }
        return workParts;
    }

    countBodyParts(creep, partType) {
        if (!creep.body) return 1;
        const count = creep.body.filter((part) => {
            return part === partType || part.type === partType;
        }).length;
        return count || 1;
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

    countEnergySupportCreeps(roomName) {
        return this.countRole(roomName, 'hauler') +
            this.countRole(roomName, 'upgrader') +
            this.countRole(roomName, 'builder');
    }

    pickMiningPos(room, source, currentCreep) {
        const planned = this.getPlannedMiningPos(room.name, source.id);
        if (planned && !this.isPositionDangerous(room, planned)) return planned;

        const positions = this.getOpenMiningPositions(room, source);
        const occupied = this.getAssignedMiningPosKeys(room.name, source.id, currentCreep);
        for (const pos of positions) {
            if (!occupied[`${pos.x},${pos.y}`]) return pos;
        }
        return positions[0] || { x: source.pos.x, y: source.pos.y, roomName: source.pos.roomName };
    }

    getPlannedMiningPos(roomName, sourceId) {
        if (typeof Memory === 'undefined') return null;
        const plan = Memory.rooms &&
            Memory.rooms[roomName] &&
            Memory.rooms[roomName].cityPlan &&
            Memory.rooms[roomName].cityPlan.sources &&
            Memory.rooms[roomName].cityPlan.sources[sourceId];
        return plan ? plan.primaryMiningPos : null;
    }

    getAssignedMiningPosKeys(roomName, sourceId, currentCreep) {
        const occupied = {};
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (currentCreep && creep.name === currentCreep.name) continue;
            if (creep.memory.role !== 'miner') continue;
            if (creep.memory.homeRoom !== roomName) continue;
            if (creep.memory.sourceId !== sourceId) continue;
            if (!creep.memory.miningPos) continue;
            occupied[`${creep.memory.miningPos.x},${creep.memory.miningPos.y}`] = true;
        }
        return occupied;
    }

    getOpenMiningPositions(room, source) {
        const terrain = Game.map && Game.map.getRoomTerrain ? Game.map.getRoomTerrain(room.name) : null;
        const blockers = this.getPositionBlockers(room);
        const positions = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const x = source.pos.x + dx;
                const y = source.pos.y + dy;
                if (x <= 0 || x >= 49 || y <= 0 || y >= 49) continue;
                if (terrain && terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                if (blockers[`${x},${y}`]) continue;
                const pos = { x, y, roomName: room.name };
                if (this.isPositionDangerous(room, pos)) continue;
                positions.push(pos);
            }
        }
        return positions;
    }

    isPositionDangerous(room, pos) {
        if (!room || !room.find || !pos) return false;
        const hostiles = room.find(FIND_HOSTILE_CREEPS);
        for (const hostile of hostiles) {
            const range = this.getRange(hostile.pos, pos);
            if (this.getActiveBodyparts(hostile, ATTACK) > 0 && range <= 1) return true;
            if (this.getActiveBodyparts(hostile, RANGED_ATTACK) > 0 && range <= 3) return true;
        }
        return false;
    }

    getRange(fromPos, toPos) {
        if (!fromPos || !toPos) return Infinity;
        if (fromPos.getRangeTo) return fromPos.getRangeTo(toPos);
        return Math.max(Math.abs(fromPos.x - toPos.x), Math.abs(fromPos.y - toPos.y));
    }

    getActiveBodyparts(creep, partType) {
        return creep.getActiveBodyparts ? creep.getActiveBodyparts(partType) : 0;
    }

    getPositionBlockers(room) {
        const blockers = {};
        const structures = room.find ? room.find(FIND_STRUCTURES) : [];
        for (const structure of structures) {
            if (structure.structureType === STRUCTURE_ROAD ||
                structure.structureType === STRUCTURE_CONTAINER ||
                structure.structureType === STRUCTURE_RAMPART) {
                continue;
            }
            blockers[`${structure.pos.x},${structure.pos.y}`] = true;
        }
        return blockers;
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
