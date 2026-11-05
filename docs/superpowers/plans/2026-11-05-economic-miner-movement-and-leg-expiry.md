# 远程矿工占用避让与 leg 硬过期关停

2026-11-05。实施前方案与回归计划。历史反馈 GET 返回 HTTP 200，目标路径缺失。本次实机停滞的具体阻挡者仍未知，修复依据是已复现的占用避让缺口和已证实的关停缺口。

两走廊夹具中，scout 的初次和重规划对同一被占工位均设代价 255，矿工两次均为 1。实机矿工在 W49N41 (33,23) 携能 0，重规划次数 1，原 leg 在 84079534 到期。84079794 的查询仍显示 `safe_wait` 和 `leg_expired`，试点继续 `preparing`。输入真实过期 leg 的离线回放也没有产生 `close_scope`。 [诊断证据](../evidence/2026-11-05-miner-movement-local-diagnosis.md)

## 第一批　复用占用模式

- 在 `RemoteMiningStrategyService.moveActor` 给当前经济试点绑定的 `remoteMiner` 选择已有占用模式。判定复用现有经济许可和 actor 身份，覆盖出发和允许的返程。初次规划用 `work_positions`，同一 goal 的唯一重规划用 `live_creeps`。scout 继续使用既有分支，普通非试点矿工和运输者沿用既有策略。 [移动策略](../../../src/strategies/RemoteMiningStrategyService.js)
- 复用 `planRemoteRoute` 的成本矩阵。首次只屏蔽此刻实际站在采矿工位或任务工位的单位。重规划重新读取可见房间活体，避开普通移动单位及已变更位置的阻挡者。起点豁免仅适用于占用叠加，静态结构和危险区成本仍为 255。 [路径规划](../../../src/services/RemoteMiningRoute.js)
- 精确工位继续遵守现有相邻等待条件。占用解除后，只在原 leg 窗口和剩余重规划额度内恢复。唯一重规划无路时进入既有等待与失败路径。保留原 goalKey、startedAt、expiresAt、冷却和 retryCount。同一 goal 最多一次重规划，原 leg 计算和 300 tick 上限继续适用。

## 第二批　用当前未完成的 leg 触发既有关闭

1. 在 `collectEconomicTrialFacts` 从当前 Game actor、会话和正式 slot 归约移动事实。只检查 active、managed、尚无 outcome 的会话。actor 须与 slot 的名字、角色、试点身份和 epoch 对上，slot 已确认接纳，actor 已结束孵化。会话版本仍由原模型和运行时版本核对。目标归属使用原 goalKey、房间坐标和当前 operation 的 recoverySequence。旧目标被替换、已清除或属于旧恢复轮次时，旧期限退出本次判定。 [事实采集](../../../src/services/RemoteEconomicTrialFacts.js)
2. leg 建立时随原 goalKey 记录目标坐标、原 range 和完成条件。重规划沿用同一份元数据。到达用实际房间与切比雪夫距离判断。采矿工位要求 range 0，接收端与取货接近用原 range。安全返程沿用母房内侧条件，即两个坐标都在 1 至 48，边界格继续处于返程中。带货向接收端行进依旧按接收范围判定。`safe_wait` 或空任务本身只提供状态线索。
3. 兼容旧 leg。优先用与该 leg 匹配的当前 MOVE_TO 任务确定 range。任务已清除时，仅对可从本轮角色和目标还原的形态作判断。已保存矿工的远端目标与固定容器位点一致，原 range 为 0。无 goalKey 的旧 scout 记录和已达目标的 actor 排除过期关停。相同坐标但不同房间视为未到达。目标语义无法还原时保留证据，继续由既有安全检查判定。旧记录原样保留。
4. 当前已绑定的 leg 仍未到达，且 `Game.time > expiresAt` 时，归约 `movement_leg_expired`。截止 tick 本身仍按原规则可执行。判定独立于 Strategy 是否已经写入 `blockedReason`，涵盖任务清空后同一 goal 硬过期的情形。短暂堵塞、疲劳和仍在原窗口内的重规划继续走既有流程。
5. 通过现有 `facts.fatalReason` 接入 `advanceEconomicTrial` 和 `stopEconomicTrial`。沿用危险、身份和预算等判断的优先级。P0 的 `evaluate`、`end_tick` 与动作检查共用事实判定。P0 无显式 scope 参数时仍可从当前 Game actor 和本轮 operation 判断，既有 `scopeFresh` 行动门槛继续单独校验。关停沿用 `close_scope`、`cancel_unstarted` 和 `clear_economic_tasks`，保存失败时现有 `finally` 负责执行撤权。诊断只保留有界的 actor、位置、目标、过期 tick 和重规划次数。 [经济模型](../../../src/services/RemoteEconomicTrialModel.js) · [执行与撤权](../../../src/services/RemoteEconomicTrialService.js)

后续 tick 按原规则验证关闭，尾部截止仍为 `closeAppliedAtTick + 300`。移动故障进入停止原因，费用、unknown、已确认回流和未决记账继续采用原规则。正式 Spawn 的 5 tick 期限、独立 100 安全 ticks、预算与整轮窗口均沿用原配置。

## 回归计划

各批先跑对应 RED，再实现并跑 GREEN。占用测试使用生产 strategy、roomCallback 和位置推进夹具。关停测试覆盖纯模型和运行时入口，核对实际引擎调用与权限变化。

| 用例 | 通过条件 | 位置 |
| --- | --- | --- |
| 本轮矿工初次规划遇到活体占用的工位 | 占用格代价 255，走可用绕道。空工位、幽灵 Memory、本人起点保持现有规则 | `route-occupancy.cjs` |
| 初次路径可走，随后普通 creep 占住下一步 | 原失败反馈触发原冷却。唯一重规划使用新的活体位置，确实绕行并观察到位置变化，retryCount 为 1，startedAt 和 expiresAt 逐值一致 | `route-occupancy.cjs` |
| 所有通道都占用、精确目标被占、占用者离开 | 无绕道时走既有等待或失败路径。额度用尽后没有第二次重规划，原 deadline 到期后占用解除也不复活该 leg | `route-occupancy.cjs` |
| 已保存矿工硬过期形态 | 仍在母房 (33,23)，远端目标为 (19,6)，retryCount 1，任务已清除。`tick == expiresAt` 保留现有许可，下一 tick 进入 stopping 并产生关闭效果 | `economic-trial-model.cjs`、`economic-trial-runtime.cjs` |
| 已到达但仍有旧 leg | 回放已到入口的 scout、已站在容器位点的矿工，以及已到母房内侧的安全返程。旧期限已过也不触发停止。另测带货 actor 只进入母房但尚未进入接收范围，仍按原送货目标判断 | `economic-trial-runtime.cjs`、`scout-movement.cjs` |
| 旧会话、旧 goal、尚在孵化、短堵或疲劳 | 旧记录不会触发本轮移动过期判定，新 leg 保留自己的期限。原身份冲突检查继续生效 | `economic-trial-model.cjs`、`economic-trial-runtime.cjs` |
| 真实关停链和保存失败 | 同 tick 撤销原 scope，后续出发、采矿、建设和孵化调用被拒绝。后续 tick 验证关闭，原返程尾部仍可用。注入保存失败仍执行撤权，重载后保留原账目和尾期 | `economic-trial-runtime.cjs` |

定向回归通过后，运行完整 `npm test`，检查原生跨房、Spawn 接纳、旧父兼容、次 tick 入库确认、费用与 unknown 隔离等既有场景。构建检查安排在无 `DEST` 的本地隔离目录，保留现有发布产物。运行时验收仍以未来对应授权下取得的真实移动、入库和关闭证据为准。

本轮交付为上述方案和回归计划。代码实现及测试运行待后续实施阶段。
