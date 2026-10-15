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
        if (!global.EmpireTelemetry || !global.EmpireTelemetry.enabled) return;
        const end = cpuUsed();
        const state = global.EmpireTelemetry;
        state.totalCpu = state.startedAt !== null && end !== null ? Math.max(0, end - state.startedAt) : null;
        const control = ensureEmpireControl();
        if (control.metrics.remoteObservation?.current) {
            const hasErrors = Object.keys(state.errors).length > 0;
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
        const interval = Math.max(1, control.policy.telemetry.persistInterval || 10);
        if (Game.time % interval !== 0) return;
        const saved = control.telemetry;
        if (saved.codeVersion !== state.codeVersion) {
            saved.codeVersion = state.codeVersion;
            saved.history = [];
            saved.services = {};
            delete saved.totalCpuEwma;
        }
        saved.updatedAt = Game.time;
        if (Number.isFinite(state.totalCpu)) saved.totalCpuEwma = ewma(saved.totalCpuEwma, state.totalCpu);
        if (!Array.isArray(saved.history)) saved.history = [];
        if (!saved.history.length || saved.history[saved.history.length - 1].tick !== Game.time) {
            saved.history.push({ tick: Game.time, codeVersion: state.codeVersion, totalCpu: state.totalCpu, bucket: Game.cpu && Number.isFinite(Game.cpu.bucket) ? Game.cpu.bucket : null });
        }
        const limit = Math.min(50, Number.isSafeInteger(control.policy.telemetry.historyLimit) && control.policy.telemetry.historyLimit > 0 ? control.policy.telemetry.historyLimit : 50);
        if (saved.history.length > limit) saved.history.splice(0, saved.history.length - limit);
        const samples = saved.history.map(sample => sample.totalCpu).filter(Number.isFinite).sort((a, b) => a - b);
        saved.totalCpuP95 = samples.length ? samples[Math.ceil(samples.length * 0.95) - 1] : null;
        saved.knownCpuSamples = samples.length;
        if (!saved.services) saved.services = {};
        for (const name in state.services) {
            if (!saved.services[name]) saved.services[name] = {};
            for (const phase in state.services[name]) {
                const key = `${phase}Ewma`;
                saved.services[name][key] = ewma(saved.services[name][key], state.services[name][phase]);
            }
        }
    }
};

export default RuntimeTelemetry;
