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

提交、推送、部署和新版本回读待执行；真实状态与哈希将在本记录中补充。仅执行项目 npm run push，不把命令退出码当作部署或运行验收。

## 试点配置边界

本轮只读核对母房和四个相邻房、source、容器格、入口及接收设施；不写在线 remoteRooms 配置，不打开总开关，不主动派 scout 或发送生产 console 指令。API 事实不冒充页面验收。

旧单房验收与新远程 10000-tick 验收均保留未完成；部署关闭功能不自动完成线上采运、恢复或盈利验收。
