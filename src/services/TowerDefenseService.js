import BaseService from '../core/BaseService.js';

class TowerDefenseService extends BaseService {
    run() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;

            const towers = room.find(FIND_MY_STRUCTURES, {
                filter: { structureType: STRUCTURE_TOWER }
            });
            if (towers.length === 0) continue;

            const security = global.Security && global.Security[roomName];
            if (security && security.primaryTargetId) {
                const target = Game.getObjectById(security.primaryTargetId);
                if (target) {
                    towers.forEach((tower) => tower.attack(target));
                    continue;
                }
            }

            const injured = room.find(FIND_MY_CREEPS, { filter: (creep) => creep.hits < creep.hitsMax });
            if (injured.length > 0) {
                towers.forEach((tower) => tower.heal(injured[0]));
                continue;
            }

            if (towers[0].store.getUsedCapacity(RESOURCE_ENERGY) > 700) {
                this.repairDefenses(room, towers);
            }
        }
    }

    repairDefenses(room, towers) {
        const targets = { 1: 10000, 2: 50000, 3: 100000, 4: 300000, 5: 1000000, 6: 3000000 };
        const targetHits = targets[room.controller.level] || 10000;
        const defenses = room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL) &&
                    structure.hits < targetHits;
            }
        }).sort((a, b) => a.hits - b.hits);

        if (defenses.length > 0) towers.forEach((tower) => tower.repair(defenses[0]));
    }
}

export default TowerDefenseService;
