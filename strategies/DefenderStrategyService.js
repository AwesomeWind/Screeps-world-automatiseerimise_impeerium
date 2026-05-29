const BaseService = require('core/BaseService');
const TaskTypes = require('core/TaskTypes');

class DefenderStrategyService extends BaseService {
    analyze() {
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role !== 'defender' || creep.memory.task) continue;

            const roomName = creep.memory.targetRoom || creep.room.name;
            if (creep.room.name !== roomName) {
                creep.memory.task = {
                    type: TaskTypes.MOVE_TO,
                    pos: { x: 25, y: 25, roomName },
                    range: 20
                };
                continue;
            }

            const targetId = global.Security && global.Security[roomName] ? global.Security[roomName].primaryTargetId : null;
            if (targetId) {
                creep.memory.task = { type: TaskTypes.ATTACK, targetId };
            }
        }
    }
}

module.exports = DefenderStrategyService;
