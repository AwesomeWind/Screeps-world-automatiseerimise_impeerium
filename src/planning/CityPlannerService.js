import BaseService from '../core/BaseService.js';
import MemoryConfig from '../config/MemoryConfig.js';
import { parsedCoreBlueprint } from './BaseBlueprint.js';

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
            if (!roomMemory.cityPlan || roomMemory.cityPlan.version !== CITY_PLAN_VERSION) {
                roomMemory.cityPlan = this.buildCityPlan(room, center);
            }

            this.placeByType(room, center, STRUCTURE_EXTENSION);
            this.placeByType(room, center, STRUCTURE_TOWER);
            if (room.controller.level >= 4) this.placeByType(room, center, STRUCTURE_STORAGE);
            this.placePlannedContainers(room, roomMemory.cityPlan);
        }
    }

    buildCityPlan(room, center) {
        const sources = {};
        const roadAnchors = [{ x: center.x, y: center.y, roomName: room.name }];

        for (const source of room.find(FIND_SOURCES)) {
            const positions = this.getOpenPositions(room, source.pos, 1);
            const primaryMiningPos = positions[0] || { x: source.pos.x, y: source.pos.y, roomName: room.name };
            const containerPos = primaryMiningPos;
            sources[source.id] = {
                miningPositions: positions,
                primaryMiningPos,
                containerPos,
                roadAnchor: containerPos
            };
            roadAnchors.push(containerPos);
        }

        const controllerPositions = room.controller ? this.getOpenPositions(room, room.controller.pos, 3) : [];
        const primaryUpgradePos = controllerPositions[0] || (room.controller ? {
            x: room.controller.pos.x,
            y: room.controller.pos.y,
            roomName: room.name
        } : null);
        const controller = {
            upgradePositions: controllerPositions,
            primaryUpgradePos,
            containerPos: primaryUpgradePos,
            roadAnchor: primaryUpgradePos
        };
        if (primaryUpgradePos) roadAnchors.push(primaryUpgradePos);

        return {
            version: CITY_PLAN_VERSION,
            center: { x: center.x, y: center.y, roomName: room.name },
            core: {
                structures: this.buildCoreStructures(room, center)
            },
            sources,
            controller,
            roadAnchors,
            updatedAt: Game.time
        };
    }

    buildCoreStructures(room, center) {
        const structures = [];
        const priorities = {};
        priorities[STRUCTURE_EXTENSION] = 30;
        priorities[STRUCTURE_TOWER] = 40;
        priorities[STRUCTURE_STORAGE] = 50;

        for (const structureType of [STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_STORAGE]) {
            const offsets = parsedCoreBlueprint[structureType] || [];
            for (const offset of offsets) {
                structures.push({
                    type: structureType,
                    pos: { x: center.x + offset.dx, y: center.y + offset.dy, roomName: room.name },
                    priority: priorities[structureType]
                });
            }
        }
        return structures;
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
        const positions = [];
        for (const sourceId in cityPlan.sources) {
            if (cityPlan.sources[sourceId].containerPos) positions.push(cityPlan.sources[sourceId].containerPos);
        }
        if (cityPlan.controller && cityPlan.controller.containerPos) positions.push(cityPlan.controller.containerPos);

        for (const pos of positions) {
            if (this.hasStructureOrSite(room, pos, STRUCTURE_CONTAINER)) continue;
            const result = new RoomPosition(pos.x, pos.y, room.name).createConstructionSite(STRUCTURE_CONTAINER);
            if (result === OK && global.RoomCache && global.RoomCache[room.name]) {
                global.RoomCache[room.name].isDirty = true;
            }
        }
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
        const maxAllowed = CONTROLLER_STRUCTURES[structureType][room.controller.level] || 0;
        const existing = room.find(FIND_STRUCTURES, {
            filter: (structure) => structure.structureType === structureType
        }).length;
        const sites = room.find(FIND_CONSTRUCTION_SITES, {
            filter: (site) => site.structureType === structureType
        }).length;
        let remaining = maxAllowed - existing - sites;
        if (remaining <= 0) return;

        const offsets = parsedCoreBlueprint[structureType] || [];
        for (const offset of offsets) {
            if (remaining <= 0) break;
            const x = center.x + offset.dx;
            const y = center.y + offset.dy;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            const result = new RoomPosition(x, y, room.name).createConstructionSite(structureType);
            if (result === OK) {
                remaining--;
                if (global.RoomCache && global.RoomCache[room.name]) global.RoomCache[room.name].isDirty = true;
            }
        }
    }
}

export default CityPlannerService;
