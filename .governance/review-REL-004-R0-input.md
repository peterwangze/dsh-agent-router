# REL-004 R0 代码审查报告 — EVO-006 R0 台账收尾（P2×3 + P3×3 处置）

- **Round**: R0（收尾段首轮；发布段后续由 Release Reviewer 另审）
- **审查对象**: 本地 4 commits（未 push）：`6cbe4fc`（P2-b telemetry）→ `f2f3ba5`（P2-a 披露）→ `21db990`（P2-c+P3-f feature-flags）→ `866d4df`（P3-d+P3-e 测试注释）；diff 范围 = `0eb1324..HEAD`（HEAD = 866d4df；0eb1324 为 EVO-006 治理收尾 commit，不属审查对象）。5 文件 +25/−4：lib/service.js(+4) / CHANGELOG.md(+1) / README.md(+1−1) / docs/release/feature-flags-v0.3.0.md(+3−1) / tests/oauth-promotion.mjs(+16−2)
- **上游 findings（强制比对基准）**: `.governance/review-EVO-006-R0-input.md` §五（P2-a/b/c、P3-d/e/f 原始措辞与建议）；EVO-006 R0 终态 = APPROVED_WITH_NOTES / unresolved_blockers=0（机录 `.governance/review-EVO-006-R0.md`）
- **Coordinator 裁定**: P2-a 走披露方案——不做 loader 迁移（P7：不写用户 settings）
- **审查方式**: 纯静态（读 diff + 读文件 + grep 交叉核验 + schemastery 库源码实读）；未运行任何测试/构建（协议红线）；运行时结果一律标「待验证」。git 只读查询（log/show/diff/status，`--no-optional-locks`）仅用于获取审查对象 diff 本身（事实取数，同 EVO-006 R0「读 diff」口径）
- **范围事实**: `git status -sb` = `## main...origin/main [ahead 10]`（EVO-006 段 ahead 5 + 0eb1324 + 本段 4 = 10，账目自洽）✓；`git diff 0eb1324..HEAD -- package.json` = **空**（零触碰、无版本 bump）✓；工作区未提交 .governance 文件（evidence-log/execution-packets/plan-tracker 修改 + change-triage/REL-004.json 未跟踪）不属本审查对象 ✓

---

## 一、5 维度逐项结论

### 1. 正确性 — PASS
- **P2-b 事件位置精确**：`lib/service.js:3231-3234`——`account.enabled === false` 分支内、return 之前记录 `recordOauthEvent('preset_begin_fail', { accountId: id, reason: 'account_disabled' })`（:3232）。判别式仍为严格 `enabled === false`（与池过滤 :791 `enabled !== false` 同形，无判别式漂移）。事件在 preset 分流（:3235-3236）**之前** return——停用账号若 preset 亦未知，只产 `account_disabled` 一条事件，与 `unknown_preset`（:3286，oauthBeginPreset 内）无重叠、无双记。
- **仅该路径**：service.js 全 diff 仅此一处插入（+4 = 3 注释 + 1 事件）；直连调用侧 `resolveAgent`（:804-806）保持仅返回错误、不加事件——与上游 P2-b 建议范围（oauthBegin「发起被拒」形态缺口，对比同方法 unknown_preset 先例）严格一致，无过度埋点。
- **recordOauthEvent 实现面**（:2669-2672）：`{ at, kind, ...detail }` 写入环形缓冲（上限 100），**无 reason 白名单/过滤**——`account_disabled` 畅通；kind `preset_begin_fail` 已在方法 doc 注释 kind 枚举内（:2662），无文档漂移。
- **P3-e 事实链静态实证**（详见 §四）：schemastery `object` handler 非 strict 路径 `merge(result, data)` 透传未知字段——A1（`routerSchema({})` 两键缺 absent）与 A2（遗留键容忍且键透传入装配结果）在库语义下均自洽。
- 测试断言形态静态推演：`:136`（kind+reason+accountId 三条件 presence）旧代码必败（无事件）→ 先红成立；`:84`（正常路径零 `account_disabled`）新代码通过、旧代码恒真（守卫性，代码注释 :82-83 如实标注「防遥测过宽」，未谎称判别）。

### 2. 安全性 — PASS
- **无敏感泄露面**：事件 detail 仅 `accountId`（:3223 已 `String()` 化）+ `reason` 字面量；符合 `recordOauthEvent` doc 红线「detail 仅携带 accountId/reason 等非敏感字段（P7：永不携带 token 值）」（:2666）。拒绝消息含账号 name——既有行，未改动。
- **无新增输入面/校验缺口**：本 diff 无新外部输入；`id` 进事件与既有 unknown_preset 先例（:3286）同型同风险级。
- **P2-a 披露方案 = 数据安全正解**：零 loader 代码、零 settings 写入（diff 仅文档两行）——与 P7「数据删除/覆盖路径不可逆保护」及 Coordinator 裁定一致；披露文案的补救指引（账号卡停用 `enabled=false` / 登出删除凭据）均指向既有 ②/③ 层能力，无诱导危险操作。

### 3. 可维护性 — PASS
- 触点注释同步：service.js :3228-3230 注释说明留痕动因 + 实验 reason 不复活；测试 :82-83/:130-133 注释说明判别方向与先红逻辑；feature-flags §4 行内注明「EVO-006 转正语义」；测试头注 :8-9 修正断言实位并提醒「勿按文件名找断言」。
- 四文档口径一致：CHANGELOG:12 ↔ README:128（披露同语义）；CHANGELOG:14（既有）「调用与发起授权均被拦截」↔ feature-flags:62 新行措辞一致；feature-flags:66 边界注记 ↔ oauthDiscover 实现（:3636-3664 实读无 enabled 门）一致。
- lib/ 全域 grep `oauthExperimental|oauthTosAccepted` = 仅 schemas.js:222-223 **注释行**（废弃说明），零代码引用——「遗留键不改变行为」申报成立。

### 4. 性能 — PASS
- 事件写入仅在「停用账号发起被拒」路径触发一次 `unshift`（O(1)，环形缓冲封顶 100）——热路径（启用账号 begin/调用）零新增工作；纯观测补面，无算法/IO 变化。

### 5. 测试覆盖 — PASS
- 上游 P2-b 指出的观测缺口现被**双向**看护：拒绝必留痕（:136）+ 正常路径不误记（:84）；既有断言零删除零弱化——oauth-promotion.mjs 两处 − 行均为 A2 注释行与断言**标签**改写（断言体 `legacyOk` 不变，标签追加「non-discriminating tolerance assertion」使表述更精确，非弱化）。
- 「零实验 reason」三处负向断言（smoke:870/:970、metrics:687、promotion:81）均只查 `kill_switch/tos`，`account_disabled` 不误伤——「保持绿」申报静态形态成立。

---

## 二、AI 代码专项 5 项

| 检查项 | 结论 | 依据 |
|---|---|---|
| mock 残留 | ✅ 无 | 本 diff 零新增 mock/桩；产品码改动为真实生产埋点 |
| 硬编码返回值 | ✅ 无新增 | 事件 reason 为合法语义字面量；返回消息为既有行未改 |
| 幻觉 API 调用 | ✅ 无 | `recordOauthEvent` 既有方法（:2669）实存，调用形态与 :3286 等既有 12 处同型 |
| 未实现 TODO | ✅ 无 | 4 commits 全部 hunk 无 TODO/FIXME 新增 |
| 过度实现 | ✅ 无 | 产品码净改 1 行（事件）；未波及直连侧、未泛化 reason 枚举、未顺手改其他路径 |

---

## 三、findings 闭环逐项表（上游 R0 建议 ↔ 本段落地）

| 上游 finding | 上游建议要点 | 落地事实 | 闭环判定 |
|---|---|---|---|
| **P2-a**（review-EVO-006-R0-input.md:94） | 二选一：CHANGELOG 显式披露 或 loader 一次性迁移 | Coordinator 裁定披露方案；CHANGELOG.md:12 新增「升级披露（「开过又关」用户请留意）」+ README.md:128 FAQ 同步；diff 零 loader/settings 写入代码 | ✅ 准确落地（采披露支，裁定一致，无偏差） |
| **P2-b**（:95） | oauthBegin ②层拒绝补 `recordOauthEvent('preset_begin_fail', { accountId, reason: 'account_disabled' })`，不违反「零实验 reason」断言 | service.js:3232 逐字落地（位置/事件型/reason 三要素全符）；仅此一路径；promotion:81 零实验断言不涉新 reason | ✅ 准确落地 |
| **P2-c**（:96） | §4 `enabled=false` 行更新为「调用/发起授权均拦截并明确提示」新语义 | feature-flags:62 行改写 + 验证方式列补 B1（直连拒绝零凭据副作用）/ B2（发起拒绝留痕 account_disabled）+ 池断言 | ✅ 准确落地（含申报的 B1/B2 列补充） |
| **P3-d**（:99） | 「tool.js 既有断言看护」措辞精确化（实位 routing-paths.mjs C13/D8b） | oauth-promotion.mjs:8-9 改写为「tests/routing-paths.mjs C13/D8b 既有断言看护——看护对象为 lib/tool.js 行为，勿按文件名找断言」；实读 routing-paths.mjs:475（[C13]）/ :511（[D8b]）确认存在 | ✅ 准确落地（引用点实存） |
| **P3-e**（:100） | A2 注释标注「升级兼容回归断言，非判别断言」 | oauth-promotion.mjs:44-48 注释 + :51 标签追加；**并超出建议**附「schemastery 未知字段透传」事实注记（经库源码静态实证为真，见 §四） | ✅ 准确落地（超建议部分属实且正确） |
| **P3-f**（:101） | 随 P2-c 在 feature-flags §4 注记「模型发现操作不受 ② 门控」边界 | feature-flags:66 边界注记（管理面/使用面分界）；oauthDiscover :3636-3664 实读确认无 enabled 门（登出删除同属管理面，与 B4/③ 语义自洽） | ✅ 准确落地（与实现一致） |

**闭环总判定**：6/6 逐项落地，无偏差、无遗漏、无范围外顺手改；21db990（P2-c+P3-f 同文件同主题）与 866d4df（P3-d+P3-e 同文件同为注释精度）的合并承载成立——P3-f 上游本就建议「随 P2-c 一并注记」。

---

## 四、P3-e 事实核验（schemastery 透传——库源码静态实证）

**申报**：判别加强实测不可达（schemastery 未知字段**透传**：遗留键会出现在装配结果中）。

**静态证据链**（node_modules/@deepseek-ai/schemastery@3.18.1 实读）：
1. 调用入口：schema 函数式调用 → `Schema.resolve(data, schema, options)`，**strict 缺省 false**（src/index.ts:241、:470 `strict = false`）。
2. object handler（src/index.ts:752-763）：先处理已声明键，随后 **`if (!strict) merge(result, data)`**（:761）；`merge`（:745-750）将输入中所有未声明键原样拷入结果。
3. 结论：`routerSchema({ oauthExperimental: false, oauthTosAccepted: false })` 的装配结果**必含**两键 →「遗留键不出现在装配结果」形态的判别加强**不可达**——申报属实（类型面佐证：`ObjectS<X> = {...} & Dict`，:37）。
4. 自洽性：A1（:39-40）`routerSchema({})` 空输入 → merge 空 → 两键 absent ✓；A2 容忍面（不抛错）在非 strict object handler 下平凡成立，try/catch 为防御形态 ✓。
5. 在仓佐证：schemas.js:9 头注「未知字段透传」与 feature-flags:50「升级兼容 = 旧配置遗留键未知字段透传」均与库源码行为一致（此前为文档口径，本轮升格为源码级实证）。

**附带核验**：「非判别——容忍性断言」标注独立于透传事实亦成立——旧 schema 两键为已声明键（合法接受显式 false，不抛错），旧实现下 A2 同样通过（EVO-006 R0 §四已认定，本轮复核无异议）。

---

## 五、断言账目与门控申报静态核验

| 申报项 | 抽查结果 |
|---|---|
| promotion 11→13（+2 对应 P2-b 断言） | ✅ 逐 check 计数 = **13**（:40/:51/:80/:81/:84/:88/:126/:127/:135/:136/:140/:143/:150）；恰为基线 11 + :84 + :136 两条新断言，无删除/改写既有断言体 |
| smoke 936→938（+2 = promotion 接线增量） | ✅ 口径自洽：smoke.mjs:10 import + :2087 `await runOauthPromotionTests(check)` 接线 → smoke 计数含 promotion 全部断言，增量恒等传播（936 含 promotion 11 → 13 后 = 938）。**绝对值实跑待验证（M-3 绑定，同 EV-085 台账①）** |
| 其余七套件计数不变（stats 110/routing 114/parity 14/attachments 65/credentials 98/loopback 20/client-render exit 0） | ✅ 静态自洽：本 diff 零触碰对应测试文件 → 计数基线无变化来源；实跑待 M-3 |
| 「零实验 reason」断言保持绿 | ✅ 静态形态成立：三处负向断言（smoke:870/:970、metrics:687）+ promotion:81 均仅查 kill_switch/tos；全域无 preset_begin_fail reason 穷举断言（grep 实证：仅 smoke:572 unknown_preset presence 与 promotion:136 新增 presence） |
| smoke exit 1 = §6 仓外 mkdir 沙箱先在 | ✅ tests/install-entry.mjs 不在本 diff 5 文件内 → 非本段引入（EV-085 台账①口径维持）；运行时表现待 M-3 确认 |
| smoke +1 skip | ✅ 与 §6 沙箱跳过口径相容（先在项）；实跑待验证 |

---

## 六、范围纪律与 hooks 等价推演复核

**范围纪律**：✅ 5 文件清单与 diffstat 逐文件吻合（4 commits 文件并集 = diff 范围文件集，无清单外触碰）；`package.json` diff = 空；无治理文件混入 4 commits；commit 单一承载逐 commit 成立（6cbe4fc=埋点+其判别测试一题一提 / f2f3ba5=披露双文档 / 21db990、866d4df=同文件同主题合并，理由成立）。

**hooks 等价推演复核**（对照 `<plugin_root>/skills/software-project-governance/infra/hooks/{pre-commit,commit-msg}` v0.78.0 源码逐门推演）：
- **REL-004 前缀 ✓**：4 commits 首行均以 `REL-004:` 开头（git log 实证）——commit-msg Step 1 提取 `^[A-Z]+-[0-9]+` 命中，Step 2 通过。
- **tracker 在案 ✓**：plan-tracker.md:35 `| P1 | REL-004 | ...` 匹配 Step 3 容忍匹配器 `^ *[|] *[*]{0,2}P[0-9]+...REL-004...` → 通过。
- **产品码路径门定义**：`is_product_code()`（两 hook 同一定义）仅识别 skills/agents/commands/core/infra/references/adapters/.claude-plugin 等治理插件仓布局路径；dsh-agent-router 的 lib/tests/docs/README/CHANGELOG **均不匹配** → `IS_PRODUCT_CODE=0` → commit-msg Step 10-14（含 M7.4 审查证据 BLOCK）与 pre-commit Step 7/9 全部不触发；Step 4/4.5/5 仅 WARN 级；pre-commit Step 6（CLAUDE.md 门）无交集。**结论：若真实 hooks 在位，4 commits 均会通过两道 hook——「一次性空 hooksPath + 人工等价检查」的治理面推演成立（源码级复核确认）。**
- **P3-a 观测（见发现清单）**：该门在本仓布局下恒不触发，意味着 hooks 对本仓**不提供**「产品码提交前必须有 APPROVED 审查证据」的强制力——本轮「先实现 commit、后审查」次序靠工作流纪律而非 hook 保障（本轮纪律已被遵守：审查即本报告）。属治理插件域系统性观测，非本 diff 缺陷。

---

## 七、发现清单

### P0 阻塞：**0**
### P1 关键：**0**
### P2 建议：**0**

### P3 讨论（1 项——信息性，不需本 diff 修改）
- **P3-a** hooks `is_product_code()` 路径模式（pre-commit:15-28 / commit-msg:14-27）为治理插件仓布局定制，不含 lib/tests/docs 等常规产品码布局 → M7.4「产品码提交前审查证据强制」门在 dsh-agent-router 仓库**结构性失活**（本次推演复核恰好实证了这一点）。处置建议（治理插件域，非本仓）：后续为 hooks 增加可配置产品码路径模式或按仓库类型扩展默认集。本轮不构成任何回退/阻塞。

### 明确不计为 finding 的边角（备案防复审歧义）
- A 组头注（oauth-promotion.mjs:5-6）「本组断言必败」未回头加「A2 除外」交叉引用——A2 判别性标注（:44-48）紧邻且显式，上游 P3-e 建议已精确满足，不再加注（避免过度注释）。
- CHANGELOG:12 披露对「既关开关又停用账号」子群体读感偏强（该子群账号级停用状态升级后保留，:10/:14 既有行已覆盖）——措辞已准确限定「此偏好（开关位）不迁移」，无需修改。
- 申报行号微漂移（如 P2-b 正常路径断言实位 :82-84 vs 申报 :83-84）——粒度差 1 行，实体唯一可定位，不计。

---

## 八、结论

- **结论：APPROVED_WITH_NOTES**
- **unresolved_blockers = 0**（独立结构字段；P0=0、P1=0）
- 计数：**P0 = 0 / P1 = 0 / P2 = 0 / P3 = 1**（P3-a hooks 模式覆盖面观测，信息性）
- 硬门槛自检：5 维度逐一有结论 ✓；AI 专项 5 项逐一有结论 ✓；设计一致性 = 上游 findings 6 项闭环逐项比对 ✓（含 Coordinator P2-a 裁定一致性）；断言账目静态核验 ✓（13 = 11+2 逐 check 实数）；P3-e 事实核验 = schemastery 库源码级实证 ✓；每条发现带文件:行 + 事实依据 ✓
- **待验证清单（绑定条件，不构成本轮阻塞）**：① 实跑门控结果——smoke 938 ok/0 fail +1 skip、promotion 13、其余七套件计数不变（条件：M-3 无沙箱复跑，同 EV-085 台账①③）；② 「先红后绿」的实录面（静态红绿形态已实证，实录绑定 M-3）；③ hooks 人工提交的运行时面（推演已源码级成立，运行时确认归 M-3/发布链）。
- 复审义务：R0 首轮无前轮 findings，本结论为唯一轮次产出，处置权在 Coordinator。
