import BaseService from '../core/BaseService.js';
import TaskTypes from '../core/TaskTypes.js';
import WorkPositionCoordinator from '../core/WorkPositionCoordinator.js';
import { assignTask } from '../core/TaskMetadata.js';
import { planWorkerEnergyTask } from '../services/ResourceMarketService.js';

const PHASE_CONSTRUCTION_PRIORITY = {
    bootstrap: {
        [STRUCTURE_SPAWN]: 10000,
        [STRUCTURE_EXTENSION]: 9500,
        [STRUCTURE_CONTAINER]: 7000,
        [STRUCTURE_STORAGE]: 5500,
        [STRUCTURE_TOWER]: 6000,
        default: 5500
    },
    early: {
        [STRUCTURE_SPAWN]: 10000,
        [STRUCTURE_EXTENSION]: 9500,
        [STRUCTURE_CONTAINER]: 7200,
        [STRUCTURE_STORAGE]: 6000,
        [STRUCTURE_TOWER]: 7000,
        default: 5800
    },
    storage: {
        [STRUCTURE_SPAWN]: 10000,
        [STRUCTURE_EXTENSION]: 9500,
        [STRUCTURE_STORAGE]: 9200,
        [STRUCTURE_TOWER]: 8800,
        [STRUCTURE_CONTAINER]: 7600,
        default: 6200
    },
    terminal: {
        [STRUCTURE_SPAWN]: 10000,
        [STRUCTURE_EXTENSION]: 9500,
        [STRUCTURE_TOWER]: 9000,
        [STRUCTURE_STORAGE]: 9000,
        [STRUCTURE_CONTAINER]: 7600,
        default: 6500
    }
};

const CRITICAL_ROAD_BONUS = {
    bootstrap: 3800,
    early: 3200,
    storage: 1200,
    terminal: 800,
    default: 1600
};

const CRITICAL_CONTAINER_BONUS = {
    bootstrap: 2600,
    early: 2200,
    storage: 1200,
    terminal: 800,
    default: 1500
};

class BuilderStrategyService extends BaseService {
    analyze() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            this.ensureBuilders(room);
        }

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role === 'builder' && !creep.memory.task) {
                this.assignBuilderTask(creep);
            }
        }
    }

    ensureBuilders(room) {
        return room;
    }

    getSpawnPriority(room) {
        if (this.countRole(room.name, 'builder') > 0) return 30;
        if (room.find(FIND_CONSTRUCTION_SITES).length === 0) return 30;
        if (this.countRole(room.name, 'miner') > 0 &&
            this.countRole(room.name, 'hauler') > 0 &&
            this.countRole(room.name, 'upgrader') > 0) {
            return 54;
        }
        return 30;
    }

    countRole(roomName, role) {
        let count = 0;
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role === role && creep.memory.homeRoom === roomName) count++;
        }
        if (typeof Memory !== 'undefined' && Memory.creeps) {
            for (const name in Memory.creeps) {
                if (Game.creeps[name]) continue;
                const memory = Memory.creeps[name];
                if (memory.role === role && memory.homeRoom === roomName) count++;
            }
        }
        return count;
    }

    assignBuilderTask(creep) {
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            this.assignEnergyTask(creep, 'build');
            return;
        }

        const site = this.findConstructionSite(creep);
        if (site) {
            assignTask(creep, this.withWorkPos(creep, {
                type: TaskTypes.BUILD,
                targetId: site.id
            }, site));
            this.recordBuilderState(creep, 'assigned_build', { targetId: site.id });
        }
        else if (creep.room.controller) {
            assignTask(creep, { type: TaskTypes.UPGRADE, targetId: creep.room.controller.id });
            this.recordBuilderState(creep, 'assigned_upgrade_fallback', { targetId: creep.room.controller.id });
        }
        else {
            this.recordBuilderState(creep, 'no_work_target');
        }
    }

    findConstructionSite(creep) {
        const room = creep.room;
        const sites = this.getConstructionSites(room);
        if (sites.length === 0) return null;

        let bestSite = null;
        let bestScore = -Infinity;
        for (const site of sites) {
            const score = this.scoreConstructionSite(creep, site);
            if (score > bestScore) {
                bestSite = site;
                bestScore = score;
            }
        }
        return bestSite;
    }

    getConstructionSites(room) {
        const cache = global.RoomCache && global.RoomCache[room.name];
        const sites = [];
        if (cache && cache.constructionSites) {
            for (const siteId of cache.constructionSites) {
                const site = Game.getObjectById(siteId);
                if (site) sites.push(site);
                else cache.isDirty = true;
            }
            if (sites.length > 0) return sites;
        }

        const liveSites = room.find ? room.find(FIND_CONSTRUCTION_SITES) : [];
        if (liveSites.length > 0) {
            if (cache) cache.isDirty = true;
            return liveSites;
        }
        return [];
    }

    scoreConstructionSite(creep, site) {
        const phase = this.getRoomPhase(creep.room.name);
        const priority = this.phasePriorityFor(phase, site.structureType);
        const distance = this.rangeBetween(creep, site);
        const assignedBuilders = this.countAssignedBuilders(site.id);
        const completion = site.progressTotal > 0 ? (site.progress || 0) / site.progressTotal : 0;
        const criticalRoadBonus = this.isCriticalRoadSite(creep.room.name, site) ? this.phaseBonus(CRITICAL_ROAD_BONUS, phase) : 0;
        const criticalContainerBonus = this.isCriticalContainerSite(creep.room.name, site) ? this.phaseBonus(CRITICAL_CONTAINER_BONUS, phase) : 0;
        return priority + criticalRoadBonus + criticalContainerBonus - distance * 25 - assignedBuilders * 100 + completion * 50;
    }

    getRoomPhase(roomName) {
        return global.RoomPhase && global.RoomPhase[roomName] && global.RoomPhase[roomName].phase ?
            global.RoomPhase[roomName].phase :
            'early';
    }

    phasePriorityFor(phase, structureType) {
        const priorities = PHASE_CONSTRUCTION_PRIORITY[phase] || PHASE_CONSTRUCTION_PRIORITY.early;
        return priorities[structureType] || priorities.default || 6000;
    }

    phaseBonus(table, phase) {
        return table[phase] !== undefined ? table[phase] : table.default;
    }

    rangeBetween(creep, target) {
        if (!creep || !creep.pos || !target || !target.pos) return 25;
        if (typeof creep.pos.getRangeTo === 'function') return creep.pos.getRangeTo(target.pos);
        return Math.max(
            Math.abs((creep.pos.x || 0) - (target.pos.x || 0)),
            Math.abs((creep.pos.y || 0) - (target.pos.y || 0))
        );
    }

    countAssignedBuilders(targetId) {
        let count = 0;
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (!creep.memory || creep.memory.role !== 'builder') continue;
            if (!creep.memory.task || creep.memory.task.type !== TaskTypes.BUILD) continue;
            if (creep.memory.task.targetId !== targetId) continue;
            count++;
        }
        return count;
    }

    isCriticalRoadSite(roomName, site) {
        if (!site || site.structureType !== STRUCTURE_ROAD || !site.pos) return false;
        const roomMemory = Memory.rooms && Memory.rooms[roomName];
        const roadNetwork = roomMemory && roomMemory.roadNetwork ? roomMemory.roadNetwork : [];
        return roadNetwork.indexOf(`${site.pos.x},${site.pos.y}`) !== -1;
    }

    isCriticalContainerSite(roomName, site) {
        if (!site || site.structureType !== STRUCTURE_CONTAINER || !site.pos) return false;
        const cityPlan = Memory.rooms &&
            Memory.rooms[roomName] &&
            Memory.rooms[roomName].cityPlan;
        if (!cityPlan) return false;

        if (cityPlan.controller && this.samePos(site.pos, cityPlan.controller.containerPos)) return true;
        if (cityPlan.sources) {
            for (const sourceId in cityPlan.sources) {
                if (this.samePos(site.pos, cityPlan.sources[sourceId].containerPos)) return true;
            }
        }
        return false;
    }

    samePos(left, right) {
        return !!left && !!right &&
            left.x === right.x &&
            left.y === right.y &&
            left.roomName === right.roomName;
    }

    assignEnergyTask(creep, purpose) {
        const market = global.ResourceMarketService;
        if (!market || !market.requestResource) {
            const energyTask = planWorkerEnergyTask(creep, { purpose, priority: 60 });
            if (energyTask) {
                assignTask(creep, energyTask);
                this.recordBuilderState(creep, 'assigned_energy_task', { taskType: energyTask.type });
            } else {
                this.recordBuilderState(creep, 'no_energy_task');
            }
            return;
        }
        const response = market.requestResource(creep, {
            resourceType: RESOURCE_ENERGY,
            amount: creep.store.getFreeCapacity ? creep.store.getFreeCapacity(RESOURCE_ENERGY) : 50,
            purpose,
            targetId: creep.id || creep.name,
            targetPos: creep.pos ? { x: creep.pos.x, y: creep.pos.y, roomName: creep.pos.roomName } : null,
            priority: 60,
            allowedFulfillment: ['self_fetch', 'delivery']
        });
        if (response && response.mode === 'self_fetch') {
            assignTask(creep, response.task);
            this.recordBuilderState(creep, 'assigned_self_fetch', { taskType: response.task && response.task.type });
            return;
        }
        if (response && response.mode === 'delivery') {
            this.recordBuilderState(creep, 'waiting_resource_delivery', { demandId: response.demandId });
            return;
        }
        if (response && response.mode === 'unavailable') {
            this.recordBuilderState(creep, 'waiting_resource_unavailable', { reason: response.reason });
            return;
        }
        this.recordBuilderState(creep, 'resource_request_failed');
    }

    withWorkPos(creep, task, target) {
        const reservation = WorkPositionCoordinator.reserve(creep.room, creep, target);
        return reservation ? { ...task, ...reservation } : task;
    }

    recordBuilderState(creep, state, extra = {}) {
        creep.memory.builderState = {
            state,
            tick: Game.time,
            energy: creep.store && creep.store.getUsedCapacity ? creep.store.getUsedCapacity(RESOURCE_ENERGY) : 0,
            taskType: creep.memory.task && creep.memory.task.type ? creep.memory.task.type : null,
            ...extra
        };
    }
}

export default BuilderStrategyService;
