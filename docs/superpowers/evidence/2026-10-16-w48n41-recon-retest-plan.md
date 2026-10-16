# W48N41 有限侦察复试方案

状态：待用户授权执行。本轮只准备方案，线上侦察、采运和Goal/Plan均关闭。部署基准为fe061d4a1e3548e71d7b31dd575b3c18b52c7f3a，SERVICE_VERSION=1792128523514；指纹见同目录scout-movement-release记录。

## 范围和入口门槛

只验证新scout出生后起步、自然发生的受阻恢复、实际跨房视野和安全条件。之后可给出采运启用建议，本次复试不允许矿工、运输者、预定或建设容器。

1. 开始前再读SDK指纹、原生运行版本和控制开关；版本或状态不符则不写启用配置。
2. 母房recovery=normal，有效miner/hauler均至少1，Controller不低于既有emergency门槛，母房无危险；Spawn空闲且本房核心补员优先。
3. 真实接收terminal必须仍为6ad0b55bceeb3db0d3b4dda0，free至少20000；重新取得新鲜样本，不能拿本报告中的历史容量作永久授权。
4. 目标操作、候选单位、实际spawning/accepted记录及预算必须一致；无未清理的有效grant，不把Memory幽灵当人口，也不清空有效记录强制招募。
5. 目前旧失败scout已自然退场、远程角色为空。实际开始时再核对；若又有旧scout且原leg已过期，不重置其startedAt/expiresAt或删除blockedGoalKey来冒充复试，先报告阻塞。
6. 读取当前入口路径和已知intel；有外部占领/预定、危险、无合法入口或预算不允许时不出发。现阶段W48N41的Game内视野、安全streak及源旁可达性仍未通过。

## 临时侦察配置

离线JSON默认所有启用字段为false，hold=true。只有在用户授权并通过入口门槛后，才临时打开remoteMining模块及W48N41配置、解除该房hold，以允许已有有限侦察流程运行；不能在总开关仍false时宣称已经启动侦察。

采运用sourceId始终为null，等待选源；候选source 5bbcaa6d9099fc012e63155b只作为只读核对目标。保留containerPos=(19,6,W48N41)，但allowContainerBuild=false、reserveController=false。

scout上限1，remoteMiner/remoteHauler/reserver配额均为0。保持2000 energy/1000ticks孵化预算、6000/1000基建预算、100安全streak、200侦察冷却及原leg期限<=300；不为本次scout提高任何额度。实际只需1MOVE，body成本50；成功孵化成本必须由现有执行账本确认，不能把请求接受当成功。

Goal/Plan=false、Governor shadow=true、scheduler.enforce=false、market=false；不创建线上目标定义。

旧运维脚本的prepare/enable仍保护旧版本1792056592374，不应直接重跑或绕过guard。未来获批后先按本轮新版本更新运维保护、校验表达式长度和唯一回执标签；不需要为了复试再次修改或部署生产逻辑。

## 执行与判据

### 第一段：新scout实际出生和起步

只允许一名并发scout。核对Spawn的真实spawning和出生后有效1MOVE，记录真实出生坐标；孵化阶段不得提前创建移动leg、执行移动或累计停滞。

出生后从真实位置生成路径，记录新leg.startedAt/expiresAt及lastMoveAttempt。move返回OK只说明接受意图，至少再取下一tick位置变化，才能确认实际前进；最后核对真实跨房到达W48N41。

不主动堵路、移动本房单位或制造敌情。若自然出现路径脱离/卡住，应看到明确原因、等待2ticks、最多一次重规划，原期限完全不变；规划失败也消耗一次预算。没有自然出现该场景时，只能标记恢复场景本地回归通过、线上尚未覆盖。

### 第二段：视野、安全和可见结构路线

到达后用原生Game对象核对Controller owner/reservation、hostile、指定source、(19,6)地形/邻接/结构及接收点；公开API只能辅助，不能冒充Game内视野。

在现有operation中累计100个连续安全ticks，校验同版本/remoteId/epoch且intel足够新鲜。外部离散样本仅回读游戏内计数，不能自行拼接为连续安全。

保持sourceId=null和经济角色配额0，只读调用已部署的validateEconomicRoutes及原生PathFinder；从真实terminal到真实源旁位置，按当时可用能量与拟用body、可见结构和危险区域核对去/返路线和原期限。不得采用坐标fallback后宣称真实目标可见；拟用body是计算对象，不孵化经济单位。

scout实际跨房通过与经济路线计算通过分别记录；即使两者都通过，也不等于运输者已经实际往返或确认母房收入。

### 结束、失败和回收

取得安全和路线证据后，立即关闭remoteMining及W48N41 enabled，恢复hold=true，原生回读确认allowRecon=false、allowEconomicDeparture=false及全部保护开关。

观察总上限300ticks或20分钟，先到者结束；这与出生后单个leg的原期限是不同上限，不得据外层时长延长leg。异常时提前结束，包括：卡住/一次重规划耗尽、leg到期、死亡/额外单位或补员请求、版本/开关变化、母房/远程危险、核心或Controller风险、接收空间不足、无合法路线、连续3次必要读取失败。

不主动补第二名scout、不清空旧leg再试、不自动开始下一轮。若关闭回执无法确认，有限重试后如实报告；不能声称关闭成功或仍在持续观察。不杀死scout，关闭后只允许原有安全返程逻辑；不重启过去的常驻自动化。

## 复试通过后的输出

保存实际出生、移动、视野、安全streak、可见路线、body/期限及停止回读证据，逐项区分通过、失败和未覆盖。条件满足后只提出一miner/先一hauler的后续采运建议，说明需要另行恢复生产sourceId/容器开关/经济角色配额并另获授权；本次不执行这些步骤。

真实采运、下一tick母房卸货确认、收益/unknown及10000tick场景验收都属于后续阶段。本次复试不以已部署、计时达标或影子状态代替这些验收。
