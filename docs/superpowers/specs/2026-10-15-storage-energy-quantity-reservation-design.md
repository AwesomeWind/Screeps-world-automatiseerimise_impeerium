# 母房 storage 能量数量预留设计（已认可）

日期：2026-10-15。基线：`codex/single-remote-mining`，HEAD `b89a995ed31d5a61a0e8e64a69c7af32f39e1542`；在线逻辑提交 `88348d6`，SERVICE_VERSION `1792045244478`。

本文最初用于调查与方案审阅，用户随后已明确认可并授权本地分批实施、回归、完整测试和构建。提交、推送、部署和在线 Memory 修改未获本轮授权；远程矿保持关闭。

## 1. 已确认事实

这不是把预留数字 100 错算成了全部库存，而是原有策略将供给视为独占入口。

- `ResourceMarketService.getAvailableSupplyAmount()`：同一 supply.id 只要存在未过期预留，直接返回 0；文件顶部的兼容函数 `availableSupplyAmount()` 也相同。
- `ResourceReservationFeedback.reserveForTask()`：同一 targetId/resourceType 已有任意正数 supply 预留时，拒绝新的 supply owner；这层检查跨 entryId 生效。
- 因此仅修改可用量会让报价与实际派单继续不一致；仅按 entryId 扣减也会漏掉同一 storage 的事件供给等别名。
- `2026-10-13-single-room-survival-recovery-design.md` 的 E0 明确要求“供给保持当前独占策略，需求保持 quantity 预留”。当前行为符合当时的保守设计，现需要有边界地升级。
- 初始 TTL=5 ticks；真实任务可经 owner 协调有限续期，但原始 maxTaskTicks=50 不改变。因此影响不一定仅持续一次 TTL，也不是永久锁死。

现场证据：tick 83656752，storage 有 999750 energy，repairer 的 supply owner 仅预留 100、expiresAt=83656757；其他 builder 的报价改选源头容器，成本仍为正常的 22。该现象与已经发布的距离 NaN 修复相互独立。

本轮本地使用真实 requestResource/reserveForTask 重放（只构造测试世界，不执行游戏动作）：

| 项目 | 实际结果 |
| --- | --- |
| storage 库存 | 999750 |
| 第一 builder 预留 | 100，目标 storage |
| 同 entry 的可用量 | 0 |
| 换一个 entryId 的可用量 | 999750 |
| 换 entryId 后真正申请第二预留 | false，仍被物理目标预留挡住 |
| 第二 builder 的实际计划 | PICKUP，选择远处掉落资源 |
| 按数量应剩余 | 999650 |

原始本地重放：`.superpowers/sdd/2026-10-14-single-remote-mining/storage-reservation-local-reproduction.mjs` 及同名 JSON。它证明派单因果链，不是修复后的测试通过证据。

最新只读检查 tick 83656806：在线版本未变，remoteMining.enabled=false、Governor shadow=true、scheduler.enforce=false，母房 recovery=normal，miner 2、hauler 3。GET tick 83656805 terminal 为 13977/100000，尚未建成。

## 2. 方案比较

| 方案 | 优点 | 代价/限制 |
| --- | --- | --- |
| A：仅母房 storage 的本地 energy WITHDRAW 改为数量预留（推荐） | 直接处理本次现场问题；可限制到有准确 amount 的存储领取 | 需要统一读写、补齐 task.amount 与旧记录兼容 |
| B：所有 store 资源和容器统一数量预留 | 后续吞吐收益范围更大 | 涉及 controller buffer、矿点容器、远程物流及多资源，更难隔离验收 |
| C：保持独占，仅缩短 TTL 或等待 storage | 改动少 | TTL 内仍阻挡；等待策略可能让有其他合法供给的 worker 停工，不能消除机制限制 |

选择 A。第一批不调整 body、交通、报价权重、任务排序或孵化数量，也不扩展远程矿控制。

## 3. 共享资格与数量契约

共享资格同时满足：目标是当前市场母房内真实己方 storage；资源为 RESOURCE_ENERGY；动作是本地 WITHDRAW；不存在远程 context。该资格适用于本地 builder、repairer、upgrader、hauler 等消费者，使它们在同一数量账本竞争，而不是给 builder 增设特权。

掉落资源 PICKUP 不支持指定 amount，继续独占；container、terminal、carried、远程任务及其他资源继续沿用原供给策略。

统一可用量：

`available = max(0, min(该供给允许的数量, storage 当前实际 energy) - 同一物理目标及资源的有效预留总量)`

- 物理键为 targetId + resourceType；不能以 supply.id 为库存隔离边界。
- 同 tick 两次申请顺序执行，第一次成功写入后第二次立即扣减；允许剩余数量的部分申请，剩余不足时明确失败或由调用方缩减 amount。
- 所有共享领取任务显式写 `task.amount = 本 owner 获准数量`；不能只预留 50 却发出无 amount、可能领取满仓 100 的 WITHDRAW。
- 写入层再次用同一规则校验数量。报价可用不代表必然获准，写入失败不产生任务或新 owner。
- owner 上限继续为每房 200，TTL=5、原始 maxTaskTicks=50；不通过新策略延长到期时间。

## 4. 修改位置与兼容边界

在 `ResourceReservationFeedback` 提供同一套共享资格/物理库存余额规则，供 ResourceMarket 的普通与兼容可用量读取，以及 reserveForTask 的最终接收检查共同调用。复用并完善既有 reservedTargetAmount，避免各分支另算一份库存。

- `ResourceMarketService`：getAvailableSupplyAmount 与顶部兼容读取统一语义；getPickupAmount、getPickupAmountForDemand、createSelfFetchTask 等消费同一余额；共享 storage 的 self-fetch 也必须带准确 amount。
- `reserveForTask`：对符合资格的新预留使用数量上限；其余 supply 仍执行现有独占检查。按物理目标跨普通 supply/event-supply 等别名扣减，不能通过换 entryId 绕过库存上限。
- 对新数量 owner 增加可忽略的 `allocationMode: 'quantity'` 标记，任务引用沿用现有复制机制。发布前的 owner 没有该标记，不能假定其旧任务已经约束了 task.amount；在其结束前继续视为独占。
- 旧匿名记录保持其原 TTL 与独占保护，不把未知旧领取量视作 0。已知 entryId 格式可保守映射物理目标；无法确定归属的旧匿名 supply 记录存在时，暂缓该房新增 storage 数量共享直至它按原规则到期，不猜测目标、不删除旧记录。
- 兼容路径 `reserveSupplyAmount` 当前直接替换 record。必须禁止它覆盖仍有效的 owners 或匿名记录；无法安全预留时不返回未预留任务。旧兼容领取保持独占即可，不强行加入数量共享。
- 每个 owner 依然拥有独立 reservationId。取消、死亡、目标消失、任务替换、超时只释放相应 owner；不能清空同一 storage 的其他 owner。

## 5. 跨 tick 结算与 unknown

引擎 OK 仍只表示接受动作；当 tick 保留 owner，下一 tick 才依真实 store 协调。global reset 后继续从 Memory 的 owner/taskMeta/lastTaskClear 恢复，不新建仅在 global 的长期账本。

并发领取会让 storage 的总减少量不等于单个 owner 的增加量；同期 hauler 补入也会抵消 storage 减少。第一批不修改 confirmOwner 的等量匹配标准，不把 intended amount 或 storage 的合计变化强分到各 owner。不能确定的动作如实记 confirmationUnknown，并在新鲜 tick 处理已结束任务的 owner 释放；不能因 unknown 持续占有库存或记成确认收入。

本次数量预留保证分配不超库存，不能保证所有并发动作都可精确归因。更完整的并发计量若需要，另行设计；不混入远程矿 income ledger。

## 6. 必须先 RED 的回归与发布后验收

后续实施按三个顺序批次：统一数量余额与接收检查 → 精确 amount/兼容 owner 保护 → 跨 tick 回归和完整门禁；每批先 RED 再修复。

主要用例：

1. 999750 energy、两个 builder 各 100：两者都获 storage WITHDRAW，amount 均为 100；读取余额为 999550；远处供给排序前后互换均不改变本场景选择。
2. storage 仅 150：首个获 100、第二个至多 50、第三个无额度，实际任务 amount 与预留一致；库存 0、数值非法或目标不见时不能超额获准。
3. 普通 entry/event 别名指向同一 storage，预留总和仍受同一库存限制；不同资源/目标不串账。
4. PICKUP 与非共享供给保持独占；远程任务不进入数量共享，既有远程预算/回执回归保持通过。
5. 一个 owner 取消/死亡/替换，只释放自己；重复协调幂等；旧匿名记录、旧未标记 owner、兼容写入不得被覆盖。
6. 同 tick OK 不确认；下一 tick 单 owner 可确认；并发净变化不匹配则 unknown 且释放结束 owner；global reset、不新增长期续期、200 上限仍有效。
7. 库存因其他实际动作下降后，下个 tick 按真实库存重算；不能把预留当作游戏已保证履约的资源。

完整 npm test、npm run build、工作区与暂存区 diff 检查通过后才具备本地交付条件。提交、推送、部署需要后续明确授权。

获准部署后，从新版本独立窗口观察两个 worker 实际对 storage 的领取、准确 task.amount、owner 总额/取消/释放、实际 store 与 terminal 进度，并记录 unknown；不能只凭两个派单成功或施工数字增长宣布验收。remoteMining.enabled=false、Governor shadow=true、scheduler.enforce=false、market.enabled=false 始终保持；不为验证强制派单、移动单位或制造生产故障。
