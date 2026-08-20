# RES-003 审查报告（Round 1）

| 项 | 值 |
| --- | --- |
| Task ID | RES-003-REVIEW |
| Round | **R1**（首次审查，无前轮引用） |
| 审查对象 | `docs/requirements/strategic-alignment-research-2026-08-20.md`（288 行，Analyst 产出） |
| 审查人 | Requirement Reviewer Agent（独立后置审查，Coordinator 派发） |
| 审查日期 | 2026-08-20 |
| 对照基线 | `.governance/plan-tracker.md`（项目目标行 + REQ-003 + RES-003 任务定义）、`.governance/decision-log.md`（DEC-017） |
| 终态结论 | **APPROVED_WITH_NOTES** |
| unresolved_blockers | **0** |

---

## 一、四维审查结论

| 维度 | 判定 | 要点 |
| --- | --- | --- |
| 1. 目标一致性 | ✅ 通过 | RQ1 五要素提炼自 DEC-017 用户原文（与 plan-tracker REQ-003 三主线逐字对应）；"不做什么"有显式声明（§6.2 反面考量 4 条 ❌）；RQ1 结论"未偏离+时序错位说明"有据（DEC-007 2026-08-18 早于 DEC-017 2026-08-20，decision-log 可证）。量化成功标准属 ARCH-002/D-6 职责，调研层以差距表+复杂度+依赖表达，可接受（见 S-2） |
| 2. 需求可行性 | ✅ 通过 | OAuth 可行性判定有双层证据（本项目基础设施代码级盘点 + DSH 生态文档级佐证）；H1-H8 全部带验证计划，高风险假设（H2/H3）有 30 分钟 PoC 早期验证方案与证伪影响分支；资源约束以复杂度 S/M/L 识别（无时间/人力口径——见 S-2，非阻塞） |
| 3. 风险识别 | ✅ 通过 | ToS 合规风险显式（Q1 + opencodex UAYOR 原文引用）；"技术就绪 ≠ 应该默认开启"的准入纪律正确；CE-2 揭示顺序风险（先实测 C-9 再投界面）；CE-1 纠正叙事风险（治理记录不支持"OAuth 曾被否定"）；缓解策略完整（分期、反面考量、决策前置） |
| 4. 质量基线 | ✅ 通过 | 验收信号：C-9 承接 V-DSH-5（≥90%）可测试；非功能已覆盖性能（p50/p95）、凭据安全（独立文件/原子写/credentials seam）；C-3 的持久化数据安全要求未显式（见 S-3，非阻塞）；"完成"定义由下游 D-6 承接，调研层边界清晰 |

**目标一致性专项核对**：报告 RQ1 五要素（扩展能力边界/主路径专注/任意多模态 agent/多模态账号/无头模式）与 DEC-017 决策原文逐项对应 ✅；三方向 A/B/C 与 REQ-003 描述逐字对应 ✅；下游消费者（ARCH-002 + D-6 + §6.3 Q1-Q4）与 plan-tracker RES-003/ARCH-002 任务链一致 ✅。

---

## 二、硬门槛逐项结果

| # | 门槛 | 结果 | 核实详情 |
| --- | --- | --- | --- |
| 1 | 竞品/参考 ≥3 且置信度标注齐全 | ✅ 通过 | 6 个竞品逐一核实真实存在：opencodex（5 份原文落盘）、dsh-vision-router（本地源码 .tmp-research/ 48 文件）、dsh-codex 与 dsh-openai-codex-auth（README 落盘）、LiteLLM、OpenRouter（检索摘要，H6 显式标注未逐页核对）。§5 矩阵含每竞品置信度行，§4 各表含【事实/文档】标注。矩阵 8 维度无空白 |
| 2 | 反面证据 ≥1 且确实与假设矛盾 | ✅ 通过 | CE-1：decision-log 全文检索（oauth\|login\|登录\|否定）仅命中 DEC-017 本身——"无否定 OAuth 决策"属实，与"曾被否定"叙事真实矛盾（非顺从证据）；CE-2：BC-1/V-DSH-5/CHANGELOG:50 证实触发率从未实测，与"改界面即可"直觉矛盾；CE-3：vision-router 免 key 免费 + score 0.90 证实，与"配置越全越有吸引力"假设矛盾。3 条全部成立 |
| 3 | 假设 100% 显式标注 + 验证计划，无隐性假设混入【事实】 | ✅ 通过 | H1-H8 全带状态/验证计划/证伪影响；抽查全部【事实】段（install/统计/池/CLI/OAuth UI）均能落回代码行号或落盘文件，未发现把假设写作事实的段落。注：§6.2"已验证可行"措辞与 H2"未验证（文档级）"存在术语张力 → W-1（非阻塞） |
| 4 | 每条关键发现带可验证来源（抽查 ≥15 处） | ✅ 通过 | **实际抽查 40 处**（覆盖任务书点名的 5 个核心发现全部）：相符 38 / 偏差 2（引用行号漂移，内容属实）/ 不符 0。详见表三 |
| 5 | RQ1-RQ4 四部分全部实质产出 | ✅ 通过 | §2（五要素对照表+偏离项+投入归属审查）、§3（journey+F1-F8 摩擦表+三路径步数）、§4（A1/A2/A3/A4/B/C 六张差距表）、§6（9 候选+优先级+反面考量+Q1-Q4）——均为实质分析，无模板填充 |
| 6 | RQ3 三方向各有差距表且每行有证据列 | ✅ 通过 | A1/A2/A4/B/C 五表均有证据列（文件:行号/落盘路径）；A3 为叙事体但内嵌 4 组代码级/文档级证据块 + 可行性边界实证清单，证据密度不低于表格形式，判为满足 |

---

## 三、证据抽查表（40 处，含 5 个核心发现）

判定口径：相符 = 内容与位置均证实；偏差 = 内容属实但行号漂移超 ±5 或行号未能直接核实；不符 = 内容不实。

| # | 引用（报告声称） | 实际核实内容 | 判定 |
| --- | --- | --- | --- |
| 1 | 【核心①】`lib/service.js:324-331` gcloud 封禁链注释 | :323-331 注释原文：旧 scope `generativelanguage`→invalid_scope；`generative-language.retriever`→403 restricted_client；`cloud-platform` 可过授权页但 token 调 API 403 insufficient scopes——"公开 client 仅能完成授权"（:330 逐字相符；:311-321 PUBLIC_OAUTH_CLIENT 亦证实） | 相符（±1 行） |
| 2 | 【核心②】`.router-files/oauth-error.html` Error 400: invalid_request | 文件存在；line 35 `<h2 ...>Error 400: invalid_request</h2>`；canonical URL accounts.google.com/signin/oauth/error（真 Google 错误页） | 相符 |
| 3 | 【核心②】`.router-files/oauth-error2.html` Error 400: invalid_scope | 文件存在；line 35 `<h2 ...>Error 400: invalid_scope</h2>` | 相符 |
| 4 | 【核心③】decision-log 全文无否定 OAuth 的 DEC | grep（oauth\|OAuth\|login\|登录\|否定）仅 1 命中 = DEC-017（line 21），且 DEC-017 内容为战略授权（三主线+显式授权原文），与报告引用一致 | 相符 |
| 5 | 【核心④】opencodex-providers.md:59 authMode `forward` | :59 "Relays your incoming Codex auth headers verbatim…This is the ChatGPT-login passthrough" | 相符 |
| 6 | 【核心④】opencodex-providers.md:60 authMode `oauth` | :60 列 xAI/Anthropic/Kimi/Kiro/Google Antigravity/Cursor/Command Code/GitHub Copilot/Nous Portal（=9 家，与 §5 "9 家"一致） | 相符 |
| 7 | 【核心④】providers.md:98-108 `ocx login anthropic`/`chatgpt` | :99 "anthropic # Anthropic Claude (Pro/Max)"、:107 "chatgpt # standalone ChatGPT OAuth login" | 相符 |
| 8 | 【核心⑤】dsh-codex-README.md:31 localhost 回调 | :31 "The plugin opens OpenAI's authorization page and completes the localhost callback" | 相符 |
| 9 | 【核心⑤】dsh-codex-README.md:39 设备码 | :39 `login --device-code` | 相符 |
| 10 | 【核心⑤】dsh-codex-README.md:106-115 凭据安全 | :110 `$DSH_HOME/.openai-codex-auth.json`、:111 原子写+跨进程刷新锁、:113 不动 `~/.codex/auth.json` | 相符 |
| 11 | 【核心⑤】dsh-openai-codex-auth-README.md:57-60 | :57 PKCE verifier/challenge/state、:58 localhost:1455 回调、:59 原子写+credentials 注入、:60 127.0.0.1:1456 控制服务 | 相符 |
| 12 | opencodex-README.md:291 UAYOR | :291 "Anthropic (Claude) — may suspend or restrict accounts…Use at your own risk (UAYOR)" | 相符 |
| 13 | `lib/client.js:318` 宿主旧文案 | :318 "harness 模型适配层目前仅支持 API Key 认证，官方 OAuth 登录流暂不在支持范围"（逐字） | 相符 |
| 14 | `lib/client.js:377,386,420` F-2 三段指引 | :377 oauthPublicClientLimit（二选一长文案）、:386 label、:420 oauthGeminiSelfHint（三步） | 相符 |
| 15 | `lib/client.js:381` oauthNeedRestart | :381 "一键授权需要 DSH 重启后生效（宿主侧新增回调端点）" | 相符 |
| 16 | `lib/service.js:731-732` OAuth 仅 chat（D-3） | :732 原文；另 :721 files 排除、:735 池仅 chat 均证实 | 相符 |
| 17 | `lib/service.js:2414-2420` resetStats + 无统计落盘（D-2/H8） | :2414-2420 五内存结构重置；全文件 writeFileSync 仅 4 处（:842/:1246/:1353/:2094）均与统计无关；:530 构造即 resetStats | 相符 |
| 18 | `README.md:131` 统计重启清零 | :131 原文 | 相符 |
| 19 | `lib/schemas.js:186-194` 池策略三选 | :186-191 注释（含"opencodex 风格"字样）、:192 strategy 默认 healthy、:193-194 accounts 引用 oauthAccounts | 相符 |
| 20 | `lib/service.js:956-986` 失败切换/健康统计 | :955-956 注释"单个账号失败…切换到下一个"、:961-983 候选循环、:986 accountHealth（失败次数聚合） | 相符 |
| 21 | `CHANGELOG.md:50` D-1 门判定 | :50 "满足×2…部分满足×2…待实测×1（触发率）（EV-023；DEC-015）" | 相符 |
| 22 | architecture-v3.md §9 BC-1 / §13 V-DSH-5（CE-2） | :800 BC-1 原文（"不自觉"调 route_agent 失效模式+缓解）、:861 V-DSH-5 "响应率 ≥90%" | 相符 |
| 23 | vision-router README:13-14/29（CE-3 徽章/群） | :13 精选认证徽章、:14 "dsh score 0.90"、:29 QQ 群 1105463028；:20 "368 tests" 徽章亦证实 | 相符 |
| 24 | vision-router README:60 Free by default（CE-3） | :60 "Free by default…OVHcloud anonymous fallback: no account, no key, 2 requests/minute per IP per model" | 相符 |
| 25 | vision-router README:119 官方通道安装 | :119 `npx @deepseek-ai/dsh plugin --profile web add dsh-vision-router` | 相符 |
| 26 | F-7 本项目无 doctor（glob 全库） | doctor* 仅命中 .tmp-research/ 与 .inspect-vision-router/（竞品研究副本），本项目自身无；且 vision-router docs/doctor.md 存在 | 相符 |
| 27 | opencodex-providers.md:237 79 内置预设（A1） | :237 "79 built-in presets: 67 key-based, eight OAuth, three local" | 相符 |
| 28 | opencodex-README.md:90-97 配额路由（A4） | :90-97 "5h / weekly / 30d quota…lowest-usage healthy account; round-robin and fill-first" | 相符 |
| 29 | opencodex-providers.md:156-170 刷新可靠性 | :165 single-flight、:166 per-account file lock、:167-168 generation CAS、:170 终态失败标记重登 | 相符 |
| 30 | opencodex-providers.md:180-190 会话亲和 | :180 thread→account affinity 进程内、:181-182 401/403 隔离重登、:182-183 429 冷却+轮换 | 相符 |
| 31 | providers-accounts.md:240-246 headless 手工 code | :240-242 "ocx account login\|reauth\|code\|cancel…browser-based or manual-code…from a headless shell" | 相符 |
| 32 | opencodex-providers.md:62-65 凭据存 auth.json 自动刷新 | 内容存在但实际位于 **:93-95**（"stores their credentials in ~/.opencodex/auth.json and refreshes them automatically"）；:62-65 实为 retryOn429 排除条款 | **偏差**（行号漂移 ~30 行，内容属实） |
| 33 | `lib/client.js:363` oauthOpenUrl | :363 未在读取窗口直接命中（相邻 :370-372 为 oauth 文案区）；同功能文案 oauthOpenSite 在 :422 证实 | **偏差**（内容属实，行号未直接核实） |
| 34 | `lib/tool.js:112-133` 三类块（B） | :113-132 render 仅 text/marker/usage 三类 push，无失败诊断结构 | 相符 |
| 35 | `lib/index.js:90-95/97-125/111-114` 双回调+降级 | :90-95 exact 路由 /router-oauth/callback、:97-125 loopback 8085、:111-114 EADDRINUSE 静默降级+明确日志（"e.g. gcloud CLI"） | 相符 |
| 36 | `lib/service.js:71/79-94/114-142`（P-5/A2） | :71 CLI_DEFAULT_TIMEOUT_MS=15min、:92-94 codexSandboxMode、:87-88 token 75.5k→36.2k 实测注释、:114-142 CLI_PRESETS 三套（loginArgs/statusArgs/modelsArgs/knownModels） | 相符 |
| 37 | `lib/service.js:2743-2865/2927` oauthBegin PKCE + test | :2743 "宿主生成 PKCE + state"、:2786 "授权码 + PKCE 的 code → token 交换"、:2927 "router/test：最小连通性调用" | 相符 |
| 38 | README.md 项目目标/安装/配置/FAQ 全组（:5,:12,:18-20,:30-33,:56-71,:75,:95,:100,:103-112,:114-121,:125-128,:132） | 逐条相符：:5/:12 目标原文、:30-31 双平台一行命令、:33 重启、:56-71 对话安装模板、:75 入口、:95 留空复用主模型（F-1）、:100 六预设、:107 五字段表单、:108 子代理一键登录+沙坑 5/1920、:111-112 OAuth/池、:118-121 统计、:125 FAQ 多模态前提、:126-127 CLI 路径与转圈、:128 官方 API 无 OAuth、:132 幂等 | 相符 |
| 39 | install.ps1 §1/§2/§3（:35-63,:42,:57,:65+,:71-80） | :42/:46/:50/:57 git 失败明确报错+离线指引、:65 §2 链接节头、:71-74 旧名 dsh-router 迁移 | 相符 |
| 40 | `lib/client.js:1815/1999` + schemas.js:11-14/44-53/66/155/159 + memory.js:23-30 + architecture.md:169 + 落盘七文件存在性 | :1815 "resolves no models" 拒绝、:1999 `api.settings.mutate({ns:'llm-pi-ai'})`、schemas 空字段语义/normalize/tokenRef/anthropic 协议、memory 100/24h/500、architecture.md:169 实时语音按需、.router-files/ 5 份 opencodex-*+2 份 dsh-* 全部存在 | 相符 |

**抽查汇总：40 处 / 相符 38 / 偏差 2 / 不符 0**。两处偏差均为引用行号漂移、内容属实，不构成事实错误；无任何编造来源或内容失实。

---

## 四、Findings

### BLOCKING（0 条）

无。

### WARNING（2 条）

**W-1「已验证」术语口径不一致（内部一致性）**
- 位置：§1 执行摘要"**可行，且已被 DSH 生态证实**"；§6.2 Top1"DSH 生态 3 个插件已验证技术可行，风险低"
- 问题：§8 H2 明确声明 DSH 生态插件可用性"**未验证（文档级：README 声明，未安装实测）**"。"已验证/已证实"（§1/§6.2）与"未验证（文档级）"（H2）三处口径冲突——落盘证据仅覆盖 4 个插件中的 2 个（另 2 个仅搜索标题佐证），且全部为文档级。下游 ARCH-002/D-6 若按"已验证"读取，会低估 C-1 的 PoC 前置必要性。
- 修复建议（Analyst，下轮修订时）：§1/§6.2 统一改为"文档级可行性证据充分（2 份 README 原文落盘 + 2 个搜索结果佐证），运行时 PoC 待 H2 执行"；§6.2"风险低"补注"以 H2 PoC 通过为前提"。
- 判定依据：不改变结论方向（报告已把 H2 PoC 列为 ARCH-002 前置），仅措辞风险 → 非阻塞。

**W-2 引用行号漂移（引用精度，同 RES-002 先例级别）**
- 位置：§4 A3——opencodex-providers.md:62-65（实际 :93-95，漂移约 30 行，超出 ±5 容差）；lib/client.js:363（oauthOpenUrl，行号未能在文中直接命中，同功能内容在 :422 证实）
- 问题：内容属实、无编造，但行号引用不可靠会削弱下游复查效率。
- 修复建议：Analyst 对 .router-files/ 与 lib/ 的全部行号引用做一次批量校对（P1 边缘：事实成立性未受影响，故不记 P-violation）。

### SUGGESTION（3 条）

**S-1 LiteLLM/OpenRouter 对标证据未落盘**：§5 两列依赖检索摘要（H6 已诚实标注）。建议 ARCH-002 启动前将 custom pricing / spend tracking 关键原文落盘至 .router-files/（与 opencodex 同规格），或在该阶段明确降权使用。

**S-2 复杂度缺量化口径**：§6.1 的 S/M/L 为单字母分级。建议 ARCH-002 转换为模块级工作量估算（涉及文件/改造点清单），使优先级排序带成本维度——当前 Top3 排序的隐含成本假设（C-3 独立可并行）未被量化支撑。

**S-3 C-3 统计持久化的数据安全非功能要求未显式**：Q3 仅覆盖存储位置与保留期。项目原则 P7（修复安全性，避免损坏用户数据）要求 ARCH-002 显式设计：原子写/损坏自愈/版本迁移/清空保护——报告在凭据侧已引用 dsh-codex 原子写先例，统计侧应同等对待。

### 项目质量原则核对

无违反条目。P1（基于事实）：40 处抽查零编造、零失实；P5/P6：缺口分析未因单点视角遗漏三主线任一方向。W-2 属精度问题不构成 P1 违反（事实本身全部成立）。

---

## 五、硬门槛总判与终态

| 项 | 值 |
| --- | --- |
| 硬门槛 1-6 | 全部通过 |
| 证据抽查 | 40 处：相符 38 / 偏差 2 / 不符 0 |
| BLOCKING findings | 0 |
| WARNING findings | 2（W-1 术语口径、W-2 引用精度） |
| SUGGESTION findings | 3（S-1 对标落盘、S-2 复杂度量化、S-3 数据安全） |
| **终态结论** | **APPROVED_WITH_NOTES** |
| **unresolved_blockers** | **0** |

**结论理由**：报告以代码级证据（29 处行号引用抽验全相符）+ 落盘文档级证据（7 份 .router-files/ 原文）+ 实测留痕（oauth-error*.html 真实 Google 错误页）支撑全部核心判断；RQ1-RQ4 实质完整；反面证据真实反向；假设管理完备。2 条 WARNING 均为措辞/精度问题，不阻塞下游 ARCH-002 消费——建议 Coordinator 将 W-1/W-2 转交 Analyst 在下一次文档修订时顺带修复（无需独立返工轮），S-1/S-2/S-3 作为 ARCH-002 任务书输入。

**给 Coordinator 的下游提示**：
1. RES-003 可标记"已完成——审查 APPROVED_WITH_NOTES（0 BLOCKING / 2 WARNING / 3 SUGGESTION）"，解锁 ARCH-002。
2. §6.3 Q1-Q4 四个用户决策点经审核认为设计合理（候选完整、建议有据），建议走 ask_user_question 交付用户——Q1（ToS 合规）为 C-1 动工前置。
3. ARCH-002 任务书应吸收 S-1/S-2/S-3 与 H2 PoC 前置。
