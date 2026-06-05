import BaseService from '../core/BaseService.js';
import TaskTypes from '../core/TaskTypes.js';
import EventBus from '../core/EventBus.js';
import WorkPositionCoordinator from '../core/WorkPositionCoordinator.js';
import { planWorkerEnergyTask, WAIT_SUPPLY } from '../services/ResourceMarketService.js';

class RepairerStrategyService extends BaseService {
    analyze() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            this.ensureRepairers(room);
        }

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role === 'repairer' && !creep.memory.task) {
                this.assignRepairerTask(creep);
            }
        }
    }

    ensureRepairers(room) {
        return room;
    }

    assignRepairerTask(creep) {
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            this.assignEnergyTask(creep, 'repairer_work');
            return;
        }

        const repairTarget = this.findMaintenanceTarget(creep.room);
        if (repairTarget) {
            const structure = Game.getObjectById(repairTarget.id);
            creep.memory.task = this.withWorkPos(creep, {
                type: TaskTypes.REPAIR,
                targetId: repairTarget.id,
                targetHits: repairTarget.targetHits
            }, structure);
        }
        else if (creep.room.controller) creep.memory.task = { type: TaskTypes.UPGRADE, targetId: creep.room.controller.id };
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

    findMaintenanceTarget(room) {
        const maintenance = Memory.rooms &&
            Memory.rooms[room.name] &&
            Memory.rooms[room.name].maintenancePlan &&
            Memory.rooms[room.name].maintenancePlan.targets;
        if (!maintenance) return null;

        return maintenance.find((entry) => this.isRepairableTarget(entry)) || null;
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

    withWorkPos(creep, task, target) {
        const reservation = WorkPositionCoordinator.reserve(creep.room, creep, target);
        return reservation ? { ...task, ...reservation } : task;
    }
}

export default RepairerStrategyService;
