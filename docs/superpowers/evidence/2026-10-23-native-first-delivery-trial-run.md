# W48N41游戏内一次性经济试点：已关闭，未入库

2026-10-23，Asia/Shanghai。用户明确授权本轮归档并取代已知旧准备、合法release及单次启动；实际执行一次，已因miner孵化请求过期自动关闭。**本轮未通过首批入库验收，不自动重试。**没有提交、推送、部署或修改共享网络配置。

## 本轮身份和固定窗口

- 运维id：nops-w48-20261023-01。
- economic identity：econ-w48-20261023-01 / sequence3 / W49N41:W48N41 / epoch2 / codeVersion1792719819692。
- 逻辑代码仍为b3a7af9，Git HEAD仍ff83340；原发布main/map指纹在本轮重新GET核对匹配，default仍activeWorld=true。
- 原固定窗口：2026-10-23 10:41:16.756开始，12:09:16.756停止经营，12:11:16.756总截止。预检和准备计入窗口；未延期。
- 首次预检发现母房miner正在自然补员，remainingTime17，未发送生产请求。等待其出生后，在同一目录、原窗口内重新完整预检；没有重做已确认的生产请求，没有新建第二试点。
- 启动前新鲜预检tick83815604～83815605：Controller150000，coreUsable为miner2/hauler3，coreUpcoming均0；Spawn空闲，孵化/基建滚动已用预算均0，无未决grant或unknown；真实terminal6ad0b55bceeb3db0d3b4dda0，free300000。
- 两条预检代码GET及所有原生读回的代理前后核对均为美国A02。保持Goal/Plan和市场关闭、Governor shadow=true、scheduler.enforce=false。

## 单次交接与实际运行

| 证据 | tick / 时间 | 已确认的行为 |
| --- | --- | --- |
| 外部唯一请求 | 10:43:17.687收到ok | 完整18字段，serialized711；只发送一次，不分片 |
| 归档 | 83815609 | 原request、旧完整current、旧绝对截止保存到native档案 |
| 合法release | 生效tick83815611 | lastSequence变2；旧current只将managed改false，其余逐字段保持 |
| 新start接纳 | 83815613 | 新sequence3接纳，固定经济期限83816613，唯一scout孵化调用一次 |
| scout出生 | 83815616 | W49N41(30,23)，不是把accepted当出生 |
| 首次实际移动 | 83815624 | 后续离散样本从母房内移向东侧出口 |
| 真实跨房/source视野 | 83815650 | scout进入W48N41，取得真实source视野 |
| 本轮100安全ticks | 83815749达到，后续样本确认 | safeStartedAt83815650，独立safeStreak100，未继承旧轮计数 |
| 原经济守卫停止 | 83815768 | aborted / spawn_request_expired，closeAppliedAtTick同tick |
| 原经济关闭确认 | 83815769 | closureVerifiedAtTick，native随后保存terminal与controlClosureConfirmed |
| 首个完整终态读回 | 83815774 | native terminal、实际侦察/采运权限关闭 |
| 后续独立关闭复核 | 83815802 | 权限仍关闭，scout在母房(44,29)，没有第二次启动 |

完整归档额外只读审计在tick83815627通过：archive.request等于旧已确认准备、archive.current等于原已知完整current、originalWindow原值不变且归档tick早于release；economic previous等于旧current仅managed=false；旧recon current保持原样。

新Game视野下的路线计算valid=true，scout/hauler去回估计36/36 ticks、miner37/36，低于原leg上限300。它证明本轮真实视野下的路线计算，不等于miner/hauler实际往返；二者本轮均未孵化。

## 收支与额度隔离

| 项目 | 本轮确认值 |
| --- | ---: |
| scout原生孵化调用 / 费用 | 1次 / 50能量 |
| miner原生孵化调用 / 费用 | 0次 / 0 |
| hauler原生孵化调用 / 费用 | 0次 / 0 |
| 基建费用 | 0 |
| 确认pickup / 入库 | 0 / 0 |
| unknownEvents / unknown上界 | 0 / 0 |
| knownNetEnergy / netEnergy | -50 / -50 |

firstDelivery=null、openingContainerEnergy=null、newProductionConfirmed=null；没有虚构采矿产出。旧会话原成本50保存在archive及economic previous，未进入本轮费用；operation.ledger.spawnEnergyConfirmed=100是跨轮累计，不能当成本轮成本100。本轮原经济摘要的费用和净额为上述50/-50。

## 失败证据及判断边界

新miner slot绑定requestId=remote:W49N41:W48N41:2:9，原deadline83815767；终态calls=0，没有name、engineAcceptedAt或费用回执。tick83815768原Model据此以spawn_request_expired停止。不是原生孵化报错后重试，也不是预算unknown。

母房Spawn同时用于hauler_83815762_Spawn1_0，tick83815786实测needTime30、remainingTime6；该占用覆盖miner请求有效区间。按RemoteMiningService固定deadline=Game.time+5的生成逻辑，miner请求约在83815762建立，与母房补员占用时间重合。生产链在analyze阶段先绑定remote请求，再由后续Spawn仲裁实际执行，当前证据支持“请求绑定后遭母房补员竞争，5tick原期限先到”这一解释。

**直接失败条件已经确认；完整仲裁根因尚未做本地复现。** 下一步应优先核对请求绑定和Spawn实际选择之间的时序、母房核心补员优先级及未执行请求的额度语义。不能简单延长原5tick期限、手工再孵化或重发同一请求。本次没有修改实现、预算、deadline或游戏配置来追求成功。

## 关闭和尾部边界

最终新鲜样本tick83815802：

- nativeTrialOps.enabled=false；native运维stage=terminal，controlClosureConfirmed=true。
- remoteMining.enabled=false，W48N41 enabled=false/hold=true；operation.allowRecon=false、allowEconomicDeparture=false、status=disabled。
- Goal/Plan enabled=false、global状态inactive，目标namespace未建立；市场false，shadow=true，enforce=false。
- 母房recovery=normal、miner2/hauler3、coreUpcoming均0；scout已回W49N41、能量0、仍存活。
- economic current仍managed=true/terminal；economicTrial.enabled=true保留原start守卫锁存，reconTrial仍为旧release锁存。二者没有出发或孵化权限，不为追求所有存储位false而清锁。
- outboxCount和unsettledOutbox均0，但tailStatus仍unverified；没有将控制关闭或scout回母房冒称尾部已结清/已回收。

本轮外部只写过一次完整native入口请求；没有外部stageRelease、额外release/start、hold写入或未知写入重放。内部归档、release、start和关停由已部署守卫按本轮授权执行。原外部旧锁/日志全部保留，不删除或改写原许可。

## 证据目录和采样限制

独立目录：.superpowers/sdd/2026-10-23-native-economic-trial-single-run-card/run-01/。

execution-lock.json保留原固定时间；submission-intent/ack保留唯一请求；handoff-audit.json及archive-check保留逐字段审计；29份watch结果、final-result.json和closure-readback记录运行及关闭。只读探针分别使用独立tag与连接，每个成功窗口≤30秒、tick跨度≤10，不拼接。第29次读取的第一次原生读回失败，保留失败段；第二个完整窗口在7765ms内成功，未重放业务写入。观察过程是离散API窗口，不是浏览器验收或外部连续采集。

本次未做新代码测试或构建，因为未改产品代码；既有631项本地验证与本轮真实运行证据分别留存。已结束本轮观察，不自动继续试点、启用Goal/Plan、提交或部署。
