# 母房自然行为窗口：回归与验收计划

日期：2026-10-27（Asia/Shanghai）

状态：配套候选设计的回归矩阵，不是已批准实施计划。本轮仅设计/本地诊断，不新增产品实现、联网、提交或部署。

设计：`docs/superpowers/specs/2026-10-27-home-natural-evidence-window-design.md`。

## 1. 先验证缺失机制

本轮已执行真实现有 Service/Model 的本地实验：关闭时零写入/零事件读取；没有 request 同样不建 namespace；合法请求但缺经济接纳只会 armed→not_started。上次 HTTP 包络是 missing，不是损坏压缩数据。

证据：`.superpowers/sdd/2026-10-27-home-natural-evidence-design/diagnosis.json`。该实验不模拟或证明新母房录制器已经存在，也不是服务器采样。

## 2. 未来测试位置与生产链

建议与既有测试并列新增 `src/tests/home-evidence-window-{model,facts,runtime,report}.cjs` 和一个窄 fixture，产品分层按 HomeEvidenceWindowModel/Facts/Service/Report。遵守现有 src/services、src/config 和 src/tests 的 AGENTS.md。

fixture 复用现有自然母房策略与 ActionParser 的下一 tick 生效机制，准备已存在的本地 creep/source/store，不提交任何 remote/native/economic 请求，不为取得接纳调用经济试点 fixture 的 submit/start。事件只在下一 tick 应用成功动作后生成，并明确 `simulated`。

只在需要外部依赖的边界注入时钟、Memory provider、原生事件 provider、CPU样本或HTTP transport；不得通过 mock collector 自己的返回值证明 collector正确，也不在生产类增加测试专用行为。

## 3. 必须推翻的失败假设

| 组 | 关键反例与边界 | 应有结果 |
|---|---|---|
| 默认关闭 | 没有 homeEvidence 配置；false/null；旧经济观察开关false；只调用 status/report | 无观察namespace、无原生事件读取、无单位/业务写入；查询不 ensure |
| 接纳独立性 | 完全没有经济会话；只有旧terminal/native记录；原经济锁managed；历史包络enabled=true但已失效 | 自然窗不要求经济身份、不release旧锁；确认实际权限关闭才接纳；不改历史包络 |
| 请求类型与新鲜度 | 数字字符串/NaN/负数、小数、缺字段、额外URL/callback字段、未来issuedAt、30秒与+1、tick区间10与11 | 严格拒绝非法请求，不重算起点或把unknown改false |
| 身份隔离 | 同ID修改参数、另一个ID重试、错误版本/shard/房间/profile、已有封存/损坏/pending窗 | 拒绝覆盖；不借旧窗cohort或已消耗额度；保留旧记录 |
| cohort与对象 | 已spawning、外来/远端单位、原生不可枚举pos、同角色多名、死亡后同名新ID、候选200/201、对象16/17 | 选择稳定且有界；不孵化/替换；缺失/超额明确；未采目标没有历史快照 |
| 原生事件 | 不存在getEventLog、抛错、非数组、128/129条、32/33相关事件、任意data、非法ID/金额/资源 | 每tick至多一次；unsupported/overflow/partial，不复制任意字段或填0 |
| tick归属 | T−1事件在T读取；第一行没有前态；最后一行新意图未生效；重复同包/不同包、缺tick后恢复 | 不把OK当资源；第一/末边界不多算；重复不累加、冲突不覆写、缺口不补帧 |
| HARVEST配对 | 唯一正常采集；source再生；第二miner竞争；actor同期消费/外来输入；缺source前态；只有store变化无事件 | 只在金额与双端delta及完整性一致时标单次一致；其余未证明，不乐观分摊 |
| TRANSFER方向 | 正向creep→storage、withdraw反向、link含损耗、同tick双向/多个actor写同目标、目标退出集合 | 正向有完整双端证明才一致；反向/并发单列；不冒充远程入库 |
| 时间停止 | 100个观察tick与第101个；10分钟恰好到期；停顿/CPU跳过、服务重建、迟到请求、wallclock倒退 | 原lastAllowedTick/墙钟截止不变；不为补满100行续窗或补读最后结果 |
| 撤回与环境变化 | 中途enabled=false、请求被删/改、母房失视野/所有权、hostile、业务权限变化或未知 | 立即不读事件/对象；尽力封存原窗；不自动关闭业务或修复配置；无额外Game动作 |
| CPU与容量 | bucket4999/5000、剩余6.999/7、采集中跨2CPU、CPU不可读、UTF-16恰好131072/+1、seal/pending预留不足 | 预算检查覆盖阶段；软超限留下缺口；候选拒绝/partial，不删开头或越限写入 |
| 写入异常与重置 | pending前/后抛错、final写后丢响应、读回不一致、JSON重载、同tick重建、unknown admission再换ID | 不重放未知包；同一原期限与身份；缺口保留；不因无失败日志认完整 |
| 业务隔离 | 相同自然fixture下关闭/开启/采集异常，贯穿策略→ActionParser→cleanup→下一tick | Game动作、任务、spawn、经济账、原guard结果一致；差异仅限观察namespace和诊断遥测 |
| 封存报告 | 无HARVEST/无TRANSFER、旧版本、simulated数据、active窗、未封存或部分窗、封存后当前业务改变 | 逐项未证明/partial；不升为production_verified、不读当前业务补历史，无passed/permission输出 |
| HTTP profile隔离 | 自然profile收到经济store及反例、任意path/host、missing自动换路径、旧消耗目录重开 | 固定枚举和schema配对，拒绝混用；一次GET额度不因missing/解码失败增加 |
| HTTP资源边界 | gzip/Base64/UTF8/JSON坏数据、字节上限、多字节字符、取消/迟到响应、15秒与60秒原截止、401/429/502 | 有界失败，安全错误，无token刷新/重定向/重试；原始文件不覆盖 |
| 查询与持久化 | 关闭后读取旧窗、查询前后Memory一致、读分页/报告、断网后本地解码、真实与fixture来源 | HTTP只下载；全程不写业务、不标“已导出”；本地哈希与实际传输元数据分离 |

边界case按可独立失败的行为拆分，最终数量以实际执行结果计，不预填通过数字。异常用例在hook外检查原业务关闭，不能在hook内的assert被服务catch吞掉后假通过。

## 4. 完成实施时的本地验证门槛

1. 按批次写最小失败回归，观察 RED 的失败理由，再实现 GREEN；测试本来通过时记录“已有行为”，不伪称新功能修复。
2. 跑新增组与受影响组；共享HTTP基础改变后，必须重跑现有27项下载/解码及7项单次入口回归，保持旧经济 profile 契约。旧 `online-attempt-01` 是已消耗证据，任何测试都不得使用或删除它来获得生产额度。
3. 完整运行 package.json 的 test（含smoke/Governor），报告真实计数及全部失败，不以本地fixture升级生产语义。
4. 仅在实现涉及游戏源码后做隔离目录 dry build；先切到全新空构建目录，再导入Rollup配置，避免清空现有root dist；不给DEST生产目标、不加载凭据、不上传。
5. 检查 git diff/cached diff、旧源码兼容、旧锁/日志/样本哈希和默认开关。新增数据只在自己的 namespace；主代理做维护者自检，不自动调用子代理。需要独立review时由用户另行决定。

本轮只有方案和诊断，没有上述新增实现，因此没有执行新母房窗口回归、完整测试或构建，也不把已有868/868描述成新功能通过。

## 5. 未来真实验收分开进行

| 阶段 | 许可与记录 | 验收对象 |
|---|---|---|
| 默认关闭发布 | 另行授权提交/推送/发布并短核对，不开任何窗口 | 新代码/默认关闭与旧记录兼容 |
| 母房自然采集 | 另行授权一个100观察tick/10分钟窗口；不发测试动作，其他功能仍关闭 | 自然API支持、形状、相邻tick、CPU与有界留存 |
| 一次HTTP下载 | 全新明确额度，15秒请求/60秒总窗、最多一次GET、缺失/失败即止 | 下载与解码、窗口身份/封存/覆盖 |
| 后续经济验收 | 独立设计和授权，重新做母房/预算/版本/安全预检 | 真实远程安全、采出、入库、费用与关停 |

真实自然窗缺少目标行为时，这轮可以正常封存并交付“未证明”，不能强派creep、修改任务、制造能量转移或自动延长。下载成功、100 tick计时达标、窗口封存和真实采运通过是不同结论。
