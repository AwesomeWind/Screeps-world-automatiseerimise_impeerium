# 单房自主生存与恢复实施计划

> 执行方式：当前聊天内逐批实施，使用 `superpowers:executing-plans`。用户要求不自动使用子代理；本计划不授权代理、提交、推送或部署。

**Goal:** 修复可靠母房所需的统计、孵化安全、物流反馈和必要恢复行为，并建立分版本验收证据。

**Architecture:** 共享小型 creep 事实规则，继续由 RoomPhase/Bureau/Spawn/ResourceMarket/strategies 各司其职。物流通过 owner 预留与现有 task 清理证据跨 tick 协调，不重建撮合系统。

**Tech Stack:** JavaScript ES modules、现有 Rollup、smoke.cjs / room-governor.cjs、bundled Node v24.19.0。

**Spec:** [具体设计](../specs/2026-10-13-single-room-survival-recovery-design.md)。[当前诊断](../evidence/2026-10-13-single-room-diagnostics.md)。

## Global Constraints

- Governor shadow、scheduler.enforce=false；不扩展 buildWork/repairWork 接管。
- 不修改在线 Memory、不发 console 动作、不注入生产故障；提交/推送/再次部署另需明确指令。
- 开始每批重查 Git 状态与相关 AGENTS.md；当前 main/HEAD/origin/main 为 ca38dc4e863c8bf53e15298f43a0b4677ddd63e9。
- 用户已认可阶段方向；执行代码前只等待具体 spec 审阅。配套计划不要求再次决定是否做这个阶段。
- 每个已证实问题先写真实生产链失败回归，观察 RED 后修改实现；不能仅构造理想备份或直接测新 helper。
- 完成每批执行 `npm test`、无 DEST 的 `npm run build`、`git diff --check`、`git diff --cached --check`。Node 用独立进程，不改共享 NVM。

## Review Focus

1. 缺角色/无 body 的旧 Memory 和 global reset 不能让未知记录无限续命，也不能猜 1 WORK。
2. 同 tick intent 的 OK 与下一 tick 真实效果分离；不能释放过早导致重复动作。
3. TTL 边界与主动 idle retire 不混同，不能形成自动退役后无限补员。
4. 同 quota 经济请求重放要去重，但不同 quota、显式 name 和完整 legacy fallback 必须保留。
5. Controller emergency、urgent repair 和被动防御不能被经济恢复限流遮蔽；暂停旧任务要有记录。

## Batch 1: C1 身份与有效能力

**Files:** 新增 `src/core/CreepPopulation.js`；修改 `SpawnService.js`、`SpawnBureauService.js`、`RoomPhaseService.js`、`RoomGovernorFacts.js`、必要的 `CreepRetirementService.js`；测试放在现有 smoke 的 spawn/phase/retirement 块与 room-governor facts 块。

**Interfaces:** 纯 `collectCreepPopulation({creeps,spawns,creepMemory,spawnRecords,tick,spawnTime,replacementLeadTicks}) -> entry[]`，`activeBodyPartCount(body,partType) -> number`；输出字段与 source/state/coversQuota 按 spec。Spawn 记录生产方新增 schemaVersion=2/acceptedAt/spawnName/spawnRoom；旧字段保留。

- [x] 写 `stale_memory_does_not_cover_core_quota`：先模拟 live 消失、cleanup 尚未发生，Ghost Memory 无当前 spawn/成功记录；调用真实 Bureau/RoomPhase，断言 usable role/quota/WORK=0，恢复意图不被 ghost 阻止；运行并记录 RED。
- [x] 写 `accepted_miner_uses_actual_backup_work`：真实 init/dispatch/run(OK)，body=5 WORK+MOVE，缺 live；断言 WORK=5；将下一 tick spawn.spawning 设为同名再验证，backup 清除后 live spawning 仍给 upcoming；观察 RED。
- [x] 写有效 parts 边界：已知全损坏 WORK=0、无 WORK body=0、string/object parts 混合、不计 hits=0；body unknown 返回 unknown 标记，不能断言虚构 1；TTL 长度 6 的 68/69 两侧分桶；same name 多证据只一次。
- [x] 实现纯事实规则和上述消费者接线，删除相关 fallback-to-1；Bureau 仍分别保留 planned intent 和物理 spawning quota，不将未知 body 说成已确认能力。
- [x] 写并跑缺 role 恢复、旧格式到期不续命、真实取消/销毁、global reset 后事实恢复；active idle retire 卸货与 TTL 的区别通过完整 service 顺序验证，最后核心角色不误退役。
- [x] 维护者检查与完整门禁；产物说明哪些旧 fixture 只是手工 Memory，必须改为真实 spawn 证据而不是反向放宽新契约。

## Batch 2: C2 同 tick 资源仲裁与 Controller

**Files:** `SpawnService.js`、`SpawnBureauService.js`；必要的 `EventBus.js` 只用于失败重试边界；相邻 smoke/room-governor 集成测试。

**Interfaces:** Spawn 本 tick intake 保存 room energy balance、请求/name/quota 的接受身份；成功备份采用 Batch 1 schema。Bureau 读取当前 room.controller 值作为安全底线，仍消费 Governor 建议与当前 readiness。

- [x] 写 `two_spawns_do_not_overbook_energy`：300 能量、两个闲置 spawn、两个 200-cost 不同 quota 请求，最多接受一个，另一个不占 spawn、不写成功记录；观察 RED。
- [x] 写 `replayed_request_is_not_spawned_twice`：同 event/requestId、经济同 quota、显式同 name 三类；另测 distinct quota 自动 name 不同，name conflict 不能自动改名再出生；观察当前两个同名 pending 的失败。
- [x] 实现 intake 身份与能量账，run(OK) 后提交成功证据、失败后释放并保留有期限的重试条件。测试失败首个任务不污染下一 tick；同 tick 若不能安全再次 dispatch，不添加未经设计的第二 dispatch。
- [x] 写 `controller_crossing_uses_current_ticks`：snapshot=5001/current=4999，gap=0/blocked、完整 readiness，有 legacy upgrader；预期 keep legacy，非目标 intent 完全不变；反向跨越和缺失/非法当前 Controller 值保守 fallback；先 RED 后接线。
- [x] 跨 tick 回放取消/销毁、第二 spawn、过期事件、重置与 accepted->spawning->active/retiring；复跑 hold/rearm、autoSuspended 和所有 fallback 原有测试。
- [x] 维护者检查与完整门禁；不启用任何线上 active。

## Batch 3: E0 owner 反馈

**Files:** `ResourceMarketService.js`、`TaskMetadata.js`；ActionParser 沿用 clearTaskState，除非为准确 action 前快照确需附加元信息；TaskGuardService 仍只做清理；现有 smoke 相邻物流与动作块。

**Interfaces:** 预留拥有 reservationId/creepName/side/marketEntryId/amount/assignedAt/expiresAt/targetId/resourceType/status；taskMeta 引用同一 reservationId。ResourceMarket reconciliation 幂等地消费 task/lastTaskClear 和下一 tick stores，不在 core import 市场策略。

- [x] 写 `cancel_releases_only_owner`：两 hauler 对同 demand 各预留 50，取消一人后其份额释放、另一人仍受保护；目标消失、ERR_FULL、owner 死亡、任务替换分别回放；观察当前 cancel 后 reservation 不变的 RED。
- [x] 写 `accepted_transfer_waits_for_next_tick`：真实 assignHauler/ActionParser 返回 OK，同 tick 预留仍在；模拟下一 tick owner/target stores 变化，释放并确认实际 quantity；第二次 reconcile 不重复计量。并发净变化不可分解则 confirmation_unknown，不能拿 task.amount 当 delivered。
- [x] 实现 taskMeta/lastTaskClear 可选引用、owners 的 aggregate 和 ResourceMarket analyze/cleanup 对账；供给保持独占、TTL=5、评分与精确/批量取量公式不改。
- [x] 写 pickup/withdraw/self_fetch 的同样反馈链、partial unload 后残余再配送、在途 task TTL 到期的有限重新预留、global reset、匿名旧记录 TTL；每房超 200 owner 时拒绝新预留并报 blocked，不丢有效 owner。
- [x] 维护者检查（无额外撮合器/重复 ledger/history）与完整门禁。

## Batch 4: 必要经济恢复

**Files:** `RoomPhaseService.js`、`SpawnBureauService.js`、`ResourceMarketService.js`、相关 Builder/Upgrader/Repairer strategy、TaskGuard 的上下文验证、`EmpirePolicy.js`；按目录 AGENTS 与现有模式修改，不改变角色职责。

**Interfaces:** RoomPhase.recovery 的 mode/reasons/evaluatedAt/coreUsable/coreUpcoming/blockedBy；policy.economyRecovery.enabled=true 与 reserveCritical=5000；consumer 按 spec 的核心/非必要支出界限处理。

- [x] 真实 service 序列回放 miner gap/hauler gap、已 upcoming、currentEnergy 可负担、storage 缺能救援、储备不足，先记录当前行为和明确失败验收；不根据一次 unavailable 猜缺 hauler。
- [x] 对已验证需修复的路径增加 RED：ghost 不阻止补员、损坏 miner 替换用可负担 body、核心 gap 下不持续追加非核心 worker；新/已有非必要消费一致暂停，Controller emergency 和 urgent repair 不暂停。
- [x] 实施最低恢复约束；spawns 全失/零能源且无执行者输出 support_required；不自动改 worker role、自杀或消费不存在的资源。
- [x] boundary 回放：reserve=4999/5000、spawn rescue 0.5/0.85、upcoming 完成/取消、已有 carried energy、不丢资源、normal 时既有正常策略恢复；显式 enabled=false 关闭新限流但不关闭 Controller 安全或 C1/C2 正确性。
- [x] 维护者检查与完整门禁。提议阈值不是最优经济结论，另等线上校准。

## Batch 5: 有界观测与验收准备

**Files:** `EmpireMetricsService.js`、`RuntimeTelemetry.js`、`EmpirePolicy.js`，main 仅传递 SERVICE_VERSION（不放业务逻辑）；现有 smoke 摘要/schema 回归；本地只读采集脚本另放 `scripts/` 并只允许 GET。

**Interfaces:** 摘要包含 codeVersion/Game.time、recovery/core/物流 feedback 计数和可确认能量 delta；每房历史最多 50、每 50 ticks；原 service-phase EWMA 保留，有限 raw totalCpu 用于样本 p95；缺 Game.cpu 时 null。

- [x] 按 spec 写 capacity/version/unknown/分 tick counter fixtures，不复制完整 tasks/bodies；重置/代码版本变化另起验收段，不沿用旧累计 sampleCount。
- [x] 扩展现有遥测与 compact metrics；owner 记录和历史上限严格验证；采集不每 tick 序列化全 Memory。
- [x] 本地故障序列统一回放并记录恢复结果、Controller、任务、限流、预留峰值和代码版本；完整门禁。
- [ ] 在另获部署指令后才收集同版本至少 10000 ticks 的真实窗口；当前只读 baseline 是起点，不宣称窗口完成。角色替换/建设/能源波动未覆盖则继续标为验收缺口。

## 当前状态

- [x] Git/指令/独立 Node 基线复核、诊断复现、线上 GET 快照与代码回读核对。
- [x] 具体 spec 与配套 plan 已认可；本地代码实现及 review 修复已完成。
- [x] 具体 spec 人工审阅。
- [x] Batch 1–5 的生产实现、RED/GREEN、本地完整门禁与逐批交付。
- [x] 2026-10-14 用户明确授权本轮提交、推送、游戏部署和页面观察。
- [ ] 新版本部署回读核验及 >=10000 ticks 真实验收。

每批完成后更新状态和 evidence，不将设计 checkbox 或旧线上历史样本误报为代码/验收完成。回退按 spec 分批，不擅自还原用户其他改动。
