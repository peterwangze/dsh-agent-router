# Review — FIX-013 R0（ChatGPT codex-responses 分支移除 max_output_tokens 修复）

- **Round**: R0
- **Task**: FIX-013 — router/test 路径强制 maxTokens:16 → codex-responses 分支发送 `max_output_tokens` → ChatGPT backend-api 拒绝该参数（HTTP 400）→ 点「测试」报错
- **Commit**: `5e15c43`（lib/service.js + tests/smoke.mjs）
- **审查者**: Code Reviewer（R0）
- **日期**: 2026-08-30
- **范围说明**: 审查者无命令面（Bash ❌）；diff 以任务书指定变更点 + 当前文件状态重建；全量门控采信 Coordinator 证据（15/15 套件 exit 0）。

## 审查证据链（全部可复查）

| 证据 | 路径 | 结论 |
|---|---|---|
| 修复点 | `lib/service.js:2880-2884`（codex-responses 请求体：无 max_output_tokens 键 + RCA 注释） | 移除成功；body 其余字段（model/store/stream/instructions/input/include/temperature）完整 ✓ |
| 其它协议分支不受影响 | `lib/service.js:2749`（openai `max_tokens`）/ `:2770`（gemini `maxOutputTokens`）/ `:2782`（openai-completions `max_tokens`） | 三分支仍消费 maxTokens——修复只删 codex 分支展开 ✓ |
| 全树残留 | grep `lib/`：`max_output_tokens` 仅注释（:2880-2882），零代码引用 | 无遗漏发送点 ✓ |
| 死代码检查 | `lib/service.js:2717` maxTokens 定义仍被 2749/2770/2782 引用 | 无死变量 ✓ |
| test 路径强制保留 | `lib/service.js:3813`（maxTokens: 16 强制） | 保留——供其它协议消费，与注释一致 ✓ |
| 判别断言 | `tests/smoke.mjs:646`（fixture cgptchat maxTokens: 1024 保留）+ `:720`（`codexBody.max_output_tokens === undefined`） | 旧代码（maxTokens=1024>0 → 发送参数）必败，判别成立 ✓ |

## 维度 1：正确性

- 修复语义正确：codex-responses 分支不再发送该参数——ChatGPT backend-api 对该参数本身返回 400（用户实证，任务书 RCA），任何值都不可发送，移除是唯一正确解 ✓。
- 修复范围精确：openai/gemini/openai-completions 三分支的 maxTokens 消费保持——test 路径强制 16 只作用于这三者，与 :3813 注释「供其它协议（openai max_tokens / gemini maxOutputTokens）消费」一致 ✓。
- 无新边界/并发/资源面（单分支请求体删键）✓。
- 行为变化面：仅「配置了 maxTokens>0 的 codex 账号请求不再携带被拒绝的参数」——无功能损失（参数原本必然 400）✓。

## 维度 2：安全性

- 无输入/注入/敏感数据/权限变化 ✓。

## 维度 3：可维护性

- 注释（:2880-2882）完整记录 RCA（HTTP 400 原文）、移除理由与其它协议保留依据 ✓；最小修改 ✓。

## 维度 4：性能

- 无影响 ✓。

## 维度 5：测试覆盖

- smoke.mjs:720 判别断言覆盖 codex 请求体全形状（model/store/stream/instructions/include/max_output_tokens undefined/temperature），fixture maxTokens=1024 保留判别性 ✓。
- 判别路径说明：断言走 run 路径（非 router/test 路径），但 test 路径仅覆盖 agent.maxTokens=16 后复用同一 codex body 构造分支（service.js:3813-3815）——同一分支，判别等效 ✓。
- 全量门控采信 Coordinator 证据（smoke ALL PASSED，四套件零回退 EV-093）。

## AI 代码专项 5 项

| 项 | 结论 |
|---|---|
| mock 残留 | 无 ✓ |
| 硬编码返回值 | 无 ✓ |
| 幻觉 API | 无（fetch 调用形状未变，仅 body 删键）✓ |
| 未实现 TODO | 无（lib grep 零命中）✓ |
| 过度实现 | 无（单分支删参 + 注释，最小修改）✓ |

## 发现清单

| 级别 | 位置 | 发现 | 影响 | 建议 |
|---|---|---|---|---|
| P3-1 | tests/smoke.mjs:720（判别在 run 路径） | router/test 路径（service.js:3795-3825）对 codex 账号无直接断言——判别经同一 body 构造分支间接覆盖 | 分支共享，覆盖等效；test 路径错误处理（:3822-3824）已有既有覆盖 | 讨论项；如需更强保障可在 smoke 补 service.test({agentId: codex账号}) 断言无 max_output_tokens |

## 结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0=0 / P1=0 / P2=0 / P3=1（讨论级）
- 5 维度全覆盖；AI 专项 5 项逐项有结论；无 P4-violation。
- 遗留台账：P3-1 为讨论项，无关闭截止要求。
