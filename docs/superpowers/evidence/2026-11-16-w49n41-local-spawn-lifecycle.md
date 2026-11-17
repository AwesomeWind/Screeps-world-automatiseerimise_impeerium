# W49N41 单房补员接纳与出生回执

P1.3 以 8399eac 的生产基线和 [P1.2 影子对照](2026-11-16-local-spawn-priority-shadow.md)为输入。P1.3 在离线模拟中选择 W49N41。新增 policy.spawnIntake.localReplacementPilotRoom 默认 null，最多指定一个己方房间，只有本房矿工及运输者使用新回执。选中时先比较旧决策与新决策，差异或异常时仍由原结果发布。升级者、建造者、维修者、外部／远程请求仍使用原路径。SpawnBureau 是唯一发布者，SpawnService 仍是唯一实际引擎调用者。

## 身份、时限和回退

| 证据 | 动作及持久结果 |
| --- | --- |
| 旧 Spawn 仍忙或能量未达到候选成本 | 保持旧拒绝原因，未建立试点回执。原事件可留到原到期期限，过期不执行 |
| 实际分配了 Spawn 和能量席位 | 保存原 EventBus ID、配额、角色、单位、Spawn、admittedAt、原 expireAt 和候选成本。此时 state=admitted |
| 调用前 | 校验原身份和当前房间开关，要求仍在接纳 tick 且在原期限内。保存 calling 标记后才调用；body、角色与原期限固定在已分配的任务上 |
| 已知 API 结果 | OK 记 spawn_accepted 并继续产出原成功备份和旧回执。确定错误记 failed。试点中本请求调用一次，下一 tick 可按正常需求发起新请求。重置时只有 admitted 的记录标为 not_called |
| 调用异常或中断 | 保留 unknown 或可恢复为 unknown 的 calling，原请求不重放。在原生对象最大可见窗口内，新 ID 的同配额请求也暂缓；没有取消其他配额的同房自救 |
| 原生对象读回 | 同 Spawn 所见的原名可证明正在孵化，状态为 spawning。Game.creeps 包含同名、同 requestId、角色、母房和配额绑定，且不再 spawning，才记 born。不通过补写成功码来解释未知调用 |

新记录在 Memory.empire.localSpawnReceipts，缺省时不创建，最多保留 200 条。原提交期限固定为原 EventBus 的发出 tick+1。独立观测期为接纳 tick+body.length×孵化时间+10，与旧孵化备份的保留公式一致，不能用于执行或重试。此期用于防重复和观察，超过后原接受记录按有界收据规则退出；格式更新独立保留旧成功回执写入、读取和清理。

回退先在同一版本撤下房间选择。旧需求恢复后仍会看见当前版本保存的未决同名配额，已接受单位继续由游戏孵化。若要回到旧二进制，须先保存新旧回执、等未决观测结束并复核现有 Spawn 与单位，因为旧二进制没有该回执的防重复逻辑。线上若必须先应急回退，应以具体现场证据判断旧代码接手前可恢复的状态。

## 验证范围

[离线回归](../../../src/tests/local-spawn-lifecycle.cjs)经真实 SpawnBureau／EventBus／SpawnService 入口，覆盖房间选择、忙与到期、重复候选、成功后仍在孵化、跨重置的未知、同身份出生、确定失败、开关撤权、队列变更和出生后实际业务链。出生后调用真实 RoomPhase、ResourceMarket 和 ActionParser，模拟引擎在下一 tick 执行取能与送能，Spawn 库存由 100 增至 200。此样本证明补员接上了供给链，完整恢复出原滞回区仍待观察。

测试模拟了引擎回执、跨 tick 提交、Memory JSON 重建及原生对象可见性。真实引擎在硬 CPU 截断下，调用前 Memory 标记与游戏动作的持久性仍未核对。任何生产切换先单独获准并核对原许可；本轮改动和回放均在本地。

验证记录：首批 5 项按预期在旧链失败，补偿回归也在修复前暴露出队列引用可变。9 项新增回归最后均通过，原 P0 快照无差异。npm test 退出 0，smoke、Room Governor 和 1030 项 Node 测试均通过；Rollup 未指定 DEST 的离线编译退出 0。
