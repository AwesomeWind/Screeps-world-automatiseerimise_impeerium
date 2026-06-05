function terrainAt(roomName, x, y) {
    if (!Game.map || typeof Game.map.getRoomTerrain !== 'function') return 0;
    const terrain = Game.map.getRoomTerrain(roomName);
    if (!terrain || typeof terrain.get !== 'function') return 0;
    return terrain.get(x, y);
}

function isWall(roomName, x, y) {
    return terrainAt(roomName, x, y) === TERRAIN_MASK_WALL;
}

function structureMap(room) {
    const occupied = new Map();
    if (!room || typeof room.find !== 'function') return occupied;

    const structures = room.find(FIND_STRUCTURES) || [];
    for (const structure of structures) {
        const pos = structure.pos;
        if (!pos) continue;
        occupied.set(`${pos.x},${pos.y}`, structure.structureType);
    }
    return occupied;
}

function isBlockedStructure(type) {
    return type &&
        type !== STRUCTURE_ROAD &&
        type !== STRUCTURE_CONTAINER &&
        type !== STRUCTURE_RAMPART;
}

function candidateScore(origin, x, y, type) {
    const distance = Math.max(Math.abs(origin.x - x), Math.abs(origin.y - y));
    const roadPenalty = type === STRUCTURE_ROAD ? 100 : 0;
    return roadPenalty + distance;
}

const WorkPositionPlanner = {
    candidates(room, target) {
        if (!room || !target || !target.pos) return [];

        const origin = target.pos;
        const occupied = structureMap(room);
        const candidates = [];

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;

                const x = origin.x + dx;
                const y = origin.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (isWall(origin.roomName, x, y)) continue;

                const type = occupied.get(`${x},${y}`);
                if (isBlockedStructure(type)) continue;

                candidates.push({
                    x,
                    y,
                    roomName: origin.roomName,
                    score: candidateScore(origin, x, y, type)
                });
            }
        }

        return candidates.sort((a, b) => {
            if (a.score !== b.score) return a.score - b.score;
            if (a.x !== b.x) return a.x - b.x;
            return a.y - b.y;
        }).map((candidate) => ({
            x: candidate.x,
            y: candidate.y,
            roomName: candidate.roomName
        }));
    },

    plan(room, target) {
        return this.candidates(room, target)[0] || null;
    }
};

export default WorkPositionPlanner;
