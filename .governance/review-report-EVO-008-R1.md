# Review — EVO-008 R1（R0 P2-1 修复复审：preset 默认 models 正向断言）

- **Round**: R1
- **Task**: EVO-008 — ChatGPT 预设默认模型 → gpt-5.6-sol/terra/luna
- **Commit（本复审范围）**: `785dc1e`（tests/client-render.mjs step6-add 补正向断言），base = 4f26846
- **前轮引用**: `.governance/review-report-EVO-008-R0.md`（CLI 信封）、`.governance/review-EVO-008-R0.md`（R0 详细报告，P2-1 建议原文：「在 client-render step6-add 断言 `accountOps6[0].value.models` 深等于 `['gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna']`」）
- **审查者**: Code Reviewer（R1）
- **日期**: 2026-08-30
- **范围说明**: 纯只读 + 本报告文件；无命令面。

## 修复核验证据链（全部可复查）

| 证据 | 路径 | 结论 |
|---|---|---|
| 正向断言落地 | `tests/client-render.mjs:924-928`：注释（:924-925，引用 R0 P2-1 语义）+ 守卫链 + check | 与 R0 建议逐字一致（深等于 gpt-5.6 三件套）✓ |
| 守卫链完备性 | `:926` `accountOps6.length === 1 && op === 'set' && value` → accountValue6；`:927` `Array.isArray(value.models)` → defaultModels6；`:928` `defaultModels6 !== null && length === 3 &&` 逐元素相等 | fail-closed：op 非 set / value 缺失 / models 非数组 / 数量或元素错 → 必败，无平凡绿 ✓ |
| 判别性 | 回退 `lib/client.js:2071` models 为 gpt-5.4 系 → 元素不匹配 → :928 必败（Developer RED 实证与推演一致）✓ |
| 既有断言不受影响 | `:922-923`（无 ToS 门添加 / 退休门控键零写入）原样保留，新断言插入其后同一块内 | 无断言互扰 ✓ |
| 变更量 | client-render.mjs R0 1226 行 → 现 1231 行（+5 = 注释 2 + 守卫 2 + check 1） | 最小改动 ✓ |

## R0 findings 逐条比对

| R0 项 | 状态 | 证据 |
|---|---|---|
| **P2-1**（无正向断言锁定新默认列表，纯配置回归风险） | **已修复** | client-render.mjs:924-928 正向断言落地（见上证据链）；与五点负向残留守卫（EV-096）互补为双向锁定 ✓ |
| P3-1（镜像无机械一致性检查） | 未修复（讨论项，建议项） | 维持 R0 结论（本 commit 不涉镜像） |

## 新引入检查（R1）

- 仅测试文件新增断言，产品代码零改动——无新引入面 ✓。

## 维度核验（变更面）

- 正确性 ✓（断言守卫链 fail-closed、判别真实）；安全性 ✓（无产品面）；可维护性 ✓（注释引用 R0 语义，断言名与语义对应）；性能 ✓（无）；测试覆盖 ✓（R0 负向残留 + R1 正向判别互补；全量门控采信 Coordinator 15/15 套件 exit 0，含 smoke 新断言「step6 preset default models = gpt-5.6 trio」绿）。

## AI 代码专项 5 项（R1 变更面）

| 项 | 结论 |
|---|---|
| mock 残留 | 无 ✓ |
| 硬编码返回值 | 无（断言的是真实写路径 value）✓ |
| 幻觉 API | 无 ✓ |
| 未实现 TODO | 无 ✓ |
| 过度实现 | 无（+5 行最小）✓ |

## 结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0=0 / P1=0 / P2=0 / P3=1（讨论项维持：镜像机械检查建议）
- R0 唯一 P2 项（P2-1）已修复并经正向判别锁定；无新引入。
- 遗留台账：P3-1 保留为建议项，无关闭截止要求。
