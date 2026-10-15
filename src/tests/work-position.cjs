const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRemoteFixture } = require('./helpers/remote-mining-fixture.cjs');

async function createWorkFixture(type = 'BUILD') {
    const f = await createRemoteFixture({ manualSettlement: true, policyEnabled: false });
    f.homeSink.pos = new RoomPosition(31, 24, 'W1N1');
    const site = { id: 'WorkTarget', pos: new RoomPosition(32, 24, 'W1N1'), progress: 0,
        progressTotal: 100000, hits: 1000, hitsMax: 5000, structureType: type === 'REPAIR' ? STRUCTURE_ROAD : undefined };
    f.objects.WorkTarget = site;
    const worker = f.actor('Worker', type === 'BUILD' ? 'builder' : 'repairer', [WORK, CARRY, MOVE]);
    worker.store.energy = 50;
    worker.pos = new RoomPosition(30, 25, 'W1N1');
    worker.memory.task = { type, targetId: site.id, workPos: { x: 31, y: 24, roomName: 'W1N1' } };
    f.objects.StorageRampart = { id: 'StorageRampart', structureType: STRUCTURE_RAMPART,
        my: true, pos: new RoomPosition(31, 24, 'W1N1') };
    return { ...f, site, worker };
}

test('work_layered_rampart_never_hides_storage_in_any_order', async () => {
    const f = await createWorkFixture();
    const Planner = (await import('../core/WorkPositionPlanner.js')).default;
    const storage = f.homeSink;
    const rampart = f.objects.StorageRampart;
    for (const structures of [[storage, rampart], [rampart, storage]]) {
        f.home.find = type => type === FIND_STRUCTURES ? structures : [];
        assert.equal(Planner.candidates(f.home, f.site).some(pos => pos.x === 31 && pos.y === 24), false);
    }
});

test('work_layered_road_never_hides_tower_in_any_order', async () => {
    const f = await createWorkFixture();
    const Planner = (await import('../core/WorkPositionPlanner.js')).default;
    const tower = { structureType: STRUCTURE_TOWER, pos: new RoomPosition(33, 24, 'W1N1') };
    const road = { structureType: STRUCTURE_ROAD, pos: tower.pos };
    for (const structures of [[tower, road], [road, tower]]) {
        f.home.find = type => type === FIND_STRUCTURES ? structures : [];
        assert.equal(Planner.candidates(f.home, f.site).some(pos => pos.x === 33 && pos.y === 24), false);
    }
});

for (const type of ['BUILD', 'REPAIR']) {
    test('work_' + type + '_movement_keeps_real_target_position', async () => {
        const f = await createWorkFixture(type);
        const originalPos = f.site.pos;
        f.ActionParser.run(f.worker);
        assert.equal(f.site.pos, originalPos);
        assert.deepEqual({ x: f.site.pos.x, y: f.site.pos.y }, { x: 32, y: 24 });
        assert.equal(f.worker.memory.task.targetId, f.site.id);
    });
}

test('work_stale_blocked_position_is_replanned_and_build_resumes', async () => {
    const f = await createWorkFixture();
    let builds = 0;
    f.worker.build = target => { assert.equal(target.id, 'WorkTarget'); builds++; return OK; };
    f.ActionParser.run(f.worker);
    const position = f.worker.memory.task.workPos;
    assert.notDeepEqual(position, { x: 31, y: 24, roomName: 'W1N1' });
    assert.equal(builds, 0);
    f.worker.pos = new RoomPosition(position.x, position.y, position.roomName);
    Game.time++;
    f.ActionParser.run(f.worker);
    assert.equal(builds, 1);
    assert.deepEqual({ x: f.site.pos.x, y: f.site.pos.y }, { x: 32, y: 24 });
});

test('work_two_workers_keep_independent_positions_and_target_identity', async () => {
    const f = await createWorkFixture();
    const Coordinator = (await import('../core/WorkPositionCoordinator.js')).default;
    const second = f.actor('WorkerB', 'builder', [WORK, CARRY, MOVE]);
    second.store.energy = 50; second.pos = new RoomPosition(34, 25, 'W1N1');
    second.memory.task = { type: 'BUILD', targetId: f.site.id };
    f.ActionParser.run(f.worker);
    const reservation = Coordinator.reserve(f.home, second, f.site);
    second.memory.task.workPos = reservation.workPos;
    f.ActionParser.run(second);
    assert.notDeepEqual(second.memory.task.workPos, f.worker.memory.task.workPos);
    assert.equal(f.site.pos.x, 32);
    assert.equal(f.site.pos.y, 24);
});
