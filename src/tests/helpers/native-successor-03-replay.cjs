
const assert = require('node:assert/strict');
const frozen = require('../fixtures/native-successor-03-terminal.json');

async function createTerminal03Replay() {
    const protocol = await import('../../services/NativeEconomicTrialOpsSuccessorProtocol.js');
    const model = await import('../../services/NativeEconomicTrialOpsSuccessorModel.js');
    const { advanceEconomicTrial } = await import('../../services/RemoteEconomicTrialModel.js');
    const { resolveNativeSuccessorRelease } = await import('../../services/NativeEconomicTrialOpsOwnership.js');
    const old = structuredClone(frozen);
    const parent = old.economic.current;
    const profile = protocol.NATIVE_SUCCESSOR_PROFILE;
    const clock = { tick: parent.tailExpiresAtTick + 1, nowMs: old.native.current.lastNowMs + 900000, codeVersion: old.version };
    const request = {
        schemaVersion: 2, id: 'nops-w48-20261105-04', profileId: profile.id, codeVersion: clock.codeVersion,
        parent: {
            nativeId: old.native.current.request.id, identity: structuredClone(parent.identity),
            closureVerifiedAtTick: parent.closureVerifiedAtTick,
            settlement: {
                spawnEnergy: parent.evidence.confirmedSpawnCost,
                infrastructureEnergy: parent.evidence.confirmedInfrastructureCost,
                returnedEnergy: parent.evidence.returnedEnergy, unknownEvents: parent.evidence.unknownEvents,
                unknownUpperBound: parent.evidence.unknownEnergyUpperBound
            }
        },
        trialId: 'econ-w48-20261105-04', releaseSequence: 8, startSequence: 9,
        issuedAtMs: clock.nowMs, stopAtMs: clock.nowMs + 5280000, notAfterMs: clock.nowMs + 5400000,
        acceptNotBeforeTick: clock.tick, acceptNotAfterTick: clock.tick + 10,
        allowParentArchive: true, allowEconomicRelease: true, allowStart: true, allowHold: true
    };
    const settings = { enabled: true, request };
    const facts = {
        settings, nativeState: old.native, economicState: old.economic, economicSettings: old.economicSettings,
        parentProof: { valid: protocol.nativeParentEvidenceMatches(request, old.native, old.economic), reason: 'parent_invalid' },
        archiveInputs: { economicTrial: old.economicSettings, nativeTrialOps: settings },
        executionClosed: true, quiet: true, homeReady: true, receiverSafe: true, budgetSafe: true, reconReleased: true,
        protectedSafe: true, configSafe: true, clockFresh: true, accountingKnown: true, operationEpoch: parent.identity.epoch
    };
    const advance = (state = old.native, event = { kind: 'evaluate' }) =>
        model.advanceNativeSuccessor(state, event, facts, clock, profile);
    const tick = () => { clock.tick++; clock.nowMs += 1000; };

    function switchToChild(admitted) {
        let state = admitted.state;
        const effects = [];
        function apply(expected) {
            const step = advance(state);
            assert.deepEqual(step.effects.map(e => e.type), [expected]);
            const [effect] = step.effects;
            effects.push(effect.type);
            facts.economicSettings = { enabled: effect.type !== 'prepare_start', request: effect.request };
            state = advance(step.state, { kind: 'effect_result', key: effect.key, result: 'applied' }).state;
        }
        function evaluateEconomic(closed) {
            const result = advanceEconomicTrial(facts.economicState, { kind: 'evaluate' }, {
                request: facts.economicSettings.request, guardEnabled: true, closed,
                nativeRelease: resolveNativeSuccessorRelease({ nativeState: state, nativeSettings: settings,
                    economicState: facts.economicState, request: facts.economicSettings.request, clock }),
                baseRoom: parent.baseRoom, targetRoom: parent.targetRoom, remoteId: parent.identity.remoteId,
                epoch: parent.identity.epoch, configFingerprint: parent.configFingerprint,
                receiverId: parent.receiverId, sourceId: parent.sourceId, containerPos: parent.containerPos,
                controlSafe: true, isolated: true, homeHealthy: true, receiverFree: 300000, budgetSafe: true
            }, clock);
            assert.deepEqual(result.effects, []);
            facts.economicState = result.state;
        }
        tick();
        apply('replace_release_request');
        tick();
        state = advance(state).state;
        evaluateEconomic(true);
        assert.equal(facts.economicState.lastSequence, 8);
        assert.deepEqual(facts.economicState.current, { ...parent, managed: false });
        tick();
        apply('prepare_start');
        tick();
        apply('activate_start');
        evaluateEconomic(false);
        assert.equal(facts.economicState.lastSequence, 9);
        assert.equal(facts.economicState.current.safeStreak, 0);
        state = advance(state, { kind: 'end_tick' }).state;
        assert.equal(state.current.stage, 'observing');
        return { state, effects };
    }
    return { protocol, model, old, clock, request, facts, advance, switchToChild };
}

module.exports = { createTerminal03Replay };
