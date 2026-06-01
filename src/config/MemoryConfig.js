const DEFAULT_MARKET = {
    enabled: false,
    minCreditsPerEnergy: 0.02,
    energyReserve: 100000,
    sellBatchSize: 50000
};

const MemoryConfig = {
    ensureDefaults() {
        if (!Memory.empire) Memory.empire = {};
        if (!Memory.empire.remoteRooms) Memory.empire.remoteRooms = {};
        if (!Memory.empire.market) Memory.empire.market = DEFAULT_MARKET;
        if (!Memory.rooms) Memory.rooms = {};

        for (const roomName in Game.rooms) {
            if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
            const roomMemory = Memory.rooms[roomName];
            if (!roomMemory.serviceFlags) {
                roomMemory.serviceFlags = {
                    planning: true,
                    roads: true,
                    lab: true,
                    market: true,
                    remoteMining: true
                };
            }
        }
    },

    room(roomName) {
        if (!Memory.rooms) Memory.rooms = {};
        if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
        return Memory.rooms[roomName];
    },

    flag(roomName, flagName, defaultValue = true) {
        const flags = this.room(roomName).serviceFlags || {};
        return flags[flagName] === undefined ? defaultValue : flags[flagName];
    },

    baseCenter(room) {
        const roomMemory = this.room(room.name);
        const configured = roomMemory.baseCenter;
        if (configured) return new RoomPosition(configured.x, configured.y, room.name);

        const spawns = room.find(FIND_MY_SPAWNS);
        const center = spawns.length > 0 ? spawns[0].pos : (room.storage ? room.storage.pos : (room.controller ? room.controller.pos : null));
        if (!center) return null;

        roomMemory.baseCenter = { x: center.x, y: center.y, roomName: room.name };
        return new RoomPosition(center.x, center.y, room.name);
    }
};

export default MemoryConfig;
