# 侦察会话结算隔离：本地实施与验证

日期：2026-10-20。五批本地实现、完整验证与一次独立只读review已完成；已核实并修复一项Minor反馈，修复后再次完成全量验证。

工作区：`C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium`，分支codex/single-remote-mining，HEAD仍055b1201c34704cf3ffa6f04e60b76202607b969。未暂存、提交、推送、部署或操作线上；主目录及历史未跟踪文档保留。

## 结果与边界

- 新增RemoteReconTrialSettlement纯模块；Facts仅采集完整identity/request/receipt快照，Model在事件推进后独立初始化和归约费用。旧confirmed/unknown事实不能写到新会话。
- 新会话未调用或明确失败为0/0；call_started立即为null/50，先于原生引擎调用；本会话匹配receipt才能新确认50/0。
- 确认绑定写在本会话Memory，回执自然裁剪后仍保留已验证费用；本会话迟到回执可解unknown，不改冻结outcome及原期限。旧终态缺绑定保持原值、标legacy_unverified，不自动迁移。
- 共享校验同时用于spawnReceipt读取，防止先采纳错误name/tick再绕过费用绑定。结算故障仅进入保守回退，控制effects继续应用；真实ledger、执行grant、费用累计不由摘要代码修改。
- 未修改真实账本、SpawnService、P0顺序、策略、默认配置或危险留存模块。settlementEvidence/Binding/SourceStatus均不授权动作。
- fixtures内的侦察与Memory都是本地模拟；本轮没有发生产console或读取/写入在线Memory。侦察、实际采运和Goal/Plan保持原关闭约束，不把上轮在线状态称为本轮重新回读确认。
- 本轮dry build生成新的本地dist版本，未上传；不能拿它与旧线上产物不匹配当作版本异常。

## RED→GREEN

证据目录：`.superpowers/sdd/2026-10-20-recon-settlement-isolation/`；progress.md保留执行与裁定。

| 批次 | RED与保护基线 | GREEN |
| --- | --- | --- |
| P1纯模块 | 模块缺失初始RED；模块可加载后24项中17项行为失败、7项基础通过 | 与原守卫组合128/128 |
| P2生产链 | 旧50/0进入B、入口unknown滞后、无身份字段等失败；一项拒绝原因断言按真实stopping状态修正 | 134/134 |
| P3留存/兼容/摘要 | 3项来源状态出口失败、3项保护场景先通过 | 140/140 |
| P4恢复/异常 | 3项未来证明/注入入口失败、9项恢复保护先通过 | guard/remote-mining/danger相关277/277 |
| 补充覆盖 | 旧unknown纯输入、同tick只读、telemetry关闭、外部预算隔离均为保护验证 | 守卫组合156/156 |
| review反馈 | 迟到确认后的矛盾失败事件、首次可信回执与失败状态冲突，2项标签断言RED | 两项GREEN2/2；全量441/441 |

R01—R22对应的正式用例均实时运行生产模块，不再依赖诊断JSON读值作为回归结果。

| 矩阵 | 正式覆盖 |
| --- | --- |
| R01/R02 | settle_p2_new_session_starts_zero / prior_paid_new_failed |
| R03/R04 | settle_p2_prior_paid_new_unknown / old_unknown_blocks_new_start；settle_p4_unknown_fault_never_refunds_execution |
| R05 | settle_p2_old_unknown_fact_cannot_enter_new_admission（明确为纯模型恶意旧事实反例，不冒充实际绕过旧grant） |
| R06 | settle_p1_identity_mismatch_*，五字段逐项 |
| R07/R08 | settle_p1_receipt_reject_*；settle_p2_retry_name_rejects_old_receipt |
| R09 | settle_p1_receipt_late_valid_and_bad_input_preserves_proven_cost；settle_p3_late_own_receipt_keeps_outcome |
| R10/R11 | settle_p2_call_entry_is_unknown；settle_p1_post_event_states_*；既有trial_spawn_intake_revoked_before_run |
| R12/R13 | settle_p3_same_tick_repeated_export_is_readonly / metrics_does_not_refresh_settlement / confirmed_survives_receipt_prune / unknown_does_not_expire_to_zero |
| R14/R15 | settle_p3_late_own_receipt_keeps_outcome / legacy_unknown_accepts_only_own_late_receipt；settle_p2新会话与旧事实反例、settle_p4_foreign_budget_and_previous_are_untouched |
| R16/R17 | settle_p4_reset_before_native / after_native / after_ledger / restore_uses_current_memory |
| R18/R19 | settle_p3_old_terminal_is_legacy_unverified；settle_p4_invalid_proof_* / reducer_fault_does_not_block_close_* |
| R20 | 原有trial_absolute_deadlines_do_not_restart、配置/身份/安全/撤权/返程测试；故障测试再次断言次tick关闭和许可 |
| R21/R22 | settle_p4_foreign_budget_and_previous_are_untouched、五字段错配；settle_p3_telemetry_off_keeps_owned_unknown / metrics_does_not_refresh_settlement |

## 完整验证

使用bundled Node，执行与package.json相同的完整命令集合；没有声称调用npm CLI：

- smoke passed。
- room governor passed。
- review前全量439/439；反馈修复后最终Node测试441/441，失败、取消、跳过均0；较原基线387新增54项。
- dry build退出0，明确输出“未指定目标，代码将被编译但不会上传”。子进程移除DEST/ROLLUP_WATCH，未创建临时.secret或修改共享环境。
- 工作区与暂存diff格式检查通过；LF/CRLF提示是既有autocrlf行为，不是失败。

review前日志：final-smoke.log、final-governor.log、final-node.log、final-build.log。修复后最终日志：post-review-smoke.log、post-review-governor.log、post-review-node.log、post-review-build.log。两轮均实际执行完整集合；最终441/441不是从局部结果推算。

## 实施裁定

- Windows使用PowerShell/Node执行plan-scoped ledger；没有使用不可用的Git Bash脚本，也没有执行技能模板中的提交或清理步骤。
- 旧unknown执行未结时可能仍为stopping，拒绝理由可为trial_in_progress或existing_scope；测试只要求拒绝B与保留claim，不改变原控制生命周期迎合固定字符串。
- receipt校验在Facts的spawnReceipt出口复用同一纯模块，否则坏name可能先被采纳再影响费用检查；不修改实际收费接口。
- 只读来源状态函数增加可选clock，保证未来确认被识别，同时允许停止后的合法迟到结算；单参数调用仍兼容。
- 故障依赖同时经过Service.advance与closeManagedScope，只包围结算辅助计算及其应用，不吞掉控制异常。

## 独立只读review

按用户授权仅进行一次，reviewer未修改文件/index/HEAD或操作网络/线上/凭据，未派生其他代理。未发现Critical/Important，发现一项Minor；独立重跑两套守卫156/156，另核对10类持久诊断损坏时的关停，均通过。全量439/439日志由reviewer核对，未冒充其独立运行。

Minor：unknown终态收到本会话合法迟到receipt确认50后，又通过recordReconTrialSpawn接到矛盾ERR_BUSY结果，费用和关停正确但来源仍显示scoped。主代理用真实API与纯函数两个反例核实，均先失败（review-red.log）；窄修复保留50/0、绑定、原时间和outcome，标invalid_evidence，两项GREEN（review-green.log）。之后全量441/441和dry build重新通过，没有请求第二轮review。

请求、原结论与处理保存在review-request.md、review-result.md。review排除线上/长窗口验收和无关历史文档，不存在以未覆盖场景冒充通过。

## 未验收项

本轮是本地修复。旧在线记录不自动改写，新功能尚未发布；线上跨会话结算、实际侦察复试、新危险捕获及重置、实际采运、收入确认和10000tick验收均不由上述GREEN替代。发布及任何后续试点需另行授权。
