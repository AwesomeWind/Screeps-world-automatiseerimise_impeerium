# 显式换轮修复：默认关闭版本发布准备

2026-10-23。仅完成离线发布准备，**尚未获本版本提交、推送、联网预检或部署授权**。没有启动侦察、采运、Goal/Plan或市场；本报告也不是生产执行卡。

## 已固定候选

- 工作树：C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium；分支codex/single-remote-mining，HEAD919ec9f6be5866a6bae5e61d81ba11b72480b7f8不变，index为空。
- 本地SERVICE_VERSION=1792741537648。
- main SHA-256=b956c91d84f40948bf1ef24e1ccc52faa5a50d42d17e4f04e24730709ae65dfa。
- main.js.map模块文件dist/main.js.map.js SHA-256=14ed51e5ff2a234545bebc66f572b76b677657847af7ad5e7953ea4ab0673de1。
- 完整720/720、smoke、Governor、仅构建和语法检查通过；一次独立review的2项Important已由主代理RED→GREEN修复，后续维护者故障回归也通过。没有为本次准备重新构建或改变版本号。

本轮重新计算completion.json内全部源码/产物哈希，一致。直接用冻结的历史生产v1 terminal记录和新候选codeVersion调用纯Model，原state完全保留、effects为空；只证明关闭版本兼容，不是新鲜线上状态或当前母房健康。

## 精确提交范围

release-readiness-audit.json保存19份意向文件的逐项哈希：9份服务源码（包含原Model转Legacy及新wrapper）、package、两份模块AGENTS、四份测试/fixture文件，以及设计、计划和本地验证报告。本准备文档另作第20份文件。

不使用git add -A；不把原混合目标进度、其他旧草稿、dist、.superpowers、旧锁/日志、历史发布备份或凭据纳入提交。KnownPreparation/Profile/EmpirePolicy/main保持基线原内容，不因新轮改历史常量。未来执行前仍须逐项重新核对上述范围，不能以这份清单覆盖后来的人工修改。

## 获授权后的发布次序

1. 才开始有限联网预检，保持当前节点、不改共享网络。确认Git分支/上游、服务器default活跃分支及实际代码/运行版本、执行关闭权限和旧会话原值；有限失败即停止，不重放未知写入。
2. 预期原部署来自上次已验证版本1792733742635，main=e3c6eb0726c31d2bf1639e61d1594ab85ed6b45a16ec639102729c26d52f2b03、map=3391bdf78f3fbb4b608c1bfbfdf6cb616981a1511ab2d4ae25b7ea82f72682c8。这是待核对的历史基线，不是本轮联网确认；意外变更则停止，不自动覆盖。
3. 保存原服务器代码备份。只定向提交已审阅文件并推送，回读远端提交；不夹带任何试点启动、战略Memory写入或profile更新。
4. 仅上传固定候选一次。结果不明只按原身份/服务器产物读回，不自动重传或回滚；不运行会再次构建改变版本的npm run push。
5. 独立只读核对服务器main/map、实际Game执行版本和默认关闭状态，确认旧native/economic/recon current/previous、费用、原期限、高水位和原协议锁存未被迁移。原始start/release的enabled锁存不为“全false”展示而清除。
6. 交付发布报告和下一轮复试准备建议，**暂不release旧锁、不写新目标或请求、不启动试点**。外部读取使用原30秒/10tick新鲜度要求，不拼接失败窗口，不能用API/源码哈希冒充页面或经济验收。

## 剩余条件与披露

母房曾为spawn_energy，新鲜normal状态和补能问题仍待实际核对。归档最多4份/总65536字符、拒绝记录16项，可能先触字符预算而拒绝；完整小体积第五轮计数边界并未单独构造，见本地报告。尚未接纳的中断恢复与tailStatus自动归约也未新增能力。

这些不能靠默认关闭发布判为通过。实际采运需要发布后的新鲜预检、明确新日期时间窗和另一份启动授权；仍最多1新scout、1miner、1hauler、新独立100安全ticks，沿用原预算/期限/严格次tick入库，首批、unknown或异常即停。

证据：`.superpowers/sdd/2026-10-23-native-economic-successor-handoff/release-readiness-audit.json`、completion.json和[本地验证报告](2026-10-23-native-economic-successor-handoff-local-validation.md)。本轮网络/生产写入0，提交/推送/部署均未执行。
