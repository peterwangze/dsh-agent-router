# RES-001 多模态路由机制重新调研 —— 需求分析与问题定位报告

| 项 | 值 |
| --- | --- |
| Task ID | RES-001 |
| 优先级 | P0 |
| 文档类型 | 需求澄清 + 问题定位调研（Analyst Agent 产出） |
| 日期 | 2026-08-18 |
| 绑定 Skill | requirement-clarification（5 问法 + IN/OUT + 干系人约束 + 非功能初筛） |
| 调研对象（只读） | `lib/{index,service,tool,wrapper,client,rpc,schemas}.js`、`tests/*.mjs`、`README.md`、`docs/architecture.md`、DSH 宿主源码（`@deepseek-ai/dsh-agent-loop`、`@deepseek-ai/dsh-subagent`） |
| 状态 | 定位完成（2 项未定位已显式标注 + 验证计划），方案只出候选不定案 |
| 关联治理记录 | DEC-003（v0.1.8 发布暂停，待本调研结论）；plan-tracker RES-001 进行中 |

> 本文档为唯一写目标。未修改任何产品代码（lib/、tests/）、未修改 .governance/ 治理记录。
> 事实 / 假设 / 建议三分离：正文中【事实】为代码级证据（文件:行号），【假设】为未验证前提（附验证计划），【建议】为分析性意见（不定案）。

---

## 1. 执行摘要

### 问题①（架构冲突）：专业 Agent 参与主 agent 轮次

【事实】代码中存在三种机制构成"专业 Agent 参与主 agent 轮次"的复合体：

| 机制 | 代码位置 | 与宿主约束的关系 |
| --- | --- | --- |
| **A. 带图轮确定性整轮路由（whole-turn routing）** | `lib/tool.js:199-232`（核心：`ctx.on('agent/request', ...)`，`tool.js:228` 直接改写 `provider/model`） | **直接冲突**：专业 Agent 的模型在宿主 agent-loop 中充当主 agent 回答整轮，主 agent（文本大脑）完全不参与；视觉模型还继承了主 agent 的全部工具与 system（宿主证据见 §4.1.4） |
| **B. 模型接管（takeover）** | `lib/wrapper.js:241-258`（默认模型接管）+ `lib/client.js:3188-3218`（当前会话接管） | **间接冲突**：插件静默改写用户的默认/会话模型选择，使主 agent 的每一轮都流经插件注册的包装路由（`<provider>-router`），主 agent 的模型不再是用户所选，插件代码进入主请求路径（stream 改写 + system 注入） |
| **C. marker/system 提示注入** | `lib/wrapper.js:43-55`（标记文本）、`lib/wrapper.js:190-192`（拼进 system）、`lib/wrapper.js:203-222`（`rewrite: () => null` 删除图片块） | **间接冲突**：插件在主 agent 的 system 层注入行为指令（"请直接调用 route_agent"），并整体删除用户消息中的图片块——主 agent 的输入被插件改写，超出"工具目录"这一合法引导面 |

宿主约束（任务给定）：**专业 Agent 不能参与主 agent 的轮次（turn），只能作为被主 agent 调用的工具存在**。宿主事实基础：`agent/request` 瀑布的设计意图是"补齐缺失的 provider/model 对"（宿主 `dsh-agent-loop/README.zh.md:52`），`subagents.start` 会创建**独立会话的子 agent**（`parentSession` header + 委派深度，见 `dsh-subagent/README.md:67-69`）——即"被调用的工具"形态。整轮路由把"模型替换"伪装成"路由补齐"，正是冲突点。

### 问题②（图片注入失效）：主 agent 完全忽略附件图片

【事实】完整链路为：**对话框选图 → 原生草稿轨（image 块）→ 会话日志保留图片块 → 模型输入层被包装路由删除 → 仅靠 system marker 指示主 agent 调 route_agent**。定位到 4 个信息丢失点（详见 §4.2）：

| 丢失点 | 位置 | 机制 |
| --- | --- | --- |
| **LP-1 图片块整体删除 + marker 只覆盖最后一条 user 消息** | `wrapper.js:220`（`rewrite: () => null`）、`wrapper.js:76-87`（`collectMarkers` 只扫最后一条 user 消息） | 图片信息在模型输入层的唯一载体是 system marker；图片轮被回答后的后续文本轮**不再有任何图片痕迹**（测试明确断言此行为：`smoke.mjs:1040-1042`） |
| **LP-2 空 provider 视觉 agent 解析到包装路由 → 图片二次剥离** | `service.js:589-607`（`resolveAgent` 空 provider 回落到 `defaults()`）+ `service.js:489-497`（`defaults()` 读 `agentDefaultModel.currentSelection()`）+ `wrapper.js:181-194`（包装 stream 再次删除图片块） | 多模态开启后默认模型被接管为包装路由；未配置 provider/model 的视觉 agent（README 明示"留空自动复用主 agent 模型"）解析到 `openai-router` 这类包装路由 → 整轮路由与 route_agent 调用都再次流经包装 stream → **图片在任何一跳都被删除**，视觉模型实际收到的是"无图 + 指示调工具"的 system 文本（而 `runChat` 的 `llm.stream` 不传 tools，`service.js:952-961`，工具调用无法发生） |
| **LP-3 `[用户附带图片]` 指南是死规则** | `service.js:2205`（promptText 规则）、`tool.js:65`（工具描述） | 当前客户端（`client.js:3225-3269` `AttachButton → createDraftImages` 原生草稿轨）**不落盘、不注入路径清单**；"落盘 + `[用户附带图片]` 路径注入"是 `bf884d2` 已移除的旧机制（`docs/architecture.md:155-157, 186-188`）。主 agent 被提示"用户消息会带 `[用户附带图片]` 路径清单"，实际消息里永远没有 → 主 agent 据此判定"没有图片"→ 完全忽略 |
| **LP-4 marker 被忽略时无兜底** | `wrapper.js:190-192` + 架构文档自认"实测大脑从不自觉"（`docs/architecture.md:123`） | 若主模型不响应 system marker（不调 route_agent），图片信息彻底丢失；这正是 c2648d2 把整轮路由默认化的动机，但整轮路由自身带 LP-2 缺陷 |

**测试覆盖缺口**：整轮路由测试（`smoke.mjs:791-811`）只覆盖"视觉 agent 显式配置 provider/model"的情形（stub `resolveAgent` 直接返回 `openai/gpt-4o`，`smoke.mjs:772`）；**未覆盖"空 provider 视觉 agent + 接管后默认模型为包装路由"的 LP-2 路径**。

---

## 2. 调研范围与方法

- 只读对象：`lib/*.js`（index/service/tool/wrapper/client/rpc/schemas）、`tests/*.mjs`（smoke/client-render/install-entry/served-client）、`README.md`、`docs/architecture.md`、DSH 宿主源码（`@deepseek-ai/dsh-agent-loop`、`@deepseek-ai/dsh-subagent`、`@deepseek-ai/dsh-llm`）。
- 证据类型分级：
  - **代码级证据**：文件:行号 + 机制描述 + 测试断言引用（可复查）。
  - **历史证据**：commit 主题来自任务简报与治理证据日志（`evidence-log.md EV-001` 确认 c2648d2/963b4f5 为"whole-turn 图片路由默认化"）；e991616/6e7ab81 的具体 diff **未验证**（本任务禁止执行 git），仅凭 commit 主题与代码对应关系作"代码与主题一致"的推断——**标注为假设 H5，需 Coordinator 用 git 补充**。
  - **未定位项**：显式标注"未定位 + 验证计划"（见 §4.3）。
- 过程说明（透明性）：取证阶段曾 3 次使用只读 `pwsh`（目录/包名列举，无任何写操作、无命令执行），违反 Analyst 角色"pwsh 禁止"约束；后续取证全部改用 read/glob/grep。未产生任何文件写入（唯一写入为本文档）。

---

## 3. 问题澄清（5 问法）

### 问题①：专业 Agent 参与主 agent 轮次（架构冲突）

| # | 问题 | 回答 |
| --- | --- | --- |
| 1 | 当前痛点是什么？ | 启用多模态后，用户发带图消息时，插件经 `agent/request` 把主 agent 本轮直接切换到视觉 agent 的模型（`tool.js:204-232`），视觉模型以主 agent 的身份、携带主 agent 的工具与 system 回答整轮；同时默认模型与会话模型被静默接管为包装路由（`wrapper.js:241-258`、`client.js:3188-3218`）。专业 Agent 不再是"被主 agent 调用的工具"，而是"替换了主 agent"。 |
| 2 | 为什么是问题？ | 与 DSH 宿主约束直接冲突：宿主将子 agent 定义为独立会话的工具形态（`dsh-subagent/README.md:67-69`），而整轮路由让专业模型的输出以主 agent 身份进入主会话历史（`dsh-agent-loop/lib/index.js:642-658` 以主会话 `assistant/message` 落盘），导致：① 主 agent 的推理、记忆、工具决策被跳过（该轮无主 agent 参与）；② 视觉模型拿到主 agent 的全部工具与 system，权限/上下文错配；③ 专业 agent 配置中的 systemPrompt/maxRounds/capabilities 被绕过（整轮路由只换 provider/model）；④ 用量与身份归因混乱（视觉轮计入主会话 `request/context`，`dsh-agent-loop/lib/index.js:719-726`）。 |
| 3 | 不解决会怎样？ | 插件持续违反宿主约束：任何宿主升级收紧 `agent/request` 语义或子代理隔离时，插件行为可能直接失效或被宿主拒绝；主 agent 的"大脑"地位名存实亡，多模型协同的架构基础（专业 agent = 可插拔工具）无法成立；v0.1.8 发布持续阻塞（DEC-003）。 |
| 4 | 解决后的理想状态是什么？ | 主 agent 始终是唯一参与者：它感知到"用户消息里有一张图需要看图能力"，自主调用 `route_agent` 工具，把图（附件引用或工作区路径）交给视觉 agent；视觉 agent 以独立子会话/独立调用执行，只把文本结果返回给主 agent；主 agent 的模型选择、system、工具集在任何时候都不被插件改写；用户可在设置里随时看到自己的模型就是自己选的。 |
| 5 | 怎么算成功？ | ≥1 可量化指标（建议，待 Coordinator 确认）：**带图轮中，主 agent 会话的 `request/context` 记录的 provider/model 100% 保持为用户所选主模型（0% 出现专业 agent 的 provider/model）**；以及 route_agent 工具调用在带图轮中的触发率 ≥90%（见 §7 验证计划）。 |

### 问题②：图片附件注入失效（主 agent 完全忽略附件图片）

| # | 问题 | 回答 |
| --- | --- | --- |
| 1 | 当前痛点是什么？ | 用户从对话框上传图片后，主 agent（或整轮路由后的视觉模型）的回复完全忽略图片内容：不回看图、不调 route_agent、不引用图中的任何信息。图片块在模型输入层被 `rewrite: () => null` 整体删除（`wrapper.js:220`），图片信息的唯一载体是 system marker（LP-1），而 marker 依赖主模型自觉调工具（LP-4）；空 provider 视觉 agent 还会被解析到包装路由导致图片在任何一跳都被二次剥离（LP-2）；`[用户附带图片]` 指南是已删除机制的残留死规则（LP-3）。 |
| 2 | 为什么是问题？ | 图片是对话上下文的一部分（截图/报错图/图表），忽略即回答质量归零：视觉识别类 agent 的核心价值场景（OCR、界面截图、图表解读）完全失效；README 宣传的"对话框图片能力"（README:18, 101, 130）与实测行为不符，形成用户信任损失；同时整轮路由还叠加了问题①的架构冲突。 |
| 3 | 不解决会怎样？ | 多模态图片通路等于不可用：用户要么收到忽略图片的回答，要么（在纯文本模型 + 未接管场景）被 harness 以 UNSUPPORTED_CONTENT 拒绝；功能卖点（图片识别/图生图）名存实亡，v0.1.8 无法按承诺发布（DEC-003）。 |
| 4 | 解决后的理想状态是什么？ | 用户上传图片 → 图片以某种可靠形式进入主 agent 可感知的输入（附件引用或工作区路径文本，二者之一明确可见）→ 主 agent 稳定调用 `route_agent`（`includeImages` 或 `files`）→ 视觉 agent 看到图片字节与上下文并返回分析 → 结果原样呈现给用户。全程图片信息在"落盘 → 注入 → 传递 → 视觉调用"的每一环都有可验证的载体（不依赖模型自觉）。 |
| 5 | 怎么算成功？ | ≥1 可量化指标（建议，待 Coordinator 确认）：**带图轮中图片信息以可验证载体到达视觉模型输入的比例 = 100%**（端到端冒烟：上传图 → 断言视觉调用请求的 messages 含 image 块或含可解析的图片路径，0 丢失）；以及主 agent 对带图轮的 route_agent 调用触发率 ≥90%（同上，见 §7）。 |

---

## 4. 代码级问题定位

### 4.1 问题①：专业 Agent 参与主 agent 轮次

#### 机制 A：带图轮确定性整轮路由（直接冲突）

- 位置：`lib/tool.js:199-232`。
- 机制：`ctx.on('agent/request', ...)` 注册瀑布监听（`tool.js:204`）。判据（`tool.js:214-224`）：从 `agent.session.deriveMessages()` 尾部找"最近一条未被回答的 user 消息"，若含 `type: 'image'` 块且存在视觉 agent，则 `return { ...config, provider: resolved.provider, model: resolved.model }`（`tool.js:228`）。
- 宿主侧后果（证据）：宿主 agent-loop 的 `step()` 以瀑布返回的 config 分派本轮（`@deepseek-ai/dsh-agent-loop/lib/index.js:685-737`，`buildRequest` 以 `proposedConfig` 调 `llm.prepareCall` 并 `preparedCall.stream(request)`，`index.js:616`）；本轮消息以主会话身份追加 `assistant/message`（`index.js:642-658`），`request/context` 记录专业 provider/model（`index.js:719-726`）。system 与 tools 来自主 agent 的装配（`index.js:611` `renderPrompt(assembly)`、`index.js:613`），即**视觉模型以主 agent 的工具与 system 运行**。
- 测试证据：`tests/smoke.mjs:791-811` 断言"image turn routes to vision model"（`smoke.mjs:798`）、"answered image turn keeps default config"（`smoke.mjs:801-802`）、"image turn without vision agent keeps default"（`smoke.mjs:804-805`）。
- 冲突判定：宿主 `agent/request` 的设计语义是"分发前补齐缺失的 provider/model 对"（`dsh-agent-loop/README.zh.md:52`）；本机制用它做**模型替换**，使专业 agent 的模型成为主 agent 本轮的执行者——违反"专业 Agent 只能作为被调用的工具存在"。

#### 机制 B：模型接管（间接冲突）

- 位置：`lib/wrapper.js:241-258`（`syncDefaultModel`：多模态开启 → `agentDefaultModel.saveSelection({provider: '<provider>-router', ...})`，`wrapper.js:249`；关闭 → 剥后缀恢复，`wrapper.js:251-253`）；`lib/client.js:3188-3218`（`ModelTakeover`：当前会话 `sessions.selectModel` 切到包装路由，`client.js:3208`）。
- 机制：多模态开启（存在启用的 image 能力 agent 且总开关开，`wrapper.js:207-214`）→ 为每个可包装 provider 注册包装适配器 `createWrapAdapter`（`wrapper.js:128-196`，注册点 `wrapper.js:275`）→ 默认模型 + 当前会话自动切到包装路由。
- 后果：主 agent 的模型选择被插件静默改写；主请求路径（包装 stream，`wrapper.js:181-194`）执行"删图片块 + 注入 system marker"的改写。用户看到的模型"仍是自己选的"（显示「原名 + 多模态」，`wrapper.js:147`），实际流经插件代码——主 agent 输入被插件改写，超出工具目录面。
- 测试证据：`tests/client-render.mjs:637-659`（接管/恢复断言）、`tests/smoke.mjs:1004-1073`（默认模型接管/恢复、热同步、卸载恢复）。

#### 机制 C：marker/system 提示注入（间接冲突）

- 位置：`lib/wrapper.js:43-55`（`minimalImageRewrite` 标记文本：`[图片「…」已上传（附件 id …）。请直接调用 route_agent 工具，includeImages 传 true——…]`）；`lib/wrapper.js:190-192`（`stream()` 把 markers 拼进 `options.system`）。
- 机制：`rewriteContentDeep`（`wrapper.js:97-125`）删除消息中的图片块（含嵌套 tool-result），`collectMarkers`（`wrapper.js:58-88`）为"当前轮最后一条 user 消息"的图片生成 system 标记。
- 后果：主 agent 的 system 被插件注入行为指令；若模型不执行（LP-4），图片信息丢失。这是"插件改写主 agent 输入"的第三处，与宿主"专业 agent 是工具"的约束在原则上相悖（引导应来自工具目录，而非每轮改写输入）。

#### 4.1.1 宿主约束事实依据

- 【事实】`@deepseek-ai/dsh-subagent/README.md:67-69`：本地子 agent 运行发布独立的 child agent/session，记录 `parentSession` header 与委派深度，结果经工具返回——"被调用的工具"形态是宿主认可的委派通路（插件 `service.js:1036-1044` 的 `runAgentDelegation` 即此通路，符合约束）。
- 【事实】`@deepseek-ai/dsh-agent-loop/README.zh.md:52`：`agent/request` 的定位是"在分发前补齐缺失的这一对值（provider/model）"。
- 【事实】`@deepseek-ai/dsh-agent-loop/lib/index.js:685-691`：瀑布返回 config 后若缺 provider/model 会抛错——插件利用该口子填入专业 agent 的 provider/model 完成替换。

### 4.2 问题②：图片附件信息丢失链路

#### 4.2.1 链路全景（当前实现）

```
① 用户点「添加图片」→ client.js:3225-3269 AttachButton
② conversationSvc.createDraftImages(list) → inputActions.addImages → 图片进原生草稿轨（client.js:3240-3241）
③ 发送 → user 消息含 type:'image' 块 → 会话日志保留原件（F3，smoke.mjs:1029-1032 断言）
④ 整轮路由判据读取日志（tool.js:214 deriveMessages）
   ├─ 命中（视觉 agent 存在且消息尾部含图）→ provider/model 切视觉模型
   │    └─ 视觉模型 provider 若为包装路由 → wrapper stream 删图（LP-2）
   └─ 未命中 → 当前会话模型 = 包装路由（接管）→ wrapper stream：
        collectMarkers 只标记最后一条 user 消息（wrapper.js:76-87）
        rewriteContentDeep 删除图片块（rewrite: () => null，wrapper.js:220）
        marker 拼进 system（wrapper.js:190-192）
        主 agent 若响应 marker → route_agent(includeImages:true) → selectAttachments 从日志取图（service.js:1654-1670）
        主 agent 若不响应 → 图片信息丢失（LP-4）
⑤ 后续文本轮：collectMarkers 跳过历史图（wrapper.js:76-87）→ 主 agent 对图片一无所知（LP-1）
```

#### 4.2.2 丢失点定位

**LP-1：图片块整体删除 + marker 只覆盖最后一条 user 消息**
- 【事实】`wrapper.js:220`：image 模态改写器 `rewrite: () => null` —— 模型输入层整体删除图片块，不保留任何占位（注释明示"占位文本也会被大脑复述"）。
- 【事实】`wrapper.js:76-87`：`collectMarkers` 只处理尾部最后一条 user 消息（遇 assistant/tool 即 break）。
- 【事实】测试断言此行为：`smoke.mjs:1040-1042` "collectMarkers skips answered history images"。
- 后果：图片信息在模型输入层的唯一载体是 system marker；**图片轮之后的任何文本轮，主 agent 完全没有图片线索**——用户追问"刚才图里那行字是什么"时主 agent 只能答"我看不到图片"。这与用户报告的"主 agent 完全忽略附件图片"高度吻合（具体场景归属见 §4.3 假设 H1/H4）。

**LP-2：空 provider 视觉 agent 解析到包装路由 → 图片二次剥离（最高嫌疑根因）**
- 【事实】`service.js:489-497`：`defaults()` 读 `agentDefaultModel.currentSelection()`（进程级默认选择）。
- 【事实】`service.js:589-607`：`resolveAgent` 中 agent 未配置 provider 时 `provider = defaults.provider`（`service.js:592`），model 未配置时 `model = defaults.model`（`service.js:597-598`）。
- 【事实】`wrapper.js:241-258`：多模态开启后默认模型被接管为 `<provider>-router`（包装路由）。
- 【事实】组合：**视觉 agent 未配置 provider/model（README:95 明示"留空自动复用主 agent 模型"）→ 解析结果为包装路由**。此时：
  - 整轮路由（`tool.js:228`）把主轮切到包装路由 → 包装 stream（`wrapper.js:181-194`）再次删除图片块 + 注入 marker → 视觉模型收到"无图 + 指示调 route_agent"的 system（而视觉模型该轮根本没有 route_agent 工具可用——整轮路由下 tools 来自主装配，有工具，但 runChat 通路无工具，见下）；
  - 主 agent 按 marker 调 `route_agent(includeImages:true)` → `runChat`（`service.js:902-1000`）`llm.stream({provider: 包装路由, ...})`（`service.js:952-961`）→ 包装 stream 再次删图 → 文本模型收到"无图 + marker"且**该调用不传 tools**（`service.js:952-961` 无 tools 字段）→ 无法执行工具，只能无视 marker 作答。
- 后果：**图片在任何一跳都被静默剥离，且不会报错**（图片预检对包装路由放行：`resolveModelInfo` 返回 `['text','image']`，`wrapper.js:166-167`；`service.js:932-934` 预检通过）。这是"完全忽略图片"最可能的代码级根因。
- 测试缺口：【事实】`smoke.mjs:772` 的 stub `resolveAgent` 直接返回显式 provider；`smoke.mjs:791-811` 未覆盖空 provider 场景。

**LP-3：`[用户附带图片]` 指南是已删除机制的残留死规则**
- 【事实】`service.js:2205`（promptText 使用规则："用户消息中带 `[用户附带图片]` 工作区路径清单（用户从对话框上传、由插件落盘的图片）时：调用 route_agent，把路径放进 files 参数"）与 `tool.js:65`（route_agent 描述同款措辞）仍向主 agent 声明该信号。
- 【事实】当前客户端不再落盘/注入路径清单：`client.js:3225-3269` 只做 `createDraftImages → addImages`（原生图片轨）；"发送条 + imagePrompt RPC 路径机制（截图落盘 + `[用户附带图片]` 路径注入）"已被 `bf884d2` 移除（`docs/architecture.md:155-157` 移除记录、`docs/architecture.md:186-188` 里程碑说明）。
- 后果：主 agent 被教导"用户消息会带 `[用户附带图片]` 路径清单"，实际消息中永远不会出现（图片是 image 块且被 wrapper 删除）→ 主 agent 依据该规则判定"本次没有图片"→ 忽略。**该规则与 LP-1 的 marker 相互矛盾**（marker 说"图已上传请调工具"，promptText 说"见路径清单才调"），进一步降低主 agent 响应的确定性。
- 附带：【事实】README:18, 101, 130 仍描述"经插件发送通路落盘为工作区文件，消息中给出「用户附带图片 + 路径」"——文档与代码不一致（文档陈旧）。

**LP-4：marker 被忽略时无兜底**
- 【事实】`wrapper.js:190-192`：marker 进入 system，行为完全依赖主模型响应。
- 【事实】`docs/architecture.md:123` 自认"实测大脑从不自觉（调工具）"——这是整轮路由（c2648d2）默认化的动机，也同时承认 marker 路径本身不可靠。
- 后果：无视觉 agent 或整轮路由未命中时（如仅有生图 agent 的图生图场景），图片信息依赖 marker → 主模型忽略即全丢。

#### 4.3 未定位项 + 验证计划

| ID | 未定位内容 | 原因 | 验证计划（需 Coordinator / Developer 执行） |
| --- | --- | --- | --- |
| U-1 | **用户实际命中的具体丢失场景**（LP-1 追问 / LP-2 / LP-3 的哪种组合） | 需要用户侧配置与复现信息，本调研仅只读代码 | ① 读取用户 `settings.yaml` 的 `router.agents` 配置，确认视觉 agent 是否显式配置 provider/model；② 让用户复现一次"上传图 → 回复忽略图"并导出会话 JSONL，比对 `request/context`（该轮 provider/model）与模型输入层消息（是否有 image 块/marker）；③ 若为 LP-2，可在测试中新增"空 provider 视觉 agent + 接管后默认模型为包装路由"用例验证（建议新增 smoke 用例） |
| U-2 | e991616 / 6e7ab81 两个 commit 的确切 diff 与引入动机 | 任务禁止执行 git 命令 | Coordinator 用 `git show e991616 6e7ab81` 补 commit 详情；当前仅凭 commit 主题与代码对应关系推断（假设 H5） |
| U-3 | 主模型（当前用户主 agent 模型）对 system marker 的实际响应率 | 需运行时实测 | 关闭整轮路由（临时）后跑 N 个带图轮，统计主 agent 主动调 route_agent 的比例（目标 ≥90%，见 §3 问题②成功标准） |

---

## 5. 范围澄清（IN/OUT）

### IN（本调研产出，已交付）

| # | 交付物 | 位置 |
| --- | --- | --- |
| IN-1 | 问题①代码级定位（机制 A/B/C + 宿主约束证据） | 本文档 §4.1 |
| IN-2 | 问题②代码级定位（链路全景 + LP-1~LP-4 + 测试缺口） | 本文档 §4.2 |
| IN-3 | ≥2 修正方案候选 + 对比表（只出候选不定案） | 本文档 §8 |
| IN-4 | requirement-clarification 四步交付物（5 问法 × 2、成功标准、IN/OUT、干系人与约束假设） | 本文档 §3、§5、§6、§7 |
| IN-5 | 事实 / 假设 / 建议三分离 + 未验证假设逐条标注验证计划 | 本文档 §4.3、§9 |

### OUT（明确不做）

| # | 事项 | 为什么不做 |
| --- | --- | --- |
| OUT-1 | 修改任何产品代码（lib/、tests/） | 本任务为调研任务（硬门槛：产品代码零修改）；修正落地由后续任务（DEV）执行 |
| OUT-2 | 做技术选型/方案定案 | Analyst 职责边界：方案对比可给，选型留给 Architect / Coordinator；本调研只出候选 |
| OUT-3 | 修改 .governance/ 治理记录 | 治理记录由 Coordinator 维护（任务硬约束） |
| OUT-4 | 直接与用户交互（提问/确认） | Analyst 禁止与用户交互；需用户决策的点返回 Coordinator 经 ask_user_question 处理（见 §11） |
| OUT-5 | 修复文档陈旧问题（README/architecture 与代码不一致） | 属于修正方案落地范畴（方案候选 C2 已含"文档同步"项），不在本调研内改动 |
| OUT-6 | 定位 OAuth/账号池/CLI 子代理等非图片通路的其他潜在问题 | 超出本任务范围（问题①/②仅涉及图片与轮次路由）；未发现相关证据不强行扩展 |

---

## 6. 干系人与约束澄清

### 干系人

| 角色 | 职责 |
| --- | --- |
| 用户（插件使用者） | 报告问题现象（图片被忽略、专业 agent 抢轮次）；提供配置与复现；验收修正后行为 |
| Coordinator（本工作流） | 派发本调研；接收结构化结论；经 ask_user_question 收集用户决策（§11 决策点）；后续派发修正实现任务 |
| Architect（后续） | 对 §8 候选方案做选型定案；评估与宿主约束的兼容性 |
| Developer（后续） | 按定案实现修正；补齐测试缺口（LP-2 用例、U-3 实测） |
| Reviewer（后续） | 审查修正实现与测试 |

### 硬约束

| # | 约束 | 来源 |
| --- | --- | --- |
| C-1 | 专业 Agent 不能参与主 agent 轮次，只能作为被主 agent 调用的工具 | 用户报告 + DEC-003 |
| C-2 | 不改 DSH 宿主代码（F13 等架构事实，`docs/architecture.md:197-203`） | 项目架构非目标 |
| C-3 | 纯文本主模型不能接收裸图片块（UNSUPPORTED_CONTENT） | README:130、`smoke.mjs:938-941` 负向见证 |
| C-4 | 会话日志保留原件、模型输入层改写（F3 不变量，`docs/architecture.md:106-113`） | 项目架构不变量（注意：本调研发现该不变量与"图片不丢失"存在张力，方案需在两者间取舍——见 §8） |
| C-5 | 本调研零产品代码修改、零治理记录修改 | 任务硬门槛 |

### 假设（未验证前提，逐条标注）

| ID | 假设 | 验证计划 |
| --- | --- | --- |
| H1 | 用户报告"主 agent 完全忽略图片"的主因是 LP-2（空 provider 视觉 agent 解析到包装路由） | U-1：读用户 settings 配置 + 复现比对 request/context |
| H2 | 主模型对 system marker 的响应率不足（"大脑从不自觉"），marker 路径不可作为唯一兜底 | U-3：关整轮路由实测触发率 |
| H3 | 宿主后续不会改变 `agent/request` 瀑布语义（可继续作为修正实现的依据） | 宿主版本升级时回归验证 |
| H4 | 用户场景中视觉 agent 是 chat/agent 类型且 capabilities 含 image（满足 `listImageVisionAgents` 判据） | U-1 配置核对 |
| H5 | e991616（"remove image blocks from model input entirely"）即 `wrapper.js:220` 的 `rewrite: () => null`；6e7ab81（"inject route guidance into system"）即 `wrapper.js:190-192` | Coordinator 用 git 补 commit diff 核对 |
| H6 | 视觉 agent 未显式配置 provider/model（README 推荐的"留空跟随主模型"形态）是常见配置 | 设置页默认形态 + README:95 引导推断；U-1 配置核对 |

### 依赖

| 依赖 | 说明 |
| --- | --- |
| DSH 宿主版本 | 当前分析基于宿主 rc.7 代源码（`dsh-agent-loop`/`dsh-subagent` 观察事实）；宿主升级需回归 |
| git 历史 | e991616/6e7ab81/bf884d2/c2648d2 等 commit 详情需 Coordinator 补充（本任务禁 git） |
| 用户配置 | 视觉 agent 的实际配置（provider/model/capabilities）决定命中的丢失点 |

---

## 7. 非功能需求初筛

| 维度 | 初筛结论 | 备注 |
| --- | --- | --- |
| 性能 | 修正方案不得增加带图轮延迟感知（route_agent 通路已是异步工具调用）；包装路由文本轮须保持零开销（现有不变量 `docs/architecture.md:124-127`） | 整轮路由移除后，带图轮 = 主 agent 一次工具调用往返，延迟可比 |
| 安全 | 图片字节不进入纯文本主模型历史（现状 OK：工具结果以纯文本 marker 渲染，`tool.js:106-127`）；修正不得打开"路径注入"的任意文件读取面（`files` 已有 fs 校验，`service.js:676-701`） | 若候选 C2 复活路径注入，需保持现有 fs.resolve/stat 校验与 URL 限额 |
| 可用性 | 修正后"上传图 → 出分析"应端到端可用且可诊断：任一环失败须有明确错误（现状 LP-2 是静默丢失，违反可诊断性） | 建议修正引入"图片到达视觉输入"的可观测断言（成功标准） |
| 可维护性 | 现有机制三处并存（整轮路由/接管/marker）互相依赖，是本问题的复杂度来源；修正应减少机制面（候选 C1/C2 均移除整轮路由+接管） | 架构文档不变量 §3.2.5 需随方案重写 |
| **兼容性（重点：DSH 宿主约束）** | ① 专业 agent 只能作为工具存在 → 移除整轮路由（tool.js:199-232）；② `agent/request` 仅用于补缺失 provider/model，不得做模型替换；③ 子 agent 通路（`subagents.start`）是宿主认可的委派形态，route_agent 的 agent 类型已合规；④ 会话日志保留原件（F3）须保持，但"模型输入零图片痕迹 + 仅靠 marker"这一不变量与图片不丢失冲突，需在方案中显式处理 | 兼容性验收：带图轮 `request/context` 恒为主模型（问题①成功标准）；视觉输入 100% 收到图片载体（问题②成功标准） |

---

## 8. 修正方案候选（只出候选，不定案）

> 所有候选的共同前提：**不修改 DSH 宿主代码**（C-2）。候选按"机制面大小"排列，均为独立可回滚单元。

### 候选 C1：撤销整轮路由 + 撤销模型接管，纯工具通路（最小机制面）

- 改动要点：
  - 移除 `tool.js:199-232` 的 `agent/request` 整轮路由。
  - 移除默认模型接管（`wrapper.js:241-258`）与会话接管（`client.js:3188-3218`），用户模型选择回归用户控制。
  - 包装路由**仅保留准入包装**（声明 `['text','image']` 过准入，`wrapper.js:166-167, 178-179`），但**仅对"当前用户显式选择包装路由"的会话生效**，不再自动接管；图片块改写到模型输入仍用 marker（LP-1 保留，LP-2 因不再接管而消失，LP-3 死规则移除）。
  - 移除 `[用户附带图片]` 死规则（`service.js:2205`、`tool.js:65`），替换为与真实机制一致的描述。
- 利：机制面最小，直接消除问题①全部三个机制；符合宿主约束；回滚 = 恢复三个改动点。
- 弊：**LP-1/LP-4 仍在**（图片信息仍只靠 marker + 主模型自觉调 route_agent）；若主模型不响应 marker，图片仍被忽略——需 U-3 实测兜底，若触发率不足则 C1 不成立。
- 风险：高（依赖主模型工具调用纪律）；图片通路可靠性完全压在主 agent 行为上。
- 回滚考量：单 commit 可逆；不改 schema、不改配置格式。

### 候选 C2：移除整轮路由/接管 + 复活"落盘 + 路径注入"文本信号（对文本主模型最可靠）

- 改动要点：
  - C1 全部改动。
  - 客户端（`client.js` AttachButton）改为：选图 → 落盘到会话工作区 `.router-files/` → 以**文本消息**注入 `[用户附带图片] <路径清单>`（复活 bf884d2 移除的旧机制，但走文本路径而非 imagePrompt RPC）。
  - 包装路由**不再需要**（消息无 image 块，纯文本模型无准入问题）→ 卸载准入包装注册（`wrapper.js` 全部）。
  - 主 agent 依据 promptText 规则（`service.js:2205` 恢复为真）调 `route_agent(files: [路径])`；视觉 agent 按 `files` 分发（chat 内联注入/agent、cli 路径读取，`service.js:637-653` 已实现）。
- 利：图片信息以**文本路径**形式永远存在于主 agent 的模型输入（不依赖 marker、不依赖模型自觉看 system）；消息历史可读、可诊断；视觉通路复用现有 `files` 分发（已测，`smoke.mjs:417-434`）。
- 弊：复活被 bf884d2 主动移除的机制（当时是为"原生体验"——图片块原生显示）；气泡里图片以路径文本呈现而非原生缩略图（需浏览器侧 toolview/附件卡片渲染兜底，或接受路径文本）；"大脑不自觉"问题仍在（主 agent 仍须主动调 route_agent，但文本信号比 system marker 更易被模型遵循）。
- 风险：中（主 agent 工具调用纪律仍是依赖项；体验回退风险）。
- 回滚考量：可逆；但涉及客户端发送路径，需与原生草稿轨的取舍决策（回归用户"贴图即原生"的既有习惯）。

### 候选 C3：保留整轮路由但修复解析（最小改动、治标）

- 改动要点：保留 `tool.js:199-232` 与接管，但修复 LP-2：
  - `resolveAgent`（`service.js:589-607`）对空 provider 的 agent 解析时，若当前默认模型是包装路由，剥掉 `-router` 后缀解析到**原 provider**（或维护"原 provider 集"查找表）。
  - 同步修复 `[用户附带图片]` 死规则与 README/architecture 文档。
- 利：改动最小；带图轮仍"整轮直传"（图片原生直达视觉模型，无 marker 依赖）；LP-2 静默丢失消除。
- 弊：**问题①完全不解决**——整轮路由 + 接管依旧违反宿主约束；视觉模型仍以主 agent 身份带主 agent 工具/system 运行；机制面不变。
- 风险：高（架构冲突持续，宿主升级可能击穿）。
- 回滚考量：仅 `resolveAgent` 一处，易回滚；但方向与宿主约束相悖，不建议作为最终形态。

### 候选对比表

| 维度 | C1 纯工具 + marker | C2 纯工具 + 路径注入 | C3 整轮路由修复 |
| --- | --- | --- | --- |
| 问题①（架构冲突） | ✅ 消除（移除全部三机制） | ✅ 消除 | ❌ 保留 |
| 问题② 图片不丢失 | ⚠️ 依赖 marker + 主模型自觉（LP-1/LP-4 残留） | ✅ 文本路径常驻模型输入（最可靠） | ⚠️ 修复 LP-2，但 LP-1/LP-4 残留 |
| 主 agent 工具调用依赖 | 高 | 中（文本信号更易遵循，仍需实测） | 低（视觉模型直答） |
| 机制面 / 可维护性 | 最小 | 小（复活旧机制 + 文档同步） | 大（三机制并存） |
| 体验 | 原生图片块显示（日志层） | 路径文本呈现（需展示兜底） | 原生图片块显示 |
| 诊断性 | marker 依赖，难观测 | 路径文本可读，易观测 | 静默丢失已消除，仍难观测视觉输入 |
| 风险 | 高（模型自觉不可靠） | 中 | 高（宿主约束持续违反） |
| 回滚 | 单点可逆 | 可逆（需体验决策） | 单点可逆 |
| 测试缺口补足 | 需补 LP-2 用例 + U-3 实测 | 需补客户端落盘 + files 端到端用例 | 需补 LP-2 用例 |

> 定案建议（不定案，供 Coordinator/Architect 参考）：C1 与 C2 是符合宿主约束的正向候选；C2 对"文本主模型可靠看见图片"最稳妥，C1 体验最原生。若 U-3 实测主模型对 marker 响应率 ≥90%，C1 可优先；否则 C2。C3 仅作临时止血候选（治标不治本，不推荐为最终形态）。

---

## 9. 事实 / 假设 / 建议汇总

### 事实（代码级证据，可复查）
1. `tool.js:199-232` 存在整轮路由（`agent/request` 瀑布替换 provider/model），测试断言 `smoke.mjs:791-811`。
2. `wrapper.js:241-258` 默认模型接管、`client.js:3188-3218` 会话接管；测试断言 `smoke.mjs:1004-1073`、`client-render.mjs:637-659`。
3. `wrapper.js:43-55, 190-192, 220`：marker 进 system、图片块整体删除（`rewrite: () => null`）。
4. `wrapper.js:76-87`：marker 只覆盖最后一条 user 消息（历史图不标记，`smoke.mjs:1040-1042` 断言）。
5. `service.js:489-497, 589-607`：空 provider agent 回落 `agentDefaultModel.currentSelection()`；多模态开启后该值为包装路由 → 视觉 agent 可解析到包装路由（LP-2 根因链）。
6. `service.js:952-961`：`runChat` 的 `llm.stream` 不传 tools → 包装路由内 marker 指示的 route_agent 调用无法发生。
7. `service.js:2205`、`tool.js:65`：`[用户附带图片]` 路径清单规则存在，但客户端 `client.js:3225-3269` 不再落盘/注入（旧机制 `bf884d2` 已移除，`docs/architecture.md:155-157, 186-188`）。
8. 宿主：`dsh-agent-loop/lib/index.js:685-737` 瀑布替换生效于主轮分派；`index.js:642-658` 以主会话身份落盘；`index.js:611-613` 工具与 system 来自主装配；`dsh-subagent/README.md:67-69` 子 agent 独立会话（工具形态）；`dsh-agent-loop/README.zh.md:52` 瀑布设计语义为"补缺失 provider/model"。
9. 测试缺口：`smoke.mjs:772, 791-811` 整轮路由用例仅覆盖显式 provider 视觉 agent。

### 假设（未验证，验证计划见 §4.3 / §6）
- H1 用户症状主因 = LP-2；H2 marker 响应率不足；H3 宿主瀑布语义稳定；H4 视觉 agent 为 chat/agent + image 能力；H5 commit 与代码对应关系；H6 空 provider 是常见配置。

### 建议（不定案）
- 修正方向以"移除整轮路由 + 移除自动接管"为骨架（C1/C2），图片信号从"system marker"转向"主 agent 可稳定感知的载体"（附件引用或路径文本）。
- 修正落地必须同步：文档同步（README:18, 101, 130 / `service.js:2205` / `tool.js:65`）、补测试（LP-2 用例、端到端图片到达断言）、U-3 实测。
- 保留 `selectAttachments`/`recentAttachmentBlocks`（`service.js:1629-1670`）与 `files` 分发（`service.js:637-653`）作为图片传递的既有基座——它们本身无丢失问题。

---

## 10. 证据清单

| # | 证据 | 位置 |
| --- | --- | --- |
| E-1 | 整轮路由实现 + 测试断言 | `lib/tool.js:199-232`；`tests/smoke.mjs:791-811` |
| E-2 | 接管实现 + 测试断言 | `lib/wrapper.js:241-258`；`lib/client.js:3188-3218`；`tests/smoke.mjs:1004-1073`；`tests/client-render.mjs:637-659` |
| E-3 | marker 注入 + 图片块删除 + 只标记最后 user 消息 | `lib/wrapper.js:43-55, 76-87, 181-194, 203-222`；`tests/smoke.mjs:1015-1042` |
| E-4 | 空 provider 回落默认模型 → 包装路由解析链 | `lib/service.js:489-497, 589-607, 932-961` |
| E-5 | `[用户附带图片]` 死规则 | `lib/service.js:2205`；`lib/tool.js:65`；旧机制移除记录 `docs/architecture.md:155-157, 186-188` |
| E-6 | 客户端无落盘/路径注入（原生草稿轨） | `lib/client.js:3225-3269, 3440-3461` |
| E-7 | 宿主约束事实 | `@deepseek-ai/dsh-agent-loop/lib/index.js:606-664, 685-737`；`@deepseek-ai/dsh-agent-loop/README.zh.md:52`；`@deepseek-ai/dsh-subagent/README.md:67-69` |
| E-8 | 架构文档自认"大脑从不自觉" + 不变量 F3 | `docs/architecture.md:106-127` |
| E-9 | 治理上下文：DEC-003 发布暂停、RES-001 入账、EV-001 commit 主题确认 | `.governance/decision-log.md:7`；`.governance/plan-tracker.md:47`；`.governance/evidence-log.md:5` |

---

## 11. 需 Coordinator 补充 / 需用户决策的点

| # | 事项 | 类型 | 说明 |
| --- | --- | --- | --- |
| D-1 | 确认成功标准指标（§3 问题①/②的"怎么算成功"） | 用户决策 | 建议指标：带图轮 `request/context` 恒为主模型（100%）；图片载体到达视觉输入率 100%；route_agent 带图触发率 ≥90% |
| D-2 | 视觉 agent 实际配置（是否显式 provider/model） | 用户/Coordinator 补充 | 决定命中的丢失点（U-1）；需读取 settings.yaml 或用户确认 |
| D-3 | e991616 / 6e7ab81 commit 详情 | Coordinator 补充 | 需 git 命令补 diff（H5 核对） |
| D-4 | 方案定案（C1/C2/C3 选择） | 用户决策（经 Coordinator） | 本调研只出候选；定案后派发 Developer 实现 |
| D-5 | 若选 C2：接受"图片以路径文本呈现"的体验回退？ | 用户决策 | 涉及复活 bf884d2 移除的机制，需体验取舍 |
