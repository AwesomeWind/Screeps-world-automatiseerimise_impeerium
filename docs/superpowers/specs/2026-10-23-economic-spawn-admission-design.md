# 经济试点孵化：仲裁后接纳设计与回归计划

2026-10-23。用户已认可本具体设计及六批计划，授权主代理逐批本地实现和一次只读独立review；未授权线上试跑。用户要求不延长原期限；侦察、采运、Goal/Plan和市场保持关闭，不重开试点、不提交或部署。

## 目标和依据

消除“尚未获得Spawn席位的候选需求提前绑定唯一role请求，母房补员占位后被5 tick期限误伤”的生命周期错位，保留母房补员优先、原期限、额度及unknown不重放。

依据见[诊断报告](../evidence/2026-10-23-miner-spawn-admission-diagnosis.md)：单Spawn同级hauler竞争可在真实服务链稳定复现；无竞争或两个Spawn对照不失败。修复涉及RemoteMining/Bureau/Spawn/经济守卫的局部交接协议；不新建第二套孵化调度器，不重排主生命周期，不修改通用EventBus优先级。

## 方案比较

1. 在Bureau中先预测谁能执行，再决定绑定：可少改接收接口，但必须复制Spawn实际的idleSpawns、energyBalance、旧事件、receipt容量及去重判断；后续dispatch仍可能推翻预测，保留时序漏洞。不推荐。
2. **在Spawn真实接纳点绑定：推荐。** RemoteMining只发布当tick候选；Bureau仍按原优先级发布；EventBus实际分配可用席位和能量后，接收者才提交一次正式请求。改动需要明确候选与已绑定请求的区别，但资源只有一个仲裁者。

提高remote优先级、屏蔽母房补员、延长/刷新deadline或用新id替换原超时请求，都不作为本次方案。

## 推荐协议

### 1. 未绑定候选

- 仅适用于托管economic trial的尚未绑定role。纯侦察守卫、非托管远程与普通母房请求保持既有路径。
- RemoteMining通过当前完整会话、当tickfresh scope及role门槛后，发布economicTrialCandidate，包含完整五字段identity、role、quotaKey、offeredAtTick和规范目标/body限制。
- candidate是global/EventBus中的当tick提案，不写入session.slot.requestId/deadline、不增加operation.requestSequence、不占grant、不计费用、不消耗role原生调用次数。
- Bureau只携带白名单候选字段，保持母房意图优先、原priority与同级顺序，不为候选生成正式id/grant或提前承诺执行。
- 候选事件只在offeredAtTick有效，expireAt等于该tick；未获席位的事件下tick自然失效。每个完整identity/role/quota当tick只发一次，避免旧代码同id事件逐tick累积。
- 发布端可在明显没有物理空闲Spawn时省略候选；这只是减少无用事件的优化，不是席位已分配的证明，正式接纳仍必须使用接收者的实际容量与能量状态。
- 候选等待计入原会话1000ticks/90分钟和native较早stopAtMs；不重置会话、scout安全计数或任何绝对截止。可只读显示spawn_wait/spawn_busy等原因，显示字段不能参与放行。

### 2. 真实接纳后才开始5 tick期限

SpawnService.handleSpawnRequest保持唯一容量/能量仲裁职责：

1. 对候选做不产生副作用的校验：schema、当前tick、完整会话/epoch/版本/配置/role/quota、fresh scope、原守卫许可、原body和receipt容量限制；未知或伪造候选拒绝，不退回非托管流程。
2. 按现有EventBus排序，检查去重、实际idleSpawns及energyBalance。没有席位或能量时不正式绑定，母房请求按原机制处理。
3. 实际取得该Spawn与当tick能量预留后，由经济守卫的专用接纳适配器生成一次canonical requestId、deadline=min(admissionTick+5, session.expiresAtTick-1)，写本role绑定和原预算grant，再完成原intake/pendingTask。
4. 接纳成功的充分条件必须包括：Model仍无outcome、绑定身份/id/期限匹配、grant合法、body/目标合法及pendingTask确实属于所选Spawn。中途拒绝或异常不能继续执行。
5. Spawn.run沿用原动作前重新验证、call_started→原生→账本applying/applied→结果回执；新协议slot必须已经admitted，binding或标记不完整即使在同tick也不得调用原生。接纳不等于原生调用，OK也不能代替实际费用回执。

专用接纳接口不能成为通用免grant入口。只允许明确的当前economic候选在获得真实资源后创建grant；普通remote事件仍要求原有grant。current slot已经有requestId时只能走原已绑定请求路径，绝不能再次作为新候选接纳。

### 3. 接纳中断、重置与兼容

- 对新接纳在slot持久化明确admissionStage=binding/admitted及admissionTick、admissionSpawnName，用于区分绑定中断和完整intake。写binding时同时固定id/deadline；不得在异常后清空slot重来。
- binding阶段中断、grant写入结果不明或不完整证据：拒绝继续经营并按原故障路径关停，保留原id、期限、grant/unknown证据；不重新生成id、清claim或假设退款。
- 已知预算拒绝不记实际费用；正式id一旦建立，接纳失败就明确拒绝/撤权，不退回候选生成新id。预算容量与本轮1650上限均须使用提交时的原账本再检查，不能依赖analyze时的预算快照。
- 资源预留只在有明确“原生未调用”的证明时按既有not_called规则撤销。call_started、ledger applying或未知结果保留claim并停止；不能以候选重试规避不明结果。
- 完整admitted但尚未原生调用的重置，只有原有not_started/not_called完整证明满足时，才可按原规则使用同id、原deadline继续；不能恢复为未绑定候选。
- admissionTick、admissionSpawnName记录首次接纳且不能被已绑定重试改写。若原重试规则允许换用同母房另一可用Spawn，实际尝试仍用原context的spawnName记录；首次接纳位置不成为暗中禁止原重试的永久Spawn锁。
- EventBus会捕获订阅者异常并继续run，不能把抛异常当作整tick已中止。接纳适配器须在异常传播前请求撤权；即使异常发生在pendingTask入列之后、admitted标记完成之前，Spawn.run也必须独立拒绝binding任务。记录失败不能成为原生调用许可。
- 已绑定请求的原一次已知失败重试（总原生调用≤2）、deadline、role额度与spawn receipt语义不变；deadline到达后仍按原P0规则停止。
- 新字段为可选的受校验扩展：旧slot没有admissionStage时沿用旧已绑定协议，不伪造旧历史；未知stage或不完整新标记fail-closed。
- 上轮线上sequence3的terminal会话绝不迁移、解绑或重启；其旧准备、归档、费用和managed锁原样保留。未来线上复试需要独立授权及新鲜预检。

## 预计代码边界

- RemoteMiningService：将托管未绑定role的需求改为当tick候选；已有绑定路径和非托管/recon路径保留。
- SpawnBureauService：白名单传递候选；不复制资源分配器、不改母房排序；普通缺grant需求仍拒绝。
- SpawnService：候选校验和实际资源分配后的专用接纳；成功后仍进入原pendingTask/run/receipt链，异常先撤权。
- RemoteEconomicTrialService/Model：候选检查、一次接纳绑定、持久标记及中断处理；复用原ledger和费用归约，不修改确认算法。
- src/tests/economic-spawn-admission.cjs：新增真实链竞争与边界回归，并接入package测试入口；复用原fixture，显式单Spawn及补员TTL条件。
- 邻近AGENTS说明按最终实现更新；native外部请求schema、profile、控制开关默认值、原预算和主服务顺序均不变。

## 回归计划：先RED再GREEN

当前仅完成原实现诊断；以下是后续实现时必须先看到失败、再修复的验收要求。

| 场景 | 必须断言 |
| --- | --- |
| 单Spawn同tick母房hauler45与miner45竞争 | 母房仍先获席位；miner尚无正式id/deadline/grant/calls，不因候选等待5ticks误关停 |
| 单Spawn母房占用30ticks后自然释放 | 等待计入原全轮时间，释放后仅一次接纳、绑定当tick起+5、不重新开始会话或安全计数 |
| 单Spawn无竞争 | 原生调用与真实回执一次，实际body费用核算，不以maxEnergy当费用 |
| 双Spawn、能量充足/仅够一份body | 仅按真实资源接纳，既不重复占位也不超支；不得因Game.spawning尚未变化把同一Spawn分给两任务 |
| 滚动预算/本轮1650/receipt容量不足、已有pending grant | 以原账本及原最大额度拒绝；既不新增实际费用，也不绕过未决claim或靠新id续预算 |
| 母房miner120/hauler90及同级45 | 核心恢复与同级先后不变，不通过提高remote优先级使测试变绿 |
| 相同候选重复、下tick旧事件、不同trial/epoch/version/quota | 当tick去重，陈旧/不匹配/伪造候选拒绝；不产生第二id/grant，不走非托管fallback |
| 已绑定后ERR_BUSY或其他已知失败 | 只按原规则同id最多两次调用，首次admissionTick/admissionSpawnName及原deadline完全不变；合法换用另一Spawn不新增额度，到期仍停止，不能退回候选 |
| 候选/已绑定等待跨reset | 未绑定无经营副作用；binding中断关停；完整not_started证明沿用原规则，call_started或applying绝不重放 |
| 绑定、grant、intake、pendingTask各边界写入异常 | 原生不得越过失败执行；关闭不依赖记录成功；未知claim不被清除或假退款 |
| pendingTask已入列但admitted提交失败，EventBus捕获异常后继续run | 同tick也不得调用引擎，不能仅依赖下一tick的中断恢复；所有异常标记和原deadline保留 |
| analyze→dispatch→run间撤权/危险/失视野/核心危机 | 每次提交和原生前重新核对；不能依赖早期canBind的空闲/安全快照 |
| 全轮/native较早截止或1000tick先到 | 候选等待不延长任一窗口；停止优先于接纳，已绑定期限也不续期 |
| miner安全99/100、hauler容器/矿工条件 | 用真实scout出生、移动、视野累计；99时不得接纳miner，hauler仍须原矿工/容器门槛 |
| 正数首批真实入库及费用/unknown | 保留原严格次tick归因、首批即停；新旧费用和unknown隔离，不把母房补员成本计入remote trial |
| 默认关闭/旧记录兼容/普通母房与纯recon | 无候选和新namespace副作用，旧已绑定记录不被迁移；Goal/Plan与市场关闭，shadow/enforce约束不变 |

测试必须真实经过RemoteMining→Bureau→EventBus→Spawn，不在hook中直接调用新接纳方法制造成功，不手填safeStreak。fixture默认多Spawn和满核心不是本缺陷的充分覆盖。保留已有单Spawn首批、重试期限、not_started reset及半完成账本回归；有容器首批闭环与缺容器等待/施工门槛分开描述，不冒称完整新容器线上采运。

实现后再跑新增定向、完整npm test、smoke、Governor及仅构建，保留各阶段RED/GREEN和退出码。当前5项原有回归通过及3组诊断实验不是该新方案已修复或已发布的证据。

## 不在本轮做的事

不改5 tick、spawn重试上限、100安全ticks、角色1/1/1、本轮1650/6000及滚动2000/6000预算、原leg期限，不改共享网络，不启用功能、release旧线上锁或安排新试点。本地实施已授权，进度见[六批计划](../plans/2026-10-23-economic-spawn-admission.md)与独立台账；生产发布与启用单独授权。
