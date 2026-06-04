import BaseService from '../core/BaseService.js';
import EventBus from '../core/EventBus.js';
import BodyBuilder from '../core/BodyBuilder.js';
import MemoryConfig from '../config/MemoryConfig.js';

class RemoteMiningService extends BaseService {
    analyze() {
        const remoteRooms = Memory.empire.remoteRooms || {};
        for (const remoteRoomName in remoteRooms) {
            const config = remoteRooms[remoteRoomName];
            if (!config.enabled) continue;
            if (!MemoryConfig.flag(config.baseRoom, 'remoteMining', true)) continue;

            if (!Game.rooms[remoteRoomName]) {
                this.requestCreep(config.baseRoom, 'scout', 'scout', { role: 'scout', targetRoom: remoteRoomName }, 60);
                continue;
            }

            const room = Game.rooms[remoteRoomName];
            if (room.controller && (!room.controller.reservation || room.controller.reservation.ticksToEnd < 1000)) {
                this.requestCreep(config.baseRoom, 'reserver', 'reserver', {
                    role: 'reserver',
                    targetRoom: remoteRoomName
                }, 70);
            }

            const sources = room.find(FIND_SOURCES);
            for (const source of sources) {
                if (!this.hasRoleForTarget('remoteMiner', source.id)) {
                    this.requestCreep(config.baseRoom, 'remoteMiner', this.remoteMinerBodyProfile(config), {
                        role: 'remoteMiner',
                        targetRoom: remoteRoomName,
                        sourceId: source.id
                    }, 65);
                }
            }
        }
    }

    hasRoleForTarget(role, targetId) {
        for (const name in Game.creeps) {
            const memory = Game.creeps[name].memory;
            if (memory.role === role && (memory.sourceId === targetId || memory.targetRoom === targetId)) return true;
        }
        return false;
    }

    remoteMinerBodyProfile(config) {
        const distance = config.distance || config.range || config.pathLength || 0;
        return distance >= 50 ? 'remote_travel_miner' : 'remote_miner';
    }

    requestCreep(roomName, role, bodyProfile, memory, priority) {
        const baseRoom = Game.rooms[roomName] || {
            energyAvailable: 300,
            energyCapacityAvailable: 300
        };
        const body = BodyBuilder.build(role, baseRoom, {
            bodyProfile,
            energyCapacity: baseRoom.energyCapacityAvailable || baseRoom.energyAvailable || 0
        }).body;
        EventBus.publish('REQ_SPAWN', priority, {
            roomName,
            role,
            body,
            memory
        }, 5);
    }
}

export default RemoteMiningService;
