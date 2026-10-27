# 母房自然观察窗：默认关闭发布卡

日期：2026-10-27（Asia/Shanghai）。用户本轮已授权提交、推送、部署并只读核对；不授权开窗、侦察/采运、Goal/Plan或市场，不修改共享网络。

候选版本1793072703455，来源 `.superpowers/sdd/2026-10-27-home-natural-evidence-window/verification-05/`。完整912/912、HTTP44、自然44、旧probe47、smoke/Governor与仅构建通过；发布前本地修正了已过期父enabled包络的严格兼容判定，不改旧记录或放宽新鲜权限。

1. 本地核对HEAD/分支/暂存区、候选及测试输入hash、固定产物、保护文件和旧消耗日志。只定向选择游戏代码/测试/设计报告及可复用HTTP只读模块；排除混合进度文档、历史授权、旧在线入口、原始样本/备份/日志与所有凭据。
2. 新独占attempt目录，默认check不读凭据或联网。联网时只用现有代理环境，不读写共享代理配置；不使用已消耗入口。
3. HTTP备份default代码并核对activeWorld；预期旧版本1792987659461，main=`9fe0a4a0d08664c7559472ac1879ea065776e7ec1ae355185f9c68e62a97db83`、map=`b4aee3e7bdc20ac23d4dc7d6361c074caef81f17a439a62e8bd88e68c604f1ed`。Git远端须仍为基线2e9f10c。
4. 单个30秒内的HTTP持久Memory窗口并行读取control、remoteMining、remoteRooms、market.enabled、observations及shard3游戏时间。核对近10tick的telemetry/母房摘要版本和健康、近3tick的operation关闭、无远程角色/未决费用，旧econ/native精确一致，recon仅允许既有lastRejection.tick单调更新。保留已过期enabled=true包络，严格核对终态和原到期；不改Memory。
5. 条件通过后定向暂存、提交、普通push；用远端ref单次读回确认。若推送结果不明，不重推；已推送但无法确认时不部署。控制窗口超过30秒也停止，不延长。
6. 上传前再单次读回代码/branches，确认仍为预期旧指纹。固定候选只POST代码一次，不重传unknown。上传后只读回指纹，必须匹配。
7. 固定等45秒供原telemetry下一次持久化，然后只读一个HTTP窗口确认新运行版本、HomeEvidenceWindow的持久服务计时、homeEvidence false/null、无自然/经济数据namespace、Goal/Plan/市场/实际remote关闭及旧记录兼容。没有轮询、WebSocket或console。
8. 每个HTTP请求15秒、不跟重定向、不刷新token/重试；代码上传至多一次。任何阶段失败即保留实际结果并停止，不回滚/删旧锁或自动重启发布。

线上证据来源是HTTP代码和持久运行摘要，不冒充独立原生Game页面检查、逐tick观察或性能/经济验收。Agent没有Memory写入；游戏原循环正常更新遥测并合并新的默认关闭policy属于预期。

成功后保存中文发布报告，并给出100观察tick/10分钟先到即止的候选采集卡。本次不开窗；未来arm/关闭配置/下载须新具体授权，不能沿用这次发布额度。

本地比较器修正补记：attempt-01因把合法未初始化的budget.infrastructure误作缺失而失败，所有网络请求为GET，Git/上传均未开始。原目录保持消耗状态；修正并离线回归后，只允许一次新的attempt-02必要预检来完成当前授权发布，不是重放未知生产写入。既有预算本体/明确grants必需；若有infrastructure则pending必需且为空，若完全无infrastructure须符合v1初始化结构且无基建费用/在途attempt。未知/损坏不能自动归零，上传总额度仍1。
