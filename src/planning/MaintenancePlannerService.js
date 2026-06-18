import BaseService from '../core/BaseService.js';
import MemoryConfig from '../config/MemoryConfig.js';
import { getMaintenancePolicy } from './CityAssetPolicy.js';
import { getControllerContainerAsset, getSourceContainerAsset } from './CityPlanLegacyAdapter.js';
import { findPlannedStructureAtPos, findPlannedStructureForObject, getPlannedGroup, getPlannedRole, getStructureLifecycle } from './CityPlanHelpers.js';

const MAINTENANCE_PLAN_VERSION = 1;
const CORE_TYPES = new Set(['spawn', 'extension', 'tower', 'storage', 'terminal', 'lab', 'link', 'factory', 'powerSpawn', 'nuker', 'observer']);
const ECONOMIC_TYPES = new Set(['extractor']);

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
        const plannedRole = this.plannedRole(structure, cityPlan);

        if (structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL) {
            const plannedRole = this.plannedRole(structure, cityPlan);
            const lifecycle = getStructureLifecycle(cityPlan, structure);
            if (plannedRole === 'defense_rampart' && lifecycle.state === 'low_priority') {
                return this.standardTarget(structure, 'defense', 'defense_rampart_low_priority', 25000, 45, cityPlan);
            }
            if (plannedRole === 'defense_wall' && lifecycle.state === 'low_priority') {
                return this.standardTarget(structure, 'defense', 'defense_wall_low_priority', 25000, 40, cityPlan);
            }
            return this.defenseTarget(structure, posture, defenseTargets);
        }

        if (structure.structureType === STRUCTURE_CONTAINER) {
            return this.containerTarget(structure, cityPlan);
        }

        if (structure.structureType === STRUCTURE_ROAD) {
            const maintenancePolicy = getMaintenancePolicy(cityPlan, structure);
            if (!maintenancePolicy.shouldRepair) {
                return null;
            }
            if (maintenancePolicy.repairMode === 'band' && maintenancePolicy.reason === 'logistics_road_low_priority') {
                return this.bandTarget(structure, 'economic', maintenancePolicy.reason, maintenancePolicy.repairBelowRatio, maintenancePolicy.targetRatio, maintenancePolicy.priority, cityPlan);
            }
            return this.bandTarget(structure, 'economic', `${structure.structureType}_damage`, 0.65, 0.9, 60, cityPlan);
        }

        if (ECONOMIC_TYPES.has(structure.structureType)) {
            return this.standardTarget(structure, 'economic', this.plannedReason(plannedRole, structure.structureType), structure.hitsMax, 60, cityPlan);
        }

        if (CORE_TYPES.has(structure.structureType)) {
            return this.standardTarget(structure, 'core', this.plannedReason(plannedRole, structure.structureType), structure.hitsMax, 85, cityPlan);
        }

        return this.standardTarget(structure, 'economic', this.plannedReason(plannedRole, structure.structureType), structure.hitsMax, 50, cityPlan);
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
        const role = this.containerRole(structure.pos, cityPlan);
        const maintenancePolicy = getMaintenancePolicy(cityPlan, structure);
        if ((role === 'source_container' || role === 'controller_container') && !maintenancePolicy.shouldRepair) {
            return null;
        }
        if ((role === 'source_container' || role === 'controller_container') && maintenancePolicy.repairMode === 'band' && maintenancePolicy.reason) {
            return this.bandTarget(
                structure,
                'decay',
                maintenancePolicy.reason,
                maintenancePolicy.repairBelowRatio,
                maintenancePolicy.targetRatio,
                maintenancePolicy.priority,
                cityPlan
            );
        }
        const priority = role === 'source_container' ? 82 : (role === 'controller_container' ? 80 : 65);
        if (role === 'source_container' || role === 'controller_container') {
            return this.bandTarget(structure, 'decay', role, 0.75, 0.95, priority, cityPlan);
        }
        return this.bandTarget(structure, 'decay', role, 0.65, 0.9, priority, cityPlan);
    }

    standardTarget(structure, repairClass, reason, targetHits, basePriority, cityPlan = {}) {
        if (structure.hits >= targetHits) return null;

        return {
            id: structure.id,
            structureType: structure.structureType,
            pos: this.serializePos(structure.pos),
            priority: basePriority + this.damageBonus(structure.hits, targetHits),
            urgency: structure.hits < targetHits * 0.5 ? 'urgent' : 'routine',
            reason,
            targetHits,
            executor: 'repairer',
            repairClass,
            repairPolicy: 'full',
            ...this.targetPlanningMetadata(structure, cityPlan)
        };
    }

    bandTarget(structure, repairClass, reason, repairBelowRatio, targetRatio, basePriority, cityPlan = {}) {
        const repairBelow = Math.floor(structure.hitsMax * repairBelowRatio);
        const targetHits = Math.floor(structure.hitsMax * targetRatio);
        if (structure.hits >= repairBelow) return null;

        return {
            id: structure.id,
            structureType: structure.structureType,
            pos: this.serializePos(structure.pos),
            priority: basePriority + this.damageBonus(structure.hits, targetHits),
            urgency: structure.hits < repairBelow * 0.7 ? 'urgent' : 'routine',
            reason,
            repairBelow,
            targetHits,
            executor: 'repairer',
            repairClass,
            repairPolicy: 'band',
            ...this.targetPlanningMetadata(structure, cityPlan)
        };
    }

    containerRole(pos, cityPlan) {
        const planned = findPlannedStructureAtPos(cityPlan, pos, STRUCTURE_CONTAINER);
        if (planned && planned.role) return planned.role;

        const controllerContainer = getControllerContainerAsset(cityPlan, { allowLegacyFallback: false });
        if (controllerContainer && this.samePos(pos, controllerContainer.pos)) return 'controller_container';
        if (cityPlan.sources) {
            for (const sourceId in cityPlan.sources) {
                const sourceContainer = getSourceContainerAsset(cityPlan, sourceId, { allowLegacyFallback: false });
                if (sourceContainer && this.samePos(pos, sourceContainer.pos)) return 'source_container';
            }
        }
        return 'container';
    }

    plannedRole(structure, cityPlan) {
        return getPlannedRole(cityPlan, structure);
    }

    plannedGroup(structure, cityPlan) {
        return getPlannedGroup(cityPlan, structure);
    }

    plannedReason(plannedRole, structureType) {
        return plannedRole ? `${plannedRole}_damage` : `${structureType}_damage`;
    }

    targetPlanningMetadata(structure, cityPlan) {
        const planned = findPlannedStructureForObject(cityPlan, structure);
        const lifecycle = getStructureLifecycle(cityPlan, structure);
        return {
            plannedRole: planned && planned.role ? planned.role : null,
            plannedGroup: planned && planned.group ? planned.group : null,
            lifecycleState: lifecycle.state
        };
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
