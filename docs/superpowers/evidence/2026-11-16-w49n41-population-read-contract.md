# W49N41 人口与可用产能读契约

P1.1 基于 8399eac 和 [P0 回放](2026-11-16-w49n41-legacy-spawn-recovery-baseline.md)。游戏实体来源仍为 Game.creeps、Spawn.spawning、旧 Memory 角色及孵化备份，按名字去重。读取不修改 Game 或 Memory，返回的原对象引用按只读使用。

| 身份／证据 | 配额占用 | 房间恢复与 Governor |
| --- | --- | --- |
| Bureau 意图、EventBus 队列或 Spawn 接纳席位 | Bureau 在当轮可为意图预留配额，人口中没有对应实体 | 不计可用或待孵化产能 |
| accepted，当 tick 的成功孵化备份，记录指向存在的 Spawn，且备份未过期 | 有角色且无已知功能缺陷时覆盖配额 | spawnInProgress；有已知的有效部件才量化待孵化产能 |
| spawning，原生 Spawn.spawning 或 Game.creeps 的 spawning 标志 | 缺 body 时仍可凭已知角色占用配额 | spawnInProgress；角色可计入 coreUpcoming。缺 body 的能力部件数是未证实，聚合产能不增加 |
| active，存活且高于补员提前量 | 若构成角色的部件已全部失活则不覆盖 | usableForRole 要求角色、已知 body 和必需功能部件；Governor 只聚合有效部件 |
| retiring，TTL 小于等于 body.length×CREEP_SPAWN_TIME+提前量，默认提前 50 tick | 不覆盖稳定岗位 | 有效部件显示在退役能力中。RoomPhase 仍可核对在母房的退役运输者实际携带能量 |
| invalid，旧备份或仅有过期身份依据 | 无占用 | 不计待孵化、不计产能。仅有 Memory.creeps 的同名孤立条目不构成人口记录 |

保留三个不同的量。spawnInProgress 表示孵化进度身份。coversQuota 表示角色配额覆盖，缺 body 仍可保守计入。usableForRole 表示当前角色可用。Memory 的 retire 请求独立保留，运输者仍可先卸货。已知部件失活会使对应角色无法继续提供功能。Governor 与 Bureau 共享 activeParts，避免另行解释 body。RoomPhase 的阶段和恢复判定读取同一次人口采样；单独调用入口仍可自行采样。

## 回放和证据范围

[历史样本](../../../src/tests/fixtures/w49n41-native-population-frames.json)摘取自 11 月 6 日母房逐项只读探针的原生 JSON，版本 1793956506790。两次采样都处于 normal 且可用矿工为 2。tick 84105972 是可用运输者 2、待孵化 1、Spawn 忙且剩 7 tick。tick 84106027 是可用运输者 3、待孵化 0、Spawn 空闲。原样本没有单位逐个 body，离线重建只用最小可用本地替身核对计数，无法据此认定线上逐个单位的可用部件数。

[离线回归](../../../src/tests/home-population.cjs)另用合成反例覆盖待接纳、接受后失去原生可见性、再次可见、缺 body、WORK 部分失活、CARRY 全失活、退役临界及持久 Memory 读取无副作用。P0 的冻结输出仍逐帧比较。线上真实补员和恢复供能由 P1.4 单独验收。

验证记录：共享字段在实现前有 3 个预期失败；实现后新增 4 个场景与 P0 快照通过。npm test 退出 0，smoke、Room Governor 和 1012 项 Node 测试通过。未指定 DEST 的 Rollup 编译退出 0。
