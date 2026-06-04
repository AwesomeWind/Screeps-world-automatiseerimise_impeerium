import BaseService from '../core/BaseService.js';
import MemoryConfig from '../config/MemoryConfig.js';

const MAINTENANCE_PLAN_VERSION = 1;
const CORE_TYPES = new Set(['spawn', 'extension', 'tower', 'storage', 'terminal', 'lab', 'link', 'factory', 'powerSpawn', 'nuker', 'observer']);
const ECONOMIC_TYPES = new Set(['road', 'extractor']);

class MaintenancePlannerService extends BaseService {
    analyze() {
        if (Game.time % 50 !== 0) return;

        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            if (!MemoryConfig.flag(roomName, 'maintenancePlanning', true)) continue;

            const roomMemory = MemoryConfig.room(roomName);
            roomMemory.maintenancePlan = this.buildMaintenancePlan(room, roomMemory.cityPlan || {});
        }
    }

    buildMaintenancePlan(room, cityPlan = {}) {
        const posture = this.postureFor(room.name);
        const defenseTargets = this.defenseTargetsFor(room, cityPlan);
        const targets = (room.find ? room.find(FIND_STRUCTURES) : [])
            .map((structure) => this.targetForStructure(structure, room, cityPlan, posture, defenseTargets))
            .filter(Boolean)
            .sort((a, b) => b.priority - a.priority);

        return {
            version: MAINTENANCE_PLAN_VERSION,
            updatedAt: Game.time,
            posture,
            quotas: this.quotasFor(posture),
            targets
        };
    }

    targetForStructure(structure, room, cityPlan, posture, defenseTargets) {
        if (structure.hits === undefined || structure.hitsMax === undefined) return null;

        if (structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL) {
            return this.defenseTarget(structure, posture, defenseTargets);
        }

        if (structure.structureType === STRUCTURE_CONTAINER) {
            return this.containerTarget(structure, cityPlan);
        }

        if (ECONOMIC_TYPES.has(structure.structureType)) {
            return this.standardTarget(structure, 'economic', `${structure.structureType}_damage`, structure.hitsMax, 60);
        }

        if (CORE_TYPES.has(structure.structureType)) {
            return this.standardTarget(structure, 'core', `${structure.structureType}_damage`, structure.hitsMax, 85);
        }

        return this.standardTarget(structure, 'economic', `${structure.structureType}_damage`, structure.hitsMax, 50);
    }

    defenseTarget(structure, posture, defenseTargets) {
        const targetHits = structure.structureType === STRUCTURE_RAMPART ? defenseTargets.rampartHits : defenseTargets.wallHits;
        if (structure.hits >= targetHits) return null;

        const emergencyTargetHits = structure.structureType === STRUCTURE_RAMPART ?
            Math.max(1000, Math.floor(targetHits * 0.05)) :
            Math.max(2500, Math.floor(targetHits * 0.05));
        const emergency = structure.hits < emergencyTargetHits;
        const postureBonus = posture === 'siege' ? 15 : (posture === 'alert' ? 8 : 0);
        const priority = (emergency ? 120 : 70) + postureBonus + this.damageBonus(structure.hits, targetHits);

        return {
            id: structure.id,
            structureType: structure.structureType,
            pos: this.serializePos(structure.pos),
            priority,
            urgency: emergency ? 'urgent' : 'routine',
            reason: emergency ?
                `${structure.structureType === STRUCTURE_RAMPART ? 'rampart' : 'wall'}_emergency` :
                `${structure.structureType === STRUCTURE_RAMPART ? 'rampart' : 'wall'}_target`,
            targetHits,
            executor: emergency ? 'tower' : 'builder',
            repairClass: 'defense'
        };
    }

    containerTarget(structure, cityPlan) {
        if (structure.hits >= structure.hitsMax) return null;

        const role = this.containerRole(structure.pos, cityPlan);
        const priority = role === 'source_container' ? 82 : (role === 'controller_container' ? 80 : 65);

        return {
            id: structure.id,
            structureType: structure.structureType,
            pos: this.serializePos(structure.pos),
            priority: priority + this.damageBonus(structure.hits, structure.hitsMax),
            urgency: structure.hits < structure.hitsMax * 0.4 ? 'urgent' : 'routine',
            reason: role,
            targetHits: structure.hitsMax,
            executor: 'builder',
            repairClass: 'decay'
        };
    }

    standardTarget(structure, repairClass, reason, targetHits, basePriority) {
        if (structure.hits >= targetHits) return null;

        return {
            id: structure.id,
            structureType: structure.structureType,
            pos: this.serializePos(structure.pos),
            priority: basePriority + this.damageBonus(structure.hits, targetHits),
            urgency: structure.hits < targetHits * 0.5 ? 'urgent' : 'routine',
            reason,
            targetHits,
            executor: 'builder',
            repairClass
        };
    }

    containerRole(pos, cityPlan) {
        if (cityPlan.controller && this.samePos(pos, cityPlan.controller.containerPos)) return 'controller_container';
        if (cityPlan.sources) {
            for (const sourceId in cityPlan.sources) {
                if (this.samePos(pos, cityPlan.sources[sourceId].containerPos)) return 'source_container';
            }
        }
        return 'container';
    }

    defenseTargetsFor(room, cityPlan) {
        const planned = cityPlan && cityPlan.defense && cityPlan.defense.repairTargets;
        if (planned) return planned;

        const targets = { 1: 10000, 2: 50000, 3: 100000, 4: 300000, 5: 1000000, 6: 3000000 };
        return {
            rampartHits: targets[room.controller.level] || 10000,
            wallHits: targets[room.controller.level] || 10000
        };
    }

    postureFor(roomName) {
        const posture = global.WarStrategy && global.WarStrategy[roomName] && global.WarStrategy[roomName].posture;
        if (posture === 'attack' || posture === 'defend') return 'siege';
        if (posture === 'rally') return 'alert';
        return 'peace';
    }

    quotasFor(posture) {
        if (posture === 'siege') return { urgent: 6, routine: 6, longTerm: 2 };
        if (posture === 'alert') return { urgent: 4, routine: 6, longTerm: 4 };
        return { urgent: 3, routine: 5, longTerm: 6 };
    }

    damageBonus(hits, targetHits) {
        if (targetHits <= 0) return 0;
        return Math.floor((1 - (hits / targetHits)) * 20);
    }

    samePos(a, b) {
        return !!a && !!b && a.x === b.x && a.y === b.y && a.roomName === b.roomName;
    }

    serializePos(pos) {
        return pos ? { x: pos.x, y: pos.y, roomName: pos.roomName } : null;
    }
}

export default MaintenancePlannerService;
