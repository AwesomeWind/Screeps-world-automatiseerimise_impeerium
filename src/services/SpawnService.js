import BaseService from '../core/BaseService.js';
import EventBus from '../core/EventBus.js';
import { ensureEmpireControl } from '../config/EmpirePolicy.js';
import { validateSpawnGrant, recordSpawnResult } from './RemoteMiningLedger.js';

class SpawnService extends BaseService {
    constructor(serviceName) {
        super(serviceName);
        this.idleSpawns = {};
        this.pendingTasks = [];
        this.acceptedSpawnNames = {};
        this.requestReceipts = {};
        EventBus.subscribe('REQ_SPAWN', this.handleSpawnRequest.bind(this));
    }

    init() {
        this.idleSpawns = {};
        this.pendingTasks = [];
        this.acceptedSpawnNames = {};
        this.pendingRequestKeys = new Set();
        this.pendingNames = new Set();
        this.pendingQuotas = new Set();
        this.energyBalance = {};
        this.nameSequence = 0;
        global.SpawnIntake = {};
        this.ensureSpawnMemoryBackup();
        if (!Memory.empire.spawnRequestReceipts || typeof Memory.empire.spawnRequestReceipts !== 'object' || Array.isArray(Memory.empire.spawnRequestReceipts)) Memory.empire.spawnRequestReceipts = {};
        this.requestReceipts = Memory.empire.spawnRequestReceipts;
        for (const key in this.requestReceipts) {
            const receipt = this.requestReceipts[key];
            if (!receipt || !Number.isFinite(receipt.expireAt) || receipt.expireAt < Game.time) delete this.requestReceipts[key];
        }
        for (const name in Memory.empire.spawningCreeps) {
            const record = this.getSpawnMemoryRecord(name);
            if (record && record.requestId && Number.isFinite(record.requestExpiresAt) && record.requestExpiresAt >= Game.time) {
                this.requestReceipts[record.requestId] = { expireAt: record.requestExpiresAt, name, roomName: record.spawnRoom };
            }
        }
        this.restoreMissingCreepMemory();

        for (const spawnName in Game.spawns) {
            const spawn = Game.spawns[spawnName];
            if (spawn.spawning) continue;
            const roomName = spawn.room.name;
            if (this.energyBalance[roomName] === undefined) this.energyBalance[roomName] = spawn.room.energyAvailable || 0;
            if (!this.idleSpawns[roomName]) this.idleSpawns[roomName] = [];
            this.idleSpawns[roomName].push(spawn);
        }
    }

    handleSpawnRequest(event) {
        const data = event.data || {};
        if (!Array.isArray(data.body) || data.body.length === 0 || data.body.length > 50 ||
            !data.body.every((part) => typeof part === 'string' && Number.isFinite(BODYPART_COST[part]))) {
            this.recordIntake(data.roomName, 'invalid_body');
            return true;
        }
        const roomName = data.roomName;
        const remoteContext = this.remoteSpawnContext(data);
        if (remoteContext.required && !remoteContext.allowed) {
            this.recordIntake(roomName, 'stale_remote_grant');
            return true;
        }
        if ((data.name !== undefined && (typeof data.name !== 'string' || !data.name.length || data.name.length > 100)) ||
            (event.expireAt !== undefined && (!Number.isFinite(event.expireAt) || event.expireAt < Game.time))) {
            this.recordIntake(roomName, 'invalid_request');
            return true;
        }
        const requestId = data.requestId || event.id;
        const quotaKey = data.memory && data.memory.quotaKey;
        const economicQuota = ['miner', 'hauler', 'upgrader', 'builder', 'repairer', 'scout', 'reserver', 'remoteMiner', 'remoteHauler'].includes(data.role || (data.memory && data.memory.role)) && quotaKey;
        const scopedQuota = economicQuota && `${roomName}:${quotaKey}`;
        if ((requestId && (this.pendingRequestKeys.has(requestId) || this.requestReceipts[requestId])) ||
            (scopedQuota && this.pendingQuotas.has(scopedQuota)) ||
            (data.name && (this.pendingNames.has(data.name) || Game.creeps[data.name]))) {
            this.recordIntake(roomName, 'request_replay');
            return true;
        }
        const configuredLimit = ensureEmpireControl().policy.spawnIntake.maxReceiptsPerRoom;
        const receiptLimit = Math.min(200, Number.isSafeInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 200);
        const existing = Object.values(this.requestReceipts).filter(receipt => receipt.roomName === roomName).length;
        const pending = this.pendingTasks.filter(task => task.data.roomName === roomName && task.requestId).length;
        if (requestId && existing + pending >= receiptLimit) {
            this.recordIntake(roomName, 'receipt_capacity');
            return false;
        }
        const spawns = this.idleSpawns[roomName] || [];
        if (spawns.length === 0) {
            this.recordIntake(roomName, 'no_idle_spawn');
            return false;
        }

        const room = Game.rooms[roomName];
        const cost = this.calculateBodyCost(data.body);
        if (!room || (this.energyBalance[roomName] || 0) < cost) {
            this.recordIntake(roomName, room ? 'insufficient_energy' : 'room_missing');
            return false;
        }

        const spawn = spawns.pop();
        const spawnName = spawn.name || Object.keys(Game.spawns).find((key) => Game.spawns[key] === spawn);
        const roleName = String(data.role || (data.memory && data.memory.role) || 'creep').slice(0, 20);
        const name = data.name || `${roleName}_${Game.time}_${String(spawnName).slice(0, 30)}_${this.nameSequence++}`;
        this.energyBalance[roomName] -= cost;
        if (requestId) this.pendingRequestKeys.add(requestId);
        if (scopedQuota) this.pendingQuotas.add(scopedQuota);
        this.pendingNames.add(name);
        this.pendingTasks.push({ spawn, data, name, cost, requestId, event });
        if (remoteContext.grant) {
            remoteContext.grant.executing = true;
            remoteContext.grant.executingAt = Game.time;
        }
        this.recordIntake(roomName, 'accepted');
        return true;
    }

    run() {
        for (const task of this.pendingTasks) {
            const memory = task.data.memory || { role: task.data.role };
            const remoteContext = this.remoteSpawnContext(task.data, 'run');
            if (remoteContext.required && !remoteContext.allowed) {
                this.energyBalance[task.data.roomName] += task.cost;
                this.recordIntake(task.data.roomName, 'stale_remote_grant');
                continue;
            }
            const result = task.spawn.spawnCreep(task.data.body, task.name, {
                memory,
                directions: task.data.directions
            });
            if (remoteContext.required) recordSpawnResult(remoteContext.budget, remoteContext.operation.ledger, {
                requestId: task.requestId, name: task.name, result, body: task.data.body, acceptedAt: Game.time
            }, Game.time);
            if (result === OK) {
                this.acceptedSpawnNames[task.name] = true;
                if (typeof Memory !== 'undefined') {
                    if (!Memory.creeps) Memory.creeps = {};
                    this.ensureSpawnMemoryBackup();
                    Memory.creeps[task.name] = memory;
                    Memory.empire.spawningCreeps[task.name] = this.createSpawnMemoryRecord(memory, task.data.body, task.spawn);
                    if (task.requestId) {
                        const deadline = task.event && task.event.expireAt !== undefined ? task.event.expireAt : Game.time + 1;
                        Object.assign(Memory.empire.spawningCreeps[task.name], { requestId: task.requestId, requestExpiresAt: deadline });
                        this.requestReceipts[task.requestId] = { name: task.name, expireAt: deadline, roomName: task.data.roomName };
                    }
                }
            } else {
                const roomName = task.data.roomName;
                this.recordIntake(roomName, 'spawn_failed');
                if (task.cost !== undefined) this.energyBalance[roomName] += task.cost;
                if (task.event && task.event.expireAt >= Game.time && result !== ERR_NAME_EXISTS) {
                    const eventId = EventBus.publish('REQ_SPAWN', task.event.priority, {
                        ...task.data, requestId: task.requestId
                    }, task.event.expireAt - Game.time);
                    const retry = EventBus.topics.REQ_SPAWN.find((entry) => entry.id === eventId);
                    retry.expireAt = task.event.expireAt;
                }
            }
            if (result !== OK && result !== ERR_NAME_EXISTS) {
                console.log(`[SpawnService] spawn failed ${task.name}: ${result}`);
            }
        }
        this.pendingTasks = [];
    }

    remoteSpawnContext(data, stage = 'intake') {
        const memory = data.memory || {};
        const required = !!memory.remoteId || ['scout', 'reserver', 'remoteMiner', 'remoteHauler'].includes(data.role || memory.role);
        if (!required) return { required: false };
        const policy = ensureEmpireControl().policy.remoteMining;
        const scope = global.RemoteMining && global.RemoteMining[memory.remoteId];
        const budget = Memory.empire.remoteMining && Memory.empire.remoteMining.budgets[data.roomName];
        if (!policy.enabled || !scope || !budget || scope.operation.evaluatedAt !== Game.time) return { required, allowed: false };
        const raw = Memory.empire.remoteRooms && Memory.empire.remoteRooms[scope.config.targetRoom];
        if (!raw || raw.enabled !== true || data.roomName !== scope.config.baseRoom || memory.homeRoom !== scope.config.baseRoom ||
            memory.targetRoom !== scope.config.targetRoom || memory.sourceId !== scope.config.sourceId) return { required, allowed: false };
        const role = data.role || memory.role;
        const requiredParts = { scout: [MOVE], reserver: [CLAIM, MOVE], remoteMiner: [WORK, CARRY, MOVE], remoteHauler: [CARRY, MOVE] };
        if (memory.role !== role || !requiredParts[role] || !requiredParts[role].every(part => data.body.includes(part)) ||
            (role === 'scout' ? !scope.state.allowRecon : !scope.state.allowEconomicDeparture)) return { required, allowed: false };
        const request = { requestId: data.requestId, grantId: data.grantId, remoteId: memory.remoteId,
            epoch: memory.epoch, role: data.role || memory.role, quotaKey: memory.quotaKey, stage };
        const validation = validateSpawnGrant(budget, request, scope.operation, Game.time);
        return { required, budget, operation: scope.operation, grant: validation.grant,
            allowed: validation.allowed && this.calculateBodyCost(data.body) <= validation.grant.maxEnergy };
    }

    recordIntake(roomName, reason) {
        if (!global.SpawnIntake) global.SpawnIntake = {};
        const state = global.SpawnIntake[roomName] || { tick: Game.time, accepted: 0, blocked: 0, replays: 0, reasons: {} };
        const field = reason === 'accepted' ? 'accepted' : (reason === 'request_replay' ? 'replays' : 'blocked');
        state[field]++;
        state.reasons[reason] = (state.reasons[reason] || 0) + 1;
        state.lastReason = reason;
        global.SpawnIntake[roomName] = state;
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
        if (typeof Memory === 'undefined') return;
        if (!Memory.creeps) Memory.creeps = {};

        for (const name in Game.creeps) {
            const record = this.getSpawnMemoryRecord(name);
            const creep = Game.creeps[name];
            if (creep.memory && creep.memory.role) continue;
            const recoveryMemory = record && record.memory ? record.memory : Memory.creeps[name];
            if (!recoveryMemory || !recoveryMemory.role) continue;
            const creepMemory = creep.memory || {};
            Object.assign(creepMemory, recoveryMemory);
            Memory.creeps[name] = creepMemory;
            creep.memory = creepMemory;
        }
    }

    ensureSpawnMemoryBackup() {
        if (!Memory.empire) Memory.empire = {};
        if (!Memory.empire.spawningCreeps) Memory.empire.spawningCreeps = {};
    }

    createSpawnMemoryRecord(memory, body, spawn) {
        const spawnTime = typeof CREEP_SPAWN_TIME === 'undefined' ? 3 : CREEP_SPAWN_TIME;
        const bodyLength = body ? body.length : 0;
        return {
            schemaVersion: 2,
            acceptedAt: Game.time,
            spawnName: spawn && (spawn.name || Object.keys(Game.spawns).find((name) => Game.spawns[name] === spawn)),
            spawnRoom: spawn && spawn.room ? spawn.room.name : memory.homeRoom,
            memory,
            body: body ? [...body] : [],
            expireAt: Game.time + (bodyLength * spawnTime) + 10
        };
    }

    getSpawnMemoryRecord(name) {
        const entry = Memory.empire && Memory.empire.spawningCreeps ? Memory.empire.spawningCreeps[name] : null;
        if (!entry) return null;
        if (entry.memory) {
            if (entry.expireAt === undefined) {
                if (entry.firstObservedAt === undefined) entry.firstObservedAt = Game.time;
                entry.expireAt = entry.firstObservedAt + 150;
            }
            return entry;
        }

        const record = {
            memory: entry,
            firstObservedAt: Game.time,
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
