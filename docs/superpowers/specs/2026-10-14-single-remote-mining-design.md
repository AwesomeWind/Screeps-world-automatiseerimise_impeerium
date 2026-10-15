# 单远程矿采运闭环设计

日期：2026-10-14。状态：设计与[分批实施计划](../plans/2026-10-14-single-remote-mining.md) 均已获用户认可；2026-10-15 本地实施、一次独立只读 review 和问题修复完成，尚未提交或部署。实际交付范围与验收边界见[交付记录](../evidence/2026-10-14-single-remote-mining-delivery.md)。

## 1. 目标与授权边界

目标是让一个母房支持一个相邻远程房的一处 source，完成侦察、必要容器准备、采矿、运输回母房、补员和受控暂停，并在游戏运行时保留可解释的进展与收支证据。

本地基线为 main，HEAD `9ab8f4263024904972935987fe83672db3802f75`；业务代码发布提交为 647dac7。单房 C1/C2/E0 已部署，其 10000-tick 真实验收按用户最新要求暂时搁置，仍为待验收。不能将此标记改为通过，也不能自动启动旧外部采集自动化。

本次“认可”确认了下一阶段方向和设计工作。提交、推送、部署、配置具体线上矿点及启用执行仍须明确指令；此前发布指令不自动扩展为下一阶段发布授权。Governor 保持 shadow，scheduler.enforce=false；不启用其他能力接管，不自动使用新的子代理。

首版明确不包含：多远程房、多 source、自动选址扩张、claim/殖民、自动铺路、跨房作战、Terminal 调拨、Goal/Plan 或 EmpireDirector。远程房必须为存在 Controller 的普通中立房；不支持无 Controller 的 Source Keeper 房或高速公路资源点。

## 2. 已核对的代码事实

- [RemoteMiningService](../../../src/services/RemoteMiningService.js) 对无视野房间请求 scout，对 Controller 预定不足请求 reserver，再扫描全部 source 请求 remoteMiner；没有远程运输执行器。其存在性检查只扫描 Game.creeps。
- RemoteMining 当前直接发布 REQ_SPAWN，未带 homeRoom 或 quotaKey；SpawnService 的同 tick quota 去重目前只覆盖本房经济角色。需要在真实生产流中证明并修复重复请求，不把静态风险当成已复现结果。
- 主服务数组中 RemoteMining 排在 SpawnBureau 后面。统一 SpawnDemands 必须使远程需求生产早于 Bureau 的同 tick 消费；不能依靠上 tick 的 global 数据。
- [MinerStrategyService](../../../src/strategies/MinerStrategyService.js) 处理 remoteMiner/scout/reserver 的基础移动、采矿和预定，但容器卸货目前依赖本房 cityPlan 的 link 输出逻辑，不提供本设计的独立远程容器合约。
- [HaulerStrategyService](../../../src/strategies/HaulerStrategyService.js) 只派本房 hauler；ResourceMarket 以 homeRoom 市场撮合，尚无受控的远程取货入口。
- TaskGuard 的 remoteMiner 白名单仅 HARVEST/MOVE_TO；ActionParser 的 MOVE_TO 默认 maxTicks=50，stuckLimit=5；长跨房行程和有 fatigue 的移动必须有明确处理。
- ResourceReservationFeedback 已提供 owner 级预留、下一 tick 确认、unknown 和释放；ResourceMarket 的对账消费主要覆盖己方房间，不能把远程 ledger 丢到无人消费的 Memory 分支。
- WarIntel/Security 只分析己方可见房间，不能把 global.WarIntel 不含远程房解释成安全。
- RoomCache 已缓存全部可见房间。现有遥测在游戏内运行，但默认每房历史仅 50 条、每 50 ticks 一条，不能保存完整的 10000-tick 验收段。

本轮不修改前一阶段留下的网络诊断、中断和浏览器恢复报告。

## 3. 架构选择

采用现有服务链扩展：RemoteMining 负责一项受控远程经营的事实、状态和 spawn 需求；远程角色策略消费该状态；SpawnBureau/SpawnService 负责孵化；ResourceMarket/现有 owner 反馈负责短距离资源动作预留及结算；ActionParser 继续仅执行任务。

不采用“只加一个能跨房的 hauler”：它不能解决重复补员、容器准备、危险和母房预算。也不先建立通用 Goal/Plan 平台：本阶段尚没有实测跨房执行结果，通用平台不是完成单矿闭环的前置。

组件与改动边界：

| 组件 | 职责 / 合约 |
| --- | --- |
| RemoteMiningService | 规范化配置；更新限定房间情报；推进经营状态；按 owner 清理/发布 SpawnDemands；记录实际成功孵化成本 |
| RemoteMiningState.js（service 层纯 helper） | 状态、可执行条件、配额、预算和运输数量计算，便于确定性回放；不执行游戏动作 |
| RemoteMiningRoute.js（service 层 helper） | 仅对母房和目标房规划/校验路径；考虑 body、地形、危险；输出可序列化路径和期限 |
| RemoteMiningStrategyService | 只处理带合法 remoteId 的 scout/reserver/remoteMiner/remoteHauler；决定下一任务，使用 assignTask |
| ResourceMarketService + ResourceReservationFeedback | 提供限定远程取货/母房卸货入口；沿用单一预留 owner 和对账机制；同步提供有身份的结算结果 |
| TaskMetadata / TaskGuard / ActionParser | 可选的 opaque 结算标签；远程角色动作白名单；执行有界路径；保留普通任务默认行为 |
| EmpireMetricsService / RuntimeTelemetry | 游戏内固定容量摘要、窗口累计和 CPU 完成记录，记录异常/缺测；不发布经济需求 |

新增 helper 应各自承担一项职责，不建立并行的 ResourceMarket、全局角色 registry 或第二套任务执行器。

生命周期顺序调整为：RoomCache → WarIntel/WarStrategy/Security → RoomPhase → RoomGovernor → RemoteMining → SpawnBureau → Spawn → TaskGuard → ResourceMarket → RemoteMiningStrategy → 既有角色策略 → 后续服务/EmpireMetrics。仍是所有 init、所有 analyze、一次 dispatch、所有 run、ActionParser、所有 cleanup、telemetry.finishTick；main 只调整服务装配和顺序，不加入远程业务分支。

## 4. 配置、身份和容量

保留人工入口 `Memory.empire.remoteRooms[remoteRoomName]`，一个受控条目配置一个 baseRoom 和一个 source。增加固定 schema；缺少 sourceId 时只允许有限侦察和输出候选事实，停在 awaiting_source_selection，不自动扫描开采全部 sources。

配置字段：enabled、baseRoom、sourceId、containerId/containerPos、allowContainerBuild、homeDeliveryTargetIds、reserveController、显式预算覆盖。remoteId 固定为 `baseRoom:remoteRoom`；sourceId 选定后在该经营 epoch 内锁定，改变 source/母房/路线合约即取消旧 epoch 的任务和需求，安全收尾后开新 epoch。旧 receipt/库存证据不混入新 epoch。

新功能总开关 `policy.remoteMining.enabled` 默认 false；pilot 最大同时运行条目为 1。仅已有 enabled 配置不够授权新执行。旧格式配置不静默激活新角色；报告 config_upgrade_required。现有 legacy 远程 actors 按唯一合法配置恢复 home/target 身份，能够明确归属时安全收尾；不能明确归属时报告 orphaned_actor，不猜目标、不自杀、不改变为本房角色。

每个 actor 保留 role、homeRoom、targetRoom、remoteId、epoch、quotaKey；miner/hauler 另有 sourceId。hauler 保留单调 tripSequence、tripId 和当前 leg。所有 Memory 都是 JSON 数据，保存 id/坐标，不保存 Game 对象或函数。

scope quota：scout/reserver 按 base+remote，miner/hauler 按 base+remote+source。活跃、真正孵化、成功接受证据去重；陈旧 Memory 不占配额。远程角色功能检查使用实际有效 body parts：miner 至少 WORK/CARRY/MOVE，hauler 至少 CARRY/MOVE，scout 至少 MOVE，reserver 至少 CLAIM/MOVE。真实孵化但未知 body 占位，不猜产能。

常态上限：scout 1、remoteMiner 1、remoteHauler 2、reserver 1（reserveController 默认 false）。运输不足时输出 transport_capacity_gap，不突破上限。每种 quota 至多允许一个明确进入替换窗口的旧 actor 与替补重叠；物理在途/待退休/孵化者也受该上限约束，防止反复排除 retiring 而不断补员。

## 5. 准备条件、状态和安全

状态包括 disabled、discovering、awaiting_source_selection、preparing、active、suspended、recovering。每次转换记录 tick、原因和 epoch，事件最多 20 条。

进入执行必须同时满足：母房可见且己方有活跃 spawn；coreUsable 达标、recovery=normal；Controller 不在 emergency；目标为相邻且没有他人 ownership/reservation 的中立普通房；source、容器位置和限定路径合法；情报新鲜；孵化/基建预算允许；至少有合法母房收货目标。

缺 sourceId 的 discovering 只允许最多一个 scout。缺路线、母房、接收目标或配置时不伪造默认 300-energy 房间、不追加采矿/运输角色。已有带货 hauler 允许在安全条件下返回及卸货；不为“满仓”改 role 或丢弃资源。

一次配置的母房和远程房构成唯一允许路线。其他房间不能因路径较短而自动纳入；路径需记录 source/sink 坐标、估计行程、generatedAt 和失败原因。视野不足时可以按已知安全路线侦察，不能将不可见对象当成已销毁或无危险。

远程情报至少包含 observedAt、Controller owner/reservation、source/容器存在性和 hostile facts。当前可见时每 tick 校验危险；持久 lastKnown 用于解释失去视野，TTL 初值 100 ticks，超过即暂停新出发。可见 hostile（含 Invader）即暂停；不等母房 WarIntel 告警。

danger、人工 hold、母房恢复/Controller emergency、失去接收空间或预算耗尽都进入 suspended。停止新经济出发和新经济需求，取消旧 outbound/采集任务并释放各 owner；在途带货安全返回。撤回路径必须避开当前已知危险格，无法安全撤回则 safe_wait 并报原因，不盲目走旧路径、不补攻击单位。母房本身危险时不把返回命令视为天然安全。

自动恢复需母房条件恢复、当前目标可见且连续安全 100 ticks、路线重新验证、预算与接收目标有效，再经过 recovering。人工 disabled/hold 不自动解除；配置损坏、目标被他人控制、无法达到功能 body 的情况等待人工处理。安全 streak 为初始保护参数，待实测校准。

为避免所有 actor 撤回后永远无法恢复视野，只有 stale_intel/danger 的自动恢复流程允许一个有预算的 scout 例外：母房健康且有接收空间、距离最后告警至少 200 ticks、已知入口及到入口的路径不在最后危险区内时，侦察到目标房入口即可，不深入矿点。最多每 200 ticks 一次，仍受 scout 配额与同一 body 预算约束；无安全入口则等待。侦察进入后按当前视野累计安全 streak，期间不派经济单位。人工 hold、被他人控制或母房危机下无此例外。

## 6. 孵化入口、预算和替换

RemoteMining 通过现有 global.SpawnDemands 发布 owner=remoteMining 的有限需求，精确 upsert/删除自己的条目；不覆盖 war 或其他 owner 的需求。RemoteMining analyze 必须早于 SpawnBureau analyze。

Bureau 统一使用实际人口事实，需求带 scope quota、home/target/source/epoch，生成稳定 requestId 与原始期限；SpawnService 同 tick scoped quota 防重覆盖远程角色，但不一刀切拒绝不同请求的合法跨 tick 多单位配额。原房间 energy balance、失败回收及成功持久 receipt 保持有效。

已发布而未执行的请求也计入远程预算的临时占用，不能只扣成功成本而让同 tick 多请求超排。一个需求的 body 成本上限、requestId、原始 deadline 与预算授权必须对应；dispatch/intake 再核对当前 epoch、允许状态及剩余额，不消费已暂停或已改 source 的旧授权。失败/取消/期限到期释放临时占用，成功转换为已花费成本；global reset 后从成功记录和有限持久 pending 身份恢复，queued 不伪装成 upcoming 能力。

RemoteMining 暂停、禁用或换 epoch 时，同时撤销自己仍在 EventBus 的 REQ_SPAWN/重试事件；仅按 remoteId/epoch/requestId 过滤，不清空其他 owner/topic。不能只删除 SpawnDemands 而留下已排队的旧出发请求。此授权校验限定在现有 services 链，不增加通用全局 registry。

本房核心救援、Controller emergency、必要施工和 urgent repair 优先。远程需求优先级初值 scout=35、miner/hauler=45、reserver=30；不提高到本房救援层级。body 以实际母房可用能量和已核对预算构建，零预算/无母房直接阻塞，不依赖 capacity 猜可负担。

初始策略上限：每母房每 1000 ticks 成功孵化的远程 body 成本最多 2000 energy；单 body 上限 miner/hauler=800、scout=50、reserver=650。窗口和已花费额持久化，global reset 不清零。先建立一 miner/一 hauler 的功能组合，第二 hauler 仅在实测容量不足且预算允许时追加。开启预定会消耗同一预算，不独立突破。

成本只从 spawnCreep=OK 后的实际 body/成功记录计入，不能拿 SpawnIntake 的接受请求数量当成功孵化。按接受记录身份幂等；记录消费应在 SpawnService cleanup 删除备份之前完成。若服务执行缺口导致无法证明成本，标记 spawnCostUnknown，不填 0。

替换提前量使用实际 body 孵化时间 + 到岗行程 + 初值 50 ticks 安全余量；保留 retiring 与 upcoming 区分。已走到退休窗口的 hauler 不开新 outbound，优先完成安全卸货；成功补员、取消孵化、死亡与跨 global reset 都必须回放。

## 7. 单容器采矿与基础设施

containerPos 必须在指定 source 的 range 1 内且可站立；若指定 containerId，还必须核对其 type/房间/位置。只服务这一 source，不借用母房 cityPlan 的 source-link 输出约定。

有容器即使用。无容器且 allowContainerBuild=false 时 preparing 阻塞；true 时至多创建一个该坐标的 container site，并核对返回码/下一 tick 工地存在性。remoteMiner 可用本源能量交替 HARVEST/BUILD 完成这一工地，无需新 remoteBuilder，不给本房 builder 接管跨房业务。

容器就绪后 miner 站在该格采矿，携带 energy 时向该容器 TRANSFER；满容器暂停采集。必要维护只针对该容器：hits 低于 hitsMax 的 40% 时启动，维修目标为 80%，由该 miner 消费本源能量完成。危险/hold 下不继续建设或维修。TaskGuard 仅为带合法 remoteId 的 remoteMiner 允许 BUILD/REPAIR/TRANSFER，普通 miner 白名单不随之放宽。

基建与维护的合并能量支出初值最多 6000 energy / 1000 ticks，供一次必要容器建设及维护；不建立新工地、不铺路、不销毁结构。预算窗口与 body 预算分开，母房收到的能量不能重复当成本抵扣。

BUILD/REPAIR 操作预算按可执行动作的能量上界预占，失败释放；实际支出依据下一 tick actor energy 与目标进展/hits 观察确认。boost/并发净变化导致无法精确确认时，保留 costUnknown 和保守上界；不得用单次 OK 伪造实际修建或支出。需要记录 ActionParser 的动作结果与前快照时，只增加通用、可选的结算元信息，不把远程经营决策写入 core。

这些数值为首版保护上限，不是最优产能或盈利结论。具体 pilot 启用前需结合真实路线/母房情况审阅，可在 policy 上明确覆盖。

## 8. 远程运输任务与路径

hauler 状态为 to_remote → loading → to_home → unloading → idle；另有 returning/safe_wait/retiring。tripId 在开始新取货轮次时生成且跨 global reset 保留，不因任务重派而改号。

由 source 当前能量容量和再生周期估计产率，按有效 miner WORK、容器待取量、body CARRY、往返行程及装卸时间决定所需运输能力；同一 source 最多两个 hauler。路线须考虑实际 body 的移动能力、地形和 fatigue，不能只用 room distance。实测行程替换估计值时不追溯伪造旧样本。

跨房移动用可序列化的有界路线/waypoints，尚未抵达可见房间时不分配不可见 targetId 的 WITHDRAW/TRANSFER。ActionParser 增加通用可选路径执行参数，将坐标恢复为合法位置后执行；规划与危险判断在 service 层。普通 MOVE_TO 无这些参数时行为不变。

单 leg 期限为 `ceil(2 * estimatedLegTicks) + 20`，硬上限 300 ticks；超上限路线报告 unsupported_route。重规划不延长 actor Memory 中的绝对 leg 期限。确实可移动而连续 5 ticks 无位移才算卡死；fatigue 等待不累加 remote path 的 stuckTicks，绝对期限仍运行。无路、到期或反复卡死释放任务并暂停该 leg，不能靠不断重建 task 无限续命。

只在到达容器 range 1 且能本地执行时预留并 WITHDRAW；达到计划装载量即可返程，补货等待初值最多 10 ticks，届时部分载货返程，零载货释放并等待。只在到达合法母房收货目标 range 1 后预留并 TRANSFER；支持部分卸货、满仓等待和切换另一个已允许目标。

母房接收目标为显式配置的本房 storage/terminal/合适缓冲设施，由现有 ResourceMarket 统一校验剩余需求和容量，不包含 source 输出容器。不存在可接收目标时停新轮次，已有货物保留。所有向远程出发的路径必须再次经过当前 state/safety gate。

## 9. 复用物流反馈与幂等收支

跨房行程本身不持有资源市场库存预留。近源取货和母房卸货仍使用现有 TTL=5、maxTaskTicks=50、每房最多 200 owners；不能为跨房移动全局延长它们。

ResourceMarket 扩展两个限定入口（remote pickup/home delivery），校验 remoteId/epoch/source/actor/当前 state。预留仍落在母房唯一 reservations ledger，entry id 按 remoteId 隔离；远程条目不加入普通本房 hauler 的候选扫描。source container 等供给独占与母房 demand 数量预留规则不变。

reserveForTask 可附带 opaque context `{remoteId, epoch, tripId, leg}`。TaskMetadata 保留同一 reservation 引用及动作前快照。reconcileReservations 在其原消费者中同步返回/通知 resolution（confirmed quantity、unknown 或 released）后删除对应 owner；不另发一个只存在 global 的延迟事件，不建立第二份预留。

每个 settlement 以原 reservationId 幂等处理，保留必要的固定容量已消费身份；超限拒绝新分配并报原因，不驱逐有效证据。死亡、任务替换、目标消失、ERR_FULL、取消/暂停/到期只释放该 owner，不清空别人预留。global reset 后继续从持久 owner/元信息对账。

只有 canonical remoteHauler 的 home_delivery、目标实际位于母房且下一 tick 供受双方 energy delta 一致，才计入 returnedEnergyConfirmed。pickup、miner 的源容器卸货、预定、建设和任务 OK 均不计作母房收入。并发收支无法分解则 confirmationUnknown；不能拿 task.amount 或 carried energy 当已交付。

固定累计量包括实际成功孵化成本、已确认返还 energy、已确认建设/维修成本及其未知上界、确认未知数量、预留释放、带货损失的已知/未知量、行程和 CPU 样本。CPU 与路程单独记录，不任意换算为 energy。

报告可以给出“确认收入 - 完整成本上界”的保守下界；成本缺证据或大量交付 unknown 时标记收益未确定。首版不因启动期的负收支自动改配额/强行增产，盈利与继续扩围需审阅证据。

## 10. 游戏内观测与验收边界

游戏内采样为主，外部 API/页面只读回取结果，不负责连续采集。保持原本房 50 条历史上限；新增一个 pilot 的固定容量窗口摘要，最多保留一个当前窗口和一个上次终止结果、20 条异常/状态事件，不保存全量 Memory/每 tick 任务/body/path。

EmpireMetrics 准备当前窗口的事实样本，RuntimeTelemetry.finishTick 最后填入真实 totalCpu 并完成该 tick 的累计；累计 helper 为只处理传入数值/flags 的 core 纯函数，core 不引用 RemoteMining 策略。正常无 pilot 时不产生该窗口。

窗口保存 codeVersion/remoteId/epoch、startTick/lastTick、已完整观察 tick 数、缺测/异常数、Controller 进展与最低降级计时、core gaps、母房储备与接收空间、实际返还与成本/unknown、预留峰值、运行状态时长及样本 CPU 均值/峰值/bucket 最低值。现有滚动 p95 只标为滚动样本 p95，不冒充整个窗口 p95。

每 tick 的开始/完成标记用于检测上 tick 未完成或 Game.time 跳跃；缺测或 codeVersion/epoch 变化时冻结 incomplete 的旧段，再从新起点记录，不能合并。仅普通 global reset、版本和 Memory 均保留且 tick 连续时继续原段；丢失 Memory 则从新段开始。telemetry.enabled=false 时明确暂停该窗口，不把缺测填成 0。

达到同版本 10000 个完整观察 ticks 后冻结 review_required，acceptancePassed 保持 false。最低覆盖为：完整返程与真实卸货、自然角色替换、容器准备/维护或明确已有容器路径、满仓/预算/危险暂停的本地真实流程回放，以及线上实际发生场景。未在线发生的危险/恢复不能伪称线上已验证，不在生产主动杀单位或制造入侵。

当前单房待验收仍保留；新远程窗口不自动补签前一阶段验收，也不触发 upgradeWork active 的独立 50-sample/500-tick 门槛。

## 11. 分批交付骨架与 RED 场景

本节为设计内的依赖顺序，具体逐文件实施计划在本 spec 审阅通过后编写。

1. 配置、state、统一人口/需求与预算：真实 RemoteMining → Bureau → EventBus → SpawnService 回放，无视野 scout/reserver 重复、live/spawning/accepted/ghost 去重、有效 body、零能量、双 spawn、原期限重放、暂停只撤自己的需求、成功成本/reset 不重复。
2. 必要容器和采矿输出：一个指定源/工地；site 创建失败与下一 tick 确认；合法站位；HARVEST/BUILD/TRANSFER/REPAIR 白名单；源容器满/消失、预算、danger；不接管母房 builder 或扫第二 source。
3. 跨房运输与 settlement：移动超过 50 ticks、fatigue、无路、绝对期限、视野缺失但合法坐标移动；双 hauler 同源竞争、部分装卸、满仓、死亡、任务取消/global reset；下一 tick 实际量、unknown、不把源侧 transfer 算母房收入。
4. 安全/恢复与游戏内记录：陌生 ownership/reservation、stale intel、母房恢复、Controller emergency、停派/安全返程/等待、安全 streak、人工 hold、成本/窗口缺测/版本隔离、10000 完成仍需 review。

每批维护者自检与必要 RED/GREEN 后运行 `npm test`、无 DEST 的 `npm run build`、两类 git diff --check。必要扩展 smoke 或增加一个真实服务链 remote 测试入口；不能只测试新纯函数而跳过其消费者。

本地完成后，先提供最终 diff、校验结果及具体矿点/预算建议，再等待明确提交/部署/启用指令。尚未选定线上邻房/source 不阻塞通用本地实现，但不能凭文档自动启用未知目标。

## 12. 回退与维护者检查

总开关/单矿 disabled 后停止新 demand/outbound/工地，允许已在途 actor 安全返程和已有 owner 最后结算；不立即自杀、不改 role、不破坏容器、不 unclaim。代码回退不能撤销已实际孵化、修建或配送，保留既有 epoch 成本和未知量。

任务 meta 和可选路径参数为兼容附加字段。拆回某批前必须清理该批拥有的需求/任务；回退策略代码但留下未知 role 的 actor 不能称为已完成回退。四份未提交诊断报告及其他用户改动不参与回退。

最终自检应确认：没有双重任务消费者、旧 global 需求滞后、无界寿命/receipt/窗口、第二资源市场、隐式在线启用、因满仓丢货、把 unknown 当交付或收益，以及为了绕过默认 50 ticks 而放宽全部本房任务。数值调整必须有路程、body 和真实收支证据。
