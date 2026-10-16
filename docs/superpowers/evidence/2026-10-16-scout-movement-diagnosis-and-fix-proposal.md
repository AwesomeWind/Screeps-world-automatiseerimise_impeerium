# scout 首次不动及受阻恢复：证据与修复方案

后续状态：用户已认可本方案，本地实现及RED→GREEN已完成，见[本地交付记录](2026-10-16-scout-movement-local-delivery.md)。下文保留诊断阶段原始证据与当时的RED结果，不代表当前代码仍未实现。

日期：2026-10-16，北京时间。本轮只做只读取证、局部故障回放、方案及修复目标RED验证。生产源码未修改，未提交、推送、构建新产物或部署；没有开启侦察、采运或Goal/Plan，没有新增观察进程或自动化。

工作区：C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium；HEAD=6f2633a6747d78ec582fbd0cb847e9906874051e。

## 结论分级

| 问题 | 当前证据 | 判断 |
| --- | --- | --- |
| 受阻后一直等待 | 原生blockedGoalKey、safe_wait及生产代码；临时障碍解除后的生产链回放仍不重试 | 原因已确认：同一goalKey被永久封锁 |
| 孵化期间提前派路 | 现有策略和执行器都没有spawning保护；生产链回放产生孵化期MOVE_TO、ERR_BUSY和提前开始的leg | 已确认代码缺陷 |
| 路径脱离后的返回码丢失 | 官方引擎语义、生产链注入ERR_NOT_FOUND后未即时清理、最后只留下generic stuck原因 | 已确认执行层缺口 |
| 本次线上首次为何未前进 | 路径开始于孵化完成前；真实出生点与Spawn不同；上述机制可完整复现相同后果 | “出生偏离孵化期路径”是强假设，尚非历史现场完全确证 |

不能用当前附近builder占用、当前重算路径或一次几何通过，补写当时不存在的执行记录。首次堵塞也可能包含短时交通或其他位置变化；这些替代解释尚未排除。

## 原生现场与只读复核

历史原生tick83674283：scout_83674234_Spawn1_0在W49N41(29,25)，spawning=false、fatigue=0、有效body为1MOVE。

- leg.startedAt=83674235、expiresAt=83674297。
- lastTaskClear.tick=83674242、reason=move_stuck_or_expired。
- goalKey与blockedGoalKey均为W48N41:1:25:0；状态safe_wait，task=null。
- 清理发生在leg期限之前，不能将其描述为跨房行程超时。

本轮只读tick83674571：Spawn1实际位置W49N41(30,24)，scout仍在(29,25)，保留上述清理和阻塞身份；remoteMining.enabled=false、goalPlanning.enabled=false。当前现场有附近单位，但它们不能证明出生时的占用。

原始新样本：.superpowers/sdd/2026-10-16-w48n41-recon/movement-1792118564730.json。尝试只读重算出生路径的两次补充请求遇HTTP502，均没有取得路径结果；没有将其写成成功的原生路线验证。

原始task.path已经被清理。历史样本没有每次moveByPath返回码，也未记录真正出生当tick的第一路径节点，因此不能声称找回了首次故障的完整逐tick现场。

## 控制流依据

RemoteMiningStrategyService.analyze遍历包含spawning对象的Game.creeps，没有孵化过滤；moveActor立即规划并由createRemoteMoveTask写入startedAt/expiresAt。ActionParser也没有在spawning时跳过，故不可移动的阶段会调用移动并参与停滞计数。

ActionParser.moveToTarget把路径转为RoomPosition数组交给moveByPath；只专门处理ERR_NO_PATH和ERR_INVALID_TARGET，没有处理ERR_NOT_FOUND。若creep不在路径中且首节点不与当前位置相邻，官方引擎的RoomPosition数组分支会返回ERR_NOT_FOUND；出生处理则会将creep放到相邻可用格。这提供了“孵化期旧路径→实际出生点脱离路径”的合理机制。

外部依据仅用于核对API语义，不替代screeps.com当时的实际调用记录：

- [官方引擎：moveByPath](https://github.com/screeps/engine/blob/master/src/game/creeps.js#L284-L311)。
- [官方引擎：孵化完成后的位置更新](https://github.com/screeps/engine/blob/master/src/processor/intents/spawns/_born-creep.js#L37-L44)。
- [官方引擎：出生时机](https://github.com/screeps/engine/blob/master/src/processor/intents/spawns/tick.js#L15-L24)。

ActionParser连续位置不前进达到默认5次后清理任务；RemoteMiningStrategyService.moveActor据此设置blockedGoalKey。同一goalKey后续直接return false，没有重试预算、冷却结束或障碍消失的恢复路径；只在目标身份/恢复序列变化等外部条件下才可能跳出。这解释已确认的持续等待。

## 本地复现与测试缺口

诊断使用现有RemoteMining→Bureau→EventBus→SpawnService→ResourceMarket→RemoteMiningStrategy→ActionParser测试链；移动适配器仅模拟官方API的孵化ERR_BUSY、脱离路径ERR_NOT_FOUND及下一tick位置变化，不宣称运行了完整游戏引擎。

3项故障刻画均通过，说明当前代码稳定表现出这些缺陷，而不是修复成功：

1. 孵化期分配旧路径；模拟出生落到路径外，出现ERR_BUSY→ERR_NOT_FOUND→generic stuck→永久等待。
2. 已出生单位短时受阻；障碍解除后也不再调用移动。
3. ERR_NOT_FOUND未即时保留；最终清理原因丢失原返回码。

既有fixture.moveByPath默认返回OK，既不模拟真实出生位置变化，也不检查路径是否包含当前位置；现有route_strategy_stuck_leg_not_reissued_each_tick只要求不无限重发，未要求可恢复。这就是既有套件通过却漏掉问题的具体原因。

## 建议方案：小范围修复，保留安全边界

### A. 从真实出生位置开始行程

在远程策略跳过spawning对象，不创建移动任务或leg期限；执行器也不执行或累计孵化对象的移动停滞。正常人口统计仍保留spawning作为upcoming，不能因此重复孵化。

出生后按真实位置生成第一条路径并启动leg。对旧版留下的孵化期移动记录，需要明确识别后处理，不能普遍清空所有有效leg身份或把既有行程重新计时；兼容策略应在实际实现前通过旧记录样例核对。

### B. 区分路径脱离与真正耗尽行程

对路径型MOVE_TO的ERR_NOT_FOUND即时清理为move_path_lost，保留返回码。保留一份固定大小的最近移动诊断：tick、实际起点、首节点、返回码、spawning/fatigue和失败类型；覆盖更新，不存无界路径/每tick历史，不记录完整Memory。

现有stuck保护继续生效；能区分停滞与原期限到期，不能让generic原因掩盖可恢复的路径脱离。普通本房任务不自动套用远程重试逻辑。

### C. 原期限内最多一次有限重规划

在同一leg中，对move_path_lost或尚未到期的stuck，等待2ticks后，最多允许一次从真实位置重新计算路径。一次预算按重新规划尝试计数，包括规划失败；保持在Memory，global reset不重置。2ticks是待验证的初始退避值，不宣称已完成线上调优。

重试沿用原startedAt/expiresAt，冷却也消耗原期限，不能重新获得完整行程时间。期限已到、重试预算耗尽或路径不合法时停止，并留下具体原因，不每tick重发、不自动补第二名scout、不延长资源预留TTL。

重新规划必须走当tick已有的角色、remoteId/epoch、危险、母房状态和侦察/经济出发gate。hold或危险不得触发新的outbound；已有安全返程应继续服从原return-only规则，不能将“暂停禁止出发”误改成“禁止安全返程”。

只修改现有移动执行/远程移动策略及邻近回归，不改remoteRooms/GoalPlan在线定义，不扩大远程矿、市场、Governor或scheduler控制范围。

## 修复目标RED与后续验证

已在本地scratch补3项修复目标回归，并验证全部按预期断言失败（3 tests、0 pass、3 fail；不是语法/依赖错误）：

1. 孵化scout不应收到移动任务、动作或leg期限。
2. ERR_NOT_FOUND应即时形成move_path_lost及原返回码。
3. 短时障碍解除后应允许有限恢复，同时保持原startedAt/expiresAt、不产生新远程spawn。

它们尚未接入默认npm test，避免将“未实施的目标”混入当前基线。生产实现尚未修改，不能宣称GREEN。

实施时还需补齐：真正出生位置偏离、持续阻塞耗尽一次预算、2tick冷却期间不重发、原期限到期/global reset不续期、疲劳和跨房不误判、hold/危险/epoch变更撤销outbound、禁止额外spawn/经济需求、旧任务兼容；更新原“不重发”回归为“有界重试且不续期”的明确契约。不能只删旧断言来获得通过。

验证日志均在.superpowers/sdd/2026-10-16-w48n41-recon/：

- characterization.log：3/3故障刻画通过。
- regression-red.log：3/3修复目标按预期失败。
- baseline-full-test.log：本轮重新执行npm test，smoke、room-governor及原191/191通过。

没有生产修改，因此本轮未重新build，也没有把基线191通过称为修复验证通过。下一步是审阅上述有界方案，确认后才进入生产实现及RED→GREEN、完整测试和构建；本轮继续保持全部线上功能关闭。
