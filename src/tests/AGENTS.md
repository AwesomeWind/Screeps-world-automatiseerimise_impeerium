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

`native-economic-ops-successor.cjs`覆盖v1/v2 schema交接、完整父证明/平面档案、原期限所属、CAS、拒绝身份复用、重置/unknown不重放，以及真实两轮首批和新轮独立100安全ticks/单Spawn补员竞争。历史v1样本在fixtures中只证明旧记录兼容，不能作为新鲜生产预检。测试引擎退休只移除已结清Game实体，不删除Memory账/receipt/unknown以取得新额度；预算等待真实推进1051ticks，不清旧桶。

`economic-spawn-admission.cjs`覆盖单Spawn同级母房补员竞争、等待30ticks后真实接纳、TTL0候选转固定正式期限、双Spawn/能量/预算/receipt去重、接纳中断和unknown不重放。纯Model/adapter受控输入只证明局部契约；真实链使用native fixture自然达到99/100安全ticks，再以核心hauler TTL进入原Bureau补员。不能手填safeStreak或用适配器直接调用代替端到端接纳。首次接纳标记不因重试换Spawn而改写，EventBus捕获异常后继续run也不得调用未提交任务。

`native-economic-ops-{model,facts,runtime,evidence}.cjs`覆盖默认关闭、短请求和共用指纹、当tick实体/账本、已知旧准备版本交接、intent重置及不明不重放、准确tick接纳、安全截止及初始拒绝留存；runtime从一次submit驱动真实服务链，不通过scene.prepare或手改safeStreak制造本轮成功。测试profile只在构造器注入，线上Memory不选择任意profile；默认编译profile常量另做契约核对。断网路径是禁止网络的本地Game模拟，不能冒称线上经济验收。

`economic-trial-model.cjs`验证默认/身份/期限、纯来源归约及跨会话；`economic-trial-runtime.cjs`通过真实RemoteMining/Bureau/Spawn/Market/Strategy/ActionParser顺序验证唯一额度、真实次tick入库、同步关闭、故障移交及非托管母房隔离。`economic-trial-fixture.cjs`仅在下tick应用位移、孵化和store变化；restoreMemory须JSON往返、重绑creep.memory并重建服务。原生调用hook只采样或注入异常，assert在外层。outbox恢复不能重放应用不明回执；新来源产能未证明时不可用期初容器库存替代。

`vision_session_`/`vision_isolation_`覆盖会话所属视野、显式release锁、旧20/99/100到新0、安全计数49/99重置、外部视野/parent计数不能替代新scout，以及跳过scope推进和动作前丢视野时的P0关停。使用opt-in原生坐标与出口换房fixture，不能删除unknown grant或手改safeStreak制造接纳成功。
