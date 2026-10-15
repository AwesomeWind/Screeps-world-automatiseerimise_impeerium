# 母房接收空间：施工与工位修复

日期：2026-10-15，北京时间。用户要求先解决母房接收空间，再验证 W48N41 游戏内路线，满足条件后给启用方案；远程矿保持关闭。

## 已执行和现场事实

- 线上仍为已发布代码 53f0e4a，SERVICE_VERSION=1792028845945，main SHA256=91fc401f8ee3dc76abf5b3224270f8a0ad4ab537d41c7a4319813c7366db605c。
- W49N41 的 storage 持续为1000000/1000000，市场开关false，没有 terminal。cityPlan 已有 hub_terminal，位置(32,24)、activeFromRcl=6；当前RCL7。
- 游戏内只读 console 核对了实际位置、原生 CONSTRUCTION_COST.terminal=100000、TERMINAL_CAPACITY=300000，允许建造1个，该格只有己方道路和plain地形，原先无工地。
- 依照用户解决容量的要求，于tick83653325仅创建这一处已规划 terminal 工地，createConstructionSite 返回OK，未销毁结构、未开市场、未改控制开关。工地id=6ad037f78f37602edb5b26e8，API已确认在(32,24)真实存在。OK不等于建成。
- tick83653464仍为0/100000。已有 builder_83653371_Spawn1_0，实际6WORK/2CARRY/2MOVE，携带100energy、站在(30,25)，BUILD任务却要求前往被storage占据的(31,24)。
- 同一工地在API中仍为(32,24)，但tick83653458的游戏内脚本读取其pos成为(31,24)。没有认定工地实际移动；这是本tick共享Game对象被执行器改写的证据。
- 最后只读核验：remoteMining=false、Governor shadow=true、scheduler enforce=false、market=false，恢复normal，Controller安全计时150000；核心补员仍受原调度保护。

## 已复现的两个机制缺陷

1. WorkPositionPlanner 以单个structureType覆盖同格记录。实际storage+rampart、tower+rampart会被误认成可站立；已有task.workPos只核对别人占位，没有核对新鲜结构阻挡。
2. ActionParser 的 BUILD/REPAIR 在准备移动时执行 target.pos=workTarget.pos，改变Game.getObjectById返回的真实目标对象，污染本tick之后的工位计算和观测。

只增加建筑不是完整解法；上述执行链需修复，不能靠不断重派坏工位或把0进度解释为正常施工。

## 本地修复与发布前验证

- WorkPositionPlanner：同格聚合时障碍建筑优先，road/rampart不能覆盖storage/tower等阻挡。
- WorkPositionCoordinator：根据当前候选格及其他worker claim校验旧工位。
- ActionParser：旧工位失效时重新规划；移动目标使用独立对象，BUILD/REPAIR继续保留真实target及targetId；无合法候选时清除失效工位。
- 保留原本道路惩罚和工作范围约定，不调整消费/采矿/市场/孵化数量，不打开Governor或远程。

新增 src/tests/work-position.cjs 六个真实生产helper/ActionParser回归，均先观察到RED再GREEN：两种同格结构顺序、BUILD/REPAIR共享目标不被改写、失效工位恢复实际build、双worker独立工位。

完整 npm test 通过：smoke、room-governor、93个远程＋6个工位用例，99/99；无DEST build及两类diff check通过。测试中的ERR_BUSY为既有主动失败用例。差异限定3个core文件、测试入口、测试文件和本记录。

## 用户授权后的发布和现场回读

用户明确选择“授权发布工位修复”。代码提交 c3cc9289055398751aab95aa69a14b4b54dd629a，已推送 origin/codex/single-remote-mining，并执行 npm run push 发布 screeps.com/default。

- 发布前备份：D:/MyCode/screeps_world/automatiseerimise_impeerium/.worktrees/release-backups/2026-10-15T02-35-45.166Z/server-code.json，保存原53f0e4a版代码模块。
- SERVICE_VERSION=1792031787998。
- 新 main SHA256=970cfea00c52d69e9394e333657934e6401ee1c80b6552f4b3f0988264c0b600。
- 新 map SHA256=ea91f079f924e251069713bfa0c6491a0d3ef2b8329c7cbcdacc4a9ca0589d84。
- 一次API时间读取超时，有限重试后回读成功；Game.time=83653612，activeWorld=true，main/map逐字节匹配本地产物，运行摘要codeVersion匹配新版本。临时部署凭据文件已删除。
- tick83653603游戏内原生读取：工地pos仍为真实(32,24)，progress=100；随后API读取progress=130/100000。
- builder旧坏工位已被自动重规划为(31,23)，另一个builder位于(33,23)执行同一工地。两名原先停滞的repairer也已转入新鲜有效维修目标。不手工清空所有任务。
- 原生/只读核对仍为remoteMining=false、Governor shadow=true、scheduler enforce=false、market=false，recovery=normal、Controller计时150000，核心miner2/hauler3。没有开启远程经营或市场。

现场已出现实际施工增长，但terminal尚未建成、接收容量尚未增加。不能据130进度称“母房接收空间已解决”。

## 后续执行与验收

修复已按具体授权发布并确认执行。后续按新代码指纹恢复10分钟条件跟进，正常增长静默，异常/阻塞或建成并完成下一阶段核对才通知。旧单房外部collector保持暂停。

发布后先确认builder去往可站立格并出现实际progress增长；再跟进terminal建成、真实id及稳定可用空间，初始接收门槛20000。只读API每次返回一个独立快照，不伪称连续逐tick观察。

之后运行已准备的游戏内只读 routes 检查，调用已部署RemoteMiningService.validateEconomicRoutes及原生PathFinder，限定W49N41/W48N41、真实terminal接收目标、body行程和300期限。目标房尚无Game视野时 coordinateOnly=true，只能证明原生几何通路，不能冒充持续安全、实际往返或source已可见。

远程保持关闭，实际启用配置只在必要条件满足后提出；旧单房和新远程10000-tick验收都未自动补签。不自动卖出/丢弃能量，不额外建设，不开启市场。

原始现场快照、console操作结果和RED/GREEN日志位于本worktree的 .superpowers/sdd/2026-10-14-single-remote-mining/，受本地Git忽略；无凭据或完整Memory进入提交。

参数依据：[Screeps官方terminal文档](https://docs.screeps.com/api/#StructureTerminal)、游戏内常量及[官方建造位置校验](https://github.com/screeps/engine/blob/master/src/utils.js)。道路与可覆盖防御设施不必人为销毁。
