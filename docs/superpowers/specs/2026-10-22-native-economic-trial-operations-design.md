# 游戏内一次性经济试点入口：设计草案

审阅记录：用户于2026-10-23认可具体设计及六批计划，选择主代理实现和一次独立只读review。已完成本地实现与验证，未发布或启用；参见[交付报告](../evidence/2026-10-23-native-economic-trial-operations-local-validation.md)。下文“当前未实现”保留为最初设计时的历史边界。

日期：2026-10-22。范围为绕开持续外部WebSocket和多分片协调的**本地设计**，不等于发布、启用、修改旧期限或重做生产准备的许可。当前未实现。旧外部新时间窗扩展先不推进。

## 1. 目标与现有证据

用户希望继续完成W49N41→W48N41首个经济闭环，愿意换路径绕开反复失败的外部协调。保留首批真实指定terminal次tick入库、费用/unknown/净收益、可靠停止恢复的目标，不降低为连接或部署验收。

现状以工作树codex/single-remote-mining、HEAD32313c084b2ff6f0d4ed9735632f0db901125f0b及冻结生产证据为准。线上最后一次真实读取为19:37，两组通过30秒门槛；本设计轮没有联网，不能把那时状态当成现在的新鲜预检。

代码依据：

- `src/main.js`固定生命周期，RemoteReconTrial→RemoteEconomicTrial→RemoteMining→SpawnBureau/Spawn，随后策略和ActionParser。
- `RemoteEconomicTrialService.analyze/advance`已经每tick读取事实、持久化Model状态并应用关闭效果，不依赖外部轮询；Model在首个真实本轮交付时同步停止。
- `RemoteEconomicTrialFacts`已经在游戏内构造configFingerprint。现外部adapter重复构造指纹并受serialized1024限制而分片，不是游戏运行时本身的限制。
- `RemoteMiningService.init`每tick重建global.RemoteMining，RemoteMining.analyze发生在经济守卫之后。因此新入口不可在analyze早期把global空对象当成“无操作”，也不能用上tickscope冒充当tick事实。
- 现有Service没有完整“旧锁release→新start”的一次性运维入口，不能将直接调用内部advance当成已受保护的完整启动API。
- 新版本发布会改变SERVICE_VERSION；旧未激活准备绑定1792636618804，而Model要求request.codeVersion等于当tick执行版本。新版本不能原样接纳旧准备。

本轮在deny-network preload下重跑8项既有定向回归，覆盖默认关闭/顺序、期限/重放、合法release、未知claim、真实次tick交付即停、reset/tail、账本applying不重放、记录失败仍关闭，8/8通过。日志：`.superpowers/sdd/2026-10-22-native-economic-ops-design/existing-guard-reuse-tests.log`。这只支持复用既有守卫；新入口及生产断网运行尚未验证。

## 2. 路径选择

1. 延续外部分片＋三通道协调：本次短读回通过，但每个控制阶段仍需外部POST/WS和新鲜度窗口；网络对长操作的影响仍在。
2. **推荐：游戏内一次性入口。** 外部仅提交一个短的、完整的运维请求；游戏每tick自主完成严格预检、合规旧锁交接、单次start及停止观察，Memory保存可回读结果。网络断开不会让系统依赖外部追加分片或人工停止。
3. 临时上传一次性脚本或直接删Memory锁：不能稳定保证重置、默认关闭、历史保留和权限边界，不采用。

选择2不是绕过鉴权或安全检查，也不能保证游戏服务器停tick时仍执行墙钟回调。若服务器停止tick，恢复tick后先核对墙钟与连续性、撤权，不能宣称停服期间已完成清理。

## 3. 请求、默认关闭和身份

在既有人工policy入口增加`remoteMining.nativeTrialOps={enabled:false,request:null}`。禁用且无历史状态时不创建运维namespace、不修改任何战略配置。默认关闭发布不会接纳或迁移旧准备。

实际生产启用另行授权后，外部可以用**一次短控制表达式**提交整个nativeTrialOps对象；不要求另外上传完整指纹或连续维持WS。全表达式仍必须`JSON.stringify(expression).length<=1024`，命令不包含通用eval、任意Memory路径或任意目标配置。单次发送结果不明只能按原request.id回读，外部不重发、不换id。

request为固定schemaVersion1，包含：

- 独立运维id（最长64）、固定profileId=`w49n41-w48n41-first-delivery-v1`、部署后的明确codeVersion。
- 旧economic identity、expectedLastSequence和已审阅旧准备profile的精确绑定；旧准备完整对象与旧版本保存在profile和运维档案，不换标签。
- 独立新economic trialId及预期release/start序列；使用新trialId必须明确属于获批的新一轮，不用于规避旧托管锁、未知结果或额度。
- 绝对issuedAtMs、stopAtMs、notAfterMs和允许的生效tick范围；生产执行卡给出明确日期时间，无自动顺延。总长<=90分钟，stop与总截止间至少120秒，所有预检/准备计入总窗口。
- 明确的`allowSupersedeKnownClosedPreparation`、`allowEconomicRelease`、`allowStart`和`allowHold`，缺任何一项不经营。supersede不等于普通重试，见下一节。

profile固定W49N41/W48N41、source5bbcaa6d9099fc012e63155b、containerPos(19,6)、必要容器自建/维护、reserveController=false；terminal采用未来生产预检核对的真实id6ad0b55bceeb3db0d3b4dda0，free>=20000。profile只承认审阅过的配置，不能把任意现状直接算成“已批准指纹”。

运维current/previous最多各一轮，Memory持久保存：完整请求、stage、旧准备归档、原序列/身份、动作intent和预期结果、接纳身份/固定期限、关闭结果；事件最多32项。未知schema保留并拒绝执行，已使用id/同序列不再接纳。global仅提供只读状态接口，不保存跨tick权限。

## 4. 旧准备与版本交接：必须独立批准

旧stageRelease已在原tick83800898确认；旧外部许可禁止重做准备。**新版本重新生成release请求，在语义上属于新的准备，不能冒称仍在沿用那份许可。** 本路线未来需要明确批准“归档并取代已知未激活旧准备”，也需要新的生产时间窗。

默认只允许这一种可识别旧状态：旧current完整合法、terminal且managed=true、lastSequence1；现请求为已确认的release-econ-w48-20261022-01/seq2/epoch2/version1792636618804、configFingerprint空、无四个激活/到期字段；原外部日志证明只发生一次stageRelease、无unknown、无start。运行时对照编译profile，不从陈旧外部样本获取当前动作许可。

接纳前必须直接核对当tick实体/accepted/spawning、grants/pending/outbox/slot及unknown均已结清；旧侦察仍为已合法release状态。`reconTrial.enabled=true`连同release身份/序列是现协议要求的锁存值，不清零。旧费用50/unknown0是该已知profile的旧证据，不进入新会话费用。

先在Memory归档原request、旧完整身份、状态/费用来源、原许可截止与旧外部证据标识，等待后续tick证明档案存在且原准备未变，才可取代旧准备；外部原锁/日志全部保留，不删除economic current或unknown。正式旧会话release仍走原Model合法请求，使旧current除managed外保持不变。任何非空前缀、新时间字段、错版本/序列、额外写入迹象或未决费用都停止，不自动“清干净再启动”。

如果未来预检已不属于这个精确旧状态，本profile拒绝；本版不通用迁移、不自动猜测其他历史准备。

## 5. 生命周期与阶段

建议增加P0 `NativeEconomicTrialOpsService`，位于RemoteReconTrial之后、RemoteEconomicTrial之前。职责只限运维协议和提交现有守卫请求；不孵化、不移动、不直接转账或自行记真实收入，不改变事件总线/策略/ActionParser顺序。新Service不调用另一个Service的analyze来伪造时序。

Facts/Model/Service分层沿用仓库惯例；只读facts直接从当tickGame及持久账本取得。复用并抽取规范的configFingerprint计算，不能复制两套算法。在这个位置global.RemoteMining本tick尚未分析，凡依赖freshscope的字段明确为未就绪；运维不能据此放行采运。实际source视野、路线和独立100安全ticks继续由既有守卫和RemoteMining在其正确阶段取得。

| 运维阶段 | 行为与原生确认 |
| --- | --- |
| disabled | 不接纳、不创建新动作 |
| preflight | 两个连续tick的完整当前事实均满足；缺字段、tick断档、时钟回退或母房/预算变化停止 |
| archive_preparation | 存旧已知准备档案，下一tick验证；尚不改旧经济请求 |
| release_requested | 只在显式supersede范围生成完整新版本release请求，activateAtTick=t+1；每个逻辑动作只提交一次 |
| release_confirming | 等原经济Model在精确生效tick处理；核对lastSequence2、old.managed=false且其他旧字段不变；missed/invalid不重发 |
| start_prepared | 以已审阅实际配置在游戏内一次生成完整start指纹和下一tick生效请求；economicTrial.enabled=false、remote/room关闭且hold=true，存固定期限 |
| start_activating | 到精确tick再次核对全部事实，再同时开启economicTrial.enabled及本轮明确授权的remote/room权限；原经济守卫在同tick接纳，然后RemoteMining最多发布本轮scout需求 |
| observing | 不需要外部轮询；原guard收集独立100安全ticks、唯一role额度、真实费用和首批交付。运维只检查自身外部窗口/身份/保护字段 |
| stopping | 首批、unknown、危险、断档、截止等停止；不授权第二趟；关闭优先于记录 |
| terminal | 下一tick确认原guard控制关闭，保留outcome和可读报告；尾部未结单列，不能伪称盈利或恢复全部通过 |

各阶段写前保存intent和目标身份/精确预期结果；重置后仅根据Memory和实际状态核对。若intent已写但结果不明，不能再次提交该动作；可以确认现状后关停或标unknown。Game重置、API重连、进程重启、换请求id均不能增加经营额度。

start请求产生后，activate/expires tick与issued/expires ms固定不再生成。1000ticks/90分钟与本轮更早的stopAtMs取先到；旧会话/旧leg/旧spawn期限绝不延长。开启阶段出现异常优先保持关闭；start可能已经接纳时，只对精确属于本运维的经济身份撤权，不操作其他会话。

notAfter限制请求接纳和新动作，不能使原守卫在过期后失去撤权能力。若Game停tick后跨过截止，恢复的首个tick必须在需求/动作前按既有期限关停，不能因为“许可过期”跳过安全关闭；之后只执行原来允许的有限确认/返程，不恢复经营。

默认入口状态、普通服务异常、CPU紧张、metrics关闭、序列化记录失败都不能让后续动作绕过原经济守卫。档案/intent保存失败在启动前拒绝；启动后详细记录失败先撤权，再尽力保留最小失败事实。若Memory原对象本身损坏导致无法写入，保留原始证据并标明不能确认，不能承诺绝对可靠写回。

## 6. 不变的经营与验收约束

每轮最多1新scout/1miner/1hauler；body<=50/800/800；孵化<=1650、必要基建<=6000，并与原1000tick滚动2000/6000预算取交集。无补员、无第二矿、无reserve/修路/市场/GoalPlan。独立100安全ticks不继承旧侦察或上轮计数。

原leg<=300、一次重规划与原request期限不变。native入口不直接调用spawn/withdraw/transfer或修改已有角色额度。费用unknown保持claim并停止；原账本applying、outbox不重放。

只有同本轮canonical hauler/trip、指定远端container已确认pickup、指定W49N41真实terminal正数次tick归因且原账本已应用，才算首批入库。期初库存和新产出区分；首批可能净负收益，按实报告。

报告从原经济会话持久证据投影：版本/身份/窗口、scout出生/移动/真实视野和100安全ticks、真实路线、各role费用/基建、unknown、确认入库、净收益、关闭和tailStatus/场景缺口。没有新证据时保持null/unverified，不能将运维terminal等同于尾部结清。

## 7. 回归与实施边界

新回归必须先RED再GREEN，覆盖：

1. 默认发布关闭且不改旧准备；无request时不创建namespace；短入口serialized<=1024，无任意配置/eval。
2. 完整真实生产事实预检、两tick连续性、current/prior-scope混用、预算pending/unknown、旧侦察锁存兼容；不能用手工“全绿”facts代替生产链。
3. 新旧版本区别、supersede未批准拒绝、旧准备少/多字段拒绝；档案故障不替换原请求；旧50和unknown不归入新轮。
4. 真实生命周期release下一tick处理、完整旧current保持、start准确tick接纳；activate错过不能重新安排，默认/异常路径在Spawn/EventBus/ActionParser前保持deny。
5. 发送前、intent后、写请求后、release后、start后等边界重置；相同id/序列、不同id并发/旧managed锁、未知已应用均不能多开。
6. 无外部读写持续参与的Game tick模拟走通scout→100安全ticks→miner/container→hauler→真实次tick入库→关闭，确认唯一role和真实费用。
7. 首批/危险/失视野/接收不足/核心危机/unknown/记录异常/CPU姿态等先撤权；关停和有限返程条件沿用原守卫；断tick/时钟回退/原期限到达不续命。
8. run和结果持久留存、current/previous有界、未知schema保留；summary失败不影响关停；明确tail未结和无真实收入的失败报告。

获具体设计认可后再编写分批计划。实现阶段完整测试、smoke、Governor和仅构建；本地通过后交付默认关闭候选。提交、推送、部署、新版本只读核对、supersede和生产启用分别按用户明确许可推进，不能把这份草案当作授权。

设计自检：本方案新增的是运维协议，不重建经营状态机；未承诺断网期间外部实时可见，也未承诺服务器停tick时执行；版本交接和取代旧准备的语义改变已披露，待用户审阅。没有确定未来生产日期或自动放宽旧许可。
