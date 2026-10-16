# 游戏内有限侦察试点守卫 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. 用户未选择执行方式前不实现；未明确授权前不调用子代理。

**Goal:** 在游戏内限制一轮侦察的总期限及唯一scout，在动作前撤权、结束后冻结结果，让外部连接中断时仍可安全停止。

**Architecture:** 新增纯模型、事实适配和P0守卫服务；RemoteMining负责原有事实和需求，SpawnService负责唯一的实际孵化，Strategy/ActionParser保留任务执行职责。守卫只收窄现有许可，EmpireMetrics只导出摘要。

**Tech Stack:** 现有JavaScript ES modules、Screeps Game/Memory、node:test CJS fixture、Rollup；不新增依赖。

**Spec:** `docs/superpowers/specs/2026-10-16-remote-recon-trial-guard-design.md`，用户已认可。执行前同时阅读spec及本计划。

## Global Constraints

- 工作区：`C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium`，分支`codex/single-remote-mining`；计划基线HEAD=`0fe8968`，实际线上逻辑仍`9e415d1`。保留现有未提交历史文档，不清理其他checkout。
- 本轮只允许本地实现、测试和构建；不自动暂存、提交、推送、部署、调用线上API、写线上Memory或启动试点。每批的“检查点”只保存本地diff和验证日志。
- 默认`policy.remoteMining.reconTrial={enabled:false,request:null}`；无旧托管scope时不创建`reconTrials`状态，不改变非托管流程。
- 第一版仅一个相邻远程房间，`maxOperations=1`；产品代码不写死W49N41/W48N41、source id或工位坐标。
- `sourceId=null`、`allowContainerBuild=false`、`reserveController=false`；scout上限1，其余远程角色上限0。唯一scout body为`[MOVE]`，成本50。
- 保持`Goal/Plan=false`、`Governor shadow=true`、`scheduler.enforce=false`、`market=false`；不写入目标定义，不强行恢复别人改动的保护开关。
- `expiresAtTick=activateAtTick+300`，有效区间`[activateAtTick,expiresAtTick)`；`expiresAtMs=issuedAtMs+1200000`。先到即停，不因孵化、重试或重载续期。
- 孵化预算2000/1000ticks、基建预算6000/1000ticks；原leg期限最多300ticks、冷却2ticks、最多一次重规划，保持原startedAt/expiresAt。
- 会话安全streak必须本轮连续100ticks；最多20条事件、一个current和一个previous；终局结果不自动授权下一轮或采运。
- executing/结果不明的grant保留；只有本轮有完整阶段证据、明确not_called的pendingTask可退回预留。费用及资源确认算法、MetricObservationWindow的10000tick语义不改。
- 每批先新增回归并确认行为RED，再实现GREEN；完整功能结束前不发布中间批次。

## Review Focus

1. 同tick请求已经intake、实际调用前撤权，应退款且不调用引擎，也不误记unknown。落在批次3的`trial_spawn_intake_revoked_before_run`。
2. spawnCreep可能已经OK但结果尚未持久化，重载后只能恢复证据或停止，不能再孵化。落在批次3的`trial_spawn_interrupted_call_is_not_replayed`。
3. activateAtTick错过、sequence重放、未知schema或状态丢失，应保留证据并拒绝重建新会话。落在批次1的`trial_request_replay_and_corrupt_state`。
4. 服务器暂停、时钟回退、P2被跳过，不能借此续期或继续执行旧outbound task。落在批次2的`trial_expiry_survives_runtime_and_scheduler_changes`。
5. 原生坐标getter、另一个scope的同名请求字段、遥测关闭或低频采样，不能破坏身份隔离、结果留存和关闭判定。落在批次4的`trial_evidence_getters_and_scope_isolation`及批次5的`trial_metrics_disabled_does_not_disable_guard`。

## 文件及接口约定

新增文件均放现有services/tests目录：

| 文件 | 职责 |
| --- | --- |
| `src/services/RemoteReconTrialModel.js` | 纯验证、转换、许可和有界摘要；不引用Game/Memory |
| `src/services/RemoteReconTrialFacts.js` | 从Game、人口、当前scope及账本收集只读事实；可见路线计算也在此适配 |
| `src/services/RemoteReconTrialService.js` | P0生命周期、Memory持久化、关闭副作用和给既有调用方的窄接口 |
| `src/tests/recon-trial-model.cjs` | 协议、状态、时间与终局的纯模型回归 |
| `src/tests/recon-trial-runtime.cjs` | RemoteMining→Bureau→Spawn→Strategy→ActionParser的执行边界回归 |
| `src/tests/helpers/recon-trial-fixture.cjs` | 复用remote fixture，增加可控时钟、阶段hook和实际spawning/出生/下一tick位移 |

修改接入点：`src/config/EmpirePolicy.js`、`src/main.js`、`src/core/ServiceScheduler.js`、`src/services/RemoteMiningService.js`、`src/services/SpawnService.js`、`src/strategies/RemoteMiningStrategyService.js`、`src/services/EmpireMetricsService.js`、`package.json`及对应模块AGENTS说明。`RemoteMiningLedger.js`沿用原API及request字段透传，不另改费用公式或确认口径。

共享数据命名在此固定，后续批次不得各自另起同义字段：

- `Clock={tick,nowMs,codeVersion}`；测试注入nowMs，运行时每个决策边界取Date.now一次，不能在纯模型内部读时钟。
- `Identity={trialId,sequence,codeVersion,remoteId,epoch}`；creep/demand.memory用`reconTrialId`和`reconTrialSequence`承载trialId/sequence，其余remoteId/epoch字段沿用。
- `Store={schemaVersion:1,lastSequence,current,previous}`；未启用且无历史时为undefined。current保存identity、配置指纹、不可变期限、status、spawn、evidence、events和managed锁。
- `spawn={requestId,deadline,grantId,name,spawnName,callState,callTick,acceptedAt,result}`；callState只能为`not_started/call_started/result_known/not_called`，无claim也必须能区分。
- `Outcome={verdict:'completed'|'aborted',stopReason,decidedAtTick,evidence}`在进入stopping时冻结；status在下一tick确认关闭后才成为completed/aborted。迟到费用放独立settlement，不能修改Outcome。
- `Permit={managed,evaluatedAt,allowSpawn,allowOutbound,allowReturn,reason}`。非托管返回managed=false，既有门槛直接沿用；托管范围内缺许可/过期许可为拒绝。所有调用方保留既有安全判断并与守卫许可相交。
- 只读事实`Facts`包含：操作/配置身份、配置指纹、各保护开关、raw房间开关、其他enabled房间、homeHealthy/core/Controller、实际receiver及free、budget状态、population、相关请求/grant/receipt、绑定actor的spawning/位置/MOVE/leg/lastClear、目标视野/安全及可见路线结果。无视野或无证据使用null/unknown，不能用默认true补齐。

所有相对路径以工作区为根；下列命令在该工作区执行。Node/npm使用已有bundled runtime，不安装新工具。

## 批次1：会话协议、纯模型和终局锁

**Files:** Create `src/services/RemoteReconTrialModel.js`、`src/tests/recon-trial-model.cjs`；Modify `src/config/EmpirePolicy.js`、`package.json`。

**Interfaces:**
- Produces `advanceReconTrial(store, event, facts, clock) -> {state,permit,effects}`；输入不变，state保留undefined默认关闭语义；损坏store原样保留且permit拒绝。effects为`close_scope/cancel_unstarted/clear_outbound`的描述数组，只由runtime执行。
- event.kind固定为`begin_tick/scope_observed/spawn_bound/spawn_intake/spawn_call_started/spawn_not_called/spawn_result/end_tick`；实际payload分别取请求、scope事实或spawn记录，不能让外部请求传入evidence字段充当事实。
- Produces `reconTrialPermission(store, query, clock) -> Permit`及`summarizeReconTrial(store, clock) -> object|null`。query包含remoteId/epoch、action=`spawn/outbound/return`及可选trial/request身份。

- [x] **1.1 写纯模型RED断言并接入默认test入口。** 用下列具名子测试覆盖协议；每例只准备所需Facts并用assert检查，不先写模型实现。

| 测试名 | 明确断言 |
| --- | --- |
| `trial_default_off_is_absent` | disabled/null请求返回state===undefined、effects为空、managed=false |
| `trial_start_only_at_activation_tick` | activateAtTick=101；tick100拒绝出发但等待；101接纳；首次在102看到请求则rejected，不能补启动 |
| `trial_absolute_deadlines_do_not_restart` | 激活101，deadline401；出生/新global/重试后仍401；tick400可受既有门槛允许，401拒绝；nowMs达到issuedAtMs+1200000同样停止 |
| `trial_request_replay_and_corrupt_state` | 同sequence重放不重启；未知schema/数组/非法阶段原值不变且拒绝；状态缺失且activateAtTick已过不能新建活动会话 |
| `trial_config_clock_and_identity_changes_stop` | codeVersion/epoch/配置指纹改变、nowMs非有限或倒退均进入stopping，原期限不变 |
| `trial_terminal_result_and_events_are_bounded` | current/previous各最多一个、events<=20；同tick重复事件幂等；Outcome在终局重放后不变 |
| `trial_release_requires_settled_closed_scope` | release指向当前targetTrialId、sequence更大且目标/模块关闭，无实体/accepted/grant才解除managed；有未结项拒绝；release不产生启用effect |

上述截止与损坏状态场景的结果分别记为at400、at401、replayed、corrupt；关键断言固定为：

```js
assert.equal(at400.permit.allowOutbound, true);
assert.equal(at401.permit.allowOutbound, false);
assert.equal(at401.state.current.status, 'stopping');
assert.deepEqual(replayed.state.current.outcome, frozenOutcome);
assert.deepEqual(corrupt.state, originalCorruptStore);
assert.equal(corrupt.permit.allowSpawn, false);
```

- [x] **1.2 运行 `node --test src/tests/recon-trial-model.cjs`。** 先确认因模型缺失而RED；模型存在后，其余边界的RED必须是行为断言失败，记录日志。
- [x] **1.3 实现上述三个纯接口和默认policy。** 接纳时冻结期限/身份/配置；顺序以撤权原因优先于完成为准，stopping禁止新spawn/outbound。无旧托管状态时不得由ensureDefaults创建Store或抹掉非法Store。
- [x] **1.4 运行同一模型命令，再运行 `npm test`。** 新模型GREEN，既有默认关闭场景无回归；保存本地检查点，不提交。

## 批次2：P0守卫及动作前撤权

**Files:** Create `src/services/RemoteReconTrialFacts.js`、`src/services/RemoteReconTrialService.js`、`src/tests/helpers/recon-trial-fixture.cjs`、`src/tests/recon-trial-runtime.cjs`；Modify main、ServiceScheduler、RemoteMiningService、RemoteMiningStrategyService、package.json和生命周期相关smoke断言。

**Interfaces:**
- Consumes 批次1的三个纯接口、Clock/Store/Facts/Permit。
- Produces `collectReconTrialFacts(scope, clock) -> Facts`；scope可为null，只收可证明事实，无当前scope时不提供出发许可。复用currentCreepPopulation与已有RoomPhase，候选路线完整采集留到批次4。
- Produces default class `RemoteReconTrialService extends BaseService`，构造器`constructor(name,{now=Date.now}={})`，实现init/analyze/run/cleanup。全局出口`global.RemoteReconTrial={evaluatedAt,permit,summary}`，仅当tick派生值；服务通过Memory续接同一Store。
- Produces named runtime adapters `getReconTrialPermit(query, clock) -> Permit`、`observeReconTrialScope(scope, clock) -> Permit`、`bindReconTrialSpawnRequest(scope, request, clock) -> {requestId,deadline,memoryTags,grantTags}|null`。这些适配器共享同一Memory Store，不各自保留第二份账本。
- Test helper `createReconTrialFixture(options) -> {fixture,prepare,runTick,advance,resetRuntime,setNowMs,state}`。state为Store只读getter；prepare仅改测试Memory；runTick支持betweenDispatchAndRun、beforeActionParser及skipRemote hook，并遵守实际main生命周期。advance沿用已有fixture的tick/positions/visibility patch，并先应用上tick移动结果。fixture设置固定测试codeVersion，通过构造器注入now，不全局改写Date.now；resetRuntime保留同一Memory和原期限。

- [x] **2.1 先补runtime RED。** fixture复用createRemoteFixture，初始没有远程actor；不要复用默认已经存在ScoutA的场景来冒充新会话。

| 测试名 | 明确断言 |
| --- | --- |
| `trial_guard_precedes_remote_and_actions` | 实际服务序列GoalPlan<Guard<RemoteMining<Spawn；Guard的analyze/run先于相应需求/动作；main仅新增服务，不加入业务判断 |
| `trial_expiry_survives_runtime_and_scheduler_changes` | 同一Memory跨global reset和JSON round-trip期限不变；critical下Guard决策P0可运行，跳过RemoteMining时许可不新鲜即拒绝；恢复首tick墙钟过期就停止 |
| `trial_expiry_clears_existing_outbound_task` | 到期时scout已有合法MOVE_TO，ActionParser前任务被撤销，moveByPath调用为0；原leg起止未重写 |
| `trial_current_protection_gates_are_intersected` | 参数化hold、模块禁用、核心缺口、Controller应急、敌情、接收free19999、Goal开关变化；本scope停止，保护配置不被强制复原 |
| `trial_freshness_and_scope_are_not_optional` | 缺本tickscope/permit或身份不符拒绝；非托管scope沿用原有门槛；legacy allowRecon=false不能被守卫改成true |

到期已有MOVE_TO场景中记录原leg和moveSpy后，必须具有以下断言；scope陈旧场景还需断言getReconTrialPermit返回的allowSpawn/allowOutbound均为false：

```js
assert.equal(moveSpy.calls.length, 0);
assert.equal(scene.state.current.status, 'stopping');
assert.equal(scout.memory.remoteLeg.startedAt, originalStartedAt);
assert.equal(scout.memory.remoteLeg.expiresAt, originalExpiresAt);
assert.equal(stalePermit.allowSpawn, false);
assert.equal(stalePermit.allowOutbound, false);
```

- [x] **2.2 运行 `node --test src/tests/recon-trial-model.cjs src/tests/recon-trial-runtime.cjs` 并保存RED。** 不用“跳过全部新测试”制造GREEN。
- [x] **2.3 接入守卫服务及许可交集。** 显式加入P0；先在analyze关闭默认许可，再由RemoteMining完整scope确认。RemoteMining绑定一次requestId/deadline，给demand.memory和grant附trial标记；尚未成功孵化的排队请求到期时停止，不进入普通requestSequence重建分支。成功孵化后原请求deadline只限制请求重放，不能截断仍在总期限内的合法移动/观察。
- [x] **2.4 接入停止副作用和已有task检查。** run边界再次撤权；只清理本trial出房任务，返程仍通过原安全逻辑。取消函数按trial/request过滤，未标记或其他scope的数据不删除；非法Store只拒绝并保留。
- [x] **2.5 重跑本批测试与 `npm test`。** 此时只证明许可/撤权链，尚未证明唯一实际孵化；功能仍默认关闭、不发布中间版本。

## 批次3：唯一孵化额度和调用阶段证据

**Files:** Modify `src/services/RemoteReconTrialService.js`、Facts/Model、`src/services/SpawnService.js`、runtime fixture及runtime测试。沿用RemoteMiningLedger的计费、取消和reconcile接口。

**Interfaces:**
- Consumes 批次2绑定的requestId/deadline、memoryTags/grantTags及Permit。
- Produces runtime adapter `recordReconTrialSpawn(context, event, clock) -> {applied,allowed,reason}`。context固定包含Identity、requestId/grantId、name、spawnName、body；event.type为intake/call_started/not_called/result，result事件携带原生result。
- grant上的trialId/trialSequence及callState只用于本trial调用证明；当前spawn.requestId持久绑定原账本receipt。明确非OK重试使用同request和原deadline，不能加成功孵化额度。

- [x] **3.1 用真实SpawnService的intake/run及可控spawnCreep写RED。** fixture在返回OK后提供真实spawning/下一tick出生实体；每种中断分别注入，不能以“总是OK且立即出生”的stub代替。

| 测试名 | 明确断言 |
| --- | --- |
| `trial_spawn_intake_revoked_before_run` | event已intake、grant.executing=true，run前撤权；spawnCreep=0，energyBalance仅退一次，grant按not_called证明取消，unknown不增长 |
| `trial_spawn_interrupted_call_is_not_replayed` | 分别在call_started后/原生OK后/计费后中断；重载后恢复实际Spawn/receipt证据或冻结unknown；成功调用总数<=1，不重建第二request |
| `trial_spawn_duplicate_events_two_spawns` | 两Spawn与同request重复事件只实际孵化一名，body=[MOVE]、确认费用增量50，无双重退款或计费 |
| `trial_spawn_failure_keeps_original_request_deadline` | 明确非OK可重试同request，tick>原deadline停止；不会换requestId延长尝试 |
| `trial_successful_spawn_outlives_request_deadline` | 成功孵化后推进到原请求deadline之后，仍可在trial和原leg期限内移动/观察；不得因请求已过期补第二名或重置总期限 |
| `trial_death_does_not_create_replacement` | 首名scout消失后同tick运行RemoteMining，新增远程spawn demand为0；正常未托管替换回归仍通过 |
| `trial_old_execution_and_foreign_grants_are_preserved` | 旧版无阶段记录executing grant、其他trial/scope grant与receipt不删；call_started未知仍保留额度 |
| `trial_only_one_move_body_and_matching_identity` | 非1MOVE、wrong trial/sequence/epoch/request及过期permit在intake/run均拒绝 |

intake撤权场景在fixture的betweenDispatchAndRun hook中关闭守卫；actualCalls为包裹spawnCreep的spy，必须断言：

```js
assert.equal(actualCalls.length, 0);
assert.equal(spawnService.energyBalance.W1N1, initialEnergyBalance);
assert.equal(budget.grants[boundRequestId], undefined);
assert.equal(ledger.spawnCostUnknown || 0, 0);
assert.ok(interruptedCalls.filter(call => call.result === OK).length <= 1);
assert.equal(restored.state.current.spawn.requestId, originalRequestId);
```

- [x] **3.2 运行runtime测试并核对RED原因。** 无效fixture或异常吞掉不是原问题的RED。
- [x] **3.3 在SpawnService两个既有校验点加入守卫交集。** intake记录not_started；实际调用前先持久化call_started再调用引擎；结果回传后用原recordSpawnResult计费，并更新本trial证据。不得另起spawnCreep调用点。
- [x] **3.4 实现受限not_called退款与异常恢复。** 仅当前trial身份、pendingTask和not_started完整匹配时回退执行标记并调用取消；call_started不因无actor就释放。reconcile已有回执后补充trial结算，不重算历史账本金额。
- [x] **3.5 运行模型/runtime及完整 `npm test`。** 对照spawnCalls、实际人口、budget receipts和原deadline，保存本地检查点。

## 批次4：实际证据、安全streak、关闭和结果回查

**Files:** Modify Facts/Model/Service、`src/services/EmpireMetricsService.js`、runtime测试及fixture；必要的模块说明随本批更新。MetricObservationWindow不改。

**Interfaces:**
- Consumes 同一Facts：每tick实际actor位置/状态、当前可见房间、真实receiver、候选source、预算回执；以及已有validateEconomicRoutes(operationCopy,factsCopy,policy)。
- Produces `collectReconTrialFacts`完整实现；配置副本中的candidate source仅用于只读计算，原operation/raw config.sourceId保持null。
- Produces metrics出口`control.metrics.reconTrial={capturedAt,status,current,previous}`，来自summarizeReconTrial；不写goals/plans/goalPlanningState。关键终局Store独立于telemetry开关持久化。
- Outcome固定于首次停止；后续settlement仅保存confirmedCost、unknownUpperBound和updatedAtTick等有界字段。closureVerifiedAtTick必须晚于closeAppliedAtTick。

- [x] **4.1 先写观测与结束RED。** 以tick逐步推进Game位置和可见性；安全count检查使用真实连续tick，而非直接把计数改为100。

| 测试名 | 明确断言 |
| --- | --- |
| `trial_birth_and_movement_require_game_evidence` | accepted、spawning、task生成、move OK但不位移均不能确认实际移动；出生后下一tick位置变化才确认 |
| `trial_safety_is_current_session_and_continuous` | 历史operation.safeTicks=100不继承；本轮99不完成，第100个安全tick且路线通过才进入stopping；重复tick不重复累加、断档停止 |
| `trial_evidence_getters_and_scope_isolation` | RoomPosition为原型getter仍正确取坐标；旧epoch/其他actor位置不算本trial移动；候选source不可见时无坐标fallback通过 |
| `trial_visible_route_is_read_only` | 校验真实source房间/id、container格地形/邻接/结构、receiver和拟用body去返期限；原sourceId=null，无建设/采运/预定调用 |
| `trial_closure_requires_next_tick_confirmation` | 决定tick只stopping；下一tick关闭/许可均回读正确才成为completed/aborted；同请求手工重启开关不复活 |
| `trial_settlement_does_not_rewrite_outcome` | 迟到receipt补known费用不修改冻结verdict/stopReason/evidence；current/previous和events有界 |
| `trial_stop_and_release_are_scope_limited` | 另一个enabled房间/同名字段请求存在时保留其状态，记录module_shutdown_conflict；release需targetTrialId匹配且无实体/未结项 |

连续安全与关闭场景分别在99/100个本轮安全tick和关闭后的下一tick断言；getters/其他scope场景对原始对象做前后快照：

```js
assert.notEqual(at99.state.current.outcome?.verdict, 'completed');
assert.equal(at100.state.current.status, 'stopping');
assert.equal(afterClosure.state.current.status, 'completed');
assert.ok(afterClosure.state.current.closureVerifiedAtTick > afterClosure.state.current.closeAppliedAtTick);
assert.equal(rawConfig.sourceId, null);
assert.deepEqual(foreignGrant, originalForeignGrant);
assert.deepEqual(afterLateReceipt.state.current.outcome, frozenOutcome);
```

- [x] **4.2 运行本批RED，再实现只读事实收集。** 现有scope的home/foreign/danger事实优先复用；核心/真实容量为unknown不能放行。以显式x/y/roomName读取原生位置，不展开RoomPosition为普通对象。
- [x] **4.3 实现停止、冻结与结算。** 关闭目标enabled并hold；无其他enabled房间时关闭本模块；可证明未执行项按批次3退款，未知执行项保留。允许原安全返程，不杀死/移动核心单位。
- [x] **4.4 导出metrics并运行GREEN及 `npm test`。** 低频/关闭telemetry不能关闭守卫；摘要只负责回查，不作为下一轮授权，不声称长期窗口通过。

## 批次5：整链故障矩阵与交付

**Files:** Modify runtime fixture/测试、`src/tests/smoke.cjs`、`src/AGENTS.md`、`src/services/AGENTS.md`、`src/tests/AGENTS.md`；Create `docs/superpowers/evidence/2026-10-16-remote-recon-trial-guard-local-delivery.md`。

**Interfaces:** Consumes 批次1—4全部接口。Produces 完整本地交付证据及未验收项，不产生线上会话或新运维启动命令。

- [x] **5.1 补整链RED矩阵。** `trial_metrics_disabled_does_not_disable_guard`断言telemetry=false时期限/停止/Store终局仍生效；`trial_offline_connection_never_controls_safety`完全不提供console/API连接，推进Game tick到期限仍关闭且不发第二scout；`trial_existing_recovery_and_reservations_unchanged`核对原重规划冷却、原leg期限、原预算及资源预留场景；`trial_terminal_replay_and_runtime_reset_matrix`在waiting_spawn/spawning/travelling/observing/stopping/终局分别重载，启动/期限/结果不重置。

```js
assert.equal(Memory.empire.control.policy.telemetry.enabled, false);
assert.equal(scene.state.current.status, 'aborted');
assert.equal(Memory.empire.remoteRooms.W1N2.enabled, false);
assert.equal(Memory.empire.remoteRooms.W1N2.hold, true);
assert.equal(scene.fixture.spawnCalls.filter(call => call.memory.remoteId && call.result === OK).length, 1);
assert.equal(scene.state.current.expiresAtTick, originalTrialDeadline);
```

- [x] **5.2 针对失败回到根因并做必要修复。** 不因GREEN目标删除失败断言、增加重试次数、放宽deadline或清空记录。
- [x] **5.3 运行 `node --test src/tests/recon-trial-model.cjs src/tests/recon-trial-runtime.cjs`，再运行完整 `npm test`。** 读取完整输出、exit code和失败/跳过数；保留分批RED/GREEN与最终日志。既有251项是基线，不预先填写新增数量或最终通过数。
- [x] **5.4 仅构建并检查diff。** PowerShell先配置bundled Node的PATH，再`Remove-Item Env:DEST -ErrorAction SilentlyContinue`，执行`npm run build`；必须输出“未指定目标，代码将被编译但不会上传”。执行`git diff --check`和`git diff --cached --check`，核对无临时.secret、无无关文件变动。
- [x] **5.5 维护者自检并保存中文交付。** 检查服务顺序、缺许可时拒绝、默认关闭兼容、schema保留、not_called与unknown区别、scope隔离、release退出、原期限、无第二账本/执行器及过度压缩代码。报告准确列出代码/测试/构建/Git状态，列出尚未发布、原生通道未复核和实机未验收项。

## 计划覆盖与执行交接

| 设计要求 | 批次 |
| --- | --- |
| 默认关闭、人工请求、时间/身份/重放、终局锁/release | 1；2/4验证实际副作用 |
| P0动作前撤权、freshness、既有task、调度/重载 | 2；5整链复核 |
| 至多一名scout、调用阶段、退款/unknown、禁止替换 | 3 |
| 出生/位移/视野/连续安全、可见路线、结果/费用/关闭确认 | 4 |
| 低频/关闭遥测、外部断线、完整回归/构建/维护文档 | 5 |

推荐主代理在当前会话逐批执行：这些批次共享同一许可和孵化阶段契约，主代理连续维护上下文更直接。若用户同意，可在全部本地验证后增加一次子代理只读独立review，重点核对同tick撤权、跨tick未知执行、停止与结算边界；本计划本身不授权调用子代理。

执行记录：用户已选择主代理逐批实现＋一次只读独立review。五批本地工作及review修复完成，完整330/330、smoke、room-governor与仅构建通过；未暂存、提交、推送或部署。实际侦察与采运尚未执行。实施裁定和逐项证据见本地交付记录及计划专属progress.md。
