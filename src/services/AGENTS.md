# services 模块说明

`services` 负责跨角色、跨系统的房间级能力。它们通常读写 `global.*` 或 `Memory.*`，供 role strategy 消费。

## 核心服务

- `RoomCacheService`: 每 50 tick 或 dirty 时刷新 `global.RoomCache[roomName]`，缓存 sources、controller、constructionSites、structures、centerPos 等事实数据。
- `RoomPhaseService`: 写 `global.RoomPhase[roomName]`，提供 `phase/hasStorage/logisticsMode/constructionPressure/maintenancePressure`。
- `TaskGuardService`: 在 `ResourceMarket` 和 role strategy 前清理非法旧任务。
- `ResourceMarketService`: 资源市场与资源请求中心，写 `global.ResourceMarket`，暴露 `requestResource(creep, request)` 和 `assignHauler(creep)`。
- `SpawnBureauService`: 汇总经济与外部 spawn 需求，通过 `EventBus` 发布 `REQ_SPAWN`。
- `SpawnService`: 消费 `REQ_SPAWN`，实际执行 spawn。

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
