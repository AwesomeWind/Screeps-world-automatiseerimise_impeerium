# W48N41 首批入库试点：本轮视野丢失中止

2026-10-22。结论：已按用户的单次重试许可启动，同一会话在侦察阶段因 `vision_lost` 自动中止，随后核实关闭。未进入实际采运，首批入库目标未达成。没有提交、推送、部署或切换节点。

## 授权与执行边界

用户明确允许 unknown 首片额外重试一次、完成剩余分片和单次启动；另明确将外部停止/总截止日期改为 10 月 22 日的 19:06:53/19:08:53。旧的 10 月 21 日记录、日志和锁均保留；没有重做配置准备、stageRequest 或旧侦察锁释放。

本轮沿用 `econ-w48-20261021-01 / sequence=1 / epoch=2`。最多 1 scout、1 miner、1 hauler，独立 100 安全 ticks；原孵化和基建预算、1000 ticks/90 分钟期限均未放宽。新外部窗口及其不可变约束通过 68/68 本地运维测试；不替代游戏验收。

服务器 `default` 活跃分支核对匹配：

- 代码 `3f0f8d03ff4eac3db54a775aa6a951b6f01435df`，运行版本 `1792555927985`。
- main SHA-256 `74ee3269ab7b8c4c11827602c68cfbd39de3d2627c43bf84c2468da9eb8e6bd9`。
- map SHA-256 `fe59ff42a273cf29eb8ff9520a15437404c044cd01d37cd9c4f3b284cb094e93`。
- 开始和结束均只读确认 A01，未修改共享网络。

## 真实执行记录

| tick | 已验证事件 |
| --- | --- |
| 83794417—419 | 新鲜预检：版本/母房/预算/terminal 通过；原请求未计时、指纹空，未存在经济会话 |
| 83794420 | 仅重试 `appendFingerprint-0` 一次，长度 266，随后读回确认 |
| 83794424 | 剩余片确认，完整长度 542 |
| 83794428 | 只提交一次 finalStart，并读回完整原请求 |
| 83794429 | 游戏内接纳；本轮 scout 孵化成功，费用 50；原期限固定为 83795429 / 1792635706177 ms |
| 83794442—444 | scout 已出生，位置 `(42,25,W49N41)`，实际位移成立 |
| 83794451 | operation 持久事件进入 recovering/safe_streak，经济会话记录 visionAcquired=true，但 safeStreak=0 |
| 83794452 | 游戏内中止：`aborted / vision_lost`；同 tick 撤销权限 |
| 83794453 | 后一 tick 确认关闭 |
| 83794455—457 | 原协调器核实 terminal 终态与远程全局 false、房间 false/hold、recon/economic 权限 false，结束进程 |
| 83794478—481 | 独立后置只读核对：仍关闭、母房正常；scout 在 `(0,24,W48N41)`，基建及物流未开始 |
| 83794493 | 持久记录显示返程重试耗尽：`move_path_lost`，原返程 deadline=83794507 未延长；当前视野无敌人、无占领或预留 |
| 83794500 | scout 位于 `(49,24,W49N41)`，说明至少已回到母房边界；未证明到达内侧安全等待点 |

这里是分次 API/原生 console 证据，不是连续采集或浏览器验收。最新没有敌人不证明中止 tick 没有危险；本次停止原因只能按 `vision_lost` 记录，不改写成 danger。

经济守卫 `economicTrial.enabled=true` 和 managed 终态锁保留，防止同请求重入；它不等于远程执行权限仍开放。remoteMining.enabled=false、房间 enabled=false/hold=true、allowRecon=false、allowEconomicDeparture=false；Goal/Plan=false、市场=false、Governor shadow=true、scheduler enforce=false。没有另行 release、清锁或重启。

## 本轮收支和验收

| 项目 | 同一会话核对结果 |
| --- | --- |
| scout / miner / hauler 实际成功孵化 | 1 / 0 / 0 |
| 确认孵化费用 | 50，slot receipt 与 epoch2 账本增量匹配 |
| 确认基建费用 | 0 |
| 真实母房入库 | 0，没有 firstDelivery 或物流 outbox |
| unknown | 金额上界 0，事件 0；未混入旧侦察 50 或 epoch1 历史费用 |
| 已知收支差额 | -50 = 0 - 50 - 0 |
| 经济验收净收益 | 未验收；验证器 netEnergy=null，receiptVerified=false |
| 尾部恢复 | unverified；已回母房边界不等于返程可靠或尾部全部结清 |

协调器 `finished_closed` 仅说明观察和关停结束。不能将它解释为经济成功。本次已经验证部分失去视野后的撤权与后一 tick 关闭；真实采矿、容器施工、运输、入库归因、盈利、长窗口和其他故障恢复仍未线上验收。

## 新问题的证据与边界

**确定的坐标读取缺陷**：原生 tick83794500 中 `Object.keys(creep.pos)=[]`、`{...creep.pos}={}`，但显式读取 x/y/roomName 正常。生产 `RemoteEconomicTrialFacts.js` 使用 `pos:{...actor.pos}`，而模型按 `actor.pos.roomName===targetRoom` 累计安全 ticks。通过相同生产 collector 和 reducer 的本地复现，仅改变属性可枚举性：普通 fixture 计数 1，模拟原生属性后 collector 得到 `{}`、计数 0；remoteSafe/sourceValid/routeValid 均为 true。此前普通可枚举 fixture 未覆盖原生形态。因此不能只重开试点期待 100 ticks 自行通过。

**尚未定因的边界/返程问题**：原生留存 `lastTaskClear` 指向 tick83794455 的 `move_path_lost / ERR_NOT_FOUND=-5`，返程 leg 重试上限 1 后 safe_wait；后续又见 scout 从远程边界到母房边界。没有 tick83794451—452 的逐 tick 原始位置与路径，不能断言视野丢失由坐标复制直接造成，也不能把边界位置变化当成完整返程通过。

下一步应先本地设计并补充原生形态的坐标采集回归，同时复现两侧边界转移、原生 moveByPath 语义、返程重试与原期限。保持危险/失去视野立即关停，不放宽安全计数或无限重规划。任何修复发布和新一轮启动另按明确授权执行。

后续本地诊断已取得进一步证据，见[坐标与边界诊断](2026-10-22-economic-position-and-border-diagnosis.md)：生产动作许可拒绝恢复期 scout 向内移动，以及原生边界路径起步和母房边界 safe_wait 均已本地复现。它们缩小了修复范围，但不补造本次线上缺失的逐 tick 原始路径。

## 本地证据位置

相对仓库根目录：

- `.superpowers/sdd/2026-10-22-approved-fragment-retry/`：日期许可、执行许可、v4 清单、68 项测试、本地坐标形态复现和独立后置证据。
- `.superpowers/sdd/2026-10-21-prepared-economic-continuation/authorized-a01-fragment-retry-2026-10-22/`：独立 worker/执行锁、服务器指纹、原始 JSONL 与最终状态。
- 所有 Oct21 原始日志、锁和 source 归档继续保留；本轮没有删锁、覆盖旧日志或重试本次 finalStart。
