import { ensureEmpireControl } from '../config/EmpirePolicy.js';
import { beginObservationTick, finishObservationTick, pauseObservation } from './MetricObservationWindow.js';

const ALPHA = 0.2;

function cpuUsed() {
    return Game.cpu && typeof Game.cpu.getUsed === 'function' ? Game.cpu.getUsed() : null;
}

function ewma(previous, current) {
    return previous === undefined ? current : previous + ALPHA * (current - previous);
}

const RuntimeTelemetry = {
    beginTick(codeVersion = global.EmpireServicesVersion || null) {
        const enabled = ensureEmpireControl().policy.telemetry.enabled !== false;
        global.EmpireTelemetry = {
            tick: Game.time,
            codeVersion,
            enabled,
            startedAt: enabled ? cpuUsed() : null,
            services: {},
            totalCpu: null,
            errors: {}
        };
        const metrics = ensureEmpireControl().metrics;
        if (metrics.remoteObservation?.current && (metrics.remoteObservation.current.status === 'collecting' || !enabled)) {
            metrics.remoteObservation = enabled ? beginObservationTick(metrics.remoteObservation, {
                tick: Game.time, ...metrics.remoteObservation.current.identity, codeVersion
            }) : pauseObservation(metrics.remoteObservation, { tick: Game.time, reason: 'telemetry_disabled' });
        }
    },

    measure(name, phase, callback) {
        if (!global.EmpireTelemetry) this.beginTick();
        if (!global.EmpireTelemetry.enabled) return callback();
        const start = cpuUsed();
        try {
            return callback();
        } catch (error) {
            if (!global.EmpireTelemetry.errors[name]) global.EmpireTelemetry.errors[name] = {};
            global.EmpireTelemetry.errors[name][phase] = (global.EmpireTelemetry.errors[name][phase] || 0) + 1;
            throw error;
        } finally {
            const end = cpuUsed();
            if (start !== null && end !== null) {
                if (!global.EmpireTelemetry.services[name]) global.EmpireTelemetry.services[name] = {};
                global.EmpireTelemetry.services[name][phase] =
                    (global.EmpireTelemetry.services[name][phase] || 0) + Math.max(0, end - start);
            }
        }
    },

    finishTick() {
        const state = global.EmpireTelemetry;
        const tick = Game.time;
        if (!state?.enabled || !Number.isSafeInteger(tick) || tick < 0 || state.tick !== tick) return;
        const end = cpuUsed();
        state.totalCpu = state.startedAt !== null && end !== null ? Math.max(0, end - state.startedAt) : null;
        const control = ensureEmpireControl();
        const hasErrors = Object.keys(state.errors).length > 0;
        if (control.metrics.remoteObservation?.current) {
            control.metrics.remoteObservation = hasErrors ?
                pauseObservation(control.metrics.remoteObservation, { tick: Game.time, reason: 'runtime_error' }) :
                finishObservationTick(control.metrics.remoteObservation, {
                    tick: Game.time, codeVersion: state.codeVersion, totalCpu: state.totalCpu,
                    bucket: Game.cpu && Number.isFinite(Game.cpu.bucket) ? Game.cpu.bucket : null
                });
        }
        const roomHistories = control.metrics.histories || {};
        for (const history of Object.values(roomHistories)) {
            const last = Array.isArray(history.samples) && history.samples[history.samples.length - 1];
            if (last && last.tick === Game.time && last.codeVersion === state.codeVersion) last.totalCpu = state.totalCpu;
        }
        if (hasErrors) return;
        const interval = Math.max(1, control.policy.telemetry.persistInterval || 10);
        const saved = control.telemetry;
        const sameVersion = saved.codeVersion === state.codeVersion;
        if (Number.isSafeInteger(saved.updatedAt) && saved.updatedAt >= 0) {
            if (saved.updatedAt >= tick || (sameVersion && tick - saved.updatedAt < interval)) return;
        }

        // Only publish after this tick's sample and all aggregates are ready.
        const next = {
            ...saved,
            codeVersion: state.codeVersion,
            history: sameVersion && Array.isArray(saved.history) ? saved.history.slice() : [],
            services: sameVersion ? { ...saved.services } : {}
        };
        if (!sameVersion) delete next.totalCpuEwma;
        if (Number.isFinite(state.totalCpu)) next.totalCpuEwma = ewma(next.totalCpuEwma, state.totalCpu);
        const sample = {
            tick,
            codeVersion: state.codeVersion,
            totalCpu: state.totalCpu,
            bucket: Game.cpu && Number.isFinite(Game.cpu.bucket) ? Game.cpu.bucket : null
        };
        if (next.history.at(-1)?.tick === tick) next.history[next.history.length - 1] = sample;
        else next.history.push(sample);
        const limit = Math.min(50, Number.isSafeInteger(control.policy.telemetry.historyLimit) && control.policy.telemetry.historyLimit > 0 ? control.policy.telemetry.historyLimit : 50);
        if (next.history.length > limit) next.history.splice(0, next.history.length - limit);
        const samples = next.history.map(entry => entry.totalCpu).filter(Number.isFinite).sort((a, b) => a - b);
        next.totalCpuP95 = samples.length ? samples[Math.ceil(samples.length * 0.95) - 1] : null;
        next.knownCpuSamples = samples.length;
        for (const [name, phases] of Object.entries(state.services)) {
            const totals = { ...next.services[name] };
            for (const [phase, cpu] of Object.entries(phases)) {
                const key = `${phase}Ewma`;
                totals[key] = ewma(totals[key], cpu);
            }
            next.services[name] = totals;
        }
        next.updatedAt = tick;
        control.telemetry = next;
    }
};

export default RuntimeTelemetry;
