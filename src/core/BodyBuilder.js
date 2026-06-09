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
    if (room.storage || room.terminal) return 'stable';
    if ((room.energyCapacityAvailable || 0) >= 300) return 'early';
    return 'bootstrap';
}

function normalizedPhase(phase) {
    if (phase === 'storage' || phase === 'terminal' || phase === 'empire') return 'stable';
    return phase;
}

function countType(body, partType) {
    return body.filter((part) => part === partType).length;
}

function canApplyStep(body, step, spec, remaining, applications) {
    const parts = step.parts || [];
    const stepCost = bodyCost(parts);
    if (stepCost > remaining) return false;
    if (body.length + parts.length > (spec.maxParts || 50)) return false;
    if (step.maxApplications !== undefined && applications >= step.maxApplications) return false;
    if (step.when && !step.when(body, remaining)) return false;

    if (step.typeLimits) {
        for (const partType in step.typeLimits) {
            const nextCount = countType(body, partType) + countType(parts, partType);
            if (nextCount > step.typeLimits[partType]) return false;
        }
    }

    return true;
}

function sortBody(body) {
    const order = {
        [TOUGH]: 1,
        [WORK]: 2,
        [CARRY]: 3,
        [ATTACK]: 4,
        [RANGED_ATTACK]: 5,
        [HEAL]: 6,
        [CLAIM]: 7,
        [MOVE]: 8
    };
    return body.slice().sort((a, b) => (order[a] || 99) - (order[b] || 99));
}

function buildFromSpec(spec, capacity) {
    const body = (spec.base || []).slice();
    let remaining = capacity - bodyCost(body);
    if (remaining < 0) return [];

    const steps = spec.steps || [];
    const applications = new Array(steps.length).fill(0);

    let progressed = true;
    while (progressed) {
        progressed = false;
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            if (!canApplyStep(body, step, spec, remaining, applications[i])) continue;
            body.push(...step.parts);
            remaining -= bodyCost(step.parts);
            applications[i]++;
            progressed = true;
            break;
        }
    }

    return spec.sort === false ? body : sortBody(body);
}

function haulerPairsFor(phase, capacity) {
    if (phase === 'stable' && capacity >= 500) return 5;
    if (capacity >= 400) return 4;
    if (capacity >= 300) return 3;
    if (capacity < 200) return 1;
    return 2;
}

function upgraderSpec(context, capacity) {
    const phase = context.phase;
    if (phase === 'bootstrap') {
        return { base: [WORK, CARRY, MOVE] };
    }
    if (context.bodyProfile === 'stationary_upgrader') {
        return {
            base: [WORK, CARRY, MOVE],
            steps: [
                { parts: [WORK], typeLimits: { [WORK]: 3 } },
                { parts: [MOVE], typeLimits: { [MOVE]: capacity >= 400 ? 2 : 1 } },
                { parts: [WORK], typeLimits: { [WORK]: 5 } },
                { parts: [CARRY], typeLimits: { [CARRY]: 2 } }
            ]
        };
    }
    return {
        base: [WORK, CARRY, MOVE],
        steps: [
            { parts: [CARRY, MOVE], maxApplications: 1 },
            { parts: [WORK], typeLimits: { [WORK]: 3 } },
            { parts: [CARRY], typeLimits: { [CARRY]: 2 } }
        ]
    };
}

function builderSpec(context) {
    const phase = context.phase;
    if (phase === 'bootstrap') {
        return { base: [WORK, CARRY, MOVE] };
    }
    if (context.bodyProfile === 'supplied_builder') {
        return {
            base: [WORK, CARRY, MOVE],
            steps: [
                { parts: [WORK], typeLimits: { [WORK]: 4 } },
                { parts: [MOVE], typeLimits: { [MOVE]: 2 } },
                { parts: [WORK], typeLimits: { [WORK]: 6 } },
                { parts: [CARRY], typeLimits: { [CARRY]: 2 } }
            ]
        };
    }
    return {
        base: [WORK, CARRY, MOVE],
        steps: [
            { parts: [CARRY, MOVE], maxApplications: 1 },
            { parts: [WORK], typeLimits: { [WORK]: 2 } },
            { parts: [WORK], typeLimits: { [WORK]: 3 } }
        ]
    };
}

function repairerSpec(context) {
    const phase = context.phase;
    if (phase === 'bootstrap') {
        return { base: [WORK, CARRY, MOVE] };
    }
    return {
        base: [WORK, CARRY, MOVE],
        steps: [
            { parts: [WORK], typeLimits: { [WORK]: 3 } },
            { parts: [CARRY, MOVE], maxApplications: 1 },
            { parts: [WORK], typeLimits: { [WORK]: 5 } },
            { parts: [MOVE], typeLimits: { [MOVE]: 3 } }
        ]
    };
}

function remoteMinerSpec(context) {
    if (context.bodyProfile === 'remote_travel_miner') {
        return {
            base: [WORK, CARRY, MOVE],
            steps: [
                { parts: [MOVE], typeLimits: { [MOVE]: 3 } },
                { parts: [WORK], typeLimits: { [WORK]: 3 } },
                { parts: [MOVE], typeLimits: { [MOVE]: 4 } },
                { parts: [WORK], typeLimits: { [WORK]: 4 } }
            ]
        };
    }
    return {
        base: [WORK, CARRY, MOVE],
        steps: [
            { parts: [WORK], typeLimits: { [WORK]: 3 } },
            { parts: [MOVE], typeLimits: { [MOVE]: 2 } },
            { parts: [WORK], typeLimits: { [WORK]: 5 } }
        ]
    };
}

function meleeDefenderSpec(capacity) {
    if (capacity >= 800) {
        return {
            base: [TOUGH, ATTACK, MOVE],
            steps: [
                { parts: [TOUGH, MOVE], maxApplications: 1 },
                { parts: [ATTACK, MOVE], maxApplications: 1 },
                { parts: [ATTACK], typeLimits: { [ATTACK]: 3 } }
            ]
        };
    }
    if (capacity >= 550) {
        return {
            base: [TOUGH, ATTACK, MOVE],
            steps: [
                { parts: [TOUGH, MOVE], maxApplications: 1 },
                { parts: [ATTACK], typeLimits: { [ATTACK]: 2 } }
            ]
        };
    }
    if (capacity >= 300) {
        return {
            base: [TOUGH, ATTACK, MOVE],
            steps: [
                { parts: [TOUGH, MOVE], maxApplications: 1 }
            ]
        };
    }
    return { base: [TOUGH, ATTACK, MOVE] };
}

function rangedDefenderSpec(capacity) {
    if (capacity >= 800) {
        return {
            base: [RANGED_ATTACK, MOVE],
            steps: [
                { parts: [RANGED_ATTACK, MOVE], typeLimits: { [RANGED_ATTACK]: 3 } },
                { parts: [TOUGH, MOVE], maxApplications: 2 },
                { parts: [RANGED_ATTACK], typeLimits: { [RANGED_ATTACK]: 4 } }
            ]
        };
    }
    if (capacity >= 550) {
        return {
            base: [RANGED_ATTACK, MOVE],
            steps: [
                { parts: [RANGED_ATTACK, MOVE], maxApplications: 1 },
                { parts: [TOUGH, MOVE], maxApplications: 1 }
            ]
        };
    }
    return {
        base: [RANGED_ATTACK, MOVE],
        steps: [
            { parts: [MOVE], typeLimits: { [MOVE]: 2 } }
        ]
    };
}

function resolveSpec(role, room, context, capacity) {
    const phase = normalizedPhase(phaseFor(room, context));
    const profile = context.bodyProfile || role;
    const bodyContext = Object.assign({}, context, { phase, capacity });

    if (profile === 'miner') {
        if (phase === 'bootstrap') return { base: [WORK, MOVE] };
        return {
            base: [WORK, MOVE],
            steps: [
                { parts: [WORK], typeLimits: { [WORK]: 5 } }
            ]
        };
    }

    if (profile === 'emergency_miner') {
        return {
            base: [WORK, MOVE],
            steps: [
                { parts: [WORK], typeLimits: { [WORK]: 2 } }
            ]
        };
    }

    if (profile === 'emergency_hauler') {
        return {
            base: [CARRY, MOVE],
            steps: [
                { parts: [CARRY, MOVE], maxApplications: 1 }
            ]
        };
    }

    if (profile === 'hauler') {
        const pairs = haulerPairsFor(phase, capacity);
        return {
            base: [CARRY, MOVE],
            steps: [
                { parts: [CARRY, MOVE], maxApplications: Math.max(0, pairs - 1) }
            ]
        };
    }

    if (profile === 'upgrader' || profile === 'stationary_upgrader') {
        return upgraderSpec(bodyContext, capacity);
    }

    if (profile === 'builder' || profile === 'mobile_builder' || profile === 'supplied_builder') {
        return builderSpec(bodyContext);
    }

    if (profile === 'repairer' || role === 'repairer') {
        return repairerSpec(bodyContext);
    }

    if (profile === 'ranged_defender') {
        return rangedDefenderSpec(capacity);
    }

    if (profile === 'melee_defender' || role === 'defender') {
        return meleeDefenderSpec(capacity);
    }

    if (profile === 'scout') return { base: [MOVE] };

    if (profile === 'reserver') {
        return {
            base: [CLAIM, MOVE],
            steps: [
                { parts: [CLAIM, MOVE], maxApplications: capacity >= 1300 ? 1 : 0 }
            ]
        };
    }

    if (profile === 'remote_miner' || profile === 'remote_travel_miner') return remoteMinerSpec(bodyContext);

    return { base: [WORK, CARRY, MOVE] };
}

const BodyBuilder = {
    build(role, room, context = {}) {
        const capacity = context.energyCapacity || room.energyCapacityAvailable || room.energyAvailable || 0;
        const spec = resolveSpec(role, room, context, capacity);
        const body = buildFromSpec(spec, capacity);

        return {
            body,
            cost: bodyCost(body),
            capacity: countParts(body)
        };
    }
};

export default BodyBuilder;
