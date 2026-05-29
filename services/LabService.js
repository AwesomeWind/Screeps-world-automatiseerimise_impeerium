const BaseService = require('core/BaseService');
const EventBus = require('core/EventBus');
const MemoryConfig = require('config/MemoryConfig');

class LabService extends BaseService {
    analyze() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || room.controller.level < 6) continue;
            if (!MemoryConfig.flag(roomName, 'lab', true)) continue;

            const task = room.memory.labTask;
            if (!task || !task.product || !task.amount) continue;

            const labs = global.RoomCache[roomName] && global.RoomCache[roomName].labs;
            if (!labs || !labs.input1 || !labs.input2 || labs.outputs.length === 0) continue;

            const input1 = Game.getObjectById(labs.input1);
            const input2 = Game.getObjectById(labs.input2);
            const outputs = labs.outputs.map((id) => Game.getObjectById(id)).filter(Boolean);
            if (!input1 || !input2 || outputs.length === 0) continue;

            if (!room.memory.labState) room.memory.labState = 'PREPARE';

            if (room.memory.labState === 'PREPARE') this.prepare(room, input1, input2, task);
            else if (room.memory.labState === 'REACTING') this.react(room, input1, input2, outputs, task);
            else if (room.memory.labState === 'EMPTYING') this.empty(room, [input1, input2].concat(outputs));
        }
    }

    prepare(room, input1, input2, task) {
        const reagents = this.getReagents(task.product);
        if (!reagents) {
            room.memory.labState = 'IDLE';
            return;
        }

        const ready1 = input1.store.getUsedCapacity(reagents[0]) >= task.amount;
        const ready2 = input2.store.getUsedCapacity(reagents[1]) >= task.amount;

        if (ready1 && ready2) {
            room.memory.labState = 'REACTING';
            return;
        }

        if (!ready1) this.requestLabDelivery(input1.id, reagents[0], task.amount);
        if (!ready2) this.requestLabDelivery(input2.id, reagents[1], task.amount);
    }

    react(room, input1, input2, outputs, task) {
        let productAmount = 0;
        for (const lab of outputs) {
            productAmount += lab.store.getUsedCapacity(task.product);
            if (lab.cooldown === 0) lab.runReaction(input1, input2);
        }

        if (productAmount >= task.amount ||
            input1.store.getUsedCapacity() === 0 ||
            input2.store.getUsedCapacity() === 0) {
            room.memory.labState = 'EMPTYING';
        }
    }

    empty(room, labs) {
        let isEmpty = true;
        for (const lab of labs) {
            const resources = Object.keys(lab.store).filter((resource) => lab.store.getUsedCapacity(resource) > 0);
            for (const resourceType of resources) {
                isEmpty = false;
                EventBus.publish('REQ_LOGISTICS', 90, {
                    action: 'withdraw',
                    targetId: lab.id,
                    resourceType
                }, 3);
            }
        }
        if (isEmpty) {
            room.memory.labState = 'IDLE';
            room.memory.labTask = null;
        }
    }

    requestLabDelivery(targetId, resourceType, amount) {
        EventBus.publish('REQ_LOGISTICS', 80, {
            action: 'deliver',
            targetId,
            resourceType,
            amount
        }, 3);
    }

    getReagents(product) {
        for (const a in REACTIONS) {
            for (const b in REACTIONS[a]) {
                if (REACTIONS[a][b] === product) return [a, b];
            }
        }
        return null;
    }
}

module.exports = LabService;
