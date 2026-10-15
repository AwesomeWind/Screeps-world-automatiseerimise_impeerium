import BaseService from '../core/BaseService.js';
import TaskTypes from '../core/TaskTypes.js';
import { assignTask } from '../core/TaskMetadata.js';
import { getSourceOutputPolicy } from '../planning/CityAssetPolicy.js';
import { shouldUseStrictSourceRuntime } from '../planning/RuntimeReadiness.js';
import { getSourceMiningWorkPosition } from '../planning/CityWorkPositionPolicy.js';
import { getSourceContainerAsset, getSourceLinkAsset } from '../planning/CityPlanLegacyAdapter.js';

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
            if (creep.memory.remoteId || creep.memory.remoteStatus === 'orphaned_actor') continue;
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
        return roomName;
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

        if (creep.memory.miningPos && !this.isValidMiningPos(creep.room, source, creep.memory.miningPos, creep)) {
            delete creep.memory.miningPos;
        }
        if (!creep.memory.miningPos) {
            creep.memory.miningPos = this.pickMiningPos(creep.room, source, creep);
        }
        if (!creep.memory.miningPos) return;
        if (creep.memory.miningPos && creep.pos && !this.isAtPosition(creep, creep.memory.miningPos)) {
            assignTask(creep, {
                type: TaskTypes.MOVE_TO,
                pos: creep.memory.miningPos,
                range: 0
            });
            return;
        }

        const linkTask = this.createLinkTransferTask(creep);
        if (linkTask) {
            assignTask(creep, linkTask);
            return;
        }

        const containerFallbackTask = this.createContainerFallbackTask(creep);
        if (containerFallbackTask) {
            assignTask(creep, containerFallbackTask);
            return;
        }

        assignTask(creep, { type: TaskTypes.HARVEST, targetId: sourceId });
    }

    assignRoomMove(creep) {
        if (!creep.memory.targetRoom || creep.room.name === creep.memory.targetRoom) return;
        assignTask(creep, {
            type: TaskTypes.MOVE_TO,
            pos: { x: 25, y: 25, roomName: creep.memory.targetRoom },
            range: 20
        });
    }

    assignReserveTask(creep) {
        if (!creep.memory.targetRoom) return;
        if (creep.room.name !== creep.memory.targetRoom) {
            this.assignRoomMove(creep);
            return;
        }
        if (creep.room.controller) {
            assignTask(creep, { type: TaskTypes.RESERVE, targetId: creep.room.controller.id });
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
        const positions = this.getOpenMiningPositions(room, source);
        const occupied = this.getAssignedMiningPosKeys(room.name, source.id, currentCreep);
        const preferredPositions = this.getPreferredMiningPositions(room, source.id);
        for (const preferred of preferredPositions) {
            if (preferred &&
                this.isPositionInList(preferred, positions) &&
                !this.isPositionDangerous(room, preferred) &&
                !occupied[`${preferred.x},${preferred.y}`]) {
                return preferred;
            }
        }
        for (const pos of positions) {
            if (!occupied[`${pos.x},${pos.y}`]) return pos;
        }
        return null;
    }

    isValidMiningPos(room, source, pos, currentCreep) {
        if (!pos || this.isPositionDangerous(room, pos)) return false;
        if (!source.pos || source.pos.x === undefined || source.pos.y === undefined) return true;
        if (!this.isPositionInList(pos, this.getOpenMiningPositions(room, source))) return false;
        const occupied = this.getAssignedMiningPosKeys(room.name, source.id, currentCreep);
        return !occupied[`${pos.x},${pos.y}`];
    }

    isPositionInList(pos, positions) {
        return positions.some((candidate) => {
            return candidate.x === pos.x &&
                candidate.y === pos.y &&
                candidate.roomName === pos.roomName;
        });
    }

    isAtPosition(creep, pos) {
        if (!creep.pos || !pos) return false;
        if (creep.pos.x !== undefined && creep.pos.y !== undefined) {
            return creep.pos.x === pos.x &&
                creep.pos.y === pos.y &&
                creep.pos.roomName === pos.roomName;
        }
        return creep.pos.inRangeTo && creep.pos.inRangeTo(pos.x, pos.y, 0);
    }

    getPlannedMiningPos(roomName, sourceId) {
        const cityPlan = this.getRoomCityPlan(roomName);
        return getSourceMiningWorkPosition(cityPlan, sourceId);
    }

    createLinkTransferTask(creep) {
        if (!creep || !creep.store || creep.store.getUsedCapacity(RESOURCE_ENERGY) <= 0) return null;
        const sourceId = creep.memory && creep.memory.sourceId;
        if (!sourceId) return null;
        if (!this.sourceUsesLinkOutput(creep.room.name, sourceId)) return null;
        const sourceLink = this.findPlannedSourceLink(creep.room, sourceId);
        if (!sourceLink || !sourceLink.store || !sourceLink.store.getFreeCapacity) return null;
        if (sourceLink.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) return null;
        if (!creep.pos || !creep.pos.inRangeTo || !creep.pos.inRangeTo(sourceLink.pos, 1)) return null;
        return {
            type: TaskTypes.TRANSFER,
            targetId: sourceLink.id,
            resourceType: RESOURCE_ENERGY
        };
    }

    createContainerFallbackTask(creep) {
        if (!creep || !creep.store || creep.store.getUsedCapacity(RESOURCE_ENERGY) <= 0) return null;
        const sourceId = creep.memory && creep.memory.sourceId;
        if (!sourceId) return null;
        if (!this.sourceUsesLinkOutput(creep.room.name, sourceId)) return null;
        const sourceLink = this.findPlannedSourceLink(creep.room, sourceId);
        if (!sourceLink || !sourceLink.store || !sourceLink.store.getFreeCapacity || sourceLink.store.getFreeCapacity(RESOURCE_ENERGY) > 0) return null;

        const container = this.findPlannedSourceContainer(creep.room, sourceId, creep);
        if (!container || !container.store || !container.store.getFreeCapacity) return null;
        if (container.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) return null;
        if (!creep.pos || !creep.pos.inRangeTo || !creep.pos.inRangeTo(container.pos, 0)) return null;
        return {
            type: TaskTypes.TRANSFER,
            targetId: container.id,
            resourceType: RESOURCE_ENERGY
        };
    }

    sourceUsesLinkOutput(roomName, sourceId) {
        return this.getSourceOutputPolicyForRoom(roomName, sourceId).usesLinkOutput;
    }

    findPlannedSourceLink(room, sourceId) {
        if (!room || !room.find) return null;
        const cityPlan = this.getRoomCityPlan(room.name);
        if (!cityPlan) return null;
        if (!this.getSourceOutputPolicyForRoom(room.name, sourceId).usesLinkOutput) return null;

        const sourceLinkAsset = getSourceLinkAsset(cityPlan, sourceId, { allowLegacyFallback: false });
        const plannedPos = sourceLinkAsset && sourceLinkAsset.pos;
        if (!plannedPos) return null;

        const structures = room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_LINK &&
                    structure.pos &&
                    this.samePos(structure.pos, plannedPos);
            }
        });
        if (structures[0]) return structures[0];

        const allStructures = room.find(FIND_STRUCTURES) || [];
        const fallback = allStructures.find((structure) => {
            return structure.structureType === STRUCTURE_LINK &&
                structure.pos &&
                this.samePos(structure.pos, plannedPos);
        });
        if (fallback) return fallback;

        const direct = sourceLinkAsset && sourceLinkAsset.id ? Game.getObjectById(sourceLinkAsset.id) : null;
        if (direct && direct.structureType === STRUCTURE_LINK) return direct;

        const source = Game.getObjectById(sourceId);
        if (source && source.pos) {
            return allStructures.find((structure) => {
                return structure.structureType === STRUCTURE_LINK &&
                    structure.pos &&
                    this.getRange(structure.pos, source.pos) <= 2;
            }) || null;
        }
        return null;
    }

    getPreferredMiningPositions(room, sourceId) {
        const positions = [];
        const builtContainerPos = this.getBuiltSourceContainerPos(room, sourceId);
        const plannedContainerPos = this.getPlannedSourceContainerPos(room.name, sourceId);
        const plannedMiningPos = this.getPlannedMiningPos(room.name, sourceId);

        if (builtContainerPos) positions.push(builtContainerPos);
        if (plannedContainerPos) positions.push(plannedContainerPos);
        if (plannedMiningPos) positions.push(plannedMiningPos);

        return positions.filter((pos, index, list) => {
            return list.findIndex((candidate) => this.samePos(candidate, pos)) === index;
        });
    }

    getPlannedSourceContainerPos(roomName, sourceId) {
        const cityPlan = this.getRoomCityPlan(roomName);
        const sourceContainerAsset = getSourceContainerAsset(cityPlan, sourceId, { allowLegacyFallback: false });
        return sourceContainerAsset ? sourceContainerAsset.pos : null;
    }

    getRoomCityPlan(roomName) {
        return Memory.rooms &&
            Memory.rooms[roomName] &&
            Memory.rooms[roomName].cityPlan;
    }

    getRoomMemory(roomName) {
        return Memory.rooms &&
            Memory.rooms[roomName];
    }

    getSourceOutputPolicyForRoom(roomName, sourceId) {
        const roomMemory = this.getRoomMemory(roomName);
        return getSourceOutputPolicy(roomMemory && roomMemory.cityPlan, sourceId, {
            sourceRuntimeAllowLegacyFallback: !shouldUseStrictSourceRuntime(roomMemory)
        });
    }

    getBuiltSourceContainerPos(room, sourceId) {
        const plannedContainerPos = this.getPlannedSourceContainerPos(room.name, sourceId);
        if (!plannedContainerPos || !room || !room.find) return null;
        const structures = room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_CONTAINER &&
                    structure.pos &&
                    this.samePos(structure.pos, plannedContainerPos);
            }
        });
        return structures.length > 0 ? plannedContainerPos : null;
    }

    findPlannedSourceContainer(room, sourceId, creep = null) {
        const plannedContainerPos = this.getPlannedSourceContainerPos(room.name, sourceId);
        if (!room || !room.find || !plannedContainerPos) return null;
        const structures = room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_CONTAINER &&
                    structure.pos &&
                    this.samePos(structure.pos, plannedContainerPos);
            }
        });
        if (structures[0]) return structures[0];
        const allStructures = room.find(FIND_STRUCTURES) || [];
        return allStructures.find((structure) => {
            return structure.structureType === STRUCTURE_CONTAINER &&
                structure.pos &&
                this.samePos(structure.pos, plannedContainerPos);
        }) || null;
    }

    samePos(a, b) {
        if (!a || !b) return false;
        return a.x === b.x && a.y === b.y && a.roomName === b.roomName;
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
            if (!structure.pos) continue;
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
