# Review 报告 — FIX-031（审查轮 R1 · 聚焦增量复审）

- **round**: R1（同一 Reviewer 实例复审轮）
- **前轮引用**: REVIEW-FIX-031-R0（APPROVED_WITH_NOTES / unresolved_blockers=0；机录路径 .governance/review-FIX-031-R0.md，输入副本 review-FIX-031-R0-input.md 已读）
- **审查对象**: commit 978ea53（F-1 修复：lib/wrapper.js +5 / lib/oauth-llm.js +4 / lib/tool.js +5 / tests/fix-031-attribution.mjs +63）+ commit 8a7c564（F-2 修复：tests/fix-031-attribution.mjs +16）；基线 770d9e0（R0 已审主体，未变）
- **复审性质**: 聚焦增量——R0 主体结论（DEC-029 合规裁决/双权威源去重/泄漏面审计/单点性）不重复，仅验证 F-1/F-2 修复质量 + 无新引入 + 无主体回退
- **方法与限制**: 无 Bash——commit 级 diff 无法直接读取；以**行数算术 + 逐段读码 + R0 行号锚点比对**三重佐证范围声明。测试执行声明（69/69 GREEN、stash RED、21 套件零回退）与 commit 文件清单为 Coordinator 机验项，本报告核验断言语义与源码事实。

---

## 一、R0 findings 逐条比对

| # | R0 级别 | 处置 | 判定依据 |
|---|---------|------|----------|
| F-1 | P1 跨午夜双计 | **已修复** | 三站点 at 注入核验（下 §二.1）+ D9/D9b 行为锁 + D9c 缺陷复算对照组 + D10/D11 源码契约 |
| F-2 | P2 注释虚指/锚定缺失 | **已修复** | G13/G14 值级交叉锚定核验（下 §二.3）；突变验证声明为 Developer 自报 + Coordinator 机验项，断言语义等价于可触发漂移检测（下 §二.3） |
| F-3~F-6 | P2/P3 | 不在本轮范围 | 已知遗留台账（R0 已录）；本轮 diff 未触碰相关文件，无恶化 |
| F-7 | P3 | 闭环条件非审查项 | 不适用 |

**新引入问题：无**（阻塞级零、P1/P2 零；两条 P3 级记录性观察见 §五）。

---

## 二、F-1 修复正确性重点核验

### 1. 三站点 at 注入与透传链

| 站点 | 注入点 | 核验 |
|------|--------|------|
| wrapper twin 流 | `at: startedAt`（lib/wrapper.js:391，startedAt=:381 流入口 `Date.now()`；注释 :387-390 完整记载缺陷机理） | ✅ 成功/失败共用 report() 单点——catch 路径 report(false) 同源 |
| oauth-llm | 成功 `at: started`（lib/oauth-llm.js:399）+ 失败 `at: started`（:428），started=:336 stream 入口 | ✅ 两路径均注入 |
| tool.js | 成功 `at: started`（lib/tool.js:192）+ 失败 `at: started`（:212），started=:171（resolveAgent 后、service.run 前） | ✅ 两路径均注入 |

**透传链核验**：`onCall event → service.record({agentId: MAIN_MODEL_AGENT_ID, ...event})`（wrapper.js:589 展开**保留 at**）→ service.js:3349-3351 纯委托（`this.stats.record(record)`，零字段剥离）→ stats.js:431 `Number.isFinite(Number(event.at)) ? Number(event.at) : this.now()`——注入值原样生效。落盘行 `#lineForWrite` 取 rec.at（stats.js:693）→ 盘面/读侧重放同语义。

**「同源时刻」语义**：scope 行 at = 遥测 handler 在 `next()` 返回后即刻记录（请求解析时刻）；三站点 at = 流/分发入口时刻。两者同属请求起点侧（间隔为宿主 config→dispatch 的毫秒级链路），日期桶一致——跨午夜窗口从「秒级流时长」压缩到「毫秒级派发链」，缩约三个数量级。残余毫秒窗口见 §五 O1（记录性，非缺陷）。

### 2. D9/D9b/D9c 夹具真实性

- **D9（真实位点驱动）**：`import { createWrapAdapter } from '../lib/wrapper.js'`（tests:40）——直接驱动**真实包装适配器**，非手捏事件。可控时钟（Date.now monkeypatch，finally 恢复 :314-316）：`startedAt` 捕获 start（23:59:58.500），llmCross.stream 首 yield 前把时钟推到 end（00:00:01.500）→ 断言 `reports[0].at === start && reports[0].ms === end - start`——同时锁「at=起点」与「ms=墙钟时长」两语义，防止修复退化成 ms 失真。消息为纯文本轮（present.length===0）→ 走文本委托主路径，不涉能力探测分支——驱动路径真实且最小。
- **D9b（端到端合并锁）**：scope 行 at=start + **真实 report 事件**按实际接线形态入账（`record({agentId: MAIN_MODEL_AGENT_ID, ...reports[0]})` 复刻 wrapper.js:589 展开）→ 断言 calls===1 / requestCalls===1 / callRows===1 / days 恰 1 日且 date=D0——锁定「同格吸收、单日、单计」终态。
- **D9c（对照组=缺陷复算）**：同一对请求、call 行 at 改写为 end（修复前 record 缺省 now 形态）→ 断言 **calls===2 / days===2**。这是缺陷存在性的独立机器复算——与 R0 F-1 的推演（day2 无 scopeDay → 兜底分支计 callModel.calls 含 mainCalls）逐字段吻合，证明夹具真锁行为而非恒真；同时构成对「过度修正」（如全局排除 mainCalls 兜底）的反向守卫——那种改法会令 D7（scope 无覆盖 call 兜底计数===1）与 D9c 同时红。
- **D10/D11（源码契约）**：`/at: started,/g` 计数 ===2 各锁定 oauth-llm/tool 成功+失败两路径。本 Reviewer 独立复核两文件：除两处 record 位点外无其它字面量命中（注释文本不含 `,` 后缀形态），计数语义当前精确成立；计数式契约与 G5（#accountView===3）同为先例形态。
- **断言总数复核**：全文件 `check(` 恰 **69** 处（A6+B8+C8+D13+E6+F4+G15+H9）——与「69/69」声明吻合（62 + D9/D9b/D9c/D10/D11 + G13/G14）。

### 3. tool.js「对齐非纠错」三重依据核验

| 依据 | 源码事实 | 判定 |
|------|----------|------|
| ① service.run 不经 agent/request 总线 | tool.js:173 插件内直接调 service.run（runChat/runOauthChat 插件内分发）——chat 型专业调用不产生宿主 agent/request 事件 | ✅ 相符 |
| ② 遥测硬性要求 session header | preset-defaults.js:619-621 `payload?.agent?.session?.header` 缺失即 return——插件工具执行根本不进入该 handler | ✅ 相符 |
| ③ otherCalls 无吸收机制 | stats.js:630-632：`scopeDay ? scope+otherCalls : callModel.calls`——otherCalls 在两分支均自计，专业行落哪日都恰计一次 | ✅ 相符 |

结论：tool.js 专业行单源、无双计面——`at: started` 是**语义对齐**（全部 call 行统一按请求起点落日），非缺陷修复。行为影响面：专业行的日桶/分钟桶/lastAt 从终点侧移到起点侧——与主模型行同语义，无新问题（CSV date 列、days 归日一致化；recent 仍按插入序）。

---

## 三、F-2 锚定质量核验（G13/G14）

- **G13**（tests:419-421）：`ACCOUNT_KEY_ALIASES` 声明正则捕获（键/目标）↔ `oauth-llm.js` `export const OAUTH_PROVIDER = '…'` 捕获，断言 `aliasDecl[1] === oauthDecl[1]`（键=权威值）**且** `aliasDecl[2].startsWith('oauth:')`（目标保持身份命名空间——兼锚白盒兼容约束）。当前值核验：stats.js:109 `[['chatgpt-oauth', 'oauth:chatgpt']]` ↔ oauth-llm.js:43 `'chatgpt-oauth'` ✓。
- **G14**（tests:422-424）：host-route.js:55 `HOST_ROUTE_PROVIDER` 捕获 ↔ stats.js:100 `HOST_ROUTE_ACCOUNT_KEY` 捕获，值相等断言。当前值 `'openai-codex'` 两侧 ✓。
- **漂移检测语义**：两侧任一常量改值 → 捕获组不等 → RED；任一侧声明形态移除/改名 → 捕获 null → `!!` 短路 RED。**等价于双向可触发漂移检测**——Developer 突变验证声明（改常量→精确红→还原）与断言语义一致，执行事实归 Coordinator 机验。
- 依赖面约束尊重：stats.js 锁定 node: 内建不能 import 权威常量（stats.mjs §22）——值级交叉锚定是约束下的正确形态，且与 R0 建议的「readRepo 正则锚定（G3/F4/H 组先例）」完全同型。
- R0 指控的「注释虚指」已消除：stats.js:103-108 依赖面注释仍在（陈述镜像事实），tests:414-417 新注释如实记载锚定机制与突变验证——注释与断言现在一一对应。

---

## 四、无越权检查 + 回归面

- **范围算术**（三重佐证）：wrapper.js 624→629（+5 = 4 注释 + 1 代码，恰在 report() 处）；oauth-llm.js 519→523（+4 = 2 注释 + 成功/失败各 1）；tool.js 224→229（+5 = 3 注释 + 2 代码）；tests 417→496（+79 = 63+16，与两 commit 声明合计吻合）。产品代码增量**逐行定位**均落在 F-1 修复语义内——无 findings 外改动混入迹象。
- **主体文件零改动佐证**：stats.js R0 锚点原样（:630 merged 分支、:1049 memoryEmpty 六项判据）；client.js 锚点原样（:70 WRAP_ROUTE_SUFFIX、:107 statsProviderLabelOf）；G4/G5 正则仍可命中（#fold/#foldScope/#accountView 形状不变）；H 组 client 锚点全部仍在。DEC-029 泄漏面与双权威源主体逻辑**未被触碰**——R0 主体结论持续有效，无回退。
- **测试基建面**：新增 source 变量 oauthLlmSource/hostRouteSource/toolSource（tests:64-66）仅读取授权文件；D9 临时目录纪律保持（mkdtempSync + rmSync）。

---

## 五、记录性观察（P3，非缺陷，不需修改）

- **O1**：毫秒级残余跨午夜窗口——scope 行时刻（宿主请求解析）与 twin startedAt（适配器分发入口）仍可能在毫秒间跨日。无请求级关联 id 的配对法内在属性；窗口已缩约三个数量级，触发概率可忽略。若未来追求绝对精确，请求 id 关联是终极形态（超出微批范围，不必现在做）。
- **O2**：G13 正则锚定单条目 Map 形态——未来**合法**增加第二个别名条目时 G13 将因形态不匹配而红（需同步更新正则）。这是有意的 tripwire（别名表任何变更强制过测试 consciously re-anchor），非脆性缺陷；记录以免未来误判为测试坏。

---

## 六、硬门槛裁决（增量轮）

| 门槛 | 阈值 | 实测 | 判定 |
|------|------|------|------|
| P0 阻塞问题数 | = 0 | **0**（新增 P1/P2 = 0；两条 P3 观察为记录性） | ✅ |
| 维度覆盖（增量轮：正确性/可维护性/测试覆盖 + 安全/性能影响面） | 100% | F-1 正确性逐站点+夹具；F-2 可维护性锚定；覆盖 69 断言语义核验；安全面 at 为数值时间戳经 Number.isFinite 门（无新输入面）；性能零变化 | ✅ |
| 每条发现标注级别 | 100% | F-1/F-2 处置标注 + O1/O2 P3 | ✅ |
| 设计一致性 | 已完成 | 修复采用 R0 建议的 exact 形态（at: startedAt 三站点注入），零架构偏离 | ✅ |
| AI 专项 5 项 | 全部完成 | mock 残留无（D9 驱动真实 createWrapAdapter；时钟控制为合法夹具手段）；硬编码无；幻觉 API 无（import 的 createWrapAdapter 实际导出于 wrapper.js:302）；TODO 无；过度实现无（D9c 对照组是缺陷存在性证据的正当投入） | ✅ |

---

## 七、审查结论

# APPROVED_WITH_NOTES

**unresolved_blockers=0**

- F-1（P1）：**已修复**——三站点注入 + 透传链核验 + 真实位点驱动夹具（D9/D9b）+ 缺陷复算对照组（D9c）+ 源码契约（D10/D11），修复形态与 R0 建议逐字吻合。
- F-2（P2）：**已修复**——G13/G14 值级交叉锚定双向可触发，注释虚指消除；突变验证执行归 Coordinator 机验。
- 无新引入阻塞/P1/P2 问题；无越权改动（行数算术 + 逐行定位佐证）；主体（stats.js/client.js）零触碰，R0 主体结论无回退。
- 保留备注仅为记录性观察 O1/O2（P3）与 R0 已录遗留台账 F-3~F-6 + 闭环条件 F-7（真机显示证据）——均不在本轮范围。
- 测试执行声明（69/69、stash RED、21 套件）与 commit 范围为 Coordinator 机验项；本报告核验了断言语义与源码事实的等价性。
