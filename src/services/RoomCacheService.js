import BaseService from '../core/BaseService.js';
import MemoryConfig from '../config/MemoryConfig.js';

class RoomCacheService extends BaseService {
    constructor(serviceName) {
        super(serviceName);
        if (!global.RoomCache) global.RoomCache = {};
    }

    init() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            const cache = global.RoomCache[roomName];
            if (!cache || cache.isDirty || Game.time % 50 === 0) {
                this.buildRoomCache(room);
            }
        }
    }

    buildRoomCache(room) {
        const structures = {};
        const allStructures = room.find(FIND_STRUCTURES);
        for (const structure of allStructures) {
            if (!structures[structure.structureType]) structures[structure.structureType] = [];
            structures[structure.structureType].push(structure.id);
        }

        const labs = structures[STRUCTURE_LAB] || [];
        const roomMemory = MemoryConfig.room(room.name);
        const configuredLabs = roomMemory.labs || {};

        global.RoomCache[room.name] = {
            sources: room.find(FIND_SOURCES).map((source) => source.id),
            controller: room.controller ? room.controller.id : null,
            minerals: room.find(FIND_MINERALS).map((mineral) => mineral.id),
            constructionSites: room.find(FIND_CONSTRUCTION_SITES).map((site) => site.id),
            structures,
            labs: {
                input1: configuredLabs.input1 || labs[0] || null,
                input2: configuredLabs.input2 || labs[1] || null,
                outputs: configuredLabs.outputs || labs.slice(2)
            },
            centerPos: MemoryConfig.baseCenter(room),
            roadNetwork: roomMemory.roadNetwork || null,
            isDirty: false,
            updatedAt: Game.time
        };
    }
}

export default RoomCacheService;
