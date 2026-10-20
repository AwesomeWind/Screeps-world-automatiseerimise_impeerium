import { dangerContextForStop, beginDangerEvidence, finishDangerEvidence,
    normalizeDangerActor, dangerEvidenceSummary, resolveDangerEvidencePolicy } from './RemoteDangerEvidenceModel.js';

function dependencies(overrides) {
    return {
        readStore: () => Memory.empire.remoteMining?.dangerEvidence,
        writeStore: value => { Memory.empire.remoteMining.dangerEvidence = value; },
        readRoom: name => Game.rooms[name],
        readActors: room => room.find(FIND_HOSTILE_CREEPS),
        readCpu: () => ({ used: Game.cpu.getUsed(), tickLimit: Game.cpu.tickLimit }),
        readPolicy: () => Memory.empire.control.policy.remoteMining.dangerEvidence,
        readClock: () => ({ tick: Game.time, nowMs: Date.now(), codeVersion: global.EmpireServicesVersion }),
        normalizeActor: normalizeDangerActor,
        ...overrides
    };
}

function cpuSample(deps) {
    try {
        const value = deps.readCpu();
        return value && Number.isFinite(value.used) && value.used >= 0 &&
            Number.isFinite(value.tickLimit) && value.tickLimit >= 0 ? value : null;
    } catch { return null; }
}

function actorFacts(actor) {
    const fieldErrors = [];
    const read = (field, getter) => {
        try { return getter(); }
        catch { fieldErrors.push(field); return null; }
    };
    const facts = {
        id: read('id', () => actor.id), name: read('name', () => actor.name),
        ownerUsername: read('ownerUsername', () => actor.owner?.username),
        pos: read('pos', () => { const pos = actor.pos; return pos && { x: pos.x, y: pos.y, roomName: pos.roomName }; }),
        bodyFacts: null, fieldErrors
    };
    facts.bodyFacts = read('body', () => {
        const body = actor.body;
        if (!Array.isArray(body)) return null;
        const result = { length: body.length, parts: [], readComplete: body.length <= 50 };
        for (let index = 0; index < Math.min(50, body.length); index++) {
            try {
                const part = body[index];
                result.parts.push({ type: part.type, hits: part.hits, boost: part.boost });
            } catch { result.readComplete = false; break; }
        }
        return result;
    });
    return facts;
}

function emptyCapture(status, reason) {
    return { captureStatus: status, captureReason: reason, capturedAtTick: null,
        capturedAtMs: null, visibilityAtCapture: null, hostileCount: null, actors: [] };
}

function collectCapture(context, deps) {
    let resolved;
    try { resolved = resolveDangerEvidencePolicy(deps.readPolicy()); }
    catch { return emptyCapture('failed', 'invalid_policy'); }
    if (!resolved.valid) return emptyCapture('failed', 'invalid_policy');
    const cpu = cpuSample(deps);
    if (!cpu) return emptyCapture('skipped_cpu', 'cpu_unavailable');
    const policy = resolved.policy;
    if (cpu.tickLimit - cpu.used < policy.reserveCpu || policy.maxCaptureCpu === 0) return emptyCapture('skipped_cpu', 'cpu_budget');
    const clock = deps.readClock();
    if (!clock || clock.tick !== context.decidedAtTick || !Number.isSafeInteger(clock.nowMs) || clock.nowMs < 0) {
        return emptyCapture('unavailable', 'time_mismatch');
    }
    const room = deps.readRoom(context.observedRoom);
    if (!room) return { ...emptyCapture('unavailable', 'not_visible'), visibilityAtCapture: 'not_visible' };
    const actors = deps.readActors(room);
    if (!Array.isArray(actors)) return emptyCapture('failed', 'read_failed');
    const capture = { captureStatus: 'captured', captureReason: null, capturedAtTick: clock.tick,
        capturedAtMs: clock.nowMs, visibilityAtCapture: 'visible', hostileCount: actors.length, actors: [] };
    for (let index = 0; index < Math.min(10, actors.length); index++) {
        const used = cpuSample(deps);
        if (!used || used.used - cpu.used >= policy.maxCaptureCpu) {
            capture.captureStatus = 'partial';
            capture.captureReason = used ? 'cpu_budget' : 'cpu_unavailable';
            break;
        }
        let normalized;
        try { normalized = deps.normalizeActor(actorFacts(actors[index])); }
        catch { capture.captureStatus = 'failed'; capture.captureReason = 'normalize_failed'; break; }
        capture.actors.push(normalized.actor);
        if (normalized.partial) {
            capture.captureStatus = 'partial'; capture.captureReason = 'field_unavailable';
        }
    }
    return capture;
}

function result(key, persisted, captureStatus, captureReason, attempted = true) {
    return { attempted, persisted, key, captureStatus, captureReason };
}

export function recordStoppedTrialDanger(transition, overrides = {}) {
    let key = null;
    try {
        const context = dangerContextForStop(transition.before, transition.after, transition.clock);
        if (!context) return result(null, false, null, 'not_applicable', false);
        const deps = dependencies(overrides);
        const begun = beginDangerEvidence(deps.readStore(), context);
        key = begun.key;
        if (!begun.claimed) return result(key, false, null, begun.reason, false);
        try { deps.writeStore(begun.next); }
        catch { return result(key, false, null, 'write_failed'); }
        let capture;
        try { capture = collectCapture(context, deps); }
        catch { capture = emptyCapture('failed', 'read_failed'); }
        let finished;
        try { finished = finishDangerEvidence(begun.next, key, capture, transition.clock); }
        catch { finished = { applied: false }; }
        if (!finished.applied) finished = finishDangerEvidence(begun.next, key,
            emptyCapture('failed', 'normalize_failed'), transition.clock);
        if (!finished.applied) return result(key, false, 'pending', 'normalize_failed');
        try {
            deps.writeStore(finished.next);
            return result(key, true, finished.next.records[0].captureStatus, finished.next.records[0].captureReason);
        } catch {
            // A writer may commit and then throw. Never overwrite a terminal
            // record until a bounded readback proves this key is still pending.
            const stored = deps.readStore();
            const summary = dangerEvidenceSummary(stored, context, transition.clock.tick, 100);
            if (summary.rawCaptureStatus && summary.rawCaptureStatus !== 'pending') {
                return result(key, true, summary.rawCaptureStatus, summary.captureReason);
            }
            if (summary.rawCaptureStatus !== 'pending') return result(key, false, null, 'write_failed');
            const failure = finishDangerEvidence(stored, key, emptyCapture('failed', 'write_failed'), transition.clock);
            if (failure.applied) {
                try { deps.writeStore(failure.next); return result(key, true, 'failed', 'write_failed'); }
                catch { /* Pending remains as an interrupted marker; no retry. */ }
            }
            return result(key, false, 'pending', 'write_failed');
        }
    } catch { return result(key, false, null, 'capture_failed'); }
}

export function readTrialDangerEvidence({ state, clock }, overrides = {}) {
    if (!state?.current && !state?.previous) return null;
    try {
        const deps = dependencies(overrides);
        const store = deps.readStore();
        const ttl = overrides.intelTtl === undefined ?
            globalThis.Memory?.empire?.control?.policy?.remoteMining?.intelTtl : overrides.intelTtl;
        const summarize = session => {
            if (!session) return null;
            const reference = session.outcome ? { identity: session.identity,
                decidedAtTick: session.outcome.decidedAtTick, stopReason: session.outcome.stopReason } : null;
            return dangerEvidenceSummary(store, reference, clock.tick, ttl);
        };
        return { current: summarize(state.current), previous: summarize(state.previous) };
    } catch {
        const failed = () => ({ effectiveStatus: 'read_failed', historical: true });
        return { current: state.current ? failed() : null, previous: state.previous ? failed() : null };
    }
}
