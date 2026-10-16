# scout 移动修复发布及关闭状态核对

日期：2026-10-16，北京时间。用户已授权本次提交、推送和部署，要求部署后只读核对版本及关闭状态，再给出有限侦察复试方案；本轮不启动复试。

## 发布结果

逻辑提交fe061d4a1e3548e71d7b31dd575b3c18b52c7f3a，分支codex/single-remote-mining，已推送origin同名分支。提交只含scout移动修复、25项专项回归和配套诊断/交付/失败侦察记录，共11文件；其他历史未提交证据保留，不混入本次逻辑提交。

发布前重新执行npm test：smoke、room-governor及node:test216/216通过。npm run build成功，明确为不上传的本地构建；工作区及暂存区差异检查通过。

随后执行npm run push，目标screeps.com/default。临时配置仅含本次main目标，以CreateNew创建，finally中删除；未改主目录凭据、共享代理或其他目标。工作区临时.secret.json已移除。

发布前回读旧版SERVICE_VERSION=1792056592374，指纹匹配既有6f2633a发布；已将服务器原代码备份到D:/MyCode/screeps_world/automatiseerimise_impeerium/.worktrees/release-backups/2026-10-16T05-27-36.399Z/server-code.json。

2026-10-16T05:29:30.639Z（北京时间13:29:30）SDK回读：default activeWorld=true，上传后的服务器main及map与本地上传产物逐项哈希匹配，artifactMatches=true。

| 项目 | 实际值 |
| --- | --- |
| SERVICE_VERSION | 1792128523514 |
| main SHA-256 | 82b5f7f9473e986d89d3a8084ef095ea55f0c468578936ce1d636d5a006d33ac |
| map SHA-256 | 14ce4141c8676bfb474d8b0b569da19967e425fa9e04fd0dfe9843db3b846939 |

## 游戏内运行与控制状态

原生tick83676993及83677028重复确认新SERVICE_VERSION执行：

- remoteMining.enabled=false；W48N41 enabled=false、hold=true。
- operation.status=disabled，allowEconomicDeparture=false、allowRecon=false。
- sourceId=null、allowContainerBuild=false、reserveController=false。
- roleLimits为scout1、remoteMiner0、remoteHauler0、reserver0；没有任何目标为W48N41的存活角色。
- goalPlanning.enabled=false、Governor shadow=true、scheduler.enforce=false、market.enabled=false。

Goal专用原生样本tick83676993：mode=shadow、runtime=inactive，goals/plans/goalPlanningState命名空间均不存在。后续两份健康样本也确认这些命名空间为空；没有写入线上目标定义。

| 原生tick | terminal id | 实际free | 母房情况 |
| --- | --- | ---: | --- |
| 83677014 | 6ad0b55bceeb3db0d3b4dda0 | 300000 | recovery=normal，miner2/hauler3，Controller149931；Spawn正在补repairer |
| 83677033 | 6ad0b55bceeb3db0d3b4dda0 | 300000 | recovery=normal，miner2/hauler3，Controller150000，energy1900；Spawn空闲 |

这些是同版本独立快照，不是连续观察窗口。旧失败scout已自然退场；没有为了发布或复试杀死、回收或强派单位。safeTicks仍为0，intel=null，没有取得新的远程视野或运输证据。

## 原始证据与诊断脚本修正

证据位于.superpowers/sdd/2026-10-16-w48n41-recon/及相邻2026-10-14-single-remote-mining目录：

- release-full-test.log、release-dry-build.log、release-upload.log。
- quantity-sdk-readonly-1792128456415.json：旧版及备份路径。
- quantity-sdk-readonly-1792128570646.json：新版SDK哈希匹配。
- status-1792128558600.json、status-1792128703242.json：新版本及全部关闭状态。
- goal-status-1792128558594.json：Goal关闭且无定义。
- home-1792128644869.json、home-1792128723528.json：两份有效健康与容量样本。

初次并行健康查询使用仅含时间戳的诊断标签，发生回执串样；home-1792128558600.json实际含Goal结果，已明确排除，不作为健康证据。诊断脚本改为mode+进程id+时间戳唯一标签，再串行取得上述两份形状正确的home样本；没有修改生产代码，也没有把串样当成游戏异常。

## 当前边界及下一步

本次完成提交、推送、代码部署、SDK产物回读及原生关闭状态验证。尚未执行修复后的游戏内移动复试，更未完成W48N41可见结构路线、连续安全或实际运输验收。

有限侦察方案见[复试方案](2026-10-16-w48n41-recon-retest-plan.md)及[默认关闭的离线配置](2026-10-16-w48n41-recon-retest-disabled.json)。本轮不写启用配置、不发spawn需求、不启动监视进程或自动化；后续须用户另外授权。文档提交可以使Git HEAD前进，实际部署逻辑仍以fe061d4及上表指纹为准。
