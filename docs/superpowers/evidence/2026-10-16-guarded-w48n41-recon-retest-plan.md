# 游戏内守卫保护下的 W48N41 有限侦察复试方案

状态：待新的明确授权，尚未启动；只准备方案和默认关闭的离线JSON。实际采运及Goal/Plan继续关闭。

发布基准：逻辑`0f6ece7c4aed2697ac068683116b3199a6915e69`，SERVICE_VERSION=`1792144535858`，screeps.com/default、shard3。版本指纹与关闭证据见同目录`2026-10-16-remote-recon-trial-guard-release.md`。

## 开始前重新检查

1. 回读服务器main/map、游戏运行版本与所有保护开关，确认守卫仍enabled=false/request=null，且没有被别人创建的新会话。版本不符不套用旧指令。
2. 母房W49N41恢复normal，有效miner/hauler至少各1，Controller不低于既有应急门槛，母房无敌情。等核心补员结束、Spawn空闲再开始，不能强占核心需求。
3. 从真实Game对象重新确认terminal `6ad0b55bceeb3db0d3b4dda0`存在且free>=20000；本次发布只核对配置中的接收id，没有取得新的原生容量证据。
4. 核对真实scout/Spawn.spawning、本tick accepted与未结grant/回执。若仍有旧scout或过期/耗尽的旧leg，不清Memory、不重置期限来强制招募；等待自然退场或报告阻塞。
5. 核对现有入口路线、危险/外来控制、侦察冷却和预算。只有该房可作为纯侦察试点；存在其他enabled房间、费用unknown或配置冲突时不开始。
6. 验证可靠的原生写入回执和SDK只读回查通道。上次console曾502；本次没有发送console指令，不能凭SDK读取成功就声称写入/关闭通道已恢复。

## 获批后的单次启动

保持sourceId=null、allowContainerBuild=false、reserveController=false；roleLimits为scout1、remoteMiner0、remoteHauler0、reserver0。候选source `5bbcaa6d9099fc012e63155b`与containerPos=(19,6,W48N41)只用于视野后的计算，接收点仍用真实terminal。

获批后先以新鲜事实生成一次start请求，再在同一条有版本与关闭状态校验的原生指令内写入请求、打开守卫和remoteMining/W48N41、解除该房hold。执行前离线检查表达式长度<=1024且回执标签唯一。守卫不会自动打开这些开关；本方案也没有执行此步骤。

| 请求字段 | 生成规则 |
| --- | --- |
| schemaVersion/action | 1/start |
| id | 本轮唯一、长度1—64，不重复旧id |
| sequence | 依据新鲜Store高水位+1；Store不存在时为1 |
| remoteId/epoch | W49N41:W48N41及开始时真实操作epoch；本次发布样本为1，变化须重新评估 |
| codeVersion | 1792144535858，必须与运行版本匹配 |
| activateAtTick | 写入时Game.time+1；错过不补启动 |
| expiresAtTick | activateAtTick+300，孵化/移动/观察共用原总期限 |
| issuedAtMs/expiresAtMs | 写入时Date.now及其+1200000，不重发续期 |
| candidateSourceId | 5bbcaa6d9099fc012e63155b |

请求被HTTP接受不等于被守卫接纳。必须回读current.identity、startedAtTick、两个expiresAt及request/grant身份；结果不明时先只读恢复状态，禁止自动换id/sequence重试。守卫拒绝也算本轮尝试结束，需要报告原因。

## 需要取得的证据

- 核对真实孵化与出生；1MOVE成本50。明确非OK仅允许同一逻辑请求在原请求期限内继续；调用结果不明保留claim，不能补第二名。费用以本轮绑定request结算，历史累计值单独列出。
- 核对出生后的后续tick实际位移、绕开当时被占用的固定工位及真实跨房。move OK、路径计算或任务生成不能替代位移。自然受阻时最多一次重规划、冷却2ticks、原leg期限不变；不人为堵路、推走矿工或制造敌情。
- 进入W48N41后核对真实Controller owner/reservation、hostile、指定source及容器格地形/邻接/结构。由游戏内守卫累计本轮连续100安全ticks，不继承历史safeTicks，不把外部离散采样拼成连续窗口。
- 只读校验真实接收点与候选源旁的拟用body去返路线。sourceId始终null，不发布容器建设、采矿、运输或预定需求。坐标fallback不能满足可见路线条件。

## 结束和故障处理

守卫在成功、到期或异常时先撤销出发/孵化许可，再关闭目标房并hold；单一试点且无其他enabled房间时同时关闭remoteMining总开关。必须等下一tick的closureVerifiedAtTick确认后，才能报告会话完全关闭。

总上限300ticks或20分钟，先到即止；单leg继续受自身原期限约束。游戏暂停时不能即时写关闭，恢复执行首个守卫阶段检查墙钟。外部连接中断不延长会话，恢复后读取Store结果。

遇到持续受阻/重试耗尽、过期、死亡、额外actor/request、版本/epoch/配置变化、母房或远端危险、接收空间不足、无合法路线、费用unknown或坏状态时结束；外部必要读取连续失败3次时停止外部追踪并如实报告。若写入通道可用可请求hold；不可用时不能伪称已经人工关闭，应等待恢复回查守卫结果。

存在其他房间enabled导致module_shutdown_conflict时，区分目标scope已停止与总模块未关闭，不能关闭别人的房间。解除托管的release另需人工授权，且目标与总模块均关闭、无实体/实际spawning/accepted/未结grant；release不启用采运。

保留已有受限安全返程，不杀死scout、不强派单位、不重置旧leg、不自动开始下一轮。Goal/Plan=false、Governor shadow=true、scheduler.enforce=false、market=false以及2000/1000孵化、6000/1000基建预算始终保留。

最终输出分开列出出生、实际移动、工位避让/恢复、跨房、连续安全、可见路线、费用、停止和关闭确认的通过/失败/未覆盖项。侦察完成后只给采运建议；实际采运、下一tick卸货、收益及10000tick验收仍是之后独立授权的阶段。
