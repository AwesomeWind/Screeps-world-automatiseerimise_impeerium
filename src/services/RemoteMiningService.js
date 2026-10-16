import BaseService from '../core/BaseService.js';
import EventBus from '../core/EventBus.js';
import BodyBuilder from '../core/BodyBuilder.js';
import { ensureEmpireControl } from '../config/EmpirePolicy.js';
import { currentCreepPopulation } from '../core/CreepPopulation.js';
import { normalizeRemoteConfig, collectRemoteActors, evaluateRemoteState, remoteQuotaKey, estimateRemoteHaulerNeed, collectRemoteIntel } from './RemoteMiningState.js';
import { reserveSpawnGrant, cancelSpawnGrant, recordInfrastructureResult, remoteBudgetStatus, reconcileSpawnExecution } from './RemoteMiningLedger.js';
import { planRemoteRoute } from './RemoteMiningRoute.js';

class RemoteMiningService extends BaseService {
    init() {
        if (!Memory.empire.remoteMining) Memory.empire.remoteMining = { operations: {}, budgets: {} };
        if (!Memory.empire.remoteMining.operations) Memory.empire.remoteMining.operations = {};
        if (!Memory.empire.remoteMining.budgets) Memory.empire.remoteMining.budgets = {};
        global.RemoteMining = {};
        if (!global.SpawnDemands) global.SpawnDemands = {};
    }

    analyze() {
        const control = ensureEmpireControl();
        const policy = control.policy.remoteMining;
        for (const roomName of Object.keys(global.SpawnDemands)) {
            global.SpawnDemands[roomName] = global.SpawnDemands[roomName].filter(demand => demand.owner !== 'remoteMining');
        }
        const configs = { ...(Memory.empire.remoteRooms || {}) };
        for (const operation of Object.values(Memory.empire.remoteMining.operations)) {
            if (!configs[operation.config.targetRoom]) configs[operation.config.targetRoom] = null;
        }
        this.adoptLegacyActors(configs, policy);
        const enabled = Object.values(configs).filter(config => config && config.enabled === true).length;
        for (const [targetRoom, raw] of Object.entries(configs)) {
            let normalized = normalizeRemoteConfig(targetRoom, raw, policy);
            const configInvalid = !normalized.valid;
            if (configInvalid) {
                const previous = Object.values(Memory.empire.remoteMining.operations).find(entry => entry.config.targetRoom === targetRoom);
                if (!previous) continue;
                normalized = { valid: true, config: { ...previous.config, enabled: false } };
            }
            let config = normalized.config;
            let operation = Memory.empire.remoteMining.operations[config.remoteId] ||
                Object.values(Memory.empire.remoteMining.operations).find(entry => entry.config.targetRoom === targetRoom);
            if (!operation) operation = { remoteId: config.remoteId, epoch: 1, config, requests: {}, requestSequence: 0, events: [], ledger: {} };
            Memory.empire.remoteMining.operations[operation.remoteId] = operation;
            operation.config.enabled = config.enabled;
            operation.config.hold = config.hold;
            operation.config.allowContainerBuild = config.allowContainerBuild;
            operation.config.reserveController = config.reserveController;
            if (JSON.stringify(operation.config) !== JSON.stringify(config)) {
                const live = this.hasUnsettledScope(operation.remoteId);
                if (live) operation.pendingConfig = config;
                else {
                    operation.previousEpoch = { remoteId: operation.remoteId, epoch: operation.epoch, ledger: operation.ledger };
                    delete Memory.empire.remoteMining.operations[operation.remoteId];
                    operation.remoteId = config.remoteId;
                    Memory.empire.remoteMining.operations[operation.remoteId] = operation;
                    operation.ledger = {};
                    operation.actorState = {};
                    operation.config = config;
                    operation.epoch++;
                    operation.requests = {};
                    delete operation.pendingConfig;
                }
            } else delete operation.pendingConfig;
            config = operation.config;
            const home = Game.rooms[config.baseRoom];
            const remote = Game.rooms[targetRoom];
            const source = config.sourceId && Game.getObjectById(config.sourceId);
            let container = config.containerId && Game.getObjectById(config.containerId);
            const matchesPosition = target => target && target.pos && config.containerPos && target.pos.roomName === targetRoom && target.pos.x === config.containerPos.x && target.pos.y === config.containerPos.y;
            if (!container && remote) container = remote.find(FIND_STRUCTURES).find(target => target.structureType === STRUCTURE_CONTAINER && matchesPosition(target));
            if (container && (container.structureType !== STRUCTURE_CONTAINER || !matchesPosition(container))) container = null;
            const site = remote && remote.find(FIND_MY_CONSTRUCTION_SITES).find(target => target.structureType === STRUCTURE_CONTAINER && matchesPosition(target));
            const username = home?.controller?.owner?.username;
            operation.lastKnownIntel = collectRemoteIntel(remote, Game.time, operation.lastKnownIntel);
            if (operation.lastKnownIntel?.hostile) operation.lastDangerZones = operation.lastKnownIntel.dangerZones;
            const sinkAvailable = config.homeDeliveryTargetIds.some(id => {
                const target = Game.getObjectById(id);
                return target?.pos?.roomName === config.baseRoom && target.store?.getFreeCapacity(RESOURCE_ENERGY) > 0;
            });
            const facts = { home, remote, source, container, site, username, sinkAvailable,
                configInvalid,
                homeRecovery: global.RoomPhase?.[config.baseRoom]?.recovery,
                controllerEmergencyTicks: control.policy.capabilityControl.controllerEmergencyTicks,
                activeSpawn: Object.values(Game.spawns).some(spawn => spawn.room.name === config.baseRoom && (!spawn.isActive || spawn.isActive())),
                adjacent: Object.values(Game.map?.describeExits?.(config.baseRoom) || {}).includes(targetRoom),
                hostile: !!remote && remote.find(FIND_HOSTILE_CREEPS).length > 0 };
            facts.homeDanger = !!home && home.find(FIND_HOSTILE_CREEPS).length > 0;
            facts.homeHealthy = !!home?.controller?.my && facts.activeSpawn && facts.homeRecovery?.mode === 'normal' &&
                home.controller.ticksToDowngrade >= facts.controllerEmergencyTicks && !facts.homeDanger;
            facts.foreignControl = !!operation.lastKnownIntel && (!!operation.lastKnownIntel.owner ||
                !!operation.lastKnownIntel.reservation && operation.lastKnownIntel.reservation !== username);
            facts.sourceInvalid = !!source && (source.pos.roomName !== targetRoom || !config.containerPos ||
                !source.pos.inRangeTo(config.containerPos, 1) ||
                Game.map.getRoomTerrain(targetRoom).get(config.containerPos.x, config.containerPos.y) === TERRAIN_MASK_WALL);
            facts.entrance = this.entranceFor(config);
            const scoutRoute = facts.entrance && home && planRemoteRoute(
                Object.values(Game.spawns).find(spawn => spawn.room.name === config.baseRoom)?.pos || home.controller.pos,
                facts.entrance, { baseRoom: config.baseRoom, targetRoom, body: [MOVE], range: 0,
                    occupancyMode: 'work_positions',
                    dangerZones: operation.lastDangerZones || [] }, policy, Game.time);
            facts.reconRouteSafe = !!scoutRoute?.valid;
            facts.reconActorExists = currentCreepPopulation().some(entry => entry.state !== 'invalid' &&
                entry.memory.remoteId === config.remoteId && entry.memory.role === 'scout');
            this.consumeInfrastructure(operation);
            const roomBudget = Memory.empire.remoteMining.budgets[config.baseRoom] || {};
            Memory.empire.remoteMining.budgets[config.baseRoom] = roomBudget;
            reconcileSpawnExecution(roomBudget, operation, Game.time);
            facts.budgetStatus = remoteBudgetStatus(roomBudget, policy, Game.time);
            facts.economicRoute = this.validateEconomicRoutes(operation, facts, policy);
            if (facts.economicRoute?.valid) operation.route = {
                ...facts.economicRoute, generatedAt: Game.time,
                sourcePos: { ...source.pos }
            };
            const state = evaluateRemoteState(operation, facts, policy, Game.time);
            if (enabled > 1) {
                state.status = 'suspended'; state.reasons = ['pilot_capacity'];
                state.allowEconomicDeparture = false; state.allowRecon = false;
            }
            if (operation.status !== state.status || JSON.stringify(operation.reasons) !== JSON.stringify(state.reasons)) {
                operation.events.push({ tick: Game.time, epoch: operation.epoch, status: state.status, reasons: state.reasons.slice(0, 8) });
                if (operation.events.length > 20) operation.events.splice(0, operation.events.length - 20);
            }
            Object.assign(operation, { status: state.status, reasons: state.reasons, evaluatedAt: Game.time,
                allowEconomicDeparture: state.allowEconomicDeparture, allowRecon: state.allowRecon });
            operation.containerReady = !!container;
            this.observeActors(operation);
            this.estimateTransport(operation, facts, policy);
            const populationFacts = currentCreepPopulation().map(entry => {
                const actor = Game.creeps[entry.name];
                const outboundTicks = operation.route?.roles?.[entry.memory.role]?.outboundTicks || operation.route?.outboundTicks || 0;
                if (actor && !actor.spawning && actor.ticksToLive <= actor.body.length * CREEP_SPAWN_TIME + outboundTicks + 50) {
                    return { ...entry, state: 'retiring', coversQuota: false };
                }
                return entry;
            });
            const population = collectRemoteActors(populationFacts, config.remoteId, operation.epoch, policy.roleLimits, config);
            global.RemoteMining[config.remoteId] = { operation, config, facts, state, population };
            if (!state.allowEconomicDeparture && !state.allowRecon) {
                this.cancelQueued(config.remoteId);
                continue;
            }
            const desired = state.allowRecon ? { scout: 1 } : { remoteMiner: 1,
                ...(container ? { remoteHauler: operation.transportCapacity?.desiredCount || 1 } : {}),
                ...(config.reserveController ? { reserver: 1 } : {}) };
            for (const [role, count] of Object.entries(desired)) {
                if (population.covered[role] >= count || !population.canAdd(role)) continue;
                const quotaKey = remoteQuotaKey(config, role);
                let request = operation.requests[quotaKey];
                if (!request || request.deadline < Game.time) {
                    request = { requestId: `remote:${config.remoteId}:${operation.epoch}:${++operation.requestSequence}`, deadline: Game.time + 5 };
                    operation.requests[quotaKey] = request;
                }
                const demand = { owner: 'remoteMining', roomName: config.baseRoom, role, quotaKey,
                    maxCount: count, minCount: count, priority: policy.priorities[role],
                    bodyProfile: role === 'remoteMiner' ? 'remote_balanced_miner' : role === 'remoteHauler' ? 'remote_balanced_hauler' : role,
                    maxEnergy: policy.bodyEnergyLimits[role], requestId: request.requestId, deadline: request.deadline,
                    requiresRemoteGrant: true,
                    memory: { role, homeRoom: config.baseRoom, targetRoom, sourceId: config.sourceId,
                        remoteId: config.remoteId, epoch: operation.epoch, quotaKey } };
                const budget = Memory.empire.remoteMining.budgets[config.baseRoom] || {};
                Memory.empire.remoteMining.budgets[config.baseRoom] = budget;
                const granted = reserveSpawnGrant(budget, { ...request, role, quotaKey, remoteId: config.remoteId,
                    epoch: operation.epoch, maxEnergy: demand.maxEnergy }, Game.time, policy);
                if (granted.granted) demand.grantId = granted.grantId;
                else demand.blockedReason = granted.reason;
                if (role === 'scout' && granted.granted && state.allowRecon) operation.lastReconAt = Game.time;
                if (!global.SpawnDemands[config.baseRoom]) global.SpawnDemands[config.baseRoom] = [];
                global.SpawnDemands[config.baseRoom].push(demand);
            }
        }
    }

    cancelQueued(remoteId) {
        EventBus.topics.REQ_SPAWN = (EventBus.topics.REQ_SPAWN || []).filter(event => event.data?.memory?.remoteId !== remoteId);
        for (const budget of Object.values(Memory.empire.remoteMining.budgets)) {
            for (const [id, grant] of Object.entries(budget.grants || {})) {
                if (grant.remoteId === remoteId) cancelSpawnGrant(budget, id, Game.time);
            }
        }
    }

    hasUnsettledScope(remoteId) {
        if (currentCreepPopulation().some(entry => entry.memory.remoteId === remoteId && entry.state !== 'invalid')) return true;
        for (const budget of Object.values(Memory.empire.remoteMining.budgets)) {
            if (Object.values(budget.grants || {}).some(grant => grant.remoteId === remoteId && grant.executing)) return true;
            if (Object.values(budget.infrastructure?.pending || {}).some(attempt => attempt.remoteId === remoteId)) return true;
        }
        for (const room of Object.values(Memory.rooms || {})) {
            const reservations = room.resourceMarket?.reservations;
            if (['supply', 'demand'].some(side => Object.values(reservations?.[side] || {}).filter(Boolean)
                .some(record => Object.values(record.owners || {}).some(owner => owner.context?.remoteId === remoteId)))) return true;
        }
        return false;
    }

    entranceFor(config) {
        const exits = Game.map.describeExits(config.baseRoom) || {};
        const direction = Object.keys(exits).find(key => exits[key] === config.targetRoom);
        const positions = { 1: { x: 25, y: 48 }, 3: { x: 1, y: 25 }, 5: { x: 25, y: 1 }, 7: { x: 48, y: 25 } };
        return positions[direction] ? { ...positions[direction], roomName: config.targetRoom } : null;
    }

    observeActors(operation) {
        const snapshots = operation.actorState || (operation.actorState = {});
        for (const [name, previous] of Object.entries(snapshots)) {
            if (Game.creeps[name]) continue;
            if (previous.carriedEnergy > 0) {
                operation.ledger.carriedLossUnknownUpperBound =
                    (operation.ledger.carriedLossUnknownUpperBound || 0) + previous.carriedEnergy;
            }
            delete snapshots[name];
        }
        for (const creep of Object.values(Game.creeps)) {
            if (creep.memory.remoteId !== operation.remoteId || creep.memory.epoch !== operation.epoch) continue;
            if (!snapshots[creep.name] && Object.keys(snapshots).length >= 16) {
                operation.reasons = [...operation.reasons, 'actor_observation_capacity'].slice(0, 8);
                continue;
            }
            snapshots[creep.name] = { tick: Game.time, carriedEnergy: creep.store.getUsedCapacity(RESOURCE_ENERGY) };
            if (!creep.memory.remoteRetiring && !creep.spawning && Object.values(Game.creeps).some(previous =>
                previous.name !== creep.name && previous.memory.remoteId === operation.remoteId &&
                previous.memory.epoch === operation.epoch && previous.memory.role === creep.memory.role &&
                previous.memory.quotaKey === creep.memory.quotaKey && previous.memory.remoteRetiring)) {
                operation.replacementObserved = true;
            }
        }
    }

    estimateTransport(operation, facts, policy) {
        const config = operation.config;
        const hauler = Object.values(Game.creeps).find(creep => creep.memory.remoteId === operation.remoteId &&
            creep.memory.epoch === operation.epoch && creep.memory.role === 'remoteHauler' && !creep.memory.remoteRetiring);
        const miner = Object.values(Game.creeps).find(creep => creep.memory.remoteId === operation.remoteId &&
            creep.memory.epoch === operation.epoch && creep.memory.role === 'remoteMiner');
        const sink = config.homeDeliveryTargetIds.map(id => Game.getObjectById(id)).find(target => target?.pos?.roomName === config.baseRoom);
        if (!hauler || !miner || !facts.source || !facts.container || !sink) {
            operation.transportCapacity = { desiredCount: 1, known: false, gap: null, reasons: ['throughput_unknown'] };
            return;
        }
        const route = facts.economicRoute;
        if (!route?.valid) {
            operation.transportCapacity = { desiredCount: 1, known: false, gap: null, reasons: ['unsupported_route'] };
            return;
        }
        operation.route = { ...route, generatedAt: Game.time, sourcePos: { ...facts.source.pos }, sinkPos: { ...sink.pos } };
        operation.transportCapacity = estimateRemoteHaulerNeed({
            sourceCapacity: facts.source.energyCapacity, regenTicks: ENERGY_REGEN_TIME,
            minerWork: miner.getActiveBodyparts(WORK), carryCapacity: hauler.store.getCapacity(RESOURCE_ENERGY),
            outboundTicks: route.outboundTicks, inboundTicks: route.inboundTicks,
            handlingTicks: 2, pendingEnergy: facts.container.store.getUsedCapacity(RESOURCE_ENERGY)
        }, policy);
    }

    validateEconomicRoutes(operation, facts, policy) {
        const config = operation.config;
        if (!facts.home || !facts.source || !config.containerPos) return null;
        const sink = config.homeDeliveryTargetIds.map(id => Game.getObjectById(id))
            .find(target => target?.pos?.roomName === config.baseRoom && target.store?.getFreeCapacity(RESOURCE_ENERGY) > 0);
        if (!sink) return null;
        const estimates = {};
        for (const role of ['remoteMiner', 'remoteHauler']) {
            const required = role === 'remoteMiner' ? [WORK, CARRY, MOVE] : [CARRY, MOVE];
            const actor = Object.values(Game.creeps).find(creep => creep.memory.role === role &&
                creep.memory.remoteId === operation.remoteId && creep.memory.epoch === operation.epoch &&
                required.every(part => creep.getActiveBodyparts(part) > 0));
            const body = actor?.body || BodyBuilder.build(role, facts.home, {
                bodyProfile: role === 'remoteMiner' ? 'remote_balanced_miner' : 'remote_balanced_hauler',
                energyCapacity: Math.min(facts.home.energyAvailable, policy.bodyEnergyLimits[role])
            }).body;
            const carryParts = body.filter(part => (typeof part === 'string' ? part : part.type) === CARRY &&
                (typeof part === 'string' || part.hits > 0)).length;
            const routeFacts = { baseRoom: config.baseRoom, targetRoom: config.targetRoom, body,
                dangerZones: facts.remote ? operation.lastKnownIntel?.dangerZones || [] : operation.lastDangerZones || [] };
            const outbound = planRemoteRoute(sink.pos, config.containerPos, {
                ...routeFacts, range: role === 'remoteMiner' ? 0 : 1, loadState: { energy: 0 }
            }, policy, Game.time);
            const inbound = planRemoteRoute(config.containerPos, sink.pos, {
                ...routeFacts, range: 1, loadState: { energy: carryParts * CARRY_CAPACITY }
            }, policy, Game.time);
            if (!outbound.valid || !inbound.valid) return { valid: false, reasons: ['unsupported_route'] };
            estimates[role] = { outboundTicks: outbound.estimatedLegTicks, inboundTicks: inbound.estimatedLegTicks };
        }
        return { valid: true, sinkPos: { ...sink.pos }, outboundTicks: estimates.remoteHauler.outboundTicks,
            inboundTicks: estimates.remoteHauler.inboundTicks, roles: estimates };
    }

    run() {
        for (const scope of Object.values(global.RemoteMining || {})) {
            const { operation, config, facts, state } = scope;
            if (!state.allowEconomicDeparture || facts.container || facts.site || !facts.remote || !config.allowContainerBuild ||
                !config.containerPos || !facts.source || !facts.source.pos.inRangeTo(config.containerPos,1)) continue;
            if (ensureEmpireControl().policy.remoteMining.infrastructureEnergyLimit <= 0) continue;
            if (operation.siteRequest && operation.siteRequest.expiresAt >= Game.time) continue;
            const result = facts.remote.createConstructionSite(config.containerPos.x,config.containerPos.y,STRUCTURE_CONTAINER);
            operation.siteRequest = { result, acceptedAt:Game.time,expiresAt:Game.time+5 };
            if (result !== OK) operation.reasons = [...operation.reasons.filter(reason=>reason!=='container_site_failed'),'container_site_failed'];
        }
    }

    consumeInfrastructure(operation) {
        const budget = Memory.empire.remoteMining.budgets[operation.config.baseRoom];
        if (!budget || !budget.infrastructure) return;
        const attempts = Object.values(budget.infrastructure.pending).sort((a,b)=>a.tick-b.tick);
        for (const pending of attempts) {
            if (pending.tick >= Game.time || pending.remoteId !== operation.remoteId || pending.epoch !== operation.epoch) continue;
            const creep = Game.creeps[pending.creepName];
            let observation = creep && creep.memory.lastActionObservation;
            if (!observation || !observation.context || !observation.before || observation.context.attemptId !== pending.attemptId || observation.tick !== pending.tick) {
                observation = {id:pending.attemptId,tick:pending.tick,before:{},context:{...pending,executionUnknown:true}};
            }
            const target = Game.getObjectById(pending.targetId);
            recordInfrastructureResult(budget,operation.ledger,observation,{
                ownerEnergy:creep && creep.store.getUsedCapacity(RESOURCE_ENERGY),
                targetProgress:target && target.progress,
                targetHits:target && target.hits
            },Game.time);
        }
    }

    adoptLegacyActors(configs, policy) {
        for (const creep of Object.values(Game.creeps)) {
            const memory = creep.memory;
            if (memory.remoteId || !['remoteMiner', 'remoteHauler', 'scout', 'reserver'].includes(memory.role)) continue;
            const matches = Object.entries(configs).map(([room, raw]) => normalizeRemoteConfig(room, raw, policy))
                .filter(entry => entry.valid && entry.config.targetRoom === memory.targetRoom &&
                    (!memory.sourceId || entry.config.sourceId === memory.sourceId));
            if (matches.length !== 1) {
                memory.remoteStatus = 'orphaned_actor';
                continue;
            }
            const config = matches[0].config;
            const existing = Memory.empire.remoteMining.operations[config.remoteId];
            Object.assign(memory, { homeRoom: config.baseRoom, remoteId: config.remoteId,
                epoch: existing ? existing.epoch : 1, quotaKey: remoteQuotaKey(config, memory.role),
                sourceId: config.sourceId });
            delete memory.remoteStatus;
        }
    }
}

export default RemoteMiningService;
