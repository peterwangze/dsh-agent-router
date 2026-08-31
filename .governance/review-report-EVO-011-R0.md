# Review — EVO-011 R0（ChatGPT 订阅生图：codex images 端点直连）

- **Round**: R0
- **Task**: EVO-011 — ChatGPT 订阅账号 image 类型支持（RES-004 调研绿判 → 用户裁决实施）：chatgpt.com/backend-api/codex/images/generations 直连生图
- **Commits**: `1dd124b` + `f3268af`，base 30281d7
- **调研依据**: `.governance/res-004-codex-image-generation.md`（三层证据：DSH 自家 dsh-codex-connect 生产实现 transport.ts:22/:291-303 + openai/codex 官方源码 images.rs/endpoint + 三方实证 hermes-agent/CLIProxyAPI）
- **审查者**: Code Reviewer（R0）
- **日期**: 2026-08-31
- **范围说明**: 无命令面；真实端点实测（200 + PNG 908KB）采信 Developer 报告（真实环境审查员不重跑——如实标注）；门控采信 Coordinator（16/16）。

## 修复声称逐项核验（5/5）

| # | 声称 | 证据 | 结论 |
|---|---|---|---|
| 1 | 能力矩阵 codex-responses → ['chat','image'] + runOauthDispatch 单行分支 | `lib/service.js:548-551` oauthCapabilities 单点（其余协议含未知保持 ['chat']，注释 :539-547 设计演进说明）；`:2820` `if (type === 'image' && protocol === 'codex-responses') return this.runCodexResponsesImage(...)` 单行分支 | ✓ |
| 2 | runCodexResponsesImage 全链 | `lib/service.js:3162-3277`（详见维度 1） | ✓ |
| 3 | resolveCodexImagesUrl 三元归一 | `lib/service.js:531-537`：已含 `/codex/images/generations` 原样 / 止于 `/codex` 补 `/images/generations` / 其余（含空→官方默认）补 `/codex/images/generations`——baseURL 覆盖语义与 chat 分支（resolveCodexResponsesUrl）一致 | ✓ |
| 4 | UI 类型化 + 隐藏 + 换型建议 + i18n + 镜像 | `lib/client.js:3089` oauthImageDirect 判定（image + 非池 + codex-responses）；`:3152/:3190` 提示与 endpoint/apiKeyEnv 字段可见性分流；`:491-492/:763-764` oauthImageHint/oauthImageModelHint 中英（含尺寸表披露）；draw 预设 dall-e-3 保持（:1005）——换型由服务端引导；镜像 served-client.js 文案行一致 | ✓ |
| 5 | 判别 16 断言 RED/GREEN | `tests/smoke.mjs` EVO-011 块（:1002-1097 + 能力矩阵 :837-869）：capabilities 矩阵 5 协议（:862）/ dispatch 通过（:869）/ 端点 URL（:1066）/ 头部四元组+redirect manual（:1067）/ body 形状（:1069）/ 非 gpt-image 回退+指引（:1074）/ 回退事件（:1075）/ 非法尺寸省略+提示（:1079）/ 零配置默认端点（:1082）/ b64 缺失错误（:1086）/ 401 重登（:1090）/ 429 resets_at（:1093）/ 301/302 拒绝（:1097）≈16 断言；RED 判别（:864 注释「旧代码必败：报"暂不支持 image 类型"=用户报错复现」） | ✓ |

## 维度 1：正确性（端点契约防御，重点 1）

- **响应形状校验完备**（P-v2-8/9 防守非公开契约）：`:3266-3270` data[].b64_json 缺失（含 data 空/非数组/非对象容错链 `payload?.data?.[0]?.b64_json`）→ 明确错误（含额度耗尽提示）；`:3260-3264` 成功体非 JSON → 明确错误；`:3271-3276` decodeBase64 → sniffMediaType（magic bytes 嗅探——不假设 b64 必为 PNG）→ attachments.saveImage → { kind:'image', text, image }——复用 runImage 既有链路（tool.js marker 渲染零改动）✓。
- **错误分类覆盖漂移面**（`:3230-3258`）：301/302 拒绝跟随（redirect:'manual' 已防漂移 + 显式错误分支）；401/403 重登；429/usage_limit_* resets_at 分钟数 + plan_type；其余 status + 错误体透传（截断 400 字符）——H3-14 同款 + 每分支 recordCapabilityEvent('codex_image_error')（P8）✓。
- 模型策略（重点 2）：`/^gpt-image/i` 透传；dall-e-3 等 → gpt-image-2 + modelHint（结果文本明确说明非静默替换）+ codex_image_model_fallback 事件 ✓。
- size 策略（重点 2）：gptImageSizes 合法值表（1024x1024/1024x1536/1536x1024/auto，:3185）——非法（如 1792x1024）省略 + sizeHint + 事件；未配置默认 1024x1024（runImage 同款语义）；**UI 披露表（oauthImageHint :491）= 实现透传表 = 自洽**；官方扩展约束（≤3840px/16px 倍数/比例 ≤3:1，RES-004 风险 2）未透传——保守省略方向（不发送端点可能拒绝的尺寸），不冲突 ✓。
- quality 透传（:3196-3197）：agent 配置面未暴露（注释 :3154 预留）——非法值端点拒绝 → 明确错误可观测 ✓。
- 能力矩阵回归：其余协议 image 仍拒绝（:862 断言 chat-only 协议矩阵不变）✓。

## 维度 2：安全性（重点 3）

- **凭据 P7**：Authorization/chatgpt-account-id 仅在 fetch init（:3205-3206）；错误文案只透传端点错误体（截断 400）与 status——零 token 值（逐错误分支核验 :3241-3258）✓。
- **b64 大图内存面**：decodeBase64 全量解码无上限定额——与 runImage 既有链路同款（:1973-1981 复用，非本任务新引入）；生成图片合理大小，恶意超大响应属端点契约侧——P3-1 讨论。
- 无注入面（body 全内部构造；prompt 经 composeTask 既有组装）✓。

## 维度 3：可维护性

- 模块边界清晰：能力矩阵单点（oauthCapabilities）+ 协议专属分支单行 + 独立 runCodexResponsesImage（与 runCodexResponsesChat 头部/错误同构复用）；URL 归一与 chat 分支同构（resolveCodexImagesUrl/resolveCodexResponsesUrl 姊妹函数）✓；注释含 RES-004 取证链与模型策略说明 ✓。

## 维度 4：性能

- 单次 POST + JSON 解析 + base64 解码 + saveImage——无循环/无额外 I/O；代理 dispatcher 仅 chatgpt.com 目标（:3222-3224）✓。

## 维度 5：测试覆盖 + transport 交互（重点 4/5）

- 16 断言覆盖：能力矩阵/分派/端点/头部/body/模型回退/尺寸省略/零配置/错误四分支（b64 缺失/401/429/301）——RED 判别成立（旧代码能力矩阵无 image → runOauthDispatch 拒绝 = 用户报错复现）✓。
- **与 EVO-010 transport 交互**：draw agent 直连路径（runOauthDispatch → runCodexResponsesImage）不走宿主 pi-ai/host 路由（RES-004 关联节「与 EVO-010 主模型官方路由正交」；service.js:785-786/:3968 实证）——本任务未引入 transport 过滤变化（runOauthDispatch 无 transport 判定新增）；transport=host 账号被 draw 直连 = 既有专业 agent 直连语义（EVO-010 R0 F-4 已定「transport 不构成请求路由决策」），无交叉影响 ✓。池+image 拒绝路径未变（oauthImageDirect 显式 `!poolRef`，:3089——池账号仍走原拒绝面）✓。
- 未覆盖（P3 讨论）：quality 合法值校验无断言；超大 b64 无上限断言。

## AI 代码专项 5 项

| 项 | 结论 |
|---|---|
| mock 残留 | 无（smoke fetch stub 显式夹具）✓ |
| 硬编码 | 无（gptImageSizes 合法值表/gpt-image-2 默认 = 契约常量，注释 + UI 披露齐）✓ |
| 幻觉 API | 无——端点契约三层取证（RES-004：dsh-codex-connect transport.ts:22/:291-303 生产实现 + codex 官方源码 images.rs + 三方实证）；fetch 形状与 dsh-codex-connect 同构；真实端点实测（200 + PNG 908KB）采信 Developer ✓ |
| TODO | 无 ✓ |
| 过度实现 | 无（单点矩阵 + 单分支 + 独立函数复用既有链路）✓ |

## 发现清单

| 级别 | 位置 | 发现 | 影响 | 建议 |
|---|---|---|---|---|
| P3-1 | lib/service.js:3271 | b64 解码无大小上限（decodeBase64 全量）——与 runImage 既有链路同款，非本任务新引入 | 超大异常响应内存放大；端点契约侧风险 | 讨论项：可加上限拒绝（如 >64MB） |
| P3-2 | lib/service.js:3196-3197 | quality 透传无合法值校验（agent 配置面未暴露——预留透传） | 非法 quality → 端点拒绝 → 明确错误可观测 | 讨论项 |
| P3-3 | lib/service.js:3185 | 官方扩展尺寸（2048 系 ≤3840px/16px 倍数）未透传——保守省略 | 与 UI 披露自洽（披露=透传表）；未来扩展单点（扩 gptImageSizes） | 讨论项 |

## 结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0=0 / P1=0 / P2=0 / P3=3（讨论级）
- 5 修复声称逐项核验通过；端点契约防御完备（形状校验 + 错误分类漂移面全覆盖）；模型策略不静默替换（指引 + 事件）；P7 凭据零泄漏；transport 正交无交叉；判别 16 断言 RED 成立；AI 专项 5 项逐项有结论；无 P4-violation。
- 遗留台账：P3-1/P3-2/P3-3 为讨论项，无关闭截止要求。
