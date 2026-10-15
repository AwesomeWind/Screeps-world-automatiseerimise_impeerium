# 单远程矿采运闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans 按任务执行。只有用户明确选择子代理实施或独立 review 时，才使用相应子代理技能与工具。步骤使用 checkbox 跟踪。

**Goal:** 一个母房支持一个相邻远程房的一处 source，完成必要容器准备、采矿、真实返程收货、补员、安全暂停与游戏内有界观测。

**Architecture:** RemoteMining 生产受预算约束的 owner 需求，现有 Bureau/Spawn 执行；远程角色策略只派任务，ActionParser 只执行。近源取货和本房卸货复用母房唯一 ResourceMarket owner ledger。经营状态与收支持久化，窗口事实由 Metrics 准备、Telemetry 在 tick 末完成，外部网络不参与连续采集。

**Tech Stack:** 现有 JavaScript ESM、Screeps APIs、Rollup；本地 CJS + node:test/strict assert，无新依赖。独立 bundled Node v24.19.0。

**Spec:** [已批准设计](../specs/2026-10-14-single-remote-mining-design.md)。执行者先读该设计及适用 AGENTS.md；本计划不替代业务约束。

状态：用户已批准计划并选择主代理逐批实施＋一次只读独立 review；Task 1–8 本地实施、一次独立 review 与问题修复完成，修复后完整门禁通过。后续已明确授权提交、推送和部署，保持远程矿关闭；当前发布状态见配套 release 记录。

## Global Constraints

- 基线 main/HEAD `9ab8f4263024904972935987fe83672db3802f75`，业务发布 647dac7；执行前重新核验。保护当前未提交设计、计划和四份诊断报告，不 reset/覆盖/混入其他改动。
- 执行前使用 using-git-worktrees 核验隔离环境，优先复用适合的附属 worktree；若新建，只复制已批准 spec/plan 并校验相同内容，不搬走主目录其他文件。
- 不自动提交、推送、部署或修改在线 Memory；分批完成留 diff 与 ledger。技能示例中的 commit 步骤由用户的提交授权边界覆盖。
- 一个 pilot、一个相邻普通中立房、一个锁定 source；总开关默认 false，不启用未知线上目标。Governor shadow、scheduler.enforce=false。
- role 常态 quota：scout 1、remoteMiner 1、remoteHauler 最多 2、reserver 1；reserveController 默认 false；每个 quota 至多一个旧替换 actor 重叠，物理人数也有界。
- 孵化预算 2000 energy/1000 ticks，单 body 上限 miner/hauler 800、scout 50、reserver 650；基建/维护预算 6000 energy/1000 ticks，不互相抵扣。
- intel TTL=100；恢复安全 streak=100；恢复侦察间隔=200；装货等待最多 10；容器 repair 低于 40% 启动、目标 80%。这些是保护初值，不称为最优参数。
- leg deadline=`ceil(2*estimatedLegTicks)+20`，超过 300 报 unsupported_route；重新规划不延长绝对期限，fatigue 不计 remote stuckTicks，连续可移动无位移 5 ticks 才卡死。
- 本房资源 TTL=5、maxTaskTicks=50、owner cap=200 不改变；跨房行程不占库存预留；OK 不等于下一 tick 实际交付。
- 游戏内窗口保留 current+previous 两段、事件最多 20；目标 10000 完整 ticks，review_required 且 acceptancePassed=false；保持原本房历史上限 50。
- 每批先观察真实 RED，再 GREEN，再完整门禁；不把不存在函数/模块的失败当成已复现的生产缺陷。

## Review Focus

1. 预算窗口边缘、低成本 scout、多请求并发及迟到回执：不得重置额度或漏计临时占用。归属 Task 2。
2. legacy actor 缺 home/source、配置改 epoch、旧队列残留：不猜归属，不将旧收入记到新矿点。归属 Task 1、2、5、7。
3. 邻房入口已危险、母房也危险、所有 actor 已撤走：安全等待与有限侦察例外不能造成盲目往返或永远丢失视野。归属 Task 3、7。
4. 装卸与建造维修的并发净变化、错误回调及部分卸货：unknown 不计收入，动作结果不得把“移动成功”当“建造成功”。归属 Task 4、5、6。
5. tick 末异常、telemetry 禁用、缺 CPU、普通 global reset 和代码更新：不能凭 Game.time 差或滚动 p95 伪造完整窗口。归属 Task 8。

## 文件结构与持久接口

| 文件 | 职责 |
| --- | --- |
| `src/services/RemoteMiningState.js`（新） | 配置校验、人口/状态、有限需求计划的纯计算 |
| `src/services/RemoteMiningLedger.js`（新） | 有界预算授权、成功成本、基础设施结果及有身份的收支幂等累计；不是资源预留市场 |
| `src/services/RemoteMiningRoute.js`（新） | 两房范围内路线、安全格、body/fatigue 行程估计与绝对 leg 期限 |
| `src/services/RemoteMiningService.js` | 经营协调、情报、owner 需求、工地准备、结果消费 |
| `src/strategies/RemoteMiningStrategyService.js`（新） | 四种 canonical remote actor 的唯一派活入口 |
| `src/core/MetricObservationWindow.js`（新） | 不懂远程策略的纯数值窗口开始/准备/完成/冻结函数 |
| 既有 `SpawnBureauService/SpawnService/ResourceMarketService/ResourceReservationFeedback` | 孵化入口与预算校验、单 ledger 近端预留和同步 resolution 消费 |
| 既有 `TaskMetadata/TaskGuard/ActionParser/BodyBuilder/EmpirePolicy/EmpireMetricsService/RuntimeTelemetry/main` | 限定扩展，不加入另一个执行器或业务 registry |
| `src/tests/remote-mining.cjs`、`src/tests/helpers/remote-mining-fixture.cjs`（新） | 原生 node:test + 真实服务链，fixture 只模拟必要的 Screeps 输入/动作结果 |

配置仍是 `Memory.empire.remoteRooms[remoteRoomName]`。经营状态为 `Memory.empire.remoteMining.operations[remoteId]`，remoteId=`baseRoom:remoteRoom`；内含 epoch、configSignature、selectedSourceId、status/reasons、lastKnownIntel、route、actorState、ledger、events。母房预算放 `Memory.empire.remoteMining.budgets[baseRoom]`，不能随换 source/epoch 清零。

budget 以 50-tick 桶保守维护最近 1000 ticks，最多 21 桶；包含截止时刻所在的旧桶直至完全过期，可能少用最多 49 ticks 的旧额度，但不会跨桶边界多花。pending grants 最多 16，按原 deadline 释放；grant 还不确定是否已被执行时保留其成本上界并标 unknown，不能先释放再补记。receipt 同时最多 16 个尚需核对的 actor/trip 身份，不能驱逐有效证据。

operation 的收支维护 current epoch + previous settled epoch，变更 source/路线前须结束旧任务/在途货物/未结算 owner；未完成则 pending_config_change，不启动新经济 epoch。actor 携带 role/homeRoom/targetRoom/remoteId/epoch/quotaKey/sourceId；tripSequence 跨 reset 单调，tripId=`creepName:epoch:tripSequence`。

### 本地命令

```powershell
$stageNode = 'C:\Users\mts-2\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$env:PATH = "$(Split-Path -Parent $stageNode);$env:PATH"
# 某一任务的 RED/GREEN：替换 pattern 为该任务列出的 case 前缀
& $stageNode --test --test-name-pattern '^quota_' src/tests/remote-mining.cjs
# 完整新增套件
& $stageNode --test src/tests/remote-mining.cjs
# 每批完整门禁
& $stageNode 'C:\nvm4w\nodejs\node_modules\npm\bin\npm-cli.js' test
if (Test-Path Env:DEST) { throw 'Verification build requires DEST absent' }
& $stageNode 'C:\nvm4w\nodejs\node_modules\npm\bin\npm-cli.js' run build
git diff --check
git diff --cached --check
```

执行每个命令后检查 exit code，出现失败就停止下一项；不要只取最后一个命令的 exit code。最终 npm test 保留 smoke、room-governor，追加 `node --test src/tests/remote-mining.cjs`。

## Batch A：状态、人口、孵化与预算

### Task 1：规范身份和唯一需求入口

**Files:**
- Create: `src/services/RemoteMiningState.js`、`src/tests/helpers/remote-mining-fixture.cjs`。
- Modify: `src/services/RemoteMiningService.js`、`src/config/EmpirePolicy.js`、`src/services/SpawnBureauService.js`、`src/main.js`、`package.json`。
- Test/Create: `src/tests/remote-mining.cjs`。

**Interfaces:** `normalizeRemoteConfig(remoteRoomName, rawConfig, policy) -> {valid,config,reasons}`；`collectRemoteActors(population,remoteId,epoch,roleLimits) -> {covered,physical,usableParts,replacing,unknowns}`；`evaluateRemoteState(operation,facts,policy,tick) -> {status,reasons,allowEconomicDeparture,allowRecon}`。人口输入来自 currentCreepPopulation，不另扫描 Memory 做身份存在性。canonical 策略后续在 Task 4/6 接入。

fixture `createRemoteFixture(options={}) -> Promise<f>`：设必要常量后 native import 生产模块。f 暴露 memory、objects、spawns、spawnCalls、source/container/site/homeSink、miner/hauler 和 operation/ledger getter，外加 createdSites/visibleHostiles/newEconomicDepartures/droppedResources 数组。`runTick()` 运行按 main 装配顺序排列的相关真实服务全部 phases、dispatch 和 ActionParser；`nextTick({storeEnergy,positions,visibility,spawnState,tick,siteVisible}={})` 仅推进明确给定的下一 tick 快照，动作 mock 的 OK 不立即改 store。`resetRuntime()` 清空 globals/服务实例/EventBus 并保留 Memory、世界快照；`actionResult(actorName,method,result)` 设置动作结果。`remoteMoveTask({maxTicks,absoluteDeadline})` 创建指定位置的普通 Task，同时设 hauler.remoteLeg 绝对期限；`hostileAtExit()` 返回入口处有有效 ATTACK 的敌人 fixture。不能构造通用游戏引擎或跳过生产消费者。

options 只包含本计划 case 使用的 policyEnabled、selectedSource、spawnBudget、allowContainerBuild、containerBuilt、haulerAtHome/haulerAtRemote、carriedEnergy、pendingEnergy。默认母房健康、两 spawn 中一处可闲、一处 remote source 就绪且另一个 source 不选用，sink 留有容量；原型阶段不 import 尚未存在的新 helper 才能先跑旧生产链 RED。以后按任务加入 helper 的独立契约 case。每个 case 使用 `node:assert/strict` 与 `node:test`，不能用空接口 stub 冒充生产实现。

- [x] 写 `quota_default_disabled`、`quota_unknown_vision_single_scout`、`quota_upcoming_covers_source`、`quota_only_selected_source` 的真实链断言；先针对现有 RemoteMining 观察重复请求/全源扫描等实际 RED。

```js
const f = await createRemoteFixture({ policyEnabled: true, selectedSource: 'remoteSourceA' });
f.spawns.Spawn1.spawning = { name: 'RemoteMinerUpcoming' };
f.memory.creeps.RemoteMinerUpcoming = {
  role: 'remoteMiner', homeRoom: 'W1N1', targetRoom: 'W1N2',
  remoteId: 'W1N1:W1N2', epoch: 1, sourceId: 'remoteSourceA', quotaKey: 'remoteMiner:W1N1:W1N2:remoteSourceA'
};
f.runTick();
assert.equal(f.spawnCalls.filter(call => call.memory.role === 'remoteMiner').length, 0);
assert.equal(f.spawnCalls.filter(call => call.memory.sourceId === 'remoteSourceB').length, 0);
```

- [x] 运行 `^quota_`，保存具体预期/实际值，不以 fixture 导入错误代替 RED。
- [x] 实现上述 State 接口和新的默认 policy；只生产 owner=remoteMining 的受控 SpawnDemands，移到 Bureau 前。修改 Bureau 透传 scope/requestId/deadline/body budget 字段。预算授权尚未接好时保持 fail closed，不先上线裸执行。
- [x] 补 `quota_ghost_damaged_unknown_body`、`quota_retiring_overlap_limit`、`quota_legacy_orphaned_actor`：ghost 不计、损坏功能明确、未知实际 spawning 占位、旧 actor 只按唯一合法配置采用；queued 不计 upcoming。因损坏不再可用的旧 actor 也受“一名被替换旧 actor”物理上限约束。
- [x] 运行 `^quota_` 和新增套件，审阅 main 顺序与 WAR owner 共存；不提交。

### Task 2：原期限预算授权和实际成功成本

**Files:**
- Create: `src/services/RemoteMiningLedger.js`。
- Modify: `src/services/RemoteMiningState.js`、`src/services/RemoteMiningService.js`、`src/services/SpawnBureauService.js`、`src/services/SpawnService.js`。
- Test: `src/tests/remote-mining.cjs`。

**Interfaces:** `reserveSpawnGrant(budget,request,tick,policy) -> {granted,grantId,reason}`；`validateSpawnGrant(budget,request,operation,tick) -> {allowed,reason}`；`recordSpawnResult(budget,ledger,{requestId,name,result,body,acceptedAt},tick) -> {applied,reason}`；`cancelSpawnGrant(budget,requestId,tick) -> boolean`。request 含 remoteId/epoch/quotaKey/role/maxEnergy/deadline；不允许在不同实例里重造并续期同一 request。

- [x] 写 `budget_pending_counts_before_success`、`budget_replay_reset_no_second_charge`、`budget_old_epoch_retry_cancelled`。

```js
const f = await createRemoteFixture({ policyEnabled: true, spawnBudget: 1000 });
f.runTick();
assert.ok(f.spawnCalls.reduce((sum, call) => sum + call.cost, 0) <= 1000);
const charged = f.ledger.spawnEnergyConfirmed;
f.resetRuntime(); f.runTick();
assert.equal(f.ledger.spawnEnergyConfirmed, charged);
assert.equal(f.memory.empire.control.policy.scheduler.enforce, false);
```

- [x] 运行 `^budget_` 确认实际 RED；mock 的 spawn OK 必须经过 SpawnService.run 的成功记录路径。
- [x] 实现预算桶/16 个 grants 与 intake/run 再验证；同 tick 多任务包含临时成本；OK 转 actual body 成本，失败按原期限释放/重试。成功结果在 SpawnService.run 持久计费，RemoteMining.cleanup 另核对尚未消费的备份；前者避免 cleanup 缺口漏账，二者按 requestId 幂等。
- [x] 补 `budget_rolling_boundary`（两相邻窗口不得各花一整份）、`budget_zero_nan_fractional_limits`、`budget_full_receipt_capacity`、`budget_unknown_execution_keeps_upper_bound`；原期限到期后新 logical request 有新序号，旧记录不复活。
- [x] 测 hold/换 epoch 会过滤自己残留的 EventBus REQ_SPAWN 和 retries，同时保留 WAR/其他 owner；运行 `^budget_`、完整新增套件及 Batch A 门禁，记录 ledger，不提交。

## Batch B：有界路线与必要容器

### Task 3：两房路线、真实行程和移动期限

**Files:**
- Create: `src/services/RemoteMiningRoute.js`。
- Modify: `src/core/ActionParser.js`、`src/core/TaskGuard.js`、`src/services/RemoteMiningService.js`、`src/services/RemoteMiningState.js`。
- Test: `src/tests/remote-mining.cjs`。

**Interfaces:** `estimateLegTicks(body,steps,loadState) -> {known,ticks,reason}`；`planRemoteRoute(home,target,facts,policy,tick) -> {valid,path,estimatedLegTicks,generatedAt,reasons}`；`createRemoteMoveTask(actorState,route,goal,tick) -> Task|null`。path 最多 300 个 `{x,y,roomName}`，仅 home/target；限定路径/危险格由 service 规划，core 不读远程经济策略。

- [x] 写 `route_over_50_ticks_does_not_restart_leg`、`route_invisible_goal_uses_position`、`route_fatigue_not_stuck`；以 ActionParser 真正执行 MOVE_TO，非仅测试估计函数。

```js
const f = await createRemoteFixture({ policyEnabled: true });
f.hauler.fatigue = 10;
f.hauler.memory.task = f.remoteMoveTask({ maxTicks: 140, absoluteDeadline: 240 });
for (let i = 0; i < 6; i++) { f.runTick(); f.nextTick(); }
assert.equal(f.hauler.memory.lastTaskClear && f.hauler.memory.lastTaskClear.reason, undefined);
assert.equal(f.hauler.memory.remoteLeg.expiresAt, 240);
```

- [x] 运行 `^route_`，确认旧默认 50/stuck 行为的实际失败，排除不合法 RoomPosition mock。
- [x] 按 body 有效 MOVE、负载 CARRY 和 terrain 估计时间；未知 boost 等不能测量时返回 unknown，不猜 1 tick。PathFinder roomCallback 不允许第三房，危险格进入 cost matrix；输出合法路径再由 ActionParser 将坐标恢复为位置、执行 moveByPath。无可选 path 时保留原 moveTo 分支。
- [x] 保存 actor.remoteLeg 的绝对 expiresAt，task 重建不延期；remote-only fatigue 等待不增加 stuckTicks，仍受 deadline。超过 300 直接 unsupported_route；no path 不交给不受限的 fallback。
- [x] 补 `route_hostile_exit_home_also_dangerous`、`route_path_malformed_third_room`、`route_source_changed_replan_no_old_goal`、`route_ordinary_move_defaults_unchanged`；运行 `^route_` 和套件，不提交。

### Task 4：一个工地、采矿卸货和必要维护

**Files:**
- Create: `src/strategies/RemoteMiningStrategyService.js`。
- Modify: `src/services/RemoteMiningService.js`、`src/services/RemoteMiningLedger.js`、`src/strategies/MinerStrategyService.js`、`src/core/BodyBuilder.js`、`src/core/TaskMetadata.js`、`src/core/TaskGuard.js`、`src/core/ActionParser.js`、`src/main.js`。
- Test: `src/tests/remote-mining.cjs`。

**Interfaces:** 策略的 `assignRemoteMinerTask(creep,operation,facts)`；Ledger 的 `reserveInfrastructureAttempt(budget,context,upperBound,tick)` 与 `recordInfrastructureResult(budget,ledger,observation,currentFacts,tick)`。TaskMetadata 扩展 `registerTaskObservation(task,context)`、`observeTaskAction(creep,target)`、`recordTaskActionResult(creep,{attempted,actionType,result})`，每 actor 仅持久一条带 id/tick 的 lastActionObservation；只在有 context 时记录。

- [x] 写 `source_one_container_next_tick_confirmation`、`source_bootstrap_harvest_build_then_transfer`、`source_repair_threshold_budget`、`source_move_ok_not_build_ok`。

```js
const f = await createRemoteFixture({ policyEnabled: true, allowContainerBuild: true, containerBuilt: false });
f.runTick();
assert.equal(f.operation.containerReady, false);
f.nextTick({ siteVisible: true }); f.runTick();
assert.equal(f.createdSites.filter(site => site.type === 'container').length, 1);
assert.equal(f.createdSites.filter(site => site.type === 'road').length, 0);
assert.equal(f.ledger.returnedEnergyConfirmed, 0);
```

- [x] 运行 `^source_`；分别观察生产无源容器合约、TaskGuard 禁止动作或错误结果归类的 RED，不要求每个新接口先存在。
- [x] 新策略只处理 canonical remoteMiner，在通用 MinerStrategy 对带 remoteId 的角色退出派活，避免双消费者。必要时只创建指定 container site；工地由该 miner 采本源能量交替建设；容器就绪后站位 HARVEST/TRANSFER，低于 40% repair 到 80%。仅 canonical scope 放行 BUILD/REPAIR/TRANSFER。
- [x] 基建上界在动作前预占；core 分开记录“实际调用工作 API 的结果”与随后 move 的结果，避免把移动 OK 计费。下一 tick observer 确认 actor energy 与 progress/hits；失败返还，无法确认保留未知上界，重放不再计费。
- [x] 补 `source_container_full_missing_wrong_room`、`source_failed_site_create_no_second_site`、`source_concurrent_changes_unknown`、`source_malformed_observation_no_throw`、`source_no_second_source_no_local_builder_takeover`；运行 suite 和 Batch B 门禁，不提交。

## Batch C：物流结算与完整往返

### Task 5：母房唯一 owner ledger 的远程入口和 resolution

**Files:**
- Modify: `src/services/ResourceMarketService.js`、`src/services/ResourceReservationFeedback.js`、`src/core/TaskMetadata.js`、`src/services/RemoteMiningLedger.js`。
- Test: `src/tests/remote-mining.cjs`、`src/tests/smoke.cjs` 相邻 owner cases。

**Interfaces:** `createRemotePickupTask(creep,{remoteId,epoch,tripId,amount}) -> Task|null`、`createRemoteHomeDeliveryTask(creep,{remoteId,epoch,tripId,targetId,amount}) -> Task|null`。`reserveForTask(market,side,entry,amount,creep,task,context?) -> boolean` 向同一 owner 附 opaque context。`reconcileReservations(reservations,stats,totals) -> Resolution[]`；Resolution 包含 reservationId/creepName/context/status/confirmedAmount/resourceType/targetRoom/targetId。旧调用方忽略新增返回值仍兼容。

Ledger `recordRemoteResolution(ledger,resolution,currentEpoch,allowedHomeTargets) -> {applied,reason}`；在 ResourceMarket 原 analyze/cleanup 消费函数返回值的同一同步调用栈记录，不使用晚一 tick 的 EventBus outbox。无 context 的本房 settlement 行为不变。

- [x] 写 `settlement_ok_same_tick_zero_next_tick_actual`、`settlement_two_owners_cancel_one`、`settlement_source_deposit_not_home_income`、`settlement_late_epoch_ignored`。

```js
const f = await createRemoteFixture({ policyEnabled: true, haulerAtHome: true, carriedEnergy: 100 });
f.runTick();
assert.equal(f.ledger.returnedEnergyConfirmed, 0);
f.nextTick({ storeEnergy: { HaulerA: 0, HomeSink: 100 } }); f.runTick();
assert.equal(f.ledger.returnedEnergyConfirmed, 100);
f.runTick();
assert.equal(f.ledger.returnedEnergyConfirmed, 100);
```

- [x] 运行 `^settlement_` 确认缺少身份归属/下一 tick 收入的 RED；不能在 fixture 中让 transfer() 立即改 store。
- [x] 实现两个入口：必须在对应目标 range 1 且当前状态/身份/epoch 合法；占母房现有 reservations，remote entry 不放到本房 hauler 公共候选；仍用 supply 独占和 demand 数量预留。raw Resolution 只是同一 owner 的执行结果，不建立第二份库存或常驻队列。
- [x] 收入只认 remoteHauler home_delivery + 允许母房目标 + 匹配的下一 tick delta；新 epoch 等旧 owner 收尾后开始。malformed/未知 context 返回未应用和原因，不 throw、不已写半套计数；容量到限拒绝新分配。
- [x] 补 `settlement_partial_concurrent_unknown`、`settlement_target_missing_dead_reset`、`settlement_owner_cap_200_receipt_cap_16`、`settlement_legacy_null_record_compatible`；跑新 suite、既有 smoke 全部 owner 回归，不提交。

### Task 6：运输状态、容量和替换收尾

**Files:**
- Modify: `src/strategies/RemoteMiningStrategyService.js`、`src/services/RemoteMiningState.js`、`src/services/RemoteMiningRoute.js`、`src/services/RemoteMiningLedger.js`、`src/core/BodyBuilder.js`、`src/core/TaskGuard.js`。
- Test: `src/tests/remote-mining.cjs`。

**Interfaces:** `estimateRemoteHaulerNeed({sourceCapacity,regenTicks,minerWork,carryCapacity,outboundTicks,inboundTicks,handlingTicks,pendingEnergy},policy) -> {desiredCount,gap,known,reasons}`；策略 `assignRemoteHaulerTask(creep,operation,facts)`，消费 Task 3 路线和 Task 5 两个任务入口。状态名字严格使用 spec；tripSequence 只在新 loading 轮次开始时递增。

- [x] 写 `haul_full_round_trip_true_home_receipt`、`haul_partial_load_after_10_ticks`、`haul_capacity_gap_cap_two`、`haul_retiring_never_depart_again`。

```js
const f = await createRemoteFixture({ policyEnabled: true, haulerAtRemote: true, pendingEnergy: 80 });
f.runTick(); f.nextTick({ storeEnergy: { HaulerA: 80, RemoteContainer: 0 } });
f.runTick();
assert.equal(f.hauler.memory.remoteLeg.state, 'to_home');
const tripId = f.hauler.memory.remoteTrip.tripId;
f.resetRuntime(); f.runTick();
assert.equal(f.hauler.memory.remoteTrip.tripId, tripId);
assert.equal(f.ledger.returnedEnergyConfirmed, 0);
```

- [x] 运行 `^haul_`，观察没有远程运输/误提前计入收入等 RED。
- [x] 实现 to_remote/loading/to_home/unloading/idle/returning/safe_wait/retiring；跨房只分 MOVE_TO，不提前预留；取货 wait≤10，partial 能返，零载等待。卸货支持部分量/切换允许目标，满仓保留货物并停新轮次。
- [x] 按实际 body/路程算配额，先一人、最多两人；替换 lead=spawnTime+outboundTicks+50。unknown 产率不伪造吞吐；缺功能 body 报阻塞。非 energy 货物不当作本轮收益，安全留存/退回既有允许目标，不随意 drop。
- [x] 补 `haul_home_sink_full_no_drop`、`haul_unseen_object_not_destroyed`、`haul_dead_carried_loss_unknown`、`haul_duplicate_trip_reassignment`；跑 suite、Batch C 门禁，核对没有双市场或本房 hauler 被挪用，不提交。

## Batch D：安全恢复、游戏内窗口与最终交付

### Task 7：危险、hold 和有限恢复侦察

**Files:**
- Modify: `src/services/RemoteMiningService.js`、`src/services/RemoteMiningState.js`、`src/services/RemoteMiningRoute.js`、`src/strategies/RemoteMiningStrategyService.js`、`src/services/RemoteMiningLedger.js`。
- Test: `src/tests/remote-mining.cjs`。

**Interfaces:** `collectRemoteIntel(room,tick,previousIntel) -> Intel`；`evaluateRemoteState` 加完整 gates；`canAttemptRecoveryRecon(operation,facts,policy,tick) -> {allowed,reasons}`。只看当前可见远程事实与已有 lastKnown，不以母房 WarIntel 的缺席判断安全。

- [x] 写 `safety_hostile_visible_stop_outbound_release_only_own`、`safety_home_recovery_emergency_blocks_remote`、`safety_stale_intel_not_safe`、`safety_hold_does_not_auto_clear`。

```js
const f = await createRemoteFixture({ policyEnabled: true, carriedEnergy: 80 });
f.visibleHostiles.push(f.hostileAtExit()); f.runTick();
assert.equal(f.operation.status, 'suspended');
assert.equal(f.newEconomicDepartures.length, 0);
assert.equal(f.droppedResources.length, 0);
assert.ok(f.memory.empire.control.policy.roomGovernor.shadow);
```

- [x] 运行 `^safety_`，确认已有逻辑缺乏远程/母房 gate 的实际 RED。
- [x] 实现暂停、取消自身 demands/排队 retries、撤回或 safe_wait；人工停矿不自杀、不 destroy/unclaim，不调整本房作战。返回也要核对母房与路径安全。
- [x] 实现唯一恢复 scout 例外：200 ticks 告警冷却/侦察间隔、健康母房及接收空间、最后危险区以外的入口、预算与 quota；到入口取得视野后安全连续100才恢复经济。无安全入口或人工 hold/他人控制/母房危机不得派 scout。
- [x] 补 `safety_all_retreated_recon_can_restore_vision`、`safety_unsafe_exit_wait_no_blind_loop`、`safety_foreign_reservation`、`safety_epoch_change_drains_old_actor`、`safety_legacy_actor_no_guess`；跑 suite，不提交。

### Task 8：游戏内完整 tick 窗口和整体回放

**Files:**
- Create: `src/core/MetricObservationWindow.js`、`docs/superpowers/plans/2026-10-14-single-remote-mining-ledger.md`、`docs/superpowers/evidence/2026-10-14-single-remote-mining-delivery.md`。
- Modify: `src/services/EmpireMetricsService.js`、`src/core/RuntimeTelemetry.js`、`src/services/RemoteMiningLedger.js`、`src/config/EmpirePolicy.js`。
- Test: `src/tests/remote-mining.cjs`、`src/tests/smoke.cjs` 的有界 schema cases。

**Interfaces:** `createObservationState() -> {current:null,previous:null}`；`beginObservationTick(state,{tick,codeVersion,scopeId,epoch},limits) -> state`；`prepareObservationSample(state,sample) -> state`；`finishObservationTick(state,{tick,codeVersion,totalCpu,bucket},limits) -> state`；`pauseObservation(state,{tick,reason}) -> state`。这些函数返回新 state，不依赖 Game/Memory、不 mutate 输入，不 import 服务/策略。sample 为 `{tick,identity:{codeVersion,scopeId,epoch},fields,flags,counters}` 的固定容量普通 JSON 对象，由 Metrics 从规定字段构建；不接受任务或 Game 对象。

本任务单测的 `limits={targetTicks:10000,eventLimit:20,maxFields:32}`；test-only `validSample(tick)` 至少给出 finite Controller progress/ticksToDowngrade、core gaps、母房储备/接收容量、固定收支计数及正常/覆盖 flags。该 fixture 仅生成输入，不在其中计算生产窗口逻辑。

固定存储：`control.metrics.remoteObservation={current,previous}`；current 含 identity/startTick/lastTick/startedTick/completedTick/observedTicks/status、numeric aggregates、coverage flags、20 events。RemoteMining/EmpireMetrics 产生业务事实，RuntimeTelemetry.beginTick 标记开始，finishTick 在计算真实 CPU 后、10-tick 持久摘要 early return 前完成窗口；无 pilot 或 disabled 不分配窗口。

beginTick 对已有窗口只使用其持久 identity 标记当前 frame，不读取远程策略。首个窗口或本 tick 新 epoch 由 EmpireMetrics.cleanup 使用已记录的 EmpireTelemetry.tick/codeVersion 起点调用 beginObservationTick，再 prepare；不能因首个窗口在 cleanup 创建而漏掉或捏造 frame。finishTick 必须要求 startedTick、prepared sample.tick、completed tick 三者一致，只完成一次；采样未准备或代码身份已变不能沿用上 tick sample。

- [x] 写 `window_finish_after_real_cpu`、`window_gap_freezes_not_merges`、`window_missing_cpu_unknown`、`window_10000_requires_review`。

```js
let state = createObservationState();
for (let tick = 1; tick <= 10000; tick++) {
  state = beginObservationTick(state, { tick, codeVersion: 'v1', scopeId: 'W1N1:W1N2', epoch: 1 }, limits);
  state = prepareObservationSample(state, validSample(tick));
  state = finishObservationTick(state, { tick, codeVersion: 'v1', totalCpu: 5, bucket: 10000 }, limits);
}
assert.equal(state.current.observedTicks, 10000);
assert.equal(state.current.status, 'review_required');
assert.equal(state.current.acceptancePassed, false);
```

- [x] 运行 `^window_`；新纯函数的缺失只是新能力 RED，另外用真实 Metrics.cleanup→Telemetry.finishTick 证明 CPU 尚未最终计算时不能提前完成 sample。
- [x] 实现 current+previous 两段和固定 aggregate：CPU mean/max/bucket min、Controller start/end/minDowngrade、core gaps、储备/接收空间、收支及unknown、预留peak、状态时长、coverage。滚动 p95 标签明确；没有每 tick history 数组。
- [x] 缺测/未完成 frame/version/epoch 改变冻结 incomplete 再起段；普通 global reset 和连续 ticks 保留段；telemetry disabled 暂停，缺值不填0，完成10000仍不自动验收。补 `window_reset_continues_memory`、`window_disabled_and_version_change`、`window_capacity_long_run`。
- [x] 跑 `integration_main_order_and_full_loop`：使用真实 main.loop 和生产服务装配，必要的非参与服务通过现有 flags 停止；禁止替换相关 Remote/Spawn/Market/ActionParser/Metrics 为测试实现。模拟一个完整源→货→母房流、一次自然替换、danger/hold/full sink、reset 和迟到结算，断言其它服务及本房角色仍正常。
- [x] 运行 `npm test`、无 DEST build、两类 diff check；逐项核对 Review Focus 和 spec 12 节，无 untested 接口/无界字段/策略绕过。保存每批 RED/GREEN、最终 diff、成本和真实验收缺口，不提交。

## 自检与交付

覆盖映射：spec 1–4 → Task 1；5 → Task 1/3/7；6 → Task 2/6；7 → Task 4；8 → Task 3/6；9 → Task 5/6；10 → Task 8；11–12 → 每批门禁/整体回放/下列收尾。没有另立 Goal/Plan/市场或外部长期采集任务。

- [x] 每批更新 `docs/superpowers/plans/2026-10-14-single-remote-mining-ledger.md`，列出实际改动、RED/GREEN、维护者裁决、当前限制；该文件在实施时创建。
- [x] 本地交付包括代码、真实服务链测试和游戏内窗口，只称本地完成；保持现有线上 647dac7 不变。
- [x] 提供具体相邻房/source/入口/容器/母房接收目标的只读事实及预算建议。配置 schema允许部署输入待确定，但不启用未知目标；由明确配置与授权启动单矿。
- [ ] 另获提交/部署指令后，保留旧产物、回读新 main/map/version；只启用一 pilot。确认 source 运输实际到账、母房不失血、退出安全后再读游戏内窗口，不因本地测试通过扩大范围。
- [x] 回退先停新需求/出发/工地，允许安全返程和同 owner 最后结算，保存成本/unknown；旧 epoch 未收尾不启新 epoch。代码回退不能撤销已执行游戏动作；四份历史诊断报告不参与回退。

## 执行交接

建议主代理在当前会话依次执行 Batch A→B→C→D，接口较紧密，按批保持一个连续上下文更容易核对跨 tick 合约。默认不使用子代理；若用户选择，可在本地全部完成后增加一次只读独立 review，或改为分任务子代理流程。任何 reviewer 均只审阅已批准 spec、实现和测试，不操作线上。

本计划审阅通过且执行方式明确后，进入执行技能。未经该阶段确认不将“计划完成”当成已实施。
