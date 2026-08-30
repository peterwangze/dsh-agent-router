# Review — FIX-012 R1（R0 P2-1 修复复审：effect deps 补 imageConditional）

- **Round**: R1
- **Task**: FIX-012 — 文本模型发图自动多模态接管（图片条件化武装 + armedBy 来源语义）
- **Commit（本复审范围）**: `5f68c17`（lib/client.js +5/-1 + tests/fix-012-image-takeover.mjs +29 + served-client.js 镜像同步），base = 4f26846
- **前轮引用**: `.governance/review-report-FIX-012-R0.md`（CLI 信封）、`.governance/review-FIX-012-R0.md`（R0 详细报告，P2-1 见该报告发现表）
- **审查者**: Code Reviewer（R1）
- **日期**: 2026-08-30
- **范围说明**: 纯只读 + 本报告文件；无命令面。变更面核验 = 当前文件状态 vs R0 报告记载（R0 时 deps 为 `[sessionId, api, takeoverArmed, imageCount]`）。

## 修复核验证据链（全部可复查）

| 证据 | 路径 | 结论 |
|---|---|---|
| deps 补全 | `lib/client.js:3321`：`[sessionId, api, takeoverArmed, imageCount, imageConditional]` | R0 P2-1 指出的缺失变量已补入 ✓ |
| 修复注释 | `lib/client.js:3317-3320`：说明缺该变量时 effect 不重跑 → armedBy 滞留 'image' → 交错下还原失效；补入后升级链闭合 | 与 R0 P2-1 描述逐字对应 ✓ |
| 分支逻辑未动 | `lib/client.js:3282`（记忆写 armedBy）/ `:3288`（升级分支 `!imageConditional && armedBy !== 'switch'`）/ `:3292-3298`（image 永不还原）/ `:3299-3311`（switch 还原链） | 修复为纯 deps 补全 + 注释，无逻辑改动（改动量 +5/-1 吻合）✓ |
| 判别测试 | `tests/fix-012-image-takeover.mjs:305-332`（P2-1a~d，+29 行） | 四步链式驱动（贴图接管→在途开启→在途关闭→移除还原），判别点 P2-1d ✓ |
| 镜像同步 | `tests/served-client.js:3317-3321` 与 lib 逐行一致；双文件均 3781 行（R0 时 3777 → +4 注释行一致） | 镜像同步 ✓ |

## R0 findings 逐条比对

| R0 项 | 状态 | 证据 |
|---|---|---|
| **P2-1**（deps 缺 imageConditional → 在途开关交错下 armedBy 不升级、移除后不还原） | **已修复** | deps 补入（client.js:3321）；逻辑推演四步闭合：①在途开启开关 → imageConditional true→false → effect 重跑 → armed && wrapped && memory('image') → `!imageConditional`=true → 升级 'switch'（纯内存 Map 写，零 RPC——P2-1b 锁定 0 调用）②在途关闭开关 → false→true → 重跑 → `!imageConditional`=false → 保持 'switch'（P2-1c 锁定 0 调用）③移除图片 → armed false → disarmed && memory('switch') → 既有还原链（P2-1d 判别绿） |
| P2-1 判别性 | 成立 | 旧 deps 推演：①开关翻转不触发重跑（takeoverArmed 恒 true）→ armedBy 滞留 'image' ②移除图片 → armed false → disarmed image 分支 → 保持 twin 不还原 → P2-1d `nativeSelect` 必败（RED）。Developer RED 实证与推演一致 ✓ |
| P3-1（测试钩子导出惰性） | 未修复（讨论项，不要求改） | 维持 R0 结论：宿主仅消费 apply/inject |
| P3-2（catalog 瞬时 null churn） | 未修复（讨论项，既有行为） | 非本 commit 引入 |
| P3-3（镜像无机械一致性检查） | 未修复（讨论项，建议项） | 本 commit 手工同步已做；机械检查仍缺 |

## 新引入检查（R1）

- deps 补全仅使「takeoverDefaultModel 翻转」触发 effect 重跑——重跑分支为纯内存升级/保持或无操作（零新 RPC 路径）；无重入风险（升级写 Map 幂等，P2-1b 断言零重复接管）✓
- 无新状态、无新注释与实现偏差、无死代码（imageConditional 现被 deps 消费）✓

## 维度核验（变更面）

- 正确性 ✓（升级链交错闭合，见上）；安全性 ✓（无新输入/权限面）；可维护性 ✓（注释完整、最小改动）；性能 ✓（重跑 O(1)）；测试覆盖 ✓（22 断言 = R0 18 + P2-1a~d；P2-1b/c 为保持性护栏、P2-1d 为真判别；全量门控采信 Coordinator 15/15 套件 exit 0，含 fix-012 22/22）。

## AI 代码专项 5 项（R1 变更面）

| 项 | 结论 |
|---|---|
| mock 残留 | 无（测试夹具显式）✓ |
| 硬编码返回值 | 无 ✓ |
| 幻觉 API | 无（无新 API 调用）✓ |
| 未实现 TODO | 无 ✓ |
| 过度实现 | 无（+5/-1 + 注释，最小修复）✓ |

## 结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0=0 / P1=0 / P2=0 / P3=3（讨论项维持：P3-1/P3-2/P3-3）
- R0 唯一 P2 项（P2-1）已修复并经判别测试锁定；无新引入。
- 遗留台账：P3-3（镜像机械检查）保留为建议项，无关闭截止要求。
