import BaseService from '../core/BaseService.js';

class TowerDefenseService extends BaseService {
    run() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;

            const towers = room.find(FIND_MY_STRUCTURES, {
                filter: (structure) => structure.structureType === STRUCTURE_TOWER
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
        if (this.repairMaintenanceEmergency(room, towers)) return;

        const repairTargets = this.repairTargetsFor(room);
        const defenses = room.find(FIND_STRUCTURES)
            .filter((structure) => {
                if (structure.structureType === STRUCTURE_RAMPART) {
                    return structure.hits < repairTargets.rampartHits;
                }
                if (structure.structureType === STRUCTURE_WALL) {
                    return structure.hits < repairTargets.wallHits;
                }
                return false;
            })
            .sort((a, b) => a.hits - b.hits);

        if (defenses.length > 0) towers.forEach((tower) => tower.repair(defenses[0]));
    }

    repairMaintenanceEmergency(room, towers) {
        const targets = Memory.rooms &&
            Memory.rooms[room.name] &&
            Memory.rooms[room.name].maintenancePlan &&
            Memory.rooms[room.name].maintenancePlan.targets;
        if (!targets || targets.length === 0) return false;

        const structures = room.find(FIND_STRUCTURES);
        const emergency = targets.find((entry) => entry.executor === 'tower');
        if (!emergency) return false;

        const target = structures.find((structure) => structure.id === emergency.id);
        if (!target) return false;

        towers.forEach((tower) => tower.repair(target));
        return true;
    }

    repairTargetsFor(room) {
        const planned = Memory.rooms &&
            Memory.rooms[room.name] &&
            Memory.rooms[room.name].cityPlan &&
            Memory.rooms[room.name].cityPlan.defense &&
            Memory.rooms[room.name].cityPlan.defense.repairTargets;
        if (planned) return planned;

        const targets = { 1: 10000, 2: 50000, 3: 100000, 4: 300000, 5: 1000000, 6: 3000000 };
        return {
            rampartHits: targets[room.controller.level] || 10000,
            wallHits: targets[room.controller.level] || 10000
        };
    }
}

export default TowerDefenseService;
