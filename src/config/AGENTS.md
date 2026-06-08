# config 模块说明

`config` 存放 Memory 默认值和房间级配置开关。

## MemoryConfig

主要职责：

- `ensureDefaults()`: 初始化 `Memory.empire`、`Memory.rooms` 等基础结构。
- `room(roomName)`: 返回并确保房间 Memory 对象存在。
- `flag(roomName, key, defaultValue)`: 读取房间级功能开关。
- `baseCenter(room)`: 获取或计算基地中心点。

## 使用约定

- service/planner 需要房间配置时优先走 `MemoryConfig.room(roomName)`，避免手写多层空对象初始化。
- 功能开关用 `MemoryConfig.flag`，默认值在调用点明确表达。
- 不要在 config 层引入 Game 行为策略；这里保持配置和 Memory 结构工具。
