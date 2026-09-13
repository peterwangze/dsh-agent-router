# 代码审查报告 — FIX-044 锚守卫 carry-over 收口批（R0）

- **Task ID**: **FIX-044**（新任务；FIX-043 全链 R0–R5 六轮 AWN/0 终态后的遗留台账代码面四项）
- **Round**: **R0**（首轮；无前轮报告 ⇒ 无「前轮 findings 逐条比对」义务）
- **审查对象**: commit **`6680d293d47e980b89db5f2f068cb07c8eab023d`**（父 `e002fa2`）
- **审查范围（`--numstat` 独立实测）**: 3 文件 **+142 / −22**
  - `tests/host-abi-health.mjs` **+109 / −5**
  - `tests/client-render.mjs` **+25 / −11**
  - `tests/fix-029-host-contract.mjs` **+8 / −6**
- **输入载体**: `.governance/fix-043-anchor-cases-requirements.md`（§三 硬要求 / §四 保留锚禁令 / §五 限制）
- **前轮基准**: `.governance/review-FIX-043-R5-input.md`（P3-1 骨架口径 / P3-2 入表完备性 / P3-3 notes 指向）· `.governance/review-FIX-043-R4-input.md`（P3-5 保护窗口 + P2-1 骨架方法学）
- **审查员**: Code Reviewer Agent（只读）
- **报告**: `.governance/review-FIX-044-R0-input.md`（唯一写操作）

**审查结论**: **APPROVED_WITH_NOTES**

```
unresolved_blockers=0
```

---

## 一、硬门槛裁决

| 硬门槛 | 阈值 | 实测 | 裁决 |
|---|---|---|---|
| P0 阻塞问题数 | = 0 | **0** | 通过 |
| 5 维度全覆盖 | = 100% | **5/5**（§三） | 通过 |
| 每条发现标注级别 | = 100% | **3/3**（§四，全部 P3） | 通过 |
| 设计一致性检查 | 已完成 | **已完成**（载体 §三 八项 + §四 + §五 逐条，§六） | 通过 |
| AI 代码专项 5 项 | 全部完成 | **5/5 逐一有结论**（§三-2） | 通过 |

| 级别 | 计数 | 内容 |
|---|---|---|
| P0 阻塞 | **0** | —— |
| P1 关键 | **0** | —— |
| P2 建议 | **0** | —— |
| P3 讨论 | **3** | P3-1 commit message「`stale += ['ui-conversation :16041-16056']`（与 `lib/client.js` 条目同形登记）」误述（该串在基线**已在** `lib/client.js` 条目内 ⇒ 非新增）；P3-2 9h-5 形态正则含 `.ts/.tsx/.sh/.ps1` 但扩展名面仅取 `.js/.mjs/.cjs`（当前无实例 ⇒ 潜在漏面）；P3-3 9h-5b 的 `overlappingExempts` 无独立单变量判红实证 |

**四项裁定摘要**（本批核心）：

| # | 裁定项 | 结论 |
|---|---|---|
| ① | 9h-5 / 9h-5b 判据 | **非恒真 ✅（独立 4 案判红）· 不误红 ✅（51/20/[] 逐数复现）· 限制声明如实 ✅** |
| ③ | 17 符号反幻觉 + `hasDocument` 归属更正 | **17/17 逐字在位 ✅ · `L5774-5778` = `sourceLocation` ✅ · `hasDocument` 更正成立 ✅ · 6-of-17 边界精确 ✅** |
| ④ | `:16041-16056` 改指 | **`PropsHooks` 全包 0 命中 ✅ · 两个替代面逐位在位 ✅ · 改指证据充分 ✅** |
| 骨架 | 书面口径可复算性（R5 P3-1） | **三文件骨架 / 字符串多重集 / 代码行逐数复现 ✅ · 口径可复算 ✅** |

---

## 二、独立复算（不采信 Developer 数字）

### 2.1 越界面 / 规模 【逐数吻合；任务描述中的文件↔数字配对有误，已勘正】

`git show --numstat --format="" 6680d29` 独立求和 = **+142 / −22**，3 文件：

| 文件 | 实测 (add/del) | 任务描述声称 | 裁决 |
|---|---|---|---|
| `tests/host-abi-health.mjs` | **109 / 5** | 「109/5」（称属第三文件） | ✅ 数字吻合 |
| `tests/client-render.mjs` | **25 / 11** | 「8/6」（称属本文件） | ❌ 配对错 |
| `tests/fix-029-host-contract.mjs` | **8 / 6** | 「25/11」（称属第三文件） | ❌ 配对错 |

**勘正**：任务描述「`tests/client-render.mjs` 8/6、`tests/fix-029-host-contract.mjs` 109/5」与实测**不对应**；实测配对为 **client-render 25/11** 与 **fix-029 8/6**（= 描述中「25/11」与「8/6」两对数字互换）。**总数与算术核对**：109+25+8 = **142** ✅、5+11+6 = **22** ✅ —— 与 `--shortstat` `3 files changed, 142 insertions(+), 22 deletions(-)` 逐数一致 ⇒ **三个数字对在算术上两两自洽，仅归属标签错位**（描述层笔误，非代码面缺陷；不影响任何判据）。`git diff --numstat e002fa2 6680d29` 同值，双路一致。

- **零越界**：`git show --name-only` = 恰 3 文件；`--diff-filter=A/D` = **0 / 0**（零新建、零删除）。
- **零禁止面**：`lib/**` = 0、`tests/host-contract.mjs` = 0、`tests/served-client.js` = 0、`.governance/**` = 0、`README` = 0、`package.json` = 0、`docs/` = 0。
- **仓库工作树**：HEAD 全程 = `6680d29…`；三锁面文件 `git diff --name-only HEAD` = **空**（逐字节等于提交态）；非 `.governance` 未跟踪 = 0。

### 2.2 `ANCHOR_CASES` 结构与元素 census 【逐数复现】

以自写**注释/字符串感知**扫描器在仓库外副本独立解析（基线 = `git cat-file blob e002fa2:…`，HEAD 同法）：

| 项 | 声称 | 独立实测 | 裁决 |
|---|---|---|---|
| 条目数 | 35 | **35** | ✅ |
| `stale` 顶层元素槽 | 197（194 字面量 + 3 拼接常量） | **197** | ✅ |
| `stale` 单元数（9h-4c） | 35 | **35**（`stale: [` 原文出现 35 次） | ✅ |
| `fresh` 元素 | 183 | **183** | ✅ |
| `notes` 元素 | 16（±0） | **16** | ✅ |
| 基线 `stale` | 184（181 + 3） | **184** | ✅ |
| 基线 `fresh` | 163 | **163** | ✅ |
| Δ stale | +13 | **+13** | ✅ |
| Δ fresh | 163 → 183 | **163 → 183** | ✅ |
| 重复 file 键 | 0 | **0** | ✅ |

**3 个拼接/常量元素的精确身份**（逐字复核，非「约 3 个」）：

| # | 单元 | 形态 |
|---|---|---|
| 1 | `lib/preset-defaults.js` 条目 | `OLD_PRESETDIAG_LINE_ANCHOR`（常量引用） |
| 2 | `tests/smoke.mjs` 条目 | `'dsh-client-modules ' + 'lib/client.js:265-268'`（**字面量 + 字面量**拼接） |
| 3 | `tests/client-render.mjs` 条目 | `OLD_PRESETDIAG_LINE_ANCHOR, OLD_CLIENT_SELF_ANCHOR_CLAIM`（2 个常量引用） |

⇒ 声称的「194 字面量 + 3 拼接常量」在**字数与总数上正确**；其中「3」是**产生非常量字面量值的元素槽数**（3 槽 = 1 处字面量拼接 + 2 个常量引用槽），措辞可更精确但**不构成事实错误**。

### 2.3 断言计数与门控 【独立实跑；+2 构成独立证明】

| 项 | 声称 | 独立实测 | 裁决 |
|---|---|---|---|
| `node tests/run-all.mjs` ×2 | exit 0 ×2（25.4s / 24.9s） | **exit 0 ×2**（25.4s / 26.5s） | ✅ |
| 汇总行 | `ALL 20 SUITES + 4 RUNNER MODULES (via smoke.mjs) PASSED` | 逐字一致 | ✅ |
| `#SKIP` | 2 | **2**（`smoke.mjs×2`；0o600 POSIX / POSIX online） | ✅ |
| `tests/host-contract.mjs` | 118（±0） | **118** exit 0 | ✅ |
| `tests/host-abi-health.mjs` | 187 → 189 | **189** exit 0（`ok` = 189 / `FAIL` = 0） | ✅ |
| `node --check` ×3 | exit 0 | **exit 0 ×3** | ✅ |
| item 级 9h R-1 check | 35（不变） | **35** | ✅ |
| `note` 行 | 16（不变） | **16** | ✅ |
| hygiene（9h-4/4b/4c） | 3 | **3** | ✅ |

**+2 构成独立证明**：在仓库外副本运行**基线树**（`copybase`，三文件回退至 `e002fa2`）⇒ `host-abi-health` **187** exit 0、`host-contract` **118** exit 0；同副本 item-check = **35**、`note` = **16**、9h-5 行 = **0**。
⇒ **Δ = +2 且增量全部来自 9h-5/9h-5b 两条，与 item 级/`note` 级零增量同时成立** ✅（非「总数对上但来源错」）。

**9h-5 新颖性**：`ANCHOR_COVERAGE` 与 `9h-5` 在基线文本内出现次数 = **0 / 0**（HEAD = 6 / 多处）⇒ 确为本批新建判据，非既有判据改名。

### 2.4 骨架逐字节证据（R5 P3-1 教训）【口径可复算，逐数复现】

按 commit message **书面口径**独立实现（(0) CRLF→LF 归一；(1) 注释与单/双引号字符串**内容**置空、定界符保留、转义 2 字符整体置空、模板与正则逐字保留；(2) 去全部空白后逐字节比较；(3) 字符串多重集 = 代码态字面量内容；(4) 代码行 = 字符串含定界符整体置空 + 注释置空后去掉仅空白与逗号的行）：

| 文件 | 骨架 | 字符串多重集 | 代码行 | 裁决 |
|---|---|---|---|---|
| `client-render.mjs` | **71876 = 71876** `identical=true` | **0 / 0**（1230 → 1230） | **1616 = 1616**（0 增 0 删） | ✅ 逐数一致 |
| `fix-029-host-contract.mjs` | **10204 = 10204** `identical=true` | **0 / 0**（129 → 129） | **306 = 306**（0 增 0 删） | ✅ 逐数一致 |
| `host-abi-health.mjs` | **40314 → 42382** `identical=false` | **added 61 / removed 5**（1194 → 1257） | **911 → 952**（**0 删 / 41 增**） | ✅ 逐数一致 |

**41 条新增代码行逐行核验**：全部落在新 9h-5/9h-5b 判据块（`ANCHOR_COVERAGE_FORMS` / `_EXTS` / `_EXEMPTS` / `walkCoverageFace` / `coverageFiles` / `anchorBearingFiles` / `registeredFiles` / `exemptFiles` / `uncoveredFiles` / `deadExempts` / `overlappingExempts` + 2 条 `check(` 调用），**删除行 = 0** ⇒ 「0 删 / 41 增」与「逐行差恰为新判据块」两声称**均成立** ✅。

**removed 5 的身份**：5 条均为**被改写的 notes 原文**（client-render 条目 2 条 + `lib/prestep.js` 条目 1 条 + fix-029 条目 2 条），与声称逐字对应 ✅。

**added 61 的构成（逐条核验）**：新 stale 锚 12 + 新 fresh 符号 17 + 新 stale 锚 `ui-conversation :16041-16056` 1 + 新 fresh 锚 3 + 新 notes 串 4 + 9h-5 判据内部字面量 24 = **61** ✅（与声称的「12+17+1+3 条锚 + 4 条 notes + 新判据内部字面量」同构）。

> **方法学补正（本审查自身；精确到 7 条差异）**：初次实现得过 `added=68`。已定位 7 条差异 = **`'/'` · `'.mjs'` · `'.cjs'` · `'.js'` · `'.yml'` · `'.'` · `'.'`** ——
> (a) 其中 4 条（`'/'`、`'.'`、`'.'` 与另一处）是**模板字面量 `${...}` 替换表达式内部**的字面量：本审查初版把模板整体「逐字保留」后，替换表达式仍被递归提取为字面量；修正为「模板整体不产出字面量」后消失；
> (b) 其余 3 条（`'.mjs'`/`.cjs'`/`.js'`/`.yml'` 一类）是**正则-字面量终止后的裸串**：初版在 `]`/`}` 等表达式位置把紧随其后的 `/` 误判为正则起始，吞掉后文引号边界。
> **修正后 = 61，与声称逐数一致**。独立佐证：模板替换内部字面量独立计数（自写括号栈扫描器）在**基线与 HEAD 均仅 2 条**（`""` ×2），对 `added` 净贡献 = 0 ⇒ 差异**不来自**模板内部（与 (a) 的判定一致：是**本审查脚本**把模板内替换表达式的字面量也计入了，而非守卫口径）。
> 该敏感性**仅存在于本审查的临时脚本**（守卫自身不含骨架判据、不消费该口径），**不影响任何裁定**；登记以证口径对实现细节的敏感性，并说明本审查已把差异**收敛到逐条可指认**。

**原始字节（CRLF 工作树形态）独立复现**：`149803 → 162578`（health）· `157669 → 161602`（client-render）· `22278 → 22516`（fix-029）——三对**逐数一致** ✅；且 `git cat-file blob 6680d29:tests/host-abi-health.mjs` 落盘长度 = 160834（LF），与工作树 162578 之差 = 1744 = 该版本 LF 总数 ⇒ **行尾口径自洽**（`core.autocrlf=true`，两文件改动前后 100% CRLF 无混合，与 Developer 行尾披露一致）。

---

## 三、五维度逐项结论

### 3.1 维度 1：正确性 — **通过（P3×2 备注）**

**(a) ① 判据正确性（本批核心）**

| 项 | 独立实测 | 裁决 |
|---|---|---|
| 扫描面枚举 | `lib/**` + `tests/**` 非点号 `.js/.mjs/.cjs` + `README.md` + `.github/workflows/*.yml` = **51** | ✅ 与声称一致（面内 51 项逐项列出核验） |
| 含锚文件数 | **20** | ✅ 与声称一致 |
| `uncoveredFiles` | **[]** | ✅ 基线不误红 |
| 豁免面 | 3 处；每处**均实含锚**（served-client.js 命中形态②17 次 / oauth-credentials.mjs 形态③2 次 / oauth-promotion.mjs 形态②1 次）⇒ `deadExempts=[]` 非平凡 | ✅ |
| `overlappingExempts` | **[]**（3 豁免文件均不在 `file` 全集） | ✅ |
| `join(ROOT_DIR, ...path.split('/'))` 路径形态 | 实测解析正确（`tests/…` 与 `.github/workflows/ci.yml` 两个代表面） | ✅ |

**非恒真（构造性判红，仓库外副本 4 案，逐次 SHA256 复原）**：

| 案 | 变异 | 结果 | 机器 detail |
|---|---|---|---|
| RA1 | 新增含锚文件 `tests/zz-fix044-coverage-probe.mjs`（不登记不豁免） | **exit 1** ✅ | `{"scanFaceSize":52,"anchorFileCount":21,"uncoveredFiles":["tests/zz-fix044-coverage-probe.mjs"]}` |
| RA2 | 移除 `tests/stats.mjs` 条目（其文件仍含锚） | **exit 1** ✅ | `{"scanFaceSize":51,"anchorFileCount":20,"uncoveredFiles":["tests/stats.mjs"]}` |
| RA3 | `tests/oauth-promotion.mjs` 失去全部形态②锚 | **exit 1** ✅ | `{"exemptCount":3,"deadExempts":["tests/oauth-promotion.mjs"],"overlappingExempts":[]}` |
| RA4 | `tests/served-client.js` 同时登记 + 豁免 | **exit 1** ✅ | `overlappingExempts:["tests/served-client.js"]`（+ 该登记自身的 stale/fresh 判红，共 3 FAIL） |

⇒ **判据依赖实际表内容，非常量满足** ✅。**豁免表腐化可判**（RA3/RA4 直接实证，非仅代码阅读）✅。

**(b) ④ 改指正确性（P10-④）**：原锚对象不成立判定**保留**、新面**实读可达**、旧形态入 `stale`——三项均独立证实（§五-④）。

**(c) 9h-4 纪律与自碰撞**：`needleRepetitions=0`、`selfLiteralNeedles=0`、`staleUnitCount === ANCHOR_CASES.length` = 35/35、零重复 file 键，全部独立复现且守卫实跑 3 行 hygiene **全 ok** ✅。新增的 `ui-conversation :16041-16056` 在守卫内出现 **2** 次（登记单元 + `lib/client.js` 条目），**不在** `tests/host-abi-health.mjs` 自条目内 ⇒ 不触发 9h-4b ✅。

**(d) §四 保留锚禁令（反向实证）**：三处保留锚（`types/agent.js:297-318` / `dsh-host-apiproxy lib/index.js:1010-1054` / 裸 `:2582-2594`）在**全部 35 个 stale 单元内出现次数 = 0 / 0 / 0** ✅；且三者**仍在位**（`lib/prestep.js`、`tests/fix-029-host-contract.mjs`、`tests/host-contract.mjs`、`lib/service.js`）✅。**反向运行**：RB1 把 `types/agent.js:297-318` 写入 `lib/prestep.js` 条目的 `stale` ⇒ **exit 1**、`staleHits:["types/agent.js:297-318"]` ✅ ⇒ 禁令**有机器支撑**。

**(e) 边界/并发/资源**：本批为测试守卫的注释 + 登记数据 + 单块新增判据；无异步/共享状态面；`readdirSync`/`readFileSync` 均为**同步只读**，无句柄泄漏面。

**(f) ③ fresh 侧非恒真**：RA8 移除 `_deepseek_ai_dsh_agent_presets_agentPresets_list_result$schema` ⇒ exit 1、`missingFresh:[…]` ✅；RA7 写回旧 `settings/describe result L4709-4757` ⇒ exit 1、`staleHits:[…]` ✅；RA5b 写回 `ui-conversation :16041-16056` ⇒ exit 1、`staleHits:["ui-conversation :16041-16056"]` ✅；RA6 移除 `SessionStandardProps.useInput` ⇒ exit 1、`missingFresh:["SessionStandardProps.useInput"]` ✅。

> **勘正登记（属任务描述层，非代码问题）**：任务描述称「独立判红 = 副本新增含锚文件不入表 ⇒ exit 1 `uncoveredFiles`；**非恒真 = 副本删除 `tests/stats.mjs` 条目 ⇒ exit 1**」——此二案**均非恒真实证**（「新增未入表」依赖判据的**第一合取项**；「移除已登记条目」是同一合取项的**另一输入**，**不构成**对 `registeredFiles` 侧的第二重独立实证）。本审查据此**追加** RA3/RA4 两案补足豁免面实证（§三-3.1a 表）。此项为**任务描述措辞重叠**，Developer 结构化返回的 8 案枚举本身正确。

**(g) `lib/client.js` 条目 stale 增量的**描述误述 **→ §四 P3-1。

### 3.2 维度 2：安全性 — **通过（无发现）**

| # | 检查项 | 结论 |
|---|---|---|
| 1 | 输入校验 | **无新增外部输入面**。改动 = 测试守卫内注释 / `ANCHOR_CASES` 登记数据 / 一块只读判据；新判据的输入仅为**本仓文件**（`readFileSync`），无网络/用户输入/环境变量面 |
| 2 | 注入防护 | **无新增**。142 新增行零 `eval(` / `new Function` / `child_process` / `execSync` / `spawnSync`（逐行扫描 = 0）；锚判定仍为 `String.includes` 与 3 条**字面量化**正则（无动态构造、无用户输入拼接 ⇒ 无 ReDoS 外部触发面） |
| 3 | 敏感数据 | **零硬编码凭据**。`secret|api[_-]?key|token=|password` 模式在新增行命中 = **0** |
| 4 | 权限检查 | 不适用（测试守卫）；新判据的 FS 访问为**只读**（`readdirSync` / `readFileSync`），无写/删/移动；宿主目录读取由既有 `hostSourceOf` 承担，本批未新增宿主读取路径 |

**AI 代码专项 5 项（逐一）**：

| # | 项 | 结论 | 事实依据 |
|---|---|---|---|
| 1 | mock 残留 | **0 发现** | 新增 142 行 `mock|stub|fake|dummy` = **0** |
| 2 | 硬编码返回值 | **0 发现** | 无新增 `return true` / stub 返回；两条新 `check()` 的判据表达式分别绑定 `uncoveredFiles.length === 0` 与 `deadExempts.length === 0 && overlappingExempts.length === 0`（**均为真实计算量，非字面量恒真**——RA1–RA4 反向实证） |
| 3 | 幻觉 API / 符号 | **0 发现（17/17 宿主实读复核，见 §五-③）** | 17 个 `$schema` 常量标识符**逐一实读在位**；`ctx.uiSession.provide` / `SessionStandardProps.useInput` / `useInput: SnapshotSelectorHook<InputState>` 逐位在位；**零**无法定位符号 |
| 4 | 未实现 TODO | **0 发现** | 新增行 `TODO|FIXME|XXX|HACK` = **0**；未闭合项按 §五-⑤ 以**在仓 `notes`** 登记（非仅会话/提交信息） |
| 5 | 过度实现 | **0 发现** | 无顺带重构、零新建文件、零跨面扩权；`host-abi-health` 代码面**纯新增 41 行 / 0 删**，删除面**仅** 5 条被改写的 notes 字符串；两文件为**纯注释改动**（骨架 `identical=true`、字符串 `0/0`、代码行 `0/0`）|

### 3.3 维度 3：可维护性 — **通过（P3×1 备注）**

**正向**：
- **命名/结构**：`ANCHOR_COVERAGE_FORMS` / `_EXTS` / `_EXEMPTS` / `coverageFiles` / `anchorBearingFiles` / `registeredFiles` / `exemptFiles` / `uncoveredFiles` / `deadExempts` / `overlappingExempts` 命名**自述意图**；`walkCoverageFace(absoluteDir, relativeDir)` 递归助手 8 行、职责单一；与既有 9h-3 判据**同族同型**（载体 §三-1 要求的「同实现路径」）。
- **注释质量（本批最显著正向 = 限制声明）**：`:1454-1475` 以 4 条编号限制**逐条写明覆盖面边界**（①文件级而非逐锚 ②三正则形态盲区 ③豁免表为人工维护面**且明说「不判断豁免理由实质充分性」** ④面外不覆盖）。**逐条与实测相符**（§六 载体 §五 交叉核验）——尤其③**主动自曝**「把新文件写入豁免表即不判红」，未把该判据包装为「完备覆盖」。豁免理由字段 `reason` 亦逐条带**外部依据**（载体 §一 notes 4 / `.router-files` 对象性质 / `rollback-plan v0.3.0` 冻结文档），非空话。
- **notes 收口（②）质量**：`lib/prestep.js` 条目 notes[0] 给出的「理由全集三处」**逐条可核验**——① `tests/host-contract.mjs:335-343` 行内注释**恰 9 行**（逐行计数 = 9 ✅）② `tests/fix-029-host-contract.mjs` 头部行内判定注释（`:21-26` 逐字在位 ✅）③ 本文件 fix-029 条目 `notes`。去冗余侧：fix-029 条目 notes[0] 改为指向 prestep 条目，本处保留**特有事实**（谓词 `[true,true]` → 去行号 `[false,true]`）——**无信息丢失**（三处理由均可交叉还原）✅。
- **未闭合项在仓登记**：11 个细分 `$schema` 符号「无宿主侧机器核验」以 notes 第 2 条**显式声明且标注「不得作通过依据」+ 宿主升级后重核路径** ✅。

**负向**：见 §四 P3-1（commit message 一处 `stale +=` 误述）。函数长度/重复代码：唯一新增函数 8 行；两条 `check()` 形态并列（`uncoveredFiles` 判完备性、`deadExempts`/`overlappingExempts` 判豁免腐化）职责**不同**，非无理由重复。

### 3.4 维度 4：性能 — **通过（无发现）**

- **复杂度**：新增判据 = 1 次递归枚举（`lib` + `tests`） + 每面文件 1 次 `readFileSync` + 每文件 3 次 `RegExp.test`（每条正则在首命中即短路，`some` 语义）⇒ **O(面内文件 × 正则数)**，与既有 `ANCHOR_CASES` 循环 O(条目 × needle × 文件长) **同量级或更低**；无 N+1、无 O(n²) 以上。
- **实测开销**：`host-abi-health.mjs` 单跑 0.2s 量级（基线与 HEAD 无可见差异）；`host-contract.mjs` 118 断言不变；全量 `run-all` **25.4s / 26.5s**（Developer 25.4s / 24.9s；FIX-043 R4 基线 23.1s / 26.7s）⇒ **同量级、零回退** ✅。
- 新增均为静态数据与一次枚举；无循环内 I/O 合并问题（每文件 1 次读取，既有形态）。

### 3.5 维度 5：测试覆盖 — **通过（P3×2 备注）**

| # | 检查项 | 结论 |
|---|---|---|
| 1 | 核心路径有测试 | **有**：9h-5（文件级入表完备性）+ 9h-5b（豁免表腐化）两条新断言；既有 9h R-1（35 条）+ 9h-4/4b/4c 三条 hygiene 保持 |
| 2 | 边界测试 | **有且由本审查独立构造实证**：新增未入表文件（RA1）、移除已登记条目（RA2）、豁免文件失去锚（RA3）、豁免与登记重叠（RA4）；fresh 移除（RA6/RA8）、stale 写回（RA5b/RA7）、§四禁令反向（RB1）——**9 案全部 exit 1 且 detail 精确** |
| 3 | 错误路径测试 | **有**：fail-closed 实证（exit 1 + 结构化 detail `uncoveredFiles` / `deadExempts` / `overlappingExempts` / `staleHits` / `missingFresh`），且**诊断完整不崩栈**（`n FAILURE(S) (m passed)` 汇总行均正常输出） |
| 4 | 覆盖率达标 | 门控全绿：`run-all` **exit 0 ×2**、`ALL 20 SUITES + 4 RUNNER MODULES (via smoke.mjs) PASSED`、`#SKIP 2`（既有平台例外，非本批引入）；`host-contract` **118**、`host-abi-health` **187 → 189**（+2 构成独立证明，§二-2.3） |

**负向**：
- **P3-2**：9h-5 的**形态正则**（`.js|.mjs|.ts|.tsx|.sh|.ps1`）比**扫描面扩展名**（`.js|.mjs|.cjs`）宽 ⇒ 面内非 JS 文件（若存在）不会被扫描，且其扩展名被正则认作「文件:行号」形态的载体——当前 `lib/` + `tests/` 内**非 JS/MJS/CJS 文件 = 0**（独立枚举确认）⇒ **无实例、无当前缺陷**，属潜在漏面。
- **P3-3**：9h-5b 的 `overlappingExempts` 子判据缺**独立单变量**判红实证（RA4 同时触发另两条 FAIL）；其逻辑与 `deadExempts` 同构且 RA4 的 detail 已逐字报出该数组 ⇒ 判别力成立，仅实证纯度不足。

---

## 四、发现清单（逐条带级别 + 可复查事实）

### P3-1（讨论）commit message 称 `fix-029` 条目 `stale += ['ui-conversation :16041-16056']` —— 该串在**基线**已在 `lib/client.js` 条目内

- **位置**：commit message §④ 第 4 条「ANCHOR_CASES fix-029 条目 `stale += ['ui-conversation :16041-16056']`、fresh += 3」；对应 HEAD `tests/host-abi-health.mjs:925` 与 `:1251`
- **事实依据**：
  - `tests/host-abi-health.mjs:925`（`lib/client.js` 条目）的 `stale` 数组**已含** `'ui-conversation :16041-16056'`，且该条目在**基线** `e002fa2:tests/host-abi-health.mjs` 内**逐字相同**（本批 diff **未触及**该行 —— `:925` 不在 `6680d29` 的 3 处 hunk 内）。
  - `tests/host-abi-health.mjs:1251`（`fix-029` 条目）为本批**新增**的 `'ui-conversation :16041-16056',`（diff hunk `@@ -1213,14 +1246,21 @@` 内 `+` 行）。
  - ⇒ 该串**只在** `fix-029` 条目侧新增；**`lib/client.js` 条目侧零变化**（`stale` 增量为 0）。
  - **同批的 §③ 陈述正确**：commit message 明确写「ANCHOR_CASES 同步：**client-render** 条目 stale += 12 / fresh += 17」，未把 `lib/client.js` 计入 —— 即同一 commit message 内部 **§③ 与 §④ 对 `lib/client.js` 有无 stale 变更的表述不一致**。
- **影响**：**不影响任何判据、不影响门禁、不影响树内容**（正确行为 = 两处条目**均**带该 needle，现树即如此；9h-4 亦不因此判红——实测 2 处 = 登记 2 处）。风险仅在于：按现措辞会误认为 `lib/client.js` 条目在本批被修改，与 §③ 同批的「零 `lib/**` 改动」纪律在读者侧产生噪声。
- **修复建议**：把 §④ 该句改为「`fix-029` 条目 `stale += ['ui-conversation :16041-16056']`（**`lib/client.js` 条目已在批 C/D 登记同串，本批零变化**）、fresh += 3」。（`fix-029` 条目 `notes` 第 2 条的既存措辞「**旧形态已入本条目 `stale`**」**是正确的**，无需修改。）
- **级别理由**：**非阻塞** —— 描述层事实精度（P1 原则：结论须可复查事实支撑）；树内容与判据均正确。

### P3-2（讨论）9h-5 形态正则含 `.ts/.tsx/.sh/.ps1`，但扫描面扩展名仅 `.js/.mjs/.cjs` —— 潜在漏面（当前无实例）

- **位置**：`tests/host-abi-health.mjs:1478`（`ANCHOR_COVERAGE_FORMS[0]`）与 `:1482`（`ANCHOR_COVERAGE_EXTS`）
- **事实依据**：`ANCHOR_COVERAGE_FORMS[0]` 的扩展名交替组 = `(js|mjs|ts|tsx|sh|ps1)`；`ANCHOR_COVERAGE_EXTS = ['.js', '.mjs', '.cjs']`。二者不同名集：面内 `.ts/.tsx/.sh/.ps1` **不被枚举**（`.cjs` 反之被枚举但**不在**正则的第一形态内，可被形态②/③覆盖）。独立枚举 `lib/` + `tests/` 递归（排除点号条目）= **非 `.js/.mjs/.cjs` 文件 0 个** ⇒ **无当前实例**。
- **影响**：若后续在 `lib/`/`tests/` 新增 `.ts`/`.sh` 等文件并写入行号式锚，其**锚形态①②③被识别但文件不入扫描面** ⇒ 该文件可静默漏登（即「潜在漏面」，与 9h-5 的既定目标同族但未闭合）。当前树无此面 ⇒ 零实际风险；`README.md` 与 `.github/workflows/*.yml` 已**显式**入面，说明作者已意识到扩展名面需与实际载体对齐。
- **修复建议**：把 `ANCHOR_COVERAGE_EXTS` 扩为 `['.js','.mjs','.cjs','.ts','.tsx','.sh','.ps1']`（与形态正则对齐），或在注释中显式声明「面内仅收录 JS 系扩展名，非 JS 载体属已知面外」——二者取一即可消除歧义。
- **级别理由**：**非阻塞** —— 潜在（非现发）覆盖缺口；判据对其**声称范围**（`.js/.mjs/.cjs`）内部自洽，且注释第②条已登记「三正则形态盲区」，但**未**登记「形态集 ⊃ 扩展名集」这一具体不一致。

### P3-3（讨论）9h-5b 的 `overlappingExempts` 子判据缺独立单变量判红实证

- **位置**：`tests/host-abi-health.mjs:1512` 与 `:1515-1516`
- **事实依据**：本审查 RA4（`served-client.js` 同时登记 + 豁免）实测 exit 1 且 detail 逐字报 `overlappingExempts:["tests/served-client.js"]`（✅ 判别力**成立**）；但该案同时触发 `B5 9h R-1: tests/served-client.js 清单所列旧式锚零残留…`（因探针 stale 串 `'x'` 命中）与 9h-4 `needleRepetitions`（`「x」登记 42 处 / 守卫内 396 处`）⇒ 该次实证**不是** `overlappingExempts` 的**单变量**判红。Developer 声称的「⑧ 豁免与登记重叠 ⇒ 9h-5 + 9h-5b 双红」**与实测一致**（确为双红），未过声称。
- **影响**：无（判别力已由 detail 直接证明；`deadExempts` 已有单变量案 RA3）。仅实证**纯度**不足，属方法学备注。
- **修复建议**：后续批次可用「仅给某豁免文件加一条**与其内容匹配**的登记单元」构造单变量案；或接受 detail 级证明（本审查接受）。
- **级别理由**：**非阻塞** —— 判据正确且 detail 已实证；仅为实证构造的纯度提升建议。

**无 P0 / P1 / P2 发现。**

---

## 五、四项核心裁定（逐项事实链）

### ① 9h-5 / 9h-5b 判据裁定 —— **非恒真 ✅ · 不误红 ✅ · 声明如实 ✅ · 扫描面枚举无漏/无多算 ✅**

| 子问题 | 独立实测 | 裁定 |
|---|---|---|
| 非恒真？ | RA1（新增未入表文件）· RA2（移除已登记条目）· RA3（豁免死锚）· RA4（豁免重叠）**四案全部 exit 1**，detail 精确 | **是（可达）** ✅ |
| 不误红？ | 基线 `scanFaceSize=51` / `anchorFileCount=20` / `uncoveredFiles=[]` / `deadExempts=[]` / `overlappingExempts=[]`，**逐数复现**，exit 0 | **不误红** ✅ |
| 扫描面枚举是否漏/多算？ | 独立重实现枚举得 **51** 项并**逐项列出**（`lib/**` 23 + `tests/**` 26 + `README.md` + `.github/workflows/ci.yml` = 51）；点号条目（`.tmp-research` 等）按设计排除；含锚文件 **20** 项逐项列出且每项标注命中形态（F1/F2/F3） | **不漏不多** ✅ |
| 豁免面与限制声明是否如实？ | ①「文件级而非逐锚」——**如实**（判据仅 `uncoveredFiles`/`deadExempts`/`overlappingExempts`，确不判逐锚）②「三正则形态盲区」——**如实**（跨行拆分锚确不命中，如 `lib/client.js:\n157-161` 形态）③「豁免表本身是人工维护面、把新文件写入豁免表即不判红、不判理由实质充分性」——**如实**（`ANCHOR_COVERAGE_EXEMPTS` 为字面量数组，无理由校验逻辑）④「面外不覆盖」——**如实**（`docs/**`、`CHANGELOG.md`、`.tmp-research/**`、宿主树均不在 `coverageFiles` 内） | **逐条如实，无夸大** ✅ |
| 一处**声明与实际不完全对齐** | 形态正则扩展名集 ⊃ 扫描面扩展名集（`.ts/.tsx/.sh/.ps1`），注释未登记此不一致 | 登记为 **P3-2**（潜在、无实例） |

### ③ 17 符号反幻觉 + `hasDocument` 归属更正裁定 —— **全部成立 ✅**

**A. 17 个 `$schema` 符号逐字在位（宿主 `dsh-api-remotes/lib/client.js`，只读实读，329870 字节）**

| # | 符号（省前缀） | 行 | 命中 |
|---|---|---|---|
| 1 | `llm_listProviders_result$schema` | 5735 | 2 |
| 2 | `llm_listConfigurableProviders_result$schema` | 5727 | 2 |
| 3-4 | `llm_discoverModels_parameter_0/1$schema` | 5714 / 5715 | 2 / 2 |
| 5 | `llm_discoverModels_result$schema` | 5721 | 2 |
| 6 | `settings_describe_result$schema` | **4712** | 2 |
| 7-9 | `settings_mutate_parameter_0/1/2$schema` | 4761 / 4762 / 4778 | 2 / 2 / 2 |
| 10 | `credentials_describe_result$schema` | 4701 | 2 |
| 11-12 | `credentials_set_parameter_0/1$schema` | 4706 / 4707 | 2 / 2 |
| 13 | `credentials_unset_parameter_0$schema` | 4709 | 2 |
| 14 | `agent_presets_agentPresets_list_result$schema` | 4315 | 2 |
| 15 | `session_modelCatalog_result$schema` | 8164 | 2 |
| 16 | `session_selectModel_parameter_0$schema` | 8296 | 2 |
| 17 | `session_selectModel_result$schema` | 8302 | 2 |

⇒ **17/17 全部逐字在位**（三类面 llm / settings-credentials / agentPresets + session 均覆盖）✅。**零幻觉符号**。

**B. 三项「实测漂移」主张逐条成立**

| 主张 | 独立实读 | 裁定 |
|---|---|---|
| describe 区间**起界错位**：首三条 = credentials unset 参数 / unset 结果 / `settings_canOpenAgentPresetDirectory` 结果 | `:4709` `credentials_unset_parameter_0` · `:4710` `credentials_unset_result` · `:4711` `settings_canOpenAgentPresetDirectory_result`；`settings_describe_result` 实在 **`:4712`** = 首三条之后**第 3 行** | ✅ **逐字成立** |
| llm 面那组实为 **parameters 段** | `:5676-5690` 为 `parameters: [{ name: "agent", wire: "agentId", source: "lookup", … }]`（**parameters 段**）；`llm_listProviders_result` 实在 **`:5735`**（原锚 `L5678-5681`） | ✅ **成立** |
| 旧 `L5774-5778` 引用实为 descriptor 的 **`sourceLocation`** 元数据块 | `:5774-5778` = `sourceLocation: { "file": "packages/llm/llm/src/index.ts", "line": 628, "column": 9 }` —— **确为 `sourceLocation` 元数据，非 schema 定义** | ✅ **逐字成立** |

**C. `hasDocument` 归属更正 —— 成立（宿主侧 + 消费面 + 白名单三向一致）**

| 证据 | 内容 |
|---|---|
| 宿主 `agentPresets_list_result$schema`（`:4315-4325`）字段集 | `"presets"`（array of object，含 `id/trust/isDefault/name?/description?/broken?`） + `"authorable": boolean().readonly()` —— **无 `hasDocument`** ✅ |
| 宿主 `settings_describe_result$schema`（`:4712-4716+`）字段集 | `"writable": boolean()` · **`"hasDocument": boolean()`** · `"namespaces": array(object({…}))` ✅ |
| 消费面 | `lib/client.js:5351` = `hasDocument: value.hasDocument === true`（`settings.describe()` 结果消费）；`lib/host-abi/client-remotes.js:196` 同形；`tests/client-render.mjs:497` 的 settings.describe 夹具含 `hasDocument: true` ✅ |
| `tests/host-contract.mjs:417` 的 `WIRE_SCHEMA_WHITELIST['agentPresets.list'].schema` | **`['presets', 'authorable']`**（**只读核验；该文件不在本批 diff 内**——`--name-only` 已确认）✅ |
| `settings.describe` 面白名单 `:401` | `['writable', 'hasDocument', 'namespaces']` ✅ |
| 行内更正落位 | `tests/client-render.mjs:424-427` 逐字更正，且**未改产品代码、未放宽判据**（该文件骨架 `identical=true`、字符串 `0/0` ⇒ 确为纯注释改动）✅ |

⇒ **原「presets/authorable/hasDocument 三字段为宿主形状」claim 部分不成立**、`hasDocument` 属 `settings_describe_result` 的更正**成立**，且**如实登记在仓**（notes + 行内注释）✅。

**D. 「17 中 6 个由 S5/S7 覆盖、11 个不声称机器覆盖」边界声明 —— 精确成立**

`WIRE_SCHEMA_WHITELIST`（`tests/host-contract.mjs:371-420`）**恰 6 个 face**，各自 `expectSymbol` 指向 result schema：`llm.listConfigurableProviders` · `llm.listProviders` · `session.modelCatalog` · `settings.describe` · `credentials.describe` · `agentPresets.list` ⇒ **6** ✅。
未覆盖 = `discoverModels`（parameter_0/1 + result）· `settings mutate`（parameter_0/1/2）· `credentials set`（parameter_0/1）+ `unset`（parameter_0）· `session selectModel`（parameter_0 + result）= 3+3+3+2 = **11** ✅。**6 + 11 = 17** ✅ ⇒ 声明**精确、无夸大**（且 notes 明确写「**不声称**机器覆盖宿主对象」+ 宿主升级后重核路径）。

### ④ `:16041-16056` 归属定位与改指裁定 —— **证据充分 ✅**

| 主张 | 独立实读（宿主 `dsh-client-ui-conversation`） | 裁定 |
|---|---|---|
| `PropsHooks` 在该包全树 **0 命中** | 全树递归 `Select-String -SimpleMatch 'PropsHooks'` = **0** 命中 | ✅ |
| `:16041-16056` 实为 InputBar JSX 渲染段 | `:16041 const claimActive = (input?.phase === "claimed" \|\| …)` … `:16056 icon: (0, react_jsx_runtime.jsx)(…IconWarningOutline16, {})` —— 确为 JSX 渲染段 | ✅ |
| 替代面 ① 注入面 = `lib/client.js:16593` 的 `ctx.uiSession.provide({ hooks: ["conversation","input"], props: ["inputActions"], … })` | `:16591 const inputHub = new InputHub(ctx, t);` · `:16593 ctx.uiSession.provide({` · `:16594 hooks: ["conversation", "input"],` · `:16595 props: ["inputActions"],` —— **逐位在位**（多行格式；`hooks`/`props` 两串各恰 1 次命中） | ✅ |
| 替代面 ② input → useInput 契约 = `slots.d.ts:245` 的 `useInput: SnapshotSelectorHook<InputState>` | `lib/types/client/contract/slots.d.ts:241 interface SessionStandardProps {` · `:245 useInput: SnapshotSelectorHook<InputState>;` —— **逐位在位**（两串各恰 1 次命中） | ✅ |

**改指纪律裁定（P10-④）**：
- **保留批 F 判定**：改指后的 notes **仍逐字保留**「原锚对象不成立、`PropsHooks` 0 命中、区间实为 InputBar JSX 段」✅ —— 未用新结论掩盖旧判定。
- **零新增未实证符号**：3 条新 fresh 锚**全部**为宿主实读可达串（上表逐位复核）✅。
- **旧形态入 `stale` 而非删除**：`fix-029` 条目 `stale += 'ui-conversation :16041-16056'` ⇒ 再引入即判红（RA5b 实测 exit 1）✅ —— 满足「同一动作汇入同一实现路径、旧路径不并存」（P-v3 原则 5）。
- **跨文件同步**：`tests/fix-029-host-contract.mjs:17-26` 头部行内注释与 `ANCHOR_CASES` `fix-029` 条目 notes **同判一致**（两处均述「对象不成立 → 本批定位改指」）✅。
- **§四 禁令的时点说明**：`fix-029` notes 第 2 条明确写「**旧形态已入本条目 `stale` ⇒ 再引入即判红**（批 F 的『MUST NOT 入 stale』成立于旧态——彼时对象未定位）」——**该时点论证成立**（对象未定位时无法改指，入 stale 会迫使删除一个仍在位且无替代的锚；定位后旧锚必随改指清除，故入 stale 正确）✅。
- ⇒ **改指证据充分，无越界、无虚构、无判据放宽**。

### 骨架口径可复算性裁定 —— **可复算 ✅（R5 P3-1 已闭合）**

§二-2.4 已逐数复现三文件的**骨架 / 字符串多重集 / 代码行 / 原始字节**四组数字，且**逐行差**核到「41 增 0 删、全部为新判据块」。**口径无未定义边界**：本审查按书面 4 条口径独立实现即复现全部数字，**未遇到需外部补充定义的歧义**。
> 唯一口径敏感性登记：**正则-字面量边界**须按「表达式位置」判别（否则除号被误吞）；该敏感性为**任何**此类骨架判据的共有属性，且书面口径已含「正则字面量逐字保留」一行 ⇒ 属可解释范畴，**不构成不可复算**。R5 P3-1 的实质要求（「证据形态含骨架逐字节判据且可复算」）**已满足**。

---

## 六、载体落地完整性裁定（§三 八项 + §四 + §五）

| 载体条目 | 要求 | 实测 | 裁定 |
|---|---|---|---|
| §三-1 R2 P2-1（MUST-FIX） | 补防御 + 构造性实证 | FIX-043 批 F 已闭合；本批未回退（`tests/host-contract.mjs` 零改动，118 断言不变） | 保持 ✅ |
| §三-2 R2 P2-2 收口 | 删总括断言 + 逐处标注 + 刷数字 | 零回退（`host-contract.mjs` 不在本批；既有判据 118 不变） | 保持 ✅ |
| §三-3 保护窗口（R4 P3-5） | 为 §一+§二 全部文件建/扩 `stale` | FIX-043 批 F 已落地；本批**新增 13 条 stale 锚**（client-render 12 + fix-029 1）并保持既有 35 条目覆盖 | 保持 + 加强 ✅ |
| §三-4 ① 裸锚带同句上下文 | 新增 needle 必带上下文 | 12 条新 `L` 族锚**全部**带同句主语（如 `llm/listProviders result L5678-5681`、`settings/mutate(ns, ops) L4758-4811`、`宿主 L5774-5778 真实形状`、`（裸数组）L5665-5670`）；`ui-conversation :16041-16056` 带对象名 | ✅ |
| §三-4 ② 两处保留锚 MUST NOT 入 stale | 入表即红 | 三处保留锚在 35 个 stale 单元内命中 = **0/0/0**；RB1 反向实测 exit 1 | ✅ |
| §三-4 ③ 镜像侧不重复登记 | 零 `served-client.js` 登记 | `['tests','served-client.js']` 在守卫内**仅 1 处** = `ANCHOR_COVERAGE_EXEMPTS`（豁免表），**不在** `ANCHOR_CASES`；镜像字节恒等判据 `:161-162` 在位 | ✅ |
| §三-4 ④ R2 P2-2 收口 + ⑥ 段落数字刷新 | —— | 本批未回退（§三-2 面） | 保持 ✅ |
| §三-4 ⑤ `staleUnitCount === ANCHOR_CASES.length` | 按引用时点重跑 | **35 === 35**（独立复现；守卫实跑 ok） | ✅ |
| §三-4 ⑥ 跨文件同锚同步 | `fix-029` 头部与 `lib/client.js` 侧同判 | 两处同判一致（§五-④） | ✅ |
| §三-5 宽口径裸锚收敛 | 逐处语义判定 | 本批新增锚均带上下文；未越界改他文件 | ✅ |
| §三-6 未闭合 2 项在仓登记 | 写入在仓 `notes` | **① `L####` wire-schema**：本批**完成重建**（12 → 17 符号），notes 改为「已收口 + 对象核验边界」；**② `:16041-16056`**：本批**完成定位改指**，notes + 头部行内注释两处登记 ⇒ **两项均由「未闭合」转为「已闭合 + 限制如实登记」** ✅ | ✅ **闭合** |
| §三-7 `:270` 保留项 | 逐处判定或维持保留 + 理由 | FIX-043 批 F 已闭合（`host-contract.mjs:335-343` 9 行理由在位，逐行计数 = 9 复核通过）；本批未回退 | 保持 ✅ |
| §三-8 骨架判据（R4 P2-1 方法学） | 证据形态含骨架逐字节判据 | **本批已提供 + 本审查独立复算逐数一致**（§二-2.4） | ✅ **闭合（R5 P3-1 解除）** |
| §四 保留锚 | MUST NOT 入 stale | 独立确认 + RB1 反向判红 | ✅ |
| §五 未验证限制 | 如实标注 | ① `.tmp-research` 对象不可机器核验——**保持登记**（`lib/prestep.js` 条目 notes 第 2 条，措辞「在仓库路径内、版本控制外」）② 11 个细分 `$schema` 无宿主侧机器核验——**本批新增如实声明**（notes 第 2 条，含「不得作通过依据」+ 重核路径）③ 豁免表人工面——**本批新增如实声明** | ✅ **无夸大** |

**⑤⑥⑦ 登记面（commit message「范围与未闭合」自述未处理）**：本批明确声明 `⑤⑥⑦` 三项（commit message 数字纠错句 / `.test-home` 快照时点标注 / 「25 单元」自我更正留痕）**属 Coordinator 面未处理** —— **如实**（本审查确认三者在 3 文件 diff 内**无对应改动**）✅。

---

## 七、原则符合性

| 依据 | 检查结论 |
|---|---|
| **P1**（基于事实，禁假设/编造） | **满足**——17 符号逐字实读；`hasDocument` 归属以宿主字段集 + 消费面 + 白名单三向证实；三项漂移主张逐条实读成立；未闭合项如实登记。一处描述精度缺陷 → **P3-1** |
| **P2**（全面分析，避免遗漏） | **满足**——§三-6 两项未闭合项**同批一并闭合**（非择一）；`stale`/`fresh`/`notes` 三侧同步（12+17+2 notes、1+3+2 notes） |
| **P3**（避免引入新问题） | **满足**——两文件**纯注释**（骨架 `identical=true`、字符串 `0/0`）；`host-abi-health` **0 删 / 41 增**；零 `lib/**`；门控 ×2 绿、断言零回退 |
| **P4**（产品代码变更跑全量测试网 + 零回退） | **满足**（本批无产品代码变更）——`run-all` **exit 0 ×2**、20 套件 + 4 runner 全绿、`#SKIP 2` 与基线一致、`node --check` ×3 exit 0 |
| **P5**（同动作汇入同一路径；禁单点；旧路径 MUST 删除） | **强正向**——**全部**行号式锚一律改为**符号名式**单一实现路径（`L####` → `$schema` 常量标识符；`PropsHooks` claim → 实读可达面）；旧形态**全部**入 `stale`（不是并存而是判红看护）⇒「旧路径已删除 + 再引入即红」|
| **P6**（高质量，禁为完成任务忽略质量） | **满足**——限制声明 4 条编号写明、豁免 reason 逐条带外部依据、未覆盖 11 符号主动标注「不得作通过依据」 |
| **P7**（安全性，避免损坏用户数据） | **N/A / 满足**——零数据写路径；本批 FS 访问全为**只读**；无删除/覆盖面 |
| **P8**（失败与降级可观测） | **满足**——两条新判据 fail-closed 且诊断**结构化**（`uncoveredFiles` / `deadExempts` / `overlappingExempts` / `scanFaceSize` / `anchorFileCount` / `exemptCount`），9 案实测 detail 精确；`check()` 失败即 `exit 1` + 汇总行 |
| **P9**（宿主演进防御） | **强正向**——行号式锚是对宿主演进最脆弱的形态（本批实测 3 处漂移即为证）；改为 `$schema` 常量标识符显著提升抗漂移能力；11 个未机器核验面的**重核程序**已指向 `tests/host-contract.mjs` 头部 |
| **P10-④**（测试桩宿主面 MUST 锚定宿主源码；禁按心智模型伪造） | **满足（本批核心正向）**——17 符号 / 2 替代面**全部**宿主只读实读；`hasDocument` 的**错误 claim 被如实更正**而非沿用；批 F 的「对象不成立」判定**保留未掩盖** |
| **P-v3 原则 5**（被取代的旧路径 MUST 删除，禁止并存） | **满足**——旧锚入 `stale`（再引入判红），非与新锚并存放行 |
| **编程要求 4**（一个 commit 承载一个问题；禁冗余修改） | **满足**——3 文件全为锁定面；无顺带重构；四项变更同属「FIX-043 遗留台账代码面收口」单一主题 |

---

## 八、证据（命令 + 输出摘要）

### 8.1 仓库内（只读 + 门控实跑）

| # | 命令 | 输出摘要 |
|---|---|---|
| E1 | `git rev-parse HEAD` | `6680d293d47e980b89db5f2f068cb07c8eab023d`（全程不变） |
| E2 | `git show --numstat --format="" 6680d29` | 3 行：`25/11 client-render` · `8/6 fix-029` · `109/5 host-abi-health`；求和 **+142/−22** |
| E3 | `git show --shortstat --format="" 6680d29` | `3 files changed, 142 insertions(+), 22 deletions(-)`（与 E2 求和一致） |
| E4 | `git show --name-only/--name-status --diff-filter=A/D` | 恰 3 文件；**A=0 / D=0** |
| E5 | `git show 6680d29`（全 diff 逐行通读） | 3 hunk 组；两文件纯注释；`host-abi-health` 3 处 hunk（`:759` stale 12 条 · `:789` fresh 17 条 + notes 2 条 · `:1207/:1246` notes 改写 + stale/fresh 新增 · `:1451` 新判据块 41 行） |
| E6 | `node tests/host-abi-health.mjs` | `ALL HOST ABI HEALTH TESTS PASSED (189 assertions)` exit **0**；`ok`=189 / `FAIL`=0；9h R-1 item=**35**、note=**16**、hygiene=**3** |
| E7 | `node tests/host-contract.mjs` | `ALL HOST CONTRACT GUARD TESTS PASSED (118 assertions)` exit **0** |
| E8 | `node tests/run-all.mjs` ×2 | exit **0 / 0**（25.4s / 26.5s）；`ALL 20 SUITES + 4 RUNNER MODULES (via smoke.mjs) PASSED`；`#SKIP 2 (smoke.mjs×2)` |
| E9 | `node --check` ×3 | 三文件 **exit 0** |
| E10 | `git status --porcelain` / `git diff --name-only HEAD` | 非 `.governance` 零修改；三锁面 vs HEAD = **空** |
| E11 | `git cat-file blob <rev>:<file>`（CRLF / LF 双口径） | CRLF：`149803→162578` / `157669→161602` / `22278→22516`；LF：`149803→160834` 等；工作树长度 = CRLF 值（逐数吻合声称） |
| E12 | AI 专项扫描（新增 142 行） | `TODO/FIXME/XXX/HACK`=0 · `mock/stub/fake/dummy`=0 · `eval(/new Function/child_process/execSync/spawnSync`=0 · `console.log`=0 · 凭据模式=**0** |
| E13 | 宿主实读（只读，`Select-String` / `ReadAllLines`） | 17 符号 17/17 在位；`L5774-5778` = `sourceLocation`；`hasDocument` 在 `:4714`；`agentPresets_list_result` 字段 = `presets`+`authorable` |
| E14 | `tests/host-contract.mjs:371-420` 只读核验 | `WIRE_SCHEMA_WHITELIST` **恰 6 face**，逐一 `expectSymbol`；`:417` = `['presets','authorable']`；`:401` = `['writable','hasDocument','namespaces']`；该文件**不在本批 diff** |
| E15 | 宿主 `dsh-client-ui-conversation` 全树只读检索 | `PropsHooks` = **0**；`:16041-16056` = InputBar JSX；`:16593` `provide({ hooks: ["conversation","input"], props: ["inputActions"] })`；`slots.d.ts:241/245` 逐位在位 |
| E16 | 9h-5 扫描面独立重实现（自写，仓库外脚本） | `scanFaceSize=51` · `anchorFileCount=20` · `uncoveredFiles=[]` · `exemptCount=3` · `deadExempts=[]` · `overlappingExempts=[]`（逐数与声称一致，面内 51 项与 20 含锚项**逐项列出核验**） |
| E17 | 骨架口径独立重实现（自写，按书面 4 条口径） | `client-render` 71876=71876 `identical` / `0/0` / 1616=1616；`fix-029` 10204=10204 `identical` / `0/0` / 306=306；`host-abi-health` 40314→42382 / **+61−5** / 911→952（**0 删 41 增**，41 行逐行核到新判据块） |
| E18 | 元素级 census 独立解析（自写；含守卫 `staleElementValuesOf` 精确复刻） | 条目 **35** · `stale` 单元 **35** · `stale` 顶层元素 **197** · `fresh` **183** · `notes` **16** · 重复 file 键 **0**；基线 **184 / 163** ⇒ Δ **+13 / +20** |
| E19 | post-commit / pre-commit hook 只读核验 | `is_product_code()` 白名单**不含** `tests/**`（`.governance` 走 `continue`，其余路径 `return 1`）⇒ 本批 3 文件均**非**产品代码 ⇒ Step 7/10–14 未触发；`post-commit:155-159` 的 `M7.4 VIOLATION: … has NO evidence` 处于**该分支** ⇒ Developer 的 GOV-009 观察**属实** |

### 8.2 仓库外副本（`%TEMP%\fix044rev`；`robocopy` 全树 + `node_modules` junction；**仓库工作树零写操作**）

| # | 命令 | 输出摘要 |
|---|---|---|
| E20 | `robocopy` 全树（`copy` = HEAD / `copybase` = `e002fa2` 三文件回退） | 两份副本；基线 guard **187 / 118** exit 0（**不误红**） |
| E21 | **RA1** 新增 `tests/zz-fix044-coverage-probe.mjs` | **exit 1** `{scanFaceSize:52, anchorFileCount:21, uncoveredFiles:["tests/zz-fix044-coverage-probe.mjs"]}` |
| E22 | **RA2** 移除 `tests/stats.mjs` 条目 | **exit 1** `{scanFaceSize:51, anchorFileCount:20, uncoveredFiles:["tests/stats.mjs"]}` |
| E23 | **RA3** `tests/oauth-promotion.mjs` 失去全部形态②锚 | **exit 1** `{exemptCount:3, deadExempts:["tests/oauth-promotion.mjs"], overlappingExempts:[]}` |
| E24 | **RA4** `tests/served-client.js` 同时登记 + 豁免 | **exit 1** `overlappingExempts:["tests/served-client.js"]`（+ `9h R-1` 与 `9h-4` 各一 FAIL，共 3） |
| E25 | **RA5b** 写回 `ui-conversation :16041-16056` | **exit 1** `{staleHits:["ui-conversation :16041-16056"], missingFresh:[]}` |
| E26 | **RA6** 移除 `SessionStandardProps.useInput` | **exit 1** `{staleHits:[], missingFresh:["SessionStandardProps.useInput"]}` |
| E27 | **RA7** 写回旧 `settings/describe result L4709-4757` | **exit 1** `{staleHits:["settings/describe result L4709-4757"], missingFresh:[]}` |
| E28 | **RA8** 移除 `agentPresets_list_result$schema` 符号 | **exit 1** `{staleHits:[], missingFresh:["_deepseek_ai_dsh_agent_presets_agentPresets_list_result$schema"]}` |
| E29 | **RB1** §四 保留锚 `types/agent.js:297-318` 写入 `stale` | **exit 1** `{staleHits:["types/agent.js:297-318"], missingFresh:[]}` |
| E30 | **恢复一致性** | 6 个受变异/注入文件按 `git cat-file blob` **逐文件 SHA256 复原**（`git hash-object` 与 `rev-parse <rev>:<file>` 三方一致，match=True ×6）；副本基线复跑 **189 exit 0**；`MISMATCH = 0` |
| E31 | 副本临时注入脚本（动态抽取 `ANCHOR_CASES`） | **失败未生效**（guard 内部提前终止宿主进程）⇒ **已弃用**；改用**静态元素解析 + 守卫实跑输出**双路（§二-2.2 / E6/E18），副本文件已按 blob SHA256 **逐字节复原** |

---

## 九、真实环境命令逐条上报（配套规则 R1 / R4）

**隔离三选一**：本审查采用 **(a) 隔离环境** —— 全部**写操作**（10 组变异 + 临时分析脚本）落在 `%TEMP%\fix044rev\`（`robocopy` 全树副本 `copy` / `copybase` + `node_modules` **junction** 只读引用），且每次变异后按 `git hash-object` 与 `rev-parse <rev>:<file>` **三方比对复原**（match=True ×6）。

**仓库工作树零写操作**（唯一例外 = 本报告 `.governance/review-FIX-044-R0-input.md`）。

| # | 命令（摘要） | 退出码 | 影响路径 | 读/写 |
|---|---|---|---|---|
| R1 | `git rev-parse/log/show/status/diff/grep/rev-parse <rev>:<file>/hash-object/cat-file` | 0（`git grep` 无命中时 1） | 仓库 `.git` + 工作树 | **只读** |
| R2 | `node tests/host-abi-health.mjs` / `host-contract.mjs`（仓库内） | 0 / 0 | 仓库工作树 | 只读（守卫自身不改文件） |
| R3 | `node tests/run-all.mjs`（仓库内 ×2） | 0 / 0 | 仓库工作树 | 只读 |
| R4 | `node --check` ×3（仓库内） | 0×3 | 仓库工作树 | 只读 |
| R5 | `robocopy <repo> %TEMP%\fix044rev\{copy,copybase} /E /XD node_modules .git .tmp-research .test-home .router-files` | 1（robocopy 正常码） | `%TEMP%` 副本 | 写（**仓库外**） |
| R6 | `New-Item Junction <copy>\node_modules → <repo>\node_modules` | 0 | `%TEMP%` 副本 | 写（**仓库外**；不改 `node_modules` 内容） |
| R7 | `git cat-file blob <rev>:<file>` 落盘（副本内三文件 ×2 版本） | 0 | `%TEMP%` 副本 | 写（**仓库外**） |
| R8 | 副本内 10 组变异 + `node tests/host-abi-health.mjs`（副本内 ×11 次含基线 ×2） | 0 / 1（预期） | `%TEMP%` 副本 | 变异为**副本内**写；逐次 SHA256 复原 |
| R9 | 临时分析脚本（`census.cjs` / `differ.cjs` / `verify95.cjs` / `elements.cjs` / `slotcnt.cjs` / `skeleton.cjs` / `skeleton2.cjs` / `dumpunits.cjs` / `importcases.mjs`）创建与执行 | 0 | `%TEMP%\fix044rev\` | 写（**仓库外**） |
| R10 | 宿主只读实读：`@deepseek-ai\dsh-api-remotes\lib\client.js`（329870 B）、`@deepseek-ai\dsh-client-ui-conversation\**`（全树递归 `Select-String`） | 0 | 宿主安装目录 `…\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\**` | **只读、零写入** |
| R11 | 仓库内只读枚举 `lib/**`、`tests/**`（`Get-ChildItem -Recurse` + `ReadAllText`，用于 9h-5 面独立重实现） | 0 | 仓库 `lib/`、`tests/` | **只读、零写入** |

**汇总**：`$HOME` 配置目录写 = **0** ✅ · `$DSH_HOME` 接触 = **0** ✅ · 安装/验收操作 = **0** ✅ · 仓库内写 = **1**（本报告）✅ · **HEAD 不变** ✅ · **三锁面 vs HEAD diff = 0** ✅ · 副本 SHA 复原 MISMATCH = **0** ✅。

**破坏性红线**：未对用户 HOME 下任何配置目录执行删除/清空/重建/移动；未触及 `$DSH_HOME`；仓库外写操作**全部**限于 `%TEMP%\fix044rev\`（新建的审查用临时目录）；本题面（测试守卫文本 + 登记数据）**不涉及**安装/验收 ⇒ **配套规则 R1 三选一已按 (a) 隔离环境满足**，措辞不使用「真实安装/真实环境」。

---

## 十、未验证项（如实登记，**不作为通过依据**）

| # | 未验证内容 | 原因 | 级别/影响 |
|---|---|---|---|
| 1 | 本 commit **提交前**的 Developer 会话内只读接触面（`robocopy`、8 组变异、分析脚本等）逐条实况 | 本审查**无其会话记录** ⇒ 未复核（配套规则 R4 的义务主体 = 执行者；本报告仅登记**本人**接触面，§九） | 未验证（**不作为通过依据**） |
| 2 | 9h-5b `overlappingExempts` 的**单变量**判红 | §四 P3-3：RA4 为多变量案（同时触发 9h R-1 / 9h-4）；判别力已由 detail 逐字证明 | **P3-3**（非阻塞） |
| 3 | 扫描面 `.ts/.tsx/.sh/.ps1` 面（若存在）的入表完备性 | §四 P3-2：形态正则含该扩展名但扫描面不含；当前 `lib/`+`tests/` 内此类文件 **0 个** ⇒ 无实例可验 | **P3-2**（潜在漏面，无当前缺陷） |
| 4 | `tests/metrics.mjs` 条目与 `lib/prestep.js` 条目的 `.tmp-research/dsh-vision-router` 对象（含上游同源性） | 该副本**在仓库路径内、版本控制外**（`.gitignore:16`）；守卫不可机器核验该对象（载体 §五 已如实登记） | 现有如实登记；**不作为通过依据** |
| 5 | 11 个细分 `$schema` 符号的**宿主对象面**（非文本在位）机器核验 | 用户/开发者已如实声明「本批未新增宿主侧核验」；本审查仅核验**宿主文本在位**（17/17）与**在仓文本在位** | 与声明一致；**不作为通过依据** |
| 6 | CI 侧 `#SKIP` 实时值 | 无 CI 访问权限；本报告 skip 结论限于本地 Windows 口径 `#SKIP 2`（本审查 ×2 复现） | 本地口径；非阻塞 |
| 7 | 任务描述中「第四文件」/「+109−5 算术」的实际归属 | 任务描述的文件↔数字配对与实测不符（§二-2.1 已勘正）；三数字对**算术自洽**、**无第四文件**（`--name-only` 恰 3） | **描述层笔误**（已勘正；无代码面影响） |

---

## 十一、审查结论

# **APPROVED_WITH_NOTES**

```
unresolved_blockers=0
```

**理由**：P0 = **0**、P1 = **0**、P2 = **0**、P3 = **3**；5 维度全覆盖且各有结论（§三）；每条发现标级别且带可复查事实（§四）；设计一致性检查已完成（载体 §三 八项 + §四 + §五 逐条，§六）；AI 专项 5 项逐一有结论（§三-3.2）。

**实质依据（八项硬要求逐项闭合）**：

1. **① 入表完备性机器化（本批价值最高项）——成立**：9h-5 / 9h-5b 判据**非恒真**（独立 4 案判红，detail 精确）、**不误红**（51 / 20 / [] 逐数复现）、**限制声明逐条如实**（文件级 / 三正则盲区 / 豁免表人工面且明说「不判理由实质充分性」/ 面外不覆盖）；扫描面枚举独立重实现得 51 项 + 20 含锚项，**逐项列出核验无漏无多**；**R5 P3-2 与 R4 P3-5 同族面实质闭合**。
2. **② notes 收口——成立**：`lib/prestep.js` 条目「理由全集三处」**逐条可核验**（`host-contract.mjs:335-343` **恰 9 行** ✓ / `fix-029:21-26` 行内 ✓ / 本文件 notes ✓）；fix-029 条目去冗余后**无信息丢失**；R5 P3-3 闭合。
3. **③ L#### 逐 schema 重建——反幻觉 17/17 + 更正成立**：17 个 `$schema` 常量标识符**逐字在位**（三类面全覆盖）；三项漂移主张**逐条实读成立**（describe 起界错位 3 行 ✓ / llm 面实为 parameters 段 ✓ / `L5774-5778` 实为 `sourceLocation` ✓）；**`hasDocument` 归属更正成立**（宿主 `settings_describe_result:4712-4714` 含该字段、`agentPresets_list_result:4315-4325` = `presets`+`authorable`、`host-contract.mjs:417` 白名单 `['presets','authorable']` 三方一致）；**「17 中 6 覆盖 / 11 不声称」边界精确**（6+11=17）。**R5 未闭合①闭合**。
4. **④ 归属定位改指——证据充分**：`PropsHooks` 全包 **0 命中** ✓；`:16041-16056` = InputBar JSX ✓；两个替代面（`:16593` provide 装配点 + `slots.d.ts:245` `useInput`）**逐位在位** ✓；批 F 判定**保留未掩盖**；旧形态入 `stale` ⇒ RA5b 实测再引入判红 ✓。**R5 未闭合②闭合**。
5. **骨架口径可复算（R5 P3-1 教训）——闭合**：按书面 4 条口径独立复现三文件骨架（71876 / 10204 / 40314→42382）、字符串多重集（0/0 · 0/0 · **+61/−5**）、代码行（1616/1616 · 306/306 · 911→952 **0 删 41 增**）及 CRLF 原始字节（三对逐数一致）；41 条新增代码行**逐行核到新判据块**。
6. **门控——独立绿**：`run-all` **exit 0 ×2**（25.4s / 26.5s）、`ALL 20 SUITES + 4 RUNNER MODULES PASSED`、`#SKIP 2`；`host-contract` **118**、`host-abi-health` **187 → 189**（**+2 构成经受控基线对照独立证明：基线树 187，item 35 与 note 16 均不变**）；`node --check` ×3 exit 0。
7. **越界与纪律——零缺陷**：恰 3 文件、A/D = 0/0、零 `lib/**`、零 `host-contract.mjs`、零 `served-client.js`、零 `.governance/**`、零 README/package.json/docs；§四 三处保留锚**确未入 stale**（0/0/0）且**入则判红**（RB1）；9h-4 纪律零自碰撞。
8. **AI 专项 5 项**：mock 0 · 硬编码返回值 0（判据均绑定真实计算量，4 案反向实证）· 幻觉符号 0（17/17 实读）· 未实现 TODO 0 · 过度实现 0（41 增 0 删，两文件纯注释）。

**遗留项（P3，不阻塞，可随后续批次顺带处理）**：

1. **P3-1**：commit message §④ 的「（与 `lib/client.js` 条目同形登记）」易读为 `lib/client.js` 条目在本批被改（实际该串在基线已在其内、本批零变化；同批 §③ 表述正确）⇒ 建议补「`lib/client.js` 条目已在批 C/D 登记同串，本批零变化」。
2. **P3-2**：`ANCHOR_COVERAGE_FORMS[0]` 扩展名集（`.js/.mjs/.ts/.tsx/.sh/.ps1`）⊃ `ANCHOR_COVERAGE_EXTS`（`.js/.mjs/.cjs`）⇒ 建议对齐两者，或在注释显式声明「面内仅收录 JS 系扩展名」（当前 `lib/`+`tests/` 无此类文件 ⇒ 潜在、无实例）。
3. **P3-3**：`overlappingExempts` 缺单变量判红实证（RA4 为多变量案；detail 已直接证明判别力）⇒ 建议后续补一例「仅加匹配型登记单元」的单变量案。

**⑤⑥⑦ 登记面（Coordinator 面，Developer 已如实声明未处理，本审查确认 3 文件 diff 内无对应改动）**：commit message 数字纠错句 / `.test-home` 快照时点标注 / 「25 单元」自我更正留痕。

**GOV-009（治理钩子边界）独立确认**：`is_product_code()` 白名单**不含** `tests/**` ⇒ 本批 3 文件均判**非产品代码** ⇒ Step 7/10–14 未触发；`post-commit` 的 `M7.4 VIOLATION: … has NO evidence` 处于该分支 ⇒ Developer 的「已通过 hooks 但**非因有评审证据**、未自行宣告通过、请 Coordinator 机录证据」声明**属实且纪律正确**。

---

**审查者**：Code Reviewer Agent（只读审查；唯一产出物 = 本文件）
**报告路径**：`.governance/review-FIX-044-R0-input.md`
**下一步**：Coordinator 用 `review-record` 机写 canonical 报告与 REVIEW 证据行（本报告不作为机录替代）；P3 三项建议随后续批次顺带处理，无需本批返工。
