import { DEFAULT_REMOTE_DANGER_EVIDENCE_POLICY } from '../config/EmpirePolicy.js';

const PARTS = ['move', 'work', 'carry', 'attack', 'ranged_attack', 'heal', 'tough', 'claim'];
const FIELDS = ['id', 'name', 'ownerUsername', 'pos', 'body'];
const STATUSES = ['pending', 'captured', 'partial', 'unavailable', 'failed', 'skipped_cpu'];
const REASONS = [null, 'field_unavailable', 'field_truncated', 'body_unavailable', 'body_invalid',
    'actor_limit', 'size_limit', 'count_conflict', 'not_visible', 'time_mismatch', 'read_failed',
    'normalize_failed', 'write_failed', 'cpu_budget', 'cpu_unavailable', 'invalid_policy', 'capture_failed'];
const IDENTITY_KEYS = ['trialId', 'sequence', 'remoteId', 'epoch', 'codeVersion'];
const CONTEXT_KEYS = ['identity', 'baseRoom', 'targetRoom', 'observedRoom', 'decidedAtTick',
    'decisionAtMs', 'stopReason', 'detection'];
const RECORD_KEYS = [...CONTEXT_KEYS, 'key', 'captureStatus', 'captureReason', 'capturedAtTick',
    'capturedAtMs', 'visibilityAtCapture', 'hostileCount', 'actors', 'actorsOmitted', 'truncated'];
const ACTOR_KEYS = ['id', 'name', 'ownerUsername', 'pos', 'activeParts', 'bodyStatus',
    'bodyLength', 'hasBoosts', 'missingFields', 'textTruncated'];
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 100;
const keysOnly = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key));
const clone = value => JSON.parse(JSON.stringify(value));
const nullableInteger = value => value === null || integer(value);

export const DANGER_EVIDENCE_LIMITS = Object.freeze({ records: 2, actors: 10, parts: 50,
    text: 100, recordLength: 12000, storeLength: 25000, summaryLength: 1500 });

export function resolveDangerEvidencePolicy(raw) {
    if (raw !== undefined && !record(raw)) return { valid: false, reason: 'invalid_policy' };
    const policy = {};
    for (const [key, fallback] of Object.entries(DEFAULT_REMOTE_DANGER_EVIDENCE_POLICY)) {
        const value = raw?.[key] === undefined ? fallback : raw[key];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return { valid: false, reason: 'invalid_policy' };
        policy[key] = value;
    }
    return { valid: true, policy, reason: null };
}

function identityValid(identity) {
    return keysOnly(identity, IDENTITY_KEYS) && text(identity.trialId) && identity.trialId.length <= 64 &&
        integer(identity.sequence) && identity.sequence >= 1 && text(identity.remoteId) &&
        integer(identity.epoch) && text(identity.codeVersion);
}

function contextValid(context) {
    return record(context) && identityValid(context.identity) && text(context.baseRoom) && text(context.targetRoom) &&
        context.baseRoom !== context.targetRoom && context.identity.remoteId === `${context.baseRoom}:${context.targetRoom}` &&
        ['danger', 'home_danger'].includes(context.stopReason) &&
        context.observedRoom === (context.stopReason === 'danger' ? context.targetRoom : context.baseRoom) &&
        integer(context.decidedAtTick) && integer(context.decisionAtMs) && context.detection === 'non_owned_creep';
}

function eventKey(reference) {
    const id = reference?.identity;
    if (!identityValid(id) || !integer(reference.decidedAtTick) || !['danger', 'home_danger'].includes(reference.stopReason)) return null;
    return JSON.stringify([id.trialId, id.sequence, id.remoteId, id.epoch, id.codeVersion,
        reference.decidedAtTick, reference.stopReason]);
}

function positionValid(pos) {
    return keysOnly(pos, ['x', 'y', 'roomName']) && integer(pos.x) && pos.x <= 49 &&
        integer(pos.y) && pos.y <= 49 && text(pos.roomName);
}

function actorValid(actor) {
    return keysOnly(actor, ACTOR_KEYS) && ['id', 'name', 'ownerUsername'].every(key => actor[key] === null || text(actor[key])) &&
        (actor.pos === null || positionValid(actor.pos)) && ['known', 'partial', 'unavailable'].includes(actor.bodyStatus) &&
        nullableInteger(actor.bodyLength) && (actor.hasBoosts === null || typeof actor.hasBoosts === 'boolean') &&
        typeof actor.textTruncated === 'boolean' && Array.isArray(actor.missingFields) && actor.missingFields.length <= FIELDS.length &&
        actor.missingFields.every(field => FIELDS.includes(field)) &&
        (actor.activeParts === null || keysOnly(actor.activeParts, PARTS) &&
            PARTS.every(type => integer(actor.activeParts[type]) && actor.activeParts[type] <= 50)) &&
        (actor.bodyStatus !== 'known' || integer(actor.bodyLength) && actor.bodyLength <= 50 && actor.activeParts !== null &&
            PARTS.reduce((count, part) => count + actor.activeParts[part], 0) <= actor.bodyLength &&
            typeof actor.hasBoosts === 'boolean');
}

function evidenceValid(value) {
    if (!keysOnly(value, RECORD_KEYS) || !contextValid(value) || eventKey(value) !== value.key ||
        !STATUSES.includes(value.captureStatus) || !REASONS.includes(value.captureReason) ||
        !nullableInteger(value.capturedAtTick) || !nullableInteger(value.capturedAtMs) ||
        ![null, 'visible', 'not_visible'].includes(value.visibilityAtCapture) || !nullableInteger(value.hostileCount) ||
        !nullableInteger(value.actorsOmitted) || typeof value.truncated !== 'boolean' ||
        !Array.isArray(value.actors) || value.actors.length > 10 || !value.actors.every(actorValid)) return false;
    if (value.actors.some(actor => actor.pos && actor.pos.roomName !== value.observedRoom)) return false;
    if (value.capturedAtTick !== null && value.capturedAtTick !== value.decidedAtTick) return false;
    if (value.capturedAtMs !== null && value.capturedAtMs < value.decisionAtMs) return false;
    if (value.actorsOmitted !== (value.hostileCount === null ? null : Math.max(0, value.hostileCount - value.actors.length))) return false;
    if (value.captureStatus === 'captured' && (value.visibilityAtCapture !== 'visible' ||
        value.capturedAtTick === null || value.capturedAtMs === null || value.hostileCount === null ||
        value.hostileCount === 0 || value.hostileCount !== value.actors.length || value.truncated ||
        value.captureReason !== null || value.actors.some(actor => actor.missingFields.length || actor.textTruncated ||
            !actor.id || !actor.name || !actor.ownerUsername || !actor.pos || actor.bodyStatus !== 'known'))) return false;
    if (value.captureStatus === 'pending' && (value.actors.length || value.capturedAtTick !== null || value.hostileCount !== null)) return false;
    return JSON.stringify(value).length <= DANGER_EVIDENCE_LIMITS.recordLength;
}

function storeError(store) {
    if (store === undefined) return null;
    if (!record(store) || store.schemaVersion !== 1) return 'schema_unknown';
    if (!keysOnly(store, ['schemaVersion', 'records']) || !Array.isArray(store.records) || store.records.length > 2 ||
        !store.records.every(evidenceValid) || new Set(store.records.map(item => item.key)).size !== store.records.length) return 'store_invalid';
    return JSON.stringify(store).length <= DANGER_EVIDENCE_LIMITS.storeLength ? null : 'store_invalid';
}

export function dangerContextForStop(before, after, clock) {
    if (before?.outcome || !after?.outcome || after.outcome.decidedAtTick !== clock?.tick ||
        after.identity?.codeVersion !== clock?.codeVersion) return null;
    const context = { identity: after.identity, baseRoom: after.baseRoom, targetRoom: after.targetRoom,
        observedRoom: after.outcome.stopReason === 'home_danger' ? after.baseRoom : after.targetRoom,
        decidedAtTick: after.outcome.decidedAtTick, decisionAtMs: clock.nowMs,
        stopReason: after.outcome.stopReason, detection: 'non_owned_creep' };
    return contextValid(context) ? clone(context) : null;
}

function pendingRecord(context) {
    return { ...clone(context), key: eventKey(context), captureStatus: 'pending', captureReason: null,
        capturedAtTick: null, capturedAtMs: null, visibilityAtCapture: null, hostileCount: null,
        actors: [], actorsOmitted: null, truncated: false };
}

export function beginDangerEvidence(store, context) {
    const reason = storeError(store);
    if (reason || !contextValid(context)) return { next: store, claimed: false, key: null, reason: reason || 'context_invalid' };
    const item = pendingRecord(context);
    if (store?.records.some(record => record.key === item.key)) return { next: store, claimed: false, key: item.key, reason: 'duplicate' };
    if (!evidenceValid(item)) return { next: store, claimed: false, key: item.key, reason: 'metadata_limit' };
    const next = { schemaVersion: 1, records: [item, ...(store?.records.slice(0, 1) || [])] };
    return storeError(next) ? { next: store, claimed: false, key: item.key, reason: 'store_invalid' } :
        { next, claimed: true, key: item.key, reason: null };
}

export function normalizeDangerActor(facts) {
    const missing = new Set((Array.isArray(facts.fieldErrors) ? facts.fieldErrors : []).filter(field => FIELDS.includes(field)));
    let textTruncated = false;
    const actor = {};
    for (const field of ['id', 'name', 'ownerUsername']) {
        const value = facts[field];
        actor[field] = typeof value === 'string' && value.length ? value.slice(0, 100) : null;
        if (actor[field] === null) missing.add(field);
        if (typeof value === 'string' && value.length > 100) textTruncated = true;
    }
    actor.pos = positionValid(facts.pos) ? { ...facts.pos } : null;
    if (!actor.pos) missing.add('pos');
    const body = facts.bodyFacts;
    const parts = Array.isArray(body?.parts) ? body.parts.slice(0, 50) : [];
    const known = integer(body?.length) && body.length <= 50 && body.readComplete === true &&
        parts.length === body.length && parts.every(part => record(part) && PARTS.includes(part.type) &&
            Number.isFinite(part.hits) && part.hits >= 0 && part.hits <= 100 &&
            (part.boost === undefined || part.boost === null || text(part.boost)));
    actor.activeParts = known ? Object.fromEntries(PARTS.map(type => [type,
        parts.filter(part => part.type === type && part.hits > 0).length])) : null;
    actor.bodyStatus = known ? 'known' : body ? 'partial' : 'unavailable';
    actor.bodyLength = integer(body?.length) ? body.length : null;
    actor.hasBoosts = known ? parts.some(part => !!part.boost) :
        parts.some(part => typeof part.boost === 'string' && part.boost.length > 0) ? true : null;
    if (!known) missing.add('body');
    actor.missingFields = [...missing];
    actor.textTruncated = textTruncated;
    return { actor, partial: missing.size > 0 || textTruncated };
}

export function finishDangerEvidence(store, key, capture, clock) {
    const reason = storeError(store);
    const original = !reason && store?.records.find(item => item.key === key);
    if (!original || original.captureStatus !== 'pending' || clock?.tick !== original.decidedAtTick) {
        return { next: store, applied: false, reason: reason || 'capture_not_pending' };
    }
    const item = { ...original, captureStatus: capture.captureStatus, captureReason: capture.captureReason ?? null,
        capturedAtTick: capture.capturedAtTick ?? null, capturedAtMs: capture.capturedAtMs ?? null,
        visibilityAtCapture: capture.visibilityAtCapture ?? null,
        hostileCount: integer(capture.hostileCount) ? capture.hostileCount : null,
        actors: [], actorsOmitted: null, truncated: false };
    const source = Array.isArray(capture.actors) ? capture.actors : [];
    item.actors = source.slice(0, 10).filter(actorValid).map(clone).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const partial = source.length !== item.actors.length || item.actors.some(actor => actor.missingFields.length || actor.textTruncated);
    if (partial && item.captureStatus === 'captured') { item.captureStatus = 'partial'; item.captureReason = 'field_unavailable'; }
    if (item.hostileCount === 0 || item.hostileCount !== null && item.hostileCount < source.length) {
        item.captureStatus = 'partial'; item.captureReason = 'count_conflict';
    } else if (item.hostileCount !== null && item.hostileCount > item.actors.length) {
        item.truncated = true;
        if (item.captureStatus === 'captured') { item.captureStatus = 'partial'; item.captureReason = 'actor_limit'; }
    }
    item.actorsOmitted = item.hostileCount === null ? null : Math.max(0, item.hostileCount - item.actors.length);
    while (JSON.stringify(item).length > 12000 && item.actors.length) {
        item.actors.pop(); item.captureStatus = 'partial'; item.captureReason = 'size_limit'; item.truncated = true;
        item.actorsOmitted = item.hostileCount === null ? null : Math.max(0, item.hostileCount - item.actors.length);
    }
    if (!evidenceValid(item)) return { next: store, applied: false, reason: 'capture_invalid' };
    const next = { schemaVersion: 1, records: store.records.map(record => record.key === key ? item : clone(record)) };
    return storeError(next) ? { next: store, applied: false, reason: 'store_invalid' } : { next, applied: true, reason: null };
}

export function dangerEvidenceSummary(store, reference, nowTick, intelTtl) {
    const error = storeError(store);
    if (error) return { effectiveStatus: error, historical: true };
    const key = reference && eventKey(reference);
    const item = key && store?.records.find(record => record.key === key);
    if (!item) return { effectiveStatus: 'not_recorded', historical: true };
    const ageTicks = integer(nowTick) && nowTick >= item.decidedAtTick ? nowTick - (item.capturedAtTick ?? item.decidedAtTick) : null;
    const summary = { key: item.key, rawCaptureStatus: item.captureStatus,
        effectiveStatus: item.captureStatus === 'pending' && ageTicks > 0 ? 'interrupted' : item.captureStatus,
        captureReason: item.captureReason, observedRoom: item.observedRoom, decidedAtTick: item.decidedAtTick,
        capturedAtTick: item.capturedAtTick, hostileCount: item.hostileCount, capturedCount: item.actors.length,
        actorsOmitted: item.actorsOmitted, truncated: item.truncated, historical: true, ageTicks,
        stale: ageTicks === null || !integer(intelTtl) || ageTicks > intelTtl };
    return JSON.stringify(summary).length <= 1500 ? summary : { effectiveStatus: 'summary_oversize', historical: true };
}
