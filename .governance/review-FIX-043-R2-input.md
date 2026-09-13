# 代码审查报告 — FIX-043 批 E（R2）

- **Task ID**: FIX-043（批 E：守卫自身面自指清扫 + R1 P1-1/P1-2 判据硬化 + R0 P1-3 旁路收口 + R1 P2-1 计数更正 + P3-2/P3-3 顺带）
- **Round**: **R2**（前轮 = `.governance/review-FIX-043-R1.md` / `review-FIX-043-R1-input.md`（批 B，APPROVED_WITH_NOTES / `unresolved_blockers=0`）与 `.governance/review-FIX-043-R0.md` / `review-FIX-043-R0-input.md`（批 A，同终态））
- **轮次语义**: **非 NEEDS_CHANGE 触发的复审**，而是「批 B 通过终态之后、新工作单元（批 E）的新一轮完整审查」。本批被 R1/R0 明确指派收口 R1 **P1-1 / P1-2 / P2-1** 与 R0 **P1-3**，故本报告在常规五维度之外**强制附四项遗留闭合比对表**（§3）。
- **审查对象**: commit `cfe775668d138eaa09eb4d435646c76062b97375`（短号 `cfe7756`；父 = `2d65f6e` = 批 B）
- **审查者**: Code Reviewer Agent（只读；唯一写操作 = 本文件）
- **审查范围（`--numstat` 实测）**: `tests/host-abi-health.mjs` +99/−20、`tests/host-contract.mjs` +110/−28 —— 合计 **2 文件 +209/−48**，与声称逐数吻合（§1.1）
- **审查时间**: 2026-09-13 10:57 – 11:08 +08:00
- **结论**: **APPROVED_WITH_NOTES**
- **unresolved_blockers=0**

---

## 0. 结论与硬门槛裁决

| 硬门槛 | 阈值 | 实测 | 裁决 |
|--------|------|------|------|
| P0 阻塞问题数 | = 0 | **0** | 通过 |
| 5 维度全覆盖 | = 100% | 5/5（§4） | 通过 |
| 每条发现标注级别 | = 100% | 10/10（§6） | 通过 |
| 设计一致性检查 | 已完成 | 已比对 `arch-004-compatibility-design.md` §5.1(a) 与 project-principles P4/P5/P8/P9/P10-④（§7） | 通过 |
| AI 代码专项 5 项 | 全部完成 | 5/5（§5） | 通过 |

**结论 `APPROVED_WITH_NOTES` / `unresolved_blockers=0`**。

- **无 P0、无 P1**；硬门槛全通过。
- **四项被指派的遗留全部闭合**（§3）：R1 P1-1 = **已闭合**；R1 P1-2 = **已闭合**；R0 P1-3 = **已闭合**；R1 P2-1 = **已闭合（计数面）** + **同类残留（理由面）**。
- **两项构造性非恒真证据全部独立复现**（§2.4 / §2.5）：M-B5 同形（三字段省略）与 M-B4 同形（真包真文件 + 捏造符号）在旧树 `exit=0`、新树 `exit=1`。
- **本批最大风险面（自指清零）经三层独立复核落判**：严格口径下守卫内行号式自指 = **0**（§2.2）。判定**不采信** Developer 自曝有盲区的启发式工具，亦**不采信**其「32 行全部非自指」的结论——本审查以逐处语义归属复核独立得出结论，并另行发现其覆盖边界（P2-3）。
- 20 项变异/对照实验全部在**仓库外隔离副本**（`%TEMP%\fix043r2\OLD` = `2d65f6e` 全树、`NEW` = `HEAD` 全树，`node_modules` junction 复用宿主），逐次**字节级复原核验通过**；受审前后仓库工作树零变化（§9）。

> 说明：本批含**判据硬化**（判据强度变化）与**守卫自指清零**两项高风险面，未被降标审查——硬化面的 5 个判别位点逐一构造判红、自指面的三层口径逐一复核。

---

## 1. 独立复算（不采信 Developer 数字）

### 1.1 声称 10 — 越界面 / 规模 【逐数吻合】

| 项 | Developer 声称 | 本审查独立实测 | 裁决 |
|----|---------------|---------------|------|
| 提交文件数 | 2 | `git show --name-only cfe7756` = **2**（`tests/host-abi-health.mjs`、`tests/host-contract.mjs`） | ✅ |
| 行数 | +209/−48 | `--numstat` = `99/20` + `110/28` = **+209/−48** | ✅ |
| 零 `lib/**` | 声称 | `git show --name-only` 含 `lib/` 者 = **0** | ✅ |
| 零其它 `tests/*` | 声称 | 除上述 2 文件外 `tests/` 改动 = **0** | ✅ |
| 零 `.governance/**` | 声称 | 提交面 `.governance/` = **0** | ✅ |
| 零新建文件 | 声称 | 无 `A` 状态项（全部 `M`） | ✅ |

⇒ **未越锁面**（锁面 = 该 2 文件，与 Coordinator 派发一致）。**注意**：R1 时「越锁面」争议源于锁面只含 1 个 tests 文件；本批两文件**均在** Coordinator 声明锁面内，争议不再出现。

### 1.2 声称 1 — 锚计数与「净 +36」更正 【四数逐字吻合，更正属实】

口径（开发者声明原文）= `git grep -nE '([A-Za-z0-9_./-]+\.(js|mjs)):[0-9]+(-[0-9]+)?' -- tests/host-abi-health.mjs`

| 时点 | 行数口径 | 匹配次数口径 | 本审查实测 | 裁决 |
|------|---------|-------------|-----------|------|
| `813c4a9`（批 A） | 34 | 67 | **34 行 / 67 匹配** | ✅ |
| `2d65f6e`（批 B = 派发时 HEAD） | 32 | 75 | **32 行 / 75 匹配** | ✅ |
| `HEAD`（`cfe7756` 交付后） | — | — | **32 行 / 75 匹配**（未变） | ✅ 批 E 未改该口径 |

**批 B 净行更正独立复现**：`git diff --numstat 813c4a9 2d65f6e -- tests/host-abi-health.mjs` = `51 15` ⇒ added **51** / removed **15** / **净 +36**。Developer 更正派发说明的「批 B +66 行」为误——**更正属实**。

> **口径粒度提示（本审查补充，非缺陷）**：75 个匹配中恰 **32 个**来自 `git grep -n` 自身的行使前缀 `tests/host-abi-health.mjs:<行号>`（命中行的输出前缀本身匹配该正则），另 **43 个**才是文件内容真匹配。若按「内容自身」口径复算：批 A = **67−34 = 33**、批 B/HEAD = **75−32 = 43**。两个数字**口径不同**，报告与提交信息未标注该差异——建议后续引用时括注口径（登记 P3-2）。

### 1.3 声称 9 — 门控 / 断言 / skip / 结构守恒 【全部吻合】

| 项 | 声称 | 本审查独立实测 | 裁决 |
|----|------|---------------|------|
| `node tests/run-all.mjs` | exit 0 ×3（22.8/23.0/22.2s） | **exit 0 ×3**（22.9 / 22.8 / 23.4s；另一次收尾跑 23.1s） | ✅ |
| 汇总行 | `ALL 20 SUITES + 4 RUNNER MODULES PASSED` | 逐字一致（末行含 `#SKIP 2 (smoke.mjs×2)`） | ✅ |
| `#SKIP` | 2 | **2**，明细两行均出自 `smoke.mjs`（`0o600 POSIX` / `POSIX online checks`） | ✅ |
| `host-contract.mjs` 断言 | 106 → **118** | 父 `2d65f6e` = **106**；`HEAD` = **118**；Δ = **+12** | ✅ |
| `host-abi-health.mjs` 断言 | **178**（未变） | **178** | ✅ |
| 合计 | 284 → **296** | 106+178 = **284** → 118+178 = **296** | ✅ |
| 结构守恒：`stale: [` 字面量 | **26**（= 条目数） | `stale: [` 出现 **26** 次 | ✅ |
| `ANCHOR_CASES` 条目 | — | `^ {4}\{ file: \[` = **25**（与 R1 P3-4 登记的「该正则漏计 1 条目」一致，**真值 = 26 = 25 + 1**） | ✅ 自洽 |

**`+12` 构成独立推演**（不采信其分解）：
- S2 新增 2 个 `check` 位点 × `HOST_SHAPE_ANCHORS` **3 条目** = **+6**
- S5 新增 1 个 `check` 位点 × `WIRE_SCHEMA_WHITELIST` **6 条目** = **+6**
- 合计 **+12** ✅ —— 与声称「S2 完备性 3 + S2 符号可达性 3 + S5 完备性 6」**逐项吻合**（声称按「每条目 1 次」分解，等价）。

### 1.4 声称 7 — 口 a / 口径 b / 行数口径 【三口径逐数吻合，并补出口径类型】

**口径 a** = `git grep -oE 'lib/client\.js:[0-9]+(-[0-9]+)?' -- lib/client.js`（**匹配次数**口径）

| 修订 | 9 → 8 → 0 声称 | 本审查实测 |
|------|---------------|-----------|
| `6bc3841`（FIX-042 批前树） | 9 | **9** ✅ |
| `175d3e1` | 8 | **8** ✅ |
| `813c4a9`（批 A） | 8 | **8** ✅ |
| `2d65f6e`（批 B 后） | 0 | **0** ✅ |
| `HEAD` | 0 | **0** ✅ |

**口径 b** = FIX-041 R0 F-3 三形态 matchAll（正则**逐字取自** `tests/host-abi-health.mjs:781-782`，非本审查自拟）

| 时点 | ① 文件:行号 | ② `L###` | ③ 裸 `:NNN` | 合计 | 声称 | 裁决 |
|------|-----------|---------|-----------|------|------|------|
| `813c4a9` | **12** | **17** | **11** | **40** | 40〔12/17/11〕 | ✅ |
| `2d65f6e` / `HEAD` | **0** | **17** | **7** | **24** | 24〔0/17/7〕 | ✅ |

**行数口径对照**（同一形态按行去重，与匹配次数口径**不可混用**）：

| 项 | 声称 | 本审查实测 |
|----|------|-----------|
| ② 行数 @`813c4a9` / `2d65f6e` | 9 | **9** / **9** ✅ |
| 口径 b 整体行数 | 29 → 14 | **29 → 14** ✅ |

> **口径 b 行数 29→14 的差额独立归因**：减少 **15 行**，与批 B 对该文件 `removed=15` **逐数吻合**；其中 12 行携带 ① 形态锚（12 个 ① 匹配跨 12 行）+ 12 行中的 7 行同时携带 ③ 形态锚 ⇒ ③ 由 11 降至 7（−4），① 由 12 降至 0（−12），② 行数不变（9）。三形态残量 17 + 7 = 24 与整体匹配次数口径自洽。⇒ **数字链完整、可逐处追溯**。

**两处 off-by-one 的闭合状态**：⑥ 段落已于本期把「本批清除的 **7** 处」改为「**批 B 清除的 8 处**」，并写明 `9 = 1 处 FIX-042 已清 + 8 处`（`tests/host-abi-health.mjs:870-873`）。R1 独立列点的 8 个 ① 匹配（`lib/client.js:889-911` / `:581` / `:2842-2848` / `:4493-4499` / `:175-179` / `:170` / `:752` / `:193`）**全部**属批 B 清除 ⇒ **8 处成立**。

### 1.5 声称 2 — 「32 行内自指 = 0」【成立，但判定链与 Developer 声明不同 → 见 P2-3】

见 §2.2（本批最大风险面专章）。

### 1.6 声称 3 — 裸 `:NNN` 族四组处置 【四组全部核实】

| 组 | 声称处置 | 本审查实测 | 裁决 |
|----|---------|-----------|------|
| `:828` 一组 8 处（`:728/:729/:733/:796/:797/:798/:799/:814`） | 改条目名式 | `813c4a9:809` 文本实测含该 8 个裸行号（**count=1 行**）；`HEAD` 同模式 = **0** | ✅ 已清除 |
| `:890` | 去行号 + 补归属 | `HEAD:898-900` 已写明「原形为裸 `:NNN`，对象 = `tests/metrics.mjs` 的旧锚名段」 | ✅ |
| `:907` | 改条目名式 | `HEAD:933-935` 已用条目名式（`「lib/client.js 的 session.selectModel 面」`），并声明实测已闭合 | ✅ |
| `:908` | 陈旧引用更正为「实测已闭合」 | 同段；独立复核 `HEAD` 内 `lib/client.js` 宿主行号计数句残留 = **0** | ✅ |

**该 8 处确系自指（客观证据）**：`813c4a9` 该 8 个行号指向 `tests/host-abi-health.mjs` **自身**的 8 行（L728/L729/L733/L796-L799/L814；文件总行 1229，故 L814 在界内）。Developer 的替换枚举「7 条目 + 1 备忘注释」= **8 行**，且 7 个条目名（`tests/client-render.mjs` / `lib/host-abi/llm-selection.js` / `lib/host-abi/inject-manifest.js` / `lib/oauth-llm.js` / `lib/wrapper.js` / `tests/rpc-shadow-guard.mjs` / `lib/host-route.js`）在 `HEAD` 内**逐一实存** ⇒ **替换完整**。

### 1.7 声称 4 / 5 — 构造性判红【全部独立复现，见 §2.4 / §2.5】

### 1.8 声称 6 — 元素精确计数 + `===` 选型实证【闭合成立 + 选型证据逐字复现】

见 §3（R0 P1-3）与 §2.5。

### 1.9 声称 8 / 11 / 12 / 13 — 处置、只读接触、盲区、未闭合项【逐项落判】

| 声称 | 本审查裁定 |
|------|-----------|
| P3-2 引号渲染统一（单引号）+ 双引号定界保源文本 | **成立**（§2.6） |
| P3-3 `anchorFieldsOf` 删恒空形参 | **成立**（§2.6） |
| 真实环境只读接触 6 条命令、零写入 | **本审查无其会话内命令级记录，未复核**（R4 义务主体 = 执行者；本报告仅登记本人接触面 §10） |
| 自曝 `fix042-w2-selfref.mjs` 归属启发式盲区 | **盲区存在且已如实登记**；但其**覆盖边界比自述更宽**（见 P2-3） |
| 未闭合项（R1 P2-2 / P2-3 归批 C；`.test-home/` 时点标注） | **属实**——`lib/**` 零改动（§1.1）⇒ P2-2/P2-3 确未被顺带修 |

---

## 2. 专项复核

### 2.1 反幻觉核验：新引入符号逐条可溯源 【6/6 可溯源，零幻觉】

| 符号 | 定义位 | 调用位 | 裁决 |
|------|-------|-------|------|
| `declarationGapsOf` | `host-contract.mjs:145` | `:609`（S2）、`:771`（S5） | ✅ 定义 + 2 调用 |
| `symbolHostGapsOf` | `host-contract.mjs:161` | `:609`（S2） | ✅ 定义 + 1 调用 |
| `hostSourceOf` | `host-contract.mjs:479` | `:624`（S2 符号读取）、`:767`（S5 文本读取） | ✅ 定义 + 2 调用 |
| `expectSymbolHost` | `host-contract.mjs:156`（注释）/ `:319`、`:337`、`:347`（3 处数据声明） | `:623`（消费） | ✅ 1:1 数据面 |
| `staleElementValuesOf` | `host-abi-health.mjs:1062` | `:1097` | ✅ |
| `registeredLiteralText` | `host-abi-health.mjs:1097` | `:1104` | ✅ |

**宿主符号引用（新增 `expectSymbolHost` 的 6 条映射）逐条宿主实读**（只读，`@deepseek-ai` 靶子）：

| 映射声明 | 宿主实读结果 | 裁决 |
|---------|-------------|------|
| `dsh-api-session-controller/lib/index.js :: selectModel(` | 3 hit @L605/2850/2851 | ✅ 真 |
| `dsh-api-session-controller/lib/types/agent.js :: selectionFor(` | 3 hit @L289/344/511 | ✅ 真 |
| `…/lib/types/agent.js :: stateOf(` | 2 hit @L293/363 | ✅ 真 |
| `…/lib/types/agent.js :: projectionState.pending` | 2 hit @L297/299 | ✅ 真 |
| `dsh-client-ui-model-selection/lib/types/client/service.d.ts :: directoryFor(` | 1 hit @L44 | ✅ 真 |
| `…/lib/types/client/directory.d.ts :: load(` | 1 hit @L60 | ✅ 真 |

⇒ **零幻觉符号**；`expectSymbolHost` 的 6 条映射全部可复现（复现命令见 §8-E6）。

### 2.2 【本批最大风险面】守卫自身面自指清零 — 三层独立复核

**口径分层**（不用单一启发式）：

- **层 A（带文件名自指）**：正则 `host-abi-health\.mjs:[0-9]` 在 `HEAD` 文件内容内的命中 = **0**（该形态若能命中，**唯一**可能即自指，因文件内不会出现他文件叫此名）。
- **层 B（裸 `:NNN` 自指）**：全文件扫描裸行号（排除 `file:line` 形态）得 **28 行 / 43 处出现**（已剔除 `git grep -n` 的 32 行输出前缀伪匹配）。逐行取其**对象归属**（读上下文 4 行窗口 + 本审查对可疑行的宿主/仓内实读）：
  - **归他文件/宿主（负）**：**38 处 / 23 行** —— 例：`L729-731`（→ `lib/oauth-llm.js`）、`L736`（→ `lib/preset-defaults.js`）、`L762`（→ `README`）、`L769-772`（→ `lib/service.js`）、`L888-891`（→ `lib/wrapper.js` + 宿主 `dsh-llm`）、`L919-921`（→ `tests/stats.mjs` / `tests/fix-012-image-takeover.mjs`）、`L937`（→ 宿主 `dsh-credentials-local`）、`L957/962/998`（→ 宿主 `dsh-llm` / `dsh-api-remotes` 等）。
  - **无归属 ≠ 指向本文件（负）**：**5 处 / 5 行** —— `L461`（check 标签内的错误码体系引用）、`L719`（拼接常量 needle 值）、`L796`（→ 宿主 `dsh-host-apiproxy`，正文已注明该包本机不存在）、`L891`（数据 needle ＋ 宿主 `dsh-llm`）、`L924`（→ 仓内 `lib/client.js`）。逐条核验**对象均非本文件**。
  - **指向本文件（正）**：**0**。
- **层 C（历史自指的原位比对）**：`813c4a9:809` 的 8 个裸行号逐一取值，确认其指向该修订下 `tests/host-abi-health.mjs` **自身**行（内容见 §1.6），且 `HEAD` 同模式 = **0** ⇒ 自指已**整体**清除，非仅文本改写。

**裁定**：**严格口径下「守卫对本文件的行号引用」= 0，PASS。** 本结论**不依赖** Developer 的启发式工具（该工具对层 B 的 8 处给出**错误**的「非自指」，Developer 已自曝并如实登记），亦**不采信**其「32 行全部非自指」的结论表述——本审查按层 A/B/C 各自独立取证后得出同一结论。

### 2.3 自指判定覆盖完整性 — 结论成立，**覆盖方法有边界**（→ P2-3）

Developer 声明的判定面 =「上述 **32 行**逐处语义判定」。经核：

- 「32 行内自指 = 0」**成立**（§2.2 层 A 为强证据：该 32 行若含自指，必以 `host-abi-health.mjs:NNN` 形态出现，实测 = 0）。
- **但「32 行」不是自指的全部可能载体**：裸 `:NNN` 族（现测 **28 行 / 43 处**）按该口径**不计入**，其自指判定**未被 32 行判定覆盖**——本批仅处置了其中的 **8 处一组**（`:828` 组）+ 3 处单点，**其余 38 处/23 行未纳入逐处判定**。
- 本审查已**补充**完成该面（§2.2 层 B，结论同样为 0），故**不构成残留缺陷**；但**声明面与判定面不等宽**这一事实 MUST 被登记（P2-3），否则后续批会误以为自指面已被穷尽覆盖。

### 2.4 R1 P1-1 闭合核验 — `declarationGapsOf` / `symbolHostGapsOf` 非恒真 【闭合】

全部在仓库外隔离副本（`%TEMP%\fix043r2\NEW`，`HEAD` 全树 + `node_modules` junction），逐次字节复原。

| 变异（构造性自洽伪造） | 预期 | 实测 | 明细 |
|----------------------|------|------|------|
| **M-E5**：face 1 删去 `expectPackage`/`expectFile`/`expectSymbol`/`expectSymbolHost` **四字段全删** | 判红 | **exit=1** ✅ | `{"declarationGaps":["expectPackage","expectFile","expectSymbol","expectSymbolHost"]}` |
| **M-E5b**：`expectFile: []`（空数组） | 判红 | **exit=1** ✅ | `{"declarationGaps":["expectFile","expectSymbolHost.file∉expectFile",…]}` |
| **M-E6a**：`expectPackage: 42`（类型畸形） | 判红 | **exit=1** ✅ | `{"declarationGaps":["expectPackage"]}` |
| **M-E6b**：省略 `expectSymbolHost` | 判红 | **exit=1** ✅ | `{"declarationGaps":["expectSymbolHost"]}` |
| **M-E6c**：映射 `file: 'lib/ghost.js'` ∉ `expectFile` | 判红 | **exit=1** ✅ | `{"declarationGaps":["expectSymbolHost.file∉expectFile"]}` + 符号核验 FAIL |
| **M-E6d**：映射符号集 ⊊ `expectSymbol` | 判红 | **exit=1** ✅ | `{"declarationGaps":["expectSymbolHost.symbols≠expectSymbol"]}` |
| **S5-M1**：某 face 的 `expectPackage` 置 `undefined` | 判红 | **exit=1** ✅ | `S5 … 对象归属声明完备 :: {"declarationGaps":["expectPackage"]}` |
| **基线**（未变异） | 绿 | **exit=0 / 118 断言** ✅ | 不误红 |

**「字段互相矛盾时是否判红」专项（验收标准 3 后半）**：`symbolHostGapsOf` 的**两条字段间自洽判据可被绕过性**已逐向构造验证——
- 「映射文件 ∉ `expectFile`」→ 判红（M-E6c）✅
- 「映射符号并集 ≠ `expectSymbol`」→ 判红（M-E6d）✅
- 且二者**方向均封闭**：M-E6c 额外触发宿主符号 `absentSymbols`（因为 `lib/ghost.js` 不存在 → `hostSourceOf` 返回 `null` → `?? ''` → 无符号在位）；M-E4c（把 `selectModel(` 声明到错误的**已声明**文件 `lib/types/agent.js`）亦判红 ⇒ **「符号只在 `expectSymbol` 里声明而逃逸宿主核验」的静默面已闭合**。

⇒ **R1 P1-1 = 已闭合**（省略/空/畸形/字段脱钩四类全部 fail-closed；基线不误红）。

> **残留边界（登记 P2-1）**：`host-contract.mjs:623` 的 `anchorCase.expectSymbolHost.flatMap(...)` 未做防御——`expectSymbolHost` **完全省略**时运行时 `TypeError: Cannot read properties of undefined (reading 'flatMap')`（实测复现）。判据**仍 fail-closed**（exit code = 1，缺字段 FAIL 先打印），故**不阻塞**；但 `commit message` 的「声明面畸形时宿主读取不裸抛（P8）」**只对 `hostSourceOf` 与 `declaredPackage` 成立**，未覆盖该站点，且崩栈会截断其后所有诊断输出（可观测性降级）。

### 2.5 R1 P1-2 闭合核验 + R0 P1-3 闭合核验 【两项均闭合，且判红可复现】

**(A) R1 P1-2 — S2 符号宿主可达性**

| 变异 | 旧树（`2d65f6e`） | 新树（`HEAD`） | 裁决 |
|------|-----------------|---------------|------|
| **M-E4**（= R1 **M-B4 同形**：真包 + 真文件 + 捏造符号 `ghostFn()`，锚文本/`expectSymbol`/`expectSymbolHost` 三处同步自洽） | **exit=0**（R1 已实证） | **exit=1** ✅ `{"absentSymbols":["dsh-api-session-controller/lib/index.js :: ghostFn("]}` | 闭合 |
| **M-E4c**（符号声明到错误的已声明文件） | — | **exit=1** ✅ `{"absentSymbols":["dsh-api-session-controller/lib/types/agent.js :: selectModel("]}` | 附加判别力 |
| **M-E7**（S5 判别力回归：`settings.describe` 捏造 schema 符号，= R1 **M-B7 同形**） | exit=1（R1 已实证） | **exit=1 / 2 FAIL** ✅ `{"absentSymbols":["settings_describe_result"]}` + 锚文本 `undeclared` | 无回退 |

⇒ **R1 P1-2 = 已闭合**（取处置 **(a)** 并实施；且 face 1 的 `lib/types/agent.js` 已并入 `expectFile`，原「未列入」披露面消除）。

**(B) R0 P1-3 — 9h-4 `registered` 元素精确计数**

判定基准 = R0 `A1` 同形变异：在 `tests/metrics.mjs` 条目的 `stale: [` **首元素前**插入含**他人 needle** 的块注释（元素数不变）：

| 树 | 变异 | 结果 | 裁决 |
|----|------|------|------|
| **OLD**（`2d65f6e` 全树） | 无 | exit=0 / 178 断言 | 基线绿 |
| **OLD** | A1 | **exit=0 / 178 断言** —— **旁路复现**（`registered` 由 1 虚增为 2 ⇒ 与 `inGuard` 相等 ⇒ 放行） | 缺陷确认 |
| **NEW**（`HEAD` 全树） | 无 | exit=0 / 178 断言 | 基线绿 |
| **NEW** | A1 | **exit=1** ✅ `9h-4-1 FAIL … {"needleRepetitions":["lib/stats.js :: 「host-route.js:55」登记 1 处 / 守卫内 2 处"],"needleCount":114,"staleUnitCount":26}` | **已收口** |

⇒ **R0 P1-3 = 已闭合**：元素精确计数**确实消除**「单元内注释掩蔽」旁路，且**双向可复现**（旧树 0 / 新树 1）。

**(C) 形态选型实证（「为何不用 `===` 相等形态」）**：**属实且数字精确**。把 `registered` 改为逐元素 `===` 相等后实跑：

```
FAIL B5 9h-4 R-1 … {"needleRepetitions":[
  "tests/fix-031-attribution.mjs :: 「host-route.js HOST_ROUTE_PROVIDER」登记 1 处 / 守卫内 2 处",
  "lib/preset-defaults.js :: 「README L16」登记 2 处 / 守卫内 4 处",
  "tests/preset-defaults.mjs :: 「README L16」登记 2 处 / 守卫内 4 处",
  "tests/host-contract.mjs :: 「dsh-llm lib/index.js:1618」登记 1 处 / 守卫内 2 处"]}
```

⇒ **恰 4 条既有 needle 假红**（与 Developer 声称的 4 条**逐条同名**：`README L16` ⊂ `README L165`、`host-route.js HOST_ROUTE_PROVIDER` ⊂ `lib/host-route.js HOST_ROUTE_PROVIDER`、`dsh-llm lib/index.js:1618` ⊂ `dsh-llm lib/index.js:1618-1687`）。**逐元素子串计数 = 0 假红**（基线 118/178 双绿）。⇒ **选型理由成立**。

> **本审查补充（P2-2）**：`===` 的假红面**不止 4 条**——本审查对数据区 232 个字面量做子串关系分析，得 **95 组**「A ⊂ B」嵌套，其中**语义完整**的 needle 至少含 `agentPresetsServiceOf` ⊂ `agentPresetsServiceOf 先例，定义在`、`presetDiag/notePresetDiag` ⊂ `presetDiag/notePresetDiag `。⇒ 「4 条」是**当前 needle 切片的实测数**（正确），但**不是该形态的固有假红面**；注释若照抄「4 条」为选型依据，后续新增 needle 时应重跑而非沿用。

### 2.6 P3-2 / P3-3 处置核验 【两项成立】

**P3-2（引号渲染统一）** —— 三处一致性实测：

| 站点 | 内容 | 裁决 |
|------|------|------|
| `host-contract.mjs:315`（face 1 anchor） | `… stateOf(session, 'modelSelection') … S7 增强组核验 … stateOf(agent.session, 'modelSelection') …` | 单引号 |
| `host-contract.mjs:887`（S7 判据） | `agentTypes.includes("stateOf(agent.session, 'modelSelection')")` | 单引号（逐字一致） |
| `host-abi-health.mjs:980-981`（2 条 fresh needle） | `'selectionFor(agent) → stateOf(session, \'modelSelection\') → projectionState.pending'` 等 | **与 anchor 源文本逐字一致**（JS 转义 `\'` 在源文本中即 `'`） |

- **未破坏 fresh needle 源文本匹配**：fresh needle 按**源文本**匹配（`includes`），而 anchor 现为双引号定界、内部为 `'` 字面字符；needle 由 `\'` 转义写出同一字符序列 ⇒ **匹配成立**（基线 178 断言 exit 0 为证）。
- **旧双引号形态残留 = 0**：`stateOf(session,"modelSelection")` 在 `host-contract.mjs` 内已不存在；`host-abi-health.mjs` 的 `host-contract.mjs` 条目 `stale` 数组**不含**旧引号形态 ⇒ 无 stale 残留判红。
- ⇒ **P3-2 = 已闭合**。

**P3-3（`anchorFieldsOf` 冗余形参）** —— 定义 `host-contract.mjs:600` 为 `(spec)`，唯一调用 `:612` 为 `anchorFieldsOf(anchorCase)`；全文件 `symbolPrefix` 残留 = **0** ⇒ **无调用点不一致**。**P3-3 = 已闭合**。

---

## 3. 【本轮核心】四项遗留闭合比对表

| 遗留项 | 出处 | 要求 | 本审查证据 | 裁定 |
|--------|------|------|-----------|------|
| **R1 P1-1** — 新 `expect*` 判据对**字段缺失** fail-open（省略三字段即平凡满足） | R1 §3 P1-1（`review-FIX-043-R1-input.md:254-262`） | 追加字段完备性自检（缺失/空/畸形/字段脱钩即红，与 §9h-3 同型） | `declarationGapsOf`(`:145`) + `symbolHostGapsOf`(`:161`) 落地；S2 `:609-611`、S5 `:771-773` 消费；**6 项变异全部判红**（M-E5/M-E5b/M-E6a/M-E6b/M-E6c/M-E6d）＋ S5-M1；基线 118 不误红；**字段间自洽可被绕过性**经 M-E6c/M-E6d/M-E4c **双向封闭** | ✅ **已闭合** |
| **R1 P1-2** — S2 的 `expectSymbol` **不核验宿主可达性**，捏造符号仍可通过 | R1 §3 P1-2（同文件 `:264-269`） | 补 `expectSymbolHost` 形态核验 **或** 如实声明边界（二选一） | 取 **(a) 实施**：`expectSymbolHost` 单点声明 3 处（`:319/:337/:347`）+ 消费 `:623-627`；**M-E4（M-B4 同形）旧树 0 → 新树 1**；M-E4c 错误文件归属亦判红；S5 判别力回归 M-E7 = 1（2 FAIL）；6 条映射宿主实读全部为真；face 1 的 `lib/types/agent.js` 并入 `expectFile` | ✅ **已闭合** |
| **R0 P1-3** — 9h-4 解析器**语法洁净旁路**：数据单元内注释可掩蔽「非登记复述」 | R0 §3 P1-3（`review-FIX-043-R0-input.md:148-155`） | `registered` 改**按元素字符串精确计数**（或注释剥离后计数） | `staleElementValuesOf`(`host-abi-health.mjs:1062`) 注释/字符串感知扫描 + 逐元素字面量值；`registeredLiteralText`(`:1097`) 取代 `staleDataText`；**A1 同形变异：OLD exit 0（旁路复现）→ NEW exit 1（收口）**；`===` 选型实证 4 条假红**逐条复现**；基线双绿 | ✅ **已闭合** |
| **R1 P2-1** — ⑥ 段落口径 a 子分解 **off-by-one**（「7 处」应为 8 处） | R1 §3 P2-1（`review-FIX-043-R1-input.md:271-275`） | 改「7 处」→「8 处」 | `:870-873` 已改为「批 B 清除的 **8** 处」并写明 `9 = 1 + 8`；8 个 ① 匹配逐处可列（`889-911`/`581`/`2842-2848`/`4493-4499`/`175-179`/`170`/`752`/`193`）**全部属批 B**；口径 a 9→8→0、口径 b 40→24、② 行数 9、整体行数 29→14 **逐数复现** | ✅ **已闭合（计数面）**<br>⚠ **同类残留（理由面）→ P2-2** |

**未闭合项（开发者登记，本审查确认属实）**：R1 P2-2（`lib/client.js:5008` 证据对象替换）与 P2-3（裸锚枚举/「不可稳定符号化」理由）**明归批 C**——`lib/**` 零改动（§1.1）⇒ **确未被顺带修**，登记与事实一致。**但 P2-3 的「理由面」在本批被 ⑥ 段落**继续沿用**（→ P2-2），属**部分闭合**。

---

## 4. 五维度逐项结论

### 维度 1：正确性 — **通过（P2×4 备注）**

- **自指清零（本批主交付）**：三层独立复核（带文件名自指 / 裸锚自指 / 历史原位比对）**全部为 0**（§2.2）；`813c4a9:809` 的 8 个自指行号在 `HEAD` 内**同模式命中 = 0**，替换枚举完整（§1.6）。
- **判据硬化正确性**：`declarationGapsOf` 的 4 类缺口（缺失/空/畸形/非字符串）与 `symbolHostGapsOf` 的 3 层（结构畸形 / 文件 ∉ `expectFile` / 符号集 ≠ `expectSymbol`）**逻辑互斥且穷尽**；`hostSourceOf` 的 `null` 降级与 `?? ''` 兜底正确（不可达 ⇒ 符号核验退化为空串比较 ⇒ 判红，**fail-closed** 方向正确）。
- **元素扫描器正确性**：`staleElementValuesOf` 的 4 态机（code / string / line / block）边界处理正确——`//` 与 `/*` 仅在 code 态起效，字符串内 `'` 正确闭合、`\n`/`\'` 等转义按 JS 语义解码，`,` 切分仅在 code 态生效（**needle 内含 `,` 与 `//` 的真实用例**已由注释声明并经 A1 变异间接验证）；片段取 `slice(indexOf('[')+1, -1)` 对 `stale: [...]` 形态正确。
- **边界条件**：宿主不可达分支（`:628-630` 的 `note` 降级，**可见 skip 非静默**）保持在位；`hostTarget.root` 为空时 S2/S5 双分支均正确。
- **并发/资源**：无异步、无共享可变状态；`hostSourceOf` 的 `Map` 缓存避免重复读取（`readFileSync` 在 `hostSourceOf` 与 S7 `hostRead` 各一处，P5 单点已收口，`hostApiFile`/`hostApiHas` 残留 = **0**）。
- **数字链正确性**：三口径（a / b / 行数）**全部逐数复现**，且 29→14 的差额 15 与批 B `removed=15` 交叉吻合（§1.4）。

### 维度 2：安全性 — **通过（无发现）**

- 本批**不进入产品运行路径**：改动全在 `tests/**`；零 `lib/**`（§1.1）。
- 新增代码为**只读** `existsSync` / `readFileSync` / `includes` / 字符串切片；diff 内 `eval(` / `new Function` / `execSync` / `spawn` / `child_process` 命中 = **0**。
- 无密钥/token/密码（diff 内 `token` 命中均为**变量名** `token` 或「锚 token」语义，非凭据）。
- 无新增网络、认证、SQL/DOM 面 ⇒ 无 OWASP Top 10 新增攻击面。
- 新增宿主读取路径经 `hostSourceOf` **单点**，路径由 `hostTarget.root` + 声明包名/文件名拼接，**无注入面**（包名/文件名来自仓内常量数据，非外部输入）。

### 维度 3：可维护性 — **通过（P2×2 / P3×2 备注）**

- 命名：`declarationGapsOf` / `symbolHostGapsOf` / `hostSourceOf` / `staleElementValuesOf` / `registeredLiteralText` 均表达意图。
- 函数长度：`declarationGapsOf` 8 行、`symbolHostGapsOf` 9 行、`hostSourceOf` 12 行、`staleElementValuesOf` 33 行（< 50 阈值）。
- 重复代码：**下降**——S2/S5 的宿主读取收口到 `hostSourceOf`（`hostApiFile`/`hostApiHas` 双实现已删，P5）；`declarationGapsOf` 在 S2/S5 **复用同一实现**。
- 注释质量：**本批最显著正向改进**——自曝盲区（`:913-916`）、如实声明判定口径边界（`:904-907`）、并**现场实证**判据非恒真（`:1029-1031` 记录首版注释被 9h-4/9h-4c 判红的自洽性证据）。**但 ⑥/⑧ 段落存在表述强度问题**（P2-2、P2-3）。
- `hostSourceOf` 采用 IIFE 闭包缓存，可读性可接受；`staleElementValuesOf` 的状态机无注释内嵌于实现行（既有 block 注释已充分说明，判为可接受）。

### 维度 4：性能 — **通过（无发现）**

- 新增 S2 判据：3 条目 × 2 断言 = 6 次 `check`，宿主侧 3 次 `existsSync`（批 B 已有）+ 3 次 `hostSourceOf`（Map 缓存命中 ⇒ 实际 3 次 `readFileSync` 上限，含 1 个 `lib/index.js` 与 1 个 `agent.js` 复用）。
- S5：`hostSourceOf('dsh-api-remotes','lib/client.js')` 由「每 face 一次读取」降为**一次读取 + 6 次缓存命中**（批 B 为 `hostApiHas` 闭包一次性读取，等价；本批未引入回退）。
- `staleElementValuesOf` 对 26 个单元文本做**单遍字符扫描**（O(总长度)），`countOccurrences` 用 `split` 线性；needle 总数 114、守卫文件约 124KB ⇒ 量级 < 10^7 字符操作。
- 门控总耗时 22.8~23.4s，与批 B（22.7~23.5s）/ 批 A（21.8~22.7s）**同量级 ⇒ 无性能回退**。

### 维度 5：测试覆盖 — **通过（含 P2 备注）**

- **核心路径**：本批交付物**即判据自身**；新增 12 条断言经 **5 个判别位点全部构造判红**（M-E5/M-E5b/M-E6a-d/M-E4/M-E4c/M-E7/S5-M1）⇒ **非装饰性断言**。
- **边界测试**：字段省略 / 空数组 / 类型畸形 / 文件不属于 `expectFile` / 符号集不等 —— 五类边界**全部有构造覆盖**（§2.4）。宿主不可达降级分支保持既有覆盖。
- **错误路径**：失败 detail 结构化输出 `declarationGaps` / `absentSymbols` / `undeclared` / `needleRepetitions`（P8 可观测，**不静默吞错**）；A1 变异证明旁路已被堵。
- **覆盖率**：无覆盖率工具接入（沿用既有口径）；断言总量 118 + 178 = **296**（+12）。
- **净覆盖扩张**：① 9h-4 判别力**增强**（旁路堵死，双向实证）；② S2 由「锚文本 + 包/文件存在」扩至「**符号宿主逐字在位**」；③ S2/S5 声明面由 fail-open 转 fail-closed。
- **测试看护自身（P4 精神）**：本批新增判据在落地过程中**判红了自身首版注释**，构成「守卫看护自身文本」的现场实证。

---

## 5. AI 代码专项 5 项检查

| # | 检查项 | 结论 | 事实依据 |
|---|--------|------|---------|
| 1 | **mock 残留** | **无发现** | diff 内 `mock`/`stub`/`fake`/`dummy` 命中 = 0；新增判据消费真实宿主源码（`hostSourceOf` 读靶子文件）；`_npx` 靶子实测可达并逐字核验 6 条符号映射 |
| 2 | **硬编码返回值** | **无发现** | 未出现 `return true` / `|| true` / `=== true` 形态；**反向验证**：5 个判别位点经 8 项构造性变异全部判红（§2.4/§2.5）⇒ 非恒真 |
| 3 | **幻觉 API / 幻觉符号** | **零幻觉（6/6 逐字实证）** | 新引入 4 个仓内符号全部「定义 + 调用」可溯源（§2.1）；`expectSymbolHost` 的 6 条宿主符号映射**逐条宿主只读实读命中**（`selectModel(`@L605、`selectionFor(`@L289、`stateOf(`@L293、`projectionState.pending`@L297、`directoryFor(`@L44、`load(`@L60）；宿主读取路径 `join(root, pkg, file)` 为真实嵌套结构 |
| 4 | **未实现 TODO** | **无发现** | diff 内新增 `TODO`/`FIXME`/占位 = 0；未闭合项以 `notes` **如实登记**（`:998` 的 `:297-318` 跨文件锚），并明写「本批未动 / 归批 C」 |
| 5 | **过度实现** | **无发现（有两处措辞级过度声明 → P2-2/P2-3）** | 2 文件 +209/−48 全在锚登记/注释/判据同域；无「顺带重构」；`anchorFieldsOf` 形参删除为**净简化**；`hostSourceOf` 收口为**净去重**。**但**：⑥ 新增「宿主靶子不可稳定符号化」总括断言（`:877-878`）与 ② 新增「61af16a 新增条目行」归因（`:826-830`）**强度超过本批实证**——判**非阻塞**（均不影响判据/门控） |

---

## 6. 发现清单（逐条带级别 + 可复查事实）

### P2-1 — `expectSymbolHost` 省略时站点仍**裸抛 `TypeError`**，与「不裸抛」声明不符（可观测性降级）
- **位置**: `tests/host-contract.mjs:623`（`anchorCase.expectSymbolHost.flatMap(...)`）；对照声明 `:620-622` 注释与 commit message「声明面畸形时宿主读取不裸抛（P8，§9h-2c 先例）」
- **事实依据**（仓库外 NEW 树实测，字节复原 `True`）：省略 `expectSymbolHost` 后 `exit=1`，但输出含 `TypeError: Cannot read properties of undefined (reading 'flatMap')` —— 完备性判据（`:609-611`）**先**打印 `FAIL … {"declarationGaps":["expectSymbolHost"]}`，随后同迭代在 `:623` 崩栈 ⇒ **后续所有断言未执行**。
- **影响**：判据仍 **fail-closed**（exit code = 1），**不使既有强度下降** ⇒ 非阻塞；但（i）「不裸抛」**只对 `hostSourceOf` 与 `declaredPackage` 成立**，该站点未覆盖；（ii）崩栈截断诊断输出，与 P8「失败可观测」的**完整可观测**口径有差距。
- **修复建议**：`const symbolHost = Array.isArray(anchorCase.expectSymbolHost) ? anchorCase.expectSymbolHost : []`，或在 `:616` 的 `if (hostTarget.root)` 分支前置 `if (symbolHostGapsOf(anchorCase).length > 0) { note(...); continue }`（与 `hostSourceOf` 的防御同法）。
- **级别理由**：非阻塞（fail-closed 保持）；但属**新引入代码**的可观测性缺陷，且 commit message 存在**超声明**表述。

### P2-2 — ⑥ 段落新增「宿主靶子**不可稳定符号化**」总括断言：**无实证支持**，与本表 `:5561/:5562` 锚实况相反；且与自陈的「登记为后续批逐处判定」**措辞自相矛盾**
- **位置**: `tests/host-abi-health.mjs:877-878`（口径 b 的 ③ 余 7 处保留理由）
- **事实依据**（三源独立实读）：
  - **语句**：`（…③ 余 7 处为**刻意保留**项（ui-conversation 跨包、dynamicCordisContext 同块、ModelDirectory generation 守卫/store.subscribe 三处**宿主靶子不可稳定符号化**⇒ 无实证不引入新符号，P10-④），登记为后续批逐处判定。`
  - **反例 1（仓内文本）**：`lib/client.js:5561` 该处引用形态**本身已含具名符号**——`（generation 守卫，宿主 :47/:53）`；`:5562` 为 `composer 模型选择器经 uSES 订阅该 store（宿主 :292）`。**「generation 守卫」/「uSES 订阅」即是可用的符号化名**（同表其他条目正是用此式改写）。
  - **反例 2（锚现值）**：宿主 `dsh-client-ui-model-selection/lib/client.js` 实读 `generation === this.generation` 位于 **`:48/:55/:61`**（`lib/client.js` 的 `:47/:53` **已漂移**）；`:292` 实为 `directoryFor` 的 **JSDoc**（`:296` 才是 `directoryFor(sessionId) {`），真实订阅点为 `:128` / `:314`（`store.subscribe`）⇒ 锚**不指向所声称对象**。**这些行号是「不准」而非「不可符号化」**——两者被混为一谈。
  - **R1 同族**：R1 §3 P2-3 已判定该措辞「理由**未获支持**」，并建议「理由改为逐处标注（锚现值准确 / 已漂移且可符号化，待收敛 / 跨包，待判定）」。
  - **自相矛盾**：同段句尾已声明「登记为后续批**逐处判定**」——若已判定为「不可符号化」，即**不再是待判定项**。
- **影响**：该注释是后续批的**判定输入**。把「锚已漂移、可符号化」表述为「不可稳定符号化」，会（i）让后续批**跳过**这两处本应收敛的锚；（ii）**延续** R1 P2-3 点名的失效模式（FIX-042 R0 P2-1 同族：不得用未实证断言替代逐处判定）；（iii）在**其他 5 处（`:2138`/`:4310`/`:5453`）未获同强度实证**的情况下给出**全量**结论。
- **修复建议**：改逐处标注式，例如「③ 余 7 处：`:2138`（宿主 `remote-events.js:21` 锚现值**准确**）/ `:4310`（**跨包**，待判定）/ `:5453`（宿主 `cordis-runner:312-314`、`:342` **准确**）/ `:5561`、`:5562`（宿主**已漂移**且**可符号化**——`generation === this.generation` 实为 `:48/:55/:61`、`store.subscribe` 实为 `:128/:314` ⇒ 待收敛）」，并删除「不可稳定符号化」总括。
- **级别理由**：**非阻塞**——纯注释措辞，不影响任何判据/门控/数字（三口径数字本身**完全正确**）；但属**新增文本**且**强度超过事实**（P10-④/事实性红线同族），故列 P2。

### P2-3 — 自指判定面**声明与覆盖不等宽**：「32 行」不含裸 `:NNN` 族（现测 28 行 / 43 处），其逐处判定未被本批完成
- **位置**: `tests/host-abi-health.mjs:908-912`（判定面声明）
- **事实依据**：声明为「**上述 32 行内**自指 = 0 …；**自指落在裸 `:NNN` 族**：差额段对该 8 个本文件自身行的枚举（1 组）⇒ 已改条目名式；另 3 处已按判定更正」。**实测**：裸 `:NNN` 族共 **28 行 / 43 处**（已剔 `git grep -n` 的 32 行输出前缀伪匹配），本批**仅处置 8 处一组 + 3 处单点**，**其余 38 处/23 行未纳入逐处判定**。
- **影响**：本审查已**补完**该面并独立得出「自指 = 0」同一结论（§2.2 层 B），故**无残留自指**；但该声明会让后续批误判「自指面已穷尽覆盖」。同时，Developer 自曝的启发式盲区（`fix042-w2-selfref.mjs` 归属启发式）**其影响面同样超过自述**——自述仅提「差额段 8 处」，实际该工具对**整个裸锚族**的归属判定均不可靠。
- **修复建议**：把判定面显式写作两层——「层 A：带文件名自指（`host-abi-health.mjs:NNN`）全文件 = 0；层 B：裸 `:NNN` 族共 N 行 / M 处，本批逐处判定其中 11 处（8 + 3），余下 K 处登记为后续批（附逐处归属表）」，并注明「**自指判定 MUST 按语义归属复核，禁用 `fix042-w2-selfref.mjs` 的启发式结论**」。
- **级别理由**：非阻塞（结论经本审查独立复核为真、无残留缺陷）；属**判定/登记纪律**缺陷，与 FIX-042/FIX-041 系列「口径必须与判定面等宽」的既有纪律同族。

### P2-4 — ② 段落新增归因「`61af16a` 有 / 批前无 = 本批新增守卫**条目行**」**未经核实**：该 7 个条目的锚行在 `61af16a` **已存在**
- **位置**: `tests/host-abi-health.mjs:826-830`（批 E 新增文本）
- **事实依据**：
  - 新增文本称 8 行的来源为「FIX-042 新增的 `ANCHOR_CASES` 条目及其备忘文本：`tests/client-render.mjs` / `lib/host-abi/llm-selection.js` / … / `lib/host-route.js` **七条目** + llm-selection 条目备忘注释一行 = 8 行 @`61af16a`」。
  - **实测**：上述 7 个条目在 `61af16a` 的 **L728 / L729 / L733 / L796 / L798 / L799 / L806 / L810 / L811** 等行**均已存在**（如 `61af16a:728` = `{ file: ['tests', 'client-render.mjs'], … }`）⇒ 它们是**先存条目**，**不是**「本批（FIX-042）新增条目行」。
  - 真正新增的是**裸锚引用文本所在的 3 行**（`175d3e1` 的 L796-L799；`61af16a` 无 L796-L799，其行数 = 1054）。
- **影响**：属**历史归因不实**；不影响任何判据/门控（该段为说明性注释），亦不影响「8 = 7 条目 + 1 备忘」的**计数**（计数经本审查核实为**正确**：8 个自指行号确指向 7 个条目行 + 1 个备忘行）。
- **修复建议**：把「本批新增守卫条目行」改为「候选集合 = 引用这些条目的行（@`813c4a9` 为 L728/L729/L733/L796-L799/L814）」——即用**引用位置**而非**条目新增性**表述，并标注取数修订。
- **级别理由**：非阻塞（判据面零影响）；属新增注释的事实准确性（红线同族）。

### P3-1 — 口径粒度未标注：批 A/B 的「34/67 → 32/75」含 `git grep -n` 自身行使前缀伪匹配
- **位置**: `tests/host-abi-health.mjs:904-907`（批 E 新增自指复算段）
- **事实依据**：75 个匹配中恰 **32 个**来自命中行的输出前缀 `tests/host-abi-health.mjs:<行号>`（该前缀自身匹配所声明的正则），内容真匹配 = **43**；批 A 同法 = 67 − 34 = **33**。⇒ 两个数字**口径不同**（含/不含行使前缀），而文中未标注。
- **影响**：`2d65f6e` 与 `HEAD` 同值（32/75）故**不影响任何结论**；但「批 A 33 → 批 B 43」才是**内容口径**的真实趋势（**上升**，与「行数降、匹配升」的叙述方向一致），按现口径易被误读为「内容锚数量不变而输出噪声减少」。
- **修复建议**：括注「含 `git grep` 行使前缀 N 处；内容口径 = M」。
- **级别理由**：讨论级——数字**本身正确**且已标口径与时点，仅**未区分两层计数对象**。

### P3-2 — ⑥ 段落 `:877-878` 与自陈「登记为后续批逐处判定」措辞矛盾（与 P2-2 同源，单列以便跟踪）
- 见 P2-2「自相矛盾」项；级别 P3 的独立理由是：该矛盾**不影响数字**，仅措辞。

### P3-3 — `staleElementValuesOf` 的分片假设依赖 `unitText` 首字符为 `[`
- **位置**: `tests/host-abi-health.mjs:1064`（`unitText.slice(unitText.indexOf('[') + 1, -1)`）
- **事实依据**：扫描器假定单元文本为 `{ file: [...], stale: [ … ] }` 形态且 `indexOf('[')` 命中的是 `file` 数组而非 `stale` 数组；`staleUnits` 由 `staleUnits.push(guardSource.slice(cursor, end + 1))` 产生（`:1047`），其 `cursor` 定位逻辑决定该假设成立。基线 + A1 + `===` 变体三种实跑均未误伤 ⇒ **当前数据形态下正确**。
- **影响**：无现状缺陷；但若后续 `file` 数组改为非数组形态（如字符串），`indexOf('[')` 会命中 `stale` 数组自身，扫描器行为改变而无判据看护。
- **修复建议**：改为从 `stale:` 标记之后定位（`indexOf('stale:')` → 其后首个 `[`），或在 `9h-4c` 增加一条「单元文本形态」断言。
- **级别理由**：讨论级——现状正确，属**泛化性**提示（P5 精神）。

### P3-4 — 提交信息「基线不误红 / 双绿」表述与实测一致，但未标注**仓库外副本**的 smoke 环境差异
- **位置**: commit message「证据（实跑）」节
- **事实依据**：本审查在**仓库内**实跑 `run-all.mjs` ×3 全部 exit 0；在**仓库外 `git archive` 副本**内，`smoke.mjs` 恒定 1 FAIL（`git clone failure reports clear error on powershell`，因副本缺 `.git` 上下文）。Developer 声称的「副本内 10 项变异逐次字节复原」未提及该环境差异。
- **影响**：**不影响本批结论**（`host-contract.mjs` / `host-abi-health.mjs` 在副本内独立实跑双绿：118 / 178）；仅提示后续在副本内跑**全量**门控时，`smoke.mjs` 的 1 FAIL 属**副本环境伪影**，不可误判为回归。
- **修复建议**：变异实验若使用副本，注明「副本内 `smoke.mjs` 因缺 `.git` 恒定 1 FAIL，判据面以 `host-contract` / `host-abi-health` 独立实跑为准」。
- **级别理由**：讨论级。

---

## 7. 设计一致性 / 原则符合性

| 依据 | 检查结论 |
|------|---------|
| `arch-004-compatibility-design.md` §5.1(a)（`tests/host-contract.mjs` B6 静态层宿主面契约快照） | **一致**——本批在 S2/S5 上做**判据强化 + 声明面完备性**（非结构变更），未新增/删除面，未改变快照四类面语义 |
| **P4**（产品代码变更 MUST 跑全量测试网，零回退） | **满足**——门控 exit 0 ×3 独立复跑；断言 284 → 296（**净增**）；零 `lib/**` 改动 |
| **P5**（同一动作汇入同一实现路径；被取代路径 MUST 删除，禁止并存） | **满足且为强化**——`hostSourceOf` 收口 S2/S5 宿主读取（`hostApiFile`/`hostApiHas` 残留 = **0**）；`declarationGapsOf` 被 S2/S5 复用（消除同构双份）；`anchorFieldsOf` 恒空形参删除（无调用点不一致） |
| **P8**（失败与降级 MUST 可观测） | **大体满足，一处降级 → P2-1**——detail 结构化（`declarationGaps`/`absentSymbols`/`undeclared`/`needleRepetitions`）；宿主不可达走 `note`（可见 skip）。**但** `:623` 在 `expectSymbolHost` 省略时裸抛 `TypeError`，截断后续诊断输出 |
| **P9**（宿主演进防御：能力自证 / parity 守卫） | **正向**——把「宿主锚」由文本约定升级为「宿主可达时的**包×文件存在性 + 符号逐字在位**」双机器判据；宿主不可达时正确降级（BR-03 不依赖宿主） |
| **P10-④**（测试桩宿主面形态 MUST 锚定宿主源码；禁按心智模型伪造） | **满足**——新增 6 条符号映射**逐条宿主只读实读**命中（§2.1）；「无实证不引入新符号」纪律在数据面被**遵守**（`:877-878` 的**总括措辞**除外 → P2-2；`:830` 的**历史归因**除外 → P2-4） |
| **P1**（分析基于事实，禁假设/编造） | **两处新增表述强度超过本批实证 → P2-2 / P2-4**（均非判据面） |
| **AI 专项：注释不得超宣示（no-overclaim）** | **大体满足**——R1 点名项均已改为可核对引用；自曝盲区（`:913-916`）为**正面**行为。**但**新增注释引入两处未实证断言（P2-2/P2-4）与一处覆盖声明不等宽（P2-3） |

---

## 8. 变异实验台账（全部在**仓库外**隔离副本执行并逐字节复原）

副本：`%TEMP%\fix043r2\OLD`（`git archive 2d65f6e` 全树，403 文件）与 `%TEMP%\fix043r2\NEW`（`git archive HEAD` 全树，403 文件）；两者 `node_modules` 为 junction 指向仓库（宿主可达性一致，`hostTarget.origin` = `_npx/1e7f6d9597241db0`）。**每次变异后复原均经 `git hash-object` 与对应修订 blob 比对 = `True`。**

| # | 目标 | 变异 | OLD 树 | NEW 树 | 复原 |
|---|------|------|--------|--------|------|
| E1 | S2 声明面 | M-E5：face 1 四字段全删 | — | **exit=1** `declarationGaps:["expectPackage","expectFile","expectSymbol","expectSymbolHost"]` | ✅ |
| E2 | S2 声明面 | M-E5b：`expectFile: []` | — | **exit=1** `["expectFile","expectSymbolHost.file∉expectFile"]` | ✅ |
| E3 | S2 声明面 | M-E6a：`expectPackage: 42` | — | **exit=1** `["expectPackage"]` | ✅ |
| E4 | S2 声明面 | M-E6b：省略 `expectSymbolHost` | — | **exit=1** `["expectSymbolHost"]` + **`TypeError`（P2-1）** | ✅ |
| E5 | S2 字段自洽 | M-E6c：映射 file ∉ `expectFile` | — | **exit=1** `["expectSymbolHost.file∉expectFile"]` + `absentSymbols` | ✅ |
| E6 | S2 字段自洽 | M-E6d：映射符号集 ⊊ `expectSymbol` | — | **exit=1** `["expectSymbolHost.symbols≠expectSymbol"]` | ✅ |
| E7 | S2 符号可达性 | **M-E4（= R1 M-B4 同形）**：真包真文件 + `ghostFn()` | exit=0（R1 已实证） | **exit=1** `absentSymbols:["…/lib/index.js :: ghostFn("]` | ✅ |
| E8 | S2 符号归属 | M-E4c：符号声明到错误的已声明文件 | — | **exit=1** `absentSymbols:["…/lib/types/agent.js :: selectModel("]` | ✅ |
| E9 | S5 完备性 | S5-M1：某 face `expectPackage` 置 `undefined` | — | **exit=1** `S5 … 对象归属声明完备 :: {"declarationGaps":["expectPackage"]}` | ✅ |
| E10 | S5 判别力 | **M-E7（= R1 M-B7 同形）**：捏造 schema 符号 | exit=1（R1 已实证） | **exit=1 / 2 FAIL** `{"absentSymbols":["settings_describe_result"]}` | ✅ |
| E11 | **9h-4 旁路** | **A1 同形变异**（`stale: [` 首元素前插含他人 needle 的块注释） | **exit=0（旁路复现）** | **exit=1** `needleRepetitions:["lib/stats.js :: 「host-route.js:55」登记 1 处 / 守卫内 2 处"]` | ✅ |
| E12 | 9h-4 选型 | `registered` 改**逐元素 `===` 相等** | — | **exit=1**，**恰 4 条既有 needle 假红**（`host-route.js HOST_ROUTE_PROVIDER` / `README L16`×2 / `dsh-llm lib/index.js:1618`） | ✅ |
| E13 | 基线 | 双树未变异 | **exit=0 / 178** | **exit=0 / 118 + 178** | ✅ |
| E14 | 全量门控 | M-B5 同形 + `run-all.mjs` | — | `host-contract.mjs` **FAIL（exit=1）** + `smoke.mjs`（副本环境伪影，见 P3-4） | ✅ |

**父版本对照**：`2d65f6e:tests/host-contract.mjs` 在副本内实跑 = **106 断言**（⇒ 106→118 的 +12 成立）。

---

## 9. 真实性红线声明 / 只读遵守

- **只读铁律遵守**：本审查**未**对任何仓库文件调用 Write/Edit（**唯一写 = 本报告**）；**未**执行 `git add/commit/checkout/restore/reset`；**未**修改 `.governance/**` 既有记录。全部变异只在 `%TEMP%\fix043r2*` 副本执行并**逐次字节复原核验**；副本目录已清理。
- **仓库工作树零变化实证**：受审前 / 受审后 `git status --short` **逐字相同**（`.governance/evidence-log.md`、`plan-tracker.md`、`tpa-last-run.json` 为 `M` + 四份 R0/R1 报告 `??`），`git diff --name-only` 非 `.governance` 项 = **0**；`HEAD = cfe775668d138eaa09eb4d435646c76062b97375` 全程不变。
- **事实依据可复查**：本报告全部数字均附命令或实跑输出摘要；唯一无 CI 访问的项已登记 §10。

---

## 10. 仓库外只读接触面逐条上报（M7.7 R4）

全部**只读**（`Test-Path` / `Get-Content` / `Select-String` / `Get-ChildItem`），**零写入、零创建、零删除**；目标均在 `C:\Users\peter\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\`：

| # | 时间（+08:00） | 命令（摘要） | 退出码 | 影响路径 |
|---|---------------|-------------|--------|---------|
| 1 | 11:03 | `Test-Path` + `Select-String -SimpleMatch` + `Get-Content` 逐行读 `dsh-client-ui-model-selection\lib\client.js`（`generation === this.generation` / `store.subscribe`；:47 / :53 / :292） | 0 | `…\dsh-client-ui-model-selection\lib\client.js` |
| 2 | 10:59 | `Test-Path` + `Select-String -SimpleMatch` 逐条核验 6 条符号映射：`dsh-api-session-controller\lib\index.js`（`selectModel(`）/ `…\lib\types\agent.js`（`selectionFor(` / `stateOf(` / `projectionState.pending`）；`dsh-client-ui-model-selection\lib\types\client\service.d.ts`（`directoryFor(`）/ `…\directory.d.ts`（`load(`） | 0 | 上述 5 个宿主文件（只读） |
| 3 | 10:57–11:08 | 门控与副本实跑（仓库内 `node tests/run-all.mjs` ×3；仓库内 `node tests/host-contract.mjs` / `host-abi-health.mjs`；副本内各 14 组变异实跑）——**读仓库 + 读宿主**，`node_modules` 经 junction 复用 | 0 | 仓库工作目录 + `<host>`（只读） |

- **仓库外写入面**：仅 `%TEMP%\fix043r2-scratch`（首轮副本，已删）、`%TEMP%\fix043r2\{OLD,NEW}`（双树，已删）、`%TEMP%\r2-*.txt`（实跑取件，已删）。**零仓库内写入**（本报告除外）。

### 未验证项（如实登记，**不作为通过依据**）

1. **CI 侧 `#SKIP` 实时值**：本审查无 CI 访问权限；本报告全部 skip 结论限于**本地 Windows 口径 `#SKIP 2`**（三重复现）。
2. **Developer 真实环境命令的逐条上报粒度**（声称 11）：本审查无其会话内命令级记录，**未复核**（R4 义务主体 = 执行者；本报告仅登记本人接触面，见上表）。
3. **`lib/service.js:1326` 与 `lib/host-abi/llm-selection.js` 的宿主锚现值**（R1 未验证项 2/3 延续）：不在本批锁面，本批零 `lib/**` 改动，**未核验**。
4. **`tests/fix-029-host-contract.mjs` 的 `types/agent.js:297-318` 跨文件锚**（`:998` 登记的未闭合项）：该断言需三处同步，本审查**未**逐处核验其三处现值（属 R1 P2-3 面 / 批 C）。
5. **`dsh-host-apiproxy` 包存在性再核验**：本审查**未**重跑该包的全树搜索（R0/R1 已两次实证不存在；本批仅引用其结论）。
6. **`.test-home/fix042-w2-selfref.mjs` 本体**：本审查**未**运行该未跟踪取证件（未在仓库内），故其「严格口径 = 0」的声称**未独立复现**；本报告的自指结论**不依赖**该工具（§2.2 三层自证）。

---

## 11. 交付结论摘要（供 Coordinator）

- **结论**: **`APPROVED_WITH_NOTES`**
- **`unresolved_blockers=0`**
- **P0 = 0；P1 = 0；P2 = 4；P3 = 4**
- **四项被指派遗留闭合比对裁定**：
  1. **R1 P1-1 = 已闭合** —— `declarationGapsOf`/`symbolHostGapsOf` 落地，**8 项变异全部判红**（含字段互相矛盾的 M-E6c/M-E6d 双向封闭），基线 118 不误红；残留边界 = `:623` 裸抛（**P2-1**，fail-closed 保持）。
  2. **R1 P1-2 = 已闭合** —— 取处置 **(a)** 实施；**M-E4（M-B4 同形）旧树 0 → 新树 1**；M-E4c 亦判红；S5 判别力回归 M-E7 = 1；6 条符号映射宿主实读全部为真（**零幻觉**）。
  3. **R0 P1-3 = 已闭合** —— 元素精确计数**确定性消除**旁路：**A1 同形变异旧树 exit 0 → 新树 exit 1**；`===` 选型实证（恰 4 条假红）**逐条复现**，逐元素子串计数 0 假红。
  4. **R1 P2-1 = 已闭合（计数面）／部分闭合（理由面）** —— ⑥ 段落「7 处」已改「8 处」，三口径（a 9→8→0 / b 40→24〔12/17/11→0/17/7〕/ 行数 29→14）**逐数复现**；**但** ⑧ 段落新增「宿主靶子不可稳定符号化」总括断言**无实证且与 `:5561/:5562` 实况相反**（**P2-2**），R1 P2-3 的**理由面在批 C 未动之前已被强化**，故标注「部分闭合」。
- **自指覆盖完整性裁定**：**严格口径下守卫对本文件的行号引用 = 0（PASS）**。经三层独立复核（带文件名自指 = 0 / 裸锚族 28 行 43 处逐处归属**无一处指向本文件** / `813c4a9:809` 的 8 个自指行号在 `HEAD` 同模式 = 0）。**本判定不采信** Developer 的启发式工具（其盲区**超出自述**）**亦不采信**其「32 行全部非自指」的表述——本审查另行发现其**判定面与覆盖不等宽**（**P2-3**）。
- **独立复算全部吻合**：越界 2 文件 +209/−48 ✅ / 锚计数 34/67、32/75 与「净 +36」更正 ✅ / 断言 106→118、178、合计 296（+12 构成） ✅ / 门控 exit 0 ×3 + `#SKIP 2` ✅ / 结构守恒 `stale: [` = 26 ✅ / 三口径数字 ✅ / 6 条宿主符号映射 ✅ / 4 条 `===` 假红 ✅ / 14 组变异逐次字节复原 ✅。
- **建议遗留计划**：P2-1（`:623` 防御，建议**本批尾修**，一处 2 行改动）/ P2-2（⑥ 段落理由改逐处标注，建议**并入批 C 的 P2-3 一并处理**）/ P2-3、P2-4（判定面与归因措辞，建议后续守卫批次）/ P3×4（台账或顺带）。

---

**审查者**：Code Reviewer Agent（只读审查；唯一产出物 = 本文件）
**报告路径**：`.governance/review-FIX-043-R2-input.md`
**下一步**：Coordinator 用 `review-record` 机写 canonical 报告与 REVIEW 证据行（本报告不作为机录替代）。
