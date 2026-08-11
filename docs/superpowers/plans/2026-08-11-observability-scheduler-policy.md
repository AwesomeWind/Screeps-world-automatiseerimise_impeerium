# Empire Observability, Scheduler, and Policy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立统一人工 Policy、有限事件记录、服务级 CPU 遥测、默认影子运行的 CPU 调度器和只读房间业务快照，同时保持现有角色配比、经济决策和服务执行结果不变。

**Architecture:** 新增小型 `config/core/services` 模块，由 `MemoryConfig` 初始化控制平面，由 `main.js` 统一测量并咨询调度器。调度器默认 `enforce: false`，因此只记录“本可跳过”的决策而不跳过任何服务；`EmpireMetricsService` 只消费现有 `Game/global/Memory` 状态并定期持久化快照，不发布需求或修改 creep 任务。

**Tech Stack:** Screeps JavaScript ES modules、Rollup 4、Node.js `assert` smoke tests、Screeps `Game/Memory/global` API。

## Global Constraints

- 执行前先完成、提交或明确纳入当前 cityPlan canonical/legacy 迁移；不得覆盖工作区中已有的用户修改。
- 默认全自动，但所有人工干预统一通过 `Memory.empire.control.policy`；安全底线后续拥有更高优先级。
- 本计划不实现 RoomGovernor、Goal/Plan、角色能力预算、自动扩张、工业或战争决策。
- `Memory.empire.control.schemaVersion` 固定从 `1` 开始；迁移必须幂等，不删除现有 `Memory.empire` 字段。
- 调度器默认 `enforce: false`；默认配置下所有现有 service 的四个生命周期方法仍按当前顺序执行。
- CPU 阈值必须存放在 Policy 中，不散落为各 service 的硬编码判断。
- 高频 tick 明细保存在 `global.EmpireTelemetry`；Memory 仅保存 EWMA 摘要、当前姿态、有限事件和低频业务快照。
- 事件列表默认最多 `50` 条；业务快照默认每 `10` tick 更新一次。
- 新行为先写失败测试，再写最小实现；每个任务结束运行 `npm test` 并单独提交。

## File Structure

- Create `src/config/EmpirePolicy.js`: 控制平面默认值、幂等初始化、人工覆盖解析。
- Create `src/core/EmpireEventLog.js`: 固定长度重大事件队列。
- Create `src/core/RuntimeTelemetry.js`: 单 tick CPU 测量和跨 tick EWMA 摘要。
- Create `src/core/ServiceScheduler.js`: service 分级、CPU 姿态滞回和影子/执行调度决策。
- Create `src/services/EmpireMetricsService.js`: 低频房间业务快照，只读现有状态。
- Modify `src/config/MemoryConfig.js`: 在现有默认值之后初始化控制平面。
- Modify `src/main.js`: 接入遥测、调度器、事件和业务快照服务，保持现有顺序。
- Modify `src/tests/smoke.cjs`: 增加文件合约和行为回归测试。
- Modify `src/AGENTS.md`: 记录新的运行顺序、Memory/global 边界和影子调度约束。

---

### Task 1: 统一 Empire Policy 与 Memory 合约

**Files:**
- Create: `src/config/EmpirePolicy.js`
- Modify: `src/config/MemoryConfig.js:1-30`
- Modify: `src/tests/smoke.cjs:25-75,365-531`

**Interfaces:**
- Produces: `ensureEmpireControl(): object`
- Produces: `resolvePolicy(key: string, context?: { roomName?: string }, fallback?: unknown): unknown`
- Produces: `DEFAULT_EMPIRE_POLICY: object`
- Memory contract: `Memory.empire.control = { schemaVersion, policy, runtime, telemetry, metrics, events }`

- [ ] **Step 1: 在 expectedFiles 和动态导入区写失败测试**

在 `expectedFiles` 加入：

```js
'src/config/EmpirePolicy.js',
```

在 `runBehaviorChecks()` 的 import 区加入：

```js
const {
    ensureEmpireControl,
    resolvePolicy,
    DEFAULT_EMPIRE_POLICY
} = await import('../config/EmpirePolicy.js');
```

在 MemoryConfig 行为测试附近加入：

```js
Memory.empire = { market: { enabled: false }, existingField: { keep: true } };
Game.time = 100;
const control = ensureEmpireControl();
assert.strictEqual(control.schemaVersion, 1, 'empire control should start at schema version 1');
assert.strictEqual(control.policy.autoExpansion, true, 'empire policy should default to automatic expansion');
assert.strictEqual(control.policy.autoWar, true, 'empire policy should default to automatic war decisions');
assert.strictEqual(control.policy.scheduler.enforce, false, 'scheduler should start in shadow mode');
assert.deepStrictEqual(Memory.empire.existingField, { keep: true }, 'control initialization should preserve existing empire memory');

control.policy.overrides = {
    empire: {
        autoExpansion: { value: false, reason: 'manual pause', expiresAt: 120 }
    },
    rooms: {
        W1N1: {
            autoExpansion: { value: true, reason: 'room exception', expiresAt: 120 }
        }
    }
};
assert.strictEqual(resolvePolicy('autoExpansion', { roomName: 'W1N1' }), true, 'room override should outrank empire override');
assert.strictEqual(resolvePolicy('autoExpansion', { roomName: 'W2N2' }), false, 'empire override should outrank the default policy');
Game.time = 121;
assert.strictEqual(resolvePolicy('autoExpansion', { roomName: 'W1N1' }), true, 'expired overrides should fall back to the default policy');
assert.strictEqual(DEFAULT_EMPIRE_POLICY.telemetry.eventLimit, 50, 'event history should have a bounded default limit');
```

- [ ] **Step 2: 运行测试并确认因模块缺失而失败**

Run: `npm test`

Expected: FAIL，错误包含 `Cannot find module '../config/EmpirePolicy.js'` 或 expected file 缺失。

- [ ] **Step 3: 实现最小 Policy 模块**

创建 `src/config/EmpirePolicy.js`：

```js
export const EMPIRE_CONTROL_SCHEMA_VERSION = 1;

export const DEFAULT_EMPIRE_POLICY = {
    autoExpansion: true,
    autoMarket: true,
    autoWar: true,
    scheduler: {
        enforce: false,
        constrainedBelow: 7000,
        criticalBelow: 3000,
        recoveryAbove: 8000
    },
    telemetry: {
        enabled: true,
        persistInterval: 10,
        eventLimit: 50,
        metricsInterval: 10
    },
    overrides: {
        empire: {},
        rooms: {}
    }
};

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function mergeDefaults(target, defaults) {
    for (const key in defaults) {
        const fallback = defaults[key];
        if (target[key] === undefined) target[key] = clone(fallback);
        else if (fallback && typeof fallback === 'object' && !Array.isArray(fallback)) {
            mergeDefaults(target[key], fallback);
        }
    }
    return target;
}

export function ensureEmpireControl() {
    if (!Memory.empire) Memory.empire = {};
    if (!Memory.empire.control) Memory.empire.control = {};
    const control = Memory.empire.control;
    if (control.schemaVersion === undefined) control.schemaVersion = EMPIRE_CONTROL_SCHEMA_VERSION;
    if (!control.policy) control.policy = {};
    mergeDefaults(control.policy, DEFAULT_EMPIRE_POLICY);
    if (!control.runtime) control.runtime = {};
    if (!control.telemetry) control.telemetry = {};
    if (!control.metrics) control.metrics = { rooms: {} };
    if (!control.events) control.events = [];
    return control;
}

function activeOverride(entry) {
    if (!entry || typeof entry !== 'object' || entry.value === undefined) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt < Game.time) return undefined;
    return entry.value;
}

export function resolvePolicy(key, context = {}, fallback) {
    const policy = ensureEmpireControl().policy;
    const roomOverride = context.roomName && policy.overrides.rooms[context.roomName] ?
        activeOverride(policy.overrides.rooms[context.roomName][key]) : undefined;
    if (roomOverride !== undefined) return roomOverride;
    const empireOverride = activeOverride(policy.overrides.empire[key]);
    if (empireOverride !== undefined) return empireOverride;
    return policy[key] === undefined ? fallback : policy[key];
}
```

在 `MemoryConfig.ensureDefaults()` 初始化 `Memory.empire` 后调用：

```js
ensureEmpireControl();
```

并在文件顶部导入：

```js
import { ensureEmpireControl } from './EmpirePolicy.js';
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test`

Expected: `smoke checks passed`。

- [ ] **Step 5: 提交 Policy 基础**

```bash
git add src/config/EmpirePolicy.js src/config/MemoryConfig.js src/tests/smoke.cjs
git commit -m "feat: add empire policy foundation"
```

---

### Task 2: 固定长度帝国事件记录

**Files:**
- Create: `src/core/EmpireEventLog.js`
- Modify: `src/tests/smoke.cjs:25-75,365-531`

**Interfaces:**
- Consumes: `ensureEmpireControl()` from Task 1
- Produces: `recordEmpireEvent(type: string, severity?: string, data?: object): object`
- Produces: `getEmpireEvents(): object[]`

- [ ] **Step 1: 写入事件顺序、裁剪和不可变输入的失败测试**

```js
const { recordEmpireEvent, getEmpireEvents } = await import('../core/EmpireEventLog.js');

Memory.empire.control.events = [];
Memory.empire.control.policy.telemetry.eventLimit = 2;
Game.time = 200;
const input = { roomName: 'W1N1' };
recordEmpireEvent('cpu_mode_changed', 'warning', input);
Game.time = 201;
recordEmpireEvent('goal_paused', 'info', { goalId: 'g1' });
Game.time = 202;
recordEmpireEvent('room_recovered', 'info', { roomName: 'W1N1' });
assert.deepStrictEqual(getEmpireEvents().map((event) => event.type), ['goal_paused', 'room_recovered'], 'event log should retain only the newest bounded entries');
assert.deepStrictEqual(input, { roomName: 'W1N1' }, 'event recording should not mutate caller data');
assert.strictEqual(getEmpireEvents()[1].tick, 202, 'event log should record the game tick');
```

同时把 `src/core/EmpireEventLog.js` 加入 `expectedFiles`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现有限事件队列**

```js
import { ensureEmpireControl } from '../config/EmpirePolicy.js';

export function recordEmpireEvent(type, severity = 'info', data = {}) {
    const control = ensureEmpireControl();
    const event = {
        type,
        severity,
        tick: Game.time,
        data: { ...data }
    };
    control.events.push(event);
    const limit = Math.max(1, control.policy.telemetry.eventLimit || 50);
    if (control.events.length > limit) control.events.splice(0, control.events.length - limit);
    return event;
}

export function getEmpireEvents() {
    return ensureEmpireControl().events;
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test`

Expected: `smoke checks passed`。

- [ ] **Step 5: 提交事件记录**

```bash
git add src/core/EmpireEventLog.js src/tests/smoke.cjs
git commit -m "feat: add bounded empire event log"
```

---

### Task 3: 服务级 CPU RuntimeTelemetry

**Files:**
- Create: `src/core/RuntimeTelemetry.js`
- Modify: `src/tests/smoke.cjs:25-75,365-531`

**Interfaces:**
- Consumes: `ensureEmpireControl()` from Task 1
- Produces singleton methods: `beginTick()`, `measure(name, phase, callback)`, `finishTick()`
- Produces current tick state: `global.EmpireTelemetry = { tick, services, totalCpu, errors }`
- Persists: `Memory.empire.control.telemetry = { updatedAt, totalCpuEwma, services }`

- [ ] **Step 1: 写入 CPU 累加、返回值、异常重抛和无 CPU API 的失败测试**

```js
const { default: RuntimeTelemetry } = await import('../core/RuntimeTelemetry.js');

const previousCpu = Game.cpu;
let usedCpu = 10;
Game.cpu = { bucket: 9000, getUsed: () => usedCpu };
Game.time = 300;
Memory.empire.control.policy.telemetry.persistInterval = 1;
RuntimeTelemetry.beginTick();
const result = RuntimeTelemetry.measure('FakeService', 'analyze', () => {
    usedCpu = 11.25;
    return 'ok';
});
assert.strictEqual(result, 'ok', 'telemetry wrapper should return callback results');
RuntimeTelemetry.finishTick();
assert.strictEqual(global.EmpireTelemetry.services.FakeService.analyze, 1.25, 'telemetry should record phase CPU deltas');
assert.strictEqual(Memory.empire.control.telemetry.services.FakeService.analyzeEwma, 1.25, 'telemetry should persist phase EWMA');

RuntimeTelemetry.beginTick();
assert.throws(() => RuntimeTelemetry.measure('BrokenService', 'run', () => {
    usedCpu = 12;
    throw new Error('boom');
}), /boom/, 'telemetry should preserve existing error propagation');
assert.strictEqual(global.EmpireTelemetry.errors.BrokenService.run, 1, 'telemetry should count measured errors');

delete Game.cpu;
assert.strictEqual(RuntimeTelemetry.measure('NoCpu', 'init', () => 42), 42, 'telemetry should preserve behavior when Game.cpu is unavailable');
Game.cpu = previousCpu;
```

把 `src/core/RuntimeTelemetry.js` 加入 `expectedFiles`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 tick 测量与 EWMA**

实现要点必须与以下接口一致：

```js
import { ensureEmpireControl } from '../config/EmpirePolicy.js';

const ALPHA = 0.2;

function cpuUsed() {
    return Game.cpu && typeof Game.cpu.getUsed === 'function' ? Game.cpu.getUsed() : null;
}

function ewma(previous, current) {
    return previous === undefined ? current : previous + ALPHA * (current - previous);
}

const RuntimeTelemetry = {
    beginTick() {
        global.EmpireTelemetry = {
            tick: Game.time,
            startedAt: cpuUsed(),
            services: {},
            totalCpu: 0,
            errors: {}
        };
    },

    measure(name, phase, callback) {
        if (!global.EmpireTelemetry) this.beginTick();
        const start = cpuUsed();
        try {
            return callback();
        } catch (error) {
            if (!global.EmpireTelemetry.errors[name]) global.EmpireTelemetry.errors[name] = {};
            global.EmpireTelemetry.errors[name][phase] = (global.EmpireTelemetry.errors[name][phase] || 0) + 1;
            throw error;
        } finally {
            const end = cpuUsed();
            if (start !== null && end !== null) {
                if (!global.EmpireTelemetry.services[name]) global.EmpireTelemetry.services[name] = {};
                global.EmpireTelemetry.services[name][phase] =
                    (global.EmpireTelemetry.services[name][phase] || 0) + Math.max(0, end - start);
            }
        }
    },

    finishTick() {
        if (!global.EmpireTelemetry) return;
        const end = cpuUsed();
        const state = global.EmpireTelemetry;
        state.totalCpu = state.startedAt !== null && end !== null ? Math.max(0, end - state.startedAt) : 0;
        const control = ensureEmpireControl();
        const interval = Math.max(1, control.policy.telemetry.persistInterval || 10);
        if (Game.time % interval !== 0) return;
        const saved = control.telemetry;
        saved.updatedAt = Game.time;
        saved.totalCpuEwma = ewma(saved.totalCpuEwma, state.totalCpu);
        if (!saved.services) saved.services = {};
        for (const name in state.services) {
            if (!saved.services[name]) saved.services[name] = {};
            for (const phase in state.services[name]) {
                const key = `${phase}Ewma`;
                saved.services[name][key] = ewma(saved.services[name][key], state.services[name][phase]);
            }
        }
    }
};

export default RuntimeTelemetry;
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test`

Expected: `smoke checks passed`。

- [ ] **Step 5: 提交 RuntimeTelemetry**

```bash
git add src/core/RuntimeTelemetry.js src/tests/smoke.cjs
git commit -m "feat: add service cpu telemetry"
```

---

### Task 4: CPU 姿态与影子 ServiceScheduler

**Files:**
- Create: `src/core/ServiceScheduler.js`
- Modify: `src/tests/smoke.cjs:25-75,365-531`

**Interfaces:**
- Consumes: `ensureEmpireControl()` from Task 1
- Consumes: `recordEmpireEvent()` from Task 2
- Produces singleton methods: `beginTick()`, `decision(serviceName, phase)`
- Decision shape: `{ shouldRun: boolean, wouldRun: boolean, tier: string, mode: string, reason: string }`
- Persists current mode at `Memory.empire.control.runtime.cpuMode`

- [ ] **Step 1: 写入姿态滞回、分级和 shadow/enforce 失败测试**

```js
const { default: ServiceScheduler } = await import('../core/ServiceScheduler.js');

Memory.empire.control.policy.scheduler = {
    enforce: false,
    constrainedBelow: 7000,
    criticalBelow: 3000,
    recoveryAbove: 8000
};
Game.cpu = { bucket: 2500, getUsed: () => 0 };
Game.time = 400;
ServiceScheduler.beginTick();
const shadow = ServiceScheduler.decision('CityPlanDebug', 'analyze');
assert.strictEqual(shadow.mode, 'critical', 'low bucket should enter critical mode');
assert.strictEqual(shadow.wouldRun, false, 'critical mode should recommend skipping P3 work');
assert.strictEqual(shadow.shouldRun, true, 'shadow mode should preserve existing execution');

Memory.empire.control.policy.scheduler.enforce = true;
const enforced = ServiceScheduler.decision('CityPlanDebug', 'analyze');
assert.strictEqual(enforced.shouldRun, false, 'enforced scheduler should skip optional work');
assert.strictEqual(ServiceScheduler.decision('Spawn', 'run').shouldRun, true, 'P0 services should run in critical mode');
assert.strictEqual(ServiceScheduler.decision('CityPlanDebug', 'init').shouldRun, true, 'scheduler should never skip service initialization');
assert.strictEqual(ServiceScheduler.decision('CityPlanDebug', 'cleanup').shouldRun, true, 'scheduler should never skip service cleanup');

Game.cpu.bucket = 7500;
ServiceScheduler.beginTick();
assert.strictEqual(Memory.empire.control.runtime.cpuMode, 'recovery', 'critical mode should enter recovery before normal');
Game.cpu.bucket = 8500;
ServiceScheduler.beginTick();
assert.strictEqual(Memory.empire.control.runtime.cpuMode, 'normal', 'recovery should exit only above recovery threshold');
```

把 `src/core/ServiceScheduler.js` 加入 `expectedFiles`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现明确分级和滞回状态机**

```js
import { ensureEmpireControl } from '../config/EmpirePolicy.js';
import { recordEmpireEvent } from './EmpireEventLog.js';

const P0 = new Set([
    'RoomCache', 'WarIntel', 'WarStrategy', 'CombatPlanner', 'Security', 'RoomPhase',
    'SpawnBureau', 'Spawn', 'TaskGuard', 'ResourceMarket', 'MinerStrategy',
    'BuilderStrategy', 'RepairerStrategy', 'HaulerStrategy', 'UpgraderStrategy',
    'DefenderStrategy', 'Link', 'StructureLifecycle', 'CreepRetirement', 'TowerDefense'
]);
const P1 = new Set(['EmpireMetrics']);
const P2 = new Set(['CityPlanner', 'DefensePlanner', 'MaintenancePlanner', 'RoadPlanner', 'Lab', 'Market', 'RemoteMining']);
const P3 = new Set(['CityPlanDebug']);

function tierFor(name) {
    if (P0.has(name)) return 'P0';
    if (P1.has(name)) return 'P1';
    if (P2.has(name)) return 'P2';
    if (P3.has(name)) return 'P3';
    return 'P0';
}

function nextMode(previous, bucket, policy) {
    if (bucket === null) return 'normal';
    if (bucket < policy.criticalBelow) return 'critical';
    if (previous === 'critical' && bucket < policy.recoveryAbove) return 'recovery';
    if (previous === 'recovery' && bucket < policy.recoveryAbove) return 'recovery';
    if (bucket < policy.constrainedBelow) return 'constrained';
    return 'normal';
}

function allowed(mode, tier, phase) {
    if (phase === 'init' || phase === 'cleanup') return true;
    if (mode === 'critical') return tier === 'P0' || tier === 'P1';
    if (mode === 'constrained' || mode === 'recovery') return tier !== 'P3';
    return true;
}

const ServiceScheduler = {
    beginTick() {
        const control = ensureEmpireControl();
        const policy = control.policy.scheduler;
        const previous = control.runtime.cpuMode || 'normal';
        const bucket = Game.cpu && typeof Game.cpu.bucket === 'number' ? Game.cpu.bucket : null;
        const mode = nextMode(previous, bucket, policy);
        control.runtime.cpuMode = mode;
        control.runtime.cpuBucket = bucket;
        control.runtime.cpuModeEvaluatedAt = Game.time;
        if (mode !== previous) recordEmpireEvent('cpu_mode_changed', mode === 'critical' ? 'warning' : 'info', { from: previous, to: mode, bucket });
        return mode;
    },

    decision(serviceName, phase) {
        const control = ensureEmpireControl();
        const mode = control.runtime.cpuMode || 'normal';
        const tier = tierFor(serviceName);
        const wouldRun = allowed(mode, tier, phase);
        const enforce = control.policy.scheduler.enforce === true;
        return {
            shouldRun: enforce ? wouldRun : true,
            wouldRun,
            tier,
            mode,
            reason: wouldRun ? 'scheduled' : `${mode}_${tier}_deferred_${phase}`
        };
    }
};

export default ServiceScheduler;
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test`

Expected: `smoke checks passed`。

- [ ] **Step 5: 提交 Scheduler**

```bash
git add src/core/ServiceScheduler.js src/tests/smoke.cjs
git commit -m "feat: add shadow cpu scheduler"
```

---

### Task 5: 在主循环接入测量与影子调度

**Files:**
- Modify: `src/main.js:1-100`
- Modify: `src/tests/smoke.cjs:82-200,365-531`

**Interfaces:**
- Consumes: `RuntimeTelemetry.beginTick/measure/finishTick()` from Task 3
- Consumes: `ServiceScheduler.beginTick/decision()` from Task 4
- Produces internal helper: `runServicePhase(services, phase): void`
- Preserves lifecycle order: all `init`, all `analyze`, EventBus, all `run`, ActionParser, all `cleanup`

- [ ] **Step 1: 写入静态顺序与默认 shadow 行为失败测试**

新增源码合约断言：

```js
const mainSource = read('src/main.js');
assertContains(mainSource, "RuntimeTelemetry.measure(service.name, phase", 'main loop should measure every service phase');
assertContains(mainSource, "ServiceScheduler.decision(service.name, phase)", 'main loop should consult the scheduler');
assertContains(mainSource, "RuntimeTelemetry.measure('EventBus', 'dispatch'", 'main loop should measure event dispatch');
assertContains(mainSource, "RuntimeTelemetry.measure('ActionParser', 'run'", 'main loop should measure creep action execution');
assert.ok(mainSource.indexOf("runServicePhase(services, 'init')") < mainSource.indexOf("runServicePhase(services, 'analyze')"), 'init should remain before analyze');
assert.ok(mainSource.indexOf("runServicePhase(services, 'analyze')") < mainSource.indexOf("EventBus.dispatch()"), 'analyze should remain before event dispatch');
assert.ok(mainSource.indexOf("EventBus.dispatch()") < mainSource.indexOf("runServicePhase(services, 'run')"), 'event dispatch should remain before service run');
assert.ok(mainSource.indexOf("runServicePhase(services, 'run')") < mainSource.indexOf("ActionParser.run"), 'service run should remain before creep actions');
assert.ok(mainSource.indexOf("ActionParser.run") < mainSource.indexOf("runServicePhase(services, 'cleanup')"), 'creep actions should remain before cleanup');
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test`

Expected: FAIL，缺少 `RuntimeTelemetry.measure` 或 `ServiceScheduler.decision`。

- [ ] **Step 3: 最小化改造 main 生命周期**

在 `src/main.js` 导入：

```js
import RuntimeTelemetry from './core/RuntimeTelemetry.js';
import ServiceScheduler from './core/ServiceScheduler.js';
```

新增：

```js
function runServicePhase(services, phase) {
    for (const service of services) {
        const decision = ServiceScheduler.decision(service.name, phase);
        if (!decision.shouldRun) continue;
        RuntimeTelemetry.measure(service.name, phase, () => service[phase]());
    }
}
```

将 `loop()` 生命周期改为：

```js
export function loop() {
    prepareMemory();
    MemoryConfig.ensureDefaults();
    RuntimeTelemetry.beginTick();
    ServiceScheduler.beginTick();

    const services = getServices();
    EventBus.beginTick();

    runServicePhase(services, 'init');
    runServicePhase(services, 'analyze');

    RuntimeTelemetry.measure('EventBus', 'dispatch', () => EventBus.dispatch());

    runServicePhase(services, 'run');
    RuntimeTelemetry.measure('ActionParser', 'run', () => {
        for (const name in Game.creeps) ActionParser.run(Game.creeps[name]);
    });
    runServicePhase(services, 'cleanup');
    RuntimeTelemetry.finishTick();
}
```

不要在本任务加入异常吞噬；`RuntimeTelemetry.measure` 必须继续重抛错误，保持当前故障语义。

- [ ] **Step 4: 运行测试与构建**

Run: `npm test`

Expected: `smoke checks passed`。

Run: `npm run build`

Expected: Rollup 成功生成 `dist/main.js`，输出“未指定目标，代码将被编译但不会上传”。

- [ ] **Step 5: 提交主循环接入**

```bash
git add src/main.js src/tests/smoke.cjs
git commit -m "feat: instrument service lifecycle"
```

---

### Task 6: 只读房间业务快照

**Files:**
- Create: `src/services/EmpireMetricsService.js`
- Modify: `src/main.js:5-69`
- Modify: `src/tests/smoke.cjs:25-75,365-531`

**Interfaces:**
- Consumes: `global.RoomPhase`, `global.ResourceMarket`, `Game.rooms`, `Game.creeps`
- Produces: `Memory.empire.control.metrics.rooms[roomName]`
- Snapshot fields: `capturedAt`, `phase`, `energyPosture`, `energyAvailable`, `energyCapacity`, `spawnEnergyRatio`, `storageEnergy`, `constructionPressure`, `maintenancePressure`, `roleCounts`, `spawningCount`, `resourceMarketStats`
- Must not call `EventBus.publish`, `assignTask`, `spawnCreep`, `createConstructionSite`, `Game.market.deal` or mutate creep memory.

- [ ] **Step 1: 写入快照内容、单次 creep 遍历结果和只读边界测试**

```js
const { default: EmpireMetricsService } = await import('../services/EmpireMetricsService.js');

Memory.empire.control.policy.telemetry.metricsInterval = 10;
Memory.empire.control.metrics = { rooms: {} };
Game.time = 500;
Game.rooms = {
    W1N1: {
        name: 'W1N1',
        controller: { my: true },
        energyAvailable: 400,
        energyCapacityAvailable: 550,
        storage: { store: { getUsedCapacity: () => 120000 } }
    }
};
Game.creeps = {
    M1: { memory: { role: 'miner', homeRoom: 'W1N1' } },
    H1: { memory: { role: 'hauler', homeRoom: 'W1N1' } }
};
Game.spawns = {
    Spawn1: { room: Game.rooms.W1N1, spawning: { name: 'NewMiner' } }
};
global.RoomPhase = {
    W1N1: {
        phase: 'storage',
        energyPosture: 'normal',
        spawnEnergyRatio: 0.72,
        constructionPressure: 3,
        maintenancePressure: 2
    }
};
global.ResourceMarket = { W1N1: { stats: { supplies: 4, demands: 3 } } };
new EmpireMetricsService('EmpireMetrics').cleanup();
assert.deepStrictEqual(Memory.empire.control.metrics.rooms.W1N1.roleCounts, { miner: 1, hauler: 1 }, 'metrics should aggregate role counts by home room');
assert.strictEqual(Memory.empire.control.metrics.rooms.W1N1.storageEnergy, 120000, 'metrics should record storage energy');
assert.strictEqual(Memory.empire.control.metrics.rooms.W1N1.spawningCount, 1, 'metrics should record active room spawns');
assert.deepStrictEqual(Game.creeps.M1.memory, { role: 'miner', homeRoom: 'W1N1' }, 'metrics should not mutate creep memory');
```

同时断言源文件不包含禁止调用：

```js
const metricsSource = read('src/services/EmpireMetricsService.js');
for (const forbidden of ['EventBus.publish', 'assignTask(', 'spawnCreep(', 'createConstructionSite(', 'Game.market.deal']) {
    assertNotContains(metricsSource, forbidden, 'empire metrics should remain read-only');
}
```

把文件加入 `expectedFiles`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现低频快照服务**

创建继承 `BaseService` 的 `EmpireMetricsService`。`cleanup()` 仅在 `Game.time % metricsInterval === 0` 时运行；先一次遍历 `Game.creeps` 构建 `roleCountsByRoom`，一次遍历 `Game.spawns` 构建 `spawningByRoom`，然后遍历己方可见房间写入快照。Storage API 缺失时返回 `0`；缺失 RoomPhase/ResourceMarket 时写入 `null` 或空对象，不抛错。

核心写入应保持此形状：

```js
control.metrics.rooms[roomName] = {
    capturedAt: Game.time,
    phase: phase.phase || null,
    energyPosture: phase.energyPosture || null,
    energyAvailable: room.energyAvailable || 0,
    energyCapacity: room.energyCapacityAvailable || 0,
    spawnEnergyRatio: phase.spawnEnergyRatio === undefined ? null : phase.spawnEnergyRatio,
    storageEnergy,
    constructionPressure: phase.constructionPressure || 0,
    maintenancePressure: phase.maintenancePressure || 0,
    roleCounts: roleCountsByRoom[roomName] || {},
    spawningCount: spawningByRoom[roomName] || 0,
    resourceMarketStats: market && market.stats ? { ...market.stats } : {}
};
```

在 `createServices()` 的最后加入：

```js
new EmpireMetricsService('EmpireMetrics')
```

确保它位于 `RemoteMining` 之后，使 cleanup 快照尽可能接近 tick 结束。

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test`

Expected: `smoke checks passed`。

- [ ] **Step 5: 提交业务快照**

```bash
git add src/services/EmpireMetricsService.js src/main.js src/tests/smoke.cjs
git commit -m "feat: capture empire room metrics"
```

---

### Task 7: 文档、影子模式验收与全量验证

**Files:**
- Modify: `src/AGENTS.md`
- Verify: `docs/superpowers/specs/2026-08-11-empire-command-center-design.md`
- Verify: all files changed by Tasks 1-6

**Interfaces:**
- Documents the exact Memory paths and runtime guarantees introduced above.
- Produces no new runtime interface.

- [ ] **Step 1: 更新 src 运行契约文档**

在 `src/AGENTS.md` 增加“帝国控制基础层”章节，明确：

```markdown
## 帝国控制基础层

- `Memory.empire.control.policy` 是人工战略配置入口；不要在各 service 新增分散的全局战略开关。
- `global.EmpireTelemetry` 保存当前 tick 的服务耗时；持久摘要位于 `Memory.empire.control.telemetry`。
- `ServiceScheduler` 默认 `enforce: false`，此时只记录影子决策，不允许改变既有 service 生命周期执行。
- `EmpireMetricsService` 只读现有状态，不发布需求、不分配任务、不执行游戏动作。
- CPU 阈值必须通过 policy 配置；在积累真实数据前不得以当前默认值宣称已经完成性能调优。
```

并更新生命周期说明：`MemoryConfig.ensureDefaults()` 后开始 telemetry/scheduler，所有 service cleanup 后调用 `RuntimeTelemetry.finishTick()`。

- [ ] **Step 2: 增加最终静态安全断言**

在 smoke 测试加入：

```js
assertContains(read('src/config/EmpirePolicy.js'), 'enforce: false', 'scheduler should default to shadow mode');
assertNotContains(read('src/core/RuntimeTelemetry.js'), 'Memory.rooms', 'runtime telemetry should not mutate room strategy state');
assertNotContains(read('src/core/ServiceScheduler.js'), 'creep.memory', 'scheduler should not mutate creep state');
assertContains(read('src/AGENTS.md'), 'ServiceScheduler` 默认 `enforce: false', 'module guide should document shadow scheduling');
```

- [ ] **Step 3: 运行完整测试**

Run: `npm test`

Expected: `smoke checks passed`，进程退出码 `0`。

- [ ] **Step 4: 运行生产构建但不上传**

Run: `npm run build`

Expected: Rollup 退出码 `0`，输出“未指定目标，代码将被编译但不会上传”。不得运行 `npm run push` 或 `npm run local`。

- [ ] **Step 5: 检查范围和默认行为**

Run: `git diff --check`

Expected: 无 whitespace error。

Run: `rg -n "enforce: false|EmpireTelemetry|EmpireMetrics|cpuMode" src`

Expected: Policy、scheduler、telemetry、metrics 和主循环文档均有对应命中。

人工审查以下事实：

- 默认 `enforce: false`；
- 未修改 role 数量公式、body 公式、资源优先级和 planner 输出；
- 没有新增上传或外部网络行为；
- 只有事件摘要、遥测摘要和低频指标写入新 Memory 路径；
- 现有 cityPlan 兼容边界没有被新模块读取或修改。

- [ ] **Step 6: 提交文档与最终安全断言**

```bash
git add src/AGENTS.md src/tests/smoke.cjs
git commit -m "docs: document empire control foundation"
```

## Completion Gate

只有同时满足以下条件，本子项目才可标记完成：

- Tasks 1-7 的每次红绿验证均有当次命令输出证据；
- `npm test` 和 `npm run build` 在最终状态重新执行并成功；
- 调度器仍默认 shadow mode；
- 未改变现有经济和角色决策；
- 真实 Screeps 部署尚未发生，CPU 阈值仅被视为可配置初始值，不宣称已经调优；
- 后续至少收集一个正常运行周期的数据，再单独设计 RoomGovernor 影子模式。
