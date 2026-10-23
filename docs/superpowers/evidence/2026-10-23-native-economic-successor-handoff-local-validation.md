# Native经济试点显式换轮与期限隔离：本地交付

日期：2026-10-23。按用户认可的具体设计、六批计划和“主代理逐批实现＋一次独立只读review”完成本地实现、验证与仅构建。**没有联网、读取凭据、修改共享网络、线上Memory、提交、推送、部署或启动。** 本报告不代表真实远程入库、盈利或线上关停验收。

## 结果与行为

- 保留v1冻结准备/Profile，原Model逐字提取到LegacyModel（统一换行后与HEAD原Model完全一致）；公共入口明确分派schema。没有新v2请求时不迁移旧记录或新增试点。
- v2仅接纳明确父native/经济身份、费用、闭合、高水位和当前事实全部成立的新轮。先持久完整平面档案，再走原合法release/start；原actor、binding、grant、pending、unknown未结就拒绝。
- 原父current/previous、原请求、费用及原期限完整归档。新轮视野/100安全ticks/费用独立；旧预算通过真实窗口推进退出，不删桶、receipt或unknown换新额度。
- native控制按活动或拟接纳完整身份及canonical startRequest判断。已release旧窗口不误拦新轮；活动轮自己的更早期限仍在接纳和动作前生效；旧回调不能因remoteId相同撤权到新轮。
- 经营intent在效果前持久化，已确认不重做、planned中断/unknown不重放。写入、摘要或历史读取失败时，已证明所属的撤权优先，保留损坏raw而非清锁。
- 仍为默认关闭候选；原Goal/Plan、市场、Governor shadow和scheduler默认值文件与基线一致。没有用本地dist判断线上版本，也没有在本轮声称新鲜线上开关状态。

## 验证证据

独立目录：`.superpowers/sdd/2026-10-23-native-economic-successor-handoff/`，保留每次独立RED/GREEN日志、ledger、review和前后manifest，未覆盖旧发布/试点目录。

| 检查 | 结果 |
| --- | --- |
| 完整node:test | **720/720，fail0、skip0、cancelled0**，completion-2.log |
| smoke / room-governor | completion-0/1均exit0 |
| 仅构建 | completion-build.log，DEST为空，明确输出编译但不上传，exit0 |
| 构建语法 | completion-syntax.log，node --check，exit0 |
| 源码/默认值 | validation-manifest.json记录16文件哈希；Legacy原样、KnownPreparation/Profile/EmpirePolicy/main与HEAD一致 |
| Git差异检查 | git diff --check及cached --check均exit0；index未暂存新内容，原混合目标进度保留 |

计数为原674项＋本次46项；smoke和Governor独立列出，不并进720。命令均使用bundled Node与deny-network preload。已有本地Prettier只用于指定修改文件；未下载依赖或改共享配置，Legacy和冻结准备未被格式化。

关键RED→GREEN：

- p1-red：保留terminal时静默早退，未路由v2；随后p1-green含旧模型52/52。
- p2-green-fixed：补齐父证明/档案；首次GREEN尝试暴露undefined optional unknown经JSON复制消失，改为复制前验证原始字段。
- p3-red→p3-green：真实两tick归档、合法release、关闭prepare及写前CAS。
- p4-red→p4-green：原生窗口跨轮误拦，以及旧回调通过新policy包络误关新身份；包括旧运行套件124/124。
- p6-replay-red：被拒绝的trialId可换native id复用；现在两种id都保留在有界拒绝日志。
- parent-clock-red、legacy-extra-red：未来父时钟、把v1未知可选history误解释为v2；分别定向GREEN。
- review-binding-red、review-start-red、maintainer-history-red：见下节；最终完整720重新运行，未沿用修复前707/719冒充最终结果。

`p6-chain-red`这个早期文件名的实际结果为PASS，ledger明确没有把它冒称RED。两轮完整链是前面各项RED修复后的整体验证；保持原测试标准，没有把预期改成现状造绿。

## 一次独立review及维护者处置

同一个独立reviewer在容量中断后继续并完成，未再派第二个reviewer；全程只读，无产品修改或线上操作。最终给出2项Important，无已证实Critical或另列Minor；原文证据及主代理处置保存readonly-review.md。

1. **父binding漏检**：合法binding slot无callState时被当quiet。主代理独立RED后，后继Facts单独拒绝binding，不改原slot、不取消原claim、不扩大legacy语义。
2. **canonical start未绑定**：激活后同身份的issuedAtMs/expiresAtMs被改仍能接纳并产生首个scout调用。主代理同时复现时间和不同trialId两类变动；现在经济/动作检查点严格核对完整canonical请求，未接纳的活跃handoff不能退化为无native所属的执行路径，cleanup同tick撤回本次pending activation。

维护者额外核对并修复：初始父证明缺operationEpoch对照（safety-gates-audit RED）；owned stop提前读取损坏history而抛错（maintainer-history-red）。后者改为已知owned路径不依赖parent档案读取，无法证明的staged路径保持拒绝；没有重建损坏证据。

review修复最初定向4/4、后续维护者组4/4，最终完整720/720。没有声称reviewer独立复审了最后修复；最终修复由主代理按原断言和完整套件验证。

## 实际覆盖与限制

本地真实服务顺序从v1单次submit跑到父轮结束，再归档→合法release→新scout出生/移动/跨房→独立100安全ticks→miner/container/hauler→指定terminal严格次tick入库→关闭；下一代继续接纳，无需改产品常量。单Spawn母房同级hauler补员让miner等待至少30ticks，正式5tick期限只在实际获位后绑定，原全轮截止不变。

旧actor退场是明确测试引擎输入，且先确认无未决claim；没有删旧Memory账、grant或unknown。原生动作的资源变化在fixture下一tick应用；未手填safeStreak或用直接适配器调用替代完整链。上述均为禁止网络的Game模拟，不是线上观察。

容量为最多4份父档案、65536总字符，当前记录预留16384字符；16条拒绝满额不淘汰。真实重复换轮测试可能先触及字符预算，已验证拒绝后current/history原值保留，不能承诺所有大档案都可填满4份。四份数量硬拒绝在validator/接纳代码中；本地完整真实链未构造“恰好4份且仍有足够字符空间”的第五轮，这是容量覆盖的具体限制，不将其表述为4轮线上验收。

历史生产v1 fixture取自已保存tick83818396的限定native/economic对象，只用于旧字段兼容、归档原值和新旧codeVersion分离，不包含凭据或完整Memory，不能作为当前启动事实。固定target、预算、100安全ticks、原leg/重试、默认关闭和保护开关均有回归，未扩大目标或body。

仍保留：尚未接纳的中断恢复须按真实状态另行设计/授权；tailStatus自动归约未实现，仍unverified；容器期初库存与新产出分别报告，不能用首批/全绿测试宣称长窗口净盈利。

## 固定的本地候选与下一步

- 基线HEAD919ec9f6be5866a6bae5e61d81ba11b72480b7f8，分支codex/single-remote-mining；本次改动未暂存、提交、推送。
- 本地SERVICE_VERSION：1792741537648，尚未部署。
- dist/main.js SHA-256：b956c91d84f40948bf1ef24e1ccc52faa5a50d42d17e4f04e24730709ae65dfa。
- dist/main.js.map.js SHA-256：14ed51e5ff2a234545bebc66f572b76b677657847af7ad5e7953ea4ab0673de1；这是Rollup/Screeps插件输出的JSON map文件，不是臆造的dist/main.js.map路径。

后续须先取得默认关闭版本的提交/推送/部署授权，再只读核对服务器指纹、执行版本和旧记录兼容。母房spawn_energy的原因与新鲜normal状态仍未验证，不在本功能中放宽。即使发布成功，仍要重新预检版本、母房、预算、连接与旧锁，再批准明确日期、时间窗及唯一请求，才可开启首批入库试点。当前不产生或发送生产执行卡。
