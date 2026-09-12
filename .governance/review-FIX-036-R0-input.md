# REVIEW-FIX-036-R0（Code Review 输入报告）

- **Task**: FIX-036-R0（P1）— B6 收口（测试基础设施级）代码审查，**Round 0**
- **审查对象**: `D:/AI/agent/deepseek/plugins/router` commit `7fec25e`（HEAD 即 `7fec25e`；`git show --stat` = 5 文件 +178/−41）
- **审查工具边界**: 只读——read/grep/glob + 只读 git + 只读文件系统探查（`git show/log/ls-files/status/config`、`Get-ChildItem/Select-String/Get-Command/ConvertFrom-Json`）；**未执行任何测试、未执行写操作、未修改代码与治理状态**（唯一写入 = 本报告文件）
- **对象完整性**: 审查开始 `git status --porcelain` = `?? .governance/change-triage/FIX-035.json`（**前批产物，不属本批 5 文件**；本批 5 文件工作树干净、无演示残留、无未跟踪新文件）；`git show --numstat 7fec25e` = `ci.yml 23/7`、`README.md 8/6`、`tests/host-contract.mjs 62/19`、`tests/run-all.mjs 65/7`、`tests/smoke.mjs 20/2`，文件集与 `.governance/agent-locks.json:3-23` 的 `target_files`/`file_locks`（5 项，逐一对应）**完全一致** → 范围/锁纪律成立
- **来源**（只读）: `.governance/review-EVO-024-R0-input.md` P1-1（:67-73）/ P1-2（:75-80）/ P2①（:82-87）/ P2②（:89-94）；设计依据 `.governance/arch-004-compatibility-design.md` §5.1 L272 / §5.3 第①步 / §10 B6；台账 `.governance/plan-tracker.md:35`
- **行尾声明核验**: `git ls-files --eol` 五文件均 `i/lf w/crlf attr/(空)`，`core.autocrlf=true`，无 `.gitattributes`；numstat 为小 hunk 非整文件重写 → **CRLF 回正后提交内容面不变，声明成立**（无行尾噪声）

## 1. 审查结论

**APPROVED_WITH_NOTES**（`unresolved_blockers=0`）

- P0 = **0** / P1 = **1** / P2 = **3** / P3 = **6**
- 硬门槛：P0=0 ✅ / 5 维 100% ✅ / 每条发现带级别 ✅ / 设计一致性完成 ✅ / AI 专项 5 项完成 ✅
- **一句话理由**：R0 的两项 P1 已被真实修复且可静态复算——`smoke.mjs` 平台硬依赖改为探测 `powershell`/`pwsh` 择一（本机双宿主 → 断言 1→2 条，**强度未弱化**；探针判据 `error === undefined && status === 0` 与原始 `spawnSync` 语义逐字相符）、`run-all` 显式排除 4 个 runner 模块并机器断言 `smoke.mjs` 仍 import 且调用四个 `runX`（5 类 fail-fast 条件齐备、计数 20 套件 + 4 runner 与 `tests/` 实际枚举逐一吻合）、S3 宿主侧包表半边与 S7 靶子确定性/打印均按 R0 建议落地（断言总数 81 / 不可达 70+2 skip 经独立静态清点复算一致），范围与 5 锁纪律干净、零 TODO、零幻觉 API；唯一 P1 是**本批自己声明的「打印可见 skip、禁静默降级」在门控（CI）路径并不成立**——`run-all` 对通过套件只打一行摘要，`smoke`/`host-contract` 的 skip 行被 `stdio: pipe` 吞掉，CI 日志既看不到 `pwsh` 探针结果也看不到「S3/S7 已 skip」，与 `ci.yml:15/21-23`、`README.md:247` 的「以 CI 首跑日志确认」互斥（详见 P1-1），另有 3 项 P2 均为非阻塞增强。

## 2. 硬门槛裁决（逐维）

| 维度 | 结论 | 判定依据（可复查事实） |
|------|------|------------------------|
| 正确性 | **通过**（产品面未触碰；P1-1 在门控可观测性面） | P1-1 修复正确：`smoke.mjs:61-67` 探针判据与 Node `spawnSync` 原始语义一致（成功时 `error === undefined`；ENOENT/超时才置 `Error`），`install-entry.mjs:75-82` 的 `error === null` 源于其自定义 `runCommand` 归一（`:65` `finish({code}, null)`），**注释所声明的形态差异属实**，不可照搬的判断成立；`smoke.mjs:73-76` 对每个可用宿主各跑一条解析断言、`:68-70` 两宿主皆无才跳过且 exit 码仍只由 `failures` 决定（`:3052-3053`）→ 无假红、无假绿；P1-2：`run-all.mjs:93-95` 排除 4 模块后枚举恰 20 套件（`tests/` 25 个 `.mjs` − `run-all.mjs` − 4 runner = 20，实测枚举逐一核对）；P2②：`host-contract.mjs:318` `.sort().reverse()` 消解 `readdirSync` 顺序依赖，`:326-331` 打印实际靶子/来源/未选候选；P2①：`:469-472` 用 `name.slice(name.indexOf('/')+1)` 剥 scope 前缀与 `hostTarget.root`（= `@deepseek-ai` 目录本身，判据 `:323`）拼接，语义正确 |
| 安全性 | **通过** | 本批 diff 无凭据/token/密钥；`ci.yml` 仍为零 secrets、零外部下载（改的是注释）；新增代码只做 `readFileSync`/`existsSync`/`readdirSync` 与 `spawnSync('powershell'\|'pwsh', …)`（固定可执行名 + 固定 `-Command` 常量，无用户输入拼接 → 无命令注入面）；打印面仅套件名/模块名/runX 名/宿主靶子路径（本地环境路径，非用户数据/凭据）；S7/S3 对宿主只读零写入（`host-contract.mjs:304-306` 注释声明与实际一致） |
| 可维护性 | **通过**（P3-1/P3-2/P3-5 为脆性与重复 nit） | 注释密度与意图说明充分且**锚点准确**（`smoke.mjs:58` 引 `install-entry.mjs:74-77` 经核验命中：`:74` JSDoc、`:77` `for (const exe of ['powershell','pwsh'])`）；P2② 把「靶子解析」收敛为**单一实现路径**（S3 宿主侧与 S7 共用 `hostTarget`，`host-contract.mjs:305` 显式声明），消除 R0 时的两处独立解析；`run-all` 的 pre-flight 逐模块 `continue` 后集中报错、诊断含模块名与原因（`:85-88`）；命名表意（`RUNNER_MODULES`/`SMOKE_SUITE`/`hostTarget`）；无重复代码新增（探针双实现见 P3-5）；函数长度均在阈值内（pre-flight 块 38 行、靶子解析 IIFE 15 行） |
| 性能 | **通过** | pre-flight 为零子进程纯文本校验（`smoke.mjs` 一次读取 + 每 runner 一次读取 = 5 次 `readFileSync`，`:54/:63`），正则均为单次线性扫描；靶子解析 1 次 `readdirSync` + 候选数级 `existsSync`（`:318-323`）；`smoke.mjs` 新增至多 4 次 `spawnSync`（2 探针 + 2 解析，仅在宿主可用时），无循环内 I/O、无 O(n²)、无常驻资源；P3-6 之外的超时面与 R0 P3-1/P3-2 一致（未在本批处理） |
| 测试覆盖 | **通过但附 1 项 P1 + 3 项 P2** | 断言总数独立静态清点 = **81**（宿主可达）= S1 16 + S2 10（3 锚 × 〔1+1+1〕+1 extra）+ S3 12（11 + 宿主侧 1）+ S4 7 + S5 21（6 面 × 3 + 3 非循环）+ S6 5 + S7 10（1 + 6 + 3），与 `check(` 站点数 56 + 循环展开 +25 逐一吻合；宿主不可达 = 81 − S7 10 − S3宿主 1 = **70**，`note()` 站点恰 2 → 与 Developer 声称「81 / 70+2」及 `ci.yml:18-19`「其余 70 条静态断言照跑」一致；套件口径 20+4 与 README:226 / ci.yml:12-14 同名同数一致；缺口 = 门控路径 skip 不可见（P1-1）、排除清单单向（P2-1）、靶子正确性启发式（P2-2）、`smoke.mjs:94-96` 三条死守卫（P2-3） |

**AI 代码专项 5 项**

| # | 项 | 结论 | 依据 |
|---|----|------|------|
| 1 | mock 残留 | ✅ 无 | 本批 diff 无新增 mock/桩；pre-flight 读**真实** `tests/*.mjs` 源码（`run-all.mjs:54/63`），靶子解析读**真实**宿主目录（`host-contract.mjs:323`）；无「假文件代替真校验」形态 |
| 2 | 硬编码返回值 | ✅ 无 | 无恒真/恒假返回；`psHosts` 由真实探针过滤（`smoke.mjs:61-67`），`hostTarget.root` 由真实 `existsSync` 判据决定（`:323`），`missingClientPackages` 由真实目录枚举（`:469-470`）——既有 `fakeLlm`（`host-contract.mjs:346`）为判别夹具且非本批引入 |
| 3 | 幻觉 API | ✅ **零幻觉（本批逐项核对）** | `spawnSync` 返回对象字段语义（`error` 成功为 `undefined`、`status` 为退出码）与 Node 文档一致，且 Developer 偏差 1 的自我修正方向正确（R0 教训方向相反者=幻觉）；`readdirSync().sort().reverse()`、`existsSync`、`readFileSync(…, 'utf8')`、`String.prototype.matchAll`、`RegExp`、`Array.prototype.find/continue` 均为真实 API；`process.env.LOCALAPPDATA/DSH_HOST_SOURCE/DSH_HOST_PACKAGES` 均为真实环境变量；无虚构宿主 API/路径（S7 锚行号 `host-contract.mjs:607-651` 为 R0 已逐行核对面，本批未改其值） |
| 4 | 未实现 TODO | ✅ 无 | 5 文件全文 grep `TODO\|FIXME\|XXX\|HACK` = **0 命中**（非仅 diff 面） |
| 5 | 过度实现 | ✅ 无越界 | 4 项声称 ↔ 代码一一映射：P1-1→`smoke.mjs:53-77`；P1-2→`run-all.mjs:39-47/52-91/93-95/103/133`；P2①→`host-contract.mjs:462-475`；P2②→`host-contract.mjs:304-331` + S7 复用；其余为 `ci.yml`/README 边界文案同步（R0 P1-1/P2-3 要求）。未引入设计外能力（未做 §5.3 第③步「锁版本装宿主」）；未夹带产品代码（`lib/**` 零改动） |

**设计一致性**：§5.1 L272「inject 声明 vs 宿主 node_modules 实际包表」宿主侧半边**本批落地**（`host-contract.mjs:462-475`，R0 P2① 归口项）；§5.3 第①步 CI 边界「如实标注」维持且更细（`ci.yml:15-33`），未越界实现第③步；BR-03「静态守卫不依赖宿主」保持（`:466/597` 不可达 → `note()` 不失败，退出码仍只由 `failures` 决定 `:659`）；P4（看护不得静默降级）方向正确但门控路径仍有可观测缺口（P1-1）；P5（单点化）在 S3/S7 上达成单一实现路径（`:305/311-325`）、在测试探针上仍双实现（P3-5）；P8（降级可观测）在套件内成立、在被门控吞掉处不成立（P1-1）；P10-④（禁按心智模型伪造宿主面）在 S3 宿主侧用**宿主实读判据**（`existsSync` 真实包目录）而非手抄假设，合规。

## 3. 守卫静态推演（本批判别力核验）

### 3.1 `run-all` runner 覆盖 pre-flight（`tests/run-all.mjs:52-91`）

| # | 触发条件 | 是否 fail-fast（exit 1） | 静态推演路径 |
|---|---------|------------------------|--------------|
| 1 | 登记的 runner 模块不存在 | **是** | `:59-62` `existsSync(path)` 为假 → `problems.push` → `:84-88` 红（清单陈旧不留空洞） |
| 2 | 登记项含退出闸（已被当作套件） | **是** | `:64-67` `/process\.exit/` 命中 → 红（**宽容匹配**：`process.exitCode` 也命中，见 P3-3；对「已含退出闸不得排除」方向是有益的） |
| 3 | 零 `runX` 导出（非 runner 形态） | **是** | `:68-72` `/export\s+(?:async\s+)?function\s+(run[A-Za-z0-9_]*)/g` 无捕获 → 红（**fail-closed**：`export const runX = …` 形态会误判为红，见 P3-2） |
| 4 | `smoke.mjs` 未 import 该模块 | **是** | `:73-75` `from\s*['"]\./<module>['"]` 未命中 → 红（防「排除即丢覆盖」） |
| 5 | `smoke.mjs` 未调用 `runX` | **是** | `:76-81` `\b<name>\s*\(` 未命中 → 红（注释声明的「import 行名后接 `}` 故不误判」成立：`smoke.mjs:6-13` import 行确无 `(`） |
| — | 新 runner 模块**漏登记** | **否**（残留） | `:93-95` 只按 `!RUNNER_MODULES.includes(name)` 过滤：未登记且零断言的模块仍被当套件执行 → 0 退出 → `:119` 打印幻影 `PASS`（`:14-16` 注释已自认「漏登记 → 幻影 PASS 被本清单拦不住」）→ 见 P2-1 |

四条实际接线核验：`attachments.mjs:78` / `audit-001-concurrency.mjs:203` / `client-render.mjs:14` / `install-entry.mjs:208` 各恰导出 1 个 `runX`，四者全文 `/process\.exit/` **零命中**、顶层无执行语句（逐文件列 0 列非 import/export/注释/声明 行 = 仅函数闭合 `}`；`install-entry.mjs:135-141` 的 `try {` 位于生成 PS 脚本的模板字符串内，非 JS 顶层）→ 排除不丢任何真实断言；调用点 `smoke.mjs:2333/2336/2355/3050` 四处在场（行号相对 R0 记录的 2315/2318/2337/3032 偏移 +18，与本批在 `:52-77` 新增 18 行一致，内部自洽）。另核 5 个「双形态」模块（`adapter-parity.mjs:83` / `oauth-credentials.mjs:46` / `oauth-loopback.mjs:81` / `oauth-promotion.mjs:33` / `stats.mjs:63`）亦导出 `runX`，但均有顶层 `invokedDirectly` 主入口守卫（`oauth-credentials.mjs:448-460`、`stats.mjs:664-674`）→ **不应**排除，实际也未排除 → 分类正确（今天 20 个被枚举套件**全部**含 `process.exit`/`process.exitCode`，为 P2-1 的收口方案提供零假红可行性）。

### 3.2 `smoke.mjs` PS 宿主探测三变体（`tests/smoke.mjs:53-77`）

| 变体 | 静态结果 | 依据 |
|------|---------|------|
| 双宿主可用（**本机实况**） | `install.ps1 parses (powershell)` + `install.ps1 parses (pwsh)` **2 条断言** | 本机 `Get-Command`：`C:\windows\System32\WindowsPowerShell\v1.0\powershell.exe`（5.1）+ `C:\Program Files\WindowsApps\Microsoft.PowerShell_7.6.6.0_x64__…\pwsh.exe`（7.6.6）→ `:61-67` filter 双真 → `:73-76` 循环 2 次 ⇒ **断言强度相对 R0 的 1 条未弱化（+1）** |
| 仅 `pwsh`（Ubuntu CI 预期） | 1 条 `(pwsh)` 断言、无 skip 行 | 同过滤器仅 pwsh 为真 |
| 无宿主（CI 缺 pwsh） | 0 条断言 + `:69` 一行 skip + **exit 0** | `psHosts.length === 0` → `console.log` 后循环体空转；`failures` 不变 → `:3053` `exit 0`（不失败，BR-03 语义）；**但该行在门控路径不可见 → P1-1** |
| 探针失败但另一宿主可用 | 静默少一条断言 | `psHosts.length > 0` 时不打印任何提示 → 见 P1-1 子项 (b) |

RED 复现（R0 P1-1 的原始缺陷）静态推演**成立**：旧代码 `spawnSync('powershell', …)` 在 PATH 剥离下 `error=ENOENT`、`status=null` → `check(…, null === 0)` 为假 → FAIL → `:3053` `exit 1`；修复后同一 PATH 下两探针皆否 → skip → `exit 0`。

### 3.3 S3 宿主侧半边 + S7 靶子确定性（`tests/host-contract.mjs:304-331/462-475/594-653`）

- **确定性**：`:318` `.sort().reverse()`（ASCII 目录名 → JS 字符串序 = PowerShell `Sort-Object` 序，实测降序首项 = `1e7f6d9597241db0`，次项 `1da1392061ab1944`）；`_npx` 两候选**均为有效命中**（各自 `dsh-api-remotes/lib/client.js` 存在；`dsh-client-ui-settings`/`dsh-client-locale` 均在）⇒ 旧代码「首个命中」确实两种结果都可能（R0 P2-2 成立），新代码恒取 `1e7f…`。
- **优先序保持**：`DSH_HOST_SOURCE`(:313) > `DSH_HOST_PACKAGES`(:314) > `_npx` 降序(:318)，与旧实现语义一致（旧为显式候选在前 + `.find`），无行为回退。
- **打印面**（`:326-331`）：打印靶子绝对路径、来源标签、候选总数、未选候选；不可达时打印 skip 原因 → 可诊断性达成（R0 P2② 建议的主体）。
- **S3 宿主侧 RED 判别力**：靶子存在但缺任一 inject client 包 → `missingClientPackages` 非空 → 恰 1 条 FAIL → `:659` `exit 1`（Dev 声称「单条红」在 `D:\…\isolated-root` 场景下静态成立，前提是隔离 root 含 S7 读取的宿主文件，否则 S7 会叠加红）。
- **计数**：宿主可达 81（见 §2 测试覆盖行独立清点），不可达 70 + 2 `note()`；`ci.yml:18-19`「其余 70 条」表述**准确**。
- **S3 断言强度边界**：判据为**目录存在性**（`:470`），不含 `package.json` 存在性/版本一致性 → 见 P3-4。

## 4. Developer 声称核验（8 条逐条）

| # | 声称 | 核验 | 证据 |
|---|------|------|------|
| 1 | P1-1 探测择一 + 缺失可见 skip + RED（PATH 剥离 → exit 1）+ 三 GREEN 变体 | **成立（静态推演全通过）**；执行侧见 §6 | §3.2；`smoke.mjs:61-76`；本机双宿主 → 2 断言，强度未弱化 |
| 2 | P1-2 排除清单（4 runner）+ 双向守卫（5 类条件）+ 计数如实（20 套件 + 4 runner）+ 负向演示 A/B 后复原 | **成立**；「双向」在「登记→接线」方向完备，「未登记新 runner」方向仍有残留（P2-1） | §3.1；`run-all.mjs:39-47/52-95/103/133`；`tests/` 25 文件枚举逐一核对；提交面无可复原痕迹（工作树干净） |
| 3 | P2① S3 宿主侧 +1 断言（可达 81；不可达 70+2 skip 可见） | **成立（独立复算一致）** | §3.3；`host-contract.mjs:462-475/656-659`；清点 81 = 16+10+12+7+21+5+10；`note()` 站点 = 2 |
| 4 | P2② 确定性选择：旧选 `1da1392061ab1944`、新选 `1e7f6d9597241db0`（=运行宿主） | **成立（新行为可静态确证；「=运行宿主」有独立佐证）**；**「陈旧副本」定性无证据支持** | `host-contract.mjs:318`；两缓存实况：`1e7f…`（scope 目录 mtime 2026-09-11 16:28，dsh-llm `0.1.5-rc.2`）与 `1da1…`（mtime **16:55**，同为 `0.1.5-rc.2`）——**`1da1` 的 mtime 反而更晚、版本相同**；「运行宿主 = `1e7f…`」由本会话环境事实佐证（DSH 实现 checkout 位于 `…\npm-cache\_npx\1e7f6d9597241db0\`）→ 旧行为取舍**未复跑验证**（未执行 node，见 §6），新行为确定性成立 |
| 5 | 偏差 1：探针判据偏离（`probe.error === null` 是自定义封装，原始为 `undefined`；首版恒 false 由 A/B 捕获后修正） | **成立（且注释叙述与源码逐字相符）** | `install-entry.mjs:75-82`（`runCommand` 封装，成功时 `error` 为 `null`，`:65`）；原始 `spawnSync` 成功时 `error === undefined`；`smoke.mjs:62-66` 注释如实说明「形态不可照搬」→ 该修正是**反幻觉方向**的正确处理 |
| 6 | 偏差 5：`ci.yml`/README「ubuntu-latest 自带 pwsh 7」标注待 CI 首跑确认 | **成立（措辞确为预期+待确认）**，但**确认机制不成立** → P1-1 | `ci.yml:21-23`「预期自带…**该平台事实以 CI 首跑日志确认**…打印可见 skip（非静默通过）」；`README.md:247` 同义；设备侧机制：`run-all.mjs:110`（默认 `pipe`）+ `:118-120`（仅打印 PASS 摘要）+ `:124-128`（仅失败打印尾部） |
| 7 | 额外发现：`smoke.mjs:94-96` 三条死守卫（`check` 真值语义 + 非空字符串 = 恒 ok） | **成立（逐字核验，且范围清点精确）** | `smoke.mjs:31-35` `check(label, condition)` 为真值判断；`:94-96` 三处 `… ? true : \`missing: …\`` 两支均真值 → **恒 ok**（缺键时还会以 ok 形式打印，比不打印更具误导性）；全 `tests/` grep `? true :` **仅此 3 站点**，无同类扩散；属本批之前既有缺陷，Dev 未顺手修（见 P2-3 裁决口径） |
| 8 | 环境纪律：PATH 进程内变体 / TEMP 隔离 root（Copy-Item 非 junction）/ 宿主只读 / 无网络 | **部分可核**：只读性与无网络可从代码面证实（S7/S3 仅 `readFileSync/existsSync`，无网络 API）；**执行过程细节不可从提交对象核验**（不构成不实） | `host-contract.mjs:304-306` 注释「只读宿主源码，零写入」与代码一致；提交面 5 文件无隔离 root/junction 残留；工作树干净 |

## 5. 发现清单

### P1-1 「打印可见 skip、禁静默降级」在门控（CI）路径不成立——`run-all` 吞掉通过套件的 skip 输出（声明与机制互斥）

- **位置**: `tests/run-all.mjs:110`（`stdio: verbose ? 'inherit' : 'pipe'`）+ `:118-120`（通过套件仅打一行 `PASS <suite>`）+ `:124-128`（仅失败打印 25 行尾部）；`tests/smoke.mjs:69`（skip 经 `console.log`）+ `:3052`（汇总行 `ALL SMOKE TESTS PASSED`，**无 skipped 计数**）；`tests/host-contract.mjs:89/656-658`（`--  skipped` 与 `(N assertions, M skipped)` 同被吞）；声明面 `.github/workflows/ci.yml:15`（「打印可见 skip、不失败——禁静默降级」）`:18`（「记 `--  skipped`」）`:21-23`（「该平台事实以 CI 首跑日志确认」）、`README.md:247`（同）
- **依据（可复查事实）**: CI 门控命令为 `node tests/run-all.mjs`（`ci.yml:76-77`，无 `--verbose`）→ 任何通过套件的 stdout/stderr 都被 `pipe` 捕获且**不转发**（`:118-120` 只打印摘要；`:124-128` 只在失败时打印尾部）→ 三种 skip（`smoke` 的 PS 解析、`host-contract` 的 S3 宿主侧半边、S7 增强组）在 CI 日志中**零可见性**；若 ubuntu 运行器**没有** pwsh，CI 仍打印 `ALL 20 SUITES + 4 RUNNER MODULES (via smoke.mjs) PASSED`，日志中无任何「Windows 关键断言已跳过」的痕迹；反之若运维者想按 `ci.yml:22` 的声明「以 CI 首跑日志确认 pwsh 平台事实」，**该日志不含 pwsh 探针结果**（探针只在子进程内跑，结果不落任何汇总行）→ 声明的确认方法不可执行。同类机制问题使 `ci.yml:18` 的「记 `\-\-  skipped`」对该读者同样不可见。子项 (b)：`smoke.mjs:61-67` 只在**全部**宿主不可用时打印 skip；若 `pwsh` 存在但 `-Command exit 0` 探针非 0（例如 7.x 安装损坏），则该臂**静默消失**且无任何提示（`:68` 条件不满足），构成 P8（失败/降级 MUST 可观测）在本批新增路径上的漏洞。
- **影响**: ①CI 首跑的「覆盖边界」声明无法被日志证实，R0 P1-1 的教训（标注与实际不符）以更弱形式回归；②Windows 面看护（install.ps1 解析）在 CI 上可能整条静默缺席而门控全绿——被跳过的恰是本批为之加固的那条断言；③`host-contract` 的 S3 宿主侧半边在 CI 必然 skip（无 `LOCALAPPDATA`/`DSH_HOST_SOURCE`），其「已新增但 CI 从未执行」的事实无日志痕迹。
- **建议（择一或组合，均 ≤10 行）**: (a) `run-all.mjs` 在汇总行统计并打印 skip 信息——识别套件输出中的结构化标记（建议套件统一以 `#SKIP n` 行上报），或对「输出含 skip 标记」的通过套件补打摘要行；(b) `smoke.mjs:3052` 汇总行加 skipped 计数（照 `host-contract.mjs:656-657` 先例），并对**每个**被探针判否的宿主打印一行原因（`skip <host> (probe failed: status=…, code=…)`）；(c) 若维持现状，MUST 修正 `ci.yml:15/18/21-23` 与 `README.md:247` 的措辞为「套件内打印 skip（门控默认输出不回显；本地 `node tests/smoke.mjs` 或 `--verbose` 可见）」，并在 plan-tracker 记录「CI 日志不含 skip 事实 → pwsh 平台事实改由首跑时执行 `node -v && pwsh -v` 附加步骤确认」。
- **标注**: **静态判定**（代码路径 + `stdio` 配置 + CI 命令形态三元确定）；未实跑（不执行测试），可由 `node tests/run-all.mjs` 观察输出行数、或首个 CI run 日志即时确认。

### P2-1 `run-all` pre-flight 仍为单向守卫：**新 runner 模块漏登记** → 幻影 PASS 可复发

- **位置**: `tests/run-all.mjs:93-95`（枚举只按 `!RUNNER_MODULES.includes(name)` 过滤）+ `:14-16`（注释已自认「漏登记 → 幻影 PASS 被本清单拦不住」）；声明面 `:43-45`、`README.md:226`（「机器断言…调用点在场」未含反向）
- **依据**: 5 类 fail-fast 全部作用于「**已在清单内**」的模块（§3.1）；对未登记的新模块无任何判据——一个新增的「只 `export async function runX(check)`、无顶层执行、无 `process.exit`」模块（正是本批排除的 4 个模块的形态）被放进 `tests/` 后，`:93-95` 仍会把它当套件执行 → 0 退出 → `:119` 打印 `PASS`、`:133` 计入套件数 → **R0 P1-2 的症状原样复发**（计数虚高 + 静默覆盖丢失），且 `smoke.mjs` 若也接了线则断言双跑、若未接线则断言只在 smoke 侧跑。
- **影响**: 「排除即丢覆盖」在**登记方向**已闭环，在**新增方向**仍依赖人肉纪律；门控的「零零断言套件」性质未被机器保证。
- **建议（低成本、今日零假红）**: 对每个**未被排除**的枚举套件补一条反向断言——源码 MUST 命中 `process\.exit|process\.exitCode|invokedDirectly`（即「有独立入口/退出闸」），否则判为「疑似 runner 模块未登记」→ `problems.push` + exit 1。可行性已核：**今日 20/20 被枚举套件全部命中**（`audit-001.mjs:17` 经 `process.exitCode` 命中，其余 19 个经 `process.exit`），4 个 runner 模块 0 命中 → 实现后不产生任何假红。
- **标注**: 静态判定；未实跑。

### P2-2 靶子「确定性」≠ 指向**运行宿主**：S3 宿主侧半边把误选影响面从 S7 值级断言扩大到声明面包表断言（可假红/假绿）

- **位置**: `tests/host-contract.mjs:315-325`（降序字典序启发式）、`:462-475`（S3 宿主侧依赖同一靶子）、`:594-653`（S7 依赖同一靶子）；声明面 `README.md:240`、`ci.yml:16-19`
- **依据**: `_npx/<hash>` 目录名是 npm 的解析哈希，**与「当前运行宿主」无因果关系**；本机两候选同为 `0.1.5-rc.2` 且互不陈旧（`1da1…` scope mtime 反而更晚，见 §4-4），本次降序恰命中运行宿主属**巧合性正确**；若在他机降序首项为旧版/裁剪副本：①S7 值级断言 → 假红（旧版字段面不同）或假绿（旧副本未漂移而运行宿主已漂移 → **RISK-003 预警本体失效**）；②**本批新增**的 S3 宿主侧包表断言依赖同一靶子——一份早于 `dsh-client-ui-settings` 出现的旧缓存副本会让门控在宿主正常时报红（影响面相对 R0 扩大）。R0 P2-2 建议的「打印各关键包版本」「DSH_HOST_SOURCE 定为唯一权威」两项**未落实**（仅落地下排序 + 路径/来源/未选候选打印）。
- **影响**: 确定性提升（R0 目标）已达成，但「预警对象 = 运行宿主」仍未机器保证；误选时门控给出与运行宿主无关的红/绿。
- **建议**: 在选择命中后追加一条**版本一致性**判据（读所选靶子 `dsh-llm/package.json` 的 `version`，与 `tests/host-version-snapshot.mjs:44-46` 的 `HOST_BASELINE.dshPackages` 比对）：不一致 → 打印显式告警行并记 `note()`（或红，由 Coordinator 裁决语义）；同时把选定靶子的关键包版本打印进启动行（R0 原建议）；或将 `DSH_HOST_SOURCE` 提为唯一权威、`_npx` 探测仅在「恰好 1 个候选」时启用。
- **标注**: 静态判定（选择逻辑 + 环境实况）；「他机降序首项为旧副本」为条件性推演，未实跑。

### P2-3 `smoke.mjs:94-96` 三条**死守卫**（Developer 如实上报，核验成立）——门控对「文案键覆盖」零判别力

- **位置**: `tests/smoke.mjs:94-96`（配合 `:31-35` 的 `check(label, condition)` 真值语义）
- **依据**: `check('client label keys covered (zh)', missingZh.length === 0 ? true : \`missing: ${missingZh.join(', ')}\`)` → 条件不满足时传入**非空字符串**（真值）→ `if (condition)` 为真 → 打印 `ok  client label keys covered (zh)`：**三条守卫在任何输入下恒 ok**（且以 ok 形式掩盖缺键）。全 `tests/` 范围 grep `? true :` **仅此 3 处**，无同类扩散（范围清点精确）。缺键后果按同段注释为「渲染期崩溃」（`:78-79`），故这是「有机器防线之名、无其实」的静默覆盖空洞，与 R0 P1-2（幻影 PASS）同属一类。
- **影响**: client 文案键缺失/双表不一致在门控全绿下静默；四条防线（缺失即崩溃的高危面）实际为零。
- **建议**: 改为 `check('client label keys covered (zh)', missingZh.length === 0, missingZh)`（`host-contract.mjs:82-88` 的 `check(label, condition, detail)` 三参形态即正确先例，可直接对齐）；或 `if (cond) ok else fail` 语义。**归口裁决**: 该项非本批引入、且修复会改变门控红绿语义（可能立刻暴露真实键缺口 → 需连带排查文案表），若纳入本批则为 P1 级；建议**独立归口（FIX-037 候选）并限期**，勿在本批顺手改（符合 P4 编程要求 4「保持修改的纯粹性」）。
- **标注**: 静态判定（逐字读 + 全目录 grep）；修复后首次运行结果未知（可能翻红）。

## 6. P3（6 条，非阻塞）

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| P3-1 | `tests/run-all.mjs:76-81` | 调用点判据 `\b<name>\s*\(` 是**文本存在性**：`smoke.mjs` 中出现在注释或字符串里的 `runAttachmentTests(` 也会让守卫通过（守卫为「在场证据」而非「真调用」） | 复用 `host-contract.mjs:97-99` 的 `stripComments` 先剥注释再匹配，或解析 import 绑定后只认顶层调用 |
| P3-2 | `tests/run-all.mjs:68-72` | 导出提取仅认 `export [async] function runX`：若新 runner 用 `export const runX = async () => {}` 写成，会落到「零 runX 导出」→ **假红**（fail-closed，方向安全但脆弱）；同块 `:54/:63` 的 `readFileSync` 无 try/catch，`smoke.mjs` 缺失时以未捕获异常栈终止（有退出码但无结构化诊断） | 扩展提取正则（同时支持 `export const runX =`），或改为显式握手（模块内 `export const RUNNER_MODULE = true`）；`readFileSync` 包一层 try/catch 输出 `pre-flight 失败: 无法读取 <file>` |
| P3-3 | `tests/run-all.mjs:64` | `/process\.exit/` 子串判据把 `process.exitCode` 一并命中，与文案「含 process.exit」不完全等价（对本守卫方向无害，且反向断言方案 P2-1 正依赖该宽容） | 注释显式声明「含 `process.exit`/`process.exitCode` 任一即视为独立套件」，或改 `process\.exit(Code)?\b` 并同步文案 |
| P3-4 | `tests/host-contract.mjs:469-472` | S3 宿主侧判据 = **目录存在性**（`existsSync(join(root, pkgName))`），未验证该目录是有效包（`package.json` 在位）或版本与宿主基线一致 → 空目录/残留目录会假绿 | 追加 `existsSync(join(root, pkgName, 'package.json'))`（一行），或与 P2-2 的版本判据合并 |
| P3-5 | `tests/smoke.mjs:61-67` vs `tests/install-entry.mjs:75-82` | 「探测可用 PS 宿主」在同一测试网内**双实现**且**判据不同**（`error === undefined && status === 0` vs `error === null`）：P5 方向（同一动作汇入同一实现路径）未贯彻，未来易漂移（如 install-entry 侧的 wrapper 若改为保留原始 `error`，两处择主逻辑将不一致） | 抽公共 helper（`install-entry.mjs` 已导出 `runX`，可再导出 `powerShellHosts()`；或新增 `tests/lib/ps-hosts.mjs`），至少在两处注释互相声明判据差异的正当性（当前仅 smoke 侧单边说明） |
| P3-6 | 工作区（非本批 5 文件） | `git status` 显示 `.governance/change-triage/FIX-035.json` **未跟踪**（`.governance` 在 git 内共 287 个受跟踪文件，说明治理记录通常入库）→ 前批（FIX-035）triage 记录未纳入版本控制 | Coordinator 确认后补提交或明确其为本地暂存物（与本批 7fec25e 无关，仅纪律观察） |

## 7. 遗留项与关闭期限建议

| ID | 内容 | 建议期限 | 备注 |
|----|------|---------|------|
| L-1（P1-1） | 门控路径 skip 可见性（run-all 汇总/回显 或 修正 ci.yml:15-23 + README:247 措辞 + plan-tracker 记录首跑确认替代法） | **CI 首跑前**（≤10 行，全落在 5 锁内文件）；若延期 MUST 先修正声明措辞并登记 | 直接关系 `ci.yml` 覆盖边界声明的真实性（R0 P1-1 同类） |
| L-2（P2-1） | 反向断言（未排除套件 MUST 含 `process.exit`/`exitCode`/`invokedDirectly`） | 本轮顺手或最迟下一批；今日零假红、约 6 行 | 完全落在 `run-all.mjs` 内 |
| L-3（P2-2） | 靶子版本一致性判据 + 打印关键包版本（或提升 `DSH_HOST_SOURCE` 权威性） | 随下一批机械处理或 CI 首跑后回填 | R0 P2-2 的未落实半项 |
| L-4（P2-3） | `smoke.mjs:94-96` 三死守卫 | 独立归口（FIX-037 候选）并限期；**不阻塞本批** | 修复可能立即暴露真实文案键缺口（需连带排查） |
| L-5（P3-1…P3-6） | 守卫脆性、判据精确性、探针双实现、治理记录入库 | 可台账化，非阻塞 | — |
| L-6（R0 未在本批范围） | R0 P2-3（README 字段口径的单向性表述）、R0 P2-4（`ci.yml:34-42` 的「公开 registry 可解析」仍为未闭环断言，未加「待首跑确认」）、R0 P3-1…P3-8 | 随 CI 首跑或后续批次 | 本批 scope 明确为 P1-1/P1-2/P2①②，**上述项保持 open，勿视为已关闭** |

## 8. 未验证 / 待验证（事实依据红线）

| 项 | 状态 |
|----|------|
| CI 首跑实况（ubuntu 是否自带 pwsh、`@deepseek-ai/*` 在无凭据下可解析性、20 套件实际输出与时长） | **未验证**——Developer 如实声明「未实跑（push 后首跑）」；本报告对 CI 的判定均为静态推理（P1-1 依据 `stdio` 配置 + CI 命令形态；registry 属 R0 P2-4 未闭环项） |
| Dev 声称的执行侧证据：RED 复现 exit 1、三 GREEN 变体、run-all 负向演示 A/B 各 exit 1、S3 隔离 root 单条红、全量网 `ALL 20 SUITES + 4 RUNNER MODULES PASSED (23.6s)` exit 0 | **未验证（本 Reviewer 不执行测试）**；其**机制静态推演全部成立**（§3.1/§3.2/§3.3）；汇总行文案与 `run-all.mjs:133` 逐字同形 |
| 旧代码 `readdirSync` 的实际枚举顺序（即旧行为究竟取 `1da1…` 还是 `1e7f…`） | **未验证**（未执行 node）；`Get-ChildItem`/NTFS 索引序与 `Sort-Object` 实测为 `1da1…` 在前，与 Dev 声称一致但不等价于 Node 的 `readdirSync` |
| `1da1392061ab1944` 为「陈旧副本」的定性 | **无证据支持**——其 `@deepseek-ai` scope 目录 mtime（2026-09-11 16:55）**晚于** `1e7f…`（16:28），且 `dsh-llm` 同为 `0.1.5-rc.2`；可支持的正确表述为「非运行宿主副本」 |
| `smoke.mjs` 全部断言在剥离 PATH 变体下其余部分不受影响（Dev 称 `exit 0`） | **未验证**（未实跑）；静态面：`lib/*.js` 语法检查走 `process.execPath` 绝对路径（`:50`）不依赖 PATH，`install-entry` 的 `sh`/`curl` 臂会随 PATH 缺失走 skip（`install-entry.mjs:296-300`） |
| `host-contract.mjs` 运行时绿（本机 81 条全绿 / CI 70 条全绿） | **静态复算通过**（常量 ↔ 仓库源码 ↔ 靶子实况三方一致；断言数 81/70 独立清点吻合）；**本 Reviewer 未执行套件** |
| 本机 `pwsh` 臂对 `install.ps1` 的解析结果 | **未验证**（未跑）；仅验证 `pwsh.exe` 7.6.6 存在（`Get-Command`），不足以断言解析通过 |
| 5 个「双形态」模块的主入口守卫在 smoke 进程内不漏执行顶层 | **已静态确认**（`oauth-credentials.mjs:448-450`、`stats.mjs:664` 形态；其余 3 个同构），未实跑 |

## 9. 证据索引（可复查事实）

- 提交对象：`git show --stat 7fec25e`（5 文件 +178/−41）；`git show --numstat`（23/7、8/6、62/19、65/7、20/2）；`git ls-files --eol` 五文件 `i/lf w/crlf`；`git config core.autocrlf` = `true`；无 `.gitattributes`
- 锁与范围：`.governance/agent-locks.json:3-23`（FIX-036 `target_files`/`file_locks` = 5 文件，与提交集全等）
- P1-1 面：`tests/smoke.mjs:53-77`（探测/跳过/逐宿主断言）、`:94-96`（死守卫）、`:3052-3053`（汇总与退出码）；`tests/install-entry.mjs:74-82`（先例封装）、`:267-270`（PowerShell 臂 skip）、`:296-300`（POSIX 臂 skip）
- 门控面：`tests/run-all.mjs:39-47`（清单与常量）、`:52-91`（pre-flight）、`:93-95`（枚举）、`:103`（启动行）、`:109-128`（子进程/stdio/摘要/失败尾部）、`:131-137`（汇总与退出码）；`tests/host-contract.mjs:82-89`（`check`/`note`）、`:656-659`（汇总与退出码）
- P1-2 面：`tests/attachments.mjs:78` / `tests/audit-001-concurrency.mjs:203` / `tests/client-render.mjs:14` / `tests/install-entry.mjs:208`（runX 导出，四文件 `/process\.exit/` 零命中、顶层无执行）；`tests/smoke.mjs:6-13`（import）、`:2333/2336/2355/3050`（调用点）；`tests/adapter-parity.mjs:361`、`tests/oauth-credentials.mjs:448-460`、`tests/stats.mjs:664-674`（双形态主入口守卫）
- S3/S7 面：`tests/host-contract.mjs:192-193`（`CLIENT_PACKAGE_INJECT_BASELINE`）、`:304-331`（靶子解析与打印）、`:462-475`（S3 宿主侧）、`:594-653`（S7，与 R0 逐行核对面一致）、`:607-651`（宿主锚行号）
- 环境实况：`Get-Command powershell/pwsh`（5.1 + 7.6.6）；`%LOCALAPPDATA%\npm-cache\_npx` 两候选（`1da1392061ab1944` / `1e7f6d9597241db0`）各自 `dsh-api-remotes/lib/client.js`、`dsh-client-ui-settings`、`dsh-client-locale` 均存在；各自 `dsh-llm` 版本 `0.1.5-rc.2`；scope 目录 mtime 分别为 2026-09-11 16:55:14 / 16:28:04
- 声明面：`.github/workflows/ci.yml:7-43`（边界与平台事实）、`:76-77`（gate 步骤）；`README.md:219-249`（门控口径 / 静态看护体系 / CI 第①步）
- 基线依据：`tests/host-version-snapshot.mjs:44-46`（`HOST_BASELINE`：dsh `0.1.5-rc.1` / dsh-* `0.1.5-rc.2`）
- 来源与台账：`.governance/review-EVO-024-R0-input.md:67-94`（P1-1/P1-2/P2①/P2②）；`.governance/plan-tracker.md:35`（FIX-036 条目）；`.governance/evidence-log.md:598`（TRIAGE-FIX-036）、`:602`（EV-181）

---

**结论（四选一）**: `APPROVED_WITH_NOTES` · `unresolved_blockers=0` · P0=0 / P1=1 / P2=3 / P3=6
**备注**: R0 的 P1-1/P1-2 与 P2①② 均已按建议落地并经独立静态复算（81/70+2、20+4、五类 fail-fast、三变体、降序确定性）；唯一 P1 为「门控路径 skip 不可见」与本批自述「禁静默降级」的缺口，修复面 ≤10 行且全在 5 锁内文件。
**复审提示**: 本报告为 Round 0；若 Coordinator 判 P1-1 需返工（或选择「保留机制 + 修正 ci.yml/README 措辞」），返工后由同一 Reviewer 复审，并按前轮 findings 逐条标注「已修复/未修复/新引入」。
