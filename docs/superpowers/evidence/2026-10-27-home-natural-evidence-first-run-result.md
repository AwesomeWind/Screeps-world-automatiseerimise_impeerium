# W49N41 首轮自然采集：已关闭，未取得窗口数据

日期：2026-10-27（Asia/Shanghai）

## 结果

本轮唯一ID home-w49-20261027-01，版本1793072703455。启动配置确已应用，但未取得观察数据；接纳点后两次紧凑读回和最终一次完整下载均未发现窗口。按约定提前结束，原ID关闭ACK及读回确认enabled=false，原request和截止保留，没有换ID、重发、提交或部署。

- request.issuedAt：2026/10/27 14:13:08，expiresAt：2026/10/27 14:23:08，固定600000ms。
- 原接纳锚点：83898135；末允许tick应为83898234，没有重算或续期。
- monitor-0在Game时间83898135未见header/capture；monitor-1在83898139仍未见。这里只说明采样点没有数据，不能倒填历史或宣布具体失败根因。
- 实际运维结束：2026/10/27 14:13:41，因为启动未确认提前关闭，不是采满100tick或10分钟。
- 唯一完整HTTP下载返回 {"ok":1,"data":"Incorrect memory path"}，按父路径不可用记missing。原响应SHA-256 54cba2c9b54f17250a17f8cadb7591059f8026eaa43b177d678ae483f573b353。没有第二次下载或换经济路径。
- 本轮未取得采出、转移、CPU采集开销或连续覆盖证据；金额与行数不填0来冒充观测。没有经济验收或生产语义确认。

## 预检与已确认关闭

代码/活跃default/运行版本和关闭状态预检通过。母房对象HTTP快照：己方creep7、hostile0、source2、计入的结构134，候选遍历下界143，低于200；这是下界，不证明当tick完整选择一定成功。母房摘要normal、核心2miner/3hauler；Game内实际gate/CPU/选择仍由collector判断。

启动一次HTTP console配置脚本，无WebSocket。脚本在游戏内冻结issuedAt/expiry和Game.time+1锚点，保留CPU值，原子写仅homeEvidence配置；两种console相对主循环顺序、late queue、重复拒绝/身份关闭及unknown不重放在本地验证。

关闭只匹配本轮ID/版本，policy.enabled=false且request与首次读回完全一致。其他侦察/采运/Goal-Plan/市场有效权限继续关闭，Governor shadow=true、scheduler.enforce=false，旧econ/native/recon/请求/费用原样保留（recon原诊断tick单调更新）。没有重写旧预算/锁或制造游戏动作。

## 收尾比较器错误及本地修正

现场result.json保留businessSafe=false及RECON_REJECTION_TICK_INVALID原错误。原因是入口把预检返回的归一化recon对象（已删除lastRejection.tick）当成原始基线再次传入要求原tick的比较函数；不是证明旧记录被改坏，也不是新的网络失败。

audit-red.txt/green-04.txt保存本地复现及修正验证；raw-post-audit.json对保存的原始前后快照比较通过，确认旧记录一致、原ID关闭和其他业务关闭。它不发新网络请求，不追写现场result，也不据此重开窗口。执行时IO源码/config已备份，后续局部修正与历史执行区分。

## 留存与限制

证据目录 .superpowers/sdd/2026-10-27-home-natural-evidence-operations/attempt-01/，包含pre/server/room备份、card、arm/close intent、request回执、两次monitor、close读回、post快照、唯一download原响应和原result。该轮额度已消耗；不删除目录、清request或换ID再试。

入口初始15/15离线验证通过；收尾审计补充后18/18通过。公开游戏代码/39个发布文件/旧dist与混合进度文档hash未变，Git HEAD仍48dfc0e、暂存区为空；没有改网络、提交、推送或部署。真实窗口数据缺失不因本地GREEN而变成通过。

下一步仅建议本地排查首次接纳为什么没有持久窗口，重点是接纳时序、实际gate/选择和CPU阶段，以及失败原因为何未留存。当前证据不足以认定是CPU、候选200上限、原生API或持久化故障；不能放宽上限、延长期限或自动重开来替代诊断。
