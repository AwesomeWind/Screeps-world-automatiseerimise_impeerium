import BaseService from '../core/BaseService.js';
import EventBus from '../core/EventBus.js';
import BodyBuilder from '../core/BodyBuilder.js';
import { getSourceOutputPolicy } from '../planning/CityAssetPolicy.js';
import { getControllerContainerAsset } from '../planning/CityPlanLegacyAdapter.js';
import { shouldUseStrictSourceRuntime } from '../planning/RuntimeReadiness.js';

const REPLACEMENT_LEAD_TICKS = 50;

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
        this.addRepairerIntent(room, state);
    }

    addMinerIntents(room, state) {
        const cache = global.RoomCache && global.RoomCache[room.name];
        const sources = cache && cache.sources ? cache.sources : [];
        if (this.shouldWaitForBootstrapHauler(room)) return;
        const recoveryMode = this.isMinerRecoveryMode(room, state);

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
                priority: recoveryMode ? 120 : (this.countRole(room.name, 'miner', state) === 0 ? 90 : 80),
                bodyProfile: recoveryMode ? 'emergency_miner' : this.minerBodyProfile(room.name, sourceId),
                energyCapacity: recoveryMode ? room.energyAvailable : undefined,
                memory: { role: 'miner', homeRoom: room.name, sourceId },
                reason: recoveryMode ? 'miner_recovery' : 'source_uncovered'
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
            bodyProfile: current === 0 ? 'emergency_hauler' : 'hauler',
            memory: { role: 'hauler', homeRoom: room.name },
            reason: current === 0 ? 'emergency_energy_logistics' : 'hauler_capacity'
        });
    }

    addUpgraderIntent(room, state) {
        if (this.countRole(room.name, 'miner', state) === 0 || this.countRole(room.name, 'hauler', state) === 0) return;
        const desired = this.desiredUpgraders(room);
        const current = this.countRole(room.name, 'upgrader', state);
        if (current >= desired) return;

        this.addIntent(room, state, {
            role: 'upgrader',
            quotaKey: `upgrader:${room.name}:controller`,
            priority: current === 0 ? 60 : 35,
            bodyProfile: this.upgraderBodyProfile(room),
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
            bodyProfile: this.builderBodyProfile(room),
            memory: { role: 'builder', homeRoom: room.name },
            reason: 'construction'
        });
    }

    addRepairerIntent(room, state) {
        const maintenanceDemand = this.maintenanceDemand(room);
        if (maintenanceDemand.totalTargets <= 0) return;
        if (this.countRole(room.name, 'miner', state) === 0 ||
            this.countRole(room.name, 'hauler', state) === 0 ||
            this.countRole(room.name, 'upgrader', state) === 0) {
            return;
        }

        const maintenanceWorkers = this.countRole(room.name, 'repairer', state);
        if (maintenanceWorkers === 0) {
            this.addIntent(room, state, {
                role: 'repairer',
                quotaKey: `repairer:${room.name}:maintenance`,
                priority: maintenanceDemand.urgentTargets > 0 ? 58 : 44,
                bodyProfile: 'repairer',
                memory: { role: 'repairer', homeRoom: room.name },
                reason: 'maintenance_coverage'
            });
            return;
        }

        const backlog = maintenanceDemand.backlog;
        if (backlog <= 0) return;

        const desired = Math.min(2, Math.ceil(backlog / 3));
        const current = this.countRole(room.name, 'repairer', state);
        if (current >= desired) return;

        this.addIntent(room, state, {
            role: 'repairer',
            quotaKey: `repairer:${room.name}:maintenance`,
            priority: backlog >= 3 ? 52 : 42,
            bodyProfile: 'repairer',
            memory: { role: 'repairer', homeRoom: room.name },
            reason: 'maintenance_backlog'
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

        const roomPhase = this.roomPhase(room);
        const bodySpec = BodyBuilder.build(intent.role, room, {
            phase: roomPhase.phase,
            bodyProfile: intent.bodyProfile,
            energyCapacity: intent.energyCapacity || room.energyCapacityAvailable || room.energyAvailable || 0
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

    upgraderBodyProfile(room) {
        if (this.hasPlannedControllerContainer(room.name) || this.hasControllerContainer(room)) {
            return 'stationary_upgrader';
        }
        return 'upgrader';
    }

    desiredUpgraders(room) {
        if (!room) return 1;
        if (this.hasPlannedControllerContainer(room.name) || this.hasControllerContainer(room)) {
            return 1;
        }
        return room.storage ? 2 : 1;
    }

    minerBodyProfile(roomName, sourceId) {
        const roomMemory = typeof Memory !== 'undefined' &&
            Memory.rooms &&
            Memory.rooms[roomName] &&
            Memory.rooms[roomName];
        const cityPlan = roomMemory && roomMemory.cityPlan;
        const strictRuntimePolicy = shouldUseStrictSourceRuntime(roomMemory);
        return getSourceOutputPolicy(cityPlan, sourceId, {
            sourceRuntimeAllowLegacyFallback: !strictRuntimePolicy
        }).bodyProfile;
    }

    hasPlannedControllerContainer(roomName) {
        const cityPlan = typeof Memory !== 'undefined' &&
            Memory.rooms &&
            Memory.rooms[roomName] &&
            Memory.rooms[roomName].cityPlan;
        const controllerContainerAsset = getControllerContainerAsset(cityPlan, { allowLegacyFallback: false });
        return !!(controllerContainerAsset && controllerContainerAsset.pos);
    }

    hasControllerContainer(room) {
        if (!room || !room.controller || !room.controller.pos || !room.find) return false;
        const containers = room.find(FIND_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_CONTAINER
        });
        for (const container of containers) {
            if (!container.pos) continue;
            const range = container.pos.getRangeTo ?
                container.pos.getRangeTo(room.controller.pos) :
                Math.max(Math.abs(container.pos.x - room.controller.pos.x), Math.abs(container.pos.y - room.controller.pos.y));
            if (range <= 3) return true;
        }
        return false;
    }
    builderBodyProfile(room) {
        const roomPhase = this.roomPhase(room);
        if (roomPhase.hasStorage || roomPhase.phase === 'storage' || roomPhase.phase === 'terminal' || roomPhase.phase === 'empire') {
            return 'supplied_builder';
        }
        return 'mobile_builder';
    }

    roomPhase(room) {
        const phase = global.RoomPhase && global.RoomPhase[room.name];
        if (phase) return phase;
        return {
            phase: room.storage ? 'storage' : 'early',
            hasStorage: !!room.storage,
            hasTerminal: !!room.terminal
        };
    }

    maintenanceDemand(room) {
        const plan = typeof Memory !== 'undefined' &&
            Memory.rooms &&
            Memory.rooms[room.name] &&
            Memory.rooms[room.name].maintenancePlan;
        if (!plan || !plan.targets) {
            return {
                totalTargets: 0,
                urgentTargets: 0,
                backlog: 0
            };
        }

        const quotas = plan.quotas || {};
        const allowed = {
            urgent: quotas.urgent === undefined ? 0 : quotas.urgent,
            routine: quotas.routine === undefined ? 0 : quotas.routine,
            longTerm: quotas.longTerm === undefined ? 0 : quotas.longTerm
        };
        const counts = { urgent: 0, routine: 0, longTerm: 0 };
        let totalTargets = 0;

        for (const target of plan.targets) {
            if (target.executor !== 'repairer') continue;
            const urgency = this.urgencyFor(target);
            counts[urgency]++;
            totalTargets++;
        }

        return {
            totalTargets,
            urgentTargets: counts.urgent,
            backlog: Math.max(0, counts.urgent - allowed.urgent) +
                Math.max(0, counts.routine - allowed.routine) +
                Math.max(0, counts.longTerm - allowed.longTerm)
        };
    }

    urgencyFor(target) {
        if (target.urgency === 'urgent' || target.urgency === 'longTerm') return target.urgency;
        return 'routine';
    }

    shouldWaitForBootstrapHauler(room) {
        if (!room || room.storage) return false;
        if ((room.energyCapacityAvailable || 0) > 300) return false;
        if (this.countRole(room.name, 'miner') === 0) return false;
        return this.countRole(room.name, 'hauler') === 0 &&
            this.countRole(room.name, 'upgrader') === 0 &&
            this.countRole(room.name, 'builder') === 0;
    }

    isMinerRecoveryMode(room, state) {
        if (!room || this.countRole(room.name, 'miner', state) > 0) return false;
        return (room.energyAvailable || 0) >= BODYPART_COST[WORK] + BODYPART_COST[MOVE];
    }

    countRole(roomName, role, state) {
        let count = 0;
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (this.isRetiringCreep(creep)) continue;
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
            if (this.isRetiringCreep(creep)) continue;
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
            if (this.isRetiringCreep(creep)) continue;
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

    isRetiringCreep(creep) {
        if (!creep || creep.ticksToLive === undefined) return false;
        const bodyLength = creep.body ? creep.body.length : 0;
        const spawnTime = typeof CREEP_SPAWN_TIME === 'undefined' ? 3 : CREEP_SPAWN_TIME;
        return creep.ticksToLive <= bodyLength * spawnTime + REPLACEMENT_LEAD_TICKS;
    }

    quotaKeyForMemory(memory, fallbackRoomName) {
        const roomName = memory.homeRoom || memory.targetRoom || fallbackRoomName;
        if (memory.quotaKey) return memory.quotaKey;
        if (memory.role === 'miner' && memory.sourceId) return `miner:${roomName}:${memory.sourceId}`;
        if (memory.role === 'hauler') return `hauler:${roomName}:core`;
        if (memory.role === 'upgrader') return `upgrader:${roomName}:controller`;
        if (memory.role === 'builder') return `builder:${roomName}:construction`;
        if (memory.role === 'repairer') return `repairer:${roomName}:maintenance`;
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
