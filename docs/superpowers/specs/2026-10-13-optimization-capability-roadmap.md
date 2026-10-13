# Screeps 优化与能力补全路线图

日期：2026-10-13。此文取代旧路线图中的“当前缺口”和“下一步建议”，作为本轮盘点与后续阶段的审阅入口。

## 事实基线与验证边界

- 工作目录：`D:\MyCode\screeps_world\automatiseerimise_impeerium`。
- 开始时重新核验：`main`，HEAD `738c4f0a42e70cc7943cabd132e26de449377139`，工作区干净。
- 适用指令：用户给出的全局协作原则、`src/AGENTS.md`、本轮改动目录的 `src/services/AGENTS.md` 与 `src/tests/AGENTS.md`。盘点另参考 `src/core/AGENTS.md`，没有修改其代码。
- `npm ls --depth=0`：Rollup 4.60.4、clear 2.0.7、copy 3.5.0、screeps 1.0.1、Screeps types 3.4.0、lodash types 3.10.1 均已安装。本轮不增加依赖、不修改锁文件。
- 本机 `node.exe --version` 为 v16.15.0，npm 为 8.5.5；`node` 优先解析到 `C:\nvm4w\nodejs\node.ps1`。独立诊断用 `node.exe`。已安装 Rollup 的 engines 要求 Node >=18，当前工具链存在版本合约偏差；本轮测试/构建通过不能消除该偏差。后续应在独立进程使用满足 engines 的运行时复验，不擅自切换共享 NVM 配置。
- 修改前 `npm test` 的 smoke、room-governor 两个入口通过；本轮修复后再次通过。`npm run build` 在 `DEST` 不存在时通过，输出明确为只编译、不上传。最终检查还包括两个 Git whitespace 检查。
- 本轮仅本地代码、mock 回归、构建与文档盘点；没有读取线上房间样本，没有在线 CPU/Memory 基线，没有改在线 Memory、提交、推送或部署。
- 所有“已实现”均表示代码存在且已说明本地验证范围，不能据此推断线上业务验收完成。

## 当前机制与职责

主循环为 `MemoryConfig -> telemetry/scheduler -> 所有 init -> 所有 analyze -> EventBus.dispatch -> 所有 run -> ActionParser -> 所有 cleanup -> telemetry.finishTick`。服务数组的先后影响同一阶段的数据依赖，并不是某个服务完成所有阶段后才执行下一个服务。

| 子系统 | 已存在机制和源码证据 | 实际边界 / 剩余缺口 |
| --- | --- | --- |
| 房间阶段 | `RoomPhaseService.buildPhase/energyPostureFor` 提供 bootstrap/early/storage/terminal、spawn rescue 滞回、物流模式、建设/维修压力 | 现有执行策略入口；不是 Governor 生命周期状态机 |
| Governor | `RoomGovernorFacts` 标准化事实；`RoomGovernorModel` 纯计算生命周期、健康、能力、预算与建议；`RoomGovernorService` 低频影子采样 | 只覆盖己方可见房间；budget.energyCap 为 null，weight/posture 不是已执行能源限额；不覆盖远程、殖民 |
| 孵化 | `SpawnBureauService` 汇总经济角色和 SpawnDemands；`SpawnService` 消费事件、执行 spawn、保存/恢复备份 | hauler 仍按 1/2/3 只、builder 最多 2 只；upgrader 有 Controller container 时 1 只，否则 storage 房 2 只；repairer 按 maintenance backlog。不是全面能力接管 |
| 能力接管 | `SpawnCapabilityArbiter`、`CapabilityRolloutReadiness`、Bureau 的 `applyUpgradeWorkArbitration` | 仅经济 upgrader 精确 quota；默认 shadow。旧 intent 始终保留为采样及回退基线 |
| 房间物流 | `ResourceMarketService.buildRoomMarket/requestResource/assignHauler` 扫描 dropped、structures、creep stores；按 demand 优先级撮合，精确矿物取量与 energy 批量取量分开 | 预留 TTL=5；供给一旦预留整个 supply 暂时不可用，需求按 quantity 减预留。尚无执行回执闭环、跨房物流和 tombstone/ruin 常规扫描 |
| 物流空壳 | `LogisticsService.js` 仅继承 BaseService；主循环没有注册、源码没有消费者 | 本轮明确保留但不接入，不作为已实现能力；跨房阶段先设计与 ResourceMarket 的职责，不能凭类名补功能 |
| 角色 | `BuilderStrategyService.assignBuilderTask` 无工地时升级；repairer 维护至目标血量；miner/scout/reserver/remoteMiner 有策略入口 | builder 空闲维护是旧文档偏差；不因此扩展 buildWork/repairWork 接管 |
| 城市与资产 | `CityPlanSchema` version=4；migration/debug/readiness/rollback 有受控 legacy 边界；LinkService 与 StructureLifecycleService 已接入 | source->Controller Link 转运；1500 stable ticks 等条件后的 Container 退役及销毁。hub/storage Link 完整网络与所有资产闭环不能视为已交付；road 可推进生命周期，但该 destroy 路径只销毁 Container |
| 遥测与 CPU | RuntimeTelemetry 服务/阶段耗时、低频 EWMA；EmpireMetrics 房间/物流/upgradeWork 摘要；ServiceScheduler bucket 姿态和 wouldRun | scheduler.enforce=false；没有线上 p95、Memory 字节序列或热点证据；telemetry.enabled 当前未被 RuntimeTelemetry 消费 |
| 远程采矿 | RemoteMiningService 发 scout/reserver/remoteMiner 请求，MinerStrategy 和 ActionParser 执行移动/预定/采矿 | 缺远程运输、危险暂停/恢复、收益账；scout/reserver 请求未统一纳入有 quota 的需求仲裁，需验证重复请求、失去视野和重置恢复 |
| Lab / Market | Lab 手工 labTask 的 PREPARE/REACTING/EMPTYING；Market 每 10 ticks 在 enabled 时按最高名义价格卖 energy | 没有库存自动排产/boost；手续费只做可付检查，不优化净价，成交后最低储备未做完整策略保护。市场默认 enabled=false |
| 安全与战争 | WarIntel/WarStrategy/CombatPlanner/Security/Tower/Defender 有本房情报、姿态、战斗计划和执行 | 危险区域虽传入计划，不能等同所有经济路径消费危险成本；没有完整跨房军事、长期敌人画像及自动 safe mode 合约 |
| 帝国控制 | EmpirePolicy、override、control schema、事件摘要存在 | Goal/Plan/EmpireDirector、claim/colonize、Terminal 多房平衡、mineral 采运、Factory/Power/Observer 无完整实现；autoExpansion/autoMarket/autoWar 字段无对应完整执行接线 |

## 首阶段：已确认合约修复

详细步骤见 [孵化能力合约修复计划](../plans/2026-10-13-spawn-capability-contract.md)。采用现有生产者和消费者，未引入全局 registry。

### 数据流和问题影响

1. Governor 的 analyze 早于本 tick 的 spawn run；未 dispatch 的事件和 pendingTasks 只是计划，不能算成功能力。
2. spawnCreep 返回 OK 后，SpawnService 同时写入 Memory.creeps、孵化备份及 acceptedSpawnNames；下一次 analyze 可见 upcoming。原备份不保存 body，真实生产方记录中的 2 CARRY 在 Governor 被统计为 0。
3. Game.creeps 中的 live spawning 原先计入 stable；cleanup 获得有效 memory 后就可能删除备份，不能依赖备份持续标识孵化状态。[官方 Creep.spawning API](https://docs.screeps.com/api/#Creep.spawning) 明确提供这个状态。
4. 加 body 后若未去重，同名 live/backup 能力可重复；Bureau 的 Memory/backup 本就存在重叠计数，countQuota 还可能让 retiring live 的备份重新覆盖 quota。
5. 正确性影响：facts 的 current/spawning 分层、gap、健康、影子采样和潜在 active 判断；不能把补 body 简化为“线上所有孵化能力原先都为 0”，原 live 路径仍会计入 current。

这里的 retiring 是 TTL 替换窗口。`CreepRetirementService` 的 `memory.retire/idle_surplus` 是另一个机制，在角色派活后检查闲置、卸货再 suicide；Governor/Bureau 当前不按这个标记扣减能力。本轮未合并这两种语义，下一统计审计需覆盖主动退役的卸货与死亡时序。

### 本轮修改

- SpawnService 备份顶层新增 body 数组副本；不写入 creep.memory，不改变 expireAt/恢复/cleanup。
- Governor 按 live spawning / stable / retiring 分组，再仅为不存在 live 对象的名字补充未过期备份。live 始终优先，避免退役单位被备份重新计为 upcoming。
- Bureau 备份仅补充既没有 live、也没有 Memory.creeps 的名字；role/quota 按身份去重，不改变配额公式。
- 本地回归走真实 `init -> EventBus.publish/dispatch -> SpawnService.run/cleanup -> collectRoomGovernorFacts -> evaluateCapabilityGaps`，只 mock 游戏外部 spawn 接口。不是手工补 body 的理想 fixture。
- 已观察 RED：backup CARRY `0 != 2`，live spawning current `2 != 0`，retiring quota `1 != 0`，Memory/backup role `2 != 1`；随后 GREEN。
- 边界覆盖：queued 未成功、成功且 live 尚不可见、body 请求数组修改、live/backup 重叠、cleanup 删除备份后仍孵化、孵化完成、TTL 替换边界、到期及过期、旧记录、spawn 失败，以及真实 upgrader 的 2 upcoming WORK 让 required=3 的 gap 保留为 1。

### 接管安全检查结果

| 合约 | 当前证据 | 边界 |
| --- | --- | --- |
| 新鲜度 / readiness | globalSnapshot 重算 staleFor；Bureau 每 tick 用固定 schema、当前 lifecycle/age 和当前 policy 重评；测试覆盖缺失/损坏样本和快照过期 | 持久 ready=true 不独立授权；线上 freshness 仍未观测 |
| 旧正 gap 重放 | Bureau 对 evaluatedAt < Game.time 的旧建议检查当前非 retiring/upcoming Controller quota；测试覆盖已有履约 suppress 与新快照仍可追加 | 本轮去重修复补齐真实记录边界；仍需真实 accepted 到 live 的 tick 序列验收 |
| Controller | 缺失 downgrade facts 阻止 active；纯仲裁覆盖 emergency keep/replace；阈值默认 5000 | emergency 读 Governor 快照的 downgrade time；评估间隔内跨越阈值的场景需单独回归，不能宣称实时底线已完整验证 |
| fallback / autoSuspended | 完整 legacy 回退；默认连续 3 次触发暂停，安全 active tick 清零；测试覆盖暂停、继续 active 不能自行恢复 | 本地 mock 通过，不等于实际故障注入验收 |
| hold / rearm | enabled=false 或 emergencyDisable=true 保留 active 请求、fallbackCount 和暂停状态；解除 hold 重走门槛；已暂停需 shadow->active 显式转换 | 测试覆盖多 tick hold、解除、暂停前后差异；线上尚未验收 |

旧 bodyless 备份不能凭空恢复真实 body；仍支持 memory.body 的旧记录。未改写在线 Memory。由于 current 不再包含未出生能力，核心健康可能更保守，应重新观察影子样本，不能沿用旧统计直接宣称 readiness 有效。

## 优先级任务清单

| 编号 / 优先级 | 任务与当前状态 | 下一交付 / 验收 | 前置与回退 |
| --- | --- | --- | --- |
| C0 / P0 | 上述孵化合约：本轮已修复，本地验证通过 | 三生产文件、真实数据流回归、四个本地验证入口 | 可单独还原本轮代码；额外 body 字段兼容旧读取 |
| C1 / P0 | 剩余统计边界：未完成审计 | 验证 Memory.creeps 死亡清理前误覆盖、countSourceWorkParts 不消费顶层备份 body 且缺 body 默认 1、Boost/损坏 body 的单位约定；每个确认问题有真实生产流 RED 再修复 | 沿用 C0 身份协议；先不改模型阈值，不做全角色接管 |
| C2 / P0 | 接管时序边界：已有基础测试，仍有场景缺口 | Governor 间隔中 Controller 阈值跨越、spawn 销毁/取消、global reset、缺失 role 恢复、双 spawn 并发与请求重放的逐 tick 测试；核对完整 legacy fallback | 保持 shadow；重要策略变化先独立设计，回退仲裁修改 |
| V0 / P0 | upgradeWork 真实验收：未执行 | 至少 50 个完整 shadow 样本且 ready=true，再经人工显式批准，单房 active 连续 500 ticks；观察 Controller、储备、spawn、gap、fallback | C1/C2；出现风险回 shadow，已 autoSuspended 按 rearm 合约恢复；不得第二房扩围 |
| E0 / P1 | ResourceMarket 预留/配送审计 | 真实 supply->task->ActionParser->next tick fixtures：5-tick 预留到期、途中目标失效、partial unload、双 hauler 竞争、精确矿物取量、spawn rescue；先测取消/履约丢失再设计执行回执 | C0；保留现有 ResourceMarket API，逐项可回退 |
| E1 / P1 | 角色配额与能力模型校准 | 对照实际 body、路径周转与 RoomPhase；解释 Bureau 数量和 Governor CARRY/WORK 建议差异，不直接消除差异；builder fallback 是否占升级预算需策略设计 | E0 和线上测量；公式 shadow 比较，保留旧配额 |
| A0 / P1 | CityPlan 生命周期及迁移验收 | 核对 canonical/legacy readiness、effectiveMode、rollback、Container 退役后 Link 丢失/能源回退、destroy 返回码与恢复；以现有 fixture 为起点 | 不把旧 memory 笔记当当前实现；维持受控迁移与 rollback，真实销毁不可逆需先设计保护 |
| M0 / P1 | CPU/Memory 基线及工具链 | 满足 Rollup engines 的独立 Node 进程复验；只读采集服务/阶段 CPU、bucket、规模、Memory 字节、指标缺失情况，提交测量报告 | 不更改共享配置，不开启 enforce；没数据不优化 |
| M1 / P1 | 遥测 policy 合约 | 独立验证 telemetry.enabled 的实际含义、误差/缺测与 bounded samples 方案；scheduler 各阶段跳过的依赖约束 | M0；新增观测先设计、默认兼容，回退数据字段和采样逻辑 |

推荐紧接 C0 进入 **C1+C2 的本地验证阶段**。它有明确复现入口，不依赖在线访问，也不引入新功能。V0/M0 的线上部分单独等待数据和授权。完成 P0 证据门槛后再实施 E0；这不是一次性执行全部路线图的授权。

## 性能测量及经济校准方法

推荐顺序为“正确性 -> 观测 -> 单热点试验”，不采用“先压缩/重写循环再测 CPU”。若直接启用 scheduler，既有 analyze->dispatch->run 的需求和动作可能断开；当前保持 enforce=false。

1. 记录采样环境：Game.time 区间、代码版本、房间数/RCL、creep/structures/sites/demands 数量、CPU limit/bucket/mode、shadow 开关。正常、恢复、建造高峰分开比较。
2. 先只读使用已有 `global.EmpireTelemetry`、`Memory.empire.control.telemetry/metrics` 与房间 ResourceMarket.stats。EWMA 是平滑摘要，不能充作 p95；若要 p95/Memory 曲线，先审阅有长度上限的采样/导出设计。本地墙钟和打包耗时不替代游戏 CPU。
3. 初始测量窗口建议至少 2000 ticks，并覆盖一次角色替换/建设变化；这是待审阅的测量方案，不是已完成样本数。持续记录 total/service-phase CPU、错误、bucket、Memory 序列化字节、物流不可履约与空闲率。
4. 仅根据实际占比选一处热点。静态候选包括多服务重复 creep 遍历、ResourceMarket room.find/排序、Link 查找、Governor 每 tick facts 收集（模型虽低频，facts 仍每 tick）；这些尚不是已证明的瓶颈。
5. 优化验收须使用相近规模与 posture 的前后窗口，报告样本量、CPU 中位数/p95 与 Memory 增量，预先约定最低改善及允许噪声；同时要求本地门禁通过、经济与安全指标无退化。无法建立可比窗口就不宣称优化收益。

## 后续能力拆分：逐项设计、交付、验收和回退

下表为候选阶段边界，均未授权本轮直接实现。每阶段先写可审阅 spec，再写精确实现计划；新增状态需要版本、预算释放、故障恢复和 bounded history。

| 阶段 / 能力 | 现状 | 前置依赖 | 具体交付与验收 | 回退方式 |
| --- | --- | --- | --- | --- |
| R1 远程采矿运输 | 请求/移动/采矿部分存在 | C1/C2、E0；跨房 home/base/target 身份、可达且有时效的路线 | 单远程 source 的 remote haul、container/road 工单、reservation 续约和唯一 spawn quota；fixture 证明运输抵达母房、无重复请求、失去视野不乱发任务；单矿实际运输验收 | 单矿 enabled=false，停止新需求并让在途 creep 安全返程，保留本房经济 |
| R2 远程危险与收益 | 尚无闭环 | R1、带 observedAt/TTL 的情报与危险路径 | active/suspended/recovering 状态；计入实际 delivered energy、spawn body/运输/维护/预定成本和 CPU；入侵/视野失效停止派出，安全滞回后恢复，低收益暂停；危险回放与线上账核对 | 人工 hold，保留账和最后安全路线；撤回而非立即自杀 |
| G1 Goal/Plan | 仅蓝图 | P0 验证；定义资源/spawn 预算的 reservation/release | 长期 goal/plan 的 running/paused/completed/failed/cancelled、期限/进展证据、幂等步骤、重置恢复；取消/超时释放预留，目标与方案分离 | 默认 shadow、停执行器；仍由旧本房服务运转 |
| G2 EmpireDirector | 仅蓝图；policy 架构已存在 | G1、房间健康、世界情报、测量与跨房容量 | 低频战略姿态与可解释预算，消费人工 override；先只输出候选 plan；测试人工覆盖、CPU/经济危机降级与过期策略 | 禁止产生/推进新 plan，清晰释放外部预算 |
| X1 自动殖民 | 无 claim/colonize 任务闭环 | G1/G2、候选评分、GCL/claim slot、安全路线、多房 spawn 支援 | 首先单个指定候选房：claim->spawn site->支援运输/建造->本房采矿物流自给；实现 claim 执行/TaskGuard 合约，超时与母房不足暂停；模拟全阶段及单房线上验收 | 取消新 claim/支援请求，安全撤回；不自动 unclaim 或销毁结构 |
| T1 多房 Terminal 平衡 | 无调拨控制器 | E0、库存保底、G1 预算、至少两己方 terminal | room/resource 目标水位、quantity 预留、手续费、cooldown 与 send 回执；双房不足/并发/失败回放，无重复发送、无负库存、保底不被穿透 | 默认禁发或 shadow；人工停发送，已完成交易保留账 |
| I1 Mineral | 有 mineral cache/extractor 规划入口，无采运闭环 | E0、RCL/Extractor/矿物成熟条件、库存及出口容量 | mineral worker body/strategy/TaskGuard、采集->运输->库存；无矿、冷却、满仓时暂停；模拟再单房收货验收 | 停新孵化/采集，既有搬运安全收尾 |
| I2 Lab 自动排产 | 手工状态流程部分存在 | I1/T1 库存视图、E0 精确配送、G1 计划 | 目标产物反推 reagent、合法 Lab 布局、污染清空、反应回执/产量、超时重试；缺料/错料/满仓/冷却/重置回放；单批真实产量验收 | 保留手工 labTask；停自动任务，不擅自丢弃库存 |
| I3 Boost | 未实现 | I2、creep spawn/出发时序、战斗/经济需求模型 | boost 请求、资源/能量预留、等待期限、boost 完成核对，超时允许指定无 boost fallback；确认实际 body.boost 与任务退出 | 默认禁用新 boost，释放预留并恢复可接受的普通任务 |
| I4 Market | 能量出售部分实现 | T1 库存/手续费保底、G1 预算与交易账 | 净价排序、credit/库存上下限、买卖限额、订单过期与成交回执；local fixtures 不穿透能源/信用底线，报价先 shadow，再有明确金额上限的单房验收 | Market enabled=false；已成交不可撤回，不自动撤单/再成交补偿 |
| H1 Factory | 无完整实现 | G1、库存/Terminal、commodity 配方、所需 power level | 单条生产配方、批量预算、冷却、耗料/产物回执、缺料暂停；单批收支验收后再扩生产树 | 停生产计划并释放预留，保存库存 |
| H2 Power | 无完整实现 | energy/power 库存保底及 G1；PowerCreep 为独立后续范围 | 先 PowerSpawn 供给与限额 processPower，再独立设计 PowerCreep 生命周期；保底不足停机、过程回执与 GCL/GPL 对应账核对 | 停处理与新补料；不自动删除 PowerCreep |
| H3 Observer | 无完整实现 | 世界情报 schema/TTL、G1/G2、CPU 测量 | 观察队列、优先级、观察延迟与 observedAt，接入远程/殖民新鲜度；模拟过期情报，线上核对下一 tick 视野 | 停观察调度；情报过期后相关计划安全暂停 |
| W1 跨房安全 | 本房防御部分存在 | R2/H3 时效情报、安全路线、统一任务取消 | 经济单位共享危险路径/撤离目标，长期敌人画像；再独立设计 safe mode、rampart 站位与 Tower 精细化；模拟绕路/路线失效/恢复及小范围线上验收 | 停向危险房派遣并退回本房防守；safe mode 消耗不可撤回，不能用回退代码声称恢复资源 |
| W2 战争/防核 | 仅蓝图与本房骨架 | W1、G1/G2、I3、能源及跨房 spawn 预算 | 单作战目标、集结/协同/撤退/终止、nuker 储备及防核；先 shadow 计划和确定性回放，再单目标明确授权 | 人工取消新进攻并撤退，保留防守；不自动发动核打击 |

依赖主线：`C0 -> C1/C2 -> E0`；`V0/M0` 与本地审计分开；之后 `R1 -> R2`、`G1 -> G2 -> X1`，库存支线 `T1/I1 -> I2 -> I3/I4`，再推进 `H1/H2/H3/W1/W2`。G1 的首个 pilot goal 可采用一个已受控的远程矿，避免先造没有执行证据的万能计划系统。

## 阶段门禁和首次交付状态

本轮只完成 C0 及路线图校正。C1/C2/E0 等仍是排好优先级的下一任务，不把“已列入计划”当成“已完成”。路线图没有启用 active、scheduler enforce 或高级自动化，也没有扩展 builder/repairer 接管。

每个实施阶段必须先确认相应指令和 Git 状态，复现其真实入口，必要时先 RED，再执行 `npm test`、`npm run build`（DEST 未指定）、`git diff --check`、`git diff --cached --check`。真实验收另附 Game.time、房间、代码版本、样本数和失败/回退记录，不能用本地 mock 代替。
