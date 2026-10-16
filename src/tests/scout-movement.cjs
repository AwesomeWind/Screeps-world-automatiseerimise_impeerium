const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createScoutMovementFixture } = require('./helpers/scout-movement-fixture.cjs');
const { createRemoteFixture } = require('./helpers/remote-mining-fixture.cjs');

test('scout_spawning_waits_for_actual_birth_position_and_does_not_duplicate_population', async () => {
    const { fixture, scout, moves, advance } = await createScoutMovementFixture();
    scout.spawning = true;
    fixture.runTick();
    advance();
    assert.equal(scout.memory.task || null, null);
    assert.equal(scout.memory.remoteLeg?.startedAt, undefined);
    assert.equal(moves.length, 0);
    assert.equal(fixture.spawnCalls.filter(call => call.memory.role === 'scout').length, 0);
    scout.spawning = false;
    advance({ positions: { ScoutA: { x: 9, y: 10, roomName: 'W1N1' } } });
    assert.equal(scout.memory.remoteLeg.startedAt, 102);
    assert.equal(moves[0].result, OK);
    assert.deepEqual(moves[0].from, { x: 9, y: 10, roomName: 'W1N1' });
    assert.equal(fixture.spawnCalls.filter(call => call.memory.remoteId).length, 0);
});

test('scout_path_loss_is_immediate_and_preserves_one_compact_native_result', async () => {
    const { fixture, scout, moves, setMoveResult } = await createScoutMovementFixture();
    setMoveResult(ERR_NOT_FOUND);
    fixture.runTick();
    assert.equal(scout.memory.lastTaskClear?.reason, 'move_path_lost');
    assert.equal(scout.memory.lastTaskClear.result, ERR_NOT_FOUND);
    assert.equal(scout.memory.task, null);
    assert.deepEqual(scout.memory.lastMoveAttempt.from, moves[0].from);
    assert.deepEqual(scout.memory.lastMoveAttempt.pathFirst, moves[0].first);
    assert.equal(scout.memory.lastMoveAttempt.result, ERR_NOT_FOUND);
    assert.equal(scout.memory.lastMoveAttempt.spawning, false);
    assert.equal(scout.memory.lastMoveAttempt.fatigue, 0);
    assert.equal(scout.memory.lastMoveAttempt.failure, 'path_lost');
    assert.equal(Object.hasOwn(scout.memory.lastMoveAttempt, 'path'), false);
});

test('scout_transient_obstacle_recovers_once_without_changing_original_deadline', async () => {
    const { fixture, scout, moves, advance, setBlocked } = await createScoutMovementFixture();
    setBlocked(true);
    fixture.runTick();
    const startedAt = scout.memory.remoteLeg.startedAt;
    const deadline = scout.memory.remoteLeg.expiresAt;
    for (let tick = 101; tick <= 106; tick++) advance({ tick });
    const before = moves.length;
    setBlocked(false);
    advance({ tick: 107 });
    assert.equal(moves.length, before + 1);
    assert.equal(scout.memory.remoteLeg.retryCount, 1);
    advance({ tick: 108 });
    assert.notDeepEqual({ x: scout.pos.x, y: scout.pos.y }, { x: 10, y: 11 });
    assert.equal(scout.memory.remoteLeg.startedAt, startedAt);
    assert.equal(scout.memory.remoteLeg.expiresAt, deadline);
    assert.equal(scout.memory.task.expiresAt, deadline);
    assert.equal(fixture.spawnCalls.filter(call => call.memory.remoteId).length, 0);
});

test('scout_repeated_path_loss_cools_down_and_exhausts_one_retry_across_runtime_reset', async () => {
    const { fixture, scout, moves, advance, setMoveResult } = await createScoutMovementFixture();
    setMoveResult(ERR_NOT_FOUND);
    fixture.runTick();
    const deadline = scout.memory.remoteLeg.expiresAt;
    advance({ tick: 101 });
    assert.equal(moves.length, 1);
    advance({ tick: 102 });
    assert.equal(moves.length, 2);
    assert.equal(scout.memory.remoteLeg.retryCount, 1);
    global.Memory = JSON.parse(JSON.stringify(Memory));
    fixture.memory = Memory;
    for (const creep of Object.values(Game.creeps)) creep.memory = Memory.creeps[creep.name];
    fixture.resetRuntime();
    for (let tick = 103; tick <= 120; tick++) advance({ tick });
    assert.equal(moves.length, 2);
    assert.equal(scout.memory.remoteLeg.retryCount, 1);
    assert.equal(scout.memory.remoteLeg.expiresAt, deadline);
    assert.equal(scout.memory.remoteLeg.blockedReason, 'retry_exhausted');
});

test('scout_permanent_obstacle_stops_after_one_retry_without_tick_by_tick_reissue', async () => {
    const { fixture, scout, moves, advance, setBlocked } = await createScoutMovementFixture();
    setBlocked(true);
    fixture.runTick();
    for (let tick = 101; tick <= 125; tick++) advance({ tick });
    assert.equal(scout.memory.remoteLeg.retryCount, 1);
    assert.equal(scout.memory.remoteLeg.blockedReason, 'retry_exhausted');
    assert.equal(scout.memory.task, null);
    assert.ok(moves.length <= 10);
});

test('scout_expired_leg_cannot_replan_or_move_even_with_retry_budget_left', async () => {
    const { fixture, scout, moves, advance, setMoveResult } = await createScoutMovementFixture();
    setMoveResult(ERR_NOT_FOUND);
    fixture.runTick();
    const startedAt = scout.memory.remoteLeg.startedAt;
    const deadline = scout.memory.remoteLeg.expiresAt;
    advance({ tick: deadline + 1 });
    assert.equal(moves.length, 1);
    assert.equal(scout.memory.remoteLeg.expiresAt, deadline);
    assert.equal(scout.memory.remoteLeg.startedAt, startedAt);
    assert.equal(scout.memory.remoteLeg.blockedReason, 'leg_expired');
});

test('scout_failed_replanning_consumes_retry_budget_and_does_not_research_every_tick', async () => {
    const { fixture, scout, moves, advance, setMoveResult } = await createScoutMovementFixture();
    scout.pos = new RoomPosition(11, 12, 'W1N1');
    setMoveResult(ERR_NOT_FOUND);
    fixture.runTick();
    const search = PathFinder.search;
    let actorSearches = 0;
    PathFinder.search = (origin, goal, options) => {
        if (origin.isEqualTo(scout.pos)) { actorSearches++; return { incomplete: true, path: [] }; }
        return search(origin, goal, options);
    };
    for (let tick = 101; tick <= 115; tick++) advance({ tick });
    assert.equal(actorSearches, 1);
    assert.equal(scout.memory.remoteLeg.retryCount, 1);
    assert.equal(scout.memory.remoteLeg.blockedReason, 'route_invalid');
    assert.equal(moves.length, 1);
});

for (const reason of ['hold', 'disabled', 'home_danger', 'home_recovery', 'remote_danger', 'foreign_control', 'epoch']) {
    test(`scout_retry_respects_current_${reason}_gate`, async () => {
        const { fixture, scout, moves, advance, setMoveResult } = await createScoutMovementFixture();
        setMoveResult(ERR_NOT_FOUND);
        fixture.runTick();
        if (reason === 'hold') Memory.empire.remoteRooms.W1N2.hold = true;
        if (reason === 'disabled') Memory.empire.control.policy.remoteMining.enabled = false;
        if (reason === 'home_danger') fixture.visibleHostiles.push({pos:new RoomPosition(11,11,'W1N1')});
        if (reason === 'home_recovery') global.RoomPhase.W1N1.recovery.mode = 'recovering';
        if (reason === 'remote_danger') {
            Game.rooms.W1N2 = fixture.remote;
            fixture.visibleHostiles.push({pos:new RoomPosition(25,1,'W1N2')});
        }
        if (reason === 'foreign_control') fixture.operation.lastKnownIntel = { observedAt:100, owner:'Other', sourceIds:[], hostile:false };
        if (reason === 'epoch') scout.memory.epoch++;
        for (let tick = 101; tick <= 108; tick++) advance({ tick });
        assert.equal(moves.length, 1);
        assert.equal(scout.memory.remoteLeg.retryCount || 0, 0);
        assert.equal(fixture.spawnCalls.filter(call => ['remoteMiner','remoteHauler','reserver'].includes(call.memory.role)).length, 0);
    });
}

test('scout_fatigue_does_not_consume_retry_but_original_deadline_still_expires', async () => {
    const { fixture, scout, moves, advance } = await createScoutMovementFixture();
    scout.fatigue = 10;
    fixture.runTick();
    const deadline = scout.memory.remoteLeg.expiresAt;
    for (let tick = 101; tick <= 108; tick++) advance({ tick });
    assert.equal(scout.memory.lastTaskClear, undefined);
    assert.equal(scout.memory.remoteLeg.retryCount || 0, 0);
    const before = moves.length;
    advance({ tick: deadline + 1 });
    assert.equal(moves.length, before);
    assert.equal(scout.memory.lastTaskClear.movementFailure, 'leg_expired');
});

test('scout_cross_room_path_progress_does_not_consume_retry_or_restart_deadline', async () => {
    const { fixture, scout, advance } = await createScoutMovementFixture();
    scout.pos = new RoomPosition(25, 48, 'W1N1');
    fixture.runTick();
    const deadline = scout.memory.remoteLeg.expiresAt;
    advance({ tick: 101 });
    assert.equal(scout.pos.y, 49);
    advance({ tick: 102, visibility: true });
    assert.equal(scout.pos.roomName, 'W1N2');
    advance({ tick: 103, visibility: true });
    assert.equal(scout.memory.task, null);
    assert.equal(scout.memory.remoteLeg.retryCount, 0);
    assert.equal(scout.memory.remoteLeg.expiresAt, deadline);
    assert.equal(scout.memory.lastTaskClear.reason, 'remote_leg_arrived');
    assert.equal(fixture.operation.allowEconomicDeparture, false);
});

test('scout_hold_still_allows_bounded_safe_return_with_native_position_getters', async () => {
    const { fixture, scout, moves, advance, setBlocked } = await createScoutMovementFixture();
    const position = fixture.homeSink.pos;
    fixture.homeSink.pos = Object.create(Object.getPrototypeOf(position), {
        x: {get:()=>position.x}, y: {get:()=>position.y}, roomName: {get:()=>position.roomName}
    });
    assert.deepEqual({ ...fixture.homeSink.pos }, {});
    Game.rooms.W1N2 = fixture.remote;
    scout.pos = new RoomPosition(20, 20, 'W1N2');
    scout.room = fixture.remote;
    Memory.empire.remoteRooms.W1N2.hold = true;
    setBlocked(true);
    fixture.runTick();
    assert.equal(scout.memory.task?.type, 'MOVE_TO');
    assert.deepEqual(scout.memory.task.pos, { x:10,y:10,roomName:'W1N1' });
    const deadline = scout.memory.remoteLeg.expiresAt;
    for (let tick = 101; tick <= 106; tick++) advance({ tick });
    const before = moves.length;
    setBlocked(false);
    advance({ tick: 107 });
    assert.equal(scout.memory.remoteLeg.state, 'returning');
    const retryTask = scout.memory.task;
    advance({ tick: 108 });
    assert.equal(scout.memory.task, retryTask, 'a safe return retry must not be cancelled and reissued');
    assert.ok(moves.length > before);
    assert.equal(scout.memory.remoteLeg.retryCount, 1);
    assert.equal(scout.memory.remoteLeg.expiresAt, deadline);
    assert.equal(scout.memory.task.pos.roomName, 'W1N1');
    assert.equal(fixture.operation.allowEconomicDeparture, false);
    assert.equal(fixture.operation.allowRecon, false);
});

test('scout_legacy_blocked_goal_gets_only_one_retry_without_reinitializing_leg', async () => {
    const { fixture, scout, moves, advance, setMoveResult } = await createScoutMovementFixture();
    setMoveResult(ERR_NOT_FOUND);
    fixture.runTick();
    const leg = scout.memory.remoteLeg;
    const deadline = leg.expiresAt;
    delete leg.retryCount;
    leg.blockedGoalKey = leg.goalKey;
    leg.blockedReason = 'stuck_or_expired';
    scout.memory.lastTaskClear = { tick:100,taskType:'MOVE_TO',reason:'move_stuck_or_expired' };
    advance({ tick:101 });
    assert.equal(moves.length, 1);
    advance({ tick:102 });
    assert.equal(moves.length, 2);
    for (let tick = 103; tick <= 110; tick++) advance({ tick });
    assert.equal(moves.length, 2);
    assert.equal(leg.retryCount, 1);
    assert.equal(leg.expiresAt, deadline);
});

test('scout_legacy_spawning_path_is_not_executed_or_granted_a_new_deadline', async () => {
    const { fixture, scout, moves, advance, setMoveResult } = await createScoutMovementFixture();
    setMoveResult(ERR_NOT_FOUND);
    fixture.runTick();
    const leg = scout.memory.remoteLeg;
    const originalStart = leg.startedAt, originalDeadline = leg.expiresAt;
    const task = { type:'MOVE_TO',pos:{x:25,y:1,roomName:'W1N2'},range:0,
        path:[{x:11,y:12,roomName:'W1N1'}],allowedRooms:['W1N1','W1N2'],
        expiresAt:originalDeadline,maxTicks:originalDeadline-Game.time,startedAt:100,
        lastPos:{x:10,y:11,roomName:'W1N1'},stuckTicks:4,ignoreFatigueForStuck:true };
    scout.memory.task = task;
    scout.spawning = true;
    const before = moves.length;
    advance({ tick: 101 });
    assert.equal(moves.length, before);
    assert.equal(task.stuckTicks, 4);
    scout.spawning = false;
    advance({ tick: 102 });
    for (let tick = 103; tick <= 105; tick++) advance({ tick });
    assert.equal(leg.startedAt, originalStart);
    assert.equal(leg.expiresAt, originalDeadline);
    assert.ok((leg.retryCount || 0) <= 1);
});

for (const counter of [-1, 2, '0', null, NaN]) {
    test(`scout_malformed_retry_counter_${String(counter)}_does_not_grant_another_attempt`, async () => {
        const { fixture, scout, moves, advance, setMoveResult } = await createScoutMovementFixture();
        setMoveResult(ERR_NOT_FOUND);
        fixture.runTick();
        const deadline = scout.memory.remoteLeg.expiresAt;
        scout.memory.remoteLeg.retryCount = counter;
        for (let tick = 101; tick <= 105; tick++) advance({ tick });
        assert.equal(moves.length, 1);
        assert.equal(scout.memory.remoteLeg.blockedReason, 'leg_state_invalid');
        assert.equal(scout.memory.remoteLeg.expiresAt, deadline);
    });
}

test('remote_move_to_native_container_reads_coordinates_instead_of_spreading_position', async () => {
    const fixture = await createRemoteFixture({ haulerAtHome: true });
    const pos = fixture.container.pos;
    fixture.container.pos = Object.create(Object.getPrototypeOf(pos), {
        x: {get:()=>pos.x}, y: {get:()=>pos.y}, roomName: {get:()=>pos.roomName}
    });
    fixture.runTick();
    assert.equal(fixture.hauler.memory.task?.type, 'MOVE_TO');
    assert.deepEqual(fixture.hauler.memory.task.pos, {x:20,y:20,roomName:'W1N2'});
});
