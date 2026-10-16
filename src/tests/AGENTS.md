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
