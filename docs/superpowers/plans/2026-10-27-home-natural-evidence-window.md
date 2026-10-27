# 母房自然行为有界采集与 HTTP 下载实施计划

> **For agentic workers:** 执行时使用 `superpowers:executing-plans`，由主代理逐批实施；每批按下列复选框记录 RED→GREEN。是否增加一次独立只读 review 由用户决定，不自动派子代理。用户未批准本计划实施前，不写产品代码。

**Goal:** 对 shard3/W49N41 既有单位的自然行为建立独立证据窗，最多100个观察tick或10分钟先到即止，稍后通过一次固定HTTP GET下载；不产生游戏动作或经济许可。

**Architecture:** 新建 HomeEvidenceWindowModel/Facts/Service/Report，独占 `Memory.empire.observations.homeEvidence`，原经济窗口不变。Service在最后cleanup采集当前Game状态及声明为前一tick的事件；HTTP只共享有界传输/解压基础，通过固定profile分派到独立schema与报告。

**Tech Stack:** 项目现有JavaScript ESM、Node内置test/assert、现有Service生命周期、Screeps Game/Memory/getEventLog、现有Rollup隔离dry build；不新增第三方依赖。

**Spec:** `docs/superpowers/specs/2026-10-27-home-natural-evidence-window-design.md`（用户于2026-10-27认可设计与回归计划）。

**Regression:** `docs/superpowers/plans/2026-10-27-home-natural-evidence-window-regression.md`。

**范围状态：** 本轮只编写计划。后续即使认可实施，也只进行本地实现、测试与仅构建；不联网、不暂存/提交/推送/部署、不创建线上请求。发布、自然采集与HTTP读取各需对应的新授权，不能复用已消耗的GET。

## Global Constraints

- 复用 worktree `C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium`，分支 `codex/single-remote-mining`；规划时HEAD为 `2e9f10cbfa31f3cec44344192a466c2927faf99e`。执行前重新核对，不reset或清理已有改动。
- `policy.homeEvidence.enabled=false`、`request=null`；旧观察窗、侦察、采运、Goal/Plan和市场继续默认关闭，Governor shadow=true、scheduler.enforce=false。
- 100个观察tick：接纳时固定 `lastAllowedTick=acceptedAtTick+99`，墙钟固定 `expiresAtMs<=issuedAtMs+600000`，先到即止。第一行无前态，最多99对完整过渡，不追加第101个观察tick确认最后意图。
- 接纳新鲜度≤30000ms、接纳tick区间跨度≤10；请求ID、版本、scope、原期限不因重建、暂停、未知或换ID重试而更新。
- 仅W49N41；cohort≤4、固定对象≤16、候选检查≤200、原生日志≤128、保存相关事件≤32/行、行≤100，完整store≤131072 UTF-16字符，包含pending与seal。
- CPU为阶段软预算：bucket≥5000、开始可用≥7、reserve=5、capture=2；单个原生API/序列化不能硬中断，不宣称已完成性能验收。落实src/AGENTS的policy阈值要求：在homeEvidence下补充 `cpu:{minBucket:5000,reserve:5,capture:2}`，这是对设计中阈值存放位置的实现补全，不改变关闭或时间上限。配置只允许minBucket≥5000、reserve≥5、0<capture≤2；开始可用须≥max(7,reserve+capture)，非法配置拒绝采集，不回落到宽松值。
- 只写独占观察namespace及现有允许的诊断遥测；不改任务、单位Memory、预算、旧锁/账/请求、生产权限，不调用Game动作、start/release、ensure业务状态或prune型查询。
- 两个profile严格分离：`economic_trial_v1` 保持既有契约，`home_natural_v1` 没有经济身份/费用/收益字段。未知不补0，fixture永不升级生产证明，报告无passed/permission。
- 未来HTTP仍是固定URL的一次GET，15秒请求/60秒总窗，无刷新token/重定向/WS/console/重试/自动换路径。
- 原日志、锁、root dist、混合进度文档和 `.superpowers/sdd/2026-10-27-http-evidence-readonly/online-attempt-01` 保留。该目录已消耗，不用于任何新执行或失败复测。
- 全部测试使用禁止联网/凭据的离线guard。默认PowerShell不可用时用cmd执行bundled Node；测试命令中的 `node` 对应 `C:/Users/mts-2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`。
- 每批完成只更新本计划进度记录，不git add/commit；技能中的默认提交、工作区删除或自动review步骤服从用户当前限制。

## Review Focus

1. 关闭/撤回、恰好截止与CPU不足交叠时，停止采集优先；不能因终态保存失败继续读事件（批次1/3）。
2. pending已写、final未知后重置，不能凭新tick、新ID或新服务重放admission/包（批次1/3）。
3. API事件表面合法但有source再生、未采目标或反向withdraw/并发时，不得产生正向一致证明（批次2/4）。
4. 历史包络enabled=true但实际失效，与当tick确有scope/native权限，不能被同一乐观默认值处理（批次2/3）。
5. 抽取HTTP公共基础后，旧默认请求、异常类型、缺失语义及独占目录行为保持兼容；profile不能成为任意URL入口（批次5）。

---

## 文件与接口约定

所有下列路径均相对上述worktree；实施时读取 `src/AGENTS.md` 及涉及的config/core/services/tests子目录说明。

| 文件 | 职责/批次 |
|---|---|
| 新建 `src/services/HomeEvidenceWindowModel.js` | 纯请求/schema、时间/容量/身份/状态转换；1 |
| 新建 `src/services/HomeEvidenceWindowFacts.js` | 当tick纯只读gate、稳定选人/选对象、事件与快照；2 |
| 新建 `src/services/HomeEvidenceWindowService.js` | 持久提交与故障隔离、最后cleanup；3，facade于4接入 |
| 新建 `src/services/HomeEvidenceWindowReport.js` | 仅归约存储事实、配对/覆盖/分页；4 |
| 修改 `src/config/EmpirePolicy.js` | homeEvidence默认关闭及CPU初始阈值；1 |
| 修改 `src/core/ServiceScheduler.js`、`src/main.js` | 新服务P3、置于旧TrialEvidenceWindow之后，不改P0顺序；3 |
| 新建四个 `src/tests/home-evidence-window-{model,facts,runtime,report}.cjs` | 各批真实模块回归；1–4 |
| 新建 `src/tests/helpers/home-evidence-window-fixture.cjs` | 无remote请求的母房自然策略/下一tick应用fixture；2/3 |
| 修改 `package.json` 的test命令 | 将四个新套件加入原完整入口，其余套件保留；6 |
| 修改现有HTTP工具目录的decoder/reader/artifacts/entry，新增公共envelope、profile-reader、home-decoder及测试 | 固定双profile，旧调用兼容；5 |
| 新建本计划 `.superpowers/sdd/2026-10-27-home-natural-evidence-window/` 中离线verify/隔离build脚本 | 本地验证及保护旧产物，绝无在线execute；6 |
| 更新相关AGENTS说明、补交付报告 | 仅描述最终行为和限制，不写“运行时通过”；6 |

### 跨批数据类型

- `HomeClock={tick,nowMs,codeVersion,shard}`，时间和计数为安全整数；`HomeRequest={schemaVersion:1,id,profile:'home_natural_v1',codeVersion,shard:'shard3',roomName:'W49N41',issuedAtMs,expiresAtMs,acceptNotBeforeTick,acceptNotAfterTick}`，拒绝额外键。
- `HomeStore={schemaVersion:1,profile:'home_natural_v1',window}`；window按spec保存header/bounds/rows/capture/pending/seal。header.windowId=request.id，header.request为接纳的原请求副本；cohort与objectIds不可变。
- `HomeGate={observedTick,known,closed,homeReady,reason}`；`closed`只说明既有业务权限，不是新执行许可。缺失/损坏/过期scope不能静默归零。
- `HomeSelection={cohort,objectIds,complete,reason}`，cohort项为 `{id,name,role}`。16个对象包含cohort，列表稳定去重；不补选死亡者。
- `HomePacket={windowId,codeVersion,observedTick,declaredEventTick,observedAtMs,objects,events,otherEventCounts,api,cpu,coverage}`。objects按固定ID映射到明确的存在性、type/my/role、pos、energy；不存原生对象或任意Memory。events保留room/index/event/objectId/targetId/resourceType/amount；所有数组/字符串及reason枚举都在schema中有界。
- `advanceHomeEvidence(input,event,clock)` 返回 `{store,changed,reason}`；event只允许 `admit(request,selection,gate)`、`capture(packet,gate)`、`seal(reason)`，无business effects。

### 批次1：纯窗口协议与默认关闭

**Files:** Model、model.cjs、EmpirePolicy。

**Interfaces:** 导出 `HOME_EVIDENCE_PROFILE`、`HOME_EVIDENCE_LIMITS`、`validateHomeEvidenceRequest(request,clock)`、`validHomeEvidenceStore(store)`、`advanceHomeEvidence(input,event,clock)`。不存在store传undefined；拒绝结果保留原引用和值。

- [ ] 先写 `default_off_and_request_schema`、`admission_clock_edges`、`single_window_and_id_conflict`、`one_hundred_observations_no_extension`、`capacity_includes_pending_and_seal` 失败用例。关键断言：默认false/null；T=100接纳后lastAllowedTick=199，T=200不得append；now=expiresAtMs不得采集；30s/10ticks恰好允许，+1拒绝；数字字符串/额外键拒绝。
- [ ] Run `node --test src/tests/home-evidence-window-model.cjs`。Expected：明确因所需导出/协议缺失而FAIL；测试加载错误、拼写错误先纠正，不作为RED证据。
- [ ] 实现纯协议。100与600000使用常量，candidate按实际JSON长度检查；容量预留必须容纳pending和seal，满额partial封存但不删行。cohort、原请求、起点/截止不可变；已有任何窗口不接纳另一个ID。
- [ ] 增加 `withdraw_request_stops_before_capture`、`unknown_admission_cannot_restart`、`duplicate_packet_idempotent_conflict_preserves_first`、UTF-16多字节精确边界及clock倒退回归。JSON往返不恢复未知为fresh；没有行不推产量0。
- [ ] 同命令GREEN，复查全部断言；记录本批输出和hash，不提交。

### 批次2：只读事实与真实自然行为fixture

**Files:** Facts、facts.cjs、home fixture。

**Interfaces:** `collectHomeObservationGate(clock,deps={}) -> HomeGate`；`selectHomeEvidenceObjects(clock,deps={}) -> HomeSelection`；`collectHomeEvidencePacket(window,clock,deps={}) -> HomePacket`。deps只在模块边界注入读取器/预算checkpoint；默认读取现有Game/Memory/global，不ensure或写回。

- [ ] RED：`no_economic_state_needed`、`expired_envelope_does_not_grant_permission`、`fresh_scope_open_or_unknown_refuses`、`native_non_enumerable_position`、`selection_is_stable_and_never_replaces_actor`、200/201候选、16/17对象。
- [ ] Run `node --test src/tests/home-evidence-window-facts.cjs`，Expected：缺失Facts或错误控制/选人行为FAIL。
- [ ] 实现gate：显式检查remoteMining/reconTrial/economicTrial/nativeTrialOps/旧evidenceWindow、Goal/Plan/市场关闭，Governor shadow、scheduler不enforce；既有remote记录存在时按当tickoperation/scope及原纯permission函数判断实际权限，不调用会prune的API。没有任何remote记录且控制明确关闭可作为已知空集；有记录但无法确认则unknown。历史请求自身enabled=true不授予权限、不被改写。
- [ ] 实现稳定选择与白名单读取，保持spec优先级和4/16/200上限。目标只从实际Game对象获取；task.id只是候选。T读取T−1事件每房每tick至多一次，128/32超额标coverage缺口；不截断原生对象后伪称完整。
- [ ] 新建母房fixture：可复用 `remote-mining-fixture.cjs` 的纯 `installGlobals/store`，但不调用默认启用远程的 `createRemoteFixture` 或任何经济submit/start。创建合法24hex ID的已有本地creep/source/接收目标；真实Miner/Hauler/Builder策略与ActionParser的意图在下一tick队列应用后才产生日志，标simulated。没有scout或远程需求。
- [ ] GREEN：补API缺失/抛错/shape坏、重复tick、对象消失/同名新ID、无能量/pos、任意data不外泄、CPU不可读及软超限用例。采集前后业务Memory/任务不变；hook只采证或注入异常，assert留在hook外。

### 批次3：持久提交、默认接入与停止优先

**Files:** Service、runtime.cjs、main、ServiceScheduler，必要的fixture生命周期补充。

**Interfaces:** `new HomeEvidenceWindowService(name='HomeEvidenceWindow',options={now,readCpu,readStore,writeStore,factsDeps})`；其 `cleanup()` 独立执行；`commitHomeEvidence(expected,candidate,key)` 返回committed/unchanged/conflict/unknown，不产生业务effects。init/analyze/run无采集动作，facade在批次4接入。

- [ ] RED：`disabled_service_does_not_create_namespace`、`cleanup_after_existing_observers_before_finishTick`、`closure_before_events_even_when_cpu_low`、`pending_survives_same_tick_rebuild`、`no_replay_after_unknown_admission`。
- [ ] Run `node --test src/tests/home-evidence-window-runtime.cjs`，Expected：服务/顺序/写入隔离缺失而FAIL。
- [ ] 实现最后cleanup和P3登记。先处理原期限、撤回/改变请求、版本/业务权限异常等停止条件，再读可选事件/对象；停采不依赖seal写成功。默认关闭且无窗零写。中途关闭仅对已存原窗尽力一次有界封存，不创建新窗。
- [ ] pending和final为两个明确且各最多一次的提交；复制/验证/写入/回读阶段均检查软预算。写后异常只读核对，未知保留不可重放标记；JSON重载从持久身份和原期限继续，不能依赖仅global Set去重。
- [ ] GREEN：注入provider、serialize、pending前/后、final写后、readback异常；验证未知/容量/CPU故障不影响原guard、关停与ActionParser顺序。admission拒绝仅在服务lastError保留一个有限reason，不为诊断日志新建持久namespace或活动窗，也不循环追加拒绝日志；重置后若无持久证据，不声称保留了拒绝历史。
- [ ] 真实自然链对照关闭/开启/故障3种运行：排除独占观察namespace及允许的遥测后，业务Memory、任务、Game动作与spawn调用一致。第101个观察tick、原10分钟界限不读日志，不因缺行补时。

### 批次4：报告、相邻tick配对和只读查询

**Files:** Report、report.cjs、Service.init只读facade。

**Interfaces:** `homeEvidenceStatus(store)`、`summarizeHomeEvidence(store)`、`readHomeEvidencePage(store,offset,limit)`；global facade仅 `HomeEvidenceWindow.status()/report()/readPage(offset,limit)`。每页最多16行且JSON输出≤16384字符；单行过大返回item_too_large和明确终止，不能卡在同offset无限翻页。

- [ ] RED：`first_row_and_last_intent_never_count_as_a_pair`、`harvest_requires_both_endpoints`、`withdraw_is_not_transfer`、`foreign_touch_and_source_regeneration_are_unproved`、`query_does_not_ensure_or_touch_lastAccess`。
- [ ] Run `node --test src/tests/home-evidence-window-report.cjs`，Expected：缺失归约或乐观归因FAIL。
- [ ] 实现仅从store归约：相邻tick、固定ID/版本、完整端点前后态、正安全整数amount、双方delta一致且无相关并发才标单对consistent。反向withdraw为candidate/unverified，link/未知目标/资源不计正向transfer；无事件不是实测0。
- [ ] 分别输出method/shape/coverage/HARVEST/TRANSFER/CPU/Memory/seal/持久化证据，raw null/partial保留。simulated、自然一致、旧经济production_verified不互相提升；不造经济账或passed/permission。
- [ ] GREEN：100行最多99对、缺tick后不跨缺口配对、64bit/字符串金额拒绝、pending不完整、封存后当前Game/Memory变化不影响报告。facade查询前后对象深度一致、关闭时可读旧窗、无任何创建/清理写入。

### 批次5：HTTP共享基础与固定双profile

**Files:** 现有 `.superpowers/sdd/2026-10-27-http-evidence-readonly/` 内新增 `memory-envelope.mjs`、`profile-reader.mjs`、`home-decoder.mjs`、`home-http.test.mjs`；修改decoder/reader/artifacts/entry的适配层。旧 `single-run.mjs` / `online-entry.mjs` /授权/线上attempt不改动。

**Interfaces:** `memory-envelope.mjs` 的 `decodeRawMemoryEnvelope(body,limits) -> {status:'missing'|'present',value}` 提供有界UTF8/gzip/JSON解码；`home-decoder.mjs` 的 `decodeHomeMemoryResponse(body,{expectedVersion,expectedWindowId})` 使用新Model/Report；`profile-reader.mjs` 导出 `createHomeMemoryReader(options)` 和 `createProfileReader(profileId,options)`，旧reader的 `createMemoryReader(options)` 委托后者，profileId仅两个固定枚举。artifacts另导出 `writeHomeEvidenceBundle(raw,dir,options)`，内部共用文件写入基础，旧 `writeEvidenceBundle` 仍只解经济schema。保留旧导出的EvidenceReadError/HTTP_LIMITS/MEMORY_PATH/EXPECTED_VERSION和旧返回/错误契约。

- [ ] RED：`home_profile_uses_only_home_path`、`foreign_store_is_not_a_profile_fallback`、`legacy_default_url_and_error_type_unchanged`、`missing_does_not_issue_second_get`。先跑新test观测所需接口缺失，再抽取公共代码，不能先改旧校验使新test通过。
- [ ] Run `node --test .superpowers/sdd/2026-10-27-http-evidence-readonly/home-http.test.mjs`，Expected：新增profile缺失/混用被捕获。
- [ ] 共用envelope和有界GET机制，旧经济codec保留其scope/完整身份/版本检查；自然codec严格对应新schema与131072字符上限。共享HTTP wire cap与gzip输出有界，不把字符上限错当UTF8 bytes。
- [ ] 自然profile固定 `https://screeps.com/api/user/memory?shard=shard3&path=empire.observations.homeEvidence`，不接受path/url/callback配置；默认拒绝联网。离线CLI新增 `--decode <file> --out <new-dir> --profile home_natural_v1`，原四参数decode及裸check保持旧默认；非法profile在凭据/transport前拒绝，不提供新online execute分支或生产授权。
- [ ] 导出保持独占新目录和最后manifest，原始响应/专用store/报告/哈希分开；本地import不宣称服务器认证。Home导出不得经过旧economic decoder；旧 `writeEvidenceBundle(raw,dir,options)` 行为保留。
- [ ] GREEN：联合旧27项HTTP与7项单次入口，再跑新profile回归，全部在禁止联网/凭据guard下。覆盖gzip炸弹/截断、错误状态码、取消/迟到、15秒及60秒绝对期限、unknown不重试、重复目录拒绝。旧实际GET样本/锁/结果文件哈希不变。

### 批次6：完整验证、仅构建和可审阅交付

**Files:** package.json、相关AGENTS说明、交付报告；本计划本地工作记录与离线verify/build脚本。

**Interfaces:** `.superpowers/sdd/2026-10-27-home-natural-evidence-window/verify-local.mjs` 输出有源文件hash、真实测试计数、隔离产物hash与“未联网/未验收”的result.json；只接本地fixture与模块，不导入凭据/旧execute入口。

- [ ] 将四个新套件加入原package.json test，保留所有旧套件；文档说明新namespace、只读边界、100/600000、固定profile及CPU软预算，不能把868/868历史结果预填成新结果。
- [ ] 先在新工作目录记录允许修改文件清单与baseline；检查保护文件及旧日志/样本hash。旧verify脚本包含“源码应完全未变”的断言，不能直接照跑后把有意新增源码误报故障；新verify只对明确允许修改项生成候选hash，其余基线继续保护。
- [ ] Run新增四套件+旧 `trial-evidence-window-*` 及所有HTTP回归。Expected：0失败/0跳过关键边界。完整Run package.json test：用bundled Node分别执行其smoke、room-governor和`--test`清单（或等价npm test）；Expected：全部真实通过，不写固定总数。
- [ ] 仅构建：新建空build目录并先chdir进去；确认该进程DEST为空，再导入repo的rollup.config.js，把input设为repo绝对src/main.js、output设为新目录。Expected：dryRun、不读.secret、不上传、两个产物有hash，root dist前后hash不变。不要在repo cwd先导入clear插件。
- [ ] 检查 `git diff --check` 与 `git diff --cached --check`，确认暂存区仍为空；保护旧请求、日志锁、发布备份、HTTP已消耗目录和混合进度文档。核对默认开关false/null、Governor shadow、scheduler不enforce。
- [ ] 主代理维护者自检：删除不必要workaround/重复状态，检查静默吞错是否变成成功、namespace写入是否越权、公共HTTP是否弱化旧契约、停止条件是否先于昂贵读取。若用户选择独立review，只发送冻结差异/spec/回归/记录的只读包，不操作线上。
- [ ] 交付中文报告：分开列本地实现/测试/仅构建、旧兼容、CPU未实测、真实样本/重置/经济验收未进行；保存下一轮默认关闭发布的候选范围，不自行发布或开窗。

## 本计划自检与执行交接

设计9节及回归矩阵均映射到上述六批；第一/末tick、原期限、旧包络、unknown重置、schema分派分别在Review Focus及对应批次有明确断言。接口名在后续批次沿用前置批定义，不要求实现者发明未说明的经济能力。

本计划不更改已认可的100观察tick/10分钟上限。阶段间可以继续独立本地工作，但每批需保存RED/GREEN输出，失败先诊断，不通过延长窗口、清unknown、放宽scope或重放请求解决。

建议执行方式：主代理按六批顺序实现；跨tick持久提交和HTTP抽取有独立核对价值，可由用户选择完成后增加一次只读独立review。当前未派子代理，尚未获本计划实施授权。
