import BaseService from '../core/BaseService.js';
import { ensureEmpireControl } from '../config/EmpirePolicy.js';
import { recordEmpireEvent } from '../core/EmpireEventLog.js';
import { collectRoomGovernorFacts } from '../governance/RoomGovernorFacts.js';
import { evaluateRoomGovernor } from '../governance/RoomGovernorModel.js';
import { compareSpawnDecisions } from '../governance/SpawnDecisionComparator.js';
import { appendCapabilitySample, evaluateCapabilityReadiness } from '../governance/CapabilityRolloutReadiness.js';

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
    const upgradeWorkRollout = shadow.capabilityRollout && shadow.capabilityRollout.upgradeWork;
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
        controllerTicksToDowngrade: shadow.controllerTicksToDowngrade,
        spawnRecommendations: staleFor > maxSnapshotAge ? [] : (shadow.spawnRecommendations || []),
        reasons: staleFor > maxSnapshotAge
            ? [...(shadow.reasons || []), 'snapshot_expired']
            : (shadow.reasons || []),
        comparison: shadow.comparison || null,
        capabilityRollout: upgradeWorkRollout ? {
            upgradeWork: {
                ready: upgradeWorkRollout.ready,
                blockers: upgradeWorkRollout.blockers,
                sampleCount: upgradeWorkRollout.sampleCount,
                lastSampleAt: upgradeWorkRollout.lastSampleAt
            }
        } : null
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
            this.persistGovernorErrorReadiness(control, roomName);
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
                    controllerTicksToDowngrade: facts.controllerTicksToDowngrade,
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
                this.persistGovernorErrorReadiness(control, roomName);
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
            const legacyIntents = bureau && Array.isArray(bureau.legacyIntents)
                ? bureau.legacyIntents
                : (bureau && Array.isArray(bureau.intents) ? bureau.intents : []);
            const comparison = compareSpawnDecisions(shadow.spawnRecommendations || [], legacyIntents, Game.time);
            shadow.comparison = comparison;
            this.sampleCapabilityRollout(control, roomName, shadow, bureau, comparison);
            if (global.RoomGovernor && global.RoomGovernor[roomName]) {
                global.RoomGovernor[roomName].comparison = comparison;
                const rollout = shadow.capabilityRollout && shadow.capabilityRollout.upgradeWork;
                global.RoomGovernor[roomName].capabilityRollout = rollout ? {
                    upgradeWork: {
                        ready: rollout.ready,
                        blockers: rollout.blockers,
                        sampleCount: rollout.sampleCount,
                        lastSampleAt: rollout.lastSampleAt
                    }
                } : null;
            }
            if (comparison.missing.length > 0) {
                this.recordRoomEvent(control, roomName, 'spawnDifference', 'room_spawn_difference', 'info', {
                    roomName,
                    missingCapabilities: comparison.missing.map((item) => item.capability)
                });
            }
        }
    }

    sampleCapabilityRollout(control, roomName, shadow, bureau, comparison) {
        if (!bureau) return;
        const currentRollout = shadow.capabilityRollout && shadow.capabilityRollout.upgradeWork;
        if (currentRollout && currentRollout.lastSampleAt === Game.time) return;

        const legacyIntents = Array.isArray(bureau.legacyIntents)
            ? bureau.legacyIntents
            : (Array.isArray(bureau.intents) ? bureau.intents : []);
        const recommendations = shadow.spawnRecommendations || [];
        const quotaKey = `upgrader:${roomName}:controller`;
        const legacyPresent = legacyIntents.some((intent) => intent.quotaKey === quotaKey);
        const recommendationPresent = recommendations.some((item) => item.capability === 'upgradeWork');
        const legacyMatched = recommendationPresent
            ? comparison.matched.some((item) => item.capability === 'upgradeWork')
            : !legacyPresent;
        const coreHealth = shadow.health || {};
        const known = Number.isFinite(shadow.capabilities && shadow.capabilities.upgradeWork && shadow.capabilities.upgradeWork.gap) &&
            [coreHealth.survival, coreHealth.harvest, coreHealth.logistics]
                .every((health) => health && health.status !== 'unknown');
        const critical = [coreHealth.survival, coreHealth.harvest, coreHealth.logistics]
            .some((health) => health && health.status === 'critical');
        const sampled = appendCapabilitySample(currentRollout, {
            known,
            critical,
            recommendationPresent,
            legacyMatched,
            legacyMissing: !legacyMatched,
            sampledAt: Game.time,
            lastErrorAt: shadow.eventTicks && shadow.eventTicks.error
        });
        const readiness = evaluateCapabilityReadiness(sampled, {
            lifecycle: shadow.lifecycle,
            staleFor: Math.max(0, Game.time - shadow.evaluatedAt)
        }, control.policy.capabilityControl.readiness, Game.time);
        const rollout = {
            ...sampled,
            ready: readiness.ready,
            blockers: readiness.blockers
        };
        shadow.capabilityRollout = { ...(shadow.capabilityRollout || {}), upgradeWork: rollout };
        roomControl(control, roomName).capabilityRollout = shadow.capabilityRollout;
        if ((!currentRollout || currentRollout.ready !== true) && rollout.ready) {
            this.recordRoomEvent(control, roomName, 'capabilityRolloutReady', 'capability_rollout_ready', 'info', {
                roomName,
                capability: 'upgradeWork'
            });
        }
    }

    persistGovernorErrorReadiness(control, roomName) {
        const shadow = roomControl(control, roomName).shadow;
        const existing = shadow && shadow.capabilityRollout && shadow.capabilityRollout.upgradeWork;
        const errorAt = shadow && shadow.eventTicks && shadow.eventTicks.error;
        if (!existing || !Number.isFinite(errorAt)) return;
        const rolloutWithError = { ...existing, lastErrorAt: errorAt };
        const readiness = evaluateCapabilityReadiness(rolloutWithError, {
            lifecycle: shadow.lifecycle,
            staleFor: Math.max(0, Game.time - shadow.evaluatedAt)
        }, control.policy.capabilityControl.readiness, Game.time);
        shadow.capabilityRollout = {
            ...shadow.capabilityRollout,
            upgradeWork: {
                ...rolloutWithError,
                ready: readiness.ready,
                blockers: readiness.blockers
            }
        };
        roomControl(control, roomName).capabilityRollout = shadow.capabilityRollout;
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
