# W48N41 有限侦察执行记录

日期：2026-10-16（北京时间）。本轮授权范围是有限侦察、真实路线和安全条件核对；实际采运及 Goal/Plan 均不得开启。

## 执行方式与保护

沿用已部署逻辑6f2633a6747d78ec582fbd0cb847e9906874051e，SERVICE_VERSION=1792056592374，没有修改或部署生产代码。

现有 remoteMining 总开关同时控制侦察与采运，不能单独打开总开关后依赖及时人工关闭。因此使用已有 awaiting_source_selection 阶段：

- W48N41 暂存 sourceId=null；已批准的候选源5bbcaa6d9099fc012e63155b只用于只读路线核对，不写为生产矿源。
- scout配额1；remoteMiner、remoteHauler、reserver配额均为0。
- allowContainerBuild=false，reserveController=false。
- 接收白名单只含真实terminal 6ad0b55bceeb3db0d3b4dda0。
- 保留1000tick窗口、2000孵化预算、6000基建预算、100安全streak、200侦察冷却、原300tick leg期限。基础预算没有扩大；经济角色及建设另外关闭。
- Goal/Plan关闭，Governor shadow=true、scheduler.enforce=false、market.enabled=false，不写线上目标定义。

侦察期间模块 enabled=true 不代表采运已开启；实际执行门槛 allowEconomicDeparture 必须一直为false。完成核对、发现安全阻塞或达到观察300ticks/20分钟上限后关闭模块，并将房间enabled=false、hold=true；不杀死、复用或强派母房单位。

## 本地配置回放与启动前证据

使用现有 RemoteMining→Bureau→EventBus→SpawnService→role strategy→ActionParser 链回放：失去视野只孵化一名scout；恢复视野120ticks，完成100安全streak后停在awaiting_source_selection，全程经济单位孵化0、容器工地0、allowEconomicDeparture=false；hold后侦察与经济均禁止。这是配置回放，不是线上长期验收。

回放脚本：.superpowers/sdd/2026-10-16-w48n41-recon/configuration-replay.cjs。

启动前原生tick83674173：所有战略保护开关正确，远程角色为空；tick83674174：Controller150000、recovery=normal、有效miner2/hauler3、Spawn空闲、母房能量1900、terminal free300000，Goal命名空间为空。

tick83674202只写关闭/hold状态的侦察配置；tick83674205原生事实确认入口W48N41(1,25)、reconRouteSafe=true、homeHealthy=true、sinkAvailable=true、无母房危险或已知外部控制。

tick83674233原生回执确认侦察启用，sourceId仍null。有限观察进程及所有采样保存在.superpowers/sdd/2026-10-16-w48n41-recon/，状态文件bounded-watch.status.json。

## 网络与证据边界

诊断脚本最初漏解码&#x22;引号，收到合法结果却报超时；已用回传原文定位并补齐十六进制/十进制实体解码。该错误不能归因于游戏没有执行。首次后台启动另遇HTTP失败，已确认关闭回读后才重启；后续HTTP502记录仅保存状态码和长度，不保存凭据。

外部轮询是离散回读；安全streak取游戏内现有operation的逐tick累计，不能将外部采样点当连续窗口。启动回执也不等于实际孵化、到达或路线验收。最终结果以本文件后续记录和原生证据为准。

## 本次实际结果：移动阻塞，已关闭侦察

本次未达到采运启用前提，不建议开启采运。

实际生成scout_83674234_Spawn1_0，原生body为一个有效MOVE，spawning=false。tick83674269、83674282、83674283、83674295的独立快照均显示它停在W49N41(29,25)，未获得W48N41视野；operation为discovering/vision_missing，safeTicks=0、intel=null。没有把请求接受或路径估计当成到达。

原生tick83674283的细节：

- fatigue=0；task=null。
- remoteLeg.goalKey及blockedGoalKey均为W48N41:1:25:0。
- remoteLeg.startedAt=83674235、expiresAt=83674297。
- lastTaskClear在tick83674242记录move_stuck_or_expired，后续状态为safe_wait/stuck_or_expired。

任务在原leg期限前被清理，证据指向位置不前进触发stuck保护。代码核对显示：ActionParser默认连续5次位置不变会清理MOVE_TO；RemoteMiningStrategyService看到该清理原因后记录blockedGoalKey，同一goalKey拒绝再次规划。因此可以解释为什么此后持续等待，但最初为什么没有移动仍未确定，不能直接宣布是拥堵、墙体或路径算法错误。

tick83674298已执行并收到原生关闭回执。随后tick83674301独立只读确认：

- remoteMining.enabled=false；W48N41 enabled=false、hold=true。
- allowEconomicDeparture=false、allowRecon=false；safeTicks=0、intel=null。
- sourceId=null、allowContainerBuild=false、reserveController=false。
- remoteMiner/remoteHauler/reserver配额仍为0，未恢复到采运配置。
- Goal/Plan=false、Governor shadow=true、scheduler.enforce=false、market=false。
- 只保留上述scout，仍在母房；没有杀死它或强派母房单位。

后台进程39484在收到原生hold确认后，经可执行文件与命令行核对已停止；没有创建新的自动跟进。状态文件已标记blocked_stopped，不能再称为持续观察。关闭后的另外两次补充查询遇HTTP502，但已有tick83674301的成功关闭回读，不伪称失败请求取得了更新证据。

主要原始证据：actors-1792117377799.json、hold-1792117439335.json、status-1792117452562.json，均在本次scratch目录中。生产版本没有变化，未提交、推送或部署；本次仅新增本地证据文档和被忽略的运维脚本。

## 下一步建议

先调查scout最初MOVE_TO的实际路径执行、下一步占用及停滞计数，再以生产链回归验证有限重规划/回退策略。重点覆盖：短时出生点阻塞解除后可恢复、持续阻塞时按原期限停止、跨房和疲劳不误判、重复重规划不延长原expiresAt、不产生第二名scout或经济需求、hold后不再出发。

原始task.path在清理后已不存在，新算的几何路径不能冒充当时实际路径。应先补足最初停滞原因和恢复边界的证据，再选择修复；不通过提高stuckLimit、清掉blockedGoalKey、强行移动或延长所有任务期限绕过保护。

修复后仍应先重跑有限侦察，取得真实目标视野、100安全streak和按实际body计算的原生可见路线。通过后才另行给出采运启用建议；恢复生产sourceId、容器建设和经济角色配额需要与后续明确授权一起执行。本轮不写这些配置。
