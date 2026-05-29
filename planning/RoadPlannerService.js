const BaseService = require('core/BaseService');
const MemoryConfig = require('config/MemoryConfig');
const { parsedCoreBlueprint } = require('planning/BaseBlueprint');

class RoadPlannerService extends BaseService {
    analyze() {
        if (Game.time % 500 !== 0) return;

        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            if (!MemoryConfig.flag(roomName, 'roads', true)) continue;

            const cache = global.RoomCache && global.RoomCache[roomName];
            if (!cache || !cache.centerPos) continue;

            if (!Memory.rooms[roomName].roadNetwork) {
                Memory.rooms[roomName].roadNetwork = this.planRoads(room, cache);
            }
            this.placeRoadSites(room, Memory.rooms[roomName].roadNetwork);
        }
    }

    planRoads(room, cache) {
        const roadTiles = parsedCoreBlueprint[STRUCTURE_ROAD].map((offset) => {
            return `${cache.centerPos.x + offset.dx},${cache.centerPos.y + offset.dy}`;
        });
        const targets = cache.sources.concat(cache.controller ? [cache.controller] : []);

        for (const id of targets) {
            const target = Game.getObjectById(id);
            if (!target) continue;
            const result = PathFinder.search(cache.centerPos, { pos: target.pos, range: 1 }, {
                plainCost: 2,
                swampCost: 5,
                roomCallback: (roomName) => roomName === room.name ? new PathFinder.CostMatrix() : false
            });
            if (!result.incomplete) {
                for (const pos of result.path) roadTiles.push(`${pos.x},${pos.y}`);
            }
        }

        return Array.from(new Set(roadTiles));
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

module.exports = RoadPlannerService;
