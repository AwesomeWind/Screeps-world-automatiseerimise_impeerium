# 孵化局与战争需求联动设计

## 背景

长时间运行后暴露了三个问题：

- creep 在执行 `MOVE_TO` 任务时可能长期停在路上，导致 miner 到不了矿点、hauler 搬运途中卡在半岛。
- miner 补位由 `MinerStrategyService` 局部判断，容易忽略同 tick 已发布的孵化请求，出现 3 个矿点孵化 4 个 miner 的情况。
- creep body 主要按 `storage` 和固定阶段切换，RCL2 extension 建好后，房间能量上限提升没有充分转化为更强的 miner、hauler、builder、upgrader 或 defender。

现有系统里，经济角色和安全系统都可以直接发布 `REQ_SPAWN`。这会让 spawn 决策分散在多个服务中：每个服务只知道自己的需求，不知道其他服务本 tick 已经计划了什么，也难以做统一去重、优先级仲裁和 body 预算。

## 目标

本设计新增一个房间级孵化决策中心：`SpawnBureauService`。

它统一回答：

- 当前房间缺什么 creep。
- 缺口是否已经被 live creep、孵化中 creep 或本 tick intent 覆盖。
- 这些缺口之间的优先级如何排序。
- 在当前房间能量上限下，应该生成什么 body。
- 哪些最终请求应该交给 `SpawnService` 执行。

同时修复：

- `MOVE_TO` 任务长期卡住。
- miner 超量孵化。
- body 不随 RCL2 extension 等能量上限提升而灵活增强。

## 非目标

第一阶段不实现完整战争 AI 改造，不引入跨房间远征兵种编队，也不把所有战争策略评分迁入孵化局。

战争管理局仍负责军事判断。孵化局只负责孵化仲裁与执行入口。

## 服务职责

### 战争管理局

战争相关服务负责生成战争态势和孵化需求：

- `WarIntelService`：识别敌人、危险区、防御强度。
- `WarStrategyService`：判断 posture，例如 `recover`、`develop`、`defend`、`rally`、`attack`。
- `CombatPlannerService`：给出集结点、主要目标和避让区域。
- `SecurityService`：第一阶段作为兼容桥接层，把战争态势转换成 defender spawn demand。

战争服务不直接发布 `REQ_SPAWN`。它们写入统一需求池。

### 孵化局

`SpawnBureauService` 负责：

- 读取 owned room。
- 统计 live creep、Memory 中孵化中 creep、本 tick 已计划 intent。
- 生成经济需求：miner、hauler、upgrader、builder。
- 读取战争需求：defender。
- 用 `quotaKey` 去重。
- 用优先级排序。
- 调用 `BodyBuilder` 根据 `bodyProfile` 和房间能量上限生成 body。
- 发布最终 `REQ_SPAWN`。
- 写入 `global.SpawnBureau`，供其他服务观察 blocked demand 或已计划 intent。

### 行为策略服务

以下服务不再负责孵化，只负责已有 creep 的任务分配：

- `MinerStrategyService`
- `HaulerStrategyService`
- `BuilderStrategyService`
- `UpgraderStrategyService`
- `DefenderStrategyService`

这样角色行为和 spawn 决策分离，避免局部策略重复抢 spawn。

### SpawnService

`SpawnService` 保持执行层职责：

- 监听 `REQ_SPAWN`。
- 检查 idle spawn。
- 检查 `room.energyAvailable >= bodyCost`。
- 执行 `spawnCreep`。
- 备份孵化中 creep memory。
- 清理死亡 creep memory。

它不计算角色需求，也不决定 body。

## 服务顺序

第一阶段服务顺序调整为：

```text
RoomCache
WarIntel
WarStrategy
CombatPlanner
Security
SpawnBureau
Spawn
Logistics
MinerStrategy
BuilderStrategy
HaulerStrategy
UpgraderStrategy
DefenderStrategy
TowerDefense
CityPlanner
RoadPlanner
Lab
Market
RemoteMining
```

`SpawnBureauService` 必须在 `SpawnService` dispatch 之前完成 analyze，因为它要发布 `REQ_SPAWN`。行为策略可以继续在 spawn 之后运行，它们只会处理已有 creep。

## 数据模型

### Spawn Demand

战争局和其他高层策略输出 demand，而不是直接请求 spawn。

```js
{
    owner: 'war',
    roomName: 'W1N1',
    role: 'defender',
    quotaKey: 'defender:W1N1:local',
    priority: 85,
    minCount: 1,
    maxCount: 3,
    bodyProfile: 'melee_defender',
    memory: {
        role: 'defender',
        homeRoom: 'W1N1',
        targetRoom: 'W1N1'
    },
    rallyPoint: { x: 15, y: 15, roomName: 'W1N1' },
    reason: 'hostile_attack'
}
```

需求池位置：

```js
global.SpawnDemands = {
    W1N1: [/* demands */]
};
```

第一阶段由 `SecurityService` 写入 defender demand。后续可以让 `WarStrategyService` 直接写入。

### Spawn Intent

孵化局把 demand 和经济需求转换为 intent。

```js
{
    roomName: 'W1N1',
    role: 'miner',
    quotaKey: 'miner:W1N1:source1',
    priority: 80,
    bodyProfile: 'miner',
    body: [WORK, WORK, MOVE],
    memory: {
        role: 'miner',
        homeRoom: 'W1N1',
        sourceId: 'source1'
    },
    reason: 'source_uncovered'
}
```

intent 是孵化局内部产物，最终会发布为 `REQ_SPAWN`。

### Spawn Bureau 状态

孵化局每 tick 写入：

```js
global.SpawnBureau = {
    W1N1: {
        intents: [],
        blockedDemands: [],
        counts: {}
    }
};
```

`blockedDemands` 用于联动。例如 defender demand 因能量不足无法形成有效 body，战争局下一 tick 可以看到原因并调整 posture。

## 计数规则

孵化局统一统计以下来源：

- `Game.creeps` 中存活 creep。
- `Memory.creeps` 中还没有出现在 `Game.creeps` 的 creep。
- `Memory.empire.spawningCreeps` 中未过期的孵化记录。
- 本 tick 已生成但尚未发布的 intent。

同一个 `quotaKey` 的需求，如果已经达到 `maxCount` 或满足 `minCount`，就不再生成重复 intent。

## 经济需求规则

### Miner

miner 按 source 生成 quota：

```text
miner:<roomName>:<sourceId>
```

规则：

- 每个 source 优先保证至少 1 个 miner。
- 如果 source 可用采矿位为 0，不生成 miner。
- 如果该 source 已有 miner 数达到可用采矿位，不再补位。
- 如果该 source 已分配 `WORK` 数达到 5，不再补强。
- 统计范围包含 live creep、Memory、孵化中记录和本 tick intent。

这会防止 3 个 source 出现第 4 个无意义 miner。

### Hauler

hauler 使用房间级 quota：

```text
hauler:<roomName>:core
```

第一阶段目标数量：

- bootstrap：至少 1 个 hauler，用于避免定点 miner 采出的能量无法回流。
- early：2 个 hauler。
- stable 或有 storage：3 个 hauler。

后续可以用 source 距离、掉落能量、container 储量和 hauler carry 容量计算物流吞吐。

### Upgrader

upgrader 使用房间级 quota：

```text
upgrader:<roomName>:controller
```

第一阶段目标数量：

- 有 miner 和 hauler 后，至少 1 个 upgrader。
- 有 storage 时目标 2 个。

### Builder

builder 使用房间级 quota：

```text
builder:<roomName>:construction
```

第一阶段目标数量：

- 有 construction site 时目标 2 个。
- 无 construction site 时目标 0 个。

当房间处于战争 `develop` 姿态且存在 tower、rampart、wall、extension 相关工地时，builder 优先级提高，但仍由孵化局统一仲裁。

## 战争需求规则

defender 的军事需求由战争管理局决定，孵化局只执行可孵化的需求。

第一阶段桥接规则：

- 有可对抗威胁时，`SecurityService` 写入 `defender` demand。
- `bodyProfile` 由当前威胁和房间能量上限选择，例如 `melee_defender`。
- `priority` 按 posture 和威胁强度设置。
- 如果已有 defender 或孵化中 defender 满足 `minCount`，孵化局不重复生成。
- 如果经济断链，孵化局可以让紧急 miner/hauler 高于普通 defender，但本房间遭攻击 defender 高于普通 builder/upgrader。

推荐优先级：

```text
90  紧急恢复 miner / hauler
85  本房间遭攻击 defender
80  source 基础 miner 覆盖
75  基础 hauler
60  首个 upgrader
55  首个 builder
45  补充 hauler
35  补充 upgrader
30  补充 builder
```

## BodyBuilder 改造

`BodyBuilder` 改为预算驱动，并支持 `bodyProfile`。

预算来源：

```js
const budget = context.energyCapacity || room.energyCapacityAvailable || room.energyAvailable || 0;
```

孵化局根据 `bodyProfile` 调用：

```js
BodyBuilder.build('defender', room, {
    bodyProfile: 'melee_defender',
    energyCapacity: room.energyCapacityAvailable
});
```

`SpawnService` 仍使用 `room.energyAvailable` 判断当前是否够能量执行。这样 body 设计看长期容量，spawn 执行看当前能量。

### 经济画像

miner：

- 200：`[WORK, MOVE]`
- 250：`[WORK, WORK, MOVE]`
- 550：`[WORK, WORK, WORK, WORK, WORK, MOVE]`

hauler：

- 100：`[CARRY, MOVE]`
- 200：`[CARRY, CARRY, MOVE, MOVE]`
- 300 及以上：继续按 `CARRY/MOVE` 成对扩展，受 50 body parts 限制。

upgrader / builder：

- 200：`[WORK, CARRY, MOVE]`
- 300：`[WORK, CARRY, CARRY, MOVE, MOVE]`
- 400 及以上：增加 `WORK/CARRY/MOVE`，确保可工作、可搬运、可移动。

### 战斗画像

melee_defender：

- 190：`[TOUGH, ATTACK, MOVE]`
- 300：`[TOUGH, TOUGH, ATTACK, MOVE, MOVE]`
- 550：`[TOUGH, TOUGH, ATTACK, ATTACK, MOVE, MOVE]`
- 800 及以上：继续增加 `ATTACK/MOVE/TOUGH`。

ranged_defender 和 tough_guard 留作后续扩展。第一阶段可以保留接口和最小实现，不让战争局依赖不存在的画像。

## MOVE_TO 卡死修复

`ActionParser` 为 `MOVE_TO` 任务维护轻量状态：

```js
task.startedAt
task.lastPos
task.stuckTicks
task.maxTicks
```

规则：

- 首次执行时写入 `startedAt` 和 `lastPos`。
- 如果本 tick 位置与 `lastPos` 相同，`stuckTicks += 1`。
- 如果位置变化，重置 `stuckTicks` 并更新 `lastPos`。
- 连续 5 tick 未移动，清空任务。
- 超过 `maxTicks` 后清空任务，默认 `maxTicks` 为 50。
- 清空任务后，行为策略会在下一 tick 重新分配目标或路径。

这不改变 `moveTo` 的基本行为，只避免旧任务永久占住 creep。

## 测试计划

新增或调整 smoke 行为测试：

- `SpawnBureauService` 会为未覆盖 source 生成 miner intent。
- 3 个 source / 3 个可采矿位不会生成第 4 个 miner intent。
- miner 计数包含 live creep、Memory creep、`Memory.empire.spawningCreeps` 和本 tick intent。
- hauler、upgrader、builder 需求由孵化局生成，原策略服务不再发布 `REQ_SPAWN`。
- `SecurityService` 输出 defender demand，孵化局生成 defender `REQ_SPAWN`。
- 同 `quotaKey` defender demand 不会重复孵化。
- 经济断链时紧急 miner/hauler 优先级高于普通 builder/upgrader。
- RCL2 能量上限提升后，body 比 300 capacity 更强。
- `MOVE_TO` 连续卡住若干 tick 后清空任务。
- `SpawnService` 继续只执行合法 body，并写入 Memory 备份。

验证命令：

```bash
npm test
npm run build
```

## 风险与缓解

风险：一次性迁出多个策略的孵化逻辑可能造成某个角色短期不再补位。

缓解：测试覆盖每个经济角色的基础需求，并保留角色行为策略的任务分配不变。

风险：defender 接入孵化局后战争需求被经济需求压制。

缓解：战争局保留需求权和优先级，孵化局只在经济断链时让紧急 miner/hauler 抢先；本房间遭攻击 defender 仍高于普通建设和升级。

风险：BodyBuilder 预算驱动后生成更大 body，当前能量不足时 spawn 会等待。

缓解：bootstrap 阶段保留低成本 body；孵化局在经济断链时使用可恢复经济的较小画像。

风险：MOVE_TO 卡死检测误清理慢速 creep 的任务。

缓解：只在连续 5 tick 位置完全不变或任务超时后清理；清理后策略会重新分配，不会删除 creep 状态。

## 实施顺序

1. 写失败测试，覆盖孵化局需求、战争 demand、miner 去重、body 分档和 `MOVE_TO` 卡死。
2. 新增 `SpawnBureauService`。
3. 将经济角色孵化需求迁移到孵化局。
4. 将 defender 孵化入口改为战争 demand 到孵化局。
5. 改造 `BodyBuilder` 支持预算驱动和 `bodyProfile`。
6. 修改 `ActionParser` 的 `MOVE_TO` 状态与卡死清理。
7. 调整 `main.js` 服务顺序。
8. 跑测试和构建，修复回归。

## 验收标准

- 各角色策略服务不再直接发布经济角色 `REQ_SPAWN`。
- defender 的军事需求由战争服务表达，孵化执行由孵化局仲裁。
- miner 不会因为同 tick 重复需求而超过 source 覆盖上限。
- RCL2 能量上限提升后，body 会按预算增强。
- 长时间未移动的 `MOVE_TO` 任务会自动释放。
- `npm test` 和 `npm run build` 通过。
