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
import { nativeParentEvidenceMatches } from './NativeEconomicTrialOpsSuccessorProtocol.js';

function budgetSpent(buckets, tick) {
    if (
        !Array.isArray(buckets) ||
        buckets.some((b) => !record(b) || !integer(b.start) || !integer(b.amount) || b.start > tick)
    )
        return null;
    return buckets.filter((b) => b.start + 50 > tick - 1000).reduce((sum, b) => sum + b.amount, 0);
}

export function collectNativeSuccessorFacts(profile, clock) {
    const facts = collectNativeEconomicOpsFacts(profile, clock);
    const empire = Memory.empire,
        remote = empire.remoteMining,
        native = remote?.nativeEconomicOps;
    const ledger = remote?.operations?.[profile.remoteId]?.ledger;
    const q = facts.settings?.request;
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
        nativeParentEvidenceMatches(q, native, facts.economicState) &&
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
    const valid = parentValid && reasons.length === 0;
    return {
        ...facts,
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
