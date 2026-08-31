# RES-004 — Codex 订阅通路图片生成机制调研（Architect 结论稿）

> 触发：用户质疑（2026-08-31）「Codex 等支持 GPT 订阅登陆的工具都支持生成图片，为什么我们的会报错」+ Codex 桌面版实证（sha256:c7eeee21——同订阅同 5.6 Sol 模型对同提示词 1 分 23 秒出图内联展示）。
> 判定：**可行（绿）**——经 `chatgpt.com/backend-api/codex/images/generations` 直连（OpenAI Images API 兼容 JSON，非 SSE）。

## 核心结论

原 v0.3.0 判断「订阅 OAuth 无 Images API 端点」对 **api.openai.com 平台**成立，但**漏掉了 chatgpt.com codex 后端的 Images 端点**。Codex CLI 能出图 = 订阅 OAuth 经 codex 后端 images 端点出图（非平台 Images API）。Responses `image_generation` hosted-tool 为 legacy 不可靠（模型可能不调工具返回纯文本 / tool_choice 强制曾 400）——不作主路。

## 证据链（三层交叉）

1. **DSH 自家生产实现**：`.tmp-research/dsh-codex-connect/`（dsh-codex-connect 插件源码）——src/transport.ts:22 端点常量「Stage-zero verified」+ :291-303 POST/Bearer/chatgpt-account-id + body {model:'gpt-image-2', prompt} + :205-231 b64_json→附件保存全链路；经 pi-ai openaiCodexProvider OAuth auth 栈取 token（与宿主同型凭据）
2. **openai/codex 官方源码**（main）：codex-rs/codex-api/src/images.rs（请求/响应类型）+ endpoint/images.rs（"images/generations"/"images/edits" 相对 base_url）+ ext/image-generation（IMAGE_MODEL="gpt-image-2"，tool 名 image_gen）；PR #23989（2026-05-22 typed Images client）+ #31596（2026-07-09 默认启用）
3. **三方实证**：hermes-agent issue #84400（redacted 探针 POST → 200 + 有效 PNG；hosted-tool 标 stale：empty_response #19505 / tool_choice 400 #49008）；CLIProxyAPI PR #2962（v0.122.0 E2E hosted-tool 出图——历史佐证订阅侧可用）

## Responses hosted-tool 契约（备查，不作主路）

tools: [{type:'image_generation', model?, size?, quality?, output_format?, ...}]（openai\src\resources\responses\responses.ts:6863-6932）；输出 response.output[] image_generation_call.result=base64（:3615-3635）；SSE partial_image_b64（:3165）。订阅 OAuth 曾是启用前提（codex-rs turn_context.rs auth gate v0.122 时代）。pi-ai 侧三条源码级路障（convertResponsesTools 不透传 :257-289 / 无 image_generation_call 输出槽位 :324-599 / builtinImagesProviders 仅 openrouter :116-117）——**宿主路由不可承载，插件直连是唯一路**。

## 插件改造面（全部源码级核实落点）

1. **能力矩阵单点**：service.js:529-531 oauthCapabilities `'codex-responses' → ['chat','image']`（调用点 :2793-2797 即当前拒绝产生处；:526 注释已预留扩展，零调用点改动）
2. **新增 runCodexResponsesImage**：URL=resolveCodexResponsesUrl base 换 `/codex/images/generations`；头部复用 runCodexResponsesChat :2996-3004 preset 四元组（Bearer+chatgpt-account-id+originator+代理 dispatcher :3037-3040）；body {model, prompt, n:1, size?, quality?}；**响应 JSON 无 SSE**——复用 runImage b64_json→decodeBase64→sniffMediaType→saveImage→{kind:'image',image}（:1973-1981）；tool.js result.image→marker 链路零改动
3. **模型策略**：gpt-image-* 透传，否则默认 gpt-image-2（dall-e-3 等旧默认给明确指引不静默替换）
4. **UI**：oauthChatOnly（client.js:3141）类型化——codex+image 显示「经 ChatGPT 订阅出图」；账号已选时 image 字段区隐藏 endpoint/apiKeyEnv（:3181-3193）；draw 预设默认 dall-e-3（:998）选 OAuth 时提示换 gpt-image-*；schemas 已允许无需变更
5. **错误/观测**：401/403 重登、429 usage_limit_*（复用 :3046-3068 H3-14）；响应形状校验（data[].b64_json 缺失→明确错误）；recordCapabilityEvent 埋点；301/302 拒绝（redirect:'manual' 先例）

## 待实测点

- **必做**：真实订阅 token + 插件头部集（originator: dsh-agent-router）+ 代理链（EV-028：chatgpt.com 需经代理 7890）POST 该端点 → 200 + b64_json
- 可选：quality/size 透传；originator 缺省对照（dsh-codex-connect 无 originator 已 200）；/codex/images/edits 记录不实施

## 关键风险

1. 端点非公开契约（无官方文档，DSH 自家标 Stage-zero）——P-v2-8/9 响应形状校验/错误分类/parity 守卫/失败可观测必须
2. 订阅平面差异：图片额度随 ChatGPT plan（usage_limit_reached/free）；gpt-image-2 尺寸约束（≤3840px、16px 倍数、比例 ≤3:1）与现有三档尺寸不完全重叠——UI/文档披露
3. 主 agent 经订阅出图需 pi-ai 上游演进（三条路障）——不在插件面，记宿主演进项

## 关联

- 用户质疑链：draw agent 报错（sha256:1c05768）→ Codex 桌面版实证（sha256:c7eeee21）→ 本调研
- EVO-011 实施承载（v0.4.1 候选）；插件 OAuth agent 直连路径不走宿主 pi-ai（service.js:785-786/:3968）——与 EVO-010 主模型官方路由正交
