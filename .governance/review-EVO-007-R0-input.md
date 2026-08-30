# EVO-007 Code Review — R0（输入报告）

## 报告头

| 项 | 值 |
| --- | --- |
| 任务 | EVO-007：账号面板 UX——移除不可用 OAuth 官方登录入口 + ChatGPT 订阅登录上移醒目位（与子代理交换） |
| 审查对象 | commit `65226a3`（3 files +749/-1048，未 push） |
| 审查轮次 | R0 |
| 审查者 | Code Reviewer Agent（只读；git 只读 + Grep 允许；未执行任何测试） |
| 结论 | **NEEDS_CHANGE**（P1 × 1） |
| P0 / P1 / P2 / P3 | 0 / 1 / 1 / 5 |

---

## 一、5 维度评审

### 维度 1：正确性
- 新布局渲染（API Key → ChatGPT 订阅登录一级 → 子代理 → 高级扩展[仅账号池]）与申报逐项相符（client.js L2361-2469 实测）。
- 池内一键授权链（生死项 2）**逐行推演通过**：`oauthAddToPool`（L2321-2347）→ `runOneClickOauth(accountId, tokenRefOverride)`（L2196-2254）→ 宿主 `oauthBegin`（服务端 PKCE+state）→ 弹窗 → 轮询 `credentials.describe` → `refreshOauthTokens` + 自动 `discoverOauth`。**客户端 pkce 三件套删除不影响该链**——池路径从未使用客户端 PKCE（注释 L949-950 自证 + 函数体对比证实）。
- **P1-1（唯一 P1）**：非 preset OAuth 账号（池内一键建号、历史自定义/粘贴 token 账号、未知 preset 值账号）**删除路径整体消失**——`deleteOauthAccount` 删除后，仅剩 `deletePresetAccount`（限 `isPresetAccount` 成员）；池行「移除」（`removeAccountFromPool`）只从 `pools/<id>/accounts` 摘除引用，**不 unset `oauthAccounts` 条目、不 unset tokenRef 凭据**；服务端 `oauthLogout` 对非 preset 拒绝（"登出仅适用于 ChatGPT 预设账号"）。结果：账号可建可用（agent `fieldAccount` 仍可引用、池仍可用）但**不可删**，条目与凭据永久残留、无 UI 清理入口。R8-F1（EVO-004 修复"UI 黑箱 + 删除死锁"）语义被测试改写反转（详见 P3-2/发现 F-1）。

### 维度 2：安全性
- 无新增硬编码密钥/凭据；token 处理路径（credentials.describe/set/unset）未改动。
- 删除面无凭据泄露面扩大（凭据本就存储于宿主 credentials；本变更反而使部分凭据**无法删除**——残留面，归入 P1-1）。
- 输入校验：`oauthDraftOf` 简化后仍只读 entry 派生字段，无新增外部输入面。

### 维度 3：可维护性
- 删除面干净：组件/处理器/状态/工具/键 53×2 全部无残留引用（仅注释提及，可作变更说明）。
- 保留面命名与职责未变；注释充分说明 EVO-007 语义。
- 镜像 `tests/served-client.js` 与 `lib/client.js` **SHA256 逐字节一致**（E5D1C859…）；旧镜像陈旧（4093 vs 3477 行——先例漂移），本提交为修复性同步。

### 维度 4：性能
- 无新增循环/IO；删除面为净减少（-1048 行）；渲染树无孤儿节点/悬空事件绑定。

### 维度 5：测试覆盖
- client-render 断言组判别性核验（详见四.4）：B 上移断言、顺序断言、徽标断言、折叠区断言对旧实现均**必败**（判别成立）；A 移除断言 462 单条不具判别力（旧布局 oauthTitle 在折叠高级区内不可见），判别由 485/488 承担。
- **门控数字（smoke 951/1 skip/0、routing 114、parity 14、metrics、fix-009/010 9/9、client-render 118）为 Developer 申报，审查约束未执行测试——标"未验证"**。
- 池删除路径无测试覆盖（与 P1-1 同源）。

---

## 二、AI 专项 5 项

| # | 项 | 结论 |
| --- | --- | --- |
| 1 | 误删活代码核验（最高优先） | ✅ 全通过：被删 21 个符号全仓 grep 零活引用（仅注释）；保留面 4 符号全部仍被引用 |
| 2 | 池内一键授权路径完整性 | ✅ 通过：runOneClickOauth/oauthAddToPool/discoverOauth 与旧版逐行一致（仅注释差异）；pkce 工具删除无影响（宿主侧 PKCE） |
| 3 | i18n 清理精确性 | ✅ 通过（1 项 P3 计数偏差）：53 键/语言删除集合 zh=en 完全对称，全仓零 `t('删键')` 残留；16 保留键全部仍引用；presetSummary zh/en 双语函数在位；advancedSection 双语改题 |
| 4 | 断言质量 | ✅ 大体通过：顺序断言为真文档序比较（findAll 前序 DFS）；R7-F1 改写=合理语义迁移；**R8-F1 改写=语义反转（可删→零渲染），与 P1-1 同源** |
| 5 | DEC-027③ 合规 | ✅ 通过：渲染树零残留文案/零空壳区块/零悬空绑定（仅 README 文档残留，P3-3） |

---

## 三、重点核验逐项

### 1. 误删活代码核验（生死项）——✅ 通过
被删符号逐一 grep（含 `\b` 边界）：
- 组件：`OAuthAccountCard`、`AddOAuthCard` → 仅注释
- 处理器：`saveOauthAccount`、`deleteOauthAccount`、`quickAddOauthAccount`、`pasteOauthToken`、`openOauthAuthorize`、`exchangeOauthCode`、`setOauthDraft` → 仅注释
- 状态/派生：`oauthIds`、`oauthFlow`、`expandedOauth`、`addingOauth`、`oauthDrafts` → 仅注释
- 工具：`pkceBase64Url`、`pkceVerifier`、`pkceChallenge`、`codeFromCallback`、`tokenSourceOf`、`tokenBookmarkletOf` → 仅注释
- 常量：客户端 `GEMINI_OAUTH_SCOPES` → 已删；**服务端 `service.js:336` 同名导出保留且仍被 `migrateGeminiScope`/smoke 引用（正确——不同模块）**
- 保留面：`runOneClickOauth`/`discoverOauth`/`oauthAddToPool` 与旧版**代码逐字一致**；`oauthDraftOf` 简化后唯一调用方为 runOneClickOauth（entry 派生字段满足其全部读取）

### 2. 池内一键授权路径完整性（生死项）——✅ 通过
- 入口：PoolCard 行内「一键授权」按钮（L1229 `onOneClickAccount`）或 `oauthAddToPool`（L2345 自动触发）
- 授权：`routerRemote.oauthBegin`（宿主 RPC，服务端 PKCE——客户端 pkce 工具删除**不构成断裂**）
- 回调/落盘：弹窗授权 → 宿主回调页 → 客户端轮询 `credentials.describe` → `refreshOauthTokens` + `discoverOauth` 自动发现模型
- **结论：pkce 删除后该链未断裂，P0 功能回归不成立**

### 3. i18n 清理精确性 ——✅（P3-1 计数偏差）
- 实测删除 **53 键/语言**（申报 52——差 1，无功能影响），zh=en 集合逐键对称
- 全仓 grep 删除键的 `t('...')` 运行时引用：**零命中**（唯一命中为测试注释 L956）
- 保留 16 键（oauthPopupBlocked/oauthWaiting/oauthExpired/oauthAutoDiscovering/advancedLogin/oauthNeedRestart/oauthTokenBack/oauthNeedConfig/oauthLoggedIn/oauthNotLoggedIn/oauthModels/oauthDiscover/oauthDiscovering/fieldAccount/oauthChatOnly/accountOAuth）——逐键 t() 引用 ≥1，零死键
- `presetSummary` zh `(n)=>`${n} 个 ChatGPT 账号``、en `(n)=>`${n} ChatGPT account(s)`` 双语在位；`advancedSection` 双语改题「高级扩展（账号池）」

### 4. 断言质量 ——✅（含 R8-F1 反转观察，归 P1-1）
- **顺序断言**（L467-472）：`subtitles.indexOf(zh.presetTitle)` vs `cliIndex`——findAll 为前序 DFS → 文档序真判别；旧布局 presetTitle 在高级折叠区内（不可见）→ indexOf=-1 → 旧实现必败 ✓
- **R7-F1 改写**（L962）：旧断言 `oauthSummary(0)`（通用区排除 preset 计数为 0）→ 新断言 `presetTitle 可见 && '官方登录，插件独立管理' 零残留`。语义迁移合理：通用区整体删除后"排除"被"区块缺席"吸收，且对旧实现必败（旧实现展开高级区后含 oauthTitle）✓
- **R8-F1 改写**（L1118-1121）：旧断言"未知 preset 账号回落到通用 OAuth 卡（可删）"→ 新断言"账号零渲染"。**这是语义反转而非等价迁移**：通用卡删除后未知 preset（及一切非 preset）账号不再有任何管理/删除入口——R8-F1 修复的"UI 黑箱 + 删除死锁"以另一种形态回归。新断言对旧实现必败（判别成立），但固化了删除路径缺失这一事实 → 与 P1-1 同源，测试本身正确表达了新行为，**缺陷在行为而非断言**
- **A 移除断言**（L462/485/488）：462 单条在旧布局下也通过（oauthTitle 藏于折叠高级区），判别力由 485（徽标含 'OAuth'→旧必败）与 488（展开后含 oauthTitle→旧必败）承担——断言组整体判别成立（P3-2 记录）
- B 上移断言（L465）：presetTitle/presetNotice/presetAdd/presetSummary(0) 一级可见——旧布局下全在折叠区内 → 必败 ✓

### 5. DEC-027③ 合规 ——✅
- 渲染树：accountsBody 无 oauthTitle/oauthIntro/oauthAdd/AddOAuthCard 任何残留；高级扩展壳仅余账号池（徽标仅 poolSummary）；无孤儿节点、无悬空 onClick
- 服务端 `oauthLogout` 报错文案"通用账号请在账号卡片删除 token"指向已删除的卡片——**死文案**（service.js 未改，范围外，P2-1 记录）

### 6. 镜像一致性 ——✅
- `tests/served-client.js` 与 `lib/client.js` 在 65226a3 下 SHA256 一致（E5D1C859BF6B…）；`Copy-Item` 强制规则满足
- 旧镜像本就陈旧（旧 served 3477 行 vs 旧 client 4093 行）——本提交修复先例漂移，非新引入问题（P3-5）

### 7. 范围纪律 ——✅
- `git show --stat` 确认仅 3 文件；schemas.js/service.js 零触碰（`GEMINI_OAUTH_SCOPES` 服务端保留为正确行为）

---

## 四、发现清单

### P0（0）
无。

### P1（1）
- **F-1｜lib/client.js（删除面整体）+ tests/client-render.mjs:1118-1121**：非 preset OAuth 账号删除路径整体消失。删除 `deleteOauthAccount` 后，仅剩 `deletePresetAccount`（限 preset 成员，`oauthLogout` 对非 preset 拒绝）；池行「移除」仅移出池不删条目；`oauthAccounts` 条目与 tokenRef 凭据永久残留、无 UI 清理入口。影响对象：①池内一键建号（oauthAddToPool 创建，无 preset 字段）；②历史自定义/粘贴 token 账号（本变更前已存在，现不可管理）；③未知 preset 值账号（R8-F1 场景）。R8-F1（EVO-004）"未知 preset 回落通用卡可删"语义被区块删除吸收后**未提供替代删除面**——申报"R8-F1 零弱化"不成立（语义反转，弱化的是删除能力）。建议：池行增加「删除账号」入口（unset 条目 + credentials.unset(tokenRef)，参照旧 deleteOauthAccount 语义），或保留最小通用管理面；至少明确产品裁决"既有非 preset 账号不再可管理"并记录。

### P2（1）
- **F-2｜lib/service.js（未改，范围外观察）**：`oauthLogout` 错误文案"通用账号请在账号卡片删除 token"指向已删除的账号卡片——死文案，用户若触达将获得无效指引。建议随 F-1 一并处理（删除或改指）。

### P3（5）
- **F-3｜i18n 计数**：申报"zh+en 各删 52 键"，实测 53 键/语言（对称、零残留）——计数口径偏差，无功能影响。
- **F-4｜tests/client-render.mjs:462**：A 移除断言单条不具判别力（旧布局 oauthTitle 在折叠高级区内），判别由 485/488 承担；建议注释说明或合并，避免未来误读为独立判别。
- **F-5｜README.md:20/84/110-111/128**：仍描述 OAuth 官方登录/OAuth 账号卡管理面——文档未随本次同步（范围纪律 3 文件，建议后续提交）。
- **F-6｜lib/client.js:220**：`oauthTokenExchange` 客户端 descriptor 保留（计数 17 不变）——服务端仍实现且 smoke.mjs:444/456 覆盖，保留正确（RPC 面奇偶），仅观察项。
- **F-7｜镜像先例**：旧 served-client.js 与旧 client.js 本就不同步（陈旧镜像），本提交修复——非新问题，记录以防回归。

---

## 五、结论

**NEEDS_CHANGE**（P0=0，P1=1）

- 生死项 1（误删活代码）与生死项 2（池内一键授权路径）**均通过**：无仍被引用的删除符号；pkce 删除不断链（宿主侧 PKCE 自证）。
- 布局/B 上移/i18n/镜像/范围纪律 五项申报全部核验成立。
- **唯一 P1 = 非 preset OAuth 账号删除路径消失**（含池内建号、历史自定义账号、未知 preset 账号），R8-F1"可删"语义反转、凭据与条目无 UI 清理入口；附 P2 死文案 1 项。
- 门控数字（smoke 951 等）为 Developer 申报，审查约束未执行测试——**未验证**，需 Coordinator 侧实测确认后归档。

报告路径：`.governance/review-EVO-007-R0-input.md`
