# 旧会话视野标记与新接纳：诊断、候选方案及回归要点

2026-10-22。本轮按用户要求仅做本地排查和方案准备，未新增产品实现或产品测试，没有生产API调用、线上Memory写入、提交、推送、部署或重开功能。此前四点移动修复及其547项验证产物全部哈希仍匹配；保留全部未提交改动。

## 已验证事实

| 诊断场景 | 当前代码结果 | 结论 |
| --- | --- | --- |
| 旧经济会话获得20个安全ticks，终态后显式release；新身份、当前无视野、无旧actor或未决claim | 新start被vision_lost拒绝 | 旧视野状态污染新接纳 |
| 同上，仅在纯函数输入中去掉这一条历史fatalReason，不修改任何源码或Memory | 新current从recon/safeStreak0/费用0/unknown0开始，visionAcquired未设置，previous保留旧raw | 尚未发现新会话直接复制旧安全计数或费用的证据；根因不在makeSession复制 |
| 给上述新会话提供真实条件等价的外部视野，但没有本轮scout | 当前模型记录本会话视野，safeStreak仍0，miner spawn许可stage_blocked | 外部视野本身不能替代新scout安全计数 |
| 活动会话已有视野，下一tick失去视野，直接执行P0 evaluate；分别使用原请求和不同新请求 | 当前代码均关停旧会话vision_lost；不同新请求另外被trial_in_progress拒绝 | 旧活动会话仍需独立履行失视野关停职责，不能只按传入请求身份过滤历史 |
| 同上，只删除collector提供的vision_lost，不补模型判断 | evaluate未形成关停outcome | “仅删条件”会破坏原P0保护，不能采用 |
| 旧终态尚managed=true，旧实体已退场；新身份且有外部远程视野 | 当前模型实际创建新会话 | terminal锁目前没有独立于视野的明确release gate，必须在移除历史误拦截时一起补强 |

四组一次性诊断断言和许可补证位于 `.superpowers/sdd/2026-10-22-economic-vision-session-diagnosis/diagnosis-with-permits.json`。这是对当前缺陷和候选方向的诊断，不是修复GREEN。纯函数反事实输入已明确标注，不冒充真实接纳成功，也没有在生产清除标记或锁。

## 根因与机制

`RemoteEconomicTrialFacts` 先从settings/request选择新remote上下文，却直接使用持久化旧current的visionAcquired计算fatalReason；`advanceEconomicTrial` 在makeSession之前调用failure(facts)，因而还没创建新会话，就被旧标记拒绝。

makeSession已有safeStreak0、全新slots和本轮费用初始化，当前问题不能笼统归因为“所有状态都跨会话继承”。但这套初始化必须增加运行链回归，证明旧99/100、parent operation.safeTicks、外部视野、旧actor及global重置都不能授权新会话提前采运。

另一方面，当前active分支依赖collector的fatalReason在evaluate/动作前关闭。仅移除它而依赖后面的scope_observed，会把关闭时机推迟到RemoteMining scope推进；该scope缺失或阶段顺序变化时，保护不完整。

当前新接纳条件只对managed且非terminal的旧会话返回trial_in_progress，terminal/managed=true可直接被替换。这与显式release的意图不一致；不能把旧vision_lost的偶然拒绝当作锁保护。

## 推荐的有明确范围的方案

本次是既有Facts/Model接纳链路的修复，无需新子系统或线上迁移。保留此前四点移动修复，不重写其路径或费用协议。

1. **Facts只描述当前事实。** 保留当前房间真实remoteVisible、危险/foreign control、母房、接收空间、预算与完整身份检查；去除通过旧current.visionAcquired派生的历史vision_lost。旧实体、accepted/spawning、grant、outbox和基建未决状态依然参与阻塞，不能一并过滤。
2. **Model负责所属会话的失视野。** 在managed、活动且尚无outcome的实际session分支，用该session的visionAcquired与当前remoteVisible判定vision_lost，覆盖evaluate、end_tick和动作前推进；不依赖scope_observed才关闭。新请求即使被拒绝，也不能阻止旧活动会话按自身视野关停。新接纳调用中session切换后，只读取新session的标记。
3. **显式释放旧锁。** 新身份start遇到任何managed旧会话都不得接纳；活动旧会话保留trial_in_progress，terminal旧会话明确release_required。只有现有合法release验证通过、managed=false，且旧实体/未决claim全部通过检查，才允许新的start。release本身不隐含start，不自动清锁、退款或轮换记录。
4. **保留独立计数初始化。** 新会话明确从visionAcquired=false、safeStreak0、无lastSafeTick/safeStartedAtTick和空role slots开始。计数只接受本轮完整Identity绑定的、已被实际接纳且出生的新scout，在目标房间的当前安全scope逐tick推进。不能复制parent safeTicks或旧摘要。外部新鲜视野可以供实际安全判断，但没有本轮scout不得计数；本会话一旦已取得必要视野，再失去时仍按原规则关闭。
5. **历史与失败不变。** previous保留release后的旧raw及费用/unknown/outcome；同会话JSON重载继续原计数和期限，新会话重载不复活旧证据。旧记录缺少可选视野字段不自动伪造“曾有视野”；非法schema或与计数矛盾的记录保持原fail-closed行为，不静默改写。旧危险情报、冷却、滚动预算、未知grant、1000ticks/90分钟和角色上限均不清零或放宽。

主要实现位置预期为RemoteEconomicTrialFacts.js、RemoteEconomicTrialModel.js及model/runtime回归；Service只在必要的既有适配边界核对，不新增生产控制入口或Memory命名空间。旧记录不需要批量迁移。

备选“仅在collector加managed检查”虽更短，但继续把会话生命周期判断混在事实采集层，且不能清晰处理不同新请求下旧活动会话的关停与旧terminal锁；不推荐。直接清除旧视野/安全计数会破坏历史与重置证据，也不采用。

## 回归计划

| 组 | 关键输入 | 必须证明 |
| --- | --- | --- |
| 接纳与历史 | 旧20/99/100安全ticks且vision=true，显式release后新身份、无视野 | 接纳仅recon；新标记false/计数0/本轮费用与unknown0；previous raw不变 |
| 旧锁 | 旧terminal仍managed=true，有/无外部视野；非法或陈旧release | 必须拒绝替换；只有合法release后才能新start，无额外孵化 |
| 旧活动会话保护 | 已有视野后丢失，P0 evaluate；同时收到不同新start；跳过scope推进 | 新start拒绝，旧会话同tick撤权与下一tick关闭，不等待scope_observed；动作前无新调用 |
| 计数隔离 | parent safeTicks100，旧摘要100，外部观察者视野，旧/错绑scout | 没有本轮已接纳出生scout时计数0，miner/hauler无孵化或经济出发 |
| 连续门槛 | 新scout实际入房、1→99→100；同tick重复scope与真实tick连续性 | 每tick至多+1，99不放行、100且路线等全部门槛通过才允许原经济阶段 |
| 重置与保留 | release前后、接纳后未出生、计数49/99时JSON往返并重建服务 | 同会话原时间/计数续行；新会话不继承历史；旧raw与已确认费用不变 |
| 未决与费用 | 旧actor/accepted/spawning、unknown grant、applying outbox/基建；新会话unknown中断 | 原阻塞/claim保留，无删锁退款重试；旧支出与新unknown严格按身份隔离 |
| 现实安全门槛 | 新鲜danger/foreign control、母房危机、接收不足、预算不足、版本/epoch/指纹错误 | 接纳拒绝或活动会话立即关闭，不能因视野隔离而放行 |
| 原期限与兼容 | 过期/重复/回退请求，旧记录缺可选字段，非法schema，已有尾部任务 | 不续期或重放，错误raw留存；安全返程及既有尾部不因新start被篡改 |

实施时先让关键误拦截与未release替换断言在当前生产链RED，再修到GREEN；负向本来通过的保护断言保留，不伪称全部新增测试都曾失败。复用上轮opt-in原生坐标/房名/出口换房fixture，不能靠手改safeStreak、删未知grant或固定允许返回值构造成功。

完成后运行完整npm test（当前基线547项，新增后按实际计数）、smoke/Governor、未设置DEST的构建及两种diff检查。本轮设计阶段不重新运行构建，也不把上轮547/547当作此修复已完成。

## 后续边界

本稿只交付证据、推荐方案与回归要点，尚未实现。用户确认后才进入本地实施；提交、推送、部署、release线上旧锁及再次侦察/采运仍需各自明确授权。Goal/Plan不启用。本轮没有读取新的在线状态，沿用先前关闭记录，不声称已重新完成线上开关验收。
