# 游戏内有界持久证据窗口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. 用户已认可主代理逐批实施＋一次独立只读 review；本地六批交付完成，review六项Important已补回归修复，完整868/868及仅构建通过。未联网、暂存、提交或部署。

**Goal:** 为未来另行授权的首批入库试点留下有界、跨 tick 可追溯的运行证据，外部连接中断后仍能读回已保存部分，并明确区分已证明、缺失、冲突和不支持。

**Architecture:** 四个独立模块分别负责纯协议、只读事实、保存编排和只读报告。采集放在既有服务列表末尾的 cleanup；只写独立 namespace，不输出业务许可，不依赖观察成功决定原守卫关停。原账本仍是费用和严格入库的唯一归约来源。

**Tech Stack:** 现有 JavaScript ES modules、Screeps Game/Memory、node:test/CJS 服务链 fixture、Rollup；不加依赖。

**Spec:** [具体设计及回归要点](../specs/2026-10-24-runtime-evidence-window-design.md)，SHA-256 `6b1e08b3a6ea1de7d6aed45019d390f47f86f7796e66526a619cfdcfe5431c8b`。2026-10-26 用户“继续”进入本地分批计划；本文不是实施、发布、arm 或经济启动许可。

## Global Constraints

- 工作树 `C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium`，分支 `codex/single-remote-mining`，HEAD `c8ce36cbf5c418e51e39e07069aa8818a23a87ec`。基线包括四项未提交修复，最近完整本地验证 799/799；不把该结果称为新功能验证或线上验收。
- 计划阶段仅写计划；现已获认可并完成本地 RED→GREEN、完整测试和隔离目录仅构建。不联网、读凭据、改代理、暂存/提交/推送/部署、不产生生产请求；以本地证据检查点代替 commit 步骤。
- 侦察、实际采运、Goal/Plan、市场维持关闭，Governor shadow=true、scheduler.enforce=false；不 release、替换旧准备、清除旧锁/unknown 或延长期限。线上当前状态未重新读取，不声称已核对。
- 固定 W49N41/W48N41、source=`5bbcaa6d9099fc012e63155b`、容器位置 `(19,6,W48N41)`；receiver 由实际接纳会话绑定，不复制历史报告里的 id。
- 原额度/门槛不变：最多各 1 名新 scout/miner/hauler，独立 100 安全 ticks、本轮孵化≤1650/基建≤6000及原滚动预算、1000 ticks/90 分钟先到停止、原 leg/重试/正式孵化期限和 unknown 不重放。
- 默认 `policy.remoteMining.evidenceWindow={enabled:false,request:null}`；未启用/无有效请求不创建 `Memory.empire.remoteMining.evidenceWindows`、不读原生日志。封存记录仍可只读访问，不迁移旧业务状态。
- 只写观察 namespace；不调用会 prune 的预算查询；不修改原 ledger/outbox/receipt/grant/outcome/unknown、控制权限或原 P0 顺序。记录故障只造成 partial，不自行关停/放行业务，也不能阻挡原关停。
- 原生 API 仅是本地声明可行：生产可用性、objectId/方向/金额/tick 语义和成本尚未核实。模拟和 policy.verified=true 都不是生产语义证明；无日志不能回退为动作 OK 即产量。
- 保留 `.superpowers/sdd/2026-10-24-local-economic-repairs-review/bundle/` 九文件候选、清单与产物，保留 root dist 和旧发布日志；不触碰混合目标进度文档，不重用旧 wx 输出路径。

## Review Focus

1. Native 接纳和旧 parent 同 tick 共存：Task 1/2 验证完整三方身份绑定、T 观察 T-1、旧事件排除；waiting 新窗不能借旧父的视野、费用或 actor。
2. 看见 HARVEST/TRANSFER 不等于证明首次入库来自新产出：Task 2/4 验证未核实方向、期初库存未知、外来输入及 trip 不一致全部保持下界 null；容器原库存已知时允许下界 0。
3. 最后合法尾部动作的确认晚一 tick：Task 1/5 验证 expiry 接受、expiry+1 确认及最多 expiry+2 观察，不延长原 300 tick 执行许可，不把两次安静采样当完整尾部。
4. cleanup 无条件调度、写后抛错与硬 CPU 停止：Task 3/5 验证阶段预算、提交读回和 unknown 不重写、原关停独立；硬终止只报告未证明，不承诺 catch 能修复引擎停止。
5. 封存后业务换轮、容量损坏和分页重读：Task 4/5 验证报告仅用已保存包、revision 一致、实际字符计数、旧 corrupt 不淘汰；查询不更新 lastAccess 或回填现状。

## 文件与接口地图

| 文件 | 职责 |
| --- | --- |
| 新建 `src/services/TrialEvidenceWindowModel.js` | 冻结 profile/限额/列与位定义；请求、身份、窗口、包、接续和容量纯归约 |
| 新建 `src/services/TrialEvidenceWindowFacts.js` | 限定字段、原生事件、actor/原账本及 CPU 的只读采集；不生成动作或许可 |
| 新建 `src/services/TrialEvidenceWindowService.js` | 默认关闭、依赖注入、阶段预算、独立提交/读回、末尾 cleanup；后续安装只读 facade |
| 新建 `src/services/TrialEvidenceWindowReport.js` | 已保存证据归约、覆盖/来源下界及有界分页；不读当前业务补历史 |
| 修改 `src/config/EmpirePolicy.js` | 只增加默认关闭的 evidenceWindow 配置 |
| 修改 `src/main.js`、`src/core/ServiceScheduler.js` | 新服务末尾注册与显式 P3；不重排已有服务或调度规则 |
| 新建 `src/tests/trial-evidence-window-{model,facts,runtime,report}.cjs` | 纯合同、事实、生产顺序隔离、只读报告四组测试 |
| 新建 `src/tests/helpers/trial-evidence-window-fixture.cjs` | 包装现有经济/native fixture，下一 tick 已应用动作生成 simulated 事件，注入时钟/CPU/故障 |
| 修改 `src/tests/helpers/economic-trial-fixture.cjs` | 仅增加 opt-in 已应用动作观察点；默认行为不变，不在 fixture 回调里塞断言 |
| 修改 `package.json`、`src/services/AGENTS.md`、`src/tests/AGENTS.md` | 注册新增套件、记录观察器边界及模拟证据等级；不替换原测试列表 |

不改 ActionParser、RemoteMiningStrategyService、原资金确认算法、原经济/native 会话 schema 或生产运维入口。若发现必须越过范围，保留失败证据再审查设计，不夹带扩大权限。

### 跨批公共合同

以下为计划固定接口，采用 JSDoc 定义，不为类型额外引入依赖。

- `Clock={tick,nowMs,codeVersion}`；两个时间均为非负安全整数，版本与身份严格匹配。
- `WindowRequest={schemaVersion:1,id,nativeId,identity,profileId,issuedAtMs,expiresAtMs,acceptNotBeforeTick,acceptNotAfterTick,successorOf?}`；identity 沿用原 `{trialId,sequence,remoteId,epoch,codeVersion}`。id/nativeId 使用 `/^[A-Za-z0-9_-]{1,32}$/`，不把新 id 限制套给合法旧业务档案。
- 固定 profile id=`w49n41-w48n41-first-delivery-evidence-v1`，只选定两房/source/containerPos；receiver 从实际会话取得。测试通过 constructor 注入 profile，线上 Memory 不能自选目标或语义证明。
- `EvidenceStore={schemaVersion:1,current,previous}`；`EvidenceWindow={header,bounds,binding,tickRows,snapshots,milestones,capture,seal}`。状态保存在 capture.phase（armed/recording/tail_observing/sealed），有限 reason 枚举单独表示 not_started/partial/unsupported/corrupt，不混用经济 verdict。
- header 固定 schema/rowSchema/id/nativeId/identity/profile/rooms/source；接纳前 receiver/originalWindow 为 null，只在三方绑定确认时一次填入，随后不可改。binding 仅三个 slot 的 name/id/role/receipt/最后位置；不存在的事实显式 null。
- `AdmissionFacts={economicState,nativeState,startRequest}` 为限定只读快照；复用 `economicIdentityMatches`、`validEconomicTrialState`、`nativeOpsEconomicIdentity` 及原 native 所属合同，不另造按 remoteId 接纳的协议。
- `CapturePacket={windowId,observedTick,eventTick,observedAtMs,codeVersion,row,snapshot,milestones,proof,coverage}` 为单 tick 不可变输入；eventTick=observedTick-1。proof 是限定字段的原账本/首批 trip/来源旁证，不是另一个可结算账本。原生事件仅保留有界规范化证据，不保存整段日志。
- rowSchema=1，固定 11 列依次为 `observedTick,observedAtMs,safetyKnownBits,safetyValueBits,guardSafeStreak,harvestEnergy,sourceDepositEnergy,homeTransferEnergy,stateKnownBits,stateValueBits,captureFlags`。未覆盖数值为 null，known 位缺失不等于 false。Model 导出冻结列名、named safety/state/flag 常量；报告解码名称，源码不压缩。
- safety bit 按序：homeOwned/homeNoHostiles/remoteVisible/remoteNoHostiles/sourceVisible/noForeignControl/currentScoutRemote；state bit 按序：reconEnabled/economicEnabled/goalPlanningEnabled/marketEnabled/governorShadow/schedulerEnforce/controlClosed/tailPermission/scoutPresent/minerPresent/haulerPresent/scoutHome/minerHome/haulerHome/scoutEmpty/minerEmpty/haulerEmpty。存在/空载/许可的 unknown 分别留 known 位缺口。
- capture 留存固定原因位、覆盖起点/末点/不可逆缺口、有限首 trip 来源证明及提交异常标记；细节引用有界 snapshot/milestone。超额或证据不足则 partial/来源下界 null，不借聚合计数宣称保留了全部原始事件。
- 原生能力证明固定为 `apiEvidence={methodSupported,shapeValid,semanticsLevel,verificationRef}`；semanticsLevel 为 unverified/simulated/production_verified，verificationRef 为 null 或 `{id,sha256,codeVersion,eventSemanticsVersion}`。本批生产默认只能 unverified/null；测试注入 simulated 可验证数学与归属，最终报告不得把 simulated 升级为生产 proved。未来 production_verified 的实际证据导入/核对须另行审阅，不提供 Memory 布尔开关旁路。

各批命令从上述工作树运行，实施开始先设置 `$node='C:/Users/mts-2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'` 并配置 Task 6 所述新离线 preload；定向测试同样禁止网络。共享 fixture 不并发运行依赖相同全局 Game/Memory 的场景。

## Task 1：纯窗口协议、接纳与边界

**Files:** 新建 Model、model 测试；修改 EmpirePolicy 默认值。

**Interfaces:**
- Consumes：上述 Clock/WindowRequest/AdmissionFacts，原公开身份校验与纯对象快照。
- Produces：`EVIDENCE_PROFILE`、`EVIDENCE_LIMITS`、`EVIDENCE_ROW_COLUMNS`、命名 bit/flag 常量；`validateEvidenceRequest(request,profile,clock)->{valid,reason}`、`validEvidenceStore(store)->boolean`、`advanceEvidenceWindow(store,event,clock,profile=EVIDENCE_PROFILE)->{store,changed,reason}`。
- event 仅允许 `{type:'arm',request}`、`{type:'bind',admission}`、`{type:'capture',packet}`、`{type:'seal',reason}`。它们描述观察，不产生业务 effect。所有输入保持不可变；same window/tick 同包幂等、异包冲突不覆盖。

- [x] **1. 写 RED 测试**：`request_freshness_and_admission_bounds` 断言 age=30000ms 与 tick 窗宽10可接受、各+1拒绝；未来issuedAt、倒置/越过接纳区间拒绝；id长32/33、非法字符、expires-issued=5400000/+1；时钟缺失/损坏拒绝。`default_off_does_not_create_window` 断言默认 false/null、旧业务 JSON 不变。
- [x] **2. 运行并保存 RED**：`& $node --test --test-name-pattern='request_freshness|default_off' src/tests/trial-evidence-window-model.cjs`；预期因缺失新合同失败，不能以拼写/加载外部依赖错误代替行为 RED。
- [x] **3. 实现请求和窗口纯归约**：在 Model 定义上述函数/常量；绑定须 prospective、经济 current、native admittedIdentity、canonical start 全匹配，旧父不阻挡等待新子；禁止从 previous 猜绑定。默认配置只增字段。
- [x] **4. 写第二组 RED**：`identity_tuple_and_parent_wait_isolation` 改动 tuple 每个字段/nativeId/start 请求均不绑定；`armed_and_tail_boundaries` 验证 armed第20 tick边界/第21超时、原墙钟不延长、最大观察 tick=min(start+1302,armed+1322,早停tailExpiry+2)、业务尾部expiry仍close+300；`sealed_successor_preserves_both_windows` 验证显式 successorOf、previous已占用/旧corrupt或未封存拒绝且原对象不变。
- [x] **5. 保存第二组 RED**：运行 `& $node --test src/tests/trial-evidence-window-model.cjs`，确认各新增行为按预期失败。
- [x] **6. 完成状态和容量实现**：row≤1303、snapshot≤80、milestone≤64；单窗≤131072/store≤270336（含包装），全部测实际 `JSON.stringify().length`，不信持久计数、不淘汰起点或旧窗。候选无法保存时只拒绝/标 partial，不动原 guard。
- [x] **7. 运行 GREEN 并存检查点**：上述 model 全套零失败，测试边界及+1、两窗接近满额、UTF-16字符与字节差异、错误列长/版本、重复包及冲突。保存源码 hash 与日志，不暂存或提交。

## Task 2：只读事实、事件时序与模拟引擎

**Files:** 新建 Facts、facts 测试及 fixture；仅 opt-in 扩展经济 fixture 已应用动作观察点。

**Interfaces:**
- Consumes：Task 1 profile/bit/packet 合同；原 slot/receipt/outbox/ledger 的 allowlist 字段，不调用服务 prune/status 混合方法。
- Produces：`collectEvidenceAdmission(profile,clock,deps)->AdmissionFacts`、`collectEvidencePacket(window,clock,deps)->CapturePacket`。deps 注入 `readBusiness/readRoom/readActor/readCpu/readClock/readEvents` 等只读 provider；生产默认依赖按实际模块字段读取，测试替换不进入 policy。
- `createTrialEvidenceFixture(options)->{scene,armRequest,advance,restoreMemory,calls,packets}` 包装原真实服务链；options 含 profile/CPU/故障/simulatedNativeEvents，advance 仍先应用上一 tick 被接受的实际动作再生成事件，之后运行服务。不得仅从 OK 调用生成成功金额。

- [x] **1. 写 RED**：`previous_tick_events_require_bound_actor_and_source` 断言 T读取T-1、经济起点前/旧父/同名新id/错source/resource/负数/小数/unsafe amount均不入本轮；死亡 actor 仅已有 id 绑定可归属。`ok_without_applied_event_is_not_production` 断言 OK但被引擎阻止/无事件时产出不确认。
- [x] **2. 保存 RED**：`& $node --test src/tests/trial-evidence-window-facts.cjs`，确认缺失事实采集的失败。
- [x] **3. 实现只读采集与 opt-in 引擎事件**：保存 observed/event 两种tick、事件房间/位置/类型/来源；每限定房间每tick最多1次（总2次），最多检查128事件，无法完整处理即partial。重复位置相同内容幂等，冲突不加金额；BUILD进度/REPAIR hits不作为energy费用；withdraw方向未证不得当pickup。
- [x] **4. 写边界 RED**：`bounded_reads_and_missing_are_not_zero` 断言128/129事件、200/201 owner与grant、两房/第三房、API缺失/抛错/错误shape/无视野；`foreign_inputs_and_unverified_semantics` 断言相关外来流入单列、单凭policy verified不升级生产语义、空日志不证明采出；`position_and_visibility_gaps` 断言缺帧只给移动区间，全部绑定actor退出且无前后tick远端未决才可not_required_no_bound_actor。
- [x] **5. 保存边界 RED**：同一 facts 命令，核对具体失败断言。
- [x] **6. 实现有界覆盖与证明采样**：actor最多3个；CPU无效明确unknown。保存原 strict firstDelivery/trip/本轮成本与未决的限定快照、期初E0及出生空载证据；未看到接纳时容器库存不得以后倒填E0。方法存在/shape合法/生产语义已核对分开展示，生产语义初值unverified；未来实际核对证据引用不能由布尔开关伪造。
- [x] **7. 运行 GREEN**：facts 套件与原 `economic-trial-runtime.cjs` 均零失败；fixture 默认不开新事件功能时原调用/结果不变。保存日志和模拟标识，不把模拟日志叫生产能力验证。

## Task 3：末尾采集、CPU预算与失败隔离

**Files:** 新建 Service/runtime 测试，修改 main、ServiceScheduler。

**Interfaces:**
- Consumes：Task 1纯归约、Task 2只读Facts；仿照既有 RemoteDangerEvidence 的 provider/CPU 注入风格，单独存储。
- Produces：默认导出 `TrialEvidenceWindowService extends Service`，constructor `(name='TrialEvidenceWindow',options={})`，options 为 profile/now/readStore/writeStore/Facts/CPU 测试依赖；`init()` 暂无采集、`analyze()/run()` 无业务采集、`cleanup()` 故障隔离调用；`commitEvidenceCandidate(expected,candidate,packetKey)->{status:'committed'|'unchanged'|'unknown'|'conflict'}` 仅操作本 namespace。
- 提交异常只读核对同 window/tick 的完整候选。确认一致才视作已提交；无法确认留不可逆缺口并拒绝同key盲重写。后续新tick是否记录不抹掉该缺口。

- [x] **1. 写 RED**：`disabled_service_is_observationally_inert` 断言不建namespace、不读getEventLog、原控制不变；`cleanup_last_preserves_p0_and_action_order` 断言新服务在EmpireMetrics之后，ActionParser在采集前、finishTick在后；`capture_failures_do_not_control_business_close` 注入provider/归约/序列化/写前/写后异常，原撤权效果仍发生。
- [x] **2. 保存 RED**：`& $node --test --test-name-pattern='disabled_service|cleanup_last|capture_failures' src/tests/trial-evidence-window-runtime.cjs`。
- [x] **3. 实现末尾服务与提交**：P3显式注册，保留原P0次序；仅cleanup调用采集，默认无请求先返回。读坏store保留raw并停止本观察，不修复/迁移业务。提交仅 namespace候选，未知不重放。
- [x] **4. 写 CPU/重置 RED**：`cpu_reserve_soft_budget_and_unreadable_clock` 断言bucket4999跳过/5000可检查，remaining<7跳过/7可开始，reserve5/maxCapture2阶段后停止剩余工作；used抛错/NaN不得按0；单API超2只记录partial不声称可抢占。`commit_readback_and_json_reload` 断言写后成功再抛错读回不重复，读回unknown不重写，半包/缺header/版本冲突跨JSON重载仍partial/corrupt。
- [x] **5. 保存上述 RED**：运行runtime全套，确认预算/读回断言失败。
- [x] **6. 完成CPU与重建隔离**：各可选阶段前后查预算；不读完整Memory，失败原因有限枚举，不保存任意error文本。重建绑定creep.memory并重建服务，原观察起点、身份、期限和包去重保持；没有marker但缺预期行也必须发现覆盖缺口。
- [x] **7. 运行 GREEN**：runtime与Task1/2全套通过；对比原关停结果并记录无法证明的引擎硬CPU终止限制。保存检查点，无网络/业务动作新增。

## Task 4：分项报告、来源下界与只读分页

**Files:** 新建 Report/report测试；补 Service.init facade。

**Interfaces:**
- Consumes：只读 EvidenceStore 与已保存packet/proof；不从Game或当前业务补历史。
- Produces：`summarizeEvidenceWindow(window)->report`、`evidenceWindowStatus(store,windowId)->status`、`readEvidencePage(store,windowId,kind,offset,limit)->page`，kind仅rows/snapshots/milestones；`deriveFirstDeliveryNewEnergyLowerBound(window)->{value:number|null,reasons}`。
- facade `global.TrialEvidenceWindow={status(windowId),readPage(windowId,kind,offset,limit),report(windowId)}`；不暴露arm/start/release/reset。输出带windowId/schema/codeVersion/revision/counts/nextOffset，status/report也≤16384字符；超长详情经readPage读取，不能静默截断身份。

- [x] **1. 写 RED**：`report_sections_keep_money_and_observation_unknown_separate` 断言出生/移动/安全/产出/入库/收支/控制关闭/尾部/恢复分别proved/missing/conflict/unsupported，没有permission/passed总开关；原unknown或未决时netEnergy=null，knownNet保留且允许负数；事件不能清资金unknown。
- [x] **2. 保存 RED**：`& $node --test src/tests/trial-evidence-window-report.cjs`。
- [x] **3. 实现只读分项归约和下界**：从保存的原ledger/evidence快照报告费用、strict firstDelivery及关闭许可。下界仅当接纳起连续、两actor出生空载、E0已知、已核实H/D、无外来/未分类输入、同一trip且原账无unknown时，计算`min(H,D,max(0,R-E0))`；不写原newProductionConfirmed。
- [x] **4. 写来源/分页 RED**：`first_trip_lower_bound_is_conservative` 断言H=100,D=80,R=70,E0=20得50；E0=100得0；逐一缺前提得null；其它trip/尾部收入不替换首批；收入有旁证但终局提交失败仍aborted/missing。`sealed_pages_ignore_current_business` 断言封存后改变当前经济状态/房间不改变报告或Memory；rows128/129、其它16/17、输出16384/+1、错offset/limit、单项过大明确报错而非nextOffset原地死循环。
- [x] **5. 保存上述 RED**：运行report全套核对断言。
- [x] **6. 实现 facade 和一致分页**：init只安装只读函数，无ensure/prune/lastAccess；固定封存revision，活动窗revision变化不允许跨revision拼接；返回可读列名而非裸位值。首次移动缺帧给区间；原safeStreak=100且采样稀疏仍不能独立证明100连续安全。
- [x] **7. 运行 GREEN**：四套新测试全部通过；读前后深比较store/原业务，冻结输入对象确保未偷偷修补字段。保存证据，不生成线上读取请求。

## Task 5：原执行隔离、完整尾部和容量组合回归

**Files:** 扩展runtime/model/report测试与新fixture；不新增业务钩子。

**Interfaces:** Consumes前四批全部接口、原native→guard→策略→ActionParser→cleanup服务链；Produces仅组合测试和保存样本，无新的产品API。

- [x] **1. 写 RED**：`enabled_disabled_fault_execution_parity` 在相同注入时钟/引擎输入下对比关闭、启用、采集故障三组原spawn/动作/账本/outcome/原期限完全相等；记录项差异不得影响经济路径。
- [x] **2. 运行并保存结果**：运行上述runtime test；若先前各批已满足该组合断言，记录其为防回归GREEN，不谎称出现行为RED；若失败则保存实际差异，先核对问题是否来自fixture或真实观察器，再修正。
- [x] **3. 写尾部/安全/跨轮用例**：`tail_last_action_confirmation_without_permission_extension` 实际引擎在原expiry接受、+1生效确认、+2仅观察、+3不追加；两tick安静不等完整300。`fresh_safety_and_no_cross_window_inheritance` 新scout真实出生/位移/跨房后100连续安全，缺帧不拼接、旧counter/费用/视野不借用；`cargo_disappearance_is_not_settlement` 区分空载在家、实体退场、失踪带货及owner=0。
- [x] **4. 运行定向用例并修正仅观察器缺陷**：预期原合法动作/关停保持不变，测试不可手填safeStreak、删claim、清unknown或延长时限。原业务若暴露新缺陷，保存证据后单独诊断，不在本观察功能中“修账”。
- [x] **5. 写容量与不可写组合用例**：`full_store_keeps_old_sealed_and_close_independent` 覆盖1303/1304行、80/81快照、64/65里程碑、131072/131073单窗、270336/270337两窗store，实际序列化；不信损坏计数。完全不可写/失败标记丢失后JSON重载仍发现缺帧，已封存/旧corrupt不自动清理。
- [x] **6. 运行组合 GREEN**：`& $node --test src/tests/trial-evidence-window-model.cjs src/tests/trial-evidence-window-facts.cjs src/tests/trial-evidence-window-runtime.cjs src/tests/trial-evidence-window-report.cjs`，全部零失败；只修本功能，存新增每项测试名、模拟证据与未覆盖真实reset/原生API说明。

## Task 6：完整离线验证、维护者审查与交付

**Files:** 修改package测试注册/services与tests说明；新建本地验证脚本和交付报告，不改旧审阅包。

**Interfaces:** Consumes所有新增套件、既有799基线与旧产物清单；Produces独立 `.superpowers/sdd/2026-10-26-runtime-evidence-window/` 检查点/日志/构建hash及 `docs/superpowers/evidence/2026-10-26-runtime-evidence-window-local-validation.md`。该目录到实施时排他创建，若已存在则用明确新attempt子目录，不覆盖或重放旧输出。

- [x] **1. 注册套件并更新维护说明**：package.json原列表不删项，追加四个新suite；说明服务只写自己的namespace、默认关闭、原生语义未核实和已批准边界，不把独立review写成已完成。
- [x] **2. 新建离线执行环境**：参考但不直接重跑 `.superpowers/sdd/2026-10-24-economic-evidence-amounts/{offline-guard,validate,build}.mjs`；新guard拒绝http/https/net/tls/fetch且记录attempt；注入子进程，通过file URL预加载，DEST置空。保存root dist及旧21项integrity文件hash，保留前四项修复source基线供差异审阅。
- [x] **3. 运行完整测试**：固定Node `$node='C:/Users/mts-2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'`；执行 `& $node .superpowers/sdd/2026-10-26-runtime-evidence-window/validate.mjs`。runner按package.test依次执行smoke、room-governor和全部node:test，记录tests/pass/fail；预期所有通过且网络attempt=0，不预写新增总数。
- [x] **4. 隔离目录仅构建**：同一runner在测试全通过后执行新build.mjs；先chdir新空build目录，再import仓库rollup.config.js（配置构造会clear当前dist），绝不能从仓库cwd导入。写新build/main.js及main.js.map.js、固定版本/hash，确认root dist原hash不变，上传数0/线上Memory写入0。不跑npm push或DEST:main。
- [x] **5. 做维护者自检**：逐项对照设计、四个旧修复仍保留、无权限/期限扩张、无错误假设workaround、源码可读且沿用附近风格；运行 `git diff --check` 与 `git diff --cached --check`，index仍空；按文件列出本轮差异，不包含混合目标进度及其它历史未跟踪文件。
- [x] **6. 执行已获用户批准的只读review方式**：若用户选择独立review，由其只核对spec/本轮diff/验证证据和五项Review Focus，不改文件、不联网、不操作线上；没有该授权就只交主代理自检，不自行调用。发现缺陷先证据化修复并跑受影响验证，源码再变则重做完整交付验证。
- [x] **7. 保存中文报告并交还审阅**：报告本地完成项、确切测试数、独立构建与hash、review结果、原生事件/CPU/真实reset等未验收项，以及默认关闭/无部署事实。计划复选框按实际进度更新，未执行项目保持空。

## 设计覆盖自检与后续授权分界

| 设计章节 | 落地批次 |
| --- | --- |
| 1–4 目标/权限/生命周期/请求 | Task1请求与身份；Task2事实；Task3末尾采集；Task4只读facade |
| 5–6 期限/CPU/容量/状态/接续 | Task1纯边界，Task3预算/提交，Task5组合容量 |
| 7 原生事件/时序/actor归属 | Task2引擎生效事件及只读验证，Task5真实模块顺序 |
| 8 分项证明/财务/下界/尾部 | Task4独立报告，Task5末尾合法动作与确认 |
| 9 重置/写失败/缺帧 | Task3写前写后读回，Task5全不可写及JSON重载 |
| 10 分页/导出 | Task4只读/字符/revision合同；本地离线样本可保存并SHA-256；线上导出工具单独执行卡 |
| 11 回归与交付 | 各批定向RED→GREEN，Task6完整测试/仅构建/审查 |
| 12 生产能力核对与权限 | 以下单独阶段；本计划不执行 |

本地完整实现不能填补生产原生事件语义缺口。后续再分别准备：默认关闭发布卡；最多3样本/60秒、不生成游戏动作的只读API能力核对卡；新鲜版本/母房/预算/父证明预检与观察arm卡；原合法单次经济启动卡。未来导出工具仍须检查 `JSON.stringify(expression).length≤1024`，页不跨window/revision拼接，本地完整导出计算SHA-256；不在Game假设Node crypto。每次都须明确授权，不继承旧失败额度、不重放unknown、不放宽30秒新鲜度、不切换网络。

只读API核对若未能验证HARVEST或TRANSFER方向/金额/时序，仍应报告未证明；不能为了启用验收而用声明/模拟替代。接纳时无源头视野导致E0未知等条件，也可能使首批新产出下界保持null；这是证据限制，不许从之后的样本回填，也不保证下一次试点一定证明全部大目标。

本计划已获认可并完成本地实施；实际发布、arm、侦察/经济启动及历史清理仍须另行明确授权。最终结果见 ../evidence/2026-10-26-runtime-evidence-window-local-validation.md。
