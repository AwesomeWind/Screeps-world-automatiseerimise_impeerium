# 资源市场距离计算修复：本地验证

日期：2026-10-15。工作区 `C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium`，分支 `codex/single-remote-mining`，基线 HEAD `d9b426b4442928def785fd39f7fb00d0d49b4208`。改动未暂存、未提交、未推送、未部署。

## 问题与修复

此前游戏运行时已确认：Memory 形态的普通坐标进入原生 `getRangeTo` 后得到 NaN，污染自取成本；首个供给会压住后续更近供给。原始证据见同目录 `2026-10-15-terminal-builder-energy-movement-diagnosis.md`。

修复集中在 `src/services/ResourceMarketService.js`：

- `rangeBetween` 直接按同房间 Chebyshev 距离计算，兼容原生 RoomPosition 与普通坐标，不再依赖原生方法对普通对象的解析。
- 正确保留坐标 0 和同位置距离 0；缺失或非有限坐标使用原有未知距离回退值 25。
- 两端房间已知且不同，返回 Infinity；本地供能不据此推断跨房间路径。
- 自取、满载配送、先取货再配送三个报价分支跳过非有限成本，避免不可达候选触发派单。

该距离仍是几何估算，不是 PathFinder 路径长度或真实运输时长。原有报价权重、供给优先级、预留与下一 tick 回执机制保持原样。

## 回归与 RED/GREEN

在 `src/tests/smoke.cjs` 既有资源市场测试区域增加隔离场景，通过真实 `requestResource` 流程验证：

1. 原生位置到普通坐标的报价可用；远处掉落能量与近处 storage 顺序互换，都选择近处 storage。
2. 没有闲置 hauler 时可自取；自取成本较低时胜出；更近的满载 hauler 仍能获得真实 TRANSFER 任务。
3. 原生/普通坐标双向组合、零坐标、重合位置、缺失/NaN 坐标、跨房间输入。
4. 外房 supply 不获得自取预留；外房空载与满载 hauler 均不作为本地配送执行者派单。

fixture 复现了本次观测到的原生接口限制，测试前后恢复 Memory、Game、市场、RoomPhase 和 idleHaulers，避免污染既有测试。

- RED：未修改生产代码时，新增回归明确失败，actual=`distanceDrop`，expected=`distanceStorage`。
- GREEN：修复后 smoke 通过。
- 保护分支验证：分别临时移除三个非有限成本检查，新增回归均以 AssertionError 拒绝错误自取/配送；每次均恢复源码。检查中补齐了隔离房间的 `find()` 环境接口，使失败落在业务断言而非 fixture 缺失。

## 完整检查

- `npm test`：退出码 0；smoke checks passed；room governor checks passed；node:test 的远程矿/工位测试 99/99，通过、失败 0。
- 新增断言归入 smoke，不计入上述 99 项 node:test 数字。
- 测试中的两条 SpawnService `spawn failed ... -4` 来自既有失败路径用例，全套测试通过。
- `npm run build`：退出码 0；成功生成 dist/main.js。运行时清除了当前子进程的 DEST，日志确认“代码将被编译但不会上传”。
- `git diff --check`、`git diff --cached --check`：通过。

使用 bundled Node `C:/Users/mts-2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe` 运行测试与构建。完整测试日志保存在忽略目录 `.superpowers/sdd/2026-10-14-single-remote-mining/resource-market-distance-full-test.log`。

## 在线状态与未验收项

只读原生检查 tick 83656634（北京时间 2026-10-15 14:17:35）：在线仍为旧版本 `1792031787998`，remoteMining.enabled=false，Governor shadow=true，scheduler enforce=false，母房 recovery=normal，miner 2、hauler 3，bucket 10000。此次没有写在线战略 Memory。

本次只完成本地修复与验证。尚未部署，不能宣称线上取能路线、terminal 施工速度已经改善。下一次获准发布后，需用新版本独立窗口观察有限报价、实际供给选择、单位位置变化与施工增量。远程矿继续关闭，接收容量与 W48N41 路线验收尚未完成。
