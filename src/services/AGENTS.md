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

## 首批入库经济守卫

- `RemoteEconomicTrialFacts/Model/Evidence/Service` 分别只读事实、纯协议、带来源归约和控制效果；policy.remoteMining.economicTrial默认false/null，不自动创建线上目标或release旧侦察锁。
- 每轮最多scout/miner/hauler各1，1000ticks/90分钟，100连续安全ticks；Body上限50/800/800，本轮1650孵化/6000基建与原滚动预算取交集。不同role按实际receipt结算，未知调用保留claim并停止。
- 托管物流在删除owner前同步持久化outbox，prepared/applying/applied分开；应用不明不能重放原账本。原ledger金额和严格次tick归因不变，首批必须同trial/trip pickup→指定terminal确认，旧库存不冒充新产出。
- 记录失败不能阻断关闭。失败移交保留最小unknown证据，原owner仍由既有TTL/maxTaskTicks清理。基建仅保留一个在途应用凭证，应用不明同样停止，不推测消失工地的费用。
- pickup owner存在时只暂停本trial矿工对同容器deposit，避免主动制造无法分解的净变化；其他并发仍记unknown。母房非remote回执不进入trial。
- metrics只读，关闭不依赖遥测。outcome冻结；control closure、有限tail及新产出证据分别展示；newProductionConfirmed缺证据为null。
- 首次role request只在可用Spawn等条件满足时绑定，绑定后不得续期。P0按完整slot/grant证明not_started未调用后再取消；spawn接受与原账本applying/applied分开，半完成receipt不能清除unknown，托管未决grant禁止旧对账自动重放。未知策略类型与接纳前请求不能退回非托管执行；tailStatus自动归约仍未实现，当前unverified不可当尾部结清。
- Facts只报告当前真实视野；`vision_lost`由Model按实际活动session的`visionAcquired`在P0/动作前判定，不能用旧current标记拒绝新接纳，也不能只等scope_observed才关闭。新会话显式false/计数0，legacy缺少可选视野字段不伪造历史，有正计数而无视野证据仍fail-closed。
- terminal仍managed=true时，新身份start返回`release_required`；只有原合法release、实体退场和未决claim核对后才能新开。不得因修复视野误拦截而删历史、清unknown或绕过旧锁。
