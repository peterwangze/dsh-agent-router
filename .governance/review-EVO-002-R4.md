# Code Review 报告 — EVO-002 Step 4a（凭据模块加固：R2 F-01/F-02 返工闭合）

| 项 | 值 |
|---|---|
| Task | EVO-002（v0.3.0 C-1 ChatGPT 订阅 OAuth 实施）· Step 4a / ~7（R2 P2×2 hardening 单元） |
| Round | **R4**（返工闭合型复审。**前轮 R2 引用（finding 闭合源）**：`.governance/review-EVO-002-R2.md`——F-01（P2，refresh 无超时 + 锁误删继任者）/ F-02（P2，锁元数据写失败不清理）。R3 链：R1 = Step 1 schemas（APPROVED_WITH_NOTES）、R2 = Step 2 凭据模块（APPROVED_WITH_NOTES，P2×2 转 hardening）、R3 = Step 3 loopback（APPROVED_WITH_NOTES，本 commit 前一轮，非本单元审查对象）。本轮按 M7.4 复审协议：逐条比对 R2 findings 标注"已修复/未修复/新引入" |
| 审查对象 | commit `a2567db06aef17d0e3e8704a8f46bea716fefba2`（main HEAD，已核实 `.git/refs/heads/main` = 该 hash） |
| 变更集 | lib/oauth-credentials.js（471→545 行，net +74）、tests/oauth-credentials.mjs（274→335 行，net +61）——两文件，与任务书范围一致（±精确计数见 §0 未验证项） |
| 审查者声明 | Code Reviewer Agent（独立于 Developer）；只读审查产品代码与测试，未修改产品代码、未执行任何测试/命令（oauth-credentials 75 断言 + smoke 635 断言 exit=0 已由 Coordinator 独立复跑提供；本审查做静态核验与逻辑推演，运行数值如实标注）；已全文加载 agents/code-reviewer.md 与 skills/code-review/SKILL.md |
| 审查范围 | 仅该 commit 引入内容。Step 4b 授权流 preset 分支 / R3 遗留项（F-1 settled 标志、F-2 构造器声明、F-3 惰性断言补强）**不构成本轮缺陷**（未在本 commit 触及，C4 纯粹性要求不在此修） |

---

## 0. 审查方式与锚点核实（命令执行禁用，HEAD 状态即 diff 等效审查面）

- HEAD 锚点：`.git/refs/heads/main` = `a2567db06aef17d0e3e8704a8f46bea716fefba2` ✓。
- 提交链锚点：`.git/logs/HEAD` 第 115 行（末行）——`128cb810` → `a2567db`，message "EVO-002 Step 4a: credential hardening — refresh timeout + lock ownership + lock-failure cleanup (R2 F-01/F-02)"，128cb810（R3 已审）之后恰此一次提交 ✓（C4 单 commit 单主题坐实：主题 = R2 F-01/F-02 闭合 hardening）。
- 因此 HEAD 状态即 commit 状态：两文件全文逐行通读（545 + 335 行），与 R2 报告逐行记载的旧态（行号 + 内容描述）比对重建语义 diff，等效 diff 审查。重建结果：变更恰收敛于 REFRESH_TIMEOUT_MS 常量块（:76-83）、REFRESH_FAILED 码注释扩充（:94-96）、refreshCredential 三参化 + AbortController/reffed timer/超时分支（:215-245）、构造器 lockToken + writeLockMeta seam（:300-303）、ensureFresh opts.timeoutMs（:434-435/:443）、withLock 元数据 token 化 + 失败清理（:486-500）、finally → releaseLockIfOwned（:522-544）、头注释/JSDoc 更新、测试 +11 断言（:64 + :201-219 + :268-287 + :289-303）与 import/头注释改写。read/write/delete/accountIdFromJwt/redact/路径解析等其余面与 R2 记载逐行一致（零改动）✓。
- 计数对账：任务书总额 +153/-18 → net +135 = 74（lib）+ 61（tests）与行数事实精确自洽 ✓；任务书分项"lib（+106/-18）"→ net +88 与实际 net +74 不符——判定为任务书转录级差异（与 R3 §0 的 +263/264 差 1 同类），以仓库为准，不影响任何结论。**精确 ±计数与 hunk 形状未验证**（命令执行禁用，无法 git diff）。
- 消费面核验：REFRESH_TIMEOUT_MS 全仓消费点 = lib 内部 + tests（import :22）；grep 证实 lib/ 其他模块与 service.js 零消费（service.js 的 `timedOut` 命中为既有 CLI runner 子进程超时的同名独立模式，无耦合）。smoke.mjs 接线原样（:9 import / :1266 await，Step 3 已审），断言计数经共享 check() 自动更新。

## 1. R2 Findings 闭合验证表（M7.4 复审协议核心）

| R2 Finding | 验证点 | 闭合判定 |
|---|---|---|
| **F-01a refresh 无超时** | ① timer 接线：`setTimeout(() => controller.abort(), ms)`（:226，reffed）+ signal 经 init 传入 fetch（:229-234 spread）；② clearTimeout 落定即清（:243-245 finally 覆盖成功/网络错/超时三态）；③ timedOut 标记 + message 固定格式（:238-240——`刷新请求超时（timeout after ${ms}ms…）`不含底层中止错误文本、不含 token 值）；④ 默认 25s（:83）落在 R2 建议区间 15-30s 且严格 < 陈旧窗 30s（:74），测试 :64 双断言钉住（值 + 不等式）；⑤ opts.timeoutMs 注入链完整（ensureFresh :434-435 校验正有限数 → :443 第三参传入 refreshCredential :221 兜底缺省/非法）；⑥ 判定用 `controller.signal.aborted` 而非比对 error 名称（对注入 fetch 的错误形状鲁棒，:236-241） | **已修复**（证据如上；测试 :201-219 五断言：timedOut 标记 / 消息含 timeout 且无 token 值 / signal instanceof AbortSignal 接线证明 / 锁已释放 / 后续立即可用）。**残留**：超时仅覆盖 fetchImpl await（headers 相位），`response.json()` body 相位 timer 已清、无界（undici bodyTimeout 默认 ~300s ≫ 30s）——headers-后-stall 的服务器/代理可持锁越窗；后果仍受 F-01b token 释放校验 + rotating 宽限自愈界定（R2 F-01 后果分析继续适用）→ 立案 **R4-F1（P3）**，不构成"未修复"（主因——headers 相位挂起——已消除，R2 引用的暴露形态即 undici headersTimeout 300s） |
| **F-01b 误删继任者锁** | ① releaseLockIfOwned（:534-544）：重读锁文件 → JSON.parse → **仅 `meta.token === this.lockToken` 才 unlink**；② 保守跳过路径：读取/解析失败（含文件已不在）→ 直接 return 不删（:536-540 catch）；meta 非对象/无 token → 不删（:541 条件合取）；③ 锁元数据 token 化：`{pid, at, token}`（:488），token = 实例级 `randomBytes(8).toString('hex')`（:302）；④ finally 释放链：`try { return await fn() } finally { this.releaseLockIfOwned(lockPath) }`（:522-526）——fn 抛错也释放、释放不吞原始错误；⑤ 测试判别力：同 pid（`process.pid`）不同 token（'successor-instance-token'）场景（tests:275-278）——比不同 pid 更强：跨 pid 场景 pid 检查与 token 检查均可通过（无区分力），同 pid 场景**只有实例级 token 实现能通过**（pid-only 实现会把继任者锁误判己方而误删 → 断言 :286 失败），恰好钉住 BC-E6 ③ 多实例判别点 | **已修复**（证据如上）。残留 TOCTOU 微窗（read 匹配 → unlink 之间继任者重建）由 25s<30s 时间分区压缩至实际不可达（见 §5 裁决 1 边界推演），token 检查为纵深防御 |
| **F-02 元数据失败不清理** | ① catch → finally closeSync(fd)（:491-493）→ `unlinkSync(lockPath)` 尽力清理（:497）→ 抛 `CREDENTIAL_FILE_UNWRITABLE`（:498）；② 失败先于网络：throw 位于 withLock 循环内 `break` 之前、`await fn()`（:522-523）之前——锁获取失败不可能触发 refresh；③ 码表预留语义核实：UNWRITABLE 注释"凭据文件（或锁文件/目录）写入/删除失败"（:98-99）明确覆盖锁文件写失败，且 R2 时代 withLock 的 mkdir/锁创建失败已同用 UNWRITABLE（:470-474/:502-503）——同族先例，映射无新码；④ 清理失败残留兜底 = 陈旧接管（注释 :496 明示）；⑤ 测试：`metaFetchCalls === 0`（失败先于网络的行为证明）+ 锁文件不存在（清理证明）+ 新 Store 立即重试成功（无 ≤30s 毒化窗口证明）（tests:300-303） | **已修复**（证据如上；经构造器 `writeLockMeta` 注入钩子确定性模拟 ENOSPC——裁决见 §5-4） |
| **回归面** | ① 既有 64 断言零放松：逐条对账 R2 §1.5 清单——常量 4（:51/:58/:62/:63）、存取面 5、corrupt 9案×2、写拒绝/删除/残留/权限 5、JWT 5、ensureFresh 14（含 :147 引用身份断言、:157 恰一次计数、:162 窗口不等式）、并发/锁 7（:237-239 并发单刷、:250-251 锁超时、:265-266 陈旧接管语义全保持）、路径 6——全部在位且内容零改动（旧测试代码仅 import 行 + 头注释改写，均非断言）；② 计数清点：静态 `check(` 调用点 60 = 56 无条件 + 2 循环内（×9 案例 = 18 次执行）+ 2 平台条件（每平台恰执行 1）→ **执行断言恰 75** = 64 + 11 ✓；③ smoke 635 = 624（Step 3 基线）+ 11 算术自洽，接线执行性由 smoke 顶层线性结构 + :1266 位置证实；④ 75/635 exit=0 为 Coordinator 复跑证据（本审查未运行，如实标注） | **通过**（零放松 + 零回退坐实） |
| **新引入风险** | ① P7 消息面：超时消息固定格式不内联中止错误文本与 token 值（:238，测试 :215 否定断言）；元数据失败消息只含 basename + fs 错误文本（:498——fs 错误不携带凭据值，与 write() 失败路径先例同构）；lockToken 不进任何 Error message、只进 0o600 锁文件（token 为实例随机 id 非凭据）；② reffed timer 泄漏推演：全部落定路径 finally 必 clear → 无唤醒源残留；唯一保持 reffed 场景 = 非协作注入 fetch 永不落定（await 本身未决、进程卡在临界区——协作式前提已文档化 :210-212），非 timer 新增阻塞；③ 实例 token 攻击面：私有不导出、64-bit 随机碰撞可忽略 | **无阻塞项**；非阻塞观察 4 条 P3（§3 R4-F1~F4） |

## 2. 五维度逐项结论

### 2.1 正确性 — 通过（0 阻塞；1 条 P3 残留边界 + 1 条 P3 降级分支）

- **超时路径控制流**（:215-245）：try/catch/finally 三态闭合——成功（timer 清后继续响应校验）、网络错误（signal 未 abort → REFRESH_FAILED + errorMessage，经 ensureFresh redactError 脱敏）、超时（signal.aborted → 固定格式消息 + timedOut=true）。`controller.signal.aborted` 判定对注入 fetch 错误形状鲁棒（不依赖 undici 特定错误名）；网络错误与超时几乎同时发生的 race 下可能把网络错误误标 timedOut——两者均 REFRESH_FAILED 且均无 status（Step 5 消费语义同域：瞬态可重试），误标无行为后果，不立案。
- **25s<30s 时间分区**：持锁时长上界 ≈ refresh 超时（≤25s）+ write（<1KB 同步写，ms 级）< 30s 陈旧窗 → 释放先于任何等待者的接管资格（mtime > 30s 才可接管），F-01 的临界区重叠主因被时间分区消除；token 校验降级为纵深防御。边界推演见 §5 裁决 1。
- **锁生命周期**（:477-526）：wx 创建 → 元数据写入（失败即清理+UNWRITABLE）→ break 进入临界区 → finally releaseLockIfOwned（token 匹配才删、读/解析失败保守跳过、unlink 尽力而为）。陈旧接管/超时判定/50ms 轮询与 R2 逐行一致（零语义改动，:502-520）。
- **残留缺口**：`response.json()`（:255-260）在 timer 清除之后执行——body 相位无超时界（undici bodyTimeout 默认 ~300s ≫ 30s 陈旧窗），headers-后-stall 形态可持锁越窗触发接管重叠；后果 = R2 F-01 已界定的有界自愈（rotating 宽限 + last-write-wins + token 校验防误删继任者锁），且触发面从"任何挂起"收窄为"headers 已达而 body 停滞"——**R4-F1（P3）**。修法低成本：clearTimeout 移至 payload 解析后（undici abort 会 reject 进行中的 body 读取，覆盖面即完整）。
- **降级分支**：`typeof AbortController !== 'undefined'` 守卫（:225）在无 AbortController 环境静默失去全部超时保证（无 signal、无 timer）——宿主 Node ≥18（fetch 与 AbortController 同在）下不可达，但与模块自身 fail-loud 风格（:429-431 fetch 不可用即报错）不一致——**R4-F2（P3）**。

### 2.2 安全性 — 通过（本单元核心原则 P7 逐面核验）

- **敏感数据**：新增两条错误路径消息均不含 access/refresh 值——超时消息为纯固定模板（:238）；元数据失败消息内联的 errorMessage(metaError) 为 fs 级错误（ENOSPC 等），不携带凭据，且与 write() 既有失败路径（:374/:381 等）同构先例。测试否定断言双看护（:215 超时消息、:251 锁超时消息——顺带覆盖）。lockToken 为实例随机 id 非凭据，仅入 0o600 锁文件（:481/:488），不入消息不入文档。
- **注入面**：无新输入面；writeLockMeta seam 接收 fd+string 透传（:488），无法借它绕过校验（元数据非凭据文档）。
- **DoS/资源**：reffed timer 全落定路径即清（:243-245）——无唤醒源泄漏、不阻塞进程退出（推演：若进程要退出，必先脱离 await，脱离即经 finally clear；卡死场景由非协作 fetch 前提文档化）。
- **原子性/锁安全（P7 数据不损坏）**：锁误删防护使"第三进入者并发双写"窗口收窄至 TOCTOU 微窗且被时间分区压制；元数据失败清理消除毒化窗口——两项均直接降低凭据文档损坏/竞态面。write() 原子写路径零改动。

### 2.3 可维护性 — 通过（1 条 P3 函数长度）

- 注释/文档质量高且与实现精确同步：常量块 JSDoc（:76-83）记载 25s<30s 理由与注入通道；refreshCredential JSDoc（:202-214）记载协作式超时前提与消息纪律；withLock JSDoc（:456-467）与 releaseLockIfOwned JSDoc（:529-533）逐条交叉引用 R2 F-01b/F-02/BC-E6 ③/陈旧接管兜底——审查者可从注释直接溯源设计依据（P1 友好）。
- 命名：releaseLockIfOwned / lockToken / writeLockMeta / REFRESH_TIMEOUT_MS / timedOut 语义精确；timedOut 与 service.js CLI runner 既有同名模式（service.js:1386-1434）形成跨模块一致的元数据命名族（grep 证实，非耦合而是风格一致）。
- **R4-F3（P3）**：refreshCredential 69 行（:215-283）、withLock 59 行（:468-527）超 SKILL 维度 3-2 的 50 行建议线（R2 时代 ~54/~50 的自然增长）。阶段分明可读、不阻塞；建议后续触及时提取 validateRefreshResponse 辅助。
- 头注释设计事实段如实更新（:10-14 记载三项加固与 R2 F-01/F-02 溯源）✓。

### 2.4 性能 — 通过

- 热路径零改动：ensureFresh 快路径（:426，剩余 >120s 原引用零网络返回）原样，:147 身份断言继续钉住。
- 每次 refresh 增加一个 timer 创建/清除（低频操作，ns-µs 级）；releaseLockIfOwned 增加一次锁文件重读（<100B 同步读，低频）。无新算法/数据结构面，无 N+1/O(n²)。

### 2.5 测试覆盖 — 通过（75 断言手工清点吻合；11 条新增判别力强）

- **计数**：执行断言恰 75（§1 回归面清点明细：56 无条件 + 18 循环 + 1 平台分支），= R2 的 64 + 11 新增 ✓；smoke 635 = 624 + 11 算术自洽 ✓；75/635 exit=0 属 Coordinator 复跑证据（本审查未运行，如实标注）。
- **新增 11 条判别力抽查（强断言）**：:64 常量值 + 与陈旧窗不等式双钉；:214 `timedOut === true`（标记存在性）；:216 `sawSignal instanceof AbortSignal`（signal 真实接线证明——防"常量存在但未接线"的空修复）；:217 锁文件不存在（释放证明）；:219 立即重试成功（无残留持有证明）；:286 `successorLock === successorMeta` 全文相等（非仅存在性——若被误删/改写均失败，且空串兜底使"文件没了"也判 FAIL）；:301 `metaFetchCalls === 0`（失败先于网络的计数证明）+ 锁文件不存在双合取；:303 新 Store 立即成功。
- **覆盖缺口（P3 级，不阻塞）**：① body 相位超时（R4-F1 对应路径）无测试——修复时顺带补 hang-then-stall-json 用例；② releaseLockIfOwned 的 ENOENT/解析失败保守跳过分支无直接测试（间接被 :286 的反面覆盖一半）；③ R2 F-08②③（锁内 CORRUPT 传播、REFRESH_MARGIN_MS 恰边界）仍未补（遗留态正确——本 commit 未触及）。**R2 F-08① 的锁文件分支被本单元闭合**（:300 UNWRITABLE 直测经注入钩子，跨平台确定性）。

## 3. 发现列表（P0-P3 + 位置 + 事实 + 建议）

**P0 = 0，P1 = 0，P2 = 0，P3 = 4**。无阻塞项。

| # | 级别 | 位置 | 事实 | 建议 |
|---|---|---|---|---|
| R4-F1 | P3（残留边界） | lib/oauth-credentials.js:243-245（clearTimeout 绑定于 fetchImpl await）vs :255-260（response.json() 无界） | 超时仅覆盖 headers 相位：fetchImpl 落定即清 timer，body 读取无中止源（生产 undici bodyTimeout 默认 ~300s ≫ 30s 陈旧窗）。headers-后-stall（坏代理/病态服务器）可持锁越窗 → 接管重叠 → 双刷新（R2 F-01 已界定后果：rotating 宽限 + last-write-wins 自愈 + token 校验防误删，最坏引导重登）。头注释"从主因上消除临界区重叠"（:79-80）与 JSDoc"必然先超时失败并释放锁"（:77-78）对该形态略有过述 | clearTimeout 移至 payload 解析后（undici abort reject 进行中 body 读取，覆盖即完整；对注入 fetch 无害——其 json 为测试自有实现）。两行改动，建议随 Step 4b/5 触及本模块时顺带闭合并补 hang-json 测试 |
| R4-F2 | P3（降级分支风格） | lib/oauth-credentials.js:225-226、:233 | `typeof AbortController !== 'undefined'` 守卫：无 AbortController 的环境静默退化为无 signal/无 timer/无超时——F-01a 保证无声失效。宿主 Node ≥18（globalThis.fetch 所在基线，:429-431 已按此 fail-loud）下 AbortController 必在，实际不可达；但守卫语义与模块 fail-loud 风格（fetch 不可用即明确报错）不对称 | 删守卫直用（宿主基线 Node ≥18 已隐含），或该分支改为明确报错。一行级改动，随手闭合 |
| R4-F3 | P3（函数长度） | lib/oauth-credentials.js:215-283（refreshCredential 69 行）、:468-527（withLock 59 行） | 两函数超 SKILL 维度 3-2 建议线 50 行（本 commit 新增逻辑的自然增长，R2 时代 ~54/~50）。阶段分明（请求构造/超时/响应校验/凭据组装），可读性未实际受损 | 后续触及本模块时提取 validateRefreshResponse(payload) 辅助；非本轮义务 |
| R4-F4 | P3（文档 vs 强制） | lib/oauth-credentials.js:434-435（opts.timeoutMs 仅校验正有限数）vs :416-421 JSDoc"须 < CREDENTIAL_LOCK_STALE_MS" | JSDoc 用"须 <"表述不变量，但无运行时 clamp/断言——注入 >30s 值会静默破坏 25s<30s 时间分区（回到仅 token 校验防线，TOCTOU 竞窗复活，见裁决 1 边界推演）。现消费面 = 测试提速注入（50ms）与缺省，风险低 | 可选：debug 断言 `refreshTimeoutMs < CREDENTIAL_LOCK_STALE_MS` 或 clamp 至陈旧窗内；或在 JSDoc 措辞降级为"建议 <"以对齐实际强度。观察级 |

## 4. AI 代码专项 5 项结论

| # | 检查项 | 结论 | 事实依据 |
|---|---|---|---|
| 1 | mock 残留 | **通过** | lib 零 fake/mock/stub/占位（grep 本轮复扫零命中，含 TODO/FIXME/XXX/HACK/debugger/console.）。tests 的 hangFetch（:207-211）为显式命名的行为模拟夹具且注释声明"模拟 undici 行为：尊重 init.signal"——正是协作式超时的前提建模；writeLockMeta 注入为文档化 seam（见 §5 裁决 4）。非 mock 渗漏 |
| 2 | 硬编码返回值 | **通过** | 25_000 为导出设计常量（:83），落在 R2 建议区间 15-30s，取值理由（< 陈旧窗 5s 余量）在 JSDoc 论证；测试 :64 值+关系双钉。超时消息固定模板非虚构数据。timedOut/status 为布尔/数值元数据非编造返回 |
| 3 | 幻觉 API | **通过** | AbortController/AbortSignal/controller.signal.aborted/signal 入 fetch init（WHATWG fetch 标准面，undici 完整支持——abort reject 进行中请求）/setTimeout-clearTimeout/randomBytes(8).toString('hex') 均真实且语义使用正确；writeSync(fd, string) 为 node:fs 真实签名（:37 import 在位） |
| 4 | 未实现 TODO | **通过** | grep 零命中（本轮复扫）。注释中 R2 F-01/F-02/Step 4b 等为治理链显式溯源引用，非遗弃标记 |
| 5 | 过度实现 | **通过** | 新增面逐项有消费方与依据：REFRESH_TIMEOUT_MS（测试 :64 消费 + 内部缺省 + Step 5 潜在消费）；timedOut 元数据（JSDoc :94-96/:207-209 + 测试 :214 + service.js CLI runner 同名命名族先例）；writeLockMeta seam（F-02 测试 :292 消费——跨平台确定性故障注入的唯一可行通道）；lockToken 私有不导出。无提前实现 Step 4b 内容（grep 证实 service.js 零新消费点） |

## 5. Developer 自报设计偏离/选型裁决（4 项重点裁决）

| # | 事项 | 裁决 | 依据 |
|---|---|---|---|
| 1 | 超时默认 25s 而非任务书示例 30s | **正确（优于示例）** | 核心论断成立：25s 严格 < 陈旧窗 30s ⇒ 持锁上界（refresh ≤25s + write ε）< 接管资格线（mtime >30s），释放必然先于接管，F-01b 的 token 校验成为纵深防御而非唯一防线。**边界推演（若相等 30s=30s）**：释放与接管资格同时到期，50ms 轮询粒度下可交错——等待者 unlink+重建（持锁者 release 读到继任 token，跳过删除，token 校验救场）；但 read→unlink 微窗 TOCTOU 仍可误删继任者锁（read 于 t+30.01s 见己方旧 token、unlink 于 t+30.03s 删掉继任者新锁）→ 第三进入者 → 退回 R2 F-01 场景。即相等时正确性从"时间分区保证"退化为"微窗竞态赌注"——25s 的 5s 余量正是消除该赌注，**偏离示例是正确工程判断**。测试 :64 将不变量（< 而非 ≤）钉入回归网 |
| 2 | reffed timer + AbortController 替代 AbortSignal.timeout() | **接受（技术论断可信，未验证；工程选择无条件成立）** | 论断自洽性：Node 语义上 AbortSignal.timeout 的内部计时器确为 unref 设计（避免延长进程寿命）——空事件循环下 abort 回调不触发、进程先行退出；"exit 13"与 Node 未决顶层 await 的退出码语义吻合，最小探针形态（await 一个监听 abort 的 promise）自洽。**未验证**：本审查禁命令，无法复现 Node 24.13.1 探针——按事实红线标注。工程裁决无论论断真假均无损：生产路径 fetch 挂起 I/O 本身保活事件循环（unref 与否等效），reffed timer 仅对注入/空转场景提供超时确定性；且落定即 clear（:243-245）使 reffed 无泄漏无退出阻塞（§2.2 推演）。即使 AbortSignal.timeout 无 unref 问题，本实现亦等价正确——选择稳健 |
| 3 | 锁所有权用实例级 token（randomBytes(8) hex）而非仅 pid | **合理（判别力必需）** | BC-E6 ③ 同插件多 profile 场景 = 同进程多 Store 实例共享 process.pid——pid-only 校验在该场景把继任者锁误判己方（F-01b 缺口的同进程变体，恰是本项目真实并发形态）。64-bit 随机 token 实例唯一（碰撞 ~2⁻⁶⁴ 可忽略）。测试用**同 pid 不同 token**（tests:275-278）构造——判别力分析：跨 pid 场景 pid 实现与 token 实现都能通过（无区分力），同 pid 场景只有 token 实现能过（pid 实现误删 → :286 失败）——**强于跨 pid 测试**的声称属实。token 私有不导出、不入消息（P7 面无扩大，token 非凭据） |
| 4 | F-02 测试经构造器 options.writeLockMeta 注入钩子 | **合理（文档化注入选项，非测试后门）** | 四点核验：① 构造器 JSDoc :290-294 文档化并明示"仅测试注入用——确定性模拟元数据写失败路径"；② 缺省真实 writeSync（:303），生产路径零改变；③ 与 Step 2 已有注入族 fetchImpl/env/home 先例同构（同一构造器 options 对象、同一文档模式、R2 §3-1 已裁定该族为设计一部分）；④ 解决跨平台确定性难题——R2 F-08① 明承 UNWRITABLE 无直测（目录只读法在 Windows/admin/ACL 下不可靠），本 seam 是该缺口的唯一确定性闭合通道。后门判别：替换面窄（仅锁元数据写入，fd+string 透传），无法借它影响凭据校验/网络/落盘语义。附注（P3 级观察，不立案）：构造器注入项已 4 个（fetchImpl/env/home/writeLockMeta），未来再加应考虑收敛为单一 testSeam 聚合对象 |

## 6. 自报核实汇总（不采信自述，逐项对仓库）

| # | 自报 | 核实结果 |
|---|---|---|
| 1 | 超时默认 25s（< 陈旧窗，优于任务书示例 30s） | **属实**（:83/:74）且**裁决正确**（§5-1 含边界推演） |
| 2 | reffed timer 替代 AbortSignal.timeout（unref 论断 + 探针 exit 13） | **实现属实**（:222-226 注释与代码一致）；**论断可信但未验证**（禁命令无法复现探针；Node 语义与自洽性评估见 §5-2）；裁决接受 |
| 3 | 实例级 token + 同 pid 不同 token 测试 | **属实**（:302/:488 + tests:275-278）且**裁决合理**（§5-3） |
| 4 | writeLockMeta 注入钩子（缺省真实 writeSync） | **属实**（:303 + tests:292）且**裁决合理**（§5-4） |
| 5 | （隐含）断言计数 75 / smoke 635 | **75 = 手工清点精确吻合**（60 静态点 = 56 无条件 + 2 循环×9 + 2 平台取 1）；635 = 624+11 算术自洽；exit=0 属 Coordinator 复跑证据（本审查未运行）✓ |

## 7. 设计一致性核查 + 原则违反标注

| 基准项 | 要求 | 实现 | 判定 |
|---|---|---|---|
| §3.3 封闭 4 码集（roadmap:246-248） | 恰 4 码，加法元数据不得破坏封闭语义 | :89-100 freeze 表零增删；timedOut 与 status 同为加法元数据（R2 F-04 先例），JSDoc 明示"封闭码集不变，仍是 REFRESH_FAILED 域" | ✓ |
| §3.3 P7 安全边界（roadmap:248-250） | 诊断永不回传 token 值 | 新消息面全覆盖（§2.2）；测试否定断言 :215/:251 看护 | ✓ |
| ADR-005 E3-a | 原子写 + 文件锁 + 严格校验 + 整文档重写 | 本 commit 仅加固锁生命周期与刷新上界，四语义零回退（write/read/ensureFresh 主干与 R2 逐行一致） | ✓ |
| BC-E6 ③ | 同插件多 profile 并发串行化 | 实例 token 使所有权判定精确到实例（多实例同 pid 场景闭合） | ✓（强化） |
| C4 commit 纯粹性 | 单 commit 单主题 | reflog :115 单条提交；主题 = R2 F-01/F-02 hardening；两文件范围与任务书一致 | ✓ |
| P6/C2 零新依赖 | 无新运行时依赖 | randomBytes 为既有 import（R2 已用于 temp 名）；node:fs writeSync 新增入 import 列表（内建） | ✓ |
| 审查驱动加固的越权检查 | roadmap 未规定 refresh 超时 | R2 findings 的修复义务 + 头注释如实记载来源（:13）；实现自由度内（常量可调、行为加严不改变接口形状） | ✓ 非越权 |

**原则违反标注：无**（P1：unref 论断未验证处如实标注，未编造；P2：两项 P2 逐条闭合验证 + 残留缺口立案 R4-F1 不忽略；P3：64 断言逐条对账零放松 + smoke 635 零回退；P4：+11 断言看护三项修复（标记/接线/释放/重试全覆盖）；P5：token 机制对同进程/跨进程统一泛化、writeLockMeta 与注入族同构；P6：交付完整（修复+文档+测试三同步）；P7：消息面/锁文件/超时三面核验无凭据暴露，锁安全直接增强；C1：timedOut 命名与既有命名族一致；C2：无腐化（seam 收敛观察已附注）；C3：模块职责未变；C4：✓）。

## 8. 硬门槛自检

| 门槛 | 结果 |
|---|---|
| P0 阻塞数 = 0 | ✓（0） |
| 5 维度全覆盖 | ✓（§2.1-2.5 逐一有结论） |
| 每条发现标注级别 | ✓（4/4 有 P3 标签 + 位置 + 事实 + 建议） |
| 设计一致性检查完成 | ✓（§7 逐项表：封闭码集/P7/E3-a/BC-E6 ③/C4/P6/C2/越权检查八面全核） |
| AI 专项 5 项完成 | ✓（§4 逐一有结论） |
| 复审协议（M7.4） | ✓（R2 findings 逐条"已修复（证据）/部分修复/未修复 + 新引入"标注于 §1；round=R4 头部声明 + R2/R3 链引用；无 BLOCKING 不触发熔断） |
| 事实红线 | ✓（每条结论指向文件:行号；运行数值标注"Coordinator 复跑/本审查未运行"；diff 精确 ±计数与 hunk 形状、Node unref 探针两处标注"未验证"；任务书 +106/-18 转录差异如实记录） |

## 9. 终态结论

# APPROVED_WITH_NOTES

- **unresolved_blockers=0**
- 发现计数：**P0=0 / P1=0 / P2=0 / P3=4**
- **R2 findings 闭合状态**：F-01（含 a/b 两面）**已修复**（残留 body 相位超时盲区立案 R4-F1，P3，主因已消除不构成部分修复）；F-02 **已修复**。R2 P2 存量清零。
- 关闭条件判定（SKILL）：P0=0 且 P1=0 → 可合并/进入 Step 4b。
- P3 处置建议：R4-F1（clearTimeout 移至 payload 解析后，两行）与 R4-F2（AbortController 守卫改 fail-loud 或删除，一行）建议随 Step 4b/5 首次触及本模块时顺带闭合并补 hang-json 用例；R4-F3/R4-F4 观察级，无排期压力。
- Coordinator 转发建议：① R2 F-08②③ 测试缺口维持遗留台账（本 commit 正当地未处理）；② R3 F-1/F-2/F-3（settled 标志/构造器声明/惰性断言）绑定 Step 4b 的义务不变（本 commit 未触及 index.js/service.js，遗留态正确）；③ 可在 Step 5 任务书预留 `error.timedOut` 消费语义（与 error.status 并列：超时属瞬态可重试域）。
- 审查局限声明：本审查未执行任何测试/命令（75/635 exit=0 为 Coordinator 复跑证据）；精确 diff ±计数与 hunk 形状、Node AbortSignal.timeout unref 探针两处标注**未验证**（以 net 行数对账 + 足迹核验 + 语义重建 + Node 语义推演替代）；所有结论基于 HEAD 文件实况 + git refs/reflog 锚点 + R2/R3 报告逐行对账 + 设计基准交叉核对。

---
*审查者：Code Reviewer Agent（EVO-002 Step 4a · R4）· 2026-08-21 · 依据 agents/code-reviewer.md + skills/code-review/SKILL.md（M7.4 复审协议）+ evolution-roadmap-v1.md §3.3（:215-250）+ .governance/project-principles.md（P-v1）+ .governance/review-EVO-002-R2.md（finding 闭合源）+ review-EVO-002-R3.md（前轮链）+ plan-tracker:57*
