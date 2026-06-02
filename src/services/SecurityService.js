import BaseService from '../core/BaseService.js';
import EventBus from '../core/EventBus.js';

class SecurityService extends BaseService {
    constructor(serviceName) {
        super(serviceName);
        if (!global.Security) global.Security = {};
    }

    analyze() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;

            const warStrategy = global.WarStrategy && global.WarStrategy[roomName];
            const warIntel = global.WarIntel && global.WarIntel[roomName];
            if (warStrategy && warIntel) {
                this.bridgeWarStrategy(roomName, room, warStrategy, warIntel);
                continue;
            }

            const hostiles = room.find(FIND_HOSTILE_CREEPS);
            if (hostiles.length === 0) {
                global.Security[roomName] = { defcon: 5, primaryTargetId: null };
                continue;
            }

            const armed = hostiles.find((creep) => {
                return creep.getActiveBodyparts(ATTACK) > 0 ||
                    creep.getActiveBodyparts(RANGED_ATTACK) > 0 ||
                    creep.getActiveBodyparts(HEAL) > 0;
            }) || hostiles[0];

            const isPlayerThreat = armed.owner && armed.owner.username !== 'Invader';
            const defcon = isPlayerThreat ? 1 : 3;
            const defenderBody = this.getDefenderBody(room.energyCapacityAvailable);
            const threat = this.assessThreat(hostiles);
            const defense = this.assessDefense(room, defenderBody);
            const canContest = this.canContestThreat(threat, defense);
            const posture = canContest ? 'defend' : 'develop';
            global.Security[roomName] = {
                defcon,
                posture,
                primaryTargetId: armed.id,
                hostileStrength: threat.total,
                defenseStrength: defense.total
            };

            if (defcon === 1 && posture === 'defend' && this.countDefenders(roomName) === 0) {
                EventBus.publish('REQ_SPAWN', 999, {
                    roomName,
                    role: 'defender',
                    body: defenderBody,
                    memory: { role: 'defender', targetRoom: roomName }
                }, 1);
            }
        }
    }

    bridgeWarStrategy(roomName, room, strategy, intel) {
        const defcon = intel.hostiles && intel.hostiles.length > 0 ? 1 : 5;
        global.Security[roomName] = {
            defcon,
            posture: strategy.posture,
            primaryTargetId: strategy.primaryTargetId,
            hostileStrength: intel.hostileStrength,
            defenseStrength: intel.totalDefenseStrength
        };

        if (defcon === 1 && strategy.spawnDefender && this.countDefenders(roomName) === 0) {
            EventBus.publish('REQ_SPAWN', 999, {
                roomName,
                role: 'defender',
                body: this.getDefenderBody(room.energyCapacityAvailable),
                memory: { role: 'defender', targetRoom: roomName }
            }, 1);
        }
    }

    countDefenders(roomName) {
        let count = 0;
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role !== 'defender') continue;
            if ((creep.memory.targetRoom || creep.memory.homeRoom || creep.room.name) !== roomName) continue;
            count++;
        }
        if (typeof Memory !== 'undefined' && Memory.creeps) {
            for (const name in Memory.creeps) {
                if (Game.creeps[name]) continue;
                const memory = Memory.creeps[name];
                if (memory.role !== 'defender') continue;
                if ((memory.targetRoom || memory.homeRoom) !== roomName) continue;
                count++;
            }
        }
        return count;
    }

    getDefenderBody(energyCapacity) {
        if (energyCapacity >= 800) return [TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE];
        if (energyCapacity >= 550) return [TOUGH, TOUGH, ATTACK, ATTACK, MOVE, MOVE];
        return [TOUGH, ATTACK, MOVE];
    }

    assessThreat(hostiles) {
        let total = 0;
        let ranged = 0;
        let healing = 0;
        for (const hostile of hostiles) {
            const attack = this.getActiveBodyparts(hostile, ATTACK);
            const rangedAttack = this.getActiveBodyparts(hostile, RANGED_ATTACK);
            const heal = this.getActiveBodyparts(hostile, HEAL);
            const tough = this.getActiveBodyparts(hostile, TOUGH);
            ranged += rangedAttack;
            healing += heal;
            total += attack * 30 + rangedAttack * 20 + heal * 45 + tough * 5;
        }
        return { total, ranged, healing };
    }

    assessDefense(room, defenderBody) {
        let total = this.scoreBody(defenderBody);
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role !== 'defender') continue;
            if ((creep.memory.targetRoom || creep.room.name) !== room.name) continue;
            total += this.scoreCreep(creep);
        }
        total += this.scoreTowers(room);
        return { total };
    }

    canContestThreat(threat, defense) {
        return defense.total >= threat.total * 0.9;
    }

    scoreBody(body) {
        let total = 0;
        for (const part of body) {
            if (part === ATTACK) total += 30;
            else if (part === RANGED_ATTACK) total += 20;
            else if (part === HEAL) total += 45;
            else if (part === TOUGH) total += 5;
            else if (part === MOVE) total += 1;
        }
        return total;
    }

    scoreCreep(creep) {
        if (!creep.body) return 0;
        return this.scoreBody(creep.body.map((part) => part.type || part));
    }

    scoreTowers(room) {
        if (!room.find) return 0;
        const towers = room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_TOWER &&
                    structure.store &&
                    structure.store.getUsedCapacity &&
                    structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
            }
        });
        return towers.length * 60;
    }

    getActiveBodyparts(creep, partType) {
        return creep.getActiveBodyparts ? creep.getActiveBodyparts(partType) : 0;
    }
}

export default SecurityService;
