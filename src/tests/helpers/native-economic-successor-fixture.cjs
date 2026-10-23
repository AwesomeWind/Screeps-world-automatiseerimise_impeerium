const assert = require('node:assert/strict');
const { createNativeEconomicOpsFixture } = require('./native-economic-ops-fixture.cjs');

async function createSuccessorFixture(options = {}) {
    const s = await createNativeEconomicOpsFixture({
        nativeOps: true,
        nativePositions: true,
        nativeMovement: true,
        ...options
    });
    const scene = s.scene;
    s.opts.nativeOpsSuccessorProfile = { ...s.profile, id: 'w49n41-w48n41-first-delivery-v2' };
    scene.resetRuntime();
    function toParentTerminal() {
        s.submit();
        for (let i = 0; i < 950 && Memory.empire.remoteMining.nativeEconomicOps?.current?.stage !== 'terminal'; i++)
            s.advance();
        assert.equal(Memory.empire.remoteMining.nativeEconomicOps.current.stage, 'terminal');
        assert.equal(scene.current.outcome.stopReason, 'first_delivery');
        assert.equal(Memory.empire.remoteMining.nativeEconomicOps.current.controlClosureConfirmed, true);
    }
    function retireSettledRemoteActors() {
        assert.equal(scene.current.status, 'terminal');
        assert.equal(scene.current.evidence.unknownEvents, 0);
        assert.equal(Object.keys(Memory.empire.remoteMining.budgets[s.profile.baseRoom].grants).length, 0);
        // Test engine disappearance only. Do not erase Memory, receipts, claims or old costs.
        for (const [name, actor] of Object.entries(Game.creeps))
            if (actor.memory.remoteId === s.profile.remoteId) delete Game.creeps[name];
        s.advance();
    }
    function makeSuccessorRequest(extra = {}) {
        const parent = scene.current,
            native = Memory.empire.remoteMining.nativeEconomicOps.current;
        return {
            schemaVersion: 2,
            id: 'native-next',
            profileId: 'w49n41-w48n41-first-delivery-v2',
            codeVersion: global.EmpireServicesVersion,
            parent: {
                nativeId: native.request.id,
                identity: structuredClone(parent.identity),
                closureVerifiedAtTick: parent.closureVerifiedAtTick,
                settlement: {
                    spawnEnergy: parent.evidence.confirmedSpawnCost,
                    infrastructureEnergy: parent.evidence.confirmedInfrastructureCost,
                    returnedEnergy: parent.evidence.returnedEnergy,
                    unknownEvents: 0,
                    unknownUpperBound: 0
                }
            },
            trialId: 'economic-next',
            releaseSequence: parent.identity.sequence + 1,
            startSequence: parent.identity.sequence + 2,
            issuedAtMs: s.clock().nowMs,
            stopAtMs: s.clock().nowMs + 5280000,
            notAfterMs: s.clock().nowMs + 5400000,
            acceptNotBeforeTick: Game.time,
            acceptNotAfterTick: Game.time + 10,
            allowParentArchive: true,
            allowEconomicRelease: true,
            allowStart: true,
            allowHold: true,
            ...extra
        };
    }
    return {
        s,
        scene,
        toParentTerminal,
        retireSettledRemoteActors,
        makeSuccessorRequest,
        submitSuccessor(q = makeSuccessorRequest()) {
            Memory.empire.control.policy.remoteMining.nativeTrialOps = { enabled: true, request: q };
            return q;
        },
        advance: s.advance,
        restoreMemory: scene.restoreMemory
    };
}
module.exports = { createSuccessorFixture };
