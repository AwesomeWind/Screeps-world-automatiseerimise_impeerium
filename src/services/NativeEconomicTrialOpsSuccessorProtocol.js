import {
    NATIVE_OPS_PROFILE,
    nativeOpsCopy as copy,
    nativeOpsEqual as equal,
    nativeOpsRecord as record,
    nativeOpsInteger as integer
} from './NativeEconomicTrialOpsProfile.js';

export const NATIVE_SUCCESSOR_PROFILE = Object.freeze({ ...NATIVE_OPS_PROFILE, id: 'w49n41-w48n41-first-delivery-v2' });
const fields = [
    'schemaVersion',
    'id',
    'profileId',
    'codeVersion',
    'parent',
    'trialId',
    'releaseSequence',
    'startSequence',
    'issuedAtMs',
    'stopAtMs',
    'notAfterMs',
    'acceptNotBeforeTick',
    'acceptNotAfterTick',
    'allowParentArchive',
    'allowEconomicRelease',
    'allowStart',
    'allowHold'
];
export const exactNativeFields = (value, keys) =>
    record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const identifier = (value, max = 32) =>
    typeof value === 'string' && value.length > 0 && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);

export function validateNativeSuccessorRequest(q, profile, clock) {
    const invalid = (reason) => ({ valid: false, reason });
    const p = q?.parent,
        i = p?.identity,
        s = p?.settlement;
    if (
        !exactNativeFields(q, fields) ||
        q.schemaVersion !== 2 ||
        !identifier(q.id) ||
        !identifier(q.trialId) ||
        q.profileId !== profile.id ||
        !identifier(q.codeVersion, 64) ||
        q.codeVersion !== clock.codeVersion ||
        !exactNativeFields(p, ['nativeId', 'identity', 'closureVerifiedAtTick', 'settlement']) ||
        !identifier(p.nativeId) ||
        q.id === p.nativeId ||
        !exactNativeFields(i, ['trialId', 'sequence', 'remoteId', 'epoch', 'codeVersion']) ||
        !identifier(i.trialId) ||
        q.trialId === i.trialId ||
        i.remoteId !== profile.remoteId ||
        !identifier(i.codeVersion, 100) ||
        !integer(i.sequence) ||
        i.sequence < 1 ||
        !integer(i.epoch) ||
        i.epoch < 1 ||
        !integer(p.closureVerifiedAtTick) ||
        !exactNativeFields(s, [
            'spawnEnergy',
            'infrastructureEnergy',
            'returnedEnergy',
            'unknownEvents',
            'unknownUpperBound'
        ]) ||
        !Object.values(s).every(integer) ||
        s.spawnEnergy > 1650 ||
        s.infrastructureEnergy > 6000 ||
        s.unknownEvents !== 0 ||
        s.unknownUpperBound !== 0 ||
        !integer(q.releaseSequence) ||
        !integer(q.startSequence) ||
        q.releaseSequence !== i.sequence + 1 ||
        q.startSequence !== i.sequence + 2 ||
        ['allowParentArchive', 'allowEconomicRelease', 'allowStart', 'allowHold'].some((key) => q[key] !== true)
    )
        return invalid('request_invalid');
    if (
        !['issuedAtMs', 'stopAtMs', 'notAfterMs', 'acceptNotBeforeTick', 'acceptNotAfterTick'].every((key) =>
            integer(q[key])
        ) ||
        !integer(clock.tick) ||
        !integer(clock.nowMs) ||
        q.issuedAtMs > clock.nowMs ||
        clock.nowMs - q.issuedAtMs > 30000 ||
        clock.nowMs >= q.stopAtMs ||
        q.stopAtMs <= q.issuedAtMs ||
        q.notAfterMs - q.stopAtMs < 120000 ||
        q.notAfterMs - q.issuedAtMs > 5400000 ||
        q.acceptNotAfterTick < q.acceptNotBeforeTick ||
        q.acceptNotAfterTick - q.acceptNotBeforeTick > 10 ||
        clock.tick < q.acceptNotBeforeTick ||
        clock.tick > q.acceptNotAfterTick
    )
        return invalid('request_expired');
    return { valid: true, reason: null };
}

export function makeNativeSuccessorSubmission(request, profile = NATIVE_SUCCESSOR_PROFILE) {
    const q = copy(request);
    const validation = validateNativeSuccessorRequest(q, profile, {
        tick: q?.acceptNotBeforeTick,
        nowMs: q?.issuedAtMs,
        codeVersion: q?.codeVersion
    });
    if (!validation.valid) throw new Error(validation.reason);
    const expression =
        'Memory.empire.control.policy.remoteMining.nativeTrialOps=' + JSON.stringify({ enabled: true, request: q });
    if (JSON.stringify(expression).length > 1024) throw new Error('Native successor serialized request exceeds 1024');
    return expression;
}

export function encodeNativeSnapshot(raw) {
    const snapshot = copy(raw);
    if (snapshot.schemaVersion === 2) {
        snapshot.historyRefs = snapshot.history.map((archive) => archive.id);
        delete snapshot.history;
    }
    return snapshot;
}

export function decodeNativeSnapshot(snapshot, history) {
    const raw = copy(snapshot);
    if (raw.schemaVersion === 2) {
        if (
            !Array.isArray(raw.historyRefs) ||
            !equal(
                raw.historyRefs,
                history.map((archive) => archive.id)
            ) ||
            new Set(raw.historyRefs).size !== raw.historyRefs.length
        )
            throw new Error('Invalid native history references');
        raw.history = copy(history);
        delete raw.historyRefs;
    }
    return raw;
}

export function createNativeParentArchive(rawNative, economicState, settings, clock) {
    const request = rawNative.current.request;
    return {
        id: request.id,
        atTick: clock.tick,
        nativeSnapshot: encodeNativeSnapshot(rawNative),
        economicState: copy(economicState),
        settings: copy(settings),
        originalWindow: { issuedAtMs: request.issuedAtMs, stopAtMs: request.stopAtMs, notAfterMs: request.notAfterMs }
    };
}

export function nativeParentEvidenceMatches(request, native, economic) {
    const parent = request?.parent,
        n = native?.current,
        c = economic?.current,
        e = c?.evidence;
    return (
        !!parent &&
        n?.stage === 'terminal' &&
        n.controlClosureConfirmed === true &&
        n.request?.id === parent.nativeId &&
        equal(n.admittedIdentity, parent.identity) &&
        equal(c?.identity, parent.identity) &&
        n.startRequest?.action === 'start' &&
        n.startRequest.id === c.identity.trialId &&
        n.startRequest.sequence === c.identity.sequence &&
        n.startRequest.remoteId === c.identity.remoteId &&
        n.startRequest.epoch === c.identity.epoch &&
        n.startRequest.codeVersion === c.identity.codeVersion &&
        n.startRequest.activateAtTick === c.startedAtTick &&
        n.startRequest.expiresAtTick === c.expiresAtTick &&
        n.startRequest.issuedAtMs === c.issuedAtMs &&
        n.startRequest.expiresAtMs === c.expiresAtMs &&
        n.startRequest.configFingerprint === c.configFingerprint &&
        c.status === 'terminal' &&
        c.managed === true &&
        integer(c.closeAppliedAtTick) &&
        c.closureVerifiedAtTick > c.closeAppliedAtTick &&
        c.closureVerifiedAtTick === parent.closureVerifiedAtTick &&
        economic.lastSequence === parent.identity.sequence &&
        native.lastAcceptedStartSequence === parent.identity.sequence &&
        !n.unknownEffect &&
        record(n.intents) &&
        Object.values(n.intents).every((intent) => !['planned', 'unknown'].includes(intent.status)) &&
        e?.confirmedSpawnCost === parent.settlement.spawnEnergy &&
        e?.confirmedInfrastructureCost === parent.settlement.infrastructureEnergy &&
        e?.returnedEnergy === parent.settlement.returnedEnergy &&
        e?.unknownEvents === 0 &&
        e?.unknownEnergyUpperBound === 0 &&
        (!Object.hasOwn(e, 'logisticsUnknownEnergyUpperBound') || e.logisticsUnknownEnergyUpperBound === 0)
    );
}
