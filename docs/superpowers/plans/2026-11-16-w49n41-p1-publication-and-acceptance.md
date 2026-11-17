# W49N41 单房补员发布与线上验收执行卡

> 按总计划 P1.4 逐项核对。当前为离线候选，发布、线上启用和采集待对应授权。
>
> 依据：[总计划](2026-11-16-empire-refactor-master-plan.md) · [旧单房验收要求](../specs/2026-10-13-single-room-survival-recovery-design.md) · [P1.3 离线回执](../evidence/2026-11-16-w49n41-local-spawn-lifecycle.md)

## 固定候选

| 项目 | 值 |
| --- | --- |
| 目标 | screeps.com 活跃 default，shard3/W49N41 |
| 已知线上版本，需新鲜预检 | 1794815499381，源码 8399eac91360ee2f3fab3f87ee1f118e7c3da80e。此前读回 main a86bc604ee70f51d1690465cb893dcef2c1a3c412d08ba81551c880955b41398、map c09601872df643203acc960a9ee2ea0237d1f6aff5376bf8b316173662e1cc25 |
| 本地候选版本 | 1794822619406 |
| 候选 main | 0c473caaa2a3d727c5d6328e391383563851d7019ea15e91e16382b29fc9257f |
| 候选服务器模块 main.js.map | 0a83f58effa095acae419dc21feff7566173397abdef86b53572054bfc1bf892 |
| 固定产物与源文件清单 | .superpowers/sdd/2026-11-16-empire-refactor-p1/closed-candidate。manifest.json 保存 19 份文件哈希、基线与目标。可在同一提交附上本阶段文档，旧历史和用户已有的远程进度文档改动独立保留 |
| 离线核对 | smoke、Room Governor、1036 项 Node 测试和离线构建通过。6 项脚本回归覆盖摘要缺失、旧样本、跨版本和窗口中止、身份冲突、模拟 GET 采集及结束时地图模块变化 |

上传使用 manifest 对应的固定 main.js 和 main.js.map.module.txt，对应模块键 main、main.js.map。Rollup 在构建时生成版本，重新编译会生成不同版本和哈希。旧版模块、活跃分支、新旧完整哈希及回执保存在独立目录。过程沿用当前 A01。

离线端到端对照已加载旧、新两个实际编译模块，在隔离的 Game 模拟中各完整运行一 tick，W49N41 可见且 Spawn 正忙。两个版本均写出对应的运行遥测、保留相同的 10 父锁和费用 750／168，07／09 和四份旧档还原一致。候选无新试点回执。将 10 的施工中预算与终态做交叉样本时，两个版本均产生同一 unknown，已确认费用相同。正式预检因此继续要求同批预算、作用域和父会话读回。

可用 bundled Node 执行 .superpowers/sdd/2026-11-16-empire-refactor-p1/rehearse-closed-bundles.mjs，结果保存在同目录的 closed-bundle-rehearsal.json。该对照基于模拟 Game 时钟，CPU 和业务场景验收仍取线上证据。

## 默认关闭发布

- [ ] 获得提交、推送和单次默认关闭发布授权。核对工作树、19 份源文件 SHA-256、固定模块以及已知线上版本。检查 default 活跃分支、双模块指纹、新鲜运行版本、W49N41 基本健康、10 父锁、07／09／10 和四份旧档。未决读回、旧证据变化或指纹异常时停止。
- [ ] 备份旧模块及当前关闭证明。保存定向提交清单，提交并推送指定分支，按已验证的发布方式上传固定模块一次。写入结果不明时保留 intent 和响应，只做独立读回。
- [ ] 读回两个模块哈希并核对实际 tick 执行版本。新本房开关 localReplacementPilotRoom 应为 null 或尚缺省，无新试点回执。保留 Governor shadow=true、scheduler.enforce=false，核对已关闭的侦察、实际采运、Goal/Plan、市场和观察窗。保存关闭态 CPU、bucket、Memory 和遥测样本。历史启用请求包络按既有终态／锁解释，保留历史原文。

发布入口位于 .superpowers/sdd/2026-11-16-empire-refactor-p1/closed-release.mjs。check 只在本地验证候选，6 项离线回归通过。经授权后，依序使用 preflight、定向提交与推送、deploy <提交哈希>、post <同提交哈希>。deploy 重新取旧状态备份，核对远端提交，在一次性意图落盘后上传。post 独立读取代码、运行遥测和旧档案；上传结果不明时也只用 post。两端均等实际 finishTick 的运行版本，部署回执单独留存。预检核对现有路由和关闭权限，采集在各检查的既有范围内。实网 transport 仍待授权后验证。

## 单房启用与观察

- [ ] 另获 W49N41 启用、取证和结束时撤权授权，绑定该版本、窗口和操作范围。复查同 tick 房间健康、核心人口、Spawn 空闲、预算、Controller 阈值和安全开关。确认原局部请求已处理完毕，历史未决回执为空或已确权。用已批准的单次方式设置 policy.spawnIntake.localReplacementPilotRoom=W49N41，再读回版本和该字段。
- [ ] 使用 [只读采集器](../../../scripts/single-room-observation.mjs) 创建独立新段。以下命令只在授权后使用。runDir 设为工作树内新输出目录，使用预检确认的 bundled Node 和 A01 链路。日志保存白名单字段。

  ~~~powershell
  $manifestPath = '.superpowers/sdd/2026-11-16-empire-refactor-p1/closed-candidate/manifest.json'
  $release = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  node scripts/single-room-observation.mjs --shard shard3 --room W49N41 --target-ticks 10000 --expected-pilot-room W49N41 --expected-main-sha $release.mainSha256 --expected-map-sha $release.mapSha256 --output "$runDir/samples.jsonl" 1> "$runDir/terminal.json" 2> "$runDir/stderr.log"
  ~~~
- [ ] 每次采样为只读 HTTP GET。沿用 30 秒轮询间隔及 15 秒请求上限，采集保存推进了 Game tick 的独立轮询样本。读回失败、权限变化或版本漂移时保留原 JSONL 与终止记录。观察窗口由同一进程独立成段，新段重新预检。
- [ ] 短孵化可能落在两次 HTTP 读之间。使用获准的只读母房查询核对同一 requestId、Actor 名称、正在孵化或出生，以及同一动作的原生事件和两端库存。HTTP 长窗用于健康和运行趋势，临近事件的补充样本用于证明具体业务。只观察自然替换、施工和能源波动。

## 审阅、停止与回退

- [ ] 运行 [离线审阅器](../../../scripts/single-room-pilot-review.mjs) 并保存结果。

  ~~~powershell
  node scripts/single-room-pilot-review.mjs "$runDir/samples.jsonl" "$runDir/terminal.json" $manifestPath
  ~~~
- [ ] 核对同代码双模块、同 shard、同房、单进程终态与至少 10,000 tick。报告单列遥测高于当前 tick、缺失、超过 10 tick、最大采样间隔及开关变化。外部读回只能证明对应采样点。windowComplete 表示窗口历时与身份通过，场景证据由人工评定。
- [ ] 按下表保存每项事件 ID、前后 tick、证据文件和缺口。长期性能按关闭态与启用态分别记录 CPU p95、bucket、Memory、遥测更新时间和样本量。

| 验收项 | 最低可核对事实 |
| --- | --- |
| 核心补员及恢复供能 | 自然缺员或退役 → 原身份接纳 → 实际孵化／出生 → 核心可用恢复 → 同名单位按资源回执和下一 tick 库存确认为 Spawn 补能。记录是否跨过原恢复滞回边界，缺能源恢复场景须单列 |
| Controller 与房间安全 | Controller 所有权、等级、降级计数、升级进度，保护临界时间。缺临界样本时标明场景缺失 |
| 工地与物流 | 同目标工地推进或完成。owner 峰值及实际库存、到期或完成释放、真实确认金额与 unknown 分别留证 |
| 运行资源 | CPU、bucket、Memory 和遥测相对关闭态的趋势，给出缺测分布。沿用原 CPU budget 和门槛 |

- [ ] 结束或异常后按授权撤销该房间选择，确认旧 Bureau 路径恢复，保存原请求、孵化单位和收据，保留未决查询。未知写入带原身份读回。旧二进制回退前先确认原观测期结束、未决单已确权并保留记录，再单独执行旧模块回退。

当前线上验收等待授权与新版本证据。离线 GET 演练使用固定测试响应。
