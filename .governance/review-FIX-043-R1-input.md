# 代码审查报告 — FIX-043 批 B（R1）

- **Task ID**: FIX-043（批 B：镜像对锚族清扫 24 处 + ⑧ 隔行站点收敛 + R0 P1-1/P1-2 判据面）
- **Round**: **R1**（前轮 = `.governance/review-FIX-043-R0.md` / `review-FIX-043-R0-input.md`，批 A，结论 APPROVED_WITH_NOTES / unresolved_blockers=0）
- **轮次语义**：**非 NEEDS_CHANGE 触发的复审**，而是「批 A 通过终态之后、新工作单元（批 B）的新一轮完整审查」。本报告在 R0 结论之上**额外核验 R0 两项 P1 是否真的闭合**（逐条标注「已闭合 / 部分闭合 / 未闭合」）。
- **审查对象**: commit `2d65f6ea76c83ceb616f06f4d2781b35ea42499d`（短号 `2d65f6e`；父 = `813c4a9` = 批 A）
- **审查者**: Code Reviewer Agent（只读；唯一写操作 = 本文件）
- **审查范围（`--numstat` 实测）**: `lib/client.js` +19/−16、`tests/served-client.js` +19/−16、`tests/host-contract.mjs` +119/−23、`tests/host-abi-health.mjs` +51/−15 —— 合计 4 文件 +208/−70（与 Coordinator 派发口径逐数吻合）
- **审查时间**: 2026-09-13 10:33 +08:00
- **结论**: **APPROVED_WITH_NOTES**
- **unresolved_blockers=0**

---

## 0. 结论与硬门槛裁决

| 硬门槛 | 阈值 | 实测 | 裁决 |
|--------|------|------|------|
| P0 阻塞问题数 | = 0 | **0** | 通过 |
| 5 维度全覆盖 | = 100% | 5/5（§2） | 通过 |
| 每条发现标注级别 | = 100% | 13/13（§3） | 通过 |
| 设计一致性检查 | 已完成 | 已比对 `arch-004-compatibility-design.md` §5.1(a) 与 project-principles P10-④ / P5 / P8（§6） | 通过 |
| AI 代码专项 5 项 | 全部完成 | 5/5（§4） | 通过 |

**结论 `APPROVED_WITH_NOTES` / `unresolved_blockers=0`**。

- **无 P0**；硬门槛全通过。
- **P1 = 2**（判据硬化残留，**均不使受审交付的判据强度低于批前**——批 A 无此三字段，本批为纯增量硬化；M10 攻击面**已构造性判红**）。按 SKILL「P1 原则上本轮修改，可申请遗留到下一轮」处置为**有条件通过 + 遗留计划**（§7）。
- **P2 = 4 / P3 = 4**——其中 P1-2 号项（口径 a 子分解 off-by-one）与 P2-2 号项（`:5008` 证据对象替换）**落于交付物文本内**，属「本轮宜修」，但不改变任何句子真值、不影响门控与判据强度。
- **R0 两项 P1 裁决**：**P1-1 = 已闭合（有界形态，残留两项判据边界见 §3 P1-1/P1-2）**；**P1-2 = 已闭合（逐字核验成立，见 §1.7）**。

> 说明：本批为锚族卫生批（P3 级立项），但**未被降标审查**——两项非常规面（**改指另一个宿主包的语义风险**、**越界文件**）与本轮 5 项独立复算、9 项仓库外变异全部逐项落判。

---

## 1. 独立复算（不采信 Developer 数字）

### 1.1 声称 1 — 镜像对字节恒等 【成立，**1 项数字口径缺陷**见 P2-4】

| 项 | Developer 声称 | 本审查独立实测 | 裁决 |
|----|---------------|---------------|------|
| 批前 blob | `2dd4b3df` | `git rev-parse 813c4a9:lib/client.js` = `2dd4b3df60d42d109eb4a7e23a8b3248c73583a4`（两侧同） | ✅ |
| 批后 blob | `7913db8c` | `git rev-parse 2d65f6e:lib/client.js` = `7913db8ce4542d83144fd7012fd2da8a1614df59`（两侧同） | ✅ |
| 尺寸 | **396338 B** | git blob = **390850 B**；工作树（CRLF）= **396555 B** | ❌ **P2-4** |
| SHA256 | `3775AAE3…15AA5` | `Get-FileHash lib/client.js`（工作树）= `3775AAE3373CD12DAD8EEB5D9C5493848E55967501784F612F1EAE7337215AA5`（两侧同） | ✅（基 = 工作树） |
| `git diff --no-index` | exit 0 | **exit 0**（两侧 `git show` 落盘后比对；两侧 SHA256 同 `5C98BC81…93E40`，同 390850 B） | ✅ |
| 守卫 §3 | 绿 | `host-abi-health.mjs:162` `check('served-client mirror stays byte-identical to lib/client.js', mirror === source)` → 基线实跑绿（178 断言 exit 0） | ✅ |

**390850 与 396338 的差额已定量归因（非推测）**：父 blob = 390636 B、其 LF 数 = **5702**；`390636 + 5702 = 396338` —— 即 **396338 = 批 A 时点的工作树（CRLF）尺寸**，与批后 SHA256 拼在同一句「实测」里 = **时点混用**（详见 P2-4）。

**镜像关系结论**：`git rev-parse` 两侧 blob 完全相等（**最强证据**，高于 hash 比对）；镜像字节恒等**成立**。

### 1.2 声称 2 — 12 → 0 口径计数 【逐数吻合】

口径（批 A 同口径，**行数口径**）：`git grep -nE '([A-Za-z0-9_./-]+\.(js|mjs)):[0-9]+(-[0-9]+)?' <rev> -- <文件>`

| 时点 | `lib/client.js` | `tests/served-client.js` |
|------|-----------------|--------------------------|
| `813c4a9`（批前） | **12** | **12** |
| `2d65f6e`（本批） | **0** | **0** |

**12 处逐处对应**（本审查独立列点，与提交信息 12 项索引 **1:1 精确对应**）：`:4281` `lib/index.js:2596-2630` / `:4284` `index.js:1721` / `:5008` `lib/client.js:889-911` / `:5084` `remote-events.js:12-32` / `:5450` `lib/client.js:581` / `:5454` `lib/client.js:2842-2848` / `:5455` `lib/client.js:4493-4499` / `:5550` `lib/client.js:175-179` / `:5554` `lib/index.js:19` / `:5557` `lib/client.js:170` / `:5579` `lib/client.js:752` / `:5597` `lib/client.js:193`。

### 1.3 声称 2 附带 — 「余 7 处裸 `:NNN` 刻意保留」是否落在口径外 【**在口径外成立**；枚举与理由有缺陷，见 P2-3】

独立复算：裸 `:NNN`（**无文件名前缀**，故按定义**不匹配**批 A 口径——口径要求 `\.(js|mjs)` 紧邻 `:数字`）**现存 5 行 / 7 token**（两侧镜像同）：

| 行 | 内容 | 归属宿主面 |
|----|------|-----------|
| `:2138` | `（同表 :21，凭据引用变化转发事件）` | `dsh-api-remotes/lib/types/remote-events.js`（**宿主 `:21` 实读 = `credentials/reference-updated`——锚现值正确**） |
| `:4310` | `ui-conversation :16041-16056` | 跨包 |
| `:5453` | `:313-314/:342`（2 token） | `dsh-cordis-client-runner/lib/client.js`（**宿主 `:312-314` JSDoc 与 `:342` `readService(prop, true)` 实读——锚现值正确**） |
| `:5561` | `宿主 :47/:53`（2 token） | `dsh-client-ui-model-selection/lib/client.js`（**宿主 generation 守卫实为 `:48/:55/:61`——锚已漂移 1~2 行**） |
| `:5562` | `宿主 :292`（1 token） | 同上（**宿主 `:292` 实为 `directoryFor` 的 JSDoc；`store.subscribe` 实为 `:128/:131/:314/:409`——锚不指向该对象**） |

- **口径外判定成立**：7 处均为无文件名前缀的裸形态，按定义不在声明口径内 ⇒ **不是漏扫**。
- **批内收敛量**：该族由批前 **11 token**（8 行）降至 **7 token**（5 行），清除的 4 token = `:2749-2760` / `:2842-2848` / `:991-992` / `:2556-2588`（与提交信息「同族同法收敛」一致）。
- **但两处缺陷**：(i) 声称「余 **7** 处」而**逐类枚举仅 6 处**（遗漏 `:2138` 的 `:21`）；(ii) 保留理由「宿主靶子**不可稳定符号化**」经抽查**未获支持**（`:47/:53` 的对象是 `generation === this.generation` 表达式、`:292` 的对象是 `store.subscribe`/`useSyncExternalStore`——**均为可符号化形态**）。⇒ **P2-3**。

### 1.4 声称 6 — 门控 / 断言 / skip 【逐数吻合】

| 项 | 声称 | 本审查独立实测 | 裁决 |
|----|------|---------------|------|
| `node tests/run-all.mjs` | exit 0 ×3（23.2/22.9/23.5s） | **exit 0 ×3**（22.8 / 22.8→22.7 / 22.7s） | ✅ |
| 汇总行 | ALL 20 SUITES + 4 RUNNER MODULES PASSED | 逐字一致 | ✅ |
| `#SKIP` | **2**（smoke.mjs×2） | **2**，明细两行均出自 `smoke.mjs`（`0o600 POSIX` / `POSIX online checks`） | ✅ |
| `host-contract.mjs` 断言 | 82 → **106**（+24） | 父 `813c4a9` 跑 = **82**；本批跑 = **106**；Δ = **+24** | ✅ |
| `host-abi-health.mjs` 断言 | **178**（未变） | **178**（exit 0） | ✅ |
| 工作树零改动 | — | 受审前后 `git status --short` 恒为 `.governance/**` 三类 M + 两份 R0 报告 `??` | ✅ |

**+24 构成（本审查按 check 位点 × 循环重数独立推演，并经实跑差值验证）**：

| 位点 | 重数 | 小计 |
|------|------|------|
| S2 锚文本含声明对象归属 | 3 条目 × 1 | +3 |
| S2 声明包×文件宿主存在 | 3 条目 × 1 | +3 |
| S5 锚文本含声明对象归属 | 6 条目 × 1 | +6 |
| S5 声明包×文件宿主存在 | 6 条目 × 1 | +6 |
| S5 声明 schema 符号逐字在宿主 | 6 条目 × 1 | +6 |
| **合计** | | **+24** ✅ |

> 提交信息给出的子分解「`S2 +3 条目×1 + S5 +6 条目×2 + 锚文本归属判据 +3×1`」求和 = **18 ≠ 24**（漏计 S5 锚文本归属 +6）——**总数正确、分解不全**，见 P3-1。

### 1.5 声称 3 — P1-1 构造性判红 【成立；另发现两处判据边界，见 §3】

全部在**仓库外**副本（`%TEMP%\fix043r1-scratch`，`git archive HEAD` 展开 403 文件 + `node_modules` junction）执行，逐次字节复原（SHA256 恒等）。

| # | 变异（内部自洽的伪造——最强伪造形态） | 结果 | 明细 |
|---|--------------------------------------|------|------|
| M-B1 | 捏造**包** `dsh-ghost-pkg`（锚文本 + `expectPackage` 同步改） | **exit=1** | `FAIL S2 … 声明的宿主包×文件在宿主靶子中存在 :: {"absent":["dsh-ghost-pkg/lib/index.js"]}` |
| M-B2 | 真包 + 捏造**文件** `lib/ghost-abi.js` | **exit=1** | `absent:["dsh-api-session-controller/lib/ghost-abi.js"]` |
| M-B3 | 字段与锚**脱钩**（`expectPackage` 改 `dsh-api-remotes`） | **exit=1** | `undeclared:["dsh-api-remotes"]` |
| M-B4 | 真包+真文件 + 捏造**符号** `ghostFn()` | **exit=0** ⚠ | S2 不核验符号宿主可达性（**已披露**，P1-2 号项） |
| M-B5 | 三字段**全部省略** | **exit=0** ⚠ | 新判据**平凡满足**（**未披露**，P1-1 号项） |
| M-B6 | 复原基线 | **exit=0** / 106 断言 | 字节复原 `identical: true` |
| M-B7 | S5 捏造 schema 符号（真包真文件） | **exit=1** | 2 FAIL：S5 锚形态 + `{"absentSymbols":["settings_ghost_result"]}` |
| M-B8 | S5 捏造包 | **exit=1** | 2 FAIL：`{"absentFiles":["dsh-ghost-pkg/lib/client.js"]}` |
| M-B9 | 复原基线 | **exit=0** | 字节复原 `identical: true` |

**结论**：R0 的 M10（捏造锚未被判红）**已闭合**——伪造包/文件/字段脱钩三者均判红；S5 的包×文件×符号**三重全闭**；基线不误红。残留两项边界（省略字段平凡满足、S2 符号不核验宿主）登记 §3。

### 1.6 声称 4 — 同批义务：`ANCHOR_CASES` 补对 + ⑧ 口径计数 【成立】

- `ANCHOR_CASES` 的 `lib/client.js` 条目：`stale` **6 → 20**（+14）、`fresh` **5 → 17**（+12）——本审查逐元素计数**逐数吻合**。
  - 新增 14 个 stale 中，**8 个**是口径 a 的 `lib/client.js:NNN` 自指锚：`889-911` / `581` / `2842-2848` / `4493-4499` / `175-179` / `170` / `752` / `193`；另 5 个为 `lib/index.js:2596-2630`、`:2749-2760`、`dsh-llm-pi-ai index.js:1721`、`remote-events.js:12-32`、`:991-992/:2556-2588`；1 个为 `lib/index.js:19`。
  - 17 个 fresh 全部为替代式符号/文本串（`joinProviderDirectory 同构镜像` / `API_REMOTE_FORWARDED_EVENTS（19 项转发事件）` / `streamWithSnapshot()` / `的 prompt 侧准入` 等）。
  - `staleUnitCount` 与 `ANCHOR_CASES.length` 相等（9h-4c 绿）⇒ 登记形态自洽。
- **⑧ 口径计数（⑥ 段落修订）独立复算**：
  - **口径 a** = `git grep -oE 'lib/client\.js:[0-9]+(-[0-9]+)?' -- lib/client.js`（**匹配次数**）：`6bc3841` = **9** → `175d3e1` / `813c4a9` = **8** → `2d65f6e` / 工作树 = **0** ✅ 与声称逐数吻合。
  - **口径 b** = 三形态 matchAll：`813c4a9` = **40**（①`文件:行号` **12** / ②`L###` **17** / ③裸 `:NNN` **11**）→ 工作树 = **24**（①**0** / ②**17** / ③**7**）✅ **逐数吻合**。
    > 口径粒度警示（已自证）：② 的**行数**口径 = 9、**匹配次数**口径 = 17（`L5682-5760` 只计 `L5682`）。声称用匹配次数口径；⑥ 段落注释本身已声明「数字必须连口径引用」，故**不构成缺陷**。
- **`ANCHOR_CASES` 的 `tests/host-contract.mjs` 条目 fresh 更新**（`:961` `'directoryFor(sessionId: SessionId) 面'` → `'…: ModelDirectory 面'`）——**必要性经实证**（§1.8 C1）。

### 1.7 声称 4 — R0 P1-2 修复核验（`:261` / `:274`，现行号 `:274` / `:293`） 【**已闭合**】

S7 7c 实际判据（`tests/host-contract.mjs:802-810`，逐字实读）：

```
:803  const agentTypes = hostRead('dsh-api-session-controller', 'lib', 'types', 'agent.js')
:804-805  check('S7 增强: 宿主 selectionFor 锚在位（…）',
            agentTypes.includes('selectionFor(agent)')
         && agentTypes.includes("stateOf(agent.session, 'modelSelection')")
         && agentTypes.includes('projectionState.pending'))
:806-807  const directoryTypes = hostRead('dsh-client-ui-model-selection','lib','types','client','service.d.ts')
          check('…modelDirectories 锚在位（directoryFor(sessionId: SessionId): ModelDirectory）',
            directoryTypes.includes('directoryFor(sessionId: SessionId): ModelDirectory'))
```

| 新 anchor 声明 | 与 S7 7c 比对 | 裁决 |
|----------------|--------------|------|
| face 1：「S7 增强组核验 `selectionFor(agent)` / `stateOf(agent.session,"modelSelection")` / `projectionState.pending` **三项**」 | S7 7c 恰核验这三项 | ✅ 相符（渲染用双引号 vs 判据用单引号——P3-2 措辞 nit） |
| face 1：「**`selectModel` 面不在 S7 判据内**」 | `hostRead(` 仅 5 处（`remote-events.js` / `api-remotes/client.js` / `session-controller/types/agent.js` / `model-selection/service.d.ts` / `dsh-llm/index.js`）；`CLIENT_REMOTE_FACES_BASELINE`(:172) 与 `CTX_SERVICES_BASELINE`(:183) 虽含 `selectModel`，但仅由 S1c(`:478`)/S1d(`:495`) 与**仓内侧** `deepEqual`——**无宿主侧判据** | ✅ **表述与实况相符** |
| face 1：「由 `lib/host-abi/llm-selection.js` 消费面判据覆盖」 | S2 `consumer` 核验 `controller.selectModel({ ...selection })`（实读 `:123`）与 `get('sessionController')`（`:90`/`:115`）逐字在位 | ✅ 相符（且为**低估而非超宣示**） |
| face 3：「S7 增强组核验 `directoryFor(sessionId: SessionId): ModelDirectory` **一项**」 | 与 `:807` **逐字相同** | ✅ 精确相符 |

⇒ R0 P1-2 的「不实陈述」**已清除**，改为可核对的引用；**:274**（face 1）与 **:293**（face 3）两处表述均可逐字复核。**判「已闭合」。**

### 1.8 声称 5 — 双向可达性 + 越界面必要性 【成立（必要性有两项独立驱动，见 §1.9）】

- stale 方向：写回 `lib/index.js:2596-2630` → exit 1（M-B1/B2 同族已证）
- fresh 方向：删 `joinProviderDirectory 同构镜像` → exit 1（同族）
- 镜像单侧改动 → 守卫 §3 `served-client mirror stays byte-identical` FAIL
- 收尾基线 exit 0 ✅

### 1.9 越界面裁定（询问项 5）— **三问逐项落判**

**工作树前置核对**：`git show --stat/--numstat 2d65f6e` = **4 文件**，与声称面一致；`.governance/**`、`lib/**` 之外零改动；受审时点工作树仅三类 `.governance` M 项（Coordinator 写回）+ R0 报告 `??`。

#### (a) 是否只动登记/注释面 —— **是（机械证伪式核验，非采信）**

对 `tests/host-abi-health.mjs` 全部 **+51 / −15** 行做**构造式机械过滤**，正则 `check\(|assert|skip\(|process\.exit|function |=>|if \(|===|!==|\.filter\(|\.map\(|readFileSync|=== 0`：

```
added:   51
removed: 15
lines matching code-construct regex: 0      ← 零命中
```

⇒ **无任何 `check(` / 断言谓词 / 判据逻辑被添加或删除**。改动面 = 注释块（3 处）+ `ANCHOR_CASES` **数据串**（`lib/client.js` 条目 stale/fresh 扩充、`tests/host-contract.mjs` 条目 fresh 更新）。Developer 声称**属实**。

> **但须精确声明边界**：`ANCHOR_CASES` 是数据而非注释，**且其一处的替换改变了判据输入**（`:961` fresh needle）。故结论应表述为「**未改判据逻辑/断言谓词；改动了登记数据，其中 1 处 needle 值变更具有判据语义**」——不可简化为「纯注释改动」。

#### (b) 改动是否必要 —— **是（两个独立驱动，均经实跑实证）**

实验设计：仓库外副本，**只回退 `tests/host-abi-health.mjs` 至 `813c4a9`**，其余三文件保持批 B。

| # | 配置 | 结果 |
|---|------|------|
| C3 | 批 B 树 + 批 B health（基线） | **exit 0** / 178 断言 |
| **C1** | **批 B 树 + 批 A health** | **exit 1** / 1 FAILURE — `FAIL B5 9h R-1: tests/host-contract.mjs 清单所列旧式锚零残留 + 替代式锚在位 :: {"staleHits":[],"missingFresh":["directoryFor(sessionId: SessionId) 面"]}` |
| C2 | 批 A 树 + 批 A health | **exit 0** / 178 断言 |

- **驱动 1（C1 实证）**：批 B 改了 `host-contract.mjs` S2 face 3 的锚文本 ⇒ 批 A 登记的 fresh needle 变陈旧 ⇒ `9h R-1` 的 **`missingFresh` 方向判红**。更新该 needle 是**必需**。
- **驱动 2（构造性实证）**：把被删的 FIX-042 F-3 字面复述 `lib/index.js:2596-2630` **重新插入**批 B 的注释（其余不变）→
  `FAIL B5 9h-4 R-1: stale needle 在守卫自身内的出现次数 = 其登记处次数 :: {"needleRepetitions":["lib/client.js :: 「lib/index.js:2596-2630」登记 1 处 / 守卫内 2 处"],"needleCount":114,"staleUnitCount":26}`
  ⇒ Developer 声称的「**同时消除了一个 9h-4 自碰撞 FAIL**」**成立**（needle 一旦登记进 stale 数组，其在守卫散文中的任何字面复述即触发自碰撞 ⇒ 必须改具名式）。**验证后逐字节复原**。

⇒ **该文件改动必要，非「顺带改」**。

#### (c) 批 A 基线绿矛盾核验 —— **矛盾不成立；FAIL 系批 B 自身引入**

- **C2 判据**：批 A 树（`lib/client.js` / `tests/served-client.js` / `tests/host-contract.mjs` / `tests/host-abi-health.mjs` 全部 @`813c4a9`）+ 批 A health = **exit 0 / 178 断言** ⇒ **批 A 的守卫确实处于绿态，R0「基线绿」声称无误**。
- **C1 判据**：FAIL 只在「批 B 内容 + 批 A 登记」这一**混合态**出现 ⇒ 属**批 B 自身改动引入**（其新增登记 needle + 其改动的 host-contract 锚文本），**不是**批 A 遗留的既存 FAIL。
- ⇒ 按询问项「二者必居其一」：**取前一支——FAIL 由批 B 引入**；**R0 的基线绿无需重新解释**。
- 附带：批 A 自身的门控双绿（R0 §1.3）与本审查 C2 独立复现一致，互为交叉印证。

#### (d) 越界性质裁定（Coordinator 留痕的派发自相矛盾）

- **事实**：`tests/host-abi-health.mjs` 不在初始锁面（`lib/client.js, tests/served-client.js, tests/host-contract.mjs`）内，而本批「同批义务 = 补 `ANCHOR_CASES` 对」**只能**在该文件内完成 ⇒ Developer 面临「不做则 9h R-1 判红（C1 实证），做则越锁面」的死结。
- **裁定**：改动**限于登记/注释面（(a) 已机械证明）**、**必要性双重实证（(b)）**、**未删除或弱化任何断言（零代码行变更）**、**净效果为判据覆盖面扩张（stale 6→20 / fresh 5→17）**。⇒ **不构成 Developer 单方越权**，性质 = **Coordinator 锁面与同批义务冲突的必然结果**（与 Coordinator 自身留痕一致）。建议 Coordinator 在锁面记录中按既定缺陷归属留痕（本审查不代行治理写回）。
- **残留治理项（P3-3 号项）**：实际提交面 4 文件与初始锁面 3 文件不一致，若锁面未按机器路径释放-重取对齐，则 `agent-locks.json` 与提交面存在记录偏差——属治理面，非代码面。

---

## 2. 五维度逐项结论

### 维度 1：正确性 — **通过（含 P1×2 备注）**
- **镜像对**：两侧 blob 同一（`git rev-parse` 双侧相等）为最强证据；工作树 SHA256 双侧相等；`git diff --no-index` exit 0。
- **12 处逐处判定**：本审查抽取 4 处的**宿主对象**做独立实读并核对语义（§1.7、§3-P2-2、§1.9(d)）——**包×文件存在性由新判据机器核验**（M-B1/M-B2 判红）。
- **新判据正确性**：`anchorFieldsOf` 的字段归一（`typeof === 'string'` 兼容单串/数组）、`symbolPrefix` 后缀派生（S5 的 `_result` 由面键单点派生，P5）、宿主不可达时 `note` 降级（**可见 skip，非静默**，P8）——三条分支均正确。
- **边界条件**：宿主不可达分支与 `hostApiHas === null` 分支均正确降级；`hostTarget.origin` 有定义（`:402`）；`existsSync` 已具名导入（`:61`）。
- **并发/资源**：无异步、无共享状态；S5 的宿主源码按需一次性读取（无重复大文件驻留）。
- **⑧ 隔行站点**：`:4281` 归属改指（§3 裁定 A）语义保持；`:5454` 宿主包标注勘正（原 `:2842-2848` 实为 cordis-runner 文档表）——本审查实读 **cordis-runner `:2842-2848` = 含 `slotInject`/`declaredBy`/`replaceRisk`/`example: "return {\n inject: ['slots'],…"` 的 slots 文档表** ✅ 开发者理由**成立**（注：settings-models `:2842-2848` 巧合亦存在，内容为 i18n 串表，非 inject）。

### 维度 2：安全性 — **通过（无发现）**
- 本批**不进入产品运行路径**：`lib/client.js` 改动**全部为注释文本**（逐行确认：命中行均以 `*` / `//` 开头，无语句变更）。
- 新判据为**只读** `existsSync` / `includes` / `readFileSync`；无 `eval` / `new Function` / shell 调用。
- 无密钥/token；无新增硬编码绝对路径（宿主根来自 `hostTarget` 既有解析，支持 `DSH_HOST_SOURCE`/`DSH_HOST_PACKAGES` 覆盖）。
- 无 OWASP Top 10 新增面（无网络、无认证、无 SQL/DOM）。

### 维度 3：可维护性 — **通过（含 P3 备注）**
- 命名：`anchorFieldsOf` / `declared` / `undeclared` / `absent` / `absentFiles` / `absentSymbols` / `hostApiHas` 均表达意图。
- 函数长度：`anchorFieldsOf` 5 行、新增块 < 50 行。
- 重复代码：S2/S5 的字段归属判据为**同构双份**（可提取单点）——但两处 detail 键名与循环结构不同（S5 有 `_result` 后缀派生），判为**可接受的同构**（P3 讨论级，不登记为发现）。
- 注释质量：**本批最显著的正向改进**——把 R0 点名的「不实陈述」改为**显式边界声明**（「`expectSymbol` 只核验锚文本逐字在位…覆盖面见 S7 7c 段具名清单」）。**P10-④ 未超宣示**：新增注释主动声明「不声称锚文本内全部 token 都有对象」（face 1 的 `lib/types/agent.js` 即未入 `expectFile`）——**如实披露**。
- `anchorFieldsOf(spec, symbolPrefix)` 的 `symbolPrefix` 形参实参恒为 `''`（P3-3，YAGNI）。

### 维度 4：性能 — **通过（无发现）**
- 新增 S2 判据：每条 3 次 `existsSync`（3 条目 ⇒ 9 次 syscall 级探测）；S5：6 次 `existsSync` + 1 次 `readFileSync`（按需，仅宿主可达时）。
- 无 O(n²)、无循环内 I/O（`readFileSync` 在循环外一次性）、无 N+1。
- 门控总耗时 22.6~22.8s，与批前/批 A 同量级（R0 实测批 A 21.8/22.7s）——**无性能回退**。

### 维度 5：测试覆盖 — **通过（含 P1×2 备注）**
- 核心路径：本批交付物**即判据自身**；新增的 24 条断言经 **5 项构造性变异全部判红**（M-B1/B2/B3/S5 两项）⇒ **非装饰性断言**。
- 边界测试：宿主不可达降级分支、字段省略分支均被本审查构造覆盖（后者暴露 P1-1）。
- 错误路径：失败 detail 结构化输出 `absent`/`undeclared`/`absentFiles`/`absentSymbols`（P8 可观测，不吞错）。
- 覆盖率：无覆盖率工具接入（沿用既有口径）；断言总量 106 + 178 = **284**。
- **净覆盖扩张**：`ANCHOR_CASES` stale 6→20 / fresh 5→17 ⇒ 镜像对全量替代式锚回归可见。

---

## 3. 发现清单（逐条带级别 + 可复查事实）

### P1-1 — 新 `expect*` 判据对**字段缺失** fail-open：省略三字段即**平凡满足**（未披露）
- **位置**: `tests/host-contract.mjs:536-540`（S2 字段归属与宿主存在性）、`:693-697`（S5 同构）
- **事实依据**（仓库外副本实跑，逐字节复原）：**变异 M-B5** —— 删除 face 1 的 `expectPackage` / `expectFile` / `expectSymbol` 三行 ⇒
  - `anchorFieldsOf` 返回 `{pkg: [], files: [], symbols: []}`（`spec.expectPackage ?? []` / `?? []`）⇒ `undeclared = []` ⇒ 文本归属判据**通过**；
  - `declared.pkg.flatMap(...)` = `[]` ⇒ `absent = []` ⇒ 宿主存在性判据**通过**；
  - 净结果 **exit=0 / 106 断言全过**。
- **影响**：M10 攻击面**对既有 9 条目**已闭合（M-B1 判红），但对**未来新增条目**仍开放——新增锚只要省略三字段，两道新判据即一起静默通过，仅剩批 A 的格式谓词兜底（而该谓词正是 R0 判为对锚真假**零判别力**者）。**本仓已有反例先例**：FIX-040 的 **§9h-3「入表完备性自检」**（「新增锚未入表即红」）正是为同类「静默省略」缺口而设；本批未为新字段建立同型完备性判据。
- **修复建议**：追加一条完备性判据——`HOST_SHAPE_ANCHORS` 与 `WIRE_SCHEMA_WHITELIST` 的**每一条目** MUST 声明非空 `expectPackage` + 非空 `expectFile` + 非空 `expectSymbol`（缺失/空数组即判红，与 §9h-3 同型）。
- **级别理由**：**非阻塞**——批 A 无此机制，本批为**纯增量**（不回退既有强度）；且已声明的 9 条目全部闭合。按「P1 可申请遗留到下一轮」处置。

### P1-2 — S2 的 `expectSymbol` **不核验宿主可达性**，捏造符号仍可通过 S2（**已如实披露**）
- **位置**: `tests/host-contract.mjs:536-540`（S2 仅核验锚文本）；对照 S5 `:702-705`（宿主逐字核验）
- **事实依据**：**变异 M-B4**——真包 + 真文件 + 捏造符号（`的 selectModel(request) 面` → `的 ghostFn() 面`，`expectSymbol` 同步改 `['ghostFn(', …]`）⇒ **exit=0 / 106 断言全过**。对照 **M-B7**（S5 同形伪造）⇒ **exit=1**，`{"absentSymbols":["settings_ghost_result"]}`。
- **披露裁定**：该边界**已在两处注释中如实声明**（`:264-269`「范围界定（不制造声明强度超事实）…`expectSymbol` 只核验「该符号名在锚文本中逐字在位」」；`:526-527`「**判别力边界（如实）**」）⇒ **不构成不实陈述**，且未使得任何既有判据退化。R0 P1-1 建议的原始措辞（「由判据逐项比对，使捏造锚判红」）在本批取「**包/文件宿主实证 + 符号文本在位**」的有界实现——**是子集实现，非超宣示**。
- **修复建议**：若后续批扩展，可对 S2 的每处锚声明 `expectSymbolHost`（形如 `{pkg, file, symbol}`）并复用 `hostApiHas` 同型核验；或在注释中把「符号语义由 S7 7c 具名清单覆盖」进一步标注为**逐条映射表**（现仅列 6 个具名符号，而 S2 锚的符号不止 6 个）。
- **级别理由**：**非阻塞**（已披露的有界实现，不回退）。

### P2-1 — ⑥ 段落口径 a 子分解 **off-by-one**：「本批清除的 **7** 处」应为 **8** 处
- **位置**: `tests/host-abi-health.mjs:857-860`（⑥ 段落「数字口径 + 取数时点绑定（FIX-043 批 B 复算修订）」）
- **事实依据**：同段自陈链为 `6bc3841` = **9** → `175d3e1`/`813c4a9` = **8** → 交付后 = **0**；括号内却写「**本批清除的 7 处** `lib/client.js` 自指宿主锚 + 1 处 FIX-042 已清」= 8。本审查独立列点：批前该口径的 **8 个** match 为 `lib/client.js:889-911` / `:581` / `:2842-2848` / `:4493-4499` / `:175-179` / `:170` / `:752` / `:193`，**全部**由本批清除 ⇒ 本批清除 **8** 处，差额 9 = 1（FIX-042）+ 8（本批）。
- **影响**：该句自称「差额来源可逐处追溯」，而子分解本身不自洽（7+1=8 ≠ 9）；本批自身文件沿用「数字必须连口径引用」纪律，此处为该纪律的**内部违例**。总数（9→8→0）**正确且可复现**，故不入阻塞。
- **修复建议**：改「7 处」→「8 处」。

### P2-2 — `:5008` 段落的证据对象被**替换**（原锚经验证为准确，新证据真但不指向同一命名空间）
- **位置**: `lib/client.js:4981-4983`（镜像同 `tests/served-client.js:4981-4983`）
- **事实依据**：
  - 原文：「宿主官方插件同款消费：`dsh-client-ui-settings-models lib/client.js:2842-2848` static inject（remote.credentials/llm/settings）+ **`:991-992/:2556-2588` 调用**」——本审查实读 settings-models `lib/client.js`：`:991-992` = `const [registered, declared] = await Promise.all([this.ctx.remote.llm.listProviders(), …]` ✅ **真实且切题的 `remote.llm` 调用**；`:2585-2588` = `function createModelsOperations(ctx)` + `ctx.remote.credentials.describe([ref])`，其 JSDoc `:2581-2582` 逐字写「declares `remote.credentials`, `remote.llm`, and `remote.settings` in its own `inject`」✅ **同样真实切题**（即原行号锚**准确**）。
  - 新文：改为「`dsh-client-ui-settings-models` 的 static inject（remote.credentials/llm/settings）+ **`dsh-client-ui-model-selection` 的 `scope.modelDirectories` 与 `ctx.remote.session.modelCatalog()` 调用**」——两处新引用**均实存**（`scope.modelDirectories` @`:917`/`:940`；`ctx.remote.session.modelCatalog()` @`:46`），故**句子仍为真**；但证据对象由「settings-models 对 `remote.credentials/llm/settings` 的调用」替换为「model-selection 对 `modelDirectories` 服务与 `remote.session` 的调用」——后者**不含**同句并列声明的三个命名空间。
- **影响**：句子真值未变（不断言假事实），但**丢失两条经验证准确的宿主证据**、代之以命名空间不同的证据 ⇒ 属「**改指改变含义**」的弱形态（比行号漂移更隐蔽——Coordinator 询问项 3 点名的风险面）。**不构成 P0/P1**：无幻觉锚、无判据依赖、句子可核。
- **修复建议**：保留原 settings-models 两锚的**符号化**形式（如「`dsh-client-ui-settings-models` 的 `remote.llm.listProviders()` / `createModelsOperations()` 消费面」），model-selection 的引用可作为**追加**而非**替换**。

### P2-3 — 「余 7 处裸 `:NNN` 刻意保留」：**枚举仅 6 处**且保留理由**未获支持**
- **位置**: `lib/client.js:4310` / `:5453` / `:5561` / `:5562` / `:2138`（镜像同）；声称见提交信息「未闭合项」节与 `tests/host-abi-health.mjs:865-872`
- **事实依据**：
  - **计数正确、枚举不全**：实测 7 token（5 行），而列举的 4 类为 `ui-conversation :16041-16056`（1）+ `dynamicCordisContext :313-314/:342`（2）+ `ModelDirectory` generation 守卫 `:47/:53`（2）+ `store.subscribe :292`（1）= **6**；**未列举** `:2138` 的 `（同表 :21，…）`。
  - **理由未获支持（两处抽查）**：
    - `:5561`「`generation` 守卫，宿主 `:47/:53`」——宿主 `dsh-client-ui-model-selection/lib/client.js` 的 `generation === this.generation` 实位于 **`:48` / `:55` / `:61`**（**已漂移**），而该表达式**是可符号化形态**。
    - `:5562`「composer 模型选择器经 uSES 订阅该 store（宿主 `:292`）」——宿主 `:292` 实为 **`directoryFor` 的 JSDoc**（`:296` 才是 `directoryFor(sessionId) {`）；真实订阅点为 `:128` / `:131` / `:314`（`directory.store.subscribe`）/ `:409`（`useSyncExternalStore`）⇒ 锚**不指向该对象**，且订阅点**可符号化**。
  - 另两处抽查**准确**：`:2138` 的宿主 `remote-events.js:21` = `credentials/reference-updated` ✅；`:5453` 的 cordis-runner `:312-314` JSDoc 与 `:342` `readService(prop, true)` ✅。
- **影响**：保留本身**合规**（属声明口径外，且已登记「后续批逐处判定」、未声称已收敛）；缺陷在**自报的计数枚举与理由精度**——「不可稳定符号化」这一理由至少对两处不成立，会误导后续批的收敛判断。
- **修复建议**：枚举补齐 7 处；理由改为逐处标注（「锚现值准确」/「已漂移，可符号化，待收敛」/「跨包，待判定」），与 FIX-042 R1「数字连口径引用」纪律同形。

### P2-4 — 声称 1 的镜像尺寸 **396338 B = 批 A 时点工作树尺寸**，与批后 SHA256 拼为同一句「实测」（时点混用）
- **位置**: 提交信息「证据（实跑）」节 + Developer 声称清单第 1 条（同时被引用为「实测非假设」）
- **事实依据**（三源独立实读）：
  - `git cat-file -s 2d65f6e:lib/client.js` = **390850**（批后 **blob** 尺寸）
  - `(Get-Item lib/client.js).Length` = **396555**（批后**工作树** CRLF 尺寸 = 390850 + 5705 CRLF）
  - `git cat-file -s 813c4a9:lib/client.js` = **390636**，其 LF 计数 = **5702** ⇒ `390636 + 5702 = **396338**` = **批 A 时点工作树尺寸**
  ⇒ 声称句把「批 A 工作树尺寸」与「批后工作树 SHA256 `3775AAE3…`（同句实测确为批后工作树值）」并列。
- **影响**：**时点混用 + 口径未标**——正是 FIX-042 R0 唯一阻塞项（F-1「未绑取数修订 ⇒ 不可复现」）的**同族失效模式**。镜像**恒等结论不受影响**（blob 相等为最强证据），故不阻塞；但该数字**不可复现于任何单一修订**。
- **修复建议**：改写为三口径分明式：「blob `7913db8c`（390850 B，LF）/ 工作树 SHA256 `3775AAE3…`（396555 B，CRLF，@`2d65f6e`）；批前 blob `2dd4b3df`（390636 B）」。

### P3-1 — 提交信息的 +24 子分解求和 = 18 ≠ 24（漏计 S5 锚文本归属 +6）
- **位置**: 提交信息「证据（实跑）」节第 2 项
- **事实依据**：`S2 +3×1 + S5 +6×2 + 3×1 = 18`；实际 5 个新 `check` 位点按循环重数 = 3+3+6+6+6 = **24**（差值恰为 S5 锚文本归属判据 +6）。**总数 82→106（+24）经本审查实跑复现，正确**。
- **影响**：仅自报分解不完整，不影响交付物。
- **修复建议**：补「S5 锚文本归属 +6」。

### P3-2 — face 1 锚文本对 S7 判据的**引用渲染**用双引号，S7 实现用单引号
- **位置**: `tests/host-contract.mjs:274`（`stateOf(agent.session,"modelSelection")`）vs `:805`（`agentTypes.includes("stateOf(agent.session, 'modelSelection')")`）
- **事实依据**：三符号**名称**逐项相符（§1.7），仅 `modelSelection` 的引号形态与逗号后空格不同；face 2（`:283`）沿用同一旧风格。
- **影响**：措辞级；不影响判据（`expectSymbol` 项为 `stateOf(`，不依赖引号形态）。
- **修复建议**：可选统一为单引号以与 S7 逐字一致。

### P3-3 — `anchorFieldsOf(spec, symbolPrefix)` 的 `symbolPrefix` 形参恒以 `''` 调用（YAGNI）
- **位置**: `tests/host-contract.mjs:530-534`（定义）与 `:538`（唯一调用 `anchorFieldsOf(anchorCase, '')`）
- **事实依据**：全文件仅一处调用，`symbolPrefix` 恒为 `''`，其 `symbolPrefix ? \`${name}${symbolPrefix}\` : name` 分支等价于恒等映射。S5 侧未复用该函数（改用本地 `_result` 派生）。
- **影响**：无功能影响；轻微冗余抽象（可维护性 nit）。
- **修复建议**：移除形参或由 S5 复用该函数（顺带消除 S2/S5 同构双份）。

### P3-4 — （对 R0 报告的自我更正建议）R0 §1.5/§5 的「25 单元 / 25 条目」与其实证输出 `26` 不一致
- **位置**: `.governance/review-FIX-043-R0-input.md` §1.5 未验证项 3、§5「独立复算（9h-4c）」
- **事实依据**：R0 报告 §5 自载 M3 输出 `{"staleUnitCount":27,"caseCount":26}`（变异常态 = 26）⇒ 彼时 `staleUnits = 26`、`ANCHOR_CASES.length = 26`；而叙述写「25 单元 / `^ {4}\{ file: \[` 计量 = 25」。本审查复核：`'stale: ['` 出现数 = **26**（`813c4a9` 与 `2d65f6e` 同）、`^ {4}\{ file: \[` = **25**（该正则漏计 1 条目）——R0 用后者与解析器计数互证，**巧合自洽但非真值**。
- **影响**：R0 的**结论不受影响**（9h-4c 判据比较运行时值 26 === 26，本批前后均绿；本审查 C2/C3 独立复现）；本批**未引入**该差异（`stale: [` 计数批前批后恒为 26）。
- **修复建议**：登记为 R0 计量口径自我更正（与 FIX-041 R1 / FIX-042 R1 的审查员自我更正先例同形），**非本批缺陷**。

---

## 4. AI 代码专项 5 项检查

| # | 检查项 | 结论 | 事实依据 |
|---|--------|------|---------|
| 1 | **mock 残留** | **无发现** | 新增代码为只读文本/存在性判据；无 mock/stub 注入；`:452` 的 `fakeLlm` 与 `probeCtx` 为**既有夹具**，本批未改（`git show` 逐行确认）。 |
| 2 | **硬编码返回值** | **无发现** | 比较对象均实参派生（`undeclared` / `absent` / `absentFiles` / `absentSymbols`）。**反向验证**：5 个位点经 M-B1/B2/B3/B7/B8 构造性判红 ⇒ 非恒真。 |
| 3 | **幻觉 API / 幻觉符号** | **零幻觉（13/13 逐字实证）** | 宿主靶子 `…\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai`（**只读**）逐字核验：<br>• `dsh-api-session-controller/lib/index.js`：`:605 async selectModel(request)`、`:609 resolveCallConfig`、`:619 selectForNextRequest`、`:317 this.selectionFor(agent).current = selection`、`:344-348 serializeImageAdmission`（**纯 Promise 串行，非校验**）、`:761-764` `hasImage` → `MODEL_DOES_NOT_SUPPORT_IMAGES` ✅<br>• `dsh-llm-pi-ai/lib/index.js:1827 async *streamWithSnapshot(options, snapshot)`（`:1821` `stream: (options) => this.streamWithSnapshot(...)`）✅<br>• `dsh-client-ui-settings-models/lib/client.js:889 function joinProviderDirectory(...)`、`:2871 const inject = ["slots","locale","remote","remote.credentials","remote.llm","remote.settings",…]` ✅<br>• `dsh-api-remotes/lib/types/remote-events.js:12 export const API_REMOTE_FORWARDED_EVENTS = [`（`:13` 起 19 项；`:21` = `credentials/reference-updated`）✅<br>• `dsh-cordis-client-runner/lib/client.js:581 waitingFor: Object.keys(fiber.inject).filter(...)`、`:5044 "remote.dynamicCordisRunner"` ✅<br>• `dsh-client-ui-model-selection/lib/client.js`：`:280/:283/:286 ctx.remote.$on(...)`、`:257 ModelDirectoryResolver`、`:272 super(ctx, "modelDirectories")`、`:296 directoryFor(sessionId)`、`:302 …resolved no scope`、`:917/:940 scope.modelDirectories`、`:46 ctx.remote.session.modelCatalog()` ✅<br>• `dsh-host-apiproxy`：`_npx` 全树**递归目录搜索为空**（不存在）✅<br>• 仓内 S2 消费面：`llm-selection.js:123 controller.selectModel({ ...selection })`、`:90/:115 get('sessionController')`、`prestep.js:198/200`、`client-remotes.js:266/274` ✅<br>• 六 schema 符号宿主行号**逐字命中**：`5727/5735/8164/4712/4701/4315` ✅<br>**唯一登记偏差**：P2-2（`scope` 证据对象替换，非幻觉）。 |
| 4 | **未实现 TODO** | **无发现** | diff 无新增 TODO/FIXME/占位；未闭合项以注释/`notes` **如实登记**（`lib/service.js:1326` 归批 C、`llm-selection.js` 未实证锚、7 处保留裸锚、守卫自身面），并明写「**本批不声称已修正**」（`:906-907`）。 |
| 5 | **过度实现** | **无发现** | 4 文件 +208/−70，全部锚文本/判据/登记同域；无「顺带重构」。**唯一越锁面文件**（`host-abi-health.mjs`）为同批义务所必需（§1.9(b) 双重实证），且**净效果为判据扩张**（stale 6→20 / fresh 5→17）。`symbolPrefix` 冗余形参登记 P3-3。 |

---

## 5. 变异实验台账（全部在**仓库外**副本执行并逐次字节复原）

副本：`%TEMP%\fix043r1-scratch`（`git archive HEAD` 展开 = 403 文件；`node_modules` 为 junction；`hostTarget` 经 `LOCALAPPDATA` 解析，与脚本位置无关 ⇒ 副本内宿主可达性一致）。受审前后仓库工作树 `git status --short` **零变化**。

| # | 目标 | 变异 | 结果 | 复原 |
|---|------|------|------|------|
| M-B1 | S2 | 捏造包 `dsh-ghost-pkg`（锚文本+`expectPackage` 同步） | **exit=1** `absent:["dsh-ghost-pkg/lib/index.js"]` | ✅ `identical: true` |
| M-B2 | S2 | 真包 + 捏造文件 `lib/ghost-abi.js` | **exit=1** `absent:["dsh-api-session-controller/lib/ghost-abi.js"]` | ✅ |
| M-B3 | S2 | 字段与锚脱钩（`expectPackage`→`dsh-api-remotes`） | **exit=1** `undeclared:["dsh-api-remotes"]` | ✅ |
| M-B4 | S2 | 真包真文件 + **捏造符号** | **exit=0**（**P1-2 依据**，已披露边界） | ✅ |
| M-B5 | S2 | **三字段省略** | **exit=0**（**P1-1 依据**，fail-open） | ✅ |
| M-B6 | — | 复原基线 | exit=0 / 106 断言 | ✅ SHA256 恒等 |
| M-B7 | S5 | 真包真文件 + 捏造 schema 符号 | **exit=1** / 2 FAIL `{"absentSymbols":["settings_ghost_result"]}` | ✅ |
| M-B8 | S5 | 捏造包（自洽） | **exit=1** / 2 FAIL `{"absentFiles":["dsh-ghost-pkg/lib/client.js"]}` | ✅ |
| M-B9 | — | 复原基线 | exit=0 / 106 断言 | ✅ SHA256 恒等 |
| C1 | 越界面 | 批 B 树 + **批 A** `host-abi-health.mjs` | **exit=1** `9h R-1 … missingFresh:["directoryFor(sessionId: SessionId) 面"]` | ✅ 三文件已回批 B |
| C2 | 越界面 | **批 A 树**（4 文件）+ 批 A health | **exit=0** / 178 断言（**批 A 基线绿成立**） | ✅ |
| C3 | 越界面 | 批 B 树 + 批 B health | **exit=0** / 178 断言 | ✅ |
| N1 | 越界面 | 把 `lib/index.js:2596-2630` 字面**重新插入**批 B 注释 | **exit=1** `9h-4 … needleRepetitions:["lib/client.js :: 「lib/index.js:2596-2630」登记 1 处 / 守卫内 2 处"]` | ✅ 字节复原 |

**父版本对照**：`813c4a9:tests/host-contract.mjs` 在副本内实跑 = **82 断言 exit 0**（⇒ 82→106 的 +24 成立）。

**非恒真结论**：新增 5 个判据位点中，S2 的两处（包×文件存在、字段归属）与 S5 的三处**均可构造违规判红**；S2 的字段位点在**字段省略**时退化为平凡满足（P1-1）⇒ **不触发 BLOCKING**（不回退批前强度），登记为硬化残留。

---

## 6. 设计一致性 / 原则符合性

| 依据 | 检查结论 |
|------|---------|
| `arch-004-compatibility-design.md` §5.1(a)（`tests/host-contract.mjs` B6 静态层宿主面契约快照） | **一致**——本批在 S2/S5 上做**判据强化**（非结构变更），未新增/删除面，未改变快照四类面语义。 |
| **P10-④**（测试桩宿主面形态 MUST 锚定宿主源码；禁按心智模型伪造） | **满足且为强化**——13 处新宿主引用**逐字实证**；更关键的是把该纪律**从人工升级为机器判据**（包×文件存在性）。注释主动声明覆盖面边界（**不制造声明强度超事实**）。 |
| **P5**（同一动作汇入同一实现路径；被取代路径禁止并存） | **满足**——S5 的 `_result` 后缀由面键单点派生（消除手抄映射）；`hostTarget` 为 S2/S5/S3/S7 共用单点；原行号式锚形态**未保留并存**。 |
| **P8**（失败/降级 MUST 可观测） | **满足**——失败 detail 结构化（`absent`/`undeclared`/`absentFiles`/`absentSymbols`）；宿主不可达走 `note`（**可见 skip，非静默吞错**，BR-03 守卫不依赖宿主）。 |
| **P4**（产品代码变更 MUST 跑全量测试网，零回退） | **满足**——门控 exit 0 ×3 独立复跑；`lib/client.js` 改动**全为注释行**（无行为面），镜像字节恒等。 |
| **P9**（宿主演进防御：能力自证/parity 守卫） | **正向**——本批把「宿主锚」由文本约定升级为「宿主可达时的存在性机器判据」，直接服务 RISK-003。 |
| **AI 专项：注释不得超宣示（no-overclaim）** | **满足**——R0 点名的 `:261` 不实陈述已改为**具名可核对引用**（§1.7），并在新增注释中**主动披露**判据边界。 |

---

## 7. 遗留计划（非阻塞，交 Coordinator）

| 项 | 建议归属 | 内容 |
|----|---------|------|
| P1-1 | 批 C/D 或后续守卫批 | 为 `HOST_SHAPE_ANCHORS` / `WIRE_SCHEMA_WHITELIST` 增**字段完备性自检**（与 §9h-3 同型：缺字段即红） |
| P1-2 | 同上（可选） | S2 符号宿主可达性核验（`expectSymbolHost` 形态）或 S7 具名符号逐条映射表 |
| P2-1 | 本批或下一批 | `tests/host-abi-health.mjs:857-860` ⑥ 段落「7 处」→「8 处」 |
| P2-2 | 本批或下一批 | `lib/client.js:4981-4983`（镜像双写）补回 settings-models 两锚的符号化形式 |
| P2-3 | 批 C/D 逐处判定 | 7 处保留裸锚：枚举补齐 + 理由逐处标注（`:5561`/`:5562` 两处**可符号化且锚已漂移/错位**） |
| P2-4 / P3-1 | 台账登记 | 自报数字口径与分解修正（blob 尺寸 390850 / 工作树 396555 分列；+24 分解补 S5 +6） |
| P3-2 / P3-3 | 任一批顺带 | 引号渲染统一；`anchorFieldsOf` 冗余形参 |
| P3-4 | 治理留痕 | R0 报告 §1.5/§5「25 单元」自我更正登记（**非本批缺陷**） |
| 治理项 | Coordinator | 锁面（3 文件）与实际提交面（4 文件）记录对齐（§1.9(d)） |

---

## 8. 真实性红线声明 / 未验证项

- **只读铁律遵守**：本审查**未**对任何仓库文件调用 Write/Edit（**唯一写 = 本报告**）；**未**执行 `git add/commit/checkout/restore/reset`；**未**修改 `.governance/**` 既有记录（R0/R1 报告与 evidence 由 Coordinator 机写）。全部变异只在 `%TEMP%` 副本执行并逐次字节复原。
- **仓库工作树零变化实证**：受审前 / 受审后 `git status --short` 逐字相同（仅 `.governance/evidence-log.md`、`plan-tracker.md`、`tpa-last-run.json` 为 M + 两份 R0 报告 `??`），`HEAD = 2d65f6ea76c83ceb616f06f4d2781b35ea42499d` 全程不变。
- **仓库外只读接触面逐条上报（M7.7 R4）**——全部**只读**（`Get-Content` / `Select-String` / `Test-Path` / `Get-ChildItem`），**零写入、零创建、零删除**；目标均在 `C:\Users\peter\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\`：

| # | 时间（+08:00） | 命令（摘要） | 退出码 | 影响路径 |
|---|---------------|-------------|--------|---------|
| 1 | 2026-09-13 ~10:22 | `Test-Path <host>\dsh-host-apiproxy` + `Get-ChildItem <host> -Directory`（包名枚举 213 项） | 0 | `<host>\`（判在否；**不存在**） |
| 2 | 2026-09-13 ~10:22 | `Get-ChildItem _npx\...\node_modules -Recurse -Directory -Filter dsh-host-apiproxy` | 0 | `…\_npx\1e7f6d9597241db0\node_modules\**`（**递归只读，结果为空**） |
| 3 | 2026-09-13 ~10:22 | `Get-ChildItem <host>\dsh-api-session-controller\lib`（文件表） | 0 | `…\dsh-api-session-controller\lib\` |
| 4 | 2026-09-13 ~10:23 | `Get-Content <host>\dsh-api-session-controller\lib\index.js` 逐区读（`:600-615` / `:755-775` / `:605-650` / `:312-323` / `:340-360`） | 0 | `…\dsh-api-session-controller\lib\index.js` |
| 5 | 2026-09-13 ~10:23 | `Select-String <host>\dsh-api-session-controller\lib\index.js`（`resolveCallConfig` / `selectionFor` / `MODEL_DOES_NOT_SUPPORT_IMAGES`） | 0 | 同上 |
| 6 | 2026-09-13 ~10:24 | `Get-ChildItem`/`Select-String <host>\dsh-llm-pi-ai\lib\index.js`（`streamWithSnapshot`） | 0 | `…\dsh-llm-pi-ai\lib\index.js` |
| 7 | 2026-09-13 ~10:24 | `Select-String <host>\dsh-client-ui-settings-models\lib\client.js`（`joinProviderDirectory`）+ `Get-Content :2867-2878` / `:2842-2849` / `:988-996` / `:2553-2591` | 0 | `…\dsh-client-ui-settings-models\lib\client.js` |
| 8 | 2026-09-13 ~10:24 | `Select-String`/`Get-Content <host>\dsh-api-remotes\lib\types\remote-events.js`（`API_REMOTE_FORWARDED_EVENTS` `:10-21`） | 0 | `…\dsh-api-remotes\lib\types\remote-events.js` |
| 9 | 2026-09-13 ~10:24 | `Select-String <host>\dsh-cordis-client-runner\lib\client.js`（`waitingFor` / `dynamicCordisRunner`）+ `Get-Content :4489-4504` / `:2842-2849` / `:312-316` / `:341-344` | 0 | `…\dsh-cordis-client-runner\lib\client.js` |
| 10 | 2026-09-13 ~10:25 | `Select-String`/`Get-Content <host>\dsh-client-ui-model-selection\lib\client.js`（`remote.$on` / `ModelDirectoryResolver` / `directoryFor` / `resolved no scope` / `modelDirectories` / `modelCatalog` / `generation === this.generation` / `.subscribe(`；`:290-293` / `:46-55`） | 0 | `…\dsh-client-ui-model-selection\lib\client.js` |
| 11 | 2026-09-13 ~10:25 | `Get-ChildItem <host>\dsh-client-ui-model-selection\lib -Recurse`（文件表 10 项） | 0 | `…\dsh-client-ui-model-selection\lib\` |
| 12 | 2026-09-13 ~10:26 | `Select-String <host>\dsh-agent\lib\*.js`（`serializeImageAdmission` 定义面——无命中，改由递归全树定位至 `dsh-api-session-controller`） | 0 | `…\dsh-agent\lib\`（只读） |
| 13 | 2026-09-13 ~10:24 | `Select-String <host>\dsh-api-remotes\lib\client.js`（六 `<面>_result` 符号定位） | 0 | `…\dsh-api-remotes\lib\client.js` |
| 14 | 2026-09-13 ~10:26-10:33 | 门控与副本实跑（`node tests/run-all.mjs` ×3 / `node tests/host-contract.mjs` / `node tests/host-abi-health.mjs`）——**读仓库 + 读宿主**，`node_modules` 经 junction 复用 | 0 | 仓库工作目录 + `<host>`（只读） |

- **仓库外写入面**：仅在 `%TEMP%\fix043r1-scratch\`（副本）、`%TEMP%\A-*.mjs`（批 A 取件）、`%TEMP%\hh_*.mjs` / `h_*.mjs` / `p_lib.js` / `mB_*.js` / `fix043r1.zip`（取证件）——**均在仓库外**；`%TEMP%\fix043r1-scratch` 沿用批 A 先例（新建目录，未复用 R0 副本以外任何既有目录）；**零仓库内写入**（本报告除外）。
- **未验证项**（如实登记，**不作为通过依据**）：
  1. **CI 侧 `#SKIP` 实时值**：本审查无 CI 访问权限；CI 侧 `#SKIP 6` 为 `evidence-log.md` 历史机录引用，**非本次实测**。本报告全部 skip 结论限于**本地 Windows 口径 `#SKIP 2`**（已实跑三重复现）。
  2. **`lib/service.js:1326` 隔行站点**（⑧ 第二处，明归批 C）：本审查**未**核验其宿主锚现值（不在本批锁面，Developer 亦未声称改动）。
  3. **`lib/host-abi/llm-selection.js` 的 `dsh-host-apiproxy` 未实证锚**：Developer 自报未闭合；本审查确认 `dsh-host-apiproxy` 包不存在，但**未逐处核验该文件内全部宿主锚**（属 FIX-042 遗留面，非本批新增）。
  4. **P2-3 中 `:4310`（`ui-conversation :16041-16056`）跨包锚**：本审查**未**在宿主侧定位该跨包对象（需读 `dsh-client-ui-conversation`，超出本批必要范围）——故其「跨包待判定」状态**未验证**。
  5. **Developer 真实环境命令的逐条上报粒度**：本审查无其会话内命令级记录，**未复核**（M7.7 R4 义务主体为执行者；本报告仅登记本人接触面）。
  6. **`dsh-cordis-client-runner :2842-2848` 与 `dsh-client-ui-settings-models :2842-2848` 的归属**：本审查确认两处**均**存在（前者为 slots 文档表、后者为 i18n 串表），**采纳** Developer「行号指向 cordis-runner 文档表」的判定（该表含 `inject` 示例，与「static inject」语义对应）；**未**追查该行号最初由哪一版宿主写入（历史溯源非本批范围）。

---

## 9. 交付结论摘要（供 Coordinator）

- **结论**: **`APPROVED_WITH_NOTES`**
- **`unresolved_blockers=0`**
- **P0 = 0**；P1 = 2（均为**判据硬化残留、不回退批前强度**，M10 攻击面已构造性判红）；P2 = 4；P3 = 4
- **三项必答裁定**：
  1. **锚语义等价性 = 成立** —— `:4281` 由 `dsh-host-apiproxy` 改指 `dsh-api-session-controller`：**原包在全 `_npx` 树递归搜索为空（不存在）**，新靶子 `:605 selectModel` / `:609 resolveCallConfig` / `:619→:317 selectionFor.current` / `:761-764` prompt 侧图片准入 **逐条实读命中**，所指对象（`session.selectModel`）与语义（零图片校验、准入在 prompt 时点）**完全保持** ⇒ 系**纠错性改指**，非语义漂移。11 处符号替换全部在声明靶子逐字实存（原行号多处已漂移：`index.js:1721`→实 `:1827`、`:170`→`:296`、`:193`→`:302`、`:752`→`:917/:940`、`:2842-2848`→`:2871`、`:4493-4499`→`:5044`）⇒ **锚保真度提升**。唯一 referent 替换登记 P2-2。
  2. **越界面 = 必要且限于登记/注释面** —— +51/−15 行中**匹配代码构造正则的行数 = 0**（无 `check(`/断言谓词/判据逻辑增删）；改动**必要**（C1 实证判红；9h-4 自碰撞构造性复现）；性质 = **锁面与同批义务冲突所致**，非单方越权。
  3. **批 A 基线绿矛盾 = 不成立** —— C2（批 A 树 + 批 A 守卫）= **exit 0 / 178 断言** ⇒ **R0「基线绿」无误、无需重新解释**；C1 证明 FAIL 系**批 B 自身引入**（取「FAIL 由批 B 引入」一支）。
- **独立复算全部吻合**：镜像 blob/工作树 SHA/`diff --no-index` ✅ / 口径 12→0（两侧）✅ / 断言 82→106（+24 构成）✅、178 未变 ✅ / 门控 exit 0 ×3 + `#SKIP 2` ✅ / 口径 a 9→8→0 ✅ / 口径 b 40→24（①12→0 / ②17 / ③11→7）✅ / `ANCHOR_CASES` stale 6→20、fresh 5→17 ✅ / 13 处宿主符号零幻觉 ✅ / `dsh-host-apiproxy` 不存在 ✅ / 变异全部逐字节复原 ✅。
- **R0 两项 P1 裁决**：**P1-1 = 已闭合（有界）** —— 捏造包/文件/字段脱钩三者判红；**P1-2 = 已闭合** —— `:274`/`:293` 声明与 S7 7c `:802-810` 逐项相符，且「`selectModel` 面不在 S7 判据内」经 `hostRead` 五点面 + S1c/S1d 仅仓内 `deepEqual` 实证**与实况相符**。
- **建议遗留计划**：见 §7（P1×2 → 后续守卫批；P2×4 → 本批尾修或批 C/D；P3×4 → 顺带）。

---

**审查者**：Code Reviewer Agent（只读审查；唯一产出物 = 本文件）
**报告路径**：`.governance/review-FIX-043-R1-input.md`
**下一步**：Coordinator 用 `review-record` 机写 canonical 报告与 REVIEW 证据行（本报告不作为机录替代）。
