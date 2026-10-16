# 游戏内侦察试点守卫发布与默认关闭核对

日期：2026-10-16。用户授权本次提交、推送、部署，并要求新守卫、侦察、实际采运及Goal/Plan继续关闭，部署后只读核对，再提供有限侦察方案。

**本次已完成发布和只读核对，没有启动试点。** 守卫已出现在游戏运行遥测中，但尚未执行获批会话，其真实停止/移动/安全表现仍待实机复试。

## 提交、验证与部署

逻辑提交：`0f6ece7c4aed2697ac068683116b3199a6915e69`，分支`codex/single-remote-mining`。共21个相关文件，包括三层守卫、既有执行接入、79项新增回归及设计/计划/交付说明；其他三份历史未跟踪文档没有混入。

发布前重新执行完整npm test：smoke、room-governor和**330/330 Node测试通过**，无失败或跳过。仅构建成功，明确输出不上传；暂存区及工作区diff检查通过。

一次性HTTPS推送成功，远程同名分支通过ls-remote回读完整逻辑SHA。保存的origin地址和共享代理/SSH配置未改，也没有force push。

旧服务器版本`1792137398079`的main/map与此前`9e415d1`发布一致，备份保存并独立核对哈希于：

`D:/MyCode/screeps_world/automatiseerimise_impeerium/.worktrees/release-backups/2026-10-16T09-54-43.433Z/server-code.json`。

执行`npm run push`部署至screeps.com/default。临时配置通过CreateNew建立，只含既有main目标，并在finally中删除。未改主目录凭据，工作区`.secret.json`已不存在。

2026-10-16T09:56:30.472Z SDK回读default为activeWorld=true，服务器产物与上传文件一致：

| 项目 | 实际值 |
| --- | --- |
| SERVICE_VERSION | `1792144535858` |
| main SHA-256 | `432069bb521ddb9e52dc68b230c705b851f9cba734de5c160b647ce5c41c47a9` |
| map SHA-256 | `98ef3a4c18b81b9fd1bec287730cff8958343e2386ba722d93b7af0b2952c6c3` |

## 游戏运行与保护状态

本轮使用SDK GET读取游戏自身保存的RuntimeTelemetry、房间指标和选定Memory子树；没有发送生产console表达式或写战略Memory。新默认policy字段由已部署代码的既有默认值合并机制建立，没有人工写入启动请求。

| 独立样本 | 遥测/房间指标tick | operation.evaluatedAt | 母房情况 |
| --- | ---: | ---: | --- |
| runtime-1792144594769.json | 83680870 | 83680876 | normal，miner1+upcoming1、hauler3，Controller150000，energy1350 |
| runtime-1792144671946.json | 83680890 | 83680895 | normal，miner2/hauler3，Controller150000，energy1640 |

两份样本的遥测及房间指标codeVersion均为`1792144535858`；第二份的持久化services包含RemoteReconTrial，证明默认关闭的守卫服务已经被游戏调度执行。核心替换样本与后续补员完成分别列出，未将中间人口变化判为故障。

两份样本均确认：

- `policy.remoteMining.reconTrial.enabled=false`，`request=null`。
- `Memory.empire.remoteMining`下不存在`reconTrials`，没有自动创建会话、消耗sequence或启动请求。
- remoteMining.enabled=false；W48N41 enabled=false、hold=true；operation.status=disabled、allowRecon=false、allowEconomicDeparture=false。
- sourceId=null、allowContainerBuild=false、reserveController=false；scout上限1，remoteMiner/remoteHauler/reserver均0。
- Goal/Plan=false、mode=shadow；goals/plans/goalPlanningState命名空间均不存在。
- Governor shadow=true、scheduler.enforce=false、market=false。

这些是分次GET的独立快照，遥测与operation tick不同，不是同tick原子快照、连续窗口或浏览器页面验收。发布前第一次备份读取返回502，第一次Memory读取失败；第二次分别成功。失败没有作为有效证据。部署后的产物读取及两次运行核对成功，没有为网络问题改代理或反复上传。

## 证据与后续方案

本轮目录：`.superpowers/sdd/2026-10-16-remote-recon-trial-guard-release/`。

- `full-test.log`、`dry-build.log`：发布前验证。
- `upload-sanitized.log`：上传记录。
- `runtime-1792144475926.json`：旧版运行与关闭预检。
- `runtime-1792144594769.json`、`runtime-1792144671946.json`：新版独立样本。
- `release-verification.json`：备份、产物、本地上传文件、运行版本及默认关闭的审计。

相邻旧目录的SDK文件`quantity-sdk-readonly-1792144483468.json`记录备份，`quantity-sdk-readonly-1792144590479.json`记录新版产物匹配。

已准备[守卫保护下的有限侦察复试方案](2026-10-16-guarded-w48n41-recon-retest-plan.md)和[默认关闭离线JSON](2026-10-16-guarded-w48n41-recon-retest-disabled.json)。本轮未写start/release请求、未派单位、未开启Goal/Plan或采运，也未启动监视进程/自动化。

复试须另获授权，并重新核对真实人口、Spawn、接收容量、预算/冷却、入口和可靠的写入/回查通道。之后只启动一轮守卫会话，验证出生、实际位移/工位避让、跨房、连续100安全ticks、可见路线、费用及下一tick关闭确认。300ticks/20分钟先到结束，不延长原leg，不因结果不明自动重发请求。

当前没有新的原生terminal容量、真实scout人口、远程视野或采运收益证据；历史或配置id不能代替这些开始条件。实际采运与10000tick验收仍未进行。

后续文档提交可以使HEAD前进；实际部署逻辑以`0f6ece7`及上述服务器指纹为准。
