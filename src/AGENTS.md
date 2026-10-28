# src 模块说明

`HomeEvidenceWindow` 是默认关闭的母房自然行为录制器，位于旧 `TrialEvidenceWindow` 之后的最后 cleanup、P3。仅写 `Memory.empire.observations.homeEvidence`，不发布需求、改变任务或启动/release业务。单窗100个观察tick或原issuedAtMs+10分钟先到即止；第一行无前态，最多99对过渡，不续期。

新运行采用Store v2：原锚点先确认reserved回执，再经同一gate/selection正式admit，最后生成首行；reserved/根pending不构成接纳。诊断≤8192字符计入原131072总限额，firstOutcome冻结；v1旧窗只读不迁移。原请求协议/期限/CPU/业务许可不变；诊断失败不允许补开。已持久证据支持JSON/模拟global重建，未落盘且失去global的首因无法保证恢复。

采集还须保留同原身份的运行时admission读回确认链；真正global重建丢失该链时保守停采，只保留证据，不从裸accepted候选自动恢复。只读报告区分admissionPersisted和admissionConfirmed，空窗不推断读回已完成；这些诊断字段均不构成业务许可。

首次admission只在原acceptNotBeforeTick尝试一次，错过或当时资源不足则未开始，不能晚到补开；这是避免首次写入没有留下标记后跨tick重放的保守限制。pending、已有窗或未知不允许换ID重开。CPU由policy.homeEvidence.cpu控制，只能收紧minBucket5000/reserve5/capture2的软预算。真实API语义、硬CPU中断和global reset尚未验收。

这是 Screeps AI 的运行入口与分层目录。`main.js` 负责组织服务生命周期，不直接写具体业务策略。

## 生命周期顺序

每 tick 的顺序固定为：

1. `MemoryConfig.ensureDefaults()`
2. 启动 `RuntimeTelemetry` 并由 `ServiceScheduler` 评估 CPU 姿态
3. 所有 service `init()`
4. 所有 service `analyze()`
5. `EventBus.dispatch()`
6. 所有 service `run()`
7. 对所有 creep 执行 `ActionParser.run(creep)`
8. 所有 service `cleanup()`
9. `RuntimeTelemetry.finishTick()` 持久化低频摘要

新增服务时要确认它依赖的全局状态是否已经由前序服务写入。当前关键顺序是：

`RoomCache -> WarIntel/WarStrategy/Combat/Security -> RoomPhase -> RoomGovernor -> GoalPlan -> RemoteReconTrial -> NativeEconomicTrialOps -> RemoteEconomicTrial -> RemoteMining -> SpawnBureau/Spawn -> TaskGuard -> ResourceMarket -> role strategies -> Tower/Planning/Lab/Market -> EmpireMetrics`

`RemoteReconTrial` 是默认关闭的 P0 侦察会话守卫，在需求和动作之前撤权；仅在人工启动的托管会话中收窄既有许可。总期限、唯一孵化额度、关闭回读及结果保存在 Memory，遥测关闭不关闭守卫。没有新鲜 scope/许可时拒绝出发，已有安全返程沿用原门槛。

## 帝国控制基础层

- `Memory.empire.control.policy` 是人工战略配置入口；不要在各 service 新增分散的全局战略开关。
- `global.EmpireTelemetry` 保存当前 tick 的服务耗时；持久摘要位于 `Memory.empire.control.telemetry`。
- `ServiceScheduler` 默认 `enforce: false`，此时只记录影子决策，不允许改变既有 service 生命周期执行。
- `EmpireMetricsService` 只读现有状态，不发布需求、不分配任务、不执行游戏动作。
- CPU 阈值必须通过 policy 配置；在积累真实数据前不得以当前默认值宣称已经完成性能调优。

## RoomGovernor 影子决策

- `governance/RoomGovernorFacts.js` 只负责标准化己方可见房间事实；不得读取 cityPlan 或修改现有房间策略。
- `governance/RoomGovernorModel.js` 是纯计算内核，负责生命周期、健康、预算、能力缺口和 spawn 建议。
- `governance/SpawnDecisionComparator.js` 按 body 有效能力比较建议与现有 SpawnBureau intent，不能只比较 creep 数量。
- `RoomGovernorService` 只能生成影子建议，不得发布 spawn 需求或执行游戏动作。
- 当前 tick 输出位于 `global.RoomGovernor`；低频摘要位于 `Memory.empire.control.rooms[roomName].shadow`。
- 当前只覆盖己方可见房间；未占领房间、远程矿与殖民生命周期由后续世界模型处理。
- 第一版能力公式和 Policy 阈值是待线上数据校准的初始模型，不代表最优经济参数。

## upgradeWork 接管运维

- `upgradeWork` 默认是 `shadow`；系统不会因为 readiness 通过而自动切到 `active`。`active` 还必须有显式请求、readiness 和全部安全门槛同时通过。
- 单房试点通过 `Memory.empire.control.policy.overrides.rooms[roomName]['capability:upgradeWork']` 请求，例如：

  ```js
  Memory.empire.control.policy.overrides.rooms.W1N1['capability:upgradeWork'] = {
      value: 'active',
      reason: 'pilot_after_shadow_baseline',
      expiresAt: Game.time + 500
  };
  ```

  `expiresAt` 可省略；`reason` 应说明试点原因，便于回溯。
- 将 `policy.capabilityControl.enabled` 设为 `false`，或将 `emergencyDisable` 设为 `true`，都表示人工全局 hold：该 tick 立即采用完整旧逻辑并把有效模式置为 `shadow`，但保留既有 active 请求、`fallbackCount` 和 `autoSuspended` 状态。hold 期间不累计 fallback、不触发自动暂停，也不记录普通 fallback/暂停事件。
- 解除全局 hold 后，未暂停房间会以原 active 请求重新经过 readiness 和全部安全门槛，不要求额外执行 `shadow -> active`。只有此前已经进入 `autoSuspended` 的房间仍需先显式改为 `shadow`，再显式改回 `active` 才能恢复。
- readiness 的比较和采样始终以 `legacyIntents` 为基线，不以已经仲裁后的 intent 作为基线。
- active 仲裁每 tick 都用完整 rollout 固定 schema、当前 Governor 生命周期/新鲜度和当前 readiness policy 重新计算 readiness；持久化的 `ready: true` 只是上次评估结果，不能单独授权接管。
- 真实试点尚未执行：先保持单房 `shadow`，积累至少 50 个完整样本且 `ready === true`；再显式启用该房 `active` 并观察至少 500 ticks。验收前不得扩大到第二个房间，也不得接管 builder、repairer 或其他能力。

## 目录职责

- `core`: 任务执行、事件总线、body 生成、任务元信息、工位规划等基础设施。
- `services`: 房间状态、资源市场、spawn 调度、安全/战争、实验室/市场/远程采矿等跨角色服务。
- `governance`: 帝国与房间控制层的事实、纯决策模型和影子差异比较。
- `strategies`: creep role 级策略，只决定该 role 下一步任务。
- `planning`: 城市、道路、防御、维护等长期规划，通常写入 `Memory.rooms[roomName]`。
- `config`: Memory 默认值和房间级开关。
- `tests`: `smoke.cjs` 行为回归测试，是主要安全网。

## 修改原则

- 不要在 `main.js` 中加入业务判断；把逻辑放到对应 service/strategy。
- service 之间通过 `global.*`、`Memory.*`、`EventBus` 协作时，必须考虑生命周期顺序。
- 新任务应使用 `assignTask(creep, task)`，不要直接写 `creep.memory.task`，除非是兼容旧状态。
- 长期状态写入 `Memory`，单 tick 派生状态写入 `global`。

## 有限经济试点

`NativeEconomicTrialOps` 是默认false/null的P0一次性运维入口，位于原经济守卫之前；仅显式请求后按编译profile核对当tickGame/账本，跨tick归档已知旧准备、合法release与start。它不直接执行游戏动作或记账。新版本取代旧未激活准备属于新生产授权，不能复用旧外部许可。旧请求/身份/成本和固定期限保留；intent先持久化，未知不重放。`global.RemoteTrialOps.status(id)`只读，报告不能授权动作；外部断线不阻断原守卫自停。不得用此入口绕过新scout独立100安全ticks、角色/预算限制或旧托管锁。

`RemoteEconomicTrial` 默认关闭，作为P0放在RemoteReconTrial后、RemoteMining前。托管会话独立保留Identity、三role唯一额度、绝对期限及关闭结果；仅收窄原执行许可。Game重建后从Memory恢复，不能靠global摘要授权。首个本轮正数次tick入库同步撤权；原安全返程/已有货物确认按有限tail执行，不授权第二趟。
