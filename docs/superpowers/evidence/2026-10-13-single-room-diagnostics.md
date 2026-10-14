# 单房生存与恢复：诊断证据

2026-10-13；本地基线 `main / ca38dc4e863c8bf53e15298f43a0b4677ddd63e9`，开始时工作区干净，origin/main 同 SHA。

用 bundled Node v24.19.0 执行临时 `--input-type=module` 脚本，直接 import 当前生产模块，mock 最少的 Game/Memory 和游戏外部动作。脚本没有修改生产文件，没有对线上注入故障。

| 场景 | 输入 / 真实调用链 | 实际结果 | 判断 |
| --- | --- | --- | --- |
| 陈旧 Memory | Game.creeps/spawns/成功备份皆空，仅 Memory.creeps.GhostMiner 有 miner/source1；调用 Bureau 三种统计 | role=1、quota=1、WORK=1 | 无存活/孵化证据也覆盖配额，缺 body 还凭角色猜 1 WORK |
| 成功备份 | Spawn.init -> handleSpawnRequest -> run(OK) -> cleanup；body=5 WORK+MOVE，live 尚不可见 | 备份保存 WORK=5，Bureau.countSourceWorkParts=1 | 生产合约已有 body，消费者仍只读 memory.body 并退化为 1 |
| 损坏 body | live miner body=[WORK hits=0, MOVE hits=100]，TTL=1000 | countSourceWorkParts=1 | WORK 已失效仍算数 |
| 主动退役 | live miner 的 memory.retire=true，TTL=1000 | WORK=1，isRetiringCreep=false | 仅验证语义不同，不据此断言必须把主动退役纳入 TTL replacement bucket |
| 双 spawn 重放 | 同一 request 对 S1/S2 调 handleSpawnRequest；body=3 CARRY+MOVE，room.energyAvailable=300 | pending=2、uniqueNames=1、queuedCost=400 | 没有同 tick 身份去重或能量预留；两个问题均可触达实际 intake |
| Controller 跨阈值 | 当前 ticksToDowngrade=4999，上一 tick snapshot=5001；readiness 50 完整样本、本地 active 输入、gap=0/budget blocked、有 legacy upgrader | action=suppress、intents=[] | emergency 依赖旧 snapshot，当前 Controller 安全未重检；active 仅为本地 mock |
| transfer OK | ResourceMarket.assignHauler -> ActionParser.run；TRANSFER 50，demand=100 | task=null，reservation={amount:50,expiresAt:105}，剩余 demand=50 | 清任务后没有反馈；OK 本身只是 intent 接受，不能直接作为真实送达证据 |
| 显式取消 | 同样派活后 clearTaskState('diagnostic_cancel') | task=null，原 reservation 仍在 | 取消没有按 owner 释放预留 |
| 目标消失 | 同样派活后 getObjectById=null，ActionParser.run | reason=target_missing，原 reservation 仍在 | 目标失效没有释放预留 |
| TTL 兜底 | tick 从 100 推进到 106，pruneReservations | reservationCount=0 | 现有虚占有 5-tick TTL 边界，不能描述为永久占用 |

这批诊断不是新增回归测试，不算 RED/GREEN 修复完成。实施时须把上述真实调用链改为仓库测试并观察失败，再改生产实现。

## 线上只读快照

已授权账号的 `.secret.json` 仅在进程内作为请求凭据；未打印或持久化 token。请求均为 GET：shards/info、user/memory、user/code；未发送 console 或写 Memory。

- 有项目 control 的 shard 为 shard3，房间 W49N41。
- 第一次读：北京时间约 2026-10-13 13:19，runtime tick=83612885、metrics tick=83612880，storage posture=normal，spawnEnergyRatio≈0.928，storageEnergy=990000，CPU EWMA≈5.36，Memory=83193 bytes。
- 已保存快照：[JSON](2026-10-13-single-room-readonly-baseline.json)，北京时间约 13:23，runtime tick=83612946、metrics tick=83612940，posture=spawn_rescue，ratio≈0.559，storageEnergy=989200，CPU EWMA≈4.83，Memory=83448 bytes。
- 线上 main 的 SHA-256 与当时本地 dist/main.js 完全相同，记录于 JSON；此核验发生在后续本地 build 之前。source HEAD 是本地已核验基线，不等同于游戏 Memory 自报的 codeVersion。
- 两次都为 Governor shadow、scheduler.enforce=false、CPU bucket=10000。可以确认期间姿态发生变化，但离散快照不能确认进入/退出原因、完整恢复周期或平均吞吐。
- rollout.sampleCount=122719、ready=true 是累积历史状态，没有按本次代码版本分段；不能把它当作 ca38dc4 或下一修复版本下的 50 个独立完整样本，更不能作为 active 授权。
- 未完成连续 10000 ticks 验收；没有 p95、持续 Memory 曲线、故障恢复闭环证据。
