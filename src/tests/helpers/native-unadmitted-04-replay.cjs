
const { createRelease04Replay } = require('./native-release-04-replay.cjs');
const closed = require('../fixtures/native-unadmitted-04-terminal.json');

async function createUnadmitted04Replay() {
    const r = await createRelease04Replay();
    const protocol = await import('../../services/NativeEconomicTrialOpsSuccessorProtocol.js');
    const model = await import('../../services/NativeEconomicTrialOpsSuccessorModel.js');
    const native = { ...r.state, current: r.stopped };
    const economic = { ...r.parent.economic, lastRejection: structuredClone(closed.economicLastRejection) };
    const clock = { tick: closed.tick, nowMs: Math.max(closed.nowMs, native.current.request.notAfterMs + 1), codeVersion: closed.version };
    const q = { ...structuredClone(native.current.request), id: 'nops-w48-20261106-05', trialId: 'econ-w48-20261106-05',
        codeVersion: clock.codeVersion, releaseSequence: 10, startSequence: 11,
        unadmitted: { nativeId: native.current.request.id, highWater: native.lastAcceptedStartSequence },
        issuedAtMs: clock.nowMs, stopAtMs: clock.nowMs + 5280000, notAfterMs: clock.nowMs + 5400000,
        acceptNotBeforeTick: clock.tick, acceptNotAfterTick: clock.tick + 10 };
    const settings = { enabled: true, request: q };
    const facts = { ...r.facts, observersClosed: true, settings, economicSettings: closed.economicSettings, economicState: economic,
        nativeState: native, archiveInputs: { economicTrial: closed.economicSettings, nativeTrialOps: settings } };
    return { protocol, model, native, economic, q, clock, facts, closed };
}

module.exports = { createUnadmitted04Replay };
