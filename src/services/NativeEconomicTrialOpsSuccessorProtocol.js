import { unpackNativeEvidence } from './NativeEconomicTrialOpsArchiveCodec.js';
import {
    NATIVE_OPS_PROFILE,
    nativeOpsCopy as copy,
    nativeOpsEqual as equal,
    nativeOpsRecord as record,
    nativeOpsInteger as integer
} from './NativeEconomicTrialOpsProfile.js';
import { nativeReleaseReceiptMatches } from './RemoteEconomicTrialModel.js';

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
        s = p?.settlement,
        unadmitted = q?.unadmitted;
    const recovery = record(q) && Object.hasOwn(q, 'unadmitted');
    const retained = q?.retainedParent === true;
    const sequence = recovery ? Math.max(i?.sequence, unadmitted?.highWater) : i?.sequence;
    if (
        !exactNativeFields(q, recovery ? [...fields, 'unadmitted'] : retained ? [...fields, 'retainedParent'] : fields) ||
        (recovery && (!exactNativeFields(unadmitted, ['nativeId', 'highWater']) ||
            !identifier(unadmitted.nativeId) || unadmitted.nativeId === p?.nativeId ||
            unadmitted.nativeId === q.id || !integer(unadmitted.highWater) ||
            unadmitted.highWater <= i?.sequence)) ||
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
        q.releaseSequence !== sequence + 1 ||
        q.startSequence !== sequence + 2 ||
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
    if (q.unadmitted || q.retainedParent) return makeUnadmittedCommand('submit', q);
    const expression =
        'Memory.empire.control.policy.remoteMining.nativeTrialOps=' + JSON.stringify({ enabled: true, request: q });
    if (JSON.stringify(expression).length > 1024) throw new Error('Native successor serialized request exceeds 1024');
    return expression;
}

function packUnadmitted(q) {
    const p = q.parent, i = p.identity, s = p.settlement;
    return [q.id, q.trialId, q.codeVersion, q.unadmitted?.nativeId ?? null, q.unadmitted?.highWater ?? null,
        q.releaseSequence, q.startSequence, q.issuedAtMs, q.stopAtMs, q.notAfterMs,
        q.acceptNotBeforeTick, q.acceptNotAfterTick,
        [p.nativeId, i.trialId, i.sequence, i.remoteId, i.epoch, i.codeVersion, p.closureVerifiedAtTick,
            s.spawnEnergy, s.infrastructureEnergy, s.returnedEnergy, s.unknownEvents, s.unknownUpperBound]];
}

export function decodeNativeUnadmittedCommand(payload, profile = NATIVE_SUCCESSOR_PROFILE) {
    if (!Array.isArray(payload) || payload.length !== 13 || !Array.isArray(payload[12]) || payload[12].length !== 12)
        throw Error('Invalid unadmitted command');
    const [id, trialId, codeVersion, nativeId, highWater, releaseSequence, startSequence, issuedAtMs,
        stopAtMs, notAfterMs, acceptNotBeforeTick, acceptNotAfterTick, proof] = payload;
    const [parentId, parentTrial, sequence, remoteId, epoch, parentVersion, closureVerifiedAtTick,
        spawnEnergy, infrastructureEnergy, returnedEnergy, unknownEvents, unknownUpperBound] = proof;
    const request = {
        schemaVersion: 2, id, profileId: profile.id, codeVersion,
        parent: { nativeId: parentId, identity: { trialId: parentTrial, sequence, remoteId, epoch, codeVersion: parentVersion },
            closureVerifiedAtTick, settlement: { spawnEnergy, infrastructureEnergy, returnedEnergy, unknownEvents, unknownUpperBound } },
        trialId, releaseSequence, startSequence, issuedAtMs, stopAtMs, notAfterMs, acceptNotBeforeTick, acceptNotAfterTick,
        allowParentArchive: true, allowEconomicRelease: true, allowStart: true, allowHold: true,
        ...(nativeId === null && highWater === null ? {retainedParent: true} : {unadmitted: {nativeId, highWater}})
    };
    const check = validateNativeSuccessorRequest(request, profile, { tick: acceptNotBeforeTick, nowMs: issuedAtMs, codeVersion });
    if (!check.valid) throw Error(check.reason);
    return request;
}

function makeUnadmittedCommand(action, q) {
    const expression = 'global.NativeSuccessorHandoff.' + action + '(' + JSON.stringify(packUnadmitted(q)) + ')';
    if (JSON.stringify(expression).length > 1024) throw Error('Unadmitted command exceeds 1024');
    return expression;
}

export function makeNativeUnadmittedExit(q, profile = NATIVE_SUCCESSOR_PROFILE) {
    if (!(q?.unadmitted || q?.retainedParent) || !validateNativeSuccessorRequest(q, profile, {
        tick: q.acceptNotBeforeTick, nowMs: q.issuedAtMs, codeVersion: q.codeVersion
    }).valid) throw Error('Invalid unadmitted exit');
    return makeUnadmittedCommand('exit', q);
}

function resolvePreviousReference(snapshot, history, ref) {
    const archive = history.at(-1);
    const previous = archive?.nativeSnapshot?.current;
    const current = snapshot.current;
    if (
        !identifier(ref) ||
        archive?.id !== ref ||
        current?.archiveRef !== ref ||
        (current?.request?.unadmitted?.nativeId ?? current?.request?.parent?.nativeId) !== ref ||
        current?.request?.id === ref ||
        !record(previous) ||
        previous.request?.id !== ref
    )
        return undefined;
    return previous;
}

export function nativeSuccessorPrevious(state) {
    if (Object.hasOwn(state, 'packedParent')) return retainedNativeParent(state).native.current;
    if (Object.hasOwn(state, 'previousAbort')) return nativePreReleaseAbortForValidation(state).current;
    if (!Object.hasOwn(state, 'previousRef')) return state.previous;
    const previous = resolvePreviousReference(state, state.history, state.previousRef);
    if (Object.hasOwn(state, 'previous') || !previous) throw Error('Invalid native previous reference');
    return previous;
}

export function encodeNativeSnapshot(raw) {
    const snapshot = copy(raw);
    if (snapshot.schemaVersion === 2) {
        const ref = snapshot.current?.archiveRef;
        const previous = resolvePreviousReference(snapshot, snapshot.history, ref);
        if (previous && equal(snapshot.previous, previous)) {
            snapshot.previousRef = ref;
            delete snapshot.previous;
        }
        snapshot.historyRefs = snapshot.history.map((archive) => archive.id);
        delete snapshot.history;
    }
    return snapshot;
}

const PRE_RELEASE_INHERITED_REQUEST_FIELDS = [
    'schemaVersion', 'profileId', 'parent',
    'allowParentArchive', 'allowEconomicRelease', 'allowStart', 'allowHold'
];

// The root retains the full history. Archive 04 supplies fields shared with the sealed request.
export function encodeNativePreReleaseAbort(state) {
    if (!isNativePreReleaseAbort(state)) throw Error('Invalid pre-release abort');
    const snapshot = encodeNativeSnapshot(state);
    const request = snapshot.current.request;
    const inherited = state.history.at(-1).nativeSnapshot.current.request;
    if (!PRE_RELEASE_INHERITED_REQUEST_FIELDS.every(key => Object.hasOwn(inherited, key) && equal(request[key], inherited[key])))
        throw Error('Retained request differs from archived proof');
    for (const key of PRE_RELEASE_INHERITED_REQUEST_FIELDS) delete request[key];
    request.parentProofRef = inherited.parent.nativeId;
    return snapshot;
}

export function restoreNativePreReleaseAbort(state) {
    const decoded = nativePreReleaseAbortForValidation(state);
    return {...decoded, history: copy(decoded.history)};
}

// The decoded request is detached. Validation borrows the original archive array read-only.
export function nativePreReleaseAbortForValidation(state) {
    const snapshot = state.previousAbort, history = state.history;
    const archive = Array.isArray(history) ? history.at(-1) : null;
    const inherited = archive?.nativeSnapshot?.current?.request;
    const request = snapshot?.current?.request;
    const fields = ['schemaVersion', 'lastAcceptedStartSequence', 'current', 'previousRef', 'historyRefs', 'rejections'];
    if (Object.hasOwn(state, 'previous') || Object.hasOwn(state, 'previousRef') ||
        !record(snapshot) ||
        !exactNativeFields(snapshot, Object.hasOwn(snapshot, 'lastRejection') ? [...fields, 'lastRejection'] : fields) ||
        !record(request) || !inherited?.parent ||
        PRE_RELEASE_INHERITED_REQUEST_FIELDS.some(key => Object.hasOwn(request, key) || !Object.hasOwn(inherited, key)) ||
        request.parentProofRef !== inherited.parent.nativeId || snapshot.previousRef !== archive.id)
        throw Error('Invalid retained pre-release abort');

    // Preserve the original compact previousRef. Restore only the history and omitted proof.
    const raw = copy(snapshot);
    const {historyRefs, ...rest} = raw;
    if (!equal(historyRefs, history.map(a => a.id))) throw Error('Invalid retained history references');
    delete rest.current.request.parentProofRef;
    for (const key of PRE_RELEASE_INHERITED_REQUEST_FIELDS) rest.current.request[key] = copy(inherited[key]);
    return {...rest, history};
}

export function isNativePreReleaseAbort(state) {
    const c = state?.current, d = c?.outcome?.clockDiscontinuity;
    return state?.schemaVersion === 2 && !Object.hasOwn(state, 'previousAbort') &&
        Array.isArray(state.history) && state.history.length === 4 && c?.request?.unadmitted && c.stage === 'terminal' &&
        c.archiveRef === state.history.at(-1)?.id && state.previousRef === c.archiveRef &&
        !Object.hasOwn(state, 'previous') &&
        c.releaseRequest === null && c.startRequest === null && c.admittedIdentity === null &&
        [c.unknownEffect, c.controlClosureConfirmed, c.closedBeforeAdmission].every(value => value === undefined || value === false) &&
        c.observations === undefined &&
        exactNativeFields(c.intents, []) && Array.isArray(c.events) && c.events.length === 0 &&
        c.outcome?.reason === 'clock_discontinuity' && d?.phase === 'preflight' &&
        d.releaseActivateAtTick === null && d.previousTick === c.preflightAt &&
        d.tick === c.lastTick && d.nowMs === c.lastNowMs;
}

function attachNativeHistory(raw, history, copyEvidence) {
    if (raw.schemaVersion !== 2) return raw;
    const refs = raw.historyRefs;
    if (!Array.isArray(refs) || !equal(refs, history.map(archive => archive.id)) ||
        new Set(refs).size !== refs.length)
        throw new Error('Invalid native history references');

    if (Object.hasOwn(raw, 'previousRef')) {
        const previous = resolvePreviousReference(raw, history, raw.previousRef);
        if (Object.hasOwn(raw, 'previous') || !previous) throw new Error('Invalid native previous reference');
        raw.previous = copyEvidence(previous);
        delete raw.previousRef;
    }
    raw.history = copyEvidence(history);
    delete raw.historyRefs;
    return raw;
}

export function decodeNativeSnapshot(snapshot, history) {
    return attachNativeHistory(copy(snapshot), history, copy);
}

// Validation owns the snapshot copy and only reads the already checked prefix.
export function nativeSnapshotForValidation(snapshot, checkedPrefix) {
    return attachNativeHistory(copy(snapshot), checkedPrefix, value => value);
}

export function createNativeParentArchive(rawNative, economicState, settings, clock) {
    const request = rawNative.current.request;
    const archive = {
        id: request.id,
        atTick: clock.tick,
        nativeSnapshot: encodeNativeSnapshot(rawNative),
        economicState: copy(economicState),
        settings: copy(settings),
        originalWindow: { issuedAtMs: request.issuedAtMs, stopAtMs: request.stopAtMs, notAfterMs: request.notAfterMs }
    };
    const next = settings.nativeTrialOps?.request;
    if (next?.unadmitted) {
        const old = rawNative.history.at(-1);
        const { lastRejection, ...current } = economicState;
        const { lastRejection: ignored, ...oldEconomic } = resolveArchivedEconomicState(old, rawNative.history.slice(0, -1));
        if (equal(current, oldEconomic) && (lastRejection === undefined || validReleaseRejection(lastRejection, archive.atTick))) {
            delete archive.economicState;
            archive.economicStateRef = old.id;
            if (lastRejection !== undefined) archive.economicLastRejection = copy(lastRejection);
        }
    }
    return archive;
}

function validReleaseRejection(value, atTick) {
    return exactNativeFields(value, ['tick', 'reason']) && integer(value.tick) &&
        value.tick <= atTick && value.reason === 'release_blocked';
}

function readArchivedEconomicState(archive, prefix, readPrevious) {
    if (!Object.hasOwn(archive, 'economicStateRef')) {
        if (Object.hasOwn(archive, 'economicLastRejection')) throw Error('Unbound economic rejection');
        return archive.economicState;
    }
    const target = prefix.at(-1), current = archive.nativeSnapshot?.current;
    const q = archive.settings?.nativeTrialOps?.request;
    if (Object.hasOwn(archive, 'economicState') || !target || archive.economicStateRef !== target.id ||
        archive.id === target.id || current?.archiveRef !== target.id || q?.parent?.nativeId !== target.id ||
        q?.unadmitted?.nativeId !== archive.id || current?.request?.id !== archive.id ||
        (Object.hasOwn(archive, 'economicLastRejection') && !validReleaseRejection(archive.economicLastRejection, archive.atTick)))
        throw Error('Invalid archived economic reference');
    const economic = readPrevious(target);
    delete economic.lastRejection;
    if (Object.hasOwn(archive, 'economicLastRejection')) economic.lastRejection = copy(archive.economicLastRejection);
    return economic;
}

export function resolveArchivedEconomicState(archive, prefix) {
    return readArchivedEconomicState(archive, prefix,
        target => copy(resolveArchivedEconomicState(target, prefix.slice(0, -1))));
}

export function archivedEconomicStateForValidation(archive, checkedPrefix, previousEconomic) {
    return readArchivedEconomicState(archive, checkedPrefix, () => ({...previousEconomic}));
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

export function nativeUnadmittedReady(facts) {
    return ['protectedSafe', 'observersClosed', 'clockFresh', 'configSafe', 'homeReady', 'receiverSafe',
        'budgetSafe', 'accountingKnown', 'quiet', 'reconReleased', 'executionClosed'].every(key => facts[key] === true);
}

export function matchPreReleaseAbortParent(q, abort, economic, economicSettings, parent, olderParent) {
    if (!q?.unadmitted || !isNativePreReleaseAbort(abort) || !parent || !olderParent) return false;
    const c = abort.current, release = economicSettings?.request;
    if (q.unadmitted.nativeId !== c.request.id ||
        q.unadmitted.highWater !== abort.lastAcceptedStartSequence ||
        q.unadmitted.highWater !== c.request.startSequence ||
        q.trialId === c.request.trialId || !equal(q.parent, c.request.parent) ||
        !(c.lastTick < q.acceptNotBeforeTick) || !(c.request.notAfterMs < q.issuedAtMs) ||
        c.preflightAt !== parent.archive.atTick ||
        !(release?.expiresAtTick < q.acceptNotBeforeTick) || !(release.expiresAtMs < q.issuedAtMs) ||
        !equal(economicSettings, parent.archive.settings.economicTrial))
        return false;

    // The legacy release may update its generic rejection tick while remaining inert.
    const {lastRejection: ignored, ...liveProof} = economic || {};
    const {lastRejection: ignoredArchived, ...archivedProof} = parent.economic;
    return equal(liveProof, archivedProof) &&
        matchNativeSuccessorParent(c.request, parent.native, economic, economicSettings,
            () => ({oldNative: olderParent.native, oldEconomic: olderParent.economic}));
}

let lastPackedParent, lastDecodedParent;
export function retainedNativeParent(state) {
    const serialized = JSON.stringify(state.packedParent);
    if (serialized === lastPackedParent && lastDecodedParent !== undefined) return lastDecodedParent;
    const decoded = unpackNativeEvidence(state.packedParent);
    const freeze = value => {
        if (value && typeof value === 'object') {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
    };
    freeze(decoded);
    lastPackedParent = serialized;
    lastDecodedParent = decoded;
    return decoded;
}

export function archivedNativeEconomicParent(state) {
    if (Object.hasOwn(state, 'packedParent')) {
        const {economic, economicSettings, verifiedAt} = retainedNativeParent(state);
        return {economic, economicSettings, atTick: verifiedAt.tick};
    }
    const archive = state.history.at(-1);
    return {economic: resolveArchivedEconomicState(archive, state.history.slice(0, -1)),
        economicSettings: archive.settings.economicTrial, atTick: archive.atTick};
}

export function nativeRetainedParentMatches(q, native, economic, economicSettings) {
    const old = native?.current?.request;
    const parent = economic?.current;
    const start = native?.current?.startRequest;
    return q?.retainedParent === true && !Object.hasOwn(native || {}, 'packedParent') &&
        native?.history?.length === 4 && Object.hasOwn(native, 'previousAbort') &&
        nativeParentEvidenceMatches(q, native, economic) &&
        exactNativeFields(economicSettings, ['enabled', 'request']) &&
        typeof economicSettings.enabled === 'boolean' && equal(economicSettings.request, start) &&
        integer(parent.tailExpiresAtTick) && parent.tailExpiresAtTick < q.acceptNotBeforeTick &&
        start.expiresAtTick < q.acceptNotBeforeTick && start.expiresAtMs < q.issuedAtMs &&
        old.notAfterMs < q.issuedAtMs;
}

export function nativeSuccessorParentMatches(q, native, economic, economicSettings) {
    if (q?.retainedParent) return nativeRetainedParentMatches(q, native, economic, economicSettings);
    if (q?.unadmitted && isNativePreReleaseAbort(native)) {
        try {
            const history = native.history;
            const parentAt = index => {
                const archive = history[index], prefix = history.slice(0, index);
                return {archive, native: decodeNativeSnapshot(archive.nativeSnapshot, prefix),
                    economic: resolveArchivedEconomicState(archive, prefix)};
            };
            return matchPreReleaseAbortParent(q, native, economic, economicSettings,
                parentAt(history.length - 1), parentAt(history.length - 2));
        } catch {
            return false;
        }
    }
    return matchNativeSuccessorParent(q, native, economic, economicSettings, archive => {
        const prefix = native.history.slice(0, -1);
        return {
            oldNative: decodeNativeSnapshot(archive.nativeSnapshot, prefix),
            oldEconomic: resolveArchivedEconomicState(archive, prefix)
        };
    });
}

// Only the ordered archive validator supplies already verified parent evidence here.
export function matchNativeSuccessorParent(q, native, economic, economicSettings, readOlderParent) {
    if (!q?.unadmitted) return nativeParentEvidenceMatches(q, native, economic);
    const c = native?.current, release = c?.releaseRequest, archive = native?.history?.at(-1);
    const reference = q.unadmitted;
    if (native?.schemaVersion !== 2 || c?.stage !== 'terminal' ||
        c.request.id !== reference.nativeId || native.lastAcceptedStartSequence !== reference.highWater ||
        c.request.startSequence !== reference.highWater || c.admittedIdentity !== null || c.startRequest !== null ||
        c.controlClosureConfirmed === true || c.unknownEffect === true || !c.outcome ||
        !exactNativeFields(c.intents, ['replace_release_request']) ||
        c.intents.replace_release_request?.status !== 'applied' ||
        !equal(c.request.parent, q.parent) || archive?.id !== q.parent.nativeId || c.archiveRef !== archive.id ||
        !release || release.sequence !== c.request.releaseSequence ||
        !equal(economicSettings, { enabled: true, request: release }) ||
        !(release.activateAtTick < q.acceptNotBeforeTick) ||
        !(c.request.notAfterMs < q.issuedAtMs) ||
        !(economic?.current?.tailExpiresAtTick < q.acceptNotBeforeTick))
        return false;
    try {
        const {oldNative, oldEconomic} = readOlderParent(archive);
        const { lastRejection: ignored, nativeReleaseReceipt: receipt, ...currentProof } = economic;
        const { lastRejection: ignoredOld, nativeReleaseReceipt: oldReceipt, ...oldProof } = oldEconomic;
        if (receipt?.nativeId === c.request.id &&
            (!nativeReleaseReceiptMatches(receipt, release, c.request.id) || receipt.status !== 'refused')) return false;
        const receiptMatches = equal(receipt, oldReceipt) ||
            (nativeReleaseReceiptMatches(receipt, release, c.request.id) && receipt.status === 'refused');
        return receiptMatches && equal(currentProof, oldProof) &&
            nativeParentEvidenceMatches(q, oldNative, economic);
    } catch {
        return false;
    }
}
