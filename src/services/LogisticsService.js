import BaseService from '../core/BaseService.js';
import EventBus from '../core/EventBus.js';
import TaskTypes from '../core/TaskTypes.js';

class LogisticsService extends BaseService {
    constructor(serviceName) {
        super(serviceName);
        this.idleHaulers = [];
        EventBus.subscribe('REQ_LOGISTICS', this.handleLogisticsRequest.bind(this));
    }

    init() {
        this.idleHaulers = [];
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role === 'hauler' && !creep.memory.task) {
                this.idleHaulers.push(creep);
            }
        }
    }

    handleLogisticsRequest(event) {
        if (this.idleHaulers.length === 0) return false;

        const data = event.data;
        const target = Game.getObjectById(data.targetId);
        if (!target) return true;

        const best = this.findNearestHauler(target, data);
        if (!best) return false;

        this.idleHaulers.splice(best.index, 1);
        best.creep.memory.task = this.createTask(data);
        return true;
    }

    findNearestHauler(target, data) {
        let best = null;
        let bestRange = Infinity;

        for (let i = 0; i < this.idleHaulers.length; i++) {
            const creep = this.idleHaulers[i];
            if (data.action === 'deliver' && creep.store.getUsedCapacity(data.resourceType || RESOURCE_ENERGY) === 0) {
                continue;
            }
            if (data.action === 'withdraw' && creep.store.getFreeCapacity() === 0) {
                continue;
            }
            const range = creep.pos.getRangeTo(target.pos);
            if (range < bestRange) {
                best = { creep, index: i };
                bestRange = range;
            }
        }

        return best;
    }

    createTask(data) {
        if (data.action === 'withdraw') {
            return {
                type: TaskTypes.WITHDRAW,
                targetId: data.targetId,
                resourceType: data.resourceType || RESOURCE_ENERGY,
                amount: data.amount
            };
        }

        return {
            type: TaskTypes.TRANSFER,
            targetId: data.targetId,
            resourceType: data.resourceType || RESOURCE_ENERGY,
            amount: data.amount
        };
    }
}

export default LogisticsService;
