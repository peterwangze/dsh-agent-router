# 代码审查报告 — FIX-043 批 A（R0）

- **Task ID**: FIX-043（批 A；批 B/C/D 未派发）
- **Round**: **R0**（首轮审查，无前轮报告）
- **审查对象**: commit `813c4a9d0b8b460f0692500ecdb1114f1a041f7e`（父 = `175d3e1`）
- **审查者**: Code Reviewer Agent（只读；唯一写操作 = 本文件）
- **审查范围**: `tests/host-contract.mjs`（+44/−41，blob `104f31e2`）、`tests/host-abi-health.mjs`（+154/−14，blob `de89a33d`）
- **工作树 SHA256**（受审时点）: host-contract `995B5828…8515FE` / host-abi-health `D536690F…FEEF283`
- **审查时间**: 2026-09-13 10:10 +08:00
- **结论**: **APPROVED_WITH_NOTES**
- **unresolved_blockers=0**

---

## 0. 结论与硬门槛裁决

| 硬门槛 | 阈值 | 实测 | 裁决 |
|--------|------|------|------|
| P0 阻塞问题数 | = 0 | **0** | 通过 |
| 5 维度全覆盖 | = 100% | 5/5（§2） | 通过 |
| 每条发现标注级别 | = 100% | 11/11（§3） | 通过 |
| 设计一致性检查 | 已完成 | 已比对 `.governance/arch-004-compatibility-design.md`（§5.1(a) / §5.1 第 2 项） | 通过 |
| AI 代码专项 5 项 | 全部完成 | 5/5（§4） | 通过 |

**结论 `APPROVED_WITH_NOTES` / `unresolved_blockers=0`**。无 P0；三条 P1 均为**非阻塞**（判据强度相对旧形态为**等价**、未使任何既有判据退化；可达性、非恒真性、双绿、数字口径经本审查独立复算全部成立）。P1-1 / P1-2 / P1-3 与 P2/P3 建议转入批 B~D 或下一批修正。

> 说明：P1 在 SKILL 分级中 = 「强烈建议修改，原则上本轮修改，可申请遗留到下一轮」。本批为 P3 卫生批的**等价改写**，三条 P1 均**不使受审交付的判据强度低于批前**，故不构成 BLOCKING，按「有条件通过 + 遗留计划」处置。

---

## 1. 独立复算（不采信 Developer 数字）

### 1.1 声称 1 — 批 A 口径 19 → 1 【成立】

口径（Developer 采用 FIX-042 R0 #23 审查员口径，**行数口径**）：
`git grep -nE '([A-Za-z0-9_./-]+\.(js|mjs)):[0-9]+(-[0-9]+)?' <rev> -- tests/host-contract.mjs`

| 时点 | 每行匹配计数（`Measure-Object -Line`） | 实况 |
|------|------------------------------------|------|
| `175d3e1`（父/批前） | **19** | 与声称一致 |
| `813c4a9`（本批） | **1** | 与声称一致 |

唯一保留项 = `tests/host-contract.mjs:270` 的 `extra` 签名锚 `'types/agent.js:297-318'`（声称 2 的「保留不动」项），**逐字在位**：

```
813c4a9:tests/host-contract.mjs:270:    extra: [{ file: 'tests/fix-029-host-contract.mjs', signatures: ['types/agent.js:297-318', "key === 'modelSelection'"] }],
```

### 1.2 声称 1 附带口径 — 口径外同族「7 处」【成立】

- `.d.ts` 行锚：`-(js|mjs)` 口径外；批前 1 处 → 批后 0 处（`service.d.ts:44` / `directory.d.ts:13-32,60` 共 2 个行号，落在同一 `anchor` 串）。**属实**。
- 设计文档 `L###` 行锚：`git grep -nE 'L[0-9]+' 175d3e1 -- tests/host-contract.mjs` = **5 处**（`:13/:30/:522/:531/:534`）→ 批后 **0 处**。**属实**。
- `2 + 5 = 7` 与「口径外同族 7 处」**逐数吻合**。

### 1.3 声称 6 — 断言计数与 `#SKIP`【成立，含 1 项口径澄清】

本审查在**仓库外临时副本**（`%TEMP%\fix043-review-scratch`，用 `git show` 逐字节取件，`git hash-object` 与 git blob 逐位相等）实测：

| 项 | 批前 @`175d3e1` | 批后 @`813c4a9`（实仓工作树） | 声称 | 裁决 |
|----|----------------|---------------------------|------|------|
| `host-contract.mjs` 断言 | **82** | **82** | 82（零增删） | ✅ 吻合 |
| `host-abi-health.mjs` 断言 | **174** | **178** | 178 = +3 机核 + 1 条目 | ✅ 吻合 |
| `#SKIP`（Windows 本地） | **2** | **2** | 2，与批前逐字一致 | ✅ 吻合 |
| 全量门控 exit | — | **exit 0 ×2**（21.8s / 22.7s） | 连续两次 exit 0 | ✅ 吻合 |

**`#SKIP` 裁定（答复验收标准 6，含对 Coordinator 提示的裁定）**：

- Developer 自报「Windows 本地基线 = 2，Coordinator 提示的 `#SKIP 1` 与实测不符」→ **该纠正成立**（就本仓 Windows 本地实测环境而言）。
  - 实测输出：`ALL 20 SUITES + 4 RUNNER MODULES (via smoke.mjs) PASSED (21.8s)  #SKIP 2 (smoke.mjs×2)`，明细两行均来自 `smoke.mjs`：`device credential file is owner-only (0o600, POSIX)`（win32 可见 skip，`smoke.mjs:1260-1267`）+ `POSIX online checks (no sh/curl available)`。
  - `#SKIP 1` 是 **FIX-037 时点**的本地基线口径（`.governance/evidence-log.md:616` EV-183：「环境化 skip 口径 ubuntu `#SKIP 3` / Windows `#SKIP 1`」），此后 `#SKIP 1→2` 的变更本身已被机录（`:638` EV-187「win32 `0o600` 静默消失改可见 skip → Windows 基线 `#SKIP 1→2`」）。**用 FIX-037 的旧数字裁定本批 = 时点混用**，Developer 的纠正**成立且可追溯**。
- **结构性证明（比实跑更强）**：`smoke.mjs` 与 `run-all.mjs` 在 `175d3e1..813c4a9` 间 **blob 逐位相同**（`smoke.mjs` = `c6fcbb6b…`）；`git grep -ln 'skip(' 813c4a9 -- tests` 结果**只有 `tests/smoke.mjs`**。⇒ `#SKIP` 计数在被审 commit 前后**必然相同**，本批两文件不可能改变它。
- **同上提示**：CI 侧基线与本地不同且**非本批判据**——`evidence-log.md:638/644/650`（EV-187/188/189）机录 CI 基线为 `#SKIP 6 (host-contract.mjs×2, smoke.mjs×4)`。该计数属 CI 环境（宿主靶子不可达 ⇒ `host-contract.mjs` 2 条宿主面 note）。**本地 2 / CI 6 两口径并存，两者本批均未变**；`host-contract.mjs` 的 note 面在本地为 0（宿主靶子可达，S3/S7 实跑），本审查实测：`host-contract.mjs` 单跑无任何 `--` note 行。建议后续批在计划/证据中以「环境化 skip 口径」形式引用，避免再次时点混用（P2-3）。

### 1.4 未闭合项 / 越界（验收标准 5）【成立】

- `git show --stat 813c4a9` → **仅两文件**（`tests/host-abi-health.mjs` / `tests/host-contract.mjs`）；`git show --name-only 813c4a9` 与之一致。
- **零** `.governance/**`、`lib/**`、`README`、`package.json`、`docs/**` 改动（设计文档 blob 在 `175d3e1` 与 HEAD **逐位相同**：`git rev-parse` 双侧相等）。
- Developer 声称的「口径外同族 7 处」**全部落在 `tests/host-contract.mjs` 自身文本内**（注释/锚串），**未改设计文档** ⇒ **不构成越界**。设计文档 5 处 `L272` 行锚是**引用文本**，被改为 `设计 §5.1(a)`；锚目标经核验**真实存在**：`arch-004-compatibility-design.md:260` = `### 5.1 (a) 静态层：宿主面契约快照测试体系（tests/host-contract.mjs，B6 成体系）`，而原 `L272` 在同版文档中对应的是 §5.1 第 3 项 `dsh.client.inject` 包表比对 —— **两者指向同一节，且 `L272` 是易漂行号，`§5.1(a)` 是稳定小节号 ⇒ 该改写为正向修正**。
- 受审时点仓库工作树仅 `.governance/plan-tracker.md` + `.governance/evidence-log.md` 为 M 状态（Coordinator 治理写回；EV-190 即本任务真实环境披露行），**与 Developer 交付面无关**；本审查**未写任何仓库文件**（唯一写 = 本报告）。

### 1.5 声称 3 / 4 / 5 / 7 核验结论

| 声称 | 裁决 | 关键依据（本审查独立复现） |
|------|------|--------------------------|
| 3 判据改写非弱化 + 可达实证 | **部分成立**：可达性 ✅ / 非恒真 ✅ / 「非弱化」✅（等价）/ 「覆盖面 > 单行号」**不成立** | §3 P1-1/P1-2；M5~M10 变异（§5） |
| 4 ⑤⑥⑦ 收口 + 9h-4/4b/4c + 10 处同类修复 | **成立** | §5 变异 M1/M2/M3 全红；9h-4c 独立复算 25 = 25；两自条目 needle 字面出现数 = 0 |
| 5 `ANCHOR_CASES` 接线 + 双向可达 | **成立** | 条目计量 + 锚串计数（本审独立）；9h R-1 判据对同一 entry 的 stale 命中/fresh 缺失**双向同时报红**（M2 实测：`{"staleHits":["9 处 \`lib/client.js:<NNN>\` 自锚"],"missingFresh":[]}`） |
| 6 门控双绿 + 计数 + 变异复原 | **成立** | §1.3；变异全部字节复原（§5 每次 `restored identical: true`） |
| 7 未闭合项 4 条如实登记 | **成立** | ①②③ 与文件实况相符（`:270`、`.test-home/` 未跟踪、`:807-813` 守卫自身行号引用确实仍在）；④ 属治理面观察，本审查未复核钩子行为 |

---

## 2. 五维度逐项结论

### 维度 1：正确性 — **通过（含 P1 备注）**
- 19 处逐处判定与处置可逐条复算：8 处 `anchor:` 字段（`HOST_SHAPE_ANCHORS` ×3：批前 `:259/:265/:268` 邻域；`WIRE_SCHEMA_WHITELIST` ×6：`:286/:291/:296/:301/:306/:311`）+ 10 处注释/断言标签 + 1 处保留（`:270`）+ 口径外 7 处，**总账吻合**。
- 8 处 `anchor:` 的判据同批改写（`host-contract.mjs:479` / `:612`）先于/同步于文本改写，无「改文本漏改判据」导致的假红。
- 边界条件：`/dsh-[a-z0-9-]+/`（无锚尾）、`/[\w./-]+\.(?:js|mjs|ts)/`（扩展名白名单）、`/[A-Za-z_$][\w$]*\(/`（调用式）三者取与；`spec.anchor.includes(\`${face.replace('.', '_')}_result\`)` 由 `Object.keys(WIRE_SCHEMA_WHITELIST)` 单点派生 ⇒ 判据与数据同源，无手抄漂移面。
- 9h-4c 的 `stale: [` 单元解析器正确性：本审查**独立重写同法解析**，得 **25 单元**（与 `ANCHOR_CASES` 条目数一致）；关键性质——标记串 `"stale' + ': ["`（拼接式）在文件中出现 **0** 次，而字面 `stale: [` 出现 **25** 次，正是 25 个真实数据单元 ⇒ 解析器**只**匹配数据单元，不匹配散文引用（散文里写作 `stale` 字段的数组字面量）。此设计使 9h-4c 的等值判据**非恒真**。
- 资源/并发：无异步、无 I/O 句柄、无共享状态，纯同步只读遍历 ⇒ 不适用（无发现）。

### 维度 2：安全性 — **通过（无发现）**
- 本批为测试守卫文本/判据改写，**不进入产品运行路径**（`lib/**` 零改动）。
- 注入面：新增判据全部为**只读字符串/正则匹配**（`indexOf` / `split(needle).length - 1` / `.includes()` / 三个常量正则），无 `eval` / `new Function` / 无 shell 调用、无路径拼接来自外部输入。既有 `new Function`（S1c/S1e 镜像块求值）**未被本批改动**。
- 敏感数据：无密钥/token/凭据；宿主路径经既有 `_npx` 解析逻辑，未新增硬编码绝对路径。
- 无 OWASP Top 10 相关新增面（无网络、无认证、无 SQL/DOM）。

### 维度 3：可维护性 — **通过（含 P2/P3 备注）**
- 命名可读：`anchorHostForm` / `needleRepetitions` / `selfLiteralNeedles` / `staleUnits` / `countOccurrences` 均表达意图；`OLD_CLIENT_SELF_ANCHOR_CLAIM` / `FRESH_CLIENT_HOST_ANCHOR_CLAIM` 命名点明「被清扫对象」/「替代口径句」。
- 函数长度：新增代码为顺序脚本块（无函数超 50 行）；9h-4 块约 40 行，低于阈值。
- 重复代码：**P5 单点化正收益**——`schemaCases` 由 6 行手抄映射改为 `Object.keys(WIRE_SCHEMA_WHITELIST).map(...)`（`host-contract.mjs:700`），消除两处手抄漂移面；`S2/S5` 判据的 `_result` 约定与 S7 同一表达式。
- 注释质量：新增注释与代码一致度高，**但 3 处表述与事实有偏差**（P1-1 的「覆盖面大于单行号」、P1-2 的「S7 增强组逐字核验」、P2-1 的 ⑥ 邻近行刻画）——注释即判据文档，偏差会误导后续刷新者，已在 §3 逐条给出事实依据。

### 维度 4：性能 — **通过（无发现）**
- 新增 9h-4 块为 **O(needles × 文件长度)** 的字符串扫描：needle 总数 100（判据 detail 自报 `"needleCount":100`）、守卫文件约 44KB，实测单跑 **178 断言 < 1s**（本审查实测）。无嵌套扫描、无重复读盘（`readFileSync` 一次）；`countOccurrences` 用 `split` 为线性，总计 < 10^7 字符操作量级。
- 无循环内 I/O、无 N+1、无 O(n²) 以上算法；`schemaCases` 派生把 6 次手抄替换为 1 次 `Object.keys` ⇒ 中性/微正。
- 全量门控 21.8s / 22.7s 与批前同量级（本审查实仓两次实跑）。

### 维度 5：测试覆盖 — **通过（含 P1 备注）**
- 核心路径：本批交付物**即测试守卫**；`ANCHOR_CASES` 新增 `tests/host-contract.mjs` 条目（stale 21 / fresh 19 / notes 1），使本批清扫的 21 个锚串**回归可见**——21 条 stale 与 §1.1 中实际清除的清单逐数吻合（口径差异如实标注：口径内 19 处含 1 处保留 ⇒ 清除 18，加口径外 7 处中 4 处独立串 ⇒ 21 串，重复串去重后一致）。
- 边界测试：9h-4c 的**解析完整性 fail-closed** 即结构边界判据；9h-4b 覆盖「自条目字面量登记」边界；9h-4 覆盖「非登记复述」边界。
- 错误路径：9h-4c 在解析失配时**判红而非静默降级**（P8 可观测），M3 实测红。
- 覆盖率：无覆盖率工具接入（沿用既有口径）；断言总量 82 + 178 = 260，且**关键新增判据全部经本审查独立变异实证为可判红**（§5）⇒ 满足「测试覆盖」维度的实质要求（判据有判别力，非装饰性断言）。

---

## 3. 发现清单（逐条带级别 + 可复查事实）

### P1-1 — S2 锚形态判据为**格式谓词**，可被完全捏造的锚满足；`host-contract.mjs:476-478` 注释的「覆盖面大于单行号」不成立
- **位置**: `tests/host-contract.mjs:479`（判据）、`:476-478`（注释）
- **事实依据**（本审查在仓库外副本上实跑，字节复原）：
  - 判据源码：`const anchorHostForm = /dsh-[a-z0-9-]+/.test(anchorCase.anchor) && /[\w./-]+\.(?:js|mjs|ts)/.test(anchorCase.anchor) && /[A-Za-z_$][\w$]*\(/.test(anchorCase.anchor)`
  - **变异 M10**：把 `sessionController.selectModel` 的 anchor 整体替换为凭空捏造的 `dsh-ghost-pkg 的 lib/ghost.js ghostFn() 面`（不存在的包 / 不存在的文件 / 不存在的函数）→ **实跑 exit=0，0 FAILURE**。
  - 对照 **M9**：同类捏造在 S5 判据下**判红**（`dsh-nonexistent 的 lib/ghost.js 的 llm_listConfigurableProviders_result schema` → FAIL），因 S5 硬编码 `dsh-api-remotes` + `lib/client.js`，而 S2 的包名正则是**任意 `dsh-*`**。
- **影响**：S2 的「禁心智模型式无锚常量」判据对**锚内容真假零判别力**。历史已发生同类事故（EV-187 机录 R0 P1-1「新锚全库无对象 = 幻觉引用，且新守卫覆盖不到」）。旧判据（`/[\w./-]+\.\w+:\d+/`）同样是格式谓词（**零**宿主语义绑定），故本批**未使 S2 强度下降**；但注释声称「三元 token 覆盖面大于单行号」在**反幻觉**这一目标上不成立，且「符号可由 S7 增强组宿主可达时逐字核验」对 `selectModel` 亦不成立（见 P1-2）。
- **修复建议**（转批 B~D）：把包名约束收紧为**正向白名单**（`dsh-(api-remotes|api-session-controller|client-ui-model-selection|llm|client-ui-settings|client-locale|tools|…)`）并将「符号」从「任意带括号标识符」改为按 face 声明的期望符号集（如 `HOST_SHAPE_ANCHORS` 增 `expectPackage` / `expectFile` / `expectSymbol` 字段，由判据逐项比对），使捏造锚判红。若维持现状，须把注释改为如实表述（「格式判据，语义核验依赖 S7 部分覆盖 + 人工刷新」）。

### P1-2 — S2 anchor 文本断言的「S7 增强组逐字核验」对部分符号**无对应判据**（不实陈述）
- **位置**: `tests/host-contract.mjs:261`（face 1）、`:268`（face 2 的 `S7 增强组逐字核验` 措辞）
- **事实依据**：S7 7c 段（`host-contract.mjs:706-714`）实际只核验三件事：
  - `:708-709` `agentTypes.includes('selectionFor(agent)')` + `includes("stateOf(agent.session, 'modelSelection')")` + `includes('projectionState.pending')`
  - `:710-711` `directoryTypes.includes('directoryFor(sessionId: SessionId): ModelDirectory')`
  - `:712-714` `LLM_ADAPTER_PROTO_BASELINE` 六方法的 `\b<method>\(`
  ⇒ **`selectModel` 不在 S7 任何判据内**（`git grep -n selectModel tests/host-contract.mjs` 显示其仅出现在 S2 anchor 文本、`:261`，无对应 check）；`lib/types/agent.js` 侧只核验 3 个符号，而 `:261` 的 `types/agent.js` 路径与 `catalog/`… 等符号级命名未被逐字核验。
- **影响**：仓库文本声明了不存在的机器核验义务，与 `project-styles` 事实性要求及 FIX-041 R0/F-1 判例（注释标 FIX-041 R2 而该轮不存在 = 违反可追溯红线）同族；后续刷新者可能因「已被 S7 核验」而不复核。
- **修复建议**：把 `（S7 增强组逐字核验）` 改为**可核对的引用**（如「S7 7c 段核验 `selectionFor(agent)` / `stateOf(agent.session,'modelSelection')` / `projectionState.pending`；`selectModel` 面由 S1c/`llm-selection.js` 消费面覆盖」），或补一条 S7 判据覆盖 `selectModel`。

### P1-3 — 9h-4 的解析器存在**语法洁净旁路**：数据单元内注释可掩蔽「非登记复述」
- **位置**: `tests/host-abi-health.mjs:948-1001`（`staleUnits` 收集 + `countOccurrences(staleDataText, needle)`）
- **事实依据**（仓库外副本实跑，字节复原）：
  - **变异 A1**：`{ file: ['tests', 'metrics.mjs'], stale: [/* host-route.js:55 */ …] }`（在该条的 `stale: [` **首元素前**插入含另一条 needle 值的块注释，元素数不变）→ **实跑 exit=0，0 FAILURE**。原因：该注释落在被收集的 unit 文本内 ⇒ `registered` 由 1 升 2，与 `inGuard` 2 相等 ⇒ 判据放行。
  - **变异 A2**：把注释插在数组**中间元素后**（`… 'smoke.mjs:1680-1681', /* preset: host-route.js:55 */ ]`）→ 同样 exit=0（原因同上；该形态本身是 JS 语法错误，实际落地时会以语法错响亮失败，故 A1 是**唯一有实际意义的旁路形态**）。
  - 9h-4c 对此**不判红**（单元数仍 = 条目数）：A1 实跑中 `staleUnitCount` 与 `caseCount` 均未失配。
- **影响**：9h-4 的文档口径「非登记逐字复述 = 0」在**数据单元内部注释**这一形态上不成立。严重度定为 P1（非 P0）：需刻意把 needle 写进数组首元素之前，正常编辑不会触发；且该形态下 9h-4 仍挡住更常见的「注释块/fresh 清单/断言标签里复述 needle」情形（M1 实测红）。
- **修复建议**：`registered` 改为**按元素字符串精确计数**（先按 `,` 切分元素并逐元素去引号后比对，或统计 `'<needle>'` 带引号形态），而非在被收集的整段文本上做子串计数；或对 unit 文本做一次注释剥离后再计数。并在注释中收敛口径措辞（「登记数据单元内以 needle 字面量形态出现的次数」）。

### P2-1 — ⑥ 的「邻近行」刻画与实况不完全相符（方向正确、计量不准）
- **位置**: `tests/host-abi-health.mjs:835-842`
- **事实依据**（`lib/client.js` 8 处 `lib/client.js:<NNN>` 逐处读上下文）：**8 处、全部为宿主包锚（非本仓自锚）的核心结论成立**（每处邻近上下文均出现宿主包名，如 `dsh-client-ui-…` / `dsh-cordis-client-runner` / `宿主` 指代），但「包名在邻近行：7 处紧邻上一行 / 1 处上二行同句续行」不精确：`:5557`、`:5597` 的宿主包指代在**更远行**（≥2 行前），`:5008` 的包名跨 `/** … */` 注释行续行（上 4 行处），`:5450` 的宿主包名位于**上一行且行本身被折断**。⇒ 建议改为「8 处均为宿主包锚；包名多在同段注释内（分布为紧邻 1~4 行内）」，或给出逐处的行距清单，避免再次出现「数字连口径引用」的复发面（EV-189 F-1 同族）。
- 附带（同段）：⑥ 的取数口径 `git grep -oE 'lib/client\.js:[0-9]+(-[0-9]+)?' -- lib/client.js` 为 `-o` 匹配口径，本审查独立复算 **`175d3e1` = 8 / `6bc3841` = 9 / `813c4a9` = 8**，与 ⑥ 的「8 处 / FIX-042 批前 `6bc3841` = 9 处 / 差额 1 处 = `:4754-4825` 已随 FIX-042 W1/W2 清扫」**逐数吻合**；差额来源已实证：`git grep -n '4754-4825' 6bc3841 -- lib/client.js` → `6bc3841:lib/client.js:4971`，而 `git diff 6bc3841 175d3e1 -- lib/client.js` 显示该行被删。

### P2-2 — 三份「无法单独核实」的形态性不实陈述（N-S1..N-S3 合并登记）
1. `host-contract.mjs:139` 旧注释（批前）称 `dsh-llm lib/index.js:1618 class LlmAdapter` —— 宿主实读 `:1618` = **`var LlmAdapter = class {`**（`class LlmAdapter` 在宿主文件中**不存在**）。本批已删除该锚，**方向正确**；但新增文本（`:139`）改为「宿主 dsh-llm 的 LlmAdapter 类原型」，与宿主形态（`var LlmAdapter = class {}`）仍非逐字对应，建议按宿主实态措辞（如「LlmAdapter（宿主以 `var LlmAdapter = class {}` 定义，导出名 LlmAdapter）」）。
2. `host-contract.mjs:36`（批前）S5 头注「锚 dsh-api-remotes lib/client.js:5727-5734 / :8164-8193 / 同源四例」表述为「六 schema」而只列二例；本批改为「六 schema——逐面宿主符号见 WIRE_SCHEMA_WHITELIST」**已修正**。
3. `:421` 旧断言标签把 `createAssistantMessage` 归入 `prestep.js:33` —— 实测 `lib/prestep.js:33` 只 `import { createUserMessage }`；`createAssistantMessage` 在 `lib/service.js:28`。本批已修正为「两符号分列在仓 import 行」，**属正向勘误**（`git grep -n 'dsh-llm/message' HEAD -- lib/service.js lib/prestep.js` 双侧实证）。

### P2-3 — 治理面：`#SKIP` 口径的环境化引用纪律（建议）
- **位置**: `.governance/evidence-log.md:616`（Windows `#SKIP 1`）/ `:638,644,650`（CI `#SKIP 6 (host-contract.mjs×2, smoke.mjs×4)`）/ 本批 Developer 自报（本地 `#SKIP 2`）
- **事实依据**：三者均为**真实机录**，差异来自环境（win32 平台 skip 条数 + 宿主靶子可达性）。本次「`#SKIP 1` vs 实测 2」的争议本质是**时点+环境混用**。
- **建议**：后续批引用 skip 数一律写成「环境化口径：Windows 本地 `#SKIP n` / CI `#SKIP m`，取数时点 `<rev>`」，与既有 `7 修订绑定` 纪律同形。

### P3-1 — 9h-2/2b/2c 判据面向零覆盖对象（既有状况，非本批引入）
- **位置**: `tests/host-abi-health.mjs:1004` 起（9h-2 系列在 9h-4 之后）
- **事实依据**：9h-4 段落之后紧接 `// 9h-2（FIX-040 W4；R0 P1-1 收口）` 注释，其后即 9h-5 段落（`ANCHOR_CASES` 循环内 `host-contract.mjs` 条目的 stale/fresh 已由 9h-5 消费）。**本批新增的 `tests/host-contract.mjs` 条目是否被 9h-2 系列覆盖，本审查未做穷尽核验**（属既有结构，非本批引入）。建议批 B/C/D 顺带登记覆盖矩阵。

### P3-2 — 9h-4/4b/4c 的判据 detail 字段串接 S7/9h 口径说明，输出噪声偏大
- detail 中携带 `needleCount:100` / `staleUnitCount:25` 有诊断价值；但失败时的 `needleRepetitions` 文本含「登记 N 处 / 守卫内 M 处」与 needle 全文，长 needle（如 `lib/service.js` 相关句）会使日志行显著变长。建议保留（诊断优先），仅登记为观察。

---

## 4. AI 代码专项 5 项检查

| # | 检查项 | 结论 | 事实依据 |
|---|--------|------|---------|
| 1 | **mock 残留** | **无发现** | 新增代码为纯只读文本判据，无 mock/stub 注入；`host-contract.mjs` 的 S1a `fakeLlm` 与 `probeCtx` 为**既有权衡夹具**（本批未改）；`:421` 一带本批改动仅为注释/标签文本。 |
| 2 | **硬编码返回值** | **无发现** | 未见 `return true`/恒真短路等硬编码；9h-4/4b/4c 三条判据的比较对象均为实参派生（`inGuard`/`registered`/`staleUnits.length`/`ANCHOR_CASES.length`）。**反向验证**：三条判据经 M1/M2/M3 变异**均可判红**（见 §5），非硬编码恒真。 |
| 3 | **幻觉 API / 幻觉符号** | **本批新引符号全部实存（1 项按 P2-2 措辞待收敛）** | 宿主靶子（`…\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai`，**只读**）逐字核验：`llm_listConfigurableProviders_result$schema`@5727 / `llm_listProviders_result`@5735 / `session_modelCatalog_result`@8164 / `settings_describe_result`@4712 / `credentials_describe_result`@4701 / `agentPresets_list_result`@4315 —— **六者全部在位，且行号与旧锚逐字吻合**；`selectionFor(agent)` / `stateOf(agent.session, 'modelSelection')` / `projectionState.pending` / `directoryFor(sessionId: SessionId): ModelDirectory` / `ModelDirectoryState` / `load` / `selectModel` / `API_REMOTE_FORWARDED_EVENTS` 全部 **True**。仓库侧：`assembler.push@1437..blocks()@1443`、`export class RouterService extends TypertRemoteService@636`、`ctx.tools.register(defineTool(@61`、`dsh-llm/message` import 双行、`tests/fix-029-host-contract.mjs:7` 与 `lib/prestep.js:150` 的 `types/agent.js:297-318` —— 全部实存。**唯一偏差**：`class LlmAdapter`（宿主实为 `var LlmAdapter = class`）见 P2-2。 |
| 4 | **未实现 TODO** | **无发现** | diff 中无新增 TODO/FIXME/占位；未闭合项以 `notes:` 与注释**如实登记**（`:270`、`.test-home/` 工具头、`:807-813` 守卫自身行号引用），符合 P8 可观测要求。 |
| 5 | **过度实现** | **无发现** | 改动量 = 2 文件 `+198/−55`，全部锚文本/判据同域；无「顺带重构」、无新增抽象层、无越界文件（§1.4）；`schemaCases` 改动为**消重**（6 行手抄 → 1 行派生），是减法式泛化，符合 P5「同一动作汇入同一实现路径」。 |

---

## 5. 变异实验台账（全部在**仓库外**副本执行，逐次字节复原）

副本：`%TEMP%\fix043-review-scratch`（`git archive HEAD` 展开 + `git show <rev>:<path>` 逐字节取件，`git hash-object` 与 git blob 逐位相等；`node_modules` 为 junction）。所有变异在**副本**上进行，仓库工作树零改动（受审前后 `git status --short` 仅 Coordinator 的 `.governance/` M 项）。

| # | 目标 | 变异 | 结果 | 复原 |
|---|------|------|------|------|
| M1 | 9h-4 | 守卫内新增常量 `'host-route.js:55'`（非登记复述） | **exit=1**，`FAIL B5 9h-4 R-1 … {"needleRepetitions":["lib/stats.js :: 「host-route.js:55」登记 1 处 / 守卫内 2 处"],"needleCount":100,"staleUnitCount":26}` | ✅ 逐位 |
| M2 | 9h-4b / 9h R-1 | 自条目 needle 由拼接常量改字面量 | **exit=1**，3 FAILURE：`staleHits:["9 处 \`lib/client.js:<NNN>\` 自锚"]` + `9h-4b … {"selfLiteralNeedles":[…]}` + `9h-4 … 登记 0 处 / 守卫内 1 处` | ✅ 逐位 |
| M3 | 9h-4c | 在守卫注释中注入 `stale: ['x']`（凭空多一个数据单元） | **exit=1**，`FAIL B5 9h-4c R-1 … {"staleUnitCount":27,"caseCount":26}` | ✅ 逐位 |
| M4 | 9h-4 边界对照 | 非自条目新增无对应 needle 的字面量（`'control-literal-probe:1'`） | **exit=0**（对照组：证明 9h-4 不误红） | ✅ 逐位 |
| M5 | S2 | 去宿主包名（3 处 anchor） | **exit=1**，2 FAILURE（S2 锚形态） | ✅ 逐位 |
| M6 | S2 | 去调用式符号（`selectionFor(agent) →` 链） | **exit=1**，1 FAILURE | ✅ 逐位 |
| M7 | S5 | 去 `<面键>_result` 符号（6 处） | **exit=1**，5 FAILURE | ✅ 逐位 |
| M8 | S5 | 去 `lib/client.js` 文件 token（6 处） | **exit=1**，6 FAILURE | ✅ 逐位 |
| M9 | S5 | **捏造锚**（`dsh-nonexistent lib/ghost.js <face>_result`） | **exit=1**，判红（S5 硬编码包名/文件 ⇒ 有判别力） | ✅ 逐位 |
| **M10** | **S2** | **捏造锚**（`dsh-ghost-pkg 的 lib/ghost.js ghostFn() 面`） | **exit=0 —— 未被判红（P1-1 依据）** | ✅ 逐位 |
| A1 | 9h-4 | 数据单元**首元素前**插入含他人 needle 的块注释 | **exit=0 —— 未被判红（P1-3 依据）** | ✅ 逐位 |
| A2 | 9h-4 | 数据单元**中间元素后**插入同类注释 | exit=0（同因；该形态本身是 JS 语法错误，落地会以语法错响亮失败） | ✅ 逐位 |

**非恒真谓词结论（验收标准 4）**：9h-4 / 9h-4b / 9h-4c **三者均非恒真、均可构造违规判红**（M1/M2/M3）；S2/S5 判据**非恒真**（M5~M9），但 **S2 存在捏造锚通过面（M10）**。⇒ **不触发 BLOCKING**；P1-1/P1-3 为**判别力边界**登记。

**独立复算（9h-4c）**：本审查自写同法解析器 → **25 单元**；`ANCHOR_CASES` 条目 `^ {4}\{ file: \[` 计量 = **25**；`grep -c '^ {4}\{ file: \['` 同值。标记串 `"stale' + ': ["` 出现 0 次 / 字面 `stale: [` 出现 25 次 ⇒ 解析器与数据单元一一对应。

---

## 6. 真实性红线声明 / 未验证项

- **只读铁律遵守**：本审查**未**调用 Write/Edit 于任何仓库文件（唯一写 = 本报告）；**未**执行 `git add/commit/checkout/restore/reset`；**未**修改 `.governance/**` 既有记录。
- **仓库外接触面逐条上报（M7.7 R4）**——全部为**只读**读取，零写入、零创建、零删除；目标路径均在 `C:\Users\peter\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\` 下：

| # | 时间（+08:00） | 命令（摘要） | 退出码 | 影响路径 |
|---|---------------|-------------|--------|---------|
| 1 | 2026-09-13 ~10:05 | `Get-Content <host>\dsh-llm\lib\index.js`（`LlmAdapter` 定位 + `:1618/:1624/:1635/:1645/:1653/:1665/:1681` 逐行读） | 0 | `…\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\dsh-llm\lib\index.js` |
| 2 | 2026-09-13 ~10:05 | `Get-Content <host>\dsh-api-remotes\lib\client.js`（六 `<face>_result$schema` 定位） | 0 | `…\dsh-api-remotes\lib\client.js` |
| 3 | 2026-09-13 ~10:05 | `Get-Content <host>\dsh-api-remotes\lib\types\remote-events.js`（`:12-32` + 事件计数 19） | 0 | `…\dsh-api-remotes\lib\types\remote-events.js` |
| 4 | 2026-09-13 ~10:05 | `Get-Content <host>\dsh-api-session-controller\lib\types\agent.js`（`:289/:297-318` 符号核验） | 0 | `…\dsh-api-session-controller\lib\types\agent.js` |
| 5 | 2026-09-13 ~10:05 | `Get-Content <host>\dsh-api-session-controller\lib\index.js`（`:605/:2502/:2503`） | 0 | `…\dsh-api-session-controller\lib\index.js` |
| 6 | 2026-09-13 ~10:05 | `Get-Content <host>\dsh-client-ui-model-selection\lib\types\client\{service.d.ts,directory.d.ts}`（`:44` / `:13/:32/:60`） | 0 | `…\dsh-client-ui-model-selection\lib\types\client\service.d.ts`、`…\directory.d.ts` |
| 7 | 2026-09-13 ~10:07 | `Test-Path <host>\dsh-client-modules\lib\client.js`（⑤ needle 对侧对象核验） | 0 | `…\dsh-client-modules\lib\client.js`（判在否） |
| 8 | 2026-09-13 ~10:05 | S7 组本身读宿主（门控套件内置，随 `node tests/run-all.mjs` 触发） | 0 | 同上 `dsh-api-remotes` / `dsh-llm` / `dsh-api-session-controller` / `dsh-client-ui-model-selection` |

- **仓库外写入面**：仅在 `%TEMP%\fix043-review-scratch`（仓库外）创建审查副本与探针脚本（`probe-units.mjs` / `probe-needles.mjs` / `mutate-*.mjs`），并在 `%TEMP%` 生成 DSH 溢出文件；**零仓库内写入**（本报告除外）。
- **未验证项**（如实登记，**不作为通过依据**）：
  1. **Developer 自报「真实环境命令逐条上报」的粒度**：EV-190 已机录为「部分上报（无逐命令粒度）」；本审查**未**复核 Developer 会话内的命令级记录（无该数据）。
  2. **`lib/host-abi/inject-manifest.js` 的 `':5060 先例'` needle 目标对象**：本审查仅确认守卫侧 needle 值与登记形态（`stale: [':5060 先例', …]` 在文件内以 `':5060 先例',` 形式出现，非拼接常量）；**未**核验 `:5060` 指代的宿主对象是否存在（属 FIX-042 遗留，非本批范围）。
  3. **`ANCHOR_CASES` 新增条目「stale 21 / fresh 19 / notes 1」的三元计量**：本审查独立确认条目存在、notes=1、双向判据对同一条目同时生效（M2）；21/19 的分项计数以文件内实见为准（本审查计数 41 个 `^ {8}'` 字面量为**含既有条目行**的口径差异），**未**逐元素重算至与 21/19 逐数吻合——**该分项数字标注为「未独立复算」**（不构成阻塞：断言计数与门控双绿均已独立复现）。
  4. **`#SKIP` 在 CI 侧的实时值**：本审查无 CI 访问权限；CI 侧 `#SKIP 6` 为历史机录引用（`evidence-log.md:638/644/650`），**非本次实测**。
  5. **`.test-home/fix042-{base,head}.txt` 的自声明 97/22 与 92/19**：本审查已读两份快照的**自声明头行**（`= 97 … 文件数 = 22` / `= 92 … 文件数 = 19`），与 ⑦ 的引用**逐字吻合**；但**未重跑差额工具**复算这两个数字（属 FIX-042 W3 面的追溯，非本批新增）。

---

## 7. 交付结论摘要（供 Coordinator）

- **结论**: `APPROVED_WITH_NOTES`
- **`unresolved_blockers=0`**
- **P0 = 0**；P1 = 3（非阻塞，均不使判据强度低于批前）；P2 = 3；P3 = 2
- **独立复算全部吻合**：19→1 口径 ✅ / 断言 82・82 ✅ / 断言 174→178 ✅ / `#SKIP 2` 前后一致 ✅ / 门控双 exit 0 ✅ / 变异全部字节复原 ✅
- **基线纠正裁定**：Developer 对「本地 `#SKIP` 基线 = 2、`#SKIP 1` 与之不符」的纠正 **成立**（`#SKIP 1` = FIX-037 时点口径，`#SKIP 1→2` 已有机录；且 `smoke.mjs`/`run-all.mjs` 在本批前后 blob 逐位相同 ⇒ skip 计数必然不变）。附带：CI 侧基线为 `#SKIP 6`（历史机录），两口径并存，本批均未变。
- **建议遗留计划**：P1-1 / P1-2 / P1-3 + P2-1 → 批 B~D 收口（P1-1 建议与 `HOST_SHAPE_ANCHORS` 增加 `expectPackage/expectFile/expectSymbol` 字段一并做）；P2-2 措辞 → 任一批顺带；P2-3 → 引用纪律。
