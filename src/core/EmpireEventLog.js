import { ensureEmpireControl } from '../config/EmpirePolicy.js';

export function recordEmpireEvent(type, severity = 'info', data = {}) {
    const control = ensureEmpireControl();
    const event = {
        type,
        severity,
        tick: Game.time,
        data: { ...data }
    };

    control.events.push(event);
    const limit = Math.max(1, control.policy.telemetry.eventLimit || 50);
    if (control.events.length > limit) {
        control.events.splice(0, control.events.length - limit);
    }

    return event;
}

export function getEmpireEvents() {
    return ensureEmpireControl().events;
}
