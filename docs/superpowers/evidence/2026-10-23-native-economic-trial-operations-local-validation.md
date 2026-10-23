# 游戏内一次性经济试点入口：本地交付与验证

2026-10-23。六批本地实现已完成；主代理逐批RED→GREEN，一次独立只读review。**未联网、暂存、提交、推送、部署或启用游戏功能；线上经济闭环尚未验收。**

## 结果

- 新增60项回归，既有571项保留，完整 **631/631通过**；smoke、Governor及仅构建均exit 0。
- 验证与构建子进程均加载deny-network preload；构建DEST为空，日志明确只编译、不上传。没有读取凭据或调用游戏/代理API。
- 默认nativeTrialOps={enabled:false,request:null}，无请求不建立运维state或改旧准备。Goal/Plan与市场控制不由此入口启用。
- 固定工作树codex/single-remote-mining，HEAD 32313c084b2ff6f0d4ed9735632f0db901125f0b。主目录main未用于实现。

## 做了什么

一次完整短请求后，游戏内P0按当tickGame与原账本完成两tick预检、旧准备跨tick归档、显式合法release、新会话准确tick接纳；随后仍由既有经济守卫控制scout、100安全ticks、miner/container、hauler、真实确认及关停。没有重建孵化、寻路或收入算法。

canonical经营指纹已抽取共用，外部不再分片传指纹。运维id最多64，新economic trialId最多56，保留release-前缀后的原64字符限制；serialized请求<=1024。角色1/1/1、1650/6000和滚动2000/6000、1000ticks/90分钟、leg<=300及原重试期限不变。

原18:30/18:32及旧锁/日志不续期。新版本取代旧未激活准备属于新的明确生产授权；当前只是默认关闭候选，不收养旧过期许可、不清claim、不自动重做准备。固定profile遇到其他历史形态会拒绝，需要另行审阅，不能反复调用追求成功。

## RED→GREEN证据

本计划独立证据目录：.superpowers/sdd/2026-10-23-native-economic-trial-operations/

| 批次 | 关键证据 | 结果 |
| --- | --- | --- |
| 1 请求/默认/指纹 | task1-red.log → task1-green.log | 4项新行为及37旧Model通过 |
| 2 当前事实 | task2-red.log → task2-green.log | 无空global放行，旧准备/旧recon锁存严格匹配 |
| 3 持久协议 | task3-red.log → task3-green.log | archive先于替换、准确tick、重置不重放、高水位 |
| 4 服务链 | task4-red.log → task4-green.log | 真实Recon→Ops→Economic→Remote→Spawn/Action顺序 |
| 5 关停/报告 | task5-*.log及review-fixes-*.log | 不明不推进，拒绝/未知/关闭跨reset保留 |
| 6 全部验证 | full-smoke/full-governor/full-node-tests/dry-build.log | 631/631及仅构建通过 |

禁止网络的本地Game模拟中，东/西/南/北四向均从一次submit走通：本轮scout实际出生/移动/跨房视野、独立100安全ticks、唯一经济角色、指定terminal正数次tick入库及控制关闭。费用按原收据归约，与旧50隔离；本地结果允许净负值。**这些不是实际线上收入或四向线上验收。**

无容器场景使用containerId=null：安全100后才放置必要容器工地，容器尚不可用时不孵化hauler；本测试到放置工地与有界关停，不冒称模拟了新容器完整施工至首批入库。旧经济套件继续覆盖基建真实费用与unknown边界。

## 独立review与修正

唯一独立review检查617项阶段候选，发现3项Important、没有已证实Critical：停止intent中断可能漏撤权、归档tick缺失会放行、整份ledger缺失被当零。原报告和主代理处置保存在readonly-review.md，review前manifest单独保留。

三项均先复现RED再修复。安全撤权与一次性经营intent分离，但必须绑定本轮真实完整身份；不会重发原请求/引擎动作或清未知claim。归档和固定release/start请求按阶段完整校验；整份账本必须存在，旧格式可选unknown字段仍按原约定处理。

维护者另补同tick截止在EventBus之后/原生孵化前、ActionParser前到达的回归，由原经济Facts进一步收窄本native会话；以及单份请求字段损坏时的独立所有权证明。未知schema保留原值并拒绝，summary异常不参与权限。没有第二次派代理；修复后的最终全套由主代理验证。

## 候选与证据边界

离线构建版本：1792719819692。这不是已部署版本，当前没有新的服务器读回。

- main SHA-256：a38f9728b90acd022817e216cd01e7879fb8ac7e8fd7388f5d0a0d72b3adb49d
- main.js.map SHA-256：de8becbf927af0d389d49971e77e27030c26614b812ba974a65e6dd620e7caec

validation-manifest.json记录全部源码/产物哈希与各进程退出码。347份旧冻结证据、6个目录成员核对不变；另核对旧读回候选16份源码仍匹配原manifest。允许修改的12份历史路径（含仅构建产物）逐项列before/after；没有改写旧baseline来伪装460份全不变。

closed-candidate.json只有approved=false、enabled=false、request=null和空生产窗口，没有实际可执行的已批准启动请求。

## 尚未完成的验收

没有新线上有限侦察、真实采运/入库、该轮实际成本/unknown/净收益或断网生产实证；CPU/Memory上线开销未测。tailStatus自动结清仍为原unverified，不能把控制关闭当尾部已结清；新产出无证据时保持null。服务器停tick期间不能保证墙钟回调，恢复tick时先撤权。原始Memory无法写入时不能承诺完整留证。

后续若发布，需另获提交/推送/默认关闭部署授权，再只读核对服务器版本与控制状态。之后另行审阅明确日期窗口、归档取代旧准备及单次启用范围；没有授权前不操作线上。
