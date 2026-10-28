const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHomeFixture} = require('./helpers/home-evidence-window-fixture.cjs');
const load = () => import('../services/HomeEvidenceWindowService.js');
async function setup(options = {}) {
    const f = await createHomeFixture(); f.enable();
    const {default: Service} = await load();
    return {f, Service, service: new Service('HomeEvidenceWindow', {now: () => f.clock().nowMs, ...options})};
}
test('reserved_readback_precedes_gate_and_events', async () => {
    let raw, reads = 0; const writes = [], eventStates = [];
    const {service} = await setup({readStore: () => raw, writeStore: value => {raw = value; writes.push(structuredClone(value));},
        factsDeps: {readEvents() {reads++; eventStates.push({status: raw.admission.status, pending: raw.pending}); return [];}}});
    service.cleanup();
    assert.equal(writes[0].schemaVersion, 2);
    assert.equal(writes[0].pending.kind, 'reserve');
    assert.equal(writes[1].admission.status, 'reserved');
    assert.equal(writes[1].window, null);
    assert.equal(reads, 1);
    assert.deepEqual(eventStates, [{status: 'accepted', pending: undefined}]);
    assert.equal(raw.window.rows.length, 1);
});
test('gate_rejection_and_no_cohort_preserve_precise_first_reason', async () => {
    for (const reason of ['home_not_ready', 'no_cohort']) {
        const {f, service} = await setup({factsDeps: {readEvents: () => {throw Error('must not read');}}});
        if (reason === 'home_not_ready') RoomPhase.W49N41.recovery.mode = 'spawn_energy'; else Memory.creeps = {};
        service.cleanup();
        const raw = Memory.empire.observations?.homeEvidence;
        assert.equal(raw?.admission.firstOutcome.reason, reason);
        assert.equal(raw.window, null);
        f.advance(); service.cleanup();
        assert.equal(Memory.empire.observations.homeEvidence.admission.firstOutcome.reason, reason);
    }
});
test('pending_unknown_blocks_capture_and_second_commit', async () => {
    let raw, writes = 0, events = 0;
    const {service, f, Service} = await setup({readStore: () => raw, writeStore: value => {
        writes++; if (writes === 2) throw Error('unknown final'); raw = value;
    }, factsDeps: {readEvents: () => {events++; return [];}}});
    service.cleanup(); assert.equal(raw.pending.kind, 'reserve'); assert.equal(writes, 2);
    f.advance(); new Service('HomeEvidenceWindow', {readStore: () => raw, writeStore: () => {writes++;}}).cleanup();
    assert.equal(events, 0); assert.equal(writes, 2);
});
test('same_cpu_budget_includes_reservation_and_does_not_grant_window', async () => {
    let raw, writes = 0; const {f, service} = await setup({readStore: () => raw, writeStore: value => {writes++; raw = value; f.setCpu(2);}});
    service.cleanup(); assert.equal(writes, 1); assert.equal(raw.window, null);
    assert.equal(service.lastError, 'write_unknown');
});
test('persistence_write_after_throw_is_read_back_once', async () => {
    let raw, writes = 0; const {service} = await setup({readStore: () => raw, writeStore: value => {writes++; raw = value; throw Error('ack lost');}});
    service.cleanup(); assert.equal(raw.admission.status, 'accepted'); assert.equal(raw.window.rows.length, 1); assert.equal(writes, 6);
});
test('cpu_edges_do_not_loosen_policy_or_create_store', async () => {
    for (const cpu of [{used: 14, tickLimit: 20, bucket: 10000}, {used: 0, tickLimit: 20, bucket: 4999}, null]) {
        const {service} = await setup({readCpu: () => cpu}); service.cleanup();
        assert.equal(Memory.empire.observations, undefined);
        assert.equal(service.lastError, 'cpu_skipped');
    }
});

test('diagnostic_flush_uses_original_snapshot_and_deadline_without_reopening', async () => {
    const {service, f, Service} = await setup(); f.setCpu(14);
    service.cleanup(); assert.equal(Memory.empire.observations, undefined);
    f.advance(); f.setCpu(0); Memory.empire.control.policy.homeEvidence.enabled = false;
    let events = 0; f.room.getEventLog = () => {events++; return [];};
    new Service('HomeEvidenceWindow', {now: () => f.clock().nowMs}).cleanup();
    const raw = Memory.empire.observations?.homeEvidence;
    assert.equal(raw?.admission.firstOutcome.reason, 'cpu_skipped');
    assert.equal(raw.admission.firstOutcome.tick, 100);
    assert.equal(raw.admission.request.expiresAtMs, 1600000);
    assert.equal(raw.window, null); assert.equal(events, 0);
});
test('selection_cpu_failure_keeps_stage_across_service_rebuild', async () => {
    const {service, f, Service} = await setup();
    const find = f.room.find; f.room.find = type => {const v = find(type); if (type === FIND_STRUCTURES) f.setCpu(2); return v;};
    service.cleanup();
    assert.equal(Memory.empire.observations.homeEvidence.admission.status, 'reserved');
    f.advance(); f.setCpu(0); f.room.find = () => {throw Error('must not reread gate or selector');};
    new Service('HomeEvidenceWindow', {now: () => f.clock().nowMs}).cleanup();
    const raw = Memory.empire.observations.homeEvidence;
    assert.equal(raw.admission.firstOutcome.stage, 'selection');
    assert.equal(raw.admission.firstOutcome.tick, 100); assert.equal(raw.window, null);
});
test('expired_diagnostic_is_not_flushed_and_missing_global_evidence_is_not_fabricated', async () => {
    const {service, f, Service} = await setup(); f.setCpu(14); service.cleanup();
    f.advance(); f.setCpu(0); f.setNow(1600000);
    new Service('HomeEvidenceWindow', {now: () => f.clock().nowMs}).cleanup();
    assert.equal(Memory.empire.observations, undefined);
    delete global.HomeEvidenceWindowRuntime; f.setNow(1003000);
    new Service('HomeEvidenceWindow', {now: () => f.clock().nowMs}).cleanup();
    assert.equal(Memory.empire.observations, undefined);
});
test('reserved_after_global_rebuild_is_interrupted_not_resumable', async () => {
    const {f, Service} = await setup();
    const m = await import('../services/HomeEvidenceWindowModel.js');
    Memory.empire.observations = {homeEvidence: m.advanceHomeEvidence(undefined,
        {type: 'reserve', request: Memory.empire.control.policy.homeEvidence.request}, f.clock()).store};
    f.reloadMemory(); delete global.HomeEvidenceWindowRuntime; global.Game = {...Game};
    let events = 0, writes = 0;
    const s = new Service('HomeEvidenceWindow', {now: () => f.clock().nowMs, writeStore: () => {writes++;},
        factsDeps: {readEvents: () => {events++; return [];}}}); s.cleanup();
    assert.equal(s.lastError, 'admission_interrupted'); assert.equal(events, 0); assert.equal(writes, 0);
});
test('rejected_persistent_first_cause_survives_full_runtime_rebuild', async () => {
    const {service, f, Service} = await setup(); RoomPhase.W49N41.recovery.mode = 'spawn_energy'; service.cleanup();
    const before = JSON.stringify(Memory.empire.observations.homeEvidence);
    f.advance(); f.reloadMemory(); delete global.HomeEvidenceWindowRuntime; global.Game = {...Game};
    RoomPhase.W49N41.recovery.mode = 'normal';
    const s = new Service('HomeEvidenceWindow', {now: () => f.clock().nowMs}); s.cleanup();
    assert.equal(s.lastError, 'home_not_ready'); assert.equal(JSON.stringify(Memory.empire.observations.homeEvidence), before);
});
for (const phase of ['validate', 'read', 'copy', 'beforePending', 'afterPending', 'beforeFinal', 'afterFinal']) {
    test('persistence_cpu_boundary_' + phase, async () => {
        const f = await createHomeFixture();
        const m = await import('../services/HomeEvidenceWindowModel.js');
        const {commitHomeEvidenceStore} = await import('../services/HomeEvidenceWindowPersistence.js');
        const q = require('./helpers/home-evidence-data.cjs').request();
        const candidate = m.advanceHomeEvidence(undefined, {type: 'reserve', request: q}, f.clock()).store;
        let raw, writes = 0;
        const r = commitHomeEvidenceStore({expected: undefined, candidate, kind: 'reserve', key: m.homeCommitKey(q, 'reserve'),
            readStore: () => raw, writeStore: v => {writes++; raw = v;}, checkpoint: name => {
                if (name === phase) {const error = new Error('cpu'); error.code = 'HOME_CPU_LIMIT'; throw error;}
            }});
        const called = ['afterPending', 'beforeFinal', 'afterFinal'].includes(phase);
        assert.equal(r.status, called ? 'unknown' : 'conflict'); assert.equal(r.writeAttempted, called);
        assert.equal(writes, phase === 'afterFinal' ? 2 : called ? 1 : 0);
    });
}
test('v2_capacity_includes_diagnostics_and_preserves_existing_rows', async () => {
    const {service, f} = await setup();
    let previous = 0;
    for (let i = 0; i < 100; i++) {
        service.cleanup();
        const raw = Memory.empire.observations.homeEvidence;
        assert.ok(JSON.stringify(raw).length <= 131072);
        assert.ok(JSON.stringify({admission: raw.admission, pending: raw.pending}).length <= 8192);
        assert.ok(raw.window.rows.length >= previous); previous = raw.window.rows.length;
        if (raw.window.capture.phase === 'sealed') break;
        f.advance();
    }
    const raw = Memory.empire.observations.homeEvidence;
    assert.equal(raw.window.capture.phase, 'sealed');
    assert.ok(['complete', 'capacity'].includes(raw.window.seal.reason));
    const before = JSON.stringify(raw); f.advance(); service.cleanup();
    assert.equal(JSON.stringify(Memory.empire.observations.homeEvidence), before);
});
test('review_unknown_admit_final_never_resumes_after_global_reset', async () => {
    let raw, writes = 0, events = 0;
    const {service, f, Service} = await setup({readStore: () => raw, writeStore: value => {
        writes++; raw = value; if (writes === 4) f.setCpu(2);
    }, factsDeps: {readEvents: () => {events++; return [];}}});
    service.cleanup();
    assert.equal(service.lastError, 'write_unknown'); assert.equal(events, 0);
    assert.equal(raw.window.rows.length, 0); assert.equal(raw.pending, undefined);
    const report = await import('../services/HomeEvidenceWindowReport.js');
    assert.equal(report.homeEvidenceStatus(raw).admissionConfirmed, false);
    raw = JSON.parse(JSON.stringify(raw)); f.advance(); f.reloadMemory(); f.setCpu(0);
    delete global.HomeEvidenceWindowRuntime; global.Game = {...Game};
    const before = writes;
    const next = new Service('HomeEvidenceWindow', {now: () => f.clock().nowMs, readStore: () => raw,
        writeStore: value => {writes++; raw = value;}, factsDeps: {readEvents: () => {events++; return [];}}});
    next.cleanup(); assert.equal(events, 0); assert.equal(writes, before);
    assert.equal(next.lastError, 'capture_interrupted');
});
test('review_admit_commit_cpu_failure_is_not_selection', async () => {
    const {service, f, Service} = await setup();
    const original = service.commitHomeEvidence.bind(service);
    service.commitHomeEvidence = (expected, candidate, key, kind) => {
        if (kind === 'admit') f.setCpu(2);
        return original(expected, candidate, key, kind);
    };
    service.cleanup(); assert.equal(service.lastError, 'cpu_skipped');
    f.advance(); f.setCpu(0);
    new Service('HomeEvidenceWindow', {now: () => f.clock().nowMs}).cleanup();
    const a = Memory.empire.observations.homeEvidence.admission;
    assert.equal(a.firstOutcome.stage, 'admit');
    assert.equal(a.firstOutcome.reason, 'cpu_skipped'); assert.equal(a.cpu.afterSelection.delta, 0);
});
