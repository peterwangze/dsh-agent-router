# Review Record (machine-written by review-record)

- task: EVO-002
- round: R8
- date: 2026-08-22
- reviewer: Code Reviewer
- report: .governance/review-EVO-002-R8.md
- wiring: pending

**审查结论**: **APPROVED_WITH_NOTES**

unresolved_blockers=0

---

# EVO-002-R8 完整审查报告（原文恢复）

> 出处：review-record CLI --report 覆盖预防——备份恢复（2026-08-23）。

# Code Review 报告 — EVO-002 Step 7 收尾批次（R7 修复闭环 + R6-F1 冷凭据断言 + DEC-022-D 申报裁决）

| 项 | 值 |
|---|---|
| Task | EVO-002（v0.3.0 C-1 ChatGPT 订阅 OAuth 实施）· Step 7 收尾批次（R7-F1/F2/F3/F4/F5 修复 + R6-F1 调用期 kill-switch 冷凭据断言 + DEC-022-D 申报核验） |
| Round | **R8**（新切片首审——Step 7 批次为 R7 findings 的返工载体，本审兼做 R7 P1×2/P2×3 的闭合验证。前轮链：R1=Step 1 / R2=Step 2 / R3=Step 3 / R4=Step 4a / R5=Step 4b / R6=Step 5（Approve）/ R7=Step 6（APPROVED_WITH_NOTES，P0=0/P1=2/P2=3/P3=6，审批条件绑定 Step 7）——全部终态闭环） |
| 审查对象 | 两 commit：**`cbfafcf`**（客户端域：lib/client.js +32/-6——W-5 双保险（deleteOauthAccount preset 分流 + 通用区 oauthIds 过滤）/ presetDeleted 文案键 / logout 失败中止 + presetLogoutFailed 兜底键；tests/client-render.mjs +36/+1——logoutFailMode 夹具 + step7 三断言）/ **`3e95034`**（服务+测试面：lib/service.js +13——oauthProxyDispatchers Map 按 proxyUrl 缓存；tests/metrics.mjs +9——C-9-1 env 隔离；tests/smoke.mjs +29——Step6 env 隔离 + R6-F1 冷凭据双断言 + R7-F3 缓存断言）——共 5 文件 +110/-9 |
| **权威范围声明** | **本审查以 `.governance/diff-EVO-002-Step7-2commits.patch`（20KB，两 commit 全文）为权威审查面，已逐行通读**。工作树现状经 read/grep 交叉核验（lib/client.js :440/:730/:2198/:2232-2243/:2397-2421；lib/service.js :632/:3360-3375；tests/client-render.mjs :148/:225/:944-964；tests/smoke.mjs :18/:841-894；tests/metrics.mjs :669-708），现状与存档一致。FIX-003C（stats/routing-paths 域）未触碰（routing-paths 102/102 参照零触碰——Coordinator 事实）。 |
| 审查者声明 | Code Reviewer Agent（独立于 Developer）；只读审查，未修改产品代码；未调用 pwsh/Bash（R7 一次只读违规教训——本轮全程 read/grep/glob，零违规）。测试数值（smoke 856/0 = 849+7、metrics ALL、credentials 80、parity 14、stats 99、routing-paths 102/102、TDD 红灯 5 条）全部为 **Coordinator 提供事实**——本轮无执行权限未复跑，归属如实标注。已全文加载 agents/code-reviewer.md 与 skills/code-review/SKILL.md。 |

---

## 0. R7 交办对账（本审核心验收——先行）

| R7 交办 | 本轮判定 | 证据 |
|---|---|---|
| **R7-F1（P1，W-5 旁路）——删除入口对 preset 分流或通用区过滤** | **已修复**（双保险，超交办） | ① 过滤：client.js:2198 通用区 oauthIds 排除 preset 账号（消双卡/误导）；② 分流：:2239 deleteOauthAccount 对 preset 账号分流 deletePresetAccount（任何入口删除=W-5 三步联动）；③ 前端渲染恒过滤（:2812 消费 oauthIds）——分流分支为纵深兜底；④ 判别断言 client-render:945（旧代码 summary 计数 1 → 必败）。R7 目标（旁路收敛/双卡消除）达成；遗留判据不对称 → 本轮 R8-F1（P2，新发现，非 F1 修复缺陷——见下） |
| **R7-F2（P1，成功文案语义错误）** | **已修复** | client.js:440/730 presetDeleted 双语文案键 + :2420 替换 oauthTokenBack；判别断言 :962（旧代码 oauthTokenBack → 必败） |
| **R7-F4（P2，oauthLogout 失败吞错）** | **已修复** | :2405-2410 失败中止（账号保留可重试 + 失败文案透传 + presetLogoutFailed 兜底键）；判别断言 :954-955（旧代码继续 unset + 成功提示 → 必败） |
| **R7-F3（P2，ProxyAgent 每调用新建）** | **已修复（附新残留）** | :632 Map + :3364-3371 按 proxyUrl 缓存（连接池复用）；smoke :958-963 断言 count===1 + dispatcher identity 同一（旧代码 count=2 → 必败）。修复动机达成；**新发现**：缓存生命周期无界 + 注释"随 GC 回收"机制错误 → 本轮 R8-F2（P2） |
| **R7-F5（P2，测试未隔离代理 env）** | **已修复** | smoke:845-847（save→delete）+ :943-952（finally 恢复）；metrics:669-671 + :703-706（同型对称）；四变量键一致（HTTPS_PROXY/https_proxy/ALL_PROXY/all_proxy） |
| **R6-F1（Step 3 遗留，kill-switch 冷凭据断言）** | **已交付** | smoke:888-893 双断言（调用期拒绝含"实验通路已关闭" + 凭据文件字节不变 Buffer.equals 比对）；判别性+注释精度 → 本轮 R8-F4（P3） |
| R7-F6（P3 注释精度） | 未触及（P3 台账延续） | 非义务项；本审不重复立案 |
| R7-F7（P3 登录完成路径测试缺口）/ R7-F8（P3 logoutPresetAccount 预检） | 未触及（台账延续） | R7-F8 注意：本轮 F4 修复仅覆盖 deletePresetAccount（.catch 兜底），logoutPresetAccount（:2393）仍无 typeof 预检——维持 R7-F8 台账 |
| R7-F9（P3 包枚举）/ R7-F10（P3 客户端硬编码）/ R7-F11（P3 观察合集） | 未触及（台账；本轮放大面见 R8-F1/F7） | |

**P1 存量 = 0（R7 两条 P1 全部关闭）**——本审 P0=0 且 P1=0。

---

## 1. 五维度逐项结论

### 1.1 正确性 — 通过（0 阻塞；P2×1 + P3×2）

- **W-5 双保险（疑区 a 主路径）**：过滤（:2198，非空字符串 preset 排除）与分流（:2239，同判据）语义一致；分流后 deletePresetAccount 内部确认弹窗恒 presetDeleteConfirm（单一确认，无双重弹窗——分流分支在 confirm 之前 return，:2239 先于 :2240）✓；三步原子性：oauthLogout 成功 = 前置门（失败即中止，无"凭据残留+条目删除"失联态）；池清理 + unset 同一 mutate 批量（:2412-2417）；失败重试安全（store.delete 幂等——R2 已审 API）✓；**P7 误删防线**：服务端 oauthLogout 按 `OAUTH_PRESET_VALUES.includes(trimmed preset)` 严格成员校验（service.js:3330-3332）——客户端宽判据分流到非成员账号会被服务端**拒绝**（凭据不删）→ 双保险实际构成**三层防线**（过滤渲染 → 分流兜底 → 服务端成员校验），不误删非 preset 凭据 ✓；删除幂等（oauthLogout 幂等 + smoke:899-900 二次登出断言延续）✓。
- **R7-F4 失败中止五态推演**：① 服务面失败 `{ok:true, value:{ok:false,...}}` → `value.ok !== true` 中止 ✓；② 网络/RPC 异常 throw → `.catch` 兜底对象（value.ok:false + 兜底文案）中止 ✓；③ RPC 外层 `{ok:false,...}`（value 缺失）→ `!logoutResponse?.value` 中止 + 兜底文案 ✓；④ value.message 透传失败详情（service:3338 "登出失败（删除凭据文件）：<detail>"）✓；⑤ 成功 `value.ok===true` → 继续 ✓。中止后 busy 复位（:2407）+ 账号保留（无 unset op）+ notice 失败文案（:2408）——重试入口完整（账号卡按钮仍在）✓。
- **R7-F3 缓存**：键 = proxyUrl（:3364）；配置热变更 → 新键 → 新实例，旧键不再被查询（自然失效语义成立）；fail-loud 边界自洽——同 URL 已成功实例化即证明 undici 可用（模块缓存不可卸载），缓存命中不报错为正确行为，smoke 改用未缓存键 7891 验证 fail-loud 仍触发（:970-973）✓；**残留**：cached 检查在 try 内（:3365 后无异常面）；`this.oauthProxyDispatchers?.get` 可选链防御（构造器外注入场景）✓；并发获键窗口（同 URL 同时两请求双实例，后者覆盖前者）→ R8-F3（P3）。
- **R6-F1 断言链**：`coldBytes6.equals(readFileSync(credFile6))` 为**读前后 Buffer 逐字节比对**（smoke:888/:893，真比对非字符串化）✓——判别"无写改写"；"不读取文件"由①拒绝发生断言（:892）+ ②resolvePresetCredential 早退位置（service.js:2423-2425 kill-switch 检查**先于** store.read():2427 与 ensureFresh 网络:2430）联合保证——早退在一切资源触碰前，拒绝即未触凭据 ✓（注释精度见 R8-F4 P3）。
- **DEC-022-D 申报核验**（§5 专节裁决——申报正确）。

### 1.2 安全性 — 通过

- **P7 红线（W-5 联动不得误删非 preset 凭据）**：逐层验证——客户端分流至 deletePresetAccount → 服务端 oauthLogout 成员校验（:3331）拒非成员；preset 账号凭据删除路径单一（credentialStoreFor 按账号 resolveCredentialPath 定界——R2 已审）；通用账号删除路径无变化（无凭据文件，仅 tokenRef unset——既有语义）✓。
- **P7 红线（删除幂等）**：oauthLogout 幂等（store.delete 文件不存在也成功——:3321 JSDoc + smoke:899-900 断言）；重试路径无残留（失败中止后无破坏性 op 半执行）✓。
- **失败中止的凭据残留消除**：R7-F4 修复前"凭据残留 + 条目已删 + 成功提示"失联态——本轮关闭（中止保留条目）✓——这是 P7 暴露面（凭据残留被用户认知为已删除）的修复。
- **实验关闭时无凭据使用面**：resolvePresetCredential:2423 早退（kill-switch 层）→ 关闭状态凭据沉睡零使用；服务端 oauthLogout 不随开关失效（合规删除恒可用——R7 已裁）✓。
- 无新增注入面/SQL/命令执行；无凭据值入错误文案（errorMessage(error) 脱敏——既有面）；滑动窗口：本轮新增文案键（presetDeleted/presetLogoutFailed/模拟磁盘错误——**测试夹具文案**）均无敏感值 ✓。
- OWASP 关键项对本变更（UI 分流/缓存/env 隔离/断言）无新增暴露。

### 1.3 可维护性 — 通过（P2×1 + P3×1）

- 函数长度达标：deleteOauthAccount 12 行 / deletePresetAccount 20 行 / loadOauthProxyDispatcher 16 行 ✓。
- 注释质量高：交叉引用 R7-F1/F4/F3/R6-F1/§3.6/W-5/P7 出处，审查可溯源；**一处注释机制错误**（service.js:3363 "随 GC 回收"——Map 强引用下实例不灭）→ R8-F2。
- 命名与既有族平行（oauthProxyDispatchers ↔ oauthCredentialStores 先例模式 ✓）。
- **硬编码 'chatgpt-codex' 三处**（client.js:2308 严格成员 / :2198 宽排除 / :2239 宽分流）——R7-F10 的泛化注意项本轮**放大**（判据由 1 处变 3 处且两宽一严）——建议随 R8-F1 修复统一（单一常量或 catalog 镜像列表）。

### 1.4 性能 — 通过（P2×1 + P3×1）

- **R7-F3 修复动机达成**：连接池复用（同 URL 单实例）+ 动态 import 模块缓存（非重复加载）✓——每调用新建的 churn 消除。
- **残留**（R8-F2）：oauthProxyDispatchers Map 无淘汰——配置热变更 N 次 → N 个 ProxyAgent 实例常驻（Map 强引用，不随 GC 回收——注释错误）；量级 = 配置过的 URL 数（单用户低频，实际风险低）；修复方向与动机一致（简单淘汰/显式 close 或注释修正）。
- 并发窗口（R8-F3）：首次并发双实例——单次偶发，非持续压力。
- 无 N+1/O(n²)；过滤为单次数组 filter O(n) ✓。

### 1.5 测试覆盖 — 通过

- **计数**：smoke 856/0 = 849+7（Coordinator 事实：+7 = R6-F1×2 + R7-F3×2 + 其他断言调整）；metrics/credentials/parity/stats/routing-paths 全绿；TDD 红灯先行 5 条（F1 渲染 / F4×2 / F2 / F3 缓存——旧代码实测必败）→ 全绿（Coordinator 事实，过程不可独立复核）。
- **判别力推演（本轮逐条）**：① step7-F1（summary 计数 0）——旧代码 summary=1 → 必败 ✓；② step7-F4×2（unset 缺席 + 失败文案）——旧代码继续 unset + 成功提示 → 必败 ✓；③ step7-F2（presetDeleted 存在 + oauthTokenBack 缺席）——旧代码 oauthTokenBack（且无 presetDeleted）→ 必败 ✓；④ R7-F3（count===1 + identity 同一）——旧代码次次新建 → count=2 + identity 不同 → 必败 ✓；⑤ R6-F1（拒绝 + 字节不变）——旧代码不抛 → 必败 ✓。**≥4 条推演要求满足（5 组全判别）**。
- **断言质量亮点**：F4 失败文案断言用**夹具自身 message**（'登出失败（删除凭据文件）：模拟磁盘错误'）验证"客户端透传服务面消息"行为——不耦合产品文案（改文案不破坏测试）✓。
- **缺口/观察**：① F1 断言仅计数无"通用账号保留正例"（夹具仅单一 preset 账号——通用账号 filter 不受扰动无显示断言；filter 逻辑简单（`!preset`）——P3 观察）；② R6-F1 注释"字节不变 = 无读改写"过度归因（字节不变仅证无改）→ R8-F4（P3 精度）；③ R7-F6 负向断言注释精度/ R7-F7 登录完成路径缺口——台账延续。

---

## 2. 发现列表（P0-P3 + 位置 + 事实 + 建议）

**P0 = 0，P1 = 0，P2 = 2，P3 = 6**。

| # | 级别 | 位置 | 事实 | 建议 |
|---|---|---|---|---|
| R8-F1 | **P2**（边界条件——preset 判据不对称，未知值账号 UI 黑箱/删除死锁） | lib/client.js:2198（过滤——宽判据 `typeof entry.preset !== 'string' \|\| !entry.preset.trim()`）+ :2239（分流——同宽判据）+ :2308（预设卡渲染——严格 `entry.preset === 'chatgpt-codex'`）对照 lib/schemas.js:177（`preset: z.string().default('')`——自由字符串无白名单，注释"未知值兼容放行、消费点校验"）+ lib/service.js:3330-3332（消费点=严格 `OAUTH_PRESET_VALUES.includes`） | preset 为**非空非成员**值（'xxx'）时：预设卡不渲染（:2308 严格）、通用卡不渲染（:2198 宽排除）、删除分流后服务端拒绝（:3331 → 中止）→ **无 UI 操作入口 + 不可删——账号数据死锁**。可达性：正常创建路径恒 'chatgpt-codex'（addPresetAccount :2328 恒定）——仅手工编辑设置/未来新 preset 值遇上旧客户端时触发。**P7 不误删**：服务端成员校验是最终防线（:3331），本发现**无**凭据误删风险——属可用性/防御缺口 | 判据统一：oauthIds 过滤与 deleteOauthAccount 分流改用与 :2308 相同的成员判据（抽单常量或由 catalog 镜像携带 preset 列表——R7-F10 建议一并收敛）；未知值账号回落到通用卡（可删——非成员无独立凭据文件，通用删除安全） |
| R8-F2 | **P2**（资源管理——缓存实例无界 + 注释机制错误） | lib/service.js:632（Map）+ :3364-3371（按 proxyUrl 缓存）+ :3363（注释"旧键实例随 GC 回收"） | Map 强引用——旧键 dispatcher 实例**不随 GC 回收**（实例被 Map 持有至 service 销毁）；注释"随 GC 回收"为**机制错误**（事实红线：注释与行为不符）；"自然失效"仅指"不再被使用"（正确面）。每次配置热变更（新 proxyUrl）→ 新键 → 实例数 = 配置历史数（无界增长——虽单用户低频，与修复动机同源的 FD/socket 压力在多次变更下复现） | 三选一：a) 注释修正为"旧键不再被使用但 Map 持续持有；量级=配置过的 URL 数"；b) 简单淘汰（仅保留最近 1 个 ProxyAgent——代理配置实际单一；替换时显式 close）；c) 两者兼做。可选 smoke 断言：同实例两 proxyUrl 切换后 count=2（有界验证） |
| R8-F3 | P3（并发——首次并发获键双实例窗口） | lib/service.js:3364-3371 | 无 in-flight 去重：同 URL 两并发请求同时 miss → 各自创建（await load 期间未 set）→ 后者覆盖；前者成孤儿（无引用无 close——GC 回收）。单次偶发（首次并发），非持续压力 | 可选：in-flight Promise 缓存（同一 pending Promise 共享 await → 单实例）——不阻塞 |
| R8-F4 | P3（注释精度——断言能力归因） | tests/smoke.mjs:885-886（"字节不变 = 无读改写"）+ :888-893 | 字节不变仅判别**无写改写**（读取不改字节——字节断言对"读取"无判别力）；"调用期不读凭据文件"实际由①拒绝发生断言（:892）+ ②早退代码序（service.js:2423-2425 先于 store.read:2427）联合判别——**断言链本身有效**（拒绝+字节+早退序三证据），仅注释将"不读"归因于字节断言（过度归因） | 注释修正："字节不变 = 无写改写；不读由拒绝发生 + 早退位置（:2423 先于 :2427）保证"——纯精度 |
| R8-F5 | P3（申报措辞精度——DEC-022-D 申报裁决附注，非缺陷） | .governance/evidence-log.md:38（EV-034："**决策**：DEC-022 用户裁决；D 版本指纹未随本 commit（遗留 FIX-002 域）" + 结构化事实 `version_fingerprint: DEC-022-D deferred to FIX-002`）+ .governance/review-FIX-002-R8.md:117-126（DEC-022 ①-⑥ 逐条裁决）+ review-FIX-002-R7.md:32/:46 | 申报"全仓库仅'版本指纹'四字引用"——精度问题：① EV-034 有**完整状态声明**（非仅四字）；② **DEC-022 本体**（takeoverDefaultModel 用户裁决）在 review-FIX-002-R7/R8 有 ①-⑥ 完整裁决语义（默认 false 零触碰/一次性接管+来源记忆/关回卸载还原/遗留剥离/客户端会话级/零回归）且**已实现**（FIX-002 载体，R8 APPROVED_WITH_NOTES/0）——**非"定义缺失"**；③ 真正缺失=**DEC-022-D（版本指纹）**的语义定义（decision-log 无条目、仓库内无定义、原始定义在 FIX-001 裁决会话 zstd 记录=仓库外不可验证） | 申报核心成立（见 §5 裁决）；Coordinator 处置恢复定义时：DEC-022 本体恢复源=review-FIX-002-R7/R8 ①-⑥ + CHANGELOG:21（用户裁决记录）——**不必依赖 zstd 档案**；DEC-022-D 版本指纹=仅 zstd（仓库外）——保持"用户裁决：恢复定义派发 vs 废弃" |
| R8-F6 | P3（UX 观察——实验关闭时 preset 账号无 UI 删除入口，评估通过） | lib/client.js:2198（过滤恒）+ :2792（实验区仅 oauthExperimentalOn 渲染） | R7-F1 修复后：实验**关闭**时 preset 账号无任何 UI 删除入口（预设卡隐藏 + 通用卡过滤）；删除入口=重开实验开关（ToS 已接受则一键）→ 2 步可达。**评估**：§3.6"默认隐藏"语义一致（关闭=实验功能停用，非账号删除——账号数据无恙、调用被 kill-switch 拒绝（:2423）零使用→无 W-5 暴露面；W-5 关注"认知已删但凭据留"——关闭开关无"已删"认知）→ **通过** | 可选 UX 增强（不要求）：实验开关 hint 提示"已存在 N 个实验预设账号，重开开关可管理/删除" |
| R8-F7 | P3（账面滞后——R7-F9 延续） | .governance/execution-packets.json:92-94（allowed_change_scope 枚举）+ tests/client-render.mjs（本轮 +36） | client-render.mjs 本轮改动仍超枚举（R7-F9 已立案：Step 3 先例，非范围违规——diff 逐行核对无范围外 hunk）；本轮 rpc.js 零触碰（无 hunk）——仅 client-render 单项超枚举 | Coordinator 刷新包声明（R7-F9 交办延续）——非 Developer 义务、不阻塞 |
| R8-F8 | P3（平台边角——env 键名大小写还原） | tests/smoke.mjs:845-847 / tests/metrics.mjs:669-671（Windows 上 process.env 大小写不敏感） | Windows 上仅存小写 'https_proxy' 的机器：删除-恢复循环中 savedProxyEnv6['HTTPS_PROXY'] 先读到原值（键不敏感）→ 恢复以 'HTTPS_PROXY' 键名重建（原始键名大小写变化）；语义影响零（resolveOauthProxy 双形态读取 :534-541 与代理库通常大小写不敏感；同名不同大小写变量在 Windows 为同一槽——跨平台行为一致）——纯观察 | 无需动作（注释说明即可，可选） |

---

## 3. AI 代码专项 5 项结论

| # | 检查项 | 结论 | 事实依据 |
|---|---|---|---|
| 1 | mock 残留 | **通过** | 产品代码（client.js/service.js）零 mock/stub；oauthUndiciLoader 为既有文档化测试注入 seam（"仅测试注入用"）；smoke stub ProxyAgent class（:958-963）与 client-render logoutFailMode（client-render:225/:277）为显式命名测试夹具，finally 恢复 globalThis.fetch（smoke:943-952 + metrics:701-708）——无渗漏 |
| 2 | 硬编码返回值 | **通过** | 产品代码零硬编码返回值；logoutFailMode 分支固定对象=测试夹具；presetDeleted/presetLogoutFailed 为 i18n 文案键（真实文案资源）；OauthLogoutResult 形状为既有契约 |
| 3 | 幻觉 API | **通过** | 新消费 API 逐一实存：`readFileSync`（smoke.mjs:18 import 实证）/ `Buffer.equals`（原生）/ `Map.get/set`（原生）/ `undici.ProxyAgent`（真实 API，既有 fail-loud 守卫）/ `globalThis.process.env`（Node）/ 客户端 `remote().oauthLogout` 三侧一致（service:3326-3342 返回 {ok,message} ↔ rpc.js:129-135 descriptor ↔ client:2405 消费 value.ok——**value.ok 语义确认**：RPC 外层 ok 恒真、value=服务面返回对象 ✓） |
| 4 | 未实现 TODO | **通过** | diff 全文（285 行）通读零 TODO/FIXME/HXXX/XXX/debugger 新增；"v0.3.2 出报告"等为分期边界显式声明（非遗弃） |
| 5 | 过度实现 | **通过** | 每项改动对应既定 finding（F1 双保险/F2 文案/F3 缓存/F4 中止/F5 env/ R6-F1 断言/DEC-022-D 申报——申报为行为边界非实现）；无提前实施（设备码流/报告面零触碰）；filter+分流双保险为 F1 交办内防御深度（非抽象过度） |

---

## 4. 设计一致性核查（roadmap §3.6 / W-5 / quality_budget / P7 + R7 交办）

| 基准项 | 要求 | 实现 | 判定 |
|---|---|---|---|
| §3.6 kill-switch ③ | 关=入口隐藏 + 调用明确报"实验通路已关闭" | 调用期 :2423-2424（先于资源触碰）/ begin 层 :3106 / UI 入口 gate :2792——本轮未扰动，R6-F1 断言补齐网格 | ✓ |
| §3.6 默认隐藏语义 | 关闭时入口隐藏；重开即见 | 过滤恒排除通用区 + 实验区 gate——preset 账号关闭时不可见（数据无恙）；删除入口=重开开关（R8-F6 已评估） | ✓ |
| §3.6 凭据删除路径 / W-5 | 删账号=凭据+条目+池引用联动（比 dsh-codex 更保守） | 三步联动全路径覆盖（预设卡+通用卡分流+登出）；失败中止（无失联态）；服务端成员校验防线 | ✓ |
| W-5（review-ARCH-002 IBC-5） | 非登出路径删条目→凭据残留（P7 暴露面） | **关闭**——所有 UI 删除路径=W-5 联动；无旁路 | ✓ |
| P7 不误删非 preset 凭据 | 删除不得触碰非 preset 凭据 | 服务端 OAUTH_PRESET_VALUES 成员校验（:3331）——客户端宽分流被拒；凭据路径按账号 resolveCredentialPath 定界 | ✓ |
| P7 删除幂等 | 重复删除安全 | store.delete 幂等（R2 API）+ 二次登出断言（smoke:899-900）+ 失败中止重试路径（无半完成破坏） | ✓ |
| quality_budget accessibility | 文案中文可读、人话可理解 | presetDeleted"ChatGPT 账号已删除（凭据文件与池引用已清理）。" / presetLogoutFailed"登出失败（删除凭据文件）：请重试"——人话达标 | ✓ |
| quality_budget security | 无新增暴露面 | 文案/缓存/env 隔离零敏感值；P7 逐条过 | ✓ |
| quality_budget maintainability | service.js 无关膨胀 | +13 行仅 Map 声明+缓存逻辑（EVO-002 声明面）——无越界 | ✓ |
| quality_budget performance | 调用路径无新增同步 IO | 缓存消除重复隧道装卸（无 IO）；断言/过滤 O(n) | ✓ |
| scope_guard | 仅枚举文件 EVO-002 声明改动 | 5 文件与任务书一致；client-render.mjs 超枚举（R7-F9 先例延续，非违规）；无 FIX-003C/stats 域触碰 | ✓（附账面 P3） |
| 通用账号零改变 | 通用路径行为不变 | filter 排除预设（有意变更）；通用账号删除/保存/一键登录路径未动 | ✓ |
| 两 commit 主题纯粹 | 一 commit 一主题 | cbfafcf=客户端域（client+render 测试）/ 3e95034=服务+测试面（service+smoke+metrics）——域划分一致，无混入 | ✓ |

**原则违反标注**：无 P0/P1 级原则违反；P7（安全）逐条过（不误删/幂等/失联态消除）；R8-F1 触及 P2（设计完整性——泛化考虑，边界条件）以 P2 立案非原则违规；R8-F2 触及 P3（可维护性——注释与行为一致）以 P2 立案；其余结论均指向文件:行号（P2 事实）。

---

## 5. DEC-022-D 申报核验与裁决（任务书指定）

**申报原文**（Developer，EV-058）："定义缺失未实现——decision-log 止于 DEC-021，全仓库仅'版本指纹'四字引用"。

**① 申报事实核验（grep + read 实证）**：
- decision-log.md 最后条目 = **DEC-021**（read 实证，:25）——"止于 DEC-021" **成立** ✓
- DEC-022 引用面：CHANGELOG.md:21（"DEC-022 用户裁决"——takeoverDefaultModel）/ tests/routing-paths.mjs:595/:635/:658/:707（"语义权威：review-FIX-002-R7/R8（DEC-022 ①-⑥）"）/ evidence-log EV-034/035/040/044/045 / review-FIX-002-R7:R32/:46 / review-FIX-002-R8:117-126 / review-DEV-002-R1:37/:111 —— **20 处引用，无一处定义"版本指纹"语义** ✓
- **DEC-022 本体 ≠ DEC-022-D**（关键区分）：DEC-022（用户裁决，takeoverDefaultModel）在 **review-FIX-002-R8.md:121-126 有①-⑥完整裁决语义**（① 默认 false 双层零触碰 / ② true 一次性接管+来源记忆+改回尊重 / ③ 关回卸载还原 / ④ 历史遗留首次剥还原 / ⑤ 客户端会话级同受开关约束 / ⑥ 零回归）且 **已实现**（FIX-002 载体 d264f03+5c8f2dc+72b2670+0b3c15d，R7 NEEDS_CHANGE→R8 APPROVED_WITH_NOTES/0，EV-045）——**DEC-022 本体定义存在且已落地，非"缺失"**；DEC-022-D（版本指纹）语义：全仓库无定义（EV-034 仅状态声明"D 版本指纹未随本 commit（遗留 FIX-002 域）"+"version_fingerprint: DEC-022-D deferred"——**状态非定义**）；原始定义在 FIX-001 裁决会话 zstd 记录 = 仓库外（glob .governance/**/*.zstd 零结果，仓库内不可验证）——**DEC-022-D 定义缺失成立** ✓

**② 行为是否符合 P1 原则（不编造语义）**：**是**——未实现（无定义不编造——P1 原则①"分析和推演基于事实"✓）；以申报代为边界（如实声明限制面，处置权留给 Coordinator/用户——符合"实现考虑完整性但不得虚构"的边界纪律）✓。

**③ 裁决**：**申报正确（成立）**——限 DEC-022-D（版本指纹）定义缺失；**措辞精度**：申报"全仓库仅'版本指纹'四字引用"未区分 DEC-022 本体（review-FIX-002-R7/R8 有①-⑥语义 + 已实现——非缺失）与 DEC-022-D（版本指纹——确实缺失）；无编造行为（核心正确）。**处置归 Coordinator/用户**（符合申报的边界声明）：恢复定义派发 vs 废弃——恢复时**建议来源**：DEC-022 本体 = review-FIX-002-R7/R8 ①-⑥ + CHANGELOG:21（仓库内已有权威语义，**不必依赖 zstd 档案**）；DEC-022-D 版本指纹 = 仅 zstd（仓库外），需用户确认是否恢复（FIX-001 事故场景：npx cache 静默刷新宿主依赖 → 版本指纹=插件代码版本校验机制——疑似防护措施定义，建议恢复但属用户裁决）。

---

## 6. 疑区 (a)-(f) 专项裁决表（任务书指定）

| 疑区 | 裁决 | 关键证据 |
|---|---|---|
| (a) W-5 双保险完备性 | **通过（附 P2×1 + P3×1）** | ① preset 分流路径：确认单弹窗（:2239 先于 :2240）、三步联动原子（凭据删除门+mutate 批量）、失败中断不半完成（:2406-2410 中止+可重试）、幂等（store.delete+重试安全）；② 过滤键：preset 判定=非空字符串（宽）——服务端消费点=OAUTH_PRESET_VALUES 成员（严）——**不对称**（R8-F1 P2：未知值黑箱）；③ 双保险缝隙：UI 面零缝隙（预设卡/通用卡/登出三路径全覆盖）；RPC 直调 mutate 删条目（数据面）非 UI 面——P3 观察（与通用账号同设计）；④ P7 不误删：服务端成员校验=最终防线（:3331）——宽分流被拒 ✓；⑤ 幂等：lo6again 断言延续 ✓ |
| (b) R7-F4 失败中止 | **通过** | value.ok 判定语义核实（service 返回 {ok,message} ↔ rpc descriptor ↔ 客户端消费 value.ok——RPC 外层 ok 恒真、value=服务面对象 ✓）；五态（成功/服务面失败/网络异常/RPC shape 异常/兜底）全覆盖；中止后账号保留+按钮仍在（可重试）；失败文案透传（value.message）+presetLogoutFailed 兜底 ✓ |
| (c) R7-F3 缓存正确性 | **通过（附 P2×1 + P3×1）** | 键=proxyUrl ✓；配置热变更→新键自然废弃（查询面失效）✓；**残留实例数量：无界于配置历史**（Map 强引用不随 GC——注释错误）→ R8-F2（P2）；fail-loud 自洽：同 URL 成功实例=undici 可用证明（模块缓存不可卸载）——缓存命中不报错正确，smoke 7891 未缓存键验证 fail-loud 仍触发 ✓；并发获键：双实例窗口（后者覆盖+孤儿）→ R8-F3（P3） |
| (d) R7-F5 env 隔离 | **通过（附 P3 平台边角）** | 四键保存/删除/恢复 finally 对称（smoke:845-847/:943-952 + metrics:669-671/:703-706）；异常路径恢复：try/finally 结构成立（断言抛错仍恢复——try 体全在 finally 保护内）；与 metrics C-9-1 隔离：两进程独立（互不干扰）；Windows 大小写键名还原边角（R8-F8 P3——语义零影响） |
| (e) R6-F1 判别性 | **通过（附 P3 注释精度）** | "字节不变"用**读前后 Buffer.equal 逐字节比对**（smoke:888/:893）——真比对 ✓ 判别"无改写"；"不读"=拒绝断言+早退序（service:2423<:2427）联合判别——判别链完整；调用期拒绝文案含"实验通路已关闭"（:2424 / :3106 一致）；注释归因过度（R8-F4 P3） |
| (f) 范围内一致性 | **通过** | 5 文件清单与任务书一致（diff 存档逐 hunk 核对）；零 FIX-003C/stats 域（routing-paths 102/102 参照）；两 commit 主题纯粹（7a 客户端域/7b 服务+测试域）；无 fixture sync/version bump/M1-M5 触碰 |

---

## 7. 硬门槛自检

| 门槛 | 结果 |
|---|---|
| P0 阻塞数 = 0 | ✓（0） |
| 5 维度全覆盖 = 100% | ✓（§1.1-§1.5 逐一有结论） |
| 每条发现标注级别 = 100% | ✓（8/8 有 P2-P3 标签 + 位置 + 事实 + 建议） |
| 设计一致性检查完成 | ✓（§4 十二项逐行表 + §5 DEC-022-D 专裁 + §6 疑区 (a)-(f) 全裁） |
| AI 专项 5 项完成 | ✓（§3 逐一有结论） |
| 项目质量原则逐条（P7 重点） | ✓（不误删非 preset 凭据=服务端成员校验 :3331 / 删除幂等 / 失联态消除——§4 表） |
| 事实红线 | ✓（每条结论指向文件:行号；测试数值/TDD 红灯/git 清单归属 Coordinator 事实；zstd 档案为仓库外不可验证——如实标注；本审未调用 Bash/pwsh——零违规） |

---

## 8. 终态结论

# APPROVED_WITH_NOTES

- **unresolved_blockers=0**
- 发现计数：**P0=0 / P1=0 / P2=2 / P3=6**
- 关闭条件判定（SKILL）：P0=0 且 P1=0 → **通过（合并条件满足）**；P2×2 建议记录为遗留（不阻塞）：R8-F1（判据统一——建议随下次触及 client.js（EVO-003 UI 批次/R7-F10 泛化）闭合——非发布阻塞）；R8-F2（缓存注释修正/淘汰——随触及处理）；P3×6 台账（R8-F3/F4/F6/F8 纯精度与观察，R8-F5 申报附注，R8-F7= R7-F9 延续）。
- **R7 交办闭环判定**：P1×2（F1 W-5 旁路 / F2 成功文案）**已修复**（本审逐条验证+判别断言）；P2×3（F3/F4/F5）**已修复**（F3 带新发现问题——非原 finding 未修）；R6-F1 **已交付**。**"真机首联前 MUST 闭合"条件满足**。
- **DEC-022-D 申报裁决**：**成立（正确）**——DEC-022-D（版本指纹）定义缺失属实（DEC-022 本体①-⑥已在 review-FIX-002-R7/R8 且有实现——申报需区分两域，措辞精度修正见 R8-F5）；未实现+申报=符合 P1 原则（不编造）；处置（恢复定义派发 vs 废弃）归 Coordinator/用户——恢复来源建议：DEC-022 本体=review-FIX-002-R7/R8（仓库内，免 zstd）；DEC-022-D=仅 zstd（仓库外，用户裁决）。
- R7 P3 台账（F6/F7/F8/F9/F10/F11）维持延续（非义务项）。
- 通过的理由概述：R7 全部 P1/P2 findings 逐条修复并经判别断言验证（旧代码必败推演 5 组）；W-5 三层防线（过滤/分流/服务端成员校验）闭环 P7（不误删+幂等+失联态消除）；缓存/中止/隔离三项修复语义正确且自洽；DEC-022-D 申报裁决成立（无编造）；5 维度全覆盖零阻塞——全部新发现为 P2（低频边界）与 P3（精度/观察），不阻碍 Step 7 终态与真机首联排期。
- Coordinator 转发建议：① 本报告§8 判定可入 EV-058 终态（Step 7 审查闭环）——新增证据 EV-061；② DEC-022-D 处置（用户裁决：恢复定义派发 vs 废弃——建议恢复（FIX-001 事故场景防护机制））＋恢复来源指引（§5③）；③ R8-F1 判据统一建议随 EVO-003 UI 批次（client.js 文件域重叠——M7.6 串行提示）；④ R8-F2 注释修正可随手改（低风险小改）；⑤ 出口①真机首联任务书（既定）纳入 R8-F6 可选 UX 观察项评估。
- 审查局限声明：未执行任何测试/命令（856/0、metrics ALL、credentials 80、parity 14、stats 99、routing-paths 102/102 与 TDD 红灯 5 条均为 Coordinator 事实，如实标注）；两 commit git 层文件清单依 diff 存档 + 现状交叉核验（未独立 git 命令验证——无执行权限，任务书明示）；zstd 档案（DEC-022-D 原始定义）仓库外无法验证——如实标注为"不可验证来源"。

---

*审查者：Code Reviewer Agent（EVO-002 Step 7 收尾批次 · R8）· 2026-08-23 · 依据 agents/code-reviewer.md + skills/code-review/SKILL.md + roadMap §3.6/W-5（review-ARCH-002 IBC-5 权威源）+ .governance/diff-EVO-002-Step7-2commits.patch（权威面）+ review-EVO-002-R7.md（findings 定义源）+ execution-packets.json EVO-002 包（quality_budget/scope_guard）+ schemas.js/rpc.js 现状交叉核验*

