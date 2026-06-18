import BaseService from '../core/BaseService.js';
import MemoryConfig from '../config/MemoryConfig.js';
import { parsedCoreBlueprint } from './BaseBlueprint.js';
import { migrateCityPlanToCurrent } from './CityPlanMigration.js';
import { CITY_PLAN_SCHEMA_VERSION, validateCityPlan } from './CityPlanSchema.js';

const CITY_PLAN_VERSION = 1;

class CityPlannerService extends BaseService {
    analyze() {
        if (Game.time % 100 !== 0) return;

        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            if (!MemoryConfig.flag(roomName, 'planning', true)) continue;

            const center = MemoryConfig.baseCenter(room);
            if (!center) continue;
            const roomMemory = MemoryConfig.room(room.name);
            const migration = migrateCityPlanToCurrent(roomMemory.cityPlan);
            if (migration.changed) {
                roomMemory.cityPlan = migration.cityPlan;
            }
            const nextPlan = this.buildCityPlan(room, center);
            if (!roomMemory.cityPlan ||
                roomMemory.cityPlan.version !== CITY_PLAN_VERSION ||
                roomMemory.cityPlan.signature !== nextPlan.signature) {
                roomMemory.cityPlan = nextPlan;
            }

            this.placeByType(room, center, STRUCTURE_EXTENSION);
            if (room.controller.level >= 4) this.placeByType(room, center, STRUCTURE_STORAGE);
            this.placePlannedContainers(room, roomMemory.cityPlan);
            this.placePlannedLinks(room, roomMemory.cityPlan);
        }
    }

    buildCityPlan(room, center) {
        const sources = {};
        const sourceLayouts = {};
        const sourceRuntime = {
            sources: {}
        };
        const workPositions = {
            sources: {},
            controller: {
                upgrade: {
                    primary: null
                }
            }
        };
        const roadAnchors = [{ x: center.x, y: center.y, roomName: room.name }];

        for (const source of room.find(FIND_SOURCES)) {
            const positions = this.getOpenPositions(room, source.pos, 1);
            const primaryMiningPos = positions[0] || { x: source.pos.x, y: source.pos.y, roomName: room.name };
            const containerPos = primaryMiningPos;
            const linkPos = room.controller.level >= 5 ? this.pickSupportPos(positions, containerPos, center) : null;
            sources[source.id] = {
                miningPositions: positions,
                roadAnchor: containerPos
            };
            sourceLayouts[source.id] = {
                containerPos,
                linkPos
            };
            sourceRuntime.sources[source.id] = {
                preferredOutputRole: linkPos ? 'source_link' : 'source_container',
                deliveryMode: linkPos ? 'transition' : 'container'
            };
            workPositions.sources[source.id] = {
                mining: {
                    primary: primaryMiningPos
                }
            };
            roadAnchors.push(containerPos);
        }

        const controllerPositions = room.controller ? this.getOpenPositions(room, room.controller.pos, 3) : [];
        const primaryUpgradePos = controllerPositions[0] || (room.controller ? {
            x: room.controller.pos.x,
            y: room.controller.pos.y,
            roomName: room.name
        } : null);
        const controllerLayout = {
            containerPos: primaryUpgradePos,
            linkPos: room.controller && room.controller.level >= 5 ?
                this.pickSupportPos(controllerPositions, primaryUpgradePos, center) :
                null
        };
        const controller = {
            upgradePositions: controllerPositions,
            deliveryMode: room.controller && room.controller.level >= 5 ? 'transition' : 'container',
            roadAnchor: primaryUpgradePos
        };
        workPositions.controller.upgrade.primary = primaryUpgradePos;
        if (primaryUpgradePos) roadAnchors.push(primaryUpgradePos);

        const coreRoads = this.buildCoreRoads(room, center);
        const hub = this.buildHubPlan(room, center);

        const plan = {
            version: CITY_PLAN_VERSION,
            schemaVersion: CITY_PLAN_SCHEMA_VERSION,
            center: { x: center.x, y: center.y, roomName: room.name },
            core: {
                structures: this.buildCoreStructures(room, center)
            },
            hub,
            sources,
            sourceRuntime,
            controller,
            workPositions,
            roadAnchors,
            coreRoads,
            phaseGoals: this.buildPhaseGoals(room),
            plannedStructures: this.buildPlannedStructures(room, center, sourceLayouts, controllerLayout, hub, coreRoads),
            updatedAt: Game.time
        };
        plan.assetGroups = this.buildAssetGroups(plan.plannedStructures);
        plan.signature = this.planSignature(plan);
        const validation = validateCityPlan(plan);
        if (!validation.valid) plan.validationErrors = validation.errors;
        return plan;
    }

    buildCoreStructures(room, center) {
        const structures = [];
        const priorities = {};
        priorities[STRUCTURE_EXTENSION] = 30;
        priorities[STRUCTURE_STORAGE] = 50;

        for (const structureType of [STRUCTURE_EXTENSION, STRUCTURE_STORAGE]) {
            const offsets = parsedCoreBlueprint[structureType] || [];
            for (const offset of offsets) {
                const pos = { x: center.x + offset.dx, y: center.y + offset.dy, roomName: room.name };
                if (this.isReservedByDefense(room.name, pos)) continue;
                structures.push({ type: structureType, pos, priority: priorities[structureType] });
            }
        }
        return structures;
    }

    buildCoreRoads(room, center) {
        const roads = [];
        const offsets = parsedCoreBlueprint[STRUCTURE_ROAD] || [];
        for (const offset of offsets) {
            roads.push({ x: center.x + offset.dx, y: center.y + offset.dy, roomName: room.name });
        }
        return roads;
    }

    buildHubPlan(room, center) {
        const storagePos = room.storage && room.storage.pos ? {
            x: room.storage.pos.x,
            y: room.storage.pos.y,
            roomName: room.storage.pos.roomName || room.name
        } : this.findCoreStructurePos(center, STRUCTURE_STORAGE, 0, room.name);
        const terminalPos = room.controller.level >= 6 ? this.offsetPos(storagePos, 1, 0, room.name) : null;
        const linkPos = room.controller.level >= 5 ? this.offsetPos(storagePos, 0, 1, room.name) : null;
        const factoryPos = room.controller.level >= 7 ? this.offsetPos(storagePos, -1, 0, room.name) : null;
        const observerPos = room.controller.level >= 8 ? this.offsetPos(storagePos, 0, -1, room.name) : null;
        const powerSpawnPos = room.controller.level >= 8 ? this.offsetPos(storagePos, 1, -1, room.name) : null;
        const nukerPos = room.controller.level >= 8 ? this.offsetPos(storagePos, -1, 1, room.name) : null;
        const labCluster = room.controller.level >= 6 ? [
            this.offsetPos(storagePos, 2, 0, room.name),
            this.offsetPos(storagePos, 2, 1, room.name),
            this.offsetPos(storagePos, 1, 2, room.name)
        ] : [];

        return {
            center: storagePos,
            storagePos,
            terminalPos,
            linkPos,
            labCluster,
            factoryPos,
            observerPos,
            powerSpawnPos,
            nukerPos,
            roadEntries: [storagePos, terminalPos, linkPos].filter(Boolean)
        };
    }

    buildPhaseGoals(room) {
        return {
            bootstrap: ['source_container', 'controller_container', 'core_extension', 'core_road'],
            storage: ['core_storage', 'core_tower'],
            logistics_link: room.controller.level >= 5 ? ['source_link', 'controller_link', 'hub_link'] : [],
            industry: room.controller.level >= 6 ? ['hub_terminal', 'hub_lab', 'mineral_extractor'] : [],
            defense_shell: ['core_tower', 'core_road'],
            late_game: room.controller.level >= 7 ? ['hub_factory', 'hub_observer', 'hub_power_spawn', 'hub_nuker'] : []
        };
    }

    buildPlannedStructures(room, center, sourceLayouts, controllerLayout, hub, coreRoads) {
        const planned = [];

        for (const sourceId in sourceLayouts) {
            const sourcePlan = sourceLayouts[sourceId];
            if (!sourcePlan || !sourcePlan.containerPos) continue;
            planned.push({
                id: `${sourceId}:container`,
                role: 'source_container',
                structureType: STRUCTURE_CONTAINER,
                pos: sourcePlan.containerPos,
                scope: { sourceId },
                phase: 'bootstrap',
                group: 'logistics',
                lifecycle: {
                    state: 'active',
                    activeFromRcl: 1,
                    activeUntilRcl: 5,
                    replacement: `${sourceId}:link`,
                    retirementPolicy: 'defer_until_replacement_online'
                }
            });
        }

        if (controllerLayout && controllerLayout.containerPos) {
            planned.push({
                id: 'controller:container',
                role: 'controller_container',
                structureType: STRUCTURE_CONTAINER,
                pos: controllerLayout.containerPos,
                phase: 'bootstrap',
                group: 'logistics',
                lifecycle: {
                    state: 'active',
                    activeFromRcl: 1,
                    replacement: 'controller:link',
                    retirementPolicy: 'defer_until_replacement_online'
                }
            });
        }

        if (room.controller && room.controller.level >= 5) {
            for (const sourceId in sourceLayouts) {
                const sourcePlan = sourceLayouts[sourceId];
                if (!sourcePlan || !sourcePlan.linkPos) continue;
                planned.push({
                    id: `${sourceId}:link`,
                    role: 'source_link',
                    structureType: STRUCTURE_LINK,
                    pos: sourcePlan.linkPos,
                    scope: { sourceId },
                    phase: 'logistics_link',
                    group: 'logistics',
                    lifecycle: {
                        state: 'planned',
                        activeFromRcl: 5
                    }
                });
            }

            if (controllerLayout && controllerLayout.linkPos) {
                planned.push({
                    id: 'controller:link',
                    role: 'controller_link',
                    structureType: STRUCTURE_LINK,
                    pos: controllerLayout.linkPos,
                    phase: 'logistics_link',
                    group: 'logistics',
                    lifecycle: {
                        state: 'planned',
                        activeFromRcl: 5
                    }
                });
            }
        }

        for (const structure of this.buildHubStructures(room, hub)) {
            planned.push(structure);
        }

        for (const structure of this.buildMineralStructures(room)) {
            planned.push(structure);
        }

        for (const structure of this.buildPlannedCoreStructures(room, center)) {
            planned.push(structure);
        }

        for (let index = 0; index < coreRoads.length; index++) {
            planned.push({
                id: `core:road:${index}`,
                role: 'core_road',
                structureType: STRUCTURE_ROAD,
                pos: coreRoads[index],
                phase: 'bootstrap',
                group: 'infrastructure',
                lifecycle: {
                    state: 'active',
                    activeFromRcl: 1
                }
            });
        }

        return planned;
    }

    buildPlannedCoreStructures(room, center) {
        const planned = [];
        const roles = {
            [STRUCTURE_EXTENSION]: 'core_extension',
            [STRUCTURE_STORAGE]: 'core_storage',
            [STRUCTURE_TOWER]: 'core_tower'
        };

        for (const structureType of [STRUCTURE_EXTENSION, STRUCTURE_STORAGE, STRUCTURE_TOWER]) {
            const offsets = parsedCoreBlueprint[structureType] || [];
            for (let index = 0; index < offsets.length; index++) {
                const offset = offsets[index];
                planned.push({
                    id: `core:${structureType}:${index}`,
                    role: roles[structureType],
                    structureType,
                    pos: { x: center.x + offset.dx, y: center.y + offset.dy, roomName: room.name },
                    phase: structureType === STRUCTURE_STORAGE ? 'storage' : 'bootstrap',
                    group: structureType === STRUCTURE_TOWER ? 'defense' : 'core',
                    lifecycle: {
                        state: 'active',
                        activeFromRcl: structureType === STRUCTURE_STORAGE ? 4 : (structureType === STRUCTURE_TOWER ? 3 : 2)
                    }
                });
            }
        }

        return planned;
    }

    buildHubStructures(room, hub) {
        const planned = [];
        if (!hub || !hub.storagePos) return planned;

        if (hub.linkPos) {
            planned.push({
                id: 'hub:link',
                role: 'hub_link',
                structureType: STRUCTURE_LINK,
                pos: hub.linkPos,
                phase: 'logistics_link',
                group: 'logistics',
                lifecycle: { state: 'planned', activeFromRcl: 5 }
            });
        }
        if (hub.terminalPos) {
            planned.push({
                id: 'hub:terminal',
                role: 'hub_terminal',
                structureType: STRUCTURE_TERMINAL,
                pos: hub.terminalPos,
                phase: 'industry',
                group: 'industry',
                lifecycle: { state: 'planned', activeFromRcl: 6 }
            });
        }
        for (let index = 0; index < hub.labCluster.length; index++) {
            planned.push({
                id: `hub:lab:${index}`,
                role: 'hub_lab',
                structureType: STRUCTURE_LAB,
                pos: hub.labCluster[index],
                phase: 'industry',
                group: 'industry',
                lifecycle: { state: 'planned', activeFromRcl: 6 }
            });
        }
        if (hub.factoryPos) {
            planned.push({
                id: 'hub:factory',
                role: 'hub_factory',
                structureType: STRUCTURE_FACTORY,
                pos: hub.factoryPos,
                phase: 'late_game',
                group: 'industry',
                lifecycle: { state: 'planned', activeFromRcl: 7 }
            });
        }
        if (hub.observerPos) {
            planned.push({
                id: 'hub:observer',
                role: 'hub_observer',
                structureType: STRUCTURE_OBSERVER,
                pos: hub.observerPos,
                phase: 'late_game',
                group: 'industry',
                lifecycle: { state: 'planned', activeFromRcl: 8 }
            });
        }
        if (hub.powerSpawnPos) {
            planned.push({
                id: 'hub:power_spawn',
                role: 'hub_power_spawn',
                structureType: STRUCTURE_POWER_SPAWN,
                pos: hub.powerSpawnPos,
                phase: 'late_game',
                group: 'industry',
                lifecycle: { state: 'planned', activeFromRcl: 8 }
            });
        }
        if (hub.nukerPos) {
            planned.push({
                id: 'hub:nuker',
                role: 'hub_nuker',
                structureType: STRUCTURE_NUKER,
                pos: hub.nukerPos,
                phase: 'late_game',
                group: 'industry',
                lifecycle: { state: 'planned', activeFromRcl: 8 }
            });
        }

        return planned;
    }

    buildMineralStructures(room) {
        if (!room.controller || room.controller.level < 6 || typeof FIND_MINERALS === 'undefined') return [];
        const minerals = room.find ? room.find(FIND_MINERALS) : [];
        const planned = [];
        for (const mineral of minerals) {
            planned.push({
                id: `mineral:${mineral.id}:extractor`,
                role: 'mineral_extractor',
                structureType: STRUCTURE_EXTRACTOR,
                pos: { x: mineral.pos.x, y: mineral.pos.y, roomName: mineral.pos.roomName || room.name },
                scope: { mineralId: mineral.id },
                phase: 'industry',
                group: 'industry',
                lifecycle: { state: 'planned', activeFromRcl: 6 }
            });
        }
        return planned;
    }

    buildAssetGroups(plannedStructures) {
        const groups = {};
        for (const entry of plannedStructures || []) {
            if (!entry.group) continue;
            if (!groups[entry.group]) groups[entry.group] = [];
            groups[entry.group].push(entry.id);
        }
        return groups;
    }

    planSignature(plan) {
        const sourceKeys = Object.keys(plan.sources || {}).sort().map((sourceId) => {
            const sourcePlan = plan.sources[sourceId];
            const anchor = sourcePlan && sourcePlan.roadAnchor ? sourcePlan.roadAnchor : null;
            return `${sourceId}:${this.serializePos(anchor)}`;
        });
        const roadAnchors = (plan.roadAnchors || []).map((pos) => this.serializePos(pos)).sort();
        const coreRoads = (plan.coreRoads || []).map((pos) => this.serializePos(pos)).sort();
        const plannedStructures = (plan.plannedStructures || []).map((entry) => {
            return `${entry.role}:${entry.structureType}:${this.serializePos(entry.pos)}`;
        }).sort();
        return JSON.stringify({
            version: plan.version,
            schemaVersion: plan.schemaVersion,
            center: this.serializePos(plan.center),
            hub: plan.hub ? this.serializePos(plan.hub.center) : null,
            controller: plan.controller ? this.serializePos(plan.controller.roadAnchor) : null,
            sourceKeys,
            roadAnchors,
            coreRoads,
            plannedStructures
        });
    }

    serializePos(pos) {
        if (!pos) return 'null';
        return `${pos.roomName}:${pos.x},${pos.y}`;
    }

    offsetPos(origin, dx, dy, roomName) {
        if (!origin) return null;
        return { x: origin.x + dx, y: origin.y + dy, roomName: roomName || origin.roomName };
    }

    findCoreStructurePos(center, structureType, index, roomName) {
        const offsets = parsedCoreBlueprint[structureType] || [];
        const offset = offsets[index] || { dx: 0, dy: 0 };
        return { x: center.x + offset.dx, y: center.y + offset.dy, roomName };
    }

    pickSupportPos(positions, excludedPos, referencePos) {
        const candidates = positions.filter((pos) => !this.samePos(pos, excludedPos));
        if (candidates.length === 0) return null;
        const ranked = candidates.slice().sort((left, right) => {
            const leftRange = this.posRange(left, referencePos);
            const rightRange = this.posRange(right, referencePos);
            if (leftRange !== rightRange) return leftRange - rightRange;
            return this.posRange(left, excludedPos) - this.posRange(right, excludedPos);
        });
        return ranked[0];
    }

    posRange(left, right) {
        if (!left || !right) return 999;
        return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
    }

    samePos(left, right) {
        return !!left && !!right &&
            left.x === right.x &&
            left.y === right.y &&
            left.roomName === right.roomName;
    }

    getOpenPositions(room, origin, range) {
        const terrain = Game.map && Game.map.getRoomTerrain ? Game.map.getRoomTerrain(room.name) : null;
        const blockers = this.getPositionBlockers(room);
        const positions = [];

        for (let dx = -range; dx <= range; dx++) {
            for (let dy = -range; dy <= range; dy++) {
                if (dx === 0 && dy === 0) continue;
                const x = origin.x + dx;
                const y = origin.y + dy;
                if (x <= 0 || x >= 49 || y <= 0 || y >= 49) continue;
                if (terrain && terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                if (blockers[`${x},${y}`]) continue;
                positions.push({ x, y, roomName: room.name });
            }
        }

        return positions.sort((a, b) => {
            const rangeA = Math.abs(a.x - origin.x) + Math.abs(a.y - origin.y);
            const rangeB = Math.abs(b.x - origin.x) + Math.abs(b.y - origin.y);
            return rangeA - rangeB;
        });
    }

    getPositionBlockers(room) {
        const blockers = {};
        for (const structure of room.find(FIND_STRUCTURES)) {
            if (structure.structureType === STRUCTURE_ROAD ||
                structure.structureType === STRUCTURE_CONTAINER ||
                structure.structureType === STRUCTURE_RAMPART) {
                continue;
            }
            blockers[`${structure.pos.x},${structure.pos.y}`] = true;
        }
        return blockers;
    }

    placePlannedContainers(room, cityPlan) {
        if (!cityPlan) return;
        const positions = this.getPlannedAssetPositions(cityPlan, STRUCTURE_CONTAINER, [
            'source_container',
            'controller_container'
        ]);

        for (const pos of positions) {
            if (this.hasStructureOrSite(room, pos, STRUCTURE_CONTAINER)) continue;
            const result = new RoomPosition(pos.x, pos.y, room.name).createConstructionSite(STRUCTURE_CONTAINER);
            if (result === OK && global.RoomCache && global.RoomCache[room.name]) {
                global.RoomCache[room.name].isDirty = true;
            }
        }
    }

    placePlannedLinks(room, cityPlan) {
        if (!cityPlan || !room.controller || room.controller.level < 5) return;
        const maxAllowed = this.maxAllowed(STRUCTURE_LINK, room.controller.level);
        if (maxAllowed <= 0) return;

        const positions = this.getPlannedAssetPositions(cityPlan, STRUCTURE_LINK, [
            'source_link',
            'controller_link'
        ]);

        let remaining = maxAllowed -
            this.findByStructureType(room.find(FIND_STRUCTURES), STRUCTURE_LINK).length -
            this.findByStructureType(room.find(FIND_CONSTRUCTION_SITES), STRUCTURE_LINK).length;
        if (remaining <= 0) return;

        for (const pos of positions) {
            if (remaining <= 0) break;
            if (this.hasStructureOrSite(room, pos, STRUCTURE_LINK)) continue;
            const result = new RoomPosition(pos.x, pos.y, room.name).createConstructionSite(STRUCTURE_LINK);
            if (result === OK) {
                remaining--;
                if (global.RoomCache && global.RoomCache[room.name]) global.RoomCache[room.name].isDirty = true;
            }
        }
    }

    getPlannedAssetPositions(cityPlan, structureType, roles) {
        const plannedStructures = Array.isArray(cityPlan.plannedStructures) ? cityPlan.plannedStructures : [];
        const seen = {};
        const positions = [];

        for (const entry of plannedStructures) {
            if (!entry || entry.structureType !== structureType || roles.indexOf(entry.role) === -1 || !entry.pos) continue;
            const key = this.serializePos(entry.pos);
            if (seen[key]) continue;
            seen[key] = true;
            positions.push(entry.pos);
        }

        return positions;
    }

    hasStructureOrSite(room, pos, structureType) {
        const structures = room.find(FIND_STRUCTURES).filter((structure) => {
            return structure.structureType === structureType &&
                structure.pos.x === pos.x &&
                structure.pos.y === pos.y;
        });
        if (structures.length > 0) return true;

        const sites = room.find(FIND_CONSTRUCTION_SITES).filter((site) => {
            return site.structureType === structureType &&
                site.pos.x === pos.x &&
                site.pos.y === pos.y;
        });
        return sites.length > 0;
    }

    placeByType(room, center, structureType) {
        const maxAllowed = this.maxAllowed(structureType, room.controller.level);
        const existing = this.findByStructureType(room.find(FIND_STRUCTURES), structureType).length;
        const sites = this.findByStructureType(room.find(FIND_CONSTRUCTION_SITES), structureType).length;
        let remaining = maxAllowed - existing - sites;
        if (remaining <= 0) return;

        const offsets = parsedCoreBlueprint[structureType] || [];
        for (const offset of offsets) {
            if (remaining <= 0) break;
            const x = center.x + offset.dx;
            const y = center.y + offset.dy;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            if (this.isReservedByDefense(room.name, { x, y, roomName: room.name })) continue;
            const result = new RoomPosition(x, y, room.name).createConstructionSite(structureType);
            if (result === OK) {
                remaining--;
                if (global.RoomCache && global.RoomCache[room.name]) global.RoomCache[room.name].isDirty = true;
            }
        }
    }

    maxAllowed(structureType, level) {
        return CONTROLLER_STRUCTURES &&
            CONTROLLER_STRUCTURES[structureType] &&
            CONTROLLER_STRUCTURES[structureType][level] ?
            CONTROLLER_STRUCTURES[structureType][level] : 0;
    }

    findByStructureType(entries, structureType) {
        return (entries || []).filter((entry) => entry.structureType === structureType);
    }

    isReservedByDefense(roomName, pos) {
        if (typeof Memory === 'undefined' || !Memory.rooms || !Memory.rooms[roomName]) return false;
        const defense = Memory.rooms[roomName].cityPlan && Memory.rooms[roomName].cityPlan.defense;
        if (!defense || !defense.reservedPositions) return false;
        return defense.reservedPositions.some((entry) => {
            return entry.x === pos.x && entry.y === pos.y && entry.roomName === pos.roomName;
        });
    }
}

export default CityPlannerService;
