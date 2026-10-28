# tests 模块说明

`home-evidence-admission-{model,facts,runtime}.cjs` 覆盖v2首次回执、首因冻结、gate/selection细项、CPU与CAS阶段、诊断封存、原期限和unknown不重放。reserved/global重建只可报告interrupted，不能重做admit；未持久证据丢失必须missing。重建测试须JSON往返并清运行时global，不以旧实例lastError代替Memory证明。原生引擎硬中断/global reset仍未验收。

`home-evidence-window-{model,facts,runtime,report}.cjs` 覆盖独立自然观察窗：100观察tick/10分钟原截止、默认关闭、一次固定admission、4/16/200/128/32及UTF-16容量、pending/未知/JSON重载、原生不可枚举位置、T-1日志与双端库存、反向withdraw与相关并发。自然fixture只预置已有本房单位，使用真实Market/Miner/Hauler/Builder及ActionParser；队列在下一tick应用后生成simulated日志，不调用任何remote/native/economic submit/start。比较关闭/开启/写入故障的业务投影和动作完全一致。

HTTP自然profile回归在本地运维工具目录；两个固定profile共用有界传输但不共用经济schema/报告。旧已消耗HTTP目录及授权日志不可作为测试输出或重跑入口。所有本地验证禁止网络和凭据；完整测试、dry build、真实API与经济验收分别报告。

独立review反例另覆盖低CPU/hostile后的seal失败不恢复capture、延后seal保留原停止tick、未知seal不重放、采集CPU从读回/验证前计时；自然HTTP默认不借旧经济版本，真实读取须expectedVersion，离线无期望标unverified_version，CLI可显式--expected-version。原生事件存在但并发/再生/缺端点时保留unproved原因，不能与无事件混淆。

`fixtures/home-retained-closed.json`是已保存的历史关闭记录，不是新鲜线上预检。新回归使用真正的父envelope.enabled=true形态核对过期/terminal/原身份/窗口/closure/tail和关闭scope；不能仅设request.enabled=true来代替旧协议。新鲜期限或foreign身份、开放scope不得被旧记录兼容例外放行。

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

`trial-evidence-window-{model,facts,runtime,report}.cjs`覆盖默认关闭、完整身份绑定、30秒/10tick接纳、容量/CPU、事件T→T-1、写前写后故障/unknown不重放、分页与跨JSON重载。fixture只在下一tick已应用动作后生成simulated日志，不能把意图OK或本地shape当作生产语义核实；真实native→guard→策略→ActionParser→cleanup对照观察开启/关闭/故障的业务结果。尾部最后合法tick接受卸载、次tick确认、+2只观察；不手填安全计数、不清claim、不延长期限。

`native-economic-ops-successor.cjs`覆盖v1/v2 schema交接、完整父证明/平面档案、原期限所属、CAS、拒绝身份复用、重置/unknown不重放，以及真实两轮首批和新轮独立100安全ticks/单Spawn补员竞争。历史v1样本在fixtures中只证明旧记录兼容，不能作为新鲜生产预检。测试引擎退休只移除已结清Game实体，不删除Memory账/receipt/unknown以取得新额度；预算等待真实推进1051ticks，不清旧桶。

`economic-spawn-admission.cjs`覆盖单Spawn同级母房补员竞争、等待30ticks后真实接纳、TTL0候选转固定正式期限、双Spawn/能量/预算/receipt去重、接纳中断和unknown不重放。纯Model/adapter受控输入只证明局部契约；真实链使用native fixture自然达到99/100安全ticks，再以核心hauler TTL进入原Bureau补员。不能手填safeStreak或用适配器直接调用代替端到端接纳。首次接纳标记不因重试换Spawn而改写，EventBus捕获异常后继续run也不得调用未提交任务。

`native-economic-ops-{model,facts,runtime,evidence}.cjs`覆盖默认关闭、短请求和共用指纹、当tick实体/账本、已知旧准备版本交接、intent重置及不明不重放、准确tick接纳、安全截止及初始拒绝留存；runtime从一次submit驱动真实服务链，不通过scene.prepare或手改safeStreak制造本轮成功。测试profile只在构造器注入，线上Memory不选择任意profile；默认编译profile常量另做契约核对。断网路径是禁止网络的本地Game模拟，不能冒称线上经济验收。

`economic-trial-model.cjs`验证默认/身份/期限、纯来源归约及跨会话；`economic-trial-runtime.cjs`通过真实RemoteMining/Bureau/Spawn/Market/Strategy/ActionParser顺序验证唯一额度、真实次tick入库、同步关闭、故障移交及非托管母房隔离。`economic-trial-fixture.cjs`仅在下tick应用位移、孵化和store变化；restoreMemory须JSON往返、重绑creep.memory并重建服务。原生调用hook只采样或注入异常，assert在外层。outbox恢复不能重放应用不明回执；新来源产能未证明时不可用期初容器库存替代。

`vision_session_`/`vision_isolation_`覆盖会话所属视野、显式release锁、旧20/99/100到新0、安全计数49/99重置、外部视野/parent计数不能替代新scout，以及跳过scope推进和动作前丢视野时的P0关停。使用opt-in原生坐标与出口换房fixture，不能删除unknown grant或手改safeStreak制造接纳成功。
