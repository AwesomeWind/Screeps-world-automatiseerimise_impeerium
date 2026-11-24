const actorId = '5bbcaa6d9099fc012e63155b';
const spawnId = '6ad0b55bceeb3db0d3b4dda0';
const roomName = 'W49N41';
const version = '1794904713204';

function supplyRecord() {
    return {
        schemaVersion: 1, shard: 'shard3', roomName, version,
        birth: {
            requestId: 'REQ_SPAWN_2000_0', roomName, role: 'hauler', state: 'born',
            name: 'hauler_2000_Spawn1_0', quotaKey: 'hauler:W49N41:core', spawnName: 'Spawn1',
            cost: 200, admittedAt: 2000, expireAt: 2001, bornAt: 2012, observeUntil: 2022
        },
        frame: {
            tick: 2014, actor: {id: actorId, role: 'hauler', spawning: false, energy: 0},
            action: {tick: 2013, target: spawnId, reason: 'transfer_completed',
                before: {tick: 2013, ownerAmount: 100, targetAmount: 100}, after: 200},
            eventCount: 1, transfers: [[actorId, spawnId, 100, 'energy']]
        }
    };
}

module.exports = {actorId, spawnId, roomName, version, supplyRecord};
