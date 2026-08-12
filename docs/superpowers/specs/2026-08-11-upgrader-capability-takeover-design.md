# Upgrader 单房能力接管试点设计

日期：2026-08-11

## 1. 目标与前提

本子项目对应帝国指挥中枢阶段 3 的第一步：建立可复用的单房能力接管框架，并以 `upgradeWork` 作为首个试点。

阶段 2 已能生成生命周期、健康、预算、能力缺口、影子 spawn 建议及与旧 SpawnBureau intent 的差异，但尚未积累真实游戏数据。因此本阶段区分：

- 完成接管代码、观测、回退和测试；
- 在真实数据门槛满足后，由人工对一个房间请求 active；
- 在真实验收前不自动启用、不扩大房间、不接管其他能力。

本阶段不得修改 builder、repairer、hauler、miner、防御及外部 demand 的决策。

## 2. 架构

新增两个边界明确的模块：

### 2.1 CapabilityRolloutReadiness

持续汇总 RoomGovernor 和 SpawnBureau 的完整评估样本，判断一个房间的 `upgradeWork` 是否具备试点资格。它只维护有界计数，不保存无限历史。

### 2.2 SpawnCapabilityArbiter

纯函数。输入旧 intents、Governor 候选、Governor 决策、readiness、安全事实和请求模式，输出最终 intents、有效模式、采用来源、动作及原因。它不读取 Game、Memory 或 global，也不发布 EventBus 请求。

SpawnBureau 数据流调整为：

```text
旧逻辑生成全部 intents
→ 保存 legacyIntents 快照
→ 构造 Governor upgrader 候选
→ 仲裁器只处理经济 upgrader intent
→ 其他 intent 原样保留
→ 最终 intents 排序并发布
```

`global.SpawnBureau[roomName]` 增加：

```js
{
    legacyIntents,
    intents,
    arbitration: {
        upgradeWork: {
            requestedMode,
            effectiveMode,
            readiness,
            adoptedSource,
            action,
            reasons
        }
    }
}
```

旧逻辑始终保留；回退等价于仲裁器完整返回 `legacyIntents`。

## 3. Policy 与模式

帝国级 Policy 保存接管框架默认值和紧急停用：

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
        upgradeWork: {
            defaultMode: 'shadow'
        }
    }
}
```

能力模式只有：

```text
shadow → active → shadow
```

- `shadow`：采样和对比，但真实 intent 保持旧逻辑；
- `active`：仅在 readiness 和安全门槛同时通过时允许接管；
- `emergencyDisable`：帝国级即时停用，所有房间回到 shadow。

房间级 active 请求使用统一 override 合约，包含 value、reason 和可选 expiresAt。首版不自动把 ready 房间切到 active。

## 4. Readiness 数据合约

每次 RoomGovernor 完整评估且 SpawnBureau 差异比较完成后，记录一个样本：

```js
Memory.empire.control.rooms[roomName].capabilityRollout.upgradeWork = {
    sampleCount,
    knownSampleCount,
    criticalSampleCount,
    recommendationPresentCount,
    recommendationFlipCount,
    legacyMatchCount,
    legacyMissingCount,
    lastRecommendationPresent,
    lastSampleAt,
    lastErrorAt,
    ready,
    blockers
}
```

readiness 必须同时满足：

- 至少 50 个完整评估样本，默认约 500 ticks；
- 已知有效样本比例不低于 95%；
- survival、harvest、logistics critical 样本比例不高于 5%；
- “需要/不需要 upgrader”的决策翻转率不高于 10%；
- 当前 Governor 快照未超过 `maxSnapshotAge`；
- 生命周期至少为 `self_sufficient`；
- 最近 `maxSnapshotAge` ticks 内没有 RoomGovernor 错误。

生命周期顺序按 `claimed < bootstrap < self_sufficient < developing < mature < industrial` 比较。

`legacyMatchCount` 和 `legacyMissingCount` 只用于解释旧、新决策差异，不作为必须一致的 readiness 门槛。稳定且持续的差异可能正是接管价值所在。

计数器使用固定字段，不保留逐样本数组，防止 Memory 无界增长。

## 5. Upgrader 接管范围

仲裁只识别经济 quota：

```text
upgrader:<roomName>:controller
```

其他 owner、quotaKey 或外部 demand 即使 role 为 upgrader，也不得被删除或替换。

首个试点只接管：

- 是否存在一个经济 upgrader intent；
- 该 intent 的优先级。

首版不接管：

- body profile 选择；
- body 构造算法；
- quotaKey 和 creep memory 合约；
- 一次生成多个 upgrader intent。

SpawnBureau 仍调用现有 `upgraderBodyProfile(room)` 和 `BodyBuilder` 构造 Governor 候选，以免同时改变数量与 body 策略。

## 6. 仲裁语义

仲裁输入：

```js
{
    legacyIntents,
    governorCandidate,
    governorDecision,
    readiness,
    safety,
    requestedMode
}
```

仲裁输出：

```js
{
    intents,
    requestedMode,
    effectiveMode,
    adoptedSource: 'legacy | governor',
    action: 'keep | replace | suppress | fallback',
    reasons
}
```

active 且安全门槛通过时：

1. `upgradeWork.gap === null`：fallback；
2. upgrade 预算 blocked：抑制经济 upgrader intent并保留预算原因；
3. `gap <= 0`：抑制旧经济 upgrader intent；
4. `gap > 0`：用一个 Governor 候选替换旧经济 upgrader intent；
5. 候选 body 无效：fallback；
6. 所有非目标 intent 保持内容与相对顺序，最后再按既有规则统一排序。

Governor 候选使用 Governor recommendation 的 priority，使用现有 body profile、BodyBuilder、quotaKey 和 memory。

## 7. 安全底线

以下任一条件成立，本 tick `effectiveMode` 立即回到 shadow 并采用完整旧 intents：

- Governor 快照缺失或过期；
- survival、harvest、logistics 任一为 critical；
- 生命周期为 `claimed` 或 `bootstrap`；
- CPU 姿态为 `critical`；
- readiness 不满足；
- Governor gap、预算或候选字段非法；
- 候选无法构造有效 body；
- 帝国级 `emergencyDisable` 开启。

RoomGovernor Facts 增加 `controllerTicksToDowngrade`。

Controller 安全规则：

- 低于 `controllerEmergencyTicks` 时禁止 Governor 抑制旧 upgrader intent；
- 当前和孵化中的 `upgradeWork` 都为零、且采集物流健康时，允许构造一个紧急 upgrader intent；
- 核心采集或物流崩溃时仍优先恢复 miner/hauler，不让 Controller 逻辑抢占生存恢复。

这些 Controller 仲裁规则只在请求 active 时生效；shadow 模式仍完整保持旧行为。

## 8. 自动回退与暂停

回退分两级：

1. 单 tick fallback：本 tick 使用旧逻辑，保留 active 请求；
2. 连续 3 次 fallback：能力状态进入 `autoSuspended`，后续保持 shadow，直到人工重新请求 active。

一次安全的 active 仲裁会把连续 fallback 计数清零，因此只有连续失败会触发自动暂停。

状态写入：

```js
Memory.empire.control.rooms[roomName].capabilityControl.upgradeWork = {
    requestedMode,
    effectiveMode,
    adoptedSource,
    action,
    reasons,
    fallbackCount,
    fallbackReason,
    autoSuspended,
    suspendedAt,
    lastDecisionAt
}
```

人工恢复必须先把房间 override 改回 shadow，再重新改为 active。检测到这个明确模式转换后清除 `autoSuspended` 和连续 fallback 计数，但仍须重新通过 readiness 与安全门槛。

回退不删除 creep、任务、Governor 快照、旧 intent 公式或 rollout 样本。

## 9. 观测与事件

EmpireMetrics 增加紧凑字段：

- 旧经济 upgrader intent 是否存在；
- Governor 是否建议补充 upgradeWork；
- 最终采用来源和动作；
- 当前、孵化、需求和缺口 upgradeWork；
- fallbackCount 与 autoSuspended。

有界事件日志只记录状态变化：

- 首次 ready；
- 请求 active 后实际启用；
- fallback；
- 自动暂停；
- 人工重新请求后的恢复。

普通每 tick 仲裁不写事件。

## 10. 测试策略

### 10.1 Readiness 纯函数

覆盖样本数、有效比例、critical 比例、决策翻转率、生命周期、过期和错误阻断。

### 10.2 Arbiter 纯函数

覆盖 keep、replace、suppress、fallback，断言不修改输入，并断言非目标 intents 保持不变。

### 10.3 SpawnBureau 集成

- 默认 shadow 时真实 intents 与旧逻辑完全一致；
- 单房 active 只改变该房间经济 upgrader intent；
- 其他房间、角色和外部 demand 不受影响；
- body profile、quotaKey 与 memory 继续使用旧合约。

### 10.4 安全和多 tick

覆盖快照过期、CPU critical、健康恶化、Controller 临界、连续 fallback、autoSuspended 和人工恢复。

### 10.5 静态边界

仲裁器不得读取 EventBus、Game、Memory、global 或调用 Spawn API。

## 11. 代码验收

- 默认真实行为完全不变；
- 只有显式 active、ready 且安全的单房可以接管；
- 任一安全条件失败时当 tick回到完整旧逻辑；
- 每 tick最多新增一个经济 upgrader intent；
- builder、repairer、hauler、miner、防御和外部 demand 不受影响；
- 测试、生产构建与静态边界检查通过；
- 不执行上传、部署或外部网络操作。

## 12. 真实运行验收

代码完成不等于试点已验证。真实运行需：

1. 先以 shadow 模式积累至少 50 个完整样本；
2. 选择一个健康房间人工请求 active；
3. 连续观察至少 500 ticks；
4. 检查 Controller 安全、能源储备、spawn 利用率、upgradeWork 缺口和 fallback 次数；
5. 验收通过前不启用第二个房间，不开始 builder/repairer 接管。

若出现 Controller 风险、核心经济退化、连续 fallback 或数据未知，立即回到 shadow，并保留证据用于调整 Policy，而不是删除旧逻辑。

## 13. 实现状态

代码已完成：自动化测试与生产构建已通过，默认 shadow、显式单房 active、安全回退、自动暂停/显式恢复、legacy 基线 readiness，以及紧凑 metrics 均已实现。

真实运行验收尚未完成。50 个 shadow 样本和单房 active 后连续 500 ticks 观察均尚未执行；在完成验收前，不扩展至第二个房间，也不接管其他能力。
