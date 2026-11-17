# W49N41 补员与恢复的旧行为基线

P0.2／P0.3，源码基线为 8399eac91360ee2f3fab3f87ee1f118e7c3da80e。证据来自源码和可复现的离线模拟。回放使用生产服务入口，Game、Spawn 的原生结果及单位可见时间由替身提供。

## 同一 tick 的读写边界

| 顺序 | 读到的事实与决定 | 写入和兼容边界 |
| --- | --- | --- |
| 主循环初始化 | 加载默认配置并清理 EventBus 过期事件；按注册顺序跑全部 init，然后才进入 analyze。Spawn 的 init 在 RoomPhase 的 analyze 之前 | Spawn 重建当 tick 的空闲 Spawn／可用能量，读取备份并恢复有效请求回执和角色 Memory。回执到原 expireAt 当 tick 仍有效；下一 tick 清理。[main](../../../src/main.js) · [SpawnService](../../../src/services/SpawnService.js) |
| 房间和人口事实 | RoomCache 提供对象索引。人口按名字合并 Game.creeps、Spawn.spawning 和孵化备份；角色等身份优先用活体可用记录，缺失时兼容嵌套和旧扁平备份。房间优先 homeRoom，再 targetRoom，再活体位置 | 人口采集不写 Memory。已退役临界的活体仍可被看到，但不算稳定产能。孵化／已接纳可覆盖部分配额；老备份本身无法证明单位仍在孵化。能力按存活 body 部件计量。[CreepPopulation](../../../src/core/CreepPopulation.js) |
| 恢复和 Governor | RoomPhase 使用 Game、核心人口、能量与恢复策略，生成 normal / miner_gap / hauler_gap / spawn_energy / reserve_low / support_required。分别报告 coreUsable 和 coreUpcoming。Governor Facts 再按稳定、退役、孵化产能投影 | RoomPhase 写当 tick 的 global.RoomPhase，以及房间的 energyPosture 和 recoverySpawnRescue。Governor 以影子事实比较计划。Controller 紧急例外检查实时值，原阈值默认严格小于 5000。[RoomPhase](../../../src/services/RoomPhaseService.js) · [Governor Facts](../../../src/governance/RoomGovernorFacts.js) · [恢复策略](../../../src/services/RoomRecoveryPolicy.js) |
| Spawn 需求 | Bureau 读取可用／待补人口、矿点、房间恢复结果和该 tick 其他需求，按优先级向 EventBus 发布。无覆盖且可负担时，紧急矿工优先级 120；有仓库的运输者目标为 3 | Bureau 的当前意图和 EventBus 排队仅在全局内存。排队时已有请求 ID 和原期限。队列在全局重置后由当时事实重建，不能靠旧队列证明执行。[SpawnBureau](../../../src/services/SpawnBureauService.js) · [EventBus](../../../src/core/EventBus.js) |
| Spawn 接纳 | dispatch 时检查当 tick 的空闲 Spawn、剩余额度、重复 ID 和 quotaKey 等限制，再分配席位。已有持续请求回执时可识别 replay | global.SpawnIntake.accepted 表示席位已分配，真实 API 调用在 run 阶段。此处没有新的成功回执。[SpawnService](../../../src/services/SpawnService.js) |
| Spawn 执行与回执 | Spawn run 才调用 spawnCreep，受控远程请求还须再次通过原权限检查。发出接口动作后，RoomPhase 和其他消费者要在下一次 analyze 看实际可见单位 | 仅 OK 写 Memory.creeps、Memory.empire.spawningCreeps 的 v2 备份和 Memory.empire.spawnRequestReceipts。备份含 acceptedAt、body、spawnName、spawnRoom、requestId 和 requestExpiresAt。已确认失败按原条件和期限处理。cleanup 在活体角色 Memory 可用或原备份到期时清理相关备份，仍按原期限保留有效请求回执。[SpawnService](../../../src/services/SpawnService.js) |

## 已冻结的离线现象

| 场景 | 旧链的可核对输出 |
| --- | --- |
| 核心健康 | 可用矿工 1、运输者 3，恢复 normal，无孵化需求 |
| 缺核心矿工 | miner_gap，紧急矿工优先级 120，有一个引擎调用和同 ID 结果 |
| Spawn 正忙且缺运输者 | hauler_gap，发运输者需求，接纳为 no_idle_spawn，引擎调用为 0 |
| Controller 5000／4999 | 同样缺矿工时，5000 无升级者需求，4999 允许优先级 60 的升级者需求；唯一 Spawn 席位仍优先给紧急矿工 |
| API OK 但原生对象尚未出现 | 先看到接纳计数，后出现持久回执；当 tick 出现 accepted 身份，可用矿工仍为 0 |
| 原生 Spawn.spawning 可见并重置 | JSON 往返和重建队列后，同名矿工记为待产能。Governor 显示待产 harvestWork=2、稳定 0，旧回执仍可读，没有触发第二次引擎调用 |
| 成为活体 | 该矿工计入可用，Governor 稳定 harvestWork=2，旧孵化备份清理。旧策略仍可请求补足同源工作部件 |
| 下一 tick 两种原生身份都缺失 | 旧备份和未过期回执仍在，该条人口却为 invalid；回放中的旧策略可以发起新 ID 的本房请求。此场景是合成输入，用于冻结现有语义，未确认在线上发生 |

[回放入口](../../../src/tests/home-spawn-recovery-baseline.cjs)记录每帧 Game 输入、恢复态、人口、Governor 产能、旧意图、接纳、动作调用和回执。[冻结快照](../../../src/tests/fixtures/w49n41-legacy-spawn-recovery-baseline.json)含 10 帧。运行 npm test 会执行该快照对照及既有 smoke／room-governor 测试。后续回归若改变快照中已经固定的旧语义，须逐项解释变化。

该回放只推进补员身份和产能，未模拟真实取能、运送入 Spawn 或 Controller 的持续运行。P1 上线验收仍需同版本的原生补员和恢复供能证据，以及原单房 10,000 tick 窗口和场景覆盖。
离线核对：npm test 退出 0，smoke 和 room-governor 检查通过，Node 测试 1008 项通过、0 失败。
