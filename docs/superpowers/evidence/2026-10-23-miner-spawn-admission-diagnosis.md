# miner请求绑定与Spawn仲裁：诊断证据

2026-10-23。范围：先定位原失败，提出修复设计与回归要求；不修改产品实现、线上开关、请求期限或预算，不重开试点、不提交或部署。本轮全部离线，运行子进程加载deny-network preload，禁止网络及凭据/共享代理配置读取。

## 结论

**缺陷在于仲裁前过早绑定唯一role请求，不是需要更长的5 tick期限。** RemoteMining在analyze看到物理Spawn空闲，就先写入试点slot.requestId/deadline并预留grant；母房需求尚未生成，也没有真实分配Spawn。稍后的Bureau/EventBus才完成优先级排序与容量分配，remote候选可能失去唯一席位，但slot已进入固定倒计时。

本轮实际policy中remoteMiner.priority=45。母房普通hauler补员同为45，不是简单的“远程priority较低”。Bureau先addEconomicIntents再addDemandIntents，稳定排序保留同级先后；EventBus也按priority排序。母房hauler先在Spawn.handleSpawnRequest中pop唯一idleSpawn，miner随后命中no_idle_spawn；原生调用根本没有发生。

这个机制已通过真实服务链的控制实验确认，并与[本轮线上失败记录](2026-10-23-native-first-delivery-trial-run.md)吻合。线上没有捕获tick83815762完整逐事件dispatch栈，因此“每个线上callback的逐条顺序”不是原生采集事实；优先级来自线上原样本，确定性执行顺序来自对应源码和本轮离线复现。

## 源码边界

| 位置 | 事实 |
| --- | --- |
| src/main.js:61、118、120、122 | RemoteMining→Bureau→Spawn按阶段调用；全部analyze后EventBus.dispatch，再run |
| RemoteEconomicTrialService.js:62 | canBindEconomicTrialRole只检查Game中存在active且非spawning的Spawn，无法看到后续母房需求或dispatch中已预留的席位 |
| RemoteMiningService.js:160～185 | 仲裁前生成requestId和Game.time+5 deadline、spawn_bound写slot，再reserveSpawnGrant |
| SpawnBureauService.js:38～54、112 | 先母房后外部需求，priority降序；普通hauler为45 |
| src/core/EventBus.js:46～62 | priority排序后逐事件调用Spawn订阅者；handled=false的事件在有效期内保留 |
| SpawnService.js:103～136 | 真实容量/能量接纳发生在订阅者，pop idleSpawn后才生成pendingTask及调用试点intake |
| RemoteEconomicTrialModel.js:250～258 | bound slot没有acceptedAt且tick>deadline即spawn_request_expired，绑定后不能更新deadline |

## 与线上时间线的对应

- 真实miner slot：requestId remote:W49N41:W48N41:2:9，deadline83815767，calls0、无name、无engineAcceptedAt。
- 按固定+5生成机制，对应约tick83815762建立。母房hauler_83815762_Spawn1_0在tick83815786仍spawning、needTime30/remainingTime6，覆盖该5 tick有效区间。
- tick83815768原守卫按过期关闭；83815769确认关闭。本轮费用只有scout50，unknown0，miner无实际费用或回执。
- 原代码按期限拒绝继续经营是正确安全行为；应调整正式请求的建立点，而不是取消这条关停保护。

## 三组控制实验

独立证据目录：.superpowers/sdd/2026-10-23-miner-spawn-admission-diagnosis/。

reproduce.cjs复用NativeEconomicOps→Economic→RemoteMining→Bureau→Spawn→Strategy/ActionParser真实服务链，由一次submit自然经过archive/release/start、scout出生/移动/视野及安全计数99，再提供补员竞争输入。没有手写safeStreak或替换生产Model/Spawn仲裁方法。observer包装只采样真实函数执行后的状态。

fixture默认两Spawn、三名hauler；单Spawn条件移除第二Spawn。竞争输入将两名hauler的TTL置为退役状态，按既有coversQuota逻辑自然产生普通hauler补员；这是测试Game输入，不是线上杀单位或清Memory锁。经济fixture没有storage，母房desiredHauler为2，该输入使covered=1，仍使用与线上相同的45优先级。

| 条件 | miner绑定/期限 | 本地原生调用 | 结果 |
| --- | --- | --- | --- |
| 单Spawn，无补员竞争 | 83794671 / 83794676 | 绑定当tick执行一次 | accepted，无过期 |
| 单Spawn，同级母房hauler补员 | 同上 | 0次 | 83794677以spawn_request_expired停止 |
| 双Spawn，同级母房hauler补员 | 同上 | 绑定当tick执行一次 | 两者有席位，miner accepted |

三组断言全部通过；竞争组trial费用50、unknown0，控制组trial费用750（scout50+miner实际body700），没有将maxEnergy800当实际费用。室内可用能量1900足够两种body，失败不依赖人为注入ERR_BUSY或能量不足。

竞争组阶段快照清楚显示：

1. RemoteMining.analyze结束：miner slot已经绑定、deadline=t+5，grant.executing=false，Bureau尚无本tickintent。
2. Bureau.analyze结束：hauler45在remoteMiner45之前。
3. EventBus.dispatch结束：pendingTask只有母房hauler；remote为no_idle_spawn，slot.calls仍0。
4. t+5：Spawn仍被母房占用，miner尚未intake。旧代码每tick重复发布相同request，队列累计6条同id事件，deadline都不变；重复发布不是增加真正执行机会。
5. t+6：P0按原期限关闭，清除未执行的本轮grant与队列；没有unknown或额外引擎调用。

## 原回归为何未发现

原fixture默认两个Spawn且母房核心quota已覆盖；原review_single_spawn_finishes_without_request_renewal虽然删除第二Spawn，但没有让母房hauler在远程role绑定的同tick出现缺口。测试覆盖了“已有Spawn忙时不提前绑后续role”，没有覆盖“analyze时空闲、dispatch时被同级母房需求抢先占用”。

本轮又在禁止网络条件下跑原有5项定向测试：单Spawn完整首批、原请求重试不续期、not_started重置、半完成孵化回执不冒充结算、native完整闭环；5/5通过。它们支持保留原安全合约，并不能证明尚未实现的新方案已通过。

## 交付边界

产品源码、稳定测试文件、package.json和构建产物未修改，没有重新构建；Git HEAD仍ff83340。只增加本轮离线诊断脚本/数据和设计文档。没有读取新线上样本；上轮已确认关闭的试点不重开，旧锁与原日志不动。

建议设计见[仲裁后接纳方案与回归计划](../specs/2026-10-23-economic-spawn-admission-design.md)。尚未实现，不能宣称修复GREEN。
