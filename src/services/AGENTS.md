# services 模块说明

`services` 负责跨角色、跨系统的房间级能力。它们通常读写 `global.*` 或 `Memory.*`，供 role strategy 消费。

## 核心服务

- `TrialEvidenceWindowService`是默认关闭的P3只读观察服务，位于既有服务末尾cleanup。只写`remoteMining.evidenceWindows`，不决定许可、停止、release或资金确认；故障不能阻断原守卫关停。CPU reserve5/capture2是软阶段预算，非硬实时保证；每窗131072字符、两窗270336字符、1303行/80快照/64里程碑，不自动淘汰。
- 窗口按完整prospective/native/经济身份和规范start绑定；先pending再提交，unknown不重放，原期限不延长。只读facade只有status/readPage/report，封存报告不从当前业务补历史。原生getEventLog生产语义尚未核实，simulated事件不作为生产验收；期初库存/同trip/本轮出生空载/来源并发不明时，新产出入库下界为null。
- pending位于store envelope，不给已封存current加字段；unknown arm持久阻止换轮重放，复制/验证/写入/读回阶段均检查CPU软预算。绑定同时比较canonical start的窗口、配置指纹和固定容器坐标；外来能量进入绑定actor或未分类store变化均令来源证据失效。controlClosure须本轮原outcome/close/closureVerified及实际operation/scope关闭，两次quiet观察本身不构成关闭完成。

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

- `NativeEconomicTrialOpsLegacyModel`保留v1原协议；公共Model按schema分派到v2 `SuccessorProtocol/SuccessorModel`。v2仅接受完整terminal父证明及显式新轮，先保存平面档案、后合法release/start；4父档案/65536字符、16拒绝记录满额拒绝新增，不删旧费用/原窗口。native窗口由`NativeEconomicTrialOpsOwnership`按活动或拟接纳完整身份选择；旧已release会话不能误拦新轮，旧回调也不能按相同remoteId撤权到新身份。
- v2默认关闭不迁移；旧schema合法缺省字段保留absent，缺必需证据不推为0。费用unknown、planned中断或结果不明不重放；接纳后不再要求父仍为current或quiet。归档/摘要写入失败先精确撤权，旧记录仅作证据，不是活动许可；尚未接纳的中断不自动用另一id恢复。

- `NativeEconomicTrialOpsProfile/Facts/Model/Service/Evidence`负责一次性游戏内运维协议。已知旧准备数据独立冻结在`NativeEconomicTrialOpsKnownPreparation`；默认关闭发布不归档或取代旧准备。运行状态和拒绝原因保存在Memory，global仅只读查询；当tick人口/账本不能从空global推断，`remoteBudgetStatus`会prune所以只读Facts不调用它。
- 旧current除合法release的managed外不得改写，旧50不能计入新轮。新请求指纹与原Facts共用`RemoteEconomicTrialConfig`。archive/intent先落Memory；结果不明即停止，不重新生成activate/expire。安全撤权不受普通写入期限拦截，激活提交后记录故障也须在原守卫接纳前撤回精确本轮请求；不能持错误版本或epoch进入非托管采运。
- planned/unknown的停止intent不是继续经营许可：独立P0仅对当前完整身份匹配的会话幂等撤权，不重放原经营intent或清未知claim。原经济Facts在spawn/action检查点同时收窄本native会话的stopAtMs与控制请求，避免同tick后半段越过较早截止；缺失整个ledger或不完整archive/固定请求均拒绝推进。

- `RemoteEconomicTrialFacts/Model/Evidence/Service` 分别只读事实、纯协议、带来源归约和控制效果；policy.remoteMining.economicTrial默认false/null，不自动创建线上目标或release旧侦察锁。
- 每轮最多scout/miner/hauler各1，1000ticks/90分钟，100连续安全ticks；Body上限50/800/800，本轮1650孵化/6000基建与原滚动预算取交集。不同role按实际receipt结算，未知调用保留claim并停止。
- 托管物流在删除owner前同步持久化outbox，prepared/applying/applied分开；应用不明不能重放原账本。原ledger金额和严格次tick归因不变，首批必须同trial/trip pickup→指定terminal确认，旧库存不冒充新产出。
- 记录失败不能阻断关闭。失败移交保留最小unknown证据，原owner仍由既有TTL/maxTaskTicks清理。基建仅保留一个在途应用凭证，应用不明同样停止，不推测消失工地的费用。
- 会话状态提交抛错时，仍须执行该次纯模型已经决定的关闭effects；提交异常继续向上传递，不假报持久化成功。已有applied outbox可在可写并重置后归约证据，不重放原账本；失去首次终局提交不能补造firstDelivery成功。
- pickup owner存在时只暂停本trial矿工对同容器deposit，避免主动制造无法分解的净变化；其他并发仍记unknown。母房非remote回执不进入trial。
- metrics只读，关闭不依赖遥测。outcome冻结；control closure、有限tail及新产出证据分别展示；newProductionConfirmed缺证据为null。
- 结算摘要保留`knownNetEnergy`已确认差额；存在unknown事件（即使金额上界为0）、孵化调用/费用绑定未完、基建应用/证据未完、物流应用/证据未完时，`netEnergy`必须为null。每轮独立计算，不把旧轮unknown带入新轮，也不将摘要数值作为执行许可或尾部已结清证明。
- 已有尾部期限必须是安全整数，严格等于原`closeAppliedAtTick + 300`，停止时刻与原outcome一致；返程/卸载仅在该原始窗口内允许。缺少可选尾部字段的旧记录保留absent且不授权尾部动作；损坏值fail-closed，不重置起点、续期或自动修复历史。
- 结算中可选的基建/物流unknown上界、tailReturnedEnergy，以及pickups/delivered表的每笔金额，若存在都必须是非负安全整数。缺省字段保持absent；数字字符串、null、非有限数及负/小数金额不能参与归约或许可，保留原值走state_invalid，不转换、截断或归零。
- 托管经济role首次只发布当tick候选，未实际获Spawn/能量席位不创建request/deadline/grant；Bureau保持母房优先，Spawn真实接纳后才固定原5tick期限。candidate不是免grant普通remote入口，严格绑定完整身份/role/目标/当前tick；其TTL0在接纳后转换为canonical正式事件的原deadline，receipt/backup不能使用候选event.id。
- 新slot的binding/admitted及首次admissionTick/admissionSpawnName成组持久校验；binding可完成intake，不能进入run。EventBus捕获异常仍继续run，pendingTask入列后的提交失败也须撤权并拒绝同tick原生调用；本tick资源只有一个释放owner。合法已绑定重试沿用同id/期限，不改首次接纳信息，未决/未知不得退回候选。
- P0按完整slot/grant证明not_started未调用后再取消；spawn接受与原账本applying/applied分开，半完成receipt不能清除unknown，托管未决grant禁止旧对账自动重放。未知策略类型与接纳前请求不能退回非托管执行；tailStatus自动归约仍未实现，当前unverified不可当尾部结清。旧无接纳标记slot保留原协议，已release的旧会话不能被迟到接纳回调撤权。
- Facts只报告当前真实视野；`vision_lost`由Model按实际活动session的`visionAcquired`在P0/动作前判定，不能用旧current标记拒绝新接纳，也不能只等scope_observed才关闭。新会话显式false/计数0，legacy缺少可选视野字段不伪造历史，有正计数而无视野证据仍fail-closed。
- terminal仍managed=true时，新身份start返回`release_required`；只有原合法release、实体退场和未决claim核对后才能新开。不得因修复视野误拦截而删历史、清unknown或绕过旧锁。
