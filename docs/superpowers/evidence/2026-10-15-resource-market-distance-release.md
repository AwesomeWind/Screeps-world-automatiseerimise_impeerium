# 资源市场距离修复发布与初步现场观察

北京时间 2026-10-15。代码提交 `88348d6daf61008c9016f95677d40122eca831f4` 已推送至 `origin/codex/single-remote-mining`，通过 `npm run push` 部署到 screeps.com 的活跃 `default` 分支。未合并主分支。主工作区 HEAD 仍为 `9ab8f4263024904972935987fe83672db3802f75`。

## 发布检查与指纹

- 发布前重新运行完整 `npm test`：smoke、room-governor 通过，远程矿/工位测试 99/99，失败 0；新增距离断言包含在 smoke 中。
- 发布前 `npm run build`、工作区及暂存区 `git diff --check` 均通过。实际部署由 `npm run push` 重新构建。
- 发布前完整服务器代码备份：`D:/MyCode/screeps_world/automatiseerimise_impeerium/.worktrees/release-backups/2026-10-15T06-19-58.665Z/server-code.json`。
- 临时部署配置采用排他创建，发布结束后已移除；凭据没有提交。
- 新 SERVICE_VERSION：`1792045244478`。
- main SHA-256：`14e6240b42b555f3b95c8ad2ad227da6c9520b63cd87c3ca0698db4ff34f530c`。
- map SHA-256：`7350c8544f278290dc40a665ef9fae12c001fae0245e81f126a73bc3c2ccaec7`。
- GET 回读 main/map 与本地实际上传产物均一致；tick 83656682 原生查询确认新版本执行。tick 83656750，持久化 runtimeCodeVersion 也已变为新版本。

## 报价修复的运行证据

tick 83656683，位于 (31,23) 的 builder 自取目标为 storage `6a26b976aefd93ab4cf6897d`，自取成本 4、配送成本 15。另一 builder 的成本 11/21。后续 tick 83656726 与 83656752 的报价也为正常数值，没有再次观测到 NaN。

报价查询只计算临时 request，不派任务；因此单独的正常报价不作为实际补能完成的依据。

## 实际补能与移动

builder_83656390_Spawn1_0 在 (31,23) 工位发生以下真实状态变化：

| tick | 位置 | energy | 状态 | terminal progress |
| --- | --- | --- | --- | --- |
| 83656735 | (31,23) | 10 | BUILD | 13467 |
| 83656737 | (31,23) | 100 | 新 BUILD | 13477 |
| 83656741 | (31,23) | 0 | lastTaskClear=withdraw_completed，目标为 storage | 13577 |
| 83656743 | (31,23) | 70 | BUILD | 13607 |
| 83656746 | (31,23) | 0 | 再次 withdraw_completed，目标为 storage | 13677 |
| 83656747 | (31,23) | 100 | 新 BUILD | 13677 |

83656746→83656747 是相邻 tick 的观测：builder 未离开工位，energy 0→100，同时 storage 999900→999800，之后继续施工。这里同时核对了实际 store 和进度，没有把 action OK 单独当成补能完成。该局部事实不替代整个物流系统的长期 owner 回执验收。

builder_83656270_Spawn1_0 仍有一次实际长距离取能：83656704 分配源头 (21,26) 的 PICKUP，83656727 在 (20,25) 已载能 100 并改为 BUILD，83656752 回到 (33,23) 工位。途中多次 fatigue 等待。

另一 builder 在 tick 83656713/714 曾出现 move_no_path，后续重新规划并于 83656727 到达 (31,23)，随后完成上表补能/施工循环。它不是持续堵死，但说明还存在偶发路径失败和绕行。

## 施工进度与剩余效率问题

terminal 工地 `6ad037f78f37602edb5b26e8`，实际位置 W49N41 (32,24)，总进度 100000。

| tick | progress |
| --- | --- |
| 83656683 | 12767 |
| 83656693 | 12967 |
| 83656705 | 13277 |
| 83656727 | 13277 |
| 83656747 | 13677 |
| 83656752 | 13777 |

同一新版本的两端相隔 69 ticks，增加 1010；这是离散现场采样，不是连续 10000-tick 验收，也不是受控提速对比。terminal 尚未建成，接收容量仍未增加。

tick 83656752，虽然 storage 有 999750 energy，自取报价仍可能选源头容器，成本为 22。该采样的 storage supply 有 repairer_83656751_Spawn1_0 的 100 energy 预留（assignedAt=83656752，expiresAt=83656757，status=assigned）；既有 getAvailableSupplyAmount 对整条已预留 supply 返回 0。因此“报价有限”不意味着始终就近取 storage。此机制没有在本轮擅自修改；如需继续优化，应单独验证供给预留粒度和同一 storage 的并发领取，保留 owner 归属及下一 tick 确认边界。

## 安全状态与跟进

发布后原生检查及最终 GET 确认 remoteMining.enabled=false、Governor shadow=true、scheduler.enforce=false、market.enabled=false。母房 recovery=normal，核心 miner 2、hauler 3，Controller 距降级 150000 ticks。未写在线战略 Memory，未强派单位、额外建设或开启远程矿。

既有每 10 分钟接收空间/路线跟进已更新为上述新版本与指纹，正常进度静默；达到真实 terminal 容量条件后才做 W48N41 原生路线验证。观察基线更新到 tick 83656752、progress 13777。旧版本采样没有拼入新版本连续验收窗口。

结论：距离报价修复已发布并确认执行，已观察到工位旁 storage 的真实补能及持续施工；仍有预留导致的远取、疲劳和偶发路径失败，尚未宣告整体运输效率或远程矿验收通过。

## 本地原始证据

目录 `.superpowers/sdd/2026-10-14-single-remote-mining/`：

- `distance-release-test.log`、经敏感字段过滤读取的 `release-push.log`。
- `release-verify-1792045254938.json`、`release-verify-1792045546351.json`。
- `reception-readonly-1792045268326.json`、`reception-readonly-1792045449835.json`、`reception-readonly-1792045556301.json`。
- `native-journey-*.json` 中同版本 tick 83656692–83656747 的独立样本。
- `native-quotes-1792045552381.json` 及此前同版本报价样本。

以上为 API 与游戏原生运行时证据，不是浏览器页面验收。
