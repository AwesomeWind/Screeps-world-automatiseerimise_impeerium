# Stationary Mining And Body Planner Design

## 背景

当前脚本在约 1000 tick 运行后暴露出两个问题：

- 多个 `miner` 会集中去同一个 source。现有 `pickSource` 使用 creep 名称长度取模，不能反映 source 距离、采矿位或已有分配。
- `hauler` 经常没有任务。早期没有 storage 时，Hauler 只会找较大的掉落能量或从 storage 取能，无法围绕 source 建立稳定物流。

同时，现有孵化请求使用固定 body。不同角色不会根据房间阶段、可用资源、source 采矿位、物流压力或防御状态动态调整身体部件。

## 目标

本次改造目标是建立“定点采矿 + 搬运物流 + 能力驱动孵化”的基础：

- `miner` 只负责到 source 旁边占位并持续采矿，不再向 spawn/extension/tower 搬运。
- `hauler` 负责从 source 周边掉落能量、container、storage 等位置取能，并向经济/防御建筑送能。
- 孵化规划不再只按固定数量补角色，而是按能力缺口判断是否需要新 creep。
- Body 决策从各策略服务中抽出，统一根据角色、游戏阶段、房间资源和外部状态生成 body 与能力描述。
- `SpawnService` 保持轻量，只执行已经规划好的 spawn request。

## 非目标

- 不一次性重构所有任务系统。
- 不引入完整 colony/overlord 架构。
- 不要求本次完成自动 container 建造位规划。
- 不改变已有 EventBus 生命周期，除非实现中发现必须补充最小接口。

## 核心设计

### Source 采矿模型

新增 source 采矿评估能力，优先以 helper 或轻量 service 的形式实现：

- 计算 source 周围 8 格中的可站位，排除墙、边界外位置和不可通行建筑。
- 为每个 source 统计已绑定的 `miner`。
- 每个 source 的默认采矿需求为 `workPartsNeeded = 5`，用于匹配 Screeps source 的常规再生速度。
- 每个 source 的 `maxCreeps` 等于可站位数量，但稳定期优先用更强 body 减少占位数量。

`miner` memory 需要持久化：

```js
{
  role: 'miner',
  homeRoom: 'W1N1',
  sourceId: 'source1',
  miningPos: { x: 10, y: 20, roomName: 'W1N1' }
}
```

`sourceId` 和 `miningPos` 一旦分配，除非目标消失或位置不可用，不在每 tick 重新选择。

### Miner 行为

`MinerStrategyService` 负责表达每个 source 的采矿能力需求，而不是简单按 source 数量孵化。

运行逻辑：

- 没到绑定 `miningPos` 时，分配 `MOVE_TO`。
- 到达后，持续 `HARVEST` 绑定 source。
- store 满、source 暂时空或 harvest 成功后，任务可以被清理并在下一 tick 继续分配 harvest；miner 不再创建 `TRANSFER` 任务。

Body 策略：

- bootstrap 阶段允许降级 body，避免经济卡死。
- 稳定阶段优先生成高 WORK、低 MOVE、无 CARRY 的定点矿工。

示例 body：

- 低资源：`[WORK, MOVE]` 或 `[WORK, WORK, MOVE]`
- 稳定：`[WORK, WORK, WORK, WORK, WORK, MOVE]`

### Hauler 行为

`HaulerStrategyService` 负责表达运输能力需求，并为 idle hauler 分配取送任务。

空载时取能优先级：

1. source 周边较大的 dropped energy。
2. source 周边 container。
3. storage。
4. tombstone/ruin 中的 energy，作为后续扩展项，可在不影响主逻辑时加入。

载能时送能优先级：

1. defcon 较低时优先 tower、spawn、extension。
2. 平时优先 spawn、extension，再 tower。
3. 有 storage 且经济建筑已满时送 storage。

运输需求用 `carryPartsNeeded` 或等价的运输能力表达。初版可以按 source 数量和房间能量阶段估算，后续再引入路线距离和掉落能量压力。

### BodyBuilder

新增独立模块，例如 `src/core/BodyBuilder.js`。

职责：

- 根据 `role`、`room`、`context` 生成候选 body。
- 返回 body 的能力描述，而不是只返回数组。
- 保证 body 成本不超过指定能量预算。
- 对资源不足场景提供可孵化的降级 body。

接口草案：

```js
BodyBuilder.build(role, room, context)
```

返回：

```js
{
  body: [WORK, WORK, MOVE],
  cost: 250,
  capacity: {
    workParts: 2,
    carryParts: 0,
    moveParts: 1
  }
}
```

BodyBuilder 不决定“要不要孵化”。它只回答“当前约束下，一个该角色 creep 可以提供多少能力”。

### SpawnPlanner

新增轻量孵化规划模块，例如 `src/services/SpawnPlannerService.js`，或先在现有策略中用 helper 完成同等职责。

职责：

- 收集角色策略表达的能力需求。
- 统计已有 creep 和正在孵化/已排队 creep 的能力。
- 调用 BodyBuilder 获取当前可孵化 body。
- 当能力缺口存在时，向 EventBus 发布 `REQ_SPAWN`。

初版为降低改动量，可以先让 `MinerStrategyService` 和 `HaulerStrategyService` 各自完成需求比较，但必须通过同一个 BodyBuilder 计算 body 与能力，避免“数量决策”和“body 决策”割裂。

### SpawnService

`SpawnService` 保持执行层职责：

- 接收 `REQ_SPAWN`。
- 检查 idle spawn 和房间当前能量是否满足 `body` 成本。
- 调用 `spawnCreep`。

它不内置角色 body 规则，也不计算 source 或物流需求。

## 游戏阶段

初版阶段判断保持简单：

- `bootstrap`：房间没有可用 miner，或 spawn/extension 无法稳定获得能量。
- `early`：有 miner 和至少一个 hauler，但没有 storage。
- `stable`：有 storage 或较高 energy capacity。

BodyBuilder 可通过阶段影响 body：

- bootstrap 优先保证能孵化，不追求最优 body。
- early 用中等 body，避免等待满能量太久。
- stable 用高效 body，减少占位和维护成本。

## 测试策略

按 TDD 执行，先补失败测试，再改生产代码。

建议测试覆盖：

- `BodyBuilder` 在不同能量预算下为 miner/hauler 生成合法 body 和能力描述。
- miner 满载时不再分配 `TRANSFER`，而是继续保持 source 采矿职责。
- miner 分配 source 时会考虑已有绑定数量和可用采矿位。
- source 可站位计算会排除墙和边界外位置。
- hauler 空载时能从 source 周边 dropped energy 或 container 获取任务。
- hauler 载能时能向 spawn/extension/tower/storage 分配转移任务。
- 孵化请求使用 BodyBuilder 生成的 body，而不是固定 body。

现有 `src/tests/smoke.cjs` 可以继续作为轻量行为测试入口，必要时拆出更聚焦的测试 helper。

## 迁移步骤

1. 为 BodyBuilder 添加测试和实现。
2. 为 source 可站位、source 绑定统计添加测试和实现。
3. 修改 miner 策略为定点采矿，并移除满载转移行为。
4. 修改 hauler 策略，让其能从 source 周边取能。
5. 将 miner/hauler 孵化请求迁移到 BodyBuilder。
6. 运行 smoke 测试和 build。
7. 上传游戏环境后观察 1000 tick：source 占位、掉落能量、hauler idle 比例、spawn 能量恢复速度。

## 风险与缓解

- 风险：早期没有 hauler 时，定点 miner 会让能量掉地上，spawn 可能断能。
  缓解：bootstrap 阶段优先保证至少 1 个可工作的 hauler，必要时允许临时小 body。

- 风险：BodyBuilder 生成小 miner 时，source 采矿位不足以容纳足够 WORK。
  缓解：按 `maxCreeps` 限制补位，并在稳定期优先生成高 WORK miner。

- 风险：Hauler 取能目标过远导致效率低。
  缓解：初版优先本房间 source 周边和 storage，后续再把路线距离纳入运输需求。

- 风险：孵化请求重复排队导致超量。
  缓解：统计已有 creep 时同时考虑 memory 中已绑定目标；后续可扩展统计 pending spawn tasks。

## 验收标准

- 同一房间多个 source 不再因为 creep 名称长度集中分配到同一个 source。
- `miner` 不再把能量转交经济建筑。
- `hauler` 在没有 storage 的早期也能从 source 周边获取搬运任务。
- miner/hauler 的 body 会随房间能量预算变化。
- `SpawnService` 不包含角色 body 规则。
- 测试和 build 通过。
