# 代码审查报告 — FIX-043 批 F（末批，R5）

- **Task ID**: FIX-043（批 A ✅R0 · 批 B ✅R1 · 批 E ✅R2 · 批 C ✅R3 · 批 D ✅R4 —— 本次 **批 F ✅R5**）
- **Round**: R5（同任务审查链末轮）
- **审查对象**: commit `355687a6b5f2b34b0134baa25aa8683cb2421b2b`（父 `ce8d908`）
- **审查范围**: `--numstat` = **3 文件 +338/−22**（`tests/host-abi-health.mjs` 317/21、`tests/host-contract.mjs` 15/1、`tests/fix-029-host-contract.mjs` 6/0）——**独立复核一致**（越界 = 0，见 §四）
- **输入载体**: `.governance/fix-043-anchor-cases-requirements.md`（§一/§二/§三/§四/§五）
- **前轮基准**: `review-FIX-043-R2-input.md`（P2-1/P2-2）· `review-FIX-043-R4-input.md`（P2-1 方法学 / P3-5 保护窗口）· `review-FIX-043-R3-input.md`（§二 六项条目录入要求）
- **审查员**: Code Reviewer（只读；唯一写操作 = 本报告 + 仓库外副本变异实验）
- **报告**: `.governance/review-FIX-043-R5-input.md`

**审查结论**: **APPROVED_WITH_NOTES**

```
unresolved_blockers=0
```

---

## 一、执行摘要

| 维度 | 结论 | 关键事实 |
|---|---|---|
| 1 正确性 | **通过**（+3 项 P3 措辞/完整性备注） | 19 条目全部落位且三向自洽：**184/184** stale needle 均「批 C/D 清除前在位 × 现树缺席」，**163/163** fresh 现树在位；保护窗口**独立判红 13/13 + 反向判红 3/3**；R2 P2-1 修复**非装饰性**（对照实证） |
| 2 安全性 | **通过** | 纯注释/登记数据/防御性归一改动，零新增可执行路径；零硬编码密钥（2 处 `secret|token` 命中经逐字核查 = 普通词 `asymmetric`/`token` 语义，非凭据）；零注入面新增；`hostSourceOf` 既有路径逻辑未改 |
| 3 可维护性 | **通过** | 命名清晰、注释解释了「为何保留/为何不改」；登记数据与注释分离；`notes` 字段承载未闭合项；**唯一瑕疵 = 证据行「骨架逐字节」措辞与实测口径不符（P3-1）** |
| 4 性能 | **通过** | 新增全部为静态字符串登记；`stale`/`fresh` 判定仍为每条目 O(|needles| × |file|)；无 N+1 / 无 O(n²) 以上；实测测试耗时持平（0.2s / 0.2s，全量 26.5s / 24.6s） |
| 5 测试覆盖 | **通过** | 全量 `tests/run-all.mjs` **×2 exit 0**、`#SKIP 2` 与批 E/D 基线一致；`host-contract` **118**（+0）、`host-abi-health` **178 → 187**（+9 = **恰 9 个新建条目各 1 条 check**，独立计数确认）；新判据均**可达（非恒真）**并已由定向变异实证 |

**硬门槛裁决**：P0 = **0**；5 维度全覆盖 = **100%**；每条发现 100% 标级别；设计一致性检查**已完成**（对照载体 §一/§二/§三/§四 逐项，见 §三）；AI 专项 5 项**逐一有结论**（见 §二-6）。

| 级别 | 计数 | 内容 |
|---|---|---|
| P0 阻塞 | **0** | —— |
| P1 关键 | **0** | —— |
| P2 建议 | **0** | —— |
| P3 讨论 | **3** | P3-1 证据行「骨架逐字节相同」口径与实测不符（结论经更强判据为真）；P3-2 保护窗口覆盖完整性缺机器看护（人工核验面）；P3-3 两处 `notes` 文字误差 |

---

## 二、五维度逐项结论

### 1. 正确性

**1.1 条目落地面（独立复算，载体 §一/§二 逐条核对）**

以自写解析器（注释/字符串感知括号匹配 + 拼接常量求值）在**仓库外副本**独立提取 `ANCHOR_CASES`：

| 时点 | 条目 | stale | fresh | notes |
|---|---|---|---|---|
| `ce8d908`（批前树） | **26** | **114** | **105** | **1** |
| `355687a`（本批工作树） | **35** | **184** | **163** | **16** |
| Δ | **+9** | **+70** | **+58** | **+15** |

⇒ Developer 声称 **26→35 / 114→184 / 105→163 / Δstale +70 / Δfresh +58 / notes +15** **逐数复现**。

**新增 9 条目文件集**（集合差，独立复算）：
`lib/index.js` · `lib/prestep.js` · `lib/oauth-credentials.js` · `lib/host-abi/client-remotes.js` · `tests/fix-029-host-contract.mjs` · `tests/oauth-main-model.mjs` · `tests/adapter-parity.mjs` · `tests/fix-010-gui-fidelity.mjs` · `tests/run-all.mjs` = **lib 4 新建 + tests 5 新建**，与声称一致；**扩面 6 + 4 = 10**，与声称一致。**19 条目 19/19 落位，零缺失、零余出。**

**1.2 三向核验（本审查独立口径 = 以 `813c4a9`/批 C/D 清除前状态为「在位」基准）**

- **stale 184/184**：每一条在**其登记文件**中「清除前在位 × 现树缺席」——复核方式 = 逐条在现树 `!includes(needle)` 且在该锚的**批 C/D 清除前时点**存在（对 `lib/index.js` 三条特别复核：`813c4a9` 全部在位、`2ea0bc9`/`ce8d908`/`355687a` 全部缺席，源 `lib/index.js:84/86/90` 三处注释锚）。
- **fresh 163/163**：现树在位（逐条 `includes` 实测）。
- 静默失效面扫描：**0**（无 stale 仍残留者、无 fresh 缺失者）。

**1.3 保护窗口闭合（本批核心——仓库外副本独立复现，非采信 18/18）**

环境 = `%TEMP%\fix043r5\fix043r5P\router`（`robocopy` 全树 1324 文件 + `node_modules` junction，未触仓库）；基线 `host-contract` **118 exit 0**、`host-abi-health` **187 exit 0**（**不误红** ✅）。

| 案 | 变异（写回批 C/D 清除锚） | 结果 | detail |
|---|---|---|---|
| MA1 | `lib/client.js` ← `（generation 守卫，宿主 :47/:53）` | **exit 1** ✅ | `{"staleHits":["（generation 守卫，宿主 :47/:53）"],"missingFresh":[]}` **+ 镜像 parity 同批判红**（双层） |
| MA2 | `lib/index.js` ← `lib/attachments.js:38` | **exit 1** ✅ | `staleHits:["lib/attachments.js:38"]` |
| MA3 | `lib/prestep.js` ← `index.js:4832-4835` | **exit 1** ✅ | `staleHits:["index.js:4832-4835"]` |
| MA4 | `lib/host-abi/client-remotes.js` ← `settings-models lib/client.js:889-911` | **exit 1** ✅ | 命中 |
| MA5 | `lib/wrapper.js` ← `默认语义 :1645` | **exit 1** ✅ | 命中 |
| MA6 | `lib/host-route.js` ← `dsh-settings lib/index.js:430-436` | **exit 1** ✅ | 命中 |
| MA7 | `tests/run-all.mjs` ← `host-contract.mjs:96-99` | **exit 1** ✅ | 命中 |
| MA8 | `tests/adapter-parity.mjs` ← `宿主注释 :1639` | **exit 1** ✅ | 命中 |
| MA9 | `tests/client-render.mjs` ← `L581 waitingFor` | **exit 1** ✅ | 命中 |
| MA10 | `tests/metrics.mjs` ← `index.js:4832-4835` | **exit 1** ✅ | 命中 |
| MA11 | `tests/smoke.mjs` ← `textOnlyImageText :541-543` | **exit 1** ✅ | 命中 |
| MA12 | `tests/oauth-main-model.mjs` ← `dsh-system-prompt lib/index.js:254-258` | **exit 1** ✅ | 命中 |
| MA13 | `tests/fix-010-gui-fidelity.mjs` ← `lib/index.js:554）→ GUI 渲染标记文本` | **exit 1** ✅ | 命中 |

⇒ **lib 面 6/6 + tests 面 7/7 = 13/13 独立判红**；**R4 P3-5 的保护窗口（收敛后无 stale 看护）已实质闭合**，且不是「只覆盖清单」的空判据。

**1.4 保留锚禁令反向实证（§四）**

| 案 | 变异 | 结果 |
|---|---|---|
| MB1 | `lib/prestep.js` stale += `types/agent.js:297-318` | **exit 1** ✅ `staleHits:["types/agent.js:297-318"]` |
| MB2 | `lib/service.js` stale += `dsh-host-apiproxy lib/index.js:1010-1054` | **exit 1** ✅ 命中 |
| MB3 | `lib/service.js` stale += 裸 `:2582-2594` | **exit 1** ✅ 命中 |

⇒ 载体 §四「MUST NOT 入 stale（入表即红）」**有机器判据支撑、无缺口**；现树两处保留锚 `types/agent.js:297-318` **确不在任何 stale**（独立 grep 确认）且**三处在位**（`tests/host-contract.mjs` / `tests/fix-029-host-contract.mjs` / `lib/prestep.js`）。

**1.5 R2 P2-1 修复核验（对照法——非装饰性裁定）**

| 案 | 形态 | exit | TypeError（真崩栈） | 汇总行 | 其后断言 |
|---|---|---|---|---|---|
| **MC1** | 省略 `expectSymbolHost` + **批 F 修复在位** | **1** | **无** ✅ | `1 FAILURE(S) (117 passed)` ✅ | **15 条后续断言仍执行**（含「宿主包×文件存在」「宿主符号逐字在位」「消费命中非空」全 ok）✅ |
| **MC2** | 省字段 + **还原批 E 形态**（`anchorCase.expectSymbolHost.flatMap`） | 1 | **有** `Cannot read properties of undefined (reading 'flatMap')` ✅ | **无汇总行**（崩栈截断）✅ | 仅 20 ok 行后中断 |

**:117/118**；MC1 = `117 passed / 1 FAIL`，合计 **118**，与基线同数）；`declarationGaps:["expectSymbolHost"]` 正常打印。

⇒ **裁定：修复非装饰性**（MC1 vs MC2 对照结论与声称一致）。

**fail-open 专项（新增判据可放宽面探测）**：

| 案 | 形态 | exit | TypeError | 判据 |
|---|---|---|---|---|
| ME1 | 省略 `expectSymbolHost` | **1** ✅ | 无 | `declarationGaps:["expectSymbolHost"]`（`symbolHostGapsOf` 对偶完备性判据仍红） |
| ME2 | 畸形 `expectSymbolHost: 'MALFORMED'` | **1** ✅ | 无 | 同上 —— `Array.isArray` 兜底**未**把「字段缺失/畸形」从判红变为放行 |

⇒ **无新增 fail-open**：`tests/host-contract.mjs:161-174` 的 `symbolHostGapsOf` 是**独立于** `:636` 消费侧的对偶判据（`!Array.isArray \|\| length===0 \|\| 条目畸形` ⇒ 红），`:636-637` 的归一**只**承担「不崩栈 + 诊断完整」的 P8 义务，不承担判别。逻辑分工正确。

**1.6 fresh 侧非恒真（M-D）**：移除 `tests/run-all.mjs` 的 `` `stripComments` 同法 `` ⇒ **exit 1**（`missingFresh` 判红）⇒ fresh 侧**非恒真** ✅。

**1.7 9h-4 系列自碰撞纪律（本批新增 70 stale / 58 fresh）**

以**独立复现**的 9h-4 / 9h-4b / 9h-4c 实现（逐元素字面量值解析，含注释/字符串感知扫描器）核算：

- `staleUnitCount === ANCHOR_CASES.length` = **35 / 35** ✅（独立解析器与守卫同值；`stale: [` 连续出现次数亦为 **35**）
- **needleRepetitions = 0** ✅（184 条 needle 全部 `inGuard === registered`）⇒ **零自碰撞 / 零死 needle**
- **selfLiteralNeedles = 0** ✅（自条目 needle 仍为拼接常量编码）
- 可达性实证（非恒真）：① 把**已登记** needle 重复写入另一 `stale[]` 单元 ⇒ **exit 1**、detail 报 `「preset-defaults.js:163」登记 1 处 / 守卫内 2 处`；② 把 needle 逐字写入守卫散文（注释）⇒ **exit 1**、报 `「textOnlyImageText :541-543」登记 1 处 / 守卫内 2 处` ✅
- **已如实登记的口径边界（非本批缺陷，予以确认）**：拼接常量形态的 needle（如 `OLD_PRESETDIAG_LINE_ANCHOR`）**不参与** 9h-4（守卫内 0 次连续出现 ⇒ `inGuard(0) > registered(0)` 恒假）；其看护由 9h-4b（自条目 `inGuard === 0`）承担——此为本批**沿用**的既有设计口径，非本批退化。

**1.8 amend 核验（`fd20066` → `355687a`）**

- **可达且成立**：两 commit **tree hash 逐字相同** = `3bd6caa342bb5794e336c69817a7f6256efb271f`；三文件 blob hash 逐一相同（`1f0de264…` / `a0aa5acb…` / `61c17168…`）；`reflog` 两条记录指向 `fd20066`（`refs/heads/main@{1}` / `HEAD@{1}`），父 commit 均为 `ce8d908`。
- ⇒ 「工作树内容两次提交**逐字节相同**」声称 **✅ 已独立核验为真**（强于「尽力核验」）。
- commit message 数字 **70 / 58 / 184 / 163 / 35 / 35/35 / 118 / 187** 与实测逐数一致；**无残留 44/41 估计值**。

**1.9 断言增量构成（+9 的构成核验）**

`187 − 178 = +9` 恰等于 **9 个新建条目的 `9h R-1` item-check 数**。独立计数（以 `9h-R1: ` 标签行的**前缀**区分）：
- **item-check（`ok  B5 9h R-1: <file> 清单所列旧式锚零残留…`）= 35**（现树，每条目恰 1 条；基线同口径 = **26**）⇒ **26 → 35 = +9**，且新增 9 条与 9 个新建条目**一一对应**；扩面 10 条目的 item-count 不变。
- **`note` 行 = 16**（本批新增 15 = `notes` 在仓登记），**hygiene 3 项（9h-4 / 9h-4b / 9h-4c）不变**。
⇒ **+9 的构成 = 「9 个新建条目各 1 条 check」✅ 成立**（`178 → 187` 的增量**全部**来自 item 级新增，无其它来源）。

**1.10 未闭合项在仓登记（§五 / §三-6）**：在仓 `notes` 实测 **16** 条（+15），覆盖 ① `client-render` 的 `L####` wire-schema 漂移（2 条）② `dsh-client-ui-conversation :16041-16056`（2 处登记 = `notes` + `tests/fix-029-host-contract.mjs:19-24` 行内判定注释，**跨文件同步形态已落地**）③ `metrics.mjs` 的 `.tmp-research` 不可机器核验限制（**如实标注，未掩盖** ✅，且措辞已按 R4 P3-5 附注改为「在仓库路径内、版本控制外」）④ `lib/prestep.js` 的 `types/agent.js:297-318` 保留（2 条）。

---

### 2. 安全性

| # | 检查项 | 结论 |
|---|---|---|
| 1 | 输入校验 | **无新增外部输入面**。改动 = 注释 / 登记数据 / 防御性归一。`:636` 归一后新增 `entry?.symbols` 类型守（含 `?.`），**使**畸形数据不再击穿诊断面（安全向） |
| 2 | 注入防护 | **无新增**。全量 diff 新增 335 行零 `eval(` / `new Function` / `execSync` / `spawnSync` / `child_process`；判定仍为 `String.includes` |
| 3 | 敏感数据 | **零硬编码凭据**。模式扫描 2 处命中经逐字核查 = 词 `token`（注释中的「文件名 token」启发式）与 `asymmetric` 类普通词，**非密钥** |
| 4 | 权限检查 | 不适用（测试守卫，无权限面）；宿主读取路径 `join(root, pkg, file)` 未改，仍为只读 `readFileSync` |

**AI 代码专项 5 项（逐一）**：**mock 残留 = 0**（新增行零 `mock|stub|fake|dummy`）；**硬编码返回值 = 0**（新增行无返回值/无 stub）；**幻觉 API/符号 = 0**（fresh 侧 163 条锚均为在仓/宿主实读串，本审查逐条 `includes` 复现；宿主面锚的证明由既有 `hostSourceOf` 只读实读路径承担，未新增未实证符号）；**未实现 TODO = 0**（新增行零 `TODO|FIXME|XXX|HACK`）；**过度实现 = 0**（无顺带重构、无新增文件、无跨面扩权）。`node --check` ×3 **exit 0**。

---

### 3. 可维护性

- **命名/结构**：新增条目统一 `{file, stale, fresh, notes}` 同构；注释区分「未闭合 / 保留 / 双归属 / 对象参考面限制」四类，**读者可辨**。
- **注释质量（本批最显著正向）**：`:270` 保留项**同时**落仓三处（`host-contract.mjs` 行内 9 行理由 + `host-abi-health.mjs` 该条目 `notes` + `fix-029` 头部行内判定注释），并写明「先改判据再改锚」的收敛顺序——**不依赖会话记忆**。
- **表述精度（P3-1）**：commit message 第 8 项称 `host-abi-health.mjs` 骨架「**15985 = 15985 逐字节相同**」，本人**未能复现**该数字与「逐字节相同」形态（六种口径实测：`rawBytes` 129926→151443、去注释 80056→89805、字符串置空 40991→42204、去空白 33653→34086、去字符串 32215→32576，**无一为 15985**）。**但**独立以更强判据证明其实质结论为真：**该文件「数据数组与注释之外」的逐行代码序列 = 956 → 956 行，改动集合恰 1 行且仅为 `check(` 首参标签位（F-3 用例），条件部分 `===` 逐字相同**。⇒ 结论真、证据行口径不可复算 → **P3-1（非阻塞）**。
- **注释超宣示（no-overclaim）**：**显著改善**。R2 P2-2 点名的「宿主靶子不可稳定符号化」总括断言已删除，改为**逐处标注式**（`tests/host-abi-health.mjs:964-981`，5 行 / 7 token 各带判定结论与证据引用），并**明确写出「已删除原总括断言」**与删除理由（自相矛盾）⇒ 属**主动自曝**。
- **函数长度/重复**：无新增函数；同对象跨文件重复登记（`types/agent.js:297-318`、宿主 `LlmAdapter :1645/:1996-1998`）**均附理由**（P5 同对象不因文件而异 + 双消费面），非无理由复制。

---

### 4. 性能

- 新增均为静态数据；`ANCHOR_CASES` 从 26 → 35 条目，判定复杂度 O(条目 × needle 数 × 文件长度)，**同一量级**；无新增循环嵌套、无 I/O 合并问题（每条目 1 次 `readFileSync`，既有形态）。
- 实测：`host-contract` 0.2s / `host-abi-health` 0.2s；`run-all` **26.5s（本审查）· 24.6s（本审查二跑）** vs Developer 27.2s / 26.7s —— **同量级、零回退**。

---

### 5. 测试覆盖

| # | 检查项 | 结论 |
|---|---|---|
| 1 | 核心路径有测试 | **有**：19 条目的 stale/fresh 双向判据 + 3 项 hygiene（9h-4/4b/4c） |
| 2 | 边界测试 | **有**：字段省略（MC1/ME1）、字段畸形（ME2）、锚写回（MA1-13）、保留锚入表（MB1-3）、fresh 移除（MD1） |
| 3 | 错误路径测试 | **有**：fail-closed 实证（exit 1 + 结构化 detail），且**诊断完整不崩栈**（MC1 15 条后续断言仍执行） |
| 4 | 覆盖率达标 | 门控全绿：`run-all` **×2 exit 0**，`ALL 20 SUITES + 4 RUNNER MODULES (via smoke.mjs) PASSED`，**`#SKIP 2 (smoke.mjs×2)`**（与批 E/D 基线一致，非本批引入）；`host-contract` **118**（+0）、`host-abi-health` **187**（178+9） |

---

## 三、载体落地完整性裁定（§一/§二 逐条）

**裁定：19/19 文件级条目全部落地，零缺失。**

| 载体条目 | 要求 | 实测 | 裁定 |
|---|---|---|---|
| §一 A `lib/client.js` | 扩充（20/17 → 25/25） | 现树 **25 stale / 20 fresh**（+5/+3）✅ | 落地（载体「25/25」为 stale/fresh 目标值，实测 fresh=20 系按 R3 ① 合并同对象多站点所致，见 A 行 `notes` 前 6 条 fresh 值逐条在位） |
| §一 B `lib/oauth-llm.js` | 扩充 | +7/+4 ✅ | 落地 |
| §一 C `lib/index.js` | **新建** | 3/3 ✅ | 落地 |
| §一 D `lib/prestep.js` | **新建** | 2/2 + 2 notes ✅ | 落地 |
| §一 E `lib/oauth-credentials.js` | **新建** | 2/2 + 1 note ✅ | 落地 |
| §一 F `lib/host-abi/client-remotes.js` | **新建** | 2/2 + 1 note ✅ | 落地 |
| §一 G `lib/host-route.js` | 扩充 | +2/+2 ✅ | 落地 |
| §一 H `lib/host-abi/events.js` | 扩充 | +2/+2 ✅ | 落地 |
| §一 I `lib/wrapper.js` | 扩充 | +4/+1 ✅ | 落地 |
| §一 J `lib/service.js` | 扩充（无 stale 新增） | stale +0 / fresh +1（登记句）✅ | 落地 |
| §二 9 文件 | 5 新建 + 4 扩面 | 新建 `fix-029`/`oauth-main-model`/`adapter-parity`/`fix-010`/`run-all`（2/2、2/2、13/10、1/1、1/1）；扩面 `client-render`(+13/+10)、`fix-012`(+4/+4)、`smoke`(+4/+5)、`metrics`(+1/+1) ✅ | 落地 |
| §三-1 R2 P2-1 | 补防御 + 构造性实证 | `:636-637` 归一 + MC1/MC2 对照 ✅ | **闭合** |
| §三-2 R2 P2-2 | 删总括断言 + 逐处标注 + 刷数字 | `git grep 不可稳定符号化` **= 0**（本人对**全部 tracked 非 `.governance` 文件**独立复核亦 **0**）；③ 族 5 行 / 7 token 逐处判定 + 双口径数字 ✅ | **闭合** |
| §三-3 保护窗口 | §一+§二 全文件建/扩 stale | 19 文件覆盖；13 案独立判红 ✅ | **闭合** |
| §三-4 R3 六项 | ①…⑥ | 见下表 | **闭合** |
| §三-5 宽口径裸锚 | 逐处收敛 | 2 处无归属收敛（F-3 标签、`lib/oauth-llm.js` 常量行）；计数 53 行/101 处自报（口径声明「随文本变化、不得作长期基线」）✅ | 闭合（自报计数未逐数复算，见 §六） |
| §三-6 未闭合 2 项 | 在仓登记 | `notes` 双登记 + `fix-029` 行内注释 ✅ | **闭合** |
| §三-7 `:270` | 逐处判定或维持保留 + 理由 | **维持保留**，两处理由落仓 + 机器锁 2 / P5 锁 1 描述与实际结构一致（`types/agent.js:297-318` 三处在位）✅ | **闭合** |
| §三-8 骨架判据 | 含骨架逐字节判据 | 提供了骨架/census 证据；**数字口径不可复算**（→ P3-1），实质结论经本审查更强判据证明为真 | 部分（P3-1） |
| §四 保留锚 | MUST NOT 入 stale | 独立确认 + MB1-3 反向判红 ✅ | **闭合** |
| §五 未验证限制 | 如实标注 | `.tmp-research` 限制如实标注且措辞已修正 ✅ | **闭合** |

**R3 六项逐项裁定**：① 裸锚带同句上下文——**基本达成**（`（同表 :21，凭据引用变化转发事件）`、`声明门控，:313-314/:342`、`:721-729，图片块逐个替换为` 等 16 类带上下文形态）；**残留 3 条**为**载体原文即裸括注**、且已由相邻 `fresh` 串锚定唯一对象的形态（`（:1996-1998）` / `（:2596-2630）` / `（:2749-2760）`）——本人实测这 3 条在**守卫全文件内均只出现 1 次**（即其登记处），**不产生歧义、不产生自碰撞**，故判**可接受**（登记为备注，非 finding）。② §四 保留锚不入 stale ✅（MB1-3）。③ 镜像侧不重复登记 ✅（0 处 `served-client.js` 登记；镜像字节恒等判据在位且 `lib/client.js == tests/served-client.js` **实测 true**；MA1 亦实证镜像判据独立判红）。④ R2 P2-2 收口 ✅。⑤ 数字按引用时点重跑 ✅（双口径逐数复现，见 §五）。⑥ 跨文件同锚同步 ✅（`tests/fix-029-host-contract.mjs:19-24` 行内判定注释，判定与 `lib/client.js` 侧一致；`notes` 双登记）。

---

## 四、越界核验（范围纯净性）

- `git show --name-only 355687a` = **恰 3 文件**（`tests/fix-029-host-contract.mjs` / `tests/host-abi-health.mjs` / `tests/host-contract.mjs`）。
- **零** `lib/**`、**零**其它 `tests/*`、**零** `.governance/**`、**零**新建（`git show --diff-filter=A` 无 A 项；numstat 无新路径）。
- 工作树 vs HEAD：三个锁面文件 **`git diff HEAD` 为空**（逐字节等于提交态）；仓库内**非 `.governance` 文件零修改、零未跟踪**（本审查新写入 1 处即本报告；评审期间另建的 `tests/.r5tmp-baseguard.mjs` 已即时删除并复核 `git status` 无残留）。
- Agent 锁面遵守：**未修改** `agent-locks-acquire` 登记的 3 文件。

---

## 五、⑥ 段落双口径数字逐数复现（R2 P2-2 核心）

**口径 a**（`git grep -oE 'lib/client\.js:[0-9]+(-[0-9]+)?' -- lib/client.js`，匹配次数）：

| 时点 | 实测 | 声称 |
|---|---|---|
| `6bc3841` | **9** | 9 ✅ |
| `175d3e1` / `813c4a9` | **8** / **8** | 8 ✅ |
| `cfe7756`（批 B 后） | **0** | 0 ✅ |
| `2ea0bc9`（批 C 后） | **0** | 0 ✅ |
| 工作树 `355687a` | **0** | 0 ✅ |

**口径 b**（FIX-041 R0 F-3 三形态 matchAll，匹配次数）：

| 时点 | ① | ② | ③ | 合计 | 声称 |
|---|---|---|---|---|---|
| `813c4a9` | **12** | **17** | **11** | **40** | 40〔12/17/11〕✅ |
| `cfe7756` | **0** | **17** | **7** | **24** | 24〔0/17/7〕✅ |
| `2ea0bc9` | **0** | **17** | **0** | **17** | 17〔0/17/0〕✅ |

**行数口径**：② 行数 = **9 / 9 / 9**（三时点不变 ✅）；整体行数 = **29 → 14 → 9** ✅（①+②+③ 行数 12+9+8、0+9+5、0+9+0）。

**③ 族逐处标注证据属实性（抽查宿主/在仓只读实读）**：以 `cfe7756:lib/client.js` 实读逐行比对，5 处判定**逐字成立**——
`L2138` = `// （同表 :21，凭据引用变化转发事件）。`（→ 判定「准确」）· `L4310` 含 `ui-conversation :16041-16056）`（→「不准」）· `L5453` 含 `，:313-314/:342）`（→「准确」）· `L5561` = `// （generation 守卫，宿主 :47/:53）、从 session.models 重拉并写 store`（→「漂移」）· `L5562` = `// 快照，composer 模型选择器经 uSES 订阅该 store（宿主 :292）→ load 完成`（→「不准」）。**5 行 / 7 token** 计数与实测一致（③ 父组 5 行、token = 1+1+2+2+1 = 7）。

**替换式 fresh 在位复核（载体 §一 A 追加 3 项）**：`其对**同批三命名` / `` `createModelsOperations(ctx)` 绑定的 `` / `（FIX-043 批 C 按 R1 P2-2 裁定取` 全部在位，且**实为带反引号形态**——Developer 的「按实况修正载体字面」声称 **✅ 属实**。

---

## 六、发现清单

### P3-1（讨论）证据行「骨架逐字节相同」口径与实测不符——结论真、证据不可复算
- **位置**：`355687a` commit message 第 8 项（「`host-abi-health.mjs` 骨架 **15985 = 15985 逐字节相同**」「`host-contract.mjs` 骨架唯一差异 = P2-1 两行」「`tests/fix-029-host-contract.mjs` 骨架相同、字符串 0 变」）
- **事实依据**：本审查以 6 种口径独立复算，**无一得 15985**（`rawBytes` 129926→151443、去注释 80056→89805、字符串内容置空 40991→42204、去空白 33653→34086、去字符串 32215→32576）；`host-contract` 骨架亦非「0 变」（去空白后 +113 字符）；`fix-029` 骨架去空白后 +12 字符（新增注释的 `//` 标记）。⇒ **声称的数值与「逐字节相同」形态不可复现**。
- **影响**：**不影响判据、不影响门控**。且**实质结论为真且更强**：`host-abi-health.mjs` **数据数组与注释之外**的代码行 = **956 → 956**，改动集合**恰 1 行**且仅为 `check(` 首参标签位（F-3 用例），其**条件部分 `===` 逐字相同**；`host-contract.mjs` 非数据区代码行 = 634 → 635（−1 行 `anchorCase.expectSymbolHost.flatMap(…)`、+2 行 `symbolHostMap` / `.flatMap(…)`，= P2-1 两行）；`fix-029` 非数据区代码行 **307 → 307、移除 0 / 新增 0**。字符串多重集独立复算：`host-abi-health` **+164 / −2**（移除者 = F-3 旧标签 + 旧 `notes` 串）✅、`host-contract` **0 / 0** ✅、`fix-029` **0 / 0** ✅ —— **与声称逐数一致**。
- **修复建议**：把该证据行改为可复算形式，例如「(i) 三文件『数据数组与注释之外』的代码行序列：`host-abi-health` 956=956（改动恰 1 行且为 `check` 标签位）、`host-contract` 634→635（−1/+2 = P2-1 两行）、`fix-029` 307=307；(ii) 字符串多重集 `+164/−2` / `0/0` / `0/0`；(iii) 脚本与口径随附」。**该改进建议仅供后续批次采纳，不要求本批返工**（R4 P2-1 的方法学要求「证据形态含骨架逐字节判据」已实质满足）。

### P3-2（讨论）保护窗口的覆盖完整性仍是人工核验面，缺机器看护
- **位置**：`tests/host-abi-health.mjs:1298-1306`（`ANCHOR_CASES` 循环）
- **事实依据**：本批把 19 文件纳入 `stale` 覆盖（本审查 13 案判红 + 3 案反向判红证实**已闭合**）；但「**某文件是否已被某条目覆盖**」这一元命题**无机器判据**——守卫只判「已登记 needle 零残留」，新增第 20 个文件时仍可被无声漏登（即 R4 P3-5 的同族面，**缩小但未消失**）。
- **影响**：非本批缺陷（本批已交付「消除窗口的最小必要动作」，与 R4 §遗留计划一致）；不影响本批门控。
- **修复建议**：后续批次增设「覆盖清单 = （被清扫文件全集） ⊆ （`ANCHOR_CASES.file` 全集）」的入表完备性判据（与 9h-3 同族、同实现路径），把人工枚举改为机器看护。

### P3-3（讨论）两处 `notes` 文字与在仓事实有轻微偏差
- **位置**：`tests/host-abi-health.mjs` —（a）`lib/prestep.js` 条目 notes 第 1 条：「逐处理由见 `tests/fix-029-host-contract.mjs` 条目的对应 notes」；（b）`tests/fix-029-host-contract.mjs` 条目 notes 第 1 条：「（本文件头部）为**机器锁**」
- **事实依据**：`types/agent.js:297-318` 的收敛理由**实际**落在三处（`tests/host-contract.mjs:335-343` 行内共 9 行 + `host-abi-health.mjs` 该条目 notes + `fix-029:19-24` 行内），即（a）的指向**不完整**（漏指向 `host-contract.mjs` 行内）；而（b）所述「本文件头部」的锚**同时**是 `host-contract.mjs` 的 `extra.signatures` needle 与 `includes()` 对象（**机器锁成立**），且 `fix-029:19-24` 亦已自述。⇒ 两处为**指向不完整/表述冗余**，非事实错误。
- **影响**：无（不影响判据、无歧义到误导程度；三处理由均可从 `notes` + 行内注释交叉还原）。
- **修复建议**：后续顺带把（a）改为「见 `tests/host-contract.mjs` 该 face 行内注释 + 本条目 notes」，或在（b）补一句「理由全集见 `host-contract.mjs:335-343`」。

**无 P0 / P1 / P2 发现。**

---

## 七、证据（命令 + 输出摘要）

**7.1 仓库内（只读 + 门控实跑）**

| # | 命令 | 输出摘要 |
|---|---|---|
| E1 | `git rev-parse HEAD` | `355687a6b5f2b34b0134baa25aa8683cb2421b2b` |
| E2 | `git show --stat 355687a` / `--numstat` | 3 文件 +338/−22 = `6/0` + `317/21` + `15/1` |
| E3 | `git show --name-only 355687a` | 恰 3 文件，零新建 |
| E4 | `git show 355687a`（全 diff 逐行） | 见 §二/§三 逐项 |
| E5 | `node tests/host-contract.mjs` | `ALL HOST CONTRACT GUARD TESTS PASSED (118 assertions)` exit **0** |
| E6 | `node tests/host-abi-health.mjs` | `ALL HOST ABI HEALTH TESTS PASSED (187 assertions)` exit **0**；`ok`=187、`FAIL`=0；`9h R-1` 标签行 51 = **item-check 35**（26→35）+ 16 `note`（本批 +15）；hygiene 3 项不变 |
| E7 | `node tests/run-all.mjs` ×2 | exit **0** / exit **0**（26.5s / 24.6s）`ALL 20 SUITES + 4 RUNNER MODULES (via smoke.mjs) PASSED` `#SKIP 2 (smoke.mjs×2)` |
| E8 | `node --check` ×3 | 三文件 **exit 0** |
| E9 | `git show ce8d908:tests/host-abi-health.mjs > tmp` + `node tmp`（同目录临时副本，运行后删除） | 基线 ok **177** + 1 FAIL（该 FAIL = 该副本以 `ce8d908` 判据读**新** `tests/host-abi-health.mjs` 自条目，属副本伪影）⇒ 断言总数 **178** ⇒ **178 → 187 = +9** ✅ |
| E10 | `git grep '不可稳定符号化'` | `.governance` 外 **0** 命中；全部 tracked 非 `.governance` 文件独立复核亦 **0** |
| E11 | `git status --porcelain` | 非 `.governance` 零修改、零未跟踪 |
| E12 | `git rev-parse fd20066^{tree}` vs `355687a^{tree}` | 均 `3bd6caa342bb…` ⇒ **identical = true**；三文件 blob 逐一相同；`git reflog --all` 命中 `fd20066` 两条 |

**7.2 仓库外副本（`%TEMP%\fix043r5`）**

| # | 命令 | 输出摘要 |
|---|---|---|
| E13 | `robocopy` 全树 + `node_modules` junction | 1324 文件；基线 `health 187 exit 0` / `contract 118 exit 0`（**不误红**） |
| E14 | **M-A ×13**（写回批 C/D 清除锚，lock 面 lib 6 + tests 7） | **exit 1 全数**；detail 报精确 `staleHits`（例 MA1 `{"staleHits":["（generation 守卫，宿主 :47/:53）"],"missingFresh":[]}`；MA1 另触发镜像 parity FAIL） |
| E15 | **M-B ×3**（§四 保留锚写入 stale） | **exit 1 全数**（`types/agent.js:297-318` / `dsh-host-apiproxy lib/index.js:1010-1054` / 裸 `:2582-2594`） |
| E16 | **MC1 / MC2**（省略 `expectSymbolHost` 对照） | MC1：exit 1、**无 TypeError**、`1 FAILURE(S) (117 passed)`、15 条后续断言仍执行、`declarationGaps:["expectSymbolHost"]`；MC2（还原批 E 形态）：`TypeError: Cannot read properties of undefined (reading 'flatMap')`、**无汇总行**、仅 20 ok 行 |
| E17 | **ME1 / ME2**（fail-open 探测） | 省略 / 畸形（`'MALFORMED'`）均 **exit 1、无 TypeError**、双判据同时报 `declarationGaps:["expectSymbolHost"]` |
| E18 | **MD1**（移除 fresh 锚） | **exit 1**（`missingFresh` 判红）⇒ fresh 非恒真 |
| E19 | **9h-4 可达性 ×2** | ① 重复登记已登记 needle ⇒ exit 1（`「preset-defaults.js:163」登记 1 处 / 守卫内 2 处`）；② 散文逐字复述 ⇒ exit 1（`「textOnlyImageText :541-543」登记 1 处 / 守卫内 2 处`） |
| E20 | **独立复现 9h-4c / 9h-4 / 9h-4b** | `staleUnitCount 35 === caseCount 35`；`needleRepetitions 0`；`selfLiteralNeedles 0`；`stale: [` 连续出现 **35** |
| E21 | **独立复现 9h-3**（`ANCHOR_OBJECTS_3` 21 键 × `metrics.mjs`） | `unregistered = 0` |
| E22 | **数组 census 独立复算**（自写解析器 + 常量求值） | `ce8d908` 26/114/105/1 → `355687a` 35/184/163/16；Δ +9/+70/+58/+15 |
| E23 | **三向核验**（184 stale 清除前在位 × 现树缺席；163 fresh 现树在位） | **violations = 0**；`lib/index.js` 三条另经 `813c4a9`/`2ea0bc9`/`ce8d908`/`355687a` 四时点复核 |
| E24 | **口径 a / b / 行数独立复算**（逐时点） | 9→8→0→0（口径 a）；40〔12/17/11〕→24〔0/17/7〕→17〔0/17/0〕；② = 9 不变；行数 29→14→9 |
| E25 | **骨架/代码行/字符串多重集独立复算** | 非数据区代码行 956=956（health）/ 634→635（contract，−1/+2 = P2-1 两行）/ 307=307（fix-029）；字符串多重集 +164/−2、0/0、0/0；**六种骨架口径均无 15985**（→ P3-1） |
| E26 | **恢复一致性** | 15/15 变异文件恢复后与仓库原文件 **SHA256 逐字节相同**，MISMATCH = **0** |
| E27 | **AI 专项扫描**（新增 335 行） | TODO/FIXME/XXX = 0；mock/stub/fake = 0；`console.log` = 0；`eval`/`new Function`/`child_process` = 0；secret 模式 2 命中经逐字核查 = 普通词 |

---

## 八、真实环境命令逐条上报（配套规则 R1 / R4）

**隔离三选一**：本审查采用 **(a) 隔离环境**——全部**写操作**（22 组变异）落在 `%TEMP%\fix043r5\fix043r5P\router`（`robocopy` 全树副本 + `node_modules` **junction** 只读引用），且每次变异后按 SHA256 复原（MISMATCH = 0）。**仓库工作树零写操作**（唯一例外 = 本报告文件）。

**逐条上报**（时间 = 2026-09-13 会话内，+08:00；`$HOME` 配置目录写 = **0**；`$DSH_HOME` 接触 = **0**；安装/验收操作 = **0**）：

| # | 命令（摘要） | 退出码 | 影响路径 | 读/写 |
|---|---|---|---|---|
| R1 | `git rev-parse` / `log` / `show` / `grep` / `status` / `diff` / `reflog` / `rev-parse *^{tree}` | 0（`git grep` 无命中时 1） | 仓库 `.git` + 工作树 | **只读** |
| R2 | `node tests/host-contract.mjs` / `host-abi-health.mjs`（仓库内，各 1 次） | 0 / 0 | 仓库工作树 | 只读（守卫自身不改文件） |
| R3 | `node tests/run-all.mjs`（仓库内 ×2） | 0 / 0 | 仓库工作树 | 只读 |
| R4 | `Copy-Item tests/.r5tmp-baseguard.mjs`（临时）→ `node` → `Remove-Item` | 1（预期 FAIL 伪影） | 仓库 `tests/.r5tmp-baseguard.mjs` | **写后即删**（已复核 `git status` 零残留） |
| R5 | `robocopy <repo> %TEMP%\fix043r5\fix043r5P\router /E /XD node_modules .git .tmp-research .test-home` | 1（robocopy 正常码） | `%TEMP%` 副本 | 写（仓库外） |
| R6 | `New-Item Junction <copy>\node_modules → <repo>\node_modules` | 0 | `%TEMP%` 副本 | 写（仓库外；**不改** `node_modules` 内容） |
| R7 | `node tests/host-abi-health.mjs` / `host-contract.mjs`（**副本内** ×24 组，含 22 组变异 + 基线 ×2） | 0 / 1（预期） | `%TEMP%` 副本 | 只读目标文件；变异为副本内写 |
| R8 | 守卫读取宿主靶子 `…\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\**`（由 `host-contract.mjs` 的 `hostSourceOf` 内部发起） | 0 | 宿主安装目录 | **只读、零写入** |
| R9 | 仓库内只读读取 `.tmp-research\`（仅目录枚举，1 次） | 0 | 仓库 `.tmp-research` | **只读、零写入** |
| R10 | `%TEMP%\fix043r5\`.r5tmp-*` 临时分析脚本创建/执行 | 0 | `%TEMP%` | 写（仓库外，**不清理属正常临时目录使用**） |

**HEAD 不变** ✅（`355687a`）；**非锁面 diff = 0** ✅；**未跟踪非 `.governance` = 0** ✅。

---

## 九、审查结论

# **APPROVED_WITH_NOTES**

```
unresolved_blockers=0
```

**理由**：P0 = 0、P1 = 0、P2 = 0；5 维度全覆盖且各有结论；每条发现标级别且带可复查事实；设计一致性检查完成（对照载体 §一/§二/§三/§四 逐条，19/19 落地）。

**实质依据**：八项硬要求全部闭合——① R2 P2-1 修复经 MC1/MC2 对照证明**非装饰性**且**未引入 fail-open**；② R2 P2-2 全域零命中 + 双口径数字**逐数复现** + 逐处标注证据经实读抽查属实；③ 保护窗口**独立 13/13 判红 + 3/3 反向判红**、基线不误红；④ R3 六项逐项闭合（含跨文件同步与镜像侧去重）；⑤ 宽口径裸锚收敛 2 处 + 四类归属登记、「无归属 = 0」；⑥ 未闭合项与保留项**在仓登记**（`notes` 16 条 + 2 处行内注释）；⑦ `:270` 维持保留且三处理由落仓、机器锁结构描述与实际一致；⑧ 骨架/代码行/字符串多重集证据**经本审查以更强判据独立证明**其结论为真。amend 声称（tree 逐字节相同）**独立核验成立**。

**遗留项（P3，不阻塞，可随后续批次顺带处理）**：
1. **P3-1**：`commit message` 第 8 项的「骨架 15985 = 15985 逐字节相同」等数字不可复算（结论本身经更强判据为真）⇒ 建议改为「非数据区代码行 + 字符串多重集」的可复算口径。
2. **P3-2**：`ANCHOR_CASES` 的**覆盖完整性**（文件 ⊆ 条目）仍为人工核验面 ⇒ 建议后续增设与 9h-3 同族的入表完备性判据。
3. **P3-3**：`lib/prestep.js` 条目 notes 的「逐处理由见 `tests/fix-029-host-contract.mjs` 条目 notes」指向不完整（理由实际同时落在 `host-contract.mjs:335-343` 行内）⇒ 建议补齐指向。

**延续至后续批次的未闭合项（本批已按命令在仓登记，非审查发现）**：`tests/client-render.mjs` 的 `L####` wire-schema 块逐 schema 符号名重建；`dsh-client-ui-conversation :16041-16056` 真实归属定位（**禁改指**，P10-④）；`.test-home/` 快照时点标注（锁外面）。

## 十、未验证项

| # | 未验证内容 | 原因 | 级别/影响 |
|---|---|---|---|
| 1 | `commit message` 第 8 项的「骨架 15985 = 15985 逐字节相同」精确数值与口径 | 六种独立口径均不可复现该数字；Developer 未随附脚本 | **P3-1**（实质结论另经更强判据证明为真） |
| 2 | `tests/metrics.mjs` 条目与 `lib/prestep.js` 条目在 `.tmp-research` 的参考对象（含上游同源性） | 该副本在**仓库路径内、版本控制外**（`.gitignore:16`），宿主装态无 `dsh-vision-router` ⇒ 仓库级守卫**不可机器核验该对象**；本审查只核验了**本仓文本内锚串形态**与 `fresh` 在位 | 已有如实登记（`notes`）；**不作为通过依据** |
| 3 | 载体 §三-5 自报的「53 行 / 101 处」（登记单元内 25/56、单元外 28/45） | 未逐数复算该三形态正则计数（口径本身已声明「随文本增删自动变化、不得作长期基线」，非判据输入） | P3 级备注（不影响结论） |
| 4 | 宿主 `dsh-client-ui-conversation` 的 `PropsHooks` 0 命中 / `:16041-16056` 实为 InputBar JSX 段 | 本审查未直读该宿主包（属批 C 已实读结论 + 本批沿用），仅确认在仓登记与「禁改指」纪律落实 | 未新增验证；**不作为通过依据** |
| 5 | `host-contract.mjs:643` 的 `hostTarget.root` 不可达分支（`note` 跳过） | 本机宿主靶子可达（实测靶子 `_npx/1e7f6d9597241db0`），该分支未被本次执行路径覆盖 | 非本批改动面；既有设计 |
