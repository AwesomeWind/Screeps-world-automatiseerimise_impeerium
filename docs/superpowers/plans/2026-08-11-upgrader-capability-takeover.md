# Upgrader Capability Takeover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在默认行为完全不变的前提下，建立可复用的单房能力接管框架，并让 `upgradeWork` 成为首个可人工启用、可即时回退、可自动暂停的 SpawnBureau 试点能力。

**Architecture:** `RoomGovernorService.cleanup()` 只用旧 SpawnBureau 决策生成有界 readiness 样本；`SpawnBureauService` 先生成完整旧 intents，再通过纯函数 `SpawnCapabilityArbiter` 只仲裁经济 upgrader quota。Policy override 表达人工请求，持久化 control state 负责连续 fallback、自动暂停及显式 `shadow -> active` 恢复。任何门槛失败都返回完整旧 intents。

**Tech Stack:** Screeps JavaScript ES modules、Memory/global 运行态、Node `assert` 集成测试、Rollup。

## Global Constraints

- 默认 `upgradeWork` 模式必须是 `shadow`；禁止自动切到 `active`。
- readiness 只能使用 `global.SpawnBureau[roomName].legacyIntents`，不得使用接管后的最终 `intents`，避免自我验证。
- 只允许操作 quota `upgrader:<roomName>:controller`；其他 upgrader demand、其他角色和其他房间必须保持原样。
- `SpawnCapabilityArbiter.js` 和 `CapabilityRolloutReadiness.js` 不得读取 `Game`、`Memory`、`global`、`EventBus` 或 Spawn API。
- `shadow` 和任意 fallback 必须完整返回旧 intents；不删除 creep、任务、样本或 Governor 快照。
- 代码完成不代表真实试点通过；至少 50 个完整样本、人工单房 active 和随后至少 500 ticks 观察属于部署后的独立验收。
- 本计划不执行上传、部署、`git pull` 或外部网络操作。

---

### Task 1: 固化 capability policy、override 元数据和 Controller 事实

**Files:**
- Modify: `src/config/EmpirePolicy.js`
- Modify: `src/governance/RoomGovernorFacts.js`
- Modify: `src/tests/room-governor.cjs`

- [ ] **Step 1: 写失败测试，锁定默认策略与 override 合约**

在 `src/tests/room-governor.cjs` 的 policy 测试段加入断言：

```js
const {
    DEFAULT_EMPIRE_POLICY,
    ensureEmpireControl,
    resolveCapabilityMode
} = await import('../config/EmpirePolicy.js');

assert.strictEqual(
    DEFAULT_EMPIRE_POLICY.capabilityControl.capabilities.upgradeWork.defaultMode,
    'shadow'
);
assert.strictEqual(DEFAULT_EMPIRE_POLICY.capabilityControl.readiness.minSamples, 50);

first.policy.overrides.rooms.W1N1 = {
    'capability:upgradeWork': {
        value: 'active',
        reason: 'single_room_pilot',
        expiresAt: 150
    }
};
assert.deepStrictEqual(resolveCapabilityMode('W1N1', 'upgradeWork'), {
    value: 'active',
    source: 'room',
    reason: 'single_room_pilot',
    expiresAt: 150
});
Game.time = 151;
assert.strictEqual(resolveCapabilityMode('W1N1', 'upgradeWork').value, 'shadow');
```

同时在调用 `collectRoomGovernorFacts()` 之前设置 Controller 值，再断言：

```js
ownedRoom.controller.ticksToDowngrade = 12345;
const collected = collectRoomGovernorFacts({ replacementLeadTicks: 50 });
assert.strictEqual(collected.rooms.W1N1.controllerTicksToDowngrade, 12345);
assert.strictEqual(collected.rooms.W3N3.controllerTicksToDowngrade, null);
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `node src/tests/room-governor.cjs`

Expected: 因 `capabilityControl`、`resolveCapabilityMode` 或 `controllerTicksToDowngrade` 尚不存在而失败。

- [ ] **Step 3: 实现默认 policy 和可解释的 capability mode resolver**

在 `DEFAULT_EMPIRE_POLICY` 增加：

```js
capabilityControl: {
    enabled: true,
    emergencyDisable: false,
    fallbackSuspendCount: 3,
    controllerEmergencyTicks: 5000,
    readiness: {
        minSamples: 50,
        minKnownRatio: 0.95,
        maxCriticalRatio: 0.05,
        maxFlipRatio: 0.10,
        maxSnapshotAge: 20
    },
    capabilities: {
        upgradeWork: { defaultMode: 'shadow' }
    }
},
```

新增纯读取接口，保留现有 `resolvePolicy()` 行为：

```js
export function resolveCapabilityMode(roomName, capability) {
    const control = ensureEmpireControl();
    const key = `capability:${capability}`;
    const fallback = control.policy.capabilityControl.capabilities[capability].defaultMode;
    // 返回 { value, source: 'room' | 'empire' | 'default', reason, expiresAt }
    // 过期 override 不生效；非法 value 回落到 fallback。
}
```

允许的值仅为 `shadow`、`active`。房间 override 优先于帝国 override，统一使用 `{ value, reason, expiresAt? }` 合约。不要让 resolver 写 Memory。

- [ ] **Step 4: 收集 Controller 降级剩余 ticks**

在 `collectRoomGovernorFacts()` 的 room facts 中加入：

```js
controllerTicksToDowngrade: Number.isFinite(room.controller.ticksToDowngrade)
    ? room.controller.ticksToDowngrade
    : null,
```

- [ ] **Step 5: 运行定向测试并确认绿灯**

Run: `node src/tests/room-governor.cjs`

Expected: `room governor checks passed`。

- [ ] **Step 6: 提交**

```bash
git add src/config/EmpirePolicy.js src/governance/RoomGovernorFacts.js src/tests/room-governor.cjs
git commit -m "feat: add capability control policy"
```

---

### Task 2: 实现有界 readiness 纯计算

**Files:**
- Create: `src/governance/CapabilityRolloutReadiness.js`
- Modify: `src/tests/room-governor.cjs`

- [ ] **Step 1: 写 readiness 失败测试**

导入：

```js
const {
    appendCapabilitySample,
    evaluateCapabilityReadiness
} = await import('../governance/CapabilityRolloutReadiness.js');
```

覆盖以下输入输出：

- 49 个健康样本仍含 `insufficient_samples`；第 50 个样本变为 ready。
- `knownSampleCount / sampleCount < 0.95` 产生 `known_ratio_low`。
- `criticalSampleCount / sampleCount > 0.05` 产生 `critical_ratio_high`。
- 翻转率使用 `recommendationFlipCount / max(1, sampleCount - 1)`，超过 0.10 产生 `recommendation_flip_ratio_high`。
- `staleFor > maxSnapshotAge` 产生 `snapshot_stale`。
- `claimed`、`bootstrap` 产生 `lifecycle_ineligible`；`self_sufficient` 及以后允许。
- `lastErrorAt !== null && tick - lastErrorAt <= maxSnapshotAge` 产生 `recent_governor_error`。
- `legacyMatchCount` / `legacyMissingCount` 变化不影响 ready。
- 冻结输入后调用函数，断言输入未被修改。
- 重复追加 1000 次后对象中仍只有固定字段，不存在样本数组。

测试样本使用明确结构：

```js
const healthySample = {
    known: true,
    critical: false,
    recommendationPresent: true,
    legacyMatched: true,
    legacyMissing: false,
    sampledAt: 100
};
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `node src/tests/room-governor.cjs`

Expected: 模块不存在或导出不存在。

- [ ] **Step 3: 实现固定 schema 和生命周期比较**

`CapabilityRolloutReadiness.js` 导出：

```js
export const CAPABILITY_ROLLOUT_FIELDS = [
    'sampleCount',
    'knownSampleCount',
    'criticalSampleCount',
    'recommendationPresentCount',
    'recommendationFlipCount',
    'legacyMatchCount',
    'legacyMissingCount',
    'lastRecommendationPresent',
    'lastSampleAt',
    'lastErrorAt',
    'ready',
    'blockers'
];

export function appendCapabilitySample(previous, sample) { /* 返回新对象 */ }
export function evaluateCapabilityReadiness(rollout, current, policy, tick) { /* 返回 { ready, blockers, ratios } */ }
```

生命周期顺序固定为：

```js
const LIFECYCLE_RANK = {
    claimed: 0,
    bootstrap: 1,
    self_sufficient: 2,
    developing: 3,
    mature: 4,
    industrial: 5
};
```

`appendCapabilitySample()` 只累计数字与最后值；`evaluateCapabilityReadiness()` 不修改 rollout，并对 NaN、负数、缺字段按不 ready 处理。

- [ ] **Step 4: 运行定向测试并确认绿灯**

Run: `node src/tests/room-governor.cjs`

Expected: `room governor checks passed`。

- [ ] **Step 5: 提交**

```bash
git add src/governance/CapabilityRolloutReadiness.js src/tests/room-governor.cjs
git commit -m "feat: calculate capability rollout readiness"
```

---

### Task 3: 在 Governor cleanup 中采集真实旧逻辑基线

**Files:**
- Modify: `src/services/RoomGovernorService.js`
- Modify: `src/tests/room-governor.cjs`

- [ ] **Step 1: 写失败集成测试，证明采样不被 active 结果污染**

新增以下场景：

1. `bureau.legacyIntents` 含经济 upgrader、`bureau.intents` 不含；cleanup 后的 legacy match 依据 `legacyIntents`。
2. 同一 evaluated tick cleanup 两次，`sampleCount` 只增加一次。
3. 非完整评估 tick、CPU critical deferred tick、缺失 bureau 时不采样。
4. core health 任一 `unknown` 时 `knownSampleCount` 不增加。
5. core health 任一 `critical` 时 `criticalSampleCount` 增加。
6. Governor error 时 `lastErrorAt` 被写入 rollout；最近错误阻断 ready。
7. 首次 `ready: false -> true` 只产生一次 `capability_rollout_ready` 事件。

必须显式断言：

```js
assert.strictEqual(
    governorControl.rooms.W1N1.capabilityRollout.upgradeWork.sampleCount,
    1
);
assert.strictEqual(
    governorControl.rooms.W1N1.capabilityRollout.upgradeWork.legacyMatchCount,
    1
);
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `node src/tests/room-governor.cjs`

Expected: `capabilityRollout.upgradeWork` 不存在。

- [ ] **Step 3: 将 readiness 采样接到 comparison 之后**

在 `RoomGovernorService.cleanup()` 中：

```js
const legacyIntents = bureau && Array.isArray(bureau.legacyIntents)
    ? bureau.legacyIntents
    : (bureau && Array.isArray(bureau.intents) ? bureau.intents : []);
const comparison = compareSpawnDecisions(
    shadow.spawnRecommendations || [],
    legacyIntents,
    Game.time
);
```

随后只对 `shadow.evaluatedAt === Game.time` 且 bureau 存在的房间采样。经济 intent 只按精确 quota 判断：

```js
const quotaKey = `upgrader:${roomName}:controller`;
const legacyPresent = legacyIntents.some((intent) => intent.quotaKey === quotaKey);
const recommendationPresent = (shadow.spawnRecommendations || [])
    .some((item) => item.capability === 'upgradeWork');
const legacyMatched = recommendationPresent
    ? comparison.matched.some((item) => item.capability === 'upgradeWork')
    : !legacyPresent;
```

`legacyMissing` 是 `!legacyMatched`。`known` 要求 upgrade gap 为有限数且 survival/harvest/logistics 均非 `unknown`；`critical` 表示三项 core health 任一为 `critical`。

先 `appendCapabilitySample()`，再用当前 lifecycle、staleFor、`shadow.eventTicks.error` 调 `evaluateCapabilityReadiness()`，持久化 `ready`、`blockers`、`lastErrorAt`。用 `lastSampleAt === Game.time` 防重复。

完整评估时还要把 `facts.controllerTicksToDowngrade` 写入 `state.shadow`；`globalSnapshot()` 原样暴露该字段。SpawnBureau 只能使用这个与 Governor 评估同 tick 的标准化事实，不能重新读取 room 并形成另一套快照口径。

- [ ] **Step 4: 让全局快照暴露 readiness，但不改变建议**

给 `global.RoomGovernor[roomName]` 增加紧凑字段：

```js
capabilityRollout: {
    upgradeWork: {
        ready,
        blockers,
        sampleCount,
        lastSampleAt
    }
}
```

不得根据 ready 改写 `spawnRecommendations`。

- [ ] **Step 5: 运行定向测试并确认绿灯**

Run: `node src/tests/room-governor.cjs`

Expected: `room governor checks passed`。

- [ ] **Step 6: 提交**

```bash
git add src/services/RoomGovernorService.js src/tests/room-governor.cjs
git commit -m "feat: observe upgrade rollout readiness"
```

---

### Task 4: 实现纯 SpawnCapabilityArbiter 与多 tick 状态机

**Files:**
- Create: `src/governance/SpawnCapabilityArbiter.js`
- Modify: `src/tests/room-governor.cjs`

- [ ] **Step 1: 写纯函数失败测试**

导入：

```js
const {
    arbitrateUpgradeWork,
    advanceUpgradeWorkControl
} = await import('../governance/SpawnCapabilityArbiter.js');
```

`arbitrateUpgradeWork()` 覆盖：

- shadow：`keep`、`legacy`、最终 intents 深度等于完整 legacy。
- active + safe + gap > 0：只替换目标 quota，其他 intents 内容及相对顺序不变。
- active + safe + upgrade budget blocked：只抑制目标 quota。
- active + safe + gap <= 0：只抑制目标 quota。
- gap null、快照过期、core critical、低生命周期、CPU critical、not ready、emergencyDisable、非法字段、候选 body 空：`fallback` 并完整返回 legacy。
- Controller 临界且结果本会 suppress：改为保留旧经济 upgrader，reason 含 `controller_emergency_keep_legacy`。
- Controller 临界、current + spawning 为 0、core 健康且候选有效：允许 replace 紧急候选。
- 外部 upgrader demand（不同 quota）不被删除。
- 输入对象冻结且调用后序列化不变。

`advanceUpgradeWorkControl()` 覆盖：

- fallback 计数连续递增；第 3 次进入 `autoSuspended`。
- 一次安全 active 决策把 `fallbackCount` 清零。
- autoSuspended + 请求仍为 active 时保持暂停。
- autoSuspended 后先请求 shadow，再请求 active，清除暂停并标记 `rearmed: true`。
- shadow 单 tick不擅自清除暂停；只有明确的 `shadow -> active` 转换恢复。

- [ ] **Step 2: 运行测试并确认红灯**

Run: `node src/tests/room-governor.cjs`

Expected: 仲裁器模块不存在。

- [ ] **Step 3: 实现无副作用的单 tick 仲裁**

接口固定为：

```js
export function arbitrateUpgradeWork({
    roomName,
    legacyIntents,
    governorCandidate,
    governorDecision,
    readiness,
    safety,
    requestedMode
}) {
    // return { intents, requestedMode, effectiveMode,
    //          adoptedSource, action, reasons }
}
```

`governorDecision`：

```js
{
    gap,
    budgetBlocked,
    priority,
    current,
    spawning,
    reasons
}
```

`safety`：

```js
{
    emergencyDisable,
    snapshotPresent,
    snapshotFresh,
    coreHealthy,
    lifecycleEligible,
    cpuMode,
    controllerEmergency,
    autoSuspended
}
```

目标 quota 由 `roomName` 计算。替换时放回第一个目标 intent 的位置；旧目标不存在则追加，最后排序仍由 SpawnBureau 完成。所有返回数组都新建，不能修改输入。

- [ ] **Step 4: 实现持久状态推进纯函数**

```js
export function advanceUpgradeWorkControl({
    previous,
    requestedMode,
    decision,
    fallbackSuspendCount,
    tick
}) {
    // return 持久化 schema，并额外给出 rearmed / transitionEvents
}
```

持久字段严格为设计中的 `requestedMode`、`effectiveMode`、`adoptedSource`、`action`、`reasons`、`fallbackCount`、`fallbackReason`、`autoSuspended`、`suspendedAt`、`lastDecisionAt`。`transitionEvents` 只描述状态变化，不写 Memory 或事件总线。

- [ ] **Step 5: 添加静态边界断言**

读取 `src/governance/SpawnCapabilityArbiter.js` 和 `CapabilityRolloutReadiness.js` 文本，断言不匹配：

```js
/\b(Game|Memory|global|EventBus)\b|REQ_SPAWN|\.spawnCreep\s*\(/
```

- [ ] **Step 6: 运行定向测试并确认绿灯**

Run: `node src/tests/room-governor.cjs`

Expected: `room governor checks passed`。

- [ ] **Step 7: 提交**

```bash
git add src/governance/SpawnCapabilityArbiter.js src/tests/room-governor.cjs
git commit -m "feat: arbitrate upgrader capability takeover"
```

---

### Task 5: 将仲裁接入 SpawnBureau，保持默认行为精确不变

**Files:**
- Modify: `src/services/SpawnBureauService.js`
- Modify: `src/tests/room-governor.cjs`
- Modify: `src/tests/smoke.cjs`

- [ ] **Step 1: 写默认 shadow 和单房 active 的失败集成测试**

先建立可重复的两房世界，分别运行 SpawnBureau：

1. 无 capability override：记录接入前 fixture 的所有 intents，断言接入后 `legacyIntents` 和 `intents` 深度相等，发布的 `REQ_SPAWN` 顺序与内容不变。
2. W1N1 显式 active 且 ready/safe，W2N2 保持 shadow：只允许 W1N1 的经济 upgrader intent 变化。
3. W1N1 同时有外部 upgrader demand：外部 quota 原样保留。
4. replace 后仍使用 `upgraderBodyProfile(room)`、现有 BodyBuilder、原 quota 与 `{ role, homeRoom, quotaKey }` memory。
5. 每 tick最终经济 upgrader intent 最多一个。
6. builder、repairer、miner、hauler intents 的序列化结果与 legacy 一致。

在 `src/tests/smoke.cjs` 增加模块存在及纯边界入口检查，但把行为场景集中留在 `room-governor.cjs`。

- [ ] **Step 2: 运行测试并确认红灯**

Run: `node src/tests/room-governor.cjs`

Expected: `legacyIntents` / `arbitration.upgradeWork` 不存在或 active 不生效。

- [ ] **Step 3: 抽取可复用但行为不变的 intent body 构造**

将 `addIntent()` 内的 BodyBuilder 调用抽成：

```js
buildIntent(room, state, intent) {
    // 返回完整 intent 或 null；body 无效时写 blockedDemands。
}
```

`addIntent()` 仍先做 quota 去重，再调用 `buildIntent()` 并 push。旧经济逻辑不得改变。

- [ ] **Step 4: 在排序与发布前应用 capability 仲裁**

在 `addEconomicIntents()`、`addDemandIntents()` 完成后：

```js
state.legacyIntents = state.intents.map((intent) => ({
    ...intent,
    body: [...intent.body],
    memory: { ...intent.memory }
}));
this.applyUpgradeWorkArbitration(room, state);
state.intents.sort((a, b) => b.priority - a.priority);
```

`applyUpgradeWorkArbitration()`：

- 从 `global.RoomGovernor[room.name]` 取当前快照、health、lifecycle、budgets、capabilities 和 recommendation；
- 从 `Memory.empire.control.rooms[room].capabilityRollout.upgradeWork` 取 readiness；
- 用 `resolveCapabilityMode()` 取请求模式及 override 元数据；
- 候选只通过 `buildIntent()` 构造，继续使用 `upgraderBodyProfile(room)`；
- recommendation 存在时用其 priority；Controller 紧急且无 recommendation 时复用旧逻辑“零 upgrader”优先级 60，不引入新 body 策略；
- 调纯仲裁器后覆写 `state.intents`，并写 `state.arbitration.upgradeWork`；
- shadow 下不构造会写 `blockedDemands` 的候选，确保默认副作用也不变化。

安全事实中的 `controllerEmergency` 必须来自 Governor 快照的 `controllerTicksToDowngrade < controllerEmergencyTicks`；字段缺失按未知处理，在 active 请求下触发 fallback，而不是猜测安全。

- [ ] **Step 5: 运行定向和全量测试**

Run: `node src/tests/room-governor.cjs`

Expected: `room governor checks passed`。

Run: `npm test`

Expected: `smoke checks passed` 与 `room governor checks passed`。

- [ ] **Step 6: 提交**

```bash
git add src/services/SpawnBureauService.js src/tests/room-governor.cjs src/tests/smoke.cjs
git commit -m "feat: integrate upgrader capability arbitration"
```

---

### Task 6: 持久化 fallback/暂停状态，并记录有界状态事件

**Files:**
- Modify: `src/services/SpawnBureauService.js`
- Modify: `src/tests/room-governor.cjs`

- [ ] **Step 1: 写多 tick 失败集成测试**

使用连续 Game.time 驱动同一房间：

- active 第一次 fallback：完整 legacy，`fallbackCount === 1`。
- 第二次：`fallbackCount === 2`。
- 第三次：`autoSuspended === true`、`suspendedAt` 为当前 tick。
- 第四次即使安全恢复且 override 仍 active，也保持 shadow/legacy。
- override 改为 shadow 一 tick：只记录请求变化，不解除暂停。
- override 再改 active：清除暂停；若门槛安全则实际 active。
- 一次安全 active 后下一次 fallback 从 1 重新计数。
- W1N1 的暂停不得影响 W2N2。

事件断言只允许状态变化各写一次：

```text
capability_control_activated
capability_control_fallback
capability_control_suspended
capability_control_rearmed
```

持续相同 fallback 原因不得每 tick刷事件；事件总量仍受 telemetry `eventLimit` 约束。

- [ ] **Step 2: 运行测试并确认红灯**

Run: `node src/tests/room-governor.cjs`

Expected: control state 或状态事件断言失败。

- [ ] **Step 3: 推进并持久化 per-room control state**

在 `applyUpgradeWorkArbitration()` 中读取旧状态，先判断 autoSuspended/rearm，再仲裁，再调用 `advanceUpgradeWorkControl()`，写入：

```js
control.rooms[room.name].capabilityControl.upgradeWork = nextControl;
```

写入前保留房间对象中其他字段。全局 `capabilityControl.enabled === false` 或 `emergencyDisable === true` 必须产生 shadow/legacy；不能删除请求 override。

- [ ] **Step 4: 只按状态边沿记录事件**

导入 `recordEmpireEvent()`，根据纯状态机返回的 `transitionEvents` 写事件，数据至少包含：

```js
{
    roomName,
    capability: 'upgradeWork',
    requestedMode,
    effectiveMode,
    reasons
}
```

fallback 事件仅在“进入 fallback”或 fallback reason 改变时记录；相同状态不重复写。

- [ ] **Step 5: 运行定向和全量测试**

Run: `node src/tests/room-governor.cjs`

Expected: `room governor checks passed`。

Run: `npm test`

Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
git add src/services/SpawnBureauService.js src/tests/room-governor.cjs
git commit -m "feat: suspend unsafe capability takeover"
```

---

### Task 7: 增加 compact metrics、运维说明和最终验证

**Files:**
- Modify: `src/services/EmpireMetricsService.js`
- Modify: `src/tests/room-governor.cjs`
- Modify: `src/AGENTS.md`
- Modify: `docs/superpowers/specs/2026-08-11-upgrader-capability-takeover-design.md`

- [ ] **Step 1: 写 metrics 失败测试**

给 `global.RoomGovernor.W1N1`、`global.SpawnBureau.W1N1` 和持久 control state 注入 fixture，断言 metrics 只保存紧凑摘要：

```js
assert.deepStrictEqual(metricSnapshot.upgradeWorkControl, {
    legacyIntentPresent: true,
    governorRecommended: true,
    adoptedSource: 'governor',
    action: 'replace',
    current: 1,
    spawning: 0,
    required: 3,
    gap: 2,
    fallbackCount: 0,
    autoSuspended: false
});
```

断言 metrics 不复制 body、完整 intents、完整 blockers 历史或 rollout 样本。

- [ ] **Step 2: 运行测试并确认红灯**

Run: `node src/tests/room-governor.cjs`

Expected: `upgradeWorkControl` 不存在。

- [ ] **Step 3: 实现 metrics 摘要**

`EmpireMetricsService.cleanup()` 从本 tick globals 和 control state 组装上述固定字段。缺数据时使用 `null`，不得猜测 0；旧经济 intent 必须从 `legacyIntents` 的精确 quota 判断。

- [ ] **Step 4: 补充运维说明**

在 `src/AGENTS.md` 记录：

- 默认 shadow 和禁止自动 active；
- 单房请求示例：`policy.overrides.rooms[room]['capability:upgradeWork'] = { value, reason, expiresAt? }`；
- `emergencyDisable` 的即时回退语义；
- autoSuspended 必须显式 `shadow -> active` 才能恢复；
- readiness 基于 legacy 基线；
- 真实试点 50 样本 + active 后 500 ticks，验收前不得扩大范围。

在已确认设计文档末尾增加“实现状态”段：只在所有代码验证通过后写“代码已完成”；继续明确“真实运行验收尚未完成”。

- [ ] **Step 5: 全量验证**

Run: `npm test`

Expected: `smoke checks passed`、`room governor checks passed`。

Run: `npm run build`

Expected: Rollup 成功生成 bundle，无 unresolved import 或语法错误。

Run: `rg -n "TODO|FIXME|placeholder|待实现|稍后实现" src/governance/CapabilityRolloutReadiness.js src/governance/SpawnCapabilityArbiter.js src/services/RoomGovernorService.js src/services/SpawnBureauService.js src/services/EmpireMetricsService.js src/tests/room-governor.cjs src/AGENTS.md docs/superpowers/specs/2026-08-11-upgrader-capability-takeover-design.md`

Expected: 无本阶段遗留占位符；文档中的“真实运行验收尚未完成”不属于实现占位，需人工核对保留。

Run: `git diff --check`

Expected: 无空白错误。

- [ ] **Step 6: 对照规格做最终自审**

逐项确认：

- 默认 shadow 的发布请求与接入前 fixture 完全相同；
- active 必须同时满足显式请求、readiness 和所有安全门槛；
- comparison/readiness 始终使用 legacy 基线；
- 只修改经济 upgrader quota；
- Controller 临界不允许 suppress；
- 连续 3 次 fallback 自动暂停，显式 shadow -> active 才恢复；
- events 有界且只在边沿写入；
- readiness 与 arbiter 保持纯函数边界；
- 未执行上传、部署或真实 active。

- [ ] **Step 7: 提交**

```bash
git add src/services/EmpireMetricsService.js src/tests/room-governor.cjs src/AGENTS.md docs/superpowers/specs/2026-08-11-upgrader-capability-takeover-design.md
git commit -m "docs: document upgrader takeover operations"
```

---

## 实施后人工试点清单（不在代码完成定义内）

- [ ] 保持所有房间 shadow，观察单个健康房间达到 `sampleCount >= 50` 且 `ready === true`。
- [ ] 核对最近 500 ticks 的 known、critical、flip、Governor error 与 Controller 数据，不只看单一 ready 布尔值。
- [ ] 为一个房间写入带 reason 的 `capability:upgradeWork = active` override。
- [ ] 连续观察至少 500 ticks 的 Controller 安全、能源储备、spawn 利用率、gap、fallbackCount 与 autoSuspended。
- [ ] 若出现风险，先启用 `emergencyDisable` 或把该房 override 改回 shadow，保留事件和 metrics 证据。
- [ ] 验收前不启用第二个房间，不开始 builder/repairer 接管。
