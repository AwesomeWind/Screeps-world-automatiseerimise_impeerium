# 首批入库经济守卫：待发布候选核对

所属设计/计划日期：2026-10-20。当前仅完成离线发布准备，没有提交、推送、上传、生产console或在线Memory写入。总体远程经济闭环尚未完成。

## 本轮实际成果

- 分支codex/single-remote-mining，HEAD仍为03464efee41b14723b7559f676a25e0225868d88；索引为空，功能与文档改动仍在本地工作区。
- 当前源码重新执行smoke、room-governor、完整Node集合，均退出0；Node为512/512，无失败、skip或cancel。
- dry build子进程显式移除DEST/ROLLUP_WATCH，输出“未指定目标，代码将被编译但不会上传”。源码输入在验证前后SHA-256一致。
- 固定候选ZIP及11个白名单文件，每个ZIP entry均与候选目录原文件逐字节哈希一致；未包括.secret、凭据、线上Memory或start/release命令。

## 候选身份

| 项 | 值 |
| --- | --- |
| candidate | candidate-1792547136296 |
| SERVICE_VERSION（仅本地） | 1792547219792 |
| source输入摘要 | 1aea9bac207542aee119ff440a66e17e2c31819f742c5b3b55c07ffa4e1239da |
| main SHA-256 | 66fefc585207e16b1da8ecf91ed743983ee54836692ee069c1728790e8aee335 |
| main.js.map SHA-256 | d82de9c03791c5a41a2c8ed7dfa805cc75a269162f6ba14c6de548365b4d85ca |
| ZIP SHA-256 | 2f6fb0d36d7c5a961e41731c867740ff618bcc637d49cb72ae8b66305aa5f3a8 |
| ZIP字节 | 439642 |

本地文件：[候选ZIP](../../../.superpowers/sdd/2026-10-20-first-delivery-economic-trial-guard/release-candidates/candidate-1792547136296.zip)、[manifest](../../../.superpowers/sdd/2026-10-20-first-delivery-economic-trial-guard/release-candidates/candidate-1792547136296/manifest.json)、[压缩包校验](../../../.superpowers/sdd/2026-10-20-first-delivery-economic-trial-guard/release-candidates/candidate-1792547136296-archive-verification.json)。脚本、原始测试/构建日志和源码逐文件摘要也保留在该SDD目录。ZIP中包含main.js、main.js.map.js、manifest/source-inputs/verification、README和测试/构建日志；模块名为main与main.js.map。

首次包装校验错误地要求source map带module.exports前缀，实际项目产出为JSON内容；已按真实格式解析校验version=3/sources，并保留首次记录。未修改构建器、源码或产物格式。修正只涉及本地包装脚本；恢复时核对同一源码摘要和原测试日志哈希，重新dry build绑定最终候选，没有重复执行已证实相同源码的测试。

## 关闭约束与已知缺口

来源默认配置已核对：economicTrial=false/request=null，reconTrial=false/request=null，remoteMining=false，goalPlanning=false，Governor shadow=true，scheduler.enforce=false。它们是源码默认值，**不是本轮线上开关回读**；持久化Memory不能靠重新部署默认配置自动改写。

已完成一次只读review及5项Important修正；未追加第二次review。保留Minor：tailStatus自动归约尚未实现，当前unverified，不能将控制关闭视为全部在途收尾结清。期初库存与新产出仍须分列，newProductionConfirmed缺证据为null；本地mock 400不能当作线上经营收益。

新结算版本完整侦察工程验收仍欠；历史49/100及中断段不能当成100或长期安全。实际采运与Goal/Plan继续不启用，候选包不包含任何线上目标定义、旧锁release或试点start。

## 发布前需要明确授权的动作

候选供用户审阅。下一阶段仅在获得明确授权后：

1. 精确暂存本次功能及必要设计/回归/交付文件，排除历史无关未跟踪文档；提交并推送指定分支。
2. 只读核对服务器代码/活跃分支并备份，确认没有意外版本变化且连接足以回读。失败时停止，不用本地dist猜线上状态。
3. 将已批准源码与固定候选摘要核对后部署到screeps.com/default；如果重新构建，重新记录SERVICE_VERSION及main/map哈希，不能冒充本候选。
4. 只读核对实际执行版本、侦察/采运/Goal/Plan仍关闭；不创建目标、不写战略Memory、不启动新侦察或采运。

提交/推送/部署授权不等于启用授权。后续有限侦察、旧锁release、经济试点start和线上验收均保留对应门槛。本轮不发出这些生产动作。
## 2026-10-21 发布前最终核对与候选替换

用户已明确授权提交、推送、默认关闭部署，并单独授权一次临时A02切换及恢复；该切换已结束、恢复A01且共享配置文件哈希未变。北京时间12:09:54的完整Memory样本controlsClosed=true；12:10:08代码/分支GET确认default activeWorld=true，旧SERVICE_VERSION=1792484139799，main/map匹配，并保存新备份2026-10-21T04-10-08.562Z。没有释放旧侦察锁或写线上目标定义。

精确暂存时，git diff --cached --check发现新增文件EOF多余空行；之前空索引检查未覆盖它们。已仅规范EOF换行，重新完整执行smoke、Governor、512/512及dry build，两项diff检查通过；旧候选保留为历史，不冒充最终发布产物。新旧源码以去除EOF换行后逐字节比较，逻辑内容不变。

最终候选candidate-1792555923833：SERVICE_VERSION=1792555927985；源码摘要3229077ec54684baee2feea1bd72adc1685fbf45c15ceaed459348675a8ed00f；main=74ee3269ab7b8c4c11827602c68cfbd39de3d2627c43bf84c2468da9eb8e6bd9；map=fe59ff42a273cf29eb8ff9520a15437404c044cd01d37cd9c4f3b284cb094e93；ZIP=01566d3c32d37c37c2375fe07b4b4f191f7be94659e2b9a1f4d4bba0064e121a，10个entry逐个核对一致。测试与构建日志随新包绑定。

Git origin的SSH只读查询失败；仅此进程改用同一GitHub仓库HTTPS地址，未修改origin或共享配置。远端codex/single-remote-mining仍03464efee41b14723b7559f676a25e0225868d88，无意外前进。现进入已授权的提交/推送步骤，部署结果将在后续发布记录单独说明。所有启用权限仍未授予；tailStatus Minor与侦察49/100缺口继续保留。
