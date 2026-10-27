# 证据窗口缺失：本地原因核对

日期：2026-10-27（Asia/Shanghai）

范围：仅分析已有样本、代码和离线实验；本轮没有联网、读取凭据、提交或部署。用户要求的“先观察母房自然行为”是下一采集方案的对象，本轮不实际开启线上观察。

## 已验证事实

1. 上次有限读取只有一次 GET，HTTP 200，1851 ms，原始包络为 `{"ok":1}`（8 bytes），没有 data。原始 SHA-256 为 `39f94024cbcf740958d8bb6e25095e33ee260776744698ff4e0d43a4454bf72f`。本地解码器把它记为 missing，不是 gzip/JSON 解码失败。
2. `src/config/EmpirePolicy.js:52` 的已发布默认值为 `remoteMining.evidenceWindow={enabled:false,request:null}`。
3. `TrialEvidenceWindowService.cleanup()` 在开关不为 true 或没有 request 时立即返回，在此之前不会建 `remoteMining.evidenceWindows` 或读取原生事件。
4. 唯一写入点在该服务的 `writeStore`，只写 `Memory.empire.remoteMining.evidenceWindows`。`main.js` 已导入并将服务追加在既有列表末尾；因此本地代码里并非漏注册服务。
5. `TrialEvidenceWindowModel.admissionMatches()` 要求有效 economic/native 状态、完整经济身份、已接纳 native 身份、规范 start 请求和固定来源/接收目标一致；Facts 只绑定 scout、remoteMiner、remoteHauler。它不是通用母房录制器。
6. 已有 2026-10-26 关闭发布记录明确记载观察开关 false、request null、观察 namespace 未创建。它是历史状态，不能代替当前在线开关验证。

## 离线实验

本地脚本 `.superpowers/sdd/2026-10-27-home-natural-evidence-design/diagnose.mjs` 调用真实 Service/Model，用进程内 Game/Memory 替身验证分支，没有引擎或网络调用。

| 场景 | 实际结果 |
|---|---|
| 默认关闭，执行完整服务生命周期 | Memory 原样；写入 0，事件读取 0，无 namespace |
| enabled=true 但 request=null | 写入 0，事件读取 0，无 namespace |
| 合法观察请求，没有经济会话接纳 | armed、`waiting_admission`，0 行；第 21 tick 后 sealed/not_started |
| 解码上次原始 HTTP 响应 | missing，未抛压缩/JSON 异常 |

结果保存于同目录 `diagnosis.json`。执行时禁止网络和凭据读取；已发布源文件与构建输入哈希均匹配，原 HTTP 样本与已消耗目录保留，暂存区为空。

## 原因判断与证据强度

**最有证据的解释：当前设计故意在关闭状态下不创建窗口，上次缺失与此前默认关闭发布相符。没有证据需要修复 HTTP 解码或重复请求。**

这是代码机制和历史状态支持的解释，不是对读取时全部线上状态的完整根因证明。上次没有读取实时控制配置、运行版本或观察服务诊断；仅凭 `{"ok":1}` 不能排除当时部署、shard/path 兼容或未曾提交有效观察请求等其他原因。当前禁止联网，因此明确保留这些限制。

不能据此声称采集器已运行但丢失数据、Memory 持久化失败，或接口忽略了 path。若下一轮仅想验证母房 API 行为，强造经济身份或放宽 admission 既无必要，也会削弱既有约束。

## 推荐方向

保留经济证据窗口和原 HTTP 路径，增加一个独立、默认关闭的母房自然行为窗口。它只记录已存在单位的原生事实，不需要经济会话、scout 或新采运；但未来实际开启这一个采集开关仍需另外授权。

复用方式是容量/时限/故障隔离惯例和 HTTP 传输解码基础，不复用经济身份、不借用旧费用/unknown、不把普通母房动作标成远程采运证据。

候选设计：`docs/superpowers/specs/2026-10-27-home-natural-evidence-window-design.md`。

回归矩阵：`docs/superpowers/plans/2026-10-27-home-natural-evidence-window-regression.md`。
