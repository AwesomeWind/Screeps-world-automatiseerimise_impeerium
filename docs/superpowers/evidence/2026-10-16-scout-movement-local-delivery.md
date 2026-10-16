# scout 移动与有限恢复：本地交付

后续状态：用户已另行授权发布，逻辑提交fe061d4已推送并部署。见[发布及关闭状态核对](2026-10-16-scout-movement-release.md)。下文保留本地交付阶段的边界和验证记录。

日期：2026-10-16。用户已认可修复方案，并授权本地实现、RED→GREEN、完整测试和构建；不授权提交、推送、部署或重新启用侦察/采运/GoalPlan。

工作区：C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium；分支codex/single-remote-mining。HEAD保持6f2633a6747d78ec582fbd0cb847e9906874051e。本轮源码、回归和文档改动留在工作区，未暂存、提交、推送或部署；保留此前未提交的证据文档。

## 实现结果

1. RemoteMiningStrategy跳过spawning对象；ActionParser也不执行或累计孵化对象的停滞。新的leg在出生后按真实位置开始，spawning仍参与现有人口统计，没有为此重复孵化。
2. 路径型MOVE_TO收到ERR_NOT_FOUND时立即记为move_path_lost，保留原返回码。每个creep只覆盖更新一份lastMoveAttempt，包含tick、实际起点、目标、首节点、结果、spawning/fatigue；不保存整条path或无界事件列表。
3. 区分stuck与leg_expired；保留原move_stuck_or_expired清理原因的兼容性，通过movementFailure提供具体类型。
4. 同一leg最多一次重规划，等待2ticks；失败的规划尝试同样消耗预算。retryCount/冷却/已消费失败身份保存在Memory，JSON序列化及runtime reset后不归零。异常计数拒绝继续，不能通过负数、字符串或null取得额外次数。
5. 重规划不改变原startedAt/expiresAt，冷却占用原期限；过期、路线失败或预算耗尽后停止。重试成功恢复原移动状态，避免safe_wait导致安全返程任务被反复取消。
6. 当tick重新核对remoteId/epoch、角色身份、母房健康/危险及侦察/经济gate。hold、disabled、敌情、外部控制、母房恢复、身份变化均不得恢复outbound；原有合法安全返程仍可执行，也受相同一次预算和期限限制。

原生RoomPosition可能只通过getter暴露坐标，不能依赖对象展开。安全返程新增失败回归揭示此问题，本轮在同一移动策略中的接收点和容器目标显式读取x/y/roomName，避免构造空目标；没有改资源市场距离算法或扩大采运配置。

## 回归证据

新增src/tests/scout-movement.cjs及专用helper，已经接入默认npm test。复用现有RemoteMining/Bureau/EventBus/SpawnService/ResourceMarket/角色策略/ActionParser链，专用移动适配器模拟原生RoomPosition[]路径语义、孵化ERR_BUSY、路径脱离ERR_NOT_FOUND、拥堵接受意图但不位移，以及下一tick位置更新；不声称运行完整游戏引擎。

新增25项覆盖：

- 真正出生位置与出生前路径隔离，spawning不重复招募。
- ERR_NOT_FOUND即时识别与固定大小诊断。
- 临时障碍解除后恢复；永久障碍停止；2tick冷却与最多一次重规划。
- 规划失败也消耗一次预算，不每tick重新搜索。
- 原始期限、global reset及Memory JSON往返、旧孵化记录和旧blockedGoalKey兼容。
- hold/disabled、母房危险/恢复、远程敌情、外部控制、epoch变化门槛。
- 疲劳不误计停滞但仍服从原期限；跨房持续前进不误触发重试。
- 原生getter坐标下的安全返程和容器目标；返回任务不被反复取消。
- 非法重试计数拒绝分配额外次数。

两项原有远程回归更新为“最多一次重试且不续期”的明确契约，仍断言最终停止、任务为空、预算恰为一次和最多10次移动调用，没有简单删除不重发保护。smoke的mock补齐实际游戏中存在的ERR_BUSY/ERR_NOT_FOUND/ERR_TIRED常量。

RED→GREEN记录位于.superpowers/sdd/2026-10-16-w48n41-recon/：

| 记录 | 结果 |
| --- | --- |
| 既有regression-red.log → original-three-green.log | 原先3个修复目标从3失败到3通过，原测试内容未改 |
| implementation-red.log → implementation-green.log | 首批14项：9失败/5既有门槛通过 →14通过 |
| return-boundary-red.log → boundaries-green.log | 原生getter安全返程失败 →19通过 |
| return-state-red.log → full-test-third.log | 返程重试仍处于safe_wait失败 →210通过 |
| maintainer-red.log → maintainer-green.log | 计数/原生容器6失败 →25专项通过 |
| full-test-final.log | smoke、room-governor通过；node:test216/216通过，0失败 |
| build-local-final.log | npm run build退出0，输出明确“未指定目标，代码将被编译但不会上传” |

首次专项中曾把每tick入口安全路径检查计入actor重规划次数，已让测试actor位于不同起点来准确区分两者；没有为这个计数错误修改生产行为。首次完整测试发现smoke缺失新用到的原生常量，修正mock后再运行；完整回归又发现重试状态丢失导致返程取消重发，以独立失败回归定位并修复。

## 维护者检查与当前状态

作者已检查最终差异：未改GoalPlan、Governor、scheduler、市场或远程默认policy；没有第二套任务消费者、延长全部任务期限、清空预留或无限重试。只有真正的新leg身份初始化一次预算；同一leg的升级、重试和reset均保留原期限。新源码没有压缩或临时console补丁。

git diff --check与git diff --cached --check通过；本轮无暂存内容。没有调用子代理或将作者自检称为独立review。

构建前只在当前子进程移除DEST，未改共享环境或代理配置。工作区不存在临时.secret.json。dist包含本轮未发布代码，不能拿它与仍在线的旧发布产物比较后误报服务器版本异常。

本轮没有发送生产console指令、写在线Memory、启动scout或进行线上复试，沿用此前确认的关闭状态。没有新增跟进进程或自动化。历史首次不动的原始path/返回码已丢失，本地复现证明机制可发生，不能补写为当时现场已完全确证。

本地验证完成，不等于线上移动、W48N41真实视野/持续安全或采运验收通过。后续发布和有限侦察复试须另行授权；本轮到此保留可审阅差异。
