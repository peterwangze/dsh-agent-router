# Code Review 报告 — EVO-002 Step 3（1455 loopback 回调服务）

| 项 | 值 |
|---|---|
| Task | EVO-002（v0.3.0 C-1 ChatGPT 订阅 OAuth 实施）· Step 3 / ~7 |
| Round | **R3**（前轮引用：R1 = Step 1 schemas，APPROVED_WITH_NOTES（P0=0/P1=0/P2=0/P3=6），见 `.governance/review-EVO-002-R1.md`；R2 = Step 2 凭据模块，APPROVED_WITH_NOTES（P0=0/P1=0/P2=2/P3=7，P2×2 转 hardening），见 `.governance/review-EVO-002-R2.md`；本轮为新切片首审，非 R1/R2 返工复审） |
| 审查对象 | commit `128cb8104084f3205cd7a1c8593286c58f8ec9e3`（main HEAD，已核实 `.git/refs/heads/main` = 该 hash） |
| 变更集 | lib/index.js（+103/-1：createCodexLoopback 导出 + CODEX_LOOPBACK_PORT + 惰性注入 effect + 模块头三回调路径文档）、tests/oauth-loopback.mjs（新，155 行 20 断言）、tests/smoke.mjs（+6/-1：EVO-002 测试接线）——与任务书一致（任务书总额 +263 与分项和 264 差 1，以仓库为准，见 §0） |
| 审查者声明 | Code Reviewer Agent（独立于 Developer）；只读审查产品代码，未执行任何测试/命令（smoke 624 断言 exit=0 + loopback 独立 20/20 exit=0 已由 Coordinator 独立复跑提供；本审查做静态核验与逻辑推演，运行数值如实标注）；已全文加载 agents/code-reviewer.md 与 skills/code-review/SKILL.md |
| 审查范围 | 仅该 commit 引入内容；按任务书边界：oauthBegin preset 分支 / 设备码 / 手动粘贴（Step 4+）**不构成本轮缺陷**；oauth-credentials.js 本 commit 零改动 → R2 F-01/F-02 保持 hardening 遗留态（不因未在本 commit 修复立案——C4 纯粹性反而要求不在此修） |

---

## 0. 审查方式与锚点核实（命令执行禁用，HEAD 状态即 diff 等效审查面）

- HEAD 锚点：`.git/refs/heads/main` = `128cb8104084f3205cd7a1c8593286c58f8ec9e3` ✓。
- 提交链锚点：`.git/logs/HEAD` 第 114 行（末行）——`8ba6ab18` → `128cb810`，message "EVO-002 Step 3: codex 1455 loopback server (lazy start + EADDRINUSE degrade) + smoke wiring for credential/loopback tests"，8ba6ab18（R2 已审）之后恰此一次提交 ✓（C4 单 commit 单主题坐实）。
- 因此 HEAD 状态即 commit 状态：`lib/index.js` 全文 229 行逐行通读、`tests/oauth-loopback.mjs` 全文 155 行逐行通读、`tests/smoke.mjs` 定向核验（grep EVO-002/oauth-loopback/oauth-credentials 全部命中点 + 接线区块上下文 + 顶层执行结构），等效 diff 审查。
- smoke.mjs 变更足迹核验（自报事项 8）：EVO-002 相关引用恰收敛于两处——import 区（:9 `runOauthCredentialTests`、:10 `runLoopbackTests`）与 main 尾部接线区（:1265 注释、:1266/:1267 两个 await）；:77-87 的 schema 断言属 Step 1（R1 已审），非本 commit 足迹。与"仅 2 hunks 接线"声称相容 ✓。精确 ±计数与 hunk 形状**未验证**（命令执行禁用，无法 git diff）；任务书 +6/-1 与足迹（2 import + 1 注释改写 + 2 await + 1 空行 = 6 增；1 行改写 = 1 删）自洽。
- 计数对账：任务书总额"+263"与分项和（103+155+6=264）差 1——标注为任务书转录级差异，以仓库为准，不影响任何结论（**未验证**项，非产品缺陷）。
- 既有路径零扰动核验：`handleOauthCallback`（:47-67）、`/router-oauth/callback` 路由注册（:175-179）、8085 常驻 loopback（:183-209）全文比对结构与 R2 时代引用（roadmap 引 :99-125 = 本 commit 前行号，现行号整体 +80 位移相符）——逐行读无任何行为改动；lib/index.js 的 -1 为模块头注释行改写（"两条回调路径"→"三条"，:14-24）✓ P3 零影响。

## 1. 五维度逐项结论

### 1.1 正确性 — 通过（1 条 P2 边界加固 + 1 条 P3 契约边角，无逻辑错误）

逐行推演要点：

- **端口常量（:69-74）**：`Number(new URL(CHATGPT_PRESET.redirectUri).port)` = Number('1455') = 1455——单一事实源（Step 2 产物 `lib/oauth-credentials.js:50` redirectUri 冻结死值），随 preset 常量冻结，无硬编码重复 ✓（测试 :84 双断言钉住：常量===1455 且 URL.port==='1455'）。边界：redirectUri 若未来无端口 → Number('')=0（临时端口静默监听）——但 preset 冻结 + 测试双断言看护，不可达；P3 不立案。
- **进程级单例与竞态面（:83/:107-109）**：`codexLoopbackActive = new Promise(...)` 在任何 await 之前**同步赋值**——异步并发双调用 starter 时，第二个调用者必然看到非空单例并拿到同一 Promise，**不可能创建两个 server**（JS 单线程 + 同步赋值先行，无竞态窗口）。测试 :110-112 在 resolve 后验证同实例（`again === instance` 引用身份断言，判别力强）；resolve 前的并发双调用无测试但由代码结构闭合（见 F-5 覆盖缺口）。单例赋值时序正确 ✓。
- **EADDRINUSE 降级（:129-138）**：error handler 首行 `codexLoopbackActive = null`（失败不缓存——两个分支均清空，下次调用重新探测 ✓）；EADDRINUSE 分支 warn + `resolve({ready:false, reason:'EADDRINUSE', dispose:noop})` **不抛错** ✓；此路径 `service.codexLoopbackReady` 从未置 true（listen 回调未执行）✓。与其他 error 分支（:136-137）同构 8085 先例（:195-201 逐行比对：同款 if EADDRINUSE → warn+return / else → warn 结构，叠加惰性语义所需的 resolve 与单例清空）✓。
- **listen 成功路径（:139-142）**：`service.codexLoopbackReady = true` + `resolve({ready:true, port: loopback.address().port, dispose})`——port 0 注入时 `address().port` 返回内核分配的临时端口（真实 Node API 语义 ✓）；返回形状含 `ready/reason/port/dispose`，与 Step 4 预期消费形状相符（任务书硬门槛：注入点形状缺 reason 才立案——不缺，不立案）✓。
- **dispose（:121-128）**：`disposed` 闭包锁幂等 ✓；复位 `service.codexLoopbackReady=false` + 清空单例（下次可重启，测试 :123-124 钉住）+ `loopback.close()` ✓。close 不等待完成——异步收敛，测试 :39-50 `untilRefused` 以 2s 轮询窗正确建模（见 F-6 keep-alive 边角）。
- **apply 惰性注入 effect（:216-226）**：effect 体内**只有函数赋值与清理，零监听**——`service.codexLoopbackStarter = () => { started = createCodexLoopback(...); return started }`；清理链 `service.codexLoopbackStarter = null` + `if (started) started.then(i => i.dispose())`——覆盖三态：从未调用（started=null，仅置空 starter ✓）、已就绪（resolve 后 dispose 闭真实例 ✓）、pending 中卸载（resolve 后才 dispose，降级实例 dispose=noop ✓）。清理链完整 ✓。
- **回调分发**：server handler（:110-119）与 8085 先例（:184-193）逐行同构——`handleOauthCallback(service, req, res)` + `.catch` 兜底（headersSent 前写 500 / 否则 destroy）✓。`errorMessage`/`logger` 依赖均已就位（:33 原有 import；logger 经参数注入）。

边界缺口：**F-1（P2）**——listen 成功后的迟发 server 'error'（非 listen 相位）会执行 `codexLoopbackActive = null`（:130）但不 close 旧 server 也不复位 `codexLoopbackReady`：下一次 starter 调用会对仍被自己旧实例占用的 1455 触发 EADDRINUSE（无谓降级）+ ready 标志残留 true。Node 语义下 http.Server 的 'error' 实际只发生于 listen 相位（accept 失败 Node 内部处理不外发），触发面接近不可达，后果有界（降级链本就是设计兜底）——故 P2 而非 P1。修复：error handler 仅在 Promise 未 settle 时清空单例（加 `settled` 标志，与 dispose 的 `disposed` 锁同款）。

契约边角：**F-4（P3）**——`listen()` 以非法端口（如注入 port>65535）会在 Promise executor 内同步 throw → Promise **reject**，与 JSDoc :105 "Promise 只 resolve 不 reject（降级语义体现在结果对象）"声明矛盾。生产不可达（默认恒 1455，合法；port 参数文档明示仅测试注入 port 0），测试亦未触发——文档级修正或 listen 包 try/catch 即闭合。

### 1.2 安全性 — 通过

- **监听面**：绑定 `'127.0.0.1'`（:139）非 0.0.0.0——仅本机回环，与 H3-3（pi-ai 先例 `server.listen(1455, '127.0.0.1')`）及 8085 先例（:202）一致 ✓。
- **敏感数据**：新增代码零 secret——clientId 不在本文件（preset 常量在 Step 2 模块，R2 已审其为公共 client 标识非 secret）；warn 文案只含端口号与固定指引（:132/:136），`errorMessage(error)` 沿用既有脱敏纪律；回调页复用 `handleOauthCallback`（no-store + state 校验经 oauthTokenExchange 的 oauthPending 会话比对——既有安全机制原样继承）✓。
- **注入面**：URL 解析经 `new URL()`（:50，handleOauthCallback 既有）；无 SQL/命令/eval 面；响应固定 HTML 模板。OWASP 关键项对本变更（本机 loopback listener + 既有 handler 复用）无新增暴露。
- **权限**：回调服务无鉴权——与 8085 先例同构（localhost OAuth 回调的标准形态：安全性由 state 随机数 + 单用户本机 + code 一次性语义承载），非新引入面。路径不限（任意 path 均进 handler）——同 8085 先例，缺 code/state 即渲染失败页不触发交换 ✓。

### 1.3 可维护性 — 通过（1 条 P2 声明性发现）

- 注释质量高：模块头三回调路径文档（:14-24）如实记载惰性语义 + 生态占用事实 + Step 4 接线边界；createCodexLoopback JSDoc（:85-106）覆盖参数/返回形状/降级语义/幂等承诺，交叉引用 §3.4/E4/H3-3 逐条核对 roadmap 相符 ✓。
- 命名：`codexLoopbackActive`/`codexLoopbackReady`/`codexLoopbackStarter`/`CODEX_LOOPBACK_PORT` 与既有 `oauthLoopbackReady`（8085 族）形成平行命名族，语义清晰 ✓。
- 函数长度：createCodexLoopback ~38 行（:107-145）< 50 行建议线 ✓；apply 新增 effect 10 行，无膨胀。
- 单职责：index.js 仅承载宿主行组合与回调服务生命周期，OAuth 协议/凭据/账号逻辑零侵入 ✓。
- **F-2（P2）**：`codexLoopbackReady`/`codexLoopbackStarter` 在 `RouterService` 构造器**无声明**（lib/service.js:505-531 通读证实；对比 8085 先例 `oauthLoopbackReady` 在 service.js:519 带注释声明"由 index.js 设置"）——两字段由 index.js 动态创建，读 service.js 者（含 Step 4 的 oauthBegin 实现者）无从发现该契约面。功能无损（undefined falsy 语义正确），但偏离先例声明式风格且 Step 4 即将消费。建议：构造器补两行声明 + JSDoc（与 :518-519 同款），随 Step 4 提交顺手闭合。

### 1.4 性能 — 通过

- **惰性即本步核心性能语义**：apply 仅赋值一个函数引用（:218-221），未发起 ChatGPT 登录前零 socket/零端口/零事件循环开销——`oauthExperimental=false` 时恒零监听 ✓（决策忠实度见 §5）。冷启动路径（apply）无新增 IO。
- 单例防重复 bind：多次 oauthBegin 触发 starter 复用同一监听（:108 早返回），不重复竞争死值端口 ✓。
- 回调路径性能特征与 8085 先例完全同构（同一 handler、同一 server 形态），无新增算法/数据结构面；无 N+1/O(n²)。

### 1.5 测试覆盖 — 通过（20 断言手工清点吻合；1 条 P2 判别力缺口 + 1 条 P3 覆盖缺口）

**计数核实**：tests/oauth-loopback.mjs check() 调用手工逐条清点 = 恰 **20**（§1 常量+惰性 2 + §2 启动 3 + §3 分发 4 + §4 单例 2 + §5 dispose 5 + §6 EADDRINUSE 4）——与自报"20 断言"精确一致 ✓。smoke 624 = 540（EV-029/EV-030 基线）+ 64（R2 手工清点）+ 20（本轮清点）算术自洽 ✓；两套 exit=0 为 Coordinator 复跑证据（本审查未运行，如实标注）。接线执行性核验：smoke.mjs 为顶层线性 ESM（:1759 顶层 await 佐证），:1266/:1267 位于 "apply wiring" 块（:1142-1268，真实 cordis app 启动+dispose 内）无条件顺序执行 ✓。

**判别力抽查（强断言示例）**：
- :111 `again === instance`——单例引用身份证明（非形状比较）；
- :118 + :39-50 `untilRefused`——dispose 后连接拒绝的行为级证明（2s 收敛窗正确建模 close 异步性）；
- :102/:104/:106 `exchanges.length` 计数——error/缺参分支"不触发交换"的否定证明；
- :136 `warns.length === 1 && includes('occupied')`——降级恰一次 warn 且文案可辨识；
- :84 双断言（常量 + URL.port 字符串）——端口推导单一事实源钉住；
- :134 `busy.ready === false && busy.reason === 'EADDRINUSE'`——E4 降级返回形状钉住（Step 4 消费契约）；
- :138 失败后 free port 重启成功——"失败不缓存"行为证明。

**keepAlive:false 论证核验（自报 6）**：**成立**——undici（globalThis.fetch 底层）默认连接池复用 keep-alive socket；`server.close()` 仅停止接受新连接、等待既有连接结束，池内空闲连接可继续完成新请求 → dispose 后请求仍命中存活连接，`untilRefused` 永假 → flaky。`new Agent({keepAlive:false})` 一次性连接（:26）是让 dispose 语义可断言的正确工程选择 ✓。

**覆盖缺口**：
- **F-3（P2）**：:85-86 "lazy default: codexLoopbackReady stays false without explicit start" 是**同义反复断言**——`lazyService` 是测试自建 fixture（:57 显式 `codexLoopbackReady:false`），断言永真、对生产行为零判别力（无论 index.js 是否常驻监听该断言都过）。真正的惰性保证（apply 后不监听 1455 / starter 已注入未调用）无任何自动化看护：若未来回归为 apply 内常驻监听（如 8085 式），且测试机 1455 空闲，现有测试全部照过。建议 Step 4 触及 smoke 时在 apply wiring 块补两断言：`typeof service.codexLoopbackStarter === 'function'` + apply 后 `service.codexLoopbackReady !== true`（前者看护注入点存在性，后者可判别"未启动"状态）。
- **F-5（P3）**：三处未覆盖——① `reason:'ERROR'` 分支（:136-137）无测试（跨平台难稳定构造非 EADDRINUSE listen error，可注入非法 host/port 尝试，但价值有限）；② resolve 前并发双调用 starter（单例竞态由代码结构闭合，测试补强可选）；③ apply effect 清理链（fiber 卸载 dispose 已启动实例）无测试——smoke apply wiring 块 `await app.dispose()`（:1255）实际执行了该清理但零断言。

## 2. 发现列表（P0-P3 + 位置 + 事实 + 建议）

**P0 = 0，P1 = 0，P2 = 3，P3 = 5**。无阻塞项。

| # | 级别 | 位置 | 事实 | 建议 |
|---|---|---|---|---|
| F-1 | P2（边界加固） | lib/index.js:129-138 vs :139-142 | error handler 无条件 `codexLoopbackActive = null`（:130）：若 'error' 在 listen 成功后迟发（Promise 已 settle，resolve 成 no-op），单例被清空但旧 server 未 close、`codexLoopbackReady` 残留 true → 下次 starter 调用对自身旧实例触发 EADDRINUSE（无谓降级走设备码）+ 就绪标志失真。Node 语义下 http.Server 'error' 实为 listen 相位事件（accept 失败内部消化不外发），触发面接近不可达；后果有界（降级链是设计兜底） | error handler 加 `settled` 标志（listen 回调与 error handler 共同维护），仅在未 settle 时清空单例——与 dispose 的 `disposed` 锁同款三行修改。可并入 Step 4 提交或独立 hardening |
| F-2 | P2（声明性/可发现性） | lib/service.js:505-531（构造器无声明） vs lib/index.js:125/:140/:218/:223 | `codexLoopbackReady`/`codexLoopbackStarter` 由 index.js 动态创建，RouterService 构造器零声明——偏离 8085 先例（`oauthLoopbackReady` 在 service.js:518-519 带注释声明"由 index.js 设置"）。Step 4 oauthBegin 实现者读 service.js 无从发现该契约面；undefined-falsy 功能正确但类型面不可见 | 构造器补两行声明 + JSDoc（同 :518-519 风格，注明"惰性启动器/就绪标志，由 index.js 注入，Step 4 oauthBegin 消费"）。随 Step 4 首次消费时顺手闭合 |
| F-3 | P2（测试判别力） | tests/oauth-loopback.mjs:85-86 | "lazy default" 断言作用于测试自建 fixture（:57 置 false），永真、零生产判别力；本步核心设计裁定（惰性）无自动化回归网——常驻监听回归在 1455 空闲的测试机上会静默通过 | Step 4 触及 smoke.mjs 时在 apply wiring 块（smoke.mjs:1142-1268）补：`typeof service.codexLoopbackStarter === 'function'`、apply 后 `service.codexLoopbackReady !== true`。本轮可保留现有断言作占位（无害） |
| F-4 | P3（契约边角） | lib/index.js:105（JSDoc）vs :139 | JSDoc 承诺"Promise 只 resolve 不 reject"；但 `listen()` 对非法端口（如注入 port>65535）在 executor 内同步 throw → Promise reject。生产不可达（默认 1455 恒合法；port 参数文档明示仅测试注入 0） | 文档措辞收窄（"对可达错误面只 resolve"）或 listen 包 try/catch → resolve({ready:false, reason:'ERROR'})。低优先 |
| F-5 | P3（测试缺口） | tests/oauth-loopback.mjs（整体） | 三处未覆盖：reason:'ERROR' 分支；resolve 前并发双调用；apply effect 清理链（smoke :1255 实际执行 dispose 但零断言）——清理链正确性当前仅由代码通读背书（§1.1 推演） | 随 Step 4/后续触及顺带补齐；优先级低于 F-3 |
| F-6 | P3（资源边角） | lib/index.js:127（dispose→close） | `loopback.close()` 不终止 keep-alive 既有连接（未用 Node ≥18.2 `closeAllConnections()`）——持有 keep-alive 连接的客户端（浏览器）可使 server 句柄活过 dispose 直至连接自然结束。与 8085 先例（:207）完全同构，实际影响面 = fiber 卸载瞬间的句柄滞留 | 可选加固：dispose 内先 `loopback.closeAllConnections?.()` 再 close（能力探测，老版本无害）。与 F-1 同批处理即可 |
| F-7 | P3（环境观察项） | lib/index.js:139（绑定 127.0.0.1）vs redirectUri `http://localhost:1455/...`（oauth-credentials.js:50） | 绑定 IPv4 127.0.0.1 而 redirectUri 用 localhost——若浏览器环境将 localhost 解析为 ::1 优先，回调将连不上。**先例一致**（8085 同款 :202；pi-ai/Codex CLI 同绑 127.0.0.1）且 H2 PoC P1 端到端登录实测通过（EV-028），实践已验证 | 不改。记录为观察项：若未来田野反馈回调不可达，再评估 host 覆盖参数（pi-ai `PI_OAUTH_CALLBACK_HOST` 先例）或双栈绑定 |
| F-8 | P3（C4/治理记录观察） | tests/smoke.mjs:9/:1266；docs/architecture/evolution-roadmap-v1.md:261-262 vs .governance/plan-tracker.md:57 | ① 本 commit 同时补上 Step 2 遗留的 credential 测试接线（R2 已明示"smoke 接线=遗留项排期安排"）——commit message 明文 declare（"smoke wiring for credential/loopback tests"），逻辑单元 = "EVO-002 测试接入 smoke"，可辩护非 C4 违反，留此记录溯源；② roadmap §3.4 条目 3 字面"复制 8085 模式"（常驻）与实现的惰性时序差异由 Coordinator 裁定覆盖，plan-tracker:57 已记载"Step 3（1455 loopback 惰性启动）派发中"——建议后续在 decision-log 补一条一行式 DEC 记录（惰性 vs 常驻：生态冲突/kill-switch 纯粹性/热读取机制三理由），免后续审查者困惑 | ①无需动作（已声明）；②Coordinator 便利时补 decision-log 条目 |

## 3. AI 代码专项 5 项结论

| # | 检查项 | 结论 | 事实依据 |
|---|---|---|---|
| 1 | mock 残留 | **通过** | lib/index.js 零 fake/mock/占位/stub（grep 证实；TODO/FIXME/XXX/HACK/debugger 亦零命中）。tests 的 makeFakeService/makeLogger 为显式命名夹具，其注入通道（service/logger/port 参数）正是 JSDoc 文档化的 DI seam（:97-102）——设计的一部分而非 mock 渗漏 |
| 2 | 硬编码返回值 | **通过** | 1455 不在 index.js 硬编码——从 CHATGPT_PRESET.redirectUri 推导（:74，单一事实源，测试 :84 双断言钉住）；`dispose: () => {}` 是降级实例的语义性 noop（无可释放资源）非伪造返回；warn 文案为诊断字符串。无虚构值 |
| 3 | 幻觉 API | **通过** | createServer/listen(port, host, cb)/close/address().port/Agent({keepAlive:false}) 均真实且语义使用正确（listen(0) 后 address().port 取临时端口是标准用法）；pathToFileURL 直跑守卫（:144）与 Step 2 已审同款习惯用法一致；headersSent/writeHead/destroy 均真实 http 标准面 |
| 4 | 未实现 TODO | **通过** | grep 零命中（测试文件 3 处匹配为 "e**xit**" 含 "xit" 子串的误报，非 skip 标记）。注释中 "Step 4/6 接线" 是 plan-tracker 分步计划的显式边界声明（:24/:88/:215），非遗弃标记 |
| 5 | 过度实现 | **通过** | 导出面恰两项（createCodexLoopback + CODEX_LOOPBACK_PORT），消费方 = 测试（已消费）+ Step 4 oauthBegin（注入点）；port 覆盖参数文档明示"仅测试注入 port 0"；无设备码/手动粘贴/oauthBegin 分支的提前实现（grep codexLoopbackStarter 全仓仅 index.js 4 处 = 文档+接线，service.js 零消费 ✓）；reason:'ERROR' 分支由 8085 先例同构性正当化（先例 :200-201 对应物），非镀金 |

## 4. Developer 自报事项核实（不采信自述，逐项对仓库）

| # | 自报 | 核实结果 |
|---|---|---|
| 1 | 断言计数 smoke 624 = 540+64+20；loopback 独立 20/20 exit 0（Coordinator 已复跑） | **20 断言 = 手工逐条清点精确吻合**（§1.5 明细：2+3+4+2+5+4）；624 算术自洽（540 基线 EV-029/030 + 64 R2 清点 + 20 本轮）；接线执行性由 smoke 顶层线性结构 + apply wiring 块位置证实（§0/§1.5）。运行数值 exit=0 属 Coordinator 复跑证据（本审查未运行，如实标注）✓。判别力评估：整体强（身份断言/行为断言/计数断言/文案断言俱全），唯 :86 惰性断言同义反复（F-3） |
| 2 | 进程级单例：多次调用复用同一监听；dispose/失败清空可重试；异步并发双调用不可能双 server | **属实**：:108 早返回 + :109 同步赋值（先于任何 await）——并发双调用第二者必见非空单例拿同一 Promise，双 server 结构性不可能 ✓；:123-124/:130 清空语义 + 测试 :110-112/:123-124/:137-138 三面钉住 ✓。唯一残留：迟发 error 边角（F-1，P2） |
| 3 | EADDRINUSE 不抛错 + reason 返回 + 失败不缓存 | **属实**：:131-134（warn+resolve ready:false reason:'EADDRINUSE' 不 throw）+ :130（错误路径一律清单例 → 重试重新探测，测试 :137-138 行为证实）✓ |
| 4 | dispose 幂等 + fiber 卸载清理（starter 置 null + 已启动实例 dispose） | **属实**：:121-128（disposed 锁 + 标志复位 + 单例清空 + close）；:222-225 清理链三态闭合（未调用/已就绪/pending 中卸载均正确，§1.1 推演）✓。**未经测试断言看护**（F-3/F-5）——代码正确性由通读背书 |
| 5 | 签名无 fetchImpl（loopback 不做网络请求，注入是死参数） | **裁决：合理**——本函数职责是回调 listener（入站连接），出站网络（token 交换）属 service.oauthTokenExchange 既有依赖面（其注入 seam 在 service/Step 2 模块侧）；给 listener 加 fetchImpl 是无消费方的死参数（恰是 AI 专项第 5 项要防的过度实现）。✓ |
| 6 | 测试用 node:http + keepAlive:false（undici 池 keep-alive 会致 dispose 后 flaky） | **论证成立**：undici 连接池复用 socket + `server.close()` 等待既有连接结束 → 池内空闲连接在 dispose 后仍可完成请求，untilRefused 永假。oneShotAgent（:26-36）是正确的可控性选择 ✓（§1.5 核验） |
| 7 | reason:'ERROR' 分支与 8085 先例同构 | **结构属实**：:136-137 vs 先例 :200-201 逐行同构（同款非 EADDRINUSE → warn 结构，叠加惰性所需的 resolve/noop-dispose）✓。该分支无测试（F-5 记录） |
| 8 | smoke.mjs 改动恰 2 hunks（+6/-1 含标注行） | **足迹核实一致**：EVO-002 引用恰收敛于 import 区（:9-10）+ 尾部接线（:1265-1267），无越权改动（grep 全文证实；:77-87 属 Step 1）✓。**精确 ±计数与 hunk 形状未验证**（命令执行禁用）；+6/-1 与足迹自洽（2 import + 1 注释改写 + 2 await + 1 空行 / 1 删）。附注：本 commit 一并接入 Step 2 遗留的 credential 测试接线——R2 已预告该排期、commit message 明示，C4 判定见 F-8 |

## 5. 设计一致性核查（§3.4 条目 3 + §3.2 E4 + §3.1 H3-3 + 惰性裁定忠实度 + 8085 先例同构）

| 基准项 | 要求 | 实现 | 判定 |
|---|---|---|---|
| §3.4 条目 3：EADDRINUSE 静默降级 | 复制 8085 模式的降级语义 | :129-134 与先例 :195-198 同构（code==='EADDRINUSE' → warn + 静默不抛）+ 降级信息升级（文案指明设备流 E4 兜底 + reason 结构化返回供 Step 4 分流） | ✓ |
| §3.4 条目 3：oauthLoopbackReady 同款标志 | 同款就绪标志机制 | service.codexLoopbackReady（listen 成功置 true :140 / dispose 复位 :125 / 失败永不置位）——语义同款；命名平行族 ✓（声明性偏差见 F-2） | ✓（附 F-2） |
| §3.4 条目 3：handler 复用 handleOauthCallback | 回调 handler 复用 :41（现行号 :47-67） | :111 原样复用 + 同款 .catch 兜底（500/destroy） | ✓ |
| §3.4 条目 3：时序（"复制 8085 模式"字面 = apply 内常驻） | —— | **惰性**（Coordinator 裁定，plan-tracker:57 留痕"Step 3（1455 loopback 惰性启动）派发中"）。裁定三理由逐项核验：①生态冲突规避——1455 与 Codex CLI/dsh-codex/yoke233 共用（EV-028 生态事实），常驻 = 未用 ChatGPT 登录也永久占死值端口，与 BC-E5"日常不依赖 1455"精神相反 ✓；②kill-switch §3.6 纯粹性——oauthExperimental=false 时零端口占用，惰性天然满足（常驻则需 settings 联动卸载监听）✓；③热读取机制——service.js:533-541 attach/getState 模式证实无 settings 变更事件信号，常驻+开关同步不可行 ✓。**裁定执行忠实：apply 内零监听，仅函数注入（:216-226）；无任何常驻监听残留** | ✓（裁定忠实；roadmap 字面差异记录 F-8②） |
| §3.2 E4 降级链 | 1455 被占 → 设备码 → 手动粘贴 | 本步交付检测与降级信号：{ready:false, reason:'EADDRINUSE'}（Step 4 据此分流）；注入点返回形状含 reason ✓（任务书硬门槛：形状缺 reason 才立案——不缺） | ✓（Step 4 接线留待下步） |
| §3.1 H3-3：1455 死值 | 端口不可改，从 redirectUri 事实源 | :74 从 CHATGPT_PRESET.redirectUri 解析（零第二事实源）；监听 host '127.0.0.1' 与 H3-3 pi-ai 先例一致；测试 :84 钉住 | ✓ |
| 8085 先例同构性（reason:'ERROR'） | 非 EADDRINUSE listen error 同款处理 | :136-137 vs :200-201 结构同构（自报 7 核实） | ✓ |
| Step 2 依赖衔接 | CHATGPT_PRESET.redirectUri 为端口事实源 | import（:39）+ 推导（:74）单一事实源，无复制粘贴常量 | ✓ |
| Step 4+ 未实现内容 | 不审查/不构成缺陷 | oauthBegin preset 分支/设备码/手动粘贴均未实现（grep codexLoopbackStarter 零 service.js 消费 ✓）；注入点形状 ready/reason/port/dispose 与 Step 4 预期相符 | ✓（无越前实现亦无超前缺陷） |
| P3 既有功能零影响 | 8085 回调路径与既有 OAuth 流不受扰 | 既有代码零行为改动（§0 第四点逐行比对）；新监听不启动则零资源；8085 的 :202 `PUBLIC_OAUTH_CLIENT.redirectPort ?? 8085` 原样 | ✓ |
| C4 commit 纯粹性 | 单 commit 单主题 | reflog :114 单条提交；主题 = Step 3 loopback + EVO-002 测试接线（含 Step 2 遗留接线补账，message 明示——F-8① 记录） | ✓（附观察） |
| C2 无架构腐化 | 进程级单例的取舍 | 模块级变量 + JSDoc :76-82 论证（生产进程单 service 单实例、无跨 service 共享面、Step 4 多次触发复用）——取舍显式化非隐性腐化；测试可注入 port 0 规避单例串扰（各 section dispose 后重启，:116-125 顺序设计自洽） | ✓ |

**原则违反标注：无**（P1 事实：注释引用 §3.4/E4/H3-3/EV-028/BC-E5 逐条核对相符；P2 全面：错误路径成对覆盖（EADDRINUSE/ERROR、dispose 幂等/重启），迟发 error 边角按实际不可达性定级 P2 不构成忽略；P3 零影响：既有路径逐行比对零改动 + smoke 624 全绿零回退；P4 测试看护：20 断言强判别力为主，惰性断言同义反复已立案 F-3 并给出补强路径——保证缺口显式化非无视；P5 泛化：port 参数化 + DI seam 使测试与未来 preset 复用可行，createCodexLoopback 与 8085 逻辑形态平行可对照；P6 质量：交付完整（服务+降级+测试+接线），无凑合面；P7 安全：本机回环绑定 + 零 secret + 既有 handler 安全机制继承；C3 单职责：✓；C4：✓ 附 F-8 观察）。

## 6. 硬门槛自检

| 门槛 | 结果 |
|---|---|
| P0 阻塞数 = 0 | ✓（0） |
| 5 维度全覆盖 | ✓（§1.1-§1.5 逐一有结论） |
| 每条发现标注级别 | ✓（8/8 有 P2/P3 标签 + 位置 + 事实 + 建议） |
| 设计一致性检查完成 | ✓（§5 逐项表：§3.4/E4/H3-3/惰性裁定忠实度/8085 同构五面全核） |
| AI 专项 5 项完成 | ✓（§3 逐一有结论） |
| 事实红线 | ✓（每条结论指向 文件:行号；运行数值未复跑处标注"Coordinator 复跑/本审查未运行"；diff 精确计数与 hunk 形状标注"未验证"；任务书 +263 vs 分项和 264 差异如实记录） |

## 7. 终态结论

# APPROVED_WITH_NOTES

- **unresolved_blockers=0**
- 发现计数：**P0=0 / P1=0 / P2=3 / P3=5**
- 关闭条件判定（SKILL）：P0=0 且 P1=0 → 可合并/进入 Step 4。
- P2 处置建议：F-1（settled 标志防迟发 error 误清单例）与 F-2（构造器声明两字段）均为数行修改，建议随 Step 4 提交顺手闭合（Step 4 是 codexLoopbackStarter 的首个消费方，天然触及面）；F-3（惰性断言补强）绑定 Step 4 的 smoke 触点。三者均不阻塞。
- Coordinator 转发建议：① Step 4 任务书纳入 F-1/F-2/F-3 三项闭合义务与 F-5 可选补测；② R2 F-01/F-02 hardening 项继续随 Step 4/5 排期（本 commit 未触及 oauth-credentials.js，遗留态正确）；③ 便利时在 decision-log 补记"1455 惰性 vs 常驻"裁定一行式条目（F-8②）；④ F-7 作为观察项随 v0.3.0 发布后的用户反馈通道保留。
- 审查局限声明：本审查未执行任何测试/命令（624/20 exit=0 为 Coordinator 复跑证据）；smoke.mjs 精确 diff 计数与 hunk 形状、lib/index.js -1 行的确切原文无法在禁命令前提下验证（以足迹核验 + 结构自洽替代并如实标注）；所有结论基于 HEAD 文件实况 + git refs/reflog 锚点 + 设计基准交叉核对。

---
*审查者：Code Reviewer Agent（EVO-002 Step 3 · R3）· 2026-08-21 · 依据 agents/code-reviewer.md + skills/code-review/SKILL.md + evolution-roadmap-v1.md（§3.1 H3-3 / §3.2 E4 / §3.4 / §3.6 / §8 BC-E5）+ .governance/project-principles.md（P-v1）+ plan-tracker:57（惰性启动裁定留痕）+ R1/R2 报告（前轮引用与遗留项对账）*
