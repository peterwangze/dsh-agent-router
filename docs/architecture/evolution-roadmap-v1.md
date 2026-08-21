# 战略演进路线图 v0.3.x（evolution-roadmap-v1）

| 项 | 值 |
| --- | --- |
| Task ID | ARCH-002（P0） |
| 文档类型 | 架构设计（Architect Agent 产出，stage-architecture 子工作流） |
| 日期 | 2026-08-20 |
| 状态 | 设计稿（待 Design Reviewer 审查 + D-6 用户定稿） |
| 决策输入 | DEC-017（三主线授权）/ DEC-018（Q3=DSH_HOME+90天+S-3 绑定；Q4=不引入免费链；S-1/S-2/S-3+H2 前置绑定）/ DEC-019（Q1=只 ChatGPT 先行；Q2=OAuth 通路扩展纳入设计）——均为已定案，本设计不重新决策 |
| 上游调研 | RES-003（`docs/requirements/strategic-alignment-research-2026-08-20.md`，审查 APPROVED_WITH_NOTES） |
| 架构基线 | `docs/architecture-v3.md`（M1-M8 模块划分/不变量——本设计为演进不重构，新模块衔接 M6-M8，经 RPC wire 至 M7；M1-M5 零改动） |
| 质量约束 | `.governance/project-principles.md` P-v1（P1-P7 / C1-C4 为设计硬约束） |
| 证据落盘 | `.router-files/litellm-custom-pricing.md`、`.router-files/openrouter-usage-accounting.md`（S-1）；`.router-files/dsh-codex-src-*.ts` ×5、`.router-files/pi-ai-auth-oauth-openai-codex.js`（H3 源码快照） |

> 事实 / 假设 / 建议三分离（沿用 v3 文档约定）：【事实】= 代码级证据（文件:行号，含本地
> 宿主 pi-ai 0.82.1 源码与 dsh-codex 仓库源码）或已验证运行时行为；【文档】= 官方文档/README
> 原文（URL 或落盘路径）；【假设】= 未验证前提（附验证计划，§11）。本设计不修改任何产品
> 代码与 `.governance/` 记录（proposed DEC 见附录，由 Coordinator 写回）。

---

## §1 目标与范围

### 1.1 目标

把 RES-003 §6 的九个候选方向（C-1~C-9）组织为 **v0.3.x 系列 2-4 个版本的可执行分期**，
并对三个主线候选（C-1 ChatGPT 订阅 OAuth / C-3 统计持久化 / C-4 成功率闭环）给出模块级
设计方案，使下一阶段（D-6 定稿 → DEV 实施）可以直接按版本启动。

三个设计目标分别对应 DEC-017 三主线：

| 主线 | 候选 | 本文档交付 |
| --- | --- | --- |
| 主线 1（账号配置易用性） | C-1（首位，DEC-019 Q1） | §3 完整方案：授权流/凭据存储/账号接入/协议对接/Q2 扩展面/合规边界/H2 PoC 计划 |
| 主线 3（统计专业性与持久化） | C-3 | §4 完整方案：存储/数据安全四件套/指标扩展/模块分离 |
| 主线 2（调用成功率与交互效果） | C-4（+C-9 前置） | §5 完整方案：失败分类/重试策略/诊断交互/实测计划 |

### 1.2 范围内 / 范围外

**In**：C-1~C-9 的版本分期与复杂度量化（S-2）；C-1/C-3/C-4 模块级设计；新模块与 v3 M1-M8
的衔接；ADR 集；蓝军挑战；非功能对照；proposed DEC。

**Out（明确不做）**：
| # | 不做什么 | 理由 |
| --- | --- | --- |
| O-1 | 修复 gcloud 公开 Client 路线 | RES-003 §6.2 反面考量：Google 已在 scope 层封死（service.js:324-331 实证链），死路 |
| O-2 | C-2 Claude OAuth 实施 | DEC-019 Q1：观察项，ChatGPT 落地后按风控反馈再议（复杂度仍量化入 §2 以备） |
| O-3 | 免费开箱链 | DEC-018 Q4 裁决：不引入 |
| O-4 | C-6 提前到 C-1 之前 | RES-003 §6.2：池里没有可轮换账号时池策略空转（OAuth chat-only 限制 service.js:732） |
| O-5 | 界面整体重构 | RES-003 CE-2：D-1-3 触发率未实测前，界面大改不解决根本（先 C-9 拿数据） |
| O-6 | 推翻/重构 v3 架构 | 任务约束：演进不重构；新模块只衔接不替换 M1-M8 |
| O-7 | 重打整轮路由类机制 | v3 X-1 已移除且 DEC-008 定案方向不可逆；本设计全部增量不触碰 |

---

## §2 演进路线图与版本分期（D1，含 S-2 复杂度量化）

### 2.1 版本分期（4 期）

排序依据：Top3（C-1→C-3→C-4）+ DEC-019（C-1 首位、C-2 观察项）+ 反面考量（O-1/O-4/O-5）。
C-9 为贯穿性实测任务（非功能交付），v0.3.0 起埋点、v0.3.2 出报告。

| 版本 | 主题 | 候选 | 依赖顺序 | 出口条件（可验证） |
| --- | --- | --- | --- | --- |
| **v0.3.0** | ChatGPT 订阅接入 | **C-1**（+Q2 接口层预留；C-9 埋点启动） | 前置：H2 运行时 PoC 通过（§3.7）→ schemas(preset) → 凭据模块 → 授权流 → 协议分支 → UI → 合规开关 | ① 一键登录端到端：授权页→1455 回调→凭据落盘（owner-only）→模型发现→chat 调用返回文本；② token 过期自动刷新（重启后调用成功）；③ 设备码后备可用；④ 默认关闭+显式开启确认+登出删除凭据路径全部可用；⑤ 既有 534+ 断言零回退+新增用例全绿；⑥ H2 PoC 报告归档 evidence-log |
| **v0.3.1** | 统计持久化与专业指标 | **C-3**（+C-9 持续采集） | 独立于 v0.3.0（可并行开发，建议串行发布——P4 测试看护）；依赖：schemas(stats 配置) → lib/stats.js → service.js 迁移 → UI | ① 重启后统计保留（跨会话可见）；② 按天聚合/成功率/p50/p95/成本估算展示；③ CSV 导出可用；④ 损坏自愈单测（坏行跳过+坏文件隔离重建）；⑤ 版本迁移单测（v1→v2 模拟）；⑥ 清空保护（确认+软删除备份）；⑦ 加载性能 ≤200ms（100 天规模模拟数据）；⑧ service.js 行数净降（统计分离后 2965→~2745，R1 审查 W-1 更正基线） |
| **v0.3.2** | 成功率闭环 | **C-4 + C-5**（C-9 出报告） | 依赖 v0.3.1（stats 模块 errorClass 扩展）+ C-9 数据（v0.3.0 起积累）；C-5 独立可并行 | ① 失败分类覆盖 5 类（单测+真实样本各 ≥1）；② 池切换按分类决策（auth 跳过+标记重登/rate_limit 冷却）；③ 重试预算生效（单测：单次调用总重试 ≤3、rate_limit 永不立即重试）；④ 诊断卡+重试入口（pre-step 注入）可用；⑤ C-9 实测报告（N≥30 带图轮，D-1-3 触发率数据+分层口径） |
| **v0.3.3** | 二梯队收敛 | **C-6 + C-7**（C-8 可选顺延） | 依赖 v0.3.0（C-1 池里才有订阅账号可选）、v0.3.2（失败分类供 doctor 复用） | ① C-6：API Key 账号/CLI 条目入池+优先级序；② C-7：onboarding 3 步配出首个可用视觉 agent（新装环境实测）；③ C-8（可选）：`dsh plugin add` 通道安装成功且存量脚本安装兼容 |

> 分期说明：C-1 与 C-3 分属两版而非合并——版本语义单一（P4/C4：一个版本承载一个主题），
> 且 C-1 有 PoC 前置的不确定性，与无合规风险的 C-3 解耦发布可保证 v0.3.1 不被 C-1 风险
> 阻塞（P3：风险隔离）。C-4 并入 C-5 同版——失败诊断卡与 doctor 预检同属"失败可理解"
> 交互面，共享 failure 分类模块。C-8 依赖宿主 plugin 通道稳定性（外部依赖），标记可选。

### 2.2 S-2 复杂度量化（九候选全覆盖）

行数估算口径：净新增/改造源码行（不含空行注释的 ±20% 区间）；"改造点"= 既有函数/分支
的修改处数。已排除项（O-1 gcloud）不量化；C-2 观察项量化但不排期。

| 候选 | 涉及文件（现有模块或新增） | 改造点数 | 预估行数 | 量级 |
| --- | --- | --- | --- | --- |
| **C-1** | `lib/schemas.js`（preset/credentialFile/protocol 枚举）；**新增** `lib/oauth-credentials.js`（读/写/原子/锁/刷新/JWT accountId）；`lib/index.js`（1455 loopback，8085 先例）；`lib/service.js`（oauthBegin 预设分支+runOauthChat codex-responses 分支+resolveOauthToken 刷新集成）；`lib/client.js`（账号卡预设 UI+ToS 确认+登出删除）；`tests/`（凭据单测+回调流+协议分支 mock） | ~18 | ~1140（其中新模块 ~250、测试 ~300） | **L** |
| **C-2**（观察项，不排期） | 复用 C-1 全部基建；新增 anthropic 订阅 OAuth 端点常量+凭据预设；protocol anthropic 分支已有雏形（service.js:2341-2355 为 API 直连，订阅 OAuth 为另一端点体系，需新验证 H4） | ~8 | ~400 增量 | **M**（前置 C-1 落地） |
| **C-3** | **新增** `lib/stats.js`（存储/聚合/迁移/自愈/导出）；`lib/schemas.js`（stats 配置：retentionDays/pricing 表）；`lib/service.js`（record/statsSnapshot 委托 stats 模块，净减 ~220）；`lib/client.js`（按天视图/成本列/CSV 按钮/清空确认）；`lib/rpc.js`（export codec）；`tests/` | ~14 | ~1000（新模块 ~450、测试 ~250；service.js 净减 ~220） | **M** |
| **C-4** | **新增** `lib/failure.js`（分类+重试策略）；`lib/service.js`（run* 通路 errorClass 采集+池切换冷却/退避增强）；`lib/tool.js`（错误结果结构化）；`lib/client.js`（诊断卡+重试按钮）；`lib/stats.js`（errorClass 维度聚合）；`tests/` | ~15 | ~840 | **M-L** |
| **C-5** | `lib/service.js`（doctor 预检：登录状态/网络可达/沙箱探测；CLI 进度心跳：stderr 采样）；`lib/client.js`（doctor UI+进度显示）；`tests/` | ~8 | ~470 | **S-M** |
| **C-6** | `lib/schemas.js`（池引用扩展+优先级）；`lib/service.js`（候选排序 priority/fill-first+Key 账号候选生成）；`lib/client.js`（池 UI+配额条）；`tests/` | ~10 | ~560 | **M** |
| **C-7** | `lib/client.js`（onboarding 向导）；`lib/service.js`（router/doctor 汇总 RPC）；`tests/` | ~6 | ~450 | **S** |
| **C-8** | bundle 形态（package.json files/dsh 元数据+发布通道）；`tests/install-entry.mjs` 扩展 | ~4 | ~180+发布流程 | **S-M** |
| **C-9** | `tests/metrics.mjs` 扩展或新增 `tools/usage-report.mjs`（采样脚本+口径统计）；实测计划文档 | ~3 | ~300 | **S** |

**合计**：v0.3.x 全周期净新增 ~4200-4700 行（其中测试 ~1250 行），新增 3 个 lib 模块
（oauth-credentials.js / stats.js / failure.js），service.js 净变化 ~-220（C-3 分离）
~+380（C-1/C-4/C-5 改造）≈ +160——**服务巨石缓解**（C2 反腐化：service.js 当年因 2554 行
被 DEC-011 点名，统计分离优先抵消新增膨胀）。

> 基线更正（R1 审查 W-1）：service.js 当前实测 **2965 行**（本稿初写口径 2844 失准）；
> 净变化算术相应为 2965−220+380≈**3125**，v0.3.1 出口条件⑧的行数基线以 2965 为准。
> 巨石缓解论证方向不变（2965 基线下更强）。

---

## §3 C-1 ChatGPT 订阅 OAuth 接入方案（D2）

### 3.1 H3 设计期验证记录（源码级，MUST 已完成）

验证对象：OpenAI Codex OAuth 流对第三方 client 开放性（PKCE + localhost 回调 + 设备码可
复用）。验证方式：本地宿主 pi-ai 0.82.1 源码实读（`D:\AIData\Caches\npm\_npx\1e7f6d9597241db0\
node_modules\@earendil-works\pi-ai\dist\`，与 dsh-codex 声明目标版本精确一致）+ dsh-codex
仓库源码抓取（github.com/Yan-Zero/dsh-codex@main，快照落盘 `.router-files/`）。

**结论：H3 源码级成立。** 逐项证据：

| # | 验证目标 | 结论 | 证据（文件:行号） |
| --- | --- | --- | --- |
| H3-1 | OAuth client id 常量 | `app_EMoamEEZ73f0CkXaXp7hrann`（Codex CLI 公共 client，PKCE 公共客户端无 secret） | pi-ai `dist/auth/oauth/openai-codex.js:22`（快照 `.router-files/pi-ai-auth-oauth-openai-codex.js:22`）【事实】 |
| H3-2 | 授权/token 端点 | `https://auth.openai.com/oauth/authorize`、`/oauth/token` | 同上 :23-25【事实】 |
| H3-3 | 回调端口 | **1455 为 client 注册死值**：`REDIRECT_URI = http://localhost:1455/auth/callback`；本地回调服务 `server.listen(1455, '127.0.0.1')`；绑定主机可经 `PI_OAUTH_CALLBACK_HOST` 覆盖（端口不可改） | 同上 :26, :36-38, :293【事实】 |
| H3-4 | PKCE 实现 | verifier = 32 随机字节 base64url；challenge = SHA-256(verifier) base64url（S256）；state = 16 随机字节 hex，回调校验 state | 同上 :39-44, :229-238, :267-271 + `dist/auth/oauth/pkce.js:19-30`【事实】 |
| H3-5 | scope | `openid profile email offline_access` | 同上 :34【事实】 |
| H3-6 | token 响应与刷新 | 响应必须含 access_token + refresh_token + expires_in（**rotating refresh token**：每次刷新返回新 refresh）；刷新 = POST token 端点 `grant_type=refresh_token`+client_id（无 secret）；过期判定 = `Date.now() + expires_in*1000` | 同上 :103-110, :127-144【事实】 |
| H3-7 | accountId 提取 | access token 为 JWT，claim `https://api.openai.com/auth` → `chatgpt_account_id`；调用时必须随请求头发送 | 同上 :35, :319-324；`dist/api/openai-codex-responses.js:1209-1223,1235`【事实】 |
| H3-8 | API 端点与协议 | `https://chatgpt.com/backend-api/codex/responses`（**Responses API，SSE 流式，非 chat/completions**）；请求体 `{model, store:false, stream:true, instructions, input, include:["reasoning.encrypted_content"], prompt_cache_key, ...}` | pi-ai `dist/providers/openai-codex.js:10` + `dist/api/openai-codex-responses.js:379-390, 443-451`【事实】 |
| H3-9 | 必需请求头 | `Authorization: Bearer`、`chatgpt-account-id`、`originator`（pi-ai 用 `pi`，非官方 `codex_cli` 亦可）、`User-Agent`；SSE 另加 `OpenAI-Beta: responses=experimental`、`accept: text/event-stream` | `dist/api/openai-codex-responses.js:1224-1250`【事实】 |
| H3-10 | SSE 事件形状 | `response.output_text.delta`（增量文本）/`response.output_item.done`（含 output_text）/`response.completed`·`response.incomplete`（终态+usage）/`response.failed`·`error`（错误事件） | `dist/api/openai-codex-responses.js:511-539` + `dist/api/openai-responses-shared.js:487,544,599`【事实】 |
| H3-11 | 设备码后备 | `POST auth.openai.com/api/accounts/deviceauth/usercode`（client_id）→ 轮询 `.../deviceauth/token`（device_auth_id+user_code → authorization_code+code_verifier）→ 换 token；验证页 `auth.openai.com/codex/device`；超时 15 分钟 | `dist/auth/oauth/openai-codex.js:27-31, 145-227`【事实】 |
| H3-12 | 手动 code 后备 | 回调监听失败（端口被占）时优雅降级：waitForCode 返回 null → 提示用户粘贴授权码/回调 URL（解析 code#state） | 同上 :302-316, :366-405【事实】 |
| H3-13 | 凭据存储先例 | `$DSH_HOME/.openai-codex-auth.json`；文档 `{version:1, credential:{type:'oauth', access, refresh, expires, accountId}}` 严格校验（未知字段拒绝）；`writeFileAtomic`（`@deepseek-ai/dsh-atomic-write`）mode 0o600/dirMode 0o700；`withFileLock` 跨进程刷新锁；POSIX owner-only 断言（Windows 跳过 mode 检查） | dsh-codex `src/store.ts:16,100-102,150,158-161,32-50`（快照 `.router-files/dsh-codex-src-store.ts`）【事实】 |
| H3-14 | 限流/配额语义 | 429/`usage_limit_reached`/`usage_not_included` → 含 plan_type 与 resets_at（重置分钟数可解析）；配额端点 `chatgpt.com/backend-api/wham/usage`（primary/secondary 滚动窗口+剩余百分比） | pi-ai `dist/api/openai-codex-responses.js:1185-1204`；dsh-codex `src/usage.ts:9,111-135`（快照）【事实】 |
| H3-15 | 依赖模式先例 | dsh-codex **零运行时依赖**，pi-ai 为 peerDependency ^0.82.1（宿主环境提供）——npm 安装形态已验证可运行 | dsh-codex `package.json` peerDependencies（2026-08-20 抓取；间接佐证 store.ts:8 `import '@earendil-works/pi-ai'`）——**文档级（package.json 未快照落盘，R1 审查 W-2 降级标注）** |
| H3-16 | DSH 插件先例 | ≥3 个 DSH 生态插件在 DSH 内跑通 ChatGPT 订阅 OAuth（Yan-Zero/dsh-codex、yoke233/dsh-openai-codex-auth 回调亦 1455、DamonBao/dsh-codex-provider-plugin） | RES-003 §4 A3（README 落盘）+ 本验证源码级坐实两个【文档+事实】 |

**降级声明**：无需降级——H3 达到源码级（未停留在文档级）。残留运行时不确定性收敛为
§3.7 H2 PoC 判据（服务端当前是否仍接受该 client/originator——这是时间敏感项，源码无法
证明，只能运行时验证）。

### 3.2 关键决策（≥2 候选 + 排除理由）

#### 决策 E1：OAuth 流与协议实现策略

| 候选 | 方案 | 评估 |
| --- | --- | --- |
| **E1-a（定案建议）** | **自实现 OAuth + 最小 Responses 客户端**：复用现有 `oauthBegin`/`oauthTokenExchange`（service.js:2748-2865 已实现 PKCE S256+state+pending 会话）扩展 refresh_token 持久化与 preset 常量；新增 1455 loopback（index.js:99-125 的 8085 先例）；runOauthChat 新增 `codex-responses` 协议分支（非流式 `stream:false` 优先，SSE 聚合为后备——事件形状已源码验证 H3-10） | 与现有 oauthAccounts 架构完全一致（凭据/账号/池/发现全复用）；零新依赖（P6/C2：不引入 pi-ai 全量 LLM 抽象库）；协议事实已由 H3 完整固化（端点/头/事件/错误码），自实现风险可控；纯文本聚合只需 4 个事件类型（delta/done/completed/failed） |
| E1-b | 依赖 pi-ai `openaiCodexProvider`（peerDependency，dsh-codex 同款） | 协议由库维护（长期演进省心）；但①引入 LLM 抽象库仅为一个协议分支（过度依赖，违反"当前需要"理由——AI 编程风险缓解）；②peer 解析在本项目 git clone+junction 安装形态下未验证（dsh-codex 为 npm 形态，V-EVO-2）；③OAuth 交互流（AuthInteraction 回调）与本插件设置页 UI 的对接需胶水层，复杂度反超自实现 |
| E1-c | 经宿主 `dsh-llm-pi-ai` 注册 llm 路由（dsh-codex 产品形态：ChatGPT 进共享模型列表，主 agent 直选） | 排除：违反本项目 OAuth 账号设计不变量（schemas.js:137-147"绝不注册 llm 路由，不进共享模型列表"）；产品语义错位——本项目目标是专业 agent 路由（route_agent 消费），不是主模型替换 |

**E1-a 补充论证（协议最小面）**：runOauthChat 是单轮/少轮任务调用（maxRounds ≤8，现状
非流式 `await response.json()`），不需要流式转发给用户——因此首选请求体 `stream:false`
（若 PoC 证实 codex/responses 接受，见 V-EVO-2b），实现 = 现有三协议分支同构的第 4 分支；
仅当服务端强制流式时才落 SSE 聚合（~80 行解析器，事件形状已验证）。这把 C-1 的协议
风险从"实现一个流式协议栈"收敛为"多一个 JSON 端点分支"。

#### 决策 E2：ChatGPT 账号接入形态

| 候选 | 方案 | 评估 |
| --- | --- | --- |
| **E2-a（定案建议）** | `oauthAccountSchema` 扩展 preset：`preset: 'chatgpt-codex'`（z.string，default ''）——选中即预填 authUrl/tokenUrl/clientId/scope/baseURL/protocol='codex-responses'，另加 `credentialFile`（独立凭据文件路径，default `$DSH_HOME/dsh-agent-router/chatgpt-codex-auth.json`） | 最小侵入：账号卡 UI/池引用/发现流程全复用；preset 机制可扩展（C-2 anthropic 预设、未来其他厂商——P5 泛化性）；与现有自建 Client 账号共存于同一字典 |
| E2-b | 新顶层 `chatgptAccounts` 字典 | 排除：池引用/agent.account 解析/账号卡组件全部复制一遍（冗余修改，C4）；两套账号语义并存增加理解成本 |
| E2-c | 复用现有通用字段让用户手填（authUrl/tokenUrl/clientId/scope/baseURL 六项） | 排除：违背"一键"目标（RES-003 F-2 教训：自建 Client 路径 10+ 步是最大摩擦点）；client id 常量让用户手抄无意义 |

#### 决策 E3：凭据存储

| 候选 | 方案 | 评估 |
| --- | --- | --- |
| **E3-a（定案建议）** | **独立 JSON 文件**（dsh-codex 先例 H3-13）：`{version:1, credential:{type:'oauth', access, refresh, expires, accountId}}`；原子写（temp+rename）+ 跨进程文件锁 + 严格校验（未知字段拒绝）；refresh 后整文档重写（rotating refresh 语义要求） | ChatGPT 凭据是四元组（access/refresh/expires/accountId）而非单 token 字符串——credentials seam（tokenRef，schemas.js:159）只存单字符串，装不下；dsh-codex 已验证该文档格式与锁方案（H3-13）；路径独立于 Codex CLI（~/.codex）与 dsh-codex（$DSH_HOME/.openai-codex-auth.json）——见 §8 BC-E6 |
| E3-b | credentials seam 存 access token + 各刷新信息拆散存 settings | 排除：refresh_token 是长期凭据，进 settings.yaml（明文 YAML、可能被同步/导出）扩大暴露面（P7）；拆散存储破坏原子性（access 与 refresh 不一致窗口） |
| E3-c | 复用 Codex CLI 的 ~/.codex/auth.json | 排除：dsh-codex 明确"never copied or modified"（dsh-codex-README.md:113）——两个客户端竞争同一 rotating refresh token 会互相失效（README:115 先例）；ToS 面更大 |

> 现有"粘贴 access token"账号（tokenRef 单字符串）保持不变——E3-a 仅用于 preset 账号；
> 两种凭据形态在 resolveOauthToken 处分流（preset → 凭据模块带刷新；手填 tokenRef →
> credentials seam 直读，行为不变——P3 既有功能零影响）。

#### 决策 E4：回调端口与降级链

1455 为 client 注册死值（H3-3），不可换端口避开冲突。设计降级链（对齐 pi-ai H3-12）：

```
一键登录（浏览器 + 1455 loopback）
  ├─ 1455 可监听 → 授权页 → 回调 → code 交换 → 凭据落盘（主路径）
  └─ 1455 被占（Codex CLI / dsh-codex / yoke233 插件在运行）
       ├─ 自动降级 A：设备码流（无需回调端口；headless 场景主用）
       └─ 自动降级 B：手动粘贴（授权页完成后复制回调 URL/code 粘贴回设置页——
          pi-ai manual_code 同款；本项目已有"粘贴 token"UI 先例 client.js:423-428）
```

与本项目既有端口零冲突：8085（gcloud 公开 client loopback）与 3080 主端口回调
（index.js:91-95）均不涉及 1455。占用检测复用 index.js:111-117 的 EADDRINUSE 静默降级
+ oauthBegin 明确报错模式。

#### 决策 E5：协议接入点

`runOauthChat`（service.js:2295）协议数组扩展：`['openai-completions','anthropic','gemini']`
→ 追加 `'codex-responses'`（service.js:2298 单点判定）。请求构造（对齐 H3-8/H3-9）：

```
POST https://chatgpt.com/backend-api/codex/responses
headers: Authorization: Bearer <access>
         chatgpt-account-id: <accountId>      （JWT 提取，凭据模块负责）
         originator: dsh-agent-router          （诚实自标识，不伪装官方 CLI）
         content-type: application/json
body: { model, store:false, stream:false(首选)/true(后备),
        instructions: <systemPrompt>, input: [{role:'user', content:[{type:'input_text',text},
        {type:'input_image',image_url}(带图时)]}], include:['reasoning.encrypted_content'] }
```

错误处理直接复用 H3-14 语义：401/403 → 提示重登（service.js:2396-2398 现状保留）；
429/usage_limit_reached → 解析 `resets_at` 给出"X 分钟后重置"（C-4 失败分类的 rate_limit
样本源）；`response.failed`/`error` 事件 → 提取 code+message。usage 提取：终态响应
`response.usage`（input_tokens/output_tokens，OpenRouter 对标 §4.3 同构）。

**originator 说明**：pi-ai 以 `originator: 'pi'` 运行且生态三个插件可用（H3-9/H3-16），
证明服务端当前不强制官方 CLI 标识；本插件用诚实标识 `dsh-agent-router`，若被拒则按
`originator: 'pi'` 对齐（PoC 判据之一，V-EVO-2c）——不伪装 `codex_cli`（合规边界）。

### 3.3 模块设计：lib/oauth-credentials.js（新增）

职责（≤3 句）：① ChatGPT 等 preset OAuth 凭据文档（access/refresh/expires/accountId）的
读取/校验/原子写入/删除，独立文件存储于 DSH_HOME 插件目录；② 过期前刷新（rotating
refresh token，文件锁串行化防并发双写）；③ 从 access token JWT 提取 accountId 与过期
时间，供调用方构造请求头。

```ts
// 接口草案
export const CHATGPT_PRESET = {
  preset: 'chatgpt-codex',
  authUrl: 'https://auth.openai.com/oauth/authorize',
  tokenUrl: 'https://auth.openai.com/oauth/token',
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',     // H3-1
  scope: 'openid profile email offline_access', // H3-5
  redirectUri: 'http://localhost:1455/auth/callback', // H3-3（死值）
  deviceUrls: { userCode: '.../deviceauth/usercode', token: '.../deviceauth/token',
                verification: '.../codex/device' },   // H3-11
}

export class OauthCredentialStore {
  constructor(filename: string)                       // 默认 DSH_HOME/dsh-agent-router/chatgpt-codex-auth.json
  read(): Promise<Credential | undefined>             // 严格校验（版本/字段/未知键拒绝——H3-13 同款）
  write(cred: Credential): Promise<void>              // temp+rename 原子写 + owner-only mode
  delete(): Promise<void>                             // 登出/删除路径（合规边界）
  ensureFresh(cred, opts?): Promise<Credential>       // 过期/临期(如<120s) → 文件锁内刷新 → 重写
  accountIdFromJwt(access): string | null             // H3-7
}
// Credential = { type:'oauth', access, refresh, expires:number(ms), accountId }
```

错误码（沿用 §4.3.1 v3 风格）：`CREDENTIAL_FILE_CORRUPT`（校验失败→引导重登）、
`CREDENTIAL_LOCK_TIMEOUT`、`REFRESH_FAILED`（refresh_token 也失效→终态需重登）、
`CREDENTIAL_FILE_UNWRITABLE`。安全边界（P7）：写前先写 temp 文件再 rename（崩溃不产生
半写文档）；POSIX 断言 owner-only（Windows 按 dsh-codex 先例跳过 mode 检查但目录仍在
用户 profile 下）；诊断信息永不回传 token 值（dsh-codex safeMessage 先例，auth-routes.ts:82-87）。

### 3.4 授权流改造（service.js + index.js）

1. `oauthBegin`（service.js:2748）：preset 账号分支——常量预填（用户零配置）；authorize
   URL 附加参数对齐 H3-4（`id_token_add_organizations=true`、`codex_cli_simplified_flow=true`
   可选携带，`originator` 必带）；pending 会话复用现有 `oauthPending` Map（10 分钟过期，
   service.js:2776）。
2. `oauthTokenExchange`（service.js:2790）：preset 分支——**保存完整凭据四元组**到
   OauthCredentialStore（对比现状只存 access_token 单值 :2849-2856——此为通用账号行为，
   保持不变）；从 token 响应提取 refresh_token/expires_in（H3-6）。
3. `index.js`：新增 1455 loopback 服务（复制 :99-125 的 8085 模式：EADDRINUSE 静默降级 +
   `oauthLoopbackReady` 同款标志）；回调 handler 复用 `handleOauthCallback`（index.js:41）。
4. 设备码流：`service.oauthDeviceBegin/account`（新增 RPC）——发起 usercode（H3-11 端点）、
   轮询 token（间隔遵守 interval/slow_down）、成功后与 exchange 同路径落凭据；设置页展示
   user_code + 验证页链接。
5. `resolveOauthToken`（runOauthChat :2297 消费）：preset 账号 → `store.ensureFresh()`
   （临期自动刷新）；通用账号 → 现行为不变。

### 3.5 Q2 扩展面（OAuth 通路向 image/speech，DEC-019）

**接口层设计（v0.3.0 交付）+ 实施分期**：

1. **限制解除路径**：service.js:731-732 的 chat-only 检查从"硬编码 type!=='chat' 抛错"改为
   **per-protocol 能力判定**：`oauthCapabilities(protocol)` 返回 `['chat']`（v0.3.0 全部
   协议）——接口形状就位，后续版本按协议扩展返回值（如 codex-responses 增补 `'image'`）
   即解开限制，无需再改调用点（P5 泛化：单点修改）。
2. **runOauth 调度接口**：run() 的 oauth/pool 分支（service.js:731-736）收敛为
   `runOauthDispatch(resolved, input)`——内部按 `protocol × type` 分派；v0.3.0 实现
   `codex-responses × chat` + 其余协议 × chat（现状）；image/speech 分派位留桩（明确
   "该协议暂不支持此类型"错误，替代全局一刀切）。
3. **实施分期**：ChatGPT 订阅的 image 生成端点（dsh-codex imagegen 先例——gpt-image 模型
   经 backend-api）与 audio 转写端点形状**未验证**（V-EVO-3）；待 C-1 chat 通路落地后按
   需求实测再扩展（DEC-019 Q2 裁决为"纳入扩展设计"，非"本期实施全部模态"）。
4. **池语义**：accountPoolSchema（schemas.js:181-195）零改动——池引用 oauthAccounts id，
   preset 账号天然可入池（C-6 泛化前的既有语义自动覆盖）。

### 3.6 合规边界落地（DEC-019 Q1 → 实现）

| 要求 | 落地 |
| --- | --- |
| 默认关闭 | preset 账号创建入口默认隐藏；`router.oauthExperimental`（新配置，default false）开启后才显示"ChatGPT（实验）"预设入口 |
| 显式开启确认 | 首次点击"登录 ChatGPT"弹出一次性确认：ToS 风险声明（opencodex UAYOR 措辞对齐：订阅转插件调用可能导致账号受限，风险自担）+ 确认按钮；拒绝则不开 |
| kill-switch | 三层：① `router.enabled` 总开关（现状，关=全部路由停）；② 账号 `enabled`（现状字段，关=该账号停用）；③ `router.oauthExperimental`（关=入口隐藏+既有 preset 账号调用时明确报"实验通路已关闭"） |
| 凭据删除路径 | 账号卡"登出并删除凭据"：删凭据文件（store.delete）+ 清 oauthAccounts 条目 + 清池引用（联动提示）；对比 dsh-codex"卸载不删凭据需手动 logout"（README:115），本插件做显式一键删除（更保守） |
| 诚实标识 | originator 自标识（§3.2 E5）；不伪装官方 CLI UA/originator |

### 3.7 H2 运行时 PoC 计划（C-1 实施第一步，用户在场登录）

**对象**：yoke233/dsh-openai-codex-auth（RES-003 H2 建议对象——机制最简：PKCE+1455 回调+
1456 控制）。**环境**：独立测试 profile（`dsh plugin --profile poc-codex add
github:yoke233/dsh-openai-codex-auth`），不污染主 profile。

| 步骤 | 操作 | 通过判据 |
| --- | --- | --- |
| P1 | 安装插件 → 重启该 profile → 设置页 OpenAI Codex → 登录（用户在场完成 ChatGPT 授权） | 授权页打开；回调完成；`$DSH_HOME/openai-codex-auth.json` 出现（owner-only 权限，POSIX 下 mode 600） |
| P2 | 设置页查看用量面板 | wham/usage 端点可达，短周期/周窗口显示（H3-14 运行时坐实） |
| P3 | 选 openai-codex 模型发起一次带图对话 | 端到端 token 有效；响应文本返回（Responses API 通路运行时坐实） |
| P4 | 等待/诱发 token 过期后再次调用 | 自动刷新成功（rotating refresh 运行时坐实；凭据文件 mtime 变化） |
| P5 | 记录失败形态样本 | 主动触发一次 429 或观察限流错误文案（为 C-4 分类积累真实样本；记录 resets_at 形态） |
| P6 | 登出 + 卸载 | 凭据删除路径可用；profile 清理干净 |

**失败处理**：若 P1 授权页即拒绝（client 白名单已收紧）→ C-1 升级 L+（RES-003 H3 预案：
转 forward 透传式架构需独立评审）→ D-6 决策点激活。若 P3 失败但 P1 通过 → 协议层问题，
按 H3-8~H3-10 事实比对修正（源码事实在手，排障有据）。
**附加验证（顺带完成）**：V-EVO-2b（`stream:false` 是否被接受：可用 curl 直测
codex/responses）、V-EVO-2c（originator 自标识是否被拒：P3 天然覆盖 pi-ai originator；
自标识在 C-1 自实现首次联调时验证）。

---

## §4 C-3 统计持久化方案（D3）

### 4.1 关键决策

#### 决策 E6：存储布局（DSH_HOME，DEC-018 Q3 裁决）

| 候选 | 方案 | 评估 |
| --- | --- | --- |
| **E6-a（定案建议）** | **按天 JSONL append + 内存聚合镜像**：`$DSH_HOME/dsh-agent-router/stats/daily-YYYY-MM-DD.jsonl`（每行一条调用事件：at/agentId/provider/model/ok/ms/tokens/errorClass/costEstimate）+ `index.json`（按天聚合索引：date → {calls,errors,tokens,ms,cost}，加载后惰性重建可缺省） | append-only 单行写天然小而快（有界队列批量 flush）；按天分文件=保留期清理零成本（删旧文件）；损坏隔离到单行/单文件；聚合可从明细全量重建（索引非权威） |
| E6-b | 单 JSON 全量文件定期重写 | 排除：文件随历史膨胀（90 天全量重写每次写放大）；崩溃窗口内丢全部未写增量；损坏即全损 |
| E6-c | SQLite | 排除：原生模块依赖重（插件零原生依赖现状破坏）；单机统计量级（千~百万行）JSONL 足够 |

#### 决策 E7：写入时机（性能红线——统计写不可阻塞调用路径）

| 候选 | 方案 | 评估 |
| --- | --- | --- |
| **E7-a（定案建议）** | record() 入有界内存队列（现有内存聚合同步保持——零阻塞），**异步批量 flush**（每 ≥50 条或 ≥5s 或进程优雅退出时 append JSONL）；队列满时丢弃最旧待写事件并计数（statsSelfReport.dropped）——**绝不反压调用路径** | 调用路径新增成本 = 一次数组 push（微秒级）；崩溃丢失窗口 ≤5s（统计为插件自有非关键数据，P7 语义：可丢统计、不可损用户数据）；丢弃自报告可观测 |
| E7-b | 每次 record 同步 append | 排除：每次工具调用加一次磁盘 IO 延迟（高并发 CLI/池场景放大）；违反非功能红线 |
| E7-c | 仅退出时全量写 | 排除：崩溃/强杀全丢（现状内存态的主要痛点原样保留） |

#### 决策 E8：成本估算口径（S-1 对标结论落地）

LiteLLM 式**本地可配置单价表**（`.router-files/litellm-custom-pricing.md` §2/§5 对标：本项目
服务商任意含中转，无平台侧注入条件，OpenRouter 式响应自带 cost 仅作端点支持时的直读优
先）：`router.pricing`（dict：model → `{inputPerM, outputPerM}`，per-million 计价，缺省
0 = zero-cost 语义——订阅账号/未知模型仅计 token 不折算现金，对标 litellm-custom-pricing.md
§4）；record 时 `costEstimate = input/1e6×inputPerM + output/1e6×outputPerM`；端点响应自
带 `usage.cost` 时优先直读实际值（OpenRouter 对标 §3 双口径）。单价键按解析后模型名匹配
（base_model 锚定思想，对标 §5）。

### 4.2 数据安全设计（S-3 / P7，MUST 项逐条）

| 要求 | 设计 | 验证（出口条件单测） |
| --- | --- | --- |
| 原子写 | JSONL append（单行 `appendFile`，行内完整 JSON）；index.json 镜像 = temp+rename 原子替换 | kill -9 模拟：无半行残留（或不完整行被自愈跳过） |
| 损坏自愈 | 加载时逐行 JSON.parse：坏行跳过+计数（`statsSelfReport.skippedLines`）；文件级不可读 → rename 为 `daily-*.corrupt-<ts>` 保留现场 + 重建空文件继续服务（不静默丢弃——现场可查） | 单测：注入坏行/坏文件 → 启动成功、skippedLines 计数、corrupt 文件存在 |
| 版本迁移 | 每行含 `v` 字段（首版 v1）；index.json 含 `schemaVersion`；读取时未知版本行跳过并计数；迁移函数链 `migrateLine(vN→vN+1)`（未来加字段只增不删，旧字段缺省） | 单测：v1→v2 模拟（加字段场景） |
| 清空保护 | UI"清空统计"→ 确认对话框（明示影响：N 天/M 条将清除）→ **软删除默认**：`stats/` rename 为 `stats-backup-<ts>/` 后重建（可手工恢复）；设置项 `router.stats.hardDelete`（default false）选真删 | 单测/手测：清空后 backup 目录存在、新统计正常累计 |
| 保留期 | `router.stats.retentionDays`（default 90，DEC-018 Q3）：启动时+每日定时 prune（删除超期 daily 文件与索引项）；backup 目录不自动清理（用户自治） | 单测：注入超期文件 → prune 后消失 |
| 并发多进程 | V-EVO-4 待验证（双 profile 同 DSH_HOME 并发写）；缓解预留：append 单行语义 + 文件锁（dsh-atomic-write withFileLock 先例 H3-13）或按 profile 子目录 | 验证计划见 §11 |

### 4.3 指标扩展（对齐 RES-003 方向 C 差距表）

| 指标 | 来源 | 实现要点 |
| --- | --- | --- |
| 按天聚合 | JSONL 天然按天 | date → calls/errors/tokens/ms/cost（agent 维度+账号维度两视图，与现有两级聚合同构） |
| 成功率 | calls/errors 派生 | successRate = 1 - errors/calls（UI 层派生，不入存储——避免派生值落盘不一致） |
| 时延 p50/p95 | 明细 ms 列 | 按天/按 agent 聚合时排序取分位（明细加载后惰性计算；90 天量级百万行内可控，超量时降级为 reservoir 采样——预留接口） |
| 成本估算 | E8 | costEstimate 入明细行 + 聚合索引；账号维度区分订阅（zero-cost 计 token）/API Key（计价）双口径展示（BC-E4） |
| CSV 导出 | RPC `router/statsExport {range:'7d'|'30d'|'90d', level:'agent'|'account'}` | 返回 CSV 文本（content-type text/csv，浏览器下载）——不落工作区文件（无文件系统污染；对比落盘方案排除：生成文件需清理生命周期）；列：date/agent/account/model/calls/errors/inputTokens/outputTokens/p50ms/p95ms/costEstimate |
| errorClass 维度 | C-4 联动 | v0.3.1 预留字段（写入 v1 行格式），v0.3.2 分类落地后填充——向前兼容（迁移无成本） |

### 4.4 模块分离（C3——从 service.js 分离统计）

**新增 `lib/stats.js`**（~450 行），职责（≤3 句）：① 接收 record 事件做内存两级聚合
（agent/账号，含模型细分）与最近明细/分钟桶（迁移自 service.js:2414-2561）；② 异步批量
持久化到 DSH_HOME 按天 JSONL（原子/自愈/迁移/保留期/软删除）；③ 提供 snapshot（RPC stats
消费）/export（CSV）/prune/load 生命周期 API。

迁移方式（DEC-011 attachments.js 先例）：`RouterService.record/statsSnapshot/resetStats`
改为委托 stats 模块（service.js 净减 ~220 行）；`this.totals/recent/series/accountTotals/
accountSeries` 五个实例字段整体迁移；测试新增 `tests/stats.mjs`（存储/自愈/迁移/导出），
`tests/smoke.mjs` 统计断言回归（P3：既有断言全部保持）。

依赖：stats.js 为依赖源（仅依赖 node:fs/node:path 与 schemas 常量），被 service.js 消费
——不反向依赖（无环，§6）。

---

## §5 C-4 成功率闭环方案（D4）

### 5.1 失败分类（lib/failure.js 新增，~150 行）

职责（≤3 句）：① 把任意错误对象+上下文分类为标准枚举（纯函数，无 IO）；② 给出可重试
性与建议等待（retryable/retryAfterMs）；③ 供 run* 执行通路（重试决策）与 stats（errorClass
记录）共同消费。

| 枚举 | 判定特征（来源标注） | 可重试 | 策略 |
| --- | --- | --- | --- |
| `auth` | HTTP 401/403；"token 无效或已过期"（service.js:2396-2398 现有文案）；REFRESH_FAILED（§3.3） | 否（同账号） | 跳过该账号+标记"需重登"（池内继续换号）；UI 引导重登 |
| `rate_limit` | HTTP 429；`usage_limit_reached`/`usage_not_included`/`rate_limit_exceeded`（H3-14）；Retry-After 头 | 否（立即） | 冷却 max(Retry-After, resets_at 距今, 60s)；池内换号 |
| `timeout` | AbortSignal timeout；CLI 总超时（service.js:71 默认 15min）；"端点不可达"外的超时文案 | 是 | 退避重试（≤1 次） |
| `network` | fetch TypeError（ENOTFOUND/ECONNREFUSED/DNS）；"端点不可达"（service.js:2392 现有文案） | 是 | 退避重试（≤1 次）+ 换号 |
| `model` | 空响应（"返回中没有文本内容" service.js:2408 现有文案）；协议解析失败；内容策略拒绝 | 是（1 次） | 同账号轻退避；连续 model 类失败→诊断卡建议换 agent |
| `unknown` | 兜底 | 否 | 记录原始 message（截断 300 字符，现状 :2513 同款） |

分类器为**前缀/状态码匹配的纯函数**（错误 → {class, retryable, retryAfterMs}），全部特征
串均有代码级出处（上表"来源标注"列）——不引入猜测特征（P1）。

### 5.2 自动重试策略（防风暴预算制）

```
单次 route_agent 调用（run() 入口建立 RetryBudget）:
  总重试预算 ≤3（含换账号次数；默认值，router.retry.budget 可配 0-3，0=行为等价现状）
  ├─ 同账号重试：仅 timeout/network/model 类；指数退避 500ms×2^n + 全抖动；每账号 ≤1 次
  ├─ 换账号（池模式）：衔接现有候选循环（service.js:958-983）——
  │    auth 类   → 立即跳过该账号（不浪费请求）+ 标记需重登（账号健康字段）
  │    rate_limit → 账号冷却窗（accountCooldownUntil Map）+ 换下一候选
  │    其他类    → 现行为（记健康统计换下一个，service.js:973-980 保持）
  └─ rate_limit 永不立即重试（同账号）；全局闸：同 agent 并发重试 ≤1（in-flight 计数）
```

与 C-3 联动：每次重试也 record（errorClass 标注）→ 重试率/放大系数可观测（BC-E3 监控面）。

### 5.3 用户侧入口（失败诊断卡 + 重试/换 agent）

| 决策 | 候选与取舍 |
| --- | --- |
| 重试执行通路 | **候选1（定案建议）：重试按钮 → pre-step 合成 user 消息**（"请重新调用 route_agent(agent=X, task=<上次任务摘要>)，上次失败：<分类+一句建议>"）——走既有 pre-step 注入机制（V-DSH-1 已验证持久化），主 agent 下一轮自然执行，会话上下文完整。候选2（排除）：客户端直调 service.run RPC 绕过主 agent——会话无对应 tool_use 记录，上下文断裂，违反 C-1 精神（专业 agent 只作为被调用的工具，调用应由主 agent 发起） |
| 诊断卡内容 | 结构化错误块（route_agent 工具结果 error 时渲染）：分类徽标（认证/限流/超时/网络/模型）+ 人话解释一行 + 建议动作（重试/换账号/重登/换 agent）+ 重试按钮（候选1 通路）；lib/tool.js execute 抛错处附带 errorClass（~40 行） |
| "换 agent"入口 | 诊断卡建议文案给出同模态替代 agent 目录（复用 listAgentsByModality，v3 M5）——主 agent 按建议自行决策调用（不自动换，保持主 agent 主导——v3 R-1 精神） |

### 5.4 C-9 实测计划（前置数据，U-3 落地）

| 项 | 设计 |
| --- | --- |
| 样本量 | N ≥ 30 带图轮（真实使用场景），另 ≥10 纯文本对照轮；覆盖 ≥3 场景类型（截图理解/图表解读/照片问答） |
| 统计口径 | ① 三通道响应率 =（直答且内容引用图片 + route_agent 调用）/ N；② route_agent 触发率 = route_agent 调用 / N（D-1-3 主体指标）；③ 分层：主模型多模态（直答分支计入有效）vs 纯文本（必须调工具）——对齐 architecture-v3 §11 D-1-3 定义；④ 失败率按 C-4 分类分布 |
| 采集方式 | 复用 D-1 观测（MIG-001 Step 10 已落地 tests/metrics.mjs 31 项）+ 新增 tools/usage-report.mjs 汇总脚本（从会话 JSONL 抽取 request/context 恒主模型断言样本 + route_agent 调用计数） |
| 时点 | v0.3.0 发布即启动（机制面已全过，纯数据采集）；v0.3.2 出报告（若触发率 <90% → BC-1 缓解选项激活：reminder 措辞强化评审） |
| 与 C-4 关系 | 并行：C-4 失败分类不依赖 C-9 结论（分类面向错误处理，C-9 面向正常路径触发率）；C-9 数据用于决定"主线 2 后续投入界面还是 reminder 强化"（RES-003 CE-2 结论落地） |

---

## §6 模块划分与依赖图（衔接 v3 M1-M8）

### 6.1 新模块与 v3 模块对照

| 新模块 | 衔接的 v3 模块 | 关系 |
| --- | --- | --- |
| **M-O** `lib/oauth-credentials.js`（§3.3） | M6 工具包与执行 / M8 后端链 | M8 的 runOauthChat 消费（ensureFresh/accountId）；M6 的 oauthBegin/exchange 生产（write） |
| **M-S** `lib/stats.js`（§4.4） | M6（record 回写）/ M7 展示（经 RPC snapshot/export） | M6 调 M-S.record；M7 经 M6 的 RPC handler 间接消费（client 不直接 import——经 wire 契约） |
| **M-F** `lib/failure.js`（§5.1） | M6（run* 重试决策）/ M-S（errorClass 维度） | M6/M8 调 M-F.classify；M6 record 时携带 M-F 结果 |

### 6.2 依赖图（含新模块；方向：X → Y = X 依赖 Y）

```
M7 展示与交互(client) ──► M6 工具包与执行(service.run/oauth RPC) ──► M8 后端链(runOauthChat/池/CLI)
                                │        │                              │
                                │        ├──► M-S(stats)                ├──► M-O(oauth-credentials)
                                │        └──► M-F(failure)              └──► M-F(failure 分类)
                                └──(RPC wire 契约，不直接 import M-S)
M1/M3/M4/M5（v3 既有，本设计不动）
```

**环分析**：M-O、M-S、M-F 均为依赖源（无模块出边，仅依赖 node 内置与 schemas 常量）；
全部新边终止于依赖源 → 无回边 → **无环 ✓**（与 v3 §4.2 环分析同口径）。v3 既有边
（M1→M4→M2/M5 等）零改动——本设计不触碰 M1-M5 内部。

### 6.3 职责复核（每模块 ≤3 句）

- **M-O oauth-credentials**：见 §3.3（已 ≤3 句）。
- **M-S stats**：见 §4.4（已 ≤3 句）。
- **M-F failure**：见 §5.1（已 ≤3 句）。

---

## §7 ADR 集（字段 100% + 可逆性标注）

### ADR-005：ChatGPT 订阅 OAuth 接入（借 Codex CLI 公共 client，preset + 自实现协议分支）

- **标题**：新增 `chatgpt-codex` OAuth 账号预设——借 OpenAI Codex CLI 公共 client
  （PKCE + localhost:1455 回调 + 设备码后备）接入 ChatGPT 订阅，凭据独立文件存储，
  协议走 codex-responses 分支
- **日期**：2026-08-20
- **背景**：用户三主线之"OAuth 一键登录"在 gcloud 公开 Client 被 Google 封死
  （service.js:312-336）后受挫；RES-003 §4 A3 判定正确出路是借 CLI 厂商自有 OAuth
  Client；DEC-019 Q1 用户裁决只 ChatGPT 先行。H3 源码级验证（§3.1）证实 Codex client
  常量/端点/PKCE/刷新/协议全部公开可复用，DSH 生态 ≥3 插件先例。
- **决策**：① 自实现 OAuth 流与最小 codex-responses 客户端（E1-a：复用现有
  oauthBegin/oauthTokenExchange + 新增 1455 loopback + runOauthChat 第 4 协议分支）；
  ② preset 账号形态接入 oauthAccounts（E2-a）；③ 凭据四元组独立文件存储
  `$DSH_HOME/dsh-agent-router/chatgpt-codex-auth.json`（E3-a：原子写+文件锁+严格校验）；
  ④ 降级链：1455 被占→设备码→手动粘贴（E4）；⑤ 合规边界：默认关闭+显式确认+三层
  kill-switch+一键删除凭据（§3.6）；⑥ Q2 扩展面：chat-only 限制改为 per-protocol 能力
  判定接口（§3.5）。
- **备选方案**：E1-b 依赖 pi-ai provider（peerDependency）；E1-c 经 dsh-llm-pi-ai 注册
  llm 路由；E2-b 新顶层账号字典；E3-b credentials seam 拆散存储；E3-c 复用 ~/.codex/
  auth.json（各排除理由见 §3.2 决策表）。
- **排除理由**：汇总——pi-ai 全量库引入违反"当前需要"（且 peer 解析在 junction 安装
  形态未验证）；llm 路由注册违反本项目 OAuth 不变量（schemas.js:137-147）；新字典冗余
  （C4）；seam 装不下四元组且 refresh_token 进明文 settings 扩大暴露面（P7）；复用
  Codex CLI 凭据文件会双客户端竞争 rotating refresh（dsh-codex README:108-115 明示）。
- **影响范围**：`lib/schemas.js`（preset/credentialFile/oauthExperimental）、新增
  `lib/oauth-credentials.js`、`lib/index.js`（1455 loopback）、`lib/service.js`
  （oauthBegin/Exchange/resolveOauthToken/runOauthChat 四点）、`lib/client.js`（账号卡
  UI+确认+删除）、`tests/`；S-2 量级 ~1140 行。不改既有 OAuth 通用账号行为（粘贴 token
  /自建 Client 路径零影响——P3）。
- **后续动作**：H2 PoC（§3.7，实施第一步）→ v0.3.0 实施（§2.1 出口条件）→ ChatGPT 落地
  后复核 C-2（DEC-019）。
- **可逆性**：**可逆（中风险）**——preset 账号/凭据文件/1455 服务均为独立增量；回滚 =
  oauthExperimental 关闭（用户层）或移除 preset 分支（代码层，单 commit）；风险残留：
  OpenAI 侧风控为外部不可逆因素（BC-E1 监控+降级链对冲）。

### ADR-006：统计模块分离与持久化（lib/stats.js + DSH_HOME 按天 JSONL + 数据安全四件套）

- **标题**：统计从 service.js 分离为独立模块并持久化到 DSH_HOME（按天 JSONL append +
  异步批量 flush），交付按天聚合/成功率/p50·p95/成本估算/CSV 导出，含原子写/损坏自愈/
  版本迁移/清空保护四件套
- **日期**：2026-08-20
- **背景**：统计为纯内存态（service.js:2414-2561，README:131"重启清零"）——用户主线 3
  两个关键词（专业性/持久化）当前均为 ❌（RES-003 §4 C）；DEC-018 Q3 裁决 DSH_HOME +
  默认 90 天 + S-3 数据安全绑定；service.js 已 **2965 行**（R1 审查 W-1 更正；C2 反腐化：统计职责分离有
  DEC-011 attachments.js 先例）。
- **决策**：① 新增 `lib/stats.js` 承接两级聚合/明细/分钟桶 + 持久化（record/statsSnapshot/
  resetStats 委托迁移，现统计段 service.js:2412-2572——R1 审查 S-1 更正引用边界）；② 存储布局 = 按天 JSONL + 聚合索引镜像（E6-a）；③ 写入 = 有界
  队列异步批量 flush，绝不阻塞调用路径（E7-a）；④ 数据安全四件套 + 保留期 + 软删除默认
  （§4.2）；⑤ 成本估算 = 本地可配置 per-model 单价表（zero-cost 缺省）+ 端点自带 cost
  直读优先（E8，S-1 对标）；⑥ CSV 导出经 RPC 返回文本浏览器下载。
- **备选方案**：E6-b 单 JSON 全量重写；E6-c SQLite；E7-b 同步 append；E7-c 仅退出写；
  CSV 落工作区文件方案（各排除理由见 §4.1/§4.3）。
- **排除理由**：全量重写有写放大与全损风险；SQLite 引入原生依赖；同步 append 违反性能
  红线；仅退出写不解决崩溃丢失；CSV 落盘引入文件清理生命周期。
- **影响范围**：新增 `lib/stats.js`；`lib/service.js`（五个统计字段+三方法迁移，净减
  ~220 行）；`lib/schemas.js`（router.stats.* 配置+router.pricing）；`lib/rpc.js`
  （statsExport codec）；`lib/client.js`（按天视图/成本列/导出/清空确认）；新增
  `tests/stats.mjs`。S-2 量级 ~1000 行。
- **后续动作**：v0.3.1 实施（出口条件 §2.1）；V-EVO-4（双 profile 并发）验证后定锁策略。
- **可逆性**：**可逆（低风险）**——独立模块；行为回退开关：`router.stats.persist`
  （default true，false=回到纯内存态=现状行为）；数据回退 = 删 stats 目录（或恢复
  backup）；service.js 委托迁移为等价重构（smoke 统计断言回归保障 P3）。

### ADR-007：失败分类与预算制重试（lib/failure.js + 池切换增强 + pre-step 重试入口）

- **标题**：新增失败五分类（auth/rate_limit/timeout/network/model）纯函数模块与预算制
  自动重试（防风暴），池切换按分类决策（auth 跳过/rate_limit 冷却），用户侧经诊断卡 +
  pre-step 合成消息提供重试/换 agent 入口
- **日期**：2026-08-20
- **背景**：失败可观测但无闭环（errors 单一计数无分类、无自动重试换号策略、无用户侧
  挽回入口——RES-003 §4 B 差距表）；H3-14 已源码级获取 ChatGPT 限流错误语义
  （usage_limit_reached/resets_at），C-1 落地后分类特征可直接复用；现有池切换
  （service.js:958-983）不区分失败类型（auth 失败也浪费下一个请求）。
- **决策**：① 新增 `lib/failure.js`（分类+可重试性+建议等待，纯函数，特征串全部有代码
  出处 §5.1）；② 预算制重试：单次调用总重试 ≤3（可配 0=等价现状）、rate_limit 永不立即
  重试、同 agent 并发重试全局闸 ≤1、退避全抖动（§5.2）；③ 池切换增强：auth 跳过+标记
  重登、rate_limit 账号冷却窗（衔接现有候选循环，不新建机制）；④ 用户侧重试 = pre-step
  合成 user 消息（候选1，§5.3——保持主 agent 主导）；⑤ errorClass 入 record 管线与统计
  维度（v0.3.1 预留字段）。
- **备选方案**：客户端直调 RPC 重试（排除：绕过主 agent，上下文断裂，违 C-1 精神）；
  无预算无限重试（排除：重试风暴 BC-E3）；自动换 agent（排除：保持主 agent 对路由的
  决策权，v3 R-1；仅建议不代决）。
- **排除理由**：见各候选括注；核心取舍——闭环的"自动"止步于同任务重试/同池换号，
  跨 agent 决策权留给主 agent（与 v3 架构原则一致）。
- **影响范围**：新增 `lib/failure.js`；`lib/service.js`（run* 分类采集+池切换冷却+
  RetryBudget）；`lib/tool.js`（错误结构化）；`lib/client.js`（诊断卡+重试按钮）；
  `lib/stats.js`（errorClass 维度）；`tests/`。S-2 量级 ~840 行。
- **后续动作**：v0.3.2 实施（依赖 v0.3.1 stats 模块）；C-9 报告同版出（§5.4）。
- **可逆性**：**可逆（低风险）**——`router.retry.budget=0` 即行为等价现状（分类仍记录，
  纯增量可观测性）；诊断卡/重试按钮为 UI 增量；池切换增强在现有循环内改造，回滚 =
  恢复无分类循环（单 commit）。

---

## §8 蓝军挑战（≥3 条，独立 ID + 回应）

| ID | 挑战（如果…会怎样） | 回应（缓解措施） |
| --- | --- | --- |
| **BC-E1** | 如果 OpenAI 收紧 client 白名单（`app_EMoamEEZ73f0CkXaXp7hrann` 被拒授权页 / originator 校验 / 订阅转插件账号被风控）——C-1 变死路？ | ① 默认关闭+显式开启（故障面收敛到主动 opted-in 用户，DEC-019 合规边界）；② 双通道+降级链（浏览器 1455 / 设备码 / 手动粘贴——收紧通常逐步影响，设备码与浏览器通道被同时堵死前有观察窗口）；③ 诚实 originator 自标识（不伪装官方 CLI——被拒时错误可诊断，PoC 判据 V-EVO-2c 前置发现）；④ 监控面：登录失败率/429 形态入统计（C-4 联动），异常升高=收紧信号；⑤ 最坏回退：oauthExperimental 关闭/preset 下架（kill-switch），API Key/CLI/其他 OAuth 通路零影响（增量设计，ADR-005 可逆性）；⑥ 若确认收紧：转 forward 透传式架构（opencodex 先例）需独立评审——本设计不含此路径（不预设） |
| **BC-E2** | 如果统计文件损坏（崩溃半写/磁盘满/双 profile 并发写同一 DSH_HOME）或膨胀（90 天高频 JSONL 巨大）——启动变慢/丢数据/互相覆盖？ | ① 损坏隔离：append-only 单行语义——坏行跳过+计数、坏文件 rename .corrupt 保留现场重建（不静默丢，§4.2）；② 半写自愈：kill -9 最多丢 ≤5s 队列窗口（E7-a 有界队列设计内）；③ 并发：单行 append 天然较小冲突面 + V-EVO-4 验证双 profile 实况（预留 withFileLock/按 profile 子目录两案，验证后定）；④ 膨胀：按天文件+保留期 prune 零成本；启动只加载最近 N 天明细（更早走聚合索引），加载预算 200ms 为出口条件；⑤ p95 全量排序超量时降级 reservoir 采样（接口预留 §4.3） |
| **BC-E3** | 如果自动重试引发重试风暴（多 agent 并发失败 → 重试×换账号叠加 → 上游压力倍增 → 更多 429 → 更多重试）——放大故障？ | ① 预算制硬顶：单次调用总重试 ≤3（含换号）、同账号重试 ≤1、同 agent 并发重试全局闸 ≤1（§5.2）；② rate_limit 永不立即重试 + 冷却窗 max(Retry-After, resets_at, 60s)——限流场景自动让路；③ 退避全抖动（jitter）防多客户端同步共振；④ 重试本身 record（errorClass 标注）→ 重试率/放大系数=可观测指标，风暴萌芽即可见；⑤ budget=0 配置=一键回到零重试行为（ADR-007 可逆性） |
| **BC-E4** | 如果 ChatGPT 订阅调用与 API Key 调用在统计/成本报表里混淆（订阅不按 token 计费，但明细记了 tokens 且单价表缺省 0）——成本数字误导用户？ | ① 成本口径双列：token 估算成本 + 账号维度订阅标记（"包含在订阅内"徽标，§4.3）；② zero-cost 语义显式化：单价缺省 0 = 不折算而非"免费"——UI 展示口径区分（对标 LiteLLM zero-cost 语义 litellm-custom-pricing.md §4）；③ preset 账号在账号卡明示"订阅账号（不按 token 计费）"；④ pricing 表可 per-model 覆盖（用户自填中转价） |
| **BC-E5** | 如果 1455 端口长期被占（用户日常运行 Codex CLI 或已装 dsh-codex 系插件）——一键登录永远走不通？ | ① 降级链自动兜底（E4）：占用检测（EADDRINUSE，index.js:111 先例）→ 设备码流（无需回调端口，headless 主用通道本就必做）；② 手动粘贴第三兜底（pi-ai manual_code 先例 H3-12 + 本项目粘贴 token UI 先例 client.js:423-428）；③ 错误信息明确指引（关闭占用程序 / 用设备码）；④ 日常调用不依赖 1455（仅登录瞬间需要）——登录一次后刷新走 token 端点，端口占用不影响使用 |
| **BC-E6** | 如果用户同时安装 dsh-codex 与本插件（或本插件与 Codex CLI 并存）——多个客户端竞争同一 ChatGPT 账号的 rotating refresh token 互相失效？ | ① 凭据文件路径三方独立：本插件 `$DSH_HOME/dsh-agent-router/chatgpt-codex-auth.json` ≠ dsh-codex `$DSH_HOME/.openai-codex-auth.json` ≠ Codex CLI `~/.codex/auth.json`；② OpenAI refresh token 为 per-credential 独立轮换——**各自独立授权会话的凭据互不失效**（dsh-codex README:108-115 的竞态警告针对"同一凭据文件被两个客户端读写"，不是跨凭据文件）；③ 同插件多 profile 场景：DSH_HOME 内同路径 → 文件锁串行化（withFileLock 先例 H3-13）+ 刷新后重读（modify 语义 read-modify-write 全程持锁）；④ 文档明示共存语义（README FAQ） |
| **BC-E7** | 如果 v0.3.x 三个新模块 + service.js 多点改造引入回归（统计迁移漏调用点 / runOauthChat 分支破坏既有三协议 / 池切换改动影响现行为）——P3 违背？ | ① 迁移纪律沿用 MIG-001 模式：每版本分步提交+每步测试全绿+Code Reviewer 审查（§2.1 出口条件含"534+ 断言零回退"）；② 统计迁移为等价重构（委托模式，smoke 统计断言全部保持）；③ runOauthChat 新分支为第 4 协议（既有三协议分支代码不动，smoke 既有协议用例回归）；④ 池切换增强在现有循环内（auth/rate_limit 分支新增，其余类型走原逻辑 service.js:973-980 保持）；⑤ budget=0/persist=false 两个行为等价开关作为整体回退锚点 |

---

## §9 非功能需求逐项对照

| 维度 | 需求 | 设计措施（章节） | 验证 |
| --- | --- | --- | --- |
| **性能** | 统计写不可阻塞调用路径；统计加载不拖慢启动；调用通路新增开销≈0 | §4.1 E7-a（有界队列异步 flush，调用路径仅 push）；§4.3（启动只载最近 N 天+p95 惰性）；§3.2 E1-a（runOauthChat 为既有非流式模式同构分支，无流式转发开销） | 加载 200ms 预算单测（100 天模拟）；record 路径微基准（push-only 断言）；smoke 既有断言 |
| **安全** | 凭据保护；统计不含敏感内容；导出无凭据泄漏 | §3.3（独立文件 owner-only+原子写+锁+严格校验+诊断不回传 token 值）；§3.6（删除路径+默认关闭）；§4（统计仅元数据+token 数，无 task 内容/凭据；CSV 仅聚合数字）；§3.2 E3-b 排除理由（refresh_token 不进明文 settings） | 凭据模块单测（权限/原子/锁）；CSV 列白名单断言；smoke 负向断言 |
| **可用性** | 任一环失败有降级与明确错误；失败可理解可挽回 | §3.2 E4（登录三级降级链）；§3.3（错误码族）；§5.3（诊断卡+建议动作+重试入口）；§4.2（损坏自愈不停服） | 降级链单测/手测；错误码单测；诊断卡渲染测试 |
| **可维护性** | 模块职责单一；无循环依赖；巨石缓解 | §6（三新模块各 ≤3 句职责，依赖源定位，环分析）；§2.2（service.js 净变化 +160 而非 +600——统计分离抵消）；preset/protocol 能力接口单点扩展（§3.5） | 依赖图检查；模块行数预算；新增模态/协议 smoke 用例 |
| **可扩展性** | 面向未来设计（C-2/新厂商/新模态/新计价维度） | §3.2 E2-a（preset 机制可扩 anthropic 等）；§3.5（per-protocol 能力判定=Q2 解除路径单点）；§4.1 E8（pricing 表可扩 per-image/per-audio——LiteLLM 扩展键对标）；§5.1（failure 枚举可扩）；§4.3（p95 reservoir 降级接口预留） | 扩展点清单化（本表即索引）；C-2 增量估算已给（§2.2） |

---

## §10 风险与回滚

| # | 风险 | 等级 | 缓解 | 回滚点 |
| --- | --- | --- | --- | --- |
| R-E1 | OpenAI 侧变化（client 收紧/端点变更/风控） | **高**（外部不可控） | BC-E1 全套（默认关闭/降级链/监控/诚实标识）；H2 PoC 前置发现；协议事实源码固化（H3）降低跟随成本 | kill-switch 三层（§3.6）；preset 下架单 commit |
| R-E2 | H2 PoC 失败（生态插件当前不可用=服务端已收紧） | 中 | PoC 为实施第一步（§3.7），失败在动工前暴露；升级 L+ 预案（forward 透传需独立评审，D-6 决策点） | C-1 整体不启动，v0.3.1/C-3 不受影响（版本解耦 §2.1） |
| R-E3 | 双 profile 并发写统计冲突 | 中 | V-EVO-4 验证；单行 append+文件锁/子目录两案预留（§4.2） | persist=false 回纯内存（现状行为） |
| R-E4 | 统计迁移等价性破绽（遗漏调用点/快照形状漂移） | 中 | 等价重构纪律+smoke 统计断言全保持（BC-E7）；stats.mjs 新单测覆盖存储/自愈/导出 | 委托迁移单 commit 可回退（恢复 service 内联统计） |
| R-E5 | 重试策略与上游行为不匹配（退避不足/过度） | 低-中 | budget 可配 0-3（0=等价现状）；重试率可观测（BC-E3 监控面）；真实样本先行（PoC P5 采集 429 形态） | budget=0 一键关闭 |
| R-E6 | 服务商错误文案变化致分类失准（落入 unknown） | 低 | unknown 兜底不丢数据（原始 message 截断保留）；分类特征全有出处可增量补充（§5.1）；errorClass 分布监控发现失准 | 纯函数模块单点修 |
| R-E7 | v0.3.x 周期拉长（四版本串行过久） | 低-中 | C-1/C-3 可并行开发（§2.1 分期说明）；每版本出口条件独立可验证，允许按版本裁剪（C-8 可选顺延先例） | 版本内容可重排（D-6 复核点） |

---

## §11 假设与验证状态清单（事实/假设分离）

| ID | 假设/待验证项 | 状态 | 验证方法 | 若证伪的影响 |
| --- | --- | --- | --- | --- |
| ~~H3~~ | OpenAI Codex OAuth 流对第三方 client 开放 | **✅ 已验证成立（源码级，2026-08-20）**——§3.1 十六项证据（client id/端点/端口/PKCE/刷新/协议/头/事件/设备码/存储先例/依赖先例）；快照落盘 `.router-files/` | 已执行（pi-ai 0.82.1 本地源码 + dsh-codex 仓库源码 + 生态 README 交叉） | 无需触发；残留时间敏感项归 H2 |
| H2 | DSH 生态 ChatGPT OAuth 插件当前实际可用（服务端仍接受该 client） | 未验证（文档+源码级，运行时未测） | §3.7 PoC 计划（P1-P6，独立 profile，用户在场） | C-1 升级 L+（转 forward 透传需独立评审）；R-E2 |
| V-EVO-2a | 自实现路径下 runOauthChat 非流式请求被 codex/responses 接受（`stream:false`） | 未验证 | PoC 附加项：curl/脚本直测端点（§3.7 附加验证） | 落 SSE 聚合后备（~80 行，事件形状已源码验证 H3-10）——协议分支实现量增加，设计不变 |
| V-EVO-2c | `originator: dsh-agent-router` 自标识被服务端接受 | 未验证 | C-1 自实现首次联调（PoC P3 用 pi-ai originator 先跑通基线再测自标识） | 对齐 `originator: pi`（仍非官方 CLI 标识）；进一步被拒则 R-E1 路径 |
| V-EVO-3 | ChatGPT 订阅 image 生成端点（dsh-codex imagegen 先例）与 audio 端点形状可复用 | 未验证（dsh-codex src/imagegen.ts 存在但未实读） | Q2 实施前实读 imagegen.ts + 一次手工调用 | Q2 image 通路延后（接口层已就位不受影响，§3.5） |
| V-EVO-4 | 双 profile 并发写同一 DSH_HOME 统计目录的冲突实况 | 未验证 | v0.3.1 实施期：双 profile 同装插件并发调用采样观察 | 启用文件锁或按 profile 子目录（两案已预留 §4.2） |
| V-EVO-5 | 主模型三通道响应率 ≥90%（D-1-3/V-DSH-5 延续） | 未验证 | C-9 实测计划（§5.4，N≥30） | BC-1 缓解选项激活（reminder 措辞强化评审——v3 遗留路径） |
| V-EVO-6 | DSH_HOME 跨 profile 是否共享（影响 E3-a 凭据文件与 E6 统计目录的并发语义） | 未验证 | 实施期打印 resolveDshHome 结果（多 profile 对比） | 若共享 → V-EVO-4 锁方案必选；若隔离 → 并发风险消除（简化） |

> 已继承已验证项不重复列出（V-DSH-1/2/3/7 等见 architecture-v3 §13）。

---

## 附录：proposed DEC 条目（D-6 定稿建议，Coordinator 写回 decision-log）

> 建议编号 DEC-020（以 decision-log 实际下一号为准备）。

| 字段 | 内容 |
| --- | --- |
| 编号 | DEC-020（proposed） |
| 日期 | 2026-08-20 |
| 决策标题 | v0.3.x 战略演进路线图定稿（D-6）——版本分期 + C-1/C-3/C-4 方案采纳 |
| 上下文 | RES-003（APPROVED_WITH_NOTES）给出九候选与 Top3；DEC-018 裁决 Q3=DSH_HOME+90天+S-3 绑定、Q4 不引入免费链；DEC-019 裁决 Q1 只 ChatGPT、Q2 纳入扩展设计；ARCH-002 完成 H3 源码级验证（Codex OAuth client/端点/协议全部事实固化）与 S-1/S-2/S-3 交付，设计文档 `docs/architecture/evolution-roadmap-v1.md` |
| 可选方案 | 版本分期：C1 四期分版（v0.3.0 C-1 → v0.3.1 C-3 → v0.3.2 C-4+C-5 → v0.3.3 C-6+C-7[+C-8]）/ C2 三期合并（C-1+C-3 同版）/ C3 两期大版本；C-1 实现：自实现（E1-a）/ pi-ai 依赖（E1-b）/ llm 路由（E1-c）；C-3 存储：按天 JSONL（E6-a）/ 单 JSON / SQLite |
| 决策结论 | 建议：**四期分版**（每版单一主题+独立出口条件，C-1 风险与 C-3 解耦）；**C-1 = E1-a 自实现**（preset 账号+独立凭据文件+1455 回调+设备码后备+codex-responses 协议分支+默认关闭合规边界）；**C-3 = E6-a+E7-a**（lib/stats.js 分离+DSH_HOME 按天 JSONL+异步批量 flush+数据安全四件套+成本单价表+CSV 导出）；**C-4 = 预算制重试**（lib/failure.js 五分类+池切换分类决策+pre-step 重试入口）；采纳 ADR-005/006/007；C-9 贯穿采集 v0.3.2 出报告；C-2 维持观察项；H2 PoC 为 C-1 实施第一步门禁 |
| 理由 | 四期：P4/C4 版本语义单一+C-1 外部风险（R-E1）不应阻塞无争议的 C-3；E1-a：协议事实已 H3 源码固化（自实现风险可控）+零新依赖+与 oauthAccounts 架构一致（E1-b 违反"当前需要"且 peer 解析未验证 V-EVO-2、E1-c 违反 schemas.js:137-147 不变量）；E6/E7：append-only+异步 flush 是唯一同时满足性能红线与数据安全四件套的布局；预算制重试：BC-E3 防风暴+行为等价开关可回退 |
| 影响范围 | 版本路线图（plan-tracker 版本规划行）、v0.3.0-v0.3.3 四版本范围、新增三模块（oauth-credentials/stats/failure）、service.js 统计分离、settings schema 扩展（preset/stats/pricing/retry/oauthExperimental）、C-2/C-6/C-7/C-8 后续排序 |
| 相关任务 | ARCH-002, DEV-后续（v0.3.0~v0.3.3）, H2 PoC |
| 状态 | proposed（待 Design Reviewer 审查 + 用户 D-6 定稿） |
| 复核日期 | H2 PoC 结果出来时（R-E2 路径）；v0.3.2 C-9 报告后（主线 2 后续投入方向） |

---

## 自检清单（硬门槛，执行前承诺逐项核对）

| 检查项 | 结果 |
| --- | --- |
| Design Doc 五段最小结构齐全（目标/方案/替代方案/风险/非功能） | ✅ §1 / §2-§5 / §3.2+§4.1+§5.3（每决策 ≥2 候选+排除）/ §10 / §9 |
| 关键决策 ≥2 候选 + 排除理由 | ✅ 6 处显式候选表（§3.2 E1/E2/E3、§4.1 E6/E7、§5.3 重试通路）+ E8 行文双候选（§4.1）+ E4/E5 为约束推导/派生接入点（无被隐藏的可行替代——R1 审查确认实质满足；W-3 修正后口径） |
| 蓝军挑战 ≥3 条 + 缓解 | ✅ §8 七条（BC-E1~E7，覆盖任务建议三挑战面） |
| ADR 字段 100% + 可逆性标注 | ✅ §7 三条（ADR-005/006/007，标题/日期/背景/决策/备选/排除/影响/后续/可逆性九字段齐全） |
| 模块职责 ≤3 句/个，依赖无环 | ✅ §6（三新模块各 ≤3 句；环分析无环；衔接 M1-M8 不推翻 v3） |
| H3 验证记录存在（源码级或显式降级） | ✅ §3.1 十六项源码级（无降级需要）；快照落盘 .router-files/ |
| S-2 复杂度量化覆盖九候选 | ✅ §2.2 九行全量（含观察项 C-2 与已排除项说明） |
| S-1 对标落盘（URL 标注） | ✅ .router-files/litellm-custom-pricing.md、openrouter-usage-accounting.md（含 URL+摘录+映射） |
| S-3 数据安全显式 | ✅ §4.2 四件套逐条+验证列 |
| H2 PoC 计划（步骤+判据） | ✅ §3.7（P1-P6+失败处理+附加验证） |
| AI 编程风险缓解（过度工程/替代缺失/隐性假设） | ✅ O 清单防过度（§1.2）；八决策防替代缺失；§11 显式假设清单（V-EVO-2a/2c/3/4/5/6） |
| 唯一写目标文件 + .router-files 落盘；不改产品代码/.governance | ✅ 本文档 + 6 份对标/源码快照（§表头证据落盘行）；ADR/DEC 以 proposed 返回 |
