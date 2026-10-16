# W48N41 工位避让修复后的有限侦察复试方案

状态：只提供方案，尚未执行。发布授权不包含本次侦察启用；实际采运和 Goal/Plan 始终关闭。

基准逻辑提交 `9e415d1eb33398b6f5d0d22e4e9a16622154905d`，SERVICE_VERSION=`1792137398079`。指纹及部署核对以同目录 `2026-10-16-scout-route-occupancy-release.md` 为准。

## 开始前的门槛

- 另获用户明确授权后，重新读取服务器指纹、实际运行版本、全部开关及房间当前状态。运维工具必须校验本次版本、采用唯一回执标签，并已验证可靠的观察和关闭通道；旧版本脚本不能直接用于启用。
- 母房恢复正常，有效 miner/hauler 均至少 1，Controller 不低于既有应急门槛，母房无敌情；Spawn 空闲，核心补员优先。
- 真实 terminal 必须存在，接收目标为 `6ad0b55bceeb3db0d3b4dda0`，当前实际剩余容量至少 20000。历史容量不能代替开始前检查。
- 核对真实 Game.creeps、Spawn.spawning、已接受孵化回执、预算及有效 grant；不得把 Memory 幽灵当活单位，也不得清空账本强制再生。
- 若旧 scout 仍在且原 leg 已过期/重试耗尽，先报告阻塞，不改原 startedAt/expiresAt、不删阻塞标记、不改 epoch 绕过保护。旧单位自然退场后再通过正常流程产生新 scout。
- 只允许 W49N41→W48N41；入口预检须使用已部署的工位占用规则。有危险、外来占领/预定、无合法路线、预算不明或耗尽时不出发。

## 临时启用的范围

只有获批并通过门槛后，才临时打开 remoteMining 总开关及 W48N41 enabled、解除该房 hold，使既有有限侦察流程运行。方案 JSON 仍默认关闭，不是可直接执行的启用指令。

| 配置 | 本次限制 |
| --- | --- |
| 人口 | scout 上限 1；remoteMiner、remoteHauler、reserver 均 0 |
| 经济配置 | sourceId=null；allowContainerBuild=false；reserveController=false |
| 只读候选 | source `5bbcaa6d9099fc012e63155b`；containerPos=(19,6,W48N41) |
| 保护 | Goal/Plan=false；Governor shadow=true；scheduler.enforce=false；market=false |
| 预算 | 孵化 2000/1000ticks、基建 6000/1000ticks；不提高额度；1MOVE scout 成本 50 |

## 要取得的证据

1. **出生与实际移动**：观察真实 spawning、出生坐标和 1MOVE，孵化期不提前创建 leg。出生后至少核对下一 tick 的真实位移；返回 OK 不算移动成功。
2. **工位避让**：核对实际路径不进入当时被占用的 miningPos/task.workPos，母房矿工保持原位。若自然受阻，唯一一次重规划必须使用当前 creep 占用快照，冷却 2ticks，原 startedAt/expiresAt 不变；无路即停止。不得人为堵路或移动核心单位。未自然发生受阻恢复时，明确记为实机未覆盖。
3. **跨房与安全**：真正进入 W48N41 后，以 Game 内视野核对 owner/reservation、hostiles、指定 source 及候选容器格。在同版本、同 remoteId/epoch 下由游戏自身累计连续 100 个安全 ticks；外部离散读取只回读计数，不自行拼接窗口。
4. **可见路线**：有真实视野后，临时计算副本可带候选 source，线上 sourceId 仍为 null。只读调用已部署经济路线验证，使用真实 terminal、拟用 body、可见结构及危险区域检查去返路线和期限。不写入经济需求或建设任务。

实际 scout 跨房、可见经济路线计算、运输者实际往返和下一 tick 卸货确认分别判定。前两项通过也不授权实际采运。

## 结束与失败

总上限为启用后 **300 ticks 或 20 分钟，先到者结束**；单 leg 仍受其原期限约束，最多 300ticks，不因外层观察续期。最多一次重规划；不因失败补第二名 scout 或自动开始下一轮。

取得目标证据后立即关闭；遇到持续受阻/重试耗尽、leg 到期、死亡/额外单位或补员请求、危险、核心或 Controller 风险、接收空间不足、版本/保护开关变化、路线失败，或必要读取连续失败 3 次，也立即结束。

关闭 remoteMining 和 W48N41 enabled，恢复 hold=true，再读确认 allowRecon=false、allowEconomicDeparture=false 及全部保护开关。关闭回执不明时有限重试并如实报告，不能宣称已关闭。不杀死或强派 scout；只保留已有安全返程逻辑，不重启旧自动化。

最终报告逐项列出生、位移、工位避让、恢复、视野、安全 streak、路线、费用及关闭证据，明确通过、失败和未覆盖项。条件满足后再给出 1miner＋先1hauler 的采运建议；实际采运、收益和 10000tick 验收留待下一阶段独立授权。
