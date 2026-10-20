# 侦察会话结算隔离分批实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 `superpowers:executing-plans` 由主代理逐批执行；只有用户另行选择子代理方式时才使用对应技能。每步以复选框跟踪，不因计划或历史授权自动派生子代理。

**Goal:** 修复结算费用、unknown和时间戳跨会话串用，使结算由事件后的本会话状态与可信回执产生，保持实际账本和守卫安全边界。
**Architecture:** Facts只采集有来源的费用证据；相邻的纯结算模块负责验证、归约及保守回退，Model作为唯一写入者在事件推进后应用。绑定和摘要存于本会话Memory，Service仅增加与既有观测依赖一致的故障注入接口，不改变动作顺序或实际计费。
**Tech Stack:** JavaScript ESM、Node内置node:test、现有Screeps fixture、Rollup。
**Spec:** [已批准的修复设计](../specs/2026-10-20-recon-settlement-isolation-design.md)；[已批准的R01—R22回归矩阵](2026-10-20-recon-settlement-isolation-regression.md)。

## Global Constraints

- 侦察、实际采运、Goal/Plan保持关闭；Governor shadow=true、scheduler.enforce=false、market=false。本计划执行不联网、不发console、不写在线Memory。
- guard schemaVersion=1；保留300 ticks/20分钟、最多一名scout、100连续安全ticks、原request/leg期限、下一tick关闭确认与既有安全返程。
- 新会话0/0；未决调用null/50；本会话可信费用50/0。明确未调用/失败且无可信支出为0/0；真实已确认费用不得被坏输入冲成0。
- 完整identity固定为trialId、sequence、remoteId、epoch、codeVersion；request/name绑定不得缺失后擅自补成“匹配”。
- 不修改RemoteMiningLedger、SpawnService真实费用算法，不清空grant/receipt、不退款未知claim、不按operation累计费用冒充本轮费用。
- 只修改本地实现/测试及职责文档；每批留本地检查点，不执行git add/commit/push、部署或重开侦察。已有未跟踪文件和历史证据全部保留。dry build生成的新dist版本只属于本地，不能据此判断服务器版本变化。
- 用户已认可五批计划并授权主代理逐批实现＋一次只读独立review；本轮本地实施完成，不含提交/发布。具体结果见配套本地交付报告。

## Review Focus

1. 相同50/0数值却属于不同identity/request，不能因数值相同继续信任旧缓存：P1的 `settle_p1_equal_amount_wrong_binding`。
2. 同tick事件推进后旧0/0事实不能盖住call_started的null/50，重试名字改变也不能让旧回执变成本次确认：P2的入口快照及旧名字反例。
3. receipt正常过期不能清掉本会话已确认费用，但同样缺receipt的未决调用不能被当作已结：P3的TTL双分支。
4. JSON重载后fixture必须引用新Memory，不能以旧raw闭包或global里的绑定通过测试：P4的 `settle_p4_restore_uses_current_memory`。
5. 绑定损坏或结算helper抛错不能使模型提前返回而跳过关停effects：P4的 `settle_p4_reducer_fault_does_not_block_close`。

## 工作区、证据与文件职责

复用 `C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium`，分支codex/single-remote-mining，编写时HEAD为055b1201c34704cf3ffa6f04e60b76202607b969。实施前重新读取HEAD/status及src、services、tests的AGENTS.md，不切回主目录或清理工作区。

已有证据：`.superpowers/sdd/2026-10-20-recon-settlement-diagnosis/`。104/104是诊断阶段现有model/runtime基线；六个诊断RED来自复现JSON，不能直接当成最终回归。实施日志另存 `.superpowers/sdd/2026-10-20-recon-settlement-isolation/`，含progress.md及每批RED/GREEN日志，不覆盖诊断文件。

| 文件 | 责任 |
| --- | --- |
| 新增src/services/RemoteReconTrialSettlement.js | 小型纯结算模块，身份/回执校验、事件后归约、绑定、只读状态和保守回退 |
| 修改src/services/RemoteReconTrialFacts.js | 只读settlementEvidence，删除无身份的facts.settlement |
| 修改src/services/RemoteReconTrialModel.js | 新会话初始化、事件后唯一写入、独立辅助计算隔离、只读摘要 |
| 修改src/services/RemoteReconTrialService.js | 将可选settlementReducer注入两个模型调用入口，默认行为走纯模块 |
| 修改src/tests/recon-trial-model.cjs | P1/P2/P3纯模型与来源反例 |
| 修改src/tests/recon-trial-runtime.cjs | P2—P4真实费用/unknown/关停/恢复与metrics链 |
| 修改src/tests/helpers/recon-trial-fixture.cjs | 仅补本地双会话场景所需的最小工具；继续使用guardOptions与restoreMemory |
| 修改src/services/AGENTS.md、src/tests/AGENTS.md | P5记录职责和回归入口；无需新增测试入口或改package.json |
| 新增docs/superpowers/evidence/2026-10-20-recon-settlement-isolation-local-validation.md | P5记录实际RED/GREEN、检查和未验收项 |

main/P0调度、策略、危险ledger、通用remote fixture与真实账本为只读参考。EmpireMetrics既有reconTrial出口优先复用，用生产出口回归证明，无需新增导出通道。

## 固定接口与判定顺序

以下签名属于计划，不在本轮创建实现：

- `createReconTrialSettlement(identity, tick) -> SettlementResult`：仅供新接纳初始化，返回0/0、本轮tick和schemaVersion=1的独立绑定。
- `reduceReconTrialSettlement(session, evidence, clock) -> SettlementResult`：session是事件推进后的会话；只读输入，无Memory/Game/账本写入。
- `fallbackReconTrialSettlement(session, clock) -> SettlementResult`：完全忽略外部evidence；保留完整本会话绑定的确认，否则按本会话调用状态保守归约；旧终态兼容规则同P3。
- `reconTrialSettlementSourceStatus(session) -> 'scoped'|'legacy_unverified'|'invalid_evidence'`：总函数，只读、无副作用；不参与许可。
- `SettlementResult={settlement, binding, sourceStatus, changed}`；settlement保留三个既有公开字段，binding写入session.settlementBinding。changed仅表示金额或绑定变化，false时不重复写这两项或刷新updatedAtTick；新会话或实际金额/来源绑定变更才更新tick。新会话的诊断sourceStatus可独立保存在可选session.settlementSourceStatus，摘要读取时再验证绑定；诊断标签变化不刷新费用时间。缺绑定的旧终态只读推导legacy_unverified，不为此新增历史字段。
- `SettlementEvidence={identity, requestId, receipt}`；无current时为null。receipt为普通值快照 `{requestId,name,remoteId,epoch,cost,tick}`，requestId取预算lookup键；缺receipt为null。不能将旧current的证据标成新request身份。
- Model的 `advanceReconTrial(input,event,facts,clock,settlementReducer=reduceReconTrialSettlement)` 仅增加第五个可选测试依赖；原四参数调用兼容。Service构造器增加同名选项，默认值相同，并在advance/closeManagedScope两条路径传递；不得将其变成战略配置。

判定：先识别旧终态兼容，再验证本会话已有确认绑定及新证据；有效确认不可被坏输入降为0。否则以post-event调用状态产生0/0或null/50。receipt语义校验集中在纯模块，Facts保留原始坏字段供反例验证；校验完整identity、lookup request、name、数值50及 `max(startedAtTick,callTick若存在) <= receipt.tick <= clock.tick`。迟到费用不受原expiresAtTick上限限制，不要求receipt.tick等于callTick。

### P1：纯结算归约与来源边界

**Files:** 新增RemoteReconTrialSettlement.js；测试recon-trial-model.cjs。
**Interfaces:** 产生上述四个纯接口；P2消费SettlementResult及SettlementEvidence。

- [x] Step 1：记录实施前HEAD/status和现有104项基线，保存baseline.log；不把诊断旧日志作为本次执行结果。
- [x] Step 2：补 `settle_p1_init`、`settle_p1_post_event_states`、`settle_p1_identity_mismatch_*`、`settle_p1_receipt_*`、`settle_p1_equal_amount_wrong_binding`。五个identity字段逐项参数化，receipt覆盖错request/name、49及字符串50、非整数/早于开始/早于call/未来tick，另加合法迟到正例。测试仅模拟单个会话数据；不能复制被测归约算法。
- [x] Step 3：运行P1命名筛选，保存p1-red.log；预期新模块缺失的初始RED，模块可加载后还须确认数值/来源反例确实失败，不以加载失败代替行为RED。
- [x] Step 4：实现纯接口基础规则，不接入生产链；输入深拷贝前后不变，不读取全局Memory、Game或累计ledger。
- [x] Step 5：同命令保存p1-green.log，P1全部通过，再跑原model/runtime集合确认未接入时没有回归；在progress.md记录实际用例名和退出码，仅保存本地检查点。

P1固定断言示意，变量由本批fixture建立：

```js
assert.deepEqual(initial.settlement, { confirmedCost: 0, unknownUpperBound: 0, updatedAtTick: 313 });
assert.equal(postCall.settlement.confirmedCost, null);
assert.equal(postCall.settlement.unknownUpperBound, 50);
assert.deepEqual(afterWrongEvidence.settlement, beforeWrongEvidence.settlement);
assert.deepEqual(afterWrongEvidence.binding, beforeWrongEvidence.binding);
assert.equal(afterWrongEvidence.sourceStatus, 'invalid_evidence');
```

后面三条针对已有可信本会话确认遇到坏新证据：费用/绑定保留，诊断标明问题；没有可信缓存的未决调用应为null/50，不能因evidence不匹配保留外来50/0。覆盖R05—R08及R21纯边界。

### P2：接入新会话与事件后的真实生产链

**Files:** Facts.js、Model.js、recon-trial-model.cjs、recon-trial-runtime.cjs；fixture按需补场景工具。
**Interfaces:** Facts产出settlementEvidence；makeSession使用P1初始化；Model在所有spawn事件/终态补回执处理之后归约，删除旧facts.settlement复制。

- [x] Step 1：把诊断场景转为实时生产函数回归，命名 `settle_p2_new_session_starts_zero`、`settle_p2_prior_paid_new_failed`、`settle_p2_prior_paid_new_unknown`、`settle_p2_old_unknown_blocks_new_start`、`settle_p2_call_entry_is_unknown`、`settle_p2_retry_name_rejects_old_receipt`。
- [x] Step 2：双会话场景让A真实支付并关闭，模拟旧实体退出，等原冷却结束，再prepare第二个唯一id/sequence。不得删预算receipt或执行claim来绕过门槛。B未调用断言在模型接纳边界或引擎入口以前采样；不能等完整tick已成功支付后再要求0/0。
- [x] Step 3：跑P2并保存p2-red.log，预期跨会话confirmed或unknown数值错误、引擎入口仍0/0。旧实际unknown未结时应保持拒绝新接纳，作为必须继续通过的保护断言。
- [x] Step 4：实现只读Facts快照与Model接入；仅对完整匹配本会话的证据确认费用。新会话初始化与post-event归约生效；不保留无身份字段作为兼容回退，不改ledger。
- [x] Step 5：p2-green.log确认P2与P1通过，再跑全部model/runtime；断言previous、outcome、原request/leg期限及实际调用次数，保存本地检查点。

关键期望：

```js
assert.equal(second.settlement.confirmedCost, 0); // A paid 50, B known failure
assert.equal(second.settlement.unknownUpperBound, 0);
assert.equal(unknownSecond.settlement.confirmedCost, null);
assert.equal(unknownSecond.settlement.unknownUpperBound, 50);
assert.equal(actualLedger.spawnEnergyUnknownUpperBound, 50);
assert.equal(ownedGrant.executing, true);
```

在真实spawnCreep入口仅采集快照后抛注入错误，验收assert放在调用外层，防止被catch吞掉而假绿。覆盖R01—R04、R10—R11、R15及名字切换。

### P3：同会话留存、旧记录兼容与只读出口

**Files:** 纯结算模块、Model摘要、两个测试文件；EmpireMetrics只读参考。
**Interfaces:** P1绑定记录与sourceStatus；摘要沿用summarizeReconTrial→global.RemoteReconTrial→既有EmpireMetrics。

- [x] Step 1：补 `settle_p3_confirmed_survives_receipt_prune`、`settle_p3_unknown_does_not_expire_to_zero`、`settle_p3_late_own_receipt_keeps_outcome`、`settle_p3_old_terminal_is_legacy_unverified`、`settle_p3_metrics_does_not_refresh_settlement`。
- [x] Step 2：保存p3-red.log；sourceStatus尚无出口、旧终态绑定缺失及时间/留存边界应有对应行为RED。receipt确实越过1050tick保留窗口，不能只手工设undefined冒充自然裁剪。
- [x] Step 3：完善缓存确认绑定、updatedAtTick稳定性与旧终态分支。旧终态缺绑定保留原始settlement值，标legacy_unverified；本会话旧unknown遇首次合法迟到receipt可变为50/0，不改outcome或关闭时间。previous不受新facts更新。
- [x] Step 4：在只读摘要增加settlementSourceStatus；重复导出及telemetry刷新不改变金额、绑定、费用时间；telemetry关闭不关闭守卫。
- [x] Step 5：保存p3-green.log，P1—P3及原有同会话receipt过期/迟到结算测试全部通过，留本地检查点。

固定断言：同会话确认值50/0及原updatedAtTick在receipt裁剪后保持；late receipt的本次结算tick可更新，但 `assert.deepEqual(after.outcome, frozenOutcome)` 必须成立。覆盖R09、R12—R15、R18、R22。

### P4：重置、未知claim与诊断故障隔离

**Files:** 纯结算模块、Model、Service、fixture、runtime测试。
**Interfaces:** 第五个settlementReducer及Service同名构造选项；fixture现有guardOptions转发，不新增在线配置。

- [x] Step 1：补 `settle_p4_restore_uses_current_memory`，在有绑定确认和有未知claim两种状态执行restoreMemory：真实JSON往返、重绑creep.memory、重建服务；加入序列化后修改新Memory的本轮证据/配置、旧引用不变的反例。
- [x] Step 2：补 `settle_p4_reset_before_native`、`settle_p4_reset_after_native`、`settle_p4_reset_after_ledger`。期望无ledger确认的未知为null/50并保留claim，已有真实receipt为50/0；每轮最多一个成功scout，总期限/request/leg期限均不变。
- [x] Step 3：补 `settle_p4_reducer_fault_does_not_block_close`，guardOptions注入抛错的settlementReducer；另参数化缺binding、数组、未知schema、外来identity、未来confirmedReceiptTick等持久坏数据。新会话不能盲信50，旧终态不能被强制迁移。
- [x] Step 4：保存p4-red.log，确认是重置后来源/金额/关停断言失败；然后仅隔离结算helper的调用，失败时用fallbackReconTrialSettlement保守结果。Service所有直接advanceReconTrial调用都转发同一注入依赖，不能只测到一条路径。
- [x] Step 5：外层断言关停效果已应用、下一tick确认、spawn/outbound拒绝，冻结outcome不改；真实grant/receipt和其他scope预算未动。不把坏结算字段加入全局stateValid使其提前返回。
- [x] Step 6：保存p4-green.log，运行P1—P4、既有model/runtime、remote-mining与remote-danger-evidence相关测试；检查真实账本和注入故障出口，留本地检查点。

覆盖R03—R04、R16—R21。摘要例外只能影响诊断，不允许吞掉真实控制异常；不全局替换Date.now，不主动触发生产reset。

### P5：完整验证与本地交付

**Files:** 职责文档及本地验证报告；不再扩大业务范围。
**Interfaces:** P1—P4全部GREEN和R01—R22逐项证据。

- [x] Step 1：将矩阵R01—R22逐项映射到正式用例名与日志；查漏本轮wrong binding、调用入口、TTL、恢复和关停反例。诊断静态JSON断言不得作为最终覆盖。
- [x] Step 2：更新services/tests的AGENTS职责说明，说明settlementEvidence/Binding/SourceStatus不授权任何动作，登记实际测试入口，不添加自动启动/迁移指令。
- [x] Step 3：执行完整package.json测试集合，smoke、room-governor及全部Node测试均退出0；最终不允许跳过/取消，记录实际总数，不沿用旧104或历史387。
- [x] Step 4：运行仅构建，要求输出“未指定目标，代码将被编译但不会上传”；子进程环境移除DEST与ROLLUP_WATCH，不生成临时.secret，不上传dist。
- [x] Step 5：维护者检查：无残留facts.settlement无身份写入，无重复计费/主动清账/旧值重贴新身份，无把结算诊断当许可，无异常吞掉控制。核对改动与批准范围，运行工作区与暂存diff检查。
- [x] Step 6：保存中文本地报告和progress.md，分开写RED→GREEN、全量测试、dry build及线上未验收项；保留全部历史文件，不暂存、提交、推送或部署。

## 统一命令与日志要求

以下命令已在本轮本地验证使用，实际日志及退出码见交付报告：

```powershell
$node = 'C:/Users/mts-2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
# 将p1换为当前批号；筛选时其他用例跳过不算覆盖。
& $node --test --test-name-pattern='^settle_p1_' src/tests/recon-trial-model.cjs src/tests/recon-trial-runtime.cjs
# 每批组合检查
& $node --test src/tests/recon-trial-model.cjs src/tests/recon-trial-runtime.cjs
# P5完整集合；逐条检查退出码
& $node src/tests/smoke.cjs
& $node src/tests/room-governor.cjs
& $node --test src/tests/remote-mining.cjs src/tests/work-position.cjs src/tests/storage-reservation.cjs src/tests/goal-plan.cjs src/tests/scout-movement.cjs src/tests/route-occupancy.cjs src/tests/recon-trial-model.cjs src/tests/recon-trial-runtime.cjs src/tests/remote-danger-evidence.cjs
# 仅构建；环境变化仅在子进程，不修改共享配置
& $node -e 'const {spawnSync}=require("node:child_process"); const env={...process.env}; delete env.DEST; delete env.ROLLUP_WATCH; const r=spawnSync(process.execPath,["node_modules/rollup/dist/bin/rollup","-c"],{env,stdio:"inherit",windowsHide:true}); if(r.error)throw r.error; process.exit(r.status??1);'
git diff --check
git diff --cached --check
```

每次测试/构建重定向至本计划目录后，立即保存LASTEXITCODE再读日志，防止日志读取覆盖退出状态。RED须是已证实缺陷对应的断言失败；保护性新增用例可先GREEN，不为制造RED故意破坏实现。GREEN须退出0且目标命名用例全部运行。每批本地检查点只记文件、断言、退出码及未覆盖项，不执行技能模板中的commit步骤。

## 交付与执行方式

这五批有顺序依赖，推荐主代理逐批实施。跨会话费用、持久绑定和关停异常的独立只读review有明确价值；若用户选择增加一次，则在完整验证后进行，只审差异和批准的设计、不改代码或操作线上。用户随后已明确授权该一次review；已完成并处理一项Minor，未追加第二轮review。

用户已审阅认可计划与执行方式，本轮五批及一次review完成。发布授权仍独立；本地GREEN不代表线上费用/unknown、新危险捕获、实际采运或10000tick验收通过。交付报告：../evidence/2026-10-20-recon-settlement-isolation-local-validation.md。
