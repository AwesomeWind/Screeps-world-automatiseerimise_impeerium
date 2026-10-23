const {createEconomicTrialFixture} = require('./economic-trial-fixture.cjs');
async function createNativeEconomicOpsFixture(options = {}) {
    const baseRoom = options.roomNames?.base || 'W1N1';
    const targetRoom = options.roomNames?.target || 'W1N2';
    const remoteId = baseRoom + ':' + targetRoom;
    const {NATIVE_OPS_PROFILE} = await import('../../services/NativeEconomicTrialOpsProfile.js');
    const {economicTrialConfigFingerprint} = await import('../../services/RemoteEconomicTrialConfig.js');
    const opts = {...options};
    const scene = await createEconomicTrialFixture(opts);
    scene.runTick();
    const profile = structuredClone(NATIVE_OPS_PROFILE);
    Object.assign(profile, {baseRoom: baseRoom, targetRoom: targetRoom, remoteId: remoteId,
        sourceId: 'remoteSourceA', receiverId: 'HomeSink', containerPos: {x: 20, y: 20, roomName: targetRoom}});
    const config = Memory.empire.remoteRooms[targetRoom];
    if (options.containerBuilt === false) {
        config.containerId = null;
        scene.f.operation.config.containerId = null;
    }
    Object.assign(profile.oldCurrent, {baseRoom: profile.baseRoom, targetRoom: profile.targetRoom,
        sourceId: profile.sourceId, receiverId: profile.receiverId, containerPos: profile.containerPos});
    profile.oldCurrent.identity.remoteId = profile.remoteId;
    profile.oldCurrent.identity.epoch = 1;
    for (const slot of Object.values(profile.oldCurrent.slots)) if (slot.receiptBinding) {
        slot.receiptBinding.identity = structuredClone(profile.oldCurrent.identity);
    }
    profile.oldCurrent.configFingerprint = economicTrialConfigFingerprint(config, Memory.empire.control.policy.remoteMining, profile.targetRoom);
    profile.oldPreparation.remoteId = profile.remoteId;
    profile.oldPreparation.epoch = 1;
    profile.oldReconIdentity.remoteId = profile.remoteId;
    profile.oldReconRequest.remoteId = profile.remoteId;
    profile.oldReconCurrent.identity.remoteId = profile.remoteId;
    if (profile.oldReconCurrent.settlementBinding) profile.oldReconCurrent.settlementBinding.identity.remoteId = profile.remoteId;
    Object.assign(profile.oldReconCurrent, {baseRoom: profile.baseRoom, targetRoom: profile.targetRoom});
    const remote = Memory.empire.remoteMining;
    remote.economicTrials = {schemaVersion: 1, lastSequence: 1, current: structuredClone(profile.oldCurrent), previous: null};
    remote.reconTrials = {schemaVersion: 1, lastSequence: profile.oldReconLastSequence,
        current: structuredClone(profile.oldReconCurrent), previous: null};
    const policy = Memory.empire.control.policy.remoteMining;
    policy.reconTrial = {enabled: true, request: structuredClone(profile.oldReconRequest)};
    policy.economicTrial = {enabled: false, request: structuredClone(profile.oldPreparation)};
    Game.time = profile.oldCurrent.closureVerifiedAtTick + 100;
    let nowMs = profile.oldCurrent.expiresAtMs + 100000;
    scene.setNowMs(nowMs);
    global.RoomPhase[baseRoom].recovery.coreUpcoming = {miner: 0, hauler: 0};
    global.RoomPhase[baseRoom].recovery.evaluatedAt = Game.time;
    opts.nativeOpsProfile = profile;
    scene.resetRuntime();
    const clock = () => ({tick: Game.time, nowMs, codeVersion: global.EmpireServicesVersion});
    const makeRequest = (extra = {}) => ({schemaVersion: 1, id: 'native-one', profileId: profile.id,
        codeVersion: global.EmpireServicesVersion, oldIdentity: structuredClone(profile.oldCurrent.identity),
        expectedLastSequence: 1, trialId: 'native-econ-one', releaseSequence: 2, startSequence: 3,
        issuedAtMs: nowMs, stopAtMs: nowMs + 5280000, notAfterMs: nowMs + 5400000,
        acceptNotBeforeTick: Game.time, acceptNotAfterTick: Game.time + 10,
        allowSupersedeKnownClosedPreparation: true, allowEconomicRelease: true, allowStart: true, allowHold: true, ...extra});
    return {scene, profile, clock, makeRequest, opts,
        setNowMs(value) {nowMs = value; scene.setNowMs(value);},
        advance(patch = {}) {
            if (patch.nowMs !== undefined) nowMs = patch.nowMs;
            global.RoomPhase[baseRoom].recovery.evaluatedAt = Game.time + 1;
            scene.advance(patch);
        },
        submit(extra) {policy.nativeTrialOps = {enabled: true, request: makeRequest(extra)};}};
}
module.exports = {createNativeEconomicOpsFixture};
