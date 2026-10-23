import BaseService from '../core/BaseService.js';
import { collectNativeEconomicOpsFacts, collectNativeSuccessorFacts } from './NativeEconomicTrialOpsFacts.js';
import {
    advanceNativeEconomicOps,
    nativeOpsEconomicIdentity,
    validNativeEconomicOpsState
} from './NativeEconomicTrialOpsModel.js';
import { validEconomicTrialState, economicIdentityMatches } from './RemoteEconomicTrialModel.js';
import {
    NATIVE_OPS_PROFILE,
    validateNativeOpsRequest,
    nativeOpsCopy as copy,
    nativeOpsEqual as equal
} from './NativeEconomicTrialOpsProfile.js';
import { summarizeNativeEconomicOps } from './NativeEconomicTrialOpsEvidence.js';
import { NATIVE_SUCCESSOR_PROFILE, validateNativeSuccessorRequest } from './NativeEconomicTrialOpsSuccessorProtocol.js';
import { successorParent } from './NativeEconomicTrialOpsSuccessorModel.js';

export default class NativeEconomicTrialOpsService extends BaseService {
    constructor(
        name,
        { now = () => Date.now(), profile = NATIVE_OPS_PROFILE, successorProfile = NATIVE_SUCCESSOR_PROFILE } = {}
    ) {
        super(name);
        this.now = now;
        this.profile = profile;
        this.successorProfile = successorProfile;
    }
    clock() {
        return { tick: Game.time, nowMs: this.now(), codeVersion: global.EmpireServicesVersion };
    }
    init() {
        global.RemoteTrialOps = {
            status: (id) => {
                try {
                    const summary = this.summarize();
                    if (!summary) return null;
                    if (summary.status === 'state_invalid') return summary;
                    if (id && summary.lastRejection?.id === id)
                        return { status: 'rejected', lastRejection: copy(summary.lastRejection) };
                    if (summary.status === 'rejected' && (!id || id === summary.lastRejection?.id)) return summary;
                    return copy(
                        [summary.current, summary.previous, ...(summary.history || [])].find(
                            (value) => value && (!id || value.id === id)
                        ) || null
                    );
                } catch {
                    return { status: 'summary_failed', economic: null };
                }
            }
        };
    }
    summarize() {
        return summarizeNativeEconomicOps(
            Memory.empire.remoteMining?.nativeEconomicOps,
            Memory.empire.remoteMining?.economicTrials,
            this.clock()
        );
    }
    analyze() {
        this.advance({ kind: 'evaluate' });
    }
    cleanup() {
        this.advance({ kind: 'end_tick' });
    }
    persist(state) {
        if (state?.schemaVersion === 2 && JSON.stringify(state).length > 65536)
            throw new Error('Native successor state capacity');
        if (state !== undefined) Memory.empire.remoteMining.nativeEconomicOps = state;
    }
    successorMode() {
        return (
            Memory.empire.remoteMining?.nativeEconomicOps?.schemaVersion === 2 ||
            Memory.empire.control.policy.remoteMining.nativeTrialOps?.request?.schemaVersion === 2
        );
    }
    collectFacts() {
        return this.successorMode()
            ? collectNativeSuccessorFacts(this.successorProfile, this.clock())
            : collectNativeEconomicOpsFacts(this.profile, this.clock());
    }
    activeProfile() {
        return this.successorMode() ? this.successorProfile : this.profile;
    }
    advance(event) {
        const raw = Memory.empire.remoteMining?.nativeEconomicOps;
        if (raw === undefined && Memory.empire.control.policy.remoteMining.nativeTrialOps?.enabled !== true) return;
        try {
            const facts = this.collectFacts();
            const result = advanceNativeEconomicOps(raw, event, facts, this.clock(), this.activeProfile());
            if (result.error) {
                this.lastError = result.error;
                if (validNativeEconomicOpsState(result.state)) {
                    this.persist(result.state);
                    if (result.state.lastRejection)
                        Memory.empire.control.policy.remoteMining.nativeTrialOps.enabled = false;
                }
                this.requestOwnedStop(result.error);
                return;
            }
            this.persist(result.state);
            // Recovery never replays a business intent. Independently withdraw a still-running
            // owned session even if its once-only hold intent is interrupted or unknown.
            if (result.state?.current?.stage === 'stopping')
                this.requestOwnedStop(result.state.current.outcome?.reason || 'ops_stopping');
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
        const facts = this.collectFacts();
        const next = advanceNativeEconomicOps(
            raw,
            { kind: 'effect_result', key: effect.key, result },
            facts,
            this.clock(),
            this.activeProfile()
        );
        this.persist(next.state);
        for (const followup of next.effects) {
            // Withdrawal does not depend on a successful subsequent journal/summary write.
            if (followup.type === 'hold_owned_session') this.requestOwnedStop(followup.reason);
        }
    }
    applyEffect(effect) {
        // A deadline restricts new work, never this already-authorized withdrawal.
        if (effect.type === 'hold_owned_session') return this.requestOwnedStop(effect.reason);
        if (Memory.empire.remoteMining.nativeEconomicOps?.schemaVersion === 2) return this.applySuccessorEffect(effect);
        const clock = this.clock(),
            facts = collectNativeEconomicOpsFacts(this.profile, clock);
        const state = Memory.empire.remoteMining.nativeEconomicOps,
            current = state.current;
        const before = effect.expectedBefore;
        if (
            !validNativeEconomicOpsState(state) ||
            current.intents[effect.key]?.status !== 'planned' ||
            !equal(current.archive?.request, this.profile.oldPreparation) ||
            !equal(current.archive?.current, this.profile.oldCurrent) ||
            !equal(current.archive?.originalWindow, this.profile.originalWindow) ||
            !equal(facts.settings, { enabled: true, request: current.request }) ||
            clock.codeVersion !== current.request.codeVersion ||
            clock.nowMs >= current.request.stopAtMs ||
            facts.operationEpoch !== current.request.oldIdentity.epoch ||
            clock.tick !== current.lastTick ||
            !facts.protectedSafe ||
            !facts.clockFresh ||
            !facts.configSafe ||
            !equal(facts.economicState?.current, before.current) ||
            facts.economicState?.lastSequence !== before.lastSequence ||
            !equal(facts.economicSettings, before.settings) ||
            facts.executionClosed !== before.executionClosed
        )
            return false;
        const policy = Memory.empire.control.policy.remoteMining;
        const config = Memory.empire.remoteRooms[this.profile.targetRoom];
        if (effect.type === 'archive_preparation')
            return facts.ready && equal(current.archive?.request, this.profile.oldPreparation);
        if (effect.type === 'replace_release_request') {
            if (!facts.ready || !equal(effect.request, current.releaseRequest) || current.archive.atTick >= clock.tick)
                return false;
            policy.economicTrial = { enabled: true, request: copy(effect.request) };
            return true;
        }
        if (
            !facts.executionClosed ||
            !facts.quiet ||
            !facts.reconReleased ||
            !facts.homeReady ||
            !facts.receiverSafe ||
            !facts.budgetSafe ||
            !equal(effect.request, current.startRequest)
        )
            return false;
        if (effect.type === 'prepare_start') {
            policy.economicTrial = { enabled: false, request: copy(effect.request) };
            return true;
        }
        if (effect.type === 'activate_start' && clock.tick === current.startRequest.activateAtTick) {
            policy.economicTrial.enabled = true;
            policy.enabled = true;
            config.enabled = true;
            config.hold = false;
            return true;
        }
        return false;
    }
    applySuccessorEffect(effect) {
        const clock = this.clock(),
            facts = this.collectFacts(),
            state = Memory.empire.remoteMining.nativeEconomicOps,
            c = state.current,
            before = effect.expectedBefore;
        if (
            !validNativeEconomicOpsState(state) ||
            c.intents[effect.key]?.status !== 'planned' ||
            !equal(facts.settings, { enabled: true, request: c.request }) ||
            clock.codeVersion !== c.request.codeVersion ||
            clock.nowMs >= c.request.stopAtMs ||
            clock.tick !== c.lastTick ||
            facts.operationEpoch !== c.request.parent.identity.epoch ||
            !facts.protectedSafe ||
            !facts.clockFresh ||
            !facts.configSafe ||
            !facts.accountingKnown ||
            !equal(facts.economicState?.current, before.current) ||
            !equal(facts.economicState?.previous, before.previous) ||
            facts.economicState?.lastSequence !== before.lastSequence ||
            !equal(facts.economicSettings, before.settings) ||
            facts.executionClosed !== before.executionClosed ||
            !facts.executionClosed ||
            !facts.quiet ||
            !facts.homeReady ||
            !facts.receiverSafe ||
            !facts.budgetSafe ||
            !facts.reconReleased
        )
            return false;
        const parent = successorParent(state),
            policy = Memory.empire.control.policy.remoteMining;
        if (effect.type === 'replace_release_request') {
            if (
                !equal(effect.request, c.releaseRequest) ||
                !equal(facts.economicState.current, parent) ||
                state.history.at(-1).atTick >= clock.tick
            )
                return false;
            policy.economicTrial = { enabled: true, request: copy(effect.request) };
            return true;
        }
        if (
            !equal(effect.request, c.startRequest) ||
            !equal(facts.economicState.current, { ...copy(parent), managed: false }) ||
            facts.economicState.lastSequence !== c.request.releaseSequence
        )
            return false;
        if (effect.type === 'prepare_start') {
            policy.economicTrial = { enabled: false, request: copy(effect.request) };
            return true;
        }
        if (effect.type === 'activate_start' && clock.tick === c.startRequest.activateAtTick) {
            policy.economicTrial.enabled = true;
            policy.enabled = true;
            const config = Memory.empire.remoteRooms[this.successorProfile.targetRoom];
            config.enabled = true;
            config.hold = false;
            return true;
        }
        return false;
    }
    requestOwnedStop(reason, candidate = Memory.empire.remoteMining?.nativeEconomicOps?.current) {
        if (!candidate) return false;
        const empire = Memory.empire,
            policy = empire.control.policy.remoteMining;
        const config = empire.remoteRooms?.[this.profile.targetRoom],
            economic = empire.remoteMining?.economicTrials;
        // Either persisted envelope can establish ownership if the other copy was damaged.
        // Validation uses its original admission clock only to prove the old grant of hold;
        // expiry may never revoke withdrawal authority.
        const validEnvelope = (request) => {
            const clock = {
                tick: request?.acceptNotBeforeTick,
                nowMs: request?.issuedAtMs,
                codeVersion: request?.codeVersion
            };
            return request?.schemaVersion === 2
                ? validateNativeSuccessorRequest(request, this.successorProfile, clock).valid
                : validateNativeOpsRequest(request, this.profile, clock).valid;
        };
        const start = candidate.startRequest;
        const expected = validEnvelope(candidate.request)
            ? nativeOpsEconomicIdentity(candidate.request, this.profile)
            : candidate.admittedIdentity ||
              (start
                  ? {
                        trialId: start.id,
                        sequence: start.sequence,
                        remoteId: start.remoteId,
                        epoch: start.epoch,
                        codeVersion: start.codeVersion
                    }
                  : null);
        if (!expected) return false;
        const envelopes = [candidate.request, policy.nativeTrialOps?.request].filter(
            (request) =>
                validEnvelope(request) &&
                economicIdentityMatches(nativeOpsEconomicIdentity(request, this.profile), expected)
        );
        const owned =
            validEconomicTrialState(economic) &&
            economic.current?.sourceId === this.profile.sourceId &&
            economic.current?.receiverId === this.profile.receiverId &&
            envelopes.some((request) =>
                economicIdentityMatches(economic.current.identity, nativeOpsEconomicIdentity(request, this.profile))
            );
        const state = empire.remoteMining?.nativeEconomicOps;
        const parent =
            !owned && candidate.request?.schemaVersion === 2 && state?.current === candidate
                ? successorParent(state)
                : this.profile.oldCurrent;
        const releaseSequence =
            candidate.request?.schemaVersion === 2
                ? candidate.request.releaseSequence
                : this.profile.oldLastSequence + 1;
        const ownPendingActivation =
            candidate.request?.schemaVersion === 2 &&
            state?.current === candidate &&
            ['planned', 'applied', 'unknown'].includes(candidate.intents?.activate_start?.status);
        const staged =
            !!start &&
            (equal(policy.economicTrial?.request, start) || ownPendingActivation) &&
            envelopes.some((request) =>
                economicIdentityMatches(
                    {
                        trialId: start.id,
                        sequence: start.sequence,
                        remoteId: start.remoteId,
                        epoch: start.epoch,
                        codeVersion: start.codeVersion
                    },
                    nativeOpsEconomicIdentity(request, this.profile)
                )
            ) &&
            equal(economic?.current, { ...copy(parent), managed: false }) &&
            economic.lastSequence === releaseSequence;
        if (!owned && !staged) return false;
        policy.enabled = false;
        if (config) {
            config.enabled = false;
            config.hold = true;
        }
        const operation = empire.remoteMining.operations?.[this.profile.remoteId];
        if (operation) {
            operation.allowRecon = false;
            operation.allowEconomicDeparture = false;
        }
        if (staged) policy.economicTrial.enabled = false;
        if (owned && !economic.current.outcome) {
            try {
                global.RemoteEconomicTrial?.service?.stop(reason);
            } catch {
                this.lastError = 'guard_stop_record_failed';
            }
        }
        return true;
    }
}
