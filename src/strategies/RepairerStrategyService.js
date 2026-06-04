import BaseService from '../core/BaseService.js';
import TaskTypes from '../core/TaskTypes.js';
import EventBus from '../core/EventBus.js';
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

        const repairTargetId = this.findMaintenanceTarget(creep.room);
        if (repairTargetId) creep.memory.task = { type: TaskTypes.REPAIR, targetId: repairTargetId };
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

        const target = maintenance.find((entry) => this.canRepair(entry));
        return target ? target.id : null;
    }

    canRepair(target) {
        return target.executor === 'builder' || target.executor === 'repairer';
    }
}

export default RepairerStrategyService;
