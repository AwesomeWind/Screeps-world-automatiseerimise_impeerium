import BaseService from '../core/BaseService.js';
import MemoryConfig from '../config/MemoryConfig.js';
import { parsedCoreBlueprint } from './BaseBlueprint.js';

class CityPlannerService extends BaseService {
    analyze() {
        if (Game.time % 100 !== 0) return;

        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            if (!MemoryConfig.flag(roomName, 'planning', true)) continue;

            const center = MemoryConfig.baseCenter(room);
            if (!center) continue;

            this.placeByType(room, center, STRUCTURE_EXTENSION);
            this.placeByType(room, center, STRUCTURE_TOWER);
            if (room.controller.level >= 4) this.placeByType(room, center, STRUCTURE_STORAGE);
        }
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
