# REVIEW-FIX-035-R0（input）— events 域 attach 失败条目缓存修复（Round 0）

- **任务**: FIX-035-R0（P1）｜**角色**: Code Reviewer Agent（只读审查，不修改产品代码/测试/治理状态；不与用户交互）
- **审查对象**: commit `031a1ff`（`D:/AI/agent/deepseek/plugins/router`；`git rev-parse HEAD` = 031a1ff8bae0547326e287f5620ecd0c50926b5f）。`--numstat` 实测：`lib/host-abi/events.js +17/−1`、`lib/client.js +13/−2`、`tests/host-abi-health.mjs +93/−0`、`tests/served-client.js +13/−2` = **4 文件 +136/−5**（与 `--stat` 一致，任务描述的「+18/+15/+15/+93」为 changed-line 口径 17+1/13+2/13+2/93）
- **对象完整性**: 审查期间 `git diff --stat HEAD -- lib tests` **空**、`git status --porcelain -- lib tests` **空** = 产品/测试面零漂移；工作树仅有 `.governance/evidence-log.md`、`.governance/plan-tracker.md` 修改 + `change-triage/FIX-035.json` 未跟踪（Coordinator 治理记录，非本 Reviewer 所为）
- **设计依据（只读实读）**: `.governance/arch-004-compatibility-design.md` §4.3 域 4（L230-235，降级行为 = L234）+ §5.2 P8 纪律（L319）；缺陷来源 `.governance/review-EVO-023-R0-input.md` §P2-1（L156-162）+ §4.5（L148）
- **工具边界**: read / grep / glob + 只读 git（show/numstat/rev-parse/status/diff）；**未执行任何测试、未写产品码/测试/治理状态**，唯一产出为本文件；镜像 hash 由 `Get-FileHash -Algorithm SHA256` 独立复算
- **结论**: `APPROVED_WITH_NOTES`
- `unresolved_blockers=0`
- 计数: **P0=0 / P1=0 / P2=1 / P3=8**（P2-1 为镜像诊断精度建议，非本批引入、不要求本轮返工；P3 为测试加固/文档精度/口径映射项，不阻塞）

---

## 1. 独立复算与机核（Reviewer 自跑，非引用 Developer 证据）

### 1.1 镜像 hash（声称 4CA72ACE…）

| 项 | 复算结果 |
|---|---|
| `sha256(lib/client.js)` | `4ca72ace0a8da7d685976c91ec0007ae100ad2b74a4bf118305ff467a49245d2` |
| `sha256(tests/served-client.js)` | `4ca72ace0a8da7d685976c91ec0007ae100ad2b74a4bf118305ff467a49245d2` |
| 行数 | 各 5689 行 |

**结论：声称 hash 成立**（`4CA72ACE…` = 全文件 SHA256 前缀）；更强的是 parity **已由机器看护**而非人工纪律——`tests/host-abi-health.mjs:151-152` 对 `readFileSync(lib/client.js)` 与 `tests/served-client.js` 做 `mirror === source` 字节全等断言（`source` 定义在 `:137`）。即镜像漂移即门控红，非依赖本次人工同步。

### 1.2 Developer 声称逐条核验

| # | 声称 | 核验 | 依据 |
|---|---|---|---|
| 1 | attach 抛错 → 条目不入表（`attached` 门 + no-op dispose），本调用消费者零 host listener、不记正向 `event-subscribed`；后续订阅重新 attach | **成立** | `events.js:196/200`（门）+ `:209-212`（`disposers.push(() => {}); continue`）使 `:213-214`（入表）与 `:216-219`（consumers push + event-subscribed）**不可达**；重试命中 `:192` `table.get` 未命中 → 重新 attach |
| 2 | 诊断 `event-subscribe-failed`{face=事件名, consumer=标签逗号连接≤64, code:'attach-threw', detail=错误摘要≤120} | **成立** | `events.js:207`；`consumer: consumers.map((item) => item.consumer).filter(Boolean).join(',').slice(0, 64)`、`detail: String(error?.message ?? error).slice(0, 120)`；`health.js:39-43` 二次白名单截断（face/consumer ≤64、code ≤48、detail ≤160）兜底 |
| 3 | 镜像同型修复 + served-client 字节镜像 | **成立** | `client.js:5157-5171`（同型分支）与 `client.js:5166`（同字段表达式）；hash 见 §1.1；`client.js:5668` `exports.subscribeClientEvents` 实证测试钩子非幻觉 |
| 4 | 测试 +16 断言（§9i 权威 10 + §9i-2 镜像 6） | **成立** | `host-abi-health.mjs:727-758` 实数 10 条；`:775-790` 实数 6 条（`grep "FIX-035 9i"` 命中 16）|
| 5 | 偏差①：用例顺序重排，初版 `disposeFailed` 先执行会自掩缺陷（RED 仅 3 fail），改「失败消费者仍在订阅态下测二次订阅」取得 13 fail | **成立（静态复算精确吻合）** | 见 §3；初版顺序的 3 红恰为 3 条诊断形状断言（§9i#2/#3 + §9i-2#11），与「3 fail」自洽 |
| 6 | 偏差②：诊断粒度 = 事件 × 失败 attach 尝试一条；「host returned no disposer」分支语义未改 | **成立** | `events.js:207` 每次失败尝试一条（同事件同调用内 `perEvent` 已聚合 → 多 consumer 共享一条逗号标签）；`:201` 该分支字面未变（仍 `{kind, face, detail}`，无 code/consumer） |
| 7 | 残余：R0 §4.5 的「宿主返回无卸载器」分支仍无用例，不在本任务范围 | **成立** | 全仓 grep `host returned no disposer` 仅命中 `events.js:201`，零测试驱动；`review-EVO-023-R0-input.md:148` 已记该缺口 |

### 1.3 范围核验

`git show --numstat 031a1ff` = 4 文件，与 `.governance/change-triage/FIX-035.json:8-13` `files[]` 锁定的 4 文件**逐项相等**；无顺带修改（无版本 bump、无 README/CHANGELOG、无其它 lib/tests）。P4 修改纯粹性（一个 commit 一个问题）成立。

---

## 2. 修复正确性逐路径推演

### 2.1 失败路径（核心目标）

`events.js:191-215` 推演：`table.get(event)` 未命中 → 建 `created`/`sharedListener` → `attached=false` → `attach` 抛错 → `catch`（`:202-208`）只记诊断 → `!attached` 分支（`:209-212`）压入 no-op 并 `continue`。**结论**：①`table.set` 不可达 → 无死条目；②`created.consumers` 恒空 → 无「假消费者」；③无 `event-subscribed` 正向记录（`:217-219` 不可达）→ 观测误导的相反信号消除，P8 违规面闭合；④本调用该事件零宿主 listener（stub 侧 `flakyListeners` 零写入已由测试断言）。

### 2.2 dispose 语义（不悬挂、不误摘）

失败事件压入的是 `() => {}`（`:210`）；外层 `:231-235` 逐条 try/catch 执行 → 幂等、不抛、不影响同调用其它事件的真实 disposer。因失败条目从未入表，`entry.consumers.indexOf`/`table.delete` 语义（`:220-229`）不被触碰 → 零跨消费者误摘（`:225-228` 的 identity 守卫 `table.get(event) === entry` 未变）。

### 2.3 重试自愈

失败消费者不入表 ⇒ 后续 `subscribeEvents`（同 target 同事件）`:192` 未命中 ⇒ 重新 `attach`；成功后正常入表 + 记 `event-subscribed`。`WeakMap` 键控（`:101-110`）保证 target 释放即回收，失败事件不遗留表项。

### 2.4 成功路径回归面（零行为变化）

新增语句仅 `let attached = false`（`:196`）+ `attached = true`（`:200`，紧随 `created.dispose` 赋值之后）。二者均为局部布尔赋值，`attach` 返回后不可跳过亦不可能抛错 ⇒ 成功路径的入表/分发/卸载/await 透传（`:213-235`）与修复前逐语句等价。镜像侧同构（`client.js:5157/5161`，`:5172-5191` 等价）。**无回归面**：单元面 §9d/§9e/§9i-2 非回归断言（零第三次 attach、聚合分发、全量卸载归零）在修复后语义不变。

### 2.5 边界与资源

- 非法形状 / 白名单外事件名仍在 `attach` 之前拒绝（`:170-178`），互不干扰。
- 同调用多事件、其一失败：`continue` 仅跳过该事件，其余事件照常（代码路径成立；组合无测试，见 P3-4）。
- `attach` 在宿主侧「先注册后抛错」会遗留无 disposer 的 listener —— 不可消除（无返回值可卸载），且非本批引入（修复前同样 `created.dispose = null`），无回归（P3-5）。
- 并发：全程同步，`table.get`→`attach`→`table.set` 间无异步点，无交错窗口；诊断环形写入自身有界（`health.js:45-46`）。

---

## 3. 修正后测试判别力（RED 静态推演 + 偏差①裁决）

### 3.1 修复前（buggy 态）逐断言推演

以 `031a1ff^` 的 `events.js`（`attached` 门与 `continue` 均不存在 = 无条件入表）代入 §9i/§9i-2 当前顺序：

| 断言 | buggy 态判定 | 推演 |
|---|---|---|
| §9i#1 零 host listener | PASS | `on` 在 push 前抛错，`attemptEvents=1`、listeners=0 —— **该断言不判别「是否入表」**（见 P3-1）|
| §9i#2 诊断含 code/consumer | **FAIL** | 旧 catch 无 `code`/`consumer` 字段 |
| §9i#3 无正向 `event-subscribed` | **FAIL** | 旧路径无条件入表后记 `event-subscribed` |
| §9i#4 二次订阅重试 attach | **FAIL** | 死条目命中 `table.get` → `attemptEvents` 恒 1、listeners 恒 0（**核心判别锚**）|
| §9i#5 重试消费者收到事件 | **FAIL** | 无 listener → `retryCalls` 恒 0 |
| §9i#6 零第三次 attach | **FAIL** | attempts 期望 2、实为 1 |
| §9i#7 聚合分发 | **FAIL** | 无 listener |
| §9i#8 失败 dispose no-op | **FAIL** | 旧 disposer 真摘 consumer；`retryCalls===3` 不成立 |
| §9i#9 dispose 后活消费者照常派发 | **FAIL** | 同上 |
| §9i#10 全量卸载 listener 归零 | PASS | buggy 态本就零 listener（清理断言，非判别）|
| §9i-2#11 镜像诊断同型 | **FAIL** | 旧镜像 catch 亦无 `code`/`consumer` |
| §9i-2#12 镜像二次订阅重试 | **FAIL** | 镜像死条目复用 |
| §9i-2#13 镜像重试收到事件 | **FAIL** | 无 listener |
| §9i-2#14 镜像 dispose no-op | **FAIL** | 同 §9i#8 |
| §9i-2#15 镜像 dispose 后派发 | **FAIL** | 同上 |
| §9i-2#16 镜像卸载归零 | PASS | 清理断言 |

**合计 buggy 态 13 FAIL / 3 PASS，与声称「RED 13 FAILURE」逐条吻合**；3 PASS 均为「零 listener 存在性」与「卸载归零」类，属非判别性的守卫断言，不构成假绿（它们不断言修复语义），但也说明判别力完全由 #4/#5（+镜像 #12/#13）承载。

### 3.2 偏差①（用例顺序重排）裁决 — **测试设计成立且必要**

推演初版顺序（`disposeFailed()` 紧接首次订阅、先于二次订阅）：buggy 态 disposer 真摘 consumer → `entry.consumers` 归零 → `entry.dispose?.()` 为 null no-op → `table.delete(event)` ⇒ **二次订阅重新 attach 并成功**，除 3 条诊断形状断言外全部转绿（恰 = Developer 所述「RED 仅 3 fail」）。即：

1. **重排是判别力的必要条件**：死条目复用的可观测窗口 = 「失败消费者仍处订阅态」期间。生产语义正是如此（模块把 dispose 句柄持有至自身卸载，期间另一模块订阅同一事件）——重排提升的是**真实性**而非取巧。
2. **未掩盖真实缺陷**：P2-1 影响面「永久静默」恰由「失败消费者 dispose 从不被调用」定义；重排后测试锁定的就是这个永久态。
3. **顺序敏感性有据**：状态清理路径（disposer）同时是自愈路径，顺序变化改变被观测状态 —— 该敏感性在报告与 commit message 中如实披露，属诚实测试设计。
4. 可加固（非必需）：补一条「失败消费者先释放 → 再订阅」的顺序无关性断言（修复后两序同绿，仅作回归网）。

### 3.3 测试实现面复核

- stub 形态：`flakyCtx = { on: (event, handler) → disposer | throw }` 与生产调用契约同构（`events.js:198` 两参调用 + `typeof dispose === 'function'`/throw 假设），失败注入显式（`failNext`），非伪造宿主形状；与既存 §9d/§9e 同款 double 一致，宿主面形状锚定由 `tests/host-contract.mjs`（S4 域管事件黑名单 `:473`、S6 白名单 `:521-535`）另行承担 → 不违反 P10-④。
- 读者面：`hostDiagnostics()`（authoritative 环，`:730/733`）与 `mirrorDiagOf()` = `createClientRemotes({get,remote}).health().diag`（镜像环，`client.js:5420-5421` `diag: hostFaceDiagEntries.slice()`，与 `subscribeClientEvents` 同 factory 闭包）——观测口真实、无越权读。
- 断言无外部状态污染风险：`degraded-consumer` / `degraded-mirror-consumer` 标签全仓唯一。

---

## 4. 诊断合规（P8）与设计一致性

- **字段完整/风格**：`kind:'event-subscribe-failed'` + `code:'attach-threw'`（kebab 短码，与既存 `not-forwarded` / `invalid-shape` / `host-face-missing` 同风格）；补 `face`/`consumer`/`detail` 后与同族 `event-handler-error`（`events.js:131`）、`event-gated`（`:124`）、`event-subscribed`（`:218`）字段面齐平。
- **截断边界**：`consumer` 先连接后截断 `.slice(0,64)`、`detail` `.slice(0,120)`，`health.js:39-43` 再截（face/consumer 64、code 48、detail 160）→ 环形有界不破（§1 断言组）。多消费者时标签可能被截在标签中部（facets 不受影响），见 §7 P3-3。
- **敏感信息**：新增字段为静态标签与宿主错误摘要（既有 `detail` 表达式不变）；无密钥/token/凭据透传，无新增外部输入面。徽章渲染为文本插值（`client.js:3804-3805` `el('div', ...)` 拼接字符串，非 innerHTML）→ 无 XSS 注入面。
- **设计 §4.3 域 4（L234）一致性**：「订阅失败 → warn + 该事件消费者全部进降级名单（健康徽章可见），不影响其余事件」——①warn = 诊断环形（`host-abi/*` 全域无 `console.warn`，L319 明确「每个降级动作都产生 noteHostDiag 条目」为口径承载）；②**不影响其余事件** = 逐事件 `continue` 隔离成立；③可见性 = 环形 + 徽章 diag 区渲染（`client.js:3780-3805`，≤8 条，含 `kind + face + (code) + detail`）；④「降级名单」以「事件 × 失败尝试条目 + consumer 标签」落地，无持久名单数据结构——因失败消费者不持有任何状态、重试即成即清，语义上不存在需持久化的悬挂态（口径等价，建议台账映射留痕，见 §7 P3-6）。
- **镜像 parity 事实澄清**：镜像 `subscribeClientEvents` **从不写** `event-subscribed` 正向诊断（本批新增 `code/consumer` 表达式 `client.js:5166` 与权威 `events.js:207` 在 `face`/`consumer`/`code` 上逐字符同式）；`detail` 表达式两面具既有差异（`String(error?.message ?? error)` vs `String(error && error.message ? error.message : error)`），故 §9i#3「无正向 event-subscribed」为权威侧断言、§9i-2 未重复断言是对的（镜像无该信号可误记）。该差异非本批引入（见 §7 P2-1）。

---

## 5. 五维度结论

| 维度 | 结论 | 依据 |
|---|---|---|
| 1 正确性 | ✅ 通过 | §2 逐路径推演；失败不入表/不悬挂/重试自愈成立；成功路径仅增布尔赋值，零行为变化；边界与资源无回归 |
| 2 安全性 | ✅ 通过 | 无新增输入面；诊断字段为静态标签 + 环形截断错误摘要；无硬编码密钥；徽章为文本渲染无注入；镜像环有界（64）|
| 3 可维护性 | ✅ 通过 | `attached` 门语义清晰、注释与代码一致（含 P8/设计依据指向可复核）；镜像双面同步有机器看护（`:151-152`）；函数长度 ≈76/78 行为既存规模（见 P3-8）|
| 4 性能 | ✅ 通过 | 新增路径仅在失败时执行 O(k) 标签连接；成功路径零额外分配/循环；重试自愈实际消除了「死条目命中但永不禁用」的无效缓存 |
| 5 测试覆盖 | ✅ 通过（有加固建议） | 错误路径 + 镜像 parity + 非回归断言齐备，判别力静态复算 13/16 红；缺口 = 多消费者标签/截断边界、多事件混合批次、无 disposer 分支（P3-2/3/4）|

---

## 6. AI 专项 5 项

| 项 | 结论 | 依据 |
|---|---|---|
| mock 残留 | ✅ 无 | 产品码零测试替身；`flakyCtx`/`flakyOn` 为显式失败注入 stub，仅存在于 tests |
| 硬编码返回值 | ✅ 无 | `attached` 由真实 `attach` 结果驱动，无「恒成功」伪造；诊断字段取自真实 error |
| 幻觉 API | ✅ 无 | `subscribeEvents`/`noteHostDiag`/`hostDiagnostics`（`host-abi-health.mjs:72-79` 导入面）、`exports.subscribeClientEvents`（`client.js:5668`）、`createClientRemotes().health().diag`（`:5420-5421`）全部实存 |
| 未实现 TODO | ✅ 无 | diff 内零 TODO/FIXME/占位实现 |
| 过度实现 | ✅ 无 | 产品面 +30/−3 行（含注释），无顺带重构/无关文件；范围与 triage `files[]` 全等（§1.3）|

**结论：5/5 通过。**

---

## 7. 发现清单（每条含级别 + 位置 + 依据 + 建议）

### P2-1（建议）— 镜像诊断 `detail` 表达式两面不一致（非本批引入，不要求本轮返工）

- **位置**: `lib/host-abi/events.js:207` vs `lib/client.js:5166`（镜像 `tests/served-client.js:5166`）
- **依据（可复查）**: 权威 `String(error?.message ?? error)`，镜像 `String(error && error.message ? error.message : error)`。对 `Error` 实例（非空 message）两者等价；对 `Error('')` 或 message 为假值的抛错对象，权威记空串（`health.js:43` 随后丢弃该字段），镜像记 `String(error)`（如 `"Error"`/`"[object Object]"`）。另：镜像环形 `noteHostFaceDiag`（`client.js:5061-5066`）无字段白名单/截断（仅 64 条上限），故 `face: event` 未截断——当前**不可达**（镜像 attach 前经 19 项白名单过滤，最长名 24 字符），但守卫强度低于 `health.js:35-48`。
- **影响**: 仅影响失败诊断文本精度与镜像环防御深度；两处均为既有实现（`031a1ff^` 已如此），本批未引入、未加重。
- **建议**: 该差异会削弱「同型修复」的字面含义——建议在下次触碰镜像环时把 `detail` 统一为权威表达式（须同时改 `lib/client.js` + `tests/served-client.js` 以维持字节镜像），并考虑为镜像环补统一截断；本轮不需要动作。

### P3-1（讨论）— §9i#1 标签强于其断言

- **位置**: `tests/host-abi-health.mjs:727-728`
- **依据**: 断言仅为 `attemptEvents.length === 1 && listeners.length === 0`，在 buggy 态同样成立（§3.1）——「条目不入表」无法由外部直接观测（`table` 为模块私有）。
- **建议**: 标签改为「零宿主 listener（无假订阅）」或补一条复用探测（现有 #4 已承担判别）；不影响判别力（13/16 红已复算成立）。

### P3-2（讨论）— 「host returned no disposer」分支仍零用例

- **位置**: `lib/host-abi/events.js:201`
- **依据**: 全仓仅此一处命中该字符串，无测试驱动；`review-EVO-023-R0-input.md:148` 已记该缺口；Developer claim 7 如实申报为范围外。
- **建议**: 台账绑定后续批次（如 B6 后残余批），与 P3-5 同族一并收口。

### P3-3（讨论）— 诊断字段边界未被测试锁定

- **位置**: `lib/host-abi/events.js:207` / `lib/client.js:5166`
- **依据**: claim 2 声称「consumer 逗号连接 ≤64、detail ≤120」，但 §9i 仅覆盖单消费者 18 字符标签、27 字符错误摘要；多消费者 `join(',')` 与 >64/>120 截断边界无断言（缓解：`health.js:39-43` 二次截断 64/160 兜底）。
- **建议**: 可选补一条多消费者 + 长标签用例，锁「截断后仍含 face/code」的诊断可用性；非必需。

### P3-4（讨论）— 多事件混合批次（一失败一成功）无看护

- **位置**: `lib/host-abi/events.js:191-215`
- **依据**: `continue` 的逐事件隔离在代码上成立，但 §9i 仅覆盖单事件批次；§9d/§9e 覆盖多事件全成功/全拒绝，无混合。
- **建议**: 可在同批补 1 条断言（低成本回归网）。

### P3-5（讨论）— 宿主「先注册后抛错」的不可回收 listener

- **位置**: `lib/host-abi/events.js:202-208`
- **依据**: 抛错时无 disposer 可留，`created` 被丢弃 → 若宿主已注册则该 listener 不可卸载（修复前同样如此，非回归；与 P3-2 同族）。
- **建议**: 记录为宿主异常行为下的已知边界，或在事件面文档注明；无需代码动作。

### P3-6（讨论）— 设计「降级名单」到实现的映射建议台账化

- **位置**: `.governance/arch-004-compatibility-design.md:234` vs `events.js:207` + `client.js:3804-3805`
- **依据**: 设计为「warn + 消费者进降级名单（健康徽章可见）」；实现为「环形诊断条目（事件 × 失败尝试，含 consumer 标签）+ 徽章 diag 区可见（≤8 条渲染）」，无持久名单结构（失败消费者不持有状态，重试即成即清）。
- **建议**: 判定为口径等价（R0 已按此接受 B5），建议在实现注释或台账显式留痕该映射，避免后续评审把「名单」误判为未实现。

### P3-7（讨论）— commit message 断言计数与实际不符

- **位置**: `031a1ff` commit message（「§9i 用例（权威 11 断言 + 镜像 5 断言…）」）
- **依据**: 代码实测 §9i = 10 条（`:727-758`），§9i-2 = 6 条（`:775-790`），总计 16 与声称一致；分侧计数相反。
- **建议**: 提交信息口径精度项，不改代码。

### P3-8（讨论）— 函数长度超 SKILL 维度 3 建议阈值

- **位置**: `lib/host-abi/events.js:161-236`（≈76 行）/ `lib/client.js:5115-5192`（≈78 行）
- **依据**: code-review SKILL 维度 3「单函数 > 50 行建议拆分」；本批各 +≤5 行，属既存规模。
- **建议**: 热修批不拆；如后续重构可按「参数归一化 / 表驱动 / 卸载聚合」三分，风险与收益不成正比。

### 未验证项（按事实依据红线标注）

1. **实跑证据未机录**：`RED 13 FAILURE → GREEN 149 断言` 与本批 `node tests/run-all.mjs 24/24` 结果**未验证**——`.governance/evidence-log.md:594` 仅 `TRIAGE-FIX-035` 一行，`plan-tracker.md:35` 状态仍为「已 triage…派发 Developer」，RED/GREEN 数字无机器记录可核，且本 Reviewer 不执行测试。RED 的判别力已由 §3.1 静态推演独立成立（13 FAIL / 3 PASS 与声称逐条吻合），实跑复现与门控复跑归 Coordinator 裁终。
2. 偏差①所述「初版 RED 仅 3 fail」为**静态推演一致**（§3.2），非实跑复现。
3. 本报告全部结论基于文件内容/行号/`git show`/hash 级证据，无运行观测；「通过」限定于静态正确性、设计与口径一致性，不等价于运行时验收。

---

## 8. 结论

- **评审维度**: 正确性 ✅ / 安全性 ✅ / 可维护性 ✅ / 性能 ✅ / 测试覆盖 ✅（五项均有结论与依据，见 §5）
- **AI 专项 5 项**: 5/5 通过（§6）
- **硬门槛**: 5 维 100% ✅；每条发现带 P0~P3 + 位置 + 依据 + 建议 ✅；设计一致性（§4.3 域 4 L234 / P8 L319）已比对 ✅；P0=0 ✅
- **发现计数**: P0=0 / P1=0 / P2=1 / P3=8
- **四选一结论**: **APPROVED_WITH_NOTES**
- **`unresolved_blockers=0`**
- **理由（一句话）**: P2-1 缺陷（attach 抛错后无条件 `table.set` → 死条目复用 + 静默死订阅 + 正向 `event-subscribed` 观测误导）已被「attach 成功才入表 + 失败可观测 + no-op dispose + 重试自愈」在权威与镜像两面**同步且最小化**修复（`events.js:196-215` / `client.js:5157-5173`，镜像 SHA256 全等且有字节级机器守卫），成功路径零行为变化、范围与 triage 锁定文件全等，测试判别力经静态复算达 13/16 红（核心锚「二次订阅零 attach」成立）且偏差①顺序重排为取得该判别力的必要条件并已如实披露，无 P0/P1；P2-1/P3-1~8 为镜像诊断精度、边界与文档口径加固项，不阻塞合并。
- **遗留项建议**: P2-1 → 下次触碰镜像诊断环时统一（须保持字节镜像）；P3-2 + P3-5 → 台账绑定后续批次收口；P3-1/P3-3/P3-4 → 可选测试加固；P3-6 → 台账注明设计映射；P3-7 → 提交信息口径；P3-8 → 不动作。实跑 RED/GREEN 与门控 24/24 由 Coordinator 复跑裁终（§7 未验证项 1）。

*（本文件为 REVIEW-FIX-035-R0 的审查输入报告；治理状态机录由 Coordinator 执行，Reviewer 未修改任何产品码/测试/治理文件。）*
