const BaseService = require('core/BaseService');
const EventBus = require('core/EventBus');

class SecurityService extends BaseService {
    constructor(serviceName) {
        super(serviceName);
        if (!global.Security) global.Security = {};
    }

    analyze() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;

            const hostiles = room.find(FIND_HOSTILE_CREEPS);
            if (hostiles.length === 0) {
                global.Security[roomName] = { defcon: 5, primaryTargetId: null };
                continue;
            }

            const armed = hostiles.find((creep) => {
                return creep.getActiveBodyparts(ATTACK) > 0 ||
                    creep.getActiveBodyparts(RANGED_ATTACK) > 0 ||
                    creep.getActiveBodyparts(HEAL) > 0;
            }) || hostiles[0];

            const isPlayerThreat = armed.owner && armed.owner.username !== 'Invader';
            const defcon = isPlayerThreat ? 1 : 3;
            global.Security[roomName] = { defcon, primaryTargetId: armed.id };

            if (defcon === 1) {
                EventBus.publish('REQ_SPAWN', 999, {
                    roomName,
                    role: 'defender',
                    body: this.getDefenderBody(room.energyCapacityAvailable),
                    memory: { role: 'defender', targetRoom: roomName }
                }, 1);
            }
        }
    }

    getDefenderBody(energyCapacity) {
        if (energyCapacity >= 800) return [TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE];
        return [TOUGH, ATTACK, MOVE];
    }
}

module.exports = SecurityService;
