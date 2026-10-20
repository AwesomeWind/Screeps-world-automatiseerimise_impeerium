# 侦察会话结算隔离修复设计（已批准）

日期：2026-10-20。用户已认可本设计、回归和五批实施计划；本地实现、完整验证及一次独立只读review已完成，未提交或部署。目标是隔离会话费用与unknown，同时保留当前关停、账本、唯一scout及原期限约束。结果见[本地验证报告](../evidence/2026-10-20-recon-settlement-isolation-local-validation.md)。

## 证据与目标

详见[诊断记录](../evidence/2026-10-20-recon-settlement-isolation-diagnosis.md)。已在真实本地生产调用链复现：A的50费用进入B，且B的真实unknown=50被摘要写成0；同一事件也存在pre-event结算覆盖post-event调用状态的问题。

必须满足：

- 新接纳的B独立初始化为0/0，本轮updatedAtTick不得来自A；旧known或unknown事实均不能写入B。
- B仅对本轮有效费用证据显示confirmed=50；调用结果不明时立即显示null/50，不能被旧known或调用前0/0覆盖。
- 实际预算、executing grant、receipt及费用累计不因摘要修复而清空、退款或重计。旧未结执行claim仍按既有门槛阻止新接纳。
- 同会话合法confirmed在receipt正常过期后仍保留；同会话迟到receipt可消解unknown，但不重写终局。
- 不重新开启侦察、实际采运或Goal/Plan，不改变P0顺序、安全门槛、300tick/20分钟上限、原request/leg期限或最多一名scout。

## 方案选择

| 方案 | 评价 |
| --- | --- |
| 只刷新updatedAtTick或只在start删除旧摘要 | 不采用：会隐藏来源，且仍有跨会话数值和同事件unknown覆盖 |
| 带来源的结算事实＋模型按事件后的本会话状态归约 | 推荐：在现有Facts/Model边界解决根因，账本保持原职责 |
| 重做账本或给全部receipt迁移会话schema | 本轮不做：扩大真实费用链与兼容范围，不是消除当前错误的必要条件 |

## 数据流和所有权

### Facts仅采集有身份的证据

将当前可直接复制的facts.settlement替换为只读settlementEvidence：

- 被采集会话的完整identity：trialId、sequence、remoteId、epoch、codeVersion。
- 被采集时的session.spawn.requestId，未知时为null。
- 此request在本母房预算中的receipt快照；没有则为null。快照保留lookup request键、name、remoteId、epoch、cost和tick，不重写原receipt。

身份必须来自正在读取的current，不能因为新request已经出现，就把旧receipt贴成新request的身份。Facts不从旧settlement推导confirmed或unknown，不修改Memory、预算或会话。

### Model是结算摘要的唯一写入者

在advanceReconTrial内以事件推进后的session为基础归约：

1. makeSession为新会话独立创建0/0及admission tick，不拷贝旧摘要。
2. settlementEvidence的完整identity与request必须匹配推进后的session；任一不符则忽略其费用证据。新会话接纳时旧facts自然被拒绝。
3. spawn_call_started后立即按post-event状态设置null/50，发生在引擎调用之前。不能再无条件覆盖为调用前0/0。
4. 唯一有效receipt才能新确认50；已有本会话验证过的确认可在receipt过期后保留。
5. 仍由原Spawn/ledger链扣费、归还已证明未调用的grant、保留未知执行claim。结算归约不发布需求、不调用引擎、不操作这些账目。

建议将小型纯结算归约与校验helper放在现有RemoteReconTrialModel附近，不引入通用账务框架。结算helper必须对缺失/非法数据返回有界诊断结果；即使注入结算内部故障，也只隔离该辅助计算，不中断模型返回原控制状态及effects。Service维持原效果应用顺序，不把结算校验变成stateValid的新关卡，也不包住或吞掉控制异常。

### 本会话确认的持久绑定

为新会话增加可选内部settlementBinding，guard schemaVersion仍为1：

| 字段 | 语义 |
| --- | --- |
| schemaVersion | 1，仅该内部记录的版本 |
| identity | 完整五字段会话身份 |
| requestId / name | 本会话绑定的孵化请求及单位，尚未绑定时为null |
| confirmedReceiptTick | 验证过的receipt tick，尚未确认时为null |

公开settlement的confirmedCost、unknownUpperBound、updatedAtTick三个字段保留。绑定用于证明缓存确认属于本会话，不能充当启动许可、替代预算账本或给旧值自动补上新身份。无效绑定只使结算来源不可信，不得让整个守卫stateValid提前返回而跳过关停。

摘要可增加只读settlementSourceStatus：scoped、legacy_unverified或invalid_evidence。该状态不参与任何动作授权。

## 金额状态规则

| 本会话事件后状态 | 新结算值 |
| --- | --- |
| 新接纳、尚未真正调用；或明确not_called | confirmed=0，unknown=0 |
| 本次明确引擎失败且没有本轮有效成功费用证据 | 0/0 |
| call_started而未取得本轮可信确认；或已知成功但费用确认链缺证据 | null/50 |
| 本轮合法receipt确认 | 50/0 |
| 本会话已验证确认，receipt因1050tick保留窗口消失 | 保持50/0，不回退为0或unknown |

已验证的真实费用不能被后来不一致的失败输入冲成0；遇到矛盾时保留已确认支出、标记证据问题，不退款、不放行第二名scout。

updatedAtTick表示本会话金额状态或来源绑定最后一次实际变更的tick。新会话初始化必为本轮tick；重复读取、同tick重复事件、telemetry刷新不更新它。原receipt.tick单独保留，不用当前tick伪造历史接受时间。

## 有效receipt的必要条件

- 从本母房预算按本session.spawn.requestId取到，包装中的lookup request键也匹配。
- 会话完整身份匹配；receipt自身的remoteId/epoch匹配该会话，而非只比当前operation。
- name等于本会话绑定的spawn.name，cost必须是数值50。
- tick为安全整数，startedAtTick ≤ tick ≤ 当前tick；若已知callTick，tick不得早于callTick。
- 允许在停止后才补到本会话的合法费用receipt；不强制等于callTick或不晚于总期限，否则会误杀既有迟到结算。
- 任一条件不符，不新确认费用，也不能把已有unknown清成0；已有本会话完整绑定的真实确认不被坏输入冲掉。入参只用于观测，不清理异常receipt或grant。

不改变当前ledger receipt schema。request唯一键、已有grant的trial标签及本会话绑定共同构成归属，模型不接受一个无身份的50/0快照。

## 旧记录和重置兼容

- 已结束的历史current/previous若缺settlementBinding，保留原始历史值，摘要明确legacy_unverified；不把旧时间戳刷新成“刚刚确认”，不自动清除store或旧托管锁。
- 旧unknown遇到首次可验证的本会话迟到receipt，仍可更新其独立settlement并建立来源；原outcome/verdict/stopReason/证据及关闭时间保持不变。
- previous不会被本轮facts更新。新接纳不继承previous/current旧值，也不顺便修复旧历史。
- 新会话自身的绑定与摘要一起写Memory，经历JSON序列化、global/service重建后仍可验证；不以global缓存或无持久依据的布尔值证明费用已确认。
- 对新会话缺失、未知schema或损坏绑定，不信任缓存确认，依据本会话真实证据给出保守状态/来源标记；旧终态缺绑定仍按上文保留历史原值并标记legacy_unverified。两者都不能抛出诊断异常阻断关停或清空真实未知claim。
- 此设计不扩展上一轮真实费用的全局对账职责；旧未结grant存在时，既有接纳/解除锁门槛继续拒绝新一轮。

## 修改边界与验收

预计生产改动集中于RemoteReconTrialFacts.js、RemoteReconTrialModel.js及必要的只读摘要出口；测试在既有model/runtime套件及fixture内扩展。RemoteMiningLedger、SpawnService的真实计费算法、P0调度、危险记录模块、Role/任务执行策略均保持职责。

正式回归必须覆盖六个当前RED及实际unknown/账本/关停边界，详见[回归计划](../plans/2026-10-20-recon-settlement-isolation-regression.md)。本地GREEN与构建通过仅说明本地修复；后续提交/部署和下一轮侦察仍需分别授权，不自动开展。
