import BaseService from '../core/BaseService.js';

class CombatPlannerService extends BaseService {
    constructor(serviceName) {
        super(serviceName);
        if (!global.CombatPlan) global.CombatPlan = {};
    }

    analyze() {
        global.CombatPlan = {};
        const strategies = global.WarStrategy || {};
        for (const roomName in strategies) {
            global.CombatPlan[roomName] = this.buildPlan(roomName, strategies[roomName]);
        }
    }

    buildPlan(roomName, strategy) {
        const intel = global.WarIntel && global.WarIntel[roomName] ? global.WarIntel[roomName] : {};
        return {
            posture: strategy.posture,
            primaryTargetId: strategy.primaryTargetId,
            rallyPoint: strategy.rallyPoint,
            retreatPoint: strategy.retreatPoint || strategy.rallyPoint,
            allowPursuit: strategy.posture === 'attack',
            avoidZones: intel.dangerZones || {}
        };
    }
}

export default CombatPlannerService;
