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
        const configured = this.room(room.name).baseCenter;
        if (configured) return new RoomPosition(configured.x, configured.y, room.name);
        if (room.storage) return room.storage.pos;
        if (room.find(FIND_MY_SPAWNS).length > 0) return room.find(FIND_MY_SPAWNS)[0].pos;
        return room.controller ? room.controller.pos : null;
    }
};

module.exports = MemoryConfig;
