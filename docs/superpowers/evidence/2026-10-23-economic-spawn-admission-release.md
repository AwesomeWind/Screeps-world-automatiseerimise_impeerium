# Spawn仲裁后接纳修复：关闭状态发布与兼容核对

2026-10-23，Asia/Shanghai。按用户明确授权完成定向提交、推送及screeps.com/default单次代码部署；随后只读核对实际执行版本、关闭权限及旧会话。**本轮没有启动试点、release旧会话、改线上准备/战略Memory或调整共享网络。**

## 发布结果

- 逻辑提交ff60562aabdf714bcac4bcce1fe5b4fcfd375553，分支codex/single-remote-mining，已推送并在上传前ls-remote确认。
- 15份文件定向提交：本次产品/测试/说明，以及设计、计划、诊断、验证和直接相关的原失败试点报告；保留旧混合目标进度和其他历史草稿，未git add -A。未修改主目录main。
- 发布前复跑完整674/674、smoke、Governor，均exit0；源码/构建哈希与本地验证manifest一致。没有重新构建改变版本号，没有运行npm run push或旧恢复脚本。
- 最终SERVICE_VERSION：1792733742635。
- main SHA-256：e3c6eb0726c31d2bf1639e61d1594ab85ed6b45a16ec639102729c26d52f2b03。
- main.js.map SHA-256：3391bdf78f3fbb4b608c1bfbfdf6cb616981a1511ab2d4ae25b7ea82f72682c8。
- default activeWorld=true，上传一次、回执ok；SDK GET指纹与固定产物相符。上传前实际服务器代码已独立备份；没有自动重传或回滚。

## 有界只读窗口

| 窗口 | ticks | 原生窗口耗时 | 结果 |
| --- | --- | --- | --- |
| 完整发布基线 | 83818248 | 12438ms | 原运行1792719819692，记录/归档/关闭兼容 |
| 上传前刷新 | 83818280～83818281 | 11618ms | 旧记录摘要未变，源代码指纹仍为原部署 |
| 上传后 | 83818317 | 7967ms | 实际执行1792733742635，关闭状态及旧值保留 |
| 后续独立复核 | 83818396 | 16508ms | 新版本及关闭权限稳定，旧记录摘要仍一致 |

各成功完整窗口独立tag/连接，包含连接、原生读回与节点复核，≤30秒、tick跨度≤10；代码GET为独立样本，不冒充同tick运行事实。四探针读取status/home/runtime/health，原生表达式均按serialized≤1024离线校验。后续复核前两次读回失败，保留失败样本，第三个完整窗口通过；没有拼接中断片段、重复上传代码或把API读回当页面验收。

最初两次检查套用了采运启用所需的recovery=normal，因母房spawn_energy被拒绝，保留原失败样本。只读补充证据表明stock874000、critical5000、core2/3、Controller>149000、无敌情/blockedBy，发布检查据此明确区分关闭发布与启用：关闭发布可在有储备且无核心危机的spawn_energy下进行，试点仍必须normal。没有改母房状态、降低30秒/10tick门槛或以发布许可开启采运；具体裁定和数据在release-health-ruling.json。

## 旧会话与关闭事实

部署后确认remoteMining.enabled=false，W48N41 enabled=false/hold=true，allowRecon=false、allowEconomicDeparture=false，远程actor与accepted均0。nativeTrialOps.enabled=false；Goal/Plan enabled=false、inactive且目标namespace未创建；市场false，Governor shadow=true、scheduler.enforce=false，无已观察到的runtime errors。

econ-w48-20261023-01/seq3/epoch2/原codeVersion1792719819692仍terminal、managed=true，原stopReason=spawn_request_expired，closureVerifiedAtTick83815769保留；确认成本50、unknown0、入库0，没有新增收支。此前seq1会话仍在previous，仅原合法release的managed=false；其成本50没有合并进当前会话。

current/previous、economic设置/序列、完整native state与请求、高水位、recon current/previous与release设置按稳定排序摘要逐项前后匹配；候选Model验证两个原namespace均合法。原native档案的已确认旧准备、完整旧current和旧绝对期限也逐字段匹配编译profile。

economicTrial.enabled=true及reconTrial.enabled=true是已结束start守卫/旧release的协议锁存，保留原请求、managed锁和证据；它们没有实际出发或孵化权限，没有为显示所有位false而清零。

## 母房与复试准备

发布后独立事实仍为recovery=spawn_energy，stock874000、miner2/hauler3、Controller在首次/后续复核为149654/149575，terminal6ad0b55bceeb3db0d3b4dda0/free300000。核心无危机不等于采运准备通过，spawn能量回填和恢复normal仍需核对。

另做两项禁止网络的本地评估，不改变已发布产品：

1. 把当前已用native terminal与假设新id/seq5交给原纯Model，effects为空、原state不变；编译profile拒绝seq3→release4/start5。原入口是一次性的，不能直接换id重开。
2. 真实服务链的本地Game模拟先完成一次native轮次，旧actor以测试退休输入离场，合法release4接受，但start5仍被旧native控制以native_ops_control_changed拒绝；旧native记录保持不变。证明后续换轮还需解决旧native窗口/控制的会话所属隔离。

这些是新一轮启用准备的限制，不影响当前终态记录兼容保留；本轮没有擅自增加换轮功能、修改profile、清高水位或执行任何线上试点动作。详细[复试准备方案](../plans/2026-10-23-post-spawn-admission-first-delivery-retest.md)明确阶段门槛，当前不可执行，需要先审阅有界换轮及隔离设计并恢复母房normal。

## 证据与未验收项

独立证据目录.superpowers/sdd/2026-10-23-economic-spawn-admission-release/：local-verification、各窗口原样本、pre-upload备份、单次deploy intent/ack/readback、retained摘要及两份离线entry assessment。旧冻结目录仅只读，凭据未输出或纳入Git。

当前A02各窗口前后匹配，Git通过单命令HTTPS代理参数推送，remote URL和共享网络配置未改。有限HTTP/WS成功不是持续连接稳定或经营验收。

本轮手工游戏Memory写入0，试点请求0，release/start0；只上传代码。没有新侦察/矿工运输实测、入库、净收益、断网恢复或10000tick验收。上轮净值-50及tailStatus=unverified仍保留，经济总目标没有因此完成。
