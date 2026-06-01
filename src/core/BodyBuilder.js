function bodyCost(body) {
    return body.reduce((sum, part) => sum + BODYPART_COST[part], 0);
}

function countParts(body) {
    return {
        workParts: body.filter((part) => part === WORK).length,
        carryParts: body.filter((part) => part === CARRY).length,
        moveParts: body.filter((part) => part === MOVE).length
    };
}

function phaseFor(room, context) {
    if (context.phase) return context.phase;
    if (room.storage) return 'stable';
    if ((room.energyCapacityAvailable || 0) >= 300) return 'early';
    return 'bootstrap';
}

function buildMiner(phase, capacity) {
    if (phase === 'bootstrap') return [WORK, MOVE];
    if (phase === 'stable' && capacity >= 550) return [WORK, WORK, WORK, WORK, WORK, MOVE];
    return [WORK, WORK, MOVE];
}

function carryMovePairs(pairs) {
    const body = [];
    for (let i = 0; i < pairs; i++) body.push(CARRY);
    for (let i = 0; i < pairs; i++) body.push(MOVE);
    return body;
}

function buildHauler(phase, capacity) {
    if (phase === 'bootstrap') return carryMovePairs(1);
    if (phase === 'stable' && capacity >= 500) return carryMovePairs(5);
    if (capacity >= 400) return carryMovePairs(4);
    if (capacity >= 300) return carryMovePairs(3);
    return carryMovePairs(2);
}

function buildUpgrader(phase, capacity) {
    if (phase === 'bootstrap') return [WORK, CARRY, MOVE];
    if (phase === 'stable' && capacity >= 400) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
    return [WORK, CARRY, CARRY, MOVE, MOVE];
}

const BodyBuilder = {
    build(role, room, context = {}) {
        const phase = phaseFor(room, context);
        const capacity = context.energyCapacity || room.energyCapacityAvailable || room.energyAvailable || 0;
        let body;

        if (role === 'miner') body = buildMiner(phase, capacity);
        else if (role === 'hauler') body = buildHauler(phase, capacity);
        else if (role === 'upgrader') body = buildUpgrader(phase, capacity);
        else body = [WORK, CARRY, MOVE];

        return {
            body,
            cost: bodyCost(body),
            capacity: countParts(body)
        };
    }
};

export default BodyBuilder;
