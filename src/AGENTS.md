# src 模块说明

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

`RoomCache -> WarIntel/WarStrategy/Combat/Security -> RoomPhase -> SpawnBureau/Spawn -> TaskGuard -> ResourceMarket -> role strategies -> Tower/Planning/Lab/Market/RemoteMining`

## 帝国控制基础层

- `Memory.empire.control.policy` 是人工战略配置入口；不要在各 service 新增分散的全局战略开关。
- `global.EmpireTelemetry` 保存当前 tick 的服务耗时；持久摘要位于 `Memory.empire.control.telemetry`。
- `ServiceScheduler` 默认 `enforce: false`，此时只记录影子决策，不允许改变既有 service 生命周期执行。
- `EmpireMetricsService` 只读现有状态，不发布需求、不分配任务、不执行游戏动作。
- CPU 阈值必须通过 policy 配置；在积累真实数据前不得以当前默认值宣称已经完成性能调优。

## 目录职责

- `core`: 任务执行、事件总线、body 生成、任务元信息、工位规划等基础设施。
- `services`: 房间状态、资源市场、spawn 调度、安全/战争、实验室/市场/远程采矿等跨角色服务。
- `strategies`: creep role 级策略，只决定该 role 下一步任务。
- `planning`: 城市、道路、防御、维护等长期规划，通常写入 `Memory.rooms[roomName]`。
- `config`: Memory 默认值和房间级开关。
- `tests`: `smoke.cjs` 行为回归测试，是主要安全网。

## 修改原则

- 不要在 `main.js` 中加入业务判断；把逻辑放到对应 service/strategy。
- service 之间通过 `global.*`、`Memory.*`、`EventBus` 协作时，必须考虑生命周期顺序。
- 新任务应使用 `assignTask(creep, task)`，不要直接写 `creep.memory.task`，除非是兼容旧状态。
- 长期状态写入 `Memory`，单 tick 派生状态写入 `global`。
