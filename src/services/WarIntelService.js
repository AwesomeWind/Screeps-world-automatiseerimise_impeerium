import BaseService from '../core/BaseService.js';

class WarIntelService extends BaseService {
    constructor(serviceName) {
        super(serviceName);
        if (!global.WarIntel) global.WarIntel = {};
    }

    analyze() {
        global.WarIntel = {};
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            global.WarIntel[roomName] = this.buildRoomIntel(room);
        }
    }

    buildRoomIntel(room) {
        const hostiles = room.find(FIND_HOSTILE_CREEPS);
        const hostileIntel = hostiles.map((hostile) => this.describeHostile(hostile));
        const primary = this.pickPrimaryHostile(hostileIntel);
        const dangerZones = this.buildDangerZones(room, hostiles);
        const safeRallyPoints = this.findSafeRallyPoints(room, dangerZones);
        const defenderStrength = this.scoreDefenders(room.name);
        const towerStrength = this.scoreTowers(room);

        return {
            hostiles: hostileIntel,
            hostileStrength: hostileIntel.reduce((sum, hostile) => sum + hostile.threatScore, 0),
            defenderStrength,
            towerStrength,
            totalDefenseStrength: defenderStrength + towerStrength,
            dangerZones,
            safeRallyPoints,
            primaryHostileId: primary ? primary.id : null
        };
    }

    describeHostile(hostile) {
        const attackParts = this.getActiveBodyparts(hostile, ATTACK);
        const rangedParts = this.getActiveBodyparts(hostile, RANGED_ATTACK);
        const healParts = this.getActiveBodyparts(hostile, HEAL);
        const toughParts = this.getActiveBodyparts(hostile, TOUGH);
        const workParts = this.getActiveBodyparts(hostile, WORK);
        const carryParts = this.getActiveBodyparts(hostile, CARRY);
        return {
            id: hostile.id,
            pos: hostile.pos ? { x: hostile.pos.x, y: hostile.pos.y, roomName: hostile.pos.roomName } : null,
            attackParts,
            rangedParts,
            healParts,
            toughParts,
            workParts,
            carryParts,
            threatScore: healParts * 100 + rangedParts * 60 + attackParts * 40 + workParts * 15 + carryParts * 5 + toughParts * 5
        };
    }

    pickPrimaryHostile(hostiles) {
        let best = null;
        let bestScore = -1;
        for (const hostile of hostiles) {
            if (hostile.threatScore > bestScore) {
                best = hostile;
                bestScore = hostile.threatScore;
            }
        }
        return best;
    }

    buildDangerZones(room, hostiles) {
        const zones = {};
        for (const hostile of hostiles) {
            if (!hostile.pos) continue;
            const range = this.getActiveBodyparts(hostile, RANGED_ATTACK) > 0 ? 3 :
                (this.getActiveBodyparts(hostile, ATTACK) > 0 ? 1 : 0);
            this.markRange(zones, room.name, hostile.pos, range);
        }
        return zones;
    }

    markRange(zones, roomName, center, range) {
        for (let dx = -range; dx <= range; dx++) {
            for (let dy = -range; dy <= range; dy++) {
                const x = center.x + dx;
                const y = center.y + dy;
                if (x <= 0 || x >= 49 || y <= 0 || y >= 49) continue;
                zones[`${x},${y}`] = true;
            }
        }
        zones[`${center.x},${center.y}`] = true;
    }

    findSafeRallyPoints(room, dangerZones) {
        const anchors = room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_SPAWN ||
                structure.structureType === STRUCTURE_TOWER ||
                structure.structureType === STRUCTURE_RAMPART
        });
        return anchors
            .filter((anchor) => anchor.pos && !dangerZones[`${anchor.pos.x},${anchor.pos.y}`])
            .map((anchor) => ({ x: anchor.pos.x, y: anchor.pos.y, roomName: anchor.pos.roomName || room.name }));
    }

    scoreDefenders(roomName) {
        let score = 0;
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role !== 'defender') continue;
            if ((creep.memory.targetRoom || creep.room.name) !== roomName) continue;
            score += this.scoreBody(creep.body || []);
        }
        return score;
    }

    scoreTowers(room) {
        const towers = room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_TOWER &&
                structure.store &&
                structure.store.getUsedCapacity &&
                structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0
        });
        return towers.length * 60;
    }

    scoreBody(body) {
        let score = 0;
        for (const part of body) {
            const type = part.type || part;
            if (type === HEAL) score += 100;
            else if (type === RANGED_ATTACK) score += 60;
            else if (type === ATTACK) score += 40;
            else if (type === TOUGH) score += 5;
            else if (type === MOVE) score += 1;
        }
        return score;
    }

    getActiveBodyparts(creep, partType) {
        return creep.getActiveBodyparts ? creep.getActiveBodyparts(partType) : 0;
    }
}

export default WarIntelService;
