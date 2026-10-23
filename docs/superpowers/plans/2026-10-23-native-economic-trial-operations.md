# 游戏内一次性经济试点入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. 主代理逐批执行；只有用户明确选择后才增加一次独立只读 review，不自动委派。

**Goal:** 将首批入库试点的预检、旧准备交接和单次启动放到游戏内运行，使断开外部连接后仍由原经济守卫完成经营、撤权及可回读结算。

**Architecture:** 新增P0 NativeEconomicTrialOps，位于RemoteReconTrial之后、RemoteEconomicTrial之前。Facts读取当tick事实，Model纯归约持久阶段与一次性intent，Service以精确前置状态应用效果；继续复用原经济守卫、Spawn/Market/ActionParser与真实账本。外部只需提交一个短请求，旧外部恢复入口不扩展。

**Tech Stack:** 现有JavaScript ES modules、Screeps Game/Memory、node:test/CJS生产链fixture、Rollup；不新增依赖。

**Spec:** [2026-10-22-native-economic-trial-operations-design.md](../specs/2026-10-22-native-economic-trial-operations-design.md)。用户于2026-10-23认可具体设计和本六批计划，选择主代理实现＋一次独立只读review；本地实施完成，生产发布及启用未授权。

## Global Constraints

- 工作树固定`C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium`，codex/single-remote-mining；起点HEAD32313c084b2ff6f0d4ed9735632f0db901125f0b。不得转到主目录main实施，也不覆盖既有未提交文档。
- 原18:30:00.841/18:32:00.841许可永久保留且过期；新入口不复用它。未来归档并取代已知未激活准备、合法release、start和新绝对时间窗必须另获生产授权。
- policy.remoteMining.nativeTrialOps默认`{enabled:false,request:null}`；侦察、实际采运、Goal/Plan、市场不启用，Governor shadow=true、scheduler enforce=false。
- 固定profileId=`w49n41-w48n41-first-delivery-v1`；W49N41→W48N41/source5bbcaa6d9099fc012e63155b、容器(19,6)、接收terminal6ad0b55bceeb3db0d3b4dda0/free>=20000；允许必要容器自建维护，不reserve、不建路、不扩第二矿。
- 最多1新scout/1miner/1hauler，body<=50/800/800；本轮1650/6000与原1000tick滚动2000/6000预算取交集；新scout独立100安全ticks。
- 1000ticks/90分钟与更早stopAtMs先到；notAfterMs-issuedAtMs<=5400000、notAfterMs-stopAtMs>=120000；leg<=300、原request/重试期限不续期。
- 普通请求必须serialized<=1024；外部未知写入不重发/换id，游戏内已提交或不明intent不再次应用。不能删claim、旧锁、旧current或unknown换额度。
- 真实次tick指定terminal交付才算入库；旧50、新确认成本、unknown、入库、净收益及tail分别留证；新产出缺证据保持null，tailStatus=unverified不伪装结清。
- 每批RED→GREEN，批末维护者检查；不暂存、提交、推送、部署、联网、改共享网络或线上Memory。构建须DEST为空；主任务的生产授权不自动覆盖本计划。

## Review Focus

1. 入口前global.RemoteMining每tick清空，不能据此宣称无旧actor或当tick路线已安全；Task 2/4验证真实Game及账本，scope未就绪不放行经济动作。
2. 新版本与旧未激活准备不同，必须先持久归档、明确supersede，再走合法release；Task 2/3/4验证旧对象保持和拒绝静默换版本。
3. intent与效果之间重置/日志故障，未知结果不得重发，即使看见已生效；Task 3/5逐边界验证。
4. 两组有界历史不能永久记住任意id；Task 1/3保留单调lastAcceptedStartSequence，默认profile只接纳精确旧sequence1→release2→start3，不能轮换current/previous绕过重放拒绝。
5. 断tick跨过notAfter或Service异常，不能因外部许可过期而失去动作前撤权；Task 4/5验证先关停、无新经营，有限tail仍由原守卫负责。

---

## 文件与接口地图

新建`src/services/RemoteEconomicTrialConfig.js`：`economicTrialConfigFingerprint(config, policy): string`，精确保持原Facts的JSON字段及顺序，不把enabled/hold或nativeOps参数加入经营指纹。原Facts改用此函数，运维也用同一函数。

新建`NativeEconomicTrialOpsProfile.js`：冻结`NATIVE_OPS_PROFILE`；`validateNativeOpsRequest(request, profile, clock): {valid, reason}`；`makeNativeOpsSubmission(request): string`只构造固定policy对象赋值表达式，不发送请求。

新建`NativeEconomicTrialOpsFacts.js`：`collectNativeEconomicOpsFacts(profile, clock): NativeOpsFacts`，只读；返回控制/版本/配置/旧准备/经济state、home/core/receiver、原生人口/accepted/spawning、grants/infra/outbox/slots/unknown、当前请求投影及`ready/reasons`，含tick/nowMs。route/safeStreak只投影原守卫证据，不替它放行。

新建`NativeEconomicTrialOpsModel.js`：`validNativeEconomicOpsState(value): boolean`；`advanceNativeEconomicOps(state, event, facts, clock, profile): {state,effects}`。event只含evaluate、effect_result、end_tick；effects限archive_preparation、replace_release_request、prepare_start、activate_start、hold_owned_session。所有effect携带key、expectedBefore、expectedAfter、identity，禁止任意路径/脚本。

新建`NativeEconomicTrialOpsService.js`：BaseService，构造器`(name,{now,profile}={})`，生产只用编译profile；`init/analyze/cleanup`、`applyEffect(effect)`、`requestOwnedStop(reason)`。只读global.RemoteTrialOps.status(id)返回脱离引用的摘要，不暴露写方法。测试构造器profile注入不从线上Memory选择任意profile。

新建`NativeEconomicTrialOpsEvidence.js`：`summarizeNativeEconomicOps(state, economicState, clock): object|null`，只投影原经营证据，容错有界；不能参与权限决定或触发收入记账。

测试新增`src/tests/native-economic-ops-{model,facts,runtime,evidence}.cjs`及`helpers/native-economic-ops-fixture.cjs`；既有economic fixture只添加opt-in运维插入与测试依赖注入，默认行为不变。不复制整套孵化/移动/物流模拟。

修改点限上述模块、`RemoteEconomicTrialFacts.js`、`main.js`、`core/ServiceScheduler.js`、`config/EmpirePolicy.js`、相关fixture/tests/package.json和相应AGENTS说明。不改经济Model接纳规则、账本确认算法、旧外部入口或冻结日志。

## Task 1：默认关闭、完整请求和共用指纹

**Files:** 新建Config/Profile、model测试；修改EmpirePolicy、RemoteEconomicTrialFacts，按需扩展原economic-trial-model测试。

**Interfaces:** request字段固定为schemaVersion、id、profileId、codeVersion、oldIdentity、expectedLastSequence、trialId、releaseSequence、startSequence、issuedAtMs、stopAtMs、notAfterMs、acceptNotBeforeTick、acceptNotAfterTick及四个allow字段。id允许1..64 ASCII字母/数字/下划线/连字符；trialId允许1..56，因为release-前缀8字符且原Model request.id上限64，不放宽原限制。oldIdentity固定旧economic身份/版本1792555927985；旧准备独立绑定1792636618804。expectedLastSequence1/release2/start3固定。

30秒和accept tick范围只用于首次接纳；已接纳运维每tick核对固定原请求、当tick事实与绝对经营截止，不因入站30秒已过而重新接纳/续期，也不把它误作整轮经营期限。

- [x] RED：`native_ops_default_off_preserves_existing_state`、`native_ops_request_schema_and_window`、`native_ops_short_submission_wire_budget`、`native_ops_shared_fingerprint_is_byte_identical`。断言默认无运维namespace/原请求不变；缺旗标、额外字段、旧版本冒充、trialId57/旧id复用、未来issued、接纳时已超过issued+30000、tick不在声明范围（跨度<=10）、总窗>5400000或清理预留<120000均拒绝。
- [x] 运行`& $node --test src/tests/native-economic-ops-model.cjs src/tests/economic-trial-model.cjs`，确认新接口缺失或明确行为失败，不用依赖错误伪装RED。
- [x] 实现纯接口和默认值；Profile固定已审阅配置/旧准备对象，未知字段拒绝；短表达式只用JSON序列化固定对象，无eval/网络/动态Memory路径。id64、trialId56的完整合法请求必须serialized<=1024；以旧Facts真实输入对比抽取前后的精确JSON。
- [x] GREEN运行同命令，并核对变更默认值不会重写已存在policy、旧economic.current或Goal定义。
- [x] 批末自检并记录RED/GREEN证据；不提交。

## Task 2：当tick预检与精确旧准备识别

**Files:** 新建Facts、facts测试、opt-in fixture；只读复用CreepPopulation、RemoteMiningLedger等已有接口。

**Interfaces:** NativeOpsFacts按上述地图；clock=`{tick,nowMs,codeVersion}`。ready不包含“远端已安全”的推断，只证明启动前隔离与母房/旧scope已结清。连续两个tick ready由Model累计，Facts不记忆。

ready仅描述初始已知旧准备；Facts同时返回真实current/settings/request，由Model按阶段分别比较归档前、release后managed=false/lastSequence2、start准备/已接纳形态。不得把初始managed=true/空指纹条件一直套到已合法release后的阶段。

- [x] RED：`native_ops_facts_use_game_and_ledger_not_empty_global`、`native_ops_known_preparation_exact_match`、`native_ops_old_recon_release_latch_is_required`。真实accepted/spawning、live actor、unknown/applied不明、pending/grant/outbox或少字段任一出现均ready=false；global.RemoteMining={}不能使其变ready。
- [x] 运行`& $node --test src/tests/native-economic-ops-facts.cjs`确认RED。
- [x] 实现只读collector：核对母房normal/coreUsable各>=1且coreUpcoming0、Controller>=max(5000,既有emergency门槛)、active且idle Spawn、能量>=50、terminal/free、全保护字段、所有原滚动预算和已知profile；未知值一律不当零。旧准备必须空指纹且无激活/期限字段、旧current terminal/managed/sequence及费用来源完整匹配；保留旧recon release锁存true及其绑定。
- [x] GREEN并增加`native_ops_native_position_and_current_tick`：非可枚举原生坐标显式读取；collector运行前后deepEqual Memory，不能调用动作。用默认编译profile的精确常量做契约测试；生产链可注入等价两房测试profile，但不能在Memory开放任意profile。
- [x] 批末检查全前置条件有来源；不能直接从新入口尚未产生的scope读取budgetStatus并把undefined当安全。

## Task 3：持久协议、归档与一次性intent

**Files:** 新建Model，扩展model测试。Profile提供合法release/start请求构造所需静态约束，经营指纹仍来自共用函数。

**Interfaces:** Memory.empire.remoteMining.nativeEconomicOps schemaVersion1，含current/previous、lastAcceptedStartSequence。current含request、stage、lastTick/lastNowMs、两tick预检证据、原准备archive、每effect唯一intent、固定releaseRequest/startRequest、admittedIdentity及outcome。事件<=32，current/previous各最多1；未知schema保留原值。

- [x] RED：`native_ops_two_consecutive_preflights`、`native_ops_archive_before_supersede`、`native_ops_release_start_stages`、`native_ops_intent_no_replay_after_reset`、`native_ops_high_water_survives_history_rotation`。纯Model输入JSON往返后，同key不再产effect；不同id也不能越过活跃运维或精确旧scope；无明确supersede允许不替换。
- [x] 运行`& $node --test src/tests/native-economic-ops-model.cjs`确认RED。
- [x] 实现持久stage与比较语义：T预检、T+1通过第二次后archive；后续tick验证archive先存在且旧请求未变才产replace_release_request，完整新版本release.activateAt=T+1。等待原guard在精确tick应用；只在后续tick看到旧current除managed外相同/lastSequence2才prepare_start。start请求fixed.activateAt=T+1；此时economicTrial.enabled=false、remote/room=false、hold=true；activate_start到精确tick才开启原许可。outcome终态冻结，不因重置重新构造期限。
- [x] GREEN：补`native_ops_missed_activation_does_not_reschedule`、`native_ops_unknown_applied_does_not_advance`、`native_ops_clock_rollback_and_gap_stop`；跳tick、时钟回退、effects结果不明均结束经营推进。旧经济50不写入新证据；不续旧leg/slot/TTL。
- [x] 批末检查没有完整复制经营Model；effect生成只提供现有守卫合法请求，不直接修改economic.current/lastSequence或调用引擎。

## Task 4：P0服务、合法release与同tick接纳

**Files:** 新建Service/runtime测试；修改main、ServiceScheduler、opt-in economic fixture、smoke中的顺序断言。新增运维服务精确名称`NativeEconomicTrialOps`并显式列P0。

**Interfaces:** Service保存Model.state后才applyEffect；效果前再次收集当前facts，逐项比较expectedBefore并核对request权限/版本/当tick/墙钟和身份，之后一次提交；effect_result只反映真实结果。普通异常不能跳过其后原经济守卫。测试fixture的now由构造器注入，禁止全局改Date.now。

- [x] RED：`native_ops_real_service_order_and_default_off`、`native_ops_real_guard_release_then_start`、`native_ops_no_departure_between_prepare_and_activation`；通过真正RemoteRecon→Ops→Economic→RemoteMining→Bureau/Spawn→Market/Strategy→ActionParser顺序验证。不能调用scene.prepare()绕过新入口，不能直接手改managed/sequence或safeStreak达标。
- [x] 运行`& $node --test src/tests/native-economic-ops-runtime.cjs src/tests/economic-trial-runtime.cjs`确认RED。
- [x] 接入Service；archive效果不改旧请求且跨tick回读；replace_release_request是显式允许的新准备，不谎称未重做准备。后续stage只读确认原Model的seq2release和seq3start，旧对象由原Model移入previous；开关设置仅限该固定scope。global.RemoteTrialOps只暴露返回副本的status(id)，禁止公开任意写API。
- [x] GREEN：断言每个effect最多一次；新start接纳前无role孵化/动作，接纳后至100连续安全ticks前无miner/hauler；首批原resolution到来同tick撤权、下tick关闭确认。用原生坐标/四向跨界fixture选项覆盖真实形态，记录service phase与引擎入口事件，在hook外断言。
- [x] 批末验证同一tick只调用一次正常service生命周期；没有把t-1scope当t，也没有在Ops中调用spawn、移动、物流或ledger入账函数。

## Task 5：重置、故障关停与可读结果

**Files:** 新建Evidence/evidence测试，扩展Service和runtime/model测试；复用原summarizeEconomicTrial/原证据字段，不添加新确认算法。

**Interfaces:** summarizeNativeEconomicOps返回id、stage、version、旧准备交接标识、新economic identity/期限、实际scout/安全/route证据、spawn/infra/unknown/returned/net、控制关闭和tailStatus/缺口。status不写Memory、不推进Model；没有新会话时新成本/入库为null，不复用旧50。

- [x] RED：`native_ops_reset_at_each_intent_boundary`覆盖归档前后、release提交前后、start准备/激活前后；restoreMemory必须JSON往返、重绑creep.memory并重建服务。`native_ops_intent_or_archive_failure_blocks_start`、`native_ops_record_failure_cannot_block_owned_close`、`native_ops_unknown_ledger_not_replayed`在引擎hook外验证次数及关闭。
- [x] 运行`& $node --test src/tests/native-economic-ops-runtime.cjs src/tests/native-economic-ops-evidence.cjs`确认RED。
- [x] 实现异常隔离和所有权受限关停：notAfter禁止新接纳/动作，但过期后恢复首tick仍须先撤权；精确本轮已接纳身份才请求原guard停止，禁止操作另一会话。原guard的首批/unknown/危险效果仍为主权威；运维不可因记录失败再开。Memory彻底不可写时如实标无法确认，不靠空catch宣称关闭。
- [x] GREEN：`native_ops_no_network_full_first_delivery_path`在禁止网络环境，仅tick驱动到真实次tick交付/关闭，断言unique scout/miner/hauler、本轮成本、旧previous不变、无第二趟；`native_ops_wall_tick_limit_and_server_gap`覆盖1000tick/墙钟stopAt/notAfter/断档；危险、失视野、核心/receiver/预算异常及metrics关闭/CPU低/保护开关变化分别不产生新动作。summary出错不影响停止；tail仍unverified且无新产能证据时null。
- [x] 批末验证有界存储、未知schema原值、反复只读status无副作用；测试不删未知grant或伪造入库。无外部协作的fixture路径只算本地证据，不算线上断网或经济验收。

## Task 6：完整验证、默认关闭候选与交付

**Files:** 修改package.json纳入四个测试文件；更新相应src/AGENTS、services/AGENTS、tests/AGENTS及进度；新增`docs/superpowers/evidence/2026-10-23-native-economic-trial-operations-local-validation.md`和独立候选manifest（实际完成日期可在文件内注明）。

**Interfaces:** 新manifest分开记录允许修改的生产路径before/after哈希与所有旧运行证据冻结哈希。旧baseline/validation-manifest、原attempt和只读run不改写；旧verifier历史上保护的生产源码在本次获批修改后不能谎称全460份仍字节相同。旧资料/锁/日志保持原字节，新代码变更明确列白名单，不通过改旧hash“修绿”。

- [x] 先审阅累计diff并确保没有无关网络工具、旧入口或生产Memory改动；将新测试加入原npm test脚本，保留全部旧套件。
- [x] 在bundled Node下顺序运行`src/tests/smoke.cjs`、`src/tests/room-governor.cjs`及更新后的全部node:test文件；必须检查各进程exit code，不以最后一条成功覆盖前面失败。只要实现未变且检查通过，不无意义重复全套。
- [x] 仅构建：用`node:child_process.execFileSync(process.execPath,['node_modules/rollup/dist/bin/rollup','-c'],{stdio:'inherit',env:{...process.env,DEST:''}})`启动子进程，保证Rollup不读取凭据/上传；不得运行npm push。产物可变化，但不是线上版本变化。
- [x] 新功能接口、默认关闭、短载荷、service/P0顺序在源码及构建产物核对；新manifest记录完整测试数/RED日志/构建exit、main/map hash、差异与保留项。按用户所选方式做最终只读review；未获子代理授权则由主代理维护者自检，不自动调用代理。
- [x] 交付中文验证报告和默认关闭发布候选：提交/推送/部署、线上只读核对以及归档取代旧准备/生产启用均待单独授权；报告明确无真实经营收入、无新线上验收和tail缺口。不创建已批准的实际生产请求或未来时间窗。

## 验证命令约定与执行交接

`$node='C:/Users/mts-2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'`。所有命令在固定工作树运行，先确认当前分支/HEAD/已有改动；每个批次保留退出码和精确RED/GREEN证据。本计划不要求任何Git暂存或提交。

自检与执行已覆盖设计各节：请求/默认关闭与指纹→1，原生事实→2，旧准备归档/版本/唯一额度→2/3，真实生命周期→4，重置/unknown/关停/报告→5，完整验证与候选→6。五项Review Focus均有对应测试；公开接口名、scope和字段在各批一致。原8项复用回归是设计时历史证据，本次新增60项及最终全套结果另行留存。

执行方式已由用户明确选择并完成：主代理逐批实现，一次独立只读review；三项Important由主代理逐项复现、修复并完成最终回归。没有再次派代理。仍不提交、推送、部署或启用任何游戏功能。


完成记录：六批已执行；新增60项，完整631/631、smoke/Governor/dry build通过。一次只读独立review的3项Important经主代理RED→GREEN修复；见[本地交付报告](../evidence/2026-10-23-native-economic-trial-operations-local-validation.md)。未联网、提交、推送或部署。
