# Goal/Plan Shadow Foundation Implementation Plan（已执行本地验证）

> **For agentic workers:** 设计确认后由主代理按 superpowers:executing-plans 分批实现，先RED再GREEN；不自动委派、提交、推送或部署。用户已明确授权执行草案；本轮仅本地实现和验证。

**Goal:** 首先以母房接收空间为例，形成可解释、可恢复、有界且零执行接管的Goal/Plan影子闭环。

**Architecture:** 事实适配、纯模型、最小持久注册表分别负责读取、推理和保存；服务仅编排影子输出。沿用现有Governor、物流和执行层，不新建第二套资源或孵化账本。

**Tech Stack:** Screeps JavaScript ESM、node:test、既有smoke/room-governor/remote/storage回归。

**Spec:** docs/superpowers/specs/2026-10-15-goal-plan-shadow-foundation-design.md（已获用户执行授权）。

## Global Constraints

- 线上逻辑保持1b0611e，remoteMining.enabled=false、Governor shadow=true、scheduler.enforce=false、market.enabled=false。
- 新goalPlanning默认enabled=false且仅shadow；目标定义只来自显式离线输入，不自动植入在线Memory。
- 不调用EventBus发执行需求、assignTask、spawn或其他游戏动作。
- interval10、maxFactAge20、两份capturedAt不同且相隔至少10tick的新鲜事实；maxGoals20、maxPlans20、eventLimit50、最多8个reasonCodes。
- 不自动提交、推送、部署，也不改变terminal只读跟进。

## Review Focus

- progress满值不能替代真实terminal；free19999不足，20000须两次新鲜评估。
- 同tick、缺版本、未来/陈旧事实、跨版本与reset不能误累计成功。
- 历史achieved与当前readiness分开，避免容量下降后仍显示可启用。
- 取消/到期和记录上限不得改真实任务，不能清掉其他仍有效计划。
- 主循环接线和disabled路径必须证明执行层调用为0。

### Task 1: 接收空间事实契约

**Files:** 新增src/governance/GoalPlanFacts.js、src/tests/goal-plan.cjs；测试入口加入package.json（仅未来实施时）。

**Interfaces:** `collectGoalPlanFacts({roomNames, now, codeVersion}) -> {capturedAt, codeVersion, rooms, errors}`。单房事实包含visible/owned、真实terminal id/free、terminal工地进度、recovery模式和各字段known标记。

- [x] 先写fixture：工地progress=100000但无terminal，不能产生ready事实。
- [x] 写free19999/20000、目标消失、缺视野/所有权、未知值和未来时间戳的失败回归。
- [x] 运行 `node --test src/tests/goal-plan.cjs`，确认RED来自缺失事实行为。
- [x] 实现只读适配；断言Memory对象不变、无事件或游戏动作。
- [x] 同一命令GREEN，记录证据，不提交。

### Task 2: Goal/Plan纯状态机

**Files:** 新增src/governance/GoalPlanModel.js；扩展src/tests/goal-plan.cjs。

**Interfaces:** `evaluateGoalPlan({goal, plan, facts, now, policy}) -> {goal, plan, currentReadiness, events}`。消费Task1契约；不得直接读取Game/Memory。

- [x] 先写RED：两份capturedAt不同、间隔>=10且新鲜同版本事实才达到ready；同tick或相同capturedAt重复不累计。
- [x] 覆盖waiting_structure/waiting_capacity/ready、恢复blocked、失效/跨版本清计数、历史完成后容量下降、取消/绝对到期。
- [x] 明确unknown不当0；progress增加只更新进展，不把派单/意图当完成。
- [x] 实现纯转换并验证输入不变；GREEN后记录状态表，不提交。

### Task 3: 有界影子注册表与服务

**Files:** 新增src/governance/GoalPlanRegistry.js、src/services/GoalPlanService.js；修改src/config/EmpirePolicy.js、src/config/MemoryConfig.js、src/main.js、src/services/EmpireMetricsService.js；扩展测试。

**Interfaces:** `reconcileGoalPlanRegistry(registry, definitions, facts, now, policy) -> {registry, summary, errors}`生成Task2的有界下一状态而不修改输入。registry包含goals、plans、meta；服务分别保存到control.goals/control.plans/control.goalPlanningState，meta包含schemaVersion=1和events。GoalPlanService消费显式定义和只读事实，global给当tick摘要。

- [x] RED覆盖默认关闭、无目标不自动种目标、20目标/计划拒绝第21条、50事件截断、重复定义去重。
- [x] 覆盖reset、disabled、未知schema不覆盖旧记录、取消单目标不影响其他目标，budgetAllocated始终0。
- [x] 接线于RoomGovernor之后；增加compact metrics，不保存完整Game对象或无限历史。
- [x] 单独模块断言执行调用为0；真实主循环启用/禁用影子层的同一fixture对照，REQ_SPAWN/REQ_RESOURCE、assignTask、spawnCreep、createConstructionSite等原有事件/动作清单完全一致，旧行为及开关不变。
- [x] GREEN并保存模块/主循环顺序证据，不提交。

### Task 4: 完整验证和交付

**Files:** 对上述改动做维护者检查；新增中文本地交付记录。

- [x] 运行 `npm test`，原smoke、room-governor、远程、工位、storage数量预留用例及新增Goal/Plan全部通过。
- [x] 无DEST运行 `npm run build`；运行两个diff whitespace检查。
- [x] 检查原字段未被覆盖、未知事实保守处理、shadow无执行副作用、记录上限和版本隔离。
- [x] 记录本地测试边界及需要将来实测的CPU/Memory成本；保留未提交改动，不自动发布或接管。

## 后续依赖

远程矿现场运行不是上述纯模型设计的前置条件；它是后续EmpireDirector预算、优先级及计划选择策略的事实输入。真实接收容量、W48N41路线和启用授权仍走原主线，Goal/Plan影子状态不替代任何上线门槛。
