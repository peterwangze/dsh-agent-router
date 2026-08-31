# FIX-017 R0 Code Review 报告——multi-turn 映射契约重构

| 项 | 值 |
|---|---|
| 审查对象 | commit `6b2ada3`（base `e81ac6b`，单 commit，lib/oauth-llm.js + tests/oauth-main-model.mjs，+93/-17） |
| 仓库 | D:\AI\agent\deepseek\plugins\router（dsh-agent-router） |
| 审查者 | Code Reviewer Agent（只读审查；未修改代码、未运行测试/构建命令、未与用户交互） |
| 审查依据 | code-review SKILL（5 维度 + P0~P3 分级 + 事实依据红线）；契约判读依据审查者对 OpenAI Responses API 的知识 |
| 门控证据 | 16/16 套件 exit 0（含 oauth-main-model 47 断言）——按任务指令采信，本报告不重复执行 |
| 日期 | 2026-08-31 |

---

## 一、修复声称逐项核验

| # | 声称 | 判定 | 事实依据 |
|---|------|------|---------|
| 1 | 契约三方取证载明于实现注释；codex-cli 不可读如实标注 | ✅ 属实 | lib/oauth-llm.js:148-157（端点报错原文 + openai-ruby `beta_response_input_item` + openai_responses crate `Item` 枚举）；lib:155 明示「Rust 原生二进制不可读，如实标注」。交叉判读：三方与审查者对该 API 的知识一致（见 §二.1） |
| 2 | assistant 混合轮 flush 语义（文本累积 → 遇 tool-call 先 flush → 推顶层 function_call → 相对顺序保持） | ✅ 属实 | lib:204-225。text 累积（:214）、`flushText` 先 flush（:216）、顶层 `{type:'function_call', call_id, name, arguments}`（:217-222）、收尾 flush（:225）。顺序保持经代码走查确认（含 tool-call 在前、文本在后的倒序块场景：fc 先入 items，尾部 flush 后置 message——相对块序不乱） |
| 3 | user 分支不变；tool-result 顶层 function_call_output（原有） | ✅ 属实 | diff 中 user 分支（lib:176-202）零改动；function_call_output 推送逻辑（lib:184-193）为原有代码原样保留 |
| 4 | `RESPONSES_CONTENT_TYPES` 契约常量「实现与测试同源」（防复发） | ❌ 部分不实 | **lib:140-143 定义后全文件零引用（死常量，且未导出）**；测试用独立手抄副本 `legalContent`（tests:345），并非 import 同一常量。两份副本今日恰好逐值一致，但无机制保证未来不漂移。实际防复发由 F17-6 快照断言 + F17-2/3/4 结构断言承担（有效，但「同源」声称不成立）→ 见 P2-1 |
| 5 | 判别 F17-1~7：旧代码（a410a52）STR-6/7 必败 + STR-8 index 崩溃；GREEN 47 断言全过 | ✅ 静态成立 | RED：旧形状 function_call 在 `input[2].content[1]` → F17-1 计数 4≠5 必败；新结构下旧 STR-6/7/8 对 `input[2].content[1]` / `input[4].content` 的索引访问将遇 undefined → TypeError → exit 1，与声称一致。GREEN：断言静态计数 REG3+CAT7+STR14+ERR3+KILL2+F15-6+F16-5+F17-7 = **47**，与声称吻合；套件实际执行按已采门控证据采信（16/16 exit 0） |

---

## 二、5 审查维度逐项

### 维度 1：正确性 —— PASS（附 1 项 P1 风险预告）

- **映射矩阵与 Responses API 契约形状核验**（凭审查者对该 API 的知识判读）：
  - user message：`{role:'user', content:[{type:'input_text'|'input_image', …}]}` ✅（lib:196-201）
  - assistant message：`{role:'assistant', content:[{type:'output_text', text}]}` ✅（lib:208）——assistant 角色 input message 用 output_text content parts，正确
  - function_call：**顶层** item `{type:'function_call', call_id, name, arguments:string}` ✅（lib:217-222）——与官方 SDK（openai-ruby FunctionCall / openai-python `FunctionCall(call_id=, name=, arguments=)`）及端点报错自证（content 枚举不含 function_call）三方一致
  - function_call_output：顶层 `{type:'function_call_output', call_id, output:string}` ✅（lib:193）——`output` 为字符串：当前 API 的正确且最稳形状（新版部分场景亦接受 content parts 数组，字符串仍合法；取证未覆盖「数组形态」但不影响本实现正确性）
  - 顺序语义：调用 → 结果 → 下一条消息的相对顺序保持（function_call_output 先于同消息 user 文本，lib:191-193）✅
- **flush 边界走查**（lib:204-225）：连续 tool-call 无间隔文本（flushText 空转 no-op，两个顶层 fc 相邻）✅；单条 assistant 内 text→tool→text 交替（message / fc / message 三 item）✅；空文本块跳过（:213 truthy 守卫）✅；多工具并发同轮逐块顺序展开 ✅。**但以上边界均无判别断言**（测试只覆盖单混合轮）→ P2-2
- **与 FIX-016 协同**：同一请求体两面无冲突——`tools` 顶层（mapTools，lib:245-258，F16-1~5 回归仍在且通过）与 `input` items 顶层（本修复）互不触碰；`tools.length>0` 才注入（:376）✅
- **P1 风险预告（reasoning 回传缺口）**：见发现 P1-1——`store:false` + `include:['reasoning.encrypted_content']`（lib:377）+ function_call 的多轮工具往返，按 OpenAI Responses API 公开行为要求把模型输出的前置 reasoning item（含 encrypted_content）一并回传，否则典型 400「function_call … was provided without its required 'reasoning' item」。本实现：SSE 侧忽略 reasoning item（:276-290 只处理 message/function_call）、映射矩阵无 reasoning 通道、宿主 block 词汇（text/tool-call/tool-result/image）无 reasoning 载体——**encrypted reasoning 全链路不可回传**。认知状态：基于审查者 API 知识 + 本端点 include 参数自证产出 encrypted reasoning；fetch 桩不可验证；**需真机复验判定**。若端点强制配对 → FIX-017 后第二步仍会 400（换一种错误），用户可见目标（多轮工具往返可用）不达成
- 边界条件：null/非对象消息跳过（:173）、未知块跳过、非字符串 id/arguments 空串兜底——容错口径自洽；但空 `call_id`/空 `arguments` 是否过端点校验未取证 → P3-1

### 维度 2：安全性 —— PASS

- 无注入面：`arguments` 按字符串透传进 JSON body（:221），`toolResultText` 仅 text 拼接/JSON.stringify 兜底（:119-132）；无 SQL/命令/XSS 面。
- 无硬编码敏感数据：测试 `ACCESS-TOKEN` 为 stub 夹具（tests:89）；originator 诚实自标识 `dsh-agent-router`（:365）。
- 输入校验：逐字段 typeof 容错解析，损坏负载跳过不崩（与 wrapper/prestep 同口径，注释载明 :168）。

### 维度 3：可维护性 —— PASS（附 2 项备注）

- 注释质量高：契约取证、flush 语义、全矩阵说明与代码一致（lib:145-169），为后续维护者载明了一手证据来源。
- P2-1：`RESPONSES_CONTENT_TYPES` 死常量（定义即终态，零引用未导出）——名为「契约快照守卫」，实为文档性代码；与测试手抄副本构成隐性双源。
- P3-3：`mapMessagesToItems` 约 60 行（lib:170-229），超 skill 建议的 50 行阈值；flush 闭包已内聚，当前可接受，建议后续按 user/assistant 分支抽子函数。

### 维度 4：性能 —— PASS

- 映射 O(消息数×块数) 线性；无嵌套扫描/无 N+1。
- 图片附件逐条 `await readImagesAsDataUrls`（:198）串行——每用户消息至多一次调用，量级可接受；无循环内 I/O 合并的必要性问题。
- SSE 聚合线性（:266-313），终态即 break。

### 维度 5：测试覆盖 —— PASS（附 1 项备注）

- 核心路径：F17-1~5 两轮场景逐 item 断言（含顺序）✅；F17-7 流式回归 ✅；F16-1~5 顶层 tools 回归保留 ✅。
- 契约快照：F17-6（tests:345-355）能拦「function_call 再入 content」（type 不在枚举 → allLegal=false）及「function_call item 带 content 数组」——防御面有效；**但枚举是测试内手抄副本，非同源 import**（→ P2-1）。「枚举漂移测试会败吗」：端点新增枚举值不会致败（实现只发 input_text/input_image/output_text，仍合法——这是正确行为）；端点删除已发类型则桩测试原理上不可捕（盲区已声明，真机兜底）。
- 边界盲区：连续 tool-call / 单条内 text→tool→text 交替 / 多 tool-result 同轮 / 空 arguments 均无断言 → P2-2。
- 覆盖率口径：判别测试自建 harness 无框架统计；按任务门控 47 断言全过采信。

---

## 三、AI 专项 5 项

| # | 检查 | 判定 | 依据 |
|---|------|------|------|
| 1 | mock 残留 | ✅ 无 | lib 无 console.log / 调试桩（grep `TODO|FIXME|XXX|console.log` 零命中）；测试 fetch stub 为判别测试设计本体，非残留 |
| 2 | 硬编码 | ✅ 无 | 无密钥/token；端点 URL 经 `resolveCodexResponsesUrl` 归一（:358） |
| 3 | 幻觉 API | ⚠️ 1 项低风险 | 映射形状（function_call/function_call_output 顶层、call_id/arguments/output 字段）与审查者 API 知识一致，无幻觉。唯一存疑：契约枚举 9 值全列（lib:141-142 / tests:345）中 `input_audio`/`computer_screenshot`/`summary_text` 等中间值——所引报错原文在注释与任务记录中均为省略号截断（`'input_text', …, 'encrypted_content'`），中间值系实现者转录、无独立佐证 → P3-2（风险低：本实现只发三种核心类型） |
| 4 | 未实现 TODO | ✅ 无新增 | diff 未引入 TODO/FIXME；「聚合发射非真流式」为文件头既有声明（:33-35），非本次遗留 |
| 5 | 过度实现 | ⚠️ 1 项 | `RESPONSES_CONTENT_TYPES` 死常量属「声明了但未接线」的过度/半成品实现（P2-1）；其余 +93/-17 改动范围克制，无顺手改动 |

---

## 四、发现列表

### P1-1 reasoning item 回传缺口——多轮工具往返高概率下一跳 400（真机复验必验项）

- **位置**：lib/oauth-llm.js:377（`include: ['reasoning.encrypted_content']`）、:276-290（SSE 只解析 message/function_call，reasoning item 丢弃）、:170-229（映射矩阵无 reasoning 通道）
- **事实依据**：请求显式索取 encrypted reasoning（:377）证明端点会为推理模型产出 reasoning item；但输出侧不捕获、宿主 block 词汇无载体、输入侧无通道 → encrypted reasoning 全链路不可回传。OpenAI Responses API 在 `store:false` + 工具调用场景公开行为：后续轮须回传前置 reasoning item，否则 400（"function_call … without its required 'reasoning' item"）。
- **认知状态（如实）**：基于审查者 API 知识 + 本端点 include 自证；**本端点是否强制配对未实证**，fetch 桩不可验证。commit 盲区声明只覆盖「端点契约整体」，未点名此具体缺口。
- **建议**：列入 v0.4.0 发布门前真机复验必验清单（多轮工具往返场景）；若复验触发 → 立 FIX-018（方案空间：adapter 会话级 reasoning 缓存回放，或宿主 block 词汇扩展 reasoning 载体——后者超出本插件边界，需另立任务）。

### P2-1 `RESPONSES_CONTENT_TYPES` 死常量——「实现与测试同源」声称不实

- **位置**：lib/oauth-llm.js:140-143（定义，全文件零引用、未导出）；tests/oauth-main-model.mjs:345（手抄副本 `legalContent`）
- **事实依据**：grep 证实常量仅 1 次出现（定义处）；测试副本独立手写。声称「实现与测试同源（防同类层级错误复发）」与代码事实不符——今日两副本逐值一致属人工对齐，无机制约束。
- **建议**（二选一）：① 导出常量、测试 import 使用（真正同源，一处修改两处生效）；② 删除死常量，修正注释与提交描述为「测试快照断言」。实际防复发由 F17-2/3/4/6 承担，故不阻塞合并。

### P2-2 flush 边界无判别断言

- **位置**：tests/oauth-main-model.mjs:317-359（F17 场景仅单混合轮）；对应实现 lib:204-225
- **事实依据**：连续 tool-call 无间隔文本、单条 assistant 内 text→tool→text 交替（三 item 展开）、多 tool-result 同轮、空 arguments 四类边界仅经代码走查验证正确，无 RED 判别力——未来重构破坏 flush 语义时测试不拦。
- **建议**：补 1 个多边界场景断言块（连续 fc + 交替 + 多 result），约 +20 行。

### P3-1 空 `call_id`/空 `arguments` 兜底可能触发端点 400（未取证）

- **位置**：lib/oauth-llm.js:186（toolCallId 空串兜底）、:219-221（id/name/arguments 空串兜底）
- **事实依据**：Responses API 的 call_id 为必填非空、arguments 需为 JSON 字符串；空串是否过端点校验无取证，桩不可验。宿主契约下 id/name 恒存在、arguments 通常 '{}'，触发概率低；与「容忍损坏负载」口径之间留有缝隙——损坏负载会被容忍着发给端点然后换一种 400。
- **建议**：真机复验顺带观察；可选加固：id 缺失跳过该块（容错在本地收敛而非推给端点）。

### P3-2 契约枚举中间值转录不可复核

- **位置**：lib/oauth-llm.js:141-142；tests/oauth-main-model.mjs:345
- **事实依据**：所引一手报错原文在注释与任务记录中均为省略号截断形式；9 值全枚举的中间项（`input_audio`/`computer_screenshot`/`summary_text` 等）依赖实现者转录，无第二来源。风险低（本实现仅发 input_text/input_image/output_text，在任何合理枚举版本内均合法）。
- **建议**：注释标注「中间值系转录，未经独立复核」，避免后续被当作一手全文引用。

### P3-3 `mapMessagesToItems` 函数长度超建议阈值

- **位置**：lib/oauth-llm.js:170-229（约 60 行）
- **事实依据**：超 code-review skill 单函数 50 行建议线；flush 闭包内聚、逻辑单一，当前可读性尚可。
- **建议**：后续维护触碰该函数时顺手按 user/assistant 分支抽子函数，不单独立项。

### 范围外备注（不计发现、不计计数）

- aggregateCodexSse 端点不回 call_id 时合成 `call-${N}`（lib:286）：该合成 id 回传 function_call_output 时端点无法配对——pre-existing（非 6b2ada3 引入），记录备查。
- SSE 流侧无需同步改动的判定（审查重点 #5）：输出侧 function_call 本就是顶层 item，:276-290 已按输出契约解析，STR-9~13 不受影响、F17-7 复验 finish stop ✅；唯一关联点 = reasoning item 输出事件被忽略，已并入 P1-1。

---

## 五、结论

- **结论：APPROVED_WITH_NOTES**
- **unresolved_blockers = 0**
- 计数：**P0 = 0，P1 = 1，P2 = 2，P3 = 3**
- 判定说明：FIX-017 的直接目标（function_call 移出 message content、顶层 item 全矩阵）实现正确、判别测试 RED/GREEN 闭环成立、与 FIX-016 协同无冲突，可合并。P1-1 为基于审查者 API 知识的**高概率下一跳风险预告**（本端点未实证、fetch 桩不可验），非本 commit 的既有缺陷——按「P0=0 且 P1>0（有遗留计划）」规则有条件合并：P1-1 列为 v0.4.0 发布门前真机复验必验项，复验触发即立 FIX-018；P2 两项建议下一轮收编（常量同源化 + flush 边界断言）。
- 修复声称偏差记录：声称 #4「同源」与代码事实不符（P2-1），不影响核心正确性；其余 4 项声称逐项核验属实。
