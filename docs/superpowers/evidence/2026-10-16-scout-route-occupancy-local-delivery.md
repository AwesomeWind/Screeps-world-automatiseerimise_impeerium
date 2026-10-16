# Scout 工位避让：本地实现与验证

日期：2026-10-16。工作分支：`codex/single-remote-mining`，起始 HEAD：`b43b736027b60df73f756d1a9c14308e0f33547a`。

本轮根据用户“继续下一步功能完善”执行已提出的有限避让方案，仅本地实现、测试和构建。未暂存、提交、推送、部署；未调用生产 API、修改线上 Memory 或开启侦察、采运、Goal/Plan。

## 依据与实现

前置诊断见 `2026-10-16-route-occupancy-diagnosis-and-proposal.md`：历史帧与原生 tick 对齐后，确认 scout 被母房实际矿工工位阻挡；原生只读 PathFinder A/B 表明存在几何旁路。这里的历史证据没有升级为实际绕行成功证据。

- `RemoteMiningRoute.planRemoteRoute` 增加可选 `occupancyMode`。不传时保持既有经济角色的动态占用语义，非法模式拒绝规划。
- `work_positions` 仅封锁可见房间中真实存在、当前位置与 `memory.miningPos` 或 `task.workPos` 完全一致的己方单位。空工位、仅存于 Memory 的幽灵、其他房间同坐标不算占用；退休实体仍占格。
- `live_creeps` 使用房间当次 `FIND_CREEPS` 快照，覆盖其他当前实体，不依赖对方 Memory。没有缓存、预留账本或持久占用记录。
- scout 入口预检和首次实际规划使用 `work_positions`；同一 leg 消耗唯一一次重试后使用 `live_creeps`。新目标不继承旧目标的重试模式。其他角色没有自动启用这些模式。
- 只跳过起点的动态占用，不清除建筑或危险成本。不豁免被占据的精确目标，range=1 可正常停在旁边。
- 道路不再覆盖已存在的结构阻挡成本 255；占用层位于道路之后，危险层仍最后生效。

没有改动 MOVE 执行器、孵化预算、任务确认算法、城市工位、核心 miner、重试计数规则或控制配置。

## RED → GREEN

正式新增 `src/tests/route-occupancy.cjs`，复用现有 RemoteMining → Bureau → Spawn → Market → Strategy → ActionParser 链。fixture 只提供两条已知走廊及成本选择，移动位置在下一 tick 体现，并模拟目标格被占时 OK 但不位移；它不是完整游戏引擎。

1. 初始 18 项回归在修改生产代码之前运行：8 项通过，10 项按行为断言失败，覆盖固定工位、调用方模式传播、重规划重复撞原格、精确目标、刷新快照和道路覆盖阻挡。
2. 实现后 18 项全部通过。
3. 补充非法模式 RED，以及实时占用不读取外部单位 Memory 的 RED，分别实现并转为 GREEN。
4. 最终新增 35 项全部通过，且已接入默认 `npm test`。

边界包括：range=0/range=1、起点动态排除与静态/危险保护、普通移动者首次不封锁、占用离开后重新开放、真实位置 getter、经济角色 range=0 兼容、无旁路停止、第二次受阻不能获得第三次规划、原 startedAt/expiresAt 不变、hold/disabled/母房敌情/恢复/远端敌情/外来控制/epoch 门槛。

补充测试中的一个错误预期已按现有规则纠正：人为把 scout 改成错误 epoch 后，旧 actor 必须停止，但既有人口策略可补发正确 epoch 的 scout。该用例保留原有补员语义，断言旧 actor 不重试、原期限不变且没有经济角色孵化；本轮没有为测试修改人口策略。正常受阻与无路场景单独断言不追加远程单位。

## 最终验证

| 验证 | 结果 |
| --- | --- |
| `npm test` | smoke、room-governor 通过；Node 测试 251/251，无跳过或失败 |
| `npm run build`，明确移除 `DEST` | exit 0；输出“未指定目标，代码将被编译但不会上传” |
| `git diff --check` / `git diff --cached --check` | 通过；暂存区为空 |
| 维护者检查 | 仅路线成本、scout 调用参数和相应测试；无固定游戏房间/坐标写入产品 |

日志保存在 `.superpowers/sdd/2026-10-16-route-occupancy-diagnosis/`：

- `implementation-red.log`：正式初始 18 项，10 RED。
- `implementation-boundary-red.log`：非法模式 RED 及上述 epoch 预期修正的诊断记录。
- `implementation-physical-only-red.log`：实时占用不依赖外部 Memory 的 RED。
- `implementation-full-test.log`：最终 251 项及 smoke/governor。
- `implementation-build.log`：最终仅编译日志。

## 尚未完成的线上验收

本轮没有读取新的线上状态。关闭状态的最后证据仍是前置诊断记录；本轮未改变任何开关或旧 scout 的过期 leg。

当前结果证明本地调用链与有界恢复契约通过回归，不能宣称 W48N41 已获得真实视野、完成绕行或连续安全验证。后续如另获发布授权，需先提交/推送/部署并回读实际版本，保持功能关闭，再安排独立授权的有限侦察复试。复试不得擅自重置旧 leg 或增加尝试次数；需要核对新鲜的出生/实际位移/跨房视野/安全 streak，完成、异常或达到上限后关闭。实际采运和 Goal/Plan 仍不在本轮启用范围内。
