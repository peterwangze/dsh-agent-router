# FIX-047 R0 审查报告（Reviewer 输入件）

| 字段 | 值 |
|---|---|
| task_id | FIX-047 |
| **round** | **0**（首轮独立审查） |
| 前轮引用 | 无（任务新开 R0）；条目定义来自 `.governance/review-FIX-046-R0-input.md` / `.governance/review-FIX-046-R1-input.md` 的遗留台账 N-1/N-2/N-4/N-5/N-6/F-10/F-11/F-12/F-16 |
| reviewer_role | Code Reviewer（**只读**——未修改任何产品/测试文件、未执行任何命令、未创建子 agent） |
| 审查对象 | commit `d1c9d95`（4 文件）——**未复核 commit 本体**（无法 `git show`）；本报告基于**当前工作树实读**，凡涉及「本批改动面」的判定均以「实读现状 + 台账条目要求」对照给出，不声称与 `d1c9d95` 逐字节对应（见 U-2） |
| 审查方式 | 当前工作树逐行实读（Read/Grep/Glob）+ 静态推演链 + 对照 `tests/host-abi-health.mjs` 9h 族判据面 |
| **结论** | **APPROVED_WITH_NOTES** |
| **unresolved_blockers** | **0**（P0 = 0；P1 = 0；P2 = 0；P3 = 7 条新发现，均非阻塞） |

**一句话依据**：本批 9 项台账条目（N-1/N-2/N-4/N-5/N-6/F-10/F-11/F-12/F-16）逐项在**实读代码中有可复查落点**，且每条落点与条目要求语义一致（§3）；新引入发现全部为 P3（§4），无 P0/P1/P2，硬门槛五项全通过（§5）；未验证项（所有门控/变异数字、commit 本体、镜像哈希）已在 §1 显式登记，不作为通过依据（§6 只列静态可复原证据）。

---

## 1. 未验证项（MUST 显式标注；本轮**零命令执行**）

| 编号 | 未验证内容 | 来源 | 处理 |
|---|---|---|---|
| U-1 | 门控数字：`rpc-shadow-guard` **31** assertions / exit 0；`host-abi-health` **190** / exit 0；`run-all` **20 SUITES + 4 RUNNER MODULES PASSED (29.7s) / #SKIP 2** / exit 0 | Coordinator 复跑（任务上下文） | **本人未复现**（工具边界禁止 Bash）。仅做**静态自洽核验**：`31` = §1 循环 19 + §2 1 + §3 3 + §4 8（可由当前 `tests/rpc-shadow-guard.mjs` 完全静态复原 ✓）；`client-render` 静态 `^\s+check\(` 计数 = **255**（见 U-4）；`host-abi-health` 本批零改动 ⇒ 190 不变（该文件不在 4 文件清单） |
| U-2 | commit `d1c9d95` 本体：4 文件 / +295 −25 / 审查对象一致 | Coordinator（任务上下文） | **未复核**（无 `git show`/`git rev-parse`）。**附一条实读偏差**：任务上下文给出的行号与当前工作树**逐条错位 1~27 行**（例：N-1 报 `rpc-shadow-guard.mjs:141-170`，实读为 `:141-165`；F-16 报 `client.js:2207-2238`，实读为 `:2207-2245`；F-16 断言报 `client-render.mjs:2389-2417`，实读为 `:2389-2409`；N-4 报 `client-render.mjs:274-282`，实读为 `:280-281` 附近）。⇒ 上下文行号**不可直接采信**，本报告一律给出**实读行号** |
| U-3 | 镜像 `tests/served-client.js` 逐字节相等：411090 == 411090 bytes / SequenceEqual=True / SHA256 `A20CE93C…` | Coordinator 复跑 | **本人未哈希复算**。结构性核验通过：两侧同 **5881 行**；关键改动点行号**逐一相同**（`tests/served-client.js:2235` ↔ `lib/client.js:2235`；`:2304` ↔ `:2304`；`:3950-3951` 逐字同）；裸行号锚扫描结果两侧**完全同集**（26 命中，全为 CSS/URL/数字字面量，非锚）⇒ 无镜像侧独立漂移面 |
| U-4 | 作者自陈③：`client-render.mjs` 静态 `check(` 计数 **248 → 255**、smoke `ok` 行 **1177 → 1184** | 作者自陈 | **旧态（248/1177）未复现**（无法取旧树）。**当前态已独立复核**：`^\s+check\(` = **255**（grep 计数与逐行实读一致）；各套件自打印计数面按 R1 N-3 建议**不作跨轮加法推导** |
| U-5 | 单变量判红实证（N-1 / F-16 / F-16b / F-10 / F-12 / F-11 / N-2 各 `exit 1`；N-1 为 `FAIL … 1 FAILURE(S) (30 passed)`） | 作者自陈 | **未复现**（不执行命令、且旧树不可得）。仅做**判据面静态推演**：每条断言的判别依据 = 旧实现下该断言面不存在（逐条见 §3/N-* 与 §6）⇒ 可推出必红，但**推演 ≠ 实证** |
| U-6 | 宿主 `$mount` 的 descriptor 注册语义与 codec 消费面（`remote.router.<method>` 是否按 `method` 字段注册） | R1 U-6 延续 | **仓内不可核验**（宿主包不在本仓索引面）。N-1 的「异名即不可达」前提（见 §3①）**部分依赖宿主语义**，本报告已限定为「同一 `method` 名在两份声明间自洽」这一仓内可判事实 |
| U-7 | 上游任务真机读数（V-9 4/4、EV-216/EV-217、面板短码 `host-face-shape: hostFaceDiagnostics`） | Coordinator/EV 记录 | 采信，未自行取证；本批**不新增真机面**（`touches_real_env=false`，无需真机证据） |

---

## 2. 5 维度逐项结论

### 维度 1：正确性 ✓ 通过（含 2 条 P3）
- **N-1 方法轴比较**：`tests/rpc-shadow-guard.mjs:146-149` 四轴拼串（`service | namespace | method | invocation.kind`）、`:151-155` 按位成对比较、`:156-158` 断言（含**双侧条数相等 + 客户端非空**前置）、`:159-165` 双侧值诊断。逐条实读：`lib/client.js:398-424` 20 条 descriptor 与 `lib/rpc.js:43-91…`（实读 19 条 + `implementation` 仅在 stats）逐条 `service='router' / namespace='router' / method=id.split('/')[1] / invocation.kind='direct'` ⇒ 四轴在**当前树全等**，断言为真（且是**有判别力**的真：任一侧单变量漂移即假）✓
- **F-16 边沿触发**：`client.js:2212` 状态声明 → `:2216-2218` 成功 handler 首行**无条件复位**（`statsFailureRecorded = false`，位于 `if (alive && response.ok)` 之外 ⇒ 不可达分支复位，语义正确）→ `:2230-2231` 失败侧 `if (!alive || statsFailureRecorded) return` + 置位 → `:2232-2237` 机录。**边沿语义 = 每失败周期恰一条** ✓；异常安全：`noteHostFaceDiag` 自身 `try/catch`（`:5237-5248`）且 `:5236` 白名单/截断与既有环同构 ⇒ 无吞错反噬 ✓
- **F-12 状态清理**：`client.js:2304` `setHostHealth(null)` 位于 `reportFailure` 内、`:2288` 的 `if (!alive) return` **之后** ⇒ 陈旧 effect 的晚到 rejection **不会**清掉新状态（乱序防护成立）✓
- **F-11 早退条件**：`client.js:3902-3903`：`failure` 判定前移 + 早退追加 `&& !failure`。`!hostHealth && !faceHealth && !failure` 三缺才 return ⇒ 「双源皆缺 + 有失败」时卡片渲染 ✓；`HostHealthCard` 为函数组件，`return null` = 卡片整体不上屏 ⇒ 旧早退确实吞掉唯一必须上屏的信息（F-11 的真实性由 `:3903` 反证）✓
- **N-2 单点合成**：`client.js:3948-3951` summary 文案三支：`failure ? (失败码 + (degraded>0 ? ' · ' + 降级计数 : '')) : (degraded>0 ? 降级计数 : 正常)` ⇒ 失败 ∧ 降级**同时可见**，且 `degraded` 口径未改（`:3934` 仍只由 `faces` 派生，失败不计入面数）✓
- **F-10 夹具**：`client-render.mjs:372-390` 新增 `'withEntries'` 分支（faces 2 条 + diag 1 条 + hostVersions 三键），默认 `'ok'` 未改（`:286`、`:393-397`）✓
- P3-1（见 §4）：F-16 的 `code` 恒定为 `host-face-stats-rejected`，不携带宿主错误码（与既有 `host-face-*` 固定码口径一致，但 detail 承载原文）。
- P3-2（见 §4）：F-16b 判据强度依赖**前置** F-16 的非空 guard 才非空洞（静态推演，未实证）。

### 维度 2：安全性 ✓ 通过（零发现）
- 本批新增**无外部输入面、无权限面、无注入面**：`noteHostFaceDiag` 入参来自本仓 RPC 错误对象，经 `:5240-5244` 逐字段 `slice` 截断后才入环；`String(error?.message ?? error).slice(0, 160)`（`:2236`）与既有失败路径同构。
- **新增诊断打印不泄露敏感信息**：`rpc-shadow-guard.mjs:154` 打印的是本仓自身 RPC 契约字段（service/namespace/method/invocation.kind）——非凭据、非 URL、非用户数据 ✓；`:161-163` 同理。
- 无硬编码密钥/token（grep 面内新增行无凭据字面量；夹具错误消息为字面构造）✓
- 无 `eval`/`new Function` 新增（`client-render.mjs:211` 的 `new Function('window', source)` 为既有测试 harness，非本批）。

### 维度 3：可维护性 ✓ 通过（含 4 条 P3）
- 每个改动点均带**条目编号 + 事实依据 + 限定语**注释（`client.js:2210-2229`、`:2299-2303`、`:2313-2317`、`:3898-3901`、`:3930-3933`；`rpc-shadow-guard.mjs:141-145`、`:173-178`；`client-render.mjs:270-285`、`:287-289`、`:2249-2254`、`:2370-2374`、`:2411-2415`、`:2426-2429`、`:2443-2446`、`:2458-2462`）✓
- **单一实现路径（P5/编程要求 4）**：`stats` 失败**没有**另起观测通道，直接复用 `noteHostFaceDiag` 镜像环（`client.js:2222-2224` 明示），失败上屏仍走既有 `hostFaceNotice` → `HostHealthCard` 单点 ⇒ 无并存旧路径 ✓
- 无 TODO/FIXME/未实现占位（grep 三文件零命中）✓
- 函数长度：`client.js` 的 host-face effect 体 `:2270-2342` ≈ 73 行（含新增 F-12 注释 6 行）——**已是 R0 F-15 登记遗留、本批按任务排除未动**，故不重复判红，仅重申遗留 ✓（遗留项，非本轮发现）
- P3-3/4/5/7（见 §4）：注释与判据的精度项。

### 维度 4：性能 ✓ 通过（零发现）
- N-1 四轴比较为 `O(n)`（n=19，`:151` 单层循环，无嵌套）；`methodAxisOf` 每轮 1 次数组拼接 = 38 次小数组构造 ⇒ 可忽略。
- F-16 边沿触发**降低**写入量（一失败周期 1 条 vs 逐拍 N 条）：2s 轮询 × 64 条环上限下，逐拍追加将在 128s 内淘汰全部既有诊断事件 ⇒ 边沿触发是**防观测面自伤**的必要选择（与 `:2225-2229` 注释一致）✓
- 无新增常驻 timer / 无新增 RPC 面（`host-abi-health.mjs` 的 §3「render 期零 probe」与 D1-10「≤1 RPC/s」判据面未被本批改动触碰；`:2207-2216` 的 B5 断言仍在位）✓
- 无 N+1 / O(n²) 引入。

### 维度 5：测试覆盖 ✓ 通过（含 1 条 P3）
- **N-1 有机器判据**：`:156` 断言 + 双侧值诊断；31 = 静态可复原 ✓
- **F-10/F-11/F-12/N-2/F-16 各有专属断言且顺序正确**（`:2389` F-16 → `:2408` F-16b → `:2420`/`:2422` F-10 → `:2440` F-12 → `:2454` F-11 → `:2471` N-2）✓
- **判别性（静态推演）**：F-16 断言 `:2389-2390` = `statsDiagBefore === 0 && 之后 ≥1 且每条 kind/face/detail 正确` ⇒ 旧 `() => undefined` 实现下环内零条目 ⇒ **必红** ✓（旧实现无第二条路径写入 `code === 'host-face-stats-rejected'`，由全仓 grep 证：该串仅在 `client.js:2235` 一处产生）
- **F-16b 非空洞**：`:2408-2409` 断言 `同周期不追加 && 新周期恰 +1`，其中 `+1` 支依赖 F-16 已产生基线（顺序保证）⇒ 不构成「0 === 0」空过 ✓（但见 P3-2 的脆弱性说明）
- **F-12 两阶段可区分旧实现**：`:2431-2438` 同前缀复用同一组件实例（harness `:106-111` 按 `pathKey` 取实例 ⇒ 状态跨渲染保留），第二阶段 reject ⇒ 断言 `:2441` 要求旧 `host-probe-alpha` 与新版本值**都消失** ∨ 旧实现（不清 `hostHealth`）两者都还在 ⇒ **必红** ✓
- **F-11 可区分旧实现**：`:2447-2452` 以 `health: () => undefined` + `throw` 形态使双源皆缺 ⇒ 旧早退 ⇒ 卡片 null ⇒ 断言 `:2454-2456` 的失败短码/版本行不可读**零出现** ⇒ **必红** ✓
- **N-2 可区分旧实现**：`:2464-2472` 唯一变量 = 本地面含 1 个 degraded 面 ⇒ 旧 summary 无降级计数 ⇒ **必红** ✓
- P3-6（见 §4）：`statsTimer` 取法 `.pop()` + 无 null 检查，harness 面变化时会以 TypeError 崩溃而非断言失败。

---

## 3. 五个重点核验项逐项裁决（Coordinator 指定 1-6；第 7 项 AI 专项见 §5）

### ① N-1 判据强度（`rpc-shadow-guard.mjs:141-165`）
- **四轴覆盖：成立**。`:146-149` 逐字 = `descriptor.service, descriptor.namespace, descriptor.method, descriptor.invocation && descriptor.invocation.kind` ⇒ 恰为要求的 `service|namespace|method|invocation.kind` 四轴；以 ` | ` 拼接后整串比较 ⇒ 任一轴单侧漂移即不等 ✓。当前树双侧四轴全等（实读 19↔19，`lib/client.js:398-424` ↔ `lib/rpc.js:43-91…`，全部 `router/router/<id 后缀>/direct`）✓
- **「两侧同时改」是否可绕过：可绕过，但判定为可接受**。理由（可复查）：判据**故意按位成对**（`:151-153` 用 index 对齐，注释 `:144-145` 明示）⇒ 两侧同值改动（含两侧同时更名）⇒ 逐位仍相等 ⇒ 绿。该形态属**同一次变更的两侧同步编辑**（P5 语义下即「同一动作汇入同一实现路径」——本任务的整个目标是消除「两份事实源」，而两侧同步变更**不产生**事实源分叉）；且此时 `id` 与 `method` 的一致性由 `client-render.mjs:663-670` 的挂载面断言（对新增两条 + cli/image/uploadFile 面）继续看护。⇒ **不判为缺口**；建议（非阻塞）如需进一步收紧，可加一条「`descriptor.method === descriptor.id.split('/').pop()`」的**同侧自洽**判据（一行，覆盖「两侧同为错名」的退化形态）。
- **与既有判据的冗余与缺口**：冗余 = `:128-130` id 集合 + `:131-132` 顺序 + `:133-134` 唯一 + `:138-139` 非空 + `:193-194` 两条 codec 深等 + `:195-199` 在场判据；**真实缺口 = 本项补的正是「id 不变而 method 异名」**（其余判据对该形态全绿，`:114-139` 与 `:183-199` 均不读 `method`）⇒ **无冗余，恰为缺口** ✓
- **诊断打印敏感性：无泄露**（§2 维度 2）。
- **结论：达标**。剩余 P3 = 「两侧同步更名」不判红（可接受，已给判定与可选收紧建议）。

### ② F-16 边沿触发的取舍
- **可观测性缺口：确认存在，但已如实登记且属合理取舍**。事实依据：`:2230` 一旦置位，同一失败周期内即使 `error.message` 变化也不追加（`:2232-2237` 不可能二次进入）⇒ 「同周期内失败原因变化」不可见。取舍依据：`:2225-2229` 明确登记；24h 周期 × 2s 拍 = 43200 条 / 周期，64 条环上限下逐拍追加必淘汰既有 `inject-face-missing`/`face-degraded`（`:5654`、`:5426`）⇒ 观测面自伤，**边沿触发是正确取舍**。缓解：任一成功拍即复位 ⇒「失败→恢复→再失败」各留一条；且 detail 用 160 字符原文（`:2236`）⇒ 首个失败原因完整可读。**判定：不接受为缺陷**（P3，建议下轮如需补强可加「detail 变化即追加」二级条件，代价是环挤占回归）。
- **成功复位语义：正确**。`:2216-2218` 复位在 `alive` 守卫之外（无条件执行），且只依赖响应到达——宿主把错误当 `ok:false` 信封返回时同样复位（`:2218` 仅 `response.ok` 决定是否 `setStats`，复位与之解耦）⇒ 无「假持续失败」锁死 ✓
- **环上限挤占关系：如作者所述**。`noteHostFaceDiag` 白名单/截断/上限（`:5234-5249`）为单点共享环；写入者实测 7 处（`:2232` stats、`:2305` host-face 失败、`:5303/5308/5334/5349` events 三态、`:5426` face-degraded、`:5654` inject-face-missing）⇒ 本批新增**恰 1 类** `kind='host-face-rpc'`（与现有 `:2305` 同 kind）且**每失败周期 ≤1 条** ⇒ 挤占量级 = 1/周期，与作者的「不挤满」声称一致 ✓

### ③ N-2 与 F-11 的叠加（三种组合的 summary / 展开体可见性）
组合逐项静态推演（`client.js:3902-3966`）：
1. **失败 ∧ 降级**（`hostHealth` 曾成功后被清/仍持有 faces + 本地面含非 ok）：`failure` = 对象 ⇒ summary = `⚠ 宿主面取数失败：<code> · ⚠ n 个宿主面降级/缺失`（`:3949-3950`）；版本位 = 「宿主版本不可读」（`:3953`）；展开体 = `failure.detail`（`:3955`）+ faces 行（`:3956-3960`）+ diag 行（含失败行置顶 `:3943-3945`）⇒ **两条信息均可见、互不遮蔽** ✓
2. **失败 ∧ 双源皆缺**（F-11）：`faces.length === 0` ⇒ 展开体 faces 位 = 「尚无已注册面探针」（`:3957`，诚实降级）；`degraded = 0` ⇒ summary 仅有失败短码（`:3950` 的条件支不触发）⇒ 无「0 个降级」噪声 ✓
3. **双源皆缺 ∧ 无失败**：三缺 ⇒ `return null`（`:3903` 保持原语义）⇒ 不渲染空卡片 ✓
- **无互相遮蔽**：`degraded` 口径未改（`:3934`），N-2 只改 summary 文本合成**单点**（`:3948-3951`），未新增第二处降级计数渲染 ⇒ P5 单点化保持 ✓
- **判定：自洽达标**（零发现；与 P3-1 的 `code` 恒定问题无关）。

### ④ F-12 状态语义（`setHostHealth(null)`）
- **「成功态瞬时清空」窗口：不成立**。依据：`setHostHealth` 仅在 `reportFailure` 内调用（`:2304`），`reportFailure` 仅在四类失败分支调用（`:2309`、`:2318`、`:2324`、`:2329`、`:2333`、`:2339`）⇒ 成功路径（`:2336-2337`）不清；不存在「成功→清空→成功」的中间态。effect deps = `[ready, remote, health]`（`:2342`），`setHostHealth(null)` 不改变 deps ⇒ 不会自激重跑（与 R0 F-4 更正注释 `:2290-2297` 口径一致）✓
- **与本地 `faceHealth` 的一致性：保持**。`setFaceHealth(localFaces)`（`:2279`）独立于失败路径；清空只影响 RPC 侧快照，本地面仍上行（`:2302-2303` 注释与实现一致）✓
- **两阶段断言能区分旧实现：能**（§2 维度 5 已给静态推演：旧实现陈旧 `faces: [host-probe-alpha]` + `9.9.9-a` 仍在文本中 ⇒ `:2441` 必红）✓
- **判定：达标**（零发现）。

### ⑤ N-4 锚卫生（`client-render.mjs:280-281`、`rpc-shadow-guard.mjs:73-76`）
- **裸行号锚残留：零**。证据（机读面而非目测）：对 `tests/client-render.mjs` / `tests/rpc-shadow-guard.mjs` / `lib/client.js` / `tests/served-client.js` 四文件执行 `[:：]\s*\d{3,}` 全量扫描——`rpc-shadow-guard.mjs` **0 命中**；`client-render.mjs` 12 命中但**逐条实读**均为数字字面量（`:349-352` token 计数、`:387` 时间戳 `1767225600000`、`:478/:561` `contextWindow: 65536`、`:1310-1432` `time: 48000` 等）**无一为「文件:行号」锚**；`lib/client.js` / `served-client.js` 各 26 命中，全为 CSS 值（`line-height:18px` 等）、URL 端口（`127.0.0.1:3080`）、JSX 数值（`maxWidth: 420`）与数字字面量（占位文本 `1455 被占`、`:3000` 注释内）✓
- **新符号名式锚符实**：`client-render.mjs:275-279` 指向 `lib/service.js` 的 `hostFaceDiagnostics()` + `lib/schemas.js` 的 `hostFaceDiagnosticsResult`/`faceHealthCodec`/`hostDiagEntryCodec`（导出名）——**不匹配 9h 三形态正则任一**（形态① 需 `.<ext>:N`；形态② `L####`；形态③ 需 `:` + 数字）⇒ 不新增 `anchorBearingFiles` ⇒ 9h-5 `uncoveredFiles` 不受影响 ✓；`rpc-shadow-guard.mjs:75-76` 同 ✓
- **是否触发 9h/9h-4/9h-4b/9h-4c/9h-5b/9h-5c 族**：
  - `9h R-1`（`:1341-1346`）：本批未改 `ANCHOR_CASES` ⇒ `tests/client-render.mjs`（条目 `:743-816`）与 `tests/rpc-shadow-guard.mjs`（条目 `:1035`）的 `fresh` 清单**逐条不受本批影响**（本批新文本与 `fresh` 串无交集）⇒ 不判红 ✓
  - `9h-4`（`:1448-1450`）/`9h-4b`（`:1451`）/`9h-4c`（`:1446-1447`）：本批**未在 `host-abi-health.mjs` 内改动任何文本**，且未新增 `stale` 数据单元 ⇒ `staleUnits.length === ANCHOR_CASES.length` 的前提不变 ✓
  - `9h-5b`（`:1570`）：未改豁免表 ⇒ `deadExempts`/`overlappingExempts` 不变 ✓；`9h-5c`（`:1534-1537`）：未改正则/枚举 ⇒ 恒等判据不变 ✓
  - **唯一自指风险已规避**：`client-render.mjs:365` 保留「改述前写『旧服务端形态』」的**勘正自述**；该串未登记进本文件条目 `stale`（`:744-776` 实读清单内无该串）⇒ **不判红**；同时沿用本仓「改述时转述而不逐字复引」的既有纪律（同族先例：`client-render.mjs:365`、`lib/client.js` 各勘正句）✓
- **`host-abi-health` 190 绿是否为充分证据：是，但为「非独立证据」**。依据：本批**未触碰** `tests/host-abi-health.mjs`（4 文件清单外，实读该文件亦无 FIX-047 字样）⇒ 190 不变只能证明「未改面不回归」，**不能**证明「本批新文本不触发 9h 族」；后者由本条上面的**静态正则/清单比对**独立给出 ✓（两路证据互补，结论一致）
- **判定：达标**（零发现）。

### ⑥ N-5 / N-6 措辞
- **N-5 限定语（`rpc-shadow-guard.mjs:173-178` + `lib/client.js:364-367`）**：逐句核对——① 「语义 = 声明等价 ≠ 校验行为等价」✓；② 「深等只比对两侧手写 spec 的文本（`lib/schemas.js` `v` 构造器 vs `lib/client.js` `wv` 构造器）」✓ 符实（实读 `lib/schemas.js:307` `function check(spec, value, path)`；`lib/client.js:203` `wireNode(spec)` + `:205-211` `wv` 家族；`rpc-shadow-guard.mjs:181` `specOf` 只取 `node.spec` ⇒ 确为 spec 字面量深比）；③ 「不覆盖 `check` vs `wireCheck` 的行为分叉（未知字段策略等）」✓ 符实（`lib/client.js:191-198` 对 `spec.properties` 之外的键**不校验**；两侧为独立手写实现）；④ 「不覆盖宿主 `$mount` 的 codec 消费面（宿主包不在本仓索引面）」✓ 与 R1 U-6 同口径、**未超宣示** ✓
- **N-6 措辞中性化**：`lib/client.js:2318` 现文案 = 「宿主面版本/诊断 RPC 方法缺失（浏览器侧挂载列表或宿主命名空间未提供该方法）」——**两因并列、无预设单因** ✓；`client-render.mjs:2302-2303` 与 `:363-365` 同步改为「该方法在浏览器侧挂载列表/宿主命名空间不可用」「挂载列表/命名空间两侧皆可能，不预设宿主单因」✓；grep 证「宿主服务端未注册该方法」「版本不一致」「旧服务端形态」在功能文案面**零残留**（唯一命中 = `:365` 的勘正自述）✓
- **是否含未证因果：无**。两条详情文案均为「谁没提供该方法」的存在性陈述（可观察事实），不含推断性的成因断言 ✓
- **判定：达标**（零发现）。

---

## 4. 本轮发现清单（全部 P3；P0/P1/P2 = 0）

| # | 级别 | 位置 | 事实依据 | 影响 | 修复建议 |
|---|---|---|---|---|---|
| **P1** | **P3**（讨论） | `lib/client.js:2235` | `code: 'host-face-stats-rejected'` 为**固定短码**，不携带宿主 `error.code`；同族 `reportFailure`（`:2303/2305`）与 `host-face-result-invalid`（`:2324`）分支则携带宿主码/分支码 | 「网关参数拒绝」与「传输失败」在环内**不可区分**（仅 detail 可读）；排障需读 detail 全文 | 下轮可改为 `code: \`host-face-stats-rejected: ${String(error?.code ?? error?.name ?? 'unknown').slice(0,48)}\``（与 host-face 分支的习惯对齐）或保持现状并登记为有意口径。**不阻塞** |
| **P2** | **P3**（讨论） | `tests/client-render.mjs:2408-2409` | F-16b 两支中，`statsDiagWithinEpisode === statsDiagAfter.length` 在「该窗口未记任何条目」时同样成立；判别力依赖**前置** F-16（`:2390` 要求 `statsDiagAfter.length > 0`）的基线非空 | 若未来 F-16 被改动/顺序调整，F-16b 可能退化为「0 === 0」空洞通过 | 在 F-16b 断言中显式加 `statsDiagAfter.length > 0 &&`（或断言该窗口内 `statsTimer` 确实驱动了 reject：`pollRpc.stats` 增量 > 0）。**不阻塞** |
| **P3** | **P3**（建议） | `tests/client-render.mjs:2396-2398` | `const statsTimer = captured.timers.filter((timer) => timer.ms === 2000 && !timer.cleared).pop()` 无 null 守卫，随后 `statsTimer.fn()` 直接调用 | 若 harness 面变化（该渲染路径不再产生 2s timer / clearInterval 标记异常），将以 `TypeError` **崩溃整个 runner 模块**而非产生一条 FAIL ⇒ 失败可诊断性下降 | 加断言：`check('stats timer captured', !!statsTimer)` 或 `if (!statsTimer) throw new Error(...)` 并带诊断（`captured.timers.length` / 各 ms 分布）。**不阻塞** |
| **P4** | **P3**（讨论） | `tests/rpc-shadow-guard.mjs:151-158` | 四轴比较采用**按位成对**（index 对齐）⇒ 「两侧同步改同一 descriptor 的 method」不判红（已由 `:131-132` 顺序判据确认无位错） | 该形态 = 同一次变更的两侧同步编辑，不产生事实源分叉；但「两侧同错名」（如把 `hostFaceDiagnostics` 同时写成 `hostFaceDiagnostic`）仍全绿 | 可选加一条同侧自洽判据 `descriptor.method === descriptor.id.split('/').pop()`（一行）。**判定为可接受，不要求修改** |
| **P5** | **P3**（建议） | `tests/client-render.mjs`（runner 模块面） | 本文件为 runner 模块，**无自打印断言计数**（实读：无 `assertions` 输出、无独立入口，由 `tests/smoke.mjs:6/2374` 承载 `check`）⇒ 门控数字只能用**静态 `check(` 计数**（当前 255）与 smoke `ok` 行（作者报 1184）间接登记 | 与 R1 N-3 同族：跨轮数字易被误作「套件自报」而产生链式偏差（本批作者已如实登记计数口径 ✓） | 维持现有如实登记；如需彻底消歧，可在 `runClientRender` 末尾返回 `{ passed, failed }` 并由 smoke 打印模块级计数（改动小但要动 runner 契约，可留待后续）。**不阻塞** |
| **P6** | **P3**（建议） | 治理证据面（非代码） | 各项「单变量判红」实证（U-5）与镜像哈希（U-3）均为**自陈/Coordinator 复跑**，仓内**无持久化变异脚本或复算留档**（grep/glob 未发现 FIX-047 变异副本） | 第三方（含后续 Reviewer）无法独立复算 RED 口径；与 R1 报告 U-4 同族 | 在 `evidence-log` 内附**变形命令原文**（如「副本内将 `clientDescriptors[index].method` 改一字」的确切替换对）或落一份 `tests/.tmp-*` 外的复算说明。**不阻塞** |
| **P7** | **P3**（建议） | `tests/client-render.mjs:372-390`（夹具） | 夹具 `'withEntries'` 的 faces 条目**不带** `consumer`、diag 条目**不带** `consumer`（`:376-377` 已如实声明「本夹具不带、本组不声称覆盖」）⇒ `hostDiagEntryCodec` 的可选字段面（consumer）在渲染组零行使 | 与 R0 F-10 的原始诉求（codec 锚真正被行使）相比**未完全闭合**（已如实登记，非隐藏）；`consumer` 为可选字段且卡片正文不渲染它 ⇒ 无消费面缺口 | 若要闭合，可在同组加一条 `consumer` 在场的条目不改变断言面（仅需确认渲染函数对它无消费路径）；或维持如实登记。**不阻塞** |

**发现级别分布**：P0 = 0，P1 = 0，P2 = 0，P3 = 7。**每条均含 文件:行号 + 事实依据 + 修复建议**（100% 标注率）。

---

## 5. 硬门槛逐项裁决

| 门槛项 | 阈值 | 判定 | 依据 |
|---|---|---|---|
| P0 阻塞问题数 | = 0 | **通过（0）** | §4 无 P0/P1/P2；7 条全为 P3（讨论/建议级） |
| 5 维度全覆盖 | = 100% | **通过** | §2 五维度（正确性/安全性/可维护性/性能/测试覆盖）逐一有结论与可复查依据 |
| 每条发现标注级别 | = 100% | **通过** | §4 七条全含 P3 标签 + `文件:行号` + 事实依据 + 影响 + 修复建议 |
| 设计一致性检查 | 已完成 | **完成** | ⇒ 见下「设计一致性 6 项」 |
| AI 代码专项 5 项 | 全部完成 | **完成** | ⇒ 见下「AI 专项 5 项」 |

**设计一致性（对齐 ADR 契约与项目原则 P 序列）**：
1. **P5 单点化（同一动作汇入同一实现路径）**：`stats` 失败**未**新开观测通道，复用 `noteHostFaceDiag` 单环（`lib/client.js:2222-2224`）；失败上屏仍走既有 `hostFaceNotice` → `HostHealthCard` 单点（`:3440`、`:3902-3951`）；N-2 的降级计数在 summary **单点合成**（`:3948-3951`）⇒ 无第二渲染点 ✓
2. **P8 失败/降级可观测**：F-16（`:2219-2238` 机录）、F-11（`:3903` 上屏）、F-12（`:2304` 清陈旧快照）三处正是 P8 的补齐；**唯一剩余相邻静默面** = `presetDiagnostics` 的 `() => undefined`（`:2241-2243`）——**任务范围内未授权**、已在 R1 F-16 条目登记为「范围外遗留」，本批正确未动（P6 违规：无）✓
3. **上一条被取代路径禁止并存**：`stats` 失败路径由 `() => undefined` **替换**为 `noteHostFaceDiag`（旧吞错路径已删除，非并存）✓
4. **不扩面**：本批**未触碰** `lib/rpc.js`（实读 `lib/rpc.js:43-91` 无 FIX-047 痕迹；`implementation` 仅 stats 一条为 FIX-011 既有面）⇒ 与「只为 parity 守卫补轴，不改契约」的任务边界一致 ✓
5. **commit 纯粹性（编程要求 4）**：4 文件全部对应本批台账条目，未夹带无关改动（实读：`lib/client.js` 改动点 = `:2210-2238`/`:2299-2304`/`:2313-2318`/`:3898-3903`/`:3930-3951`；`rpc-shadow-guard.mjs` = `:73-76`/`:141-165`/`:173-178`；`client-render.mjs` = 夹具 + 8 条断言 + 注释；镜像同步）✓
6. **与 FIX-046 已确证根因一致（EV-217）**：N-6 中性化未推翻已确证根因（客户端 `$mount` 缺 descriptor），只去除「单因预设」措辞（`:2313-2317`）✓

**AI 代码专项 5 项**：
1. **mock 残留**：产品代码（`lib/client.js` / 镜像）**零 mock**；本批新增仅注释 + 真实错误处理。测试侧 mock 为既有夹具（`tests/client-render.mjs:292` `remoteMock`、`:343-347` `statsFailMode` 分支），且 `:347` 的 throw 为**判别用注入**并带来源标注 ✓
2. **硬编码返回值**：新增硬编码仅测试夹具常量（`client-render.mjs:381-388` 版本串 `9.9.9-a`/面名 `host-probe-alpha`/时间戳）——已由 `:359-365`、`:376-379` 声明为「形状样例，非定因断言」；产品侧新增零魔数（`:2236` 的 160 与既有 `:2285` 同口径）✓
3. **幻觉 API**：新增消费者符号**全部实存**——`noteHostFaceDiag`（`lib/client.js:5236` 定义，组件作用域可见）、`HOST_FACE_DIAG_LIMIT`（`:5234`）、`setHostHealth`（`:2052`）、`hostHealthWarn`（`:668` 定义 / `:999` EN）、`hostHealthRpcFailed`（`:672`/`:1003`）、`invocation.kind`（`lib/rpc.js:49` 等）；守卫侧 `pathToFileURL`（`:25`）、`globalThis.window` 垫片（`:80-85`）均真实 ✓
4. **未实现 TODO**：四文件 grep `TODO|FIXME|XXX|未实现` **零命中**（产品与测试均无）；无死模式/死变量（`statsFailMode` `:289` 有写点 `:347`/读点 `:2381` 等；`hostFaceMode='withEntries'` 有实现 `:372`）✓
5. **过度实现**：本批 = 1 条守卫轴扩展（约 25 行）+ 4 处失败路径可观测性补齐 + 2 处措辞/锚卫生 + 1 处夹具扩展 + 8 条断言；**未扩面到** `lib/rpc.js`/宿主面/`presetDiagnostics`（`:2241-2243` 保持原状）；无「顺手重构」痕迹 ✓

---

## 6. 静态可复原证据（供第三方复算，全部为本人实读所得）

| 核验项 | 结果 | 依据（实读） |
|---|---|---|
| `rpc-shadow-guard` 断言数 = 31 | 成立 | §1 循环 19（`:45-49`）+ §2 1（`:54`）+ §3 3（`:59-61`）+ §4 8（`:114/128/131/133/138/156/193/195`）= 31 |
| N-1 四轴字段名与要求逐字一致 | 成立 | `tests/rpc-shadow-guard.mjs:146-149` |
| 「id 不变而 method 异名」此前确实无判据 | 成立 | `:114-139` 只读 `id`；`:183-199` 只读 `result`/`parameters[0].codec`/`parameters` 在场 ⇒ 无第三处读 `method` |
| N-1 断言含条数前提（防 `Math.min` 截断掩盖） | 成立 | `:157` `clientDescriptors.length === ROUTER_DESCRIPTORS.length`；`:162-164` 前提失败诊断 |
| 双侧四轴当前全等 | 成立 | `lib/client.js:398-424`（20 条，全部 `router/router/<id 后缀>/direct`）↔ `lib/rpc.js:43-91…`（同） |
| F-16 机录唯一产生点 | 成立 | 全仓 grep `host-face-stats-rejected`：`client.js:2235` + 镜像 `served-client.js:2235` + 断言/注释面 |
| F-16 复位位于 `alive`/`ok` 守卫之外 | 成立 | `lib/client.js:2216-2218` |
| F-16b 三拍驱动的是**同一**失败周期 | 成立 | harness `:106-111`（`pathKey` 复用实例）+ `:383` 与 `:2398` 同前缀 `'fix047-stats-rejected'` 未再调用 `renderInto` |
| F-12 两阶段为**同一组件实例** | 成立 | `:2431` 与 `:2436` 同前缀 `'fix047-stale-cache'` + harness `:106-111` |
| F-11 的「双源皆缺」构造完备 | 成立 | `:2449` `health: () => undefined` ⇒ `lib/client.js:2277` 不设 `faceHealth`（保持 undefined）+ `:2318` 失败分支 `setHostHealth(null)` ⇒ `:3903` 三缺 |
| `setHostHealth(null)` 仅失败路径调用 | 成立 | grep `setHostHealth`：`:2052` 声明、`:2304` 唯一调用点 |
| N-2 summary 单点合成 | 成立 | `lib/client.js:3948-3951`；`degraded` 定义仍在 `:3934` |
| N-4 裸行号锚四文件零残留 | 成立 | 四文件 `[:：]\s*\d{3,}` 全扫 + 逐条实读（12/26/0/26 命中，无一为锚） |
| N-4 新锚不触发 9h 三形态正则 | 成立 | `tests/host-abi-health.mjs:1517-1521` 三正则 与 `:275-279` 文本比对 |
| 9h 族登记面未被本批触碰 | 成立 | `host-abi-health.mjs` 无 FIX-047 字样（grep）；`ANCHOR_CASES` 两目标条目 `:743-816`/`:1035` 内容与本批新文本无交集 |
| N-5 符号名锚符实 | 成立 | `lib/schemas.js:307` `function check(spec, value, path)`；`lib/client.js:203` `wireNode` + `:205-211` `wv`；`rpc-shadow-guard.mjs:181` `specOf` 仅取 spec |
| N-6 旧文案零残留 | 成立 | grep「宿主服务端未注册该方法」「版本不一致」「旧服务端形态」⇒ 仅 `client-render.mjs:365` 勘正自述 |
| `client-render.mjs` 静态 `check(` 计数 = 255 | 成立 | `^\s+check\(` 命中 255（与逐行实读一致；无 `process.env`/`SKIP` 分支，`:840/849/1508` 三处 “skip” 为断言标签词） |
| `host-abi-health.mjs` 本批零改动 ⇒ 190 不变 | 成立（弱证据） | 该文件不在 4 文件清单；其判据面依赖的 `lib/client.js:2284/2299/3863` 等锚在本批改动后仍在位（`:2304` 为 `:2299-2303` 注释段落点） |
| 镜像结构性一致 | 成立（未哈希） | 两侧同 5881 行；`:2235`/`:2304`/`:3950-3951` 行号与文本逐一相同；锚扫描命中集同集 |

---

## 7. 交付与后续

- 本报告路径：`.governance/review-FIX-047-R0-input.md`（**唯一允许写入**；未修改任何产品/测试/治理文件，未执行任何命令，未创建子 agent）。
- **CONCLUSION = APPROVED_WITH_NOTES，unresolved_blockers=0** ⇒ 可作 pass 终态消费（round 0 < 3，未触 fuse；不存在未解决 BLOCKING finding）。
- **对 Coordinator 的范围提示（不做范围决策，仅报事实）**：本批 9 项条目**全部有落点且语义达标**；7 条 P3 中 **P2（F-16b 空洞风险）与 P3（statsTimer 无 null 守卫）成本极低、且直接服务于本批「失败必须可观测」的判别力**，若同批顺手闭合则本任务台账可一次清空；P1/P4/P5/P6/P7 属口径与留档项，可留待后续批次。
- **未验证项再次强调**：所有门控数字（31/190/20+4/29.7s/#SKIP 2）、镜像哈希、单变量判红实证、commit `d1c9d95` 元信息**均非本人复现**（§1 U-1~U-5）；本报告的通过依据**只**建立在本表 §6 的静态可复查事实上。另：任务上下文所提供的行号与当前工作树系统性错位（§1 U-2），后续引用请以本报告实读行号为准。
