# REVIEW-FIX-037-R0（Code Review 输入报告）

- **Task**: FIX-037-R0（P1）— ARCH-004 终批收账代码审查，**Round 0**
- **审查对象**: `D:/AI/agent/deepseek/plugins/router` commit `a9e06da`（`HEAD == a9e06da`；7 文件 +198/−48）
- **对象完整性核验**: `git show --numstat a9e06da` = `ci.yml 18/9`、`README.md 5/4`、`lib/client.js 20/9`、`tests/host-contract.mjs 37/1`、`tests/run-all.mjs 65/8`、`tests/served-client.js 20/9`、`tests/smoke.mjs 33/8` —— 与任务下发的逐文件行数**完全一致**；`git status --porcelain` = **空**（工作树干净，无演示/探针残留）；`git ls-files --eol` 七文件均 `i/lf w/crlf attr/(空)` ⇒ 行尾噪声为零
- **范围/锁纪律**: `.governance/agent-locks.json:3-27`（FIX-037 `target_files`/`files` = 7 项）与 `.governance/change-triage/FIX-037.json:11-19`（`files` = 7 项）与实际提交集**三方逐项全等**；`.governance/plan-tracker.md:37` 已登记 FIX-037（已 triage、派发 Developer）
- **审查工具边界**: 只读——`read/grep/glob` + 只读 git（`show/log/status/rev-parse/numstat/ls-files`）+ 只读文件系统探查（`Get-FileHash` / `Get-ChildItem` / `Get-Command` / 纯文本正则复算）；**未执行任何测试、未执行写操作、未修改代码与治理状态**（唯一写入 = 本报告文件）；仓库外探针 `%TEMP%\fix037-mirror-probe.mjs` 仅**读取审阅**，未执行
- **来源报告（只读）**: `.governance/review-FIX-036-R0-input.md`（P1-1 / P2-1 / P2-2 / P2-3 / P3-1）、`.governance/review-FIX-035-R0-input.md`（P2-1）

## 1. 审查结论

**APPROVED_WITH_NOTES**（`unresolved_blockers=0`）

- P0 = **0** / P1 = **0** / P2 = **3** / P3 = **7**
- 硬门槛：P0=0 ✅ / 5 维 100% ✅ / 每条发现带级别 ✅ / 设计一致性完成 ✅ / AI 专项 5 项完成 ✅
- **一句话理由**：六项收账**全部落地且均可独立静态复算**——④ 死守卫修复后三条断言在真实数据上为绿（我按测试同法独立清点：`usedKeys=294`、`zh/en=313/313`、`missingZh/missingEn/zhOnly/enOnly` 四项均为空数组，即**无真实键缺口**，RED 演示文案 `:: ["nav"]` 与三参 `check` 语义逐字相符）、② 反向守卫经**独立文本重放**确认 20/20 套件命中 / 4 runner 0 命中（零假红，且 pre-flight 改用剥注释文本后对现有 4 runner 无行为变化）、① skip 回显的通路（三处发射点前缀均为「2 空格 + `skip `/`--  `」）与门控捕获正则逐字符吻合、③ 版本判据在本机两 `_npx` 候选上实读为 `dsh@0.1.5-rc.1` + 四个 `dsh-*@0.1.5-rc.2`（= 基线，判据绿）、⑤ 镜像 `B027C5A8…` 双文件 SHA256 独立复算**全等**且白名单块与 `health.js:37-44` 逐字同构、⑥ 两处「待 CI 首跑确认」措辞如实；残留三项 P2 全为**判据覆盖/计数口径/文档预期**类（非逻辑错误、不产生假绿），另 7 项 P3 为脆性与披露项。

## 2. 硬门槛裁决（逐维 + AI 专项 + 设计一致性）

| 维度 | 结论 | 判定依据（可复查事实） |
|------|------|------------------------|
| 正确性 | **通过** | ① `tests/run-all.mjs:148` 正则与三处发射点形态逐字吻合（`smoke.mjs:53` `  skip …` / `host-contract.mjs:89` `  --  …` / `install-entry.mjs:269/299` `  skip …`）；聚合跨进程成立（runner 模块在 smoke 进程内 `console.log` → 计入 `result.stdout`）；`run-all.mjs:163-176` 仅对通过套件统计（失败套件不计，见 P3-3）。② `stripComments`（`run-all.mjs:68-70`）与 `host-contract.mjs:97-99`、`host-abi-health.mjs:337` 同法，反向守卫 `:129-142` 在任何套件执行前 fail-fast。③ `host-contract.mjs:338-348` `versionOf` 缺包/坏 JSON → `null` 不抛、`expectedOf` 分支正确、`versionLine(null)` 被 `:351` 的 `if (hostTarget.root)` 保护。④ `smoke.mjs:38-44` 三参 `check` 的详情报文仅在 false 分支打印，与 `host-contract.mjs:82-88` 逐字同构。⑤ 白名单对**全部 6 处调用站点**的字段（`kind/face/consumer/code/detail`）零误删（`client.js:5131/5136/5162/5177/5254/5479` 逐一核对）；`at` 由记录构造点单点注入（6 处死参数已删） |
| 安全性 | **通过** | diff 内零凭据/token/密钥；无网络调用新增；宿主读取仍为 `readFileSync/existsSync/readdirSync`（只读零写入，`host-contract.mjs:315-316` 声明与代码一致）；新增 `JSON.parse(readFileSync(...))` 被 try/catch 包裹（`:339-341`），恶意/损坏 `package.json` 只能导致显式失配而非异常；日志新增面为套件名、宿主包名与版本号、静态 skip 文案（无用户数据）；`spawnSync('powershell'\|'pwsh', …)` 固定可执行名 + 固定 `-Command 'exit 0'` 常量，**无输入拼接 → 无命令注入面**；CI 日志回显的是仓库内受控文本（无 ANSI/注入构造） |
| 可维护性 | **通过**（P2-1 / P3-7 为脆性 nit） | 新增注释的锚点准确（`smoke.mjs:34` 引 `host-contract.mjs:82-88` 命中；`run-all.mjs:66` 引 `host-contract.mjs:96-99` 命中——实读为 `:96-99`，注释写 `:96-99` 成立）；`stripComments` 的「偏移量不变：注释字符换空格、换行保留」声明与实现一致（`replace` 回调用同长度空白，`\n` 保留）；命名表意（`SKIP_LINE`/`skipTotal`/`skippedSuites`/`versionOf`/`versionsOf`/`expectedOf`/`mismatches`）；函数长度均在阈值内（`hostTarget` IIFE 24 行、反向守卫块 14 行）；单点化方向：靶子解析仍是 S3/S7 **单一实现路径**（`:315/:505/:636` 共用 `hostTarget`），`at` 注入单点化；扣分项 = 基线常量双份（P2-1）、`stripComments` 三副本（P3-7） |
| 性能 | **通过** | 反向守卫 = 20 次 `readFileSync` + 单次线性正则（~700KB 量级文本，实测替换后长度 595KB/2.4MB 级）；版本判据 = `HOST_KEY_PACKAGES(5) × 候选数`（本机 2 候选 → 10 次 package.json 读取，全在 IIFE 内一次性）；skip 解析 = 每通过套件一次 split+filter；无循环内 I/O、无 O(n²)、无常驻句柄、无新增子进程 |
| 测试覆盖 | **通过但附 3 项 P2** | ④ 的修复**有真实判别力且当前为绿**（§4.3 独立清点）；①②③⑤ 的机制均有可静态复算的证据（§4）；镜像 parity 有字节级机器守卫（`host-abi-health.mjs:151-152` `mirror === source`）+ 权威侧白名单断言（`:98-103` 含 300/500 字符截断与 poison 字段剔除）⇒ ⑤ 的镜像同构被传递覆盖；**覆盖缺口**：① 回显格式、② 反向守卫、③ 失配分支均无仓内机器断言（依赖外部演示，见 §5 P1-1(a)/P2-2 口径、§7 未验证）；`oauth-credentials.mjs:126` 平台跳过以恒真断言计入 ok（P3-4） |

**AI 代码专项 5 项**

| # | 项 | 结论 | 依据 |
|---|----|------|------|
| 1 | mock 残留 | ✅ 无 | 本批 diff 零 mock/桩新增；② 反向守卫与 pre-flight 读**真实** `tests/*.mjs` 源码；③ 判据读**真实**宿主 `package.json`（`host-contract.mjs:339-341`）；⑤ 仓库外探针用真实 bundle 导出（`new Function('window', mirrorSource)` + `createClientRemotes(...).health().diag`），未 mock 被测逻辑（react stub 为环境替身） |
| 2 | 硬编码返回值 | ✅ 无（有 1 处**基线常量**，属合法记录性声明） | `HOST_VERSION_BASELINE`（`host-contract.mjs:154`）为实测基线记录而非「恒真返回」：判据另一端是**真实宿主读取**（`versionsOf(hit.root)`），失配走**显式告警 + note**（`:359-361`）而非静默通过；`versionOf` 失败返回 `null` → 计入 `mismatches` → 告警（fail-visible）；无 `return true` / 恒真条件新增 |
| 3 | 幻觉 API | ✅ **零幻觉（逐 API 核对）** | `Object.fromEntries`、`Object.freeze`、`JSON.parse`、`readFileSync/existsSync/readdirSync`、`Array.prototype.filter/map/find`、`Set`、`String.prototype.slice/matchAll`、`RegExp.prototype.test`、`Number.parseInt`、可选链/空值合并（`error?.message ?? error`）均为真实 API；`spawnSync` 语义（成功 `error===undefined`；`stdio:'inherit'` 时 `stdout` 为 `null` → `run-all.mjs:164-167` 的「无捕获面」注释成立）；无虚构环境变量（`DSH_HOST_SOURCE`/`DSH_HOST_PACKAGES`/`LOCALAPPDATA`/`RUN_ALL_TIMEOUT_MS` 均为既有真实变量） |
| 4 | 未实现 TODO | ✅ 无 | 7 个改动文件全文 `grep \b(TODO\|FIXME\|XXX\|HACK)\b` = **0 命中**（全仓 3 处命中均在未改动的 `tests/host-abi-health.mjs:18/182/643` 的说明性文字中） |
| 5 | 过度实现 | ✅ 无越界（1 处微扩已如实披露） | 六项声称 ↔ 代码一一映射：①`run-all.mjs:146-194` + `smoke.mjs:31-54/80-93/3075-3077`；②`run-all.mjs:63-70/123-142`；③`host-contract.mjs:148-156/320-367`；④`smoke.mjs:38-44/117-119`；⑤`client.js:5064-5077/5162/5177/5225`（6 处死参数删除 + 第三站点对齐，Developer 偏差 ⑤ 已披露且属同一缺陷类的必要性修改）；⑥`ci.yml`/`README` 文案。未实现设计外能力（未做 §5.3 第③步「锁版本装宿主」）；未夹带无关改动（`package.json`/`lib/host-abi/**` 零改动） |

**设计一致性**：§5.3 第①步 CI 边界**仍如实**且更细（`ci.yml:17-34`，未越界实现第③步）；**BR-03「静态守卫不依赖宿主」保持**（③ 的失配语义取「告警 + note」而非红，`host-contract.mjs:359-364` 与 README:241 同口径，宿主不可达仍只 note 不失败）；**P4（看护不得静默降级）方向正确**——三处 skip 从此在门控日志可见（R0 P1-1 的真实修复）；**P8（失败/降级可观测）** 在本批新增路径上成立（单宿主探针失败逐条打印原因）；**P5（单点化）** 在 `at` 注入与靶子解析上成立，在基线常量上未达成（P2-1）；**P-v3 原则 10④（禁按心智模型伪造宿主面）** 不适用（未新增桩，判据为宿主实读）。**交付批次粒度观察（不计 finding）**：6 项同 commit，P4 编程要求 4「一 commit 一问题」字面偏好拆分；但本批由 `TRIAGE-FIX-037` 单一任务承载（5/6 为测试基础设施级，⑤ 为镜像一致性同源缺陷），拆分会使审查批次原子性受损，判为可接受。

## 3. Developer 声称核验（7 条 + 偏差逐条）

| # | 声称 | 核验 | 证据 |
|---|------|------|------|
| 1 | ④ 死守卫修复：三参 `check` 形态 + 三站点显式布尔；RED 实证（删 zh 表 nav 键 → `FAIL client label keys covered (zh) :: ["nav"]` + tables match 红）；复原零残留；未暴露真实键缺口 | **成立（机制 + 数据双重独立复算）** | `smoke.mjs:38-44` 与 `host-contract.mjs:82-88` 逐字同构（含 `typeof detail === 'string' ? detail : JSON.stringify(detail)`）；`:117-119` 三处均为显式布尔；**RED 文案可静态确证**：`missingZh` 为数组 → `JSON.stringify(['nav'])` = `["nav"]` ⇒ 输出 `FAIL client label keys covered (zh) :: ["nav"]`；tables match 的 detail 为 `{zhOnly:[], enOnly:['nav']}` → 同样红；**绿侧独立清点**（§4.3）= `missingZh=[]`/`missingEn=[]`/`zhOnly=[]`/`enOnly=[]` ⇒「无真实键缺口」成立 |
| 2 | ① 三层可见（run-all 捕获 skip 行 → `PASS <suite> (Nms, K skip)` + `#SKIP \| <原行>` + 汇总 `#SKIP n`）；smoke skip 计数 + 汇总 + 逐宿主探针失败原因；演示 A（空 `DSH_HOST_SOURCE` + 空 `LOCALAPPDATA` → 3 skip 聚合） | **机制成立（静态三元确定）**；**「3 skip」为条件性数字，未复跑** | 正则 `^ {2}(?:skip\s\|--\s)`（`run-all.mjs:148`）与三发射点前缀吻合（`smoke.mjs:53`、`host-contract.mjs:89`、`install-entry.mjs:269/299`）；回显格式 `:173-174`、汇总 `:188/190/193` 与声称逐字一致；smoke 汇总 `:3075-3077`；逐宿主失败原因 `:88`。**「3」的静态来源**：无 PS 宿主时 = 2 条逐宿主 + 1 条聚合（`smoke.mjs:88/92`）；而空 `DSH_HOST_SOURCE`+空 `LOCALAPPDATA` 命中的是 **host-contract**（仅 2 条 `note()`：`:510` S3 + `:634` S7）⇒ 该演示若为 host-contract 单套件则应为 2；若演示跑的是全量门控（win 上 install-entry POSIX 臂另 +1）则恰为 3 —— 两种读法均与代码相容，**执行侧细节未复跑**（见 §7） |
| 3 | ② 反向断言 + stripComments 剥注释 + 20/20 零假红；假 runner 负向 exit 1 | **成立（独立重放 20/20 + 4/0）** | §4.2：按 run-all 同法（块注释 + 行注释两段替换）对 20 个未排除套件重放，**命中 20/20**；4 个 runner 模块剥注释前后**均 0 命中** ⇒ pre-flight 真值未变、反向守卫零假红；负向路径可静态确证（未登记且无退出闸 → `problems.push` → `:137-141` `process.exit(1)`）；「注释提及不构成形态证据」成立（注释被同长空白替换） |
| 4 | ③ S7 靶子版本一致性：`HOST_VERSION_BASELINE`（同源 host-version-snapshot）+ `HOST_KEY_PACKAGES` + 全候选版本打印；绿（靶子与未选候选同版本）；失配演示（隔离 root dsh-llm@0.1.5-rc.1 → 告警 + note 可见） | **成立（本机实读为绿）；「同源」措辞不实（实为手工同步副本）** | 本机两 `_npx` 候选实读：`@deepseek-ai/dsh=0.1.5-rc.1`、`dsh-api-remotes/dsh-api-session-controller/dsh-client-ui-model-selection/dsh-llm` 均 `0.1.5-rc.2` ⇒ 5/5 === 基线（与 `host-version-snapshot.mjs:44-49` 值逐字相等）⇒ `mismatches=[]` ⇒ 走 `:363` 绿分支；失配路径静态成立（`mismatches` 非空 → `:360` 告警 + `:361` `note()` → `--  ` 行 → run-all `#SKIP` 回显）；**“同源”纠正见 P2-1** |
| 5 | ⑤ 镜像 detail 三站点对齐 + 白名单/截断 + 删 6 处死参数 `at`；hash `B027C5A8…`（基线 `4CA72ACE…`）；仓库外探针 9/9（含 `Error('')` → 无 detail 字段） | **成立（hash 独立复算 + 表达式逐字 + 分歧消除可证）** | §4.1：两文件 SHA256 = `B027C5A87C1C2E8F95F151513B983E9B62CB980B56CEEF9FC528A799A5F1B504`（**全等**，与 FIX-035 基线 `4CA72ACE…` 不同属预期——文件已改）；三站点 `client.js:5162/5177/5225` 与权威 `events.js:131/207`、`client-remotes.js:72` **逐字相同**；6 处 `at: Date.now()` 删除数 = diff 中 `-` 行计数 6 ✓；`Error('')` 分歧消除可静态证明：权威式 `String('' ?? error)` = `''` → 白名单 `entry.detail` 为假值 → **字段被丢弃**；旧式 `error && error.message ? … : error` → `String(error)` = `"Error"`（差异真实存在且方向正确）；探针 9 条 `ok()` 覆盖 0/1a/1b/1c/2a–2e，与声称的 9/9 逐一对应（**未执行**，见 §7） |
| 6 | ⑥ 措辞如实化：ci.yml/README skip 口径 + registry「待 CI 首跑确认」 | **成立** | `ci.yml:17-21`（skip 回显机制与实现一致）、`:24`（`--  skipped` 经 `#SKIP` 回显，与 `host-contract.mjs:89` 一致）、`:26`（③ 失配语义「显式告警 + skip」与实现一致）、`:29-31`（首跑确认口径 + 单宿主失败可见）、`:47-48`（registry 待确认）；`README.md:227/241/248/250` 同口径；残留精度项见 P2-3 |
| 7 | 偏差：② 判据加强 stripComments（P3-1 调用点判据保持 open）；③ 失配选「告警+note」非红（请评估）；⑤ 边界微扩；① 计数口径注释 | **全部如实披露；③ 的裁决我认可（附残余）** | ② `run-all.mjs:96-100` 调用点判据仍为文本存在性（未改，与披露一致）；③ 裁决评估见 §5 P3-6；⑤ 已披露且必要；① `smoke.mjs:45-50` 注释明确「本计数只含 smoke 自身 skip，跨进程唯一汇总点在门控入口」 |
| 8 | 全量网：HEAD 复跑 `ALL 20 SUITES + 4 RUNNER MODULES PASSED (26.1s) #SKIP 1` exit 0 | **未执行（工具边界）；但 `#SKIP 1` 经独立环境推演吻合** | 本机实况（`Get-Command`）：`powershell.exe` 5.1 + `pwsh.exe` 7.6.6 **双宿主在位** ⇒ `smoke.mjs` 0 skip；`sh` **不存在**（仅 `curl.exe`）⇒ `install-entry.mjs:298-299` POSIX 臂 1 skip；宿主两候选均基线版本 ⇒ host-contract 0 skip（`:363` 绿分支，无 note）⇒ **全量恰 1 条 skip 行**（`smoke.mjs×1`），与声称 `#SKIP 1` 吻合 |

## 4. 关键独立复算（可复查事实）

### 4.1 镜像 hash 与同构性
- `(Get-FileHash lib/client.js -Algorithm SHA256).Hash` = `(Get-FileHash tests/served-client.js …).Hash` = `B027C5A8…F1B504`；两文件字节长度均 **396303** ⇒ 字节镜像成立（声称 `B027C5A8…` 命中）
- 白名单块 `client.js:5071-5078` 与 `lib/host-abi/health.js:37-44` **逐字同构**（`kind:…slice(0,64)` / `face` 64 / `consumer` 64 / `code` 48 / `detail` 160 + `at: Date.now()`），与「health.js:35-48 同构」声明一致
- 机器守卫仍在位：`tests/host-abi-health.mjs:151-152` `mirror === source`（本批未改该文件，守卫继续生效）；权威侧白名单/截断/恶性输入断言 `:98-103` 已存在 ⇒ 镜像同构被传递覆盖

### 4.2 反向守卫零假红（独立文本重放）
按 `run-all.mjs:68-70` 同法（`/\*[\s\S]*?\*/\` 块注释 → `(^|[^:])//[^\n]*` 行注释两段替换）对 20 个未排除套件重放 `process\.exit(?:Code)?|invokedDirectly`：**命中 20/20，miss = 0**；对 4 个 runner 模块：剥注释前后均 **0 命中**。剥离量（raw−stripped）与各文件注释密度成比例（如 `smoke.mjs` 238796→209604），**无失控吞并迹象**；`adapter-parity.mjs:361`、`routing-paths.mjs:1124/1126`、`stats.mjs:663-673` 等 token 行均为纯代码行（行内无 `//`、`/*` 前缀）⇒ 当前文件集「20/20」成立且**无过度剥离导致假红**。

### 4.3 ④ 文案键覆盖（按 smoke 同法静态清点 `lib/client.js`）
`usedKeys`（`\bt\('([a-zA-Z0-9]+)'\)` 去重）= **294**；`tableKeys('zh') = 313`、`tableKeys('en') = 313`；`missingZh = []`、`missingEn = []`、`zhOnly = []`、`enOnly = []` ⇒ 修复后三条断言在真实数据上**全绿**（与「未暴露真实键缺口」一致；RED 演示只在临时删键时成立）。

### 4.4 ③ 版本实读（本机 `%LOCALAPPDATA%\npm-cache\_npx`）
两候选 `1da1392061ab1944` / `1e7f6d9597241db0` 的 `node_modules/@deepseek-ai` 逐包实读：`dsh = 0.1.5-rc.1`；`dsh-api-remotes` / `dsh-api-session-controller` / `dsh-client-ui-model-selection` / `dsh-llm` = `0.1.5-rc.2`；S3 判据包 `dsh-client-ui-settings` / `dsh-client-locale` / `dsh-api-remotes` **均在位**（⇒ S3 宿主侧半边与 §7 推论一致，靶子可达时全绿）。降序首命中 `1e7f…`（与 run-all/宿主实现 checkout 一致）。

### 4.5 ① 发射点 × 正则 × 计数闭合
| 发射点 | 输出形态 | `^ {2}(?:skip\s\|--\s)` | 计数归属 |
|---|---|---|---|
| `smoke.mjs:53`（新 `skip()`） | `  skip <label> (<reason>)`（stdout） | ✅ | smoke 进程内（含 runner 模块行）→ run-all 归入 `smoke.mjs` |
| `host-contract.mjs:89`（`note()`） | `  --  <label>`（stdout） | ✅ | host-contract |
| `install-entry.mjs:269/299` | `  skip PowerShell/POSIX online checks (…)`（stdout） | ✅ | 经 smoke 进程 → 归入 `smoke.mjs` |
| 全 `tests/` 扫描 | 无第 4 类 skip 发射点 | — | 覆盖完备 |

## 5. 发现清单

### P2-1 宿主版本基线**双份常量**且无机器一致性守卫——「同源」实为手工同步副本（P5 方向）
- **位置**: `tests/host-contract.mjs:150-154`（`HOST_VERSION_BASELINE = { dsh: '0.1.5-rc.1', dshPackages: '0.1.5-rc.2' }`，注释自称「与 `tests/host-version-snapshot.mjs:44-49` 的 `HOST_BASELINE` **同源同值**」）vs `tests/host-version-snapshot.mjs:44-49`（权威 `HOST_BASELINE`）
- **依据（可复查）**: 两处值当前**逐字相等**（我已逐字段核对）；但全仓 `grep HOST_VERSION_BASELINE|HOST_BASELINE` 显示**无任何断言锁定两者相等**——`host-contract.mjs` 只在 `:343/354/361/363` 消费自己的副本，`host-version-snapshot.mjs` 不导出 `HOST_BASELINE`（且该文件为独立入口、顶层执行 + `:145 process.exit`，无法被 import 复用）。更实质的是：`host-version-snapshot.mjs:26-32` 的「如何刷新基线」程序明确写「**同步更新三处**：本文件 `HOST_BASELINE` 常量、`package.json` 版本范围与 inject 清单、README 兼容矩阵」——FIX-037 使刷新点变为**四处**而未更新该程序（`host-contract.mjs:52` 仅有「与 host-version-snapshot 刷新步骤同步执行」的散文提示）（P4 编程要求 1/2、P-v3 原则 5「同一动作的多触发来源 MUST 汇入同一实现路径」）
- **影响**: 宿主升级后若漏改本副本 → 版本判据**永久误报失配**（噪声化告警，每次门控出现 `#SKIP` 一条），稀释 ③ 的信号价值；反向（权威改了、副本没改）不会产生假绿（失配只会多告警），故**非阻塞**
- **建议（≤3 行）**: 在 `host-contract.mjs` 以 `readTest('host-version-snapshot.mjs')`（`:94` 已有 helper）文本断言两处常量同值，例如 `check('S7 基线常量与 host-version-snapshot.HOST_BASELINE 同源', readTest('host-version-snapshot.mjs').includes(\`dsh: '${HOST_VERSION_BASELINE.dsh}'\`) && …)`；或把常量移入共享模块；并同步 `host-version-snapshot.mjs:29` 的「三处」为「四处」
- **标注**: 静态判定（常量值与刷新程序均为可复查事实）；未实跑

### P2-2 版本判据包集与 S3 实际判据包不匹配——R0 P2-2 点名的失效场景未被覆盖（注释口径亦不准确）
- **位置**: `tests/host-contract.mjs:156`（`HOST_KEY_PACKAGES = ['dsh', 'dsh-api-remotes', 'dsh-api-session-controller', 'dsh-client-ui-model-selection', 'dsh-llm']`，注释 `:155` 称「dsh CLI + **S3/S7 直读的四个 dsh-***」）vs `:203`（`CLIENT_PACKAGE_INJECT_BASELINE = ['@deepseek-ai/dsh-client-ui-settings', '@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-api-remotes']`，S3 宿主侧判据 `:505-508`）vs `:639/643/680/683/685`（S7 实际直读的四个包）；声明面 `README.md:241` 同措辞
- **依据（可复查）**: S7 直读集 = `dsh-api-remotes`(:639/:643) + `dsh-api-session-controller`(:680) + `dsh-client-ui-model-selection`(:683) + `dsh-llm`(:685) ⇒ 四个 `dsh-*` **全部是 S7 读包**，其中仅 `dsh-api-remotes` 被 S3 共用；**S3 特有判据包 `dsh-client-ui-settings` / `dsh-client-locale` 不在 `HOST_KEY_PACKAGES` 内**。R0 P2-2 的原始失效场景正是「一份**早于 `dsh-client-ui-settings` 出现**的旧缓存副本会让门控在宿主正常时报红」（R0 报告 :109），该场景下新判据可能仍打印 `:363`「关键包版本 === HOST_VERSION_BASELINE（靶子与实测基线同版——RISK-003 预警对象可判定）」，而 S3 的存在性断言同时红——**告警与实际红点不同源**
- **影响**: ③ 的「S3/S7 结论适用范围可判定」在 S3 半边不完整；注释/README 把「S7/共享的四个包」表述为「S3/S7 直读的四个」，属口径不实（与本批 ⑥ 的目标同类）。**非阻塞**：实测两候选均在同版本带（§4.4），且「旧副本会在 5 个包中至少一个上失配」的概率极高，实践风险低
- **建议（1 行 + 1 句）**: `HOST_KEY_PACKAGES` 追加 `dsh-client-ui-settings`、`dsh-client-locale`（本机两候选均为 `0.1.5-rc.2` ⇒ 追加零假红）；注释/`README.md:241` 改为「`dsh` + S7 直读四包 + S3 判据两包」
- **标注**: 静态判定（包集与调用点逐行核对；本机版本实读）；未实跑

### P2-3 `#SKIP` 计数把「平台上不存在的臂」纳入断言级 skip——ubuntu CI 每次必现 1 条预期内 skip 且文档未预期化
- **位置**: `tests/smoke.mjs:80-93`（逐宿主探针失败 → `skip('install.ps1 parses (powershell)', 'probe failed: ENOENT')`）+ `tests/run-all.mjs:171-174`（`PASS <suite> (Nms, K skip)` + `#SKIP \| <原行>`）+ `:188`（`#SKIP n (套件×条数)`）；声明面 `.github/workflows/ci.yml:27-31`、`README.md:248`
- **依据（可复查）**: `powershell`（Windows PowerShell 5.1）在 Linux 运行器上**恒不存在** ⇒ ubuntu CI 每次运行都会输出 `#SKIP | install.ps1 parses (powershell) (probe failed: ENOENT)` 并使汇总出现 `#SKIP 1 (smoke.mjs×1)`，而**真实的 `install.ps1` 解析断言由 pwsh 臂完整执行**（`smoke.mjs:96-98`）。`ci.yml:27-31` 只说「该断言经 pwsh 臂执行；该平台事实以 CI 首跑日志确认（探针结果可见…）」，未说明「首跑日志必然出现一条 `(powershell)` 臂 skip」⇒ 读者（正是本批为之建立可见性的 CI 读者）可能据此误判「install.ps1 解析断言被跳过」；同族口径问题也在 Windows 本地反向成立（`install-entry.mjs:298-299` 的 POSIX 臂 skip 是常态，见 §3-8 的 `#SKIP 1` 推演）
- **影响**: 不产生假绿（无「能跑而被静默跳过」的断言），仅削弱「日志可直接判定被跳过的断言」的信噪比；对应 R0 P1-1(b) 建议的落地副作用（该建议本身已要求逐宿主打印原因，本项为**残余口径**而非方案否决）
- **建议（1 句文档 + 可选 1 行代码）**: 在 `ci.yml:27-31` / `README.md:248` 补「ubuntu 首跑预期固定出现 1 条 `install.ps1 parses (powershell)` 臂 skip（5.1 仅 Windows）；Windows 本地预期固定出现 1 条 `POSIX online checks` 臂 skip」；若希望计数只反映**能力缺失导致的断言跳过**，可将逐宿主探针失败降级为不计数信息行（如 `      info …`），把 `skip`/`#SKIP` 保留给 `psHosts.length === 0` 的聚合行
- **标注**: 静态判定（平台事实 + 正则/计数路径三元确定）；Linux 侧断言未实跑

### P3（7 条，非阻塞）

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| P3-1 | `tests/run-all.mjs:68-70/133` | 反向守卫判据是**文本存在性**：字符串字面量内的 `process.exit` 亦命中（如 `smoke.mjs:391` 的 `` `-e "console.error('boom');process.exit(3)"` ``）；且 `stripComments` 的 `(^|[^:])//` 在「字符串内含 `//` 且前缀非 `:`」时会**过度剥离**同行余下文本（可能吞掉真实退出闸 → 假红，fail-closed 方向安全）。当日 20/20 重放无假红（§4.2），但判据语义弱于名称 | 注释显式声明「判据为启发式（剥注释后的文本存在性），不构成「真调用」证明」；若需更强，可先剥离字符串字面量再匹配 |
| P3-2 | `tests/run-all.mjs:132` | 反向守卫 `readFileSync` 无 try/catch：套件文件不可读时以未捕获异常栈终止（有非零退出码但无结构化诊断），与 R0 P3-2 对 pre-flight 的同项同类 | 包一层 try/catch → `console.error('run-all: 读取 <suite> 失败: …')` + 计入 `problems` |
| P3-3 | `tests/run-all.mjs:163-176` / `:178-184` / `:188` | skip 统计仅在 `ok` 分支执行；失败套件即便打印了 skip 行也不计数、且失败输出仅回显尾部 25 行 ⇒ 失败批次的 `skipNote` 缺失（此时 skip 事实仍可从尾部或本地复跑获得） | 在失败分支一并对输出做同法过滤并追加到 `skippedSuites`/`skipTotal`（或标注「失败批次 skip 统计不完整」） |
| P3-4 | `tests/oauth-credentials.mjs:124-129` | win32 分支 `check('owner-only mode skipped on Windows (H3-13 precedent)', true)` 是**恒真断言**（平台跳过被记成 `ok`，虚增通过计数）——本批 ④ 修复的同类残余；全 `tests/` 扫描 `? true :` 现已 **0 命中**（3 处已修），仅此 1 处 `, true)` 形态残留 | 下次触碰该文件时改为 `skip(...)` 语义（本批新增的 `smoke.mjs:51` 即为可复用先例）或 `note()`；**不在本批 7 文件锁内，不作为本批要求** |
| P3-5 | `tests/smoke.mjs:45-54/3075-3077`、`tests/install-entry.mjs:296-300` | smoke 独立运行（非门控）时汇总 `(N skipped)` 只含 smoke 自身计数，runner 模块（install-entry 的 POSIX 臂）的 skip 行已打印但不计数 ⇒ 独立调用口径偏低（注释已如实披露「跨进程唯一汇总点在门控入口」） | 无强制动作；可在 `smoke.mjs` 汇总行同时打印「runner 模块 skip 见上文行」提示，或在 `runInstallEntryTests(check, skip)` 传参计数 |
| P3-6 | `tests/host-contract.mjs:359-364` | ③ 失配语义裁决评估：**认可「告警 + note」而非红**——理由 ①BR-03（静态守卫不依赖宿主）在「宿主可达但非运行宿主副本」这一邻近场景下仍应避免硬依赖红，②合法的宿主升级（如升到 `rc.3`）不应让插件门控变红，③R0 P2-2 原建议即写明「或红，由 Coordinator 裁决语义」。**残余**：失配时 S3/S7 仍按该副本执行断言，其红/绿与运行宿主无因果关系，仅靠告警行提示读者 | 台账记录该裁决与残余（建议 Coordinator 在 plan-tracker/evidence-log 留痕）；未来若要更强语义，可引入仅告警的 `exit code 独立位`（非红） |
| P3-7 | `tests/run-all.mjs:68-70` vs `tests/host-contract.mjs:97-99` vs `tests/host-abi-health.mjs:337` | `stripComments` 现为**三处逐字副本**（run-all 新增第三份）——P5 方向；因测试文件各自独立运行、run-all 不应 import 被测模块，判为可接受 | 三处注释互指同一实现（run-all 已指 `host-contract.mjs:96-99`；建议 `host-contract.mjs`/`host-abi-health.mjs` 反向注明「run-all 反向守卫同法」） |

## 6. 遗留项与关闭期限建议

| ID | 内容 | 建议期限 | 备注 |
|----|------|---------|------|
| L-1（P2-1） | 基线常量双份 → 加机器同值断言 + 修正 `host-version-snapshot.mjs:29` 的「三处」为「四处」 | 随下次触碰 `host-contract.mjs` 或 CI 首跑后回填（≤3 行） | 不阻塞；失败方向为噪声而非假绿 |
| L-2（P2-2） | `HOST_KEY_PACKAGES` 追加 `dsh-client-ui-settings`/`dsh-client-locale` + 注释/README 口径改为「S7 四包 + S3 两包」 | 同上（≤2 行 + 1 句） | 本机零假红（两候选均 `0.1.5-rc.2`） |
| L-3（P2-3） | ci.yml/README 补「ubuntu 固定 1 条 `(powershell)` 臂 skip、Windows 固定 1 条 POSIX 臂 skip」预期说明（或逐宿主失败改为不计数 info 行） | **CI 首跑前**（1 句文档） | 直接关系首跑日志的可读性（RISK-001 主轨道） |
| L-4（P3-1/P3-2） | 反向守卫判据语义注释 + `readFileSync` try/catch | 可台账化 | 低风险 |
| L-5（P3-3/P3-5） | 失败批次 skip 统计、独立运行计数口径 | 可台账化 | 观测精度项 |
| L-6（P3-4） | `oauth-credentials.mjs:126` 恒真断言改走 skip 语义 | 下次触碰该文件 | 非本批锁内文件，本批**不作为要求** |
| L-7（P3-6） | ③ 失配语义裁决 + 残余入台账 | 随本轮审查机录 | — |

## 7. 未验证 / 待验证（事实依据红线）

| 项 | 状态 |
|----|------|
| 全量门控实跑（`ALL 20 SUITES + 4 RUNNER MODULES PASSED (26.1s) #SKIP 1` exit 0） | **未执行**（Reviewer 不执行测试）；`#SKIP 1` 经本机环境推演**吻合**（双 PS 宿主在位 ⇒ smoke 0 skip；`sh` 缺失 ⇒ install-entry POSIX 臂 1 skip；宿主两候选均基线版本 ⇒ host-contract 0 skip） |
| RED/GREEN 演示：④ 删 zh `nav` 键、② 假 runner exit 1、③ 隔离 root `dsh-llm@0.1.5-rc.1` 失配、⑤ 仓库外探针 9/9 | **未执行**；**机制静态成立**（④ 的 `:: ["nav"]` 与三参语义逐字相符、绿侧已独立清点；② 负向路径代码可读且 pre-flight 已在守卫前 fail-fast；③ 告警+note 路径逐行可读；⑤ 探针源码已读，9 条含 `Error('')`→无 `detail` 场景，与权威 `String(error?.message ?? error)` + 白名单语义一致） |
| 「演示 A = 3 skip 聚合」的具体套件组成 | **未复跑**；静态上「host-contract 单套件空宿主 = 2 条 note」与「全量门控（含 install-entry POSIX 臂）= 3 条」两读法均与代码相容（§3-2） |
| CI 首跑实况（ubuntu 是否自带 pwsh、`@deepseek-ai/*` 无凭据可解析性、20 套件实际输出） | **未验证**（Developer 如实声明「首跑属 push 后动作」；两处措辞已改为「待 CI 首跑确认」✓）；本报告对 ubuntu 的判定为静态推理（`powershell` 5.1 仅 Windows 属平台事实） |
| `hostTarget` 选择的「运行宿主」等价性 | **未验证**（本机降序首命中 `1e7f…` 与 DSH 实现 checkout 目录同名，属**佐证**而非因果证明）；③ 的版本判据已把该不确定性变为可见告警 |
| 5 个「双形态」模块（adapter-parity 等）在门控下真实执行其断言 | 静态确认（`adapter-parity.mjs:350-364` `invoked` + `process.exit` 在位，`process.argv[1]` 为脚本路径时真值成立），未实跑 |

## 8. 证据索引（可复查事实）

- **提交对象**: `git show --stat a9e06da`（7 文件 +198/−48）；`git show --numstat --format="" a9e06da`（18/9、5/4、20/9、37/1、65/8、20/9、33/8）；`git status --porcelain`（空）；`git rev-parse HEAD` = `a9e06da…`；`git ls-files --eol` 七文件 `i/lf w/crlf attr/(空)`
- **锁与范围**: `.governance/agent-locks.json:3-27`；`.governance/change-triage/FIX-037.json:11-19`；`.governance/plan-tracker.md:37`
- **①② 面**: `tests/run-all.mjs:63-70`（stripComments）/`:74-111`（pre-flight）/`:113-121`（枚举）/`:123-142`（反向守卫）/`:144`（启动行）/`:146-150`（SKIP_LINE 与状态）/`:152-185`（子进程与回显）/`:187-194`（汇总与退出码）；`tests/smoke.mjs:31-54`（check/skip）/`:80-93`（探针与逐宿主 skip）/`:117-119`（死守卫修复）/`:3075-3078`；`tests/install-entry.mjs:269/298-299`（skip 发射点）
- **③ 面**: `tests/host-contract.mjs:148-156`（基线常量与包集）/`:315-367`（靶子解析 + 版本判据 + 打印 + note）/`:502-511`（S3 宿主侧）/`:631-689`（S7 直读五包锚）/`:692-695`（汇总）；`tests/host-version-snapshot.mjs:26-32/44-49`
- **⑤ 面**: `lib/client.js:5064-5077`（白名单环）/`:5131/5136/5162/5177/5254/5479`（6 站点死参数已删）/`:5225`（probe detail 对齐）；权威 `lib/host-abi/health.js:35-48`、`events.js:131/207`、`client-remotes.js:72`；镜像守卫 `tests/host-abi-health.mjs:98-103/151-152`；仓库外探针 `%TEMP%\fix037-mirror-probe.mjs`（只读审阅，未执行）
- **独立复算命令面**: `Get-FileHash -Algorithm SHA256`（两文件 `B027C5A8…F1B504`，长度 396303）；`Get-ChildItem $env:LOCALAPPDATA\npm-cache\_npx\*\node_modules\@deepseek-ai` 逐包 `package.json.version`；`Get-Command powershell/pwsh/sh/curl`（5.1 + 7.6.6 + 无 `sh`）；按 run-all 同法的两段正则重放（20/20 命中、4 runner 0 命中）；按 smoke 同法的文案键清点（294 used / 313 zh / 313 en / 四类缺口全空）
- **声明面**: `.github/workflows/ci.yml:12-34/42-52`；`README.md:226-228/241/248/250`
- **来源**: `.governance/review-FIX-036-R0-input.md`（P1-1 :90-96、P2-1 :98-104、P2-2 :106-112、P2-3 :114-121、P3-1 :126）；`.governance/review-FIX-035-R0-input.md`（P2-1 :153-158）

---

**结论（四选一）**: `APPROVED_WITH_NOTES` · `unresolved_blockers=0` · P0=0 / P1=0 / P2=3 / P3=7
**备注**: 六项收账全部落地且可独立静态复算——④ 修复后真实数据全绿（294/313/313，四类缺口为空）、② 反向守卫独立重放 20/20 命中零假红、① skip 三发射点 × 正则 × 回显格式逐字符闭合、③ 本机两候选版本实读 === 基线、⑤ 镜像 SHA256 全等且白名单与权威逐字同构、⑥ 措辞与实现一致；P2×3 全为判据覆盖/计数口径/文档预期项（无假绿、无需返工），P3×7 为脆性与披露项。
**复审提示**: 本报告为 Round 0。若 Coordinator 判定 P2-1/P2-2/P2-3 需本轮返工（三者合计 ≈6 行代码 + 2 句文档，全落在 7 锁内文件），返工后由同一 Reviewer 复审，并按前轮 findings 逐条标注「已修复/未修复/新引入」。
