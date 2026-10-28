# 首次接纳诊断回执：默认关闭发布卡

日期：2026-10-28（Asia/Shanghai）。用户已授权提交、普通推送和单次部署；本卡不授权开窗或业务启动。

发布候选为本地950项游戏回归、46项HTTP、smoke/Governor及隔离构建已验证的17份源码/测试/说明差异，配套提交本次设计、计划、诊断与本地交付记录。原混合goal-progress、旧授权/锁/attempt、备份/原始Memory/凭据、在线入口和root dist排除。

固定代码源产物：`.superpowers/sdd/2026-10-27-home-evidence-admission-diagnostics/build-02/dist/`，版本1793094591937。新发布目录artifacts复制相同main，并把原始JSON source map包装为等价 `module.exports` JavaScript模块；语法和map内容等价回归通过。不得从root dist重编/上传，实际上传SHA由新manifest固定，原始build-02不覆盖。

线上基线预期：default活跃分支，旧版本1793072703455，main=ee4c4ca265d453af23d1d9541a97c7bc0cd249b216f952373c73f10d05898e0c，map=01233df0604bad444fc520f379ddbf14ce00e79a220e6c597b0e08ae5d29c96a。发现意外变更停止，不覆盖。

## 单次顺序

1. 本地hash、HEAD/branch/index、保护文件与新鲜离线验证通过；发布适配器回归通过。
2. 只读GET代码/branches并备份，核对远端Git ref。一次并发Memory/Game.time快照窗口≤30秒，每请求≤15秒，无重试。
3. 实际remote/native/经济观察器/Goal-Plan/市场关闭、Governor shadow、scheduler不enforce；母房核心/Controller安全，operation实际许可关闭；旧econ/native/recon/费用/锁按既有严格合同保留。
4. 自然窗enabled=false，原失效请求home-w49-20261027-01的所有字段和CPU配置与关闭读回精确一致，双时钟均已错过；不清空请求。不应存在homeEvidence数据namespace，不补建旧记录。历史enabled=true父包络仍须身份/终态/closure/tail和双期限证明，不改写包络。
5. 定向暂存manifest文件、核对清单与hash、提交、普通push并读回原ref；原新鲜窗口未超过30秒才继续。再次GET旧代码指纹，仍匹配才上传一次固定modules。
6. 上传ACK即使结果不明，也只允许一次按原版本指纹的GET核对，不自动重传。确认新main/map后固定等待45秒供现有遥测持久化，再取一个只读快照窗口核对版本执行、关闭状态和旧记录。
7. 任一步失败即保存实际阶段并停止；不自动恢复、不回滚、不放宽新鲜度、不改网络。当前授权不包含新观测请求、console、WebSocket或Memory写请求。

## 已披露限制

保留一个CPU afterFinal样本commitKind标注Minor，不影响准入/停止/业务许可。真实global重建若丢失读回确认链会保守停采留证；真实API/硬CPU/运行时经济验收未证明。线上旧home数据若本就缺失，只能核对不创建及失效请求保留，不能声称已在线验证v1旧窗口迁移。

发布后另给100观察tick或10分钟先到即止的自然采集复试方案，本卡执行不取代该方案的开窗授权。
