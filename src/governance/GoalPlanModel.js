const GOAL_STATUSES = new Set(['proposed', 'tracking', 'blocked', 'achieved', 'cancelled', 'expired']);
const copy = value => JSON.parse(JSON.stringify(value));
const integer = (value, min, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const versionKnown = value => typeof value === 'string' && value.length > 0 && value.length <= 96;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validGoalState(state) {
    return record(state) && GOAL_STATUSES.has(state.status);
}

export function validGoalPlanningPolicy(policy) {
    return !!policy && typeof policy.enabled === 'boolean' && policy.mode === 'shadow' &&
        integer(policy.interval, 10, 20) && integer(policy.maxFactAge, policy.interval, 20) &&
        integer(policy.readySamples, 2, 20) && integer(policy.maxGoals, 1, 20) &&
        integer(policy.maxPlans, 1, 20) && integer(policy.eventLimit, 1, 50);
}

export function validGoalDefinition(definition, now) {
    return !!definition && typeof definition.id === 'string' &&
        /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,95}$/.test(definition.id) &&
        !['constructor', 'prototype', '__proto__'].includes(definition.id) &&
        definition.kind === 'prepare_receiving_capacity' &&
        typeof definition.roomName === 'string' && definition.roomName.length <= 32 && /^[WE]\d+[NS]\d+$/.test(definition.roomName) &&
        integer(definition.priority, 0, 100) && integer(definition.requiredFreeCapacity, 1) &&
        integer(definition.createdAt, 0, now) &&
        (definition.expiresAt === undefined || integer(definition.expiresAt, definition.createdAt));
}

export function observationPlanId(goalId) {
    return `${goalId}:observe:v1`;
}

function readiness(status, reasons, facts, policy) {
    const capturedAt = integer(facts?.capturedAt, 0) ? facts.capturedAt : null;
    return {
        status, ready: status === 'ready', reasons: reasons.slice(0, 8),
        capturedAt, codeVersion: versionKnown(facts?.codeVersion) ? facts.codeVersion : null,
        validUntil: capturedAt === null || !policy ? null : capturedAt + policy.maxFactAge
    };
}

function inspectFacts(definition, facts, now, policy) {
    const unknown = reason => ({ status: 'unknown', reason });
    if (!integer(facts?.capturedAt, 0, now) || now - facts.capturedAt > policy.maxFactAge ||
        !versionKnown(facts?.codeVersion) || facts.errors?.input) return unknown('facts_unavailable');
    const room = facts.rooms?.[definition.roomName];
    if (!room || room.visible !== true) return unknown('room_unseen');
    if (room.owned !== true) return { status: 'blocked', reason: 'room_not_owned' };
    if (!integer(room.recovery?.evaluatedAt, 0, now) || now - room.recovery.evaluatedAt > policy.maxFactAge ||
        typeof room.recovery.mode !== 'string') return unknown('recovery_unknown');
    if (room.recovery.mode !== 'normal') return { status: 'blocked', reason: 'home_recovery' };
    if (room.terminal?.known !== true) return unknown('receiver_unknown');
    if (!room.terminal.present) return { status: 'tracking', reason: 'waiting_structure', phase: 'waiting_structure', room };
    if (room.terminal.owned !== true || !versionKnown(room.terminal.id)) return unknown('receiver_ownership_unknown');
    if (!Number.isFinite(room.terminal.freeCapacity) || room.terminal.freeCapacity < 0) return unknown('capacity_unknown');
    if (room.terminal.freeCapacity < definition.requiredFreeCapacity) {
        return { status: 'blocked', reason: 'insufficient_capacity', phase: 'waiting_capacity', room };
    }
    return { status: 'eligible', room };
}

function progressEvidence(room, facts) {
    return {
        capturedAt: facts.capturedAt, codeVersion: facts.codeVersion,
        receiverId: room.terminal.id, freeCapacity: room.terminal.freeCapacity,
        siteId: room.site?.id || null, siteProgress: room.site?.progress ?? null
    };
}

function madeProgress(previous, current) {
    if (!previous || previous.codeVersion !== current.codeVersion) return true;
    if (current.receiverId && current.receiverId !== previous.receiverId) return true;
    if (current.receiverId && Number.isFinite(current.freeCapacity) && Number.isFinite(previous.freeCapacity) &&
        current.freeCapacity > previous.freeCapacity) return true;
    return !!current.siteId && current.siteId === previous.siteId &&
        Number.isFinite(current.siteProgress) && Number.isFinite(previous.siteProgress) && current.siteProgress > previous.siteProgress;
}

export function evaluateGoalPlan({ goal, plan, facts, now, policy }) {
    const invalidShape = !record(goal) || goal.state !== undefined && !validGoalState(goal.state) ||
        plan !== undefined && !record(plan);
    const nextGoal = record(goal) ? copy(goal) : {};
    const state = validGoalState(nextGoal.state) ? nextGoal.state : (nextGoal.state = { status: 'proposed' });
    const definition = nextGoal.definition;
    const nextPlan = record(plan) ? copy(plan) : {
        id: observationPlanId(definition?.id), goalId: definition?.id, revision: 1,
        phase: 'waiting_structure', status: 'watching', budgetProposal: null, budgetAllocated: 0, retryCount: 0
    };
    const previousStatus = state.status;
    const previousPhase = nextPlan.phase;
    const previousReasons = JSON.stringify(state.reasonCodes || []);
    let current;
    const resetEvidence = () => {
        state.readyCount = 0;
        state.lastReadyEvidenceAt = null;
        state.readyVersion = null;
        state.readyReceiverId = null;
    };
    const invalid = invalidShape || !integer(now, 0) || !validGoalDefinition(definition, now) || !GOAL_STATUSES.has(state.status) ||
        nextPlan.id !== observationPlanId(definition?.id) || nextPlan.goalId !== definition?.id ||
        nextPlan.revision !== 1 || nextPlan.budgetAllocated !== 0 || nextPlan.retryCount !== 0;
    if (invalid || !validGoalPlanningPolicy(policy)) {
        resetEvidence();
        current = readiness('unknown', [invalid ? 'invalid_goal_plan' : 'invalid_policy'], facts, null);
    } else if (!policy.enabled || state.status === 'cancelled' || state.status === 'expired') {
        resetEvidence();
        current = readiness('inactive', [!policy.enabled ? 'disabled' : state.status], facts, policy);
    } else if (definition.expiresAt !== undefined && now > definition.expiresAt && state.status !== 'achieved') {
        resetEvidence();
        state.status = 'expired';
        current = readiness('inactive', ['expired'], facts, policy);
    } else {
        const inspected = inspectFacts(definition, facts, now, policy);
        if (inspected.room) {
            const evidence = progressEvidence(inspected.room, facts);
            if (madeProgress(state.lastEvidence, evidence)) state.lastProgressAt = now;
            state.lastEvidence = evidence;
            nextPlan.lastEvidenceAt = facts.capturedAt;
        }
        if (inspected.status === 'eligible') {
            const sameSeries = state.readyVersion === facts.codeVersion && state.readyReceiverId === inspected.room.terminal.id &&
                integer(state.lastReadyEvidenceAt, 0, facts.capturedAt) &&
                facts.capturedAt - state.lastReadyEvidenceAt <= policy.maxFactAge && integer(state.readyCount, 1, policy.readySamples);
            if (!sameSeries) {
                state.readyCount = 1;
                state.lastReadyEvidenceAt = facts.capturedAt;
            } else if (facts.capturedAt - state.lastReadyEvidenceAt >= policy.interval) {
                state.readyCount = Math.min(policy.readySamples, state.readyCount + 1);
                state.lastReadyEvidenceAt = facts.capturedAt;
            }
            state.readyVersion = facts.codeVersion;
            state.readyReceiverId = inspected.room.terminal.id;
            const ready = state.readyCount >= policy.readySamples;
            current = readiness(ready ? 'ready' : 'confirming', ready ? [] : ['awaiting_fresh_sample'], facts, policy);
            nextPlan.phase = ready ? 'ready' : 'waiting_capacity';
            if (ready && state.status !== 'achieved') {
                state.status = 'achieved';
                state.achievedAt = now;
                state.achievedEvidence = { ...state.lastEvidence };
            }
        } else {
            resetEvidence();
            current = readiness(inspected.status === 'tracking' ? 'blocked' : inspected.status, [inspected.reason], facts, policy);
            if (inspected.phase) nextPlan.phase = inspected.phase;
        }
        if (state.status !== 'achieved') state.status = inspected.status === 'tracking' || inspected.status === 'eligible' ? 'tracking' : 'blocked';
    }
    if (!['achieved', 'cancelled', 'expired'].includes(state.status) && current.status === 'unknown') state.status = 'blocked';
    nextPlan.status = state.status === 'achieved' ? 'succeeded' :
        ['cancelled', 'expired'].includes(state.status) ? state.status : state.status === 'blocked' ? 'blocked' : 'watching';
    state.reasonCodes = current.reasons;
    state.lastEvaluatedAt = now;
    state.currentReadiness = current;
    const changed = previousStatus !== state.status || previousPhase !== nextPlan.phase || previousReasons !== JSON.stringify(state.reasonCodes);
    const events = changed ? [{ tick: now, goalId: definition?.id, from: previousStatus, to: state.status,
        phase: nextPlan.phase, reasons: state.reasonCodes.slice() }] : [];
    return { goal: nextGoal, plan: nextPlan, currentReadiness: current, events };
}
