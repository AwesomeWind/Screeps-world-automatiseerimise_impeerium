import BaseService from '../core/BaseService.js';
import TaskTypes from '../core/TaskTypes.js';
import WorkPositionCoordinator from '../core/WorkPositionCoordinator.js';
import { assignTask } from '../core/TaskMetadata.js';
import { planWorkerEnergyTask } from '../services/ResourceMarketService.js';
import { recoveryRestricted, urgentRepair, controllerEmergency } from '../services/RoomRecoveryPolicy.js';

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
        const limited = recoveryRestricted(creep.memory.homeRoom || creep.room.name);
        const recoveryTarget = limited ? this.findMaintenanceTarget(creep.room) : null;
        if (limited && !recoveryTarget && !controllerEmergency(creep.room)) {
            creep.memory.recoveryState = { state: 'waiting_recovery', tick: Game.time };
            return;
        }
        delete creep.memory.recoveryState;
        if (limited) creep.memory.recoveryWorkTargetId = recoveryTarget ? recoveryTarget.id : creep.room.controller.id;
        else delete creep.memory.recoveryWorkTargetId;
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            this.assignEnergyTask(creep, limited && !recoveryTarget ? 'upgrade' : 'repair');
            return;
        }

        const repairTarget = limited ? recoveryTarget : this.findMaintenanceTarget(creep.room);
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

        return maintenance.find((entry) => this.isRepairableTarget(entry) &&
            (!recoveryRestricted(room.name) || urgentRepair(room.name, entry.id))) || null;
    }

    canRepair(target) {
        return target.executor === 'repairer';
    }

    isRepairableTarget(target) {
        if (!this.canRepair(target)) return false;
        if (target.lifecycleState === 'retiring' || target.lifecycleState === 'retired_ready') return false;
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
