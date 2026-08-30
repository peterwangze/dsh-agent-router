# EVO-007 Code Review — R1（输入报告）

## 报告头

| 项 | 值 |
| --- | --- |
| 任务 | EVO-007：账号面板 UX——移除不可用 OAuth 官方登录入口 + ChatGPT 订阅登录上移醒目位（与子代理交换） |
| 审查轮次 | **R1**（T1 回路——R0 NEEDS_CHANGE 后返工复审，同 Reviewer） |
| 前轮报告 | `.governance/review-EVO-007-R0-input.md`（R0 结论：NEEDS_CHANGE，P1×1 / P2×1 / P3×5） |
| 审查对象 | commit `3665d6a`（4 files +314/-40，未 push） |
| 审查者 | Code Reviewer Agent（只读；git 只读 + Grep 允许；未执行任何测试） |
| 结论 | **APPROVED_WITH_NOTES**（unresolved_blockers=0） |
| P0 / P1 / P2 / P3 | 0 / 0 / 0 / 4（新观察 P3×4；R0 P3 台账维持 3 项 + 正确保留项 2 项） |

---

## 一、R0 findings 逐条闭环表

| R0 编号 | 级别 | 内容 | 闭环状态 | 核验依据 |
| --- | --- | --- | --- | --- |
| F-1 | P1 | 非 preset OAuth 账号删除路径整体消失（池内建号/历史自定义/未知 preset 不可删，凭据永久残留；R8-F1 可删语义反转） | **已修复** ✅ | 见下 §二 专项核验（双入口 + 凭据清理链 + W-5 分流 + 14 断言组） |
| F-2 | P2 | service.js oauthLogout 文案"通用账号请在账号卡片删除 token"指向已删除卡片（死文案） | **已修复** ✅ | service.js:3709-3712 改指「账号池行/未入池列表删除」；保留 `ChatGPT 预设` 子串；grep tests 无旧文案断言依赖 |
| F-3 | P3 | i18n 申报 52 键 vs 实测 53 键/语言（口径偏差） | **未修复**（接受，P3 台账维持） | 范围纪律未动——申报已声明口径 53/52 不修 |
| F-4 | P3 | client-render L462 A-移除断言单条不具判别力（判别由 485/488 承担） | **未修复**（接受，P3 台账维持） | 范围纪律未动；断言组整体判别已成立（R0 已核验） |
| F-5 | P3 | README 残留 OAuth 官方登录/OAuth 账号卡管理面文案 | **未修复**（约定 v0.3.2 台账） | 申报一致：README 入 v0.3.2 台账 |
| F-6 | P3 | oauthTokenExchange 客户端 descriptor 保留（服务端仍实现） | **正确保留项**（无需修复） | 服务端 service.js 仍实现 + smoke.mjs:444/456 覆盖；RPC 面奇偶 |
| F-7 | P3 | 旧镜像先例漂移（served-client 陈旧） | **正确保留项**（无需修复，本次镜像仍一致） | 3665d6a 下 served-client.js 与 lib/client.js SHA256 一致（FAC629AE…） |

**结论：R0 的 P1×1、P2×1 全部修复；P3×3 台账维持；P3×2 为正确保留项。无未修复的 P0/P1/P2。**

---

## 二、Developer 预判 4 风险点定向核验

### 风险点 1：双入口行为一致性 + 孤儿判定口径 —— ✅ 通过
- **共用函数**：池行 `onDeleteAccount: (accountId) => deleteOauthAccount(accountId)`（client.js:2574）与孤儿行 `onClick: () => deleteOauthAccount(id)`（client.js:2608）——**同一 `deleteOauthAccount`**（L2030-2052），逐行核对无分叉。
- **孤儿判定口径**：`const orphanOauthIds = oauthEntries.filter((entry) => !isPresetAccount(entry) && !poolMemberIds.has(entry.id))`（L2345-2348）——非 preset && 不在任何池（`poolMemberIds = new Set(poolEntries.flatMap((pool) => pool.accounts ?? []))`）✅ 与申报逐字一致。
- **池内覆盖**：weird（preset:'zzz'，入池 main）→ 池行删除路径；stray（无 preset，未入池）→ 孤儿列表路径；chatgpt（preset 成员）→ W-5 分流。夹具设计三路径全覆盖。

### 风险点 2：「删除账号」文案同文本（poolDeleteAccount/accountDelete/presetDelete 均为 '删除账号'）—— ✅ 通过
- 文本冲突存在（L354/L386/L410 同 '删除账号'），但**测试作用域限定充分**：
  - `orphanDel` 查找限定在 `orphanCard()`（含 'stray' 文本的 dshrouter-card）内
  - `poolDel` 查找限定在 `poolCard()`（card-head 含 'main' 的卡）内
  - findAll 子树限定 → 不误匹配 AccountCard/preset 卡的 '删除账号' 按钮
- 测试注释已说明作用域限定策略 ✅（测试注释 L1124-1131 区域）。

### 风险点 3：孤儿 notice 状态 load() 后保留 —— ✅ 无害性确认
- 真实环境：删除成功 → `if (outcome.ok) await load()`（L2046）→ 条目消失 → 孤儿行消失 → `oauthNotice[id]` 状态残留但**无渲染位**（无害；下次同 id 操作覆盖）。
- 测试环境：remoteMock.catalog 静态（load 不感知 mutate）→ 行仍在 → `oauthDeleted` notice 断言可见 ✅。
- 行消失本身即成功反馈（用户可见结果），成功 notice 不可见**非缺陷**——失败 notice（mutate 失败分支）仍有渲染位（行在 + notice 错误消息）✅ 失败可观测（P-v2 原则 8 满足）。
- 补充观察：成功路径存在**双重 load**（mutate 内部已 `await load()`，L2046 又显式 load）——冗余但幂等无害（新 P3 N-1）。

### 风险点 4：R8-F1 断言组判别性复核 —— ✅ 通过（14 断言组）
- **旧实现必败推演成立**：
  - 旧实现（65226a3）无删除按钮 → `orphanDel`/`poolDel` 为 null → `check('F-1: orphan row carries delete button', !!orphanDel)` 必败
  - 旧实现无孤儿列表 → `orphanCard()` 为 undefined → `orphanCardFound` false → 'F-1: orphan oauth account row renders (stray)' 必败
- **反转见证成立**：旧"零渲染"断言（`!includes('怪异账号') && !includes('weird')`）在新实现下必败——weird 现渲染于池行（'F-1: in-pool account row renders with delete entry' 断言其存在）——测试注释明确记录反转见证（L1122）✅
- **夹具正确性**：stray 无 preset 字段 → `isPresetAccount(stray)`=false ✅；weird preset:'zzz' 非成员值 → false ✅；pools 在 unknownPresetMode 下 = `[main(accounts:['weird'])]` ✅ 三账号分类精确。
- 14 断言计数核对：`check('F-1...')` 恰好 14 条 ✅（含 unset 条目/凭据清理/无池操作/成功文案/池引用剥离）。

---

## 三、复审重点核验

### 1. 凭据清理链正确性 —— ✅
- **幂等/失败容忍**：`await api.credentials.unset({ ref: entry.tokenRef }).catch(() => undefined)`（L2036）——unset 幂等，失败吞掉不阻断后续（与 R0 前旧实现 0c7f987 同模式）✅
- **池引用清理遍历完整性**：`for (const pool of poolEntries)` 遍历**全部**池（L2038-2042），凡 accounts 含 id 者生成 set 操作——跨多池完整（测试夹具单池验证 + 代码遍历全量审查成立）✅
- **mutate 原子性**：全部 ops（池清理 set×n + `unset oauthAccounts/<id>`）在**单次** mutate 调用内提交（L2043-2044）——原子 ✅（与 deletePresetAccount W-5 同构）

### 2. confirm 交互与既有风格一致性 —— ✅
- `if (!window.confirm(t('oauthDeleteConfirm'))) return`（L2033）——与 cliConfirmDelete/poolConfirmDelete/presetDeleteConfirm/accountConfirmDelete 全部 `window.confirm` 同风格 ✅
- 新确认文案 oauthDeleteConfirm 明确告知"同时删除本机凭据 + 池引用"——比旧 oauthConfirmDelete（仅"确认删除？"）更充分 ✅

### 3. i18n 新增 6 键双语对称 —— ✅
- poolDeleteAccount / oauthDeleteConfirm / oauthDeleted / orphanOauthTitle / orphanOauthSummary / orphanOauthIntro——6 键各 dict-defs=2（zh+en 对称）✅
- 全部 t() 引用 ≥1（oauthDeleteConfirm ×3 = confirm + 双入口 title；poolDeleteAccount ×2 = 池行 + 孤儿行）——零死键 ✅

### 4. 新增 UI 面（孤儿列表）与需求 A 语义边界 —— ✅ 克制合规
- 孤儿列表**仅**：subtitle + summary 徽标 + intro + 每行（dot/name/id/删除按钮/notice）——**未恢复管理表单**（无模型编辑/无 token 粘贴/无 Base URL 配置）✅ 克制
- `...(orphanOauthIds.length > 0 ? [...] : [])`（L2589）——**仅孤儿存在时渲染，零空壳** ✅ DEC-027③
- 高级扩展区标题/徽标未动（仍 poolSummary）——孤儿区为折叠内追加，不污染一级布局 ✅

### 5. preset 成员分流 W-5 —— ✅
- `if (entry && isPresetAccount(entry)) return deletePresetAccount(id)`（L2032）——preset 成员走 W-5 三步联动（oauthLogout 删凭据文件 → 清池引用 → unset），与非 preset 的通用链正确分流 ✅

### 6. 范围纪律 —— ✅
- 4 files：lib/client.js + lib/service.js（F-2 文案修复，必要）+ tests/client-render.mjs + tests/served-client.js（镜像）——schemas 零触碰 ✅
- 镜像：3665d6a 下 served-client.js 与 client.js SHA256 逐字节一致（FAC629AEE2F0…）✅ Copy-Item 规则满足

### 7. 门控数字 —— 未验证
- smoke 963/+12 等为 Developer 申报——审查约束未执行测试，标**"未验证"**（Coordinator 归档前实测）。

---

## 四、新发现清单（R1 引入观察）

| 编号 | 级别 | 内容 |
| --- | --- | --- |
| N-1 | P3 | deleteOauthAccount 成功路径双重 load（mutate 内部 L1631 已 load + L2046 显式 load）——冗余幂等，无害 |
| N-2 | P3 | 真实环境孤儿删除成功后 oauthDeleted notice 无渲染位（行消失即反馈）；失败 notice 正常显示——失败可观测满足，成功反馈靠行消失 |
| N-3 | P3 | credentials.unset 先于 mutate：若 mutate 失败（revision conflict）凭据已删条目仍在——**既有语义**（0c7f987 同序），非新引入 |
| N-4 | P3 | poolDeleteAccount 与 accountDelete/presetDelete 同文本 '删除账号'——测试作用域已限定（卡内 findAll），无实际误报；UI 层面上下文可区分 |

无新增 P0/P1/P2。

---

## 五、结论

**APPROVED_WITH_NOTES**（unresolved_blockers=0）

- R0 全部阻塞/关键 findings 闭环：**F-1（P1）已修复**——双入口（池行 + 孤儿列表）共用 deleteOauthAccount，凭据清理链（幂等 unset → 全池引用清理 → unset 条目 → mutate 原子提交）+ preset W-5 分流 + confirm 交互一致 + 14 断言组判别性成立（旧实现必败 + 反转见证）；**F-2（P2）已修复**——service 文案改指新入口且保留 'ChatGPT 预设' 子串。
- 4 风险点定向核验全部通过（双入口一致/孤儿口径/测试作用域/notice 无害性/断言判别性）。
- 4 项新观察均 P3，无阻塞。
- 门控数字为申报——未验证，需 Coordinator 实测后归档。

报告路径：`.governance/review-EVO-007-R1-input.md`
