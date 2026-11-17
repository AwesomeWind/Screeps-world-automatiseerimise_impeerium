const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {installGlobals, store} = require('./helpers/remote-mining-fixture.cjs');

const roomName = 'W49N41';
const snapshotPath = path.join(__dirname, 'fixtures', 'w49n41-legacy-spawn-recovery-baseline.json');
const clone = value => JSON.parse(JSON.stringify(value));

async function replay() {
    installGlobals();
    const {default: EventBus} = await import('../core/EventBus.js');
    const {currentCreepPopulation} = await import('../core/CreepPopulation.js');
    const {collectRoomGovernorFacts} = await import('../governance/RoomGovernorFacts.js');
    const {default: RoomPhase} = await import('../services/RoomPhaseService.js');
    const {default: Bureau} = await import('../services/SpawnBureauService.js');
    const {default: Spawn} = await import('../services/SpawnService.js');
    const cases = [];

    function world({missing = [], busy = false, controllerTicks = 12000} = {}) {
        const calls = [];
        const room = {name:roomName, energyAvailable:550, energyCapacityAvailable:550,
            controller:{my:true,level:6,ticksToDowngrade:controllerTicks,pos:new RoomPosition(25,25,roomName)},
            storage:{id:'storage',store:store(10000,100000),pos:new RoomPosition(24,23,roomName)},
            find(type) {return type === FIND_STRUCTURES ? [spawn, this.storage] : [];}};
        const source = {id:'source',pos:new RoomPosition(10,10,roomName)};
        const spawn = {name:'Spawn1',room,structureType:STRUCTURE_SPAWN,pos:new RoomPosition(25,24,roomName),
            spawning:busy ? {name:'BusyWorker'} : null,
            spawnCreep(body, name) {
                calls.push({name,body:[...body],result:OK});
                return OK; // Engine visibility is advanced separately by each fixture.
            }};
        global.Game = {time:2000,rooms:{[roomName]:room},spawns:{Spawn1:spawn},creeps:{},
            map:{getRoomTerrain:()=>({get:()=>0})},getObjectById:id=>id==='source'?source:null};
        global.Memory = {creeps:{},rooms:{[roomName]:{}},empire:{}};
        global.RoomCache = {[roomName]:{sources:['source'],structures:{},constructionSites:[]}};
        global.RoomGovernor = {};
        global.SpawnDemands = {};
        delete global.RemoteMining;
        EventBus.topics = {};
        EventBus.clearSubscribers();
        function actor(name, role, body, details = {}) {
            const memory = {role,homeRoom:roomName,...(role==='miner'?{sourceId:source.id}:{})};
            Memory.creeps[name] = memory;
            Game.creeps[name] = {name,room,memory,body:body.map(type=>({type,hits:100})),
                ticksToLive:1000,store:store(0),...details};
        }
        if (!missing.includes('miner')) actor('Miner','miner',[WORK,WORK,WORK,WORK,WORK,MOVE]);
        if (!missing.includes('hauler')) for (let i=1;i<=3;i++) actor('Hauler'+i,'hauler',[CARRY,MOVE]);
        if (!missing.includes('upgrader')) for (let i=1;i<=2;i++) actor('Upgrader'+i,'upgrader',[WORK,CARRY,MOVE]);
        return {room,spawn,calls,actor,service:new Spawn('Spawn')};
    }

    function population() {
        return currentCreepPopulation().map(({name,memory,state,source,bodyKnown,coversQuota,activeParts})=>({
            name,role:memory.role??null,state,source,bodyKnown,coversQuota,activeParts
        })).sort((a,b)=>a.name.localeCompare(b.name));
    }
    function governor() {
        const facts = collectRoomGovernorFacts();
        assert.ok(facts.rooms[roomName], JSON.stringify(facts.errors));
        const {capabilities,retiringCapabilities,spawningCapabilities} = facts.rooms[roomName];
        return {stable:capabilities,retiring:retiringCapabilities,spawning:spawningCapabilities};
    }
    function runTick(label,w,inputs={}) {
        const offset=w.calls.length;
        const input={tick:Game.time,energy:w.room.energyAvailable,storage:w.room.storage.store.energy,
            controllerTicks:w.room.controller.ticksToDowngrade,busy:w.spawn.spawning?.name??null,
            population:population(),...inputs};
        EventBus.beginTick();
        w.service.init();
        new RoomPhase('RoomPhase').analyze();
        const recovery=clone(global.RoomPhase[roomName].recovery);
        const capabilities=clone(governor());
        new Bureau('SpawnBureau').analyze();
        const intents=global.SpawnBureau[roomName].intents.map(({role,priority,quotaKey,body,reason})=>({
            role,priority,quotaKey,body:[...body],reason
        }));
        EventBus.dispatch();
        const intake=clone(global.SpawnIntake[roomName]??null);
        const receiptsAtIntake=clone(Memory.empire.spawnRequestReceipts);
        w.service.run();
        w.service.cleanup();
        const output={recovery,capabilities,intents,intake,receiptsAtIntake,calls:w.calls.slice(offset),
            accepted:clone(Memory.empire.spawningCreeps),receipts:clone(Memory.empire.spawnRequestReceipts),
            population:population()};
        cases.push({label,input,output});
        return output;
    }

    runTick('healthy_core',world());
    runTick('missing_miner',world({missing:['miner']}));
    runTick('busy_spawn_missing_haulers',world({missing:['hauler'],busy:true}));
    runTick('controller_threshold_equal',world({missing:['miner','upgrader'],controllerTicks:5000}));
    runTick('controller_below_threshold',world({missing:['miner','upgrader'],controllerTicks:4999}));

    const w=world({missing:['miner']});
    const accepted=runTick('accepted_before_visibility',w);
    const [name]=Object.keys(accepted.accepted);
    assert.ok(name,'the baseline must exercise a real successful SpawnService call');
    const old = accepted.accepted[name];
    w.spawn.spawning={name};
    Game.time++;
    global.Memory=clone(Memory);
    EventBus.topics={};
    EventBus.clearSubscribers();
    w.service=new Spawn('Spawn');
    runTick('pending_spawn_after_reset',w,{reset:'Memory JSON round trip and rebuilt Spawn/EventBus'});
    Game.time++;
    w.spawn.spawning=null;
    w.actor(name,'miner',old.body);
    runTick('born_and_core_usable',w,{transition:'simulated engine exposes born creep'});

    const gap=world({missing:['miner']});
    const first=runTick('accepted_without_spawn_visibility',gap);
    const [ghost]=Object.keys(first.accepted);
    Game.time++;
    global.Memory=clone(Memory);
    EventBus.topics={};
    EventBus.clearSubscribers();
    gap.service=new Spawn('Spawn');
    runTick('accepted_backup_without_visibility_on_later_tick',gap,{
        reset:'Memory JSON round trip with no live creep or Spawn.spawning',originalAcceptedName:ghost
    });
    return {kind:'simulated_legacy_baseline',room:roomName,cases};
}

function verifyScenarios(snapshot) {
    const byLabel = Object.fromEntries(snapshot.cases.map(({label, input, output}) => [label, {input, ...output}]));
    const healthy = byLabel.healthy_core;
    assert.equal(healthy.recovery.mode, 'normal');
    assert.deepEqual(healthy.recovery.coreUsable, {miner:1, hauler:3});
    assert.equal(healthy.intents.length, 0);

    const missing = byLabel.missing_miner;
    assert.equal(missing.recovery.mode, 'miner_gap');
    assert.equal(missing.intents[0].priority, 120);
    assert.equal(missing.calls.length, 1);

    const busy = byLabel.busy_spawn_missing_haulers;
    assert.equal(busy.recovery.mode, 'hauler_gap');
    assert.equal(busy.intake.lastReason, 'no_idle_spawn');
    assert.equal(busy.calls.length, 0);

    assert.deepEqual(byLabel.controller_threshold_equal.intents.map(intent => intent.role), ['miner']);
    assert.deepEqual(byLabel.controller_below_threshold.intents.map(intent => intent.role), ['miner', 'upgrader']);
    assert.equal(byLabel.controller_below_threshold.calls.length, 1);

    const accepted = byLabel.accepted_before_visibility;
    const [name] = Object.keys(accepted.accepted);
    const {requestId} = accepted.accepted[name];
    assert.equal(accepted.intake.accepted, 1);
    assert.deepEqual(accepted.receiptsAtIntake, {});
    assert.equal(accepted.receipts[requestId].name, name);
    assert.equal(accepted.population.find(actor => actor.name === name).state, 'accepted');
    assert.equal(accepted.recovery.coreUsable.miner, 0);

    const spawning = byLabel.pending_spawn_after_reset;
    assert.equal(spawning.receipts[requestId].name, name);
    assert.equal(spawning.recovery.coreUpcoming.miner, 1);
    assert.equal(spawning.capabilities.spawning.harvestWork, 2);
    assert.equal(spawning.capabilities.stable.harvestWork, 0);
    assert.equal(spawning.calls.length, 0);

    const born = byLabel.born_and_core_usable;
    assert.equal(born.recovery.coreUsable.miner, 1);
    assert.equal(born.capabilities.stable.harvestWork, 2);
    assert.equal(born.accepted[name], undefined);

    const gap = byLabel.accepted_backup_without_visibility_on_later_tick;
    const ghost = gap.input.originalAcceptedName;
    assert.equal(gap.input.population.find(actor => actor.name === ghost).state, 'invalid');
    assert.equal(gap.recovery.coreUpcoming.miner, 0);
    assert.ok(gap.accepted[ghost]);
}

if (process.argv.includes('--capture')) {
    replay().then(snapshot => {
        verifyScenarios(snapshot);
        process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n');
    })
        .catch(error=>{console.error(error);process.exitCode=1;});
} else {
    test('W49N41 legacy recovery and Spawn sequence preserves the frozen baseline',async()=>{
        const snapshot = await replay();
        verifyScenarios(snapshot);
        assert.deepEqual(snapshot, JSON.parse(fs.readFileSync(snapshotPath, 'utf8')));
    });
}
