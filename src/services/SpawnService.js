import BaseService from '../core/BaseService.js';
import EventBus from '../core/EventBus.js';

class SpawnService extends BaseService {
    constructor(serviceName) {
        super(serviceName);
        this.idleSpawns = {};
        this.pendingTasks = [];
        EventBus.subscribe('REQ_SPAWN', this.handleSpawnRequest.bind(this));
    }

    init() {
        this.idleSpawns = {};
        this.pendingTasks = [];

        for (const spawnName in Game.spawns) {
            const spawn = Game.spawns[spawnName];
            if (spawn.spawning) continue;
            const roomName = spawn.room.name;
            if (!this.idleSpawns[roomName]) this.idleSpawns[roomName] = [];
            this.idleSpawns[roomName].push(spawn);
        }
    }

    handleSpawnRequest(event) {
        const data = event.data;
        const roomName = data.roomName;
        const spawns = this.idleSpawns[roomName] || [];
        if (spawns.length === 0) return false;

        const room = Game.rooms[roomName];
        if (!room || room.energyAvailable < this.calculateBodyCost(data.body)) return false;

        const spawn = spawns.pop();
        const name = data.name || `${data.role || data.memory.role}_${Game.time}`;
        this.pendingTasks.push({ spawn, data, name });
        return true;
    }

    run() {
        for (const task of this.pendingTasks) {
            const result = task.spawn.spawnCreep(task.data.body, task.name, {
                memory: task.data.memory || { role: task.data.role },
                directions: task.data.directions
            });
            if (result !== OK && result !== ERR_NAME_EXISTS) {
                console.log(`[SpawnService] spawn failed ${task.name}: ${result}`);
            }
        }
    }

    cleanup() {
        for (const name in Memory.creeps) {
            if (!Game.creeps[name]) delete Memory.creeps[name];
        }
    }

    calculateBodyCost(body) {
        return body.reduce((sum, part) => sum + BODYPART_COST[part], 0);
    }
}

export default SpawnService;
