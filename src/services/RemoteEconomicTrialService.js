import BaseService from '../core/BaseService.js';
import EventBus from '../core/EventBus.js';
import { clearTaskState } from '../core/TaskMetadata.js';
import { cancelSpawnGrant, reserveSpawnGrant, recordRemoteResolution, recordInfrastructureResult, recordSpawnResult } from './RemoteMiningLedger.js';
import { remoteQuotaKey } from './RemoteMiningState.js';
import { advanceEconomicTrial, economicTrialPermission, summarizeEconomicTrial, economicIdentityMatches, validEconomicTrialState } from './RemoteEconomicTrialModel.js';
import { ECONOMIC_ROLE_LIMITS, economicResolutionKey, economicResolutionIdentity } from './RemoteEconomicTrialEvidence.js';
import { collectEconomicTrialFacts } from './RemoteEconomicTrialFacts.js';

let runtime = null;
const CANDIDATE_FIELDS = ['schemaVersion', 'identity', 'role', 'quotaKey', 'offeredAtTick', 'baseRoom', 'targetRoom', 'sourceId', 'maxEnergy'];
const candidateDenied = reason => ({allowed: false, reason});

function economicSpawnGrantMatches(grant, context, slot, scope) {
    const cap = Memory.empire.control.policy.remoteMining.bodyEnergyLimits[context.role];
    return !!grant && !!slot && !!scope && grant.requestId === context.requestId &&
        grant.economicTrialId === context.trialId && grant.economicTrialSequence === context.sequence &&
        grant.remoteId === context.remoteId && grant.epoch === context.epoch && grant.role === context.role &&
        grant.quotaKey === remoteQuotaKey(scope.config, context.role) && grant.deadline === slot.deadline &&
        Number.isSafeInteger(grant.maxEnergy) && grant.maxEnergy > 0 && grant.maxEnergy <= cap && context.bodyCost <= grant.maxEnergy;
}

export function buildEconomicTrialSpawnCandidate(scope, role, clock = runtime?.clock()) {
    const state = Memory.empire.remoteMining?.economicTrials;
    if (!runtime || !clock || clock.tick !== Game.time || !validEconomicTrialState(state)) return null;
    const current = state.current, slot = current?.slots[role];
    if (!current?.managed || !slot || slot.requestId || slot.calls || slot.admissionStage !== undefined ||
        !scope || global.RemoteMining?.[current.identity.remoteId] !== scope ||
        scope.operation !== Memory.empire.remoteMining.operations[current.identity.remoteId] || scope.operation.evaluatedAt !== clock.tick) return null;
    const facts = collectEconomicTrialFacts(scope, clock);
    const gate = getEconomicTrialPermit({...current.identity, role, action: 'spawn'}, clock);
    if (!gate.allowed || facts.fatalReason || !facts.controlSafe || !facts.isolated || !facts.homeHealthy ||
        !facts.budgetSafe || !facts.scopeFresh || facts.receiverFree < 20000 ||
        (role === 'scout' ? !(scope.state.allowRecon || scope.state.allowEconomicDeparture) :
            !scope.state.allowEconomicDeparture || !facts.remoteSafe || !facts.sourceValid || !facts.routeValid) ||
        role === 'remoteHauler' && (!facts.containerReady || current.slots.remoteMiner.acceptedAt === undefined)) return null;
    return {schemaVersion: 1, identity: {...current.identity}, role, quotaKey: remoteQuotaKey(scope.config, role),
        offeredAtTick: clock.tick, baseRoom: current.baseRoom, targetRoom: current.targetRoom, sourceId: current.sourceId,
        maxEnergy: Memory.empire.control.policy.remoteMining.bodyEnergyLimits[role]};
}

export function inspectEconomicTrialSpawnCandidate(candidate, data, clock = runtime?.clock()) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) ||
        Object.keys(candidate).length !== CANDIDATE_FIELDS.length || CANDIDATE_FIELDS.some(key => !Object.hasOwn(candidate, key)) ||
        !candidate.identity || Object.keys(candidate.identity).length !== 5) return candidateDenied('candidate_invalid');
    const scope = global.RemoteMining?.[candidate.identity.remoteId];
    const expected = buildEconomicTrialSpawnCandidate(scope, candidate.role, clock);
    if (!expected || !economicIdentityMatches(expected.identity, candidate.identity) ||
        CANDIDATE_FIELDS.some(key => key !== 'identity' && expected[key] !== candidate[key])) return candidateDenied('candidate_stale_or_conflicting');
    const memory = data?.memory, body = data?.body;
    const parts = {scout: [MOVE], remoteMiner: [WORK, CARRY, MOVE], remoteHauler: [CARRY, MOVE]}[candidate.role];
    if (!memory || data.role !== candidate.role || data.roomName !== candidate.baseRoom || memory.role !== candidate.role ||
        memory.homeRoom !== candidate.baseRoom || memory.targetRoom !== candidate.targetRoom || memory.sourceId !== candidate.sourceId ||
        memory.remoteId !== candidate.identity.remoteId || memory.epoch !== candidate.identity.epoch || memory.quotaKey !== candidate.quotaKey ||
        memory.economicTrialId !== undefined && memory.economicTrialId !== candidate.identity.trialId ||
        memory.economicTrialSequence !== undefined && memory.economicTrialSequence !== candidate.identity.sequence ||
        data.requestId !== undefined || data.grantId !== undefined || data.deadline !== undefined ||
        !Array.isArray(body) || !body.length || body.length > 50 || !body.every(part => Number.isFinite(BODYPART_COST[part])) ||
        !parts?.every(part => body.includes(part)) || body.reduce((sum, part) => sum + BODYPART_COST[part], 0) > candidate.maxEnergy ||
        candidate.role === 'scout' && (body.length !== 1 || body[0] !== MOVE)) return candidateDenied('candidate_body_or_target_invalid');
    return {allowed: true, reason: null};
}

export function abortEconomicTrialSpawnAdmission(context, reason, clock = runtime?.clock()) {
    const empire = Memory.empire, current = empire.remoteMining?.economicTrials?.current;
    if (!runtime || !clock || !current?.managed || !economicIdentityMatches(context, current.identity) ||
        !current.slots[context.role] || current.slots[context.role].requestId &&
        current.slots[context.role].requestId !== context.requestId) return;
    // Withdraw before attempting detailed protocol/evidence writes.
    empire.control.policy.remoteMining.enabled = false;
    const raw = empire.remoteRooms[current.targetRoom], scope = global.RemoteMining?.[current.identity.remoteId];
    if (raw) {raw.enabled = false; raw.hold = true;}
    const operation = empire.remoteMining.operations?.[current.identity.remoteId];
    if (operation) Object.assign(operation, {allowRecon: false, allowEconomicDeparture: false});
    if (scope) Object.assign(scope.state, {allowRecon: false, allowEconomicDeparture: false});
    try {runtime.stop(reason);} catch {runtime.lastError = 'admission_stop_evidence_failed';}
}

export function beginEconomicTrialSpawnAdmission(candidate, allocation, clock = runtime?.clock()) {
    const validation = inspectEconomicTrialSpawnCandidate(candidate, allocation?.data, clock);
    if (!validation.allowed) return validation;
    const spawn = Game.spawns[allocation.spawnName], scope = global.RemoteMining[candidate.identity.remoteId];
    if (!economicIdentityMatches(allocation, candidate.identity) || allocation.role !== candidate.role ||
        allocation.baseRoom !== candidate.baseRoom || !spawn || spawn.spawning || spawn.room.name !== candidate.baseRoom ||
        spawn.isActive && !spawn.isActive() || typeof allocation.name !== 'string' || !allocation.name.length || allocation.name.length > 100 ||
        allocation.data.name !== undefined && allocation.data.name !== allocation.name ||
        JSON.stringify(allocation.body) !== JSON.stringify(allocation.data.body)) return candidateDenied('allocation_invalid');
    let context = {...allocation}; delete context.data;
    try {
        const operation = scope.operation, current = Memory.empire.remoteMining.economicTrials.current;
        const policy = Memory.empire.control.policy.remoteMining;
        const requestId = `remote:${candidate.identity.remoteId}:${candidate.identity.epoch}:${operation.requestSequence + 1}`;
        context = {...context, requestId, grantId: requestId, bodyCost: allocation.body.reduce((sum, part) => sum + BODYPART_COST[part], 0),
            deadline: Math.min(clock.tick + 5, current.expiresAtTick - 1)};
        operation.requestSequence++;
        runtime.advance({kind: 'spawn_admission_begin', role: candidate.role, context}, scope, clock);
        const bound = Memory.empire.remoteMining.economicTrials.current;
        if (bound.outcome || bound.slots[candidate.role].requestId !== requestId) throw new Error('Admission binding refused');
        const request = {requestId, deadline: context.deadline};
        operation.requests[candidate.quotaKey] = request;
        const grant = reserveSpawnGrant(Memory.empire.remoteMining.budgets[candidate.baseRoom], {...request,
            role: candidate.role, quotaKey: candidate.quotaKey, remoteId: candidate.identity.remoteId, epoch: candidate.identity.epoch,
            maxEnergy: candidate.maxEnergy, economicTrialId: candidate.identity.trialId, economicTrialSequence: candidate.identity.sequence}, clock.tick, policy);
        if (!grant.granted) throw new Error('Admission budget refused');
        if (!recordEconomicTrialSpawn(context, {type: 'intake'}, clock).allowed) throw new Error('Admission intake refused');
        const data = {...allocation.data, ...request, grantId: requestId, memory: {...allocation.data.memory,
            economicTrialId: candidate.identity.trialId, economicTrialSequence: candidate.identity.sequence}};
        delete data.economicTrialCandidate;
        return {allowed: true, reason: null, data, context};
    } catch {
        abortEconomicTrialSpawnAdmission(context, 'spawn_admission_failed', clock);
        return candidateDenied('spawn_admission_failed');
    }
}

export function completeEconomicTrialSpawnAdmission(context, clock = runtime?.clock()) {
    const current = Memory.empire.remoteMining?.economicTrials?.current;
    if (!runtime || !clock || !current || !economicIdentityMatches(context, current.identity)) return candidateDenied('admission_identity_invalid');
    const slot = current.slots[context.role], grant = Memory.empire.remoteMining.budgets?.[current.baseRoom]?.grants?.[context.requestId];
    if (!slot || slot.requestId !== context.requestId || slot.admissionStage !== 'binding' || slot.admissionTick !== clock.tick ||
        !economicSpawnGrantMatches(grant, context, slot, global.RemoteMining?.[context.remoteId]) ||
        !grant.executing || grant.executingAt !== clock.tick || grant.callState !== 'not_started' || slot.callState !== 'not_started') {
        abortEconomicTrialSpawnAdmission(context, 'spawn_admission_incomplete', clock);
        return candidateDenied('spawn_admission_incomplete');
    }
    try {
        const result = runtime.advance({kind: 'spawn_admission_complete', role: context.role, context},
            global.RemoteMining[current.identity.remoteId], clock);
        if (!result.state.current.outcome && result.state.current.slots[context.role].admissionStage === 'admitted') return {allowed: true, reason: null};
    } catch { /* Withdrawal does not depend on the failed detail write. */ }
    abortEconomicTrialSpawnAdmission(context, 'spawn_admission_incomplete', clock);
    return candidateDenied('spawn_admission_incomplete');
}
function recoveryScoutMoveAllowed(creep, task, session, scope, facts) {
    const entrance = scope.facts.entrance;
    return creep.memory.role === 'scout' && !creep.memory.remoteRetiring &&
        creep.pos.roomName === session.targetRoom && !scope.operation.pendingConfig &&
        scope.operation.status === 'recovering' && scope.state.status === 'recovering' &&
        scope.state.reasons.length === 1 && scope.state.reasons[0] === 'safe_streak' &&
        !facts.fatalReason && facts.controlSafe && facts.isolated && facts.budgetSafe &&
        facts.remoteVisible && facts.remoteSafe && facts.sourceValid && facts.routeValid === true &&
        entrance && task.pos?.roomName === entrance.roomName && task.pos.x === entrance.x &&
        task.pos.y === entrance.y && task.range === 0;
}

function settingsValid(settings) {
    return settings === undefined || settings !== null && typeof settings === 'object' && !Array.isArray(settings) &&
        typeof settings.enabled === 'boolean' && (settings.request === null ||
            settings.request !== null && typeof settings.request === 'object' && !Array.isArray(settings.request));
}

export function getEconomicTrialPermit(query = {}, clock) {
    const state = Memory.empire.remoteMining?.economicTrials;
    const settings = Memory.empire.control.policy.remoteMining.economicTrial;
    const now = clock || runtime?.clock() || { tick: Game.time, nowMs: Date.now(), codeVersion: global.EmpireServicesVersion };
    if (!settingsValid(settings)) return { managed: true, evaluatedAt: now.tick, allowed: false, reason: 'settings_invalid' };
    const result = economicTrialPermission(state, query, now);
    const released = state?.current?.managed === false && settings?.request?.action === 'release' &&
        settings.request.targetTrialId === state.current.identity.trialId && state.lastSequence >= settings.request.sequence;
    if (!result.managed && settings?.enabled === true && !released &&
        (!settings.request?.remoteId || !query.remoteId || settings.request.remoteId === query.remoteId)) {
        return { managed: true, evaluatedAt: now.tick, allowed: false, reason: 'trial_not_admitted' };
    }
    return result;
}

export function observeEconomicTrialScope(scope, clock) {
    const gate = getEconomicTrialPermit({ remoteId: scope.operation.remoteId }, clock);
    if (!gate.managed) return gate;
    return runtime?.advance({ kind: 'scope_observed' }, scope, clock).permit || { ...gate, allowed: false };
}

export function bindEconomicTrialSpawnRequest(scope, role, request, clock) {
    const query = { remoteId: scope.operation.remoteId, epoch: scope.operation.epoch, role, action: 'spawn' };
    const gate = getEconomicTrialPermit(query, clock);
    if (!gate.managed) return { ...request, memoryTags: {}, grantTags: {} };
    if (!gate.allowed || !runtime || !canBindEconomicTrialRole(scope.operation.remoteId, role)) return null;
    runtime.advance({ kind: 'spawn_bound', role, ...request }, scope, clock);
    const session = Memory.empire.remoteMining.economicTrials.current;
    const slot = session.slots[role];
    return { requestId: slot.requestId, deadline: slot.deadline,
        memoryTags: { economicTrialId: session.identity.trialId, economicTrialSequence: session.identity.sequence },
        grantTags: { economicTrialId: session.identity.trialId, economicTrialSequence: session.identity.sequence } };
}

export function canBindEconomicTrialRole(remoteId, role) {
    const session = Memory.empire.remoteMining?.economicTrials?.current;
    const slot = session?.slots?.[role];
    if (!slot || session.identity.remoteId !== remoteId) return false;
    if (slot.requestId) return true;
    if (role === 'remoteHauler' && session.slots.remoteMiner.acceptedAt === undefined) return false;
    return Object.values(Game.spawns).some(spawn => spawn.room.name === session.baseRoom && !spawn.spawning && (!spawn.isActive || spawn.isActive()));
}

export function isEconomicTrialSpawnContinuation(operation) {
    const state = Memory.empire.remoteMining?.economicTrials;
    if (state === undefined || !validEconomicTrialState(state)) return false;
    const session = Memory.empire.remoteMining?.economicTrials?.current;
    const slot = session?.slots?.scout;
    return !!session?.managed && !session.outcome && session.identity.remoteId === operation.remoteId &&
        slot?.requestId !== undefined && slot.acceptedAt === undefined && slot.deadline >= Game.time && slot.calls < 2;
}

export function canReconcileEconomicSpawn(grant) {
    if (!grant.economicTrialId) return true;
    const state = Memory.empire.remoteMining?.economicTrials;
    if (!state || !validEconomicTrialState(state)) return false;
    const session = state.current;
    const slot = session?.slots?.[grant.role];
    return !!slot && session.identity.trialId === grant.economicTrialId && session.identity.sequence === grant.economicTrialSequence &&
        session.identity.remoteId === grant.remoteId && session.identity.epoch === grant.epoch && slot.requestId === grant.requestId &&
        slot.ledgerStage === 'applied' && slot.ledgerApplication?.applied === true;
}

export function settleEconomicTrialSpawn(context, result, budget, operation) {
    const session = Memory.empire.remoteMining?.economicTrials?.current;
    const slot = session?.slots?.[context.role];
    if (!runtime || !slot || !economicIdentityMatches(session.identity, context) ||
        slot.requestId !== context.requestId || slot.name !== context.name || slot.callState !== 'call_started') {
        runtime?.stop('spawn_ledger_identity_unknown');
        throw new Error('economic spawn settlement identity is unknown');
    }
    slot.ledgerStage = 'applying';
    slot.nativeResult = result;
    if (result === OK) slot.engineAcceptedAt = Game.time;
    try {
        if (!Number.isSafeInteger(result) || result > 0) throw new Error('economic spawn engine result is unknown');
        const application = recordSpawnResult(budget, operation.ledger, {
            requestId: context.requestId, name: context.name, result, body: context.body, acceptedAt: Game.time
        }, Game.time);
        slot.ledgerApplication = { ...application };
        slot.ledgerStage = 'applied';
        return application;
    } catch (error) {
        slot.unknownUpperBound = slot.bodyCost;
        if (!slot.unknownReported) { session.evidence.unknownEvents++; slot.unknownReported = true; }
        runtime.stop('spawn_ledger_application_unknown');
        throw error;
    }
}

export function recordEconomicTrialSpawn(context, event, clock) {
    const session = Memory.empire.remoteMining?.economicTrials?.current;
    const slot = session?.slots?.[context.role];
    const deny = reason => ({ managed: true, allowed: false, reason, evaluatedAt: Game.time });
    if (!runtime || !slot || !economicIdentityMatches(session.identity, context) || slot.requestId !== context.requestId ||
        context.grantId !== context.requestId || context.baseRoom !== session.baseRoom || !Array.isArray(context.body) ||
        !context.body.length || !context.body.every(part => Number.isFinite(BODYPART_COST[part]))) return deny('spawn_identity_conflict');
    const cost = context.body.reduce((sum, part) => sum + BODYPART_COST[part], 0);
    context = { ...context, bodyCost: cost };
    const required = { scout: [MOVE], remoteMiner: [WORK, CARRY, MOVE], remoteHauler: [CARRY, MOVE] }[context.role];
    if (!required?.every(part => context.body.includes(part)) || cost > ECONOMIC_ROLE_LIMITS[context.role] ||
        context.role === 'scout' && (context.body.length !== 1 || context.body[0] !== MOVE)) return deny('body_invalid');
    const scope = global.RemoteMining?.[context.remoteId];
    if (['intake', 'call_started'].includes(event.type)) {
        runtime.advance({ kind: 'evaluate' }, scope, clock);
        const gate = getEconomicTrialPermit({ ...context, action: 'spawn', spawnCheckpoint: event.type === 'intake' ? 'intake' : 'run' }, clock);
        if (!gate.allowed) return gate;
        const grant = Memory.empire.remoteMining.budgets?.[context.baseRoom]?.grants?.[context.requestId];
        if (!economicSpawnGrantMatches(grant, context, slot, scope)) {
            runtime.stop('spawn_grant_identity_changed');
            return deny('spawn_grant_identity_changed');
        }
        const committed = Object.entries(session.slots).reduce((sum, [role, value]) =>
            sum + (role === context.role ? cost : value.cost ?? value.bodyCost ?? 0), 0);
        if (committed > 1650) return deny('trial_spawn_budget');
    }
    if (event.type === 'not_called') {
        const grant = Memory.empire.remoteMining.budgets?.[context.baseRoom]?.grants?.[context.requestId];
        if (slot.callState !== 'not_started' || grant?.callState !== 'not_started') return deny('execution_not_proven_unstarted');
        grant.executing = false;
        cancelSpawnGrant(Memory.empire.remoteMining.budgets[context.baseRoom], context.requestId);
    }
    if (event.type === 'result' && (slot.callState !== 'call_started' || slot.name !== context.name)) return deny('missing_call_claim');
    const result = runtime.advance({ kind: 'spawn_event', ...event, context }, scope, clock);
    const current = result.state.current;
    const updated = current.slots[context.role];
    const grant = Memory.empire.remoteMining.budgets?.[context.baseRoom]?.grants?.[context.requestId];
    if (grant && ['intake', 'call_started'].includes(event.type)) grant.callState = updated.callState;
    return { managed: true, allowed: ['intake', 'call_started'].includes(event.type) ? !current.outcome &&
        updated.callState === (event.type === 'intake' ? 'not_started' : 'call_started') : true,
        evaluatedAt: Game.time, reason: current.outcome?.stopReason || null };
}

export function checkpointEconomicTrialResolution(resolution) {
    if (!resolution.context?.remoteId && !Game.creeps[resolution.creepName]?.memory.economicTrialId) return true;
    const managed = getEconomicTrialPermit({ remoteId: resolution.context?.remoteId }).managed || !!resolution.context?.trialId;
    if (!managed) return true;
    return runtime?.prepareResolution(resolution) === true;
}

export function applyEconomicTrialResolution(resolution, operation) {
    const managed = getEconomicTrialPermit({ remoteId: resolution.context?.remoteId }).managed || !!resolution.context?.trialId;
    if (!managed) return recordRemoteResolution(operation.ledger, resolution, operation.epoch, operation.config.homeDeliveryTargetIds);
    return runtime?.applyResolution(resolution, operation);
}

export function recordEconomicTrialResolution(resolution, application, clock) {
    return runtime?.advance({ kind: 'resolution_applied', resolution, application },
        global.RemoteMining?.[resolution.context?.remoteId], clock).permit;
}

export function applyEconomicTrialInfrastructure(budget, operation, observation, currentFacts) {
    const managed = getEconomicTrialPermit({ remoteId: operation.remoteId }).managed || !!observation.context?.trialId;
    if (!managed) return recordInfrastructureResult(budget, operation.ledger, observation, currentFacts, Game.time);
    return runtime?.applyInfrastructure(budget, operation, observation, currentFacts) || { applied: false };
}

export default class RemoteEconomicTrialService extends BaseService {
    constructor(name, options = {}) {
        super(name);
        this.now = options.now || (() => Date.now());
        this.options = options;
    }
    clock() { return { tick: Game.time, nowMs: this.now(), codeVersion: global.EmpireServicesVersion }; }
    init() {
        runtime = this;
        global.RemoteEconomicTrial = { evaluatedAt: Game.time, service: this };
    }
    analyze() { this.recoverUnstarted(); this.recoverOutbox(); this.recoverInfrastructure(); this.advance({ kind: 'evaluate' }); }
    cleanup() { this.advance({ kind: 'end_tick' }); }
    advance(event, scope, clock = this.clock()) {
        const raw = Memory.empire.remoteMining?.economicTrials;
        const settings = Memory.empire.control.policy.remoteMining.economicTrial;
        if (raw === undefined && !settingsValid(settings)) {
            this.applyEffect({ type: 'emergency_close' });
            const permit = { managed: true, evaluatedAt: clock.tick, allowed: false, reason: 'settings_invalid' };
            global.RemoteEconomicTrial = { evaluatedAt: clock.tick, service: this, summary: { capturedAt: clock.tick, status: 'settings_invalid' } };
            return { state: undefined, effects: [{ type: 'emergency_close' }], permit };
        }
        if (raw === undefined && Memory.empire.control.policy.remoteMining.economicTrial?.enabled !== true) {
            global.RemoteEconomicTrial = { evaluatedAt: clock.tick, service: this, summary: null };
            return { state: undefined, effects: [], permit: { managed: false, allowed: true, evaluatedAt: clock.tick } };
        }
        let facts;
        if (raw !== undefined && !validEconomicTrialState(raw)) facts = {};
        else {
            try { facts = collectEconomicTrialFacts(scope, clock); }
            catch { facts = { guardEnabled: true, fatalReason: 'facts_failed' }; }
        }
        if (event.failure) facts.fatalReason = event.failure;
        const result = advanceEconomicTrial(raw, event, facts, clock);
        if (result.state !== undefined) Memory.empire.remoteMining.economicTrials = result.state;
        for (const effect of result.effects) this.applyEffect(effect);
        global.RemoteEconomicTrial = { evaluatedAt: clock.tick, service: this,
            summary: summarizeEconomicTrial(result.state, clock) };
        return result;
    }
    stop(reason) {
        return this.advance({ kind: 'evaluate', failure: reason },
            global.RemoteMining?.[Memory.empire.remoteMining?.economicTrials?.current?.identity?.remoteId]);
    }
    recoverUnstarted() {
        const state = Memory.empire.remoteMining?.economicTrials;
        if (!state || !validEconomicTrialState(state) || !state.current?.managed) return;
        const current = state.current;
        const budget = Memory.empire.remoteMining.budgets?.[current.baseRoom];
        if (!budget) return;
        for (const [role, slot] of Object.entries(current.slots)) {
            const grant = budget.grants?.[slot.requestId];
            if (slot.callState !== 'not_started' || !Number.isSafeInteger(slot.intakeTick) || slot.intakeTick >= Game.time ||
                !grant || grant.callState !== 'not_started' || grant.requestId !== slot.requestId || grant.role !== role ||
                grant.remoteId !== current.identity.remoteId || grant.epoch !== current.identity.epoch ||
                grant.economicTrialId !== current.identity.trialId || grant.economicTrialSequence !== current.identity.sequence ||
                grant.deadline !== slot.deadline || grant.executingAt !== slot.intakeTick) continue;
            grant.executing = false;
            cancelSpawnGrant(budget, slot.requestId);
            slot.callState = 'not_called';
            slot.notCalledAtTick = Game.time;
        }
    }
    prepareResolution(resolution) {
        const current = Memory.empire.remoteMining?.economicTrials?.current;
        if (!current || !economicResolutionIdentity(current, resolution)) { this.stop('resolution_identity_invalid'); return false; }
        const key = economicResolutionKey(resolution);
        if (current.outbox.some(item => item.key === key)) return true;
        if (current.outbox.length >= 16) { this.stop('outbox_capacity'); return false; }
        try {
            this.options.checkpointWriter?.(resolution);
            current.outbox.push({ key, stage: 'prepared', preparedAtTick: Game.time,
                resolution: JSON.parse(JSON.stringify(resolution)) });
            return true;
        } catch {
            this.stop('checkpoint_failed');
            const latest = Memory.empire.remoteMining.economicTrials.current;
            if (!latest.failedHandoff) {
                latest.failedHandoff = { key, identity: { ...latest.identity }, targetId: resolution.targetId,
                    reservationId: resolution.reservationId, tripId: resolution.context.tripId,
                    leg: resolution.context.leg, atTick: Game.time, originalStatus: resolution.status };
                latest.evidence.unknownEvents++;
                latest.evidence.logisticsUnknownEnergyUpperBound = (latest.evidence.logisticsUnknownEnergyUpperBound || 0) +
                    (Number.isSafeInteger(resolution.reservedAmount) ? resolution.reservedAmount : 0);
            }
            return false;
        }
    }
    applyResolution(resolution, operation) {
        const current = Memory.empire.remoteMining?.economicTrials?.current;
        const item = current?.outbox?.find(value => value.key === economicResolutionKey(resolution));
        if (!item || !economicResolutionIdentity(current, resolution)) { this.stop('resolution_identity_invalid'); return { applied: false }; }
        if (item.stage === 'applied') return { applied: false, reason: 'already_applied' };
        if (item.stage !== 'prepared') { this.stop('ledger_application_unknown'); return { applied: false }; }
        item.stage = 'applying';
        item.applicationStartedAtTick = Game.time;
        let result;
        try {
            result = recordRemoteResolution(operation.ledger, item.resolution, operation.epoch, operation.config.homeDeliveryTargetIds);
            this.options.afterLedger?.(item.resolution, result);
        } catch (error) { this.recoverOutbox(); throw error; }
        item.application = { ...result };
        item.stage = 'applied';
        item.appliedAtTick = Game.time;
        recordEconomicTrialResolution(item.resolution, item.application);
        try { this.options.detailRecorder?.(item.resolution, result); } catch { /* Control is already applied. */ }
        return result;
    }
    recoverOutbox() {
        const current = Memory.empire.remoteMining?.economicTrials?.current;
        if (!Array.isArray(current?.outbox)) return;
        if (!validEconomicTrialState(Memory.empire.remoteMining.economicTrials)) return;
        for (const key of current.outbox.map(item => item.key)) {
            const latest = Memory.empire.remoteMining.economicTrials.current;
            const item = latest.outbox.find(value => value.key === key);
            if (item.stage === 'applying') {
                if (!item.unknownReported) {
                    latest.evidence.unknownEvents++;
                    latest.evidence.logisticsUnknownEnergyUpperBound = (latest.evidence.logisticsUnknownEnergyUpperBound || 0) +
                        (item.resolution.reservedAmount || 0);
                    item.unknownReported = true;
                }
                this.stop('ledger_application_unknown');
            } else if (item.stage === 'prepared') {
                const operation = Memory.empire.remoteMining.operations?.[current.identity.remoteId];
                if (operation && operation.epoch === current.identity.epoch) this.applyResolution(item.resolution, operation);
                else this.stop('identity_changed');
            } else if (item.stage === 'applied' && !item.evidenceApplied) recordEconomicTrialResolution(item.resolution, item.application);
        }
    }
    applyInfrastructure(budget, operation, observation, currentFacts) {
        const current = Memory.empire.remoteMining?.economicTrials?.current;
        const context = observation.context;
        if (!current || !economicIdentityMatches(context, current.identity) ||
            context.creepName !== current.slots.remoteMiner.name || observation.tick < current.startedAtTick ||
            current.slots.remoteMiner.acceptedAt === undefined) {
            this.stop('infrastructure_identity_invalid'); return { applied: false };
        }
        const previous = current.infrastructureAttempt;
        if (previous?.attemptId === context.attemptId) return { applied: false, reason: 'already_observed' };
        if (previous && previous.stage !== 'applied') { this.stop('infrastructure_application_unknown'); return { applied: false }; }
        const pending = budget.infrastructure?.pending?.[context.attemptId];
        if (!pending) return { applied: false };
        current.infrastructureAttempt = { attemptId: context.attemptId, stage: 'applying', upperBound: pending.upperBound,
            context: { ...context }, tick: observation.tick };
        let result;
        try {
            result = recordInfrastructureResult(budget, operation.ledger, observation, currentFacts, Game.time);
            this.options.afterInfrastructureLedger?.(observation, result);
        } catch (error) { this.recoverInfrastructure(); throw error; }
        current.infrastructureAttempt.stage = 'applied';
        current.infrastructureAttempt.application = { ...result };
        this.advance({ kind: 'infrastructure_applied' }, global.RemoteMining?.[operation.remoteId]);
        return result;
    }
    recoverInfrastructure() {
        const state = Memory.empire.remoteMining?.economicTrials;
        if (!state || !validEconomicTrialState(state)) return;
        const current = state.current;
        const attempt = current?.infrastructureAttempt;
        if (!attempt) return;
        if (attempt.stage === 'applying') {
            if (!attempt.unknownReported) {
                current.evidence.infrastructureUnknownUpperBound = (current.evidence.infrastructureUnknownUpperBound || 0) + attempt.upperBound;
                current.evidence.unknownEvents++;
                attempt.unknownReported = true;
            }
            this.stop('infrastructure_application_unknown');
        } else if (!attempt.evidenceApplied) this.advance({ kind: 'infrastructure_applied' }, global.RemoteMining?.[current.identity.remoteId]);
    }
    beforeContainerSite(scope) {
        this.advance({ kind: 'evaluate' }, scope);
        return getEconomicTrialPermit({ remoteId: scope.operation.remoteId, epoch: scope.operation.epoch,
            role: 'remoteMiner', action: 'container_site' });
    }
    actorQuery(creep, action) {
        return { remoteId: creep.memory.remoteId, epoch: creep.memory.epoch,
            trialId: creep.memory.economicTrialId, sequence: creep.memory.economicTrialSequence,
            role: creep.memory.role, name: creep.name, action };
    }
    taskPermission(creep, task, requireReservation = true) {
        const session = Memory.empire.remoteMining?.economicTrials?.current;
        const denied = reason => ({ managed: true, allowed: false, evaluatedAt: Game.time, reason });
        const target = task.targetId && Game.getObjectById(task.targetId);
        const action = task.type === 'MOVE_TO' ? (task.pos?.roomName === session?.baseRoom ? 'return' : 'outbound') :
            task.type === 'TRANSFER' ? (target?.pos?.roomName === session?.baseRoom ? 'home_delivery' : 'source_deposit') :
            ({ HARVEST: 'harvest', BUILD: 'build', REPAIR: 'repair', WITHDRAW: 'pickup' })[task.type];
        const gate = getEconomicTrialPermit(this.actorQuery(creep, action));
        if (!gate.managed && !creep.memory.economicTrialId) return gate;
        if (!session || !gate.managed || !gate.allowed || !action) return denied(gate.reason || 'invalid_economic_action');
        const scope = global.RemoteMining?.[session.identity.remoteId];
        const facts = collectEconomicTrialFacts(scope, this.clock());
        if (!facts.homeHealthy || !facts.scopeFresh || facts.reconLocked) return denied('scope_or_home_unsafe');
        if (action === 'return') return gate;
        if (action === 'outbound') {
            const allowed = scope.state.allowRecon || scope.state.allowEconomicDeparture ||
                recoveryScoutMoveAllowed(creep, task, session, scope, facts);
            return allowed ? gate : denied('original_departure_blocked');
        }
        if (['pickup', 'home_delivery', 'source_deposit'].includes(action) && task.resourceType && task.resourceType !== RESOURCE_ENERGY) return denied('wrong_resource');
        if (action === 'home_delivery' && (creep.memory.role !== 'remoteHauler' || target?.id !== session.receiverId ||
            target?.my !== true || target.store.getFreeCapacity(RESOURCE_ENERGY) <= 0)) return denied('receiver_invalid');
        if (action === 'pickup' && (creep.memory.role !== 'remoteHauler' || target?.id !== facts.containerId)) return denied('pickup_invalid');
        if (action === 'harvest' && (creep.memory.role !== 'remoteMiner' || target?.id !== session.sourceId)) return denied('source_invalid');
        if (['build', 'repair', 'source_deposit'].includes(action) && (creep.memory.role !== 'remoteMiner' ||
            target?.structureType !== STRUCTURE_CONTAINER || target.pos?.roomName !== session.targetRoom ||
            target.pos.x !== session.containerPos.x || target.pos.y !== session.containerPos.y)) return denied('container_invalid');
        if (action === 'source_deposit') {
            const reservations = global.ResourceMarket?.[session.baseRoom]?.reservations;
            const loading = Object.values(reservations?.supply || {}).some(record => Object.values(record.owners || {}).some(owner =>
                owner.targetId === target.id && economicIdentityMatches(owner.context, session.identity)));
            if (loading) return denied('container_pickup_pending');
        }
        if (['build', 'repair'].includes(action)) {
            const reserved = facts.infrastructurePending.reduce((sum, attempt) => sum + attempt.upperBound, 0);
            const committed = session.evidence.confirmedInfrastructureCost + (session.evidence.infrastructureUnknownUpperBound || 0) + reserved;
            if (committed > 6000) { this.stop('trial_infrastructure_budget'); return denied('trial_infrastructure_budget'); }
        }
        if (requireReservation && ['pickup', 'home_delivery'].includes(action)) {
            const owner = creep.memory.taskMeta?.logisticsReservation;
            if (!owner || !economicIdentityMatches(owner.context, session.identity) || owner.targetId !== target.id ||
                owner.creepName !== creep.name || owner.context.tripId !== creep.memory.remoteTrip?.tripId) return denied('reservation_unbound');
        }
        return gate;
    }
    beforeAction(creep, task) {
        const query = this.actorQuery(creep);
        const gate = getEconomicTrialPermit(query);
        if (!gate.managed && !creep.memory.economicTrialId) return gate;
        this.recoverOutbox();
        this.recoverInfrastructure();
        this.advance({ kind: 'evaluate' }, global.RemoteMining?.[query.remoteId]);
        return this.taskPermission(creep, task);
    }
    applyEffect(effect) {
        const empire = Memory.empire;
        const state = empire.remoteMining?.economicTrials;
        const session = state?.current;
        if (effect.type === 'emergency_close') {
            empire.control.policy.remoteMining.enabled = false;
            return;
        }
        const raw = empire.remoteRooms?.[session.targetRoom];
        const operation = empire.remoteMining.operations?.[effect.remoteId];
        const scope = global.RemoteMining?.[effect.remoteId];
        if (effect.type === 'close_scope') {
            if (raw) { raw.enabled = false; raw.hold = true; }
            empire.control.policy.remoteMining.enabled = false;
            if (operation) Object.assign(operation, { allowRecon: false, allowEconomicDeparture: false });
            if (scope) Object.assign(scope.state, { allowRecon: false, allowEconomicDeparture: false });
        }
        const owned = memory => memory?.remoteId === effect.remoteId && memory.epoch === effect.epoch &&
            memory.economicTrialId === effect.trialId && memory.economicTrialSequence === effect.sequence;
        if (effect.type === 'cancel_unstarted') {
            for (const room of Object.keys(global.SpawnDemands || {})) {
                global.SpawnDemands[room] = global.SpawnDemands[room].filter(demand => !owned(demand.memory));
            }
            EventBus.topics.REQ_SPAWN = (EventBus.topics.REQ_SPAWN || []).filter(event => !owned(event.data?.memory));
            const budget = empire.remoteMining.budgets?.[session.baseRoom];
            for (const slot of Object.values(session.slots)) if (budget && slot.requestId) cancelSpawnGrant(budget, slot.requestId);
        }
        if (effect.type === 'clear_economic_tasks') {
            for (const actor of Object.values(Game.creeps)) {
                if (!owned(actor.memory) || !actor.memory.task) continue;
                const task = actor.memory.task;
                const safeTail = task.type === 'MOVE_TO' && task.pos?.roomName === session.baseRoom ||
                    task.type === 'TRANSFER' && task.targetId === session.receiverId;
                if (!safeTail) clearTaskState(actor, 'economic_trial_stopped');
            }
        }
    }
}
