# 已结束 native 经济试点的显式换轮与期限隔离：设计草案

日期：2026-10-23。用户已认可具体设计、六批计划及主代理实现＋一次只读review，本地实现/验证已完成。没有联网、提交、推送、部署或启动。此设计不生成生产请求和生效时间窗，不授权 release、归档交接或采运。

## 1. 目标与已验证边界

下一轮仍以 W49N41→W48N41 单 source `5bbcaa6d9099fc012e63155b` 的真实首批入库为目标。新增能力仅负责：在完整旧会话已终止、控制关闭、实体退场且无未决费用之后，接受人工明确指定的一轮后继请求；保存旧证据，再通过原经济守卫合法 release/start。每轮仍只能启动一次，不循环、不自动补开。

开发基线为 codex/single-remote-mining、HEAD919ec9f6be5866a6bae5e61d81ba11b72480b7f8，实际逻辑 ff60562。当前产品修复已部署，运行版本1792733742635；本设计轮没有重新联网验证。最后完整线上窗口为 tick83818396，不作为未来启动的新鲜预检。

已冻结的证据与当前源码一致：

- `NativeEconomicTrialOpsModel` 在 current.stage=terminal 时返回原state及空effects，不读取新请求；修改请求id不能重新接纳。
- `validateNativeOpsRequest` 的 v1 profile 只承认原经济序列1→release2/start3和编译旧准备。直接换成release4/start5返回request_invalid。
- `collectEconomicTrialFacts` 按旧 economic.current.identity 筛选 native 窗口，即使该 current 已 managed=false。真实服务链离线复现中release4成功，随后start5被native_ops_control_changed拒绝，旧native记录未改变。
- `NativeEconomicTrialOpsFacts` 的 knownOld、Model的archive比对、Service的applyEffect和requestOwnedStop也依赖同一v1旧准备。仅删除terminal早退或仅改profile常量不足以形成安全完整方案。
- 原经济Model已具备合法release和独立新会话接纳：release只改变旧managed和lastSequence；新start把旧current放入previous，新费用、视野、安全计数从零建立。复用这条链，不另造经营状态机。

证据位置：`.superpowers/sdd/2026-10-23-economic-spawn-admission-release/retest-entry-assessment.json`、`successor-facts-assessment.json`及其只读源码。它们证明本地协议限制，不是新的线上试点失败。

## 2. 路线比较与推荐

| 路线 | 得失 | 判断 |
| --- | --- | --- |
| 显式后继协议，按父身份、高水位和已关闭事实接纳 | 需覆盖schema兼容和中断；后续失败重试可沿用同一合同，不必每轮修改产品常量 | 推荐 |
| 为下一轮另加一份固定旧准备profile | 首轮较少改动，但每次终止后又需发布另一份快照，重复制造一次性入口限制 | 不推荐 |
| 外部直接清native状态或绕开入口提交start | 会破坏原锁/高水位，并绕开先归档后交接和unknown约束 | 拒绝 |

推荐方案是有界、人工逐轮请求的后继协议，不是自动重跑。固定试点范围、实际费用链和守卫保持原样；可复用的是交接合同，不是生产授权。

## 3. 请求与父会话证明

原policy位置和默认值不变：`remoteMining.nativeTrialOps={enabled:false,request:null}`。新请求使用schemaVersion2、固定profileId `w49n41-w48n41-first-delivery-v2`。旧v1请求与旧已接受记录沿原冻结合同验证；不修改 `NativeEconomicTrialOpsKnownPreparation` 以伪造历史。

v2请求严格限定字段：schemaVersion、id、profileId、codeVersion、parent、trialId、releaseSequence、startSequence、issuedAtMs、stopAtMs、notAfterMs、acceptNotBeforeTick、acceptNotAfterTick，以及四个显式true：allowParentArchive、allowEconomicRelease、allowStart、allowHold。

parent包含nativeId、完整economic identity、closureVerifiedAtTick、settlement。settlement固定包含spawnEnergy、infrastructureEnergy、returnedEnergy、unknownEvents、unknownUpperBound。金额必须与旧持久证据逐项一致；unknownEvents和各类原始unknown必须均为0，不能用聚合抵消、默认缺失为0或清账代替证明。

请求id、trialId及本合同可接纳的parent nativeId/parent trialId均限1～32个ASCII标识字符。完整身份仍包含trialId/sequence/remoteId/epoch/codeVersion；当前父会话标识符合范围。v1历史较长id仍可读取和关停，但不自动改名来满足v2；若不支持就明确拒绝新接纳。

父会话必须同时满足：

1. 原native记录合法、terminal、controlClosureConfirmed=true，admittedIdentity精确等于经济current身份；不存在planned/unknown经营intent或unknownEffect。refused且尚未接纳的尝试不伪装成已完成经济父轮；这种分支必须保留原始中断位置，不能借本合同自动清理或重复已确认的release。若未来出现，需要先提出针对真实中断状态的恢复方案并单独授权，不能声称本合同覆盖所有失败恢复。
2. 经济current合法、terminal、managed=true；closeAppliedAtTick及更晚closureVerifiedAtTick存在，费用与上述parent证明一致。父经济lastSequence、native.lastAcceptedStartSequence均等于parent.identity.sequence；请求releaseSequence=父序列+1、startSequence=父序列+2。
3. 所有远程actor、accepted、spawning、grants、基建pending、outbox applying/prepared、未决slot、failedHandoff及unknown均不存在。保留预算receipt和已确认费用，不删除账本。
4. nativeTrialOps原执行权限关闭，remote/room关闭、hold=true、operation两项出发权限false；旧recon合法release锁存与档案匹配。旧economic start enabled=true协议锁存可以保留，不将其误称为仍在运行。
5. 母房recovery=normal、无敌情/核心缺口、Controller和真实terminal接收空间满足原门槛；预算及全部保护开关满足原合同，连续两个tick事实一致且新鲜。spawn_energy只能支持关闭发布，不能放行本次接纳。

新trialId/native id不能在current、previous、保留历史或拒绝记录中复用。新codeVersion绑定当前部署；父codeVersion使用父历史值，不能因部署而重写它。epoch或配置指纹变化需要另行设计，不在本合同中借换轮迁移。

时间要求沿用30秒接纳新鲜度、最多10tick接纳区间、总窗口≤90分钟、stop与notAfter至少相隔120秒。新时间窗必须另获当轮明确授权；父截止不修改，已生成的新release/start固定期限也不重新计算。

离线仅用合成id和无效测试时间测量上述请求结构：32字符id、六位序列等样例的JSON转义后表达式长度986。此为协议体积可行性证据，不是已实现的builder验证；实现时必须逐字段边界验证及对最终实际表达式执行≤1024检查，超长拒绝，不能拆片或换短id重放未知写入。

## 4. 旧状态兼容与有界档案

没有显式v2请求时，不升级、不搬迁、不新增namespace，旧current/previous、请求和高水位保持原值；v1活动会话仍由原协议运行和关停。默认关闭发布必须通过真实旧记录兼容回归。

v2接纳时，一次持久化形成schemaVersion2状态：新current为preflight，previous为原native current，history保留交接前完整原native状态、经济current/previous、economic与native原设置及原窗口。首份legacy快照包含原v1档案，不更改旧50费用或旧期限。

后续v2轮次档案采用平面记录及父档案引用，不复制整个history进入history，避免递归增长。每条记录保留对应原native current/previous、经济current/previous、当时请求和原窗口；所有跨档案引用必须可验证，不能只留摘要并删除原对象。摘要只用于展示，身份/原始值比较用于交接。

硬上限为4份父档案，整个native状态JSON序列化长度上限65536字符。接纳前先核算拟写入完整状态，任何容量不足都拒绝新接纳，不静默淘汰旧档案。只限制新增轮次，不取消已有会话的撤权能力；旧raw不因超限被清除。本次冻结样本native6527字节、economic4889字节，仅为当前体积参考，不保证任何未来档案都能容纳。

新状态与档案先完整落Memory，下一tick核对档案和当前事实，再进行任何经济请求替换。接纳本身不触发游戏动作；持久化失败或档案无法核对时保持原执行关闭。更改外部request或重置global不能跳过这个阶段。

## 5. 交接过程与中断处理

| 阶段 | 允许行为与确认 |
| --- | --- |
| 接纳/preflight | 仅校验v2请求、完整父证明和第一tick事实；保存新状态、不可变档案及高水位，不开启remote |
| archive_confirming | 后续tick再次核对父记录/金额/请求/配置及关闭事实；全部一致才形成一次release意图 |
| release_writing/confirming | 原经济Model精确tick处理release；只允许父managed变false、lastSequence变父+1，其余旧字段保持一致 |
| start_prepared | 持久化完整新start请求，economicTrial.enabled=false，remote/room仍关闭；固定原激活tick与到期值 |
| start_activating/confirming | 精确tick复核后一次激活；原经济守卫同tick接纳完整新身份，才可经原Spawn链发布scout候选 |
| observing/stopping/terminal | 继续使用原真实费用、首批次tick入库及先撤权后记录流程；下一tick核对关闭，不自动生成后继请求 |

每个经营effect仍先保存planned intent及完整expectedBefore，再核对当前原始事实后执行一次。已applied不执行第二次；planned跨重置而无法证明结果、unknown、半写入均不重放、不补发activate、不重新安排激活tick。允许独立、幂等、精确身份的安全撤权，不把经营动作重放称为恢复。

父序列是3的当前样例只允许release4/start5；若实际序列改变，原卡直接失效。新请求遭拒绝时保留拒绝记录并关闭其入口，不抢占或关停另一个无所属关系的活跃会话。当前协议只接纳仍managed=true的已结束父轮；外部提前release导致序列父+1时拒绝，不能自动“跳过已完成release”猜测交接。

旧会话terminal与tailStatus=unverified分开保留。换轮要求实体/未决账本确实退场，但不将这种事实反写成旧tail自动验收通过。新轮也不能冒用旧scout、视野、100计数、容器期初库存或费用证明本轮产出。

## 6. native期限与控制所属隔离

把所属选择整理为只读、可单独回归的合同：

- 当前经济会话仍managed时，包括recon/preparing/hauling/stopping/terminal，按其完整身份查找所属native记录和请求。新start不能通过覆盖policy请求，使旧活跃会话失去原更早截止或撤权保护；新会话仍须先合法release旧锁。
- 旧current已managed=false、正在验证新start时，使用拟接纳start的完整身份查找native归属；不得再用旧current身份筛选旧disabled/expired请求。非start请求、非法字段或不完整身份均不产生新许可，由原requestError和锁门槛拒绝。
- 新native记录已持久化但经济current仍为已release旧轮时，只有新记录与完整start身份、startRequest、profile、epoch及当前控制请求一致，才能提供本轮native窗口约束。
- 对所属会话，native记录与policy两个包络不一致、缺字段、关闭或过期仍fail-closed。不能仅因某一个副本消失就退化为无native限制。旧archive/history本身不是活动许可，也不能撤权到不同身份的新轮。
- 生命周期analyze、Spawn intake/run、策略动作及ActionParser检查点均重新判断所属和更早截止。同tick后半段越过stopAtMs时，不再调用原生动作。关停不受notAfter过期阻止，有限tail沿原守卫，不能恢复经营。

不使用全局“只要managed=false就忽略native”的开关，不删除旧native请求来绕过误拦。`requestOwnedStop`同时支持合法v1/v2原包络，必须绑定完整经济身份及固定source/receiver；历史记录只能证明其自己的撤权权限，不能按相同remoteId波及新轮。

## 7. 代码职责与保持范围

沿用现有Profile/Facts/Model/Service/Evidence分层，不增加另一个Spawn或经济执行器。profile拆分冻结legacy准备与v2固定试点合同，校验函数按明确schema分派；schema未知保持raw并拒绝经营，不拿v2校验器宽松解释v1。

Facts分别提供父交接事实和本轮执行事实，不把不再匹配的knownOld一概视为“忽略”。Model负责高水位、阶段和intent；Service负责持久化前后比较、调用原合法release/start及独立关闭；Evidence只投影完整current/previous/父历史的身份、费用、原期限与所属，摘要失败不能阻断关停。原P0顺序和默认开关不变。

不修改母房资源调度、Spawn仲裁接纳、5tick正式请求期限、最多两次已知失败调用、原leg≤300及一次重规划；不重建物流归因/账本/unknown算法。W48N41必要容器自建维护、不reserve/修路/第二矿，真实接收terminal仍为6ad0b55bceeb3db0d3b4dda0。

每轮最多1新scout、1miner、1hauler，独立100连续安全ticks；body50/800/800、本轮1650孵化/6000基建与原滚动2000/6000预算取交集。首批指定terminal正数次tick确认、unknown、危险、失视野、核心异常或1000ticks/90分钟原上限先到即停。Goal/Plan和市场持续关闭，Governor shadow=true、scheduler.enforce=false。

## 8. 回归与验收计划

本设计不宣称以下能力已实现。获认可后再编写分批计划，逐批RED→GREEN；既有674项不等于换轮回归。

1. **原始缺陷RED**：保留合法terminal v1父状态，提交合成v2请求应有唯一接纳；真实原服务链先完成父轮、由测试引擎提供明确实体退场输入、合法release后新start不再受父native控制误拦。原代码应因不支持v2/旧期限所属而失败；不得删父状态/unknown来造绿。
2. **兼容与授权**：v1原冻结profile、原归档/请求/金额逐字段不变；默认关闭不迁移；缺显式archive/release/start/hold任一项拒绝；未知schema、错父id/身份/闭合tick/费用/epoch/配置/版本/序列、复用历史id均拒绝。生产编译profile单独验证，不只测注入的fixture profile。
3. **父轮未结拒绝**：非terminal、managed=false、未关停、accepted/spawning、旧actor、grant、slot binding/call_started、applying、outbox、基建pending、unknown、缺失ledger分别测试；旧unknown不能清零后接纳，tail unverified保留原标签。
4. **归档与重置**：接纳前后、档案保存前后、release intent/写入/回读、start准备/激活/确认、首批/关停等边界注入抛错或JSON往返重置。记录先保留、未知不重放；global重建后原完整身份与高水位不变。平面历史完整且无递归复制，满4份或超65536字符拒绝新增，仍可关停原会话。
5. **所属隔离反证**：旧disabled/过期 native不拦已release后的新合法start；旧仍managed则新请求不能绕过锁；新native关闭/缺包络/错包络/过期均拦自己的入场及动作；旧native迟到关停不能影响新轮。覆盖v1/v2、同remote不同seq/epoch/version以及同tick动作前截止。
6. **原期限与未知**：30秒/10tick接纳、准确激活tick、原5tick孵化deadline、原更早stop、1000tick/90分钟不延长；已确认release不重复、missed不改tick。未知effect/回执/记账保留claim并关闭，不以新id避开。
7. **真实两轮服务链**：先运行原v1链得到父轮终态，明确区分模拟引擎实体退休输入与生产证据；仅一次v2提交完成归档→合法release→新scout实际出生/移动/跨房→独立100安全ticks→miner/container→hauler→指定terminal严格次tick入库→关闭。加入母房同级补员占席，证明候选等待不消耗正式5tick期限。禁止手填safeStreak或通过适配器直接调用替代真实链。
8. **费用与收益**：父50及更早previous50留在原档案；新轮费用从0按canonical receipt计入，滚动预算保留真实历史。新unknown不继承也不消失，旧原生窗口不改。首批只认本轮绑定trip和真实store变化，期初库存、新产出、净收益、closure、tail和缺场景分别报告。
9. **完整验证**：焦点回归后跑完整测试、smoke、Governor及仅构建；维护者检查与另行认可的只读review。没有授权前不提交、推送、部署。默认关闭发布与旧记录只读核对通过后，仍需单独批准新一轮明确日期执行卡。

当前母房补能原因尚无足够证据，不能在此功能中放宽normal门槛。后续必须补新鲜只读事实；连接失败不重开试点、不切节点。设计通过也不等于母房、真实路线、经营产出或长期验收通过。

## 9. 审阅停点

请先审阅是否认可“固定试点范围下，逐轮人工明确请求、完整父证明、平面有界档案、合法release/start及所属期限隔离”的方向。认可后只进入分批实施计划，不直接实现或启用；具体生产时间与请求仍留待未来独立授权。
