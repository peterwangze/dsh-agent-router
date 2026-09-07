# Review 报告 — FIX-031（审查轮 R6 · 快速聚焦复审）

- **round**: R6（同一 Reviewer 实例第七轮）
- **前轮引用**: REVIEW-FIX-031-R5（APPROVED_WITH_NOTES / unresolved_blockers=0；输入副本 review-FIX-031-R5-input.md）
- **审查对象**: commit 15135b7（恰 3 文件：lib/client.js〔buildAccountNames 提取 + twin 排除〕/ tests/served-client.js〔镜像同步〕/ tests/fix-031-attribution.mjs〔D20/D20b/D20c〕）；stats.js 与 service.js 零改动（锚点直接复核：reload :1079/:1080/:1090、resolver :738、maybeReload :2828 与 R4/R5 逐位一致）
- **复审性质**: 快速轮——D10 twin 目录条目污染账号显示名 + 提取重构行为等价 + smoke 抖动裁定

---

## 一、D10 处置裁定：**已修复**

### 1. 修复核验（lib/client.js:120-161 + :2454 + :5262）

- **排除语义**：providers 循环内 `if (entry.provider.endsWith(WRAP_ROUTE_SUFFIX)) continue`（:142）——twin 目录条目（`${provider}-router`，displayName 带「+ 多模态」标记）**不入 roster**，顺序无关（排除而非覆盖序技巧，注释如实）；选择器中 twin 自身标记是宿主 UX 功能（用户已认可），不经本函数——边界注释明确。
- **提取行为等价逐项核验**：新函数六循环 vs R2-era 内联六循环（本 Reviewer 前轮读档逐行比对）：providers 条件改写为 De Morgan 等价否定式 + **唯一语义增量 = twin 排除行**；oauth/pool/cli/agent/configuredAgents 五循环字段检查、键形（`${kind}|${清洁键}`）、`!names.has` 兜底条件**逐一一致**；`providers ?? []` 空卫内移（调用侧已预缺省，双卫无害）。重构无夹带 ✓。
- **原位点**：`:2454 const accountNames = buildAccountNames(providers, state.catalog, value.agents)`——实参三源与原内联读取源一致 ✓。
- **exports 面**：`exports.buildAccountNames = buildAccountNames`（:5262）——G9-G12 先例同型（既有 exports 对象增一函数引用，无加载语义变化）✓。

### 2. 排除语义完备性（任务焦点①）

- **catalog 其它来源**：oauthAccounts/pools/cliAgents 为插件自管配置实体（按 id 键），catalog.agents/configuredAgents 为 agent id——**结构上不可能出现 twin**（twin 是宿主 llm 注册适配器变体，只存在于 providers 目录）✓。
- **providers 的其它消费面**（本 Reviewer 主动扩展排查）：
  - `addedAccounts`（:2482-2495）：twin 若通过 settingsNs/active 过滤，clean 键去重保证单卡；其显示名经 accountNames map → **本批修复已覆盖** ✓。
  - **`statsAccountRows` roster 循环（:2643-2668）：无 twin 排除且 `displayName: entry.displayName` 直取条目名、绕过名单点**（O9，P3——见发现列表）。证据链表明 twin 条目过不了该循环的 `settingsNs === 'llm-pi-ai'`/active 过滤（用户无双卡报告 + Coordinator 机验将根因定位到名单 map），但这是对宿主目录形状的**推断而非源码证明**；防御性一行排除可封死该面（顺带覆盖 D5 精确匹配不着的 `openai-codex-router` codex-twin roster 侧情形）。
- **D5 判据正交性（任务焦点②）**：D5 = roster 循环内 `isHostManagedRoute(entry.provider)` 精确匹配（'openai-codex'）；D10 = 名单构建内后缀排除。两判据词面正交（'openai-codex' 无后缀、twin 非 host-route id）、所在循环不同、无冲突 ✓；codex-twin 在 map 侧被 D10 排除 ✓（roster 侧归 O9 防御建议）。

### 3. D20 系夹具（tests:512-537）

- **D20**：真实浏览器包 exports 驱动真实 buildAccountNames；**twin 后置序**（:522-527——最大化复现旧代码「后写入顶掉」覆盖条件）→ 真名保持 + map 无 twin 键。旧代码失败形态 = exports 缺失（`!!names20` 假）✓ 判别成立。
- **D20b**：对照组——无 twin 时六源建名照常（provider/oauth/agent/configuredAgents 兜底）= **提取重构的回归锁** ✓。
- **D20c**：源码契约——排除行在册（正则锚 `endsWith(WRAP_ROUTE_SUFFIX)`) + 旧内联形态缺席（负向断言）→ 基线亦红，与 D20/D20b 的 exports 失败形态互补 ✓（「RED 三条」声明与本分析吻合）。
- **镜像同步**：served-client.js 同函数/排除行/调用点/exports **行号级一致**（:138/:142/:2452/:2454/:5262）✓。

---

## 二、smoke 抖动裁定（任务焦点③）

**自报「与本批显示层改动无因果路径」不成立**。smoke.mjs 三路消费 client.js：
1. 语法守卫（:43-49，client.js 在预打包解析清单内）；
2. 文案键覆盖守卫（:60-78，读 clientSrc 提取 `t('key')` 对 zh/en 全覆盖）；
3. **client-render 全页驱动**（:6 `runClientRender` + :2311-2312，迷你 React 渲染整页 + 结构断言）——直接执行本批改动的代码路径（buildAccountNames 调用点在渲染树数据装配内）。

**裁定**：因果**路径存在**（自报不准确——与 R2「组合探针」同类自报瑕疵）；因果**事实**未证（首跑失败断言细节未留存/未提供；本批内容等价性 + 夹具若无 twin 条件则渲染输出零变化）。双重复跑 ALL PASSED（单跑 + 整网，Coordinator 机验）支持「当前不可复现」。**处置 = O10 观察项**（P3）：不得以「无因果路径」为由静默归档——应留存首跑失败输出备查，复发即排查（client-render 夹具与 twin 排除的交互是第一嫌疑面）。

---

## 三、无回退 + 范围

- **stats.js/service.js 零改动**：锚点直接复核（reload 三处 persist 检查 :1080/:1090 + :1019；resolver :738；maybeReload :2828——与 R4/R5 逐位一致）✓。
- **R0-R5 修复面**：D5（roster isHostManagedRoute :2653 原样 + D13 系断言在册）、D6/D7/D8/D9/F-1/F-2 断言全保留（位置随 D20 块插入平移，语义未动）✓。
- **断言总数独立复核**：`check(` 恰 **103**（100 + D20×3）✓。
- **范围算术**：恰 3 文件；client.js 现 5271 / tests 现 757 / served-client 与 client 行号级同步——与声明净增各有 ±2-3 行漂移（O8 台账续项，内容级全读均落 D10 语义，无夹带）。
- **AI 专项（增量）**：无 mock（真实 bundle exports 驱动）；无幻觉 API；无 TODO；无过度实现。

---

## 四、发现列表（本轮增量——均 P3）

| # | 级别 | 位置 | 问题 | 处置建议 |
|---|------|------|------|----------|
| O9 | P3 | client.js:2643 statsAccountRows roster 循环 | 无 twin 排除且 displayName 直取 entry（绕过已修的名单点）——当前靠 settingsNs/active 过滤间接挡住（推断非源码证明）；含 codex-twin（`openai-codex-router`，D5 精确匹配不着）roster 侧情形 | 防御性一行：循环内补 `if (entry.provider.endsWith(WRAP_ROUTE_SUFFIX)) continue`（与 D10 同判据）——随下批或遗留 |
| O10 | P3 | smoke 抖动 | 自报「无因果路径」不成立（smoke 三路消费 client.js：语法守卫/文案键守卫/client-render 全页驱动）；抖动未定性但双重复跑绿 | 留存首跑失败输出备查；复发即排查（client-render 夹具 × twin 排除交互为第一嫌疑）；修正自报记录 |
| O11 | P3 | 行数算术（O8 续） | 声明净增与直接观测差 ±2-3 行（client/tests 两文件）；内容级全读无夹带 | Coordinator commit-stat 交叉核对（声明已机验——以实跑为准） |

---

## 五、硬门槛裁决（快速轮）

| 门槛 | 实测 | 判定 |
|------|------|------|
| P0 阻塞 | 0（P2+ = 0；P3×3 记录性） | ✅ |
| D10 正确性 | 排除语义完备（catalog 其它源结构性免疫；providers 其它消费面除 O9 外已覆盖）+ 提取行为等价（逐项比对）+ exports 先例同型 | ✅ |
| 判据正交 | D5 精确匹配 × D10 后缀排除——词面/位置/语义三维正交 | ✅ |
| 范围 | 恰 3 文件；stats.js/service.js 零改动直接复核；镜像行号级同步 | ✅ |

---

## 六、审查结论

# APPROVED_WITH_NOTES

**unresolved_blockers=0**

- **D10：已修复**——twin 目录条目不入 roster（顺序无关排除），账号显示名污染源封死；提取为真函数（六循环行为等价、无夹带）+ exports 先例同型；D20/D20b/D20c 真实 bundle 驱动 + 对照 + 源码契约三面锁定；镜像行号级同步。
- **smoke 抖动裁定**：自报「无因果路径」**不成立**（三路消费面实证）——按 O10 记录观察项处置（双跑绿支持不可复现，但须留存首跑输出、复发排查、修正自报）。
- **R0-R5 修复面零回退**（stats.js/service.js 锚点直接复核；断言全保留；总数恰 103）。
- 保留备注：O9（roster 循环防御性排除建议）/ O10（smoke 抖动观察项 + 自报修正）/ O11（行数漂移续项）——均 P3 记录性。台账 O3/O5/O6/O7/O8/F-3~F-6 与闭环条件 F-7 未恶化。
- 测试执行声明（103/103、RED 三条、21/21）为 Coordinator 机验项——其中 smoke 首跑失败的原始输出请一并归档（O10）。
