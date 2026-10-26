import { EVIDENCE_LIMITS, EVIDENCE_ROW_COLUMNS, EVIDENCE_SAFETY_BITS, EVIDENCE_STATE_BITS, EVIDENCE_FLAGS,
    validEvidenceStore, evidencePending, evidenceCopy as copy, evidenceInteger as integer } from './TrialEvidenceWindowModel.js';
import {economicIdentityMatches} from './RemoteEconomicTrialModel.js';

const roles = ['scout', 'remoteMiner', 'remoteHauler'];
const section = (status, reason, details = {}) => ({status, reason, ...details});
const validWindow = window => validEvidenceStore({schemaVersion: 1, current: window, previous: null});
const bit = (row, field, knownIndex, valueIndex, definitions) =>
    row[knownIndex] & definitions[field] ? !!(row[valueIndex] & definitions[field]) : null;

function header(window) {
    return {windowId: window.header.id, schemaVersion: 1, rowSchema: window.header.rowSchema,
        codeVersion: window.header.identity.codeVersion, identity: copy(window.header.identity),
        revision: window.capture.revision, sealed: window.capture.phase === 'sealed',
        counts: {rows: window.tickRows.length, snapshots: window.snapshots.length, milestones: window.milestones.length}};
}
function bounded(value) {
    if (JSON.stringify(value).length <= EVIDENCE_LIMITS.pageChars) return value;
    return {error: 'output_too_large', windowId: value.windowId, revision: value.revision, nextOffset: null};
}
function locate(store, id) {
    if (store === undefined) return {error: 'missing_window'};
    if (!validEvidenceStore(store)) return {error: 'corrupt'};
    const window = [store.current, store.previous].find(item => item?.header.id === id);
    const pending = evidencePending(store);
    if (!window && pending?.windowId === id) return {error: 'pending_window', windowId: id, pending: copy(pending)};
    return window ? {window} : {error: 'missing_window'};
}
function decodedRow(row) {
    const result = Object.fromEntries(EVIDENCE_ROW_COLUMNS.map((name, index) => [name, row[index]]));
    result.safety = Object.fromEntries(Object.keys(EVIDENCE_SAFETY_BITS).map(name => [name, bit(row, name, 2, 3, EVIDENCE_SAFETY_BITS)]));
    result.state = Object.fromEntries(Object.keys(EVIDENCE_STATE_BITS).map(name => [name, bit(row, name, 8, 9, EVIDENCE_STATE_BITS)]));
    return result;
}

function coverage(window) {
    const rows = window.tickRows;
    let contiguous = window.bounds.startedAtTick !== null && rows[0]?.[0] === window.bounds.startedAtTick;
    let gaps = 0, safeRun = 0, maxSafeRun = 0, guardAligned = false;
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (index && row[0] !== rows[index - 1][0] + 1) {gaps++; contiguous = false; safeRun = 0;}
        // Source-event/owner gaps do not erase independently observed room safety.
        // Missing ticks, identity conflicts and contradictory packets still break the run.
        if (row[2] === 127 && row[3] === 127 && !(row[10] & (EVIDENCE_FLAGS.conflict | EVIDENCE_FLAGS.identity))) {
            safeRun++; maxSafeRun = Math.max(maxSafeRun, safeRun);
            if (safeRun >= 100 && row[4] === 100) guardAligned = true;
        } else safeRun = 0;
    }
    return {fromTick: rows[0]?.[0] ?? null, toTick: rows.at(-1)?.[0] ?? null,
        rows: rows.length, gaps, contiguousFromAdmission: contiguous && !window.capture.partial && !window.capture.pending,
        maxObservedSafeRun: maxSafeRun, guardAligned, partial: window.capture.partial || !!window.capture.pending};
}

function settlement(window, proof) {
    const value = proof?.settlement;
    if (!economicIdentityMatches(proof?.identity, window.header.identity) || !value ||
        !['confirmedSpawnCost', 'confirmedInfrastructureCost', 'returnedEnergy', 'unknownEvents', 'unknownEnergyUpperBound']
            .every(key => integer(value[key]))) return null;
    const knownNetEnergy = value.returnedEnergy - value.confirmedSpawnCost - value.confirmedInfrastructureCost;
    if (!Number.isSafeInteger(knownNetEnergy)) return null;
    const unknown = value.unknownEvents > 0 || value.unknownEnergyUpperBound > 0 ||
        value.logisticsUnknownEnergyUpperBound > 0 || proof.outboxPending !== 0 || value.netEnergy === null ||
        !Number.isSafeInteger(value.netEnergy) || value.netEnergy !== knownNetEnergy || value.knownNetEnergy !== knownNetEnergy;
    return {...copy(value), knownNetEnergy, netEnergy: unknown ? null : knownNetEnergy};
}

function semantics(proof, window) {
    const api = proof?.apiEvidence;
    if (api?.semanticsLevel === 'simulated') return 'simulated';
    const ref = api?.verificationRef;
    return api?.methodSupported === true && api.shapeValid === true && api.semanticsLevel === 'production_verified' &&
        ref && typeof ref.id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(ref.id) &&
        /^[a-f0-9]{64}$/.test(ref.sha256) && ref.codeVersion === window.header.identity.codeVersion && ref.eventSemanticsVersion === 1
        ? 'production_verified' : 'unverified';
}

export function deriveFirstDeliveryNewEnergyLowerBound(window) {
    const missing = reason => ({value: null, reasons: [reason], semanticsLevel: 'unverified'});
    if (!validWindow(window)) return missing('corrupt');
    const p = window.capture.firstDeliveryProof, source = window.capture.provenance;
    const first = p?.firstDelivery, money = settlement(window, p), level = semantics(p, window);
    if (!coverage(window).contiguousFromAdmission || !source || source.incomplete || source.foreignInput ||
        ![source.openingEnergy, source.harvest, source.deposits].every(integer) || !source.containerId ||
        !p?.containerId || source.containerId !== p.containerId ||
        window.binding.remoteMiner?.birthEmpty !== true || window.binding.remoteHauler?.birthEmpty !== true) return missing('source_coverage_missing');
    if (!first || !economicIdentityMatches(first.identity, window.header.identity) ||
        first.targetId !== window.header.receiverId || !integer(first.amount) || first.amount <= 0 ||
        source.tripId !== first.tripId || !integer(source.firstPickupTick) || source.firstPickupTick >= first.confirmedAtTick ||
        !integer(p.pickups?.['trip:' + first.tripId]) || p.pickups['trip:' + first.tripId] < first.amount ||
        !integer(p.delivered?.['trip:' + first.tripId]) || p.delivered['trip:' + first.tripId] < first.amount ||
        !money || money.netEnergy === null) return missing('first_trip_or_settlement_missing');
    if (!['simulated', 'production_verified'].includes(level)) return missing('native_semantics_unverified');
    return {value: Math.min(source.harvest, source.deposits, Math.max(0, first.amount - source.openingEnergy)),
        reasons: [], semanticsLevel: level};
}

export function summarizeEvidenceWindow(window) {
    if (!validWindow(window)) return {error: 'corrupt', sections: {coverage: section('missing', 'corrupt')}};
    const p = window.capture.latestProof, c = coverage(window), money = settlement(window, p);
    const first = window.capture.firstDeliveryProof?.firstDelivery;
    const originalFirstValid = first && economicIdentityMatches(first.identity, window.header.identity) &&
        first.targetId === window.header.receiverId && integer(first.amount) && first.amount > 0 &&
        integer(first.confirmedAtTick) && first.confirmedAtTick >= window.bounds.startedAtTick &&
        window.capture.firstDeliveryProof.outboxPending === 0;
    const born = roles.every(role => window.milestones.some(item => item.type === 'born_' + role));
    const moved = roles.map(role => ({role, observation: copy(window.milestones.find(item => item.type === 'moved_' + role) ?? null)}));
    const entered = roles.map(role => ({role, observation: copy(window.milestones.find(item => item.type === 'entered_' + role) ?? null)}));
    const level = semantics(p, window);
    const harvest = window.tickRows.some(row => row[5] !== null)
        ? window.tickRows.reduce((total, row) => total + (row[5] ?? 0), 0) : null;
    const last = window.tickRows.at(-1), previous = window.tickRows.at(-2);
    const closed = row => row && bit(row, 'controlClosed', 8, 9, EVIDENCE_STATE_BITS) === true;
    const quietNow = closed(last) && closed(previous) && last[0] === previous[0] + 1;
    const originalClosure = economicIdentityMatches(p?.identity, window.header.identity) && p?.control?.identityKnown === true &&
        ['settingsClosed', 'operationClosed', 'scopeClosed'].every(key => p.control[key] === true) &&
        integer(p?.outcome?.decidedAtTick) && p.closeAppliedAtTick === p.outcome.decidedAtTick &&
        integer(p.closureVerifiedAtTick) && p.closureVerifiedAtTick > p.closeAppliedAtTick &&
        previous?.[0] >= p.closureVerifiedAtTick &&
        [previous, last].every(row => row && !(row[10] & (EVIDENCE_FLAGS.identity | EVIDENCE_FLAGS.conflict)));
    const expiry = p?.tailExpiresAtTick, close = p?.closeAppliedAtTick;
    const fullTail = integer(close) && integer(expiry) && expiry === close + 300 &&
        window.tickRows.filter(row => row[0] >= close && row[0] <= expiry + 2 && row[10] === 0).length === 303;
    const emptyHome = last && ['scout', 'miner', 'hauler'].every(role =>
        bit(last, role + 'Present', 8, 9, EVIDENCE_STATE_BITS) === true &&
        bit(last, role + 'Home', 8, 9, EVIDENCE_STATE_BITS) === true && bit(last, role + 'Empty', 8, 9, EVIDENCE_STATE_BITS) === true);
    const noPending = p?.outboxPending === 0 && ['owners', 'grants', 'infrastructure'].every(key => p[key]?.known === true && p[key].count === 0);
    const lower = deriveFirstDeliveryNewEnergyLowerBound(window);
    const report = {...header(window), phase: window.capture.phase, seal: copy(window.seal), coverage: c,
        apiEvidence: copy(p?.apiEvidence ?? {methodSupported: null, shapeValid: null, semanticsLevel: 'unverified', verificationRef: null}),
        settlement: money, outcome: copy(p?.outcome ?? null), firstDelivery: copy(first ?? null),
        firstDeliveryNewEnergyLowerBound: lower.semanticsLevel === 'production_verified' ? lower.value : null,
        newProductionReasons: lower.semanticsLevel === 'simulated' ? ['simulated_only'] : lower.reasons,
        sections: {
            birth: section(born ? 'proved' : 'missing', born ? 'bound_actor_births_observed' : 'birth_coverage_missing'),
            movement: section(moved.every(item => item.observation) ? 'proved' : 'missing', 'position_observations', {actors: moved}),
            crossRoom: section(entered.every(item => item.observation) ? 'proved' : 'missing', 'bound_actor_room_observations', {actors: entered}),
            safety: section(c.guardAligned && integer(window.binding.scout?.bornAtTick) &&
                economicIdentityMatches(window.binding.scout?.identity, window.header.identity) ? 'proved' : 'missing',
                'fresh_per_tick_safety', {maxRun: c.maxObservedSafeRun}),
            production: section(level !== 'production_verified' ? 'unsupported' : harvest > 0 && Number.isSafeInteger(harvest) ? 'proved' : 'missing',
                level !== 'production_verified' ? 'native_semantics_unverified' : 'native_harvest', {observedHarvest: Number.isSafeInteger(harvest) ? harvest : null}),
            delivery: section(originalFirstValid ? 'proved' : 'missing', originalFirstValid ? 'original_first_delivery' : 'no_original_first_delivery'),
            finances: section(money && money.netEnergy !== null ? 'proved' : 'missing', 'original_settlement_only'),
            controlClosure: section(quietNow && originalClosure ? 'proved' : 'missing',
                'original_guard_and_runtime_scope_close', {quietNow: !!quietNow}),
            tail: section(fullTail && emptyHome && noPending ? 'proved' : 'missing', 'full_original_tail_and_cargo_required',
                {fullCoverage: !!fullTail, actorsHomeEmpty: !!emptyHome, noPending, gateReadmission: 'not_authorized'}),
            recovery: section('missing', 'actual_global_reset_not_verified')
        }};
    return bounded(report);
}

export function evidenceWindowStatus(store, windowId) {
    const found = locate(store, windowId);
    if (found.error) return found;
    const w = found.window;
    const pending = evidencePending(store);
    const related = pending && (pending.windowId === undefined || pending.windowId === windowId);
    const observed = coverage(w);
    if (related) {observed.partial = true; observed.contiguousFromAdmission = false;}
    return bounded({...header(w), phase: w.capture.phase, coverage: observed, seal: copy(w.seal), pending: related ? copy(pending) : null});
}

export function readEvidencePage(store, windowId, kind, offset, limit) {
    if (!['rows', 'snapshots', 'milestones'].includes(kind) || !integer(offset) || !integer(limit) || limit < 1) return {error: 'invalid_page'};
    const found = locate(store, windowId);
    if (found.error) return found;
    const w = found.window, data = kind === 'rows' ? w.tickRows : w[kind];
    if (offset > data.length) return {error: 'invalid_page'};
    const page = {...header(w), kind, offset, total: data.length, items: [], nextOffset: null};
    const end = Math.min(data.length, offset + Math.min(limit, kind === 'rows' ? 128 : 16));
    for (let index = offset; index < end; index++) {
        const item = kind === 'rows' ? decodedRow(data[index]) : copy(data[index]);
        page.items.push(item);
        page.nextOffset = index + 1 < data.length ? index + 1 : null;
        if (JSON.stringify(page).length > EVIDENCE_LIMITS.pageChars) {
            page.items.pop(); page.nextOffset = index;
            if (!page.items.length) return bounded({...header(w), error: 'item_too_large', nextOffset: null});
            break;
        }
    }
    return bounded(page);
}
