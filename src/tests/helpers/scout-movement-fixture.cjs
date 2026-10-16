const { createRemoteFixture } = require('./remote-mining-fixture.cjs');

async function createScoutMovementFixture() {
    const fixture = await createRemoteFixture({ containerBuilt: false });
    Object.assign(Memory.empire.remoteRooms.W1N2, {
        sourceId: null, containerId: null, allowContainerBuild: false
    });
    Object.assign(Memory.empire.control.policy.remoteMining.roleLimits, {
        scout: 1, remoteMiner: 0, remoteHauler: 0, reserver: 0
    });
    delete Game.rooms.W1N2;
    const scout = fixture.actor('ScoutA', 'scout', [MOVE], 'W1N1', {
        remoteId: 'W1N1:W1N2', epoch: 1, targetRoom: 'W1N2', sourceId: null,
        quotaKey: 'scout:W1N1:W1N2'
    });
    scout.pos = new RoomPosition(10, 11, 'W1N1');
    const moves = [];
    let blocked = false;
    let forcedResult;
    let pendingPosition;

    // Model the RoomPosition[] contract of native moveByPath, not just an OK stub.
    // Position updates apply on the next tick, including movement accepted during congestion.
    scout.moveByPath = route => {
        const index = route.findIndex(point => point.isEqualTo(scout.pos));
        const next = route[index + 1];
        let result = OK;
        if (scout.spawning) result = ERR_BUSY;
        else if (scout.fatigue > 0) result = ERR_TIRED;
        else if (!next || index < 0 && scout.pos.getRangeTo(route[0]) > 1) result = ERR_NOT_FOUND;
        else if (forcedResult !== undefined) result = forcedResult;
        moves.push({ tick: Game.time, result, spawning: !!scout.spawning,
            from: { x: scout.pos.x, y: scout.pos.y, roomName: scout.pos.roomName },
            first: route[0] && { x: route[0].x, y: route[0].y, roomName: route[0].roomName } });
        if (result === OK && !blocked) pendingPosition = next;
        return result;
    };
    const advance = patch => {
        if (pendingPosition) {
            scout.pos = pendingPosition;
            scout.room = scout.pos.roomName === 'W1N1' ? fixture.home : fixture.remote;
            delete pendingPosition;
        }
        fixture.nextTick(patch);
        fixture.runTick();
    };
    return { fixture, scout, moves, advance,
        setBlocked(value) { blocked = value; },
        setMoveResult(value) { forcedResult = value; } };
}

module.exports = { createScoutMovementFixture };
