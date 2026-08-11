import BaseService from '../core/BaseService.js';
import { ensureEmpireControl } from '../config/EmpirePolicy.js';
import { recordEmpireEvent } from '../core/EmpireEventLog.js';
import { collectRoomGovernorFacts } from '../governance/RoomGovernorFacts.js';
import { evaluateRoomGovernor } from '../governance/RoomGovernorModel.js';
import { compareSpawnDecisions } from '../governance/SpawnDecisionComparator.js';

const ROOM_CONTROL_SCHEMA_VERSION = 1;

function hasEmergency(facts) {
    if (!facts.hasSpawn) return true;
    if (facts.sourceCount !== null && facts.sourceCount > 0 && facts.capabilities.harvestWork <= 0) return true;
    if (facts.sourceCount !== null && facts.sourceCount > 0 && facts.capabilities.logisticsCarry <= 0) return true;
    return false;
}

function roomControl(control, roomName) {
    if (!control.rooms[roomName]) control.rooms[roomName] = {};
    if (control.rooms[roomName].schemaVersion === undefined) {
        control.rooms[roomName].schemaVersion = ROOM_CONTROL_SCHEMA_VERSION;
    }
    return control.rooms[roomName];
}

function globalSnapshot(shadow, deferred, maxSnapshotAge) {
    const staleFor = Math.max(0, Game.time - shadow.evaluatedAt);
    return {
        tick: Game.time,
        evaluatedAt: shadow.evaluatedAt,
        staleFor,
        deferred,
        lifecycle: shadow.lifecycle,
        candidateLifecycle: shadow.candidateLifecycle,
        health: shadow.health,
        budgets: shadow.budgets,
        capabilities: shadow.capabilities,
        spawnRecommendations: staleFor > maxSnapshotAge ? [] : (shadow.spawnRecommendations || []),
        reasons: staleFor > maxSnapshotAge
            ? [...(shadow.reasons || []), 'snapshot_expired']
            : (shadow.reasons || []),
        comparison: shadow.comparison || null
    };
}

function evaluationReasons(evaluation) {
    const reasons = new Set(evaluation.health.overall.reasons || []);
    for (const recommendation of evaluation.spawnRecommendations) {
        for (const reason of recommendation.reasons) reasons.add(reason);
    }
    return [...reasons];
}

class RoomGovernorService extends BaseService {
    constructor(serviceName) {
        super(serviceName);
        this.evaluatedRooms = new Set();
    }

    analyze() {
        global.RoomGovernor = {};
        this.evaluatedRooms = new Set();
        const control = ensureEmpireControl();
        const policy = control.policy.roomGovernor;
        if (!policy.enabled) return;

        const collected = collectRoomGovernorFacts({
            replacementLeadTicks: policy.thresholds.replacementLeadTicks
        });
        for (const roomName in collected.errors) {
            this.recordRoomEvent(control, roomName, 'error', 'room_governor_error', 'warning', {
                roomName,
                message: collected.errors[roomName].message
            });
            const previous = roomControl(control, roomName).shadow;
            if (previous && previous.evaluatedAt !== undefined) {
                global.RoomGovernor[roomName] = globalSnapshot(previous, true, policy.maxSnapshotAge);
            }
        }

        for (const roomName in collected.rooms) {
            const facts = collected.rooms[roomName];
            const state = roomControl(control, roomName);
            const previous = state.shadow;
            const emergency = hasEmergency(facts);
            const due = !previous || previous.evaluatedAt === undefined || Game.time % Math.max(1, policy.interval) === 0;
            const deferred = control.runtime.cpuMode === 'critical' && !emergency && !!previous;
            if ((!due && !emergency) || deferred) {
                global.RoomGovernor[roomName] = globalSnapshot(previous, deferred, policy.maxSnapshotAge);
                continue;
            }

            try {
                const previousLifecycle = previous ? previous.lifecycle : null;
                const previousLifecycleState = previous ? previous.lifecycleState : null;
                const evaluation = evaluateRoomGovernor(facts, previousLifecycleState, policy);
                const transitioned = previousLifecycle !== null && previousLifecycle !== evaluation.lifecycle;
                const next = {
                    ...(previous || {}),
                    evaluatedAt: Game.time,
                    lifecycle: evaluation.lifecycle,
                    candidateLifecycle: evaluation.candidateLifecycle,
                    lifecycleState: evaluation.lifecycleState,
                    health: evaluation.health,
                    budgets: evaluation.budgets,
                    capabilities: evaluation.capabilities,
                    spawnRecommendations: evaluation.spawnRecommendations,
                    reasons: evaluationReasons(evaluation),
                    comparison: previous && previous.comparison ? previous.comparison : null,
                    eventTicks: previous && previous.eventTicks ? previous.eventTicks : {}
                };
                if (transitioned) {
                    next.lastTransition = { from: previousLifecycle, to: evaluation.lifecycle, at: Game.time };
                }
                state.shadow = next;
                this.evaluatedRooms.add(roomName);
                global.RoomGovernor[roomName] = globalSnapshot(next, false, policy.maxSnapshotAge);
                if (transitioned) {
                    this.recordRoomEvent(control, roomName, 'lifecycle', 'room_lifecycle_changed', 'info', {
                        roomName,
                        from: previousLifecycle,
                        to: evaluation.lifecycle
                    });
                }
                if (evaluation.health.overall.status === 'critical') {
                    this.recordRoomEvent(control, roomName, 'critical', 'room_health_critical', 'warning', {
                        roomName,
                        lifecycle: evaluation.lifecycle,
                        reasons: evaluation.health.overall.reasons
                    });
                }
            } catch (error) {
                this.recordRoomEvent(control, roomName, 'error', 'room_governor_error', 'warning', {
                    roomName,
                    message: error && error.message ? error.message : String(error)
                });
                if (previous && previous.evaluatedAt !== undefined) {
                    global.RoomGovernor[roomName] = globalSnapshot(previous, true, policy.maxSnapshotAge);
                }
            }
        }
    }

    cleanup() {
        const control = ensureEmpireControl();
        const policy = control.policy.roomGovernor;
        if (!policy.enabled || control.runtime.cpuMode === 'critical') return;
        for (const roomName of this.evaluatedRooms) {
            const state = roomControl(control, roomName);
            const shadow = state.shadow;
            if (!shadow || shadow.evaluatedAt !== Game.time) continue;
            const bureau = global.SpawnBureau && global.SpawnBureau[roomName];
            const intents = bureau && Array.isArray(bureau.intents) ? bureau.intents : [];
            const comparison = compareSpawnDecisions(shadow.spawnRecommendations || [], intents, Game.time);
            shadow.comparison = comparison;
            if (global.RoomGovernor && global.RoomGovernor[roomName]) {
                global.RoomGovernor[roomName].comparison = comparison;
            }
            if (comparison.missing.length > 0) {
                this.recordRoomEvent(control, roomName, 'spawnDifference', 'room_spawn_difference', 'info', {
                    roomName,
                    missingCapabilities: comparison.missing.map((item) => item.capability)
                });
            }
        }
    }

    recordRoomEvent(control, roomName, key, type, severity, data) {
        const policy = control.policy.roomGovernor;
        const state = roomControl(control, roomName);
        if (!state.shadow) state.shadow = { eventTicks: {} };
        if (!state.shadow.eventTicks) state.shadow.eventTicks = {};
        const lastTick = state.shadow.eventTicks[key];
        if (lastTick !== undefined && Game.time - lastTick < policy.eventCooldown) return;
        state.shadow.eventTicks[key] = Game.time;
        recordEmpireEvent(type, severity, data);
    }
}

export default RoomGovernorService;
