const { createRemoteFixture, store } = require('./remote-mining-fixture.cjs');
const { edgeDestination, nativeMoveDecision, positionSnapshot } = require('./native-room-movement.cjs');

async function createEconomicTrialFixture(options = {}) {
    const f = await createRemoteFixture({ containerBuilt: options.containerBuilt ?? true, pendingEnergy: options.pendingEnergy ?? 500,
        nativeMovement: options.nativeMovement, nativePositions: options.nativePositions });
    const { default: Guard } = await import('../../services/RemoteEconomicTrialService.js');
    const { default: Recon } = await import('../../services/RemoteReconTrialService.js');
    const { collectEconomicTrialFacts } = await import('../../services/RemoteEconomicTrialFacts.js');
    let nowMs = 1000000;
    const pendingMoves = new Map();
    const pendingActions = [];
    const calls = [];
    const phases = [];
    f.homeSink.structureType = STRUCTURE_TERMINAL;
    f.homeSink.store = store(20000, 300000);
    f.home.terminal = f.homeSink;
    delete f.home.storage;
    f.remote.controller.reservation = undefined;
    const raw = Memory.empire.remoteRooms.W1N2;
    Object.assign(raw, { enabled: false, hold: true, allowContainerBuild: true });
    const policy = Memory.empire.control.policy;
    policy.remoteMining.enabled = false;
    policy.remoteMining.roleLimits = { scout: 1, remoteMiner: 1, remoteHauler: 1, reserver: 0 };
    Memory.empire.market = { enabled: false };
    global.EmpireServicesVersion = 'econ-v1';
    Game.cpu.tickLimit = 20;
    if (!options.visible) delete Game.rooms.W1N2;
    const baseReset = f.resetRuntime;
    const resetRuntime = () => {
        baseReset();
        f.services.unshift(new Recon('RemoteReconTrial', { now: () => nowMs }),
            new Guard('RemoteEconomicTrial', { ...options.guardOptions, now: () => nowMs }));
        global.EmpireServices = f.services;
        delete global.RemoteEconomicTrial;
    };
    resetRuntime();
    const instrument = actor => {
        actor.moveByPath = route => {
            if (options.nativeMovement) {
                const decision = nativeMoveDecision(actor, route);
                calls.push({ tick: Game.time, name: actor.name, method: 'moveByPath', result: decision.result,
                    from: positionSnapshot(actor.pos), direction: decision.direction });
                if (decision.result === OK && !options.blockMoves) pendingMoves.set(actor.name, decision.next);
                return decision.result;
            }
            const index = route.findIndex(point => actor.pos.isEqualTo(point));
            const next = route[index + 1];
            const result = actor.fatigue ? ERR_TIRED : !next || index < 0 && !actor.pos.inRangeTo(route[0], 1) ? ERR_NOT_FOUND : OK;
            calls.push({ tick: Game.time, name: actor.name, method: 'moveByPath', result });
            if (result === OK && !options.blockMoves) pendingMoves.set(actor.name, next);
            return result;
        };
        for (const method of ['harvest', 'withdraw', 'transfer', 'build', 'repair', 'reserveController']) {
            actor[method] = (target, resource, amount) => {
                let result = f.results[actor.name + ':' + method] ?? OK;
                const range = ['build', 'repair'].includes(method) ? 3 : 1;
                if (!actor.pos.inRangeTo(target.pos, range)) result = ERR_NOT_IN_RANGE;
                calls.push({ tick: Game.time, name: actor.name, method, result, targetId: target.id, amount });
                if (result === OK) pendingActions.push({ actor, method, target, amount });
                return result;
            };
        }
        return actor;
    };
    const baseActor = f.actor;
    f.actor = (...args) => instrument(baseActor(...args));
    for (const spawn of Object.values(Game.spawns)) {
        const native = spawn.spawnCreep.bind(spawn);
        spawn.spawnCreep = (body, name, args) => {
            options.onSpawn?.({ body, name, memory: args.memory });
            const result = native(body, name, args);
            if (result === OK) {
                const actor = f.actor(name, args.memory.role, body, spawn.room.name, args.memory);
                actor.spawning = true;
                actor.pos = spawn.pos;
                spawn.spawning = { name, remainingTime: body.length * 3, needTime: body.length * 3 };
            }
            return result;
        };
    }
    const runTick = (patch = {}) => {
        if (patch.nowMs !== undefined) nowMs = patch.nowMs;
        global.EmpireTelemetry = { enabled: true, tick: Game.time, codeVersion: global.EmpireServicesVersion, errors: {}, services: {} };
        f.bus.beginTick();
        for (const phase of ['init', 'analyze']) for (const service of f.services) {
            if (patch.skipRemote && service.name === 'RemoteMining') continue;
            phases.push({ tick: Game.time, service: service.name, phase });
            service[phase]();
        }
        f.bus.dispatch();
        patch.betweenDispatchAndRun?.();
        for (const service of f.services) if (!patch.skipRemote || service.name !== 'RemoteMining') service.run();
        patch.beforeActionParser?.();
        for (const actor of Object.values(Game.creeps)) f.ActionParser.run(actor);
        for (const service of f.services) service.cleanup();
    };
    const advance = (patch = {}) => {
        for (const { actor, target, method, amount } of pendingActions.splice(0)) {
            if (!Game.creeps[actor.name]) continue;
            const work = actor.getActiveBodyparts(WORK);
            if (method === 'withdraw') {
                const delta = Math.min(amount ?? Infinity, actor.store.getFreeCapacity(), target.store.energy);
                actor.store.energy += delta; target.store.energy -= delta;
            } else if (method === 'transfer') {
                const delta = Math.min(amount ?? Infinity, actor.store.energy, target.store.getFreeCapacity());
                actor.store.energy -= delta; target.store.energy += delta;
            } else if (method === 'harvest') {
                const delta = Math.min(work * 2, actor.store.getFreeCapacity(), target.energy);
                actor.store.energy += delta; target.energy -= delta;
            } else if (method === 'build') {
                const delta = Math.min(work * BUILD_POWER, actor.store.energy, target.progressTotal - target.progress);
                actor.store.energy -= delta; target.progress += delta;
            } else if (method === 'repair') {
                const delta = Math.min(work, actor.store.energy);
                actor.store.energy -= delta; target.hits += delta * 100;
            }
        }
        for (const [name, point] of pendingMoves) {
            if (!Game.creeps[name]) continue;
            Game.creeps[name].pos = point;
            Game.creeps[name].room = point.roomName === 'W1N1' ? f.home : f.remote;
        }
        pendingMoves.clear();
        if (options.nativeMovement) for (const actor of Object.values(Game.creeps)) {
            if (actor.spawning) continue;
            actor.pos = edgeDestination(actor.pos);
            actor.room = actor.pos.roomName === 'W1N1' ? f.home : f.remote;
        }
        for (const spawn of Object.values(Game.spawns)) if (spawn.spawning && --spawn.spawning.remainingTime <= 0) {
            const actor = Game.creeps[spawn.spawning.name];
            if (actor) { actor.spawning = false; actor.pos = new RoomPosition(9, 10, 'W1N1'); }
            spawn.spawning = null;
        }
        if (options.visible || Object.values(Game.creeps).some(actor => actor.pos.roomName === 'W1N2')) Game.rooms.W1N2 = f.remote;
        else delete Game.rooms.W1N2;
        f.nextTick(patch);
        runTick(patch);
    };
    const prepare = (extra = {}) => {
        Object.assign(Memory.empire.remoteRooms.W1N2, { enabled: true, hold: false });
        const policy = Memory.empire.control.policy.remoteMining;
        policy.enabled = true;
        policy.economicTrial = { enabled: true, request: { schemaVersion: 1, action: 'start', id: 'econ-one', sequence: 1,
            remoteId: 'W1N1:W1N2', epoch: 1, codeVersion: global.EmpireServicesVersion, activateAtTick: Game.time + 1,
            expiresAtTick: Game.time + 1001, issuedAtMs: nowMs, expiresAtMs: nowMs + 5400000, ...extra } };
        policy.economicTrial.request.configFingerprint = collectEconomicTrialFacts(null, {
            tick: Game.time, nowMs, codeVersion: global.EmpireServicesVersion }).configFingerprint;
    };
    const restoreMemory = () => {
        global.Memory = JSON.parse(JSON.stringify(Memory));
        for (const actor of Object.values(Game.creeps)) actor.memory = Memory.creeps[actor.name];
        f.memory = Memory;
        resetRuntime();
    };
    return { f, calls, phases, prepare, runTick, advance, restoreMemory, resetRuntime,
        setNowMs(value) { nowMs = value; },
        get state() { return Memory.empire.remoteMining?.economicTrials; },
        get current() { return Memory.empire.remoteMining?.economicTrials?.current; } };
}
module.exports = { createEconomicTrialFixture };
