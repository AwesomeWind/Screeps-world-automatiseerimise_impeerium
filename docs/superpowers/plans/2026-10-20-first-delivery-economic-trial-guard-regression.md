# 首批交付经济守卫：回归要点草案

配套[设计草案](../specs/2026-10-20-first-delivery-economic-trial-guard-design.md)。仅设计，未写正式测试或实现。

| 场景 | 必须结果 |
| --- | --- |
| 默认关闭/非法policy/request/schema | 无新状态/动作，拒绝且不覆盖旧证据 |
| 旧侦察锁、旧actor/accepted/spawning/未结grant | 拒绝启动；合规release只解除锁，不打开经济 |
| identity/epoch/version/配置、双绝对期限 | 提前/错过/重放/断档/reset不续期、不冒用旧会话 |
| 三role各一slot、双Spawn/重复事件 | 一轮每role最多一个成功，无未知补孵化 |
| 原生调用前/后/ledger后中断 | 额度先占；unknown保留，明确未调用才取消，原request不续命 |
| per-role费用与本轮body绑定 | 旧费/旧name不串入，scout50不套用经济body实际成本 |
| scout真实视野与本trial100安全ticks | 旧safeTicks/坐标路线不能放行miner，视野交接不中断 |
| source/容器/receiver/body路径 | 仅一指定容器，禁止road/reserver/第二矿 |
| 两次调用、原leg、单重规划、1650/6000与滚动限额 | 单项或总限额耗尽即停，不靠滚动窗口为本轮增额 |
| 次tickhome_delivery与具体resolution | OK/pickup/源库存/历史累计/其他actor不算交付 |
| 同trip货源与期初库存 | 必须有指定远端容器的本轮confirmed pickup，入库不超已知取货；旧库存不冒充新产能 |
| 首批部分入库、重复resolution | 原账先应用、幂等一次停止，同tick不得派下一趟 |
| 并发不可归因/带货死亡/target失效 | 保留unknown并停止，不刷第二次收入掩盖 |
| 已接受动作/旧货返程卸载 | 允许有限尾部，不新采集/取货/建设，冻结Outcome不改 |
| 各阶段旧MOVE/HARVEST/BUILD/REPAIR/TRANSFER及工地 | 动作前撤权；intake后撤权不调用引擎 |
| 记录hook异常或持久诊断损坏 | 仍撤权关停、next-tick确认；不提前stateValid返回而跳过 |
| Memory JSON往返/服务与global重建 | slot/费用/首批身份与原期限保留，不用global缓存假验收 |
| 母房/危险/路径/CPU跳过/配置变化 | 原安全门槛不放宽，不安全return则safe_wait |
| 外部失联、关闭待确认 | 自停不依赖外部轮询；无回读不冒充关闭成功 |
| 有界历史、其他预算/旧终局/GoalPlan | 不串scope，不改旧证据，GoalPlan及market关闭 |

正式测试须走RemoteMining/Bureau/Spawn/ResourceMarket/ActionParser/main真实顺序，次tick显式更新store；故障assert在hook外，不手工加累计收益代替真正交付。全量测试、smoke/governor、dry build与diff检查分别记录，本地通过不代替线上和净收益验收。
