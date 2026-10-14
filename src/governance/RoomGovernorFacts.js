import { currentCreepPopulation, activeBodyPartCount as activePartCount } from '../core/CreepPopulation.js';

function emptyCapabilities() {
    return {
        harvestWork: 0,
        logisticsCarry: 0,
        buildWork: 0,
        repairWork: 0,
        upgradeWork: 0,
        defenseScore: 0
    };
}

function defenseScore(body) {
    return activePartCount(body, HEAL) * 100 +
        activePartCount(body, RANGED_ATTACK) * 60 +
        activePartCount(body, ATTACK) * 40 +
        activePartCount(body, TOUGH) * 5;
}

function addRoleCapability(target, memory, body) {
    if (!memory || !memory.role) return;
    if (memory.role === 'miner') target.harvestWork += activePartCount(body, WORK);
    else if (memory.role === 'hauler') target.logisticsCarry += activePartCount(body, CARRY);
    else if (memory.role === 'builder') target.buildWork += activePartCount(body, WORK);
    else if (memory.role === 'repairer') target.repairWork += activePartCount(body, WORK);
    else if (memory.role === 'upgrader') target.upgradeWork += activePartCount(body, WORK);
    else if (memory.role === 'defender') target.defenseScore += defenseScore(body);
}

function ensureRoomIndex(index, roomName) {
    if (!index[roomName]) index[roomName] = emptyCapabilities();
    return index[roomName];
}

function indexCreepCapabilities(replacementLeadTicks) {
    const stable = {};
    const retiring = {};
    const spawning = {};
    for (const entry of currentCreepPopulation(replacementLeadTicks)) {
        if (!entry.roomName || entry.state === 'invalid') continue;
        const index = ['spawning', 'accepted'].includes(entry.state) ? spawning : (entry.state === 'retiring' ? retiring : stable);
        addRoleCapability(ensureRoomIndex(index, entry.roomName), entry.memory, entry.body);
    }
    return { stable, retiring, spawning };
}

function indexSpawns() {
    const byRoom = {};
    for (const name in (Game.spawns || {})) {
        const spawn = Game.spawns[name];
        if (!spawn.room) continue;
        if (!byRoom[spawn.room.name]) byRoom[spawn.room.name] = [];
        byRoom[spawn.room.name].push(spawn);
    }
    return byRoom;
}

function storageEnergy(room) {
    if (!room.storage || !room.storage.store || typeof room.storage.store.getUsedCapacity !== 'function') return 0;
    const resource = typeof RESOURCE_ENERGY === 'undefined' ? 'energy' : RESOURCE_ENERGY;
    return room.storage.store.getUsedCapacity(resource) || 0;
}

function haulDistanceEstimate(room, sources, spawns) {
    if (!Array.isArray(sources)) return null;
    if (sources.length === 0) return 0;
    const anchor = room.storage || spawns[0];
    if (!anchor || !anchor.pos || typeof anchor.pos.getRangeTo !== 'function') return null;
    let total = 0;
    let measured = 0;
    for (const sourceId of sources) {
        const source = Game.getObjectById ? Game.getObjectById(sourceId) : null;
        if (!source) continue;
        total += anchor.pos.getRangeTo(source);
        measured++;
    }
    return measured === sources.length ? total : null;
}

function roomSecurity(roomName) {
    const intel = global.WarIntel && global.WarIntel[roomName] ? global.WarIntel[roomName] : {};
    const security = global.Security && global.Security[roomName] ? global.Security[roomName] : {};
    return {
        defcon: security.defcon === undefined ? null : security.defcon,
        posture: security.posture || null,
        hostileStrength: intel.hostileStrength === undefined ? null : intel.hostileStrength,
        defenseStrength: intel.totalDefenseStrength === undefined ? null : intel.totalDefenseStrength
    };
}

export function collectRoomGovernorFacts(options = {}) {
    const replacementLeadTicks = options.replacementLeadTicks === undefined ? 50 : options.replacementLeadTicks;
    const creepCapabilities = indexCreepCapabilities(replacementLeadTicks);
    const spawningCapabilities = creepCapabilities.spawning;
    const spawnsByRoom = indexSpawns();
    const metricsRooms = Memory.empire && Memory.empire.control && Memory.empire.control.metrics &&
        Memory.empire.control.metrics.rooms ? Memory.empire.control.metrics.rooms : {};
    const rooms = {};
    const errors = {};

    for (const roomName in (Game.rooms || {})) {
        const room = Game.rooms[roomName];
        if (!room.controller || !room.controller.my) continue;
        try {
            const cache = global.RoomCache && global.RoomCache[roomName] ? global.RoomCache[roomName] : null;
            const phase = global.RoomPhase && global.RoomPhase[roomName] ? global.RoomPhase[roomName] : {};
            const sources = cache && Array.isArray(cache.sources) ? cache.sources : null;
            const structures = cache && cache.structures ? cache.structures : {};
            const roomSpawns = spawnsByRoom[roomName] || [];
            const labs = structures.lab || [];
            const factories = structures.factory || [];
            rooms[roomName] = {
                roomName,
                owned: true,
                rcl: room.controller.level || 0,
                controllerTicksToDowngrade: Number.isFinite(room.controller.ticksToDowngrade)
                    ? room.controller.ticksToDowngrade
                    : null,
                hasSpawn: roomSpawns.length > 0,
                spawnCount: roomSpawns.length,
                hasStorage: !!room.storage,
                hasTerminal: !!room.terminal,
                hasIndustrialInfrastructure: labs.length >= 3 || factories.length > 0,
                energyAvailable: room.energyAvailable || 0,
                energyCapacity: room.energyCapacityAvailable || 0,
                spawnEnergyRatio: phase.spawnEnergyRatio === undefined
                    ? ((room.energyCapacityAvailable || 0) > 0 ? (room.energyAvailable || 0) / room.energyCapacityAvailable : null)
                    : phase.spawnEnergyRatio,
                storageEnergy: storageEnergy(room),
                sourceCount: sources ? sources.length : null,
                haulDistanceEstimate: haulDistanceEstimate(room, sources, roomSpawns),
                constructionPressure: phase.constructionPressure === undefined
                    ? (cache && Array.isArray(cache.constructionSites) ? cache.constructionSites.length : null)
                    : phase.constructionPressure,
                maintenancePressure: phase.maintenancePressure === undefined ? null : phase.maintenancePressure,
                capabilities: creepCapabilities.stable[roomName] || emptyCapabilities(),
                retiringCapabilities: creepCapabilities.retiring[roomName] || emptyCapabilities(),
                spawningCapabilities: spawningCapabilities[roomName] || emptyCapabilities(),
                security: roomSecurity(roomName),
                previousMetrics: metricsRooms[roomName] || null
            };
        } catch (error) {
            errors[roomName] = { message: error && error.message ? error.message : String(error) };
        }
    }

    return { tick: Game.time, rooms, errors };
}
