# Terminal builder 供能与移动诊断

时间：2026-10-15，主要原生采样 tick 83656464–83656528。采样为离散快照，不构成连续窗口验收。

## 结论

确认资源市场自取能量报价存在原生坐标接口缺陷，会使候选供给的距离成本成为 `NaN`，没有可用配送者时选中列表中第一个可用供给，失去距离排序。母房有充足 energy；builder 已实际远离 terminal 取能。该缺陷可以解释部分无效往返，但本次没有测量修复后的效率，不能承诺施工提速倍数。

builder 移动与施工仍能完成，未发现 terminal 工位被永久堵死的证据。短暂单位占位和疲劳确实存在，需与报价错误分别处理。terminal 尚未建成，远程矿仍关闭。

## 当前版本和安全状态

- 工作区：`C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium`，分支 `codex/single-remote-mining`，HEAD `d9b426b4442928def785fd39f7fb00d0d49b4208`。
- 已部署逻辑提交：`c3cc9289055398751aab95aa69a14b4b54dd629a`。
- 在线版本：`1792031787998`；GET 回读 main SHA-256：`970cfea00c52d69e9394e333657934e6401ee1c80b6552f4b3f0988264c0b600`。
- tick 83656528 原生检查：`remoteMining.enabled=false`、Governor `shadow=true`、scheduler `enforce=false`；母房 recovery 为 normal，miner 2、hauler 3，bucket 10000。
- tick 83656520 GET：market.enabled=false，Controller 距降级 150000 ticks。
- 本次只读 GET 和无副作用的原生查询，没有派任务、操作单位、修改在线 Memory、额外建设或部署。原生查询仅构造临时 request、计算报价与路径。

## 供能：库存充足，但自取报价失效

1. tick 83656464 原生 ResourceMarket 将 storage 列为可用 supply，available=999816，策略 shouldSupply=true。并非母房没有能量或 storage 被完全预留。
2. `BuilderStrategyService.assignEnergyTask()` 将 `targetPos` 传为普通 `{x, y, roomName}`。`ResourceMarketService.normalizeRequest()` 的默认坐标也是这种形态。
3. `ResourceMarketService.rangeBetween()` 在起点有 `getRangeTo` 时直接调用 `fromPos.getRangeTo(toPos)`，未转换普通坐标。
4. tick 83656514 游戏运行时，对完全相同的目标坐标进行对照：

| builder 位置 | storage 到普通坐标 | storage 到 RoomPosition | storage.getRangeTo(x,y) | service.rangeBetween |
| --- | --- | --- | --- | --- |
| (37,26) | NaN | 6 | 6 | NaN |
| (31,23) | NaN | 1 | 1 | NaN |

JSON 将非有限数序列化为 null，因此早期 `cost:null` 并非报价为空。后续以 `String(...)` 明确确认是 `NaN`。

5. `findBestSelfFetch()` 的成本为 requesterDistance + workDistance + penalty + bias。workDistance 为 NaN 会污染总成本；首次候选被保存，此后 `cost < best.cost` 始终为 false。因此它选择的是遍历顺序中的首个有效供给。`requestResource()` 在没有 delivery 候选时仍会采用这个自取候选；有 delivery 候选时，NaN 也会使自取与配送的成本比较失效。
6. tick 83656519，调用同一部署服务的纯报价方法，仅将临时 request.targetPos 转为 RoomPosition：位于 (39,28) 的 builder，原输入选择 (29,21) 掉落能量、成本 NaN；转换后的输入选择 (43,30) 容器、成本 10。此对照没有执行取能或创建 reservation，也不是修复后的实际运输验收。

测试缺口：当前 smoke/remote fixture 的 `getRangeTo` mock 接受普通坐标对象，与本次真实原生行为不同，过去的本地回归没有覆盖这个边界。

## 移动：有往返和疲劳，没有证据表明持续卡死

- builder_83656390 在 tick 83656490 于 (41,30) 满载返回；83656493 到 (39,28)，83656496 到 (38,27)，83656499 到 (36,25)，83656514 到 (31,23)。这是实际位置变化，不只是 moveTo 返回 OK。
- 工位 (31,23) 在 83656490 被 hauler 占用，83656493/496 已空出；后续 builder 到达该处。只能确认临时占位，不能称为持续堵塞。
- tick 83656526，另一 builder 满载位于 (41,30)，目标工位 (31,23) 无占用；考虑单位的原生 findPathTo 返回 10 步路径。fatigue 从 4 降到下一采样的 0，符合移动后的等待；路径计算不是实际往返验收。
- 两名 builder body 均为 6 WORK / 2 CARRY / 2 MOVE，容量 100。快照多次出现 fatigue 2/4/8；重工作 body 自取能量时存在行走成本。尚未证明需要改变 body 或全局交通规则，优先消除已经复现的报价错误。
- repairer 的 (30,23) 工位同时有闲置 defender 占位；这属于另一个局部占位现象，不能据此认定 terminal builder 被堵死。

## 施工进度

工地 `6ad037f78f37602edb5b26e8`，真实位置 W49N41 (32,24)，总进度 100000。

| tick | progress |
| --- | --- |
| 83656409 | 11477 |
| 83656444 | 11577 |
| 83656520 | 12077 |
| 83656527 | 12077 |

83656444→83656520 的 76 ticks 增长 500。施工仍推进，但短窗口不能用于预测准确建成时间。storage 最新仍满，terminal 未提供任何新增接收容量。W48N41 路线验证继续等待真实接收目标。

## 建议下一步

先单独修复 ResourceMarket 的坐标距离边界，确保原生 RoomPosition 与持久化普通坐标都产生有效成本，并明确处理缺失/跨房间输入；不要仅在 builder 调用处补转换。通过真实 requestResource 流程增加回归，模拟本次原生接口行为，检验供给顺序互换、近端 storage、无闲置 hauler 和自取/配送比较。

修复后再跑完整测试与构建，单独审阅发布；线上通过独立新窗口核对有限报价、实际取能目标、往返位置和施工增量，再决定是否需要交通或 body 调整。此次仅检查和保存诊断，没有修改生产实现、提交、推送或部署。

## 原始证据

工作区 `.superpowers/sdd/2026-10-14-single-remote-mining/`（本地忽略目录）：

- `native-supplies-1792044237410.json`
- `native-quotes-1792044332467.json`
- `native-workers-1792044346257.json` 至 `native-workers-1792044403791.json`
- `native-distances-1792044476025.json`
- `native-rank-1792044501531.json`
- `reception-readonly-1792044510072.json`
- `native-flow-1792044536170.json`、`native-flow-1792044540314.json`
- `native-inspect-1792044544872.json`

以上是 API/游戏原生运行时证据，没有将其称为浏览器页面验收。
