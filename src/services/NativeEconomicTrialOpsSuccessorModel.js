import { packNativeEvidence, NATIVE_ARCHIVE_LIMIT, NATIVE_STATE_LIMIT } from './NativeEconomicTrialOpsArchiveCodec.js';
import { validNativeEconomicOpsState as validLegacy } from './NativeEconomicTrialOpsLegacyModel.js';
import { validEconomicTrialState, economicIdentityMatches } from './RemoteEconomicTrialModel.js';
import {
    NATIVE_SUCCESSOR_PROFILE,
    validateNativeSuccessorRequest,
    createNativeParentArchive,
    nativeSnapshotForValidation,
    archivedEconomicStateForValidation,
    matchNativeSuccessorParent,
    nativeSuccessorParentMatches,
    nativeSuccessorPrevious,
    nativeUnadmittedReady,
    resolveArchivedEconomicState,
    archivedNativeEconomicParent,
    retainedNativeParent,
    nativeRetainedParentMatches,
    encodeNativePreReleaseAbort,
    nativePreReleaseAbortForValidation,
    isNativePreReleaseAbort,
    matchPreReleaseAbortParent,
    exactNativeFields
} from './NativeEconomicTrialOpsSuccessorProtocol.js';
import {
    nativeOpsCopy as copy,
    nativeOpsEqual as equal,
    nativeOpsRecord as record,
    nativeOpsInteger as integer
} from './NativeEconomicTrialOpsProfile.js';

export const successorIdentity = (q) => ({
    trialId: q.trialId,
    sequence: q.startSequence,
    remoteId: q.parent.identity.remoteId,
    epoch: q.parent.identity.epoch,
    codeVersion: q.codeVersion
});
const stages = new Set([
    'preflight',
    'release_writing',
    'release_confirming',
    'start_writing',
    'start_prepared',
    'start_activating',
    'start_confirming',
    'observing',
    'stopping',
    'terminal'
]);
const keys = new Set(['replace_release_request', 'prepare_start', 'activate_start', 'hold_owned_session']);
const savedRequestValid = (q) =>
    validateNativeSuccessorRequest(
        q,
        { id: NATIVE_SUCCESSOR_PROFILE.id, remoteId: q?.parent?.identity?.remoteId },
        { tick: q?.acceptNotBeforeTick, nowMs: q?.issuedAtMs, codeVersion: q?.codeVersion }
    ).valid;

function validPrepared(value, c, release) {
    const fields = [
        'schemaVersion',
        'action',
        'id',
        'sequence',
        'remoteId',
        'epoch',
        'codeVersion',
        'configFingerprint',
        'activateAtTick',
        'expiresAtTick',
        'issuedAtMs',
        'expiresAtMs',
        ...(release ? ['targetTrialId'] : []),
        ...(release && Object.hasOwn(value, 'nativeSuccessorId') ? ['nativeSuccessorId'] : [])
    ];
    const q = c.request;
    return (
        exactNativeFields(value, fields) &&
        value.schemaVersion === 1 &&
        value.action === (release ? 'release' : 'start') &&
        value.id === (release ? 'release-' + q.trialId : q.trialId) &&
        (!release || value.targetTrialId === q.parent.identity.trialId) &&
        (!Object.hasOwn(value, 'nativeSuccessorId') || value.nativeSuccessorId === q.id) &&
        value.sequence === (release ? q.releaseSequence : q.startSequence) &&
        value.remoteId === q.parent.identity.remoteId &&
        value.epoch === q.parent.identity.epoch &&
        value.codeVersion === q.codeVersion &&
        typeof value.configFingerprint === 'string' &&
        value.configFingerprint.length > 0 &&
        ['activateAtTick', 'expiresAtTick', 'issuedAtMs', 'expiresAtMs'].every((key) => integer(value[key])) &&
        value.activateAtTick > c.preflightAt &&
        value.expiresAtTick === value.activateAtTick + 1000 &&
        value.issuedAtMs >= q.issuedAtMs &&
        value.issuedAtMs < q.stopAtMs &&
        value.expiresAtMs === value.issuedAtMs + 5400000
    );
}

function validClockDiscontinuity(outcome) {
    if (!Object.hasOwn(outcome, 'clockDiscontinuity')) return true;
    const detail = outcome.clockDiscontinuity;
    return outcome.reason === 'clock_discontinuity' &&
        exactNativeFields(detail, ['previousTick', 'previousNowMs', 'tick', 'nowMs', 'phase',
            'releaseActivateAtTick', 'tickDiscontinuous', 'wallClockBackwards']) &&
        [detail.previousTick, detail.previousNowMs, detail.tick, detail.nowMs].every(integer) &&
        detail.tick === outcome.decidedAtTick && stages.has(detail.phase) &&
        (detail.releaseActivateAtTick === null || integer(detail.releaseActivateAtTick)) &&
        detail.tickDiscontinuous === (detail.tick !== detail.previousTick + 1) &&
        detail.wallClockBackwards === (detail.nowMs < detail.previousNowMs) &&
        (detail.tickDiscontinuous || detail.wallClockBackwards);
}

function validCurrent(c, retainedArchiveId) {
    return (
        record(c) &&
        savedRequestValid(c.request) &&
        stages.has(c.stage) &&
        integer(c.lastTick) &&
        integer(c.lastNowMs) &&
        integer(c.preflightAt) &&
        c.preflightAt <= c.lastTick &&
        c.archiveRef === (retainedArchiveId ?? c.request.unadmitted?.nativeId ?? c.request.parent.nativeId) &&
        Array.isArray(c.events) &&
        c.events.length <= 32 &&
        c.events.every((e) => record(e) && integer(e.tick) && typeof e.reason === 'string' && e.reason.length <= 160) &&
        record(c.intents) &&
        Object.entries(c.intents).every(
            ([key, intent]) =>
                keys.has(key) &&
                record(intent) &&
                ['planned', 'applied', 'unknown', 'refused'].includes(intent.status) &&
                integer(intent.tick) &&
                intent.tick >= c.preflightAt &&
                intent.tick <= c.lastTick
        ) &&
        (c.releaseRequest === null || validPrepared(c.releaseRequest, c, true)) &&
        (c.startRequest === null || validPrepared(c.startRequest, c, false)) &&
        (![
            'release_writing',
            'release_confirming',
            'start_writing',
            'start_prepared',
            'start_activating',
            'start_confirming',
            'observing'
        ].includes(c.stage) ||
            c.releaseRequest !== null) &&
        (!['start_writing', 'start_prepared', 'start_activating', 'start_confirming', 'observing'].includes(c.stage) ||
            c.startRequest !== null) &&
        (c.admittedIdentity === null || equal(c.admittedIdentity, successorIdentity(c.request))) &&
        (c.stage !== 'observing' || (c.intents.activate_start?.status === 'applied' && c.admittedIdentity !== null)) &&
        (c.controlClosureConfirmed !== true || (c.stage === 'terminal' && c.admittedIdentity !== null)) &&
        (c.outcome === null ||
            (record(c.outcome) &&
                typeof c.outcome.reason === 'string' &&
                c.outcome.reason.length <= 160 &&
                integer(c.outcome.decidedAtTick) &&
                c.outcome.decidedAtTick >= c.preflightAt &&
                c.outcome.decidedAtTick <= c.lastTick && validClockDiscontinuity(c.outcome))) &&
        JSON.stringify(c).length <= 16384
    );
}

function validSuccessorHeader(state, retainedArchiveId) {
    if (
        !record(state) ||
        state.schemaVersion !== 2 ||
        !integer(state.lastAcceptedStartSequence) ||
        !validCurrent(state.current, retainedArchiveId) ||
        state.lastAcceptedStartSequence !== state.current.request.startSequence ||
        !Array.isArray(state.rejections) ||
        state.rejections.length > 16 ||
        !state.rejections.every(
            r =>
                record(r) &&
                integer(r.tick) &&
                (r.id === null || (typeof r.id === 'string' && r.id.length <= 32)) &&
                (r.trialId === null || (typeof r.trialId === 'string' && r.trialId.length <= 32)) &&
                typeof r.reason === 'string'
        ) ||
        JSON.stringify(state).length > NATIVE_STATE_LIMIT
    )
        return false;
    return true;
}

function validSuccessorParentLink(state, parent, olderParent, retainedAbort) {
    if (!parent) return false;
    const {archive, native, economic} = parent;
    const {current} = state;
    const validBinding = retainedAbort
        ? validSuccessorHeader(retainedAbort) && validSuccessorParentLink(retainedAbort, parent, olderParent) &&
            matchPreReleaseAbortParent(current.request, retainedAbort, economic, archive.settings.economicTrial, parent, olderParent)
        : (!current.request.unadmitted || equal(archive.settings.nativeTrialOps, {enabled: true, request: current.request})) &&
            equal(nativeSuccessorPrevious(state), native.current) &&
            matchNativeSuccessorParent(current.request, native, economic, archive.settings.economicTrial,
                () => ({oldNative: olderParent?.native, oldEconomic: olderParent?.economic}));
    return (
        current.archiveRef === archive.id &&
        validBinding &&
        [current.releaseRequest, current.startRequest].every(
            q => q === null || q.configFingerprint === economic.current.configFingerprint
        )
    );
}

const checkedPackedParents = new WeakSet();

function validPackedSuccessor(state) {
    if (!state.current?.request?.retainedParent || !validSuccessorHeader(state) ||
        ['history', 'previous', 'previousRef', 'previousAbort'].some(key => Object.hasOwn(state, key)) ||
        JSON.stringify({...state, current: null}).length > NATIVE_ARCHIVE_LIMIT)
        return false;
    const proof = retainedNativeParent(state);
    if (!checkedPackedParents.has(proof)) {
        if (!exactNativeFields(proof, ['native', 'economic', 'nativeSettings', 'economicSettings', 'verifiedAt']) ||
            !record(proof.native) || Object.hasOwn(proof.native, 'packedParent') ||
            !validNativeSuccessorState(proof.native) || !validEconomicTrialState(proof.economic) ||
            !equal(proof.nativeSettings, {enabled: false, request: proof.native.current.request}) ||
            !exactNativeFields(proof.verifiedAt, ['tick', 'nowMs']) ||
            !integer(proof.verifiedAt.tick) || !integer(proof.verifiedAt.nowMs))
            return false;
        checkedPackedParents.add(proof);
    }
    if (proof.verifiedAt.tick !== state.current.preflightAt) return false;
    const q = state.current.request;
    return proof.verifiedAt.tick >= q.acceptNotBeforeTick && proof.verifiedAt.tick <= q.acceptNotAfterTick &&
        proof.verifiedAt.nowMs >= q.issuedAtMs && proof.verifiedAt.nowMs - q.issuedAtMs <= 30000 &&
        proof.verifiedAt.nowMs < q.stopAtMs &&
        nativeRetainedParentMatches(q, proof.native, proof.economic, proof.economicSettings) &&
        [state.current.releaseRequest, state.current.startRequest].every(
            request => request === null || request.configFingerprint === proof.economic.current.configFingerprint
        );
}

export function validNativeSuccessorState(state) {
    try {
        if (record(state) && Object.hasOwn(state, 'packedParent')) return validPackedSuccessor(state);
        const history = state?.history;
        if (!record(state) || state.schemaVersion !== 2 ||
            !Array.isArray(history) || !history.length || history.length > 4)
            return false;

        const hasRetainedAbort = Object.hasOwn(state, 'previousAbort');
        if (state.current?.request?.retainedParent || !validSuccessorHeader(state, hasRetainedAbort ? history.at(-1)?.id : undefined)) return false;
        if (hasRetainedAbort && JSON.stringify({...state, current: null}).length > 49152) return false;
        const retainedAbort = hasRetainedAbort ? nativePreReleaseAbortForValidation(state) : undefined;

        const ids = new Set();
        let parent, olderParent;
        for (const [index, archive] of history.entries()) {
            if (
                !record(archive) ||
                typeof archive.id !== 'string' ||
                ids.has(archive.id) ||
                !integer(archive.atTick) ||
                !record(archive.settings) ||
                !record(archive.originalWindow)
            )
                return false;

            const prefix = history.slice(0, index);
            const economic = archivedEconomicStateForValidation(archive, prefix, parent?.economic);
            const native = nativeSnapshotForValidation(archive.nativeSnapshot, prefix);
            if (
                !validEconomicTrialState(economic) ||
                !(native.schemaVersion === 2
                    ? !Object.hasOwn(native, 'previousAbort') && validSuccessorHeader(native) &&
                        validSuccessorParentLink(native, parent, olderParent)
                    : validLegacy(native)) ||
                native.current?.request.id !== archive.id ||
                !equal(archive.originalWindow, {
                    issuedAtMs: native.current.request.issuedAtMs,
                    stopAtMs: native.current.request.stopAtMs,
                    notAfterMs: native.current.request.notAfterMs
                })
            )
                return false;

            ids.add(archive.id);
            olderParent = parent;
            parent = {archive, native, economic};
        }
        return validSuccessorParentLink(state, parent, olderParent, retainedAbort);
    } catch {
        return false;
    }
}

function rejected(input, q, clock, reason) {
    const state = copy(input),
        id = typeof q?.id === 'string' && q.id.length <= 32 ? q.id : null;
    const trialId = typeof q?.trialId === 'string' && q.trialId.length <= 32 ? q.trialId : null;
    state.rejections ||= [];
    if (!state.rejections.some((entry) => entry.id === id) && state.rejections.length < 16)
        state.rejections.push({ id, trialId, reason, tick: clock.tick });
    state.lastRejection = { id, trialId, reason, atTick: clock.tick, atMs: clock.nowMs };
    return { state, effects: [], error: reason };
}

export function advanceNativeSuccessor(input, event, facts, clock, profile) {
    if (!facts.parentProof) return { state: input, effects: [], error: 'successor_parent_facts_missing' };
    if (!(input?.schemaVersion === 2 ? validNativeSuccessorState(input) : validLegacy(input)))
        return { state: input, effects: [], error: 'state_invalid' };
    const q = facts.settings?.request;
    if (input.schemaVersion === 2 && (input.current.stage !== 'terminal' || equal(input.current.request, q))) {
        return advanceCurrent(input, event, facts, clock, profile);
    }
    if (event.kind !== 'evaluate' || facts.settings?.enabled !== true || q?.schemaVersion !== 2)
        return { state: input, effects: [] };
    if (Object.hasOwn(input, 'packedParent')) return rejected(input, q, clock, 'history_capacity');
    const validation = validateNativeSuccessorRequest(q, { ...profile, id: NATIVE_SUCCESSOR_PROFILE.id }, clock);
    const history = input.schemaVersion === 2 ? input.history : [];
    // A compact previousRef is already represented by an earlier archive current.
    const used = [
        input.current,
        input.previousAbort ? nativeSuccessorPrevious(input) : input.previous,
        ...history.flatMap((a) => [a.nativeSnapshot.current, a.nativeSnapshot.previous])
    ].filter(Boolean);
    const replayed =
        used.some((c) => c.request.id === q.id || c.request.trialId === q.trialId) ||
        input.rejections?.some((r) => r.id === q.id || r.trialId === q.trialId) ||
        input.lastRejection?.id === q.id ||
        input.lastRejection?.trialId === q.trialId ||
        input.lastAcceptedStartSequence >= q.startSequence;
    const retainAbort = !!q.unadmitted && isNativePreReleaseAbort(input);
    const reason = !validation.valid
        ? validation.reason
        : replayed
          ? 'request_replayed'
          : input.current.stage !== 'terminal'
            ? 'parent_not_terminal'
            : !facts.parentProof.valid
              ? facts.parentProof.reason
              : (q.unadmitted || q.retainedParent) && (!nativeUnadmittedReady(facts) ||
                    !nativeSuccessorParentMatches(q, input, facts.economicState, facts.economicSettings))
                ? 'parent_invalid'
                : !equal(input, facts.nativeState)
                ? 'parent_changed'
                : history.length >= 4 && !retainAbort && !q.retainedParent
                  ? 'history_capacity'
                  : input.rejections?.length >= 16
                    ? 'rejection_capacity'
                    : null;
    if (reason) return rejected(input, q, clock, reason);
    const archive = q.retainedParent ? {id: input.current.request.id} :
        retainAbort ? history.at(-1) : createNativeParentArchive(input, facts.economicState, facts.archiveInputs, clock);
    const current = {
        request: copy(q),
        stage: 'preflight',
        lastTick: clock.tick,
        lastNowMs: clock.nowMs,
        preflightAt: clock.tick,
        archiveRef: archive.id,
        releaseRequest: null,
        startRequest: null,
        intents: {},
        events: [],
        admittedIdentity: null,
        outcome: null
    };
    const state = {
        schemaVersion: 2,
        lastAcceptedStartSequence: q.startSequence,
        current,
        ...(q.retainedParent ? {} : retainAbort ? { previousAbort: encodeNativePreReleaseAbort(input) }
            : q.unadmitted ? { previousRef: archive.id } : { previous: copy(input.current) }),
        ...(!q.retainedParent ? {history: retainAbort ? copy(history) : [...copy(history), archive]} : {}),
        rejections: copy(input.rejections || []),
        ...(input.lastRejection ? { lastRejection: copy(input.lastRejection) } : {})
    };
    if (q.retainedParent) {
        try {
            state.packedParent = packNativeEvidence({native: input, economic: facts.economicState,
                nativeSettings: {enabled: false, request: input.current.request}, economicSettings: facts.economicSettings,
                verifiedAt: {tick: clock.tick, nowMs: clock.nowMs}});
        } catch {
            return rejected(input, q, clock, 'history_capacity');
        }
    }
    if (JSON.stringify({ ...state, current: null }).length > NATIVE_ARCHIVE_LIMIT || !validNativeSuccessorState(state))
        return rejected(input, q, clock, 'history_capacity');
    return { state, effects: [] };
}

export function successorParent(state) {
    if (state?.packedParent) {
        try {return retainedNativeParent(state).economic.current;} catch {return undefined;}
    }
    if (!Array.isArray(state?.history)) return undefined;
    const index = state.history.findIndex((a) => a?.id === state.current?.archiveRef);
    try {
        return index < 0 ? undefined : resolveArchivedEconomicState(state.history[index], state.history.slice(0, index)).current;
    } catch {
        return undefined;
    }
}

function sameArchivedParent(current, archived, unadmitted, tick) {
    if (!unadmitted) return equal(current, archived);
    if (!current) return false;
    // The inert, expired release can advance the generic rejection tick while the parent remains unchanged.
    const { lastRejection, ...proof } = current;
    const { lastRejection: before, ...archivedProof } = archived;
    return equal(proof, archivedProof) && (equal(lastRejection, before) ||
        (exactNativeFields(lastRejection, ['tick', 'reason']) && lastRejection.reason === 'release_blocked' &&
            integer(lastRejection.tick) && lastRejection.tick >= (before?.tick ?? 0) && lastRejection.tick <= tick));
}

function advanceCurrent(input, event, facts, clock, profile) {
    const state = copy(input),
        c = state.current,
        effects = [],
        q = c.request;
    const archive = archivedNativeEconomicParent(state),
        parent = archive.economic.current;
    const own = () =>
        validEconomicTrialState(facts.economicState) &&
        economicIdentityMatches(facts.economicState.current?.identity, successorIdentity(q));
    const released = () =>
        equal(facts.economicState?.current, { ...copy(parent), managed: false }) &&
        facts.economicState.lastSequence === q.releaseSequence;
    // A persisted activation intent owns withdrawal of its opening while the exact
    // released parent is still current, even if the unadmitted start was changed.
    const staged = () =>
        !!c.startRequest &&
        released() &&
        (equal(facts.economicSettings?.request, c.startRequest) || !!c.intents.activate_start);
    const bound = () =>
        own() &&
        equal(facts.economicSettings?.request, c.startRequest) &&
        facts.economicState.current.startedAtTick === c.startRequest?.activateAtTick &&
        facts.economicState.current.expiresAtTick === c.startRequest?.expiresAtTick &&
        facts.economicState.current.expiresAtMs === c.startRequest?.expiresAtMs;
    function note(reason) {
        c.events.push({ tick: clock.tick, stage: c.stage, reason: reason.slice(0, 160) });
        c.events = c.events.slice(-32);
    }
    function arm(type, stage, fields = {}) {
        if (c.intents[type]) return;
        c.intents[type] = { status: 'planned', tick: clock.tick };
        c.stage = stage;
        effects.push({
            type,
            key: type,
            identity: successorIdentity(q),
            expectedBefore: {
                current: copy(facts.economicState?.current),
                previous: copy(facts.economicState?.previous),
                lastSequence: facts.economicState?.lastSequence,
                settings: copy(facts.economicSettings),
                executionClosed: facts.executionClosed
            },
            ...fields
        });
        note(type);
    }
    function stop(reason) {
        c.outcome ||= { reason, decidedAtTick: clock.tick };
        if (own() || staged()) {
            c.stage = 'stopping';
            if (staged() || !facts.economicState.current.outcome) arm('hold_owned_session', 'stopping', { reason });
        } else c.stage = 'terminal';
    }
    function closure() {
        const s = facts.economicState?.current;
        if (
            own() &&
            s.status === 'terminal' &&
            integer(s.closeAppliedAtTick) &&
            s.closureVerifiedAtTick > s.closeAppliedAtTick &&
            facts.executionClosed
        ) {
            c.stage = 'terminal';
            c.controlClosureConfirmed = true;
            c.outcome ||= { reason: s.outcome?.stopReason || 'guard_closed', decidedAtTick: clock.tick };
            return true;
        }
        return false;
    }
    function requestFor(release) {
        return {
            schemaVersion: 1,
            action: release ? 'release' : 'start',
            id: release ? 'release-' + q.trialId : q.trialId,
            ...(release ? { targetTrialId: q.parent.identity.trialId, nativeSuccessorId: q.id } : {}),
            sequence: release ? q.releaseSequence : q.startSequence,
            remoteId: q.parent.identity.remoteId,
            epoch: q.parent.identity.epoch,
            codeVersion: q.codeVersion,
            configFingerprint: parent.configFingerprint,
            activateAtTick: clock.tick + 1,
            expiresAtTick: clock.tick + 1001,
            issuedAtMs: clock.nowMs,
            expiresAtMs: clock.nowMs + 5400000
        };
    }
    if (c.stage === 'terminal') return { state: input, effects };
    if (event.kind === 'effect_result') {
        const intent = c.intents[event.key];
        if (intent?.status !== 'planned') return { state, effects };
        intent.status = event.result === 'applied' ? 'applied' : event.result === 'refused' ? 'refused' : 'unknown';
        if (intent.status !== 'applied') {
            c.unknownEffect = intent.status === 'unknown';
            stop('effect_' + intent.status);
        } else {
            c.stage = {
                replace_release_request: 'release_confirming',
                prepare_start: 'start_prepared',
                activate_start: 'start_confirming',
                hold_owned_session: 'stopping'
            }[event.key];
            if (
                event.key === 'hold_owned_session' &&
                !own() &&
                facts.executionClosed &&
                facts.economicSettings?.enabled === false
            ) {
                c.stage = 'terminal';
                c.closedBeforeAdmission = true;
            }
        }
        return { state, effects };
    }
    if (event.kind === 'end_tick') {
        if (c.stage === 'start_confirming' && bound()) {
            c.admittedIdentity = copy(facts.economicState.current.identity);
            c.stage = 'observing';
        } else if (c.stage === 'start_confirming') {
            stop('admission_not_confirmed');
        }
        if (own() && facts.scoutObservation) {
            const o = facts.scoutObservation,
                saved = (c.observations ||= {});
            if (!o.spawning) {
                if (saved.bornAt === undefined) {
                    saved.bornAt = clock.tick;
                    saved.birthPosition = copy(o.pos);
                }
                if (saved.lastPosition && !equal(saved.lastPosition, o.pos)) saved.firstMovementAt ??= clock.tick;
                if (o.pos.roomName === profile.targetRoom) saved.enteredRemoteAt ??= clock.tick;
                if (o.sourceVisible) saved.sourceSeenAt ??= clock.tick;
                saved.lastPosition = copy(o.pos);
                saved.lastPositionAt = clock.tick;
            }
            if (facts.routeObservation) saved.route = copy(facts.routeObservation);
        }
        closure();
        return { state, effects };
    }
    const safeToPrepare =
        facts.executionClosed &&
        facts.quiet &&
        facts.homeReady &&
        facts.receiverSafe &&
        facts.budgetSafe &&
        facts.reconReleased;
    if (Object.values(c.intents).some((i) => i.status === 'planned')) {
        c.unknownEffect = true;
        stop('effect_interrupted');
    } else if (clock.tick !== c.lastTick + 1 || clock.nowMs < c.lastNowMs) {
        const phase = c.stage;
        const firstStop = c.outcome === null;
        stop('clock_discontinuity');
        if (firstStop) c.outcome.clockDiscontinuity = {
            previousTick: c.lastTick, previousNowMs: c.lastNowMs, tick: clock.tick, nowMs: clock.nowMs, phase,
            releaseActivateAtTick: c.releaseRequest?.activateAtTick ?? null,
            tickDiscontinuous: clock.tick !== c.lastTick + 1,
            wallClockBackwards: clock.nowMs < c.lastNowMs
        };
    } else if (!equal(facts.settings, { enabled: true, request: q })) stop('request_changed');
    else if (
        clock.codeVersion !== q.codeVersion ||
        facts.operationEpoch !== q.parent.identity.epoch ||
        !facts.protectedSafe ||
        ((q.unadmitted || q.retainedParent) && facts.observersClosed !== true) ||
        !facts.configSafe ||
        !facts.clockFresh
    )
        stop('protected_facts_changed');
    else if (clock.nowMs >= q.stopAtMs) stop('ops_window_expired');
    else if (!facts.accountingKnown) stop('accounting_unknown');
    else if (c.stage === 'stopping') closure();
    else if (c.stage === 'preflight') {
        if (
            !safeToPrepare ||
            !sameArchivedParent(facts.economicState, archive.economic, q.unadmitted, clock.tick) ||
            !equal(facts.economicSettings, archive.economicSettings)
        )
            stop('archive_not_verified');
        else {
            c.releaseRequest = requestFor(true);
            arm('replace_release_request', 'release_writing', { request: copy(c.releaseRequest) });
        }
    } else if (c.stage === 'release_confirming') {
        if (!safeToPrepare || !equal(facts.economicSettings, { enabled: true, request: c.releaseRequest }))
            stop('release_state_changed');
        else if (clock.tick > c.releaseRequest.activateAtTick) {
            if (!released()) stop('release_not_confirmed');
            else {
                c.startRequest = requestFor(false);
                arm('prepare_start', 'start_writing', { request: copy(c.startRequest) });
            }
        }
    } else if (c.stage === 'start_prepared') {
        if (
            clock.tick !== c.startRequest.activateAtTick ||
            !safeToPrepare ||
            !released() ||
            !equal(facts.economicSettings, { enabled: false, request: c.startRequest })
        )
            stop('start_precondition_changed');
        else arm('activate_start', 'start_activating', { request: copy(c.startRequest) });
    } else if (c.stage === 'start_confirming' || c.stage === 'observing') {
        if (!bound()) stop('admission_not_confirmed');
        else {
            c.admittedIdentity = copy(facts.economicState.current.identity);
            c.stage = facts.economicState.current.outcome ? 'stopping' : 'observing';
            closure();
        }
    }
    c.lastTick = clock.tick;
    c.lastNowMs = clock.nowMs;
    return { state, effects };
}
