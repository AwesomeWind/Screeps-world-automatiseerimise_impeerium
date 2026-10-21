# 首批入库经济守卫：本地验证记录

日期：2026-10-20。工作区：C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium；分支codex/single-remote-mining；BASE/HEAD=03464efee41b14723b7559f676a25e0225868d88。

用户已授权六批本地实施＋一次只读独立review；未授权提交、推送、部署、旧侦察锁release或采运start。本地实现与完整验证已完成；独立review的5项Important已按RED→GREEN修正，1项Minor明确保留。不能据此自动发布或启用。

## 已实现的范围

- 新经济会话默认关闭false/null，独立Identity/current/previous；不创建Goal定义，不复用旧侦察费用、单位或安全ticks。
- 总上限1000ticks/90分钟、scout/miner/hauler各1、真实body费用50/≤800/≤800、整轮1650/6000和原滚动预算交集；unknown调用保留额度并关停。
- 本轮scout真实视野和100连续安全ticks后才放行经济角色；role权限、容器位置和真实terminal取交集，旧任务及原生孵化/工地/动作入口复核。
- 物流确认原规则不变；删除owner前持久outbox，prepared/applying/applied区分。首批必须具体本trial/trip的confirmed pickup与指定terminal次tick入库；部分入库也停，applied后同步关闭，不依赖外部轮询。
- 费用归约保留完整本轮receipt绑定；基建在途应用不明也停，不改原ledger计费/归因算法。可失败记录与控制关闭分离；原TTL/50tick和安全leg规则保留。
- 摘要只读，区分knownNetEnergy与含unknown时不可判定的netEnergy；期初库存和未证明的新产量分列。

## RED→GREEN和验证证据

日志目录：`.superpowers/sdd/2026-10-20-first-delivery-economic-trial-guard/`。缺模块的初始P1 RED仅证明新API尚不存在；后续批次的实际断言失败分别记录，不能将缺模块或手工累计值当作生产链覆盖。

| 批次/边界 | 本地证据 |
| --- | --- |
| P1默认/身份/期限/旧锁/P0 | p1-red、p1-green(4/4)、p1-combined(162/162)，runtime默认关闭和主顺序纳入full |
| P2唯一slot/原request两次调用/未知grant | p2-red→p2-green(8/8)；actual role费用和grant篡改纳入full |
| P3旧HARVEST/缺适配器、没有本trial scout不能计安全值 | p3-red→p3-green(12/12)；工地创建前撤权亦有RED→GREEN |
| P4真实次tick首批/owner删除前中断/失败移交 | p4-red→p4-green(15/15)；local-isolation-red→green证明普通母房取能不被误当trial |
| P5坏slot/actor丢失/坏identity、应用不明/reset | p5-red→p5-green及p5-combined(325/325)；handoff-boundaries-red→full补同tick关停和最小unknown留存 |
| P6只读净额摘要/遥测关闭仍自停 | p6-red→full |

最终完整结果：Node套件512/512（新增71项），无skip/cancel；smoke退出0；room-governor退出0；dry build退出0并明确“未指定目标，代码将被编译但不会上传”；两项diff检查退出0。退出码见final-exit-codes.json。review前497/497结果保留于full-pre-review.log，不冒充修正后证据。

smoke曾复现没有Memory时ActionParser兼容错误，已改用globalThis.Memory可选读取后GREEN。原owner清理已有maxExpiresAt约束，未另加续租；移交记录失败时保存最小unknown证据，避免释放后无证据。

## 本地真实顺序示例（仅mock运行）

`local-first-delivery-example.json`：从tick101启动，最终双Spawn fixture中tick411确认首批400 energy，tick412确认控制关闭；真实fixture孵化费用合计1550，基建0，费用/物流unknown为0，已知净energy=-1150。期初容器500；newProductionConfirmed=null，不能说这400全部来自本轮矿工，更不能当作线上收益或长期盈利。修正前示例另保留，不拼接窗口。

示例按真实RemoteMining→Bureau→Spawn→Market→Strategy→ActionParser顺序驱动，仅由fixture在下一tick应用位移、孵化与store变化。它不是游戏服务器记录。

## 一次独立review及一轮修正

review-package.md包含完整未提交diff、新增未跟踪src文件和Review Focus；review-result.md保存问题与正式用例映射。共5项Important：安全计数损坏、未决基建release、单Spawn排队、not_started重置、半完成spawn账本；均有实际RED并在最终全量GREEN。主代理另修复release后新start接纳前漏放、release schema及非法策略/母房隔离边界。未追加第二次review。

保留1项Minor：tailStatus自动归约尚未实现，当前明确unverified。控制关闭、tail已确认数额与不确定费用已经分开展示，但不能宣称全部在途演员/货物和账目已收尾。后续有独立需求时补“返程中/待确认/到期/已结清”状态；这不是线上已通过的证据。

## 已作实施判断

1. 用户禁止提交与清理覆盖技能模板的commit/删除scratch步骤；所有日志和历史未跟踪文档保留。代价：证据仍只在本地，未来发布前需要按授权提交/备份。
2. PowerShell用等价日志/本地ledger代替bash辅助脚本；不改共享运行时或网络设置。代价：需靠ledger逐项核对，不依赖辅助脚本自动生成的步骤记录。
3. 纯Model不读Game/BODYPART_COST；由Service验证实际body并传bodyCost。JSON配置指纹≤4096，trialId≤64分别检查。代价：新协议严格，损坏字段会拒绝动作并需调查。
4. 真实fixture在tick350出现矿工deposit与hauler pickup同tick、导致严格净变化不可归因；只收窄托管矿工的同容器deposit，不修改确认算法。其他不可归因并发仍unknown停止。代价：pickup期间短暂停deposit，会牺牲部分吞吐。
5. 基建仅留单个在途应用证明；中断时保守unknown并禁止重放。目标消失/完工无法归因时不推测费用。代价：可能中止试点，需要后续核验，不自动补账。

孵化账本修正同样采用applying/applied；只有本轮完整应用证明和receipt一致才确认费用。原对账增加可选的托管grant恢复许可，非托管默认行为与金额算法不变；无法证明则保留原claim和unknown，不能删除receipt重算。

## 线上与后续门槛

本轮未联网核对游戏状态，未部署、未运行生产console或写在线Memory；“保持关闭”是本轮操作边界，不是新鲜线上采样。dist仅本地产物，不能用于宣称服务器版本变化。

新版本完整侦察工程验收仍未通过（既有49/100的中断记录不能补成100）；可靠连接、旧actor/未决claim退场、显式release、真实母房/terminal/预算/路径及采运start都需未来授权下新鲜预检。实际采运入库、真实成本完整性、未知执行、停止恢复及长窗口仍未在线验收。总体远程经济闭环未完成，暂不出具通过结论。
