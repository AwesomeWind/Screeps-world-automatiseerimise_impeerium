# 游戏内一次性经济试点入口：默认关闭发布

2026-10-23，Asia/Shanghai。按用户明确授权完成本次功能的提交、推送和screeps.com/default单次部署；随后只读核对实际运行、开关与旧准备兼容。**没有取代旧准备、release旧锁或启动试点。**

## 发布与验证

- 逻辑提交：b3a7af9fcb599201e6cb4ce9651aea6f21593168，分支codex/single-remote-mining，已推送并通过ls-remote读回。
- 26份本次相关文件定向提交，既有混合目标进度修改和其他历史草稿保留，未打包进本次代码提交。主目录main未修改。
- 发布前复跑完整631/631、smoke、Governor，均exit0；deny-network preload验证，源码与已验证manifest一致。沿用此前仅构建的固定产物，本轮没有重新构建或改变版本号。
- SERVICE_VERSION：1792719819692。
- main SHA-256：a38f9728b90acd022817e216cd01e7879fb8ac7e8fd7388f5d0a0d72b3adb49d。
- main.js.map SHA-256：de8becbf927af0d389d49971e77e27030c26614b812ba974a65e6dd620e7caec。
- default activeWorld=true；上传次数1，回执ok，SDK GET代码及map与固定产物匹配。上传前已备份实际旧服务器modules；没有自动重传或回滚。

旧部署版本1792636618804及main/map原指纹在本次新鲜预检中实际匹配。备份、单次发送intent、回执和GET结果都保存在独立目录.superpowers/sdd/2026-10-23-native-economic-trial-operations-release/，未改旧冻结目录。

## 只读游戏事实

| 独立窗口 | Game ticks | 原生读回及代理核对耗时 | 结论 |
| --- | --- | --- | --- |
| 发布前基线 | 83815334 | 7444ms | 原部署版本、关闭权限与旧记录匹配 |
| 上传前刷新 | 83815377～83815378 | 8871ms | 旧准备/经济/recon摘要与基线一致 |
| 部署后 | 83815392 | 7427ms | 实际执行1792719819692，默认关闭及兼容性通过 |
| 后续独立复核 | 83815436 | 11425ms | 新入口仍关闭、无运维namespace，旧准备与费用摘要仍一致 |

各窗口有独立tag、两条独立连接，最大tick跨度1；原生窗口含连接建立和读回，均未超过30秒。源码GET/branches为另一次读取，未冒充同tick原生事实。上传前刷新第一次原生读回失败，保留独立失败样本，第二次重新完整读取通过；没有拼接、放宽新鲜度或重复生产写入。这些是离散窗口，不是连续运行或安全验收。

部署后实际核对：

- nativeTrialOps={enabled:false,request:null}；nativeEconomicOps namespace不存在，global.RemoteTrialOps.status为function且结果null。默认发布未创建运维会话或执行旧准备迁移。
- remoteMining.enabled=false，W48N41 enabled=false/hold=true；operation.allowRecon=false、allowEconomicDeparture=false；economicTrial.enabled=false。远程actor与accepted均0。
- Goal/Plan enabled=false、status=inactive，control.goals/plans/goalPlanningState仍未创建；市场关闭，Governor shadow=true、scheduler.enforce=false；未观察到runtime errors。
- 母房仍为己方，无hostile，Controller=150000；真实terminal id=6ad0b55bceeb3db0d3b4dda0，剩余容量300000。

旧reconTrial.enabled=true连同release请求是旧协议的合法释放锁存，已精确核对保留；它没有实际侦察权限，不能直接清零以伪造所有存储位均false。

## 旧准备与费用兼容

部署前后对economic current/previous、lastSequence、economic settings及recon current/previous、lastSequence、release锁存做完整内容的稳定排序摘要对照，全部一致；同时以候选原Model验证旧economic store合法，并与编译profile逐字段匹配。

旧经济记录仍为econ-w48-20261021-01 / sequence1 / epoch2 / codeVersion1792555927985，terminal且managed=true，原确认成本50、unknown0；不存在新轮费用。

已确认旧准备仍是release-econ-w48-20261022-01 / sequence2 / codeVersion1792636618804，configFingerprint为空，没有四个激活/截止字段。没有新准备、没有补填日期、没有重新stageRelease，原外部过期许可不续期。

关键持久摘要：economic current 0077ce7f90eb5659fb44ee5438f19214bfc6016fadc33e8158a367e52a1c1c1f；economic settings 99c5de586d35882954f94b83aa0aa4fcc66e942d1c7da2da6c877bb151cf42ae。其余完整摘要和原样本在pre-readonly.json、pre-upload-readonly.json、post-readonly.json。

## 连接与保留项

当前节点在各次实际读回前后均为美国A02。Git SSH握手超时后，改用单命令HTTPS代理参数，经现有127.0.0.1:7897成功推送；没有修改remote URL、共享代理、节点、TUN、DNS或规则。游戏鉴权、WebSocket101和tag读回通过只能证明这些有限窗口连接可用，不代表长期稳定。

本次只上传代码；控制Memory写入0，新入口请求发送0。生产侧对默认字段的补全由既有默认policy初始化完成；没有主动写入线上目标定义或手工开关。

没有新scout、真实采运/入库、生产净收益或断网关停的实测；CPU/Memory增量未测，tailStatus仍为原unverified。631项本地回归与默认关闭发布不能代替经济验收。

后续[单次试点执行方案](../plans/2026-10-23-native-economic-trial-single-run-card.md)已准备，仍不执行。需要新授权明确允许归档取代这份旧准备、合法release、一次新start及新日期窗口；这不是重试旧502或延长旧许可。
