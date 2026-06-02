import BaseService from '../core/BaseService.js';

class WarStrategyService extends BaseService {
    constructor(serviceName) {
        super(serviceName);
        if (!global.WarStrategy) global.WarStrategy = {};
    }

    analyze() {
        global.WarStrategy = {};
        const intelByRoom = global.WarIntel || {};
        for (const roomName in intelByRoom) {
            global.WarStrategy[roomName] = this.buildStrategy(roomName, intelByRoom[roomName]);
        }
    }

    buildStrategy(roomName, intel) {
        const config = this.getConfig(roomName);
        const posture = this.pickPosture(intel, config);
        const rallyPoint = this.pickRallyPoint(roomName, intel);
        return {
            posture,
            primaryTargetId: intel.primaryHostileId,
            rallyPoint,
            retreatPoint: rallyPoint,
            spawnDefender: posture === 'defend' || posture === 'rally' || posture === 'attack',
            suspendUnsafeEconomy: posture !== 'recover',
            minDefendersToAttack: config.minDefendersToAttack
        };
    }

    pickPosture(intel, config) {
        if (!intel.hostiles || intel.hostiles.length === 0) return 'recover';
        if (intel.totalDefenseStrength === 0) return 'develop';
        if (intel.hostileStrength > intel.totalDefenseStrength * 2) return 'avoid';
        if (intel.hostileStrength > intel.totalDefenseStrength * 1.5) return 'develop';
        if (intel.totalDefenseStrength > intel.hostileStrength * 1.5 &&
            this.countDefenders() >= config.minDefendersToAttack) {
            return 'attack';
        }
        if (this.countDefenders() < config.minDefendersToAttack) return 'rally';
        return 'defend';
    }

    pickRallyPoint(roomName, intel) {
        if (intel.safeRallyPoints && intel.safeRallyPoints.length > 0) return intel.safeRallyPoints[0];
        const room = Game.rooms[roomName];
        if (room && room.controller && room.controller.pos) {
            return { x: room.controller.pos.x, y: room.controller.pos.y, roomName };
        }
        return { x: 25, y: 25, roomName };
    }

    countDefenders() {
        let count = 0;
        for (const name in Game.creeps) {
            if (Game.creeps[name].memory.role === 'defender') count++;
        }
        return count;
    }

    getConfig(roomName) {
        const roomMemory = Memory.rooms && Memory.rooms[roomName] ? Memory.rooms[roomName] : {};
        const config = roomMemory.warConfig || {};
        return {
            minDefendersToAttack: config.minDefendersToAttack || 2
        };
    }
}

export default WarStrategyService;
