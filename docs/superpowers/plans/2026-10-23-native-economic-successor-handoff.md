# Native经济试点显式换轮与期限隔离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. 用户已认可本计划并授权主代理逐批实现＋一次独立只读review；本地交付已完成，未提交或部署。

**Goal:** 已结束的native经济试点可在人工明确新轮请求后，保留原档案、费用和高水位，通过原合法release/start单次交接；新会话不被旧native期限误拦，活动会话也不会失去自己的截止与撤权保护。

**Architecture:** 保留v1纯协议为独立legacy模块，原Model成为明确schema分派入口；新增v2后继请求/档案合同及纯状态机，复用原P0 Service执行效果。将native归属判断集中到只读模块，由原经济Facts及安全关停使用，避免分别判断会话所属。不增加新的Spawn、物流或账本执行器。

**Tech Stack:** 现有JavaScript ES modules、Screeps Game/Memory、node:test/CJS真实服务链fixture、Rollup；不加依赖。

**Spec:** [已认可设计](../specs/2026-10-23-native-economic-successor-handoff-design.md)。原限制证据：[关闭发布及兼容报告](../evidence/2026-10-23-economic-spawn-admission-release.md)、[复试准备方案](2026-10-23-post-spawn-admission-first-delivery-retest.md)。这些历史读取不是未来新鲜启动预检。

## Global Constraints

- 使用现有工作树C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium、codex/single-remote-mining；计划基线HEAD919ec9f6be5866a6bae5e61d81ba11b72480b7f8。保留已有混合目标进度、历史草稿、旧锁/日志和冻结证据，不重用旧wx输出路径。
- 本地实施已获认可；范围仅RED→GREEN、完整测试和仅构建。不联网、不读凭据或共享代理配置、不写线上Memory、不暂存/提交/推送/部署，不生成真实生产日期/请求或重开试点。以分批本地ledger代替技能模板的commit步骤。
- 侦察、采运、Goal/Plan、市场保持关闭；Governor shadow=true、scheduler.enforce=false；默认nativeTrialOps仍false/null，无请求时不迁移旧状态或创建新namespace。真实线上开关不在本轮重新核对。
- 固定W49N41/W48N41、source5bbcaa6d9099fc012e63155b、containerPos(19,6,W48N41)、receiver6ad0b55bceeb3db0d3b4dda0/free≥20000；必要容器自建维护，不reserve/修路/第二矿。
- 新schemaVersion2/profileId=w49n41-w48n41-first-delivery-v2；id/trialId及parent nativeId/trialId均1～32 ASCII标识字符。四项archive/release/start/hold许可必须显式true，完整表达式JSON转义后≤1024。v1旧请求、旧较长id及归档仍按原冻结合同读取和关停，不改名、不改标签。
- 父native合法terminal、controlClosureConfirmed=true，admittedIdentity完整匹配经济current；父经济terminal、managed=true，closureVerifiedAtTick>closeAppliedAtTick。父lastSequence及native.lastAcceptedStartSequence等于父identity.sequence；仅release=父+1、start=父+2。
- 父成本/入库逐项匹配，unknownEvents及全部原始unknown为0；actor/accepted/spawning/grant/pending/outbox未应用/slot未决/failedHandoff均不可存在。缺失账本/必需证据不当作0，不清claim、锁、预算receipt或原费用。旧schema合法可选字段的absent保持absent，不补写0或虚构历史；若无法由原schema、必需unknown计数及原slot/receipt证明其无未决，拒绝父证明。
- 两个连续tick母房normal、无敌情/核心缺口，Controller≥max(5000,原紧急阈值)、真实接收空间与预算安全。新请求接纳新鲜度≤30秒、区间≤10ticks；总窗口≤90分钟、stop到notAfter至少120秒；原父截止及已生成请求激活/到期值不延长。
- 最多1新scout、1miner、1hauler；新scout独立100安全ticks，body≤50/800/800，本轮1650孵化/6000基建与原滚动2000/6000预算取交集；1000ticks/90分钟先到即止，原leg≤300、一次重规划、正式孵化5tick/原生调用最多2次不变。
- 首批同trial/trip指定terminal正数次tick确认、unknown、危险、失视野、核心异常或截止均先撤权。旧费用不继承，原预算历史不删除；tailStatus=unverified保持原意，实体退场不反写成旧tail已验收。
- 有界历史最多4份父档案、整个native状态序列化≤65536字符，不自动淘汰。容量限制不阻断原已授权撤权；拒绝/未接纳等其他中断恢复不借本合同自动清理或跳过已确认release。

## Review Focus

1. 提交v2本身已覆盖policy.nativeTrialOps：Task 2/3区分“旧native执行已关闭”和“新请求envelope.enabled=true”，不能因后者拒绝一切后继，也不能伪造覆盖前未观察到的旧policy设置。
2. 冒用当前合成profile掩盖v1档案不兼容：Task 1/2/6同时验证原编译v1冻结数据、已保存线上旧记录及constructor注入fixture；无请求时任何迁移均属回归。
3. 新请求遭拒绝与旧活动会话控制被篡改是不同事件：Task 4/5验证拒绝本身不按remoteId误停外人；若policy确实覆盖了旧活动包络，原guard仍须按自己的request_changed撤权，不能以“拒绝新轮”为由跳过旧保护。
4. 原状态含可选字段或反复交接造成档案丢字段/递归增长：Task 2/5验证完整JSON往返、平面引用、历史容量/当前记录空间，以及原始unknown/拒绝证据不被normalize丢弃。
5. 首轮结束后fixture仍留旧actor和可见房间：Task 6使用明确的测试引擎退休输入，不删claim、不手填safeStreak；新scout真实出生/跨房后独立达到100，费用与期初库存分别归因。

---

## 文件与接口地图

### 产品文件

| 文件 | 职责与修改范围 |
| --- | --- |
| 新建src/services/NativeEconomicTrialOpsLegacyModel.js | 从原Model原样提取v1纯协议；不改原阶段、期限、归档与停机算法 |
| 新建src/services/NativeEconomicTrialOpsSuccessorProtocol.js | v2固定profile、严格请求/父证明字段合同、原始档案的平面编码、容量和短表达式构造；不读Game/Memory、不执行效果 |
| 新建src/services/NativeEconomicTrialOpsSuccessorModel.js | v2状态验证、接纳/归档/高水位/intent/阶段推进；不调用服务或引擎 |
| 新建src/services/NativeEconomicTrialOpsOwnership.js | 按活动或拟接纳完整身份解析native所属及期限/控制失败；只读，无预算prune、持久化或关停动作 |
| 修改src/services/NativeEconomicTrialOpsModel.js | 对外保留原三个export，分派v1/v2；不再把v2塞入v1旧准备比较 |
| 修改src/services/NativeEconomicTrialOpsFacts.js | 补充父交接与本轮事实，复用原人口/预算/健康门槛；v1 knownOld原语义保留 |
| 修改src/services/NativeEconomicTrialOpsService.js | 按schema使用事实/纯Model，写前精确比较与一次效果；独立身份安全关停 |
| 修改src/services/RemoteEconomicTrialFacts.js | 用集中归属合同替换旧nativeRequests按旧current筛选的局部逻辑；保留其他Facts和原Model接纳/锁逻辑 |
| 修改src/services/NativeEconomicTrialOpsEvidence.js | 只读展示v1/v2、父档案引用、独立费用/原期限/拒绝和未结项 |

不改NativeEconomicTrialOpsKnownPreparation.js及原v1 Profile语义，不改main/P0顺序、RemoteEconomicTrialModel会话schema、Spawn/Bureau、运输与费用确认算法。若实施发现必须越过该范围，先留RED证据和解释，不夹带扩展。

### 公共接口（Task 1/2定义，后续消费）

`NativeEconomicTrialOpsModel.js`继续导出`advanceNativeEconomicOps(input,event,facts,clock,profile?) -> {state,effects,error?}`、`validNativeEconomicOpsState(state) -> boolean`、`nativeOpsEconomicIdentity(request,profile) -> EconomicIdentity`。旧调用签名可用；v2完整身份从request.parent.identity取得remoteId/epoch，新trialId/startSequence/codeVersion取本请求。v1原行为交给LegacyModel。

`NativeEconomicTrialOpsSuccessorProtocol.js`导出：

- `NATIVE_SUCCESSOR_PROFILE`：冻结的v2固定试点合同，沿用v1配置指纹与旧recon合同，移除“父current必须等于最早旧准备”的假设；不能由线上Memory任选profile。
- `validateNativeSuccessorRequest(request,profile,clock) -> {valid,reason}`：严格字段、身份、整数、四项许可、序列和原时间门槛；这是请求合同，不把它当真实父状态已通过。
- `makeNativeSuccessorSubmission(request,profile=NATIVE_SUCCESSOR_PROFILE) -> string`：仅构造一次短表达式并校验serialized≤1024，不发送。生产版默认profile固定；注入只供离线测试。
- `encodeNativeSnapshot(raw) -> snapshot`、`decodeNativeSnapshot(snapshot,history) -> raw`：v1原样复制；v2仅把root.history替换为有序historyRefs，其余字段完整保留。解码按已有较早记录还原，拒绝缺失/重复/自引用/指向更晚记录的引用，不能递归嵌入整个history。
- `createNativeParentArchive(rawNative,economicState,settings,clock) -> archive`：保存完整原native快照、经济current/previous及原顶层字段、当tick实际economicTrial/nativeTrialOps设置、原父窗口；不生成许可或改原对象。

`NativeEconomicTrialOpsSuccessorModel.js`导出`validNativeSuccessorState(state) -> boolean`和`advanceNativeSuccessor(input,event,facts,clock,profile) -> {state,effects,error?}`；v2字段见下一段，effects只复用原release/start/hold种类，不孵化/移动/转账。

`NativeEconomicTrialOpsFacts.js`保留`collectNativeEconomicOpsFacts(profile,clock)`；新增`collectNativeSuccessorFacts(profile,clock) -> facts`。共同字段沿用原protectedSafe/clockFresh/configSafe/fingerprint/homeReady/receiverSafe/budgetSafe/accountingKnown/quiet/reconReleased/executionClosed/economicState/economicSettings/settings/operationEpoch/scoutObservation/routeObservation；v2增加`nativeState`、`parentProof={valid,reason}`、`archiveInputs`，不得从空global推断quiet。

`NativeEconomicTrialOpsOwnership.js`导出`resolveNativeEconomicOwnership(input) -> {identity,owner,request,failure}|null`，input含nativeState/nativeSettings/economicState/economicSettings/profile/clock。无native归属返回null；已知所属但缺/错包络仍返回failure，不能退化为普通非托管许可。failure使用既有native_ops_window_expired/native_ops_control_changed；未知或损坏native状态在固定scope内返回native_ops_state_invalid并保留raw。

Service构造器保留原`{now,profile}`，增加仅构造器可注入的`successorProfile`供fixture；生产用冻结默认profile，不读取可变Memory来选合同。原方法advance/perform/applyEffect/requestOwnedStop保留职责，内部按schema调用；Effects原expectedBefore精确对比仍必需。

### v2状态合同

顶层为schemaVersion2、lastAcceptedStartSequence、current、previous、history、rejections及可选lastRejection。current持有request、stage、lastTick/lastNowMs、preflightAt、archiveRef、releaseRequest/startRequest、intents/events、admittedIdentity/outcome及原观测/closure字段；previous完整保存原native current。history按先后存archive，archiveRef取父native id；v2快照通过historyRefs引用更早档案，不把root.history复制进去。

新轮接纳时先形成完整state+archive，一次persist，lastAcceptedStartSequence推进到本轮startSequence；随后tick验证档案及第二份事实后才生成release效果。未获父证明的拒绝不升级schema、不换current、不消耗start高水位；保留拒绝信息但无经营effects。rejections最多16项，保存id/reason/tick；不自动淘汰，满额则拒绝新增轮次并保留最后错误，不通过重置列表获得新额度。

容量按完整拟写状态核算：顶层/history/previous/rejections等在`current:null`时≤49152字符，给本轮current预留16384字符，两者组合必定≤65536。current事件≤32、reason≤160字符，观测仅持久原有明确字段而非任意route原对象。超预算拒绝新接纳；已运行后记录异常/超限先精确撤权，不通过删除父档案来保存诊断。4份父档案和16条拒绝是硬上限，不承诺所有大记录一定能装满。

“原native设置”必须如实归档：新v2提交已经改变policy时，archive.settings.nativeTrialOps就是当tick的新envelope；父旧request另在原nativeSnapshot.current.request中完整保留。不能编造一份没有读取到的old enabled=false。父已关闭由terminal/closure/实际执行关闭证明，新请求enabled=true只是本轮候选包络，并非旧轮仍执行。

## 验证命令和留证

所有命令只在实施获认可后运行。bundled Node与既有deny-network preload分别设为任务变量，日志保存新目录`.superpowers/sdd/2026-10-23-native-economic-successor-handoff/`，含baseline、逐批RED/GREEN、最终manifest、维护者检查和后续认可的review。父发布证据仅只读复制，不重跑旧有wx诊断脚本。

```powershell
$handoffNode = 'C:/Users/mts-2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$handoffDeny = './.superpowers/sdd/2026-10-22-readonly-handshake-observer/deny-network-preload.mjs'
& $handoffNode --import $handoffDeny --test --test-name-pattern='^successor_p1_' src/tests/native-economic-ops-successor.cjs
```

后续Task替换prefix。RED须因目标行为未实现/错误所属而失败，不能只以import缺失或语法错误作原始缺陷证据。旧674项及新用例分别统计，不预先承诺未来总数；纯模型/adapter检查不能冒充完整服务链或线上验收。

## Task 1：冻结v1语义，建立v2请求与schema分派合同

**Files:** 新建LegacyModel.js、SuccessorProtocol.js、SuccessorModel.js（仅本批纯请求/状态入口所需）；修改原Model.js；新建src/tests/native-economic-ops-successor.cjs、helpers/native-economic-successor-fixture.cjs。路径均为上述完整目录。

**Interfaces:** 产出请求验证/builder、原三个公共exports及v1/v2分派；消费原economicIdentityMatches/validEconomicTrialState和冻结v1 Profile。不接入生产Service。

- [x] 写`successor_p1_terminal_parent_routes_v2_without_legacy_fallback`：保留合法terminal父Model输入及v2合成请求，故意不提供后继父事实；断言明确返回successor_parent_facts_missing、原state和高水位不变、effects为空。原实现terminal静默早退而没有该拒绝原因应先RED；本批只建立严格请求/分派入口，不以不完整档案伪造接纳。完整首次接纳及重放由Task 2负责。
- [x] 写`successor_p1_request_fields_clock_and_wire`与`successor_p1_legacy_contract_unchanged`：逐一缺字段/多字段、32/33字符、四项false、错父epoch/version/profile/序列、30秒及10tick两侧、120秒余量和90分钟边界；短表达式≤1024，超长拒绝。原v1固定准备、旧长id、原验证器和原经济identity结果保持。
- [x] 按本批prefix跑RED，留原失败断言。先原样提取v1 reducer到LegacyModel，对照基线diff仅模块移动/转发；将新接口与schema分派实现到GREEN，未写完的后续v2阶段明确拒绝，不允许经营fallback到v1。
- [x] 跑本批及旧native-economic-ops-model.cjs、economic-trial-model.cjs为GREEN；记录冻结KnownPreparation/Profile内容哈希一致。无请求时raw引用/JSON和namespace不变；不提交。

## Task 2：真实父事实、完整档案与容量/高水位

**Files:** 修改SuccessorProtocol.js、SuccessorModel.js、NativeEconomicTrialOpsFacts.js；测试同新suite/helper，必要扩展原native-economic-ops-facts.cjs。

**Interfaces:** 产出collectNativeSuccessorFacts、encode/decode/archive及v2状态校验；Task 3使用facts.parentProof和current.archiveRef核对原对象。父proof与archive校验分开，后续原managed允许改变的唯一位置是合法release。

- [x] 写`successor_p2_real_parent_proof_and_readonly`、`successor_p2_new_enabled_envelope_is_not_old_execution`：从真实v1服务链取得父terminal，再用合成新请求读取Facts；完整JSON前后不变、parentProof.valid=true。new enabled=true不能误判旧轮在执行；旧actual closed不满足、父少admittedIdentity/closure或费用变化则false。
- [x] 写`successor_p2_terminal_parent_admits_once_and_replay_denied`：用本批完整父facts及档案，断言新current.id、schemaVersion2、lastAcceptedStartSequence=父+2，原父完整留存；重放相同请求、同seq不同id或历史id均无第二个接纳。原代码应仍因terminal不接纳而RED，不用清空原状态取得新额度。
- [x] 写`successor_p2_pending_and_unknown_matrix`：actor/accepted/spawning/grant、slot binding/not_started/call_started、ledger applying、outbox prepared/applying、infra pending、failedHandoff、原始unknown、缺ledger分别拒绝；包括旧unknown不许因默认缺失被当0、scope上一tick被当当前。保留原recon release enabled=true锁存。
- [x] 补`successor_p2_required_missing_is_not_legacy_optional_absence`：冻结旧sample的evidence只有原7个必需字段时，不能擅自新增logisticsUnknown字段；删必需unknownEvents/unknownEnergyUpperBound或整个ledger必须拒绝。有可选unknown时必须合法且为0，非零/NaN/负数/undefined值不因兼容被忽略；存在未决slot或outbox时也不以可选字段缺省推定结清。
- [x] 写`successor_p2_lossless_flat_archive_reset_and_capacity`：保存v1可选字段和economic.previous；encode/decode JSON完全一致；多代平面档案无嵌套history，错误refs拒绝；第5父档案、超过65536/当前空间不足、拒绝记录第17项均无新增经营effects、原记录保留。
- [x] 跑prefix看RED，按公共接口实现只读Facts、完整档案、状态校验及接纳高水位；每次归档用当tick真实设置，不从外部陈旧样本补事实。父已released/未接纳/unknownEffect拒绝并保留原中断点，不自动猜测恢复。
- [x] prefix及Task 1/旧native facts GREEN；在Memory JSON往返后核对档案、原窗口、费用50与previous50仍各自保留。记录容量样本及原始字段覆盖，不提交。

## Task 3：接入P0的一次交接效果，原release/start不重做

**Files:** 修改SuccessorModel.js、NativeEconomicTrialOpsService.js、Model.js、Facts.js；新fixture接入原helpers/native-economic-ops-fixture.cjs及economic-trial-fixture.cjs的constructor参数，不复制整套Game。

**Interfaces:** 消费Task 2父事实/档案，产出原类型replace_release_request/prepare_start/activate_start/hold_owned_session效果；每个effect含完整expectedBefore与已持久planned intent。v1效果及knownOld仍走legacy。

- [x] 写`successor_p3_two_tick_archive_then_legal_release`、`successor_p3_prepare_keeps_execution_closed`、`successor_p3_confirmed_release_never_replays`。断言首tick只persist新状态、无release；第二tick档案和事实不变才提交；原Model处理后父只变managed=false/lastSequence=父+1，新prepare为enabled=false且无原生scout调用；重复evaluate不增加release提交次数。
- [x] 写`successor_p3_before_write_cas_changed_refuses`：intent后改变原current/previous/设置/金额/epoch/配置/closure或时间，applyEffect拒绝，不回写expectedBefore、不覆盖更新后的raw、不改激活tick。
- [x] prefix RED后接入Service的schema分派、archive后一tick确认及写前CAS。新归档不直接调用其他Service.analyze；release/start仍由原经济Model在精确tick处理；start expiresAtTick=activateAtTick+1000、expiresAtMs=issuedAtMs+5400000生成一次且不续期。
- [x] 补`successor_p3_parent_predicates_are_stage_scoped`纯阶段回归：parentProof只用于接纳/归档确认；release后按档案核对managed=false和父+1；接纳子轮后不要求父仍为economic.current、quiet=true或executionClosed=true。observing改按ownSession/boundStart及原保护/窗口检查，不能因合法新actor出现而立即误停。
- [x] prefix GREEN，加跑前两批和旧native runtime的默认关闭/release/prepare场景。本批真实链验收到合法release和关闭prepare为止，旧native误拦新接纳由Task 4明确修复，不用手工清native绕过；不提交。

## Task 4：按完整身份解析native所属，修复跨轮期限误拦

**Files:** 新建Ownership.js；修改RemoteEconomicTrialFacts.js、Service.js；测试新suite及相邻economic-trial-model/runtime回归。

**Interfaces:** 产出resolveNativeEconomicOwnership。managed=true时选原current身份；仅在其已release且request是结构合法的新start时选择拟接纳身份。匹配记录的缺/错/关闭包络都fail-closed；archive只作证据，不能当活动许可。

- [x] 写`successor_p4_released_parent_expired_window_does_not_block_child`：真实v1父终态、合法release后，新start必须由新v2完整包络约束；旧原生窗口故意过期/disabled，断言不再出现native_ops_control_changed/window_expired，原父窗口原值不变。原始错误RED必须经过实际collectEconomicTrialFacts和原Model。
- [x] 写`successor_p4_active_parent_cannot_borrow_child_window`、`successor_p4_child_control_missing_changed_or_expired_denies`：managed父未release时不能取新窗口；子record或policy任一副本缺失/冲突、schema损坏、自身deadline到达仍拒绝。新start malformed/同remote错seq/epoch/version不得获得native许可。
- [x] 写`successor_p4_same_tick_spawn_and_action_cutoff`与`successor_p4_old_delayed_hold_cannot_stop_child`：analyze后推进now到本轮stop，Spawn intake/run及ActionParser原生调用为0；调用旧candidate安全关停不得按相同remoteId撤权到新完整身份。
- [x] prefix RED后实现集中只读解析并替换旧局部filter。不要复制requestError为另一套接纳器；本模块只判断完整身份/归属，原Model继续校验请求与release锁。Service停机可用任一原合法包络证明精确所属，过期不取消hold能力。
- [x] 全部prefix及Task 1～3、旧经济/native模型/运行链GREEN。另测新请求拒绝本身effects为空；若测试真的覆盖旧活动policy包络，原guard按request_changed停止自己的旧会话仍属正确行为，不能要求它继续运行。记录两种事件区别，不提交。
- [x] 用真实链补Task 3阶段反证：新scout已出现、quiet=false且旧父不再current时，observing继续到独立安全计数；本轮自己的撤权或期限到达仍立即关停，不以取消所有父检查来放松入场。

## Task 5：故障隔离、重置不重放和只读历史报告

**Files:** 修改SuccessorModel.js、Service.js、Evidence.js及Ownership.js（仅故障局部）；测试新suite和原native-economic-ops-evidence.cjs。

**Interfaces:** 消费完整交接/所属链，保持requestOwnedStop不依赖摘要、详细记录或普通业务截止。summary沿用global.RemoteTrialOps.status(id)，支持current/previous及history中的明确id查询，不提供控制命令。

- [x] 写`successor_p5_reset_at_each_effect_boundary`和`successor_p5_applied_unknown_and_missed_activation_never_replay`：分别在archive persist、release intent/请求写入/结果保存、start准备/激活、引擎call_started、账本applying注入异常/JSON重置。重复输入次数增加时，同id的经营effect/原生调用不增；planned不明不补发，已确认release不重做，原激活/到期固定。
- [x] 写`successor_p5_close_before_record_failure`、`successor_p5_capacity_cannot_revoke_hold`：summary、events、归档/结果persist、后续effect_result均可失败，但已确认属于本轮的remote/room/operation先关闭。超限不删history；known envelope损坏一份仍可精确hold，两个都不可信则报告不可证明，不能对任意identity操作。
- [x] 写`successor_p5_history_summary_preserves_separate_costs_and_tail`：current/previous/history每轮费用、旧原窗口与身份独立展示；未知不转0，未结tail仍unverified，历史摘要无任何Memory变化。拒绝分支不覆盖原current，失效请求不自动重启。
- [x] prefix RED→实现最小故障分支→GREEN；hook内只采样或抛错，在外层断言已关停。restoreMemory必须JSON往返、重绑creep.memory、清旧global并重建服务，不能保留fixture旧raw闭包作跨tick证据。
- [x] 重跑Task 1～4及旧native runtime/evidence故障组，记录经营intent次数、原费用/unknown/高水位、closeApplied与更晚closure证明。不提交，不声称任何损坏Memory都可保证写回。

## Task 6：真实两轮闭环、安全门槛及最终交付

**Files:** 新suite/helper；package.json仅把新suite加入原test命令；services/tests AGENTS更新最终合同；可在相邻旧suite补兼容断言，不修改无关产品。新建docs/superpowers/evidence/2026-10-23-native-economic-successor-handoff-local-validation.md。

**Interfaces:** 使用前五批真实服务链和统一fixture；测试helper提供`createSuccessorFixture(options?) -> {s,scene,toParentTerminal,retireSettledRemoteActors,makeSuccessorRequest,submitSuccessor,advance,restoreMemory}`。makeSuccessorRequest使用固定注入时钟/合成id，不读取凭据、不生成生产许可；submitSuccessor仅写测试Memory。

- [x] 写`successor_p6_two_generations_real_first_delivery`：先由原v1单次submit自然运行到terminal/closure，外层确认无未决claim，再通过明确测试引擎退休输入移除Game中的旧actor；不清旧Memory账、grant或未知。一次v2 submit后自然完成归档/release/start、新scout实际出生/移动/跨房/100安全ticks、miner/container/hauler及严格次tick首批入库；断言本轮1/1/1、旧费用独立、新费用按canonical receipt相加、只有一次首批并关闭。
- [x] 写`successor_p6_fresh_vision_and_home_spawn_competition`：旧视野/100不传给新会话；在新轮真实safe99后以核心hauler TTL触发单Spawn原同级母房补员，等待30ticks不绑定miner；获席位后原5tick、最多2次已知调用和全轮截止不变。禁止手填safeStreak、删unknown或直接用适配器代替生产链。
- [x] 写`successor_p6_parent_reuse_capacity_and_rejection`、`successor_p6_protected_home_route_budget_stops`：正常完成的v2父可用同合同再明确请求下一轮，不改代码常量；重复/历史id及额度满拒绝。依次改变母房normal/敌情/core、接收空间、滚动预算、Goal/市场/shadow/enforce、新鲜度、路线/失视野，断言入场拒绝或原生前关停；确认无补员/第二趟/任意目标。
- [x] prefix先RED，再只修正属于已批准换轮合同的生产/fixture缺口至GREEN。旧actor退休是测试世界输入，不是线上自然退场证明；新容器必要施工和旧库存/新产出分别验证，不能用期初库存确认“新生产已证明”。
- [x] 将新suite加入package后，在deny-network下运行完整npm test等价链：smoke、room-governor、原16个node:test文件加新suite。保存命令、exit、原674及新增数量/skip/fail；全套通过后不无意义重跑，后续改动仅补必要检查。
- [x] 仅构建：任务变量保存原DEST，try中移除本进程DEST，用bundled Node及deny preload执行node_modules/rollup/dist/bin/rollup -c，finally恢复原值。禁止push/local/watch，确认输出dryRun，保存main/map SHA-256及SERVICE_VERSION；dist只是本地候选，不能当已部署版本。
- [x] 维护者检查聚焦原始误拦是否消失、v1是否保留、是否仍残留固定最早旧准备的v2比较、是否有重复parser/递归快照/删除旧账/盲目经营重放、是否改了无关代码。运行git diff --check和git diff --cached --check，保留原已有改动，不自动暂存。
- [x] 仅在用户选择时增加一次独立只读review，核对本spec与最终diff/测试/版本兼容/故障边界，不改代码、不联网、不操作线上；未经授权不调用。反馈需主代理复核证据，重要问题先RED→修正→必要验证，再报告一次review及维护者修复结果，不自动追加第二次。
- [x] 交付中文报告，列明源文件/固定产物、逐批RED/GREEN、完整检查、review授权与结果、关闭默认、旧档案/费用/期限保留、容量拒绝、unknown及未覆盖的中断恢复。注明没有线上侦察/采运/入库或10000tick验收，不提交/推送/部署；后续发布、只读核对及新明确时间窗启动仍分别授权。

## 自检与规格映射

| 设计要求 | 计划负责批次 |
| --- | --- |
| 固定v2请求、短表达式、v1冻结兼容、默认关闭 | Task 1、2、6 |
| 父完整身份/费用/闭合/实体/预算证明 | Task 2、6 |
| 完整平面档案、4份/65536上限、原previous留存 | Task 2、5 |
| 两tick预检、合法release、单次start、原期限 | Task 3、5 |
| 旧期限不误拦、新活跃所属仍严格、动作前截止 | Task 4、5 |
| unknown不重放、记录失败先关停、真实重置 | Task 5 |
| 新独立100安全ticks、母房仲裁、真实两轮首批/收支 | Task 6 |
| 不覆盖尚未接纳等其他恢复、tail缺口明示 | Task 2、5、6及Global Constraints |
| 完整测试/仅构建/人类选择review及生产授权边界 | Task 6 |

交付自检：六批本地实现与维护者检查完成，完整720/720、smoke/Governor、仅构建通过，完成一次独立只读review并修复两项Important。字符预算可能先于4档案数量上限触及，保留精确覆盖限制；没有新增生产许可。详见 ../evidence/2026-10-23-native-economic-successor-handoff-local-validation.md。
