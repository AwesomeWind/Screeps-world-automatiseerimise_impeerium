import BaseService from '../core/BaseService.js';
import { buildCityPlanDebug } from '../planning/CityPlanDebug.js';
import {
    buildLegacyCleanupReadiness,
    cleanupLegacyAssetFields,
    buildLegacyWorkPositionCleanupReadiness,
    cleanupLegacyWorkPositionFields
} from '../planning/CityPlanLegacyCleanup.js';
import { migrateCityPlan } from '../planning/CityPlanMigration.js';
import { CITY_PLAN_SCHEMA_VERSION } from '../planning/CityPlanSchema.js';

const DEBUG_UPDATE_INTERVAL = 50;
const ROLLBACK_ACTION_COOLDOWN_TICKS = 150;
const ROLLBACK_ACTION_HISTORY_LIMIT = 5;

class CityPlanDebugService extends BaseService {
    analyze() {
        if (typeof Game === 'undefined' || typeof Memory === 'undefined' || !Memory.rooms) return;
        if (typeof Game.time === 'number' && Game.time % DEBUG_UPDATE_INTERVAL !== 0) return;

        applyEmpireAssetImportRollbackAction();

        for (const roomName in Game.rooms) {
            const roomMemory = Memory.rooms[roomName];
            applyAssetImportRollbackAction(roomMemory);
            const migration = roomMemory ? migrateRoomCityPlan(roomMemory) : { changed: false, cityPlan: null };
            if (roomMemory && migration.changed) {
                roomMemory.cityPlan = migration.cityPlan;
                roomMemory.cityPlanMigration = {
                    updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
                    fromVersion: migration.fromVersion,
                    toVersion: migration.toVersion,
                    changed: migration.changed,
                    warnings: Array.isArray(migration.warnings) ? migration.warnings.slice() : [],
                    changes: migration.changes ? { ...migration.changes } : null,
                    assetImportReadiness: migration.assetImportReadiness ? {
                        ...migration.assetImportReadiness,
                        missingCanonicalAssetRoles: Array.isArray(migration.assetImportReadiness.missingCanonicalAssetRoles)
                            ? migration.assetImportReadiness.missingCanonicalAssetRoles.slice()
                            : [],
                        regeneratedAssetRoles: Array.isArray(migration.assetImportReadiness.regeneratedAssetRoles)
                            ? migration.assetImportReadiness.regeneratedAssetRoles.slice()
                            : []
                    } : null
                };
            }
            const cityPlan = migration.cityPlan || (roomMemory && roomMemory.cityPlan);
            if (!cityPlan) continue;
            roomMemory.cityPlanDebug = buildCityPlanDebug(roomName, cityPlan);
            updateAssetImportObservation(roomMemory, migration, roomMemory.cityPlanDebug);
            updateAssetImportExecution(roomMemory, migration, roomMemory.cityPlanDebug);
            updateAssetImportRehearsal(roomMemory, roomMemory.cityPlanDebug);
            updateRuntimeObservation(roomMemory, roomMemory.cityPlanDebug);
            updateAssetFallbackObservation(roomMemory, roomMemory.cityPlanDebug);
            updateLegacyCleanupReadiness(roomMemory, roomMemory.cityPlanDebug);
            updateWorkPositionCleanupObservation(roomMemory, roomMemory.cityPlanDebug);
            updateLegacyWorkPositionCleanupReadiness(roomMemory, roomMemory.cityPlanDebug);
            applyLegacyAssetFieldCleanup(roomMemory, roomMemory.cityPlanDebug);
            applyLegacyWorkPositionFieldCleanup(roomMemory, roomMemory.cityPlanDebug);
            updateAssetImportRetirementGate(roomMemory, roomMemory.cityPlanDebug);
            updateAssetImportRollout(roomMemory, roomMemory.cityPlanDebug);
            updateAssetImportRollbackGate(roomMemory, roomMemory.cityPlanDebug);
        }

        updateAssetImportRollbackSummary();
    }
}

function applyEmpireAssetImportRollbackAction() {
    if (typeof Memory === 'undefined' || !Memory.empire || !Memory.empire.cityPlanAssetImportRollbackAction) return;

    const action = Memory.empire.cityPlanAssetImportRollbackAction;
    const requestedRooms = Array.isArray(action.rooms) ? action.rooms.slice() : [];
    const dispatchedRooms = [];
    const skippedRooms = [];
    const blockedReasonsByRoom = {};
    const targetMode = action.targetMode === 'disabled' ? 'disabled' : 'enabled';

    for (const roomName of requestedRooms) {
        const roomMemory = Memory.rooms && Memory.rooms[roomName];
        if (!roomMemory) {
            skippedRooms.push(roomName);
            continue;
        }
        if (roomMemory.cityPlanAssetImportRollbackAction) {
            blockedReasonsByRoom[roomName] = ['room_action_already_pending'];
            continue;
        }

        roomMemory.cityPlanAssetImportRollbackAction = {
            requestedAt: typeof action.requestedAt === 'number'
                ? action.requestedAt
                : (typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0),
            targetMode,
            reason: typeof action.reason === 'string' ? action.reason : 'manual_operator_batch_rollback'
        };
        dispatchedRooms.push(roomName);
    }

    const execution = {
        updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
        applied: dispatchedRooms.length > 0,
        targetMode,
        requestedRooms,
        dispatchedRooms,
        skippedRooms,
        blockedReasonsByRoom,
        reason: typeof action.reason === 'string' ? action.reason : 'manual_operator_batch_rollback'
    };
    Memory.empire.cityPlanAssetImportRollbackBatchExecution = execution;
    appendLimitedHistory(Memory.empire, 'cityPlanAssetImportRollbackBatchHistory', execution);

    delete Memory.empire.cityPlanAssetImportRollbackAction;
}

function applyAssetImportRollbackAction(roomMemory) {
    if (!roomMemory || !roomMemory.cityPlanAssetImportRollbackAction) return;

    const action = roomMemory.cityPlanAssetImportRollbackAction;
    const rollout = roomMemory.cityPlanAssetImportRollout || {};
    const gate = roomMemory.cityPlanAssetImportRollbackGate || {};
    const targetMode = action.targetMode === 'disabled' ? 'disabled' : 'enabled';
    const previousRequestedMode = rollout.requestedMode === 'disabled' ? 'disabled' : 'enabled';
    const previousEffectiveMode = rollout.effectiveMode === 'disabled' ? 'disabled' : 'enabled';
    const previousExecution = roomMemory.cityPlanAssetImportRollbackExecution || {};
    const cooldownUntil = typeof previousExecution.cooldownUntil === 'number' ? previousExecution.cooldownUntil : 0;
    const blockedReasons = [];
    let applied = false;
    let nextCooldownUntil = cooldownUntil;

    if (targetMode !== 'enabled') blockedReasons.push('unsupported_rollback_target_mode');
    if (typeof Game !== 'undefined' && typeof Game.time === 'number' && Game.time < cooldownUntil) {
        blockedReasons.push('rollback_action_cooldown_active');
    }
    if (!gate.readyForManualRollback) blockedReasons.push('rollback_gate_not_ready');

    if (blockedReasons.length === 0) {
        roomMemory.cityPlanAssetImportRollout = {
            ...rollout,
            updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
            requestedMode: 'enabled',
            effectiveMode: 'enabled',
            readyForDisabled: false,
            blockedReasons: []
        };
        applied = true;
        nextCooldownUntil = (typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0) +
            ROLLBACK_ACTION_COOLDOWN_TICKS;
    }

    const nextRollout = roomMemory.cityPlanAssetImportRollout || {};
    const execution = {
        updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
        applied,
        targetMode,
        previousRequestedMode,
        nextRequestedMode: nextRollout.requestedMode === 'disabled' ? 'disabled' : 'enabled',
        previousEffectiveMode,
        reason: typeof action.reason === 'string' ? action.reason : 'manual_operator_rollback',
        blockedReasons,
        cooldownUntil: nextCooldownUntil
    };
    roomMemory.cityPlanAssetImportRollbackExecution = execution;
    appendLimitedHistory(roomMemory, 'cityPlanAssetImportRollbackHistory', execution);
    delete roomMemory.cityPlanAssetImportRollbackAction;
}

function appendLimitedHistory(owner, key, entry) {
    if (!owner || !key || !entry) return;

    const history = Array.isArray(owner[key]) ? owner[key].slice() : [];
    history.push(entry);
    owner[key] = history.slice(-ROLLBACK_ACTION_HISTORY_LIMIT);
}

function migrateRoomCityPlan(roomMemory) {
    if (!roomMemory) return { changed: false, cityPlan: null };

    const rollout = roomMemory.cityPlanAssetImportRollout || {};
    const assetImportMode = rollout.effectiveMode === 'disabled' ? 'disabled' : 'enabled';

    const migration = migrateCityPlan(roomMemory.cityPlan, CITY_PLAN_SCHEMA_VERSION, {
        assetImportMode
    });

    return {
        ...migration,
        assetImportMode
    };
}

function updateRuntimeObservation(roomMemory, debugSummary) {
    if (!roomMemory || !debugSummary || !debugSummary.v3Readiness) return;

    const previous = roomMemory.cityPlanRuntimeObservation || {};
    const ready = !!debugSummary.v3Readiness.readyForRuntimeFallbackDisable;
    const nextStreak = ready ? ((previous.readyStreak || 0) + 1) : 0;

    roomMemory.cityPlanRuntimeObservation = {
        updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
        readyStreak: nextStreak,
        readyForRuntimeFallbackDisable: ready
    };
}

function updateAssetImportObservation(roomMemory, migration, debugSummary) {
    if (!roomMemory || !migration || !migration.assetImportReadiness) return;

    const previous = roomMemory.cityPlanAssetImportObservation || {};
    const readiness = migration.assetImportReadiness;
    const ready = !!readiness.readyForAssetImportRemoval;
    const nextStreak = ready ? ((previous.readyStreak || 0) + 1) : 0;
    const observation = {
        updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
        readyStreak: nextStreak,
        readyForAssetImportRemoval: nextStreak >= 3,
        legacyAssetImportUsed: !!readiness.legacyAssetImportUsed,
        canonicalCompleteBeforeImport: !!readiness.canonicalCompleteBeforeImport,
        missingCanonicalAssetRoles: Array.isArray(readiness.missingCanonicalAssetRoles)
            ? readiness.missingCanonicalAssetRoles.slice()
            : [],
        regeneratedAssetRoles: Array.isArray(readiness.regeneratedAssetRoles)
            ? readiness.regeneratedAssetRoles.slice()
            : []
    };

    roomMemory.cityPlanAssetImportObservation = observation;
    if (debugSummary) {
        debugSummary.assetImportObservation = {
            ...observation,
            missingCanonicalAssetRoles: observation.missingCanonicalAssetRoles.slice(),
            regeneratedAssetRoles: observation.regeneratedAssetRoles.slice()
        };
    }
}

function updateAssetImportExecution(roomMemory, migration, debugSummary) {
    if (!roomMemory || !migration) return;

    const rollout = roomMemory.cityPlanAssetImportRollout || {};
    const readiness = migration.assetImportReadiness || {};
    const consumedMode = migration.assetImportMode === 'disabled' ? 'disabled' : 'enabled';
    const missingCanonicalAssetRoles = Array.isArray(readiness.missingCanonicalAssetRoles)
        ? readiness.missingCanonicalAssetRoles.slice()
        : [];
    const legacyAssetImportUsed = !!readiness.legacyAssetImportUsed;
    const rollbackReasons = [];

    if (consumedMode === 'disabled' && missingCanonicalAssetRoles.length > 0) {
        rollbackReasons.push('disabled_mode_missing_canonical_assets');
    }
    if (consumedMode === 'enabled' && legacyAssetImportUsed) {
        rollbackReasons.push('legacy_asset_import_still_required');
    }

    const execution = {
        updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
        consumedMode,
        requestedMode: rollout.requestedMode === 'disabled' ? 'disabled' : 'enabled',
        effectiveMode: rollout.effectiveMode === 'disabled' ? 'disabled' : 'enabled',
        plannedStructuresAdded: migration.changes ? migration.changes.plannedStructuresAdded : 0,
        legacyAssetImportUsed,
        missingCanonicalAssetRoles,
        rollbackRecommended: rollbackReasons.length > 0,
        rollbackReasons
    };

    roomMemory.cityPlanAssetImportExecution = execution;
    if (debugSummary) {
        debugSummary.assetImportExecution = {
            ...execution,
            missingCanonicalAssetRoles: execution.missingCanonicalAssetRoles.slice(),
            rollbackReasons: execution.rollbackReasons.slice()
        };
    }
}

function updateAssetImportRehearsal(roomMemory, debugSummary) {
    if (!roomMemory || !roomMemory.cityPlan) return;

    const rehearsal = migrateCityPlan(roomMemory.cityPlan, CITY_PLAN_SCHEMA_VERSION, {
        assetImportMode: 'disabled'
    });
    const readiness = rehearsal.assetImportReadiness || {};
    const observation = {
        updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
        readyForDisabledAssetImport: !!readiness.readyForAssetImportRemoval,
        disabledModeWouldMissCanonicalAssets: Array.isArray(readiness.missingCanonicalAssetRoles) &&
            readiness.missingCanonicalAssetRoles.length > 0,
        missingCanonicalAssetRoles: Array.isArray(readiness.missingCanonicalAssetRoles)
            ? readiness.missingCanonicalAssetRoles.slice()
            : [],
        plannedStructuresAdded: rehearsal.changes ? rehearsal.changes.plannedStructuresAdded : 0,
        workPositionsAdded: rehearsal.changes ? rehearsal.changes.workPositionsAdded : 0,
        runtimeDefaultsAdded: rehearsal.changes ? rehearsal.changes.runtimeDefaultsAdded : 0
    };

    roomMemory.cityPlanAssetImportRehearsal = observation;
    if (debugSummary) {
        debugSummary.assetImportRehearsal = {
            ...observation,
            missingCanonicalAssetRoles: observation.missingCanonicalAssetRoles.slice()
        };
    }
}

function updateAssetImportRetirementGate(roomMemory, debugSummary) {
    if (!roomMemory) return;

    const observation = roomMemory.cityPlanAssetImportObservation || {};
    const rehearsal = roomMemory.cityPlanAssetImportRehearsal || {};
    const cleanupReadiness = roomMemory.cityPlanLegacyCleanupReadiness || {};
    const cleanupComplete = !hasLegacyAssetCoordinates(roomMemory.cityPlan || {}) &&
        !!cleanupReadiness.readyForControllerAssetFieldRemoval &&
        !!cleanupReadiness.readyForSourceAssetFieldRemoval;
    const observationReady = !!observation.readyForAssetImportRemoval;
    const rehearsalReady = !!rehearsal.readyForDisabledAssetImport;
    const disabledModeWouldMissCanonicalAssets = !!rehearsal.disabledModeWouldMissCanonicalAssets;
    const blockingReasons = [];

    if (!observationReady) blockingReasons.push('asset_import_observation_not_stable');
    if (!rehearsalReady || disabledModeWouldMissCanonicalAssets) {
        blockingReasons.push('disabled_rehearsal_missing_canonical_assets');
    }
    if (!cleanupComplete) blockingReasons.push('legacy_asset_cleanup_incomplete');

    const gate = {
        updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
        readyForDefaultDisabled: blockingReasons.length === 0,
        observationReady,
        rehearsalReady,
        disabledModeWouldMissCanonicalAssets,
        cleanupComplete,
        blockingReasons,
        missingCanonicalAssetRoles: Array.isArray(rehearsal.missingCanonicalAssetRoles)
            ? rehearsal.missingCanonicalAssetRoles.slice()
            : []
    };

    roomMemory.cityPlanAssetImportRetirementGate = gate;
    if (debugSummary) {
        debugSummary.assetImportRetirementGate = {
            ...gate,
            blockingReasons: gate.blockingReasons.slice(),
            missingCanonicalAssetRoles: gate.missingCanonicalAssetRoles.slice()
        };
    }
}

function updateAssetImportRollout(roomMemory, debugSummary) {
    if (!roomMemory) return;

    const gate = roomMemory.cityPlanAssetImportRetirementGate || {};
    const previous = roomMemory.cityPlanAssetImportRollout || {};
    const requestedMode = previous.requestedMode === 'disabled' ? 'disabled' : 'enabled';
    const readyForDisabled = !!gate.readyForDefaultDisabled;
    const effectiveMode = requestedMode === 'disabled' && readyForDisabled ? 'disabled' : 'enabled';
    const blockedReasons = requestedMode === 'disabled' && !readyForDisabled
        ? (Array.isArray(gate.blockingReasons) ? gate.blockingReasons.slice() : [])
        : [];
    const rollout = {
        updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
        requestedMode,
        effectiveMode,
        readyForDisabled,
        blockedReasons,
        rollbackMode: 'enabled'
    };

    roomMemory.cityPlanAssetImportRollout = rollout;
    if (debugSummary) {
        debugSummary.assetImportRollout = {
            ...rollout,
            blockedReasons: rollout.blockedReasons.slice()
        };
    }
}

function updateAssetImportRollbackGate(roomMemory, debugSummary) {
    if (!roomMemory) return;

    const execution = roomMemory.cityPlanAssetImportExecution || null;
    const rollout = roomMemory.cityPlanAssetImportRollout || {};
    const previous = roomMemory.cityPlanAssetImportRollbackGate || {};
    const rollbackRecommended = !!(execution && execution.rollbackRecommended);
    const readyStreak = rollbackRecommended ? ((previous.readyStreak || 0) + 1) : 0;
    const stableRollbackRecommended = readyStreak >= 2;
    const blockingReasons = [];

    if (!execution) {
        blockingReasons.push('execution_observation_missing');
    }
    if (!stableRollbackRecommended) {
        blockingReasons.push('rollback_observation_not_stable');
    }
    if (rollout.effectiveMode !== 'disabled') {
        blockingReasons.push('rollout_not_currently_disabled');
    }

    const gate = {
        updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
        recommendedMode: 'enabled',
        rollbackRecommended,
        stableRollbackRecommended,
        readyForManualRollback: rollbackRecommended &&
            stableRollbackRecommended &&
            rollout.effectiveMode === 'disabled',
        consumedMode: execution ? execution.consumedMode : 'enabled',
        requestedMode: rollout.requestedMode === 'disabled' ? 'disabled' : 'enabled',
        effectiveMode: rollout.effectiveMode === 'disabled' ? 'disabled' : 'enabled',
        readyStreak,
        rollbackReasons: execution && Array.isArray(execution.rollbackReasons)
            ? execution.rollbackReasons.slice()
            : [],
        blockingReasons
    };

    roomMemory.cityPlanAssetImportRollbackGate = gate;
    if (debugSummary) {
        debugSummary.assetImportRollbackGate = {
            ...gate,
            rollbackReasons: gate.rollbackReasons.slice(),
            blockingReasons: gate.blockingReasons.slice()
        };
    }
}

function updateAssetImportRollbackSummary() {
    if (typeof Memory === 'undefined') return;
    if (!Memory.empire) Memory.empire = {};

    const observedRooms = [];
    const rollbackRecommendedRooms = [];
    const stableRollbackRooms = [];
    const readyForManualRollbackRooms = [];
    const recoveredRooms = [];
    const rooms = {};

    for (const roomName in Memory.rooms) {
        const roomMemory = Memory.rooms[roomName];
        const gate = roomMemory && roomMemory.cityPlanAssetImportRollbackGate;
        if (!gate) continue;

        observedRooms.push(roomName);
        if (gate.rollbackRecommended) rollbackRecommendedRooms.push(roomName);
        if (gate.stableRollbackRecommended) stableRollbackRooms.push(roomName);
        if (gate.readyForManualRollback) readyForManualRollbackRooms.push(roomName);
        if (gate.stableRollbackRecommended && gate.effectiveMode !== 'disabled') {
            recoveredRooms.push(roomName);
        }

        rooms[roomName] = {
            recommendedMode: gate.recommendedMode === 'disabled' ? 'disabled' : 'enabled',
            effectiveMode: gate.effectiveMode === 'disabled' ? 'disabled' : 'enabled',
            readyStreak: typeof gate.readyStreak === 'number' ? gate.readyStreak : 0,
            rollbackReasons: Array.isArray(gate.rollbackReasons) ? gate.rollbackReasons.slice() : [],
            blockingReasons: Array.isArray(gate.blockingReasons) ? gate.blockingReasons.slice() : []
        };
    }

    Memory.empire.cityPlanAssetImportRollbackSummary = {
        updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
        observedRooms,
        rollbackRecommendedRooms,
        stableRollbackRooms,
        readyForManualRollbackRooms,
        recoveredRooms,
        actionRequired: readyForManualRollbackRooms.length > 0,
        rooms
    };
}

function updateAssetFallbackObservation(roomMemory, debugSummary) {
    if (!roomMemory || !debugSummary || !debugSummary.v3Readiness || !debugSummary.assetFallbackReadiness) return;

    const previous = roomMemory.cityPlanAssetFallbackObservation || {};
    const previousStreakByRole = previous.streakByRole || {};
    const roleKeys = Object.keys(debugSummary.assetFallbackReadiness);
    const readyByRole = {};
    const streakByRole = {};

    for (const role of roleKeys) {
        const roleReady = !!debugSummary.assetFallbackReadiness[role].fallbackFree;
        readyByRole[role] = roleReady;
        streakByRole[role] = roleReady ? ((previousStreakByRole[role] || 0) + 1) : 0;
    }

    const ready = !!debugSummary.v3Readiness.assetFallbackFree;
    const nextStreak = ready ? ((previous.readyStreak || 0) + 1) : 0;
    const observationStable = nextStreak >= 3;

    roomMemory.cityPlanAssetFallbackObservation = {
        updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
        readyStreak: nextStreak,
        readyForAssetFallbackDisable: observationStable,
        readyByRole,
        streakByRole
    };

    debugSummary.v3Readiness.assetFallbackObservationStable = observationStable;
    debugSummary.v3Readiness.readyForAssetFallbackDisable = debugSummary.v3Readiness.schemaCurrent &&
        debugSummary.v3Readiness.migrationObserved &&
        debugSummary.v3Readiness.sourceRuntimeValid &&
        debugSummary.v3Readiness.assetFallbackFree &&
        observationStable;
}

function updateLegacyCleanupReadiness(roomMemory, debugSummary) {
    if (!roomMemory || !debugSummary) return;

    const readiness = buildLegacyCleanupReadiness(debugSummary, roomMemory.cityPlanAssetFallbackObservation || {});
    roomMemory.cityPlanLegacyCleanupReadiness = readiness;
    debugSummary.legacyCleanupReadiness = readiness;
}

function updateWorkPositionCleanupObservation(roomMemory, debugSummary) {
    if (!roomMemory || !roomMemory.cityPlan || !debugSummary || !debugSummary.v3Readiness || !debugSummary.validation) return;

    const previous = roomMemory.cityPlanWorkPositionCleanupObservation || {};
    const runtimeReady = !!debugSummary.v3Readiness.readyForRuntimeFallbackDisable;
    const controllerReady = !!(runtimeReady &&
        debugSummary.v3Readiness.migrationObserved &&
        debugSummary.validation.valid &&
        roomMemory.cityPlan.workPositions &&
        roomMemory.cityPlan.workPositions.controller &&
        roomMemory.cityPlan.workPositions.controller.upgrade &&
        roomMemory.cityPlan.workPositions.controller.upgrade.primary);
    const sourceReady = runtimeReady &&
        hasCanonicalSourceWorkPositions(roomMemory.cityPlan) &&
        debugSummary.v3Readiness.migrationObserved &&
        debugSummary.validation.valid;
    const roomReady = controllerReady && sourceReady;

    roomMemory.cityPlanWorkPositionCleanupObservation = {
        updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
        readyStreak: roomReady ? ((previous.readyStreak || 0) + 1) : 0,
        controllerReadyStreak: controllerReady ? ((previous.controllerReadyStreak || 0) + 1) : 0,
        sourceReadyStreak: sourceReady ? ((previous.sourceReadyStreak || 0) + 1) : 0,
        readyForWorkPositionFieldRemoval: roomReady ? ((previous.readyStreak || 0) + 1) >= 3 : false
    };
}

function updateLegacyWorkPositionCleanupReadiness(roomMemory, debugSummary) {
    if (!roomMemory || !roomMemory.cityPlan || !debugSummary) return;

    const readiness = buildLegacyWorkPositionCleanupReadiness(
        roomMemory.cityPlan,
        debugSummary,
        roomMemory.cityPlanWorkPositionCleanupObservation || {}
    );
    roomMemory.cityPlanLegacyWorkPositionCleanupReadiness = readiness;
    debugSummary.legacyWorkPositionCleanupReadiness = readiness;
}

function applyLegacyAssetFieldCleanup(roomMemory, debugSummary) {
    if (!roomMemory || !roomMemory.cityPlan || !debugSummary || !debugSummary.legacyCleanupReadiness) return;

    const cleanup = cleanupLegacyAssetFields(roomMemory.cityPlan, debugSummary.legacyCleanupReadiness, {
        cleanupSourceFields: true
    });
    roomMemory.cityPlanLegacyCleanup = {
        updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
        changed: cleanup.changed,
        removedFields: cleanup.removedFields.slice(),
        controllerFieldsRemoved: cleanup.controllerFieldsRemoved,
        sourceFieldsRemoved: cleanup.sourceFieldsRemoved
    };
    debugSummary.legacyCleanupExecution = roomMemory.cityPlanLegacyCleanup;
}

function applyLegacyWorkPositionFieldCleanup(roomMemory, debugSummary) {
    if (!roomMemory || !roomMemory.cityPlan || !debugSummary || !debugSummary.legacyWorkPositionCleanupReadiness) return;

    const cleanup = cleanupLegacyWorkPositionFields(roomMemory.cityPlan, debugSummary.legacyWorkPositionCleanupReadiness);
    const previous = roomMemory.cityPlanLegacyCleanup || {
        updatedAt: 0,
        changed: false,
        removedFields: [],
        controllerFieldsRemoved: false,
        sourceFieldsRemoved: false
    };
    roomMemory.cityPlanLegacyCleanup = {
        ...previous,
        updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
        changed: previous.changed || cleanup.changed,
        removedFields: previous.removedFields.concat(cleanup.removedFields),
        workPositionFieldsRemoved: cleanup.workPositionFieldsRemoved,
        controllerWorkPositionFieldsRemoved: cleanup.controllerWorkPositionFieldsRemoved,
        sourceWorkPositionFieldsRemoved: cleanup.sourceWorkPositionFieldsRemoved
    };
    debugSummary.legacyCleanupExecution = roomMemory.cityPlanLegacyCleanup;
}

function hasCanonicalSourceWorkPositions(cityPlan = {}) {
    for (const sourceId of Object.keys((cityPlan.sources || {}))) {
        const sourcePlan = cityPlan.sources[sourceId];
        if (!sourcePlan || !sourcePlan.primaryMiningPos) continue;
        if (!(cityPlan.workPositions &&
            cityPlan.workPositions.sources &&
            cityPlan.workPositions.sources[sourceId] &&
            cityPlan.workPositions.sources[sourceId].mining &&
            cityPlan.workPositions.sources[sourceId].mining.primary)) {
            return false;
        }
    }
    return true;
}

function hasLegacyAssetCoordinates(cityPlan = {}) {
    if (cityPlan.controller && (cityPlan.controller.containerPos || cityPlan.controller.linkPos)) {
        return true;
    }

    for (const sourceId of Object.keys(cityPlan.sources || {})) {
        const sourcePlan = cityPlan.sources[sourceId];
        if (!sourcePlan) continue;
        if (sourcePlan.containerPos || sourcePlan.linkPos) return true;
    }

    return false;
}

export default CityPlanDebugService;
