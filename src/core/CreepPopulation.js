const ROLE_PARTS = {
    miner: 'work', hauler: 'carry', upgrader: 'work', builder: 'work', repairer: 'work'
};

export function activeBodyPartCount(body, partType) {
    if (!Array.isArray(body)) return 0;
    return body.reduce((count, part) => {
        if (!part || (typeof part === 'object' && part.hits !== undefined && part.hits <= 0)) return count;
        return count + ((typeof part === 'object' ? part.type : part) === partType ? 1 : 0);
    }, 0);
}

export function collectCreepPopulation({
    creeps = {}, spawns = {}, creepMemory = {}, spawnRecords = {}, tick,
    spawnTime = 3, replacementLeadTicks = 50
}) {
    const spawningNames = new Set();
    for (const spawn of Object.values(spawns)) {
        if (spawn.spawning && spawn.spawning.name) spawningNames.add(spawn.spawning.name);
    }
    const names = new Set([...Object.keys(creeps), ...Object.keys(spawnRecords), ...spawningNames]);
    const entries = [];
    for (const name of names) {
        const creep = creeps[name];
        const record = spawnRecords[name];
        const backupMemory = record && (record.memory || record);
        const memory = (creep && creep.memory && creep.memory.role ? creep.memory : null) ||
            backupMemory || creepMemory[name] || {};
        const body = creep ? creep.body : record && (record.body || memory.body);
        const bodyKnown = Array.isArray(body);
        const activeParts = {};
        if (bodyKnown) {
            for (const part of body) {
                const type = part && (typeof part === 'object' ? part.type : part);
                if (type && activeParts[type] === undefined) activeParts[type] = activeBodyPartCount(body, type);
            }
        }
        let state = 'invalid';
        let source = 'unknown';
        const reasons = [];
        if (creep) {
            source = 'live';
            state = creep.spawning || spawningNames.has(name) ? 'spawning' :
                (creep.ticksToLive !== undefined && creep.ticksToLive <= (bodyKnown ? body.length : 0) * spawnTime + replacementLeadTicks
                    ? 'retiring' : 'active');
        } else if (spawningNames.has(name)) {
            source = 'spawn';
            state = 'spawning';
        } else if (record && record.schemaVersion === 2 && record.acceptedAt === tick &&
            record.spawnName && spawns[record.spawnName] &&
            (record.expireAt === undefined || tick <= record.expireAt)) {
            source = 'accepted';
            state = 'accepted';
        } else {
            reasons.push('no_current_spawn_evidence');
        }
        if (!memory.role) reasons.push('role_unknown');
        if (!bodyKnown) reasons.push('body_unknown');
        const requiredPart = ROLE_PARTS[memory.role];
        const functional = !requiredPart || !bodyKnown || (activeParts[requiredPart] || 0) > 0;
        entries.push({
            name, memory, body, bodyKnown, state, activeParts, source,
            roomName: memory.homeRoom || memory.targetRoom || (creep && creep.room && creep.room.name) || null,
            coversQuota: !!memory.role && ['active', 'spawning', 'accepted'].includes(state) && functional,
            retireRequested: memory.retire === true,
            reasons
        });
    }
    return entries;
}

export function currentCreepPopulation(replacementLeadTicks = 50) {
    return collectCreepPopulation({
        creeps: Game.creeps || {}, spawns: Game.spawns || {},
        creepMemory: Memory.creeps || {}, spawnRecords: (Memory.empire && Memory.empire.spawningCreeps) || {},
        tick: Game.time, replacementLeadTicks,
        spawnTime: typeof CREEP_SPAWN_TIME === 'undefined' ? 3 : CREEP_SPAWN_TIME
    });
}
