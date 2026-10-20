# 远程危险情报留存：本地实施与验证

日期：2026-10-20。五批本地实现完成，已进行一次独立只读review并修正反馈。未暂存、提交、推送、部署或操作线上。

工作区：`C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium`，分支codex/single-remote-mining，HEAD仍e22cf4992e78d6d51731ce91beca5cd6f43eb786。已有历史未跟踪证据文档保留，主目录main未修改。

## 实现结果

- 新增RemoteDangerEvidenceModel与适配器，详细对象独立存于`Memory.empire.remoteMining.dangerEvidence`。按完整七元组身份关联，只响应托管侦察首次danger/home_danger。
- Guard原状态提交、关闭效果和拒绝许可先完成，随后才运行独立捕获hook；记录和摘要异常被限制在观测链，不包住或吞掉原控制异常。P0顺序、guard schema、危险门槛、总期限、预算及安全返程保持原职责。
- 最多两次事故、每次10单位、每body检查50part、文本100代码单元；单记录JSON长度12000、ledger25000、每份摘要1500。保存id/name/owner/位置/有效部件摘要，不存Game引用、原始body、错误stack或凭据。
- 新事故先写pending。同tick最多完成一次，后续不重采；已提交结果经历Memory JSON往返、global/runtime重建和新适配器模块实例仍保留。旧pending跨tick只读显示interrupted，不拿新敌人补旧案，不改原Memory。
- CPU参数从policy只读解析，配置层导出5/2初始默认值；未给通用默认合并增加新嵌套分支。显式null/非法值保留并跳过采集，不影响守卫启动和关闭。
- metrics沿用既有出口，只附加有界metadata；导出时间可更新，但事故观察tick保持冻结。未知ledger显示失败状态，不影响控制。无旧记录的历史中止会话显示not_recorded。

## RED→GREEN记录

下列日志在本计划专属的`.superpowers/sdd/2026-10-20-remote-danger-evidence/`，未混入其他试点窗口：

| 批次 | RED | GREEN |
| --- | --- | --- |
| P1纯模型 | p1-red.log：缺少新模型 | p1-green.log：9/9 |
| P2采集与存储 | p2-red.log：缺少适配器/策略解析 | p2-green.log：27/27 |
| P3生产关停 | p3-red.log：hook未调用、无快照 | p3-green.log：12/12；p3-combined.log：118/118 |
| P4重置留存 | p4-red.log：缺少真实Memory恢复路径 | p4-green.log：125/125相关集合 |
| P5摘要出口 | p5-red.log：缺少reader/metadata | p5-green.log：122/122相关集合 |
| review反馈 | review-red.log：3个新增断言失败；review-body-red.log：缺失bodyLength也误标captured | review-green.log：3/3，包含扩展的损坏部件反例 |

模型首批以新模块缺失建立初始RED；关键“不阻断关停”另通过真实RemoteMining/Bureau/Spawn/Strategy/ActionParser调用链验证。hook入口先采样真实关闭状态，验收assert在hook外执行，避免被业务catch吞掉而假绿。

覆盖了：recorder入口抛错、字段getter异常、标准化异常、pending/最终写失败、写后抛错结果不明、未知/损坏ledger、CPU不足、P2跳过、原outbound任务、无武装已知owner仍停止、摘要异常、telemetry关闭、Memory重载和模块重建等。

## 独立只读review

按用户授权仅进行一次，reviewer未改代码或操作线上。报告1项Important、1项Minor，未发现关停顺序或许可放宽问题；主代理核实后均补RED并修复，没有追加第二轮review。

1. Important：合法pending仅改label为captured，旧校验会当成成功证据并允许轮换。现在校验完整观察时间、视野、数量、截断与actor完整性；缺bodyLength、有效部件总数超过bodyLength也拒绝。非法ledger保持原值，显示store_invalid，生产关停及次tick确认仍通过。
2. Minor：容量裁剪后才赋actorsOmitted，可能将12000长度记录撑成12001，导致全部详细证据降为失败。现在每次裁剪按最终完整metadata计算长度；确定性大计数输入可保留部分actor并标partial/size_limit。

review原始上下文为`review-request.md`，结果与处理记录保存在同目录`review-result.md`及progress.md。review前的384/384不是最终验证数，以下为修复后完整结果。

## 最终验证

使用bundled Node：`C:/Users/mts-2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`。运行与package.json npm test一致的完整命令集合，未声称调用了npm CLI：

```text
node src/tests/smoke.cjs
node src/tests/room-governor.cjs
node --test src/tests/remote-mining.cjs src/tests/work-position.cjs src/tests/storage-reservation.cjs src/tests/goal-plan.cjs src/tests/scout-movement.cjs src/tests/route-occupancy.cjs src/tests/recon-trial-model.cjs src/tests/recon-trial-runtime.cjs src/tests/remote-danger-evidence.cjs
```

最终全部退出0：smoke passed、room governor passed、Node测试 **387/387**，失败/跳过均0。原基线330/330，本轮新增57项测试。完整日志：final-smoke.log、final-governor.log、final-node.log。

修复后再次dry build退出0。通过子进程删除DEST/ROLLUP_WATCH后运行`node node_modules/rollup/dist/bin/rollup -c`；输出明确“未指定目标，代码将被编译但不会上传”，见final-build.log。没有临时.secret，也没有运行push/watch命令或修改共享环境。

git diff --check、git diff --cached --check通过；未跟踪新代码另检查文本格式。Git有现有autocrlf的LF转CRLF提示，不是测试或构建失败。工作区和日志保留，代码未暂存。

## 实施裁定与边界

- Git Bash辅助脚本路径不可用，改用原生PowerShell/Node保留同一plan-scoped工作区与ledger；无WSL或共享配置变更。首次日志目录尚未存在的重定向未执行测试，不算基线。
- 为单独注入标准化故障，适配器增加observer-only normalizeActor依赖；不替换安全布尔检测或原动作链。
- fixture原prepare闭包引用旧raw，已改为每次解析当前Memory；restoreMemory序列化后重新绑定creep.memory并重建服务，避免伪造重置测试。
- 成功持久证据仍以引擎正常提交Memory为前提；完全写不通或硬中断未提交时不能保证数据存在。已执行控制优先，缺失标记如实展示。
- 本轮没有读取或修改线上。侦察、实际采运、Goal/Plan的关闭约束不变；不把昨天的线上状态称为今天已回读确认。
- 2026-10-19危险对象身份没有被恢复；新功能尚未部署，也没有新线上危险样本、连续100安全ticks、采运、收益或10000tick验收结论。

后续发布与任何有限侦察需用户另行明确授权。本地dist含未发布新代码及新构建版本，不能拿它与旧线上产物不匹配判为异常。
