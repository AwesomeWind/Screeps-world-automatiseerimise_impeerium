# 单房自主生存与恢复设计

日期：2026-10-13，完成记录更新于 2026-10-14。状态：具体 spec 已获人工认可，本地实现与独立 review 修复完成，线上验收未完成。相关 [诊断证据](../evidence/2026-10-13-single-room-diagnostics.md)、[实施计划](../plans/2026-10-13-single-room-survival-recovery.md) 和 [交付记录](../evidence/2026-10-14-single-room-delivery.md)。

## 目标、范围与当前基线

在已有母房经济框架上修复统计与孵化时序、补最小物流反馈和恢复底线，使房间在可恢复的资源条件下重新获得采矿/运输能力，同时守住 Controller 和核心能源。自主经营、自动扩张和被动防御是长期目标，本阶段不实现远程矿、Goal/Plan、EmpireDirector、殖民、多房库存或主动战争。

基线为 main/origin/main `ca38dc4e863c8bf53e15298f43a0b4677ddd63e9`。上一阶段已提交、推送、上传；本轮已通过只读 code GET 验证线上 default/main 与当时本地 dist 完全一致。线上 shard3/W49N41 仍为 Governor shadow、scheduler.enforce=false。工具链使用独立 bundled Node v24.19.0，不修改共享 NVM。

本阶段代码可以在本地实现与测试；提交、推送、再次部署、修改在线 Memory、console 动作和 active 试点均另需明确指令。不自动使用子代理。

## 已确认问题与方案选择

诊断已复现陈旧 Memory 覆盖、真实 5 WORK 备份估为 1、损坏 WORK 被计数、双 spawn 同名/能量超排、Controller 评估间隔内跨阈值仍 suppress，以及结束的物流任务没有 owner 反馈。预留目前最多虚占到 TTL=5，不是永久锁死。

选择 **共享小型事实读取契约 + 现有服务局部修复**。只在相关消费者间共享身份/有效 parts 规则，不新建持久化 creep registry，不重写 ResourceMarket。另一方案是各处独立打补丁，会继续让 RoomPhase、Bureau、Governor 统计漂移；第三方案是整体重建帝国调度和物流账本，超出当前目标。

## C1：身份、有效能力与替换证据

新增 `src/core/CreepPopulation.js`，提供纯函数 `collectCreepPopulation({ creeps, spawns, creepMemory, spawnRecords, tick, spawnTime, replacementLeadTicks })` 和 `activeBodyPartCount(body, partType)`。调用方显式传数据；函数不写 Memory、不发布事件、不执行动作。先不引入跨 tick 缓存；性能测量若证明重复读取成为热点，再独立优化。

每个 name 最多一个 entry，字段为 `name/memory/body/bodyKnown/state/activeParts/source/coversQuota/reasons`。`state` 为 `active/spawning/accepted/retiring/invalid`。live 对象优先，Memory.creeps 只作元信息，不能单独证明存在。

| 证据 | 状态及统计规则 |
| --- | --- |
| live，spawning=true | spawning；使用真实 body；未出生不算 current；同名备份不重复 |
| live，TTL > body.length*spawnTime+lead | active；只统计 hits 未耗尽的 parts；body 已知但有效 WORK/CARRY=0 时不能覆盖对应核心功能 quota |
| live，TTL <= 上述边界 | retiring；保留 replacement evidence，不算未来稳定配额；body 长度含损坏 parts，孵化时长不按有效 parts 缩短 |
| live 缺 role | Spawn.init 先用同名成功备份恢复；否则可用同名 Memory.creeps 元信息，但不凭 body 推角色；仍缺身份则 unknown/invalid 并记录原因 |
| 当前 spawn.spawning.name 匹配，live 暂不可见 | spawning；身份来自备份或 Memory.creeps；body 可来自成功备份；无 body 标记 unknown，不猜 1 WORK。物理孵化占用可以防重复，但不能当已测能力 |
| 当前 tick 成功 spawn、live/engine.spawning 尚未反映 | accepted；有成功记录才成立，供 upcoming 与去重；未执行的请求/pendingTasks 不属于成功能力 |
| 成功记录过期 / 无 live、无 spawn、无同 tick accepted | 不让 Memory 单独覆盖恢复；新格式有 acceptedAt/spawnName，下一 tick 缺失对应孵化证据便失效；旧记录缺身份时仅保留 memory 恢复数据至原 expireAt，不计已确认能力 |

Spawn 备份新增 `schemaVersion:2/acceptedAt/spawnName/spawnRoom`，保留 `memory/body/expireAt`。旧格式不产生滚动的新期限；不能每次读取都重新赋 `Game.time+150` 让未知状态无限续命。当前 spawn 的直接证据可覆盖旧备份到期限制。

没有 expireAt 的旧备份第一次在 Spawn.init 兼容入口遇到时，记录固定首次观察 tick，并最多保留 150 ticks 供恢复身份；纯 reader 不写这项迁移信息。该有限保留不授予能力或配额覆盖，不得因下一次读取再次延长。

RoomPhase、GovernorFacts、Bureau 的 role/quota/source WORK 使用同一事实规则。生产 intent 的 body 作为 planned capacity 另加，不冒充 accepted。Boost 暂按有效 part 数量统计，不突然换成 boosted 产量；受损 parts 一律不计。

`memory.retire/idle_surplus` 是主动闲置退出请求，与 TTL 替换窗口分开记录。卸货时仍能执行的单位不因一个 retire flag 就触发补员；只有实际死亡/取消或有效能力失效才移除覆盖。CreepRetirement 的最后核心角色保护使用有效存活功能而非陈旧 Memory。不得通过减少计数让“退役一个闲置单位 -> 立即补一个 -> 再退役”循环出现。

## C2：spawn intake、重放和 Controller 安全

### 同 tick

- Spawn.init 建立每房本 tick 可分配能量余额、空闲 spawn 和已接收请求身份。handleSpawnRequest 在选定 spawn 前校验完整有效 body 与余额；接受时扣余额，拒绝时不占 spawn。
- 同一 event.id/requestId 或显式 name 不重复排队。经济角色同一 quota 每 tick 最多接受一个 intent，符合当前 Bureau.addIntent 的发布边界；不扩大到战争/远程无 quota 请求的数量政策。
- 自动 name 包含 role、tick、spawn 名与本 tick 序号，避免双 spawn 同名；显式 name 保留，冲突不会自动改名制造额外 creep。
- run 返回 OK 才产生成功记录；失败释放本地预留，不能保存成功备份。保留仍有效的需求供下一 tick 重试，重试仍须检查最新 quota/能量/期限；不把 dispatch 接受等同游戏孵化成功。

原 EventBus event 被 intake 标记 handled 后，run 失败不能依赖该 event 还在队列。重试保留原 requestId/原 expiresAt 和 quota，作为下一 tick 可检查的请求重新入队；到期即放弃，由 Bureau 的最新需求重新生成请求。不增加第二轮同 tick dispatch，能量余额失败释放只影响未执行任务和下一次正常接收。

### 跨 tick 和重置

成功记录、当前 live 和 spawn.spawning 共同验证 upcoming。取消、spawn 销毁以及过期记录不能继续遮蔽恢复。global reset 后由这些持久/引擎证据恢复，不依赖上一个 JS 实例的 acceptedSpawnNames。缺 role 恢复在所有 analyze 之前完成。旧匿名/无 body 状态只作为未知记录，不猜有效能力。

成功 request 回执另存 `Memory.empire.spawnRequestReceipts` 至原请求截止 tick，每房最多 200（policy.spawnIntake.maxReceiptsPerRoom，硬上限 200）。这不是另一份 creep registry，只保留 requestId 对应的 name/room/expireAt；body 备份按原规则清理后，回执仍能保护 reset 后的请求重放。

Controller 安全每 tick 读取 `room.controller.ticksToDowngrade`，不能只用 Governor 快照。快照/当前值任一缺失或非法时，不授权 active；阈值跨越立即进入已有 emergency keep/replace 路径，并保留全部非目标 legacy intent。readiness、新鲜度、autoSuspended、hold/rearm 语义不改变。测试可以构造 active 世界验证安全，但本阶段运行模式仍为 shadow。

## E0：最小 owner 反馈和预留释放

外部 API 保持 `supply/demand/requestResource/assignHauler`。供给保持当前独占策略，需求保持 quantity 预留；本阶段不改排序、距离公式或预留 TTL=5。

### 生产者与消费者

1. ResourceMarket 分配 task 时，给预留生成本房唯一 `reservationId`，记录 `creepName/side/marketEntryId/amount/assignedAt/expiresAt/targetId/resourceType/status`；taskMeta 保存引用。现有 aggregate amount 是 owners 的和；旧匿名记录保留原 TTL，不能删除其他 hauler 的份额。
2. TaskMetadata.assignTask 复制可选预留引用；clearTaskState 将该引用及 reason/result 写入现有 lastTaskClear。core 不 import ResourceMarket，不在 ActionParser 加撮合策略。
3. ResourceMarket.analyze 在 TaskGuard 之后、市场 rebuild 之前协调上一 tick 结果；cleanup 在 ActionParser 之后消费本 tick 清理结果。每次处理按 reservationId 幂等，不能重复记成功或释放。
4. owner 死亡、目标消失、明确取消/替换、失效/满仓等未产生成功 intent 的结果，在 reconciliation 中只释放该 owner；release counter 给出原因。不要清空整个 target 的 reservation map。

### `OK` 与实际送达

ActionParser 的 OK 只标记 `awaiting_confirmation`，同 tick 仍保留预留，防止引擎结算前同一资源重复分配。下一 tick 新市场基于实际 store 重建，旧任务已结束可释放相应 owner。

记录 action 前 owner store 和 target store 的该 resource 值；下一 tick 在可确定的 delta 场景记录 confirmed quantity。并发收/发、target/owner 消失等无法准确分解时记 `confirmation_unknown`，不把 intended amount 当成实际 delivered。退出释放可以依据任务已经结束和 fresh market；计量不能伪造成功。重复 reconcile 不累计两次，历史状态最多保留至 TTL 兜底清理。

任务仍在途中且预留过期，不凭空续期或永久锁定；下一市场检查真实任务是否仍占用，必要时重新建立带 owner 的有限预留。global reset 用 taskMeta、lastTaskClear 和 persisted owner 记录恢复；不能仅靠 EventBus/global 回调。每房 owner 记录上限 200，超限拒绝新预留并报 blocked，不删仍有效记录。记录长度和内存成本纳入验收。

partial unload 必须只确认实际转移/释放本次 task 份额，残余携带资源继续由下次 assignHauler 选择需求；保持现有“先卸货再补装”。无 reservation 的旧任务不强制迁移，沿用旧清理和 TTL。

## 经济恢复：必要支出边界

这是需要本 spec 审阅的新策略语义，不能从“Governor shadow”推导它已经在执行。

RoomPhase 增加派生 `recovery`，包含 `mode/reasons/evaluatedAt/coreUsable/coreUpcoming/blockedBy`，保留已有 energyPosture 名称与 rescue 0.5/0.85 滞回。模式优先级为 `support_required -> miner_gap -> hauler_gap -> spawn_energy -> reserve_low -> normal`；support_required 表示缺 owned spawn 或没有任何可行能源/采集执行者，明确需要外部支援，不承诺凭空恢复。

- miner/hauler 功能缺口先使用当前可负担 body；同 source/core quota 已有有效 upcoming 时等待，不能因暂时 current=0 无限追加。spawn 缺能优先调配 storage 及有效资源供给到 spawn/extension。
- core gap / spawn rescue 时暂停新非核心 builder 与额外 upgrader 孵化；既有 worker 的新的非核心建设/普通升级取能也暂停。Controller emergency 的最低升级任务、spawn/source 基础设施恢复、urgent repair/被动防御仍保留。不给 builder 加维修角色，也不接管 buildWork/repairWork。
- 低储备使用 `policy.economyRecovery.reserveCritical=5000`，是与现有 Governor 初始阈值相同的提议值，不宣称最优；该新 policy 明确是执行策略，不复用 shadow 模型开关偷偷改变语义。储备恢复到 >=5000 且无其他恢复原因时解除；不引入未经测量的额外滞回参数。
- 有载能 worker 不丢资源、不 suicide、不改 role；暂停任务要有可解释状态，并通过普通市场优先服务核心需求。TaskGuard/strategy 对跨 tick 已有非必要任务做一致处理，不能只阻止新派活却让旧任务无限继续支出。
- 所有 priority/阈值集中在既有 empire policy 下；本阶段不自动调参。E0 后再实施恢复消费限制，以免反馈未完成时误诊为“缺 hauler”。

2026-10-14 验证后的补全：必要工地保留最低一个 builder 的补员，urgent repair 补员不依赖被暂停的普通 upgrader，并按当前能量造 body；恢复期不新增只有 routine maintenance 的 repairer，urgent backlog 不混入 routine backlog。显式 budget=0 必须产生空 body，不能落回房间最大容量。

恢复能源包括本房有效 hauler 已携带能源。还必须区分能源不足与无恢复路径：[官方 Spawn API](https://docs.screeps.com/api/#StructureSpawn) 规定房间 spawn/extension 能源总量低于 300 时，Spawn 每 tick 自动回充 1 energy。可用 Spawn 的基础恢复记为 `awaiting_spawn_regeneration`，不能因当前不足 100/150 就声称必须外援。无 storage 的房间同样使用 0.5/0.85 的 spawn 缓冲保护，在 Memory.rooms 的 recoverySpawnRescue 中保存滞回状态；原 energyPosture 名称不变。

提议默认 `economyRecovery.enabled=true`，仅在 Batch 4 通过本地验收后作为新版本的执行行为交付；本次具体 spec 审阅包含这项默认行为。它与 Governor active 无关。读当前已部署 Memory 不存在此字段时，不在读工具中补默认值或修改线上。

## 观测与线上验收

优先扩充现有 EmpireMetrics 的 compact 房间记录：本次 codeVersion（构建 SERVICE_VERSION）、Game.time、recovery mode/reasons、usable/upcoming core counts/parts、spawn intake blocked reason、logistics pending/confirmed/unknown/released 数量及能量 delta 可确定值。房间长期历史最多 50 条、每 50 ticks 一条；错误/恢复边沿另用现有 bounded events。无意图 body、完整 task 或全量 Memory 副本。

CPU 继续使用现有 service/phase 遥测；raw sampled totalCpu 的有限历史用于 p95，EWMA 不能替代 p95。没有真实 Game.cpu 时用 null，不能记 0。Memory 字节优先在只读离线 snapshot 中统计，不每 tick JSON.stringify 整个 Memory。

线上最终窗口至少 10000 ticks，同一代码版本分段，覆盖角色替换、建设变化及能源波动。要求：角色缺口能恢复或明确支援阻塞、Controller 不失守、核心补能与任务持续推进、owner 预留不超界/无遗留永久虚占、CPU 可持续且 bucket 不长期下滑。仅无异常或计时结束不算通过。故障先本地回放，生产不人为杀单位/取消孵化/毁设施。

当前 snapshot 的历史 rollout 122719 样本没有版本分段，不能当下一版本 readiness/恢复验收。当前只证明采样点状态与代码回读一致，没有 10000-tick 序列。active 的 50 shadow 样本和 500-tick 单房门槛属于另一独立验收，不因本阶段方向批准而启用。

## 分批交付、错误与回退

顺序为 C1 -> C2 -> E0 -> 必要恢复约束 -> 观测与线上观察，每批 RED/GREEN、维护者检查和完整本地门禁。测试入口沿用 smoke.cjs / room-governor.cjs，按真实调用链覆盖同 tick 与跨 tick。

无合法事实时用 unknown/blocked，不凭角色编造能力；配置非法保留完整 legacy fallback；预留错误只隔离该 owner 并保持 TTL 兜底。任何批次发现新证据推翻原方案时回到诊断，不叠加 workaround。

本地回退按批次还原代码。新 spawn 字段和 owner 元数据采用可忽略的附加 schema；旧版本可按 aggregate/TTL 继续工作。若需要运行时关闭新恢复约束，可显式设置 economyRecovery.enabled=false（操作本身需另行授权），但正确性修复及 Controller 安全不依赖这个开关。尚未部署时无需在线回退。禁止以回退代码声称撤回已经执行的 spawn/transfer。

## 审阅点与未完成状态

已审阅的具体选择是：旧成功记录没有引擎证据时不再计已确认能力；经济 quota 同 tick 最多一个；反馈 owner/下一 tick 确认；5000 低储备的执行语义及恢复期非必要消费限制；有容量上限的观测。用户已明确批准具体设计及配套计划，并另行批准一次只读独立 review。

本轮本地代码与回归完成，独立 review 的实质问题已通过 RED/GREEN 修复；尚未提交、推送、再次部署或修改线上 Memory，未启用 active/enforce。线上新版本的 >=10000 ticks 验收仍须在另获部署指令后执行。
