# 游戏内一次性入口：W48N41首批入库单次执行方案

> 本卡供审阅，目前不执行。用户本次只授权默认关闭发布与只读核对；没有授权归档取代旧准备、release或start。后续由主代理按本卡逐项执行，不新增子代理。代码实施已结束，本卡不安排代码修改或再次部署。

**Goal:** 通过一次完整短请求，验证W49N41→W48N41首批真实入库、费用隔离和有界关停；结果允许为负，不预设成功。

**Architecture:** 外部只提交一次nativeTrialOps请求；游戏内P0按当tick事实完成两tick预检、旧准备跨tick归档、合法release和新会话接纳。随后仍由既有经济守卫完成scout、100安全ticks、采运、次tick确认与停止，外部连接不承担持续推进职责。

**Tech Stack:** Screeps shard3、Memory持久协议、NativeEconomicTrialOpsService及原RemoteEconomicTrial/RemoteMining服务。

**Spec:** [已批准设计](../specs/2026-10-22-native-economic-trial-operations-design.md)。发布事实见[发布报告](../evidence/2026-10-23-native-economic-trial-operations-release.md)。

## 当前状态与许可边界

本卡对应逻辑提交b3a7af9fcb599201e6cb4ce9651aea6f21593168、SERVICE_VERSION=1792719819692。当前nativeTrialOps={enabled:false,request:null}，没有nativeEconomicOps namespace；实际侦察/采运权限、Goal/Plan和市场均关闭。

旧economic current仍是econ-w48-20261021-01 / sequence1 / epoch2 / codeVersion1792555927985，terminal且managed=true；旧费用50、unknown0，不计入未来新轮。已确认旧准备仍是release-econ-w48-20261022-01 / sequence2 / codeVersion1792636618804，无激活/截止四字段，不能在新版本原样接纳。

旧外部18:30/18:32期限已经过期。未来native请求归档并取代旧准备，属于新的准备授权，不能称为旧请求重试，也不能删除旧执行目录、锁或日志。新截止日期尚未授权，不生成可发送的生产请求。授权后先固定当天明确日期及issued/stop/notAfter，逾期停止，不自动改日期或延长。

## 不变约束

- 目标仅W49N41→W48N41，一处source：5bbcaa6d9099fc012e63155b。
- 接收terminal：6ad0b55bceeb3db0d3b4dda0，必须重新核对己方实体和能量剩余容量≥20000。
- containerPos=(19,6,W48N41)，只允许必要容器自建/维护；不reserve、不扩第二矿、不修路。
- 全轮最多1名新scout、1名miner、1名hauler，body能量上限50/800/800；不补员、不批准第二趟。
- 本轮孵化≤1650、基建≤6000，同时受原1000tick滚动孵化2000/基建6000预算限制。
- scout独立累计100安全ticks；旧安全计数、旧视野、旧费用和旧unknown不能继承。
- 经济start后最多1000ticks；整个新运维窗口含预检/准备总长≤90分钟，stop与总截止至少间隔120秒。建议只给88分钟经营上界及2分钟确认余量；所有动作仍取更早的原spawn/leg/经济期限。
- leg≤300、原一次重规划及原期限不变；unknown/异常/危险/首批真实入库即停止经营。
- Goal/Plan与市场始终关闭，Governor shadow=true、scheduler.enforce=false；共享网络配置不变，预期仍A02，变化即停止复核。

## 复核重点

1. 历史状态只认已编译profile，任何准备、序列、字段或未决额度变化都拒绝，不现场清理后硬启。
2. 外部只读窗口≤30秒、tick跨度≤10；失败样本独立保存，不拼接，不能用陈旧样本补齐绿色。
3. release/start在各自准确tick接纳，错过不重排；本轮费用和unknown必须绑定新身份。
4. POST超时/502/无回复不重放、不换id；只读原id的policy、native运维和经济身份。
5. 控制关闭、终态、真实入库、尾部结清是不同结论；没有证据就分别标记未验证。

## 1. 新鲜只读预检

- [ ] 重新GET default代码和activeWorld，与本卡main/map指纹及实际运行版本逐项匹配。若有新发布，当前卡失效，先重审。
- [ ] 在独立目录保存本轮卡、请求身份、旧锁/日志引用和各次样本；旧目录只读保留。外部提交前先写本地单次发送intent。
- [ ] 核对A02、鉴权、WebSocket101和tag读回；不开启游戏功能，不修改节点。传输失败最多三次只读尝试；每次新窗口，不能放宽30秒门槛。
- [ ] 核对母房己方、无敌人、Controller高于原紧急阈值且至少5000、recovery=normal、至少1可用miner/hauler且无核心即将到期缺口，spawn可用且空闲、energyAvailable≥50。
- [ ] 真实terminal id/归属/容量正确；预算buckets、grants、receipts、基础建设pending及operation.ledger完整，无远程actor/accepted/spawning、未决grant/outbox/slot或unknown。
- [ ] 旧economic current、lastSequence、已确认旧准备和合法released recon状态精确匹配profile。reconTrial.enabled=true是旧release协议锁存，实际allowRecon=false；不改该锁存。
- [ ] 确认native入口关闭且无历史运行状态，Goal/Plan、市场关闭；其他远程房间关闭。必须事实无法读取就停止。

这些外部读回只供审阅和发送判断；游戏内仍重新要求两个连续tick完整Facts，不能用外部采样代替。

## 2. 固定请求并仅提交一次

- [ ] 获得明确授权：允许归档并取代这一份已知未激活旧准备、合法经济release、新会话单次start、停止撤权；同时批准新日期和绝对时间窗。当前发布授权不包含这些动作。
- [ ] 使用未用过的运维id和新economic trialId，固定profileId=w49n41-w48n41-first-delivery-v1、codeVersion=1792719819692、完整旧identity、expectedLastSequence=1、releaseSequence=2、startSequence=3。
- [ ] 请求包含四个明确许可标志allowSupersedeKnownClosedPreparation/allowEconomicRelease/allowStart/allowHold=true。只在获批后构造；本卡没有实际生产请求。
- [ ] issuedAtMs取已批准窗口内的实际生成时刻；接纳时年龄≤30秒。acceptNotBeforeTick/acceptNotAfterTick绑定新鲜tick且跨度≤10；stopAtMs/notAfterMs固定，预检/准备计入总时长。时间不足、逾期或窗口不符则不发送。
- [ ] 用src/services/NativeEconomicTrialOpsProfile.js的validateNativeOpsRequest和makeNativeOpsSubmission离线验证18字段与完整serialized expression≤1024；禁止分片或任意Memory路径改写。
- [ ] 写入本地唯一发送intent后，只发送这一个完整nativeTrialOps对象一次；不另跑外部stageRelease、不手工release、不删除旧managed锁、不改其他开关。
- [ ] 发送回执不明时仅按原request.id回读global.RemoteTrialOps.status(id)、policy请求和原经济账本；保留unknown。不得重发、换id或补写分片。

## 3. 游戏内推进与有界观察

- [ ] 观察preflight→archive_preparation：两个连续tick事实满足，原准备先归档，后续tick证实档案和原对象仍正确。
- [ ] 观察release_confirming：原Model在准确tick合法release，旧current只允许managed变false，lastSequence变2。失败或错过不重放。
- [ ] 观察start_prepared/start_confirming：新start请求一次生成canonical指纹及固定期限；准确tick才接纳startSequence3，核对admittedIdentity。没有接纳就不能宣称试点已启动。
- [ ] 观察scout被接受、出生、实际移动、跨房视野和本轮100安全ticks。路由与安全以新Game事实为准，历史路线仅作历史证据。
- [ ] 100安全ticks后才允许唯一miner，必要容器可用后才允许唯一hauler；保留每个spawn/基础建设真实回执。没有容器时明确报告施工仍在等待。
- [ ] 外部每次只读采样独立存档；不要求维持长WebSocket来驱动阶段。断线时只能说明可见性缺口，不宣称持续观察、持续安全或经济验收通过。

## 4. 停止与报告

- [ ] 第一次同本轮hauler/trip、指定远端容器确认pickup且指定母房terminal正数次tick入库归因并应用账本后，原守卫立即停止经营；不追加第二批需求。
- [ ] 任意unknown、危险、失视野、核心危机、接收不足、预算/身份/版本异常、断tick或时间先到时，先撤权再留证；不得为了完成首批延长原期限。
- [ ] 下一新鲜tick确认remote/room关闭、hold=true、allowRecon=false、allowEconomicDeparture=false、native入口disabled；Goal/Plan与市场保持关闭。保留合法协议锁存和managed记录，不为显示“全false”而清锁。
- [ ] 若外部超时，只读原id和实际权限；游戏内依原期限停止。运行时停tick期间不能承诺墙钟回调，恢复首tick先撤权；未读到真实关闭就报告“尚未确认”。
- [ ] 保存中文结果：身份/版本/期限、scout出生/视野/安全、真实路线、各role孵化和基建费用、unknown、确认入库、净收益、关闭证据、tailStatus与未覆盖场景。旧50成本独列，不进入新轮。
- [ ] 运维terminal不等于经济成功，控制关闭不等于tail已结清。newProductionConfirmed无证据保持null，净收益可为负。没有实际线上入库就不宣布首个经济闭环通过。

## 当前交付

本卡仅形成后续具体执行顺序。发布后的关闭和兼容性核对已完成；本卡全部生产步骤尚未执行，旧准备未被取代，未release、未start。后续要执行时，先批准明确的新日期窗口和第2节范围，再生成一次性请求；无需重新批准本次已经完成的默认关闭发布。
