const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRemoteFixture, store } = require('./helpers/remote-mining-fixture.cjs');

async function fixture() {
    const f = await createRemoteFixture({ manualSettlement: true, policyEnabled: false });
    global.RoomPhase.W1N1.recovery.evaluatedAt = Game.time;
    f.collect = async () => {
        const { collectGoalPlanFacts } = await import('../governance/GoalPlanFacts.js');
        return collectGoalPlanFacts({ roomNames: ['W1N1'], now: Game.time, codeVersion: 'test-v1' });
    };
    f.terminal = (free = 20000) => {
        f.home.terminal = { id: 'Terminal', my: true, structureType: STRUCTURE_TERMINAL,
            pos: new RoomPosition(32, 24, 'W1N1'), store: store(300000 - free, 300000) };
    };
    return f;
}

test('goal_facts_completed_site_is_not_a_real_terminal', async () => {
    const f = await fixture();
    f.objects.TerminalSite = { id: 'TerminalSite', kind: 'site', my: true, structureType: STRUCTURE_TERMINAL,
        pos: new RoomPosition(32, 24, 'W1N1'), progress: 100000, progressTotal: 100000 };
    const before = JSON.stringify(Memory);
    const facts = await f.collect();
    assert.equal(facts.rooms.W1N1.terminal.present, false);
    assert.equal(facts.rooms.W1N1.terminal.known, true);
    assert.equal(facts.rooms.W1N1.site.progress, 100000);
    assert.equal(JSON.stringify(Memory), before);
    assert.equal(f.createdSites.length, 0);
    assert.equal(f.spawnCalls.length, 0);
});

for (const free of [19999, 20000, 0]) {
    test('goal_facts_preserves_actual_free_capacity_' + free, async () => {
        const f = await fixture();
        f.terminal(free);
        const facts = await f.collect();
        assert.deepEqual(facts.rooms.W1N1.terminal, { known: true, present: true, owned: true, id: 'Terminal', freeCapacity: free });
        assert.equal(facts.capturedAt, 100);
        assert.equal(facts.codeVersion, 'test-v1');
    });
}

test('goal_facts_unknown_capacity_is_not_zero', async () => {
    const f = await fixture();
    f.terminal();
    f.home.terminal.store.getFreeCapacity = () => NaN;
    assert.equal((await f.collect()).rooms.W1N1.terminal.freeCapacity, null);
});

test('goal_facts_missing_vision_and_ownership_are_explicit', async () => {
    const f = await fixture();
    delete Game.rooms.W1N1;
    assert.equal((await f.collect()).rooms.W1N1.visible, false);
    Game.rooms.W1N1 = f.home;
    delete f.home.controller.my;
    assert.equal((await f.collect()).rooms.W1N1.owned, null);
});

test('goal_facts_recovery_has_its_own_evidence_time', async () => {
    const f = await fixture();
    global.RoomPhase.W1N1.recovery.evaluatedAt = 50;
    assert.deepEqual((await f.collect()).rooms.W1N1.recovery, { mode: 'normal', evaluatedAt: 50 });
    delete global.RoomPhase.W1N1.recovery;
    assert.deepEqual((await f.collect()).rooms.W1N1.recovery, { mode: null, evaluatedAt: null });
});

test('goal_facts_rejects_clock_mismatch_and_isolates_room_read_errors', async () => {
    const f = await fixture();
    const { collectGoalPlanFacts } = await import('../governance/GoalPlanFacts.js');
    const mismatch = collectGoalPlanFacts({ roomNames: ['W1N1'], now: 101, codeVersion: 'v1' });
    assert.equal(mismatch.errors.input, 'clock_mismatch');
    assert.deepEqual(mismatch.rooms, {});
    f.home.find = () => { throw new Error('fixture failure'); };
    const facts = await f.collect();
    assert.equal(facts.errors.W1N1, 'room_facts_unavailable');
    assert.equal(facts.rooms.W1N1, undefined);
});

const policy = { enabled: true, mode: 'shadow', interval: 10, maxFactAge: 20, readySamples: 2,
    maxGoals: 20, maxPlans: 20, eventLimit: 50 };
function definition(id = 'receiving:W1N1') {
    return { id, kind: 'prepare_receiving_capacity', roomName: 'W1N1', priority: 60,
        requiredFreeCapacity: 20000, createdAt: 100 };
}

async function modelFixture() {
    const f = await fixture();
    f.terminal();
    const { evaluateGoalPlan } = await import('../governance/GoalPlanModel.js');
    f.evaluate = async (previous, now = Game.time, facts) => evaluateGoalPlan({
        goal: previous?.goal || { definition: definition(), state: { status: 'proposed' } },
        plan: previous?.plan,
        facts: facts || await f.collect(), now, policy
    });
    f.advance = tick => { Game.time = tick; global.RoomPhase.W1N1.recovery.evaluatedAt = tick; };
    return f;
}

test('goal_model_two_fresh_samples_complete_and_inputs_remain_immutable', async () => {
    const f = await modelFixture();
    const facts = await f.collect();
    const before = JSON.stringify(facts);
    const first = await f.evaluate(null, 100, facts);
    assert.equal(first.currentReadiness.status, 'confirming');
    assert.equal(first.goal.state.status, 'tracking');
    f.advance(110);
    const second = await f.evaluate(first);
    assert.equal(second.goal.state.status, 'achieved');
    assert.equal(second.goal.state.achievedAt, 110);
    assert.equal(second.currentReadiness.ready, true);
    assert.equal(second.plan.phase, 'ready');
    assert.equal(second.plan.budgetAllocated, 0);
    assert.equal(second.plan.retryCount, 0);
    assert.equal(JSON.stringify(facts), before);
    assert.equal(first.goal.state.status, 'tracking');
    const duplicate = await f.evaluate(second);
    assert.deepEqual(duplicate.events, []);
});

test('goal_model_reusing_same_capture_cannot_count_as_new_evidence', async () => {
    const f = await modelFixture();
    const facts = await f.collect();
    const first = await f.evaluate(null, 100, facts);
    const second = await f.evaluate(first, 110, facts);
    assert.equal(second.currentReadiness.ready, false);
    assert.equal(second.goal.state.readyCount, 1);
    assert.equal(second.goal.state.achievedAt, undefined);
});

test('goal_model_site_progress_does_not_complete_and_capacity_boundary_is_exact', async () => {
    const f = await modelFixture();
    delete f.home.terminal;
    f.objects.TerminalSite = { id: 'TerminalSite', kind: 'site', structureType: STRUCTURE_TERMINAL,
        pos: new RoomPosition(32, 24, 'W1N1'), progress: 100000, progressTotal: 100000 };
    const constructing = await f.evaluate();
    assert.equal(constructing.plan.phase, 'waiting_structure');
    assert.equal(constructing.currentReadiness.ready, false);
    f.terminal(19999);
    f.advance(110);
    const insufficient = await f.evaluate(constructing);
    assert.equal(insufficient.plan.phase, 'waiting_capacity');
    assert.equal(insufficient.goal.state.status, 'blocked');
});

for (const kind of ['stale', 'future', 'missing_version', 'recovery_stale', 'unknown_free', 'not_owned', 'unseen', 'recovering']) {
    test('goal_model_never_completes_with_' + kind, async () => {
        const f = await modelFixture();
        const first = await f.evaluate();
        f.advance(110);
        const facts = await f.collect();
        if (kind === 'stale') facts.capturedAt = 80;
        if (kind === 'future') facts.capturedAt = 111;
        if (kind === 'missing_version') facts.codeVersion = null;
        if (kind === 'recovery_stale') facts.rooms.W1N1.recovery.evaluatedAt = 50;
        if (kind === 'unknown_free') facts.rooms.W1N1.terminal.freeCapacity = null;
        if (kind === 'not_owned') facts.rooms.W1N1.owned = false;
        if (kind === 'unseen') facts.rooms.W1N1.visible = false;
        if (kind === 'recovering') facts.rooms.W1N1.recovery.mode = 'recovery';
        const result = await f.evaluate(first, 110, facts);
        assert.equal(result.currentReadiness.ready, false);
        assert.equal(result.goal.state.readyCount, 0);
        assert.equal(result.goal.state.status, 'blocked');
    });
}

for (const change of ['version', 'receiver', 'long_gap']) {
    test('goal_model_resets_evidence_on_' + change, async () => {
        const f = await modelFixture();
        const first = await f.evaluate();
        f.advance(change === 'long_gap' ? 130 : 110);
        const facts = await f.collect();
        if (change === 'version') facts.codeVersion = 'v2';
        if (change === 'receiver') facts.rooms.W1N1.terminal.id = 'Replacement';
        const result = await f.evaluate(first, Game.time, facts);
        assert.equal(result.currentReadiness.ready, false);
        assert.equal(result.goal.state.readyCount, 1);
    });
}

test('goal_model_historical_success_does_not_authorize_current_capacity', async () => {
    const f = await modelFixture();
    const first = await f.evaluate();
    f.advance(110);
    const achieved = await f.evaluate(first);
    const reset = JSON.parse(JSON.stringify(achieved));
    f.advance(120);
    f.terminal(19999);
    const insufficient = await f.evaluate(reset);
    assert.equal(insufficient.goal.state.status, 'achieved');
    assert.equal(insufficient.goal.state.achievedAt, 110);
    assert.equal(insufficient.currentReadiness.ready, false);
    assert.equal(insufficient.currentReadiness.status, 'blocked');
});

for (const status of ['cancelled', 'expired']) {
    test('goal_model_terminal_state_stays_inactive_' + status, async () => {
        const f = await modelFixture();
        const goal = { definition: { ...definition(), expiresAt: 105 }, state: { status: status === 'cancelled' ? status : 'tracking' } };
        const { evaluateGoalPlan } = await import('../governance/GoalPlanModel.js');
        const result = evaluateGoalPlan({ goal, facts: await f.collect(), now: status === 'expired' ? 110 : 100, policy });
        assert.equal(result.goal.state.status, status);
        assert.equal(result.plan.status, status);
        assert.equal(result.currentReadiness.status, 'inactive');
    });
}

async function registryFixture() {
    const f = await modelFixture();
    const { reconcileGoalPlanRegistry } = await import('../governance/GoalPlanRegistry.js');
    f.reconcile = async (registry = {}, definitions = [definition()], settings = policy) =>
        reconcileGoalPlanRegistry(registry, definitions, await f.collect(), Game.time, settings);
    return f;
}

test('goal_registry_explicit_definitions_only_and_duplicate_is_idempotent', async () => {
    const f = await registryFixture();
    assert.equal((await f.reconcile({}, [])).summary.goalCount, 0);
    const first = await f.reconcile({}, [definition(), definition()]);
    assert.equal(first.summary.goalCount, 1);
    const before = JSON.stringify(first.registry);
    const second = await f.reconcile(first.registry);
    assert.equal(JSON.stringify(second.registry), before);
    assert.equal(second.registry.goals['receiving:W1N1'].state.readyCount, 1);
});

test('goal_registry_caps_goals_and_plans_without_dropping_existing_records', async () => {
    const f = await registryFixture();
    const definitions = Array.from({ length: 21 }, (_, i) => definition('goal:' + i));
    const result = await f.reconcile({}, definitions);
    assert.equal(Object.keys(result.registry.goals).length, 20);
    assert.equal(Object.keys(result.registry.plans).length, 20);
    assert.ok(result.errors.includes('registry_full'));
    const again = await f.reconcile(result.registry, [definition('overflow')]);
    assert.equal(Object.keys(again.registry.goals).length, 20);
    assert.ok(again.registry.goals['goal:0']);
});

test('goal_registry_plan_capacity_failure_never_inserts_half_a_goal', async () => {
    const f = await registryFixture();
    const first = await f.reconcile({}, [definition('first')], { ...policy, maxPlans: 1 });
    const second = await f.reconcile(first.registry, [definition('second')], { ...policy, maxPlans: 1 });
    assert.equal(Object.keys(second.registry.goals).length, 1);
    assert.equal(second.registry.goals.second, undefined);
    assert.ok(second.errors.includes('registry_full'));
});

test('goal_registry_unknown_schema_and_conflicting_definitions_preserve_input', async () => {
    const f = await registryFixture();
    const first = await f.reconcile();
    const unknown = JSON.parse(JSON.stringify(first.registry));
    unknown.meta.schemaVersion = 99;
    const before = JSON.stringify(unknown);
    const refused = await f.reconcile(unknown);
    assert.ok(refused.errors.includes('unsupported_schema'));
    assert.equal(JSON.stringify(refused.registry), before);
    const conflict = await f.reconcile(first.registry, [{ ...definition(), createdAt: 101 }]);
    assert.ok(conflict.errors.length > 0);
    assert.equal(conflict.registry.goals['receiving:W1N1'].definition.createdAt, 100);
});

test('goal_registry_reset_and_cancel_keep_other_goal_and_do_not_extend_deadline', async () => {
    const f = await registryFixture();
    const definitions = [definition('first'), { ...definition('second'), expiresAt: 115 }];
    const first = await f.reconcile({}, definitions);
    const reset = JSON.parse(JSON.stringify(first.registry));
    reset.goals.first.state.status = 'cancelled';
    f.advance(110);
    const second = await f.reconcile(reset, definitions);
    assert.equal(second.registry.goals.first.state.status, 'cancelled');
    assert.equal(second.registry.goals.second.state.status, 'achieved');
    assert.equal(second.registry.goals.second.definition.expiresAt, 115);
    assert.equal(second.registry.plans['first:observe:v1'].budgetAllocated, 0);
});

test('goal_registry_state_change_history_is_bounded_and_duplicate_safe', async () => {
    const f = await registryFixture();
    let registry = (await f.reconcile()).registry;
    for (let i = 1; i <= 60; i++) {
        f.advance(100 + i * 10);
        global.RoomPhase.W1N1.recovery.mode = i % 2 ? 'recovery' : 'normal';
        registry = (await f.reconcile(registry)).registry;
    }
    assert.equal(registry.meta.events.length, 50);
    const repeated = await f.reconcile(registry);
    assert.deepEqual(repeated.registry.meta.events, registry.meta.events);
});

test('goal_service_default_off_never_seeds_goals_or_changes_existing_records', async () => {
    const f = await fixture();
    const { default: Service } = await import('../services/GoalPlanService.js');
    assert.equal(Memory.empire.control.policy.goalPlanning.enabled, false);
    const before = JSON.stringify(Memory);
    const service = new Service('GoalPlan');
    service.init(); service.analyze(); service.run(); service.cleanup();
    assert.equal(JSON.stringify(Memory), before);
    assert.equal(global.GoalPlan.status, 'inactive');
    assert.equal(f.spawnCalls.length, 0);
    assert.equal(f.createdSites.length, 0);
});

test('goal_service_disable_reenable_requires_new_evidence_and_has_no_active_mode', async () => {
    const f = await fixture();
    f.terminal();
    const { default: Service } = await import('../services/GoalPlanService.js');
    Memory.empire.control.policy.goalPlanning = { ...policy };
    Memory.empire.control.goals = { 'receiving:W1N1': { definition: definition(), state: { status: 'proposed' } } };
    Memory.empire.control.goalPlanningState = { schemaVersion: 1, events: [] };
    global.EmpireServicesVersion = 'test-v1';
    const service = new Service('GoalPlan');
    service.init(); service.analyze();
    assert.equal(global.GoalPlan.summary.readyCount, 0);
    const records = JSON.stringify(Memory.empire.control.goals);
    Memory.empire.control.policy.goalPlanning.enabled = false;
    Game.time = 105;
    service.init(); service.analyze();
    assert.equal(JSON.stringify(Memory.empire.control.goals), records);
    assert.equal(global.GoalPlan.status, 'inactive');
    Memory.empire.control.policy.goalPlanning.enabled = true;
    Game.time = 110; global.RoomPhase.W1N1.recovery.evaluatedAt = 110;
    service.init(); service.analyze();
    assert.equal(global.GoalPlan.summary.readyCount, 0);
    Game.time = 120; global.RoomPhase.W1N1.recovery.evaluatedAt = 120;
    service.init(); service.analyze();
    assert.equal(global.GoalPlan.summary.readyCount, 1);
    Memory.empire.control.policy.goalPlanning.mode = 'active';
    service.init(); service.analyze();
    assert.equal(global.GoalPlan.status, 'blocked');
    assert.equal(f.spawnCalls.length, 0);
});

test('goal_service_metrics_are_compact_and_never_copy_goal_records', async () => {
    const f = await fixture();
    const { default: Metrics } = await import('../services/EmpireMetricsService.js');
    global.GoalPlan = { tick: 100, status: 'evaluated', summary: { goalCount: 1, planCount: 1,
        achievedCount: 0, readyCount: 0, blockedCount: 1, reasonCodes: ['waiting_structure'] } };
    new Metrics('EmpireMetrics').cleanup();
    assert.equal(Memory.empire.control.metrics.goalPlanning.goalCount, 1);
    assert.equal(Memory.empire.control.metrics.goalPlanning.goals, undefined);
    assert.equal(Memory.empire.control.metrics.goalPlanning.plans, undefined);
    assert.equal(f.createdSites.length, 0);
});

test('goal_full_main_loop_shadow_changes_no_execution_trace', async () => {
    async function run(enabled) {
        const f = await fixture();
        f.terminal();
        delete global.EmpireServices; delete global.EmpireServicesVersion;
        delete global.EmpireTelemetry; delete global.GoalPlan;
        Memory.empire.control.policy.goalPlanning = { ...policy, enabled };
        Memory.empire.control.goals = { 'receiving:W1N1': { definition: definition(), state: { status: 'proposed' } } };
        Memory.empire.control.goalPlanningState = { schemaVersion: 1, events: [] };
        Game.creeps.CoreUpgrade.store.energy = 50;
        Game.creeps.CoreUpgrade.pos = new RoomPosition(15, 16, 'W1N1');
        const trace = [];
        for (const creep of Object.values(Game.creeps)) {
            for (const method of ['harvest', 'transfer', 'withdraw', 'pickup', 'build', 'repair', 'reserveController', 'upgradeController', 'moveTo', 'moveByPath', 'suicide']) {
                const original = creep[method];
                creep[method] = (...args) => {
                    trace.push({ creep: creep.name, method, args: args.map(arg => arg?.id || arg) });
                    return original(...args);
                };
            }
        }
        const publish = f.bus.publish;
        f.bus.publish = function (...args) { trace.push({ publish: args }); return publish.apply(this, args); };
        try {
            const main = await import('../main.js');
            main.loop();
            const names = global.EmpireServices.map(service => service.name);
            assert.ok(names.indexOf('GoalPlan') > names.indexOf('RoomGovernor'));
            assert.ok(names.indexOf('GoalPlan') < names.indexOf('SpawnBureau'));
            return { trace: JSON.parse(JSON.stringify(trace)), spawns: f.spawnCalls, sites: f.createdSites,
                ready: global.GoalPlan.summary?.readyCount || 0,
                remote: Memory.empire.control.policy.remoteMining.enabled,
                shadow: Memory.empire.control.policy.roomGovernor.shadow,
                enforce: Memory.empire.control.policy.scheduler.enforce };
        } finally { f.bus.publish = publish; }
    }
    const baseline = await run(false);
    const shadow = await run(true);
    assert.ok(baseline.trace.length > 0, 'baseline must exercise real existing actions');
    assert.deepEqual(shadow, baseline);
});

test('goal_facts_wrong_structure_cannot_masquerade_as_terminal', async () => {
    const f = await fixture();
    f.terminal();
    f.home.terminal.structureType = STRUCTURE_STORAGE;
    assert.notEqual((await f.collect()).rooms.W1N1.terminal.owned, true);
});

test('goal_model_invalid_optional_inputs_return_unknown_without_throwing', async () => {
    const f = await fixture();
    const { evaluateGoalPlan } = await import('../governance/GoalPlanModel.js');
    for (const goal of [undefined, null, { definition: definition(), state: 17 }]) {
        const result = evaluateGoalPlan({ goal, facts: await f.collect(), now: 100, policy });
        assert.equal(result.currentReadiness.ready, false);
        assert.ok(result.currentReadiness.reasons.includes('invalid_goal_plan'));
    }
});

for (const state of [17, 'tracking', { status: 'unknown-status' }]) {
    test('goal_registry_malformed_state_is_preserved_and_refused_' + JSON.stringify(state), async () => {
        const f = await registryFixture();
        const first = await f.reconcile();
        first.registry.goals['receiving:W1N1'].state = state;
        const before = JSON.stringify(first.registry);
        const result = await f.reconcile(first.registry);
        assert.ok(result.errors.includes('invalid_registry'));
        assert.equal(JSON.stringify(result.registry), before);
        assert.equal(result.summary.readyCount, 0);
    });
}

test('goal_service_invalid_registry_never_crashes_or_republishes_stale_ready', async () => {
    const f = await registryFixture();
    let result = await f.reconcile();
    f.advance(110);
    result = await f.reconcile(result.registry);
    const { default: Service } = await import('../services/GoalPlanService.js');
    Memory.empire.control.policy.goalPlanning = { ...policy };
    Memory.empire.control.goals = result.registry.goals;
    Memory.empire.control.plans = result.registry.plans;
    Memory.empire.control.goalPlanningState = { ...result.registry.meta, schemaVersion: 99 };
    const service = new Service('GoalPlan');
    service.init(); service.analyze();
    assert.equal(global.GoalPlan.status, 'blocked');
    assert.ok(global.GoalPlan.goals.every(goal => goal.currentReadiness?.ready !== true));
    Memory.empire.control.goals = { broken: null };
    Memory.empire.control.plans = {};
    Memory.empire.control.goalPlanningState = { schemaVersion: 1, events: [] };
    const before = JSON.stringify(Memory.empire.control.goals);
    service.init();
    assert.doesNotThrow(() => service.analyze());
    assert.equal(JSON.stringify(Memory.empire.control.goals), before);
    assert.equal(global.GoalPlan.status, 'blocked');
});

test('goal_metrics_never_relabels_old_ready_snapshot_as_current', async () => {
    await fixture();
    const { default: Metrics } = await import('../services/EmpireMetricsService.js');
    global.GoalPlan = { tick: 90, status: 'evaluated', summary: { goalCount: 1, readyCount: 1 } };
    new Metrics('EmpireMetrics').cleanup();
    assert.equal(Memory.empire.control.metrics.goalPlanning.status, 'stale');
    assert.equal(Memory.empire.control.metrics.goalPlanning.readyCount, 0);
});

test('goal_registry_never_copies_unbounded_definition_fields_into_memory', async () => {
    const f = await registryFixture();
    const invalid = { ...definition(), roomName: 'W' + '1'.repeat(1000) + 'N1' };
    const result = await f.reconcile({}, [invalid]);
    assert.equal(result.summary.goalCount, 0);
    assert.ok(result.errors.includes('invalid_goal_definition'));
});

test('goal_model_and_registry_work_without_Game_or_Memory', async () => {
    const f = await fixture();
    const facts = await f.collect();
    const { evaluateGoalPlan } = await import('../governance/GoalPlanModel.js');
    const { reconcileGoalPlanRegistry } = await import('../governance/GoalPlanRegistry.js');
    const savedGame = global.Game, savedMemory = global.Memory;
    delete global.Game; delete global.Memory;
    try {
        assert.doesNotThrow(() => evaluateGoalPlan({ goal: { definition: definition() }, facts, now: 100, policy }));
        assert.equal(reconcileGoalPlanRegistry({}, [definition()], facts, 100, policy).summary.goalCount, 1);
    } finally { global.Game = savedGame; global.Memory = savedMemory; }
});

for (const field of ['goals', 'plans']) {
    for (const invalid of [null, [], 17]) {
        test('goal_service_preserves_invalid_namespace_' + field + '_' + JSON.stringify(invalid), async () => {
            await fixture();
            const { default: Service } = await import('../services/GoalPlanService.js');
            Memory.empire.control.policy.goalPlanning = { ...policy };
            Memory.empire.control.goalPlanningState = { schemaVersion: 1, events: [] };
            Memory.empire.control[field] = invalid;
            const before = JSON.stringify(Memory.empire.control[field]);
            const service = new Service('GoalPlan');
            service.init(); service.analyze();
            assert.equal(global.GoalPlan.status, 'blocked');
            assert.equal(JSON.stringify(Memory.empire.control[field]), before);
        });
    }
}
