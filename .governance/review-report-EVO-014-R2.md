# EVO-014 R2 Code Review — NF-1 一词修复快速复审

- **审查对象**: commit `4e1d9cc`（一词修复：`lib/preset-defaults.js:334` `return` → `return await enqueueSeed(...)`；tests 新增 G1 判别断言 + 头注释 G 节声明）
- **审查轮次**: **R2（快速通道复审——单一 finding 单词修复）**；前轮引用：`.governance/review-report-EVO-014-R1.md`（R1 = APPROVED_WITH_NOTES，unresolved_blockers=0，P0=0 · P1=0 · P2=1(新) · P3=1(新) + 台账延续 P3×6）
- **Reviewer**: Code Reviewer Agent（与 R0/R1 同一角色，角色定义 + code-review SKILL，只读审查）
- **证据基础**: 现盘 Read 静态核验（`lib/preset-defaults.js` 全关键段 + `tests/preset-defaults.mjs` G 节全文 + README/service.js 漂移抽查）+ 微任务时序推演（G1 RED/GREEN 判别力证明）+ Coordinator 复跑证据（preset-defaults **38/38** exit 0 含 G1；smoke **ALL PASSED** exit 0）。按只读约束未自行运行命令，Coordinator 输出按 R1 §9 同标准采信（见 §9）
- **审查结论**: **APPROVED（unresolved_blockers=0）**
- **发现计数**: **P0=0 · P1=0 · P2=0 · P3=0（新发现 0）**；遗留 = NF-2（P3 观察项延续）+ 台账 P3×6（任务裁定不计 unresolved）

---

## 1. R1 findings 逐条比对

| R1 finding | 级别 | R2 裁定 | 现盘证据 |
|---|---|---|---|
| NF-1 `:334` bare `return` 拒绝逃逸 handler catch（unhandledRejection 链） | P2 | **已修复**（一词修复精确落位 + G1 判别断言守卫到位，见 §2/§3） | `preset-defaults.js:334` 现为 `return await enqueueSeed(agent, agentPreset, cfg.main)`；tests `:603-639` |
| NF-2 队列兜底 catch 无注入测试 | P3 | **延续观察项**（G1 注入的是 seed 拒绝经 handler 出口的兜底；`run.catch(()=>{})` 的「单次失败不断链」性质仍无直接断言——观察项不要求修改，不计 unresolved） | `preset-defaults.js:248` 同形 |
| 台账 P3×6（F-5/F-6/F-7/N-1/N-2/N-3） | P3 | 台账延续（本轮触碰面零交集，未消解未恶化） | 按任务裁定不计 unresolved |

NF-1 是 R1 唯一新 P2 finding——本轮唯一复审焦点；NF-2 与台账延续项非本轮修复面。

## 2. NF-1 修复面核验（本轮重点）

### 2.1 修复精确性

现盘 `:334`（onPresetSelected 已配置预设分支）：

```js
if (cfg && cfg.enabled !== false && modelSet(cfg.main)) return await enqueueSeed(agent, agentPreset, cfg.main)
```

- ✅ 与 R1 §4 修复建议逐字一致：「一词——`return await enqueueSeed(...)`」。
- ✅ **语义验证**：`return await` 在 try 块内（`:323-339`）——`await` 使 `run` 的拒绝在 try 块内物化 → catch 块（`:340-343`）执行 → warn 可观测（`:342` 模板含 `agent-preset/selected` + error.message）→ async handler 正常 resolve。fire-and-forget 丢弃 resolve 的 promise 无任何后果——unhandledRejection 链在结构上闭合。这正是 R1 事实链 ①（`return promise ≠ await promise`）的逆操作。
- ✅ **非反模式**：`no-return-await` lint 建议仅适用于非 try 上下文；此处 `await` 是换取 catch 覆盖的必需用法，且保留 `run` 拒绝的完整栈帧（相比 bare return 的 adopt 语义）——正确且更优。
- ✅ **三调用点防御一致**：`:313`（agent/created）`await` / `:334` `return await` / `:339`（重置分支）`await`——R1 §4 ④ 指出的「两处 await 一处 bare return 不一致」已消除，三处 handler 拒绝全部落入各自 catch 的 warn 覆盖域。
- ✅ **结算顺序不变**：handler 仍 await 自己那次 seed 完成后 settle——与队列语义（R1 §2.1 表 3 行）和宿主 fire-and-forget 语义（宿主本就不等待监听器）零冲突；`P8-violation` 解除（该路径失败现有 warn 观测）。

### 2.2 修复方案选择与 `:166` 现状

R1 给出二选一修复方向（`:334` return await **或** `:166` 与 sibling 同构包 try/catch）。Developer 选前者；现盘 `:166` 保持原样：

```js
const apiProxy = ctx && typeof ctx.get === 'function' ? ctx.get('apiProxy') : undefined
```

裁定：**两方向等价收敛**——`:166` 抛错 → seed（async，`:162`）拒绝 → run 拒绝 → 现经 `return await` 由 handler catch 兜底 warn。选择上游兜底（handler 出口）覆盖面更广：顺带覆盖 seed 内任何未来新增的未防护拒绝源，而非仅 `:166` 一点。方案选择正确。

### 2.3 修复面无夹带

- `:335-336` 注释、`:337-338` global 解析、`:339` await——行号与 R1 记录零漂移 → 产品面改动确实仅 `:334` 一词（一词修复纯净性，符合「一个 commit 承载一个问题修改」）。
- 队列段 `:245-250` 原样；seed 内部防护（fail-closed `:173-176` / revertOptions `:196-198` / 错误信封处理）原样；R1 已验证面复核：README `:102/:103`（串行化 + 分裂窗口披露）仍在，service.js JSDoc「事件播种生效」段（现 `:781`，R1 记 `:780`——同一注释段内的口径差，内容一致）仍在——零漂移。

## 3. G1 判别断言守卫力核验（tests `:603-639`）

G1 与 R1 NF-1 事实链 ①②③ 逐点对齐，四要素齐备：

| 要素 | 实现位置 | 核验 |
|---|---|---|
| **apiProxy face 抛错注入** | `:617-621` 覆写 `ctx.get`，仅 `key === 'apiProxy'` 抛 `'injected apiProxy face failure'`，其余键放行 | ✅ 精确命中 seed `:166` 唯一现实逃逸点；`liveDefaultSelection` 等其余 ctx.get 消费不受扰动——注入面收敛于被测路径 |
| **fire-and-forget handler** | `:615` 取 listener；`:629` `handler('sess-g1', PRESET_ID)` **不 await、丢弃返回值** | ✅ 精确复刻宿主 cordis emit S4——只有外泄的 handler 拒绝才会成为 unhandledRejection（而非测试自身 await 引发的同步异常） |
| **process 级零外泄判据** | `:623-625` `process.on('unhandledRejection')` 捕获器；`:631` 3 轮 `setImmediate` 排空；`:633` 断言 `captured.length === 0` | ✅ Node 在微任务清空后的 check 阶段检测 unhandled rejection——3 轮 setImmediate 足以让 seed promise 链完全结算并触发检测（若有）。**RED 诊断行** `:632` 在失败时打印外泄计数与首条 message——复现外泄链可见 |
| **warn 可观测** | `:634` 断言 warnCalls 含 `agent-preset/selected` **且** 含注入错误信息 | ✅ 与 `:342` catch 模板精确匹配（双条件防误配：仅事件名或仅错误串均不通过） |

**路径命中验证**：agent `sess-g1`（header `{origin:'main'}` 无 agentPreset）经 `agents.get` 取到、`requestHeader()===null` 不早退（`:328/:330`）→ `presets.governance` 存在、enabled、`modelSet(cfg.main)` → **恰好命中 `:334` 修复分支**——断言面与修复点严格同一行，无绕行。

**微任务时序推演（判别真）**：
- **旧实现（bare `return run`）必败**：run 拒绝 → async handler return promise adopt run 拒绝状态、catch 不执行 → 丢弃的 handler promise 无人 catch → check 阶段 emit unhandledRejection → `captured.length > 0` → `:633` 断言 FAIL（诊断行打印外泄链）。注意队列链尾 `seedQueue = run.catch(()=>{})`（`:248`）吞掉的是**链尾**引用，enqueueSeed 返回的 `run` 本身仍拒绝——兜底不救 bare return 路径，判别不被队列干扰。
- **新实现（`return await`）必过**：拒绝在 try 内物化 → catch `:340-343` warn → handler resolve → 丢弃无碍 → `captured.length===0` 且 warn 断言命中 → GREEN。

**测试卫生**：`finally { process.off(...) }`（`:635-637`）进程级监听器必清理（不污染后续节/测试进程）；覆写 `ctx.get` 的 ctx 为本节局部变量（不外泄）；独立 ctx + WeakMap 安装（`:174-177`）→ 与 A-F 节零耦合。

**断言计数互洽**：R1 的 37 + G1×1 = **38**，与 Coordinator 38/38 exit 0（含 G1）逐一对应；文件头注释 Rework 段新增 G 节声明（`:33-37`）与实现同步——文档-测试-实现三方一致。

## 4. 修复面新发现

**0 条**。修复面（产品一行一词 + tests 一个节 + 头注释一段）逐行核验无新问题；R1 已验证面（README/service.js/队列段/seed 内部）零漂移复核通过。

## 5. 五维度结论（修复面增量 + 全文件上下文）

| 维度 | 结论 | 要点 |
|---|---|---|
| 1 正确性 | **通过** | NF-1 修复语义精确（§2.1）；三调用点 catch 覆盖一致化；G1 时序推演证明 RED/GREEN 双向判别真（§3） |
| 2 安全性 | **通过** | 修复零新攻击面：错误路径防御收紧（拒绝不再外泄进程）；无输入/敏感面变更 |
| 3 可维护性 | **通过** | 一词修复纯净无夹带（§2.3）；tests 头注释 G 节声明与 Rework 段体例一致 |
| 4 性能 | **通过** | `return await` 结算顺序与 bare return 等价（仅 catch 覆盖差异）——零运行时开销差 |
| 5 测试覆盖 | **通过** | G1 补齐 R1 NF-1 指出的「D5 类面缺失以 undefined 建模、未以 throw 建模」缺口——seed 拒绝路径现有 throw 注入 + process 级零外泄 + warn 三重断言守卫 |

## 6. AI 代码专项 5 项检查（修复面增量）

| 项 | 结论 |
|---|---|
| mock 残留 | ✅ 无——G1 注入为测试内覆写局部 ctx（tests 隔离面），产品代码零测试痕迹 |
| 硬编码返回值 | ✅ 无 |
| 幻觉 API | ✅ 无——仅改动既有调用点一处关键词，零新宿主 API 消费 |
| 未实现 TODO | ✅ 无 |
| 过度实现 | ✅ 无——一词 + 一断言节，最小修复面 |

## 7. 硬门槛裁决

| 门槛 | 阈值 | 实测 | 裁定 |
|---|---|---|---|
| P0 阻塞问题数 | = 0 | 0 | ✅ |
| 5 维度全覆盖 | 100% | 5/5 逐项有结论 | ✅ |
| 每条发现标注级别 | 100% | 新发现 0（空集平凡满足）+ 比对表 3/3 | ✅ |
| 设计一致性检查 | 已完成 | 修复仅收敛错误路径，用户三原则/D1 主权结构/队列语义/R1 C1-C16 契约面零触碰 | ✅ |
| AI 专项 5 项 | 全部完成 | §6 逐项 | ✅ |

**结论: APPROVED，unresolved_blockers=0**

- NF-1（P2）：**已修复关闭**——修复精确、判别守卫到位、防御一致化，无需台账遗留。
- NF-2（P3）：延续观察项，不要求修改（G1 覆盖的是 handler 出口兜底；队列链尾不断链性质仍无直接断言——后续触碰该文件可顺手补）。
- 台账 P3×6（F-5/F-6/F-7/N-1/N-2/N-3）延续不阻塞。

## 8. 目标锚定

plan-tracker `:63` EVO-014（P1，进行中）：本轮为 R1 NF-1 一词修复验证——错误路径防御收紧属 EVO-014 rework 收尾，未偏离入账范围与成功标准（事件驱动 + 用户三原则结构未动）。

## 9. 既有验证证据采信

Coordinator 复跑（preset-defaults **38/38** exit 0 含 G1；smoke **ALL PASSED** exit 0）与本审查静态核验互洽：38 = R1 的 37 + G1×1，新增量唯一对应 G 节；修复变更面（产品一行一词 + tests 一节）与 smoke 零回退一致（事件冷路径 + 注释/测试非产品面）。G1 在 Coordinator 环境通过 = 新实现 GREEN 判据现场成立（与 §3 推演互证）。采信。

## 10. Reviewer 自查

未修改任何产品代码；未运行命令（全程 Read/Grep 只读 + 本报告单文件 Write）；未创建子 agent；未与用户交互。NF-1 关闭裁定基于现盘逐行核验 + 微任务时序推演（可复查：`:334` 现盘 + tests `:610-638` 断言原文）；未验证项如实标注：① 旧实现在本测试下的 RED 现场为推演结论（现盘已是新实现，无 git 不可现场复跑旧形态——推演链每步有 JS 语义依据，R1 §4 ① 已实证同构事实）；② commit `4e1d9cc` 的 diff 全集无 git 不可枚举——以「现盘 vs R1 报告记录」零漂移抽查（§2.3）作等价收敛依据。
