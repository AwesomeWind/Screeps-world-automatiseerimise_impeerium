import BaseService from '../core/BaseService.js';
import EventBus from '../core/EventBus.js';
import BodyBuilder from '../core/BodyBuilder.js';

class SpawnBureauService extends BaseService {
    analyze() {
        global.SpawnBureau = {};
        if (!global.SpawnDemands) global.SpawnDemands = {};

        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (room.controller && room.controller.my === false) continue;

            const state = {
                intents: [],
                blockedDemands: [],
                counts: {}
            };
            global.SpawnBureau[roomName] = state;

            this.addEconomicIntents(room, state);
            this.addDemandIntents(room, state);

            state.intents.sort((a, b) => b.priority - a.priority);
            for (const intent of state.intents) {
                EventBus.publish('REQ_SPAWN', intent.priority, {
                    roomName: intent.roomName,
                    role: intent.role,
                    body: intent.body,
                    memory: intent.memory
                }, intent.expireIn || 1);
            }
        }
    }

    addEconomicIntents(room, state) {
        this.addMinerIntents(room, state);
        this.addHaulerIntent(room, state);
        this.addUpgraderIntent(room, state);
        this.addBuilderIntent(room, state);
    }

    addMinerIntents(room, state) {
        const cache = global.RoomCache && global.RoomCache[room.name];
        const sources = cache && cache.sources ? cache.sources : [];
        if (this.shouldWaitForBootstrapHauler(room)) return;

        for (const sourceId of sources) {
            const source = Game.getObjectById(sourceId);
            if (!source) continue;
            const openPositions = this.getOpenMiningPositions(room, source);
            if (openPositions.length === 0) continue;

            const quotaKey = `miner:${room.name}:${sourceId}`;
            if (this.countQuota(room.name, quotaKey, state) >= openPositions.length) continue;
            if (this.countSourceWorkParts(room.name, sourceId, state) >= 5) continue;

            this.addIntent(room, state, {
                role: 'miner',
                quotaKey,
                priority: this.countRole(room.name, 'miner', state) === 0 ? 90 : 80,
                bodyProfile: 'miner',
                memory: { role: 'miner', homeRoom: room.name, sourceId },
                reason: 'source_uncovered'
            });
        }
    }

    addHaulerIntent(room, state) {
        const desired = room.storage ? 3 : ((room.energyCapacityAvailable || 0) <= 300 ? 1 : 2);
        const current = this.countRole(room.name, 'hauler', state);
        if (current >= desired) return;

        this.addIntent(room, state, {
            role: 'hauler',
            quotaKey: `hauler:${room.name}:core`,
            priority: current === 0 ? 90 : 45,
            bodyProfile: 'hauler',
            memory: { role: 'hauler', homeRoom: room.name },
            reason: current === 0 ? 'emergency_energy_logistics' : 'hauler_capacity'
        });
    }

    addUpgraderIntent(room, state) {
        if (this.countRole(room.name, 'miner', state) === 0 || this.countRole(room.name, 'hauler', state) === 0) return;
        const desired = room.storage ? 2 : 1;
        const current = this.countRole(room.name, 'upgrader', state);
        if (current >= desired) return;

        this.addIntent(room, state, {
            role: 'upgrader',
            quotaKey: `upgrader:${room.name}:controller`,
            priority: current === 0 ? 60 : 35,
            bodyProfile: 'upgrader',
            memory: { role: 'upgrader', homeRoom: room.name },
            reason: 'controller_progress'
        });
    }

    addBuilderIntent(room, state) {
        const sites = room.find ? room.find(FIND_CONSTRUCTION_SITES) : [];
        if (sites.length === 0) return;
        if (this.countRole(room.name, 'miner', state) === 0 ||
            this.countRole(room.name, 'hauler', state) === 0 ||
            this.countRole(room.name, 'upgrader', state) === 0) {
            return;
        }

        const current = this.countRole(room.name, 'builder', state);
        if (current >= 2) return;

        this.addIntent(room, state, {
            role: 'builder',
            quotaKey: `builder:${room.name}:construction`,
            priority: current === 0 ? 55 : 30,
            bodyProfile: 'builder',
            memory: { role: 'builder', homeRoom: room.name },
            reason: 'construction'
        });
    }

    addDemandIntents(room, state) {
        const demands = global.SpawnDemands && global.SpawnDemands[room.name] ? global.SpawnDemands[room.name] : [];
        for (const demand of demands) {
            const quotaKey = demand.quotaKey || `${demand.role}:${room.name}:demand`;
            const maxCount = demand.maxCount || demand.minCount || 1;
            if (this.countQuota(room.name, quotaKey, state) >= maxCount) continue;

            this.addIntent(room, state, {
                role: demand.role,
                quotaKey,
                priority: demand.priority || 50,
                bodyProfile: demand.bodyProfile || demand.role,
                memory: demand.memory || { role: demand.role, homeRoom: room.name },
                reason: demand.reason || 'demand'
            });
        }
    }

    addIntent(room, state, intent) {
        if (state.intents.some((planned) => planned.quotaKey === intent.quotaKey)) return;

        const bodySpec = BodyBuilder.build(intent.role, room, {
            bodyProfile: intent.bodyProfile,
            energyCapacity: room.energyCapacityAvailable || room.energyAvailable || 0
        });
        if (!bodySpec.body || bodySpec.body.length === 0) {
            state.blockedDemands.push({
                role: intent.role,
                quotaKey: intent.quotaKey,
                reason: 'no_valid_body'
            });
            return;
        }

        state.intents.push({
            roomName: room.name,
            role: intent.role,
            quotaKey: intent.quotaKey,
            priority: intent.priority,
            bodyProfile: intent.bodyProfile,
            body: bodySpec.body,
            memory: Object.assign({ quotaKey: intent.quotaKey }, intent.memory),
            reason: intent.reason
        });
    }

    shouldWaitForBootstrapHauler(room) {
        if (!room || room.storage) return false;
        if ((room.energyCapacityAvailable || 0) > 300) return false;
        if (this.countRole(room.name, 'miner') === 0) return false;
        return this.countRole(room.name, 'hauler') === 0 &&
            this.countRole(room.name, 'upgrader') === 0 &&
            this.countRole(room.name, 'builder') === 0;
    }

    countRole(roomName, role, state) {
        let count = 0;
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role === role && this.creepHomeRoom(creep) === roomName) count++;
        }
        if (typeof Memory !== 'undefined' && Memory.creeps) {
            for (const name in Memory.creeps) {
                if (Game.creeps[name]) continue;
                const memory = Memory.creeps[name];
                if (memory.role === role && this.memoryHomeRoom(memory) === roomName) count++;
            }
        }
        if (typeof Memory !== 'undefined' && Memory.empire && Memory.empire.spawningCreeps) {
            for (const name in Memory.empire.spawningCreeps) {
                if (Game.creeps[name]) continue;
                const record = this.spawnRecord(Memory.empire.spawningCreeps[name]);
                if (!record || this.isSpawnRecordExpired(record)) continue;
                const memory = record.memory || {};
                if (memory.role === role && this.memoryHomeRoom(memory) === roomName) count++;
            }
        }
        if (state) {
            count += state.intents.filter((intent) => intent.role === role).length;
        }
        return count;
    }

    countQuota(roomName, quotaKey, state) {
        let count = 0;
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (this.creepHomeRoom(creep) !== roomName) continue;
            if (this.quotaKeyForMemory(creep.memory, roomName) === quotaKey) count++;
        }
        if (typeof Memory !== 'undefined' && Memory.creeps) {
            for (const name in Memory.creeps) {
                if (Game.creeps[name]) continue;
                const memory = Memory.creeps[name];
                if (this.memoryHomeRoom(memory) !== roomName) continue;
                if (this.quotaKeyForMemory(memory, roomName) === quotaKey) count++;
            }
        }
        if (typeof Memory !== 'undefined' && Memory.empire && Memory.empire.spawningCreeps) {
            for (const name in Memory.empire.spawningCreeps) {
                const record = this.spawnRecord(Memory.empire.spawningCreeps[name]);
                if (!record || this.isSpawnRecordExpired(record)) continue;
                const memory = record.memory || {};
                if (this.memoryHomeRoom(memory) !== roomName) continue;
                if (this.quotaKeyForMemory(memory, roomName) === quotaKey) count++;
            }
        }
        if (state) count += state.intents.filter((intent) => intent.quotaKey === quotaKey).length;
        return count;
    }

    countSourceWorkParts(roomName, sourceId, state) {
        let workParts = 0;
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role !== 'miner') continue;
            if (this.creepHomeRoom(creep) !== roomName) continue;
            if (creep.memory.sourceId !== sourceId) continue;
            workParts += this.countBodyParts(creep.body, WORK);
        }
        if (typeof Memory !== 'undefined' && Memory.creeps) {
            for (const name in Memory.creeps) {
                if (Game.creeps[name]) continue;
                const memory = Memory.creeps[name];
                if (memory.role !== 'miner') continue;
                if (this.memoryHomeRoom(memory) !== roomName) continue;
                if (memory.sourceId !== sourceId) continue;
                workParts += this.countBodyParts(memory.body, WORK);
            }
        }
        if (state) {
            for (const intent of state.intents) {
                if (intent.role === 'miner' && intent.memory.sourceId === sourceId) {
                    workParts += this.countBodyParts(intent.body, WORK);
                }
            }
        }
        return workParts;
    }

    countBodyParts(body, partType) {
        if (!body) return 1;
        const count = body.filter((part) => part === partType || part.type === partType).length;
        return count || 1;
    }

    quotaKeyForMemory(memory, fallbackRoomName) {
        const roomName = memory.homeRoom || memory.targetRoom || fallbackRoomName;
        if (memory.quotaKey) return memory.quotaKey;
        if (memory.role === 'miner' && memory.sourceId) return `miner:${roomName}:${memory.sourceId}`;
        if (memory.role === 'hauler') return `hauler:${roomName}:core`;
        if (memory.role === 'upgrader') return `upgrader:${roomName}:controller`;
        if (memory.role === 'builder') return `builder:${roomName}:construction`;
        if (memory.role === 'defender') return `defender:${roomName}:local`;
        return null;
    }

    creepHomeRoom(creep) {
        return creep.memory.homeRoom || creep.memory.targetRoom || (creep.room && creep.room.name);
    }

    memoryHomeRoom(memory) {
        return memory.homeRoom || memory.targetRoom;
    }

    spawnRecord(entry) {
        if (!entry) return null;
        if (entry.memory) return entry;
        return { memory: entry, expireAt: Game.time + 150 };
    }

    isSpawnRecordExpired(record) {
        return record.expireAt !== undefined && Game.time > record.expireAt;
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
                positions.push({ x, y, roomName: room.name });
            }
        }
        return positions;
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
}

export default SpawnBureauService;
