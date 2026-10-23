import { ECONOMIC_ROLE_LIMITS, economicSpawnReceipt, reduceEconomicTrialEvidence, applyEconomicResolution, economicResolutionKey } from './RemoteEconomicTrialEvidence.js';

const ROLES = ['scout', 'remoteMiner', 'remoteHauler'];
const ACTIVE = new Set(['recon', 'observing', 'preparing', 'hauling']);
const copy = value => JSON.parse(JSON.stringify(value));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 4096;

function admissionValid(slot, session) {
    const fields = ['admissionStage', 'admissionTick', 'admissionSpawnName'];
    if (fields.every(key => slot[key] === undefined)) return true;
    return ['binding', 'admitted'].includes(slot.admissionStage) && integer(slot.admissionTick) &&
        slot.admissionTick >= session.startedAtTick && slot.admissionTick <= session.lastTick &&
        text(slot.admissionSpawnName) && slot.admissionSpawnName.length <= 100 && text(slot.requestId) &&
        slot.deadline === Math.min(slot.admissionTick + 5, session.expiresAtTick - 1) &&
        (slot.admissionStage !== 'binding' || slot.calls === 0 && slot.acceptedAt === undefined &&
            !['call_started', 'result_known'].includes(slot.callState));
}

export function economicIdentityMatches(a, b) {
    return !!a && !!b && ['trialId', 'sequence', 'remoteId', 'epoch', 'codeVersion'].every(key => a[key] === b[key]);
}

export function validEconomicTrialState(state) {
    if (!record(state) || state.schemaVersion !== 1 || !integer(state.lastSequence)) return false;
    for (const session of [state.current, state.previous]) {
        if (session === null) continue;
        if (!record(session) || !record(session.identity) || !text(session.identity.trialId) ||
            !text(session.identity.remoteId) || !text(session.identity.codeVersion) ||
            !integer(session.identity.sequence) || session.identity.sequence < 1 ||
            !integer(session.identity.epoch) || session.identity.epoch < 1 ||
            !['recon', 'observing', 'preparing', 'hauling', 'stopping', 'terminal'].includes(session.status) ||
            typeof session.managed !== 'boolean' || !integer(session.startedAtTick) ||
            session.expiresAtTick !== session.startedAtTick + 1000 ||
            !integer(session.issuedAtMs) || session.expiresAtMs !== session.issuedAtMs + 5400000 ||
            !integer(session.lastTick) || !integer(session.lastNowMs) || !text(session.configFingerprint) ||
            !record(session.slots) || !Array.isArray(session.events) || session.events.length > 20 ||
            !Array.isArray(session.outbox) || session.outbox.length > 16) return false;
        if (!ROLES.every(role => record(session.slots[role]))) return false;
        if (session.visionAcquired !== undefined && typeof session.visionAcquired !== 'boolean' ||
            !integer(session.safeStreak) || session.safeStreak > 100 ||
            session.safeStreak > 0 && (!integer(session.lastSafeTick) || session.lastSafeTick > session.lastTick ||
                session.lastSafeTick < session.startedAtTick || session.visionAcquired !== true ||
                !integer(session.safeStartedAtTick) || session.safeStartedAtTick < session.startedAtTick ||
                session.safeStreak !== Math.min(100, session.lastSafeTick - session.safeStartedAtTick + 1)) ||
            ['preparing', 'hauling'].includes(session.status) && session.safeStreak !== 100 ||
            session.scopeCheckedAt !== undefined && (!integer(session.scopeCheckedAt) || session.scopeCheckedAt > session.lastTick)) return false;
        for (const role of ROLES) {
            const slot = session.slots[role];
            if (!admissionValid(slot, session)) return false;
            if (!integer(slot.calls) || slot.calls > 2 || slot.cost !== undefined &&
                (!integer(slot.cost) || slot.cost <= 0 || slot.cost > ECONOMIC_ROLE_LIMITS[role])) return false;
            if (slot.requestId !== undefined && (!text(slot.requestId) || !integer(slot.deadline) || slot.deadline >= session.expiresAtTick)) return false;
            if (slot.callState !== undefined && !['not_started', 'not_called', 'call_started', 'result_known'].includes(slot.callState)) return false;
            if (slot.bodyCost !== undefined && (!integer(slot.bodyCost) || slot.bodyCost <= 0 || slot.bodyCost > ECONOMIC_ROLE_LIMITS[role])) return false;
            if (slot.unknownUpperBound !== undefined && (!integer(slot.unknownUpperBound) || slot.unknownUpperBound > ECONOMIC_ROLE_LIMITS[role])) return false;
            if (slot.ledgerStage !== undefined && !['applying', 'applied'].includes(slot.ledgerStage)) return false;
            // Applying accounting is never evidence that an engine call was unstarted.
            if (slot.ledgerStage === 'applying' && slot.callState !== 'call_started') return false;
            if (slot.acceptedAt !== undefined && (!integer(slot.acceptedAt) || slot.acceptedAt < session.startedAtTick ||
                slot.acceptedAt >= session.expiresAtTick || !text(slot.name) || slot.cost !== slot.bodyCost ||
                !economicIdentityMatches(slot.receiptBinding?.identity, session.identity) || slot.receiptBinding.requestId !== slot.requestId ||
                slot.receiptBinding.name !== slot.name || slot.receiptBinding.tick !== slot.acceptedAt ||
                slot.ledgerStage !== 'applied' || slot.nativeResult !== 0 || slot.ledgerApplication?.applied !== true ||
                slot.ledgerApplication.cost !== slot.cost)) return false;
        }
        if (!record(session.evidence) || !['confirmedSpawnCost', 'confirmedInfrastructureCost', 'unknownEnergyUpperBound', 'unknownEvents', 'returnedEnergy']
            .every(key => integer(session.evidence[key])) || !record(session.evidence.pickups) || !record(session.evidence.delivered)) return false;
        if (!session.outbox.every(item => record(item) && text(item.key) && record(item.resolution) &&
            ['prepared', 'applying', 'applied'].includes(item.stage))) return false;
        if (session.outcome && (!record(session.outcome) || !text(session.outcome.stopReason) ||
            !integer(session.outcome.decidedAtTick))) return false;
    }
    return true;
}

function permit(managed, clock, allowed = false, reason = null) {
    return { managed, evaluatedAt: clock.tick, allowed, reason };
}

export function economicTrialPermission(state, query = {}, clock) {
    if (state === undefined) return permit(false, clock, true);
    if (!validEconomicTrialState(state)) return permit(true, clock, false, 'state_invalid');
    const session = state.current;
    if (!session?.managed || query.remoteId && query.remoteId !== session.identity.remoteId) return permit(false, clock, true);
    for (const key of ['remoteId', 'epoch', 'trialId', 'sequence']) {
        if (query[key] !== undefined && query[key] !== session.identity[key]) return permit(true, clock, false, 'identity_conflict');
    }
    if (['return', 'home_delivery'].includes(query.action) && session.outcome) {
        return permit(true, clock, clock.tick <= session.tailExpiresAtTick && query.epoch === session.identity.epoch &&
            query.trialId === session.identity.trialId && query.sequence === session.identity.sequence &&
            query.role !== undefined && !!session.slots[query.role]?.name && query.name === session.slots[query.role].name, 'tail_only');
    }
    if (!ACTIVE.has(session.status) || session.outcome) return permit(true, clock, false, 'trial_closed');
    if (session.outbox.some(item => item.stage === 'applying')) return permit(true, clock, false, 'settlement_pending');
    if (clock.codeVersion !== session.identity.codeVersion || !integer(clock.nowMs) ||
        clock.nowMs < session.lastNowMs || clock.nowMs >= session.expiresAtMs ||
        clock.tick >= session.expiresAtTick || session.lastTick !== clock.tick ||
        session.scopeCheckedAt !== clock.tick) return permit(true, clock, false, 'trial_stale_or_expired');
    const role = query.role;
    const slot = session.slots[role];
    if (!slot) return permit(true, clock, false, 'role_blocked');
    const actions = { scout: ['spawn', 'outbound', 'return'],
        remoteMiner: ['spawn', 'outbound', 'return', 'harvest', 'container_site', 'build', 'repair', 'source_deposit'],
        remoteHauler: ['spawn', 'outbound', 'return', 'pickup', 'home_delivery'] };
    if (!actions[role].includes(query.action)) return permit(true, clock, false, 'action_blocked');
    if (query.requestId && slot.requestId && query.requestId !== slot.requestId ||
        query.action !== 'spawn' && query.name && slot.name && query.name !== slot.name) return permit(true, clock, false, 'slot_identity_conflict');
    const stageAllows = role === 'scout' || role === 'remoteMiner' && ['preparing', 'hauling'].includes(session.status) ||
        role === 'remoteHauler' && session.status === 'hauling';
    if (!stageAllows) return permit(true, clock, false, 'stage_blocked');
    if (query.action === 'container_site') return permit(true, clock, true);
    if (query.action === 'spawn' && slot.admissionStage === 'binding' &&
        (query.spawnCheckpoint !== 'intake' || slot.admissionTick !== clock.tick)) return permit(true, clock, false, 'admission_incomplete');
    if (query.action === 'spawn') return permit(true, clock, slot.acceptedAt === undefined &&
        slot.callState !== 'call_started' && (slot.calls || 0) < 2 &&
        (slot.deadline === undefined || clock.tick <= slot.deadline), 'spawn_gate');
    const actorMatches = query.trialId === session.identity.trialId && query.sequence === session.identity.sequence &&
        query.epoch === session.identity.epoch && query.name === slot.name && slot.acceptedAt !== undefined;
    return permit(true, clock, actorMatches, actorMatches ? null : 'actor_unbound');
}

function closeEffects(session) {
    return [{ type: 'close_scope', ...session.identity }, { type: 'cancel_unstarted', ...session.identity },
        { type: 'clear_economic_tasks', ...session.identity }];
}

export function stopEconomicTrial(session, reason, clock, verdict = 'aborted') {
    if (!session.outcome) {
        session.outcome = { verdict, stopReason: reason, decidedAtTick: clock.tick };
        session.closeAppliedAtTick = clock.tick;
        session.tailExpiresAtTick = clock.tick + 300;
        session.status = 'stopping';
        session.events.push({ tick: clock.tick, status: 'stopping', reason });
        if (session.events.length > 20) session.events.shift();
    }
    return closeEffects(session);
}

function failure(facts) {
    if (facts.fatalReason) return facts.fatalReason;
    if (!facts.controlSafe) return 'protected_control_changed';
    if (!facts.isolated) return 'isolation_changed';
    if (!facts.homeHealthy) return 'home_unavailable';
    if (!Number.isFinite(facts.receiverFree) || facts.receiverFree < 20000) return 'receiver_unavailable';
    if (!facts.budgetSafe) return 'budget_unavailable';
    return null;
}

function requestError(request, facts, clock, action = 'start') {
    return !record(request) || request.schemaVersion !== 1 || request.action !== action ||
        !text(request.id) || request.id.length > 64 || !integer(request.sequence) || request.sequence < 1 ||
        request.remoteId !== facts.remoteId || request.epoch !== facts.epoch ||
        request.codeVersion !== clock.codeVersion || !integer(request.activateAtTick) ||
        request.expiresAtTick !== request.activateAtTick + 1000 || !integer(request.issuedAtMs) ||
        request.expiresAtMs !== request.issuedAtMs + 5400000 ||
        request.configFingerprint !== facts.configFingerprint || !text(request.configFingerprint) ||
        !integer(clock.nowMs) || clock.nowMs < request.issuedAtMs || clock.nowMs >= request.expiresAtMs;
}

function makeSession(request, facts, clock) {
    return {
        identity: { trialId: request.id, sequence: request.sequence, remoteId: request.remoteId,
            epoch: request.epoch, codeVersion: request.codeVersion },
        managed: true, status: 'recon', baseRoom: facts.baseRoom, targetRoom: facts.targetRoom,
        configFingerprint: request.configFingerprint, startedAtTick: request.activateAtTick,
        receiverId: facts.receiverId, sourceId: facts.sourceId, containerPos: facts.containerPos,
        expiresAtTick: request.expiresAtTick, issuedAtMs: request.issuedAtMs, expiresAtMs: request.expiresAtMs,
        lastTick: clock.tick, lastNowMs: clock.nowMs, visionAcquired: false, safeStreak: 0,
        slots: Object.fromEntries(ROLES.map(role => [role, { calls: 0 }])),
        events: [{ tick: clock.tick, status: 'recon', reason: 'started' }], outbox: [],
        evidence: { confirmedSpawnCost: 0, confirmedInfrastructureCost: 0, unknownEnergyUpperBound: 0,
            unknownEvents: 0, pickups: {}, delivered: {}, returnedEnergy: 0 }
    };
}

export function advanceEconomicTrial(input, event, facts, clock) {
    if (input !== undefined && !validEconomicTrialState(input)) {
        return { state: input, permit: permit(true, clock, false, 'state_invalid'), effects: [{ type: 'emergency_close' }] };
    }
    if (input === undefined && !facts.guardEnabled) return { state: undefined, permit: permit(false, clock, true), effects: [] };
    const state = input === undefined ? { schemaVersion: 1, lastSequence: 0, current: null, previous: null } : copy(input);
    let session = state.current;
    let effects = [];
    const request = facts.request;
    if (event.kind === 'evaluate' && facts.guardEnabled && request?.action === 'release') {
        if (!requestError(request, facts, clock, 'release') && clock.tick === request.activateAtTick &&
            session?.status === 'terminal' && request.targetTrialId === session.identity.trialId &&
            integer(request.sequence) && request.sequence > state.lastSequence && facts.closed &&
            !facts.oldActors && !facts.unsettled) {
            session.managed = false;
            state.lastSequence = request.sequence;
        } else state.lastRejection = { tick: clock.tick, reason: 'release_blocked' };
    } else if (event.kind === 'evaluate' && facts.guardEnabled && request &&
        (!session || request.id !== session.identity.trialId || request.sequence !== session.identity.sequence)) {
        let reason = requestError(request, facts, clock) ? 'request_invalid' :
            request.sequence <= state.lastSequence ? 'sequence_replayed' :
            clock.tick < request.activateAtTick ? 'activation_pending' :
            clock.tick > request.activateAtTick ? 'activation_missed' :
            session?.managed ? (session.status === 'terminal' ? 'release_required' : 'trial_in_progress') :
            facts.reconLocked || facts.oldActors || facts.unsettled ? 'existing_scope' : failure(facts);
        if (reason) state.lastRejection = { tick: clock.tick, reason };
        else {
            state.previous = session;
            state.current = session = makeSession(request, facts, clock);
            state.lastSequence = request.sequence;
        }
    }
    if (!session?.managed) return { state, effects, permit: permit(!!facts.guardEnabled, clock, !facts.guardEnabled, state.lastRejection?.reason) };
    for (const role of ROLES) {
        const slot = session.slots[role];
        const receipt = economicSpawnReceipt(session, role, facts, clock);
        if (receipt) {
            slot.acceptedAt ??= receipt.tick;
            slot.cost = receipt.cost;
            slot.receiptBinding = { identity: copy(session.identity), requestId: slot.requestId, name: slot.name, tick: receipt.tick };
            slot.callState = 'result_known';
            slot.result = 0;
            delete slot.unknownUpperBound;
        }
    }
    if (session.outcome) {
        if (!facts.closed) effects = closeEffects(session);
        if (facts.closed && clock.tick > session.closeAppliedAtTick) {
            session.status = 'terminal';
            session.closureVerifiedAtTick ??= clock.tick;
        }
    } else {
        if (ROLES.some(role => session.slots[role].admissionStage === 'binding' &&
            session.slots[role].admissionTick < clock.tick)) effects = stopEconomicTrial(session, 'spawn_admission_interrupted', clock);
        const unknownRole = ROLES.find(role => session.slots[role].callState === 'call_started' &&
            session.slots[role].callTick < clock.tick);
        if (unknownRole) {
            const slot = session.slots[unknownRole];
            slot.unknownUpperBound = slot.bodyCost;
            if (!slot.unknownReported) { session.evidence.unknownEvents++; slot.unknownReported = true; }
            effects = stopEconomicTrial(session, 'spawn_unknown', clock);
        }
        const reason = !integer(clock.nowMs) || clock.nowMs < session.lastNowMs ? 'clock_invalid' :
            clock.tick >= session.expiresAtTick ? 'tick_expired' :
            clock.nowMs >= session.expiresAtMs ? 'wall_expired' :
            clock.codeVersion !== session.identity.codeVersion || facts.epoch !== session.identity.epoch ||
                facts.remoteId !== session.identity.remoteId ? 'identity_changed' :
            !facts.guardEnabled ? 'guard_disabled' :
            request?.action === 'hold' ? 'manual_hold' :
            session.configFingerprint !== facts.configFingerprint ? 'config_changed' :
            clock.tick > session.lastTick + 1 ? 'tick_gap' : failure(facts) ||
            (session.visionAcquired === true && facts.remoteVisible !== true ? 'vision_lost' : null);
        if (reason) effects = stopEconomicTrial(session, reason, clock, reason.endsWith('expired') ? 'expired' : 'aborted');
        else if (!session.outcome) {
            session.lastTick = clock.tick;
            session.lastNowMs = clock.nowMs;
            const actorConflict = (facts.actors || []).some(actor => {
                const slot = session.slots[actor.role];
                return !slot || slot.name !== actor.name || actor.trialId !== session.identity.trialId ||
                    actor.sequence !== session.identity.sequence || actor.epoch !== session.identity.epoch || !actor.hasMove;
            });
            if (actorConflict || (facts.actors || []).some(actor =>
                facts.actors.filter(other => other.role === actor.role).length > 1)) {
                effects = stopEconomicTrial(session, 'extra_or_invalid_actor', clock);
            }
            if (ROLES.some(role => {
                const slot = session.slots[role];
                return slot.acceptedAt !== undefined && clock.tick > slot.acceptedAt &&
                    !(facts.actors || []).some(actor => actor.name === slot.name) && !(facts.upcomingNames || []).includes(slot.name);
            })) effects = stopEconomicTrial(session, 'actor_missing', clock);
            const expiredSlot = ROLES.find(role => session.slots[role].acceptedAt === undefined &&
                session.slots[role].deadline !== undefined && clock.tick > session.slots[role].deadline);
            if (expiredSlot) effects = stopEconomicTrial(session, 'spawn_request_expired', clock);
            if (['spawn_admission_begin', 'spawn_admission_complete'].includes(event.kind)) {
                const context = event.context;
                const slot = session.slots[event.role];
                const matching = slot && context?.role === event.role && economicIdentityMatches(session.identity, context) &&
                    text(context.requestId) && context.grantId === context.requestId && text(context.spawnName) &&
                    context.baseRoom === session.baseRoom && text(context.name);
                if (event.kind === 'spawn_admission_begin') {
                    if (!session.outcome && matching && !slot.requestId &&
                        context.deadline === Math.min(clock.tick + 5, session.expiresAtTick - 1)) {
                        Object.assign(slot, {requestId: context.requestId, deadline: context.deadline,
                            admissionStage: 'binding', admissionTick: clock.tick, admissionSpawnName: context.spawnName});
                    } else effects = stopEconomicTrial(session, 'spawn_admission_conflict', clock);
                } else if (!session.outcome && matching && slot.admissionStage === 'binding' &&
                    slot.admissionTick === clock.tick && slot.admissionSpawnName === context.spawnName &&
                    slot.requestId === context.requestId && slot.deadline === context.deadline &&
                    slot.callState === 'not_started' && slot.intakeTick === clock.tick && slot.name === context.name &&
                    slot.bodyCost === context.bodyCost && JSON.stringify(slot.body) === JSON.stringify(context.body)) {
                    slot.admissionStage = 'admitted';
                } else effects = stopEconomicTrial(session, 'spawn_admission_incomplete', clock);
            }
            if (event.kind === 'spawn_bound' && ROLES.includes(event.role)) {
                const slot = session.slots[event.role];
                if (!slot.requestId && text(event.requestId) && integer(event.deadline)) {
                    slot.requestId = event.requestId;
                    slot.deadline = Math.min(event.deadline, session.expiresAtTick - 1);
                }
            }
            if (event.kind === 'spawn_event' && ROLES.includes(event.context?.role)) {
                const context = event.context;
                const slot = session.slots[context.role];
                if (!economicIdentityMatches(session.identity, context) || context.requestId !== slot.requestId) {
                    effects = stopEconomicTrial(session, 'spawn_identity_changed', clock);
                } else if (event.type === 'intake') {
                    slot.name = context.name;
                    slot.body = copy(context.body);
                    slot.bodyCost = context.bodyCost;
                    slot.callState = 'not_started';
                    slot.intakeTick = clock.tick;
                    delete slot.ledgerStage;
                    delete slot.ledgerApplication;
                    delete slot.nativeResult;
                } else if (event.type === 'call_started' && slot.admissionStage === 'binding') {
                    effects = stopEconomicTrial(session, 'spawn_admission_incomplete', clock);
                } else if (event.type === 'call_started' && slot.name === context.name && slot.callState === 'not_started') {
                    slot.calls++;
                    slot.callState = 'call_started';
                    slot.callTick = clock.tick;
                } else if (event.type === 'not_called' && slot.callState === 'not_started') slot.callState = 'not_called';
                else if (event.type === 'result' && slot.name === context.name && slot.callState === 'call_started') {
                    slot.callState = 'result_known';
                    slot.result = event.result;
                    if (event.result === 0) {
                        const receipt = economicSpawnReceipt(session, context.role, facts, clock);
                        if (receipt) {
                            slot.acceptedAt = receipt.tick; slot.cost = receipt.cost;
                            slot.receiptBinding = { identity: copy(session.identity), requestId: slot.requestId, name: slot.name, tick: receipt.tick };
                        }
                        else { slot.unknownUpperBound = slot.bodyCost; effects = stopEconomicTrial(session, 'spawn_receipt_unknown', clock); }
                    } else if (slot.calls >= 2) effects = stopEconomicTrial(session, 'spawn_retry_exhausted', clock);
                }
            }
            if (event.kind === 'scope_observed' && !session.outcome) {
                session.scopeCheckedAt = facts.scopeFresh ? clock.tick : undefined;
                if (facts.containerReady) {
                    session.containerId ??= facts.containerId;
                    session.evidence.openingContainerEnergy ??= facts.containerEnergy;
                    session.evidence.newProductionConfirmed ??= null;
                }
                if (facts.remoteVisible) {
                    session.visionAcquired = true;
                    if (!facts.remoteSafe || !facts.sourceValid || facts.routeValid === false) {
                        effects = stopEconomicTrial(session, 'remote_unsafe', clock);
                    } else {
                        session.status = ['recon', 'observing'].includes(session.status) ? 'observing' : session.status;
                        const scout = (facts.actors || []).find(actor => actor.role === 'scout' &&
                            actor.name === session.slots.scout.name && session.slots.scout.acceptedAt !== undefined &&
                            !actor.spawning && actor.pos.roomName === session.targetRoom);
                        if (scout && session.lastSafeTick !== clock.tick) {
                            if (session.lastSafeTick !== clock.tick - 1) session.safeStartedAtTick = clock.tick;
                            session.safeStreak = session.lastSafeTick === clock.tick - 1 ? Math.min(100, session.safeStreak + 1) : 1;
                            session.lastSafeTick = clock.tick;
                        }
                        if (!scout && session.safeStreak < 100) session.safeStreak = 0;
                        if (session.safeStreak >= 100 && facts.routeValid === true) session.status = facts.containerReady ? 'hauling' : 'preparing';
                    }
                }
            }
        }
    }
    if (session.outcome && event.kind === 'spawn_event' && event.type === 'not_called' &&
        economicIdentityMatches(session.identity, event.context) &&
        session.slots[event.context.role]?.callState === 'not_started') {
        session.slots[event.context.role].callState = 'not_called';
    }
    if (event.kind === 'resolution_applied') {
        const item = session.outbox.find(value => value.key === economicResolutionKey(event.resolution));
        if (item && item.stage === 'applied' && !item.evidenceApplied) {
            const result = applyEconomicResolution(session, item.resolution, item.application, clock);
            session.evidence = result.evidence;
            item.evidenceApplied = true;
            if (result.firstDelivery) {
                session.firstDelivery = result.firstDelivery;
                effects = stopEconomicTrial(session, 'first_delivery', clock, 'completed');
            } else if (result.reason) effects = stopEconomicTrial(session, result.reason, clock);
        }
    }
    if (event.kind === 'infrastructure_applied') {
        const attempt = session.infrastructureAttempt;
        if (attempt?.stage === 'applied' && !attempt.evidenceApplied) {
            attempt.evidenceApplied = true;
            if (attempt.application?.applied && Number.isSafeInteger(attempt.application.cost)) {
                if (attempt.application.known) session.evidence.confirmedInfrastructureCost += attempt.application.cost;
                else {
                    session.evidence.infrastructureUnknownUpperBound = (session.evidence.infrastructureUnknownUpperBound || 0) + attempt.application.cost;
                    session.evidence.unknownEvents++;
                    effects = stopEconomicTrial(session, 'infrastructure_cost_unknown', clock);
                }
            } else effects = stopEconomicTrial(session, 'infrastructure_application_unknown', clock);
        }
    }
    session.evidence = reduceEconomicTrialEvidence(session, event, facts, clock);
    return { state, effects, permit: economicTrialPermission(state, { remoteId: session.identity.remoteId }, clock) };
}

export function summarizeEconomicTrial(state, clock) {
    if (state === undefined) return null;
    if (!validEconomicTrialState(state)) return { capturedAt: clock.tick, status: 'state_invalid' };
    const compact = session => {
        if (!session) return null;
        const evidence = session.evidence;
        const knownNetEnergy = evidence.returnedEnergy - evidence.confirmedSpawnCost - evidence.confirmedInfrastructureCost;
        const unresolved = evidence.unknownEnergyUpperBound > 0 || evidence.logisticsUnknownEnergyUpperBound > 0 ||
            session.outbox.some(item => item.stage !== 'applied');
        return { ...copy(session.identity), managed: session.managed, status: session.status,
            startedAtTick: session.startedAtTick, expiresAtTick: session.expiresAtTick, expiresAtMs: session.expiresAtMs,
            safeStreak: session.safeStreak, outcome: session.outcome ? copy(session.outcome) : null,
            firstDelivery: session.firstDelivery ? copy(session.firstDelivery) : null,
            closeAppliedAtTick: session.closeAppliedAtTick, closureVerifiedAtTick: session.closureVerifiedAtTick,
            tailExpiresAtTick: session.tailExpiresAtTick, tailStatus: session.tailStatus || 'unverified',
            slots: copy(session.slots), outboxCount: session.outbox.length,
            unsettledOutbox: session.outbox.filter(item => item.stage !== 'applied').length,
            settlement: { confirmedSpawnCost: evidence.confirmedSpawnCost, confirmedInfrastructureCost: evidence.confirmedInfrastructureCost,
                unknownEnergyUpperBound: evidence.unknownEnergyUpperBound, unknownEvents: evidence.unknownEvents,
                logisticsUnknownEnergyUpperBound: evidence.logisticsUnknownEnergyUpperBound || 0,
                returnedEnergy: evidence.returnedEnergy, tailReturnedEnergy: evidence.tailReturnedEnergy || 0,
                openingContainerEnergy: evidence.openingContainerEnergy ?? null,
                newProductionConfirmed: evidence.newProductionConfirmed ?? null,
                knownNetEnergy, netEnergy: unresolved ? null : knownNetEnergy }, events: copy(session.events) };
    };
    return { capturedAt: clock.tick, status: state.current?.status || 'rejected',
        current: compact(state.current), previous: compact(state.previous),
        lastRejection: state.lastRejection || null };
}
