import BaseService from '../core/BaseService.js';
import TaskTypes from '../core/TaskTypes.js';
import { assignTask } from '../core/TaskMetadata.js';

class DefenderStrategyService extends BaseService {
    analyze() {
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role !== 'defender' || creep.memory.task) continue;

            const roomName = creep.memory.targetRoom || creep.room.name;
            if (creep.room.name !== roomName) {
                assignTask(creep, {
                    type: TaskTypes.MOVE_TO,
                    pos: { x: 25, y: 25, roomName },
                    range: 20
                });
                continue;
            }

            const plan = this.getCombatPlan(roomName);
            if (plan && this.assignPlanTask(creep, plan)) continue;

            const posture = this.getPosture(roomName);
            if (posture === 'develop' || posture === 'avoid') {
                const rallyPos = this.findRallyPos(creep.room);
                if (rallyPos) {
                    assignTask(creep, {
                        type: TaskTypes.MOVE_TO,
                        pos: rallyPos,
                        range: 3
                    });
                }
                continue;
            }

            const targetId = this.findTargetId(creep, roomName);
            if (targetId) {
                this.assignAttackTask(creep, targetId);
            }
        }
    }

    assignPlanTask(creep, plan) {
        if (plan.posture === 'avoid' || plan.posture === 'develop' || plan.posture === 'rally') {
            const rallyPos = plan.retreatPoint || plan.rallyPoint;
            if (!rallyPos) return false;
            assignTask(creep, {
                type: TaskTypes.MOVE_TO,
                pos: rallyPos,
                range: 3
            });
            return true;
        }

        if ((plan.posture === 'defend' || plan.posture === 'attack') && plan.primaryTargetId) {
            this.assignAttackTask(creep, plan.primaryTargetId);
            return true;
        }

        return false;
    }

    assignAttackTask(creep, targetId) {
        assignTask(creep, {
            type: this.hasBodyPart(creep, RANGED_ATTACK) ? TaskTypes.RANGED_ATTACK : TaskTypes.ATTACK,
            targetId
        });
    }

    findTargetId(creep, roomName) {
        const room = creep.room && creep.room.name === roomName ? creep.room : Game.rooms[roomName] || creep.room;
        if (room && room.find) {
            const hostiles = room.find(FIND_HOSTILE_CREEPS);
            if (hostiles.length > 0) return this.pickPriorityTarget(hostiles).id;
        }

        const cachedTargetId = global.Security && global.Security[roomName] ? global.Security[roomName].primaryTargetId : null;
        return cachedTargetId || null;
    }

    pickPriorityTarget(hostiles) {
        let best = hostiles[0];
        let bestScore = this.scoreHostile(best);
        for (let i = 1; i < hostiles.length; i++) {
            const score = this.scoreHostile(hostiles[i]);
            if (score > bestScore) {
                best = hostiles[i];
                bestScore = score;
            }
        }
        return best;
    }

    scoreHostile(hostile) {
        return this.getActiveBodyparts(hostile, HEAL) * 100 +
            this.getActiveBodyparts(hostile, RANGED_ATTACK) * 60 +
            this.getActiveBodyparts(hostile, ATTACK) * 40 +
            this.getActiveBodyparts(hostile, TOUGH) * 5;
    }

    getActiveBodyparts(creep, partType) {
        return creep.getActiveBodyparts ? creep.getActiveBodyparts(partType) : 0;
    }

    hasBodyPart(creep, partType) {
        if (creep.getActiveBodyparts) return creep.getActiveBodyparts(partType) > 0;
        if (!creep.body) return false;
        return creep.body.some((part) => (part.type || part) === partType);
    }

    getPosture(roomName) {
        const security = global.Security && global.Security[roomName];
        return security && security.posture ? security.posture : 'defend';
    }

    getCombatPlan(roomName) {
        return global.CombatPlan && global.CombatPlan[roomName] ? global.CombatPlan[roomName] : null;
    }

    findRallyPos(room) {
        if (!room || !room.find) return null;
        const anchors = room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_SPAWN ||
                structure.structureType === STRUCTURE_TOWER ||
                structure.structureType === STRUCTURE_RAMPART
        });
        if (anchors.length === 0 || !anchors[0].pos) return null;
        return {
            x: anchors[0].pos.x,
            y: anchors[0].pos.y,
            roomName: anchors[0].pos.roomName || room.name
        };
    }
}

export default DefenderStrategyService;
