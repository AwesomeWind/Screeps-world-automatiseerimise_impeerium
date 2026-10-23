# Spawn仲裁后接纳发布后的首批入库复试准备方案

2026-10-23。本卡为复试准备建议，**当前不可执行、不启动**。用户本轮只授权提交、推送、部署及只读兼容核对；不授权新一轮release/start、清锁、改准备或扩展产品实现。发布事实见[发布报告](../evidence/2026-10-23-economic-spawn-admission-release.md)。

## 当前结论

Spawn修复已在screeps.com/default部署，实际运行1792733742635；旧经济/native/recon记录兼容且原值保留，执行权限关闭。但下一轮必须先解决两个独立条件：

1. W49N41仍为spawn_energy恢复。已读储备874000、核心miner2/hauler3、Controller安全、blockedBy为空，支持保持关闭的代码发布；这不满足实际采运启用所需的recovery=normal。发布样本两端spawn能量均1290，不能称补能已恢复或保证何时恢复。
2. 原native一次性入口已消耗：nops-w48-20261023-01为terminal，lastAcceptedStartSequence=3；编译profile仅接纳原seq1旧准备→release2/start3。换id或直接改成release4/start5不能重新接纳。保留旧terminal时Model没有再入场效果；不得删除current/高水位/旧锁来强行启动。

此外，离线真实服务链证明：原经济Model合法release4可以处理，但随后start5会被旧native控制状态以native_ops_control_changed拒绝。旧native请求的控制/截止仍通过旧current进入新会话接纳Facts。此结论来自本地Game模拟，不是本轮线上release或start失败；本轮没有发送任何试点生产写入。

## 阶段一：先完成可审阅的本地换轮方案

建议下一项本地工作为“已结束native试点的显式有界换轮与截止所属隔离”，先设计/回归审阅，再按另获认可的分批计划实现。不是继续重试已用请求：

- 新请求必须明确指认完整父会话：旧native id、完整economic identity、已确认terminal/closure、lastSequence3、原费用/unknown、旧请求/档案。没有这一份精确证明不得换轮。
- 原current/previous、旧profile v1档案、原截止、原外部锁/日志必须保留。新轮可显式形成release4/start5，但只在当前序列仍精确为3时有效；不能把数字改大绕过未知或已用高水位。
- 旧native原始请求/档案使用原冻结profile验证；新轮采用经审阅的编译合同，不能简单修改单个profile常量使旧记录失效，也不能让线上Memory选择任意profile。
- 旧native控制/窗口仅约束其所属经营会话；新接纳不能继承已合法release的旧current的失效门槛。旧活跃会话自身仍受原更早截止与撤权控制，不得因隔离修复放宽。
- 两tick预检、先归档后取代、精确tick接纳、intent结果不明不重放、单调高水位和一次经营额度都保留。源矿/接收目标、孵化/费用/运输确认算法不重建。
- 新轮成本、unknown、安全计数及视野从零独立建立；旧50与-50不进入新轮，不能用清账假装已有正收益。

需要先RED→GREEN的关键回归：精确terminal父会话接纳/外部新id拒绝；错误seq/epoch/profile/版本/旧窗口拒绝；release4后start5不受旧native控制误拦；未release或旧会话仍活跃仍拒绝；新轮自己的native截止在原生前仍生效；profile v1旧档案/前后会话重置留存；unknown/半提交不重放；完整单Spawn母房竞争后真实链首批及关闭。

当前674项发布验证不覆盖这个新换轮能力。此阶段尚未实现；完成本地测试/review/仅构建后，仍需另获默认关闭发布授权，不能使用本次Spawn发布许可夹带新逻辑。

## 阶段二：只读确认母房准备状态

启用前重新读取W49N41：

- 己方房间和可用Spawn，无hostile；Controller不低于原紧急阈值且至少5000。
- recovery=normal、无blockedBy；核心至少1可用miner/hauler且无即将补员缺口，spawn有空闲、至少50能量。观察真实补能状态，不能手动切recovery、强派单位或抛能量换绿色。
- 若spawn_energy持续，先只读核对hauler取能、配送目标、预留与移动；证据支持代码缺陷时另给本地修复范围，不在复试中临时改策略。
- terminal仍为真实己方6ad0b55bceeb3db0d3b4dda0，free≥20000；完整预算/receipt/grant/ledger无未知或在途冲突。
- 所有旧远程actor/accepted/spawning均已退场；旧current仍保留，closed/managed/高水位与换轮合同一致。tailStatus若仍unverified必须明示，不把新鲜无actor自动改写成旧tail已结清。

仅当阶段一能力已经验证并另获发布许可、阶段二事实满足，才能准备实际执行卡。

## 阶段三：形成新一轮明确执行卡，另行授权后才启动

1. 重新核对服务器main/map指纹、实际Game版本、A02/鉴权/WS及原生读回。每个独立窗口≤30秒、tick跨度≤10，最多三次有限只读尝试，不拼接；不改共享网络。
2. 将新日期、开始/停止/总截止写死，所有预检/准备计入≤90分钟并留至少120秒关闭余量，1000ticks或更早截止先到。旧10月23日12:09/12:11及更早期限均不顺延。当前不固定可自动生效的新时间，也不生成可发送的生产请求。
3. 用户明确授权本轮精确父会话的归档交接、合法release4、唯一start5及有界停止；序列改变或新版本不匹配即卡失效，不自行改id/seq/时间追求成功。
4. 仍仅W49N41→W48N41/source5bbcaa6d9099fc012e63155b、containerPos(19,6)，必要容器自建维护，不reserve/修路/第二矿。真实接收terminal用上述id。
5. 最多1名新scout、1名miner、1名hauler；body上限50/800/800，本轮1650孵化/6000基建与原滚动2000/6000预算取交集。新scout实际出生、移动、跨房视野并独立100安全ticks后才放行miner；hauler仍须原矿工/容器条件。
6. 使用新已审阅入口只提交一次；无回复、502或其他unknown时只按原id读回，不重放、不换id。候选等待不占正式request/grant；实际Spawn接纳后原5tick和重试上限固定，不能因等待或失败续期。
7. 首批同trial/trip pickup→指定terminal正数次tick确认即撤权，不增第二趟；危险、失视野、核心危机、unknown、原期限到达或其他异常也先停再留证。
8. 新鲜样本确认remote/room关闭、hold=true、allowRecon/economic=false、native关闭，Goal/Plan和市场始终关闭；原协议锁存与managed记录保留。不能为显示所有位false而清除历史。
9. 中文报告分别列真实出生/移动/视野/安全、路线、各role实际费用、基建、unknown、入库、净收益、关闭与tail/缺失场景。入库可为0、净收益可负；未取得新真实入库就不宣布经济闭环完成。

## 当前停点

代码发布和旧会话兼容核对已完成，复试仍未启动。下一步先审阅阶段一的本地换轮/旧截止隔离方案，并只读核对母房恢复；不跳过它们直接释放旧锁或运行原试点脚本。
