# FIX-025 Code Review R0 —— 空白判据与宿主同构（sessionNeverProduced）

> Reviewer: Code Reviewer Agent（R0）· 只读审查（read/grep/glob，零命令、零代码修改）
- **审查对象**: commit `a80e935`（lib/preset-defaults.js +59 / tests/preset-defaults.mjs +108）——现盘审查（Read 现盘 = 审查态）
- **工作目录**: `D:\AI\agent\deepseek\plugins\router`
- **宿主事实源**: npx cache `node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js`（一手源码实读）
- **缺陷基准**: Coordinator EV-130（采信）：宿主空白判据 `!session.events.some(turn/start)` vs 插件旧 requestHeader 判据更严 → 老无消息会话（独立事件不开启 turn）宿主可切、插件漏播种
- **日期**: 2026-09-01（会话内）

## 结论速览

| 项 | 值 |
|---|---|
| **审查结论** | **APPROVED** |
| **unresolved_blockers** | **0** |
| 发现计数 | P0×0 · P1×0 · P2×0 · **P3×3**（全部台账级，不阻合并） |

---

## 1. 同构精确性核验（审查重点 1）✓

**宿主原文（一手实读）** `dsh-host-apiproxy/lib/index.js:1187-1189`：

```js
function sessionBlank(session) {
	return !session.events.some((event) => event.type === "turn/start");
}
```

- 插件注释声称的行号（preset-defaults.js:69/169「L1187-1189」）与宿主实盘**逐字精确吻合**；types bundle 副本 `lib/types/api-proxy.js:356-358` 同语义互证；宿主旁证 `applySessionListMetadata`（index.js:1191-1197）同样以 `turn/start` 为唯一"开启"判据——宿主确实只认 turn/start。
- **插件实现**（preset-defaults.js:182-186）：

```js
function sessionNeverProduced(agent) {
  const events = agent?.session?.events
  if (Array.isArray(events)) return !events.some((event) => event && event.type === 'turn/start')
  return agent?.session?.requestHeader?.() ? false : true
}
```

- **同构判定**：events 可读分支谓词 `!events.some(e => e.type === 'turn/start')` 与宿主在**全部宿主合法输入**（events 为 SessionEvent 数组）上语义恒等。差异仅 `event &&` 真值守卫——宿主对 null 元素会抛 TypeError（宿主非法态），插件按"非 turn/start"处理（J5 判别守卫）。这是**防御性超集**，不构成 parity 破坏，且已在注释（:850-851）与 J5 标签中如实声明。
- **回落链方向**：events 非 Array（形态漂移）→ `requestHeader?.()` 真值 ⇒ `false`（判已产出 → 不播）。方向正确——宁漏播（空白会话少一次播种）不误播（接管已产出会话 = 击穿宿主 agent-preset-locked 锁定语义），与修复基准"保守正确"一致。回落语义注释（:177-180、:832-834）与实现一致。

## 2. 消费点完整性核验（审查重点 2）✓

- **两处替换到位**：`sessionNeverProduced` 全库恰两个消费点——preset-defaults.js:403（`agent/created` 主会话路径）与 :435（`agent-preset/selected` 路径），即旧 requestHeader 判据的全部空白判别位。
- **grep 无残留**：lib 全域 `requestHeader` 命中仅 preset-defaults.js:185（回落链本体）+ 注释，及 prestep.js:166/179。**prestep.js 用途定性核实**：`sessionProvider`/`sessionModel`（prestep.js:164-187）读 `header.config.provider/model` 作**会话实际路由判定**（FIX-010 域），非空白判别——与任务书声明一致。
- **subagentFixup 不经判据复核**：onAgentCreated :398 `if (header.origin === 'subagent') return subagentFixup(...)` 先于 :403 判据——子代理路径（纯 options 修正 + 显式覆盖保护 :372-375）设计上不触空白判别，正确（子代理无会话产出语义；显式覆盖保护即其守卫）。B1-B6/H2/I5 六组测试看护该路径。
- lib 全域 `turn/start` 命中仅 preset-defaults.js——无第三处判别消费点遗漏。

## 3. 测试核验（审查重点 3）✓（含 P3-1 计数口径）

**J1/J2 判别力（RED 判别）**：fixture 形态 = 独立事件无 turn/start + **陈旧 requestHeader 真值**（tests :806-820/:821-831）。旧判据（header 真值即跳过）→ 零 selectModel → J1/J2 必败；新判据 → 播种 → 绿。判别点选取精确命中缺陷机理。fixture 保真度加分项：J1 events 含 `{ type: 'agent-preset/selected' }`——与宿主切换时自 append 的事件（index.js:3260）同型，即用户报障场景（切过预设但无消息的会话）的真实事件形态。

**J3/J4 回落守卫**：events 显式移除 + header 真值 → 不播（:835-849），两事件面各一。回落正向路径（events 缺失 + header null → 播种）由 A7/A8 隐式看护（makeAgent 无 events 键 + `requestHeader: () => null`）——回落双方向均有覆盖。

**J5 元素防御**：`[null, 'garbage', { noType: true }]`（:852-858）→ 谓词真值守卫不炸、按无 turn/start 播种。

**A6/C3 修订语义**：events 含 turn/start + header 真值 → 零动作（:304-314/:448-457），语义与"宿主 agent-preset-locked 拒绝切换"对齐；注释如实标注为负向守卫（非判别断言）。fixture session 补 `events: []`（:199-214/:248-254）与真实 Session 形态对齐。

**断言计数**：静态清点 = **51 断言**（48 dcheck + 3 check：A11+B6+C4+D11+E2+F3+G1+H3+I5+J5）。任务书"50/50"与静态计数差 1 → P3-1（计数口径留痕，非代码缺陷）。

## 4. 宿主契约核验（审查重点 4）✓

- **`session.events` 存在且为数组——同源 + 类型双实证**：①宿主 `sessionBlank` 直接 `session.events.some(...)`（index.js:1188，:3250 对 `agent.session` 消费）——同属性同源实证；②Session 类型契约 `get events(): readonly SessionEvent[]`（dsh-session typert 声明，dsh-goal/dsh-commands/dsh-cordis-host-runner/dsh-file-reference/dsh-session-reference 五包 typert.host.js 一致）。插件 `Array.isArray` 前置守卫超出宿主假设（宿主直接假定数组），方向安全。
- **元素形态 `{type}`** ✓：SessionEvent 契约含 `type`；宿主谓词 `event.type`；fixture 同型。
- **`requestHeader(): EpochHeader | undefined`** ✓：dsh-session/lib/types/index.d.ts:225 声明 + lib/index.js:1497 实现；宿主侧消费先例 dsh-agent-loop lib/index.js:695/731——回落链调用的是真实宿主 API，非幻觉面。`undefined` 返回态与回落反演（falsy → 判空白 → 播种）语义相容。

## 5. AI 专项 5 项（审查重点 5）✓

| 项 | 结论 |
|---|---|
| mock 残留 | 无——stub 仅存于 tests（应然）；lib 零 mock |
| 硬编码返回值 | 无——判据纯数据驱动 |
| 幻觉 API | 无——`session.events`/`requestHeader()`/`turn/start` 均经宿主一手源码/类型声明实证（§4） |
| 未实现 TODO | 无——diff 域零 TODO |
| 过度实现 | 无——helper 两分支最小实现；回落链为已声明的形态防御（宿主演进防御，P-v2 原则 9 同向），非冗余泛化 |

## 6. 五维度结论

| 维度 | 结论 | 依据 |
|---|---|---|
| 正确性 | ✓ 通过 | §1 同构恒等 + 回落方向保守正确；fail-safe 完整（判据异常由 handler 顶层 try/catch 兜底 warn——:413-416/:445-448） |
| 安全性 | ✓ 通过 | 纯进程内只读判别 + 既有播种面（前轮已审）；无新增输入面/注入面；保守回落防误接管 |
| 可维护性 | ✓ 通过 | 注释含宿主行号级事实源与判别点推导（:165-181）；命名达意 |
| 性能 | ✓ 通过 | `some` 短路线性扫描，与宿主同复杂度；O(events) 每事件一次，无热点 |
| 测试覆盖 | ✓ 通过 | J1-J5 判别 + 守卫；A6/C3 负向；fixture 形态对齐宿主（§3）；判别矩阵唯一不可达象限见 P3-2 |

## 7. 发现列表（P0×0 / P1×0 / P2×0 / P3×3）

- **P3-1（证据口径）** 断言计数不一致：任务书/复跑证据记"preset-defaults 50/50"，审查态静态清点为 **51 断言**（48 dcheck + 3 check，§3）。exit 0 不受影响、非代码缺陷；建议 Coordinator 留痕时以复跑输出行数为准（tracker 先例：N-2 断言数留痕模板 / EVO-010"计数口径"P3）。
- **P3-2（覆盖观察）** 判别矩阵「events 含 turn/start + requestHeader 缺失/null」象限无测试（该形态新判据判产出、旧判据误播）。真实宿主不可达：每 turn 持久化 header（dsh-agent-loop:695/731），A6 注记亦自陈"requestHeader 真值为真实已产出会话形态"。台账即可，不要求补测。
- **P3-3（加固可选）** 回落分支 `requestHeader?.()` 若遇非函数形态漂移（如对象）将抛 TypeError，依赖 handler 顶层 catch 兜底（warn 可观测、零动作，fail-safe 成立）。prestep 同域为先局部 try/catch（prestep.js:165-168）风格；可选将来对齐，不阻塞。

## 8. 硬门槛裁决

| 门槛项 | 阈值 | 实测 | 裁决 |
|---|---|---|---|
| P0 阻塞数 | = 0 | 0 | ✓ |
| 5 维度全覆盖 | 100% | 5/5（§6） | ✓ |
| 发现分级标注 | 100% | 3/3 均带 P 标 | ✓ |
| 设计一致性 | 已完成 | 与 FIX-025 tracker 行 + EV-130 基准一致：同构判据/保守回落/两消费点/判别测试全兑现；无越域修改（lib 变更仅判据域） | ✓ |
| AI 专项 5 项 | 全完成 | §5 全绿 | ✓ |

## 9. 结论

**APPROVED**（unresolved_blockers=0）——sessionNeverProduced 与宿主 sessionBlank 同构精确（宿主一手源码逐行对照成立），回落链方向保守正确，两消费点替换完整无残留，测试判别力与守卫充分，宿主契约三方实证，AI 专项五项零违例。P3×3 入台账（计数口径 / 覆盖观察 / 可选加固），均不阻合并。

> 附注（Coordinator 动作项）：本报告为审查产出物；结论行需经 review-record 机器持久化（本审查只读约束下未执行命令）。
