import BaseService from '../core/BaseService.js';
import {collectNativeEconomicOpsFacts} from './NativeEconomicTrialOpsFacts.js';
import {advanceNativeEconomicOps, nativeOpsEconomicIdentity, validNativeEconomicOpsState} from './NativeEconomicTrialOpsModel.js';
import {validEconomicTrialState, economicIdentityMatches} from './RemoteEconomicTrialModel.js';
import {NATIVE_OPS_PROFILE, validateNativeOpsRequest, nativeOpsCopy as copy, nativeOpsEqual as equal} from './NativeEconomicTrialOpsProfile.js';
import {summarizeNativeEconomicOps} from './NativeEconomicTrialOpsEvidence.js';

export default class NativeEconomicTrialOpsService extends BaseService {
    constructor(name, {now = () => Date.now(), profile = NATIVE_OPS_PROFILE} = {}) {
        super(name); this.now = now; this.profile = profile;
    }
    clock() {return {tick: Game.time, nowMs: this.now(), codeVersion: global.EmpireServicesVersion};}
    init() {
        global.RemoteTrialOps = {status: id => {
            try {
                const summary = this.summarize();
                if (!summary) return null;
                if (summary.status === 'state_invalid') return summary;
                if (summary.status === 'rejected' && (!id || id === summary.lastRejection?.id)) return summary;
                return copy([summary.current, summary.previous].find(value => value && (!id || value.id === id)) || null);
            } catch {return {status: 'summary_failed', economic: null};}
        }};
    }
    summarize() {
        return summarizeNativeEconomicOps(Memory.empire.remoteMining?.nativeEconomicOps,
            Memory.empire.remoteMining?.economicTrials, this.clock());
    }
    analyze() {this.advance({kind: 'evaluate'});}
    cleanup() {this.advance({kind: 'end_tick'});}
    persist(state) {
        if (state !== undefined) Memory.empire.remoteMining.nativeEconomicOps = state;
    }
    advance(event) {
        const raw = Memory.empire.remoteMining?.nativeEconomicOps;
        if (raw === undefined && Memory.empire.control.policy.remoteMining.nativeTrialOps?.enabled !== true) return;
        try {
            const facts = collectNativeEconomicOpsFacts(this.profile, this.clock());
            const result = advanceNativeEconomicOps(raw, event, facts, this.clock(), this.profile);
            if (result.error) {
                this.lastError = result.error;
                if (validNativeEconomicOpsState(result.state)) {
                    this.persist(result.state);
                    if (result.state.lastRejection) Memory.empire.control.policy.remoteMining.nativeTrialOps.enabled = false;
                }
                this.requestOwnedStop(result.error);
                return;
            }
            this.persist(result.state);
            // Recovery never replays a business intent. Independently withdraw a still-running
            // owned session even if its once-only hold intent is interrupted or unknown.
            if (result.state?.current?.stage === 'stopping') this.requestOwnedStop(result.state.current.outcome?.reason || 'ops_stopping');
            for (const effect of result.effects) this.perform(effect);
            const current = Memory.empire.remoteMining.nativeEconomicOps?.current;
            const settings = Memory.empire.control.policy.remoteMining.nativeTrialOps;
            if (current?.stage === 'terminal' && equal(settings?.request, current.request)) settings.enabled = false;
        } catch {
            this.lastError = 'ops_service_failure';
            this.requestOwnedStop(this.lastError);
        }
    }
    perform(effect) {
        let result = 'unknown';
        try {
            result = this.applyEffect(effect) ? 'applied' : 'refused';
        } catch {
            this.requestOwnedStop('effect_failed');
        }
        const raw = Memory.empire.remoteMining.nativeEconomicOps;
        const facts = collectNativeEconomicOpsFacts(this.profile, this.clock());
        const next = advanceNativeEconomicOps(raw, {kind: 'effect_result', key: effect.key, result}, facts, this.clock(), this.profile);
        this.persist(next.state);
        for (const followup of next.effects) {
            // Withdrawal does not depend on a successful subsequent journal/summary write.
            if (followup.type === 'hold_owned_session') this.requestOwnedStop(followup.reason);
        }
    }
    applyEffect(effect) {
        // A deadline restricts new work, never this already-authorized withdrawal.
        if (effect.type === 'hold_owned_session') return this.requestOwnedStop(effect.reason);
        const clock = this.clock(), facts = collectNativeEconomicOpsFacts(this.profile, clock);
        const state = Memory.empire.remoteMining.nativeEconomicOps, current = state.current;
        const before = effect.expectedBefore;
        if (!validNativeEconomicOpsState(state) || current.intents[effect.key]?.status !== 'planned' ||
            !equal(current.archive?.request, this.profile.oldPreparation) || !equal(current.archive?.current, this.profile.oldCurrent) ||
            !equal(current.archive?.originalWindow, this.profile.originalWindow) ||
            !equal(facts.settings, {enabled: true, request: current.request}) ||
            clock.codeVersion !== current.request.codeVersion || clock.nowMs >= current.request.stopAtMs ||
            facts.operationEpoch !== current.request.oldIdentity.epoch ||
            clock.tick !== current.lastTick || !facts.protectedSafe || !facts.clockFresh || !facts.configSafe ||
            !equal(facts.economicState?.current, before.current) || facts.economicState?.lastSequence !== before.lastSequence ||
            !equal(facts.economicSettings, before.settings) || facts.executionClosed !== before.executionClosed) return false;
        const policy = Memory.empire.control.policy.remoteMining;
        const config = Memory.empire.remoteRooms[this.profile.targetRoom];
        if (effect.type === 'archive_preparation') return facts.ready && equal(current.archive?.request, this.profile.oldPreparation);
        if (effect.type === 'replace_release_request') {
            if (!facts.ready || !equal(effect.request, current.releaseRequest) || current.archive.atTick >= clock.tick) return false;
            policy.economicTrial = {enabled: true, request: copy(effect.request)};
            return true;
        }
        if (!facts.executionClosed || !facts.quiet || !facts.reconReleased || !facts.homeReady ||
            !facts.receiverSafe || !facts.budgetSafe || !equal(effect.request, current.startRequest)) return false;
        if (effect.type === 'prepare_start') {
            policy.economicTrial = {enabled: false, request: copy(effect.request)};
            return true;
        }
        if (effect.type === 'activate_start' && clock.tick === current.startRequest.activateAtTick) {
            policy.economicTrial.enabled = true;
            policy.enabled = true; config.enabled = true; config.hold = false;
            return true;
        }
        return false;
    }
    requestOwnedStop(reason, candidate = Memory.empire.remoteMining?.nativeEconomicOps?.current) {
        if (!candidate) return false;
        const empire = Memory.empire, policy = empire.control.policy.remoteMining;
        const config = empire.remoteRooms?.[this.profile.targetRoom], economic = empire.remoteMining?.economicTrials;
        // Either persisted envelope can establish ownership if the other copy was damaged.
        // Validation uses its original admission clock only to prove the old grant of hold;
        // expiry may never revoke withdrawal authority.
        const envelopes = [candidate.request, policy.nativeTrialOps?.request].filter(request =>
            validateNativeOpsRequest(request, this.profile, {tick: request?.acceptNotBeforeTick,
                nowMs: request?.issuedAtMs, codeVersion: request?.codeVersion}).valid);
        const owned = validEconomicTrialState(economic) && economic.current?.sourceId === this.profile.sourceId &&
            economic.current?.receiverId === this.profile.receiverId && envelopes.some(request =>
                economicIdentityMatches(economic.current.identity, nativeOpsEconomicIdentity(request, this.profile)));
        const start = candidate.startRequest;
        const staged = !!start && equal(policy.economicTrial?.request, start) &&
            envelopes.some(request => economicIdentityMatches({trialId: start.id, sequence: start.sequence,
                remoteId: start.remoteId, epoch: start.epoch, codeVersion: start.codeVersion},
            nativeOpsEconomicIdentity(request, this.profile))) &&
            equal(economic?.current, {...copy(this.profile.oldCurrent), managed: false}) &&
            economic.lastSequence === this.profile.oldLastSequence + 1;
        if (!owned && !staged) return false;
        policy.enabled = false;
        if (config) {config.enabled = false; config.hold = true;}
        const operation = empire.remoteMining.operations?.[this.profile.remoteId];
        if (operation) {operation.allowRecon = false; operation.allowEconomicDeparture = false;}
        if (staged) policy.economicTrial.enabled = false;
        if (owned && !economic.current.outcome) {
            try {global.RemoteEconomicTrial?.service?.stop(reason);} catch {this.lastError = 'guard_stop_record_failed';}
        }
        return true;
    }
}
