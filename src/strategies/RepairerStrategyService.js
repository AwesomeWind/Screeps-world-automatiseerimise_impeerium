import BaseService from '../core/BaseService.js';
import TaskTypes from '../core/TaskTypes.js';
import WorkPositionCoordinator from '../core/WorkPositionCoordinator.js';
import { assignTask } from '../core/TaskMetadata.js';
import { planWorkerEnergyTask } from '../services/ResourceMarketService.js';

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
            this.assignEnergyTask(creep, 'repair');
            return;
        }

        const repairTarget = this.findMaintenanceTarget(creep.room);
        if (repairTarget) {
            const structure = Game.getObjectById(repairTarget.id);
            assignTask(creep, this.withWorkPos(creep, {
                type: TaskTypes.REPAIR,
                targetId: repairTarget.id,
                targetHits: repairTarget.targetHits
            }, structure));
        }
        else if (creep.room.controller) assignTask(creep, { type: TaskTypes.UPGRADE, targetId: creep.room.controller.id });
    }

    assignEnergyTask(creep, purpose) {
        const market = global.ResourceMarketService;
        if (!market || !market.requestResource) {
            const energyTask = planWorkerEnergyTask(creep, { purpose, priority: 60 });
            if (energyTask) assignTask(creep, energyTask);
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
        if (response && response.mode === 'self_fetch') assignTask(creep, response.task);
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
        return target.executor === 'repairer';
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
