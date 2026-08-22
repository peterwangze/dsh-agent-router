# Code Review 报告 — EVO-002 Step 4b（授权流 preset 分支）

| 项 | 值 |
|---|---|
| Task | EVO-002（v0.3.0 C-1 ChatGPT 订阅 OAuth 实施）· Step 4b / ~7（授权流三点 preset 分流 + R3 F-1/F-2/F-3 闭合） |
| Round | **R5**（新切片首审，非返工复审。前轮链：R1 = Step 1 schemas，APPROVED_WITH_NOTES（P0=0/P1=0/P2=0/P3=6）；R2 = Step 2 凭据模块，APPROVED_WITH_NOTES（P2=2 转 hardening）；R3 = Step 3 1455 loopback，APPROVED_WITH_NOTES（P2=3 绑定 Step 4b）；R4 = Step 4a 凭据加固，APPROVED_WITH_NOTES（P2=0/P3=4，R2 P2 清零）——见 `.governance/review-EVO-002-R1~R4.md`） |
| 审查对象 | commit `564e18c426eb033bce1475503c8d5f173351e0b0`（main HEAD，已核实 `.git/refs/heads/main` = 该 hash；reflog :116 `a2567db`→`564e18c` 恰一次提交，message "EVO-002 Step 4b: authorization flow preset branch (begin prefill + exchange quad persist + ensureFresh integration + R3 F-1/F-2/F-3)" ✓ C4 单 commit 单主题坐实） |
| 变更集 | lib/service.js（+145：oauthBeginPreset 39 行 + oauthBegin/exchange/resolveOauthToken 三点分流 + credentialStoreFor + 构造器声明）、lib/index.js（+8/-2：settled 标志）、tests/smoke.mjs（+125：20 断言）——三文件与任务书一致 |
| 审查者声明 | Code Reviewer Agent（独立于 Developer）；只读审查产品代码与测试，未修改产品代码、未执行任何测试/命令（smoke 655 exit=0 + loopback 20 + credentials 75 独立 exit=0 已由 Coordinator 复跑提供；本审查做静态核验与逻辑推演，运行数值如实标注）；已全文加载 agents/code-reviewer.md 与 skills/code-review/SKILL.md |
| 审查范围 | 仅该 commit 引入内容。按任务书边界：runOauthChat codex-responses 协议分支 / 设备码流 / 账号卡 UI + ToS 确认 / 登出删除（Step 5/6）**不构成本轮缺陷**；kill-switch 调用期检查的范围裁决见 §6-1 |

---

## 0. 审查方式与锚点核实（命令执行禁用，HEAD 状态即 diff 等效审查面）

- HEAD 锚点：`.git/refs/heads/main` = `564e18c426eb033bce1475503c8d5f173351e0b0` ✓；reflog 末行（:116）a2567db→564e18c 恰一次提交 ✓。
- HEAD 状态即 commit 状态：service.js 三段新增（构造器 :521-528 / credentialStoreFor+resolveOauthToken :2268-2325 / oauthBegin-exchange :2796-2998）+ index.js settled 段（:122-145）+ smoke.mjs Step 4b 块（:458-572）与 apply wiring 断言（:1373-1377）逐行通读，与 R3/R4 报告记载的旧态比对重建语义 diff，等效 diff 审查。
- **计数对账**：index.js 净 +6 = 229（R3 记载）→235（现行）**精确吻合** +8/-2 ✓（强结构验证）；smoke.mjs 1887−125=1762 与 R3 时代行号引用（:1759+）自洽 ✓；service.js 3098−(145−8)=2961 vs roadmap §2.2 基线 2965 差 4——判定任务书/基线转录级差异（R3 §0 +263/264、R4 §0 +106/-18 同类先例），以仓库为准，不影响结论。**精确 ±计数与 hunk 形状未验证**（命令执行禁用）。
- **P3 通用路径零改变的验证方法**（本步最高风险面）：行级 diff 等效性无法在禁命令前提下直接证明，采用双层证据——① 行为契约级：既有通用 OAuth 断言（smoke :402-453——begin 缺账号/begin URL/一键交换/重放拒绝/8085 未就绪/pub scope 迁移/pubExchange/discover/池切换/文件内联）全部保持绿（Coordinator 复跑 655=635+20，增量恰为本步 20，零既有断言改动）；② 结构通读级：三点分流判定（:2290/:2807/:2921 同款 `typeof account.preset === 'string' && account.preset.trim() ? account.preset.trim() : ''`）均为**前置插入**，通用路径代码体（resolveOauthToken :2315-2324 tokenRef→credentials→env；oauthBegin :2809-2839；exchange :2928/:2937/:2939 三元表达式的非 preset 臂 + :2984-2997 tokenRef 落盘）结构完整自洽。**行级逐字节零改动标注"未验证"**，以双层证据替代（R3/R4 同款方法学先例）。
- 分流判定严谨性：preset 为空串/缺省/非字符串/纯空白 → trim 后 '' → falsy → 通用路径 ✓（三点半point 同惯用法；纯空白 '  ' 经 trim 归一为通用路径——正确归类，非误入）。
- pi-ai 快照对照（自报 5）：`.router-files/pi-ai-auth-oauth-openai-codex.js:228-242` createAuthorizationFlow 逐参数比对——response_type=code/client_id/redirect_uri/scope/code_challenge/code_challenge_method=S256/state/**id_token_add_organizations=true（:239）/codex_cli_simplified_flow=true（:240）/originator（:241）** 与 oauthBeginPreset（service.js:2872-2883）**逐参数一致** ✓。差异两处均无语义：参数序（scope 位置）与 state 构造（`router-`+12 字节 hex vs pi-ai 16 字节 hex——state 对服务端不透明，仅回显比对，且为通用路径同款机制复用，任务书明示）。

## 1. R3 三项闭合验证表（本 commit 声称闭合——逐条验证）

| R3 Finding | 验证点 | 闭合判定 |
|---|---|---|
| **F-1（P2）settled 标志防迟发 error 误清单例** | index.js:125 `let settled = false`（listen 成功 :145 与 error handler :135 共同维护）；error handler :134 `if (!settled) codexLoopbackActive = null`——settled 后迟发 error 不再清空单例（旧 server 仍在服务，下次 starter 复用而非对自身旧实例 EADDRINUSE）；listen 回调 :145 `settled = true` 先于 resolve。与 R3 建议修法（"与 dispose 的 disposed 锁同款三行修改"）逐字对应 | **已修复**（代码级核实 ✓）。残留：无自动化测试（迟发 error 发射路径不外露——server 实例不导出，构造需 keep 事件句柄；R3 已论证触发面接近不可达）。裁决见 §6-4 |
| **F-2（P2）构造器声明两字段** | service.js:521-522 `codexLoopbackReady = false` + :523-525 `codexLoopbackStarter = null`（各带 JSDoc"由 index.js 注入，oauthBegin preset 分支消费"）；超额交付 :526-528 `oauthCredentialStores = new Map()`（§3.4 条目 2 消费，同款声明风格）。与 8085 先例 :518-520 平行 | **已修复**（超额完成：三声明 vs 建议两声明，第三项为本步必需） |
| **F-3（P2）惰性断言同义反复 → 真实 service 断言** | smoke.mjs:1373-1377：`wiredService = root.get('router')`（**真实 apply 产物**，非测试自建 fixture）+ `typeof wiredService?.codexLoopbackStarter === 'function'`（注入点存在性）+ `wiredService?.codexLoopbackReady !== true`（apply 后未启动）。位于 apply wiring 块（:1350-1378），dispose 前执行。**判别力成立**：若回归为 apply 内常驻监听，`codexLoopbackReady` 在 apply 后即为 true → :1377 FAIL；若注入 effect 被删，:1376 FAIL | **已修复**（判别力恢复 ✓；原 oauth-loopback.mjs:85-86 同义反复断言保留为占位——R3 明示可保留，无害） |

**R3 其余 P3 遗留对账**：F-4（JSDoc "只 resolve 不 reject" 措辞）——仍开放（:103-105 措辞未动，本 commit 未触及该文档面，遗留态正确）；F-5（三处测试缺口）——仍开放（非义务项）；F-6（closeAllConnections）——仍开放（先例同构，非义务）；F-7（localhost/127.0.1 观察项）——维持观察；**F-8② 已闭合**（DEC-021 入账，EV-031 记载）。R4 遗留：R4-F1（body 相位超时）/R4-F2（AbortController 守卫）——**本 commit 未触及 oauth-credentials.js**（三文件范围内无该文件），"首次触及本模块时闭合"条件未触发，遗留态正确 ✓；R4 转发建议③（timedOut 消费语义预留 Step 5）——本步已在实现侧完成转发（见 §5），消费侧留 Step 5 ✓。

## 2. 五维度逐项结论

### 2.1 正确性 — 通过（0 阻塞；分流/落盘/刷新集成逐行推演无误）

- **oauthBeginPreset（:2853-2891）**：校验序 = 未知 preset（:2854）→ kill-switch ③（:2857）→ starter 可用性（:2860）→ loopback 就绪（:2864）→ 发会话。**kill-switch 先于 starter**——开关关闭时零端口探测、零资源触碰（§3.6 纯粹性 ✓，与 Step 3 惰性裁定同精神）。常量预填完整：client_id/redirect_uri/scope/authUrl 全取 CHATGPT_PRESET（:2874-2888），账号同名字段不读（零配置语义，测试 :526 钉住）。PKCE verifier=32 字节 base64url / challenge=SHA-256 base64url / S256 / state（:2869-2871）与通用路径同款且符 H3-4。oauthPending 会话含 `redirectUri: CHATGPT_PRESET.redirectUri`（:2884）——exchange 侧消费源正确。
- **oauthTokenExchange preset 分支（:2921-2983）**：未知 preset 拒绝（:2922）→ redirect_uri 强制死值（:2927，裁决见 §6-2）→ tokenUrl/clientId 取常量（:2928/:2937）→ **clientSecret 恒空**（:2939 `preset ? ''`，公共 PKCE client 无 secret，H3-1）→ 三元校验（refresh 非空 :2971 / expiresIn 正有限数 :2973 / accountId 提取成功 :2975）先行，**任一缺失即明确报错且 finish() 消费 pending**（:2972/:2974/:2976）→ 四元组落盘 `{type:'oauth', access, refresh, expires: Date.now()+expiresIn*1000, accountId}`（:2978，**H3-6 绝对时间算式逐字一致**；accountId 经模块级 accountIdFromJwt 提取——R2 批准的真实 API，import :36 核实）→ 返回 wire expiresIn（:2982）。finish() 覆盖 fetch 后全部返回路径 ✓（fetch 前失败不删会话——用户可携正确 code 重试，与通用路径同语义）。
- **resolveOauthToken preset 分支（:2289-2314）**：store 实例经 credentialStoreFor（路径缓存）；read() undefined → "尚未登录"明确报错（:2297）；ensureFresh 异常域处理精确——**仅 REFRESH_FAILED 包装**（文案对齐 :2450-2451 既有 401 重登语族"请在账号卡片中重新登录"），`wrapped.code` 保留 + **status/timedOut 条件转发不吞掉**（:2307/:2308，R4 转发语义落实）；CREDENTIAL_LOCK_TIMEOUT / CREDENTIAL_FILE_CORRUPT 原样上抛（非 REFRESH_FAILED 域，无元数据可转发，语义正确）。快路径（新鲜凭据零网络）由 ensureFresh :426 保证（测试 :547 以 fetch 计数不变证明）。
- **credentialStoreFor（:2274-2282）**：resolveCredentialPath（credentialFile 非空用之/否则默认路径，Step 2 已审 API）→ Map 按路径缓存 → O(1) 复用。边界推演见 R5-F3（同实例 token 退化角）。
- **kill-switch ③ 调用期缺口**：见 R5-F1（P2，裁决 §6-1）。

### 2.2 安全性 — 通过（P7 逐面核验）

- **错误消息零 token 值**：新增消息面全清单核对（:2855/:2858/:2862/:2866/:2923/:2929/:2957/:2972/:2974/:2976/:2980/:2293/:2297/:2305/:2316）——refresh/ access 值零出现；:2305 内联的 errorMessage(error) 为 oauth-credentials 侧 redactError 后产物（R4 已审脱敏纪律）；:2980 保存失败消息含 store.write 抛出的 fs 级错误（路径+errno，无凭据值——write 路径无 redactError 需求，其错误源均为 fs 操作，核验成立）。
- **凭据落盘位置**：仅 credentialFile/默认路径（resolveCredentialPath 单通道）；测试用临时目录隔离（smoke :464/:474），零真实 DSH_HOME 触碰 ✓。
- **clientSecret 恒不参与**：:2939 preset 臂空串 + :2940 条件 set——wire 上永无 client_secret（测试 :539 `!exchangeBody.has('client_secret')` 钉住）✓。
- **PKCE/state**：S256 全流程（begin :2876-2877 / exchange :2934 code_verifier）；state 会话 10 分钟过期 + 单次消费（:2907 过期拒绝 + finish 删除；重放测试 :417 既有钉住）。
- **originator 诚实自标识**：'dsh-agent-router'（:2879，E5——不伪装 codex_cli）✓；值未测试钉住见 R5-F4（P3）。
- **注入面**：全部参数经 URLSearchParams 构造（:2872-2883/:2930-2934），无拼接注入面；无新输入面（request 字段均为既有 schema 域）。

### 2.3 可维护性 — 通过（1 条 P3 函数长度）

- 命名：oauthBeginPreset / credentialStoreFor / oauthCredentialStores 与既有 oauthPending/oauthLoopbackReady 族平行，语义自释 ✓。
- 注释质量：三段 JSDoc 交叉引用 §3.4 条目 1/2/5、H3-1/3/6、E5、R4 转发语义、P3 对比（"对比通用账号只存 access 单值——下方 tokenRef 原路径保持不变，P3"）——审查者可从注释直接溯源 ✓。
- 函数长度：oauthBeginPreset 39 行 ✓；resolveOauthToken 37 行 ✓；**oauthTokenExchange ~100 行**（:2898-2998，超 50 行建议线——通用路径原已 ~85 行超标，本步内联 preset 分支 +15；begin 侧已抽方法而 exchange 未抽的差异化处理有共享 fetch 骨架的正当理由，见 R5-F6）。
- 单职责：service.js 承接授权流编排（§3.4 明确分工），凭据细节全部委托 oauth-credentials 模块 ✓（C3）。

### 2.4 性能 — 通过

- 三点分流均为前置 O(1) 判定，通用路径零新增开销；preset resolve 快路径 = 一次同步文件读 + 过期比较，零网络（测试 :547 计数证明）。
- credentialStoreFor Map 查找 O(1)，实例缓存避免重复构造；路径集合有界（用户配置面），无泄漏。
- 无新算法/数据结构面；无 N+1/O(n²)。

### 2.5 测试覆盖 — 通过（20 断言手工清点精确吻合，判别力强）

- **计数**：Step 4b 块（smoke :458-572）check() 手工逐条清点 = 18，apply wiring 块（:1376-1377）= 2，合计 **20** ✓；任务书分解（4 begin + 1 kill-switch + 1 未就绪 + 1 未知 preset + 5 exchange + 6 resolveOauthToken + 2 R3-F3 = 20）**逐项精确吻合** ✓；smoke 655 = 635+20 算术自洽（exit=0 属 Coordinator 复跑证据，本审查未运行，如实标注）。
- **判别力抽查（强断言）**：:519-524 期望值经同机制 URLSearchParams 推导（编码漂移免疫）+ redirectUri 干扰值反证（请求传 `https://ignored.example/cb`，断言 URL 含 preset 死值参数——实现若用请求值即 FAIL）；:526 evil.example/WRONG 否定断言（零配置语义）；:527 pending 会话三字段（含 redirectUri===死值）；:539 wire 形状（client_id 相等 + code_verifier 存在 + **client_secret 不存在**）；:541 四元组盘上文档全等（含 accountId='acct-cgpt-1' 证明 JWT 提取链）；:542 绝对时间窗 (before+3590s, after+3601s]（H3-6 算式钉住）；:543 pending 消费；:547 零网络计数；:553 刷新触发计数 +1；:554 rotating 盘上覆写（新旧 refresh 值比对）；:562 status===401 转发证明；:1376-1377 真实 service 惰性（R3 F-3 闭合）。
- **夹具隔离**：独立 presetService + 临时目录 + fetch 覆盖于 finally 恢复（:568-571）——主夹具零污染 ✓；凭据读写不触真实家目录 ✓。
- **缺口**（均 P3）：originator 值未钉住（R5-F4）；timedOut 转发未测（R5 裁决 §6-4）；手动模式 redirectUri 强制未测（R5-F5）；R3 F-1 settled 无测试（§6-4）。

## 3. 发现列表（P0-P3 + 位置 + 事实 + 建议）

**P0 = 0，P1 = 0，P2 = 1，P3 = 5**。无阻塞项。

| # | 级别 | 位置 | 事实 | 建议 |
|---|---|---|---|---|
| R5-F1 | P2（合规契约缺口，范围裁决成立但须绑定 Step 5） | lib/service.js:2289-2314（resolveOauthToken preset 分支无 oauthExperimental 检查）；现行可达链：lib/client.js:1404（通用账号卡 discover 按钮，`disabled: !entry \|\| !entry.baseURL`——preset 账号 baseURL 预填即启用）→ service.js:3009 oauthDiscover → resolveOauthToken | §3.6 ③ kill-switch 契约 = "关 = 入口隐藏 **+ 既有 preset 账号调用时明确报'实验通路已关闭'**"；本步实现 oauthBegin 层（:2857 ✓），调用期（resolveOauthToken/runOauthChat）未加——oauthExperimental=false 时，经 oauthDiscover 的 preset 账号仍会读凭据并向 auth.openai.com 发刷新请求（网络调用越过开关）。缓解事实：① UI 无 preset 创建入口（Step 6），暴露需手工编辑 settings.yaml 或"开启→建号→关闭"序列；② 主消费方 runOauthChat codex-responses 分支未实现（Step 5），调用无成功通路；③ 自 Step 1 起有文档化延期（schemas.js:217 "报错逻辑在后续步骤"） | **裁决：本步范围界定成立**（任务书只要求 oauthBegin 层 + C4 切片纯粹性 + 契约面在 Step 5 才有真实消费方，论证见 §6-1）。但 **MUST 绑定 Step 5 任务书**：在 resolveOauthToken preset 分支入口加 oauthExperimental 检查（单点覆盖 runOauthChat + oauthDiscover 两个消费方），作为 v0.3.0 §3.6 合规出口条件的硬性条目 |
| R5-F2 | P3（一致性/超时面） | lib/service.js:2945-2951（exchange fetch 无 AbortController） | token 交换 fetch 无超时（挂起端点 = 回调页无限等待）；与通用路径同形（先例一致，非新引入模式）；对照：凭据模块刷新已有 25s 超时（R4 F-01a 加固）——同域网络调用防护不对称 | Step 5 触及 exchange 时顺带套用 refreshCredential 的 AbortController 模式（一行族修改）；优先级低于 R4-F1 |
| R5-F3 | P3（锁所有权退化角） | lib/service.js:526-528/:2274-2282（同路径复用同实例 → 同 lockToken） vs lib/oauth-credentials.js:488/:534-544 | 实例缓存使**同一 service 的并发临界区共享 lockToken**：F-01b 所有权校验（token 匹配才 unlink）在同实例陈旧接管场景失去区分力——推演：调用①持锁在 response.json() body 相位停滞（R4-F1 盲区，timer 已清、undici bodyTimeout ~300s）→ 30s 后调用②同实例陈旧接管（重写锁文件 token 不变）→ 调用①最终释放时 token 匹配 → **误删调用②的锁** → 第三进入者可与②并发。当前经 25s<30s 时间分区不可达（除 R4-F1 盲区外全相位有界），后果有界（rotating 宽限 + 重登兜底，R2 F-01 后果分析继续适用） | 无需改缓存（token 稳定性对跨实例场景仍是正确设计，BC-E6 ③）。**闭合 R4-F1（clearTimeout 移至 payload 解析后）即消除唯一可达停滞面**，本退化角随之不可达——建议 Step 5 将 R4-F1 升格为必闭项（原为"顺带闭合"） |
| R5-F4 | P3（测试判别力） | tests/smoke.mjs:525（仅断言 `originator=` 存在） | originator 值 'dsh-agent-router'（E5 合规自标识——不伪装官方 CLI）未被测试钉住：回归为 'codex_cli'（伪装）或任意值均通过 | 一行强化：`pbegin.authUrl.includes('originator=dsh-agent-router')`（URLSearchParams 编码下该值无特殊字符，可直接子串断言）；随 Step 5 触及 smoke 时顺带 |
| R5-F5 | P3（测试缺口） | lib/service.js:2927（手动模式 redirectUri 强制）vs tests/smoke.mjs:534（仅 state 模式） | preset 手动粘贴交换（无 state、传 accountId+codeVerifier+redirectUri）的 redirectUri 强制覆盖未测——行为本身正确（§6-2 裁决），但回归（如改回信任传参）不会被现有测试捕获（state 模式下 :2927 为无害重复赋值） | Step 6 手动粘贴 UI 接线时补手动模式交换断言（构造无 state 请求 + 干扰 redirectUri + 断言 wire 上 redirect_uri=死值） |
| R5-F6 | P3（函数长度） | lib/service.js:2898-2998（oauthTokenExchange ~100 行） | 超 SKILL 维度 3-2 建议线 50 行（通用路径原已 ~85 超标，本步 +15）；begin 侧抽为 oauthBeginPreset 独立方法而 exchange 内联——差异化有正当理由（generic/preset 共享 fetch/响应骨架，强抽会复制骨架），但持续增长趋势明确 | 后续触及（设备码流 §3.4 条目 4 将再增长本函数族）时提取 persistPresetCredential(quad) 或 exchangePreset 分支方法；非本轮义务 |

## 4. AI 代码专项 5 项结论

| # | 检查项 | 结论 | 事实依据 |
|---|---|---|---|
| 1 | mock 残留 | **通过** | service.js/index.js 新增代码零 fake/mock/stub/占位（grep 复扫零命中，TODO/FIXME/XXX/HACK/debugger 亦零）。测试侧 fakeJwt/presetFetches/`codexLoopbackStarter = async () => ({ready...})` 为显式命名夹具，注入通道 = 真实 DI seam（starter 本就是 index.js 注入的实例字段，Step 3 已审设计）或 globalThis.fetch 覆盖（smoke 既有模式 :489/:455 finally 恢复）——非 mock 渗漏 |
| 2 | 硬编码返回值 | **通过** | 全部"硬编码"均为设计常量且单一事实源：CHATGPT_PRESET.*（Step 2 冻结常量，pi-ai 快照 + H3-1/2/3/5 事实钉住）；originator='dsh-agent-router'（E5 设计值）；10 分钟会话过期（通用路径同款复用）；Date.now()+expiresIn*1000（H3-6 算式）。无虚构数据 |
| 3 | 幻觉 API | **通过** | 本步新消费 API 逐一核实为真实导出：accountIdFromJwt/resolveCredentialPath/OauthCredentialStore/CREDENTIAL_ERROR_CODES/CHATGPT_PRESET（oauth-credentials.js 实导出，import :36 ✓，且 accountIdFromJwt 为**模块级**函数非 store 方法——R2 已批准的真实 API 形态）；OAUTH_PRESET_VALUES（schemas.js:142 实导出，import :33 ✓）；store.write 四元组形状与 credentialProblem 严格校验五字段（type/access/refresh/expires/accountId）精确匹配 |
| 4 | 未实现 TODO | **通过** | grep 零命中。注释中 "Step 5 消费"/"Step 4 接线"/"设备码登录将在后续版本提供" 均为 plan-tracker 分步计划的显式边界声明（含对用户的诚实降级提示 :2866），非遗弃标记 |
| 5 | 过度实现 | **通过** | 新增面逐项在任务书范围内：三点分流/常量预填/四元组落盘/ensureFresh 集成/R3 三项闭合。未提前实现：设备码流（§3.4 条目 4，grep 零踪迹）、手动粘贴 UI（Step 6）、codex-responses 协议分支（Step 5，runOauthChat :2352 协议数组未动 ✓）、调用期 kill-switch（延期有据，§6-1）。构造器第三声明（oauthCredentialStores）为本步条目 2 必需非镀金 |

## 5. 设计一致性核查（§3.4 条目 1/2/5 + H3 事实 + E5 + §3.6 + R4 转发语义）

| 基准项 | 要求 | 实现 | 判定 |
|---|---|---|---|
| §3.4 条目 1：oauthBegin preset 分支 | 常量预填（零配置）；附加参数对齐 H3-4（originator 必带 + 两可选）；pending 复用 oauthPending（10 分钟） | :2853-2891 全项落实；附加参数与 pi-ai 快照 :228-242 逐参数一致（§0 对照表）；账号同名字段忽略（测试 :526） | ✓ |
| §3.4 条目 2：exchange preset 分支 | 保存完整四元组到 OauthCredentialStore；提取 refresh_token/expires_in（H3-6）；通用账号只存 access 单值保持不变 | :2967-2983 四元组 + H3-6 算式 + 三前置校验；:2984-2997 tokenRef 原路径未动（P3，§0 双层验证） | ✓ |
| §3.4 条目 5：resolveOauthToken | preset → store.ensureFresh()（临期自动刷新）；通用 → 现行为不变 | :2295-2313 集成完成（快路径零网络/临期刷新/REFRESH_FAILED 包装）；:2315-2324 通用路径未动 | ✓ |
| §3.1 H3-1（公共 client 无 secret） | clientId 常量、PKCE 公共客户端 | :2874/:2937 常量；:2939 secret 恒空 + 测试 wire 断言 | ✓ |
| §3.1 H3-3（1455 死值两侧一致） | authorize 与 token 交换 redirect_uri 必须匹配 | begin :2875 + pending :2884 + exchange :2927 三重同源 CHATGPT_PRESET.redirectUri | ✓ |
| §3.1 H3-4（PKCE + 附加参数） | verifier/challenge/S256/state + originator + 两附加 | :2869-2883 与 pi-ai 快照逐参数一致 | ✓ |
| §3.1 H3-6（token 响应三元 + 绝对时间） | access/refresh/expires_in 必含；expires=Date.now()+expires_in*1000 | :2971-2978 校验 + 算式逐字一致 + 测试时间窗 | ✓ |
| §3.1 H3-7（accountId JWT 提取） | claim `https://api.openai.com/auth`→`chatgpt_account_id` | :2975 模块级 API（oauth-credentials.js:183-198，R2 已审实现） | ✓ |
| §3.2 E5（originator 诚实自标识） | 'dsh-agent-router'，不伪装官方 CLI | :2879 ✓（值未测试钉住 → R5-F4） | ✓（附 P3） |
| §3.6 ③ kill-switch | 关 = 入口隐藏 + 调用时明确报错 | **oauthBegin 层 ✓**（:2857）；调用层未实现（R5-F1——范围裁决成立 + Step 5 绑定） | 部分（附裁决） |
| §3.6 ①②（现有层） | router.enabled / account.enabled 现状 | 未改动（①由 run 入口 isEnabled 承接、②现状字段调度侧语义，本步无涉及无回归） | ✓（未扰动） |
| R4 转发语义（timedOut/status 不吞掉） | REFRESH_FAILED 域元数据透传，Step 5 消费 | :2306-2308 code 保留 + status/timedOut 条件转发；status 已测（:562）、timedOut 未测（裁决 §6-4） | ✓（附 P3） |
| E3-a/E2-a 衔接 | preset 语义 = 凭据形态与账号形态按 §3.2 决策 | 分流三点与 E3-a 尾注"两种凭据形态在 resolveOauthToken 处分流"逐字对应；E2-a 同名字段忽略语义落地 | ✓ |
| C4 commit 纯粹性 | 单 commit 单主题 | reflog :116 单条；主题 = 授权流 preset 分支 + R3 三项闭合（均为本步义务，无越权）；三文件与任务书一致 | ✓ |
| P3 通用账号零改变 | 通用路径逐行原样 + 分流判定严谨 | §0 双层验证（行为契约级 ✓ + 结构通读级 ✓；行级未验证标注） | ✓（方法学限定） |

**原则违反标注：无**（P1 事实：全部结论指向文件:行号，不可验证处标注"未验证"（diff 计数/TDD 红灯/运行数值归属）；P2 全面：三点分流 + 三消费方 + 错误域逐面覆盖，kill-switch 缺口立案 R5-F1 而非放过；P3 零改变：双层验证 + 635 基线断言零回退；P4 测试看护：20 断言强判别力为主，三处缺口显式立案（R5-F4/F5/§6-4）；P5 泛化：preset 机制经 OAUTH_PRESET_VALUES 数组扩展（C-2 anthropic 预设加一行即入），credentialStoreFor 按路径泛化不绑定单账号；P6 质量：授权流三消费方 + 降级链错误文案 + 合规开关一体交付，无凑合面；P7 安全：§2.2 逐面核验（消息零 token 值/落盘单通道/secret 恒空）；C1：分流点前置插入对既有结构零侵入；C2：无腐化（exchange 长度增长立案 R5-F6 跟踪）；C3：凭据细节全委托模块；C4：✓）。

## 6. 裁决项（任务书指定的四项重点裁决）

| # | 事项 | 裁决 | 依据 |
|---|---|---|---|
| 1 | **kill-switch §3.6 ③ 调用期检查延期 Step 5——本步范围界定是否成立** | **成立（不构成本轮缺陷），但 MUST 显式绑定 Step 5 任务书** | 四点：① 任务书原文只要求 oauthBegin 层（Coordinator 任务书主张——本审查无法直读任务书全文，标注：该主张与代码现状/注释边界一致，采信）；② 自 Step 1 起有文档化延期锚点（schemas.js:217 "报错逻辑在后续步骤"——R1 已审该文案）；③ 调用期检查的**真实消费方在 Step 5 才存在**（runOauthChat codex-responses 分支未实现，:2352 协议数组未含；现仅 oauthDiscover 一条侧通路可达且终点必败——backend-api 无 /models）；④ C4 切片纯粹性。**但**：§3.6 是合规边界（v0.3.0 出口条件），且 oauthDiscover 链今日即真实可达（client.js:1404 → :3009 → 刷新网络调用越过开关）——延期必须显式入账不得隐式流失。建议落点：resolveOauthToken preset 分支入口（单点覆盖两消费方） |
| 2 | **手动模式 redirectUri 强制覆盖（微决策 #4）** | **正确（唯一正确行为）** | H3-3：redirect_uri 是 client 注册死值且**服务端要求 authorize 与 token 交换两侧匹配**。preset 的 authorize 恒用死值（:2875/:2884）→ exchange 侧无论一键（pending 取回死值）还是手动（用户传参可能来自其他 origin 或粘贴残缺）都必须是死值，否则必 400 redirect_uri_mismatch。:2927 的无条件强制正是把不变式钉在代码里；信任手动传参才是缺陷。测试缺口单列 R5-F5（行为正确性 vs 回归看护是两件事） |
| 3 | **accountIdFromJwt 模块级 API（非 store 实例方法）** | **正确（消费真实 API）** | roadmap §3.3 接口草案将其画在 store 类内（:241），但 Step 2 实现为模块级导出且 R2 审查已批准该形态（纯函数无状态，不依赖实例）；本步 :2975 按真实导出消费（import :36 ✓）——消费点与被批准的实现一致。若按草案画法调用 `store.accountIdFromJwt` 反而会是幻觉 API（AI 专项第 3 项正面证明） |
| 4 | **timedOut 元数据转发未测（自报 3）** | **可接受（P3 级缺口，建议 Step 5 补）** | 三点：① 转发实现为一行对称代码（:2308 `if (error.timedOut === true) wrapped.timedOut = true`），其姊妹元数据 status 已有测试（:562）——同构面半覆盖；② 生成机制已在 oauth-credentials.mjs 测试钉住（R4 :214 `timedOut === true` + signal 接线证明）；③ 本测试块补测需 signal-尊重型 hang fetch（现有 mock 不尊重 signal 会永久挂起）——成本高于当前收益。Step 5 消费 timedOut（瞬态可重试域分类）时补"hang-fetch → 转发断言"即有真实回归价值。**R3 F-1 无自动化测试（自报 4）同样可接受**：迟发 error 发射需 server 实例句柄而 createCodexLoopback 不导出 server（导出面最小化正当）；触发面 R3 已论证接近不可达（Node http.Server 'error' 实为 listen 相位事件）；代码级闭合经本审查逐行核实（§1） |

## 7. Developer 自报事项核实（不采信自述，逐项对仓库）

| # | 自报 | 核实结果 |
|---|---|---|
| 1 | 断言计数 smoke 655 = 635+20（Coordinator 复跑 exit=0；loopback 20 + credentials 75 独立亦绿） | **20 断言手工逐条清点精确吻合**（§2.5：18 块内 + 2 wiring）；任务书分解（4+1+1+1+5+6+2）逐项吻合 ✓；655=635+20 算术自洽 ✓；三套 exit=0 属 Coordinator 复跑证据（本审查未运行，如实标注）✓。判别力评估：整体强（§2.5 抽查七类），唯 originator 值（R5-F4）/timedOut（裁决 4）/手动模式（R5-F5）三处缺口 |
| 2 | "evil.example/WRONG 干扰值"测试——账号同名字段确实被 preset 常量覆盖 | **属实**：begin 侧直接断言（:526 authUrl 不含 evil.example/WRONG）；exchange 侧间接证明（:537-539 exchangeCall 按 CHATGPT_PRESET.tokenUrl 检索命中 + client_id 全等断言 + mock 对其他 URL 一律 404 → 若用 evil.example/token 则 :536 必 FAIL）；resolve 侧经 credentialFile 正常工作佐证常量域完整 |
| 3 | timedOut 元数据转发未测（对称代码 + 生成机制在 oauth-credentials 覆盖） | **缺口属实，可接受性裁决成立**（§6-4：一行对称 + status 已测 + 生成侧已钉 + 补测成本分析） |
| 4 | R3 F-1 无自动化测试（server 实例不外露） | **属实，可接受**（§6-4：导出面最小化正当 + 触发面近不可达 + 代码级闭合本审查核实） |
| 5 | TDD 红灯记录（9 FAIL → 绿）；1 次测试侧 URLSearchParams 编码修正 | **未验证**（过程性主张，仓库无红灯工件可查——按事实红线如实标注，不影响结论）。编码修正的产物可见且方法正确：:516-518 期望值经同机制 URLSearchParams 推导而非手写编码（对编码漂移免疫，是修正后的正确形态）；9 FAIL 数值无法核验 |

## 8. 硬门槛自检

| 门槛 | 结果 |
|---|---|
| P0 阻塞数 = 0 | ✓（0） |
| 5 维度全覆盖 | ✓（§2.1-§2.5 逐一有结论） |
| 每条发现标注级别 | ✓（6/6 有 P2/P3 标签 + 位置 + 事实 + 建议） |
| 设计一致性检查完成 | ✓（§5 逐项表：§3.4 条目 1/2/5 + H3-1/3/4/6/7 + E5 + §3.6 三层 + R4 转发语义 + E2/E3 衔接 + C4/P3 十四面全核） |
| AI 专项 5 项完成 | ✓（§4 逐一有结论） |
| R3 闭合验证表 | ✓（§1：F-1/F-2/F-3 均已修复 + 证据；R3/R4 遗留 P3 对账） |
| 事实红线 | ✓（每条结论指向文件:行号；运行数值标注"Coordinator 复跑/本审查未运行"；diff 精确 ±计数与 hunk 形状、TDD 红灯记录、任务书原文三处标注"未验证/采信限定"；service.js ±计数与 2965 基线的 4 行差异如实记录） |

## 9. 终态结论

# APPROVED_WITH_NOTES

- **unresolved_blockers=0**
- 发现计数：**P0=0 / P1=0 / P2=1 / P3=5**
- **R3 三项闭合状态**：F-1（settled 标志）**已修复**；F-2（构造器声明）**已修复（超额：三声明含 oauthCredentialStores）**；F-3（惰性断言）**已修复（真实 service 判别力恢复）**。R3 P2 存量清零；R3 P3 遗留（F-4/F-5/F-6）维持台账（非义务），F-8② 已经 DEC-021 闭合。
- 关闭条件判定（SKILL）：P0=0 且 P1=0 → 可合并/进入 Step 5。
- P2 处置建议（R5-F1）：**Step 5 任务书 MUST 纳入** §3.6 ③ 调用期检查（落点 resolveOauthToken preset 分支入口，单点覆盖 runOauthChat + oauthDiscover），并与 R4-F1（body 相位超时，建议升格必闭——同时消除 R5-F3 退化角）同批闭合；R5-F4（originator 值断言一行）随 Step 5 触及 smoke 顺带；R5-F5 随 Step 6 手动粘贴 UI 补测；R5-F2/R5-F6 观察级随触及处理。
- Coordinator 转发建议：① R5-F1 + R4-F1 绑定 Step 5（上表）；② EV-033 证据入账时记载 R3 三项闭合 + 本审查 20 断言对账；③ R3 F-4/F-5/F-6 与 R4-F2 维持遗留台账。
- 审查局限声明：本审查未执行任何测试/命令（655/20/75 exit=0 为 Coordinator 复跑证据）；精确 diff ±计数与 hunk 形状（含 service.js 2961 vs 基线 2965 的 4 行差异归因）、TDD 红灯过程、Step 4b 任务书原文三处标注未验证/采信限定；通用路径零改变的证明为行为契约级 + 结构通读级双层证据（行级字节级等效未验证，方法学与 R3/R4 先例一致）；所有结论基于 HEAD 文件实况 + git refs/reflog 锚点 + pi-ai 快照逐参数对照 + R1-R4 报告对账 + 设计基准交叉核对。

---
*审查者：Code Reviewer Agent（EVO-002 Step 4b · R5）· 2026-08-21 · 依据 agents/code-reviewer.md + skills/code-review/SKILL.md + evolution-roadmap-v1.md（§3.1 H3-1/3/4/6/7 / §3.2 E2-a/E3-a/E5 / §3.4 条目 1/2/5 / §3.6）+ .governance/project-principles.md（P-v1）+ review-EVO-002-R3.md（闭合源）/ R4.md（转发语义源）/ R1-R2（前轮链）+ plan-tracker:57 + .router-files/pi-ai-auth-oauth-openai-codex.js（:228-242 逐参数对照）*
