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
| `tool-router` | `dsh-router/tool` | agent 预设 | `route_agent` 模型工具 + `router:agents` 系统提示段（order 120），让主模型感知可用专业 agent |

宿主行与预设行解耦：宿主行未挂载时，预设行自动空转（不注册工具与提示段）。

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
3. **主 agent 感知并正确使用**：预设行注册系统提示段动态列出启用 agent 的
   能力说明与使用规则（配置变更即时生效），并提供 `route_agent(agent, task,
   includeImages, filePath, extra)` 工具；`includeImages` 默认把会话最近一条
   带图片的用户消息转发给专业 agent（视觉场景），模型不支持图片时明确报错；
   `filePath` 供语音识别（speech）类 agent 指定工作区音频文件。
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
5. **实时用量统计（两级明细）**：宿主服务按 agent 与按账号（服务商，含模型
   细分）两级聚合调用数/失败数/输入输出 tokens/耗时，保留最近 100 条调用
   记录与近 90 分钟分钟级分布；「统计信息」卡片内 Agent 级明细（行内展开
   分钟级柱状图）与账号级明细（行内展开模型细分 + 柱状图）并存，每 2 秒
   轮询刷新，支持一键清空；每个 agent 卡片同时内嵌自身的简要用量条。

## 安装（本部署）

```powershell
# 1. 让 loader 解析 dsh-router（junction；或改为把包发布/拷贝到 profiles\node_modules）
New-Item -ItemType Junction -Path C:\Users\peter\.dsh\profiles\node_modules\dsh-router `
  -Target D:\AI\agent\deepseek\plugins\router

# 2. 宿主行：profiles\web\cordis.patch.yml（已写入）
#    - insert:
#        - id: router
#          name: dsh-router

# 3. 预设行：在目标 agent preset（如 governance 模板）中加入（已写入）
#    - id: tool-router
#      name: dsh-router/tool

# 4. 重启 DSH（组合在进程启动时加载）
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
    vision:            # 视觉识别：GPT-4o（多模态）
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
  `tools` 字段可显式指定工具白名单；委派深度超过 4 层拒绝。
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
gateway 严格契约（`/api/router/catalog|stats|test|reset|config|save|oauthTokenExchange|oauthDiscover`）。
配置读写（config/save）经由本插件自己的 Remote 端点：api-proxy 的
`settings.describe/mutate` 只放行其内置白名单 namespace（回答
`settings-not-exposed`），第三方 namespace 无法经该 wire 面读写；宿主侧仍走
`ctx.settings` seam（settings.yaml `router:` 分节、热生效、revision 乐观并发）。
API Key 账号登录写入的 `llm-pi-ai` 在白名单内，仍走固定 settings/credentials 域。

## OAuth 账号（官方登录，插件独立管理）

- 登录方式一：**官方授权码（OAuth2 + PKCE）**——浏览器生成 PKCE 并打开
  官方 authorize URL，粘贴回调地址后由宿主经 token 端点完成 code →
  access_token 交换，token 存入 credentials seam（`ROUTER_OAUTH_<ID>_TOKEN`）。
  需要用户自有的 OAuth client（`clientId`，可选 `clientSecret`）；Gemini
  等标准 OAuth2 服务商可端到端使用（预设已填 authorize/token/scope）。
- 登录方式二：**粘贴 access token**（通用，适配任何接受 Bearer 的端点/网关）。
- 服务商预设：Gemini（授权码流可用）、ChatGPT/Claude/Grok（预设仅含
  端点与协议，默认使用粘贴 token——ChatGPT/Claude 的消费级 OAuth token
  面向其 Web 后端而非官方 API，官方 API 请用 API Key 或可用的 token）。
- 限制：OAuth 账号仅支持 chat 类型 agent；token 过期需在账号卡片重新登录。

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
