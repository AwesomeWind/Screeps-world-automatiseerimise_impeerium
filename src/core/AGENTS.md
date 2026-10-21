# core 模块说明

`core` 放通用基础设施，不应该依赖具体房间策略。

## 关键 API

- `BaseService`: 所有 service 的生命周期基类，定义 `init/analyze/run/cleanup`。
- `EventBus`: tick 内事件队列，常见 topic 包括 `REQ_SPAWN`、`REQ_RESOURCE`。
- `TaskTypes`: 所有可执行任务类型枚举。
- `TaskMetadata`: `assignTask(creep, task)` 和 `clearTaskState(creep, reason, details)`。
- `TaskGuard`: 校验旧任务、非法任务、role 不允许任务，避免更包后 creep 卡死。
- `ActionParser`: tick 末执行 `creep.memory.task`，并在 `memory.lastTaskClear` 记录清理原因。
- `BodyBuilder`: 根据 role、room phase、bodyProfile 生成 body。
- `WorkPositionPlanner/Coordinator`: 为 build/repair 等长任务保留非道路工作位。

## 任务约定

新任务应通过：

```js
assignTask(creep, {
    type: TaskTypes.BUILD,
    targetId
});
```

这样会写入 `memory.taskMeta.ownerRole/assignedAt/taskVersion`，并清掉旧 `lastTaskClear`。

清理任务时使用：

```js
clearTaskState(creep, 'build_invalid_target', { result });
```

这样运行中可以通过 `memory.lastTaskClear` 诊断任务为什么变成 `null`。

## 边界

- `ActionParser` 只执行既定任务，不做高层策略选择。
- `TaskGuard` 只清理明显非法或过期的任务，不做“最优调度”。
- `WorkPositionCoordinator` 只处理工位占用，不决定目标优先级。

## 托管远程动作边界

ActionParser通过当前tick的RemoteEconomicTrial适配器复核托管动作；适配器缺失、陈旧或异常时拒绝引擎调用。普通母房/非托管行为保持原流程，Memory未安装的独立测试也可运行。BUILD/REPAIR若在原生前撤权，记录已证明attempted=false的原观察以结算0实际费用，不能把未知引擎结果伪装成未调用。
