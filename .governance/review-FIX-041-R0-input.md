# 代码审查报告（review-FIX-041-R0-input）

- **round = R0**（FIX-041 首轮；前序 = FIX-040 链 R0→R1→R2 终态 APPROVED_WITH_NOTES/0，非本任务轮次）
- **前轮引用（MUST 读，已读）**：`.governance/review-FIX-040-R2-input.md`（§七 P3×3 = 本批 W1 来源；§五 R0 残留裁定 = 本批 W2/W3 来源）
- **审查对象**：`5cc884c..6c9553b`（7 笔）；受审 HEAD = **`6c9553b`**；文件集 = `{lib/client.js, lib/service.js, tests/host-abi-health.mjs, tests/routing-paths.mjs, tests/served-client.js}`（`+72/−25`）
- **审查者**：Code Reviewer Agent（只读；未修改任何产品代码/未改任何被跟踪文件；唯一写入 = 本报告 + 2 个 gitignored 取证脚本 `.test-home/fix041-r0-*.mjs`）
- **执行依据**：7 笔 `git show` 全量 diff 逐行核对 + HEAD 终态逐行阅读 + **独立解析复算**（自建脚本解析 `ANCHOR_OBJECTS_3` 表，21 行 3 元组）＋ `ANCHOR_CASES` 新条目逐串实算 + 断言标签集机比对 + 守卫套件/门控本机独立复跑 + **宿主树只读抽样实算**（`$DSH_HOME/profiles/node_modules/@deepseek-ai`，0.1.5-rc.2）
- **结论（四态）**：**NEEDS_CHANGE**
- **unresolved_blockers**：**1**（P2×2 同源项，见 §四；另 P3×3 不阻塞）
- **计数（本轮新发现）**：P0 = 0 / P1 = 0 / **P2 = 2（同一根因）** / P3 = 3

**一句话理由**：7 笔的**机制面全部成立且经我独立复现**——9h-2c 未知源名**显式判红且不裸抛**（`deadAnchors` 改安全取值后仍能与显式判红并存，未掩盖任何真死锚，与 9h-2 判据**非重复谓词**）；9h-2d「同源恰 1 次」判据我以自建解析器独立复算 = **21/21 count=1（零误红）**、同源副本注入**可判红**（`×2`）、且**仅与 9h-2 的「对象缺失」子面重叠**（`count !== 1`），未引入假阴性、非恒真谓词；W2 六处新锚**逐一核验指向对象实存**（`lib/oauth-llm.js:47 OAUTH_PROVIDER` / `lib/host-abi/health.js:35 noteHostDiag` / `lib/host-abi/client-remotes.js:50 HOST_FACE_ERROR_CODES` / `presetDiagnostics` 方法）、**镜像字节恒等成立**（两文件 SHA256 同 + 396,363B）、**零新幻觉引用**；W3 关键词锚对象实存（`README.md:266`「常见问题」节 `:264`）；越权面零、断言**集合零删除（REMOVED=0 / ADDED=2）/ 断言数 160→165 经复跑实测**、门控 exit 0。**但本批新增注释中两处把来源标为「FIX-041 R2 P3-x」——FIX-041 的 R2 不存在（本批为 FIX-041 首轮，R0），真实来源是 `FIX-040 R2` P3-1/P3-2**（§四 F-1，可指证的追溯标注错误，同型先例 `3344f0d` 为「EVO-023 R0 P2-1」正确书写 ⇒ 系笔误、修复成本 2 处字符串）。另发现**同批未清的在仓漂移锚** `lib/stats.js:104`（`lib/oauth-llm.js:43` 已漂移至 `:47`，§四 F-2）与 47 计数不可复现（§四 F-3）。**故本轮判返工（两项均为 2 行内的一元修复），修复后 MUST 复审。**

---

## 一、独立取证清单（全部实测；不采信 Developer 取证件内容）

| # | 事实 | 命令 / 结果 |
|---|------|------------|
| 1 | 范围与越权面 | `git rev-parse HEAD` = `6c9553b…`；`git log --oneline 5cc884c..6c9553b` = **7 笔**（顺序与声明逐笔一致）；`git diff --stat` = **5 文件 `+72/−25`**（`lib/client.js +11/−9`、`lib/service.js +3/−3`、`tests/host-abi-health.mjs +45/−3`、`tests/routing-paths.mjs +2/−1`、`tests/served-client.js +11/−9`）✅；`git diff --name-only … -- AGENTS.md CHANGELOG.md package.json .governance` = **空**（零征用面）✅；`git status --porcelain` = **空**（零残余）✅ |
| 2 | **镜像对字节恒等（独立复算）** | `Get-FileHash` 两文件 = **`23C5C5DA28716AD4AA25359DB2071F6CE94324244D1C92F8E3ECE4CEB56F6B87`（相同）**，`Length` 均为 **396,363B** ✅；恒等判据本体 = `tests/host-abi-health.mjs:158-159`（`readFileSync(served-client.js) === source`，`check('served-client mirror stays byte-identical to lib/client.js', …)`）——**谓词可直接读、非「宣称」**，且镜像文件被 `tests/fix-029-host-contract.mjs:364-367`（C4）与 `CONTRIBUTING.md:21` 双重消费/约束 ✅ |
| 3 | **守卫套件（独立复跑）** | `node tests/host-abi-health.mjs` @`6c9553b` = **`ALL HOST ABI HEALTH TESTS PASSED (165 assertions)`，exit 0** ✅ 与 Coordinator 机验（165）一致 |
| 4 | **门控（独立复跑）** | `node tests/run-all.mjs` = **`ALL 20 SUITES + 4 RUNNER MODULES (via smoke.mjs) PASSED (21.5s)  #SKIP 2 (smoke.mjs×2)` exit 0** ✅；两条 skip 原文 = `0o600`（Windows 例外，可见）+ `POSIX online checks`（本机无 sh/curl）——与 FIX-040 链实测口径一致（**Windows 侧 `#SKIP 2` 为预期**；ubuntu 侧**未测**，见 §六.1） |
| 5 | **断言集合机比对（base→head）** | 以 `check('<label>'` 逐行机抽取：base `5cc884c` = **147 条（147 唯一）** → head = **149 条（149 唯一）**；**REMOVED = 0**；ADDED = 2（`B5 9h-2c R-1: 锚对象表的声明源名全部在 ANCHOR_SOURCES 内（未知源名判红，不得裸抛 TypeError）` + `B5 9h-2d R-1: 对象串在其声明源内恰出现 1 次（同源重复/副本即红——9h-2b 跨源判据的盲区）`）✅ 与实测断言数 **147+16 = 163 → 149+16 = 165**（`ANCHOR_CASES` 由 13 → 16 例，每例恒 1 条 check）**逐位吻合** |
| 6 | **9h-2d 谓词独立复算（核心）** | 自建脚本（**不 import 被测文件**，从源码文本正则抽取表体）：解析出 **21 行 × 3 元组，声明源分布 = `smoke 18 / parity 1 / wrapper 1 / metrics 1`**（与 Developer 声明一致）；复算：`missingAnchors = 0`、`deadAnchors = 0`、**`count!==1` 违规 = 0，count 分布 = `{1: 21}`** ✅ |
| 7 | **9h-2d 可达性 + 亚型（我自主加测）** | ① 「在**声明源自身**追加对象副本」（内存仿真）⇒ **`duplicateInSource = 1`（`smoke ×2`）判红** ✅（R2 P3-2(new) 的残留形态确被关闭）；② 「对象改名/删真断言」⇒ **9h-2 与 9h-2d 同时判红**（`dead=1` 且 `dup=1`）⇒ **两份判据在「对象缺失」子面重叠**（见 §四 F-4，P3）；③ 「源名误写 `'smoke '`」⇒ **旧谓词抛 TypeError = true**（复现 R2 结论）／**新 9h-2c 显式判红 = true**（`unknown = ["smoke "]`），同时 `deadAnchors` 仍计 1（**信息不丢**） |
| 8 | **9h-2c 语义（我自主加测）** | 未知源名走 `?? ''` ⇒ `count = 0`（`''.split(x).length - 1 = 0`）⇒ **9h-2d 亦判红**，**不构成静默通道**；9h-2c 的 `check` **无条件执行**（不在任何短路分支内）⇒ **fail-closed 成立**；与 9h-2 的 `deadAnchors`（`?.includes ?? false`）**判据不同**（源名合法性 vs 对象存活）⇒ **非重复谓词** ✅ |
| 9 | **`ANCHOR_CASES` 新条目逐串实算（W2b/W3b）** | `lib/client.js`：stale 5 串出现次数 = **全 0**（`lib/oauth-llm.js:43` / `presetDiagnostics :2109` / `health.js:35-48` / `OAUTH_ROUTE_PROVIDER :36` / `权威单点 :124-125`）；fresh 4 串在位 = **全 true** ✅ 与 `tests/host-abi-health.mjs:735-739 / 746` 的清单**逐字对应** |
| 10 | **新建锚目标对象实存核验（W2）** | `lib/oauth-llm.js:47` = `export const OAUTH_PROVIDER = 'chatgpt-oauth'`（`lib/client.js:33` 的 `:43` 锚**确已漂移 4 行**；`:43` 实为无关注释）✅；`lib/host-abi/health.js:35` = `export function noteHostDiag(entry)` + `:20 HOST_DIAG_LIMIT = 64` ✅；`lib/host-abi/client-remotes.js:50` = `export const HOST_FACE_ERROR_CODES = {` ✅；`lib/host-abi/inject-manifest.js:76 noteInjectFaceGaps` ✅（`lib/client.js:5471` 的镜像侧指代属实）；`presetDiagnostics 方法存在性先例`（去行号后改为「方法存在性」语义指代）✅ |
| 11 | **W3 新关键词锚对象实存核验** | `README.md:266` = `- **视觉 agent 用什么模型？** …实测 \`opencode-go/qwen3.7-plus\` 亦可…`；节标题 `README.md:264 ## 常见问题` ⇒ 锚串 `README「常见问题」节「视觉 agent 用什么` **两段均实存** ✅；`README L125` 实测已漂移（`:125` 现为安装提示句）⇒「漂移 ~141 行」= `266−125` **算术成立** ✅ |
| 12 | **冻结面核验（R0 P3-4 守恒）** | `git diff` 范围内 `CHANGELOG.md` **零触碰**（取证 #1）；`CHANGELOG.md:25` 的 `README L16/L165` **仍在档**（已发布节冻结，仅登记）✅ 与 Developer 声明一致 |
| 13 | **全仓 `README L<n>` 残留穷举（MUST）** | `git grep -nE 'README L[0-9]+' -- ':(exclude).governance/**'`：**shipped 面零残留**（`lib/service.js` / `tests/routing-paths.mjs` 已清）；余 = `CHANGELOG.md:25 / :58`（**冻结已发布节**，其中 `:58` 为历史提交清单内的 `README L130/L30`，非锚）+ `tests/host-abi-health.mjs:733/734/735/738/739`（**stale 清单自身，预期**）+ **`docs/release/release-checklist-v0.3.2.md:30`、`docs/release/version-plan-v0.3.2.md:82`（历史发布文档，同为 `README L20/L111/L129` 式锚，本批未列账）** ⇒ 见 §四 F-5（P3，非本批声称面） |
| 14 | **纯注释性核验（W2/W3 声明）** | 对 `lib/client.js` / `lib/service.js` / `tests/routing-paths.mjs` / `tests/served-client.js` 的 `git diff -U0` 逐 `+` 行过滤：**去掉 `//` / `*` / `/*` / 反引号续行后，非注释改动行 = 0** ✅ ⇒「纯注释、零代码行/零逻辑变化」**成立**（`tests/host-abi-health.mjs` 为判据面代码，不在此列） |
| 15 | **TODO/死代码/旧名残留** | 本批 `+` 行 `TODO|FIXME|XXX|HACK` **零命中**；旧变量名 `ANCHOR_OBJECTS`（无 `_3`）在代码中零命中（仅 `:735` 等注释内的**新名** `ANCHOR_OBJECTS_3`）；`ANCHOR_SOURCES` / `selfSatisfied` / `duplicateInSource` / `unknownAnchorSources` **均被消费** ⇒ 无死代码 ✅ |
| 16 | **无构建步骤核验（A-② 独立复核）** | `package.json`：`exports["./client"] = "./lib/client.js"`；`dsh.bundle = { patch: "./cordis.patch.yml" }`（**bundle 键是宿主插件清单声明，非打包器**）；`scripts` 仅 `test`/`test:contract`；**`devDependencies` = null**；`files` 含 `lib/client.js`（随包直发）；全仓 `rollup\|esbuild\|webpack\|vite\|tsup` **零命中**；`dist/`/`*.min.js`/`bundle` 产物 **git ls-files 零命中**；根目录无构建配置文件 ⇒ **「`lib/client.js` 是源文件而非生成物」成立** ✅ |
| 17 | **宿主锚漂移抽样（只读实算，`$DSH_HOME/profiles/node_modules/@deepseek-ai` @0.1.5-rc.2）** | 抽样 8 锚：`dsh-client-connection lib/client.js:4754-4825`（isLoopback 面）⇒ 现址 **`function isLoopbackHostname` @6273**、`:4754-4825` 现为无关代码段 ⇒ **MISS（确证漂移 ~1500 行）**；`dsh-api-remotes`：`llm 描述子 :5682-5760` ⇒ 现址为 `source:"lookup"`（**MISS**）、`settings :4939-5260` ⇒ `})),`/`schema:`（**MISS**）、`session :8018-8500` ⇒ 无关 schema（**MISS**），且 **`API_REMOTE_FORWARDED_EVENTS` 在该包实装中零命中（疑已改名/移除）** ⇒ 与 Developer 声明一致；`dsh-client-ui-settings-models lib/client.js:889-911`（`joinProviderDirectory`）⇒ **`function joinProviderDirectory(...)` @889 逐字命中（HIT）**、`:2842-2848`（static inject）⇒ **MISS**；`dsh-cordis-client-runner lib/client.js:581`（`waitingFor`）⇒ **@581 逐字命中（HIT）**、`:4493-4499` ⇒ MISS ⇒ **3 HIT / 5 MISS（我抽样集）**，与 Developer「3/7」同向（**比例差异仅因抽样集不同，均系 HIT/MISS 混合、非全漂**）✅ |
| 18 | **口径更正独立复核（A 项三条）** | ①「镜像对自身锚 9 处」**误分类成立**：`lib/client.js` 内 9 处 `lib/client.js:<NNN>` 锚的**邻域包名**实测 = `dsh-client-connection`(4970) / `dsh-api-remotes`(4976-4977) / `dsh-client-ui-settings-models`(4980,5007-5008,5453-5455,5597 邻域) / `dsh-cordis-client-runner`(5449-5450) / `dsh-api-remotes`(5390) ⇒ **全部为宿主包锚，包名写在前一行**（我抽样 4 组 6 处，形式一致）✅；②见取证 #16；③见取证 #17 ⇒ **三处更正事实性与我的独立核验一致**（计数面差异见 §四 F-3） |
| 19 | **推送状态（裁定依据）** | `origin/main` = **`5cc884c`**；`git rev-list --count origin/main..HEAD` = **7** ⇒ 本批 7 笔**全部未 push** ✅（与 Coordinator 声明一致） |
| 20 | **真实环境防护（本审查）** | 本审查**未执行任何写操作于 `$DSH_HOME` / 宿主树**（仅 `Get-ChildItem` + `readFileSync` 只读）；对工作树**零写**（变异仅在内存字符串上做，未落盘）；自建两个取证脚本写入 `.test-home/`（`.gitignore:10` 已忽略，`git status --porcelain` 空）⇒ 零残留 ✅ |

---

## 二、7 笔逐笔核验

| # | hash | 声明 | 我的独立裁定 | 依据 |
|---|------|------|------------|------|
| 1 | `6d77ad5` | 9h-2c 源名合法性 + `deadAnchors` 安全取值 | **成立**（且**非静默通道**）：未知源名 `check` 无条件跑、显式判红；`?? ''` 使 9h-2d 亦判红；`?.includes ?? false` 不掩盖真死锚（`deadAnchors` 仍独立报 1） | 取证 #8 / #6 |
| 2 | `8f187f6` | 纯注释改名 `ANCHOR_OBJECTS` → `ANCHOR_OBJECTS_3` | **成立**（单行注释，R2 P3-3(new) 收口）；旧名在代码中零命中 | 取证 #15 |
| 3 | `f2a4d37` | 9h-2d 同源「恰 1 次」 | **成立**：谓词实现正确、基线 21/21=1、副本注入可判红、零误红、假阴性面为零（见 §三.3） | 取证 #6 / #7 |
| 4 | `bd649a3` | README L125 → 关键词式（2 处 shipped）+ 冻结面声明 | **成立**：两文件同一锚串、对象实存、CHANGELOG 未触、shipped 面零残留 | 取证 #11 / #12 / #13 / #14 |
| 5 | `7c5e510` | README 引用族纳入 `ANCHOR_CASES`（双向） | **成立**：stale 串在目标文件真实存在过的位置已清（现 0 次）+ fresh 串实存（true）⇒ 双向判据可达；条目仅 1 行、无越权 | 取证 #9 / #11 |
| 6 | `524a30d` | 镜像对 6 处符号名化（两文件等量） | **成立**：`git diff` 两文件 hunks **逐行同构**（20 行改动位点一致）、SHA256 相同、6 处新锚目标对象**逐一实存**、**零新幻觉引用** | 取证 #2 / #10 / #14 |
| 7 | `6c9553b` | 镜像对纳入 `ANCHOR_CASES`（镜像侧不重复登记） | **成立且理由正确**：§3 字节恒等（`mirror === source`，取证 #2）确为**更强**保证；重复登记只增表面。**唯一形式损失**（`lib/client.js` 条目报错时不指出镜像侧同步义务）已由 §3 的独立 FAIL 覆盖 | 取证 #2 / #9 |

**逐笔结论：7/7 笔的机制面声明成立**；本轮的阻塞项不在机制面，而在**追溯标注的准确性与同批清点完备性**（§四 F-1/F-2）。

---

## 三、复审要求 10 项逐项结论

### 1. 5 维度 + AI 专项 5 项 —— 见 §五（全部完成、逐项有结论）

### 2. 9h-2c 正确性 —— **成立（fail-closed 且不掩盖真死锚）**

- **未知源名是否显式判红**：是。`unknownAnchorSources` 由 `Object.keys(ANCHOR_SOURCES)` 全集过滤得出，`check` 在 9h-2 之前**无条件执行**且以 `length === 0` 为谓词 ⇒ 非法源名**必然**产生 1 条 FAIL（非异常、非栈回溯）。我以 `'smoke '` 变体复现：旧谓词 `ANCHOR_SOURCES[o].includes` **抛 TypeError = true**，新谓词 **显式判红 = true**（取证 #7③）。
- **`deadAnchors` 安全取值是否掩盖真实死锚**：**不掩盖**。`?? false` 仅在源名非法时生效；此时 9h-2c 已独立判红，且该行仍被计入 `deadAnchors`（我实测 `deadAnchors = 1`，`【smoke 】` 前缀可见）⇒ **信息既不丢也不静默**。源名合法时 `?? false` 分支恒不触发 ⇒ 对正常路径零影响。
- **与 9h-2 是否重复/冲突**：**非重复谓词**——9h-2c 判「源名 ∈ 合法集合」（引用完整性），9h-2 判「对象在声明源存在」（对象存活），二者可分别失败（源名非法但对象在另一源存在 ⇒ 仅 9h-2c 红）。**无并存双路径**（9h-2 的对象核验只有一条实现：`ANCHOR_SOURCES[origin]?.includes`）。

### 3. 9h-2d 正确性（重点）—— **成立；零误红实证；无假阴性；与 9h-2b 无并存双路径（与 9h-2 有子面重叠）**

- **实现与谓词**（`tests/host-abi-health.mjs:853-858`）：`count = (ANCHOR_SOURCES[origin] ?? '').split(assertion).length - 1`，过滤 `count !== 1` ⇒ 语义 = 「对象在其声明源内**恰出现 1 次**」，与注释声明**逐字相符** ✅
- **零误红（独立复算）**：我以自建解析器（不 import 被测文件）复算 **21/21 count = 1**（分布 `{1:21}`），与 Developer 取证件结论一致 ⇒ **基线零告警** ✅
- **是否引入假阴性**：**未引入**。`split().length - 1` 对**单次出现**恒为 1，与「跨行/被格式化」无关（对象串是**单行连续子串**，其计数只依赖该子串在文本中的出现次数）；格式化只会**减少**计数（→0），而 0 仍被 `!== 1` 捕获（**方向偏严，不会漏**）。反向通道亦不存在：在声明源内复制该串 ⇒ 计数 ≥ 2 ⇒ 判红。⇒ **无「既非 0 又非 1 且判绿」的通道。**
- **与 9h-2b 的关系**：**真无并存双路径**——9h-2b 仍只判三类（`identical` / `objectInsideAnchor` / `foreignSourceHits`，`:829-835` 逐字未改），第四类**只**由 9h-2d 判；我逐类复算 9h-2b = **0/0/0**（取证 #6）⇒ 两判据不重叠于同一谓词。
- **如实指出的重叠面（非双路径，但会在同一根因下双报）**：`count !== 1` 含 `count === 0`（= 对象缺失），该子面**同时**由 9h-2 的 `deadAnchors` 判别 ⇒ 「对象被删/改名」时两 check 同时红（我实测 `dead=1 && dup=1`）。这是**冗余双报**而非**并存实现**（无第二条对象存活核验路径）⇒ 不构成 P5 违规，登记为 §四 F-4（P3）。
- **未披露的口径选择**：`count !== 1` 把 `count = 0` 纳入告警，使 9h-2d 的 detail 成为「同源计数总览」而不仅是「重复告警」。注释未点明该包含关系（已声明「同源重复/副本即红」）⇒ §四 F-4。

### 4. W2 镜像对 —— **6 处新锚逐一实存；字节恒等仍成立；零新幻觉引用**

- **逐一核验（我读源码位置，非采信声明）**：`lib/oauth-llm.js:47` `export const OAUTH_PROVIDER`（**`:43` 确已漂移 4 行**）／`presetDiagnostics 方法存在性先例`（去行号；方法本身存在于 host-abi 面）／`lib/host-abi/health.js:35 noteHostDiag`（**逐字命中**）／`HOST_FACE_ERROR_CODES 三错误码`（`lib/host-abi/client-remotes.js:50` **逐字命中**）／`lib/host-abi/inject-manifest.js:76 noteInjectFaceGaps`（存在）⇒ **6/6 目标对象实存，零幻觉引用** ✅
- **字节恒等**：`23C5C5DA…B56F6B87` 两文件相同（396,363B）✅；且我核验 §3 判据谓词 = `mirror === source`（非文件名/大小比较）⇒ 保证强度属实。
- **是否重现 FIX-040 R0 的幻觉引用**：**未重现**（本轮唯一的新增引用串均指向实存对象；取证 #10）。**但** `lib/stats.js:104` 存在**既存**漂移锚（§四 F-2）——非本批引入，却是同批族内未清项。

### 5. W3 README 族 —— **对象实存；冻结面未触；全仓残留已穷举（含 2 处未列账的历史文档）**

- 新关键词锚对象实存：`README.md:266`（`README.md:264 ## 常见问题` 节内「视觉 agent 用什么模型？」条）✅（取证 #11）
- `CHANGELOG.md:25` **未被触碰**（范围文件集不含 `CHANGELOG.md`；`:25` 内容仍在档）✅
- 全仓 `README L<n>` 残留 = **guard stale 清单自身（预期）** + **`CHANGELOG.md:25/:58`（冻结）** + **`docs/release/release-checklist-v0.3.2.md:30` 与 `docs/release/version-plan-v0.3.2.md:82`（历史发布文档；Developer 声明「两处 shipped 引用」未覆盖此类）** ⇒ §四 F-5（P3，非本批声称面、非阻断）

### 6. 三处口径更正的事实性（A 项）—— **三条均与我的独立核验一致（计数见 F-3）**

- ① **9 处 = 宿主包锚**：**成立**（取证件 #18①；包名在前一行，我抽样 4 组）。
- ② **`lib/client.js` 非生成物**：**成立**（取证 #16：exports 直指 + 零 devDeps + 零打包器 + 零构建脚本 + 文件随包直发）。
- ③ **宿主锚已实际漂移且静默**：**局部复现成立**（取证 #17：`isLoopback` 4754→6273；`API_REMOTE_FORWARDED_EVENTS` 零命中；HIT/MISS 混合）。我**能**读宿主树（与 Developer 自述「`dsh-host-apiproxy` 未安装」不冲突：`dsh-api-remotes` 实装存在），故**不以「不可判」回避**——但**仅限本机实装版本 0.1.5-rc.2 的一个采样面**，不构成全 41 处的普适结论。

### 7. 裁定点评估（我的建议；Coordinator 决策）

- **① 9h-2d 独立 vs 折叠进 9h-2b**：**建议维持独立**（赞同 Developer）。理由：① 独立 check 的失败标签/`detail` 直接给出 `×N` 计数，定位比并入聚合布尔更强；② 断言分账清晰（若折叠，`9h-2b` 标签需再次改名，反而制造 REMOVED，与 FIX-040 R2 的「实质零删除」纪律相反）；③ 我实证**无并存双路径**（9h-2b 三类逐字未变），折叠不产生判别力增益。**唯一代价** = 与 9h-2 在「对象缺失」子面双报（F-4），可通过在 9h-2d 注释中一句话点明包含关系消除误解（不改进实现）。
- **② W4 建议（宿主锚符号名化另批立项）**：**强烈建议立项**，理由已实证（取证 #17：宿主锚**真漂**且**静默**——`isLoopback` 漂 ~1500 行、`API_REMOTE_FORWARDED_EVENTS` 消失，本仓守卫**完全看不见**）。建议同批做到：**(a)** 41 处逐处符号名化（`lib/client.js` + `tests/served-client.js` 同改 + parity）；**(b)** 在 `lib/client.js` 头部**显式登记宿主核验基线**（当前 = 依赖声明 `@deepseek-ai/* ^0.1.5-rc.2`，取证 #16）与「宿主升级即需复检」的人工义务句（仓库级守卫不可解析宿主树，**不得**声称机器覆盖）；**(c)** 抽样核验记录入 evidence-log（本次已有可复用采样面：`dsh-client-connection` / `dsh-api-remotes` / `dsh-client-ui-settings-models` / `dsh-cordis-client-runner`）。
- **③ W5 判断（§9h-2/2b/2d generic 化）**：**赞同延后**。理由：generic 化需从 `metrics.mjs` 文本**反向抽取**候选锚名并与对象表对齐，而现表为**显式对照表**——generic 化的收益（减少手抄）已被 9h-3 的「未入表即红」部分覆盖，边际收益低；**且**高价值扩展面恰是宿主锚族（W4），可由 W4 的符号名化直接消解「行号锚」需求。⇒ 建议在 W4 完成后再评估（届时若残余锚形态稳定，generic 化价值进一步下降）。

### 8. 新引入（不实表述 / 判据退化 / 死代码 / 过度断言 / 重现历史两类问题）—— **判据无退化、无死代码、无过度断言；不实表述 2 处（F-1，阻塞）+ 同批清点 1 处（F-2）**

- **判据退化**：**无**。三条判据方向全为收紧（9h-2c 新增引用完整性、9h-2d 新增唯一性、`ANCHOR_CASES` 13→16 扩面），且我逐条做了「原盲区 ⇒ 现判红」的反向验证（取证 #6/#7/#9）；旧能力零回退（9h-2/9h-2b/9h-3 标签与谓词**逐字未变**，REMOVED=0）。
- **死代码**：无（取证 #15）。
- **过度断言**：无（新注释均带如实界定：9h-2d 明示「现状基线 21/21」与盲区归属；9h-2c 明示「非静默，但诊断指向错误」）。
- **重现 FIX-040 R0/R1 两类问题？**：**幻觉引用 = 未重现**（取证 #10）；**判据强度退步 = 未重现**（方向全为收紧，且以 `×N` 明细增强可诊断性）。
- **新引入的「不实表述」= F-1**（把来源标成不存在的「FIX-041 R2」，见 §四）：这是本批唯一的实质不实，且**不在机制面**。

### 9. 越权面 + 断言集合 + 门控 + 真实环境操作披露 —— **前三项全通过；第四项披露基本充分、有 1 处口径不精确**

- **越权面**：零（取证 #1：5 文件、`.governance/**`/`AGENTS.md`/`CHANGELOG.md`/`package.json` 全零触碰）。
- **断言集合（REMOVED/ADDED）**：**REMOVED = 0 / ADDED = 2**（机比对，取证 #5）——**零删除**，优于 FIX-040 R2 的「同址改名 ×2」。
- **门控复核**：`165 assertions` + `run-all exit 0`（21.5s，`#SKIP 2`）双绿（取证 #3/#4）。
- **真实环境操作披露（只读声明）**：**充分**——Developer 明示对 `$DSH_HOME/profiles/node_modules/@deepseek-ai/**` **仅只读核验（Get-ChildItem + 读文件）**，我**同口径执行**并独立复现其漂移结论（取证 #17、#20），未写、未安装、未改配置。**唯一口径不精确**：`fix041-red-w2.ps1` / `-w3.ps1` **确在操作者工作树写入**（`[IO.File]::WriteAllText` + `git checkout` 复原，属「仓库面」而非「宿主面」），披露句只覆盖了宿主面 ⇒ 见 §四 F-6（P3，不构成实质风险：porcelain 空 + parity 真已由我复核）。

### 10. 可行性判定：本批是否具备 push 条件 —— **机制面具备；当前 HEAD 不具备（须先修 F-1，建议同修 F-2）**

- **具备的部分**：7 笔全为测试基础设施 + 注释/文档面（零产品行为变化；`package.json`/版本位/`CHANGELOG.md` 未触）；守卫 165 断言 + 门控 exit 0；零越权；镜像恒等；断言零删除。
- **不具备的判据**：**F-1（2 处错误追溯标注）**——按本项目「每条结论 MUST 可追溯到可复查事实」（`code-review` SKILL 事实依据红线 + 项目原则 1）与 `3344f0d` 的**正确书写先例**（「EVO-023 R0 P2-1」标注到**真实轮次**），「FIX-041 R2」指向**不存在的审查轮次**且把**该轮依赖的裁定**记为已发生的来源 ⇒ 是**可指证的不实**，MUST 修后方可 push。
- **修复成本**：F-1 = 2 处字符串（`tests/host-abi-health.mjs:812` 与 `:850`）；F-2（建议同修）= `lib/stats.js:104` 一处注释（去行号或改 `OAUTH_PROVIDER` 符号名）+ 可在 `ANCHOR_CASES` 的 `lib/stats.js` 条目补 1 对 stale/fresh（该条目已存在：`:714`）。
- **push 后的口径约束（不得越界声称）**：**不得声称 CI 已验证**——ubuntu 侧**未跑**（本机 win32 only）；ubuntu 预期 `#SKIP 6 (host-contract.mjs×2, smoke.mjs×4)`，本批新增判据**均为纯文件读取/内存谓词（平台中立）**，风险低但**以首跑日志为准**。

---

## 四、新发现（本轮）

### P0 / P1 —— 0 条

无。

### P2（阻塞本轮通过；同源、修复各 ~1 行）—— 2 条

**F-1｜本批新增注释把来源标为「FIX-041 R2 P3-x」——FIX-041 的 R2 不存在（本批为 FIX-041 首轮 R0），真实来源是 `FIX-040 R2`**
- 位置：`tests/host-abi-health.mjs:812`（`// 声明源名合法性（FIX-041 R2 P3-1(new) 收口）…`）与 `:850`（`//   落地形态说明：R2 将该类表述为「9h-2b 第四类」…`）、另 `:843`（`// 9h-2d（FIX-041 R2 P3-2(new) 收口）…`，同族）
- 事实依据：① `REVIEW-FIX-040-R2`（`.governance/evidence-log.md:637`，`APPROVED_WITH_NOTES`）的 §七明列 **R2 P3-1(new)**（源名校验）与 **P3-2(new)**（同源重复残留），且其 §六明确把「把『出现次数 === 1』纳入第四类」列为后续动作 ⇒ 来源**唯一指向 FIX-040 R2**；② FIX-041 无任何历史审查记录（本报告即 FIX-041 首次审查，round = R0）⇒ **「FIX-041 R2」不存在**；③ 同仓**正确书写先例**：`lib/client.js:5059` 注释写的是 `FIX-037 ⑤（EVO-023 R0 P2-1 镜像半边）`——**审查轮次标注到真实轮次**，本批未沿用 ⇒ 系笔误而非体例差异。
- 影响：追溯链出现**指向不存在轮次**的引用（治理纪律「每条结论 MUST 可追溯」）；`:850` 的裸 `R2` 更把「独立 vs 折叠」的**裁定依据归给一个未发生的审查轮**——这正是本项目历史上被列为 P4-violation 的同型风险（`1b5cead` 一笔两问题先例）。
- 建议（~2 行）：`FIX-041 R2 P3-1(new)` → **`FIX-040 R2 P3-1(new)`**、`FIX-041 R2 P3-2(new)` → **`FIX-040 R2 P3-2(new)`**、`落地形态说明：R2 将该类…` → **`…FIX-040 R2 将该类…`**。

**F-2｜同批族内未清的**在仓**漂移行号锚：`lib/stats.js:104` 引 `lib/oauth-llm.js:43`（实已漂移至 `:47`）——与本批「行号锚零残留」目标同型，且未被本批任何清单覆盖**
- 位置：`lib/stats.js:104`（`…唯一条目 \`chatgpt-oauth\`（权威源 lib/oauth-llm.js:43 OAUTH_PROVIDER…`）
- 事实依据：`lib/oauth-llm.js:43` 现为无关注释（`// 先例 wrapper.js installAdmissionWrapper 同批切换）。`），`OAUTH_PROVIDER` 实在 **`:47`**（取证 #10）；`lib/stats.js` **已有** `ANCHOR_CASES` 条目（`:714`，stale = `host-route.js:55`）但**只覆盖那一串**，故新锚不被看护；全仓该族残留穷举（取证 #13）中 `lib/stats.js:104` 是本批范围外**唯一**的 shipped 在仓行号锚。
- 影响：`lib/client.js` 同类锚（`:43`）已被本批判为「实测漂移」并清除，而**同族、同源、同事实**的另一处仍漂移 ⇒ 批目标（「真实面清点 + 行号锚清扫」）在同源处未闭合；亦使 §三.6「余 41 处**全部**为宿主包锚」的完整性陈述不成立（在仓至少余 1 处）。
- 建议（~2~3 行，二元修复）：把 `lib/oauth-llm.js:43` 改为 `lib/oauth-llm.js` 的 **`OAUTH_PROVIDER`（导出符号名式）**，并在 `:714` 的 `lib/stats.js` 条目补 `stale: ['lib/oauth-llm.js:43'] / fresh: ['OAUTH_PROVIDER']`（**改写 + 看护**一并，符合本批 W2/W3 已采用的同一形态）。

### P3（不阻塞；讨论/建议）—— 3 条

**F-3｜「行号锚全形态 47 处」不可用声明规则复现（我的独立清点为 37；分量亦不符）**
- 位置：`524a30d` 提交信息（「全形态实测 47 处（path:line 15 + Lrange 17 + 裸 :NNN 15）」）与 `tests/host-abi-health.mjs:744` 注释（「余 41 处」）
- 事实依据：我以 `lib/client.js` 全文（含注释与代码）扫描三种形态 = **`path:line 13 / L#### 17 / 裸 :NNN 7`，合计 37**（口径：`[A-Za-z0-9_.-]+\.js:\d+(-\d+)?` / `(?<![A-Za-z0-9_])L\d{3,4}` / `(?<![A-Za-z0-9_.:/]):\d{2,4}`）。与声明差 **10 处**，且 `path:line`（13 vs 15）与裸 `:NNN`（7 vs 15）两项均不符；Developer 取证件 `.test-home/fix041-anchor-inventory.mjs` 未被我复跑（其输出未采信）⇒ **该数字我判为「不可复现」（非判伪造）**。
- 影响：`47 → 41` 的「表面清点」被用作 W4 立项与「剩余全为宿主锚」的依据；数字若无稳定提取规则，后续批次无法复算（也无法验证 W4 是否清零）。
- 建议（可选）：在注释中给出**可复算的提取口径**（正则可复现的最小定义 + 样本行），或改为**范围式表述**（「宿主锚族 = 每文件至少 40 处的 `L####`/`:NNN`/`path:line` 三类混合；精确清单见 W4 报告」），避免精确数字承担不可复算的举证义务。

**F-4｜9h-2d 的 `count !== 1` 含 `count === 0`，与 9h-2 的「对象缺失」子面双报（非双路径，但缺失注释披露）**
- 位置：`tests/host-abi-health.mjs:853-858`（谓词 `count !== 1`）对照 `:823-824`（`deadAnchors` 的 `?.includes ?? false`）
- 事实依据：我实测「对象改名/删真断言」⇒ `deadAnchors = 1` **且** `duplicateInSource = 1`（同一根因两条 FAIL，取证 #7②）⇒ 9h-2d 的告警面是 9h-2 的子面**超集**（`count ∈ {0, ≥2}`），注释只声明了「同源重复/副本即红」，未点明「对象缺失亦在本项告警」。
- 影响：**不构成判别力问题**（方向偏严），但 detail 的语义边界与标签不完全一致（读者可能误读 9h-2d 只判重复）；且未来若有人据 9h-2d 的 `count !== 1` 去「简化」9h-2，会**静默丢掉「对象在非声明源命中」的 `deadAnchors` 语义边界**（注释已强调 9h-2b 的跨源面，唯缺该句）。
- 建议（可选，~1 行注释）：在 9h-2d 注释补一句「`count !== 1` **含** `count = 0`（对象缺失，与 9h-2 的对象存活判定重叠，冗余双报为有意偏严；9h-2 判据本体不可因本项而简化）」。

**F-5｜`docs/release/*-v0.3.2.md` 两处 `README L20/L111/L129` 式锚未被列入「全仓零残留」陈述（历史发布文档，非本批声称面）**
- 位置：`docs/release/release-checklist-v0.3.2.md:30`、`docs/release/version-plan-v0.3.2.md:82`
- 事实依据：取证 #13 全仓穷举；两文件为 v0.3.2 的历史发布记录（`git ls-files` 在档），锚串与 `lib/preset-defaults.js` 曾引的 `README L1xx` 同族；W3 的对象（`lib/service.js:1278` / `tests/routing-paths.mjs:596`）确已清零（我实测 0 次）。
- 影响：注释称「两处 shipped 引用同口径核验（全仓该族零残留）」——**「shipped 引用」范围内成立**，但「全仓该族零残留」在含 `docs/release/**` 时**不成立**（历史文档 2 处 + CHANGELOG 冻结 2 处）。属**限定语不足**而非事实错误。
- 建议（可选）：把该句限定为「shipped 面（`lib/**` + `tests/**`）该族零残留」；历史发布文档是否清扫另作台账（其锚指向当时的 README 行，属于**历史快照**，回改会破坏历史可读性 ⇒ 我**倾向不清扫**，只补限定语）。

### 未重现历史问题（明确结论）

- **幻觉引用（FIX-040 R0 P1-1 同型）**：**未重现**（取证 #10：6 处新锚 + 4 个 fresh 串 + 3 个 README 关键词锚全部指向实存对象）。
- **判据强度退步（FIX-040 R1 P1-1(new) 同型）**：**未重现**（9h-2b/9h-3 谓词逐字未变；新增两条判据均可判别——我以合成变异实证两向可达）。
- **过度实现**：无（最小改动：2 条 check + 3 个 `ANCHOR_CASES` 条目 + 注释）。

---

## 五、硬门槛裁决

| 门槛项 | 阈值 | 实测 | 裁决 |
|--------|------|------|------|
| P0 阻塞问题数 | = 0 | 0（§四 P0 无） | **PASS** |
| 5 维度全覆盖 | = 100% | 见下方逐维度结论（5/5） | **PASS** |
| 每条发现标注级别 | = 100% | 新发现 P2×2 / P3×3 均带 文件:行号 + 事实依据 + 影响 + 建议 | **PASS** |
| 设计一致性检查 | 已完成 | 与项目原则 1（事实性——**F-1 违反**）、原则 4（防护网——符合，断言零删除且扩面）、原则 8（失败可观测——符合，9h-2c/2d 均为**显式诊断**而非吞错）、原则 9（宿主/外部面自证或 parity——**部分缺口：宿主锚族仍无守卫，F-3/§三.7② 登记**）、P5（单一路径——符合，无并存双路径；F-4 为冗余而非并存）、`ci.yml` 头部契约（未触）逐项比对 | **PASS（附 F-2/F-3 登记的缺口项）** |
| AI 代码专项 5 项 | 全部完成 | ① **mock 残留**：无（零夹具新增）② **硬编码**：无（无硬编码通过路径；`duplicateInSource` 为判据输入）③ **幻觉引用**：**无**（取证 #10；唯一不实为**标注**而非引用，见 F-1）④ **未实现 TODO**：无（`+` 行 `TODO/FIXME/XXX/HACK` 零命中）⑤ **过度实现**：无（2 文件判据面 + 3 文件注释面，无顺带重构） | **PASS** |

### 五维度逐项结论

- **正确性 —— 通过**：9h-2c/9h-2d 谓词经我**自建解析器独立复算**（21/21 count=1、`dead=0`、`missing=0`、三类自满足 0/0/0）＋ **两向可达性**（同源副本 ⇒ 判红；源名误写 ⇒ 显式判红）实证；`ANCHOR_CASES` 新条目 stale/fresh **逐串实算**（0 次 / 全 true）；镜像 §3 恒等谓词可读且成立；守卫 165 断言与门控 exit 0（取证 #3/#4/#6/#7/#9）。
- **安全性 —— 通过**：本批零产品逻辑改动（5 文件中 4 文件为纯注释，取证 #14）；无密钥/无注入面引入；本审查全部变异为**内存仿真**，对工作树与宿主树零写（取证 #20）。
- **可维护性 —— 通过（附 F-3/F-4/F-5 建议）**：判据的注释密度高且含**失效机理 + 现状基线 + 边界界定**；`ANCHOR_SOURCES` 映射与 `unknownAnchorSources` 命名自解释。负向 = F-1 追溯标注（须修）、F-3 数字不可复算、F-4 包含关系未点明、F-5 限定语。
- **性能 —— 通过**：新增两条判据为线性遍历（21 行 × 4 源 `split`/`includes`），守卫套件仍为亚秒级（本次复跑未见量级变化），门控 21.5s（FIX-040 R2 同量级 28.5s，无回退）。
- **测试覆盖 —— 通过**：**断言数 160 → 165（+5 = 2 新 check + 3 新 `ANCHOR_CASES` 条目），REMOVED = 0**；新增看护面（源名合法性 / 同源唯一性 / README 族双向 / 镜像对 stale+fresh）**均有可达性实证**；残余覆盖边界（宿主锚族不在仓库面内 ⇒ **无机器看护**）已在本报告 §三.7② 与 F-2/F-3 中**显式登记为缺口**，未被声称已覆盖。

### 审查结论

> **NEEDS_CHANGE**
>
> **unresolved_blockers = 1**（F-1；F-2 建议同修）
>
> 理由：7 笔的**机制面全部成立且经我独立复现**——9h-2c 显式判红且不裸抛、不掩盖真死锚、与 9h-2 非重复谓词；9h-2d 谓词正确（`21/21 count=1` 零误红、副本注入判红、无假阴性、与 9h-2b 无并存双路径）；W2 六处新锚目标对象逐一实存、镜像字节恒等成立、**零新幻觉引用**；W3 关键词锚对象实存、冻结面未触；越权面零、**断言集合零删除**（REMOVED=0/ADDED=2）、守卫 **165 断言** + 门控 **exit 0** 双绿；无判据退化、无死代码、无过度实现。**不通过的唯一原因 = 追溯标注的可指证不实**：新增注释把来源标为「**FIX-041 R2** P3-1/2(new)」，而 FIX-041 的 R2 **不存在**（本批为其首轮 R0），真实来源是 **`FIX-040 R2`**（`.governance/evidence-log.md:637` §七），且同仓已有正确书写先例（`lib/client.js:5059` 的「EVO-023 R0 P2-1」形态）⇒ 属违反「结论 MUST 可追溯」（`code-review` SKILL 事实依据红线 / 项目原则 1）的表述缺陷，修复成本 2~3 处字符串。**同批族内另留 1 处在仓漂移锚 `lib/stats.js:104`（`lib/oauth-llm.js:43` → 实 `:47`），与本批「行号锚清扫 + 真实面清点」目标同型同源，建议与 F-1 一并修复（改写 + 纳入已有 `ANCHOR_CASES` 条目）。另 P3×3（47 计数不可复现、9h-2d 包含关系未披露、`docs/release` 历史文档限定语）不阻塞。**本轮为 R0，未触及 T2 熔断（round ≥ 3 仍 NEEDS_CHANGE 才升级 BLOCKED）；修复后 MUST 发起 R1 复审（同一 Reviewer，注入本报告路径）。**

---

## 六、未验证项声明（事实依据红线）

1. **ubuntu / CI 侧未实测**：本机为 win32；`#SKIP 6 (host-contract.mjs×2, smoke.mjs×4)` 属**预期值**（FIX-040 链推导 + 本机 `#SKIP 2` 实测），**不得读作已验证**。本批新增判据均为纯文件读取/内存谓词（平台中立），ubuntu 风险低但仍以首跑日志为准；**任何对外表述不得声称「CI 已验证」**。
2. **本审查未复跑 Developer 的任何取证脚本**（`.test-home/fix041-red-2c.mjs` / `-2d.mjs` / `-w2.ps1` / `-w3.ps1` / `-occurrence-count.mjs` 均未执行、其输出文件未采信）；替代性验证 = ①自建解析器独立复算（取证 #6）②内存合成变异的两向可达性（取证 #7/#8）③从源码文本逐串实算清单命中（取证 #9）④`git status --porcelain` 空 + 宿主/工作树零写（取证 #1/#20）。其中 `.test-home/fix041-occurrence-count.mjs` 我**读过**（脚本级交叉核验其抽取方法与我自建解析器等价），但**未运行**。
3. **宿主锚族结论的范围限定**：取证 #17 的 HIT/MISS 结论**仅对本机实装 `0.1.5-rc.2` 的 4 个包 + 8 个锚的采样面**成立，**不构成**对全 41 处、或对其他 DSH 版本/平台的普适保证；`dsh-host-apiproxy` 未安装（无法判）。我**能**读取宿主树（与本机 `$DSH_HOME` 布局一致），故未以「不可判」回避，但也**不据此**对未采样的锚作出结论。
4. **47 计数与分量（F-3）判为「不可复现」**，非「伪造」：我的扫描口径与 Developer 的规则可能不同（`path:line` 15 与裸 `:NNN` 15 两项差异最大），本报告未采信其取证件输出 ⇒ 数字面**存疑但不阻塞**（不改变「余留锚全部指向宿主包」的定性结论——我抽样 4 组 6 处均为宿主包锚）。
5. **断言数 165 与「+5」的构成**为本审查按源码机算（147→149 唯一标签 + `ANCHOR_CASES` 13→16 例），未使用任何外部计数工具；若后续 `ANCHOR_CASES` 增删条目，`165` 会自动变化（**该数字不可作为长期基线**，须以运行输出为准）。
6. **本审查的写入面**：仅 `.governance/review-FIX-041-R0-input.md`（本报告）+ `.test-home/fix041-r0-indep-verify.mjs` / `fix041-r0-host-drift.mjs`（`.gitignore:10` 覆盖；均为只读核验脚本）。**未修改任何被跟踪文件**，`git status --porcelain` 复核为空。

---

## 七、建议 Coordinator 动作（按依赖排序）

1. **判定返工（本轮）**：结论 = **NEEDS_CHANGE**（阻塞项 = F-1；建议同修 F-2）⇒ 以 review-record CLI 机录本报告（canonical 名 `review-FIX-041-R0.md`，自动 `next_round`）→ 派发 Developer 做**一元修复**（F-1：`:812` / `:843` / `:850` 三处标注 `FIX-041 R2` → `FIX-040 R2`；F-2：`lib/stats.js:104` 去行号 + `:714` 条目补 stale/fresh 一对）→ **MUST spawn 同一 Reviewer 复审（round = R1，注入本报告路径）**。
2. **复审期望（R1 检查点）**：F-1 三处字符串改毕 + `git grep 'FIX-041 R2'` 零命中；F-2 后 `lib/stats.js` 的在仓行号锚归零且新条目 stale=0/fresh=true；守卫断言数由 **165 → 166**（若补 1 个 `ANCHOR_CASES` 条目）并被实测回填；门控复跑 exit 0；其余判据**不得**改动（本轮已判其成立，改则重新举证）。
3. **裁定点落账**（我已在 §三.7 给出建议）：① 9h-2d **维持独立**（赞同 Developer，理由见 §三.7①）；② **W4 宿主锚符号名化立项**（强烈建议，理由 = 取证 #17 的静默漂移实证；含「宿主核验基线登记 + 人工复检义务」两项不可省的边界声明）；③ **W5 generic 化延后**（赞同，待 W4 后再评估）。
4. **台账补录（不阻塞本轮返工）**：F-3（47 计数口径可复算化）、F-4（9h-2d 含 `count=0` 的注释补句）、F-5（`docs/release/*-v0.3.2.md` 两处历史锚：建议只补限定语、不清扫）；另 FIX-040 链遗留台账项（P2-2 归因 / P2-3 中间态口径 / 取证件归档 / `CHANGELOG:59` / `.cmd` ComSpec / README 引用位置）**仍未执行**，建议在本批收尾时一并机录。
5. **push 门（本批）**：**当前 HEAD 不满足**（F-1 未修）；修复 + R1 通过后，本批 7 笔（或 8 笔含修复）方可 push；push 后**立即以首跑日志核验** ubuntu 侧 `#SKIP 6` 逐行 + 9h/9h-2/9h-2b/9h-2c/9h-2d/9h-3 全绿并入 evidence-log；**首跑前任何表述不得声称 CI 已验证**。
6. **发布面提示**：本批为测试基础设施 + 注释面，**不产生用户可见行为变化**；`package.json` / 版本位（0.5.0）/ `CHANGELOG.md` 未被触碰 ⇒ 无版本面动作。
