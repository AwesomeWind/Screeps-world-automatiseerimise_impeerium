# 母房自然行为采集窗：本地实现与验证

日期：2026-10-27（Asia/Shanghai）

状态：主代理六批本地实现、一次独立只读review、主代理TDD修复及最终完整验证已完成。没有联网、读取凭据、暂存/提交/推送、部署或线上启用。

## 实现内容

新增HomeEvidenceWindowModel/Facts/Service/Report，配置默认关闭，独占 `Memory.empire.observations.homeEvidence`。自然窗口不需要经济会话，不创建scout、任务、spawn或经济请求，不修改原经济观察窗与旧锁/费用/unknown。新服务位于旧TrialEvidenceWindow之后的最后cleanup、P3。

期限仍为100个观察tick或原issuedAtMs+600000ms先到即止；接纳后固定末tick=start+99，第一行无前态，最多99对过渡，第101个观察tick不再采集。cohort最多4名、对象16个、候选200、每房每tick最多一次getEventLog、原生日志128条/相关事件32条，完整store最大131072 UTF-16字符。字符上限可以先触发，不能保证任意场景都采满100行。

已有Game事实和声明T−1事件分别标时。只有相邻快照、固定ID、完整双端库存、事件数量完整、无相关并发和金额/delta一致时，报告自然HARVEST或正向TRANSFER的单次一致；反向withdraw只为未验证候选。缺失/CPU未知保持null，金额溢出后不会重新从后续小金额累计，simulated不提升生产语义，报告没有经济账或执行许可。

报告同时显示observedEvents和unprovedReasons；有事件但缺端点/source再生/并发时是unproved，不与没有事件的missing混淆。observedAmount仅表示已配对一致的金额，不是所有产出或收入。

HTTP共享有界envelope/GET机制，固定 `economic_trial_v1` 与 `home_natural_v1` 两个profile各自校验schema和归约。旧函数/默认路径/错误类型保持兼容；自然读取只允许 `empire.observations.homeEvidence`，missing不自动换路径再读。离线CLI可以选择自然profile解码；没有新增online execute分支或授权。

自然profile不再借用旧经济EXPECTED_VERSION。真实读取本体须显式expectedVersion；离线不提供时标unverified_version/not_requested，不假装匹配或错误沿用旧版本。可用 `--decode <file> --out <new-dir> --profile home_natural_v1 --expected-version <实际期望版本>` 做离线比对；这不是联网命令。

## 实施裁决与限制

首次pending若完全未落盘，重置后没有持久标记可区别“尚未尝试”和“调用结果未知”。因此Service首次接纳只在原request.acceptNotBeforeTick尝试一次；同Game内也不允许换ID绕过。纯validator仍保留≤30秒/≤10tick的新鲜度与窗口校验，但Service不利用剩余窗口补开。**代价是错过锚点或当时低CPU会未开始，必须通过后续新的明确流程处理，不能晚到自动恢复。** 该收紧没有延长100tick/10分钟，不会增加业务权限。

CPU按policy.homeEvidence.cpu收紧5000/5/2的阶段软预算；不能中断一个已经开始的原生API/序列化。整个Memory不可写或引擎硬CPU终止时，不能保证错误标记或seal被持久保存，真正global reset未验收。已有pending/unknown/旧窗不自动重放、换轮或删除。

停止判定先锁住原窗口，独立于seal写成功。低CPU导致终态写入尚未尝试时，只可用原停止clock延后封存；未知seal不重放且不再采集。有界global停止锁支持同运行时内服务重建/JSON重载；它尚未持久化便真正global reset时，不能保证保留。固定anchor只限制原请求后续tick，不证明完全无痕失败后的新身份/新anchor是重放；任何新请求仍需新的外部授权。

## RED→GREEN与本地验证

本计划进度及分批日志保存在 `.superpowers/sdd/2026-10-27-home-natural-evidence-window/`：model、facts、runtime、report、http的RED和GREEN，以及针对时钟回退、未知CPU、金额溢出、未选中损坏资源事件、原生计数缺口、同tick换ID及CPU配置快照的补充回归。

最终 `verification-04/result.json` 的结果（修复后重新完整运行，未复用旧测试）：

- 新自然窗口43/43，HTTP44/44，旧只读probe47/47。
- 完整游戏测试911/911，smoke与Governor通过。
- dry build通过，版本1793071203253；main SHA-256 `1a2a623fb35d7ce485a7d93420ff75de8a70445d6e1b32d9b9105030c5b6103f`，map SHA-256 `cc72e105740057b53f050fdff9cb603b360e4e24b79983278b940614d1ecf460`。这是本地候选，不是已部署版本。
- 历史verification-03是review前候选（曾按同源hash复用verification-02测试）；它和前两次构建失败记录均保留，不当作最终修复后结果。
- 额外的本地真实自然策略→下一tick应用→报告计算得到8行、7次HARVEST配对14能量、1次TRANSFER配对10能量，明确origin=local_applied_actions_fixture/simulated_only，不是游戏服务器样本或经济验收。

前两次构建检查失败保留：首次假定插件保留main.js.map，第二次按插件意图假定map.js已有CommonJS前缀。实际读取表明旧插件与Rollup4组合只rename raw JSON；隔离脚本解析实际地图、保留raw副本，再仅对新构建目录内的map规范化CommonJS。未修改仓库Rollup配置、旧dist或生产服务器。

禁止网络/凭据guard未触发；26个候选源码/测试/适配文件纳入hash核对，旧实际GET目录、授权/执行入口、原日志锁、旧发布产物和混合进度文档保留，暂存区为空。不存在“本地GREEN等于线上经济通过”的结论。

## 独立review

冻结包：`.superpowers/sdd/2026-10-27-home-natural-evidence-window/readonly-review/`，包含candidate完整文件、原HTTP适配器、spec/plan/回归矩阵、裁决记录、测试/构建结果及tracked.diff；新建和ignored文件也在包中。

已完成一次只读独立review，0 Critical、2 Important、1 Minor。两个Important分别是seal保存失败后恢复采集、自然profile默认使用旧经济版本。原Minor为“有事件未证明仍标missing”；主代理按对明确验收要求的实际影响提升为Important并一并修复。

`review-fixes-red.txt` 保存7个新失败反例，`review-fixes-green.txt` 联合87/87通过，最终完整验证见verification-04。没有第二次review；后续由主代理测试验证。未解决的Minor为0。

review-findings.md 保存原反馈和主代理裁决。独立review未判断的真实原生语义、硬CPU终止、实际global reset、Memory全不可写后的留存/跨身份防重放、线上性能及经济验收，主代理全部维持未验收；不能用本地GREEN扩大许可。

## 未进行的验收

没有新鲜线上版本/开关核对，没有创建自然或经济观察请求，没有真实自然事件样本、持久化下载、性能/硬中断/global reset或经济验收。现有线上版本和关闭状态不能从本地候选或历史HTTP missing样本推断。

后续应先审阅最终本地候选，再分别决定默认关闭发布、有限母房自然采集、一次HTTP下载；当前授权不包含这些动作。

## 2026-10-27 默认关闭发布前补充核对

用户随后明确授权提交、推送、部署默认关闭版本，部署后只读核对再给执行方案，仍不开窗。发布前发现此前“expired envelope”测试只设置了request.enabled，而历史实际形态是父reconTrial/economicTrial.enabled=true；gate会把已过期终态记录误作开放权限。

已使用受控历史fixture `home-retained-closed.json` 复现RED，再修正为严格的原身份/原窗口/已确认closure/过期tail证明，且总remote/native/operation/scope仍须关闭。新鲜期限、foreign身份、开放scope反例继续拒绝，旧包络/账本不写回。这是主代理发布前兼容修正，未增加第二次独立review。

补充后的 `verification-05/result.json` 已完整重跑：自然窗口44/44、HTTP44/44、旧probe47/47、完整游戏912/912、smoke/Governor和隔离dry build通过。新本地固定候选版本1793072703455，main SHA-256 `ee4c4ca265d453af23d1d9541a97c7bc0cd249b216f952373c73f10d05898e0c`，map SHA-256 `01233df0604bad444fc520f379ddbf14ce00e79a220e6c597b0e08ae5d29c96a`。verification-04和旧completion是发布前修正之前的历史候选，不能再拿其旧指纹判定本次发布。

实际提交/部署与线上核对结果另存本轮发布报告；本文的本地通过不等于已经上线、开窗或完成运行时验收。
