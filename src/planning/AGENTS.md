# planning 模块说明

`planning` 负责长期规划和工地布置，主要写入 `Memory.rooms[roomName]`，并标记 `RoomCache` dirty。

## 规划服务

- `CityPlannerService`: 生成 `cityPlan`，规划核心建筑、source/controller container、roadAnchors，并放置 extension/storage/container 工地。
- `RoadPlannerService`: 根据 base center 到 source/controller 的路径生成 `roadNetwork`，并持续补 road 工地。
- `MaintenancePlannerService`: 生成 `maintenancePlan`，把 road/container/core/defense 维修目标分配给 repairer/tower。
- `DefensePlannerService`: 生成防御规划、tower、rampart/wall、保护资产与 reserved positions。
- `BaseBlueprint`: 核心建筑布局蓝图。

## Memory 合约

常见写入：

- `Memory.rooms[roomName].cityPlan`
- `Memory.rooms[roomName].roadNetwork`
- `Memory.rooms[roomName].roadNetworkVersion`
- `Memory.rooms[roomName].maintenancePlan`
- `Memory.rooms[roomName].cityPlan.defense`

## 修改边界

- planner 可以创建 construction site，但不直接给 creep 分配任务。
- 创建/删除工地后应设置 `global.RoomCache[roomName].isDirty = true`。
- `RoadPlanner` 的 roadNetwork 是 builder 判断 critical road 的输入；不要随意改坐标格式，当前是 `"x,y"`。
- `MaintenancePlanner` 的 executor 决定 role 归属。普通维修目标应是 `repairer`，紧急防御可由 `tower` 执行。
