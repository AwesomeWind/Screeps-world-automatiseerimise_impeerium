import { currentCreepPopulation } from '../core/CreepPopulation.js';
import { validEconomicTrialState, economicIdentityMatches } from './RemoteEconomicTrialModel.js';
import { reconTrialPermission } from './RemoteReconTrialModel.js';
import { economicTrialConfigFingerprint } from './RemoteEconomicTrialConfig.js';
import {
    nativeOpsCopy as copy,
    nativeOpsEqual as equal,
    nativeOpsRecord as record,
    nativeOpsInteger as integer
} from './NativeEconomicTrialOpsProfile.js';
import { validNativeEconomicOpsState } from './NativeEconomicTrialOpsModel.js';
import { nativeSuccessorParentMatches, validateNativeSuccessorRequest } from './NativeEconomicTrialOpsSuccessorProtocol.js';

function budgetSpent(buckets, tick) {
    if (
        !Array.isArray(buckets) ||
        buckets.some((b) => !record(b) || !integer(b.start) || !integer(b.amount) || b.start > tick)
    )
        return null;
    return buckets.filter((b) => b.start + 50 > tick - 1000).reduce((sum, b) => sum + b.amount, 0);
}

function packedTerminalIsIdle(empire, state, profile, clock) {
    const c = state.current, remote = empire.remoteMining, p = empire.control?.policy?.remoteMining;
    const economic = remote?.economicTrials, session = economic?.current;
    const config = empire.remoteRooms?.[profile.targetRoom], operation = remote?.operations?.[profile.remoteId];
    const scope = global.RemoteMining?.[profile.remoteId];
    if (c?.stage !== 'terminal' || !c.outcome || c.unknownEffect || !record(c.intents) ||
        Object.values(c.intents).some(intent => ['planned', 'unknown'].includes(intent?.status)) ||
        p?.nativeTrialOps?.enabled !== false || !equal(p.nativeTrialOps.request, c.request) ||
        !integer(c.lastTick) || c.lastTick > clock.tick || !integer(c.lastNowMs) || c.lastNowMs > clock.nowMs ||
        p.enabled !== false || config?.enabled !== false || config.hold !== true ||
        operation?.allowRecon !== false || operation.allowEconomicDeparture !== false ||
        scope?.state?.allowRecon === true || scope?.state?.allowEconomicDeparture === true ||
        !validEconomicTrialState(economic) || session?.status !== 'terminal' || !session.outcome ||
        !integer(session.closeAppliedAtTick) || session.closureVerifiedAtTick <= session.closeAppliedAtTick)
        return false;

    // With no staged start or unfinished owned closure, periodic Native work cannot authorize an action.
    return c.admittedIdentity
        ? c.controlClosureConfirmed === true && economicIdentityMatches(c.admittedIdentity, session.identity) &&
            equal(p.economicTrial?.request, c.startRequest)
        : c.startRequest === null && economicIdentityMatches(c.request?.parent?.identity, session.identity) &&
            (p.economicTrial?.enabled === false ||
                (p.economicTrial?.request?.action === 'start' &&
                    p.economicTrial.request.id === session.identity.trialId &&
                    p.economicTrial.request.expiresAtTick < clock.tick && p.economicTrial.request.expiresAtMs < clock.nowMs));
}

/** Recognize a disabled terminal run with no remaining periodic work. */
export function nativeSuccessorIsIdle(empire, state, profile, clock) {
    if (state?.packedParent) return packedTerminalIsIdle(empire, state, profile, clock);
    const current = state?.current;
    const request = current?.request;
    const policy = empire.control?.policy?.remoteMining;
    const settings = policy?.nativeTrialOps;
    if (state?.schemaVersion !== 2 || current?.stage !== 'terminal' || !request?.unadmitted ||
        !current.outcome || current.admittedIdentity !== null || current.releaseRequest !== null ||
        current.startRequest !== null || current.controlClosureConfirmed === true ||
        (current.unknownEffect !== undefined && current.unknownEffect !== false) ||
        !record(current.intents) || Object.keys(current.intents).length !== 0 ||
        settings?.enabled !== false || !equal(settings.request, request) ||
        !integer(current.lastTick) || current.lastTick > clock.tick ||
        !integer(current.lastNowMs) || !integer(clock.nowMs) || current.lastNowMs > clock.nowMs ||
        !integer(current.outcome.decidedAtTick) || current.outcome.decidedAtTick > current.lastTick)
        return false;

    const originalClock = {tick: request.acceptNotBeforeTick, nowMs: request.issuedAtMs, codeVersion: request.codeVersion};
    if (state.lastAcceptedStartSequence !== request.startSequence ||
        !validateNativeSuccessorRequest(request, profile, originalClock).valid)
        return false;

    const remote = empire.remoteMining;
    const economic = remote.economicTrials;
    const parent = economic?.current;
    const parentProof = request.parent;
    const config = empire.remoteRooms?.[profile.targetRoom];
    const operation = remote.operations?.[profile.remoteId];
    const scope = global.RemoteMining?.[profile.remoteId];
    if (!validEconomicTrialState(economic) || !parent?.managed || parent.status !== 'terminal' ||
        parent.identity.remoteId !== profile.remoteId ||
        !economicIdentityMatches(parent.identity, parentProof?.identity) ||
        economic.lastSequence !== parent.identity.sequence ||
        parent.closureVerifiedAtTick !== parentProof.closureVerifiedAtTick ||
        !integer(parent.closeAppliedAtTick) || parent.closureVerifiedAtTick <= parent.closeAppliedAtTick ||
        !integer(parent.tailExpiresAtTick) || parent.tailExpiresAtTick >= clock.tick ||
        policy.enabled !== false || config?.enabled !== false || config.hold !== true ||
        operation?.remoteId !== profile.remoteId || operation.epoch !== parent.identity.epoch ||
        operation.allowRecon !== false || operation.allowEconomicDeparture !== false ||
        scope?.state?.allowRecon === true || scope?.state?.allowEconomicDeparture === true)
        return false;

    const old = policy.economicTrial;
    if (old?.enabled !== false) {
        const release = old?.request;
        const archive = Array.isArray(state.history) ? state.history.at(-1) : null;
        if (old?.enabled !== true || archive?.id !== request.unadmitted.nativeId ||
            !equal(old, archive.settings?.economicTrial) ||
            release?.action !== 'release' || release.remoteId !== profile.remoteId ||
            release.epoch !== parent.identity.epoch || release.targetTrialId !== parent.identity.trialId ||
            release.sequence !== parent.identity.sequence + 1 ||
            !integer(release.activateAtTick) || release.expiresAtTick !== release.activateAtTick + 1000 ||
            !integer(release.issuedAtMs) || release.expiresAtMs !== release.issuedAtMs + 5400000 ||
            release.expiresAtTick >= clock.tick || release.expiresAtMs >= clock.nowMs)
            return false;
    }

    const budget = remote.budgets?.[profile.baseRoom];
    if (!record(budget?.grants) || Object.keys(budget.grants).length ||
        (budget.infrastructure !== undefined &&
            (!record(budget.infrastructure?.pending) || Object.keys(budget.infrastructure.pending).length)) ||
        parent.outbox.some(item => item.stage !== 'applied' || item.evidenceApplied !== true) ||
        parent.failedHandoff ||
        (parent.infrastructureAttempt &&
            (parent.infrastructureAttempt.stage !== 'applied' || parent.infrastructureAttempt.evidenceApplied !== true)) ||
        Object.values(parent.slots).some(slot => slot.admissionStage === 'binding' ||
            ['not_started', 'call_started'].includes(slot.callState) || slot.ledgerStage === 'applying' ||
            (slot.unknownUpperBound ?? 0) !== 0) ||
        ['unknownEvents', 'unknownEnergyUpperBound', 'logisticsUnknownEnergyUpperBound', 'infrastructureUnknownUpperBound'].some(
            key => (parent.evidence?.[key] ?? 0) !== 0
        ) || !record(operation.ledger) ||
        ['spawnEnergyUnknownUpperBound', 'infrastructureEnergyUnknownUpperBound', 'confirmationUnknown'].some(
            key => (operation.ledger[key] ?? 0) !== 0
        ))
        return false;

    const belongsToScope = memory => memory?.remoteId === profile.remoteId || memory?.targetRoom === profile.targetRoom;
    return !Object.values(Game.creeps).some(creep => belongsToScope(creep.memory)) &&
        !currentCreepPopulation().some(entry => entry.state !== 'invalid' && belongsToScope(entry.memory));
}

export function collectNativeSuccessorFacts(profile, clock) {
    const facts = collectNativeEconomicOpsFacts(profile, clock);
    const empire = Memory.empire,
        remote = empire.remoteMining,
        native = remote?.nativeEconomicOps;
    const ledger = remote?.operations?.[profile.remoteId]?.ledger;
    const q = facts.settings?.request;
    const policy = empire.control?.policy;
    const observersClosed = policy?.homeEvidence?.enabled === false && policy?.remoteMining?.evidenceWindow?.enabled === false;
    const bindingPending = Object.values(remote?.economicTrials?.current?.slots || {}).some(
        (slot) => slot.admissionStage === 'binding'
    );
    const rawEvidence = remote?.economicTrials?.current?.evidence;
    const optionalEvidenceKnown =
        record(rawEvidence) &&
        (!Object.hasOwn(rawEvidence, 'logisticsUnknownEnergyUpperBound') ||
            rawEvidence.logisticsUnknownEnergyUpperBound === 0);
    const optionalUnknownKnown =
        record(ledger) &&
        ['spawnEnergyUnknownUpperBound', 'infrastructureEnergyUnknownUpperBound', 'confirmationUnknown'].every(
            (key) => !Object.hasOwn(ledger, key) || ledger[key] === 0
        );
    const parentValid =
        validNativeEconomicOpsState(native) &&
        validEconomicTrialState(facts.economicState) &&
        nativeSuccessorParentMatches(q, native, facts.economicState, facts.economicSettings) &&
        optionalUnknownKnown &&
        optionalEvidenceKnown &&
        integer(native.current.lastTick) &&
        native.current.lastTick <= clock.tick &&
        integer(native.current.lastNowMs) &&
        native.current.lastNowMs <= clock.nowMs &&
        facts.economicState.current.closureVerifiedAtTick <= clock.tick &&
        facts.operationEpoch === q?.parent?.identity?.epoch;
    const reasons = facts.reasons.filter((reason) => reason !== 'preparation_changed');
    if (bindingPending && !reasons.includes('pending_scope')) reasons.push('pending_scope');
    if ((q?.unadmitted || q?.retainedParent) && !observersClosed) reasons.push('observer_open');
    const valid = parentValid && reasons.length === 0;
    return {
        ...facts,
        observersClosed,
        quiet: facts.quiet && !bindingPending,
        ready: valid,
        nativeState: copy(native),
        parentProof: { valid, reason: valid ? null : !parentValid ? 'parent_invalid' : reasons[0] },
        archiveInputs: { economicTrial: copy(facts.economicSettings), nativeTrialOps: copy(facts.settings) }
    };
}

export function collectNativeEconomicOpsFacts(profile, clock) {
    const empire = Memory.empire || {},
        policy = empire.control?.policy || {},
        p = policy.remoteMining || {};
    const remote = empire?.remoteMining,
        config = empire?.remoteRooms?.[profile.targetRoom];
    const economic = remote?.economicTrials,
        operation = remote?.operations?.[profile.remoteId];
    const budget = remote?.budgets?.[profile.baseRoom],
        home = Game.rooms[profile.baseRoom];
    const receiver = Game.getObjectById(profile.receiverId),
        recovery = global.RoomPhase?.[profile.baseRoom]?.recovery;
    const population = currentCreepPopulation().filter(
        (entry) =>
            entry.state !== 'invalid' &&
            (entry.memory.remoteId === profile.remoteId || entry.memory.targetRoom === profile.targetRoom)
    );
    const actors = Object.values(Game.creeps).filter(
        (actor) => actor.memory.remoteId === profile.remoteId || actor.memory.targetRoom === profile.targetRoom
    );
    const grants = record(budget?.grants) ? Object.values(budget.grants) : null;
    const infrastructure = budget?.infrastructure;
    const spawnSpent = budgetSpent(budget?.buckets, clock.tick);
    const infraSpent = infrastructure === undefined ? 0 : budgetSpent(infrastructure.buckets, clock.tick);
    const reasons = [];
    const protectedSafe =
        policy?.goalPlanning?.enabled === false &&
        policy?.roomGovernor?.shadow === true &&
        policy?.scheduler?.enforce === false &&
        empire?.market?.enabled === false;
    if (!protectedSafe) reasons.push('protected_controls');
    const clockFresh = clock.tick === Game.time && recovery?.evaluatedAt === clock.tick;
    if (!clockFresh) reasons.push('facts_stale');
    const fingerprint = config && p && economicTrialConfigFingerprint(config, p, profile.targetRoom);
    const configSafe =
        fingerprint === profile.oldCurrent.configFingerprint &&
        p.maxOperations === 1 &&
        p.budgetBucketTicks === 50 &&
        p.maxGrants === 16 &&
        p.maxReceipts === 16 &&
        Object.entries(empire.remoteRooms).every(([name, value]) => !value?.enabled || name === profile.targetRoom);
    if (!configSafe) reasons.push('config_changed');
    const spawns = Object.values(Game.spawns).filter((spawn) => spawn.room.name === profile.baseRoom);
    const homeHealthy =
        home?.controller?.my === true &&
        home.controller.ticksToDowngrade >=
            Math.max(5000, policy?.capabilityControl?.controllerEmergencyTicks ?? Infinity) &&
        home.find(FIND_HOSTILE_CREEPS).length === 0 &&
        recovery?.mode === 'normal' &&
        ['miner', 'hauler'].every((role) => recovery.coreUsable?.[role] >= 1 && recovery.coreUpcoming?.[role] === 0) &&
        spawns.some((spawn) => !spawn.isActive || spawn.isActive());
    const homeReady =
        homeHealthy && home.energyAvailable >= 50 && spawns.length > 0 && spawns.every((spawn) => !spawn.spawning);
    if (!homeReady) reasons.push('home_unavailable');
    const receiverFree = receiver?.store?.getFreeCapacity(RESOURCE_ENERGY);
    const receiverSafe =
        receiver?.my === true &&
        receiver?.structureType === STRUCTURE_TERMINAL &&
        receiver?.pos?.roomName === profile.baseRoom &&
        Number.isFinite(receiverFree) &&
        receiverFree >= 20000;
    if (!receiverSafe) reasons.push('receiver_unavailable');
    const budgetSafe =
        spawnSpent !== null &&
        infraSpent !== null &&
        spawnSpent < p.spawnEnergyLimit &&
        infraSpent < p.infrastructureEnergyLimit &&
        grants !== null &&
        record(budget.receipts) &&
        (infrastructure === undefined || (record(infrastructure.pending) && record(infrastructure.receipts)));
    if (!budgetSafe) reasons.push('budget_unavailable');
    const validEconomic = validEconomicTrialState(economic);
    const old = economic?.current;
    const accountingKnown =
        validEconomic &&
        record(operation?.ledger) &&
        ['unknownEvents', 'unknownEnergyUpperBound', 'logisticsUnknownEnergyUpperBound'].every(
            (key) => (old?.evidence?.[key] ?? 0) === 0
        ) &&
        ['spawnEnergyUnknownUpperBound', 'infrastructureEnergyUnknownUpperBound', 'confirmationUnknown'].every(
            (key) => (operation?.ledger?.[key] ?? 0) === 0
        ) &&
        !!grants &&
        grants.every((grant) => !grant.unknownReported);
    const unsettled =
        !validEconomic ||
        !record(operation?.ledger) ||
        population.length > 0 ||
        actors.length > 0 ||
        !grants ||
        grants.length > 0 ||
        (infrastructure && (!record(infrastructure.pending) || Object.keys(infrastructure.pending).length > 0)) ||
        old?.outbox?.some((item) => item.stage !== 'applied') ||
        old?.failedHandoff ||
        (old?.infrastructureAttempt && old.infrastructureAttempt.stage !== 'applied') ||
        Object.values(old?.slots || {}).some(
            (slot) =>
                ['not_started', 'call_started'].includes(slot.callState) ||
                slot.ledgerStage === 'applying' ||
                slot.unknownUpperBound > 0
        ) ||
        ['unknownEvents', 'unknownEnergyUpperBound', 'logisticsUnknownEnergyUpperBound'].some(
            (key) => (old?.evidence?.[key] ?? 0) !== 0
        ) ||
        ['spawnEnergyUnknownUpperBound', 'infrastructureEnergyUnknownUpperBound', 'confirmationUnknown'].some(
            (key) => (operation?.ledger?.[key] ?? 0) !== 0
        );
    if (unsettled) reasons.push('pending_scope');
    const recon = remote?.reconTrials,
        reconCurrent = recon?.current;
    const reconReleased =
        reconTrialPermission(recon, {}, clock).reason !== 'state_invalid' &&
        economicIdentityMatches(reconCurrent?.identity, profile.oldReconIdentity) &&
        recon.lastSequence === profile.oldReconLastSequence &&
        reconCurrent.managed === false &&
        ['completed', 'aborted'].includes(reconCurrent.status) &&
        integer(reconCurrent.closeAppliedAtTick) &&
        reconCurrent.closureVerifiedAtTick > reconCurrent.closeAppliedAtTick &&
        reconCurrent.settlementSourceStatus === 'scoped' &&
        reconCurrent.settlement?.unknownUpperBound === 0 &&
        p?.reconTrial?.enabled === true &&
        equal(p.reconTrial.request, profile.oldReconRequest);
    if (!reconReleased) reasons.push('recon_not_released');
    const executionClosed =
        p?.enabled === false &&
        config?.enabled === false &&
        config?.hold === true &&
        operation?.allowRecon === false &&
        operation?.allowEconomicDeparture === false;
    const knownOld =
        validEconomic &&
        economic.lastSequence === profile.oldLastSequence &&
        equal(old, profile.oldCurrent) &&
        p?.economicTrial?.enabled === false &&
        equal(p.economicTrial.request, profile.oldPreparation);
    if (!executionClosed) reasons.push('execution_not_closed');
    if (!knownOld) reasons.push('preparation_changed');
    const scout = validEconomic && old?.slots.scout.name && Game.creeps[old.slots.scout.name];
    const scoutBound =
        scout &&
        scout.memory.economicTrialId === old.identity.trialId &&
        scout.memory.economicTrialSequence === old.identity.sequence &&
        scout.memory.epoch === old.identity.epoch &&
        scout.memory.remoteId === profile.remoteId;
    const freshScope =
        global.RemoteMining?.[profile.remoteId]?.operation === operation && operation?.evaluatedAt === clock.tick;
    const route = freshScope && operation.route?.generatedAt === clock.tick ? operation.route : null;
    return {
        tick: clock.tick,
        nowMs: clock.nowMs,
        version: clock.codeVersion,
        ready: reasons.length === 0,
        reasons,
        protectedSafe,
        clockFresh,
        configSafe,
        fingerprint,
        homeHealthy,
        homeReady,
        receiverSafe,
        budgetSafe,
        accountingKnown,
        quiet: !unsettled,
        reconReleased,
        executionClosed,
        knownOld,
        oldIdentity: copy(profile.oldCurrent.identity),
        settings: copy(p?.nativeTrialOps),
        economicSettings: copy(p?.economicTrial),
        economicState: copy(economic),
        operationEpoch: operation?.epoch,
        actors: population.map((entry) => ({ name: entry.name, state: entry.state })),
        receiverFree: receiverFree ?? null,
        scoutObservation: scoutBound
            ? {
                  spawning: !!scout.spawning,
                  pos: { x: scout.pos.x, y: scout.pos.y, roomName: scout.pos.roomName },
                  sourceVisible: !!Game.rooms[profile.targetRoom] && !!Game.getObjectById(profile.sourceId)
              }
            : null,
        routeObservation: route
            ? copy({
                  valid: route.valid,
                  checkedAt: clock.tick,
                  outboundTicks: route.outboundTicks,
                  inboundTicks: route.inboundTicks,
                  roles: route.roles
              })
            : null
    };
}
