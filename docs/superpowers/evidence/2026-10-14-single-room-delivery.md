# 单房自主生存与恢复：本地交付

完成日期：2026-10-14。基线 `main / ca38dc4e863c8bf53e15298f43a0b4677ddd63e9`；本轮代码保留为未提交工作区变更。具体 [设计](../specs/2026-10-13-single-room-survival-recovery-design.md) 和 [计划](../plans/2026-10-13-single-room-survival-recovery.md) 已获用户认可，另获准并完成一次只读独立 review。

## 交付范围

| 批次 | 已完成代码 | 验证边界 |
| --- | --- | --- |
| C1 | CreepPopulation 共享 live/spawning/accepted/TTL retiring 证据；陈旧 Memory 不单独覆盖配额；真实备份 WORK、受损 parts、缺 role 恢复和旧记录有限保留 | 真实 SpawnService/Bureau/RoomPhase/Governor 调用链回归；主动 idle retire 不冒充 TTL retiring |
| C2 | 同 tick 共享房间能量、经济 quota/request/name 防重、唯一自动 name、原期限重试、成功回执跨 reset 持久化、当前 Controller 时间安全检查 | 双 spawn、取消/销毁、replay、backup 清理后 reset、Controller 4999/旧 snapshot 5001；完整 legacy fallback/hold/rearm 原回归保持通过 |
| E0 | owners/aggregate 预留、TaskMetadata 可序列化引用、动作前 store 观测、analyze/cleanup 协调与下一 tick 确认 | 取消、目标失效、owner 死亡/替换、partial unload、withdraw/self-fetch、TTL、200 容量、非法 policy、序列化 reset、旧 null/匿名记录 |
| 恢复 | 当前可负担核心 body；必要施工/urgent repair 最低补员；非必要支出一致限流；Controller emergency 例外；低储备和无 storage 的 spawn 缓冲保护 | 5000 储备、0.5/0.85 滞回、载能 worker 不丢资源、不改角色；可用能源/引擎回充等待与外援依赖分开 |
| 观测 | codeVersion、有限 raw CPU/p95、房间 50 条历史、核心能力、Controller/施工进展、spawn intake 原因、累计反馈和 energy-only 可确认 delta | 缺 CPU 记 null；版本变化另起段；关闭观测不关闭执行；只读 JSONL 采集器不自动宣布验收通过 |

生产改动没有新增依赖。main.js 仅传递 SERVICE_VERSION；业务仍留在对应 service/strategy。LogisticsService 空壳未接入，未实现远程矿、Goal/Plan、EmpireDirector、殖民、多房库存或战争扩展。

## 新合约与运行默认值

- `Memory.empire.spawningCreeps`：schemaVersion=2，新增 acceptedAt/spawnName/spawnRoom，保留 memory/body/expireAt；body 不写入 creep.memory。
- `Memory.empire.spawnRequestReceipts`：按原请求期限保留，`policy.spawnIntake.maxReceiptsPerRoom=200` 且硬上限 200。body backup 正常清理后仍保护 reset 重放。
- `policy.resourceReservations`：ttl=5、maxTaskTicks=50、maxOwnersPerRoom=200。旧匿名预留仍按原 TTL 清理；新 owner 引用在 taskMeta/lastTaskClear 中。
- `policy.economyRecovery`：enabled=true、reserveCritical=5000。这是用户已批准的新执行限制，独立于 Governor shadow；关闭该新限流用 enabled=false，操作在线 Memory 本身仍需另行授权。
- Governor 默认 shadow、scheduler.enforce=false 未变；没有扩展 capability takeover 到 builder/repairer，也没有启用 active。
- confirmed quantity 仅记录双方 store delta 可一致证明的部分；并发无法分解或证据缺失记 confirmationUnknown。API 的 OK 和计划 amount 不等于实际履约。
- [官方 Spawn API](https://docs.screeps.com/api/#StructureSpawn) 的自动回充是实际恢复路径；当前缺能记录 awaiting_spawn_regeneration，不能直接报需要外援。无可用 owned Spawn 仍报告支援依赖。

## 独立 review 和处理

reviewer 于 2026-10-13 14:49–14:55（北京时间）只读检查工作区、新文件、spec/plan/ledger，运行两测试入口与 diff 检查；未读凭据、未操作线上、未修改工作区。

| 原 review / 自检问题 | 处理及 RED/GREEN |
| --- | --- |
| Important：urgent repair 被暂停的 upgrader 前置条件连带堵住 | 补员 bypass 只用于恢复期 urgent；RED 无 repairer intent -> GREEN 可负担 urgent intent |
| Important：必要工地无法补 builder | 恢复期最低一个必要施工者；RED 无 builder -> GREEN 当前能量 body；普通工地仍暂停 |
| Minor：hauler 携带能量漏算 | 因恢复反馈契约重新分级为必须修复；RED support_required -> GREEN miner_gap，并只算实际同房有效运输者的 energy |
| 自检：backup 清理后 reset 丢 request receipt | RED 重复 pending=1 -> GREEN=0；增加有限持久回执，不保留另一套 creep body |
| 自检：budget=0 被两个 || 分别吞掉 | RED 仍生成 body -> GREEN 空 body/no_valid_body；不再把“零”视作“未传” |
| 自检：引擎回充/无 storage spawn 缓冲遗漏 | 官方事实核验后回归；RED support_required/normal -> GREEN 等待回充/缓冲恢复，保持 0.5/0.85 滞回 |
| 自检：新反馈入口对 legacy null record 抛异常 | RED TypeError -> GREEN 原 prune 兼容，不阻断房间生命周期 |

routine repairer 的恢复期空转风险按目标裁决：不为仅 routine 的工作补员；已有 worker 等待不算 idle_surplus。未接入的 scanWorkerEnergyDemands 不据此推断实际绕过，也不凭方法名称接入新流程。不同 requestId 的跨 tick 同 quota 仍可能代表所需多份产能，未一刀切禁止。修复后未追加第二轮独立 review，使用各问题 RED/GREEN 与完整门禁验证。

## 本地验证

使用独立 bundled Node v24.19.0；未切换共享 NVM。

- `npm test`：smoke、room-governor 两入口通过。
- `npm run build`：确认 DEST 不存在，只构建、不上传。
- `git diff --check` 和 `git diff --cached --check`：通过。
- 文档相对链接、JSON/JSONL、采集脚本语法/参数入口：通过。

关键用例运行的是生产者/消费者流；Screeps 游戏动作使用本地 mock，不把它称为真实游戏故障验收。

## 线上只读事实及缺口

已保存 [初始快照](2026-10-13-single-room-readonly-baseline.json)、[后续单点](2026-10-13-single-room-current-readonly.jsonl) 和 [2026-10-14 单点](2026-10-14-single-room-readonly.jsonl)。最新快照北京时间 08:52，shard3/W49N41：

- 游戏时钟 83630590，runtime tick 83630589，metrics age=10。
- 线上 main SHA-256 为 `1f79e71e565e3bf5bc3165a1ada3e9df62c25b2837dd41e6336cabb20586cdda`，仍是此前部署代码；本轮新代码尚未上传。
- requestedMode/effectiveMode 均 shadow，Governor shadow=true，scheduler.enforce=false。
- CPU bucket=10000，旧版本 CPU EWMA≈3.80，Memory=77233 bytes，storageEnergy=1000000。
- 线上尚无本轮新增的 telemetry.codeVersion/raw CPU history，不能将这些旧状态或历史 rollout.sampleCount 当成本轮验收。

这些是离散单点。没有新版本连续 >=10000 ticks 的恢复、Controller 安全、任务推进与可持续 CPU 证据；没有对生产杀单位、取消孵化、破坏设施或发送 console 指令。一次采集超时后只读探测三接口均返回 200，后续单点采集成功，未修改超时规则或线上状态。

## 采集与下一步

[采集脚本](../../../scripts/single-room-observation.mjs) 只 GET code/memory/game time，token 仅在进程中用于请求头，不输出或写入证据。输出必须是工作区内新 JSONL，不能覆盖已有文件。单次模式用于基线；窗口模式要求显式已核对的部署 SHA-256 与匹配 SERVICE_VERSION，最多 251 条快照、4000 次轮询，每 30 秒读取，至少相隔 50 ticks 记录一次。达到 10000 ticks 后仍标记 review_required / acceptancePassed=false。

部署获得明确指令并回读核对后，可用独立 Node 执行：

```powershell
& 'C:\Users\mts-2\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/single-room-observation.mjs --shard shard3 --room W49N41 --target-ticks 10000 --expected-main-sha '<已核对的部署 SHA-256>' --output docs/superpowers/evidence/single-room-10000-ticks.jsonl
```

本轮没有启动长窗口。观察需检查角色替换、建设/Controller 进展、能量波动、recovery/unknown/blocked 原因、资源预留峰值与 bucket 趋势；缺场景或缺样本则继续标缺口。50-tick 物流 task 期限、5000 储备参数和真实 CPU 成本都待此窗口检验。

下一项推荐：审阅当前未提交 diff，按明确指令提交/推送/部署并完成新版本窗口；达到单房验收后再做单个远程矿闭环。active 的 50 个完整 shadow 样本与 500-tick 单房试点仍是独立门槛，本阶段不自动触发。

## 执行裁决与回退

当前发布状态见 [2026-10-14 发布记录](2026-10-14-single-room-release.md)：代码 647dac7 已提交、推送并部署，main/map 哈希和运行版本匹配，初始只读观察已保存，10000-tick 验收尚未完成。下文“本轮未提交/未部署”为发布前交付时点，不代表当前状态。

2026-10-14 发布准备补记：用户已明确授权提交、推送、执行游戏服务器推送指令及在其打开的页面观察。发布前重新运行 `npm test`、无 DEST 的 `npm run build` 和两类 diff 检查，均通过；fetch 后 origin/main 与本地 HEAD 同为 ca38dc4。已只读保存 default 活跃世界分支的旧 main/map 至本机 `.worktrees/release-backups/2026-10-14T01-20-29.561Z/`，旧 main SHA-256 与上文快照一致。原文“未提交/未部署”描述此前交付时点；新版本提交、部署和验收事实以随后发布记录为准。浏览器扩展连接暂时失败，尚未取得页面观察证据。

完整 [ledger](../plans/2026-10-13-single-room-survival-recovery-ledger.md) 保留全部裁决和成本：未知 body 不猜、WeakMap 只关联原 task 至可序列化 meta、50-tick 本房期限、政策等待不误退役、Controller emergency 的最低升级、持久回执、诊断按真实能源/引擎事实、未接入方法和跨 tick quota 的边界，以及线上证据限制。

本轮留在工作区，无提交/推送/再次部署/在线 Memory 写入。新字段为可忽略附加 schema，旧匿名 TTL 保留；本地回退按文件/批次，不触碰用户其他改动。任何已实际执行的 spawn/transfer 都不能靠回退代码撤销；此处没有对新版本做生产执行。
