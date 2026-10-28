# 母房自然采集首次接纳诊断 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. 未经用户选择不调用子代理；六批本地实施已完成；独立只读review及一次修复已完成，保留一项Minor，未联网/提交/部署。

**Goal:** 让未接纳的自然采集尝试也能保留有界首因，在已有证据可用时由一次HTTP下载区分配置应用、尝试留痕、正式接纳与首行生成。

**Architecture:** 新写入采用同一路径的Store v2，把admission回执与可空window分开；原请求协议、窗口内容和安全许可不变。Facts返回有界诊断，Service在原锚点先确认reserved，再检查gate/selection并提交正式窗口；Report与HTTP严格分派v1/v2，不把诊断回执当作采集成功。持久化故障及CPU不足只停止观察，不影响原P0业务关闭。

**Tech Stack:** JavaScript ES modules，Node内置test/assert，现有Screeps fixture、HomeEvidenceWindow四模块、HTTP Memory codec及Rollup；不新增依赖。

**Spec:** [已认可设计及回归矩阵](../specs/2026-10-27-home-evidence-admission-diagnostics-design.md)；[本地诊断证据](../evidence/2026-10-27-home-evidence-admission-diagnosis.md)。执行者必须同时读取，不把唯一线上根因视为已确定。

## Global Constraints

- 复用 `C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium`、分支 `codex/single-remote-mining`；规划基线HEAD `48dfc0e75d1b71a5101d910364b6620eb530b4e6`，实施前重新核对，禁止reset/清理既有改动。
- 本计划只授权范围描述，不授予生产权限。实施须另获认可；实施范围也仅本地，不联网、不暂存/提交/推送/部署、不开窗，不读取凭据或改网络。保持观察窗、侦察、实际采运、Goal/Plan和市场关闭，Governor shadow=true、scheduler.enforce=false；本轮不刷新线上状态。
- 原请求schemaVersion1、原10字段、profile/shard/room固定不变；只在原 `acceptNotBeforeTick` 一次接纳，晚到不补开。同一原请求的 `acceptNotAfterTick` 不延长；跨度仍≤10，零宽原请求仍只有一tick机会。
- 接纳新鲜度≤30000ms；100观察tick，`lastAllowedTick=acceptedAtTick+99`；原 `expiresAtMs<=issuedAtMs+600000`，先到即止。原起点、期限、身份、版本不因重置、CPU不足或缺行更新。
- 保持candidate200、cohort4、object16、原生日志128、保存相关事件32/行、总行100；原store总上限131072 UTF-16字符、原commitReserveChars1024；admission含其pending元数据的诊断预算≤8192，计入总上限，不额外增加容量。
- CPU策略不放宽：minBucket≥5000、reserve≥5、0<capture≤2；入口余量≥max(7,reserve+capture)，阶段增量严格<capture，当前余量≥reserve；非法配置拒绝，不回落宽松值。诊断也消耗同一阶段预算，不能另开预算绕过限制。
- 只写 `Memory.empire.observations.homeEvidence` 及原有有界运行时锁，不改业务Memory/单位任务/旧请求/旧锁/费用；不调用Game动作、start/release或prune型查询。默认关闭且无旧数据零namespace写入、零事件读取。
- pending/unknown不重放，不因新tick、新service或新ID变成可恢复工作队列。保留旧attempt、原记录和诊断回放，不补写83898135的历史。
- 已确认写入的Memory证据应跨JSON重载和模拟global重建保留；写入未确认、Memory完全不可写、硬中断或实际global reset丢失未落盘首因，必须标为未证明。局部mock不能成为真实引擎保证。
- HTTP固定原路径，仅本地codec适配；未来仍一次GET、请求15秒/总窗60秒、失败不重试，不增加WS、console、备用路径、刷新鉴权或在线execute分支。
- 读并遵守 `src/AGENTS.md`、`src/services/AGENTS.md`、`src/tests/AGENTS.md`；技能默认commit步骤由本用户限制替代为“保存本地证据，不暂存或提交”。

## Review Focus

1. reserved不是admitted：reset发生在reserved、窗口pending及首行前时，不能转成正式采集或换ID补开（批次1/3/4）。
2. 首次失败冻结后，晚到invalid_request、关闭、版本变化和后续诊断写失败不得覆盖首因，也不得篡改原时钟（批次1/4）。
3. gate细分说明不能改变原拒绝行为；旧enabled=true包络、scope引用不一致、过期评估和缺角色Memory仍保守拒绝（批次2）。
4. 为记录CPU结果再次写入，会制造递归测量与预算外工作；未观察到的final后样本必须保留null，unknown提交不能为了补诊断再写一次（批次3/4）。
5. v1旧窗与v2 rejected/window=null需要不同报告；缺失/空行不能被HTTP归为零事件或成功验收，查询不能创建数据（批次5）。

---

## 文件和接口地图

下列路径相对上述worktree。保留现有结构，只抽取有独立职责的提交适配器，不拆成多个互相循环import的schema模块。

| 路径 | 操作与职责 |
| --- | --- |
| `src/services/HomeEvidenceWindowModel.js` | 修改：v1/v2严格分派、admission纯转换、冻结首因、window关联和容量；批次1/4 |
| `src/services/HomeEvidenceWindowFacts.js` | 修改：原gate与selector不变，增加有界诊断返回接口；批次2 |
| `src/services/HomeEvidenceWindowPersistence.js` | 新建：CAS、pending/final写入与读回、预算checkpoint、有限提交结果；批次3 |
| `src/services/HomeEvidenceWindowService.js` | 修改：原锚点reserved→gate/selection→window；有界runtime latch、先停止后可选读取；批次3/4 |
| `src/services/HomeEvidenceWindowReport.js` | 修改：回执/首行状态、只读分页及v1兼容；批次5 |
| `src/tests/home-evidence-admission-model.cjs` | 新建：v2 schema/纯转换/首因/容量；批次1/4 |
| `src/tests/home-evidence-admission-facts.cjs` | 新建：gate子项/selection原因与计数；批次2 |
| `src/tests/home-evidence-admission-runtime.cjs` | 新建：提交故障、CPU、真实生命周期、跨tick/重建；批次3/4 |
| `src/tests/home-evidence-window-{model,facts,runtime,report}.cjs` | 保留并调整新写v2的精确断言；v1旧样本兼容必须保留，禁止批量改期待掩盖回归 |
| `src/tests/helpers/home-evidence-window-fixture.cjs` | 修改：显式重绑Memory与Game引用、重建服务、清运行时global的测试入口；不能用旧闭包冒充重置 |
| `.superpowers/sdd/2026-10-27-http-evidence-readonly/home-decoder.mjs`、`home-http.test.mjs` | 修改：v2回执解码和严格期待身份，固定HTTP传输不变；批次5 |
| 同目录 `artifacts.mjs`、`profile-reader.mjs` | 仅在离线输出/结果形状确有v2耦合时定向适配，旧经济profile与传输逻辑不改；批次5 |
| `package.json`、上述src AGENTS | 修改：加入三个新套件、说明最终合同；批次6 |
| `.superpowers/sdd/2026-10-27-home-evidence-admission-diagnostics/` | 新建实施工作目录：RED/GREEN日志、允许修改清单、保护hash、离线验证/隔离build，不放在线入口；批次1/6 |
| `docs/superpowers/evidence/2026-10-27-home-evidence-admission-diagnostics-local-validation.md` | 新建交付报告；批次6 |

明确不修改 `main.js` 的生命周期/异常策略、scheduler、EmpirePolicy默认值、旧远程守卫或生产运维entry/authorization/attempt。

### 跨批合同

- `HomeClock`、`HomeRequest`、原 `HomeGate`、`HomeSelection`、`HomePacket` 沿用现有形状；原gate/selection函数仍保持其严格返回键，不直接塞诊断字段使旧validator失效。
- 新增 `inspectHomeObservationGate(clock,deps={}) -> {gate,diagnostic}`、`inspectHomeEvidenceSelection(clock,deps={}) -> {selection,diagnostic}`。旧 `collectHomeObservationGate` / `selectHomeEvidenceObjects` 委托同一计算并仅返回gate/selection，避免两套许可算法。
- `GateDiagnostic` 固定键：`controlTypes,retainedRecon,retainedEconomic,nativeState,configsClosed,operationFresh,scopeIdentity,scopeClosed,homeOwned,homeSafe,homeNormal`，值仅true/false/null。汇总子项遇首个未知/失败短路，未走到的项null；不存原始对象/任意Memory。
- `SelectionDiagnostic={visited,eligibleRoles,cohortCount,objectCount,reason}`；计数非负安全整数或未观察的null，visited最多201（第201项触发拒绝），其余不超过原200/4/16限制；无role不按名字补齐。
- 新 `HomeStoreV2={schemaVersion:2,profile:'home_natural_v1',admission,window,pending?}`。window为null或原严格合法window；v2新提交的pending位于根，v1原window.pending只读兼容；拒绝同一v2同时存在两层pending。
- `HomeAdmission={request,firstSeen,stage,status,firstOutcome,gate,selection,cpu}`。request完整原副本；firstSeen为首次实际观察的`{tick,nowMs}`；status仅reserved/rejected/unknown/accepted。firstOutcome为null或冻结`{kind,reason,stage,tick,nowMs}`，kind仅rejected/unknown/accepted；accepted的reason为null。gate/selection可为null，阶段名和reason由Model导出的固定枚举校验。
- `cpu`固定七槽：`entry,afterGate,afterSelection,beforePending,afterPending,beforeFinal,afterFinal`；每槽null或`{tick,used,tickLimit,bucket,delta}`，非有限/倒退样本不可伪装为有效值。只有实际取得的样本可保存；final后样本不可能出现在该次final内容中，可留到下一次原本合法capture提交，不为补样本额外写入。
- 根pending固定`{key,kind,tick}`，kind仅reserve/reject/admit/capture/seal/diagnostic；key按原request.id、原anchor及kind组成有界字符串（≤96），不拼接无限版本或异常文本。所有pending均归属根admission.request，不能跨身份应用。
- pending可以包含候选accepted/window，但它只是未确认提交，不是正式接纳证明。报告与运行时必须先检查pending；不能因候选firstOutcome.kind=accepted而读取事件，或在重建后把pending清掉继续。unknown状态可以由持久pending保守导出，不得为写入一个unknown标签重放原提交。
- Model保留 `validHomeEvidenceStore(store)`、`advanceHomeEvidence(input,event,clock)->{store,changed,reason}`；新增事件reserve(request)、reject(reason,gateDiagnostic,selectionDiagnostic,cpu)、admit(request,selection,gate,diagnostic)、diagnostic(snapshot)。原capture/seal签名不变；原v1导出和合法样本继续可读，v1不自动迁移或捕获追加。
- `commitHomeEvidenceStore({expected,candidate,key,kind,readStore,writeStore,checkpoint}) -> {status,writeAttempted,stage}` 位于新Persistence模块；status仅committed/unchanged/conflict/unknown。Service原 `commitHomeEvidence` 可作为薄适配器保留。checkpoint接受阶段名，检查同一budget，不重新起算。
- 纯`reserve/admit`只允许原anchor，reject/diagnostic不能产生window；accepted必须同原请求、原anchor且已确认reserved，无pending。已有任何v1/v2数据均拒绝换ID，不自动清理。已reserved但跨tick只允许封存既有诊断，不能继续admit。
- 非法/晚到且没有既有回执，不创建持久namespace；运行时可显示late_seen/not_observed，但不能伪造锚点首因。诊断延后封存只使用已观察快照、原身份及原期限，不重读gate重新授权，不重放已调用的不明提交。

## 批次1：v2回执与冻结首因的纯协议

**Files:** Model；新admission-model.cjs；本地工作目录保护清单。\
**Interfaces:** 提供上面的HomeStoreV2、HomeAdmission及新增纯事件；不接入Service，旧行为暂保留。

- [x] **Step 1：写RED测试。** `v2_reserved_is_not_admitted`、`first_rejection_survives_late_invalid_request`、`admit_requires_same_anchor_reserved_identity`、`v1_remains_readable_without_migration`。断言：reserve的window===null；锚点35拒绝后的firstReason在36仍原样；无reserved或anchor+1不能admit；已有store不能换ID；旧v1序列化值不变。
- [x] **Step 2：运行RED。** `node --import <GUARD> --test src/tests/home-evidence-admission-model.cjs`。预期因缺失v2协议或错误转换FAIL；模块拼写/加载错误不能算行为RED。
- [x] **Step 3：实现纯转换。** v1校验先保留为内部严格函数，公共validator按schema分派；v2窗口仍复用原window约束，另核对request、header、原anchor、expiresAtMs完全一致；不能通过fake cohort构造“拒绝窗”。首因只由null转一次，后续事件不能覆盖。
- [x] **Step 4：补边界并GREEN。** 固定时钟测试freshness30000/+1、零宽anchor/anchor+1、原10分钟、clock倒退、额外键、数字字符串、firstOutcome/状态互相冲突；same引用未改变结果与业务投影不变。相同命令加旧model.cjs通过。
- [x] **Step 5：保存本批RED/GREEN与source hash。** 记录未接Service的中间状态，不提交，不以新协议单测宣称运行时修复。

## 批次2：gate与对象选择诊断，不改变准入逻辑

**Files:** Facts；新admission-facts.cjs；旧facts.cjs按需增加兼容断言。\
**Interfaces:** 产出两个inspect接口及上表diagnostic；旧API保持返回形状精确一致。

- [x] **Step 1：写RED。** `retained_envelope_gate_has_explanations`、`scope_copy_and_stale_operation_rejected`、`missing_roles_keeps_no_cohort_reason`、`candidate_201_is_not_object_limit_16`。用保存的home-retained-closed fixture验证原历史父enabled=true形状，不简化成全false输入。
- [x] **Step 2：运行RED。** `node --import <GUARD> --test src/tests/home-evidence-admission-facts.cjs`，预期诊断接口缺失或精确子项/计数断言FAIL。
- [x] **Step 3：同一次读取生成gate和诊断。** 沿用原纯permission和引用/新鲜度检查，拒绝条件与返回reason不变；不为诊断重复调用原生API或prune。多operation汇总需任何unknown/false保守拒绝，不能被后一个正常scope覆盖。
- [x] **Step 4：同一次遍历生成selection及计数。** 原角色、native坐标/id、稳定顺序和200/4/16保留；no_cohort/candidate_limit在诊断中保持原reason。Model正式接纳仍仅允许complete=true合法selection。
- [x] **Step 5：GREEN与反例。** 验证non-normal/敌人/缺视野/配置坏/指针异对象、200/201候选、多房Game.creeps、任务目标、16对象截断、没有role但名字像miner。检查诊断只含白名单固定字段、未走到为null；旧gate/selector返回值与同输入旧期待完全一致，业务Memory无写入。

## 批次3：有界提交、CPU阶段与首次接纳顺序

**Files:** 新Persistence；Service；新admission-runtime.cjs；fixture故障注入。\
**Interfaces:** 接批次1/2；commitHomeEvidenceStore提供明确writeAttempted和阶段，Service仍最后cleanup/P3。

- [x] **Step 1：写RED。** `reserved_readback_precedes_gate_and_events`、`gate_rejection_persists_without_window`、`selection_reason_is_not_collapsed`、`pending_unknown_blocks_capture_and_second_commit`、`same_cpu_budget_includes_reservation`。顺序采样断言：reserved pending/final确认→gate→selection→admit pending/final确认→事件；任何前置失败事件读取数0。
- [x] **Step 2：运行RED。** `node --import <GUARD> --test src/tests/home-evidence-admission-runtime.cjs`；预期当前服务无reserved/首因留存或顺序错误FAIL。
- [x] **Step 3：抽取提交适配器。** 所有copy/validate/CAS/readback/pending/final步骤检查同一预算；首次writeAttempted前置为true；已尝试但读回不明即unknown，不能再次write。新v2根pending同时计入8192/131072限额；不让提交helper创建业务namespace。
- [x] **Step 4：接入Service。** 原anchor时先确认reserved，再读取gate/selection，拒绝则提交rejected回执、不建window；正式admit用批次1同身份转换，确认后才允许packet。现有raw访问全部判别window可空，不能因null抛错变成通用capture_failed。默认关闭零写，已有v1仅只读，不迁移。
- [x] **Step 5：CPU故障矩阵GREEN。** 注入bucket4999/5000、入口余量6/7、delta恰好2、CPU读失败/倒退、gate后/selection后/复制/验证/pending前后/final前后超限；断言软预算未重置、首个发现阶段保留，未采样槽null。final后超限不能回滚已确认窗口或伪造未提交，也不能追加“为了记录超限”的无预算写入。
- [x] **Step 6：提交故障GREEN。** 每个阶段注入“写前抛错、写后抛错但读回相同、写后读回失败、异值冲突”。读回确认为同值可继续，未知不得重放；hook只采样/注入，assert放hook外，避免断言被Service catch当作预期故障。

## 批次4：跨tick、重建、诊断封存与关闭优先

**Files:** Model/Service；admission-model/runtime测试；home fixture重建入口。\
**Interfaces:** 单个有界 `global.HomeEvidenceWindowRuntime` 保留原停止锁，并增加独立命名的admission诊断槽；绑定完整原request和首次观察clock，不覆盖原window stop binding。

- [x] **Step 1：写RED。** `rejected_first_cause_survives_tick_and_reload`、`reserved_after_reset_is_interrupted_not_resumable`、`unknown_pending_cannot_restart_with_new_id`、`diagnostic_flush_uses_original_snapshot_and_deadline`、`close_wins_when_diagnostic_write_fails`。
- [x] **Step 2：运行RED。** 运行两个新model/runtime套件；当前只有实例lastError、弱global去重或未定义延后诊断的行为应FAIL，不能只断言fixture里手填的结果。
- [x] **Step 3：实现有界runtime留存。** 首个事实快照在内存冻结，服务重建不覆盖；已明确未调用提交且预算不足时，可以在原期限内仅封存该快照，不重新选择/gate/admit。曾调用且结果不明的key永久挡住自动重写。关闭和版本变化先锁住停采，不等诊断成功。
- [x] **Step 4：分层重建GREEN。** 分别测同tick新service、JSON Memory往返、跨tick新Game对象、清除runtime global并重建服务。fixture重新绑定creep.memory与Game/scope.operation引用，不保留旧Memory闭包。持久rejected/accepted/pending原值保留，reserved残留仅报告interrupted；原窗口+99、expiresAtMs和firstOutcome时钟不变。
- [x] **Step 5：证据不可得与不补开。** 测入口CPU不足从未write、首次reserve写结果不明且无可读marker、Home cleanup被前序异常跳过、首次看见anchor+1。只允许运行时unknown/late_seen/not_observed，不自动创建失效namespace或归因CPU。清掉所有未持久global后无法恢复的首因明确不可得；不测试/宣称硬引擎在同一anchor重置且无持久标记时仍能识别历史写调用，保留此生产未证明限制。
- [x] **Step 6：容量和业务对照GREEN。** 8192/131072/1024及Unicode边界，拒绝截断/删历史来容纳结果。真实母房自然fixture比较关闭/开启/诊断失败三条路径的Game动作、任务、spawn及业务Memory投影一致；原P0关停已先完成。第101tick/原10分钟后不补事件，不为缺首行续期。

## 批次5：报告、HTTP v1/v2兼容与配置/接纳分离

**Files:** Report、旧report.cjs；home-decoder、home-http.test；必要的本地artifacts/profile-reader适配。\
**Interfaces:** status/report/readPage签名不变；v2状态missing/reserved/interrupted/rejected/unknown/accepted_no_row/recording/sealed与admission摘要分开。v1旧返回合同尽量原样保留。

- [x] **Step 1：写RED。** `v2_rejected_download_is_diagnostic_not_capture`、`accepted_without_row_is_not_zero_events`、`v1_decode_unchanged`、`read_queries_never_create_or_mutate`。断言rejected/window=null可解码，runtimeAcceptance仍not_performed；missing和未观察计数保持null，无passed/permission字段。
- [x] **Step 2：运行RED。** `node --import <GUARD> --test src/tests/home-evidence-window-report.cjs .superpowers/sdd/2026-10-27-http-evidence-readonly/home-http.test.mjs`；当前report/decoder拒绝v2或乐观假设window必有，应FAIL。
- [x] **Step 3：实现报告分派。** v2无window只返回接纳诊断，readPage返回rows空且明确not_admitted/interrupted而非成功采集页；v2有window继续原配对逻辑。pending只读显示未知/中断，不调用修复函数。stage samples不可见和完整CPU性能未测分开展示。
- [x] **Step 4：实现HTTP严格解码。** expectedVersion/expectedWindowId从admission.request读取身份，再与可选window双向核对；拒绝未知schema、超限、损坏键、诊断/窗口foreign身份、两层pending。保留旧missing/异常类型、固定path、单GET传输和经济profile；不添加联网执行入口或更新旧授权。
- [x] **Step 5：GREEN。** 离线原始envelope→gzip/JSON→v1/v2校验→status/report→新目录bundle/manifest测试。包括v2 rejected、reserved、unknown、accepted_no_row、记录中/封存；utf8 bytes与UTF-16字符分别限流；查询及解码前后深度相等；未知schema不fallback/二次GET。旧消费样本/锁/hash不变。
- [x] **Step 6：接纳语义合同。** 在新runtime测试中用只读状态证明configured≠reserved≠admitted≠first_row；不修改已消耗的生产operations entry来“适配重跑”。未来运维改版另出执行卡，本批只交付可下载状态合同。

## 批次6：完整验证、仅构建与维护者交付

**Files:** package.json、AGENTS、验证脚本和交付报告；不触及生产运维目录。\
**Interfaces:** 新 `verify-local.mjs` / `build-local.mjs` 只消费本地模块和fixture，输出真实计数、源文件/保护文件/隔离产物hash、未联网/未部署/未运行时验收声明。

- [x] **Step 1：登记完整入口。** package.json在旧清单后追加三个新suite，不移除旧测试；更新AGENTS描述v2回执/readonly v1/固定anchor/unknown限制及真实global reset未验收，默认配置false/null不变。
- [x] **Step 2：收齐定向验证。** 运行四个旧home套件和三个新admission套件、旧trial-evidence四套件、HTTP目录全部`*.test.mjs`，用<GUARD>禁止网络/凭据；预期0失败，关键断言不得skip。已通过的批次不无意义重复，只有代码新增或兼容耦合时复跑。
- [x] **Step 3：完整测试。** 由新verify-local用bundled Node按package.json的完整test清单分别运行smoke、room-governor和node --test项目，所有子进程显式加离线guard；真实输出记录计数，不预填912或旧总数。
- [x] **Step 4：隔离仅构建。** build-local先确认DEST为空、不读.secret，再在全新build cwd导入仓库rollup.config.js，input改为repo绝对src/main.js，output指向新build/dist。输出两个产物hash；root dist前后hash不变；无upload/copy部署，不能直接运行npm push或默认根目录clear插件。
- [x] **Step 5：完整性检查。** `git diff --check`、`git diff --cached --check`、暂存区空；仅允许本计划文件地图中的差异，保存保护hash。保留原 `.superpowers/sdd/2026-10-27-home-natural-evidence-operations/attempt-01/`、旧授权/锁/原始result/raw-post-audit、旧dist与混合目标进度文档，不运行历史verify中的“所有新源码应完全不变”误比较。
- [x] **Step 6：维护者自检。** 对照五条Review Focus及spec逐项定位测试；检查真假接纳混用、全局锁无限增长、阶段名/状态分叉、异常静默成为成功、查询写入、v1被自动迁移、超CPU还写诊断、实际启动根因被无证据确定等问题，修正后只复跑受影响验证。
- [x] **Step 7：交付中文报告。** 区分完成实现/RED→GREEN/完整测试/仅构建与未做的线上API、CPU、global reset、自然采集验收。建议可增加一次独立只读review核对跨tick/unknown边界，是否使用由用户决定；本计划不自动派代理、不自动发布或重开。

## 命令约定与执行记录

`node`指 `C:/Users/mts-2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`。`<GUARD>`指 `./.superpowers/sdd/2026-10-27-home-natural-evidence-window/offline-guard.mjs`；在仓库cwd下运行，PowerShell不可用时用cmd，复杂参数通过Node spawn数组传递，不拼接shell串。新验证记录放本计划专用工作目录，不覆写历史输出。

每批必须保存：RED失败用例名和与需求对应的断言 → GREEN输出 → 修改文件/hash → 剩余限制。出现失败先判断是否推翻方案，不能通过更宽freshness、移动anchor、增加预算、清unknown或补造role解决。

## 自检与交接

本计划把设计中的单路径v2、先reserved后admission、冻结首因、实际gate/selector、CPU/写入阶段、跨tick/重建、只封存不补开、旧v1兼容及HTTP一次读取分别落到六批。五条Review Focus均有对应故障用例；afterFinal自指测量与无持久标记重置盲区已明确保留，不承诺无法证明的恢复能力。

执行完成：950/950游戏回归、46/46 HTTP回归、smoke/Governor与隔离仅构建通过。一次独立只读review的实质反例经RED→GREEN修复；保留CPU样本commitKind标注Minor。重建后若丢失原读回确认链，保守停采留证；详见交付报告与ledger。未联网/提交/部署/重开；工作区保留。
