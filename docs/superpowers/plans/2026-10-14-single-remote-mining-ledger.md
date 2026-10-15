# 单远程矿实施 ledger

计划：2026-10-14-single-remote-mining.md；spec 已批准；执行方式为主代理逐批实现及一次最终只读独立 review。

隔离 worktree：C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium，BASE 9ab8f4263024904972935987fe83672db3802f75。主目录未提交文档保持原样。本阶段不自动提交、推送、部署、开启线上矿点或修改共享代理。

基线 smoke、room-governor 已实际通过。任务进度及逐步日志同步在本 plan 的 .superpowers/sdd/2026-10-14-single-remote-mining/progress.md。

Ruling: 21 个 50-tick 保守预算桶覆盖最近1000 ticks，边界可能暂时少用额度而不会超支；预算上限不因 epoch/global reset 重置。
Ruling: 不执行技能示例的自动 commit；最终独立 review 以 BASE 的完整工作区差异和新增文件为准。

Task 1: complete. Four initial production-chain REDs (2/1/1/1 unexpected remote requests) and legacy identity RED observed, then all 8 cases GREEN; npm test (smoke, room-governor, remote) passed. Budget grant missing remains fail closed until Task 2. Ruling: legacy raw/diagonal smoke expectations replaced by disabled-safe assertions; existing body scaling tests retained.

Task 2: complete. Positive producer-to-Spawn RED observed before grants; 16 remote cases, full npm test and non-upload build GREEN. Rolling cap, pending/unknown upper bound, zero/invalid budgets, receipts, reset replay, stale cancellation and wrong role/quota admission exercised. Ruling: optional request fields are omitted on local intents, preserving existing exact legacy shadow baselines. Fixture invokes real MemoryConfig defaults.

Task 3: complete. Fatigue-stuck and third-room-path production REDs observed; loaded/plain/swamp estimates and absolute deadlines added. 24 remote cases and full npm test GREEN; local default movement unchanged. PathFinder mock represents a restricted corridor and only external search/results, not service behavior.

Task 4: complete. Source preparation/repair/actual-cost and dead pending-cost REDs observed; 36 remote cases, full npm test, build/diffs GREEN. Optional generic action observations distinguish work API result from move result. Ruling: work tasks renew a budget reservation each tick via strategy before execution, never reuse old grants; missing action/dead owner retains charged unknown upper bound. New balanced miner profile is separate from legacy remote profiles.

Task 5：44/44 与完整 npm test 通过。物流在原 ResourceMarket 同步消费 Resolution，OK 同 tick 收入为零；下一 tick 双边差额一致才计收入。修复真实 null 预留记录计数错误；同 actor 仍有待核对 owner 时拒绝新分配。

Task 6 / Batch C：53/53、npm test、无 DEST build、两类 diff check 通过。容量用实际 body/路线计算，上限 2；待退休不再 outbound。带货死亡只记最后已知量的 unknown 上界，不计交付。Task 5 公共入口用例保留手动调用实际 market，Task 6 验证自动策略链。

Task 7：65/65 通过。远房 hostile 独立校验，人工 hold 持续有效；stale/danger 后 200 ticks 冷却＋安全入口有限 scout，连续安全 100 ticks 才恢复。无安全返回路则 safe_wait。配置删除/损坏使用旧身份安全收尾，pending_config 撤回后不会永久卡住。增加分配前 receipt 容量拒绝。

Task 8 / Batch D：79/79、npm test、无 DEST build、两类 diff check 通过。生产 main.loop 整体回放通过；窗口仅累计完整 tick，在 finishTick 的最终 CPU 后完成，10000 仍 review_required。Ruling：实际预算耗尽按 spec 停自身 demand/outbound，替换 Task 1 的零预算仍留需求断言。Ruling：source 非法时安全撤回可有 MOVE_TO，禁止的是继续源工作；避开危险返回失败为 safe_wait。Ruling：review 必须包含整个未提交工作区及新文件，因为 HEAD 未改变。独立 review 待完成。

Review R1：Important 保留。已在返程的旧路径出现敌人真实 RED→GREEN；所有 remote MOVE_TO 复核危险格，重规划保留同 goal 的原期限；无路保货 safe_wait。80/80。

Review R2：Important 保留。真实补员后旧 miner 临近退休且替补抵达邻格，旧矿工安全离位；新矿工采用原绝对期限内的占位等待，占位者离开后重核。旧 actor 死亡后接班 GREEN；真正卡死的 MOVE_TO 保护仍通过。81/81。
Review R3：Important 保留。改母房按目标房找到旧经营身份，保留旧 global scope/预算/账本进行排空；排空后原子切 remoteId/epoch，旧经营账进入 previousEpoch。带货换母房 RED→GREEN，82/82。

Review R4：Important 保留。需求发布前对现有/拟用实际 body 校验矿工和运输者必要往返路线；无路/返程不通拒绝经济孵化与 outbound。84/84。
Review R5：Important 保留。保留 remote entry 身份隔离，所有 owner 按物理 target/resource 共享容量；本房 fallback 同样预留，部分配送限制实际 amount，取消只释放自身 owner。双顺序和部分量 RED→GREEN；npm test 86/86。Ruling：旧 200-owner 测试 fixture 原需求 1000 但实际余量仅70，与新容量合约矛盾，改为真实1000余量后继续验证200上限，未放宽生产限制。
Review R6：Important 保留。executing grant 跨 tick 无证据显式 spawnCostUnknown，保留预算上界并暂停新经济；成功备份结合真实孵化/活体证据幂等补核。未决成本上界为可下降 gauge，窗口保留 end/max；unknown 次数为单调 counter，迟到证明不会触发伪 counter reset。补真实 intake→中断→reset→Metrics 和迟到证明回归；90/90。
维护者追加：暂停 worker 的返程保留 MOVE_TO 进度，避免逐 tick 重新派任务冲掉 stuck guard；相同 5-tick 卡死 RED→GREEN。

最终维护者复核：补冲突 source 身份不得覆盖配额/执行、miner 自身 terrain 行程的替换提前量，以及损坏 WORK 的矿工安全离位；各自 RED→GREEN。最终 npm test：smoke/room-governor/remote93 全过，无 DEST build 成功，两类 diff check 通过。无未处理 review finding；线上未验收。用户已经选择暂不提交/部署，收尾技能保留 detached managed worktree，不重复询问集成菜单，不 archive/reset。HEAD=9ab8f426。

后续显式发布授权（2026-10-15）：代码53f0e4a提交并推送origin/codex/single-remote-mining，npm run push成功部署screeps.com/default；回读main/map哈希及运行SERVICE_VERSION=1792028845945匹配。远程总开关false、Governor shadow、scheduler enforce=false；无在线配置/人工Memory写入。只读试点优选W48N41 source及(19,6)容器格，离线草案enabled=false；storage满仓使activationReady=false。首次Node环境代理Host冲突只调整该部署子进程参数后重试，无源码修复。
