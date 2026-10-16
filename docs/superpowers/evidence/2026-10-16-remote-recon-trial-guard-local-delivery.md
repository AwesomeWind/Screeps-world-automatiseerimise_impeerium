# 游戏内有限侦察试点守卫本地交付

日期：2026-10-16。基线HEAD：`0fe8968`，分支`codex/single-remote-mining`。用户选择主代理逐批实现，完成后进行一次只读独立review。

**五批本地实现及验证已完成，尚未暂存、提交、推送或部署。** 本轮没有调用生产API或console、写线上Memory、启动自动化或试点。侦察、实际采运和Goal/Plan未由本轮启用；未读取新的线上状态。最后已发布逻辑仍以此前发布记录的`9e415d1`为基准，不把本地dist中的新守卫视为已部署代码。

## 实现结果

- 新增纯模型、只读事实适配和P0守卫。默认`reconTrial.enabled=false/request=null`，没有旧托管会话时不创建状态；非托管远程流程继续走原门槛。
- 人工start请求绑定版本、remoteId/epoch、递增sequence、精确启动tick及固定期限。整轮300ticks或20分钟先到即停，孵化、移动、观察共用期限；运行时重载不续期。服务器不执行tick时无法即时写关闭，恢复首tick检查墙钟并停止。
- 一轮只有一个原期限内的逻辑孵化请求，body为1MOVE、最多一名成功scout。区分未调用、调用开始、结果已知和明确未调用；未知claim保留，不清空后重试。
- 明确非OK可在同一requestId和原deadline内恢复；新试点和危险后的200tick冷却保持原样。成功孵化后，请求排队deadline不截断仍在会话/原leg期限内的移动。
- 在需求发布、spawn intake/run、已有outbound task及守卫run边界收窄许可。关闭后只保留受当前母房安全门槛约束的既有受限返程；不强移核心单位、不杀死scout、不重置旧leg。
- 从真实Game实体确认出生、后续tick位移、跨房视野；本轮连续100安全ticks与可见候选路线全部满足后才结束。候选source只用于配置副本的只读计算，线上sourceId不被选择或写入。
- 停止后先撤权/关闭本scope，再于下一tick确认。其他房间enabled导致模块无法归属关闭时单独记冲突；release必须目标和总模块都关闭且无未结实体/执行项，不启用任何功能。
- Store保存一个current、一个previous和最多20事件。终局Outcome冻结，结算可根据迟到回执从unknown推进为known；已确认费用在原ledger回执过期后仍保留。metrics仅导出摘要，守卫不依赖遥测开关。

## RED与GREEN证据

专属目录：`.superpowers/sdd/2026-10-16-remote-recon-trial-guard/`。

| 阶段 | 证据 |
| --- | --- |
| 纯模型 | `task1-red.log` 11项缺失模块RED，随后GREEN；早期完整262/262 |
| 动作前撤权 | `task2-red.log` 12项RED，模型/runtime23/23转GREEN |
| 孵化执行边界 | `task3-red.log` 7个行为失败，36/36转GREEN；完整287/287 |
| 观测与结算 | `task4-red.log` 4个行为失败，另有release反例；44/44转GREEN |
| 整链故障矩阵 | `task5-red.log` 恢复证据与坏状态反例；`task5-boundary-red.log` 关闭重新应用反例；57/57转GREEN |
| review修复 | `review-fixes-red.log` 15个失败、1个已有边界通过；grant别名、返程、最后孵化撤权及费用基线分别另有RED日志；最终均纳入默认测试入口 |

最终新增79项，既有251项保持通过。`npm test`：smoke、room-governor及**330/330 Node测试通过，失败/跳过均0**。日志为`final-full-test.log`。

明确移除DEST后运行`npm run build`，exit0，输出“未指定目标，代码将被编译但不会上传”；日志为`final-build.log`。未创建临时.secret.json。最终diff检查和暂存区检查通过，HEAD未前进；其他历史未提交文档保留。

## 一次只读独立review及处理

reviewer以独立上下文读取spec、plan、progress、未暂存diff及全部新增source/test，并在不写文件的Node fixture中复现问题。review时原完整308/308也通过，说明正常GREEN不足以替代反例检查。

发现5项Important，0项Critical/Minor，均由主代理先写RED再修复：

| 问题 | 修复及回归 |
| --- | --- |
| 字符串安全计数可拼接成假成功 | 校验计数、观测tick、位置、spawn阶段和托管状态的类型/范围/关系；七类损坏状态保持原值并拒绝 |
| 同标签的其他scope grant被取消 | 限定母房预算及remoteId/epoch/requestId/trialId/sequence完整身份；三类碰撞与grant别名回归 |
| ledger回执过期导致费用50归零 | 持久结算只依据新证据推进；跨回执保留窗口回归 |
| 已知孵化失败后不能恢复 | 修复原请求的新actor name绑定；进一步复现同请求被旧冷却挡住，增加受限continuation事实；危险/新试点仍受原冷却 |
| 模块仍开却可release | 区分scope关闭与moduleClosed，release严格要求两者关闭 |

同一修复轮还覆盖主代理发现的配置异常不能拖垮P0/核心链、返程需重查母房健康、最终孵化适配器必须传递模型撤权，以及历史累计费用基线不混入本轮成本。

原始review摘要和处理为`review-findings.md`，裁定为`progress.md`。**修复后未再调用第二个reviewer**，修复由主代理以新增回归、完整测试与构建验证。没有延期Minor或尚未处理的已报告Important。

## 实施裁定

- Windows未提供常规Git Bash路径，技能shell辅助脚本以PowerShell/Node和计划专属ledger替代，不改变TDD或交付约束；保留证据目录，不自动删除。
- 既有smoke入口照常运行；服务顺序由新增runtime实际链验证，没有新增重复的实现字符串断言。
- 只对托管、已明确未成功、身份和原request/deadline匹配的同一请求识别continuation，不改变普通远程流程或200tick阈值。该必要接入扩展了`RemoteMiningState`，没有通过重置lastReconAt绕过冷却。
- reviewer因只读限制不运行构建，由主代理完成；真实引擎CPU、房间通行、长窗口和采运验收保留到以后阶段。

## 尚未验收

本地测试证明状态和调用链契约；没有证明服务器上已运行守卫、原生侦察完成、实际跨房绕行、真实100tick安全、费用/收益或10000tick采运验收。

下一步如获发布授权，先发布默认关闭版本并核对服务器指纹/运行版本/开关，再单独审阅有限侦察的启动与停止指令。任何实际试点仍需要新的明确授权，并在开始前重新检查母房、接收空间、人口/账本、当前路线及可靠的观察和关闭通道。
