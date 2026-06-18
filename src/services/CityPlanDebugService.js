import BaseService from '../core/BaseService.js';
import { buildCityPlanDebug } from '../planning/CityPlanDebug.js';
import { migrateCityPlanToCurrent } from '../planning/CityPlanMigration.js';

const DEBUG_UPDATE_INTERVAL = 50;

class CityPlanDebugService extends BaseService {
    analyze() {
        if (typeof Game === 'undefined' || typeof Memory === 'undefined' || !Memory.rooms) return;
        if (typeof Game.time === 'number' && Game.time % DEBUG_UPDATE_INTERVAL !== 0) return;

        for (const roomName in Game.rooms) {
            const roomMemory = Memory.rooms[roomName];
            const migration = roomMemory ? migrateCityPlanToCurrent(roomMemory.cityPlan) : { changed: false, cityPlan: null };
            if (roomMemory && migration.changed) {
                roomMemory.cityPlan = migration.cityPlan;
                roomMemory.cityPlanMigration = {
                    updatedAt: typeof Game !== 'undefined' && typeof Game.time === 'number' ? Game.time : 0,
                    fromVersion: migration.fromVersion,
                    toVersion: migration.toVersion,
                    changed: migration.changed,
                    warnings: Array.isArray(migration.warnings) ? migration.warnings.slice() : [],
                    changes: migration.changes ? { ...migration.changes } : null
                };
            }
            const cityPlan = migration.cityPlan || (roomMemory && roomMemory.cityPlan);
            if (!cityPlan) continue;
            roomMemory.cityPlanDebug = buildCityPlanDebug(roomName, cityPlan);
            updateRuntimeObservation(roomMemory, roomMemory.cityPlanDebug);
        }
    }
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

export default CityPlanDebugService;
