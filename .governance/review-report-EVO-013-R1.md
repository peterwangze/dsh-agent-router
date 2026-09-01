# Code Review 复审报告 — EVO-013 预设 Agent 默认模型配置（R1）

- **round**: R1（复审第 1 轮）
- **前轮引用**: `.governance/review-report-EVO-013-R0.md`（R0 结论 APPROVED_WITH_NOTES，unresolved_blockers=0，findings F-1~F-7）
- **复审对象**: R0 后小修批 commit `75434e7`（EVO-013(Rework): F-1/F-2/F-3 修复）
- **改动文件**: lib/client.js（F-1 归一 + 消费点）、lib/preset-defaults.js（F-2 fail-closed + F-3 头注释）、tests/client-render.mjs（fixture 宿主真实形状 + 双形态判别）、tests/preset-defaults.mjs（P4b/P4c fail-closed 判别）
- **Reviewer**: Code Reviewer Agent（只读复审；本报告文件是唯一写操作）
- **证据基础**: 逐行读四个改动文件修复面 + R0 报告全文对照 + 范围外修改检查（prestep.js 契合确认）+ Coordinator 独立复跑测试证据（preset-defaults 25/25 ok exit0、client-render exit0、smoke 1068 ok / 0 FAIL、全套件 18/18）+ Developer RED-GREEN 留痕声明
- **复审性质**: 增量验证（R0 已覆盖全量首轮审查，本轮只验修复面 + R0 findings 比对 + 交叉新问题排查）

---

## 一、F-1~F-7 逐条比对表

| # | R0 finding | R0 级别 | 本轮状态 | 验证依据 |
|---|---|---|---|---|
| F-1 | roster `broken` 类型与宿主契约不符（string vs boolean），真实环境"损坏预设不可选"静默失效 + 测试假绿 | P1 | **已修复** | 见 §二.1 |
| F-2 | 主权条件③ live 全局默认不可读时 fail-open | P2 | **已修复**（采用 R0 建议方案 a fail-closed） | 见 §二.2 |
| F-3 | 模块头把 installModelSelection 归属误记为 "api-proxy" | P3 | **已修复** | 见 §二.3 |
| F-4 | subagent 显式覆盖保护在 parent 查询失败时降级 | P3 | 未修复（Coordinator 已裁定入 v0.4.2 台账，不计入本轮 unresolved） | L161-169 逻辑与 R0 记录一致未变；**无交叉**——F-2 修复仅在主 agent 分支（L142-155），F-4 位于 subagent 分支，两修复面不相交 |
| F-5 | 测试覆盖缺口 (a)live-null (b)parent 失败 (c)SWAP_LOG_LIMIT 溢出 (d)broken 真实形状 (e)`{id}` 对象分支 | P3 | **部分修复**：(a)(d) 已闭合；(b)(c)(e) 台账 | (a)→P4b/P4c 新增判别；(d)→fixture 宿主真实形状 + 三条判别断言；(b) 随 F-4、(e) 随 F-7、(c) 可选项——均入台账，与本批裁定一致 |
| F-6 | liveDefaultSelection 双份实现（prestep.js / preset-defaults.js） | P3 | 未修复（台账） | 双份实现仍在（preset-defaults.js L69-78 / prestep.js L194-203）；本批未动 prestep.js（见 §四 范围检查——修改纯粹性正确）；无交叉 |
| F-7 | livePresetOf 的 `{id}` 对象分支为防御性死代码 | P3 | 未修复（台账） | L89-90 分支原样保留；无交叉 |

**比对覆盖率：7/7 = 100%**（每条标注 已修复/未修复/部分修复 + 交叉判定）。

---

## 二、修复面逐项验证

### 1. F-1 [P1] roster broken 契约对齐 — 已修复，完整

**归一层**（lib/client.js:1542-1556）：
- 注释（L1537-1540）完整交代契约依据：宿主 wire 契约为非空原因字符串（dsh-agent-presets `AgentPreset.broken?: string`，两处 zod 实证）、非空字符串=损坏、历史 boolean true 容忍映射 'broken'、其余（含缺省/空串/false）=未损坏、下游一律真值判定。
- 归一实现（L1554）：`broken: typeof entry.broken === 'string' && entry.broken ? entry.broken : (entry.broken === true ? 'broken' : '')` —— 与 R0 修复建议逐字同构。真值表核验：`'composition missing'`→原因串（真）✅；`true`→`'broken'`（真）✅；缺省/`false`/空串/数字等异型→`''`（假）✅。
- 解包/filter/name/trust 归一与 R0 核对过的实现一致，本批仅动 broken 行与注释（行号偏移 +4 由注释扩充解释，与 R0 引用位置吻合）。

**消费层**（全量 grep 佐证，无遗漏消费点）：
- L1642 option `disabled: !!entry.broken` ✅ 真值判定
- L1643 标记文案 `${entry.broken ? ` · ${t('presetsBroken')}` : ''}` ✅
- L1650 保存门控 `disabled: !selected || !!selected.broken || busy || !writable` ✅（`selected` 来自已归一的 rosterItems，形态一致）
- i18n 键 zh:531 `已损坏` / en:829 `broken` 成对（预存未动）✅；全文件无 `=== true` 布尔假设残留 ✅

**测试面**（tests/client-render.mjs）：
- fixture（L396-408）：`broken-one` 改用宿主真实形状 `broken: 'composition missing'`；新增 `legacy-broken` 保留 boolean true 历史形态；注释 L397-400 披露依据（zod min(1)、宿主不发 boolean false、健康条目省略字段）。governance/novel 无 broken 字段 = 缺省容错路径。
- 判别断言（L1601-1609）：①string 形态 disabled（L1605）+ 标记文案（L1606）——旧实现 `entry.broken === true` 恒 false → 两条必败（RED），真值归一后通过（GREEN），判别有效；②legacy boolean true 仍 disabled（L1609）——双形态兼容；③选 governance 后添加按钮可用（L1615）——间接验证缺省字段不被误判损坏。覆盖 R0 影响③（测试假信心）。

**R0 三影响点消除确认**：①真实载荷下 disabled/标记生效（归一+真值判定）；②README.md:94 声明"损坏的预设标记不可选"现真实达成——文档-实现-契约三方对齐；③fixture 用宿主真实形状，假信心消除。

### 2. F-2 [P2] 主权条件③ fail-closed — 已修复，完整

- 实现（lib/preset-defaults.js:151-152）：`const live = liveDefaultSelection(ctx); if (!live || resolved.provider !== live.provider || resolved.model !== live.model) return resolved` —— 正是 R0 建议方案 (a)：live 不可读（服务缺失/抛错/空值）= 无法证明「当前是默认层」⇒ 不换入。
- 注释（L147-150）完整论证："宁可不接管，不可误覆盖——降级环境预设机制停用，主权优先"。降级路径零日志与模块既定纪律一致（模块头 L38-39"被主权保护跳过时不刷屏（零日志）"）——若加每请求 warn 会违反该纪律，注释披露即为该降级的文档化可观测，不构成缺陷。
- 判别断言（tests/preset-defaults.mjs:181-197）：
  - **P4b**：`ctx.get = () => undefined`（agentDefaultModel 服务整体缺失）→ 期望直通。夹具设计正确——preset 解析不受影响（`ctx.agentPresets` 属性形态优先命中，无需 ctx.get 兜底）。旧实现 `if (live && ...)` 在 live=null 时跳过校验直接换入 → 断言必败（RED）；新实现直通（GREEN）。
  - **P4c**：`live: null`（currentSelection 返回空值 → liveDefaultSelection 返回 null）→ 同判。
  - 注释 L181-184 明确 RED/GREEN 判别原理；Developer RED 留痕（fail-open 换入对旧实现必败）与设计吻合。
- **交叉影响验证（关键）**：fail-closed 收紧不影响既有行为面——
  - subagent 分支不经 live 检查（检查位于 `if (!isSubagent)` 块内）→ P6/P7 系列语义不变；
  - 主 agent 换入类既有断言（P2a/b/c、P8a/b、P10）夹具 `makeCtx()` 默认 `live={...NATIVE}` 且 `drive` 默认 `proposed={...NATIVE}` → 比对通过 → 换入照常发生；
  - P3（requestHeader 存在）在 live 检查之前返回，不受影响；P4（resolved≠live）新旧实现同判直通。
  - 断言计数：原 23 + 新 P4b/P4c = 25，与 Coordinator 复跑 25/25 ok 吻合。
- 真实环境语义评估：`agentDefaultModel` 为宿主核心服务（R0 已论证可达性≈0），fail-closed 代价（降级环境预设停用）可接受且已注释披露——主权优先方向正确（P-v2 原则 9 宿主能力判定不单向信任）。

### 3. F-3 [P3] 头注释归属更正 — 已修复

lib/preset-defaults.js:10-11 现为"经 @deepseek-ai/dsh-agent 的 installModelSelection 注册选择覆盖（该函数定义于 dsh-agent/lib/index.js，api-proxy 的 selectionFor 装配调用它）"——与 R0 宿主实证（定义于 dsh-agent/lib/index.js L272-303，apiproxy L1712 是消费方）及 execution-packets facts 归属一致。措辞即 R0 建议。

---

## 三、修复面新问题（逐条标注）

| # | 级别 | 问题 | 位置 | 说明 |
|---|---|---|---|---|
| N-1 | **P3** | tests/preset-defaults.mjs 头部判别断言索引（L15-25 摘要列表）未同步列入 P4b/P4c | tests/preset-defaults.mjs:19 | 正文 L181-184 就地注释完整披露判别原理，仅文件头索引缺同步。文档索引微瑕，非阻塞，建议随下批小修顺手同步（可并入 F-5 台账项）。 |

**其他排查无新问题**：
- 归一真值表完备，无双形态误判路径（string/boolean/缺省三态各有断言或间接覆盖）；
- 消费点全集核验（grep `broken` 全量 10 处），无遗漏布尔假设；
- 修改面纯粹：一个 commit 承载 F-1/F-2/F-3 三条同源返工修复（同一 rework 批次），prestep.js / schemas.js / service.js / index.js / README.md / package.json 均未动；
- 安全/性能面：修复仅收紧换入条件与 UI 归一，未引入新输入面/新分配路径——R0 安全维度结论（零发现）不受影响，无 O(n) 以上新增。

---

## 四、范围外修改检查

- `lib/prestep.js` liveDefaultSelection（L194-203）与 R0 记录逐字一致——未被顺带改动 ✅（修改纯粹性：F-2 修复只动 preset-defaults.js 消费条件，不动双份 helper 本体，正确避免跨任务耦合）。
- 改动文件集合 = 任务声明四文件；行号偏移（client.js +4、preset-defaults.js +1~+3）均可由注释扩充解释，无逻辑外漂移。
- F-4/F-6/F-7 台账项均未被顺手改动 ✅（避免一个 commit 混入未裁定事项）。

---

## 五、硬门槛裁决

| 门槛项 | 阈值 | 实测 | 判定 |
|---|---|---|---|
| P0 阻塞问题数 | = 0 | **0**（修复面新问题仅 N-1 一条 P3） | ✅ |
| 每条 finding 比对结论覆盖率 | 100% | F-1~F-7 全部标注（已修复 3 / 部分修复 1 / 未修复-台账 3）+ 交叉判定 | ✅ |
| 修复面新问题逐条标注 | 100% | N-1（P3）标注于 §三 | ✅ |
| 复审协议遵守 | round 声明 + 前轮引用 + 逐条比对 | R1 头部声明 + R0 报告全文先读 + 增量验证 | ✅ |
| 测试证据 | 全绿 | preset-defaults 25/25、client-render exit0、smoke 1068 ok/0 FAIL、套件 18/18（Coordinator 独立复跑，RED-GREEN 留痕） | ✅ |

---

## 六、最终结论

**APPROVED_WITH_NOTES**（unresolved_blockers = 0）

- 本批修复对象 F-1(P1)/F-2(P2)/F-3(P3) **全部完整修复**，无 P0，无阻塞级新问题；F-2 采用 fail-closed 方向正确（主权优先），交叉影响经断言语义逐条核验为零。
- 剩余 notes：
  - **N-1（P3，本轮新引入）**：preset-defaults.mjs 头部断言索引未同步 P4b/P4c——建议并入 v0.4.2 台账随手项。
  - F-4 / F-5(b)(c)(e) / F-6 / F-7（P3）：Coordinator 已裁定入台账，本轮不计入 unresolved；与本批修复面无交叉。
- 版本注记：package.json 维持 0.4.1（版本 bump 留给发布任务）——符合修改纯粹性要求。
