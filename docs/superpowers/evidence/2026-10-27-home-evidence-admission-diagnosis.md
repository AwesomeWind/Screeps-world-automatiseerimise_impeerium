# 母房自然采集窗首次无数据：本地诊断

日期：2026-10-27。范围：只读本地源码、既有 HTTP 记录和离线故障注入；未联网、未修改生产实现、未提交、未部署、未重开采集窗。

## 结论与证据等级

本轮能证明的是 **arm 配置已应用，采集器 admission 未确认**，不能表述为“已经接纳，然后丢了数据”。唯一生产根因尚不能从现存记录确定。

已复现的代码问题是：首次接纳未成功时，没有持久化的接纳结果；实例 `lastError` 会被后续 `invalid_request` 覆盖；对象选择的具体失败原因被 Model 合并为 `invalid_selection`。这使不同起因在 HTTP 上表现为同一个“路径缺失”。应先修复这条证据链，不能据此放宽接纳或安全门槛。

基线：分支 `codex/single-remote-mining`，HEAD `48dfc0e75d1b71a5101d910364b6620eb530b4e6`。分析代码对应此前已发布版本 `1793072703455`；本轮没有线上刷新版本或开关。

## 1. 保存记录中的时序

证据根目录：`.superpowers/sdd/2026-10-27-home-natural-evidence-operations/attempt-01/`。

| 保存文件 | 事实 | 能证明什么 |
| --- | --- | --- |
| `request-receipt.json`、`result.json` | 原请求 ID 为 `home-w49-20261027-01`；issuedAtMs=1793081588821，expiresAtMs=1793082188821；acceptNotBeforeTick=acceptNotAfterTick=83898135 | 请求只有原 tick 83898135 一个接纳机会，不是随后任意 tick 都可开窗 |
| `monitor-0.json` | GameTime=83898135；policy.enabled=true、请求匹配；header/capture 缺失 | 配置已应用；读回可能早于该 tick 最后 cleanup 持久化，单个样本不能证明该阶段已执行 |
| `monitor-1.json` | GameTime=83898139；配置仍匹配，header/capture 仍缺失 | 没有取得 admission 或首行的持久化证明 |
| `post-snapshot.json` | GameTime=83898141，operation/telemetry 在83898140评估；自身 policy.enabled=false | 关窗后的读回，不是锚点 gate 的记录 |
| `download/response.json` | `{"ok":1,"data":"Incorrect memory path"}` | 下载时目标路径缺失，不等于零事件、零行或 API 不支持 |
| `raw-post-audit.json` | 原始前后记录核对：自身关闭、其他实际业务权限关闭、旧记录匹配 | 这是保存样本的离线审计，不是本轮在线检查 |

`completion.json` 保留 `capturedRows:null`、`closed_without_window_evidence`。不得将 null 改写为 0 或据此宣称 API 验收通过。

原 result 中 `RECON_REJECTION_TICK_INVALID` 来自运维脚本用归一化后的 recon 记录比较原始 tick；原始前后审计已单独纠正，并保留旧结果。该比较错误发生在关闭后，不能解释采集窗为何没有首次生成。

## 2. 接纳入口与实际 gate

代码：`src/services/HomeEvidenceWindowService.js:127-188`；Model 请求校验 `HomeEvidenceWindowModel.js:25-36`。

首次机会的顺序是：读取设置/CPU → 校验请求 → 必须原 acceptNotBeforeTick → 标记本 Game 对象中已尝试 → CPU → gate → 选择对象 → pending/final admission 写入 → CPU → 首个 packet/capture 写入。

以下任一情况都可以在首次 writeStore 前返回，留下不存在的 namespace：CPU 不足、gate 未确认/不安全、母房非 normal、无可选 cohort、候选遍历超限、选择或提交前 CPU 超限。单次接纳与不补开是既定防重放约束，本轮不将它改成重试机制。

下一 tick 原零宽请求已不满足 validator，先返回 `invalid_request`，不会到达 `missed_admission` 判断。它会覆盖实例中的首因。`lastError` 未进入 Memory，也不在只读 facade 中返回；服务重建后同样不能作为历史证据。

实际 gate 不是只看策略开关（`HomeEvidenceWindowFacts.js:48-104`）：

- 所有类型正确的开关、既有 recon/economic/native 状态都必须有效，实际许可关闭。
- 保留 enabled=true 的历史包络须原身份、双期限、终态、closure 与 tail 证明均匹配；不改写历史包络。
- 每个远程 operation 必须 `evaluatedAt===当前 tick`，scope.operation 必须是同一对象，operation 和 scope 的实际出发权限均关闭，配置与 scope 不得缺项。
- 母房可见、己方所有、无敌人，当前 `global.RoomPhase` 的 recovery.mode 必须为 normal。

保存的前后 metrics 为 normal/core2矿工3运输者，只是邻近 tick 证据。未保存83898135的 RoomPhase、scope 引用、gate 首个拒绝子项，不能用相邻正常状态反推锚点必然正常。

额外核对的“关停效果替换 scope.operation 引用”假设没有得到所读实现支持：RemoteMining analyze 在140行放入当前 operation；recon/economic close_scope 分别原地赋值或 Object.assign（RemoteReconTrialService.js:214-232、RemoteEconomicTrialService.js:558-562）。这不足以证明锚点引用正确，但不支持将该正常路径宣布为根因。未发现 src 中实际 RawMemory 整体覆盖调用；也未发现除 Home 写入器外其他生产模块管理此 homeEvidence 路径的实现。

## 3. 对象选择

代码：`HomeEvidenceWindowFacts.js:107-149`。

选择器遍历所有 Game.creeps，要求原生 id/位置、己方、已出生、位于母房，以及 `Memory.creeps[name].role` 在允许角色中。按 miner、hauler、builder、repairer、upgrader 优先各取一名，最多4名。随后加入 source、storage、terminal、任务目标和 container，最多16个对象。

200是遍历候选上限，包含全 Game creeps、sources、任务目标和全部 FIND_STRUCTURES，不只是最终16对象。前置 HTTP 房间记录可数出至少143个候选，但不包含 Game 全表、真实角色 Memory 与任务目标，因此不是精确 selector 总数，不能据此证明200上限通过。

保存的7名 creep 名字可推断角色，但原 room-objects 不含 Memory.creeps。离线回放显式声明用名字前缀构造角色，得到4名 cohort、11对象；这说明该形状能够通过，不证明线上实际角色字段存在。缺少角色时可复现 `no_cohort`，Service 却只保留 `invalid_selection`。

## 4. CPU 与生命周期

`HomeEvidenceWindowService.budget()` 在 cleanup 入口记录 initial CPU，要求 bucket≥5000、初始余量≥7、阶段增量<2、当前余量≥5。选择循环与复制/校验/pending/final写入之间有检查点，达到边界就拒绝；软预算不是硬引擎中断保证。

Home 是最后 cleanup/P3。gate 后的对象选择、校验、序列化和提交也消耗这同一份预算。gate 内目前没有细分 CPU 记录；后续 checkpoint 发现超额不能倒推出是哪一子阶段消耗。保存的 cleanupEwma 是低频聚合，不是83898135的 CPU 输入或阶段耗时。

main 的生命周期调用没有逐服务吞异常：前序 analyze/run/ActionParser/cleanup 抛错，可使当 tick 根本到不了 Home cleanup。此为源码支持的替代解释，现存记录没有锚点执行边界/异常证据，未证明线上发生。不得为此扩大主循环 catch 范围。

## 5. 六组离线回放

脚本与机器可读输出：`.superpowers/sdd/2026-10-27-home-admission-diagnosis/replay.mjs`、`replay.json`。脚本直接调用现有 Facts/Model/Service；输出绑定原始记录 SHA-256，运行带离线网络 guard。

| 受控输入 | 当前实现结果 | 证据边界 |
| --- | --- | --- |
| 保存状态形状＋声明的正常 gate/角色/CPU假设 | namespace 存在、首行1、admit/capture共4次write、模拟事件读取1次 | 不是真实引擎事件或锚点生产输入 |
| 锚点 recovery 非 normal | 首因 home_not_ready，无namespace；下一tick变invalid_request | 已复现首因覆盖 |
| 不提供角色 Memory | 底层no_cohort，Service invalid_selection，无namespace | 已复现选择原因合并；不证明线上角色缺失 |
| FIND_STRUCTURES 后注入 used=2.01 | cpu_skipped，无namespace | 故障注入，非生产测量 |
| 初始 used494/tickLimit500 | 余量6不足7，cpu_skipped，无namespace | 故障注入 |
| 第一次调用在锚点+1 | invalid_request，无namespace | 证明晚到不补开；不证明 console 实际相位 |

## 6. 下一步

建议先做“首次接纳诊断回执”，使未接纳也能通过同一路径下载首因、实际 gate 子项、对象选择计数和 CPU 阶段；保持未证明为 unknown。详细候选设计与回归矩阵见 `../specs/2026-10-27-home-evidence-admission-diagnostics-design.md`。

不推荐：延后/放宽锚点、扩大 CPU 或候选限额、按名字替代真实 role、将空对象当作采集成功、改历史包络为false、自动重放旧请求。它们都不能从当前证据推出，也会改变既定边界。
