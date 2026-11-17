const MAX_LOCAL_RECEIPTS = 200;
const IN_FLIGHT = new Set(['admitted', 'calling', 'unknown', 'spawn_accepted', 'spawning']);

export function isLocalSpawnPilotRoom(room) {
    return room?.controller?.my === true &&
        Memory.empire?.control?.policy?.spawnIntake?.localReplacementPilotRoom === room.name;
}

export function isLocalReplacementRole(role) {
    return role === 'miner' || role === 'hauler';
}

export function validLocalSpawnRequest(event) {
    const data = event.data;
    const memory = data.memory;
    const offeredAt = typeof event.id === 'string' && /^REQ_SPAWN_(\d+)_\d+$/.exec(event.id);
    if (!offeredAt || data.requestId !== undefined || data.name !== undefined ||
        !isLocalReplacementRole(data.role) || data.role !== memory?.role || data.roomName !== memory.homeRoom) return false;
    const tick = Number(offeredAt[1]);
    const quotaKey = data.role === 'hauler' ? ['hauler', data.roomName, 'core'].join(':')
        : memory.sourceId && ['miner', data.roomName, memory.sourceId].join(':');
    return Number.isSafeInteger(tick) && tick <= Game.time && event.expireAt === tick + 1 &&
        quotaKey && memory.quotaKey === quotaKey;
}

export function hasLocalSpawnInFlight(roomName, quotaKey) {
    const rows = Memory.empire.localSpawnReceipts;
    return !!(rows && quotaKey && Object.values(rows).some(row => row?.roomName === roomName &&
        row.quotaKey === quotaKey && row.observeUntil >= Game.time && IN_FLIGHT.has(row.state)));
}

export function admitLocalSpawn(event, name, spawnName, cost) {
    const {data} = event;
    if (Memory.empire.localSpawnReceipts === undefined) Memory.empire.localSpawnReceipts = {};
    const rows = Memory.empire.localSpawnReceipts;
    if (!rows || typeof rows !== 'object' || Array.isArray(rows) ||
        Object.hasOwn(rows, event.id) || Object.keys(rows).length >= MAX_LOCAL_RECEIPTS) return null;

    const spawnTime = typeof CREEP_SPAWN_TIME === 'undefined' ? 3 : CREEP_SPAWN_TIME;
    const receipt = {
        requestId: event.id, roomName: data.roomName, quotaKey: data.memory.quotaKey, role: data.role,
        name, spawnName, cost, state: 'admitted', admittedAt: Game.time, expireAt: event.expireAt,
        observeUntil: Game.time + data.body.length * spawnTime + 10
    };
    rows[event.id] = receipt;
    return rows[event.id] === receipt ? receipt : null;
}

export function runLocalSpawn(receipt, call) {
    const current = Memory.empire.localSpawnReceipts?.[receipt.requestId];
    if (current !== receipt || receipt.state !== 'admitted') return {state: 'not_called'};
    if (!isLocalSpawnPilotRoom(Game.rooms[receipt.roomName]) || Game.time > receipt.expireAt ||
        Game.time !== receipt.admittedAt) {
        receipt.state = 'not_called';
        return {state: receipt.state};
    }
    receipt.callStartedAt = Game.time;
    receipt.state = 'calling';
    if (receipt.state !== 'calling' || receipt.callStartedAt !== Game.time) return {state: 'not_called'};
    let result;
    try {
        result = call();
    } catch {
        receipt.state = 'unknown';
        return {state: receipt.state};
    }
    const state = result === OK ? 'spawn_accepted' : (Number.isInteger(result) && result < 0 ? 'failed' : 'unknown');
    if (state !== 'unknown') {
        receipt.result = result;
        receipt.resultAt = Game.time;
    }
    receipt.state = state;
    return {state, result};
}

export function reconcileLocalSpawnReceipts() {
    const rows = Memory.empire.localSpawnReceipts;
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return;
    for (const [id, row] of Object.entries(rows)) {
        if (!row || Game.time > row.observeUntil) {
            delete rows[id];
            continue;
        }
        if (row.state === 'admitted') {
            row.state = 'not_called';
            continue;
        }
        if (row.state === 'calling') row.state = 'unknown';
        if (!IN_FLIGHT.has(row.state)) continue;

        const creep = Game.creeps[row.name];
        const spawning = Game.spawns[row.spawnName]?.spawning?.name === row.name;
        const memory = creep?.memory;
        const sameIdentity = memory?.localSpawnRequestId === id && memory.role === row.role &&
            memory.homeRoom === row.roomName && memory.quotaKey === row.quotaKey;
        if (sameIdentity && !creep.spawning && !spawning) {
            row.state = 'born';
            row.bornAt = Game.time;
        } else if (spawning || (sameIdentity && creep.spawning)) {
            row.state = 'spawning';
            if (row.spawningSeenAt === undefined) row.spawningSeenAt = Game.time;
        }
    }
}
