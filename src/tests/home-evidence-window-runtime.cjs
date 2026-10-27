const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {admitted, clock, packet} = require('./helpers/home-evidence-data.cjs');
const {createHomeFixture} = require('./helpers/home-evidence-window-fixture.cjs');
const load = () => import('../services/HomeEvidenceWindowService.js').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('HomeEvidenceWindowService.js')) return {};
    throw error;
});

test('home_runtime_disabled_service_does_not_create_namespace', async () => {
    const {default: Service} = await load(); assert.equal(typeof Service, 'function', 'home service required');
    const f = await createHomeFixture(); const before = JSON.stringify(Memory);
    const s = new Service('HomeEvidenceWindow', {now: () => f.clock().nowMs, writeStore: () => assert.fail('write')});
    for (const name of ['init', 'analyze', 'run', 'cleanup']) s[name]();
    assert.equal(JSON.stringify(Memory), before); assert.equal(Memory.empire.observations, undefined);
});
test('home_runtime_cleanup_last_is_p3_before_finishTick', async () => {
    const {default: Service} = await load(); assert.equal(typeof Service, 'function');
    const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
    assert.ok(main.indexOf("new HomeEvidenceWindowService(") > main.indexOf("new TrialEvidenceWindowService("));
    const {default: scheduler} = await import('../core/ServiceScheduler.js');
    await createHomeFixture(); assert.equal(scheduler.decision('HomeEvidenceWindow', 'cleanup').tier, 'P3');
});
test('home_runtime_natural_pipeline_applies_actions_only_next_tick', async () => {
    const {default: Service} = await load(); assert.equal(typeof Service, 'function');
    const f = await createHomeFixture(); f.enable();
    const s = new Service('HomeEvidenceWindow', {now: () => f.clock().nowMs, factsDeps: {simulatedEvents: true}});
    f.services.push(s); const before = f.source.energy; f.run();
    assert.equal(f.source.energy, before, 'intent OK does not apply harvest');
    assert.equal(Memory.empire.observations.homeEvidence.window.rows.length, 1);
    f.advance(); assert.equal(f.source.energy, before - 2); f.run();
    assert.ok(f.calls.some(c => c.method === 'harvest' && c.result === OK));
    assert.ok(f.calls.some(c => c.method === 'transfer' && c.result === OK));
    assert.equal(Memory.empire.observations.homeEvidence.window.rows[1].api.semantics, 'simulated');
    assert.equal(Memory.empire.remoteMining, undefined);
});
test('home_runtime_closure_precedes_optional_events_even_low_cpu', async () => {
    const {default: Service} = await load(); assert.equal(typeof Service, 'function');
    const f = await createHomeFixture(); f.enable();
    const s = new Service('HomeEvidenceWindow', {now: () => f.clock().nowMs}); s.cleanup();
    assert.equal(Memory.empire.observations.homeEvidence.window.capture.phase, 'recording');
    Memory.empire.control.policy.homeEvidence.enabled = false; f.setCpu(19);
    f.room.getEventLog = () => assert.fail('closed collector must not read events');
    s.cleanup();
    assert.equal(s.lastError, 'cpu_skipped');
    f.setCpu(0); s.cleanup();
    assert.equal(Memory.empire.observations.homeEvidence.window.capture.phase, 'sealed');
});
test('home_runtime_pending_survives_rebuild_without_replay', async () => {
    const {default: Service} = await load(); assert.equal(typeof Service, 'function');
    const f = await createHomeFixture(); f.enable(); const {store: candidate} = await admitted(); let raw, calls = 0;
    const options = {now: () => f.clock().nowMs, readStore: () => raw, writeStore: value => {
        calls++; if (calls === 2) throw Error('unknown final'); raw = value;
    }};
    const service = new Service('HomeEvidenceWindow', options);
    assert.equal(service.commitHomeEvidence(undefined, candidate, 'admit:100'), 'unknown');
    assert.equal(raw.window.pending.stage, 'admit'); raw = JSON.parse(JSON.stringify(raw));
    const count = calls; f.advance(); new Service('HomeEvidenceWindow', options).cleanup();
    assert.equal(calls, count); assert.equal(raw.window.rows.length, 0);
});
test('home_runtime_write_after_throw_matches_once_and_unknown_never_retries', async () => {
    const {default: Service} = await load(); assert.equal(typeof Service, 'function');
    await createHomeFixture(); const {store} = await admitted(); let raw, writes = 0;
    const s = new Service('HomeEvidenceWindow', {readStore: () => raw, writeStore: value => {writes++; raw = value; throw Error('lost ack');}});
    assert.equal(s.commitHomeEvidence(undefined, store, 'admit:100'), 'committed'); assert.equal(writes, 2);
    const bad = new Service('HomeEvidenceWindow', {readStore: () => undefined, writeStore: () => {writes++; throw Error('not stored');}});
    assert.equal(bad.commitHomeEvidence(undefined, store, 'admit:100'), 'unknown');
    const count = writes; assert.equal(bad.commitHomeEvidence(undefined, store, 'admit:100'), 'unknown'); assert.equal(writes, count);
});
test('home_runtime_original_deadlines_json_reload_and_no_101st_event_read', async () => {
    const {default: Service} = await load(); assert.equal(typeof Service, 'function');
    const f = await createHomeFixture(); f.enable(); let reads = 0;
    const options = {now: () => f.clock().nowMs, factsDeps: {readEvents: () => {reads++; return [];}}};
    let s = new Service('HomeEvidenceWindow', options);
    for (let i = 0; i < 100; i++) {s.cleanup(); f.advance(); if (i === 20) {f.reloadMemory(); s = new Service('HomeEvidenceWindow', options);}}
    const w = Memory.empire.observations.homeEvidence.window;
    assert.equal(w.capture.phase, 'sealed'); assert.equal(w.rows.length, 100); assert.equal(w.bounds.lastAllowedTick, 199);
    const count = reads; s.cleanup(); assert.equal(reads, count);
});
test('home_runtime_enabled_disabled_fault_action_parity', async () => {
    const {default: Service} = await load(); assert.equal(typeof Service, 'function');
    const results = [];
    for (const mode of ['disabled', 'enabled', 'fault']) {
        const f = await createHomeFixture(); if (mode !== 'disabled') f.enable();
        const s = new Service('HomeEvidenceWindow', {now: () => f.clock().nowMs,
            ...(mode === 'fault' ? {writeStore: () => {throw Error('observation store unavailable');}} : {})});
        f.services.push(s);
        for (let i = 0; i < 6; i++) {f.run(); f.advance();}
        const business = structuredClone(Memory); delete business.empire.observations; delete business.empire.control.policy.homeEvidence;
        results.push({business, calls: f.calls, applied: f.applied, energy: f.storage.store.energy, progress: f.site.progress});
    }
    assert.deepEqual(results[1], results[0]); assert.deepEqual(results[2], results[0]);
});

test('home_runtime_tick_rollback_stops_before_optional_read', async () => {
    const {default: Service} = await load(); const f = await createHomeFixture(); f.enable();
    const s = new Service('HomeEvidenceWindow', {now: () => f.clock().nowMs}); s.cleanup(); f.advance(); s.cleanup();
    Game.time = 100; let calls = 0; f.room.getEventLog = () => {calls++; return [];}; s.cleanup();
    assert.equal(calls, 0); assert.equal(Memory.empire.observations.homeEvidence.window.seal.reason, 'invalid_clock');
});

test('home_runtime_failed_admission_cannot_reappear_after_reset_on_a_later_tick', async () => {
    const {default: Service} = await load(); const f = await createHomeFixture(); f.enable(); let writes = 0;
    const options = {now: () => f.clock().nowMs, readStore: () => undefined, writeStore: () => {writes++; throw Error('no durable marker');}};
    new Service('HomeEvidenceWindow', options).cleanup(); const count = writes;
    f.advance(); f.reloadMemory(); new Service('HomeEvidenceWindow', options).cleanup();
    assert.equal(writes, count); assert.equal(Memory.empire.observations, undefined);
});

test('home_runtime_cpu_policy_cannot_loosen_and_stop_after_pending_is_not_retried', async () => {
    const {default: Service} = await load();
    for (const cpu of [{minBucket: 4999, reserve: 5, capture: 2}, {minBucket: 5000, reserve: 4, capture: 2},
        {minBucket: 5000, reserve: 5, capture: 3}, {minBucket: 5000, reserve: 5, capture: '2'}]) {
        const f = await createHomeFixture(); f.enable(); Memory.empire.control.policy.homeEvidence.cpu = cpu;
        const s = new Service('HomeEvidenceWindow', {now: () => f.clock().nowMs}); s.cleanup();
        assert.equal(Memory.empire.observations, undefined); assert.equal(s.lastError, 'cpu_skipped');
    }
    const f = await createHomeFixture(); const {store} = await admitted(); let raw, writes = 0;
    const s = new Service('HomeEvidenceWindow', {readStore: () => raw, writeStore: value => {writes++; raw = value; f.setCpu(3);}});
    assert.equal(s.commitHomeEvidence(undefined, store, 'admit:100'), 'unknown'); assert.equal(writes, 1);
    assert.equal(raw.window.pending.stage, 'admit');
});

test('home_runtime_unknown_admission_cannot_swap_id_in_same_tick', async () => {
    const {default: Service} = await load(); const f = await createHomeFixture(); f.enable(); let writes = 0;
    const options = {now: () => f.clock().nowMs, readStore: () => undefined, writeStore: () => {writes++; throw Error('unknown');}};
    new Service('HomeEvidenceWindow', options).cleanup(); const count = writes;
    Memory.empire.control.policy.homeEvidence.request.id = 'other-id';
    new Service('HomeEvidenceWindow', options).cleanup();
    assert.equal(writes, count);
});

test('home_runtime_cpu_snapshot_cannot_be_mutated_into_a_looser_budget', async () => {
    const {default: Service} = await load(); const f = await createHomeFixture();
    Game.cpu.tickLimit = 100;
    const s = new Service('HomeEvidenceWindow'); const budget = s.budget();
    Memory.empire.control.policy.homeEvidence.cpu.capture = 20;
    f.setCpu(3); assert.equal(budget(), false);
});

test('home_runtime_facade_is_readonly_and_closed_query_does_not_create_window', async () => {
    const {default: Service} = await load(); const f = await createHomeFixture();
    const s = new Service('HomeEvidenceWindow', {now: () => f.clock().nowMs}); s.init();
    const before = JSON.stringify(Memory); assert.equal(global.HomeEvidenceWindow.status().error, 'missing_window');
    assert.deepEqual(Object.keys(global.HomeEvidenceWindow), ['status', 'report', 'readPage']);
    assert.equal(JSON.stringify(Memory), before);
    f.enable(); s.cleanup(); const captured = JSON.stringify(Memory);
    global.HomeEvidenceWindow.status(); global.HomeEvidenceWindow.report(); global.HomeEvidenceWindow.readPage(0, 16);
    assert.equal(JSON.stringify(Memory), captured);
});

test('home_review_low_cpu_stop_is_latched_across_reenable_and_service_rebuild', async () => {
    const {default: Service} = await load(); const f = await createHomeFixture(); f.enable();
    const options = {now: () => f.clock().nowMs}; const s = new Service('HomeEvidenceWindow', options); s.cleanup();
    f.advance(); Memory.empire.control.policy.homeEvidence.enabled = false; f.setCpu(19); s.cleanup();
    f.advance(); Memory.empire.control.policy.homeEvidence.enabled = true; f.setCpu(0); f.reloadMemory();
    let reads = 0; f.room.getEventLog = () => {reads++; return [];};
    new Service('HomeEvidenceWindow', options).cleanup();
    const w = Memory.empire.observations.homeEvidence.window;
    assert.equal(reads, 0); assert.equal(w.capture.phase, 'sealed');
    assert.equal(w.seal.reason, 'disabled'); assert.equal(w.seal.atTick, 101, 'deferred seal retains original stop clock');
});

test('home_review_unknown_seal_never_resumes_or_replays_after_danger_clears', async () => {
    const {default: Service} = await load(); const f = await createHomeFixture(); f.enable();
    let raw, writes = 0, hostile = false, reads = 0;
    const find = f.room.find; f.room.find = (type, query) => type === FIND_HOSTILE_CREEPS && hostile ? [{}] : find(type, query);
    f.room.getEventLog = () => {reads++; return [];};
    const options = {now: () => f.clock().nowMs, readStore: () => raw, writeStore: value => {
        writes++; if (value.window.capture.phase === 'sealed') throw Error('seal unknown before assignment'); raw = value;
    }};
    const s = new Service('HomeEvidenceWindow', options); s.cleanup(); const firstReads = reads;
    f.advance(); hostile = true; s.cleanup(); const afterStop = writes;
    f.advance(); hostile = false; raw = JSON.parse(JSON.stringify(raw));
    new Service('HomeEvidenceWindow', options).cleanup();
    assert.equal(reads, firstReads); assert.equal(writes, afterStop, 'unknown terminal write is not replayed');
    assert.equal(raw.window.rows.length, 1);
});

test('home_review_pre_capture_validation_cost_is_inside_original_cpu_budget', async () => {
    const {default: Service} = await load(); const f = await createHomeFixture(); f.enable(); const {store} = await admitted();
    let reads = 0; f.room.getEventLog = () => {reads++; return [];};
    const s = new Service('HomeEvidenceWindow', {now: () => f.clock().nowMs,
        readStore: () => {f.setCpu(2.1); return store;}, writeStore: () => assert.fail('budget exhausted')});
    s.cleanup(); assert.equal(reads, 0); assert.equal(s.lastError, 'cpu_skipped');
});
