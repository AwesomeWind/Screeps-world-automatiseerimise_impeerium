# 发布连接只读诊断与备用节点提案

本轮Goal恢复后重新进行阻塞审计。只读诊断没有修改共享代理、TUN、DNS、规则、订阅或线上Memory；没有提交/推送/部署，也没有重发已有浏览器只读查询。

## 当前证据

| 检查 | 结果 |
| --- | --- |
| 既有浏览器查询 | 仍只有客户端回显，没有运行结果 |
| 本地代理 | rule、mixed-port7897、TUN/gVisor/auto-route开启 |
| 当前Screeps路由 | 漏网之鱼→选择节点→美国A01 |
| SDK /api/auth/me同窗捕获 | 10秒后空HTTP502；未捕获到可直接对应的节点入口TCP超时警告 |
| 显式CONNECT到screeps.com | CONNECT200，当前解析135.181.56.80，随后TLS12秒超时 |
| 显式CONNECT到已观察地址95.217.113.148 | 保留SNI=screeps.com和证书校验，同样TLS12秒超时；未到发送鉴权HTTP的阶段 |
| 控制器对同URL https://screeps.com/ 的只读delay探测 | A01返回504；已配置的A02返回200、378ms；前后选择器仍为A01 |

CONNECT200仅证明本地代理接受隧道，不证明TLS或鉴权成功。上述两次TLS失败均未发鉴权HTTP，不能归因token失效。当前同窗没有旧记录中可直接对应的节点入口TCP超时链，不能借历史根因替代本轮证据。A02的首页探测成功也不证明鉴权、Memory、WebSocket或持续发布连接稳定。

## 具体待授权变更

[本地提案JSON](../../../.superpowers/sdd/2026-10-20-first-delivery-economic-trial-guard/network-switch-proposal.json)记录准确选择器、前后节点、仅两项PUT选择操作及恢复条件，当前executed=false/authorizationReceived=false。

提案为：临时把“🔰 选择节点”从“🇺🇲 美国A01 | IEPL | x1.5”改到已配置的“🇺🇲 美国A02 | IEPL | x1.5”；先验证只读鉴权/Memory、代码指纹及新备份，全部通过后再执行已获授权的默认关闭版本提交/推送/部署；在A02上完成部署后只读核对，然后无论成功或失败都恢复原A01。若发现用户/其他进程已改选择器，不覆盖其新选择，停止并说明。

只改临时节点选择，不改TUN、DNS、规则或订阅；可能影响匹配同组的Codex和其他应用新连接。用户既有发布授权不包含共享代理改动，因此需要这项单独授权，不重复索取提交/发布授权。侦察、实际采运、Goal/Plan及任何旧锁release仍未授权。

## 原始记录

均在本计划SDD目录：proxy-state快照、capture-state事件、proxy-https两个TLS对照、proxy-delay-comparison及network-switch-proposal.json。诊断程序只输出目标链路摘要，没有输出凭据或完整Memory。TLS尝试保留各自独立时间点，不拼成连续窗口；诊断进程均已终结，不伪称持续观察。

本地候选SERVICE_VERSION=1792547219792与512项验证仍只是待发布产物。总体远程经济目标尚未完成，下一步是等待共享选择器临时变更的明确决定。
