import BaseService from '../core/BaseService.js';
import TaskTypes from '../core/TaskTypes.js';
import { assignTask, clearTaskState, registerTaskObservation } from '../core/TaskMetadata.js';
import { ensureEmpireControl } from '../config/EmpirePolicy.js';
import { planRemoteRoute, createRemoteMoveTask, pathAvoidsDanger } from '../services/RemoteMiningRoute.js';
import { reserveInfrastructureAttempt } from '../services/RemoteMiningLedger.js';
import { remoteActorIdentityMatches, remoteQuotaKey } from '../services/RemoteMiningState.js';
import { getReconTrialPermit } from '../services/RemoteReconTrialService.js';
import { getEconomicTrialPermit } from '../services/RemoteEconomicTrialService.js';

const MOVE_RETRY_LIMIT = 1;
const MOVE_RETRY_COOLDOWN_TICKS = 2;

function movementGoal(pos, range) {
    return { x: pos.x, y: pos.y, roomName: pos.roomName, range };
}

function moveFailureMatchesGoal(clear, goal, leg) {
    if (clear?.taskType !== TaskTypes.MOVE_TO) return false;
    if (clear.moveGoal && (clear.moveGoal.roomName !== goal.roomName ||
        clear.moveGoal.x !== goal.x || clear.moveGoal.y !== goal.y)) return false;
    return !Number.isFinite(clear.legExpiresAt) || clear.legExpiresAt === leg.expiresAt;
}

export default class RemoteMiningStrategyService extends BaseService {
    analyze() {
        for (const creep of Object.values(Game.creeps)) {
            if (creep.spawning) continue;
            if (creep.memory.remoteStatus === 'orphaned_actor') {
                if (creep.memory.task) clearTaskState(creep, 'orphaned_remote_actor');
                continue;
            }
            if (!creep.memory.remoteId) continue;
            const scope = global.RemoteMining && global.RemoteMining[creep.memory.remoteId];
            if (!scope || creep.memory.epoch !== scope.operation.epoch) {
                if (creep.memory.task) clearTaskState(creep, 'invalid_remote_identity');
                creep.memory.remoteStatus = 'orphaned_actor';
                continue;
            }
            if (!remoteActorIdentityMatches(creep.memory, scope.config)) {
                if (creep.memory.task) clearTaskState(creep, 'remote_identity_conflict');
                creep.memory.remoteStatus = 'identity_conflict';
                continue;
            }
            const economic = getEconomicTrialPermit({ remoteId: creep.memory.remoteId, epoch: creep.memory.epoch,
                trialId: creep.memory.economicTrialId, sequence: creep.memory.economicTrialSequence,
                role: creep.memory.role, name: creep.name, action: 'outbound' });
            if (economic.managed && !economic.allowed) {
                if (creep.memory.task && !global.RemoteEconomicTrial?.service?.taskPermission(creep, creep.memory.task).allowed) {
                    clearTaskState(creep, 'economic_trial_stopped');
                }
                if (creep.memory.role === 'remoteHauler') this.assignRemoteHaulerTask(creep, scope.operation, scope.facts,
                    { ...scope.state, allowEconomicDeparture: false });
                else this.returnActor(creep, scope.operation, scope.facts);
                continue;
            }
            Object.assign(creep.memory, {
                homeRoom: scope.config.baseRoom, targetRoom: scope.config.targetRoom,
                sourceId: scope.config.sourceId, quotaKey: remoteQuotaKey(scope.config, creep.memory.role)
            });
            if (scope.operation.pendingConfig) creep.memory.remoteRetiring = true;
            if (creep.memory.task?.type === TaskTypes.MOVE_TO && creep.memory.task.pos &&
                creep.pos.inRangeTo(creep.memory.task.pos, creep.memory.task.range ?? 1)) {
                clearTaskState(creep, 'remote_leg_arrived');
                if (creep.memory.remoteLeg) delete creep.memory.remoteLeg.goalKey;
            }
            if (creep.memory.role === 'remoteMiner') this.prepareMinerHandoff(creep, scope.operation);
            const trial = getReconTrialPermit({ remoteId: creep.memory.remoteId, epoch: creep.memory.epoch,
                trialId: creep.memory.reconTrialId, sequence: creep.memory.reconTrialSequence, action: 'outbound' });
            if (trial.managed && !trial.allowOutbound && creep.memory.task?.type === TaskTypes.MOVE_TO &&
                creep.memory.task.pos?.roomName !== scope.config.baseRoom) clearTaskState(creep, 'recon_trial_stopped');
            if (creep.memory.task?.type === TaskTypes.MOVE_TO &&
                !pathAvoidsDanger(creep.memory.task.path, scope.operation.lastDangerZones || [])) {
                clearTaskState(creep, 'remote_route_danger_changed');
            }
            if (!scope.state.allowEconomicDeparture &&
                [TaskTypes.HARVEST, TaskTypes.BUILD, TaskTypes.REPAIR, TaskTypes.WITHDRAW, TaskTypes.RESERVE].includes(creep.memory.task?.type)) {
                clearTaskState(creep, 'remote_paused');
            }
            if (scope.facts.homeDanger && creep.memory.task) clearTaskState(creep, 'remote_home_danger');
            if (creep.memory.role === 'remoteHauler') {
                this.assignRemoteHaulerTask(creep, scope.operation, scope.facts, scope.state);
                continue;
            }
            const reconScout = creep.memory.role === 'scout' && (!trial.managed || trial.allowOutbound) && (scope.state.allowRecon ||
                scope.operation.status === 'recovering' && creep.room.name === scope.config.targetRoom);
            if ((!scope.state.allowEconomicDeparture && !reconScout) || creep.memory.remoteRetiring) {
                if (creep.memory.task?.type === TaskTypes.MOVE_TO &&
                    creep.memory.remoteLeg?.state === 'returning' &&
                    creep.memory.task.pos?.roomName === scope.config.baseRoom &&
                    (!trial.managed || scope.facts.homeHealthy)) continue;
                if (creep.memory.task) clearTaskState(creep, 'remote_paused');
                this.returnActor(creep, scope.operation, scope.facts);
                continue;
            }
            if (creep.memory.task && [TaskTypes.BUILD,TaskTypes.REPAIR].includes(creep.memory.task.type)) clearTaskState(creep,'remote_refresh_work_budget');
            if (creep.memory.task) continue;
            if (creep.memory.role === 'remoteMiner') this.assignRemoteMinerTask(creep, scope.operation, scope.facts);
            else if (creep.memory.role === 'scout' && scope.facts.entrance && !creep.pos.inRangeTo(scope.facts.entrance, 0)) {
                this.moveActor(creep, scope.operation, { ...scope.facts.entrance, range: 0 });
            }
            else if (creep.memory.role === 'reserver') {
                if (creep.room.name !== scope.config.targetRoom && scope.facts.entrance) this.moveActor(creep,scope.operation,{...scope.facts.entrance,range:0});
                else if (creep.room.controller) assignTask(creep,{type:TaskTypes.RESERVE,targetId:creep.room.controller.id});
            }
        }
    }

    moveActor(creep, operation, goal) {
        if (creep.spawning) return false;
        const policy = ensureEmpireControl().policy.remoteMining;
        const leg = creep.memory.remoteLeg || (creep.memory.remoteLeg = {});
        const movingState = leg.state === 'safe_wait' ? null : leg.state;
        const goalKey = `${goal.roomName}:${goal.x}:${goal.y}:${operation.recoverySequence || 0}`;
        const scope = global.RemoteMining?.[operation.remoteId];
        const returning = goal.roomName === operation.config.baseRoom;
        const trial = getReconTrialPermit({ remoteId: creep.memory.remoteId, epoch: creep.memory.epoch,
            trialId: creep.memory.reconTrialId, sequence: creep.memory.reconTrialSequence,
            action: returning ? 'return' : 'outbound' });
        const reconScout = creep.memory.role === 'scout' && (scope?.state.allowRecon ||
            operation.status === 'recovering' && creep.room.name === operation.config.targetRoom);
        const allowed = (!trial.managed || (returning ? trial.allowReturn : trial.allowOutbound)) &&
            scope && scope.operation === operation && creep.memory.remoteId === operation.remoteId &&
            creep.memory.epoch === operation.epoch &&
            remoteActorIdentityMatches(creep.memory, operation.config) &&
            scope.facts.homeHealthy && !scope.facts.homeDanger &&
            (returning || policy.enabled && operation.config.enabled && !operation.config.hold &&
                !operation.pendingConfig && !creep.memory.remoteRetiring &&
                (reconScout || scope.state.allowEconomicDeparture));
        if (!allowed) {
            leg.state = 'safe_wait';
            leg.blockedReason = 'departure_blocked';
            return false;
        }
        if (leg.goalKey === goalKey) {
            const invalidRetryCount = leg.retryCount !== undefined &&
                (!Number.isSafeInteger(leg.retryCount) || leg.retryCount < 0 || leg.retryCount > MOVE_RETRY_LIMIT);
            if (!Number.isFinite(leg.startedAt) || !Number.isFinite(leg.expiresAt) || invalidRetryCount) {
                leg.state = 'safe_wait';
                leg.blockedReason = 'leg_state_invalid';
                return false;
            }
            if (Game.time > leg.expiresAt) {
                leg.state = 'safe_wait';
                leg.blockedGoalKey = goalKey;
                leg.blockedReason = 'leg_expired';
                delete leg.retryAfter;
                return false;
            }
            const clear = creep.memory.lastTaskClear;
            const retryable = clear?.reason === 'move_path_lost' ||
                clear?.reason === 'move_stuck_or_expired' && clear.movementFailure !== 'leg_expired';
            if (moveFailureMatchesGoal(clear, goal, leg)) {
                const failureId = `${clear.tick}:${clear.reason}`;
                if (retryable && leg.lastMoveFailureId !== failureId) {
                    leg.lastMoveFailureId = failureId;
                    leg.blockedGoalKey = goalKey;
                    if ((leg.retryCount || 0) >= MOVE_RETRY_LIMIT) {
                        leg.blockedReason = 'retry_exhausted';
                        delete leg.retryAfter;
                    } else {
                        leg.retryAfter = clear.tick + MOVE_RETRY_COOLDOWN_TICKS;
                        leg.blockedReason = 'retry_cooldown';
                    }
                } else if (['move_no_path', 'move_invalid_path', 'move_invalid_target'].includes(clear.reason)) {
                    leg.blockedGoalKey = goalKey;
                    leg.blockedReason = 'route_invalid';
                    delete leg.retryAfter;
                }
            }
        }
        if (leg.blockedGoalKey === goalKey) {
            leg.state = 'safe_wait';
            if (!Number.isFinite(leg.retryAfter) || Game.time < leg.retryAfter ||
                (leg.retryCount || 0) >= MOVE_RETRY_LIMIT) return false;
            leg.retryCount = (leg.retryCount || 0) + 1;
            delete leg.retryAfter;
        }
        const occupancyMode = creep.memory.role === 'scout' ?
            (leg.goalKey === goalKey && leg.retryCount === 1 ? 'live_creeps' : 'work_positions') : undefined;
        const route = planRemoteRoute(creep.pos,goal,{baseRoom:operation.config.baseRoom,targetRoom:operation.config.targetRoom,
            body:creep.body,loadState:{energy:creep.store.getUsedCapacity()},range:goal.range,
            occupancyMode,
            dangerZones: operation.lastDangerZones || []},policy,Game.time);
        route.recoverySequence = operation.recoverySequence || 0;
        const task = createRemoteMoveTask(creep.memory.remoteLeg,route,goal,Game.time);
        if (task) {
            leg.state = movingState || (returning ? 'returning' : 'to_remote');
            delete leg.blockedGoalKey;
            delete leg.blockedReason;
            if (creep.memory.remoteStatus === 'safe_wait') delete creep.memory.remoteStatus;
            assignTask(creep,task);
        }
        else {
            creep.memory.remoteStatus = 'safe_wait';
            leg.state = 'safe_wait';
            leg.blockedGoalKey = goalKey;
            leg.blockedReason = route.valid ? 'leg_expired' : 'route_invalid';
        }
        return !!task;
    }

    returnActor(creep, operation, facts) {
        const leg = creep.memory.remoteLeg || (creep.memory.remoteLeg = {});
        if (creep.room.name === operation.config.baseRoom || facts.homeDanger || !facts.homeHealthy) {
            leg.state = creep.memory.remoteRetiring ? 'retiring' : 'safe_wait';
            return;
        }
        const goal = operation.config.homeDeliveryTargetIds.map(id => Game.getObjectById(id)).find(target => target?.pos);
        leg.state = 'returning';
        if (goal) this.moveActor(creep, operation, movementGoal(goal.pos, 1));
        else leg.state = 'safe_wait';
    }

    prepareMinerHandoff(creep, operation) {
        const config = operation.config;
        if ([WORK, CARRY, MOVE].some(part => creep.getActiveBodyparts(part) === 0)) creep.memory.remoteRetiring = true;
        const lead = creep.body.length * CREEP_SPAWN_TIME +
            (operation.route?.roles?.remoteMiner?.outboundTicks || operation.route?.outboundTicks || 0) + 50;
        if (creep.ticksToLive <= lead && Object.values(Game.creeps).some(incoming =>
            incoming.name !== creep.name && incoming.memory.role === 'remoteMiner' &&
            incoming.memory.remoteId === operation.remoteId && incoming.memory.epoch === operation.epoch &&
            !incoming.memory.remoteRetiring && incoming.ticksToLive > lead && config.containerPos &&
            incoming.pos.inRangeTo(config.containerPos, 1) &&
            [WORK, CARRY, MOVE].every(part => incoming.getActiveBodyparts(part) > 0))) {
            creep.memory.remoteRetiring = true;
        }
        const occupant = config.containerPos && Object.values(Game.creeps).find(actor =>
            actor.name !== creep.name && actor.pos.inRangeTo(config.containerPos, 0));
        if (occupant && creep.pos.inRangeTo(config.containerPos, 1) && creep.memory.task?.type === TaskTypes.MOVE_TO) {
            clearTaskState(creep, 'remote_work_position_occupied');
        }
    }

    assignRemoteHaulerTask(creep, operation, facts, state) {
        const policy = ensureEmpireControl().policy.remoteMining;
        const config = operation.config;
        const leg = creep.memory.remoteLeg || (creep.memory.remoteLeg = {});
        const energy = creep.store.getUsedCapacity(RESOURCE_ENERGY);
        const used = creep.store.getUsedCapacity();
        const outbound = operation.route?.outboundTicks || 0;
        const retiring = creep.memory.retire || creep.memory.remoteRetiring ||
            creep.ticksToLive <= creep.body.length * CREEP_SPAWN_TIME + outbound + 50;
        if (retiring) creep.memory.remoteRetiring = true;
        const returnOnly = retiring || !state.allowEconomicDeparture;
        if (facts.homeDanger || returnOnly && !facts.homeHealthy) {
            if (creep.memory.task) clearTaskState(creep, 'remote_return_unsafe');
            leg.state = 'safe_wait';
            return;
        }
        const task = creep.memory.task;
        if (task?.type === TaskTypes.MOVE_TO && task.pos && creep.pos.inRangeTo(task.pos, task.range ?? 1)) {
            clearTaskState(creep, 'remote_leg_arrived');
            delete leg.goalKey;
        } else if (task && returnOnly && leg.state === 'to_remote') {
            clearTaskState(creep, 'remote_departure_cancelled');
            delete leg.goalKey;
        }
        if (creep.memory.task) return;
        if (used > energy) {
            leg.state = 'safe_wait';
            leg.blockedReason = 'non_energy_cargo';
            return;
        }
        const market = global.ResourceMarketService;
        if (!market) return;
        if (creep.room.name === config.baseRoom) {
            if (energy > 0) {
                const target = config.homeDeliveryTargetIds.map(id => Game.getObjectById(id))
                    .find(value => value?.pos?.roomName === config.baseRoom && value.store?.getFreeCapacity(RESOURCE_ENERGY) > 0);
                if (!target) { leg.state = 'safe_wait'; return; }
                this.ensureTrip(creep, operation);
                leg.state = 'unloading';
                if (!creep.pos.inRangeTo(target.pos, 1)) this.moveActor(creep, operation, movementGoal(target.pos, 1));
                else {
                    const delivery = market.createRemoteHomeDeliveryTask(creep, {
                        remoteId: operation.remoteId, epoch: operation.epoch,
                        tripId: creep.memory.remoteTrip.tripId, targetId: target.id
                    });
                    if (delivery) assignTask(creep, delivery);
                }
                return;
            }
            if (returnOnly) { leg.state = retiring ? 'retiring' : 'safe_wait'; return; }
            if (this.hasPendingOwner(creep, config.baseRoom)) { leg.state = 'idle'; return; }
            delete creep.memory.remoteTrip;
            leg.state = 'to_remote';
            const goal = facts.container?.pos || config.containerPos;
            if (goal) this.moveActor(creep, operation, movementGoal(goal, 1));
            return;
        }
        if (returnOnly || energy >= creep.store.getCapacity(RESOURCE_ENERGY) ||
            energy > 0 && creep.memory.remoteTrip && Game.time - creep.memory.remoteTrip.loadingStartedAt >= policy.loadingWaitTicks) {
            leg.state = returnOnly ? 'returning' : 'to_home';
            const target = config.homeDeliveryTargetIds.map(id => Game.getObjectById(id))
                .find(value => value?.pos?.roomName === config.baseRoom && value.store?.getFreeCapacity(RESOURCE_ENERGY) > 0);
            if (target && !facts.homeDanger) this.moveActor(creep, operation, movementGoal(target.pos, 1));
            else leg.state = 'safe_wait';
            return;
        }
        if (!facts.container) { leg.state = 'safe_wait'; return; }
        if (!creep.pos.inRangeTo(facts.container.pos, 1)) {
            leg.state = 'to_remote';
            this.moveActor(creep, operation, movementGoal(facts.container.pos, 1));
            return;
        }
        this.ensureTrip(creep, operation);
        leg.state = 'loading';
        const pickup = market.createRemotePickupTask(creep, {
            remoteId: operation.remoteId, epoch: operation.epoch, tripId: creep.memory.remoteTrip.tripId
        });
        if (pickup) assignTask(creep, pickup);
    }

    ensureTrip(creep, operation) {
        if (creep.memory.remoteTrip) return;
        creep.memory.remoteTripSequence = (creep.memory.remoteTripSequence || 0) + 1;
        creep.memory.remoteTrip = {
            tripId: `${creep.name}:${operation.epoch}:${creep.memory.remoteTripSequence}`,
            loadingStartedAt: Game.time
        };
    }

    hasPendingOwner(creep, baseRoom) {
        const reservations = global.ResourceMarket?.[baseRoom]?.reservations;
        return ['supply', 'demand'].some(side => Object.values(reservations?.[side] || {})
            .filter(Boolean).some(record => Object.values(record.owners || {}).some(owner => owner.creepName === creep.name)));
    }

    assignRemoteMinerTask(creep, operation, facts) {
        const config = operation.config;
        if (!config.containerPos) return;
        if (creep.room.name !== config.targetRoom || !creep.pos.inRangeTo(config.containerPos,0)) {
            const occupant = Object.values(Game.creeps).find(actor =>
                actor.name !== creep.name && actor.pos.inRangeTo(config.containerPos, 0));
            if (occupant && creep.pos.inRangeTo(config.containerPos, 1)) {
                const leg = creep.memory.remoteLeg || (creep.memory.remoteLeg = {});
                if (!leg.goalKey) {
                    const policy = ensureEmpireControl().policy.remoteMining;
                    const route = planRemoteRoute(creep.pos, config.containerPos, {
                        baseRoom: config.baseRoom, targetRoom: config.targetRoom, body: creep.body, range: 0,
                        loadState: { energy: creep.store.getUsedCapacity() }, dangerZones: operation.lastDangerZones || []
                    }, policy, Game.time);
                    route.recoverySequence = operation.recoverySequence || 0;
                    createRemoteMoveTask(leg, route, { ...config.containerPos, range: 0 }, Game.time);
                }
                creep.memory.remoteWorkPositionWait = { occupant: occupant.name, expiresAt: leg.expiresAt };
                leg.state = 'safe_wait';
                leg.blockedReason = Game.time > leg.expiresAt ? 'work_position_wait_expired' : 'work_position_occupied';
                return;
            }
            if (creep.memory.remoteWorkPositionWait && !occupant) {
                delete creep.memory.remoteWorkPositionWait;
                if (creep.memory.remoteLeg) delete creep.memory.remoteLeg.blockedGoalKey;
            }
            if (config.containerPos) this.moveActor(creep,operation,{...config.containerPos,range:0});
            return;
        }
        const energy = creep.store.getUsedCapacity(RESOURCE_ENERGY);
        if (facts.container && facts.container.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) return;
        let task;
        let cost = 0;
        const work = creep.getActiveBodyparts(WORK);
        if (energy > 0 && facts.site && !facts.container) {
            task = {type:TaskTypes.BUILD,targetId:facts.site.id,workPos:config.containerPos};
            cost = Math.min(energy,work*BUILD_POWER);
        } else if (energy > 0 && facts.container && (facts.container.hits < facts.container.hitsMax*0.4 || creep.memory.remoteRepairing && facts.container.hits < facts.container.hitsMax*0.8)) {
            creep.memory.remoteRepairing = true;
            task = {type:TaskTypes.REPAIR,targetId:facts.container.id,targetHits:Math.floor(facts.container.hitsMax*0.8),workPos:config.containerPos};
            cost = Math.min(energy,work);
        } else if (energy > 0 && facts.container) {
            creep.memory.remoteRepairing = false;
            task = {type:TaskTypes.TRANSFER,targetId:facts.container.id,resourceType:RESOURCE_ENERGY};
        } else if (facts.source) task = {type:TaskTypes.HARVEST,targetId:facts.source.id};
        if (!task) return;
        if ([TaskTypes.BUILD, TaskTypes.REPAIR, TaskTypes.TRANSFER].includes(task.type)) {
            task.remoteWorkScope = { remoteId: operation.remoteId, epoch: operation.epoch, sourceId: config.sourceId, targetId: task.targetId };
        }
        if (cost) {
            const budget = Memory.empire.remoteMining.budgets[config.baseRoom] || {};
            Memory.empire.remoteMining.budgets[config.baseRoom] = budget;
            budget.infrastructureEnergyLimit = ensureEmpireControl().policy.remoteMining.infrastructureEnergyLimit;
            const context = {remoteId:config.remoteId,epoch:operation.epoch,creepName:creep.name,
                attemptId:`${creep.name}:${Game.time}:${task.type}`,actionType:task.type,targetId:task.targetId,
                boosted:creep.body.some(part=>part.boost)};
            if (creep.memory.economicTrialId) Object.assign(context, Memory.empire.remoteMining.economicTrials.current.identity);
            if (!reserveInfrastructureAttempt(budget,context,cost,Game.time).granted) return;
            registerTaskObservation(task,context);
        }
        assignTask(creep,task);
    }
}
