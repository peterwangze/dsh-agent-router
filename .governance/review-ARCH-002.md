# ARCH-002 设计审查报告（Design Reviewer 独立审查）

| 项 | 值 |
| --- | --- |
| Task ID | ARCH-002-REVIEW |
| Round | **R1**（首轮；审查即 Bar Raiser 独立评审角色） |
| 审查对象 | `docs/architecture/evolution-roadmap-v1.md`（662 行，Architect 产出，2026-08-20） |
| 审查人 | Design Reviewer Agent（独立 spawn，只读审查，唯一可写本文件） |
| 审查日期 | 2026-08-20 |
| 依据 | 角色 6 维 + design-review SKILL 4 维合并；上游 DEC-017/018/019 按已定案消费（decision-log 核实在案，不做需求层复审） |
| 证据核查方式 | pi-ai 0.82.1 本地源码实读 + `.router-files/` 快照实读 + 本项目 lib/tests 实读（全部经 read/grep/glob，无命令执行） |
| 终态结论 | **APPROVED_WITH_NOTES** |
| unresolved_blockers | **0** |

---

## 1. 维度结论表（角色 6 维 + SKILL 4 维合并）

| 维度 | 结论 | 要点 |
| --- | --- | --- |
| 设计合理性 | ✅ 通过 | 三新模块单一职责（凭据存储/统计持久化/失败分类各 ≤3 句且实质单一）；接口最小化可版本化（凭据文档 version 字段+严格校验，stats 行 `v` 字段+迁移链）；数据模型满足现需求且有扩展位（preset 机制、per-protocol 能力接口、failure 枚举可扩） |
| 技术债务评估 | ✅ 通过 | 零新运行时依赖（E1-a 自实现，排除 pi-ai 全量库——理由实质）；service.js 巨石缓解方向正确（统计分离抵消新增膨胀）；无过度工程（O 清单 7 项显式不做；C-8 标可选）；刻意承担的债务（1455 死值、originator 依赖）均显式化为外部约束+降级链 |
| 安全与合规 | ✅ 通过（含 1 项 W 级缺口） | 凭据 owner-only+原子写+跨进程锁+严格校验（H3-13 先例逐项核实）；默认关闭+显式确认+三层 kill-switch+一键删除；统计无敏感内容、CSV 列白名单；诚实 originator 不伪装官方 CLI。缺口：非登出路径删账号条目时凭据文件残留（W-5） |
| 可演进性 | ✅ 通过 | preset 可扩 anthropic（C-2 增量已量化）；`oauthCapabilities(protocol)` 为 Q2 解除路径单点；pricing 表可扩 per-image/audio；p95 reservoir 降级接口预留；废弃/迁移路径显式（数据安全四件套之版本迁移） |
| 方案完整性 | ✅ 通过（含 1 项 W 级陈述失实） | 关键争议决策全部有 ≥2 候选+实质排除（E1/E2/E3 各 3 候选、E6/E7 各 3 候选、§5.3 重试通路 2 候选）；自检清单"九个决策表"计数失实（W-3） |
| 蓝军挑战 | ✅ 通过 | BC-E1~E7 全部存在且缓解非空洞（逐条含可执行措施+交叉引用）；本轮独立新增 5 条推演（§4），其中 2 条构成新 finding、1 条 S 级、2 条确认设计已覆盖 |
| 模块结构 | ✅ 通过 | 职责 ≤3 句 ×3；依赖图独立推演无环（§3 硬门槛 5） |
| 接口契约 | ✅ 通过 | §3.3 OauthCredentialStore 接口草案+4 错误码；§4.3 指标表（含 CSV 列清单）；§5.1 分类器纯函数契约（输入→{class,retryable,retryAfterMs}） |
| 非功能需求 | ✅ 通过 | §9 五维逐项对照且各有验证列（加载 200ms 预算单测、record push-only 断言等） |
| Bar Raiser 评审 | ✅ 本审查即独立评审 | 结论明确（见 §6 终态） |

---

## 2. 硬门槛逐项判定

| # | 门槛 | 判定 | 说明 |
| --- | --- | --- | --- |
| 1 | Design Doc 五段最小结构（目标/方案/替代方案/风险/非功能） | ✅ PASS | §1 目标与范围 / §2-§5 方案（分期+三主线模块级设计）/ 替代方案（§3.2+§4.1+§5.3 候选表）/ §10 风险与回滚（R-E1~E7）/ §9 非功能五维——逐段存在且实质（非占位） |
| 2 | 关键决策 ≥2 候选 + 排除理由（九决策点逐一核查） | ✅ PASS（实质）| 显式候选表 6 处：E1（a/b/c）、E2（a/b/c）、E3（a/b/c）、E6（a/b/c）、E7（a/b/c）、§5.3 重试通路（候选1/候选2+排除理由）。E8 无表但行文含双候选与取舍（本地单价表为基础 vs OpenRouter 端点 cost 直读优先，理由实质：本项目服务商含中转、无平台侧注入条件——S-1 落盘文件核实）。E4 为约束推导（1455 为 client 注册死值 H3-3，无端口替代空间；降级 A 设备码/B 手动粘贴**双采纳**，无排除对象）。E5 为 E1-a 的派生接入点（其替代已在 E1-a vs E1-b 权衡）。**判定理由**：门槛防的是"替代缺失隧穿视野"——所有存在真实替代空间的决策均满足 ≥2 候选+实质排除；E4/E5 无被隐藏的可行替代。但设计自检清单称"九个决策表"与实际不符 → W-3（P1，陈述失实，非决策缺陷）。ADR 级核对：ADR-005 备选 5 项/ADR-006 备选 5 项/ADR-007 备选 3 项，全部 ≥2 ✓ |
| 3 | 蓝军挑战 ≥3 + 缓解 | ✅ PASS | BC-E1~E7 共 7 条，独立 ID，每条缓解 4-6 项且可执行（非口号）——逐条核实交叉引用真实（如 BC-E5 引 index.js:111 EADDRINUSE 先例 ✓、BC-E6 引 README:108-115 ✓）。独立新增 ≥2 条设计未覆盖挑战：达成（W-4/W-5/S-3，见 §4） |
| 4 | ADR-005/006/007 字段 100% + 可逆性实质 | ✅ PASS | 三条 ADR 各 9 字段（标题/日期/背景/决策/备选方案/排除理由/影响范围/后续动作/可逆性）逐一在文核实 100%。可逆性标注实质：ADR-005 可逆（中风险）——oauthExperimental 开关（用户层）+ 移除 preset 分支单 commit（代码层），可执行；ADR-006 可逆（低风险）——`router.stats.persist=false` 回纯内存 + 删/恢复 stats 目录；ADR-007 可逆（低风险）——`router.retry.budget=0` 行为等价现状。三开关回滚路径均可执行且相互独立 |
| 5 | 模块职责 ≤3 句 + 依赖无环（独立推演） | ✅ PASS | M-O（§3.3）/M-S（§4.4）/M-F（§5.1）各 3 分句职责，单一。独立推演依赖图：新边 M6→M-S、M6→M-F、M8→M-O、M8→M-F + 既有 M7→M6、M6→M8；M-O/M-S/M-F 为依赖源（仅依赖 node:fs/node:path 与 schemas 常量层，schemas 无回边）→ 全部新边终止于依赖源，无回边，**无环**。与 v3 §4.2 依赖图（M1→M4→M2/M5 等）零冲突，M1-M5 内部不动 ✓ |
| 6 | H3 证据抽查 ≥10 处 + 本项目代码引用抽查 | ✅ PASS | 实查 **28 处**：相符 24 / 偏差 1 / 不符 2 / 口径说明 1（见 §3 证据表；不符项均已立案 W-1/W-2） |
| 7 | 与 v3 架构一致性 | ✅ PASS | §6 衔接声明 vs architecture-v3.md §4.2 核实：新模块不替换/不推翻 M1-M8（v3 依赖边零改动）；不变量 schemas.js:137-147 原文逐字核实（"绝不注册 llm 路由，因此不会出现在…共享模型列表"），E1-c 排除理由真实引用该不变量（非虚引）。表头"衔接 M1-M6"措辞与 §6.1（M6/M7/M8）不一致 → S-2 |
| 8 | S-2 量化合理性抽验 | ✅ PASS（含 1 失实基数） | 合计算术核对：九候选求和（除观察项 C-2）≈4540 ∈ 声明区间 4200-4700 ✓；测试 ~1250 行与各行测试占比自洽 ✓；改造点数与涉及文件面匹配（C-1 ~18 点 vs 6 文件+新模块，量级合理）。**硬伤**：service.js 基线 2844 失实（实测 2965）→ W-1；巨石缓解结论方向不变（2965 基线下论证更强） |

---

## 3. 证据抽查表（28 处；判定：相符 / 偏差 / 不符）

| # | 设计断言（文档:行） | 实查位置与内容 | 判定 |
| --- | --- | --- | --- |
| 1 | H3-1 client id `app_EMoamEEZ73f0CkXaXp7hrann`（:112） | 快照 pi-ai-auth-oauth-openai-codex.js:22 `CLIENT_ID` 逐字一致 | 相符 |
| 2 | H3-2 authorize/token 端点（:113） | 快照 :23-25 `https://auth.openai.com/oauth/{authorize,token}` | 相符 |
| 3 | H3-3 1455 注册死值 + 回调主机可覆盖（:114） | 快照 :26 REDIRECT_URI、:36-38 `PI_OAUTH_CALLBACK_HOST`、:293 `server.listen(1455, getCallbackHost())` | 相符 |
| 4 | H3-4 PKCE（verifier 32B base64url/S256/state 校验）（:115） | 快照 :39-44（state 16B hex）、:229-238（code_challenge_method=S256）、:267-271（State mismatch 400）；本地 pkce.js:19-30（32 随机字节+SHA-256） | 相符 |
| 5 | H3-5 scope（:116） | 快照 :34 `openid profile email offline_access` | 相符 |
| 6 | H3-6 rotating refresh（每次刷新返回新 refresh；刷新无 secret）（:117） | 快照 :103-110（exchange 与 refresh 两操作同检 access+refresh+expires_in——刷新响应强制含新 refresh_token 即轮换语义）、:127-144（grant_type=refresh_token+client_id，无 secret） | 相符 |
| 7 | H3-7 accountId（JWT claim `https://api.openai.com/auth`→chatgpt_account_id；随头发送）（:118） | 快照 :35+:319-324（getAccountId）；本地 openai-codex-responses.js:1209-1223（extractAccountId）、:1235（`chatgpt-account-id` 头） | 相符 |
| 8 | H3-8 端点 codex/responses + 请求体（store:false/stream:true/include/prompt_cache_key）（:119） | 本地 providers/openai-codex.js:10（baseUrl chatgpt.com/backend-api）；openai-codex-responses.js:379-390（body 逐字段一致）、:443-451（resolveCodexUrl 追加 /codex/responses） | 相符 |
| 9 | H3-9 请求头（Bearer/account-id/originator/UA；SSE 另加 OpenAI-Beta+accept）（:120） | 本地 openai-codex-responses.js:1224-1250 逐项一致（originator 默认 "pi" :1236） | 相符 |
| 10 | H3-10 SSE 事件形状（delta/output_item.done/completed·incomplete/failed·error）（:121） | 本地 openai-codex-responses.js:511-539（error/response.failed/终态归一）；openai-responses-shared.js:487（output_text.delta）、:544（output_item.done，:561-562 output_text 提取）、:599（completed/incomplete） | 相符 |
| 11 | H3-11 设备码后备（usercode→轮询→authorization_code+code_verifier；15min）（:122） | 快照 :27-31（端点+15×60 超时）、:145-227（POST client_id；device_auth_id+user_code；interval/slow_down :161,218-219） | 相符 |
| 12 | H3-12 手动 code 后备（端口被占优雅降级）（:123） | 快照 :302-316（listen 失败 waitForCode→null）、:366-405（manual_code prompt+解析 code#state+state 校验） | 相符 |
| 13 | H3-13 凭据先例（文件名/原子写 0o600/withFileLock/严格校验/POSIX owner-only）（:124） | 快照 dsh-codex-src-store.ts:16、:100-102、:150（withFileLock）、:158-161（writeFileAtomic mode 0o600/dirMode 0o700）、:32-50（owner-only，win32 :41 跳过 mode）、:64-87（版本+未知键拒绝+字段类型校验） | 相符 |
| 14 | H3-14 限流语义（usage_limit_reached/resets_at；wham/usage primary/secondary）（:125） | 本地 openai-codex-responses.js:1183-1204（三类 code+429、plan_type、resets_at→分钟）；快照 dsh-codex-src-usage.ts:9（wham/usage URL）、:111-135（primary/secondary 窗口+remainingPercent） | 相符 |
| 15 | H3-15 dsh-codex 零运行时依赖 + pi-ai peerDependency ^0.82.1（:126，标【事实】） | `.router-files/` **无 package.json 快照**（表头清单亦只列 5 ts+1 js）；间接佐证仅 store.ts:8 import '@earendil-works/pi-ai' | **不符（不可复查）→ W-2** |
| 16 | H3-16 ≥3 生态插件先例（:127） | RES-003:156 列 4 个（Yan-Zero/yoke233/DamonBao/eons2long）；yoke233 README 快照 :58（localhost:1455）、:86（PKCE+state）、:60（1456 控制） | 相符 |
| 17 | E1-a 现状复用声明（oauthBegin/Exchange 已实现 PKCE+state+pending；协议数组单点判定）（:139/:188-189） | service.js:2748-2783（:2763-2771 verifier/challenge/S256/state；:2776 pending 10min）、:2790-2829、:2295-2298（三协议数组）、index.js:99-125（8085 先例） | 相符 |
| 18 | E1-c 排除理由引用不变量 schemas.js:137-147（:141） | schemas.js:137-147 原文逐字核实："绝不注册 llm 路由，因此不会出现在「设置 → 模型」与任何共享模型列表中" | 相符 |
| 19 | chat-only 限制 service.js:731-732（§3.5:269、O-4:49） | service.js:731-736（:732 oauth/:735 pool 抛错原文） | 相符 |
| 20 | 池候选循环 :958-983 / :973-980 现行为（§5.2:414） | service.js:958-983（orderPoolCandidates+逐候选 try/catch）、:973-980（失败 record+continue） | 相符 |
| 21 | 统计段 service.js:2414-2561（§4.4:372、ADR-006:517） | 实际统计段 2412-2572（:2414 resetStats 五字段、:2427 record、:2519-2572 statsSnapshot——引用止于 :2561 漏尾部 ~11 行） | 偏差（S-1） |
| 22 | §5.1 失败特征串全部有代码出处 | :2392 端点不可达 ✓、:2396-2398 401/403 重登 ✓、:2408 无文本内容 ✓、:2513 截断 300 ✓、:71 15min 超时 ✓、:2341-2355 anthropic 分支（API 直连）✓ | 相符 |
| 23 | O-1 gcloud scope 封死实证链 service.js:324-331（:46） | service.js:312-336 注释链逐字核实（invalid_scope / 403 restricted_client / 403 insufficient scopes——"公开 client 仅能完成授权"） | 相符 |
| 24 | service.js 行数：ADR-006:519"已 2844 行"、§2.2:94-95"~2844→~2600" | 实测 **2965 行**（read EOF 确认）；"当年 2554 行被 DEC-011 点名"为历史口径（decision-log DEC-011 原文 ✓） | **不符（W-1）**；历史口径 2554 ✓ |
| 25 | S-1 对标落盘（表头:13） | litellm-custom-pricing.md 存在（:3 来源 URL、:33-45 单价配置、:67 zero-cost、:70 C-3 映射注记）；openrouter-usage-accounting.md 存在 | 相符 |
| 26 | pi-ai 版本与 dsh-codex 声明精确一致（§3.1:104-105） | 本地 pi-ai package.json version=0.82.1；dsh-codex README 快照 :119 "targets … pi-ai 0.82.1" | 相符 |
| 27 | 决策输入已定案（表头:9） | decision-log：DEC-017/018/019 均在案且已执行，内容与设计表头声明一致；DEC-020 编号未占用（proposed 可用） | 相符 |
| 28 | "既有 534+ 断言"（§2.1:65 出口条件⑤） | plan-tracker:52 治理记录"534 smoke 断言"（EV-023 口径）；静态 check( 调用点 ~518（grep 522 含定义行）+ 运行期 host/shell 循环展开 → 534 为运行期输出计数，口径一致 | 相符（口径说明） |

**统计**：28 处 = 相符 24 / 偏差 1 / 不符 2 / 口径说明 1。不符项均立案（W-1/W-2），无放行。

---

## 4. 独立蓝军推演（Reviewer 自增，≥2 条要求 → 交付 5 条）

> 方法：以"如果…会怎样"逐面推演 v0.3.x 落地后的运行语义，不要求文档已答——未覆盖即立案，已覆盖即确认。

| ID | 挑战 | 推演 | 结论 |
| --- | --- | --- | --- |
| IBC-1 | `router.stats.persist` 回退开关的**往返语义**：用户先 true（stats/ 已写数据）→ 切 false → 再切 true | ADR-006 仅定义"false=回到纯内存态=现状行为"。未定义：① 再切 true 时加载逻辑与磁盘旧数据合并——false 期间调用未记录但时间轴连续，用户看到统计"跳变/空窗"；② false 期间点"清空统计"：软删除 backup 目录如何处理（备份了一个"不含本会话"的旧快照？）；③ index.json 与明细在空窗后的重建时机 | **未覆盖 → W-4**（WARNING，P2）。实施期需定语义（建议：false 期间不读不写；切回 true 全量重建索引并在 UI 明示数据空窗；清空操作在 false 下直接空操作或提示） |
| IBC-2 | preset 凭据刷新的**并发争用**：同 preset 账号被多池引用/route_agent 并发调用 → 并发 ensureFresh 争文件锁 | §3.3 有 withFileLock 串行化与 `CREDENTIAL_LOCK_TIMEOUT` 错误码；池内候选串行 await（:961）下单账号无争用。未定义：① 锁等待超时**时长**（刷新 RTT 的几倍？）；② 超时抛出后在池循环内的表现（record+换号即可，但 v0.3.0 窗口期 C-4 未实施——行为=普通失败，可接受但未写明）；③ 等锁方拿到锁后是否重读已刷新凭据（BC-E6 ③ 声称"刷新后重读（read-modify-write 全程持锁）"已覆盖此点 ✓） | **部分未覆盖 → S-3**（SUGGESTION，P2）：超时值与池内行为留实施期定义 |
| IBC-3 | 1455 loopback 与宿主/多 profile 生命周期时序：双 DSH profile 并发运行时端口互斥 | profile A 的本插件常驻 1455 → profile B 一键登录必遇占用 → E4 降级链设备码兜底（无需回调端口）；日常调用不依赖 1455（BC-E5 ④）。**设计已覆盖**（E4+BC-E5），且 V-EVO-6 已列 DSH_HOME 跨 profile 待验证 | **已覆盖（确认）**，不立案 |
| IBC-4 | `oauthExperimental` 关闭时 preset 账号仍在池中：kill-switch 与池语义交互 | §3.6 ③"关=既有 preset 账号调用时明确报错"→ 池循环现状 record+continue（:973-980）自动换下一候选，语义合理无死锁 | **已覆盖（确认）**，不立案 |
| IBC-5 | **非登出路径删除 preset 账号**：用户直接删账号卡片（oauthAccounts 条目）而不走"登出并删除凭据" | §3.6 仅定义登出路径的凭据删除；直接删条目时 credentialFile（含有效 refresh_token）留存磁盘——用户认知"账号已删"但长期凭据仍在（P7 暴露面残留，且无 UI 提示）。dsh-codex 同样"卸载不删凭据"（README:115 先例），但本设计自我要求更保守（"做显式一键删除"），该路径缺口与自我要求不符 | **未覆盖 → W-5**（WARNING，P7-violation 风险）。建议：删账号条目时检测 preset credentialFile 存在 → 联动提示/删除 |

**独立蓝军结论**：5 条推演中 2 条构成新 WARNING（W-4/W-5）、1 条 SUGGESTION（S-3）、2 条确认设计已覆盖（IBC-3/IBC-4）——满足"≥2 条设计未覆盖挑战"要求，且未动摇任何架构级决策。

---

## 5. Findings（分级）

### BLOCKING（0 条）

无。

### WARNING（5 条）

| ID | 发现 | 违反条目 | 修复建议（退回 Architect 或实施期吸收） |
| --- | --- | --- | --- |
| W-1 | service.js 当前行数口径失实：ADR-006 背景"已 2844 行"与 §2.2"~2844→~2600"（v0.3.1 出口条件⑧基线）实测为 **2965 行**（差 121 行）。影响：净变化算术与出口条件⑧数值失准（实际 2965−220+380≈3125 而非 ~3004）；"巨石缓解"论证方向不变且更强 | **P1-violation**（事实口径） | v1.0 定稿前更正两处数字与出口条件⑧基线（D-6 材料准确性） |
| W-2 | H3-15 断言证据未落盘："dsh-codex 零运行时依赖 + pi-ai peerDependency ^0.82.1（package.json，2026-08-20 抓取）"标【事实】，但 `.router-files/` 无该文件快照，引用不可独立复查；间接佐证仅 store.ts:8 的 import | **P1-violation**（审查红线：不可验证不得作事实；亦违反设计自身"证据落盘"承诺） | 补 package.json 快照落盘，或降级标注"文档级（未快照）"。该断言仅支撑背景，不影响 E1 决策 |
| W-3 | 自检清单"九个决策表（每决策 ≥2 候选+排除）"陈述与实际不符：显式候选表仅 6 处（E1/E2/E3/E6/E7/§5.3），E4 为约束推导、E5 为 E1-a 派生、E8 为行文双候选（实质满足）。实质决策面（存在真实替代空间者）全覆盖且理由实质，无隐藏替代 | **P1-violation**（自检陈述与事实不符） | v1.0 修正自检行（如"6 显式候选表 + E8 行文双候选 + E4/E5 约束推导"）；建议 E5 补一行替代说明（独立 run 方法 vs 协议分支）以完备 |
| W-4 | IBC-1：`router.stats.persist` 回退开关往返语义未定义（关→开数据合并跳变 / false 期清空与 backup 交互 / 索引重建时机） | **P2**（分析全面性） | v0.3.1 实施前在 §4.2 补开关语义行（建议见 §4 IBC-1） |
| W-5 | IBC-5：非登出路径删除 preset 账号条目时凭据文件残留（含有效 refresh_token），无提示无清理 | **P7-violation 风险**（敏感数据暴露面） | v0.3.0 实施时账号删除路径检测 credentialFile 并联动提示/删除（与 §3.6"更保守"自我声明对齐） |

### SUGGESTION（3 条）

| ID | 发现 | 建议 |
| --- | --- | --- |
| S-1 | 统计段引用边界偏差：service.js:2414-2561 实际为 2412-2572（statsSnapshot 尾部 ~11 行未含） | 引用更正为 2412-2572（与 W-1 同批修） |
| S-2 | 表头"新模块衔接 M1-M6"与 §6.1 对照表（实际衔接 M6/M7/M8）表述不一致 | 表头改为"衔接 M6-M8"或"衔接 M6（经 RPC 至 M7）/M8" |
| S-3 | IBC-2：`CREDENTIAL_LOCK_TIMEOUT` 有错误码但超时值与池内等待行为未定 | §3.3 补超时值（如 ≥2× 刷新 RTT）与池内行为一行说明 |

---

## 6. 终态结论

### 结论：**APPROVED_WITH_NOTES**

- 硬门槛 8 项全部实质通过（门槛 2/6/8 的形式瑕疵已按 WARNING/SUGGESTION 立案，不影响判定——判定理由见 §2 各行）。
- 证据链质量总体优秀：28 处抽查 24 相符，核心 H3 协议事实（client/端点/PKCE/rotating refresh/accountId/请求头/SSE 事件/设备码/凭据先例/限流语义）**全部**经本地 pi-ai 0.82.1 源码 + dsh-codex 快照独立坐实，本项目代码引用（oauthBegin/池循环/chat-only/统计段/错误文案/不变量）逐处打开核实。
- 5 条 WARNING 均为文档事实精度/证据落盘/语义补全类，**无设计级缺陷**：不改变任何决策方向（E1-a/E2-a/E3-a/E6-a/E7-a/预算制重试的论证独立成立于这些瑕疵之外），全部可在 D-6 定稿前或对应版本实施期吸收。
- 版本分期逻辑（风险解耦、单一主题、出口条件可验证）与 DEC-017/018/019 输入一致；H2 PoC 前置为 C-1 门禁的正确时序安排。
- 下游行动建议：W-1/W-2/W-3/S-1/S-2 建议随 D-6 定稿批量修正（一次文档 commit）；W-4/W-5/S-3 分别入 v0.3.1/v0.3.0 实施任务书。

### unresolved_blockers: 0

（本字段为 APPROVED_WITH_NOTES 必需独立结构字段：本轮 0 条未解决 BLOCKING finding；5 WARNING + 3 SUGGESTION 为保留跟踪备注。）

---

## 附：审查过程记录

- 通读设计文档全文 662 行；读取 `.router-files/` 全部 6 份源码快照中与本审查相关的 3 份（pi-ai oauth / dsh-codex store / dsh-codex usage）+ 2 份 README 快照 + 1 份 S-1 对标文件；实读本地 pi-ai 0.82.1 dist 四个文件（pkce.js / providers/openai-codex.js / api/openai-codex-responses.js / api/openai-responses-shared.js）；实读本项目 service.js（重点 7 段 + 全文件行数确认 2965）、schemas.js（137-195）、index.js（35-128）、client.js（420-431）、tests 四文件断言计数、README:131、architecture-v3.md §3/§4.2、decision-log（DEC-008/011/017/018/019）、plan-tracker（ARCH-002/RES-003/534 断言口径）。
- 工具纪律：仅 Read/Grep/Glob/Write（唯一写目标=本文件）；未执行命令、未 spawn 子 agent、未与用户交互、未修改审查对象与任何产品代码。
