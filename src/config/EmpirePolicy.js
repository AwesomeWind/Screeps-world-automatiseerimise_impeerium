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
        metricsInterval: 10,
        historyLimit: 50,
        metricsHistoryLimit: 50,
        metricsHistoryInterval: 50
    },
    resourceReservations: {
        ttl: 5,
        maxTaskTicks: 50,
        maxOwnersPerRoom: 200
    },
    economyRecovery: {
        enabled: true,
        reserveCritical: 5000
    },
    spawnIntake: {
        maxReceiptsPerRoom: 200
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

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeFinite(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isUnitRatio(value) {
    return isNonNegativeFinite(value) && value <= 1;
}

function isValidReadinessPolicy(readiness) {
    return isRecord(readiness) &&
        Number.isSafeInteger(readiness.minSamples) && readiness.minSamples >= 0 &&
        isUnitRatio(readiness.minKnownRatio) &&
        isUnitRatio(readiness.maxCriticalRatio) &&
        isUnitRatio(readiness.maxFlipRatio) &&
        isNonNegativeFinite(readiness.maxSnapshotAge);
}

export function validateCapabilityControlPolicy(policy) {
    if (!isRecord(policy)) return ['invalid_capability_control_policy'];
    const blockers = [];
    if (typeof policy.enabled !== 'boolean') blockers.push('invalid_capability_control_enabled');
    if (typeof policy.emergencyDisable !== 'boolean') blockers.push('invalid_capability_control_emergency_disable');
    if (!Number.isSafeInteger(policy.fallbackSuspendCount) || policy.fallbackSuspendCount <= 0) {
        blockers.push('invalid_fallback_suspend_count');
    }
    if (!isNonNegativeFinite(policy.controllerEmergencyTicks)) blockers.push('invalid_controller_emergency_ticks');
    if (!isValidReadinessPolicy(policy.readiness)) blockers.push('invalid_readiness_policy');
    const upgradeWork = policy.capabilities && policy.capabilities.upgradeWork;
    if (!isRecord(upgradeWork) || !['shadow', 'active'].includes(upgradeWork.defaultMode)) {
        blockers.push('invalid_upgrade_work_default_mode');
    }
    return blockers;
}

function resolveCapabilityOverride(entry, source) {
    const blockers = [];
    if (!isRecord(entry)) blockers.push('invalid_capability_override');
    if (isRecord(entry) && entry.value !== 'shadow' && entry.value !== 'active') {
        blockers.push('invalid_capability_override_value');
    }
    if (isRecord(entry) && entry.value === 'active' &&
        (typeof entry.reason !== 'string' || entry.reason.trim().length === 0)) {
        blockers.push('invalid_capability_override_reason');
    }
    if (isRecord(entry) && entry.expiresAt !== undefined && !isNonNegativeFinite(entry.expiresAt)) {
        blockers.push('invalid_capability_override_expires_at');
    }
    if (blockers.length > 0) {
        return {
            value: isRecord(entry) && entry.value === 'active' ? 'active' : 'shadow',
            source,
            reason: isRecord(entry) ? entry.reason : undefined,
            expiresAt: isRecord(entry) ? entry.expiresAt : undefined,
            blockers
        };
    }
    if (entry.expiresAt !== undefined && entry.expiresAt < Game.time) return null;
    return {
        value: entry.value,
        source,
        reason: entry.reason,
        expiresAt: entry.expiresAt
    };
}

export function resolveCapabilityMode(roomName, capability) {
    const key = `capability:${capability}`;
    const defaultCapability = DEFAULT_EMPIRE_POLICY.capabilityControl.capabilities[capability];
    const defaultMode = defaultCapability && defaultCapability.defaultMode;
    const policy = typeof Memory !== 'undefined' && Memory.empire && Memory.empire.control
        ? Memory.empire.control.policy
        : null;
    const capabilityPolicy = policy && policy.capabilityControl && policy.capabilityControl.capabilities
        ? policy.capabilityControl.capabilities[capability]
        : null;
    const fallback = capabilityPolicy && (capabilityPolicy.defaultMode === 'shadow' || capabilityPolicy.defaultMode === 'active')
        ? capabilityPolicy.defaultMode
        : defaultMode;
    const roomOverrides = policy && policy.overrides && policy.overrides.rooms
        ? policy.overrides.rooms[roomName]
        : null;
    const roomMode = roomOverrides && Object.prototype.hasOwnProperty.call(roomOverrides, key)
        ? resolveCapabilityOverride(roomOverrides[key], 'room')
        : null;
    if (roomMode) return roomMode;
    const empireOverrides = policy && policy.overrides ? policy.overrides.empire : null;
    const empireMode = empireOverrides && Object.prototype.hasOwnProperty.call(empireOverrides, key)
        ? resolveCapabilityOverride(empireOverrides[key], 'empire')
        : null;
    if (empireMode) return empireMode;
    return {
        value: fallback,
        source: 'default',
        reason: undefined,
        expiresAt: undefined
    };
}
