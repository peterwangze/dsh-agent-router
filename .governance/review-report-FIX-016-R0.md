# Review — FIX-016 R0（mapTools 顶层形状修复：tools[0].name 缺失 400）

- **Round**: R0
- **Task**: FIX-016 — EVO-009 真机首用 HTTP 400 `Missing required parameter: 'tools[0].name'`（mapTools 错误嵌套 `{type:'function', function:{name,…}}` vs codex/responses 契约顶层 name）
- **Commit**: `a410a52`（lib/oauth-llm.js mapTools + 注释，tests/oauth-main-model.mjs F16-1~5，+44/-6），base 13cd084
- **审查者**: Code Reviewer（R0）
- **日期**: 2026-08-30
- **范围说明**: 无命令面；取证链三方全部直接读宿主源码印证；门控采信 Coordinator 证据（16/16 套件 exit 0，oauth-main-model 40 断言）。

## 取证链抽验（复审重点 1，三处全部实读）

| 取证点 | 宿主源码（直接读取） | 印证 |
|---|---|---|
| dsh-tools defineTool | `@deepseek-ai/dsh-tools/lib/index.js:848-851`：`tool = { name: options.name, description: options.description, parameters, ... }` | **顶层** name/description/parameters ✓ |
| dsh-system-prompt | `@deepseek-ai/dsh-system-prompt/lib/index.js:254-258`：`result.schemas.map(({ name, description, parameters }) => ({ name, description, parameters: structuredClone(parameters) }))` | 解构为顶层三字段，行号精确 ✓ |
| dsh-llm-pi-ai toolsOf | `@deepseek-ai/dsh-llm-pi-ai/lib/index.js:1123-1128`：`options.tools?.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }))` | 官方 adapter 同款顶层读法，行号精确 ✓ |

三方印证成立：宿主 tools 形状 = 顶层 `{name, description, parameters}`；R0 审查时我核对了「输入形状」但未核「端点输出契约」——错误嵌套致 400，本修复闭合。

## 修复核验（复审重点 2）

- `lib/oauth-llm.js:214-227` mapTools 现发射顶层 `{ type: 'function', name, description?, parameters? }`——与 OpenAI Responses API 契约一致；`name` 顶层与端点错误信息 `tools[0].name` 校验路径直接对应 ✓。
- **双路径交叉验证（如实标注）**：grep 证实 `lib/service.js` runCodexResponsesChat（:2867-2884）body **从不发送 tools 键**（专业 agent 是工具执行者、非工具调用者——不发 tools 合理）——「第二路径交叉验证」对象不存在；修复依据 = Responses API 契约 + 用户实证错误信息（端点契约的直接证据）。无插件内第二发送点需同步（插件内 tools 发送唯一点 = mapTools 调用 :325/:345）✓。
- 修复局部性：mapMessagesToItems（:146）/ aggregateCodexSse（:235）函数未动（行号偏移仅为 mapTools 注释 +7）；body tools 键（:345 `...(tools.length > 0 ? { tools } : {})`）保持；grep 无旧 `function:{` 嵌套残留 ✓。
- 请求体其余形状（model/store/stream/instructions/input/include）与 R0 核验一致 ✓。

## 守卫语义（复审重点 4）

- `:218` name 非字符串/空 → 跳过：与 mapMessagesToItems 损坏负载跳过（:149-150 未知 role 跳过）同口径；宿主契约 name 必填（defineTool + system-prompt 解构双重约束），守卫为防御性容错。**跳过优于抛错**：坏工具不影响其它工具与请求；抛错会把整个对话降级为 finish(error)——过度惩罚 ✓。

## 判别质量（复审重点 3）

- F16-1~5（tests/oauth-main-model.mjs:289-314）：
  - F16-2（name 顶层存在——旧代码嵌套必败）真判别 ✓
  - F16-3（type=function 且**无 function 嵌套残留**）——锁定「修干净」而非「只补 name 不删嵌套」的半吊子修复 ✓
  - F16-4（description/parameters 顶层透传 + 第二项 route_agent）✓
  - F16-5（SSE 聚合/function_call 往返不受影响——call_id 同源自查）✓
  - 夹具（:300-303）精确复刻宿主形状 {name, description, parameters} ✓
- **images/system/call_id 三处同源自查**：STR-3（instructions=system）/ STR-8（input_image）/ STR-6,7,11（call_id 三环往返）断言在终态保持（grep 25 条断言确认）；FIX-016 修复只触 mapTools 独立函数，三处映射未动——同源成立 ✓。
- 断言计数复核：STR 14 + REG/CAT/ERR/KILL 15 + F15 6 + F16 5 = 40（门控 40 吻合）✓。
- 顺带确认：F15-1~6（oauth-llm 侧 warn 判别——FIX-015 修 1 的补充，闭合 EVO-009 R0 报告 P3-4 缺口）在终态存在且判别正确（F15-3 去重 / F15-5 复发重告警 / F15-6 未登录不告警）✓。

## 终态完整性抽查（复审重点 5）

- oauth-llm.js 493 行（R0 455 + net +38 = +44/-6 吻合）；mapTools 修复在终态、无重应用误覆盖痕迹（无旧形状残留、无重复代码、函数签名稳定）；测试 317 行含 F16 块与 F15 块 ✓。

## 维度核验（变更面）

- 正确性 ✓（形状契约对齐 + 错误信息实证）；安全性 ✓（无新输入面）；可维护性 ✓（注释含取证链行号 + 用户实证 + 守卫理由）；性能 ✓（无）；测试覆盖 ✓（5 判别 + 三处同源自查 + 40 断言全绿采信）。

## AI 代码专项 5 项

| 项 | 结论 |
|---|---|
| mock 残留 | 无（hostTools 夹具为形状复刻，非产品 mock）✓ |
| 硬编码返回值 | 无（修复为形状映射，无伪造响应）✓ |
| 幻觉 API | 无（三方取证行号全部实读印证；修复只改形状）✓ |
| 未实现 TODO | 无 ✓ |
| 过度实现 | 无（+44/-6 最小，含注释与判别）✓ |

## 发现清单

| 级别 | 位置 | 发现 | 影响 | 建议 |
|---|---|---|---|---|
| P3-1 | 门控范围 | 真机成功复验未含在 16/16 门控内（400 消失依赖错误信息 + 契约支撑，测试锁请求形状） | 测试形状与端点校验路径一致，风险低；用户后续真机验收兜底 | 讨论项：用户真机复测确认后闭环 |
| P3-2 | lib/service.js（专业 agent 路径） | 双路径交叉验证对象不存在（runCodexResponsesChat 从不发 tools）；插件内 tools 发送唯一点已修复 | 无实害（专业 agent 不调用工具）；未来若专业 agent 路径启用工具，可复用 mapTools 单点 | 讨论项：未来复用 mapTools |

## 结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0=0 / P1=0 / P2=0 / P3=2（讨论级）
- 取证链三方实读印证；修复形状与端点契约对齐；判别 5 断言 + 三处同源自查覆盖；终态完整性抽查通过；AI 专项 5 项逐项有结论；无 P4-violation。
