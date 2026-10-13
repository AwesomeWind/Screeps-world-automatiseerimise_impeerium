# 孵化能力数据合约修复计划

日期：2026-10-13。范围来自本轮已授权的正确性核验与明确合约修复；不包含新策略接管。

## 目标与证据

`SpawnService.run()` 成功后调用 `createSpawnMemoryRecord(memory, body)`，但记录只有 `memory/expireAt`。Governor 的备份消费者需要 body；与此同时，`indexCreepCapabilities()` 未区分 `creep.spawning`，会把孵化中的能力记为 current。cleanup 取得有效 creep memory 后可删除备份，所以不能依赖备份覆盖整个孵化期。

`SpawnBureau.countRole()` 对无 live 对象的 `Memory.creeps` 和备份分别累加；`countQuota()` 还会重复累加 live 对象的备份，甚至让 retiring creep 的备份重新覆盖配额。应以 creep 名称为身份，只计一次。

## 方案选择

1. 只保存 body：修复备份缺值，但无法修复 live spawning 分类或重复统计，不采用。
2. 保留现有字段，保存 body 副本；Governor 先处理 live，再处理不存在 live 对象的备份；Bureau 排除已由 live 或 Memory.creeps 计数的备份。推荐，沿用现有生产者、消费者和生命周期。
3. 新建全局 creep registry 并迁移全部 role/statistics：范围过大，需独立设计，不在本轮实施。

## 数据边界

- `capabilities`：已完成孵化、尚未进入替换窗口的有效 body parts。
- `retiringCapabilities`：TTL <= body.length * CREEP_SPAWN_TIME + replacementLeadTicks 的已出生单位。
- `spawningCapabilities`：live 对象的 `spawning === true`，加上无 live 对象且未过期的成功孵化备份；同名不重复。
- EventBus 未处理请求、pendingTasks 和本 tick 计划意图不是成功孵化证据，不进入 Governor facts；成功结果在 run 后写入备份，下次 analyze 可见。
- 老记录继续支持 `record.memory || record`、`record.body || memory.body`；没有 body 且没有 live 对象时不凭 role 猜 body。到期与 cleanup 规则不变。
- body 位于备份顶层，不写入 creep.memory；保持恢复 memory 合约。
- 只修复备份重叠，不把所有 Memory.creeps 项改造成新的有效性协议；失效 memory 与 miner WORK 估算另列后续审计。

## 实施与验收

- [x] 在 `src/tests/room-governor.cjs` 相邻 facts 测试区，调用真实 `SpawnService.init -> EventBus.dispatch -> run -> cleanup`，仅 mock Screeps 外部 spawn API。
- [x] 观察失败：成功孵化的 2 CARRY 从真实备份被统计为 0。
- [x] 在 `src/services/SpawnService.js` 保存 body 数组副本，验证 expireAt 和既有 memory 恢复回归不变。
- [x] 观察失败：live spawning 在 current 被统计为 2；修复 `src/governance/RoomGovernorFacts.js` 分类及按名称去重。
- [x] 覆盖备份清理后仍在孵化、孵化完成、retiring、过期备份、旧记录及失败 spawn。
- [x] 观察失败：Bureau 对同一个成功记录 role 计数为 2，retiring live 的备份仍覆盖 quota；修复 `src/services/SpawnBureauService.js` 备份去重。
- [x] 执行 `npm test`、`npm run build`（DEST 必须未设置）、`git diff --check`、`git diff --cached --check`。
- [x] 维护者检查：无新增依赖、无角色接管扩展、默认 shadow / scheduler enforce=false 不变。

结果：2026-10-13 本地 smoke/room-governor 两个入口及构建通过。生产改动仅三个文件，新增回归覆盖真实 hauler/upgrader 成功流；路线图将剩余统计与时序审计单独列为 C1/C2。没有线上验收，也没有提交、推送或上传。

## 回退与限制

回退仅还原本轮三个生产文件和对应测试改动；顶层 body 是向后兼容的额外字段，无需改在线 Memory。没有在线样本，不能将本地通过视为真实运行验收。新分类会让孵化期间的 current 健康指标更保守，这正是区分可用能力与 upcoming 的含义。
