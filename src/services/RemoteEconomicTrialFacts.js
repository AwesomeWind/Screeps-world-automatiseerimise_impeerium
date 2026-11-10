import { nativeOpsEqual as equal } from './NativeEconomicTrialOpsProfile.js';
import { currentCreepPopulation } from '../core/CreepPopulation.js';
import { normalizeRemoteConfig } from './RemoteMiningState.js';
import { economicTrialConfigFingerprint } from './RemoteEconomicTrialConfig.js';
import { economicIdentityMatches } from './RemoteEconomicTrialModel.js';
import { resolveNativeEconomicOwnership, resolveNativeSuccessorRelease } from './NativeEconomicTrialOpsOwnership.js';

const activeMovementStages = new Set(['recon', 'observing', 'preparing', 'hauling']);
const tile = value => Number.isInteger(value) && value >= 0 && value < 50;
const samePosition = (a, b) => a?.roomName === b.roomName && a?.x === b.x && a?.y === b.y;

function currentLegGoal(actor, session, recoverySequence) {
    const leg = actor.memory.remoteLeg;
    if (typeof leg?.goalKey !== 'string') return null;
    const [roomName, xText, yText] = leg.goalKey.split(':');
    const point = { roomName, x: Number(xText), y: Number(yText) };
    if (![session.baseRoom, session.targetRoom].includes(roomName) || !tile(point.x) || !tile(point.y) ||
        leg.goalKey !== `${roomName}:${point.x}:${point.y}:${recoverySequence}`) return null;

    const task = actor.memory.task;
    if (task && (task.type !== 'MOVE_TO' || !samePosition(task.pos, point))) return null;
    const safeReturn = roomName === session.baseRoom && actor.memory.role !== 'remoteHauler';
    if (leg.goal !== undefined) {
        const goal = leg.goal;
        if (!samePosition(goal, point) || !tile(goal.range) ||
            !['range', 'home_interior'].includes(goal.arrival) ||
            goal.arrival === 'home_interior' && roomName !== session.baseRoom ||
            task && (task.range ?? 1) !== goal.range) return null;
        return goal;
    }
    if (safeReturn) return { ...point, range: 1, arrival: 'home_interior' };
    if (task && tile(task.range ?? 1)) return { ...point, range: task.range ?? 1, arrival: 'range' };
    if (actor.memory.role === 'remoteMiner' && session.containerPos && samePosition(session.containerPos, point)) {
        return { ...point, range: 0, arrival: 'range' };
    }
    return null;
}

function expiredMovement(actors, session, operation, clock) {
    if (!session?.managed || session.outcome || !activeMovementStages.has(session.status) ||
        session.identity.codeVersion !== clock.codeVersion || operation?.epoch !== session.identity.epoch) return null;
    for (const actor of actors) {
        const { role, remoteId, epoch, economicTrialId, economicTrialSequence, remoteLeg: leg } = actor.memory;
        const slot = session.slots[role];
        if (actor.spawning || slot?.name !== actor.name || !Number.isSafeInteger(slot.acceptedAt) ||
            remoteId !== session.identity.remoteId || epoch !== session.identity.epoch ||
            economicTrialId !== session.identity.trialId || economicTrialSequence !== session.identity.sequence ||
            !Number.isSafeInteger(leg?.startedAt) || leg.startedAt < slot.acceptedAt ||
            !Number.isSafeInteger(leg.expiresAt) || leg.expiresAt < leg.startedAt || clock.tick <= leg.expiresAt) continue;
        const goal = currentLegGoal(actor, session, operation.recoverySequence || 0);
        if (!goal) continue;
        const { x, y, roomName } = actor.pos;
        const arrived = roomName === goal.roomName && (goal.arrival === 'home_interior'
            ? x > 0 && x < 49 && y > 0 && y < 49
            : Math.max(Math.abs(x - goal.x), Math.abs(y - goal.y)) <= goal.range);
        if (!arrived) return { role, name: actor.name, pos: { x, y, roomName },
            goal: { x: goal.x, y: goal.y, roomName: goal.roomName, range: goal.range, arrival: goal.arrival },
            expiresAt: leg.expiresAt, retryCount: [0, 1].includes(leg.retryCount) ? leg.retryCount : null };
    }
    return null;
}

function closedPeriodicOwnershipIsUnused({current, settings, raw, remotePolicy, operation, scope, clock, nativeState}) {
    if (current?.managed !== true || current.status !== 'terminal' || !current.outcome ||
        raw?.enabled !== false || raw.hold !== true || remotePolicy.enabled !== false ||
        operation?.allowRecon !== false || operation.allowEconomicDeparture !== false ||
        scope?.state?.allowRecon === true || scope?.state?.allowEconomicDeparture === true)
        return false;
    const request = settings?.request;
    if (settings?.enabled === false) return true;
    const native = nativeState?.current;
    if (nativeState?.packedParent && native?.stage === 'terminal' && native.controlClosureConfirmed === true &&
        remotePolicy.nativeTrialOps?.enabled === false && equal(remotePolicy.nativeTrialOps.request, native.request) &&
        request?.action === 'start' && equal(request, native.startRequest) &&
        economicIdentityMatches(current.identity, native.admittedIdentity)) return true;
    return settings?.enabled === true && request?.action === 'release' &&
        request.targetTrialId === current.identity.trialId && request.remoteId === current.identity.remoteId &&
        request.epoch === current.identity.epoch && request.sequence === current.identity.sequence + 1 &&
        Number.isSafeInteger(request.expiresAtTick) && Number.isSafeInteger(request.expiresAtMs) &&
        request.expiresAtTick === request.activateAtTick + 1000 && request.expiresAtMs === request.issuedAtMs + 5400000 &&
        clock.tick > request.expiresAtTick && clock.nowMs > request.expiresAtMs;
}

export function collectEconomicTrialFacts(scope, clock, {periodic = false} = {}) {
    const empire = Memory.empire;
    const policy = empire.control.policy;
    const remotePolicy = policy.remoteMining;
    const settings = remotePolicy.economicTrial;
    const current = empire.remoteMining?.economicTrials?.current;
    const remoteId = current?.managed ? current.identity.remoteId : settings?.request?.remoteId;
    const entry = Object.entries(empire.remoteRooms || {}).find(
        ([target, config]) => config && config.baseRoom + ':' + target === remoteId
    );
    const targetRoom = entry?.[0] || current?.targetRoom;
    const raw = entry?.[1];
    const baseRoom = raw?.baseRoom || current?.baseRoom;
    const operation = empire.remoteMining?.operations?.[remoteId];
    const home = Game.rooms[baseRoom];
    const remote = Game.rooms[targetRoom];
    const normalized = raw && normalizeRemoteConfig(targetRoom, raw, remotePolicy);
    const scopeFresh = !!scope && scope.operation === operation && operation.evaluatedAt === clock.tick;
    const actors = Object.values(Game.creeps).filter(
        (actor) => actor.memory.remoteId === remoteId || (targetRoom && actor.memory.targetRoom === targetRoom)
    );
    const population = currentCreepPopulation().filter(
        (entry) =>
            entry.state !== 'invalid' &&
            (entry.memory.remoteId === remoteId || (targetRoom && entry.memory.targetRoom === targetRoom))
    );
    const budget = empire.remoteMining?.budgets?.[baseRoom];
    const grants = Object.values(budget?.grants || {}).filter((grant) => grant.remoteId === remoteId);
    const infraPending = Object.values(budget?.infrastructure?.pending || {}).filter(
        (attempt) => attempt.remoteId === remoteId
    );
    const limits = remotePolicy.roleLimits;
    const receivers = (raw?.homeDeliveryTargetIds || []).map((id) => Game.getObjectById(id));
    const receiver =
        receivers.length === 1 &&
        receivers[0]?.my === true &&
        receivers[0]?.structureType === STRUCTURE_TERMINAL &&
        receivers[0]?.pos?.roomName === baseRoom
            ? receivers[0]
            : null;
    const homeDanger = !!home && home.find(FIND_HOSTILE_CREEPS).length > 0;
    const remoteDanger = !!remote && remote.find(FIND_HOSTILE_CREEPS).length > 0;
    const username = home?.controller?.owner?.username;
    const foreign =
        !!remote &&
        (!remote.controller ||
            !!remote.controller.owner ||
            (remote.controller.reservation && remote.controller.reservation.username !== username));
    const source = raw?.sourceId && Game.getObjectById(raw.sourceId);
    const point = raw?.containerPos;
    const sourceValid =
        !!remote &&
        !!source &&
        source.pos.roomName === targetRoom &&
        point?.roomName === targetRoom &&
        source.energyCapacity > 0 &&
        source.pos.inRangeTo(point, 1) &&
        Game.map.getRoomTerrain(targetRoom).get(point.x, point.y) !== TERRAIN_MASK_WALL &&
        remote
            .lookForAt(LOOK_STRUCTURES, point.x, point.y)
            .every(
                (target) =>
                    [STRUCTURE_ROAD, STRUCTURE_CONTAINER].includes(target.structureType) ||
                    (target.structureType === STRUCTURE_RAMPART && (target.my || target.isPublic))
            );
    const recovery = global.RoomPhase?.[baseRoom]?.recovery;
    const recon = empire.remoteMining?.reconTrials;
    const reconLocked = !!recon && (!recon.current || recon.current.managed !== false);
    const fingerprint = economicTrialConfigFingerprint(raw, remotePolicy, targetRoom);
    // Evaluated again at spawn/action checkpoints; a released parent is not the new start's owner.
    // A closed periodic pass still settles receipts and checks release independently.
    // It does not consume the ownership-derived fatal reason.
    const ownershipUnused = periodic && closedPeriodicOwnershipIsUnused({
        current, settings, raw, remotePolicy, operation, scope: scope ?? global.RemoteMining?.[remoteId], clock,
        nativeState: empire.remoteMining?.nativeEconomicOps
    });
    const nativeFailure = ownershipUnused ? null :
        resolveNativeEconomicOwnership({
            nativeState: empire.remoteMining?.nativeEconomicOps,
            nativeSettings: remotePolicy.nativeTrialOps,
            economicState: empire.remoteMining?.economicTrials,
            economicSettings: settings,
            profile: { remoteId },
            clock
        })?.failure || null;
    const fatalReason =
        nativeFailure ||
        (!normalized?.valid
            ? 'config_invalid'
            : !raw.enabled || raw.hold || !remotePolicy.enabled
              ? 'manual_hold'
              : homeDanger
                ? 'home_danger'
                : remoteDanger
                  ? 'danger'
                  : foreign
                    ? 'foreign_control'
                    : null);
    return {
        guardEnabled: settings?.enabled === true,
        request: settings?.request || null,
        nativeRelease: resolveNativeSuccessorRelease({
            nativeState: empire.remoteMining?.nativeEconomicOps, nativeSettings: remotePolicy.nativeTrialOps,
            economicState: empire.remoteMining?.economicTrials, request: settings?.request, clock
        }),
        remoteId,
        baseRoom,
        targetRoom,
        epoch: operation?.epoch ?? settings?.request?.epoch,
        configFingerprint: fingerprint,
        controlSafe:
            policy.goalPlanning.enabled === false &&
            policy.roomGovernor.shadow === true &&
            policy.scheduler.enforce === false &&
            empire.market?.enabled === false,
        isolated:
            normalized?.valid === true &&
            !!raw.sourceId &&
            raw.allowContainerBuild === true &&
            raw.reserveController === false &&
            limits.scout === 1 &&
            limits.remoteMiner === 1 &&
            limits.remoteHauler === 1 &&
            limits.reserver === 0 &&
            remotePolicy.maxOperations === 1 &&
            Object.entries(empire.remoteRooms).every(([name, value]) => !value?.enabled || name === targetRoom),
        homeHealthy:
            !!home?.controller?.my &&
            !homeDanger &&
            recovery?.mode === 'normal' &&
            recovery.coreUsable?.miner >= 1 &&
            recovery.coreUsable?.hauler >= 1 &&
            home.controller.ticksToDowngrade >= Math.max(5000, policy.capabilityControl.controllerEmergencyTicks) &&
            Object.values(Game.spawns).some(
                (spawn) => spawn.room.name === baseRoom && (!spawn.isActive || spawn.isActive())
            ),
        receiverFree: receiver?.store.getFreeCapacity(RESOURCE_ENERGY) ?? null,
        receiverId: receiver?.id,
        budgetSafe:
            remotePolicy.spawnEnergyLimit === 2000 &&
            remotePolicy.infrastructureEnergyLimit === 6000 &&
            remotePolicy.windowTicks === 1000 &&
            remotePolicy.safeStreakTicks === 100 &&
            remotePolicy.maxLegTicks === 300 &&
            remotePolicy.bodyEnergyLimits.scout === 50 &&
            remotePolicy.bodyEnergyLimits.remoteMiner === 800 &&
            remotePolicy.bodyEnergyLimits.remoteHauler === 800 &&
            !scope?.facts?.budgetStatus?.spawnExhausted &&
            !scope?.facts?.budgetStatus?.infrastructureExhausted &&
            !grants.some((grant) => grant.unknownReported),
        oldActors: population.length > 0 || actors.length > 0,
        unsettled:
            grants.length > 0 ||
            infraPending.length > 0 ||
            !!current?.outbox?.some((item) => item.stage !== 'applied') ||
            (!!current?.infrastructureAttempt && current.infrastructureAttempt.stage !== 'applied') ||
            !!current?.failedHandoff ||
            Object.values(current?.slots || {}).some(
                (slot) =>
                    slot.unknownUpperBound > 0 ||
                    slot.ledgerStage === 'applying' ||
                    ['not_started', 'call_started'].includes(slot.callState)
            ),
        reconLocked,
        fatalReason,
        movementFailure: expiredMovement(actors, current, operation, clock),
        scopeFresh,
        remoteVisible: !!remote,
        upcomingNames: population
            .filter((entry) => ['accepted', 'spawning'].includes(entry.state))
            .map((entry) => entry.name),
        remoteSafe: !!remote && !remoteDanger && !foreign && !homeDanger,
        sourceValid,
        routeValid: scopeFresh ? (scope.facts.economicRoute?.valid ?? false) : null,
        containerReady: scopeFresh && !!scope.facts.container,
        containerId: scopeFresh ? scope.facts.container?.id : null,
        containerEnergy: scopeFresh ? (scope.facts.container?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) : null,
        sourceId: raw?.sourceId,
        containerPos: point,
        closed:
            !!raw &&
            !raw.enabled &&
            raw.hold === true &&
            !remotePolicy.enabled &&
            operation?.allowRecon !== true &&
            operation?.allowEconomicDeparture !== true,
        actors: actors.map((actor) => ({
            name: actor.name,
            role: actor.memory.role,
            epoch: actor.memory.epoch,
            trialId: actor.memory.economicTrialId,
            sequence: actor.memory.economicTrialSequence,
            spawning: !!actor.spawning,
            pos: { x: actor.pos.x, y: actor.pos.y, roomName: actor.pos.roomName },
            hasMove: actor.getActiveBodyparts(MOVE) > 0,
            leg: actor.memory.remoteLeg,
            body: actor.body.map((part) => part.type),
            energy: actor.store.getUsedCapacity(RESOURCE_ENERGY)
        })),
        receipts: budget?.receipts || {},
        grants,
        infrastructurePending: infraPending
    };
}
