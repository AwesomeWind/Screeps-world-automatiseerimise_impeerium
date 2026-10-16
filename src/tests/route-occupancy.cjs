const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createOccupancyFixture } = require('./helpers/route-occupancy-fixture.cjs');

test('scout initial planning avoids an actually occupied mining station', async () => {
    const scene = await createOccupancyFixture();
    const route = await scene.plan('work_positions');
    assert.equal(scene.searches.at(-1).stationCost, 255);
    assert.equal(route.valid, true);
    assert.equal(route.path.some(point => point.roomName === 'W1N1' && point.x === 43 && point.y === 30), false);
    assert.deepEqual(scene.occupant.memory.miningPos, { x: 43, y: 30, roomName: 'W1N1' });
});

test('task workPos occupied by a live worker also blocks transit', async () => {
    const scene = await createOccupancyFixture('worker');
    scene.occupant.memory.role = 'builder';
    delete scene.fixture.objects.Road43;
    scene.occupant.store.energy = 50;
    scene.fixture.objects.SomeSite = {
        id: 'SomeSite', kind: 'site', my: true,
        pos: new RoomPosition(44, 29, 'W1N1'), progress: 0, progressTotal: 1000
    };
    scene.occupant.memory.task = {
        type: 'BUILD', targetId: 'SomeSite', workPos: { x: 43, y: 30, roomName: 'W1N1' }
    };
    await scene.plan('work_positions');
    assert.equal(scene.searches.at(-1).stationCost, 255);
});

test('retry planning snapshots ordinary live creep occupancy', async () => {
    const scene = await createOccupancyFixture('moving');
    const route = await scene.plan('live_creeps');
    assert.equal(scene.searches.at(-1).stationCost, 255);
    assert.equal(route.valid, true);
    assert.equal(route.path[0].y, 29);
});

test('service preview and actual scout departure both enable work-position avoidance', async () => {
    const scene = await createOccupancyFixture();
    scene.fixture.runTick();
    const preview = scene.searches.find(search => search.origin.x === 10 && search.origin.y === 11);
    const actual = scene.searches.find(search => search.origin.x === 42 && search.origin.y === 30);
    assert.equal(preview.stationCost, 255);
    assert.equal(actual.stationCost, 255);
    assert.equal(scene.scout.memory.task.path[0].y, 29);
});

test('scout retry bypasses a live blocker and keeps the original leg deadline', async () => {
    const scene = await createOccupancyFixture('moving');
    scene.fixture.runTick();
    const deadline = scene.scout.memory.remoteLeg.expiresAt;
    for (let tick = 101; tick <= 108; tick++) scene.advance(tick);
    assert.equal(scene.scout.memory.remoteLeg.retryCount, 1);
    assert.equal(scene.scout.memory.remoteLeg.expiresAt, deadline);
    assert.notDeepEqual({ x: scene.scout.pos.x, y: scene.scout.pos.y }, { x: 42, y: 30 });
    const actorPlans = scene.searches.filter(search => search.origin.x === 42 && search.origin.y === 30);
    assert.equal(actorPlans.length, 2);
    assert.equal(actorPlans[0].stationCost, 1);
    assert.equal(actorPlans[1].stationCost, 255);
    assert.equal(scene.occupant.pos.x, 43);
    assert.equal(scene.occupant.pos.y, 30);
});

test('boundary: empty container and stale Memory miner do not block a road', async () => {
    const scene = await createOccupancyFixture('ghost');
    const route = await scene.plan('work_positions');
    assert.equal(scene.searches.at(-1).stationCost, 1);
    assert.equal(route.path[0].x, 43);
    assert.equal(route.path[0].y, 30);
});

test('boundary: initial planning does not hard-block every ordinary moving creep', async () => {
    const scene = await createOccupancyFixture('moving');
    await scene.plan('work_positions');
    assert.equal(scene.searches.at(-1).stationCost, 1);
});

test('a live retiring miner still occupies its station', async () => {
    const scene = await createOccupancyFixture();
    scene.occupant.memory.retire = true;
    await scene.plan('work_positions');
    assert.equal(scene.searches.at(-1).stationCost, 255);
});

test('an occupied exact scout goal is not unconditionally exempted', async () => {
    const scene = await createOccupancyFixture();
    const route = await scene.plan('work_positions', { x: 43, y: 30, roomName: 'W1N1' }, 0);
    assert.equal(route.valid, false);
});

test('boundary: range-one approach does not require entering the occupied tile', async () => {
    const scene = await createOccupancyFixture();
    const route = await scene.plan('work_positions', { x: 43, y: 30, roomName: 'W1N1' }, 1);
    assert.equal(route.valid, true);
    assert.deepEqual(route.path, []);
});

test('boundary: legacy default route policy is not silently expanded to economic roles', async () => {
    const scene = await createOccupancyFixture();
    await scene.plan();
    assert.equal(scene.searches.at(-1).stationCost, 1);
});

test('fresh occupancy snapshot removes a station block after the worker leaves', async () => {
    const scene = await createOccupancyFixture();
    await scene.plan('work_positions');
    const occupiedCost = scene.searches.at(-1).stationCost;
    scene.occupant.pos = new RoomPosition(44, 30, 'W1N1');
    Game.time++;
    await scene.plan('work_positions');
    assert.equal(occupiedCost, 255);
    assert.equal(scene.searches.at(-1).stationCost, 1);
});

test('no unoccupied corridor is a bounded route failure, not forced transit', async () => {
    const scene = await createOccupancyFixture('moving');
    const second = scene.fixture.actor('Other', 'hauler', [CARRY, MOVE]);
    second.pos = new RoomPosition(43, 29, 'W1N1');
    const route = await scene.plan('live_creeps');
    assert.equal(route.valid, false);
});

test('boundary: occupancy changes never clear a danger-zone blocker', async () => {
    const scene = await createOccupancyFixture('empty');
    const route = await import('../services/RemoteMiningRoute.js');
    route.planRemoteRoute(scene.scout.pos, { x: 1, y: 25, roomName: 'W1N2' }, {
        baseRoom: 'W1N1', targetRoom: 'W1N2', body: [MOVE], range: 0, occupancyMode: 'work_positions',
        dangerZones: [{ x: 43, y: 30, roomName: 'W1N1', range: 0 }]
    }, Memory.empire.control.policy.remoteMining, Game.time);
    assert.equal(scene.searches.at(-1).stationCost, 255);
});

test('road ordering cannot reopen a private rampart', async () => {
    const scene = await createOccupancyFixture('empty');
    scene.fixture.objects.StationRampart.my = false;
    const road = scene.fixture.objects.Road43;
    delete scene.fixture.objects.Road43;
    scene.fixture.objects.Road43 = road;
    await scene.plan('work_positions');
    assert.equal(scene.searches.at(-1).stationCost, 255);
});

test('boundary: snapshot occupancy excludes the actor at the current origin', async () => {
    const scene = await createOccupancyFixture('empty');
    await scene.plan('live_creeps');
    assert.notEqual(scene.searches.at(-1).originCost, 255);
});

test('boundary: excluding the origin does not erase a static building blocker', async () => {
    const scene = await createOccupancyFixture('empty');
    scene.fixture.objects.PreviewSpawn = {
        id: 'PreviewSpawn', structureType: STRUCTURE_SPAWN, pos: scene.scout.pos
    };
    await scene.plan('live_creeps');
    assert.equal(scene.searches.at(-1).originCost, 255);
});

test('boundary: excluding the origin does not erase a danger-zone blocker', async () => {
    const scene = await createOccupancyFixture('empty');
    const route = await import('../services/RemoteMiningRoute.js');
    route.planRemoteRoute(scene.scout.pos, { x: 1, y: 25, roomName: 'W1N2' }, {
        baseRoom: 'W1N1', targetRoom: 'W1N2', body: [MOVE], range: 0, occupancyMode: 'live_creeps',
        dangerZones: [{ x: 42, y: 30, roomName: 'W1N1', range: 0 }]
    }, Memory.empire.control.policy.remoteMining, Game.time);
    assert.equal(scene.searches.at(-1).originCost, 255);
});

test('an unknown occupancy mode fails closed before searching', async () => {
    const scene = await createOccupancyFixture();
    const route = await scene.plan('unknown');
    assert.equal(route.valid, false);
    assert.deepEqual(route.reasons, ['invalid_occupancy_mode']);
    assert.equal(scene.searches.length, 0);
});

test('retry occupancy includes visible creeps outside the owned population', async () => {
    const scene = await createOccupancyFixture('empty');
    scene.fixture.visibleHostiles.push({ pos: new RoomPosition(43, 30, 'W1N1') });
    await scene.plan('live_creeps');
    assert.equal(scene.searches.at(-1).stationCost, 255);
});

test('live-creep avoidance needs only physical position, without accessing foreign Memory', async () => {
    const scene = await createOccupancyFixture('empty');
    const foreign = { pos: new RoomPosition(43, 30, 'W1N1') };
    Object.defineProperty(foreign, 'memory', {
        get() { throw new Error('foreign Memory must not be read'); }
    });
    scene.fixture.visibleHostiles.push(foreign);
    const route = await scene.plan('live_creeps');
    assert.equal(route.valid, true);
    assert.equal(scene.searches.at(-1).stationCost, 255);
});

test('work-position coordinates must match the actual room as well as the tile', async () => {
    const scene = await createOccupancyFixture();
    scene.occupant.memory.miningPos.roomName = 'W1N2';
    await scene.plan('work_positions');
    assert.equal(scene.searches.at(-1).stationCost, 1);
});

test('an empty canonical station does not reserve transit space', async () => {
    const scene = await createOccupancyFixture('empty');
    Memory.rooms.W1N1.cityPlan = {
        workPositions: { sources: { HomeSourceB: { mining: {
            primary: { x: 43, y: 30, roomName: 'W1N1' }
        } } } }
    };
    await scene.plan('work_positions');
    assert.equal(scene.searches.at(-1).stationCost, 1);
});

test('occupancy supports native coordinate getters without changing actor or room Memory', async () => {
    const scene = await createOccupancyFixture();
    const point = scene.occupant.pos;
    scene.occupant.pos = Object.create(Object.getPrototypeOf(point), {
        x: { get: () => point.x }, y: { get: () => point.y }, roomName: { get: () => point.roomName }
    });
    const before = JSON.stringify(Memory);
    await scene.plan('work_positions');
    await scene.plan('live_creeps');
    assert.equal(scene.searches.at(-1).stationCost, 255);
    assert.equal(JSON.stringify(Memory), before);
});

test('new scout goals use initial occupancy rules after an older leg used its retry', async () => {
    const scene = await createOccupancyFixture('moving');
    scene.fixture.runTick();
    const strategy = scene.fixture.services.find(service => typeof service.moveActor === 'function');
    scene.scout.memory.remoteLeg.retryCount = 1;
    const goal = { x: 2, y: 25, roomName: 'W1N2', range: 0 };
    assert.equal(strategy.moveActor(scene.scout, scene.fixture.operation, goal), true);
    assert.equal(scene.searches.at(-1).stationCost, 1);
    assert.equal(scene.scout.memory.remoteLeg.retryCount, 0);
});

test('economic movement keeps its existing range-zero occupied-station contract', async () => {
    const scene = await createOccupancyFixture();
    scene.fixture.runTick();
    const strategy = scene.fixture.services.find(service => typeof service.moveActor === 'function');
    const operation = scene.fixture.operation;
    const sourceId = operation.config.sourceId;
    const miner = scene.fixture.actor('RemoteWorker', 'remoteMiner', [WORK, CARRY, MOVE], 'W1N1', {
        remoteId: operation.remoteId, epoch: operation.epoch, targetRoom: 'W1N2', sourceId
    });
    miner.pos = new RoomPosition(42, 30, 'W1N1');
    global.RemoteMining[operation.remoteId].state.allowEconomicDeparture = true;
    assert.equal(strategy.moveActor(miner, operation, { x: 43, y: 30, roomName: 'W1N1', range: 0 }), true);
    assert.equal(scene.searches.at(-1).stationCost, 1);
});

test('a retry with both corridors occupied stops once within the original deadline', async () => {
    const scene = await createOccupancyFixture('moving');
    const other = scene.fixture.actor('Other', 'hauler', [CARRY, MOVE]);
    other.pos = new RoomPosition(43, 29, 'W1N1');
    scene.fixture.runTick();
    const { startedAt, expiresAt } = scene.scout.memory.remoteLeg;
    for (let tick = 101; tick <= 115; tick++) scene.advance(tick);
    const actorPlans = scene.searches.filter(search => search.origin.x === 42 && search.origin.y === 30);
    assert.equal(actorPlans.length, 2);
    assert.equal(scene.scout.memory.remoteLeg.retryCount, 1);
    assert.equal(scene.scout.memory.remoteLeg.blockedReason, 'route_invalid');
    assert.equal(scene.scout.memory.remoteLeg.startedAt, startedAt);
    assert.equal(scene.scout.memory.remoteLeg.expiresAt, expiresAt);
    assert.equal(scene.scout.memory.task, null);
    assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.remoteId).length, 0);
});

test('a second blocker cannot grant a third route or extend the scout leg', async () => {
    const scene = await createOccupancyFixture('moving');
    scene.fixture.runTick();
    const { startedAt, expiresAt } = scene.scout.memory.remoteLeg;
    for (let tick = 101; tick <= 107; tick++) scene.advance(tick);
    // The retry was accepted, but the detour becomes occupied before movement resolves.
    scene.occupant.pos = new RoomPosition(43, 29, 'W1N1');
    for (let tick = 108; tick <= 125; tick++) scene.advance(tick);
    const actorPlans = scene.searches.filter(search => search.origin.roomName === 'W1N1' && search.origin.x > 40);
    assert.equal(actorPlans.length, 2);
    assert.equal(scene.scout.memory.remoteLeg.retryCount, 1);
    assert.equal(scene.scout.memory.remoteLeg.blockedReason, 'retry_exhausted');
    assert.equal(scene.scout.memory.remoteLeg.startedAt, startedAt);
    assert.equal(scene.scout.memory.remoteLeg.expiresAt, expiresAt);
});

for (const gate of ['hold', 'disabled', 'home_danger', 'home_recovery', 'remote_danger', 'foreign_control', 'epoch']) {
    test(`occupancy retry still obeys the current ${gate} gate`, async () => {
        const scene = await createOccupancyFixture('moving');
        scene.fixture.runTick();
        for (let tick = 101; tick <= 105; tick++) scene.advance(tick);
        const deadline = scene.scout.memory.remoteLeg.expiresAt;
        assert.equal(scene.scout.memory.lastTaskClear.reason, 'move_stuck_or_expired');
        if (gate === 'hold') Memory.empire.remoteRooms.W1N2.hold = true;
        if (gate === 'disabled') Memory.empire.control.policy.remoteMining.enabled = false;
        if (gate === 'home_danger') scene.fixture.visibleHostiles.push({ pos: new RoomPosition(11, 11, 'W1N1') });
        if (gate === 'home_recovery') global.RoomPhase.W1N1.recovery.mode = 'recovering';
        if (gate === 'remote_danger') {
            Game.rooms.W1N2 = scene.fixture.remote;
            scene.fixture.visibleHostiles.push({ pos: new RoomPosition(25, 1, 'W1N2') });
        }
        if (gate === 'foreign_control') scene.fixture.operation.lastKnownIntel = {
            observedAt: 105, owner: 'Other', sourceIds: [], hostile: false
        };
        if (gate === 'epoch') scene.scout.memory.epoch++;
        for (let tick = 106; tick <= 110; tick++) scene.advance(tick);
        assert.equal(scene.searches.filter(search => search.origin.x === 42 && search.origin.y === 30).length, 1);
        assert.equal(scene.scout.memory.remoteLeg.retryCount, 0);
        assert.equal(scene.scout.memory.remoteLeg.expiresAt, deadline);
        const remoteSpawns = scene.fixture.spawnCalls.filter(call => call.memory.remoteId);
        assert.equal(remoteSpawns.filter(call => call.memory.role !== 'scout').length, 0);
        // Existing population policy can replace an actor from the wrong epoch;
        // that does not authorize the mismatched actor to retry movement.
        assert.equal(remoteSpawns.length, gate === 'epoch' ? 1 : 0);
        if (gate === 'epoch') assert.equal(remoteSpawns[0].memory.epoch, scene.fixture.operation.epoch);
    });
}
