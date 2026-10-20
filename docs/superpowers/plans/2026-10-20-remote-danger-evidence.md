# 远程危险情报留存 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task after user review. Steps use checkbox (`- [ ]`) syntax for tracking. 本轮不授权实施或子代理；若用户另选执行方式，遵循其明确指令。

**Goal:** 托管侦察首次因danger/home_danger停止后，独立留存有界、可归属的同tick对象证据；记录失败不阻断关停，已提交证据跨tick与正常重置保留。

**Architecture:** 纯模型管理事故身份、有限数据及pending/final协议，Game/Memory适配器负责尽力采集和写入。既有守卫先完成控制提交、关闭效果和拒绝许可，随后调用隔离的观测hook；详细对象不进入guard状态、outcome或许可计算。既有metrics出口只透传小摘要。

**Tech Stack:** JavaScript ES modules，Node内置node:test/CommonJS测试入口，现有Screeps fixture，Rollup；不引入依赖。

**Spec:** `docs/superpowers/specs/2026-10-20-remote-danger-evidence-design.md`（用户已认可）。验证清单：`docs/superpowers/plans/2026-10-20-remote-danger-evidence-regression.md`（用户已认可）。

日期：2026-10-20。状态：用户已认可计划并授权主代理逐批实施＋一次只读独立review。五批实现、review反馈修复及完整测试387/387、smoke、room-governor、dry build已完成；详见`docs/superpowers/evidence/2026-10-20-remote-danger-evidence-local-validation.md`。未提交、推送、部署或操作线上。

## Global Constraints

- 第一版仅记录RemoteReconTrial首次danger/home_danger，分别读取targetRoom/baseRoom；不改危险判定，不作敌我外交或兵力决策。
- 先关停再记录；记录失败、摘要失败及独立ledger损坏不能污染控制schema或阻止原关停链。既有控制异常不被新增try/catch吞掉。
- 独立路径`Memory.empire.remoteMining.dangerEvidence`，schemaVersion=1；guard schemaVersion=1不变。默认关闭且无新危险时不创建ledger，不为旧终局补录。
- 完整身份为(trialId,sequence,remoteId,epoch,codeVersion,decidedAtTick,stopReason)，不截断身份或按room/name猜关联。
- 最多2条事故、每条10个actor、每body最多检查50part、actor文本最多100个UTF-16代码单元。record JSON长度<=12000，ledger<=25000；每份紧凑摘要<=1500。
- CPU参数从policy读取，默认reserveCpu=5、maxCaptureCpu=2。后者为actor边界的合作式预算，不是抢占式硬上限；缺读数或非法显式值只影响诊断。
- pending已跨tick时只读导出effectiveStatus=interrupted、rawCaptureStatus=pending，原Memory不回写，不拿后续对象补旧案。正常2次写，最多3次写尝试，无逐tick重试。
- 保留300ticks/20分钟、最多一名scout、100连续安全ticks、原leg期限/一次重规划、预算、未知费用、次tick关闭确认和既有安全返程。
- 侦察、实际采运、Goal/Plan保持关闭约束；Governor shadow=true、scheduler.enforce=false、market=false。fixture可模拟异常开关，生产不得自动纠正其他人工配置。
- 不联网读取/写入线上，不启用/release、不制造敌情。当前无提交、推送、部署授权；每批只保留本地检查点，不执行git add/commit/push或npm run push/watch。
- 引擎未提交/外部删除/整个Memory不可序列化时，不承诺数据恢复；本地测试、dry build、发布与线上验收分开记录。

## Review Focus

1. 显式null/数组/错误CPU配置不能让通用默认合并在P0守卫前抛错：P2的`danger_policy_invalid_does_not_break_ensure`。
2. writer已赋值后再抛错，不能重采或以failed覆盖已提交快照：P2的`danger_writer_ack_is_ambiguous`。
3. hook内部assert可能被业务catch吞掉而假绿：P3记录hook入口状态，所有验收assert放回测试外层。
4. JSON重载后fixture仍引用旧raw配置/creep.memory会造成伪验证：P4的`danger_reset_fixture_uses_current_memory`。
5. metrics.capturedAt更新不能刷新旧事故观察时间，也不能在telemetry关闭时关闭守卫记录：P5的历史时标与telemetry反例。

## 基线、文件与接口

复用worktree `C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium`、分支codex/single-remote-mining；编写时HEAD=e22cf49。执行前重新记录HEAD/status，保留全部既有未跟踪证据和规划文档，不清理或切回主目录。先读src、services、config、tests各级AGENTS.md。

| 文件 | 职责/批次 |
| --- | --- |
| 新增src/services/RemoteDangerEvidenceModel.js | P1纯模型，P2策略解析与有界数据标准化，P4/P5读取兼容 |
| 新增src/services/RemoteDangerEvidence.js | P2采集/独立存储适配，P5只读会话摘要 |
| 修改src/config/EmpirePolicy.js | P2仅导出只读CPU默认常量，不改现有合并算法或战略开关 |
| 修改src/services/RemoteReconTrialService.js | P3控制之后的异常隔离hook，P5摘要读取 |
| 新增src/tests/remote-danger-evidence.cjs | P1/P2纯模型与适配器断言 |
| 修改src/tests/recon-trial-runtime.cjs | P3/P4/P5真实关停、重置与metrics链 |
| 修改src/tests/helpers/recon-trial-fixture.cjs | P3注入recorder/CPU；P4正常Memory恢复工具 |
| 修改package.json、src/services/AGENTS.md、src/tests/AGENTS.md | P5测试接入与职责文档 |

RemoteReconTrialModel/Facts、main/P0顺序、EmpireMetricsService、通用remote fixture是只读参考，计划不修改。既有metrics浅拷贝已能导出附加metadata，用生产出口回归证明，不新建重复导出通道。

### 固定接口（各批共用）

`Transition={before:session|undefined,after:session|undefined,clock:{tick,nowMs,codeVersion}}`。

Model导出：

- `dangerContextForStop(before, after, clock) -> Context|null`：只识别同tick首次危险终局；Context包含identity、baseRoom/targetRoom/observedRoom、decidedAtTick、decisionAtMs、stopReason、detection='non_owned_creep'。
- `beginDangerEvidence(store, context) -> {next,claimed,key,reason}`：仅合法新事故产生pending和claimed=true；重复/非法保持原store。key是完整有序身份元组的JSON编码，不用未转义字符串拼接。
- `normalizeDangerActor(facts) -> {actor,partial}`：输入已读成普通值的id/name/ownerUsername/pos/bodyFacts/fieldErrors，输出设计规定的actor。bodyFacts={length,parts:[{type,hits,boost}],readComplete}，parts最多50；不保留bodyFacts到最终记录。body不完整时activeParts=null，未知hasBoosts为null，不能伪装0/false。
- `finishDangerEvidence(store,key,capture,clock) -> {next,applied,reason}`：只完成本tick该key的pending；标准化、截断、定长及冻结，禁止改写已有终结结果。
- `dangerEvidenceSummary(store,reference,nowTick,intelTtl) -> Summary`：reference={identity,decidedAtTick,stopReason}，从guard的原始会话和outcome构造，精确匹配完整七元组；尚无危险outcome时reference=null。只读返回key、rawCaptureStatus/effectiveStatus、captureReason、房间/时间、计数/截断、historical=true、ageTicks/stale，不含actors。缺历史/reference为not_recorded，非法ledger为明确失败摘要。
- `resolveDangerEvidencePolicy(raw) -> {valid,policy,reason}`：缺字段使用配置导出的默认值，不写Memory；显式null/非对象/数组或非法数字返回invalid_policy。两个数须有限且>=0，maxCaptureCpu=0表示跳过详细采集。

适配器导出：

- `recordStoppedTrialDanger(transition,deps={}) -> {attempted,persisted,key,captureStatus,captureReason}`。
- `readTrialDangerEvidence({state,clock},deps={}) -> {current,previous}|null`：分别用两条guard会话及其原outcome构造reference，缺会话为null。历史读取不要求事故codeVersion等于当前运行版本，不改事故版本。

deps默认只实现：readStore/writeStore、readRoom/readActors、readCpu、readPolicy、readClock。默认分别读取指定Memory路径、Game.rooms/room.find、Game.cpu、policy和当前clock；不暴露游戏动作。测试注入只影响适配器，不能替换危险布尔检测、原guard或Spawn。

## P1：纯事故模型、JSON边界和有界ledger

**Files:** 新增Model与remote-danger-evidence.cjs。

**Consumes:** 已认可字段/上限、上述Transition和Context。**Produces:** dangerContextForStop/begin/normalize/finish/summary接口；先不接Game或生产service。

- [x] 建立可复用的普通JSON测试context，fixture身份用W1N1:W1N2，tick110/版本trial-v1；不得读取凭据或昨日的真实单位来运行测试。
- [x] 写R1全部RED：身份完整、home/remote分房、字段不推断、有效part、纯JSON、容量、两条轮换、坏schema不破坏。关键断言：

```js
assert.equal(start.claimed, true);
assert.equal(start.next.records[0].captureStatus, 'pending');
assert.equal(beginDangerEvidence(start.next, context).claimed, false);
assert.deepEqual(JSON.parse(JSON.stringify(done.next)), done.next);
assert.ok(JSON.stringify(done.next.records[0]).length <= 12000);
assert.ok(JSON.stringify(done.next).length <= 25000);
```

- [x] 运行`& $dangerNode --test src/tests/remote-danger-evidence.cjs`，记录新接口不存在或关键契约断言的RED，不把语法/依赖损坏当目标RED。
- [x] 实现纯模型及边界：2/10/50/100上限，身份严格校验、actor字段未知值、转义文本、最多删除10个尾部actor。输入不原地改写，异常原始ledger不整树复制/序列化或清除；metadata无法限长时拒绝记录，不截断身份。
- [x] 同命令GREEN；增加最小反例验证：第三事故挤掉最旧、相同actor不同sequence不合并、读取默认关闭和旧终局不造数据。
- [x] 保存P1定向退出码及diff检查结果到本地交付记录，不暂存或提交。

## P2：同tick采集、CPU策略与写入失败协议

**Files:** 新增RemoteDangerEvidence.js，修改EmpirePolicy.js、新测试文件。

**Consumes:** P1接口与普通Context。**Produces:** recordStoppedTrialDanger；配置导出`DEFAULT_REMOTE_DANGER_EVIDENCE_POLICY={reserveCpu:5,maxCaptureCpu:2}`及resolver契约。

实现澄清：当前mergeDefaults会递归处理对象值，显式null新分支可能在守卫前抛错。因此默认常量单独从配置层导出，**不把新的嵌套dangerEvidence对象加入DEFAULT_EMPIRE_POLICY**；resolver只读补缺字段，实际override仍从policy.remoteMining.dangerEvidence读取。不修改通用mergeDefaults，不覆盖非法手工配置。这是落实已批准的“非法配置不能影响关停”，不是增加配置迁移。

- [x] 写R2全部RED，并补`danger_policy_invalid_does_not_break_ensure`：对undefined、部分对象、null、数组、字符串、负值、NaN/Infinity分别调用真实ensureEmpireControl；新增显式值保持原样，ensure不因该新分支抛错，resolver按契约给结果。
- [x] 运行定向新文件，记录CPU/采集/写入契约RED。
- [x] 实现唯一尝试流程：识别新危险 → 构建小pending并writeStore → 同tick/视野/CPU检查 → 有界读取10actor、每body50part → finish → writeStore。默认collector在actor字段级捕获getter错误，传普通facts给Model；其他异常归入整个适配器边界。
- [x] 配置缺省来自上述常量；readCpu返回{used,tickLimit}，缺失/非法不扫描。remaining<5跳过；每actor前elapsed>=maxCaptureCpu即停止。不改全局Date.now或共享环境。
- [x] 写并跑`danger_writer_ack_is_ambiguous`：
  - pending已赋值后writer抛错：详细reader调用0次，raw pending保留，不再claim。
  - final已赋值后writer抛错：有界只读回查一次；同key已终结则保留，不能用failed覆盖。
  - final未赋值且writer抛错：若回查仍是同key pending，最多一次小failed写；回查失败、schema未知或key已变则不再写。
  - 每事故write调用<=3；不跨tick重试。全部写不通时只返回固定失败码，不报告persisted=true。
- [x] 验证无视野count=null、二次读取0人仍partial/count_conflict、owner/body错误保留可读字段、CPU跳过不读取actor。GREEN后保存P2证据，不接入线上或改变控制schema。

## P3：关停之后的生产接入与故障矩阵

**Files:** 修改RemoteReconTrialService.js、recon-trial-runtime.cjs、guard fixture。

**Consumes:** P2 recorder；guard原来返回的state/permit/effects不变。**Produces:** 新危险控制提交后的hook，异常不会离开该可选hook。

- [x] 给fixture增加`guardOptions`注入；构造时合并后仍由fixture的`now:()=>nowMs`覆盖任何外来now。仅该guard fixture给Game.cpu补确定的tickLimit与读数，保持其他fixture/服务真实行为。
- [x] 写R3生产链RED：正常记录及recorder入口、标准化、pending/final写、字段、坏ledger、CPU等失败，均通过真实runTick/Spawn/ActionParser。
- [x] hook中的状态先写到测试闭包`seen`，**所有验收assert在scene.advance返回后执行**；不得把关键assert放在会被业务catch吞掉的recorder里面。抛错注入与状态采样分开，示意：

```js
const seen = [];
const recorder = () => {
    seen.push(readControlAndTaskState());
    throw new Error('injected_recorder');
};
assert.doesNotThrow(() => scene.advance({ visibility: true }));
assert.equal(seen.length, 1);
assert.equal(seen[0].allowOutbound, false);
assert.equal(seen[0].enabled, false);
assert.equal(seen[0].outboundTaskPresent, false);
```

此处readControlAndTaskState是该测试内局部helper，读取真实Memory配置、operation、global permit与任务，不替代实现。

- [x] 运行`& $dangerNode --test --test-name-pattern='danger_' src/tests/recon-trial-runtime.cjs`，确认原实现因缺少hook/记录而RED。
- [x] Guard constructor增加`dangerRecorder=recordStoppedTrialDanger`注入；advance保持原state写入、全部effect和global发布顺序。在它们成功之后，仅首次同tickdanger/home_danger调用recorder，外层独立try/catch；不包住既有控制链，不改return result。
- [x] 新hook错误仅写当tickglobal固定码`dangerEvidenceFailure={evaluatedAt,reason}`；后续同tickadvance保留该诊断，新tick init清除，不放入guard状态/outcome。失败标记写不到Memory时如实缺失，不阻断调用返回。
- [x] GREEN并检查完整R3断言：当前tick原危险原因、原总期限/出发leg不改；无第二次spawn及向危险房出发；next tick closureVerifiedAtTick>closeAppliedAtTick。原executing/unknown账本和其他scope保留。
- [x] 增加home_danger选房、非危险停止无记录、P2跳过仍关停与记录、旧outbound任务清理、已有合法返程允许等反例。运行整个recon-trial-runtime/model，不仅定向新用例。

## P4：Memory往返、模块重建与冻结恢复

**Files:** 扩展recon-trial-runtime.cjs、guard fixture及新模型测试；生产变更仅补前述模块内的契约遗漏。

**Consumes:** P1/P2持久ledger与P3真实停止链。**Produces:** 正常Memory提交后可复核的重置保证；不扩展任何期限或启动入口。

- [x] 写R4全部RED/反例。增加fixture的`restoreMemory()`：JSON往返整个Memory、重新绑定每个Game.creep.memory、再resetRuntime；prepare必须每次解析当前Memory中的raw配置，不能继续使用旧闭包raw。返回state/operation getter也必须读当前Memory。
- [x] `danger_reset_fixture_uses_current_memory`修改恢复后的配置并确认guard看见新值、旧Memory副本不变；修正只限guard fixture引用，不借此重构通用remote fixture。
- [x] 成功快照、关闭确认之前重置：逐项比较ledger与原快照相等；guard继续stopping→aborted；actor reader调用总数仍1、没有新spawn，两个总deadline和原leg不变。
- [x] pending写成之后用受控中断模拟未完成采集，再Memory往返和reset；下一tick给不同敌人。断言raw仍pending，summary effectiveStatus=interrupted，旧时间/对象不变、reader不再调用、write计数不增加。不要靠可选hook会吞掉的普通throw假装引擎崩溃；可直接固定测试存储为已合法提交的pending，再运行真实恢复链。
- [x] 分别覆盖只有global重建和新适配器模块实例（测试动态import加查询键，或注入新导出函数）两类恢复，不把ESM缓存下的新Guard实例当成唯一模块重建证据。去重必须依靠Memory，不依靠module Set。
- [x] 测旧终局无ledger为not_recorded、未知ledger schema不污染guard、迟到费用结算不改危险、已终局结果不随新视野变化；新版本读取旧事故保留原codeVersion，下一合法新事故只轮换独立ledger。
- [x] 针对纯模块和整条守卫链GREEN；不测试或承诺引擎未提交/外部删Memory能被恢复。保存P4比较对象和调用计数断言证据。

## P5：有界摘要、默认关闭与完整交付验证

**Files:** 适配器/Model的读取接口、Guard的dangerReader注入，runtime/纯测试、package.json及services/tests模块说明。EmpireMetricsService保持原代码，用回归验证其生产出口。

**Consumes:** 已提交ledger与guard current/previous完整身份。**Produces:** readTrialDangerEvidence及小metadata出口，不复制详细对象。

- [x] 写R5 RED。Guard constructor增加`dangerReader=readTrialDangerEvidence`注入；global现有summary不为空时附加`dangerEvidence={current,previous}`，读取有独立catch，不能替换已有status、permit或控制摘要。当前tick诊断失败另外保留，不伪装成captured。
- [x] 固定Summary字段为key、rawCaptureStatus/effectiveStatus、captureReason、observedRoom、decidedAtTick/capturedAtTick、hostileCount/capturedCount/actorsOmitted/truncated、historical=true、ageTicks/stale。age按capturedAtTick或缺失时decidedAtTick计算；未知/非法时间不能以0伪造新鲜。记录代码版本按身份匹配，不能用当前运行版本重命名旧快照。
- [x] 每份summary<=1500；极端转义身份使摘要无法带完整key时，返回小的summary_oversize失败摘要，禁止截断key造成错误关联；完整ledger保持原样。测试无actors/body/path/stack，历史读取不写store、不延长TTL观察时间。
- [x] 用真实EmpireMetricsService.cleanup验证既有浅拷贝透传；fixture仅将metricsInterval设1，并添加生产方法实际需要的最小事实。metrics.capturedAt变化而事故时标不变；telemetry.enabled=false时不导出metrics，但P0危险记录与关闭仍运行。
- [x] 验证默认关闭无namespace/无actor reader/无需求；旧已中止guard在部署后只读not_recorded，不执行新采集。快照owner已知且无武装也不能放行，摘要绝不能成为采运或Goal/Plan许可。
- [x] 把remote-danger-evidence.cjs加入现有npm test的node --test清单；更新services/tests说明，注明控制先行、独立存储及保证边界。
- [x] 执行下述完整验证；通过后做维护者自检和本地交付记录，不暂存、提交或部署。

## 命令、基线与交付记录

执行实施前，设置本会话局部运行时变量，并核实文件存在（不设置共享环境变量）：

```powershell
$dangerNode = 'C:/Users/mts-2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $dangerNode src/tests/smoke.cjs
& $dangerNode src/tests/room-governor.cjs
& $dangerNode --test src/tests/remote-mining.cjs src/tests/work-position.cjs src/tests/storage-reservation.cjs src/tests/goal-plan.cjs src/tests/scout-movement.cjs src/tests/route-occupancy.cjs src/tests/recon-trial-model.cjs src/tests/recon-trial-runtime.cjs
```

这是执行时的基线，不是今天已运行的结果。各批运行自己的定向命令；P3/P4补既有guard回归。P5加入新入口后实际有npm时可直接npm test；否则按下面完整等价集合执行，明确记录等价调用，不能声称运行了未执行的npm命令：

```powershell
& $dangerNode src/tests/smoke.cjs
& $dangerNode src/tests/room-governor.cjs
& $dangerNode --test src/tests/remote-mining.cjs src/tests/work-position.cjs src/tests/storage-reservation.cjs src/tests/goal-plan.cjs src/tests/scout-movement.cjs src/tests/route-occupancy.cjs src/tests/recon-trial-model.cjs src/tests/recon-trial-runtime.cjs src/tests/remote-danger-evidence.cjs
```

dry build必须只在子进程去掉DEST和ROLLUP_WATCH。先确认不存在本任务残留的临时.secret文件；不输出凭据，不擅自删已有文件。明确不使用push/watch命令：

```powershell
& $dangerNode -e 'const {spawnSync}=require("node:child_process");const env={...process.env};delete env.DEST;delete env.ROLLUP_WATCH;const result=spawnSync(process.execPath,["node_modules/rollup/dist/bin/rollup","-c"],{env,stdio:"inherit",windowsHide:true});if(result.error)throw result.error;process.exit(result.status??1);'
git diff --check
git diff --cached --check
```

每批记录实际RED断言、GREEN命令/退出码及对照范围。未跟踪的新文件另做文本格式检查，不能用空git diff --check宣称已覆盖它们。最终新增`docs/superpowers/evidence/2026-10-20-remote-danger-evidence-local-validation.md`，写实际测试数量、dry build、HEAD/status、未覆盖项；不复制历史330/330，不宣称恢复昨天缺失身份或完成线上验收。

维护者检查：没有重复观测/全局seen去重、没有诊断异常越过控制边界、没有吞掉控制错误、没有放宽危险门槛或期限、没有未限长Game对象、没有在重置后回填旧事故。成功Memory往返与无视野/失败场景分别报告。

## 覆盖与停点

| 已认可回归组 | 实施批次 |
| --- | --- |
| R1身份/字段/容量/未知schema | P1，P2 actor读取完善 |
| R2去重/字段与读写失败/CPU | P2；关停交叉验收在P3 |
| R3真实动作前关停与故障注入 | P3；跨重置后继续在P4 |
| R4跨tick/JSON/reset/历史冻结 | P4，P5只读展示 |
| R5默认关闭/有界摘要/兼容 | P5；完整现有测试作最终门槛 |

用户审阅后已完成上述本地实施，当前停在本地交付。提交/发布、下一次有限侦察、实际采运和Goal/Plan启用均需用户后续明确授权。不存在自动进入下一阶段的条件。
