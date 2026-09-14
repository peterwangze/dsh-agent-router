# FIX-047 R1 复审报告（Reviewer 输入件）

| 字段 | 值 |
|---|---|
| task_id | FIX-047 |
| **round** | **1**（复审；round < 3，未触 fuse） |
| **前轮引用** | `.governance/review-FIX-047-R0-input.md`（R0：**APPROVED_WITH_NOTES** / `unresolved_blockers=0`，P3 = 7 条） |
| reviewer_role | Code Reviewer（**只读**——未修改任何文件、未执行任何命令、未创建子 agent） |
| 复审对象 | 返工 commit `06b4c85`（Coordinator 报 `--stat` = **仅 1 文件**：`tests/client-render.mjs`，+20 −5）；前轮交付 `d1c9d95` |
| 审查方式 | 当前工作树逐行实读（Read/Grep/Glob）+ 与 R0 实读内容逐处对照 + 对照 `tests/host-abi-health.mjs` 9h 族判据面 + 静态推演链 |
| **结论** | **APPROVED_WITH_NOTES** |
| **unresolved_blockers** | **0**（P0 = 0；P1 = 0；P2 = 0；P3 = 3 条（含 1 条**已显著收窄**的 R0 遗留 P3-1 残余）+ R0 另 5 条维持「未修但已登记」） |

**R1 结论一句话依据**：R0 点名的两条一行级 P3 **均已修复且修复方式与本轮要求一致**（§1：P3-1 = 基线非空前提 + 结构化详情；P3-2 = 三类形态守卫 + 空驱动 + 结构化 FAIL）；R0 另 5 条经实读确认**未修且未扩面**（§1），无新引入 P0/P1/P2；9h 族与镜像结论经复核**仍成立**（§4）。

---

## 1. 逐条比对前轮 findings（我的 R0 7 条 P3）

| R0 编号 | 级别 | 状态 | R1 证据（实读） |
|---|---|---|---|
| **P3-1** F-16b 基线依赖外挂（空洞绿风险） | P3 | **已修复（核心闭合；残余见 N-1）** | `tests/client-render.mjs:2422-2424`：断言首项新增 `statsDiagAfter.length > 0 &&`，并补结构化失败详情 `{ baseline: statsDiagAfter.length, withinEpisode: statsDiagWithinEpisode, final: statsDiagOf().length }`；`:2417-2421` 注释如实登记原隐式前提来源（前置 F-16 的 `:2390` guard）。**修复有效**：`statsDiagAfter.length > 0` 现由**本条断言自身**强制 ⇒ 基线为零即判红，不再外挂于另一条断言的顺序/存活（静态推演见 §2①） |
| **P3-2** `statsTimer.fn()` 无 null 守卫 | P3 | **已修复（完全闭合）** | `:2402-2404` 新增断言 `'FIX-047-F16b[harness]: 2s stats 轮询 timer 已被 harness 捕获且未清除…'`，条件 `Boolean(statsTimer) && typeof statsTimer.fn === 'function'`，详情 `{ capturedTimers: captured.timers.length, nonClearedMs: captured.timers.filter((t) => !t.cleared).map((t) => t.ms) }`；`:2405` 空驱动 `const tickStatsTimer = statsTimer && typeof statsTimer.fn === 'function' ? statsTimer.fn : () => {}`；`:2407/2411/2414` 全部改用 `tickStatsTimer()`（原 `statsTimer.fn()` 调用点**已不存在**——grep `statsTimer` 命中仅 `:2396`（取值）、`:2402-2405`（守卫/兜底））⇒ 三类形态（`null`/非对象/`fn` 非函数）**均不崩**（静态推演见 §2②） |
| **P3-3** F-16 的 `code` 恒定不含宿主错误码 | P3 | **未修但已登记**（作者声明未扩面；实读 `lib/client.js` 未改） | `lib/client.js:2235` 仍为固定 `'host-face-stats-rejected'`；未改面与 Coordinator「仅 1 文件」声明一致（§4 结构性核验） |
| **P3-4** N-1 按位成对 ⇒ 两侧同改不判红（我先判「可接受」） | P3 | **未修但已登记**（同 R0 判定：可接受，不要求修改） | `tests/rpc-shadow-guard.mjs` 本批未改（`[:：]\s*\d{3,}` 扫描 0 命中、FIX-047 文本与 R0 一致） |
| **P3-5** runner 模块无自打印计数（口径依赖静态计数） | P3 | **未修但已登记**；**作者本轮以两口径交叉自证缓解** | 实读：`client-render.mjs` 仍无 `process.exit`/自打印（`run-all.mjs:85-89` 的 runner 形态 pre-flight 要求其**不得**含 `process.exit`）⇒ 口径不可变；作者改用「静态 `check(` 计数 ∩ probe 计数」交叉一致（256/256，我独立复核见 §4） |
| **P3-6** 变异/哈希证据无仓内持久化留档 | P3 | **未修但已登记** | 本仓仍未发现 FIX-047 变异副本/复算说明（glob/grep 面内无） |
| **P3-7** 夹具 `'withEntries'` 不带 `consumer` ⇒ 该可选字段面未行使 | P3 | **未修但已登记**（作者 R0 已如实声明） | `client-render.mjs:372-390`（`hostFaceMode === 'withEntries'` 分支）文本与 R0 相同，diag 条目仍只带 `at/kind/face/code/detail` |

**新引入（R1）**：无 P0/P1/P2；新发现 1 条 P3（N-1，R0 P3-1 的**残余形态**，非新缺陷）+ 2 条越界观察记录（N-2/N-3，均非本批引入）。R0 其余 5 条维持原状。

---

## 2. 重点核验项逐项裁决（Coordinator 指定 5 项）

### ① P3-1 的非空前提是否**真的**消除空洞绿（是否仍有等价空窗可静默通过）
- **改造后断言（`:2423`，逐字）**：`statsDiagAfter.length > 0 && statsDiagWithinEpisode === statsDiagAfter.length && statsDiagOf().length === statsDiagAfter.length + 1`，基线 `N = statsDiagAfter.length`。
- **原空洞形态已被杀死（形式化）**：原「空洞绿」= 该窗口零记录 ⇒ `0 === 0` 且 `1 === 0+1`。现第一项在 `N = 0` 时短路为假 ⇒ 同一形态**必红**（作者的 m1 变异实证输出 `{"baseline":0,"withinEpisode":0,"final":1}` **恰好就是这一形态**，与静态推演完全吻合；该实证数字来源 = 作者自陈，见 §5 U-5）。
- **剩余可静默通过形态的枚举（逐项判定，全部依赖静态推演）**：
  1. **同周期追加被削（边沿触发被去掉）** ⇒ 3 拍各 +1 ⇒ `withinEpisode = N+3 ≠ N` ⇒ **否**（第二项红）。
  2. **effect 在窗口内重跑（`statsFailureRecorded` 被重置）** ⇒ 同上 ⇒ **否**。
  3. **「成功复位」失效** ⇒ 第 4 拍不追加、第 5 拍仍被抑制 ⇒ `final = N ≠ N+1` ⇒ **否**（第三项红）。
  4. **窗口内完全无记录（基线靠 F-16 那一拍留下，而 3 拍 tick 未真正驱动 poll）** ⇒ `withinEpisode = N`、`final = N+1` ⇒ **是，仍可静默通过**。⇒ 这就是残余（**N-1**）。注意其**必要性条件已显著变严**：必须同时满足「基线非空（⇒ F-16 一拍确实机录过）」+「3 拍 tick 实际未驱动任何 poll」——即 harness 面「timer 被捕获且 `fn` 可调用，但调用不产生 RPC」这一特定形态，**而非**任何产品行为缺陷（产品侧的边沿触发/复位语义已由 1~3 项看护）。**缓解（成本一行）**：在本窗口前后记录 `pollRpc.stats` 并断言增量 ≥ 3（`pollRpc` 为既有计数器，`:178`，`:344` 已计数）。
- **可达性核验（为什么当前实现确实能通过，非恒真）**：`renderInto` 复用同一 `pathKey` 实例（`:106-111`）、成功拍不触发 `setStats`（所有 5 拍均 reject ⇒ effect deps `[ready, remote]` 不变，`:2257`）⇒ `statsFailureRecorded` 在 5 拍间保持同一闭包值 ⇒ 恰 +1（`final = N+1`）成立 ⇒ 断言**不恒真、不恒假**（作者的 m1/m2 两侧变异分别为红/绿，与该结构一致）。
- **判定：核心风险已闭合**；残余为**低成本可选加固**（N-1，P3，不阻塞）。

### ② P3-2 的守卫是否覆盖 `null` / 非对象 / `fn` 非函数三类形态；FAIL 详情是否足以定位
- **`null`（或 `undefined`）**：`filter(...).pop()` 空数组返回 `undefined` ⇒ `Boolean(undefined) = false` ⇒ 断言红；`tickStatsTimer` 兜底 `() => {}` ⇒ 后续 3+2 拍**全部空转、零 RPC** ⇒ F16b 第三项 `N === N+1` 亦红（**= 作者实测 `2 FAILURES`，与本推演一致**）✓
- **非对象（理论形态）**：`captured.timers` 元素均为 `:184` 构造的对象字面量 ⇒ 该形态不可达；但即使可达，`Boolean(x)` 与 `x.fn` 取值对原始值/对象均不抛（仅 `null/undefined` 会抛，已被 `Boolean` 短路），语义退化到 `fn` 非函数支 ⇒ **不崩、判红** ✓
- **`fn` 非函数**：`Boolean(timer) && typeof timer.fn === 'function'` ⇒ 红 ✓；空驱动兜底 ⇒ 后续不崩 ✓
- **FAIL 详情充分性**：现详情含 `capturedTimers`（计数）+ `nonClearedMs`（**全部未清除 timer 的 ms 列表**）。以作者实测 `{"capturedTimers":30,"nonClearedMs":[30000]}` 为例：可直接读出「活性集内只剩 30s catalog 兜底 timer，2s 轮询 timer 缺席」⇒ 定位充分 ✓（**残留 P3-N3**：`nonClearedMs` 为全量列表而非仅 2000ms，全量跑时噪声较多，不阻塞）
- **不崩 runner 的实证链（静态可验）**：`check` 不中断执行（`tests/smoke.mjs:39` 仅分支打印）⇒ 断言红后继续 ⇒ 后续 F-10/F-12/F-11/N-2 断言照跑（作者实测 `ok=1183` + 2 FAIL，与「不崩即保留后续断言」一致）✓
- **判定：三类形态全覆盖且完全闭合**（优于我在 R0 的建议：同时解决了「崩 runner 导致失败不可诊断」的次生伤害）。

### ③ 是否有**新引入**问题（含新断言自身是否恒真/过度约束；是否引入自指文本触发 9h 族）
- **新断言 1（`:2402-2404`，harness 守卫）**：正常路径下 `statsTimer` 必存在（`:2383` 渲染该实例时 `setInterval` 推入 `:184`）⇒ 该断言在健康态为**真**；它不是产品行为断言，而是**测试基建自证**（标签含 `[harness]`，`:2402`）⇒ 定位语义诚实，非「恒真装饰」✓
- **新断言 2（`:2423` 的 `statsDiagAfter.length > 0`）**：**非恒真**（作者 m1 变异实测红）✓；**非过度约束**（正常路径 `N = 1`，与 `final = 2` 自洽）✓
- **顺序/短路副作用**：`N = 0` 时因短路，`statsDiagOf().length === N+1` 不再求值 ⇒ 该形态只产 1 条 FAIL（正确）；余下那 1 条 FAIL 来自 harness 守卫（同一根因）⇒ **两条 FAIL 全部有据**，非重复噪声 ✓
- **自指文本 / 9h 族**：对 `tests/client-render.mjs` 重新执行 9h 三形态正则扫描（`[:：]\s*\d{3,}` / `L\d{2,4}` / `.<js|mjs|cjs>:N`）⇒ 命中**恰 12 条、行号与 R0 完全相同**（`:349/350/352/387/478/561/1310/1313/1355/1358/1429/1432`，全为数字字面量/时间戳/`contextWindow`，非锚）⇒ **零新增锚承载面**；新增文本（`0 === 0`、`[harness]`、`capturedTimers`、`nonClearedMs`）**不命中**任何 9h stale needle 或 `ANCHOR_CASES` 的 fresh 串 ⇒ `9h R-1` / `9h-4` / `9h-4b` / `9h-4c` / `9h-5` / `9h-5b` / `9h-5c` **均不受影响** ✓
- **无跨文件计数耦合**：`run-all.mjs:74-112` 的 runner pre-flight 只核验「模块存在 / 无 `process.exit` / 有 `runX` 导出 / smoke 已 import 且调用」（`:78-102`），**不含任何断言总数耦合** ⇒ +1 断言不触发门控隐式约束 ✓
- **改动面纯粹性**：+20 −5 中，−5 = 原 F16b 断言标签/条件/详情三处重写（`:2422-2424` 对应旧 `:2408-2409`）+ 旧 `statsTimer.fn()` 三处调用改 `tickStatsTimer`（`:2407/2411/2414` 对应旧 `:2398/2402/2405`）⇒ **无夹带**（实读全文：R0 的 F-10/F-11/F-12/N-2 断言与夹具文本一字未改）✓
- **判定：无新引入问题**。

### ④ `lib/client.js` 未改 ⇒ 镜像与 9h 族结论是否仍成立（**结构性核验，未复现哈希**）
- **结构性证据（本人实读）**：`lib/client.js` 仍 **5881 行**；R0 实读的四处本批改动面**逐字未变**——`:2207-2245`（stats effect：`:2212` 状态声明、`:2216-2218` 成功复位、`:2230-2237` 边沿触发 + 机录）、`:2299-2304`（`setHostHealth(null)` 位于 `:2288` 的 `!alive` 守卫后）、`:2313-2318`（N-6 中性化文案）、`:3898-3903`（F-11 `&& !failure`）、`:3930-3951`（N-2 summary 单点合成）；`tests/rpc-shadow-guard.mjs` 仍 **203 行**、`:141-165` 方法轴段逐字未变。
- **镜像侧**：`tests/served-client.js` 仍 **5881 行**，与 `lib/client.js` 的锚扫描命中集**同集**（26/26，逐行号相同）⇒ 无单侧漂移面。**哈希未复算**（U-3），采信 Coordinator。
- **9h 族**：本批唯一改动文件 `tests/client-render.mjs` **已在 `ANCHOR_CASES` 在册**（`host-abi-health.mjs:743` 条目）且零新增锚 ⇒ `9h-5 uncoveredFiles` 不受影响；`host-abi-health.mjs` 本身未改 ⇒ 9h-4/4b/4c/5b/5c 的登记面与常量面不变（U-1 采信其 190 绿）。
- **判定：R0 的镜像与 9h 结论在结构层面仍成立**（唯一未复现项 = 字节级哈希）。

### ⑤ 越界观察 `pollTick.fn()` 是否确为同族缺口
- **是，确为同族（已实读确认，非作者臆测）**：`tests/client-render.mjs:2209` `const pollTick = pollTimers[0]`（`pollTimers` = `:2206` 过滤结果，可为空数组）→ `:2213/:2220` `pollTick.fn()` **无 null 守卫**。`fakeWindow.setInterval/clearInterval`（`:184-185`）为**全局**行为 ⇒ 若该 2s timer 未被捕获/被清除，`:2207` 的 `pollTimers.length === 1` 会**先判红**（设定 `failures++` 但**不中断执行**——`tests/smoke.mjs:39` 的 `check` 只分支打印）⇒ `pollTick` 为 `undefined` ⇒ `:2213` 立即 `TypeError` ⇒ **runner 崩溃、失败退化为裸崩栈**（正是 R0 P3-2 描述的次生伤害形态，只是发生在更早的 B5 块）。这与作者「m2 必须前缀限定隔离」的自陈**完全吻合**（全局移除 2s timer 会先在此处崩）。
- **判定**：观察**成立**；但**非本批引入**（`pollTick` 写法早于 FIX-047，R0 实读亦然）⇒ **不构成 FIX-047 的 finding**，按「禁止顺手改」纪律保留**正确**。是否另立任务属**范围决策**（Coordinator 权限），本报告只给事实与成本：同族共 2 处已知实例（`:2209` B5、`:2396` FIX-047 已修）+ 可能的同类「断言后无守卫即解引用」模式，建议按「测试基建健壮性」单独立项评估，而非并入本批。

### ⑥（附）作者两条自我限定的独立评估
- **限定①（m2 首次尝试只得到「陈旧 timer」形态 ⇒ 未采作证据）**：**评估为正确处置**。依据：`:2396` 的 `.pop()` 取**最后一个**未清除 2s timer，若旧 timer 仍存活（harness 不跑 cleanup，`:106-131`），则取到的是**陈旧** timer ⇒ 其闭包 `alive` 可能已为 false（`lib/client.js:2209/2253`）⇒ `poll()` 早退、零记录 ⇒ F16b 判红但 harness 守卫**不触发**。该形态确实**不能**作为 P3-2 的判别证据 ⇒ 作者弃用是诚实且技术正确的 ✓（该「陈旧 timer」形态同时暴露一条**测试基建脆性**：F-16/F16b 的正确性依赖 `.pop()` 取到最新 timer 这一隐含前提；本批未加固，登记为 N-2。）
- **限定②（pre 副本探针 `PROBE-F16b-guard PASS(green)` 属口径假象）**：**评估为正确处置**。依据：pre 副本 = `HEAD:tests/client-render.mjs`（无该断言）⇒ 探针报告「该断言位通过」只能是 probe 口径把「缺失的断言」计为绿，属**探针自身形态假象**，不得作为任何证据 ✓ 作者主动声明并排除，符合「采集证据不得用假绿」纪律。

---

## 3. 5 维度逐项结论（R1）

### 维度 1：正确性 ✓ 通过
- 两处修复的逻辑与 R0 要求逐条一致（§1）；判据非恒真/非过度约束（§2③）；`N+1` 与 `N` 的数值链在正常路径自洽（§2①）。
- 残余 1 条 P3（N-1，见 §2①形态 4），非错误、非阻塞。
- 无并发/资源面变化（仅测试文件；无新增 async/定时器/句柄）。

### 维度 2：安全性 ✓ 通过（零发现）
- 新增内容为断言文本与诊断对象（`capturedTimers` 计数 + timer 毫秒值列表）——**无凭据/无 URL/无用户数据**；不外发、不落盘、无注入面 ✓
- 无硬编码密钥；无新输入面。

### 维度 3：可维护性 ✓ 通过（含 1 条 P3）
- 命名与语义诚实：`[harness]` 标签明确该断言守护的是**测试基建**而非产品（`:2402`）；`:2397-2401`、`:2417-2421` 两段注释完整登记动机、原形态与后果 ✓
- 详情对象直读可定位（§2②）✓
- 新增 20 行含 9 行注释 + 1 条结构化断言（约 3 行）+ 3 行守卫/兜底 + 断言改造 —— 比例合理、无冗余分支 ✓
- **P3-N2**（见 §4）：`.pop()` 取最新 timer 的隐含前提未显式断言，存在「取到陈旧 timer」的脆性（作者限定①已实证该形态可达）。
- 无 TODO/FIXME（grep 面内零命中）✓

### 维度 4：性能 ✓ 通过（零发现）
- `:2404` 的详情对象在**每次运行**都被求值（`captured.timers.filter(...).map(...)`），但仅在本次调用发生一次、`captured.timers` 全量为数十级 ⇒ 可忽略（**登记 P3-N3 为可读性项，非性能项**）。
- 无新增常驻 timer / 无新增 RPC；断言数 +1 对总耗时无影响（Coordinator 复跑 25.3s，与 R0 的 29.7s 同量级，**未复现**）。

### 维度 5：测试覆盖 ✓ 通过（覆盖净增）
- 本批**净增 1 条断言**（F16b harness 守卫）+ 强化 1 条（F16b 基线前提 + 结构化详情）⇒ 门控面只增不减（零回退）✓
- 新守卫**自身有反向实证面**：m2 变异下它产出一条可读 FAIL 且 runner 存活（作者自陈，未复现）✓
- **附带覆盖收益**：原「harness 面漂移 ⇒ 崩 runner ⇒ 后续约 478 条断言全丢」的失败湮灭形态被消除（作者实测 pre `ok=706` 无汇总行 vs post `ok=1183` + 汇总行）⇒ 从「失败不可诊断」提升为「失败可定位」✓
- 残余 P3（N-1/N-2）见 §4。

---

## 4. R1 发现清单（P0/P1/P2 = 0；P3 = 3）

| # | 级别 | 位置 | 事实依据 | 影响 | 修复建议 |
|---|---|---|---|---|---|
| **N-1** | **P3**（建议） | `tests/client-render.mjs:2422-2424` | 残余空窗形态：`withinEpisode === baseline` 与 `final === baseline+1` 在「3 拍 tick 被调用但未驱动任何 poll」时同时成立（基线此时必 >0，已由第一项强制） | 比 R0 原形态**窄得多**（不再是最低成本的空洞绿，且产品侧语义由「+3 ≠ +1」看护）；仅在 harness 面「timer 存在但 `fn` 空转」时静默 | 可选（成本一行）：记录 `pollRpc.stats` 前后值并断言本窗口增量 ≥ 3（`pollRpc` 为既有计数器 `:178`/`:344`）。**不阻塞** |
| **N-2** | **P3**（建议） | `tests/client-render.mjs:2396` | `.pop()` 取「最后一个未清除 2s timer」为**隐含前提**（harness 不跑 effect cleanup，`:106-131`）⇒ 若最新实例的 timer 未入活性集、而更早实例的 timer 仍在，取到**陈旧** timer（其闭包 `alive=false` ⇒ 零记录）⇒ 表现为「F16b 判红但 harness 守卫不触发、runner 不崩」（= 作者限定①实测形态） | 失败指向会误导到产品行为而非 harness 前提；**不影响通过性**（正常路径 timer 顺序确定） | 可选：把 `.pop()` 改为「按实例/按前缀限定」或断言取到的 timer 属于本次渲染（如记录 `timerMark` 切片后 pop，同 `:2189/2205` 既有先例）。**不阻塞** |
| **N-3** | **P3**（讨论） | `tests/client-render.mjs:2404` | 详情 `nonClearedMs` 为**全量**未清除 timer 的 ms 列表（本次实读 R0 语境下即含历史用例的 timer）；作者实测样例 `{"capturedTimers":30,"nonClearedMs":[30000]}` 已含 30 项历史 timer 面 | 失败行诊断噪声略高，定位需人工筛 `2000` | 可选：改为 `filter((t) => t.ms === 2000).length` 或 `nonCleared2s: <n>`。**纯讨论，不要求修改** |

**越界观察（不计入本批 finding，供 Coordinator 决定是否另立任务）**：`tests/client-render.mjs:2209/2213/2220` 的 `pollTick.fn()` 为**同族未守卫实例**（`lib/client.js` 无涉，纯测试基建）；若全局移除 2s timer，该处会先崩（§2⑤）。属**先于本批存在**的形态，按纪律保留正确。

**R0 遗留维持（未修但已登记，非本批义务）**：P3-3（`code` 口径）、P3-4（N-1 两侧同改）、P3-5（无自打印计数）、P3-6（证据无仓内留档）、P3-7（夹具 `consumer` 面）。

---

## 5. 未验证项（MUST 显式标注；本轮**零命令执行**）

| 编号 | 未验证内容 | 来源 | 处理 |
|---|---|---|---|
| U-1 | 门控复跑：`run-all` 20 SUITES + 4 RUNNER MODULES PASSED (25.3s) / #SKIP 2 / exit 0；`host-abi-health` 190 / exit 0；`rpc-shadow-guard` 31 / exit 0 | Coordinator 复跑 | **本人未复现**（禁 Bash）。静态自洽核验：`host-abi-health` 未改（不在改动面）⇒ 190 不变 ✓；`rpc-shadow-guard` 未改（`:141-165` 逐字同 R0）⇒ 31 = 19+1+3+8 静态可复原 ✓ |
| U-2 | 返工 commit `06b4c85` 本体（`--stat` 仅 1 文件 / +20 −5）与前轮 `d1c9d95` 对照 | Coordinator | **未复核**（无 git 面）。以工作树实读 + 与 R0 实读逐处对照替代（§4 结论一致：`lib/client.js`/`served-client.js`/`rpc-shadow-guard.mjs` 相关文本逐字未变） |
| U-3 | 镜像哈希 `411090 == 411090 / SequenceEqual=True / SHA256 A20CE93C…` | Coordinator 复跑 | **未复算**。结构性核验通过（§2④：双侧同 5881 行、锚扫描同集、R0 实读区逐字未变） |
| U-4 | 静态 `check(` 计数 **255 → 256**；`node tests/smoke.mjs` ok 行 **1184 → 1185**、FAIL=0 | 作者自陈 | **旧态未复现**；**当前态已独立复核**：`^\s+check\(` 命中 **256**（grep 返回 250 行内联 + 5 行存盘，另 1 行为独立命中；逐行实读确认新增项为 `:2402` 一条）⇒ 与作者 +1 声明一致 ✓；`hostFaceMode/statsFailMode` 均无「遇错提前退出」形态 ⇒ 静态数 256 **全部执行**，与 probe `passed=256` 的交叉一致成立（作者侧数字采信） |
| U-5 | 变异实证：m1（`statsFailureRecorded = true`）PRE 空洞绿 PASS → POST FAIL `{baseline:0,withinEpisode:0,final:1}`；m2 PRE 崩 `TypeError …('fn')`/exit 3 → POST FAIL + `2 FAILURES (1 skipped)`/exit 1；恢复 exit 0 | 作者自陈（`git`/probe 环境） | **未复现**（不执行命令、不复制文件）。本报告对两处修复的通过依据 = **静态推演**（§2①②③ 给出完整推演链：判据结构、短路语义、harness 复用实例语义、`check` 不中断语义）⇒ 与作者实测**方向一致**，但**推演 ≠ 实证** |
| U-6 | `lib/client.js` 字节级未改（哈希层面） | Coordinator | **未复算**；结构性核验 §2④ |
| U-7 | 宿主 `$mount` 注册/codec 消费面 | R0 U-6 延续 | 本批未触及，结论沿用 R0 限定 |
| U-8 | probe 工具（`passed=256 failed=0 crashed=no`、`exit 3` 崩码、`ok=706/1183`）本身的实现与口径正确性 | 作者自陈 | **仓内不可核验**（未发现该 probe 脚本的仓内持久化面）。作者已主动弃用其中一条假象输出（§2⑥），可信度不因此受损，但仍属未复现 |

---

## 6. 静态可复原证据（R1 实读，供第三方复算）

| 核验项 | 结果 | 依据 |
|---|---|---|
| F16b 断言含基线非空前提 | 成立 | `client-render.mjs:2423` 首项 `statsDiagAfter.length > 0` |
| F16b 详情含三值结构化 | 成立 | `:2424` `{ baseline, withinEpisode, final }` |
| harness 守卫含三类形态防护 | 成立 | `:2403` `Boolean(statsTimer) && typeof statsTimer.fn === 'function'` |
| 空驱动兜底，`statsTimer.fn()` 直调已消除 | 成立 | `:2405` 三元兜底；`:2407/2411/2414` 用 `tickStatsTimer()`；grep `statsTimer` 仅 `:2396/:2402-2405` |
| 守卫断言自身有效（非恒真装饰） | 成立（静态） | 正常路径由 `:2383` 渲染创建 2s timer（`fakeWindow.setInterval` `:184`）⇒ 条件为真；异常路径作者 m2 实测红 |
| 失败后 runner 不中断（故 `2 FAILURES` 而非崩） | 成立 | `tests/smoke.mjs:39` `if (condition) console.log(...) else console.error(...)`；`:3094-3096` `failures===0 ? exit 0 : exit 1` |
| 新文本零新增锚承载面 | 成立 | 9h 三形态正则扫描命中恰 12 条且行号与 R0 同集（全为非锚数字字面量） |
| `tests/client-render.mjs` 已在 `ANCHOR_CASES` 在册 | 成立 | `tests/host-abi-health.mjs:743` |
| runner pre-flight 无断言总数耦合 | 成立 | `tests/run-all.mjs:78-102`（仅核验存在性/`process.exit`/`runX` 导出/smoke 接线） |
| 静态 `check(` 计数 = 256 | 成立 | `^\s+check\(` 命中 256（含 `:2402` 新增 1 条） |
| `lib/client.js` 关键改动面逐字未变 | 成立 | `:2212/2216-2218/2230-2237/2299-2304/2313-2318/3898-3903/3930-3951` 与 R0 实读一致；文件仍 5881 行 |
| `tests/rpc-shadow-guard.mjs` 未改 | 成立 | 仍 203 行、`:141-165` 逐字同 R0、锚扫描 0 命中 |
| 越界观察成立 | 成立 | `:2209` `pollTick = pollTimers[0]` + `:2213/2220` `pollTick.fn()` 无守卫；`:2206` 过滤可为空；`:184-185` 为全局 timer 面 |

---

## 7. 硬门槛裁决（R1）

| 门槛项 | 阈值 | 判定 | 依据 |
|---|---|---|---|
| P0 阻塞问题数 | = 0 | **通过（0）** | §4 无 P0/P1/P2；3 条全为 P3 |
| 5 维度全覆盖 | = 100% | **通过** | §3 五维度逐一有 R1 结论与可复查依据 |
| 每条发现标注级别 | = 100% | **通过** | §4 三条全含 P3 + 位置 + 事实依据 + 影响 + 建议；§1 前轮 7 条全含级别与状态 |
| 设计一致性检查 | 已完成 | **完成** | ①改动面严格限定于 R0 点名的两条 P3，**未扩面**（唯一文件 = `tests/client-render.mjs`；`lib/client.js`/镜像/`rpc-shadow-guard.mjs`/`host-abi-health.mjs` 文本逐字未变）②修复方式与 R0 建议一一对应（基线前提 + null 守卫）③不新增第二观测通道/第二判据源：harness 守卫与 F16b 共享同一 `statsTimer`/`diagOf` 面（P5 单点）④P4 纯粹性：+20 −5 中 −5 全为改造处重写，无夹带 ✓ |
| AI 代码专项 5 项 | 全部完成 | **完成** | ①mock 残留：新增内容为断言/诊断，**零 mock 引入**；`[harness]` 标签如实标注其为测试基建断言 ②硬编码：新增字面量仅 `'FIX-047-F16b[harness]'` 标签与 `2000`/`30000` 量级 ms 常量（既有语义），无产品魔数；诊断对象为运行时求值非硬编码 ③幻觉 API：`Boolean`/`typeof`/`Array.prototype.filter/map/pop`、`captured.timers`（`:174` 定义）、`statsDiagOf`（`:2379`）、`pollRpc`（`:178`）**全部实存**；无幻觉符号 ④未实现 TODO：grep 零命中；无死变量（`tickStatsTimer` 有 3 个调用点）⑤过度实现：+20 −5 全部服务于两条 P3，**无顺手重构**（`pollTick` 同族缺口**未动**——纪律正确）✓ |

---

## 8. 交付与后续

- 本报告路径：`.governance/review-FIX-047-R1-input.md`（**唯一允许写入**；未修改任何产品/测试/治理文件，未执行任何命令，未创建子 agent）。
- **CONCLUSION = APPROVED_WITH_NOTES，unresolved_blockers=0** ⇒ 可作 **pass 终态**消费（round 1 < 3，未触 fuse；不存在未解决 BLOCKING finding）。
- **修复判定汇总**：R0 点名的两条 P3 **均已修复**（P3-1 核心闭合、P3-2 完全闭合，且 P3-2 的处置优于原建议——同时消除了「崩 runner 致失败不可诊断」的次生形态）；R0 另 5 条**未修但已登记**（作者未扩面，符合本轮授权）。
- **可选加固（均非阻塞，供 Coordinator 决定是否再收一轮或登记遗留）**：N-1（F16b 窗口内 RPC 增量断言，一行）、N-2（`.pop()` 陈旧 timer 脆性，可借 `timerMark` 切片）、N-3（`nonClearedMs` 收窄为 2s 面）。
- **范围决策提示（不代做决定）**：`tests/client-render.mjs:2209` 的 `pollTick` 同族未守卫形态**先于本批存在**，建议按「测试基建健壮性」单独立项评估，不宜并入 FIX-047。
- **未复现项再次强调**：所有门控数字、镜像哈希、两处变异实证（m1/m2）、probe 输出与 commit 元信息**均非本人复现**（§5 U-1~U-8）；本报告的通过依据只建立在 §6 的静态可复查事实上，变异结论为**静态推演**（推演链见 §2①②③）。
