import BaseService from '../core/BaseService.js';
import {advanceHomeEvidence, validHomeEvidenceStore, validateHomeEvidenceRequest, validHomeClock,
    homeCopy as copy, homeEqual as equal, homeRecord as record, emptyHomeCpu, HOME_CPU_STAGES, homeCommitKey} from './HomeEvidenceWindowModel.js';
import {inspectHomeObservationGate, inspectHomeEvidenceSelection, collectHomeEvidencePacket} from './HomeEvidenceWindowFacts.js';
import {homeEvidenceStatus, summarizeHomeEvidence, readHomeEvidencePage} from './HomeEvidenceWindowReport.js';
import {commitHomeEvidenceStore} from './HomeEvidenceWindowPersistence.js';

const admissionAttempts = new WeakMap();
function cpuPolicy(value) {
    return record(value) && [value.minBucket, value.reserve, value.capture].every(Number.isFinite) &&
        value.minBucket >= 5000 && value.reserve >= 5 && value.capture > 0 && value.capture <= 2
        ? {minBucket: value.minBucket, reserve: value.reserve, capture: value.capture} : null;
}
const defaultCpu = () => {
    const cpu = global.Game?.cpu;
    return cpu ? {used: cpu.getUsed(), tickLimit: cpu.tickLimit, bucket: cpu.bucket} : null;
};
const validCpu = (sample, policy) => policy && sample && [sample.used, sample.tickLimit, sample.bucket].every(Number.isFinite) &&
    sample.used >= 0 && sample.tickLimit >= sample.used && sample.bucket >= policy.minBucket;

class HomeEvidenceWindowService extends BaseService {
    constructor(name = 'HomeEvidenceWindow', options = {}) {
        super(name);
        this.now = options.now || (() => Date.now());
        this.readCpu = options.readCpu || defaultCpu;
        this.readStore = options.readStore || (() => global.Memory?.empire?.observations?.homeEvidence);
        this.writeStore = options.writeStore || (value => {
            const empire = global.Memory?.empire;
            if (!record(empire) || empire.observations !== undefined && !record(empire.observations)) throw new Error('home_store_unavailable');
            if (empire.observations === undefined) empire.observations = {homeEvidence: value};
            else empire.observations.homeEvidence = value;
        });
        this.factsDeps = options.factsDeps || {};
        this.blocked = new Set();
        this.unknownAdmissions = new Set();
        this.lastError = null;
    }

    init() {
        const query = fn => {
            try {return fn(this.readStore());}
            catch {return {error: 'query_failed'};}
        };
        global.HomeEvidenceWindow = Object.freeze({
            status: () => query(homeEvidenceStatus),
            report: () => query(summarizeHomeEvidence),
            readPage: (offset, limit) => query(store => readHomeEvidencePage(store, offset, limit))
        });
    }

    stopLatch(raw) {
        const latch = global.HomeEvidenceWindowRuntime;
        const w = raw?.window;
        return w && latch?.binding?.windowId === w.header.windowId && latch.binding.codeVersion === w.header.codeVersion &&
            latch.binding.acceptedAtTick === w.bounds.acceptedAtTick && latch.binding.issuedAtMs === w.bounds.issuedAtMs ? latch : null;
    }

    rememberStop(raw, reason, clock) {
        const previous = this.stopLatch(raw);
        if (previous) return previous;
        const w = raw.window;
        const latch = {...global.HomeEvidenceWindowRuntime, binding: {windowId: w.header.windowId, codeVersion: w.header.codeVersion,
            acceptedAtTick: w.bounds.acceptedAtTick, issuedAtMs: w.bounds.issuedAtMs}, reason, clock: copy(clock), unknown: false};
        // One bounded runtime latch survives service reconstruction and JSON Memory
        // reload. If no write can persist it, an actual global reset remains unproved.
        global.HomeEvidenceWindowRuntime = latch;
        return latch;
    }

    finishStop(raw, latch) {
        if (latch.unknown) {this.lastError = 'write_unknown'; return;}
        const outcome = advanceHomeEvidence(raw, {type: 'seal', reason: latch.reason}, latch.clock);
        if (!outcome.changed) {this.lastError = outcome.reason; return;}
        const status = this.commitHomeEvidence(raw, outcome.store, homeCommitKey(raw.admission.request, 'seal'), 'seal');
        if (status === 'unknown') latch.unknown = true;
        // A budget failure before the first write may defer this same stop, but
        // never refresh its clock or permit capture while waiting for persistence.
    }

    budget() {
        const policy = cpuPolicy(global.Memory?.empire?.control?.policy?.homeEvidence?.cpu);
        const read = () => {try {return copy(this.readCpu());} catch {return null;}};
        const initial = read();
        this.cpuSamples = emptyHomeCpu();
        const sample = (stage, current, commitKind) => {
            if (HOME_CPU_STAGES.includes(stage) && validCpu(initial, policy) && validCpu(current, policy) && current.used >= initial.used) {
                this.cpuSamples[stage] = {tick: global.Game?.time, used: current.used, tickLimit: current.tickLimit,
                    bucket: current.bucket, delta: current.used - initial.used, ...(commitKind ? {commitKind} : {})};
            }
        };
        sample('entry', initial);
        return (stage = null, commitKind = null) => {
            const current = read(); sample(stage, current, commitKind);
            return validCpu(initial, policy) && validCpu(current, policy) &&
                initial.tickLimit - initial.used >= Math.max(7, policy.reserve + policy.capture) &&
                current.used >= initial.used && current.used - initial.used < policy.capture &&
                current.tickLimit - current.used >= policy.reserve;
        };
    }

    commitHomeEvidence(expected, candidate, key, kind) {
        const id = candidate?.admission?.request.id || candidate?.window?.header.windowId;
        const stage = kind || (expected === undefined ? 'admit' : candidate?.window?.capture.phase === 'sealed' ? 'seal' : 'capture');
        if (this.blocked.has(key) || stage === 'admit' && this.unknownAdmissions.has(id)) return 'unknown';
        const available = this.currentBudget || this.budget();
        const result = commitHomeEvidenceStore({expected, candidate, key, kind: stage, readStore: this.readStore,
            writeStore: this.writeStore, checkpoint: (name, kind) => this.checkBudget(name, available, kind)});
        if (result.status === 'unknown') {
            this.blocked.add(key);
            this.unknownAdmissions.add(id);
            const attempt = global.HomeEvidenceWindowRuntime?.admissionAttempt;
            if (attempt) attempt.unknown = true;
        }
        if (result.reason || result.status === 'unknown') this.lastError = result.status === 'unknown' ? 'write_unknown' : result.reason;
        if (result.status === 'conflict' && result.reason === 'cpu_skipped') this.deferAdmissionFailure('cpu_skipped');
        return result.status;
    }

    checkBudget(stage, available = this.currentBudget, kind = null) {
        if (!available?.(stage, kind)) {const error = new Error('home_cpu'); error.code = 'HOME_CPU_LIMIT'; throw error;}
    }

    cleanup() {
        this.stage = 'entry'; this.diagnostic = {gate: null, selection: null};
        try {
            const settings = global.Memory?.empire?.control?.policy?.homeEvidence;
            this.currentBudget = this.budget();
            let raw = this.readStore();
            if (raw !== undefined && !validHomeEvidenceStore(raw)) {this.lastError = 'corrupt'; return;}
            if (raw?.pending || raw?.window?.pending) {this.lastError = 'pending_write'; return;}
            if (raw?.schemaVersion === 1) {this.lastError = 'legacy_readonly'; return;}
            const attempt = global.HomeEvidenceWindowRuntime?.admissionAttempt;
            if (raw?.window?.capture.phase === 'sealed' || settings?.enabled !== true && raw === undefined && !attempt?.deferred) return;
            const clock = {tick: global.Game?.time, nowMs: this.now(), codeVersion: global.EmpireServicesVersion, shard: global.Game?.shard?.name};
            if (!validHomeClock(clock)) {this.lastError = 'invalid_clock'; return;}
            if (attempt?.unknown) {this.lastError = 'write_unknown'; return;}
            if (attempt?.deferred) {
                if (!equal(settings?.request, attempt.request)) {this.lastError = 'request_changed'; return;}
                const outcome = advanceHomeEvidence(raw, {type: 'diagnostic', snapshot: attempt.deferred}, clock);
                if (outcome.changed) {
                    const result = this.commitHomeEvidence(raw, outcome.store, homeCommitKey(attempt.request, 'diagnostic'), 'diagnostic');
                    if (['committed', 'unchanged'].includes(result)) attempt.deferred = null;
                }
                this.lastError = attempt.firstFailure?.reason || this.lastError; return;
            }
            const stopped = this.stopLatch(raw);
            if (stopped) {this.finishStop(raw, stopped); return;}
            const commit = (event, suffix) => {
                const outcome = advanceHomeEvidence(raw, event, clock);
                if (!outcome.changed) {this.lastError = outcome.reason; return false;}
                const status = this.commitHomeEvidence(raw, outcome.store, homeCommitKey(outcome.store.admission.request, suffix), suffix);
                if (!['committed', 'unchanged'].includes(status)) return false;
                raw = this.readStore(); return true;
            };
            // Revocation/deadline decisions happen before optional object or event reads.
            if (raw?.window) {
                let reason = null;
                if (settings?.enabled !== true) reason = 'disabled';
                else if (!equal(settings.request, raw.window.header.request)) reason = 'request_changed';
                else if (clock.codeVersion !== raw.window.header.codeVersion) reason = 'version_changed';
                else if (clock.shard !== raw.window.header.shard) reason = 'scope_changed';
                else if (clock.nowMs < raw.window.capture.lastNowMs || clock.tick < (raw.window.capture.lastCommittedTick ?? raw.window.bounds.acceptedAtTick)) reason = 'invalid_clock';
                else if (clock.tick > raw.window.bounds.lastAllowedTick || clock.nowMs >= raw.window.bounds.expiresAtMs) reason = 'deadline';
                if (reason) {this.finishStop(raw, this.rememberStop(raw, reason, clock)); return;}
                // A persisted candidate cannot reveal whether the previous process
                // completed its final readback. Losing runtime continuity stops capture;
                // it never turns an unknown admission into a new authorization.
                if (!attempt?.accepted || !equal(attempt.request, raw.admission.request)) {
                    this.checkBudget(null); this.lastError = 'capture_interrupted'; return;
                }
                if (raw.window.capture.lastCommittedTick === clock.tick) return;
            } else if (!raw) {
                if (attempt) {this.lastError = 'admission_already_attempted'; return;}
                if (!validateHomeEvidenceRequest(settings?.request, clock).valid) {this.lastError = 'invalid_request'; return;}
                // One deterministic admission opportunity prevents retry after a failed first
                // write that left no durable marker across a later global reset.
                if (clock.tick !== settings.request.acceptNotBeforeTick) {this.lastError = 'missed_admission'; return;}
                if (this.unknownAdmissions.size > 0) {this.lastError = 'write_unknown'; return;}
                let attempted = admissionAttempts.get(global.Game);
                if (!attempted) {attempted = new Set(); admissionAttempts.set(global.Game, attempted);}
                if (attempted.size > 0) {this.lastError = 'admission_already_attempted'; return;}
                attempted.add(settings.request.id);
                const candidate = advanceHomeEvidence(undefined, {type: 'reserve', request: settings.request}, clock).store;
                global.HomeEvidenceWindowRuntime = {...global.HomeEvidenceWindowRuntime, admissionAttempt: {
                    request: copy(settings.request), clock: copy(clock), base: candidate, unknown: false, deferred: null}};
                this.checkBudget('entry');
                this.stage = 'reserve';
                const status = this.commitHomeEvidence(undefined, candidate, homeCommitKey(settings.request, 'reserve'), 'reserve');
                if (!['committed', 'unchanged'].includes(status)) return;
                raw = this.readStore();
            } else {
                this.lastError = raw.admission.firstOutcome?.reason || 'admission_interrupted'; return;
            }
            this.checkBudget('afterFinal');
            const deps = {...this.factsDeps, readCpu: this.readCpu, continueCapture: this.currentBudget};
            this.stage = 'gate';
            const {gate, diagnostic: gateDiagnostic} = inspectHomeObservationGate(clock, deps);
            this.diagnostic = {gate: gateDiagnostic, selection: null};
            this.checkBudget('afterGate');
            if (gate.known !== true || gate.closed !== true || gate.homeReady !== true) {
                if (raw.window) {
                    const outcome = advanceHomeEvidence(raw, {type: 'capture', gate, packet: null}, clock);
                    if (outcome.changed) this.finishStop(raw, this.rememberStop(raw, outcome.store.window.seal.reason, clock));
                }
                else this.rejectAdmission(raw, gate.reason, 'gate', clock);
                return;
            }
            if (!raw.window) {
                this.stage = 'selection';
                const {selection, diagnostic} = inspectHomeEvidenceSelection(clock, deps);
                this.diagnostic.selection = diagnostic; this.checkBudget('afterSelection');
                if (!selection.complete) {this.rejectAdmission(raw, selection.reason, 'selection', clock); return;}
                const outcome = advanceHomeEvidence(raw, {type: 'admit', request: settings.request, selection, gate,
                    diagnostic: {...this.diagnostic, cpu: copy(this.cpuSamples)}}, clock);
                if (!outcome.changed) {this.lastError = outcome.reason; return;}
                this.stage = 'admit';
                if (!['committed', 'unchanged'].includes(this.commitHomeEvidence(raw, outcome.store,
                    homeCommitKey(settings.request, 'admit'), 'admit'))) return;
                raw = this.readStore();
                global.HomeEvidenceWindowRuntime.admissionAttempt.accepted = true;
            }
            this.stage = 'capture'; this.checkBudget(null);
            const packet = collectHomeEvidencePacket(raw.window, clock, deps);
            commit({type: 'capture', packet, gate}, 'capture');
        } catch (error) {
            this.lastError = error?.code === 'HOME_CPU_LIMIT' ? 'cpu_skipped' : 'capture_failed';
            this.deferAdmissionFailure(this.lastError);
        } finally {this.currentBudget = null;}
    }

    rejectAdmission(raw, reason, stage, clock) {
        this.lastError = reason;
        const outcome = advanceHomeEvidence(raw, {type: 'reject', reason, stage,
            diagnostic: {...this.diagnostic, cpu: copy(this.cpuSamples)}}, clock);
        if (outcome.changed) {
            const attempt = global.HomeEvidenceWindowRuntime?.admissionAttempt;
            if (attempt && !attempt.firstFailure) {attempt.firstFailure = copy(outcome.store.admission.firstOutcome); attempt.deferred = copy(outcome.store);}
            const result = this.commitHomeEvidence(raw, outcome.store, homeCommitKey(raw.admission.request, 'reject'), 'reject');
            if (attempt && ['committed', 'unchanged'].includes(result)) attempt.deferred = null;
        }
    }

    deferAdmissionFailure(reason) {
        const attempt = global.HomeEvidenceWindowRuntime?.admissionAttempt;
        if (!attempt || attempt.accepted || attempt.unknown || attempt.firstFailure) return;
        const outcome = advanceHomeEvidence(attempt.base, {type: 'reject', reason, stage: this.stage || 'entry',
            diagnostic: {...this.diagnostic, cpu: copy(this.cpuSamples)}}, attempt.clock);
        if (outcome.changed) {
            attempt.firstFailure = copy(outcome.store.admission.firstOutcome);
            attempt.deferred = outcome.store;
        }
    }
}

export default HomeEvidenceWindowService;
