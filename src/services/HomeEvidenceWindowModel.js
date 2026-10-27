export const HOME_EVIDENCE_PROFILE = Object.freeze({id: 'home_natural_v1', shard: 'shard3', roomName: 'W49N41'});
export const HOME_EVIDENCE_LIMITS = Object.freeze({ticks: 100, wallMs: 600000, freshnessMs: 30000, admissionTicks: 10,
    cohort: 4, objects: 16, candidates: 200, nativeEvents: 128, events: 32, storeChars: 131072,
    commitReserveChars: 1024, pageChars: 16384, pageRows: 16});
export const HOME_ROLES = Object.freeze(['miner', 'hauler', 'builder', 'repairer', 'upgrader']);
export const HOME_REASONS = Object.freeze(['partial', 'objects_missing', 'events_overflow', 'events_invalid',
    'unsupported', 'cpu_skipped', 'gap', 'conflict', 'write_unknown', 'capacity', 'identity']);
const STOP_REASONS = ['complete', 'deadline', 'disabled', 'request_changed', 'version_changed', 'scope_changed',
    'controls_unconfirmed', 'controls_open', 'home_unavailable', 'home_danger', 'home_not_ready', 'invalid_clock', 'capacity', 'partial'];
export const homeRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const homeInteger = value => Number.isSafeInteger(value) && value >= 0;
export const homeId = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
export const homeCopy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
export const homeEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const text = (value, max = 128) => typeof value === 'string' && value.length > 0 && value.length <= max;
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(value);
const keys = (value, required, optional = []) => homeRecord(value) && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const finite = value => Number.isFinite(value) && value >= 0;
const nullable = (value, check) => value === null || check(value);
export const validHomeClock = clock => keys(clock, ['tick', 'nowMs', 'codeVersion', 'shard']) &&
    homeInteger(clock.tick) && Number.isSafeInteger(clock.tick + 99) && homeInteger(clock.nowMs) &&
    text(clock.codeVersion) && text(clock.shard, 32);

export function validateHomeEvidenceRequest(q, clock) {
    const fields = ['schemaVersion', 'id', 'profile', 'codeVersion', 'shard', 'roomName', 'issuedAtMs', 'expiresAtMs',
        'acceptNotBeforeTick', 'acceptNotAfterTick'];
    const valid = validHomeClock(clock) && keys(q, fields) && q.schemaVersion === 1 && safeId(q.id) &&
        q.profile === HOME_EVIDENCE_PROFILE.id && q.shard === HOME_EVIDENCE_PROFILE.shard && clock.shard === q.shard &&
        q.roomName === HOME_EVIDENCE_PROFILE.roomName && q.codeVersion === clock.codeVersion &&
        homeInteger(q.issuedAtMs) && homeInteger(q.expiresAtMs) && q.issuedAtMs <= clock.nowMs &&
        clock.nowMs - q.issuedAtMs <= HOME_EVIDENCE_LIMITS.freshnessMs && q.expiresAtMs > clock.nowMs &&
        q.expiresAtMs - q.issuedAtMs <= HOME_EVIDENCE_LIMITS.wallMs &&
        homeInteger(q.acceptNotBeforeTick) && homeInteger(q.acceptNotAfterTick) &&
        q.acceptNotAfterTick >= q.acceptNotBeforeTick && q.acceptNotAfterTick - q.acceptNotBeforeTick <= 10 &&
        clock.tick >= q.acceptNotBeforeTick && clock.tick <= q.acceptNotAfterTick;
    return {valid: !!valid, reason: valid ? null : 'invalid_request'};
}

function validSelection(selection) {
    if (!keys(selection, ['cohort', 'objectIds', 'complete', 'reason']) || selection.complete !== true || selection.reason !== null ||
        !Array.isArray(selection.cohort) || selection.cohort.length < 1 || selection.cohort.length > 4 ||
        !Array.isArray(selection.objectIds) || selection.objectIds.length > 16 || !selection.objectIds.every(homeId) ||
        new Set(selection.objectIds).size !== selection.objectIds.length) return false;
    const cohort = selection.cohort;
    return cohort.every(item => keys(item, ['id', 'name', 'role']) && homeId(item.id) && text(item.name, 100) &&
        HOME_ROLES.includes(item.role) && selection.objectIds.includes(item.id)) &&
        new Set(cohort.map(item => item.id)).size === cohort.length && new Set(cohort.map(item => item.name)).size === cohort.length;
}
function gateFailure(gate, clock) {
    if (!keys(gate, ['observedTick', 'known', 'closed', 'homeReady', 'reason']) || gate.observedTick !== clock.tick ||
        gate.known !== true || typeof gate.closed !== 'boolean' || typeof gate.homeReady !== 'boolean') return 'controls_unconfirmed';
    if (!gate.closed) return 'controls_open';
    if (!gate.homeReady) return ['home_unavailable', 'home_danger', 'home_not_ready'].includes(gate.reason) ? gate.reason : 'home_not_ready';
    return null;
}
function validObject(object, id) {
    return keys(object, ['id', 'exists', 'kind', 'role', 'my', 'pos', 'energy']) && object.id === id &&
        nullable(object.exists, value => typeof value === 'boolean') && nullable(object.kind, value => text(value, 32)) &&
        nullable(object.role, value => text(value, 32)) && nullable(object.my, value => typeof value === 'boolean') &&
        nullable(object.energy, homeInteger) && nullable(object.pos, p => keys(p, ['x', 'y', 'roomName']) &&
            homeInteger(p.x) && p.x <= 49 && homeInteger(p.y) && p.y <= 49 && p.roomName === HOME_EVIDENCE_PROFILE.roomName);
}
function validPacket(p, window) {
    if (!keys(p, ['windowId', 'codeVersion', 'observedTick', 'declaredEventTick', 'observedAtMs', 'objects', 'events',
        'otherEventCounts', 'api', 'cpu', 'coverage']) || p.windowId !== window.header.windowId ||
        p.codeVersion !== window.header.codeVersion || !homeInteger(p.observedTick) ||
        p.declaredEventTick !== p.observedTick - 1 || !homeInteger(p.observedAtMs) || !homeRecord(p.objects) ||
        Object.keys(p.objects).length !== window.header.objectIds.length ||
        !window.header.objectIds.every(id => validObject(p.objects[id], id)) ||
        !Array.isArray(p.events) || p.events.length > 32 || !homeRecord(p.otherEventCounts) ||
        Object.keys(p.otherEventCounts).length > 32 ||
        !Object.entries(p.otherEventCounts).every(([key, value]) => /^(?:[1-9][0-9]?|other)$/.test(key) && homeInteger(value) && value <= 128)) return false;
    const eventKeys = ['roomName', 'index', 'event', 'objectId', 'targetId', 'resourceType', 'amount'];
    if (!p.events.every(e => keys(e, eventKeys) && e.roomName === HOME_EVIDENCE_PROFILE.roomName && homeInteger(e.index) && e.index < 128 &&
        homeInteger(e.event) && e.event > 0 && e.event <= 99 && homeId(e.objectId) && nullable(e.targetId, homeId) &&
        nullable(e.resourceType, value => text(value, 32)) && nullable(e.amount, homeInteger)) ||
        new Set(p.events.map(e => e.index)).size !== p.events.length) return false;
    const accounted = p.events.length + Object.values(p.otherEventCounts).reduce((sum, count) => sum + count, 0);
    return keys(p.api, ['methodSupported', 'shapeValid', 'nativeCount', 'semantics']) &&
        [p.api.methodSupported, p.api.shapeValid].every(value => nullable(value, x => typeof x === 'boolean')) &&
        nullable(p.api.nativeCount, homeInteger) && ['simulated', 'unverified'].includes(p.api.semantics) &&
        (p.api.nativeCount === null ? accounted === 0 : p.api.nativeCount >= accounted) &&
        keys(p.cpu, ['usedBefore', 'tickLimit', 'bucket', 'captureCpu']) && Object.values(p.cpu).every(value => nullable(value, finite)) &&
        keys(p.coverage, ['complete', 'reasons']) && typeof p.coverage.complete === 'boolean' &&
        Array.isArray(p.coverage.reasons) && p.coverage.reasons.length <= HOME_REASONS.length &&
        p.coverage.reasons.every(reason => HOME_REASONS.includes(reason)) && new Set(p.coverage.reasons).size === p.coverage.reasons.length &&
        (!p.coverage.complete || p.coverage.reasons.length === 0 && p.api.methodSupported === true && p.api.shapeValid === true && p.api.nativeCount === accounted);
}

export function validHomeEvidenceStore(store) {
    try {
        if (!keys(store, ['schemaVersion', 'profile', 'window']) || store.schemaVersion !== 1 || store.profile !== 'home_natural_v1') return false;
        const w = store.window;
        if (!keys(w, ['header', 'bounds', 'rows', 'capture', 'seal'], ['pending']) ||
            !keys(w.header, ['windowId', 'codeVersion', 'shard', 'roomName', 'request', 'cohort', 'objectIds']) ||
            !keys(w.bounds, ['acceptedAtTick', 'lastAllowedTick', 'issuedAtMs', 'expiresAtMs']) ||
            !keys(w.capture, ['revision', 'phase', 'partial', 'flags', 'lastCommittedTick', 'lastNowMs']) ||
            !['recording', 'sealed'].includes(w.capture.phase) || !homeInteger(w.capture.revision) || w.capture.revision < 1 ||
            typeof w.capture.partial !== 'boolean' || !Array.isArray(w.capture.flags) ||
            w.capture.flags.length > HOME_REASONS.length || !w.capture.flags.every(flag => HOME_REASONS.includes(flag)) ||
            new Set(w.capture.flags).size !== w.capture.flags.length || !homeInteger(w.capture.lastNowMs) ||
            !Array.isArray(w.rows) || w.rows.length > 100) return false;
        const h = w.header, b = w.bounds, q = h.request;
        if (!homeInteger(b.acceptedAtTick) || b.lastAllowedTick !== b.acceptedAtTick + 99 ||
            b.issuedAtMs !== q?.issuedAtMs || b.expiresAtMs !== q?.expiresAtMs || h.windowId !== q?.id ||
            h.codeVersion !== q?.codeVersion || h.shard !== q?.shard || h.roomName !== q?.roomName ||
            !validateHomeEvidenceRequest(q, {tick: b.acceptedAtTick, nowMs: q?.issuedAtMs, codeVersion: h.codeVersion, shard: h.shard}).valid ||
            !validSelection({cohort: h.cohort, objectIds: h.objectIds, complete: true, reason: null})) return false;
        let previous = b.acceptedAtTick - 1, priorMs = q.issuedAtMs;
        for (const row of w.rows) {
            if (!validPacket(row, w) || row.observedTick <= previous || row.observedTick < b.acceptedAtTick || row.observedTick > b.lastAllowedTick ||
                row.observedAtMs < priorMs || row.observedAtMs >= b.expiresAtMs) return false;
            previous = row.observedTick; priorMs = row.observedAtMs;
        }
        if (w.capture.lastCommittedTick !== (w.rows.at(-1)?.observedTick ?? null) || w.capture.lastNowMs < priorMs) return false;
        if (w.capture.phase === 'sealed') {
            if (!keys(w.seal, ['reason', 'atTick', 'atMs']) || !STOP_REASONS.includes(w.seal.reason) ||
                !homeInteger(w.seal.atTick) || !nullable(w.seal.atMs, homeInteger)) return false;
        } else if (w.seal !== null) return false;
        if (w.pending !== undefined && (!keys(w.pending, ['key', 'stage', 'tick']) || !text(w.pending.key, 96) ||
            !['admit', 'capture', 'seal'].includes(w.pending.stage) || !homeInteger(w.pending.tick))) return false;
        return JSON.stringify(store).length <= HOME_EVIDENCE_LIMITS.storeChars;
    } catch {return false;}
}

function sealWindow(window, reason, clock) {
    window.capture.phase = 'sealed';
    window.seal = {reason, atTick: clock.tick, atMs: clock.nowMs >= window.capture.lastNowMs ? clock.nowMs : null};
    if (reason !== 'complete') window.capture.partial = true;
}
function flag(window, reason) {
    window.capture.partial = true;
    if (!window.capture.flags.includes(reason)) window.capture.flags.push(reason);
}

export function advanceHomeEvidence(input, event, clock) {
    const unchanged = reason => ({store: input, changed: false, reason});
    if (!validHomeClock(clock)) return unchanged('invalid_clock');
    if (input !== undefined && !validHomeEvidenceStore(input)) return unchanged('corrupt');
    if (input?.window.pending) return unchanged('pending_write');
    if (event?.type === 'admit') {
        if (input !== undefined) return unchanged('existing_window');
        if (!validateHomeEvidenceRequest(event.request, clock).valid) return unchanged('invalid_request');
        const failure = gateFailure(event.gate, clock);
        if (failure) return unchanged(failure);
        if (!validSelection(event.selection)) return unchanged('invalid_selection');
        const q = homeCopy(event.request), selection = homeCopy(event.selection);
        const store = {schemaVersion: 1, profile: 'home_natural_v1', window: {
            header: {windowId: q.id, codeVersion: q.codeVersion, shard: q.shard, roomName: q.roomName,
                request: q, cohort: selection.cohort, objectIds: selection.objectIds},
            bounds: {acceptedAtTick: clock.tick, lastAllowedTick: clock.tick + 99, issuedAtMs: q.issuedAtMs, expiresAtMs: q.expiresAtMs},
            rows: [], capture: {revision: 1, phase: 'recording', partial: false, flags: [], lastCommittedTick: null, lastNowMs: clock.nowMs}, seal: null}};
        return {store, changed: true, reason: null};
    }
    if (!input) return unchanged('missing_window');
    if (input.window.capture.phase === 'sealed') return unchanged('sealed');
    const store = homeCopy(input), w = store.window;
    let stop = null;
    if (clock.tick < (w.capture.lastCommittedTick ?? w.bounds.acceptedAtTick) || clock.nowMs < w.capture.lastNowMs) stop = 'invalid_clock';
    else if (clock.codeVersion !== w.header.codeVersion) stop = 'version_changed';
    else if (clock.shard !== w.header.shard) stop = 'scope_changed';
    else if (clock.tick > w.bounds.lastAllowedTick || clock.nowMs >= w.bounds.expiresAtMs) stop = 'deadline';
    else if (event?.type === 'seal' && STOP_REASONS.includes(event.reason)) stop = event.reason;
    else if (event?.type === 'capture') stop = gateFailure(event.gate, clock);
    if (stop) sealWindow(w, stop, clock);
    else if (event?.type === 'capture') {
        const p = event.packet;
        if (!validPacket(p, w) || p.observedTick !== clock.tick || p.observedAtMs !== clock.nowMs) return unchanged('invalid_packet');
        if (w.capture.lastCommittedTick !== null && p.observedTick <= w.capture.lastCommittedTick) {
            const old = w.rows.find(row => row.observedTick === p.observedTick);
            if (homeEqual(old, p)) return unchanged('duplicate_packet');
            flag(w, 'conflict');
        } else {
            if (p.observedTick !== (w.capture.lastCommittedTick ?? w.bounds.acceptedAtTick - 1) + 1) flag(w, 'gap');
            if (!p.coverage.complete) flag(w, 'partial');
            w.rows.push(homeCopy(p)); w.capture.lastCommittedTick = p.observedTick; w.capture.lastNowMs = clock.nowMs;
            if (p.observedTick === w.bounds.lastAllowedTick) sealWindow(w, 'complete', clock);
        }
    } else return unchanged('invalid_event');
    w.capture.revision++;
    if (JSON.stringify(store).length > HOME_EVIDENCE_LIMITS.storeChars - HOME_EVIDENCE_LIMITS.commitReserveChars) {
        const fallback = homeCopy(input); flag(fallback.window, 'capacity'); sealWindow(fallback.window, 'capacity', clock);
        fallback.window.capture.revision++;
        return validHomeEvidenceStore(fallback) ? {store: fallback, changed: true, reason: 'capacity'} : unchanged('capacity');
    }
    return validHomeEvidenceStore(store) ? {store, changed: true, reason: stop} : unchanged('invalid_packet');
}
