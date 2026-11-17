const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRemoteFixture } = require('./helpers/remote-mining-fixture.cjs');

const home = 'W49N41';
const remote = 'W48N41';
const closedPermissions = {
    localPilot: false, remoteMining: false, reconDeparture: false, economicDeparture: false,
    nativeTrial: false, homeEvidence: false, trialEvidence: false, goalPlanning: false,
    market: false, schedulerEnforce: false, governorShadow: true
};
const current = () => Memory.empire.control.metrics.rooms[home];
const clone = value => JSON.parse(JSON.stringify(value));

async function scene() {
    const f = await createRemoteFixture({ roomNames: { base: home, target: remote }, policyEnabled: false });
    Game.shard = { name: 'shard3' };
    Memory.empire.remoteRooms[remote].enabled = false;
    Memory.empire.remoteRooms[remote].hold = true;
    for (const spawn of Object.values(f.spawns)) spawn.spawning = null;
    const { loop } = await import('../main.js');
    const { default: Metrics } = await import('../services/EmpireMetricsService.js');
    const { default: Phase } = await import('../services/RoomPhaseService.js');
    const { default: WarIntel } = await import('../services/WarIntelService.js');
    const { default: Telemetry } = await import('../core/RuntimeTelemetry.js');
    const metrics = new Metrics('EmpireMetrics');
    const hooks = { beforeMetrics() {}, afterMetrics() {} };
    const hook = (name, callback) => ({ name, init() {}, analyze() {}, run() {}, cleanup: callback });
    function reset() {
        f.resetRuntime();
        const [remoteMining, , spawn] = f.services;
        global.EmpireServicesVersion = '__SERVICE_VERSION__';
        global.EmpireServices = [
            new WarIntel('WarIntel'), new Phase('RoomPhase'), remoteMining, spawn,
            hook('BeforeMetrics', () => hooks.beforeMetrics()), metrics,
            hook('AfterMetrics', () => hooks.afterMetrics())
        ];
        delete global.EmpireTelemetry;
        delete global.RoomPhase;
        delete global.WarIntel;
        delete global.RemoteMining;
    }
    reset();
    return { f, loop, hooks, reset, Telemetry };
}

test('completed W49N41 metrics expose the MCP v1 snapshot with same-tick core recovery and real Spawn states', async () => {
    const { f, loop, hooks } = await scene();
    const replacement = f.actor('ReplacingHauler', 'hauler', [CARRY, MOVE]);
    replacement.spawning = true;
    f.spawns.Spawn1.spawning = { name: replacement.name, remainingTime: 7 };
    f.spawns.Spawn2.isActive = () => false;
    const operationsBefore = clone(Memory.empire.remoteRooms);
    hooks.afterMetrics = () => assert.equal(current().homePreflight, undefined);
    loop();

    const metric = current();
    assert.equal(metric.capturedAt, 100);
    assert.equal(metric.recovery.evaluatedAt, metric.capturedAt);
    assert.deepEqual(metric.recovery.coreUpcoming, { miner: 0, hauler: 1 });
    assert.equal(metric.spawningCount, 1);
    assert.deepEqual(metric.homePreflight, {
        schemaVersion: 1, capturedAt: metric.capturedAt, roomVisible: true, controllerOwned: true,
        controllerEmergencyTicks: 5000, hostiles: 0, localReceiptCount: 0,
        spawns: [
            { name: 'Spawn1', active: true, busy: true, remaining: 7 },
            { name: 'Spawn2', active: false, busy: false, remaining: null }
        ],
        permissions: closedPermissions
    });
    assert.deepEqual(Memory.empire.remoteRooms, operationsBefore);
    assert.equal(Memory.empire.control.metrics.rooms[remote], undefined);
    assert.equal(f.spawnCalls.length, 0);
});

test('observes current permissions and action-time Spawn occupancy without interpreting historical request flags as departure', async () => {
    const { f, loop, hooks } = await scene();
    const policy = Memory.empire.control.policy;
    policy.remoteMining.reconTrial = { enabled: true, request: { expiresAtTick: 90 } };
    policy.remoteMining.economicTrial = { enabled: true, request: { expiresAtTick: 92 } };
    const policyBefore = clone(policy);
    loop();
    assert.deepEqual(current().homePreflight.permissions, closedPermissions);
    assert.deepEqual(Memory.empire.control.policy, policyBefore);

    f.nextTick({ tick: 110 });
    hooks.beforeMetrics = () => {
        const scope = global.RemoteMining[home + ':' + remote];
        scope.state.allowRecon = true;
        scope.operation.allowEconomicDeparture = true;
        Memory.empire.market.enabled = true;
        Memory.empire.control.policy.spawnIntake.localReplacementPilotRoom = home;
        Memory.empire.spawningCreeps.PendingHauler = {
            schemaVersion: 2, acceptedAt: Game.time, spawnName: 'Spawn1', spawnRoom: home,
            memory: { role: 'hauler', homeRoom: home }, body: [CARRY, MOVE], expireAt: Game.time + 16
        };
        Memory.empire.localSpawnReceipts = { Local: { state: 'unknown' } };
    };
    loop();
    assert.deepEqual(current().homePreflight.permissions, {
        ...closedPermissions, localPilot: true, reconDeparture: true, economicDeparture: true, market: true
    });
    assert.deepEqual(current().homePreflight.spawns[0], {
        name: 'Spawn1', active: true, busy: true, remaining: null
    });
    assert.equal(current().homePreflight.localReceiptCount, 1);
    assert.equal(current().spawningCount, 0);
});

test('interruption after metrics and JSON reload keep the previous proof and its original tick', async () => {
    const { f, loop, hooks, reset, Telemetry } = await scene();
    loop();
    const previous = clone(current().homePreflight);
    f.nextTick({ tick: 110 });
    hooks.afterMetrics = () => { throw Error('later phase interrupted'); };
    assert.throws(loop, /later phase interrupted/);
    assert.equal(current().capturedAt, 110);
    assert.deepEqual(current().homePreflight, previous);
    Telemetry.finishTick();
    assert.deepEqual(current().homePreflight, previous);

    global.Memory = clone(Memory);
    for (const [name, creep] of Object.entries(Game.creeps)) creep.memory = Memory.creeps[name];
    reset();
    Telemetry.beginTick('__SERVICE_VERSION__');
    Telemetry.finishTick(); // no current collection after the reset
    assert.deepEqual(current().homePreflight, previous);

    hooks.afterMetrics = () => {};
    f.nextTick({ tick: 120 });
    loop();
    assert.equal(current().homePreflight.capturedAt, 120);
});

test('skipped phases and stale inner facts do not relabel previous or legacy records', async () => {
    const { f, loop, hooks, reset } = await scene();
    f.nextTick({ tick: 110 });
    const rooms = Memory.empire.control.metrics.rooms;
    rooms[home] = { capturedAt: 100, codeVersion: 'older-version', spawningCount: 0 };
    hooks.beforeMetrics = () => { global.RoomPhase[home].recovery.evaluatedAt = Game.time - 1; };
    loop();
    assert.equal(current().capturedAt, 110);
    assert.equal(current().recovery.evaluatedAt, 109);
    assert.equal(Object.hasOwn(current(), 'homePreflight'), false);

    hooks.beforeMetrics = () => {};
    f.nextTick({ tick: 120 });
    loop();
    const previous = clone(current().homePreflight);
    assert.equal(previous.capturedAt, 120);

    f.nextTick({ tick: 130 });
    reset();
    global.EmpireServices = global.EmpireServices.filter(service => service.name !== 'RemoteMining');
    loop();
    assert.deepEqual(current().homePreflight, previous);

    f.nextTick({ tick: 140 });
    reset();
    hooks.beforeMetrics = () => { f.operation.evaluatedAt = Game.time - 1; };
    loop();
    assert.deepEqual(current().homePreflight, previous);

    f.nextTick({ tick: 150 });
    hooks.beforeMetrics = () => { f.spawns.Spawn2.isActive = () => { throw Error('native fact unavailable'); }; };
    loop();
    assert.deepEqual(current().homePreflight, previous);
    assert.equal(current().capturedAt, 150);
});

test('room, version and normal interval bound where the last snapshot is persisted', async () => {
    const { f, loop } = await scene();
    f.nextTick({ tick: 101 });
    loop();
    assert.equal(current(), undefined);
    f.nextTick({ tick: 110 });
    Game.shard.name = 'shard2';
    loop();
    assert.equal(current().capturedAt, 110);
    assert.equal(Object.hasOwn(current(), 'homePreflight'), false);

    f.nextTick({ tick: 120 });
    Game.shard.name = 'shard3';
    loop();
    const previous = clone(current().homePreflight);
    f.nextTick({ tick: 130 });
    Memory.empire.control.policy.telemetry.enabled = false;
    loop();
    assert.deepEqual(current().homePreflight, previous);
});

test('same-tick reset and interruption cannot pair changed room metrics with an already committed proof', async () => {
    const { f, loop, hooks, reset } = await scene();
    loop();
    const previous = clone(current());

    global.Memory = clone(Memory);
    for (const [name, creep] of Object.entries(Game.creeps)) creep.memory = Memory.creeps[name];
    reset();
    f.home.energyAvailable = 49;
    hooks.afterMetrics = () => { throw Error('interrupted after same-tick reset'); };
    assert.throws(loop, /interrupted after same-tick reset/);
    assert.deepEqual(current(), previous);
});
