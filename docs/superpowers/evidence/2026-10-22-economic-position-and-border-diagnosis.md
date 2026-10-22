# 经济试点坐标与边界移动：只读诊断

2026-10-22。本轮仅检查现有代码、保存官方公开引擎参考源并运行一次性本地复现。没有改生产代码或测试，没有连接游戏执行新动作，没有修改线上 Memory、网络、部署或试点锁。

上一轮属于取得有效进展：同会话成功启动、取得 scoped 费用与异常关停证据，同时发现新的坐标及边界问题。本轮继续诊断这些问题，目标仍未完成，不能将旧的“等待 unknown 重试许可”当作当前阻塞。

## 1. 坐标丢失是确定缺陷

上轮原生 tick83794500：`Object.keys(creep.pos)=[]`、展开结果 `{}`，显式读取坐标正常。生产 `RemoteEconomicTrialFacts.collectEconomicTrialFacts` 却使用 `pos: { ...actor.pos }`，而模型直接按 `actor.pos.roomName === targetRoom` 寻找本轮 scout。

上轮一次性本地复现使用真正生产 collector/reducer，仅改变 actor 坐标属性的可枚举性，其余 remoteSafe/sourceValid/routeValid 都通过：普通 fixture 安全计数为 1，原生形态计数为 0。不是视野时间不够，也不能靠反复开跑获得 100 ticks。

同一条实际远程链路还在 RemoteMiningService 的 route.sourcePos/sinkPos 使用原生位置展开。虽然尚未证明这些字段直接触发本次停止，修复时应一并显式提取本链路的坐标，不扩大成整个仓库的无关重构。现有 RemoteReconTrialFacts 和 RemoteDangerEvidence 已采用显式 x/y/roomName，是可参照的既有模式。

## 2. 已复现策略与动作许可冲突

真实 production lifecycle 在本地复现为：

1. 按既有流程接纳经济会话并孵化同身份 scout。
2. 将 actor 放在真实房间方向的远程入口边界；operation 处于 `recovering / safe_streak`，其 allowRecon 和 allowEconomicDeparture 都为 false。
3. RemoteMiningStrategy 明确允许这个处于远程房间的 scout 继续恢复侦察，保留/分配了 MOVE_TO 内侧入口任务。
4. 最终 `RemoteEconomicTrialService.taskPermission` 只允许上述两个 scope 标志为 true 的 outbound，得到 `original_departure_blocked`。
5. 真正 ActionParser 记录 `economic_trial_action_denied`，该 tick 的 scout 原生 moveByPath 调用数为 0。
6. 将公开引擎在出口格、无移动情况下给出的下一位置应用到下一 tick，原模型得到 `vision_lost` 并同步关停；miner/hauler 调用仍为 0。

这里没有删除最终动作守卫，也没有给 mock 强行返回 allow=true。它说明原策略已经允许的“远程恢复期 scout 向内侧入口移动”被最终动作层额外拒绝。放宽采矿、运输或全局 scope 都不是合适修复。

上轮真实中间逐 tick 位置与 task 没有完整留存，因此本地链路与实测现象一致，但不能宣称已经回放了原线上每个 tick。

## 3. 边界起步的原生 moveByPath 约束

公开引擎对 RoomPosition 数组执行 moveByPath：当前格不在数组中时，首格必须与当前格同房间且相邻，否则返回 ERR_NOT_FOUND。使用实际下载的这个方法原样执行，限制依赖替身后得到：

| 输入 | 本地原样方法结果 |
| --- | --- |
| 当前 `(0,24,W48N41)`，路径第一格 `(49,24,W49N41)`、下一格 `(48,24,W49N41)` | -5，未提交 move |
| 同一路径在头部加入原起点作为独立候选实验 | 0，提交 LEFT |

production planner 的 search.path 不含起点，ActionParser 直接将其传给 moveByPath。这类“第一步已经在邻房”的入口可以独立重现 ERR_NOT_FOUND，与实测返程 `move_path_lost` 相符；由于上轮原路径缺失，不能断言原线上首次失败的 path 内容已得到证明。

## 4. 母房边界不能当安全到达

直接调用 production `returnActor`：actor 已位于母房边界且没有 task 时，它只按 roomName 判断已到家，设置 safe_wait，不生成向内移动任务。

公开引擎的 creep tick 在无移动且停留出口格时仍写 interRoom；本地原样执行边界分支，母房边界下一 tick 再进入相邻房间。因此 `roomName===baseRoom` 加 safe_wait 不足以证明安全返程完成。必须验证已经进入母房内侧，或继续合法且仍在原期限内的返程任务。不能使用无限重试或每次刷新期限掩盖它。

## 5. 现有 fixture 的证据能力

- RoomPosition mock 把 x/y/roomName 设为可枚举自有属性，掩盖原生坐标展开缺陷。
- 位移把 actor 直接设置为路径下一点，没有真实出口格自动换房，掩盖无移动边界回跳。
- W1N1→W1N2 在 mock describeExits 中写为 BOTTOM；真实命名下 W1N2 位于 W1N1 北侧。诊断首次方向断言失败后，改为按真实房名换算，再设置正确地图方向；没有修改 production/test fixture。
- 原有 moveByPath 替身直接选 next，不执行原生方向及引擎边界处理。现有绿色链路不能单独证明跨房入口与出口正确。

这些是下一批回归应补齐的模型差异。一次性诊断断言“缺陷已复现”通过，不是产品修复 GREEN。

## 6. 参考与复现边界

只读取得的官方参考（master 于本日读取；不是当前官方服务器引擎版本的独立指纹）：

- [moveByPath 官方源码](https://github.com/screeps/engine/blob/master/src/game/creeps.js#L284-L310)，文件 SHA-256 `3d076a95be32cb71c4f428b12b2cdec0130a9ca0e86c96cfbd25511876c9196b`。
- [出口换房官方源码](https://github.com/screeps/engine/blob/master/src/processor/intents/creeps/tick.js#L45-L70)，文件 SHA-256 `b356cba9ae36caf3cfbc63425b6a462ebc90a1e39b8285e7bb86f82be30c3808`。
- [RoomPosition 官方源码](https://github.com/screeps/engine/blob/master/src/game/rooms.js)：isNearTo 的房间检查；坐标形态另有上轮当前服务器原生证据。

一次性复现目录 `.superpowers/sdd/2026-10-22-economic-position-border-diagnosis/`：`reproduce-boundaries.cjs`、`boundary-reproduction.json` 及带哈希的上述两份源文件。只执行所需分支，依赖提供最少 lodash 原语和无移动 processor 适配；并非完整引擎、地形、碰撞或疲劳模拟。没有把公开参考的一次源码回放冒充线上复试。

下阶段应先由用户审阅有明确范围的本地修复方案，再实现：显式坐标采集、恢复期 scout 内侧移动许可的一致性、严格相邻边界的原生路径起步，以及母房内侧到达判断。关停、100安全ticks、身份、预算、重试上限和原期限保持原合约，默认关闭；发布与再开试点另需对应授权。

## 7. 后置线上返程证据

随后只做了一轮有限只读查询，未获得或执行新启动许可。数据保存于 `.superpowers/sdd/2026-10-22-approved-fragment-retry/postflight-readonly-1792631379780.json`，交叉核验位于本诊断目录的 `tail-followup-evidence.json`。

| tick | 实际样本 |
| --- | --- |
| 83794665 | 会话仍为同一身份、terminal/vision_lost，原请求、slot、费用、unknown和冻结outcome与初次关停样本相同；执行开关仍关闭 |
| 83794666 | 母房正常，terminal剩余容量300000，无远程孵化accepted记录 |
| 83794667 | 唯一远程actor仍是原scout，位置 `(0,24,W48N41)`，TTL1264；operation.disabled，recon/economic权限false |
| 83794670 | scout位置 `(49,24,W49N41)`，TTL1261，task=null，返程leg.safe_wait/leg_expired；retryCount=1，原expiresAt=83794507未延长 |

这些分次样本明确显示 scout 在原返程期限之后仍在两侧出口格换房，不能把“已经在母房”或 safe_wait 算作内侧归位。尚未达到 tailExpiresAt=83794752，不能提前宣称尾部窗口已完整结束；游戏 tailStatus 仍为 unverified。没有杀死、移动或重新派发这个 scout。

只读诊断模式前两次返回HTTP502，第三次成功，保留两次失败，未突破最多三次的读取额度。它不是持续采样，也不证明网络已根治。原始执行文件封存哈希全部仍匹配；以原会话、原请求和同epoch账本重新运行只读结果验证器，仍为入库0/费用50/unknown0、已知收支差额-50、receiptVerified=false、netEnergy=null。没有把旧侦察或其他会话费用并入本轮。

这轮证据进一步支持优先修复边界返程，仍不授权跳过待审阅设计或重开试点。
