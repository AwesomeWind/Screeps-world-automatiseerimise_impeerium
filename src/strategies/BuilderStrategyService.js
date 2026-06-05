import BaseService from '../core/BaseService.js';
import TaskTypes from '../core/TaskTypes.js';
import EventBus from '../core/EventBus.js';
import WorkPositionCoordinator from '../core/WorkPositionCoordinator.js';
import { planWorkerEnergyTask, WAIT_SUPPLY } from '../services/ResourceMarketService.js';

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
            this.assignEnergyTask(creep, 'builder_work');
            return;
        }

        const cache = global.RoomCache && global.RoomCache[creep.room.name];
        const siteId = cache && cache.constructionSites[0];
        if (siteId) {
            const site = Game.getObjectById(siteId);
            creep.memory.task = this.withWorkPos(creep, {
                type: TaskTypes.BUILD,
                targetId: siteId
            }, site);
        }
        else {
            const repairTarget = this.findMaintenanceTarget(creep.room, false);
            if (repairTarget) {
                const structure = Game.getObjectById(repairTarget.id);
                creep.memory.task = {
                    ...this.withWorkPos(creep, {
                        type: TaskTypes.REPAIR,
                        targetId: repairTarget.id,
                        targetHits: repairTarget.targetHits
                    }, structure)
                };
            }
            else if (creep.room.controller) creep.memory.task = { type: TaskTypes.UPGRADE, targetId: creep.room.controller.id };
        }
    }

    assignEnergyTask(creep, purpose) {
        const energyTask = planWorkerEnergyTask(creep, { purpose, priority: 60 });
        if (!energyTask) return;

        if (energyTask.type === WAIT_SUPPLY) {
            this.requestEnergySupply(creep, energyTask.priority || 60, energyTask.purpose || purpose);
            return;
        }

        creep.memory.task = energyTask;
    }

    requestEnergySupply(creep, priority, purpose) {
        EventBus.publish('REQ_RESOURCE', priority, {
            roomName: creep.memory.homeRoom || creep.room.name,
            action: 'demand',
            resourceType: RESOURCE_ENERGY,
            amount: creep.store.getFreeCapacity ? creep.store.getFreeCapacity(RESOURCE_ENERGY) : undefined,
            targetId: creep.id || creep.name,
            priority,
            purpose
        }, 2);
    }

    findMaintenanceTarget(room, ignoreQuotas = false) {
        const maintenance = Memory.rooms &&
            Memory.rooms[room.name] &&
            Memory.rooms[room.name].maintenancePlan &&
            Memory.rooms[room.name].maintenancePlan.targets;
        if (!maintenance) return null;

        const firstRepairable = maintenance.find((entry) => this.isRepairableTarget(entry));
        if (ignoreQuotas) return firstRepairable || null;

        const quotas = Memory.rooms[room.name].maintenancePlan.quotas;
        if (!quotas) return firstRepairable || null;

        const used = { urgent: 0, routine: 0, longTerm: 0 };
        for (const target of maintenance) {
            if (!this.isRepairableTarget(target)) continue;
            const urgency = this.urgencyFor(target);
            used[urgency]++;
            const quota = quotas[urgency];
            if (quota === undefined || used[urgency] <= quota) return target;
        }
        return firstRepairable || null;
    }

    canRepair(target) {
        return target.executor === 'builder' || target.executor === 'repairer';
    }

    isRepairableTarget(target) {
        if (!this.canRepair(target)) return false;
        const structure = Game.getObjectById(target.id);
        if (!structure || structure.hits === undefined) return false;
        const targetHits = target.targetHits === undefined ? structure.hitsMax : target.targetHits;
        return targetHits === undefined || structure.hits < targetHits;
    }

    urgencyFor(target) {
        if (target.urgency === 'urgent' || target.urgency === 'longTerm') return target.urgency;
        return 'routine';
    }

    withWorkPos(creep, task, target) {
        const reservation = WorkPositionCoordinator.reserve(creep.room, creep, target);
        return reservation ? { ...task, ...reservation } : task;
    }
}

export default BuilderStrategyService;
