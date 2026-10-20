import { currentCreepPopulation } from '../core/CreepPopulation.js';
import { normalizeRemoteConfig } from './RemoteMiningState.js';
import { reconTrialSettlementReceipt } from './RemoteReconTrialSettlement.js';

function position(pos) {
    return pos ? { x: pos.x, y: pos.y, roomName: pos.roomName } : null;
}

export function collectReconTrialFacts(scope, clock) {
    const empire = Memory.empire;
    const policy = empire.control.policy;
    const trial = policy.remoteMining.reconTrial;
    const current = empire.remoteMining?.reconTrials?.current;
    const sameRequest = !!current?.identity && !!trial?.request && trial.request.id === current.identity.trialId && trial.request.sequence === current.identity.sequence;
    const candidateSourceId = sameRequest || !current ? trial?.request?.candidateSourceId : current.candidateSourceId;
    const remoteId = current?.managed ? current.identity?.remoteId : trial?.request?.remoteId;
    const operation = Object.values(empire.remoteMining?.operations || {}).find(value => value.remoteId === remoteId);
    const rawEntry = Object.entries(empire.remoteRooms || {}).find(([target, config]) => `${config?.baseRoom}:${target}` === remoteId);
    const targetRoom = rawEntry?.[0] || current?.targetRoom;
    const raw = rawEntry ? rawEntry[1] : empire.remoteRooms?.[targetRoom];
    const enabledRooms = Object.entries(empire.remoteRooms || {}).filter(([, config]) => config?.enabled === true);
    const otherEnabledRooms = enabledRooms.filter(([name]) => name !== targetRoom).map(([name]) => name);
    if (!normalizeRemoteConfig(targetRoom, raw, policy.remoteMining).valid) {
        return { guardEnabled: trial?.enabled === true, request: trial?.request || null, remoteId,
            epoch: operation?.epoch ?? trial?.request?.epoch, baseRoom: current?.baseRoom, targetRoom,
            fatalReason: 'config_invalid', controlSafe: false, isolated: false, homeHealthy: false,
            receiverFree: null, budgetSafe: false, oldActors: false, unsettled: true, actors: [],
            scopeFresh: false, existingReconAllowed: false, closed: false,
            moduleClosed: policy.remoteMining.enabled === false, otherEnabledRooms };
    }
    const home = raw && Game.rooms[raw.baseRoom];
    const remote = targetRoom && Game.rooms[targetRoom];
    const recovery = home && global.RoomPhase?.[home.name]?.recovery;
    const budget = raw && empire.remoteMining?.budgets?.[raw.baseRoom];
    const requestId = current?.spawn?.requestId;
    const receipt = requestId && budget?.receipts?.[requestId];
    const username = home?.controller?.owner?.username;
    const foreign = !!remote && (!remote.controller || !!remote.controller.owner ||
        !!remote.controller.reservation && remote.controller.reservation.username !== username);
    const homeDanger = !!home && home.find(FIND_HOSTILE_CREEPS).length > 0;
    const remoteDanger = !!remote && remote.find(FIND_HOSTILE_CREEPS).length > 0;
    const population = currentCreepPopulation().filter(entry => entry.memory.remoteId === remoteId && entry.state !== 'invalid');
    const actors = Object.values(Game.creeps).filter(actor => actor.memory.remoteId === remoteId ||
        !!targetRoom && actor.memory.targetRoom === targetRoom).map(actor => ({
        name: actor.name, trialId: actor.memory.reconTrialId, sequence: actor.memory.reconTrialSequence,
        epoch: actor.memory.epoch, role: actor.memory.role, spawning: !!actor.spawning,
        hasMove: actor.getActiveBodyparts(MOVE) > 0, pos: position(actor.pos),
        leg: actor.memory.remoteLeg, lastClear: actor.memory.lastTaskClear
    }));
    const receivers = (raw?.homeDeliveryTargetIds || []).map(id => Game.getObjectById(id))
        .filter(target => target?.pos?.roomName === raw.baseRoom && target.my === true && target.store);
    const receiver = receivers.find(target => target.store.getFreeCapacity(RESOURCE_ENERGY) >= 20000);
    const limits = policy.remoteMining.roleLimits;
    const controlSafe = policy.goalPlanning.enabled === false && policy.roomGovernor.shadow === true &&
        policy.scheduler.enforce === false && empire.market.enabled === false;
    const isolated = !!raw && raw.sourceId === null && raw.allowContainerBuild === false && raw.reserveController === false &&
        limits.scout === 1 && ['remoteMiner', 'remoteHauler', 'reserver'].every(role => limits[role] === 0) &&
        policy.remoteMining.maxOperations === 1 && enabledRooms.every(([name]) => name === targetRoom);
    const grants = Object.values(budget?.grants || {}).filter(grant => grant.remoteId === remoteId);
    const fingerprint = raw && JSON.stringify({ baseRoom: raw.baseRoom, targetRoom, sourceId: raw.sourceId,
        containerId: raw.containerId, containerPos: position(raw.containerPos), receivers: raw.homeDeliveryTargetIds,
        allowContainerBuild: raw.allowContainerBuild, reserveController: raw.reserveController,
        candidateSourceId, limits, spawnEnergyLimit: policy.remoteMining.spawnEnergyLimit, infrastructureEnergyLimit: policy.remoteMining.infrastructureEnergyLimit,
        windowTicks: policy.remoteMining.windowTicks, maxLegTicks: policy.remoteMining.maxLegTicks,
        safeStreakTicks: policy.remoteMining.safeStreakTicks, reconCooldownTicks: policy.remoteMining.reconCooldownTicks,
        bodyEnergyLimits: policy.remoteMining.bodyEnergyLimits });
    const matchedScope = scope && scope.operation?.remoteId === remoteId && scope.operation.evaluatedAt === clock.tick ? scope : null;
    const relevantActor = current?.spawn?.name;
    const fatalReason = !raw || !home ? 'home_unavailable' :
        raw.enabled !== true || raw.hold === true || policy.remoteMining.enabled !== true ? 'manual_hold' :
        homeDanger ? 'home_danger' : remoteDanger ? 'danger' : foreign ? 'foreign_control' : null;
    let sourceValid = null;
    let visibleRoute = null;
    const active = current?.managed && !current.outcome;
    if (remote && raw?.containerPos && candidateSourceId) {
        const source = Game.getObjectById(candidateSourceId);
        const point = raw.containerPos;
        const structures = remote.lookForAt(LOOK_STRUCTURES, point.x, point.y);
        const blocked = structures.some(value => value.structureType !== STRUCTURE_ROAD && value.structureType !== STRUCTURE_CONTAINER &&
            !(value.structureType === STRUCTURE_RAMPART && (value.my || value.isPublic)));
        sourceValid = !!source && source.id === candidateSourceId && source.pos.roomName === targetRoom &&
            Number.isFinite(source.energyCapacity) && source.energyCapacity > 0 && point.roomName === targetRoom &&
            source.pos.getRangeTo(new RoomPosition(point.x, point.y, point.roomName)) === 1 &&
            remote.getTerrain().get(point.x, point.y) !== TERRAIN_MASK_WALL && !blocked;
        const cached = current?.evidence?.route;
        const needsFresh = !cached || (current.evidence.safeStreak >= 99 && cached.checkedAt !== clock.tick);
        if (sourceValid && active && matchedScope && !fatalReason && needsFresh) {
            const service = global.EmpireServices?.find(value => value.name === 'RemoteMining');
            try {
                const result = service?.validateEconomicRoutes({ ...operation,
                    config: { ...operation.config, sourceId: candidateSourceId } }, { home, remote, source }, policy.remoteMining);
                visibleRoute = result ? { valid: result.valid, reasons: result.reasons || [],
                    outboundTicks: result.outboundTicks ?? null, inboundTicks: result.inboundTicks ?? null,
                    roles: result.roles || null, receiverId: receiver?.id || null, checkedAt: clock.tick } : null;
            } catch {
                visibleRoute = { valid: false, reasons: ['route_validation_error'], checkedAt: clock.tick };
            }
        } else if (sourceValid) visibleRoute = cached || null;
    }
    const settlementEvidence = current ? { identity: { ...current.identity }, requestId: requestId ?? null,
        receipt: receipt ? { requestId, name: receipt.name, remoteId: receipt.remoteId,
            epoch: receipt.epoch, cost: receipt.cost, tick: receipt.tick } : null } : null;
    const matchedReceipt = reconTrialSettlementReceipt(current, settlementEvidence, clock);
    return { guardEnabled: trial?.enabled === true, request: trial?.request || null, remoteId,
        baseRoom: raw?.baseRoom, targetRoom, epoch: operation?.epoch ?? trial?.request?.epoch,
        configFingerprint: fingerprint, controlSafe, isolated,
        homeHealthy: !!home?.controller?.my && recovery?.mode === 'normal' &&
            recovery.coreUsable?.miner >= 1 && recovery.coreUsable?.hauler >= 1 && !homeDanger &&
            home.controller.ticksToDowngrade >= policy.capabilityControl.controllerEmergencyTicks &&
            Object.values(Game.spawns).some(spawn => spawn.room.name === home.name && (!spawn.isActive || spawn.isActive())),
        receiverFree: receiver?.store.getFreeCapacity(RESOURCE_ENERGY) ?? null,
        budgetSafe: !matchedScope?.facts?.budgetStatus?.spawnUnknown && !matchedScope?.facts?.budgetStatus?.spawnExhausted &&
            !matchedScope?.facts?.budgetStatus?.infrastructureExhausted && policy.remoteMining.spawnEnergyLimit === 2000 &&
            policy.remoteMining.infrastructureEnergyLimit === 6000 && policy.remoteMining.windowTicks === 1000,
        oldActors: population.length > 0 || actors.length > 0,
        unsettled: grants.length > 0,
        upcoming: population.some(entry => entry.name === relevantActor && ['accepted', 'spawning'].includes(entry.state)),
        actors, spawnReceipt: matchedReceipt ? { requestId, name: matchedReceipt.name, tick: matchedReceipt.tick } : null,
        spawnEnergyConfirmed: operation?.ledger?.spawnEnergyConfirmed || 0,
        scopeFresh: !!matchedScope,
        existingReconAllowed: !!matchedScope && (matchedScope.state.allowRecon === true ||
            matchedScope.operation.status === 'recovering' && actors.some(actor => actor.pos.roomName === targetRoom)),
        closed: !!raw && raw.enabled === false && raw.hold === true && operation?.allowRecon !== true && operation?.allowEconomicDeparture !== true &&
            (policy.remoteMining.enabled === false || enabledRooms.some(([name]) => name !== targetRoom)),
        moduleClosed: policy.remoteMining.enabled === false,
        otherEnabledRooms,
        remoteSafe: !!remote && !foreign && !remoteDanger && !homeDanger,
        fatalReason,
        sourceValid, visibleRoute, settlementEvidence };
}
