# Screeps 帝国指挥中枢设计蓝图

日期：2026-08-11

> 2026-10-13 实现状态校正：本文是目标蓝图，不是已交付能力清单。RuntimeTelemetry、影子 ServiceScheduler、EmpireMetrics、己方房间 Governor 和受控 upgradeWork 仲裁已有代码；Goal/Plan、EmpireDirector、完整跨房闭环仍未实现。当前实施顺序与验收见 [优化与能力补全路线图](2026-10-13-optimization-capability-roadmap.md)。自动化 policy 字段存在不代表对应执行服务已消费这些开关。

## 1. 目标

本设计将现有 Screeps AI 从“单房执行与角色调度系统”演进为贯穿游戏生命周期的帝国指挥中枢，使其能够默认自动完成：

- 初期生存、采矿、运输和基础建设；
- 中期房间发展、Storage 经济、道路、防御和远程采矿；
- 后期多房协作、自动扩张、工业、市场和战争；
- 危机时的降级、恢复、撤离或放弃；
- CPU、Memory 和执行故障约束下的持续运行。

系统采用“默认全自动、允许人工覆盖”的自治模式。人工通过统一 Policy/Override 接口调整战略，不直接侵入各执行服务。

## 2. 当前基线与问题判断

现有系统已经具备较强的 L1-L2 能力和部分 L3 能力：动作执行、角色任务、集中孵化、房间内资源撮合、房间阶段、城市规划、道路、防御、维修、Link、基础战争、Lab、Market 和远程采矿入口。

当前主要缺口不是单独的角色或建筑逻辑，而是帝国级控制平面：

- 没有统一的帝国目标和战略优先级；
- 没有可跟踪、可暂停、可失败、可取消的长期计划；
- 房间阶段尚未形成完整的生命周期与恢复状态机；
- 缺少量化经济、预算、跨房产能和收益核算；
- 远程采矿、扩张、工业和战争尚未形成端到端闭环；
- 缺少服务级 CPU 观测、分级调度和系统故障隔离。

当前 cityPlan canonical/legacy 数据边界正在迁移，后续控制层不得重新引入旧字段的分散兼容读取。

## 3. 设计原则

1. 保留现有执行层，不整体重写。
2. 上层决定为什么做、投入多少、何时停止；下层决定由谁对哪个目标执行什么动作。
3. 长期状态写入 `Memory`，当前 tick 派生状态写入 `global`。
4. 所有长期目标必须有完成、失败、超时、暂停和预算释放规则。
5. 所有自动决策必须能够记录简短原因。
6. 所有新控制能力先影子运行，再单房接管，最后扩大范围。
7. 生存和安全底线优先于人工覆盖；人工覆盖优先于自动战略；自动战略优先于局部优化。
8. CPU、spawn 时间、能源、库存和情报都作为有限资源管理。

## 4. 总体架构

```text
人工战略覆盖层
        ↓
帝国战略层 EmpireDirector
        ↓
目标与计划层 GoalManager / PlanManager
        ↓
房间控制层 RoomGovernor
        ↓
现有执行层
SpawnBureau / ResourceMarket / Planning / Strategies / ActionParser
```

### 4.1 人工战略覆盖层

统一保存在 `Memory.empire.control.policy`，用于控制自动扩张、市场、战争、房间职责、资源储备以及目标房间的允许或禁止。

覆盖项支持作用范围、原因和可选失效时间：

```js
{
    value: true,
    reason: '玩家准备手动调整布局',
    expiresAt: 12345678
}
```

人工覆盖不得关闭防止不可逆损失的安全底线。

### 4.2 EmpireDirector

EmpireDirector 低频评估整个帝国，输出战略姿态、优先级和预算，不直接控制 creep 或调用游戏动作。

首批战略姿态：

- `survival`
- `growth`
- `expansion`
- `industrial`
- `defense`
- `war`
- `recovery`

### 4.3 GoalManager 与 PlanManager

Goal 表达期望结果，Plan 表达实现方案。执行方案失败不等于战略目标失效，系统可以为同一 Goal 更换母房、路线或单位组合。

Goal 必须包含优先级、状态、成功条件、失败策略、时间和目标范围。Plan 必须包含当前阶段、分配房间、预算、进度证据、重试次数和最近进展时间。

### 4.4 RoomGovernor

每个己方房间由一个逻辑 RoomGovernor 管理。它综合帝国战略、房间生命周期、经济健康、安全姿态、外部支援和人工覆盖，输出：

- 房间预算；
- 能力型角色需求；
- 建设与维修政策；
- 物流与库存政策；
- 对外支援能力；
- 房间状态变化原因。

### 4.5 现有执行层

- `ActionParser` 继续只执行既定任务；
- role strategy 继续负责短期任务选择；
- `ResourceMarket` 继续负责房间内供需撮合；
- `SpawnBureau` 继续负责具体孵化仲裁；
- planner 继续负责具体建筑、道路、防御和维护计划。

## 5. 决策循环

### 5.1 战术循环：每 tick

处理 creep 动作、空闲任务、spawn、资源请求、tower、即时威胁和非法任务。

### 5.2 房间循环：每 10-50 tick

评估生命周期、经济健康、吞吐、预算、能力需求和支援余力。紧急事件可以立即触发重新评估。

### 5.3 帝国循环：每 100-500 tick

评估 GCL、房间健康、扩张候选、远程矿收益、全局库存、战争风险、目标进度与 CPU 状态。具体周期由调度器和 bucket 姿态动态调整。

## 6. 核心 Memory 合约

```js
Memory.empire.control = {
    schemaVersion: 1,
    policy: {
        autoExpansion: true,
        autoMarket: true,
        autoWar: true,
        overrides: {}
    },
    strategy: {
        posture: 'growth',
        priorities: {},
        budgets: {},
        evaluatedAt: 0,
        reasons: []
    },
    goals: {},
    plans: {},
    rooms: {},
    world: {
        rooms: {},
        routes: {},
        players: {}
    }
};
```

第一阶段不迁移现有 `Memory.rooms.*` 规划数据。控制平面只保存战略状态和对执行层的政策输出。

决策历史使用固定长度环形队列；高频明细保存在 `global`，避免 Memory 无限增长。

## 7. 房间生命周期

主生命周期：

```text
unseen
→ surveyed
→ reserved
→ claimed
→ bootstrap
→ self_sufficient
→ developing
→ mature
→ industrial
```

- `unseen/surveyed`：取得情报并评估远程或殖民价值；
- `reserved`：作为远程资源区经营并持续核算收益；
- `claimed`：已取得控制权但尚未形成经济，优先建立 Spawn；
- `bootstrap`：建立最低采矿、运输、补能和关键角色替换能力；
- `self_sufficient`：可独立生存，继续完善 container、道路、extension 和 tower；
- `developing`：推进 Storage、正式物流、升级和基础防御；
- `mature`：经济稳定且具备对外支援能力；
- `industrial`：具备 Terminal、Lab、Factory 等后期经营能力。

安全姿态独立于生命周期：

```text
peace → alert → defense → siege → evacuation → lost
```

房间允许降级：失去关键生产能力回到 `bootstrap`，失去 Spawn 回到 `claimed`，失去 Storage 回到 `developing`。每次降级必须记录原因、恢复条件和外援需求。

状态转换使用滞回阈值、最短保持时间和连续稳定周期，避免震荡。紧急状态允许立即升级，退出紧急状态必须满足稳定窗口。

## 8. 经济、预算与产能

RoomGovernor 维护滑动经济指标：source 理论产能、实际采集与运回量、净能量、采矿 uptime、物流覆盖、spawn 利用率、worker 空闲率、Storage 趋势和停滞时间。

能源按逻辑预算账户分配：

```text
survival
spawn
defense
maintenance
construction
upgrade
remoteMining
expansion
industry
export
```

基础优先级为：生存、即时防御、生产恢复、必要维护、建设、扩张、升级、工业与投机。不同战略姿态可以调整，但不能突破安全底线。

角色需求使用能力缺口表达，例如采集 WORK 数量、物流 CARRY 吞吐、建设 WORK 数量和防御评分。SpawnBureau 根据现存、在孵化、剩余寿命、到岗距离和房间能量转换为具体 body。

Storage 采用动态水位：紧急下限、生存储备、正常目标、扩张门槛和过剩阈值。水位由 RCL、source、房间职责、威胁和远程矿规模决定。

远程采矿、扩张和工业目标必须估算成本、收益与机会成本，并能解释为什么继续投入以及何时暂停或放弃。

## 9. 世界模型、远程采矿与扩张

世界模型保存低频长期情报：房间连接、情报时间、source、mineral、可用空间、地形、controller、敌对活动、邻近风险、路线、远程矿评分和殖民评分。

情报具有可信度和失效时间。扩张前必须重新侦察，长期未观察的敌情只能作为低可信度证据。

Scout 与 Observer 共享侦察队列，优先处理未探索出口、过期情报、活跃目标、扩张候选、敌人边界和临时机会。

远程采矿 Plan：

```text
survey
→ reserve
→ establish_container
→ establish_mining
→ establish_logistics
→ operate
```

异常状态包括 `threatened`、`unprofitable`、`vision_lost`、`recovering`、`suspended` 和 `closed`。系统持续测量实际运回量、角色成本、reservation、维修、运输和战损。

自动殖民 Plan：

```text
refresh_intel
→ select_sponsor
→ secure_route
→ claim_controller
→ place_spawn_site
→ bootstrap_construction
→ establish_harvesting
→ establish_logistics
→ achieve_self_sufficiency
→ release_sponsor
```

母房支援必须有能源、spawn 时间、角色范围和有效期上限。预算耗尽且关键里程碑未完成时，系统重新评估、换方案、暂停或放弃，不能无限重试。

## 10. 多房物流与工业

建立帝国库存索引，区分总量、已预留、运输中和真正可用库存，防止多个目标重复占用同一资源。

房间可具有 `general`、`support`、`industry`、`trade`、`military`、`frontier` 或 `recovery` 职责。职责是策略倾向，人工可以锁定。

Terminal 发送由统一调度器管理，优先级为紧急防御与殖民恢复、boost 和关键工业、最低库存补齐、常规平衡、市场出售。

Lab 自动流程：目标产物、依赖反推、库存检查、原料调拨、清空、装载、反应、产物转移。Boost 请求必须先完成库存、Lab 和物流准备，再孵化昂贵单位。

Market 按净收益决策，扣除交易能量折价、库存机会成本和生产成本，不出售已预留资源。

Factory、Power Spawn、Observer、Nuker 和 Power Creep 均受房间职责、库存水位、战略目标和 CPU 姿态约束。生存储备不足、受到攻击或 bucket 低时暂停低优先级工业，并保留可恢复的计划进度。

## 11. 安全、战争与危机

战争系统分为安全底线、房间防御和帝国军事目标。

安全底线保护 Spawn、Storage、Terminal、Controller 和关键生产能力，可暂停普通消费、请求支援、撤离资源，并在严格条件满足时自动 safe mode。

威胁评分考虑敌方有效 body、核心资产距离、tower、defender、rampart 和增援时间。经济单位、军事单位和 tower 读取同一份危险区域。

跨房增援必须评估支援房安全、到达时间、路线、目标价值、body 匹配、boost 和 spawn 机会成本。

主动军事 Goal 首批包括：

- `DEFEND_ROOM`
- `CLEAR_REMOTE_ROOM`
- `DESTROY_INVADER_CORE`
- `SECURE_ROUTE`
- `ASSAULT_ROOM`

进攻流程必须经过情报、能力评估、资源与 boost 准备、孵化、集结、执行和结果评估。后期以简单 duo/squad 为起点，不一次实现复杂阵型。

不可守房间进入撤离：停止低价值消费、转移高价值资源、撤离可复用单位、保留最低控制能力，并由 EmpireDirector 决定抵抗、放弃或建立重夺目标。

玩家关系统一保存为盟友、中立、规避或敌对；一次误入不形成永久敌对，长期威胁也不会因短期不可见而被遗忘。

## 12. CPU 调度、故障隔离与恢复

系统分为：

- P0：每 tick 必须运行的动作、spawn、采矿物流、tower 和任务校验；
- P1：高频经济、安全、能力缺口和活跃计划；
- P2：低频规划、情报、工业和扩张评估；
- P3：可暂停调试、可视化、投机和非关键统计。

CPU 姿态包括 `normal`、`constrained`、`critical` 和 `recovery`。阈值必须依据真实运行数据校准，不在设计阶段写死。

主循环采集 service 生命周期阶段耗时、PathFinder 次数、每房 CPU、Memory 大小和被跳过服务。业务侧记录采集率、运回率、spawn 利用率、角色断档、worker 等能、殖民停滞和远程矿收益。

每个 Plan 定义进展证据。超时依次触发局部重试、重新规划、暂停重评和终止释放预算。

各 service 生命周期建立异常隔离：记录错误后继续其他服务，连续失败自动禁用非关键服务；P0 连续失败触发安全降级。异常不得被静默吞掉。

所有控制层数据带 `schemaVersion`。迁移必须幂等、先验证后切换、失败不删除旧数据，并确保下层基础经济仍能运行。

## 13. 验证策略

保留现有 smoke 测试作为迁移安全网，并逐步增加：

- 评分、预算和状态转换的纯函数单元测试；
- 经济恢复、远程矿暂停恢复、殖民等多 tick 场景测试；
- Goal、Plan 和 RoomGovernor 的合约测试；
- 精简真实游戏状态回放；
- 固定规模 CPU 基准；
- 旧 Memory 到新 schema 的迁移测试；
- 单位死亡、目标消失、失去视野和 service 异常的故障注入测试。

成功标准不仅是测试通过，还包括经济吞吐、恢复时间、计划完成率和 CPU 指标没有退化。

## 14. 实施阶段

### 阶段 0：稳定当前基线

完成 cityPlan 数据迁移边界，记录测试、CPU、Memory 和典型房间经济基线。

### 阶段 1：观测、CPU 调度与 Policy

实现 service CPU、业务指标、分级调度、CPU 降级姿态、事件记录和统一人工覆盖，不改变现有经济决策。

### 阶段 2：RoomGovernor 影子模式

生成生命周期、健康度、预算和能力需求建议，同时保留现有决策并记录差异。

### 阶段 3：单房经济接管

按 upgrader、builder/repairer、Storage、hauler、miner 和 SpawnBureau 的顺序逐项接管，每项具有独立 feature flag。

### 阶段 4：Goal、Plan 与 EmpireDirector

首批支持 `STABILIZE_ROOM`、`RECOVER_ECONOMY`、`ESTABLISH_REMOTE_MINE` 和 `SUSPEND_REMOTE_MINE`。

### 阶段 5：远程采矿闭环

完成收益核算、危险暂停、恢复、关闭、母房预算和远程物流。

### 阶段 6：自动殖民

完成侦察、候选评分、母房选择、Claim、bootstrap、自给和支援释放。

### 阶段 7：多房物流与工业

依次完成库存预留、Terminal、mineral、Lab、boost、Market、Factory、Power 和 Observer。

### 阶段 8：安全与战争升级

依次完成统一危险区、safe mode、跨房增援、rampart 战斗、boost 军事单位、squad、主动军事目标和撤离重夺。

## 15. 迁移与回滚

每项能力依次经历：

```text
仅观察
→ 给出建议
→ 单房启用
→ 与旧逻辑并行校验
→ 扩大范围
→ 旧逻辑退出
```

每项必须提供房间级 feature flag、帝国级紧急停用、schemaVersion、安全迁移、指标对比和明确回滚路径。

旧逻辑只有在新逻辑完成真实运行验证后才能删除。回滚时不得丢失现有 creep 任务、cityPlan 或基础经济状态。

## 16. 第一个正式子项目

第一个正式子项目为“帝国可观测性、CPU 调度和统一人工 Policy 基础层”。

它只建立后续控制平面依赖的事实、调度和人工干预入口，不直接改变角色配比、房间预算、扩张或战争行为。其详细实现范围与任务拆分应在独立实施计划中定义。
