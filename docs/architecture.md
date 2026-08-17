# 多模态路由平台：整体分析与设计

> **定稿 v1**（已确认：twin 组默认/隐身后置；后端链复用专业 agent 列表；
> 首批工具 4 个；按里程碑逐条提交）。
>
> 定位：`dsh-agent-router` 的核心不是 vision——vision 只是**先锋验证模态**。
> 平台目标是支撑任意模态扩展：视觉识别、语音识别、实时语音对话、视频识别与
> 生成、图片生成等全链路能力；主（纯文本）agent 始终是"大脑"，模态能力以
> 透明、原生、可迭代的方式挂接。

## 1. 目标与原则

- **原生体验**：模态内容（粘贴截图等）走 DSH 原生链路（粘贴 + 回车），
  界面按原生机制显示原件；不接管 composer、不改宿主代码。
- **大脑不动**：主模型的文本轮在模型、上下文、成本上完全不受影响。
- **模态可插拔**：新增模态 = 新增「管线处理器 + 改写器 + 工具包 + 后端链
  配置」，不动平台骨架（不变量见 §3.3）。
- **证据可验证**：模态内容中的文字是**不可信证据**；工具可精确定位/裁剪/
  对比，答案按内容缓存，支持像素级闭环。
- **安全**：不损坏用户数据；产物只写会话工作区；凭据走 credentials 缝。

## 2. 事实基础（DSH 0.1.0-rc.7 已逐条验证）

| # | 缝隙 | 用途 |
| --- | --- | --- |
| F1 | `ctx.llm.registerAdapter([provider], adapter)`（公开 API） | 注册自有路由与适配器；适配器完全掌控序列化与委托 |
| F2 | prompt 准入读"当前选中模型"的 `inputModalities` | 包装路由声明含 image 即放行；准入是模型级而非会话级 |
| F3 | 会话日志与模型输入是两层：UI 读日志，适配器收 `options.messages` | 日志保留模态原件（UI 原生显示）、模型输入层改写，互不污染 |
| F4 | `agent/request` / `agent/pre-step` / `agent/request-error` 瀑布 | 每请求改路由、改进入步骤的消息、处理请求失败 |
| F5 | 工具注册 + `tool.call.toolview` + `conversation.chat.*` 节点槽 | 模态工具集 + 专用展示卡 |
| F6 | `attachments`（内容寻址、批量保存、限额、校验） | 模态原件持久化与去重 |
| F7 | `files` 参数分发 + fs 服务 + 工作区 | 音频/视频/任意文件的既定通路（无准入问题） |
| F8 | composer 仅接受图片块（粘贴/拖拽，MIME 白名单） | 音频/视频不能以消息块进 composer → 只能走工作区文件（录音/落盘按钮 → 路径进消息） |
| F9 | subagents、settings/credentials/typert、`llm/adapters-updated` 事件 | 委派、配置、远程、热更新 |
| F10 | `ctx.llm.registration(provider).adapter`、`llm.listProviders()` | 惰性获取原适配器做委托；注册的路由自动出现在模型选择器 |
| F11 | `sessions.provide` 标准套件（useInput/inputActions）、客户端 `conversation` 服务 | composer 附件入口（可选增强） |
| F12 | composer 链槽选择器仅见 `{interactions, session}`；交互帧仅宿主私有通道可铸造 | 插件**不能**按草稿状态接管 composer；原生输入条不可替换 |

**已验证参考模式**（dsh-vision-router v1.5.2 源码）：twin 包装路由声明
`['text','image']` 过准入（F1/F2）；`rewriteImagesDeep` 在适配器序列化层把
图片块改写为文本证据，**日志保留原件**（F3）；文本大脑按需调用视觉工具
（F5）；后端链逐级降级 + 缓存 + 降采样；本插件独立实现同构模式，不复刻其
免费端点/工具全集。

## 3. 核心架构（五层，模态无关）

```
┌───────────────────────────────────────────────────────────────┐
│ L1 准入包装层  Admission Wrapper                                │
│   每 provider 一个包装路由（<provider>-router）：                │
│   resolveModel 镜像原元数据并声明已接入的模态（如 +image）；      │
│   stream()：文本轮委托原适配器；含模态块轮先经 L3 改写再委托。    │
├───────────────────────────────────────────────────────────────┤
│ L2 模态输入管线  Modality Input Pipeline                        │
│   统一入口：消息块(image) / 工作区文件(audio/video/任意)          │
│   职责：鉴权、限额、魔数识别、缓存寻址、降采样、证据缓存           │
├───────────────────────────────────────────────────────────────┤
│ L3 模型输入改写层  Model-Input Rewrite Registry                 │
│   模态 → 文本证据 的注册表（image→描述/工具标记；                │
│   audio→转写文本；video→抽帧描述+时间轴…）                      │
│   只改模型输入，绝不写日志（F3）                                │
├───────────────────────────────────────────────────────────────┤
│ L4 模态工具包  Modality Tool Packs                              │
│   每模态注册一组工具（vision: describe/ground/crop/present…；   │
│   audio: transcribe/segment…；video: frames/subtitles…）        │
│   共享基础设施：后端链、降级、超时、缓存、产物、展示卡            │
├───────────────────────────────────────────────────────────────┤
│ L5 后端链解析  Backend Chains                                   │
│   复用现有 agent/账号/池/CLI 体系：每个模态 = 有序后端链          │
│   （主 agent + 降级 agents），逐级失败切换（池逻辑同构）          │
└───────────────────────────────────────────────────────────────┘
```

### 3.1 各层职责与依赖

- **L1**：对用户几乎不可见。注册包装路由（模型选择器出现
  「+ 自动识图」组）；适配器内部：`stream()` 判断 `messages` 是否含模态块
  → 无：直接 `ctx.llm.stream({provider: 原 provider, messages})`；有：
  经 L3 改写后委托。`resolveModel` 镜像原元数据并合并已接入模态。
- **L2**：模态处理器接口 `{ detect(input), limits(), evidence(id, ctx) }`。
  image 处理器：魔数识别、attachments 缓存寻址、降采样；audio/video 处理器：
  工作区文件、转码/抽帧、分片。
- **L3**：注册表 `modality → rewrite(block, ctx) → text[]`。image 改写器：
  命中证据缓存 → 描述文本；未命中 → 工具标记（告知大脑可调用哪些工具及
  attachmentId/路径）。改写覆盖嵌套 tool-result（原文本适配器会递归拒绝）。
- **L4**：工具包 = `name 前缀 + 一组 defineTool`。共用 `ToolHost`：解析
  L5 后端链 → 逐级尝试 → 记录统计 → 产物物化（工作区/附件）→ 返回
  结构化 JSON + 展示卡。
- **L5**：后端链 = 有序的**专业 agent 引用**（复用现有 agent 配置体系）+
  每模态默认链（未配置时）。失败分类（认证/限流/超时/上下文/网络）与
  冷却熔断共用现有池统计结构。

### 3.2 关键不变量（防架构腐化）

1. **日志 = 原件，模型输入 = 改写文本**；转换只发生在 L3 单点。
2. **模态是插件化扩展点**：L2/L3/L4/L5 都是注册表；平台骨架（L1 适配器、
   ToolHost、配置/统计）不感知具体模态。
3. **后端链与"专业 agent"同一身份体系**：L5 引用 agent id，
   配置/统计/账号/池全部复用，不引入平行配置结构。
4. **工具优先为默认**：文本大脑按需调用工具（可迭代多步、KV 缓存稳定）；
   整轮路由（图片轮直接交给视觉模型作答）作为可选开关。

### 3.3 执行通路扩展（`agent.type` 作为注册点）

现有 `chat / agent / cli / image / speech` 类型成为执行通路注册表的初值；
新增通路（如 `realtime`）只新增实现，不改 `run()` 分发骨架。

## 4. vision 先锋落地（本轮实施范围）

1. **L1**：为已启用 provider 注册 twin 包装路由（`<provider>-vision`，
   resolveModel/listModels 镜像原适配器并声明 `['text','image']`；
   经 F10 惰性获取原适配器委托）。**twin 注册随"视觉 agent 存在且总开关
   开启"自动开关**（保持"开启视觉 agent 时才解除限制"的语义）；用户选
   「+ 自动识图」组后粘贴+回车原生可用；原模型组不动。隐身接管后置。
2. **L3**：image 改写器（证据缓存 → 描述文本；未命中 → 工具标记）。
   L1 阶段先落地最小改写（静态工具标记 → route_agent/includeImages，
   复用既有视觉通路端到端可用）；L3 阶段升级为注册表 + 证据缓存。
   会话上下文附带（已实现）保留在 L4 工具层。
3. **L4**：首批核心工具 4 个——`vision_describe`（带问题与上下文）、
   `vision_ground`（定位）、`vision_crop`（裁剪放大）、`vision_present`
   （产物发布为持久附件）；14 个全量后置。
4. **L5**：后端链 = **视觉 agent 列表**（agent id 有序数组 = 链，复用
   agent/账号/池/统计单一身份体系；单 agent 即单后端）。降级/缓存/降采样
   基础设施随 ToolHost 落地。
5. **展示**：`tool.call.toolview` 专用卡（复用已实现机制）。
6. **保留**：统计、账号、池、CLI 子代理、`route_agent` 通用路由。
7. **移除**：上一阶段"发送条 + RPC 路径机制"（L1 落地后被原生粘贴+回车
   取代；`imagePrompt/imageData` RPC 与附件按钮/发送条组件随机制删除，
   文档注明原因）；视觉调用上下文附带保留。

## 5. 后续模态扩展清单（验证泛化性）

| 模态 | 输入 | L2 管线 | L3 改写 | L4 工具 | L5 后端 | 额外 |
| --- | --- | --- | --- | --- | --- | --- |
| 语音识别 | 工作区音频（F8） | 转码/分片 | 转写文本+时间戳 | transcribe/segment/summarize | speech 链 | 录音按钮（工作区落盘）；转写缓存 |
| 实时语音对话 | 麦克风流（客户端） | 流式分帧 | 流式转写→会话文本；TTS 回放 | realtime_session 控制 | STT/TTS 链 | 客户端面板；宿主 WebSocket 通路 |
| 视频识别 | 工作区视频 | ffmpeg 抽帧 | 帧描述+时间轴摘要 | extract_frames/subtitles/describe | 视觉链（帧级）+ agent 通路（整片） | 帧缓存、采样策略 |
| 视频/图像生成 | 文本提示 | 生成请求 | 产物发布（附件/工作区） | generate + present | 生成端点链（image 类型泛化） | 尺寸/时长/格式 |
| （预留）文档/表格/3D… | 工作区文件 | 按需处理器 | 摘要/结构化 | 按需工具包 | 对应 agent | 骨架无需改动 |

## 6. 兼容与迁移

- 现有 agent/账号/池/CLI 配置原样生效；视觉 agent 即 L5 后端链首项。
- 会话历史中的旧机制产物（`[用户附带图片]` 路径消息、工具结果标记）
  在新版本照常显示/不破坏。
- README/版本按里程碑更新；每里程碑独立提交、测试全绿。

## 7. 里程碑与提交计划

1. `docs`: 本设计定稿（✅ 已定稿，随下一提交落库）。
2. `feat(L1)`: twin 包装路由 + 适配器委托 + 最小图片块改写（静态工具
   标记 → route_agent/includeImages，端到端可用）+ 开关门控 + 测试。
3. `feat(L3)`: 改写器注册表 + image 证据缓存（视觉调用结果按内容哈希
   缓存）+ 工具标记升级 + 工具包基础设施（ToolHost：后端链解析/降级/
   超时/产物/展示卡）。
4. `feat(L4-vision)`: vision_describe / vision_ground / vision_crop /
   vision_present 四工具 + toolview 卡。
5. `chore`: 移除发送条/RPC 路径机制（被 L1 取代）。
6. 后续模态按 §5 逐行落地。

## 8. 非目标（明确不做）

- 不改 DSH 宿主代码；不接管原生气泡/composer（F3/F12 已满足原生显示，
  无必要且无合法通道）。
- 不复制 dsh-vision-router 的免费端点/14 工具全套（按需逐步吸收）。
- 桌面全屏截屏（隐私敏感，后置可选）。
- 「原始路径零传输」截图目录点选（粘贴原生可用后非必需，后置可选增强）。

## 9. 已确认决策（2026-08 确认）

1. **准入包装形态**：twin 组默认（「+ 自动识图」组，原组不动）；
   隐身接管后置。
2. **后端链配置形态**：复用专业 agent 列表（agent id 有序数组 = 链）。
3. **首批工具范围**：`describe / ground / crop / present` 4 个。
4. **节奏**：按 §7 里程碑逐条提交，测试全绿后立即提交。

## 附录 A：机制验证记录（已实测，rc.7）

`tests/smoke.mjs`「twin wrapper mechanism (real LlmRuntime)」一节在真实
`LlmRuntime` 注册表上验证（提交 `2b582e1`）：

| 断言 | 结论 |
| --- | --- |
| 包装模型 `resolveModelInfo` 含 image | ✅ 准入检查放行 |
| 原路由保持 text-only | ✅ 原模型组不受影响 |
| twin 路由出现在 `listProviders` / 目录镜像带自身 provider id | ✅ 模型选择器可见 |
| 图片轮经 twin 完成；委托适配器只见改写文本、无裸图片块 | ✅ L3 语义成立 |
| 裸图片块直进原适配器 → `finish.kind === 'error'` | ✅ 负向见证（twin 是唯一放行路径） |
| 文本轮原样委托 | ✅ 大脑零开销 |

**关键实现语义**（记录于测试注释，L1 实现必须遵守）：
- 适配器异常在 rc.7 被转换为终态 `finish` 错误块而非抛出；
  twin 的 `yield* llm.stream(...)` 委托会把错误块原样上抛给 agent-loop。
- `resolveModel` 必须镜像原适配器返回并覆写 `provider` 为 twin 路由名、
  合并 `inputModalities`；`listModels` 同理（宿主按 route 校验
  `model.provider === provider`）。
- 原适配器经 `ctx.llm.registration(provider).adapter` 惰性获取（公开 API）。
