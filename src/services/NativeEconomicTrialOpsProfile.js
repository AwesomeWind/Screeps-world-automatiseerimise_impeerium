import knownPreparation from './NativeEconomicTrialOpsKnownPreparation.js';

function freeze(value) {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    }
    return value;
}
export const NATIVE_OPS_PROFILE = freeze(knownPreparation);
export const nativeOpsCopy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
export const nativeOpsRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const nativeOpsInteger = value => Number.isSafeInteger(value) && value >= 0;
export function nativeOpsEqual(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    const keys = Object.keys(a);
    return Array.isArray(a) === Array.isArray(b) && keys.length === Object.keys(b).length &&
        keys.every(key => Object.hasOwn(b, key) && nativeOpsEqual(a[key], b[key]));
}
const FIELDS = ['schemaVersion', 'id', 'profileId', 'codeVersion', 'oldIdentity', 'expectedLastSequence',
    'trialId', 'releaseSequence', 'startSequence', 'issuedAtMs', 'stopAtMs', 'notAfterMs',
    'acceptNotBeforeTick', 'acceptNotAfterTick', 'allowSupersedeKnownClosedPreparation',
    'allowEconomicRelease', 'allowStart', 'allowHold'];
const identifier = (value, max) => typeof value === 'string' && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);

export function validateNativeOpsRequest(q, profile, clock) {
    const invalid = reason => ({valid: false, reason});
    if (!nativeOpsRecord(q) || !nativeOpsRecord(q.oldIdentity) || !nativeOpsRecord(profile?.oldCurrent?.identity) ||
        Object.keys(q.oldIdentity).length !== 5 || !['trialId', 'remoteId', 'codeVersion'].every(key =>
            typeof q.oldIdentity[key] === 'string' && q.oldIdentity[key].length > 0 && q.oldIdentity[key].length <= 100) ||
        !nativeOpsInteger(q.oldIdentity.sequence) || q.oldIdentity.sequence < 1 || !nativeOpsInteger(q.oldIdentity.epoch) || q.oldIdentity.epoch < 1 ||
        Object.keys(q).length !== FIELDS.length || FIELDS.some(key => !Object.hasOwn(q, key)) ||
        q.schemaVersion !== 1 || !identifier(q.id, 64) || !identifier(q.trialId, 56) ||
        q.trialId === profile.oldCurrent.identity.trialId || q.profileId !== profile.id ||
        !identifier(q.codeVersion, 64) || q.codeVersion !== clock.codeVersion ||
        !nativeOpsEqual(q.oldIdentity, profile.oldCurrent.identity) || q.expectedLastSequence !== profile.oldLastSequence ||
        q.releaseSequence !== profile.oldLastSequence + 1 || q.startSequence !== profile.oldLastSequence + 2 ||
        ['allowSupersedeKnownClosedPreparation', 'allowEconomicRelease', 'allowStart', 'allowHold'].some(key => q[key] !== true)) {
        return invalid('request_invalid');
    }
    if (!['issuedAtMs', 'stopAtMs', 'notAfterMs', 'acceptNotBeforeTick', 'acceptNotAfterTick'].every(key => nativeOpsInteger(q[key])) ||
        !nativeOpsInteger(clock.tick) || !nativeOpsInteger(clock.nowMs) || q.issuedAtMs > clock.nowMs ||
        clock.nowMs - q.issuedAtMs > 30000 || clock.nowMs >= q.stopAtMs || q.stopAtMs <= q.issuedAtMs ||
        q.notAfterMs - q.stopAtMs < 120000 || q.notAfterMs - q.issuedAtMs > 5400000 ||
        q.acceptNotAfterTick < q.acceptNotBeforeTick || q.acceptNotAfterTick - q.acceptNotBeforeTick > 10 ||
        clock.tick < q.acceptNotBeforeTick || clock.tick > q.acceptNotAfterTick) return invalid('request_expired');
    return {valid: true, reason: null};
}

export function makeNativeOpsSubmission(request) {
    const q = nativeOpsCopy(request);
    const validation = validateNativeOpsRequest(q, NATIVE_OPS_PROFILE,
        {tick: q?.acceptNotBeforeTick, nowMs: q?.issuedAtMs, codeVersion: q?.codeVersion});
    if (!validation.valid) throw new Error(validation.reason);
    const expression = 'Memory.empire.control.policy.remoteMining.nativeTrialOps=' + JSON.stringify({enabled: true, request: q});
    if (JSON.stringify(expression).length > 1024) throw new Error('Native operations serialized request exceeds 1024');
    return expression;
}
