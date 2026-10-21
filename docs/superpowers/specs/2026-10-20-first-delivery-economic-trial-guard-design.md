# 有限采运试点守卫：首批入库闭环设计草案

日期：2026-10-20。用户选择首轮“首批入库确认后停止”。仅本地设计，未实现或启用采运，游戏内Goal/Plan保持关闭。

## 现状与选择

新版本1792484139799已验证本轮50/0＋scoped、真实位移和远程视野；因观察连接三次失败而hold，最终49/100安全ticks，完整侦察验收仍未通过。不能拿旧100或本轮49作为新的生产放行证据。

现有RemoteMining已有单source/容器/运输/预算/次tick收入。比较三条路线：外部轮询手动关停受当前连接故障影响；让Goal/Plan接管扩大范围；推荐独立默认关闭的游戏内有限经济守卫，只收窄原执行层，不重建孵化/物流/路径。

目标W49N41→W48N41，source=5bbcaa6d9099fc012e63155b，容器格(19,6)，接收目标为真实母房terminal。仅必要容器建设/维修，不建路、不reserve Controller、不扩第二矿。

## 默认范围与状态（待批准）

建议总上限1000 ticks或90分钟先到即止，包括侦察、观察、孵化、建设和首批运输，不续期。这是保护上限，不是产能/收益预测；预检估算不足时不启动。

每轮最多成功孵化scout1、remoteMiner1、remoteHauler1，无替补、无旧单位接管。body能量上限分别50/800/800；沿用母房2000/1000tick孵化、6000/1000tick基建预算，并限制本trial孵化总额1650、基建总额6000。真实支出按原ledger记账，不把上限记成已花费。

| 阶段 | 行为与门槛 |
| --- | --- |
| closed | 默认无状态/新动作；不创建Goal定义 |
| recon | 仅本trial唯一scout，核对真实source/位置/owner/hostile和路线 |
| observing | 本trial100连续安全ticks，禁止经济角色孵化/出发，不继承旧safeTicks |
| preparing | 本trial唯一miner、必要容器自建/维修；scout保持视野到矿工接续 |
| hauling | 容器真实可用后才允许唯一hauler装货返母房 |
| stopping | 首个正数次tick确认的本轮home_delivery触发撤权，不发下一趟 |
| terminal | 下一tick关闭确认；冻结结果，费用和已有货物尾部结算单列 |

每role唯一原request；已证明not_called按原规则取消，明确失败可在原期限内重试，最多2次真实引擎调用（含成功）；未知调用占满额度并停止，不新request续命。保留原leg最大300、一次重规划、2tick冷却及既有安全门槛。

## 启动与侦察锁交接

- 完整侦察工程验收尚欠；本地设计可并行，实际启用前仍需补齐批准的门槛，当前49不能勾通过。
- 新鲜核对版本/epoch、母房normal与核心补员、Controller≥5000、Spawn、terminal free≥20000、唯一目标/路线、真实actors/accepted/spawning/grants及连接；预检不可读不启动。
- 旧实体和未结费用退场后才可显式release旧侦察锁。现有getReconTrialPermit已有“合规release成功”的非托管放行分支；保持remote关闭回读，不清store/claim、不杀单位、不放宽release条件。
- release及经济start均需未来明确生产授权。start绑定独立trialId/sequence、remoteId、epoch、codeVersion、绝对期限及配置指纹；请求接受不等于接纳，结果不明只回读原身份，不补发新id。
- 本经济trial自身再用一名新scout与100安全ticks，解决旧侦察退出后的视野失效。旧侦察是工程验证，不是永久安全许可；旧单位/费用不贴成新trial。旧记录按current/previous有界轮换，事前本地归档。

## 接入与权限

新RemoteEconomicTrialModel/Facts/Service为P0，位于RemoteReconTrial之后、RemoteMining之前。默认policy economicTrial.enabled=false/request=null；禁用且无旧会话时不创建状态，不影响非托管旧流程。

按role/动作产生许可，与现有recon、RemoteMining安全、预算和Spawn/ActionParser取交集。观察阶段不简单覆写整个scope的allowEconomicDeparture，否则可能导致入口scout提前返程；原始operation状态与有效trial许可分开展示。需用生产链回归证明侦察到矿工的视野接续。

接入发需求、intake/原生spawn前、策略与ActionParser前、createConstructionSite前，旧任务也撤权。每role slot持久绑定完整trial/request/name/body与真实费用；不能把scout固定50结算直接用于miner/hauler。

recon首次尚无远程视野时允许唯一scout按安全入口前进；取得视野后的观察、建设与运输若丢失必要新鲜事实才按失效停止。不能把“尚未看见”当成观察完成，也不能一启动就误判已丢失视野。

## 首批交付与关停

复用ResourceReservationFeedback的次tickresolution与recordRemoteResolution实际应用结果，不只看operation累计增量：
- canonical本trial hauler及spawn身份、remoteId/epoch匹配。
- reservationId/assignedAt/sequence/tripId匹配；energy/home_delivery，目标为本轮真实terminal和W49N41。
- 同一trip必须已有本trial从指定远端容器取得energy的正数confirmed pickup，入库累计不得超过该trip已确认取货。期初库存与本轮矿工产出分列；来源不明不判首批成功，不宣称旧库存运输等于本轮新产能。
- status=confirmed、confirmedAmount>0，且原ledger幂等记账已应用。任务OK、pickup、源侧库存、历史或其他角色同额变化均不计首批。
- 原ledger提交后同步通知守卫，不能等下一次轮询；先形成最小停止事实、deny许可并应用关停，再做可失败的详细记录。首批部分入库也触发停止，禁止同tick及后续发下一趟。费用或交付unknown保留并停止，不靠新运输覆盖未知。
- 旧货可安全返程/卸载，已接受动作可继续确认，作为有限尾部单列；禁止新取货/采矿/建设/经济出发。控制关闭与尾部费用结清分开显示，不续期、不改原终局。

危险/foreign control、视野/路径失效、接收不足、母房核心/Controller危机、预算/身份/版本/配置异常、额外actor、重试耗尽、断档及任一期限到达都停止。next-tick核对closeApplied/closureVerified；安全return不可用时safe_wait，不强派/自杀/销毁资产。

record失败不阻断撤权和关闭；原Outcome冻结。slot、费用、首批身份和原期限存Memory，current/previous最多2轮，最小事件/尾部收据有界；未知schema保留原值并拒绝动作，reset不丢额度或续期。

外部断线不延长上限、不补发start；人工hold有限重试，不能回读就标关闭待确认。游戏内P0必须独立完成首批或超时自停，不依赖外部轮询。

## 报告与实施门槛

报告列真实入库、各role孵化费、基建/维修费、unknown、采样区间及净energy差额。首批可能覆盖不了前期投入，负收益如实记录；首批闭环不等于长期盈利、停止恢复全覆盖或10000tick验收。

具体设计获批后编写分批实施计划，再本地实现/回归/仅构建；提交、部署、release旧锁和启用均另行授权。本稿不自动启用采运或Goal/Plan。
