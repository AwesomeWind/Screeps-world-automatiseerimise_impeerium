function partType(part) { return typeof part === 'string' ? part : part.type; }

function samePosition(left, right) {
    return !!left && !!right && left.roomName === right.roomName &&
        left.x === right.x && left.y === right.y;
}

function blockRouteOccupancy(matrix, room, origin, mode) {
    if (!mode || !room) return;
    const creeps = mode === 'live_creeps' ? room.find(FIND_CREEPS) : Object.values(Game.creeps);
    for (const creep of creeps) {
        const pos = creep.pos;
        if (!pos || pos.roomName !== room.name || samePosition(pos, origin)) continue;
        if (mode === 'work_positions' && !samePosition(pos, creep.memory?.miningPos) &&
            !samePosition(pos, creep.memory?.task?.workPos)) continue;
        matrix.set(pos.x, pos.y, 255);
    }
}

export function pathAvoidsDanger(path, zones = []) {
    return Array.isArray(path) && path.every(point => zones.every(zone =>
        point.roomName !== zone.roomName ||
        Math.max(Math.abs(point.x - zone.x), Math.abs(point.y - zone.y)) > zone.range));
}

export function estimateLegTicks(body, steps, loadState = { energy: 0 }) {
    if (!Array.isArray(body) || !Array.isArray(steps) || body.some(part => part && part.boost)) return { known: false, reason: 'unknown_body_effect' };
    const active = body.filter(part => typeof part === 'string' || part.hits === undefined || part.hits > 0);
    const moves = active.filter(part => partType(part) === MOVE).length;
    if (!moves) return { known: false, reason: 'no_move_parts' };
    const carryParts = active.filter(part => partType(part) === CARRY).length;
    const energy = Math.max(0, loadState.energy || 0);
    const loadedCarry = Math.min(carryParts, Math.ceil(energy / CARRY_CAPACITY));
    const mass = body.filter(part => ![MOVE, CARRY].includes(partType(part))).length + loadedCarry;
    let ticks = 0;
    for (const step of steps) {
        const terrain = step.terrain || 'plain';
        if (!['plain', 'swamp', 'road'].includes(terrain)) return { known: false, reason: 'unknown_terrain' };
        const fatigue = terrain === 'road' ? 1 : (terrain === 'swamp' ? 10 : 2);
        ticks += Math.max(1, Math.ceil(mass * fatigue / (moves * 2)));
    }
    return { known: true, ticks };
}

export function planRemoteRoute(home, target, facts, policy, tick) {
    if (facts.occupancyMode !== undefined && !['work_positions', 'live_creeps'].includes(facts.occupancyMode)) {
        return { valid: false, reasons: ['invalid_occupancy_mode'] };
    }
    const allowedRooms = [facts.baseRoom || home.roomName, facts.targetRoom || target.roomName];
    if (!allowedRooms.includes(home.roomName) || !allowedRooms.includes(target.roomName) || !global.PathFinder) return { valid: false, reasons: ['route_unavailable'] };
    const zones = facts.dangerZones || [];
    if (zones.length > 10) return { valid: false, reasons: ['danger_capacity'] };
    const search = PathFinder.search(new RoomPosition(home.x, home.y, home.roomName), {
        pos: new RoomPosition(target.x, target.y, target.roomName), range: facts.range === undefined ? 1 : facts.range
    }, { maxRooms: 2, maxOps: 3000, plainCost: 2, swampCost: 10,
        roomCallback(roomName) {
            if (!allowedRooms.includes(roomName)) return false;
            const matrix = new PathFinder.CostMatrix();
            const room = Game.rooms[roomName];
            for (const structure of room ? room.find(FIND_STRUCTURES) : []) {
                if (structure.structureType === STRUCTURE_ROAD) {
                    if (matrix.get(structure.pos.x, structure.pos.y) !== 255) matrix.set(structure.pos.x, structure.pos.y, 1);
                }
                else if (structure.structureType !== STRUCTURE_CONTAINER && !(structure.structureType === STRUCTURE_RAMPART && (structure.my || structure.isPublic))) matrix.set(structure.pos.x, structure.pos.y, 255);
            }
            // Opt-in scout snapshots; empty work positions and stale Memory are not obstacles.
            // Skipping the actor's origin never clears static structures or danger costs.
            blockRouteOccupancy(matrix, room, home, facts.occupancyMode);
            for (const zone of zones.filter(value => value.roomName === roomName)) {
                for (let x = Math.max(0, zone.x-zone.range); x <= Math.min(49, zone.x+zone.range); x++) {
                    for (let y = Math.max(0, zone.y-zone.range); y <= Math.min(49, zone.y+zone.range); y++) matrix.set(x,y,255);
                }
            }
            return matrix;
        }
    });
    if (search.incomplete || !Array.isArray(search.path) || search.path.length > 300) return { valid: false, reasons: ['no_safe_path'] };
    const steps = search.path.map(position => {
        const room = Game.rooms[position.roomName];
        const road = room && room.lookForAt && room.lookForAt(LOOK_STRUCTURES,position.x,position.y).some(value=>value.structureType===STRUCTURE_ROAD);
        const terrain = Game.map.getRoomTerrain(position.roomName).get(position.x,position.y);
        return { x:position.x,y:position.y,roomName:position.roomName,terrain:road?'road':terrain===TERRAIN_MASK_SWAMP?'swamp':'plain' };
    });
    const estimate = estimateLegTicks(facts.body,steps,facts.loadState);
    if (!estimate.known || Math.ceil(2*estimate.ticks)+20 > policy.maxLegTicks) return { valid:false,reasons:['unsupported_route'] };
    return { valid:true,path:steps.map(({x,y,roomName})=>({x,y,roomName})),allowedRooms,estimatedLegTicks:estimate.ticks,generatedAt:tick,reasons:[] };
}

export function createRemoteMoveTask(actorState, route, goal, tick) {
    if (!route || !route.valid) return null;
    const key = `${goal.roomName}:${goal.x}:${goal.y}:${route.recoverySequence || 0}`;
    if (actorState.goalKey !== key) {
        const duration = Math.ceil(2*route.estimatedLegTicks)+20;
        if (!Number.isFinite(duration) || duration > 300) return null;
        actorState.goalKey = key;
        actorState.startedAt = tick;
        actorState.expiresAt = tick+duration;
        actorState.retryCount = 0;
        delete actorState.retryAfter;
        delete actorState.lastMoveFailureId;
        delete actorState.blockedGoalKey;
        delete actorState.blockedReason;
    }
    if (tick > actorState.expiresAt) { actorState.blockedReason='leg_expired'; return null; }
    return { type:'MOVE_TO',pos:{x:goal.x,y:goal.y,roomName:goal.roomName},range:goal.range === undefined?1:goal.range,
        path:route.path,allowedRooms:route.allowedRooms,maxTicks:actorState.expiresAt-tick,
        expiresAt:actorState.expiresAt,ignoreFatigueForStuck:true };
}
