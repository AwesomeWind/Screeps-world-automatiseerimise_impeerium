# Goal/Plan 影子闭环本地交付

日期：2026-10-15。工作区 `C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium`，分支 `codex/single-remote-mining`，HEAD保持 `05a459ca137888abe9fb955c7ecfa357a13d921b`。

用户已明确要求执行设计草案。本轮完成四批本地实现、回归和构建；没有暂存、提交、推送、部署、写在线目标定义或改变在线控制开关。

## 已实现

- GoalPlanFacts：只读Game/RoomPhase，区分真实terminal和工地，保留未知值与事实时间，不以工地100%冒充接收容量。
- GoalPlanModel：纯状态转换，不依赖Game/Memory；同版本、同接收id、两份相隔至少10ticks的新鲜事实才判ready。历史achieved与当前readiness分开，容量下降/事实失效后不能凭历史完成授权后续动作。
- GoalPlanRegistry：显式定义去重；20个Goal、20个Plan、50事件上限，reasonCodes最多8条。记录满额拒绝新增，不删除有效目标；目标定义冲突、异常记录和未知schema保留原内容并报告错误。
- GoalPlanService：注册于RoomGovernor之后，默认enabled=false、仅支持shadow，不提供active分支，不自动种目标，不调用执行层。
- EmpireMetrics：只保存数量、状态和原因的compact摘要；旧global快照标为stale且readyCount=0。

唯一目标类型为prepare_receiving_capacity；接收对象限定为母房真实己方terminal。观察方案不创建工地、派builder、发资源需求或占用预算，budgetProposal=null、budgetAllocated=0、retryCount=0。EmpireDirector、跨房预算和自动扩张不在本次实现范围。

## 分批与验证证据

1. 新事实模块RED，随后8项读取、未知值、时间与无副作用测试GREEN。
2. 新纯模型RED，事实/模型累计25项GREEN；覆盖重复capturedAt、容量边界、过期/未来/跨版本证据、恢复、取消/到期和历史完成。
3. 注册表/服务/主循环接线RED，累计35项GREEN；真实主循环启用与禁用影子层的执行事件和动作轨迹完全一致，基线实际执行了原有动作。
4. 维护者检查新增失败回归后修复：非terminal伪装、缺失或异常state崩溃、未知schema时旧ready泄漏、指标重贴旧快照为当前、超长roomName，以及null命名空间被误当成空记录覆盖。

最终 `npm test` 退出码0：smoke与room-governor通过，node:test **191/191通过**；其中50项为新增Goal/Plan回归，原141项远程、工位和storage回归全部通过。纯模型和注册表还在删除Game/Memory的测试环境中验证可用。

`npm run build`退出码0，清除当前子进程DEST后执行，输出明确“代码将被编译但不会上传”。工作区和暂存区diff检查通过。没有把本地产物作为线上版本验收。

日志位于 `.superpowers/sdd/2026-10-15-goal-plan-shadow-foundation/`：task1-red.log、task2-red.log、task3-red.log、review-red.log、namespace-red.log、full-test-final.log、build-final.log、progress.md。

## 维护者判断与边界

本轮为作者维护者自检，没有自动调用子代理或声称独立review；没有剩余已知代码发现或暂缓的小修项。

- 按用户要求跳过提交/发布及自动委派，保留分批账本。代价是尚无独立review，不能把作者自检称为独立验收。
- 成功采样不跨超过maxFactAge的观测空档延续，接收id变化重计；这是保守处理，代价是需要额外一次有效评估。
- disabled/非法policy只给已有schema1元数据标记needsFreshEvidence，不改Goal/Plan记录；重新启用后重新确认，代价同样是保守等待。
- MemoryConfig已调用ensureEmpireControl，本轮只在EmpirePolicy添加默认policy，未重复增加初始化入口。服务仅在显式启用后创建自身状态命名空间。

本地20目标/20计划/50事件样例的序列化尺寸为 **26253 bytes**，记录于memory-fixture.json。这是本地固定fixture测量，不是实际线上Memory峰值；没有真实Game.cpu测量，不能据此宣称线上性能已通过验收。

## 在线状态与下一步

本次只读检查tick83659124，线上仍执行storage数量预留版本1792048671500，remote=false、market=false、Governor shadow=true、scheduler enforce=false；Goal/Plan未部署、未启用。既有terminal只读跟进保持，正常进度不通知，建成或异常再用中文说明。

后续可先独立审阅当前未提交差异；提交、推送、部署和游戏内shadow目标定义/启用需要另外授权。即使未来影子Goal显示ready，也不能替代W48N41原生路线、新鲜情报、安全及实际采运验收。
