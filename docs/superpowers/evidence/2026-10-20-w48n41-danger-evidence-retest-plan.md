# W48N41危险情报留存：有限侦察复试方案

日期：2026-10-20。**仅离线方案，尚未启动。** 本轮发布授权不包含重新侦察；当前侦察、实际采运和Goal/Plan继续关闭。

目标：在既有守卫限制内核对一名scout的出生、实际移动、跨房视野及本轮连续安全条件；若自然遇到危险，核对先关停、再独立留存危险情报的线上行为。不得制造敌情或故意堵路来补覆盖。

## 1. 启动前重新读取

下列条件须在未来用户明确授权后、实际写入前刷新，不能沿用发布时快照：

1. default仍activeWorld=true；服务器main/map及实际执行版本匹配1792461044554。任何版本变化先重审方案。
2. 旧会话仍终态且closureVerifiedAtTick大于closeAppliedAtTick；无新会话、未决孵化或未结费用。保留旧request、原期限和托管锁，不能清空store或执行release绕过检查。
3. 母房normal，至少1名可用miner和1名hauler，核心补员完成，Spawn空闲；Controller降级计时至少5000，母房无危险，预算无unknown/exhausted。
4. 实际terminal仍为6ad0b55bceeb3db0d3b4dda0，剩余空间至少20000；仅配置W48N41这一目标。
5. 原生读取Game.creeps、spawn.spawning及accepted/未决grant、receipt，确认无旧scout或其他远程经济单位。确认200tick侦察间隔，2000/1000tick孵化与6000/1000tick基建预算不超限。
6. 最新入口/母房通道可通行。历史(49,38)危险信息已陈旧；不将其当成当前无敌或仍有敌的事实。
7. 必要的HTTPS GET、原生console、启动后回读和关停回读链路可用。每步最多三次有限重试；必要事实不可读就不启动，不修改共享网络配置。

发布时的母房、terminal与actors样本只用于准备参考，不构成上述实时通过。

## 2. 唯一一次守卫请求

再次明确授权且全部预检通过后，生成一条新的受限start请求：

| 字段 | 取值与约束 |
| --- | --- |
| schemaVersion / action | 1 / start |
| id | 当场生成唯一id，长度不超过64 |
| sequence | 新鲜lastSequence+1；发布时高水位1，候选为2，执行时重读 |
| remoteId / epoch | W49N41:W48N41 / 新鲜operation.epoch；发布时为1 |
| codeVersion | 1792461044554，必须与执行版本相同 |
| activateAtTick | 提交脚本当场读取Game.time+1 |
| expiresAtTick | activateAtTick+300 |
| issuedAtMs / expiresAtMs | 当场Date.now() / issuedAtMs+1200000 |
| candidateSourceId | 5bbcaa6d9099fc012e63155b |

同一原子表达式在检查版本、旧终态、高水位及关闭范围后，写入新request、保持guard.enabled=true，并仅为有限侦察打开remote模块及W48N41 enabled、解除hold。表达式执行前离线检查1024字符传输限制，使用唯一响应tag。

保留sourceId=null、containerPos=(19,6,W48N41)、allowContainerBuild=false、reserveController=false；角色上限仅scout=1，其他远程角色全部0；Goal/Plan继续关闭，其他控制保持当前shadow/enforce/market设置。不能使用旧“store不存在”的启动脚本。

引擎成功接收console不等于守卫接纳。必须回读新身份、原期限和绑定spawn请求；若提交结果不明，先查询同一身份，不重复生成id/sequence补发。正常接纳由守卫轮换current→previous，保留旧结果，不手工清除历史。

## 3. 限额与观察

- 整轮最多成功孵化一名1 MOVE scout，成本50；无替补。未知孵化结果保留额度，不清掉grant重试。
- 300 ticks或20分钟先到即止，包含孵化与行进；出生、受阻、重置、网络中断均不延长总期限或原leg期限。
- 记录accepted、spawning、出生、实际坐标变化及进入W48N41的不同证据。move返回OK不能代替实际位移。
- 自然出现受阻时，按既有最多一次重规划、2tick冷却和原leg期限检查恢复；未发生则标该场景未覆盖。
- 取得真实视野后核对source、container候选位置、owner/reservation及hostile；不写建设、采矿或预留controller意图。
- 本轮自身积累100连续安全ticks，不能继承旧11tick或operation历史计数。核对同tick可见source有效及真实路线结果。
- 以真实source/terminal和拟用body重新计算经济路线，沿用原leg期限上限300；侦察路线可行不等于实际运输/收入验收。

## 4. 危险留存与关闭分开验收

自然出现danger/home_danger时，首先核对动作前撤权、模块/房间关闭及许可拒绝；随后读取独立dangerEvidence，确认新会话完整身份与停止tick，查看敌方id/name/owner/位置/有效部件摘要。

分别记录关停结果与证据状态。captured、partial、unavailable、failed、skipped_cpu及pending跨tick显示interrupted都需如实呈现；记录不全或失败不影响停止，也不授权重新外出。不能在后续tick补录新对象冒充事故当时敌人。

未自然发生危险时，新危险快照线上捕获仍属未覆盖；本地故障注入回归通过不能代替该项。跨tick留存可只读核对；不人为制造生产reset，未自然发生的重置场景仍标未覆盖。

## 5. 停止、回读与报告

成功、危险、任一期限到达，或版本/身份/配置变化、母房危机、预算不明、额外actor、重试耗尽等异常，均停止本轮，按既有守卫关闭。核对下一tick closureVerifiedAtTick大于closeAppliedAtTick，remote=false、W48N41 enabled=false/hold=true、经济角色0、Goal/Plan=false；许可拒绝spawn/outbound，保留既有安全return，不强派、不suicide。

必要读取连续三次失败时，如实标记外部观察中断；依赖已部署守卫限时停止，恢复连接后回读。没有回读证据不能宣称人工关闭成功或一直持续观察。

保留outcome、费用、独立危险证据及托管锁；不执行release、不自动第二轮。最终中文报告区分：出生/位移/视野、连续安全、路线、危险明细、恢复与重置覆盖、关闭确认，以及读取缺口。

**本方案不启动实际采运。** 后续采运须另行授权，并单独验证预算、真实往返、下一tick配送确认及长窗口收益；本轮不能宣布远程矿或10000tick验收通过。
