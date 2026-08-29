# EVO-006 R0 代码审查报告 — GPT OAuth 实验通道转正式

- **Round**: R0（首轮——无前轮 findings 可引用）
- **审查对象**: 本地三 commit `bf667b3`（服务端语义面）→ `6ebe9ed`（客户端 UI 面）→ `a4d33cd`（文档口径面）；diff 范围 = `a6acd06..HEAD`（HEAD = a4d33cd）；11 文件，+318/−202
- **依据裁决**: DEC-026（2026-08-29，C2 完整转正——范围唯一权威）；上下文 DEC-019（Q1 三层 kill-switch 原形态）/ DEC-021（1455 惰性启动）/ DEC-025（v0.3.1 载体）；入账 TRIAGE-EVO-006
- **审查方式**: 纯静态（读 diff + 读文件 + grep 交叉核验）；未运行任何命令/测试（协议红线）；运行时结果一律标「待验证」
- **范围事实**: `git status` ahead 5 未 push ✓；`package.json` 不在 diff（无版本 bump）✓；工作区治理文件（execution-packets.json 修改 + 3 个未跟踪 .governance 文件）不属本审查对象

---

## 一、5 维度逐项结论

### 1. 正确性 — PASS（附 P2-a/P2-b/P3-e 备注）
- **门控移除完整性**：`oauthExperimental`/`oauthTosAccepted` 在 `lib/` 零残留（grep 全域：仅测试文件以「遗留键字符串/判别注释」形态引用）；begin 侧两门（原 service.js:3273-3284）与调用期门（原 2571-2578）均已删除，删除位置与注释改写一致。
- **②层补全双侧**：直连调用侧 `service.js:804-806`（resolveAgent accountId 分支，先于模型检查与凭据触碰）+ 发起侧 `service.js:3228-3231`（oauthBegin 入口，先于 preset/authUrl 分支——通用账号同样被门控，泛化正确）。
- **判别式同形（P5）**：`enabled === false`（804/3228）与池过滤既有 `enabled !== false`（791）严格同语义——仅显式 false 停用，undefined=启用，与 catalog 镜像 3126 一致。无判别式漂移。
- **③层恒可用**：`oauthLogout`（service.js:3699-3720）无任何 enabled/router.enabled 门控；设备码轮询取消联动（3709-3711）不变；W-5 客户端联动（deletePresetAccount/logoutPresetAccount）保留。
- **升级兼容**：schema 引擎事实核验 = `lib/schemas.js:23` `import z from '@deepseek-ai/schemastery'`——Developer「schemastery 未知字段容忍」措辞与事实相符；`routerSchema({ oauthExperimental: false, oauthTosAccepted: true })` 不抛错由 smoke:95 与 oauth-promotion:44-45 双断言静态看护。
- **oauthProxyUrl 缺键安全**：`service.js:535` `typeof state?.oauthProxyUrl === 'string'` 守卫——A 组/metrics 夹具移除该键后 undefined 安全。

### 2. 安全性 — PASS
- 凭据处理路径未变：resolvePresetCredential/OauthCredentialStore/credentialStoreFor 调用链无结构改动；owner-only RPC 面未动。
- P7 红线保持：smoke:966-967「事件零 token 值」断言保留且通过逻辑不变；新增错误消息仅含账号 id/name，无敏感值。
- **ToS 门移除的访问面判定（审查要求 7）**：不构成未授权访问面——(a) 新凭据获取仍需浏览器交互授权（begin→authorize→exchange 全链）；(b) 调用面仅及 owner 配置内既有账号；(c) 「手改配置绕过弹窗」防线随转正移除 = DEC-026 明确接受的用户主权风险（风险接受已入账，非本 R0 可否决项）；(d) 非阻断告知 `presetNotice` 中英齐备且分区顶部恒显（client.js:2888）。**无 P0/P1 级安全问题。**

### 3. 可维护性 — PASS
- 所有触点注释同步改写（schemas/service×4/client/index），「三层」语义在每个 site 有交叉引用；feature-flags §1/§3/§4/§5 + CHANGELOG Unreleased + README FAQ 口径一致。
- i18n 旧键（experimentalTitle/Switch/Hint/ToS/presetTagExperimental）零残留（grep 证据）；`t()` fallback 行为下若有残留引用将渲染原始键名——client-render 断言①「全树无实验字样」提供渲染级看护，双层防护成立。
- P2-c/P3-d/f 见发现清单（文档边角精度，不阻塞）。

### 4. 性能 — PASS
- 纯减改动：移除两道检查减少工作；B1 断言「停用账号调用零 fetch + 凭据字节不变」看护关闭态零副作用（oauth-promotion:113-118）。

### 5. 测试覆盖 — PASS（附 P3-e）
- 净增 +12（可跑口径 924→936）；判别组（A）+ 关闭能力组（B）结构清晰；①层由既有 routing-paths C13/D8b 看护；实跑结果**待验证**（M-3 无沙箱复跑，见台账①③）。

---

## 二、AI 代码专项 5 项

| 检查项 | 结论 | 依据 |
|---|---|---|
| mock 残留 | ✅ 无 | 产品码零 mock（codexLoopbackStarter 为既有注入 seam）；全部 fetch 桩/夹具 confined 于 tests |
| 硬编码返回值 | ✅ 无新增 | 新增字符串均为合法错误/提示文案；无凭据/状态伪造返回 |
| 幻觉 API 调用 | ✅ 无 | begin/exchange/resolve 全复用既有机制；authUrl 参数断言集与 EVO-002 既有断言一致（PKCE/H3-4/originator） |
| 未实现 TODO | ✅ 无 | diff 全量 hunk 无 TODO/FIXME 新增 |
| 过度实现 | ✅ 无 | ②层新增共 11 行；无投机泛化、无提前抽象 |

---

## 三、设计一致性 — DEC-026 C2 六点逐项

| # | 裁决点 | 结论 | 证据 |
|---|---|---|---|
| 1 | 开关语义重构（废弃移除 vs 翻转默认） | ✅ 成立 | Developer 选「废弃移除两键」：schemas.js:221-226 键删除 + 理由注释（旧显式 false 锁死 + 名不副实）；UI 无开关（2383-2405 toggle 删除）；遗留键容忍双断言（smoke:95 / oauth-promotion:44-45）；引擎事实 schemastery（schemas.js:23）。残余语义面见 P2-a |
| 2 | ToS 实验声明移除；合规告知保留非阻断 | ✅ 成立 | 服务端 tos 门移除（原 3279-3284）；`presetNotice` 中（429-430）/英（727-728）齐备、2888 恒显、无 confirm 阻断；CHANGELOG「非阻断、非实验声明」口径一致 |
| 3 | UI 实验标签/实验区转正式 + i18n 同步 | ✅ 成立 | experimentalTitle/Switch/Hint/ToS/presetTagExperimental 全删（zh/en 对称）；账号卡实验 tag 删除（client.js:1300 区）；分区恒渲染（2881-2905 无条件分支）；账号默认名「ChatGPT（实验）」→「ChatGPT」（2396）+ 夹具同步（client-render:253）；lib/client.js 零「实验」字样（grep 证据） |
| 4 | kill-switch 三层 = 通道开关 + 账号开关 + 登出删除；W-5 不变 | ✅ 成立 | ① isEnabled（service.js:692）+ routing-paths C13/D8b 既有看护；② 双侧新增（804 直连 / 3228 发起）+ 池过滤既有（791）；③ oauthLogout 无门控（3699-3720）+ B4 双关闭态验证（oauth-promotion:131-136）；W-5 联动保留（logout/delete 客户端路径 + wire codec 注释同步 schemas.js:446-448） |
| 5 | flag 债务清理（≥30 天恰满窗） | ✅ 成立（引用级） | feature-flags §3 评估结果注记（条件满足 + DEC-026 + EV-081/083 + 恰满窗）+ §1 转正注记 + §4 退役行 + §5 权限行更新；「恰满窗/EV-081/083」为已入账治理证据，本轮引用一致性核验通过，真机事实不在静态复核范围 |
| 6 | 范围红线（仅 GPT；不做 C-2/C-6；不 bump；不 push） | ✅ 成立 | 11 文件全部映射 EVO-006 面（triage files + 测试 + 文档）；diff 无 Claude/账号池改动；package.json 不在 diff；ahead 5 未 push |

---

## 四、断言账目静态核验（审查要求 4）

**申报**：可跑基线 924→936（+12）；全量口径 934→946（删 8 门控断言 + 增 20）。

**静态核对结果（逐 check 计数）**：
- smoke.mjs：删 13 / 增 14，其中 **5 处为原位语义改写**（R6-F1×2→②层双断言、logout compliance、begin ToS→无 ToS 门、C-9 telemetry 行）→ 纯删 8 / 纯增 9，净 +1。
- metrics.mjs：1 删 1 增 = 原位改写（净 0）。client-render.mjs：4 删 4 增 = 改写组（净 0）。
- oauth-promotion.mjs：**11 断言**（A 组 5：39/45/74/75/79；B 组 6：117/118/122/126/129/136）——与申报「oauth-promotion 11/11」一致。
- **算术自洽**：纯删 8 + 纯增 20 → +12（934→946 ✓）；改写净 0；可跑口径 924 + 12 = 936 ✓。
- **实跑结果待验证**（M-3 无沙箱复跑）——本轮仅核账目自洽性，不背书运行时绿灯。

**A 组「旧语义必败」逻辑推演**：
- A1（oauth-promotion:39）：旧 schema 缺省产出 `oauthExperimental=false` → `'oauthExperimental' in c` 必真 → 必败 ✓
- A3/A4（74/75/79）：旧实现 begin 先报「实验通路已关闭」/调用侧 throw 同文案 → ok:false + reason 事件 + throw → 必败 ✓
- smoke「carries no experimental gate」（550 区）：旧实现 notReady 即 kill-switch 拒绝文案，含「实验通路」→ 必败 ✓
- smoke「no experimental reasons」/ metrics 新断言：旧实现产生 reason:'kill_switch'/'tos' 事件 → 必败 ✓
- client-render ①②：旧实现 `oauthExperimentalOn=false` → presetAdd/presetLogin 不渲染 → 必败 ✓
- **例外 P3-e**：A2（43-45 遗留键容忍）在旧实现下同样通过（旧 schema 合法接受两键）——非判别断言，系升级兼容回归断言；置于「A 组必败」标题下表述过宽。

**B 组三层覆盖**：② 直连（117-118 零副作用）/ 发起（122）/ 池（126/129 回归看护）+ ③ 双关闭态登出（131-136）+ ① 委托既有 C13/D8b（routing-paths.mjs:475/511，实读确认存在）✓

---

## 五、发现清单

### P0 阻塞：**0**

### P1 关键：**0**

### P2 建议（可遗留，不阻塞）
- **P2-a** `lib/schemas.js:221-226` / `CHANGELOG.md` 未发布段——「开过又关」遗留 cohort 静默复用：v0.3.0 内曾开启实验开关→建账号→再关开关的用户，其「关」偏好未迁移到账号级 `enabled=false`，升级后通道对其静默恢复可用。DEC-026 已批准废弃移除（此 cohort 语义消亡属裁决内），但披露完善性属质量面。建议二选一：CHANGELOG 补一句显式披露（「曾手动关闭实验开关的用户升级后通道转为可用，可在账号卡片停用」）；或 loader 一次性迁移（`oauthExperimental===false && oauthTosAccepted===true` → preset 账号 `enabled=false`）。
- **P2-b** `lib/service.js:3228-3231`——②层 oauthBegin 拒绝未留 telemetry：旧 kill_switch/tos 拒绝均产 `preset_begin_fail` 事件，新「已停用」拒绝仅返回消息、无事件（对比同方法 unknown_preset 有事件）。C-9 观测面在「发起被拒」形态上出现缺口。建议补 `recordOauthEvent('preset_begin_fail', { accountId: id, reason: 'account_disabled' })`——不违反现有「零实验 reason」断言（仅查 kill_switch/tos）。
- **P2-c** `docs/release/feature-flags-v0.3.0.md` §4 表——「账号 `enabled=false`」行仍写「单账号停用（池选号跳过）」，未随转正更新为「调用/发起授权均拦截并明确提示」新语义（§1/§3/§5 均已更新，唯此行遗漏）。

### P3 讨论
- **P3-d** `tests/oauth-promotion.mjs:8`——「① router.enabled 总开关（tool.js 既有断言看护）」实际断言位于 `tests/routing-paths.mjs` C13/D8b（看护对象是 lib/tool.js 行为）；建议措辞精确化防止按文件名找断言落空。
- **P3-e** `tests/oauth-promotion.mjs:33-45`——A 组标题「旧实验语义必败」对 A2 不成立（见上）；建议 A2 注释标注「升级兼容回归断言，非判别断言」。
- **P3-f** `lib/service.js:3632-3643`——oauthDiscover 不受 ② 门控（可对停用账号读凭据/发网络做模型发现）。台账④裁量与文档语义（②=调用+发起授权）自洽，成立；建议随 P2-c 一并在 feature-flags §4 注记「模型发现操作不受 ② 门控」边界。

---

## 六、Developer 申报抽查核验表

| 申报项 | 抽查结果 |
|---|---|
| schema 开关 schemas.js:221-228 | ✅ 两键删除 + 注释改写，实读 hunk 相符 |
| 服务端门控链 service.js:3270-3284 + 2571-2578 | ✅ begin 双门 + resolvePresetCredential 门均移除，校验序保持（未知 preset → 资源触碰） |
| ②层关闭缺口 service.js:798-805 + 3220-3225 | ✅ 直连/发起双侧实读确认；先于凭据触碰与 starter 检查 |
| C-9 埋点 reason:'kill_switch'/'tos' 移除 | ✅ 生产点删除；metrics/client-render/smoke 三处「零实验 reason」负向断言看护 |
| UI client.js:2392-2405+2902-2924+2414+1298-1308 | ✅ toggle 删除/分区恒渲染/账号名转正/实验 tag 删除，逐 hunk 相符 |
| i18n client.js:428-435+729-735 | ✅ presetTitle/presetNotice 中英双语定义各 1 处 + 消费点 2886/2888；旧键全域零残留 |
| 文档三件 | ✅ README FAQ 行改写 / CHANGELOG Unreleased 段（无版本号变更）/ feature-flags §1/§3/§4/§5 注记 |
| 注释 index.js:20-24（清单外） | ✅ 纯注释 hunk（3+/3− 注释行），同一可观测语义面理由成立，不属「顺带改」 |
| tests/metrics.mjs（C-9 触点面） | ✅ 仅 observeOauthTelemetry 块（净 0 断言，原位改写），越界理由成立 |
| smoke 936 ok / +12 | ✅ 账目静态自洽（见 §四）；实跑**待验证** |
| 全量口径 934→946（删 8 增 20） | ✅ 纯删 8 / 纯增 20 / 改写 6 净 0——算术精确自洽 |
| oauth-promotion 11/11 | ✅ 逐 check 计数 = 11 |

## 七、Developer 遗留台账①-⑤复核

| # | 申报 | 复核结论 |
|---|---|---|
| ① | smoke exit 1 = 沙箱拒绝仓外 mkdir（install-entry §6，改动前基线即如此） | **静态成立 + 待验证**：tests/install-entry.mjs 不在本 diff 11 文件内 → 非本任务引入，成立；运行时表现待 M-3 无沙箱复跑确认 |
| ② | git hooks 沙箱不可执行（空 hooksPath 提交 + 人工推演） | **治理面成立**：hook 模板属治理插件域、本仓产品码不含 hook 定义路径 → 推演合理；最终以人工提交验证为准（待验证，不影响代码面） |
| ③ | metrics UPLOAD_FAILED 先在失败（HEAD 原版同败） | **静态非回归成立 + 待验证**：本 diff 对 metrics.mjs 改动仅限 observeOauthTelemetry 块，与 UPLOAD_FAILED 路径无交集；失败事实本身待 M-3 复跑确认 |
| ④ | oauthDiscover 未设 enabled 门（账号管理边界裁量） | **属实 + 裁量成立**：service.js:3632-3643 实读无 enabled 判别；与 CHANGELOG/feature-flags「②=调用+发起授权」文档语义自洽；P3-f 建议文档注记边界 |
| ⑤ | client-render 独立入口空操作（既有基建形态） | **属实**：文件末尾实读无 argv/exit 入口，仅导出 runClientRender；既有形态，非本任务引入 |

---

## 八、结论

- **结论：APPROVED_WITH_NOTES**
- **unresolved_blockers = 0**（独立结构字段；P0=0、P1=0）
- 计数：**P0 = 0 / P1 = 0 / P2 = 3（P2-a/P2-b/P2-c）/ P3 = 3（P3-d/P3-e/P3-f）**
- 硬门槛自检：5 维度逐一有结论 ✓；AI 专项 5 项逐一有结论 ✓；设计一致性（C2 六点）逐项比对 ✓；每条发现带文件:行 + 事实依据 + 建议 ✓；不可核验项（实跑结果、真机事实）均标「待验证」未写成已通过 ✓
- **待验证清单（绑定条件）**：smoke/oauth-promotion/全量套件实跑结果（条件：M-3 无沙箱复跑）；metrics UPLOAD_FAILED 与 install-entry §6 的「先在失败」运行时确认（同上）；② git hooks 人工提交验证。三者均不属本 diff 引入面的阻塞项。
- **备注（遗留台账建议）**：P2-a/P2-b/P2-c 建议随 v0.3.1 收尾或后继任务处理，均不阻塞本轮转正合并；复审义务——R0 首轮无前轮 findings，本结论为唯一轮次产出，处置权在 Coordinator。
