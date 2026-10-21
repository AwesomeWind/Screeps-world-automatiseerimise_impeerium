# 首批入库有限采运守卫分批实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 `superpowers:executing-plans` 由主代理逐批实施，以复选框记录结果；完成后一次已授权只读独立review，不派生实施子代理。每批按 RED→GREEN 留本地证据，不自动暂存、提交或发布。

**Goal:** 在既有单远程矿执行层增加默认关闭的游戏内守卫，首个本轮真实次 tick 入库确认后立即撤销经济权限，并保留成本、unknown、关闭与有限收尾证据。

**Architecture:** 独立的 Facts、纯 Model、纯 Evidence 与 Service 分别负责事实、会话权限、带来源的归约和控制效果。复用 RemoteMining、Spawn、ResourceMarket、原账本及路线；守卫只收窄权限。次 tick 账本应用后同步通知守卫，原生动作前再次检查，不能依赖外部轮询或遥测关停。

**Tech Stack:** JavaScript ESM、Screeps Memory、Node 内置 `node:test`、现有 CJS fixture、Rollup。

**Spec:** [已认可设计](../specs/2026-10-20-first-delivery-economic-trial-guard-design.md)；[已认可回归要点](2026-10-20-first-delivery-economic-trial-guard-regression.md)。用户已认可本计划，选择主代理逐批实现＋一次只读独立review；仅本地实施，发布与启用未授权。

## Global Constraints

- 本计划只安排本地实施与验证。当前侦察、实际采运、游戏内 Goal/Plan 保持关闭；Governor shadow=true、scheduler.enforce=false、market=false。不联网、不发生产 console、不改共享网络配置。
- 默认 `policy.remoteMining.economicTrial={enabled:false,request:null}`；禁用且无托管历史时不创建经济会话状态。历史终态、未知 schema 和未决费用不得清空后取得新额度。
- W49N41→W48N41，source=`5bbcaa6d9099fc012e63155b`，containerPos=(19,6,W48N41)，接收真实母房 terminal。fixture 用 W1N1/W1N2 等价场景；生产接收 id 只能由未来新鲜预检提供。
- 总期限1000 ticks/90分钟先到即止，覆盖侦察、观察、孵化、容器建设及首批运输，不续期。每轮最多成功孵化 scout1、remoteMiner1、remoteHauler1，无替补、不接管旧单位；body上限50/800/800，整轮孵化上限1650、基建上限6000，同时满足既有2000/1000 ticks孵化及6000/1000 ticks基建滚动预算。
- 每 role 一个原 request、最多两次真实引擎调用；明确失败才在原 deadline 内重试。unknown 占额并停止；不得以新 request/name/session 退款或绕过未知执行。保留 leg≤300、一次重规划、2 ticks冷却、既有安全门槛。
- 本轮新 scout 获得真实视野并满足本会话100连续安全ticks，才可启动经济角色。旧安全值、旧侦察成功和坐标路线均不能替代。启动前尚无视野允许唯一 scout 前进；获得必要视野后的丢失则停止。
- 首个本轮正数、原账本已应用的次tick home_delivery 即停，部分入库也停。必须有同trip指定远端容器的本轮 confirmed pickup；入库不得超过已确认取货，期初容器库存与本轮新产出分开报告。
- 先保留最小停止事实并撤权、关停，再做可失败的详细记录。关闭需下一tick核对；控制关闭与尾部费用/货物结算分列。不得将入库成功写成长期盈利或10000ticks验收通过。
- safe return、已有货物卸载和已接受回执按原安全规则及原期限有限收尾；不再采矿、取货、建设、外出或补孵化。既有 leg/owner 的期限不能刷新；新建安全返程沿用既有≤300规则，原返回期限一经确定即持久化，失败进入 safe_wait。
- 提交、推送、部署、旧侦察锁 release、经济 start 均需未来明确授权。本地通过不能授权这些动作；完整侦察工程验收及可靠连接条件仍欠线上证据。

## Review Focus

1. ResourceMarket 确认首批后，同 tick 已排队的其他单位和旧任务仍可能执行：P4用生产顺序验证同步撤权和逐动作复核。
2. owner删除与账本消费之间、去重receipt与金额写入之间中断，可能丢失回执或混淆应用完成：P4/P5检查删除前outbox与精确应用结果；不能证实则 unknown 停止，不能重新记账。
3. 观察期整体覆写 `allowEconomicDeparture` 会让 scout 提前返程：P3验证 role 许可及 scout→miner 的视野交接。
4. 三 role 费用不同、跨会话同名/同金额、回执过期及滚动预算移出窗口容易混账或增额：P2/P5验证完整绑定和整轮累计上限。
5. JSON重载后 fixture 的旧对象闭包会假造恢复成功，坏诊断字段又可能跳过关停：P5须重绑 Memory/服务并从 hook 外断言控制效果。

## 工作区与接入依据

复用 `C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium`，分支 `codex/single-remote-mining`，计划编写时 HEAD=`03464efee41b14723b7559f676a25e0225868d88`，tracked/index均无改动，存在历史未跟踪报告。实施前重新核对 Git 与相关 AGENTS.md；不清理、混入或自动暂存旧文件。

已读当前实现：

- `main.js` 生命周期为所有init→所有analyze→EventBus.dispatch→所有run→ActionParser→所有cleanup。新P0服务插在 RemoteReconTrial 后、RemoteMining 前；RemoteMining 当前是P2，被跳过时新守卫仍须拒绝旧许可。
- `RemoteMiningService.analyze()` 生成role需求、绑定request并预留grant；现有非托管request过期会新建，托管经济路径必须复用原request并在到期停止。
- `SpawnService` 分 intake、call_started、原生调用、`recordSpawnResult`、result；在原生调用前占slot，未知不能当未调用。失败会删除原grant，受控重试只能重建同request、同deadline的已知失败grant。
- `ResourceMarketService.consumeRemoteResolutions()` 当前调用 `recordRemoteResolution()` 后丢弃返回值。守卫必须使用该次 `applied/credited` 及精确resolution，不能读累计收益差。
- `RemoteMiningStrategyService` 负责角色策略与return；`ActionParser` 才实际调用引擎，需要末端复核。`RemoteMiningService.run()` 创建容器工地，也须在调用前独立守卫。
- 后续[本地中断边界诊断](../evidence/2026-10-20-economic-settlement-boundary-audit.md)证实：reconcile删除owner后、消费者调用前中断，重载不再产出该resolution；recordRemoteResolution的去重receipt又先于金额写入，不能将receipt存在视为应用完成。因此P4使用删除前托管outbox，含prepared/applying/applied三阶段；此诊断不是线上reset或新守卫验收。
- `getReconTrialPermit()` 已有合规release后的非托管分支。保留此机制，不另加清Memory或关闭旧守卫的绕过。新经济trial不复用旧recon的trial标签或50能量结算器。

## 文件职责与稳定接口

| 文件 | 责任 |
| --- | --- |
| 新增 `src/services/RemoteEconomicTrialModel.js` | 纯会话协议、阶段/slot/绝对期限、权限、停止及关闭确认 |
| 新增 `src/services/RemoteEconomicTrialFacts.js` | 只读真实母房/远端/actor/grant/receipt/配置/关闭事实；不执行动作 |
| 新增 `src/services/RemoteEconomicTrialEvidence.js` | 本轮费用、unknown与pickup/delivery来源的纯归约及有界凭证；不替原账本计费 |
| 新增 `src/services/RemoteEconomicTrialService.js` | 驱动Model、同步应用控制效果、按调用点复核及诊断故障隔离 |
| 修改 `src/config/EmpirePolicy.js`、`src/core/ServiceScheduler.js`、`src/main.js` | 默认关闭、P0登记、顺序装配；main不写业务判断 |
| 修改 `src/services/RemoteMiningService.js`、`src/services/SpawnService.js` | role需求/绑定、原生孵化前slot检查、费用及容器工地调用前复核 |
| 修改 `src/strategies/RemoteMiningStrategyService.js`、`src/core/ActionParser.js` | 角色策略、旧任务撤权、原生动作前复核与安全收尾 |
| 修改 `src/services/ResourceReservationFeedback.js`、`src/services/ResourceMarketService.js`、`src/services/RemoteMiningLedger.js` | 删除owner前保存托管待处理凭证，传递精确已应用回执；保留基础金额/幂等/归因算法及普通非托管行为 |
| 新增 `src/tests/economic-trial-model.cjs`、`src/tests/economic-trial-runtime.cjs`、`src/tests/helpers/economic-trial-fixture.cjs` | 纯模型与真实生产链回归，复用remote-mining fixture |
| 修改 `src/services/EmpireMetricsService.js`、`package.json`及所涉AGENTS.md | 只读有界摘要、测试入口、职责说明 |

以下名称在六批共用，不以globals或新EventBus topic代替同步回调：

- `advanceEconomicTrial(input,event,facts,clock) -> {state,permit,effects}`；`economicTrialPermission(state,query,clock) -> Permit`；`summarizeEconomicTrial(state,clock) -> Summary|null`。clock=`{tick,nowMs,codeVersion}`，通过构造器注入时间。
- request采用schemaVersion=1和 `action:start|hold|release`，字段沿用已批准的完整身份、activateAtTick/expiresAtTick、issuedAtMs/expiresAtMs及配置指纹；start缺任一必要字段拒绝，hold只关闭原身份，release只解除已退场且无未结claim的原会话，不隐含start。event.kind固定为 `evaluate|scope_observed|spawn_bound|spawn_event|resolution_applied|infrastructure_applied|end_tick`，spawn_event.type为 `intake|not_called|call_started|result`；与既有recon入口名字相似，但状态及标签完全独立。
- 完整 `Identity={trialId,sequence,remoteId,epoch,codeVersion}`；state持久于 `Memory.empire.remoteMining.economicTrials`，schemaVersion=1，current/previous最多两轮。current含三role slots、原期限、安全连续值、费用/来源证明、firstDelivery、冻结outcome及关闭/收尾状态。事件最多20条、未决来源/应用凭证最多16条，容量不足停止，不静默驱逐尚未结算凭证。
- `Query={remoteId,epoch,trialId,sequence,role,requestId?,name?,action,task?}`；action取 `spawn|outbound|harvest|container_site|build|repair|pickup|source_deposit|home_delivery|return`。Permit=`{managed,evaluatedAt,allowed,reason}`；managed=false只表示该守卫不增加限制，不能越过其他门槛；托管身份不全/错配则拒绝。
- `collectEconomicTrialFacts(scope,clock) -> Facts`，读取当前Memory与Game，scope若缺失/过期不借旧global授权。
- `getEconomicTrialPermit(query,clock?) -> Permit`；`observeEconomicTrialScope(scope,clock?) -> Permit`；`bindEconomicTrialSpawnRequest(scope,role,request,clock?) -> {requestId,deadline,memoryTags,grantTags}|null`；`recordEconomicTrialSpawn(context,event,clock?) -> Permit`。
- 新actor memory标签 `economicTrialId/economicTrialSequence`，grant使用 `economicTrialId/economicTrialSequence`；context带Identity、role、requestId、name、baseRoom、body。不得挤占既有recon标签。实际费用仍以完整绑定的原ledger receipt为准。
- `recordEconomicTrialResolution(resolution,application,clock?) -> Permit`，application为原ledger本次返回及精确应用凭证；必须在 `consumeRemoteResolutions` 同步调用，不排异步事件。`recordEconomicTrialInfrastructure(observation,application,clock?) -> Permit` 同理接收原基建结算结果。
- `reconcileReservations(reservations,stats,totals,checkpoint?) -> Resolution[]` 新增可选同步回调；仅托管经济owner在删除前调用 `checkpoint(resolution) -> boolean`。已安全持久移交才返回true；false时保留owner、停止相应会话，不把该项交给消费者。异常按同样失败关闭处理，不能误当非托管继续。现有三参数调用保持原行为。outbox按完整Identity+reservation身份有界去重，状态prepared表示未进入账本，调用前持久置applying，原账本成功返回后才置applied并保存实际返回值；applying但无完整applied结果在恢复时记unknown停机，不重放原账本。
- `reduceEconomicTrialEvidence(current,event,facts,clock) -> Evidence` 只归约本轮证据。`confirmedCost`不可由预算上限替代；unknown分开记录事件数与能量上界，不能将未知支出写0或将unknown次数当energy。
- Service提供 `beforeAction(creep,task) -> Permit`，经 `global.RemoteEconomicTrial` 暴露当前服务适配器；ActionParser不直接import领域service。缺失/旧adapter且存在托管actor/会话时拒绝相关动作，普通母房及非托管动作保持原行为。

### P1：默认关闭、会话协议与纯状态机

**Files:** 新Model、Facts、model测试；EmpirePolicy、main、ServiceScheduler；新Service仅接通无动作默认路径。
**Interfaces:** 实现advance/permission/summary及Facts；P2消费三role slot和固定身份，P3消费阶段权限。

- [x] Step 1：新增 `econ_p1_default_off`：`assert.equal(Memory.empire.remoteMining.economicTrials, undefined)`，没有目标namespace、需求和动作；默认policy精确为false/null。新增 `econ_p1_invalid_request_preserves_raw`，非法schema/数组/身份保留原raw且拒绝动作。
- [x] Step 2：新增 `econ_p1_deadlines_and_replay`：两期限任何一个达到即停止；1000 ticks/5400000ms上限；重复start不轮换或延长；时钟倒退、tick断档、version/epoch/config变化拒绝继续。`econ_p1_old_recon_lock`验证旧actor/accepted/spawning/grant存在时不能start，合规release不自动启用经济；进行中的trial被设enabled=false仍须撤权关停并保留状态，不能退回非托管放行。
- [x] Step 3：运行P1筛选保存RED，确认新增缺失协议断言失败；再实现上述纯接口与P0装配，只有托管请求创建Memory，不自动写线上目标或开关。
- [x] Step 4：实现阶段 `recon→observing→preparing→hauling→stopping→terminal`；末态用outcome区分成功/中断/超时，`closureVerified`须tick严格晚于closeApplied。安全事实不满足不得前进。首批成功仅P4事件可以触发。
- [x] Step 5：保存P1 GREEN，兼跑既有recon模型/runtime与smoke顺序检查；测试critical CPU及遥测关闭时守卫仍为P0。留本地检查点，不提交。

### P2：三role唯一额度、原request重试及本轮预算

**Files:** Model/Facts/Evidence/Service、RemoteMiningService、SpawnService、runtime fixture及两新套件。
**Interfaces:** 实现spawn绑定/事件接口；Evidence从真实receipt归约role费用，后续P3/P4复用同一Identity。

- [x] Step 1：建 `createEconomicTrialFixture(options)`，复用remote fixture并按生产顺序加入旧recon与新守卫。`prepare(request)`只改本地mock；`advance(patch)`延后应用孵化/位移/store，提供 `restoreMemory()`及原生调用入口快照。assert在入口hook外，不在生产catch内。
- [x] Step 2：新增 `econ_p2_three_slots_two_spawns`：双Spawn/重复事件仍每role最多成功1；body分别≤50/800/800。`econ_p2_retry_keeps_request_deadline`断言已知失败最多两次原生调用、requestId与deadline不变；过期不能走旧逻辑新建request。
- [x] Step 3：新增 `econ_p2_unknown_keeps_claim`，覆盖intake未调用、call_started之后、引擎返回后、ledger后中断；未证明未调用则unknown占额并停，不清执行grant、不补孵化。缺身份、旧name/body/receipt不能确认费用。
- [x] Step 4：新增 `econ_p2_trial_and_rolling_budget`：每次调用前按真实body及未决额度同时检查本轮1650/6000、既有滚动2000/6000；滚动bucket过期不能增加本trial额度。实际费用50、不同于800的合法miner/hauler body成本分别断言，旧会话同额/同名不继承。
- [x] Step 5：保存RED后实现slot预占、完整绑定、原生前二次许可检查及费用归约。保留原reserve/validate/recordSpawnResult算法；已知失败后可用同request在原期限内重建grant，不能为重试新开预算身份。
- [x] Step 6：保存GREEN，组合运行两新套件＋remote-mining＋recon套件；检查非托管孵化、核心补员和其他scope费用不受影响。

### P3：本轮侦察、安全视野接续及逐动作权限

**Files:** Facts/Model/Service、RemoteMiningService、RemoteMiningStrategyService、ActionParser及runtime测试。
**Interfaces:** 完成scope观测、role级permit、beforeAction与基建结算通知；P4依赖这些入口即时撤权。

- [x] Step 1：新增 `econ_p3_fresh_safe_streak`：旧operation.safeTicks=100仍不能放miner；本trial第99安全tick拒绝，第100才进入preparing。初始不可见允许唯一scout；曾获视野后丢失、hostile/foreign/source错误则停止。
- [x] Step 2：新增 `econ_p3_scout_miner_vision_handoff`：scout在observing/preparing保持位置，不因整体scope标志提前返回；miner真实接续视野前不撤掉唯一眼睛。容器未真实建成不孵化/派出hauler；create-site OK不能冒充containerReady。
- [x] Step 3：新增 `econ_p3_role_target_action_matrix`，参数化各阶段及旧MOVE/HARVEST/BUILD/REPAIR/WITHDRAW/TRANSFER/RESERVE：仅指定source/容器/terminal、本trial对应role获准；第二矿、road、reserver、其他接收目标及伪造tags均无引擎调用。容器创建和维修计入同轮基建预算。
- [x] Step 4：新增 `econ_p3_revoke_after_intake_or_strategy`：分别在intake后、run前、strategy后/ActionParser前关闭、换版本或使母房危急，原生调用计数不增长。另测P2 RemoteMining被跳过/adapter陈旧时拒绝旧scope许可。
- [x] Step 5：保存RED后实现按role交集许可。原生动作前重读当前Identity、时钟、最小安全事实与停止状态；不把普通任务全局接管。ResourceMarket生成托管pickup/home_delivery任务时，从已验证slot派生完整Identity并放入reservation.context，随原owner跨tick持久；不能从任意传入context复制可信标签。测试任务→owner→resolution的JSON往返身份保持。保留原路线占用避让、retry=1、冷却2、原leg期限≤300。
- [x] Step 6：保存GREEN，执行route-occupancy、scout-movement、work-position及远程相关组合。场景只读Game事实，Facts不得改Memory或用坐标路线当可见真实source。

### P4：次tick真实首批、货源绑定与同步停止

**Files:** Evidence/Service/Model、ResourceReservationFeedback、ResourceMarketService、RemoteMiningLedger、runtime测试。
**Interfaces:** `recordEconomicTrialResolution(resolution,application,clock)`；原账本返回保留applied/credited，新增仅托管场景的最小应用凭证。控制不依赖EmpireMetrics。

- [x] Step 1：新增 `econ_p4_real_next_tick_delivery`，完整生产链生成remote pickup预留→ActionParser WITHDRAW→次tick同时更新actor/container store并确认→返程TRANSFER→次tickactor/terminal store确认。断言同tickOK不成功；只有确认tick严格晚于原生接受tick、原reservation身份匹配且 `application.applied===true && credited>0` 才停止。
- [x] Step 2：新增 `econ_p4_provenance_and_identity`：完整Identity、canonical hauler、reservationId/assignedAt/sequence/tripId、energy、指定terminal及同trip已确认指定容器pickup全匹配；任一错配/旧累计增量/其他actor/源侧库存/无pickup均不算首批。累计入库≤该trip confirmed pickup；期初库存不冒充新开采量。
- [x] Step 3：新增 `econ_p4_partial_duplicate_and_order`：正数部分入库即停；同resolution重放不重复计收/停止。hook外断言原ledger已入账，再有最小停止事实/deny/关闭效果；同tick后续新pickup、harvest、build、spawn/outbound调用均0。
- [x] Step 4：新增 `econ_p4_owner_removed_before_consume`、`econ_p4_receipt_before_credit`、`econ_p4_credit_before_return`、`econ_p4_applied_then_notification_interrupted`。在删除owner前/消费者前、receipt写后金额前、金额写后函数返回前、账本返回后通知前分别中断并JSON重载。删除前checkpoint失败保留owner并停止；prepared不冒充入账；applying无applied完整凭证则unknown停止，禁止重放计费；applied可恢复停止且不二次记账。两种金额写入边界即使receipt同形也不能合并判断。另测原ledger去重返回applied=false，禁止凭其当新首批。
- [x] Step 5：保存RED后接入删除前checkpoint和同步通知：保留原次tick归因、实际金额及幂等规则；本轮outbox先prepared、调用前applying、成功返回后applied，不能把原receipt存在当完成。只为托管回执保留最小应用证明，不扩大通用receipt保留策略；先撤权/关闭再归档。记录抛错走关停保底，不能catch后当“未入库继续跑”。
- [x] Step 6：保存GREEN；新增 `econ_p4_unknown_stops_without_revenue` 覆盖并发不可分解、带货死亡、target失效，原unknown如实保留。跑storage-reservation、remote-mining和新套件确认母房通用预留/收入未改变。

### P5：关停、有限收尾、重置与跨会话证据

**Files:** 四个新模块、相关接口与fixture/runtime测试；仅修正已经暴露的接入缺口。
**Interfaces:** 冻结outcome、closeApplied/closureVerified、tail状态、current/previous和前批稳定接口。

- [x] Step 1：新增 `econ_p5_stop_matrix`，在recon/observing/preparing/hauling参数化危险、foreign、视野、路径/接收、核心/Controller、预算/身份/配置/版本、额外actor、两期限和重试耗尽；每次外层断言已撤权，下一tick才closureVerified。
- [x] Step 2：新增 `econ_p5_bounded_tail`：停止前带货者可安全返程卸载，已接受动作仍可次tick结算；不再采集/建设/外出/重开trip。原leg/owner期限不改，安全返程只初始化一次，超期或危险safe_wait；关闭成功不冒充尾部全结清。
- [x] Step 3：新增 `econ_p5_reset_and_cross_session`：实际JSON往返、重绑creep.memory与fixture引用、重建全部服务并丢弃globals，分别验证slot、已确认费用/unknown、pickup/firstDelivery、原期限、冻结outcome保留。第二会话不继承上一轮金额/unknown/安全ticks，未决claim存在仍拒绝新start；receipt正常过期不抹已绑定本轮费用。
- [x] Step 4：新增 `econ_p5_record_fault_does_not_block_close`：注入Evidence reducer/详细记录/摘要异常和坏持久诊断字段。最小控制状态有效时仍关停；控制schema不可理解时保留raw且拒绝动作。`econ_p5_storage_bounds`检验两轮/20事件/16未决凭证上限，溢出保留未结原值并停止。
- [x] Step 5：保存RED后只实现必要隔离与恢复路径；不让诊断stateValid提前return跳过关闭，不删除未知grant来通过新会话测试。外部失联模拟不延长上限、不补发start，服务自停不依赖collector。
- [x] Step 6：保存GREEN；维护者检查冻结outcome与追加tail互不覆盖、已知/未知金额分开、无旧raw闭包、无未授权释放旧锁。组合执行新两套件及recon/危险情报/远程物流回归。

### P6：摘要、完整验证与本地交付

**Files:** EmpireMetricsService、package.json、所涉AGENTS.md、中文交付报告与批次证据。无新增生产运维动作。
**Interfaces:** summary只读显示阶段/有效许可/费用/unknown/首批/关闭/尾部及证据缺口，不发需求、不创建Goal定义。

- [x] Step 1：新增 `econ_p6_summary_is_read_only`：关掉telemetry/metrics仍自停，summary读取不改raw，默认关闭无状态；Goal/Plan、market及其他scope不变。将两新套件显式加入package.json的test集合。
- [x] Step 2：按配套回归矩阵20行逐一登记到正式test名称、对应RED/GREEN日志；保护性测试允许先GREEN，不故意破坏旧实现制造RED。未命中、跳过或缺少实际边界证据明确列缺口。
- [x] Step 3：执行smoke、room-governor、全部旧九个Node套件及新两个套件；记录最终实际数量、退出码，最终无skip/cancel。只在新变化/失败时重跑相关验证，避免无意义重复。
- [x] Step 4：子进程移除DEST/ROLLUP_WATCH后仅构建，确认“未指定目标，代码将被编译但不会上传”；不建临时.secret，不上传dist。不将本地产物新SERVICE_VERSION当线上版本。
- [x] Step 5：维护者检查：无重建孵化/物流引擎、无固定50套经济body、无累计收益差代首批、无unknown退款、无scope整体覆写导致scout断视野、无记录失败阻断关停；执行工作区/暂存diff检查。
- [x] Step 6：保存 `docs/superpowers/evidence/2026-10-20-first-delivery-economic-trial-guard-local-validation.md` 和 `.superpowers/sdd/2026-10-20-first-delivery-economic-trial-guard/progress.md`。分别报告本地测试/构建、review及线上未验收项，保持未暂存/未提交/未推送/未部署。

## 统一运行命令与证据

以下是实施时命令，本次仅编写计划，尚未运行新增测试或构建。日志写入上节scratch目录；测试后立即保存退出码再读日志。

```powershell
$trialNode = 'C:/Users/mts-2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
# 每批将p1换为实际批号；筛选导致的skip不能计入完整覆盖。
& $trialNode --test --test-name-pattern='^econ_p1_' src/tests/economic-trial-model.cjs src/tests/economic-trial-runtime.cjs
# 两新套件组合
& $trialNode --test src/tests/economic-trial-model.cjs src/tests/economic-trial-runtime.cjs
# 最终完整集合
& $trialNode src/tests/smoke.cjs
& $trialNode src/tests/room-governor.cjs
& $trialNode --test src/tests/remote-mining.cjs src/tests/work-position.cjs src/tests/storage-reservation.cjs src/tests/goal-plan.cjs src/tests/scout-movement.cjs src/tests/route-occupancy.cjs src/tests/recon-trial-model.cjs src/tests/recon-trial-runtime.cjs src/tests/remote-danger-evidence.cjs src/tests/economic-trial-model.cjs src/tests/economic-trial-runtime.cjs
# 环境变更仅在此构建子进程，不改共享配置
& $trialNode -e 'const {spawnSync}=require("node:child_process"); const env={...process.env}; delete env.DEST; delete env.ROLLUP_WATCH; const r=spawnSync(process.execPath,["node_modules/rollup/dist/bin/rollup","-c"],{env,stdio:"inherit",windowsHide:true}); if(r.error)throw r.error; process.exit(r.status??1);'
git diff --check
git diff --cached --check
```

每批RED需为目标断言失败而非路径/语法/fixture错误，GREEN需目标测试实际运行且退出0。最终完整集合通过后不因计划模板自动commit。该顺序的实际跨tick动作/归因/关停证据，不能用静态fixture累计值或手动修改ledger代替。

## 覆盖自检与实施交接

设计的默认/身份/期限→P1；唯一额度/真实成本/双预算→P2；安全侦察/容器/视野交接/动作前撤权→P3；真实入库/同trip货源/同步关停→P4；异常/原期限/收尾/跨tick与reset/记录失败→P5；有界只读观测/全量验证→P6。回归矩阵中的外部失联包含于P5；它不消除未来线上连接与人工关闭回读的门槛。

建议由主代理顺序实施六批，因为slot、货源和关停依赖同一身份与生命周期；完成后增加一次只读独立review，重点检查账本应用与停止之间的中断、跨会话unknown及旧任务撤权。该review需要用户选择授权；当前不启动子代理。

用户已审阅并选择主代理逐批实现＋一次只读独立review。当前本地实现与验证进展见本计划对应SDD ledger；不代表批准发布、release、启用经济试点或游戏内Goal/Plan。经济首批闭环仍待独立生产授权、完整侦察门槛、真实路线/安全/预算及最终在线证据。
