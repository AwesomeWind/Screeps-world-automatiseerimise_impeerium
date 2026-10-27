import BaseService from '../core/BaseService.js';
import {advanceHomeEvidence, validHomeEvidenceStore, validateHomeEvidenceRequest, validHomeClock,
    homeCopy as copy, homeEqual as equal, homeRecord as record} from './HomeEvidenceWindowModel.js';
import {collectHomeObservationGate, selectHomeEvidenceObjects, collectHomeEvidencePacket} from './HomeEvidenceWindowFacts.js';
import {homeEvidenceStatus, summarizeHomeEvidence, readHomeEvidencePage} from './HomeEvidenceWindowReport.js';

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
        const latch = {binding: {windowId: w.header.windowId, codeVersion: w.header.codeVersion,
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
        const status = this.commitHomeEvidence(raw, outcome.store, raw.window.header.windowId + ':seal:' + latch.clock.tick);
        if (status === 'unknown') latch.unknown = true;
        // A budget failure before the first write may defer this same stop, but
        // never refresh its clock or permit capture while waiting for persistence.
    }

    budget() {
        const policy = cpuPolicy(global.Memory?.empire?.control?.policy?.homeEvidence?.cpu);
        const initial = this.readCpu();
        return () => {
            const current = this.readCpu();
            return validCpu(initial, policy) && validCpu(current, policy) &&
                initial.tickLimit - initial.used >= Math.max(7, policy.reserve + policy.capture) &&
                current.used >= initial.used && current.used - initial.used < policy.capture &&
                current.tickLimit - current.used >= policy.reserve;
        };
    }

    commitHomeEvidence(expected, candidate, key) {
        const id = candidate?.window?.header.windowId;
        const stage = expected === undefined ? 'admit' : candidate?.window?.capture.phase === 'sealed' ? 'seal' : 'capture';
        if (this.blocked.has(key) || stage === 'admit' && this.unknownAdmissions.has(id)) return 'unknown';
        let attempted = false;
        try {
            const available = this.currentBudget || this.budget();
            const checkpoint = () => {if (!available()) {const error = new Error('home_cpu'); error.code = 'HOME_CPU_LIMIT'; throw error;}};
            checkpoint();
            if (!validHomeEvidenceStore(candidate)) return 'conflict';
            const actual = this.readStore(); checkpoint();
            if (equal(actual, candidate)) return 'unchanged';
            if (!equal(actual, expected)) return 'conflict';
            const pending = copy(candidate); checkpoint();
            pending.window.pending = {key, stage, tick: global.Game?.time};
            if (!validHomeEvidenceStore(pending)) return 'conflict';
            checkpoint();
            attempted = true;
            try {this.writeStore(pending);} catch {checkpoint(); if (!equal(this.readStore(), pending)) throw new Error('pending_unknown');}
            checkpoint();
            if (!equal(this.readStore(), pending)) throw new Error('pending_conflict');
            checkpoint();
            try {this.writeStore(candidate);} catch {checkpoint(); if (!equal(this.readStore(), candidate)) throw new Error('final_unknown');}
            checkpoint();
            if (!equal(this.readStore(), candidate)) throw new Error('final_conflict');
            checkpoint();
            return 'committed';
        } catch (error) {
            this.lastError = error?.code === 'HOME_CPU_LIMIT' ? 'cpu_skipped' : 'write_unknown';
            if (!attempted && error?.code === 'HOME_CPU_LIMIT') return 'conflict';
            this.blocked.add(key);
            if (stage === 'admit') this.unknownAdmissions.add(id);
            return 'unknown';
        }
    }

    cleanup() {
        try {
            const settings = global.Memory?.empire?.control?.policy?.homeEvidence;
            this.currentBudget = this.budget();
            let raw = this.readStore();
            if (raw !== undefined && !validHomeEvidenceStore(raw)) {this.lastError = 'corrupt'; return;}
            if (raw?.window.pending) {this.lastError = 'pending_write'; return;}
            if (raw?.window.capture.phase === 'sealed' || settings?.enabled !== true && raw === undefined) return;
            const clock = {tick: global.Game?.time, nowMs: this.now(), codeVersion: global.EmpireServicesVersion, shard: global.Game?.shard?.name};
            if (!validHomeClock(clock)) {this.lastError = 'invalid_clock'; return;}
            const stopped = this.stopLatch(raw);
            if (stopped) {this.finishStop(raw, stopped); return;}
            const commit = (event, suffix) => {
                const outcome = advanceHomeEvidence(raw, event, clock);
                if (!outcome.changed) {this.lastError = outcome.reason; return false;}
                const status = this.commitHomeEvidence(raw, outcome.store, outcome.store.window.header.windowId + ':' + suffix + ':' + clock.tick);
                if (!['committed', 'unchanged'].includes(status)) return false;
                raw = this.readStore(); return true;
            };
            // Revocation/deadline decisions happen before optional object or event reads.
            if (raw) {
                let reason = null;
                if (settings?.enabled !== true) reason = 'disabled';
                else if (!equal(settings.request, raw.window.header.request)) reason = 'request_changed';
                else if (clock.codeVersion !== raw.window.header.codeVersion) reason = 'version_changed';
                else if (clock.shard !== raw.window.header.shard) reason = 'scope_changed';
                else if (clock.nowMs < raw.window.capture.lastNowMs || clock.tick < (raw.window.capture.lastCommittedTick ?? raw.window.bounds.acceptedAtTick)) reason = 'invalid_clock';
                else if (clock.tick > raw.window.bounds.lastAllowedTick || clock.nowMs >= raw.window.bounds.expiresAtMs) reason = 'deadline';
                if (reason) {this.finishStop(raw, this.rememberStop(raw, reason, clock)); return;}
                if (raw.window.capture.lastCommittedTick === clock.tick) return;
            } else {
                if (!validateHomeEvidenceRequest(settings?.request, clock).valid) {this.lastError = 'invalid_request'; return;}
                // One deterministic admission opportunity prevents retry after a failed first
                // write that left no durable marker across a later global reset.
                if (clock.tick !== settings.request.acceptNotBeforeTick) {this.lastError = 'missed_admission'; return;}
                if (this.unknownAdmissions.size > 0) {this.lastError = 'write_unknown'; return;}
                let attempted = admissionAttempts.get(global.Game);
                if (!attempted) {attempted = new Set(); admissionAttempts.set(global.Game, attempted);}
                if (attempted.size > 0) {this.lastError = 'admission_already_attempted'; return;}
                attempted.add(settings.request.id);
            }
            if (!this.currentBudget()) {this.lastError = 'cpu_skipped'; return;}
            const deps = {...this.factsDeps, readCpu: this.readCpu, continueCapture: this.currentBudget};
            const gate = collectHomeObservationGate(clock, deps);
            if (gate.known !== true || gate.closed !== true || gate.homeReady !== true) {
                if (raw) {
                    const outcome = advanceHomeEvidence(raw, {type: 'capture', gate, packet: null}, clock);
                    if (outcome.changed) this.finishStop(raw, this.rememberStop(raw, outcome.store.window.seal.reason, clock));
                }
                else this.lastError = gate.reason;
                return;
            }
            if (!raw) {
                const selection = selectHomeEvidenceObjects(clock, deps);
                if (!commit({type: 'admit', request: settings.request, selection, gate}, 'admit')) return;
            }
            if (!this.currentBudget()) {this.lastError = 'cpu_skipped'; return;}
            const packet = collectHomeEvidencePacket(raw.window, clock, deps);
            commit({type: 'capture', packet, gate}, 'capture');
        } catch (error) {
            this.lastError = error?.code === 'HOME_CPU_LIMIT' ? 'cpu_skipped' : 'capture_failed';
        } finally {this.currentBudget = null;}
    }
}

export default HomeEvidenceWindowService;
