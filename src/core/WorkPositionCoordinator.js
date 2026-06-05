import WorkPositionPlanner from './WorkPositionPlanner.js';

function creepKey(creep) {
    if (!creep) return null;
    return creep.name || creep.id || null;
}

function samePos(a, b) {
    return a && b && a.x === b.x && a.y === b.y && a.roomName === b.roomName;
}

function buildClaimMap(roomName, ownerKey) {
    const claims = new Map();
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (!creep || !creep.memory || !creep.memory.task || !creep.memory.task.workPos) continue;
        if (!creep.room || creep.room.name !== roomName) continue;

        const key = creepKey(creep);
        if (ownerKey && key === ownerKey) continue;

        const workPos = creep.memory.task.workPos;
        claims.set(`${workPos.x},${workPos.y},${workPos.roomName}`, key);
    }
    return claims;
}

const WorkPositionCoordinator = {
    reserve(room, creep, target) {
        if (!room || !target || !target.pos) return null;

        const claims = buildClaimMap(room.name, creepKey(creep));
        const candidates = WorkPositionPlanner.candidates(room, target);

        for (const candidate of candidates) {
            const key = `${candidate.x},${candidate.y},${candidate.roomName}`;
            if (!claims.has(key)) {
                return {
                    workPos: candidate,
                    workPosReservedAt: Game.time
                };
            }
        }

        const fallback = candidates[0] || null;
        return fallback ? {
            workPos: fallback,
            workPosReservedAt: Game.time
        } : null;
    },

    claimedByOther(room, creep, workPos) {
        if (!room || !workPos) return false;
        const claims = buildClaimMap(room.name, creepKey(creep));
        return claims.has(`${workPos.x},${workPos.y},${workPos.roomName}`);
    },

    refresh(room, creep, target, currentWorkPos) {
        const reservation = this.reserve(room, creep, target);
        if (!reservation) return null;
        if (currentWorkPos && samePos(reservation.workPos, currentWorkPos)) {
            return {
                workPos: currentWorkPos,
                workPosReservedAt: Game.time
            };
        }
        return reservation;
    }
};

export default WorkPositionCoordinator;
