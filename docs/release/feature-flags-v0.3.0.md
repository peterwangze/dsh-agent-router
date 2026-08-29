# v0.3.0 Feature Flags（功能标记清单）

| 项 | 值 |
|---|---|
| 发布版本 | v0.3.0（candidate） |
| 文档角色 | v0.3.0 发布面 flag 清单：缺省值 / 灰度策略 / 转正评估 / 关闭验证语义 |
| 依据 | version-plan-v0.3.0.md §3（Feature Flag 状态 + Kill-switch 验证语义）+ DEC-018/020/025 + lib/schemas.js 实读（:220/:223/:228/:238）+ REL-003 R0 门控一致性复核 |

---

## §0 本件先例归属（REL-002 Release F-1 修正——先例引用可溯）

- **三件套中的 checklist + rollback** 两件系 **v0.2.0 / DEV-003 惯例**（EV-024）；
- **v0.2.1 / REL-001 发布件为 CHANGELOG + bump + README + tag + tarball 离线验证**（EV-037）——**无三件套**；
- **feature-flags 件为 v0.3.0 新增**（超出先例的增强，方向正确——本文件即其首次落地）。

> 本节修正 version-plan §1.1 原表述将「三件套」整体归入 v0.2.1 惯例的失准（Release R0 F-1，P2）；version-plan §1.1/§4 M-1 已随本次 M-1 同步拆分。

## §1 v0.3.0 发布面 Flag 清单

| Flag | 缺省 | 引入版本 | v0.3.0 状态 | 源码锚点（实读） |
|---|---|---|---|---|
| `router.oauthExperimental` | **false** | v0.2.1（不可见预置——CHANGELOG v0.2.1 节·变更；原引 :29 已随 v0.3.0 节前置漂移，R1 F-5 改节锚） | **v0.3.0 打开后 C-1 全量可见可用**：preset 账号一键登录（1455 回调 + 设备码降级）+ 账号卡 + codex-responses 协议分支 + 登出删除。**→ v0.3.1 已转正移除（EVO-006 / DEC-026 C2）——见 §3 评估结果注记** | lib/schemas.js:223（转正前锚点） |
| `router.takeoverDefaultModel` | false | v0.2.1（FIX-002） | **不在本次范围**——状态如实记录（多模态接管开关，行为无变更） | lib/schemas.js:220 |
| `router.stats.persist` | **true** | **v0.3.0（C-3 新增）** | 缺省落盘开启——**数据行为变化，CHANGELOG 显著披露**（Release F-3：落盘 `$DSH_HOME`、按天 JSONL、默认保留 90 天、关闭开关 `router.stats.persist=false`）；false = 回纯内存态（回退锚点，W-4 往返语义） | lib/schemas.js:238 |

配套确认位：`router.oauthTosAccepted`（缺省 false，schemas.js:228）——首次开启 `oauthExperimental` 时 ToS 风险声明（UAYOR 措辞）确认后随开关置 true；**服务端复核**（oauthBegin preset 分支）：手改配置绕过弹窗也不能发起登录。**→ v0.3.1 随实验开关一并废弃移除（EVO-006 / DEC-026 C2）：ToS 实验声明转为「平台 ToS/账号风控提示」（非阻断），服务端复核门随转正移除。**

## §2 灰度策略

### oauthExperimental（C-1）—— self-select 灰度 + 三层 kill-switch

| 项 | 策略 |
|---|---|
| 放量模型 | **缺省 false = 全量用户默认不可见**；灰度单位 = 用户主动开启（self-select canary）——deploy ≠ release（发布与启用解耦） |
| 开启前置 | ① ToS UAYOR 确认（不可绕过——服务端复核）；② 代理可达（chatgpt.com 需代理，auth.openai.com 直连——EV-028 实证；`oauthProxyUrl` 可配 + 环境变量回退发现） |
| 灰度看护 | C-9 埋点 v0.3.0 起采集（登录/调用事件）——**报告 v0.3.2 出**；灰度期数据采集不预支结论（No-overclaim） |
| 三层 kill-switch | ① `router.enabled` 总开关（全域）；② 账号级 `enabled`（单账号）；③ `router.oauthExperimental`（实验通路层——关 = 入口隐藏 + 调用明确报「实验通路已关闭」+ 1455 零监听） |
| 最坏回退 | preset 分支下架单 commit（R-E1 兜底——ADR-005 可逆性） |

### stats.persist（C-3）—— 全量即时生效（非灰度）

- 缺省 **true**：升级用户统计行为即刻从「内存态重启清零」变为「缺省落盘」——无灰度过渡，故以 **CHANGELOG 显著披露**（Release F-3）+ **等价回退开关**（false 回纯内存）+ **数据安全四件套**（原子写/损坏自愈/版本迁移/清空保护——EVO-003）对冲。
- 灰度替代看护：stats 域 110 断言单测 + W-4 往返语义单测（M-3 复跑）+ 48h 观察期回滚触发条件之④（落盘损坏且自愈失效）。

## §3 转正评估（flag 债务控制——建议 ≥30 天后清理，防 flag 腐烂）

| Flag | 转正条件 | 评估时点 | 移除语义 |
|---|---|---|---|
| `oauthExperimental` | **≥30 天稳定运行 + 出口①真机首联持续可用 + 无 R-E1 风控升级事件** | v0.3.x 后续版本裁决（version-plan §3：于 v0.3.x 后续版本移除）。**评估结果（v0.3.1 / EVO-006）：条件满足，用户裁决转正（DEC-026 C2，2026-08-29——真机验证 OAuth 登录可行 EV-081/083，恰满窗）→ flag 已移除** | 移除 flag = C-1 转常量默认开启（入口不再带「实验」限定——需同步 UI 文案与 ToS 语义复审）。**已执行（v0.3.1）：开关与 ToS 确认位废弃；关闭能力由 ① `router.enabled` ② 账号级 `enabled` ③ 登出删除（W-5 恒可用）承接；升级兼容 = 旧配置遗留键未知字段透传（判别测试 tests/oauth-promotion.mjs）** |
| `takeoverDefaultModel` | v0.2.1 既有——**本次无变更**；转正评估维持 FIX-002 裁决口径（DEC-022：缺省 false 用户主权） | 随 v0.3.x 演进复审 | — |
| `stats.persist` | **永久配置项而非临时 flag**——非转正候选（它本身即行为开关）；评估项改为：运行 90 天+ 无损坏自愈事件 → 可评估将「落盘缺省」语义固化为文档承诺 | v0.3.x 复盘 | 不移除（保留回退锚点 = ADR-006 可逆性要求） |

## §4 关闭验证语义（kill-switch「验证过可以」，非「应该可以」）

**发布门禁要求**（version-plan §3）：`oauthExperimental=false` 时 ① preset 入口不可见 ② 既有账号行为零变化 ③ 登出删除后凭据文件不存在——三者以**断言/实测留痕**形式进入 M-3/M-1 checklist，**不接受推定**。

| Flag | 关闭后行为 | 验证方式 | 证据状态 |
|---|---|---|---|
| `oauthExperimental=false` | 入口隐藏 + 调用报「实验通路已关闭」+ 1455 零监听（惰性启动不触发）+ 既有 OAuth 通用账号/API Key/其它通路零影响。**→ v0.3.1 转正后本行语义退役（EVO-006）：关闭态由 `router.enabled=false`（总开关）、账号 `enabled=false`（调用/发起授权明确拒绝）与登出删除承接——tests/oauth-promotion.mjs B 组判别** | smoke oauth 域断言（M-3 复跑 exit 0——GATE-3）；门控前置链 `flag→ToS→starter→loopback` 严格前置经 EVO-005 R0 门控一致性裁决 | ✅ 已验证（断言在案 + 持续复跑机制） |
| `router.enabled=false` | route_agent 拒绝调用 + 提示段清空 + 统计暂停；恢复即还原 | smoke 既有断言（v0.2.0 EV-013/EV-019 先例） | ✅ 已验证 |
| 账号 `enabled=false` | 单账号停用（池选号跳过） | 账号池域断言 | ✅ 已验证（EVO-002 链） |
| `stats.persist=false` | 回纯内存（v0.2.1 行为）；false 期间不读不写磁盘；往返不损已落盘数据（开→关先 flush；关→开全量恢复） | W-4 往返语义单测（stats 110 基线，M-3 复跑） | ✅ 已验证（EVO-003 R1/R2） |
| 登出删除（W-5） | 删凭据文件 + 清 oauthAccounts 条目 + 清池引用；登出×兑换竞态窗口闭合（persist 前 cancelled 复查） | 登出后文件不存在断言 + 竞态判别测试（真实构造交错，三重判别） | ✅ 已验证（EVO-002 R7/R8 + REL-003 dcd44fa/R0 复核） |

## §5 Flag 变更流程与触发条件

| 项 | 约定 |
|---|---|
| 启用/关闭权限 | 用户（设置页操作）；`oauthExperimental` 开启必经 ToS 确认弹窗（服务端复核兜底）。**→ v0.3.1 转正后无开关无弹窗（EVO-006）：通道恒可用，关闭走 ①/② 层开关与登出删除** |
| kill-switch 触发条件（不依赖人的临场判断） | ① 观察期 P0/P1 新 bug；② GATE-1 已验证路径复现断裂；③ RISK-003 宿主漂移（parity 变红）；④ R-E1 风控升级信号——任一满足即先关 flag 止血（rollback-plan §触发条件） |
| 变更留痕 | 用户裁决类 flag 语义变更（转正/移除/缺省翻转）走 decision-log + 变更控制；本清单随版本更新 |
| 负责人 | kill-switch 执行 = 用户/Coordinator（单机本地插件——无值班 rotation 需求，如实记录） |
