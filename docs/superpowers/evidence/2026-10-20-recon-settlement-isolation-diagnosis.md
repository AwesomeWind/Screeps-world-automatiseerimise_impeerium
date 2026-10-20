# 侦察会话结算串用：证据与诊断

日期：2026-10-20。本轮仅只读线上核对、本地诊断与方案设计；未修改生产代码或正式回归，未提交、推送、构建或部署。

## 结论

已确认不是单纯的时间戳显示问题：旧会话的confirmedCost也会进入新会话，并掩盖新会话应显示的unknown。真实预算账本与守卫仍分别保留执行claim并拒绝再次孵化；本轮没有证据表明该摘要缺陷已经造成额外放行、退款或重复扣费。

基线HEAD：`055b1201c34704cf3ffa6f04e60b76202607b969`；预期部署逻辑为`7faf8aa`、SERVICE_VERSION=1792461044554，本轮SDK版本匹配。服务器产物哈希沿用上一轮发布/复试记录，本轮未再读取code产物。工作区为既有single-remote-mining worktree，历史未跟踪文档未清理或暂存。

## 线上样本

14:36:50（北京时间）SDK只读采样，遥测tick83759920：remote=false、W48N41 enabled=false/hold=true，Goal/Plan=false，目标命名空间不存在，Governor shadow=true、scheduler.enforce=false、market=false。旧start作为终态托管锁保留，不是正在侦察。本轮未发console动作或写线上Memory。

本轮会话w48-20261020-01始于83759338，settlement却为：

`{confirmedCost:50, unknownUpperBound:0, updatedAtTick:83736103}`

83736103属于旧会话w48-20261019-02。新会话实际费用另由request `remote:W49N41:W48N41:1:4` 的receipt确认：tick83759338，name=scout_83759338_Spawn1_0，cost=50；operation累计150→200。线上实测本身只能证明旧时间戳残留，费用/unknown误报的扩展影响由下述本地生产链复现确认。

## 本地复现

诊断使用现有createReconTrialFixture，真实调用RemoteReconTrialService、RemoteMining、SpawnBureau、SpawnService和ActionParser。先让A成功消费50并关闭，模拟其旧scout自然消失、等待205 ticks，确认oldActors=false、unsettled=false后，按sequence=2启动B；没有清空预算/旧receipt或删执行claim来取得额度。

| 场景 | 实际费用/claim证据 | 错误摘要 |
| --- | --- | --- |
| A已支付50，B引擎明确ERR_BUSY | 账本仍只有A的50，B未成功，grants为空 | B仍confirmedCost=50、unknown=0、updatedAt=101 |
| A已支付50，B调用结果丢失 | B执行grant保留，账本unknown上界50；守卫以spawn_unknown停止 | B仍confirmedCost=50、unknown=0、updatedAt=101 |
| 纯模型在新接纳时收到旧unknown快照 | 新session.spawn为空；这是故意混入旧facts的纯输入反例 | 新session直接得到旧null/50及旧时间 |
| receipt的name错误，或tick早于会话/晚于当前时刻 | 人工污染本地输入，不代表线上存在这些坏receipt | Facts仍给出confirmedCost=50 |
| 第一轮，无任何旧会话，在call_started事件后中断 | 引擎调用前claim已经存在 | 同一事件的摘要仍为调用前0/0 |

纯模型旧unknown反例不意味着真实未结grant可以合法绕过接纳门槛；实际运行时unsettled=true仍应阻止新一轮。错误receipt反例只证明当前验证边界不足，不宣称线上receipt已损坏。

## 数据流根因

1. `RemoteReconTrialService.advance()`先调用collectReconTrialFacts，再调用纯模型推进事件。
2. `RemoteReconTrialFacts.js:99-107`从进入本次调用时的current.settlement起步，按旧current.spawn.requestId查receipt。confirmedCost已经等于50时，无新有效receipt也会保留旧摘要。
3. `RemoteReconTrialModel.js:255-256`接纳新start、轮换current→previous并创建新session；本次facts仍来自旧session。
4. `RemoteReconTrialModel.js:351`不验证身份，直接将facts.settlement写到事件推进后的session。相同问题也发生在spawn_call_started之后：post-event的callState已改变，settlement却来自pre-event事实。
5. 当前receipt过滤仅核对remoteId、epoch及cost=50，未核对bound name及时间范围；不应靠只改updatedAtTick掩盖来源。
6. `RemoteMiningLedger.js:58-69,113-145`才负责实际扣费与执行unknown；本诊断未修改此账本。settlement当前仅被模型摘要导出，不是生成新spawn许可的条件。不能把观测错误直接说成预算安全门槛已失效。

## 验证范围

- 现有model/runtime守卫测试：104/104通过，无跳过；日志existing-guard-baseline.log。
- 诊断合约：6个预期RED，分别是B明确失败、B未知执行、旧unknown混入新接纳、错name、过早tick、未来tick。全部因目标数值不符而失败，非加载或语法错误。
- 这些RED读取本轮复现结果，用于定位证据；不是最终可随代码修复自动转GREEN的正式回归。实施时必须将场景转为每次实时运行生产函数的测试，不能只保留静态JSON断言。
- 未运行本轮完整全量测试或构建，因为尚未修改生产实现；不把历史387/387当成本轮修复已通过。

证据目录：`.superpowers/sdd/2026-10-20-recon-settlement-diagnosis/`。包括reproduce.cjs/runtime-reproduction.json、provenance.cjs/provenance-reproduction.json、event-order.cjs/event-order-reproduction.json、diagnostic-contracts-red.cjs及其日志，SDK关闭快照sdk-evidence-1792478210677.json。

后续见[修复设计草案](../specs/2026-10-20-recon-settlement-isolation-design.md)与[回归计划](../plans/2026-10-20-recon-settlement-isolation-regression.md)。本轮不自动实施。
