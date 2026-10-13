# Automation Empire Roadmap

> 2026-10-13 校正：本文件保留早期路线图背景，下文的缺口和推进顺序是 2026-06-05 的历史判断。当前事实、优先级和阶段验收以 [2026-10-13 优化与能力补全路线图](2026-10-13-optimization-capability-roadmap.md) 为准。RoomPhase、建设排序、区间维护、Link 和受控 Container 生命周期已经有代码，不应重新作为缺失模块实施。

## 背景

当前代码已经能支撑单房早中期运转：基础采矿、搬运、升级、建造、维修、集中孵化、资源需求分配、基础防御、房间规划、道路规划和维护规划都已经存在。近期修复的 repairer 问题说明，系统已经进入“能跑起来，但需要更清晰阶段判断和长期策略”的阶段。

这份文档用于记录后续推进方向，避免每次新增能力都只按局部问题临时修补。目标是让自动化帝国从“单房稳定”逐步推进到“可扩张、可多房协同、可长期优化”。

## 当前能力基线

### 经济闭环

- `miner` 已经能绑定 source 和 mining position，执行定点采矿。
- `hauler` 通过 `ResourceMarketService` 消费 supply/demand，承担主要物流。
- `upgrader` 支持 controller container 的 stationary 工作模式。
- `builder` 优先 construction site，无工地且存在 Controller 时执行升级 fallback；当前不消费维护任务。
- `repairer` 已支持实时校验维护目标，并持续维修到 `targetHits`。
- `SpawnBureauService` 已集中处理经济角色和战争角色的孵化仲裁。

### 房间规划

- `CityPlannerService` 规划 base center、source/controller container、extension、storage。
- `RoadPlannerService` 规划核心道路网络。
- `DefensePlannerService` 规划 tower、rampart、wall、gate 和 defense build queue。
- `MaintenancePlannerService` 输出维修目标和优先级。

### 防御系统

- `WarIntelService` 统计敌方威胁、我方防御强度和危险区域。
- `WarStrategyService` 输出房间战争姿态。
- `CombatPlannerService` 把战略转为 defender 可执行计划。
- `DefenderStrategyService` 能执行集结、撤退和攻击任务。
- `TowerDefenseService` 能攻击敌人、治疗友方、维修紧急防御目标。

### 高级系统入口

- `RemoteMiningService` 已有 scout、reserver、remoteMiner 的请求入口。
- `MarketService` 已有最小能量出售逻辑。
- `LabService` 已有基于 `room.memory.labTask` 的手工反应流程。

## 阶段目标

### RCL1-3：生存与稳定

目标是保证房间不断电、不乱孵化、不因为维修或建设拖垮经济。

当前缺口：

- 缺少统一的房间阶段判断。现在各服务分别用 `storage`、`energyCapacityAvailable`、角色数量等条件判断阶段，长期会导致决策不一致。
- 维护策略还偏“满血维护”。道路和 container 更适合区间维护，避免轻微掉血就进入维修队列。
- construction site 没有统一优先级。builder 目前更依赖 `room.find(FIND_CONSTRUCTION_SITES)` 的自然顺序。

建议新增能力：

- `RoomPhaseService` 或等价模块，输出 `bootstrap / early / stable / storage / terminal / empire` 等阶段。
- 经济健康度指标，例如 `energyCritical`、`storageEnergyLevel`、`logisticsMode`、`constructionPressure`、`maintenancePressure`。
- 道路和 container 的区间维护策略：低于下限才入队，修到上限即停。
- 建设优先级队列：spawn/extension/tower/container/storage/road/rampart 等按阶段排序。

验收标准：

- 所有经济服务读取同一份阶段状态，而不是各自重复判断。
- road 不再因为轻微掉血持续占用 repairer。
- builder 在同一批工地中优先建设最影响经济闭环的结构。

### RCL4-5：Storage 经济

目标是从“维持房间运转”升级为“提高吞吐效率和资源缓冲”。

当前缺口：

- 物流仍主要依赖 hauler 直接搬运，缺少 link 网络。
- hauler 数量仍偏固定规则，未充分按距离、吞吐和压力估算。
- storage 缓冲策略较弱，缺少明确能量储备、升级限速和 builder/repairer 能量预算。
- tombstone、ruin、敌人掉落资源的回收价值还没有纳入常规物流。

建议新增能力：

- link 网络规划与执行：source link、controller link、storage link。
- storage 能量水位策略：最低储备、升级预算、建设预算、维修预算。
- 物流吞吐估算：按 source 产量、路径距离、carry parts、任务周转估算 hauler 需求。
- tombstone/ruin 回收 demand/supply 扫描。

验收标准：

- storage 房间能稳定维持 spawn/extension/tower 能量供应。
- controller 升级速度可按 storage 水位动态调节。
- hauler 数量随房间距离和吞吐压力变化，而不是只按固定数量。

### RCL6：Terminal / Lab / Market

目标是开始管理矿物、交易、实验室和跨房间资源流动。

当前缺口：

- `MarketService` 只会出售多余 energy，没有完整买卖策略。
- `LabService` 需要手工设置 `labTask`，没有自动排产和库存判断。
- 没有 mineral harvester / extractor 经济闭环。
- terminal 没有多房资源平衡策略。

建议新增能力：

- mineral harvester：采集本房 mineral，并将矿物送入 storage/terminal。
- terminal 平衡：按全局库存转移 energy、mineral、boost 原料。
- market 策略：出售过剩资源、购买短缺资源、考虑手续费和最低储备。
- lab 自动排产：从目标产物反推 reagent，检查库存，发布物流需求。
- boost 请求模型：军事或高价值 worker 可请求 boost，lab 根据需求准备资源。

验收标准：

- 房间能自动采矿并把矿物纳入库存管理。
- terminal 不只是卖 energy，而能执行基本资源平衡。
- lab 能从目标产物自动进入准备、反应、清空流程。

### RCL7-8：高级建筑与长期优化

目标是把高级建筑纳入长期经济和战争体系，而不是让它们成为资源黑洞。

当前缺口：

- 没有 factory 商品生产链。
- 没有 power spawn 的 power/energy 供给策略。
- 没有 observer 房间扫描和远程情报体系。
- 没有 nuker 资源储备、防核和打击规划。
- rampart/wall 维修预算还不够长期化。

建议新增能力：

- factory 生产计划：根据库存、市场和冷却管理 commodity。
- power spawn 处理：设定 power 和 energy 水位，按房间经济状态启停。
- observer 扫描：远程房间评分、入侵预警、资源扫描、扩张候选发现。
- nuker 规划：ghodium 储备、防核 rampart 策略、目标管理。
- 防御预算：按 RCL、威胁和能源状况分配 rampart/wall 维修额度。

验收标准：

- 高级建筑只在资源水位允许时运行。
- observer 能持续产出可用于扩张、战争和远程采矿的情报。
- rampart/wall 维修从临时目标变成长期预算系统。

## 多房与扩张

这是从“单房自动化”走向“帝国”的关键阶段。

当前缺口：

- 没有房间评分体系。
- 没有完整 claim / bootstrap / colonize 流程。
- 没有多房 spawn 支援。
- remote mining 缺少 remote hauler、远程 container/road、危险熔断和收益评估。

建议新增能力：

- 房间评分：source 数量、controller 距离、矿物、地形、出口风险、敌人威胁。
- 殖民角色：claimer、colonist builder、bootstrap hauler、bootstrap miner。
- 新房启动流程：claim -> spawn site -> bootstrap energy -> source container -> tower -> storage。
- 多房孵化支援：成熟房间为目标房间孵化远程 worker。
- remote mining 闭环：remote hauler、reservation 续约、远程道路/container、威胁暂停、收益评估。

验收标准：

- 手动配置一个候选房间后，系统能自动完成 claim 和最小经济启动。
- remote mining 能在有威胁时暂停，在安全后恢复。
- remote mining 收益低于成本时能自动降级或停止。

## 战争与安全

当前已有本房间基础防御骨架，但还不是完整军事体系。

当前缺口：

- safe mode 没有自动触发策略。
- tower 逻辑还比较简单，没有按威胁动态权衡攻击、治疗和维修。
- defender 没有 rampart 站位策略。
- 经济单位和战斗单位还没有共享完整 pathing cost。
- 没有敌人记忆和长期威胁画像。

建议新增能力：

- safe mode 策略：判断 spawn/storage/controller 等核心资产是否面临不可逆破坏。
- tower 精细化目标选择：优先击杀 healer/ranged/attacker，必要时切治疗或紧急维修。
- rampart combat：defender 优先站 rampart，避免盲目追击。
- combat pathing：统一危险区域和路径成本，供 miner/hauler/builder/defender 使用。
- 敌人记忆：记录 owner、出现频率、攻击类型、破坏目标，用于长期防御预算。

验收标准：

- 经济单位不会主动穿越已知危险区域。
- defender 在防守时优先利用 rampart。
- tower 在攻击、治疗、维修之间能按当前局势切换。

## 推荐推进顺序

### 第一阶段：统一阶段状态和维护策略

优先级最高，因为它会影响所有后续系统。

工作项：

- 新增 `RoomPhaseService` 或等价 helper。
- 输出房间阶段、经济健康度和物流模式。
- 将 `SpawnBureauService`、`BodyBuilder`、`ResourceMarketService`、builder/repairer 策略逐步改为读取统一状态。
- 实现 road/container 区间维护。

验收标准：

- 早期、storage 前、storage 后的角色配比和 body 决策来自同一套阶段判断。
- road/container 维修不再以满血作为唯一目标。

### 第二阶段：建设优先级和 storage 物流

工作项：

- 建设优先级队列。
- storage 能量水位策略。
- tombstone/ruin 回收。
- hauler 吞吐估算。

验收标准：

- 建造顺序可解释、可调试。
- storage 房间能稳定支撑升级、建设、维修。

### 第三阶段：Remote mining 闭环

工作项：

- remote hauler。
- remote road/container。
- reservation 续约。
- remote threat suspend。
- remote profitability score。

验收标准：

- remote mining 能独立完成采集、运输和风险暂停。
- 远程房间收益能被量化，用于是否继续投入。

### 第四阶段：Terminal / Mineral / Lab / Market

工作项：

- mineral harvester。
- terminal resource balance。
- market buy/sell policy。
- lab auto production。
- boost request model。

验收标准：

- RCL6 房间能自动处理矿物和基础交易。
- lab 不再依赖完全手工流程。

### 第五阶段：多房扩张

工作项：

- room scoring。
- claim/colonize workflow。
- multi-room spawn support。
- bootstrap new room economy。

验收标准：

- 成熟房间能支援新房间启动。
- 新房能从 claim 推进到基础自给。

### 第六阶段：高级建筑和长期战争

工作项：

- factory。
- power spawn。
- observer。
- nuker。
- rampart/wall defense budget。
- safe mode strategy。
- rampart combat。

验收标准：

- 高级建筑运行受资源水位约束。
- 战争系统能支持长期防御和基础反击。

## 近期建议

以下是历史建议；当前首阶段是孵化能力合约正确性及验证边界，见新版路线图。历史上建议先做第一阶段：

1. 建立统一 `RoomPhaseService`。
2. 给 road/container 引入区间维护。
3. 将 builder/repairer/SpawnBureau/BodyBuilder 的阶段判断逐步收敛到统一输出。

这组改动范围可控，收益直接，并且会降低后续实现 storage 物流、remote mining 和 terminal 经济时的复杂度。

