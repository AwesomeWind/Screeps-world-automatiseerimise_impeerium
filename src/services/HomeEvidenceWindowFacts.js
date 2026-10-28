import {HOME_EVIDENCE_PROFILE as PROFILE, HOME_EVIDENCE_LIMITS as LIMITS, HOME_ROLES,
    homeRecord as record, homeInteger as integer, homeId as id, HOME_GATE_DIAGNOSTIC_KEYS} from './HomeEvidenceWindowModel.js';
import {reconTrialPermission} from './RemoteReconTrialModel.js';
import {economicTrialPermission, economicIdentityMatches} from './RemoteEconomicTrialModel.js';
import {validNativeEconomicOpsState} from './NativeEconomicTrialOpsModel.js';

const eventCache = new WeakMap();
const bool = value => typeof value === 'boolean';
const text = (value, max = 100) => typeof value === 'string' && value.length > 0 && value.length <= max;
const checkpoint = deps => {
    if (deps.continueCapture && !deps.continueCapture()) {const error = new Error('home_cpu'); error.code = 'HOME_CPU_LIMIT'; throw error;}
};
function boundedEntries(table) {
    if (table === undefined) return [];
    if (!record(table)) return null;
    const entries = [];
    for (const key in table) if (Object.hasOwn(table, key)) {
        if (entries.length === LIMITS.candidates) return null;
        entries.push([key, table[key]]);
    }
    return entries;
}

function expiredEnvelope(request, clock) {
    return record(request) && request.schemaVersion === 1 && integer(request.expiresAtTick) &&
        integer(request.expiresAtMs) && integer(request.issuedAtMs) && request.expiresAtMs > request.issuedAtMs &&
        request.expiresAtTick < clock.tick && request.expiresAtMs < clock.nowMs;
}
function retainedReconClosed(settings, state, clock) {
    if (settings.enabled === false) return true;
    const q = settings.request, s = state?.current;
    return expiredEnvelope(q, clock) && q.action === 'release' && s?.managed === false && !!s.outcome &&
        q.targetTrialId === s.identity.trialId && q.remoteId === s.identity.remoteId && q.epoch === s.identity.epoch &&
        q.sequence === state.lastSequence && integer(s.closureVerifiedAtTick) && integer(s.closeAppliedAtTick) &&
        s.closureVerifiedAtTick > s.closeAppliedAtTick && s.closureVerifiedAtTick < clock.tick;
}
function retainedEconomicClosed(settings, state, clock) {
    if (settings.enabled === false) return true;
    const q = settings.request, s = state?.current;
    return expiredEnvelope(q, clock) && q.action === 'start' && s?.status === 'terminal' && !!s.outcome &&
        economicIdentityMatches({...q, trialId: q.id}, s.identity) && state.lastSequence >= q.sequence &&
        q.activateAtTick === s.startedAtTick && q.expiresAtTick === s.expiresAtTick &&
        q.issuedAtMs === s.issuedAtMs && q.expiresAtMs === s.expiresAtMs && q.configFingerprint === s.configFingerprint &&
        integer(s.tailExpiresAtTick) && s.tailExpiresAtTick < clock.tick && integer(s.closeAppliedAtTick) &&
        integer(s.closureVerifiedAtTick) && s.closureVerifiedAtTick > s.closeAppliedAtTick && s.closureVerifiedAtTick < clock.tick;
}

export function collectHomeObservationGate(clock, deps = {}) {
    return inspectHomeObservationGate(clock, deps).gate;
}

export function inspectHomeObservationGate(clock, deps = {}) {
    const diagnostic = Object.fromEntries(HOME_GATE_DIAGNOSTIC_KEYS.map(key => [key, null]));
    return {gate: computeHomeGate(clock, deps, diagnostic), diagnostic};
}

function computeHomeGate(clock, deps, diagnostic) {
    const game = deps.game || global.Game, memory = deps.memory || global.Memory;
    const output = {observedTick: clock.tick, known: false, closed: false, homeReady: false, reason: 'controls_unconfirmed'};
    if (game?.time !== clock.tick || game?.shard?.name !== PROFILE.shard) return output;
    const p = memory?.empire?.control?.policy, remote = p?.remoteMining;
    const values = [remote?.enabled, remote?.reconTrial?.enabled, remote?.economicTrial?.enabled,
        remote?.nativeTrialOps?.enabled, remote?.evidenceWindow?.enabled, p?.goalPlanning?.enabled,
        memory?.empire?.market?.enabled, p?.roomGovernor?.shadow, p?.scheduler?.enforce];
    diagnostic.controlTypes = values.every(bool);
    if (!diagnostic.controlTypes) return output;
    let closed = [remote.enabled, remote.nativeTrialOps.enabled, remote.evidenceWindow.enabled,
        p.goalPlanning.enabled, memory.empire.market.enabled].every(value => value === false) &&
        p.roomGovernor.shadow === true && p.scheduler.enforce === false;
    const state = memory?.empire?.remoteMining;
    try {
        if (state?.reconTrials !== undefined) {
            const session = state.reconTrials?.current;
            const permit = reconTrialPermission(state.reconTrials, {remoteId: session?.identity?.remoteId}, clock);
            if (permit.reason === 'state_invalid') return output;
            if (permit.allowOutbound || permit.allowSpawn || session?.managed === true && !session.outcome) closed = false;
        }
        if (state?.economicTrials !== undefined) {
            const session = state.economicTrials?.current;
            const permit = economicTrialPermission(state.economicTrials, {role: 'scout', action: 'outbound'}, clock);
            if (permit.reason === 'state_invalid') return output;
            if (session?.managed === true && (!session.outcome || integer(session.tailExpiresAtTick) && clock.tick <= session.tailExpiresAtTick)) closed = false;
        }
        diagnostic.nativeState = state?.nativeEconomicOps === undefined || validNativeEconomicOpsState(state.nativeEconomicOps);
        if (!diagnostic.nativeState) return output;
        diagnostic.retainedRecon = !!retainedReconClosed(remote.reconTrial, state?.reconTrials, clock);
        diagnostic.retainedEconomic = !!retainedEconomicClosed(remote.economicTrial, state?.economicTrials, clock);
        if (!diagnostic.retainedRecon || !diagnostic.retainedEconomic) closed = false;
    } catch {return output;}
    const configs = boundedEntries(memory?.empire?.remoteRooms), operations = boundedEntries(state?.operations);
    const scopes = boundedEntries(deps.scopes || global.RemoteMining);
    if (!configs || !operations || !scopes) return output;
    diagnostic.configsClosed = true;
    for (const [, raw] of configs) {
        if (!record(raw) || !bool(raw.enabled) || !bool(raw.hold)) {diagnostic.configsClosed = null; return output;}
        if (raw.enabled || !raw.hold) {closed = false; diagnostic.configsClosed = false;}
    }
    for (const [, op] of operations) {
        if (!record(op) || op.evaluatedAt !== clock.tick) {diagnostic.operationFresh = false; return output;}
    }
    diagnostic.operationFresh = true;
    for (const [key, op] of operations) {
        if ((deps.scopes || global.RemoteMining)?.[key]?.operation !== op) {diagnostic.scopeIdentity = false; return output;}
    }
    diagnostic.scopeIdentity = true;
    diagnostic.scopeClosed = true;
    for (const [key, op] of operations) {
        const scope = (deps.scopes || global.RemoteMining)?.[key];
        if (!bool(op.allowRecon) || !bool(op.allowEconomicDeparture) ||
            !bool(scope?.state?.allowRecon) || !bool(scope?.state?.allowEconomicDeparture)) {diagnostic.scopeClosed = null; return output;}
        if (op.allowRecon || op.allowEconomicDeparture || scope.state.allowRecon || scope.state.allowEconomicDeparture) {
            closed = false; diagnostic.scopeClosed = false;
        }
    }
    if (scopes.some(([key]) => !operations.some(([opKey]) => opKey === key))) {diagnostic.scopeIdentity = false; return output;}
    // A configured scope with no current evaluation is unknown, not a fabricated closed scope.
    if (configs.some(([room, raw]) => !operations.some(([key]) => key === raw.baseRoom + ':' + room))) {diagnostic.operationFresh = false; return output;}
    output.known = true; output.closed = closed;
    if (!closed) {output.reason = 'controls_open'; return output;}
    const home = game.rooms?.[PROFILE.roomName];
    diagnostic.homeOwned = !!home && home.controller?.my === true;
    if (!diagnostic.homeOwned) {output.reason = 'home_unavailable'; return output;}
    try {
        const hostiles = home.find(global.FIND_HOSTILE_CREEPS);
        if (!Array.isArray(hostiles)) return {...output, known: false, reason: 'controls_unconfirmed'};
        diagnostic.homeSafe = hostiles.length === 0;
        if (!diagnostic.homeSafe) {output.reason = 'home_danger'; return output;}
    } catch {return {...output, known: false, reason: 'controls_unconfirmed'};}
    diagnostic.homeNormal = (deps.phases || global.RoomPhase)?.[PROFILE.roomName]?.recovery?.mode === 'normal';
    if (!diagnostic.homeNormal) {output.reason = 'home_not_ready'; return output;}
    return {...output, homeReady: true, reason: null};
}

export function selectHomeEvidenceObjects(clock, deps = {}) {
    return inspectHomeEvidenceSelection(clock, deps).selection;
}

export function inspectHomeEvidenceSelection(clock, deps = {}) {
    const diagnostic = {visited: 0, eligibleRoles: null, cohortCount: null, objectCount: null, reason: null};
    const selection = computeHomeSelection(clock, deps, diagnostic);
    diagnostic.reason = selection.reason;
    return {selection, diagnostic};
}

function computeHomeSelection(clock, deps, diagnostic) {
    const game = deps.game || global.Game, memory = deps.memory || global.Memory;
    const rejected = reason => ({cohort: [], objectIds: [], complete: false, reason});
    if (game?.time !== clock.tick || !record(game.creeps)) return rejected('invalid_selection');
    let checked = 0;
    const visit = () => {checkpoint(deps); diagnostic.visited = ++checked; if (checked > LIMITS.candidates) throw new Error('candidate_limit');};
    try {
        const candidates = [];
        for (const name in game.creeps) if (Object.hasOwn(game.creeps, name)) {
            visit(); const c = game.creeps[name], role = memory?.creeps?.[name]?.role;
            if (c?.my === true && !c.spawning && c.pos?.roomName === PROFILE.roomName && id(c.id) && text(c.name) && HOME_ROLES.includes(role)) {
                candidates.push({id: c.id, name: c.name, role});
            }
        }
        const cohort = [];
        diagnostic.eligibleRoles = candidates.length;
        for (const role of HOME_ROLES) {
            const first = candidates.filter(c => c.role === role).sort((a, b) => a.id.localeCompare(b.id))[0];
            if (first && cohort.length < LIMITS.cohort) cohort.push(first);
        }
        diagnostic.cohortCount = cohort.length;
        if (!cohort.length) return rejected('no_cohort');
        const objectIds = cohort.map(c => c.id), home = game.rooms?.[PROFILE.roomName];
        const add = object => {
            if (object?.pos?.roomName === PROFILE.roomName && id(object.id) && !objectIds.includes(object.id) && objectIds.length < LIMITS.objects) objectIds.push(object.id);
        };
        const sources = home?.find(global.FIND_SOURCES);
        if (!Array.isArray(sources)) return rejected('invalid_selection');
        const sourceList = [];
        for (const source of sources) {visit(); if (id(source?.id)) sourceList.push(source);}
        sourceList.sort((a, b) => a.id.localeCompare(b.id)).forEach(add);
        add(home.storage); add(home.terminal);
        for (const c of cohort) {
            const targetId = memory?.creeps?.[c.name]?.task?.targetId;
            if (id(targetId)) {visit(); add(game.getObjectById(targetId));}
        }
        const structures = home.find(global.FIND_STRUCTURES), containers = [];
        if (!Array.isArray(structures)) return rejected('invalid_selection');
        for (const object of structures) {visit(); if (object?.structureType === 'container' && id(object.id)) containers.push(object);}
        containers.sort((a, b) => a.id.localeCompare(b.id)).forEach(add);
        diagnostic.objectCount = objectIds.length;
        return {cohort, objectIds, complete: true, reason: null};
    } catch (error) {
        if (error.code === 'HOME_CPU_LIMIT') throw error;
        return rejected(error.message === 'candidate_limit' ? 'candidate_limit' : 'invalid_selection');
    }
}

function eventsFor(room, tick, deps) {
    const previous = eventCache.get(room);
    if (previous?.tick === tick && previous.reader === deps.readEvents) {
        if (previous.failed) throw new Error('event_read_failed');
        return previous.value;
    }
    try {
        const value = deps.readEvents ? deps.readEvents(room) : room.getEventLog?.();
        eventCache.set(room, {tick, reader: deps.readEvents, value, failed: false});
        return value;
    } catch {
        eventCache.set(room, {tick, reader: deps.readEvents, failed: true});
        throw new Error('event_read_failed');
    }
}
const readCpu = deps => deps.readCpu ? deps.readCpu() : {used: global.Game?.cpu?.getUsed(), tickLimit: global.Game?.cpu?.tickLimit, bucket: global.Game?.cpu?.bucket};
const finite = value => Number.isFinite(value) && value >= 0;
export function collectHomeEvidencePacket(window, clock, deps = {}) {
    checkpoint(deps);
    const game = deps.game || global.Game, memory = deps.memory || global.Memory, start = readCpu(deps);
    const reasons = [];
    const note = reason => {if (!reasons.includes(reason)) reasons.push(reason);};
    const objects = {};
    for (const objectId of window.header.objectIds) {
        checkpoint(deps);
        const object = game.getObjectById(objectId), member = window.header.cohort.find(c => c.id === objectId);
        const role = object?.name ? memory?.creeps?.[object.name]?.role : null;
        const missing = {id: objectId, exists: object ? null : false, kind: null, role: null, my: null, pos: null, energy: null};
        if (!object || object.id !== objectId || object.pos?.roomName !== PROFILE.roomName ||
            member && (object.name !== member.name || role !== member.role || object.my !== true)) {
            objects[objectId] = missing; note(member && object ? 'identity' : 'objects_missing'); continue;
        }
        const p = object.pos;
        const point = integer(p.x) && p.x <= 49 && integer(p.y) && p.y <= 49 ? {x: p.x, y: p.y, roomName: p.roomName} : null;
        const kind = object.structureType || (object.energyCapacity !== undefined ? 'source' : object.name ? 'creep' : null);
        const value = kind === 'source' ? object.energy : object.store?.energy;
        objects[objectId] = {id: objectId, exists: true, kind: text(kind, 32) ? kind : null,
            role: text(role, 32) ? role : null, my: bool(object.my) ? object.my : null, pos: point, energy: integer(value) ? value : null};
        if (!point || !integer(value)) note('objects_missing');
    }
    const api = {methodSupported: null, shapeValid: null, nativeCount: null, semantics: deps.simulatedEvents === true ? 'simulated' : 'unverified'};
    const events = [], otherEventCounts = {};
    const home = game.rooms?.[PROFILE.roomName];
    checkpoint(deps);
    try {
        const log = home ? eventsFor(home, clock.tick, deps) : undefined;
        checkpoint(deps);
        api.methodSupported = log !== undefined;
        if (log === undefined) note('unsupported');
        else if (!Array.isArray(log)) {api.shapeValid = false; note('events_invalid');}
        else {
            api.shapeValid = true; api.nativeCount = log.length;
            if (log.length > LIMITS.nativeEvents) note('events_overflow');
            for (let index = 0; index < Math.min(log.length, LIMITS.nativeEvents); index++) {
                checkpoint(deps);
                const raw = log[index], data = raw?.data;
                if (!integer(raw?.event) || raw.event < 1 || raw.event > 99 || !id(raw.objectId)) {note('events_invalid'); continue;}
                if ([5, 12].includes(raw.event) && (!id(data?.targetId) || !integer(data?.amount) || data.amount <= 0 ||
                    raw.event === 12 && !text(data?.resourceType, 32))) note('events_invalid');
                const relevant = window.header.objectIds.includes(raw.objectId) || window.header.objectIds.includes(data?.targetId);
                if (!relevant) {
                    const key = raw.event <= 31 ? raw.event : 'other';
                    otherEventCounts[key] = (otherEventCounts[key] || 0) + 1; continue;
                }
                const resource = text(data?.resourceType, 32) ? data.resourceType : null;
                const target = id(data?.targetId) ? data.targetId : null;
                const amount = integer(data?.amount) && data.amount > 0 ? data.amount : null;
                if ([5, 12].includes(raw.event) && (!target || amount === null || raw.event === 12 && resource === null)) note('events_invalid');
                if (events.length === LIMITS.events) {note('events_overflow'); continue;}
                events.push({roomName: PROFILE.roomName, index, event: raw.event, objectId: raw.objectId,
                    targetId: target, resourceType: resource, amount});
            }
        }
    } catch (error) {
        if (error.code === 'HOME_CPU_LIMIT') throw error;
        api.shapeValid = false; note('events_invalid');
    }
    checkpoint(deps);
    const end = readCpu(deps);
    const captureCpu = finite(start?.used) && finite(end?.used) && end.used >= start.used ? end.used - start.used : null;
    if (captureCpu === null || captureCpu >= 2 || !finite(end?.tickLimit) || end.tickLimit - end.used < 5 || !(end.bucket >= 5000)) note('cpu_skipped');
    return {windowId: window.header.windowId, codeVersion: clock.codeVersion, observedTick: clock.tick,
        declaredEventTick: clock.tick - 1, observedAtMs: clock.nowMs, objects, events, otherEventCounts, api,
        cpu: {usedBefore: finite(start?.used) ? start.used : null, tickLimit: finite(start?.tickLimit) ? start.tickLimit : null,
            bucket: finite(start?.bucket) ? start.bucket : null, captureCpu}, coverage: {complete: reasons.length === 0, reasons}};
}
