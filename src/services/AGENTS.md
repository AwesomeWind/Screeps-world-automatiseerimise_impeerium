# services 模块说明

`services` 负责跨角色、跨系统的房间级能力。它们通常读写 `global.*` 或 `Memory.*`，供 role strategy 消费。

## 核心服务

- `RoomCacheService`: 每 50 tick 或 dirty 时刷新 `global.RoomCache[roomName]`，缓存 sources、controller、constructionSites、structures、centerPos 等事实数据。
- `RoomPhaseService`: 写 `global.RoomPhase[roomName]`，提供 `phase/hasStorage/logisticsMode/constructionPressure/maintenancePressure`。
- `TaskGuardService`: 在 `ResourceMarket` 和 role strategy 前清理非法旧任务。
- `ResourceMarketService`: 资源市场与资源请求中心，写 `global.ResourceMarket`，暴露 `requestResource(creep, request)` 和 `assignHauler(creep)`。
- `SpawnBureauService`: 汇总经济与外部 spawn 需求，通过 `EventBus` 发布 `REQ_SPAWN`。
- `SpawnService`: 消费 `REQ_SPAWN`，实际执行 spawn。
- `RemoteReconTrialService`: 默认关闭的有限侦察守卫；纯状态转换位于 `RemoteReconTrialModel`，只读事实位于 `RemoteReconTrialFacts`。托管会话最多一名成功 scout，关闭需下一 tick 回读；不能用摘要、请求接受或 move OK 代替出生/实际位移证据。
- `RemoteReconTrialSettlement`: 纯费用摘要归约，使用完整会话身份和本轮 request/name/receipt；在事件推进后计算 0/0、null/50 或 50/0。`settlementEvidence` 不从旧摘要复制金额，`settlementBinding` 在 Memory 保留本会话确认；旧终态缺绑定标记 `legacy_unverified`。这些诊断字段不参与许可、不退款或修改真实账本，结算故障不能阻断原关停 effects。
- `RemoteDangerEvidence`/`RemoteDangerEvidenceModel`: 仅在守卫完成首次危险关停后尽力记录同 tick 对象，详细快照独立存于 `Memory.empire.remoteMining.dangerEvidence`，不参与许可。最多两事故/每次十单位；pending 跨 tick 只读显示 interrupted，不补录旧案。CPU策略从policy只读解析，记录/摘要失败不能阻断关停；guard schema及既有安全返程不变。
- 试点的 `not_started/not_called` 与 `call_started` 必须区分：已证明未调用引擎的本轮 pendingTask 可退款，调用结果不明的 grant 不得清空后再次孵化。资源与费用仍走既有市场及 RemoteMiningLedger。

## 资源市场 API

`requestResource(creep, request)` 返回：

- `self_fetch`: 请求者自己执行 `PICKUP/WITHDRAW`。
- `delivery`: 登记 demand，并尝试唤醒 idle hauler。
- `unavailable`: 记录需求但当前没有可履约供给或执行者。

常用 request 字段：

```js
{
    resourceType,
    amount,
    purpose,
    targetId,
    targetPos,
    priority,
    allowedFulfillment: ['self_fetch', 'delivery']
}
```

## 修改边界

- 不要让 role strategy 直接扫描全局资源供需；统一走 `ResourceMarketService`。
- `ResourceMarket.analyze()` 只建市场，不抢先消耗 hauler 任务；hauler 派活由 `HaulerStrategy` 或资源请求即时唤醒触发。
- `RoomCache` 缓存事实，不应保存 builder 专用排序结果。
- `SpawnBureau` 只发布意图，实际 spawn 由 `SpawnService` 做。
