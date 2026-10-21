# 新版本 W48N41 有限侦察复试方案（待单独授权）

2026-10-21，仅准备方案；未release旧锁，未写start请求。适用已发布代码3f0f8d0、SERVICE_VERSION=1792555927985。目标是补齐侦察工程验收，实际采运和Goal/Plan不启用。

## 先核对，未满足就不开始

1. 重新只读核对default活跃分支、main/map及实际执行版本均符合本次发布；经济守卫false/null且无经济会话，GoalPlanning=false且无目标定义。其他意外版本或开关变化立即停止。
2. 核对母房核心人口、恢复状态、Controller、接收目标terminal真实剩余空间、现有预算与ledger；没有核心危机、未知孵化、旧actor或未决grant/receipt。必须有本轮50能量scout额度且不改原滚动预算/期限。
3. 核对SDK与WebSocket鉴权、订阅及只读观察可用；本轮不换节点、不改共享配置。不能以一次首页200或旧只读表达式的回显当连接合格。
4. 核对旧侦察会话aborted、原关闭已确认、模块和房间关闭、没有其他启用房间、旧actor/未决费用均无，满足既有release门槛。任何未知视为不满足，不删除证据或强制清账。

## 获授权且全部满足后才执行

- 按完整旧会话身份发出一次release，下一tick核对已解除托管而终态/结算证据仍保留；不得清空reconTrials、重置lastSequence或覆盖未知grant。序号从新鲜状态单调取值，不能复用旧start。
- 启动一个新会话，拟用id为w48-20261021-01（若实际执行日期变化则使用当日唯一id），绑定当前版本、W49N41:W48N41、epoch及candidateSourceId=5bbcaa6d9099fc012e63155b。总上限300ticks或20分钟先到，整轮最多一名50能量scout；未知孵化占用额度，不补生。
- 仅临时打开侦察必需的remoteMining/房间开关，角色额度scout=1、remoteMiner=0、remoteHauler=0、reserver=0，allowContainerBuild=false、reserveController=false；经济守卫继续false/null、Goal/Plan继续false。不得将“侦察需要的全局开关打开”当成采运授权。
- 逐阶段核对出生、下一tick真实位移、跨房实际视野、source和拟用容器坐标/原生路径、敌方身份/owner/reservation、安全条件及本会话连续100个新鲜安全ticks。旧49tick不拼接，外部离散快照不冒充连续tick证据。
- 完成、危险、母房异常、预算/版本/身份异常、上限或观察连接连续三次失败即停止。守卫先撤权，外部仅发送hold/关停所需动作；不得以记录或结算异常阻断关闭。已有安全返程沿原门槛，不强制移动或杀死scout。
- 下一tick核对remoteMining和房间关闭、allowRecon/allowEconomicDeparture=false，原会话终态、关闭时刻、spawn费用/unknown及危险证据留存。无法回读时报告实际观察缺口，不宣称已完成验收；不自动重开。

## 输出

保存新会话独立中文报告，分清实际出生/路线/视野、安全100tick证据、费用与unknown、关闭和重置留存、未覆盖场景。只有这些条件确实满足，才提出独立的有限采运启用建议；本方案本身不授权实际采运。部署与侦察通过均不等于经济收益或10000tick验收。
