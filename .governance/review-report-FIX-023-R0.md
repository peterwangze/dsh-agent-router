# FIX-023 R0 Code Review — agents 注册表 ctx.get 解析修复（微修复）

- **审查对象**: commit `afa6ddc` 代码面：`lib/preset-defaults.js`（`agentsRegistryOf` 助手 + `onPresetSelected`/`subagentFixup` 两处 `ctx.get('agents')` 迁移 + P8 warn）+ `tests/preset-defaults.mjs`（fixture 去属性化 + H1-H3 判别）。commit 混装治理入账已由 Coordinator 认定为调度失误并采信，本轮聚焦代码面（任务简报裁定）。
- **审查轮次**: **R0（FIX-023 首轮）**；上下文：EVO-014 R0/R1/R2 已终态通过（R2 = APPROVED, unresolved_blockers=0，38/38），本轮为复验失败根因修复的首轮审查。
- **Reviewer**: Code Reviewer Agent（角色定义 `agents/code-reviewer.md` + `skills/code-review/SKILL.md`，只读审查）
- **证据基础**: 现盘 Read 静态核验（两文件全文 + `lib/index.js` inject 声明 + `lib/service.js` L1443 先例 + `lib/prestep.js` 对照）+ **宿主源码独立实证**（`@deepseek-ai/dsh-agent` / `@deepseek-ai/cordis` npx checkout）+ RED 判别集静态复算 + Coordinator 复跑证据按 R2 §9 同标准采信（preset-defaults exit 0 / smoke exit 0；计数见 F-2）
- **审查结论**: **APPROVED_WITH_NOTES（unresolved_blockers=0）**
- **发现计数**: **P0=0 · P1=0 · P2=2 · P3=2**（零阻塞；P2 为非阻塞建议，可遗留）

---

## 1. 宿主事实链独立实证（AI 专项核心：`ctx.get('agents')` 非幻觉 API）

本轮最高风险项 = 修复所依赖的宿主 API 面。Reviewer 未采信转述，直接读宿主源码逐项实证：

| # | 断言 | 宿主源码证据 | 裁定 |
|---|---|---|---|
| 1 | `'agents'` 是真实 cordis 服务名 | `@deepseek-ai/dsh-agent/lib/index.js:415-425`：`var AgentRegistry = class extends Service`，constructor `super(ctx, "agents")`（cordis Service 构造注册语义）；同文件 `:404` 文档注释 "Agent service (`ctx.agents`)" | ✅ 服务名存在，非幻觉 |
| 2 | 注册表 API = `get(sessionId)` → Agent \| undefined | 同文件 `:688-689`：`get(id) { return this.store.get(id)?.agent }`；`:432-437` typert resolve `(sessionId) => this.get(sessionId)` 证明键即 sessionId | ✅ 与 `agentsRegistryOf(ctx)?.get(sessionId)` 调用形态精确吻合 |
| 3 | `ctx.get(name)` 无需 inject 声明 | `@deepseek-ai/cordis/lib/index.js:754-764`：`Registry.get(name, strict)` 文档原文 "**Read a service from the store without the inject requirement**"，未提供/未激活返回 undefined | ✅ 修复机制在框架层成立 |
| 4 | `ctx.get` 以函数形式直接挂在 ctx 上 | 同文件 `:735-741`：`this.mixin("reflect", ["get", "set", "provide", ...])` → 助手的 `typeof ctx.get === 'function'` 守卫与真实 ctx 相容 | ✅ |
| 5 | 属性面失效根因成立 | 同文件 `:672-698` proxy get trap：非 inject 服务属性读取走 waterfall 链，失败形态为 undefined（非 runtime 回落 `reflect.get(prop,false)`）或 throw `"cannot get property ... without inject"`（runtime fiber） | ✅ 根因方向实证；实测症状（静默 return 无 warn，见任务简报双重实证）对应 undefined 路径——F-4 备注精度 |
| 6 | 修复模式先例字面吻合 | `lib/service.js:1443`：`const subagents = this.ctx.get('subagents')`（typeof 守卫同款 `:1444`）；`lib/preset-defaults.js:193` `ctx.get('apiProxy')` 宿主实测可用（create-seed ✅） | ✅ 模块注释所引先例无虚构 |

**结论**：`ctx.get('agents')` + `registry.get(sessionId)` 两层 API 均宿主源码实证存在，修复非幻觉 API。`get` 的 strict 语义（providing fiber 未激活 → undefined）由调用方 undefined 安全回落覆盖（§2.1）。

## 2. 修复面逐项核验

### 2.1 `agentsRegistryOf` 实现正确性（`lib/preset-defaults.js:114-120`）

```js
function agentsRegistryOf(ctx) {
  try {
    const registry = ctx && typeof ctx.get === 'function' ? ctx.get('agents') : undefined
    return registry && typeof registry.get === 'function' ? registry : undefined
  } catch { /* 服务查找抛错 → undefined（调用方回落） */ }
  return undefined
}
```

- ✅ **undefined 安全**：`ctx && ...` 短路（ctx 为 null/undefined → undefined）；`typeof` 守卫与 `?.` 全程无裸属性面访问。
- ✅ **try-catch 回落**：`ctx.get` 抛错（如 G1 已判别的注入面）→ undefined，绝不击穿调用方。
- ✅ **形态校验**：`typeof registry.get === 'function'` 与宿主 `AgentRegistry.get`（§1 #2）对齐， malformed 服务不采信。
- ✅ **运算符优先级**：`ctx && (typeof ctx.get === 'function')` 求值序正确。
- ✅ 与 `agentPresetsServiceOf`/`liveDefaultSelection`/prestep.js `liveDefaultSelection`（`:194-203`）同族防御惯例一致——模块风格统一。
- 调用方抛错兜底闭环：`registry.get(...)` 调用本身若抛错，两调用点均处于各自 handler 的 try/catch warn 域内（`:343-346` / `:372-335` 区域）——fail-safe 纪律保持。

### 2.2 迁移点 1：`onPresetSelected`（`:354-360`）

- 语义等价性：旧 `ctx.agents?.get(sessionId)` → 新 `agentsRegistryOf(ctx)?.get(sessionId)`。注册表可用时查找语义逐字等价（同键 sessionId、同返回 Agent|undefined）。
- P8 增量（**行为增强而非纯等价迁移，方向正确**）：agent 查不到时不再静默 return——`:358` warn `preset "${agentPreset}" default model seeding skipped: agent "${sessionId}" not found in agents registry`，**同时含 preset 与 sessionId** ✅；warn 后 return，不抛错 ✅。这直接消解属性面失效期"切换播种失效不可观测"的教训，符合项目原则 8（失败可观测）。
- 误报风险评估：`agent-preset/selected` 由 dsh-agent-presets 在切换提交后转发，会话必然在注册表（用户正在其上切预设）；查不到即异常态，warn 是正确信号而非噪音。C3（非空白纵深防御）在 agent 在场时走 requestHeader 判据，不触发本 warn——无误报路径。

### 2.3 迁移点 2：`subagentFixup` 父查找（`:301-307`）

- 惰性门控保持：`header.parentSession ? agentsRegistryOf(ctx) : undefined`——仅 subagent 路径解析注册表，主会话路径零服务查找（性能面与旧实现等价）。
- 语义等价性：注册表可用时 `get(header.parentSession)` → parent，显式覆盖保护判据（`:306-307`）逐字未动；注册表不可用 → parent undefined → 保护降级、fixup 继续（EVO-013 F-4 台账域已知边缘，注释 `:301-303` 如实披露）。
- 迁移即修复：属性面时期此保护**静默降级**（专业 agent/workflow 显式指定可能被 fixup 覆盖）——H2/B4 判别覆盖（§3.2）。

### 2.4 修复面无夹带

`seed`/串行队列/`revertOptions`/`livePresetOf`/`noteSwap` 等 EVO-014 R0-R2 已审定逻辑零改动（R2 报告行号对照无漂移）；模块头注释 FIX-023 段（`:47-56`）与实现一致。修改纯粹性（一个 commit 一个问题——代码面成立；治理入账混装为流程面，Coordinator 已认）。

## 3. 测试判别力核验

### 3.1 fixture 去属性化保真度 + H3 守卫力

- `makeCtx`（`tests:140-162`）现盘：返回对象仅 `listeners/logger/on/get` 四键，**无任何服务属性**；四个服务（agentDefaultModel/apiProxy/agentPresets/agents）一律经 `get(key)` 解析，未知键返回 undefined——与 cordis `Registry.get` 未提供语义同形（§1 #3）。
- H3（`tests:683-687`）：断言 `!('agents' in ctx)` && `ctx.get('agents') !== undefined`。守卫力裁定：**有效**——stub 为普通对象，`in` 不存在 ⇔ 读取面不存在；若 fixture 再度属性化（加回 `agents` 键），旧实现复活、H1/H2 判别力归零的同时 H3 先行 FAIL——结构防线成立。
- 精度备注（不构成缺陷）：真实 cordis ctx 的 `has` trap（cordis `:719-723`）对已声明服务名可能返回 true（`reflect.props` 全局登记），与普通对象 stub 的 `in` 语义有差异——但旧实现缺陷在**读取面**（`ctx.agents` 取值），H3 守卫的正是读取面，语义差异不影响守卫有效性。

### 3.2 H1/H2 判别力与归因唯一性

- **H1**（`:665-674`）：stub 无属性 → 旧实现 `ctx.agents` undefined → agent 查不到 → 零 selectModel → `apiProxy.calls.length===1` 必败。失败归因唯一落在注册表解析步（envelope/恢复断言由 C1/A 系独立覆盖，非混淆变量）。✅
- **H2**（`:675-682`）：旧实现 parent 查找 undefined → 显式覆盖保护跳过 → child.options 被 fixup 覆写为 SUB_MODEL → `agent.options.model === 'claude-explicit'` 必败。链上唯一变量 = 父查找步（cfg/target/突变形状与 B4 共享且 B4 同败）。✅
- **C4 强化**（`:419-426`）：旧实现静默 return 无 warn → `warnCalls.some(includes 'ghost')` 必败——P8 可观测性本身有判别（归因唯一：仅此分支产生含 sessionId 的 warn）。

### 3.3 RED 集静态复算 = 9（与 Developer 留痕精确吻合）

Reviewer 按旧实现（属性面访问）× 新 stub 逐例推演失败集：

| 失败断言 | 失败机理 |
|---|---|
| B4, C1, C2, C4, E2, F3, G1, H1, H2 | C1/C2/E2/F3/G1/H1 = agent 查不到（零播种/缺 warn）；B4/H2 = 父查找降级（覆盖保护失效）；C4 = 无 warn |

静态复算 **恰 9 项**，与"RED 9 FAIL 留痕"一致——判别测试设计意图（对旧实现必败）独立复核成立。C3/B1/B2/B3/B5/B6 在旧实现下巧合通过的机理也已核对（降级在这些用例中不可见或结果同形），无双计。

### 3.4 断言计数勘误（→ F-2）

现盘断言总数静态清点 = **41**（A11+B6+C4+D11+E2+F3+G1+H3 = 41；grep 44 匹配 − 2 处函数定义 − 1 处 dcheck 内部转发 = 41）。交叉印证：EVO-014 R2 台账为 38/38，本轮新增 H1-H3 恰 3 条 → 38+3 = **41**。任务简报所引"42/42 exit 0"计数不符（exit 0 与全绿实质不受影响）。

## 4. 同型面扫描抽验（lib/ 非 inject 服务属性访问清查）

| 名字 | 现盘使用形态 | 与 inject 对应 | 裁定 |
|---|---|---|---|
| `settings`/`typert`/`webServer` | 属性面（`lib/index.js:217/275/278/288`） | 均在 inject（`lib/index.js:47`） | ✅ 合法 |
| `agents`/`subagents`/`apiProxy`/`agentDefaultModel` | 代码面一律 `ctx.get(...)`（preset-defaults/service/wrapper/host-route/prestep/tool/oauth-llm/client 全扫）；`ctx.agents` 等仅存于注释 | 均不在 inject | ✅ 无残留 |
| `agentPresets` | **属性优先一处**：`agentPresetsServiceOf` `:82` `ctx?.agentPresets` → `:84` get 回落 + 形态校验 | 不在 inject → 属性分支恒死代码 | ⚠ F-1（行为安全，注释失准） |
| `this.ctx.<name>` 形态 | 全 lib 扫描仅 prestep.js `:191` 一处——JSDoc 引述宿主自身代码（宿主行有自身 inject），代码 `:196` 为 get 形态 | — | ✅ 非缺陷 |

**结论**：FIX-023 同型缺陷在 lib/ 无其它活跃实例；唯一属性优先残留（agentPresets）因带 get 回落 + 形态校验而行为安全，列为 F-1 注释对齐建议。

## 5. 五维度结论

| 维度 | 结论 | 依据 |
|---|---|---|
| 正确性 | ✅ 通过 | §2.1-2.4 逐项；边界（ctx null/服务缺失/形态不符/抛错）全回落 undefined；无并发/资源新面（服务查找 O(1)，惰性门控保持） |
| 安全性 | ✅ 通过 | 无新输入面；sessionId/preset 仅入日志模板插值（无注入面）；注册表只读；无敏感数据 |
| 可维护性 | ✅ 通过（F-1 遗留） | 命名表意、helper 职责单一、FIX-023 溯源注释完整；`agentPresetsServiceOf` 注释与 FIX-023 事实失准（F-1） |
| 性能 | ✅ 通过 | 零新增循环；`parentSession` 门控避免主路径服务查找；Map O(1) |
| 测试覆盖 | ✅ 通过（F-2/F-3 遗留） | H1-H3 行为判别 + H3 结构守卫 + C4 强化；RED 9 静态复算吻合；计数勘误 F-2；catch 路径无直接注入 F-3 |

## 6. AI 专项 5 项检查

| # | 检查项 | 结论 | 依据 |
|---|---|---|---|
| 1 | mock 残留 | ✅ 无 | fixture 全部 test-local；lib 无测试分支/env 门/preset 探测 |
| 2 | 硬编码返回值 | ✅ 无 | 修复路径零硬编码结果；全部经服务解析 + 形态校验 |
| 3 | 幻觉 API | ✅ 无 | `ctx.get('agents')` + `registry.get(sessionId)` 宿主源码双重实证（§1）——本轮最关键消解项 |
| 4 | 未实现 TODO | ✅ 无 | diff 面无 TODO/FIXME/stub 占位 |
| 5 | 过度实现 | ✅ 无 | 最小修复面：1 helper + 2 迁移点 + 1 warn + 3 测试断言；无防御范围外扩张 |

## 7. 发现列表

| # | 级别 | 位置 | 事实 | 影响 | 建议 |
|---|---|---|---|---|---|
| F-1 | **P2** | `lib/preset-defaults.js:74-88` | `agentPresetsServiceOf` 属性优先分支在本插件恒为死分支（'agentPresets' 不在 inject），注释仍称属性面为「事实源」 | 行为安全（get 回落 + composedPreset 形态校验），但注释与 FIX-023 确立事实相反，有诱导后来者复制属性优先模式的风险 | 注释对齐（声明本插件实际生效路径是 viaGet）或调序为 get 优先；可与 F-1 台账化遗留 |
| F-2 | **P2** | 证据记账（`tests/preset-defaults.mjs` 现盘 41 断言） | 任务简报/evidence 引「preset-defaults 42/42」；静态清点 41（R2 台账 38 + H1-H3 恰 3），§3.4 交叉印证 | exit 0 与全绿实质不受影响；治理证据数字失准违反事实红线精神 | Coordinator 复核复跑输出并修正 evidence-log 为 41/41（或注明 42 的差异来源） |
| F-3 | **P3** | `lib/preset-defaults.js:114-120` | `agentsRegistryOf` 两防御分支（registry.get 非函数 / get('agents') 抛错）无直接注入断言（H 节未覆盖 catch 路径） | 防御逻辑简单且 G1 同型先例证明注入测试可行；观察项不要求修改 | 未来可加 H4（get 抛错注入 → warn 兜底），非本轮义务 |
| F-4 | **P3** | 模块注释 `:49`「属性面恒 undefined」+ 复验台账 | ① cordis proxy 源码中 runtime fiber 非注入属性读取亦可 throw（§1 #5），「恒 undefined」为简化表述（与实测症状一致的 undefined 路径成立）；② 宿主级 switch-seed 复验待用户重启，create-seed ✅ 不经过 agents 注册表路径，不构成 `get('agents')` 的宿主级实测（其宿主级依据 = 源码实证 + subagents 先例 + H1/H2） | 均不阻塞；② 是修复验收的最后闭环 | 重启后在 evidence-log 补 switch-seed 复验结果闭环 FIX-023 |

**P0 违反条目**：无。F-1 涉及项目原则 1（事实基准）的注释精度，因行为正确定为 P2。

## 8. 硬门槛裁决

| 门槛 | 阈值 | 裁定 |
|---|---|---|
| P0 阻塞数 | = 0 | ✅ 0 |
| 5 维度全覆盖 | 100% | ✅ §5 逐项有结论 |
| 每条发现标注级别 | 100% | ✅ F-1(P2)/F-2(P2)/F-3(P3)/F-4(P3) |
| 设计一致性 | 已完成 | ✅ 与修复基准（调用时解析模式）及模块 P9 契约防御惯例一致；service.js:1443 先例字面吻合 |
| AI 专项 5 项 | 全部完成 | ✅ §6 逐项有结论 |

## 9. 审查结论

**APPROVED_WITH_NOTES**（unresolved_blockers=0）

- P0=0、P1=0 → 满足合并条件（SKILL 关闭表：P0=0 且 P1=0 → 合并）；P2×2 为非阻塞建议（F-1 注释对齐、F-2 证据计数修正），P3×2 为观察项。
- 修复机制三层验证闭合：宿主源码实证（§1）+ 现盘实现核验（§2）+ 判别测试核验（§3，RED 9 静态复算吻合）。
- 残余验收项（非本轮阻塞）：宿主重启后 switch-seed 复验（F-4 ②）——建议作为 FIX-023 关账前置证据。

## 10. 遗留项

| 项 | 级别 | 关闭条件 |
|---|---|---|
| F-1 agentPresets 注释对齐 | P2 | 下次触碰该文件时修正注释（或台账化） |
| F-2 证据计数 42→41 | P2 | Coordinator 复核 evidence-log 并修正 |
| F-3 catch 路径注入测试 | P3 | 观察项（未来 H 节扩展） |
| F-4 ② switch-seed 宿主复验 | P3 | 用户重启宿主后复验入账 |

---

*Reviewer: Code Reviewer Agent · R0 · 2025-10-24 · 只读审查，未修改任何产品代码；报告为唯一写操作（角色输出契约）*
