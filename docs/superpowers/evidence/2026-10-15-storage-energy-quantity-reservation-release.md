# Storage 数量预留发布与初步现场观察

北京时间2026-10-15。逻辑提交 `1b0611eb64bca5020668172b3e4118059fa5ef96` 已推送至 `origin/codex/single-remote-mining`，执行 `npm run push` 部署到 screeps.com 活跃 `default` 分支。未合并主分支。发布后只读观察 shard3/W49N41 的 builder、storage owner 与 terminal；没有修改在线战略 Memory 或强派单位。

## 发布检查、备份与指纹

- 发布前新鲜 `npm test`：smoke、room-governor 通过，node:test 141/141，失败0；包括42项 storage 专项及原99项远程/工位测试。
- 无 DEST 的 `npm run build` 通过；工作区与暂存区 diff 检查通过。暂存检查发现计划文档 EOF 多余空行，已仅清理格式后重新通过。
- 原生 fetch 读取旧代码三次超时；改用项目既有 Screeps SDK 后，旧代码和 branches 回读成功。没有修改共享代理配置。
- 部署前备份：`D:/MyCode/screeps_world/automatiseerimise_impeerium/.worktrees/release-backups/2026-10-15T07-16-51.819Z/server-code.json`。旧 main/map 指纹与此前88348d6发布预期一致，activeWorld=true。
- 发布使用排他创建的临时、Git忽略部署配置，命令结束后已移除，未提交凭据。
- 新 SERVICE_VERSION：`1792048671500`。
- main SHA-256：`a20b2a9f5958018cd974da45385e114744cdc530062ff88df03e3b909ba945db`。
- map SHA-256：`7e8ea0c0a69223280c4cb560f963249640f2e2d435947d77b89ac20ff27ffb39`。
- 发布后首次 SDK 回读失败，下一次成功；15:19:51回读 main/map 与本地上传产物完全一致，activeWorld=true。第一次失败的具体原因未确定，不把编译退出码当发布成功依据。
- 原生 tick83657535 和83657652均确认执行新版本。没有把本地未上传构建当服务器版本。

## 数量共享确实生效

以下是游戏运行时状态，不是调用撮合方法的模拟结果：

| tick | storage stock | 有效owner | available |
| --- | --- | --- | --- |
| 83657536 | 997230 | repairer 100，quantity/assigned | 997130 |
| 83657561 | 997390 | builder 100＋hauler 250 | 997040 |
| 83657565 | 997390 | 两名builder各100 | 997190 |
| 83657571 | 996990 | 无owner | 996990 |

预留100不再使整个 storage 不可用。同目标不同执行者可以持有独立数量 owner；所列样本的可用量符合库存减预留。此次离散采样的 **storage energy owner峰值为350、同时2个owner**；这不是全房所有预留的连续峰值。

## Owner释放与原始期限

- `83657561:5254:builder_83656270_Spawn1_0`：561时assigned，568时awaiting_confirmation，569时已移除；其原 deadline=83657611未改变。
- `83657565:5259:builder_83656390_Spawn1_0`：565时awaiting_confirmation，566时已移除，而另一builder的5254仍存在，证明完成一个owner不会清掉另一个。
- repairer的5260在569时awaiting_confirmation，571时已移除。
- 较长领取 `83657601:5285:builder_83656270_Spawn1_0`：仍为准确100额度，原deadline=83657651；620时还存在，624时已移除，约23 ticks内结束，未拖到原期限以后。
- 最终654样本无storage owner，available=stock=995810。

房间累计 confirmedEnergyPickupAmount 从49800到53900，confirmationUnknown从2031到2046，reservationReleased从804到812。这是整个房间各资源动作的累计差值，不可全部归因到本次storage领取或当作远程收入。未知量仍如实记录，没有把 intended amount 当成确认量；不能依据本窗口宣告并发计量已经全面验收。

## Builder实际取能与返回

- 新版本刚上线时，一名builder仍在旧的源头取能/返回任务中；发布没有强制清理任务或移动单位。
- 后续实际捕获 `WITHDRAW` 目标为 storage `6a26b976aefd93ab4cf6897d`，`amount:100`，不再仅记录账本额度而发送无限额任务。
- tick83657615/617/619/621，该builder分别在(28,26)/(27,25)/(28,24)/(29,23)，energy=0、WITHDRAW storage 100；624时领取owner已结束，625时在(30,23)携带100并转BUILD。
- 同期另一builder保持(31,23)，620时有storage领取owner，621时energy=100并继续BUILD。
- tick83657652，两名builder已分别到(33,23)/(31,23)，均为该terminal的BUILD任务，energy为100/70。

因此已观察到真实近端storage领取和返回施工。仍存在局部绕行及fatigue等待；此次不宣称所有交通/工位问题已经解决，也未自动修改移动策略、body或孵化配额。

## Terminal进度

工地 `6ad037f78f37602edb5b26e8`，W49N41(32,24)，总进度100000。

| tick | progress |
| --- | --- |
| 83657501（部署前） | 24042 |
| 83657536（新版本首个quantity样本） | 24682 |
| 83657573 | 25542 |
| 83657629 | 26872 |
| 83657654 | 27532 |

新版本两端相隔118 ticks，增加2850。这些是独立离散采样，不是连续窗口或受控提速实验。terminal约27.53%，仍未建成，没有新增接收容量；W48N41原生路线和启用方案继续等待真实terminal门槛。

## 安全状态和后续

最终原生检查tick83657652：remoteMining.enabled=false、Governor shadow=true、scheduler.enforce=false、market.enabled=false，Controller距降级150000，recovery=normal，miner2、hauler3、bucket10000。

每10分钟的既有只读跟进已更新到新逻辑与main/map指纹。为落实用户明确要求的预留观察，新增quantity只读模式；其余仅inspect/site/routes，禁止create-terminal及生产动作。正常进度静默，持续停工/owner异常超额或超过原期限再调查通知；不自动再次发布或启用远程矿。旧单房10000-tick collector仍暂停，新旧窗口不拼接。

## 原始证据

目录 `.superpowers/sdd/2026-10-14-single-remote-mining/`：

- `quantity-sdk-readonly-1792048791275.json`：发布后服务器指纹/activeWorld与本地匹配。
- `native-quantity-*.json`：同版本tick83657536–83657654的独立owner/stock/进度样本。
- `native-journey-*.json`：实际任务、amount、位置、energy与清理结果。
- `native-inspect-1792049240579.json`、`native-quantity-1792049248417.json`：末次安全检查和施工样本。
- `native-quantity-1792048869518.json`：样本storage预留峰值350。

发布前完整测试日志在 `.superpowers/sdd/2026-10-15-storage-energy-quantity-reservation/release-test.log`；发布输出通过release-secret-helper过滤读取。API/原生运行时证据不冒充浏览器页面验收。
