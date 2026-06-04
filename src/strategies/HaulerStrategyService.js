import BaseService from '../core/BaseService.js';

class HaulerStrategyService extends BaseService {
    analyze() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            this.ensureHaulers(room);
        }

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role === 'hauler' && !creep.memory.task) {
                this.assignHaulerTask(creep);
            }
        }
    }

    ensureHaulers(room) {
        return room;
    }

    assignHaulerTask(creep) {
        const marketService = global.ResourceMarketService;
        if (!marketService || !marketService.assignHauler) return false;
        return marketService.assignHauler(creep);
    }
}

export default HaulerStrategyService;
