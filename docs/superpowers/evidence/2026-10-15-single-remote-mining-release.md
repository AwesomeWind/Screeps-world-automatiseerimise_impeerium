# 单远程矿关闭状态发布与试点核对

日期：2026-10-15，北京时间。用户明确授权提交、推送、部署到游戏服务器，并要求先保持远程矿默认关闭，随后核对具体试点配置。

## 发布前核验

- 实施 worktree 基于 9ab8f4263024904972935987fe83672db3802f75；主目录 main 的历史诊断和原设计/计划未提交副本保持原状。
- 本轮 Git 分支采用 codex/single-remote-mining；发布前重新 fetch，origin/main 仍为 9ab8f42。
- 新鲜 npm test 通过：smoke、room-governor、93 个远程用例，fail=0。无 DEST build、两类 diff check 通过。
- remoteMining.enabled 默认 false，Governor shadow=true，scheduler.enforce=false。
- 只读服务器预检：screeps.com/default，activeWorld=true，shard3 tick 83652824；旧 main 与运行摘要均为 SERVICE_VERSION=1791940907026。
- 线上 policy.remoteMining.enabled 尚不存在；未发现已有 true 配置。新版本默认值将初始化为 false。
- 母房 W49N41 摘要 tick 83652820：recovery=normal、RCL7、Controller progress=9573187。
- 旧分支全部代码已备份到本机 D:/MyCode/screeps_world/automatiseerimise_impeerium/.worktrees/release-backups/2026-10-15T01-44-29.058Z/server-code.json。该目录受 Git 忽略，不含账号凭据。

## 执行状态

- 代码提交：53f0e4a9012c47ff55d8981e5b0741dae458fdcd，feat: add bounded single-remote mining pilot，已推送至 origin/codex/single-remote-mining。主目录 main 保持 9ab8f42；本次没有合入 main 或创建 PR。
- 执行项目 npm run push（rollup -c --environment DEST:main），目标为 screeps.com/default。第一次因 Node --use-env-proxy 与 SDK 请求的 Host/authority 冲突失败；移除仅本次子进程的该参数后重试成功，没有修改依赖或共享网络配置。
- 两次部署尝试均使用临时、Git 忽略的部署配置，结束后清理；没有把凭据提交进仓库。
- 只读回读两次均确认 activeWorld=true、main/map 逐字节哈希匹配；运行摘要 codeVersion 与新 SERVICE_VERSION 一致，确认服务器已经执行新代码。
- SERVICE_VERSION=1792028845945。
- main SHA-256：91fc401f8ee3dc76abf5b3224270f8a0ad4ab537d41c7a4319813c7366db605c。
- main.js.map SHA-256：c019de728f31233f77e6f345f63dcf0304fb8be29eb9641a146da3cd9ce9df44；本地文件名为 main.js.map.js。
- 回读 Game.time 83652875、83652958：remoteMining.enabled=false，Governor shadow=true，scheduler.enforce=false。没有在线 remoteRooms 配置或人工 Memory 写入，没有远程经营窗口被分配。
- 对应母房摘要 tick 83652870→83652950：Controller progress=9573427→9573807，recovery=normal，RCL7，ticksToDowngrade=150000。这是两条只读摘要，不称连续 80-tick 或 10000-tick 验收。

回读与房间/地形事实保存在[只读证据](2026-10-15-single-remote-mining-readonly-facts.json)；不包含账号凭据或完整在线 Memory。房间查询是分次进行，不宣称同一 tick 的原子快照。

## 试点配置边界

本轮只读核对母房和四个相邻房、source、容器格、入口及接收设施；不写在线 remoteRooms 配置，不打开总开关，不主动派 scout 或发送生产 console 指令。API 事实不冒充页面验收。

| 相邻房 | 本次 API 事实 | 静态路线结果 |
| --- | --- | --- |
| W48N41（东） | 中立 Controller，无他人 reservation；source 5bbcaa6d9099fc012e63155b 在(20,5)，capacity=1500；未返回敌对 creep 对象 | 候选容器格(19,6)，仅一个相邻格符合本次静态可站立/通路条件；默认侦察入口(1,25)可站立。运输单程约37步；静态模型预计一名400-capacity hauler可覆盖平均5 energy/tick |
| W49N42（北） | 中立 Controller，无他人 reservation；source 5bbcaa619099fc012e6313d4 在(27,23)，capacity=1500；另有5段旧 constructedWall | 候选容器格(28,22)，入口(25,48)可站立；运输单程约65步，模型预计需要两名运输者 |
| W49N40（南） | 本次未返回 Controller/source 对象 | 不作为普通中立矿点候选 |
| W50N41（西） | 本次未返回 Controller/source 对象 | 不作为普通中立矿点候选 |

优先候选为 W48N41，关闭状态[配置草案](2026-10-15-single-remote-mining-pilot-draft.json)已定位 source、容器格和母房 storage id。该房尚无容器/工地记录，若未来启用，需 allowContainerBuild=true；reserveController=false。经济 body 初始费用为 miner700+hauler800=1500，若需 scout 再加50，保持2000/1000 ticks 的同一预算；容器建设维护仍用6000/1000独立预算。

静态路径只根据本次两房地形/结构快照计算，body/fatigue 数值使用已部署的生产纯函数；未运行游戏原生 PathFinder，也未验证跨房实际移动、碰撞/交通或持续安全。W48N41 的静态 miner 出/返期限约96/94，hauler约94/94，低于300保护上限；启用前仍须由游戏内 gate 按新鲜事实核验。

当前不能标为 activationReady：母房 storage 6a26b976aefd93ab4cf6897d 位于(31,24)，1000000/1000000，剩余0；未返回 terminal 对象。源输出容器已满，不能充作回母房接收目标。Controller 缓冲容器 6acdc7a50d089105329f77a3 位于(32,27)，该次快照1900/2000，仅余100，并且参与本房升级物流，不自动替代稳定接收设施。

下一步应先获得稳定、明确的母房接收空间，再重新只读核对 reservation/hostile/core 健康和路线，随后由用户明确选择一处 pilot 并授权写入/启用。当前只保存 enabled=false 的离线草案，未修改游戏配置。

旧单房验收与新远程 10000-tick 验收均保留未完成；部署关闭功能不自动完成线上采运、恢复或盈利验收。
