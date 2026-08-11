export const EMPIRE_CONTROL_SCHEMA_VERSION = 1;

export const DEFAULT_EMPIRE_POLICY = {
    autoExpansion: true,
    autoMarket: true,
    autoWar: true,
    scheduler: {
        enforce: false,
        constrainedBelow: 7000,
        criticalBelow: 3000,
        recoveryAbove: 8000
    },
    telemetry: {
        enabled: true,
        persistInterval: 10,
        eventLimit: 50,
        metricsInterval: 10
    },
    overrides: {
        empire: {},
        rooms: {}
    }
};

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function mergeDefaults(target, defaults) {
    for (const key in defaults) {
        const fallback = defaults[key];
        if (target[key] === undefined) target[key] = clone(fallback);
        else if (fallback && typeof fallback === 'object' && !Array.isArray(fallback)) {
            mergeDefaults(target[key], fallback);
        }
    }
    return target;
}

export function ensureEmpireControl() {
    if (!Memory.empire) Memory.empire = {};
    if (!Memory.empire.control) Memory.empire.control = {};
    const control = Memory.empire.control;
    if (control.schemaVersion === undefined) control.schemaVersion = EMPIRE_CONTROL_SCHEMA_VERSION;
    if (!control.policy) control.policy = {};
    mergeDefaults(control.policy, DEFAULT_EMPIRE_POLICY);
    if (!control.runtime) control.runtime = {};
    if (!control.telemetry) control.telemetry = {};
    if (!control.metrics) control.metrics = { rooms: {} };
    if (!control.events) control.events = [];
    return control;
}

function activeOverride(entry) {
    if (!entry || typeof entry !== 'object' || entry.value === undefined) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt < Game.time) return undefined;
    return entry.value;
}

export function resolvePolicy(key, context = {}, fallback) {
    const policy = ensureEmpireControl().policy;
    const roomOverride = context.roomName && policy.overrides.rooms[context.roomName]
        ? activeOverride(policy.overrides.rooms[context.roomName][key])
        : undefined;
    if (roomOverride !== undefined) return roomOverride;
    const empireOverride = activeOverride(policy.overrides.empire[key]);
    if (empireOverride !== undefined) return empireOverride;
    return policy[key] === undefined ? fallback : policy[key];
}
