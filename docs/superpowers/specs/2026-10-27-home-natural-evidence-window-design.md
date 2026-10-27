# 母房自然行为：游戏内有界采集与 HTTP 下载

日期：2026-10-27（Asia/Shanghai）

状态：候选设计，待用户审阅；没有实现新服务、上线或开启任何采集。本次只获准本地分析和设计，全部现有功能开关保持关闭要求不变。

## 1. 目标与依据

先在 shard3/W49N41 观察既有 miner、hauler、builder 等自然行为，验证游戏内采集→Memory 留存→HTTP 下载→离线解释的闭环。重点是原生事件与相邻 tick 库存变化能否对齐，而不是推进经济试点或制造成功样本。

已有经济窗口默认关闭时不创建 namespace，且实际采集须绑定远程经济接纳；详见同日 missing 诊断。新窗口不能通过伪造 economic/native identity 或放宽旧 admission 达成。

本轮不证明远程安全、经济新产出入库、净收益、完整尾部、实际 global reset 或业务重新接纳。没有自然 HARVEST/TRANSFER、并发无法排除或视野不够时，如实报告未证明，不强派单位或续窗。

## 2. 候选路线与推荐

| 路线 | 收益与成本 | 判断 |
|---|---|---|
| 给现有经济窗口加“无经济身份”分支 | 少增模块，但会改变原 schema、admission、绑定及报告含义，容易使母房样本混入经济证明 | 不推荐 |
| 独立默认关闭的母房录制窗，共用 HTTP 基础 | 新增窄 Model/Facts/Service/Report；原经济协议不动，自然行为独立成证 | 推荐，主代理提出，尚未获实施批准 |
| 继续 POST console+WebSocket 临时采样 | 无需新持久化服务，但恢复外部实时连接依赖，不能解决离线后取回逐 tick 样本的问题 | 保留旧工具，不作为本目标主线 |

初版只保留一个母房窗口，不做通用监控平台、自动滚动历史、多房或自定义源。后续扩展另行设计，不预建换轮/删除机制。

## 3. 隔离的配置、身份和存储

拟新增默认配置 `policy.homeEvidence={enabled:false,request:null}`。编译 profile 固定为 `home_natural_v1`、shard3/W49N41，不能通过 Memory 选择其他房间、API、callback、模块或 HTTP URL。

拟新增存储 `Memory.empire.observations.homeEvidence`：

```text
schemaVersion: 1
profile: home_natural_v1
window:
  header: windowId, codeVersion, shard, roomName, request, cohort, objectIds
  bounds: acceptedAtTick, lastAllowedTick, issuedAtMs, expiresAtMs
  rows: 有界逐 tick 记录
  capture: revision, phase, coverage, lastCommittedTick
  pending: 可选的不完整提交标记
  seal: 终态原因、tick、时间及覆盖信息
```

自然观察身份只有窗口、版本、房间和固定来源 profile，不含经济 trialId/tripId/nativeId，不造 0 费用或 unknown 账。没有把 sample 写回 `remoteMining.evidenceWindows` 的兼容分支。

旧 namespace、旧请求、锁、费用和未决凭证一字不动。已有 expired 的 `enabled=true` 历史包络不能当成有效权限，也不为了采集将它们改为 false；实际权限判断沿用原有纯只读规则。不能调用会 prune/结算的预算查询充当只读检查。

初版仅一个窗口。存在旧窗、损坏窗或 unknown admission 时拒绝另一 ID，保留旧数据；不自动淘汰、覆盖、清理或自动换轮。下载本身不写回“已导出”标志，未来清理/换轮另获授权。

## 4. 时间、容量与停止

以下是主代理建议的设计初值，尚不是性能实测结论。

| 项目 | 拟定限制 |
|---|---|
| 观察范围 | 仅 W49N41 的自然行为 |
| 观察时长 | 最多 100 个观察 tick 或 issuedAtMs+10 分钟，先到即止 |
| 接纳 | 请求 schema/ID/版本正确，issuedAtMs 新鲜度≤30秒，接纳 tick 区间≤10 ticks；不得重算原请求 |
| 接纳后的 tick 窗口 | 一次固定 acceptedAtTick，到 lastAllowedTick=acceptedAtTick+99；重建/暂停不续期 |
| cohort | 接纳时固定最多4名已存在、己方、非 spawning 的本房 creep；不补员、不替换死亡或离房者 |
| 对象快照 | 每观察 tick 最多16个固定对象，含 cohort、source、相关能量目标；固定选择优先级，不随事件追补过去 |
| 事件 | 每房每 tick getEventLog 最多调用一次；原生日志数量>128即标溢出；最多存32条白名单相关事件/行 |
| 记录行 | 最多100；不以丢弃开头换取更多末尾数据 |
| 字符容量 | 完整 store≤131072 UTF-16 code units，包含 header/pending/seal；实际候选序列化计数 |
| CPU | bucket≥5000、初始可用≥7、预留5、采集增量2的阶段软预算；不可读/不足即不接纳或跳过可选采集 |

100个观察 tick 是100次当前状态观察，最多99个可在窗内完整配对的状态过渡。第一行没有本窗 T−1 快照；最后一行不涵盖它当 tick 新意图的结果，不额外加尾部 tick 续窗。

100行不保证一定写满：32事件/16对象是单行上限，字符容量可能更早触发。每次候选必须预留终态/pending空间；达到容量就尽力封存 capacity/partial，保留已有行，不截断单条 JSON 或删历史凑完整。

正常到界封存；失去母房所有权/视野、出现敌方、实际业务权限意外开启或无法确认关闭时停止采集并记录原因，不修复策略或启动防御。cohort 中单位自然死亡、疲劳或离房只记缺失，不能据此替换人选或移动单位制造样本。

默认关闭且没有旧活动窗时不建数据 namespace、不调用事件/对象采集。中途关掉本观察开关、撤回/改变请求时立即停止事件和对象读取，仅允许对原窗尽力做一次有界的终态提交；写入失败不能导致继续采集。已封存窗不改 lastAccess，不再次采集。

CPU预算不是单次原生 API 的硬中断保证；引擎硬 CPU 终止或整个 Memory 不可写时，无法保证错误标记/封存成功。租约到期仍使有效采集权限失效，下载报告要能标识未封存、缺口或过期，不能因此伪称完整。

## 5. 接纳与自然对象选择

接纳前确认编译版本/shard/母房所有权、母房正常阶段、无敌方以及既有侦察/采运/Goal/Plan/市场实际关闭；未知拒绝。旧经济观察窗仍为关闭。只检查，不调用原启动、release、spawn、物流或市场动作。

cohort 按固定优先级选取：miner、hauler、builder、repairer、upgrader，优先不同角色各一名到4名；同角色按原生 ID 稳定排序。绑定 name+Game ID+接纳时 role/my/room，不借本轮外新单位身份。候选遍历最多200项，超额则标无法完整选择并拒绝接纳，不无限扫描全帝国。

对象集合在接纳时固定：先 cohort，再本房 source、storage/terminal，再所选单位当时已知的合法 Game 目标和容器，稳定去重到16项。任务仅提供候选 ID，不证明动作执行；只从实际 Game 对象读取快照。不足以覆盖的目标、后续新目标没有 T−1 快照，就不做该笔库存对齐。被排除的自然流仍可使相关并发不明，不能忽略它取得一致结论。

读取原生 `pos.x/y/roomName`，不假定这些属性是 enumerable；只存 energy、type、my、有限 role、位置和存在性。没有坐标或库存就存 null/原因，不把消失当空载或补0。

## 6. 生命周期与故障隔离

建议新增 `HomeEvidenceWindowModel/Facts/Service/Report`，保持项目现有分层。Service 放在服务列表末尾的 cleanup，标为 P3；必须自行检查预算，因为当前调度器总是允许 cleanup，且 scheduler.enforce=false。

此处“只读”指对业务与 Game 动作只读；为了跨 tick 留证，collector 必须能写它独占的 `observations.homeEvidence`。写入权限不覆盖业务配置、任务、单位 Memory 或原经济账。当前本轮设计没有实际授予线上这个写权限。

采用不可变 header、每 tick 唯一记录包和有界 pending→final 提交，复用既有机制的原则而不强行复用经济对象。普通异常在独立服务内隔离；原 P0、ActionParser、关停和 telemetry 顺序不能由观察成功与否决定。

相同包重复不累加；同 tick 不同内容标 conflict，不覆写。写前异常不补造提交，写后异常只读比较原内容；不明提交保留 pending，后续不重放该包。admission unknown 在 JSON重载/服务重建后仍阻止另起同轮或换ID重试。不能以新 tick、新版本或新 ID 清除未知。

运行阶段 `recording→sealed`；接纳不成功时尽量存有界拒绝原因，但不创建活动窗口。版本变化停止，不能将不同版本拼成一段。普通重建可在原窗原期限内继续；缺失包保留缺口，不从当前 Game 倒填历史。保存失败标记也失败时，后续以预期 tick 序列发现缺口；没有错误标记不等于没有丢帧。

## 7. 逐 tick 采集和证据解释

cleanup 的 Game 对象是本 tick 开始时的状态，不是本 tick 刚发意图已经生效。每行分别存 observedTick=T、declaredEventTick=T−1、observedAtMs、固定 schema、CPU 前后值、覆盖与原因。

事件只保留白名单：event、objectId、targetId、resourceType、amount、原房间/序号。保留涉及固定 cohort 或固定对象的相关并发事件，其他原生事件只做有界类型计数，不存整间事件原文、任意 data、完整 Memory、完整 task/path 或凭据。

HARVEST 只有相邻、无缺口的两个快照、同一 actor/source 身份、正安全整数金额，actor增加和source减少与事件金额一致、无其它相关事件或未解释变化时，才标“本观察对一致”。source再生、容量限制、额外能量消费或竞争均可能使这次无法证明；不乐观分摊。

EVENT_TRANSFER 可能关联 transfer/withdraw/link 等，不能仅按事件名称认方向。初版先记录事件与双端有符号 delta：明确匹配 actor减少/target增加的 creep→目标模式才标 transfer 一致；反向模式单列 withdraw_candidate/unverified，link、跨目标、同 tick 双向并发、未知资源或不完整类型均不计为已验证 transfer。绝不能把 withdraw 当母房入库。

“没有匹配事件”“没有自然发生所需行为”“API不可用”“形状损坏”“事件溢出”“并发”“对象缺失”“缺帧/CPU跳过”分开报告。没有日志不能填产量0；source的减少不能单独当采出，storage净增加不能单独当本轮收入。BUILD进度和REPAIR hits不换算成费用。

报告分别展示：方法可用性、字段形状、tick覆盖、自然HARVEST配对、自然TRANSFER配对、CPU与Memory开销、封存和持久化留存。支持方法和 shape 不是生产语义核实；simulated fixture 永远不能提升为生产已验证。真实样本至多说明所采版本/房间/模式，不能自动设置旧经济采集器的 verified 标志或转成经济执行许可。

## 8. HTTP 下载与旧协议兼容

拟新增专用固定读取：

```http
GET /api/user/memory?shard=shard3&path=empire.observations.homeEvidence
```

旧经济请求仍读取 `empire.remoteMining.evidenceWindows`，原 decoder、身份校验、报告与旧消耗记录不改变。不重用已执行的 online-attempt-01，也不在“missing”时自动切换路径再发第二次GET。

传输层抽取共享有界 HTTP/Memory envelope 解码基础（GET/取消/期限/gzip/UTF-8/原始响应），profile 只允许编译枚举 `economic_trial_v1` 或 `home_natural_v1`；每个固定 URL 对应自己的 schema validator/report。不能接受任意 path、URL或用户函数，不把自然 store 强行包成经济 store。

未来下载仍为单独明确授权、全新目录、最多一次 GET；请求15秒/总窗口60秒、失败不重试、不刷新 token、不跟重定向、不开 WS/console。保存原始响应、专用 store、报告、传输元数据与本地 SHA-256；本地哈希证明文件一致性，不证明服务器完整运行或经济通过。

第一次自然采集封存后，优先稍后一次下载，不要求客户端在100 tick期间在线。无法精确知道封存完成就按原截止等待，不无限轮询。读到 active/partial/unsealed 时按实际状态报告，不能拼后续读取凑完整，也不自动清记录。

## 9. 未来授权步骤

1. 审阅本设计和回归矩阵，另批准本地分批实现。当前不实现产品服务。
2. 本地 RED→GREEN、完整测试、隔离目录仅构建和兼容检查。保持全部默认关闭，不联网。
3. 另获发布授权后部署默认关闭版本并核对。发布本身不创建目标、开窗或启动经济试点。
4. 另获母房采集授权后，仅开启一个 home_natural_v1 有界请求；旧经济观察窗、侦察、采运、Goal/Plan、市场继续关闭。只读自然动作，完成/异常/上限自动停止采集并保留记录。
5. 另按具体一次下载卡读取封存窗口。对已取得和未取得的证据逐项报告，再决定是否需要后续经济验收方案。

以上是候选流程，不是本次线上授权，也不继承历史失败卡/已消耗GET额度。功能保持关闭时缺少数据是正常现象，不能为了避免 missing 而自动开窗。
