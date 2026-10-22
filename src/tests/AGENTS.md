# tests 模块说明

`tests/smoke.cjs` 是当前主要回归测试入口，运行命令：

```bash
npm test
```

## 覆盖范围

smoke 测试覆盖：

- 文件存在和主生命周期顺序。
- `ActionParser` 行为和任务清理原因。
- body 生成、spawn bureau、resource market。
- builder/repairer/upgrader/hauler 等角色策略。
- city/road/maintenance/defense planning。
- 最近修复的 builder 工地优先级、critical road/container、TaskGuard 迁移。

## 修改规则

- 修 bug 或改行为时先补失败断言，再改实现。
- Screeps mock 应尽量只模拟当前行为需要的字段，不要写过宽 mock。
- 对新增 Memory/global 合约要加断言，防止后续重构破坏服务顺序。
- 测试文件较大，新增用例优先放在相邻功能块附近，不另起无关区域。
- `recon-trial-model.cjs` 覆盖纯会话协议；`recon-trial-runtime.cjs` 通过真实 RemoteMining/Bureau/Spawn/Strategy/ActionParser 验证动作前撤权、孵化中断、跨 tick 观测及终局。fixture 时钟通过构造器注入，不全局改写 Date.now；实际位移在下一 tick 应用。
- `settle_p1_` 至 `settle_p4_` 在上述两个套件覆盖跨会话费用/unknown、事件后结算、回执过期和迟到、JSON重载及结算故障关停。双会话测试不能删除未知执行grant取得新额度；引擎入口只采快照，验收assert在外层。`settlementSourceStatus` 是诊断，不代替真实ledger/grant检查或授权新侦察。
- `remote-danger-evidence.cjs` 覆盖独立危险ledger、字段/容量/CPU边界、写入结果不明及只读摘要；runtime测试在hook外断言已关停，再注入记录失败。`restoreMemory()`必须序列化Memory、重绑creep.memory并重建服务；不能用fixture旧raw闭包或global去重证明跨重置保留。

## 经济试点守卫回归

`economic-trial-model.cjs`验证默认/身份/期限、纯来源归约及跨会话；`economic-trial-runtime.cjs`通过真实RemoteMining/Bureau/Spawn/Market/Strategy/ActionParser顺序验证唯一额度、真实次tick入库、同步关闭、故障移交及非托管母房隔离。`economic-trial-fixture.cjs`仅在下tick应用位移、孵化和store变化；restoreMemory须JSON往返、重绑creep.memory并重建服务。原生调用hook只采样或注入异常，assert在外层。outbox恢复不能重放应用不明回执；新来源产能未证明时不可用期初容器库存替代。

`vision_session_`/`vision_isolation_`覆盖会话所属视野、显式release锁、旧20/99/100到新0、安全计数49/99重置、外部视野/parent计数不能替代新scout，以及跳过scope推进和动作前丢视野时的P0关停。使用opt-in原生坐标与出口换房fixture，不能删除unknown grant或手改safeStreak制造接纳成功。
