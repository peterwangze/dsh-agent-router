# dsh-router · DeepSeek Harness 多模型路由插件

让主 agent（模型）感知并可调用一组**专业 agent**：每个专业 agent 可配置独立的
服务商与模型（视觉识别、图片生成、翻译……），未配置时自动复用主 agent 当前模型。
模型与服务商配置完全复用 DSH 模型配置基座（`llm` 注册表 + `settings` seam +
`credentials` seam），并提供 GPT 等账号的原生登录入口、服务商模型自动发现，以及
实时的分 agent 用量统计界面。

## 组成

| 行 | 名称 | 平面 | 作用 |
|---|---|---|---|
| `router` | `dsh-router` | 宿主 | `router` 服务（目录解析/统计/执行引擎）+ `router` settings namespace + `/api/router/*` Remote 契约 + 浏览器设置页（dual-face，`dsh.client` 指向 `./client`） |
| `tool-router` | `dsh-router/tool` | 宿主（推荐） | `route_agent` 模型工具 + `router:agents` 系统提示段（order 120），让主模型感知可用专业 agent |

两行都挂宿主组合时：宿主平面注册的工具沿 scope 父链对**所有 agent 会话**
可见——内置预设（standard/cordis/code/minimal）与用户自定义/复制的任意
预设都自动获得 `route_agent` 工具与提示段，开放使用零配置。`tool-router`
也可按预设挂载（如 governance 模板）作分层覆盖；同名在子层遮蔽父层，
二者不冲突。宿主行未挂载时，tool 行自动空转（工具调用报"服务不可用"、
提示段输出为空）。

## 需求对照

1. **原生插件形态 + 开关**：普通 cordis 组合行（可 `disabled: true` 整体关闭），
   并出现在 设置 → 插件 清单中；另有运行层总开关 `settings.yaml` 的
   `router.enabled`（设置页顶部可切换），关闭后 `route_agent` 拒绝调用、
   提示段清空、统计暂停，无需重启。
2. **扩展设置界面自定义 agent（分类卡片 + 展开配置）**：除总开关外全部配置按
   分类组织为可展开卡片——「多模态账号管理」「统计信息」「专业 Agent」。
   专业 Agent 为卡片列表：默认折叠显示摘要（名称/类型/生效模型/简要用量），
   点击展开配置（类型 chat/agent/image/speech、服务商/模型/推理强度/温度/
   轮数/尺寸/端点/凭据引用/工具白名单）；列表末尾「+」添加新 agent，
   内置图片识别/图片生成/翻译/语音识别/视频生成/通用子 Agent 预设。
   每个 agent 可空置服务商与模型（= 复用主 agent 模型）。
3. **主 agent 感知并正确使用（所有预设通用）**：tool 行注册系统提示段
   动态列出启用 agent 的能力标签、说明与使用规则（配置变更即时生效），
   并提供 `route_agent(agent, task, attachments, includeImages, files, filePath, extra)`
   工具；入参经工具 schema 校验，附件**按需显式派发**：`attachments` 传
   附件序号数组（0 起，按最近一条含附件的用户消息中的出现顺序，越界/
   非整数明确报错）、`includeImages: true` 快捷转发该消息全部图片，两者
   都不给 = 不携带任何附件（杜绝隐式 find 拿错）；`files` 传工作区文件
   路径或 http(s) URL 列表（**一次多个、不同类型**，服务端 resolve+stat
   校验；URL 由宿主下载落盘到工作区 `.router-files/`），**按内容能力化
   分发**：agent 类型把路径注入子代理任务由其用 fs 工具自行读取；chat
   类型把图片文件（PNG/JPEG/WebP/GIF，要求该 agent 声明 image 能力）经
   附件服务内联注入、文本文件内联进 task，其余二进制/目录明确报错并提示
   改用 agent 类型（image/speech 类型不收 files）；规则明确：带图片的
   任务路由给 `image` 能力 agent、语音转写路由给 `audio` 能力 agent；
   `filePath` 供语音识别（speech）类 agent 指定工作区音频文件；agent 类型
   可读写工作区任意文件（task 写明路径，产物落盘并在结果中报告路径）。
   **类型 = 执行方式，能力 = 用户自定义的调度契约**：类型只决定走哪条
   调用通路（远端模型 / 子代理 / 文生图 / 语音转写），不限制能力；路由
   判定与 files 分发都以能力标签为准（设置页类型字段下方有说明）。
4. **复用模型配置基座**：
   - 服务商/模型数据来自 `llm` 注册表（`api.llm.providers/models`），与
     「设置 → 模型」页完全一致；
   - **多模态账号登录（ChatGPT/Claude/Grok/Gemini）**：账号管理卡片内置
     四大账号预设 + 任意 `llm-pi-ai` 服务商，输入 API Key（可选 Base URL 覆盖
     代理端点）即写入 `llm-pi-ai.providers.<route>` profile + `credentials`
     （`<ROUTE>_API_KEY`），登录后其模型立即出现在模型列表；harness 模型
     适配层目前仅支持 API Key 认证，官方 OAuth 登录流不在支持范围（
     ChatGPT/Claude/Grok/Gemini 订阅 plan 均可使用官方 API Key）；
   - **服务商模型自动发现**：「发现模型」按钮经 `api.llm.discoverModels`
     （`dsh-llm` 的端点询问能力）拉取候选模型一键选用。
5. **账号池（多账号健康路由，opencodex 风格）**：把多个已授权的 OAuth 账号
   组成池（`router.pools`），agent 的 `account` 字段可指向池（`pool:<id>`）；
   调用时按策略选号——`healthy`（失败最少、最近未失败优先，默认）/
   `usage-lowest`（用量最低优先）/ `round-robin`（轮询）——单个账号失败
   自动切换到下一个健康账号并记入该账号的健康统计；池内每个账号支持
   **一键授权登录**（OAuth2 + PKCE：宿主生成 verifier 并登记一次性会话，
   服务商回调 `/router-oauth/callback` 后宿主自动完成 code → token 交换）。
   注意：ChatGPT/Claude 官方 API 不提供 OAuth，其消费级账号（opencodex
   账号池所用）面向 Web 后端、本插件不集成非官方协议；池内账号适用
   于 Gemini 等标准 OAuth2 服务商与任意 Bearer token 账号。
6. **实时用量统计（两级明细）**：宿主服务按 agent 与按账号（服务商，含模型
   细分）两级聚合调用数/失败数/输入输出 tokens/耗时，保留最近 100 条调用
   记录与近 90 分钟分钟级分布；「统计信息」卡片内 Agent 级明细（行内展开
   分钟级柱状图）与账号级明细（行内展开模型细分 + 柱状图）并存，每 2 秒
   轮询刷新，支持一键清空；每个 agent 卡片同时内嵌自身的简要用量条。

## 安装（本部署）

```powershell
# 1. 让 loader 解析 dsh-router（junction；或改为把包发布/拷贝到 profiles\node_modules）
New-Item -ItemType Junction -Path C:\Users\peter\.dsh\profiles\node_modules\dsh-router `
  -Target D:\AI\agent\deepseek\plugins\router

# 2. 宿主行 + 模型面向行：profiles\web\cordis.patch.yml（两行并列 insert，
#    宿主平面注册 → 所有预设（含自定义/复制的预设）的会话自动获得
#    route_agent 工具与提示段，开放使用零配置；已写入）
#    - insert:
#        - id: router
#          name: dsh-router
#        - id: tool-router
#          name: dsh-router/tool

# 3. 重启 DSH（组合在进程启动时加载）
```

开发期冒烟测试（需要插件目录下 `node_modules\@deepseek-ai` junction 指向
profile 的依赖树）：

```powershell
node tests\smoke.mjs
```

## 配置示例（settings.yaml）

```yaml
router:
  enabled: true
  agents:
    vision:            # 视觉识别：chat 类型 + image 能力（files 传图片路径/URL 直接内联注入）
      name: 视觉识别
      type: chat
      description: 识别与描述图片内容（OCR、界面截图、图表解读等）
      capabilities: [image]
      provider: openai
      model: gpt-4o
    draw:               # 图片生成：DALL·E 3
      name: 图片生成
      type: image
      description: 根据文字描述生成图片
      provider: openai
      model: dall-e-3
      imageSize: 1024x1024
    translate:          # 翻译：复用主 agent 模型
      name: 翻译
      type: chat
      description: 多语言互译与润色
      # provider / model 留空 = 跟随主模型
llm-pi-ai:
  providers:
    openai:             # 由「账号登录」自动写入
      apiKeyEnv: OPENAI_API_KEY
```

凭据存于 `~/.dsh/.credentials.yaml`（`OPENAI_API_KEY: sk-...`）。

## 执行语义

- **chat**：经 `llm.stream` 单轮（可配 `maxRounds` 多轮续写）调用目标服务商/模型；
  携带图片时先经 `llm.resolveModelInfo` 检查 `image` 模态，模型不支持则明确报错；
  图片以附件引用（`image` 内容块）直传，由适配器解析字节。
- **agent**：经 `subagents` seam 委派完整子 agent（`agentOptions` 覆盖 provider/model，
  `persona` 注入专业提示）；默认拒绝子 agent 再调用 `route_agent` 防止自递归，
  `tools` 字段可显式指定工具白名单；委派深度超过 4 层拒绝。子 agent 继承父
  会话 cwd 与同一 preset（相同工具与沙箱权限）；委派时 prompt 自动附带
  [会话上下文] 注入（工作目录 + 附件说明）并把最近图片以 `image` 附件块
  直传——子 agent 直接查看图片，无需也不应按文件路径读取附件。
- **image**：OpenAI 兼容 Images API（`endpoint` 默认官方端点，`apiKeyEnv` 默认
  `OPENAI_API_KEY`），产物经附件服务存回会话，直接以图片消息呈现。
- **speech**：OpenAI 兼容 Audio Transcriptions 端点（Whisper 系，`model` 默认
  `whisper-1`）；音频由 `route_agent` 的 `filePath` 参数指定工作区文件，
  经沙箱文件服务读取（≤25MB）后 multipart 上传，返回转写文本。
- **OAuth 账号直连（chat）**：agent 的 `account` 字段指向插件独立管理的
  OAuth 账号时，调用由本插件直连端点完成（`openai-completions` /
  `anthropic` / `gemini` 三种协议，Bearer token 认证，支持图片以
  base64 data URL 多模态输入），**不注册任何 llm 路由**——OAuth 账号
  不出现在「设置 → 模型」与共享模型列表中，模型列表由插件单独维护
  （手工添加或经 `oauthDiscover` 从 `GET /models` 发现）。

统计为进程内内存数据（重启清零），由 `router` 服务维护；所有 RPC 走 typert
gateway 严格契约（`/api/router/catalog|stats|test|reset|config|save|oauthBegin|oauthTokenExchange|oauthDiscover`）。
配置读写（config/save）经由本插件自己的 Remote 端点：api-proxy 的
`settings.describe/mutate` 只放行其内置白名单 namespace（回答
`settings-not-exposed`），第三方 namespace 无法经该 wire 面读写；宿主侧仍走
`ctx.settings` seam（settings.yaml `router:` 分节、热生效、revision 乐观并发）。
API Key 账号登录写入的 `llm-pi-ai` 在白名单内，仍走固定 settings/credentials 域。

## OAuth 账号（官方登录，插件独立管理）

- 登录方式一：**一键授权登录（OAuth2 + PKCE，推荐）**——点击后自动弹出
  官方授权页，完成授权后服务商重定向到宿主回调页，宿主自动完成 code →
  access_token 交换并存入 credentials seam（`ROUTER_OAUTH_<ID>_TOKEN`），
  设置页轮询到登录态后自动关闭弹窗，全程无需复制粘贴。实现要点：
  - `oauthBegin` RPC 在宿主生成 PKCE（verifier + S256 challenge）与随机
    state 并登记 10 分钟有效的一次性会话；`oauthTokenExchange` 支持两种
    入参：一键模式只传 `code` + `state`（宿主按会话取回 verifier），
    手动模式传 `accountId` + `codeVerifier` + `redirectUri`（向后兼容）。
  - **添加账号即一键授权（opencodex 式体验）**：「+ 添加账号」直接列出
    四大服务商预设，点一下即自动创建账号（id/名称自动生成，无需任何
    输入）：Gemini 立即弹出官方授权页完成授权；ChatGPT/Claude/Grok
    添加后展开卡片粘贴 access token 即可。账号池内同样提供四个
    「+ 服务商」按钮，点一下即创建账号并入池（Gemini 同时弹授权页）。
  - **内置公开 OAuth Client（零配置，Gemini 默认）**：借用 Google Cloud
    SDK 的公开 client（社区工具广泛借用），无需创建任何 OAuth Client、
    无需填 Client ID——点「一键授权并添加」直接弹 Google 官方登录页。
    其注册回调固定为 `http://localhost:8085/`，宿主行会在 127.0.0.1:8085
    自建极简回调服务；该端口被占用（如 gcloud CLI 正在运行）时自动降级
    并给出明确提示。取消勾选「使用内置公开 OAuth Client」可改用自建
    Client（回调 `/router-oauth/callback`，需在服务商控制台登记页面
    显示的地址）。
  - Gemini 等标准 OAuth2 服务商可端到端使用（预设已填 authorize/token/scope）。
- 登录方式二：**粘贴 access token**（通用，适配任何接受 Bearer 的端点/网关）。
  ChatGPT 账号内置「一键获取 token」：把生成的 🔖 书签拖到浏览器书签栏
  一次，之后在已登录的 chatgpt.com 页面点一下书签，token 自动回传 DSH
  并写入凭据（无需复制粘贴）。Claude/Grok 无公开稳定的 token 接口，
  界面提供「打开官方站」入口并提示从开发者工具提取。
- 服务商预设：Gemini（一键授权可用）、ChatGPT/Claude/Grok（预设仅含
  端点与协议，默认使用粘贴 token——ChatGPT/Claude 的消费级 OAuth token
  面向其 Web 后端而非官方 API，官方 API 请用 API Key 或可用的 token）。
- 限制：OAuth 账号仅支持 chat 类型 agent；token 过期需在账号卡片重新登录。

## 账号池（扩展功能，opencodex 风格的多账号健康路由）

- 「账号池」分区把多个已授权 OAuth 账号组成池（`settings.yaml` 的
  `router.pools.<id> = { name, strategy, accounts: [...] }`），agent 的
  `account` 字段填 `pool:<id>` 即绑定该池。
- 选号策略：`healthy`（失败最少、最近未失败优先，默认）/ `usage-lowest`
  （累计调用最少优先）/ `round-robin`（按序轮换）；单个账号失败自动切换
  下一个候选并记入该账号健康统计，全部失败才报错。池内每个账号行内嵌
  「一键授权登录」「发现模型」「移出」按钮与健康摘要（调用/失败/最近时间）。
- 统计：池调用按 `oauth:pool:<id>` 聚合进 agent 明细，池内失败尝试按
  `oauth:<accountId>` 聚合进账号级明细，供健康策略与 UI 使用。
- 边界：与 opencodex 账号池的区别——opencodex 池的是消费级 ChatGPT 账号
  （经逆向 Web 后端协议转发）；本插件不集成非官方协议，池内账号须支持
  官方协议（Gemini 等标准 OAuth2 服务商一键授权、任意 Bearer token 粘贴）。

## 已知限制

- image 端点需支持 `b64_json`（自定义网关若不支持，请在高级设置更换 endpoint）；
  生成结果按 PNG/JPEG/WebP/GIF magic 自动识别 media type。
- API Key 账号登录仍走 llm-pi-ai（进入共享模型列表）；OAuth 账号为插件
  独立管理（不进入共享模型列表）。ChatGPT/Claude 官方消费者 OAuth token
  面向 Web 后端，插件不集成其非官方后端协议。
- 无通用「视频生成」API：视频生成预设为 chat 类型，需在高级设置中配置
  兼容网关与模型；speech 转写走 OpenAI 兼容 Audio Transcriptions 端点。
- 统计不持久化；如需跨重启累计可扩展 `storageDomain` 落盘。
- 浏览器侧 `remote.router` 由本包 `$mount` 挂载；宿主行未挂载时页面显示加载错误。
- 组合层改动需要重启 DSH 生效（运行层开关热生效）。
