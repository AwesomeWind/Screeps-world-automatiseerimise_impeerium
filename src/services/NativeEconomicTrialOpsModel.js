import {economicIdentityMatches, validEconomicTrialState} from './RemoteEconomicTrialModel.js';
import {NATIVE_OPS_PROFILE, validateNativeOpsRequest, nativeOpsCopy as copy,
    nativeOpsEqual as equal, nativeOpsRecord as record, nativeOpsInteger as integer} from './NativeEconomicTrialOpsProfile.js';

const STAGES = new Set(['preflight', 'archiving', 'archive_preparation', 'release_writing', 'release_confirming',
    'start_writing', 'start_prepared', 'start_activating', 'start_confirming', 'observing', 'stopping', 'terminal']);
const EFFECT_KEYS = ['archive_preparation', 'replace_release_request', 'prepare_start', 'activate_start', 'hold_owned_session'];

function validPreparedRequest(value, current, release) {
    if (!record(value)) return false;
    const request = current.request;
    const fields = ['schemaVersion', 'action', 'id', 'sequence', 'remoteId', 'epoch', 'codeVersion',
        'configFingerprint', 'activateAtTick', 'expiresAtTick', 'issuedAtMs', 'expiresAtMs'];
    if (release) fields.push('targetTrialId');
    return Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key)) &&
        value.schemaVersion === 1 && value.action === (release ? 'release' : 'start') &&
        value.id === (release ? 'release-' + request.trialId : request.trialId) &&
        (!release || value.targetTrialId === request.oldIdentity.trialId) &&
        value.sequence === (release ? request.releaseSequence : request.startSequence) &&
        value.remoteId === request.oldIdentity.remoteId && value.epoch === request.oldIdentity.epoch &&
        value.codeVersion === request.codeVersion && value.configFingerprint === current.archive?.current?.configFingerprint &&
        ['activateAtTick', 'expiresAtTick', 'issuedAtMs', 'expiresAtMs'].every(key => integer(value[key])) &&
        value.expiresAtTick === value.activateAtTick + 1000 && value.expiresAtMs === value.issuedAtMs + 5400000 &&
        value.issuedAtMs >= request.issuedAtMs && value.issuedAtMs < request.stopAtMs;
}
function validArchive(current) {
    const archive = current.archive;
    if (archive === null) return ['preflight', 'terminal'].includes(current.stage);
    return record(archive) && integer(archive.atTick) && archive.atTick <= current.lastTick &&
        archive.source === 'acknowledged-stageRelease-83800898' && record(archive.originalWindow) &&
        integer(archive.originalWindow.stopAtMs) && integer(archive.originalWindow.notAfterMs) &&
        archive.originalWindow.notAfterMs > archive.originalWindow.stopAtMs &&
        record(archive.request) && archive.request.schemaVersion === 1 && archive.request.action === 'release' &&
        archive.request.targetTrialId === current.request.oldIdentity.trialId && archive.request.configFingerprint === '' &&
        !['activateAtTick', 'expiresAtTick', 'issuedAtMs', 'expiresAtMs'].some(key => Object.hasOwn(archive.request, key)) &&
        validEconomicTrialState({schemaVersion: 1, lastSequence: current.request.expectedLastSequence,
            current: archive.current, previous: null}) && economicIdentityMatches(archive.current.identity, current.request.oldIdentity);
}

export function validNativeEconomicOpsState(state) {
    if (!record(state) || state.schemaVersion !== 1 || !integer(state.lastAcceptedStartSequence)) return false;
    return [state.current, state.previous].every(c => c === null || record(c) && record(c.request) &&
        validateNativeOpsRequest(c.request, {id: c.request.profileId, oldLastSequence: c.request.expectedLastSequence,
            oldCurrent: {identity: c.request.oldIdentity}}, {tick: c.request.acceptNotBeforeTick,
            nowMs: c.request.issuedAtMs, codeVersion: c.request.codeVersion}).valid &&
        typeof c.request.id === 'string' && typeof c.request.trialId === 'string' && integer(c.request.startSequence) &&
        state.lastAcceptedStartSequence >= c.request.startSequence && STAGES.has(c.stage) &&
        integer(c.lastTick) && integer(c.lastNowMs) && Array.isArray(c.events) && c.events.length <= 32 &&
        validArchive(c) && (c.releaseRequest === null || validPreparedRequest(c.releaseRequest, c, true)) &&
        (c.startRequest === null || validPreparedRequest(c.startRequest, c, false)) &&
        (!['release_writing', 'release_confirming', 'start_writing', 'start_prepared', 'start_activating',
            'start_confirming', 'observing', 'stopping'].includes(c.stage) || c.releaseRequest !== null) &&
        (!['start_writing', 'start_prepared', 'start_activating', 'start_confirming', 'observing'].includes(c.stage) || c.startRequest !== null) &&
        record(c.intents) && Object.keys(c.intents).length <= EFFECT_KEYS.length &&
        Object.entries(c.intents).every(([key, intent]) => EFFECT_KEYS.includes(key) && record(intent) &&
            ['planned', 'applied', 'unknown', 'refused'].includes(intent.status) && integer(intent.tick)));
}

export function nativeOpsEconomicIdentity(request, profile) {
    return {trialId: request.trialId, sequence: request.startSequence, remoteId: profile.remoteId,
        epoch: request.oldIdentity.epoch, codeVersion: request.codeVersion};
}
function ownSession(c, facts, profile) {
    return validEconomicTrialState(facts.economicState) && economicIdentityMatches(facts.economicState.current?.identity,
        nativeOpsEconomicIdentity(c.request, profile));
}
function boundStart(c, facts, profile) {
    const s = facts.economicState.current, q = c.startRequest;
    return ownSession(c, facts, profile) && equal(facts.economicSettings?.request, q) &&
        s.startedAtTick === q.activateAtTick && s.expiresAtTick === q.expiresAtTick && s.expiresAtMs === q.expiresAtMs &&
        s.configFingerprint === q.configFingerprint;
}
function requestFor(c, facts, clock, profile, release) {
    return {schemaVersion: 1, action: release ? 'release' : 'start',
        id: release ? 'release-' + c.request.trialId : c.request.trialId,
        ...(release ? {targetTrialId: c.request.oldIdentity.trialId} : {}),
        sequence: release ? c.request.releaseSequence : c.request.startSequence, remoteId: profile.remoteId,
        epoch: c.request.oldIdentity.epoch, codeVersion: clock.codeVersion, configFingerprint: facts.fingerprint,
        activateAtTick: clock.tick + 1, expiresAtTick: clock.tick + 1001,
        issuedAtMs: clock.nowMs, expiresAtMs: clock.nowMs + 5400000};
}

export function advanceNativeEconomicOps(input, event, facts, clock, profile = NATIVE_OPS_PROFILE) {
    if (input !== undefined && !validNativeEconomicOpsState(input)) return {state: input, effects: [], error: 'state_invalid'};
    if (!input?.current) {
        if (facts.settings?.enabled !== true) return {state: input, effects: []};
        const validation = validateNativeOpsRequest(facts.settings.request, profile, clock);
        const requestId = typeof facts.settings.request?.id === 'string' ? facts.settings.request.id.slice(0, 64) : null;
        if (!validation.valid || input?.lastRejection?.id === requestId ||
            (input?.lastAcceptedStartSequence ?? 0) >= facts.settings.request.startSequence) {
            const rejected = copy(input) || {schemaVersion: 1, lastAcceptedStartSequence: 0, current: null, previous: null};
            const reason = validation.reason || 'request_replayed';
            rejected.lastRejection = {id: requestId, reason, atTick: clock.tick, atMs: clock.nowMs};
            return {state: rejected, effects: [], error: reason};
        }
        const current = {request: copy(facts.settings.request), stage: 'preflight', lastTick: clock.tick,
            lastNowMs: clock.nowMs, preflightAt: clock.tick, intents: {}, events: [], archive: null,
            releaseRequest: null, startRequest: null, admittedIdentity: null, outcome: null};
        if (!facts.ready || facts.operationEpoch !== profile.oldCurrent.identity.epoch) {
            current.stage = 'terminal';
            current.outcome = {reason: 'preflight_refused', decidedAtTick: clock.tick};
        }
        return {state: {schemaVersion: 1, lastAcceptedStartSequence: current.request.startSequence,
            current, previous: input?.current || null}, effects: []};
    }
    const state = copy(input), c = state.current, effects = [];
    if (!validateNativeOpsRequest(c.request, profile, {tick: c.request.acceptNotBeforeTick,
        nowMs: c.request.issuedAtMs, codeVersion: c.request.codeVersion}).valid) return {state: input, effects: [], error: 'state_invalid'};
    if (c.archive && (!equal(c.archive.request, profile.oldPreparation) || !equal(c.archive.current, profile.oldCurrent) ||
        !equal(c.archive.originalWindow, profile.originalWindow))) return {state: input, effects: [], error: 'state_invalid'};
    function note(reason) {
        c.events.push({tick: clock.tick, stage: c.stage, reason});
        c.events = c.events.slice(-32);
    }
    function arm(type, stage, fields = {}) {
        if (c.intents[type]) return false;
        const expectedBefore = {current: copy(facts.economicState?.current), lastSequence: facts.economicState?.lastSequence,
            settings: copy(facts.economicSettings), executionClosed: facts.executionClosed};
        const effect = {type, key: type, identity: nativeOpsEconomicIdentity(c.request, profile),
            expectedBefore, ...fields};
        c.intents[type] = {status: 'planned', tick: clock.tick};
        c.stage = stage; effects.push(effect); note(type); return true;
    }
    function stop(reason) {
        c.outcome ||= {reason, decidedAtTick: clock.tick};
        const staged = c.startRequest && equal(facts.economicSettings?.request, c.startRequest) &&
            equal(facts.economicState?.current, {...copy(profile.oldCurrent), managed: false}) &&
            facts.economicState.lastSequence === c.request.releaseSequence;
        if (ownSession(c, facts, profile) || staged) {
            c.stage = 'stopping';
            if (staged || !facts.economicState.current.outcome) arm('hold_owned_session', 'stopping', {reason});
        } else c.stage = 'terminal';
    }
    function closure() {
        if (!ownSession(c, facts, profile)) return false;
        const session = facts.economicState.current;
        if (session.status === 'terminal' && integer(session.closeAppliedAtTick) &&
            session.closureVerifiedAtTick > session.closeAppliedAtTick && facts.executionClosed) {
            c.stage = 'terminal'; c.controlClosureConfirmed = true;
            c.outcome ||= {reason: session.outcome?.stopReason || 'guard_closed', decidedAtTick: clock.tick};
            return true;
        }
        return false;
    }
    if (c.stage === 'terminal') return {state, effects};
    if (event.kind === 'effect_result') {
        const intent = c.intents[event.key];
        if (!intent || intent.status !== 'planned') return {state, effects};
        intent.status = event.result === 'applied' ? 'applied' : event.result === 'refused' ? 'refused' : 'unknown';
        if (intent.status !== 'applied') {
            c.unknownEffect = intent.status === 'unknown'; stop('effect_' + intent.status);
        } else {
            const next = {archive_preparation: 'archive_preparation', replace_release_request: 'release_confirming',
                prepare_start: 'start_prepared', activate_start: 'start_confirming', hold_owned_session: 'stopping'};
            c.stage = next[event.key];
            if (event.key === 'hold_owned_session' && !ownSession(c, facts, profile) &&
                facts.executionClosed && facts.economicSettings?.enabled === false) {
                c.stage = 'terminal'; c.closedBeforeAdmission = true;
            }
        }
        return {state, effects};
    }
    if (event.kind === 'end_tick') {
        if (c.stage === 'start_confirming' && ownSession(c, facts, profile) && boundStart(c, facts, profile)) {
            c.admittedIdentity = copy(facts.economicState.current.identity); c.stage = 'observing';
        }
        if (ownSession(c, facts, profile) && facts.scoutObservation) {
            const observation = facts.scoutObservation;
            const saved = c.observations ||= {};
            if (!observation.spawning) {
                if (saved.bornAt === undefined) {saved.bornAt = clock.tick; saved.birthPosition = copy(observation.pos);}
                if (saved.lastPosition && !equal(saved.lastPosition, observation.pos)) saved.firstMovementAt ??= clock.tick;
                if (observation.pos.roomName === profile.targetRoom) saved.enteredRemoteAt ??= clock.tick;
                if (observation.sourceVisible) saved.sourceSeenAt ??= clock.tick;
                saved.lastPosition = copy(observation.pos); saved.lastPositionAt = clock.tick;
            }
            if (facts.routeObservation) saved.route = copy(facts.routeObservation);
        }
        closure(); return {state, effects};
    }
    const planned = Object.values(c.intents).some(intent => intent.status === 'planned');
    if (planned) {c.unknownEffect = true; stop('effect_interrupted');}
    else if (clock.tick !== c.lastTick + 1 || clock.nowMs < c.lastNowMs) stop('clock_discontinuity');
    else if (!equal(facts.settings, {enabled: true, request: c.request})) stop('request_changed');
    else if (clock.codeVersion !== c.request.codeVersion || facts.operationEpoch !== c.request.oldIdentity.epoch ||
        !facts.protectedSafe || !facts.configSafe || !facts.clockFresh) stop('protected_facts_changed');
    else if (clock.nowMs >= c.request.stopAtMs) stop('ops_window_expired');
    else if (!facts.accountingKnown) stop('accounting_unknown');
    else if (c.stage === 'stopping') closure();
    else if (c.stage === 'preflight') {
        if (!facts.ready) stop('preflight_changed');
        else {
            c.archive = {atTick: clock.tick, request: copy(profile.oldPreparation), current: copy(profile.oldCurrent),
                originalWindow: copy(profile.originalWindow), source: 'acknowledged-stageRelease-83800898'};
            arm('archive_preparation', 'archiving');
        }
    } else if (c.stage === 'archive_preparation') {
        if (!facts.ready || c.archive?.atTick >= clock.tick || !equal(c.archive.request, profile.oldPreparation) ||
            !equal(c.archive.current, profile.oldCurrent)) stop('archive_not_verified');
        else {
            c.releaseRequest = requestFor(c, facts, clock, profile, true);
            arm('replace_release_request', 'release_writing', {request: copy(c.releaseRequest)});
        }
    } else if (c.stage === 'release_confirming') {
        const released = {...copy(profile.oldCurrent), managed: false};
        if (!equal(facts.economicSettings, {enabled: true, request: c.releaseRequest}) ||
            !facts.executionClosed || !facts.quiet || !facts.homeReady || !facts.receiverSafe || !facts.budgetSafe || !facts.reconReleased) stop('release_state_changed');
        else if (clock.tick > c.releaseRequest.activateAtTick) {
            if (!equal(facts.economicState?.current, released) || facts.economicState.lastSequence !== c.request.releaseSequence) stop('release_not_confirmed');
            else {
                c.startRequest = requestFor(c, facts, clock, profile, false);
                arm('prepare_start', 'start_writing', {request: copy(c.startRequest)});
            }
        }
    } else if (c.stage === 'start_prepared') {
        if (clock.tick !== c.startRequest.activateAtTick || !facts.executionClosed || !facts.quiet ||
            !facts.homeReady || !facts.receiverSafe || !facts.budgetSafe || !facts.reconReleased ||
            !equal(facts.economicState?.current, {...copy(profile.oldCurrent), managed: false}) ||
            facts.economicState.lastSequence !== c.request.releaseSequence ||
            !equal(facts.economicSettings, {enabled: false, request: c.startRequest})) stop('start_precondition_changed');
        else arm('activate_start', 'start_activating', {request: copy(c.startRequest)});
    } else if (c.stage === 'start_confirming' || c.stage === 'observing') {
        if (!ownSession(c, facts, profile) || !boundStart(c, facts, profile)) stop('admission_not_confirmed');
        else {
            c.admittedIdentity = copy(facts.economicState.current.identity);
            c.stage = facts.economicState.current.outcome ? 'stopping' : 'observing';
            closure();
        }
    }
    c.lastTick = clock.tick; c.lastNowMs = clock.nowMs;
    return {state, effects};
}
