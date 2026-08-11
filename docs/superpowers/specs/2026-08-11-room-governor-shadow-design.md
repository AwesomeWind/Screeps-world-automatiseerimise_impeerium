# RoomGovernor 影子模式设计

日期：2026-08-11

## 1. 目标与边界

本子项目对应帝国指挥中枢蓝图的阶段 2。它为所有己方可见房间生成完整、可解释的影子决策包，包括：

- 房间生命周期；
- 分维度经济健康；
- 逻辑预算建议；
- 能力缺口；
- 影子 spawn 建议；
- 与现有 `SpawnBureau` 真实 intent 的差异。

本阶段必须保持零执行接管：不发布 spawn 请求、不修改角色数量公式、不改变资源优先级、不执行游戏动作。阶段 3 才允许通过房间级和能力级开关逐项接管。

本阶段不包含未占领房间世界模型、远程矿闭环、自动扩张、跨房物流、工业或战争升级。

## 2. 独立模块

采用“纯计算内核 + 服务编排”结构：

### 2.1 RoomGovernorFacts

从 `Game`、`global.RoomPhase`、`Memory.empire.control.metrics` 和现有规划状态提取标准化事实，不作战略判断，也不读取 cityPlan legacy 字段。

### 2.2 RoomGovernorModel

纯函数计算内核。输入标准化事实、上次稳定状态和 Policy，输出生命周期、健康、预算、能力缺口、spawn 建议与原因。它不得读取全局对象，以便单测、回放和后续阈值校准。

### 2.3 SpawnDecisionComparator

将 Governor 建议与 `global.SpawnBureau[roomName].intents` 比较。比较基于有效能力覆盖，不以 creep 或 intent 数量相等作为一致依据。

### 2.4 RoomGovernorService

负责房间级编排、评估频率、结果持久化、过期处理和事件记录。它在 `analyze()` 阶段产生建议，在 `cleanup()` 阶段完成与 SpawnBureau 的差异比较。

## 3. 生命周期与服务顺序

关键顺序为：

```text
RoomCache
→ RoomPhase
→ RoomGovernor 生成影子建议
→ SpawnBureau 按旧逻辑生成真实 intent
→ RoomGovernor cleanup 补充差异比较
→ EmpireMetrics 记录最终快照
```

建议与真实执行必须分离：

```text
global.RoomGovernor[roomName]                 影子建议
Memory.empire.control.rooms[roomName].shadow 低频影子摘要
global.SpawnBureau[roomName].intents          真实 spawn 决策
```

RoomGovernor 第一版固定为影子模式。即使 Policy 被误配，也不得发布 `REQ_SPAWN` 或调用执行 API。

## 4. 己方房间生命周期

阶段 2 仅评估己方可见房间：

```text
claimed
→ bootstrap
→ self_sufficient
→ developing
→ mature
→ industrial
```

- `claimed`：Controller 属于自己，但没有可用 Spawn；
- `bootstrap`：已有 Spawn，但采矿、基础运输或持续补能能力不完整；
- `self_sufficient`：所有 source 有稳定采集能力，核心运输不中断，并能替换关键角色；
- `developing`：经济自给，正在建设 extension、tower、道路或 Storage 体系；
- `mature`：Storage 经济稳定、关键维护可控、spawn 具有对外支援余量；
- `industrial`：Terminal 与工业基础设施可用，资源储备达到 Policy 门槛。

生命周期不直接等同于 RCL。RCL 只是证据之一。失去 Spawn、采集或物流能力时允许立即降级；升级需要连续稳定样本和最短保持时间。每次转换记录 `from`、`to`、`reason` 和 tick。

`unseen`、`surveyed`、`reserved` 依赖后续世界模型，不在本阶段伪造。

## 5. 经济健康

健康模型包含五个独立维度：

- `survival`：Spawn、关键角色和最低恢复能力；
- `harvest`：source 覆盖和有效 WORK；
- `logistics`：有效 CARRY、运输需求和 Spawn 补能；
- `infrastructure`：建设及维修压力；
- `reserves`：Storage 能量、水位与趋势。

每项输出 `0-100` 分数、`healthy | strained | critical | unknown` 状态和原因列表。缺失事实必须产生 `unknown`，不得用默认健康值掩盖未知状态。

总体健康采用安全短板优先规则。`survival`、`harvest` 或 `logistics` 为 `critical` 时，总体不得被其他维度平均成健康。

## 6. 逻辑预算

预算表达战略分配建议，不模拟不存在的实体能源账户：

```text
survival
defense
spawn
maintenance
construction
upgrade
reserve
support
```

每项形状为：

```js
{
    posture: 'protected | limited | normal | surplus',
    weight: 0,
    energyCap: null,
    blocked: false,
    reasons: []
}
```

安全与恢复规则：

- `survival`、即时防御和关键角色替换不可被普通预算压制；
- 采集或运输为 `critical` 时，建设、升级和对外支援受限；
- Storage 低于生存水位时，不得把库存总量视作可用预算；
- 证据不足时 `energyCap` 保持 `null`，避免伪精确；
- 每项预算结论必须附带原因。

## 7. 能力缺口与影子 spawn 建议

能力缺口以有效 body 能力表示：

```js
{
    harvestWork: { current, required, gap },
    logisticsCarry: { current, required, gap },
    buildWork: { current, required, gap },
    repairWork: { current, required, gap },
    upgradeWork: { current, required, gap },
    defenseScore: { current, required, gap }
}
```

计算必须纳入现存 creep、正在孵化单位、剩余寿命、替换窗口、source 数量、运输距离、建设/维修压力和预算姿态。

影子建议转换为现有执行层可理解的形状：

```js
{
    capability: 'logisticsCarry',
    suggestedRole: 'hauler',
    bodyProfile: 'hauler',
    priority: 45,
    requiredCapacity: 12,
    reasons: ['carry_gap', 'spawn_refill_delay']
}
```

第一版只生成建议，不传给 SpawnBureau。

## 8. 差异比较

比较结果形状为：

```js
{
    matched: [],
    missing: [],
    excess: [],
    priorityMismatches: [],
    bodyProfileMismatches: [],
    comparedAt: 0
}
```

比较器必须用 intent body 的有效能力评估覆盖程度。例如三个小型 hauler 的总 CARRY 仍不足时，应输出 `capacity_shortfall`，不能仅因数量相同而判定一致。

## 9. 运行数据合约

当前 tick 输出：

```js
global.RoomGovernor[roomName] = {
    tick,
    staleFor,
    lifecycle,
    health,
    budgets,
    capabilities,
    spawnRecommendations,
    reasons
};
```

低频持久摘要：

```js
Memory.empire.control.rooms[roomName] = {
    schemaVersion: 1,
    shadow: {
        evaluatedAt,
        lifecycle,
        health,
        budgets,
        capabilities,
        spawnRecommendations,
        comparison,
        stableSamples,
        lastTransition
    }
};
```

持久数据必须有界。高频中间事实只保存在 `global`，不逐 tick 写入 Memory 历史。

## 10. 调度与 Policy

新增配置：

```text
policy.roomGovernor.enabled
policy.roomGovernor.shadow
policy.roomGovernor.interval
policy.roomGovernor.stableSamples
policy.roomGovernor.maxSnapshotAge
policy.roomGovernor.thresholds
```

- 紧急事实每 tick 检查：Spawn 丢失、采矿/物流归零、入侵和关键恢复能力；
- 完整评估默认每 10 tick；
- 非评估 tick 从最近有效摘要恢复 `global.RoomGovernor` 并更新 `staleFor`；
- CPU 为 `critical` 时保留紧急检查，推迟完整评分与差异统计；
- 阈值是待真实数据校准的初始 Policy，不得宣称已经完成性能或经济调优。

生命周期变化和持续关键差异写入有界事件日志。重复事件必须设置冷却，避免 Memory 膨胀。

## 11. 故障与迁移

- 单项事实缺失时，只将相应结论标记为 `unknown`；
- 单房计算失败时保留上次有效摘要，记录错误并增加 `staleFor`；
- 快照超过 `maxSnapshotAge` 后停止输出 spawn 建议，只保留紧急安全判断；
- 未知 lifecycle 或旧 schema 通过幂等迁移回到可计算状态，不删除旧数据；
- 房间级纯计算错误允许隔离，服务级异常继续遵循现有错误传播语义；
- 不修改 creep memory、cityPlan、现有房间策略或执行队列。

## 12. 验证策略

### 12.1 纯函数测试

覆盖生命周期、健康评分、预算门控、能力缺口和能力型差异比较。

### 12.2 多 tick 场景

覆盖升级稳定窗口、紧急降级、经济恢复、快照过期和 CPU critical 延迟评估。

### 12.3 合约测试

断言 Governor 不发布需求、不调用执行 API、不修改 creep、cityPlan 或旧房间策略。

### 12.4 固定场景

至少覆盖 bootstrap、Storage 缺能、运输不足、建设高压和成熟房间。

## 13. 验收标准

- 每个己方可见房间产生可解释的影子决策；
- 每项结论带事实证据和原因；
- 与 SpawnBureau 的差异可稳定复现；
- 默认角色公式、spawn intent 和资源决策完全不变；
- 测试、生产构建和静态只读检查通过；
- CPU 与 Memory 开销被记录，但本地测试不能替代线上性能验证；
- 积累真实游戏数据后，才能决定阶段 3 的首个接管能力。

## 14. 后续接管原则

阶段 3 的每项接管必须独立经历：

```text
影子建议
→ 差异稳定
→ 单房单能力启用
→ 新旧并行校验
→ 扩大范围
→ 旧逻辑退出
```

优先候选是风险较低且容易量化的 upgrader 能力；具体顺序必须依据阶段 2 的真实差异与经济数据决定，不能在本设计中预先宣称。
