import BaseService from '../core/BaseService.js';
import EventBus from '../core/EventBus.js';
import TaskTypes from '../core/TaskTypes.js';

const DEFAULT_PRIORITY = 50;
const WAIT_SUPPLY = 'WAIT_SUPPLY';
const RESERVATION_TTL = 5;
const CONTROLLER_BUFFER_TARGET = 1000;
const CONTROLLER_BUFFER_MIN = 200;

function availableSupplyAmount(market, supply) {
    if (!market) return supply.amount || 0;
    const reservation = market.reservations && market.reservations.supply && market.reservations.supply[supply.id];
    if (reservation && reservation.expiresAt >= Game.time) return 0;
    return supply.amount || 0;
}

function reserveSupplyAmount(market, supply, amount) {
    if (!market) return;
    if (!market.reservations) market.reservations = {};
    if (!market.reservations.supply) market.reservations.supply = {};
    market.reservations.supply[supply.id] = {
        amount: amount || supply.amount || 1,
        expiresAt: Game.time + RESERVATION_TTL
    };
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
    reserveSupplyAmount(market, supply, amount);

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

    const roomName = creep.memory.homeRoom || room.name;
    const market = global.ResourceMarket && global.ResourceMarket[roomName];
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

    if (market && market.supplyMode === 'hauler_supply') {
        return {
            type: WAIT_SUPPLY,
            priority: options.priority || 60,
            purpose: options.purpose || 'worker_energy',
            supplyTargetId: stationaryBuffer.id
        };
    }

    return planMobileWorkerEnergyTask(creep, options);
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
            this.buildRoomMarket(room);
        }

        for (const hauler of this.idleHaulers.slice()) {
            if (!hauler.memory.task) this.assignHauler(hauler);
        }
    }

    buildRoomMarket(room) {
        const reservations = this.loadReservations(room.name);
        const market = {
            roomName: room.name,
            supplies: [],
            demands: [],
            reservations,
            logistics: this.estimateLogistics(room.name),
            supplyMode: 'self_supply'
        };
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
        this.scanWorkerEnergyDemands(room, market);
        this.scanEconomyEnergyDemands(room, market);
        this.scanControllerBufferDemands(room, market);
        this.persistReservations(room.name, market.reservations);
    }

    handleResourceRequest(event) {
        const data = event.data || {};
        const roomName = data.roomName || this.getRoomNameFromTarget(data.targetId);
        if (!roomName) return true;

        if (!global.ResourceMarket || !global.ResourceMarket[roomName]) {
            const room = Game.rooms[roomName];
            if (room) this.buildRoomMarket(room);
        }

        const market = global.ResourceMarket && global.ResourceMarket[roomName];
        if (!market) return true;

        if (data.action === 'supply') {
            market.supplies.push(this.createEventSupply(data, roomName));
        } else {
            this.upsertDemand(market, this.createEventDemand(data, roomName, event.priority));
        }

        for (const hauler of this.idleHaulers.slice()) {
            if (!hauler.memory.task && hauler.memory.homeRoom === roomName) this.assignHauler(hauler);
        }

        return true;
    }

    assignHauler(creep) {
        const roomName = creep.memory.homeRoom || creep.room.name;
        if (!global.ResourceMarket) global.ResourceMarket = {};
        if (!global.ResourceMarket[roomName] && Game.rooms[roomName]) this.buildRoomMarket(Game.rooms[roomName]);
        if (!global.ResourceMarket[roomName]) return false;
        const market = global.ResourceMarket[roomName];
        this.pruneReservations(market.reservations);

        const carriedResources = this.getStoredResourceTypes(creep.store)
            .filter((resourceType) => creep.store.getUsedCapacity(resourceType) > 0);
        if (carriedResources.length > 0) {
            const task = this.createTransferTask(creep, market, carriedResources);
            if (task) {
                creep.memory.task = task;
                this.removeIdleHauler(creep);
                this.persistReservations(roomName, market.reservations);
                return true;
            }
        }

        if (creep.store.getFreeCapacity && creep.store.getFreeCapacity() <= 0) return false;

        const task = this.createPickupTask(creep, market);
        if (!task) return false;

        creep.memory.task = task;
        this.removeIdleHauler(creep);
        this.persistReservations(roomName, market.reservations);
        return true;
    }

    createTransferTask(creep, market, carriedResources) {
        const demand = this.findBestDemand(creep, market, carriedResources);
        if (!demand) return this.createFallbackStorageTask(creep, market, carriedResources);
        const amount = Math.min(
            creep.store.getUsedCapacity(demand.resourceType),
            this.getAvailableDemandAmount(market, demand)
        );
        this.reserveDemand(market, demand, amount);
        const task = {
            type: TaskTypes.TRANSFER,
            targetId: demand.targetId,
            resourceType: demand.resourceType
        };
        if (this.shouldLimitTransferAmount(demand)) task.amount = amount;
        return task;
    }

    createFallbackStorageTask(creep, market, carriedResources) {
        const room = Game.rooms[market.roomName];
        if (!room) return null;

        for (const resourceType of carriedResources) {
            const target = this.findFallbackStoreTarget(room, resourceType);
            if (target) {
                return {
                    type: TaskTypes.TRANSFER,
                    targetId: target.id,
                    resourceType
                };
            }
        }

        return null;
    }

    findFallbackStoreTarget(room, resourceType) {
        const primary = resourceType === RESOURCE_ENERGY ? [room.storage, room.terminal] : [room.terminal, room.storage];
        for (const target of primary) {
            if (this.canStoreResource(target, resourceType)) return target;
        }

        const containers = room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_CONTAINER && this.canStoreResource(structure, resourceType);
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
        const supply = this.findBestSupply(creep, market);
        if (!supply) return null;
        const amount = this.getPickupAmount(creep, supply, market);
        this.reserveSupply(market, supply, amount);
        if (supply.kind === 'dropped') {
            return {
                type: TaskTypes.PICKUP,
                targetId: supply.targetId
            };
        }
        return {
            type: TaskTypes.WITHDRAW,
            targetId: supply.targetId,
            resourceType: supply.resourceType,
            amount: amount || undefined
        };
    }

    shouldLimitTransferAmount(demand) {
        return demand.purpose !== 'economy_energy' && demand.purpose !== 'storage_balance';
    }

    findBestSupply(creep, market, resourceType) {
        let best = null;
        let bestScore = -Infinity;

        for (const supply of market.supplies) {
            if (resourceType && supply.resourceType !== resourceType) continue;
            if (supply.kind === 'carried') continue;
            const available = this.getAvailableSupplyAmount(market, supply);
            if (available <= 0) continue;
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

    findBestDemand(creep, market, carriedResources) {
        let best = null;
        let bestScore = -Infinity;

        for (const demand of market.demands) {
            if (carriedResources.indexOf(demand.resourceType) === -1) continue;
            const available = this.getAvailableDemandAmount(market, demand);
            if (available <= 0) continue;
            const target = Game.getObjectById(demand.targetId);
            const distance = target && target.pos && creep.pos && creep.pos.getRangeTo ? creep.pos.getRangeTo(target.pos) : 25;
            const score = demand.priority * 100 + available - distance * 3;
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
            if (this.isSupplyStructure(structure)) this.addStoreSupplies(room.name, market, structure);
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
        const container = this.findControllerContainer(room);
        if (!container || !container.store || !container.store.getUsedCapacity) return;

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
            priority: currentAmount < CONTROLLER_BUFFER_MIN ? 85 : 55,
            purpose: 'controller_buffer',
            demandType: 'buffer',
            deliveryMode: 'haul',
            producer: 'controller_buffer'
        }));
    }

    addStoreSupplies(roomName, market, structure) {
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
                priority: resourceType === RESOURCE_ENERGY ? 45 : 65
            });
        }
    }

    addStoreDemand(roomName, market, structure) {
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
        if (purpose === 'builder_work' || purpose === 'repairer_work' || purpose === 'upgrader_work') {
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
            priority: data.priority || DEFAULT_PRIORITY
        };
    }

    getAvailableSupplyAmount(market, supply) {
        const reservation = market.reservations.supply[supply.id];
        if (reservation && reservation.expiresAt >= Game.time) return 0;
        return supply.amount || 0;
    }

    getAvailableDemandAmount(market, demand) {
        const reservation = market.reservations.demand[demand.id];
        const reserved = reservation && reservation.expiresAt >= Game.time ? reservation.amount : 0;
        if (demand.amount === undefined) return Infinity;
        return Math.max(0, demand.amount - reserved);
    }

    reserveSupply(market, supply, amount) {
        market.reservations.supply[supply.id] = {
            amount: amount || supply.amount || 1,
            expiresAt: Game.time + RESERVATION_TTL
        };
    }

    reserveDemand(market, demand, amount) {
        const reservation = market.reservations.demand[demand.id];
        const previousAmount = reservation && reservation.expiresAt >= Game.time ? reservation.amount : 0;
        market.reservations.demand[demand.id] = {
            amount: previousAmount + (amount || 1),
            expiresAt: Game.time + RESERVATION_TTL
        };
    }

    getPickupAmount(creep, supply, market) {
        const free = creep.store.getFreeCapacity ? creep.store.getFreeCapacity(supply.resourceType) : supply.amount;
        const available = this.getAvailableSupplyAmount(market, supply);
        return Math.min(free || available, available);
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
        const plannedPos = Memory.rooms &&
            Memory.rooms[room.name] &&
            Memory.rooms[room.name].cityPlan &&
            Memory.rooms[room.name].cityPlan.controller &&
            Memory.rooms[room.name].cityPlan.controller.containerPos;
        if (!plannedPos || !room.find) return null;

        const structures = room.find(FIND_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_CONTAINER
        });
        return structures.find((structure) => {
            return structure.pos &&
                structure.pos.x === plannedPos.x &&
                structure.pos.y === plannedPos.y &&
                structure.pos.roomName === plannedPos.roomName;
        }) || null;
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

    removeIdleHauler(creep) {
        this.idleHaulers = this.idleHaulers.filter((hauler) => hauler.name !== creep.name);
    }
}

export default ResourceMarketService;
export { WAIT_SUPPLY };
