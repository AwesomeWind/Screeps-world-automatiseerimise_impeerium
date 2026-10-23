const {test} = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../services/NativeEconomicTrialOpsEvidence.js').catch(e => e.code === 'ERR_MODULE_NOT_FOUND' ? {} : Promise.reject(e));
test('native_ops_evidence_does_not_inherit_old_cost', async () => {
    const {summarizeNativeEconomicOps: summarize} = await load();
    assert.equal(typeof summarize, 'function');
    const {protocolScene} = require('./helpers/native-economic-ops-protocol.cjs');
    const s = await protocolScene(); s.evaluate();
    const before = JSON.stringify([s.state, s.scene.state]);
    const value = summarize(s.state, s.scene.state, s.clock());
    assert.equal(value.current.economic, null);
    assert.equal(value.current.controlClosureConfirmed, false);
    assert.equal(JSON.stringify([s.state, s.scene.state]), before);
});
test('native_ops_evidence_unknown_schema_preserved', async () => {
    const {summarizeNativeEconomicOps: summarize} = await load();
    assert.equal(typeof summarize, 'function');
    const raw = {schemaVersion: 99};
    assert.equal(summarize(raw, undefined, {}).status, 'state_invalid');
    assert.deepEqual(raw, {schemaVersion: 99});
});
