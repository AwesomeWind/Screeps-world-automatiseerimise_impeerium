# RoomGovernor 影子模式实施计划

日期：2026-08-11

对应规格：`docs/superpowers/specs/2026-08-11-room-governor-shadow-design.md`

## 实施目标

为己方可见房间增加零接管的 RoomGovernor 影子决策：标准化事实、生命周期、经济健康、预算、能力缺口、spawn 建议和与现有 SpawnBureau intent 的差异。

本计划严格保持：

- 不发布 `REQ_SPAWN`；
- 不调用 `spawnCreep`、`assignTask`、`createConstructionSite` 或市场 API；
- 不修改 creep memory、cityPlan、现有角色公式或 SpawnBureau intent；
- 默认且强制保持 shadow mode；
- 每个任务先写失败测试，再写最小实现；
- 每个任务独立提交，便于回滚与审查。

## 文件布局

新增：

```text
src/governance/RoomGovernorFacts.js
src/governance/RoomGovernorModel.js
src/governance/SpawnDecisionComparator.js
src/services/RoomGovernorService.js
src/tests/room-governor.cjs
```

修改：

```text
package.json
src/config/EmpirePolicy.js
src/core/ServiceScheduler.js
src/services/EmpireMetricsService.js
src/main.js
src/tests/smoke.cjs
src/AGENTS.md
```

## Task 1：Policy、Memory 合约与独立测试入口

**文件**

- Create: `src/tests/room-governor.cjs`
- Modify: `package.json`
- Modify: `src/config/EmpirePolicy.js`
- Modify: `src/tests/smoke.cjs`

**接口**

在 `DEFAULT_EMPIRE_POLICY` 增加：

```js
roomGovernor: {
    enabled: true,
    shadow: true,
    interval: 10,
    stableSamples: 3,
    maxSnapshotAge: 50,
    eventCooldown: 50,
    thresholds: {
        criticalScore: 30,
        strainedScore: 60,
        spawnEnergyCriticalRatio: 0.5,
        reserveCritical: 5000,
        reserveMature: 50000,
        reserveIndustrial: 100000,
        constructionHigh: 5,
        maintenanceHigh: 3,
        sourceWorkPerSource: 5,
        sourceEnergyPerTick: 10,
        carryCapacityPerPart: 50,
        replacementLeadTicks: 50
    }
}
```

`ensureEmpireControl()` 必须幂等创建 `control.rooms = {}`，且保留已有房间控制数据。

**TDD 步骤**

1. 创建最小 `room-governor.cjs`，初始化 `global.Memory` 与 `global.Game`，动态导入 `EmpirePolicy`。
2. 先断言 `DEFAULT_EMPIRE_POLICY.roomGovernor.shadow === true`、默认阈值存在、`ensureEmpireControl().rooms` 存在且二次调用不覆盖已有值。
3. 将 `package.json` 的测试改为：

   ```json
   "test": "node src/tests/smoke.cjs && node src/tests/room-governor.cjs"
   ```

4. 运行 `npm test`，确认因 Policy 缺失失败。
5. 最小化扩展 Policy 与 Memory 初始化。
6. 在 smoke 增加静态断言：`shadow: true`、`control.rooms` 初始化存在。
7. 运行 `npm test`，预期两个测试入口均通过。
8. 提交：

   ```text
   feat: add room governor policy contract
   ```

## Task 2：标准化事实采集

**文件**

- Create: `src/governance/RoomGovernorFacts.js`
- Modify: `src/tests/room-governor.cjs`
- Modify: `src/tests/smoke.cjs`

**接口**

```js
export function collectRoomGovernorFacts(options = {})
```

返回：

```js
{
    tick,
    rooms: {
        [roomName]: {
            roomName,
            owned,
            rcl,
            hasSpawn,
            spawnCount,
            hasStorage,
            hasTerminal,
            hasIndustrialInfrastructure,
            energyAvailable,
            energyCapacity,
            spawnEnergyRatio,
            storageEnergy,
            sourceCount,
            haulDistanceEstimate,
            constructionPressure,
            maintenancePressure,
            capabilities,
            retiringCapabilities,
            spawningCapabilities,
            security,
            previousMetrics
        }
    }
}
```

能力字段统一为：

```js
{
    harvestWork: 0,
    logisticsCarry: 0,
    buildWork: 0,
    repairWork: 0,
    upgradeWork: 0,
    defenseScore: 0
}
```

**采集约束**

- 一次遍历 `Game.creeps` 建立按 homeRoom 的能力索引；
- 一次遍历 `Memory.empire.spawningCreeps` 建立在孵化能力索引；
- 一次遍历 `Game.spawns` 建立房间 Spawn 索引；
- 最后只遍历己方可见房间；
- active body part 只计算 `hits > 0` 的部件；
- 即将退休的 creep 能力放入 `retiringCapabilities`，不重复计入稳定能力；
- source 与 structure 优先使用 `global.RoomCache`；
- haul distance 使用 Spawn/Storage 到 source 的 `getRangeTo` 估算，并在事实中标记为估算值；第一版不得调用 PathFinder；
- 安全事实复用 `global.WarIntel` 和 `global.Security` 的评分；
- 不读取任何 cityPlan canonical 或 legacy 字段。

**TDD 场景**

1. 两个房间、多个 creep、一个 retiring creep、一个 spawning record。
2. 断言每类能力只被统计一次。
3. 断言坏损 body part 不计入能力。
4. 断言 retiring 与 spawning 能力分别归档。
5. 断言非己方房间不进入结果。
6. 断言缺少 RoomCache、WarIntel 或 metrics 时返回已知字段与 `null`/零值，不抛错。
7. 在 smoke 的 `expectedFiles` 加入新模块，并静态禁止 `Memory.rooms`、`cityPlan`、`PathFinder.search`。
8. 先运行失败测试，再实现，最后运行 `npm test`。
9. 提交：

   ```text
   feat: collect room governor facts
   ```

## Task 3：生命周期、健康与滞回纯模型

**文件**

- Create: `src/governance/RoomGovernorModel.js`
- Modify: `src/tests/room-governor.cjs`
- Modify: `src/tests/smoke.cjs`

**导出接口**

```js
export function requiredCapabilities(facts, policy)
export function evaluateHealth(facts, requirements, policy)
export function candidateLifecycle(facts, requirements, health, policy)
export function resolveLifecycle(previousState, candidate, emergency, policy)
export function evaluateRoomGovernor(facts, previousState, policy)
```

**生命周期规则**

1. 无 Spawn：`claimed`，属于紧急降级。
2. `harvestWork` 或 `logisticsCarry` 低于最低需求：`bootstrap`，属于紧急降级。
3. 没有 Storage 且核心能力满足：`self_sufficient`。
4. 有 Storage，但成熟储备、健康或压力条件未满足：`developing`。
5. Storage 能量达到 `reserveMature`，核心维度不为 critical，维护压力不高：`mature`。
6. 有 Terminal、有工业设施、Storage 能量达到 `reserveIndustrial` 且总体健康：`industrial`。

生命周期升级必须连续达到 `stableSamples`；失去 Spawn、采集或物流能力立即降级。非紧急降级同样使用稳定样本，避免库存短时波动造成震荡。

**健康规则**

- `survival`：Spawn、核心采集/物流、Spawn 能量与威胁可守性；
- `harvest`：`current / required`；
- `logistics`：`current / required`；
- `infrastructure`：建设/维修需求与对应 WORK 覆盖；
- `reserves`：Storage 存在时按 `reserveCritical` 与生命周期目标评分；无 Storage 时为 `unknown`，且不单独拖低 bootstrap/self_sufficient；
- 每个维度输出 `{ score, status, reasons, evidence }`；
- `score <= criticalScore` 为 critical，`score <= strainedScore` 为 strained，其余 healthy；
- 总体状态采用短板优先：survival、harvest、logistics 任一 critical，则 overall critical。

**TDD 场景**

1. 无 Spawn → claimed + survival critical。
2. miner 能力为零 → bootstrap + harvest critical。
3. 采矿物流满足、无 Storage → self_sufficient。
4. Storage 经济未达成熟门槛 → developing。
5. 储备、维护、健康满足 → mature。
6. Terminal + 工业设施 + 工业储备 → industrial。
7. 连续三次候选升级后才转换。
8. 失去 Spawn、采集或物流时立即降级。
9. 缺失 Storage 事实不得伪造 reserves healthy。
10. 输入对象深冻结后仍可计算，证明纯函数不修改输入。
11. 先红后绿，运行 `npm test`。
12. 提交：

    ```text
    feat: model room lifecycle and health
    ```

## Task 4：预算、能力需求与影子 spawn 建议

**文件**

- Modify: `src/governance/RoomGovernorModel.js`
- Modify: `src/tests/room-governor.cjs`

**能力需求公式（第一版初始模型）**

- `harvestWork.required = sourceCount * sourceWorkPerSource`；
- `logisticsCarry.required = ceil(sourceEnergyPerTick * 2 * totalHaulRange / carryCapacityPerPart)`；
- haul distance 缺失时使用每 source 10 格保守估算，并添加 `estimated_distance` 原因；
- `buildWork.required = 0`（无工地）或 `min(6, max(1, ceil(constructionPressure / 3)))`；
- `repairWork.required = 0`（无维护目标）或 `min(4, max(1, ceil(maintenancePressure / 3)))`；
- `upgradeWork.required`：bootstrap 为 0，self_sufficient 为 1，developing 为 3，mature/industrial 在预算允许时为 5；
- `defenseScore.required` 直接采用 `WarIntel.hostileStrength`，current 采用既有 `totalDefenseStrength`。

所有能力都输出 `current`、`spawning`、`retiring`、`required`、`gap`、`confidence` 和 `reasons`。第一版公式必须明确标记为待线上校准，不能被命名为最优值。

**预算规则**

- 输出 survival、defense、spawn、maintenance、construction、upgrade、reserve、support；
- survival、即时 defense 与关键替换为 protected；
- harvest/logistics critical 时 construction、upgrade、support blocked；
- Storage 低于 reserveCritical 时 reserve protected，support blocked；
- `energyCap` 证据不足时保持 `null`；
- 每项包含 `posture`、`weight`、`energyCap`、`blocked`、`reasons`。

**影子 spawn 建议**

- gap 大于零时按 capability 生成建议；
- capability 到 role/profile 的第一版映射：miner、hauler、builder、repairer、upgrader、defender；
- 建议包含 `requiredCapacity`，不直接声明固定 creep 数量；
- 关键采集/物流缺口优先级高于建设与升级；
- 所有建议保存在 model 输出，不接触 EventBus。

**TDD 场景**

1. source 与距离变化会改变 logisticsCarry.required。
2. retiring 能力不掩盖替换缺口，spawning 能力会降低 gap。
3. 核心能力 critical 时建设、升级、支援预算被阻断。
4. 低 Storage 水位保护 reserve。
5. capability gap 生成正确 role/profile/priority/reasons。
6. gap 为零不生成建议。
7. 纯模型源码不包含 EventBus、Memory、Game 或执行 API。
8. 先红后绿，运行 `npm test`。
9. 提交：

   ```text
   feat: recommend room budgets and capabilities
   ```

## Task 5：Spawn 决策差异比较器

**文件**

- Create: `src/governance/SpawnDecisionComparator.js`
- Modify: `src/tests/room-governor.cjs`
- Modify: `src/tests/smoke.cjs`

**接口**

```js
export function compareSpawnDecisions(recommendations, intents)
```

返回：

```js
{
    matched: [],
    missing: [],
    excess: [],
    priorityMismatches: [],
    bodyProfileMismatches: [],
    comparedAt
}
```

**比较规则**

- 从 intent body 计算 WORK、CARRY 和既有 WarIntel 权重一致的 defenseScore；
- 按 capability 聚合 intent 能力，再与 `requiredCapacity` 比较；
- 数量相同但总能力不足时输出 `capacity_shortfall`；
- intent 覆盖建议能力时记录 matched；
- 没有对应建议的普通经济 intent 记录 excess，但安全/外部 demand 标记为 `external_or_safety`，不误报为 Governor 错误；
- priority 或 bodyProfile 不同单独报告，不改变 matched/missing 的能力结论；
- 输入为空或 body 缺失时输出可解释的 unknown/缺口，不抛错。

**TDD 场景**

1. 同数量小 body 能力不足。
2. 多个 intent 合并后能力满足。
3. priority 和 bodyProfile mismatch。
4. 安全 defender demand 不被当作普通 excess。
5. 输入不被修改。
6. smoke 加入 expected file 与纯函数静态约束。
7. 先红后绿，运行 `npm test`。
8. 提交：

   ```text
   feat: compare governor spawn recommendations
   ```

## Task 6：RoomGovernorService、持久化与事件

**文件**

- Create: `src/services/RoomGovernorService.js`
- Modify: `src/tests/room-governor.cjs`
- Modify: `src/tests/smoke.cjs`

**服务职责**

`analyze()`：

1. 初始化 `global.RoomGovernor = {}`；
2. 读取 `policy.roomGovernor`，disabled 时不计算；
3. 每 tick 收集一次标准化事实并执行紧急检查；
4. 满足 interval、无历史快照或存在紧急降级时运行完整模型；
5. CPU mode 为 critical 且无紧急状态时推迟完整模型；
6. 非评估 tick 从持久快照恢复 global 输出并计算 `staleFor`；
7. 超过 `maxSnapshotAge` 后清空 spawnRecommendations，只保留安全状态；
8. 单房计算用边界隔离，失败保留旧快照并记录事件。

`cleanup()`：

1. 读取已经由 SpawnBureau 在 analyze 生成的真实 intents；
2. 对本 tick 完整评估结果运行 comparator；
3. 更新 shadow.comparison；
4. 对 lifecycle 转换、critical health 和持续关键 missing 记录有界事件；
5. 使用固定键 `eventTicks.lifecycle/critical/spawnDifference` 实现冷却，避免无界事件状态。

**持久形状**

严格使用规格中的：

```text
Memory.empire.control.rooms[roomName].schemaVersion
Memory.empire.control.rooms[roomName].shadow
```

现有未知字段必须保留。迁移幂等，不能删除旧值。

**TDD 场景**

1. 第一次运行立即计算并持久化。
2. interval 内恢复缓存并增加 staleFor。
3. 紧急降级绕过 interval。
4. critical CPU 推迟非紧急完整评估。
5. 快照过期后不再给 spawn 建议。
6. 单房抛错不阻止其他房间，并保留旧快照。
7. cleanup 在 SpawnBureau intent 已存在时写入 comparison。
8. 重复 critical 事件在 cooldown 内只记录一次。
9. 源码静态禁止 `EventBus.publish`、`REQ_SPAWN`、`spawnCreep`、`assignTask`、`creep.memory =`、`cityPlan`。
10. 先红后绿，运行 `npm test`。
11. 提交：

    ```text
    feat: run room governor in shadow mode
    ```

## Task 7：主循环、Scheduler 与 Metrics 集成

**文件**

- Modify: `src/main.js`
- Modify: `src/core/ServiceScheduler.js`
- Modify: `src/services/EmpireMetricsService.js`
- Modify: `src/tests/room-governor.cjs`
- Modify: `src/tests/smoke.cjs`

**集成要求**

在 `createServices()` 中加入：

```text
RoomPhase
→ RoomGovernor
→ SpawnBureau
```

`EmpireMetrics` 仍位于服务列表末尾。由于 cleanup 顺序相同，RoomGovernor comparator 会先写入差异，EmpireMetrics 再记录摘要。

ServiceScheduler 将 `RoomGovernor` 列为 P1。critical 模式仍执行服务，由服务内部只保留紧急检查，避免 Scheduler 完全跳过安全降级。

EmpireMetrics 房间快照增加：

```js
governorLifecycle,
governorHealth,
governorStaleFor,
spawnDecisionDiff
```

只复制紧凑摘要，不复制完整 recommendations 或 evidence，防止指标路径重复膨胀。

**TDD 与静态测试**

1. 先断言 main 包含 RoomGovernorService 且顺序正确。
2. 断言 Scheduler 对 RoomGovernor 返回 P1。
3. 构造 Governor global 输出，断言 EmpireMetrics 复制紧凑摘要。
4. 断言 main 原有 service 生命周期顺序仍不变。
5. 断言默认 shadow 模式下 EventBus topic 数量和 SpawnBureau intents 与无 Governor 基线一致。
6. 运行 `npm test`。
7. 运行 `npm run build`，确认只编译不上传。
8. 提交：

   ```text
   feat: integrate room governor shadow service
   ```

## Task 8：文档、固定场景与最终安全验收

**文件**

- Modify: `src/AGENTS.md`
- Modify: `src/tests/room-governor.cjs`
- Modify: `src/tests/smoke.cjs`

**文档内容**

增加 RoomGovernor 章节，明确：

- Facts、Model、Comparator 与 Service 的职责；
- 当前只有己方可见房间；
- `global.RoomGovernor` 是当前 tick 影子建议；
- `Memory.empire.control.rooms.*.shadow` 是低频摘要；
- 第一版公式与阈值是初始模型，不是线上最优结论；
- 阶段 2 永远不能发布或执行 spawn 请求。

**固定验收场景**

1. bootstrap：无 miner，输出紧急采集缺口，真实 intent 不变。
2. Storage 缺能：reserve protected，upgrade/support blocked。
3. 运输不足：角色数量可相同但 comparator 报 capacity_shortfall。
4. 建设高压：buildWork gap 与 construction 预算原因一致。
5. 成熟房间：稳定样本满足后进入 mature，不产生核心能力缺口。

**最终命令**

```text
npm test
npm run build
git diff --check
rg -n "RoomGovernor|roomGovernor|spawnDecisionDiff|shadow" src
```

**人工范围审查**

- 默认且强制 shadow；
- 无新增上传、网络或外部写入；
- 无 `REQ_SPAWN` 发布；
- 无 creep、cityPlan、旧策略数据修改；
- SpawnBureau 公式和 intent 生成代码未修改；
- 新 Memory 只写 `control.rooms.*.shadow` 和既有有界事件队列；
- CPU critical 仍可执行紧急降级检查；
- 测试与构建在最终提交状态重新执行。

提交：

```text
docs: document room governor shadow contracts
```

## Completion Gate

本子项目只有在以下条件全部满足时完成：

- Tasks 1-8 均有当次红—绿证据；
- 合并前的完整 `npm test` 与 `npm run build` 成功；
- `git diff --check` 无 whitespace error；
- RoomGovernor 不改变任何真实 spawn 或经济行为；
- 工作在独立 worktree 与 `codex/` 功能分支中完成；
- 未运行 `npm run push`、`npm run local` 或任何部署命令；
- 实现完成后由用户选择本地合并、创建 PR 或保留分支。
