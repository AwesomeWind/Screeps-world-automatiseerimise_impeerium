import BaseService from '../core/BaseService.js';
import MemoryConfig from '../config/MemoryConfig.js';
import { parsedCoreBlueprint } from './BaseBlueprint.js';

const DEFENSE_PLAN_VERSION = 1;

class DefensePlannerService extends BaseService {
    analyze() {
        if (Game.time % 100 !== 0) return;

        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            if (!MemoryConfig.flag(roomName, 'defensePlanning', true)) continue;

            const roomMemory = MemoryConfig.room(room.name);
            if (!roomMemory.cityPlan) continue;

            roomMemory.cityPlan.defense = this.buildDefensePlan(room, roomMemory.cityPlan);
            this.placeDefenseSites(room, roomMemory.cityPlan.defense);
        }
    }

    buildDefensePlan(room, cityPlan) {
        const mode = this.selectMode(room);
        const buildLimitPerRun = mode === 'territorial_gate' ? 5 : (mode === 'asset_protection' ? 4 : 3);
        const towers = this.planTowers(room, cityPlan, mode);
        const protectedAssets = this.planProtectedAssets(room, cityPlan, towers, mode);
        const ramparts = this.planRamparts(room, protectedAssets, mode);
        const chokes = mode === 'territorial_gate' ? this.planChokes(room, cityPlan) : [];
        const gates = mode === 'territorial_gate' ? this.planGates(chokes) : [];
        const walls = mode === 'territorial_gate' ? this.planWalls(room, gates) : [];
        const repairTargets = this.repairTargetsFor(mode);
        const reservedPositions = this.collectReservedPositions(towers, ramparts, walls, gates);
        const buildQueue = this.buildQueueFor(room, towers, ramparts, walls, gates, buildLimitPerRun);

        return {
            version: DEFENSE_PLAN_VERSION,
            mode,
            updatedAt: Game.time,
            rcl: room.controller.level,
            protectedAssets,
            reservedPositions,
            towers,
            ramparts,
            walls,
            gates,
            chokes,
            repairTargets,
            buildLimitPerRun,
            buildQueue
        };
    }

    selectMode(room) {
        const storageEnergy = this.storageEnergy(room);
        const towerCount = this.countExistingTowers(room);
        if (room.controller.level >= 7 && storageEnergy >= 50000 && towerCount >= 3) return 'territorial_gate';
        if (room.controller.level >= 5 && storageEnergy >= 10000 && towerCount >= 2) return 'asset_protection';
        return 'core_fortress';
    }

    planTowers(room, cityPlan, mode) {
        const center = cityPlan.center || MemoryConfig.baseCenter(room);
        const towerOffsets = parsedCoreBlueprint[STRUCTURE_TOWER] || [];
        const maxAllowed = this.maxAllowed(STRUCTURE_TOWER, room.controller.level);
        const towers = [];

        for (let i = 0; i < towerOffsets.length && towers.length < maxAllowed; i++) {
            const offset = towerOffsets[i];
            towers.push({
                pos: { x: center.x + offset.dx, y: center.y + offset.dy, roomName: room.name },
                priority: mode === 'core_fortress' ? 100 - i : 120 - i,
                reason: 'tower_coverage',
                minRcl: 3
            });
        }

        return towers;
    }

    planProtectedAssets(room, cityPlan, towers, mode) {
        const assets = [];
        const spawns = room.find ? room.find(FIND_MY_SPAWNS) : [];
        for (const spawn of spawns) assets.push(this.assetEntry(spawn.pos, 'spawn', 100));

        for (const tower of towers) assets.push(this.assetEntry(tower.pos, 'tower', 95));

        if (room.storage && room.storage.pos) assets.push(this.assetEntry(room.storage.pos, 'storage', 98));

        if (cityPlan.controller && cityPlan.controller.containerPos) {
            assets.push(this.assetEntry(cityPlan.controller.containerPos, 'controller_container', 80));
        }

        if (mode !== 'core_fortress' && cityPlan.sources) {
            for (const sourceId in cityPlan.sources) {
                const plan = cityPlan.sources[sourceId];
                if (plan.containerPos) assets.push(this.assetEntry(plan.containerPos, 'source_container', 70));
            }
        }

        return assets;
    }

    planRamparts(room, protectedAssets, mode) {
        return protectedAssets.map((asset) => ({
            pos: asset.pos,
            priority: asset.priority,
            reason: asset.type,
            minRcl: mode === 'territorial_gate' && asset.type === 'source_container' ? 5 : 2
        }));
    }

    planChokes(room, cityPlan) {
        const center = cityPlan.center || MemoryConfig.baseCenter(room);
        const terrain = Game.map && Game.map.getRoomTerrain ? Game.map.getRoomTerrain(room.name) : null;
        const candidates = [
            { x: center.x, y: 1, roomName: room.name, side: 'top' },
            { x: center.x, y: 48, roomName: room.name, side: 'bottom' },
            { x: 1, y: center.y, roomName: room.name, side: 'left' },
            { x: 48, y: center.y, roomName: room.name, side: 'right' }
        ];

        return candidates.filter((candidate) => {
            return !terrain || terrain.get(candidate.x, candidate.y) !== TERRAIN_MASK_WALL;
        }).map((candidate, index) => ({
            pos: { x: candidate.x, y: candidate.y, roomName: candidate.roomName },
            priority: 60 - index,
            reason: `choke_${candidate.side}`
        }));
    }

    planGates(chokes) {
        return chokes.map((choke) => ({
            pos: choke.pos,
            priority: choke.priority + 10,
            reason: choke.reason.replace('choke', 'gate')
        }));
    }

    planWalls(room, gates) {
        const walls = [];
        for (const gate of gates) {
            const deltas = gate.pos.x <= 1 || gate.pos.x >= 48 ?
                [{ x: 0, y: -1 }, { x: 0, y: 1 }] :
                [{ x: -1, y: 0 }, { x: 1, y: 0 }];
            for (const delta of deltas) {
                const x = gate.pos.x + delta.x;
                const y = gate.pos.y + delta.y;
                if (x <= 0 || x >= 49 || y <= 0 || y >= 49) continue;
                walls.push({
                    pos: { x, y, roomName: room.name },
                    priority: gate.priority - 5,
                    reason: 'gate_wall'
                });
            }
        }
        return walls;
    }

    repairTargetsFor(mode) {
        if (mode === 'territorial_gate') return { rampartHits: 300000, wallHits: 100000 };
        if (mode === 'asset_protection') return { rampartHits: 100000, wallHits: 50000 };
        return { rampartHits: 10000, wallHits: 10000 };
    }

    buildQueueFor(room, towers, ramparts, walls, gates, buildLimitPerRun) {
        const queue = [];
        for (const tower of towers) {
            queue.push({
                structureType: STRUCTURE_TOWER,
                pos: tower.pos,
                priority: tower.priority,
                reason: tower.reason
            });
        }
        for (const rampart of ramparts) {
            queue.push({
                structureType: STRUCTURE_RAMPART,
                pos: rampart.pos,
                priority: rampart.priority,
                reason: rampart.reason
            });
        }
        for (const gate of gates) {
            queue.push({
                structureType: STRUCTURE_RAMPART,
                pos: gate.pos,
                priority: gate.priority,
                reason: gate.reason
            });
        }
        for (const wall of walls) {
            queue.push({
                structureType: STRUCTURE_WALL,
                pos: wall.pos,
                priority: wall.priority,
                reason: wall.reason
            });
        }

        return queue
            .filter((entry) => !this.hasStructureOrSite(room, entry.pos, entry.structureType))
            .sort((a, b) => b.priority - a.priority)
            .slice(0, buildLimitPerRun);
    }

    placeDefenseSites(room, defensePlan) {
        if (!defensePlan || !defensePlan.buildQueue) return;
        for (const entry of defensePlan.buildQueue) {
            if (this.hasStructureOrSite(room, entry.pos, entry.structureType)) continue;
            const result = new RoomPosition(entry.pos.x, entry.pos.y, room.name).createConstructionSite(entry.structureType);
            if (result === OK && global.RoomCache && global.RoomCache[room.name]) {
                global.RoomCache[room.name].isDirty = true;
            }
        }
    }

    collectReservedPositions(towers, ramparts, walls, gates) {
        const positions = [];
        const add = (pos) => {
            if (!positions.some((entry) => entry.x === pos.x && entry.y === pos.y && entry.roomName === pos.roomName)) {
                positions.push({ x: pos.x, y: pos.y, roomName: pos.roomName });
            }
        };
        for (const entry of towers.concat(ramparts, walls, gates)) add(entry.pos);
        return positions;
    }

    hasStructureOrSite(room, pos, structureType) {
        const structures = room.find ? room.find(FIND_STRUCTURES) : [];
        for (const structure of structures) {
            if (structure.structureType !== structureType) continue;
            if (!structure.pos) continue;
            if (structure.pos.x === pos.x && structure.pos.y === pos.y) return true;
        }

        const sites = room.find ? room.find(FIND_CONSTRUCTION_SITES) : [];
        for (const site of sites) {
            if (site.structureType !== structureType) continue;
            if (!site.pos) continue;
            if (site.pos.x === pos.x && site.pos.y === pos.y) return true;
        }
        return false;
    }

    assetEntry(pos, type, priority) {
        return {
            pos: { x: pos.x, y: pos.y, roomName: pos.roomName },
            type,
            priority
        };
    }

    maxAllowed(structureType, level) {
        return CONTROLLER_STRUCTURES &&
            CONTROLLER_STRUCTURES[structureType] &&
            CONTROLLER_STRUCTURES[structureType][level] ?
            CONTROLLER_STRUCTURES[structureType][level] : 0;
    }

    storageEnergy(room) {
        return room.storage && room.storage.store && room.storage.store.getUsedCapacity ?
            room.storage.store.getUsedCapacity(RESOURCE_ENERGY) : 0;
    }

    countExistingTowers(room) {
        const structures = room.find ? room.find(FIND_STRUCTURES) : [];
        return structures.filter((structure) => structure.structureType === STRUCTURE_TOWER).length;
    }
}

export default DefensePlannerService;
