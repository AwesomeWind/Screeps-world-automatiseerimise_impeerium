const { createScoutMovementFixture } = require('./scout-movement-fixture.cjs');

async function createOccupancyFixture(kind = 'miner') {
    const { fixture, scout } = await createScoutMovementFixture();
    scout.pos = new RoomPosition(42, 30, 'W1N1');
    Game.map.describeExits = name => name === 'W1N1' ? { 3: 'W1N2' } : { 7: 'W1N1' };
    fixture.objects.HomeSourceB = {
        id: 'HomeSourceB', kind: 'source', energy: 3000, energyCapacity: 3000,
        pos: new RoomPosition(44, 31, 'W1N1')
    };
    for (let x = 43; x <= 49; x++) {
        fixture.objects['Road' + x] = {
            id: 'Road' + x, structureType: STRUCTURE_ROAD, pos: new RoomPosition(x, 30, 'W1N1')
        };
    }
    fixture.objects.StationContainer = {
        id: 'StationContainer', structureType: STRUCTURE_CONTAINER,
        pos: new RoomPosition(43, 30, 'W1N1'), store: { energy: 0, getFreeCapacity: () => 2000 }
    };
    fixture.objects.StationRampart = {
        id: 'StationRampart', structureType: STRUCTURE_RAMPART, my: true,
        pos: new RoomPosition(43, 30, 'W1N1')
    };
    let occupant;
    if (kind !== 'empty' && kind !== 'ghost') {
        occupant = fixture.actor('Occupant', kind === 'miner' ? 'miner' : 'hauler', [WORK, CARRY, MOVE]);
        occupant.pos = new RoomPosition(43, 30, 'W1N1');
        if (kind === 'miner') {
            Object.assign(occupant.memory, {
                miningPos: { x: 43, y: 30, roomName: 'W1N1' }, sourceId: 'HomeSourceB'
            });
        }
    }
    if (kind === 'ghost') Memory.creeps.Ghost = {
        role: 'miner', miningPos: { x: 43, y: 30, roomName: 'W1N1' }
    };
    const searches = [];

    function candidate(origin, goal, detour) {
        let { x, y, roomName } = origin;
        const path = [];
        const push = (nextX, nextY, nextRoom = roomName) => {
            x = nextX;
            y = nextY;
            roomName = nextRoom;
            path.push(new RoomPosition(x, y, roomName));
        };
        const inRange = () => roomName === goal.pos.roomName &&
            Math.max(Math.abs(x - goal.pos.x), Math.abs(y - goal.pos.y)) <= goal.range;
        if (inRange()) return path;
        if (roomName !== goal.pos.roomName) {
            const row = Math.max(0, origin.y - (detour ? 1 : 0));
            while (x < 49) push(x + 1, y + Math.sign(row - y));
            push(0, y, goal.pos.roomName);
        } else if (detour) push(x + 1, Math.max(0, y - 1));
        while (!inRange()) push(x + Math.sign(goal.pos.x - x), y + Math.sign(goal.pos.y - y));
        return path;
    }

    // Two known legal corridors, chosen using the production roomCallback costs.
    // This bounded harness is not a replacement for native PathFinder.
    PathFinder.search = (origin, goal, options) => {
        const matrices = new Map();
        const matrix = roomName => {
            if (!matrices.has(roomName)) matrices.set(roomName, options.roomCallback(roomName));
            return matrices.get(roomName);
        };
        const candidates = [candidate(origin, goal, false), candidate(origin, goal, true)].map(route => {
            let cost = 0;
            for (const point of route) {
                const grid = matrix(point.roomName);
                if (grid === false || grid.get(point.x, point.y) === 255) return { route, cost: Infinity };
                cost += grid.get(point.x, point.y) || options.plainCost;
            }
            return { route, cost };
        }).sort((a, b) => a.cost - b.cost);
        const chosen = candidates[0];
        searches.push({
            tick: Game.time, origin: { x: origin.x, y: origin.y, roomName: origin.roomName },
            goal: { x: goal.pos.x, y: goal.pos.y, roomName: goal.pos.roomName },
            stationCost: matrix('W1N1').get(43, 30),
            originCost: matrix(origin.roomName).get(origin.x, origin.y),
            path: chosen.route, chosenCost: chosen.cost, matrices
        });
        return {
            incomplete: !Number.isFinite(chosen.cost),
            path: Number.isFinite(chosen.cost) ? chosen.route : [], cost: chosen.cost
        };
    };
    const moves = [];
    let pending;
    const occupied = point => Object.values(Game.creeps).some(creep =>
        creep.name !== scout.name && creep.pos.isEqualTo(point));
    scout.moveByPath = route => {
        const index = route.findIndex(point => point.isEqualTo(scout.pos));
        const next = route[index + 1];
        let result = OK;
        if (!next || index < 0 && scout.pos.getRangeTo(route[0]) > 1) result = ERR_NOT_FOUND;
        const blocked = !!next && occupied(next);
        moves.push({ tick: Game.time, result, blocked, from: { x: scout.pos.x, y: scout.pos.y }, next });
        if (result === OK && !blocked) pending = next;
        return result;
    };
    const advance = tick => {
        if (pending) {
            // Occupancy may change after an accepted intent, before the next position is observed.
            if (!occupied(pending)) {
                scout.pos = pending;
                scout.room = pending.roomName === 'W1N1' ? fixture.home : fixture.remote;
            }
            pending = null;
        }
        fixture.nextTick({ tick });
        fixture.runTick();
    };
    const plan = async (mode, goal = { x: 1, y: 25, roomName: 'W1N2' }, range = 0) => {
        const route = await import('../../services/RemoteMiningRoute.js');
        return route.planRemoteRoute(scout.pos, goal, {
            baseRoom: 'W1N1', targetRoom: 'W1N2', body: [MOVE], range, occupancyMode: mode
        }, Memory.empire.control.policy.remoteMining, Game.time);
    };
    return { fixture, scout, occupant, searches, moves, advance, plan };
}

module.exports = { createOccupancyFixture };
