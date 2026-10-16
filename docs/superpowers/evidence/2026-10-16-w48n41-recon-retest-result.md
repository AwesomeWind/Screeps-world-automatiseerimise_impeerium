# W48N41 有限侦察复试：受阻关闭

日期：2026-10-16，北京时间。用户授权按已审阅方案开启有限侦察，要求完成、异常或达到上限后关闭；实际采运和Goal/Plan继续关闭。

**本轮复试未通过全部条件，已按异常退出并回读确认关闭。** 新scout孵化和实际移动已验证，持续受阻后的一次重规划与停止保护已验证；没有取得远程房间视野或100ticks安全证据，不建议开启采运。

## 版本与入口检查

逻辑提交fe061d4a1e3548e71d7b31dd575b3c18b52c7f3a，SERVICE_VERSION=1792128523514。起止SDK回读均为default activeWorld=true，指纹相同：

- main SHA-256：82b5f7f9473e986d89d3a8084ef095ea55f0c468578936ce1d636d5a006d33ac。
- map SHA-256：14ce4141c8676bfb474d8b0b569da19967e425fa9e04fd0dfe9843db3b846939。

初次预检时Spawn正在补防御单位，没有抢占；实际开启前重新核对母房恢复/核心/Controller、Spawn空闲、terminal空间、入口路径、配置、人口及预算。旧失败scout已自然退场，未删除Memory幽灵或重置旧leg强制招募。

观察使用持续控制台连接和唯一回执标签，表达式均不超过1024字符；新操作与旧观察目录分开保存，没有拼接旧版本或中断窗口。未打开旧的常驻自动化。

## 实际过程与判定

| 项目 | 原生证据 | 判定 |
| --- | --- | --- |
| 有限侦察开启 | tick83677630临时开启模块和W48N41，经济角色配额0、sourceId=null | 已执行 |
| 实际孵化 | tick83677631/632/633，Game.creeps中scout.spawning=true，1MOVE；无移动task/leg/lastMoveAttempt | 通过 |
| 出生后开始行程 | tick83677634，真实出生位置W49N41(31,23)，leg.startedAt同tick | 通过 |
| 实际前进 | tick83677641从(37,26)接受移动；下一tick83677642实际到(38,27) | 通过，不仅是返回OK |
| 持续受阻 | tick83677646起停在W49N41(42,30)，fatigue=0，移动多次返回OK但位置不变 | 异常 |
| 有限重规划 | tick83677651首次stuck清理，652记录retryAfter=653，653执行唯一重规划 | 冷却2ticks、一次上限生效 |
| 重规划后仍受阻 | tick83677658再次stuck清理，659记录retry_exhausted | 未恢复，按方案结束 |
| 原期限 | 所有同leg样本均为startedAt=83677634、expiresAt=83677694 | 未续期 |
| 关闭和回读 | tick83677663关闭；665确认模块/房间disabled、hold=true、allowRecon=false | 已确认 |
| W48N41视野、可见结构路线 | 未进入远程房间，没有运行目标视野/经济路线验收 | 未完成 |
| 连续安全 | operation.safeTicks=0、intel=null | 0/100，未验证 |

scout名称scout_83677631_Spawn1_0；本轮仅此一个scout，没有自动补第二名。生存/受阻段共保存21份启用状态的离散原生样本；开启到关闭两端相隔33ticks，不能将这些样本冒充连续窗口。异常在300ticks/20分钟总上限及原leg到期之前终止。

本轮自然出现的是持续受阻，不是解除后成功恢复。因此“有界重试并停止”已有线上证据，“临时堵塞解除后的成功恢复”仍只有本地回归证据。没有观察到ERR_NOT_FOUND，不能把本轮结果当成该错误分支的实机覆盖。没有人为堵路、制造敌情或移动母房单位。

## 阻塞点的只读补充

重规划后lastMoveAttempt的pathFirst为W49N41(43,30)，结果仍为OK。关停后tick83677703只读检查该格，发现：

- 名为miner_83676510_Spawn1_0的creep。
- road、container、rampart三层结构；terrain为plain。
- 相邻source在(44,31)。

这一现场高度指向固定采矿工位占用，与当前planRemoteRoute只把结构写入CostMatrix、没有纳入creep/固定工位占用的实现相符；重规划可能再次选择同一个被占用的便宜路点。

但补充检查发生在关停之后，不能据此声称该creep在每个受阻tick都占据此格，也不能只凭这份快照排除其他占用或移动仲裁因素。没有强行移动该creep来验证。下次应优先调查实际路径下一格占用和固定工位避让，而不是延长stuck阈值、重试次数或leg期限。

## 费用及最终保护状态

现有执行账本的spawnEnergyConfirmed从本轮基线50增长至100，本轮增量50；只有一条本轮成功receipt，name与实际scout一致、cost=50、tick=83677631。累计100不是本轮费用，前次失败侦察的50没有混算。spawnEnergyUnknownUpperBound=0，最终grants为空。

tick83677665关闭回读：

- remoteMining.enabled=false；W48N41 enabled=false、hold=true。
- operation.status=disabled、allowEconomicDeparture=false、allowRecon=false。
- sourceId=null、allowContainerBuild=false、reserveController=false。
- remoteMiner/remoteHauler/reserver配额均为0；期间始终没有允许经济出发。
- goalPlanning.enabled=false、Governor shadow=true、scheduler.enforce=false、market=false。
- scout留在母房(42,30)安全等待，未杀死、回收或清除其失败记录。

tick83677667母房recovery=normal，miner2/hauler3，Controller149889（既有emergency门槛5000），terminal同一真实id且free300000，Goal命名空间为空。后台观察进程26952在结束取证后自然退出，已核对不再运行；没有新增跟进自动化或下一次尝试。

## 证据与下一步

原始目录：.superpowers/sdd/2026-10-16-w48n41-retest/。

- retest.status.json：完整运行阶段、孵化/出生/位移证据、起止SDK指纹、关闭及账本回执。
- watch-*.json、hold-*.json、home-*.json、ledger-*.json：按请求独立保存的原生快照。
- blockage-1792131483967-1.json：关停后的下一格只读检查。
- retest-audit.json：核对出生、单一actor、一次重规划、原期限、预算增量、关闭及观察边界的本地审计。
- retest.stdout.log、retest.stderr.log：实际进程输出；未输出凭据或完整Memory。

本轮未改、提交、推送或部署生产代码；线上写操作仅为获批侦察启用和结束后的关闭/hold，没有写目标定义或启动实际采运。此为Game内console/API证据，不是浏览器页面验收。

下一步建议先处理母房出发路径的占用/工位避让问题，再重新提出有限侦察；当前不自动修代码、重开侦察或启用采运。W48N41真实视野、安全、经济路线及实际采运/10000tick验收均继续保留为未完成项。
