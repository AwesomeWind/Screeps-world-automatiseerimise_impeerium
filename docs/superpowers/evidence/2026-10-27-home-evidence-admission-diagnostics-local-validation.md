# 母房自然采集首次接纳诊断：本地交付记录

日期：2026-10-27。范围：用户认可的六批本地实现与一次独立只读review。工作区为 `C:/Users/mts-2/.codex/worktrees/single-remote-mining/automatiseerimise_impeerium`，HEAD保持 `48dfc0e75d1b71a5101d910364b6620eb530b4e6`。

## 实现结果

- 新运行采用同一路径的Store v2，先确认reserved回执，再经原gate/selection正式接纳，之后才读取事件。正式接纳与首行分别报告，拒绝也可下载诊断；v1旧记录继续只读，不自动迁移。
- 首因、原请求、首次观察时钟固定；保留gate子项、选择器具体原因/计数与有界CPU槽位。未知或未观察数据为null，不从角色名字、邻近tick或配置ACK补造。
- 提交使用CAS、pending/final与精确读回；结果不明不自动重写，也不换ID补开。CPU不足且明确尚未调用写入时，只能在原身份/原期限内封存已观察诊断，不重走gate、选择或admit。
- 报告和HTTP兼容v1/v2；rejected、unknown、interrupted、accepted_no_row均不是采集通过。查询不创建namespace、prune或修改最后访问时间。
- 原接纳锚点、新鲜度、100观察tick/10分钟、候选/对象/事件/容量、CPU门槛和业务关闭边界未放宽；main生命周期、scheduler、默认policy与远程服务未改。

## RED→GREEN记录

工作目录：`.superpowers/sdd/2026-10-27-home-evidence-admission-diagnostics/`。逐批日志保留，不覆盖失败结果。

| 批次 | RED | GREEN及范围 |
| --- | --- | --- |
| 1：v2纯协议 | `01-red.txt`：5项缺失行为失败 | `01-green.txt`：13/13，新旧模型 |
| 2：gate/selector诊断 | `02-red.txt`：5项诊断缺失失败 | `02-green.txt`：14/14，新旧Facts |
| 3：持久提交/时序 | `03-red.txt`：5项缺失行为失败 | `03-green.txt`：23/23，新旧runtime，保留关闭优先 |
| 4：跨tick/重建 | `04-red.txt`：2项延后诊断缺失失败 | `04-green.txt`：41/41，原期限、未知及CPU提交阶段 |
| 5：报告/HTTP | `05-red.txt`：4项报告或codec缺失失败 | `05-green.txt`：25/25，新旧报告和HTTP |
| 6：维护者反例 | `06-boundary-red.txt`：2项格式/未知语义失败 | `06-boundary-green.txt`：33/33新增接纳套件 |

`03-green-first.txt`/`04-green-first.txt`保留接入失败：v2封存使用旧key、nullable window测试hook、测试中旧v1运行时输入和reserved误标accepted。分别修正正式提交键、更新新版本fixture及接纳标记位置；未放松原关闭断言。

## 完整验证与仅构建

`verification-02/result.json`及编号日志：

- smoke：通过。
- room-governor：通过。
- 原游戏清单914项（含新增报告反例）及三个admission套件33项，共 **947/947**。
- HTTP目录五个套件，共 **46/46**。
- 所有测试子进程加载离线guard；原始采样/结果/混合进度文档/root dist共77份保护文件hash匹配，暂存区为空。

`verification-01`是本地runner将Windows绝对路径作为ESM --import输入导致的启动错误，尚未进入产品测试；改为file URL后完成上述验证。该错误保留，不冒充产品RED。

`build-01/result.json`：在新目录隔离Rollup dry build成功、upload=0；未读取部署凭据，原root dist未改。

- main.js SHA-256：`51b69c209c127d9e6ff74591acfce4a22e039fb46c97279bfabca6db056357c6`
- main.js.map.js SHA-256：`f8b706083f899ac184265a513f88940a01dff5178d1d9e0de314078814c51b2c`

这些是本地候选产物，不是服务器版本或部署证明。若独立review产生代码修复，以后续验证与构建记录为最终候选。

## 方案细化与保留限制

1. Windows下使用Node本地runner代替Bash技能脚本，保存全部工作区证据，不执行技能默认提交/清理步骤；代价是需要显式ledger与hash核对。
2. 纯Model保留旧v1构造器供既有fixture/codec使用，生产Service只通过v2 reserve/admit新写入，旧运行时v1数据只读；不能把fixture构造当作真实接纳。
3. CPU槽允许可选commitKind，避免同tick的reserve/admit/capture样本混淆；未采到仍null，不为补afterFinal额外写入。

已持久化的rejected/accepted/pending记录通过JSON和模拟global重建验证；Memory完全不可写、首次写入结果不明且无持久marker、硬引擎终止或真实global reset前未落盘首因，不能保证恢复。保持原锚点且不补开；实际引擎reset和CPU成本尚未验收。

本轮修复可下载诊断与防重放机制，**没有唯一确定83898135生产未启动的根因，也不保证下一次实际采集必然成功**。原生getEventLog语义、真实连续采集及经济验收均未进行。

## 独立review与交付状态

一次独立只读review已完成：原发现Important两项、Minor两项，无Critical。主代理复现三个反例并完成一次修复：admit final未知后重建续采、提交CPU失败误归因selection、未访问gate字段为true（按核心诊断影响将第三项上调处理）。review-red三项失败→review-green定向70/70通过，未派第二次review。

修复采用保守取舍：持久accepted但无首行只证明admissionPersisted，不宣称admissionConfirmed；失去同原身份的运行时读回确认链后停止采集、保留Memory，不从裸候选自动恢复。这会让实际global重建后的合法窗口也提前中断；不补开、不延长期限。已有证据留存与自动续录是两件事。

保留Minor一项：额外的无kind afterFinal预算检查可能覆盖reserve样本的commitKind。该样本仍保留真实CPU数值；不应将它解释为确定的admit提交后成本。其余准入、安全预算、停止、数量、业务权限与unknown不重放不依赖该标注。

review原结果、反例及裁决见 `.superpowers/sdd/2026-10-27-home-evidence-admission-diagnostics/review-result.md` 和 `progress.md`。评审未独立重跑完整suite；以下最终验证由主代理执行。

### 修复后的最终验证

`verification-03/result.json`：smoke与Governor通过；游戏 **950/950**（914＋8＋7＋21）；HTTP **46/46**。77份保护文件hash匹配，暂存区仍为空。完整结果替代前述verification-02作为最终候选验证，前次日志保留。

`build-02/result.json`：最终隔离dry build成功，无上传；root dist未改。

- main.js SHA-256：`1cc767447db745d87d1f6621dd35f608dc5a15dde34dd7dec9e80ccd154bfac7`
- main.js.map.js SHA-256：`f69574acda52fc2c71901c637a921c7bdae88b02c3a3f489409962aea29fe0d1`

评审未判断的实际API、硬CPU、真实global reset/持久保证、旧生产根因和经济验收继续列为未证明；混合进度文档与旧生产运维入口保持原样。Node runner/保留工作区、纯v1 fixture构造器、commitKind及保守重建停采的全部取舍如上和ledger记录，不能作为上线或重新开窗授权。

未联网、未读取凭据、未提交/推送/部署、未改网络、未重开观察窗或业务；线上关闭状态本轮未重新读取。候选保留在本地工作区，等待用户后续指令。
