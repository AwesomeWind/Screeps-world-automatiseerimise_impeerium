// Shared test driver for the pure protocol; runtime tests use the actual service instead.
const assert = require('node:assert/strict');
const {createNativeEconomicOpsFixture} = require('./native-economic-ops-fixture.cjs');
async function protocolScene() {
    const s = await createNativeEconomicOpsFixture();
    const m = await import('../../services/NativeEconomicTrialOpsModel.js').catch(e => e.code === 'ERR_MODULE_NOT_FOUND' ? {} : Promise.reject(e));
    assert.equal(typeof m.advanceNativeEconomicOps, 'function', 'persistent native operations reducer must exist');
    const {collectNativeEconomicOpsFacts} = await import('../../services/NativeEconomicTrialOpsFacts.js');
    s.submit();
    let state;
    function evaluate(event = {kind: 'evaluate'}) {
        const result = m.advanceNativeEconomicOps(state, event, collectNativeEconomicOpsFacts(s.profile, s.clock()), s.clock(), s.profile);
        state = result.state; return result;
    }
    function apply(result) {
        for (const effect of result.effects) {
            if (effect.type === 'replace_release_request') Memory.empire.control.policy.remoteMining.economicTrial = {enabled: true, request: effect.request};
            if (effect.type === 'prepare_start') Memory.empire.control.policy.remoteMining.economicTrial = {enabled: false, request: effect.request};
            evaluate({kind: 'effect_result', key: effect.key, result: 'applied'});
        }
    }
    return {...s, m, evaluate, apply, get state() {return state;}, reset() {state = JSON.parse(JSON.stringify(state));}};
}
module.exports = {protocolScene};
