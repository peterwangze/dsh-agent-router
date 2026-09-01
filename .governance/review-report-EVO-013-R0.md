# Code Review 报告 — EVO-013 预设 Agent 默认模型配置

- **round**: R0（首轮；无前轮引用）
- **审查范围**: `de101c0..08e0461`（3 提交：`2ab27d6` 机制 + 判别测试；`97b04ac` 设置页卡片 + render/smoke 断言；`08e0461` README 使用指南）
- **审查对象文件**: lib/preset-defaults.js（新 176 行）、lib/schemas.js、lib/service.js、lib/index.js、lib/client.js、package.json、tests/preset-defaults.mjs（新 308 行）、tests/client-render.mjs、tests/smoke.mjs、README.md
- **Reviewer**: Code Reviewer Agent（只读审查；本报告文件是唯一写操作）
- **证据基础**: 逐行读全部改动文件 + 宿主源码实证（DSH checkout `C:\Users\peter\AppData\Local\npm-cache\_npx\1e7f6d9597241db0`，逐 API 核对，见 §宿主契约一致性）+ Coordinator 复跑的测试证据（preset-defaults 23/23、client-render exit0、smoke 功能面 1056 ok/0 FAIL、全套件 17/18 exit0）

---

## 一、五维度逐项结论

### 维度 1：正确性 — 通过（1 项 P2、多项 P3 备注）

`lib/preset-defaults.js` 逐行核对设计规格，判定链与规格逐字对齐：

| 规格条款 | 实现位置 | 判定 |
|---|---|---|
| 主权条件① main.provider/model 齐备 | L143 `modelSet(cfg.main)`（provider+model 同时非空串） | ✅ |
| 主权条件② 会话无 requestHeader 即直通 | L145 `agent.session.requestHeader?.()` 存在即 return | ✅ 与宿主 dsh-agent-loop `buildRequest` L695 同源（首请求落盘 request/header 后本条永久直通——换入恰只发生于首请求，与"新会话以它为默认"语义一致） |
| 主权条件③ resolved 与全局默认一致才换入 | L148-149 `liveDefaultSelection` 比对 provider/model，不一致直通 | ⚠️ 见 F-2（live 不可读时 fail-open） |
| subagent 未设→继承 main；main 未设→不介入 | L154-155 target 三态 | ✅ |
| 显式 agentOptions 永尊重 | L158-162 child.options ≠ parent.options 即直通 | ✅ 判定链与宿主 `resolveChildAgentOptions`（dsh-subagent L501-512：child = parent.provider/model/maxTokens + requested 覆盖）精确同构——provider/model 任一不同 ⇔ 有 requested 覆盖；⚠️ parent 查询失败时保护降级，见 F-4 |
| resolved ≠ child 自身 seed → 尊重（防御宿主演进） | L166 与 agent.options 比对 | ✅ |
| enabled 总开关/条目开关门控序 | L128（service.isEnabled 首行）→ L140（cfg.enabled === false） | ✅ 与现有总开关语义一致（关路由=整个插件关闭），settings scope 热读取（service.presetDefaults L783-786 每次重读） |
| preset 解析降级（服务缺失/抛错/异步形态） | L54-62 双形态服务查找（ctx.agentPresets 属性 / ctx.get 兜底）、L84-93 live→header 兜底 | ✅ 同步 try/catch 全覆盖；composed 返回 Promise 时按"落空"处理 → header 兜底（宿主真实签名为同步 `string | undefined`，见 §契约） |
| fail-safe 异常不击穿请求链 | L169-173 整段 try/catch + warn；`await next()` 在 try 外（上游异常正确透传，与 prestep.js L223-225 同构） | ✅ |
| 观测去重（SWAP_LOG_LIMIT=512 清空重打） | L115-124 闭包 Set；`{preset}\u0000{sessionKey}` 键；超限 clear 后本轮最多重打一遍 info | ✅ 有界内存语义如注释所述；测试未覆盖溢出边界（F-5c） |
| 返回值形状 `{...resolved, provider, model}` | L151/L168 | ✅ 展开保序，reasoningEffort/maxTokens 等字段保留（P2b 断言锁定）；宿主 L701 的 effort 语义不受影响 |

瀑布次序实证（决定本机制是否成立的关键事实）：cordis `waterfall` 语义为"先注册者最外层"（@deepseek-ai/cordis/lib/index.js L307-325，`register` push L335-344）；插件宿主行监听器在插件 apply 时注册（早于一切 agent 创建），agent 作用域的 `installModelSelection` 在会话创建时注册（晚于插件）⇒ 插件 handler 的 `await next()` 取到的是宿主 selection（picked/header/default）已生效后的 proposedConfig，插件换入值为最终值。dsh-scope `scopeTarget`（lib/index.js L316-338）确认全局层监听器对所有 agent 会话可见（"a listener owned by an enclosing scope receives every descendant scope's events"）。

**结论：机制面正确，规格三条件与红线全部落实；1 项 P2（F-2）+ 4 项 P3（F-3/F-4/F-6/F-7）备注。**

### 维度 2：安全性 — 通过（零发现）

- **注入面**：presets 字典键在 UI 侧只能来自宿主 roster id（下拉选择，无自由文本 id 输入，AddPresetCard L1636-1639）；settings.yaml 手改的怪异键仅被只读查找消费（`presets[preset]`，L139），无 eval/无命令拼接。`__proto__` 类键经 schemastery 构造不成为自有键，`Object.keys` 不枚举、消费点安全直通。
- **XSS**：client.js 全部经 `el = react.createElement`（L27）渲染，预设 id/名称/模型 id 均为文本子节点；改动面无 innerHTML/dangerouslySetInnerHTML（全文件 grep 仅 style/anchor 两处预存 document.createElement，与本任务无关）。
- **敏感数据**：日志仅含 preset id + provider/model（L122），无 token/凭据；roster 数据不含敏感字段。
- **破坏性操作**：删除条目有 `window.confirm`（client.js L2818）+ `unset` path-op 单键删除（不触字典外数据）。
- **红线**：preset-defaults.js 不调用 `session.selectModel` / `saveDefaultModelSelection`（全仓 grep 证实该通路仅存在于预存 FIX-012 ModelTakeover 面，由 `takeoverDefaultModel` 开关门控，与本任务零交集）；测试零真实路径（preset-defaults.mjs 无 HOME/tmpdir/.dsh 引用）——forbidden_changes 全部遵守。

### 维度 3：可维护性 — 通过（2 项 P3）

- 模块头注释完整交代宿主契约、主权规则、红线、fail-safe 纪律，风格与 lib/prestep.js 同源；函数级 JSDoc 齐备。
- schema 权威单点已锚定 FIX-019 教训（schemas.js L233-249：wire 侧无逐字段镜像的理由——configResult.value 自由 object codec + saveRequest ops.value json 全量透传，smoke L134-144 往返断言佐证）。
- zh/en i18n 21 键完整成对（presetsTitle…presetsBroken，zh L511-531 / en L809-829，逐一比对）。
- 卡片结构与既有 CategoryCard/AgentCard/PresetAccountCard 模式同构（card-head 摘要行 + 展开编辑 + datalist 防碰撞 id 前缀）。
- ⚠️ F-6：`liveDefaultSelection` 与 prestep.js L194-203 双份实现（宿主契约演进需双点同步）；⚠️ F-3：模块头把 `installModelSelection` 归属写成 "api-proxy"（实际定义于 @deepseek-ai/dsh-agent/lib/index.js L272-303，apiproxy L1712 是消费方）。

### 维度 4：性能 — 通过（零发现）

- 快路径 O(1)：isEnabled → 字典读 → agent.session 守卫 → preset 解析（composedPreset 为宿主 scope 链查询，廉价）→ 未命中直通，零分配；非预设会话零行为开销。
- 观测 Set 有界（512，超限整体清空，无泄漏路径——闭包随卸载器弃置）。
- roster 拉取每页一次（load 内），失败面隔离不阻塞整页；无 N+1 / O(n²)。

### 维度 5：测试覆盖 — 通过（覆盖主干，缺口按严重度标注，见 F-5）

- 判别 23 断言（P1-P10）逐条核对实现行为，含主权双保护（P3 header 层、P4 picked 模拟）、开关三态（P5）、subagent 继承/覆盖（P6）、显式覆盖三向（P7a/b/c）、解析兜底（P8a/b/c）、fail-safe（P9a/b）、热更新（P10）——核心路径+边界+错误路径齐备。
- render 22 断言：位置（专业 Agent 之前）/默认折叠（aria-expanded=false）/空态/统一添加模板下拉/broken 不可选/保存 payload 同构 presetDefaultSchema/残留条目/roster 失败降级——UI 契约主干覆盖。
- smoke 7 断言：schema 默认值 + enabled=false 保留 + 未知键放行 + config/save 通道往返。
- 缺口（详见 F-5）：live-null 路径、parent 查询失败路径、SWAP_LOG_LIMIT 溢出、**roster broken 的宿主真实形状（string）——此缺口直接掩盖 F-1**。

---

## 二、宿主契约一致性（专项核对，全部实证于宿主源码）

| 引用 API | 宿主实证 | 判定 |
|---|---|---|
| `ctx.on('agent/request', handler)`，payload.agent | dsh-tool-cordis L3824-3826（事件定义：`{ agent: Agent; turn; step; signal }`, `next: () => Promise<LlmCallConfig>`）；dsh-agent-loop L708-712（buildRequest 分发）；dsh-scope invariant L17（scope key = args[0].agent） | ✅ 真实 |
| 返回 proposedConfig 缺 provider/model 会抛 | dsh-agent-loop L714 | ✅ 换入值恒齐备（modelSet 保证） |
| `ctx.agentPresets.composedPreset(agentCtx)` | dsh-tool-cordis L142 签名 `composedPreset(agentCtx: Context): string \| undefined`；dsh-agent-presets invariant L964 同步实现 | ✅ 真实（实现多容忍 `{id}` 对象形态——防御分支，见 F-7） |
| `agent.session.requestHeader()` | dsh-agent-loop L695-696（persistedHeader 读取同款） | ✅ 真实 |
| `agent.session.header.origin/agentPreset/parentSession/delegationDepth` | dsh-subagent L530-541 `childSessionMeta`：`origin:"subagent"`、`parentSession: parentHeader.id`、`agentPreset`（父 live 链快照，可能缺省）、`delegationDepth` | ✅ 真实（subagent 走 header.agentPreset 快照优先 = 与宿主持久化语义对齐） |
| `ctx.agents.get(parentSessionId)` | dsh-subagent L1095-1101（宿主自身同款父链回溯）；dsh-host-apiproxy L2369 等 70+ 处 | ✅ 真实 |
| `ctx.get('agentDefaultModel').currentSelection()` | dsh-host-apiproxy L5532（`defaultModelSelection: () => ctx.agentDefaultModel.currentSelection()`——宿主 selectionFor 第三层同源）；service.js defaults() 既有用法 | ✅ 真实 |
| 三层选择 picked→header→default | dsh-host-apiproxy L1692-1715 `selectionFor`（每次读取重解析：picked → requestHeader().config → defaultModelSelection） | ✅ 与主权条件③的比较基准严格同源 |
| `api.agentPreset.list({})`（client RPC） | dsh-client-connection L6319（客户端 API 面）；宿主 value schema `{presets:[{id,trust,isDefault,name?,description?,broken?: string}],authorable,hasDocument}` | ⚠️ RPC 真实，但 **`broken` 是 string（错误信息）而非 boolean → F-1** |

**红线复核**：无 settings `agent-default-model` 节写入、无 selectModel 通路（§维度 2）；`agent/request` 返回仅覆盖当次 proposedConfig，不落任何持久层。

---

## 三、发现列表

### F-1 [P1] roster `broken` 类型与宿主契约不符——"损坏预设标记不可选"在真实环境静默失效（mock 保真度缺陷）

- **位置**: lib/client.js:1550（`presetRosterItemsOf` 归一 `broken: entry.broken === true`）；lib/client.js:1638、1646（disabled/保存门控消费该布尔）；tests/client-render.mjs:400-402（fixture 用 `broken: false/true` 布尔）；README.md:94 与 lib/client.js:1535-1536 注释（宣称"broken 条目保留——UI 标记不可选"）
- **事实依据**: 宿主 wire 契约两处实证 `broken` 为非空字符串（错误信息）而非布尔——dsh-host-apiproxy/lib/types/api/agent-presets.schema.js L14 `broken: z.string().min(1).optional()`；dsh-client-connection/lib/client.js L5770 同款。真实载荷下 `entry.broken === true` 恒为 `false`。
- **影响**: ① 添加下拉中损坏预设不带"已损坏"标记且**不会被 disabled**，用户可选中并保存其配置（保存后配置滞留——机制侧无害，因损坏预设无法组会话，属"配置存在但预设不可用"自然失活，无数据损坏/主权风险）；② README 与代码注释宣称的行为未达成 = 文档-实现-契约三方偏差；③ render 断言"broken 预设带标记且不可选（disabled）"（L1597）只在布尔 fixture 下为真——**测试对真实契约给出假信心**（AI 专项：mock 形状失真）。
- **修复建议**: 归一改为真值兼容（如 `broken: typeof entry.broken === 'string' && entry.broken ? entry.broken : (entry.broken === true ? 'broken' : '')`，后续 disabled/标记按真值判定）；fixture 改用宿主真实形状（`broken: 'compose failed'` 字符串）并保留 L1597 断言；README 无需改动（修复后行为即达成）。

### F-2 [P2] 主权条件③在 live 默认不可读时 fail-open（未验证即视为一致）

- **位置**: lib/preset-defaults.js:148-149（`const live = liveDefaultSelection(ctx); if (live && (...)) return resolved`——`live === null` 时跳过比对继续换入）
- **事实依据**: 设计规格将"resolved 与全局默认一致"列为换入的**全部前提之一**；服务缺失/抛错/空值时该前提无法验证，实现按"成立"处理（fail-open）。若该降级与 picked 层同时出现（理论组合），显式选择会被覆盖。真实可达性 ≈ 0：`agentDefaultModel` 是宿主核心服务（插件 peerDependencies 明确依赖；apiproxy selectionFor 第三层同源使用，缺它宿主自身报错）。prestep.js 对同类降级有明确注释论证（L189-193），本处无。
- **修复建议**: 二选一——(a) fail-closed：`if (!live || resolved.provider !== live.provider || ...) return resolved`（主权优先，代价是降级环境预设功能整体停用）；(b) 维持 fail-open 但补注释论证 + 一次性 warn（P-v2 原则 8：降级可观测）。

### F-3 [P3] 模块头把 installModelSelection 归属误记为 "api-proxy"

- **位置**: lib/preset-defaults.js:10-11
- **事实依据**: 函数定义于 @deepseek-ai/dsh-agent/lib/index.js L272-303（dsh-host-apiproxy L1712 是调用方）；execution-packets EVO-013 facts 第 2 条亦归属 dsh-agent。
- **修复建议**: 注释改为 "dsh-agent 的 installModelSelection（api-proxy selectionFor 装配）"。

### F-4 [P3] subagent 显式覆盖保护在 parent 查询失败时降级为仅靠 guard ②

- **位置**: lib/preset-defaults.js:158-166
- **事实依据**: guard ①（child≠parent ⇒ 显式 ⇒ 尊重）依赖 `ctx.agents.get(header.parentSession)` 成功返回 parent。返回 undefined 时（服务形态变化/父会话不存活）guard ① 被跳过，仅剩 guard ②（resolved == agent.options）；对插件 agent 类专业 agent（显式 agentOptions 且 resolved==agent.options）会误换入预设模型，违反 EVO fact 6。真实可达性低（子代理请求发生在父 agent 存活等待期间，get 恒命中；宿主 L1097 同款查询）。另有固有观测极限：显式指定值恰等于 parent.options 时与继承不可区分（无 payload.agentOptions 字段可判）。
- **修复建议**: 将 "parentSession 存在但 parent 不可解析" 视为尊重信号（直通），或在注释中披露该降级顺序与固有盲区。

### F-5 [P3] 测试覆盖缺口（按发现严重度对应）

- **位置**: tests/preset-defaults.mjs / tests/client-render.mjs
- **事实依据与缺口清单**: (a) live 默认服务缺失（F-2 路径）无断言；(b) parentSession 查不到 parent + 显式 child options（F-4 路径）无断言；(c) SWAP_LOG_LIMIT 溢出清空重打语义无断言；(d) roster `broken` 宿主真实形状（string）无断言（F-1 直接成因）；(e) composedPreset 返回 `{id}` 对象分支（F-7）无断言。规格明确要求的场景（enabled:false 条目、总开关关但条目存在、requestHeader 存在、resolved≠默认、subagent 双向、主继承空态）均已覆盖。
- **修复建议**: 随 F-1/F-2/F-4 修复补判别断言；(c)/(e) 可选。

### F-6 [P3] liveDefaultSelection 双份实现（prestep.js / preset-defaults.js）

- **位置**: lib/preset-defaults.js:68-77 vs lib/prestep.js:194-203
- **事实依据**: 两处同源逻辑（宿主 agentDefaultModel 读取链）独立维护；宿主契约演进时需双点同步，违背单点原则（P5 泛化）。
- **修复建议**: 提取共享 helper（如 lib/host-defaults.js 导出，两处 import）；prestep 侧注释历史包袱可留在原地引用。

### F-7 [P3] livePresetOf 的 `{id}` 对象分支为防御性死代码

- **位置**: lib/preset-defaults.js:89
- **事实依据**: 宿主签名严格为 `string | undefined`（§契约表）；对象分支永不命中（Promise 形态亦无 id 字段），且无测试。
- **修复建议**: 保留（防御宿主演进，与 P-v2 原则 9 一致）但注释标注"当前契约下不可达"，或删除。

---

## 四、AI 代码专项 5 项结论

| # | 检查项 | 结论 | 依据 |
|---|---|---|---|
| 1 | mock 残留 | **有 1 处形状失真（关联 F-1）** | render fixture `agentPreset.list` 的 `broken` 用布尔，宿主契约为 string——mock 未对齐契约使断言假绿。无产品代码 mock/stub 残留（preset-defaults.js 无测试分支代码）。 |
| 2 | 硬编码模型 id | **无新增** | preset-defaults.js 零模型字面量；测试夹具 NATIVE/MAIN_MODEL/SUB_MODEL 为场景常量（合理）；client.js gpt-5.6 三件套为 EVO-008 预存面（FIX-015 锚定），非本任务引入。 |
| 3 | 幻觉 API | **无** | §二契约表 8 项引用逐一在宿主源码实证（agent/request 载荷与签名、composedPreset、requestHeader、header 四字段、agents.get、agentDefaultModel.currentSelection、agentPreset.list RPC）；唯一归属瑕疵是注释层面（F-3）。 |
| 4 | 未实现 TODO | **无** | 改动面 grep 无 TODO/FIXME/stub 占位；所有声明行为均有对应实现路径。 |
| 5 | 过度实现 | **无功能面越界**（2 处无害防御分支） | 需求 5 点（卡片位置/默认空/统一模板/主-subagent 配置语义/默认折叠）全部达成且未超纲：未做预设增删改本体、未动 route_agent 解析链、未写全局默认。防御性分支（`{id}` 对象容忍 F-7、roster 包裹形态容忍）属契约防御，单列 P3 备忘。 |

---

## 五、硬门槛裁决

| 门槛项 | 阈值 | 实测 | 判定 |
|---|---|---|---|
| P0 阻塞问题数 | = 0 | **0** | ✅ |
| 5 维度全覆盖 | 100% | 正确性/安全性/可维护性/性能/测试覆盖 逐一有结论（§一） | ✅ |
| 每条发现标注级别 | 100% | F-1(P1)/F-2(P2)/F-3…F-7(P3) 共 7 条全标注 | ✅ |
| 设计一致性检查 | 已完成 | 与 execution-packets EVO-013 goal/non_goals/allowed_changes/forbidden_changes 及宿主契约逐条比对（§一/§二/红线复核） | ✅ |
| AI 专项 5 项 | 全部完成 | §四逐项有结论 | ✅ |

## 六、最终结论

**APPROVED_WITH_NOTES**（unresolved_blockers = 0）

- 无 P0/BLOCKING 发现：主权三条件、红线（不写全局默认/不走 selectModel）、fail-safe、零行为变化缺省全部落实并经宿主源码实证。
- 遗留 notes（建议本轮修复 F-1，其余可记账下轮）：
  - **F-1（P1）**：roster `broken` string/boolean 契约失配——"损坏预设标记不可选"在真实环境失效且测试假绿；修复量小（归一 + fixture 对齐），建议随本任务收口。
  - **F-2（P2）**：live 默认不可读时主权条件③ fail-open（真实可达性≈0，建议 fail-closed 或补论证+可观测）。
  - **F-3/F-4/F-5/F-6/F-7（P3）**：注释归属、parent 查询失败降级披露、测试缺口、helper 双份、防御死代码——台账项。
- 版本注记：package.json 维持 0.4.1（版本 bump 留给发布任务，符合"一个 commit 承载一个问题"的纯粹性要求）；`lib/preset-defaults.js` 已入 files 打包清单 ✅。
