const {test} = require('node:test');
const assert = require('node:assert/strict');
const profileModule = () => import('../services/NativeEconomicTrialOpsProfile.js').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
});
function request(profile, extra = {}) {
    return {schemaVersion: 1, id: 'native-one', profileId: profile.id, codeVersion: 'native-v2',
        oldIdentity: structuredClone(profile.oldCurrent.identity), expectedLastSequence: 1,
        trialId: 'native-econ-one', releaseSequence: 2, startSequence: 3,
        issuedAtMs: 1000000, stopAtMs: 6280000, notAfterMs: 6400000,
        acceptNotBeforeTick: 100, acceptNotAfterTick: 110,
        allowSupersedeKnownClosedPreparation: true, allowEconomicRelease: true, allowStart: true, allowHold: true, ...extra};
}
const clock = {tick: 101, nowMs: 1000001, codeVersion: 'native-v2'};

test('native_ops_default_off_preserves_existing_state', async () => {
    const {DEFAULT_EMPIRE_POLICY, ensureEmpireControl} = await import('../config/EmpirePolicy.js');
    assert.deepEqual(DEFAULT_EMPIRE_POLICY.remoteMining.nativeTrialOps, {enabled: false, request: null});
    const old = {marker: 'untouched'};
    global.Memory = {empire: {remoteMining: {economicTrials: old}}};
    ensureEmpireControl();
    assert.deepEqual(Memory.empire.remoteMining, {economicTrials: old});
    assert.equal(Memory.empire.control.goals, undefined);
});

test('native_ops_request_schema_and_window', async () => {
    const {NATIVE_OPS_PROFILE: p, validateNativeOpsRequest: validate} = await profileModule();
    assert.equal(typeof validate, 'function', 'native request validator must exist');
    assert.equal(p.remoteId, 'W49N41:W48N41');
    assert.equal(p.sourceId, '5bbcaa6d9099fc012e63155b');
    assert.equal(p.receiverId, '6ad0b55bceeb3db0d3b4dda0');
    assert.deepEqual(p.containerPos, {x: 19, y: 6, roomName: 'W48N41'});
    assert.equal(p.oldPreparation.codeVersion, '1792636618804');
    assert.equal(p.oldCurrent.identity.codeVersion, '1792555927985');
    assert.ok(Object.isFrozen(p.oldCurrent.evidence));
    assert.equal(validate(request(p), p, clock).valid, true);
    for (const patch of [{extra: true}, {trialId: 'x'.repeat(57)}, {codeVersion: 'wrong'},
        {issuedAtMs: 1000002}, {issuedAtMs: 960000}, {acceptNotAfterTick: 111},
        {stopAtMs: 6399999}, {notAfterMs: 6400001}, {oldIdentity: {}},
        ...['allowStart','allowHold','allowEconomicRelease','allowSupersedeKnownClosedPreparation'].map(key => ({[key]: false}))]) {
        assert.equal(validate(request(p, patch), p, clock).valid, false, JSON.stringify(patch));
    }
    assert.equal(validate(request(p, {trialId: p.oldCurrent.identity.trialId}), p, clock).valid, false);
});

test('native_ops_short_submission_wire_budget', async () => {
    const m = await profileModule();
    assert.equal(typeof m.makeNativeOpsSubmission, 'function');
    const q = request(m.NATIVE_OPS_PROFILE, {id: 'x'.repeat(64), trialId: 'y'.repeat(56)});
    const expression = m.makeNativeOpsSubmission(q);
    assert.ok(JSON.stringify(expression).length <= 1024);
    assert.ok(expression.startsWith('Memory.empire.control.policy.remoteMining.nativeTrialOps='));
    assert.equal(expression.includes('eval'), false);
});

test('native_ops_shared_fingerprint_is_byte_identical', async () => {
    const m = await import('../services/RemoteEconomicTrialConfig.js').catch(e => e.code === 'ERR_MODULE_NOT_FOUND' ? {} : Promise.reject(e));
    assert.equal(typeof m.economicTrialConfigFingerprint, 'function');
    const {createEconomicTrialFixture} = require('./helpers/economic-trial-fixture.cjs');
    const s = await createEconomicTrialFixture();
    s.prepare();
    const {collectEconomicTrialFacts} = await import('../services/RemoteEconomicTrialFacts.js');
    const config = Memory.empire.remoteRooms.W1N2, policy = Memory.empire.control.policy.remoteMining;
    assert.equal(m.economicTrialConfigFingerprint(config, policy, 'W1N2'), collectEconomicTrialFacts(null,
        {tick: Game.time, nowMs: 1000000, codeVersion: 'econ-v1'}).configFingerprint);
    const before = m.economicTrialConfigFingerprint(config, policy, 'W1N2');
    config.enabled = !config.enabled; config.hold = !config.hold;
    policy.nativeTrialOps = {enabled: true};
    assert.equal(m.economicTrialConfigFingerprint(config, policy, 'W1N2'), before);
    assert.equal(s.state, undefined);
});
module.exports = {request, clock};

const {protocolScene} = require('./helpers/native-economic-ops-protocol.cjs');
test('native_ops_two_consecutive_preflights', async () => {
    const s = await protocolScene();
    assert.equal(s.evaluate().effects.length, 0);
    s.advance();
    const r = s.evaluate();
    assert.equal(r.effects[0].type, 'archive_preparation');
    assert.equal(s.state.lastAcceptedStartSequence, 3);
});
test('native_ops_archive_before_supersede', async () => {
    const s = await protocolScene();
    s.evaluate(); s.advance(); const archived = s.evaluate(); s.apply(archived);
    assert.deepEqual(Memory.empire.control.policy.remoteMining.economicTrial.request, s.profile.oldPreparation);
    assert.deepEqual(s.state.current.archive.request, s.profile.oldPreparation);
    s.advance(); const r = s.evaluate();
    assert.equal(r.effects[0].type, 'replace_release_request');
    assert.equal(r.effects[0].request.codeVersion, 'econ-v1');
    assert.equal(r.effects[0].request.activateAtTick, Game.time + 1);
});
test('native_ops_release_start_stages', async () => {
    const s = await protocolScene();
    s.evaluate(); s.advance(); s.apply(s.evaluate()); s.advance(); s.apply(s.evaluate());
    s.advance(); assert.equal(s.evaluate().effects.length, 0);
    s.advance(); const start = s.evaluate();
    assert.equal(start.effects[0].type, 'prepare_start');
    assert.equal(start.effects[0].request.expiresAtTick, Game.time + 1001);
    s.apply(start); s.advance(); const activate = s.evaluate();
    assert.equal(activate.effects[0].type, 'activate_start');
});
test('native_ops_intent_no_replay_after_reset', async () => {
    const s = await protocolScene();
    s.evaluate(); s.advance(); const r = s.evaluate();
    assert.equal(r.effects.length, 1);
    s.reset(); s.advance(); const after = s.evaluate();
    assert.equal(after.effects.some(e => e.type === r.effects[0].type), false);
    assert.equal(s.state.current.unknownEffect, true);
});
test('native_ops_high_water_survives_history_rotation', async () => {
    const s = await protocolScene(); s.evaluate(); s.advance({nowMs: s.clock().nowMs - 1});
    s.evaluate();
    Memory.empire.control.policy.remoteMining.nativeTrialOps.request.id = 'different';
    s.advance(); s.evaluate();
    assert.equal(s.state.lastAcceptedStartSequence, 3);
    assert.equal(s.state.current.request.id, 'native-one');
    const archived = {schemaVersion: 1, lastAcceptedStartSequence: 3, current: null,
        previous: structuredClone(s.state.current)};
    const {collectNativeEconomicOpsFacts} = await import('../services/NativeEconomicTrialOpsFacts.js');
    const attempt = s.m.advanceNativeEconomicOps(archived, {kind: 'evaluate'},
        collectNativeEconomicOpsFacts(s.profile, s.clock()), s.clock(), s.profile);
    assert.equal(attempt.state.current, null);
    assert.equal(attempt.state.lastAcceptedStartSequence, 3);
    assert.equal(attempt.effects.length, 0);
});
for (const mode of ['gap', 'rollback']) test('native_ops_clock_rollback_and_gap_stop_' + mode, async () => {
    const s = await protocolScene(); s.evaluate();
    if (mode === 'gap') Game.time++;
    s.advance(mode === 'rollback' ? {nowMs: s.clock().nowMs - 1} : {});
    assert.equal(s.evaluate().effects.length, 0);
    assert.equal(s.state.current.stage, 'terminal');
});
test('native_ops_incomplete_archive_never_supersedes_preparation', async () => {
    const s = await protocolScene(); s.evaluate(); s.advance(); s.apply(s.evaluate());
    delete s.state.current.archive.atTick;
    assert.equal(s.m.validNativeEconomicOpsState(s.state), false);
    s.advance();
    assert.equal(s.evaluate().effects.length, 0);
});
test('native_ops_saved_start_deadline_cannot_change', async () => {
    const s = await protocolScene(); s.evaluate(); s.advance(); s.apply(s.evaluate());
    s.advance(); s.apply(s.evaluate()); s.advance(); s.evaluate(); s.advance(); s.apply(s.evaluate());
    s.state.current.startRequest.expiresAtTick++;
    assert.equal(s.m.validNativeEconomicOpsState(s.state), false);
});
