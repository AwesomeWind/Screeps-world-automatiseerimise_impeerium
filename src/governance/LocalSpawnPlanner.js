// This planner only proposes local demand. SpawnBureau owns publication and SpawnService owns admission.
export function planLocalSpawn(facts, quoteBody) {
    const {roomName, phase, hasStorage, energyAvailable, energyCapacityAvailable, minimumMinerEnergy,
        roles, sources, recoveryRestricted, controller, construction, maintenance} = facts;
    const intents = [];
    const blockedDemands = [];
    const ordinaryLimit = energyCapacityAvailable || energyAvailable || 0;
    const count = role => (roles[role] || 0) + intents.filter(intent => intent.role === role).length;

    function propose(role, purpose, priority, bodyProfile, useCurrentEnergy, reason, sourceId) {
        const quotaKey = [role, roomName, purpose].join(':');
        if (intents.some(intent => intent.quotaKey === quotaKey)) return;
        const energyLimit = useCurrentEnergy && energyAvailable !== undefined ? energyAvailable : ordinaryLimit;
        const {body, cost} = quoteBody(role, {phase, bodyProfile, energyCapacity: energyLimit});
        if (!body || body.length === 0) {
            if (!blockedDemands.some(item => item.quotaKey === quotaKey)) {
                blockedDemands.push({role, quotaKey, reason: 'no_valid_body'});
            }
            return;
        }
        const memory = {quotaKey, role, homeRoom: roomName};
        if (sourceId !== undefined) memory.sourceId = sourceId;
        intents.push({roomName, role, quotaKey, priority, bodyProfile, body, memory, reason, energyLimit, cost});
    }

    const oneHaulerRoom = !hasStorage && (energyCapacityAvailable || 0) <= 300;
    const waitingForTransport = oneHaulerRoom && count('miner') > 0 &&
        count('hauler') === 0 && count('upgrader') === 0 && count('builder') === 0;
    const emergencyMiner = count('miner') === 0 && (energyAvailable || 0) >= minimumMinerEnergy;
    if (!waitingForTransport) {
        for (const source of sources) {
            if (source.spawningWithoutBody || source.coveredQuota >= source.openPositions || source.workParts >= 5) continue;
            propose('miner', source.id, emergencyMiner ? 120 : (count('miner') === 0 ? 90 : 80),
                emergencyMiner ? 'emergency_miner' : source.bodyProfile, emergencyMiner,
                emergencyMiner ? 'miner_recovery' : 'source_uncovered', source.id);
        }
    }

    const haulers = count('hauler');
    const desiredHaulers = hasStorage ? 3 : (oneHaulerRoom ? 1 : 2);
    if (haulers < desiredHaulers) {
        const first = haulers === 0;
        propose('hauler', 'core', first ? 90 : 45, first ? 'emergency_hauler' : 'hauler', first,
            first ? 'emergency_energy_logistics' : 'hauler_capacity');
    }

    const coreCovered = count('miner') > 0 && count('hauler') > 0;
    const upgraders = count('upgrader');
    if ((controller.emergency || (!recoveryRestricted && coreCovered)) && upgraders < controller.desired) {
        propose('upgrader', 'controller', upgraders === 0 ? 60 : 35, controller.bodyProfile,
            controller.emergency, 'controller_progress');
    }

    const ordinaryWorkAllowed = !recoveryRestricted && coreCovered && count('upgrader') > 0;
    const essentialBuild = recoveryRestricted && construction.essential;
    const builders = count('builder');
    if (construction.hasSites && (essentialBuild || ordinaryWorkAllowed) && builders < (essentialBuild ? 1 : 2)) {
        propose('builder', 'construction', builders === 0 ? 55 : 30, construction.bodyProfile, essentialBuild,
            essentialBuild ? 'core_construction_recovery' : 'construction');
    }

    const essentialRepair = recoveryRestricted && maintenance.urgentTargets > 0;
    if (maintenance.totalTargets > 0 && (essentialRepair || ordinaryWorkAllowed)) {
        const repairers = count('repairer');
        const backlog = essentialRepair ? maintenance.urgentBacklog : maintenance.backlog;
        if (repairers === 0) {
            propose('repairer', 'maintenance', maintenance.urgentTargets > 0 ? 58 : 44, 'repairer',
                essentialRepair, 'maintenance_coverage');
        } else if (backlog > 0 && repairers < Math.min(2, Math.ceil(backlog / 3))) {
            propose('repairer', 'maintenance', backlog >= 3 ? 52 : 42, 'repairer',
                essentialRepair, 'maintenance_backlog');
        }
    }
    return {intents, blockedDemands};
}
