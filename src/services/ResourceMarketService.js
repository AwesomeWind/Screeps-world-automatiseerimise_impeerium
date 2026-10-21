import BaseService from '../core/BaseService.js';
import { reserveForTask, reconcileReservations, availableTargetCapacity, availableSupplyAmount } from './ResourceReservationFeedback.js';
import { getEconomicTrialPermit, checkpointEconomicTrialResolution, applyEconomicTrialResolution } from './RemoteEconomicTrialService.js';
import { recoveryAllowsRequest, recoveryRestricted, controllerEmergency } from './RoomRecoveryPolicy.js';
import EventBus from '../core/EventBus.js';
import TaskTypes from '../core/TaskTypes.js';
import { assignTask } from '../core/TaskMetadata.js';
import { getLogisticsPolicy as getAssetLogisticsPolicy } from '../planning/CityAssetPolicy.js';
import { getControllerContainerAsset, isSourceContainerAsset } from '../planning/CityPlanLegacyAdapter.js';
import { findPlannedStructureAtPos, getPlannedRole, getStructureLifecycle } from '../planning/CityPlanHelpers.js';

const DEFAULT_PRIORITY = 50;
const WAIT_SUPPLY = 'WAIT_SUPPLY';
const RESERVATION_TTL = 5;
const CONTROLLER_BUFFER_TARGET = 1000;
const CONTROLLER_BUFFER_MIN = 200;
const SELF_FETCH_BIAS = 1.2;
const DEMAND_PRIORITY_WEIGHT = 1000000;

function reserveSupplyAmount(market, supply, amount) {
    if (!market) return true;
    const available = availableSupplyAmount(market, supply, { exclusive: true });
    if (!Number.isFinite(amount) || amount <= 0 || amount > available) return false;
    if (!market.reservations) market.reservations = {};
    if (!market.reservations.supply) market.reservations.supply = {};
    market.reservations.supply[supply.id] = {
        amount: amount || supply.amount || 1,
        expiresAt: Game.time + RESERVATION_TTL
    };
    return true;
}

function energySuppliesForRoom(room, market) {
    if (market && market.supplies) {
        return market.supplies.filter((supply) => {
            return supply.resourceType === RESOURCE_ENERGY &&
                supply.kind !== 'carried' &&
                availableSupplyAmount(market, supply) > 0;
        });
    }

    const supplies = [];
    if (room.storage && room.storage.store && room.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        supplies.push({
            id: `storage:${room.storage.id}`,
            kind: 'withdraw',
            targetId: room.storage.id,
            resourceType: RESOURCE_ENERGY,
            amount: room.storage.store.getUsedCapacity(RESOURCE_ENERGY),
            priority: 45
        });
    }

    const structures = room.find ? room.find(FIND_STRUCTURES) : [];
    for (const structure of structures) {
        if (structure.structureType !== STRUCTURE_CONTAINER) continue;
        if (!structure.store || structure.store.getUsedCapacity(RESOURCE_ENERGY) <= 0) continue;
        supplies.push({
            id: `container:${structure.id}`,
            kind: 'withdraw',
            targetId: structure.id,
            resourceType: RESOURCE_ENERGY,
            amount: structure.store.getUsedCapacity(RESOURCE_ENERGY),
            priority: 40
        });
    }

    const dropped = room.find ? room.find(FIND_DROPPED_RESOURCES, {
        filter: (resource) => resource.resourceType === RESOURCE_ENERGY && resource.amount > 0
    }) : [];
    for (const resource of dropped) {
        supplies.push({
            id: `dropped:${resource.id}`,
            kind: 'dropped',
            targetId: resource.id,
            resourceType: RESOURCE_ENERGY,
            amount: resource.amount,
            priority: 60
        });
    }

    return supplies;
}

function supplyScore(creep, supply, market) {
    const target = Game.getObjectById(supply.targetId);
    const distance = target && target.pos && creep.pos && creep.pos.getRangeTo ? creep.pos.getRangeTo(target.pos) : 25;
    const amount = availableSupplyAmount(market, supply);
    const kindBonus = supply.kind === 'dropped' ? 1000 : 0;
    return kindBonus + amount + (supply.priority || 0) * 10 - distance * 5;
}

function pickupTaskFor(creep, supply, market) {
    const free = creep.store.getFreeCapacity ? creep.store.getFreeCapacity(supply.resourceType) : supply.amount;
    const available = availableSupplyAmount(market, supply);
    const amount = Math.min(free || available, available);
    if (!reserveSupplyAmount(market, supply, amount)) return null;

    if (supply.kind === 'dropped') {
        return {
            type: TaskTypes.PICKUP,
            targetId: supply.targetId
        };
    }

    return {
        type: TaskTypes.WITHDRAW,
        targetId: supply.targetId,
        resourceType: supply.resourceType
    };
}

export function planMobileWorkerEnergyTask(creep, options = {}) {
    if (global.ResourceMarketService && global.ResourceMarketService.requestResource) {
        const result = global.ResourceMarketService.requestResource(creep, {
            resourceType: RESOURCE_ENERGY,
            amount: creep.store.getFreeCapacity ? creep.store.getFreeCapacity(RESOURCE_ENERGY) : undefined,
            purpose: options.purpose || 'worker_energy',
            targetId: options.targetId || options.supplyTargetId || creep.id || creep.name,
            targetPos: options.targetPos || null,
            priority: options.priority || 60,
            allowedFulfillment: ['self_fetch', 'delivery']
        });
        if (result && result.mode === 'self_fetch') return result.task;
        if (result && (result.mode === 'delivery' || result.mode === 'unavailable')) {
            return {
                type: WAIT_SUPPLY,
                priority: options.priority || 60,
                purpose: options.purpose || 'worker_energy',
                supplyTargetId: options.supplyTargetId || creep.id || creep.name
            };
        }
        return null;
    }

    const room = creep.room;
    if (!room) return null;

    const roomName = creep.memory.homeRoom || room.name;
    const market = global.ResourceMarket && global.ResourceMarket[roomName];
    const supplies = energySuppliesForRoom(room, market);

    let best = null;
    let bestScore = -Infinity;
    for (const supply of supplies) {
        const score = supplyScore(creep, supply, market);
        if (score > bestScore) {
            best = supply;
            bestScore = score;
        }
    }

    if (best) return pickupTaskFor(creep, best, market);

    if (market && market.supplyMode === 'hauler_supply') {
        return {
            type: WAIT_SUPPLY,
            priority: options.priority || 60,
            purpose: options.purpose || 'worker_energy',
            supplyTargetId: options.supplyTargetId || creep.id || creep.name
        };
    }

    return null;
}

export function planStationaryWorkerEnergyTask(creep, options = {}) {
    const room = creep.room;
    if (!room) return null;

    const stationaryBuffer = options.stationaryBufferTarget || null;
    if (!stationaryBuffer) return planMobileWorkerEnergyTask(creep, options);

    const bufferEnergy = stationaryBuffer.store && stationaryBuffer.store.getUsedCapacity ?
        stationaryBuffer.store.getUsedCapacity(RESOURCE_ENERGY) : 0;
    if (bufferEnergy > 0) {
        return {
            type: TaskTypes.WITHDRAW,
            targetId: stationaryBuffer.id,
            resourceType: RESOURCE_ENERGY
        };
    }

    return planMobileWorkerEnergyTask(creep, {
        ...options,
        supplyTargetId: stationaryBuffer.id,
        targetId: stationaryBuffer.id
    });
}

export function planWorkerEnergyTask(creep, options = {}) {
    if (options.stationaryBufferTarget) {
        return planStationaryWorkerEnergyTask(creep, options);
    }
    return planMobileWorkerEnergyTask(creep, options);
}

class ResourceMarketService extends BaseService {
    constructor(serviceName) {
        super(serviceName);
        this.idleHaulers = [];
        EventBus.subscribe('REQ_RESOURCE', this.handleResourceRequest.bind(this));
        global.ResourceMarketService = this;
    }

    init() {
        global.ResourceMarket = {};
        this.idleHaulers = [];
        global.ResourceMarketService = this;

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role === 'hauler' && !creep.memory.task) {
                this.idleHaulers.push(creep);
            }
        }
    }

    analyze() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            const savedMarket = Memory.rooms && Memory.rooms[roomName] && Memory.rooms[roomName].resourceMarket;
            const feedbackStats = {};
            if (savedMarket && savedMarket.reservations) {
                if (!savedMarket.feedbackTotals) savedMarket.feedbackTotals = {};
                this.consumeRemoteResolutions(reconcileReservations(savedMarket.reservations, feedbackStats, savedMarket.feedbackTotals, checkpointEconomicTrialResolution));
            }
            this.buildRoomMarket(room);
            Object.assign(global.ResourceMarket[roomName].stats, feedbackStats);
            this.persistMarket(roomName, global.ResourceMarket[roomName]);
        }
    }

    cleanup() {
        for (const roomName in (global.ResourceMarket || {})) {
            const market = this.ensureMarketShape(global.ResourceMarket[roomName], roomName);
            this.consumeRemoteResolutions(reconcileReservations(market.reservations, market.stats, market.feedbackTotals, checkpointEconomicTrialResolution));
            this.pruneReservations(market.reservations);
            this.captureMarketStats(market);
            this.persistMarket(roomName, market);
        }
    }

    consumeRemoteResolutions(resolutions) {
        for (const resolution of resolutions) {
            const context = resolution.context;
            const operation = context && Memory.empire.remoteMining && Memory.empire.remoteMining.operations[context.remoteId];
            if (!operation) continue;
            applyEconomicTrialResolution(resolution, operation);
        }
    }

    createRemotePickupTask(creep, context) {
        return this.createScopedRemoteTask(creep,context,'pickup');
    }

    createRemoteHomeDeliveryTask(creep, context) {
        return this.createScopedRemoteTask(creep,context,'home_delivery');
    }

    createScopedRemoteTask(creep, context, leg) {
        const scope = context && global.RemoteMining && global.RemoteMining[context.remoteId];
        if (!scope || creep.memory.role !== 'remoteHauler' || creep.memory.remoteId !== context.remoteId ||
            creep.memory.epoch !== context.epoch || context.epoch !== scope.operation.epoch || typeof context.tripId !== 'string') return null;
        if (creep.memory.homeRoom !== scope.config.baseRoom || creep.memory.targetRoom !== scope.config.targetRoom ||
            creep.memory.sourceId !== scope.config.sourceId) return null;
        const receipts = scope.operation.ledger.settlementReceipts || {};
        for (const [name, receipt] of Object.entries(receipts)) {
            if (!Game.creeps[name] && Game.time - receipt.assignedAt > 50) delete receipts[name];
        }
        if (!receipts[creep.name] && Object.keys(receipts).length >= 16) return null;
        if (leg === 'pickup' && !scope.state.allowEconomicDeparture) return null;
        const target = leg === 'pickup' ? scope.facts.container : Game.getObjectById(context.targetId);
        if (!target || !target.pos || !target.store || !creep.pos.inRangeTo(target.pos,1)) return null;
        if (leg === 'home_delivery' && (!scope.config.homeDeliveryTargetIds.includes(target.id) || target.pos.roomName !== scope.config.baseRoom ||
            ![STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_CONTAINER].includes(target.structureType) ||
            target.structureType !== STRUCTURE_CONTAINER && target.my !== true)) return null;
        const market = global.ResourceMarket && global.ResourceMarket[scope.config.baseRoom];
        if (!market) return null;
        const owners = ['supply','demand'].flatMap(side=>Object.values(market.reservations[side] || {}).filter(Boolean).flatMap(record=>Object.values(record.owners || {})));
        if (owners.some(owner=>owner.creepName === creep.name)) return null;
        const side = leg === 'pickup' ? 'supply' : 'demand';
        const id = `remote:${scope.config.remoteId}:${leg}:${target.id}`;
        const reserved = market.reservations[side][id];
        if (side === 'supply' && reserved && reserved.expiresAt >= Game.time) return null;
        const quantity = side === 'supply' ? target.store.getUsedCapacity(RESOURCE_ENERGY) : availableTargetCapacity(market, target, RESOURCE_ENERGY);
        const actorQuantity = side === 'supply' ? creep.store.getFreeCapacity(RESOURCE_ENERGY) : creep.store.getUsedCapacity(RESOURCE_ENERGY);
        const amount = Math.min(quantity,actorQuantity,context.amount === undefined ? actorQuantity : context.amount);
        if (!Number.isFinite(amount) || amount <= 0) return null;
        const task = {type:side === 'supply'?TaskTypes.WITHDRAW:TaskTypes.TRANSFER,targetId:target.id,resourceType:RESOURCE_ENERGY,amount};
        const economic = getEconomicTrialPermit({ remoteId: context.remoteId, epoch: context.epoch });
        if (economic.managed || creep.memory.economicTrialId) {
            const guard = global.RemoteEconomicTrial;
            if (guard?.evaluatedAt !== Game.time || !guard.service?.taskPermission(creep, task, false).allowed) return null;
            context = { ...context, ...Memory.empire.remoteMining.economicTrials.current.identity };
        }
        if (!reserveForTask(market,side,{id,resourceType:RESOURCE_ENERGY},amount,creep,task,{...context,leg})) return null;
        this.persistMarket(scope.config.baseRoom,market);
        return task;
    }

    buildRoomMarket(room) {
        const reservations = this.loadReservations(room.name);
        const market = {
            roomName: room.name,
            supplies: [],
            demands: [],
            reservations,
            logistics: this.estimateLogistics(room.name),
            supplyMode: 'self_supply',
            stats: this.createEmptyStats()
        };
        const savedMarket = Memory.rooms && Memory.rooms[room.name] && Memory.rooms[room.name].resourceMarket;
        market.feedbackTotals = savedMarket && savedMarket.feedbackTotals ? savedMarket.feedbackTotals : {};
        const roomPhase = global.RoomPhase && global.RoomPhase[room.name];
        if (roomPhase && roomPhase.logisticsMode) {
            market.supplyMode = roomPhase.logisticsMode === 'hauler' ? 'hauler_supply' : 'self_supply';
        } else {
            market.supplyMode = market.logistics.haulerThroughput >= market.logistics.workDemand * 1.2 ? 'hauler_supply' : 'self_supply';
        }
        global.ResourceMarket[room.name] = market;

        this.scanDroppedResources(room, market);
        this.scanStructures(room, market);
        this.scanCreepStores(room, market);
        this.scanEconomyEnergyDemands(room, market);
        this.scanControllerBufferDemands(room, market);
        this.captureMarketStats(market);
        this.persistMarket(room.name, market);
    }

    requestResource(creep, request = {}) {
        const room = creep.room;
        if (!room) return null;
        if (!recoveryAllowsRequest(creep, request)) return { mode: 'unavailable', reason: 'recovery_limited' };

        const roomName = creep.memory.homeRoom || room.name;
        if (!global.ResourceMarket) global.ResourceMarket = {};
        if (!global.ResourceMarket[roomName]) this.buildRoomMarket(room);
        else {
            const existing = global.ResourceMarket[roomName];
            if (!existing.supplies || existing.supplies.length === 0) this.buildRoomMarket(room);
        }

        const market = this.ensureMarketShape(global.ResourceMarket[roomName] || this.createTransientMarket(roomName), roomName);
        global.ResourceMarket[roomName] = market;
        this.pruneReservations(market.reservations);

        const normalized = this.normalizeRequest(creep, request, roomName);
        const bestSelfFetch = this.findBestSelfFetch(creep, market, normalized);
        const bestDelivery = this.findBestDelivery(creep, market, normalized);

        if (bestSelfFetch && (!bestDelivery || bestSelfFetch.cost <= bestDelivery.cost * SELF_FETCH_BIAS)) {
            const task = this.createSelfFetchTask(creep, market, bestSelfFetch.supply, normalized);
            if (task) {
                market.stats.selfFetchSelected++;
                this.captureMarketStats(market);
                this.persistMarket(roomName, market);
                return { mode: 'self_fetch', reason: 'self_fetch_selected', task };
            }
        }

        const demand = this.registerResourceDemand(market, normalized);
        if (bestDelivery) {
            market.stats.deliverySelected++;
            this.assignDeliveryExecutor(roomName, bestDelivery);
            this.captureMarketStats(market);
            this.persistMarket(roomName, market);
            return { mode: 'delivery', reason: 'delivery_selected', demandId: demand.id };
        }

        market.stats.unavailableRequests++;
        this.captureMarketStats(market);
        this.persistMarket(roomName, market);
        return { mode: 'unavailable', reason: this.unavailableReason(market, normalized) };
    }

    handleResourceRequest(event) {
        const data = event.data || {};
        const roomName = data.roomName || this.getRoomNameFromTarget(data.targetId);
        if (!roomName) return true;

        if (!global.ResourceMarket || !global.ResourceMarket[roomName]) {
            const room = Game.rooms[roomName];
            if (room) this.buildRoomMarket(room);
        }

        const market = global.ResourceMarket && global.ResourceMarket[roomName] ?
            this.ensureMarketShape(global.ResourceMarket[roomName], roomName) :
            null;
        if (!market) return true;

        if (data.action === 'supply') {
            market.supplies.push(this.createEventSupply(data, roomName));
        } else {
            this.upsertDemand(market, this.createEventDemand(data, roomName, event.priority));
        }

        this.assignIdleHaulersForRoom(roomName);

        return true;
    }

    assignDeliveryExecutor(roomName, delivery) {
        if (delivery && delivery.hauler && !delivery.hauler.memory.task) {
            this.assignHauler(delivery.hauler);
            return;
        }
        this.assignIdleHaulersForRoom(roomName);
    }

    assignIdleHaulersForRoom(roomName) {
        for (const hauler of this.idleHaulers.slice()) {
            const haulerRoomName = hauler.memory.homeRoom || (hauler.room && hauler.room.name);
            if (!hauler.memory.task && haulerRoomName === roomName) this.assignHauler(hauler);
        }
    }

    assignHauler(creep) {
        const roomName = creep.memory.homeRoom || creep.room.name;
        if (!global.ResourceMarket) global.ResourceMarket = {};
        if (!global.ResourceMarket[roomName] && Game.rooms[roomName]) this.buildRoomMarket(Game.rooms[roomName]);
        if (!global.ResourceMarket[roomName]) return false;
        const market = this.ensureMarketShape(global.ResourceMarket[roomName], roomName);
        global.ResourceMarket[roomName] = market;
        this.pruneReservations(market.reservations);

        const carriedResources = this.getStoredResourceTypes(creep.store)
            .filter((resourceType) => creep.store.getUsedCapacity(resourceType) > 0);
        if (carriedResources.length > 0) {
            const task = this.createTransferTask(creep, market, carriedResources);
            if (task) {
                assignTask(creep, task);
                this.removeIdleHauler(creep);
                market.stats.haulerAssignments++;
                this.captureMarketStats(market);
                this.persistMarket(roomName, market);
                return true;
            }

            const pickupTask = this.createTopOffPickupTask(creep, market, carriedResources);
            if (pickupTask) {
                assignTask(creep, pickupTask);
                this.removeIdleHauler(creep);
                market.stats.haulerAssignments++;
                this.captureMarketStats(market);
                this.persistMarket(roomName, market);
                return true;
            }
        }

        if (creep.store.getFreeCapacity && creep.store.getFreeCapacity() <= 0) return false;

        const task = this.createPickupTask(creep, market);
        if (!task) {
            market.stats.idleHaulers++;
            this.captureMarketStats(market);
            this.persistMarket(roomName, market);
            return false;
        }

        assignTask(creep, task);
        this.removeIdleHauler(creep);
        market.stats.haulerAssignments++;
        this.captureMarketStats(market);
        this.persistMarket(roomName, market);
        return true;
    }

    createTransferTask(creep, market, carriedResources) {
        const demand = this.findBestDemand(creep, market, carriedResources);
        if (!demand) return this.createFallbackStorageTask(creep, market, carriedResources);
        const amount = Math.min(
            creep.store.getUsedCapacity(demand.resourceType),
            this.getAvailableDemandAmount(market, demand)
        );
        const task = {
            type: TaskTypes.TRANSFER,
            targetId: demand.targetId,
            resourceType: demand.resourceType
        };
        if (this.shouldLimitTransferAmount(demand) || amount < creep.store.getUsedCapacity(demand.resourceType)) task.amount = amount;
        if (!reserveForTask(market, 'demand', demand, amount, creep, task)) return null;
        return task;
    }

    createFallbackStorageTask(creep, market, carriedResources) {
        const room = Game.rooms[market.roomName];
        if (!room) return null;

        for (const resourceType of carriedResources) {
            const target = this.findFallbackStoreTarget(room, resourceType, market);
            if (target) {
                const amount = Math.min(creep.store.getUsedCapacity(resourceType), availableTargetCapacity(market, target, resourceType));
                const task = {
                    type: TaskTypes.TRANSFER,
                    targetId: target.id,
                    resourceType
                };
                if (amount < creep.store.getUsedCapacity(resourceType)) task.amount = amount;
                if (!reserveForTask(market, 'demand', { id: `fallback-demand:${target.id}:${resourceType}`, resourceType }, amount, creep, task)) continue;
                market.stats.fallbackStoreAssignments++;
                return task;
            }
        }

        return null;
    }

    findFallbackStoreTarget(room, resourceType, market) {
        const primary = resourceType === RESOURCE_ENERGY ? [room.storage, room.terminal] : [room.terminal, room.storage];
        for (const target of primary) {
            if (this.canStoreResource(target, resourceType) && (!market || availableTargetCapacity(market, target, resourceType) > 0)) return target;
        }

        const containers = room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_CONTAINER && this.canStoreResource(structure, resourceType) &&
                    (!market || availableTargetCapacity(market, structure, resourceType) > 0);
            }
        });
        return containers[0] || null;
    }

    canStoreResource(target, resourceType) {
        return target &&
            target.store &&
            target.store.getFreeCapacity &&
            target.store.getFreeCapacity(resourceType) > 0;
    }

    createPickupTask(creep, market) {
        const demandTask = this.createDemandPickupTask(creep, market);
        if (demandTask) return demandTask;

        const supply = this.findBestSupply(creep, market, undefined, { forHauler: true });
        if (!supply) return null;
        const amount = this.getPickupAmount(creep, supply, market);
        const task = supply.kind === 'dropped' ? { type: TaskTypes.PICKUP, targetId: supply.targetId } : {
            type: TaskTypes.WITHDRAW,
            targetId: supply.targetId,
            resourceType: supply.resourceType,
            amount: amount || undefined
        };
        return reserveForTask(market, 'supply', supply, amount, creep, task) ? task : null;
    }

    createTopOffPickupTask(creep, market, carriedResources) {
        if (!creep.store.getFreeCapacity || creep.store.getFreeCapacity() <= 0) return null;

        let best = null;
        let bestScore = -Infinity;
        for (const demand of market.demands) {
            if (carriedResources.indexOf(demand.resourceType) === -1) continue;
            const carriedAmount = creep.store.getUsedCapacity(demand.resourceType);
            const availableDemand = this.getAvailableDemandAmount(market, demand);
            if (!this.shouldContinueLoadingForDemand(demand, carriedAmount, availableDemand)) continue;

            const supply = this.findBestSupplyForDemand(creep, market, demand);
            if (!supply) continue;
            const target = Game.getObjectById(demand.targetId);
            const distance = target && target.pos && creep.pos && creep.pos.getRangeTo ? creep.pos.getRangeTo(target.pos) : 25;
            const score = this.demandScore(demand, availableDemand, distance);
            if (score > bestScore) {
                best = { demand, supply };
                bestScore = score;
            }
        }

        return best ? this.createPickupTaskForDemand(creep, market, best.supply, best.demand) : null;
    }

    createDemandPickupTask(creep, market) {
        let best = null;
        let bestScore = -Infinity;
        for (const demand of market.demands) {
            const availableDemand = this.getAvailableDemandAmount(market, demand);
            if (availableDemand <= 0) continue;

            const supply = this.findBestSupplyForDemand(creep, market, demand);
            if (!supply) continue;
            const target = Game.getObjectById(demand.targetId);
            const distance = target && target.pos && creep.pos && creep.pos.getRangeTo ? creep.pos.getRangeTo(target.pos) : 25;
            const score = this.demandScore(demand, availableDemand, distance);
            if (score > bestScore) {
                best = { demand, supply };
                bestScore = score;
            }
        }

        return best ? this.createPickupTaskForDemand(creep, market, best.supply, best.demand) : null;
    }

    createPickupTaskForDemand(creep, market, supply, demand) {
        const amount = this.getPickupAmountForDemand(creep, supply, demand, market);
        const task = supply.kind === 'dropped' ? { type: TaskTypes.PICKUP, targetId: supply.targetId } : {
            type: TaskTypes.WITHDRAW,
            targetId: supply.targetId,
            resourceType: supply.resourceType,
            amount: amount || undefined
        };
        return reserveForTask(market, 'supply', supply, amount, creep, task) ? task : null;
    }

    normalizeRequest(creep, request, roomName) {
        return {
            roomName,
            requesterId: creep.id || creep.name,
            resourceType: request.resourceType || RESOURCE_ENERGY,
            amount: request.amount || (creep.store && creep.store.getFreeCapacity ? creep.store.getFreeCapacity(request.resourceType || RESOURCE_ENERGY) : 50),
            priority: request.priority || DEFAULT_PRIORITY,
            purpose: request.purpose || 'resource_request',
            targetId: request.targetId || creep.id || creep.name,
            targetPos: request.targetPos || (creep.pos ? { x: creep.pos.x, y: creep.pos.y, roomName: creep.pos.roomName } : null),
            allowedFulfillment: request.allowedFulfillment || ['self_fetch', 'delivery']
        };
    }

    createTransientMarket(roomName) {
        return {
            roomName,
            supplies: [],
            demands: [],
            reservations: { supply: {}, demand: {} },
            logistics: { haulerThroughput: 0, workDemand: 0 },
            supplyMode: 'self_supply'
        };
    }

    ensureMarketShape(market, roomName) {
        const shaped = market || {};
        shaped.roomName = shaped.roomName || roomName;
        shaped.supplies = shaped.supplies || [];
        shaped.demands = shaped.demands || [];
        shaped.reservations = shaped.reservations || { supply: {}, demand: {} };
        if (!shaped.reservations.supply) shaped.reservations.supply = {};
        if (!shaped.reservations.demand) shaped.reservations.demand = {};
        shaped.logistics = shaped.logistics || { haulerThroughput: 0, workDemand: 0 };
        shaped.supplyMode = shaped.supplyMode || 'self_supply';
        shaped.stats = shaped.stats || this.createEmptyStats();
        shaped.feedbackTotals = shaped.feedbackTotals || {};
        return shaped;
    }

    createEmptyStats() {
        return {
            supplyCount: 0,
            demandCount: 0,
            reservedSupplyCount: 0,
            reservedDemandCount: 0,
            selfFetchSelected: 0,
            deliverySelected: 0,
            unavailableRequests: 0,
            haulerAssignments: 0,
            fallbackStoreAssignments: 0,
            idleHaulers: 0
        };
    }

    captureMarketStats(market) {
        market.stats.supplyCount = market.supplies.length;
        market.stats.demandCount = market.demands.length;
        market.stats.reservedSupplyCount = Object.keys(market.reservations.supply).length;
        market.stats.reservedDemandCount = Object.keys(market.reservations.demand).length;
        const owners = ['supply', 'demand'].flatMap(side => Object.values(market.reservations[side]).flatMap(record => Object.values(record.owners || {})));
        market.stats.ownedReservationCount = owners.length;
        market.stats.awaitingConfirmationCount = owners.filter(owner => owner.status === 'awaiting_confirmation').length;
    }

    findBestSelfFetch(creep, market, request) {
        if (request.allowedFulfillment.indexOf('self_fetch') === -1) return null;

        let best = null;
        for (const supply of market.supplies || []) {
            if (supply.resourceType !== request.resourceType || supply.kind === 'carried') continue;
            const available = this.getAvailableSupplyAmount(market, supply);
            if (available <= 0) continue;

            const supplyTarget = Game.getObjectById(supply.targetId);
            const requesterDistance = this.rangeBetween(creep.pos, supplyTarget && supplyTarget.pos);
            const workDistance = this.rangeBetween(supplyTarget && supplyTarget.pos, request.targetPos);
            const opportunityPenalty = request.purpose === 'build' || request.purpose === 'repair' || request.purpose === 'upgrade' ? 2 : 0;
            const kindBias = supply.kind === 'dropped' ? -3 : 0;
            const cost = requesterDistance + workDistance + opportunityPenalty + kindBias;

            if (!Number.isFinite(cost)) continue;
            if (!best || cost < best.cost) best = { supply, cost };
        }

        return best;
    }

    findBestDelivery(creep, market, request) {
        if (request.allowedFulfillment.indexOf('delivery') === -1) return null;

        let best = null;
        for (const name in Game.creeps) {
            const hauler = Game.creeps[name];
            if (!hauler.memory || hauler.memory.role !== 'hauler') continue;
            if ((hauler.memory.homeRoom || (hauler.room && hauler.room.name)) !== request.roomName) continue;
            if (hauler.memory.task) continue;

            const carriedAmount = hauler.store && hauler.store.getUsedCapacity ? hauler.store.getUsedCapacity(request.resourceType) : 0;
            if (carriedAmount > 0) {
                const requesterDistance = this.rangeBetween(hauler.pos, creep.pos);
                const waitPenalty = 4;
                const cost = requesterDistance + waitPenalty;
                if (!Number.isFinite(cost)) continue;
                if (!best || cost < best.cost) best = { type: 'carried', hauler, cost };
                continue;
            }

            const pickup = this.findBestSupply(hauler, market, request.resourceType);
            if (!pickup) continue;

            const pickupTarget = Game.getObjectById(pickup.targetId);
            const pickupDistance = this.rangeBetween(hauler.pos, pickupTarget && pickupTarget.pos);
            const requesterDistance = this.rangeBetween(pickupTarget && pickupTarget.pos, creep.pos);
            const waitPenalty = 6;
            const cost = pickupDistance + requesterDistance + waitPenalty;
            if (!Number.isFinite(cost)) continue;
            if (!best || cost < best.cost) best = { type: 'pickup', hauler, supply: pickup, cost };
        }

        return best;
    }

    createSelfFetchTask(creep, market, supply, request) {
        const available = this.getAvailableSupplyAmount(market, supply);
        const free = creep.store.getFreeCapacity ? creep.store.getFreeCapacity(request.resourceType) : request.amount;
        const amount = Math.min(request.amount || free || available, free || available, available);
        const task = supply.kind === 'dropped' ? { type: TaskTypes.PICKUP, targetId: supply.targetId } : {
            type: TaskTypes.WITHDRAW, targetId: supply.targetId, resourceType: supply.resourceType
        };
        if (!reserveForTask(market, 'supply', supply, amount, creep, task)) return null;
        this.captureMarketStats(market);
        this.persistMarket(request.roomName, market);

        return task;
    }

    registerResourceDemand(market, request) {
        const demand = this.createStateDemand({
            id: `worker-demand:${request.targetId}:${request.resourceType}:${request.purpose}`,
            roomName: request.roomName,
            targetId: request.targetId,
            resourceType: request.resourceType,
            currentAmount: 0,
            minAmount: 0,
            targetAmount: request.amount || 0,
            priority: request.priority || DEFAULT_PRIORITY,
            purpose: request.purpose,
            demandType: 'worker',
            deliveryMode: 'haul',
            producer: 'request_resource'
        });
        this.upsertDemand(market, demand);
        this.captureMarketStats(market);
        return market.demands.find((entry) => this.sameDemand(entry, demand)) || demand;
    }

    unavailableReason(market, request) {
        const matchingSupplies = (market.supplies || []).filter((supply) => {
            return supply.resourceType === request.resourceType && supply.kind !== 'carried';
        });
        if (matchingSupplies.length === 0) return 'no_supply';

        const hasReservedSupply = matchingSupplies.some((supply) => {
            return this.getAvailableSupplyAmount(market, supply) <= 0;
        });
        if (hasReservedSupply) return 'reserved_supply';
        return 'no_delivery_executor';
    }

    shouldLimitTransferAmount(demand) {
        return demand.purpose !== 'economy_energy' && demand.purpose !== 'storage_balance';
    }

    findBestSupply(creep, market, resourceType, options = {}) {
        let best = null;
        let bestScore = -Infinity;

        for (const supply of market.supplies) {
            if (resourceType && supply.resourceType !== resourceType) continue;
            if (supply.kind === 'carried') continue;
            const available = this.getAvailableSupplyAmount(market, supply);
            if (available <= 0) continue;
            if (options.forHauler && !this.shouldHaulerPickupSupply(market, supply)) continue;
            const target = Game.getObjectById(supply.targetId);
            const distance = target && target.pos && creep.pos && creep.pos.getRangeTo ? creep.pos.getRangeTo(target.pos) : 25;
            const kindBonus = supply.kind === 'dropped' ? 1000 : 0;
            const score = kindBonus + available + supply.priority * 10 - distance * 5;
            if (score > bestScore) {
                best = supply;
                bestScore = score;
            }
        }

        return best;
    }

    findBestSupplyForDemand(creep, market, demand) {
        let best = null;
        let bestScore = -Infinity;
        for (const supply of market.supplies) {
            if (supply.resourceType !== demand.resourceType) continue;
            if (supply.kind === 'carried') continue;
            if (supply.targetId === demand.targetId) continue;
            if (!this.canUseSupplyForDemand(market, supply, demand)) continue;
            const available = this.getAvailableSupplyAmount(market, supply);
            if (available <= 0) continue;
            const target = Game.getObjectById(supply.targetId);
            const distance = target && target.pos && creep.pos && creep.pos.getRangeTo ? creep.pos.getRangeTo(target.pos) : 25;
            const kindBonus = supply.kind === 'dropped' ? 1000 : 0;
            const score = kindBonus + Math.min(available, 5000) + supply.priority * 10 - distance * 5;
            if (score > bestScore) {
                best = supply;
                bestScore = score;
            }
        }
        return best;
    }

    shouldHaulerPickupSupply(market, supply) {
        if (supply.kind === 'dropped') return true;
        if (supply.id && supply.id.startsWith('event-supply:')) return true;
        return this.marketHasAllowedDemandForSupply(market, supply);
    }

    marketHasDemandFor(market, resourceType) {
        return (market.demands || []).some((demand) => {
            return demand.resourceType === resourceType && this.getAvailableDemandAmount(market, demand) > 0;
        });
    }

    marketHasAllowedDemandForSupply(market, supply) {
        return (market.demands || []).some((demand) => {
            return demand.resourceType === supply.resourceType &&
                this.getAvailableDemandAmount(market, demand) > 0 &&
                demand.targetId !== supply.targetId &&
                this.canUseSupplyForDemand(market, supply, demand);
        });
    }

    canUseSupplyForDemand(market, supply, demand) {
        if (!supply || !demand || supply.resourceType !== demand.resourceType) return false;
        if (!this.isStorageEnergySupply(market, supply)) return true;
        if (demand.purpose !== 'economy_energy') return true;
        const roomPhase = global.RoomPhase && global.RoomPhase[market.roomName];
        return !!(roomPhase && (roomPhase.storageRescueActive || (roomPhase.recovery && ['miner_gap', 'hauler_gap', 'spawn_energy', 'support_required'].includes(roomPhase.recovery.mode))));
    }

    isStorageEnergySupply(market, supply) {
        if (!supply || supply.resourceType !== RESOURCE_ENERGY) return false;
        const room = Game.rooms && Game.rooms[market.roomName];
        return !!(room && room.storage && supply.targetId === room.storage.id);
    }

    findBestDemand(creep, market, carriedResources) {
        let best = null;
        let bestScore = -Infinity;

        for (const demand of market.demands) {
            if (carriedResources.indexOf(demand.resourceType) === -1) continue;
            const available = this.getAvailableDemandAmount(market, demand);
            if (available <= 0) continue;
            const target = Game.getObjectById(demand.targetId);
            const distance = target && target.pos && creep.pos && creep.pos.getRangeTo ? creep.pos.getRangeTo(target.pos) : 25;
            const score = this.demandScore(demand, available, distance);
            if (score > bestScore) {
                best = demand;
                bestScore = score;
            }
        }

        return best;
    }

    scanDroppedResources(room, market) {
        const dropped = room.find(FIND_DROPPED_RESOURCES);
        for (const resource of dropped) {
            if (resource.amount <= 0) continue;
            market.supplies.push({
                id: `supply:${resource.id}:${resource.resourceType}`,
                roomName: room.name,
                kind: 'dropped',
                targetId: resource.id,
                resourceType: resource.resourceType,
                amount: resource.amount,
                priority: resource.resourceType === RESOURCE_ENERGY ? 60 : 75
            });
        }
    }

    scanStructures(room, market) {
        const structures = room.find(FIND_STRUCTURES);
        for (const structure of structures) {
            if (!structure.store) continue;
            if (this.isSupplyStructure(structure) &&
                !this.isControllerContainer(room, structure) &&
                !this.shouldSkipSourceContainerSupply(room, structure)) {
                this.addStoreSupplies(room.name, market, structure);
            }
            if (this.isDemandStructure(structure)) this.addStoreDemand(room.name, market, structure);
        }
    }

    scanCreepStores(room, market) {
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (!creep.room || creep.room.name !== room.name || !creep.store) continue;
            for (const resourceType of this.getStoredResourceTypes(creep.store)) {
                const amount = creep.store.getUsedCapacity(resourceType);
                if (amount <= 0) continue;
                market.supplies.push({
                    id: `supply:${creep.name}:${resourceType}`,
                    roomName: room.name,
                    kind: 'carried',
                    targetId: creep.id || creep.name,
                    resourceType,
                    amount,
                    priority: 40
                });
            }
        }
    }

    scanWorkerEnergyDemands(room, market) {
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (!creep.room || creep.room.name !== room.name) continue;
            if (!creep.memory || creep.memory.task) continue;
            if (!creep.store || creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) continue;

            if (creep.memory.role === 'builder' || creep.memory.role === 'repairer') {
                const plan = planMobileWorkerEnergyTask(creep, {
                    purpose: `${creep.memory.role}_work`,
                    priority: 60,
                    supplyTargetId: creep.id || creep.name
                });
                if (plan && plan.type === WAIT_SUPPLY) {
                    market.demands.push(this.createStateDemand({
                        id: `worker-demand:${creep.id || creep.name}:${RESOURCE_ENERGY}`,
                        roomName: room.name,
                        targetId: creep.id || creep.name,
                        resourceType: RESOURCE_ENERGY,
                        currentAmount: 0,
                        minAmount: 0,
                        targetAmount: creep.store.getFreeCapacity ? creep.store.getFreeCapacity(RESOURCE_ENERGY) : 50,
                        priority: plan.priority || 60,
                        purpose: plan.purpose || `${creep.memory.role}_work`,
                        demandType: 'worker',
                        deliveryMode: 'haul',
                        producer: 'worker_energy'
                    }));
                }
                continue;
            }

            if (creep.memory.role === 'upgrader') {
                const controllerContainer = this.findControllerContainer(room);
                const plan = planWorkerEnergyTask(creep, {
                    priority: 55,
                    purpose: 'upgrader_work',
                    stationaryBufferTarget: controllerContainer,
                    supplyTargetId: (controllerContainer && controllerContainer.id) || creep.id || creep.name
                });
                if (plan && plan.type === WAIT_SUPPLY && !controllerContainer) {
                    market.demands.push(this.createStateDemand({
                        id: `worker-demand:${creep.id || creep.name}:${RESOURCE_ENERGY}`,
                        roomName: room.name,
                        targetId: creep.id || creep.name,
                        resourceType: RESOURCE_ENERGY,
                        currentAmount: 0,
                        minAmount: 0,
                        targetAmount: creep.store.getFreeCapacity ? creep.store.getFreeCapacity(RESOURCE_ENERGY) : 50,
                        priority: plan.priority || 55,
                        purpose: plan.purpose || 'upgrader_work',
                        demandType: 'worker',
                        deliveryMode: 'haul',
                        producer: 'worker_energy'
                    }));
                }
            }
        }
    }

    scanEconomyEnergyDemands(room, market) {
        const targets = room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType === STRUCTURE_SPAWN ||
                    structure.structureType === STRUCTURE_EXTENSION ||
                    structure.structureType === STRUCTURE_TOWER) &&
                    structure.store &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
        });

        for (const structure of targets) {
            const currentAmount = structure.store.getUsedCapacity(RESOURCE_ENERGY);
            const targetAmount = currentAmount + structure.store.getFreeCapacity(RESOURCE_ENERGY);
            market.demands.push(this.createStateDemand({
                id: `demand:${structure.id}:${RESOURCE_ENERGY}`,
                roomName: room.name,
                targetId: structure.id,
                resourceType: RESOURCE_ENERGY,
                currentAmount,
                minAmount: 0,
                targetAmount,
                priority: structure.structureType === STRUCTURE_TOWER ? 95 : 100,
                purpose: 'economy_energy',
                demandType: 'pull',
                deliveryMode: 'haul',
                producer: 'economy_energy'
            }));
        }
    }

    scanControllerBufferDemands(room, market) {
        if (recoveryRestricted(room.name) && !controllerEmergency(room)) return;
        const container = this.findControllerContainer(room);
        if (!container || !container.store || !container.store.getUsedCapacity) return;
        const logisticsPolicy = this.getLogisticsPolicy(room, container);
        if (!logisticsPolicy.shouldDemand || logisticsPolicy.demandMode !== 'buffer') return;

        const currentAmount = container.store.getUsedCapacity(RESOURCE_ENERGY);
        if (currentAmount >= CONTROLLER_BUFFER_TARGET) return;

        market.demands.push(this.createStateDemand({
            id: `demand:${container.id}:${RESOURCE_ENERGY}:controller_buffer`,
            roomName: room.name,
            targetId: container.id,
            resourceType: RESOURCE_ENERGY,
            currentAmount,
            minAmount: CONTROLLER_BUFFER_MIN,
            targetAmount: CONTROLLER_BUFFER_TARGET,
            priority: logisticsPolicy.demandPriority || (currentAmount < CONTROLLER_BUFFER_MIN ? 85 : 55),
            purpose: 'controller_buffer',
            demandType: 'buffer',
            deliveryMode: 'haul',
            producer: 'controller_buffer'
        }));
    }

    addStoreSupplies(roomName, market, structure) {
        const room = Game.rooms && Game.rooms[roomName];
        const logisticsPolicy = this.getLogisticsPolicy(room, structure);
        for (const resourceType of this.getStoredResourceTypes(structure.store)) {
            const amount = structure.store.getUsedCapacity(resourceType);
            if (amount <= 0) continue;
            market.supplies.push({
                id: `supply:${structure.id}:${resourceType}`,
                roomName,
                kind: 'withdraw',
                targetId: structure.id,
                resourceType,
                amount,
                priority: this.supplyPriorityForStructure(resourceType, logisticsPolicy)
            });
        }
    }

    supplyPriorityForStructure(resourceType, logisticsPolicy = null) {
        if (resourceType !== RESOURCE_ENERGY) return 65;
        if (logisticsPolicy && logisticsPolicy.supplyPriority !== undefined) return logisticsPolicy.supplyPriority;
        return 45;
    }

    addStoreDemand(roomName, market, structure) {
        const room = Game.rooms && Game.rooms[roomName];
        const cityPlan = room && Memory.rooms && Memory.rooms[roomName] ? Memory.rooms[roomName].cityPlan : null;
        if (cityPlan && structure.structureType === STRUCTURE_CONTAINER) {
            if (this.isControllerContainer(room, structure) || isSourceContainerAsset(cityPlan, structure, null, { allowLegacyFallback: false })) return;
        }
        const free = structure.store.getFreeCapacity(RESOURCE_ENERGY);
        if (free <= 0) return;
        const currentAmount = structure.store.getUsedCapacity ? structure.store.getUsedCapacity(RESOURCE_ENERGY) : 0;
        market.demands.push(this.createStateDemand({
            id: `demand:${structure.id}:${RESOURCE_ENERGY}`,
            roomName,
            targetId: structure.id,
            resourceType: RESOURCE_ENERGY,
            currentAmount,
            minAmount: 0,
            targetAmount: currentAmount + free,
            priority: 25,
            purpose: 'storage_balance',
            demandType: 'sink',
            deliveryMode: 'haul',
            producer: 'storage_balance'
        }));
    }

    createEventDemand(data, roomName, eventPriority) {
        const demandType = data.demandType || this.inferDemandType(data);
        return {
            id: `event-demand:${data.targetId}:${data.resourceType}:${Game.time}`,
            roomName,
            targetId: data.targetId,
            resourceType: data.resourceType || RESOURCE_ENERGY,
            amount: data.amount,
            priority: data.priority || eventPriority || DEFAULT_PRIORITY,
            purpose: data.purpose || data.action || 'resource_request',
            demandType,
            deliveryMode: data.deliveryMode || 'haul',
            producer: data.producer || 'event'
        };
    }

    upsertDemand(market, demand) {
        const existing = market.demands.find((entry) => this.sameDemand(entry, demand));
        if (!existing) {
            market.demands.push(demand);
            return;
        }

        if (demand.amount !== undefined) {
            existing.amount = Math.max(existing.amount || 0, demand.amount);
        }
        if (demand.currentAmount !== undefined) {
            existing.currentAmount = Math.min(existing.currentAmount || 0, demand.currentAmount);
        }
        if (demand.minAmount !== undefined) {
            existing.minAmount = Math.max(existing.minAmount || 0, demand.minAmount);
        }
        if (demand.targetAmount !== undefined) {
            existing.targetAmount = Math.max(existing.targetAmount || 0, demand.targetAmount);
        }
        existing.priority = Math.max(existing.priority || 0, demand.priority || 0);
        existing.deliveryMode = existing.deliveryMode || demand.deliveryMode;
        existing.demandType = existing.demandType || demand.demandType;
        existing.producer = existing.producer || demand.producer;
    }

    sameDemand(left, right) {
        return left.targetId === right.targetId &&
            left.resourceType === right.resourceType &&
            left.purpose === right.purpose &&
            left.demandType === right.demandType;
    }

    inferDemandType(data) {
        const purpose = data && data.purpose ? data.purpose : '';
        if (purpose === 'builder_work' || purpose === 'repairer_work' || purpose === 'upgrader_work' ||
            purpose === 'build' || purpose === 'repair' || purpose === 'upgrade') {
            return 'worker';
        }
        if (purpose === 'controller_buffer') return 'buffer';
        if (purpose === 'storage_balance' || purpose === 'terminal_balance') return 'sink';
        return 'pull';
    }

    createEventSupply(data, roomName) {
        return {
            id: `event-supply:${data.targetId}:${data.resourceType}:${Game.time}`,
            roomName,
            kind: data.kind || 'withdraw',
            targetId: data.targetId,
            resourceType: data.resourceType || RESOURCE_ENERGY,
            amount: data.amount || Infinity,
            priority: data.priority || DEFAULT_PRIORITY,
            producer: data.producer || data.purpose || 'event'
        };
    }

    getAvailableSupplyAmount(market, supply) {
        return availableSupplyAmount(market, supply);
    }

    getAvailableDemandAmount(market, demand) {
        const reservation = market.reservations.demand[demand.id];
        const reserved = reservation && reservation.expiresAt >= Game.time ? reservation.amount : 0;
        if (demand.amount === undefined) return Infinity;
        const target = Game.getObjectById(demand.targetId);
        const capacity = availableTargetCapacity(market, target, demand.resourceType);
        return Math.max(0, Math.min(demand.amount - reserved, capacity === null ? Infinity : capacity));
    }

    getPickupAmount(creep, supply, market) {
        const free = creep.store.getFreeCapacity ? creep.store.getFreeCapacity(supply.resourceType) : supply.amount;
        const available = this.getAvailableSupplyAmount(market, supply);
        return Math.min(free || available, available);
    }

    getPickupAmountForDemand(creep, supply, demand, market) {
        const free = creep.store.getFreeCapacity ? creep.store.getFreeCapacity(supply.resourceType) : supply.amount;
        const availableSupply = this.getAvailableSupplyAmount(market, supply);
        const availableDemand = this.getAvailableDemandAmount(market, demand);
        if (this.shouldBulkLoadForDemand(demand)) return Math.min(free || availableSupply, availableSupply);
        return Math.min(free || availableSupply, availableSupply, availableDemand);
    }

    shouldBulkLoadForDemand(demand) {
        return demand.resourceType === RESOURCE_ENERGY &&
            (demand.purpose === 'economy_energy' ||
                demand.purpose === 'storage_balance' ||
                demand.purpose === 'controller_buffer');
    }

    shouldContinueLoadingForDemand(demand, carriedAmount, availableDemand) {
        if (availableDemand <= 0) return false;
        if (this.shouldBulkLoadForDemand(demand)) return true;
        return carriedAmount < availableDemand;
    }

    demandScore(demand, available, distance) {
        return (demand.priority || DEFAULT_PRIORITY) * DEMAND_PRIORITY_WEIGHT +
            Math.min(available || 0, 5000) -
            distance * 3;
    }

    estimateLogistics(roomName) {
        let haulerThroughput = 0;
        let workDemand = 0;

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if ((creep.memory.homeRoom || (creep.room && creep.room.name)) !== roomName) continue;
            if (creep.memory.role === 'hauler') {
                const carryCapacity = this.countBodyParts(creep, CARRY) * 50;
                const roundTripDistance = creep.memory.roundTripDistance || 50;
                haulerThroughput += carryCapacity * 50 / Math.max(roundTripDistance, 1);
            }
            if (creep.memory.role === 'builder') workDemand += this.countBodyParts(creep, WORK) * 5;
            if (creep.memory.role === 'repairer') workDemand += this.countBodyParts(creep, WORK) * 5;
            if (creep.memory.role === 'upgrader') workDemand += this.countBodyParts(creep, WORK);
        }

        return { haulerThroughput, workDemand };
    }

    countBodyParts(creep, partType) {
        if (!creep.body) return 1;
        const count = creep.body.filter((part) => part === partType || part.type === partType).length;
        return count || 0;
    }

    getStoredResourceTypes(store) {
        if (!store) return [];
        const resources = {};
        for (const key of Object.keys(store)) {
            if (typeof store[key] === 'number' && store[key] > 0) resources[key] = true;
        }
        if (store[Symbol.iterator]) {
            for (const key of store) resources[key] = true;
        }
        return Object.keys(resources);
    }

    isSupplyStructure(structure) {
        return structure.structureType === STRUCTURE_CONTAINER ||
            structure.structureType === STRUCTURE_STORAGE ||
            structure.structureType === STRUCTURE_TERMINAL ||
            structure.structureType === STRUCTURE_LAB;
    }

    isDemandStructure(structure) {
        return structure.structureType === STRUCTURE_CONTAINER ||
            structure.structureType === STRUCTURE_STORAGE;
    }

    createStateDemand(data) {
        const currentAmount = data.currentAmount || 0;
        const targetAmount = data.targetAmount || currentAmount;
        const amount = Math.max(0, targetAmount - currentAmount);
        return {
            id: data.id,
            roomName: data.roomName,
            targetId: data.targetId,
            resourceType: data.resourceType || RESOURCE_ENERGY,
            currentAmount,
            minAmount: data.minAmount || 0,
            targetAmount,
            amount,
            priority: data.priority || DEFAULT_PRIORITY,
            purpose: data.purpose || 'resource_request',
            demandType: data.demandType || 'pull',
            deliveryMode: data.deliveryMode || 'haul',
            producer: data.producer || 'market'
        };
    }

    findControllerContainer(room) {
        const cityPlan = Memory.rooms &&
            Memory.rooms[room.name] &&
            Memory.rooms[room.name].cityPlan;
        const controllerContainerAsset = getControllerContainerAsset(cityPlan || {}, { allowLegacyFallback: false });
        const plannedPos = controllerContainerAsset && controllerContainerAsset.pos;
        if (!plannedPos || !room.find) return null;

        const structures = room.find(FIND_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_CONTAINER
        });
        return structures.find((structure) => {
            return this.samePos(structure.pos, plannedPos);
        }) || null;
    }

    isControllerContainer(room, structure) {
        if (!room || !structure || structure.structureType !== STRUCTURE_CONTAINER) return false;
        const cityPlan = Memory.rooms &&
            Memory.rooms[room.name] &&
            Memory.rooms[room.name].cityPlan;
        const controllerContainerAsset = getControllerContainerAsset(cityPlan || {}, { allowLegacyFallback: false });
        return !!(controllerContainerAsset && this.samePos(controllerContainerAsset.pos, structure.pos));
    }

    getSourceContainerLifecycle(room, structure) {
        if (!room || !structure || structure.structureType !== STRUCTURE_CONTAINER) return null;
        const cityPlan = Memory.rooms &&
            Memory.rooms[room.name] &&
            Memory.rooms[room.name].cityPlan;
        if (!cityPlan) return null;
        const plannedStructure = findPlannedStructureAtPos(cityPlan, structure.pos, STRUCTURE_CONTAINER);
        if (!plannedStructure || plannedStructure.role !== 'source_container') return null;
        return getStructureLifecycle(cityPlan, plannedStructure).state;
    }

    getControllerContainerLifecycle(room, structure) {
        if (!room || !structure || structure.structureType !== STRUCTURE_CONTAINER) return null;
        const cityPlan = Memory.rooms &&
            Memory.rooms[room.name] &&
            Memory.rooms[room.name].cityPlan;
        if (!cityPlan) return null;
        const plannedStructure = findPlannedStructureAtPos(cityPlan, structure.pos, STRUCTURE_CONTAINER);
        if (!plannedStructure || plannedStructure.role !== 'controller_container') return null;
        return getStructureLifecycle(cityPlan, plannedStructure).state;
    }

    shouldSkipSourceContainerSupply(room, structure) {
        const logisticsPolicy = this.getLogisticsPolicy(room, structure);
        return !logisticsPolicy.shouldSupply;
    }

    getPlannedRoleForStructure(room, structure) {
        if (!room || !structure) return null;
        const cityPlan = Memory.rooms &&
            Memory.rooms[room.name] &&
            Memory.rooms[room.name].cityPlan;
        if (!cityPlan) return null;
        return getPlannedRole(cityPlan, structure);
    }

    getLogisticsPolicy(room, structure) {
        if (!room || !structure) return { shouldSupply: false, shouldDemand: false };
        const cityPlan = Memory.rooms &&
            Memory.rooms[room.name] &&
            Memory.rooms[room.name].cityPlan;
        if (!cityPlan) return getAssetLogisticsPolicy({}, structure);
        const plannedRole = getPlannedRole(cityPlan, structure);
        if (plannedRole) return getAssetLogisticsPolicy(cityPlan, structure);
        if (structure.structureType === STRUCTURE_CONTAINER && this.isControllerContainer(room, structure)) {
            return getAssetLogisticsPolicy(cityPlan, {
                ...structure,
                role: 'controller_container',
                lifecycle: { state: 'active', activeFromRcl: 1 }
            });
        }
        return getAssetLogisticsPolicy(cityPlan, structure);
    }

    samePos(left, right) {
        return !!left && !!right &&
            left.x === right.x &&
            left.y === right.y &&
            left.roomName === right.roomName;
    }

    loadReservations(roomName) {
        const roomMemory = Memory.rooms && Memory.rooms[roomName];
        const marketMemory = roomMemory && roomMemory.resourceMarket;
        const reservations = marketMemory && marketMemory.reservations ? marketMemory.reservations : {
            supply: {},
            demand: {}
        };
        this.pruneReservations(reservations);
        return reservations;
    }

    persistReservations(roomName, reservations) {
        if (!Memory.rooms) Memory.rooms = {};
        if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
        if (!Memory.rooms[roomName].resourceMarket) Memory.rooms[roomName].resourceMarket = {};
        Memory.rooms[roomName].resourceMarket.reservations = reservations;
    }

    persistMarket(roomName, market) {
        this.persistReservations(roomName, market.reservations);
        if (!Memory.rooms) Memory.rooms = {};
        if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
        if (!Memory.rooms[roomName].resourceMarket) Memory.rooms[roomName].resourceMarket = {};
        Memory.rooms[roomName].resourceMarket.stats = market.stats;
        Memory.rooms[roomName].resourceMarket.feedbackTotals = market.feedbackTotals;
    }

    pruneReservations(reservations) {
        if (!reservations) return;
        for (const kind of ['supply', 'demand']) {
            if (!reservations[kind]) reservations[kind] = {};
            for (const id of Object.keys(reservations[kind])) {
                const reservation = reservations[kind][id];
                if (!reservation || reservation.expiresAt < Game.time) delete reservations[kind][id];
            }
        }
    }

    getRoomNameFromTarget(targetId) {
        const target = targetId ? Game.getObjectById(targetId) : null;
        return target && target.pos ? target.pos.roomName : null;
    }

    rangeBetween(fromPos, toPos) {
        if (!fromPos || !toPos) return 25;
        if (![fromPos.x, fromPos.y, toPos.x, toPos.y].every(Number.isFinite)) return 25;
        if (fromPos.roomName && toPos.roomName && fromPos.roomName !== toPos.roomName) return Infinity;
        // Memory positions are plain coordinates; native getRangeTo cannot consume them directly.
        return Math.max(Math.abs(fromPos.x - toPos.x), Math.abs(fromPos.y - toPos.y));
    }

    removeIdleHauler(creep) {
        this.idleHaulers = this.idleHaulers.filter((hauler) => hauler.name !== creep.name);
    }
}

export default ResourceMarketService;
export { WAIT_SUPPLY };
