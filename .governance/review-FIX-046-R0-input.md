# FIX-046 R0 代码审查报告（Reviewer 输入件）

| 字段 | 值 |
|---|---|
| task_id | FIX-046 |
| round | R0（独立首轮，无前轮） |
| reviewer_role | Code Reviewer（只读审查——未修改任何代码/未执行任何命令） |
| 审查对象 | commit `a75f85d`（引用自任务上下文；**未能以 git 复核**，见「未验证项」U-2） |
| 审查文件 | `lib/client.js`（+87/−22）· `tests/served-client.js`（镜像同步）· `tests/client-render.mjs`（+102） |
| 审查方式 | 当前工作树逐行实读 + 静态推演链（文件:行号可复查） |
| **结论** | **APPROVED_WITH_NOTES** |
| **unresolved_blockers** | **0**（P0 = 0；P1 = 0；P2 = 6；P3 = 9，全部为非阻塞建议/讨论） |
| 审查范围声明 | 按任务约定，**不含**「真机定因是否正确」（该问题归 Coordinator）；本报告不替代 Coordinator 做范围/发布决策 |

---

## 0. 结论与一句话依据

取数点由「两侧静默」改为**失败四态分类 + 短码/detail 上屏 + 本机镜像环机录**，六种失败形态在 **代码面逐一路径可达且互不吞并**（`lib/client.js:2231-2259`），失败态**不再**回落为「健康 + `?` + 诊断恒空」的不可区分形态；镜像结构性同步成立；判别组对旧实现具备判别力（5/6 条断言指向本批新增渲染面）。发现均为非阻塞：1 条语义偏差（失败行替换 diag **全集**）、2 条显示层可见性/一致性、1 条「幂等防线」判据与证据不成立、2 条测试覆盖/事实性缺口。**无 P0/P1 ⇒ 通过（带备注）**。

---

## 1. 未验证项（MUST 显式标注——本次审查零命令执行）

| 编号 | 未验证内容 | 处理 |
|---|---|---|
| U-1 | 门控数字：`node tests/run-all.mjs` exit 0 / `ALL 20 SUITES + 4 RUNNER MODULES PASSED (26.4s)` / `#SKIP 2`；`client-render.mjs` 断言 236→243；`host-abi-health.mjs` 188→190；镜像 SHA256 相等 | **未复现**（工具边界禁止 Bash）。全部**采信开发者报告**；本报告只做**结构自洽性核验**（见 §3.5、§6） |
| U-2 | commit `a75f85d` 的变更面本身（3 文件 / +254−22 / 仅此 3 文件） | **未复核**（无法 `git show`）。本报告基于**当前工作树**实读；未能证明工作树与 `a75f85d` 完全一致（无未提交差异面） |
| U-3 | 镜像 `tests/served-client.js` 与 `lib/client.js` **逐字节**相等（作者称 SHA256 `8EB78B6C…`） | **未哈希复算**。已做结构性核验（§3.5）；SHA256 值在仓内索引面 grep **零命中**（无登记可对账）⇒ 采信，并指出机器判据位置 |
| U-4 | RED 复算「旧实现 5/6 断言必败」 | **未复现**（无法取旧版本代码）。基于当前夹具语义静态推演（F-7） |
| U-5 | 真机事实（截图 `sha256:1e473d90…`、四卡摘要 `累计 17 次调用 / 2 次失败`） | 采信 Coordinator 记载（EV-214/EV-216）与任务上下文，未自行取证 |
| U-6 | 宿主 checkout `0.1.5-rc.2` 内 `assertExactArguments` / `invokeRpc` / `rpcFailure` 符号 | **仓内不可核验**：本仓索引面 grep `assertExactArguments` 仅命中测试注释自身两处；`node_modules` 未被本次只读枚举发现（被忽略面）⇒ 见 F-9 |

---

## 2. 5 维度逐项结论

### 维度 1：正确性 —— 通过（含非阻塞发现）
- **六形态逐一可达且各有短码 + detail + 机录**（逐条可复查）：
  | 形态 | 位置 | 短码 | detail 来源 |
  |---|---|---|---|
  | remote 命名空间缺失 | `lib/client.js:2232-2234` | `host-face-missing` | 固定文案 |
  | 方法缺失（旧服务端） | `:2236-2238` | `host-face-shape: hostFaceDiagnostics`（36 字符，未被 48 截断） | 固定文案 |
  | 调用 reject | `:2257-2259` | `error.code ?? error.name ?? 'host-face-call-rejected'` | `error.message ?? String(error)` |
  | 响应非信封 | `:2242-2244` | `host-face-result-invalid` | `String(response).slice(0,120)` |
  | `ok:false` | `:2246-2249` | `error.code ?? 'host-face-rpc-failed'` | `error.message ?? …` |
  | 结果缺 `hostVersions` | `:2251-2253` | `host-face-result-shape` | `JSON.stringify(value).slice(0,120)` |
  | 成功 | `:2255-2256` | —（清 notice） | `setHostHealth(value)` + `setHostFaceNotice(null)` |
- **边界**：`response.value === null` 命中 `:2251` 的 `!response.value` ✓；`hostVersions === null` 显式排除 ✓；`ok` 非布尔/响应非对象 → result-invalid ✓。
- **并发/清理竞态**：`alive` 守卫覆盖三条路径（`:2241` 成功路径、`:2223` 全部失败路径共用闸门、`:2260` cleanup）⇒ effect 清理后不再写状态 ✓。`noteHostFaceDiag` 自身 try/catch（`:5141-5152`）⇒ 诊断写入异常不击穿主链 ✓。
- **截断口径一致**：`failNotice` 48/160（`:2219-2220`）与镜像环白名单 48/160（`:5147-5148`）逐值一致 ✓。
- **非阻塞发现**：F-1（diag 全集替换）、F-4（幂等防线）、F-11、F-12。

### 维度 2：安全性 —— 通过（无发现）
- 无硬编码密钥/token/口令（新代码仅错误短码与宿主错误文本）✓。
- detail 为宿主错误消息与**截断后**的 JSON（≤120/160），渲染经 `el(...)` 文本子节点（无 `innerHTML`/`dangerouslySetInnerHTML`）⇒ 不引入 XSS 面 ✓。
- 未新增 RPC 方法/未新增权限路径：仍是既有只读面 `router/hostFaceDiagnostics`（`lib/rpc.js:84-91`、`lib/service.js:3475-3485`）✓。
- 输入校验方向为**收紧**（新增 `ok` 布尔 + `value.hostVersions` 对象校验）✓。
- 结论：OWASP 关键项（注入/敏感数据/权限）无新增暴露。

### 维度 3：可维护性 —— 通过（含非阻塞发现）
- 命名清晰（`failNotice` / `reportFailure` / `hostFaceNotice`）；短码构造**单点**（`:2218-2221`）、渲染**单点**（`:3849-3870`），无重复分支 ✓。
- i18n 双侧齐备：zh `:629-630`、en `:960-961` ✓。
- 注释密度高且普遍带依据（符合本仓风格），但**三处注释与实现/证据不一致**：F-3（"误导性已由该行消除"）、F-4（"幂等防自激重渲染"）、F-8（模式名漂移）⇒ 与本项目 P1（基于事实、禁假设）同族。
- `lib/client.js:2205-2261` effect 体约 57 行（略超 SKILL「>50 行建议拆分」）；因分类逻辑内聚、无嵌套循环，记 P3 建议（F-15），不阻塞。

### 维度 4：性能 —— 通过（含非阻塞发现）
- **调用点计数仍 = 1**：全仓 `.hostFaceDiagnostics(` 仅 `lib/client.js:2240` 一处；`tests/host-abi-health.mjs:148-149` 的 `callSites.length === 1` 判据仍成立（`:2236` 的 `!== 'function'` 不匹配该正则）✓。
- **render 期零 probe/零 RPC 纪律未破**：`HostHealthCard`（`:3810-3871`）纯 props 渲染；`tests/host-abi-health.mjs:160` 的 `!cardBody.includes('remote(')` 与 `hostHealth.faces` 在场判据仍成立 ✓（`:3819` 含 `hostHealth.faces`）。
- **不进 2s 轮询**：新 effect 无 `setInterval`（判据 `tests/host-abi-health.mjs:156`）✓；2s 轮询 effect（`:2165-2192`）未改。
- 复杂度：新增 `filter`/`slice` 规模受环上限 64 约束，无 O(n²)/N+1 ✓；失败态仅新增一次 re-render（状态对象身份变化）✓。
- 非阻塞发现：F-4（effect 重跑前提下的重复 RPC 风险为**既有**，本批未恶化；本批新增的是"已防住"的**声称**）。

### 维度 5：测试覆盖 —— 通过（含 P2 缺口）
- **判别力**：FIX-046 组 4 形态 + 1 对照，共 **7 条 `check(`**（`tests/client-render.mjs:2216/2223/2225/2226/2232/2240/2248`）= 任务上下文所称「组 6 + 非回归 1」**自洽** ✓；其中 5 条断言面（失败行文案/诊断短码/`不可读` 标记）在旧实现下不存在 ⇒ 具备否决力（口径修正见 F-7）。
- **夹具形状锚定**：默认夹具 `{hostVersions:{llm,tools,typertProtocol}, faces:[], diag:[]}`（`:352-356`）与仓内权威面 `lib/service.js:3475-3485`（三键返回）形状一致 ✓；codec 符号 `lib/schemas.js:407/416/427-435` 实存 ✓（但见 F-10：codec 未被行使）。
- **失败信封形状**：`{ok:false,error:{code,message}}`（`:348-350`）与客户端消费面（`:2246-2249`）自洽 ✓；但具体 `code/message` 字符串来自未证实断言（F-6/F-9）。
- **覆盖缺口**：六形态中 `host-face-missing`（`:2232-2234`）与 `host-face-result-invalid`（`:2242-2244`）**零断言** ⇒ F-5（P2）。
- **基线数字**：`client-render` +7 与文件内容自洽 ✓；`host-abi-health` 188→190 **不可归因于本批**（该文件本批未改，断言数 = 固定 `check` 站点 + `ANCHOR_CASES` 循环，不读取 client.js 生成计数；文件自身在 `:1487` 记录 FIX-045 后基线为 190）⇒ 见 F-6 说明与 §6。
- **镜像纪律**：结构性一致（§3.5）。
- **自指/自碰撞（FIX-043/044 教训）**：**本批不触发**。理由可复查：`9h-4/9h-4b/9h-4c` 只扫**守卫自身文本**（`tests/host-abi-health.mjs:1372` 起），而本批三文件均未触碰该守卫；`9h-5`（含行号式锚的文件须入表）对 `lib/client.js`（守卫 `:925` 已登记）与 `tests/client-render.mjs`（`:743` 已登记）**均已在册** ⇒ 新增文本不产生未登记面；`9h R-1` 的 fresh 锚在本批改动区仍在位（如 `lib/client.js:2199` 仍含 `presetDiagnostics 方法存在性先例`，`lib/client.js` 条目 fresh 侧所需串未落空）。

---

## 3. 发现列表（每条：级别 / 位置 / 事实依据 / 影响 / 修复建议）

### F-1 [P2] 失败行替换 diag **全集**，失败发生时丢失既有诊断事件
- 位置：`lib/client.js:3849-3851`（镜像 `tests/served-client.js:3849-3851` 同）
- 事实依据：`const diagRows = failure ? [{ …failureRow }] : diag` —— `diag`（`:3833-3836` = 本地镜像环 `faceHealth.diag` ∪ RPC 环 `hostHealth.diag`）在 `failure` 非空时**整体不被使用**。
- 影响：任务规范为「失败条目**替代**『暂无诊断事件』渲染」，实现替代的是**整个诊断区**。失败态恰是最需要诊断的时点，而本地镜像环中的 `face-degraded` / `event-subscribe-*` / `inject-face-missing` 等条目被静默隐藏（RPC 侧 `diag` 此时本就为空，故实际损失面 = 本地镜像环条目）。
- 修复建议：`diagRows = failure ? [failureRow, ...diag] : diag`（保持失败行置顶且最多 8 行不变），或在 `diag` 为空时才用失败行替代空态文案。

### F-2 [P2] 失败短码/detail 默认不可见（`<details>` 无 `open`）
- 位置：`lib/client.js:3852-3859`
- 事实依据：`el('details', { className: 'dshrouter-notice', style: { margin: '0' } })` **无 `open` 属性** ⇒ 折叠态下可见面只有 `summary`（`:3853-3857`）：`✓ 宿主面正常` + `宿主面健康 · 宿主版本不可读（下文列出取数失败原因）`；短码与 detail 在 `:3859` 位于 `<details>` 体内。
- 影响：验收项 V-9 措辞为「若仍为 `?`，应能**直接看到失败原因**」；现状需一次点击。判别组断言取自**元素树文本**（`:2223` 等），不含可见性/`open` 判别 ⇒ 该风险测试网不可见。
- 修复建议：把短码上抬进 summary（如 `⚠ 宿主面取数失败：<code>`），或对失败态置 `open`（二者取一，注意不要破坏既有折叠交互）。

### F-3 [P2] 失败与「✓ 宿主面正常」绿色徽章同排；注释声称的「误导性已消除」不成立
- 位置：`lib/client.js:3854-3855`（徽章）与 `:3837-3840`（注释）
- 事实依据：徽章文案仅由 `degraded`（面数，`:3842`）决定，`failure` 不参与 ⇒ 失败态仍渲染 `t('hostHealthOk')` = `✓ 宿主面正常`；同一 summary 行另半句为「宿主版本不可读」。注释 `:3840` 写「『恒 ? 而全绿』的误导性**已由该行消除**」——消除的是**同类状态不可区分**，而绿色徽章文本仍与失败并存。
- 影响：显示层语义自相矛盾（显示层即用户唯一观测面，P10-③）；真机复验时用户仍可能读作"健康"。
- 修复建议：失败态下把**徽章文案**改为失败态（如复用 `hostHealthRpcFailed` 前缀的短形态），**不改 `degraded` 计数口径**（即不把 RPC 失败算入面数——本批该口径守住了，`:3842` 与注释 `:3837-3839` 一致，无需改动）；同步改写 `:3840` 注释为如实表述。

### F-4 [P2] 「幂等写入防 effect 自激重渲染」——判据覆盖不全 + 证据不成立
- 位置：`lib/client.js:2225-2228`（注释+守卫）、`:2214`（`setFaceHealth`）、`:2255`（`setHostHealth`）
- 事实依据（可复查）：
  1. 幂等守卫**只作用于 `hostFaceNotice`**（浅比较 `code`+`detail`）；`setFaceHealth(localFaces)`（`:2212-2215`，`health()` 每次返回新对象/新数组）与 `setHostHealth(response.value)`（`:2255`，每次响应新对象）**每次 effect 重跑都写新身份** ⇒ 若注释前提成立，自激重渲染仍会经这两条路径发生，该防线**不成立**。
  2. 注释称「判别测试的 settle 循环可复现」**不成立**：`tests/client-render.mjs:625`/`:2208` 单次构造 root element，`settle`（`:150-164`）每轮复用同一 `rootElement`（`:155`），props 身份恒定 ⇒ deps `[ready, remote, health]`（`lib/client.js:2261`）稳定 ⇒ effect 不重跑；夹具内不存在可复现的自激路径。
  3. 该风险为**既有**（deps 与 effect 结构非本批新增），本批新增的是**声称**。
- 影响：以未证实前提作为防线依据（P1 事实原则）；后续维护者可能据此放弃真实的一次性闸门。
- 修复建议：删除该注释中的防线声明并如实登记前提未验证，或改为**结构性防重**（如 `const fetchedRef = useRef(false)` 闸门 + 失败重试语义单点）；如确有宿主 props 身份不稳定事实，应附真机或宿主源码锚点。

### F-5 [P2] 六形态中两条失败分支零测试覆盖
- 位置：`lib/client.js:2232-2234`（`host-face-missing`）与 `:2242-2244`（`host-face-result-invalid`）
- 事实依据：`tests/client-render.mjs` FIX-046 组仅覆盖 4 形态（方法缺失/reject/`ok:false`/缺 `hostVersions`，见 `:2218-2249` 与夹具 `hostFaceMode` 分支 `:346-357`），无 `remote()` 返回 null 与「非信封响应」用例；全仓 grep 无 `host-face-result-invalid` / `host-face-missing` 断言（后者另有一条 `lib/client.js:2031` 的文案，不构成该分支覆盖）。
- 影响：本批核心价值是「失败必可观测」，而两条分支的短码/fail-closed 行为无防护网（后续重构可静默退化）。
- 修复建议：补 2 条判别用例（`remote: () => null`；`hostFaceDiagnostics` 返回字符串或旧式 `{result:{ok:true,value:{…}}}`），断言短码上屏且不出现「暂无诊断事件」。

### F-6 [P2]（任务指定单列）commit message 的定因断言属未证实断言，且已被复制进测试注释
- 位置：commit `a75f85d` message（不可回改，留痕勘正）；**同一断言在可改文件内**：`tests/client-render.mjs:2192-2196`（"真机定因证据见 FIX-046 交付报告"）、`:2235-2236`（"真机已知形态：网关 wire 字段对齐拒绝"）、`:273-276`（"本机宿主 checkout 0.1.5-rc.2 `lib/index.js` 该两符号实读"）
- 事实依据：开发者主张真因 = 宿主网关 `assertExactArguments` 按 descriptor `parameters[].wire` 对齐、客户端 `{ args: {} }` 被拒（`gateway/arguments-invalid: missing "request"`），并称 `ROUTER_DESCRIPTORS` 19/19 全被拒；该主张已被真机可观测信号反驳（四卡摘要 `累计 17 次调用 / 2 次失败` ⟵ `lib/client.js:2604` 的 `sumAll` ⟵ `stats.totals` ⟵ `routerRemote.stats({})`（`:2162`）⇒ 真机 `router/stats` RPC **成功** ⇒ 「19/19 全被拒」不成立；harness 手搓形态 ≠ 真实客户端调用形态 = 测量失配）。Coordinator 已裁定不授权 `lib/rpc.js` 扩面（EV-216）。
- 影响：未证断言被写入判据文件注释与夹具 message，下一轮排障可能据此误判定因；违反 P1 与 P10-④（形态须锚定可核验的宿主/本仓源码）。
- 修复建议：commit 保持不回改，以 EV-216 留痕勘正；**下一轮**把 `tests/client-render.mjs` 上述三处改述为「本仓可核验的失败信封形状（锚 = `lib/schemas.js:427-435` / `lib/service.js:3475-3485` 的返回面）」并删除"真机已定因"字样。**该发现不改变本报告结论**：判别组有效性只依赖「`ok:false` 信封 ⇒ 必须显式诊断」，不依赖该断言。

### F-7 [P3] 判别组 RED 口径夸大（不影响断言正确性）
- 位置：`tests/client-render.mjs:2189-2191`、`:2226`
- 事实依据：(a) `:2226` 只断言 `zh.hostHealthFacesTitle` 在位——旧实现（本地 face 探针 + 面板标题）同样满足 ⇒ **非判别断言**（作者自陈「旧实现 5/6 必败」与该事实自洽，但注释 `:2189-2191` 的「四条的断言面在旧实现下**全部不存在**」覆盖了 case 1 与 `:2226` 两条）；(b) `:2190-2191`「对照面 case 1 旧实现亦红（真机版本三值为 `?`）」混淆夹具与真机：case 1 的断言面（`9.9.9-a/8.8.8-b/7.7.7-c` 三值 + 无失败行）**不引用任何本批新增渲染面**，版本行渲染（`:3843-3857`）属既有面（任务上下文记载原 `?` 回落位于 `:3785-3787`）⇒ 夹具 `hostFaceMode='ok'` 下旧实现应为绿；真机 `?` 是另一环境事实（见 EV-214）。
- 影响：RED 证据口径不可复核（U-4），削弱"判别性"证据链。
- 修复建议：改述为「case 1 = 非回归对照（新旧皆绿）；`:2226` = 面数据源保留守卫（非判别）」，并把真机 `?` 的引用指向 EV-214。

### F-8 [P3] 夹具注释登记的模式名与实现漂移（`'reject'` 未实现）
- 位置：`tests/client-render.mjs:270-272`（注释）vs `:346-357`（实现）
- 事实依据：注释登记 5 模式（`ok`/`absent`/`throw`/`reject`/`noVersions`）并称 `throw` = "调用被拒"、`reject` = "宿主失败信封"；实现分支为 `throw`（= rejection，`:347`）与 **`notOk`**（= 失败信封，`:348-350`）。全文件无 `'reject'` 判定分支/引用 ⇒ 注释"登记数据单元"与代码不一致。
- 影响：下一轮排障按注释搜索 `'reject'` 落空；属 AI 专项「未实现登记项/死模式」清单。
- 修复建议：注释改为实现口径（ok/absent/throw/notOk/noVersions）。

### F-9 [P3] P10-④ 形态锚定的宿主侧不可核验 + 断言为夹具自回声
- 位置：`tests/client-render.mjs:273-276`、`:2192-2196`、`:348-350`、`:2240-2241`
- 事实依据：注释引用的锚（`dsh-api-gateway` 的 `assertExactArguments` / `invokeRpc` / `rpcFailure`；"本机宿主 checkout 0.1.5-rc.2 `lib/index.js`"）**无仓内文件:行号/导出名可复查**：本仓索引面 grep `assertExactArguments` 仅命中该两条测试注释自身；`dsh-api-gateway` 在仓内无解析面（U-6）。`:2240-2241` 断言 `'(gateway/arguments-invalid)'` 与 `'missing "request"'` 恰为夹具 `:349` 注入字符串 ⇒ 该条为**透传（自回声）判别**，不锚定宿主真实性。
- 影响：未达 P10-④「测试桩宿主面形态须锚定宿主源码（行号或导出名）」；同时把未证定因固化（与 F-6 同源）。
- 修复建议：改引仓内锚（`lib/schemas.js` / `lib/service.js` / `tests/host-abi-health.mjs:286-299` 的 `{ok:false,error:{code}}` 同型用例），或如实登记宿主绝对路径 + 行号 + 版本，并保留透传断言但标注其覆盖面。

### F-10 [P3] 夹具 codec 锚定声明未被任何用例行使
- 位置：`tests/client-render.mjs:339-341`（注释）vs `:352-356`（恒空数组）
- 事实依据：注释称 faces/diag 条目形状锚定 `lib/schemas.js` 的 `faceHealthCodec` / `hostDiagEntryCodec`（符号实存 `:407`/`:416`），但成功夹具恒 `faces: []`、`diag: []` ⇒ 两 codec 在本组零行使；面行内容实际来自本地 `health()`（断言 `:2226` 只判标题）。
- 影响：形状漂移（如宿主 `state` 取值或 detail 截断变化）不被本组捕获。
- 修复建议：至少一条用例注入非空 `faces`/`diag`（含未知 `state` 与超长 detail），行使 codec 与渲染分支。

### F-11 [P3] 双数据源皆缺时失败通知不上屏（理论路径）
- 位置：`lib/client.js:3817`
- 事实依据：`if ((!hostHealth || typeof hostHealth !== 'object') && (!faceHealth || typeof faceHealth !== 'object')) return null` —— 早退条件未考虑 `hostFaceNotice`；若 `health` prop 非函数/返回非对象（`faceHealth` 保持 null）且 RPC 失败（`hostHealth` 为 null），承载失败信息的 notice 随之不上屏。
- 影响：生产装配下 `health` 恒为函数（`:5585` `health: remotes.health`）⇒ 当前不可达；但这是「唯一必须上屏的信息」的窄门。
- 修复建议：早退条件加入 `&& !failure`（`failure` 判定前移）。

### F-12 [P3] effect 重跑失败时旧 `hostHealth` 未清空（陈旧快照与失败行并存）
- 位置：`lib/client.js:2214`、`:2255`
- 事实依据：失败分支不重置 `hostHealth`/`faceHealth`；渲染中 `failure` 只替换版本行（`:3857`）与 diag 行（`:3849-3851`），`faces` 仍合并旧 RPC 快照（`:3818-3821`）。
- 影响：重跑场景下可能同时显示「旧 RPC 面」与「取数失败」；仅在 effect 重跑前提成立时可达（与 F-4 同族）。
- 修复建议：失败分支同时 `setHostHealth(null)`，或如实登记为刻意保留（需注释说明）。

### F-13 [P3] 客户端失败诊断只入本地镜像环，宿主侧 RPC/导出面不可见
- 位置：`lib/client.js:5139-5153`（`hostFaceDiagEntries` + `noteHostFaceDiag`）、`:5509`（`health().diag`）vs `lib/service.js:3483`（RPC `diag` = 宿主环）
- 事实依据：`reportFailure` 调用的 `noteHostFaceDiag` 写**浏览器镜像环**；RPC `hostFaceDiagnostics().diag` 返回**宿主环**（`hostDiagnostics().entries`）⇒ 客户端的取数失败记录不会出现在宿主侧诊断面/后续导出面（面板之所以能看到，是因卡片用 `failure` 就地合成行，`:3850`）。
- 影响：若后续存在"报障一键导出"（读宿主环）路径，客户端侧 RPC 失败仍会缺席。
- 修复建议：登记为后续观测面收口项（或经下一次成功 RPC 上行时补登记），本批不扩张范围。

### F-14 [P3] EN 语言面未覆盖新增 detail 文案
- 位置：`lib/client.js:2233`、`:2237`、`:2243`、`:2252`（中文字面量）vs `:960-961`（en 仅新增 label）
- 事实依据：en 表新增 `hostHealthVersionsUnavailable` / `hostHealthRpcFailed`，但失败 detail 仍为中文常量；与本文件既有先例一致（如 `:2031` 的 loadFailed 文案）。
- 修复建议：若做 i18n 收口时一并处理；本批不作为缺陷。

### F-15 [P3] 可维护性建议：effect 体长约 57 行、注释密度高
- 位置：`lib/client.js:2205-2261`
- 事实依据：单 effect 内含本地探测 + notice 构造 + 六分支分类；SKILL 维度 3 建议单函数 ≤50 行。
- 修复建议：可把分类抽为纯函数 `classifyHostFaceResponse(response)`（失败短码/detail 单点，便于单测），本批不阻塞。

### F-16 [P3][范围外观察，不计入本批] 相邻静默吞错面仍在
- 位置：`lib/client.js:2173`（`stats` rejection `() => undefined`）、`:2178`（`presetDiagnostics` 同型）
- 事实依据：本批注释 `:2198-2201` 已把 `presetDiagnostics` 明确定性为"可选惰性观测面"的刻意例外；`stats` 失败仍无观测（P8 面）。
- 影响：本批使同页"宿主面取数"可观测后，这两处成为邻近残留；不属 FIX-046 范围（不授权扩面）。
- 修复建议：由 Coordinator 登记为后续观测面收口清单。

**级别统计**：P0 = 0；P1 = 0；P2 = 6（F-1…F-6）；P3 = 9（F-7…F-15）+ 1 条范围外（F-16）。

---

## 4. 硬门槛裁决

| 门槛项 | 阈值 | 判定 | 依据 |
|---|---|---|---|
| P0 阻塞问题数 | = 0 | **通过（0）** | §3 无 P0；P2/P3 均非阻塞 |
| 5 维度全覆盖 | = 100% | **通过** | §2 五维度逐一有结论（正确性/安全性/可维护性/性能/测试覆盖） |
| 每条发现标注级别 | = 100% | **通过** | §3 F-1…F-16 每条含 P0~P3 标签、位置、事实依据、修复建议 |
| 设计一致性检查 | 已完成 | **完成** | 对照：任务规范三条（失败条目替代空态 / 版本行失败态标「不可读」/ 降级面数语义不篡改）——第 1 条**语义偏差**（F-1，替代了全集而非空态）、第 2 条✓（`:3857`）、第 3 条✓（`:3842` 仅由本地 face 派生，失败不计入）；对照 ARCH-004 §6.1/§7.1 判别锚——调用点计数=1、render 期零 probe、不进 2s 轮询（`tests/host-abi-health.mjs:148-160`）✓；对照 P8/P9/P10-④/P5 与 Coordinator「不授权 `lib/rpc.js` 扩面」裁定——未触碰 `lib/rpc.js`/`lib/service.js`/`lib/schemas.js` ✓；未回退既有行为（`#SKIP`/断言基线以外无行为变更面可达）✓ |
| AI 代码专项 5 项 | 全部完成 | **完成** | ①mock 残留：产品代码零 mock；测试夹具模式名漂移 = F-8（P3，无死代码分支，仅注释）②硬编码：产品短码/文案为常量（可接受）；**夹具硬编码未经证实的宿主 message/code = F-6/F-9**（P2/P3）③幻觉 API：新增消费者 API 全部实存（`routerRemote.hostFaceDiagnostics` = `lib/rpc.js:84-91` + `lib/service.js:3475`；`value.hostVersions` = `lib/schemas.js:428`）；**宿主侧 `assertExactArguments` 无仓内锚 = F-9**（P3）④未实现 TODO：无 TODO 残留；1 条登记未实现的模式名 = F-8（P3）⑤过度实现：无——改动限于取数点分类 + notice 状态 + 卡片渲染 + 判别用例，未扩面到 `lib/rpc.js`（符合裁定）；notice 幂等守卫属轻微多余但无害（其宣称价值见 F-4） |

---

## 5. 关键静态核验记录（可复查，供 Coordinator 复用）

| 核验项 | 结果 | 依据（文件:行号） |
|---|---|---|
| 六形态均有短码 + detail + 机录 | 成立 | `lib/client.js:2231-2259`；机录 `:2229` → `:5140-5153` |
| 失败**不**计入降级面数 | 成立 | `:3842`（`degraded` 仅由 `faces` 派生）；注释 `:3837-3839` |
| 宿主版本行失败时标「不可读」 | 成立 | `:3857`（`failure` 三元）+ zh `:629` / en `:960` |
| `?` 回落仍仅在 `hostVersions` 缺失/非对象时触发 | 成立（未改动） | `:3843-3845` |
| `router/hostFaceDiagnostics` 调用点计数 = 1、位于 effect 内、render 期零 RPC | 成立 | `.hostFaceDiagnostics(` 仅 `:2240`；判据 `tests/host-abi-health.mjs:148-160` |
| `noteHostFaceDiag` 自身抛错不击穿主链 | 成立 | `:5141-5152`（try/catch） |
| 清理期竞态（`alive=false`）防护 | 成立（三路全覆盖） | `:2223`（失败闸门）、`:2241`（成功闸门）、`:2260`（cleanup） |
| 截断口径一致（48/160） | 成立 | `:2219-2220` ↔ `:5147-5148` |
| 镜像结构性同步 | 一致（未哈希） | 两侧同为 5780 行；`2196-2265` 与 `3830-3874` 区段逐字相同（`lib/client.js` ↔ `tests/served-client.js`）；机器判据 `tests/host-abi-health.mjs:161-162` |
| 判别组断言数自洽（+7） | 自洽 | FIX-046 块 `check(` = 7 处（`tests/client-render.mjs:2216/2223/2225/2226/2232/2240/2248`） |
| 自指/自碰撞（FIX-043/044 教训） | 本批不触发 | 守卫未改；`9h-4/4b/4c` 只扫守卫自身（`:1372` 起）；两个目标文件均已入 `ANCHOR_CASES`（`:743`、`:925`） |

---

## 6. `host-abi-health.mjs` 188 → 190（+2）归因裁定（任务点名项）

- **结论：不构成 FIX-046 的未闭合项；该 +2 与 FIX-046 无因果链，应如实登记为"基线口径不一致"，而非"本批使断言增加"。**
- 依据（静态可复查）：
  1. 本批未修改 `tests/host-abi-health.mjs`（任务上下文的三文件清单），而该套件断言总数 = **固定 `check` 站点数 + `ANCHOR_CASES` 循环条目数**（唯一循环内 `check` = `:1346`，`ANCHOR_CASES` 为本文件内静态表，`:726` 起）；读取 `lib/client.js` 的 §3 组（`:144-163`）为**固定 5 条**断言（`:149/152/155/156/160/162` 中不含动态计数生成）⇒ client.js 的内容变化**不能**改变该套件断言数。
  2. 该文件自身记录 FIX-045 后的基线即为 **190**：`:1487`「断言面为『基线 189 + 9h-5c 1 = 190』」，`:1482` 亦记「1 FAILURE(S) (190 passed)」⇒ 190 是 FIX-045（前序任务）的既成基线；开发者所述「188 → 190」应系与**更早时点**数字对比所致（`188` 在仓内索引面无可对账登记）。
- 处置建议：开发者报告中的「+2」措辞按本条勘正（P3 级、无需代码改动）；若 Coordinator 需要绝对数字，复跑 `node tests/host-abi-health.mjs` 取实测断言数（本次未执行，U-1）。

---

## 7. 交付与后续

- 本报告路径：`.governance/review-FIX-046-R0-input.md`（唯一允许的写入；未修改任何产品/测试文件，未执行任何命令）。
- 复审触发：仅当 Coordinator 依 F-1…F-6（P2）返工后，请 re-spawn 同一 Code Reviewer 做 R1，并在 R1 报告中逐条比对 F-1…F-16 的「已修复/未修复/新引入」。
- 不阻塞建议：F-1/F-2/F-3 属显示层与语义收口（同族），建议合并为一个返工批；F-5 补 2 条用例；F-6 的测试注释改述可在同一批内完成；F-4 至少需**改写注释或补闸门**（二选一）。
