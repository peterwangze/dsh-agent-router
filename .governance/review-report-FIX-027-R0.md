# Review Report — FIX-027 R0（客户端服务注入规范声明）

> Reviewer: Code Reviewer Agent（软件项目治理工作流 v0.78.0）
> 日期: 2026-09-02 · Round: **R0**（首轮）
> 审查对象: commits `8c4cfc5` + `6d5e357`（lib/client.js inject 扩展 + 双形态解析 + 遥测；tests/client-render.mjs fixture 门控保真度 + 断言；tests/served-client.js 镜像同步）——Read 现盘审查
> 缺陷基准: EV-134（采信）——FIX-026 状态层/部署层全对而显示仍断，根因嫌疑 = 客户端 `ctx.get('modelDirectories')` 裸解析（无 inject 声明；mock 保真度第四次同型）
> 角色约束遵行: 只读审查。本轮未修改任何产品代码；仅按角色输出格式生成本报告文件。只读 shell 检查仅用于只读取证（宿主包文件定位 / Select-String / Get-FileHash），无任何写操作、未执行测试。

---

## 0. 结论

## **APPROVED_WITH_NOTES**（unresolved_blockers=0）

- P0 = 0 · P1 = 0 · P2 = 0 · P3 = 6（全部台账级，见 §4）
- 修复基准（EV-134）三点修复面（inject 声明 + 双形态防御 + 遥测）逐项实证成立；宿主先例锚点全部独立抽验吻合；FIX-026 十一断言语义零回退；镜像 hash 一致。

---

## 1. 审查重点逐项裁定

### 1.1 inject 声明正确性 — ✅ 成立

| 检查项 | 事实依据（本轮独立抽验） | 判定 |
|---|---|---|
| 声明位置/形态与宿主先例同构 | `lib/client.js:4418` `const inject = ['slots','locale','connection','remote','modelDirectories']` + `:4598` `exports.inject = inject` —— 与宿主 dsh-client-ui-model-selection `lib/client.js:729-736` 模块级 `const inject = [...]` + `:799` `exports.inject = inject` **完全同款形态**（其 required services 同样含他方提供的 sessions/connection，注释所述类比成立） | 同构 ✓ |
| `:157-161` 类内声明先例引用准确 | 宿主 `ModelDirectoryResolver` `static inject = ["connection","sessions","remote"]`（:157-161）——服务自身 required 声明形态；插件注释引用行号/内容逐一相符 | 锚点准确 ✓ |
| 服务注册面 | 宿主 `super(ctx, "modelDirectories")`（model-selection lib/client.js:170）——`ctx.modelDirectories` 属性面确实由该服务提供 | ✓ |
| 激活等待语义（就绪等待） | cordis 核心实证：`lib/index.js:1316-1327` `_refresh()` 任一声明服务缺 impl → epoch=INACTIVE（apply 不执行）；服务提供后经 `:825-842` notify → `_checkImpl` → `_refresh` → `_reload` 激活。runner `lib/client.js:581` `waitingFor` 按 fiber.inject 过滤 = 激活后状态投影。**声明即同时获得「就绪等待 + 属性面可见性」两点保证，注释声明与机制相符** | ✓ |
| 属性面门控 | runner `dynamicCordisContext` `lib/client.js:313-314`（doc："ctx.get performs optional lookup; direct ctx.serviceName access is gated by the fiber's inject declaration"）、`:320`（declared 集合）、`:335`（get → `readService(name, false)` 非门控）、`:342`（属性 → `readService(prop, true)` 门控）——与插件注释锚点逐一相符 | ✓ |
| **观察项 1 裁定：激活等待对宿主标准图内置服务的部署耦合** | 声明后 modelDirectories 成为插件客户端 fiber 的**激活硬依赖**：宿主标准图若未来缺失该 provider（ui-model-selection 移除/改名），插件 apply 恒不执行 → 整面 UI（settings/composer/toolview/ModelTakeover）不挂载。**裁定：可接受，入台账（F-1）**。理由：①与既有 'slots'/'locale'/'connection'/'remote' 声明同耦合类（均为宿主内置面）；②失败形态可见（settings 区块消失 + runner waitingFor 状态投影），非静默腐化；③modelDirectories 由宿主核心件 model-selector 提供，移除本身即宿主破坏性变更域 | 可接受 + 台账 |

### 1.2 双形态解析 — ✅ 语义精确

`lib/client.js:4516-4517`：`const viaGet = ctx.get('modelDirectories'); const directoryService = viaGet !== undefined ? viaGet : ctx.modelDirectories`

| 边界 | 行为 | 判定 |
|---|---|---|
| viaGet = undefined（服务缺失） | 落属性面（声明后可见或 undefined，不 throw——真实 runner 声明名属性访问不触发 rejectGuard） | ✓ |
| viaGet = null（病态服务值） | `null !== undefined` → 取 viaGet=null → `null?.directoryFor?.()` → undefined → 保底分支，零崩溃 | ✓ 边界安全 |
| 服务值为合法对象 | 直接使用，属性面不触碰 | ✓ |
| 两形态守卫一致性 | runner `:327` 单一包装路径 `denyContext(ctx.get(name))` 同时服务 get 与属性面——两形态返回同等守卫包装，无语义差 | ✓ |
| 失败路径遥测完整性 | 形态解析失败 → `fallback-rpc` warn（:4529，RPC 前）；directoryFor 同步 throw → `error` warn（:4535）；主路径 → `load` info 含解析形态（:4523）。**唯 load() 异步拒绝无独立遥测行**（发起即记 'load'；失败观测依赖宿主 store.error / option.loadError 行）→ P3 F-2，不阻塞（缺陷域是服务解析而非 load 执行，且宿主 UI 已承载 load 失败观测；代码注释 :4520-4521 如实披露该取舍） | ✓ + P3 |

### 1.3 fixture 门控保真度 — ✅ 裁定：接受保守形态

事实盘点（tests/client-render.mjs:447-452/464-477 vs 宿主 runner :335/:342）：

1. **偏差 A**：fixture `get` 按声明门控（未声明 → undefined）；真实 runner `get` = **非门控**可选查找（:335）。fixture 比真实**更严**。
2. **偏差 B**：fixture 属性面未声明时返回 undefined；真实属性访问未声明时 **rejectGuard throw**（:342 + cordis :675-687）。fixture 比真实**更宽**（但修复后 modelDirectories 恒已声明，此形态在新代码下不可达，仅影响旧代码 RED 形态的精度）。
3. Developer 已如实披露 get 非门控而 fixture 采用保守门控。

**裁定：接受。** 理由：
- **复现根因**：RED 判别成立——旧 inject（无 modelDirectories）下 fixture get 落空 → 保底 RPC → 场景 1 断言与结构守卫（:1771）必败；EV-134 症状类（裸 get 解析 undefined → 只读保底不更新显示）被确定性复现。真实机器上 get 落空的真实机制（服务未就绪/隔离域差异）由场景 2 `'absent'` 模式独立覆盖（两形态皆 undefined → 保底）。
- **双形态防御在任一真实形态下成立**：真实形态空间 = {get 可达（场景 1 ✓）/ get 落空+属性面可达（场景 1c ✓）/ 两形态皆缺（场景 2 ✓）/ directoryFor 同步 throw（场景 3 ✓）}——生产代码对四种形态行为一致且均有断言与遥测；fixture 保守门控不改变生产代码在真实形态下的任何行为。
- **回归网更强**：保守形态下，inject 声明或属性兜底任一缺失即判败（真实非门控 get 下声明缺失可能假绿）——对本缺陷域（第四次 mock 保真度同型）是更安全的取舍。
- 两处偏差已在 fixture 注释如实披露（:447-452/:464-466/:474-477）→ P3 F-4 台账留痕。

### 1.4 既有零回退 — ✅ 成立

- **FIX-026 十一断言全数在位且语义未弱化**：client-render.mjs :1788（订阅装配）/:1802（directoryFor 恰一且参数正确）/:1803（load 恰一）/:1804（主路径零保底 RPC，短路语义——新代码 :4524 return 保持）/:1811（连切 1:1 无放大）/:1834（保底 RPC 恰一含 sessionId）/:1835（保底路径零 load）/:1847（throw 捕获不炸且不误触保底 RPC）/:1848（warn 可观测）/:1858（卸载退订）/:1861（卸载后派发全静默）——11/11，与 FIX-026 R0 记录语义一致。
- fixture 改造（get 门控/属性面/getMiss 模式）不影响既有断言面：apiMock、$on active 标记、effect cleanup 捕获、remote.mount 契约检查（:492-495）全部保留；新 get 门控下 `remote.router`（声明 'remote'）与 `connection` 均可达，`conversation`（可选 get）前后行为一致。
- 遥测捕获器（:1773-1786）try/finally 恢复 console.info/warn，无泄漏；产品代码异步 `.catch(() => undefined)` 不产生捕获窗口外噪声。
- **镜像同步机械验证**：`lib/client.js` 与 `tests/served-client.js` SHA256 **逐字节一致**（`0F0AAB66…C2FF8`），FIX-027 块行号（:4406/:4502-4512）双侧对齐。
- Coordinator 复跑证据：smoke ALL PASSED exit 0、preset-defaults ALL PASSED exit 0（任务简报提供，本轮未复跑——只读约束）。

### 1.5 AI 专项 — ✅ 五项全过（见 §3）

### 1.6 补充核验（本轮独立完成）

- **属性面声明完备性**：client.js 全部 ctx 属性面访问（locale :4421/:4424、remote :4425/:4448、slots :4450+、modelDirectories :4517）均已在 inject 声明；`ctx.get('conversation')` 为可选查找（合法，消费面容忍 undefined）。无未声明属性面残留。
- **转发事件锚点**：`agent-preset/selected` 实证为宿主 dsh-api-remotes `API_REMOTE_FORWARDED_EVENTS` **第 0 项**（host remote-events.d.ts:16 / lib/index.js:18-19）——订阅面合法。
- **双形态先例引用**：`agentPresetsServiceOf`（lib/preset-defaults.js:100-108）实读——属性面优先、get 回落、形态校验；client.js 为 get 优先、属性面兜底的**镜像形态**，注释自述（:4513-4514「镜像形态」）与实况相符。
- **P5 单一性**：FIX-026 订阅仍是唯一显示刷新路径（服务端 emit 死路径保持删除态）；FIX-027 仅在既有 handler 内改解析面，零路径新增。

---

## 2. 五维度逐项结论

| 维度 | 结论 | 依据 |
|---|---|---|
| 1 正确性 | ✅ 通过 | 双形态 undefined/null 边界精确（§1.2）；try/catch + optional chain 全路径防护；激活门控语义 cordis 源码实证；事件分发链零外泄（场景 3） |
| 2 安全性 | ✅ 通过 | 无新输入面；遥测仅含 sessionId/preset id/解析形态（非敏感标识，无凭据/路径/内容）；无注入面变化 |
| 3 可维护性 | ✅ 通过 | 注释锚定详实且经独立抽验全部准确；P5 单点保持；镜像 hash 一致；telemetry 局部函数职责单一 |
| 4 性能 | ✅ 通过 | 零新增轮询/监听/timer；双形态解析 O(1)；遥测 O(1) 同步 console |
| 5 测试覆盖 | ✅ 通过 | 四场景 + 幂等 + 双形态防御 + 结构守卫 + 三路遥测断言；RED 判别逻辑成立（保守门控下旧代码必败）；FIX-026 十一断言零回退 |

## 3. AI 代码专项 5 项

| # | 检查项 | 结论 |
|---|---|---|
| 1 | mock 残留 | ✅ 无——产品代码零 mock；fixture stub 为测试域且宿主形状锚定（:170/:187/:193/:443 load 形状） |
| 2 | 硬编码返回值 | ✅ 无新增 |
| 3 | 幻觉 API | ✅ 无——全部宿主面实证：modelDirectories 注册（model-selection :170）、directoryFor（:187）、no-scope throw（:193）、waitingFor（runner :581）、gating（:335/:342）、FORWARDED_EVENTS 首项（remote-events.d.ts:16）、cordis 激活门控（cordis lib :1316-1327/:825-842） |
| 4 | 未实现 TODO | ✅ 无隐性 TODO——服务端遥测上行为**显式延期**并注明理由（client.js :4503-4505「不为遥测新造 RPC 面拆分职责」；F-6 台账候选） |
| 5 | 过度实现 | ✅ 无——修复面最小（1 个服务名声明 + 双形态解析 + 3 个遥测点 + 既有保底保留）；无新 RPC、无新依赖、无路径新增 |

## 4. 发现列表（P0=0 / P1=0 / P2=0 / P3=6）

| # | 级别 | 位置 | 描述 | 建议 |
|---|---|---|---|---|
| F-1 | P3 | lib/client.js:4418 | **部署耦合台账**：modelDirectories 成为客户端 fiber 激活硬依赖——宿主标准图未来若缺失该 provider，插件整面 UI 不挂载（可观测：settings 区块消失 + runner waitingFor 投影）。与既有四项声明同耦合类，当前宿主标准图含该服务，裁定可接受 | 入 risk/观察台账；宿主升级 parity 检查时纳入「inject 声明服务存在性」项 |
| F-2 | P3 | lib/client.js:4522-4523 | 遥测为「发起」语义：load() 异步拒绝不产生独立遥测行（'load' 已于发起时记录）；load 失败观测依赖宿主 store.error（宿主 UI option.loadError 行承载） | 后续可链 `.then/.catch` 补 load-ok/load-failed 两行遥测；不阻塞 |
| F-3 | P3 | lib/client.js:4529 | 保底 detail 文案 `'modelDirectories service unavailable'` 同形覆盖「服务在但 directoryFor/load 形状不符」——诊断文案轻度不精确 | 可改 detail 携带实际缺失形状；纯诊断文案级 |
| F-4 | P3 | tests/client-render.mjs:447-477 | **fixture 保守门控偏差台账（本报告 §1.3 裁定接受）**：get 面比真实 runner 严（真实非门控 :335）；属性面未声明返回 undefined 而真实 throw（:342）——两偏差已注释如实披露；生产代码行为在任一真实形态下不变 | 台账留痕；后续如需字节级 runner 同构可在 fixture 引 runner 语义常量 |
| F-5 | P3 | tests/client-render.mjs（计数口径） | 任务简报称「8 断言」；实数 **FIX-027 标签 check() = 6**（:1771/:1806/:1823/:1824/:1837/:1850）+ FIX-026 保留 11 = 块内 17。覆盖面与判别力不受影响（结构守卫/三路遥测/双形态/全部场景均在） | 计数口径差异如实入账（建议任务摘要以实数为准） |
| F-6 | P3 | lib/client.js:4502-4505 | 遥测目前仅浏览器 console 上行（用户 F12 可见）；服务端上行面显式延期（理由成立：不为遥测新造无语义 RPC） | 服务端可观测上行入后续任务候选（与 v0.4.2 批次台账合并评估） |

## 5. 硬门槛裁决

| 门槛项 | 阈值 | 实测 | 裁定 |
|---|---|---|---|
| P0 阻塞问题数 | = 0 | 0 | ✅ |
| 5 维度全覆盖 | 100% | 5/5 有结论（§2） | ✅ |
| 每条发现标注级别 | 100% | 6/6 均有 P 级（§4） | ✅ |
| 设计一致性检查 | 已完成 | 与 EV-134 修复基准三点一致；宿主先例（model-selection 模块级 inject + exports.inject + :752 属性面）同构；FIX-026 契约零偏移 | ✅ |
| AI 专项 5 项 | 全部完成 | 5/5（§3） | ✅ |

## 6. 项目质量原则标注

- 无 P1-P10 违反。**P10④（桩锚定宿主源码）正面达成**——第四次 mock 保真度同型缺陷以声明门控 fixture 修正收口，宿主面锚点全部实证。
- P4（测试看护零回退）达成：十一断言保留 + 六新断言 + 结构守卫；P5（单一路径）达成：唯一显示刷新路径保持，零路径新增；P8（失败可观测）达成：三路遥测覆盖解析/降级/错误。

---
*审查依据：角色定义 agents/code-reviewer.md + skills/code-review/SKILL.md；证据 = 本报告所引现盘文件行号（只读取证）。Review 结论机录（REVIEW 行）由 Coordinator 持久化。*
