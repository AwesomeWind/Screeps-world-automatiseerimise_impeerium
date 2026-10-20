# 远程危险情报留存回归计划

日期：2026-10-20。状态：用户已认可并授权主代理分批实施及一次独立只读review，已完成本地验证与反馈修复。完整结果见`docs/superpowers/evidence/2026-10-20-remote-danger-evidence-local-validation.md`；未提交或部署。

设计依据：`docs/superpowers/specs/2026-10-20-remote-danger-evidence-design.md`。设计中的身份、2条/10actor/50part/100字符/12000与25000长度上限、CPU policy及安全约束以该文为准。

## 一、验证原则与文件归属

主代理逐批实施是后续候选执行方式；本计划不授权子代理。设计认可后另编实施任务，不自动提交、推送、部署或启动线上试点。

沿用Node内置node:test与现有fixture：

- 新纯回归建议放`src/tests/remote-danger-evidence.cjs`，针对Model及有注入接口的适配器。
- 生产调用链回归放`src/tests/recon-trial-runtime.cjs`，扩展`src/tests/helpers/recon-trial-fixture.cjs`的recorder/CPU注入。继承真实RemoteMining、Bureau、Spawn、Strategy、ActionParser，不用替代控制链的假guard证明关停。
- 现有`recon-trial-model.cjs`用于守卫schema、期限、费用和重放语义的兼容回归。
- 实现时才把新文件加入package.json的npm test入口，并按实际新增合约维护模块说明；本轮不改这些文件。

每批：写失败断言 → 针对原实现运行并记录预期RED → 最小实现 → GREEN。导入不存在可作为新纯模块初始RED，关键“不妨碍关停”必须另外有完整生产链故障注入RED。fixture使用W1N1/W1N2等测试房间，不依赖W48N41、真实凭据或联网。

## 二、批次与断言

### R1：事故身份、字段事实与容量

| 用例建议名 | 必须断言 |
| --- | --- |
| danger_record_has_full_stop_identity | trialId/sequence/remoteId/epoch/codeVersion/stopTick/reason全量绑定，remote与home危险的observedRoom正确 |
| danger_actor_fields_are_observed_not_inferred | 保存真实id/name/owner/pos；缺owner时null，不从controller.sign、source计数推断NPC或玩家 |
| danger_active_parts_exclude_destroyed_parts | hits=0不计数；部件缺失/异常显示unknown或partial，未知不写0；不输出完整body |
| danger_capture_is_json_data_only | 对输出做JSON往返相等；无Game对象、函数、循环、非有限数和BigInt |
| danger_records_respect_all_limits | actor=0/1/10/11、大body=50/51、长文本和控制字符，分别检查截断标记与长度硬上限 |
| danger_ledger_keeps_latest_two_incidents | 第三次合法新事故只替换最旧条目；无危险新会话不轮换，跨scope完整身份不混淆 |
| danger_record_unknown_schema_is_non_destructive | 未知schema/非法records保持原值，返回失败码；不创建可用证据，不影响其他存储 |

对字符上限检查UTF-16代码单元，分别覆盖多字节字符及JSON转义字符；不要只测ASCII长度。超限删actor最多10次，未知原始存储不整树stringify。

### R2：同tick尽力采集及失败状态

| 用例建议名 | 必须断言 |
| --- | --- |
| danger_pending_claim_prevents_duplicate_capture | 同tick多次analyze/run/cleanup只触发一次actor reader；已有pending调用不重新采集 |
| danger_owner_or_body_getter_throw_is_partial | getter抛错仅丢失该字段；其他已读对象可保存；固定原因码而非原始错误字符串 |
| danger_actor_reader_throw_is_failed | reader抛错后状态failed；read次数1，未循环重试 |
| danger_not_visible_is_not_zero_hostiles | visibility=not_visible，count=null；旧payload或空列表不能伪装当前safe |
| danger_empty_second_read_keeps_original_detection | detection仍为真、原stopReason不变；partial/count_conflict，不能把危险改成成功 |
| danger_final_write_failure_keeps_pending_or_failure | 正常两次写；注入最终写失败时最多加一次失败标记写；再失败仍不读下一tick新对象 |
| danger_store_unwritable_skips_actor_reads | pending写失败时详细读取0次；global失败码可读，不承诺不存在的持久结果 |
| danger_cpu_policy_limits_optional_work | remaining<5跳过；actor边界elapsed>=2不开始下一actor，保留partial；允许当前有界actor结束时越过阈值；两阈值取policy，无需关停逻辑读取它们 |
| danger_bad_cpu_or_policy_does_not_enable_anything | 缺失/异常CPU、非法显式policy只影响记录结果，不改变策略开关、期限、预算 |

CPU fixture注入确定的getUsed序列，不用真实机器耗时作为测试阈值，不覆盖全局Date.now。为collector设置人工预算，与Spawn/ActionParser调用计数独立。

### R3：生产关停链故障注入（首要验收）

先启动fixture中的合法单名scout，给它既有outbound MOVE_TO任务；在下一tick加入远房非己方单位。对正常记录及下列失败逐项运行同样场景：recorder入口抛错、字段getter抛错、标准化错误、pending写失败、最终提交失败、未知ledger schema、摘要读取抛错、CPU不足。

建议用例族`danger_record_failure_never_delays_shutdown_<fault>`；每项必须同时断言：

1. 在recorder被调用前，scope enabled=false/hold=true，operation/guard出发和孵化许可已false，原outbound任务已撤销；recorder内部直接读取并检查这些状态，以证明执行顺序。
2. 首次outcome.reason=danger，decidedAtTick为当前tick。两种记录结果不改变guard身份、原expiresAtTick/expiresAtMs或leg.startedAt/expiresAt。
3. 下一步真实Spawn.run/ActionParser没有额外spawnCreep或向危险房出发/继续侦察的move。只断言actor.memory.task被清空不足以证明安全；远房actor已有合法安全返程可执行，不能把所有move都断言为0。
4. 原非executing请求取消与executing/unknown费用保护保持不变；其他scope记录不误删。
5. 本tickrunTick不会因新增观测异常退出；下一tickclosureVerifiedAtTick>closeAppliedAtTick，状态aborted；不存在第二个start/替换scout。
6. Goal/Plan、Governor、scheduler、market、roleLimits、预算均维持fixture预设值；记录功能不能纠正或接管其他人工开关。

另外覆盖`danger_capture_home_reason_uses_home_room`、`danger_hook_skipped_for_other_stop_causes`和`danger_guard_still_closes_when_remote_p2_skipped`。P0关闭不能依赖P2或metrics.cleanup；home_danger不读取远房冒充母房对象。

### R4：跨tick、序列化、重置与冻结

| 用例建议名 | 必须断言 |
| --- | --- |
| danger_success_survives_memory_roundtrip_and_reset | 保存后深拷贝快照，Memory JSON往返、重新关联creep.memory、resetRuntime；字段逐项完全相同、无再次采集 |
| danger_pending_reset_is_interrupted_not_backfilled | pending已提交后中断；下一tick提供不同敌人并重建global，只读effectiveStatus=interrupted且rawCaptureStatus=pending，原始Memory逐项不变、没有额外写入，新敌人不进入旧记录 |
| danger_committed_terminal_record_survives_global_reset | 快照成功、尚未次tick确认关闭时重置；仍关闭、快照不丢、不重试，次tick完成确认 |
| danger_terminal_result_is_not_overwritten | 后续无视野、看见不同人、同请求重放、迟到费用回执，都不改变终局危险对象或原因 |
| danger_legacy_aborted_trial_reports_not_recorded | 只有旧guard outcome/坐标，没有ledger时不造namespace、不读当前敌人补旧案、不改变guard schema |
| danger_schema_corruption_does_not_poison_guard | 仅独立ledger损坏时guard许可计算与关闭确认照常；读取摘要不抛错或擦除损坏值 |
| danger_new_incident_does_not_relabel_old_identity | 新epoch/版本/sequence事故独立保留；最多两条，读current/previous按完整身份join |

重置模拟必须同时覆盖真实fixture.resetRuntime和Memory JSON序列化，不只执行一次纯函数。硬CPU终止且引擎未提交Memory、外部清空Memory不能作为“保证恢复”的测试；应检查文档明确该边界，而非伪造引擎行为。

### R5：默认关闭、摘要与整体兼容

| 用例建议名 | 必须断言 |
| --- | --- |
| danger_default_off_has_no_namespace_or_capture | 无托管危险历史的默认关闭tick，不创建dangerEvidence、不读敌方详细字段、无新需求/动作 |
| danger_summary_does_not_duplicate_actors | 每份摘要<=1500长度，不含actors/raw body/path/完整错误；当前和上一轮不重复详细快照 |
| danger_historical_read_never_refreshes_observation | 读取后observed/captured时间不变，age增长、stale展示正确，historical=true；不把旧hostile当当前事实 |
| danger_summary_failure_preserves_control_summary | 独立摘要抛错时已有trial状态/permit/metrics控制摘要仍可读，未新建启动授权 |
| danger_snapshot_never_authorizes_economy | 即使captured且敌人无武装、known owner，原danger仍停止，scout/经济配额和Goal/Plan不变 |

## 三、后续实现时的验证命令

先定向新测试，再跑既有守卫与相关远程链：

```text
node --test src/tests/remote-danger-evidence.cjs
node --test src/tests/recon-trial-runtime.cjs src/tests/recon-trial-model.cjs
node --test src/tests/remote-mining.cjs src/tests/scout-movement.cjs src/tests/route-occupancy.cjs
npm test
```

实现完成后只做dry build：先确认本命令环境没有DEST、ROLLUP_WATCH及临时.secret，使用bundled Node运行Rollup；仅在子进程环境移除DEST/ROLLUP_WATCH，不修改共享环境变量。依据当前rollup.config.js，未指定DEST才不会上传：

```text
node node_modules/rollup/dist/bin/rollup -c
git diff --check
git diff --cached --check
```

Windows执行以现有bundled Node绝对路径为准，未来实际命令与退出码另记交付证据。smoke和room-governor已经包含在npm test，完整通过后不无故重复运行。baseline先按实际HEAD确认，不把历史330/330或构建结果当成今天的验证结果。

## 四、交付与未覆盖项

- 记录每批RED的具体失败断言及GREEN命令、最终测试数和build退出码；维护者检查确认控制链没有被新try/catch吞错，独立存储不会混入许可schema。
- 本地完整GREEN不代表线上已有新快照，也不能恢复2026-10-19那次缺失身份。
- 后续提交/发布与有限侦察仍分别需要用户明确授权。在线观察如另获授权，只读检查新版本/default-off，再由批准的单次守卫试点覆盖自然危险；不人为制造敌情或堵路来凑覆盖。
- 本验证计划已用于后续获授权的本地实施，现有证据和worktree保留。侦察、实际采运、Goal/Plan保持关闭约束；没有读取或修改线上来推进本功能。
