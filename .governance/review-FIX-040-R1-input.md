# 代码审查报告（review-FIX-040-R1-input）

- **round = R1**（R0 返工后复审：验证 R0 findings 闭环）
- **前轮引用**：`REVIEW-FIX-040-R0` / 报告 `.governance/review-FIX-040-R0-input.md`（R0 = **NEEDS_CHANGE**，P0=0 / P1=1 / P2=3 / P3=8）
- **审查对象**：返工两笔 `ebda9d1`（P1-1 收口 A+B+C，+ P2-1 + P3-1 + P3-6）/ `e13ca17`（P3-7）；受审 HEAD = **`e13ca17`**；文件集 = `{tests/host-abi-health.mjs, tests/metrics.mjs, tests/install-entry.mjs}`（`+76/−25`）
- **审查者**：Code Reviewer Agent（同一实例复审轮；只读；未修改任何产品代码；未运行任何写操作；唯一写入 = 本报告）
- **执行依据**：两笔 `git show` 全量 diff、最终态逐行核对、**R0 全部 findings 逐条比对**、本机独立复跑门控与守卫套件（第 5 次）、断言集机比对、**9h-2/9h-3 判据的只读复刻 + 两态变异仿真 + R0 版本谓词对照**
- **结论（四态）**：**NEEDS_CHANGE**
- **计数（本轮新发现）**：P0 = 0 / **P1 = 1** / P2 = 1 / P3 = 2
- **未解决阻塞项**：**1**（P1-1(new)，非通过终态 ⇒ 不适用 `unresolved_blockers=0` 字段）

**一句话理由**：R0 P1-1 的 A / B / C（死锚改写、入表完备性自检、标签限定语）**三项全部真实落地**，P2-1 / P3-1 / P3-6 / P3-7 亦已闭合；但 B 的实现把对象侧判据由「smoke.mjs 单源」扩为**四处析取（含被守卫文件自身）**，导致 **21 对中 5 对退化为自满足（4 对 `anchor === object` 同一谓词判两次）**——我已用两态仿真证明：smoke 侧 3 条断言改名 / wrapper 目标行改写后 `deadAnchors` **仍为 0（静默绿）**，而 R0 版谓词对同一变异 **判红 3 项** ⇒ **R0 已闭合的「锚指向不存在对象」失效类对 5 个名字重新可静默复发**。修法约 5 行（对象串加判别前缀 + 显式单源），我已实证该修法对上述全部变异判红。

---

## 一、R1 独立取证清单（本审查全部实测）

| # | 事实 | 命令 / 结果 |
|---|------|------------|
| 1 | 范围与越权面 | `git log --oneline 08d562a..e13ca17` = 2 笔；`git diff --stat` = 3 文件 `+76/−25`，与调度声明**逐字一致**；`.governance/**` / `AGENTS.md` / `CHANGELOG.md` / `package.json` **零触碰** ✅；`git status --short` = 仅 `.governance/{evidence-log.md,tpa-last-run.json}` 修改 + 两份 R0 机录/报告（治理面，非本批 commit 内容） |
| 2 | 死锚串零残留 | `git grep -F "mirrors model identity"` = **空** ✅（Coordinator 机验复核一致） |
| 3 | **门控独立复跑（第 5 次）** | `node tests/run-all.mjs` @`e13ca17` = `ALL 20 SUITES + 4 RUNNER MODULES (via smoke.mjs) PASSED (26.6s)  #SKIP 2 (smoke.mjs×2)` **exit 0**（Coordinator 28.0s 同量级）；两条 skip 原文与 R0 实测一致（`0o600` 可见 skip + `POSIX online checks`） |
| 4 | 守卫套件单跑（含新断言可见性） | `node tests/host-abi-health.mjs` = **`ALL HOST ABI HEALTH TESTS PASSED (159 assertions)`，exit 0**；13 条 `B5 9h R-1` + `9h-2` + `9h-3` **全绿**（R0 期该套件为 158 断言 ⇒ 净 +1 = 9h-3） |
| 5 | 断言集合机比对 | 标签集 `cf…`/`08d562a`=1777 → `e13ca17`=1778：**REMOVED=1**（`9h-2` 标签改名，断言同址、条件扩展）/ **ADDED=2**（改名后新标签 + `9h-3`）⇒ **实质零断言删除、净增 1**；`9h` 的 check 为模板字面量（不在标签集内），其标签变更经逐行读 diff 确认 |
| 6 | **P1-1(A) 新锚对象逐一实存** | `lib/wrapper.js:386` 逐字 = `return { ...resolved, provider: wrapRoute, inputModalities: modalities }` ✅；`tests/adapter-parity.mjs:139` = `check('prepared model carries wrapRoute rewrite', prepared.model.provider === 'fake-prov' + WRAP_SUFFIX)` ✅；`tests/metrics.mjs:125` = `checks.push(['twin resolveModel 镜像模型身份（模型 id 不变）', twinResolved.id === MAIN_MODEL && twinResolved.provider === \`text-provider${WRAP_SUFFIX}\`])` ✅ ⇒ 三条引用**全部指向实存对象**，`metrics.mjs:118-124` 新注释**零幻觉引用** |
| 7 | `ANCHOR_OBJECTS` 表规模与锚侧完整性 | 我的解析器对 `:757-781` 逐行解析：**21 对全部成功解析**；`missingAnchors` 侧 **21/21 在 `metrics.mjs` 在位**（两次独立复算一致） |
| 8 | **9h-3 对 R0 缺陷形态的覆盖（关键）** | 只读复刻 9h-3 逐行 `/「([^」]+)」/g` 判据：基线 `unregistered = 0`；**把 R0 的死锚原形态（`smoke.mjs` 与 `「…」` 被换行 + `//` 注释标记隔断）内存注入后 ⇒ `unregistered = 1`（`L119 「twin resolveModel mirrors model identity」`）** ⇒ **9h-3 真能覆盖 R0 手工发现的那条形态** ✅（此为本轮最关键的正向验证：R0 的 generic 抽取因 `smoke\.mjs「` 前缀约束而漏，9h-3 改为抽取裸 `「…」`，故命中） |
| 9 | 9h-3 阈值现状 | `metrics.mjs` 现有 `「…」` 候选 **20 个**，最短 **22 字符**，**无 <12 者** ⇒ 当前阈值不产生漏判（但构成未来短名的静默通道，见 P3-1(new)） |
| 10 | **9h-3 假阴性通道（实证）** | 内存注入「新标签为既有表键的子串」形态（`「takes over default model」` ⊆ 键 `smoke.mjs「wrapper takes over default model」`）⇒ **`unregistered = 0`（静默通过）**；而等长/非子串新标签（`「twin resolveModel mirrors」`）⇒ 判红 1 ⇒ 通道确系 `isKnown = tableKeys.some(key => key.includes(label))` 的**子串包含式匹配**所致（见 P2-1(new)） |
| 11 | **对象侧自满足分析（本轮核心实证）** | 按 `:785-786` 的四源析取谓词逐对复算：**6/21 对可由 `metricsSource` 自身满足** —— 其中 **4 对 `anchor === object`（同一谓词判两次）**：`attachmentIds resolution (M2)`、`memory segment carries id and untrust annotation`、`current-turn image not double-injected as memory`、`twin resolveModel 镜像模型身份（模型 id 不变）`；**1 对 object ⊂ anchor 文本**：`vision call returns text without echoing injected images (B)`；**1 对 object = `lib/wrapper.js` 实现行但被 metrics 注释原文引用**：`return { ...resolved, provider: wrapRoute, … }` |
| 12 | **变异仿真：smoke 侧断言改名** | 内存改写 `smoke.mjs` 三条裸标签断言（`vision call returns…` / `memory segment carries id…` / `current-turn image not double-injected…`）后复算谓词 ⇒ **`deadAnchors = 0`（9h-2 静默绿）**；盲区对象恰为上述 4 项（含 `twin resolveModel 镜像模型身份（模型 id 不变）`） |
| 13 | **变异仿真：wrapper 侧目标行漂移** | 内存改写 `lib/wrapper.js:386`（`provider: wrapRoute` → `provider: OTHER`）后复算 ⇒ **`deadAnchors = 0`（静默绿）**——即 **P1-1(A) 新锚自身声明的实现面对象漂移亦不被判红**（因 metrics 注释引用了原串） |
| 14 | **R0 版本谓词对照（回归判定）** | 用 R0 的 `deadAnchors`（仅 `smokeSource`）对同两变异复算 ⇒ **`deadAnchors = 3`（判红）**（`return { ...resolved, … }` / `check('prepared model carries wrapRoute rewrite'` / `twin resolveModel 镜像模型身份（模型 id 不变）`）⇒ **判据强度确为 R1 新引入的退步**（R0 版能判红、R1 版静默绿） |
| 15 | **建议修法实证（判别前缀 + 显式单源）** | `check('vision call returns text without echoing injected images (B)'`（smoke:1852）/ `check('memory segment carries id and untrust annotation'`（smoke:2723）/ `check('current-turn image not double-injected as memory'`（smoke:2729）/ `console.log('attachmentIds resolution (M2):'`（smoke:1880）/ `checks.push(['twin resolveModel 镜像模型身份（模型 id 不变）'`（metrics:125）/ wrapper 实现行（wrapper:386）**六条判别串在各自目标源 100% 实存**；按「判别前缀 + 显式单源」复算：**基线 dead = 0（绿）**、**smoke 3 改名 + wrapper 行改写后 dead = 4（红）** ⇒ 该修法对全部变异判红且不误红 |
| 16 | P2-1 stale 补全核验 | `git show cf0e935:tests/metrics.mjs` 旧行号锚**唯一串 = 12**；现行 stale 清单（`:720`）**= 12**；`Compare` ⇒ **missing = 空 / extra = 空** ✅（11→12 补入 `smoke.mjs:1680-1681` 正确） |
| 17 | P3-6 片段键清零 | `^\s*\['\+「` 在 `host-abi-health.mjs` **零命中** ✅（5 个 `+「…」` 键已改完整整串键；9h-3 的 `+「label」` 分支因此成为**未走到的保留分支**，见 P2-1(new) 附注） |
| 18 | P3-7 纯格式核验 | `e13ca17` 全量 diff = **同一 JSDoc 块内 4 行重排（+4/−3）**，零代码行、零断言、零字符串字面量（`:52-53` 的「（已知覆盖缺口，/ 台账候选）」已并入一行，`:49-53` 行宽收敛） ✅ |
| 19 | 推送状态（裁定依据） | `origin/main` = **`cf0e935`**；`git rev-list --count origin/main..HEAD` = **12** ⇒ 本批（10+2 笔）**尚未 push**；R0 机录 `review-FIX-040-R0.md` 在档 |
| 20 | 环境隔离（真实环境防护） | 守卫套件与门控均为只读/临时 `DSH_HOME` 隔离（R0 取证 #19 同源）；本审查的**全部变异均为内存字符串仿真**，未对工作树执行任何写操作 ⇒ 无残留风险 |

---

## 二、R0 findings 逐条处置

| R0 项 | 本轮处置 | 证据 |
|-------|---------|------|
| **P1-1(A)** 死锚改指实存对象 | **已修复（实测通过）** | 取证 #2（死锚串全库零残留）+ #6（三条新对象逐字实存）+ `metrics.mjs:118-124` 注释零幻觉引用 |
| **P1-1(B)** 表补全 + §9h-3 入表完备性自检 | **已修复（含 1 项新引入缺陷）** | 表 14→21（取证 #7）；9h-3 落地且**真能覆盖 R0 的缺陷形态**（取证 #8，`unregistered=1`）✅；但四源对象谓词引入自满足通道 ⇒ **P1-1(new)**（取证 #11/#12/#13/#14） |
| **P1-1(C)** 标签改限定语 | **已修复** | `:789` = `metrics.mjs 本表所列断言名式锚全部有对象（锚在位 × 对象在位）`；`:787-788` 注释明示「判别范围 = 本表所列锚」✅ |
| **P2-1①** stale 补 1 项 | **已修复** | 取证 #16：12/12 逐项一致，零漏项零多项 |
| **P2-1②** 表外 5 名补入表 | **已修复** | `:764/:765/:767/:769/:771/:773/:775` 五名（`reminder carries attachment id…` / `escape-group turn also injects reminder` / `marker offers recognition…` / `attachmentIds resolution (M2)` / `memory segment carries id…` / `current-turn image not double-injected…` / `log keeps original image block (F3)`）**已入表且非仅登记** —— 其中 3 名带 `check('` 判别前缀（真核验）、4 名为裸标签（落入 P1-1(new) 盲区） |
| **P2-1③** `:717` 注释改如实 | **部分已修复** | `:718-719` 已改限定语形态（「仅指本清单所列锚」）；但新增「由 9h-2 的对象核验 + 9h-3 的入表完备性自检覆盖」对跨行/合并/片段形态的**对象存活**仍不成立（P1-1(new) 同根）⇒ **残留过度表述（P3-2(new)）** |
| **P2-2** 归因更正（0o600 实在 `1b5cead`，一笔两问题） | **未修复（正当延后 / 台账）** | 两笔返工未触 `tests/smoke.mjs`（取证 #1）；提交信息亦未声称闭合该项 ⇒ 符合「历史不回改 + 台账注记」裁定（见 §三.5） |
| **P2-3** `4e5c848` 中间态口径自相矛盾 | **未修复（正当延后 / 台账）** | 同上；最终 HEAD 口径 `#SKIP 6 / #SKIP 2` 我已于 R0 穷举复核、本轮门控复跑再次实测 Windows 侧 `#SKIP 2` 一致 |
| **P3-1** 守卫标签「零残留」vs 实采 | **已修复** | `:741` 标签改「**清单所列**旧式锚零残留 + 替代式锚在位」；`:738-740` 注释显式说明 `install.ps1:1` / `install.sh:2` 类宿主入口自述锚**现值准确、刻意不入清单**——与实采一致 ✅ |
| **P3-2** `.test-home` 取证件未入治理记录 | **仍未满足（台账）** | 本轮又新增 `.test-home/fix040-r1-demo.mjs`（4 场景变异脚本）；仍未被 evidence-log 引用（`git status` 干净因 `.gitignore`）⇒ 该项应按 Coordinator 动作归档 |
| **P3-3** 镜像锚数字（15/9 vs「各 12」） | **未修复（正当延后 / 台账）** | 两笔未触 `lib/client.js` / `tests/served-client.js`（取证 #1） |
| **P3-4** `CHANGELOG.md:59` 数字被 supersede（已发布节冻结） | **未修复（正当延后 / 台账）** | 两笔未触 `CHANGELOG.md`（取证 #1） |
| **P3-5** `.cmd` 断言依赖实机 `ComSpec` | **未修复（可选）** | 两笔未触 `tests/smoke.mjs` / `lib/service.js` |
| **P3-6** 片段键改整串键 | **已修复** | 取证 #17：零残留；9h-3 判定一致（表内 5 名现以整串键登记，`isKnown` 命中路径更直观） |
| **P3-7** JSDoc 括号断行 | **已修复** | 取证 #18：纯注释重排，零语义变化 |
| **P3-8** `README L125` 台账引用位置漏 2 处 | **未修复（正当延后 / 台账）** | 两笔未触 `lib/service.js` / `tests/routing-paths.mjs`；台账补全仍待 Coordinator |

**新引入（本轮）**：**P1-1(new)**（对象核验自满足退化 = 回归）+ **P2-1(new)**（9h-3 子串式假阴性通道）+ P3-1(new) / P3-2(new)。**无 P0**；R0 其余项状态与裁定不变。

---

## 三、复审要求 7 项逐项结论

### 1. P1-1 是否真闭合 —— **A/C 完全闭合；B 的机制存在新引入的自满足通道（未闭合）**

- **新锚对象逐一实存** ✅（取证 #6）：`lib/wrapper.js:386` 的实现行、`adapter-parity.mjs:139` 的对偶断言、`metrics.mjs:125` 的本文件 checks 标签——**三条逐字命中**；`metrics.mjs:118-124` 新注释**不含任何不存在的引用**（`git grep -F "mirrors model identity"` 空，取证 #2）⇒ 幻觉引用已消除。
- **反向完备性抽查（任务点名要求）** —— 我对 9h-3 做了**判据复刻 + 内存注入两态仿真**（取证 #8/#9/#10）：
  - ✅ **R0 缺陷形态确被覆盖**：把原死锚行（`见 smoke.mjs` + 换行 + `// 「twin resolveModel mirrors model identity」断言）；`）注回，9h-3 判 `unregistered=1@L119` ⇒ **9h-3 的逐行裸 `「…」` 抽取真能命中跨行 / `//` 隔断形态**（这正是 R0 中 generic 抽取的盲点，现已消除）。
  - ⚠️ **但存在未披露的假阴性通道**：`isKnown` 用 `key.includes(label)` 子串式匹配 ⇒ 新标签若为既有表键的子串则视为已入表（实测 `「takes over default model」` ⇒ `unregistered=0`）⇒ **P2-1(new)**。
  - ⚠️ **阈值通道**：`label.length < 12` 直接跳过（注释已披露）；当前 20 个候选最短 22 字符、零 <12 ⇒ 现状无漏判，但短名死锚可静默 ⇒ **P3-1(new)**。
- **9h-3 判据可达性与正确性（任务点名要求）** —— 只读判别结论：
  - **可达**：`unregistered` 构造点为 `:808`，非空即 `check(...)` false（`:811-812`）⇒ `failures` 累加 ⇒ `:859-860 process.exit(... 0 : 1)` ⇒ `run-all.mjs:193` 非零汇总 ⇒ **判红有牙齿**（且本机实测该 check 判绿）。
  - **长度阈值不误伤当下**（零实例）、**片段键分支不误伤**（`+「label」` 分支只增加跳过、方向为更宽松，不会产生假红；且该分支现为未走到的保留代码）。
  - **非 `「」` 引号形态不参与**（结构性边界，未披露；当前 `metrics.mjs` 锚全部使用 `「」`，无实例）⇒ 与 P2-1(new) 合并记录。
- **闭环判定**：R0 P1-1 的**缺陷本体已闭合**；但「对象核验」的**判别强度**在返工中被削弱（见 §四 P1-1(new)），故 **P1-1 整体不判闭合**。

### 2. §9h-3 判据可达性与正确性 —— 可达、结构清晰，但含 1 条未披露假阴性通道 + 1 条已披露阈值通道

- 详见上条与取证 #8/#9/#10；另两处**代码卫生**附注（并入 P2-1(new)）：① `:806-807` 的 `+「label」` 分支自 P3-6 收口后已无实例（保留分支，建议注明用途或删除）；② `:812` 的 detail 字段 `{ candidates: tableKeys.length }` 实为「表键数」而非「候选名数」，语义易误读，建议改名 `tableKeys`。

### 3. P2-1 三项 —— **①② 完全闭合；③ 部分闭合（残留过度表述）**

- **stale 12/12** ✅（取证 #16：与 `cf0e935` 实测唯一串逐项一致，missing/extra 均空）。
- **5 名补入后表自洽**：21 对全部解析成功、锚侧 21/21 在位（取证 #7）；其中 4 名因「裸标签对象」落入自满足盲区（非「补入动作」之误，而是谓词四源析取之误 ⇒ 归 P1-1(new)）。
- **`:718-719` 新表述**：限定语部分如实 ✅；「由 9h-2 的对象核验 + 9h-3 的入表完备性自检覆盖」的**对象存活面不成立**（跨行/合并/片段形态的 4-5 名对象核验已退化）⇒ 残留过度表述，**P3-2(new)**，随 P1-1(new) 一并修。

### 4. P3-1 / P3-6 / P3-7 处置正当性 —— **三项均正当且如实**

- **P3-1（限定语）**：`:741` 标签 + `:738-740` 注释如实界定「只覆盖清单」，并点名 `install.ps1:1` / `install.sh:2` 属**现值准确的宿主入口自述锚、刻意不入清单**——与实采一致（我于 R0 已核实该两串现值准确）✅。
- **P3-6（片段键→整串键）**：5 键全改（取证 #17），且 9h-3 判定一致（`isKnown` 走整串命中；`+「…」` 保留分支不再被依赖）✅。
- **P3-7（纯格式）**：同一 JSDoc 块内 4 行重排（取证 #18），零代码/断言/字符串字面量变化 ✅。

### 5. R0 其余项状态 + 「是否应修改历史提交」—— 逐条见 §二；**不修改历史提交（对齐裁定）**

- **逐条状态**：P2-2 / P2-3 / P3-2 / P3-3 / P3-4 / P3-5 / P3-8 均**未修复且属正当延后（台账/可选）**——理由与 R0 裁定一致（代码面无修复对象或属可选增强），两笔返工亦未误标其已闭合 ✅。
- **本轮是否应修改历史提交** —— **裁定：不修改，对齐 Coordinator 裁定（历史不回改 + 如实入 evidence-log）**，依据三条：
  1. **证据链以 hash 为锚**：R0/R1 报告、机录、Developer 两态实证均以 commit hash（`1b5cead` / `4e5c848` / …）为可复查锚，改写即断链；项目已有「如实注记而非回改」的先例（FIX-038 R1 的 `3f3e59b` 空 diff 口径、`e1fe160` 「自引入」表述均以台账更正承载）。
  2. **差异性质为记录性口径而非代码语义**：P2-2 是归属/表述问题，P2-3 是中间态文档数字，均已在批内自洽或可台账化。
  3. **事实补充（供 Coordinator 知悉，不改变裁定）**：本批 12 笔**尚未 push**（`origin/main` = `cf0e935`，取证 #19）⇒ 「不可变性」在本例中**不是强制约束、而是纪律选择**；若 Coordinator 出于最小化历史噪声的考虑选择 push 前一次性 squash/rebase，则 MUST 同步更新全部证据中的 hash 引用（R0/R1 报告 + 机录 + evidence-log）——**成本高于收益，本审查不建议**。

### 6. 无新引入（P0~P2）+ 越权面 + 断言集合

- **越权面 = 零**（3 文件，取证 #1）；**断言集合 REMOVED=0（实质）**：唯一「REMOVED」是 `9h-2` 的标签改名（同址同断言，条件由单源扩为四源），净增 1（`9h-3`）；守卫套件断言数 158→**159**（取证 #4/#5）。
- **新引入**：**P1-1(new)**（对象核验退化 = 判据强度回归，非运行期缺陷）+ **P2-1(new)**（9h-3 子串通道）+ P3-1(new)/P3-2(new)（通道披露与表述）⇒ **存在 1 项 P1 级新引入**，故本轮不能判通过。

### 7. 关键判定：本批（10+2 笔）是否具备 push 条件 —— **不建议在 P1-1(new) 闭合前 push；且不得声称 CI 已验证**

- **不建议现在 push**：本批的**交付面本身包含「锚守卫」**（N4 = 全批最高价值项）。带着一条**已实证的静默绿通道**（`deadAnchors=0` 于 smoke 改名 / wrapper 行漂移两态）上线，等于把失效模式固化为「有守卫 = 已看护」，与本批立项动机（防同类漂移复发）与项目原则 4/8（看护网不得静默降级）冲突；而修法成本仅约 5 行（取证 #15 已实证有效）⇒ 一轮短返工 + 复审的成本/收益比明显有利。
- **若 Coordinator 裁量以「台账 + 后续批」承载**：则 MUST 在 evidence-log / 台账**如实登记该静默通道的范围**（逐条列出 5 个自满足表项与两态复现命令），并**不得**在任何文档/commit message 中表述为「对象核验闭环」「全部候选锚名均有对象核验」；同时 P3-2(new) 的过度表述当轮即修（纯注释，零风险）。
- **CI 口径**：`#SKIP 6 (host-contract.mjs×2, smoke.mjs×4)` 仍为**预期值**（ubuntu 未实测，本机无 Linux/WSL/docker）；**不得声称 CI 已验证**；push 后由 Coordinator 核验 ubuntu 首跑（9h/9h-2/9h-3 为纯文件读取判据，**平台中立**，ubuntu 风险低，但仍以实测为准）。

---

## 四、新发现（本轮）

### P0（阻塞）—— 0 条
无。

### P1（关键，建议本轮修改）—— 1 条

**P1-1(new)｜对象核验由「smoke 单源」扩为「四处析取（含被守卫文件自身）」⇒ 6/21 对自满足（4 对 `anchor === object` 同一谓词判两次），R0 已闭合的「锚指向不存在对象」失效类对 5 个名字重新可静默复发；且新增注释的对象来源归因不实**
- 位置：`tests/host-abi-health.mjs:783-786`（四源析取谓词）、`:761/:769/:771/:773/:780`（自满足表项）、`:749-751`（「闭环」表述）、`tests/metrics.mjs:119-121`（注释引用被用作满足源）
- 事实依据（全部可复查）：
  1. **自满足分析**（取证 #11）：按 `:785-786` 谓词逐对复算，`metricsSource` 单源即可满足 **6/21** 对；其中 **4 对 `anchor === object`**（`attachmentIds resolution (M2)`、`memory segment carries id and untrust annotation`、`current-turn image not double-injected as memory`、`twin resolveModel 镜像模型身份（模型 id 不变）`），**1 对 object ⊂ anchor 文本**（`vision call returns text without echoing injected images (B)`），1 对 object 为 `lib/wrapper.js:386` 实现行但**被 `metrics.mjs:119` 注释原文引用**（`return { ...resolved, provider: wrapRoute, inputModalities: modalities }`）。`anchor === object` 者等价于 `X && X`，**在任何输入下判绿**。
  2. **变异仿真（smoke 侧）**（取证 #12）：内存改写 `smoke.mjs` 三条断言标签后，`deadAnchors` **= 0（静默绿）**——即「锚指向不存在对象」在 9h-2 上不可见；此时仅 9h-3（入表完备性）仍绿 ⇒ 无非空兜底。
  3. **变异仿真（wrapper 侧）**（取证 #13）：内存改写 `lib/wrapper.js:386` 的 `provider: wrapRoute` 后，`deadAnchors` **= 0** ⇒ **R0 P1-1(A) 新锚自身声明的实现面对象漂移亦不判红**（metrics 注释保留原串）。
  4. **回归判定**（取证 #14）：以 R0 版谓词（仅 `smokeSource`）对同两变异复算 ⇒ `deadAnchors = 3`（判红，含 `return { ...resolved, … }` 与 `twin resolveModel 镜像模型身份（模型 id 不变）`）⇒ **R1 是判据强度退步，而非等价重构**。
  5. **归因不实**：`:783-784` 称对象可「在 metrics.mjs 自身 checks（本文件断言面）」满足——但对上述 5 对，命中的字符串**不是 metrics 的 check 标签**，而是 **anchor 文本自身 / 注释中的代码引用**；唯一名副其实的自引用项是 `twin resolveModel 镜像模型身份（模型 id 不变）`（metrics.mjs:125 确有该 `checks.push([...])`）。`:749-751`「两项合起来才构成『metrics 全部候选锚名均有对象核验』的闭环」与 `:718-719` 的同类表述因此**仍属过度声称**（与 R0 P2-1③ 同型复发）。
  6. **演示未覆盖该形态**（陈述事实，非指责）：`.test-home/fix040-r1-demo.mjs:50` 场景 3 变异的是 `check('memory segments capped at recent 5'`——该表项对象**带 `check('` 判别前缀且仅由 smoke 源满足** ⇒ 必然判红，故未能暴露盲区。
- 影响：本轮把「完备性」关进机器看护（9h-3）是对的，但**对象存活**这一半在 6/21 对（含 5 个真实核验项）退化为同义反复/自引用 ⇒ 判绿不再构成「锚有对象」的证据；R0 已判定为 P1 的同一失效类（假安全感 / 看护静默降级）在这一半重新成立，且注释宣称了未达成的闭环。
- 修复建议（**已实证有效**，约 5 行；取证 #15）：
  - **A（推荐）** 给对象串一律加**判别前缀**并**显式声明单源**（把表项改为 `[锚, 对象, 源]` 三元组）：
    - `check('vision call returns text without echoing injected images (B)'`（smoke:1852）
    - `check('memory segment carries id and untrust annotation'`（smoke:2723）
    - `check('current-turn image not double-injected as memory'`（smoke:2729）
    - `console.log('attachmentIds resolution (M2):'`（smoke:1880，该名为 section 头而非 check 标签）
    - `checks.push(['twin resolveModel 镜像模型身份（模型 id 不变）'`（metrics:125，真正的自引用项，判别前缀使其不可能被注释文本碰撞）
    - wrapper 项保留实现行但**只对 `wrapperSource` 校验**（不参与四源析取）
    ⇒ 我的复算：**基线 dead = 0（绿）**、**smoke 3 改名 + wrapper 行改写后 dead = 4（红）** ⇒ 盲区关闭且无误红。
  - **B** 同步修正 `:783-784` / `:749-751` / `:718-719` 的表述（删去「metrics 自身 checks」作为通配源的说法与「闭环」无条件声称，改为「本表 21 对各自按声明源核验」）。

### P2（建议修改，可作为遗留项）—— 1 条

**P2-1(new)｜§9h-3 的 `isKnown` 采子串包含式匹配 ⇒ 未披露的假阴性通道（新标签若为既有表键的子串则视为已入表）**
- 位置：`tests/host-abi-health.mjs:799`（`const isKnown = (label) => tableKeys.some((key) => key.includes(label))`）
- 事实依据（取证 #10）：内存注入 `「takes over default model」`（既有键 `smoke.mjs「wrapper takes over default model」` 的子串）⇒ **`unregistered = 0`（静默通过）**；对照注入非子串新标签 ⇒ 判红 1 ⇒ 通道确由子串式匹配造成。当前 20 个候选名**均非**「仅靠子串」识别（多数是键的直接子串命中 = 设计内），故**现状零漏判**；但该方向使「新写锚名与既有名部分重合」这一最可能的笔误形态（如漏字/截断）恰好落入盲区。
- 影响：9h-3 的声明目的（新增锚未入表即红）在子串形态下失效；与 P1-1(new) 同属「完备性声称 > 实现」。
- 建议：改为**精确匹配**（`tableKeys.includes(label)`）并保留显式片段形态（若仍需兼容 `+「…」` 注册，则用显式集合而非子串）；同时清理两处代码卫生：`:806-807` 的 `+「label」` 分支（P3-6 后已无实例，建议注明用途或删除）、`:812` 的 detail 字段名 `candidates`（实为表键数，建议改 `tableKeys`）。

### P3（讨论/建议，不要求修改）—— 2 条

**P3-1(new)｜9h-3 的长度阈值（<12 字符不参与）构成未来短名死锚的静默通道（当前无实例，注释已披露）**
- 位置：`tests/host-abi-health.mjs:795`（注释披露）、`:804`（`if (label.length < 12) continue`）
- 事实依据（取证 #9）：当前 `metrics.mjs` 的 `「…」` 候选 20 个、最短 **22 字符**、**零 <12** ⇒ 阈值现状不产生漏判；但短名（如 `「bad label」`）将既不入表检查也不判红。
- 建议：可选把判据改为「形态判别优先」——候选名 MUST 以 `「」` 且**同时**出现在 `smoke.mjs「…」`/`checks.push(['…'` 等锚形上下文，或对 <12 者要求显式白名单；否则在注释中补一句「阈值内短名不参与」的显式风险声明（现注释已述「避免误纳」但未述其漏判面）。

**P3-2(new)｜`:718-719` 与 `:749-751` 的覆盖表述在对象存活面仍属过度声称**
- 位置：`tests/host-abi-health.mjs:718-719`（「跨行/合并写作/片段键形态…由 9h-2 的对象核验 + 9h-3 的入表完备性自检覆盖」）、`:749-751`（「两项合起来才构成…闭环」）
- 事实依据：由 P1-1(new)（取证 #11/#12/#13）——4-5 个自满足表项的**对象存活**未被核验，故「覆盖 / 闭环」在对象面不成立；R0 P2-1③ 曾裁定「不得再出现不成立的覆盖声明」，本处为同型残留。
- 建议：随 P1-1(new) 的 B 一并改写为如实范围表述（纯注释，零风险，建议当轮即改）。

---

## 五、硬门槛裁决

| 门槛项 | 阈值 | 实测 | 裁决 |
|--------|------|------|------|
| P0 阻塞问题数 | = 0 | 0（§四 P0 无） | **PASS** |
| 5 维度全覆盖 | = 100% | 见下逐维度结论 | **PASS** |
| 每条发现标注级别 | = 100% | 新发现 P1×1 + P2×1 + P3×2 均带文件:行号 + 事实依据 + 建议；R0 15 项逐条带处置状态 | **PASS** |
| 设计一致性检查 | 已完成 | 与项目原则 4（看护/防护网）、**原则 8（失败/降级 MUST 可观测——本处判据失效无观测）**、原则 9（守卫须自证能力）、FIX-037 ①「禁静默降级」、`ci.yml` 头部契约、P5 单一路径逐项比对：**1 项偏离 = P1-1(new)**（对象核验对 5 项退化为静默绿）；另 P2-1(new) 覆核不足 | **PASS（含 1 项偏离记录）** |
| AI 代码专项 5 项 | 全部完成 | ① mock 残留：无（本轮零夹具变更）② 硬编码：无（`ANCHOR_OBJECTS` 为判据输入；新增自满足不属硬编码通过而属谓词析取过宽）③ **幻觉引用：R0 的该项已消除（死锚零残留、三条新对象逐字实存）** ④ 未实现 TODO：无（两笔 diff `TODO/FIXME/XXX/HACK` 零命中）⑤ 过度实现：无越界文件；唯一形态问题 = 谓词四源析取过宽（P1-1(new)） | **PASS（AI 专项无新增命中）** |

### 五维度逐项结论（摘要）

- **正确性 —— 通过（附 1 项 P1 于守卫分析面，非运行期）**：P3-7 纯注释重排零语义；新锚对象逐字实存（取证 #6）；9h-3 判据可达且覆盖 R0 形态（取证 #8）；门控与守卫套件本机 exit 0（取证 #3/#4）。
- **安全性 —— 通过**：3 文件均为测试基础设施（零产品代码、零 `lib/**` 改动 ⇒ 无运行期攻击面/权限/数据路径变化）；变异均为内存仿真，工作树零写操作（取证 #20）。
- **可维护性 —— 通过（附 1 项 P2 + 2 项 P3 建议）**：表 14→21 结构清晰、限定语形态如实、P3-1/P3-6/P3-7 已闭合；负向 = 四源析取过宽（P1-1(new)）、子串式匹配（P2-1(new)）、阈值/表述残留（P3-1/P3-2(new)）。
- **性能 —— 通过**：新增 9h-3 为单次读文件 + 正则遍历（O(行×引号)）；守卫套件本机全跑 210ms 级、门控总耗时 26.6s（无回退）。
- **测试覆盖 —— 通过（附 1 项 P1 缺口记录）**：净增 1 断言（9h-3）、零实质删除；完备性（入表）已由人工改为机器看护（本轮实质增益）；**但对象存活判别在 6/21 对退化**（P1-1(new)）⇒ 覆盖声明须收窄或修实。

### 审查结论

> **NEEDS_CHANGE**
>
> 理由：R0 的 P1-1 **缺陷本体已真实闭合**（死锚串全库零残留；三条新锚对象逐字实存；9h-3 **经我两态仿真证明能覆盖 R0 手工发现的跨行/`//` 隔断形态**；标签与注释已改限定语），P2-1① / P3-1 / P3-6 / P3-7 **均已闭合**，门控与守卫套件本机 **exit 0（159 断言）**、零实质断言删除、零越权、零残留。**但** P1-1(B) 的实现把对象侧判据扩为**四处析取（含被守卫文件自身）**，使 **21 对中 6 对自满足（4 对 = 同一谓词判两次）**，我已实证 smoke 侧断言改名与 `lib/wrapper.js` 目标行漂移两态下 `deadAnchors` **均为 0（静默绿）**，而 R0 版谓词对同一变异 **判红 3 项** ⇒ **R0 已闭合的「锚指向不存在对象」失效类对 5 个名字重新可静默复发，且伴随对象来源归因不实与「闭环」过度声称**（P1-1(new) + P2-1(new) + P3-2(new)）。修法约 5 行且**已由我实证有效**（判别前缀 + 显式单源：基线绿 / 全部变异红），成本远低于「带着静默绿通道上线」的长期代价 ⇒ 本轮判 **NEEDS_CHANGE**（非 P0 级：无运行期/数据/安全影响），返工后请派发**复审（round=2，注入本报告路径）**。

---

## 六、未验证项声明（事实依据红线）

1. **ubuntu 侧执行结果仍未实测**：`#SKIP 6 (host-contract.mjs×2, smoke.mjs×4)` 仍为**预期值**（R0 穷举推导 + 本轮 Windows 实测复核）；本机无 Linux/WSL/docker ⇒ 不可复跑，**不得读作已验证**。9h/9h-2/9h-3 为纯文件读取判据（平台中立），ubuntu 风险低但仍以首跑日志为准。
2. **两组变异仿真为「只读复刻 + 内存字符串替换」**：我**未执行** Developer 的变异脚本（Reviewer 不运行写操作），也**未修改任何文件**；仿真复刻的是 `:785-786` 谓词与 `:797-810` 抽取逻辑本身，并以 R0 版谓词做对照（取证 #14）——结论的可复查性由「判据同构 + 变异串在位（smoke/wrapper 两处 `from` 串均实测命中）」保证。
3. **Developer 的四场景演示未由我复跑**（`.test-home/fix040-r1-demo.mjs` 会写 `tests/*.mjs`）：我以①读取脚本核对 4 个变异 `from` 串在当前 HEAD 全部命中、②内存仿真独立验证场景 1（未入表 ⇒ 判红）与场景 3（改名 ⇒ 判红）所依赖的判据路径、③R0 版谓词对照，来替代复跑。脚本的「零残余」由其 `finally` 恢复逻辑 + 本审查实测 `git status`（`tests/**` 干净）共同支持。
4. **CI 日志本体不可本地取证**（远端私有仓库）；本报告对未来 CI 的结论均为推导。
5. **推送状态为实测**：`origin/main` = `cf0e935`、本地领先 12 笔（取证 #19）。

---

## 七、建议 Coordinator 动作（按依赖排序）

1. **复审判定（本轮）**：结论 = **NEEDS_CHANGE**（阻塞项 1 = P1-1(new)）⇒ 请以 review-record CLI 机录本报告（canonical 名 `review-FIX-040-R1.md`，自动 `next_round`）→ 派发 Developer 做 **P1-1(new)：对象串加判别前缀 + 显式单源（附 B 的表述改写）** 与 **P2-1(new)：`isKnown` 改精确匹配**（两项同文件、合计约 5~8 行）→ **MUST spawn 同一 Reviewer 复审（round=2，注入本报告路径）**。
2. **当轮零风险项（纯注释）**：P3-2(new) 的三处覆盖表述改写（可随 P1-1(new) 一并）；P3-1(new) 的阈值风险声明（可选）。
3. **历史提交裁定确认**：**不修改历史提交**（对齐 Coordinator 裁定）——依据见 §三.5；补充事实：本批 12 笔**未 push**，故该裁定属纪律选择而非不可变性强制；若选择 push 前 squash，MUST 同步 R0/R1 报告与机录中的全部 hash 引用（本审查不建议）。
4. **push 门槛与 CI 口径**：**不建议在 P1-1(new) 闭合前 push**；若裁量以台账承载，则 evidence-log MUST 如实登记「**对象核验自满足范围 = 5 个表项（逐条列出）+ 两态复现命令**」，且**不得**在任何文档/commit message 中表述为「对象核验闭环 / 全部候选锚名均有对象核验」；**不得声称 CI 已验证**；push 后由 Coordinator 核验 ubuntu 首跑（重点：`#SKIP 6` 逐行 + 9h/9h-2/9h-3 绿）。
5. **台账补录（沿用 R0 动作 3/4，仍未完成）**：P2-2 归因更正、P2-3 中间态口径记录、P3-3 镜像锚数（15/9）、P3-4 `CHANGELOG:59` supersede、P3-8 台账⑥引用位置补 2 处、P3-2 证据脚本归档（含本轮 `fix040-r1-demo.mjs` 与 R0 的 `fix040-*.mjs`/`*-gate*.txt`）；完成后补 EV（含 R0/R1 结论与复审轮次）。
6. **发布面提示**：两笔返工均为测试基础设施（守卫/注释）⇒ **不产生用户可见行为变化**；`package.json` / `CHANGELOG.md` / 版本位未被触碰。
