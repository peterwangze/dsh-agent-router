# Review — FIX-010 R0（prestep 会话路由判定 header 优先修复）

- **Round**: R0
- **Task**: FIX-010 — GUI 显示层 P0 回归：用户消息图片气泡不渲染（prestep 会话路由判定 header 优先修复）
- **Commit**: `020909b`（lib/prestep.js +27/-13，tests/fix-010-gui-fidelity.mjs 新增 175 行；未 push）
- **北极星（DEC-027）**: ①模态保真直传 ②原始输入呈现不可侵犯（GUI 呈现与会话记录永不被内部转换污染——适配只在模型侧副本）③全链路无感
- **审查者**: Code Reviewer（R0）
- **日期**: 2026-08-30

## 审查证据链（全部可复查）

| 证据 | 路径 | 结论 |
|---|---|---|
| 宿主 selectionFor 实际序 | npx 缓存 `@deepseek-ai/dsh-host-apiproxy/lib/index.js:1692-1715` | **picked（进程内）→ 日志 header → live default**（每次读） |
| 宿主实际请求路由注入 | `@deepseek-ai/dsh-agent-loop/lib/index.js:693-742`（buildRequest seedConfig：首轮=options/后续=requestProposal(header)）→ `agent/request` 瀑布 → `@deepseek-ai/dsh-agent/lib/index.js:287-298`（installModelSelection 用 selection.assembled=selectionFor.current **覆盖 provider/model**） | **最终请求 provider = picked → header → default**；options 仅作 seedConfig 且被 selectionFor 覆盖 |
| header 折叠契约 | `@deepseek-ai/dsh-session/lib/index.js:1497-1503`（requestHeader 增量折叠）+ `:563-567`（foldRequestHeader→canonicalHeader）+ agent-loop:695-696 同构读取 | prestep 读 `header.config.provider/model` 与宿主自身读取**同构** ✓ |
| picked 层 | api-proxy:2596-2629（selectModel→selectionFor.current=picked + saveDefaultModelSelection） | picked 是进程内 WeakMap，**不落 header**（直到下一轮 buildRequest append）；插件无访问 API |
| 会话实录铁证 | `~/.dsh/sessions/--D-AI-agent-deepseek-plugins-router--/session-ec6b01b0-.../session.jsonl.zstd`（解码 8912 帧/10938 行） | L9450 inbox 含原始 image 块 → L9454 user/message 持久化 = minimalImageRewrite marker 文本 → **L9456 request/header 仍 provider=glm-router（重启后实际路由未变）**；全文 request/header 全部 glm-router；旧 era 图片轮（seq 47175/75607/81119/81128）image 块原样持久化 |
| settings 写回实证 | `~/.dsh/settings.yaml` mtime=08/30/2026 18:16:20，L143-145 agent-default-model=deepseek-official/deepseek-v4-flash | 与 RCA 时序逐字吻合（options 快照漂移源） |
| wrapper 能力判定/输入层改写 | 插件 `lib/wrapper.js:248-266`（sourceAcceptsModality TTL 缓存）/ `:344-381`（stream 分级改写，日志层不动）| 模型面适配保持，D 组锁定 |
| 插件内判定单点 | grep `lib/` 仅 prestep.js 读 agent.options/requestHeader() | 无第二判定点 |

## 维度 1：正确性

- **判定序修复正确（核心）**：修复后 prestep=header→options，与宿主实际路由（selectionFor=header 层）在**有 header 的会话（含 resume 会话）完全对齐**。修复前读 options（创建/恢复快照）与宿主实际路由分裂——实录 9456（header=glm-router）vs settings 18:16:20（options 漂移 deepseek-v4-flash）正是分裂实证，9454 为污染后果。修复方向正确。
- **边界完备性**：header 无 config/字段非 string → 独立回落 ✓；requestHeader() 抛错 → catch 回落 options ✓；新会话无 header → options（与 buildRequest 首轮 seedConfig=options 同源一致）✓。
- **残余边界 1（P1，非本修复引入）**：**新会话无 header + 创建后 live default 被改**（GUI selectModel 写 saveDefaultModelSelection）→ prestep 回落 options（创建快照）≠ 宿主实际（live default）→ 判定分裂窗口（options 与 default 的 wrapper 属性不同时：误改写→日志污染 / 漏改写→C-3 击穿）。修复前后该窗口行为一致（均读 options），**非回归**；但任务书声称"与宿主 selectionFor 同序：picked → 日志 header → 默认"**与实现偏离**（实现无 picked 层、回落层为 options 快照而非 agentDefaultModel live default）。修复可达（prestep 有 ctx，wrapper.js 已示范 `ctx.get('agentDefaultModel')`）。
- **残余边界 2（P3/固有）**：picked 层（selectModel 进程内切换）不落 header/options 且插件无访问 API——任何 header/options 实现均不可读，窗口=selectModel 后首轮。宿主设计固有盲区，非本修复引入。
- 并发/资源：无新增共享可变状态；requestHeader() 为增量折叠缓存读取（dsh-session:1497-1503），每图片轮零重复扫描。✓

## 维度 2：安全性

- 纯只读判定，无注入面 ✓；requestHeader 异常回落安全方向（空→逃生组改写=宁可改写不漏图，C-3 优先）✓；无敏感数据、无权限面变化 ✓。

## 维度 3：可维护性

- sessionProvider/sessionModel 对称实现（header→options→''），8 行内，命名表达意图 ✓；注释详实（RCA 溯源完整）✓。
- P3-1：`catch { /* 不可读时按未知处理（回落安全改写） */ }` 注释措辞与实际（回落 options）不完全吻合——行为方向安全（最终空串→逃生组改写），措辞可精确为"回落 options/未知"。

## 维度 4：性能

- 每图片轮多一次 requestHeader()（增量折叠缓存 O(新增事件)）——零新增开销 ✓。

## 维度 5：测试覆盖

- **A1/A2 真判别成立**（旧实现必败逻辑推演：旧序 options 优先→deepseek-official 非 wrapper→accepts=false（夹具无 adapter）→逃生组改写→A1 image 缺失红/A2 marker 存在红）✓
- **B/C 控制组**：B 锁新会话回落 options 逃生组改写保持；C 锁 wrapper 分支不改写（防双改写）——C 组旧实现也绿（非判别，回归护栏性质，控制组正确用法）✓
- **D 组真判别**：prestep 保留 image → wrapper stream → 委托无裸图（D1）+ content 非空（D2）——模型面适配不回退锁定 ✓
- 9 断言（A3+B2+C2 为保持性）与申报一致 ✓
- P3-2：D2 断言名"image-solo 契约不回归"但输入为 image+text 混合（非 solo 形态）——验证的是改写后 content 非空（FIX-009 判别另有独立覆盖），命名与输入不对应。
- P3-3：未覆盖——header 部分字段缺失（有 model 无 provider）、requestHeader() 抛错路径、picked 窗口、options≠default 漂移窗口（P1 边界）。
- **门控申报（9/9 + smoke 948/0 + 十套件）未验证**（审查者不运行测试，按 Developer 申报引用）。
- 测试隔离：DSH_HOME='.tmp-fix010-home' 相对路径，无落盘操作，无残留 ✓。

## AI 代码专项 5 项

| 项 | 结论 |
|---|---|
| mock 残留 | 无（测试夹具为显式构造，产品代码零 mock）✓ |
| 硬编码返回值 | 无（判定纯读入参）✓ |
| 幻觉 API | 无——requestHeader()/agent.options 契约宿主源码核验；测试 import（Context/LlmRuntime/createUserMessage/installAdmissionWrapper/installPreStep）全部真实存在 ✓ |
| 未实现 TODO | 无 ✓ |
| 过度实现 | 无（+27 行最小）✓ |

## 重点核验逐项

1. **判定序正确性**：header 优先+options 回落，边界容错（缺字段/抛错/新会话）完备；宿主契约比对完成——**关键澄清**：宿主 buildRequest 的 options 种子只是 seedConfig，实际请求 provider 由 `agent/request` 瀑布的 selectionFor（picked→header→default）覆盖（dsh-agent lib:287-298）——prestep 修复后 header 优先与宿主实际路由对齐；**申报"与宿主同序"有偏差**（无 picked 层 + 回落 options 快照 vs live default）——见 P1。
2. **不变量②守护真实性**：修复后 wrapper 路由会话 decision.messages 保留原图（A1/A2 判别 + 实录 9454 型污染消除路径核验：prestep 不改写→agent-loop:554 持久化原块→GUI 渲染 image）✓ 真守护。逃生组语义（B/C）保持 ✓。**备注（P3-4）**：wrapper+纯文本会话日志层仍追加 reminder 文本消息（accepts=false 注入，FIX-005 既定）——GUI 可见引导气泡，属设计内行为指令，非"内部转换"（图片块未被转换），符合不变量②字面与设计意图。
3. **不回归面（直连纯文本会话——诚实评估）**：**本修复只解决 wrapper 路由会话**。直连纯文本会话（header=deepseek-official 等非 wrapper）逃生组改写仍触发（C-3 防击穿保持），**其 marker 持久化落日志层仍导致 GUI 显示标记而非图片**——该场景违反不变量②字面（适配发生在日志层），但为架构 §5.2.1 T-2 既定取舍（逃生组无 wrapper stream 即无模型侧副本；prestep.js L66-67 明示"逃生组无 adapter 时界面显示标记，vision-router 同款取舍"）——**如实标注为已知边界，非本修复引入/隐藏**。另注意：新会话（无 header）且 default=非 wrapper 时，prestep 回落 options=default → 逃生组 marker——判定与实际路由**一致**（均为非 wrapper 直连），marker 显示为逃生组设计语义（防纯文本击穿），亦为已知边界。
4. **P5 单点**：sessionProvider/sessionModel 为插件内唯一判定源（grep 证实）✓；能力判定单点复用 wrapper.js sourceAcceptsModality（与 FIX-005 条件化引导同源：prestep L231 与 wrapper stream L353 同函数同缓存键；probeProvider 剥 -router 与 wrapper 原 provider 语义等价）——**无分裂判定** ✓；与宿主 selectionFor 的差异（picked 层/回落层）见 P1/P3。
5. **判别测试质量**：A/D 真判别、B/C 控制组锁语义——成立（详见维度 5）；P3-2/P3-3 瑕疵不损判别性。
6. **范围纪律**：2 文件与锁内一致；prestep +27 变更仅为 2 函数+注释，最小修改 ✓；测试独立文件 ✓；无越域 ✓。

## 发现清单

| 级别 | 位置 | 发现 | 影响 | 建议 |
|---|---|---|---|---|
| P1-1 | prestep.js:154-173（sessionProvider/sessionModel 回落层）| 回落层为 agent.options（创建/恢复快照），宿主 selectionFor 第三层为 live default（agentDefaultModel.currentSelection()）——新会话无 header + 创建后 default 漂移时判定分裂（误改写→污染 / 漏改写→C-3 击穿）；任务书"与宿主同序"申报与实现偏离 | 窄窗口（创建后改 default 不重启+新会话首轮）；修复前后行为一致，非回归；主场景（有 header 会话）已修复 | 建议：回落层优先读 ctx.get('agentDefaultModel')?.currentSelection()（wrapper.js 已示范同服务），options 终兜底；或明确入台账（P-v2 原则 8：能力判定缺失可观测） |
| P3-1 | prestep.js:158 | catch 注释"按未知处理（回落安全改写）"与实际（回落 options）措辞不符 | 无功能影响 | 注释精确化 |
| P3-2 | tests/fix-010-gui-fidelity.mjs:168-170 | D2 断言名"image-solo"与输入（image+text 混合）不对应 | 无功能影响（FIX-009 判别独立覆盖 solo） | 改断言名或补 solo 形态 |
| P3-3 | tests/fix-010-gui-fidelity.mjs | 未覆盖：header 部分字段、requestHeader 抛错、picked 窗口、options≠default 漂移 | 覆盖缺口（P1-1 边界无测试看护） | 后续补判别（随 P1-1 处理） |
| P3-4 | prestep.js:247 | wrapper+纯文本会话日志层仍追加 reminder 文本（设计内） | GUI 可见引导气泡，用户视角效果待实测确认 | 用户重启复验时一并确认 |

## 结论

**APPROVED_WITH_NOTES（unresolved_blockers=0）**

- P0 = 0；P1 = 1（P1-1，台账项：回落层与宿主 live default 对齐——主场景修复已成立且被实录铁证钉死，P1 边界窄窗口、非本修复引入，建议随本任务或下一轮闭合）；P3 = 4
- 硬门槛：P0=0 ✓；5 维度全覆盖 ✓；发现全标注级别 ✓；设计一致性（DEC-027 三不变量：修复后 wrapper 会话日志层零转换污染，模型面适配留 wrapper stream（F3）——①③不变，②在 wrapper 路由面恢复 v0.3.0 解耦）✓；AI 专项 5 项 ✓
- 事实红线：门控申报（9/9 + smoke 948/0 + 十套件零回退）按 Developer 申报引用，**未验证**（审查者不运行测试）
- 修复有效性判定：判定序（header 优先）与宿主实际路由（selectionFor header 层）对齐，会话实录 L9450/9454/9456 铁证闭环——**修复正确，可合并**；已知边界（直连纯文本会话 marker 显示、picked 盲区、新会话回落层）如实披露
