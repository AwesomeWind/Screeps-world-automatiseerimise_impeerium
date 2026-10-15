# Storage Energy Quantity Reservation Implementation Plan

> **For agentic workers:** 使用 superpowers:executing-plans，由主代理逐批执行。用户要求不提交、不部署，不自动委派子代理。

**Goal:** 同一母房 storage 的本地能量领取按数量预留，保持 owner 独立释放和保守确认。

**Architecture:** ResourceReservationFeedback 统一共享资格、物理目标余额和最终接收检查；ResourceMarketService 的读取及任务创建消费同一规则。新数量 owner 带 allocationMode，旧记录继续独占。

**Tech Stack:** Screeps JavaScript ESM；Node node:test；既有 remote-mining fixture。

**Spec:** docs/superpowers/specs/2026-10-15-storage-energy-quantity-reservation-design.md（用户已认可）。

## Global Constraints

- 使用现有 codex/single-remote-mining worktree，基线 b89a995；本轮不暂存、不提交、不推送、不部署、不写在线 Memory。
- remoteMining.enabled=false、Governor shadow=true、scheduler.enforce=false、market.enabled=false。
- 仅真实己方母房 storage/energy/本地 WITHDRAW 共享；TTL=5、maxTaskTicks=50、每房 owner 上限200不变。
- 不修改 confirmOwner 的等量匹配，不把并发未知量计作 confirmed。

## Review Focus

- 相同物理目标跨市场别名不能重复分配；旧匿名目标无法归属则保守阻挡。
- 新任务 amount 与预留一致；禁止旧无 amount owner 混入共享。
- 兼容 writer 不能覆盖现有 owner、匿名记录或绕过另一 entry 的预留。
- snapshot 库存与鲜活库存取更小值；零/非法/消失目标不得新增数量额度。
- 同 tick OK、并发净变化、reset、死亡/取消/到期必须释放正确 owner且不伪造确认。

### Task 1: 共享库存与接收检查

**Files:** src/services/ResourceReservationFeedback.js；src/services/ResourceMarketService.js；src/tests/storage-reservation.cjs（新建）；package.json。

**Interfaces:** 提供 `isQuantityStorageSupply(market, targetId, resourceType, context?)` 与 `availableSupplyAmount(market, supply, options?)`；reserveForTask 继续返回 boolean，新增 quantity owner 标记。ResourceMarket 的读取复用该余额规则。

- [x] 先写真实 requestResource 流程回归：两个100均选storage、余额999550；150库存最多100+50；别名共用库存；非共享资格仍独占；原始库存下降与非法输入拒绝。
- [x] 运行 node --test src/tests/storage-reservation.cjs，确认旧代码因第二worker改选远处供给/available=0等业务断言失败。
- [x] 统一资格/余额/最终接收规则，不更改角色排序或报价公式。
- [x] 同一命令全绿，保存批次记录，不提交。

### Task 2: 精确领取和兼容保护

**Files:** 同上；沿用 Task 1 的余额接口。

- [x] 先写 task.amount=实际获准额度、old owner/anonymous/不明别名保持独占、兼容 writer 不覆盖/不返回无预留task、远程 context 不共享的失败回归。
- [x] 为新数量 task 强制准确 amount，新owner标记；兼容路径保守互斥并保留原TTL。
- [x] 跑 focused tests 与 smoke，确认通过；涉及现有“无amount”的断言只按新明确契约更新，不放宽业务预期。

### Task 3: 跨 tick 与完整门禁

**Files:** src/tests/storage-reservation.cjs；必要时修复前两批直接引入的问题。

- [x] 覆盖取消/死亡/替换只释放自己、同tick OK保留、相邻tick确定匹配、并发unknown释放、reset、50tick上界、200owner上限；掉落资源与远程回归不变。
- [x] focused tests 验证；新增失败场景先RED后修复，不改确认标准以迁就测试。
- [x] npm test、npm run build、git diff --check、git diff --cached --check。
- [x] 维护者自检、中文交付记录、核对HEAD不变和改动未暂存，保留scratch证据。本轮不运行提交/发布/清理worktree步骤。

## Execution Ledger

独立记录位于 .superpowers/sdd/2026-10-15-storage-energy-quantity-reservation/progress.md；Windows 原生 PowerShell 记录等价批次证据。用户已授权实施，无需再次等待计划审批。不得自动委派，最终执行维护者自检，明确其非独立review。
