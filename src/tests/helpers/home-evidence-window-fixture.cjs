const {installGlobals, store} = require('./remote-mining-fixture.cjs');
const {ids, clock, request} = require('./home-evidence-data.cjs');

async function createHomeFixture(options = {}) {
    installGlobals({nativePositions: true});
    const {DEFAULT_EMPIRE_POLICY} = await import('../../config/EmpirePolicy.js');
    global.Memory = {empire: {control: {policy: structuredClone(DEFAULT_EMPIRE_POLICY)}, market: {enabled: false}},
        rooms: {W49N41: {}}, creeps: {}};
    for (const key of ['RemoteEconomicTrial', 'ResourceMarketService', 'ResourceMarket', 'HomeEvidenceWindow', 'HomeEvidenceWindowRuntime']) delete global[key];
    const objects = {}, calls = [], pending = [], applied = [];
    let logs = [], used = 0, nowMs = clock.nowMs;
    const pos = (x = 20, y = 20) => new RoomPosition(x, y, 'W49N41');
    const add = value => (objects[value.id] = value);
    const source = add({id: ids.source, energy: 3000, energyCapacity: 3000, pos: pos(20, 19)});
    const storage = add({id: ids.storage, structureType: 'storage', my: true, pos: pos(21, 20), store: store(10000, 1000000)});
    const site = add({id: 'f'.repeat(24), structureType: 'terminal', my: true, pos: pos(23, 20), progress: 0, progressTotal: 100000});
    const room = {name: 'W49N41', storage, controller: {id: '9'.repeat(24), my: true, owner: {username: 'local'},
        pos: pos(25, 25), level: 7, ticksToDowngrade: 200000}, energyAvailable: 800, energyCapacityAvailable: 800,
        getTerrain: () => ({get: () => 0}), lookForAt: () => [],
        find(type, query) {
            const values = type === FIND_SOURCES ? [source] : [FIND_STRUCTURES, FIND_MY_STRUCTURES].includes(type) ? [storage] :
                [FIND_CONSTRUCTION_SITES, FIND_MY_CONSTRUCTION_SITES].includes(type) ? [site] :
                    [FIND_CREEPS, FIND_MY_CREEPS].includes(type) ? Object.values(Game.creeps) : [];
            return query?.filter ? values.filter(query.filter) : values;
        }, getEventLog: () => logs};
    global.Game = {time: clock.tick, shard: {name: 'shard3'}, rooms: {W49N41: room}, creeps: {}, spawns: {},
        getObjectById: id => objects[id] || null, cpu: {getUsed: () => used, tickLimit: 20, bucket: 10000},
        map: {getRoomTerrain: () => ({get: () => 0})}};
    global.RoomPhase = {W49N41: {recovery: {mode: 'normal'}, phase: 'storage', logisticsMode: 'hauler', hasStorage: true}};
    global.RoomCache = {W49N41: {sources: [source.id], structures: {storage: [storage.id]}, constructionSites: [site.id], updatedAt: 100}};
    global.RemoteMining = {}; global.EmpireServicesVersion = clock.codeVersion;
    function actor(name, id, role, energy, point) {
        Memory.creeps[name] = {role, homeRoom: 'W49N41', ...(role === 'miner' ? {sourceId: source.id, miningPos: {x: 20, y: 20, roomName: 'W49N41'}} : {})};
        const c = {id, name, my: true, room, pos: point, ticksToLive: 1500, spawning: false, fatigue: 0,
            body: [WORK, CARRY, MOVE].map(type => ({type, hits: 100})), store: store(energy, 100),
            getActiveBodyparts: type => c.body.filter(part => part.type === type).length};
        Object.defineProperty(c, 'memory', {get: () => Memory.creeps[name]});
        c.moveTo = target => {calls.push({tick: Game.time, name, method: 'moveTo', target: target.roomName}); return OK;};
        for (const method of ['harvest', 'transfer', 'withdraw', 'build']) c[method] = (target, _resource, amount) => {
            let result = c.pos.inRangeTo(target.pos, method === 'build' ? 3 : 1) ? OK : ERR_NOT_IN_RANGE;
            if (method === 'harvest' && c.store.getFreeCapacity() === 0) result = ERR_FULL;
            if (method !== 'harvest' && method !== 'withdraw' && c.store.energy === 0) result = ERR_NOT_ENOUGH_RESOURCES;
            calls.push({tick: Game.time, name, method, target: target.id, result});
            if (result === OK) pending.push(() => {
                const quantity = method === 'harvest' ? Math.min(2, source.energy, c.store.getFreeCapacity()) :
                    method === 'transfer' ? Math.min(c.store.energy, target.store.getFreeCapacity(), amount ?? c.store.energy) :
                        method === 'withdraw' ? Math.min(target.store.energy, c.store.getFreeCapacity(), amount ?? c.store.getFreeCapacity()) : 1;
                if (quantity <= 0) return;
                if (method === 'harvest') {c.store.energy += quantity; target.energy -= quantity;}
                if (method === 'transfer') {c.store.energy -= quantity; target.store.energy += quantity;}
                if (method === 'withdraw') {c.store.energy += quantity; target.store.energy -= quantity;}
                if (method === 'build') {c.store.energy--; target.progress += 5;}
                logs.push({event: method === 'harvest' ? 5 : method === 'build' ? 4 : 12, objectId: c.id,
                    data: {targetId: target.id, amount: method === 'build' ? 5 : quantity,
                        ...(['transfer', 'withdraw'].includes(method) ? {resourceType: 'energy'} : {})}});
                applied.push({tick: Game.time, name, method, amount: quantity});
            });
            return result;
        };
        Game.creeps[name] = c; add(c); return c;
    }
    const miner = actor('Miner', ids.miner, 'miner', 0, pos());
    const hauler = actor('Hauler', ids.hauler, 'hauler', 10, pos(20, 20));
    const builder = actor('Builder', 'e'.repeat(24), 'builder', 20, pos(22, 20));
    const {default: Miner} = await import('../../strategies/MinerStrategyService.js');
    const {default: Hauler} = await import('../../strategies/HaulerStrategyService.js');
    const {default: Builder} = await import('../../strategies/BuilderStrategyService.js');
    const {default: Market} = await import('../../services/ResourceMarketService.js');
    const {default: Parser} = await import('../../core/ActionParser.js');
    const services = [new Market('ResourceMarket'), new Miner('MinerStrategy'), new Builder('BuilderStrategy'), new Hauler('HaulerStrategy')];
    return {miner, hauler, builder, source, storage, site, room, objects, calls, applied, services,
        clock: () => ({tick: Game.time, nowMs, codeVersion: EmpireServicesVersion, shard: Game.shard.name}),
        enable() {Memory.empire.control.policy.homeEvidence = {...Memory.empire.control.policy.homeEvidence, enabled: true, request: request()};},
        setCpu(value) {used = value;}, setNow(value) {nowMs = value;},
        run() {
            services.forEach(s => s.init()); services.forEach(s => s.analyze()); services.forEach(s => s.run());
            Object.values(Game.creeps).forEach(c => Parser.run(c)); services.forEach(s => s.cleanup());
        },
        advance() {Game.time++; nowMs += 3000; logs = []; pending.splice(0).forEach(apply => apply());},
        reloadMemory() {global.Memory = JSON.parse(JSON.stringify(Memory));}
    };
}
module.exports = {createHomeFixture};
