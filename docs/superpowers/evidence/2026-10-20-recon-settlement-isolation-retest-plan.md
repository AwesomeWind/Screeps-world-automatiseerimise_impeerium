# 新版本结算隔离：有限侦察复试方案

日期：2026-10-20。**离线方案，未启动、未写入线上Memory。** 本轮只授权发布；侦察、实际采运与Goal/Plan继续关闭。

目的：用新会话核对费用、unknown、时间戳和确认绑定不继承旧会话，并重复验证真实位移、视野、安全与关停。保留原守卫全部限制，不人为制造孵化故障、危险或生产reset。

## 启动前门槛

在未来明确授权后重新核对：

1. default仍activeWorld=true，实际版本1792484139799，main/map匹配本次发布指纹；有变化先重审。
2. 原会话completed且次tick关闭已确认；旧scout/孵化/accepted/执行claim均已退出，无真实未结费用。不能仅凭旧摘要unknown=0判定账本清空，必须读真实grants、receipts和population。
3. 母房normal，至少1名可用miner和hauler、核心补员完成、Spawn空闲、无母房危险，Controller降级计时不少于5000。
4. terminal真实id=6ad0b55bceeb3db0d3b4dda0、free不少于20000；仅W48N41目标，200tick侦察间隔和2000/1000孵化、6000/1000基建预算满足。
5. SDK与原生console、启动后回读和关闭回读链路可用，每一步最多三次有限重试。必要事实不可读则不启动，不改共享网络配置。
6. 旧100安全ticks及旧可见路线只是历史证据，不替代新一轮视野和安全门槛。

## 唯一请求和限额

新鲜生成唯一trial id、lastSequence+1（本次发布时为2，候选3须执行时重读）、当前operation epoch、codeVersion=1792484139799，范围W49N41:W48N41；candidateSourceId=5bbcaa6d9099fc012e63155b。

activateAtTick=当场Game.time+1，expiresAtTick=activateAtTick+300；issuedAtMs当场读取，expiresAtMs=issuedAtMs+1200000。总期限包括孵化和行进，不因出生、受阻、网络中断或重置延长。

按既有原子启动协议核对旧终态/高水位后，写新request并仅打开侦察范围。sourceId仍null，scout上限1且body为1 MOVE、费用上限50，其他经济角色0，建设和reserveController关闭；Goal/Plan始终关闭。

不执行release或手工清store。事前本地归档旧记录，正常由守卫按current/previous的既有有界策略轮换。console请求接受不等于守卫接纳；提交结果不明时回读同一身份，不另生成id补发。

## 本轮结算验收

- 新会话不能继承旧50/0或旧null/50；新settlementBinding必须匹配完整五字段identity及本轮request/name。
- 核对本轮真实receipt、实际费用累计增量、settlement三字段及sourceStatus。正常成功应为50/0＋scoped，费用时间不得早于本轮开始；原receipt.tick单独保留。
- 初始0/0和call_started的null/50可能在同一个游戏tick内变为50/0。外部console未采到中间态时必须写“未直接观测”，不能把本地入口回归当作线上采样，也不能为观察而改生产执行顺序。
- 只在自然出现未知调用时核对unknown=50、claim保留、关停与无第二次孵化；未发生则保留该线上覆盖缺口。
- 跨tick回读同一绑定和费用，重复摘要不刷新费用时间；原previous历史字段不因新费用改变。无自然reset时不宣布线上重置留存通过。

## 侦察、危险与停止

仍最多一名scout、300ticks或20分钟先到即止；核对孵化接受/出生/实际移动/跨房各自证据。自然受阻仅按既有一次重规划、2tick冷却和原leg期限恢复。

取得真实W48N41视野后重新核对source、(19,6)候选容器位置、owner/reservation、hostile和真实terminal路线。本轮自身累计100连续安全ticks、同tick源与经济路线有效后才由守卫完成，不启用采运。

自然危险时先核对撤权/关停，再读取独立危险ledger；捕获状态如实报告。未遇危险则新危险捕获仍未覆盖，不能为了补验收制造危险。

完成、危险、期限、身份/配置/版本变化、母房/预算/额外actor异常或读取重试耗尽即停止；下一tick确认关闭，保留托管锁和安全return，不强派/杀死单位。连接断开时依赖游戏守卫上限并在恢复后回读，无法回读就不能宣称人工关闭已确认。

最终中文报告分开写结算绑定、费用/unknown、出生移动与安全路线、危险/重置未覆盖及关闭证据。不自动启动第二轮；实际采运与有限采运守卫的设计/实施/启用另行推进。
