const {createNativeEconomicOpsFixture} = require('./native-economic-ops-fixture.cjs');

async function createAdmissionModelFixture() {
    const model = await import('../../services/RemoteEconomicTrialModel.js');
    const clock = (tick = 101) => ({tick, nowMs: 1000000 + tick - 101, codeVersion: 'econ-v1'});
    const request = {schemaVersion: 1, action: 'start', id: 'econ-one', sequence: 1,
        remoteId: 'W1N1:W1N2', epoch: 1, codeVersion: 'econ-v1', activateAtTick: 101,
        expiresAtTick: 1101, issuedAtMs: 1000000, expiresAtMs: 6400000, configFingerprint: 'config-A'};
    const facts = {guardEnabled: true, request, configFingerprint: 'config-A', remoteId: request.remoteId,
        baseRoom: 'W1N1', targetRoom: 'W1N2', epoch: 1, controlSafe: true, isolated: true,
        homeHealthy: true, receiverFree: 300000, budgetSafe: true, oldActors: false,
        unsettled: false, reconLocked: false, scopeFresh: true, remoteVisible: false, actors: []};
    let state = model.advanceEconomicTrial(undefined, {kind: 'evaluate'}, facts, clock()).state;
    state = model.advanceEconomicTrial(state, {kind: 'scope_observed'}, facts, clock()).state;
    const context = {...state.current.identity, role: 'scout', requestId: 'request-one', grantId: 'request-one',
        deadline: 106, baseRoom: 'W1N1', name: 'ScoutOne', spawnName: 'Spawn1', body: ['move'], bodyCost: 50};
    const event = kind => ({kind, role: 'scout', context: structuredClone(context)});
    return {model, state, facts, clock, context, event};
}

async function createAdmissionFixture({spawnCount = 1, containerBuilt = false} = {}) {
    const s = await createNativeEconomicOpsFixture({nativeOps: true, nativeMovement: true, nativePositions: true, containerBuilt});
    const scene = s.scene;
    if (spawnCount === 1) delete Game.spawns.Spawn2;
    const advance = patch => s.advance(patch);
    const toSafe99 = () => {
        s.submit();
        for (let i = 0; i < 25 && scene.current?.identity.trialId !== 'native-econ-one'; i++) advance();
        for (let i = 0; i < 400 && scene.current.safeStreak < 99 && !scene.current.outcome; i++) advance();
        if (scene.current.safeStreak !== 99) throw new Error('Real admission fixture did not reach safe99');
    };
    const retireHomeHaulers = () => {
        Game.creeps.CoreHaulerB.ticksToLive = 1;
        Game.creeps.CoreHaulerC.ticksToLive = 1;
    };
    return {s, scene, toSafe99, retireHomeHaulers, advance};
}
// Adapter unit input only. Full service-chain acceptance uses createAdmissionFixture.
async function createAdmissionAdapterFixture() {
    const {createEconomicTrialFixture} = require('./economic-trial-fixture.cjs');
    const scene = await createEconomicTrialFixture(); scene.runTick();
    const f = await createAdmissionModelFixture();
    Game.time = 101; scene.setNowMs(1000000);
    const policy = Memory.empire.control.policy.remoteMining, raw = Memory.empire.remoteRooms.W1N2;
    policy.enabled = true; raw.enabled = true; raw.hold = false;
    const {economicTrialConfigFingerprint} = await import('../../services/RemoteEconomicTrialConfig.js');
    const fingerprint = economicTrialConfigFingerprint(raw, policy, 'W1N2');
    Object.assign(f.state.current, {configFingerprint: fingerprint, sourceId: 'remoteSourceA', receiverId: 'HomeSink', containerPos: raw.containerPos});
    policy.economicTrial = {enabled: true, request: {...f.facts.request, configFingerprint: fingerprint}};
    Memory.empire.remoteMining.economicTrials = f.state;
    const scope = global.RemoteMining['W1N1:W1N2'];
    Object.assign(scope.operation, {evaluatedAt: 101, status: 'discovering', allowRecon: true});
    Object.assign(scope.operation.config, {enabled: true, hold: false});
    Object.assign(scope.state, {allowRecon: true, allowEconomicDeparture: false});
    scope.facts.homeHealthy = true;
    scene.f.services.find(service => service.name === 'RemoteEconomicTrial').init();
    const data = {roomName: 'W1N1', role: 'scout', body: ['move'], memory: {role: 'scout', homeRoom: 'W1N1', targetRoom: 'W1N2',
        sourceId: 'remoteSourceA', remoteId: 'W1N1:W1N2', epoch: 1, quotaKey: 'scout:W1N1:W1N2'}};
    return {scene, scope, data, clock: f.clock, api: await import('../../services/RemoteEconomicTrialService.js')};
}
module.exports = {createAdmissionModelFixture, createAdmissionFixture, createAdmissionAdapterFixture};
