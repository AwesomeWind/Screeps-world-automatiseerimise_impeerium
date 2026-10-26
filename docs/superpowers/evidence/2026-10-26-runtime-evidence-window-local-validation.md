# 游戏内有界持久证据窗口：本地实现与验证

2026-10-26。用户已批准主代理逐批实现、一次独立只读review及完整测试/仅构建。本地交付完成。本轮没有联网、暂存、提交、推送、部署或写线上Memory；实际线上版本和开关未重新读取。独立review发现的6项Important已由主代理补回归并修复，最终完整复验通过；没有进行修复后二审。

## 本地实现

新增默认关闭的Model/Facts/Service/Report四模块，采集位于原服务列表末尾cleanup，P3登记且自行检查CPU软预算。只写`Memory.empire.remoteMining.evidenceWindows`；完整prospective/native/经济身份及canonical start匹配后才绑定，不接管动作、账本、guard关停或业务期限。

记录有界：1303行、80份快照、64项里程碑；每窗131072 UTF-16字符、两窗含包装270336字符。相关事件最多128条、owner/grant每类200条。pending放在store包装层，不修改已封存窗口；pending和最终包分别单次写入，各阶段检查CPU软预算，异常只读核对；未知不盲重写，半提交/缺帧保留partial。满额不淘汰旧窗或覆盖起点。

只读facade为`global.TrialEvidenceWindow.status/readPage/report`，没有start/release/reset。分页最多128行或16项，且每页≤16384字符，字符限制可能先到；带window/revision/nextOffset。封存查询仅归约保存的数据，不读取当前Game补历史，不更新lastAccess。

## 验证证据

- 新增69项定向/组合回归，含逐批及review修复RED→GREEN；与原799项合计**868/868**，另有smoke和room-governor通过，0失败/跳过。最终完整日志在`.superpowers/sdd/2026-10-26-runtime-evidence-window/verification-02/stage-{0,1,2}.txt`。审查前857项版本与旧日志保留，未混作最终候选。
- 真实模块顺序下，观察器关闭、开启和故障三组原spawn/动作/账本/outcome相同；完整身份、30秒/10tick、窗口接续、容量及+1、CPU不足/不可读/原生调用超软预算、写前/写后异常、同tick重建/跨tick unknown arm、JSON重载、只读查询均有回归。
- 实际测试引擎在原尾部expiry接受卸载，同tick没有收入，expiry+1确认400 energy，expiry+2仅观察，expiry+3封存；原aborted终局没有改为首批成功。模拟事件只在下tick已应用动作后生成，不从OK意图虚构金额。
- 隔离目录dry build通过；最终构建版本`1792987659461`，main SHA-256=`9fe0a4a0d08664c7559472ac1879ea065776e7ec1ae355185f9c68e62a97db83`，map=`b4aee3e7bdc20ac23d4dc7d6361c074caef81f17a439a62e8bd88e68c604f1ed`。最终产物仅在`verification-02/build/`，没有上传。
- 离线guard没有记录网络尝试；旧root dist、四项原修复源码及原九文件审阅包的21项完整性核对通过。Git index为空，HEAD仍`c8ce36cbf5c418e51e39e07069aa8818a23a87ec`；本轮与前四项修复都未获得新的提交或发布授权。

## 独立review与修复

一次独立只读review，0 Critical、6 Important、0 Minor，原冻结18文件和结论保留于`readonly-review/`。六项Important全部复现并修复：

1. sealed旧窗换入successor时，pending成功/final未知，跨JSON重建仍禁止自动重放arm；旧封存内容不变。
2. 接近单窗容量上限时，提交标记移到有界包装层，Service能实际保存capacity封存，重建后仍保留原因与旧主证据。容量RED用修正的出生/详细快照触发，在内存加载冻结旧Service复现，没有回滚工作区。
3. 外来能量转入绑定miner/hauler或actor未分类store变化，均造成不可逆来源缺口，不能凭容器净变化对平计算正数来源下界。
4. controlClosure的proved要求本轮身份、原outcome/close/后续closureVerified与实际settings/operation/runtime scope关闭；quietNow只保留为局部观察。
5. 接纳同时比对canonical start的配置指纹、tick/墙钟窗口与固定容器位置；分别合法但互相矛盾的记录不绑定。
6. 提交复制/验证/pending/final/读回各阶段检查CPU；pending后预算耗尽不继续final，保留未知且不自动重放。

六项修复与原功能组合69/69通过，之后完整868/868及仅构建通过。没有未处理的Important或Minor；这是主代理对review修复的回归验证，不能称为第二次独立review通过。

## 维护者决策与成本

- 复用现有worktree，以PowerShell/Node ledger和源码hash/快照代替commit区间；成本是后续发布前仍需明确选定文件及版本。
- 保留未提交workspace和全部证据，不执行技能模板的删除步骤；成本是本地磁盘占用。
- 每次提交先pending再最终包；成本是额外复制、序列化和Memory写入，真实CPU仍待校准。
- 16384字符限制优先于128行/16项上限；成本是字段展开后需要更多分页，以nextOffset保证不丢行。
- 安全逐tick事实与资金/原生事件完整性分项报告；成本是不能把分项proved当成整体通过或业务许可，窗口仍可partial。
- 容量封存仅移除冗余lastPacket副本；成本是不再保留这份重复输入，主行、快照、里程碑、绑定和原账旁证完整保留。
- review后pending改到store envelope，取代窗口内部marker；成本是有界包装元数据，仍计入270336总字符限制，换来封存不变性及近满容量可提交。
- reviewer未判断的生产API/实际CPU、真正global reset及旧修复/线上经济验收继续未验收；成本是仍需以后单独授权核对。本轮沿用不提交/部署的既定要求保留分支，不另开集成流程。

## 仍未验收

`Room.getEventLog()`的生产可用性、objectId/方向/金额/tick语义、单调用与序列化实际CPU成本、引擎硬CPU终止、整个Memory不可写以及真正全局reset均未通过生产核对。普通异常隔离和本地服务重建不能替代这些证据。

本地已验证持久pending存在时的跨重建不重放。若pending本身无法写入且进程状态同时丢失，不宣称丢失的历史仍可恢复；这属于整个Memory不可写/硬终止限制，不能用没有错误日志推定完整。

本批生产语义默认unverified；模拟证据不显示为生产proved。真实采出、原严格入库、可证明本轮新产出入库分开报告。E0、出生空载、同容器/同trip、相关并发或原账unknown任一缺失，保守下界仍为null；原库存较大时下界可以是0，不代表实际没有新产出。

后续发布、短只读能力核对、观察arm及原合法单次经济启动分别准备具体执行卡并另行授权；本轮不启用侦察、采运、Goal/Plan或市场，不放宽30秒新鲜度、不延长期限、不重放未知写入、不改变网络配置。
