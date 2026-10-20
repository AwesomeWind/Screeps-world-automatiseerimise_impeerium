# 侦察结算隔离：回归与验证计划（已批准）

日期：2026-10-20。用户已认可此回归矩阵并授权五批本地实现与一次独立只读review，当前均已完成，未提交或部署。配套[修复设计](../specs/2026-10-20-recon-settlement-isolation-design.md)；R01—R22正式用例映射及实际RED/GREEN见[本地验证报告](../evidence/2026-10-20-recon-settlement-isolation-local-validation.md)。下文保留批准时的验证要求。

## 当前已取得的基线

- 本轮现有recon-trial-model/runtime：104/104通过。
- 诊断脚本6个预期RED：新B失败却继承50；新B未知被写成50/0；纯模型旧unknown混入新接纳；receipt错name、过早tick、未来tick被误认confirmed。
- 另复现首轮call_started后仍0/0的事件顺序问题。
- 日志位于`.superpowers/sdd/2026-10-20-recon-settlement-diagnosis/`。诊断RED读取复现JSON，不是最终正式回归；正式测试每次必须调用实际生产Facts/Model/Service重新产生结果。

## 测试分层

1. 纯模型：同一调用中新接纳替换current、事件推进后结算、来源绑定与更新时机。
2. Facts：只读证据采集及完整身份、request、name、receipt时间/费用的校验边界；断言无Memory/ledger写入。
3. 生产链：createReconTrialFixture驱动RemoteMining→Bureau→Spawn→Guard→ActionParser与真实结算ledger，核对实际引擎次数、grant/receipt、费用累计及关闭。
4. 恢复：真实JSON往返、重绑creep.memory、重建服务；不能只复制global缓存假装重置。

双会话正常场景应让A真实成功并关闭、旧实体自然退出且冷却结束后启动B，不删除旧执行claim来制造“可启动”。纯模型恶意混入旧unknown事实必须标明是防御输入，不冒充运行时可以绕过旧未结grant。

## RED→GREEN矩阵

| 编号 | 场景 | 必须断言 |
| --- | --- | --- |
| R01 | A已确认50，B刚接纳但未调用 | B=0/0，本轮初始化tick；previous完整保留 |
| R02 | A已确认50，B明确ERR_BUSY | B=0/0；实际账本仍仅A的50；不复制旧时间 |
| R03 | A已确认50，B调用结果丢失 | B立即null/50；执行grant与真实unknown50保留；停止且不能补孵化 |
| R04 | A真实unknown尚未结，尝试B | 新接纳拒绝，current仍A、grant及费用上界不变；不是为了隔离把unknown归零 |
| R05 | 纯模型在新接纳时混入旧null/50事实 | B独立0/0，不继承旧unknown或时间戳 |
| R06 | 费用事实五字段身份分别不符 | trialId/sequence/remoteId/epoch/codeVersion逐项反例均不能写入本轮 |
| R07 | receipt lookup request或name不符 | 无本轮confirmed；有本轮未决调用时保持unknown50 |
| R08 | receipt过早、早于callTick、未来tick、非法tick/cost | 不确认，不释放claim；正常匹配的remote/epoch/数值50也不能绕过其他字段 |
| R09 | 合法本轮receipt与迟到receipt | 本轮50/0；迟到允许超过原截止，但不改原终局/关闭时间/期限 |
| R10 | call_started时仍带调用前0/0事实 | 在真实spawnCreep入口采快照，事件后的summary已null/50；断言置于入口外，避免被业务catch吞掉 |
| R11 | not_started/not_called与明确失败 | 未调用才按既有规则取消grant；0/0；不误标unknown、不动其他scope |
| R12 | own receipt确认后重复事件、重复读取 | 不重复扣费；confirmed50、updatedAtTick及绑定稳定 |
| R13 | 同一会话receipt保留窗口到期 | 已绑定确认仍50/0；未知执行claim不因deadline或回执裁剪自动退款 |
| R14 | 同会话unknown停止后得到自己的合法receipt | null/50→50/0；冻结outcome完全不变，原request/leg期限不变 |
| R15 | 迟到/重复旧会话receipt或旧事实到达B | 不影响B金额或时间；不得修改previous。旧实际未结claim仍走R04拒绝新接纳 |
| R16 | 引擎调用前/调用后/ledger后中断，再重置 | 不重放引擎；各阶段unknown/known与真实账本一致，整轮最多一个成功scout |
| R17 | 新绑定JSON往返、global/service重建 | 本轮confirmed或unknown不丢、不串用；不续期 |
| R18 | 旧v1终态缺绑定、旧时间早于本轮、未知绑定schema | 旧记录兼容且可关闭；legacy_unverified，不伪造新确认；旧outcome不改 |
| R19 | 缺失/损坏来源与诊断字段 | 不信任缓存50；不因诊断校验让关停效果跳过，不改变实际预算 |
| R20 | 保护开关、安全、总期限、scope不新鲜 | 原动作前撤权、关闭下一tick确认、安全返程行为不放宽 |
| R21 | 同费用事实跨epoch/codeVersion/target的其他scope | 不修改其他母房预算/receipt/grant或其他历史会话 |
| R22 | telemetry关闭或摘要导出多次 | 守卫仍运行；费用语义与updatedAtTick不受展示刷新影响 |

R06/R08/R16/R18应参数化覆盖，不能只用一个等价例子代替各字段和各中断阶段。R09需正向迟到样本，防止为了拒绝旧tick而误拒合法晚到账费用。

## 实施顺序与验收门槛

获批后再执行：

1. 先将R01/R02/R03/R05及receipt反例转成真实函数回归，确认在当前实现RED；为R10补引擎入口快照反例。
2. 分开实现身份拒收、post-event结算归约、持久绑定及旧记录兼容；每一部分只跑相关用例直到GREEN。
3. 完成其余矩阵，重点复查账本未退款/未重复扣费、实际引擎次数和关停，不只比较摘要JSON。
4. 跑完整package.json测试集合：smoke、room-governor以及九个Node测试文件（remote-mining、work-position、storage-reservation、goal-plan、scout-movement、route-occupancy、recon-trial-model、recon-trial-runtime、remote-danger-evidence）。
5. 用bundled Node运行仅构建，子进程移除DEST/ROLLUP_WATCH，明确没有上传；不调用push/watch或创建临时部署凭据。
6. 检查工作区/暂存diff及维护者检查，保存中文交付。用户当前未授权子代理review，不能因旧任务曾授权过就自动新增一次。

全量测试和构建通过不等于线上费用、unknown或新危险留存已验收。提交、推送、部署、下一轮有限侦察均不包含在本计划中；侦察、实际采运与Goal/Plan保持关闭。
