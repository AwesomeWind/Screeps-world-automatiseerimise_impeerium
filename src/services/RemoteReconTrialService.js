import BaseService from '../core/BaseService.js';
import EventBus from '../core/EventBus.js';
import { clearTaskState } from '../core/TaskMetadata.js';
import { cancelSpawnGrant } from './RemoteMiningLedger.js';
import { advanceReconTrial, reconTrialPermission, summarizeReconTrial } from './RemoteReconTrialModel.js';
import { collectReconTrialFacts } from './RemoteReconTrialFacts.js';
import { recordStoppedTrialDanger, readTrialDangerEvidence } from './RemoteDangerEvidence.js';
import { reduceReconTrialSettlement } from './RemoteReconTrialSettlement.js';

let runtime = null;

export function getReconTrialPermit(query, clock) {
    const state = Memory.empire.remoteMining?.reconTrials;
    const settings = Memory.empire.control.policy.remoteMining.reconTrial;
    const now = clock || runtime?.clock() || { tick: Game.time, nowMs: Date.now(), codeVersion: global.EmpireServicesVersion };
    const permit = reconTrialPermission(state, query, now);
    if (state?.current?.managed === false && settings?.request?.action === 'release' && state.lastSequence >= settings.request.sequence) return permit;
    if (!permit.managed && settings?.enabled === true &&
        (!state?.current || settings.request?.remoteId === query.remoteId)) {
        return { managed: true, evaluatedAt: now.tick, allowSpawn: false, allowOutbound: false, allowReturn: false,
            reason: 'trial_not_admitted' };
    }
    return permit;
}

export function observeReconTrialScope(scope, clock) {
    const permit = getReconTrialPermit({ remoteId: scope.operation.remoteId, epoch: scope.operation.epoch }, clock);
    if (!permit.managed) return permit;
    if (!runtime) return { ...permit, allowSpawn: false, allowOutbound: false };
    return runtime.advance({ kind: 'scope_observed' }, scope, clock).permit;
}

export function bindReconTrialSpawnRequest(scope, request, clock) {
    const query = { remoteId: scope.operation.remoteId, epoch: scope.operation.epoch, action: 'spawn' };
    const gate = getReconTrialPermit(query, clock);
    if (!gate.managed) return { ...request, memoryTags: {}, grantTags: {} };
    if (!gate.allowSpawn || !runtime) return null;
    const current = Memory.empire.remoteMining.reconTrials.current;
    if (!current.spawn.requestId) runtime.advance({ kind: 'spawn_bound', ...request }, scope, clock);
    const bound = Memory.empire.remoteMining.reconTrials.current;
    return { requestId: bound.spawn.requestId, deadline: bound.spawn.deadline,
        memoryTags: { reconTrialId: bound.identity.trialId, reconTrialSequence: bound.identity.sequence },
        grantTags: { trialId: bound.identity.trialId, trialSequence: bound.identity.sequence } };
}

export function isReconTrialSpawnContinuation(operation) {
    const state = Memory.empire.remoteMining?.reconTrials;
    const current = state?.current;
    const clock = runtime?.clock();
    if (!current || !clock || reconTrialPermission(state, {}, clock).reason === 'state_invalid') return false;
    const spawn = current.spawn;
    return current.managed && current.status === 'waiting_spawn' && current.lastTick === clock.tick &&
        current.identity.remoteId === operation.remoteId && current.identity.epoch === operation.epoch &&
        current.identity.codeVersion === clock.codeVersion && clock.nowMs >= current.lastNowMs &&
        clock.nowMs < current.expiresAtMs && clock.tick < current.expiresAtTick &&
        spawn.acceptedAt === undefined && typeof spawn.requestId === 'string' && spawn.deadline >= clock.tick &&
        (spawn.callState === 'not_called' || spawn.callState === 'result_known' && spawn.result !== 0) &&
        Object.values(operation.requests || {}).some(request => request.requestId === spawn.requestId && request.deadline === spawn.deadline);
}

export function recordReconTrialSpawn(context, event, clock) {
    const state = Memory.empire.remoteMining?.reconTrials;
    const current = state?.current;
    const canChooseRetryName = event.type === 'intake' && current?.spawn?.acceptedAt === undefined &&
        (current?.spawn?.callState === 'not_called' || current?.spawn?.callState === 'result_known' && current.spawn.result !== 0);
    if (!context || !current?.managed || context.trialId !== current.identity.trialId ||
        context.sequence !== current.identity.sequence || context.remoteId !== current.identity.remoteId ||
        context.epoch !== current.identity.epoch || context.requestId !== current.spawn.requestId || context.baseRoom !== current.baseRoom ||
        context.grantId !== undefined && context.grantId !== context.requestId ||
        current.spawn.name && context.name !== current.spawn.name && !canChooseRetryName ||
        !Array.isArray(context.body) || context.body.length !== 1 || context.body[0] !== MOVE || !runtime) {
        return { applied: false, allowed: false, reason: 'trial_identity_conflict' };
    }
    const now = clock || runtime.clock();
    if (['intake', 'call_started'].includes(event.type)) {
        const gate = getReconTrialPermit({ ...context, action: 'spawn' }, now);
        if (!gate.allowSpawn) return { applied: false, allowed: false, reason: gate.reason };
    }
    const budget = Memory.empire.remoteMining.budgets?.[context.baseRoom];
    const grant = budget?.grants?.[context.grantId || context.requestId];
    const ownGrant = grant && grant.requestId === context.requestId && grant.remoteId === context.remoteId && grant.epoch === context.epoch &&
        grant.trialId === context.trialId && grant.trialSequence === context.sequence;
    if (event.type === 'not_called') {
        if (current.spawn.callState !== 'not_started' || !ownGrant || grant.callState !== 'not_started') {
            return { applied: false, allowed: false, reason: 'execution_not_proven_unstarted' };
        }
        grant.executing = false;
        cancelSpawnGrant(budget, context.requestId);
    }
    if (event.type === 'result' && current.spawn.callState !== 'call_started') {
        return { applied: false, allowed: false, reason: 'missing_call_claim' };
    }
    const kind = { intake: 'spawn_intake', call_started: 'spawn_call_started', not_called: 'spawn_not_called', result: 'spawn_result' }[event.type];
    if (!kind) return { applied: false, allowed: false, reason: 'invalid_spawn_stage' };
    const result = runtime.advance({ kind, name: context.name, spawnName: context.spawnName, result: event.result },
        global.RemoteMining?.[context.remoteId], now);
    if (result.permit.reason === 'state_invalid') return { applied: false, allowed: false, reason: 'state_invalid' };
    if (['intake', 'call_started'].includes(event.type)) {
        const after = result.state?.current;
        const expectedStage = event.type === 'intake' ? 'not_started' : 'call_started';
        if (!after || after.outcome || after.spawn.callState !== expectedStage || after.spawn.name !== context.name) {
            return { applied: false, allowed: false, reason: after?.outcome?.stopReason || 'trial_revoked' };
        }
        if (ownGrant) grant.callState = expectedStage;
    }
    return { applied: true, allowed: true, reason: null };
}

export default class RemoteReconTrialService extends BaseService {
    constructor(name, { now = Date.now, dangerRecorder = recordStoppedTrialDanger,
        dangerReader = readTrialDangerEvidence, settlementReducer = reduceReconTrialSettlement } = {}) {
        super(name);
        this.now = now;
        this.dangerRecorder = dangerRecorder;
        this.dangerReader = dangerReader;
        this.settlementReducer = settlementReducer;
    }

    clock() {
        return { tick: Game.time, nowMs: this.now(), codeVersion: global.EmpireServicesVersion };
    }

    init() {
        runtime = this;
        global.RemoteReconTrial = { evaluatedAt: Game.time, permit: null, summary: null };
    }

    advance(event, scope = null, clock = this.clock()) {
        const input = Memory.empire.remoteMining?.reconTrials;
        const validation = reconTrialPermission(input, {}, clock);
        if (validation.reason === 'state_invalid') {
            global.RemoteReconTrial = { evaluatedAt: clock.tick, permit: validation, summary: summarizeReconTrial(input, clock) };
            return { state: input, permit: validation, effects: [] };
        }
        if (input === undefined && Memory.empire.control.policy.remoteMining.reconTrial?.enabled !== true) {
            const permit = reconTrialPermission(undefined, {}, clock);
            global.RemoteReconTrial = { evaluatedAt: clock.tick, permit, summary: null };
            return { state: undefined, permit, effects: [] };
        }
        const facts = collectReconTrialFacts(scope, clock);
        const result = advanceReconTrial(input, event, facts, clock, this.settlementReducer);
        if (result.state !== undefined && result.state !== input) {
            if (!Memory.empire.remoteMining) Memory.empire.remoteMining = { operations: {}, budgets: {} };
            Memory.empire.remoteMining.reconTrials = result.state;
        }
        for (const effect of result.effects) this.applyEffect(effect, facts, clock);
        const failure = global.RemoteReconTrial?.dangerEvidenceFailure;
        global.RemoteReconTrial = { evaluatedAt: clock.tick, permit: result.permit,
            summary: summarizeReconTrial(result.state, clock),
            ...(failure?.evaluatedAt === clock.tick ? { dangerEvidenceFailure: failure } : {}) };
        const before = input?.current;
        const after = result.state?.current;
        if (!before?.outcome && after?.outcome?.decidedAtTick === clock.tick &&
            ['danger', 'home_danger'].includes(after.outcome.stopReason)) {
            // Control state, close effects and deny permits must already be
            // published. Optional diagnostics must never interrupt this path.
            try {
                const captured = this.dangerRecorder({ before, after, clock }, { readClock: () => this.clock() });
                if (captured?.attempted && !captured.persisted) global.RemoteReconTrial.dangerEvidenceFailure = {
                    evaluatedAt: clock.tick, reason: 'record_not_persisted'
                };
            } catch {
                global.RemoteReconTrial.dangerEvidenceFailure = { evaluatedAt: clock.tick, reason: 'record_failed' };
            }
        }
        if (global.RemoteReconTrial.summary) {
            try {
                global.RemoteReconTrial.summary.dangerEvidence = this.dangerReader({ state: result.state, clock });
            } catch {
                global.RemoteReconTrial.summary.dangerEvidence = {
                    current: { effectiveStatus: 'read_failed', historical: true }, previous: null
                };
            }
        }
        return result;
    }

    analyze() {
        this.advance({ kind: 'begin_tick' });
    }

    run() {
        const result = this.advance({ kind: 'begin_tick' });
        if (result.permit.reason === 'state_invalid') return;
        const current = Memory.empire.remoteMining?.reconTrials?.current;
        if (current?.managed && current.status !== 'stopping' && !['completed', 'aborted'].includes(current.status)) {
            const scope = global.RemoteMining?.[current.identity.remoteId];
            if (scope?.operation.evaluatedAt !== Game.time) {
                this.advance({ kind: 'begin_tick' }, null);
                this.closeManagedScope(current, 'scope_stale');
            }
        }
    }

    cleanup() {
        this.advance({ kind: 'end_tick' }, global.RemoteMining?.[Memory.empire.remoteMining?.reconTrials?.current?.identity?.remoteId]);
    }

    closeManagedScope(session, reason) {
        const clock = this.clock();
        const scope = global.RemoteMining?.[session.identity.remoteId];
        const facts = { ...collectReconTrialFacts(scope, clock), fatalReason: reason };
        const input = Memory.empire.remoteMining.reconTrials;
        const result = advanceReconTrial(input, { kind: 'begin_tick' }, facts, clock, this.settlementReducer);
        Memory.empire.remoteMining.reconTrials = result.state;
        for (const effect of result.effects) this.applyEffect(effect, facts, clock);
    }

    applyEffect(effect, facts, clock) {
        const empire = Memory.empire;
        const current = empire.remoteMining?.reconTrials?.current;
        if (!current || current.identity.trialId !== effect.trialId || current.identity.sequence !== effect.sequence) return;
        const entry = Object.entries(empire.remoteRooms || {}).find(([target, cfg]) => `${cfg?.baseRoom}:${target}` === effect.remoteId);
        if (effect.type === 'close_scope' && entry) {
            if (entry[1].enabled !== false || entry[1].hold !== true ||
                !facts.otherEnabledRooms?.length && empire.control.policy.remoteMining.enabled !== false) {
                current.closeAppliedAtTick = clock.tick;
            }
            entry[1].enabled = false;
            entry[1].hold = true;
            if (!facts.otherEnabledRooms?.length) empire.control.policy.remoteMining.enabled = false;
            else current.moduleShutdownConflict = true;
            const operation = empire.remoteMining.operations?.[effect.remoteId];
            if (operation) {
                operation.config.enabled = false;
                operation.config.hold = true;
                operation.allowRecon = false;
                operation.allowEconomicDeparture = false;
                operation.status = 'disabled';
            }
            const scope = global.RemoteMining?.[effect.remoteId];
            if (scope) Object.assign(scope.state, { allowRecon: false, allowEconomicDeparture: false, status: 'disabled' });
        }
        const owned = memory => memory?.remoteId === effect.remoteId && memory.epoch === effect.epoch &&
            memory.homeRoom === current.baseRoom && memory.reconTrialId === effect.trialId && memory.reconTrialSequence === effect.sequence;
        if (effect.type === 'cancel_unstarted') {
            for (const room of Object.keys(global.SpawnDemands || {})) {
                global.SpawnDemands[room] = global.SpawnDemands[room].filter(demand => !owned(demand.memory));
            }
            EventBus.topics.REQ_SPAWN = (EventBus.topics.REQ_SPAWN || []).filter(event => !owned(event.data?.memory));
            const budget = empire.remoteMining.budgets?.[current.baseRoom];
            const grant = budget?.grants?.[effect.requestId];
            if (grant?.requestId === effect.requestId && grant.remoteId === effect.remoteId && grant.epoch === effect.epoch &&
                grant.trialId === effect.trialId && grant.trialSequence === effect.sequence) cancelSpawnGrant(budget, effect.requestId);
        }
        if (effect.type === 'clear_outbound') {
            for (const actor of Object.values(Game.creeps)) {
                if (!owned(actor.memory)) continue;
                const task = actor.memory.task;
                if (task?.type === 'MOVE_TO' && task.pos?.roomName !== entry?.[1].baseRoom) {
                    clearTaskState(actor, 'recon_trial_stopped', { tick: clock.tick });
                }
            }
        }
    }
}
