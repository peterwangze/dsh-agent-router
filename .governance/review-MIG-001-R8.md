# MIG-001 R8 — Step 6 独立代码审查报告（Code Reviewer）

- **Round**: R8（Step 6 单元首审；审查链 R1-R7 已覆盖 Step 0-5c 并全部通过）
- **审查对象**: 未提交变更集 — `lib/prestep.js`（新增，实读 225 行）/ `lib/wrapper.js`（M：仅 2 处 export 标记 + 注释）/ `lib/index.js`（M：+6，import + ctx.effect 接线）/ `tests/smoke.mjs`（M：+98，语法守卫 + 7.7 断言组 15 条）
- **审查者**: software-project-governance-code-reviewer（只读审查；未运行测试、未执行写操作）
- **审查日期**: 本会话
- **终态**: `APPROVED_WITH_NOTES`
- **独立结构字段**: `unresolved_blockers=0`

---

## 0. 审查范围与执行方式

- 依据：实读变更文件全文（prestep.js 逐行 1-225 / wrapper.js 1-448 / index.js 45-94 / smoke.mjs 7.7 块 L1254-1348）+ 完整 git diff + 设计契约实读（`docs/architecture-v3.md` §5.2.1 L472-512、§5.3 L514-563、§8 L767-791、§13 V-DSH-1 L857）+ 宿主源码实读（dsh-agent-loop / dsh-agent / dsh-session / dsh-llm / cordis 五个包）。
- 测试运行事实由 Coordinator 提供（本 Reviewer 无 Bash 权限，未亲自复跑，见事实依据表 F2）。
- 未修改任何产品代码；唯一写入为本报告。
- **简报事实修正**：任务简报称 prestep.js"277 行"，实读为 **225 行**（read 工具 total 225；逐行核对结构完备——8 个函数 + 1 个常量全部在场）。简报为 Coordinator 捕获副本摘要，行数不准不影响审查（以实读为准）。

## 1. 事实依据表（可复查事实）

| # | 事实 | 来源 | 验证方式 |
| --- | --- | --- | --- |
| F1 | 恰 4 文件变更：prestep.js（新增 225 行）/ wrapper.js（+2 export 标记 + 注释）/ index.js（+6）/ smoke.mjs（+98） | `git status --short` + `git diff --stat`（read-only 实跑） | 逐 hunk 核对；wrapper/index 的 diff 与任务附录一致 |
| F2 | `node tests/smoke.mjs` → exit 0，`ALL SMOKE TESTS PASSED`，442 ok / 0 FAIL（含新增 15 断言 + 1 条 prestep.js 语法守卫），既有断言零回退 | Coordinator 独立复跑 | **未亲自复跑**（无 Bash 权限，依协议以 Coordinator 事实为准） |
| F3 | 宿主 `agent/pre-step` 瀑布参数实为 `{ messages, turn, step, signal }`，`agent` 由 `agentEvents` 的 `fused(payload) = { ...payload, agent }` 注入（dsh-agent lib/index.js L335-339） | 实读宿主源码 | handler 解构 `{ agent, messages, turn, step, signal }` 与注入后形状一致 ✅ |
| F4 | cordis `waterfall` 语义：listener 收 `(payload, next)`，`next()` 链到下一 listener/fallback（@deepseek-ai/cordis lib/index.js L317-325） | 实读 cordis | 与 handler `async (payload, next) => { const decision = await next(); ... }` 完全匹配 ✅ |
| F5 | 宿主默认 decision：`{ kind:'enter', messages: context === void 0 ? claimed : [...claimed, context] }`——claimed 消息**同引用** + 尾部追加 context（dsh-agent-loop lib/index.js L501-508）；`claimed.indexOf(message)` 引用对齐在默认 decision 下成立 ✅ | 实读宿主源码 | 手工推演：`[...claimed, context]` 中前 N 项为 claimed 同引用，context 不在 claimed → index=-1 透传；映射正确 |
| F6 | 宿主把 `decision.messages` 逐个 `session.append("user/message", ...)`（dsh-agent-loop L554）——V-DSH-1 持久化假设在宿主源码印证 ✅ | 实读宿主源码 | 与 prestep.js 头注释 L7-8 声明一致 |
| F7 | 会话校验：`user/message` 必须带非空字符串 id、role 'user'、source.kind 非空、content 数组（dsh-session lib/index.js L1242-1254） | 实读宿主源码 | reminder 经 createUserMessage 构造满足全部约束 ✅ |
| F8 | `createUserMessage` 自带 `id: MessageId(crypto.randomUUID())` 且 deepFreeze（dsh-llm lib/types/message.js L33-49） | 实读宿主源码 | reminder id 满足会话校验；冻结消息可直接 append ✅ |
| F9 | `buildRequest` 以 `this.options.provider ?? ""` / `this.options.model ?? ""` 为 seed（dsh-agent-loop L670-677）——prestep `sessionProvider/sessionModel` 的 options 优先顺序与宿主同源 ✅；`session.requestHeader()` 存在且 `config.provider/model` 形状可用（L672/L708） | 实读宿主源码 | 回落链（options → header → ''）与宿主 seed 一致；header 在首次请求前未就位 → 回落语义符合注释 |
| F10 | `llm` 服务经 `LlmRuntime extends Service` + `super(ctx,'llm')` 注册，`registration(provider)` 返回含 `.adapter` 的条目（dsh-llm lib/types/index.js L148-153/L617-618）——prestep 逃生分支 `ctx.get('llm')` + `llm.registration(provider)?.adapter` 与 wrapper 同款（wrapper.js L378/L263） | 实读宿主源码 | 生产（index.js apply 同根 ctx）与测试（LlmRuntime(root) 注入 root）均可解析 ✅ |
| F11 | wrapper.js 确认导出 `requestHasModality`（L214）/ `sourceAcceptsModality`（L238），diff 仅 export 标记 + 注释，无逻辑变更 | 实读 + git diff | prestep.js L35 import 的 5 个符号全部存在（MODALITY_ENTRIES/WRAP_SUFFIX/minimalImageRewrite 为既有导出）✅ |
| F12 | `isAttachmentId` = `/^sha256:[0-9a-f]{64}$/i`（lib/attachments.js L33/L70）——reminder 只携带内容寻址 id（M2 语义） | 实读 | collectAttachmentIds L119-120 经 isAttachmentId 守卫 ✅ |
| F13 | smoke 7.7 块恰好 15 条 check（L1305-1347 计数），语法守卫 +1（L32 prestep.js）；diff 无 7.7 之外的其他改动 | 实读 + git diff | 逐条计数 15；L1305/1306/1307/1308/1313/1314/1315/1320/1325/1330/1335/1337/1340/1342/1347 |
| F14 | `modalityState` 在图片存在性判断**之前**执行（prestep.js L180-184）；`listImageVisionAgents/listImageGenerationAgents` 均为 registry 全量遍历 + 排序（service.js L1865-1896）——**每步（含纯文本步）付两次遍历代价** | 实读两文件 | → 发现 F-01（P2） |
| F15 | prestep.js 实际 225 行 vs 简报 277 行 | read 工具 | 事实修正（见 §0），不影响审查 |

## 2. 审查重点逐项结论

| 重点 | 结论 | 依据 |
| --- | --- | --- |
| 宿主钩子契约（`agent/pre-step` 签名 + next() + decision） | ✅ 与宿主一致 | F3/F4/F5/F6：payload 注入 agent；waterfall listener 收 `(payload, next)`；默认 decision 形状 `{kind:'enter', messages}` 同引用；decision.messages 持久化为会话事件 |
| createUserMessage 自带 id（宿主会话校验要求） | ✅ 成立 | F7/F8：dsh-session 要求非空 string id；createUserMessage 生成 uuid 并冻结。测试断言 L1306 复核 id 存在 |
| 双改写规避（包装路由不改写） | ✅ 判定正确 | prestep.js L191-207：`sessionProvider` options 优先（与 buildRequest seed 同源 F9）→ `provider.endsWith(WRAP_SUFFIX)`（L193）→ 包装路由跳过改写；requestHeader 回落（L141-143）已捕获（header 首次请求前未就位时回落，注释属实） |
| fail-safe（handler 异常不击穿宿主循环） | ✅ 成立 | L216-222：try/catch 包住 next() 之后的全部处理，失败 → logger.warn + 返回原 decision（no-op）。`await next()` 在 try 外（L177）——下游异常正常上抛不吞，符合宿主错误面 |
| claimed/decision.messages 映射（index 对齐） | ✅ 默认场景正确，⚠️ 有脆弱性 | F5：宿主默认 decision 同引用，`claimed.indexOf` 对齐成立；尾部 context 透传（index=-1）。脆弱点：若内层 pre-step handler 替换消息对象 → 引用失配 → 逃生组改写静默不生效（reminder 仍注入）→ 见 F-07（P3） |
| 性能（requestHasModality 每消息调用 + 能力探测缓存复用） | ⚠️ 两处可优化 | F14：① modalityState 先于图片门控执行，纯文本步付两次 registry 遍历（P2 F-01a）；② `claimed.some(m => requestHasModality([m],'image'))` 等价于单次 `requestHasModality(claimed,'image')`，每消息建数组（P2 F-01b）。能力探测缓存复用 ✅：wrapper 模块级 60s TTL（wrapper.js L231-255），逃生分支命中同一缓存；测试用独立 provider 名规避污染（smoke L1267-1268）——测试卫生良好 |
| 测试判别力（R6/R7 教训） | ✅ 合格，两处缺口 | 15 条正/负向覆盖：包装路由注入+不改写（①）、逃生纯文本无裸图（②）、逃生原生多模态直传（③ 判别探测成功路径）、纯文本零注入同引用（④ 负向）、总开关门控（⑤）、单元面（⑥）、卸载器（⑦）。缺口：宿主带 context 追加的 decision 映射未测 + reject 透传未测 + fail-safe 未测 → F-02（P2） |
| 范围（wrapper 仅 export；index 最小接线） | ✅ 成立 | wrapper diff 仅 2 处 export + 注释（F11）；index.js +6 行 = import + 1 个 ctx.effect（L77-80），与 installAdmissionWrapper 接线（L75）同构，为 installPreStep 生命周期注册的唯一路径——"最小接线必要性"裁量通过（Coordinator 披露的 scope_guard 缺口成立，属必要接线） |

## 3. 设计一致性表（含三处设计记录裁量）

| 契约项 | 契约要求 | 实现 | 一致性 |
| --- | --- | --- | --- |
| §8 Step 6 行（L777） | 注册 `agent/pre-step`；带 id 的 reminder user 消息；非包装路由分级改写兜底；依赖 Step 3（能力判定+改写语义复用）与 Step 5a/5b（M2 寻址）；测试=图片轮注入 reminder（带 id）+ 逃生组无裸图块；回滚=卸载 pre-step 注册 | installPreStep（L175-224）注册 handler；buildReminderMessage 带 id（F8）；onWrapperRoute 判定（L193）+ sourceAcceptsModality/minimalImageRewrite 复用（L204-206/L79）；collectAttachmentIds 经 isAttachmentId（F12）；smoke ①②组断言 + ⑦卸载器 | ✅ |
| §5.2.1 T-2 定案（L497） | pre-step 仅做 ①reminder 注入 ②逃生组兜底改写；主改写面保留 wrapper stream | handler 只做两件事；包装路由不改写（L193-207） | ✅ |
| §5.3 通道①（L520） | reminder = 带 id 的 user 消息（source plugin）；**行为指令，不含图片内容**（防复述污染 T-1） | collectReminder（L47-54）纯行为指令 + 附件 id + 视觉 agent 提示，无图片内容；source plugin（L163） | ✅ |
| §13 V-DSH-1（L857） | pre-step 注入带 id 的 user 消息被宿主持久化为会话事件（验证方法=查宿主源码）；降级路径=reminder 改走 wrapper system 形态（通道①退化为通道②） | 宿主源码印证 F6/F7/F8；降级路径独立：逃生组改写不依赖 reminder（L194-207 与 L186 独立执行），reminder 失效时通道②标记仍承载行为指令——Developer 声明属实 | ✅ |
| wrapper Step 3 语义复用 | 能力判定（sourceAcceptsModality）+ 改写语义（minimalImageRewrite）+ MODALITY_ENTRIES 门控单点 | 全部从 wrapper.js import（L35）；门控 modalityState = MODALITY_ENTRIES[0].stateOf（L104-110）与 wrapper 同源 | ✅ |
| M2 isAttachmentId 守卫 | reminder 只携带内容寻址 id | collectAttachmentIds L119-120 | ✅ |

**三处设计记录裁量**：

| # | Developer 记录 | 裁量结论 |
| --- | --- | --- |
| 1 | 模块选择：新增 prestep.js 而非 tool.js（架构 L777 明示二选一）——M4 对称性/依赖面/生命周期 | ✅ 采纳合理：prestep.js 与 wrapper.js（M4 注册表所在）同层依赖，import 无环（attachments.js ← prestep.js ← wrapper.js，M2 为依赖源方向正确）；与 installAdmissionWrapper 同构的 effect 生命周期；tool.js 为工具注册面，混入钩子会扩大工具模块职责 |
| 2 | 逃生组 includeImages 往返缺口：逃生组改写后会话日志层存标记文本非原图块 → includeImages 从日志层取不到图；视觉往返需 Step 7 attachmentIds 闭环 | ✅ 披露属实（结构验证：逃生轮 rewrite 在宿主 append 之前发生（F6 顺序），原始图块从未持久化；F3 保留原件仅限包装路由）。vision-router 同款取舍；reminder 已携带内容寻址 id，Step 7 落地后 route_agent(attachmentIds) 可闭环。属设计内取舍，不阻塞本步；附带 C-4（日志保留原件）在逃生路径不成立——见 F-06（P3） |
| 3 | 跨轮边界：会话中途 twin→逃生组切换后，历史轮原图块仍在会话事件（wrapper F3 保留）→ 逃生组后续文本轮会把历史裸图块喂给文本模型 | ✅ 披露属实（结构验证：prestep 只改写 claimed=当前步消息，历史图块经 deriveMessages 原样进入模型输入）。属逃生组固有边界，建议 Step 10 观测项——见 F-08（P3） |

**Coordinator 披露的范围注记裁量**：`lib/index.js` 接线不在执行包 scope_guard 字面清单（tool.js/prestep.js/smoke.mjs）内。裁决：**最小接线必要性成立**——installPreStep 的唯一生命周期注册点是 `apply(ctx)` 的 ctx.effect（与 installAdmissionWrapper L75 同构）；无 index.js 接线则 pre-step 永不安装。+6 行（1 import + 1 effect + 注释），无顺带修改。不构成范围违规。

## 4. 五维度结论

| 维度 | 结论 | 说明 |
| --- | --- | --- |
| ① 正确性 | ✅ 通过 | 宿主契约逐项实读印证（F3-F10）；双改写规避判定正确；claimed 引用映射在宿主默认 decision 下正确（F5）；空 claimed/非数组/门控关闭/模型缺失边界均处理（L178/L182/L184/L208）；reject 透传（L178）；reminder 只在含图块时注入 → 不会把宿主"空 decision=终止"信号污染成非空步骤（结构推演：claimed 含图 ⇒ decision.messages 非空） |
| ② 安全性 | ✅ 通过 | 附件 id 经 isAttachmentId 严格校验（F12）；reminder/marker 文本为行为指令，图片内容不进入文本（T-1）；无密钥/token；无注入面（agent id 来自可信注册表，quote 包裹）；fail-safe 不击穿宿主循环（L216-222）；无新增权限面 |
| ③ 可维护性 | ✅ 通过 | 模块头文档完备（契约 + V-DSH-1 印证 + 两职责 + 降级路径）；8 个函数命名自解释；中文注释标注事实出处；无死代码。深遍历 walk 模式在 wrapper（rewriteContentDeep/collectMarkers/collectMemorySegments）与 prestep（rewriteImageTurnsToMarkers/collectAttachmentIds）重复 5 处——属既有风格延续，见 F-09（P3） |
| ④ 性能 | ⚠️ 通过（2 项 P2 建议） | 纯文本步付 modalityState 两次 registry 遍历（F14/F-01a）；requestHasModality 每消息调用（F-01b）；能力探测缓存复用 ✅（60s TTL 共享）；逃生分支单次 resolveModel（缓存命中后零查询）；无 I/O 热点 |
| ⑤ 测试覆盖 | ✅ 通过（含 1 项 P2 建议） | 15 条断言正/负向覆盖 7 个场景（F13），判别力合格（③原生多模态直传为探测成功路径的关键判别）；缺口=宿主带 context 的 decision 映射 / reject 透传 / fail-safe 降级未测（F-02，P2 可遗留）；语法守卫 +1（prestep.js 入队）；既有断言零回退（F2） |

## 5. 发现列表

### P0（阻塞）— 0 项
无。

### P1（关键）— 0 项
无。

### P2（建议，可遗留，不阻塞）
- **F-01** 性能：门控状态计算先于图片存在性判断；图片判定逐消息调用。
  - 位置：`lib/prestep.js` L180-184（`modalityState` 在图片门控之前）/ L184（`claimed.some(m => requestHasModality([m],'image'))`）。
  - 事实：`modalityState` 调 `MODALITY_ENTRIES[0].stateOf(service)` → `isEnabled()` + `listImageVisionAgents()` + `listImageGenerationAgents()`，后两者均为 registry 全量遍历 + 排序（service.js L1865-1896）；pre-step 每步执行（含纯文本步），而 wrapper 只在 settings/adapters 变更时计算 state（installAdmissionWrapper sync）。`claimed.some` 内逐消息建 1 元数组调用 requestHasModality，等价于单次 `requestHasModality(claimed,'image')`。
  - 影响：纯文本步（最常见）每步付两次目录遍历 + 排序；图片判定多付每消息数组分配/函数调用开销。与 wrapper 的"热路径零冗余计算"姿态不一致。
  - 建议：① 将 `modalityState` 移到图片门控之后（纯文本步只付 content 扫描）；② `claimed.some(...)` 改为 `requestHasModality(claimed, 'image')`。两处均为两行内改动，可遗留至 Step 7 同批（非阻塞）。

- **F-02** 测试覆盖：宿主真实 decision 形态的映射对齐未测。
  - 位置：`tests/smoke.mjs` L1294-1296（dispatch 的 fallback 为 `{ kind:'enter', messages: [...messages] }`，无宿主 context 追加场景）。
  - 事实：宿主默认 decision 为 `[...claimed, context]`（context 为运行时上下文 user 消息，F5）；测试只覆盖"decision.messages 与 claimed 等长同引用"和"卸载后"两个形态；未覆盖"decision.messages 含额外尾部消息"（index=-1 透传分支 L211）、reject 透传（L178）、fail-safe catch（L216-222）。
  - 影响：若未来映射逻辑改为按 index 对齐（而非引用），context 追加场景会错位而 smoke 不感知；fail-safe 是硬性安全约束（C-3 兜底），无断言保护。
  - 建议：补 1-2 条：① fallback 改为 `[...messages, extraUserMessage]` 断言 extra 透传 + 前 N 项改写正确；② 直接调 handler 抛错路径断言返回原 decision（可经注入异常 fixture 或临时替换 collectReminder 触发）。可遗留（判别力已合格线以上）。

### P3（讨论/记录）
- **F-03** 接口形状偏差：架构 §5.3 L314 定义 `collectReminder(attachmentIds, visionAgents): { id; text }`，实现返回 string（text），id 由 buildReminderMessage 内 createUserMessage 生成。端到端产物（带 id 的 reminder user 消息）与契约一致，仅模块接口形状不同——功能等价，记录不改。
- **F-04** reminder 措辞未含 `attachmentIds`：§5.3 L520 示例为"includeImages:true 或 attachmentIds"，实现仅"includeImages 传 true"（L53）。attachmentIds 参数 Step 7 才落地（§8 L778），当前提前提及会造成幻觉工具参数——现状选择合理；Step 7 落地时同步更新 reminder 措辞（记录待办）。
- **F-05** 逃生组标记文本进 user 层（T-1 复述风险）：escape 分支用 minimalImageRewrite（system 层标记）替换 user 层图块（L79），标记文本会随 user/message 持久化并被大脑当用户发言（wrapper.js L44-46 注释明示该风险）。逃生组固有取舍（vision-router index.js:4832-4835 同款），模块头 L63 已披露；不阻塞。
- **F-06** 逃生路径 C-4（日志保留原件）不成立：逃生轮原图块在宿主 append 之前已被改写（F6 顺序），会话日志存标记文本非原件。仅影响逃生路径（手动切回原组），包装主路径 F3 保留原件；设计记录 2 已披露，Step 10 观测。
- **F-07** claimed 引用对齐脆弱性：若内层 pre-step handler（注册序更晚者）替换消息对象，`claimed.indexOf` 失配 → 逃生组改写静默不生效（reminder 仍注入，C-3 依赖宿主准入兜底）。宿主默认 decision 同引用下不触发（F5）；记录不改，若未来宿主变更 decision 语义需复核。
- **F-08** 跨轮边界（设计记录 3）：会话中途 twin→逃生组切换后，历史轮原图块（wrapper F3 保留于会话事件）在逃生组文本轮经 deriveMessages 原样进入模型输入 → 纯文本主模型 UNSUPPORTED_CONTENT 风险。Developer 建议 Step 10 观测项——采纳记录。
- **F-09** 深遍历 walk 模式重复 5 处（wrapper 3 + prestep 2）：非复制实现（能力判定/改写语义单点复用成立，仅遍历脚手架相似），属既有风格延续；若后续新增模态可考虑抽公共 walk helper（Step 7 泛化时评估）。
- **F-10** `signal`/`turn`/`step` 解构未使用：宿主在 waterfall 返回后自行 `signal.throwIfAborted()`（dsh-agent-loop L509），无缺口；记录不改。

## 6. AI 生成代码专项 5 项检查

| # | 检查项 | 结果 | 依据 |
| --- | --- | --- | --- |
| 1 | mock 残留 | ✅ 无 | 生产代码无 mock/stub；smoke 中 escapeAdapter/mmEscapeAdapter 为测试夹具（合法用途，测试内定义不泄漏） |
| 2 | 硬编码返回值 | ✅ 无 | collectReminder/rewriteImageTurnsToMarkers 输出由入参参数化；无写死返回 |
| 3 | 幻觉 API 调用 | ✅ 无 | import 的 5 个 wrapper 符号（F11）、createUserMessage（F8）、isAttachmentId（F12）、ctx.get/on/logger 均为既有真实接口；`agent.options`/`session.requestHeader()` 经宿主源码实读印证（F9）；无虚构 API |
| 4 | 未实现 TODO | ✅ 无 | 无 TODO/FIXME；注释中的 Step 7/10 引用为设计次序陈述非占位 |
| 5 | 过度实现 | ✅ 无 | handler 只做 ①reminder ②逃生组改写；无超出 §8 Step 6 行的行为（未提前实现 attachmentIds 参数、未动 wrapper 逻辑）；index.js 接线为必要最小（§3 范围裁量） |

## 7. 硬门槛裁决

| 门槛项 | 阈值 | 结果 |
| --- | --- | --- |
| P0 阻塞问题数 = 0 | = 0 | ✅ 0 |
| 5 维度全覆盖 = 100% | 逐一有结论 | ✅ 5/5（§4） |
| 每条发现标注级别 = 100% | P0~P3 | ✅ 10 条全部标注（F-01/F-02 P2，F-03~F-10 P3） |
| 设计一致性检查完成 | §8 Step 6 + §5.2.1/§5.3 + V-DSH-1 + wrapper 语义 + 三处设计记录裁量 | ✅（§3） |
| AI 专项 5 项完成 | 5/5 | ✅（§6） |
| 事实红线 | 未验证项显式标注 | ✅ 测试运行事实（F2）标注为 Coordinator 提供，未亲自复跑；宿主契约事实全部实读印证（F3-F10）；简报行数差异（F15）显式修正 |

## 8. 终态

**APPROVED_WITH_NOTES** — `unresolved_blockers=0`

- P0 = 0，P1 = 0，P2 = 2（F-01 性能顺序/逐消息调用、F-02 测试映射缺口，均可遗留），P3 = 8（记录项）。
- 依据：宿主 `agent/pre-step` 契约（payload 注入 agent、waterfall (payload,next)、默认 decision 同引用、decision.messages 持久化、user/message id 校验、createUserMessage 自带 id）经五个宿主包源码逐项实读印证，与实现完全一致；双改写规避判定正确；fail-safe 成立；wrapper 仅 export 无逻辑变更；index 接线为最小必要；设计契约（§8 Step 6 / §5.2.1 T-2 / §5.3 通道① / V-DSH-1）逐条一致；三处设计记录披露属实且裁量采纳；AI 专项 5 项全过；15 条断言判别力合格。
- 备注（Notes）：
  1. F-01（性能：门控计算顺序 + 逐消息调用）建议 Step 7 同批顺手修正（两行级改动）。
  2. F-02（测试缺口：宿主 context 追加映射 / reject / fail-safe）可遗留，判别力已在合格线以上。
  3. F-04（reminder 措辞）在 Step 7（attachmentIds 参数落地）时同步更新。
  4. F-05/F-06/F-08（逃生组固有取舍：user 层标记复述风险、日志层原件缺失、跨轮历史图块）为设计内披露项，Step 10 观测；若 D-1-3 指标门（route_agent 触发率 ≥90%）实测不达标按 BC-1 缓解路径走。
- 测试运行事实（F2）未由本 Reviewer 亲自复跑——依协议以 Coordinator 提供的事实为准；如需要，Coordinator 可复核。
