# 结算及来源金额损坏：本地修复

2026-10-24。按用户最新要求继续本地修复，远程连接与线上验收暂缓。没有联网、提交/推送/部署、写生产 Memory 或修改共享网络。

## 已确认的问题

经济会话校验已要求主费用和收入计数为非负安全整数，但没有同样校验这些金额：

- `infrastructureUnknownUpperBound`
- `logisticsUnknownEnergyUpperBound`
- `tailReturnedEnergy`
- `pickups` 和 `delivered` 来源表中的逐笔金额

缺少输入校验使损坏值可能进入 `|| 0`、加法和比较；例如数字字符串可能被当作零或发生隐式拼接/转换。两项本地服务链复现分别把物流未知金额写为 `'0'`、来源表金额写为 `'100'`，原动作前检查仍返回 allowed=true。

## 修复

在既有 `validEconomicTrialState` 中统一校验上述金额。若字段存在，每个值都必须为非负安全整数。

缺省可选字段继续保持 absent；合法的数值 0 和整数来源数据继续接受。字符串、null、NaN/Infinity、负数、小数、布尔值或对象都不转换、不截断、不归零，而按原 `state_invalid` 路径拒绝许可并执行原 emergency_close。

校验发生在状态复制和证据归约之前，损坏原值保留。JSON 重载将 NaN/Infinity 自然序列化为 null 时，重载后的值仍被拒绝。没有新增真实账本写入、退款、回执重放、身份迁移、自动历史修复或扩大权限。

生产 `applyEconomicResolution` 通过纯模型事件路径调用，因此修复放在统一状态校验层，没有在多个算术入口散加 Number 转换或 fallback。

## RED → GREEN

证据目录：`.superpowers/sdd/2026-10-24-economic-evidence-amounts/`。

| 验证 | 结果 |
| --- | --- |
| 新增 RED | 44 项，2 pass / 42 fail |
| 定向 GREEN | 44/44 |
| 完整 node:test | 799/799，0 fail / skipped / cancelled |
| smoke / room-governor | 均通过 |
| 隔离目录仅构建 | 通过，无上传 |
| 禁网钩子 | 没有记录网络尝试 |

新增覆盖为：五类金额位置各八种损坏值、旧字段缺省与合法零值/来源数据，以及两项真实模块服务链中的动作前撤权和 JSON 重载。runtime 用例先确认合法任务原本可获许可，再注入损坏，验证动作前关闭、不产生额外引擎调用、原记录不被修复或清除，重置后仍为 state_invalid。

保存的历史 tick 83821434 的 economic/native 两份记录通过离线兼容检查，原净差额仍为 -50，两个原对象不变；该检查不证明当前线上状态。结果保存在 `historical-record-compatibility.json`。

## 交付与限制

本次完整验证同时包含此前结算摘要、提交失败仍关停、尾部期限三项本地修复。隔离构建输出：

- main SHA-256：`93a7054b24cfe246194ed4a4c865490a7c75ecca3931ad4561825dc1a8b652dd`
- map SHA-256：`6b9b6aafa02066f6de0bd72fae3fa9c23dc6379d13b76f940279e1b10167dfab`

root dist 中的原固定候选最终哈希继续匹配原清单。Git HEAD 仍为 `c8ce36c`，所有本地修复未暂存、未提交；没有修改旧混合目标进度文件，没有新增子代理。

本次只证明金额类型和原失效处理契约，未增加尾部自动结清、金额修复、完整来源重建或新的运行时验收能力。合法整数本身不证明真实经营成功；真实入库、费用/unknown/净收益、停止恢复及长窗口场景仍须未来的运行时证据。不能将本地 799/799 或 dry build 当作这些验收，也不能以旧授权自动部署当前源码。
