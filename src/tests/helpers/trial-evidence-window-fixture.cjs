const {createNativeEconomicOpsFixture} = require('./native-economic-ops-fixture.cjs');

async function admittedEvidenceInputs(options = {}) {
    const f = await createNativeEconomicOpsFixture({nativeOps: true, nativeMovement: true, nativePositions: true, ...options});
    const clock = f.clock();
    f.submit();
    for (let index = 0; index < 30 && !Memory.empire.remoteMining.nativeEconomicOps?.current?.admittedIdentity; index++) f.advance();
    const nativeState = Memory.empire.remoteMining.nativeEconomicOps;
    if (!nativeState?.current?.admittedIdentity) throw new Error('native fixture did not actually admit');
    const economicState = f.scene.state;
    const {EVIDENCE_PROFILE} = await import('../../services/TrialEvidenceWindowModel.js');
    const profile = {...EVIDENCE_PROFILE, baseRoom: f.profile.baseRoom, targetRoom: f.profile.targetRoom,
        remoteId: f.profile.remoteId, sourceId: f.profile.sourceId, containerPos: f.profile.containerPos};
    const request = {schemaVersion: 1, id: 'window-one', nativeId: nativeState.current.request.id,
        identity: structuredClone(economicState.current.identity), profileId: profile.id,
        issuedAtMs: clock.nowMs, expiresAtMs: clock.nowMs + 5400000,
        acceptNotBeforeTick: clock.tick, acceptNotAfterTick: clock.tick + 10};
    return {f, profile, clock, admittedClock: f.clock(), request, admission: structuredClone({economicState, nativeState,
        startRequest: Memory.empire.control.policy.remoteMining.economicTrial.request})};
}
module.exports = {admittedEvidenceInputs};

async function createTrialEvidenceFixture(options = {}) {
    const logs = new Map(), applied = [], eventCalls = [];
    const x = await createNativeEconomicOpsFixture({nativeOps: true, ...options,
        onAppliedAction(item) {
            applied.push({tick: item.tick, method: item.method, delta: item.energyDelta});
            if (!['harvest', 'transfer'].includes(item.method) || !item.energyDelta) return;
            const room = item.actor.pos.roomName, entries = logs.get(room) || [];
            entries.push({event: item.method === 'harvest' ? 5 : 12, objectId: item.actor.id,
                data: {targetId: item.target.id, amount: Math.abs(item.energyDelta),
                    ...(item.method === 'transfer' ? {resourceType: 'energy'} : {})}});
            logs.set(room, entries);
        }});
    const {default: Observer} = await import('../../services/TrialEvidenceWindowService.js');
    const {EVIDENCE_PROFILE} = await import('../../services/TrialEvidenceWindowModel.js');
    const profile = {...EVIDENCE_PROFILE, baseRoom: x.profile.baseRoom, targetRoom: x.profile.targetRoom,
        remoteId: x.profile.remoteId, sourceId: x.profile.sourceId, containerPos: x.profile.containerPos};
    let observer;
    const attach = () => {
        for (const room of [x.scene.f.home, x.scene.f.remote]) room.getEventLog = () => {
            eventCalls.push({tick: Game.time, room: room.name});
            return logs.get(room.name) || [];
        };
        observer = new Observer('TrialEvidenceWindow', {profile, now: () => x.clock().nowMs,
            ...options.observerOptions, factsDeps: {simulatedNativeEvents: true, ...options.observerOptions?.factsDeps}});
        x.scene.f.services.push(observer);
    };
    attach();
    return {x, profile, applied, eventCalls, logs,
        get observer() {return observer;},
        submit(enabled = true) {
            const native = x.makeRequest(), clock = x.clock();
            const request = {schemaVersion: 1, id: 'window-one', nativeId: native.id,
                identity: {trialId: native.trialId, sequence: native.startSequence, remoteId: profile.remoteId,
                    epoch: native.oldIdentity.epoch, codeVersion: native.codeVersion}, profileId: profile.id,
                issuedAtMs: clock.nowMs, expiresAtMs: clock.nowMs + 5400000,
                acceptNotBeforeTick: clock.tick, acceptNotAfterTick: clock.tick + 10};
            Memory.empire.control.policy.remoteMining.evidenceWindow = {enabled, request};
            // The explicit arm step precedes native submission; no economic action is supplied by the observer.
            observer.cleanup();
            x.submit();
        },
        advance(patch = {}) {logs.clear(); x.advance(patch);},
        restoreMemory() {x.scene.restoreMemory(); attach();},
        get window() {return Memory.empire.remoteMining.evidenceWindows?.current;}
    };
}
module.exports.createTrialEvidenceFixture = createTrialEvidenceFixture;
