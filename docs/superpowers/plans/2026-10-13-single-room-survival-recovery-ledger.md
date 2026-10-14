# SDD ledger — plan: docs/superpowers/plans/2026-10-13-single-room-survival-recovery.md

基线 main/origin/main ca38dc4e863c8bf53e15298f43a0b4677ddd63e9；具体 spec 已由用户于本聊天明确认可，执行方式为当前聊天内分批实现。

Pre-flight: C1 生产的 spawn schema/事实规则由 C2 intake/reset 和恢复策略消费；E0 taskMeta/lastTaskClear owner 引用由恢复任务暂停与 telemetry 消费，均按同一 spec 接线。

Ruling: 技能的自动 reviewer/commit/独立 scratch workspace 步骤采用用户约束下的维护者自检、可审阅 ledger 和未提交工作区 — 用户要求不自动调用子代理、不提交/推送/部署；后来明确批准一次只读独立 review，已执行 — 不自动追加 reviewer 或提交，ledger 保留到用户决定提交。

Batch 1 in progress: smoke 新回归 RED stale role 1 != 0；实现共享 CreepPopulation 后，真实 5 WORK 成功流、受损 parts、TTL 68/69、取消/销毁、陈旧 Memory 均 GREEN。原 fixture 中仅 Memory 的“仍在孵化”改为附加当前 spawn.spawning 证据，未放宽能力契约。smoke 和 room-governor 当前通过；还需完成本批边界回归与完整门禁。

Ruling: 未知 body 的物理孵化占据 source quota，但不计已确认 WORK — spec 要求未知不猜 parts，同时避免在已确定的制造期间重复补员 — 若未知记录长期无法得到 body，将以 unknown 指标暴露，等待引擎事实而不制造无限重复单位。

Batch 1: complete — smoke/room-governor、bundled Node v24.19.0 本地 build、两个 diff 检查通过；没有提交。固定旧记录期限、同名 live 的 role 恢复、主动 retire 标记仍保留卸货能力均覆盖。

Batch 2 in progress — 已观察 RED 两个 200-cost 请求在 300 能量排入两台 spawn、Controller 4999/旧 5001 仍 suppress；实现后 GREEN，新增有限期限重试与跨 tick/reset receipt 防重。开始完整门禁后进入 E0。

Batch 2: complete — 两测试入口、bundled Node 本地 build、两个 diff 检查通过，无提交。成功 receipt 在原请求期限内防跨 tick 重放，reset 从持久成功备份恢复。

Batch 3 in progress — RED 取消单一 owner 后 amount 100 != 50；实现 owners/aggregate、TaskMetadata 引用与 ActionParser 前观测、analyze/cleanup 协调。取消/目标消失/owner 死亡/任务替换、同 tick OK 继续保护、下一 tick partial delta、unknown、反复协调、withdraw/self-fetch、200 容量、序列化 reset、TTL 在途续租与最长任务期限均通过；另观察 malformed capacity 的 RED，已添加严格有限整数校验。

Ruling: TaskMetadata 内 WeakMap 只为返回 task 的对象关联预留引用，assignTask 再将引用存入可序列化 taskMeta — 保持现有 public task 的结构与 API、避免任务内塞账本字段；global reset 使用已持久化 taskMeta/lastTaskClear，不依赖 WeakMap — 如果调用方复制而非直接 assign 原 task，需要显式复制预留引用；当前所有生产资源任务调用方直接 assign 原 task，已核查。

Ruling: 物流 task 最长 50 ticks，并放在 policy.resourceReservations 下，TaskGuard 读 taskMeta 限期而非给 public task 新增 expiresAt — 沿用现有 MOVE_TO 默认时间尺度且保证不能无限续租，本阶段仅本房 — 极端绕行超过 50 ticks 会释放/重新派活，须在真实路径验收中观察此成本。

Batch 3: complete — smoke/room-governor、bundled Node build、两个 diff 检查通过；owner feedback 逻辑提取为 ResourceReservationFeedback，未新增撮合系统。新字段仅在 owners/taskMeta/lastTaskClear 中；旧匿名 TTL 保留。

Batch 4 in progress — 已观察 RED RoomPhase 缺 recovery contract；实现核心 usable/upcoming、可负担 hauler、support_required、5000 储备边界与 worker/资源请求/旧任务一致限流。Controller emergency、核心 spawn 建造、urgent repair 和手动禁用保持例外；正在完成本批门禁。

Ruling: 恢复期的政策等待不作为 idle_surplus 退役理由 — 否则临时暂停超过 100 ticks 会让旧 CreepRetirement 自动清掉等待恢复的 workers，违背保留携带资源/恢复后继续推进的目标 — 暂时保留的非必要 worker 仍消耗存活时间，实际数量与经济成本需要上线验收。

Ruling: Controller emergency 的最低经济 upgrader 可越过普通 miner/hauler 前置门槛，且 body 使用当前能量 — 明确的 Controller 底线例外，否则“核心恢复”会遮蔽最低升级支出；仍由 SpawnService 共享能量/原优先级控制 — 可能延后其它恢复单位，需观察 Controller 与核心恢复双方结果。

Batch 4: complete — 完整 smoke/room-governor、Node v24 本地 build 与两个 diff 检查通过，无部署。Controller/urgent repair/核心建造、储备 4999/5000、已有 task、资源 API、禁用恢复约束边界已覆盖。

Batch 5 in progress — RED 无 Game.cpu 时 totalCpu 0 != null；新增 codeVersion/50 条 raw CPU/p95、按版本的 50 条房间恢复历史、禁用观测不影响执行。物流同时记录固定字段的累计 feedbackTotals 和 energy-only delta，避免每 10 ticks 的采样丢掉中间确认；房间历史的完整 tick CPU 在 RuntimeTelemetry.finishTick 后补齐。

Final review: 用户明确批准的 single_room_readonly_review 已只读审查当前 diff、新文件、spec/plan/ledger，未操作线上、未修改文件；2026-10-13 14:49–14:55，北京时间。

Final: fixed urgent repair 补员被普通 upgrader 前置条件堵住 — 真实 Bureau.analyze 回归 RED 无 repairer intent -> GREEN 当前可负担 urgent repair intent；普通恢复期 routine repair 不新增，urgent backlog 独立计算。

Final: fixed 必要基础设施无 builder 补员 — Bureau.analyze 回归 RED 无 essential builder -> GREEN 至少一个当前可负担的核心建造 intent；普通工地仍限制。

Final: fixed budget=0 被 producer/BodyBuilder 的 || 吞掉 — RED 仍生成 carry/move body -> GREEN 空 body，并由既有 no_valid_body 路径报告阻塞。

Final: fixed reset-after-backup-cleanup receipt 丢失 — RED 再次排队 1 != 0 -> GREEN 请求回执独立持久化至原期限；按每房 200 上限拒绝超额新 intake。

Ruling: 将 carried energy 误报从 reviewer 的 Minor 按反馈契约提升为本阶段必须修复项 — 真实可补 spawn 的 hauler 被诊断为外援需求，会误导恢复观测和人工决策 — 修复只增加有 live/有效 CARRY/同房/实际 store 支撑的能量，不猜运输或预算。

Ruling: 将 Spawn 自动回充纳入恢复等待，并对无 storage 的低 spawn 缓冲沿用 0.5/0.85 滞回 — 官方 API 明确 300 以下每 tick 1 energy，当前预算不足不是无恢复路径；缺 Actor/CPU 的本地环境不能把引擎机制当外援 — 不承诺实时收入或吞吐，仍须真实房间窗口检验。

Final: fixed carried energy / regen / early spawn 诊断 — 各独立回归已观察 support_required/normal 错误，再 GREEN；legacy null reservation 在新协调入口的回归也由 RED TypeError -> GREEN，旧 prune 兼容保留。

Final: Ruling: scanWorkerEnergyDemands 的候选绕过不改行为 — rg 证明生产无调用，不能据此认定线上回归 — 未接入方法的未来使用要另作审计，不能凭名称补功能。

Final: Ruling: 跨 tick 不同 requestId 的同 quota 不做一刀切拒绝 — 现有 hauler/miner quota 可以代表多份实际产能，仅同 tick/replay身份去重，Bureau 按最新事实决定需求 — 缺少跨房统一目标数量契约，后续阶段仍需设计。

Final: Ruling: 资源并发净变化不能分解时保留 confirmationUnknown — 不把 intended quantity 或 OK 伪装实际送达，释放依据新 tick 任务结束和 fresh market — confirmed 数量是可证明的下界，需要结合 stock/unknown 计数判断吞吐。

Final: Ruling: 真实 CPU、超过 50 ticks 的路径、5000 阈值和 >=10000 ticks 生存效果不作本地完成断言 — Node/mock 不具备线上验收证据 — 单次只读快照仅证明当时旧版本状态，新部署仍需独立授权和观察。

Deferred minors: 无纯风格问题列入延期清单；review 唯一 Minor 已因恢复反馈契约重新分级并修复。未进行第二轮独立 review，修复以真实生产链 RED/GREEN 和完整本地门禁验证。

Batch 5: complete（本地，2026-10-14）— 两测试入口通过；codeVersion/历史容量/p95/disabled/null/实际 Controller 进展回归覆盖。只读采集器单次模式执行成功，2026-10-14 tick 83630590 仍为旧线上 SHA、requested/effective shadow、enforce=false；observedTicks=0、acceptancePassed=false。本地 build 和两个 diff 检查以最终交付门禁输出为准，未提交、推送或部署。

最终状态：用户批准的五批本地实现及独立 review 问题处理完成；新版本真实窗口、路径/CPU/阈值校准未完成。下一步按明确指令审阅/部署后开展 >=10000 ticks 观察，不自动推进远程矿或 active。
