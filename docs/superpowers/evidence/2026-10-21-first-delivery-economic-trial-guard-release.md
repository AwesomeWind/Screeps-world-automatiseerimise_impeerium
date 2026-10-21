# 首批入库经济守卫：默认关闭发布记录

2026-10-21 北京时间12:14完成一次上传；仅部署默认关闭版本，没有开启侦察、采运或Goal/Plan。完整远程经济闭环仍未完成。

## 发布身份和校验

- 代码提交：3f0f8d03ff4eac3db54a775aa6a951b6f01435df，已推送codex/single-remote-mining；HTTPS回读远端HEAD一致。origin仍为原SSH地址，没有修改Git远端或共享代理配置。
- 服务器：screeps.com/default，activeWorld=true；SERVICE_VERSION=1792555927985。
- main SHA-256：74ee3269ab7b8c4c11827602c68cfbd39de3d2627c43bf84c2468da9eb8e6bd9。
- map SHA-256：fe59ff42a273cf29eb8ff9520a15437404c044cd01d37cd9c4f3b284cb094e93。
- 运行遥测tick83777770确认新版本，操作评估tick83777774；这是SDK只读离散样本，不是浏览器验收或连续运行窗口。
- 发布前新备份：D:/MyCode/screeps_world/automatiseerimise_impeerium/.worktrees/release-backups/2026-10-21T04-10-08.562Z/server-code.json。备份文件SHA-256：8cda2e8865f43438330a596d19d5a04b40193254c180dbc31993f4d2699225b5。

最初审阅候选在精确暂存检查发现新增文件EOF空行后已替换；仅整理EOF换行，无行为改动。最终候选candidate-1792555923833重新执行smoke、Governor、完整512/512、dry build和两项diff检查，均通过。105个源码输入与提交按Git CRLF规范化核对一致；新包10个entry逐一哈希核对。最终ZIP SHA-256=01566d3c32d37c37c2375fe07b4b4f191f7be94659e2b9a1f4d4bba0064e121a。未将旧候选指纹冒充此次产物。

## 部署后关闭和兼容检查

- economicTrial.enabled=false、request=null，未创建economicTrials会话namespace。
- remoteMining.enabled=false，W48N41 enabled=false/hold=true，allowContainerBuild=false、reserveController=false；remoteMiner/remoteHauler/reserver额度0。
- operation.allowRecon=false、allowEconomicDeparture=false。
- GoalPlanning.enabled=false，goals/plans/goalPlanningState namespace均不存在。
- Governor shadow=true，scheduler.enforce=false，market.enabled=false。
- 旧recon policy仍保留enabled=true的历史start请求，但current是aborted、关闭tick83761727、sequence3；部署前后reconTrials摘要哈希相同。它是已关闭托管锁，不是新侦察。未擅自release、清空或覆盖旧会话。

服务器main/map与固定候选逐字节哈希一致。首次部署后Memory遥测仍显示旧版本但新增默认策略已出现；等待下一次既有低频遥测后确认新版本，没有因此重传代码或修改Memory。

临时A02预检曾部分成功又502，按约定已恢复A01，前后配置文件哈希不变；本次最终完整预检、上传和回读均在A01完成。链路历史不稳定不能由这次发布成功推断已经根治。

## 验收边界和下一步

本轮仅完成默认关闭发布。完整侦察仍欠连续100个新鲜安全ticks，旧49/100不能拼接；没有真实经济入库、费用/unknown完整性、净收益、经济关停和恢复的线上证据。tailStatus自动归约Minor仍保留unverified，不得用控制关闭冒充全部在途结清。期初库存也不能冒充新产出。

下一步应是另行授权的有限侦察，先核对新版本、母房、预算、连接、旧actor和未决费用，旧锁满足释放条件后才开始新会话；最多一名scout、300ticks或20分钟先到停止。实际采运和Goal/Plan保持关闭。此次提交/推送/部署授权不包含该启用动作。

本地原始证据位于.superpowers/sdd/2026-10-20-first-delivery-economic-trial-guard/：pinned-upload-attempt/result、release-verification、release-index-verification、最终候选及其verification/logs、release-state-pre/postdeploy。没有凭据或完整Memory进入报告与Git。
