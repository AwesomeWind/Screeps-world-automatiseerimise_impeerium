# 远程危险情报留存设计

日期：2026-10-20。状态：用户已认可设计、回归及分批计划；五批本地实现和一次只读独立review后的修复已完成。完整测试387/387、smoke、room-governor和dry build通过；未暂存、提交、推送、部署或操作线上。交付见`docs/superpowers/evidence/2026-10-20-remote-danger-evidence-local-validation.md`。

## 1. 目标与事实依据

2026-10-19的W48N41试点在tick83736139因danger中止，持久intel记录(49,38)和hostile=true，却没有单位id、owner或body。事后无Game视野、远房历史分块404，无法确认是谁。守卫次tick关闭和scout返家均已有证据，缺口是事故对象留存，不是关闭条件不够宽松。

当前collectRemoteIntel只保存Controller归属、source、危险坐标和布尔值；守卫outcome冻结了停止原因和已有安全计数。WarIntel只覆盖己方拥有的房间，不能为该远房补身份。依据见`docs/superpowers/evidence/2026-10-19-w48n41-danger-source-readonly.md`。

本功能只解决：未来托管侦察因非己方单位停止时，尽可能保存**同tick的可归属危险快照**，并在后续tick、global重建和正常Memory重载后可读。记录失败不得阻碍既有停止链。

### 本批边界

- 第一版接入已有RemoteReconTrial的首次`danger`/`home_danger`中止。前者记录targetRoom，后者记录baseRoom，禁止把母房危险标成远房危险。
- 不给非托管经济远程矿增加采集生命周期，不新建自动侦察、敌我外交、兵力决策或战争系统。辅助模型可复用，其他接入以后单独设计。
- FIND_HOSTILE_CREEPS的既有停止语义保持：非己方单位即触发，不要求武装或实际攻击。保存owner和部件不意味着开始允许无武装单位、友方或特定NPC通过。
- 不修改300ticks/20分钟、一轮最多一名scout、100连续安全ticks、原leg期限/一次重规划、预算、费用与次tick关闭确认。
- 侦察、实际采运、Goal/Plan保持关闭约束；Governor shadow=true、scheduler.enforce=false、market=false。没有新启动、release或线上Memory写入授权。

## 2. 方案比较

| 方案 | 收益与风险 |
| --- | --- |
| 独立、有界的危险证据存储；既有守卫关停之后写入（推荐） | 详细证据不进入许可计算、控制schema和冻结outcome的深复制；单独坏数据不会使守卫状态无效。需要按完整会话身份关联。 |
| 直接把完整敌方对象加入outcome.evidence | 路径短，但当前模型会复制、验证并导出该对象；错误字段、大小和兼容问题更容易影响控制链。 |
| 只依靠外部API/历史和日志 | 无新增运行时数据，但此前已证实断线、无视野及404会使身份永久缺失，不能满足目标。 |

选择第一种。沿用纯模型、Game/Memory适配与既有service接入，不增加P0服务或动作执行器。

## 3. 控制优先的执行顺序

`RemoteReconTrialService.advance`已有顺序为：采集安全事实 → 纯模型决定停止 → 持久化守卫状态 → 应用close_scope/cancel_unstarted/clear_outbound → 发布global许可/摘要。

本设计仅在上述控制提交、关闭效果和拒绝许可已完成之后，加入一个被独立try/catch包围的记录hook：

1. 保持原危险布尔检测与停止原因优先级；不在Facts、模型或spawn/action许可查询里读取详细敌方字段。
2. 现有控制状态先进入stopping，应用原关闭/取消/任务清理效果，发布allowSpawn=false、allowOutbound=false。原始控制错误不被新hook吞掉。
3. 只有本调用观察到`before`无outcome、`after`首次产生danger或home_danger，且decidedAtTick等于本调用tick时，才尝试记录。
4. 写一个小的pending事故标记，再读取同tick真实房间对象，标准化并提交最终快照。这里不调用游戏动作、不等待网络、不发布事件需求。
5. 采集器、字段、标准化、写入、诊断摘要任一新增步骤抛错，均在hook内转为有界失败结果；不能越过hook抛出并阻止后续服务/动作门槛。控制结果、原因、期限和费用不回滚。

关闭策略不会移除本tick已有Game房间视野，因此通常仍可取得同tick对象；若实际取不到，应记录缺口。记录hook不决定关闭是否成功，次tick关闭确认仍由原守卫完成。P2 RemoteMining被跳过也不影响P0守卫的这一路停止与尽力记录。

不扩展guard纯模型的state schema或outcome结构。`closeManagedScope`目前用于scope_stale等其他原因，不为其编造危险快照。其他停止原因即使同tick存在敌情，也不冒充“危险导致停止”。

## 4. 独立存储与身份

新增懒创建路径：`Memory.empire.remoteMining.dangerEvidence`。

```json
{
  "schemaVersion": 1,
  "records": []
}
```

最多保留**最近两次危险事故**，新事故在前。不是每tick日志，也不等同于守卫current/previous：没有危险的新会话不会挤掉旧事故。记录只凭原始完整身份关联：

`(trialId, sequence, remoteId, epoch, codeVersion, decidedAtTick, stopReason)`。

key按该有序元组编码，禁止只用room、actor name或一个sequence关联。只有新危险转换能创建记录；同tick analyze/run/cleanup、多次许可检查和跨tick重复停止都不能追加或重采。读取摘要不创建namespace。

初次部署时，对昨天已有的aborted会话显示`not_recorded`，不拿当前可见单位回填旧事故，不清除其guard请求或托管锁。

### 事故字段

| 字段 | 约定 |
| --- | --- |
| identity | 完整会话身份，保持原值，不替代guard高水位 |
| decidedAtTick / decisionAtMs | 守卫本次决定时间；ms来自该调用注入的合法clock，不代表单位进入房间的时间 |
| stopReason / detection | danger或home_danger；detection固定non_owned_creep，保留原判定为真 |
| baseRoom / targetRoom / observedRoom | 危险实际房间由停止原因决定；observedRoom不依靠当前外部请求传入 |
| captureStatus / captureReason | 下述状态和固定原因码，不存任意错误message或stack |
| capturedAtTick / capturedAtMs | 详细对象实际读取时间；不借用旧lastNowMs，不在下一tick补成同tick |
| visibilityAtCapture | visible或not_visible；不可见时不填“零敌人” |
| hostileCount / actors | 可读数组的当次总数与受限对象；不可读时count=null、actors=[] |
| actorsOmitted / truncated | 容量或时间不足时明确标记，不宣称完整编制 |

每个actor只保存普通JSON数据：

- `id`、`name`、`ownerUsername`；缺失/非法为null，不从Controller owner、sign或Invader计数推断。
- `pos={x,y,roomName}`，合法整格坐标；非法为null。
- `activeParts`固定八类move/work/carry/attack/ranged_attack/heal/tough/claim的有效数量；有效指hits>0。body无法完整解释时为null或partial，不把未知当0。
- `bodyStatus`、`bodyLength`、`hasBoosts`及必要的缺失字段标记。只汇总部件，不保存完整body数组和Game对象引用。

ownerUsername是事实字符串；不新增外交或玩家/NPC猜测规则。部件说明能力，不证明攻击已发生，也不直接给出伤害值。

## 5. 状态、失败与同tick去重

| captureStatus | 含义 |
| --- | --- |
| pending | 同tick已占用唯一尝试并保存基本事故身份，详细采集尚未完成 |
| captured | 同tick视野与预期字段完整，未截断 |
| partial | 保存了部分事实，但字段、数量、大小或时间预算使其不完整 |
| unavailable | 无同tick视野或时间不匹配；身份保持未知 |
| failed | 读取/标准化失败且能保存失败标记 |
| skipped_cpu | CPU预算不足或CPU读数不可用；未读取详细对象 |
| interrupted | pending已跨tick遗留时摘要导出的effectiveStatus；原始pending标记不改写，不能重采或自动重试 |

以下规则固定：

- 先持久化小pending标记，只有创建该标记的本调用可完成详细采集。已有pending的另一调用也不重采。
- 同tick允许pending到一个最终状态；成功或失败一旦最终化，不再改对象、时间或原因。跨tick仍为pending时，只读摘要返回effectiveStatus=interrupted，并保留rawCaptureStatus=pending，不为这次展示另写Memory。
- 若在标记后、快照提交前重置，恢复后按上述规则显示interrupted；即使当前又看见同名/同owner单位，也不能补进旧记录。该判断来自已提交标记与当前tick，无需原global或后台重试。
- 任一字段getter抛错，其他可读字段可保留为partial；若整次读取失败则failed。若危险布尔为真而二次对象列表为空，记录partial/count_conflict，不能改成safe。
- 独立存储写入失败时不继续扫描对象。若已存在pending但最终提交失败，允许一次小失败标记提交；仍失败则保持pending，后续只读显示interrupted。每事故正常2次写，最多3次写尝试，无逐tick重试或后续状态回写。
- 完全无法写入独立存储时，最多给本tickglobal一个失败原因；无法承诺该失败标记跨重置保留，不能宣称快照已保存。关停与已有守卫outcome不依赖该标记。

未知schema、损坏的records或已有超限存储不自动擦除、修复或迁移；跳过新增记录，摘要显示schema_unknown/store_invalid，控制不受影响。新写入只允许有限普通JSON，不产生循环引用、BigInt、函数、非有限数字或原始Game对象。

## 6. 容量、CPU与保留期限

硬上限：2条事故、每条10个actor、每个body最多检查50个part、每个actor文本字段最多100个UTF-16代码单元。身份字段必须满足既有会话上限且精确匹配，不截断身份来凑长度。先取受限前10个对象，最多对这10个排序，不排序整房全部单位；总数保留供识别截断。

每条最终记录的`JSON.stringify(record).length <= 12000`；整个ledger的该长度<=25000。长度单位明确是UTF-16代码单元，不冒称UTF-8字节。标准化后若仍超限，最多删除10次尾部actor，标明partial/size_limit；metadata本身非法或超限则只尝试小失败记录。

CPU阈值通过既有policy入口配置，拟新增`policy.remoteMining.dangerEvidence`：

- `reserveCpu=5`：记录前剩余tickLimit不足5CPU时跳过详细采集。
- `maxCaptureCpu=2`：合作式详细采集预算；每个actor边界复核，已用CPU达到2就不开始下一actor，输出partial/cpu_budget。一个actor内部最多检查50part，可能在处理完它时超过阈值；这不是VM抢占式2CPU硬上限。

这两个值是待验证的初始诊断预算，不是性能调优结论。缺CPU读数/读数异常时跳过对象采集并尽力写小标记；非法显式policy不覆盖，标记invalid_policy。现有默认合并只补缺字段，不创建危险ledger或启动功能。policy中不增加新的enabled开关，关闭的守卫无新危险事件就不会创建ledger。

有效已提交记录不因TTL、丢失视野、重置或模块关闭删除；仅下一次合法危险事故按两条上限轮换。读取返回原observed时间、ageTicks和historical=true。按既有intelTtl计算的stale仅为展示，旧记录永远不是当前危险或当前安全的新观察，不能给许可门槛提供true。

### 保证的边界

成功写入并由Screeps正常提交的Memory，经过JSON序列化重载和global/模块重建仍能读到相同快照。若整个tick被强制终止、Memory未被引擎提交、被外部删除或整个Memory已不可序列化，不能承诺不存在的数据仍能恢复。本设计在这种情况下优先维持已执行的撤权和关停，不伪称兼得完整记录；pending标记也以成功提交为前提。

## 7. 模块与读取出口

拟新增两个文件：

- `src/services/RemoteDangerEvidenceModel.js`：纯身份校验、pending/终结转换、标准化、容量限制、两条轮换及摘要；不读Game/Memory，不修改守卫许可。
- `src/services/RemoteDangerEvidence.js`：同tick有界Game采集、独立Memory读写、异常边界；接收可注入的clock、actor reader和store writer供故障测试。

接入点限定为`RemoteReconTrialService.advance`控制提交之后；通过可注入recorder测试其整个hook抛错。详细快照不进入`RemoteReconTrialModel`的clone/validation、Spawn、ActionParser或安全事实。

读取摘要独立try/catch，失败只缺少危险摘要，不覆盖现有控制摘要。`global.RemoteReconTrial.summary`和既有EmpireMetrics出口只附加小metadata：key、status、原因码、观测tick、历史标记、数量/截断。每个摘要长度上限1500代码单元；不复制actors/body/owner列表，避免current/previous及metrics多份膨胀。需要详细对象时只读选定ledger路径。

旧guard schemaVersion=1保持，新增独立ledger schemaVersion=1。旧数据缺ledger时可读为not_recorded；未知ledger schema不改变guard是否有效。没有新service，无main/P0顺序变化；既有控制链的异常不被观测hook包装成成功。

## 8. 验收与交付

配套`docs/superpowers/plans/2026-10-20-remote-danger-evidence-regression.md`给出逐批RED→GREEN与故障矩阵。核心验收是：在同样危险fixture中，成功记录与每一种记录失败都产生相同的当tick停止、不新增spawn、不向危险房继续出发以及次tick关闭确认；已有合法安全返程保持。成功证据跨序列化和reset保留，失败没有伪造字段或延长会话。

完整测试和仅构建已在用户后续授权的本地实施中通过，证据见交付报告；不能代替线上验收。提交、部署、线上目标定义、侦察或采运仍未授权。今天没有读取线上开关；关闭是持续约束，最后现场状态见2026-10-19报告。
