# Storage 数量预留本地实施与验证

日期：2026-10-15。工作区 `C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium`，分支 `codex/single-remote-mining`，HEAD 保持 `b89a995ed31d5a61a0e8e64a69c7af32f39e1542`。

按已认可设计完成三批本地实施，改动未暂存、未提交、未推送、未部署。设计和分批计划分别位于 `docs/superpowers/specs/2026-10-15-storage-energy-quantity-reservation-design.md` 和 `docs/superpowers/plans/2026-10-15-storage-energy-quantity-reservation.md`。

## 最终行为

- 仅真实己方母房 storage 的本地 energy WITHDRAW 使用数量预留；读取与接收检查共享同一物理目标余额规则。普通/事件供给别名不能重复占用同一库存。
- 例如库存 999750，两个 builder 各领取 100，均选近端 storage，剩余额度 999550；库存 150 时分配 100+50，第三个无额度。
- 可分配量受供给允许数量、鲜活库存、已有 owner 与 creep 剩余空间约束；每个获准共享任务都明确携带 `task.amount`，新 owner 带 `allocationMode: quantity`。
- 旧无标记 owner、匿名记录和无法归属的旧供给继续保守独占；兼容 writer 不得覆盖或插入其他 owner 的预留。没有市场实例时保留原兼容任务规划行为。
- 掉落资源、container、terminal、其他资源和远程 context 不扩大到数量共享。
- 单 owner 取消、死亡、替换只释放自己；同 tick OK 保留等待确认。原有下一 tick 等量匹配标准不变，并发净变化无法分解时记录 unknown，并释放已结束 owner。
- TTL=5、原始 maxTaskTicks=50、每房 owner 上限200保持不变；global reset 从持久 owner/taskMeta 恢复。

## 分批证据

| 批次 | RED 证据 | GREEN |
| --- | --- | --- |
| 1：共享余额与接收检查 | 第二 worker 改选远处、别名可用量150而非50、鲜活库存余额被归零等真实业务断言失败 | 8/8专项用例 |
| 2：准确 amount 与兼容路径 | 旧兼容 writer 返回领取任务并覆盖/加入 owner；无市场 fallback 出现入口回归 | 23/23专项用例＋smoke |
| 3：生命周期与接收边界 | 接收层错误接受超过 creep 空间的101额度 | 34/34专项用例 |
| 维护者检查 | 匿名旧预留为-100时把1000库存抬高为1100；NaN被误作0 | 修复后包含该边界的最终完整检查通过 |

异常匿名值（负数、NaN、Infinity、null、缺失值）现在保持独占直到原期限，不能抬高库存余额，也不续出新期限。

## 最终验证

- `npm test` 退出码0：smoke checks passed；room governor checks passed；node:test **141/141通过**，其中42项为新增 storage 专项，原远程矿/工位99项全部通过。
- 覆盖供给顺序互换、部分额度、别名防超领、鲜活库存下降、任务amount、旧owner/匿名迁移、无市场fallback、非共享目标/资源、取消/死亡/替换、确定确认、并发unknown、reset、50tick上界和200owner上限。
- 测试中的两条 SpawnService `spawn failed ... -4` 来自既有失败路径用例，不是测试失败。
- `npm run build` 退出码0。当前构建子进程清除了 DEST，日志明确“代码将被编译但不会上传”；本轮没有调用 push/deploy 脚本。
- `git diff --check`、`git diff --cached --check` 通过；暂存区为空，HEAD未变。

运行时使用 bundled Node `C:/Users/mts-2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`。日志与分批账本保存在 `.superpowers/sdd/2026-10-15-storage-energy-quantity-reservation/`，包括 task1-red.log、task2-red.log、task3-red.log、review-red.log、full-test-final.log、build-final.log、progress.md。

## 维护者检查与过程判断

执行了作者维护者检查，没有自动调用子代理或声称独立 review。没有剩余待修复的代码发现，也没有顺手调整 body、交通、评分或孵化策略。

- 用户已明确要求直接分批实施且不提交/部署，因此计划以原生 Windows 账本记录，不执行技能流程中的提交、清理 worktree 或自动委派步骤。代价是没有独立 review，本次是作者自检。
- 跨房间 fixture 原本期待“仍发独占领取”，实际被已发布的距离边界拒绝，确认后修正为 unavailable；生产跨房间策略未变。这是测试前提修正，不是放宽领取条件。
- 精确 task.amount 在第一批就由接收层统一绑定，防止出现先允许并发、后补限量的中间状态；第二批以回归核对传播和兼容行为。

## 在线边界

只读原生检查 tick83657128（北京时间14:51:28）仍执行旧在线版本 `1792045244478`：remoteMining.enabled=false、Governor shadow=true、scheduler.enforce=false、recovery=normal，miner2、hauler3、bucket10000。该检查没有运行新数量预留逻辑，也没有写在线 Memory。

本轮只完成本地修复和验证，不能宣称线上 builder 绕远或 terminal 吞吐已因该改动改善。并发领取的精确归因仍可能是 unknown，这是保留的计量边界。后续若获准发布，需要按新代码版本另起现场观察，检查实际领取、预留峰值/释放、unknown 和 terminal 进度；不接续旧样本声称连续验收通过。
