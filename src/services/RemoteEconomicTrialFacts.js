import { currentCreepPopulation } from '../core/CreepPopulation.js';
import { normalizeRemoteConfig } from './RemoteMiningState.js';

export function collectEconomicTrialFacts(scope, clock) {
    const empire = Memory.empire;
    const policy = empire.control.policy;
    const remotePolicy = policy.remoteMining;
    const settings = remotePolicy.economicTrial;
    const current = empire.remoteMining?.economicTrials?.current;
    const remoteId = current?.managed ? current.identity.remoteId : settings?.request?.remoteId;
    const entry = Object.entries(empire.remoteRooms || {}).find(([target, config]) => config && config.baseRoom + ':' + target === remoteId);
    const targetRoom = entry?.[0] || current?.targetRoom;
    const raw = entry?.[1];
    const baseRoom = raw?.baseRoom || current?.baseRoom;
    const operation = empire.remoteMining?.operations?.[remoteId];
    const home = Game.rooms[baseRoom];
    const remote = Game.rooms[targetRoom];
    const normalized = raw && normalizeRemoteConfig(targetRoom, raw, remotePolicy);
    const scopeFresh = !!scope && scope.operation === operation && operation.evaluatedAt === clock.tick;
    const actors = Object.values(Game.creeps).filter(actor => actor.memory.remoteId === remoteId || targetRoom && actor.memory.targetRoom === targetRoom);
    const population = currentCreepPopulation().filter(entry => entry.state !== 'invalid' &&
        (entry.memory.remoteId === remoteId || targetRoom && entry.memory.targetRoom === targetRoom));
    const budget = empire.remoteMining?.budgets?.[baseRoom];
    const grants = Object.values(budget?.grants || {}).filter(grant => grant.remoteId === remoteId);
    const infraPending = Object.values(budget?.infrastructure?.pending || {}).filter(attempt => attempt.remoteId === remoteId);
    const limits = remotePolicy.roleLimits;
    const receivers = (raw?.homeDeliveryTargetIds || []).map(id => Game.getObjectById(id));
    const receiver = receivers.length === 1 && receivers[0]?.my === true &&
        receivers[0]?.structureType === STRUCTURE_TERMINAL && receivers[0]?.pos?.roomName === baseRoom ? receivers[0] : null;
    const homeDanger = !!home && home.find(FIND_HOSTILE_CREEPS).length > 0;
    const remoteDanger = !!remote && remote.find(FIND_HOSTILE_CREEPS).length > 0;
    const username = home?.controller?.owner?.username;
    const foreign = !!remote && (!remote.controller || !!remote.controller.owner ||
        remote.controller.reservation && remote.controller.reservation.username !== username);
    const source = raw?.sourceId && Game.getObjectById(raw.sourceId);
    const point = raw?.containerPos;
    const sourceValid = !!remote && !!source && source.pos.roomName === targetRoom && point?.roomName === targetRoom &&
        source.energyCapacity > 0 && source.pos.inRangeTo(point, 1) &&
        Game.map.getRoomTerrain(targetRoom).get(point.x, point.y) !== TERRAIN_MASK_WALL &&
        remote.lookForAt(LOOK_STRUCTURES, point.x, point.y).every(target =>
            [STRUCTURE_ROAD, STRUCTURE_CONTAINER].includes(target.structureType) ||
            target.structureType === STRUCTURE_RAMPART && (target.my || target.isPublic));
    const recovery = global.RoomPhase?.[baseRoom]?.recovery;
    const recon = empire.remoteMining?.reconTrials;
    const reconLocked = !!recon && (!recon.current || recon.current.managed !== false);
    const fingerprint = raw && JSON.stringify({
        baseRoom, targetRoom, sourceId: raw.sourceId, containerId: raw.containerId,
        containerPos: point, receiverIds: raw.homeDeliveryTargetIds, allowContainerBuild: raw.allowContainerBuild,
        reserveController: raw.reserveController, roleLimits: limits, bodyEnergyLimits: remotePolicy.bodyEnergyLimits,
        spawnEnergyLimit: remotePolicy.spawnEnergyLimit, infrastructureEnergyLimit: remotePolicy.infrastructureEnergyLimit,
        windowTicks: remotePolicy.windowTicks, safeStreakTicks: remotePolicy.safeStreakTicks,
        maxLegTicks: remotePolicy.maxLegTicks, reconCooldownTicks: remotePolicy.reconCooldownTicks
    });
    const fatalReason = !normalized?.valid ? 'config_invalid' : !raw.enabled || raw.hold || !remotePolicy.enabled ? 'manual_hold' :
        homeDanger ? 'home_danger' : remoteDanger ? 'danger' : foreign ? 'foreign_control' : null;
    return {
        guardEnabled: settings?.enabled === true, request: settings?.request || null, remoteId, baseRoom, targetRoom,
        epoch: operation?.epoch ?? settings?.request?.epoch, configFingerprint: fingerprint,
        controlSafe: policy.goalPlanning.enabled === false && policy.roomGovernor.shadow === true &&
            policy.scheduler.enforce === false && empire.market?.enabled === false,
        isolated: normalized?.valid === true && !!raw.sourceId && raw.allowContainerBuild === true && raw.reserveController === false &&
            limits.scout === 1 && limits.remoteMiner === 1 && limits.remoteHauler === 1 && limits.reserver === 0 &&
            remotePolicy.maxOperations === 1 && Object.entries(empire.remoteRooms).every(([name, value]) => !value?.enabled || name === targetRoom),
        homeHealthy: !!home?.controller?.my && !homeDanger && recovery?.mode === 'normal' &&
            recovery.coreUsable?.miner >= 1 && recovery.coreUsable?.hauler >= 1 &&
            home.controller.ticksToDowngrade >= Math.max(5000, policy.capabilityControl.controllerEmergencyTicks) &&
            Object.values(Game.spawns).some(spawn => spawn.room.name === baseRoom && (!spawn.isActive || spawn.isActive())),
        receiverFree: receiver?.store.getFreeCapacity(RESOURCE_ENERGY) ?? null, receiverId: receiver?.id,
        budgetSafe: remotePolicy.spawnEnergyLimit === 2000 && remotePolicy.infrastructureEnergyLimit === 6000 &&
            remotePolicy.windowTicks === 1000 && remotePolicy.safeStreakTicks === 100 && remotePolicy.maxLegTicks === 300 &&
            remotePolicy.bodyEnergyLimits.scout === 50 && remotePolicy.bodyEnergyLimits.remoteMiner === 800 &&
            remotePolicy.bodyEnergyLimits.remoteHauler === 800 &&
            !scope?.facts?.budgetStatus?.spawnExhausted && !scope?.facts?.budgetStatus?.infrastructureExhausted &&
            !grants.some(grant => grant.unknownReported),
        oldActors: population.length > 0 || actors.length > 0, unsettled: grants.length > 0 || infraPending.length > 0 ||
            !!current?.outbox?.some(item => item.stage !== 'applied') ||
            !!current?.infrastructureAttempt && current.infrastructureAttempt.stage !== 'applied' || !!current?.failedHandoff ||
            Object.values(current?.slots || {}).some(slot => slot.unknownUpperBound > 0 ||
                slot.ledgerStage === 'applying' || ['not_started', 'call_started'].includes(slot.callState)),
        reconLocked, fatalReason, scopeFresh, remoteVisible: !!remote,
        upcomingNames: population.filter(entry => ['accepted', 'spawning'].includes(entry.state)).map(entry => entry.name),
        remoteSafe: !!remote && !remoteDanger && !foreign && !homeDanger,
        sourceValid, routeValid: scopeFresh ? scope.facts.economicRoute?.valid ?? false : null,
        containerReady: scopeFresh && !!scope.facts.container, containerId: scopeFresh ? scope.facts.container?.id : null,
        containerEnergy: scopeFresh ? scope.facts.container?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0 : null,
        sourceId: raw?.sourceId, containerPos: point,
        closed: !!raw && !raw.enabled && raw.hold === true && !remotePolicy.enabled &&
            operation?.allowRecon !== true && operation?.allowEconomicDeparture !== true,
        actors: actors.map(actor => ({ name: actor.name, role: actor.memory.role, epoch: actor.memory.epoch,
            trialId: actor.memory.economicTrialId, sequence: actor.memory.economicTrialSequence,
            spawning: !!actor.spawning, pos: { x: actor.pos.x, y: actor.pos.y, roomName: actor.pos.roomName },
            hasMove: actor.getActiveBodyparts(MOVE) > 0,
            leg: actor.memory.remoteLeg, body: actor.body.map(part => part.type), energy: actor.store.getUsedCapacity(RESOURCE_ENERGY) })),
        receipts: budget?.receipts || {}, grants, infrastructurePending: infraPending
    };
}
