# 首批入库结算中断边界：本地只读诊断

日期：2026-10-20。HEAD=03464efee41b14723b7559f676a25e0225868d88。

本轮仅运行本地fixture与现有生产函数、注入合成异常；未修改src、未连接游戏、未修改线上Memory/网络、未提交或发布。完整经济试点计划仍待审阅，不进入实施。

## 已复现的行为

脚本：`.superpowers/sdd/2026-10-20-economic-settlement-boundary-audit/probe.cjs`；原始结果：同目录`result.json`。使用现有remote-mining fixture，真实ResourceMarket生成任务、ActionParser执行、下tick显式更新actor/terminal store，再调用原结算函数。四个诊断case退出0，断言均通过；它们验证现有行为，不是新增守卫的GREEN或完整测试。

| 边界 | 实际结果 | 对守卫实现的影响 |
| --- | --- | --- |
| 正常次tick交付 | 入库100，原账本确认100 | 保留正常基线和原次tick归因规则 |
| reconcile已删除owner，consume尚未调用即抛错；真实JSON重载并重建market | 已生成confirmed100仅在局部resolutions；owner=0、ledger无receipt、重载后仍入账0 | 仅在ledger之后通知不够；必须在删除owner前建立本轮持久待处理凭证 |
| ledger写入去重receipt后、金额赋值前注入异常 | receipt存在、确认金额0；原resolution重放返回already_settled | receipt存在不能单独证明已完成金额写入，不能为补账擅自删receipt重放 |
| 金额赋值后、函数返回前注入异常 | receipt同形、确认金额100；重放仍already_settled | 两边界的receipt完全相同；不能从receipt的id/assignedAt/sequence判断应用完成，也不能用无本轮归属的累计值推断 |

第二case注入点是消费者调用入口；第三/第四case使用透明Proxy仅拦截returnedEnergyConfirmed赋值，分别在写前/写后抛错。异常是模拟器合成，未声称真实Screeps reset必然在这些精确位置持久化或线上已出现丢账。结果证明现有接口缺少支持该恢复判断的凭证。

## 源码依据

- `ResourceReservationFeedback.reconcileReservations` 生成resolution后删除owner，成功clear上的logisticsReservation也删除；resolutions作为函数返回值交给调用方。
- `ResourceMarketService.analyze/cleanup` 先调用reconcile，再进入consumeRemoteResolutions；消费者目前丢弃recordRemoteResolution返回值。
- `RemoteMiningLedger.recordRemoteResolution` 先写settlementReceipts，再累加returnedEnergyConfirmed；receipt不带资源、目标、trip、trial或应用结果。

## 对实施计划的收窄要求

维持已批准的次tick规则、真实账本计费和关停目标，完善P4/P5的实现约束：

1. 为托管经济resolution增加删除owner前的同步checkpoint入口。完整Identity、reservation、trip、目标、资源、真实确认量持久存入本轮有界outbox；普通非托管调用维持原行为。
2. outbox使用prepared/applying/applied阶段。调用账本前先记录applying；账本成功返回后才记录精确applied结果并同步撤权。凭证写入失败时保留未移交owner并使守卫停止，不吞异常后继续经济动作。
3. prepared仅代表已确认物流、未进入账本调用；applying且无完整applied结果表示应用不明，恢复后记unknown、停止，不删除原receipt、不自动重放或补收入。applied可用于恢复停止，仍不重复计费。
4. outbox与详细诊断分离。停机效果优先，诊断失败不能阻断关停；current/previous、事件/未决凭证仍受既定容量约束。
5. 正式回归必须覆盖以上四个注入点，以及删除owner前checkpoint失败和账本已返回但守卫通知失败；测试须JSON重载、重建服务并在hook外断言。诊断脚本不替代正式RED→GREEN。

这补齐批准设计中的中断/记录失败要求，不代表守卫已实现。侦察、实际采运、Goal/Plan继续关闭；没有新线上采样，最近关闭事实仍只能引用既有时间戳。
