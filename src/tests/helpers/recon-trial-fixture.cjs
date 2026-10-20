const { createRemoteFixture } = require('./remote-mining-fixture.cjs');

async function createReconTrialFixture(options = {}) {
    const fixture = await createRemoteFixture({ containerBuilt: false });
    const { default: Guard } = await import('../../services/RemoteReconTrialService.js');
    const { default: Scheduler } = await import('../../core/ServiceScheduler.js');
    const raw = Memory.empire.remoteRooms.W1N2;
    Object.assign(raw, { enabled: false, hold: true, sourceId: null, containerId: null, allowContainerBuild: false });
    Object.assign(Memory.empire.control.policy.remoteMining, { enabled: false,
        roleLimits: { scout: 1, remoteMiner: 0, remoteHauler: 0, reserver: 0 } });
    Memory.empire.market.enabled = false;
    delete Game.rooms.W1N2;
    global.EmpireServicesVersion = 'trial-v1';
    Game.cpu.tickLimit = 20;
    let nowMs = options.nowMs ?? 1000000;
    let blocked = false;
    const moves = [];
    const pendingMoves = new Map();
    const phases = [];
    const baseReset = fixture.resetRuntime;
    const resetRuntime = () => {
        baseReset();
        fixture.services.unshift(new Guard('RemoteReconTrial', { ...options.guardOptions, now: () => nowMs }));
        global.EmpireServices = fixture.services;
    };
    resetRuntime();
    for (const spawn of Object.values(Game.spawns)) {
        const nativeSpawn = spawn.spawnCreep.bind(spawn);
        spawn.spawnCreep = (body, name, { memory }) => {
            const result = nativeSpawn(body, name, { memory });
            if (result === OK) {
                const actor = fixture.actor(name, memory.role, body, spawn.room.name, memory);
                actor.spawning = true;
                actor.pos = spawn.pos;
                spawn.spawning = { name, needTime: body.length * 3, remainingTime: body.length * 3 };
                actor.moveByPath = path => {
                    const index = path.findIndex(point => point.isEqualTo(actor.pos));
                    const next = path[index + 1];
                    const result = !next || index < 0 && actor.pos.getRangeTo(path[0]) > 1 ? ERR_NOT_FOUND : OK;
                    moves.push({ tick: Game.time, name, result, from: actor.pos, next, goal: actor.memory.task?.pos });
                    if (result === OK && !blocked) pendingMoves.set(name, next);
                    return result;
                };
            }
            return result;
        };
    }
    const runTick = (patch = {}) => {
        if (patch.tick !== undefined) fixture.nextTick(patch);
        if (patch.nowMs !== undefined) nowMs = patch.nowMs;
        global.EmpireTelemetry = { enabled: true, tick: Game.time, codeVersion: global.EmpireServicesVersion,
            errors: {}, services: {}, totalCpu: 0 };
        Scheduler.beginTick();
        fixture.bus.beginTick();
        const phase = name => {
            for (const service of fixture.services) {
                if (patch.skipRemote && service.name === 'RemoteMining') continue;
                if (!Scheduler.decision(service.name, name).shouldRun) continue;
                phases.push({ name: service.name, phase: name, tick: Game.time });
                service[name]();
            }
        };
        phase('init');
        phase('analyze');
        fixture.bus.dispatch();
        patch.betweenDispatchAndRun?.();
        phase('run');
        patch.beforeActionParser?.();
        for (const creep of Object.values(Game.creeps)) fixture.ActionParser.run(creep);
        phase('cleanup');
    };
    const advance = (patch = {}) => {
        for (const [name, position] of pendingMoves) {
            if (Game.creeps[name]) {
                Game.creeps[name].pos = position;
                Game.creeps[name].room = position.roomName === 'W1N1' ? fixture.home : fixture.remote;
            }
        }
        pendingMoves.clear();
        for (const spawn of Object.values(Game.spawns)) {
            if (!spawn.spawning) continue;
            spawn.spawning.remainingTime--;
            if (spawn.spawning.remainingTime <= 0) {
                const actor = Game.creeps[spawn.spawning.name];
                actor.spawning = false;
                actor.pos = new RoomPosition(9, 10, spawn.room.name);
                spawn.spawning = null;
            }
        }
        runTick({ tick: Game.time + 1, ...patch });
    };
    const prepare = (extra = {}) => {
        const activateAtTick = extra.activateAtTick ?? Game.time + 1;
        Object.assign(Memory.empire.remoteRooms.W1N2, { enabled: true, hold: false });
        const remote = Memory.empire.control.policy.remoteMining;
        remote.enabled = true;
        remote.reconTrial = { enabled: true, request: { schemaVersion: 1, action: 'start', id: 'trial-one', sequence: 1,
            remoteId: 'W1N1:W1N2', epoch: 1, codeVersion: global.EmpireServicesVersion, activateAtTick,
            expiresAtTick: activateAtTick + 300, issuedAtMs: nowMs, expiresAtMs: nowMs + 1200000,
            candidateSourceId: 'remoteSourceA', ...extra } };
    };
    const restoreMemory = () => {
        global.Memory = JSON.parse(JSON.stringify(Memory));
        for (const actor of Object.values(Game.creeps)) actor.memory = Memory.creeps[actor.name];
        fixture.memory = Memory;
        resetRuntime();
    };
    return { fixture, phases, moves, prepare, runTick, advance, resetRuntime, restoreMemory,
        setNowMs(value) { nowMs = value; }, setBlocked(value) { blocked = value; },
        get state() { return Memory.empire.remoteMining?.reconTrials; },
        get scout() { return Object.values(Game.creeps).find(creep => creep.memory.reconTrialId); } };
}

module.exports = { createReconTrialFixture };
