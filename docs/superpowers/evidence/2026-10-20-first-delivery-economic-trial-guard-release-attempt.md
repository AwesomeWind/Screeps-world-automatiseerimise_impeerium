# 首批入库经济守卫：发布预检未通过

本次已收到用户明确的提交、推送和部署授权，侦察、实际采运与Goal/Plan不启用。用户同时明确要求：先只读核对线上版本并备份，失败或发现意外变更就停止。

## 实际执行结果

执行现有只读SDK脚本 `quantity-sdk-readonly.mjs --backup`，同一次预检并行读取代码与分支，两项均返回HTTP502/ERR_BAD_RESPONSE，进程退出1。本轮只尝试一次，没有继续上传、重新开试点或更改网络配置。

因此未取得可靠线上版本/活跃分支核对，也没有生成本次备份。目录内最新备份仍是历史的2026-10-20T08-14-32.222Z，不作为当前服务器备份使用。不能由这次502单独推断鉴权失效、服务器代码变化或具体代理节点故障。

HEAD前后均为03464efee41b14723b7559f676a25e0225868d88，索引为空；未暂存、提交、推送或部署。没有生产console、线上Memory写入或开关修改；本轮也未能读取实际生产开关，不能把“未修改”说成“已新鲜核对关闭”。

## 保留的候选和后续

固定候选candidate-1792547136296、本地SERVICE_VERSION=1792547219792、源码摘要和ZIP均保留，见[候选核对](2026-10-20-first-delivery-economic-trial-guard-release-readiness.md)。本地512/512不因网络预检失败变成线上验收，也不替代服务器回读。

原发布授权继续有效。连接恢复或用户要求重试后，重新核对候选/源码，先完成只读服务器核对和新备份，再按原授权继续；出现意外版本变化仍停止。无需重复索要相同的提交/推送/部署授权。旧锁release、侦察/采运start及Goal/Plan启用仍未授权。

原始失败与流程状态保存在 `.superpowers/sdd/2026-10-20-first-delivery-economic-trial-guard/release-preflight-attempt-1.json`；其中UTC观察时刻来自clock工具，没有保存凭据或完整Memory。总体远程经济闭环仍未完成。

## 第二次独立预检

代码GET与分支GET成功，default仍activeWorld=true，旧SERVICE_VERSION=1792484139799，main/map均匹配上次已发布指纹；已生成新备份：D:/MyCode/screeps_world/automatiseerimise_impeerium/.worktrees/release-backups/2026-10-21T01-56-21.490Z/server-code.json。

随后只读原生观察在HTTP鉴权GET阶段15000ms超时，尚未进入WebSocket或发送console；不能说成WebSocket连接失败。为核对同一组控制字段，改用SDK选定Memory GET，但该请求返回HTTP502。实际运行版本/开关因此仍缺可靠新样本，本次没有进入暂存、提交、推送或部署，也未修改任何线上Memory或共享代理配置。

本轮源码与候选未改。代码备份成功是具体进展，但不能代替控制状态核对。原授权保留；后续优先使用无需console握手的SDK只读Memory证据，再完成新鲜代码/备份校验，所有门槛满足才继续。失败样本不拼接成连续观察，不自动启用侦察/采运/GoalPlan。详见release-preflight-attempt-2.json。

## 第三次预检与阻塞结论

SDK选定Memory GET仍HTTP502。另检查用户此前授权的Screeps浏览器页：独立Chrome DevTools桥因DevToolsActivePort缺失不可用，但Chrome扩展可以发现并连接正确房间页面，不能将这两种通道混为一谈。

扩展的AX/截图可用，DOM辅助读取在Runtime.evaluate超时。内存树没有展开出可验证字段；随后通过可见控制台输入一次628字符的纯只读版本/开关表达式（tag=[RELEASE_BROWSER_PRE_1792548704210]）。只看到客户端命令回显，未观察到服务器运行结果；接受状态未知，没有重复提交。不能将页面可见、命令回显或房间截图当成开关已核对。

本轮仍未暂存、提交、推送或部署。唯一浏览器console表达式只读取字段并console.log，不含战略Memory写入、目标定义、孵化/移动/建设/市场动作。截图：.superpowers/sdd/2026-10-20-first-delivery-economic-trial-guard/browser-preflight-no-result.png。详情见release-preflight-attempt-3.json。

同一运行数据回读条件连续三轮阻塞后，已调用update_goal并确认blocked；总体目标未完成。原发布授权继续保留，候选及已取得的代码备份保留。网络或页面数据通道恢复后再从新鲜预检继续，不自动换代理、不重复索取相同发布授权，也不重复提交接受状态不明的既有只读查询。

## 2026-10-21 临时 A02 预检（第四次）

用户单独授权临时将共享选择器从 A01 切至 A02，先预检，通过才发布，成功或失败后恢复。实际于北京时间 11:09:52 切换、11:10:22 恢复；控制器 GET 已确认回到 A01，共享配置文件前后 SHA-256 相同。未修改 TUN、DNS、规则或订阅。

A02 下 SDK Memory GET 成功：telemetry tick83776870、版本1792484139799；remoteMining=false、GoalPlanning=false、Governor shadow=true、scheduler.enforce=false、market=false；W48N41 enabled=false/hold=true，矿工和运输者额度0，allowRecon/allowEconomicDeparture均false，Goal namespaces为空，经济守卫policy与state尚不存在。旧侦察托管请求仍保留，但current为aborted，关闭tick83761727；不能因enabled=true就说侦察仍在运行，也不擅自释放旧锁。

同轮代码/分支组合GET失败（HTTP502，退出1），没有完成本次新备份。原生只读releaseFlags流程已通过HTTP/WS鉴权后，在console POST返回502；这由run内错误位置及控制流确定，没有另存成功握手阶段日志。只读查询服务器是否接受未知，accepted=false仅表示未取得肯定响应，未重发。没有战略Memory或游戏动作写入。

按“预检失败停止”约定未进入暂存、提交、推送和部署。HEAD仍03464efee41b14723b7559f676a25e0225868d88，索引为空。原发布授权保留；本次临时切换已结束，后续连接与备份门槛仍需重验。A02首页成功不能推出发布链路稳定，Memory成功也不能替代服务器代码与备份核对。原始证据：release-preflight-attempt-4.json、release-state-predeploy-1792552208122.json、failure-1792552214551-1.json、temporary-selector-release-state.json。
## 2026-10-21 A01 只读恢复检查（第五次）

北京时间约11:21，确认选择器仍A01后，只读代码及branches GET成功；default activeWorld=true，版本1792484139799及main/map均符合旧部署预期。生成新备份：D:/MyCode/screeps_world/automatiseerimise_impeerium/.worktrees/release-backups/2026-10-21T03-21-21.394Z/server-code.json。随后SDK选定Memory GET再次HTTP502，不能以约12分钟前的A02开关样本代替本次新鲜预检，故停止发布。

本轮未再切换节点，也未重发任何console查询。完整执行package.json的三段测试入口，smoke/Governor退出0，Node 512/512、无fail/skip/cancel；当前全部源码输入摘要与固定候选一致，两个模块哈希匹配。npm启动器路径首次取错、未实际开始测试，已保留失败日志，再通过bundled Node逐条执行同一package测试命令；不是忽略失败测试。未重新构建或改变候选版本。

仍未暂存、提交、推送或部署，线上开关未写入。详情和备份文件哈希在release-preflight-attempt-5.json；本轮只证明代码/备份读取恢复，尚不能宣称完整发布通道恢复。
## 后续有限恢复检查与停止自动重试

整段Memory GET失败后，较小的empire.control也曾失败；最后一次control读取成功，返回旧版本1792484139799、remote=false、goal=false、shadow=true、enforce=false，目标namespace为空。但补齐四个必要子树的组合读取及新的代码/分支备份均再次502。因此无法取得同轮完整发布预检；不能只用部分成功或历史备份宣布可以发布。

本次新增read-release-state-split.mjs仅对本地只读检查器按四个子树读取，并保留相同关闭条件；没有改生产源码、Memory或候选。没有推断请求大小就是502原因。全部子进程均已退出，未提交、推送、部署或启用。相同门槛连续三轮未取得实质进展后标记目标blocked，停止自动重试；原发布授权及固定候选保留。等待连接实际恢复，再完成全部门槛。
