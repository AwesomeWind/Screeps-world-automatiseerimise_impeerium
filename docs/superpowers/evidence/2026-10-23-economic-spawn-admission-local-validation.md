# 经济试点Spawn仲裁后接纳：本地交付与验证

2026-10-23。按已认可六批计划由主代理逐批实现，完成一次只读独立review及维护者修正。**本轮未联网、读取凭据/共享代理配置、暂存、提交、推送、部署、写线上Memory或启动功能。** 首个真实经济闭环仍未完成。

## 结果与行为

- 新增43项回归，原631项保留，最终完整 **674/674通过**；smoke、Governor、最终仅构建均exit0。
- 未获Spawn席位的经济role只发当tick候选，不建立正式request/deadline/grant或消耗原生次数。Bureau维持原母房优先级与同级顺序，Spawn按实际idleSpawns/energyBalance仲裁。
- 实际获位后才通过guard持久化binding→intake→admitted，并固定min(admissionTick+5, session.expiresAtTick-1)。候选TTL0转换为正式event的原deadline；receipt/backup使用canonical requestId，不使用候选运输id。
- 同tick接纳未提交、重置半提交、迟到/伪造/重复候选、预算及原期限异常都拒绝经营。已绑定合法重试沿用同id/期限及首次admission信息，原一次重试/总调用≤2不变；未知调用与applying不重放。
- 角色1/1/1、100独立安全ticks、1650/6000及原滚动2000/6000预算、1000ticks/90分钟、native较早截止、原leg≤300及严格次tick入库确认均保留。

变更只涉及RemoteEconomicTrialModel/Service、RemoteMiningService、SpawnBureauService、SpawnService五个产品模块，以及相邻说明、测试和package入口。没有改main生命周期、EventBus、调度优先级、生产profile、经营指纹或策略开关默认值。

## RED→GREEN与真实链覆盖

证据目录：.superpowers/sdd/2026-10-23-economic-spawn-admission/。每次测试和构建子进程均加载deny-network preload，并清空DEST；没有运行push/watch/local。

| 批次 | 关键证据 | 结果 |
| --- | --- | --- |
| 1 Model合约 | task1-red → task1-green | 新字段、binding拒绝run、旧记录兼容、原id/期限固定；41/41 |
| 2 只读候选/两段适配器 | task2-red → task2-green | 构造/检查不改Memory，完整身份与当前tick，绑定/预算/intake/complete；120/120 |
| 3 真实仲裁接入 | task3-red → task3-green-verified | 单Spawn同级hauler先占位，等待30ticks再单次接纳，TTL与canonical receipt/backup；128/128 |
| 4 故障/重置 | task4-red → task4-green | 7项grant字段反例先失败，complete复核身份/额度；同tick异常、reset和未知引擎路径；176/176 |
| 5 安全/兼容 | task5-red → task5-green | 已release旧会话不能被迟到abort撤权，门槛/预算/重复候选及竞争后首批；191/191 |
| review后维护者修正 | review-fix-red → review-fix-green | applying/not_started矛盾持久记录重置后曾额外调用一次；现在保留原值/claim并拒绝；192/192 |
| 完成审计补覆盖 | completion-fault-coverage-verified | binding/grant/intake三处写入中断，各自无原生、关闭，reset不重开；3/3 |
| 最终完整验证 | completion-smoke/governor/node-tests/dry-build | 674/674及三个检查exit0 |

新增用例中有些原安全路径在首次运行时已通过，用作保持原合约的回归；没有伪称每一项新增测试都曾失败。补覆盖脚本初次注入早于fixture初始化，已改到真实RemoteMining.analyze之后、Bureau之前；没有为测试修改生产初始化。

真实链测试复用原native/economic fixture，从一次submit经过旧准备归档、合法release、新接纳、scout出生/实际移动/视野和自然99/100安全ticks。通过核心hauler TTL进入原Bureau补员触发同级45竞争；没有手填安全计数或直接调用适配器冒充端到端成功。

单Spawn被母房hauler占用30ticks时，miner无正式id/deadline/grant；自然释放后仅一次接纳，全轮startedAt/expires和安全起点保持。已有容器场景继续完成唯一miner/hauler、pickup→指定terminal正数次tick入库并关闭；费用按实际body receipt求和，旧50仍单列。**这些是本地Game模拟，不是新的线上采运/入库或盈利证据。** 缺容器场景仍只验证必要工地与施工/hauler门槛，不冒称新容器完整建成至入库已覆盖。

## 唯一独立review

Reviewer只读检查pre-review-manifest固定的670项阶段候选，独立运行新增39/39；未改文件或联网，五项Review Focus均检查，未发现正常控制流可复现缺陷。

原review将“ledgerStage=applying、callState=not_started”的矛盾完整记录列为未判断。主代理按显式applying不重放要求提升为Important，先验证实际反例，再以最小validator约束拒绝该组合；原记录与grant不清除，费用不伪造。最终全套证明修正后的行为；没有第二次独立review，不能称reviewer独立验证了最终43项。

原意见、Declined to judge及处置见readonly-review.md；Minor deferred为无。最终build、线上开销和真实收益未由reviewer验证：build由主代理完成，线上两项保留缺口。

## 维护者裁定与代价

1. 按用户要求保留证据和旧草稿、不执行默认commit/cleanup；代价是保留本地证据目录，index为空。
2. 原cleanup会在live creep memory存在时消费spawn备份；在Spawn.run写入后、cleanup之前核对backup，另核对持久receipt。没有改清理行为，避免错误观察时点掩盖正确协议。
3. 1/1/1与50/800/800已结构性约束1650，仍保留显式原总额检查；验证真实body回执，不用违反单role上限的伪合法body测试总额。
4. 矛盾applying记录不尝试自动修复，直接保留并拒绝；代价是损坏记录需后续人工诊断，避免以可恢复性换取潜在重放。
5. 完成审计发现三处故障需独立用例，补齐后重跑全套和最终仅构建；前一次671项验证/仅构建保留为pre-coverage历史，不作为当前候选。最终只使用下节指纹，不混用旧产物或报告数量。

## 固定候选与Git

工作树codex/single-remote-mining，HEAD仍ff83340dd91b6c03cbdb9e09d8d90d16df124bea。没有改主目录main。最终validation-manifest记录127份源码/相关文件哈希、各命令退出码和允许的差异；pre-review与pre-coverage版本单独保留，没有改写baseline。

- 最终本地SERVICE_VERSION：**1792733742635**，不是已部署版本。
- main SHA-256：e3c6eb0726c31d2bf1639e61d1594ab85ed6b45a16ec639102729c26d52f2b03。
- main.js.map SHA-256：3391bdf78f3fbb4b608c1bfbfdf6cb616981a1511ab2d4ae25b7ea82f72682c8。
- closed-candidate.json为approved=false、默认开关关闭、productionRequest/window=null，不包含实际可发送的启动请求，不授权覆盖已有线上锁存。
- 195份上轮运行/发布/诊断文件内容及目录成员逐项匹配基线；旧目标进度仍保留原38行未提交变化，本轮未纳入或清理。Git diff检查通过，index为空，所有本轮修改仍未提交。

## 尚未验收

本轮没有再次连接游戏，不能把旧读回当成当前新鲜线上状态。侦察、采运、Goal/Plan、市场没有被本轮启用，也没有改共享网络。上轮失败seq3的terminal/managed锁、费用-50和旧许可不由本轮修复迁移、解绑或续期。

未验证新代码在线CPU/Memory增量、新版本实际侦察/采运/首批入库、真实净收益、断网/停止恢复或10000tick长期覆盖。tailStatus仍unverified、newProductionConfirmed缺证据为null，不能以674项本地通过或构建时间宣称经济目标完成。

本地交付到此结束。提交/推送/默认关闭部署及新的任何试点仍须分别获得用户明确授权，并重新核对当前版本、旧会话与准备兼容；本报告不是新的生产执行卡。
