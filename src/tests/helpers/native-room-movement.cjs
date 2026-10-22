// The native branches exercised here are documented in the 2026-10-22
// position/border diagnosis. This helper does not simulate collisions or terrain.
function roomCoordinates(name) {
    const [, horizontal, x, vertical, y] = /^([WE])(\d+)([NS])(\d+)$/.exec(name);
    return [horizontal === 'W' ? -Number(x) - 1 : Number(x), vertical === 'N' ? -Number(y) - 1 : Number(y)];
}

function roomName(x, y) {
    return (x < 0 ? 'W' + (-x - 1) : 'E' + x) + (y < 0 ? 'N' + (-y - 1) : 'S' + y);
}

function positionSnapshot(pos) { return { x: pos.x, y: pos.y, roomName: pos.roomName }; }

function worldPosition(pos) {
    const [x, y] = roomCoordinates(pos.roomName);
    return { x: x * 50 + pos.x, y: y * 50 + pos.y };
}

function localPosition(x, y) {
    const roomX = Math.floor(x / 50), roomY = Math.floor(y / 50);
    return new RoomPosition(x - roomX * 50, y - roomY * 50, roomName(roomX, roomY));
}

function describeNativeExits(name) {
    const [x, y] = roomCoordinates(name);
    return { 1: roomName(x, y - 1), 3: roomName(x + 1, y), 5: roomName(x, y + 1), 7: roomName(x - 1, y) };
}

function edgeDestination(pos) {
    const [x, y] = roomCoordinates(pos.roomName);
    if (pos.x === 0) return new RoomPosition(49, pos.y, roomName(x - 1, y));
    if (pos.y === 0) return new RoomPosition(pos.x, 49, roomName(x, y - 1));
    if (pos.x === 49) return new RoomPosition(0, pos.y, roomName(x + 1, y));
    if (pos.y === 49) return new RoomPosition(pos.x, 0, roomName(x, y + 1));
    return pos;
}

function nativeMoveDecision(actor, path) {
    if (actor.fatigue) return { result: ERR_TIRED };
    if (!Array.isArray(path) || !path.length) return { result: ERR_NOT_FOUND };
    let index = path.findIndex(pos => actor.pos.isEqualTo(pos));
    if (index < 0 && !actor.pos.inRangeTo(path[0], 1)) return { result: ERR_NOT_FOUND };
    index++;
    if (index >= path.length) return { result: ERR_NOT_FOUND };
    const origin = worldPosition(actor.pos), target = worldPosition(path[index]);
    const dx = Math.sign(target.x - origin.x), dy = Math.sign(target.y - origin.y);
    const directions = { '0:-1': 1, '1:-1': 2, '1:0': 3, '1:1': 4, '0:1': 5, '-1:1': 6, '-1:0': 7, '-1:-1': 8 };
    const x = actor.pos.x + dx, y = actor.pos.y + dy;
    // An intent outside this room is not an in-room movement. The processor
    // still performs the exit transfer from the actor's edge cell at tick end.
    const next = x < 0 || x > 49 || y < 0 || y > 49 ? actor.pos : new RoomPosition(x, y, actor.pos.roomName);
    return { result: OK, direction: directions[`${dx}:${dy}`], next };
}

function straightNativePath(origin, goal) {
    const start = worldPosition(origin), target = worldPosition(goal.pos);
    const path = [];
    let x = start.x, y = start.y;
    while (Math.max(Math.abs(x - target.x), Math.abs(y - target.y)) > goal.range) {
        let nextX = x + Math.sign(target.x - x), nextY = y + Math.sign(target.y - y);
        const from = localPosition(x, y), to = localPosition(nextX, nextY);
        if (from.roomName !== to.roomName) {
            // Exits transfer to the paired cell, preserving the lateral axis.
            // A diagonal cross-room hop would not match the processor landing.
            if (from.x === 0 || from.x === 49) nextY = y;
            else nextX = x;
        }
        x = nextX; y = nextY;
        path.push(localPosition(x, y));
    }
    return path;
}

module.exports = { describeNativeExits, edgeDestination, nativeMoveDecision, straightNativePath, positionSnapshot };
