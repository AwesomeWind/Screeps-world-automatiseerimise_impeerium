# strategies 模块说明

`strategies` 是 role 级任务分配层。它们只在 `!creep.memory.task` 时给 creep 分配下一步任务，不直接执行动作。

## 角色职责

- `MinerStrategyService`: miner/remoteMiner/scout/reserver 的采矿、移动、预定任务。
- `BuilderStrategyService`: builder 只负责建设；无工地时 fallback 升级，不负责维修。
- `RepairerStrategyService`: repairer 负责 `MaintenancePlanner` 标记为 `executor: 'repairer'` 的维修目标。
- `HaulerStrategyService`: 委托 `ResourceMarketService.assignHauler(creep)` 派发搬运任务。
- `UpgraderStrategyService`: upgrader 优先使用 controller container；无能量时向资源市场请求能量。
- `DefenderStrategyService`: 根据安全/战争计划执行攻击、远程攻击或移动。

## Builder 工地优先级

`BuilderStrategyService` 动态评分工地，不排序 `RoomCache`。

评分考虑：

- `RoomPhase` 阶段权重。
- `roadNetwork` 上的 critical road bonus。
- `cityPlan` 中 source/controller container bonus。
- 距离成本。
- 已分配 builder 的轻微拥挤惩罚。
- 完成度轻微加成。

当前目标：early 阶段优先打通关键 road 和关键 container；storage 阶段 storage 可压过普通 road；多个 builder 允许并行建设同一个高优先级工地。

## 修改规则

- 分配任务使用 `assignTask(creep, task)`。
- 需要能量的 worker 不要自己写复杂找能逻辑，调用 `ResourceMarketService.requestResource` 或兼容的 `planWorkerEnergyTask`。
- builder/repairer/upgrader 等 worker 等待 hauler 配送时，`memory.task` 可以保持 `null/undefined`，诊断看 `builderState` 或资源市场 stats。
- 不要把维修逻辑重新放回 builder；维修属于 repairer/tower。
