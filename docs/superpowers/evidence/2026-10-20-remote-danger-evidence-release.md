# 远程危险情报留存：发布与关闭状态核对

日期：2026-10-20（北京时间）。本次发布已完成；未开启侦察、实际采运或 Goal/Plan。

## 发布身份与验证

- 代码提交：`7faf8aa9032976c42d74737c3ead06356fc20300`，分支 `codex/single-remote-mining`，已推送并回读远端 SHA。
- 游戏：screeps.com / default，activeWorld=true；shard3 / W49N41。
- SERVICE_VERSION：`1792461044554`。
- main SHA-256：`6f9b157f716245e3ec1b2223df1e3318a3a1777ff429b5032abe6fcb8b65d617`。
- main.js.map SHA-256：`034319d59b83e85c211320f485104b4d8bf5036c1aaf6c3c1cc2b64da843538d`。
- 北京时间09:50:48上传；服务器产物已回读匹配。原生tick83755812确认新版本执行，tick83755814确认守卫拒绝孵化和外出。
- 两次更新后的SDK遥测：tick83755810、83755830；operation分别为83755815、83755838。均为分次离散样本，不能视为连续验收。

发布前重新执行smoke、room-governor和完整Node测试集合，均退出0，完整测试 **387/387**，失败/跳过均0。实现阶段最终dry build已通过，本轮上传构建也成功。一次独立只读review的反馈已在代码提交前补RED→GREEN并修正，详见[本地验证记录](2026-10-20-remote-danger-evidence-local-validation.md)。

本次代码让守卫先关停，再尽力记录危险对象；独立ledger与有界摘要不参与动作授权。旧pending跨tick显示interrupted，不重新取样补旧事故。异常隔离、重置留存等结论来自本地回归；本次没有新线上危险事件，尚未取得新捕获链的线上验收证据。

## 已回读的关闭状态

| 项目 | 本轮结果 |
| --- | --- |
| remoteMining.enabled | false |
| W48N41 | enabled=false，hold=true，sourceId=null |
| 实际采运与建设 | remoteMiner/remoteHauler/reserver上限均0；allowContainerBuild/reserveController均false |
| 运行许可 | operation.status=disabled，recon/economic均false |
| 守卫许可 | allowSpawn=false，allowOutbound=false，allowReturn=true，reason=trial_closed |
| Goal/Plan | enabled=false，mode=shadow；goals/plans/goalPlanningState命名空间不存在 |
| 其他控制 | Governor shadow=true，scheduler.enforce=false，market.enabled=false |

**reconTrial.enabled=true被原样保留**：这是旧已中止会话的托管锁，不是正在侦察。旧已消费request未清空，未执行release，也未提交新start。判断关闭使用会话终态、下一tick关闭确认与实际许可，不只看该单一布尔值。

## 旧记录兼容

旧会话 `w48-20261019-02`、sequence=1、epoch=1、历史codeVersion=1792144535858均保留。原期限83736103→83736403未改；危险中止tick83736139，关闭确认83736140，原safeStreak=11及既有路线结果未改。

发布前后对身份、原时间、spawn、outcome及关闭时间做规范化校验，SHA-256同为：

`c85217b89b6513f72f7e5bd5b5c14e8af6719c7dea052624ca28b3a4ba2f6e7e`

旧危险明细原本不存在，本次仍未创建dangerEvidence存储；新摘要明确显示 `not_recorded / historical=true`。没有回填敌方身份，也没有重写旧outcome。旧会话中的旧codeVersion属于历史证据，不是当前版本错误。

旧情报仅能证明tick83736139曾见hostile及(49,38)危险区域。现在没有新W48N41视野，无法据此判断敌方当前身份、仍在场或已离开。

## 母房与连接边界

原生tick83755812：recovery=normal，miner2/hauler3，Controller降级计时150000，Spawn1空闲；terminal真实id=`6ad0b55bceeb3db0d3b4dda0`、free=299201。tick83755813目标范围内scout/远程角色列表为空。上述只是发布时快照，复试前必须刷新。

SSH链路超时后使用现有凭据经HTTPS推送，没有修改origin或共享代理。API曾返回502；首个上传后低频遥测仍显示旧版本，后续遥测及原生执行已确认更新。连接仍有间歇失败，不能宣布链路稳定，也不能把本次样本当作浏览器验收。

## 备份与本地证据

旧服务器代码完整备份：
`D:/MyCode/screeps_world/automatiseerimise_impeerium/.worktrees/release-backups/2026-10-20T01-46-00.493Z/server-code.json`，已核对旧产物哈希。

工作区内证据目录：
`.superpowers/sdd/2026-10-20-remote-danger-evidence-release/`。

关键文件为release-verification.json、upload-manifest.json、upload-sanitized.log、postdeploy-1792461111690.json、postdeploy-1792461210668.json及home/actors/guard原生样本。测试日志为smoke.log、governor.log、tests.log。服务器指纹另存于 `.superpowers/sdd/2026-10-14-single-remote-mining/quantity-sdk-readonly-1792461063424.json`。

临时worktree凭据已删除；没有写入线上目标定义、创建自动跟进、开启试点或派发采运任务。详细[有限侦察复试方案](2026-10-20-w48n41-danger-evidence-retest-plan.md)留待用户另行授权。
