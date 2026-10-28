# 首次接纳诊断回执：发布候选准备

用户于2026-10-28明确授权定向提交、推送及默认关闭部署。当前仅冻结候选与准备发布入口，尚未声称线上发布成功。

候选源文件hash复用本地交付completion.json并逐一重新核对；发布前完整离线复验记录为 `.superpowers/sdd/2026-10-27-home-evidence-admission-diagnostics/verification-04-release/`。新发布比较器额外核对旧失效home请求而非错误要求request=null，已RED→GREEN并与原发布模型/比较器联合15/15通过，不改线上请求。

发布产物固定版本1793094591937：main `1cc767447db745d87d1f6621dd35f608dc5a15dde34dd7dec9e80ccd154bfac7`，实际上传map `fbd80e6761d64d3d4bf132436a83f13f6ce70886ab15f81f5c5fe716e70af6e6`。代码来自既有隔离build-02，不复用旧root dist。

本地发布检查发现build-02的.map.js实为原始JSON，new Script检查将其拦截，尚无联网/Git/上传。保留原产物，将map在新artifacts中包装成等价module.exports模块，main完全不变；包装可执行性、内容等价与非法输入拒绝新增RED→GREEN。发布工具联合17/17通过，完整950/950游戏与46/46 HTTP及smoke/Governor新鲜复验通过。该包装修复只影响上传格式，不改生产策略。

一次独立只读review的实质问题已修复，保留CPU样本标注Minor；重置丢失原确认链时停采、不自动续录。源代码、测试和配套四份设计/诊断文档及本卡范围以新manifest清单为准；旧原始记录/锁/凭据/生产运维入口和混合进度文档排除。

具体网络、Git和单次上传边界见 `../plans/2026-10-28-home-admission-diagnostics-disabled-release.md`。失败即停、unknown不重传，不修改共享网络，不开启观察窗/侦察/采运/Goal-Plan/市场。
