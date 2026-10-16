const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRemoteFixture } = require('./helpers/remote-mining-fixture.cjs');

test('quota_default_disabled',async()=>{
    const f=await createRemoteFixture({policyEnabled:false});
    f.runTick();
    assert.equal(f.spawnCalls.filter(call=>['remoteMiner','scout','reserver'].includes(call.memory.role)).length,0);
});

test('quota_upcoming_covers_source',async()=>{
    const f=await createRemoteFixture();
    f.spawns.Spawn1.spawning={name:'Upcoming'};
    Memory.creeps.Upcoming={role:'remoteMiner',homeRoom:'W1N1',targetRoom:'W1N2',remoteId:'W1N1:W1N2',epoch:1,sourceId:'remoteSourceA',quotaKey:'remoteMiner:W1N1:W1N2:remoteSourceA'};
    f.runTick();
    assert.equal(f.spawnCalls.filter(call=>call.memory.role==='remoteMiner'&&call.memory.sourceId==='remoteSourceA').length,0);
});

test('quota_only_selected_source',async()=>{
    const f=await createRemoteFixture();
    f.runTick();
    assert.equal(f.spawnCalls.filter(call=>call.memory.sourceId==='remoteSourceB').length,0);
});

test('quota_unknown_vision_single_scout',async()=>{
    const f=await createRemoteFixture();
    delete Game.rooms.W1N2;
    f.actor('ExistingScout','scout',[MOVE],'W1N1',{remoteId:'W1N1:W1N2',epoch:1,targetRoom:'W1N2',quotaKey:'scout:W1N1:W1N2'});
    f.runTick();
    assert.equal(f.spawnCalls.filter(call=>call.memory.role==='scout').length,0);
});

test('quota_ghost_damaged_unknown_body',async()=>{
    const f=await createRemoteFixture();
    Memory.creeps.Ghost={role:'remoteMiner',remoteId:'W1N1:W1N2',epoch:1,sourceId:'remoteSourceA',homeRoom:'W1N1'};
    const damaged=f.actor('Damaged','remoteMiner',[WORK,CARRY,MOVE],'W1N2',{remoteId:'W1N1:W1N2',epoch:1,sourceId:'remoteSourceA'});
    damaged.body[0].hits=0;
    f.runTick();
    assert.equal(global.RemoteMining['W1N1:W1N2'].population.covered.remoteMiner,0);
    assert.equal(global.SpawnDemands.W1N1.filter(d=>d.role==='remoteMiner').length,1);
});

test('quota_retiring_overlap_limit',async()=>{
    const f=await createRemoteFixture();
    for(const name of ['OldA','OldB']) {
        const actor=f.actor(name,'remoteMiner',[WORK,CARRY,MOVE],'W1N2',{remoteId:'W1N1:W1N2',epoch:1,sourceId:'remoteSourceA'});
        actor.ticksToLive=5;
    }
    f.runTick();
    assert.equal(global.SpawnDemands.W1N1.filter(d=>d.role==='remoteMiner').length,0);
});

test('quota_legacy_orphaned_actor',async()=>{
    const f=await createRemoteFixture();
    const legacy=f.actor('Legacy','remoteMiner',[WORK,CARRY,MOVE],'W1N2',{targetRoom:'W1N2',sourceId:'remoteSourceA'});
    delete legacy.memory.homeRoom;
    const orphan=f.actor('Orphan','remoteMiner',[WORK,CARRY,MOVE],'W1N1',{targetRoom:'W9N9',sourceId:'missing'});
    f.runTick();
    assert.equal(legacy.memory.homeRoom,'W1N1');
    assert.equal(legacy.memory.remoteId,'W1N1:W1N2');
    assert.equal(orphan.memory.remoteStatus,'orphaned_actor');
    assert.equal(orphan.memory.remoteId,undefined);
});

test('quota_budget_pause_removes_owner_demand_without_raw_spawn',async()=>{
    const f=await createRemoteFixture();
    f.memory.empire.control.policy.remoteMining.spawnEnergyLimit=0;
    f.runTick();
    assert.equal(global.SpawnDemands.W1N1.filter(d=>d.owner==='remoteMining'&&d.role==='remoteMiner').length,0);
    assert.ok(f.operation.reasons.includes('spawn_budget'));
    assert.equal(f.spawnCalls.filter(call=>call.memory.remoteId).length,0);
});

test('budget_pending_counts_before_success',async()=>{
    const f=await createRemoteFixture({spawnBudget:1000});
    f.runTick();
    const calls=f.spawnCalls.filter(call=>call.memory.remoteId);
    assert.ok(calls.length>0,'an affordable healthy pilot must actually reach SpawnService');
    assert.ok(calls.reduce((sum,call)=>sum+call.cost,0)<=1000);
    assert.equal(f.ledger.spawnEnergyConfirmed,calls.reduce((sum,call)=>sum+call.cost,0));
});

test('budget_replay_reset_no_second_charge',async()=>{
    const f=await createRemoteFixture();
    f.runTick();
    assert.ok(f.ledger.spawnEnergyConfirmed>0);
    const charged=f.ledger.spawnEnergyConfirmed;
    f.resetRuntime(); f.runTick();
    assert.equal(f.ledger.spawnEnergyConfirmed,charged);
});

test('budget_old_epoch_retry_cancelled',async()=>{
    const f=await createRemoteFixture();
    f.results.spawn=ERR_BUSY;
    f.runTick();
    assert.ok(f.spawnCalls.some(call=>call.memory.remoteId));
    Memory.empire.remoteRooms.W1N2.enabled=false;
    f.results.spawn=OK;
    f.nextTick(); f.runTick();
    assert.equal(f.spawnCalls.filter(call=>call.result===OK&&call.memory.remoteId).length,0);
    assert.equal(f.ledger.spawnEnergyConfirmed||0,0);
});

test('budget_rolling_boundary',async()=>{
    const f=await createRemoteFixture();
    const L=await import('../services/RemoteMiningLedger.js');
    const budget={}; const ledger={};
    const policy=Memory.empire.control.policy.remoteMining;
    const operation={epoch:1,status:'active'};
    const request={requestId:'a',remoteId:'W1N1:W1N2',epoch:1,role:'remoteMiner',quotaKey:'mine',maxEnergy:800,deadline:1000};
    assert.equal(L.reserveSpawnGrant(budget,request,999,policy).granted,true);
    L.recordSpawnResult(budget,ledger,{...request,name:'a',result:OK,body:Array(8).fill(WORK),acceptedAt:999},999);
    const b={...request,requestId:'b',maxEnergy:1300,deadline:1006};
    assert.equal(L.reserveSpawnGrant(budget,b,1000,policy).granted,false);
    assert.equal(L.reserveSpawnGrant(budget,{...b,deadline:2100},2050,policy).granted,true);
    assert.equal(L.validateSpawnGrant(budget,{...b,epoch:2},{...operation,epoch:1},2050).allowed,false);
});

test('budget_zero_nan_fractional_limits',async()=>{
    for(const limit of [0,NaN,0.5]) {
        const f=await createRemoteFixture({spawnBudget:limit});
        f.runTick();
        assert.equal(f.spawnCalls.filter(call=>call.memory.remoteId).length,0);
    }
});

test('budget_full_receipt_capacity',async()=>{
    const f=await createRemoteFixture();
    const L=await import('../services/RemoteMiningLedger.js');
    const budget={grants:{},receipts:{}};
    for(let i=0;i<16;i++)budget.receipts[`paid${i}`]={tick:100,cost:50};
    assert.equal(L.reserveSpawnGrant(budget,{requestId:'x',remoteId:'x',epoch:1,maxEnergy:50,deadline:105},100,Memory.empire.control.policy.remoteMining).granted,false);
});

test('budget_unknown_execution_keeps_upper_bound',async()=>{
    const f=await createRemoteFixture({spawnBudget:800});
    const L=await import('../services/RemoteMiningLedger.js');
    const budget={}; const request={requestId:'a',remoteId:'x',epoch:1,maxEnergy:800,deadline:101};
    L.reserveSpawnGrant(budget,request,100,Memory.empire.control.policy.remoteMining);
    budget.grants.a.executing=true;
    assert.equal(L.reserveSpawnGrant(budget,{...request,requestId:'b',deadline:200},102,Memory.empire.control.policy.remoteMining).granted,false);
});

test('budget_intake_rejects_wrong_role_or_quota',async()=>{
    const f=await createRemoteFixture();
    for(const service of f.services)service.init();
    f.services[0].analyze();
    const demand=global.SpawnDemands.W1N1.find(d=>d.role==='remoteMiner');
    f.services[2].handleSpawnRequest({id:'bad',expireAt:demand.deadline,priority:45,data:{
        roomName:'W1N1',role:'reserver',requestId:demand.requestId,grantId:demand.grantId,body:[CLAIM,MOVE],
        memory:{...demand.memory,role:'reserver',quotaKey:'different'}
    }});
    f.services[2].run();
    assert.equal(f.spawnCalls.length,0);
});

test('route_fatigue_not_stuck',async()=>{
    const f=await createRemoteFixture();
    const actor=f.actor('Traveller','remoteHauler',[CARRY,MOVE],'W1N1',{remoteId:'W1N1:W1N2',epoch:1});
    actor.fatigue=10;
    actor.memory.task={type:'MOVE_TO',pos:{x:20,y:20,roomName:'W1N2'},maxTicks:140,ignoreFatigueForStuck:true,expiresAt:240};
    for(let i=0;i<6;i++){f.ActionParser.run(actor);f.nextTick();}
    assert.ok(actor.memory.task,'fatigue waiting must not be classified as a stalled leg');
    assert.equal(actor.memory.task.expiresAt,240);
});

test('route_path_malformed_third_room',async()=>{
    const f=await createRemoteFixture();
    const actor=f.actor('Traveller','remoteHauler',[CARRY,MOVE]);
    actor.memory.task={type:'MOVE_TO',pos:{x:20,y:20,roomName:'W1N2'},path:[{x:20,y:21,roomName:'W9N9'}],allowedRooms:['W1N1','W1N2'],maxTicks:140};
    f.ActionParser.run(actor);
    assert.equal(f.moves.length,0);
    assert.equal(actor.memory.lastTaskClear.reason,'move_invalid_path');
});

test('route_estimate_loaded_plain_and_swamp',async()=>{
    await createRemoteFixture();
    const R=await import('../services/RemoteMiningRoute.js');
    const body=[{type:CARRY,hits:100},{type:MOVE,hits:100}];
    assert.equal(R.estimateLegTicks(body,[{terrain:'plain'},{terrain:'swamp'}],{energy:50}).ticks,6);
    assert.equal(R.estimateLegTicks(body,[{terrain:'plain'},{terrain:'swamp'}],{energy:0}).ticks,2);
    assert.equal(R.estimateLegTicks([{type:CARRY,hits:100},{type:MOVE,hits:0}],[{terrain:'plain'}],{energy:50}).known,false);
});

test('route_over_50_ticks_does_not_restart_leg',async()=>{
    const f=await createRemoteFixture();
    const actor=f.actor('Traveller','remoteHauler',[CARRY,MOVE]);
    const R=await import('../services/RemoteMiningRoute.js');
    const route={valid:true,path:[{x:20,y:21,roomName:'W1N1'}],allowedRooms:['W1N1','W1N2'],estimatedLegTicks:60};
    const state={};
    const first=R.createRemoteMoveTask(state,route,{x:20,y:20,roomName:'W1N2'},100);
    assert.equal(first.expiresAt,240);
    const second=R.createRemoteMoveTask(state,route,{x:20,y:20,roomName:'W1N2'},160);
    assert.equal(second.expiresAt,240);
    assert.equal(R.createRemoteMoveTask(state,route,{x:20,y:20,roomName:'W1N2'},241),null);
    actor.memory.task=second;
    for(let i=0;i<55;i++){actor.pos.x=i%2?20:21;f.ActionParser.run(actor);f.nextTick();}
    assert.ok(actor.memory.task);
});

test('route_invisible_goal_uses_position',async()=>{
    const f=await createRemoteFixture();
    delete Game.rooms.W1N2;
    const actor=f.actor('Traveller','remoteHauler',[CARRY,MOVE]);
    actor.memory.task={type:'MOVE_TO',pos:{x:20,y:20,roomName:'W1N2'},maxTicks:140};
    f.ActionParser.run(actor);
    assert.equal(f.moves.length,1);
    assert.ok(actor.memory.task);
});

test('route_ordinary_move_defaults_unchanged',async()=>{
    const f=await createRemoteFixture();
    const actor=f.actor('Ordinary','hauler',[CARRY,MOVE]);
    actor.memory.task={type:'MOVE_TO',pos:{x:20,y:20,roomName:'W1N2'}};
    for(let i=0;i<6;i++){f.ActionParser.run(actor);f.nextTick();}
    assert.equal(actor.memory.lastTaskClear.reason,'move_stuck_or_expired');
});

test('route_hostile_exit_home_also_dangerous',async()=>{
    const f=await createRemoteFixture();
    const R=await import('../services/RemoteMiningRoute.js');
    const route=R.planRemoteRoute(new RoomPosition(20,20,'W1N1'),new RoomPosition(20,20,'W1N2'),{
        baseRoom:'W1N1',targetRoom:'W1N2',body:[CARRY,MOVE],loadState:{energy:50},
        dangerZones:[{x:20,y:49,roomName:'W1N1',range:1},{x:20,y:0,roomName:'W1N2',range:1}]
    },Memory.empire.control.policy.remoteMining,100);
    assert.equal(route.valid,false);
    assert.equal(f.pathOptions.roomCallback('W9N9'),false);
});

test('route_source_changed_replan_no_old_goal',async()=>{
    await createRemoteFixture();
    const R=await import('../services/RemoteMiningRoute.js');
    const state={}; const route={valid:true,path:[{x:20,y:21,roomName:'W1N1'}],allowedRooms:['W1N1','W1N2'],estimatedLegTicks:20};
    R.createRemoteMoveTask(state,route,{x:20,y:20,roomName:'W1N2'},100);
    const task=R.createRemoteMoveTask(state,route,{x:10,y:10,roomName:'W1N1'},110);
    assert.deepEqual(task.pos,{x:10,y:10,roomName:'W1N1'});
    assert.equal(task.expiresAt,170);
});

test('source_one_container_next_tick_confirmation',async()=>{
    const f=await createRemoteFixture({allowContainerBuild:true,containerBuilt:false,minerAtRemote:true});
    f.runTick();
    assert.equal(f.createdSites.length,1);
    assert.equal(f.operation.containerReady,false);
    f.nextTick({siteVisible:true});f.runTick();
    assert.equal(f.createdSites.length,1);
    assert.equal(f.miner.memory.lastTaskClear.taskType,'HARVEST');
});

test('source_bootstrap_harvest_build_then_transfer',async()=>{
    const f=await createRemoteFixture({allowContainerBuild:true,containerBuilt:false,minerAtRemote:true});
    f.runTick();f.nextTick({siteVisible:true,storeEnergy:{RemoteMinerA:20}});f.runTick();
    assert.equal(f.miner.memory.task.type,'BUILD');
    assert.equal(f.ledger.infrastructureEnergyConfirmed||0,0);
    f.nextTick({siteProgress:10,storeEnergy:{RemoteMinerA:10}});f.runTick();
    assert.equal(f.ledger.infrastructureEnergyConfirmed,10);
    assert.equal(f.ledger.returnedEnergyConfirmed||0,0);
});

test('source_repair_threshold_budget',async()=>{
    const f=await createRemoteFixture({minerAtRemote:true,minerEnergy:20});
    f.container.hits=90000;
    f.runTick();
    assert.equal(f.miner.memory.task.type,'REPAIR');
    assert.equal(f.miner.memory.task.targetHits,200000);
    f.nextTick({containerHits:90200,storeEnergy:{RemoteMinerA:18}});f.runTick();
    assert.equal(f.ledger.infrastructureEnergyConfirmed,2);
});

test('source_move_ok_not_build_ok',async()=>{
    const f=await createRemoteFixture({allowContainerBuild:true,containerBuilt:false,minerAtRemote:true,minerEnergy:20});
    f.nextTick({siteVisible:true});
    f.actionResult('RemoteMinerA','build',ERR_NOT_IN_RANGE);
    f.runTick();f.nextTick();f.runTick();
    assert.equal(f.miner.memory.lastActionObservation.result,ERR_NOT_IN_RANGE);
    assert.equal(f.ledger.infrastructureEnergyConfirmed||0,0);
    assert.equal(f.ledger.infrastructureEnergyUnknownUpperBound||0,0);
});

test('source_container_full_missing_wrong_room',async()=>{
    const f=await createRemoteFixture({minerAtRemote:true,minerEnergy:0});
    f.container.store.energy=2000;
    f.runTick();
    assert.equal(f.miner.memory.task||null,null);
});

test('source_failed_site_create_no_second_site',async()=>{
    const f=await createRemoteFixture({allowContainerBuild:true,containerBuilt:false});
    f.results.site=ERR_INVALID_TARGET;
    f.runTick();
    assert.ok(f.operation.reasons.includes('container_site_failed'));
    assert.equal(f.operation.containerReady,false);
});

test('source_concurrent_changes_unknown',async()=>{
    const f=await createRemoteFixture({minerAtRemote:true,minerEnergy:20});
    f.container.hits=90000;f.runTick();
    f.nextTick({containerHits:91000,storeEnergy:{RemoteMinerA:18}});f.runTick();
    assert.equal(f.ledger.infrastructureEnergyConfirmed||0,0);
    assert.equal(f.ledger.infrastructureEnergyUnknownUpperBound,2);
});

test('source_malformed_observation_no_throw',async()=>{
    const f=await createRemoteFixture({minerAtRemote:true,minerEnergy:20});
    f.miner.memory.lastActionObservation={context:{remoteId:'W1N1:W1N2',epoch:1},before:null};
    assert.doesNotThrow(()=>f.runTick());
    assert.equal(f.ledger.infrastructureEnergyConfirmed||0,0);
});

test('source_no_second_source_no_local_builder_takeover',async()=>{
    const f=await createRemoteFixture({minerAtRemote:true,minerEnergy:20});
    const builder=f.actor('LocalBuilder','builder',[WORK,CARRY,MOVE]);
    f.runTick();
    assert.equal(builder.memory.task,undefined);
    assert.equal(f.miner.memory.lastTaskClear.targetId,'RemoteContainer');
    assert.equal(f.ledger.returnedEnergyConfirmed||0,0);
});

test('source_dead_worker_pending_cost_remains_bounded',async()=>{
    const f=await createRemoteFixture({minerAtRemote:true,minerEnergy:20});
    f.container.hits=90000;f.runTick();
    delete Game.creeps.RemoteMinerA;
    f.nextTick();f.runTick();
    assert.equal(f.ledger.infrastructureEnergyUnknownUpperBound,2);
    const budget=Memory.empire.remoteMining.budgets.W1N1.infrastructure;
    assert.equal(Object.keys(budget.pending).length,0);
});

test('source_body_plain_mobility_with_budget',async()=>{
    const f=await createRemoteFixture();
    const Body=(await import('../core/BodyBuilder.js')).default;
    const body=Body.build('remoteMiner',f.home,{bodyProfile:'remote_balanced_miner',energyCapacity:800});
    assert.equal(body.capacity.workParts,4);
    assert.equal(body.capacity.moveParts,5);
    assert.ok(body.body.reduce((sum,part)=>sum+BODYPART_COST[part],0)<=800);
});

test('source_wrong_container_room_never_worked',async()=>{
    const f=await createRemoteFixture({minerAtRemote:true,minerEnergy:20});
    f.container.pos=new RoomPosition(20,20,'W1N1');
    f.runTick();
    assert.equal(f.operation.containerReady,false);
    assert.equal(f.miner.memory.task?.type, 'MOVE_TO');
    assert.equal(f.miner.memory.remoteLeg.state, 'returning');
});

test('settlement_ok_same_tick_zero_next_tick_actual',async()=>{
    const f=await createRemoteFixture({manualSettlement:true,haulerAtHome:true,carriedEnergy:100});
    f.runTick();
    const task=f.market.createRemoteHomeDeliveryTask(f.hauler,{remoteId:'W1N1:W1N2',epoch:1,tripId:'HaulerA:1:1',targetId:'HomeSink',amount:100});
    assert.ok(task);
    (await import('../core/TaskMetadata.js')).assignTask(f.hauler,task);
    f.ActionParser.run(f.hauler);f.market.cleanup();
    assert.equal(f.ledger.returnedEnergyConfirmed||0,0);
    f.nextTick({storeEnergy:{HaulerA:0,HomeSink:20100}});f.runTick();
    assert.equal(f.ledger.returnedEnergyConfirmed,100);
    f.runTick();
    assert.equal(f.ledger.returnedEnergyConfirmed,100);
});

test('settlement_two_owners_cancel_one',async()=>{
    const f=await createRemoteFixture({manualSettlement:true,haulerAtHome:true,carriedEnergy:50});f.runTick();
    const other=f.actor('HaulerB','remoteHauler',[CARRY,MOVE],'W1N1',{...f.hauler.memory});
    other.pos=new RoomPosition(10,11,'W1N1');other.store.energy=50;
    const M=await import('../core/TaskMetadata.js');
    for(const actor of [f.hauler,other])M.assignTask(actor,f.market.createRemoteHomeDeliveryTask(actor,{remoteId:'W1N1:W1N2',epoch:1,tripId:`${actor.name}:1:1`,targetId:'HomeSink',amount:50}));
    M.clearTaskState(f.hauler,'cancelled');f.market.cleanup();
    const records=Object.values(global.ResourceMarket.W1N1.reservations.demand);
    assert.equal(records.reduce((sum,record)=>sum+record.amount,0),50);
    assert.ok(other.memory.taskMeta.logisticsReservation);
});

test('settlement_source_deposit_not_home_income',async()=>{
    const f=await createRemoteFixture({manualSettlement:true,minerAtRemote:true,minerEnergy:50});f.runTick();
    const L=await import('../services/RemoteMiningLedger.js');
    const result=L.recordRemoteResolution(f.ledger,{reservationId:'100:1:RemoteMinerA',assignedAt:100,sequence:1,creepName:'RemoteMinerA',ownerRole:'remoteMiner',context:{remoteId:'W1N1:W1N2',epoch:1,tripId:'mining',leg:'source_deposit'},status:'confirmed',confirmedAmount:50,resourceType:'energy',targetRoom:'W1N2',targetId:'RemoteContainer'},1,['HomeSink']);
    assert.equal(result.applied,false);
    assert.equal(f.ledger.returnedEnergyConfirmed||0,0);
});

test('settlement_late_epoch_ignored',async()=>{
    const f=await createRemoteFixture({manualSettlement:true,haulerAtHome:true,carriedEnergy:50});f.runTick();
    const L=await import('../services/RemoteMiningLedger.js');
    assert.equal(L.recordRemoteResolution(f.ledger,{reservationId:'100:1:HaulerA',creepName:'HaulerA',ownerRole:'remoteHauler',context:{epoch:0,tripId:'old',leg:'home_delivery'},status:'confirmed',confirmedAmount:50,resourceType:'energy',targetRoom:'W1N1',targetId:'HomeSink'},1,['HomeSink']).applied,false);
    assert.equal(f.ledger.returnedEnergyConfirmed||0,0);
});

test('settlement_partial_concurrent_unknown',async()=>{
    const f=await createRemoteFixture({manualSettlement:true,haulerAtHome:true,carriedEnergy:100});f.runTick();
    const M=await import('../core/TaskMetadata.js');
    const task=f.market.createRemoteHomeDeliveryTask(f.hauler,{remoteId:'W1N1:W1N2',epoch:1,tripId:'HaulerA:1:1',targetId:'HomeSink',amount:60});
    assert.equal(task.amount,60);M.assignTask(f.hauler,task);f.ActionParser.run(f.hauler);f.market.cleanup();
    f.nextTick({storeEnergy:{HaulerA:40,HomeSink:20030}});f.runTick();
    assert.equal(f.ledger.returnedEnergyConfirmed||0,0);
    assert.equal(f.ledger.confirmationUnknown,1);
});

test('settlement_target_missing_dead_reset',async()=>{
    const f=await createRemoteFixture({manualSettlement:true,haulerAtHome:true,carriedEnergy:100});f.runTick();
    const M=await import('../core/TaskMetadata.js');
    M.assignTask(f.hauler,f.market.createRemoteHomeDeliveryTask(f.hauler,{remoteId:'W1N1:W1N2',epoch:1,tripId:'HaulerA:1:1',targetId:'HomeSink',amount:100}));
    f.ActionParser.run(f.hauler);f.market.cleanup();f.resetRuntime();
    delete Game.creeps.HaulerA;f.nextTick({storeEnergy:{HomeSink:20100}});f.runTick();
    assert.equal(f.ledger.returnedEnergyConfirmed||0,0);
    assert.equal(Object.values(global.ResourceMarket.W1N1.reservations.demand).reduce((sum,record)=>sum+Object.keys(record.owners||{}).length,0),0);
});

test('settlement_owner_cap_200_receipt_cap_16',async()=>{
    const f=await createRemoteFixture({manualSettlement:true,haulerAtHome:true,carriedEnergy:100});f.runTick();
    const market=global.ResourceMarket.W1N1;
    market.reservations.demand.other={amount:200,expiresAt:105,owners:{}};
    for(let i=0;i<200;i++)market.reservations.demand.other.owners[i]={creepName:`holder${i}`,amount:1,expiresAt:105};
    assert.equal(f.market.createRemoteHomeDeliveryTask(f.hauler,{remoteId:'W1N1:W1N2',epoch:1,tripId:'HaulerA:1:1',targetId:'HomeSink',amount:100}),null);
    assert.equal(Object.keys(market.reservations.demand.other.owners).length,200);
});

test('settlement_legacy_null_record_compatible',async()=>{
    const f=await createRemoteFixture({manualSettlement:true,haulerAtHome:true,carriedEnergy:100});f.runTick();
    global.ResourceMarket.W1N1.reservations.demand.empty=null;
    assert.doesNotThrow(()=>f.market.createRemoteHomeDeliveryTask(f.hauler,{remoteId:'W1N1:W1N2',epoch:1,tripId:'HaulerA:1:1',targetId:'HomeSink',amount:100}));
});

test('haul_full_round_trip_true_home_receipt', async () => {
    const f = await createRemoteFixture({ haulerAtRemote: true, pendingEnergy: 100 });
    f.runTick();
    assert.equal(f.hauler.memory.lastTaskClear.taskType, 'WITHDRAW');
    f.nextTick({ storeEnergy: { HaulerA: 100, RemoteContainer: 0 } });
    f.runTick();
    assert.equal(f.hauler.memory.remoteLeg.state, 'to_home');
    const tripId = f.hauler.memory.remoteTrip.tripId;
    f.resetRuntime();
    f.nextTick({ positions: { HaulerA: { x: 10, y: 11, roomName: 'W1N1' } } });
    f.runTick();
    assert.equal(f.hauler.memory.remoteTrip.tripId, tripId);
    assert.equal(f.ledger.returnedEnergyConfirmed || 0, 0);
    f.nextTick({ storeEnergy: { HaulerA: 0, HomeSink: 20100 } });
    f.runTick();
    assert.equal(f.ledger.returnedEnergyConfirmed, 100);
});

test('haul_partial_load_after_10_ticks', async () => {
    const f = await createRemoteFixture({ haulerAtRemote: true, pendingEnergy: 80 });
    f.runTick();
    f.nextTick({ storeEnergy: { HaulerA: 80, RemoteContainer: 0 } });
    f.runTick();
    assert.equal(f.hauler.memory.remoteLeg.state, 'loading');
    f.nextTick({ tick: 110 });
    f.runTick();
    assert.equal(f.hauler.memory.remoteLeg.state, 'to_home');
});

test('haul_capacity_gap_cap_two', async () => {
    const f = await createRemoteFixture();
    const state = await import('../services/RemoteMiningState.js');
    const result = state.estimateRemoteHaulerNeed({
        sourceCapacity: 1500, regenTicks: 300, minerWork: 4, carryCapacity: 100,
        outboundTicks: 80, inboundTicks: 100, handlingTicks: 2, pendingEnergy: 500
    }, Memory.empire.control.policy.remoteMining);
    assert.equal(result.desiredCount, 2);
    assert.ok(result.gap > 0);
});

test('haul_retiring_never_depart_again', async () => {
    const f = await createRemoteFixture({ haulerAtHome: true });
    f.hauler.ticksToLive = 10;
    f.runTick();
    assert.equal(f.hauler.memory.remoteLeg.state, 'retiring');
    assert.equal(f.hauler.memory.task || null, null);
});

test('haul_home_sink_full_no_drop', async () => {
    const f = await createRemoteFixture({ haulerAtHome: true, carriedEnergy: 80 });
    f.homeSink.store.energy = 1000000;
    f.runTick();
    assert.equal(f.hauler.store.energy, 80);
    assert.equal(f.hauler.memory.remoteLeg.state, 'safe_wait');
    assert.equal(f.droppedResources.length, 0);
});

test('haul_duplicate_trip_reassignment', async () => {
    const f = await createRemoteFixture({ haulerAtRemote: true, pendingEnergy: 80 });
    f.runTick();
    const id = f.hauler.memory.remoteTrip.tripId;
    f.runTick();
    f.resetRuntime();
    f.nextTick({ storeEnergy: { HaulerA: 80, RemoteContainer: 0 } });
    f.runTick();
    assert.equal(f.hauler.memory.remoteTrip.tripId, id);
    assert.equal(f.hauler.memory.remoteTripSequence, 1);
});

test('haul_unseen_object_not_destroyed', async () => {
    const f = await createRemoteFixture({ haulerAtHome: true });
    f.runTick();
    f.nextTick({ visibility: false });
    f.runTick();
    assert.notEqual(f.operation.reasons.includes('source_missing'), true);
    assert.equal(f.hauler.memory.task || null, null);
});

test('haul_dead_carried_loss_unknown', async () => {
    const f = await createRemoteFixture({ haulerAtRemote: true, carriedEnergy: 80 });
    f.runTick();
    delete Game.creeps.HaulerA;
    f.nextTick();
    f.runTick();
    assert.equal(f.ledger.carriedLossUnknownUpperBound, 80);
    f.runTick();
    assert.equal(f.ledger.carriedLossUnknownUpperBound, 80);
});

test('haul_live_body_route_determines_second_quota', async () => {
    const f = await createRemoteFixture({ haulerAtRemote: true, minerAtRemote: true });
    f.runTick();
    const demand = global.SpawnDemands.W1N1.find(value => value.role === 'remoteHauler');
    assert.equal(demand.maxCount, 2);
    assert.ok(f.operation.transportCapacity.gap > 0);
    assert.ok(f.operation.route.outboundTicks > 0);
});

test('safety_hostile_visible_stop_outbound_release_only_own', async () => {
    const f = await createRemoteFixture({ haulerAtHome: true, minerAtRemote: true });
    f.runTick();
    f.bus.publish('WAR', 100, { marker: 'preserve' }, 10);
    f.visibleHostiles.push({ id: 'invader', pos: new RoomPosition(40, 40, 'W1N2'), owner: { username: 'Invader' } });
    f.nextTick();
    f.runTick();
    assert.equal(f.operation.status, 'suspended');
    assert.notEqual(f.hauler.memory.remoteLeg.state, 'to_remote');
    assert.equal(f.miner.memory.remoteLeg.state, 'returning');
    assert.equal(f.bus.topics.WAR[0].data.marker, 'preserve');
});

test('safety_home_recovery_emergency_blocks_remote', async () => {
    const f = await createRemoteFixture({ haulerAtRemote: true, carriedEnergy: 80 });
    global.RoomPhase.W1N1.recovery.mode = 'critical';
    f.home.controller.ticksToDowngrade = 100;
    f.runTick();
    assert.ok(f.operation.reasons.includes('home_recovery'));
    assert.ok(f.operation.reasons.includes('controller_emergency'));
    assert.equal(f.hauler.store.energy, 80);
    assert.equal(f.spawnCalls.length, 0);
});

test('safety_stale_intel_not_safe', async () => {
    const f = await createRemoteFixture({ haulerAtHome: true });
    f.runTick();
    f.nextTick({ tick: 201, visibility: false });
    f.runTick();
    assert.ok(f.operation.reasons.includes('stale_intel'));
    assert.equal(global.RemoteMining['W1N1:W1N2'].state.allowEconomicDeparture, false);
});

test('safety_hold_does_not_auto_clear', async () => {
    const f = await createRemoteFixture({ haulerAtHome: true });
    f.memory.empire.remoteRooms.W1N2.hold = true;
    f.runTick();
    f.nextTick({ tick: 500 });
    f.runTick();
    assert.ok(f.operation.reasons.includes('manual_hold'));
    assert.equal(f.hauler.memory.task || null, null);
});

test('safety_all_retreated_recon_can_restore_vision', async () => {
    const f = await createRemoteFixture({ haulerAtHome: true });
    f.visibleHostiles.push({ pos: new RoomPosition(40, 40, 'W1N2'), owner: { username: 'Invader' } });
    f.runTick();
    f.visibleHostiles.length = 0;
    f.nextTick({ tick: 301, visibility: false });
    f.runTick();
    assert.equal(global.RemoteMining['W1N1:W1N2'].state.allowRecon, true);
    assert.ok(global.SpawnDemands.W1N1.every(value => value.role === 'scout'));
    f.nextTick({ tick: 302, visibility: true }); f.runTick();
    assert.equal(f.operation.status, 'recovering');
    for (let tick = 303; tick <= 401; tick++) { f.nextTick({ tick }); f.runTick(); }
    assert.equal(f.operation.status, 'active');
});

test('safety_unsafe_exit_wait_no_blind_loop', async () => {
    const f = await createRemoteFixture({ haulerAtHome: true });
    f.visibleHostiles.push({ pos: new RoomPosition(25, 1, 'W1N2'), owner: { username: 'Invader' } });
    f.runTick();
    f.nextTick({ tick: 301, visibility: false });
    f.runTick();
    assert.equal(global.RemoteMining['W1N1:W1N2'].state.allowRecon, false);
    assert.equal(f.spawnCalls.length, 0);
});

test('safety_foreign_reservation', async () => {
    const f = await createRemoteFixture();
    f.remote.controller.reservation.username = 'other';
    f.runTick();
    assert.ok(f.operation.reasons.includes('foreign_control'));
    assert.equal(f.spawnCalls.length, 0);
});

test('safety_epoch_change_drains_old_actor', async () => {
    const f = await createRemoteFixture({ haulerAtHome: true, carriedEnergy: 80 });
    f.runTick();
    f.memory.empire.remoteRooms.W1N2.sourceId = 'remoteSourceB';
    f.nextTick(); f.runTick();
    assert.equal(f.operation.epoch, 1);
    assert.equal(f.operation.config.sourceId, 'remoteSourceA');
    assert.equal(global.RemoteMining['W1N1:W1N2'].facts.source.id, 'remoteSourceA');
    assert.ok(f.operation.pendingConfig);
    assert.equal(f.hauler.memory.remoteRetiring, true);
});

test('safety_legacy_actor_no_guess', async () => {
    const f = await createRemoteFixture();
    const actor = f.actor('orphan', 'remoteMiner', [WORK, CARRY, MOVE], 'W1N2', { targetRoom: 'W9N9' });
    actor.memory.task = { type: 'HARVEST', targetId: 'remoteSourceA' };
    f.runTick();
    assert.equal(actor.memory.remoteStatus, 'orphaned_actor');
    assert.equal(actor.memory.task || null, null);
    assert.equal(actor.memory.remoteId, undefined);
});

test('safety_removed_or_invalid_config_still_drains', async () => {
    for (const remove of [true, false]) {
        const f = await createRemoteFixture({ haulerAtRemote: true, carriedEnergy: 80 });
        f.runTick();
        if (remove) delete f.memory.empire.remoteRooms.W1N2;
        else f.memory.empire.remoteRooms.W1N2.homeDeliveryTargetIds = [];
        f.nextTick(); f.runTick();
        assert.equal(f.hauler.memory.remoteLeg.state, 'returning');
        assert.equal(f.hauler.memory.task.type, 'MOVE_TO');
        assert.equal(f.spawnCalls.filter(call => call.memory.role === 'remoteHauler').length, 0);
    }
});

test('safety_pending_config_reverted_does_not_stay_blocked', async () => {
    const f = await createRemoteFixture({ haulerAtHome: true });
    f.runTick();
    f.memory.empire.remoteRooms.W1N2.sourceId = 'remoteSourceB';
    f.nextTick(); f.runTick();
    f.memory.empire.remoteRooms.W1N2.sourceId = 'remoteSourceA';
    f.nextTick(); f.runTick();
    assert.equal(f.operation.pendingConfig, undefined);
    assert.equal(f.operation.config.sourceId, 'remoteSourceA');
});

test('settlement_receipt_capacity_refuses_new_owner_before_action', async () => {
    const f = await createRemoteFixture({ manualSettlement: true, haulerAtHome: true, carriedEnergy: 80 });
    f.runTick();
    f.ledger.settlementReceipts = {};
    for (let i = 0; i < 16; i++) {
        const name = `old${i}`;
        f.actor(name, 'remoteHauler', [CARRY, MOVE], 'W1N1', { remoteId: 'W1N1:W1N2', epoch: 1 });
        f.ledger.settlementReceipts[name] = { id: name, assignedAt: 100, sequence: i + 1 };
    }
    assert.equal(f.market.createRemoteHomeDeliveryTask(f.hauler, {
        remoteId: 'W1N1:W1N2', epoch: 1, tripId: 'HaulerA:1:1', targetId: 'HomeSink'
    }), null);
});

const observationLimits = { targetTicks: 10000, eventLimit: 20, maxFields: 32 };
const observationIdentity = { codeVersion: 'v1', scopeId: 'W1N1:W1N2', epoch: 1 };
function validSample(tick, identity = observationIdentity) {
    return { tick, identity, fields: {
        controllerProgress: 1000 + tick, controllerDowngrade: 150000,
        coreMinerGap: 0, coreHaulerGap: 0, homeReserve: 20000, sinkCapacity: 980000,
        reservationOwners: 0
    }, flags: { state_active: true, existingContainer: true, homeHealthy: true },
    counters: { returnedEnergyConfirmed: Math.floor(tick / 10) * 100, spawnEnergyConfirmed: 0, confirmationUnknown: 0 } };
}

test('window_finish_after_real_cpu', async () => {
    const f = await createRemoteFixture({ haulerAtHome: true, carriedEnergy: 80 });
    const Telemetry = (await import('../core/RuntimeTelemetry.js')).default;
    const Metrics = (await import('../services/EmpireMetricsService.js')).default;
    let cpu = 2;
    Game.cpu.getUsed = () => cpu;
    Telemetry.beginTick('v1');
    f.runTick();
    new Metrics('EmpireMetrics').cleanup();
    const before = Memory.empire.control.metrics.remoteObservation;
    assert.equal(before.current.observedTicks, 0);
    cpu = 9;
    Telemetry.finishTick();
    const saved = Memory.empire.control.metrics.remoteObservation;
    assert.equal(saved.current.observedTicks, 1);
    assert.equal(saved.current.cpu.mean, 7);
    Telemetry.finishTick();
    assert.equal(Memory.empire.control.metrics.remoteObservation.current.observedTicks, 1);
});

test('window_gap_freezes_not_merges', async () => {
    const W = await import('../core/MetricObservationWindow.js');
    let state = W.createObservationState();
    state = W.beginObservationTick(state, { tick: 1, ...observationIdentity }, observationLimits);
    state = W.prepareObservationSample(state, validSample(1));
    state = W.finishObservationTick(state, { tick: 1, codeVersion: 'v1', totalCpu: 5, bucket: 10000 }, observationLimits);
    const prior = structuredClone(state);
    state = W.beginObservationTick(state, { tick: 3, ...observationIdentity }, observationLimits);
    assert.equal(state.previous.status, 'incomplete');
    assert.equal(state.previous.observedTicks, 1);
    assert.equal(state.current.observedTicks, 0);
    assert.deepEqual(prior.current, { ...prior.current });
    assert.equal(prior.current.status, 'collecting');
});

test('window_missing_cpu_unknown', async () => {
    const W = await import('../core/MetricObservationWindow.js');
    let state = W.beginObservationTick(W.createObservationState(), { tick: 1, ...observationIdentity }, observationLimits);
    state = W.prepareObservationSample(state, validSample(1));
    state = W.finishObservationTick(state, { tick: 1, codeVersion: 'v1', totalCpu: null, bucket: 10000 }, observationLimits);
    assert.equal(state.current.status, 'incomplete');
    assert.equal(state.current.observedTicks, 0);
    assert.equal(state.current.cpu.mean, null);
});

test('window_10000_requires_review', async () => {
    const W = await import('../core/MetricObservationWindow.js');
    let state = W.createObservationState();
    for (let tick = 1; tick <= 10000; tick++) {
        state = W.beginObservationTick(state, { tick, ...observationIdentity }, observationLimits);
        state = W.prepareObservationSample(state, validSample(tick));
        state = W.finishObservationTick(state, { tick, codeVersion: 'v1', totalCpu: 5, bucket: 10000 }, observationLimits);
    }
    assert.equal(state.current.observedTicks, 10000);
    assert.equal(state.current.status, 'review_required');
    assert.equal(state.current.acceptancePassed, false);
    assert.equal(state.current.cpu.mean, 5);
});

test('window_reset_continues_memory', async () => {
    const f = await createRemoteFixture({ haulerAtHome: true });
    const Telemetry = (await import('../core/RuntimeTelemetry.js')).default;
    const Metrics = (await import('../services/EmpireMetricsService.js')).default;
    for (let tick = 100; tick <= 102; tick++) {
        if (tick > 100) { f.resetRuntime(); f.nextTick({ tick }); }
        Telemetry.beginTick('v1');
        f.runTick(); new Metrics('EmpireMetrics').cleanup(); Telemetry.finishTick();
    }
    assert.equal(Memory.empire.control.metrics.remoteObservation.current.observedTicks, 3);
    assert.equal(Memory.empire.control.metrics.remoteObservation.previous, null);
});

test('window_disabled_and_version_change', async () => {
    const f = await createRemoteFixture({ haulerAtHome: true });
    const Telemetry = (await import('../core/RuntimeTelemetry.js')).default;
    const Metrics = (await import('../services/EmpireMetricsService.js')).default;
    const sample = version => {
        Telemetry.beginTick(version); f.runTick(); new Metrics('EmpireMetrics').cleanup(); Telemetry.finishTick();
    };
    sample('v1');
    f.nextTick();
    sample('v2');
    let window = Memory.empire.control.metrics.remoteObservation;
    assert.equal(window.previous.identity.codeVersion, 'v1');
    assert.equal(window.previous.status, 'incomplete');
    assert.equal(window.current.observedTicks, 1);
    Memory.empire.control.policy.telemetry.enabled = false;
    f.nextTick(); sample('v2');
    window = Memory.empire.control.metrics.remoteObservation;
    assert.equal(window.current.incompleteReason, 'telemetry_disabled');
    Memory.empire.control.policy.telemetry.enabled = true;
    f.nextTick(); sample('v2');
    assert.equal(Memory.empire.control.metrics.remoteObservation.current.observedTicks, 1);
    assert.equal(Memory.empire.control.metrics.remoteObservation.previous.observedTicks, 1);
});

test('window_capacity_long_run_and_new_keys', async () => {
    const W = await import('../core/MetricObservationWindow.js');
    let state = W.createObservationState();
    for (let tick = 1; tick <= 20000; tick++) {
        const identity = { ...observationIdentity, epoch: tick <= 10000 ? 1 : 2 };
        state = W.beginObservationTick(state, { tick, ...identity }, observationLimits);
        state = W.prepareObservationSample(state, validSample(tick, identity));
        state = W.finishObservationTick(state, { tick, codeVersion: 'v1', totalCpu: 5, bucket: 10000 }, observationLimits);
    }
    assert.equal(state.current.observedTicks, 10000);
    assert.equal(state.previous.observedTicks, 10000);
    assert.ok(JSON.stringify(state).length < 12000);
    assert.ok(state.current.events.length <= 20);
    assert.equal(state.current.frame, undefined);
    state = W.beginObservationTick(state, { tick: 20001, ...observationIdentity, epoch: 3 }, observationLimits);
    const sample = validSample(20001, { ...observationIdentity, epoch: 3 });
    for (let i = 0; i < 33; i++) sample.fields[`extra${i}`] = i;
    state = W.prepareObservationSample(state, sample);
    assert.equal(state.current.incompleteReason, 'invalid_sample');
});

test('window_unfinished_frame_and_epoch_isolation', async () => {
    const W = await import('../core/MetricObservationWindow.js');
    let state = W.beginObservationTick(W.createObservationState(), { tick: 1, ...observationIdentity }, observationLimits);
    state = W.prepareObservationSample(state, validSample(1));
    state = W.beginObservationTick(state, { tick: 2, ...observationIdentity }, observationLimits);
    assert.equal(state.previous.incompleteReason, 'unfinished_tick');
    assert.equal(state.previous.observedTicks, 0);
    state = W.prepareObservationSample(state, validSample(1));
    assert.equal(state.current.status, 'incomplete');
});

test('integration_main_order_and_full_loop', async () => {
    const f = await createRemoteFixture({ minerAtRemote: true, haulerAtRemote: true, pendingEnergy: 100 });
    delete global.EmpireServices;
    delete global.EmpireServicesVersion;
    Game.creeps.CoreUpgrade.store.energy = 50;
    Game.creeps.CoreUpgrade.pos = new RoomPosition(15, 16, 'W1N1');
    const main = await import('../main.js');
    main.loop();
    const names = global.EmpireServices.map(service => service.name);
    assert.ok(names.indexOf('RemoteMining') < names.indexOf('SpawnBureau'));
    assert.ok(names.indexOf('ResourceMarket') < names.indexOf('RemoteMiningStrategy'));
    assert.ok(names.indexOf('RemoteMiningStrategy') < names.indexOf('EmpireMetrics'));
    assert.equal(f.hauler.memory.lastTaskClear.taskType, 'WITHDRAW');
    f.nextTick({ storeEnergy: { HaulerA: 100, RemoteContainer: 0 } });
    main.loop();
    assert.equal(f.hauler.memory.remoteLeg.state, 'to_home');
    assert.equal(f.hauler.memory.task.type, 'MOVE_TO');
    f.nextTick({ positions: { HaulerA: { x: 10, y: 11, roomName: 'W1N1' } } });
    main.loop();
    f.nextTick({ storeEnergy: { HaulerA: 0, HomeSink: 20100 } });
    main.loop();
    assert.equal(f.ledger.returnedEnergyConfirmed, 100);
    assert.equal(Memory.empire.control.metrics.remoteObservation.current.observedTicks, 4);
    assert.equal(Memory.empire.control.policy.scheduler.enforce, false);
    f.hauler.ticksToLive = 100;
    for (let tick = 104; tick <= 110; tick++) { f.nextTick({ tick }); main.loop(); }
    const replacement = f.spawnCalls.find(call => call.memory.role === 'remoteHauler');
    assert.ok(replacement);
    const newActor = f.actor(replacement.name, 'remoteHauler', replacement.body, 'W1N1', replacement.memory);
    newActor.pos = new RoomPosition(10, 11, 'W1N1');
    f.nextTick(); main.loop();
    assert.equal(f.operation.replacementObserved, true);
    assert.equal(f.hauler.memory.remoteLeg.state, 'retiring');
    f.memory.empire.remoteRooms.W1N2.hold = true;
    f.nextTick(); main.loop();
    assert.equal(newActor.memory.task || null, null);
    assert.ok(f.operation.reasons.includes('manual_hold'));
    f.memory.empire.remoteRooms.W1N2.hold = false;
    newActor.store.energy = 50;
    f.homeSink.store.energy = 1000000;
    f.nextTick(); main.loop();
    assert.equal(newActor.memory.remoteLeg.state, 'safe_wait');
    assert.equal(newActor.store.energy, 50);
    f.homeSink.store.energy = 20000;
    f.nextTick(); main.loop();
    delete global.EmpireServices; delete global.EmpireServicesVersion; delete global.EmpireTelemetry;
    f.nextTick({ storeEnergy: { [newActor.name]: 0, HomeSink: 20050 } });
    main.loop();
    assert.equal(f.ledger.returnedEnergyConfirmed, 150);
    f.visibleHostiles.push({ pos: new RoomPosition(40, 40, 'W1N2'), owner: { username: 'Invader' } });
    f.nextTick(); main.loop();
    assert.ok(f.operation.reasons.includes('danger'));
    assert.equal(newActor.memory.remoteLeg.state, 'safe_wait');
    assert.equal(Game.creeps.CoreHauler.memory.role, 'hauler');
    assert.ok(Game.creeps.CoreUpgrade.memory.task);
    assert.equal(Memory.empire.control.policy.scheduler.enforce, false);
});

test('window_pilot_disabled_retains_last_observed_segment', async () => {
    const f = await createRemoteFixture({ haulerAtHome: true });
    const T = (await import('../core/RuntimeTelemetry.js')).default;
    const M = (await import('../services/EmpireMetricsService.js')).default;
    const tick = () => { T.beginTick('v1'); f.runTick(); new M('EmpireMetrics').cleanup(); T.finishTick(); };
    tick();
    Memory.empire.control.policy.remoteMining.enabled = false;
    for (let n = 0; n < 5; n++) { f.nextTick(); tick(); }
    assert.equal(Memory.empire.control.metrics.remoteObservation.current.observedTicks, 1);
    assert.equal(Memory.empire.control.metrics.remoteObservation.current.incompleteReason, 'pilot_disabled');
});

test('safety_recovery_recon_is_actually_spawned', async () => {
    const f = await createRemoteFixture();
    f.visibleHostiles.push({ pos: new RoomPosition(40, 40, 'W1N2'), owner: { username: 'Invader' } });
    f.runTick();
    f.visibleHostiles.length = 0;
    f.nextTick({ tick: 301, visibility: false }); f.runTick();
    assert.equal(f.spawnCalls.filter(call => call.memory.role === 'scout').length, 1);
});

test('safety_budget_exhaustion_stops_actor_departure', async () => {
    const f = await createRemoteFixture({ haulerAtHome: true, spawnBudget: 0 });
    f.runTick();
    assert.ok(f.operation.reasons.includes('spawn_budget'));
    assert.equal(f.hauler.memory.task || null, null);
});

test('source_task_guard_rejects_unscoped_container_work', async () => {
    const f = await createRemoteFixture({ minerAtRemote: true, minerEnergy: 20 });
    f.runTick();
    const Guard = (await import('../core/TaskGuard.js')).default;
    assert.equal(Guard.validate(f.miner, { type: 'REPAIR', targetId: 'HomeSink' }).valid, false);
});

test('route_strategy_stuck_leg_retries_once_without_renewing_deadline', async () => {
    const f = await createRemoteFixture({ haulerAtHome: true });
    f.runTick();
    const deadline = f.hauler.memory.remoteLeg.expiresAt;
    for (let tick = 101; tick <= 115; tick++) { f.nextTick({ tick }); f.runTick(); }
    assert.equal(f.hauler.memory.remoteLeg.state, 'safe_wait');
    assert.equal(f.hauler.memory.task || null, null);
    assert.equal(f.hauler.memory.remoteLeg.retryCount, 1);
    assert.equal(f.hauler.memory.remoteLeg.blockedReason, 'retry_exhausted');
    assert.equal(f.hauler.memory.remoteLeg.expiresAt, deadline);
    assert.ok(f.moves.filter(move => move.name === f.hauler.name).length <= 10);
});

test('review_R1_return_leg_revalidates_new_danger', async () => {
    const f = await createRemoteFixture({ haulerAtRemote: true, carriedEnergy: 100 });
    f.runTick();
    const oldTask = f.hauler.memory.task;
    assert.equal(oldTask.type, 'MOVE_TO');
    const deadline = oldTask.expiresAt;
    const danger = oldTask.path.find(point => point.roomName === 'W1N2');
    f.visibleHostiles.push({ pos: new RoomPosition(danger.x, danger.y, danger.roomName), owner: { username: 'Invader' } });
    const moves = f.moves.length;
    f.nextTick(); f.runTick();
    assert.equal(f.operation.status, 'suspended');
    assert.equal(f.hauler.memory.remoteLeg.state, 'safe_wait');
    assert.equal(f.hauler.memory.task || null, null);
    assert.equal(f.moves.length, moves);
    assert.equal(f.hauler.memory.remoteLeg.expiresAt, deadline);
    assert.equal(f.hauler.store.energy, 100);
});

test('review_R2_natural_miner_handoff_and_bounded_wait', async () => {
    const f = await createRemoteFixture({ minerAtRemote: true, haulerAtRemote: true });
    f.miner.ticksToLive = 110;
    f.runTick();
    const replacement = f.spawnCalls.find(call => call.memory.role === 'remoteMiner');
    assert.ok(replacement);
    const incoming = f.actor(replacement.name, 'remoteMiner', replacement.body, 'W1N2', replacement.memory);
    incoming.pos = new RoomPosition(21, 20, 'W1N2');
    const movesBefore = f.moves.filter(move => move.name === incoming.name).length;
    for (let tick = 101; tick <= 106; tick++) { f.nextTick({ tick }); f.runTick(); }
    assert.equal(f.miner.memory.remoteRetiring, true);
    assert.equal(incoming.memory.remoteWorkPositionWait.occupant, 'RemoteMinerA');
    assert.equal(f.moves.filter(move => move.name === incoming.name).length, movesBefore);
    delete Game.creeps.RemoteMinerA;
    f.nextTick(); f.runTick();
    assert.equal(incoming.memory.task.type, 'MOVE_TO');
    assert.equal(incoming.memory.remoteLeg.blockedGoalKey, undefined);
    f.nextTick({ positions: { [incoming.name]: { x: 20, y: 20, roomName: 'W1N2' } } });
    f.runTick();
    assert.equal(incoming.memory.lastTaskClear.taskType, 'HARVEST');
});

test('review_R3_base_room_change_drains_old_scope', async () => {
    const f = await createRemoteFixture({ haulerAtRemote: true, carriedEnergy: 80, minerAtRemote: true });
    f.runTick();
    f.memory.empire.remoteRooms.W1N2.baseRoom = 'W2N1';
    f.nextTick(); f.runTick();
    assert.ok(f.operation.pendingConfig);
    assert.equal(f.operation.config.baseRoom, 'W1N1');
    assert.ok(global.RemoteMining['W1N1:W1N2']);
    assert.equal(global.RemoteMining['W2N1:W1N2'], undefined);
    assert.equal(f.hauler.memory.remoteStatus, undefined);
    assert.equal(f.hauler.memory.remoteLeg.state, 'returning');
    assert.equal(f.hauler.store.energy, 80);
    delete Game.creeps.HaulerA;
    delete Game.creeps.RemoteMinerA;
    f.nextTick(); f.runTick();
    f.nextTick(); f.runTick();
    const operations = Memory.empire.remoteMining.operations;
    assert.equal(Object.keys(operations).length, 1);
    assert.equal(operations['W2N1:W1N2'].epoch, 2);
    assert.equal(operations['W2N1:W1N2'].previousEpoch.remoteId, 'W1N1:W1N2');
    assert.ok(Memory.empire.remoteMining.budgets.W1N1);
});

test('review_R4_no_route_blocks_economic_spawn_and_departure', async () => {
    const f = await createRemoteFixture();
    PathFinder.search = () => ({ incomplete: true, path: [] });
    f.runTick();
    assert.equal(f.operation.status, 'suspended');
    assert.ok(f.operation.reasons.includes('unsupported_route'));
    assert.equal(f.spawnCalls.filter(call => ['remoteMiner', 'remoteHauler'].includes(call.memory.role)).length, 0);
    assert.equal(global.SpawnDemands.W1N1.filter(demand => demand.owner === 'remoteMining').length, 0);
});

test('review_R4_return_route_and_prospective_body_both_required', async () => {
    const f = await createRemoteFixture({ haulerAtHome: true });
    const search = PathFinder.search;
    PathFinder.search = (origin, goal, options) => origin.roomName === 'W1N2' && goal.pos.roomName === 'W1N1' ?
        { incomplete: true, path: [] } : search(origin, goal, options);
    f.runTick();
    assert.equal(f.operation.status, 'suspended');
    assert.equal(f.hauler.memory.task || null, null);
    assert.equal(f.spawnCalls.filter(call => call.memory.remoteId).length, 0);
});

test('review_R5_physical_sink_capacity_shared_in_both_orders', async () => {
    const Metadata = await import('../core/TaskMetadata.js');
    for (const remoteFirst of [false, true]) {
        const f = await createRemoteFixture({ manualSettlement: true, haulerAtHome: true, carriedEnergy: 100 });
        f.homeSink.store.energy = 999900;
        f.runTick();
        const local = f.actor('LocalCargo', 'hauler', [CARRY, CARRY, MOVE], 'W1N1');
        local.store.energy = 100; local.pos = new RoomPosition(10, 11, 'W1N1');
        const remoteTask = () => f.market.createRemoteHomeDeliveryTask(f.hauler, {
            remoteId: 'W1N1:W1N2', epoch: 1, tripId: 'HaulerA:1:1', targetId: 'HomeSink'
        });
        const localTask = () => f.market.createTransferTask(local, global.ResourceMarket.W1N1, [RESOURCE_ENERGY]);
        const first = remoteFirst ? remoteTask() : localTask();
        assert.ok(first);
        Metadata.assignTask(remoteFirst ? f.hauler : local, first);
        assert.equal(remoteFirst ? localTask() : remoteTask(), null);
    }
});

test('review_R5_partial_shared_sink_and_cancel_only_one_owner', async () => {
    const f = await createRemoteFixture({ manualSettlement: true, haulerAtHome: true, carriedEnergy: 50 });
    f.homeSink.store.energy = 999900;
    f.runTick();
    const local = f.actor('LocalCargo', 'hauler', [CARRY, CARRY, MOVE], 'W1N1');
    local.store.energy = 100; local.pos = new RoomPosition(10, 11, 'W1N1');
    const Metadata = await import('../core/TaskMetadata.js');
    Metadata.assignTask(f.hauler, f.market.createRemoteHomeDeliveryTask(f.hauler, {
        remoteId: 'W1N1:W1N2', epoch: 1, tripId: 'HaulerA:1:1', targetId: 'HomeSink'
    }));
    const task = f.market.createTransferTask(local, global.ResourceMarket.W1N1, [RESOURCE_ENERGY]);
    assert.equal(task.amount, 50);
    Metadata.assignTask(local, task);
    Metadata.clearTaskState(f.hauler, 'cancelled'); f.market.cleanup();
    const owners = Object.values(global.ResourceMarket.W1N1.reservations.demand)
        .flatMap(record => Object.values(record.owners || {}));
    assert.deepEqual(owners.map(owner => [owner.creepName, owner.amount]), [['LocalCargo', 50]]);
});

test('review_R6_interrupted_intake_reset_exposes_unknown_cost', async () => {
    const f = await createRemoteFixture();
    for (const service of f.services) service.init();
    f.bus.beginTick();
    for (const service of f.services) service.analyze();
    f.bus.dispatch();
    const held = Object.values(Memory.empire.remoteMining.budgets.W1N1.grants).reduce((sum, grant) => sum + grant.maxEnergy, 0);
    assert.equal(held, 1600);
    assert.equal(f.spawnCalls.length, 0);
    f.resetRuntime(); f.nextTick();
    const T = (await import('../core/RuntimeTelemetry.js')).default;
    const M = (await import('../services/EmpireMetricsService.js')).default;
    T.beginTick('v1'); f.runTick(); new M('EmpireMetrics').cleanup(); T.finishTick();
    assert.equal(f.ledger.spawnEnergyUnknownUpperBound, 1600);
    assert.equal(f.ledger.spawnCostUnknown, 2);
    assert.equal(f.ledger.spawnEnergyConfirmed || 0, 0);
    const window = Memory.empire.control.metrics.remoteObservation.current;
    assert.equal(window.fields.spawnEnergyUnknownUpperBound.end, 1600);
    assert.equal(window.coverage.spawnCostUnknown, true);
    f.runTick();
    assert.equal(f.ledger.spawnEnergyUnknownUpperBound, 1600);
    assert.equal(f.spawnCalls.length, 0);
});

test('review_R6_successful_spawn_backups_reconcile_once', async () => {
    const f = await createRemoteFixture();
    for (const service of f.services) service.init();
    f.bus.beginTick();
    for (const service of f.services) service.analyze();
    f.bus.dispatch();
    const budget = Memory.empire.remoteMining.budgets.W1N1;
    const held = structuredClone(budget.grants);
    for (const service of f.services) service.run();
    assert.equal(f.spawnCalls.length, 2);
    const expected = f.spawnCalls.reduce((sum, call) => sum + call.cost, 0);
    for (const [name, record] of Object.entries(Memory.empire.spawningCreeps)) {
        Game.spawns[record.spawnName].spawning = { name };
    }
    // Restore the unsettled budget snapshot while keeping real successful backups and engine spawn evidence.
    budget.grants = held; budget.buckets = []; budget.receipts = {};
    delete f.ledger.spawnEnergyConfirmed;
    f.resetRuntime(); f.nextTick(); f.runTick();
    assert.equal(f.ledger.spawnEnergyConfirmed, expected);
    assert.equal(f.ledger.spawnEnergyUnknownUpperBound || 0, 0);
    assert.equal(Object.keys(budget.grants).length, 0);
    f.runTick();
    assert.equal(f.ledger.spawnEnergyConfirmed, expected);
});

test('review_R6_late_proof_resolves_gauge_without_counter_reset', async () => {
    const f = await createRemoteFixture();
    for (const service of f.services) service.init();
    f.bus.beginTick();
    for (const service of f.services) service.analyze();
    f.bus.dispatch();
    const pending = f.services.find(service => service.name === 'Spawn').pendingTasks.map(task => ({
        name: task.name, spawnName: task.spawn.name, body: task.data.body,
        memory: task.data.memory, requestId: task.requestId
    }));
    f.resetRuntime(); f.nextTick();
    const T = (await import('../core/RuntimeTelemetry.js')).default;
    const M = (await import('../services/EmpireMetricsService.js')).default;
    const sample = () => { T.beginTick('v1'); f.runTick(); new M('EmpireMetrics').cleanup(); T.finishTick(); };
    sample();
    assert.equal(f.ledger.spawnEnergyUnknownUpperBound, 1600);
    for (const task of pending) {
        Memory.empire.spawningCreeps[task.name] = {
            schemaVersion: 2, acceptedAt: 100, spawnRoom: 'W1N1', expireAt: 200,
            spawnName: task.spawnName, body: task.body, memory: task.memory, requestId: task.requestId
        };
        Game.spawns[task.spawnName].spawning = { name: task.name };
    }
    f.nextTick(); sample();
    assert.equal(f.ledger.spawnEnergyUnknownUpperBound, 0);
    assert.equal(f.ledger.spawnEnergyConfirmed, 1500);
    assert.equal(f.ledger.spawnCostUnknown, 2);
    const window = Memory.empire.control.metrics.remoteObservation.current;
    assert.equal(window.observedTicks, 2);
    assert.equal(window.fields.spawnEnergyUnknownUpperBound.max, 1600);
    assert.equal(window.fields.spawnEnergyUnknownUpperBound.end, 0);
    assert.equal(window.counters.spawnCostUnknown.end, 2);
});

test('safety_paused_worker_return_keeps_stuck_guard', async () => {
    const f = await createRemoteFixture({ minerAtRemote: true });
    f.memory.empire.remoteRooms.W1N2.hold = true;
    f.runTick();
    const deadline = f.miner.memory.remoteLeg.expiresAt;
    for (let tick = 101; tick <= 115; tick++) { f.nextTick({ tick }); f.runTick(); }
    assert.equal(f.miner.memory.remoteLeg.state, 'safe_wait');
    assert.equal(f.miner.memory.task || null, null);
    assert.equal(f.miner.memory.remoteLeg.retryCount, 1);
    assert.equal(f.miner.memory.remoteLeg.expiresAt, deadline);
    assert.equal(f.miner.memory.remoteLeg.blockedReason, 'retry_exhausted');
    assert.ok(f.moves.filter(move => move.name === f.miner.name).length <= 10);
});

test('quota_conflicting_source_identity_cannot_cover_or_execute', async () => {
    const f = await createRemoteFixture({ haulerAtRemote: true });
    f.hauler.memory.sourceId = 'remoteSourceB';
    f.runTick();
    assert.equal(global.RemoteMining['W1N1:W1N2'].population.covered.remoteHauler, 0);
    assert.equal(f.hauler.memory.remoteStatus, 'identity_conflict');
    assert.equal(f.hauler.memory.task || null, null);
});

test('quota_miner_replacement_uses_its_own_terrain_estimate', async () => {
    const f = await createRemoteFixture({ minerAtRemote: true, haulerAtRemote: true });
    f.miner.ticksToLive = 130;
    Game.map.getRoomTerrain = roomName => ({ get: (x, y) => roomName === 'W1N2' && y < 3 ? TERRAIN_MASK_SWAMP : 0 });
    f.runTick();
    assert.ok(f.operation.route.roles.remoteMiner.outboundTicks > f.operation.route.outboundTicks);
    assert.ok(global.SpawnDemands.W1N1.some(demand => demand.role === 'remoteMiner'));
    assert.equal(f.operation.route.sinkPos.roomName, 'W1N1');
});

test('source_damaged_miner_releases_station_for_functional_replacement', async () => {
    const f = await createRemoteFixture({ minerAtRemote: true });
    for (const part of f.miner.body) if (part.type === WORK) part.hits = 0;
    f.runTick();
    assert.equal(f.miner.memory.remoteRetiring, true);
    assert.equal(f.miner.memory.remoteLeg.state, 'returning');
    assert.equal(f.miner.memory.task.type, 'MOVE_TO');
});
