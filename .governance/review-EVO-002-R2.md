# Code Review 报告 — EVO-002 Step 2（lib/oauth-credentials.js 凭据模块）

| 项 | 值 |
|---|---|
| Task | EVO-002（v0.3.0 C-1 ChatGPT 订阅 OAuth 实施）· Step 2 / ~7 |
| Round | **R2**（前轮引用：R1 = Step 1 schemas 审查，终态 APPROVED_WITH_NOTES，见 `.governance/review-EVO-002-R1.md`；本轮为新切片首审，非 R1 返工复审） |
| 审查对象 | commit `8ba6ab18b86f614c1c099b7e7689aa62496e1eb9`（main HEAD，已核实 `.git/refs/heads/main` = 该 hash） |
| 变更集 | lib/oauth-credentials.js（新，471 行）、tests/oauth-credentials.mjs（新，274 行）、package.json（files 数组 +1 行 `lib/oauth-credentials.js`）——共 3 文件 746 行插入，与任务书一致 |
| 审查者声明 | Code Reviewer Agent（独立于 Developer）；只读审查，未修改产品代码，未执行测试/命令（两套测试 exit=0 已由 Coordinator 独立复跑提供；本审查做静态核验与逻辑推演）；已加载 agents/code-reviewer.md 角色定义与 skills/code-review/SKILL.md 全文 |
| 审查范围 | 仅该 commit 引入内容；按任务书边界：smoke 接线 / exports 映射 / service·client 集成**不构成本轮缺陷**（Developer 遗留项 1/2，排期安排；事实基础已核：smoke.mjs 零 import 本模块、package.json exports 未扩展、lib/ 内零消费点） |

---

## 0. 审查方式与锚点核实（本轮无内嵌 diff）

- HEAD 锚点：`.git/refs/heads/main` = `8ba6ab18b86f614c1c099b7e7689aa62496e1eb9` ✓。
- 提交链锚点：`.git/logs/HEAD` 第 113 行——`11c42c0` → `8ba6ab18`，message "EVO-002 Step 2: lib/oauth-credentials.js credential module (preset constants + atomic store + rotating refresh + JWT accountId)"，11c42c0（R1 已审）之后恰此一次提交 ✓（C4 commit 纯粹性：单 commit 单主题坐实）。
- 因此 HEAD 状态即 commit 状态，两文件全文通读 + package.json 核对即等效 diff 审查。
- package.json：files 数组恰追加 `lib/oauth-credentials.js`（第 34 行，rpc.js 之后 install.ps1 之前）；dependencies/peerDependencies/version(0.2.0)/exports 零变动 ✓——无冗余修改（C4）。

## 1. 五维度逐项结论

### 1.1 正确性 — 通过（2 条加固级发现 F-01/F-02，无逻辑错误）

逐行推演要点：

- **read()（:272-298）**：ENOENT → undefined（非错误）✓；非 ENOENT 读失败 → CREDENTIAL_FILE_CORRUPT（码表注释 :79 明示"或读取不可用"覆盖此语义）✓；JSON.parse 失败不内联错误详情（:283-285，P7）；顶层未知字段拒绝 / version 必须 ===1 / credential 必须存在且过 credentialProblem 严格校验（:289-296）——H3-13 同款 ✓；返回浅拷贝（:297）✓。
- **write()（:307-354）**：写前同源形状校验拒绝坏文档（:308-309）✓；mkdir recursive 0o700（:322）✓；temp 名 `.基名.随机hex.tmp` 同目录（同文件系统 rename 原子性前提）✓；`openSync('wx', 0o600)` = O_EXCL 不覆盖先例（R10 F-02 同款，P7）✓；writeSync + fsyncSync 持久化 ✓；四条失败路径（open/write+fsync/close/rename）全部经 fail() 清理 temp 后抛 CREDENTIAL_FILE_UNWRITABLE ✓——控制流核验：fail() 必 throw（:329），openSync 失败后不可能以 fd=undefined 落入 writeSync；即使落入，writeSync(undefined) 抛 TypeError 亦被捕获走 fail()，防御闭合。JSON.stringify 输入全为 string/number 不可能抛 ✓。
- **delete()（:357-364）**：ENOENT 幂等 ✓。不持锁——与在途刷新的竞态见 F-09（P3，Step 6 登出接线时处理）。
- **ensureFresh（:381-410）**：入口校验 cred 形状 ✓；快路径 `cred.expires - Date.now() > REFRESH_MARGIN_MS` 零网络零 IO 原引用返回（:384，测试 :143 用 `===` 身份断言钉住）✓；fetchImpl 三级解析 opts→构造器→globalThis.fetch，不可用即明确报错（:386-389）✓；锁内重读盘、先到者已刷新则采纳盘值（:393-395，BC-E6 ③）✓；base=disk??cred 以盘为准（rotating 语义正确选择，JSDoc :376 明示）✓；refresh 与 write 双双经 redactError 脱敏重抛（:398-407，error.code 保留）✓；锁内 read() 抛 CORRUPT 时直接传播不盲刷——符合"损坏引导重登"语义 ✓。
- **refreshCredential（:198-251）**：请求体恰 `grant_type=refresh_token + refresh_token + client_id` 无 secret（H3-6，测试 :156 断言 `!refBody.has('client_secret')`）✓；对 bogus fetchImpl 三层防御（response 空值/ok 非布尔/json 抛错均有捕获）✓；成功响应三字段强制（access/refresh 非空串、expires_in 正有限数，:235-243）——rotating 缺 refresh_token 拒绝放行 ✓（EV-028 宽限窗事实下客户端必须覆写新值）；`expires = Date.now() + expiresIn*1000` 与 H3-6 过期判定算式逐字一致 ✓；accountId 新 JWT 提取失败回退旧值再回退 ''（与 credentialProblem 允许空 accountId 一致，:161 vs :249 闭合）✓。
- **accountIdFromJwt（:170-185）**：3 段非空校验 → base64url 解码 → JSON 解析 → claim `https://api.openai.com/auth` → `chatgpt_account_id`；任何畸形返回 null 不抛（H3-7，仅解码不验签，JSDoc 明示）✓。
- **withLock（:420-470）**：wx 独占创建；EEXIST → mtime 陈旧检测（ENOENT 竞态 continue；stat 其他错误 fail-loud）→ 超时判定 → 50ms 轮询；临界区 finally 尽力 unlink，fn 抛错不劫持锁 ✓。两处边界缺口见 F-01（接管后原持有者释放误删继任者锁 + refresh 无超时放大暴露窗）与 F-02（锁元数据写失败不清理已创建锁文件）——后果均有界（rotating+服务端宽限窗自愈 / ≤30s 陈旧接管自愈），定级 P2。
- **路径解析（:128-143）**：DSH_HOME 非空 → `$DSH_HOME/dsh-agent-router/chatgpt-codex-auth.json`；否则 `~/.dsh/dsh-agent-router/...`（EV-028：宿主实际数据目录 ~/.dsh）——与 roadmap :236 草案（"默认 DSH_HOME/dsh-agent-router/chatgpt-codex-auth.json"）相容：草案未规定 DSH_HOME 未设行为，EV-028 PoC 事实补全，头注释如实记载 ✓。resolveCredentialPath：非空原样、空/缺省回退默认（F-01 转发义务落地，测试四分支覆盖，见 §1.5）。

### 1.2 安全性 — 通过（本步最高权重维度，逐项核验）

- **敏感数据**：access/refresh 值不出现在任何 Error message——read 路径消息只含路径+固定原因（parse 错误详情不内联 :283-285）；refresh/write 路径经 redactError 按已知 secret 逐字替换 `[redacted]`（:104-120，secrets 覆盖内存旧值+盘上值四元 :396）；credentialProblem 只报字段名不报值。测试 4 处否定断言看护（:102 corrupt 消息、:173 401 消息、:186 网络错误脱敏含 `[redacted]` 正断言、:227 锁超时消息）✓。
- **硬编码密钥**：无。clientId `app_EMoamEEZ73f0CkXaXp7hrann` 是 PKCE 公共 client 标识（H3-1 源码级验证事实，非 secret），与 roadmap :228 逐字一致。
- **权限/文件模式**：temp 与 lock 均 `wx, 0o600`，目录 `0o700`（POSIX owner-only；Windows 按 dsh-codex H3-13 先例跳过 mode 检查，测试 :121-125 平台分支处理）✓。
- **注入面**：请求体 URLSearchParams 规范编码；文档 JSON.stringify；无 eval/命令执行/SQL 面。OWASP 关键项对本模块（本地凭据文件 + 单一固定端点 POST）无新增暴露。
- **原子性（P7 核心）**：O_EXCL temp + fsync + rename——崩溃不产生半写文档 ✓；进程内失败路径 temp 必清理 ✓（进程崩溃窗口残留见 F-06，P3 加固项）。rename 替换路径项不跟随符号链接（写路径对 symlink 目标安全）。
- **路径信任**：resolveCredentialPath 对 credentialFile 零校验原样透传——裁决非本层缺陷（来源=用户自配置 settings，单用户单机威胁模型；R1 F-04 前瞻的正式关闭记录见 F-07）。

### 1.3 可维护性 — 通过

- 命名/注释质量高：头注释承载职责≤3句/设计事实/安全边界/单职责边界；行内注释交叉引用 H3-x/EV-028/BC-E6/P6/P7/C3，逐条与 roadmap 对应章节核对相符（抽查：:10-15 vs roadmap §3.1 H3-13/EV-028、:59 vs BC-E6 ①、:413-418 vs E3-a）。
- 错误码风格与 attachments.js 同构（封闭 freeze 码表 + code 属性 Error + errorMessage 提取器，:78-101 vs attachments.js:51-68）✓。
- 函数长度：write ~47 行、withLock ~50 行、ensureFresh ~30 行，均在规范建议范围内；无重复逻辑（redact/errorMessage 单点定义）。
- 单职责（C3）：模块只含凭据存取/刷新/JWT 解码/路径解析；无网络会话、无协议调用、无 UI——service/client 集成留待 Step 4/5/6，头注释 :29-31 明示 ✓。

### 1.4 性能 — 通过

- 热路径（每次调用都会走的 ensureFresh 快路径）零 IO 零拷贝原引用返回 ✓（:384；这是 per-request 路径的关键设计，测试 :143 钉住）。
- 冷路径（read/write/refresh/lock）均为低频操作（登录/刷新/登出），readFileSync 同步 IO 作用于 <1KB 文件，事件循环阻塞可忽略；锁轮询 50ms 间隔 + 5s 默认超时快速失败。
- 无 N+1 / O(n²) 面；数据结构仅原始对象与数组常量。

### 1.5 测试覆盖 — 通过（64 断言逐条清点核实，判别力强）

**计数核实**：手工逐条清点 check() 调用 = 恰 64（常量 4 + 存取面 5 + corrupt 9案×2断言 18 + 写拒绝/删除/残留/权限 5 + JWT 5 + ensureFresh 14 + 并发/锁 7 + F-01 路径 6）——与自报"64 断言"精确一致 ✓。smoke 540 = 534 基线 + 6（Step 1），本 commit 未动 smoke（grep 证实零 import）——零回退由隔离性保证 ✓（Coordinator 已复跑两套 exit=0；本审查未运行）。

**判别力抽查（强断言示例）**：
- :143 `freshOut === freshCred` 引用身份断言——钉住"零拷贝快路径"契约；
- :153/:213 `captured.length === 1` / `concCalls === 1`——并发恰一次刷新的计数证明（第二调用者走盘采纳路径由 :214 `second.access === 'A9-new'` 联合坐实——BC-E6 ③ 采纳路径实质被测，非仅注释声明）；
- :102/:173/:186/:227 token 值否定断言——P7 脱敏回归网；
- :156 `!refBody.has('client_secret')`——公共客户端无 secret 契约；
- :158 expires 窗口不等式（`> before+863_000_000 && <= before+864_000_100`）——换算算式双向钉住；
- :60 `REFRESH_MARGIN_MS === 120_000`——§3.3 阈值常量钉住。

**覆盖面对账**（新模块每个公开面 ≥1 断言）：CHATGPT_PRESET 逐字段（H3-1/2/3/5/11 全命中）✓；read 六类损坏形状 ✓；write 往返/拒绝/残留/权限 ✓；delete 幂等 ✓；ensureFresh 快路径/刷新/401/网络/畸形容/并发/锁超时/陈旧接管 ✓；accountIdFromJwt 5 类畸形 ✓；resolveCredentialPath 四分支 ✓；构造器默认路径与解析函数同源 ✓。

**缺口（F-08，P3）**：CREDENTIAL_FILE_UNWRITABLE 无直接测试（目录不可写场景跨平台难测）；ensureFresh 锁内盘损坏传播路径未测；REFRESH_MARGIN_MS 恰边界（=120s）未钉（仅 > 与 < 两侧）。

## 2. 发现列表（P0-P3 + 位置 + 事实 + 建议）

**P0 = 0，P1 = 0，P2 = 2，P3 = 7**。无阻塞项。

| # | 级别 | 位置 | 事实 | 建议 |
|---|---|---|---|---|
| F-01 | P2（并发加固） | lib/oauth-credentials.js:198-213（refresh 无超时）、:456-458（陈旧接管 unlink）、:467-469（finally 无条件 unlink） | 三者复合可产生临界区重叠：refresh fetch 无 AbortSignal/超时（生产 globalThis.fetch=undici 默认 headersTimeout ~300s > 陈旧阈值 30s），挂起 >30s 的持有者会被等待者按 mtime 接管；原持有者完成后 finally 无条件 unlink 会误删**继任者**的锁文件，放行第三个进入者 → 双刷新并发。后果有界：rotating + 服务端宽限窗（EV-028 P4 发现）使两次刷新均可用，全文档重写 last-write-wins 自愈，无凭据丢失——且代码 :413-418 已如实声明"跨进程语义尽力而为" | 两项低成本加固（可并入 Step 4/5 或独立 hardening commit）：① refreshCredential 传入 `AbortSignal.timeout(常量)`（建议 15-30s，< 陈旧阈值），消除挂起持有者被接管的主因；② 释放前读锁文件内容校验 pid===process.pid 再 unlink（锁文件 {pid,at} :439 已写入，当前仅诊断用未参与判定）。非阻塞：单机单插件场景 + 自愈边界已界定 |
| F-02 | P2（错误路径卫生） | lib/oauth-credentials.js:437-444 | withLock 中锁元数据 `writeSync(fd, ...)` 若抛错（如 ENOSPC），异常传播但**已创建的锁文件不被清理**——其他调用者将遭遇最长 30s 的 CREDENTIAL_LOCK_TIMEOUT 毒化窗口（直至陈旧接管）。对照本模块自身标准：write() 对 temp 的失败清理（fail() :327-330）与"失败必清理"承诺（头注释 :27）、以及 withLock 对 closeSync 失败的处理（:441）均防御到位，唯独此路径遗漏 | 包一层 try/catch：writeSync 失败 → 尽力 unlink(lockPath) 后重抛。数行修改，建议随 Step 3 提交顺手闭合（独立小改，保持 C4 纯粹性则单独 commit） |
| F-03 | P3（设计偏差记录） | lib/oauth-credentials.js:170（模块级导出） vs roadmap:241（草案列为类方法） | accountIdFromJwt 实现为模块级导出函数而非 OauthCredentialStore 方法。无状态纯函数，语义等价；独立导出使 Step 4 登录路径无需 store 实例即可提取 accountId | 接受为已裁决偏差（无状态函数独立更合理）；无需改码。Step 4 接线按模块级函数消费 |
| F-04 | P3（裁决：合理扩展） | lib/oauth-credentials.js:217-221 + JSDoc :194-195 | 自报事项 4：非 2xx 时 REFRESH_FAILED 附 `error.status` 数值属性——接口草案未定义。**裁决：合理扩展而非越权偏差**——封闭 4 码集原样保持（§3.3 逐字命中）；status 是加法元数据不加新码；JSDoc 已注明用途（区分 401 终态与瞬时故障）；若上层未来需更细分类再走 ADR 增码 | Step 5 消费指引：`error.status` 为 4xx（尤其 401）→ 终态引导重登；status 缺失 → 网络/瞬时故障可重试。建议 Coordinator 将此语义写入 Step 5 任务书 |
| F-05 | P3（裁决：可接受简化） | lib/oauth-credentials.js:212（网络错误）vs :217-221（HTTP 错误） | 自报事项 6：网络错误与 401 同映射 REFRESH_FAILED，仅靠 error.status 区分。**裁决：Step 5 前可接受**——区分信息已保留（F-04）；roadmap §5 C-4 失败分类（lib/failure.js 五分类）才是该分离的天然归宿，现在拆码属过早设计 | Step 5/C-4 实现失败分类时复核：若 REFRESH_FAILED 消费方需要结构化重试决策，届时评估是否拆出 REFRESH_NETWORK 类错误码（设计变更走 decision-log） |
| F-06 | P3（崩溃窗口残留） | lib/oauth-credentials.js:326-353 | SIGKILL 于 openSync 与 renameSync 之间 → `.基名.随机hex.tmp` 残留（含活 token；0o600、同目录，保护级与主文件相同）。fail() 仅覆盖进程内失败；进程终止无清理钩子。多次崩溃理论上累积 | 可选加固：write() 入口 opportunistic 清扫同模式陈旧 temp（mtime 超阈）；或接受现状并在 README/FAQ 记录（凭据目录可能含 .tmp 残留，可手动删）。非阻塞 |
| F-07 | P3（R1 F-04 关闭记录） | lib/oauth-credentials.js:140-143 | R1 F-04 前瞻"credentialFile 任意字符串路径，消费时须路径校验（遍历/符号链接）"。本步 resolveCredentialPath 原样透传零校验。**裁决：本层非缺陷**——路径来源是用户自己的 settings 配置（非不可信输入）；单用户单机威胁模型下攻击者能写 settings 即已等同持有一切；写路径 rename 替换路径项不跟随 symlink | R1 F-04 就此关闭。Step 6 UI 落地时建议在账号卡透出实际解析路径（透明性）；若未来出现多用户/托管形态再引入遏制校验 |
| F-08 | P3（测试缺口） | tests/oauth-credentials.mjs（整体） | 三处未覆盖：① CREDENTIAL_FILE_UNWRITABLE（目录不可写等）无直接测试；② ensureFresh 锁内 read() 抛 CORRUPT 的传播路径未测；③ REFRESH_MARGIN_MS 恰边界（剩余=120s，`>` 语义下应触发刷新）未钉 | Step 3/4 触及本模块时顺带补齐（①跨平台测试成本高可仅 POSIX 分支）；优先级低 |
| F-09 | P3（竞态设计注记） | lib/oauth-credentials.js:357-364 | delete() 不获取文件锁：登出与在途 ensureFresh 竞态时，刷新完成后的 write() 会"复活"已删除的凭据文件（登出看似失效） | Step 6 实现"登出并删除凭据"（§3.6 合规边界）时：delete 取 withLock 或调用方先停用账号再删除。本模块可不改（单语义正确），集成层串行化即可 |

## 3. AI 代码专项 5 项结论

| # | 检查项 | 结论 | 事实依据 |
|---|---|---|---|
| 1 | mock 残留 | **通过** | lib/oauth-credentials.js 零 fake/mock/占位（grep 证实）。tests 的 fakeJwt/refreshOk/makeCaptureFetch 为显式命名的测试夹具（:22-41），且注入通道（fetchImpl/env/home）正是设计的一部分（构造器与 ensureFresh options 文档化）；测试文件头 :33 声明"单测零真实网络" |
| 2 | 硬编码返回值 | **通过** | 所有常量均为设计令牌且逐字核对设计基准：clientId/authUrl/tokenUrl/scope/redirectUri/deviceUrls = H3-1/2/3/5/11 源码级验证事实（roadmap:116-126）；120s 阈值 = §3.3"临期(如<120s)"；锁参数 5s/30s/50ms 为实现自由度（roadmap 未钉），命名常量导出可调。无虚构返回值 |
| 3 | 幻觉 API | **通过** | 全部 API 真实且版本兼容：node:crypto randomBytes、node:fs 同步族、node:os homedir、node:path、URLSearchParams、Buffer.from(base64url)（Node 15.7+）、String.replaceAll（15+）、globalThis.fetch（18+，且有不可用时 fail-loud :387-389）；测试侧 utimesSync/mkdtempSync/pathToFileURL 均真实。项目 ESM + 宿主 Node ≥18 前提下无版本陷阱 |
| 4 | 未实现 TODO | **通过** | grep TODO/FIXME/XXX/HACK/debugger/console. = 零命中。注释中"Step 4/5/6""后续步骤"是 plan-tracker 分步计划的显式引用（头注释 :29-31 边界声明），非遗弃标记 |
| 5 | 过度实现 | **通过** | 模块面 = §3.3 职责三句逐条对应；无协议调用/会话/UI 提前实现（grep 证实 lib/ 零消费点、smoke 零接线——恰与遗留项排期一致，无越界交付）。超出草案的导出（错误码表/常量/路径解析函数/withLock）均有消费方依据：错误码与常量供测试断言与 Step 4-6 消费（attachments.js 同款先例 :51-68）；resolveCredentialPath 承载 F-01 转发义务；withLock 供 Step 4 登录路径串行化复用。accountIdFromJwt 位置偏差见 F-03 |

## 4. Developer 自报事项核实（不采信自述，逐项对仓库）

| # | 自报 | 核实结果 |
|---|---|---|
| 1 | 测试计数 smoke 540 ok + oauth-credentials 64 断言全绿 | **64 断言 = 手工逐条清点精确吻合**（§1.5 计数明细）；smoke 540 维持（本 commit 零 smoke 改动，grep 证实）。断言判别力核验为强（§1.5 抽查表——身份断言/计数断言/否定断言/窗口不等式）。运行数值 exit=0 属 Coordinator 复跑证据（本审查未运行，如实标注）✓ |
| 2 | ensureFresh 锁内 read-modify-write：等锁后重读盘、先到者已刷新则采用（并发 fetch 恰一次） | **属实**：:392-395 代码核实（disk 重读 → base=disk??cred → 盘已新鲜直接返回）；并发测试 :209-215 以 `concCalls===1` + 双调用者均得新凭据证实采纳路径真实生效 ✓ |
| 3 | P7 脱敏：safeMessage 式逐字替换 + parse 失败不内联 | **属实**：redactSecrets :104-110（`[redacted]` 逐字替换）、redactError :113-120、read parse 不内联 :283-285（注释明示红线）；测试 4 处否定断言 + :186 `[redacted]` 正断言 ✓ |
| 4 | REFRESH_FAILED 附 error.status（草案外 1 行补充，JSDoc 注明） | **属实且裁决为合理扩展**（F-04）：封闭码集不变、加法元数据、用途文档化。附 Step 5 消费指引 |
| 5 | 原子写 O_EXCL temp+fsync+rename；锁 wx+mtime 30s 接管+5s 超时可注入+50ms 轮询 | **逐行属实**（:320-353 / :427-469）。附加发现自报之外两处加固点 F-01/F-02（后果有界，P2 非阻塞） |
| 6 | 网络错误与 401 同映射 REFRESH_FAILED（error.status 区分） | **属实且裁决为 Step 5 前可接受简化**（F-05）：区分信息保留，C-4 failure.js 是自然分离点 |
| 7 | 2 次测试脚本自修正（bad() 缺 mkdir、残留过滤过宽），产品代码零返工 | **终态核实**：bad() 含 mkdirSync（:80）✓；残留过滤按目标文件前缀作用域（:117 `.cred.json.`/`cred.json.`、:162 `ref.json`、:215 `conc.json`——不含 bad-* 目录与其他文件）✓。"修正过程"本身无法从 HEAD 静态验证（历史性自报，标注未验证；终态正确即可）。产品代码零返工与单 commit 事实相容（reflog :113 单条 Step 2 提交）✓ |

## 5. 设计一致性核查（§3.3 接口草案 + H3 事实 + ADR-005 + BC-E6 逐项）

| 基准项 | 要求 | 实现 | 判定 |
|---|---|---|---|
| §3.3 CHATGPT_PRESET | preset/authUrl/tokenUrl/clientId/scope/redirectUri/deviceUrls（H3-1/2/3/5/11） | :44-57 逐字段逐字符一致（deviceUrls 三端点全展开形式与 H3-11 一致）；双层 freeze | ✓ |
| §3.3 OauthCredentialStore | constructor 默认 DSH_HOME/dsh-agent-router/chatgpt-codex-auth.json | :264 + defaultCredentialPath（DSH_HOME 未设回退 ~/.dsh——EV-028 PoC 事实补全，草案未规定该行为；测试 :253 钉住） | ✓（附 EV-028 细化记载） |
| §3.3 read/write/delete/ensureFresh | 严格校验/原子写+owner-only/登出删除/临期<120s 锁内刷新重写 | :272-298 / :307-354 / :357-364 / :381-410 全部落地 | ✓ |
| §3.3 accountIdFromJwt | 类成员方法 | 模块级导出函数（无状态等价） | ≈ 已裁决偏差（F-03） |
| §3.3 Credential 类型 | {type:'oauth', access, refresh, expires(ms), accountId} | credentialProblem :149-163 逐字段一致 | ✓ |
| §3.3 错误码 | 恰 4 码：CORRUPT/LOCK_TIMEOUT/REFRESH_FAILED/UNWRITABLE | :78-87 逐字命中，无增删 | ✓ |
| §3.3 P7 安全边界 | temp+rename / POSIX owner-only（Windows 跳过）/ 诊断不回传 token | :326-333 / 测试 :121-125 / redact 体系 | ✓ |
| H3-13 | {version:1,...} 严格校验未知字段拒绝；0o600/0o700；Windows 跳 mode | :288-296 / :322/:333/:423/:433 | ✓ |
| H3-6 | 刷新体无 secret；rotating 必含新 refresh；expires=now+expires_in*1000 | :199-203 / :238-240 / :248 | ✓ |
| H3-7 | JWT 仅解码不验签提取 chatgpt_account_id | :170-185 + JSDoc | ✓ |
| ADR-005 决策③ | E3-a 独立文件+原子写+文件锁+严格校验+refresh 整文档重写 | 全命中（write(fresh) 全文档） | ✓ |
| BC-E6 ① | 凭据路径三方独立 | `dsh-agent-router/chatgpt-codex-auth.json` ≠ dsh-codex `.openai-codex-auth.json` ≠ Codex CLI `~/.codex/auth.json` | ✓ |
| BC-E6 ③ | 同插件多 profile 同路径 → 文件锁串行化 + 锁内 read-modify-write 全程持锁 | withLock 包裹 read→refresh→write | ✓ |
| P6/C2 零新依赖 | 无新运行时依赖 | 仅 node: 内建导入；package.json deps 零变动；原子写/锁自实现（E3-a 只约束语义不约束载体，:10-12 记载） | ✓ |
| 前置门禁 | Step 1 已审（R1 APPROVED_WITH_NOTES）+ F-01 转发义务 | resolveCredentialPath + 四分支测试 :247-256（R1 建议的测试句式精确落地：credentialFile='' → $DSH_HOME/dsh-agent-router/chatgpt-codex-auth.json） | ✓ F-01 义务闭合 |

**原则违反标注：无**（P1-P7/C1-C4 逐条过检——P1 事实：注释引用全部核对相符；P2 全面：错误路径系统性覆盖（两处边界缺口已按实际后果定级 P2/P3，不构成"忽略"）；P3 零回归：新文件隔离 + smoke 未动 + package.json 仅 files 追加；P4 测试看护：64 断言全路径覆盖；P5 泛化：store 逻辑 preset 无关，preset 特定面收敛于常量块，C-2 anthropic 预设可直接复用形状；P6 质量：见上表；P7 安全：原子写/owner-only/脱敏三件套落地，F-01/F-02/F-06 为加固建议非保证违反——已交付的进程内保证均实现；C3 单职责：✓；C4 纯粹性：单 commit 单主题 ✓）。

## 6. 硬门槛自检

| 门槛 | 结果 |
|---|---|
| P0 阻塞数 = 0 | ✓（0） |
| 5 维度全覆盖 | ✓（§1.1-1.5 逐一有结论；安全性按本步最高权重深查） |
| 每条发现标注级别 | ✓（9/9 有 P2/P3 标签+位置+事实+建议） |
| 设计一致性检查完成 | ✓（§5 逐项表 + H3 常量逐字段核对） |
| AI 专项 5 项完成 | ✓（§3 逐一有结论） |
| 事实红线 | ✓（每条结论指向文件:行号；运行数值未复跑处如实标注"Coordinator 复跑/本审查未运行"；历史性自报标"未验证"） |

## 7. 终态结论

# APPROVED_WITH_NOTES

- **unresolved_blockers=0**
- 发现计数：**P0=0 / P1=0 / P2=2 / P3=7**
- 关闭条件判定（SKILL）：P0=0 且 P1=0 → 可合并/进入 Step 3。
- P2 处置建议：F-01（refresh 超时 + 锁释放所有权校验）建议并入 Step 4/5 任务书或独立 hardening commit；F-02（锁元数据写失败清理）数行修改，建议随下次触及本模块的提交闭合。两者均有界自愈、不阻塞。
- Coordinator 转发建议：F-04 的 Step 5 消费语义（status=4xx 终态 / 无 status 瞬时可重试）写入 Step 5 任务书；F-09 的登出串行化写入 Step 6 任务书；F-07 关闭 R1 F-04。
- 审查局限声明：本审查未执行任何测试/命令（两套 exit=0 为 Coordinator 复跑证据）；历史性过程自报（测试 2 次自修正、TDD 过程）无法从 HEAD 静态验证，均已标注；所有结论基于 HEAD 文件实况 + git 锚点 + 设计基准交叉核对。

---
*审查者：Code Reviewer Agent（EVO-002 Step 2 · R2）· 2026-08-21 · 依据 agents/code-reviewer.md + skills/code-review/SKILL.md + evolution-roadmap-v1.md（§3.1 H3 / §3.3 / §7 ADR-005 / §8 BC-E6）+ .governance/project-principles.md（P-v1）+ lib/attachments.js 先例 + R1 报告（F-01 转发义务）*
