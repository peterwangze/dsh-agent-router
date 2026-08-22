# Code Review 报告 — EVO-002 Step 1（schemas preset）

| 项 | 值 |
|---|---|
| Task | EVO-002（v0.3.0 C-1 ChatGPT 订阅 OAuth 实施）· Step 1 / ~7 |
| Round | R1（首审） |
| 审查对象 | commit `11c42c0bd8a05e5ca403a509371449524f4f942d`（main HEAD，已核实 `.git/refs/heads/main` = 该 hash） |
| 变更集 | lib/schemas.js（+18）、tests/smoke.mjs（+15/-1），共 2 文件 +33/-1 |
| 审查者声明 | Code Reviewer Agent（独立于 Developer）；只读审查，未修改产品代码，未执行测试/命令（测试证据由 Developer 提供，本审查做事实核对与逻辑推演）；已加载 agents/code-reviewer.md 角色定义与 skills/code-review SKILL.md |
| 审查范围 | 仅该 commit diff；按任务书 guardrail：消费点未校验 preset / oauthExperimental 未被消费 **不构成缺陷**（Step 2+ 范围） |

---

## 0. 转写差异披露（Coordinator diff 转写 vs 仓库实况）

Coordinator 提供的 diff 转写与仓库实际存在 2 处字符级差异，**均以仓库为准**（HEAD==11c42c0，文件读取即 commit 状态）：

| # | 转写内容 | 仓库实况（tests/smoke.mjs） | 影响 |
|---|---|---|---|
| 1 | `check(... OAUTH_PRESET_VALUES[0] === 'chatgpt-fake')` | line 88：`=== 'chatgpt-codex'` | 转写笔误；仓库代码正确（与 schemas.js:142 一致） |
| 2 | `const f = routerSchema({ oauthAccounts: { odd: { preset: '' } } })` + `check(... odd.preset === '')` | line 86-87：`preset: 'foo'` + `=== 'foo'` | 转写失真；仓库实况才是真正的"未知值放行"测试（空串不是未知值），语义更强 |

以下审查全部基于仓库实况。

## 1. 五维度逐项结论

### 1.1 正确性 — 通过（无发现）

- **逻辑正确**：三个新增声明均为纯 schema 声明，逐行核对无运行时逻辑：`preset: z.string().default('')`（schemas.js:177）、`credentialFile: z.string().default('')`（:180）、`oauthExperimental: z.boolean().default(false)`（:218）、`OAUTH_PRESET_VALUES = Object.freeze(['chatgpt-codex'])`（:142）。类型选择正确（preset/credentialFile 字符串、开关布尔），与同文件既有字段模式一致（protocol:163 / strategy:207 / enabled:215）。
- **零运行时行为变更已核实**：grep 全 lib/ 与 tests/——`oauthExperimental|OAUTH_PRESET_VALUES|credentialFile` 仅出现于 lib/schemas.js（4 处声明/注释）与 tests/smoke.mjs（新增断言）；service.js/client.js/tool.js/rpc.js/index.js 零引用。声明式扩展成立。
- **边界条件**：未知 preset 值放行（z.string 无枚举约束）——设计意图（R-5 放行语义，与 MODALITY_VALUES:28-32 注释声明的先例一致）；空 credentialFile 语义已在注释中定义（回退默认路径，Step 2）。dict 条目默认值解析依赖既有机制，同文件 smoke 先例（smoke.mjs:71-74 agents dict）证明 schemastery dict entry 应用 per-entry defaults。
- **并发/资源**：不适用（无运行时逻辑）；Object.freeze 模块加载期一次性执行。

### 1.2 安全性 — 通过（无发现，1 条前瞻提醒归入 P3）

- 无硬编码密钥/凭据；新增字段不含敏感值（credentialFile 是路径字符串，非常量）。
- 声明式变更不引入注入面（OWASP 关键项扫描：无输入处理变化、无 SQL/XSS/命令面）。
- `oauthExperimental` default false 符合 §3.6 合规边界"默认关闭"（roadmap:291）——安全默认值方向正确。
- 前瞻（P3/F-04 备注）：credentialFile 为任意字符串路径，Step 2 消费时必须做路径校验（遍历/符号链接——P7、R12 F-1 先例）；本步无消费点，不构成缺陷。

### 1.3 可维护性 — 通过（2 条 P3）

- 命名与注释质量高：OAUTH_PRESET_VALUES 命名对齐 MODALITY_VALUES 先例（:34）；注释交叉引用 §3.2 E2-a / §3.6 / ADR-005 / R-5 / P5，引用章节均实际存在且内容相符（roadmap:157/287-295/480-513 已核对）。
- 注释与实际行为一致：preset 注释明示"未知值放行，消费点校验在后续步骤"（:174-177）；credentialFile 注释明示"空 = 凭据模块默认路径（Step 2 实现）"（:178-179）；oauthExperimental 注释明示"报错逻辑在后续步骤"（:216-217）。均为如实声明的分期 deferral，非 doc-behavior 矛盾。
- P3 发现：F-02（protocol 字段 doc 注释 :162 现列 openai-completions/anthropic/gemini，未含 codex-responses——Step 4/5 引入分支时须同步）；F-03（client.js 既有 `OAUTH_PRESETS` UI 快速添加模板概念与新 `preset` 字段命名近缘，Step 6 需消歧）。

### 1.4 性能 — 通过（无发现）

- Object.freeze 数组常量，模块加载期一次执行，O(1)；无热路径改动；无循环/数据结构变化。

### 1.5 测试覆盖 — 通过（1 条 P3）

新增 6 断言（smoke.mjs:80/82/83/85/87/88）逐条与 schema 代码推演一致：

| 断言 | 判别力 | 推演 |
|---|---|---|
| default oauthExperimental=false（:80） | 强 | 无字段时 undefined !== false 会 FAIL——真默认值测试 |
| preset 默认 ''（:82） | 强 | 同上机理（dict entry 默认值，先例 :71-74） |
| credentialFile 默认 ''（:83） | 强 | 同上 |
| 显式值保留（:85） | 弱（回归护栏） | schemastery 未知键透传下字段缺失也能过（Developer 自报，见 §4.2） |
| 未知 preset 'foo' 放行（:87） | 弱但语义显式 | 显式锁定 R-5 放行契约——若未来误加 z.enum 会 FAIL，具备防回归价值 |
| 常量 frozen+length+值（:88） | 强 | 与 schemas.js:142 三重核对（Object.isFrozen/length/[0]） |

覆盖面对账：commit 新增的每个 schema 元素（2 字段+1 开关+1 常量）均有≥1 条断言覆盖 ✓。基线算术：534（EV-023/EV-024 佐证的既有基线）+6=540，与自报 OKS=540 自洽。P3/F-06：自报运行数值未独立复跑（任务约束禁运行测试）。

## 2. 发现列表（P0-P3 + 位置 + 事实 + 建议）

**P0 = 0，P1 = 0，P2 = 0，P3 = 6**。无阻塞项。

| # | 级别 | 位置 | 事实 | 建议 |
|---|---|---|---|---|
| F-01 | P3（讨论/裁决记录） | lib/schemas.js:178-180 | E2-a 表格原文（roadmap:157）写 credentialFile "default `$DSH_HOME/dsh-agent-router/chatgpt-codex-auth.json`"，实现为 default `''`。**裁决：不构成实质矛盾**——roadmap E3-a（:236）把默认路径权威地放在凭据模块 constructor（"默认 DSH_HOME/dsh-agent-router/chatgpt-codex-auth.json"），两处合读时空值回退与 schema 级具体路径**对唯一消费方（preset 账号）语义等价**；且 '' 默认对非 preset 账号（gemini/自建 Client）更正确——若按 E2-a 字面给所有账号条目预填 chatgpt 凭据路径反而是语义噪音。代码注释（:178-179）已如实记录回退语义，doc-behavior 一致 | 维持现状；Step 2 审查时 MUST 核验回退落盘（建议测试：preset 账号 credentialFile='' → 解析为 $DSH_HOME/dsh-agent-router/chatgpt-codex-auth.json）；建议 evidence-log EVO-002 Step 1 条目附注此 E2-a 字面偏差与裁决，不需改 roadmap |
| F-02 | P3（前瞻） | lib/schemas.js:162-163 | roadmap:82 C-1 交付面列 "lib/schemas.js（preset/credentialFile/**protocol 枚举**）"；本 commit 未含 protocol 枚举/doc 更新（protocol doc 注释仍列三协议，无 codex-responses）。plan-tracker:57 的 Step 1 范围恰为 "schemas preset/credentialFile/oauthExperimental"，与 commit 吻合——protocol 枚举属后续步骤交付 | 在 Step 4/5（oauthBegin preset 分支 / runOauthChat codex-responses 分支）落地时同步 protocol 字段 doc 注释（追加 'codex-responses'），避免 UI 步骤时 doc 过期；Coordinator 可在 Step 4 任务书带一句 |
| F-03 | P3（前瞻） | lib/client.js:2161-2210、2451-2475 vs lib/schemas.js:142/177 | client.js 既有 `OAUTH_PRESETS`（UI 快速添加模板：id/label/draft 预填端点）与新 schema `preset` 字段（账号持久属性）是两个近缘概念，命名并存 | Step 6 UI 设计时在命名/文案上区分（如"账号预设"vs"快速添加模板"），防维护混淆；本步无动作 |
| F-04 | P3（前瞻） | lib/schemas.js:340-353 | wire 面 `catalogResult.oauthAccounts` 未暴露 preset/credentialFile——UI 预设入口（Step 6）需要 preset 时须扩展 wire 形状 | Step 6 落地时扩展；本步非缺陷（无消费点） |
| F-05 | P3（可选增强） | tests/smoke.mjs:84-87 | 6 断言中 2 条（显式值保留/未知放行）判别力弱（Developer 已自报，定位回归护栏——与 §4.2 核实一致） | 可选：Step 4 消费点实现时补 `OAUTH_PRESET_VALUES.includes(...)` 视角的断言；本步不要求 |
| F-06 | P3（流程） | .governance/evidence-log.md | EVO-002 Step 1 的 TDD 数值（Red FAILS=3 → Red-常量 ESM link error → Green FAILS=0/OKS=540/exit 0）尚无 evidence-log 条目；本审查按约束未运行测试，数值属 Developer 自报（逻辑推演与算术自洽，见 §4.1） | 落账 EVO-002 Step 1 evidence 条目时附测试原始输出（OKS/FAILS/exit code），满足 P1/P4 证据链要求 |

## 3. AI 代码专项 5 项结论

| # | 检查项 | 结论 | 事实依据 |
|---|---|---|---|
| 1 | mock 残留 | **通过** | grep 'fake' 全 tests/：新增 6 断言无任何 fake/占位值（'chatgpt-fake' 仅存在于 Coordinator 转写，仓库无此串——smoke.mjs:88 为 'chatgpt-codex'）；既有 fake* 用法（client-render.mjs:175 等）均为本 commit 之外的既有测试脚手架。'X:\\path.json'（:84）是有意的 Windows 路径测试夹具，非 mock |
| 2 | 硬编码返回值 | **通过** | 无函数/返回值；唯一常量 OAUTH_PRESET_VALUES 是设计令牌（E2-a/ADR-005 界定官方预设清单），值 'chatgpt-codex' 与 roadmap:157 一致 |
| 3 | 幻觉 API | **通过** | z.string().default()/z.boolean().default()/z.dict()/Object.freeze/Object.isFrozen 均为真实 API 且同文件/同测试既有使用（:163/:215/:220-226；smoke.mjs:34 系既有 MODALITY_VALUES 断言同款） |
| 4 | 未实现 TODO | **通过** | diff 内零 TODO/FIXME/XXX 标记；注释中"后续步骤/Step 2 实现"是 plan-tracker:57 分步计划的显式引用，非遗弃 TODO |
| 5 | 过度实现 | **通过** | 变更恰好 = plan-tracker Step 1 范围（schemas preset/credentialFile/oauthExperimental），无超前消费点/UI/协议分支；OAUTH_PRESET_VALUES 常量有设计依据（E2-a P5 泛化 + MODALITY_VALUES:34 先例 + ADR-005 影响面），非投机实现 |

## 4. Developer 自报事项核实（不采信自述，逐项对仓库）

### 4.1 TDD 三段证据 —— 部分核实，无矛盾

- **可核实部分** ✓：新增断言恰 6 条（smoke.mjs:80/82/83/85/87/88 计数）；534+6=540 算术自洽；534 基线由 evidence-log EV-023（"534 断言零回退"）与 EV-024 佐证；每条断言语义与 schemas.js 代码逐一推演通过（见 §1.5 表）；Red 阶段 3 条默认值断言必 FAIL（undefined !== false / !== ''）机理成立；"常量断言 Red 阶段 ESM link error"机理成立（import 不存在的具名导出 → SyntaxError）。
- **未验证部分**（如实标注）：实际运行输出（FAILS=3 / OKS=540 / exit 0）**未独立复跑**——本审查按任务书约束不执行测试；该数值作为自报证据采信须以 evidence-log 落账原始输出为准（F-06）。

### 4.2 "2/6 断言 red 阶段即过（schemastery 未知键透传）" —— 与事实自洽，定位正确

- 机理核验：若 schemastery 丢弃未知键，red 阶段显式值断言（:85 preset==='chatgpt-codex'）与未知放行断言（:87==='foo'）将 FAIL（undefined !== 值），FAILS 应为 5 而非自报 3——自报 FAILS=3 与透传语义内部一致。
- Developer 对判别力归属（3 默认值 + 1 常量断言承载）的分析正确且诚实（§1.5 表同结论）。透传语义本身未在仓库既有测试中直接锁定（未验证项，不影响 green 期正确性）。

### 4.3 credentialFile 默认 '' vs E2-a 表格路径 —— 裁决：非实质矛盾

详见 F-01。要点：E3-a（roadmap:236）权威承载默认路径；空值回退对 preset 账号语义等价、对非 preset 账号严格更优；代码注释与行为一致。条件：Step 2 MUST 实现并测试该回退（否则注释将变成 doc-behavior 矛盾——留待 Step 2 审查核验）。

### 4.4 "与 §3.2 E2-a / §3.6 / ADR-005 无矛盾" —— 核实成立（1 处字面偏差已裁决）

| 基准 | 要求 | 实现 | 判定 |
|---|---|---|---|
| E2-a（roadmap:157） | preset: 'chatgpt-codex'（z.string，default ''） | :177 完全一致 | ✓ |
| E2-a | credentialFile 字段加入 oauthAccountSchema | :180 ✓（default 字面偏差见 F-01，语义等价） | ✓（附裁决） |
| §3.6（roadmap:291/293） | router.oauthExperimental 新配置 default false；kill-switch 第③层 | :218 一致；层级位置（routerSchema 顶层）一致 | ✓ |
| ADR-005（roadmap:504） | 影响面 lib/schemas.js（preset/credentialFile/oauthExperimental） | 恰好三件，无多余 | ✓ |
| 先例一致性 | 自由字符串（protocol:163/type:60/strategy:207）+ 冻结常量（MODALITY_VALUES:34） | preset 自由字符串 + OAUTH_PRESET_VALUES 冻结 | ✓ |
| 前置门禁（roadmap:65） | H2 PoC 通过 → schemas(preset) | EV-028 六步全过（evidence-log:32）、plan-tracker:57 记录解锁 | ✓ |
| C4（commit 纯粹性） | 一个 commit 一个问题 | 2 文件 +33/-1，单一主题（Step 1 schema 扩展），git stat 与任务书一致 | ✓ |

## 5. 硬门槛自检

| 门槛 | 结果 |
|---|---|
| P0 阻塞数 = 0 | ✓（0） |
| 5 维度全覆盖 | ✓（§1.1-1.5 逐一有结论） |
| 每条发现标注级别 | ✓（6/6 有 P3 标签+位置+事实+建议） |
| 设计一致性检查完成 | ✓（§4.4 逐条比对 E2-a/§3.6/ADR-005/先例/前置门禁/C4） |
| AI 专项 5 项完成 | ✓（§3 逐一有结论） |
| 事实红线 | ✓（每条结论指向文件:行号；运行数值未复跑处如实标"未验证"） |

## 6. 终态结论

# APPROVED_WITH_NOTES

- **unresolved_blockers=0**
- 发现计数：**P0=0 / P1=0 / P2=0 / P3=6**
- 关闭条件判定（SKILL）：P0=0 且 P1=0 → 可合并/进入 Step 2。
- 备注（非阻塞）：F-01 的 Step 2 回退落盘义务 + F-06 的 evidence 落账义务建议由 Coordinator 分别带入 Step 2 任务书与本次落账动作；F-02 带入 Step 4/5 任务书。
- 原则违反标注：**无**（P1-P7/C1-C4 逐条过检：P3 既有配置零破坏由 :82-83 断言看护；P5 泛化由常量+注释承载；C4 纯粹性由 stat 核验；P4 测试看护由 6 断言承担——无违反条目）。
- 审查局限声明：本审查未执行任何测试/命令；测试运行数值为 Developer 自报（逻辑与算术自洽，见 §4.1），最终以 evidence-log 原始输出为准。

---
*审查者：Code Reviewer Agent（EVO-002 Step 1 · R1）· 2026-08-21 · 依据 agents/code-reviewer.md + skills/code-review/SKILL.md + evolution-roadmap-v1.md（§3.2 E2-a/§3.6/§7 ADR-005）+ .governance/project-principles.md（P-v1）*
