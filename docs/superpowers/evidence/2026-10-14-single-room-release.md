# 单房生存与恢复发布记录

日期：2026-10-14，北京时间。用户明确授权提交、推送、执行游戏服务器推送指令及观察其打开的 Screeps 页面。

## 发布与回读

- 代码提交：`647dac7de503ef6f8096b66e74c02ae4ddc8c2de`，`feat: harden single-room survival and recovery`，已推送至 `origin/main`。
- 发布前重新运行 `npm test`（smoke、room-governor）、无 DEST 的 `npm run build`、`git diff --check` 和 `git diff --cached --check`，全部通过。使用独立 bundled Node v24.19.0，未修改共享 NVM。
- 已执行项目指令 `npm run push`，实际为 `rollup -c --environment DEST:main`；成功返回后另用只读 API 回读，未仅凭命令退出码判定部署成功。
- 目标：`screeps.com` 的 `default` 分支，`activeWorld=true`；观察 `shard3/W49N41`。
- 09:21:58 回读：`main` 与 `main.js.map` 均与此次 `dist` 部署产物逐字节 SHA-256 匹配。
- 新 main SHA-256：`3d8f04f4b878e53707b84e4a95eb3caa3fbb89e8254354be94ce64803151703c`。
- 新 map SHA-256：`e5be15c689de0cad70e1154161252e43b6f2643edc94ebdf2efece36527f928b`。
- `SERVICE_VERSION=1791940907026`；随后运行遥测 `codeVersion` 匹配，确认新代码已被游戏执行。部署后的第一条快照仍是旧摘要，未将该快照计入新版本验收。
- Governor 保持 `shadow`，scheduler `enforce=false`。没有在线 Memory 人工写入、生产 console 指令或主动故障注入。

## 初始运行证据

已保存 [首条快照](2026-10-14-single-room-post-deploy-initial.jsonl)、[版本生效快照](2026-10-14-single-room-post-deploy-followup.jsonl)、[后续快照](2026-10-14-single-room-post-deploy-confirmed.jsonl)、[运行快照](2026-10-14-single-room-post-deploy-runtime.jsonl) 及 [只读日志订阅结果](2026-10-14-single-room-console-initial.json)。

- 新版本摘要 tick 83631040 到 83631080：Controller progress 从 9464736 增至 9464926；level=7，ticksToDowngrade=150000，core miner=2、hauler=3，recovery=`normal`。
- tick 83631080：3 次已确认资源动作、实际配送 energy=30；unknown=2 单列，未当作交付；owner reservations=2。
- 后台新段首条 tick 83631105（摘要 tick 83631100）：Controller progress=9465021、ticksToDowngrade=149999、bucket=10000、Memory=83819 bytes。7 个本版本 CPU 样本，EWMA≈7.01、样本 p95≈11.01。样本量与场景尚不足以宣称持续 CPU 成本已验收。
- 09:24:15 至 09:25:02 的只读 websocket 观察：认证成功，收到 10 次 console 事件和 11 次 CPU 事件，未收到错误；不据此承诺之后没有运行错误。
- Chrome 浏览器扩展多次返回 `nodeRepl.fetch request failed`，无法读取用户指定标签页。已请求刷新页面并确认连接。上述 API 证据不称为页面验收。

## 10000-tick 采集与后续

首次后台采集在 83631063 建立快照后因 `Observation failed: fetch failed` 停止。原段和错误日志保留于本机 `.worktrees/single-room-observation/`，不拼成连续窗口。

已启动有界重试 launcher：只对网络读取失败最多另起三次新段，其他失败立即停止；每段使用同一个已核对代码哈希，原采集脚本仍校验匹配版本、固定容量与 review_required 终态。09:26:51，新段首条 tick 83631105、版本与哈希匹配；核验时 launcher/collector 均在运行且 stderr 为空。

本机状态文件：`.worktrees/single-room-observation/bounded-collector.status.json`。当前新段：`.worktrees/single-room-observation/2026-10-14-10000-ticks-retry-1.jsonl`。这些连续采集输出和临时 launcher 位于 Git 忽略目录，发布证据提交不包含凭据或完整在线 Memory。进程依赖本机继续运行。

已创建当前聊天的“单房部署验收观察”后台检查，每 30 分钟核对进程和证据；只在完成、失败、版本变化或异常需要处理时通知，正常增长保持安静。到达窗口后审阅 Controller、补员、恢复、施工、物流、CPU/bucket/Memory及场景覆盖，未覆盖的场景保留缺口；完成评估或需要用户处理的阻塞后暂停观察。该检查未获自动再次部署或线上控制授权。

目前结论：代码已提交、推送、部署并确认执行；初始 Controller 与物流链有推进证据。>=10000 ticks 单房真实验收仍未完成，尚不进入远程矿扩展或 active 试点。

## 回退基线

发布前已保存旧活跃分支全部代码模块与哈希：本机 `.worktrees/release-backups/2026-10-14T01-20-29.561Z/`。旧代码对应此前 C0 基线 ca38dc4，旧 main SHA-256 为 `1f79e71e565e3bf5bc3165a1ada3e9df62c25b2837dd41e6336cabb20586cdda`。本轮尚未执行回退；代码回退不能撤销游戏已经执行的 spawn/transfer。
