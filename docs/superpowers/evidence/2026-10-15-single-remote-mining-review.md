# 单远程矿独立只读 review

日期：2026-10-15。Reviewer 为本轮新建、无实施历史的独立子代理；只读审阅完整未提交工作区和新增文件。独立重跑 smoke、room-governor、79 个专项用例及 diff check 通过。未写文件、未 build、未访问线上、未提交或部署。

初始 verdict：With fixes。Critical=0，Important=6，Minor=0。维护者按实际影响保留全部 Important 定级，逐项增加生产链 RED 回归后修复。

| 编号 | 复现事实 | 必须恢复的合约 |
| --- | --- | --- |
| R1 | 已在 to_home 的 hauler 遇旧路径上的新 hostile 仍继续原 MOVE_TO | 所有远程 leg 在危险变化后复核；安全返程无路则 safe_wait，期限不延长 |
| R2 | 旧 miner 占容器，替补卡 5 ticks 后永久 blockedGoalKey；旧 actor 死亡也不重试 | 明确工位交接和有界等待；占位者离开后重新核验，保留真正卡死保护 |
| R3 | 改 baseRoom 新建 remoteId，带货旧 actor 没有 global scope，变 orphaned | 先按旧经营身份排空 actor、孵化和 owner，再切新母房 |
| R4 | 所有 PathFinder 搜索 incomplete，仍 active 并孵化 700+800 的经济单位 | 发布需求之前，用拟用实际 body 校验必要进出路线 |
| R5 | 本房与远程分别预留同一 HomeSink 剩余 100，合计派出 200 | 同一个物理 target/resource 共享容量，owner context 才区分 remoteId |
| R6 | intake 后中断/reset 的 executing grant 留 1600 上界，但 ledger/window 的成本和 unknown 均为零 | 成功备份幂等补核；无证据显式记录 unknown 与成本上界 |

Reviewer 认为 21 个保守预算桶、零预算暂停、非法 source 安全撤回、本房请求字段兼容和完整未提交差异 review 的裁决合理。

未判断：线上收益/CPU/10000-tick 验收（未部署）；完整 PathFinder/碰撞引擎行为（本地 mock 不替代服务器）；多矿/殖民/作战（范围外）；真实 pilot 参数（尚无当前只读事实）。这些仍是交付边界，不作为本地代码缺陷。

## 修复与维护者复核

R1–R6 全部保留 Important 定级并修复，分别保存 review-R1 至 review-R6 的 RED/GREEN 日志。修复后没有未处理的 review finding：

- R1：所有远程 MOVE_TO 对已知危险重核，包含 to_home/returning；重新规划沿用原期限，无路 safe_wait。
- R2：退休矿工在功能替补抵达邻格后安全离位；替补在原期限内等待，阻挡者离开才重核。损坏 WORK 的矿工也让出工位。
- R3：按目标房找到旧经营，旧 remoteId 保留到 actor/孵化/owner 排空；之后原子切身份，旧账与母房预算保留。
- R4：发布需求前用现有或拟用 body 验证必要往返路线；没有可用路线不孵化经济角色。
- R5：原单 ledger 以物理 target/resource 核算容量；远程、本房和 fallback 都遵守，部分配送限制实际 amount；释放只作用于对应 owner。
- R6：中断后未知执行显式记 unknown 与未决成本上界，预算仍持有；有成功备份及实际孵化/活体证据则幂等补核。gauge 可下降，历史 unknown counter 不回退。

追加维护者回归覆盖暂停 worker 返程的 stuck guard、冲突 source 身份不得占用有效配额或执行，以及 miner 使用自身地形行程进入替换窗口。

最终 npm test：smoke passed、room-governor passed、remote 93/93，fail=0；无 DEST build 通过，工作区与暂存区 diff check 均通过。HEAD 仍为 9ab8f4263024904972935987fe83672db3802f75，无提交、推送或部署。本报告不把修复后的维护者回归称为第二次独立 review；线上验收仍未执行。
