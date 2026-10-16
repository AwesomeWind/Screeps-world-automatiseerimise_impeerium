# 固定采矿工位占用与重规划未避让：证据和方案

日期：2026-10-16。用户要求先调查、给出有证据的方案、补充回归；侦察、采运和Goal/Plan保持关闭，不提交或部署。

本轮完成只读取证、历史帧审计、生产链故障复现、单变量对照和修复目标RED。生产源码、默认测试入口及线上Memory没有改动；HEAD仍为b43b736，部署逻辑仍是fe061d4/SERVICE_VERSION=1792128523514。

## 结论

**固定工位持续占用已证实；重规划确实运行了，但其输入仍没有creep占用，所以再次选择同一格。** 不是一次重试没有触发，也不是需要延长原期限才能继续走。

| 事实 | 证据 |
| --- | --- |
| 受阻期间矿工一直占用(43,30) | 房间历史覆盖100帧；与20份原生scout样本对齐后，Game tick83677646—83677659连续14ticks，矿工始终(43,30)、scout始终(42,30) |
| 这是正式采矿工位 | 原生tick83677951：cityPlan.workPositions.sources[5bbcaa619099fc012e6313d9].mining.primary=(43,30)；同一矿工role=miner、sourceId匹配、memory.miningPos也为(43,30) |
| 静态层本身不是该点的阻挡原因 | 同tick读取terrain=plain；叠层为road、container、己方rampart，my=true |
| 第二次路径仍进入该格 | 复试tick83677653消耗唯一重规划；其后lastMoveAttempt.pathFirst=(43,30)，仍返回OK但没有位移 |
| 矩阵没有占用信息 | RemoteMiningRoute的roomCallback只读结构和dangerZones，没有creep、miningPos或task.workPos |
| 存在替代几何通路 | 当前原生同tick A/B：原矩阵首步(43,30)、9步；仅额外封锁该格后首步(41,29)、13步，均incomplete=false |

历史中的矿工id=6ad1ae638630681346028551，名称miner_83676510_Spawn1_0；scout id=6ad1c0748736c54458894ef0。身份和位置都没有靠名称前缀推断。

## 历史帧如何对齐

只读GET /room-history/shard3/W49N41/83677600.json，取得100帧。第一帧为对象全量，后续对象按id更新x/y等字段，null删除对象；此处只复原公开房间对象，不读取或输出完整Memory。

历史帧号与console中的Game.time不能直接视为相同。分别比较-1/0/+1偏移：

| 历史帧号相对Game tick | 匹配数 | 比较数 | 不匹配 |
| --- | ---: | ---: | ---: |
| -1 | 20 | 20 | 0 |
| 0 | 14 | 21 | 7 |
| +1 | 13 | 22 | 9 |

因此按historyFrame=GameTick-1建立对齐。受阻14个Game ticks对应历史帧83677645—83677658，两个单位分别稳定在相邻两格。这个证据比关停后的一次占用快照更直接；没有把历史帧号误当作原生tick，也没有只凭当前矿工位置补写历史。

## 为什么重新规划还是原格

RemoteMiningRoute.js:28起，每次调用都会创建新的CostMatrix。road写成本1，container和己方/public rampart可通行，危险区最后写255。因为没有任何实体占用层，(43,30)始终是便宜的路格。

RemoteMiningStrategyService.moveActor在一次重试时重新调用planRemoteRoute；retryCount和expiresAt控制正确，但除了起点外，没有传入“本次因实际占用受阻、重新考虑当前creep”的信息。重算一个没有占用信息的矩阵，自然仍可能得到同一路径。

既有MinerStrategy将miningPos作为实际站位，并优先选择已建/规划的源容器位置；CityWorkPositionPolicy已有正式工位读取接口，WorkPositionCoordinator也已采用live creep及task.workPos识别工位占用。路线规划应复用这些既有数据语义，而不是另造共享预留账本或抢占母房矿工。

## 原生A/B和本地反事实

原生tick83678115，只读调用PathFinder，起点W49N41(42,30)、目标W48N41(1,25)、最多两房、maxOps3000、plainCost2/swampCost10，与现有路线参数一致：

| 唯一差别 | 首步 | 步数 | cost |
| --- | --- | ---: | ---: |
| 保持现有矩阵 | (43,30,W49N41) | 9 | 17 |
| 母房(43,30)额外写255 | (41,29,W49N41) | 13 | 26 |

这证明当前几何上存在绕路，不必强行移动矿工。它不是当时真实执行过的替代路线；W48N41仍无游戏内视野，远程可见结构、实际跨房和运输仍未验收。正式重试还会遇到其他实时占用，因此13步不是成功保证，也不能用于重置旧leg期限。

本地复用现有RemoteMining→Bureau→Spawn→Market→RemoteMiningStrategy→ActionParser链，使用两条已知合法走廊的最小PathFinder适配器：

1. 当前实现把活矿工工位当道路成本1。
2. 两次实际actor规划都选该格，移动被相邻真实fixture单位挡住，返回OK但不位移，最后retry_exhausted。
3. 仅在唯一重规划的matrix额外写255，scout走旁路，矿工不动，retryCount仍1、原expiresAt不变，没有新远程spawn。

三项刻画/对照均通过。固定坐标只用于诊断和fixture，不是准备写入产品的绕行规则；本地走廊不是完整游戏引擎，也不冒充真实房间布局。

## 建议的有限修复

### 选择

推荐“初次避固定工位、重试避实时占用”。初次就把所有移动单位封死虽然简单，但会让正常交通过度影响出发判定；全局推让/交通调度则超出本次范围。现有合法绕路证据支持先做局部cost层修复。

### 作用范围和调用方

在现有planRemoteRoute的facts中增加可选occupancyMode：work_positions或live_creeps；缺省保持既有语义。新增策略先只由scout使用：RemoteMiningService的入口预检与实际scout首次规划都传work_positions，唯一重规划传live_creeps。

其他角色及纯经济几何估计不在本轮自动启用占用策略，避免直接改变remoteMiner必须到达工位的range0交接协议。未来运输也不能因为这次scout修复就宣布验收。

### 占用层

- work_positions：只封锁可见房间中真实存在、正站在有效memory.miningPos或task.workPos上的其他单位。根据实际runtime工位，不只看cityPlan primary；规划格为空时不封死。
- live_creeps：重试时基于当tick快照封锁其他实体creep，用于绕过临时占用。每次重新构建，不把占用缓存为永久路障。
- 只使用真实Game实体；不把Memory幽灵、accepted/upcoming配额记录当占用。退休中的单位仍实际占格，不能提前忽略。
- 忽略本次起点自身的动态占用，但不能清除已有建筑或危险255。不盲目豁免被别人占据的scout精确落点；range1本身允许停在旁边，无需开放目标格。
- 占用层写在道路成本之后；所有叠层阻挡优先。同步保护road不能覆盖private rampart等255的边界。这是本地另外发现的结构顺序缺陷，不是本次己方rampart造成的原因。

### 继续保留的边界

冷却2ticks、最多一次重规划、原startedAt/expiresAt、maxRooms=2、maxLegTicks<=300、安全和预算gate全部保留。没有可绕路线时停止，不推走矿工、不改其miningPos、不另派scout、不增加尝试次数，也不重启已过期旧leg。

保守代价：重试快照可能把暂时占用的唯一通道判为不可达。这时按既定上限停下并报告，而不是擅自扩展到全局交通接管。

## 回归验证状态

新增诊断回归共18项：10项按预期RED、8项既有边界通过；失败为明确行为断言，不是语法、依赖或fixture报错。生产实现未修改，不能称为修复GREEN。

RED覆盖固定矿工/task.workPos占用、预检与实际调用传播、重试绕过活单位且原期限不变、退休实体仍阻挡、精确目标占用、快照刷新、无旁路停止、private rampart叠层优先。已有边界覆盖空容器/幽灵不堵路、首次不封死普通移动者、range1、默认策略兼容、起点自身及建筑/危险255不被擦除。

这些测试留在本地scratch，未接入默认测试入口。重新运行既有npm test：smoke、room-governor及216/216通过；这只说明既有代码基线未改，不代表本次缺陷修复。

## 文件和完成边界

证据目录：.superpowers/sdd/2026-10-16-route-occupancy-diagnosis/。

- room-history-83677600.json、history-occupancy-audit.json：历史对象及tick对齐。
- characterization.log、same-cell-replanning.json、cost-injection-control.json：3项故障/单变量对照。
- occupancy-regression-red.cjs、regression-red.log：18项方案目标和边界。
- baseline-full-test.log：本轮216项基线。

原生记录位于相邻2026-10-16-w48n41-retest目录：station-1792132509093-1.json、route-comparison-1792133184899-1.json。A/B读取曾有HTTP超时/ECONNRESET，第三次才取得有效结果；失败请求没有当成成功样本。没有改共享代理、节点或TUN。

最新原生tick83678263再次确认：remoteMining.enabled=false、W48N41 enabled=false/hold=true、allowRecon=false、allowEconomicDeparture=false、goalPlanning.enabled=false、Governor shadow=true、scheduler.enforce=false、market=false。旧scout仍在母房等待，未强派或重置原leg。

所有线上请求均为只读查询或瞬时PathFinder计算，没有发送启用/移动/孵化/建设指令，没有启动跟进进程。后续保持关闭，方案审阅后才进入生产实现与RED→GREEN；本轮不提交、推送或部署。因为没有生产实现改动，本轮没有重新构建或改变本地发布产物。
