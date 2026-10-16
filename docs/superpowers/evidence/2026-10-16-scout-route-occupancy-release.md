# Scout 工位避让修复发布与关闭状态核对

日期：2026-10-16。用户授权本次提交、推送、部署，并要求部署后只读核对版本和开关；侦察、实际采运和 Goal/Plan 继续关闭。本轮已完成发布及 SDK 回读，没有执行侦察复试。

## 发布结果

逻辑提交 `9e415d1eb33398b6f5d0d22e4e9a16622154905d`，分支 `codex/single-remote-mining`。提交包含工位占用层、scout 调用参数、35 项正式回归及相关诊断/上次复试/本地交付记录，共 10 文件；其他历史未提交文档未混入。

发布前重新运行完整 `npm test`：smoke、room-governor 通过，Node 测试 **251/251**。本地 `npm run build` 成功并明确不上传；工作区及暂存差异检查通过。

Git SSH 推送先后出现连接关闭和握手超时。随后仅本次命令使用同仓库的 HTTPS URL 推送成功，`ls-remote` 回读远端同名分支为完整逻辑提交 SHA。没有改已保存 remote、共享代理或 SSH 配置，也没有 force push。

服务器旧代码通过 SDK GET 备份并独立验证 main/map 哈希，备份目录：

`D:/MyCode/screeps_world/automatiseerimise_impeerium/.worktrees/release-backups/2026-10-16T07-53-27.212Z/`。

旧实际逻辑为 fe061d4，SERVICE_VERSION=1792128523514，旧 main/map 与上次发布指纹一致。首次备份读取曾返回 502，第二次成功；失败没有当成有效备份。

执行 `npm run push` 上传至 **screeps.com/default**。临时 `.secret.json` 仅包含既有 main 目标，以 CreateNew 建立并在 finally 中删除；未改主目录凭据。2026-10-16T07:57:34.276Z SDK 回读 `activeWorld=true`，服务器 main 和 map 与本次上传产物逐项相符：

| 项目 | 实际值 |
| --- | --- |
| SERVICE_VERSION | `1792137398079` |
| main SHA-256 | `ba3d35a8a236d1e406b6d65e2b4793ce25e9277d2ae669f2600192f02ed77733` |
| map SHA-256 | `53366a678b8b5308bd36eb9d960b7555204e2f74272ba164b6131a2bcfc205fd` |

## 游戏运行与关闭状态

原生 console 的三次发布前只读查询均返回 502，未取得有效 Game 内 console 回执。本轮改用 **SDK GET 读取游戏自身持久化的运行遥测和房间指标**；没有用本地 dist 或上传成功代替实际运行证据，也没有因此写入线上 Memory。

2026-10-16T07:58:47.073Z 的成功记录：

- RuntimeTelemetry.updatedAt=83679160，codeVersion=`1792137398079`。
- W49N41 房间指标 capturedAt=83679160，codeVersion 同上。恢复 normal，有效 miner2/hauler3，Controller149994，房间能量1900。
- operation.evaluatedAt=83679165，status=disabled，allowRecon=false、allowEconomicDeparture=false，safeTicks=0。
- remoteMining.enabled=false；W48N41 enabled=false、hold=true。
- sourceId=null；allowContainerBuild=false；reserveController=false；接收配置仍为 terminal `6ad0b55bceeb3db0d3b4dda0`。
- roleLimits：scout1、remoteMiner0、remoteHauler0、reserver0。
- goalPlanning.enabled=false、mode=shadow；goals、plans、goalPlanningState 命名空间均不存在。
- Governor shadow=true、scheduler.enforce=false、market=false。

以上为分次 GET 的独立快照，遥测与 operation 的 tick 不同；不是同 tick 原子快照、连续观测、浏览器验收或本轮实机移动验收。发布后 SDK 运行状态读取共三次，一次取得上述有效记录，前后两次失败并单独保留。失败记录只提供 Error，不能擅自归因为与 console 相同的 502。

本轮未取得新的原生 terminal 实际剩余容量、活 scout/Spawn 状态或远程视野；没有把配置中的接收 id 当作当前容量证据。复试开始前必须重新检查这些事实。

## 证据及下一步

发布核对目录：`.superpowers/sdd/2026-10-16-scout-occupancy-release/`。

- `upload-sanitized.log`：本次上传及构建日志。
- `runtime-1792137527074.json`：有效运行版本与关闭状态。
- `runtime-failure-*.json`：两次失败的运行状态读取。
- `release-verification.json`：备份、产物、版本、开关及证据边界的本地审计。

相邻 `2026-10-14-single-remote-mining` 的 `quantity-sdk-readonly-1792137207227.json` 为发布前备份，`quantity-sdk-readonly-1792137454285.json` 为发布后产物匹配。`2026-10-16-route-occupancy-diagnosis/release-full-test.log`、`release-dry-build.log` 为本轮发布前验证。

已保存新的[有限侦察复试方案](2026-10-16-w48n41-occupancy-retest-plan.md)及[默认关闭离线配置](2026-10-16-w48n41-occupancy-retest-disabled.json)。只准备方案，不调用旧脚本的 enable/prepare/hold，不重置旧 leg、不派单位、不创建目标定义、不启动跟进自动化。

**下一步先恢复可靠的观察与关闭通道，再另获授权执行一轮有限侦察。** 目标为验证真实位移、固定工位避让、跨房视野、连续安全及可见路线；最多一次重规划，原期限不变，启用后 300ticks/20分钟先到即止，完成或异常后关闭。实际采运、下一 tick 卸货确认及 10000tick 验收仍未执行。

后续文档提交可以使 Git HEAD 前进，实际部署逻辑始终以 `9e415d1` 和上述服务器指纹为准。
