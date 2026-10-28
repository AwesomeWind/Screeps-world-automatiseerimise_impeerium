# 母房自然采集：首次接纳诊断回执候选设计与回归计划

日期：2026-10-27。状态：候选设计，未实现。关联诊断：`../evidence/2026-10-27-home-evidence-admission-diagnosis.md`。

## 目标与不变量

修复已经复现的“首次失败不可下载、首因被覆盖、选择失败原因丢失”。它不承诺修复尚未唯一定位的生产启动失败；下一轮有界执行若仍不启动，应能区分在哪个阶段停止。

保持默认关闭、不自动建立namespace、不写业务Memory、不执行游戏动作。请求schemaVersion1及原10字段不变；仅原acceptNotBeforeTick一次接纳，不补开、不续期。30秒新鲜度、100观察tick或原issuedAtMs+10分钟、candidate200/cohort4/object16、事件和总容量上限、CPU bucket5000/reserve5/capture2不放宽。观察窗故障不影响原P0守卫和关闭，unknown不重放。

本轮不执行该方案，不联网、不提交或部署，不改当前已关闭状态。旧请求、旧锁和旧attempt完整保留，不能用这个设计补写83898135的历史原因。

## 方案选择

1. 仅暴露实例 lastError：改动小，但服务/global重建即丢失，而且下载仍是路径不存在；不能满足跨tick可审计需求。
2. 独立诊断namespace：避免原Store升级，但一次HTTP GET无法原子获得诊断与窗口，需要额外路径/读取协议。
3. **推荐：同一 homeEvidence 路径下有版本的 admission envelope。** 新写入采用 Store schemaVersion2，将 admission 与可空的 window 分开；旧v1合法窗仍按原语义只读解释，不自动迁移。HTTP一次下载即可区分“未接纳”和“已接纳无首行”。

该升级需要同时更新 Model/Service/Report 和已有 HTTP decoder，范围明确大于单个lastError补丁；其必要性是不能用伪造cohort/空window绕过严格v1校验。

## 状态与写入协议

根对象建议为 `{schemaVersion:2, profile:'home_natural_v1', admission, window:null|原合法window}`。window保持既有严格字段与约束，不能因为有诊断而接受不完整window。

admission只保留当前一个固定请求的有界记录，不引入历史列表、自动淘汰或换ID能力：

- 原请求/版本/锚点和原expiresAtMs；首次被本服务**实际观察**的tick/ms，不将arm ACK当作该时间。
- 最后确认阶段、firstOutcome/firstReason。首次结果冻结，后续late invalid_request可作独立当前状态，但不能覆盖首因。
- gate的 known/closed/homeReady 与有限子项：类型/历史包络证明/operation新鲜度/scope同对象/母房所有权/敌人/恢复模式。子项用 true/false/unknown 和固定枚举，不复制完整业务状态、名字列表或堆栈。
- selection的访问计数、有效角色数、cohort/object数量和具体reason；未走到的字段为null，不能填0。
- CPU有限阶段样本：入口、gate后、selection后、pending前后、final前后；保存used/tickLimit/bucket、差额及阶段名。未采到为null；读CPU失败保留unknown。
- 固定的pending/unknown写入标记，区分未调用、已调用待确认、已确认。持久化成功是接纳证明的一部分。

建议diag序列化上限8192 UTF-16字符，包含在现有整体131072字符限额内，不额外扩大总容量；首行及封存仍预留原有容量。结构采用固定枚举与有限槽位，禁止无限append。

在原锚点且请求身份/时钟检查通过、CPU允许时，先持久化最小“attempt reserved”回执，再进入gate/selection。回执本身不是接纳，不允许getEventLog或capture。窗口admission仍须全部gate和selection通过并写入/读回确认后成立。

最小回执也必须使用有界pending→final与读回：pending/结果不明即禁止采集、禁止同/异ID重试，不能将reserved误当可恢复的工作队列。最终记录 rejected、unknown或accepted；accepted与首行完成分开报告。

诊断记录失败只使本观察尝试停止，不影响业务关闭。软CPU不足时只保留已取得的内存首因；若原始尝试尚无持久记录，允许的后续行为最多是原身份/原期限内、预算允许时封存已观察到的诊断，**不能重走gate以重新授权、选择对象或接纳窗口**。写入已经调用但不明时禁止自动重写该提交。实际global reset前尚未保存的首因无法保证留存，报告必须明确该缺口。

若本服务第一次看到请求已晚于锚点，只能记录“late_seen / admission未发生在本服务可证明范围”，不能倒推上游异常或CPU超限。若Home cleanup完全没有执行，本服务也无法自行证明原因；不为了填补该盲区把业务判断移进main，先报告not_observed。非法/失效请求不自动创建持久namespace。

## 失败语义与报告

区分配置应用、尝试回执、正式admission、首行持久化、后续配对。status/report/readPage继续严格只读，不ensure或prune。HTTP decoder严格分派v1/v2，拒绝未知schema、超限或不一致状态，不增加失败重试或备用路径。

推荐报告枚举：missing（无可验证回执）、reserved/interrupted、rejected（带首因）、unknown（提交不明）、accepted_no_row、recording、sealed。其中缺失或无首行不能推成零事件；没有相邻快照和原生日志匹配就仍为unproved，不授权任何远程或Goal/Plan动作。

Model保留selection.reason，Facts返回有界子项；运行时不再把所有选择失败只展示成invalid_selection。CPU超限保留最先观察到的阶段，但不能把“在checkpoint发现”说成“该阶段是耗时唯一来源”。

运维端的成功判断改为读取明确admission证明；配置读回只写configured。关闭后下载 v2 rejection 也是一次成功的**诊断读取**，不是采集成功。此次原始结果和锁不变；任何新运行仍需要独立授权，不沿用旧执行卡。

## 回归计划（下一轮本地RED→GREEN）

| 批次 | 先写的失败场景 | 必须满足的断言 |
| --- | --- | --- |
| 1：时序与首因 | 原请求零宽anchor，锚点gate拒绝、下tick失效；首次可见晚一tick；前序阶段异常跳过cleanup | firstReason冻结；没有admission/捕获；未执行阶段为unknown；不改原窗口与新鲜度；ACK不升级成admitted |
| 2：真实gate | 保存的严格历史包络；scope缺失/复制对象/过期评估；开放权限；non-normal；字段损坏 | 原拒绝逻辑不放宽；明确子项；不改旧费用/锁/包络；gate已知关闭与业务权限分别核对 |
| 3：对象选择 | 原生id/pos；有无真实role Memory；no_cohort；200/201候选；多房creeps；16对象截断；任务目标 | 不按名字推角色；具体reason保留；计数准确且未观察为null；最终固定cohort；原200上限不变 |
| 4：CPU与持久化 | bucket4999/5000、入口余量6/7、delta等于2；gate/selection/复制/校验/pending/final各阶段超限；读写抛错与读回冲突 | 所有阶段走原软预算；pending/unknown不重放；recording只有确认admission后产生；诊断失败不阻断既有关闭；不新开第二次attempt |
| 5：跨tick/重建/容量 | JSON重载、新service、模拟global重建、reserved中断；第一结果与后续generic错误；8192/131072字符及Unicode边界 | 已持久证据保留；未持久证据不伪造；只封存原诊断不再admit；原期限不延长；满额拒绝不删历史；unknown不能换ID |
| 6：兼容和端到端离线链 | v1旧窗、v2 rejected/window=null、accepted_no_row、合法窗口、未知schema、HTTP缺失/损坏；默认关闭 | v1不迁移；下载路径/GET上限不变；decoder严格；无数据不作0或通过；默认关闭零namespace、零事件读取；不创建业务目标/许可 |

每批测试必须经过“当前实现因对应行为失败”的RED，再用受控实现达到GREEN。已有六组回放只描述当前行为，不算这些修复回归已经完成。

随后执行完整现有游戏回归、HTTP decoder回归、smoke、Governor与隔离仅构建、diff检查；不联网、不上传、不以本地GREEN替代原生API/CPU/global reset验收。完成后再提出一轮保持原限额的生产诊断执行卡，不能自动重开。

## 实施前验收标准

1. 首次失败在可写且预算允许的情况下能够通过单次HTTP读出，细分gate/selection/CPU/提交阶段；不可取得时明确unknown。
2. 首因不会被晚到的invalid_request覆盖，正式接纳与首行证据独立。
3. 任意记录失败、跨tick或重建都不产生补开、重放、延长或新业务许可。
4. 默认关闭与v1兼容不产生额外写入，旧锁/日志/费用不变。
