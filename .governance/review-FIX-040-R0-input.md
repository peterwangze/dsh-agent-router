# 代码审查报告（review-FIX-040-R0-input）

- **round = R0**（FIX-040 首轮代码审查）
- **审查对象**：`cf0e935..08d562a` 共 **10 笔 commit**（受审 HEAD = `08d562a`）；改动面 = 11 文件 `+208/−91`
- **前序上下文**：`review-FIX-038-R0-input.md` / `review-FIX-038-R1-input.md`（本批即其台账项 N1~N4 / P2-2 / P2-3 的清扫；findings 编号一一对应）
- **审查者**：Code Reviewer Agent（只读；未修改任何产品代码；未运行任何写操作；唯一写入 = 本报告）
- **执行依据**：10 笔 `git show` 全量 diff、相关文件全文与最终态逐行核对、绑定 SKILL `skills/code-review/SKILL.md`、本机独立复跑门控（第 4 次独立跑）+ 断言集/锚集机比对 + skip 站点穷举
- **结论（四态）**：**NEEDS_CHANGE**
- **计数**：P0 = 0 / P1 = 1 / P2 = 3 / P3 = 8
- **不通过理由**：本批核心交付面（锚守卫 §9h-2 = 全批最高价值项）存在**可达的判据缺口 + 一处真实的死锚未被其覆盖**（P1-1），且该守卫的「死锚即红」声称与实现覆盖范围不符。修复代价极小（1 行注释改写 + 1 条对照表项 + 1 条完备性自检），建议本轮返工后复审。

---

## 一、独立取证清单（本审查全部实测，含对 Coordinator 机验的抽样复核）

| # | 事实 | 命令 / 结果 |
|---|------|------------|
| 1 | 范围与越权面 | `git log --oneline cf0e935..08d562a` = 10 笔；`git diff --stat` = 11 文件 `+208/−91`，文件集 = `{ci.yml, README.md, lib/{service,preset-defaults,host-abi/llm-selection}.js, tests/{metrics,preset-defaults,install-entry,attachments,smoke,host-abi-health}.mjs}` —— **与调度清单逐字一致**；`.governance/**` / `AGENTS.md` / `CHANGELOG.md` / `package.json` **零触碰** ✅ |
| 2 | **门控独立复跑（本审查执行，第 4 次）** | `node tests/run-all.mjs` @`08d562a` = `ALL 20 SUITES + 4 RUNNER MODULES (via smoke.mjs) PASSED (26.4s)  #SKIP 2 (smoke.mjs×2)`，**exit 0**（Coordinator 26.7s / R1 29.0s / R0 26.7s —— 四次同量级）；逐条 skip 原文 = `skip device credential file is owner-only (0o600, POSIX) (Windows-only 例外…)` + `skip POSIX online checks (no sh/curl available)` ⇒ **与 ci.yml:66 / README:249 的 Windows 口径「install-entry 的 POSIX online checks 1 条 + smoke 的 0o600 可见 skip 1 条」逐条吻合** ✅（`host-abi-health.mjs` 亦 PASSED ⇒ §9h/§9h-2 新守卫在本 HEAD 判绿） |
| 3 | **断言集合机比对（零删除核验）** | `git grep -h -o -E "check\('[^']*'" <rev> -- tests` 取标签集：before `cf0e935` = **1775** / after `08d562a` = **1777**；`Compare-Object`：**REMOVED = 0**；ADDED = 2 —— `cli invocation cmd shim bypassed on non-win32 (injected platform)`（P2-2 反向臂）+ `B5 9h-2 R-1: metrics.mjs 断言名式锚全部有对象（…死锚即红）`（N4 守卫）⇒ **全批零断言删除**（条件式改动另经逐笔读 diff 核验：0o600 条件逐字未变、shim 两条条件除注入参外逐字未变） |
| 4 | **skip 站点穷举（口径可判定）** | 全库发射点仅 3 处：`smoke.mjs` `skip()` 定义 :51 / 站点 :89（探针失败，`psHosts` 过滤内）×:93（无宿主）×:1266（0o600，`else` 分支）；`install-entry.mjs` `skipArm()` 定义 :66 / 站点 :319（`hosts.length === 0`）×:349（`posixShell() === null` ⇒ :135-141 sh+curl 双探）×:364/:427/:479（`!PS1_OFFLINE_APPLICABLE`）；`host-contract.mjs` `note()` :89 / 站点 :369（靶子版本不一致）×:534（S3 宿主不可达）×:658（S7 不可达）。`run-all.mjs:148` `SKIP_LINE = /^ {2}(?:skip\s\|--\s)/` 同时命中两形态 ⇒ 计数 = skip 行数（非断言数）。**逐条推演见 §四.8** |
| 5 | **metrics 锚 ↔ 对象逐对核对（14/14 + 全锚枚举）** | ① §9h-2 `ANCHOR_OBJECTS`（`host-abi-health.mjs:748-763`）14 对**逐一实查**：锚侧 14/14 在 `metrics.mjs` 在位、对象侧 14/14 在 `smoke.mjs` 在位（含 5 条 `'+「…」'` 片段键）；② 反向全量枚举（`smoke.mjs` + `「」` 名，行合并后 13 个唯一名）：**12 个有对象 / 1 个无对象** —— `twin resolveModel mirrors model identity` 全库零命中（见 P1-1）。③ 近义候选排查：`smoke.mjs:2484` `twin mirrors catalog with own provider id`、`:2596` `wrapper twin mirrors catalog`、`tests/adapter-parity.mjs:139` `prepared model carries wrapRoute rewrite` —— **均不判定 `.id` 保真**；该保真仅由 `metrics.mjs:121` 自身断言覆盖（实现面 = `lib/wrapper.js:379-387` `{ ...resolved, provider: wrapRoute, … }` 保 `id`） |
| 6 | **旧锚 vs stale 清单比对** | `git show cf0e935:tests/metrics.mjs` 旧行号锚**唯一串 12 个**；`ANCHOR_CASES` 的 `tests/metrics.mjs` stale 项（:718）含 11 个 ⇒ **漏 `smoke.mjs:1680-1681`**（:521 console.log 串，本批确已改写） |
| 7 | README 新锚核验（W5） | `git grep -F "留空 = 继承主 Agent 模型" README.md` = **:165**（位于 `### 2. 预设 Agent 默认模型` :161-175 节内 ✅）；`未设置时 subagent 跟随主 Agent 当前实际模型` = **:172**（逐字 ✅，同节）；`手动选择永远优先` = **:16**（`## 特性` :14 节首条 🎯 ✅）⇒ `lib/preset-defaults.js:348` / `tests/preset-defaults.mjs:1067-1074` 新锚**逐一命中**，括注「两句承诺」同为该节逐字原文 |
| 8 | llm-selection 符号锚核验（W8a） | `git show e541028^:lib/preset-defaults.js` = `:209 function sessionSelectFaceOf` / `:249 function inheritedRouteOf` / `:303 function sessionNeverProduced` ⇒ 三个「迁移源函数名」**在迁移时点确实存在**；现役同名导出 = `lib/host-abi/llm-selection.js:113/:149/:192` ✅ |
| 9 | install.sh 锚核验（W3/N2） | `install.sh:100` = `step "源码自带依赖目录：$SRC_NODE_MODULES（跳过依赖链接）"` ✅；`LINKED=0` = `:86`/`:108` ✅；护栏句「只移除本脚本创建的符号链接（绝不对真实目录 rm -rf）」= `:114` ✅ ⇒ 三处引用侧新锚所指对象**逐一存在**；`install.sh:94-101/113-131`/`smoke.mjs:[0-9]` 在 shipped 面**零残留**（残留仅 `host-abi-health.mjs:718/722/725/726` 的 stale 清单自身 = 预期） |
| 10 | P2-2 行为零变化核验 | `lib/service.js:1625` `resolveCliInvocation(command, args, platform = globalThis.process?.platform ?? '')` + `:1628 const win = platform === 'win32'`；旧形态 `globalThis.process?.platform === 'win32'` —— 当 `process.platform` 为 undefined：旧 `undefined === 'win32'` = false、新 `'' === 'win32'` = false ⇒ **默认实参下逐字等价**；**生产调用点 4 处全部 2 参**（`service.js:1859/1904/1929/1975`）⇒ 行为零变化 ✅；新增第 3 参不改变既有实参解析（旧实现多传参本即被忽略） |
| 11 | P2-3 等价性核验 | `tests/attachments.mjs:51-54` 单点判据 `text.includes(':') \|\| text.startsWith('/') ? text : join(cwd ?? '', text)`，与原两处**逐字同语义**；两调用点**均已 `String()` 前置**（`makeFs.resolve` :65 `const raw = String(path)` → :67 传 `raw`；LRU 夹具 :263 `resolveWorkspacePath(String(path), options.cwd)`）⇒ `String()` 二次无害，等价收窄成立；win32 盘符 / `..` / 相对路径边界判据未变（未改用 `path.resolve`，注释已说明理由） |
| 12 | **0o600 改动归属（机器判定）** | `git log -S"Windows-only 例外：本平台" -- tests/smoke.mjs` = **`1b5cead`**（P2-2 笔）**而非** `4e5c848`；`git show --stat 4e5c848` = **仅 ci.yml + README**（零代码行）；`1b5cead` 提交信息**未提及** 0o600 ⇒ 见 P2-2 |
| 13 | 中间态口径链 | `4e5c848` 自相矛盾：既称「①shim 臂…不再计入」，又称「⇒ ubuntu 计数不变」，为保住总数 7 把 **Windows 侧来源** `POSIX online checks` 计入 ubuntu 分项（5 = 探针 1 + `-File` 3 + POSIX online 1）⇒ `08d562a` 修正为 `#SKIP 6 (…smoke.mjs×4)`。**最终 HEAD 口径经我穷举复核正确**（§四.8） |
| 14 | `README L125` 残留漂移 | shipped 引用 2 处 = `lib/service.js:1278` + `tests/routing-paths.mjs:596`（均引「qwen3.7-plus 可看图却会被误拒」事实）；实测 `README.md:125` 现为**安装提示词句**，该事实句现位于 **`README.md:266`**（FAQ 节）⇒ 同族锚已漂移（见 P3-8） |
| 15 | 已发布节冻结事实 | `CHANGELOG.md` 节界：`## v0.5.0 — 2026-09-12` = :6（下一个节 `## v0.4.5` = :61）⇒ `:25` 与 `:59` **均在已发布节内**；`git tag --list v0.5.0` = 存在，且 `git show v0.5.0:CHANGELOG.md` 第 25 行与当前**逐字相同** ⇒ 冻结前提**成立**（非「未发布节」） |
| 16 | 镜像锚面核验 | `lib/client.js` 与 `tests/served-client.js` **Get-FileHash 相同**（字节恒等，由 `tests/host-abi-health.mjs:156-157` 守卫）；每文件 `*.js:NNN` 锚 **15 处**（其中 `client.js:NNN` 自身锚 **9 处**）⇒ 与调度清单「各 12 处」不符（见 P3-3） |
| 17 | 守卫判据「可判红」的最后一环 | `tests/host-abi-health.mjs:859-860` `process.exit(failures === 0 ? 0 : 1)`（有失败即非零）⇒ check 判红可传导至 run-all（:193 汇总非零）⇒ 判别**有牙齿**，非仅日志 ✅ |
| 18 | N4 演示可复现性 + 变异零残余 | `fix040-guard-demo.mjs` 的 4 个变异 `from` 串在当前 HEAD **全部命中**（A: `'tests/attachments.mjs（三向映射往返` / C: `'smoke.mjs「wrapper takes over default model」` / D: `check('memory segments capped at recent 5'` / E: `check('marker offers recognition and generation routes', typeof genMarker`）⇒ 演示非空转；`git status --short` = 仅 ` M .governance/{evidence-log.md,tpa-last-run.json}`（治理记录在途），**`tests/**` 零改动 ⇒ 变异回退零残余** ✅ |
| 19 | 环境隔离（真实环境防护） | 门控自隔离：`tests/smoke.mjs:60` `process.env.DSH_HOME = mkdtempSync(...)`、install-entry 临时 `DSH_HOME`；本审查复跑**未写用户真实配置目录**；未执行任何真实环境安装/写操作 |

---

## 二、五维度逐项结论

### 维度 1：正确性 —— 结论：**通过（附 1 项 P1 于守卫分析面，非运行期逻辑）**

- **P2-2（平台注入）语义正确**：默认实参下与旧判据逐字等价（取证 #10）；注入 `'win32'` 走 shim 分支、注入 `'linux'` 落回「直接 spawn」分支（`service.js:1634-1656`），反向臂断言 `executable === 'codex.cmd' && argv = ['-p','a b']` 与代码路径**逐项吻合**（本机实测跑绿，取证 #2）。
- **P2-3（判据单点）语义正确**：`resolveWorkspacePath` 与原两处逐字同判据；两调用点已前置 `String()` ⇒ 等价收窄成立、无行为变化（取证 #11）。win32 盘符分支命中路径与原实现一致 ⇒ **未为修 POSIX 而破坏 win32 覆盖**。
- **W8b（0o600）语义正确**：断言本体 `(statSync(deviceCredFile).mode & 0o777) === 0o600` 与 `if (process.platform !== 'win32')` 条件**逐字未变**，仅新增 `else` 可见 skip（`smoke.mjs:1266`）⇒ POSIX 侧执行语义零变化、win32 侧由「零痕迹」变为可判定 ✅（实测 Windows `#SKIP 2` 原子含该条，取证 #2）。
- **N1/N3 修正正确**：`install-entry.mjs:479` 理由串已与同文件 JSDoc 同口径（不再表述为「平台不可判定」）；`smoke.mjs:263-266` 注释「紧随的 `19 invocations` 断言行」与 :267 实际相邻关系**一致**（取证 #18 之 N3 段）。
- **W4 12 处锚改写零语义变化**：仅注释与字符串字面量（含 `:523-524` 两条 `console.log` 串），无控制流/条件/断言改动；机比对 0 删除（取证 #3）。
- 唯一正确性缺陷 = **锚名幻觉**（P1-1，落在注释文本，不影响运行期）。

### 维度 2：安全性 —— 结论：**通过（无缺陷）**

- 改动面：测试基础设施 + 注释/文档 + 产品侧 1 个**纯增参**（`lib/service.js:1625`，无校验放宽、无权限面、无注入面变化）；无凭据/密钥；无路径穿越新面（`resolveWorkspacePath` 判据收紧方向为「识别 POSIX 绝对路径」，未放宽沙箱）。
- 数据保护语义未削弱：`install.sh` 的 `LINKED=0` 拷贝回退护栏与「绝不对真实目录 rm -rf」**本体未触碰**（本批仅改引用侧锚形，取证 #9）。
- 测试对真实环境零触碰（取证 #19）。
- 变异演示脚本虽临时写 `tests/*.mjs`，但均在 `finally` 恢复且实测零残余（取证 #18）——属**受控**取证，未构成残留风险（记录性观察见 P3-2）。

### 维度 3：可维护性 —— 结论：**通过（附 4 项 P2 + 4 项 P3 建议）**

- 正向：判据单点化（P5 ✅，旧双份路径已删除、非并存）；`PS1_PLATFORM_DETAIL` 单点复用；锚形统一为「符号名 / 断言名 / 代码串 + 文件」；注释均带根因与出处（CI run 编号、R1 取证编号）。
- 负向：① **死锚**（P1-1）；② 守卫 stale/对象表**不完备**（P2-1）；③ 一笔 commit 承载两个问题（P2-2）；④ 同一批内中间态口径自相矛盾（P2-3）；⑤ 同族 `README L125` 未纳入清扫且台账引用位置枚举不全（P3-8）。
- 命名/函数长度：新增 `resolveWorkspacePath`（4 行）、`ANCHOR_OBJECTS` 数据表、`platform` 形参 —— 均短小清晰；无重复代码新增。
- 注释自指精度：N3 已修；`install-entry.mjs:52-53` 出现「（已知覆盖缺口，/ 台账候选）」断行（P3-7）。

### 维度 4：性能 —— 结论：**通过（无缺陷）**

- 新增守卫为**纯读文件 + 字符串 contains**（13 例 + 14 对，O(锚数)），实测 `host-abi-health.mjs` 210ms（与批前同量级）；`metrics.mjs` 213ms；门控总耗时 26.4s（四次区间 26.4~29.4s，无回退）。
- 产品侧新增默认可选参为零成本；无循环/IO 变化；`client.js` bundle 未触碰（镜像恒等保持）。

### 维度 5：测试覆盖 —— 结论：**通过（附 1 项 P2 覆盖/声明缺口）**

- **断言零删除 + 净增 2**（取证 #3）；`.cmd` shim 分支由「CI 永久零覆盖」→ **全平台恒跑 + 反向旁路臂**（本批实质覆盖增益，最大正面项）。
- skip 全路径**可见 + 可计数**（穷举 §四.8），Windows 侧新增的 0o600 skip 属「静默消失 → 可见 skip」的正确方向（FIX-037 ① 纪律）。
- **守卫本身的完备性未达声称**：stale 清单漏 1/12 旧锚；`§9h-2` 对象表漏 1 个真实死锚 + 5 个 anchor 名；`ANCHOR_CASES` fresh 的「跨行形态由 9h-2 覆盖」注释对 `:118-119` 不成立（P1-1 + P2-1）。
- 未覆盖面（既有、非本批引入）：`README L125` 族（P3-8，已由残余报告披露）、`client.js`/`served-client.js` 镜像锚（P3-3）、宿主源码锚族（§四.9 裁定：正当延后）。

---

## 三、AI 生成代码专项检查（5 项逐一结论）

| # | 检查项 | 结论 | 依据 |
|---|--------|------|------|
| 1 | mock 残留 | **无** | 本批未新增任何假 fs/假 llm（`makeFs`/`lruFs` 为既有夹具，本次仅提取判据单点）；无「为过测试而造桩」 |
| 2 | 硬编码返回值 | **无** | 新增断言全为真值判定（`=== true` / 属性比对）；`ANCHOR_OBJECTS` 的字符串是**判据输入**（missing/dead 为空才绿），非硬编码通过；`.cmd` 断言的 `includes('cmd.exe')` 是形态判据 |
| 3 | **幻觉 API / 幻觉引用** | **有 1 项（P1-1）** | `tests/metrics.mjs:118-119` 新写的锚 `smoke.mjs「twin resolveModel mirrors model identity」` **对象不存在**（全库零命中）；且本批新增的 §9h-2「死锚即红」未覆盖它 ⇒ 幻觉引用未被自家防护网捕获 |
| 4 | 未实现 TODO | **无** | 10 笔 diff 全文 `TODO/FIXME/XXX/HACK` 零命中；无占位实现、无「待补」断言 |
| 5 | 过度实现 | **无越界文件、无新增抽象**（唯一形态问题 = 一笔 commit 两问题，见 P2-2） | 11 文件与任务清单逐项对应（①②③④⑤⑥⑦⑧+⑨部分）；守卫为**同构扩面**（沿用既有 `ANCHOR_CASES` 结构），未引入新框架；无顺带重构；`notes` 机制新增但零使用（无害，可视为预留） |

---

## 四、调度要求 10 项逐项结论

### 1. 五维度 + AI 专项 —— 见 §二 / §三（均已逐项给出结论）

### 2. N4 守卫有效性（最高价值项）

**① 判据正确性 + 三类 stale 演示可达性（只读判别，未复跑）—— 可达，但覆盖面不完备。**

- 判据结构（`host-abi-health.mjs:731-739`）：`staleHits = stale.filter(needle => source.includes(needle))` / `missingFresh = fresh.filter(needle => !source.includes(needle))`；`check(..., staleHits.length === 0 && missingFresh.length === 0, { staleHits, missingFresh })`。三态**皆可达判红**：旧锚复活 ⇒ `staleHits` 非空；新锚被删/被改写 ⇒ `missingFresh` 非空；且 `:859-860` `process.exit(failures === 0 ? 0 : 1)` + `run-all.mjs:193` 非零汇总 ⇒ 判红可传导至门控（取证 #17）。
- 三类演示的可达性（读代码判定，**本审查未复跑**，与任务要求一致）：
  - **A（旧行号锚复活 ⇒ staleHits 判红）**：可达。演示脚本 A 场景向 `metrics.mjs` 注入 `// FIX040 stale-demo: smoke.mjs:1162-1177`，该串在 :718 stale 清单内 ⇒ 必红；变异 from 串在当前 HEAD 命中（取证 #18）。
  - **C（断言名式锚被删 ⇒ missingFresh 红）**：可达。C 场景把 `smoke.mjs「wrapper takes over default model」` 改为占位串，该串在 :718 `fresh` 内 ⇒ 必红；from 串在位（取证 #18）。
  - **D（被引断言改名 ⇒ deadAnchors 红）**：可达**但仅在对照表覆盖到的 14 对范围内**。D 场景把 `check('memory segments capped at recent 5'` 改名，该项在 `ANCHOR_OBJECTS` 内（:760）⇒ `deadAnchors` 非空 ⇒ 必红。**超出该表的锚名（含 P1-1 的死锚）无判别力**（见下表）。
- **完备性实测（本审查反向核验）**：把 stale 清单与旧锚全量比对 ⇒ 漏 `smoke.mjs:1680-1681`（1/12）；把 metrics 全量锚名与 `ANCHOR_OBJECTS` 比对 ⇒ 未纳入对象核验的 anchor 名 5 个（`reminder carries attachment id + route_agent instruction`、`escape-group turn also injects reminder`、`attachmentIds resolution (M2)`×2、`log keeps original image block (F3)` —— 这 5 个**对象均实存**，故非缺陷，属覆盖缺口）+ **未纳入且对象不存在 1 个 = 死锚**（P1-1）。

**② §9h-2 显式对照表正确性抽样（≥6 对逐字核对）—— 抽核 14/14 全查，全部正确，但表不完备。**

| # | metrics 侧锚键 | smoke 侧对象 | 结果 |
|---|----------------|--------------|------|
| 1 | `smoke.mjs「image turn config passes through unchanged (no whole-turn routing)」` | `check('image turn config passes through unchanged (no whole-turn routing)'` = :2204 | ✅ |
| 2 | `smoke.mjs「wrapper takes over default model」` | `check('wrapper takes over default model'` = :2589 | ✅ |
| 3 | `+「wrapper twin mirrors catalog」`（片段键） | `check('wrapper twin mirrors catalog'` = :2596 | ✅ |
| 4 | `smoke.mjs「vision call returns text without echoing injected images (B)」` | 同名串 = :1852 | ✅ |
| 5 | `smoke.mjs「native multimodal delegate sees raw image (preserveImageInput)」` | `check('native multimodal delegate sees raw image (preserveImageInput)'` = :2656 | ✅ |
| 6 | `smoke.mjs §7.7 pre-step「image turn on wrapper route injects plugin reminder」` | `check('image turn on wrapper route injects plugin reminder'` = :2940 | ✅ |
| 7 | `smoke.mjs「collectMarkers dedupes by attachment」` | `check('collectMarkers dedupes by attachment'` = :2682 | ✅ |
| 8 | `+「marker offers recognition and generation routes」` | `check('marker offers recognition and generation routes'` = :2679 | ✅ |
| 9 | `smoke.mjs「tool parameters schema」` | `check('tool parameters schema'` = :2188 | ✅ |
| 10 | `smoke.mjs「follow-up text turn injects memory segment into system」` | `check('follow-up text turn injects memory segment into system'` = :2745 | ✅ |
| 11 | `+「memory segment carries id and untrust annotation」` | 同名串 = :2723 | ✅ |
| 12 | `+「memory segments capped at recent 5」` | `check('memory segments capped at recent 5'` = :2720 | ✅ |
| 13 | `+「current-turn image not double-injected as memory」` | 同名串 = :2729 | ✅ |
| 14 | `smoke.mjs「wrapper delegate sees route_agent`（截断片段键） | `check('wrapper delegate sees route_agent marker in system'` = :2605 | ✅ |
| — | **`smoke.mjs「twin resolveModel mirrors model identity」`（:118-119）** | **不存在（全库零命中）** | ❌ **未纳入表中（P1-1）** |

补充：`metrics.mjs:439` 的 5 个子名（`resolve via M2 (lazy register)` / `dedupe within list` / `non-content-addressed rejected` / `unknown id rejected (ATTACHMENT_UNKNOWN)` / `resolve without exec (id-only)`）经逐条核对均在 `smoke.mjs:1885/1887/1890/1897/1899` 实存 ✅（但同样未入对象表）。

**③ 「generic 正则抽取不可靠 → 改显式映射」权衡裁定 —— 方案可接受，但必须以「清单完备」为前提；当前不完备 ⇒ 不可接受。**

- 我复刻了 Developer 的 generic 抽取（`/smoke\.mjs「([^」\n]+)」/g`，只读，未变异）：得 **8 个 label，dead = 0** —— 即 generic 版本给出**假阴性**且漏 5 个 label。原因经我实证定位：`metrics.mjs:57`（注释内跨行）、`:118-119`（`smoke.mjs` 与 `「…」` 之间夹 `//` 注释标记）、`:523-524`（`console.log` 串跨两条调用）三种形态下，`smoke.mjs` 与 `「label」` **不同行/被标记隔断**，正则无法匹配；`\s+` reflow 亦无法消除 `//` 隔断（`fix040-label-diagnose.mjs:9-13` 即该尝试的残留证据）。
- 因此「显式映射」相比 generic 抽取是**更确定**的选择（无正则脆弱性、无假阳性），**裁定为可接受的工程权衡**；但显式表的正确性完全依赖**人工完备性**，而本批恰好出现「新写锚 → 表漏收 → 表未覆盖 → 声称『死锚即红』」的闭环失效（P1-1）。**补救建议**：在 §9h-2 增一条**自检断言**——从 `metrics.mjs` 抽取的候选锚名集合（含跨行形态的宽松抽取）MUST 全部出现在 `ANCHOR_OBJECTS` 首列（`labels.every(l => table.some(([k]) => k.includes(l)))` 或计数相等），使「新增锚未入表」本身判红，从而把完备性由人工改为机器看护。

### 3. P2-2 行为零变化核验 —— 成立

- `lib/service.js:1625` 第三参默认值 = `globalThis.process?.platform ?? ''`；`:1628 const win = platform === 'win32'`。**逐字等价性**：唯一差异点是 `process.platform === undefined` 时旧式比较 `undefined === 'win32'` 与新式 `'' === 'win32'`，二者同为 `false` ⇒ 全输入域等价（取证 #10）。
- 生产调用点 4 处（`:1859/:1904/:1929/:1975`）**均未传第三参** ⇒ 默认实机平台 ⇒ 行为与改前逐字等价；无其他调用点（`git grep -F resolveCliInvocation` 仅上述 + 本批 smoke 测试 2 处）。
- `.cmd` shim 断言**未删除**：`smoke.mjs:1634 cli invocation cmd shim` 与 `:1636 wrapCmdLine outer quotes` 条件表达式**除注入参外逐字未变**，且已移出 `process.platform === 'win32'` 条件 ⇒ **全平台恒跑** ✅（本机实测通过）。
- 反向臂正确性：`:1637-1638` 注入 `'linux'` → 落 `return { executable: raw, argv: [...argv] }`（`:1656`）⇒ 断言 `executable === 'codex.cmd' && argv.length === 2 && argv[0] === '-p' && argv[1] === 'a b'` **逐项吻合** ✅；该臂为本批新增（净 +1 断言，取证 #3）。
- 唯一残留风险（P3-5）：注入 `'win32'` 时 executable = `process.env.ComSpec || 'cmd.exe'`，断言只查 `includes('cmd.exe')` ⇒ 若 POSIX 宿主恰好设了非 cmd.exe 的 `ComSpec`，该断言会红（CI 无此变量；设计已声明「不虚构宿主环境」，属可接受但可加固）。

### 4. P2-3 等价性 —— 成立（真收窄，无遗漏调用点）

- 判据逐字同语义（取证 #11）；`String(raw)` 位于单点内部，两调用点亦已前置（`makeFs.resolve` :65、LRU :263）⇒ 二次 `String()` 无行为差异；非字符串输入（如 `path` 为 number/对象）在原实现中同样先经 `String()` ⇒ **无新增语义面**。
- win32 盘符（含 `:`）、POSIX 绝对（`/` 开头）、`..`、相对路径四类边界的判据与改前**同一表达式** ⇒ 等价收窄成立；注释显式声明「不得改用 `path.resolve`」并给出理由（`join`/`resolve` 对绝对第二参语义不同）——**该声明正确**（Node 语义）。
- 泛化性（P5 ✅）：旧双份实现已删除，两处调用**同点复用**，无并存路径；`git grep -F "lruFs.resolve"` 仅剩该单点调用。

### 5. W8b 纪律核验 —— 成立（但归属错误，见 P2-2）

- 改动**只**新增 win32 侧可见 skip：`smoke.mjs:1260-1267` 的 `if (process.platform !== 'win32') { check(...) }` **本体逐字未变**，仅加 `else { skip('device credential file is owner-only (0o600, POSIX)', `Windows-only 例外…不可判定（POSIX 侧照常执行）`) }` ⇒ 断言不删除、POSIX 侧零变化、原因串含平台名与不适用机理 ✅。
- Windows 基线 `1→2` 与 ubuntu「不变」双声明**与代码一致**：Windows +1 = 该可见 skip（本机实测 2 条 skip 原文即含它，取证 #2）；ubuntu 侧该 `else` 不进入（该断言在 ubuntu 照常执行）⇒ 对 ubuntu 计数**零影响**（0o600 自身不改变 ubuntu 计数；ubuntu 7→6 由 P2-2 的 shim 收口造成，见 §四.8）。

### 6. W4 语义零变化 + 新锚指向对象准确性

- **12 处（13 行）改动逐行判定**：全部落在 `//` 注释或字符串字面量（`:133/:134/:246/:247/:328-330/:439/:503/:504` 为 `evidence` 数组字符串，`:523-524` 为 `console.log` 字面量）⇒ **零逻辑行、零断言条件改动**；机比对确认零断言删除（取证 #3）。
- **新锚指向对象抽样（全部查核，非抽样）**：`metrics.mjs` 13 个 anchor 名中 **12 个对象实存、1 个不存在**（`:118-119`，P1-1）；`smoke.mjs:439` 的 5 个子名全实存；README 3 个（节名/句）全实存（取证 #7）；llm-selection 3 个符号全实存（#8）；install.sh 3 个符号/串全实存（#9）。⇒ 抽样合格率 12/13，唯一失败项即 P1-1。

### 7. W5/W3/W8a 锚准确性 + 目标面零残留 —— 成立

- 新锚（节名/符号名/代码串式）所指对象**逐一存在**（取证 #7/#8/#9）。
- 目标面残留判定：`git grep -E "README L1(6|25|58|65)"` = `CHANGELOG.md:25`（**已发布节冻结**，见 §四.9）+ `host-abi-health.mjs:728-729`（stale 清单自身，预期）+ `lib/service.js:1278`、`tests/routing-paths.mjs:596`（**`README L125`，本批未清扫** ⇒ P3-8）；`install.sh:[0-9]` / `smoke\.mjs:[0-9]` 在 shipped 面零残留（唯一命中为守卫 stale 清单自身）✅。

### 8. 口径准确性（重点独立复核）—— **ubuntu `#SKIP 6` 与 Windows `#SKIP 2` 与代码触发条件逐条吻合；无遗漏、无多计**

独立穷举（取证 #4）后逐条推演：

| 站点 | 触发条件 | ubuntu | Windows（本机） |
|------|----------|--------|----------------|
| `smoke.mjs:89` 探针失败 skip | `psHosts` 过滤内 `probe.error !== undefined \|\| status !== 0` | **1**（`powershell` 5.1 不存在 → ENOENT；`pwsh` 探针成功 ⇒ 另有 `:97` 正向断言执行） | 0（本机 `powershell`+`pwsh` 均探针成功——实测无该行） |
| `smoke.mjs:93` 无宿主 skip | `psHosts.length === 0` | 0（pwsh 在） | 0 |
| `smoke.mjs:1266` 0o600 skip | `else`（win32） | 0（POSIX 照常执行） | **1**（实测原文可见） |
| `install-entry.mjs:319` PS online skip | `hosts.length === 0` | 0（pwsh 在） | 0 |
| `install-entry.mjs:349` POSIX online skip | `posixShell() === null`（sh 或 curl 探针失败，`:135-141`） | 0（ubuntu 自带 sh+curl） | **1**（实测原文可见） |
| `install-entry.mjs:364/:427/:479` `-File` 三臂 | `!PS1_OFFLINE_APPLICABLE`（非 win32） | **3** | 0（win32 侧照跑） |
| `host-contract.mjs:534/:658` note | 宿主 checkout 不可达 | **2** | 0（本机 `_npx` 缓存命中宿主 ⇒ 无 note；若靶子存在但版本不一致则 :369 另发 1 条，本机未触发） |
| **合计** | | **6 = `#SKIP 6 (host-contract.mjs×2, smoke.mjs×4)`** ✅ | **2 = `#SKIP 2 (smoke.mjs×2)`** ✅（**本机实测，与文档逐字一致**） |

- **无遗漏/多计**：全库仅有 3 个发射点（smoke `skip()` / install-entry `skipArm()` / host-contract `note()`），无第四来源；`run-all.mjs:148` 正则同时覆盖 `skip ` 与 `-- ` 两形态；smoke 自身汇总行（:3094，`ALL SMOKE TESTS PASSED (2 skipped)`）不以两空格开头 ⇒ 不误计入。
- **口径纠正链裁定**：Coordinator 的独立推算（`POSIX online checks` 触发条件 = `posixShell() === null`，属 Windows 侧来源）**与原码逐字一致**（`:135-141` + `:347-349`），Developer 双证据链采纳正确；`08d562a` 落地后的 ubuntu 分项（探针 1 + `-File` 3）与我的穷举**逐条吻合** ✅。**中间态 4e5c848 的口径有误（自相矛盾）**，见 P2-3。
- 旧口径零残留：`#SKIP 7` / `smoke.mjs×5` 在 README/ci.yml/lib/tests **零命中** ✅。

### 9. N1/N3 修正正确性 + 残留处置裁定

- **N1 ✅**：`install-entry.mjs:479` 理由串 = `install.sh 同载该保护语义但无对照臂（已知覆盖缺口，台账候选）`，与同文件 :47-54 JSDoc 同口径；同段注释 :474-476 已显式禁止「平台不可判定」表述 ⇒ 内在一致性恢复。
- **N3 ✅**：`smoke.mjs:263-266` 注释改为「紧随的 `19 invocations` 断言行」，与 :267 实际相邻一致；「下一行」字面错位消除。
- **残留逐条裁定**：

| 残留项 | 裁定 | 依据 |
|--------|------|------|
| `CHANGELOG.md:25`（已发布节锚） | **正当延后（冻结，不回改）** —— 并**建议台账登记** | 取证 #15：`:25` 位于 `## v0.5.0 — 2026-09-12`（:6-:60）节内，且 `git show v0.5.0:CHANGELOG.md:25` 与当前**逐字相同** ⇒ 已随 v0.5.0 发布，改之即篡改发布记录；与 R1 已确立的「已发布节冻结」纪律一致 ✅ |
| `CHANGELOG.md:59` 的 `#SKIP 1 (smoke.mjs×1)`（本审查新增发现） | **正当延后（冻结）**，但**应登记** | 同节内（:55-:60 版本说明）；本批使 Windows 基线升为 2 ⇒ 该历史数字被 supersede；无未发布节可承载（顶节 = v0.5.0），只能由后续版本节披露 ⇒ 记台账（P3-4） |
| `README L125`（`lib/service.js:1278` + `tests/routing-paths.mjs:596`） | **正当延后（台账）** —— 但台账引用位置枚举 MUST 补全 + 建议纳入守卫 | 残余报告**已如实列出**（非隐匿）；实测已漂移：`:125` 现为安装提示句，被引事实句在 `:266`（取证 #14）；同族（`README L<n>` 式锚）且 shipped，与 R0 P3-3「同类锚残留 → 台账」先例同型 ⇒ 判延后；但 FIX-040 台账行⑥的引用位置枚举只列 3 处（`lib/preset-defaults.js:348` / `tests/preset-defaults.mjs:1067/1074` / `CHANGELOG.md:25`），**漏 `lib/service.js:1278` 与 `tests/routing-paths.mjs:596`** ⇒ **P3-8** |
| `client.js↔served-client.js` 镜像锚 | **正当延后（高风险面排除有据）**，但**清单数字需更正** | 两文件字节恒等（有 parity 守卫 `host-abi-health.mjs:156-157`）⇒ 任何锚改写须双改且触碰 396KB 产品客户端 bundle；但实测每文件 `*.js:NNN` = **15 处**（自身锚 9 处），与「各 12 处」不符 ⇒ P3-3 |
| 宿主源码锚族（`dsh-subagent L603-613` / `dsh-host-apiproxy L1187-1189` / `lib/index.js:1698` / `index.js:605` 等） | **正当延后（不可机验面）** | 目标文件在本仓库之外（宿主 npx 检出），仓库级守卫无法解析；现有 `host-contract.mjs` S7 增强靶子组仅在宿主可达时校验常量（CI 不可达 ⇒ note 跳过），故该类锚只能台账化 |
| §9h-2 generic 化 | **正当延后但应补「完备性自检」** | 见 §四.2③：权衡可接受，缺完备性门 ⇒ 建议同批或紧接补自检断言（成本 ~3 行） |
| `smoke.mjs` RPC 计数硬编码常量（`19 invocations` / `=== 19`） | **正当延后（自守卫，无需动作）** | 计数被两处断言强判（`:267` 与 `descriptors share ids` 的 `=== 19`），新增 RPC 面必 **FAIL 而非静默通过**；N3 已修注释指代 ⇒ 无静默失效面 |

### 10. 无新引入 + 越权面 + 如实性

- **无 P0/P2 运行期新引入**：产品侧仅 1 处纯增可选参（等价性已证）+ 1 处等价提取；测试侧净增 2 断言、零删除；门控本机 exit 0（取证 #2）。
- **越权面 = 零**：11 文件与声明一致；`.governance/**`、`AGENTS.md`、`CHANGELOG.md`、`package.json`、`lib/client.js`/`served-client.js` 均未被 10 笔触碰（取证 #1）。
- **如实性 —— 基本充分，两处需更正**：
  - ✅ ubuntu 计数**明标「预期值——修复后首跑前尚未实测，以首跑日志逐行复核」**；Windows 计数明标「本地实测」（经我独立复跑证实）；**未见「已验证绿」类声称**；`.cmd` 平台中立化与「PATH 扫描仍用实机环境」的限定已写明（不虚构宿主环境）✅。
  - ❌ **`4e5c848` 的中间态口径自相矛盾**（见 P2-3）；❌ **归因不符**（0o600 代码改动实际落在 `1b5cead`，而其提交信息未声明；`4e5c848` 提交信息声称做了该代码改动而其实为文档笔，见 P2-2）。

---

## 五、发现列表（每条：文件:行号 + 级别 + 事实依据 + 修复建议）

### P0（阻塞）—— 0 条
无。

### P1（关键，建议本轮修改）—— 1 条

**P1-1｜新锚指向不存在的断言（死锚）且本批新增的「死锚即红」守卫未覆盖它——本批核心交付面（锚防复发）存在可达缺口**
- 位置：`tests/metrics.mjs:118-119`（`// 宿主 resolveModel 返回模型身份字段为 id（dsh-llm 契约，见 smoke.mjs / 「twin resolveModel mirrors model identity」断言）；`）；对照 `tests/host-abi-health.mjs:748-763`（`ANCHOR_OBJECTS`，14 对）与 `:766-767`（check 标签自称「死锚即红」）
- 事实依据（全部可复查）：
  1. `git grep -F "mirrors model identity"` 全库仅命中 `tests/metrics.mjs:119`（**锚自身**）⇒ **被引断言在 `smoke.mjs` 乃至全库均不存在**；
  2. 近义候选逐一排除：`smoke.mjs:2484 twin mirrors catalog with own provider id` / `:2596 wrapper twin mirrors catalog`（均判目录镜像）/ `tests/adapter-parity.mjs:139 prepared model carries wrapRoute rewrite`（判 route 改写）——**无一判定 `resolveModel` 返回值的 `id` 保真**；该保真实际仅由 `metrics.mjs:121` 自身断言、实现面 `lib/wrapper.js:379-387`（`{ ...resolved, provider: wrapRoute, … }`）承载；
  3. 该锚由本批 `8c99c0f`（W4）新写入（diff 可见 `smoke.mjs:1266` → 该锚名），故属**本批新引入**而非既有债务；
  4. **守卫不可达性实测**：§9h-2 表 14 对**不含**该名（读 :748-763 逐项核对）；`ANCHOR_CASES` 的 `tests/metrics.mjs` `fresh` 10 项亦不含（:718）；Developer 尝试过的 generic 抽取（我以只读方式复刻 `/smoke\.mjs「([^」\n]+)」/g`）得 8 label、**dead = 0 ⇒ 假阴性**，机理 = 该锚的 `smoke.mjs` 与 `「…」` 被换行 + `//` 注释标记隔断（同类形态另见 `:57`、`:523-524`）；`\s+` reflow 亦无法消除 `//` 隔断；
  5. 因此 `host-abi-health.mjs:766` 的「metrics.mjs 断言名式锚全部有对象（…死锚即红）」与本批提交信息「14 对；死锚即红」构成**对防护能力的过度声称**：真实覆盖 = 表内 14 对，表外锚名零判别力，而本批恰有一处表外死锚。
- 影响：`metrics.mjs` 承载用户可见的统计证据链；死锚使读者按名检索**必然落空**（本次修复的正是「锚指向错位对象」族），且防护网给出「全部有对象」的绿灯 ⇒ **假安全感**（P4：看护不得静默降级精神；AI 专项第 3 项「幻觉引用」）。
- 修复建议（成本 ≈ 3 行 + 1 断言）：
  - **A（必做）** 改写该锚所指对象为真实存在者，例如：`// 宿主 resolveModel 返回模型身份字段为 id（dsh-llm 契约；twin 以 {...resolved} 保 id 仅改写 provider——lib/wrapper.js:379-387；对偶断言见 tests/adapter-parity.mjs「prepared model carries wrapRoute rewrite」与本文件 checks「twin resolveModel 镜像模型身份（模型 id 不变）」）`；
  - **B（必做）** 在 §9h-2 的 `ANCHOR_OBJECTS` 增补对应项（锚侧 + 对象侧），或（更强）**增一条完备性自检断言**：`metrics.mjs` 内全部 `smoke.mjs「…」` 候选锚名（含跨行/合并形态的宽松抽取）MUST 均出现在 `ANCHOR_OBJECTS` 首列 ⇒ 「新增锚未入表」本身判红（此举同时关掉 P2-1 的同类复发面）；
  - **C（建议）** 把 :766 的 check 标签与提交信息口径改为**限定语形态**（「本表 14 对对象核验」），避免无条件「死锚即红」。

### P2（建议修改，可作为遗留项，但 P2-2 建议随批/紧随处理）—— 3 条

**P2-1｜`ANCHOR_CASES` 的 stale 清单漏 1/12 旧锚 + §9h-2 表外 5 个 anchor 名未做对象核验（守卫完备性缺口）**
- 位置：`tests/host-abi-health.mjs:718`（stale 11 项）、`:748-763`（14 对）
- 事实依据：① `git show cf0e935:tests/metrics.mjs` 旧行号锚**唯一串 12 个**，stale 清单**缺 `smoke.mjs:1680-1681`**（原 `:521` `console.log` 串，本批确已改写）⇒ 该旧锚若复活（revert/merge/复制粘贴）不判红；② 未入对象核验的 anchor 名 5 个（`reminder carries attachment id + route_agent instruction` / `escape-group turn also injects reminder` / `attachmentIds resolution (M2)`×2 / `log keeps original image block (F3)`）——对象**均实存**（`smoke.mjs:2942/2950/1880/2614`），故非缺陷，但其「改名/删除即红」无判别力；③ 注释 `:717`「跨行/合并写作的形态由 9h-2 的对象核验覆盖」对 `:57`（跨行注释）与 `:118-119`（`//` 隔断）**不成立**（对象核验键用的是 `:133` / 表内串）。
- 影响：守卫覆盖面小于其文字声称；同类漂移仍可能静默漏网。
- 建议：补 `smoke.mjs:1680-1681` 入 stale；把上述 5 名并入 `ANCHOR_OBJECTS`（或采 P1-1-B 的完备性自检，一次性覆盖全部形态）；修正 `:717` 注释为如实范围表述。

**P2-2｜逐笔归因不符：0o600 代码改动实际落在 `1b5cead`（P2-2 笔）而非 `4e5c848`（文档笔）；`1b5cead` 未声明该改动、`4e5c848` 声称做了该改动（P4-violation：一个 commit 承载一个问题）**
- 位置：`tests/smoke.mjs:1260-1267`（else + skip）/ commit `1b5cead` 提交信息 / commit `4e5c848` 提交信息与 diff
- 事实依据：`git log -S"Windows-only 例外：本平台" -- tests/smoke.mjs` = **`1b5cead`**；`git show --stat 1b5cead` = `{lib/service.js, tests/smoke.mjs}`，`git show --stat 4e5c848` = **`{ci.yml, README.md}`（零代码行）**；`1b5cead` 提交信息全文只述 P2-2 ①②，**未提 0o600**；`4e5c848` 提交信息称「smoke.mjs 的 'device credential file is owner-only' … 改为 else 分支打印可见 skip」，与其实采 diff 不符（该改动在其父提交已存在）。
- 影响：调度清单「#8 `4e5c848` = 0o600 改可见 skip（本批唯一运行期可见变化）」与「#7 `1b5cead` = 默认实参 ⇒ 行为零变化」**两处归因均不准确**；`1b5cead` 混入两个独立问题（违反 `AGENTS.md` 编程要求 4「一个 commit 承载一个问题修改」——`P4-violation`），并使「本批唯一运行期可见变化」的定位落到错误笔上；台账/证据若照抄将无法按笔复现。
- 建议：① 证据与台账按实采改记「0o600 可见 skip = `1b5cead` 笔内改动（同笔混入 P2-2，属 P4-violation 记录）；`4e5c848` = 纯文档口径同步笔」；② 不改写既有历史提交（保持不可变），以台账注记更正；③ 后续批次遵循一笔一问题。

**P2-3｜中间态口径自相矛盾（`4e5c848`）：既称 shim 臂「不再计入」，又称 ubuntu「计数不变」，并把 Windows 侧来源计入 ubuntu 分项**
- 位置：commit `4e5c848` 的 ci.yml/README 改动（其文本：`①shim 臂已由 FIX-040 P2-2 平台中立化，不再计入，…⇒ ubuntu 计数不变` + 分项 `smoke 5 条 = … + FIX-038 新增来源 4 条（-File 3 + POSIX online checks 1）`）
- 事实依据：① shim 收口使 ubuntu 少 1 条（实测穷举 §四.8：ubuntu = 探针 1 + `-File` 3 + host-contract 2 = 6）；② `POSIX online checks` 的触发条件是 `posixShell() === null`（`install-entry.mjs:135-141/:347-349`），ubuntu 自带 sh+curl ⇒ **永不触发**，属 Windows 侧来源（Coordinator 推算与其一致）；③ 二者叠加后 ubuntu 真值 = 6 而非不变；`08d562a` 已修正为 `#SKIP 6 (…×4)`，**最终 HEAD 口径经我独立穷举复核完全正确**。
- 影响：中间态（`4e5c848` 时点）文档数字与代码触发条件**不符**（多计 1 条 Windows 侧来源、少计 1 条 shim 收口），若该时点被推送/引用即构成口径失实；最终态已自洽。
- 建议：① evidence-log 如实记录「`4e5c848` 中间态 ubuntu 口径有误 → `08d562a` 修正（Coordinator 机验 + Developer 双证据链复核）」，避免后续读者按 `4e5c848` 的推导复算出 7；② 后续口径类改动建议附「触发条件 → 平台 → 计数」小表（本批 `08d562a` 已接近该形态）。

### P3（讨论/建议，不要求修改）—— 8 条

**P3-1｜守卫 check 标签「行号式锚零残留」对其守卫文件不成立（标签 vs 实采）**
- 位置：`tests/host-abi-health.mjs:736`（标签）、`:720/:722/:725/:726`
- 事实依据：实测被守卫文件仍含行号式锚 —— `tests/install-entry.mjs`：`install.ps1:1`、`install.sh:2`（:38，现值**准确**：install.ps1:1 = 「Windows / PowerShell 5.1+」、install.sh:2 = 「macOS / Linux / Git Bash」）；`.github/workflows/ci.yml`：`install.ps1:1`；`tests/metrics.mjs`：`index.js:4832-4835` 形态 1 处。守卫语义实为「**清单内**旧式锚零残留」。
- 建议：标签/注释改为限定语形态（或把这 3~4 处一并纳入清单），避免「零残留」被读成整文件无行号锚。

**P3-2｜`.test-home/` 新增 10 个 FIX-040 取证件未入治理记录（R0 P3-5 同族复发）**
- 位置：`.test-home/fix040-{deadanchor-check,9h2-diagnose,label-diagnose,guard-demo}.mjs`、`fix040-{final-gate,final-gate2,postfix-gate,smoke-gate}.txt`（另 FIX-038 两份仍在）
- 事实依据：`.test-home/` 在 `.gitignore` 内 ⇒ `git status` 干净、未入库、未在 evidence-log 引用（取证 #18）；其中 `fix040-guard-demo.mjs`/`fix040-deadanchor-check.mjs` 正是 N4「三类 stale 判别实证」的原始证据脚本（本审查核验其变异目标在当前 HEAD 全部命中 ⇒ 可复现）。
- 建议：evidence-log 机录路径 + 复跑命令（或移入 `.governance/` 存档）；一次性清理历史件时保留本次证据。

**P3-3｜镜像锚清单数字与实采不符（「各 12 处」vs 实测每文件 15 处）**
- 位置：`lib/client.js` / `tests/served-client.js`
- 事实依据：两文件 `Get-FileHash` **相同**（字节恒等；守卫 = `tests/host-abi-health.mjs:156-157`）；每文件 `*.js:NNN` 锚 **15 处**（其中 `client.js:NNN` 自身锚 **9 处**：`:4754-4825/:889-911/:581/:2842-2848/:4493-4499/:175-179/:170/:752/:193`）——均非 12。
- 建议：台账更正数字并保留「高风险面排除」的理由（字节恒等镜像 + 396KB 产品 bundle ⇒ 双改成本/风险高）；本审查**认同延后**，仅需口径更正。

**P3-4｜`CHANGELOG.md:59` 的 `#SKIP 1 (smoke.mjs×1)` 被本批 supersede（→2），因落在已发布节 v0.5.0 内不回改**
- 事实依据：`:59` 位于 `## v0.5.0`（:6-:60）节；本批使 Windows 基线升为 2（实测）；无未发布节可承载该数字更新（顶节即已发布节）⇒ 仅能由后续版本节披露。
- 建议：台账登记「已发布节内数字被 FIX-040 supersede」，避免与 README:249 现值形成读者可见冲突。

**P3-5｜注入平台的 `.cmd` 断言依赖实机 `ComSpec`（POSIX 侧潜在环境敏感）**
- 位置：`tests/smoke.mjs:1634`（断言）→ `lib/service.js:1635`（`process.env.ComSpec || 'cmd.exe'`）
- 事实依据：断言 `cmdInv.executable.toLowerCase().includes('cmd.exe')`；设计已声明「PATH/ComSpec 仍取实机，不虚构宿主环境」⇒ 若 POSIX 宿主环境恰好设置非 cmd.exe 的 `ComSpec`，该断言会红（本机/CI 均无此变量，风险低）。
- 建议：可选把断言锚定形态（`/d|/s|/c` 前导 + 引号包裹 + `argv.length === 4`）而非二进制名；或在测试内临时注入 `ComSpec`。

**P3-6｜§9h-2 使用 `'+「…」'` 片段键（弱锚键形态）**
- 位置：`tests/host-abi-health.mjs:751/756/759/760/761`
- 事实依据：5 项 anchor 键为合并写作的**后半片段**（如 `+「wrapper twin mirrors catalog」`）⇒ 若前半句被改写而片段仍在，仍判绿（锚侧判据偏弱）；对象侧判据不受影响。
- 建议：可选改为整条证据行（或锚 + 对象成对使用同一完整串）。

**P3-7｜`install-entry.mjs:52-53` JSDoc 括号断行（纯格式 nit）**
- 位置：`tests/install-entry.mjs:52-54`
- 事实依据：`:52` 仅 21 字符（`* 保护语义却零判别测试（已知覆盖缺口，`），括号内容跨行续于 `:53`；`:54` 长 85 字符（该文件最长行 286 字符 ⇒ **未超既有分布**，故仅记断行 nit，**不主张超长行**——沿用 R1 对未测量判断的撤回先例）。
- 建议：可选：把 `（已知覆盖缺口，台账候选）` 并入一行重排。

**P3-8｜同族 `README L125` 锚已实测漂移（2 处 shipped 引用），台账引用位置枚举漏列该 2 处**
- 位置：`lib/service.js:1278`、`tests/routing-paths.mjs:596`（均引 `README L125`）；对照 FIX-040 台账行⑥（引用位置枚举 3 处）
- 事实依据：`README.md:125` 现为「把下面这段提示词发给 DSH 主 agent…」（安装提示句）；被引事实「qwen3.7-plus 可看图却会被误拒」现位于 **`README.md:266`**（FAQ 节）⇒ 锚**已漂移 ~141 行**；该族与本批已清扫的 `README L16/L158/L165` 同型（`README L<n>` 式），已由残余报告**如实列出**（非隐匿），但不在计划表 ⑨ 清单、不在 `ANCHOR_CASES`（`:708-729` 无 `lib/service.js` / `tests/routing-paths.mjs` 案例），且 R1 取证 #12 与台账⑥的位置枚举只列 3 处（`lib/preset-defaults.js:348` / `tests/preset-defaults.mjs:1067/1074` / `CHANGELOG.md:25`）⇒ **实际 shipped 引用 5 处**，枚举不全。
- 裁定：**正当延后（台账）** —— 与 R0 P3-3「同类锚残留 3 处 → 台账」先例同型（本批未改符合编程要求 4 的纯粹性，且已如实披露）；但**台账补齐后**该 2 处 MUST 出现在引用位置枚举中，避免下次清扫继续漏网。
- 建议：把 `lib/service.js` / `tests/routing-paths.mjs` 纳入 `ANCHOR_CASES`（或纳入 P1-1-B 的宽松抽取自检）；可选随后续批次改为「README「常见问题」节 qwen3.7-plus 句」式闭包锚。

---

## 六、硬门槛裁决

| 门槛项 | 阈值 | 实测 | 裁决 |
|--------|------|------|------|
| P0 阻塞问题数 | = 0 | 0（§五 P0 无） | **PASS** |
| 5 维度全覆盖 | = 100% | 正确性/安全性/可维护性/性能/测试覆盖 逐一有结论（§二） | **PASS** |
| 每条发现标注级别 | = 100% | P1×1 + P2×3 + P3×8，每条带文件:行号 + 事实依据 + 建议 | **PASS** |
| 设计一致性检查 | 已完成 | 与 FIX-037 ①「禁静默降级 + skip 可见」、`ci.yml` 头部契约（RISK-001 第①步）、ARCH-004 §5.3(c)、`AGENTS.md` 原则 1/4/7/8/9 + 编程要求 4（**1 项违反：P2-2 = P4-violation**）、P5 单一路径，以及库内既有锚守卫先例（§9h）逐项比对 | **PASS（含 1 项 P4-violation 记录）** |
| AI 代码专项 5 项 | 全部完成 | mock/硬编码/**幻觉引用（有 1 项 → P1-1）**/TODO/过度实现 逐一有结论（§三） | **PASS（AI 专项命中 1 项）** |

### 审查结论

> **NEEDS_CHANGE**
>
> 理由：本批 8 项运行期与文档面交付**质量高且经我独立复现**——① 门控本机 exit 0（`26.4s`、`#SKIP 2 (smoke.mjs×2)`，与文档逐字一致）；② 断言集合机比对**零删除、净增 2**；③ P2-2 / P2-3 的等价性（默认实参与前后判据逐字等价、调用点全 2 参、两处 `String()` 前置）**成立**；④ W8b 只加 win32 可见 skip、POSIX 侧零变化；⑤ W4 全部落在注释/字符串字面量；⑥ W5/W3/W8a 新锚**所指对象逐一实存**；⑦ ubuntu `#SKIP 6` / Windows `#SKIP 2` 经我**穷举全部 skip 站点与触发条件后逐条吻合**；⑧ 越权面零、变异零残余、如实性声明（ubuntu 为预期值）充分。
>
> 但**本批最高价值项（N4 锚守卫）存在可达判据缺口 + 一处真实死锚**：`tests/metrics.mjs:118-119` 新写的锚名 `twin resolveModel mirrors model identity` 在全库无对象（属 AI 专项「幻觉引用」），而 §9h-2 的 14 对对照表与 `ANCHOR_CASES` 均未覆盖它、Developer 尝试过的 generic 抽取对该形态为假阴性 ⇒ 守卫的「死锚即红」声称与实际覆盖不符（P1-1），附 stale 清单漏 1/12 与 5 个 anchor 名未做对象核验（P2-1）。修复成本 ≈ 3 行 + 1 条完备性自检断言，收益是**把「锚指向不存在对象」这一本批正在收口的失效模式真正关进机器看护**。故本轮判 **NEEDS_CHANGE**（非 P0 级：无运行期/数据/安全影响，改动面小、风险低），返工后请派发**复审**（round=1，注入本报告路径）。

---

## 七、未验证项声明（事实依据红线）

1. **ubuntu 侧执行结果仍未实测**：`#SKIP 6 (host-contract.mjs×2, smoke.mjs×4)` 与「P2-2 平台中立化在 POSIX 真机同样绿」属**预期值**（已由我按 7 类触发条件穷举逐条推演、与我实测的 Windows 侧口径互校），本机无 Linux/WSL/docker ⇒ **不可复跑，不得读作已验证**；文档已如此标注 ✅。
2. **N4 三类判别演示未经我复跑**（任务要求：只读判别可达性）：我做了——① 逐行读判据实现为纯 `filter/includes` 且 `:859-860` 判红可传导；② 校验 4 个变异 `from` 串在当前 HEAD 全部命中（演示非空转）；③ 校验 `git status` 变异零残余。**未执行**任何变异脚本（Reviewer 不运行写操作）。
3. **CI 日志本体不可本地取证**（远端私有仓库）；本报告对 ubuntu 的结论均为**推导 + 穷举自洽**，未标为实测。
4. **Windows 侧为本机实测**：门控 `exit 0`、`#SKIP 2 (smoke.mjs×2)` 两条 skip 原文、断言净增 2 —— 均为本次独立复跑所得（第 4 次独立跑）。
5. **镜像文件等价性**：`lib/client.js ≡ tests/served-client.js` 以 `Get-FileHash` 判等（字节恒等），未逐字节 diff（哈希判等已足够）。

---

## 八、建议 Coordinator 动作（按依赖排序）

1. **判定返工（本轮）**：结论 = **NEEDS_CHANGE** ⇒ 请以 review-record CLI 机录本报告（canonical 名 `review-FIX-040-R0.md`，自动 `next_round`），并派发 Developer 做 **P1-1（A 锚改写 + B 表/自检）** 与 **P2-1**（可一并），随后 MUST spawn 同一 Reviewer 复审（round=1，注入本报告路径）。
2. **可随返工一并（低成本纯格式项）**：P3-1（守卫 check 标签限定语）；P3-6（`'+「…」'` 片段键改整行）；P3-7（JSDoc 断行）。
3. **台账更正（不回改历史提交）**：
   - ① P2-2 归因更正：0o600 可见 skip = `1b5cead` 笔（同笔混入 P2-2，记 `P4-violation`）；`4e5c848` = 纯文档笔；
   - ② P2-3 记录「`4e5c848` 中间态 ubuntu 口径有误（自相矛盾）→ `08d562a` 修正」，并保留最终口径 `#SKIP 6 / #SKIP 2`（本审查已独立复核）；
   - ③ P3-3 镜像锚数更正（每文件 15 处 / 自身锚 9 处）+「高风险面排除」理由（字节恒等镜像）；
   - ④ P3-4 登记 `CHANGELOG.md:59` 的 `#SKIP 1` 被本批 supersede（已发布节冻结不回改）；
   - ⑤ 台账行⑥的**引用位置枚举补全**：补 `lib/service.js:1278` / `tests/routing-paths.mjs:596`（实为 5 处 shipped 引用，现只列 3 处，P3-8）；并登记 P3-1（守卫标签 vs 实采）与 P2-3/P2-2 的更正记录。
4. **证据归档**：`.test-home/fix040-*.mjs`（4 个）+ `fix040-*-gate(t).txt`（4 个）路径与复跑命令机录 evidence-log（P3-2；R0 P3-5 同族），并在完成后补 EV（含本报告结论与复审轮次）。
5. **发布面提示**：本批仅测试/注释/文档 + 1 处纯增可选参 ⇒ **不产生用户可见行为变化**（除 Windows 本地门控多 1 条 skip 行）；CI 首跑前不得声称「CI 已验证」。
