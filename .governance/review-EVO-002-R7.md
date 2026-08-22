# Review Record (machine-written by review-record)

- task: EVO-002
- round: R7
- date: 2026-08-22
- reviewer: Code Reviewer
- report: .governance/review-EVO-002-R7.md
- wiring: pending

**审查结论**: **APPROVED_WITH_NOTES**

unresolved_blockers=0

---

# EVO-002-R7 完整审查报告（原文恢复）

> 出处：review-record CLI --report 覆盖预防——备份恢复（2026-08-23）。

# Code Review 报告 — EVO-002 Step 6（账号卡 / Q2 / 代理发现 / C-9）

| 项 | 值 |
|---|---|
| Task | EVO-002（v0.3.0 C-1 ChatGPT 订阅 OAuth 实施）· Step 6 / ~7（账号卡 UI + §3.6 ToS 门 + oauthLogout/W-5 + §3.5 Q2 能力接口 + 代理发现 + C-9 埋点启动） |
| Round | **R7**（新切片首审，非返工复审。前轮链：R1=Step 1 schemas / R2=Step 2 凭据模块 / R3=Step 3 1455 loopback / R4=Step 4a 凭据加固 / R5=Step 4b 授权流 preset 分支 / R6=Step 5 codex-responses 协议分支（APPROVED_WITH_NOTES，P3×6 台账）——全部 APPROVED_WITH_NOTES 闭环，见 `.governance/review-EVO-002-R1~R6.md`） |
| 审查对象 | 三 commit：**`5f5a38b`**（服务面：rpc.js oauthLogout descriptor + schemas.js oauthTosAccepted/oauthProxyUrl + service.js oauthCapabilities/resolveOauthProxy/runOauthDispatch/recordOauthEvent/oauthLogout/presetLoggedInOf/loadOauthProxyDispatcher + smoke Step 6 块）/ **`522025e`**（账号卡 UI：client.js +212——实验区开关+ToS 弹窗、PresetAccountCard、登录轮询、登出、W-5 删除联动、模型编辑、i18n；client-render ×10）/ **`f9d8bf0`**（C-9 观测：metrics.mjs +85 observeOauthTelemetry/C-9-1） |
| **权威范围声明** | **本审查以 `.governance/diff-EVO-002-Step6-3commits.patch`（84KB/1195 行，三 commit 全文）为权威审查面，已逐行通读**。工作树 lib/service.js / lib/schemas.js / tests/smoke.mjs 现正被并行任务 EVO-003 Phase 2 编辑（stats 域）——现状文件中 stats 域与 diff 存档的漂移**属并行任务范围、不在本审**；Step 6 相关代码经现状文件交叉核验（client.js / rpc.js / metrics.mjs / client-render.mjs 无并行改动；service.js Step 6 段落现状与存档一致——见 §0）。 |
| 审查者声明 | Code Reviewer Agent（独立于 Developer）；只读审查，未修改产品代码。测试数值全部为 **Coordinator 提供事实**（smoke 733 ok/0 FAIL＝基线 695+38 / oauth-credentials 80 / metrics 全过含 C-9-1 / parity 14 / loopback 20；TDD 红灯留痕：服务面 3 判别失败 + client-render 红相 8→绿相 10）——本审查无执行权限未复跑，数值归属如实标注。已全文加载 agents/code-reviewer.md 与 skills/code-review/SKILL.md。 |
| 审查范围 | 仅三 commit 引入内容。真机首联验证项（1455 回调实测 / 代理 7890 端到端 / V-EVO-3 / fetch 桩外的真实 403×usage_* 与 \r\n 分帧形态——R6-F2/F5 裁决延续 EV-048）与出口③设备码流排期（Coordinator 决策项）不构成本轮缺陷。 |

---

## 0. 审查方式与锚点核实

- **diff 存档逐行通读**：1195 行全读（5f5a38b :1-617 / 522025e :618-1079 / f9d8bf0 :1080-1195），三 commit 边界与任务书声明一致。
- **现状交叉核验**（read/grep 工具）：lib/service.js Step 6 段落（:523-541 oauthCapabilities/resolveOauthProxy、:2471-2495 runOauthDispatch/recordOauthEvent、:2702-2704 代理接线、:3044 catalog 镜像、:3177-3221 oauthBeginPreset 门序、:3398-3448 oauthLogout/presetLoggedInOf/loadOauthProxyDispatcher）、lib/client.js（:1241 PresetAccountCard、:2293-2407 实验区六函数、:2760-2785 装配、:2790 通用区渲染）、lib/rpc.js（:120-126 oauthLogout descriptor）、lib/schemas.js（:224-232 两新配置项 + :245-261 check 语义）、tests/smoke.mjs Step 6 块（:750-905）、tests/client-render.mjs（:871-929 ×10 断言）、tests/metrics.mjs（:637-712 C-9-1）。现状与存档一致；stats 域漂移未纳入比对。
- **断言计数对账**：smoke Step 6 块 check() 手工清点 = **26**（A1+B5+C3+D5+E3+F3+G3+H2+块完整 1，与 diff 逐条吻合）+ schemas 区 2（default/explicit）= 28；client-render 'step6:' 前缀 grep 精确 **10**；28+10=**38** = 733−695 ✓ 算术闭合。
- **codec 双向兼容实证**：schemas.js check()（:245 注释"未知字段透传"+ optional 缺省容忍）与 client.js wireCheck（:54-61 仅遍历声明 properties）——新服务端↔旧客户端、旧服务端↔新客户端两方向 catalog 兼容成立（疑区 (g)）。
- **过程披露**：① 本审查误用一次 pwsh 只读计数命令（统计 smoke 块 check 数）——角色权限表禁止 Bash/pwsh，即便只读亦属流程违规，如实披露，此后未再使用（其余计数均 grep 工具完成）；② 三 commit 的 git 层文件清单以 diff 存档 + 任务书声明为准，未独立 git 核验（无执行权限）；③ TDD 红灯过程不可从仓库复核，采信 Coordinator 事实。

## 1. R6 台账与编排对账（任务书指定）

| R6 交办项 | 本轮对账 |
|---|---|
| **"代理发现必含已交付"（出口①部署级缺口 → Step 6 任务书必含）** | **已交付**：resolveOauthProxy（service.js:534-541，配置>env 四键>直连三态）+ codex 调用 dispatcher 接线（:2702-2704，仅 chatgpt.com 目标）+ undici 动态 import fail-loud（:3438-3448）+ 独立测试三态/dispatcher/直连/fail-loud 四组（smoke F/G 块）✓ 编排义务兑现 |
| R6-F1（kill-switch 冷凭据半边断言缺口，P3） | 未触及（Step 6 测试面新增的是 begin 侧 kill_switch 事件断言，非调用期冷凭据断言）——台账合法延续，建议随 Step 7 |
| R6-F2（\r\n 分帧）/ R6-F5（403×usage_* 文案序） | EV-048 已裁决"待真机首联"（fetch 桩无法构造真实形态）——合理，维持 |
| R6-F3（函数长度）/ F4（incomplete_details 观察级）/ F6（四测试缺口） | 未触及，台账延续（非义务项） |

R6 P2 存量 = 0（R6 时已清零），本轮维持；R1-R7 审查链 P2 累计闭环状态不变。

## 2. 五维度逐项结论

### 2.1 正确性 — 通过（0 阻塞；2 条 P1 均为客户端集成完整性，非服务端逻辑错误）

- **§3.6 ToS 三级门（疑区 a）**：服务端门序逐行核实 = unknown_preset（:3178）→ kill_switch（:3182）→ **tos（:3188）** → starter（:3193）→ loopback（:3198）——experimental 之后、loopback 之前 ✓ 与设计注释一致。手改配置（oauthExperimental=true + oauthTosAccepted 缺省 false）→ begin 被拒 ✓（测试 :839 判别：ok===false && message 含'条款' && 不含'1455'——证明拒绝发生在 ToS 层而非 loopback 层，夹具 starter 恒 ready）。客户端：拒绝 → `if (next && !window.confirm(...)) return` 不写任何 op（:2301）✓；接受 → 两 op **同一次 mutate 批量**落盘（:2302-2304，单次 save 事务）✓。ToS 措辞如实：zh"可能违反 OpenAI 服务条款，可能导致账号受限或封禁——风险自担（Use at your own risk）"+ 服务端拒绝文案含"订阅转插件调用可能导致账号受限，风险自担"——UAYOR 未淡化 ✓（§3.6 措辞对齐）。三层 kill-switch：①router.enabled ②account.enabled（现状未扰动）③oauthExperimental+ToS（本轮）✓。
- **oauthLogout（疑区 b 服务面）**：幂等成立——store.delete 幂等（R2 已审 API）+ 二次登出 ok（测试 :846）✓；非 preset 拒绝 / 未知账号拒绝 ✓；**合规路径恒可用**——函数体无 oauthExperimental 检查，实验关闭时登出成功（测试 :848-850 判别）✓；失败路径 recordOauthEvent('preset_logout_fail') + ok:false ✓。
- **W-5 三步联动（疑区 b 客户端）**：主路径 deletePresetAccount（:2385-2399）= oauthLogout（凭据删除）→ 池引用清理 ops → 账号 unset，**单次 mutate 批量原子** ✓（client-render #10 判别：oauthLogoutCalls=1 + pools/main/accounts→[] + unset oauthAccounts/chatgpt 三点齐验）。**但存在旁路与吞错**：R7-F1（通用区未排除 preset 账号→通用删除路径绕过三步联动）+ R7-F2（成功文案错误）+ R7-F4（oauthLogout 失败响应被忽略）——见发现列表。服务端 oauthLogout 本身不删账号条目/池引用是设计分工（JSDoc :3398-3403 明示"清理在客户端删除账号路径联动"），分工正确，缺陷在客户端联动覆盖不全。
- **Q2 接口（疑区 c）**：oauthCapabilities 全协议（含未知）返回 ['chat']——与 §3.5"v0.3.0 全部协议"逐字一致 ✓（测试含 'mystery' 协议判别）；runOauthDispatch（:2471-2480）protocol 推导（oauth→四协议白名单外归一 openai-completions / pool→'account-pool'）+ per-protocol 拒绝文案（含协议名+支持列表）✓；对既有三协议零扰动：chat 放行路径与旧内联检查行为等价（仅拒绝文案升级），旧全局文案已退役（测试 :825-826 否定断言）✓；normalizeType 为既有真实 API（:805，非本步新增）✓。
- **代理发现（疑区 d）**：三态优先序（配置 trim 非空 > env 四键大小写双形态 > 空串直连）✓；env 空值/畸形容错 = `typeof === 'string' && trim()` 双卫（非字符串/纯空白跳过）✓；仅 `String(url).includes('chatgpt.com')` 的调用挂 dispatcher——auth.openai.com（token 交换/刷新，oauth-credentials.js 与 exchange 路径）无 dispatcher 通道**永不经代理** ✓（EV-028 实证对齐）；无代理时不设 init.dispatcher 键（直连零变化，测试 :876 判别 `dispatcher === undefined`）✓；undici 缺失 fail-loud：错误含来源（proxy.source）+ 地址 + 指引（"请为宿主环境安装 undici，或配置可直连的网络环境"），且 fetch catch 的 `includes('undici 代理支持')` 守卫防止被"端点不可达"二次包装 ✓。残留：每次调用新建 ProxyAgent（R7-F3）+ 测试未隔离 env（R7-F5）。
- **C-9 埋点（疑区 e）**：环形缓冲 unshift+截断 length=100——**弃最旧**语义正确（新事件在头部）✓；P7 零 token：全部 recordOauthEvent 调用点 detail 仅 accountId/reason/expiresIn（逐点核对 :3179-3418），测试以夹具 token 子串（sig-step6/REFRESH-STEP6/sig-c9/REFRESH-C9）做否定断言——对夹具值判别 ✓；reason 细分：begin_fail×5（unknown_preset/kill_switch/tos/starter_missing/loopback_not_ready——**覆盖 oauthBeginPreset 全部失败分支**）+ login_fail×4（refresh_token_missing/expires_in_missing/account_id_missing/write_failed）+ login_ok/begin_ok/logout/logout_fail/refresh_fail ✓。缺口：exchange 的 fetch 网络失败形态无事件（P3 观察级，v0.3.0 启动面合理）。
- **catalog 镜像（疑区 g）**：preset/presetLoggedIn 双向 codec 兼容（§0 已证）；presetLoggedIn 条件挂载（仅 OAUTH_PRESET_VALUES 成员）+ presetLoggedInOf 读失败按 false（诊断不抛错）✓；`(await Promise.all(...)).sort(...)` 排序保持 ✓；通用账号 preset='' 无 presetLoggedIn 字段（测试 :862 判别）✓。schemas 增量 fail-safe 方向：oauthTosAccepted 默认 **false**（门闭合）/ oauthProxyUrl 默认 **''**（直连=现状）✓。
- **边界推演**：oauthLogout accountId 非字符串经 String() 归一 → 查无 → 明确拒绝 ✓；resolveOauthProxy 非字符串配置/非字符串 env 值均安全跳过 ✓；runPresetLogin popup 被拦截 → oauthPopupBlocked 明确提示 ✓。

### 2.2 安全性 — 通过

- **P7 红线**：oauthEvents 事件负载零 token 值（§2.1 逐调用点核对 + 双测试否定断言）；新错误消息面（ToS 拒绝/登出失败/undici fail-loud/能力拒绝）全为固定文案或 errorMessage(error) 脱敏产物，无凭据值 ✓。
- **凭据删除路径**：store.delete 单通道（resolveCredentialPath 定界），不触其他账号路径 ✓。
- **注入面**：无新 SQL/命令/eval 面；accountId 仅入 Map 查找与消息插值（el() 文本节点渲染，无 innerHTML）✓；代理 URL 经 undici ProxyAgent 解析，无拼接注入 ✓。
- **ToS 门不可绕过性**：服务端复核独立于客户端（getState 直读配置）——客户端弹窗仅是 UX 层，合规边界由服务端承载 ✓（§3.6 语义正确的分层）。
- OWASP 关键项对本变更（本机凭据文件删除 + 配置开关 + 代理接线）无新增暴露。

### 2.3 可维护性 — 通过（含 1 条 P3 泛化注意项）

- 函数长度全部达标：runOauthDispatch 10 行 / oauthLogout ~17 行 / resolveOauthProxy 8 行 / loadOauthProxyDispatcher ~11 行 / 客户端六函数 5-45 行（runPresetLogin 最长 ~45 < 50 建议线）✓。
- 命名与既有族平行（oauthCapabilities/resolveOauthProxy/recordOauthEvents↔oauthPending 族；PresetAccountCard↔OAuthAccountCard）✓。
- 注释质量高：交叉引用 §3.5/§3.6/W-5/C-9/P7/EV-028/V-EVO-3/BC-E6，审查可溯源 ✓。
- 单职责：服务面（门/登出/能力/代理/埋点）各为独立方法；catalog 镜像仅增字段不改结构 ✓。
- 泛化注意（R7-F10）：客户端 `entry.preset === 'chatgpt-codex'` 硬编码过滤 + addPresetAccount 复制协议常量（baseURL/protocol——服务端忽略故无正确性风险）；未来增第二 preset 需双点修改，偏离 OAUTH_PRESET_VALUES 单源（P5）。

### 2.4 性能 — 通过（1 条 P2 资源管理 + 1 条 P3 观察）

- **R7-F3**：每次 codex 调用经代理时 `new undici.ProxyAgent(proxyUrl)`——每请求新建连接池，不复用、不显式关闭；高频调用下代理连接 churn + socket/FD 压力。建议按 proxyUrl 缓存实例（与 oauthCredentialStores 按路径缓存同款模式，配置变更时可失效）。
- oauthEvents unshift 为 100 元素数组 O(n) 微量操作，环形语义成立 ✓。
- catalog 对每个 preset 账号一次凭据文件读（Promise.all 并行）；登录轮询期每 1.2s 一次 catalog 全量读——文件小、无锁读（write 原子替换保证读端只见旧/新完整态），量级可接受（R7-F11 观察项）。
- 无 N+1/O(n²)；无调用路径新增同步 IO（埋点=数组操作；镜像文件读仅诊断面）。

### 2.5 测试覆盖 — 通过（38 新断言算术闭合；判别力达标；3 条缺口立案）

- **计数**：38 = smoke 28（Step 6 块 26 + schemas 2）+ client-render 10；733=695+38 ✓（§0）。计数断言 15→16 三处更新为注册直接后果 ✓。
- **判别力抽查（疑区 f，要求 ≥4 条推演）**：client-render ×10 逐一推演——**8 条在旧客户端代码下必败**（#1 开关缺失→undefined→FAIL；#4 两 op 恰 2 条旧代码 0 条→FAIL；#5/#6 preset 文案缺失→FAIL；#7/#8 beginCalls/openCalls 捕获空→FAIL；#9/#10 oauthLogoutCalls/saveOps 捕获空→FAIL）；#2/#3 为负向断言（旧代码下 vacuous 通过，属回归看护而非旧代码判别——#3 由 #4 联合补偿，块注释对 ②"必败"的声明过度，R7-F6）。smoke 侧强判别：ToS 先于 loopback（!includes('1455')）、旧全局文案否定断言、per-protocol 文案含协议名、dispatcher.url 精确值（注入桩）、直连 dispatcher===undefined、P7 夹具 token 子串否定、幂等登出、实验关闭合规路径。**≥4 条要求满足（8/10）**。
- **TDD 红灯**：Coordinator 事实（服务面 3 判别失败 + client-render 红相 8→绿相 10）——过程不可独立复核，采信标注。
- **缺口**：presetLoggedIn 翻转→完成提示→popup.close→load() 的登录完成路径无渲染测试（popup 桩 closed=true 短路轮询，R7-F7）；smoke/metrics 未隔离进程代理 env（R7-F5）；R6-F1 冷凭据断言延续。

## 3. 发现列表（P0-P3 + 位置 + 事实 + 建议）

**P0 = 0，P1 = 2，P2 = 3，P3 = 6**。无阻塞项。

| # | 级别 | 位置 | 事实 | 建议 |
|---|---|---|---|---|
| R7-F1 | **P1**（W-5 联动旁路——合规删除路径不完整） | lib/client.js:2790（通用区 `...oauthIds.map(...)` 未过滤 preset）+ :2224-2229（deleteOauthAccount 无 preset 分流） | 通用 OAuth 账号区渲染**全部** oauthAccounts 条目（含 preset='chatgpt-codex'）。后果三重：① 实验开关开启时同一 preset 账号**双卡渲染**（PresetAccountCard + OAuthAccountCard——后者展示服务端忽略的 authUrl/tokenUrl 等可编辑字段，误导）；② 实验开关**关闭**时 preset 账号仅在通用区可见可删；③ 通用卡删除按钮走 deleteOauthAccount：仅 `unset oauthAccounts`（preset 账号 tokenRef='' 故 credentials.unset 也跳过）——**无 oauthLogout 凭据删除、无池引用清理** → 凭据文件（含活 refresh token）残留磁盘 + 池悬挂引用。对照 §3.6 承诺"显式一键删除（比 dsh-codex 更保守）"与任务书疑区 (b)"遗漏引用=悬挂账号"——正是该模式。主路径（PresetAccountCard 删除）本身正确且有 #10 判别断言，缺陷为旁路未收敛 | 单文件修复：**deleteOauthAccount 入口对 preset 非空账号分流至 W-5 联动**（或通用区 oauthIds 过滤 `entry.preset !== 'chatgpt-codex'`——但需评估实验关闭时 preset 账号的可删入口）；随 Step 7 / 真机首联前批次闭合，并补通用区不含 preset 卡的渲染断言 |
| R7-F2 | **P1**（成功文案语义错误——quality_budget accessibility 面范围） | lib/client.js:2398 | deletePresetAccount 成功提示复用 `t('oauthTokenBack')`＝**"access token 已自动保存。"** / "Access token saved automatically."——删除 ChatGPT 预设账号后显示"token 已自动保存"，语义完全错误（疑为从通用 token 流程复制的键）。quality_budget accessibility 阈值"文案中文可读、人话可理解"——该文案不可理解且误导（用户会疑虑发生了保存操作）。功能链本身正确（#10 断言钉住） | 新增 `presetDeleted` 文案键（zh/en 双语，如"账号已删除"），一处替换；与 R7-F1 同批闭合 |
| R7-F3 | P2（资源管理/性能） | lib/service.js:2702-2704 + :3438-3448 | 每次经代理的 codex 调用执行 `new undici.ProxyAgent(proxyUrl)`——每请求新建连接池：代理连接无法复用（TLS 握手重复）、实例不显式关闭依赖 GC；高频调用下 socket/FD 压力。动态 import('undici') 本身有模块缓存（非重复加载），问题仅在实例层 | 按 proxyUrl 缓存 dispatcher 实例（实例字段 Map，同 oauthCredentialStores 模式）；配置热变更时可随下次调用自然失效（键=proxyUrl） |
| R7-F4 | P2（W-5 失败路径吞错） | lib/client.js:2388 | deletePresetAccount 中 `await remote().oauthLogout({...}).catch(() => undefined)`——响应完全忽略（oauthLogout 返回 ok:false 而非 throw 时 .catch 也不触发）：store.delete 失败（fs 级错误）→ 凭据文件残留 + 账号条目仍被 unset + 用户看到成功提示 → **失去经 UI 重试的入口**（账号已不在列表）。发生面窄（fs 失败），但与 R7-F1 同属"凭据残留"合规风险面 | 检查 `response.ok`：失败时中止后续 ops（账号保留可重试）并展示 response.value.message（错误文案已含"登出失败（删除凭据文件）：…"）；与 R7-F1/F2 同批 |
| R7-F5 | P2（测试环境敏感） | lib/service.js:534（env 默认 `process.env`）+ tests/smoke.mjs:874-876（direct 断言区）+ tests/metrics.mjs:695-697（C-9-1 调用采样） | resolveOauthProxy 无配置时回退进程 env——测试未隔离：在设有 HTTPS_PROXY/https_proxy/ALL_PROXY/all_proxy 的机器上，① smoke 'codex call stays direct' 必败（env 代理 + stub loader 仍注入 → dispatcher ≠ undefined）；② metrics C-9-1 'codex 调用通路采样成功' 必败（loader 为 null → 真实 import('undici') → 零依赖环境未安装 → fail-loud 抛错）；③ Step 6 块 B/C/E 段 chat 调用同因失败。 ironic 点：目标用户恰是代理环境用户（EV-028 代理 7890）——开发者带代理 env 跑测试即红 | 测试块内临时删除/暂存四个代理 env 变量（finally 恢复），或给 service 增加 env 注入 seam（与 oauthUndiciLoader 同款仅测试注入）；smoke 与 metrics 两处都需要 |
| R7-F6 | P3（判别力声明精度） | tests/client-render.mjs:872/:883 + 块注释 :845-849 | #2 'preset entry hidden while off' 与 #3 'ToS declined leaves switch untouched' 为负向断言——旧客户端代码下无元素/无 op → 断言**通过**（vacuous w.r.t. 旧代码；判别力仅对回归成立）。注释声明"断言 ②③④⑤⑥ …必败"对 ②（=#3）过度——实际必败集为 #1/#4-#10（8 条）。任务书"≥4 条推演"要求仍满足 | 注释修正为如实表述（负向断言=回归看护，联合判别力由 #4 补偿）；可选：#3 增加"新代码下确认弹窗曾被调用"的夹具计数以获得正向判别 |
| R7-F7 | P3（测试缺口 + UX 边角） | tests/client-render.mjs:184（open 桩 `{closed:true}`）+ lib/client.js:2348-2353 | 登录完成路径（presetLoggedIn 翻转→presetLoginDone→popup.close→load() 刷新）无渲染测试——桩 popup closed=true 使轮询首轮即退出。真实 UX 边角：用户中途手关弹窗 → poll 的 popup.closed 分支仅清 busy，notice 停留在"已打开授权页：…"（stale 误导） | 桩改为可控 closed 翻转 + catalog 首轮/次轮 presetLoggedIn 翻转夹具，补完成路径断言；closed 分支顺带更新 notice（如"授权窗口已关闭，可重新发起登录"） |
| R7-F8 | P3（防御不一致） | lib/client.js:2377 | logoutPresetAccount 直接 `await remote().oauthLogout(...)` 无 oauthBegin 式的 `typeof === 'function'` 预检（runPresetLogin :2328 有）——插件升级后页面未刷新（stale bundle）时该方法缺失 → await 抛 TypeError → busy 卡 true（按钮永禁用直至刷新）。deletePresetAccount 的同调用有 .catch（仅吞错，busy 会清） | 与 runPresetLogin 对齐加预检 + oauthNeedRestart 提示；或外层 try/finally 保 busy 复位 |
| R7-F9 | P3（治理账面滞后） | .governance/execution-packets.json:93（allowed_change_scope 枚举） | 枚举未列 lib/rpc.js 与 tests/client-render.mjs（本步 OAuth logout RPC descriptor 注册与 UI 测试的内在必需文件）；先例：Step 3 tests/oauth-loopback.mjs 同样未列（R3 已批）。**非范围违规**：diff 存档逐行核对无范围外 hunk、无 M1-M5 模块触碰、无 fixture sync/version bump；三 commit 分主题纯粹（C4：6a 服务面/6b UI/6c 观测） | Coordinator 刷新包声明补列三文件（rpc.js/client-render.mjs/oauth-loopback.mjs），消除后续审查的对账摩擦 |
| R7-F10 | P3（P5 泛化注意项 + R6 台账对账） | lib/client.js:2294/:2314-2316 | ① 客户端硬编码 'chatgpt-codex'（过滤 + 创建常量复制——服务端 preset 分支忽略账号字段故无正确性风险，纯维护面）；② R6 P3 台账（F1-F6）Step 6 未触及——台账为"随触及处理"非本轮义务，F2/F5 已由 EV-048 裁决待真机首联；建议 R6-F1（kill-switch 冷凭据断言）随 Step 7 测试面闭合 | 未来增 preset 时以 schemas 常量镜像或 catalog 携带可用 preset 列表消重；R6-F1 记入 Step 7 候选 |
| R7-F11 | P3（观察项合集） | service.js:3044 / :3443-3447 / :2474 / client.js:2346 | ① catalog 每调用对每 preset 账号一次文件读，登录轮询期 1.2s 全量放大（量级可接受）；② ProxyAgent 构造失败（如代理 URL 畸形）统一归因"无法加载 undici 代理支持"——原因经 errorMessage 透出但归因措辞偏移；③ runOauthDispatch 对未知协议的拒绝文案显示归一后的 'openai-completions'（掩蔽真实协议名，仅文案层面）；④ `init.dispatcher`×Node 原生 fetch 兼容性（undici 扩展项）在桩外无验证——**已属 EV-048 真机首联验证面**（代理 7890 实测），随首联闭环 | 随真机首联任务书逐项核验；无需本轮动作 |

## 4. AI 代码专项 5 项结论

| # | 检查项 | 结论 | 事实依据 |
|---|---|---|---|
| 1 | mock 残留 | **通过** | 产品代码（rpc/schemas/service/client）新增面零 fake/mock/stub；oauthUndiciLoader 为构造器显式声明的文档化测试注入 seam（"仅测试注入用"注释 + 缺省动态 import）；测试夹具（sse6/fakeJwt6/stub ProxyAgent/remoteMock）显式命名且 finally 恢复 globalThis.fetch——非渗漏 |
| 2 | 硬编码返回值 | **通过** | oauthCapabilities 恒返 ['chat'] 为 §3.5 明文设计常量（v0.3.0 全协议——接口形状先行，扩展点非虚构数据）；代理 env 键序/环形上限 100/轮询 1200ms/3min deadline 均为设计参数且注释锚定出处；无虚构测试数值 |
| 3 | 幻觉 API | **通过** | 新消费 API 逐一实存：normalizeType（service.js:805 既有）/ OAUTH_PRESET_VALUES（schemas 导出，:3044 消费）/ credentialStoreFor+store.delete+read（Step 2/4b 已审 API）/ accountIdFromJwt（模块级，R5 裁决 3 先例）/ undici.ProxyAgent（真实 undici API，动态 import + fail-loud 守卫）/ window.confirm/open/setTimeout（浏览器 API）/ api.credentials.unset（既有用法 :2227）；客户端 oauthLogout 三侧注册一致（client descriptor :652 段 / rpc.js:120-126 / schemas codec）——MIG-001 R12 F-T5 同款交叉法 |
| 4 | 未实现 TODO | **通过** | grep 零 TODO/FIXME/XXX/HACK/debugger 新增；"v0.3.2 出报告"/"后续版本按协议扩展"/"设备码登录将在后续版本提供"均为 plan-tracker 分期边界的显式声明（对用户诚实降级提示），非遗弃标记；oauthEvents 无 RPC 暴露系 C-9 分期设计（v0.3.0 启动/v0.3.2 报告）非半成品 |
| 5 | 过度实现 | **通过** | 新增面逐项在任务书内：ToS 门/oauthLogout/Q2 接口/代理发现/C-9 启动/catalog 镜像/UI/测试。未提前实施：设备码流（grep 零踪迹）、V-EVO-3 image/audio 端点（oauthCapabilities 恒 ['chat'] 即未越界证据）、C-9 报告面（v0.3.2）。oauthCapabilities 忽略参数属设计的扩展点形态（§3.5 单点修改承诺），非过度抽象 |

## 5. 设计一致性核查（roadmap §3.5/§3.6/W-5/S-3 + EV-028 + R6 编排 + execution-packet）

| 基准项 | 要求 | 实现 | 判定 |
|---|---|---|---|
| §3.5 条目 1：oauthCapabilities | 全协议返回 ['chat']，接口形状就位，后续扩展返回值即解开（P5 单点） | service.js:523-527 + 测试五协议含未知判别 | ✓ |
| §3.5 条目 2：runOauthDispatch | oauth/pool 分支收敛单点；image/speech 留桩"该协议暂不支持此类型"；池语义按候选账号集 | :2471-2480 收敛 + per-protocol 文案 + 'account-pool' 展示 + runPooledOauthChat 既有循环复用 | ✓ |
| §3.5 条目 4：池 schema 零改动 | accountPoolSchema 不动 | diff 无 pools schema 变更 | ✓ |
| §3.6 默认关闭 | 入口默认隐藏 + oauthExperimental default false | 开关默认未勾选（渲染断言 #1）+ presetAdd/presetLogin 隐藏（#2）+ schema default false（:223） | ✓ |
| §3.6 显式开启确认 | 一次性 ToS 风险声明（UAYOR 措辞），拒绝不开 | client.js:2301 拒绝即 return 零写入（#3）+ 接受双 op 同批（#4）+ UAYOR 措辞未淡化 | ✓ |
| §3.6 kill-switch 三层 | ①enabled ②account.enabled ③oauthExperimental（入口隐藏+调用报错） | ③ begin 层（:3182）+ 调用层（Step 5 交付 resolvePresetCredential）+ UI 入口隐藏；①② 未扰动 | ✓ |
| §3.6 凭据删除路径 / W-5 | 登出删凭据（store.delete）+ 删账号=凭据+条目+池引用联动提示（比 dsh-codex 更保守） | oauthLogout 恒可用（不随开关失效）✓；PresetAccountCard 删除三步单批 ✓；**旁路未收敛**（R7-F1）+ 失败吞错（R7-F4）+ 文案错误（R7-F2） | 部分（附 P1×2/P2×1） |
| S-3 锁超时 | 已由 Step 2/4a/5 交付（5s/30s/25s<陈旧窗） | 本步无新锁面；presetLoggedInOf 为无锁读（write 原子替换保证一致性） | ✓（未扰动） |
| EV-028 代理事实 | chatgpt.com 需代理可达 / auth.openai.com 直连 | 仅 chatgpt.com 目标挂 dispatcher；auth 端点零 dispatcher 通道 | ✓ |
| R6 编排：代理发现必含 | Step 6 任务书必含 | resolveOauthProxy+接线+fail-loud+四组测试全交付 | ✓（§1） |
| packet quality_budget accessibility | 预设入口/ToS 弹窗/错误文案可读人话 | 入口/ToS/错误文案达标；**成功文案一处语义错误**（R7-F2） | 部分（附 P1） |
| packet maintainability | service.js 无关膨胀 | Step 6 service 新增均为 EVO-002 声明面（门/登出/能力/代理/埋点/镜像），无越界 hunk | ✓ |
| packet scope_guard | 仅枚举文件内 EVO-002 声明改动 | rpc.js/client-render.mjs 超枚举但为任务内在必需（R7-F9，Step 3 先例）；无范围外改动 | ✓（附 P3 账面） |
| P3 通用账号零改变 | 通用路径行为不变 | runOauthDispatch 重构对三协议 chat 行为等价（仅拒绝文案升级，否定断言钉旧文案退役）；oauthBegin/exchange/resolveOauthToken 通用臂未动；oauthLogout 拒绝非 preset 账号 | ✓ |

**原则违反标注**：无 P0/P1 级原则违反；R7-F1 在效果上触碰 P7 精神（凭据残留风险——非数据损坏、为主路径旁路，以 P1 立案而非原则违规）；R7-F2 触及 P6 交付质量（文案）；其余结论均指向文件:行号（P1 事实），不可验证处已标注（测试数值/TDD/git 清单归属）。

## 6. 疑区 (a)-(h) 专项裁决表（任务书指定）

| 疑区 | 裁决 | 关键证据 |
|---|---|---|
| (a) ToS 三级门完备性 | **通过** | 门序 experimental→tos→loopback 逐行核实（:3182/:3188/:3198）；双 op 单批 mutate；服务端复核独立于客户端；UAYOR 未淡化；测试三重判别（条款文案/无 1455/接受后放行） |
| (b) oauthLogout/W-5 | **通过（附 3 发现）** | 服务面幂等/合规恒可用/非 preset 拒绝全过；主路径三步联动原子；旁路（F1）+吞错（F4）+文案（F2）立案 |
| (c) Q2 接口形状 | **通过** | ['chat'] 全协议含未知=§3.5 逐字；per-protocol 文案替代全局；三协议零扰动（行为等价+否定断言） |
| (d) 代理发现 | **通过（附 2 发现）** | 三态序/env 容错/仅 chatgpt.com/auth 永不/fail-loud 含来源指引/直连零变化全过；F3（实例不复用）+F5（测试 env 隔离）立案 |
| (e) C-9 埋点 | **通过** | 弃最旧语义正确；P7 零 token（逐调用点+双测试否定断言）；begin_fail×5 覆盖全部分支+login_fail×4；exchange 网络失败无事件记 P3 观察 |
| (f) 账号卡判别断言 | **通过** | ×10 精确清点；8/10 旧代码必败（≥4 要求满足）；#2/#3 负向断言性质如实标注（F6）；轮询时序在测试中经立即回调 setTimeout 建模无 flaky（完成路径无覆盖记 F7） |
| (g) schemas 增量 | **通过** | 两默认值 fail-safe 方向正确；catalog 镜像双向兼容（schemas check 未知透传+optional / client wireCheck 同构语义）已代码级实证 |
| (h) 范围纪律 | **通过（附账面 P3）** | 三 commit 文件与任务书一致（以 diff 存档为准）；无范围外 hunk/M1-M5 触碰/fixture sync/version bump；rpc.js+client-render.mjs 枚举滞后记 F9（Step 3 先例，非违规） |

## 7. 硬门槛自检

| 门槛 | 结果 |
|---|---|
| P0 阻塞数 = 0 | ✓（0） |
| 5 维度全覆盖 | ✓（§2.1-§2.5 逐一有结论） |
| 每条发现标注级别 | ✓（11/11 有 P1-P3 标签 + 位置 + 事实 + 建议） |
| 设计一致性检查完成 | ✓（§5 十六项逐行表 + §6 疑区 (a)-(h) 全裁） |
| AI 专项 5 项完成 | ✓（§4 逐一有结论） |
| 事实红线 | ✓（每条结论指向文件:行号；测试数值/TDD 红灯/git 清单标注 Coordinator 事实或未验证；pwsh 误用一次如实披露 §0） |

## 8. 终态结论

# APPROVED_WITH_NOTES

- **unresolved_blockers=0**
- 发现计数：**P0=0 / P1=2 / P2=3 / P3=6**
- 关闭条件判定（SKILL）：P0=0 且 P1>0 → **有条件通过**——P1×2（R7-F1 W-5 旁路 / R7-F2 成功文案）+ P2 R7-F4（同函数失败吞错）建议**同一 client.js 批次闭合**（均为单文件小改：deleteOauthAccount preset 分流或通用区过滤 + presetDeleted 文案键 + response.ok 检查），绑定 Step 7 或真机首联前批次；R7-F3/F5（dispatcher 缓存 + 测试 env 隔离）随触及处理，F5 建议与真机首联（代理环境实测）同批——代理 env 机器上跑测试即触发的特性使其与首联天然同场。
- R6 编排义务兑现：代理发现已交付（§1）；R6 P3 台账 F2/F5 维持"待真机首联"裁决，F1 建议 Step 7。
- 通过的理由概述：服务面（ToS 门/oauthLogout/Q2/代理/埋点/镜像）逻辑、安全、合规语义逐行核验无误且判别测试充分；38 新断言算术闭合、8/10 渲染断言旧代码必败；全部 P1/P2 集中于客户端集成完整性（旁路/文案/吞错），不影响服务端正确性与合规边界本体，且修复面小、路径明确。
- Coordinator 转发建议：① R7-F1/F2/F4 打包为 EVO-002 收尾修复批次（Step 7 任务书或独立小 commit + 快速复审）；② R7-F9 包声明刷新；③ 真机首联任务书纳入：dispatcher×原生 fetch 兼容、R6-F2/F5 真实形态、R7-F5 测试 env 隔离、R7-F11④；④ EV-049 证据入账时引用本报告 §1 对账。
- 审查局限声明：未执行任何测试/命令（733/80/metrics/parity/loopback 与 TDD 红灯均为 Coordinator 事实，如实标注）；三 commit git 层文件清单依 diff 存档 + 任务书（未独立核验）；工作树 stats 域漂移（EVO-003 Phase 2）未纳入比对、不影响 Step 6 结论；一次 pwsh 只读计数违规已披露（§0）。

---
*审查者：Code Reviewer Agent（EVO-002 Step 6 · R7）· 2026-08-23 · 依据 agents/code-reviewer.md + skills/code-review/SKILL.md + evolution-roadmap-v1.md（§3.5/§3.6/W-5/S-3）+ .governance/diff-EVO-002-Step6-3commits.patch（权威面）+ review-EVO-002-R1~R6 前轮链 + execution-packets.json EVO-002 包（quality_budget/scope_guard/done_definition）+ EV-048/EV-043 事实*

