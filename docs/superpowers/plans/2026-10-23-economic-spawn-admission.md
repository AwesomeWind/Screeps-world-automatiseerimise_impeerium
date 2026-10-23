# 经济试点孵化仲裁后接纳 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. 用户已认可本计划，选择主代理逐批实现＋一次只读独立review；不自动追加review或委派实现。

**Goal:** 使未获Spawn席位的经济试点候选不提前绑定5 tick正式请求，在母房补员竞争后仍能按原全轮期限安全等待并单次接纳。

**Architecture:** RemoteMining发布当tick无副作用候选，Bureau保持原排序，Spawn在实际分配席位/能量后通过经济守卫提交绑定和grant。Model区分binding/admitted，原intake、原生调用、账本和回执继续复用；不新建调度器、不镜像Spawn资源状态。

**Tech Stack:** 现有JavaScript ES modules、Screeps Game/Memory、node:test/CJS fixture及Rollup；不加依赖。

**Spec:** [已认可设计](../specs/2026-10-23-economic-spawn-admission-design.md)；根因和三组对照见[诊断证据](../evidence/2026-10-23-miner-spawn-admission-diagnosis.md)。已获本地实施、完整测试、仅构建与一次只读review授权；生产权限未变。

## Global Constraints

- 工作树C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium，codex/single-remote-mining；计划基线HEAD ff83340dd91b6c03cbdb9e09d8d90d16df124bea。保留既有混合目标进度、历史草稿、旧锁、日志、冻结manifest和试点证据。
- 本地实施需计划另获认可；实施期间不联网、不读取凭据/共享代理配置、不写线上Memory，不暂存、提交、推送、部署或启用功能。各批以本地ledger留证，代替技能模板中的commit步骤。
- 侦察、采运、Goal/Plan、市场保持关闭；Governor shadow=true，scheduler.enforce=false。构建DEST必须为空，不运行npm run push/watch/local。
- 仅改变托管economic trial尚未绑定role的接纳路径；母房普通请求、纯recon、非托管remote及旧已绑定请求保留原语义。
- 母房补员优先级和同级顺序不变：普通hauler45与remoteMiner45竞争时，母房仍先获位；核心miner120/紧急hauler90保护不变。
- 正式deadline=min(admissionTick+5, session.expiresAtTick-1)，一经绑定不得刷新；原已知失败一次重试、总原生调用≤2，未知写入/引擎结果不重放、不换id。
- 候选不占id/sequence/grant/费用/原生调用额度，仅当tick有效；等待计入原1000ticks/90分钟及native较早stopAtMs，原leg≤300、100独立安全ticks及角色1/1/1不变。
- 本轮孵化1650、基建6000与原滚动孵化2000/基建6000预算取交集，接收terminal真实free≥20000；不改变既有pickup/次tick交付归因、费用/unknown隔离或tailStatus=unverified。
- 上轮econ-w48-20261023-01/seq3保持terminal与原managed锁，不做迁移、解绑、重开或生产profile更新。本地完成也不等于已发布或首次真实入库。

## Review Focus

1. EventBus捕获订阅者异常后仍进入run：Task 1/3/4验证pendingTask入列后admitted提交失败，同tick原生调用仍为0。
2. 全部analyze结束时Game.spawning可能仍空，但席位已在dispatch中预留：Task 3验证单/双Spawn、同级先后和energyBalance，不复制Bureau预测分配器。
3. 候选被误当成旧remote免grant入口或跨tick事件：Task 2/3/5验证严格身份/schema/当前tick、普通缺grant请求仍拒绝，候选不进入持久重放队列。
4. 重试换Spawn或JSON重置造成首次接纳时间被重写：Task 1/4验证admissionTick/admissionSpawnName/id/deadline不变，执行context仍可记录实际尝试的Spawn。
5. 本地默认双Spawn/满核心掩盖真实竞争：Task 3/5复用真实TTL补员与完整服务链，自然累计安全ticks；禁止手填safeStreak或直接调用适配器制造端到端成功。

---

## 文件与接口地图

修改产品文件限RemoteEconomicTrialModel.js、RemoteEconomicTrialService.js、RemoteMiningService.js、SpawnBureauService.js、SpawnService.js；不改main.js/EventBus.js/调度优先级/生产profile或经营指纹。

新建src/tests/economic-spawn-admission.cjs及helpers/economic-spawn-admission-fixture.cjs；必要时在旧economic-trial-model/runtime和native-economic-ops-runtime追加相邻回归，不复制整套Game模拟。package.json仅加入新测试入口；services/tests AGENTS随最终行为更新。

### 候选与适配器（Task 2定义，Task 3消费）

`EconomicTrialSpawnCandidate`只有schemaVersion=1、identity、role、quotaKey、offeredAtTick、baseRoom、targetRoom、sourceId、maxEnergy九个字段。identity严格为trialId/sequence/remoteId/epoch/codeVersion；role只取scout/remoteMiner/remoteHauler。目标、quota和maxEnergy必须等于当前scope/policy规范值，不能只相信owner字符串。候选不含requestId、grantId、deadline或任意Memory路径。

RemoteEconomicTrialService.js导出：

- `buildEconomicTrialSpawnCandidate(scope, role, clock?): Candidate|null`：只读创建提案，slot已有requestId即null，role/scope/安全门槛未满足即null。
- `inspectEconomicTrialSpawnCandidate(candidate, data, clock?): {allowed, reason}`：只读，验证完整候选、Bureau构造body/room/memory和真实当前会话；未获席位前不调用spawn_bound或reserveSpawnGrant。
- `beginEconomicTrialSpawnAdmission(candidate, context, clock?): {allowed, reason, data?, context?}`：只在Spawn已拿到本tick资源后调用。输入context含当前原生前上下文name/spawnName/body/baseRoom及候选完整身份，另含data（已校验的原Bureau事件data）；生成canonical id与固定deadline，Model进入binding，创建原grant并完成原intake。返回data保留已校验的请求字段，移除候选字段并加入原requestId/grantId/memoryTags；返回context为不含嵌套data的现有economicTrialContext形态。body、role、quota、房间和选定Spawn必须相互一致。
- `completeEconomicTrialSpawnAdmission(context, clock?): Permit`：Spawn将同一pendingTask入列、按原规则标grant.executing后调用；再次验证本轮身份、完整intake/grant和原期限，提交admitted。它不分配Spawn、不调用原生、不记费用。
- `abortEconomicTrialSpawnAdmission(context, reason, clock?): void`：只对精确所属会话请求撤权，保留绑定/claim/未知证据；不能清slot重来或改其他会话。

原getEconomicTrialPermit查询增加可选`spawnCheckpoint='intake'|'run'`：新binding只允许接纳适配器完成intake；run及缺少明确intake检查点的普通spawn查询不得把binding当执行许可。旧slot无新标记时沿用旧规则。recordEconomicTrialSpawn根据intake/call_started传对应检查点，call_started独立要求新标记admitted；不通过全面禁止binding把接纳本身堵死。

候选的event.id只是当tick运输标识。接纳成功后，pendingTask持有规范正式event视图，data为返回的正式data，expireAt为已固定slot.deadline；不得把候选的expireAt=当前tick带入正式重试/backup/receipt。原候选事件仍由EventBus按原handled规则消费，不将无绑定候选续存；正式pendingRequestKeys、spawn backup和receipt一律使用canonical requestId。

### Model持久状态（Task 1定义，Task 2/3消费）

新slot可选成组字段：admissionStage=binding/admitted、admissionTick、admissionSpawnName。存在任一则必须完整且合法；requestId/deadline必需且固定，deadline=min(admissionTick+5, session.expiresAtTick-1)。未知stage不降级为legacy；旧记录完全没有新字段时不补历史。

新增纯事件`spawn_admission_begin`与`spawn_admission_complete`，均携带role、完整context和原固定requestId/deadline。begin仅接受未绑定slot，保存binding及首次接纳数据；complete仅接受同tick、同id、同身份及匹配首次Spawn的完整intake，变为admitted。begin不能替换旧绑定，重试不能重走begin/complete或改首次字段。跨tick遗留binding或不完整提交证据先关闭，不重放。

### 测试工具（Task 1创建，后续复用）

`createAdmissionModelFixture()`提供纯Model的state/facts/clock，沿用既有economic-trial-model.cjs单位测试模式，仅验证状态协议。

`createAdmissionFixture({spawnCount=1,containerBuilt=false}={})`返回`{s,scene,toSafe99,retireHomeHaulers,advance}`；s/scene来自原createNativeEconomicOpsFixture，toSafe99先等待新身份接纳，再自然推进到99；retireHomeHaulers将CoreHaulerB/C TTL置为退役输入以触发原Bureau普通hauler45，advance沿用s.advance。真实链测试不得用纯Model facts或删未知grant取得成功。

## 验证命令约定

执行阶段使用bundled Node与已有deny-network preload；每个命令重定向到本计划独立目录.superpowers/sdd/2026-10-23-economic-spawn-admission/，只输出摘要和退出码。保留诊断原三份JSON及旧冻结工具，不重跑wx脚本覆盖旧证据。

```powershell
$admissionNode = 'C:/Users/mts-2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$admissionDeny = './.superpowers/sdd/2026-10-22-readonly-handshake-observer/deny-network-preload.mjs'
& $admissionNode --import $admissionDeny --test --test-name-pattern='^admission_p1_' src/tests/economic-spawn-admission.cjs
```

后续各批替换prefix；RED应由缺失目标行为/契约触发，而不是路径、语法或fixture没进入新会话。步骤中代码断言是必须加入对应test的关键断言，不是生产实现。

## Task 1：Model接纳状态与原期限契约

**Files:** Modify src/services/RemoteEconomicTrialModel.js；Create src/tests/economic-spawn-admission.cjs、src/tests/helpers/economic-spawn-admission-fixture.cjs。

**Interfaces:** 消费原advanceEconomicTrial/validEconomicTrialState/economicTrialPermission；产出上述两个事件、可选字段及spawnCheckpoint行为，尚不接入候选发布。

- [x] 写admission_p1_begin_complete_and_legacy、admission_p1_binding_denies_run、admission_p1_bound_identity_deadline_are_immutable、admission_p1_incomplete_or_unknown_stage_rejected。单位测试断言：begin后stage=binding、calls=0，run许可false；完整intake再complete才admitted；重复begin和跨tickcomplete不能重绑；旧无标记记录仍合法。
- [x] 运行prefix admission_p1_看RED；缺失stage/事件/执行拒绝应失败。不得用修改expected为现状消除失败。
- [x] 仅实现纯状态合约：binding可被专用intake完成，但不得被run消费；跨tickbinding/未知标记拒绝；旧spawn_bound及旧记录不迁移，首次字段保持。纯测试可以使用受控facts，不能作为真实链验收。
- [x] prefix全部GREEN，并跑economic-trial-model.cjs；记录原deadline和已知重试限制未变，在ledger写本批结果，不暂存或提交。

## Task 2：候选只读校验与两段提交适配器

**Files:** Modify src/services/RemoteEconomicTrialService.js；Test src/tests/economic-spawn-admission.cjs。

**Interfaces:** 消费Task 1事件/检查点及原reserveSpawnGrant/recordEconomicTrialSpawn；产出接口地图中的五个函数。此批不改变RemoteMining/Bureau/Spawn的生产流向。

- [x] 写admission_p2_candidate_is_readonly、admission_p2_exact_identity_and_fresh_tick、admission_p2_begin_budget_intake_then_complete、admission_p2_partial_begin_cannot_be_reoffered。关键断言：build/inspect前后JSON.stringify(Memory)与operation.requestSequence不变；错误字段/旧tick/body/版本拒绝；begin只给同一role一次id/grant和固定deadline，complete不计实际费用。
- [x] 运行prefix admission_p2_看RED。适配器单位测试仅证明局部合同，不能用其直接调用代替Task 3真实接纳测试。
- [x] 实现五函数并让intake/call_started区分检查点；每次写入前用当前Facts/原账本复核。已知预算拒绝为0实际费用，绑定后一旦失败明确关闭，不解绑；未知写入保留claim。abort不得因摘要或详细记录失败跳过撤权。
- [x] prefix全部GREEN，加跑Task 1及原not_started reset/partial receipt/retry期限定向回归，确认未激活新流向时原流程继续通过；ledger留证，不提交。

## Task 3：接入真实Spawn仲裁，修复原单Spawn竞争

**Files:** Modify src/services/RemoteMiningService.js、SpawnBureauService.js、SpawnService.js；Test src/tests/economic-spawn-admission.cjs。

**Interfaces:** 消费Task 2候选和适配器；产出只有获得真实本tick席位的候选才进入原pendingTask/run链的完整行为。

- [x] 写admission_p3_single_spawn_home_hauler_tie_waits、admission_p3_wait_30_ticks_then_admit_once、admission_p3_no_competitor、admission_p3_two_spawns_and_energy、admission_p3_canonical_event_deadline_and_receipts。后者断言正式task.event.expireAt等于slot.deadline、backup/receipt/pending去重使用canonical id而非候选event.id；已知ERR_BUSY后仍能在原期限内重试。单Spawn竞争关键断言：

```js
assert.equal(scene.current.slots.remoteMiner.requestId, undefined);
assert.equal(scene.current.slots.remoteMiner.deadline, undefined);
assert.equal(scene.current.slots.remoteMiner.calls, 0);
assert.equal(scene.current.outcome, undefined);
```

在真实安全99后触发TTL补员、推进至100与后续等待；断言母房hauler先执行，预算无miner grant，候选事件不跨tick累积。自然释放后只绑定/执行一次；deadline为实际admissionTick+5，原session startedAt/expires及安全起点完全不变。

- [x] 运行prefix admission_p3_看RED，原错误应是尚未获席位却出现slot.requestId或spawn_request_expired；保存与诊断三组对照同类阶段快照。
- [x] RemoteMining对未绑定托管role只发候选，已有slot走原请求；Bureau白名单传递且仍拒绝普通缺grant。Spawn先校验候选，再用本身idleSpawns/energyBalance分配真实资源，begin→pendingTask/grant标记→complete；成功转成无候选字段且expireAt=slot.deadline的正式task/event，已有原生失败重试不能再次走候选路径，不使用候选event.id结算。
- [x] prefix全部GREEN并重跑原单Spawn首批及economic/native runtime；同级45先后、母房miner120/hauler90不变，双Spawn不重复占位/超支；不改EventBus或复制Bureau资源预测器。ledger留证，不提交。

## Task 4：重试、重置与接纳故障边界

**Files:** Modify RemoteEconomicTrialModel.js、RemoteEconomicTrialService.js、SpawnService.js（限接纳局部）；Test src/tests/economic-spawn-admission.cjs及相邻旧runtime回归。

**Interfaces:** 消费Task 3完整流，固化接纳提交、原not_started/not_called及原生未知调用的兼容；不新增第二套补偿账本。

- [x] 写admission_p4_eventbus_exception_still_denies_run、admission_p4_reset_each_checkpoint、admission_p4_known_retry_keeps_first_admission、admission_p4_unknown_never_replays。测试分别在binding、grant写入、intake、pendingTask入列后/admitted之前、call_started、ledger applying注入失败；hook只采样/抛错，assert在hook外。
- [x] 跑prefix admission_p4_看RED；必须实际经过EventBus.catch后继续Spawn.run的场景，断言原生calls=0。JSON往返并重建服务/重绑creep.memory后，半提交不能生成新id或清claim；单纯恢复旧global引用不算reset验证。
- [x] 修正故障分支：binding同tick拒绝run，跨tick中断先关闭；完整admitted/not_started仅凭原完整证明恢复同id/原deadline。已知失败最多两次，合法换Spawn的context可变化但首次admissionTick/admissionSpawnName不变。资源释放只有一个本tickowner：task入列前由intake释放，入列后由task或明确移除它的路径释放，不能双退energyBalance；未知budget/引擎claim不退款。
- [x] prefix全部GREEN并跑Task 1～3及旧retry/reset/partial-ledger检查，断言危险关停和记录失败撤权继续有效；不添加Memory可配置故障钩子，优先使用测试本地对象/函数注入。ledger留证，不提交。

## Task 5：安全门槛、预算隔离与完整闭环兼容

**Files:** Test src/tests/economic-spawn-admission.cjs、economic-trial-runtime.cjs、native-economic-ops-runtime.cjs；必要修正只限前四批接纳范围。

**Interfaces:** 消费完整接纳链；产出对已认可spec全部回归场景的交付证据，不扩大线上许可。

- [x] 写admission_p5_gates_before_dispatch_and_call、admission_p5_budget_and_receipt_caps、admission_p5_stale_forged_duplicate_candidates、admission_p5_default_and_legacy_compatibility、admission_p5_first_delivery_after_home_competition。覆盖99/100、缺容器hauler、母房危机/危险/失视野、native较早墙钟截止、1000tick、滚动及1650预算、原owner/unknown隔离。
- [x] 各新增行为先跑RED；故障撤权必须分别发生在analyze→dispatch与dispatch→原生之间。原有已绑定slot、上轮terminal/native归档快照逐字段不变；当前线上样本只作离线兼容输入，不连接生产。
- [x] 用真实链补齐缺口并跑GREEN：已有容器场景在母房竞争消失后走通唯一miner/hauler、pickup→指定terminal正数次tick确认并同步停止，记录实际body费用/净额可为负。缺容器场景独立断言必要工地/施工门槛，未模拟完整新容器至入库时如实保留场景缺口。
- [x] 原母房普通孵化、纯recon、非托管remote、默认关闭及旧未知call/applying测试继续通过；newProductionConfirmed/tailStatus不凭本地结果升级。ledger留证，不提交。

## Task 6：完整验证、维护者检查与本地交付

**Files:** Modify package.json、src/services/AGENTS.md、src/tests/AGENTS.md；Create docs/superpowers/evidence/2026-10-23-economic-spawn-admission-local-validation.md；独立证据写本计划workspace。

**Interfaces:** 消费Task 1～5全套GREEN；产出默认关闭、未发布的固定候选及可审阅报告。此批不授权提交、推送、发布或试点。

- [x] 将新suite加入npm test显式node --test列表，维护者核对没有长期双路径/重复调度器、无请求换id续期、无原预算/服务顺序/profile变化；查明每条新字段和异常分支是否必要，更新邻近说明。
- [x] 在deny-network preload下跑新增suite及完整package.test三部分，分别保存日志/退出码/实际test数量；基线631只作旧基线，不把新增数量预先写成通过。smoke和Governor必须通过，失败回到对应批次，不靠重复测试掩盖。
- [x] 若用户选择一次独立只读review，在全套GREEN后派一次，重点核对Review Focus及跨tick/call边界；不让reviewer改代码/联网。主代理逐项确认发现，Important/Critical先复现RED再修正并重跑必要全套；不自动二次派review。若选择仅主代理自检，明确报告该证据较弱。
- [x] review修正后执行唯一最终仅构建：PowerShell子进程清空DEST，使用bundled Node加载deny-network preload运行node_modules/rollup/dist/bin/rollup -c。确认日志明确只编译、不上传；保留最终源码/main/map SHA-256、实际构建SERVICE_VERSION、默认关闭配置与没有生产请求的离线候选。构建后再改源则必须重新验证对应范围，不能混用旧产物。
- [x] git diff --check与git diff --cached --check；确认index仍空，历史草稿/冻结证据未被纳入或清理。中文报告分别列RED→GREEN、全套/构建、review发现、兼容与缺口；没有线上入库则仍未完成总经济目标。停止在本地交付，不运行旧外部恢复/启动脚本。

## 覆盖与自检

- spec未绑定候选/当tick失效：Task 2/3；真实资源后绑定与母房排序：Task 3；持久标记/中断/原期限：Task 1/4；预算、门槛、旧记录及真实链：Task 2/5；完整测试与默认关闭交付：Task 6。
- 两段接纳接口名、五字段身份、spawnCheckpoint和Model事件在所有批次保持一致；binding允许完成intake但绝不允许run，避免检查自相矛盾。
- 没有替代原Spawn仲裁、放宽5tick或重试、把等待排除在会话期限外，也没有新增外部生产接口。
- 本地实施已授权；各批结果以本计划独立台账和RED/GREEN日志为准，最终交付更新checkbox。测试/构建不代替生产发布或经营验收。
