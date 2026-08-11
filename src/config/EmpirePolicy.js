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
    roomGovernor: {
        enabled: true,
        shadow: true,
        interval: 10,
        stableSamples: 3,
        maxSnapshotAge: 50,
        eventCooldown: 50,
        thresholds: {
            criticalScore: 30,
            strainedScore: 60,
            spawnEnergyCriticalRatio: 0.5,
            reserveCritical: 5000,
            reserveMature: 50000,
            reserveIndustrial: 100000,
            constructionHigh: 5,
            maintenanceHigh: 3,
            sourceWorkPerSource: 5,
            sourceEnergyPerTick: 10,
            carryCapacityPerPart: 50,
            replacementLeadTicks: 50
        }
    },
    capabilityControl: {
        enabled: true,
        emergencyDisable: false,
        fallbackSuspendCount: 3,
        controllerEmergencyTicks: 5000,
        readiness: {
            minSamples: 50,
            minKnownRatio: 0.95,
            maxCriticalRatio: 0.05,
            maxFlipRatio: 0.10,
            maxSnapshotAge: 20
        },
        capabilities: {
            upgradeWork: { defaultMode: 'shadow' }
        }
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
    if (!control.rooms) control.rooms = {};
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

function resolveCapabilityOverride(entry, source) {
    if (!entry || typeof entry !== 'object' || entry.expiresAt < Game.time) return null;
    if (entry.value !== 'shadow' && entry.value !== 'active') return null;
    return {
        value: entry.value,
        source,
        reason: entry.reason,
        expiresAt: entry.expiresAt
    };
}

export function resolveCapabilityMode(roomName, capability) {
    const control = ensureEmpireControl();
    const key = `capability:${capability}`;
    const capabilityPolicy = control.policy.capabilityControl.capabilities[capability];
    const fallback = capabilityPolicy.defaultMode;
    const roomOverrides = control.policy.overrides.rooms[roomName];
    const roomMode = roomOverrides && resolveCapabilityOverride(roomOverrides[key], 'room');
    if (roomMode) return roomMode;
    const empireMode = resolveCapabilityOverride(control.policy.overrides.empire[key], 'empire');
    if (empireMode) return empireMode;
    return {
        value: fallback,
        source: 'default',
        reason: undefined,
        expiresAt: undefined
    };
}
