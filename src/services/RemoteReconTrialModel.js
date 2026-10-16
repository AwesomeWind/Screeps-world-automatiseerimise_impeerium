const ACTIVE = new Set(['waiting_spawn', 'spawning', 'travelling', 'observing']);
const TERMINAL = new Set(['completed', 'aborted']);
const STATUSES = new Set([...ACTIVE, ...TERMINAL, 'stopping']);
const CALL_STATES = new Set(['not_started', 'call_started', 'result_known', 'not_called']);
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 100;
const copy = value => JSON.parse(JSON.stringify(value));

function positionValid(pos) {
    return record(pos) && integer(pos.x) && pos.x <= 49 && integer(pos.y) && pos.y <= 49 && text(pos.roomName);
}

function evidenceValid(evidence, session) {
    if (!record(evidence) || !integer(evidence.safeStreak) || evidence.safeStreak > 100 ||
        typeof evidence.onlineRecoveryCovered !== 'boolean') return false;
    for (const key of ['spawnAcceptedTick', 'spawningObservedTick', 'bornAt', 'firstMovementAt', 'enteredRemoteAt',
        'lastPositionTick', 'lastSafeTick', 'routeCheckedAt', 'legStartedAt']) {
        if (evidence[key] !== undefined && (!integer(evidence[key]) || evidence[key] < session.startedAtTick || evidence[key] > session.lastTick)) return false;
    }
    for (const key of ['birthPosition', 'lastPosition']) {
        if (evidence[key] !== undefined && !positionValid(evidence[key])) return false;
    }
    if (evidence.firstMovementAt !== undefined && (!integer(evidence.bornAt) || evidence.firstMovementAt <= evidence.bornAt)) return false;
    if (evidence.enteredRemoteAt !== undefined && (!integer(evidence.bornAt) || evidence.enteredRemoteAt < evidence.bornAt)) return false;
    if (evidence.safeStreak > 0 && (!integer(evidence.lastSafeTick) || !integer(evidence.enteredRemoteAt) ||
        evidence.safeStreak > evidence.lastSafeTick - evidence.enteredRemoteAt + 1)) return false;
    if (evidence.maxRetryCount !== undefined && (!integer(evidence.maxRetryCount) || evidence.maxRetryCount > 1)) return false;
    if (evidence.legExpiresAt !== undefined && (!integer(evidence.legStartedAt) || !integer(evidence.legExpiresAt) ||
        evidence.legExpiresAt < evidence.legStartedAt || evidence.legExpiresAt > evidence.legStartedAt + 300)) return false;
    if (evidence.route !== undefined && (!record(evidence.route) || typeof evidence.route.valid !== 'boolean' ||
        evidence.route.checkedAt !== undefined && evidence.route.checkedAt !== evidence.routeCheckedAt)) return false;
    return true;
}

function spawnValid(spawn, session) {
    if (!record(spawn)) return false;
    for (const key of ['requestId', 'grantId', 'name', 'spawnName']) {
        if (spawn[key] !== undefined && !text(spawn[key])) return false;
    }
    for (const key of ['deadline', 'callTick', 'acceptedAt']) {
        if (spawn[key] !== undefined && (!integer(spawn[key]) || spawn[key] < session.startedAtTick ||
            key !== 'deadline' && spawn[key] > session.lastTick)) return false;
    }
    if (spawn.requestId !== undefined && (!integer(spawn.deadline) || spawn.deadline >= session.expiresAtTick)) return false;
    if (spawn.callState !== undefined && (!CALL_STATES.has(spawn.callState) || !text(spawn.requestId) || !text(spawn.name))) return false;
    if (spawn.callState === 'call_started' && (!integer(spawn.callTick) || spawn.acceptedAt !== undefined)) return false;
    if (spawn.result !== undefined && !Number.isSafeInteger(spawn.result)) return false;
    if (spawn.callState === 'result_known' && !Number.isSafeInteger(spawn.result)) return false;
    if (spawn.acceptedAt !== undefined && (spawn.callState !== 'result_known' || spawn.result !== 0)) return false;
    return true;
}

function stateValid(state) {
    if (!record(state) || state.schemaVersion !== 1 || !integer(state.lastSequence)) return false;
    for (const session of [state.current, state.previous]) {
        if (session === null) continue;
        if (!record(session) || !record(session.identity) || !STATUSES.has(session.status) ||
            !text(session.identity.trialId) || !integer(session.identity.sequence) || session.identity.sequence < 1 ||
            session.identity.sequence > state.lastSequence || !text(session.identity.remoteId) ||
            !text(session.identity.codeVersion) || !integer(session.identity.epoch) ||
            !integer(session.startedAtTick) || session.expiresAtTick !== session.startedAtTick + 300 ||
            !integer(session.issuedAtMs) || session.expiresAtMs !== session.issuedAtMs + 1200000 ||
            !integer(session.lastTick) || session.lastTick < session.startedAtTick || !integer(session.lastNowMs) ||
            session.lastNowMs < session.issuedAtMs || !text(session.candidateSourceId) ||
            typeof session.managed !== 'boolean' || !spawnValid(session.spawn, session) || !evidenceValid(session.evidence, session) ||
            !Array.isArray(session.events) || session.events.length > 20) return false;
        if (!session.managed && (!TERMINAL.has(session.status) || state.lastSequence <= session.identity.sequence)) return false;
        if (session.scopeCheckedAt !== undefined && (!integer(session.scopeCheckedAt) || session.scopeCheckedAt > session.lastTick)) return false;
        if (session.scopeAllowsOutbound !== undefined && typeof session.scopeAllowsOutbound !== 'boolean') return false;
        if (!session.events.every(event => record(event) && integer(event.tick) && STATUSES.has(event.status) && text(event.reason))) return false;
        if ((session.status === 'stopping' || TERMINAL.has(session.status)) &&
            (!record(session.outcome) || !TERMINAL.has(session.outcome.verdict) ||
                !integer(session.outcome.decidedAtTick) || !text(session.outcome.stopReason) ||
                !evidenceValid(session.outcome.evidence, session))) return false;
    }
    return true;
}

function denied(managed, tick, reason) {
    return { managed, evaluatedAt: tick, allowSpawn: false, allowOutbound: false, allowReturn: false, reason };
}

export function reconTrialPermission(state, query, clock) {
    if (state === undefined) return denied(false, clock.tick, null);
    if (!stateValid(state)) return denied(true, clock.tick, 'state_invalid');
    const session = state.current;
    if (!session?.managed || query.remoteId !== session.identity.remoteId) return denied(false, clock.tick, null);
    const permit = denied(true, clock.tick, 'trial_closed');
    if (query.epoch !== undefined && query.epoch !== session.identity.epoch ||
        query.trialId !== undefined && query.trialId !== session.identity.trialId ||
        query.sequence !== undefined && query.sequence !== session.identity.sequence ||
        query.requestId !== undefined && session.spawn.requestId !== undefined && query.requestId !== session.spawn.requestId) {
        permit.reason = 'trial_identity_conflict';
        return permit;
    }
    // Safe return remains subject to the existing strategy's own home/route gates.
    permit.allowReturn = true;
    if (!ACTIVE.has(session.status)) return permit;
    if (!integer(clock.tick) || !integer(clock.nowMs) || clock.codeVersion !== session.identity.codeVersion ||
        clock.tick >= session.expiresAtTick || clock.nowMs >= session.expiresAtMs ||
        clock.nowMs < session.lastNowMs || session.lastTick !== clock.tick || session.scopeCheckedAt !== clock.tick) {
        permit.reason = 'trial_stale_or_expired';
        return permit;
    }
    permit.allowOutbound = session.scopeAllowsOutbound === true;
    permit.allowSpawn = permit.allowOutbound && session.spawn.acceptedAt === undefined &&
        session.spawn.callState !== 'call_started' &&
        (session.spawn.deadline === undefined || session.spawn.deadline >= clock.tick);
    permit.reason = permit.allowOutbound ? null : 'departure_blocked';
    return permit;
}

function append(session, clock, reason) {
    const last = session.events.at(-1);
    if (last?.tick === clock.tick && last.reason === reason && last.status === session.status) return;
    session.events.push({ tick: clock.tick, status: session.status, reason });
    if (session.events.length > 20) session.events.splice(0, session.events.length - 20);
}

function closeEffects(session) {
    return ['close_scope', 'cancel_unstarted', 'clear_outbound'].map(type => ({ type, ...session.identity,
        requestId: session.spawn.requestId || null }));
}

function stop(session, reason, clock, verdict = 'aborted') {
    if (!session.outcome) {
        session.outcome = { verdict, stopReason: reason, decidedAtTick: clock.tick, evidence: copy(session.evidence) };
        session.status = 'stopping';
        session.closeAppliedAtTick = clock.tick;
        append(session, clock, reason);
    }
    session.scopeAllowsOutbound = false;
    return closeEffects(session);
}

function requestError(request, facts, clock) {
    if (!record(request) || request.schemaVersion !== 1 || !['start', 'release'].includes(request.action) ||
        !text(request.id) || request.id.length > 64 || !integer(request.sequence) || request.sequence < 1 ||
        !text(request.remoteId) || request.remoteId !== facts.remoteId || request.epoch !== facts.epoch ||
        request.codeVersion !== clock.codeVersion || !integer(request.activateAtTick) ||
        request.expiresAtTick !== request.activateAtTick + 300 || !integer(request.issuedAtMs) ||
        request.expiresAtMs !== request.issuedAtMs + 1200000 || !integer(clock.nowMs) ||
        request.issuedAtMs > clock.nowMs || clock.nowMs >= request.expiresAtMs ||
        request.action === 'start' && !text(request.candidateSourceId)) return 'request_invalid';
    return null;
}

function factFailure(facts) {
    if (facts.fatalReason) return facts.fatalReason;
    if (facts.controlSafe !== true) return 'protected_control_changed';
    if (facts.isolated !== true) return 'isolation_changed';
    if (facts.homeHealthy !== true) return 'home_unavailable';
    if (!Number.isFinite(facts.receiverFree) || facts.receiverFree < 20000) return 'receiver_unavailable';
    if (facts.budgetSafe !== true) return 'budget_unavailable';
    return null;
}

function makeSession(request, facts, clock) {
    return { identity: { trialId: request.id, sequence: request.sequence, remoteId: request.remoteId,
        epoch: request.epoch, codeVersion: request.codeVersion }, candidateSourceId: request.candidateSourceId,
        startedAtTick: request.activateAtTick, expiresAtTick: request.expiresAtTick,
        issuedAtMs: request.issuedAtMs, expiresAtMs: request.expiresAtMs,
        configFingerprint: facts.configFingerprint, baseRoom: facts.baseRoom, targetRoom: facts.targetRoom,
        status: 'waiting_spawn', managed: true, lastTick: clock.tick, lastNowMs: clock.nowMs,
        spawn: {}, evidence: { safeStreak: 0, onlineRecoveryCovered: false,
            spawnEnergyBaseline: Number.isFinite(facts.spawnEnergyConfirmed) ? facts.spawnEnergyConfirmed : null }, events: [] };
}

function rejection(state, request, clock, reason) {
    state.lastRejection = { sequence: integer(request?.sequence) ? request.sequence : null,
        id: text(request?.id) ? request.id : null, tick: clock.tick, reason };
}

function observeActor(session, facts, clock) {
    const actors = facts.actors || [];
    if (actors.length > 1) return 'extra_actor';
    const actor = actors[0];
    if (!actor) {
        if (session.spawn.acceptedAt !== undefined && clock.tick > session.spawn.acceptedAt && !facts.upcoming) return 'actor_missing';
        return null;
    }
    if (actor.trialId !== session.identity.trialId || actor.sequence !== session.identity.sequence ||
        actor.epoch !== session.identity.epoch || actor.name !== session.spawn.name) return 'actor_identity_changed';
    if (!actor.hasMove) return 'actor_no_move';
    const evidence = session.evidence;
    if (actor.spawning) {
        evidence.spawningObservedTick ??= clock.tick;
        return null;
    }
    if (evidence.bornAt === undefined) {
        evidence.bornAt = clock.tick;
        evidence.birthPosition = { x: actor.pos.x, y: actor.pos.y, roomName: actor.pos.roomName };
        session.status = 'travelling';
    }
    const previous = evidence.lastPosition;
    const moved = evidence.bornAt < clock.tick && evidence.lastPositionTick < clock.tick && previous &&
        (previous.x !== actor.pos.x || previous.y !== actor.pos.y || previous.roomName !== actor.pos.roomName);
    if (moved) {
        evidence.firstMovementAt ??= clock.tick;
    }
    evidence.lastPosition = { x: actor.pos.x, y: actor.pos.y, roomName: actor.pos.roomName };
    evidence.lastPositionTick = clock.tick;
    if (actor.leg) {
        evidence.legStartedAt ??= actor.leg.startedAt;
        evidence.legExpiresAt ??= actor.leg.expiresAt;
        evidence.maxRetryCount = Math.max(evidence.maxRetryCount || 0, actor.leg.retryCount || 0);
        if (actor.leg.retryCount === 1 && moved) evidence.onlineRecoveryCovered = true;
        if (['retry_exhausted', 'leg_expired', 'route_invalid', 'leg_state_invalid'].includes(actor.leg.blockedReason)) return actor.leg.blockedReason;
    }
    if (actor.pos.roomName === session.targetRoom) {
        evidence.enteredRemoteAt ??= clock.tick;
        session.status = 'observing';
        if (facts.remoteSafe === true && evidence.lastSafeTick !== clock.tick) {
            evidence.safeStreak = evidence.lastSafeTick === clock.tick - 1 ? Math.min(100, evidence.safeStreak + 1) : 1;
            evidence.lastSafeTick = clock.tick;
        }
    } else evidence.safeStreak = 0;
    if (facts.sourceValid === false || facts.visibleRoute?.valid === false) return 'visible_route_invalid';
    if (facts.sourceValid === true && facts.visibleRoute?.valid === true) {
        evidence.routeCheckedAt = facts.visibleRoute.checkedAt ?? clock.tick;
        evidence.route = copy(facts.visibleRoute);
    }
    return null;
}

export function advanceReconTrial(input, event, facts, clock) {
    if (input !== undefined && !stateValid(input)) {
        return { state: input, permit: denied(true, clock.tick, 'state_invalid'), effects: [] };
    }
    if (input === undefined && facts.guardEnabled !== true) {
        return { state: undefined, permit: denied(false, clock.tick, null), effects: [] };
    }
    let state = input === undefined ? { schemaVersion: 1, lastSequence: 0, current: null, previous: null } : copy(input);
    let session = state.current;
    const request = facts.request;
    if (event.kind === 'begin_tick' && facts.guardEnabled === true && request &&
        (!session || request.sequence !== session.identity.sequence || request.id !== session.identity.trialId)) {
        let reason = requestError(request, facts, clock);
        if (!reason && request.sequence <= state.lastSequence) reason = 'sequence_replayed';
        if (!reason && clock.tick < request.activateAtTick) {
            return { state: input, permit: denied(true, clock.tick, 'activation_pending'), effects: [] };
        }
        if (!reason && clock.tick > request.activateAtTick) reason = 'activation_missed';
        if (!reason && request.action === 'release') {
            if (!session || !TERMINAL.has(session.status) || request.targetTrialId !== session.identity.trialId ||
                facts.closed !== true || facts.moduleClosed !== true || facts.oldActors || facts.unsettled) reason = 'release_blocked';
            else { session.managed = false; state.lastSequence = request.sequence; }
        } else if (!reason) {
            reason = session?.managed && !TERMINAL.has(session.status) ? 'trial_in_progress' :
                facts.oldActors || facts.unsettled ? 'existing_scope' : factFailure(facts);
            if (!reason) {
                state.previous = session;
                session = state.current = makeSession(request, facts, clock);
                state.lastSequence = request.sequence;
                append(session, clock, 'started');
            }
        }
        if (reason) rejection(state, request, clock, reason);
    }
    if (!session?.managed) {
        return { state, permit: denied(false, clock.tick, state.lastRejection?.reason || null), effects: [] };
    }
    let effects = [];
    if (TERMINAL.has(session.status) || session.status === 'stopping') {
        if (facts.closed !== true) {
            session.status = 'stopping';
            delete session.closureVerifiedAtTick;
            effects = closeEffects(session);
        }
        if (session.status === 'stopping' && clock.tick > session.closeAppliedAtTick && facts.closed === true) {
            session.status = session.outcome.verdict;
            session.closureVerifiedAtTick = clock.tick;
        }
    } else {
        const receipt = facts.spawnReceipt;
        if (session.spawn.acceptedAt === undefined && receipt?.requestId === session.spawn.requestId &&
            text(receipt?.name) && integer(receipt.tick) && receipt.tick <= clock.tick) {
            session.spawn.name = receipt.name;
            session.spawn.acceptedAt = receipt.tick;
            session.spawn.callState = 'result_known';
            session.spawn.result = 0;
            session.status = 'spawning';
            session.evidence.spawnAcceptedTick = receipt.tick;
        }
        let reason = !integer(clock.nowMs) || clock.nowMs < session.lastNowMs ? 'clock_invalid' :
            clock.tick >= session.expiresAtTick ? 'tick_expired' : clock.nowMs >= session.expiresAtMs ? 'wall_expired' :
            clock.codeVersion !== session.identity.codeVersion || facts.epoch !== session.identity.epoch ||
            facts.remoteId !== session.identity.remoteId ? 'identity_changed' :
            facts.guardEnabled !== true ? 'guard_disabled' :
            session.configFingerprint !== facts.configFingerprint ? 'config_changed' : factFailure(facts);
        if (!reason && clock.tick > session.lastTick + 1) reason = 'tick_gap';
        if (!reason && session.spawn.acceptedAt === undefined && session.spawn.deadline !== undefined && clock.tick > session.spawn.deadline) reason = 'spawn_request_expired';
        if (!reason && event.kind === 'begin_tick' && session.spawn.callState === 'call_started' && session.spawn.callTick < clock.tick) {
            const receipt = facts.spawnReceipt;
            if (receipt?.name === session.spawn.name && receipt.requestId === session.spawn.requestId) {
                session.spawn.callState = 'result_known';
                session.spawn.result = 0;
                session.spawn.acceptedAt = receipt.tick;
                session.status = 'spawning';
            } else reason = 'spawn_unknown';
        }
        if (reason) effects = stop(session, reason, clock);
        else {
            session.lastTick = clock.tick;
            session.lastNowMs = clock.nowMs;
            if (event.kind === 'scope_observed') {
                session.scopeCheckedAt = clock.tick;
                session.scopeAllowsOutbound = facts.scopeFresh === true && facts.existingReconAllowed === true;
                reason = observeActor(session, facts, clock);
                if (reason) effects = stop(session, reason, clock);
                else if (session.evidence.firstMovementAt !== undefined && session.evidence.enteredRemoteAt !== undefined &&
                    session.evidence.safeStreak >= 100 && session.evidence.routeCheckedAt === clock.tick &&
                    facts.sourceValid === true && facts.visibleRoute?.valid === true) {
                    effects = stop(session, 'recon_complete', clock, 'completed');
                }
            }
            if (event.kind === 'spawn_bound' && !session.spawn.requestId) {
                session.spawn.requestId = event.requestId;
                session.spawn.deadline = Math.min(event.deadline, session.expiresAtTick - 1);
            }
            if (event.kind === 'spawn_intake' || event.kind === 'spawn_call_started') {
                if (event.kind === 'spawn_intake') { delete session.spawn.result; delete session.spawn.callTick; }
                session.spawn.name = event.name;
                session.spawn.spawnName = event.spawnName;
                session.spawn.callState = event.kind === 'spawn_intake' ? 'not_started' : 'call_started';
                if (event.kind === 'spawn_call_started') session.spawn.callTick = clock.tick;
            }
            if (event.kind === 'spawn_not_called') session.spawn.callState = 'not_called';
            if (event.kind === 'spawn_result') {
                session.spawn.result = event.result;
                session.spawn.callState = 'result_known';
                if (event.result === 0) {
                    session.spawn.acceptedAt = clock.tick;
                    session.spawn.name = event.name;
                    session.status = 'spawning';
                    session.evidence.spawnAcceptedTick = clock.tick;
                }
            }
        }
    }
    if (session.outcome && event.kind === 'spawn_not_called') session.spawn.callState = 'not_called';
    if (session.outcome && event.kind === 'spawn_result') {
        session.spawn.callState = 'result_known';
        session.spawn.result = event.result;
        if (event.result === 0) {
            session.spawn.acceptedAt ??= clock.tick;
            session.spawn.name = event.name;
        }
    }
    if (facts.settlement) session.settlement = copy(facts.settlement);
    const permit = reconTrialPermission(state, { remoteId: session.identity.remoteId, epoch: session.identity.epoch }, clock);
    return { state, permit, effects };
}

export function summarizeReconTrial(state, clock) {
    if (state === undefined) return null;
    if (!stateValid(state)) return { capturedAt: clock.tick, status: 'state_invalid' };
    const compact = session => session && ({ ...session.identity, status: session.status, managed: session.managed,
        startedAtTick: session.startedAtTick, expiresAtTick: session.expiresAtTick,
        closeAppliedAtTick: session.closeAppliedAtTick, closureVerifiedAtTick: session.closureVerifiedAtTick,
        moduleShutdownConflict: session.moduleShutdownConflict === true,
        evidence: copy(session.evidence), outcome: session.outcome ? copy(session.outcome) : null,
        settlement: session.settlement ? copy(session.settlement) : null, events: copy(session.events) });
    return { schemaVersion: 1, capturedAt: clock.tick, status: state.current?.status || 'rejected',
        current: compact(state.current), previous: compact(state.previous), lastRejection: state.lastRejection || null };
}
