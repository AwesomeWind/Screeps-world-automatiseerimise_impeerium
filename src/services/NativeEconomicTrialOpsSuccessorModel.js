import { validNativeEconomicOpsState as validLegacy } from './NativeEconomicTrialOpsLegacyModel.js';
import { validEconomicTrialState, economicIdentityMatches } from './RemoteEconomicTrialModel.js';
import {
    NATIVE_SUCCESSOR_PROFILE,
    validateNativeSuccessorRequest,
    createNativeParentArchive,
    decodeNativeSnapshot,
    nativeParentEvidenceMatches,
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
        ...(release ? ['targetTrialId'] : [])
    ];
    const q = c.request;
    return (
        exactNativeFields(value, fields) &&
        value.schemaVersion === 1 &&
        value.action === (release ? 'release' : 'start') &&
        value.id === (release ? 'release-' + q.trialId : q.trialId) &&
        (!release || value.targetTrialId === q.parent.identity.trialId) &&
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

function validCurrent(c) {
    return (
        record(c) &&
        savedRequestValid(c.request) &&
        stages.has(c.stage) &&
        integer(c.lastTick) &&
        integer(c.lastNowMs) &&
        integer(c.preflightAt) &&
        c.preflightAt <= c.lastTick &&
        c.archiveRef === c.request.parent.nativeId &&
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
                c.outcome.decidedAtTick <= c.lastTick)) &&
        JSON.stringify(c).length <= 16384
    );
}

export function validNativeSuccessorState(state) {
    try {
        if (
            !record(state) ||
            state.schemaVersion !== 2 ||
            !integer(state.lastAcceptedStartSequence) ||
            !validCurrent(state.current) ||
            state.lastAcceptedStartSequence !== state.current.request.startSequence ||
            !Array.isArray(state.history) ||
            !state.history.length ||
            state.history.length > 4 ||
            !Array.isArray(state.rejections) ||
            state.rejections.length > 16 ||
            !state.rejections.every(
                (r) =>
                    record(r) &&
                    integer(r.tick) &&
                    (r.id === null || (typeof r.id === 'string' && r.id.length <= 32)) &&
                    (r.trialId === null || (typeof r.trialId === 'string' && r.trialId.length <= 32)) &&
                    typeof r.reason === 'string'
            ) ||
            JSON.stringify(state).length > 65536
        )
            return false;
        const ids = new Set();
        for (let index = 0; index < state.history.length; index++) {
            const a = state.history[index];
            if (
                !record(a) ||
                typeof a.id !== 'string' ||
                ids.has(a.id) ||
                !integer(a.atTick) ||
                !validEconomicTrialState(a.economicState) ||
                !record(a.settings) ||
                !record(a.originalWindow)
            )
                return false;
            const parent = decodeNativeSnapshot(a.nativeSnapshot, state.history.slice(0, index));
            if (
                !(parent.schemaVersion === 2 ? validNativeSuccessorState(parent) : validLegacy(parent)) ||
                parent.current?.request.id !== a.id ||
                !equal(a.originalWindow, {
                    issuedAtMs: parent.current.request.issuedAtMs,
                    stopAtMs: parent.current.request.stopAtMs,
                    notAfterMs: parent.current.request.notAfterMs
                })
            )
                return false;
            ids.add(a.id);
        }
        const archive = state.history.at(-1),
            parent = decodeNativeSnapshot(archive.nativeSnapshot, state.history.slice(0, -1));
        return (
            state.current.archiveRef === archive.id &&
            equal(state.previous, parent.current) &&
            [state.current.releaseRequest, state.current.startRequest].every(
                (q) => q === null || q.configFingerprint === archive.economicState.current.configFingerprint
            ) &&
            nativeParentEvidenceMatches(state.current.request, parent, archive.economicState)
        );
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
    const validation = validateNativeSuccessorRequest(q, { ...profile, id: NATIVE_SUCCESSOR_PROFILE.id }, clock);
    const history = input.schemaVersion === 2 ? input.history : [];
    const used = [
        input.current,
        input.previous,
        ...history.flatMap((a) => [a.nativeSnapshot.current, a.nativeSnapshot.previous])
    ].filter(Boolean);
    const replayed =
        used.some((c) => c.request.id === q.id || c.request.trialId === q.trialId) ||
        input.rejections?.some((r) => r.id === q.id || r.trialId === q.trialId) ||
        input.lastRejection?.id === q.id ||
        input.lastRejection?.trialId === q.trialId ||
        input.lastAcceptedStartSequence >= q.startSequence;
    const reason = !validation.valid
        ? validation.reason
        : replayed
          ? 'request_replayed'
          : input.current.stage !== 'terminal'
            ? 'parent_not_terminal'
            : !facts.parentProof.valid
              ? facts.parentProof.reason
              : !equal(input, facts.nativeState)
                ? 'parent_changed'
                : history.length >= 4
                  ? 'history_capacity'
                  : input.rejections?.length >= 16
                    ? 'rejection_capacity'
                    : null;
    if (reason) return rejected(input, q, clock, reason);
    const archive = createNativeParentArchive(input, facts.economicState, facts.archiveInputs, clock);
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
        previous: copy(input.current),
        history: [...copy(history), archive],
        rejections: copy(input.rejections || []),
        ...(input.lastRejection ? { lastRejection: copy(input.lastRejection) } : {})
    };
    if (JSON.stringify({ ...state, current: null }).length > 49152 || !validNativeSuccessorState(state))
        return rejected(input, q, clock, 'history_capacity');
    return { state, effects: [] };
}

export function successorParent(state) {
    if (!Array.isArray(state?.history)) return undefined;
    return state.history.find((a) => a?.id === state.current?.archiveRef)?.economicState?.current;
}

function advanceCurrent(input, event, facts, clock, profile) {
    const state = copy(input),
        c = state.current,
        effects = [],
        q = c.request;
    const parent = successorParent(state),
        archive = state.history.at(-1);
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
            ...(release ? { targetTrialId: q.parent.identity.trialId } : {}),
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
    } else if (clock.tick !== c.lastTick + 1 || clock.nowMs < c.lastNowMs) stop('clock_discontinuity');
    else if (!equal(facts.settings, { enabled: true, request: q })) stop('request_changed');
    else if (
        clock.codeVersion !== q.codeVersion ||
        facts.operationEpoch !== q.parent.identity.epoch ||
        !facts.protectedSafe ||
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
            !equal(facts.economicState, archive.economicState) ||
            !equal(facts.economicSettings, archive.settings.economicTrial)
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
