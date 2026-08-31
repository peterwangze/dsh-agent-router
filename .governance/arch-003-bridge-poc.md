# ARCH-003 — 宿主 responses 协议桥接可行性取证（PoC 调研）

> 调研触发：用户架构质疑（2026-08-31）——「DSH 支持 responses 格式的 API，为什么插件自己造轮子还一直出问题」；裁决：先验 FIX-017 + 并行桥接 PoC（本报告）。
> 调研者：Architect subagent（5c7ff9c5）；全程只读，未读任何用户凭据文件。

## 总判定：黄（可行，有待实测点）

桥接全链路每一环均有源码直证；未满足「绿」的仅剩真机行为项。

**对用户预期的关键修正**：复用宿主实现的最短路径**不是**写 openai-responses profile 打 chatgpt.com（另一条协议形状，且 api:'openai-codex-responses' 被 schema 拒绝），而是**复用 openai-codex 目录路由本身（不带 api 字段）+ 把 access token 注入既有凭据 ref**。

## Q1 凭据热更新语义 —— 每请求重读（置信度：高）

- ref 通道（apiKeyEnv）：`dsh-llm-pi-ai\lib\index.js:1714` streamWithSnapshot 每请求 `resolveApiKey` → `:2408-2415` 每次调 `ctx.get("credentials").resolve(ref)`，无 memo（profiles memo 只缓存 provider 结构，凭据值只存 ref 名，:1028-1049）
- seam 契约：`dsh-credentials\lib\index.js:6-9` "Consumers resolve a reference once per operation, so a changed credential reaches the next operation without any plugin restart"
- record 通道：pi-ai `dist\auth\resolve.js:34` resolveProviderAuth 每请求 readCredential 活读；`dist\models.js:242-262` applyAuth 每 stream 调用
- pi-ai 对 OAuth 记录带自动刷新+写回（`resolve.js:62-89` 双检锁内 refresh；`dsh-llm-pi-ai:1894-1900` modify → 宿主 modifyRecord）
- 宿主自述：`dsh-llm-pi-ai:2292-2295` "Profile facts resolve per request … reaches the next request without a restart"

## Q2 openai-codex provider 与特殊头（provider 定义/头清单=高；通用 responses 被拒=中-待实测）

- **provider 定义**（`pi-ai\dist\providers\openai-codex.js:6-17`）：baseUrl=chatgpt.com/backend-api，auth 仅 OAuth（无 apiKey 方法），模型目录 `data/openai-codex.json`（gpt-5.3-codex-spark / gpt-5.4 / gpt-5.4-mini / gpt-5.5 / **gpt-5.6-luna**，api 全为 openai-codex-responses，含 contextWindow/价格/compat）；经 `providers/all.js:27` 进内置 catalog
- **auth 来源**：非 ~/.codex/auth.json（那是 pi-ai 独立 CLI 用的）。DSH 下凭据存宿主 record（scope=llm-pi-ai，id=路由键，`dsh-llm-pi-ai:1798-1806, 1874-1905`），形状 {type:'oauth', access, refresh, expires, accountId}（`auth/oauth/openai-codex.js:330-336`），toAuth → {apiKey: access}——**access token（JWT）就是 apiKey**
- **ChatGPT 特殊头**（`api/openai-codex-responses.js`）：:1224-1240 Bearer + chatgpt-account-id（JWT claim 提取，非 JWT 直接抛错 :166/:1213-1221）+ originator: pi（硬编码 :1236，headers 合并之后设置，profile 无法覆盖）+ UA；:1243-1249 OpenAI-Beta: responses=experimental、session-id、x-client-request-id；URL {base}/codex/responses（:443-451）；body 方言 store:false/instructions/include encrypted_content/prompt_cache_key（:365-416）、zstd 压缩
- **通用 openai-responses 打 chatgpt.com**：POST {baseURL}/responses（`api/openai-responses.js:181-186`）仅 Bearer，无 account-id/originator/Beta，路径 /responses ≠ /codex/responses。是否被拒——源码无直接证据，**待 PoC 实测**（间接证据强：宿主专门维护独立实现）

## Q3 settings 写入可达性（置信度：高）

- api 字段校验：`dsh-llm-pi-ai:935` z.union(supportedProtocols())——PROTOCOLS 三键（:709-713）。写 api:'openai-codex-responses' → settings.mutate 写入点即拒（assertServiceable :979-981 经 :2472-2473）；第二道 buildProvider :804-805 抛错
- "only an explicit override is refused" 的 override = settings profile **显式写 api 字段**。目录路由不写 api → reuseCatalogProvider（:803, :783-794）保留 pi-ai 官方实现
- **可行写法**：`providers['openai-codex'] = { apiKeyEnv: '<ref>' }`（目录路由、不写 api、不写 models → 内置目录默认模型，:600-603/:620-624 注释明示合法）；routeAuth :768-775——目录 provider 无 apiKey 方法而 profile 带凭据时自动追加 harnessApiKeyAuth，请求时 override 优先生效 → apiKey=ref 值（须为 JWT access token）
- 写 api:'openai-responses'+baseURL=chatgpt.com 过 schema 但生成**通用**实现（丢 codex 专属层）
- **可见性**：写入接受 → onChange → ensureRegistrationFacts → llm.registerAdapter → listProviders 含该路由 → directoryEntries → 模型选择器可见（dsh-llm:1240-1294；插件 UI 消费 settingsNs='llm-pi-ai' active 目录项 client.js:1845）

## Q4 轮换竞态与降级（置信度：中-高）

- Q1=每请求重读 → 无需 unset+set 逼重建；写入新值下一请求生效；在飞请求旧值自然结束
- **推荐：ref 通道 + 插件保持唯一刷新者**：插件沿用 oauth-credentials 刷新循环，到期前 T-margin 刷新 → api.credentials.set(ref, 新 access)（client.js:1764 同款调用先例）；**绝不同时启用 grant-record 通道**（pi-ai 自动刷新 × 插件刷新 = 双写者互踢 refresh token）
- 降级切换面（最小）：OAUTH_PROVIDER 注册原样保留；账号级 transport 字段决定模型 id 指向宿主路由（openai-codex/gpt-5.x）还是插件路由——service.js/wrapper.js 模型 id 映射单一决策点；连续 N 次 401/400 自动切回 + 诊断事件（P8）

## 实施要点（EVO-010 草案）

1. settings 写 `providers['openai-codex'] = { apiKeyEnv: '<既有 ref>' }`；凭据值 = OAuth access token（JWT）
2. 插件唯一刷新者：到期前刷新 → credentials.set(ref, 新 token)；禁止 grant-record 通道
3. 模型清单用 pi-ai 内置目录默认；确需收窄才写 models
4. 降级开关：保留 OAUTH_PROVIDER 注册；账号级 transport 字段路由选择；连续失败自动切回+诊断
5. P9 parity 守卫：写入前 dry-run resolve 能力自证；宿主升级 fail-closed

## 待实测点

① 真机：access-token→ref + openai-codex 路由请求 200；② 若坚持通用 openai-responses 打 chatgpt.com——实测错误形状（预期 401/404）；③ 刷新窗口（到期前 60s 写入）与在飞请求行为；④ pi-ai convertResponsesTools 对 DSH 工具 schema 的真机映射；⑤ 多账号 profile 共存时 assertServiceable 整体校验。

## 关键风险

1. 刷新权竞态：双写者可致 refresh token 互踢——必须单一刷新者
2. 宿主升级破坏面：PROTOCOLS/routeAuth/codex 实现无稳定性契约——需 P9 parity 守卫
3. originator 硬编码 'pi'（无法经 profile 覆盖）：若服务端额外校验则宿主实现同样失败——PoC 必须覆盖
