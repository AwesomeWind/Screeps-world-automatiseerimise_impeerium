import BaseService from '../core/BaseService.js';
import MemoryConfig from '../config/MemoryConfig.js';
import { parsedCoreBlueprint } from './BaseBlueprint.js';

const ROAD_NETWORK_VERSION = 3;

class RoadPlannerService extends BaseService {
    analyze() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            if (!MemoryConfig.flag(roomName, 'roads', true)) continue;

            const cache = global.RoomCache && global.RoomCache[roomName];
            if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
            const roomMemory = Memory.rooms[roomName];
            const roadSignature = this.roadPlanSignature(room, cache, roomMemory.cityPlan);
            const hasPlanningContext = !!((cache && cache.centerPos) || this.getCenterPos(roomMemory.cityPlan));
            const storedRoadNetwork = Array.isArray(roomMemory.roadNetwork) ? roomMemory.roadNetwork : null;

            const needsVersionRefresh = roomMemory.roadNetworkVersion !== ROAD_NETWORK_VERSION;

            if ((!roomMemory.roadNetwork ||
                needsVersionRefresh ||
                roomMemory.roadPlanSignature !== roadSignature ||
                Game.time % 500 === 0)) {
                if (!hasPlanningContext) continue;
                const plannedRoadNetwork = this.planRoads(room, cache, roomMemory.cityPlan);
                roomMemory.roadNetwork = plannedRoadNetwork && plannedRoadNetwork.length > 0 ?
                    plannedRoadNetwork :
                    (storedRoadNetwork || plannedRoadNetwork);
                roomMemory.roadNetworkVersion = ROAD_NETWORK_VERSION;
                roomMemory.roadPlanSignature = roadSignature;
            }

            this.syncRoadPlannedStructures(roomMemory.cityPlan, roomMemory.roadNetwork, roomMemory.cityPlan && roomMemory.cityPlan.coreRoads);
            if (roomMemory.roadNetwork) this.placeRoadSites(room, roomMemory.roadNetwork);
        }
    }

    planRoads(room, cache, cityPlan = null) {
        const roadTiles = [];
        const centerPos = this.getCenterPos(cityPlan) || (cache && cache.centerPos);
        if (!centerPos) return roadTiles;
        const targets = this.collectTargets(room, cache, cityPlan, centerPos);
        const costMatrix = this.buildCostMatrix(room, cache, centerPos);

        for (const pos of this.coreRoads(cityPlan)) {
            if (this.isBuildableRoadPos(room, pos, costMatrix)) roadTiles.push(`${pos.x},${pos.y}`);
        }

        for (const id of targets) {
            const target = this.resolveTarget(id);
            if (!target) continue;
            const range = this.targetRange(target, centerPos);
            const result = PathFinder.search(centerPos, { pos: target.pos, range }, {
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

    collectTargets(room, cache, cityPlan, centerPos) {
        const targets = [];
        const seen = {};
        const legacyTargets = cache ? (cache.sources || []).concat(cache.controller ? [cache.controller] : []) : [];
        for (const id of legacyTargets) {
            seen[`id:${id}`] = true;
            targets.push(id);
        }

        const anchors = cityPlan && cityPlan.roadAnchors ? cityPlan.roadAnchors : [];
        for (const anchor of anchors) {
            if (!anchor || this.samePos(anchor, centerPos)) continue;
            const key = `pos:${anchor.roomName}:${anchor.x},${anchor.y}`;
            if (seen[key]) continue;
            seen[key] = true;
            targets.push({ pos: anchor });
        }

        return targets;
    }

    resolveTarget(targetRef) {
        if (!targetRef) return null;
        if (typeof targetRef === 'string') return Game.getObjectById(targetRef);
        if (targetRef.pos) return targetRef;
        return null;
    }

    targetRange(target, centerPos) {
        if (!target || !target.pos) return 1;
        return this.samePos(target.pos, centerPos) ? 0 : 1;
    }

    coreRoads(cityPlan) {
        return cityPlan && cityPlan.coreRoads ? cityPlan.coreRoads : [];
    }

    getCenterPos(cityPlan) {
        return cityPlan && cityPlan.center ? cityPlan.center : null;
    }

    roadPlanSignature(room, cache, cityPlan) {
        const centerPos = this.getCenterPos(cityPlan) || (cache && cache.centerPos);
        const anchors = cityPlan && cityPlan.roadAnchors ? cityPlan.roadAnchors : [];
        const coreRoads = cityPlan && cityPlan.coreRoads ? cityPlan.coreRoads : [];
        const legacyTargets = cache ? (cache.sources || []).concat(cache.controller ? [cache.controller] : []) : [];
        return JSON.stringify({
            version: ROAD_NETWORK_VERSION,
            roomName: room.name,
            center: this.serializePos(centerPos),
            anchors: anchors.map((pos) => this.serializePos(pos)).sort(),
            coreRoads: coreRoads.map((pos) => this.serializePos(pos)).sort(),
            targets: legacyTargets.slice().sort()
        });
    }

    samePos(a, b) {
        if (!a || !b) return false;
        return a.x === b.x && a.y === b.y && a.roomName === b.roomName;
    }

    serializePos(pos) {
        if (!pos) return 'null';
        return `${pos.roomName}:${pos.x},${pos.y}`;
    }

    buildCostMatrix(room, cache, centerPos) {
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

        this.applyBlueprintBlockers(matrix, centerPos || (cache && cache.centerPos));

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
        if (!centerPos) return;
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
            if (result === OK) {
                placed++;
                if (global.RoomCache && global.RoomCache[room.name]) global.RoomCache[room.name].isDirty = true;
            }
        }
    }

    syncRoadPlannedStructures(cityPlan, roadNetwork, coreRoads) {
        if (!cityPlan || !Array.isArray(roadNetwork)) return;
        if (!Array.isArray(cityPlan.plannedStructures)) cityPlan.plannedStructures = [];
        const coreSet = new Set((coreRoads || []).map((pos) => `${pos.x},${pos.y}`));
        const existingRoads = cityPlan.plannedStructures.filter((entry) => entry.role === 'logistics_road');
        const retained = cityPlan.plannedStructures.filter((entry) => entry.role !== 'logistics_road');
        const logisticsRoads = [];
        const activeSet = new Set();

        for (const coord of roadNetwork) {
            if (coreSet.has(coord)) continue;
            const parts = coord.split(',');
            activeSet.add(coord);
            logisticsRoads.push({
                id: `road:logistics:${coord}`,
                role: 'logistics_road',
                structureType: STRUCTURE_ROAD,
                pos: {
                    x: Number(parts[0]),
                    y: Number(parts[1]),
                    roomName: cityPlan.center && cityPlan.center.roomName
                },
                phase: 'logistics_link',
                group: 'infrastructure',
                lifecycle: {
                    state: 'active',
                    activeFromRcl: 3,
                    lastPlannedAt: Game.time
                }
            });
        }

        for (const entry of existingRoads) {
            if (!entry || !entry.pos) continue;
            const coord = `${entry.pos.x},${entry.pos.y}`;
            if (activeSet.has(coord) || coreSet.has(coord)) continue;
            logisticsRoads.push({
                ...entry,
                lifecycle: {
                    ...(entry.lifecycle || {}),
                    state: 'low_priority',
                    activeFromRcl: entry.lifecycle && entry.lifecycle.activeFromRcl !== undefined ? entry.lifecycle.activeFromRcl : 3,
                    lastPlannedAt: entry.lifecycle && entry.lifecycle.lastPlannedAt !== undefined ? entry.lifecycle.lastPlannedAt : Game.time,
                    lowPrioritySince: entry.lifecycle && entry.lifecycle.lowPrioritySince !== undefined ? entry.lifecycle.lowPrioritySince : Game.time
                }
            });
        }

        cityPlan.plannedStructures = retained.concat(logisticsRoads);
        if (!cityPlan.assetGroups) cityPlan.assetGroups = {};
        cityPlan.assetGroups.infrastructure = cityPlan.plannedStructures
            .filter((entry) => entry.group === 'infrastructure')
            .map((entry) => entry.id);
    }
}

export default RoadPlannerService;
