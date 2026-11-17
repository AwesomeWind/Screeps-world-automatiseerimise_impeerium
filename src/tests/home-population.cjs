const assert = require('node:assert/strict');
const {before, test} = require('node:test');
const {installGlobals} = require('./helpers/remote-mining-fixture.cjs');

const roomName = 'W49N41';
let EventBus;
let RoomPhase;
let collectRoomGovernorFacts;
let currentCreepPopulation;

before(async () => {
    installGlobals();
    ({default: EventBus} = await import('../core/EventBus.js'));
    ({default: RoomPhase} = await import('../services/RoomPhaseService.js'));
    ({collectRoomGovernorFacts} = await import('../governance/RoomGovernorFacts.js'));
    ({currentCreepPopulation} = await import('../core/CreepPopulation.js'));
});

function resetWorld(tick = 2000, energy = 550) {
    const room = {
        name: roomName,
        controller: {my: true, level: 6, ticksToDowngrade: 12000},
        energyAvailable: energy,
        energyCapacityAvailable: energy,
        find: () => []
    };
    const spawn = {name: 'Spawn1', room, spawning: null};
    global.Game = {time: tick, rooms: {[roomName]: room}, spawns: {Spawn1: spawn}, creeps: {}};
    global.Memory = {creeps: {}, rooms: {[roomName]: {}}, empire: {spawningCreeps: {}}};
    global.RoomCache = {};
    EventBus.topics = {};
    return {room, spawn};
}

function live(name, role, body, {ttl = 1000, retire = false} = {}) {
    const room = Game.rooms[roomName];
    const memory = {role, homeRoom: roomName, retire};
    Game.creeps[name] = {name, room, memory, body, ticksToLive: ttl};
}

function part(type, hits = 100) {
    return {type, hits};
}

function identities() {
    return Object.fromEntries(currentCreepPopulation().map(entry => [entry.name, entry]));
}

function projections() {
    new RoomPhase('RoomPhase').analyze();
    const {recovery} = global.RoomPhase[roomName];
    const {rooms, errors} = collectRoomGovernorFacts();
    assert.deepEqual(errors, {});
    return {recovery, facts: rooms[roomName]};
}

test('pending demand has no population identity until evidence of Spawn acceptance exists', () => {
    const {spawn} = resetWorld();
    const name = 'Replacement';
    const memory = {role: 'miner', homeRoom: roomName};
    EventBus.publish('REQ_SPAWN', 120, {name, memory, body: [WORK, MOVE], roomName}, 1);
    Memory.creeps[name] = memory;
    assert.deepEqual(currentCreepPopulation(), []);
    assert.equal(projections().recovery.coreUpcoming.miner, 0);

    Memory.empire.spawningCreeps[name] = {
        schemaVersion: 2, acceptedAt: Game.time, expireAt: Game.time + 16,
        spawnName: 'Spawn1', memory, body: [WORK, MOVE]
    };
    let entry = identities()[name];
    assert.equal(entry.state, 'accepted');
    assert.equal(entry.spawnInProgress, true);
    assert.equal(entry.usableForRole, false);
    assert.equal(projections().facts.spawningCapabilities.harvestWork, 1);

    Game.time++;
    entry = identities()[name];
    assert.equal(entry.state, 'invalid');
    assert.equal(entry.spawnInProgress, false);
    assert.equal(projections().recovery.coreUpcoming.miner, 0);

    spawn.spawning = {name};
    entry = identities()[name];
    assert.equal(entry.state, 'spawning');
    assert.equal(entry.spawnInProgress, true);
    assert.equal(entry.usableForRole, false);
    assert.equal(projections().recovery.coreUpcoming.miner, 1);
});

test('missing body can cover a quota without proving active or upcoming work parts', () => {
    const {spawn} = resetWorld();
    live('UnknownHauler', 'hauler', undefined);
    spawn.spawning = {name: 'UnknownMiner'};
    Memory.creeps.UnknownMiner = {role: 'miner', homeRoom: roomName};
    const entries = identities();

    assert.equal(entries.UnknownHauler.state, 'active');
    assert.equal(entries.UnknownHauler.coversQuota, true);
    assert.equal(entries.UnknownHauler.usableForRole, false);
    assert.equal(entries.UnknownMiner.state, 'spawning');
    assert.equal(entries.UnknownMiner.coversQuota, true);
    assert.equal(entries.UnknownMiner.spawnInProgress, true);
    assert.deepEqual(entries.UnknownMiner.activeParts, {});

    const {recovery, facts} = projections();
    assert.deepEqual(recovery.coreUsable, {miner: 0, hauler: 0});
    assert.deepEqual(recovery.coreUpcoming, {miner: 1, hauler: 0});
    assert.equal(facts.capabilities.logisticsCarry, 0);
    assert.equal(facts.spawningCapabilities.harvestWork, 0);
});

test('active, destroyed and retiring parts are projected into their proper buckets', () => {
    resetWorld();
    live('StableMiner', 'miner', [part(WORK), part(WORK, 0), part(MOVE)], {ttl: 60, retire: true});
    live('RetiringHauler', 'hauler', [part(CARRY), part(MOVE)], {ttl: 56});
    live('DamagedHauler', 'hauler', [part(CARRY, 0), part(MOVE)]);
    const entries = identities();

    assert.equal(entries.StableMiner.state, 'active');
    assert.equal(entries.StableMiner.usableForRole, true);
    assert.equal(entries.StableMiner.retireRequested, true);
    assert.equal(entries.RetiringHauler.state, 'retiring');
    assert.equal(entries.RetiringHauler.usableForRole, false);
    assert.equal(entries.DamagedHauler.state, 'active');
    assert.equal(entries.DamagedHauler.usableForRole, false);

    const {recovery, facts} = projections();
    assert.deepEqual(recovery.coreUsable, {miner: 1, hauler: 0});
    assert.equal(facts.capabilities.harvestWork, 1);
    assert.equal(facts.capabilities.logisticsCarry, 0);
    assert.equal(facts.retiringCapabilities.logisticsCarry, 1);
});

test('recorded W49N41 recovery counters survive a replay of the observed hauler replacement', () => {
    const frames = require('./fixtures/w49n41-native-population-frames.json');
    assert.deepEqual(frames.map(frame => frame.tick), [84105972, 84106027]);

    for (const frame of frames) {
        const {room, spawn} = resetWorld(frame.tick, frame.energy);
        room.controller.ticksToDowngrade = frame.downgrade;
        for (const [role, count] of Object.entries(frame.recovery.usable)) {
            const requiredPart = role === 'miner' ? WORK : CARRY;
            for (let index = 0; index < count; index++) {
                live(role + index, role, [part(requiredPart), part(MOVE)]);
            }
        }
        const [observedSpawn] = frame.spawns;
        if (observedSpawn.busy) {
            spawn.spawning = {name: 'PendingHauler', remainingTime: observedSpawn.remaining};
            Memory.creeps.PendingHauler = {role: observedSpawn.role, homeRoom: roomName};
        }
        const before = JSON.stringify(Memory);
        const population = currentCreepPopulation();
        assert.equal(JSON.stringify(Memory), before);
        assert.equal(population.filter(entry => entry.spawnInProgress).length, Number(observedSpawn.busy));

        const {recovery, facts} = projections();
        assert.equal(recovery.evaluatedAt, frame.recovery.tick);
        assert.equal(recovery.mode, frame.recovery.mode);
        assert.deepEqual(recovery.coreUsable, frame.recovery.usable);
        assert.deepEqual(recovery.coreUpcoming, frame.recovery.upcoming);
        assert.equal(facts.energyAvailable, frame.energy);
        // The historical probe captured role counts, but did not collect the new hauler's body.
        assert.equal(facts.spawningCapabilities.logisticsCarry, 0);
    }
});
