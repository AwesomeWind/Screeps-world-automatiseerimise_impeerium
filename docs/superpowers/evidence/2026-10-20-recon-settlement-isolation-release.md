# 侦察会话结算隔离：发布与只读验收

日期：2026-10-20。本次按用户认可的第一步完成提交、推送和部署。侦察、实际采运、Goal/Plan保持关闭，没有发送新试点请求。

## 发布身份

| 项目 | 本轮结果 |
| --- | --- |
| 代码提交 | 74b4941657ad2327343bf0f764a93569e20ddce9 |
| Git分支 | codex/single-remote-mining；推送后回读远端SHA匹配 |
| 游戏目标 | screeps.com / default，activeWorld=true，shard3/W49N41 |
| SERVICE_VERSION | 1792484139799 |
| main SHA-256 | 294c015516adc3f8b52ec282cf9fe1243c278547fdbe932d6abd5f7a8f5bbdb4 |
| main.js.map SHA-256 | 4c48d1ce94d3c1a09203b4b17504ab7debec3d2e75e77458f5c1d3eb2c394682 |
| 上传完成 | 北京时间16:15:44 |
| 原生执行确认 | tick83761342 |
| SDK操作状态回读 | tick83761341、83761346 |

发布前重新运行完整Node测试441/441，失败/取消/跳过均0；smoke、room-governor通过。上传构建退出0，服务器main/map回读与上传产物匹配。实现阶段已完成一次独立只读review，并修复一项Minor；详见[本地验证报告](2026-10-20-recon-settlement-isolation-local-validation.md)。

13个本轮代码、测试和设计交付文件明确选入提交；其他历史未跟踪文档保留。经现有凭据使用HTTPS推送，未改origin、共享网络或代理配置。未重复上传。

## 关闭状态

两次SDK与原生guard均核对：

- remoteMining.enabled=false；W48N41 enabled=false/hold=true，sourceId=null。
- remoteMiner/remoteHauler/reserver上限0；allowContainerBuild/reserveController=false；recon/economic许可false。
- Goal/Plan enabled=false、mode=shadow；goals/plans/goalPlanningState命名空间不存在。
- Governor shadow=true、scheduler.enforce=false、market=false。
- 原生守卫allowSpawn=false、allowOutbound=false、allowReturn=true，reason=trial_closed。
- reconTrial.enabled=true及旧request作为终态托管锁原样保留，lastSequence仍2，没有start/release或第二轮。

原生home tick83761343：母房normal，miner2/hauler3、upcoming0/0，Controller降级计时149976，Spawn1空闲；terminal真实id=6ad0b55bceeb3db0d3b4dda0，free=300000。actors tick83761345相关角色为空。均是发布时离散样本，未来启动必须重读。

## 旧记录兼容

发布前后完整reconTrials原始对象（包括current/previous的settlement、outcome、身份、原期限及关闭时间）规范化SHA-256均为：

`b102369bd7c9b3d9cbd7d82a2679915fe91ad637da6e51db11595ecd08bc6777`

current仍为w48-20261020-01/sequence2/completed，previous仍为w48-20261019-02/sequence1/aborted。旧current的settlement.updatedAtTick=83736103也原样保留；没有刷新成新确认时间，没有自动补settlementBinding。

新运行摘要与原生摘要中，两条历史会话的settlementSourceStatus均为legacy_unverified。这是缺少本轮绑定的兼容标记，不能当作新会话绑定已验收，也不表示旧50费用在新发布中重扣。

dangerEvidence原始存储仍不存在，旧危险摘要仍not_recorded；没有新危险、目标定义或事故补录。旧request/identity中的codeVersion属于历史字段，当前实际版本用global执行版本和服务器产物核对。

## 备份与证据

旧服务器完整模块备份：
`D:/MyCode/screeps_world/automatiseerimise_impeerium/.worktrees/release-backups/2026-10-20T08-14-32.222Z/server-code.json`，已校验备份模块哈希。

本轮证据目录：
`.superpowers/sdd/2026-10-20-recon-settlement-isolation-release/`。

关键文件：upload-manifest.json、upload-sanitized.log、release-verification.json、两份postdeploy快照、guard/home/actors原生结果、tests/smoke/governor日志。服务器指纹在旧工具目录quantity-sdk-readonly-1792484168395.json，旧备份指纹为quantity-sdk-readonly-1792484072237.json。

临时worktree .secret.json已校验归属并删除，没有输出凭据。没有创建后台采集或自动化。

## 验收边界与下一步

本轮证明了新版本执行、关闭状态、旧原始记录不迁移及legacy_unverified导出；两次SDK遥测tick均为83761340，operation已从83761341推进至83761346，原生另有独立tick。不能将这些分次读取称为连续采集或10000tick验收。

新会话费用/unknown隔离、post-event结算和重置已经本地回归通过，但本轮没有新线上会话，因此尚无新settlementBinding/scoped费用的线上验收。也没有新危险捕获、实际采运或收益证据。

下一步见[新版本有限侦察复试方案](2026-10-20-recon-settlement-isolation-retest-plan.md)，仅离线准备，待用户另行明确授权后才可启动。
