# Review — EVO-008 R0（ChatGPT 预设默认模型 → gpt-5.6-sol/terra/luna）

- **Round**: R0
- **Task**: EVO-008 — ChatGPT 预设默认模型列表更新（用户指令 2026-08-30）：`['gpt-5.4-mini','gpt-5.4']` → `['gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna']`
- **Commit**: `922c74f`（lib/client.js 五点 + tests/served-client.js 镜像；4f26846 镜像补齐并入 FIX-012 报告）
- **审查者**: Code Reviewer（R0）
- **日期**: 2026-08-30
- **范围说明**: 审查者无命令面（Bash ❌）；已配置账号 fixtures（tests 各套件）与 `lib/service.js:127` knownModels（codex CLI 回退表）按任务书明确不在范围。

## 审查证据链（全部可复查）

| 证据 | 路径 | 结论 |
|---|---|---|
| 五点逐点核验 | `lib/client.js:415`（中文 presetModelsHint）/ `:672`（英文 presetModelsHint）/ `:1194`（placeholder）/ `:2063`（预置注释，含用户指令日期）/ `:2071`（models 列表 `['gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna']`） | 五点全部到位 ✓ |
| 镜像 | `tests/served-client.js` 同五点同号行（415/672/1194/2063/2071），全文 3777 行与 lib/client.js 等长，8 区域抽样逐行一致 | 镜像同步 ✓（抽样一致，未逐字节穷举——见 FIX-012 报告 P3-3） |
| 残留检查 | grep `lib/client.js`：`gpt-5.4` 零命中 | 五点内零残留 ✓ |
| 范围外残留确认 | `lib/service.js:127` knownModels（gpt-5.4-codex 等，codex CLI 发现回退）；tests 各套件 gpt-5.4-mini（已配置账号 fixture：client-render:253 / smoke:641,642,802 / metrics:659 / oauth-promotion:65,106）；smoke:1487（cli models preset fallback 断言） | 均不在范围，未误改 ✓ |
| 语义等价 | 英文 hint「plugin-managed (editable; the ChatGPT subscription endpoint offers no model discovery — common values gpt-5.6-sol / gpt-5.6-terra / gpt-5.6-luna)」vs 中文「模型列表由插件独立维护（可编辑；ChatGPT 订阅端点不提供模型发现，常用值 …）」 | 语义等价（英文显式 editable，中文括号内同义）✓ |
| 消费面 | `lib/client.js:2064-2076` addPresetAccount 唯一消费 models 列表（写 oauthAccounts 新账号）；无其它代码依赖旧值 | 纯字面量配置点，无逻辑依赖 ✓ |

## 维度 1：正确性

- 五处值/文案/注释相互一致（列表、placeholder、hint、注释同源）✓；`addPresetAccount` 写路径不变（:2073 mutate set oauthAccounts）✓；models 为自由编辑字段（hint 明示），无服务端校验冲突（chatgpt-codex 为 OAuth preset，models 不参与 knownModels 过滤）✓。
- 边界：新列表三模型顺序与 placeholder/hint 一致；无空列表/重复值问题 ✓。

## 维度 2：安全性

- 无变化（纯配置字面量）✓。

## 维度 3：可维护性

- 注释更新含用户指令日期（:2063）✓；镜像同步遵循 CONTRIBUTING.md:21 规则 ✓；最小五点改动 ✓。

## 维度 4：性能

- 无影响 ✓。

## 维度 5：测试覆盖

- 残留检查（EV-096：五点双文件零 gpt-5.4）为负向守卫 ✓；client-render 整页渲染全绿（添加流程写入 op 断言存在，见 client-render.mjs:920-922）✓；全量门控采信 Coordinator 证据（15/15 套件 exit 0）。
- **P2-1（见发现表）**：无正向断言锁定新默认列表。

## AI 代码专项 5 项

| 项 | 结论 |
|---|---|
| mock 残留 | 无 ✓ |
| 硬编码返回值 | 无（模型列表即配置本身，非伪造响应）✓ |
| 幻觉 API | 无（无 API 调用变化）✓ |
| 未实现 TODO | 无（lib grep 零命中）✓ |
| 过度实现 | 无（五点最小改动，无无关重构）✓ |

## 发现清单

| 级别 | 位置 | 发现 | 影响 | 建议 |
|---|---|---|---|---|
| P2-1 | tests/client-render.mjs:917-922（step6-add 断言写 op 存在但不断言 models 值）；无任何正向断言 gpt-5.6 默认列表 | EVO-008 仅有负向残留守卫，无正向判别：若未来默认列表被改回旧值/错值，测试网全绿不报警 | 纯配置回归风险（无功能影响）；当前值经人工核验正确 | 建议在 client-render step6-add 断言 `accountOps6[0].value.models` 深等于 `['gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna']`；P2 建议，可遗留台账 |
| P3-1 | 镜像机制（tests/served-client.js） | 无机械镜像一致性检查（同 FIX-012 报告 P3-3） | 未来漂移无自动拦截 | 讨论项 |

## 结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0=0 / P1=0 / P2=1（建议，有遗留计划：补正向断言）/ P3=1
- 5 维度全覆盖；AI 专项 5 项逐项有结论；无 P4-violation。
- 遗留台账：P2-1 列入后续跟踪（不阻塞合并；用户验收 = 真机新建账号默认填充三模型）。
