import { ensureEmpireControl } from '../config/EmpirePolicy.js';

const ALPHA = 0.2;

function cpuUsed() {
    return Game.cpu && typeof Game.cpu.getUsed === 'function' ? Game.cpu.getUsed() : null;
}

function ewma(previous, current) {
    return previous === undefined ? current : previous + ALPHA * (current - previous);
}

const RuntimeTelemetry = {
    beginTick() {
        global.EmpireTelemetry = {
            tick: Game.time,
            startedAt: cpuUsed(),
            services: {},
            totalCpu: 0,
            errors: {}
        };
    },

    measure(name, phase, callback) {
        if (!global.EmpireTelemetry) this.beginTick();
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
        if (!global.EmpireTelemetry) return;
        const end = cpuUsed();
        const state = global.EmpireTelemetry;
        state.totalCpu = state.startedAt !== null && end !== null ? Math.max(0, end - state.startedAt) : 0;
        const control = ensureEmpireControl();
        const interval = Math.max(1, control.policy.telemetry.persistInterval || 10);
        if (Game.time % interval !== 0) return;
        const saved = control.telemetry;
        saved.updatedAt = Game.time;
        saved.totalCpuEwma = ewma(saved.totalCpuEwma, state.totalCpu);
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
