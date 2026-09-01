# EVO-014 R0 Code Review — 预设默认模型事件驱动重构

- **审查对象**: commit `de72e0c`（4 文件：lib/preset-defaults.js 333 行重写 / lib/index.js 注释注入段 / tests/preset-defaults.mjs 503 行重写 / README 语义段）
- **审查轮次**: R0（首审）
- **Reviewer**: Code Reviewer Agent（角色定义 + code-review SKILL，只读审查）
- **证据基础**: 现盘 4 文件全文 + 宿主一手源码逐项实证（dsh-host-apiproxy / dsh-agent / dsh-agent-loop / dsh-agent-presets / dsh-agent-default-model / dsh-subagent / cordis，npx checkout `_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\`）+ Coordinator 复跑证据（preset-defaults 32/32 exit 0；smoke 1070 ok/0 exit 0；RED 实证 20 FAIL）
- **审查结论**: **APPROVED_WITH_NOTES（unresolved_blockers=0）**
- **发现计数**: **P0=0 · P1=1 · P2=2 · P3=7**

---

## 1. 宿主契约一致性（逐项一手实证）

| # | 插件声称 | 宿主实证位置 | 裁定 |
|---|---|---|---|
| C1 | selectModel envelope `{payload:{sessionId,provider,model,reasoningEffort?}}` | apiproxy `lib/index.js:2597`（payload 解构 sessionId/provider/model/reasoningEffort） | ✅ 相符 |
| C2 | 响应 `{rpcId, result:{ok:true, value:{selected}}}` / err `code='model-unavailable'` | `:993-1001` `ok()` 助手精确回显 rpcId + result.ok/value；`:2618` ok(request,{selected})；`:2620-2627` err code "model-unavailable" | ✅ 相符 |
| C3 | 进程内面 `ctx.get('apiProxy').sessions.selectModel` | `:5529-5539` `super(ctx,"apiProxy")` + `this.sessions = api.sessions`（ApiProxyService） | ✅ 相符 |
| C4 | selectModel 内部副作用 = picked 写入 + saveDefaultModelSelection 全局瞬态写（失败仅 warn 包容） | `:2612` `selectionFor(found.agent).current = selected`（picked setter `:1707-1709`）；`:2613-2617` `await defaults.saveDefaultModelSelection?.(selected)` + catch→warn | ✅ 相符 |
| C5 | **恢复链同源**：插件恢复用 `ctx.get('agentDefaultModel').saveSelection`，与 selectModel 内部全局写是同一持久层 | `:5532-5533` `saveDefaultModelSelection: (sel) => ctx.agentDefaultModel.saveSelection(sel)`（构造器桥接同一服务）；dsh-agent-default-model `types/index.d.ts:48/55`（`currentSelection(): ModelSelection` / `saveSelection(next): Promise<void>`） | ✅ 相符（恢复写不会被宿主覆盖） |
| C6 | agent/created payload `{agent}`、Scoped 事件 | dsh-agent `runtime-types.d.ts:146`；`lib/index.js:666-670` `args=[carrier,"agent/created",{agent}]` | ✅ 相符 |
| C7 | resume 路径同样触发 | agent-loop `:1285` resumeWith → `:1308` `setupAndPublish(…,"resume")`；`:1245` startup 同一函数 | ✅ 相符 |
| C8 | 同步抛错 veto 发布；async 拒绝被包容为 warn | dsh-agent announce `:671-677`：dispatch 循环无 sync catch（同步抛错冒泡=veto）；`Promise.resolve(returned).catch(→warn)`；runtime-types.d.ts:139 文档明示 | ✅ 相符——插件 async+try/catch 双保险**充分**（async 函数同步段异常自动转 rejection，catch 全包后必然 resolve：既不 veto 也不触发 unhandledRejection） |
| C9 | enter() 先落注册表再 announce → 监听器运行时 `ctx.agents.get(session.id)` 已可查（子代理 fixup 查父可用性） | dsh-agent README L20/L51 + `:583`（register=enter+announce）+ `:688` get；宿主 dsh-subagent 自用同款上溯（`lib/index.js:1095-1097`） | ✅ 相符 |
| C10 | agent-preset/selected 为非 scoped 双参 `(sessionId, agentPreset)` | dsh-agent-presets `lib/index.js:870` / `invariant.js:829` `ctx.emit("agent-preset/selected", session.id, event.data.agentPreset)`；`types/types.d.ts:12` 签明 | ✅ 相符 |
| C11 | 已产出会话不可切预设（宿主锁）→ 插件 requestHeader 判据是纵深防御 | dsh-agent-presets README:51（网关传输层执行 `agent-preset-locked`） | ✅ 相符 |
| C12 | agent.options 为 plain object、可变、每次 create/resume 新建；deepFreeze 仅 seedConfig | agent-loop `:354` `this.options = options`（引用直存）；`:703/:752` deepFreeze 只作用于 seedConfig/request | ✅ 相符（冻结形态防御=防宿主演进，B6 有测试） |
| C13 | 空白会话 buildRequest 现读 options | agent-loop `:697-707`（`route = {provider: this.options.provider, model: this.options.model}` → seedConfig） | ✅ 相符 |
| C14 | 子代理无 api-proxy selectionFor → 请求纯 options（seedConfig）驱动；改 child.options 即改请求模型 | dsh-subagent 全库无 selectionFor（grep 实证）；child options 由 `resolveChildAgentOptions`（`child-agent.js:51-61`）= parent.options 展开 + `...requested` 后覆盖 + subagentDepth 构建 | ✅ 相符 |
| C15 | 显式覆盖判别：`child.options ≠ parent.options` = 显式指定 | `child-agent.js:59` `...requested` 字段级后展开覆盖 → 不一致 ⇔ requested 显式指定（continuation 路径同构 `:780-781` `request.agentOptions?.provider ?? parent.options.provider`） | ✅ 相符（值相等固有模糊见 N-1） |
| C16 | header.origin='subagent' / header.parentSession 字段 | `child-agent.js:86-89` `parentSession: parentHeader.id, origin: 'subagent'` | ✅ 相符 |

**审查补充的关键宿主事实（Developer 声称之外，影响正确性评估）**：

- **S1（主会话路由权威 = picked）**：apiproxy 不注册 agent/request 瀑布（grep 零匹配）；主会话路由由 `installModelSelection`（dsh-agent `lib/index.js:272-303`，apiproxy `:1712` 安装）实现——scoped `agent/request` 监听把 `selection.assembled`（picked 快照）**覆盖**到 seedConfig 之上（`:287-298`：provider/model 强制覆盖 + selected 无 effort 时**清除**继承 effort + 有 effort 时透传）。因此插件「options 突变 + selectModel」双写策略与宿主两层路由精确互补：selectModel 成功 → picked=P.main → 请求路由 P.main（`:294-295`）；err 分支 picked 未写（`:2620` return 先于 `:2612`）→ 路由回落 getter 第三层 live 默认 G + options 已回滚 G → **显示/请求一致零动作闭合**（细化 b 的正确性依据）。
- **S2（effort 契约）**：agentDefaultModel README:「reasoningEffort 属于 Settings 分节……完整保存的选择必须能在下一个选定模型没有 reasoning 强度时清除旧值」——直接支持细化 c 的 drifted 三元组判据（effort 变化=漂移）与 restore payload 完整透传。envelope 侧 `:2597/:2605` reasoningEffort 透传 + `ReasoningEffortId` 校验实证。
- **S3（cordis 裸 emit 语义）**：cordis `lib/index.js:280-282` `emit` 同步调用、不 catch、不 await——agent-preset/selected 的 listener 若**同步抛错**会冒泡到 dsh-agent-presets 的 session/event 分发处（`invariant.js:827-830` 无保护）破坏预设切换后续流程。插件 handler 为 async 函数（同步段异常自动转 rejection 不冒泡）+ try/catch 全包（必然 resolve）→ 对该裸 emit 面**充分安全**。
- **S4（fire-and-forget 时序）**：dsh-agent announce（`:673-677`）与 cordis emit（`:281`）均不 await 监听器——事件发出后宿主不等待 seed 完成。两个后果分别立项为 F-1（并发恢复交错）与 F-3（分裂窗口披露）。
- **S5（selectionFor 空白会话第三层读 live 全局默认）**：apiproxy `:1697-1705` getter：picked → requestHeader → `defaults.defaultModelSelection()`（= live 全局默认）。播种瞬态窗口内（save(P.main)→restore 之间）其它新建空白非预设会话可读到 P.main——README「瞬态毫秒级」披露成立。

## 2. 三处规范细化逐条裁定

| 细化 | 裁定 | 依据 |
|---|---|---|
| **a. 面可用性预检提前到一切突变之前**（apiProxy 缺失 → 完整零动作 + warn） | **通过——与设计意图一致，不引入新风险** | 预检（`preset-defaults.js:166-171`）先于 globalBefore 读取、options 突变、selectModel 全部三步；避免「options 已突变而显示不跟随」的分裂形态——fail-closed 精神（EVO-013 R0 F-2 同判）的合理延伸。D5/D6 测试覆盖服务缺失与形态漂移双形态。 |
| **b. selectModel 错误分支回滚 options 突变** | **通过——显示/请求一致零动作，逻辑与宿主两层路由闭合** | err 信封（`:200-205`）与面抛错（`:194-198`）双分支均 `revertOptions`；配合 S1：err 时 picked 未写（宿主 `:2620` 先于 `:2612` 返回）→ 请求层回落 live 默认 G、options 回滚 G、显示层 G——三层一致。A11 测试固化（model-unavailable → 回滚 + warn + 零全局写）。restore 尽力而为 + 吞错有外层 warn 语义兜底（`:233-239`）。 |
| **c. reasoningEffort 纳入漂移检测三元组 + 重置路径透传** | **机制通过、看护缺口（F-2）** | 机制与宿主契约一致：drifted 三元组（`:125-129`）有 S2 宿主依据；seed envelope effort 透传（`:189-190`）对齐 `:2597/:2605`；restore payload 完整透传 `effortOf(globalBefore)`（`:214-216`）；重置路径 seed(agent, preset, global) → selectModel(reasoningEffort) → picked 含 effort → installModelSelection `:296` 透传到请求。**但 32 断言零覆盖 effort 路径**（grep 实证：reasoningEffort 仅出现于注释与 stub 解构，无任何断言）——细化为 P4/P-v2 原则 4（测试看护）缺口，见 F-2。 |

## 3. 设计基准（用户三原则 + 裁决）对照

| 基准 | 裁定 | 证据 |
|---|---|---|
| 1. 模型跟随预设变更事件；移除 agent/request 介入（D1 守卫必须存在且有效） | ✅ 达成 | D1 断言（`tests:406-413`）精确守卫：events.length===2 且含两预设事件且 **不含 agent/request** 且各恰 1 监听——守卫力充分（非仅「不包含」弱断言）。全库 grep：`agent/request` 仅存于注释（preset-defaults:8 / index:262 / prestep:152 / service:780），无任何 `ctx.on('agent/request')` 注册。 |
| 2. selectModel 播种 + 全局默认瞬态写回恢复（fail-closed：globalBefore 不可读不播种；恢复失败重试一次+高声告警） | ✅ 达成（F-1 并发边缘除外） | A10 fail-closed（不可读→跳过+warn）；A3 净变化为零；D3 重试一次成功无告警；D4 重试仍败高声告警（含手动改回指引+原全局值+双次错误串）；C5 同源恢复链宿主实证。 |
| 3. subagent 纯 options 修正（零 selectModel/零全局写）；显式覆盖永不碰 | ✅ 达成 | B1 断言零 selectModel 零全局写；B4 显式覆盖（≠）不碰；判别宿主依据 C15。值相等固有模糊见 N-1（P3，无信号可区分，事件驱动裁决的固有代价）。 |
| 4. 用户主权结构化：无模型变更监听；播种仅预设事件；已产出会话零动作 | ✅ 达成 | D1 结构断言 + 全库 grep 无模型变更监听（llm/adapters-updated 为适配器拓扑事件、用途合法且系既有注册非本次引入）；A6/C3 requestHeader 判据双路径；C11 宿主锁 + 插件纵深防御分层成立。 |

## 4. 五维度结论

### 维度 1：正确性 — 通过（1 项 P1 边缘）
- seed 三步时序（预检→globalBefore→options→selectModel→恢复）逐步验证正确；modelSet/effortOf/drifted（含 null 边界）判据正确；revertOptions 双分支回滚闭合（S1 三层一致）；subagentFixup 继承链与「父早于配置」边缘自洽（child.options 快照语义 + fixup 兜底）；onAgentCreated/onPresetSelected 的 async+try/catch 覆盖**所有** await 路径（seed 全部 await 均在 handler try 块内被 await，rejection 被 handler 级 catch 捕获；seed 内部各危险分支另有局部处理——三层防护）。
- **F-1（P1）**：并发播种交错可致全局默认恢复到中间瞬态值（详见发现清单）。

### 维度 2：安全性 — 通过
无新攻击面：无输入注入路径（日志模板拼接仅 provider/model 标识值）；无敏感数据硬编码；无权限面变化（进程内面沿用宿主授权）；观测去重 Set 有界（SWAP_LOG_LIMIT 512，超限整体清空再记一轮——P8 语义不受损）。

### 维度 3：可维护性 — 通过（P3×2）
模块职责单一（333 行单文件：服务查找/判据/seed/fixup/handler 分层清晰）；注释质量高（每决策点含宿主行号锚定）；命名可读。P3：service.js:780 JSDoc 过时（F-4）；liveDefaultSelection 双份实现延续（F-6 台账）。

### 维度 4：性能 — 通过
事件驱动零 per-request 开销（对照 EVO-013 每请求瀑布判别——热路径开销消除）；handler 毫秒级、无循环无 N+1；swapLogged 有界。

### 维度 5：测试覆盖 — 基本通过（1 项 P2 缺口）
32 断言覆盖面：A1-A11 主会话播种全路径（含 fail-closed/错误回滚/兜底链/防御）/ B1-B6 subagent 全象限 / C1-C4 切换跟随+双防御 / D1-D11 主权+卸载+恢复重试+高声告警+面漂移+fail-safe+开关+热更+去重。stub 保真度高：makeApiProxy 精确复刻 envelope 校验、unavailable 分支、saveDefaultModelSelection 的 catch-warn 包容（`:107` 同构宿主 `:2613-2617`）；makeDefaults 复刻 attempts 独立计数（重试不重复命中失败注入）。RED 判别力实证（旧实现 20 FAIL）。**缺口**：effort 路径零断言（F-2）；并发交错无测试（随 F-1 修复补）。

## 5. AI 代码专项 5 项检查

| 项 | 结论 |
|---|---|
| mock 残留 | ✅ 无——实现代码零 mock/测试桩代码；测试 stub 全部隔离于 tests 文件 |
| 硬编码返回值 | ✅ 无 |
| 幻觉 API | ✅ 无——消费的全部宿主 API 逐一实证（C1-C16 + S1-S3：apiProxy face/sessions.selectModel/agentDefaultModel.currentSelection+saveSelection/ctx.agents.get/双事件名/payload 形态/header 字段/announce 语义）；无一处凭空 API |
| 未实现 TODO | ✅ 无 |
| 过度实现 | ✅ 无新增——composedPreset {id} 对象分支为死代码（F-7 台账延续，防御性保留）；SWAP_LOG_LIMIT 有界防扩是合理防御非过度 |

## 6. 发现清单

### F-1（P1 · 正确性/并发）播种无串行化——并发事件交错可致全局默认静默污染
- **位置**: `lib/preset-defaults.js:162-231`（seed 全函数；无互斥）
- **事实链**: ①宿主两个事件分发面均不 await 监听器（S4：dsh-agent announce `:673-677` fire-and-forget；cordis emit `:281`）→ 近同时的两个预设播种事件（重启连续恢复多个空白预设会话 / 毫秒窗内双会话创建或快速连续切换预设）的 handler **并发执行**；②h2 的 `globalBefore`（`:172`）可读到 h1 的瞬态值 P1（h1 save 完成→h1 restore 完成之间）；③交错终态推演：h1 restore(G) 先落 → h2 读 after=G ≠ before=P1 → h2 恢复 **P1** 而非 G → **全局默认终态 = P1（预设模型）且无任何高声告警**（两个 handler 自身恢复链都「成功」）。
- **影响**: 违反设计基准 2 的验收口径（「全局默认持久值不改，除恢复失败告警披露的降级」）——本缺陷产生的是**未披露且不可观测**的全局污染，劣于已披露降级形态。原则标注：`P7-violation`（设置数据污染风险）/`P8-violation`（静默无观测）；AUDIT-001 并发审计同域延续。
- **缓解因素**: 触发窗口毫秒级且需两个播种事件恰好交错（人手操作 ~100ms 级间隔通常错过）；后果可手动恢复（设置改回）；重启恢复批量 resume 是否真并发取决于宿主前端行为（未实证）。
- **建议修复**（二选一，均小改）：(1) 模块级播种队列（闭包内 `let queue = Promise.resolve()`，seed 调用链式排队——串行化后 before/after 对必然闭合）；(2) restore 前重读 live 默认比对（仍非原子，建议 (1)）。随修复补并发交错判别断言（stub 注入延迟 save 交错复现）。

### F-2（P2 · 测试覆盖）reasoningEffort 路径零断言——细化 c 无判别看护
- **位置**: `tests/preset-defaults.mjs`（全文件；grep 实证 reasoningEffort 仅存于 `:18` 注释、`:99/:106` stub 解构）
- **事实**: drifted 三元组判据（provider/model/effort）、seed envelope effort 透传（`:189-190`）、restore payload effort（`:214-216`）、重置路径 effort——全部无断言。若未来重构破坏 effort 透传（如 `:190` 条件被误删），32 断言全绿不报警。
- **建议**: 补 3~4 断言：配置含 effort → envelope 含 effort；globalBefore 含 effort → 恢复 payload 含 effort；仅 effort 差异 → drifted 命中（触发恢复）；effort 归一（空串=未设置）。`P4-violation`（产品行为变更无测试看护——细化 c 为声称的功能面）。

### F-3（P2 · 文档/时序披露）fire-and-forget 分裂窗口未在 README 披露
- **位置**: `README.md`「已知行为披露」段（L103）；机制根源 S4
- **事实**: 事件不被宿主 await → agent 发布完成后 seed 才推进；若首请求在 seed 完成前发出（程序化创建+立即 prompt），assemble 快照（`installModelSelection:274-276`）读到未播种的 picked → 首请求路由 G 而显示随后变 P.main（或反之）。毫秒级窗口、人手操作不可达。
- **建议**: README 已知行为段补一句（与既有「重启空白会话也播种」披露同级），或随 F-1 修复评估可否在 seed 内补偿（分裂形态自愈：显示与请求终将一致，仅首请求一次路由偏差）。非机制缺陷——事件驱动裁决的固有代价，缺的是披露。

### F-4（P3 · 可维护性）service.js:780 JSDoc 过时
- **位置**: `lib/service.js:778-782`（presetDefaults 注释）
- **事实**: 「设置页保存后无需重启即对后续 **agent/request 瀑布**生效」——EVO-014 已移除 agent/request 消费，消费点已变为两个事件监听。注释误导后来者（prestep.js:152 的 agent/request 表述描述宿主机制，无恙）。
- **建议**: 一行更正为「对后续 agent/created / agent-preset/selected 事件播种生效」。

### F-5（P3 · 台账核对）EVO-013 F-4 延续——parent 不可查时降级无披露，风险面缩小
- **位置**: `lib/preset-defaults.js:255-259`
- **核对结论**: **未消解**。parent 不在注册表 → 显式覆盖保护跳过、直接 fixup（B5 测试固化），无日志披露。较 EVO-013（每请求降级）风险面缩小为创建时一次性，且「子代理创建时父几乎必然 live」（resolveChildAgentOptions 需要 parent）——真实触发面极窄。建议台账降级延续 + 可选一行 debug 日志。

### F-6（P3 · 台账核对）EVO-013 F-6 延续——liveDefaultSelection 双份实现未去重
- **位置**: `lib/prestep.js:194-203` 与 `lib/preset-defaults.js:84-93`（逐字同构，仅注释异）
- **核对结论**: **未消解、未恶化**。本重构使 preset-defaults 侧的这份实现承担 fail-closed 关键判据（globalBefore）+ 恢复链，双份漂移风险较 EVO-013 略升。台账延续（v0.4.2 批次），共享导入去重方案不变。

### F-7（P3 · 台账核对）EVO-013 F-7 延续——composedPreset {id} 对象分支死代码
- **位置**: `lib/preset-defaults.js:105`
- **核对结论**: **未消解**。宿主签名实证 `composedPreset(agentCtx): string | undefined`（dsh-agent-presets `types/index.d.ts:196` + README:18）——对象分支按当前宿主恒不可达。防御性保留无害，台账延续；若宿主未来引入复合预设对象形态则转为必要防御。

### N-1（P3 · 讨论）显式覆盖判别的值相等固有模糊
requested（agentOptions）恰与 parent.options 同值时判为「继承」→ fixup 覆盖为 P.sub。无信号可区分（requested 不持久于 child header）；语义损失极小（显式指定通常伴随 ≠）；事件驱动裁决（subagent 纯 options 修正）的固有代价。与 EVO-013 请求层 picked 判别力相比是已知降级——记录不要求修改。

### N-2（P3 · 观察）重置路径 G→G 同值写是真实持久化调用
C2 路径（切到无配置预设）经 selectModel 触发宿主 saveDefaultModelSelection(G)——挂载 settings provider 时为真实写盘 + 可能触发 settings/updated 事件。无害（同值）、测试已明确固化（saveCalls=3）、代码注释已标注（`:316-317`「G→G 写为同值无害」）。观察项：若未来 settings/updated 消费者对同值写敏感再评估。

### N-3（P3 · 讨论）病态 logger 理论残留
catch 块内 `ctx.logger?.warn?.(...)` 若 logger.warn 自身抛错（可选链防 undefined 不防抛错）→ handler reject → agent/created 面 warn 路径兜底（C8）/ agent-preset/selected 面 cordis emit 丢弃返回值 → unhandledRejection。极低概率（病态 logger 场景），不要求修改。

## 7. 硬门槛裁决

| 门槛 | 阈值 | 实测 | 裁定 |
|---|---|---|---|
| P0 阻塞问题数 | = 0 | 0 | ✅ |
| 5 维度全覆盖 | 100% | 5/5 逐项有结论 | ✅ |
| 每条发现标注级别 | 100% | 10/10（P1×1/P2×2/P3×7） | ✅ |
| 设计一致性检查 | 已完成 | §3 四基准对照 + §2 三细化裁定 + C1-C16 契约表 | ✅ |
| AI 专项 5 项 | 全部完成 | §5 逐项 | ✅ |

**结论: APPROVED_WITH_NOTES，unresolved_blockers=0**

- P1×1（F-1）：强烈建议**本轮修复**（串行化小改 + 并发判别断言）；按 skill 关闭规则可申请遗留（有明确修复方向与计划），遗留则必须记录跟踪表关闭截止。
- P2×2（F-2 effort 断言 / F-3 披露）：建议随 F-1 一并小修批（同文件域，无独立排期价值）。
- P3×7：台账延续/观察项，不阻塞。

## 8. 既有验证证据采信

Coordinator 复跑三组（preset-defaults 32/32 exit 0 / smoke 1070 ok 0 FAIL exit 0 / RED 20 FAIL）与本审查静态逐行核验互洽（32 断言清单逐一比对实现路径；smoke 零回退与「纯新增事件模块 + index 注释段」变更面一致）；RED 判别力与「旧实现无事件监听 → 事件断言全败」机制相符。采信。

## 9. Reviewer 自查

未修改任何产品代码；未运行命令（全程 Read/Grep/Glob 只读 + 本报告单文件 Write）；未创建子 agent；未与用户交互。宿主结论全部锚定一手源码行号，无「经验上没问题」类断言；未验证项（宿主前端重启恢复是否并发 resume——影响 F-1 触发概率评估，不影响缺陷成立性）已如实标注于 F-1 缓解因素。
