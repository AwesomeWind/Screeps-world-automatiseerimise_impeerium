# 经济会话视野与安全计数隔离：本地修复验证

2026-10-22。用户明确批准由主代理分批本地实现。修复已完成，完整 `npm test` 为 **571/571**，smoke、room-governor、仅编译构建均通过。本轮没有暂存、提交、推送、部署、游戏API调用、线上Memory写入或重新启用侦察/采运/Goal/Plan，没有新增子代理。

工作区仍为 `C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium`，分支 `codex/single-remote-mining`，HEAD仍为 `302ed1a11ed091afb1452da525bbf18e3a035f77`。上一轮原生坐标/边界移动修复保留在工作区。本地dist包含两轮新代码，不能用作已部署版本或线上验收证据。

## 最终行为

1. `RemoteEconomicTrialFacts` 不再读取旧current.visionAcquired来生成fatalReason；它保留当前实际视野、危险/foreign control、母房、接收空间、预算、旧实体和未决claim事实。没有清除旧视野记录或费用。
2. `RemoteEconomicTrialModel` 在实际活动session分支按该session的visionAcquired和当前remoteVisible判断失视野；覆盖evaluate、end_tick及动作前推进，不再依赖scope_observed后置关停。当前事实缺少可靠视野也不能让已取得视野的会话继续。原有更高优先级期限、身份、手动hold及危险原因继续优先。
3. managed旧会话尚未结束时继续返回trial_in_progress；terminal但仍managed=true时，新身份start明确返回release_required。必须先完成原合法release，不能借新id/sequence替换旧托管锁；release也不隐含start。
4. 新会话显式visionAcquired=false、safeStreak=0，lastSafeTick/safeStartedAtTick不从历史复制。只有本轮slot绑定且已接纳出生的新scout，才能在目标房间当前安全scope逐tick累计。父operation计数、旧摘要与外部视野均不能替代它。
5. schema仍为1。旧记录缺少可选视野字段且计数0时不伪造视野；字段若存在必须为boolean，有正计数却缺失视野证明仍按原fail-closed原则保留错误raw并拒绝动作，不静默迁移或修正历史。

未改变本轮1650孵化/6000基建、原滚动预算、每角色唯一成功额度、100连续安全ticks、1000ticks/90分钟、原leg/owner期限及未知结果保留规则。没有改动main/config、RemoteMiningLedger、RemoteEconomicTrialEvidence、ResourceReservationFeedback或ResourceMarketService。

## 分批 RED→GREEN

| 批次 | 运行证据 |
| --- | --- |
| Model先补12项 | 原代码11失败、1个既有兼容保护通过；涵盖新标记初始化、两种视野下旧终态锁、P0/end_tick失视野、不同新请求不能掩盖旧会话关停、非法字段raw留存 |
| 生产链先补9项 | 原代码6失败、3个关停保护通过；真实native fixture下旧20/99/100会话release后被vision_lost误拦截，及未release旧锁可被替换均复现 |
| 实现两层职责修正 | 以上21项全部GREEN；Facts不持有生命周期判断，Model在正确session上执行关停，删除重复的scope_observed失视野分支 |
| 补足隔离边界 | 新增3项：parent100+外部视野不授权经济、旧actor阻塞release、旧正计数缺字段不自动恢复；并强化原有费用unknown用例，旧轮已真正取得20ticks视野后再进入新unknown会话 |

合计新增24项，另强化1项已有回归；当前总量547→571。负向原本通过的断言作为保护保留，不伪称全部新增用例都曾RED。

日志目录 `.superpowers/sdd/2026-10-22-economic-vision-session-fix/`：`01-model-red.log`、`01-runtime-red.log`、`01-core-green.log`、`02-isolation-edges.log`、`full-test.log`、`build.log`。实施前的Facts/Model源文件另有副本；此前诊断和生产执行日志不覆盖。

## 重点验证结果

| 边界 | 已验证的本地行为 |
| --- | --- |
| 跨会话视野 | 旧会话20/99/100安全ticks且vision=true，合法release后新会话无视野也可接纳为recon；新标记false、计数0，不读取旧已得视野状态 |
| 安全计数 | 父operation已100且允许经济、存在外部新鲜视野时，新scout仍在母房，新会话计数0、miner/hauler调用0、未建容器；旧99→新轮仍须独立100 |
| 全局重置 | terminal/release前、release后、新scout尚未出生、计数49与99时JSON往返Memory并重建服务；身份、费用、原请求/期限和旧raw保留，达到新100前不孵化经济角色 |
| P0与动作前 | 已有视野后删除实际Game房间，跳过RemoteMining scope推进仍同tick关停；在ActionParser前删除视野同样拒绝新引擎调用；换入不同新start也只能拒绝替换并关闭原会话 |
| 显式release | 有/无外部视野都不能替换managed terminal；旧actor仍存在时release_blocked，不删除actor或旧记录 |
| 费用与unknown | 旧已确认50/unknown0，新会话引擎结果不明后confirmed0/unknown50；JSON重置后旧raw与旧成本不变、未知grant保留。有效sequence的新release仍被未决状态拒绝，再新start返回release_required，不增加孵化调用 |
| 兼容及失败 | legacy缺少标记且计数0不产生假视野；null/string/number/object标记及正计数缺字段，均保留raw并fail-closed；不清历史或恢复额度 |
| 原安全和动作 | 先前移动修复与首批次tick入库、费用/unknown及停止保护回归均包含在完整套件；没有修改其归约算法 |

这里的动作、重置、视野、入库与费用全部来自本地生产链fixture，不是新的线上采运或经济验收。真实线上最后一轮仍是先前vision_lost中止，入库0、确认费用50、unknown0；本轮没有重新查询线上开关，也没有把未修改线上写成新鲜开关回读。

## 完整检查

- `npm test` exit0：571 tests、571 pass、0 fail、0 skipped，包含smoke checks passed和room governor checks passed。
- 命令进程内移除DEST后运行 `npm run build` exit0；日志明确“未指定目标，代码将被编译但不会上传”。只生成本地main.js和main.js.map.js。
- `git diff --check`、`git diff --cached --check`通过。Windows换行转换提醒不影响检查结果。
- 暂存区为空，HEAD未前进；预算/物流归约、配置与入口文件与HEAD一致。上一轮移动修复其余生产文件哈希不变，旧生产执行文件封存哈希不变。
- 最终源码、测试与构建产物哈希固定在同目录的 `validation-manifest.json`。旧547项清单属于历史基线，不能再用其Facts、测试和dist哈希断言当前候选未变。

## 维护者检查与剩余工作

本次新增产品逻辑只在Facts与Model两个现有文件中，职责分离后不再通过清标记或针对请求id打补丁；视野关停集中在活动session，未保留重复后置判断。旧release校验、未决claim与费用归约没有绕过；原始状态与新状态都按会话边界处理。模块说明和测试约定已同步更新。

当前交付满足本轮本地实现与验证要求，但整体远程经济目标尚未完成。两轮修复都未发布，新的真实侦察、可靠返程、采矿/容器建设/运输、次tick真实入库与收支仍需未来独立发布及启用授权后的新鲜验收。tailStatus自动归约Minor仍保留unverified，长期收益与10000tick窗口不在本地通过范围。
