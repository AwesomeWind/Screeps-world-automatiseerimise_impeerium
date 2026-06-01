import BaseService from '../core/BaseService.js';
import MemoryConfig from '../config/MemoryConfig.js';
import { parsedCoreBlueprint } from './BaseBlueprint.js';

const ROAD_NETWORK_VERSION = 2;

class RoadPlannerService extends BaseService {
    analyze() {
        if (Game.time % 500 !== 0) return;

        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            if (!MemoryConfig.flag(roomName, 'roads', true)) continue;

            const cache = global.RoomCache && global.RoomCache[roomName];
            if (!cache || !cache.centerPos) continue;

            if (Memory.rooms[roomName].roadNetworkVersion !== ROAD_NETWORK_VERSION) {
                Memory.rooms[roomName].roadNetwork = null;
            }

            if (!Memory.rooms[roomName].roadNetwork) {
                Memory.rooms[roomName].roadNetwork = this.planRoads(room, cache);
                Memory.rooms[roomName].roadNetworkVersion = ROAD_NETWORK_VERSION;
            }
            this.placeRoadSites(room, Memory.rooms[roomName].roadNetwork);
        }
    }

    planRoads(room, cache) {
        const roadTiles = [];
        const targets = cache.sources.concat(cache.controller ? [cache.controller] : []);
        const costMatrix = this.buildCostMatrix(room, cache);

        for (const id of targets) {
            const target = Game.getObjectById(id);
            if (!target) continue;
            const result = PathFinder.search(cache.centerPos, { pos: target.pos, range: 1 }, {
                plainCost: 2,
                swampCost: 5,
                roomCallback: (roomName) => roomName === room.name ? costMatrix : false
            });
            if (!result.incomplete) {
                for (const pos of result.path) {
                    if (this.isBuildableRoadPos(room, pos, costMatrix)) {
                        roadTiles.push(`${pos.x},${pos.y}`);
                    }
                }
            }
        }

        return Array.from(new Set(roadTiles));
    }

    buildCostMatrix(room, cache) {
        const matrix = new PathFinder.CostMatrix();
        const terrain = Game.map.getRoomTerrain(room.name);

        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                    matrix.set(x, y, 255);
                }
            }
        }

        for (const structure of room.find(FIND_MY_STRUCTURES)) {
            this.applyStructureCost(matrix, structure);
        }

        this.applyBlueprintBlockers(matrix, cache.centerPos);

        return matrix;
    }

    applyStructureCost(matrix, structure) {
        if (structure.structureType === STRUCTURE_ROAD ||
            structure.structureType === STRUCTURE_CONTAINER ||
            structure.structureType === STRUCTURE_RAMPART) {
            return;
        }
        matrix.set(structure.pos.x, structure.pos.y, 255);
    }

    applyBlueprintBlockers(matrix, centerPos) {
        const blockedTypes = [
            STRUCTURE_SPAWN,
            STRUCTURE_EXTENSION,
            STRUCTURE_TOWER,
            STRUCTURE_STORAGE
        ];

        for (const structureType of blockedTypes) {
            const offsets = parsedCoreBlueprint[structureType] || [];
            for (const offset of offsets) {
                const x = centerPos.x + offset.dx;
                const y = centerPos.y + offset.dy;
                if (x >= 0 && x < 50 && y >= 0 && y < 50) {
                    matrix.set(x, y, 255);
                }
            }
        }
    }

    isBuildableRoadPos(room, pos, matrix) {
        if (pos.x <= 0 || pos.x >= 49 || pos.y <= 0 || pos.y >= 49) return false;
        return matrix.get(pos.x, pos.y) < 255;
    }

    placeRoadSites(room, roadNetwork) {
        if (Object.keys(Game.constructionSites).length >= 80) return;
        let placed = 0;
        for (const coord of roadNetwork) {
            if (placed >= 5) break;
            const parts = coord.split(',');
            const result = new RoomPosition(Number(parts[0]), Number(parts[1]), room.name).createConstructionSite(STRUCTURE_ROAD);
            if (result === OK) placed++;
        }
    }
}

export default RoadPlannerService;
