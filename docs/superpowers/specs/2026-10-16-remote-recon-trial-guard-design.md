# 游戏内有限侦察试点守卫设计

日期：2026-10-16。状态：用户已认可设计及计划，已完成本地实现、验证及一次只读独立review后的修复，尚未提交或发布。

## 目标与约束

把一轮有限侦察的期限、单一 scout 许可、停止和结果留存放到游戏运行时中。外部连接中断后，游戏继续运行时仍能自行停止；连接恢复后可通过只读 GET 取得结果。每轮启动需要人工授权，结束后不自动开始下一轮。

第一版只管理一个相邻远程房间的纯侦察会话，候选试点 W49N41→W48N41。生产实现不写死该房间、source 或工位坐标。实际采运、容器建设、Controller 预定和 Goal/Plan 均不在启用范围。

保留 Governor shadow=true、scheduler.enforce=false、market=false、Goal/Plan=false，以及现有孵化/基建预算、核心补员优先、单 leg 原期限、冷却2ticks和最多一次重规划。开发阶段仅本地改动、回归和构建；本设计不授权提交、推送、部署、修改线上 Memory 或启动试点。

## 代码事实与缺口

- `main.js` 实际顺序是 RoomPhase/RoomGovernor/GoalPlan → RemoteMining → SpawnBureau/Spawn → TaskGuard/ResourceMarket → RemoteMiningStrategy；所有 analyze 后分发事件，再执行 run 和 ActionParser，最后 cleanup。
- `RemoteMiningService` 有人口、预算、危险和出发门槛；配额缺口可以触发替换 scout，因此“并发上限1”不等于“一轮只孵化过1名”。
- `SpawnService` 在事件 intake 和实际 spawnCreep 前分别调用 remoteSpawnContext，已有执行 grant、请求去重、实际结果及备份回执。这些继续作为唯一孵化与费用通路。
- `RemoteMiningStrategyService` 已限制同一 leg 的期限和一次重规划，但不能代表整轮侦察期限或阻止死亡后的替换。
- `MetricObservationWindow` 固定10000ticks，用于长期观测；不能直接把它改成300ticks试点计时器。复用 EmpireMetrics 出口，新会话只增加有界摘要，长期窗口语义保持不变。
- RemoteMining 属于 scheduler P2。将守卫只藏在其 analyze 或 metrics.cleanup 中，无法作为动作前的独立停止边界。

## 方案选择

| 方案 | 代价与适用性 |
| --- | --- |
| 独立纯模型、P0守卫服务，接入既有远程门槛和孵化执行边界（推荐） | 能在动作前停止，独立测试跨tick/重载；少量明确接入点，不新增动作执行器 |
| 仅在 RemoteMiningService 中增加期限判断 | 改动较小，但调度跳过和已存在 MOVE_TO/执行队列仍需另外兜底 |
| 仅增强外部监视脚本 | 易沿用，但外部断线时不能独立结束，不满足本轮目标 |

选择第一种。守卫负责许可、停止和记录；SpawnService/ActionParser 继续执行既有动作，资源市场和费用确认不另建一套。

## 人工入口与默认关闭

人工配置集中在 `Memory.empire.control.policy.remoteMining.reconTrial`：`enabled=false`、`request=null` 为默认值。默认关闭且无历史托管会话时，不创建会话状态，不改变既有未托管操作的行为。

start 请求包含 `schemaVersion=1`、`action=start`、`id`、严格递增的 `sequence`、`remoteId`、`epoch`、`codeVersion`、`activateAtTick`、`expiresAtTick`、`issuedAtMs`、`expiresAtMs`、`candidateSourceId`。id长度1—64；sequence为正安全整数，必须大于持久化高水位。

- 正常运维在同一条获批指令中写入请求、打开守卫与既有模块/目标房间开关并解除该房hold；守卫不负责自动打开任何开关。
- `activateAtTick` 指定下一tick。提前到达的请求只阻断出发并等待；仅在指定tick接纳。错过该tick不补启动，重发已消费sequence不能重启。
- `expiresAtTick=activateAtTick+300`，有效区间为 `[activateAtTick, expiresAtTick)`。从接纳开始即计时，孵化、移动、观察共同使用这300ticks，不能在出生时重置总期限。
- `expiresAtMs=issuedAtMs+1200000`；接纳及每次守卫判断均取运行时当前时间。达到任一上限即停止。时钟不可用或发生回退时停止，不放宽期限。
- 游戏未执行tick时，守卫无法即时写入关闭状态；在恢复执行后的首个守卫阶段检查墙钟并停止。20分钟不是服务器停顿时仍能执行的外部定时器保证。
- 新请求不得覆盖正在运行、停止确认中或仍有未结执行项的旧会话。外部请求里的“成功/已移动”等字段一律不能成为证据。

会话入口必须是纯侦察隔离：sourceId=null、allowContainerBuild=false、reserveController=false；scout上限1，其余远程角色上限0；仅该房配置enabled，maxOperations=1。候选source只用于可见后的只读核对，不写回线上sourceId。

## 状态、身份与存储边界

状态位于 `Memory.empire.remoteMining.reconTrials`，schemaVersion=1，包含 sequence高水位、一个current及一个previous。最多20条事件；每条事件只保存tick、阶段、reasonCode和必要id，不保存完整task/path/body数组或每tick日志。旧previous在新会话被正式接纳时替换。

current绑定 `(trialId, sequence, codeVersion, remoteId, epoch)`，并保存接纳时的配置指纹。指纹覆盖房间、候选source、接收id、容器位置、纯侦察隔离字段、保护开关及既定预算/期限值；运行中变化即停止，绝不重置操作epoch来迁就变化。

阶段为 `waiting_spawn → spawning → travelling → observing → stopping → completed/aborted`。拒绝接纳记录为rejected，不进入动作通路。终局不可被普通重载或请求重放改成活动状态。

- 人口采用现有 CreepPopulation 的实时/实际spawning/本tick accepted 证据。旧Memory条目不算真实人口；retiring仍算实体。开始时存在旧 scout、旧过期leg或未结grant则拒绝，不清除记录强制重试。
- 新scout Memory附带trialId和sequence，孵化请求使用现有requestId/grantId；这些标记经 SpawnBureau 的既有memory透传。
- global只保存当tick派生许可，必须携带evaluatedAt=Game.time。global重建依据Memory继续同一会话，不更新开始时间或期限。
- 未知schema、非法sequence、损坏状态保持原值并拒绝出发；不得用ensureDefaults自动覆盖已有的坏会话。已有会话状态缺失时，旧activateAtTick请求已过期，不能重建为新会话。
- 结束后本scope保留托管锁，普通切换enabled或清空request不解除。后续转入经济试点前可人工发送递增sequence的 `action=release`，以targetTrialId明确指定被释放会话，并绑定相同remoteId/epoch；只在终局、目标/模块均关闭、无实体scout或实际spawning/accepted/未结grant时解除托管，保留结果和高水位。release不启用任何功能。

## 动作前的控制边界

新增 `RemoteReconTrialModel.js` 保存纯计算/验证/状态转换；新增 `RemoteReconTrialService` 适配Game、Memory和既有取消接口。服务置于GoalPlan之后、RemoteMining之前，并显式列为scheduler P0；不改变scheduler.enforce配置。

1. **守卫analyze**：接纳或校验会话、时间、身份、保护开关、现有实体和上次结果；global许可初始为拒绝，缺失事实不能放行。
2. **RemoteMining analyze**：完成既有事实与状态计算后，结合本tick守卫结果收窄许可，再决定是否发布需求。守卫永远不能把既有false门槛改成true。仍在移动/观察的首名scout可以继续，但成功孵化过一次后，孵化许可永久关闭。
3. **Spawn intake与run**：同时校验现有grant、scope、trial身份、会话期限、唯一requestId和spawn配额。run处再次检查，避免同tick intake后撤权仍实际孵化。
4. **守卫run**：在Spawn.run及ActionParser之前复查到期/停止状态，并清除被撤权scout的出房任务。RemoteMiningStrategy同样检查本tick许可，覆盖已有task导致跳过moveActor的路径。
5. **守卫cleanup**：补记本tick实际孵化回执和观测阶段摘要；不在cleanup首次决定本tick动作是否允许。实际位移只能由后续tick的Game位置确认。

RemoteMining没有本tick新鲜scope、守卫没有本tick新鲜许可、调度/服务异常造成观测tick断档时，对托管scope拒绝新需求和出房；下一次运行停止会话。P2被跳过时，P0守卫仍能检查和关闭。保护开关意外变化只终止本会话，不把Goal/Plan、Governor、scheduler或market强行改回其他人的配置。

## 一轮最多一名scout

本轮只绑定一个逻辑spawn请求及原deadline，body固定为1MOVE、成本50。普通请求仍走原budget和事件通道；排队过期即结束，不能通过重新生成requestId延长试点或取得第二次额度。

在spawnCreep之前持久化该trial/request的执行claim。只有明确的非OK结果才可在原请求期限内释放claim重试同一请求；OK绑定唯一actor name并永久消耗本轮唯一成功孵化额度。request被intake接受不能直接算出生或费用确认。

现有grant.executing在intake就设true，不能据此推断已经调用引擎。对本轮带完整trial身份的pendingTask，补充callState：intake时not_started，实际调用前call_started，返回后result_known。run处明确撤权且callState仍为not_started时，通过SpawnService退款路径回退本pendingTask的执行标记并取消其grant，记录not_called；不得把这类可证明未执行的任务算成unknown。此规则仅适用于当前试点带执行阶段记录的请求，旧版/其他scope的executing grant不据此清理。

若spawnCreep之后发生中断、结果未落账，保留claim，使用现有执行账本、实际Spawn/Game实体及备份记录恢复证据；无法归因记unknown并停止，不释放额度再孵化。不会重写现有recordSpawnResult和reconcileSpawnExecution的费用口径。

绑定actor死亡、失去MOVE、身份变化或出现第二名实体/第二个请求时，在RemoteMining本tick发布替换需求前停止。其他正常远程操作的替换策略不因该试点守卫而全局改变。

## 观测与完成条件

守卫保存有限证据字段：spawnAcceptedTick、spawningObservedTick、bornAt/出生坐标、lastPosition/观测tick、firstMovementAt、enteredRemoteAt、lastSafeTick/safeStreak、routeCheckedAt、原leg起止、最大retryCount、spawn费用基线及增量。费用不把历史累计值算作本轮开销。

出生前不创建leg，不把生成任务、move返回OK或路径计算成功当实际位移。只有同一actor出生后的后续tick真实位置变化才确认移动；跨房必须是该actor真实在目标房间。

会话安全streak独立归零、按本轮连续采样累加：绑定scout真实在目标房，目标可见，Controller允许、无hostile、母房安全、身份/版本/保护开关不变。重复tick不重复计数，断档停止；不继承历史operation.safeTicks或修改其既有含义。要求连续100ticks。

目标可见后，用真实Game source验证房间/id、候选容器格地形/邻接/结构。候选配置副本只读调用现有validateEconomicRoutes，使用真实接收目标、拟用body、可见结构与危险区域；sourceId仍为null，不发布建设或采运需求。保存去返估计及校验原因；坐标fallback不能满足“目标可见路线”条件。

只有出生、实际位移、目标房视野、连续100安全ticks和可见路线全部满足，才冻结为completed。该结论只代表侦察试点完成；实际采运、下一tick卸货、收益及10000tick验收仍为未完成。

现有工位避让及一次重规划保持原样。自然未出现受阻恢复时标记onlineRecoveryCovered=false；不得为补覆盖主动堵路、移动矿工或制造敌情。不得为了试点完成而修改原leg.startedAt/expiresAt、retryCount或blockedGoalKey。

## 停止、关闭确认和结算

停止原因包括：总tick/墙钟到期、人工hold/禁用、版本/epoch/配置变化、母房核心/Controller/危险异常、接收目标丢失或free<20000、外来占领/预定、目标敌情、无合法路线、绑定actor死亡/身份异常、重试耗尽、leg过期、孵化结果unknown、额外actor/请求、状态非法或观测断档。

第一次停止时冻结原因和证据，进入stopping，立即将本轮出发及孵化许可置false，关闭目标房enabled并hold。在v1仅单一操作且没有其他enabled房间时，同时关闭remoteMining总开关。出现额外人工配置时只关闭本scope并记录module_shutdown_conflict，不覆写其他房间；因此“目标已停止”与“总开关已回读关闭”分别记录。

取消本trial尚未执行的SpawnDemands、REQ_SPAWN事件和非executing grant；清除不允许继续的outbound task。intake后明确not_called的本轮pendingTask按上一节退款；其他executing/调用结果不明的grant、费用回执、reservation及其他scope记录保留。既有cancelQueued按remoteId范围较宽，接入时应增加trial/request过滤，不能无区别调用清除所有remote请求。

允许既有受限安全返程：它是独立返程leg，受自身原期限、一次重规划和母房安全门槛约束；不重置旧outbound leg再试，不强制移动、杀死或回收单位。已实际开始的孵化不取消，不把留在母房的scout误认为仍在继续侦察。

下一tick重新读取实际配置与派生许可确认关闭，记录closeAppliedAtTick和closureVerifiedAtTick。关闭尚未确认时不报告completed/aborted已完全收口，也不允许新轮次。后续人工同请求重启开关仍由托管锁拒绝出发。

终局的verdict、stopReason和证据不可改写。迟到费用回执可在独立settlement摘要中从unknown补为known，保留结算tick，不能反向把失败变成成功。EmpireMetrics只读导出当前/上一轮紧凑摘要，不写目标定义，不把冻结结果变成启动授权。

## 验证与交付门槛

先写生产调用链RED回归，再分批实现。至少覆盖以下反例：

| 反例 | 必须行为 |
| --- | --- |
| 功能默认关闭，无request/无旧托管scope | 不创建会话、不发布试点需求，既有非托管流程兼容 |
| 请求提前、错过启动tick、sequence重放、schema损坏 | 提前只等待；过期/重放/损坏拒绝；不擦除旧证据 |
| global重载、Memory序列化、CPU调度跳过P2、观测tick断档 | 不续期；缺事实拒绝；守卫可停止，断档不得拼窗口 |
| 到期当tick、intake后撤权、已有MOVE_TO任务 | spawnCreep和出房move均不执行；not_called退款且不记unknown |
| 同request多事件/两Spawn、OK后中断、死亡后普通替换策略 | 一轮至多一名成功scout；未知结果保留claim，不再孵化 |
| spawning/accepted/Memory幽灵混合、退休实体、旧过期scout | 正确区分实体与证据；不清理旧状态来取得新额度 |
| OK但位置未变、同tick重复观测、无视野、历史safeTicks=100 | 不提前确认移动、连续安全或完成 |
| retry耗尽/无旁路/leg过期、危险/Controller/接收不足 | 动作前停止；原leg和既有预算不变 |
| 100安全ticks及可见路线通过、随后手工重启同请求 | 停止且冻结结果；同请求不能复活 |
| 结束时executing grant未结、其他scope请求/配置存在 | 不误删账本或其他scope；关闭与结算状态分别记录 |
| release时仍有scout/孵化/未结grant，或只把guard设false | 不解除托管；合规显式release只解除锁，不启用采运 |
| 保护开关变化、墙钟回退/不可用、游戏暂停后恢复 | 停止；不重置控制值，不承诺暂停期间能执行关闭 |

完整npm test、smoke、room-governor、仅构建及diff检查通过后，保留本地交付记录。后续发布和有限侦察分别需要明确授权；本地GREEN、上传、只读快照、侦察完成和实际采运验收分别报告。

预期改动集中在：新增纯模型及守卫service，接入main/P0列表、EmpirePolicy默认配置、RemoteMiningService、SpawnService、RemoteMiningStrategyService、EmpireMetricsService，以及对应fixture/回归和模块说明。MetricObservationWindow、费用确认算法、资源市场与Goal/Plan业务保持原有职责。
