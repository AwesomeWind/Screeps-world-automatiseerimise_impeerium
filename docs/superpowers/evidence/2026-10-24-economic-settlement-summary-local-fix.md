# 结算摘要未决状态：本地修复

2026-10-24。用户决定暂缓远程验收，继续本地修复，运行时验收方案以后重新设计。本轮不做连接重试，不实现此前待选择的联网恢复方案，不提交、推送、部署或写线上 Memory。

## 已确认的问题

`summarizeEconomicTrial` 原先仅依据未知金额上界和 outbox 的 ledger stage 判断是否能够展示 `netEnergy`。这遗漏了两类事实：

1. `unknownEvents > 0` 时，上界为 0 仅表示没有取得正数金额上界，不证明该未知事件没有成本或影响。
2. 孵化调用、孵化费用绑定、基建应用，以及物流账本应用和证据归约分别在不同检查点完成。单个 stage 标为 applied 不能证明会话证据已经包含这笔收支。

本地真实模块调用链的两个复现点：

- fixture 的原生 spawn 回调中，slot 已为 `call_started`、费用尚未确认，原摘要给出净额 0。
- 基建账本回调中，`infrastructureAttempt.stage=applying`，会话费用尚未归约，原摘要给出净额 -1550。

二者均应保留已确认部分，但不能展示确定的总净额。这是本地模拟中的可复现行为，不是线上观察。

## 修复范围

仅修改 `RemoteEconomicTrialModel.js` 的只读摘要：

- `knownNetEnergy` 仍为已确认入库减去已确认孵化和基建费用。
- 存在 unknown 事件、未知金额、孵化调用中/账本应用中/成功结果尚未绑定 receipt、基建未完成应用或证据归约、物流未完成应用或证据归约时，`netEnergy=null`。
- 结算完毕后仍如实展示数值及负收益；current 与 previous 分别计算。
- 不修改真实账本、回执、预算、原期限、许可、关停效果、outcome、默认开关或旧记录。
- `tailStatus` 仍为原先披露的 `unverified`，本次不伪造尾部结清，也不增加自动归约或运行时验收能力。

## RED → GREEN

证据目录：`.superpowers/sdd/2026-10-24-economic-settlement-summary/`。

| 验证 | 结果 |
| --- | --- |
| 首轮模型 RED | 9 项，1 通过 / 8 失败 |
| 增补应用失败边界后的模型 RED | 11 项，1 通过 / 10 失败 |
| 真实服务链 RED | 2 项失败：原摘要分别返回 0、-1550，而预期为 null |
| 定向 GREEN | 13/13，含 JSON 重载、旧轮隔离、已结算负收益 |
| 完整 node:test | 733/733，0 fail / 0 skipped / 0 cancelled |
| smoke / room-governor | 均通过 |
| 仅构建 | 隔离输出成功，无上传 |

完整运行在 HTTP/HTTPS/TCP/TLS/fetch 禁网钩子下执行，`network-attempts.txt` 未产生。测试中的引擎回调只保存快照，断言在回调外执行；没有手填安全计数来制造采运成功。

验证脚本首次启动在进入 smoke 前遇 Windows `--import` 绝对路径的 URL 格式错误。改为 file URL 后，在 `verification-02/` 中完整重跑并通过；原失败日志保留，不算业务回归失败或通过证据。

## 构建产物与维护者检查

检查 root 构建配置时触发了 `rollup-plugin-clear` 的构造期清理。此前已经备份两个固定候选产物，现已逐字恢复并核对哈希；此过程记录在 `candidate-restore.json`，没有将新构建伪装为旧候选。

后续先进入独立空工作目录，再导入原构建配置；clear 插件仅能作用于隔离目录中的 dist。新构建位于上述证据目录的 `build/`。原 root `dist` 最终为：

- main：`b956c91d84f40948bf1ef24e1ccc52faa5a50d42d17e4f04e24730709ae65dfa`
- map：`14ed51e5ff2a234545bebc66f572b76b677657847af7ad5e7953ea4ab0673de1`

新构建哈希：

- main：`fe576eee4781c774ed839b748bf8a7427230a523ceaf5f71f45a6c1287ccf1f4`
- map：`0b0df8ed504e516d0f038943853033806a2396ba1bd4a6c7de5dc243f90975f0`

维护者核对确认该摘要仅供 guard/native 只读报告消费，接纳与权限仍使用原完整事实和原始状态。本次不新增代理 review，不重构执行链，未修改旧混合目标进度文件。现有 Git HEAD 仍为 `c8ce36c`，新增修复未暂存。

## 尚未完成

本地修复不证明当前线上版本、关闭状态、真实母房入库或净收益。连接故障根因、当前母房补能、尚未接纳的中断恢复、tailStatus 自动归约和实际停止/恢复场景仍有缺口。完整测试及仅构建不能替代这些验收。

原固定候选和失败卡仅供追溯；本次源码已变化，不能绕过清单校验继续使用旧发布卡。未来发布需形成包含本修复的新候选，另获授权。后续先以证据明确剩余本地缺陷，再修复；运行时验收方案按用户最新要求另行设计，不自动重新联网。
