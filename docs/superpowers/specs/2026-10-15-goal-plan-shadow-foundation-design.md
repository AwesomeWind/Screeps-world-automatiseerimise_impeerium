# Goal/Plan 最小影子闭环设计（已认可）

日期：2026-10-15。用户选择在 terminal 施工等待期间优先规划 Goal/Plan 影子闭环，随后明确要求执行草案。现已完成本地分批实现及验证；不提交、不发布、不写在线 Memory。

## 1. 目标与当前事实

目标是让系统能够解释“正在追踪什么目标、现有方案进展如何、被什么条件阻挡、何时算完成”，并为后续 EmpireDirector 留出稳定接口。

当前主循环已有 RoomPhase、RoomGovernor、RemoteMining、SpawnBureau、ResourceMarket 和 EmpireMetrics；`Memory.empire.control` 已有 policy/runtime/telemetry/metrics/events/rooms。Goal/Plan/EmpireDirector 尚无执行实现。旧 `2026-08-11-empire-command-center-design.md` 是上层蓝图，不能当已交付清单。

单远程矿的代码已经关闭状态部署，但尚未采运验收；因此当前可确定 Goal/Plan 的事实、状态、证据和生命周期合约，不能用未知的远程净收益校准战略预算或自动扩张阈值。

## 2. 方案选择

| 方案 | 收益 | 代价/边界 |
| --- | --- | --- |
| A：纯事实适配＋纯状态模型＋只读影子摘要（推荐） | 可离线复现，复用现有执行层，适合等待期设计 | 不会自行推进游戏动作；后续仍需明确接管协议 |
| B：直接建设通用工作流引擎并接管孵化/物流 | 功能范围大 | 缺少远程经营实测输入，易重复实现已有预算、任务和回执 |
| C：继续增加外部监控规则 | 能快速提示个别目标 | 不形成游戏内长期目标合约，也无法自然支持未来计划切换 |

选择 A。第一版只闭环一个目标类型 `prepare_receiving_capacity`，用母房接收空间作为真实案例；EmpireDirector、多房选择、殖民、产业和战争均不进入本版。

## 3. 首个目标的明确语义

输入由显式目标定义提供，例如 goalId=`receiving-capacity:W49N41`、roomName=`W49N41`、kind=`prepare_receiving_capacity`、requiredFreeCapacity=20000、priority=60。priority仅用于影子列表排序，不传给 SpawnBureau 或 ResourceMarket。

第一版接收目标限定为目标母房的真实己方 terminal，不把满 storage、terminal 工地或预测容量视为完成。

完成条件：同一代码版本下，两份capturedAt不同且相隔至少10 ticks的新鲜事实，均见到真实 terminal、合法接收 id、freeCapacity>=20000。每份事实须age<=20 ticks；重复使用同一capturedAt的事实，即使now前进也不增加次数。未来时间戳、缺版本、未知所有权或未知freeCapacity均不能判完成。

阶段建议仅为：`waiting_structure`（等待现有施工）→`waiting_capacity`（已建成但空间不足）→`ready`。不创建工地、不分配builder、不运输或清空库存。

当前接收条件与历史完成记录分开：Goal首次满足后保留 achievedAt/完成证据；后续每次仍重算 currentReadiness。容量下降、事实失效或版本变化后，当前门槛必须重新核验，不能凭历史 achieved=true 开启远程矿。

## 4. 数据与职责

- Goal定义：id、kind、roomName、priority、requiredFreeCapacity、createdAt、可选绝对expiresAt。定义非法则拒绝，不猜默认目标房间或容量。
- Goal状态：proposed/tracking/blocked/achieved/cancelled/expired，以及reasonCodes、lastEvaluatedAt、lastProgressAt、achievedAt和有界完成证据。
- Plan是该Goal的观察方案：id=`goalId:observe:v1`、goalId、revision=1、phase、status=watching/blocked/succeeded/cancelled/expired、lastEvidenceAt。首版不自动更换或重试执行方案。
- `budgetProposal=null`、`budgetAllocated=0`、`retryCount=0`。不能将其显示为资源已预留或任务已执行；首版不与真实预算账本建立占用关系。
- 当前tick的完整派生摘要只放global；长期最小状态将来存入蓝图已有命名空间 `Memory.empire.control.goals` / `plans`，不迁移现有Memory.rooms数据。
- goals的单条记录分为definition与state；`control.goalPlanningState`仅保存schemaVersion=1、最近评估身份和有界events。未知schema不自动覆盖或迁移，报告unsupported_schema。
- 每类最多20条记录，事件最多50条，单条reasonCodes最多8个。满额拒绝新定义并报告registry_full，不删除仍有效的目标或计划。

## 5. 最小模块边界

| 拟议模块 | 职责与接口 |
| --- | --- |
| governance/GoalPlanFacts.js | `collectGoalPlanFacts({roomNames, now, codeVersion})`；读取Game与新鲜RoomPhase摘要，输出可序列化事实和errors，不写Memory |
| governance/GoalPlanModel.js | `evaluateGoalPlan({goal, plan, facts, now, policy})`；纯计算下一状态、当前门槛、阶段建议和变化事件 |
| governance/GoalPlanRegistry.js | 校验定义、去重、保存有界状态；保留原createdAt/expiresAt，不因reset或重试续期 |
| services/GoalPlanService.js | 在明确启用的shadow模式下编排事实和模型，写最小影子记录；没有执行层调用 |
| EmpireMetricsService | 仅附加数量、阻塞原因与当前门槛的compact摘要，不复制完整records |

先完成纯模型与离线fixtures，再考虑游戏服务接线。服务analyze拟放在RoomGovernor之后，消费本tick Game/RoomPhase事实；CPU finishTick仍保持现有顺序。CPU和Memory成本必须以测量结果报告，不能从当前默认间隔推断性能已达标。

## 6. 事实缺失、恢复与生命周期

- RoomPhase恢复信息缺失/过期，或母房进入恢复：Plan报告blocked/unknown，不把“暂不建设”记成执行失败，不增加重试或发补员请求。
- 工地progress增加只是进展证据，不能满足真实terminal门槛。工地消失而terminal不存在时报告unknown/blocked，不能直接推断完成或永久失败。
- 同tick重复评估不增加成功采样次数，不重复写状态变化事件；版本切换、过期事实或不满足条件时清除当前成功采样计数。
- global reset后从最小持久记录继续；历史完成证据保留原版本，新的currentReadiness不沿用旧版本计数。
- 显式取消只终结影子Goal/Plan，不取消真实creep任务；可选expiresAt是绝对Game.time，不能自动延长。
- disabled时保留既有记录、清除当tick可用影子输出并标记inactive，不借旧快照宣称条件仍成立；重新启用后重新核验。
- 实施裁决：现有schema=1元数据增加needsFreshEvidence标记，关闭/非法policy时仅标记重新核验，不改Goal/Plan记录。超过maxFactAge的采样空档或接收id改变也重新计数；原createdAt/expiresAt不延长。

## 7. 接管边界

新增policy建议为 `goalPlanning: { enabled:false, mode:'shadow', interval:10, maxFactAge:20, readySamples:2, maxGoals:20, maxPlans:20, eventLimit:50 }`。不提供active模式分支；现有autoExpansion/autoMarket/autoWar字段不得间接启用它。

不自动生成线上目标、不写在线目标定义、不消费CLI/console命令。最初使用离线fixture中的显式定义；若未来进行游戏内影子试点，目标定义、启用和发布均需另获授权。

不调用EventBus发布spawn/resource需求，不调用assignTask或游戏动作，不改Governor shadow、scheduler.enforce、市场和远程矿开关，不复用远程预算当作Goal预算。

## 8. 分批交付与验收

1. 事实与契约：显式输入、真实terminal和工地的区分、时间/版本/缺失值处理。
2. 纯状态模型：progress、blocked、当前门槛、历史完成、取消/到期、重复评估和reset；先RED再GREEN。
3. 有界注册表与默认关闭的影子服务：生命周期接线、disabled、容量上限、去重和compact摘要；证明零执行层副作用。
4. 完整测试/构建及维护者检查，输出本地交付报告；不自动提交或部署。

必须覆盖：工地到100%但结构未见、free=19999/20000、重复capturedAt不算两样本、过期/跨版本事实、容量下降、工地消失、房间失去视野/所有权、恢复期阻塞、取消/reset/到期、20记录与50事件上限。Goal/Plan模块自身的spawn/resource/creep/action调用必须为0；真实主循环与禁用影子层的同一fixture对照，原有执行事件/动作清单必须一致，不能要求整个旧系统停止动作。

## 9. 等待期间与主线的并行关系

本设计和离线测试设计不依赖terminal完工，可在等待期审阅。真实远程矿收益、CPU成本、容量接收和路线门槛仍由原只读跟进及后续试点提供；不能用影子Goal的完成替代原生路线、情报、安全或真实采运验收。

terminal监控保持独立：正常进度不通知；建成或异常用中文说明；建成后再验证W48N41路线；远程矿始终关闭。待远程矿试点积累事实后，再另行设计EmpireDirector的优先级、预算与自动选计划。
