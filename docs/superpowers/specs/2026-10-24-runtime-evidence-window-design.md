# 游戏内有界持久证据窗口：具体设计与回归要点

2026-10-24，待审阅草案。用户已认可推荐方向；本次只编写具体设计，不实现、不联网、不提交/推送/部署，不启用侦察、采运、Goal/Plan 或市场。

## 1. 目标与事实基础

为以后明确获准的 W49N41 → W48N41 首批入库试点保存可追溯运行证据，降低对外部持续在线采样的依赖。目标 source 固定为 `5bbcaa6d9099fc012e63155b`；容器位置沿用批准的 `(19,6,W48N41)`，receiver 必须是本轮新鲜核对并由原经济会话绑定的真实母房目标，不能从旧报告猜测。

继续沿用原执行限制：最多一名新 scout、一名 miner、一名 hauler，新 scout 独立 100 安全 ticks，原滚动预算及本轮 1650 孵化/6000 基建上限，1000 ticks/90 分钟先到停止，严格次 tick 确认、原 leg/重试/尾部期限与 unknown 不重放规则。

本地基础为 c8ce36c 加四项未提交修复，最近完整验证为 799/799。四项修复及其审阅包不因本文而获得发布授权。原 tailStatus 仍 unverified，newProductionConfirmed 仍不具有正数确认归约。

本地 @types/screeps 3.4.0 声明 Room.getEventLog 返回上一 tick 的事件，并声明 HARVEST、TRANSFER 等字段。当前仓库没有调用该 API。**生产可用性、objectId/方向/金额语义、tick 归属与成本尚未核实**；声明和模拟测试不能代替核实。

## 2. 权限边界

- 本功能只有观察、保存和报告能力；没有 spawn/move/harvest/transfer/build/repair/createConstructionSite 等动作入口。
- 不发布需求，不接管 Spawn、路线、资源市场或结算，不改原 ledger、outbox、receipt、grant、unknown、outcome、身份或期限。
- 不 release 业务旧锁、不替换旧准备、不创建 Goal/Plan 目标，不变更市场、Governor shadow 或 scheduler enforce。
- 原 guard 发现执行/结算 unknown 时仍独立关停；观察器不得将其改为已确认或退款。
- **观察器故障只令观测缺失/partial，不自行关停或放行业务。** 它也不能阻断原 guard 已决定的关停。若以后要求“观测失效也必须自动停业务”，那是另一项明确的 guard 要求，不在本设计中悄悄加入。
- 观察器只写自己的 namespace；对执行状态只读。不调用会 prune/对账的 remoteBudgetStatus 等读写混合方法，不输出完整 Memory、凭据或任意异常消息。

## 3. 模块与生命周期

拟分为四部分：

| 模块 | 职责 |
| --- | --- |
| TrialEvidenceWindowFacts | 读取限定 Game/Memory 字段、原生事件和 CPU；只读执行层 |
| TrialEvidenceWindowModel | 纯请求/身份/状态/限额校验，生成本窗口记录包；没有执行许可输出 |
| TrialEvidenceWindowReport | 只读归约已提交记录、标记覆盖与冲突、分页导出 |
| TrialEvidenceWindowService | 默认关闭，故障隔离，写入观测 namespace，提供只读 facade |

服务追加到现有 service 列表末尾；init 仅安装只读 facade，analyze/run 不采集业务数据，cleanup 在原有 guard、动作解析及现有 cleanup 之后采集。原 P0 顺序不变，遥测 finishTick 仍在全部 cleanup 后。

调度登记为 P3，但不能据此声称 CPU 已隔离：当前 scheduler 无条件允许运行 cleanup，且 enforce=false。因此 collector 必须有自己的预算检查；默认关闭时应在读取原生日志和创建观测 namespace 前返回。

当前 Game 状态和声明的前一 tick 原生事件分别标时，不能将 cleanup 中看到的 Game store 当作本 tick 新意图已生效。HARVEST 初版不新增 ActionParser 或 strategy 钩子；若原生事件路线不可用，另行评估方案，不自动回退到“OK 即产量”。

## 4. 默认配置与观察请求

拟新增默认值：

```js
policy.remoteMining.evidenceWindow = { enabled: false, request: null };
```

没有有效 enabled/request 时，不新建 `Memory.empire.remoteMining.evidenceWindows`，也不调用 getEventLog。既有封存记录可以只读查询；发布默认关闭版本不迁移或清空旧记录。

新观察请求包含：schemaVersion、唯一 window id、native id、完整 prospective economic identity（trialId/sequence/remoteId/epoch/codeVersion）、固定 profile id、issuedAtMs/expiresAtMs、短接纳 tick 窗口，以及可选 successorOf。

- window id/native id 最长 32 个安全 ASCII 字符，经济身份沿用原 schema；profile 是固定编译常量。不能自定义房间、角色额度或来源。
- 接纳保持 30 秒新鲜度，tick 接纳窗最多 10 ticks；不得因延迟重算 issuedAt、到期或接纳窗口。
- 未接纳前只能 armed/waiting；不从旧 current/previous 借 actor、视野、费用或安全计数。
- 只有 prospective identity 与原经济守卫实际接纳的当前会话、native admittedIdentity 及规范 start 请求完全匹配后才绑定并采集。请求本身不证明业务已启动。
- 未来执行卡应先 arm 并只读确认观察窗，再使用原合法流程单次启动业务。观察窗 armed 不是业务许可；若其写入结果不明，按原身份读回，不盲目重放或继续启动。
- 本方案不提供新业务启动 API，也不改既有请求 schema。

## 5. 时间、容量与 CPU 初始边界

以下是待批准的设计初值，不是性能实测结论：

| 项目 | 上限/规则 |
| --- | --- |
| armed 等待 | 最多 20 ticks，且不越观察请求原墙钟截止 |
| 主业务 | 原 1000 ticks/90 分钟，不变 |
| 尾部执行 | 原 closeAppliedAtTick + 300，不变 |
| 采集行 | 每窗最多 1303 行：覆盖主窗、尾部最后合法动作及随后两 tick 确认观察 |
| 周期详细快照 | 每 20 ticks 一份，关键阶段另存里程碑；每窗最多 80 份 |
| 里程碑/异常项 | 每窗最多 64 份 |
| 单窗字符数 | JSON.stringify(window).length 最多 131072 UTF-16 code units |
| 观测 store | current/previous 最多两窗；总字符数最多 270336，包含包装元数据 |
| 本轮 actor | 仅三个绑定 slot，各最多一个 actor；不扫描或复制全帝国 actor Memory |
| 原生日志 | 每 tick 每个限定房间最多读一次，总最多两次；最多处理 128 条原生事件，超限不伪称已完整读取 |
| 相关 owner/grant 等检查 | 每类最多检查 200 条；无法完整检查则 unknown，不能推为零 |
| CPU | reserveCpu=5、maxCaptureCpu=2；bucket 至少 5000，开始前剩余 CPU 至少 reserve+capture |

观察请求 expiresAtMs 必须固定且不晚于 issuedAtMs+90分钟。它是**只读采集的独立截止**，不授予超过原业务 stopAt/notAfter 的控制写入权限；不能借观察器延长任何业务期限。尾部可能在旧业务写入期限后继续按原许可返程，观察器只在自己的明确窗口内记录。

绑定后最大观察 tick 固定为经济 startedAtTick+1302，同时受 armedAtTick+1322 和原观察墙钟截止约束，取先到者。早停则使用原 tailExpiresAtTick 及其后最多两 tick 的确认观察，不重开尾部窗口。时限不足以覆盖完整尾部时标明缺口，不延长。

CPU 上限是阶段间的**软预算**，不是可中断单个原生 API 的硬实时保证。getEventLog 本身和序列化成本必须以后实测；每阶段后超预算即停止剩余可选工作并记录 partial。reserve/bucket 不可读、过低或不合法时跳过，不能假定 CPU=0。不能靠调大 tickLimit、改 scheduler 或延长试点使观测通过。

普通 JavaScript 异常可隔离，不代表引擎硬 CPU 终止、原生 API 单调用卡顿或整个 Memory 不可写时仍有完整关闭/观测留存保证。性能核对未通过不得启用；本设计不将预留 5 CPU 作为这些故障已经解决的证明。

字符数不是 UTF-8 字节数。容量检查必须基于实际候选序列化长度，不相信损坏的持久计数；不能只保留最近数据覆盖起点。实际内容可能提前触及上限，届时窗口 partial，不能宣称已经覆盖 1303 ticks。

## 6. 状态与留存

状态为 armed → recording → tail_observing → sealed；另有未启动、partial、unsupported、corrupt 等结果原因。状态是观测状态，不是原经济 guard 状态。

- armed 仅等待本轮真实接纳；超时后保存 unadmitted，不填零费用来冒充执行结果。
- recording 逐 tick 取当前 Game 事实和可归属的前一 tick 原生事件。
- 原 outcome 出现后进入 tail_observing，保留原终局，只观察旧货与未决凭证。
- 封存后数据不可再追加或更新 lastAccess；外部读取可稍后完成，不要求外部保持在线。
- 新不同 id 只能通过显式 successorOf 指向合法已封存 current，并把它保留为 previous；previous 已占用、旧记录未知/损坏或未封存时拒绝新窗，不自动淘汰或清空。
- 两窗以后的导出/归档/清理另行授权，不在本批实现自动删除。所有限制只影响观察，不能阻挡原 guard 必须进行的关闭。

current/previous 各保留不可变 header、actor id 绑定、逐 tick 记录包、有限快照/里程碑和封存信息。只存 allowlist 数据，不存原生完整事件日志、整间 Memory、完整任务 path 或旧业务档案。

最小 schema：store 为 `{schemaVersion:1,current,previous}`；每窗包含 header、bounds、binding、tickRows、snapshots、milestones、capture、seal。header 固定 id/nativeId/identity/profile/两房/source/receiver 及原窗口；binding 只保存三个 actor 的 name/id/receipt 绑定和最后观察位置；capture 标记完整性、丢帧及异常，不代替原资金 unknown。

为限制 Memory 重复字段，tickRows 使用有明确版本和列名的固定列数组，列为 observedTick、observedAtMs、safetyKnownBits、safetyValueBits、guardSafeStreak、harvestEnergy、sourceDepositEnergy、homeTransferEnergy、stateKnownBits、stateValueBits、captureFlags。事实位按命名常量解释，known 位未置位表示 unknown，不能把未置位当作 false/零。报告必须展开为可读字段；实现源码不压缩成晦涩缩写。

safety 位对应母房所有权/无敌方、远端可见/无敌方、源可见、无外国控制、本轮 scout 在远端等；state 位对应保护开关、原关闭许可及三个 actor 的存在/回家/空载等。详细数值和位置放在周期快照，首出生/首次实际位移/跨房/首个资源事件/原 firstDelivery/原关闭等首个关键节点形成里程碑。不能为每笔费用变化重复写里程碑直至提前填满，也不把每 20 tick 的详细快照说成逐步路线覆盖。

逐 tick 记录与里程碑中的 unknown 必须保留为 null/显式原因。缺帧可由观察 tick 序列及原起点推导，异常原因采用有限枚举，不能追加任意错误文本或无限错误列表。固定列/位的映射、长度、版本及字符上限列入 golden/boundary 回归；容量不足仍按 partial 处理，不保证任意极端内容均能保存满窗。

## 7. 事实与原生事件归属

每包分别保存 observedAtTick、eventTick（声明语义为 observedAtTick-1）、observedAtMs、版本及覆盖状态。完整身份和固定目标在 header 中保存，行引用该 header，不能按 remoteId 或 role 单独归属。

actor 的 name、Game id、role 与本轮完整 slot/receipt 绑定。不得用找不到对象后的同名/同 role 猜测替代；死亡后的事件仅能使用此前已记录的 id 证明。只归入经济开始后的事件；旧 parent、旧角色或之前的日志不计入本轮。

原生事件规则：

- HARVEST：只考虑绑定 miner、指定 source 和正数安全整数 amount。单独记录“观察到的原生采出量”，不是首次收入或净收益。
- TRANSFER：校验资源类型、绑定 actor、指定目标和实际金额；在真实语义核对前不得猜测 withdraw 的方向或把它当作 pickup。pickup 仍来自原 reservation/outbox。
- BUILD/REPAIR 等可作为旁证；**不能把 BUILD 的进度 amount 或 REPAIR 的 hits amount 直接当成 energy 费用**。费用仍取原基建 ledger。
- 与容器/receiver/本轮 actor 交互的非本轮输入单列，不混入本轮收入；无法排除的相关并发要影响来源证明。
- 不接受仅由 policy 设置的 verified=true 作为原生日志语义证明。报告必须关联未来实际只读能力核对的证据；支持方法、形状合法、生产语义已核对分别展示。
- API 缺失、形状错误、无视野、金额损坏、事件超量或来源不匹配时保留 unknown/unsupported/partial，不回退为动作 OK，也不以空数组推导成功。

每 tick 包按 window id+observed tick 唯一，重复同包不增加计数，不同内容不能覆写同 tick。每条原生事件保留房间、事件位置/标识及规范化来源；重复或冲突不能重复加金额。汇总从已提交包只读归约，不反向修改原 ledger。

位置里程碑使用连续原生 Game 位置变化；如果相邻样本缺帧，只能报告变化发生的观察区间，不能写成精确首移动 tick。安全每 tick 覆盖与原 safeStreak 分别存证；原 counter=100 不等于稀疏样本独立观察了 100 ticks。

采集当前目标房间没有视野时必须解释是否缺失必要事实：侦察/采矿期间缺视野不能当安全；本轮全部 actor 已离开且无未决远端动作后，可标 not_required_no_bound_actor，不能把它写成 room_safe=true。

## 8. 各项验收证据分开报告

不提供会授权行动的单一“passed”开关。报告各项为 proved/missing/conflict/unsupported，并列覆盖区间：

| 分项 | 证据要求 |
| --- | --- |
| 出生、移动、跨房 | 原接受记录加绑定 Game actor；实际位置变化及源头视野，不能只用 spawn/move OK |
| 新一轮安全 | 本轮 scout、独立连续 100 ticks、逐 tick 事实覆盖与原 guard 计数；缺帧不拼接 |
| 真实产出 | 已核对语义的本轮原生 HARVEST 事件，不以在场、WORK 数量或意图结果推算 |
| 母房入库 | 原同 trial/trip 正数 pickup、指定 receiver、严格次 tick ledger 应用与 firstDelivery；原生事件只旁证，冲突不能改原账 |
| 收支 | 原本轮 slots/基建/evidence/outbox，unknown 和未决保持 null；负净额如实报告 |
| 控制关闭 | 原 outcome、close、随后 closure 回读及实际策略/operation/scope 关闭状态 |
| 尾部 | 原期限内旧货、owner/grant/outbox/基建凭证状态、actor 与货物去向；不能只用 terminal、角色消失或 owner=0 |
| 恢复 | 窗口数据跨服务重建/重置仍保持身份、期限与去重；真正的重新接纳仍须未来新请求和原 gate，不由观测结果授权 |

“已采出”“已入库”“可证明本轮新产出已入库”是三件事。原 openingContainerEnergy 与观测起点也分别保留。如果容器或 actor 先前库存、相关外来输入或任一区间不明，最后一项保持 unknown。

初版的新产出入库下界只在以下条件全部成立时计算：记录从本轮接纳起完整；绑定 miner/hauler 出生空载有证据；同一容器期初库存 E0 已知；原生 HARVEST 与 miner 对该容器的实际存入已核对；没有相关非本轮输入或未分类资源变化；容器及 actor 资源流能够与原 trip 的 pickup→delivery 对齐。

设 H 为首次取货前已确认的本轮原生产出，D 为同一时段本轮 miner 对该容器的已确认存入，R 为原 firstDelivery.amount。报告 `firstDeliveryNewEnergyLowerBound = min(H, D, max(0, R - E0))`。若下界依赖任何缺失事实、未分类并发或原 ledger unknown，则结果为 null，而不是忽略那项输入。原库存大于首批入库时，下界可以为 0；它只表示没有证明正数，不表示实际上没有新产出。

该推导不写回原 newProductionConfirmed，不以尾部追加收入替换原 firstDelivery，也不把其它 trip 或旧轮库存/费用合并。复杂外来输入归属初版明确为 unknown，不引入乐观分摊。若某验收要求因此未被证明，应报告 missing，不能为取得通过而删减该要求。

若首次终局提交失败，即使原生日志和原 ledger 可旁证真实收入，也必须保留“观察到收入、原首批结果提交失败/中止”的区别，不能由观察器补成 completed。

关闭与尾部分层：可以先报告某两次相邻实际 tick 的收敛事实；这不等于已观察完整 300 tick 尾部。最后合法尾部动作可能在 expiry tick 接受、下一 tick 才确认，不能漏掉。旧 actor 在母房空载闲置与已经退出原 gate 是不同状态；死亡/消失且货物去向不明不能自动判货物结清。

没有精确同 tick 调用顺序时，只报告能证明的顺序。首批入库已知发生在动作解析前的路径可结合固定代码顺序核对；其它中途停止场景不能仅凭同 tick 时间戳声称完整验证了先撤权后动作。

## 9. 重置、写入失败与缺帧

- 使用每 tick 不可变记录包，独立于业务 outbox；不新增第二套费用账本。
- 写入异常后只读核对原 window/tick 包。只有明确已提交且内容一致才能跳过；结果不明不得盲目重写。后续采集即使继续，也保留不可清除的覆盖缺口，不能变回完整。
- pending/半完成记录、缺少起点或 row/header 冲突在重置后仍是 partial/corrupt；不能从当前 Game 倒填历史。
- 普通重建且记录完整可沿同一原身份、原期限继续；服务重建与真正全局 reset 的证明强度不同，未观察到实际 reset 不能声称 reset 验收通过。
- provider、归约、序列化、写入及报告抛错均隔离；不用原 guard 的关闭流程调用观察器成功与否来决定结果。
- 观测 unknown 与资金 unknown 分开；前者不改后者，更不能清掉业务 unknown。
- Memory 无法保存失败标记时，后续读取依靠缺失的预期包/未提交状态发现缺口；不能因没有错误日志就判完整。

## 10. 只读查询和导出

拟提供独立 facade：status(windowId)、readPage(windowId, kind, offset, limit)、report(windowId)。它们不 ensure/create/prune/更新 lastAccess，不调用 Game 动作，不提供 start/release/reset。

每页最多 128 行，详细快照/里程碑最多 16 条，且序列化输出最多 16384 字符；超过按明确 nextOffset 分页，不截断单个身份。页携带 window id、schema、版本、封存 revision 和总数；不同窗口或 revision 不拼接。封存后可延迟读取，不能把历史导出当作当前母房健康或当前开关读回。

封存报告只归约该窗口已保存的包，不在查询时从当前业务 current/previous 补金额、计数或视野。需要当前状态时另作明确标时的新鲜采样，不能与封存窗口混为一段证据。

完整导出在本地另存并计算 SHA-256；不假设 Game 内有 Node crypto，也不为此增加业务权限或将简单摘要称为加密证明。导出/读取工具的输入仍检查 JSON.stringify(expression).length ≤1024，失败不改变业务窗口或重发未知控制写入。

## 11. 回归计划要点

| 组 | 必须覆盖 |
| --- | --- |
| 默认关闭 | 不创建观察记录、不调原生事件 API；只读查询不写任何 Memory；业务/Goal/Plan/市场默认值不变 |
| 绑定 | 完整身份/版本/native id/实际接纳、旧 parent、未接纳、迟到、同 remote 不同轮、actor id 丢失或复用 |
| 原生日志 | T 读 T-1、事件/目标/资源/金额校验、API 缺失、方向未核实、重复/冲突、无视野及事件超限 |
| 产出与收入 | HARVEST OK 无事件不确认；旧库存/外来输入不冒充新产出；原 ledger unknown 不被事件覆盖；不把进度或 hits 当费用 |
| 连续性 | 100 安全 ticks 独立、缺帧/CPU 跳过/重复 tick、稀疏与逐 tick 覆盖分离，不重置起点 |
| 关停与尾部 | 原首次入库撤权不受记录故障影响；尾部 300/301 边界、最后动作次 tick 确认、空载回家/消失/未决 owner 区分 |
| 重置与不重放 | Game/服务重建、JSON 重载、写前/写后抛错、半提交、未知不重写、不重复汇总、跨轮/版本不拼接 |
| 容量与 CPU | 每项精确边界及 +1，实际字符上限、两窗满额、旧 corrupt 保留、低 bucket/CPU 不可读/单调用超软预算 |
| facade | 查询不变更原始对象，封存 revision 和分页一致，无完整 Memory/凭据输出、无自动清理 |
| 原执行隔离 | 真实模块顺序下对比启用/关闭/采集故障的原 spawn、动作、账本和 guard outcome；观察器不得新增动作或延长原期限 |

新增 fixture 可以模拟原生事件，但必须标 simulated；不能用它证明生产 API 语义。不得通过手填安全计数或清除 unknown claim 制造通过。

本地实现应 RED→GREEN，再完整测试和隔离目录仅构建，保留原九文件修复包和旧发布日志。未来分批计划再确定具体文件和执行顺序，本设计不等同已批准实施计划。

## 12. 未来运行时前置条件与本次批准范围

未来先在保护开关关闭的状态下，单独授权一个短只读能力核对：最多三个独立样本、总计不超过 60 秒，利用母房既有自然行为核对方法、字段、方向、金额/tick 对应及 CPU；不生成侦察、采运或测试动作，不自动重试/切换网络。失败或无法核对则报告未证明，不激活本窗口的经济验收。

发布、该短核对、观察窗 arm、业务试点启动，均按对应具体执行卡另行授权；本设计不继承旧失败卡额度。主业务版本、母房、预算、原父证明与关闭权限仍须原新鲜预检；不能因记录持久化而取消 30 秒门槛。

本次请审阅的是上述**具体设计和回归要点**。认可后进入本地分批实施计划；当前不写生产代码、不开启记录或试点，不提交、部署或联网。
