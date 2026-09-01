# EVO-014 R1 Code Review — Rework 复审（R0 后小修批验证）

- **审查对象**: commit `fe0a94e`（Rework 4 文件：lib/preset-defaults.js 串行化队列段 + 三调用点 / tests/preset-defaults.mjs 新增 E·F 两节 / README.md 两处披露 / lib/service.js JSDoc 一行）
- **审查轮次**: **R1（复审）**；前轮引用：`.governance/review-report-EVO-014-R0.md`（R0 = APPROVED_WITH_NOTES，unresolved_blockers=0，P0=0 · P1=1 · P2=2 · P3=7）
- **Reviewer**: Code Reviewer Agent（与 R0 同一角色，角色定义 + code-review SKILL，只读审查）
- **证据基础**: 现盘 4 文件全文静态逐行核验 + 微任务时序推演（E1/E2 判别力证明）+ Coordinator 复跑证据（preset-defaults **37/37** exit 0；smoke **ALL PASSED** 1070+ ok / 0 FAIL exit 0）。按只读约束未自行运行命令，Coordinator 输出按 R0 §8 同标准采信（见 §9）
- **审查结论**: **APPROVED_WITH_NOTES（unresolved_blockers=0）**
- **发现计数**: **P0=0 · P1=0 · P2=1（新）· P3=1（新）** + 台账延续 P3×6（已裁定不计 unresolved）

---

## 1. R0 findings 逐条比对

| R0 finding | 级别 | R1 裁定 | 现盘证据 |
|---|---|---|---|
| F-1 播种无串行化（并发交错全局污染） | P1 | **已修复**（队列 + E1/E2 判别断言双双到位，见 §2） | `preset-defaults.js:245-250` + `:313/:334/:339` + tests `:508-550` |
| F-2 reasoningEffort 路径零断言 | P2 | **已修复**（tests F 节三断言，R0 建议四子项全齐，对现有实现全绿 = 看护闭合非缺陷修复，见 §3） | tests `:552-596` |
| F-3 fire-and-forget 分裂窗口未披露 | P2 | **已修复**（README 两处披露，见 §3） | README `:102`（串行化句）+ `:103`（分裂窗口句） |
| F-4 service.js:780 JSDoc 过时（顺带项） | P3 | **已修复** | `service.js:780`「对后续 agent/created / agent-preset/selected 事件播种生效」 |
| F-5 parent 不可查降级无披露 | P3 | 台账延续（未消解未恶化，`:274-278` 同形，B5 仍固化）——按任务裁定不计 unresolved |
| F-6 liveDefaultSelection 双份实现 | P3 | 台账延续（`:84-93` 仍在，prestep.js 未触碰） |
| F-7 composedPreset 对象分支死代码 | P3 | 台账延续（`:105` 仍在，防御性保留） |
| N-1 显式覆盖值相等固有模糊 | P3 | 台账延续（`:277-278` 同形） |
| N-2 G→G 同值写观察项 | P3 | 台账延续（C2 `saveCalls=3` 断言仍在） |
| N-3 病态 logger 理论残留 | P3 | 台账延续（`logger?.warn?.` 形态未变；与 NF-1 同后果链但触发属病态域，维持 P3） |

**节标勘误**：任务描述称 effort 断言在「E 节」——现盘测试文件 **E 节 = F-1 并发判别（E1/E2）**、**F 节 = F-2 effort（F1/F2/F3）**；内容齐全仅节标与任务描述异，按现盘为准（tests 头注释 `:28-32` 自述同映射）。

## 2. F-1 修复面核验（本轮重点）

### 2.1 队列语义四性质逐项验证（`preset-defaults.js:245-250`）

```js
let seedQueue = Promise.resolve()
const enqueueSeed = (agent, preset, target) => {
  const run = seedQueue.then(() => seed(agent, preset, target))
  seedQueue = run.catch(() => { /* 队列永不断裂 */ })
  return run
}
```

| 性质 | 裁定 | 依据 |
|---|---|---|
| **串行闭合（交错污染结构性不可能）** | ✅ | 链尾 `seedQueue` 恒为 fulfilled promise；下一 seed 严格在前一 seed settle 后启动。关键性质：seed 的恢复（restore `await`，`:220/:223`）在 seed 自身 resolve **之前**完成 → 后继 seed 的 `globalBefore`（`:172`）必然读到前驱完成恢复后的稳定值 G——R0 F-1 的污染路径（h2 读到 h1 瞬态值 P1 → 终态 P1 无告警）在结构上不可达，before/after 快照对闭合 |
| **永不 reject / 单次失败不断链** | ✅ | `seedQueue = run.catch(() => {})`——链尾永远 fulfilled，单次 seed 异常不阻断后续（第二道保险；seed 内部已近穷尽防护，见 NF-1 拒绝面分析）。链无无界增长（仅尾节点被引用） |
| **handler await 语义保持** | ✅（1 处 P2 边缘） | 三调用点结算顺序均等价（handler promise 都 settle 于自身 run 之后）；但 catch 覆盖不等价：`:313/:339` await → handler catch 覆盖成立；`:334` bare `return` → 拒绝逃逸 catch → **NF-1（§4）** |
| **subagentFixup 不进队列正确** | ✅ | `:301` 同步分派；`subagentFixup`（`:265-289`）纯 options 操作、无 await、无全局读写，与队列无共享可变状态（除 swapLogged 同步 Set，单线程无交错）——不排队正确，注释 `:243` 已声明 |

闭包生命周期：队列随 `installPresetDefaults` 闭包生灭（卸载即弃）；测试 `setup` WeakMap 按 ctx 独立安装（tests `:169-173`）→ 每测试队列隔离，E1/E2 判别不受前序污染。

### 2.2 E1/E2 判别断言守卫力（stub 时序真能复现交错？——能）

微任务级推演（stub `makeApiProxy.selectModel` 内含 `await saveSelection`，tests `:113`；E1/E2 连发 handler 不 await 第一个，tests `:522-523/:541-542`——精确复刻宿主 fire-and-forget S4）：

- **旧实现（无队列）必败**：h1 同步前缀（before₁=G → selectModel1 内瞬态写 P1 → 挂起）→ h2 同步前缀（**before₂=P1**）→ h1 恢复 G → h2 恢复 **P1** → 终态 `current=P.main` → E1 断言 `current.provider === NATIVE.provider`（`:528`）FAIL。即使 selectModel 全同步，seed 的 `await` 本身至少让出一个微任务，交错同样成立——**判别不依赖 stub 内部 await 细节**。
- **新实现必过**：seed₂ 仅在 Q₁=run₁.catch settle 后启动 → before₂=G → 终态 G（E1 另断言 `reasoningEffort === undefined`，`:530`——终态断言面 provider+model+effort 三元组，充分）。
- E2 跨事件面（agent/created + agent-preset/selected 同窗）共用同一闭包队列 → 两事件面交错同被守卫。
- 断言计数：A11+B6+C4+D11+E2+F3=**37**，与 Coordinator 37/37 exit 0 互洽。

## 3. F-2 / F-3 / JSDoc 修复面核验

- **F-2（tests F 节三断言，R0 建议四子项全齐）**：
  - **F1** 透传 + 归一：`payload.reasoningEffort==='high'`；空串归一断言为**键缺失级** `!('reasoningEffort' in payload)`（`:569`）——非弱断言 `=== undefined`，守卫力充分；
  - **F2** 仅 effort 漂移（provider/model 同值）→ drifted 命中：`saveCalls.length===2` + 恢复 payload 含原 effort（medium）+ 终态 `current.reasoningEffort==='medium'`（`:577-581`）——若 drifted 去掉 effort 判据则不恢复、saveCalls=1 必败；若 restore payload 丢失 effort 则 `saveCalls[1].reasoningEffort` 必败；
  - **F3** 重置路径（切无配置预设）→ `calls[1].payload.reasoningEffort==='low'`（`:592`）——守卫 `:189-190` 的 `effortOf(target)` 透传。
  - 对现有实现全绿（37/37）= **看护闭合非缺陷修复**，与 R0 预期一致，`P4-violation` 解除。
- **F-3（README 两处，位置与内容均合 R0 要求）**：`:102` 实现机制段补串行化队列句；`:103` **已知行为披露**段补 fire-and-forget 分裂窗口句——与既有「重启空白会话也播种」披露同级同位（正是 R0 要求的「补一句于已知行为段」）。措辞与机制核验一致：窗口内 agent.options 尚未突变（队列至少延迟一个微任务）且 picked 未播种 → 首请求路由 G；seed 完成后 options 与 picked 双双到位 → 「显示与实际路由随后自动一致」表述准确，未夸大未遗漏。
- **顺带项（service.js JSDoc）**：`:778-782` 已更正为「对后续 agent/created / agent-preset/selected 事件播种生效」——正是 R0 F-4 的一行更正建议；纯注释行零运行时影响（与 smoke 零回退互洽）。R0 F-4 关闭。

## 4. 修复面新发现

### NF-1（P2 · 正确性/错误路径）`:334` bare `return enqueueSeed(...)` —— seed 拒绝逃逸 handler try/catch（cordis 面 unhandledRejection 链）
- **位置**: `lib/preset-defaults.js:334`（onPresetSelected 已配置预设分支）
- **事实链**: ① JS 语义：try 块内 `return promise` ≠ `await promise`——`run` 拒绝时 catch 块**不执行**，async handler 直接拒绝（结算顺序与 await 等价，catch 覆盖不等价）；② seed 的现实拒绝源：`:166` `ctx.get('apiProxy')` 未包 try/catch——同文件 `:71-77/:85-93` 两处 sibling 均以 try/catch 防 `ctx.get` 抛错（作者自身模型认定可抛）；③ 该站点位于 agent-preset/selected 面——cordis emit fire-and-forget 丢弃返回值（R0 S3/N-3 已实证的后果链）→ unhandledRejection；Node ≥15 默认行为为进程终止（dsh 宿主是否安装 unhandledRejection 处理器——**未验证**）；④ 三处调用点两处 await（`:313/:339`）一处 bare return——错误路径防御不一致。
- **缓解**: seed 内部近穷尽防护（唯一现实逃逸 = `:166`，病态 logger 属 N-3 域维持 P3）；触发还需恰逢该分支；D5 类「面缺失」在测试 stub 中以 undefined 返回建模、未以 throw 建模——37/37 不触碰此路径（正是缺口不可见的原因）。
- **修复建议**: 一词——`return await enqueueSeed(...)`（或 `:166` 与 sibling 同构包 try/catch）。
- **是否新引入**: 现盘可证；无 git 不可考 R0 该行是否同形。R0 §维度1 认证表述「seed 全部 await 均在 handler try 块内被 await」与现盘该行不一致——或 R0 表述不精确，或 rework 改动了调用形态。该行属 rework 触碰面（seed→enqueueSeed），计入本轮修复面发现。
- **原则标注**: `P8-violation`（该路径失败无 warn 观测、击穿 fail-safe「不得击穿宿主」纪律）

### NF-2（P3 · 测试覆盖观察）队列兜底 catch 无注入测试
`run.catch(() => {})` 的「单次 seed 异常不断链」性质无断言看护（可经覆写 `ctx.get` 抛错注入 seed 拒绝，再断言后续 seed 仍执行）。兜底仅 3 行且失败形态良性（E1/E2 通过不依赖它）——观察项，不要求修改。

## 5. 五维度结论（rework 增量 + 全文件上下文）

| 维度 | 结论 | 要点 |
|---|---|---|
| 1 正确性 | **通过**（1 项 P2 边缘） | 队列四性质（§2.1）逐项成立；E1/E2 微任务推演证明旧实现必败（判别真）；NF-1 为错误路径边缘 |
| 2 安全性 | **通过** | rework 零新攻击面：队列无输入路径；日志模板仅标识值；无敏感数据 |
| 3 可维护性 | **通过** | 队列注释含宿主 fire-and-forget 依据（S4 锚定）与设计理由；JSDoc 已更正；无新重复 |
| 4 性能 | **通过** | 每 seed 增一跳 promise 链（事件驱动冷路径，无感）；「不介入会话过程」基准未破（D1 结构断言仍在） |
| 5 测试覆盖 | **基本通过** | 37 断言含 E1/E2 判别 + F1-F3 effort 看护闭合；缺口仅 NF-2（P3 观察） |

## 6. AI 代码专项 5 项检查（rework 增量）

| 项 | 结论 |
|---|---|
| mock 残留 | ✅ 无——队列为实现代码；stub 全隔离于 tests |
| 硬编码返回值 | ✅ 无 |
| 幻觉 API | ✅ 无——enqueueSeed 纯 promise 链，零新宿主 API 消费（宿主结论全部沿用 R0 一手实证） |
| 未实现 TODO | ✅ 无 |
| 过度实现 | ✅ 无——队列 5 行最小实现；链尾 catch 为有据第二保险且注释声明理由 |

## 7. 硬门槛裁决

| 门槛 | 阈值 | 实测 | 裁定 |
|---|---|---|---|
| P0 阻塞问题数 | = 0 | 0 | ✅ |
| 5 维度全覆盖 | 100% | 5/5 逐项有结论 | ✅ |
| 每条发现标注级别 | 100% | 新发现 2/2（P2×1/P3×1）+ 比对表 10/10 | ✅ |
| 设计一致性检查 | 已完成 | 队列仅串行化插件自身播种——用户三原则/D1 主权结构守卫均不变；R0 C1-C16 契约面零触碰 | ✅ |
| AI 专项 5 项 | 全部完成 | §6 逐项 | ✅ |

**结论: APPROVED_WITH_NOTES，unresolved_blockers=0**

- NF-1（P2）：一词修复（`return await`），建议下一个触碰该文件的任务顺手合入；可遗留（有明确修复方向与位置），遗留需记台账。
- NF-2（P3）：观察项，不要求修改。
- 台账 P3×6（F-5/F-6/F-7/N-1/N-2/N-3）延续不阻塞。

## 8. 目标锚定

plan-tracker `:63` EVO-014（P1，进行中）：用户三原则 + 事件驱动重构——本轮 rework 为 R0 findings 修复，未偏离入账范围与成功标准。

## 9. 既有验证证据采信

Coordinator 复跑（preset-defaults **37/37** exit 0；smoke **ALL PASSED** 1070+ ok / 0 FAIL exit 0）与本审查静态核验互洽：37 = R0 的 32 + E 节 2 + F 节 3，新增量与断言清单逐一对应；rework 变更面（preset-defaults 队列段+三调用点 / tests 两节 / README 两行 / service.js 注释行）与 smoke 零回退一致（service.js 仅注释、README/tests 非产品面、preset-defaults 为事件冷路径）。采信。

## 10. Reviewer 自查

未修改任何产品代码；未运行命令（全程 Read/Grep 只读 + 本报告单文件 Write）；未创建子 agent；未与用户交互。E1/E2 判别力结论基于微任务时序推演（可复查：stub selectModel `:102-115` + 连发不 await `:522-523`）；未验证项已如实标注：① dsh 宿主 unhandledRejection 处理器有无（影响 NF-1 后果严重度，不影响缺陷成立性）；② R0 该行原形态（无 git 不可考，NF-1 归类已按保守口径处理）。
