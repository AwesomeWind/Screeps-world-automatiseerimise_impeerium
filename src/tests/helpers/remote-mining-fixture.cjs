const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

function installGlobals(options = {}) {
    Object.assign(global, {
        WORK: 'work', CARRY: 'carry', MOVE: 'move', CLAIM: 'claim', ATTACK: 'attack',
        RANGED_ATTACK: 'ranged_attack', HEAL: 'heal', TOUGH: 'tough', RESOURCE_ENERGY: 'energy',
        OK: 0, ERR_NOT_OWNER: -1, ERR_NO_PATH: -2, ERR_NAME_EXISTS: -3, ERR_BUSY: -4,
        ERR_NOT_FOUND: -5, ERR_NOT_ENOUGH_ENERGY: -6, ERR_NOT_ENOUGH_RESOURCES: -6,
        ERR_INVALID_TARGET: -7, ERR_FULL: -8, ERR_NOT_IN_RANGE: -9, ERR_INVALID_ARGS: -10,
        ERR_TIRED: -11, ERR_NO_BODYPART: -12, CREEP_SPAWN_TIME: 3, CARRY_CAPACITY: 50,
        HARVEST_POWER: 2, ENERGY_REGEN_TIME: 300, BUILD_POWER: 5, REPAIR_POWER: 100,
        REPAIR_COST: 0.01, TERRAIN_MASK_WALL: 1, TERRAIN_MASK_SWAMP: 2,
        TOP: 1, RIGHT: 3, BOTTOM: 5, LEFT: 7,
        BODYPART_COST: { work: 100, carry: 50, move: 50, claim: 600, attack: 80, ranged_attack: 150, heal: 250, tough: 10 }
    });
    for (const type of ['SPAWN','EXTENSION','CONTAINER','STORAGE','TERMINAL','LINK','ROAD','RAMPART','WALL','TOWER','LAB','EXTRACTOR']) {
        global[`STRUCTURE_${type}`] = type === 'WALL' ? 'constructedWall' : type.toLowerCase();
    }
    for (const type of ['SOURCES','STRUCTURES','MY_STRUCTURES','MY_SPAWNS','CREEPS','MY_CREEPS','HOSTILE_CREEPS','HOSTILE_STRUCTURES','CONSTRUCTION_SITES','MY_CONSTRUCTION_SITES','DROPPED_RESOURCES','TOMBSTONES','RUINS','MINERALS']) global[`FIND_${type}`] = type;
    global.LOOK_STRUCTURES = 'structure'; global.LOOK_CREEPS = 'creep'; global.LOOK_TERRAIN = 'terrain';
    global.RoomPosition = class RoomPosition {
        constructor(x, y, roomName) {
            Object.assign(this, { x, y, roomName });
            if (options.nativePositions) for (const key of ['x', 'y', 'roomName']) Object.defineProperty(this, key, { enumerable: false });
        }
        toJSON() { return { x: this.x, y: this.y, roomName: this.roomName }; }
        getRangeTo(target) { const pos = target.pos || target; return pos.roomName !== this.roomName ? Infinity : Math.max(Math.abs(pos.x-this.x), Math.abs(pos.y-this.y)); }
        inRangeTo(target, range) { return this.getRangeTo(target) <= range; }
        isEqualTo(target) { return this.getRangeTo(target) === 0; }
        findClosestByRange(objects) { return [...objects].sort((a,b) => this.getRangeTo(a)-this.getRangeTo(b))[0] || null; }
    };
}

function store(energy = 0, capacity = 1000) {
    return { energy, getUsedCapacity(resource) { return !resource || resource === 'energy' ? this.energy : 0; },
        getFreeCapacity() { return capacity - this.energy; }, getCapacity() { return capacity; } };
}

async function createRemoteFixture(options = {}) {
    const baseRoom = options.roomNames?.base || 'W1N1';
    const targetRoom = options.roomNames?.target || 'W1N2';
    const remoteId = baseRoom + ':' + targetRoom;
    installGlobals(options);
    const f = { objects: {}, spawns: {}, spawnCalls: [], createdSites: [], visibleHostiles: [], newEconomicDepartures: [], droppedResources: [], moves: [], results: {} };
    const add = object => { f.objects[object.id] = object; return object; };
    const pos = (x,y,roomName) => new RoomPosition(x,y,roomName);
    const makeRoom = (name, mine) => {
        const room = { name, energyAvailable: 1900, energyCapacityAvailable: 1900,
            controller: add({ id: `controller:${name}`, my: mine, owner: mine ? { username: 'testUser' } : undefined,
                reservation: mine ? undefined : { username: 'testUser', ticksToEnd: 3000 },
                level: mine ? 7 : 0, progress: 1000, ticksToDowngrade: 150000, pos: pos(15,15,name) }),
            getTerrain: () => ({ get: () => 0 }),
            find(type, opts) {
                let values = [];
                const objects = Object.values(f.objects).filter(object => object.pos && object.pos.roomName === name);
                if (type === FIND_SOURCES) values = objects.filter(object => object.kind === 'source');
                if ([FIND_STRUCTURES,FIND_MY_STRUCTURES].includes(type)) values = objects.filter(object => object.structureType && object.kind !== 'site');
                if (type === FIND_MY_SPAWNS) values = Object.values(f.spawns).filter(spawn => spawn.room.name === name);
                if (type === FIND_MY_CREEPS) values = Object.values(Game.creeps).filter(creep => creep.room.name === name);
                if (type === FIND_HOSTILE_CREEPS) values = f.visibleHostiles.filter(creep => creep.pos.roomName === name);
                if (type === FIND_CREEPS) values = Object.values(Game.creeps).concat(f.visibleHostiles).filter(creep => creep.pos.roomName === name);
                if ([FIND_CONSTRUCTION_SITES,FIND_MY_CONSTRUCTION_SITES].includes(type)) values = objects.filter(object => object.kind === 'site');
                return opts && opts.filter ? values.filter(opts.filter) : values;
            },
            lookForAt(type,x,y) { return Object.values(f.objects).filter(object => object.pos && object.pos.roomName === name && object.pos.x===x && object.pos.y===y && (type !== LOOK_STRUCTURES || object.structureType)); },
            createConstructionSite(x,y,type) { f.createdSites.push({x,y,type,roomName:name}); return f.results.site ?? OK; }
        };
        return room;
    };
    f.home = makeRoom(baseRoom, true); f.remote = makeRoom(targetRoom, false);
    f.homeSink = add({ id:'HomeSink', my:true, structureType:'storage', store:store(20000,1000000), pos:pos(10,10,baseRoom) });
    f.home.storage = f.homeSink;
    f.source = add({ id:'remoteSourceA', kind:'source', energy:1500, energyCapacity:1500, pos:pos(20,19,targetRoom) });
    add({ id:'remoteSourceB', kind:'source', energy:1500, energyCapacity:1500, pos:pos(40,40,targetRoom) });
    f.container = add({ id:'RemoteContainer', structureType:'container', hits:250000, hitsMax:250000, store:store(options.pendingEnergy ?? 500,2000), pos:pos(20,20,targetRoom) });
    if (options.containerBuilt === false) delete f.objects.RemoteContainer;
    global.Memory = { empire: { remoteRooms: { [targetRoom]: { enabled:true, baseRoom:baseRoom, sourceId:options.selectedSource ?? 'remoteSourceA',
        containerId:'RemoteContainer', containerPos:{x:20,y:20,roomName:targetRoom}, allowContainerBuild:options.allowContainerBuild ?? false,
        homeDeliveryTargetIds:['HomeSink'], reserveController:false } },
        control:{ policy:{remoteMining:{enabled:options.policyEnabled ?? true, ...(options.spawnBudget === undefined ? {} : {spawnEnergyLimit:options.spawnBudget})}} } },
        rooms:{[baseRoom]:{},[targetRoom]:{}}, creeps:{} };
    global.Game = { time:100, rooms:{[baseRoom]:f.home,[targetRoom]:f.remote}, creeps:{}, spawns:f.spawns,
        getObjectById(id) { const object=f.objects[id] || Game.creeps[id]; return object && object.pos && !Game.rooms[object.pos.roomName] ? null : object || null; },
        cpu:{bucket:10000,limit:20,getUsed:()=>0},
        map:{describeExits:name=>name===baseRoom?{5:targetRoom}:{1:baseRoom}, getRoomTerrain:()=>({get:()=>0}),getRoomStatus:()=>({status:'normal'})} };
    global.PathFinder = {
        CostMatrix: class CostMatrix {
            constructor(){this.cells={};}
            set(x,y,cost){this.cells[`${x}:${y}`]=cost;}
            get(x,y){return this.cells[`${x}:${y}`]||0;}
        },
        search(origin,goal,searchOptions){
            f.pathOptions=searchOptions;
            if (options.nativeMovement) {
                const { straightNativePath } = require('./native-room-movement.cjs');
                const path = straightNativePath(origin, goal);
                for (const point of path) {
                    const matrix = searchOptions.roomCallback(point.roomName);
                    if (matrix === false || matrix.get(point.x, point.y) === 255) return { incomplete: true, path: [] };
                }
                return { incomplete: false, path };
            }
            const target=goal.pos;
            const path=[];
            let x=origin.x,y=origin.y,roomName=origin.roomName;
            const walk=(tx,ty)=>{while(x!==tx||y!==ty){x+=Math.sign(tx-x);y+=Math.sign(ty-y);path.push(new RoomPosition(x,y,roomName));}};
            if(roomName!==target.roomName){
                const down=roomName===baseRoom;
                walk(target.x,down?49:0);roomName=target.roomName;y=down?0:49;
                path.push(new RoomPosition(x,y,roomName));
            }
            while (Math.max(Math.abs(x-target.x), Math.abs(y-target.y)) > goal.range) {
                x += Math.sign(target.x-x); y += Math.sign(target.y-y);
                path.push(new RoomPosition(x,y,roomName));
            }
            for(const point of path){const matrix=searchOptions.roomCallback(point.roomName);if(matrix===false||matrix.get(point.x,point.y)===255)return {incomplete:true,path:[]};}
            return {incomplete:false,path};
        }
    };
    if (options.nativeMovement) Game.map.describeExits = require('./native-room-movement.cjs').describeNativeExits;
    f.memory = Memory;
    f.actor = (name,role,body,roomName=baseRoom,extra={}) => {
        const memory = {role,homeRoom:baseRoom,...extra}; Memory.creeps[name]=memory;
        const actor = {name,id:name,my:true,memory,room:Game.rooms[roomName],pos:pos(20,20,roomName),
            body:body.map(type=>({type,hits:100})),ticksToLive:1500,fatigue:0,store:store(0,body.filter(part=>part===CARRY).length*50),
            getActiveBodyparts(type){return this.body.filter(part=>part.type===type&&part.hits>0).length;},
            moveTo(target){ f.moves.push({name,target}); return this.fatigue ? ERR_TIRED : (f.results[`${name}:moveTo`] ?? OK); },
            moveByPath(route){ f.moves.push({name,route}); return this.fatigue ? ERR_TIRED : (f.results[`${name}:moveByPath`] ?? OK); },
            suicide(){f.results[`${name}:suicide`]=true;return OK;}
        };
        for(const method of ['harvest','transfer','withdraw','pickup','build','repair','reserveController','upgradeController']) actor[method]=()=>f.results[`${name}:${method}`] ?? OK;
        Game.creeps[name]=actor; return actor;
    };
    if(options.minerAtRemote){
        f.miner=f.actor('RemoteMinerA','remoteMiner',[WORK,WORK,CARRY,MOVE,MOVE],targetRoom,{
            remoteId:remoteId,epoch:1,targetRoom:targetRoom,sourceId:'remoteSourceA',quotaKey:`remoteMiner:${remoteId}:remoteSourceA`});
        f.miner.store.energy=options.minerEnergy??0;
    }
    if(options.haulerAtHome||options.haulerAtRemote||options.carriedEnergy!==undefined){
        const roomName=options.haulerAtRemote?targetRoom:baseRoom;
        f.hauler=f.actor('HaulerA','remoteHauler',[CARRY,CARRY,MOVE,MOVE],roomName,{
            remoteId:remoteId,epoch:1,targetRoom:targetRoom,sourceId:'remoteSourceA',quotaKey:`remoteHauler:${remoteId}:remoteSourceA`});
        f.hauler.pos=roomName===baseRoom?pos(10,11,roomName):pos(20,21,roomName);
        f.hauler.store.energy=options.carriedEnergy??0;
    }
    for(const [name,role,body] of [['CoreMiner','miner',[WORK,WORK,WORK,WORK,WORK,CARRY,MOVE]],['CoreHauler','hauler',Array(20).fill(CARRY).concat([MOVE])],['CoreUpgrade','upgrader',[WORK,WORK,WORK,WORK,WORK,CARRY,MOVE]],['CoreRepair','repairer',[WORK,CARRY,MOVE]]]) f.actor(name,role,body);
    for (const name of ['CoreHaulerB','CoreHaulerC']) f.actor(name,'hauler',[CARRY,CARRY,CARRY,CARRY,CARRY,MOVE]);
    f.actor('CoreUpgradeB','upgrader',[WORK,WORK,WORK,WORK,WORK,CARRY,MOVE]);
    for(const name of ['Spawn1','Spawn2']) {
        f.spawns[name] = {name,id:name,my:true,structureType:'spawn',room:f.home,pos:pos(10,11,baseRoom),isActive:()=>true,
            spawnCreep(body,actorName,{memory}) { const result=f.results.spawn ?? OK; f.spawnCalls.push({body:[...body],name:actorName,memory:{...memory},cost:body.reduce((sum,part)=>sum+BODYPART_COST[part],0),result});return result; } };
    }
    f.memory.rooms[baseRoom].serviceFlags={planning:false,roads:false,defensePlanning:false,maintenancePlanning:false,lab:false,market:false,remoteMining:true};
    global.RoomCache={[baseRoom]:{sources:[],structures:{},constructionSites:[],updatedAt:100},[targetRoom]:{sources:['remoteSourceA','remoteSourceB'],structures:{container:['RemoteContainer']},updatedAt:100}};
    global.RoomPhase={[baseRoom]:{phase:'storage',hasStorage:true,energyPosture:'normal',spawnEnergyRatio:1,recovery:{mode:'normal',coreUsable:{miner:1,hauler:1}}}};
    global.RoomGovernor={};
    const root = path.resolve(__dirname,'../..');
    const load = relative => import(pathToFileURL(path.join(root,relative)).href);
    (await load('config/MemoryConfig.js')).default.ensureDefaults();
    const EventBus=(await load('core/EventBus.js')).default;
    const Remote=(await load('services/RemoteMiningService.js')).default;
    const Bureau=(await load('services/SpawnBureauService.js')).default;
    const Spawn=(await load('services/SpawnService.js')).default;
    f.ActionParser=(await load('core/ActionParser.js')).default;
    f.bus=EventBus;
    const Market=(await load('services/ResourceMarketService.js')).default;
    const ActorStrategy=fs.existsSync(path.join(root,'strategies/RemoteMiningStrategyService.js')) ? (await load('strategies/RemoteMiningStrategyService.js')).default : null;
    f.resetRuntime = () => { EventBus.clearSubscribers(); EventBus.topics={}; EventBus.tickCounter=0;f.market=new Market('ResourceMarket'); f.services=[new Remote('RemoteMining'),new Bureau('SpawnBureau'),new Spawn('Spawn'),f.market];if(ActorStrategy && !options.manualSettlement)f.services.push(new ActorStrategy('RemoteMiningStrategy')); };
    f.resetRuntime();
    f.runTick = () => { for(const service of f.services) service.init(); EventBus.beginTick(); for(const service of f.services) service.analyze(); EventBus.dispatch(); for(const service of f.services)service.run();for(const creep of Object.values(Game.creeps))f.ActionParser.run(creep); for(const service of f.services)service.cleanup(); };
    f.nextTick = (patch={}) => {
        Game.time=patch.tick ?? Game.time+1;
        for(const [id,energy] of Object.entries(patch.storeEnergy||{})) (f.objects[id]||Game.creeps[id]).store.energy=energy;
        for (const [name, point] of Object.entries(patch.positions || {})) {
            const actor = Game.creeps[name];
            actor.pos = pos(point.x, point.y, point.roomName);
            actor.room = point.roomName === baseRoom ? f.home : f.remote;
        }
        if(patch.visibility===false)delete Game.rooms[targetRoom]; if(patch.visibility===true)Game.rooms[targetRoom]=f.remote;
        if(patch.siteVisible){f.site=add({id:'RemoteSite',kind:'site',my:true,structureType:STRUCTURE_CONTAINER,pos:pos(20,20,targetRoom),progress:0,progressTotal:5000});}
        if(patch.siteProgress!==undefined)f.site.progress=patch.siteProgress;
        if(patch.containerHits!==undefined)f.container.hits=patch.containerHits;
    };
    f.actionResult=(name,method,result)=>{f.results[`${name}:${method}`]=result;};
    Object.defineProperties(f,{operation:{get:()=>Memory.empire.remoteMining?.operations?.[remoteId]},ledger:{get:()=>f.operation?.ledger}});
    return f;
}
module.exports={createRemoteFixture,installGlobals,store};
