# War Strategy System Design

## 背景

当前代码已经具备基础防御能力：

- `SecurityService` 能识别敌人、估算敌我强度，并设置 `develop` / `defend` 姿态。
- `MinerStrategyService` 能避开敌方近战和远程攻击范围内的采集位。
- `DefenderStrategyService` 能在 `develop` 姿态下集结，在 `defend` 姿态下集火高价值目标。

这些能力仍分散在多个服务中。下一阶段需要把战争相关决策抽成统一系统，避免 miner、hauler、builder、defender、spawn 各自局部判断，导致策略冲突。

## 目标

建立一个完整但不过度扩张的本房间战争策略系统：

- 统一分析敌方威胁、我方战力、危险区域和防御资源。
- 统一输出房间战略姿态：`avoid`、`develop`、`defend`、`rally`、`attack`、`recover`。
- 让经济单位、孵化决策和 defender 行为都读取同一个战争计划。
- 让 defender 支持集结、集火、撤退、追击和基础进攻推进。
- 用基础路径成本避开敌方攻击范围，避免经济单位和近战单位盲目穿越战区。

## 非目标

本阶段不实现完整军事 AI：

- 不做跨房主动远征。
- 不做多兵种 squad 编队。
- 不做 healer / ranger 精细配合。
- 不做拆墙、攻城、占房和补给链。
- 不把所有 creep 角色重构成统一行为树。

## 架构

### WarIntelService

负责每 tick 收集战争情报，输出 `global.WarIntel[roomName]`。

输入：

- `Game.rooms[roomName]`
- 可见敌方 creep
- 我方 defender
- tower、spawn、rampart、road、controller、storage
- 当前 `Memory.rooms[roomName].cityPlan`

输出示例：

```js
global.WarIntel[roomName] = {
  hostiles: [
    {
      id: 'hostile1',
      pos: { x: 20, y: 20, roomName },
      attackParts: 2,
      rangedParts: 4,
      healParts: 1,
      toughParts: 3,
      threatScore: 235
    }
  ],
  hostileStrength: 235,
  defenderStrength: 90,
  towerStrength: 60,
  totalDefenseStrength: 150,
  dangerZones: {
    '20,20': true,
    '21,20': true
  },
  safeRallyPoints: [
    { x: 15, y: 15, roomName }
  ],
  primaryHostileId: 'hostile1'
};
```

职责边界：

- 只负责事实和评分。
- 不决定是否孵化、是否攻击、是否撤退。

### WarStrategyService

负责读取 `WarIntel` 并决定战略姿态，输出 `global.WarStrategy[roomName]`。

姿态定义：

- `avoid`：敌人强度远高于我方，经济单位避开危险区域，不主动交战。
- `develop`：暂时打不过，但房间仍可发展，优先经济、extension、tower、rampart 和能量积累。
- `defend`：我方可以守住，允许孵化有效 defender，并让 tower / defender 集火。
- `rally`：我方有机会反击，但 defender 数量或位置未完成集结。
- `attack`：我方优势明显，主动追击和压制敌方。
- `recover`：敌人消失后恢复经济，清理临时战争状态。

输出示例：

```js
global.WarStrategy[roomName] = {
  posture: 'rally',
  primaryTargetId: 'hostile1',
  rallyPoint: { x: 15, y: 15, roomName },
  retreatPoint: { x: 15, y: 15, roomName },
  spawnDefender: true,
  suspendUnsafeEconomy: true,
  minDefendersToAttack: 2
};
```

决策规则初版：

- 无敌人：`recover`。
- 敌方强度超过我方可用防御强度 1.5 倍：`develop`。
- 敌方强度远高于我方且危险区域覆盖关键经济点：`avoid`。
- 我方强度接近敌方但 defender 数量不足：`rally`。
- 我方强度可以抗衡：`defend`。
- 我方强度明显高于敌方且 defender 已集结：`attack`。

### CombatPlannerService

负责把战略姿态转为可执行战术计划，输出 `global.CombatPlan[roomName]`。

计划内容：

- `primaryTargetId`：优先集火目标，优先级为 `HEAL > RANGED_ATTACK > ATTACK > WORK > CARRY`。
- `rallyPoint`：集结点，优先 spawn、tower、rampart、city center。
- `retreatPoint`：撤退点，通常和 rally point 相同。
- `engageRange`：近战为 1，远程角色后续可扩展为 3。
- `allowPursuit`：是否追击离开核心区域的敌人。
- `avoidZones`：需要经济单位和弱战斗单位绕开的危险格。

输出示例：

```js
global.CombatPlan[roomName] = {
  posture: 'attack',
  primaryTargetId: 'hostile1',
  rallyPoint: { x: 15, y: 15, roomName },
  retreatPoint: { x: 15, y: 15, roomName },
  allowPursuit: true,
  avoidZones: { '20,20': true }
};
```

### CombatPathingService

负责生成基础路径成本。

初版能力：

- 敌方 `ATTACK` 范围 1 的格子高成本。
- 敌方 `RANGED_ATTACK` 范围 3 的格子高成本。
- rampart、road 低成本。
- wall、不可通行结构不可走。
- 给经济单位提供 `isPositionDangerous(roomName, pos)`。

路径输出不直接移动 creep，而是供策略服务选择目标和设置 `MOVE_TO` 任务。

### DefenderStrategyService

降级为执行层：

- 读取 `global.CombatPlan[roomName]`。
- `avoid/develop`：移动到 `retreatPoint` 或 `rallyPoint`。
- `rally`：未到集结点则移动；到齐后等待姿态变为 `defend/attack`。
- `defend`：集火 `primaryTargetId`，不追出核心防区。
- `attack`：集火并允许追击。
- 无 `CombatPlan` 时保留当前 fallback 行为，避免服务顺序异常导致 defender idle。

### 经济策略服务

`MinerStrategyService`、`HaulerStrategyService`、`BuilderStrategyService` 读取战争系统：

- 如果目标位置在 `avoidZones` 中，不分配该任务。
- `develop` 姿态下 builder 优先防御建设：tower、rampart、wall、extension。
- hauler 在 `defend/rally/attack` 姿态下优先给 tower、spawn、extension 送能。
- miner 继续避开危险采集位。

### Spawn 决策

`SecurityService` 或新的 spawn planner 读取 `WarStrategy`：

- `avoid`：不孵化低效 defender，优先经济恢复和防御建设条件。
- `develop`：仅在能孵化有效 body 时请求 defender，否则优先经济和 builder。
- `defend/rally/attack`：请求 defender，并按房间能量生成有效 body。
- 所有 defender 请求都必须考虑已有 defender 和 pending spawn。

## 服务顺序

建议在 `main.js` 中按以下顺序运行：

1. `RoomCacheService`
2. `WarIntelService`
3. `WarStrategyService`
4. `CombatPlannerService`
5. `SecurityService`
6. 经济策略服务
7. `DefenderStrategyService`
8. `EventBus.dispatch()`
9. 执行层服务和 `ActionParser`

`SecurityService` 后续可以逐步瘦身，只保留兼容 `global.Security` 的桥接输出。

## Memory 和 global

战争系统主要使用 `global` 做本 tick 缓存：

- `global.WarIntel`
- `global.WarStrategy`
- `global.CombatPlan`

少量长期配置写入 `Memory.rooms[roomName].warConfig`：

```js
{
  enabled: true,
  allowPursuit: false,
  minDefendersToAttack: 2
}
```

默认情况下不持久化每 tick 的敌人列表和 danger zones，避免污染 Memory。

## 测试策略

继续使用 `src/tests/smoke.cjs` 做行为测试，必要时提取测试 helper。

测试覆盖：

- `WarIntelService` 正确计算敌方 body 强度和危险区域。
- `WarStrategyService` 在不同敌我强度下输出正确姿态。
- `CombatPlannerService` 选择 healer / ranged / attacker 的优先目标。
- `DefenderStrategyService` 根据 `CombatPlan` 集结、撤退、集火、追击。
- miner 不去危险采集位。
- hauler 不去危险取能/送能目标。
- builder 在 `develop` 姿态下优先防御建设。
- `SecurityService` 不再在打不过时请求低效 defender。
- `npm test` 和 `npm run build` 通过。

## 迁移步骤

1. 新增 `WarIntelService`，先只输出敌方强度、我方强度和危险区域。
2. 新增 `WarStrategyService`，输出 `avoid/develop/defend/rally/attack/recover`。
3. 新增 `CombatPlannerService`，输出目标、集结点、撤退点和 danger zones。
4. 修改 `DefenderStrategyService`，优先执行 `CombatPlan`。
5. 修改 `MinerStrategyService`，统一读取 `CombatPlan.avoidZones`。
6. 修改 `HaulerStrategyService`，避开危险目标，并在战争姿态下优先补 tower/spawn。
7. 修改 `BuilderStrategyService`，`develop` 姿态下优先防御建设。
8. 修改 `SecurityService`，逐步变为兼容桥接和 defender spawn 请求层。
9. 补充 smoke 测试并运行 build。

## 风险与缓解

- 风险：姿态切换过于频繁导致 creep 行为抖动。  
  缓解：初版按当前 tick 计算，后续可加入姿态最短持续 tick。

- 风险：danger zones 太保守导致经济停摆。  
  缓解：只把明确攻击范围标为高危，外围区域只增加路径成本。

- 风险：低等级房间长期 `develop` 不孵化 defender。  
  缓解：`develop` 仍允许经济和防御建筑发展；当能量容量提升后自动切换。

- 风险：服务过多导致顺序依赖复杂。  
  缓解：每个服务只读上游 global 输出，不反向修改上游数据。

## 验收标准

- 有敌人时，房间会生成统一的 `WarIntel`、`WarStrategy` 和 `CombatPlan`。
- 强敌压制时，系统进入 `develop/avoid`，经济单位避战，不再送弱 defender。
- 可抗衡时，系统进入 `defend/rally/attack`，defender 会集结并集火高价值目标。
- miner、hauler、builder 都不会主动把任务目标设到危险区域。
- 战争状态消失后进入 `recover`，经济任务恢复。
- `npm test` 和 `npm run build` 通过。
