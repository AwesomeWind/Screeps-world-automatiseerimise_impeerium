# 原生坐标与 scout 边界移动：本地修复验证

2026-10-22。用户已确认四点有明确范围的本地修复，仅由主代理实施。本轮实现与验证完成：完整 `npm test` 的 547/547、smoke、room-governor 通过；未设置 DEST 的 `npm run build` 成功。没有暂存、提交、推送、部署、调用生产 API、修改线上 Memory 或重开试点。

工作区为 `C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium`，分支 `codex/single-remote-mining`，HEAD 仍为 `302ed1a11ed091afb1452da525bbf18e3a035f77`。本地 dist 含新修复，不能拿它当服务器版本或用它误报线上指纹变化。

## 已实现

| 批次 | 改动 | 针对原问题的证据 |
| --- | --- | --- |
| 1 | RemoteEconomicTrialFacts 显式读取原生 actor 的 x/y/roomName；RemoteMiningService 的 source/sink route 快照同样显式提取 | 不可枚举原生形态下，原代码取得空对象的两项断言 RED；修复后坐标与本轮安全计数正确，2/2 GREEN |
| 2 | 恢复期仅允许同身份 scout 向原入口内侧移动；要求新鲜 scope、recovering/safe_streak、真实远程视野与安全、有效 source/route、控制和预算检查通过、未退休、目标与 range 精确匹配入口 | 正向与十项拒绝场景通过；没有打开 scope.allowRecon 或 allowEconomicDeparture；恢复期 miner/hauler 调用仍为0 |
| 3 | ActionParser 在原任务路径已验证后，仅给两允许房间的成对出口首步添加当前起点，供原生 moveByPath 识别 | 东西南北四向均执行跨房后向内一步；房间不相邻、未列入 allowedRooms、斜跨/出口错位、角落、普通偏离路径都不新增宽松回退 |
| 4 | returnActor 不再把母房出口格视为内侧安全到达；安全时继续原返程目标 | 四条母房边界均可向内移动；失败后最多一次重试，原 startedAt/expiresAt 不变；超期保持停止；母房危险时不生成移动任务 |

没有改变原100连续安全ticks、唯一成功角色额度、孵化/基建预算、未知结果处理、严格次tick物流归因、关闭判据或默认策略值。没有给动作守卫增加通用 bypass，没有用无限重规划或刷新期限恢复移动。

## 测试与 RED→GREEN

新增35项产品回归：原生坐标2项、恢复许可11项、跨房/返程18项、原生形态生命周期4项。负向安全断言本就通过时保留为回归，不冒称每个新增用例都曾失败。

- 坐标组：原代码2失败，修复后2通过。
- 恢复许可组：合法移动最初被拒绝，修复后11项通过。完成fixture路径校准后，又临时在本地恢复 HEAD 原版 service，确认合法移动及完整安全计数两项重新 RED；finally 恢复修复文件原始字节后两项 GREEN。
- 边界/返程组：原代码四向起步、疲劳后起步、四向归位和重试主路径共10项失败；修复后连同新增的斜跨和 allowedRooms 防护，共18项通过。
- 最终完整测试：`npm test`，547 tests / 547 pass / 0 fail / 0 skipped；同时包含 smoke checks 和 room governor checks。
- 构建：在命令进程内移除 DEST，`npm run build` exit0，日志明确“未指定目标，代码将被编译但不会上传”。没有运行 push 脚本。
- `git diff --check`、`git diff --cached --check` 通过；提示仅是仓库 Windows 换行转换提醒，不是测试或构建失败。

完整执行日志与来源验证在 `.superpowers/sdd/2026-10-22-economic-position-border-fix/`；`validation-manifest.json` 固定最终源码、测试和 dist 哈希。先前诊断与旧试点日志均保留，不覆盖原生产执行记录。

## 生命周期补证

原生行为测试模式是 opt-in，默认旧fixture不变；它提供不可枚举坐标及 toJSON、真实房名方向、原生 moveByPath 的位置匹配规则、出口格逐tick换房。路径模拟仅用于无障碍地形，不是完整碰撞、地形/疲劳生成或服务器引擎模拟。排查时纠正了直线fixture生成斜跨房首步的问题，没有因此放宽生产路径许可。

1. **本轮100连续安全ticks**：从旧情报恢复状态真实模拟 scout 出生、位移、跨房和留在内侧；第50个安全tick执行 Memory JSON往返并重建服务，继续至100。100之前 miner/hauler 调用为0；计数等于连续时间差，原请求期限不变。
2. **关停返程**：20个安全ticks后人工hold，真实生产策略/ActionParser 驱动 scout 进入母房内侧；原返程 startedAt/expiresAt 不变、retryCount0，关闭下一tick确认，费用50/unknown0，不产生采矿或运输。
3. **费用隔离**：第一轮已支付50后在母房停止，确认release后遵守冷却，再新开同epoch不同身份的本地会话；注入孵化未知调用并重置。新会话 confirmedCost0、unknown50，旧会话仍50/0；未知grant保留，账本旧confirmed50与新unknown50分开，旧会话raw不变。此用例隔离费用来源，不伪称覆盖“旧会话获得视野后，无视野新接纳”的独立问题。
4. **首批入库链路**：使用期初容器库存500的模拟，通过 scout 重新100安全ticks、三个角色各一次成功孵化、同trip取货和母房次tick正数入库。firstDelivery 的 key 对应已applied outbox，credited与amount一致，确认tick等于resolution.actionTick+1；确认即关停，下一tick核对关闭。期初库存不冒充新生产，newProductionConfirmed仍为null。

以上全部是本地回归。真实线上本轮仍是先前 scout 费用50、入库0、unknown0、vision_lost中止；没有新的线上验收。尾部 tailStatus 自动归约 Minor 仍保留 unverified，不能用本地几何归位替代全部尾部/长期经营验收。

## 独立发现：下一轮无视野接纳仍需处理

补充本地证据 `admission-followup-current-request.json`：旧会话已managed=false但visionAcquired=true；新请求id明确不同，当前remoteVisible=false；collector却沿用旧标记给出fatalReason=vision_lost，实际新接纳被拒绝，没有额外孵化。

这是已确认的跨会话视野状态隔离问题，独立于本次坐标与移动四点修复；本轮没有清除旧标记、删除锁或改写接纳协议。早期诊断输出曾从被替换的 settings 对象读取到旧request id，随后以当前Memory重新取值并断言，正确证据以 `admission-followup-current-request.json` 为准。

不建议直接重开真实试点。下一步应先针对这个新接纳问题形成有证据的修复设计与回归，再决定后续发布与复试；现有本地绿色结果不自动授权任何线上动作。

## 维护者检查

逐项核对了本次生产差异：仅五个现有文件的坐标提取、窄范围 scout 许可、原生跨界起点与内侧归位判断；不改 main/config/预算账本/费用与物流归约协议。测试辅助代码单独 opt-in，legacy默认保持。未保留以延长deadline、增加重试或全局放行掩盖问题的 workaround；未新增子代理或独立review流程。
