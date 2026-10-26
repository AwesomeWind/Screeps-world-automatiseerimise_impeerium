import BaseService from '../core/BaseService.js';
import { EVIDENCE_PROFILE, EVIDENCE_LIMITS, EVIDENCE_FLAGS, advanceEvidenceWindow, validEvidenceStore,
    validEvidenceClock, evidencePending, evidenceCopy as copy, evidenceEqual as equal } from './TrialEvidenceWindowModel.js';
import { collectEvidenceAdmission, collectEvidencePacket } from './TrialEvidenceWindowFacts.js';
import {evidenceWindowStatus, readEvidencePage, summarizeEvidenceWindow} from './TrialEvidenceWindowReport.js';

function cpuSample() {
    const cpu = global.Game?.cpu;
    return cpu ? {used: cpu.getUsed(), tickLimit: cpu.tickLimit, bucket: cpu.bucket} : null;
}
const validCpu = sample => sample && Number.isFinite(sample.used) && sample.used >= 0 &&
    Number.isFinite(sample.tickLimit) && sample.tickLimit >= sample.used &&
    Number.isFinite(sample.bucket) && sample.bucket >= EVIDENCE_LIMITS.minBucket;
const budgetCheck = (readCpu, initial) => () => {
    const sample = readCpu();
    return validCpu(initial) && validCpu(sample) && sample.used >= initial.used &&
        initial.tickLimit - initial.used >= 7 && sample.used - initial.used < EVIDENCE_LIMITS.maxCaptureCpu &&
        sample.tickLimit - sample.used >= EVIDENCE_LIMITS.reserveCpu;
};

class TrialEvidenceWindowService extends BaseService {
    constructor(name = 'TrialEvidenceWindow', options = {}) {
        super(name);
        this.profile = options.profile || EVIDENCE_PROFILE;
        this.now = options.now || (() => Date.now());
        this.readCpu = options.readCpu || cpuSample;
        this.readStore = options.readStore || (() => global.Memory?.empire?.remoteMining?.evidenceWindows);
        this.writeStore = options.writeStore || (value => {
            // Existing empire/remoteMining is owned by the original runtime; never ensure business state here.
            const remote = global.Memory?.empire?.remoteMining;
            if (!remote) throw new Error('observation_store_unavailable');
            remote.evidenceWindows = value;
        });
        this.factsDeps = options.factsDeps || {};
        this.collectAdmission = options.collectAdmission || collectEvidenceAdmission;
        this.collectPacket = options.collectPacket || collectEvidencePacket;
        this.blockedKeys = new Set();
        this.blockedArms = new Set();
        this.eventCache = new Map();
        this.partial = false;
        this.lastError = null;
    }

    init() {
        const query = operation => {
            try { return operation(this.readStore()); }
            catch { return {error: 'query_failed'}; }
        };
        global.TrialEvidenceWindow = Object.freeze({
            status: windowId => query(store => evidenceWindowStatus(store, windowId)),
            readPage: (windowId, kind, offset, limit) => query(store => readEvidencePage(store, windowId, kind, offset, limit)),
            report: windowId => query(store => {
                const status = evidenceWindowStatus(store, windowId);
                if (status.error) return status;
                const window = [store.current, store.previous].find(item => item?.header.id === windowId);
                const summary = summarizeEvidenceWindow(window);
                if (status.pending && !summary.error) {
                    summary.pending = status.pending;
                    summary.coverage = status.coverage;
                    summary.firstDeliveryNewEnergyLowerBound = null;
                }
                return JSON.stringify(summary).length <= EVIDENCE_LIMITS.pageChars ? summary : {error: 'output_too_large'};
            })
        });
    }

    commitEvidenceCandidate(expected, candidate, packetKey) {
        if (this.blockedKeys.has(packetKey)) return {status: 'unknown'};
        let attemptedWrite = false;
        try {
            const available = this.commitBudget || budgetCheck(this.readCpu, this.readCpu());
            const checkpoint = () => {
                if (!available()) {
                    const error = new Error('evidence_cpu'); error.code = 'EVIDENCE_CPU_LIMIT'; throw error;
                }
            };
            checkpoint();
            const actual = this.readStore();
            checkpoint();
            if (equal(actual, candidate)) return {status: 'unchanged'};
            if (!equal(actual, expected)) return {status: 'conflict'};
            checkpoint();
            // A durable interruption marker precedes the full packet. These are distinct writes,
            // each called at most once; an exception is never a reason to replay either one.
            const pending = copy(expected ?? candidate);
            // Namespace envelope metadata neither consumes a window's character budget
            // nor mutates its sealed contents when preparing an explicit successor.
            pending.pending = {key: packetKey, windowId: candidate.current.header.id,
                stage: expected?.current.header.id !== candidate.current.header.id ? 'arm' : 'packet', tick: global.Game?.time ?? null};
            checkpoint();
            const final = copy(candidate);
            delete final.pending;
            delete final.current.capture.pending;
            checkpoint();
            if (!validEvidenceStore(final) || !validEvidenceStore(pending)) {
                this.partial = true; this.lastError = 'capacity_or_corrupt'; return {status: 'conflict'};
            }
            checkpoint();
            attemptedWrite = true;
            try { this.writeStore(pending); }
            catch {
                checkpoint();
                if (!equal(this.readStore(), pending)) throw new Error('prepare_unknown');
            }
            checkpoint();
            if (!equal(this.readStore(), pending)) return {status: 'conflict'};
            checkpoint();
            try { this.writeStore(final); }
            catch {
                checkpoint();
                if (!equal(this.readStore(), final)) throw new Error('commit_unknown');
            }
            checkpoint();
            if (!equal(this.readStore(), final)) throw new Error('commit_unconfirmed');
            checkpoint();
            return {status: 'committed'};
        } catch (error) {
            this.partial = true;
            this.lastError = error?.code === 'EVIDENCE_CPU_LIMIT' ? 'cpu_skipped' : 'write_unknown';
            if (!attemptedWrite && error?.code === 'EVIDENCE_CPU_LIMIT') return {status: 'conflict'};
            this.blockedKeys.add(packetKey);
            return {status: 'unknown'};
        }
    }

    cleanup() {
        try {
            const settings = global.Memory?.empire?.control?.policy?.remoteMining?.evidenceWindow;
            if (settings?.enabled !== true || !settings.request) return;
            const clock = {tick: global.Game?.time, nowMs: this.now(),
                codeVersion: global.EmpireServicesVersion ?? global.EmpireTelemetry?.codeVersion};
            if (!validEvidenceClock(clock)) { this.lastError = 'invalid_clock'; this.partial = true; return; }
            const initial = this.readCpu();
            if (!validCpu(initial) || initial.tickLimit - initial.used < 7) {
                this.lastError = 'cpu_skipped'; this.partial = true; return;
            }
            const continueCapture = budgetCheck(this.readCpu, initial);
            this.commitBudget = continueCapture;
            let raw = this.readStore();
            if (raw !== undefined && !validEvidenceStore(raw)) {this.lastError = 'corrupt'; return;}
            if (raw && (raw.current.header.profileId !== this.profile.id ||
                raw.current.header.baseRoom !== this.profile.baseRoom || raw.current.header.targetRoom !== this.profile.targetRoom ||
                raw.current.header.sourceId !== this.profile.sourceId || raw.current.header.identity.remoteId !== this.profile.remoteId ||
                !equal(raw.current.header.containerPos, this.profile.containerPos))) {this.lastError = 'scope_mismatch'; return;}
            const pending = evidencePending(raw);
            if (pending?.stage === 'arm' || pending?.tick === clock.tick) {
                this.partial = true; this.lastError = 'pending_write'; return;
            }
            const prefix = settings.request.id + ':' + clock.tick;
            if (this.blockedKeys.has(prefix + ':capture') || this.blockedKeys.has(prefix + ':arm') ||
                this.blockedKeys.has(prefix + ':bind')) return;
            const commit = (event, suffix) => {
                const result = advanceEvidenceWindow(raw, event, clock, this.profile);
                if (!result.changed) return false;
                if (!continueCapture()) { this.partial = true; this.lastError = 'cpu_skipped'; return false; }
                const status = this.commitEvidenceCandidate(raw, result.store, prefix + ':' + suffix).status;
                if (event.type === 'arm' && status === 'unknown') this.blockedArms.add(settings.request.id);
                if (status !== 'committed' && status !== 'unchanged') return false;
                raw = this.readStore();
                if (event.type === 'arm') this.partial = false;
                return true;
            };
            if (!raw || raw.current.header.id !== settings.request.id) {
                if (this.blockedArms.has(settings.request.id)) {this.lastError = 'arm_unknown'; return;}
                if (!commit({type: 'arm', request: settings.request}, 'arm')) return;
            }
            if (!equal(settings.request, raw.current.header.request)) {this.lastError = 'request_changed'; this.partial = true; return;}
            if (raw.current.capture.phase === 'sealed' || raw.current.capture.lastTick === clock.tick) return;
            const interrupted = !!pending;
            if (raw.current.capture.phase === 'armed') {
                if (!continueCapture()) { this.partial = true; return; }
                const admission = this.collectAdmission(this.profile, clock, this.factsDeps);
                commit({type: 'bind', admission}, 'bind');
            }
            if (raw.current.capture.phase === 'armed' || raw.current.capture.phase === 'sealed') return;
            if (clock.nowMs >= raw.current.bounds.expiresAtMs || clock.tick > raw.current.bounds.maxObservedTick) {
                commit({type: 'seal', reason: raw.current.capture.partial ? 'partial' : 'deadline'}, 'seal'); return;
            }
            if (this.eventCacheTick !== clock.tick) {this.eventCache.clear(); this.eventCacheTick = clock.tick;}
            const readEvents = room => {
                if (!this.eventCache.has(room.name)) this.eventCache.set(room.name,
                    this.factsDeps.readEvents ? this.factsDeps.readEvents(room) : room.getEventLog?.());
                return this.eventCache.get(room.name);
            };
            const packet = this.collectPacket(raw.current, clock, {...this.factsDeps, readEvents, continueCapture});
            if (this.partial || interrupted) {
                packet.row[10] |= interrupted ? EVIDENCE_FLAGS.writeUnknown : EVIDENCE_FLAGS.partial;
                packet.coverage.complete = false;
            }
            commit({type: 'capture', packet}, 'capture');
        } catch (error) {
            this.lastError = error?.code === 'EVIDENCE_CPU_LIMIT' ? 'cpu_skipped' : 'capture_failed';
            this.partial = true;
        } finally {
            this.commitBudget = null;
        }
    }
}
export default TrialEvidenceWindowService;
