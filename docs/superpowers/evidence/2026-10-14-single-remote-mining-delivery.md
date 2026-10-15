# 单远程矿本地交付证据

更新：2026-10-15。状态：本地实施、一次独立只读 review 及其问题修复完成；修复后完整门禁通过。尚未提交、推送、部署或启用线上 pilot。

后续用户已明确授权提交、推送和部署，仍保持远程矿关闭。本报告保留提交前的本地验证记录；实际发布进度见[发布与试点核对](2026-10-15-single-remote-mining-release.md)。

## 版本和工作区

- 主目录：D:/MyCode/screeps_world/automatiseerimise_impeerium；原有诊断文档保留。
- 实施 worktree：C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium。
- 基线与当前 HEAD 均为 9ab8f4263024904972935987fe83672db3802f75，全部本轮修改留在工作区。
- 前一阶段线上业务版本仍按历史发布记录为 647dac7；本轮没有回读服务器确认，也没有改变线上版本。单房 10000-tick 验收仍待验收。
- Governor shadow、scheduler.enforce=false；remoteMining.enabled 默认 false。

## 本地验证

Batch A/B/C/D 均运行 npm test、无 DEST build 和两类 diff check。修复后的最新完整门禁通过：既有 smoke、room-governor 和 93 个远程专项用例，fail=0。测试中两条 ERR_BUSY 日志来自主动失败回收用例，不是遗留运行失败。

独立 reviewer 重跑初始 79 个用例通过，额外 probe 找到 6 个 Important（无 Critical/Minor）。维护者逐项增加 RED→GREEN 回归并修复：返程旧路径危险重核、矿工工位交接、改母房排空旧身份、经济路线准入、物理接收容量共享，以及未知孵化成本与成功备份补核。详情见 [独立 review 与修复记录](2026-10-15-single-remote-mining-review.md)。修复后的维护者回归不冒称第二次独立 review。

未知孵化成本明确区分历史 unknown 次数和当前未决上界：无证据的 executing grant 保留预算占用并暂停新经济；迟到的实际孵化/活体与成功备份证据可幂等补核。窗口把可下降的未决上界保存为数值 gauge 的 end/max，不作为单调 counter；不以缺失成本为零宣称完整收益。

专项用例使用真实 RemoteMining/Bureau/EventBus/Spawn/ResourceMarket/策略/ActionParser；只模拟 Screeps 世界输入和引擎动作返回。OK 不立即改变 store，下一 tick 显式供受双方快照才结算。整体回放直接使用生产 main.loop，并覆盖真实装配顺序、源取货→带货返程→母房收货、替换重叠、hold、满仓、danger、global reset 和已接受动作的迟到结算。本地引擎快照模拟不是 Screeps 服务器或页面验收。

游戏内窗口的纯函数回放覆盖两个连续 10000-tick 段；只保留 current+previous 和固定摘要。10000 ticks 后为 review_required，acceptancePassed=false。缺 CPU、跳 tick、未完成 frame、disabled、版本/epoch 切换不会合并完整段；rollingCpuP95 明确只来自既有滚动摘要。

原始 RED/GREEN 与门禁日志位于 worktree 的 .superpowers/sdd/2026-10-14-single-remote-mining/；该目录由技能设为本地忽略，不作为提交内容。维护者裁决与任务结果见配套 ledger。

最终无上传产物：SERVICE_VERSION=1792027761395；main.js SHA-256=a1185364c979b245a6164c7e72d8745235b21f6c4716dd6245ede1d1de3e06c6；main.js.map.js SHA-256=c019de728f31233f77e6f345f63dcf0304fb8be29eb9641a146da3cd9ce9df44。构建插件把 map 转换为 main.js.map.js，未产生独立 main.js.map；这些只标识本地产物。

## 交付能力

一个相邻中立房、一处 source；规范身份及唯一孵化入口；2000/1000 的母房孵化预算和 6000/1000 基建预算；一个容器的自建/维护；最多两名运输者；同一母房 ResourceMarket ledger 的近端预留与下一 tick 实际收入；危险暂停、安全撤回/等待、200 ticks 冷却的有限侦察和连续安全 100 ticks 后恢复。

确认母房收入仅接受 canonical remoteHauler 的 home_delivery；建设、源侧存货、pickup、任务 OK 不计母房收入。并发差额和带货死亡保留 unknown 或成本上界。重新规划不延长绝对 leg 期限，fatigue 不累计远程 stuckTicks。

## 真实验收和下一阶段输入

未部署，尚无本版本的线上采运、CPU、盈利或 10000-tick 连续场景证据；不主动制造线上危险或死亡。

母房历史目标为 shard3/W49N41；具体邻房/source、可站立的 range-1 容器格、安全入口和合法母房 storage/terminal/container 接收 id 尚未完成当前版本的只读事实核对，不能凭测试 W1N1/W1N2 配置启用。

建议首次 pilot 保持上述初始预算、reserveController=false、maxOperations=1，先核对实际 body、往返地形/行程和接收容量。它们是保护上限，不是最优产能或盈利判断。部署/配置/启用需要用户下一条明确指令。

回退先停止新需求、出发和工地，允许安全返程及同 owner 最后结算；旧 actor/孵化/回执未清尾前不切新 source epoch。保留实际成本和 unknown；代码回退不能撤销已执行的游戏动作。
