
const assert = require('node:assert/strict');
const frozen = require('../fixtures/native-successor-03-terminal.json');
const captured = require('../fixtures/native-release-04-clock.json');

async function createRelease04Replay() {
    const parent = structuredClone(frozen);
    const { written, stopped } = structuredClone(captured);
    const protocol = await import('../../services/NativeEconomicTrialOpsSuccessorProtocol.js');
    const model = await import('../../services/NativeEconomicTrialOpsSuccessorModel.js');
    const settings = { enabled: true, request: written.request };
    const economicSettings = { enabled: true, request: written.releaseRequest };
    const archive = protocol.createNativeParentArchive(parent.native, parent.economic,
        { economicTrial: parent.economicSettings, nativeTrialOps: settings }, { tick: captured.archivedAtTick });
    const state = {
        schemaVersion: 2, lastAcceptedStartSequence: 9, current: written, previous: parent.native.current,
        history: [...parent.native.history, archive], rejections: parent.native.rejections
    };
    const facts = {
        settings, economicSettings, economicState: parent.economic, parentProof: { valid: true },
        operationEpoch: 2, protectedSafe: true, clockFresh: true, configSafe: true, accountingKnown: true,
        executionClosed: true, quiet: true, homeReady: true, receiverSafe: true, budgetSafe: true, reconReleased: true
    };
    const clock = (tick, nowMs) => ({ tick, nowMs, codeVersion: captured.version });
    const evaluate = (tick, nowMs, input = state, extraFacts = {}) => model.advanceNativeSuccessor(
        input, { kind: 'evaluate' }, { ...facts, ...extraFacts }, clock(tick, nowMs), protocol.NATIVE_SUCCESSOR_PROFILE
    );
    assert.equal(model.validNativeSuccessorState(state), true);
    return { parent, written, stopped, state, facts, clock, evaluate };
}

module.exports = { createRelease04Replay };
