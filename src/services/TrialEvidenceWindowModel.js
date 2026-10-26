import { economicIdentityMatches, validEconomicTrialState } from './RemoteEconomicTrialModel.js';
import { validNativeEconomicOpsState, nativeOpsEconomicIdentity } from './NativeEconomicTrialOpsModel.js';

export const EVIDENCE_PROFILE = Object.freeze({id: 'w49n41-w48n41-first-delivery-evidence-v1',
    baseRoom: 'W49N41', targetRoom: 'W48N41', remoteId: 'W49N41:W48N41',
    sourceId: '5bbcaa6d9099fc012e63155b', containerPos: Object.freeze({x: 19, y: 6, roomName: 'W48N41'})});
export const EVIDENCE_LIMITS = Object.freeze({rows: 1303, snapshots: 80, milestones: 64,
    windowChars: 131072, storeChars: 270336, armedTicks: 20, captureTicks: 1302,
    armedMaxTicks: 1322, snapshotInterval: 20, events: 128, entries: 200,
    reserveCpu: 5, maxCaptureCpu: 2, minBucket: 5000, pageChars: 16384});
export const EVIDENCE_ROW_COLUMNS = Object.freeze(['observedTick', 'observedAtMs', 'safetyKnownBits',
    'safetyValueBits', 'guardSafeStreak', 'harvestEnergy', 'sourceDepositEnergy', 'homeTransferEnergy',
    'stateKnownBits', 'stateValueBits', 'captureFlags']);
export const EVIDENCE_SAFETY_BITS = Object.freeze(Object.fromEntries(['homeOwned', 'homeNoHostiles',
    'remoteVisible', 'remoteNoHostiles', 'sourceVisible', 'noForeignControl', 'currentScoutRemote']
    .map((name, index) => [name, 2 ** index])));
export const EVIDENCE_STATE_BITS = Object.freeze(Object.fromEntries(['reconEnabled', 'economicEnabled',
    'goalPlanningEnabled', 'marketEnabled', 'governorShadow', 'schedulerEnforce', 'controlClosed', 'tailPermission',
    'scoutPresent', 'minerPresent', 'haulerPresent', 'scoutHome', 'minerHome', 'haulerHome',
    'scoutEmpty', 'minerEmpty', 'haulerEmpty'].map((name, index) => [name, 2 ** index])));
export const EVIDENCE_FLAGS = Object.freeze({partial: 1, unsupported: 2, conflict: 4, cpu: 8,
    eventOverflow: 16, entryOverflow: 32, identity: 64, writeUnknown: 128});
export const evidenceRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const evidenceInteger = value => Number.isSafeInteger(value) && value >= 0;
export const evidenceCopy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
export const evidenceEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);
export const evidencePending = store => store?.pending ?? store?.current?.capture?.pending ?? null;
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(value);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 4096;
export const validEvidenceClock = clock => !!clock && evidenceInteger(clock.tick) &&
    evidenceInteger(clock.nowMs) && text(clock.codeVersion);

export function validateEvidenceRequest(request, profile, clock) {
    const q = request, identity = q?.identity;
    const fields = ['schemaVersion', 'id', 'nativeId', 'identity', 'profileId', 'issuedAtMs', 'expiresAtMs',
        'acceptNotBeforeTick', 'acceptNotAfterTick', 'successorOf'];
    const valid = validEvidenceClock(clock) && evidenceRecord(q) && q.schemaVersion === 1 && safeId(q.id) &&
        Object.keys(q).every(key => fields.includes(key)) &&
        safeId(q.nativeId) && (q.successorOf === undefined || safeId(q.successorOf)) && q.profileId === profile.id &&
        evidenceRecord(identity) && Object.keys(identity).length === 5 && text(identity.trialId) &&
        identity.remoteId === profile.remoteId && identity.codeVersion === clock.codeVersion &&
        evidenceInteger(identity.sequence) && identity.sequence > 0 && evidenceInteger(identity.epoch) && identity.epoch > 0 &&
        evidenceInteger(q.issuedAtMs) && evidenceInteger(q.expiresAtMs) &&
        q.issuedAtMs <= clock.nowMs && clock.nowMs - q.issuedAtMs <= 30000 &&
        q.expiresAtMs > clock.nowMs && q.expiresAtMs - q.issuedAtMs <= 5400000 &&
        evidenceInteger(q.acceptNotBeforeTick) && evidenceInteger(q.acceptNotAfterTick) &&
        q.acceptNotAfterTick >= q.acceptNotBeforeTick && q.acceptNotAfterTick - q.acceptNotBeforeTick <= 10 &&
        clock.tick >= q.acceptNotBeforeTick && clock.tick <= q.acceptNotAfterTick;
    return {valid: !!valid, reason: valid ? null : 'invalid_request'};
}

const PHASES = ['armed', 'recording', 'tail_observing', 'sealed'];
const REASONS = ['not_started', 'partial', 'unsupported', 'corrupt', 'complete', 'deadline', 'capacity', 'disabled', 'conflict'];
const withinCapacity = store => JSON.stringify(store).length <= EVIDENCE_LIMITS.storeChars &&
    [store.current, store.previous].every(window => window === null || JSON.stringify(window).length <= EVIDENCE_LIMITS.windowChars);

function validRow(row) {
    return Array.isArray(row) && row.length === EVIDENCE_ROW_COLUMNS.length &&
        evidenceInteger(row[0]) && evidenceInteger(row[1]) &&
        [2, 3, 8, 9, 10].every(index => evidenceInteger(row[index])) &&
        [4, 5, 6, 7].every(index => row[index] === null || evidenceInteger(row[index])) &&
        row[3] <= 127 && row[2] <= 127 && (row[3] & row[2]) === row[3] &&
        row[8] <= 131071 && row[9] <= 131071 && row[10] <= 255 && (row[9] & row[8]) === row[9];
}

function validWindow(window) {
    if (!evidenceRecord(window) || window.header?.schemaVersion !== 1 || window.header.rowSchema !== 1 ||
        !safeId(window.header.id) || !safeId(window.header.nativeId) || !evidenceRecord(window.header.identity) ||
        !evidenceRecord(window.bounds) || !evidenceInteger(window.bounds.armedAtTick) ||
        !evidenceInteger(window.bounds.expiresAtMs) || !evidenceRecord(window.binding) ||
        !evidenceRecord(window.capture) || !PHASES.includes(window.capture.phase) ||
        !evidenceInteger(window.capture.revision) || window.capture.revision < 1 || typeof window.capture.partial !== 'boolean' ||
        !evidenceInteger(window.capture.flags) || window.capture.flags > 255 ||
        !Array.isArray(window.tickRows) || window.tickRows.length > EVIDENCE_LIMITS.rows ||
        !Array.isArray(window.snapshots) || window.snapshots.length > EVIDENCE_LIMITS.snapshots ||
        !Array.isArray(window.milestones) || window.milestones.length > EVIDENCE_LIMITS.milestones) return false;
    const h = window.header, q = h.request;
    if (!validateEvidenceRequest(q, {id: h.profileId, remoteId: h.identity.remoteId},
        {tick: q?.acceptNotBeforeTick, nowMs: q?.issuedAtMs, codeVersion: h.identity.codeVersion}).valid ||
        !evidenceEqual(q.identity, h.identity) || h.id !== q.id || h.nativeId !== q.nativeId ||
        h.profileId !== EVIDENCE_PROFILE.id || h.identity.remoteId !== h.baseRoom + ':' + h.targetRoom ||
        !text(h.sourceId) || !h.containerPos || h.containerPos.roomName !== h.targetRoom ||
        !evidenceInteger(h.containerPos.x) || h.containerPos.x > 49 || !evidenceInteger(h.containerPos.y) || h.containerPos.y > 49 ||
        window.bounds.expiresAtMs !== q.expiresAtMs || window.bounds.armedAtTick < q.acceptNotBeforeTick ||
        window.bounds.armedAtTick > q.acceptNotAfterTick || Object.keys(window.binding).some(role => !['scout', 'remoteMiner', 'remoteHauler'].includes(role))) return false;
    let previous = -1;
    for (const row of window.tickRows) {
        if (!validRow(row) || row[0] <= previous) return false;
        previous = row[0];
    }
    if (window.capture.firstTick !== (window.tickRows[0]?.[0] ?? null) ||
        window.capture.lastTick !== (window.tickRows.at(-1)?.[0] ?? null)) return false;
    if (window.capture.phase === 'armed') return window.header.receiverId === null && window.bounds.startedAtTick === null;
    if (window.capture.phase === 'sealed' && (!evidenceRecord(window.seal) ||
        !REASONS.includes(window.seal.reason) || !evidenceInteger(window.seal.atTick))) return false;
    if (window.bounds.startedAtTick === null) return window.capture.phase === 'sealed' && window.tickRows.length === 0;
    return evidenceInteger(window.bounds.startedAtTick) && evidenceInteger(window.bounds.maxObservedTick) &&
        window.bounds.startedAtTick >= window.bounds.armedAtTick &&
        window.bounds.maxObservedTick <= window.bounds.startedAtTick + 1302 &&
        window.bounds.maxObservedTick <= window.bounds.armedAtTick + 1322 &&
        (!window.tickRows.length || window.tickRows[0][0] >= window.bounds.startedAtTick &&
            window.tickRows.at(-1)[0] <= window.bounds.maxObservedTick) && text(window.header.receiverId);
}

export function validEvidenceStore(store) {
    try {
        return evidenceRecord(store) && store.schemaVersion === 1 && validWindow(store.current) &&
            (store.previous === null || validWindow(store.previous) && store.previous.capture.phase === 'sealed') &&
            (store.pending === undefined || evidenceRecord(store.pending) && safeId(store.pending.windowId) &&
                ['arm', 'packet'].includes(store.pending.stage) && typeof store.pending.key === 'string' &&
                store.pending.key.length <= 100 && evidenceInteger(store.pending.tick)) &&
            withinCapacity(store);
    } catch { return false; }
}

function newWindow(request, profile, clock) {
    return {header: {schemaVersion: 1, rowSchema: 1, id: request.id, nativeId: request.nativeId,
        identity: evidenceCopy(request.identity), profileId: profile.id, baseRoom: profile.baseRoom,
        targetRoom: profile.targetRoom, sourceId: profile.sourceId, containerPos: evidenceCopy(profile.containerPos),
        receiverId: null, originalWindow: null, request: evidenceCopy(request)},
    bounds: {armedAtTick: clock.tick, expiresAtMs: request.expiresAtMs, startedAtTick: null, maxObservedTick: null},
    binding: {}, tickRows: [], snapshots: [], milestones: [], capture: {phase: 'armed', revision: 1,
        partial: false, flags: 0, firstTick: null, lastTick: null, latestProof: null, firstDeliveryProof: null,
        lastPacket: null, provenance: null}, seal: null};
}

function seal(window, reason, clock) {
    window.capture.phase = 'sealed';
    window.seal = {reason, atTick: clock.tick, atMs: clock.nowMs, revision: window.capture.revision + 1};
}

function admissionMatches(window, admission, profile, clock) {
    const state = admission?.economicState, native = admission?.nativeState;
    const session = state?.current, owner = native?.current, start = admission?.startRequest;
    if (!validEconomicTrialState(state) || !validNativeEconomicOpsState(native) || !session?.managed ||
        session.outcome || !owner || !economicIdentityMatches(window.header.identity, session.identity) ||
        !economicIdentityMatches(owner.admittedIdentity, session.identity) || owner.request?.id !== window.header.nativeId ||
        !evidenceEqual(start, owner.startRequest) || start?.action !== 'start' ||
        start.configFingerprint !== session.configFingerprint || start.activateAtTick !== session.startedAtTick ||
        start.expiresAtTick !== session.expiresAtTick || start.issuedAtMs !== session.issuedAtMs ||
        start.expiresAtMs !== session.expiresAtMs || !evidenceEqual(session.containerPos, profile.containerPos) ||
        start.id !== session.identity.trialId || start.sequence !== session.identity.sequence ||
        start.epoch !== session.identity.epoch || start.remoteId !== session.identity.remoteId ||
        start.codeVersion !== clock.codeVersion || session.baseRoom !== profile.baseRoom ||
        session.targetRoom !== profile.targetRoom || session.sourceId !== profile.sourceId ||
        !text(session.receiverId) || session.startedAtTick < window.bounds.armedAtTick || session.startedAtTick > clock.tick) return false;
    try { return economicIdentityMatches(nativeOpsEconomicIdentity(owner.request, profile), session.identity); }
    catch { return false; }
}

function capturePacket(window, packet, clock) {
    if (!evidenceRecord(packet) || packet.windowId !== window.header.id || packet.observedTick !== clock.tick ||
        packet.eventTick !== clock.tick - 1 || packet.observedAtMs !== clock.nowMs ||
        packet.codeVersion !== window.header.identity.codeVersion || !validRow(packet.row) ||
        packet.row[0] !== clock.tick || packet.row[1] !== clock.nowMs || clock.tick < window.bounds.startedAtTick) return 'invalid_packet';
    if (window.capture.lastTick !== null && clock.tick <= window.capture.lastTick) {
        return evidenceEqual(window.capture.lastPacket, packet) ? 'duplicate_packet' : 'conflicting_packet';
    }
    if (window.tickRows.length >= EVIDENCE_LIMITS.rows ||
        packet.snapshot && window.snapshots.length >= EVIDENCE_LIMITS.snapshots ||
        !Array.isArray(packet.milestones) || window.milestones.length + packet.milestones.length > EVIDENCE_LIMITS.milestones) return 'capacity';
    const expected = window.capture.lastTick === null ? window.bounds.startedAtTick : window.capture.lastTick + 1;
    window.capture.partial ||= clock.tick !== expected || packet.row[10] !== 0 || packet.coverage?.complete !== true;
    window.capture.flags |= packet.row[10];
    window.capture.firstTick ??= clock.tick;
    window.capture.lastTick = clock.tick;
    window.tickRows.push(evidenceCopy(packet.row));
    if (packet.snapshot) window.snapshots.push(evidenceCopy(packet.snapshot));
    window.milestones.push(...evidenceCopy(packet.milestones));
    window.binding = evidenceCopy(packet.binding || window.binding);
    window.capture.latestProof = evidenceCopy(packet.proof);
    if (packet.proof?.firstDelivery && !window.capture.firstDeliveryProof) {
        window.capture.firstDeliveryProof = evidenceCopy(packet.proof);
    }
    window.capture.provenance = evidenceCopy(packet.provenance ?? window.capture.provenance);
    window.capture.lastPacket = evidenceCopy(packet);
    if (packet.proof?.outcome) {
        window.capture.phase = 'tail_observing';
        const expiry = packet.proof.tailExpiresAtTick, close = packet.proof.closeAppliedAtTick;
        if (evidenceInteger(close) && evidenceInteger(expiry) && expiry === close + 300) {
            window.bounds.maxObservedTick = Math.min(window.bounds.maxObservedTick, expiry + 2);
        } else window.capture.partial = true;
    }
    return null;
}

export function advanceEvidenceWindow(input, event, clock, profile = EVIDENCE_PROFILE) {
    const unchanged = reason => ({store: input, changed: false, reason});
    if (!validEvidenceClock(clock)) return unchanged('invalid_clock');
    if (input !== undefined && !validEvidenceStore(input)) return unchanged('corrupt');
    if (event?.type === 'arm') {
        if (evidencePending(input)) return unchanged('pending_write');
        if (!validateEvidenceRequest(event.request, profile, clock).valid) return unchanged('invalid_request');
        if (input?.current.header.id === event.request.id) return unchanged('existing_window');
        if (input && (input.current.capture.phase !== 'sealed' || input.previous !== null ||
            event.request.successorOf !== input.current.header.id)) return unchanged('successor_refused');
        const store = {schemaVersion: 1, current: newWindow(event.request, profile, clock), previous: input?.current ?? null};
        return withinCapacity(store) ? {store, changed: true, reason: null} : unchanged('capacity');
    }
    if (!input) return unchanged('missing_window');
    if (input.current.capture.phase === 'sealed') return unchanged('sealed');
    const store = evidenceCopy(input), window = store.current;
    if (clock.codeVersion !== window.header.identity.codeVersion) {
        window.capture.partial = true; seal(window, 'partial', clock);
    } else if (clock.nowMs >= window.bounds.expiresAtMs ||
        window.capture.phase === 'armed' && clock.tick > window.bounds.armedAtTick + 20 ||
        window.bounds.maxObservedTick !== null && clock.tick > window.bounds.maxObservedTick) {
        seal(window, window.capture.phase === 'armed' ? 'not_started' : window.capture.partial ? 'partial' : 'deadline', clock);
    } else if (event?.type === 'bind' && window.capture.phase === 'armed') {
        if (!admissionMatches(window, event.admission, profile, clock)) return unchanged('waiting_admission');
        const current = event.admission.economicState.current;
        window.header.receiverId = current.receiverId;
        window.header.originalWindow = {startedAtTick: current.startedAtTick, expiresAtTick: current.expiresAtTick,
            issuedAtMs: current.issuedAtMs, expiresAtMs: current.expiresAtMs};
        window.bounds.startedAtTick = current.startedAtTick;
        window.bounds.maxObservedTick = Math.min(current.startedAtTick + 1302, window.bounds.armedAtTick + 1322);
        window.capture.phase = 'recording';
        window.capture.partial = clock.tick > current.startedAtTick;
    } else if (event?.type === 'capture' && window.capture.phase !== 'armed') {
        const reason = capturePacket(window, event.packet, clock);
        if (reason === 'duplicate_packet') return unchanged(reason);
        if (reason === 'capacity') { window.capture.partial = true; seal(window, 'capacity', clock); }
        else if (reason === 'conflicting_packet') { window.capture.partial = true; window.capture.flags |= EVIDENCE_FLAGS.conflict; }
        else if (reason) return unchanged(reason);
    } else if (event?.type === 'seal' && REASONS.includes(event.reason)) {
        if (event.reason !== 'complete') window.capture.partial ||= window.bounds.startedAtTick !== null;
        seal(window, event.reason, clock);
    } else return unchanged('no_change');
    window.capture.revision++;
    if (!withinCapacity(store)) {
        const fallback = evidenceCopy(input);
        fallback.current.capture.partial = true;
        // The duplicate of the last packet is unnecessary once sealed; primary rows,
        // snapshots, milestones, bindings and accounting proof all remain intact.
        fallback.current.capture.lastPacket = null;
        seal(fallback.current, 'capacity', clock);
        fallback.current.capture.revision++;
        return withinCapacity(fallback) && validEvidenceStore(fallback)
            ? {store: fallback, changed: true, reason: 'capacity'} : unchanged('capacity');
    }
    if (!validEvidenceStore(store)) return unchanged('invalid_packet');
    return {store, changed: true, reason: null};
}
