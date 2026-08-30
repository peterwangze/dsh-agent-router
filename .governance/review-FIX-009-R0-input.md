# Code Review — FIX-009（R0）

## 报告头

- **任务**: FIX-009 — image-solo 空 content 注入修复（多模态视觉链路 P0：单独发图 → GLM 端点 400/1213「未正常接收到prompt参数」）
- **审查轮次**: R0（input 阶段——代码审查报告；供 Coordinator 复审链落盘）
- **审查对象**: commit `8877365`（`88773654f832fab64296ade6befcbfc61940bd1a`，未 push）— 2 文件 +154/-1：`lib/wrapper.js`（+16/-1）、`tests/fix-009-image-solo.mjs`（新增 135 行）
- **RCA 依据**:
  - triage 入账（change-triage/FIX-009.json，用户报障原文 400/1213 + 227s/0token 实录）
  - commit message RCA 结论链：wrapper（glm-router）深改写（rewriteContentDeep + rewrite:()=>null）把仅含图片块的 user 消息改写为 content:[] → pi-ai textOnlyContext 序列化 `{role:'user',content:''}` → GLM 400/1213
  - 227s 证伪：ABORTED aborted-user + 零 retry 事件（非重试链）；DEFAULT_RETRYABLE_CODES 不含 INVALID_REQUEST
  - vision 路径（service.js runChat）无需修改：composeTask 空 task 抛错守卫（service.js:1183）+ content 恒含 text part（service.js:1295-1297）
- **审查方法**: 逐行读 diff + 全仓调用点核验（grep）+ 周边代码上下文核验（wrapper.js 改写器/标记器、service.js runChat、dsh-llm 协议、smoke 先例、triage/evidence/decision 治理记录）。未执行任何测试/命令（审查约束：不执行测试——门控申报「十套件零回退 + 9/9 绿」为 Developer 申报，标记**未验证**）。

---

## 一、5 维度结论

### 维度 1：正确性 — 通过（逐条件核验）

1. **注入条件精确性**（wrapper.js:372-374，逐条件核验）：
   - `result.changed === true && result.content.length === 0` → 注入占位 text part
   - `result.changed === true && result.content.length > 0` → 原样保留（零注入）——image+text 场景 out=[text 块]（rewriteContentDeep 只匹配 `block.type === modality` 的块，wrapper.js:199；text 块无 handler → 保留，216）
   - `result.changed === false` → 返回原 message（零注入）
   - **空 content 唯一可达路径推演**：changed=true 且 content 为空的唯一路径 = 消息所有块均被 handler 改写且 rewrite 返回 null（image-solo：唯一块是 image → 移除 → out=[]）。tool-result 块容器保留（wrapper.js:206-215 push 块本身）→ 改写后 message content 恒非空；嵌套 tool-result 内容清空时外层块仍在，length>0 不触发注入——不误伤。✓
   - **多消息会话边界**：rewritten 逐条独立处理（wrapper.js:363-375）——任一历史/当前消息改写后为空均注入。修复前历史轮 image-solo 同样产生空 content（同样 400），本次修复一并覆盖（不限于当前轮）。✓
   - **原始空 content**（changed=false，非改写导致）：不注入，维持原行为——修复范围精确限定「改写导致」的空，范围纪律正确。✓
2. **下游序列化推演**：注入 `{type:'text', text}` 为 dsh-llm message 协议标准 text part（runChat service.js:1295 同型构造；测试 B 组同型）→ pi-ai textOnlyContext 序列化为非空 content 字符串 → 端点合法请求。序列化端代码在宿主（pi-ai，不在本仓）——**标注**：此项基于 RCA 实证（空 content → 400/1213）+ 协议推演，非本仓代码可复查；text part → 非空 content 为 dsh-llm 消息协议既定行为（测试桩 adapter 按 options.messages 直接消费 content 数组验证）。
3. **并发安全**：无共享状态变更（纯函数式消息映射，常量注入）。✓
4. **资源管理**：无资源变更。✓

### 维度 2：安全性 — 通过

1. **占位文案行为安全**：`'[图片已上传，请按系统提示操作]'` 为命令式行为指令——与 collectMarkers 生成的 system 标记（行为指令，通道①）同形态同语义方向（wrapper.js:408 marker 为「识别 vs 图生图」分流指令；占位文本指示模型按系统提示操作——协同一致）。**不含图片内容描述** → 模型无法复述图片内容（T-1 防复述污染防护申报核验通过：§5.3 记忆段设计明确「描述进 user 层会被大脑当用户说的话复述」——占位文本是行为指令而非事实描述，即使被模型引用也不产生事实污染）。
2. **提示注入面**：占位文本为固定导出常量、非外部输入——无注入向量。✓
3. **敏感数据**：无硬编码密钥/token。✓
4. **i18n**：中文文案进入英文会话——文案是模型输入侧指令（非用户直接可见输出文本），主流模型多语言指令理解可靠；风险低。见 P3-1。

### 维度 3：可维护性 — 通过

1. **命名/注释**：`IMAGE_SOLO_PLACEHOLDER` 语义清晰；JSDoc 完整（根因链、GLM 400/1213 实证、§5.3 通道①形态、T-1 防护理由、导出动机）；改写点行内注释含 RCA 证据 + 设计理由。高质量。✓
2. **职责边界/架构合理性**（重点核验项 6）：修复落在 wrapper stream 改写点（消息层出口）——这是「改写产生空 content」的唯一出口，注入与改写同层就地修正，不扩散到适配器层。wrapper 的既有职责即为「改写模型输入使其适配下游能力」（v3 N-4/R-2 能力分级改写）——保证改写结果协议合法（非空）是该职责的自然组成部分。**替代方案不选的合理性**：①pi-ai 序列化层修——宿主共享适配器，插件不可控、越权；②rewriteContentDeep 块级层注入（改写出 null 时替换）——污染「rewrite 返回 null=整块移除」的块级语义，改写器不应知道消息级协议约束；③当前消息映射层注入——最贴协议边界，最小侵入。方案选择合理。✓
3. **冗余检查**：3 行注入逻辑 + 1 常量，无冗余。✓

### 维度 4：性能 — 通过

- 注入为 O(1) 常量构造，在已有 map 循环内，无新增遍历。纯同步数组构造无吞错（P8 申报核验：rewriteContentDeep wrapper.js:191-218 无 try/catch，改写异常按原路径自然上抛——吞错路径不存在）。✓

### 维度 5：测试覆盖 — 通过（判别性核验见重点核验项 4）

- A1-A4：image-solo 完整路径（完成 + 非空 + text part + 精确占位）——核心路径覆盖 ✓
- B1/B2：image+text 控制组（保留文本、无裸图块）——回归防护 ✓
- C1/C2/C3：4xx 快速失败守卫（真实性命中见重点核验项 4）
- 边界缺口（非阻塞，P3-2 关联）：「历史轮 image-solo + 当前轮 image+text」混合会话无显式断言（实现逻辑已覆盖，A2 遍历全部消息；可选增强）

---

## 二、AI 专项 5 项

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | mock/桩真实性 | 通过。makeTextAdapter 复刻 UNSUPPORTED_CONTENT 语义（见图片块即拒），行为与真实文本适配器一致；被测对象（wrapper/LlmRuntime/installAdmissionWrapper）为真实实例，非 mock。C 组 failingLlm 桩以 INVALID_REQUEST 错误模拟端点 400。 |
| 2 | 硬编码 | 通过。占位文案为导出常量（wrapper.js:40）非散落硬编码；测试断言引用 import 常量（fix-009-image-solo.mjs:87）非字面量。 |
| 3 | 幻觉 API | 通过。测试 import 全部真实存在：LlmRuntime/contentHasImage（@deepseek-ai/dsh-llm）、createUserMessage（dsh-llm/message）、installAdmissionWrapper（wrapper.js:439）、WRAP_SUFFIX/IMAGE_SOLO_PLACEHOLDER（wrapper.js:28/40）。 |
| 4 | TODO 残留 | 通过。diff 无 TODO/FIXME 残留。 |
| 5 | 过度实现 | 通过。注入 3 行 + 常量最小实现；测试 9 断言聚焦判别无冗余。 |

---

## 三、重点核验逐项

1. **修复正确性**：见维度 1——注入条件逐分支核验通过；空 content 唯一可达路径推演闭合（tool-result 容器保留不误伤）；多消息会话全覆盖；下游序列化合法（协议推演 + RCA 实证支撑）。
2. **占位文案安全性**：见维度 2——行为指令形态与 marker 协同；不含图片内容防 T-1 复述污染；无注入面；i18n 低风险（P3-1）。
3. **P5 单点核验**：grep 全仓 `rewriteContentDeep`——wrapper.js:191（定义/导出）、207（递归）、**365（唯一 message 级调用，即本次修改点）**；tests/smoke.mjs:2457-2458（单元测试直接调用，非产品调用点）；docs 为文档引用。**确认仅一处 message 级调用**。✓
4. **判别测试质量**：
   - **A2 真判别**：旧实现（无注入）下 solo 消息改写后 content=[] → `emptyUserMessage=true` → A2 必败（红）✓
   - **A3 真判别**：旧实现下无任何 text part → `hasNonEmptyText=false` → A3 必败（红）✓
   - **A4 精确断言脆性评估**：断言 `block.text === IMAGE_SOLO_PLACEHOLDER`（fix-009-image-solo.mjs:87）引用 **import 常量而非字面量**——占位文案调整自动跟随，不脆；「精确断言」指向「注入的就是声明的占位常量」而非「特定字符串」。与申报意图一致。剩余耦合风险仅在注入形态演变为动态文本时（见 P3-3），当前合理。
   - **B 控制组**：B1/B2 验证改写保留文本 + 移除裸图块——旧实现即绿（基线验证，有效回归锚点）✓
   - **C 组关联性**：C1/C2/C3 验证 runChat 对 400/INVALID_REQUEST 单次调用、不重试、错误带 provider/model 诊断——**真实性核验**：runChat stream 抛错直接 throw（service.js:1315-1317，无重试循环）；错误包装含 provider/model（service.js:1316 模板）→ C3 regex 可匹配。与本次修复关联：修复目标为消除 400/1213 根因；若未覆盖路径/端点行为变化仍触发 400，C 组保证快速失败 + 可观测（P8），不静默挂起（227s 证伪同型防护）。属合理辅助守卫（runChat 既有行为，非本次引入）。✓
5. **范围纪律**：commit 8877365 仅 2 文件 +154/-1，与任务书申报一致，commit 内无清单外改动。**但发现 triage 入账文件清单不一致**（见 P2-1）。
6. **设计一致性**：见维度 3——wrapper 职责边界契合；替代方案不选合理性成立。
7. **consultant 项**：见第四节。

---

## 四、发现清单

### P0（阻塞）：0 项

### P1（关键）：0 项

### P2（建议）：2 项

- **P2-1（治理记录一致性）**：triage 入账文件清单（change-triage/FIX-009.json `files`: lib/service.js, lib/tool.js, lib/prestep.js, tests/smoke.mjs）与实际修复文件（lib/wrapper.js + tests/fix-009-image-solo.mjs）**不一致**；evidence-log/decision-log 均无范围调整/扩界批准记录。代码层面无问题（RCA 实证收敛到 wrapper 深改写层、triage 预判面 service/tool/prestep 无需改动是合理改判——预判 vs 实证差异），但任务书称「2 文件与扩界批准一致」未找到落盘证据。**建议**：Coordinator 更新 triage 记录 files 为实际修复面或补一条范围调整证据，保持治理记录与 commit 一致。
- **P2-2（测试 hygiene）**：tests/fix-009-image-solo.mjs:40 使用固定 DSH_HOME 相对目录 `.tmp-fix009-home`（CWD=仓库根），无清理逻辑；.gitignore 仅覆盖 `.tmp-cli-smoke-*/` 与 `.test-home/`，**未覆盖 `.tmp-fix009-home`**——运行后残留未跟踪目录（当前工作树无残留，说明此前被手动清理）。**建议**：改用 mkdtemp（与 smoke.mjs:37 同风格）或补 .gitignore 条目。

### P3（讨论）：3 项

- **P3-1（i18n）**：中文占位文案进入英文会话。文案为模型输入侧行为指令（非用户可见），现代模型多语言指令理解可靠；低风险。若未来出现英文模型理解偏移实证，可评估本地化（按会话语言变体）——当前不要求修改。
- **P3-2（历史轮语义噪音）**：历史轮 image-solo 消息同样注入「请按系统提示操作」，但 marker 仅覆盖当前轮最后一条 user 消息（wrapper.js:91-101）——历史轮占位无对应系统提示目标，模型可能对指令产生轻微困惑。属修复空 content 的必要代价（历史轮图片块本来就被移除，占位仅保协议合法），当前统一形态简单可预测。可选增强：历史轮用中性占位（如「（图片）」）区分指令与保底——需权衡复杂度，不要求。
- **P3-3（A4 未来演进耦合）**：若注入形态从精确占位演变为动态文本（如带序号/时间戳），A4 需同步更新。当前断言引用常量，文案调整自动跟随，脆性可控；与「精确占位断言」声明意图一致，接受。

---

## 五、consultant 项（供 Coordinator 裁决，非 finding）

**判别测试 tests/fix-009-image-solo.mjs 是否并入 smoke 门控（948→957）**

**建议：并入（门控清单显式加入该文件，保留独立文件形态）**，理由：

1. **P0 回归点应进 CI 单入口**：400/1213 为用户报障实证的 P0 链路断裂，回归防护不应依赖「独立文件被记得运行」的人力约定——门控清单显式列入即自动覆盖；
2. **归属先例一致**：smoke.mjs 已含 rewriteContentDeep 同族单元断言（smoke.mjs:2457-2458），wrapper 改写测试既有归属即为 smoke 主套件；fix-009 判别测试为同族集成级补充；
3. **成本近零**：纯桩无网络依赖，运行毫秒级；依赖相同（@deepseek-ai/dsh-llm + cordis）；断言风格与 smoke 同型（check 函数）；
4. **保留独立文件价值**：TDD 红绿迭代（修复前跑红、修复后跑绿）与判别测试隔离性——独立进程运行不受 smoke 环境状态影响。

**并入注意点**：①断言计数并入时同步更新门控记录（948→957 或按 smoke 计数方式）；②P2-2 的 DSH_HOME 固定目录在独立进程运行下无冲突，但建议统一 mkdtemp 风格防残留/并发；③若只「门控命令追加文件」而不改 smoke.mjs 本体，则零侵入、零回归风险——推荐此形态。

**独立运行 vs 并入取舍结论**：两者不互斥——独立文件保留（TDD 便利 + 隔离性），门控命令显式追加该文件（CI 覆盖）。不推荐把断言内联进 smoke.mjs（破坏判别测试独立红绿验证能力、增大 smoke 改动面）。

---

## 六、结论

**APPROVED_WITH_NOTES**（`unresolved_blockers=0`）

- P0 = 0，P1 = 0，P2 = 2（P2-1 治理记录一致性、P2-2 测试 hygiene），P3 = 3
- 修复正确性、安全性、可维护性、性能、测试覆盖 5 维度全部通过；AI 专项 5 项全部通过
- P5 单点核验确认（rewriteContentDeep 仅 wrapper.js:365 一处 message 级调用）；注入条件逐分支核验闭合；A2/A3 真判别性确认（旧实现必败）；A4 精确且不脆（常量引用）；C 组 4xx 守卫真实性确认（runChat service.js:1315-1317 单次上抛 + 1316 诊断包装）
- **未验证项（如实标注）**：门控申报「十套件零回退 + fix-009 判别 9/9 绿 + 真实 hooks 全 PASS」——审查约束禁止执行测试，此项以 Developer 申报记录为准，待 Coordinator 门控复核；pi-ai textOnlyContext 序列化端代码在宿主（非本仓），其行为依赖 RCA 实证 + 协议推演
- **notes（不阻塞合并）**：P2-1/P2-2 供 Coordinator 处理；P3-1/P3-2/P3-3 供 Developer 知悉讨论

---

*报告生成：R0 审查（commit 8877365）· 审查者：Code Reviewer Agent · 依据 code-review SKILL（P0-P3 分级 + 事实红线）*
