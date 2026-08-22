# Review Record (machine-written by review-record)

- task: FIX-005
- round: R1
- date: 2026-08-23
- reviewer: Code Reviewer
- report: .governance/review-FIX-005-R1.md
- wiring: pending

**审查结论**: **APPROVED_WITH_NOTES**

unresolved_blockers=0

---

# FIX-005-R1 完整审查报告（原文恢复）

> 出处：review-record CLI --report 覆盖预防——备份恢复（2026-08-23）。

# Review — FIX-005-R1（条件化引导独立审查，round 1）

- **Round**: R1（首轮；无前轮引用）
- **审查对象**: commit `a484469240bccaf9f62948e5aaa90969f2c8662d`（5 文件，+103/-14）
- **审查者**: Code Reviewer Agent（software-project-governance）
- **结论**: **APPROVED_WITH_NOTES**（unresolved_blockers = 0）

## 输入清单（全部通读）

| 输入 | 位置 | 状态 |
|---|---|---|
| 提交信息 | `.governance/diff-FIX-005-a484469.patch` L1-5 | 已读 |
| 完整 diff 存档 | `.governance/diff-FIX-005-a484469.patch`（195 行全量） | 已读 |
| prestep.js 全文 | `lib/prestep.js`（246 行；变更核心 installPreStep L181-246） | 已读 |
| wrapper.js 能力判定 | `lib/wrapper.js` L23-30（WRAP_SUFFIX）、L55-60（marker 文本）、L211-227（requestHasModality）、L229-256（modalityCache + sourceAcceptsModality）、L258-366（createWrapAdapter stream L334-363） | 已读 |
| tool.js route_agent 描述 | `lib/tool.js` L57-71（变更点 L68） | 已读 |
| service.js promptText 目录段 | `lib/service.js` L2893-2910（变更点 L2908） | 已读 |
| smoke 死规则断言 | `tests/smoke.mjs` L967-972（L971：`!includes('attachmentIds')`） | 已读 |
| smoke 7.7 pre-step 块 | `tests/smoke.mjs` L2303-2430（③ 变更点 L2375-2381） | 已读 |
| routing-paths [G] 段 | `tests/routing-paths.mjs` L937-1012（G1-G6）+ service 构造 L106-176 | 已读 |

**测试执行事实**（Coordinator 提供，本审查无执行权限未复跑）：routing-paths 108/108（102+6 G 段）/ smoke 0 FAIL（856 基线，含 ③ 断言更新）/ stats 99 / metrics 全过 / parity 14 / oauth-credentials 80；TDD 红相 104/108（G1/G3/G5/G6 旧代码必败，G2/G4 绿）。

## 逐维度结论

### 维度 1：正确性 —— **PASS**

四条行为路径逐条推演（新代码）：

| 路径 | 判定 | 结果 | 证据 |
|---|---|---|---|
| 非 wrapper + 原生多模态 | accepts=true | 不改写 + **不注入 reminder**（单消息直传） | G1、smoke ③ |
| 非 wrapper + 纯文本/探测失败 | accepts=false | 改写（标记文本，无裸图块）+ **注入保持** | G2、smoke ②（`escape-provider` 纯文本 → length 2 + 改写） |
| wrapper 分支 + 原生多模态 | probeProvider 剥离后 accepts=true | 不改写 + **不注入** | G3（`deepseek-official-router` → 剥 → accepts=true） |
| wrapper 分支 + 纯文本/探测失败 | accepts=false | 不改写（wrapper stream 模型输入层改写，防双改写）+ **注入保持** | G4、smoke ①（`escape-provider-router` → 剥 → accepts=false → length 2） |

边界与失败路径：
- provider 剥离守卫 `provider.length > WRAP_SUFFIX.length`（prestep.js L209-211）：provider 恰等于 `-router`（"router"）→ 不剥离，`registration('router')` 大概率未注册 → accepts=false → 注入 + wrapper stream 改写 → C-3 安全方向。provider 为 `x-router` → 剥为 `x`；非 `-router` 结尾 → onWrapperRoute=false 不走剥离。无剥离副作用。
- 探测失败全面内联吸收：`original()` 内 try（prestep.js L212-219，含 `ctx.get('llm')`）；`sourceAcceptsModality` 内 try（wrapper.js L245-253）→ accepts 恒为 boolean，不会抛穿外层 fail-safe（L237-243）。**无新增击穿面**：修复前 wrapper 分支仅 sessionProvider/Model 读取可抛，修复后新增调用面全部被内部吸收。
- reducer 映射（L227-233，index=-1 透传）与 reject/纯文本门控（L184/L192/L194）未变，smoke ④/⑤/⑧ 保持绿。

### 维度 2：安全性 —— **PASS**

- 变更仅为静态字符串（tool.js L68、service.js L2908）与条件化注入逻辑：无外部输入插值、无模板注入面。
- 无密钥/令牌；无数据删除/覆盖路径（P7 无涉）。
- `probeProvider` 仅作为 `llm.registration()` 查表 key，无命令/求值面。

### 维度 3：可维护性 —— **PASS（含非阻塞建议）**

- 命名（probeProvider / accepts / onWrapperRoute）表意清晰；注释完整且与实现一致（含与 wrapper L343 对齐说明）。
- 发现 P2-1：installPreStep handler 现 63 行（L182-244，原 ~55 + 8），超过 50 行建议值。建议后续提取 `probeImageAcceptance()` 助手，非阻塞。
- 无重复实现：能力判定仍单点复用 `sourceAcceptsModality`（P5 符合），prestep 仅新增 provider 剥离对齐，无复制逻辑。

### 维度 4：性能 —— **PASS**

- 修复前 wrapper 分支图片轮：prestep 不探测 + wrapper stream 探测（1 次 resolveModel/60s）。
- 修复后：prestep 先探测（同 key 写入缓存）→ wrapper stream 探测为缓存命中 → **净 resolveModel 调用数不变**（1 次/60s 窗口）。"modal 缓存命中共享，无重复开销"声明显现成立。
- 纯文本轮门控前置（L192 requestHasModality）不变，零额外开销；缓存按 provider\0model\0modality 键隔离，无跨会话污染（smoke 7.7 L2316-2317 已用独立 provider 名规避，routing-paths A-F 段无同 key 探测——经 grep 核验）。

### 维度 5：测试覆盖 —— **PASS（含非阻塞建议）**

- G1-G6 判别性逐条验证（见疑区 (f)），G1/G3/G5/G6 旧代码必败，G2/G4 旧代码即绿（与 Coordinator 红相 104/108 一致）。
- smoke ③ 断言更新判别（见疑区 (d)），无弱化。
- 发现 P2-2：能力探测**失败回落**路径无直接判别用例（registration 缺失/抛错 → original() undefined → accepts=false → 注入保持）——该路径是 C-3 安全方向，建议补 [G7]（llm 缺失或 resolveModel throw），非阻塞。

## 疑区 (a)-(g) 逐项结论

- **(a) accepts 语义双路径一致性 —— 一致**。prestep：probeProvider（onWrapperRoute 时 = 原 provider）→ `registration(probeProvider).adapter` → `resolveModel(probeProvider, model)` → key=`probeProvider\0model\0image`。wrapper stream（wrapper.js L343）：provider = 原 provider（twin 注册基名，L260）→ `registration(provider).adapter` → `resolveModel(provider, model)` → key=`provider\0model\0image`。两路径 provider 字符串逐字符同、resolveModel 首参同（均为 provider 本体而非 wrapRoute）、model 同参（会话模型 = 请求模型，dsh-llm buildRequest 同源）、modality 同（'image'）→ **同 key 同结论，缓存共享**。唯一理论分歧面：sessionModel(agent) 与 stream options.model 若为不同字符串（如别名解析），则双路径各自探测——但 wrapper resolveModel 恒 `id: model` 透传（L310），实操同串；记为 P3 讨论，非隐患。
- **(b) provider 剥离边界 —— 安全**。长度守卫防剥空；恰为 `-router` 时不剥离（注册失败 → false → 安全回落）；普通 route 条件不成立零剥离。无副作用。
- **(c) reminder 条件化的 C-3 保护 —— 成立，无击穿**。accepts=false/探测失败 → 注入保持（G2/G4 + smoke ①② + ④ 负向不变）；wrapper 分支探测异常被内联吸收 → 注入正确（与旧行为一致，未击穿）；非 wrapper 分支失败 → 改写（宁可改写不可漏图，§5.2.3 语义未变）。
- **(d) smoke ③ 判别 —— 正确且只强不弱**。旧代码：无条件注入 → `length===2` 断言失败 + 新增 no-reminder 断言（`every(!(m.source?.kind==='plugin'))`）失败 → 旧代码必败判别成立；raw image 保留断言未删；新增断言比原 length 语义更严（显式排除 plugin 消息）。
- **(e) 中性句语义 —— 成立**。①tool.js L61 既有"只有当任务明确匹配某个专业 agent 的能力时才调用"指导未删（G5 双断言守护）；②service.js L2908 用"附件 id"避开字面 `attachmentIds`（L971 死规则 `!includes('attachmentIds')` 核验通过——全目录段无字面出现）；③措辞为图片限定条件句，未对 audio/video 作声称（占位保留）；④纯文本主模型：条件"已由主模型原生查看时"不满足 → 不抑制，reminder（最近消息级指令）+ 通道②标记（wrapper.js L59 marker 文本含"请直接调用 route_agent 工具…includeImages"）双承载 → 引导仍成立。会话级潜在"仅…才路由"列举的措辞歧义记 P3-1 讨论。
- **(f) G 段断言抽查 6/6 逐行验证**。G1（deepseek-official 非 wrapper → accepts true → !hasReminder && hasImageBlock，旧代码必败 ✓）；G2（text-only-prov → false → hasReminder && !hasImageBlock，旧代码即绿 ✓ 现状保持判别）；G3（deepseek-official-router → probeProvider 剥离 → 缓存/探测 accepts=true → !hasReminder；若剥离逻辑缺失则 key 变为 'text' 探测 → 注入 → 必败，**判别剥离本身** ✓）；G4（text-only-prov-router → hasReminder，不改写 ✓）；G5（toolSrc includes NEUTRAL_SUBSTR + '只有当任务明确匹配某个专业 agent 的能力时'——L61 实存 ✓）；G6（真实 service.promptText() includes NEUTRAL_SUBSTR——L2908 实存 ✓）。
- **(g) 范围纪律 —— 通过**。patch 全量核对恰 5 文件（lib/prestep.js、lib/service.js、lib/tool.js、tests/routing-paths.mjs、tests/smoke.mjs）；stats/oauth/attachments/client 域零触碰，无顺带修改。

## AI 代码专项 5 项

| 检查项 | 结论 | 依据 |
|---|---|---|
| mock 残留 | 通过 | 变更产品代码无 mock/stub；测试 stubs（mkStubLlm、escapeAdapter）位于测试文件，属正当测试替身 |
| 硬编码返回值 | 通过 | 新逻辑为真实判定（探测 → 条件注入），无硬编码返回 |
| 幻觉 API 调用 | 通过 | 仅调用既有导出 sourceAcceptsModality / registration / resolveModel（均为现存接口） |
| 未实现 TODO | 通过 | 变更行无 TODO/FIXME/占位 |
| 过度实现 | 通过 | probe 提前共用为最小必要改动（解决 G3 语义所需），未引入未用抽象/分支 |

## 发现清单

| # | 级别 | 位置 | 描述 | 建议 | 处理方式 |
|---|---|---|---|---|---|
| F-1 | P2 | lib/prestep.js L182-244 | handler 63 行超 50 行建议值（+8 行） | 提取 `probeImageAcceptance()` 助手 | 遗留跟踪（不阻塞） |
| F-2 | P2 | tests/routing-paths.mjs [G] 段 | 探测失败回落路径（registration 缺失/抛错 → accepts=false → 注入保持）无直接判别用例 | 补 [G7]（llm 缺失或 resolveModel throw 下 C-3 保持） | 遗留跟踪（不阻塞） |
| F-3 | P3 | lib/tool.js L68 / service.js L2908 | "仅…才路由"列举在纯文本主模型 + 附带普通图片任务场景可能轻微抑制路由倾向；reminder 与通道②标记双承载兜底，风险极低 | 可选补半句"若主模型无法原生看图，按本轮 reminder 指令路由" | 讨论（不要求修改） |
| F-4 | P3 | lib/prestep.js L209 | provider 恰等于 `-router`（'router'）的边界未剥且无测试覆盖；行为安全（注册失败 → false → 注入） | 可选补边界测试 | 讨论 |
| F-5 | P3 | lib/prestep.js L220 → wrapper L245-253 | 探测失败为静默回落（无诊断事件）——沿袭 §5.2.3 既有设计，非本变更新引入，失败方向安全 | 后续按 P8 补 debug 级诊断日志 | 讨论 |
| F-6 | P3 | lib/wrapper.js L343 vs prestep L220 | 探测 model 字符串源：prestep 用 sessionModel(agent)，wrapper 用 options.model——实操同串（wrapper L310 id 透传），理论分歧面 | 保持现状，注释已明 | 讨论 |

**P0 = 0，P1 = 0，P2 = 2（遗留跟踪），P3 = 4（讨论）**。

## 设计一致性（用户提案 + 项目原则逐条）

- **用户提案对齐（2026-08-23 多模态误调观察）**：本次修复将"主模型原生多模态仍被引导调 route_agent → 429 配额误调"的根因（prestep 无条件注入 reminder）条件化——accepts=true 零引导（prestep 零注入 + wrapper 直传 + 中性句"无需调用"三面一致）。
- **P3（纯文本主模型零变化）—— 验证通过**：纯文本 4 路径（非 wrapper ②/G2、wrapper ①/G4）reminder 注入与改写语义与修复前完全一致；新增探测失败方向（accepts=false）复现旧结果；唯一新增面为一次 resolveModel 探测（结果被后续 wrapper stream 缓存复用，无行为差）。
- **P5（判定复用泛化）—— 验证通过**：能力判定与改写语义仍单点复用 wrapper.js 导出（sourceAcceptsModality / minimalImageRewrite），无复制实现；判定 key 对齐实现缓存共享。
- **P1/P2/P4/P6/P7/P9**：分析基于事实与逐行推演 ✓；实现无遗漏（4 路径 + 3 失败面全查）✓；测试看护 = 6 判别 + smoke 同步（零回退，红相 4 FAIL → 绿相全通过）✓；无冗余修改（5 文件单一问题承载）✓；无数据路径 ✓；能力判定与 wrapper 同源自证（P9）✓。
- **P8（可观测性）**：本变更未新增沉默面（既有 §5.2.3 静默回落语义维持）；探索性建议记录 F-5（P3 讨论），不判定为违反。

## 硬门槛自检

| 门槛项 | 阈值 | 结果 |
|---|---|---|
| P0 阻塞问题数 | = 0 | **0** ✓ |
| 5 维度全覆盖 | = 100% | 正确性/安全性/可维护性/性能/测试覆盖逐项有结论 ✓ |
| 每条发现标注级别 | = 100% | F-1~F-6 均标 P2/P3 ✓ |
| 设计一致性检查 | 完成 | 用户提案 + P3/P5/P8 + 编程要求逐条对照 ✓ |
| AI 专项 5 项 | 全部完成 | 5 项逐一有结论 ✓ |

## 最终裁决

**APPROVED_WITH_NOTES**（有效终态；unresolved_blockers = 0；P0=0 且 P1=0；P2 两条遗留跟踪项不阻塞合并；P3 四条讨论项供 Coordinator/Developer 参考，无强制修改）。5 文件 diff 与本任务目标（条件化引导）严格匹配；疑区 (a)-(g) 全部落定，无未解决阻塞项。

