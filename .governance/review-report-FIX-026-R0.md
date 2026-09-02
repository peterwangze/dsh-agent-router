# FIX-026 R0 Code Review 报告——单一路径收敛（客户端直驱 + 服务端 emit 死路径删除）

> Reviewer: Code Reviewer Agent（只读审查，未修改产品代码，未运行命令）
> Round: **R0**（首轮） · Task: FIX-026 · Commit: `98299e5`（现盘审查）
> 审查对象: lib/client.js（+42 客户端直驱）/ lib/preset-defaults.js（-43 emit 死路径删除）/ tests/client-render.mjs（FIX-026 断言块）/ tests/preset-defaults.mjs（I 节判别反转）
> 结论: **APPROVED_WITH_NOTES**（unresolved_blockers=0）· 发现计数: **P0×0 / P1×0 / P2×1 / P3×5**

---

## 1. 修复基准核验（用户裁决链对照）

| 基准 | 实现事实 | 判定 |
|---|---|---|
| EV-132 真机反证：FIX-024 服务端 emit 链不可达 | preset-defaults.js:59-65 头注 + :301-304 原位注记如实记载演进（「源码推演通过、真机实证失败」），种子成功路径零 emit | ✓ 事实链一致 |
| P-v3 原则 5：单一路径收敛 + 旧路径删除 | 服务端 `ctx.emit('llm/adapters-updated')` 与 `notifyModelDirectoryRefresh` helper 全删（repo grep 零可执行残留，见 §3）；客户端订阅为唯一插件显示刷新路径 | ✓ 收敛成立 |
| 修复形态 = `$on('agent-preset/selected')` → `directoryFor(sessionId).load()` | client.js:4489-4512 逐行符合；宿主契约三方行号抽验全吻合（见 §2） | ✓ 无幻觉 API |

## 2. 宿主契约抽验（Reviewer 独立实读宿主 bundle——非转抄 Developer 证据）

宿主包实读位置：`C:\Users\peter\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\`。

| # | 契约 | 宿主实证（Reviewer 亲读） | 判定 |
|---|---|---|---|
| 1 | 转发白名单首项 | `dsh-api-remotes/lib/index.js:18-30` `API_REMOTE_FORWARDED_EVENTS`，`"agent-preset/selected"` 恰为首项（:19）；头注明确「this array is … the legal key set of `ctx.remote.$on`」，payload = 宿主事件实参列表 verbatim | ✓ |
| 2 | 事件双参形态 | `dsh-agent-presets/lib/index.js:870` `ctx.emit("agent-preset/selected", session.id, event.data.agentPreset)`——(sessionId, agentPreset) 两参与插件监听器签名一致 | ✓ |
| 3 | `$on` 宿主同款先例 | 宿主自带客户端插件同用此面：`dsh-client-ui-skill/lib/client.js:310`、`dsh-client-ui-commands/lib/client.js:536`、`dsh-client-ui-agent-preset/lib/client.js:1637` | ✓ |
| 4 | `ctx.get('modelDirectories')` 可解析 | `dsh-client-ui-model-selection/lib/client.js:170` `super(ctx, "modelDirectories")`（cordis Service 根级注册，inject=['connection','sessions','remote']）——与本插件 apply() 既有 `ctx.get('connection')`（client.js:4410）/`ctx.get('conversation')`（:4454）同机制同根 ctx；`package.json:23` `dsh.client.inject` 含 `@deepseek-ai/dsh-api-remotes`（提供 `ctx.remote.$on`，既有 $on 面已验证） | ✓ |
| 5 | directoryFor 同步 throw 形态 | 宿主 `:187-193`：`sessions.scope(sessionId) === void 0` → 同步 `throw new Error("ui-model-selection: session \"…\" resolved no scope")`——与产品 catch 注释及测试 stub 错误文案逐字一致 | ✓ |
| 6 | load 只读幂等 + 失败保留 | 宿主 `:45-74` `async load()`：generation 守卫（:47 `++this.generation` / :53 比对）；失败仅写 `store.error` 保留上次好状态（:57-63）；数据源 `sessions.models({ sessionId })`（:52）；subagent 不可用经 `assertAvailable()`（:135-137）在 async 内抛 → 拒绝形态 | ✓ |
| 7 | 显示更新链 | 宿主 `:292` ModelSelect 经 `useSyncExternalStore` 订阅 directory store；刷新源 = `ctx.remote.$on("llm/adapters-updated")` + `$on("settings/document-updated")`（:175-179）+ 目录打开时 load()（load 头注「both entries call this on open」）——预设切换三者皆不触发，与缺陷定性一致 | ✓ |
| 8 | 宿主自身 refresh 的容错同构 | 宿主 :176 `directory.load().catch(() => void 0)`——宿主自身对 load 拒绝即静默；插件 `.catch(() => undefined)`（client.js:4495）与宿主语义同构 | ✓ |

## 3. 审查重点逐项结论

### 3.1 P5 收敛完整性 —— ✓ 成立

- **emit 残留扫描**（lib 全量 grep `\.emit\(|ctx\.emit|notifyModelDirectoryRefresh`）：零可执行残留。全部命中为：注释性历史记载（preset-defaults.js:61/:302、client.js:4476、index.js:229、oauth-llm.js:12/:439、wrapper.js:20/:261/:480）。
- **`llm/adapters-updated` 监听器语义辨析**：wrapper.js:554 / oauth-llm.js:507 的 `ctx.on('llm/adapters-updated', sync)` 与 client.js:1822 的 `$on` 属 **provider 热增删/插件设置页数据刷新**动作域，非「预设切换显示刷新」动作——P5 约束同一动作的路径收敛，不禁止不同动作消费同一宿主事件。**非第二路径**。
- **settings/document-updated 自然链裁定**（审查重点要求的语义辨析）：宿主 ModelDirectoryResolver 对该事件的 refresh 是**宿主自身既有行为**（宿主订阅面，:175-179），插件未注册、未维护、不可确定性驱动（FIX-024 RCA 已证同值写不触发）——属宿主平台基底，非插件并行路径。**裁定：不算第二路径，P5 不违反**。
- **单一订阅**：lib 内 `agent-preset/selected` 订阅恰一处（client.js:4509）。
- **死路径删除完整性**：`notifyModelDirectoryRefresh` 全仓零残留；种子成功路径（preset-defaults.js:232-305）以 FIX-026 注记收尾，无任何显示刷新残留。

### 3.2 客户端契约 —— ✓ 成立（一处 P3 观察）

- 可解析性/白名单/双参形态/同款先例：见 §2 表 #1-4。
- **throw 容错两形态**：(a) 无 scope 同步 throw（宿主 :193）→ 外层 try/catch 捕获 + console.warn 含 sessionId（client.js:4502-4507，测试场景 3 判别）；(b) subagent 会话 `assertAvailable` 异步拒绝（宿主 :135-137）→ `.catch(() => undefined)` 吞掉，与宿主自身 refresh 面（:176）语义同构、属预期无动作（subagent 会话宿主本就不提供模型选择）——P3-3 记录观察。
- **$on 生命周期**：`offPresetSelected` 挂 `ctx.effect` 卸载（client.js:4510-4512），与既有 catalog 轮询 effect（:4467-4470）同款模式；热重载时旧 fiber 卸载触发退订，无重复订阅面。测试场景 4 断言退订 + 卸载后派发零触发。
- **主路径短路/保底分支**：load 可用即 return（:4496）；服务面 undefined / directoryFor 返回非对象 / load 非函数 → 保底（:4498-4501）；directoryFor 同步 throw → 保底**不**触发（subagent 会话直连 sessions.models 会被宿主拒绝——场景 3 断言 `sessionModelsCalls.length === 0` 判别正确）。

### 3.3 判别力 —— ✓ 成立

**client-render.mjs FIX-026 断言块（:1725-1797），实际 check 计 11 条、四组**：
1. 订阅装配（:1736）——旧实现（无订阅）必败 RED；
2. 主路径三连 + 幂等（:1749/:1750/:1751/:1756）——恰一次、参数正确、零保底、连切 1:1 无放大；
3. 保底降级（:1765/:1766）——服务不可达 → 保底 RPC 恰一次含 sessionId、零 load 误触；
4. 防御与卸载（:1783/:1784/:1792/:1795）——同步 throw 捕获不炸 + warn 含标识、退订置 inactive、卸载后派发全静默。
判别基准成立：无订阅的旧实现对第 1-3 组全部必败；派发器 `active !== false` 门（:1740）显式模拟宿主总线退订语义（注释声明，非伪装产品行为）。

**preset-defaults.mjs I 节判别反转（:737-802）**：
- I1（成功路径）/ I3（重置路径）改零 emit 负向守卫——旧实现（恰一次 emit）必败 RED；
- **I4「记录+抛错」注入设计验证**：`ctx.emit` 被替换为「先 push 记录、后 throw」（:786），注入发生于 fireCreated 之前、模块对 `ctx.emit` 均为调用点属性访问（无安装期闭包捕获）——**复活实现即使自带 try/catch 吞掉 throw，`emitted` 记录已先落账**，`ctx.emitted.length === 0` 仍必败。判别面确实强于单纯恰一次断言，「防复活」目标成立。残余盲区（复活走非 `ctx.emit` 面）为理论情形，ctx.emit 是 FIX-024 先例的唯一规范复活面，不构成 finding；
- I2/I5 保留负向语义（失败分支 / subagent 边界零信号）✓；无残留的 FIX-024 正向 emit 断言（头注 :66-73 记载反转，ALL PASSED 复跑佐证无陈旧正向断言）。

### 3.4 既有零回退 —— ✓ 成立（采信 Coordinator 复跑）

- preset-defaults.mjs 全节现存核对：A1-A11（播种/envelope/fail-closed/回滚）、B1-B6（subagent 纯 options/显式覆盖/冻结防御）、C1-C4（切换/重置/C4 P8 warn）、D1-D11（**D1 无 agent/request 主权回归守卫在位**、D2 卸载器、D3/D4 恢复重试链）、E1-E2（串行化）、F1-F3（effort 透传/漂移判据）、G1（unhandledRejection 兜底）、H1-H3（ctx.get('agents') + stub 保真守卫）、J1-J5（同构判据/回落守卫/事件元素防御）——语义均未被本提交触及。
- 门控证据：Coordinator 复跑 preset-defaults ALL PASSED exit 0 + smoke ALL PASSED exit 0（本审查按只读约束不重复执行，采信并留痕）。

### 3.5 AI 专项五项 —— 全部完成

| 项 | 结论 |
|---|---|
| mock 残留 | 无——测试 stub 均为判别目的构造；console.warn 注入后 finally 复原（client-render:1775-1781） |
| 硬编码返回值 | 无 |
| **幻觉 API** | **零**——modelDirectories 注册/directoryFor/load 签名/generation 守卫/no-scope 文案/白名单/uSES 逐一宿主行号亲读吻合（§2 全表）；「与 connection 同机制」的机制论证成立（同为根级 cordis Service + 同一 apply ctx 既有解析先例） |
| 未实现 TODO | 无 |
| 过度实现 | 轻微一处 → P3-2（保底 RPC 结果弃置，「可观测」表述过strong） |

## 4. 发现列表

### P2-1 · tests/served-client.js 镜像未同步——CONTRIBUTING.md:21 检查项违规（漂移为既有起源，本提交延续未修）

- **位置**：tests/served-client.js（4248 行 vs lib/client.js 4584 行）；缺 FIX-026 装配块（:4176 目录轮询 effect 直接衔接 :4177 safeRegister，无 :4471-4512 对应物）；亦缺 EVO-013 presets 卡片（`presetsTitle`/`agentPresets` 零命中）与 FIX-022 域名面。
- **事实依据**：CONTRIBUTING.md:21 现行规则「修改 lib/client.js 后已同步渲染测试镜像 Copy-Item … -Force」；本提交改 lib/client.js +42 行未同步。断代证据：镜像含 FIX-018（mainModelImage :119、capabilitySig :3519）/AUDIT-001（imageRef :3776/:4084-4096）/FIX-021（directAssetUrlOf id 兜底 :3755-3773）内容 → 漂移起点 = EVO-013（97b04ac）起，**非本提交引入**；本提交延续未修。
- **影响面（如实界定）**：零运行时影响——package.json:11 `"./client": "./lib/client.js"` 锚定实际下发面（含 FIX-026）；五个测试套件默认全部直读 lib/client.js（client-render:18、fix-012:162、audit-001:203、smoke:62、routing-paths:905），served-client.js 零默认消费面（与 FIX-018 R0 P2-2 判定一致）。危害 = 治理面：提交清单既定检查项失效 + 判别面假 RED 风险（FIX012_CLIENT_SOURCE/AUDIT001_CLIENT_SOURCE 环境变量指向该镜像时）。
- **修复建议**：本轮内一行 `Copy-Item lib\client.js tests\served-client.js -Force` 全量重同步（同 FIX-018 P2-2 → d52b716 先例，随任务收尾闭环，不触发复审）；中期按 FIX-012 R0 P3-3 建议在 smoke 加字节级一致性断言，终结三副本手工同步（已两次出险：FIX-011 域、FIX-018、本次延续）。
- **级别依据**：与 FIX-018 R0 P2-2 同类同级（P2 建议——不阻塞合并，原则上本轮修改）；零消费面事实防止升 P1。

### P3-1 · 断言计数口径——client-render FIX-026 实际 11 条 check（任务口径「十断言」）

- 位置：tests/client-render.mjs:1736-1795。11 = 订阅 1 + 主路径 3 + 幂等 1 + 保底 2 + 防御/warn 2 + 卸载 2。建议证据留痕按 11 权威计数，防后续 EV/审查链计数漂移（与前例「计数口径」台账同类）。

### P3-2 · 保底路径「可观测」表述与实现不符（轻度过实现）

- 位置：client.js:4498-4501。保底 `api.sessions?.models?.({sessionId})` 结果弃置（`.catch(() => undefined)`、返回值不消费、无日志）——注释称「仅维持可观测（证明订阅与分发链路活着）」，实际生产环境无任何可观测出口（仅测试桩可断言）。建议：注释改为「判别面专用（测试可断言分发链路），生产零显示零日志」或补一行 console.info；或评估径直删除保底（modelDirectories 为宿主根级常驻服务，absent 属宿主形态漂移，P8 warn 比静默 RPC 更符合原则 8）。不阻塞。

### P3-3 · subagent 形态 load 异步拒绝静默吞（P8 措辞语境观察项）

- 位置：client.js:4495。宿主 assertAvailable（宿主 :135-137）在 async load 内抛 → 插件 `.catch(() => undefined)` 雙静默。与宿主自身 refresh 面（宿主 :176）语义同构、属预期无动作（subagent 无模型选择面），**非缺陷**；但在「失败与降级 MUST 可观测（原则 8）」语境下记观察项：当前 catch 对「预期无动作」与「意外失败」不分——如需收紧可只对非 subagent 形态的意外拒绝补 warn。维持现状可接受。

### P3-4 · 客户端 load 与服务端 seed 的理论竞窗

- 同一 `agent-preset/selected` 事件双端消费：服务端 seed（进程内 selectModel，微任务级）与客户端 load（事件转发过线 + RPC 回程，网络 RTT 级）并发——极端调度下 load 可能读到 seed 前的旧 current。自愈边界：宿主两个选择器入口「打开即 load()」（宿主 load 头注），重开选择器即刷新；且网络 RTT ≫ 进程内播种，实际竞窗概率可忽略。**P10③ 真机 GUI 显示证据是本链路的终局验收**（已在任务验收计划内），本条仅留痕推演边界，不要求修改。

### P3-5 · 治理台账滞后——triage FIX-026.json 未随用户裁决扩围更新

- `.governance/change-triage/FIX-026.json` reason 仍为扩围前口径「保留服务端 emit 作纵深」（与已实现设计相反），files 缺 lib/preset-defaults.js / tests/preset-defaults.mjs（扩围后实际触碰面）。plan-tracker FIX-026 行已如实记载追加范围；建议 Coordinator 补一条扩围注记（机器记录 Point-in-time 特性可注记不强改），保持证据链自洽。另：triage side_effect 因「真机」措辞触发 R1 WARN——本提交开发过程无 agent 侧真实环境操作，真机验证为用户动作，无需 R1 三选一。

## 5. 硬门槛裁决

| 门槛 | 阈值 | 实测 | 判定 |
|---|---|---|---|
| P0 阻塞问题数 | = 0 | 0 | ✓ |
| 5 维度全覆盖 | 100% | 正确性（§2/§3.2/§3.3）/安全性（见下）/可维护性（注释-实现一致性 ✓，P3-2 表述项）/性能（幂等 1:1 无放大断言 ✓，无 N+1）/测试覆盖（§3.3/§3.4） | ✓ |
| 每条发现标注级别 | 100% | P2×1 + P3×5 全标注 | ✓ |
| 设计一致性 | 已完成 | 与用户裁决链（EV-132 反证 → P-v3 原则 5 收敛 → FIX-012 已验证客户端模式复用）逐条对照 §1；第二触发器语义辨析完成（§3.1，宿主自然链裁定非插件路径） | ✓ |
| AI 专项 5 项 | 全完成 | §3.5 | ✓ |

安全性补充：新代码无凭据/敏感数据接触；console.warn 仅含 sessionId/preset 标识；订阅处理器全程 try/catch + fire-and-forget catch，异常零外泄（不破坏宿主事件分发）。

## 6. 结论

**APPROVED_WITH_NOTES**（unresolved_blockers=0）

- 零 P0/P1；P2-1（镜像同步）为提交清单既定规则项，按 FIX-018 d52b716 先例随本轮收尾一行闭环（Copy-Item 重同步），不构成返工面、不触发 T1 复审；P3×5 入台账。
- 用户真机验收（P10③）保持任务既定口径：重启 DSH → 切换预设 → composer 模型选择器显示即时跟随（本轮修复的显示层证据只能由真机 GUI 提供，API/测试层证据不可替代）。
