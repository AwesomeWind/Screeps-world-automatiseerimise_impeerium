import {validHomeEvidenceStore, HOME_EVIDENCE_LIMITS as LIMITS, homeInteger as integer, homeCopy as copy} from './HomeEvidenceWindowModel.js';

const blockingReasons = ['events_overflow', 'events_invalid', 'unsupported', 'cpu_skipped', 'identity', 'write_unknown', 'conflict'];
const bounded = value => JSON.stringify(value).length <= LIMITS.pageChars ? value : {error: 'output_too_large'};
function locate(store) {
    if (store === undefined) return {error: 'missing_window'};
    if (!validHomeEvidenceStore(store)) return {error: 'corrupt'};
    // Root pending contains a candidate, never an acknowledged window transition.
    const window = store.window && store.pending ? {...store.window,
        pending: {key: store.pending.key, stage: 'capture', tick: store.pending.tick}} : store.window;
    return {window};
}
function admissionHeader(store) {
    const a = store.admission, q = a.request, w = store.window;
    const phase = store.pending ? 'unknown' : a.status === 'reserved' ? 'interrupted' :
        a.status !== 'accepted' ? a.status : !w.rows.length ? 'accepted_no_row' : w.capture.phase;
    return {schemaVersion: 2, profile: store.profile, windowId: q.id, codeVersion: q.codeVersion,
        shard: q.shard, roomName: q.roomName, phase, admission: copy(a), pending: copy(store.pending ?? null),
        admissionPersisted: a.status === 'accepted' && !store.pending,
        // A first row proves the service passed admission readback before reading
        // events. An empty final candidate alone does not prove that checkpoint.
        admissionConfirmed: a.status === 'accepted' && !store.pending && w.rows.length > 0,
        ...(!w ? {coverage: {rows: null, partial: true, fullHundredTicks: false}} : {})};
}
function diagnosticReport(store) {
    return {...admissionHeader(store), economicAcceptance: 'not_performed', productionSemantics: 'unverified',
        method: {status: 'missing'}, shape: {status: 'missing'},
        harvest: {status: 'missing', observedEvents: null, consistentObservations: 0, observedAmount: null},
        transfer: {status: 'missing', observedEvents: null, consistentObservations: 0, observedAmount: null},
        cpu: {hardLimitVerified: false}, persistence: {pending: !!store.pending, actualGlobalResetVerified: false},
        memory: {serializedChars: JSON.stringify(store).length, charLimit: LIMITS.storeChars}};
}
function coverage(w) {
    let gaps = 0, previous = w.bounds.acceptedAtTick - 1;
    for (const row of w.rows) {
        gaps += row.observedTick - previous - 1;
        previous = row.observedTick;
    }
    const contiguous = w.rows.length > 0 && gaps === 0;
    return {fromTick: w.rows[0]?.observedTick ?? null, toTick: w.rows.at(-1)?.observedTick ?? null,
        rows: w.rows.length, missingWithinObservedInterval: gaps, contiguousFromStart: contiguous,
        partial: w.capture.partial || !!w.pending || w.rows.some(row => !row.coverage.complete),
        fullHundredTicks: contiguous && w.rows.length === 100 && !w.capture.partial && !w.pending && w.rows.every(row => row.coverage.complete),
        expectedEndTick: w.bounds.lastAllowedTick, firstRowHasPriorSnapshot: false};
}
function header(w) {
    return {schemaVersion: 1, profile: 'home_natural_v1', windowId: w.header.windowId, codeVersion: w.header.codeVersion,
        shard: w.header.shard, roomName: w.header.roomName, revision: w.capture.revision, phase: w.capture.phase,
        bounds: copy(w.bounds), pending: copy(w.pending ?? null), seal: copy(w.seal), coverage: coverage(w)};
}
const rowUsable = row => row.api.methodSupported === true && row.api.shapeValid === true &&
    integer(row.api.nativeCount) && row.api.nativeCount <= 128 &&
    row.api.nativeCount === row.events.length + Object.values(row.otherEventCounts).reduce((sum, count) => sum + count, 0) &&
    !row.coverage.reasons.some(reason => blockingReasons.includes(reason)) &&
    [row.cpu.usedBefore, row.cpu.tickLimit, row.cpu.bucket, row.cpu.captureCpu].every(Number.isFinite) &&
    row.cpu.usedBefore >= 0 && row.cpu.bucket >= 5000 && row.cpu.captureCpu >= 0 && row.cpu.captureCpu < 2 &&
    row.cpu.tickLimit - row.cpu.usedBefore - row.cpu.captureCpu >= 5;

function pairDirection(before, after, event, window) {
    if (!before) return {reason: 'no_prior_snapshot'};
    if (!integer(event.amount) || event.amount <= 0 || !event.targetId) return {reason: 'event_fields_invalid'};
    if (before.observedTick + 1 !== after.observedTick || after.declaredEventTick !== before.observedTick) return {reason: 'tick_gap'};
    if (!rowUsable(before) || !rowUsable(after)) return {reason: 'row_incomplete'};
    const member = window.header.cohort.find(c => c.id === event.objectId);
    if (!member) return {reason: 'actor_unbound'};
    const ends = [event.objectId, event.targetId];
    const touching = after.events.filter(item => ends.some(id => item.objectId === id || item.targetId === id));
    if (touching.length !== 1) return {reason: 'concurrency'};
    for (const row of [before, after]) for (const id of ends) {
        const object = row.objects[id];
        if (!object || object.id !== id || object.exists !== true || !object.pos || !integer(object.energy)) return {reason: 'missing_endpoint'};
    }
    const actorBefore = before.objects[event.objectId], actorAfter = after.objects[event.objectId];
    if ([actorBefore, actorAfter].some(actor => actor.kind !== 'creep' || actor.my !== true || actor.role !== member.role)) return {reason: 'identity_unconfirmed'};
    const targetBefore = before.objects[event.targetId], targetAfter = after.objects[event.targetId];
    if (!targetBefore.kind || targetBefore.kind !== targetAfter.kind) return {reason: 'type_unverified'};
    const actorChange = actorAfter.energy - actorBefore.energy, targetChange = targetAfter.energy - targetBefore.energy;
    if (event.event === 5 && targetAfter.kind === 'source' && actorChange === event.amount && targetChange === -event.amount) return {direction: 'harvest'};
    if (event.event === 12) {
        if (event.resourceType !== 'energy' || targetAfter.kind === 'source') return {reason: 'type_unverified'};
        if (actorChange === -event.amount && targetChange === event.amount) return {direction: 'transfer'};
        if (actorChange === event.amount && targetChange === -event.amount) return {direction: 'withdraw', reason: 'withdraw_direction'};
    }
    return {reason: 'delta_mismatch'};
}

export function homeEvidenceStatus(store) {
    const found = locate(store);
    if (found.error) return found;
    const result = found.window ? header(found.window) : {};
    if (store.schemaVersion === 2) Object.assign(result, admissionHeader(store));
    return bounded(result);
}

export function summarizeHomeEvidence(store) {
    const found = locate(store);
    if (found.error) return found;
    if (!found.window) return bounded(diagnosticReport(store));
    const w = found.window;
    const captureSamples = w.rows.map(row => row.cpu.captureCpu).filter(Number.isFinite);
    const result = {...header(w), economicAcceptance: 'not_performed',
        productionSemantics: w.rows.some(row => row.api.semantics === 'simulated') ? 'simulated_only' : 'unverified',
        method: {status: !w.rows.length ? 'missing' : w.rows.some(row => row.api.methodSupported === true) ? 'observed' : 'unsupported'},
        shape: {status: w.rows.some(row => row.api.shapeValid === false) ? 'partial' : w.rows.some(row => row.api.shapeValid === true) ? 'observed' : 'missing'},
        harvest: {status: 'missing', observedEvents: 0, consistentObservations: 0, observedAmount: null, amountBasis: 'consistent_pairs_only', unprovedReasons: []},
        transfer: {status: 'missing', observedEvents: 0, consistentObservations: 0, observedAmount: null, amountBasis: 'consistent_pairs_only', unprovedReasons: []},
        withdrawCandidate: {status: 'unverified', observations: 0},
        cpu: {sampledTicks: w.rows.filter(row => Number.isFinite(row.cpu.captureCpu)).length,
            maxCaptureCpu: captureSamples.length ? Math.max(...captureSamples) : null,
            hardLimitVerified: false},
        memory: {serializedChars: JSON.stringify(store).length, charLimit: LIMITS.storeChars},
        persistence: {pending: !!w.pending, actualGlobalResetVerified: false}};
    // Pending rows are candidates, not acknowledged observations. Never count their amounts.
    for (let i = 0; i < w.rows.length; i++) for (const event of w.rows[i].events) {
        if (![5, 12].includes(event.event)) continue;
        const group = event.event === 5 ? result.harvest : result.transfer;
        group.observedEvents++;
        const evidence = w.pending ? {reason: 'pending_write'} :
            w.capture.flags.some(flag => ['conflict', 'write_unknown'].includes(flag)) ? {reason: 'conflict'} :
                pairDirection(w.rows[i - 1], w.rows[i], event, w);
        const {direction, reason} = evidence;
        if (reason && !group.unprovedReasons.includes(reason)) group.unprovedReasons.push(reason);
        if (direction === 'withdraw') result.withdrawCandidate.observations++;
        else if (direction) {
            group.consistentObservations++;
            if (group.consistentObservations === 1) group.observedAmount = event.amount;
            else if (group.observedAmount !== null) {
                const amount = group.observedAmount + event.amount;
                group.observedAmount = Number.isSafeInteger(amount) ? amount : null;
            }
            group.status = 'consistent_observation';
        }
    }
    for (const group of [result.harvest, result.transfer]) {
        if (group.observedEvents > 0 && group.consistentObservations === 0) group.status = 'unproved';
    }
    if (store.schemaVersion === 2) {
        Object.assign(result, admissionHeader(store));
        if (!w.rows.length) {result.harvest.observedEvents = null; result.transfer.observedEvents = null;}
    }
    return bounded(result);
}

export function readHomeEvidencePage(store, offset, limit) {
    if (!integer(offset) || !integer(limit) || limit < 1) return {error: 'invalid_page'};
    const found = locate(store);
    if (found.error) return found;
    if (!found.window) return offset === 0 ? bounded({...admissionHeader(store), offset, total: null, items: [],
        nextOffset: null, reason: 'not_admitted'}) : {error: 'invalid_page'};
    const w = found.window;
    if (offset > w.rows.length) return {error: 'invalid_page'};
    const page = {...header(w), offset, total: w.rows.length, items: [], nextOffset: null};
    if (store.schemaVersion === 2) Object.assign(page, admissionHeader(store));
    const end = Math.min(w.rows.length, offset + Math.min(limit, LIMITS.pageRows));
    for (let index = offset; index < end; index++) {
        page.items.push(copy(w.rows[index])); page.nextOffset = index + 1 < w.rows.length ? index + 1 : null;
        if (JSON.stringify(page).length > LIMITS.pageChars) {
            page.items.pop(); page.nextOffset = index;
            if (!page.items.length) return {error: 'item_too_large', windowId: w.header.windowId, nextOffset: null};
            break;
        }
    }
    return bounded(page);
}
