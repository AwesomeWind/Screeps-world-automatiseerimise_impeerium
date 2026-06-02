import BaseService from '../core/BaseService.js';
import EventBus from '../core/EventBus.js';

class SpawnService extends BaseService {
    constructor(serviceName) {
        super(serviceName);
        this.idleSpawns = {};
        this.pendingTasks = [];
        this.acceptedSpawnNames = {};
        EventBus.subscribe('REQ_SPAWN', this.handleSpawnRequest.bind(this));
    }

    init() {
        this.idleSpawns = {};
        this.pendingTasks = [];
        this.acceptedSpawnNames = {};
        this.restoreMissingCreepMemory();

        for (const spawnName in Game.spawns) {
            const spawn = Game.spawns[spawnName];
            if (spawn.spawning) continue;
            const roomName = spawn.room.name;
            if (!this.idleSpawns[roomName]) this.idleSpawns[roomName] = [];
            this.idleSpawns[roomName].push(spawn);
        }
    }

    handleSpawnRequest(event) {
        const data = event.data;
        const roomName = data.roomName;
        const spawns = this.idleSpawns[roomName] || [];
        if (spawns.length === 0) return false;

        const room = Game.rooms[roomName];
        if (!room || room.energyAvailable < this.calculateBodyCost(data.body)) return false;

        const spawn = spawns.pop();
        const name = data.name || `${data.role || data.memory.role}_${Game.time}`;
        this.pendingTasks.push({ spawn, data, name });
        return true;
    }

    run() {
        for (const task of this.pendingTasks) {
            const memory = task.data.memory || { role: task.data.role };
            const result = task.spawn.spawnCreep(task.data.body, task.name, {
                memory,
                directions: task.data.directions
            });
            if (result === OK) {
                this.acceptedSpawnNames[task.name] = true;
                if (typeof Memory !== 'undefined') {
                    if (!Memory.creeps) Memory.creeps = {};
                    this.ensureSpawnMemoryBackup();
                    Memory.creeps[task.name] = memory;
                    Memory.empire.spawningCreeps[task.name] = this.createSpawnMemoryRecord(memory, task.data.body);
                }
            }
            if (result !== OK && result !== ERR_NAME_EXISTS) {
                console.log(`[SpawnService] spawn failed ${task.name}: ${result}`);
            }
        }
    }

    cleanup() {
        if (!Memory.creeps) Memory.creeps = {};
        this.ensureSpawnMemoryBackup();

        const spawningNames = {};
        for (const spawnName in Game.spawns) {
            const spawning = Game.spawns[spawnName].spawning;
            if (spawning && spawning.name) spawningNames[spawning.name] = true;
        }

        for (const name in Memory.creeps) {
            if (this.acceptedSpawnNames[name]) continue;
            if (spawningNames[name]) continue;
            if (this.isPendingSpawnMemory(name, spawningNames)) continue;
            if (!Game.creeps[name]) delete Memory.creeps[name];
        }

        for (const name in Memory.empire.spawningCreeps) {
            const record = this.getSpawnMemoryRecord(name);
            const creep = Game.creeps[name];
            if (creep && creep.memory && creep.memory.role) {
                delete Memory.empire.spawningCreeps[name];
                continue;
            }
            if (!creep && !spawningNames[name] && !this.acceptedSpawnNames[name] && this.isSpawnMemoryExpired(record)) {
                delete Memory.empire.spawningCreeps[name];
            }
        }
    }

    calculateBodyCost(body) {
        return body.reduce((sum, part) => sum + BODYPART_COST[part], 0);
    }

    restoreMissingCreepMemory() {
        if (typeof Memory === 'undefined' || !Memory.empire || !Memory.empire.spawningCreeps) return;
        if (!Memory.creeps) Memory.creeps = {};

        for (const name in Game.creeps) {
            const record = this.getSpawnMemoryRecord(name);
            if (!record || !record.memory) continue;
            const creep = Game.creeps[name];
            if (creep.memory && creep.memory.role) continue;
            const creepMemory = creep.memory || {};
            Object.assign(creepMemory, record.memory);
            Memory.creeps[name] = creepMemory;
            creep.memory = creepMemory;
        }
    }

    ensureSpawnMemoryBackup() {
        if (!Memory.empire) Memory.empire = {};
        if (!Memory.empire.spawningCreeps) Memory.empire.spawningCreeps = {};
    }

    createSpawnMemoryRecord(memory, body) {
        const spawnTime = typeof CREEP_SPAWN_TIME === 'undefined' ? 3 : CREEP_SPAWN_TIME;
        const bodyLength = body ? body.length : 0;
        return {
            memory,
            expireAt: Game.time + (bodyLength * spawnTime) + 10
        };
    }

    getSpawnMemoryRecord(name) {
        const entry = Memory.empire && Memory.empire.spawningCreeps ? Memory.empire.spawningCreeps[name] : null;
        if (!entry) return null;
        if (entry.memory) return entry;

        const record = {
            memory: entry,
            expireAt: Game.time + 150
        };
        Memory.empire.spawningCreeps[name] = record;
        return record;
    }

    isPendingSpawnMemory(name, spawningNames) {
        const record = this.getSpawnMemoryRecord(name);
        if (!record) return false;
        if (this.acceptedSpawnNames[name] || spawningNames[name]) return true;
        return !this.isSpawnMemoryExpired(record);
    }

    isSpawnMemoryExpired(record) {
        return record && record.expireAt !== undefined && Game.time > record.expireAt;
    }
}

export default SpawnService;
