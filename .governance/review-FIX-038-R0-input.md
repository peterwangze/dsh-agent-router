# 代码审查报告（review-FIX-038-R0-input）

- **审查对象**：`cc89119`（FIX-038，4 文件 +118/−20）/ `3f3e59b`（FIX-039 lib 笔，1 文件 +5/−1）/ `5d8af6e`（FIX-039 README 笔，1 文件 +3/−2）；受审 HEAD = `5d8af6e6d5fbb9acb4ae8a2982f0d637d38c0b17`
- **审查者**：Code Reviewer Agent（只读；未修改任何产品代码；唯一写入 = 本报告文件）
- **执行依据**：三笔 commit 的 `git show` 全量 diff、相关文件全文（含 `lib/` 未改动面）、绑定 SKILL `skills/code-review/SKILL.md`、本机独立复跑门控与独立取证实验
- **结论**（四态）：**APPROVED_WITH_NOTES**
- **独立结构字段**：`unresolved_blockers=0`
- **计数**：P0 = 0 / P1 = 0 / P2 = 5 / P3 = 7

---

## 一、独立取证清单（所有结论的可复查事实源）

| # | 事实 | 取证命令 / 结果 |
|---|------|----------------|
| 1 | 受审 HEAD 与工作树 | `git rev-parse HEAD` = `5d8af6e6…`；`git status --short` = 仅 ` M .governance/plan-tracker.md`（未提交，Coordinator FIX-039 立案行；**三笔受审 commit 均未触 `.governance/**`**） |
| 2 | 改动面（无越权） | `git show --stat cc89119` = `.github/workflows/ci.yml` 31 / `tests/attachments.mjs` 10 / `tests/install-entry.mjs` 77 / `tests/smoke.mjs` 20 → **`lib/` 零改动**；`3f3e59b` = `lib/host-abi/llm-selection.js` 5+/1−；`5d8af6e` = `README.md` 3+/2−。三笔均未触 `AGENTS.md` / `package.json` / `CHANGELOG.md` / `.governance/**` ✅ |
| 3 | 门控独立复跑（本审查执行） | `node tests/run-all.mjs` @`5d8af6e` = `ALL 20 SUITES + 4 RUNNER MODULES (via smoke.mjs) PASSED (26.7s)  #SKIP 1 (smoke.mjs×1)`，**exit 0**；唯一 skip 行 = `skip POSIX online checks (no sh/curl available)`（install-entry §5，符合 ci.yml「Windows 本地正常态」口径） |
| 4 | 断言集合比对（逐条） | 修复前后逐条对照：被 skip 的每条在**适用平台仍执行**（win32 下 §6/§6c/§6d 与 `.cmd` shim 两条照跑）；平台中立 `wrapCmdLine passthrough`（smoke.mjs:1634）恒跑；**无断言删除**、**无 `if (win) { … }` 静默包裹**；§4/§5 的旧内联 skip 行与新 `skipArm` 输出**逐字等价**（旧 `'  skip PowerShell online checks (no powershell/pwsh available)'` ≡ `skipArm('PowerShell online checks', 'no powershell/pwsh available')`） |
| 5 | skip 聚合机制（口径可判定） | `tests/run-all.mjs:148` `SKIP_LINE = /^ {2}(?:skip\s\|--\s)/` 同时命中 `skipArm` 形态与 `host-contract.mjs:89` 的 `  --  ` 形态；install-entry 属 smoke 子进程 stdout（smoke.mjs:7/8 import，:2371/:3085 调用）→ 计入 `smoke.mjs×N`；`host-contract.mjs` 无宿主路径恰 2 条 note（:534 / :658）→ **ubuntu 计数口径 7 = host-contract×2 + smoke×5 推导自洽** |
| 6 | LRU 修复 POSIX 语义取证（三重独立） | ① 本审查独立变体（自建判据 + **真实** `AttachmentRegistry` + `path.posix`）：旧判据 `{a1:false, a2:true, a3:false}`、新判据 `{a1:true, a2:true, a3:true}`；② 开发者证据脚本 `.test-home/fix038-lru-sim.mjs` 复跑 **exit 0**（旧夹具两断言 FAIL + `size===cap` 仍 true ↔ 修复后全 PASS）；③ `.test-home/fix038-lru-verify.mjs` 复跑 **exit 0**（**抽取 `tests/attachments.mjs` 真实夹具源码** + POSIX `join` 语义驱动真实 registry → `displayPath` 保持原路径）；嵌套实证书：`posix.join('/repo/.test-attachments-work', '/repo/….test-attachments-work/lru-0.txt')` = 自嵌套重复路径 |
| 7 | F-8 pickaxe 复核 | `git log -S"全部节点" --all` / `-S"生产代码证据" --all` **均仅命中 `2a119f9`**；`git grep "B0" -- lib/` 仅命中无关的 `inject-manifest.js:15,41`；`.governance` 全域命中 = `review-REL-012-R1-input.md:191` + `review-REL-012-R2-input.md:107`（**审查报告自身**）；`git diff --stat 2090267..4672973 -- lib/host-abi/llm-selection.js` = **空** |
| 8 | 锚准确性复核 | `git show e541028^:lib/preset-defaults.js` :249-263 = `function inheritedRouteOf(parent)` 本体 ✅（S-2 陈述成立）；现 `lib/preset-defaults.js:379` = `inheritedRouteOf(parent)` 消费调用（子代理 fixup 分支，:374-385）✅；反向：`:99` 锚（209-240）现为 `installPresetDefaults`/`seed` 段、`:179` 锚（303-307）现为 restore 失败告警段 → 均已漂移 |
| 9 | 口径三方自洽 | `ci.yml:44-50` ≡ `README.md:249` 数字逐字一致；机制见 #5；`ci.yml` **未声称 ubuntu 已验证**（首跑数字以「正常态」表述，属预期值） |
| 10 | README（`5d8af6e`）事实核 | S-3：`lib/client.js:3293-3312` `sectionHead` 序 = 总开关卡 → `HostHealthCard`（:3306）→ 降级行 → 分级分类卡片清单在后（故「四个分级分类卡片」不含该面板系符合实现）+ `CHANGELOG.md:14`「新增」首位；状态词表 = `lib/host-abi/health.js:23` `FACE_STATES = ['ok','degraded','missing']` ✅。F-10：`lib/stats.js:60` `LINE_VERSION = 2` + `:299` `version > toVersion → null`（不可读）+ `:1188` quarantine/坏行清除 + `CHANGELOG.md:51/93`「坏行修复不可逆清除」✅ |

---

## 二、五维度逐项结论

### 维度 1：正确性 —— 结论：**通过**（无缺陷）

- **LRU 夹具修复正确**（重点项）：新判据 `raw.includes(':') || raw.startsWith('/')`（`tests/attachments.mjs:250`）与同文件 `makeFs`（:53）**同口径**；POSIX 语义下 `displayPath === 输入路径`，`byPath(原路径)` 命中（取证 #6 三重实证）；win32 语义下 `join(WORKSPACE, …)` 含盘符 ⇒ 仍走 `includes(':')` 分支 ⇒ **行为与修复前逐字一致，win32 覆盖零损失**（且本机全量门控复跑绿）。断言本体未改（断言照跑、不 skip、不删）。
- **`lstatOrUndefined` 正确**：只吞 `error?.code === 'ENOENT'`，其它错误 `throw error`（`tests/install-entry.mjs:70-77`）——不吞 EACCES/ELOOP 等真实故障；替换点 3 处（:425 / :447 / :476）覆盖了全部"路径可能不存在"的断言点；`tests/` 全域 `lstatSync(` 仅剩 2 处 = 本助手自身 + `removeTempDir`（清理路径，非断言点，见 P3-6）。
- **短路安全**：`nmStat?.isDirectory() === true && nmStat.isSymbolicLink() === false`（:478）——`undefined === true` 为假 ⇒ `&&` 短路，**不会对 undefined 取属性抛 TypeError**；缺失 → 断言如实 FAIL。
- **平台门控正确**：`PS1_OFFLINE_APPLICABLE = process.platform === 'win32'`（:49）；`if (!applicable) skipArm(...)` + `for (const host of (applicable ? hosts : []))` 模式使 win32 侧执行语义**完全不变**；`.cmd` shim 门控（smoke.mjs:1625）只包住依赖 Windows 实现分支的 2 条断言。
- **平台中立断言未被牵连**：`wrapCmdLine`（`lib/service.js:312-317`）为**零平台依赖纯函数**（实测代码，无 `process.platform` 引用）⇒ `wrapCmdLine passthrough`（smoke.mjs:1634）位于门控之外恒跑 ✅（与注释声明一致）。
- **无静默通过**：所有非适用平台路径均经 `skipArm`/`skip` 打印原因行并被 run-all 回显计数（取证 #5）；无 `if (win)` 静默包裹（该反模式在注释中被显式禁止并给出理由）。

### 维度 2：安全性 —— 结论：**通过**（无缺陷）

- 改动面全部为 CI 注释 / 测试基础设施 / 文档，**`lib/` 零逻辑改动**（取证 #2）⇒ 无新增攻击面、无输入校验放宽、无权限判定改动。
- 无硬编码凭据/密钥；无命令注入新面（install-entry 的子进程命令沿用既有模板，本次未改命令构造）。
- **未削弱任何数据保护语义**：`install.ps1` / `install.sh` 的"源码自带 node_modules → 跳过依赖链接、不得改动用户目录"护栏本体未被触碰（`install.sh:94-101`/`:113-131`、`install.ps1:93-127`+拷贝回退护栏）。
- 测试对真实环境零触碰：install-entry/smoke 一贯以临时 `DSH_HOME` 隔离（`tests/install-entry.mjs:351-352`、`tests/smoke.mjs:60`）；本审查复跑门控亦未写用户真实配置目录（`.test-home/` 隔离，见取证 #3）。
- `lstatOrUndefined` 的"降级为 undefined"不会把真实缺陷洗成通过：ENOENT 与真实失败的**可判别性**成立——ENOENT ⇒ 断言 FAIL（标签可定位缺失对象）；非 ENOENT ⇒ 原样抛出（不为旁路）。**唯一可注意点**：FAIL 行未带 `detail`（smoke 的 `check(label, condition, detail)` 支持第 3 参），缺失对象的诊断信息弱于显式错误（P3-8 备注，非缺陷）。

### 维度 3：可维护性 —— 结论：**通过（有 2 项建议）**

- 命名清晰（`PS1_OFFLINE_APPLICABLE` / `PS1_PLATFORM_DETAIL` / `skipArm` / `lstatOrUndefined`）；不适用原因**单点常量**（:52）供三处复用（P5 良好）；函数短小（`skipArm` 1 行、`lstatOrUndefined` 6 行）。
- 注释质量高：根因 + CI 实证编号 + 修法边界 + CI 契约指针齐备（`tests/attachments.mjs:241-247`、`tests/install-entry.mjs:36-77`、`tests/smoke.mjs:1618-1624`）。
- 建议项：同文件判据双份（P2-3）、`resolveCliInvocation` 与 `resolveCliSpec` 两种平台惯例并存（P2-2）、`ci.yml:62` 超长行（P3-1）、`3f3e59b` 新注释措辞与括号跨度（P3-4）。
- 重复代码：`PS1_OFFLINE_APPLICABLE ? hosts : []` 三元式出现 3 次（:359/:422/:473）——各段 skip 文案不同故未抽公共循环体，属可接受重复（不必改）。

### 维度 4：性能 —— 结论：**通过**（无缺陷）

- 无算法/循环/IO 变化影响：新增仅 try/catch 包裹与平台常量判断；LRU 夹具复杂度不变（205 次注册 + 1 次刷新）。
- 实测无回退：本机全量门控 26.7s（对照 `CHANGELOG.md` 记载 29.6s 与 Coordinator 28.8s，同量级波动）；CI 单 job 无新增步骤（`node tests/run-all.mjs` 未改）。
- 无 N+1 / O(n²) 引入；无新增大对象/懒加载需求。

### 维度 5：测试覆盖 —— 结论：**通过（有 2 项覆盖缺口，均不阻塞）**

- 被门控的 3 条 `-File` 臂 + 1 条 shim 臂在**适用平台仍执行**（win32 实测全跑）；POSIX 侧 §6/§6c 有对照臂（`:370-380` / `:433-454`）✅ ——**但 §6d 无 POSIX 对照臂**（P2-1，与 README/ci.yml「覆盖对称」声明冲突）。
- skip 可判定性闭环成立：套件打印 → run-all 捕获 → `#SKIP | …` 回显 + `#SKIP n` 汇总（取证 #5）——门控日志可直接判定"哪些断言被跳过"，符合 FIX-037 ① 纪律。
- 双向守卫仍成立：run-all pre-flight 断言 4 个 runner 模块（含 `install-entry.mjs`）在 smoke 的 import + 调用点在场；反向守卫（未排除套件 MUST 含独立入口）在本次复跑中零命中 ✅（取证 #3 启动行）。
- 文档一致性守卫（install-entry §2 与 `tests/host-version-snapshot.mjs` 的 README 断言）随 README 改动复跑全绿 ✅。
- 覆盖率口径：本批不涉产品逻辑，`lib/` 覆盖率不受影响；测试代码本身由"门控即测试"看护。

---

## 三、AI 生成代码专项检查（5 项逐一结论）

| # | 检查项 | 结论 | 依据 |
|---|--------|------|------|
| 1 | mock 残留 | **无** | LRU 假 fs 是**既有夹具**（修复前即存在，:240-257），非新增 mock；产品 `lib/` 零改动 ⇒ 生产代码无 mock 注入；夹具注释明示"lru-*.txt 均为虚构文件" |
| 2 | 硬编码返回值 | **无** | 断言条件全为真值判定（`=== true` / `!== undefined`）；新增 `undefined` 语义经断言判 FAIL（非硬编码通过）；`PS1_OFFLINE_APPLICABLE` 是平台判据常量而非结果常量 |
| 3 | 幻觉 API | **无** | 仅用既有能力：`lstatSync`（已在 `:20` import）、`error?.code`、`String.prototype.startsWith`、`process.platform`、`console.log`；JSDoc `@returns {import('node:fs').Stats \| undefined}` 为合法类型表达式；无编造函数/参数/导出 |
| 4 | 未实现 TODO | **无** | 三笔 commit 的 `git show` 全量文本 grep `TODO\|FIXME\|XXX\|HACK` **零命中**；无占位实现、无跳过断言并留"待补" |
| 5 | 过度实现 | **无** | 改动最小且内聚：4 个 CI/测试文件 + 2 处注释/文档；无顺带重构、无新增抽象、无越界文件；`PS1_PLATFORM_DETAIL` 单点常量与 `skipArm` 助手属**减法式**去重（把 2 处内联 skip 归一）；唯一"扩张"是注释与 ci.yml 口径表，属本任务强制交付面 |

---

## 四、调度要求 7 项逐项结论

### 1. 平台容错纪律核验（FIX-038 核心）——结论：**成立**

- 非适用平台断言为**真 skip**：可见（打印原因行）、含原因（`PS1_PLATFORM_DETAIL` 含平台名与不适用机理）、被 run-all 回显并计入 `#SKIP n`（取证 #5）；**非静默通过、非删除**。
- `.cmd` shim 门控用 `process.platform === 'win32'` + `else skip(...)`，注释显式禁止 `if (win) { … }` 静默包裹 ✅（smoke.mjs:1618-1632）。
- `install-entry` 三处门控均为"先 skip 打印、后空循环"，无"零断言零痕迹"路径（唯一残留边界：win32 且 `hosts` 为空时 §6/§6c/§6d 无断言亦无 skip 行，但此时 §4 已打印 `skip PowerShell online checks (no powershell/pwsh available)`，成因可辨——P3 级观察，不列缺陷）。

### 2. 有无断言被静默丢弃——结论：**无静默丢弃（含 skip 计数机制实证）**

- 比对新旧断言集合：**移除 0 条、改写 0 条、新增 0 条断言**；变更仅为「条件包裹 + skip 分支 + 助手替换」。逐条：win32 ⇒ 全部照跑；非 win32 ⇒ 4 条（shim 组 2 + `-File` 组 3 组/6 断言）以 4 行可见 skip 替代。
- 双向守卫仍成立：run-all 正向（清单 → smoke 接线/调用点）+ 反向（未排除套件 MUST 含独立入口/退出闸）在本次独立复跑中均通过 ✅。
- 计数可核：Windows 实测 `#SKIP 1 (smoke.mjs×1)`；ubuntu 推导 `#SKIP 7 (host-contract.mjs×2, smoke.mjs×5)` = 1（ps 探针 `powershell` 缺失）+ 1（shim 组）+ 3（`-File` 三组）= 5，加 host-contract 2（:534/:658）——与 ci.yml:45-50/README:249 口径一致 ✅（ubuntu 实测仍属预期值，见 P2-5/P3-2）。

### 3. `PS1_OFFLINE_APPLICABLE` 依据与门控完整性——结论：**依据成立；门控三处完整，无同类臂遗漏**

- 自述证据：`install.ps1:1`「Windows / PowerShell 5.1+」、`install.sh:2`「macOS / Linux / Git Bash」✅；机理证据：`install.ps1:93` `New-Item -ItemType Junction`、`:97-107` robocopy 回退、`:66` `Join-Path $dshHome 'profiles\node_modules'` 反斜杠子路径 ✅；CI 边界证据：`ci.yml:59-62`「必须 Windows 本地跑…目录 link 语义（win32 走 junction，POSIX 走 symlink）」✅。
- 门控三处 = §6（:356-359）/ §6c（:419-422）/ §6d（:470-473），与任务面一一对应；**检查同类臂**：§4 在线 `-Command` 臂（不含 install.ps1 离线链接语义）、§8 git 失败中止臂（断言失败路径，不涉链接语义，跨平台照跑）——均**不应**被门控，且 ci.yml:56-58 已如实声明，无遗漏同类臂 ✅。

### 4. `lstatOrUndefined` 核验——结论：**正确、替换完整、无反向风险**

- 只吞 ENOENT，其它照抛（:70-77）；替换点 3 处（:425/:447/:476）覆盖§6c/§6c-sh/§6d 全部断言面；`removeTempDir` 的 `lstatSync`（:238）属清理路径（P3-6 备选收口）。
- 反向风险（真实失败被降级为 FAIL 掩盖）**不成立**：ENOENT 恰是"安装脚本未产出链接"这一真实失败面，降级为 `undefined` ⇒ 断言 FAIL（失败被如实报出，且不再阻断后续断言与诊断——正是本次修复目标）；非 ENOENT 故障不降级。

### 5. LRU 夹具修复正确性（重点）——结论：**正确；win32 语义零破坏；产品侧零改动**

- 与 `makeFs`（:53）**同口径** ✅；POSIX 语义下两条 `byPath` 断言由 FAIL→PASS（三重取证 #6），且 `size === cap` 断言在旧夹具下本就 PASS（与 CI 首跑日志"5 失败"含 LRU×2 而非 ×3 吻合）；win32 语义下判据分支与修复前**完全等价**（盘符分支命中）⇒ 未为修 POSIX 而破坏 win32 覆盖。
- **产品侧零改动核验**：`cc89119` 改动文件清单不含任何 `lib/**`（取证 #2）；`AttachmentRegistry` 路径索引语义（`registerEntry` 以 `workspacePath` 为键、`byPath` 直查，`lib/attachments.js:214-216/536-541`）未变 ⇒ **产品侧零缺陷零改动**，Developer 的定性纠正成立。
- 泛化性（P5）复核：`tests/` 内同型判据共 9 处——`metrics.mjs:368/580` 用旧式判据但其 `WORKSPACE = 'D:/work/metrics'` 恒含冒号 ⇒ 恒走 raw 分支、不受平台影响；`routing-paths.mjs:159` / `smoke.mjs:373/2083/2115` 已是平台中立式 ⇒ **仓库范围无其他遗漏实例**（唯一改进空间是同文件双份，见 P2-3）。

### 6. `3f3e59b` 纯注释声称核验——结论：**成立（机器判定 6/6 行为注释行）**

- 机器分类（`git show --format= --unified=0` 后逐行正则判定）：changed lines = 6，comment-form lines = 6 ⇒ **100% 注释行，零逻辑行、零字符串字面量、零导入/导出变化**；改动位于 `:132-142` 的同一 JSDoc 块内，JSDoc 结构完好（`/**` … `*/` 配对）。
- 新锚表述准确性：删去行号锚 `preset-defaults.js:249-263` → 改「函数名 + 文件」；`e541028^:249-263` = `function inheritedRouteOf(parent)` 本体（取证 #8）⇒「B3 迁移时点准确」**成立**；「原位只余消费调用 `inheritedRouteOf(parent)`」**成立**（现 `lib/preset-defaults.js:379`，子代理 fixup 分支）✅。
- 残留同类锚 3 处（:29/:99/:179）——本次未改符合范围纪律（见 P3-3，含实测漂移证据）。

### 7. 口径一致性（ci.yml ↔ README ↔ run-all 机制）——结论：**三方自洽且如实**

- 数字侧：`ci.yml:45-50` 与 `README.md:249` 的 ubuntu `#SKIP 7 (host-contract.mjs×2, smoke.mjs×5)`、Windows `#SKIP 1 (smoke.mjs×1)` 逐字一致 ✅；机制侧：run-all 的 skip 行正则、`#SKIP | …` 回显、汇总 `#SKIP n (套件×条数)` 与声明一致（取证 #5）✅；计数推导自洽（见 §四.2）✅。
- 如实性：ci.yml **未声称 CI 已验证本批修复**（首跑数字以"正常态"表述）；`ci.yml:30-32`「该平台事实以 CI 首跑日志确认」针对 pwsh 存在性，属实（首跑日志中的 pwsh 臂失败即反证 pwsh 在场）。**但修复后计数属预期值**（见 P3-2）。
- 唯一口径失实点 = 「覆盖对称」（P2-1），非数字面。

### 8. F-8 纠正与残差处置裁定——结论：**两处纠正均成立；残差披露基本充分（缺 §8 面）；建议 F-8「代码半边」按"无对象"结案 + 台账更正**

- **纠正 ①（LRU 非 Windows 专属断言）成立**：真因 = 夹具 `lruFs.resolve` 判据缺陷（PATH 语义）+ `path.join` 对绝对路径第二参不重置（≠ `resolve`）；产品侧零缺陷零改动（取证 #2/#6）⇒ FIX-038 台账行将其定性为"Windows 专属测试臂在非 Windows 运行器执行"**属过宽定性，应更正**。
- **纠正 ②（F-8「代码半边」无对象）成立**：`git log -S` / `git grep` 三重取证均仅命中审查报告自身（取证 #7）；Developer **未制造句子以"收窄"** 的处理符合"报告一切与声明不符的发现、不顺带改"纪律 ✅。
- **残差披露充分性**：机制面披露充分（无 Linux/WSL/docker；LRU 靠 POSIX 语义仿真 + 真实夹具/registry 取证；§6c-sh 待 ubuntu 首跑；`#SKIP` ±1 取决于 runner 的 `powershell` 别名）——本审查已独立复现其取证链（#6）。**不足**：§8（git 失败中止/ghost 臂，`install-entry.mjs:487-552`）同样是 ubuntu **首次执行**面（首跑在 §6c 崩溃，未及执行），未纳入披露（P2-5）。
- **F-8「代码半边」处置建议（供 Coordinator 裁决）**：
  1. **结案定性 = 无对象（前提不成立）**，不需要任何代码改动；
  2. **台账留痕**：在 plan-tracker FIX-039 行 / F-8 项记录"代码半边无对象 + pickaxe 证据（`git log -S` 仅 `2a119f9`；lib/ 零命中；命中位于 `.governance/review-REL-012-R{1,2}-input.md` = 审查报告自身）"；
  3. **更正错误事实来源**：`review-REL-012-R2-input.md:107`（与 R1:191）的"事实：…生产注释原文含…"是**前轮审查的事实性误记**，应加更正注记，避免该假事实继续被下游引用；
  4. **同批更正 FIX-038 台账行的 LRU 定性**（见纠正 ①）；
  5. FIX-039 实际交付面 = `{S-2, S-3, F-10}`（①无对象），与『①②合并为一次 `lib/**` 触碰』的立案表述不冲突，但建议明确记为"① 无对象，仅②落地"。

### 9. 无新引入 + 无越权改动——结论：**成立**

- 无阻塞/P1 级新引入（P0 = 0、P1 = 0）；P2 清单见 §五（5 条，均为口径/覆盖/可维护性建议，非功能缺陷）。
- 越权面：`.governance/**`、`AGENTS.md`、`package.json`（含版本位）、`CHANGELOG.md` **均未被三笔 commit 触碰** ✅（取证 #2；版本位冻结于发布事实，`5d8af6e` 提交信息亦声明"不改 CHANGELOG、不改版本引用"，实采一致）。
- 工作树唯一未提交改动 = `.governance/plan-tracker.md`（+1 行 FIX-039 立案，Coordinator 治理记录面）——**不属受审范围**，但建议该行随 F-8 更正一并修订（其 F-8 前提句现已被推翻）。

---

## 五、发现列表（每条：文件:行号 + 级别 + 事实依据 + 修复建议）

### P0（阻塞）—— 0 条
无。

### P1（关键）—— 0 条
无。

### P2（建议修改，可作为遗留项）—— 5 条

**P2-1｜口径不实：README/ci.yml 的「POSIX 侧同一断言面由 install.sh 臂承担（覆盖对称）」对 §6d 不成立，且 §6d 的 POSIX 保护语义零判别测试**
- 位置：`README.md:249`（「覆盖对称，断言未删除」）、`.github/workflows/ci.yml:43`（「POSIX 侧同一断言面由 install.sh 臂承担（见下条），覆盖对称」）；对照 `tests/install-entry.mjs:470-472`（§6d skip 文案自称"由 sh 臂承担"）
- 事实依据：`install-entry.mjs:433-454`（6c-sh）只覆盖**裸源码**面；§6d（自带真实 `node_modules` 不得改动）**无任何 POSIX 对照臂**（`grep -n "real node_modules" tests/*.mjs` 仅命中 :455/:468/:471/:479 的 PS1 面）。而 `install.sh:94-101`（`源码自带依赖目录：…（跳过依赖链接）`）与 `:113-131`（拷贝回退护栏）明载同一保护语义 ⇒ 同一用户数据保护分支在 POSIX 侧确实存在、却无判别测试（对照 `AGENTS.md` 项目原则 7「数据删除/覆盖路径 MUST 不可逆保护 + 旁路路径判别测试」）。
- 影响：用户可见 README 与 CI 契约注释承载了不成立的覆盖声明（与 F-8 同类"过度断言"，但落在用户可见面）；`install.sh` 的保护分支未来若回归，CI 无法发现。
- 建议：**A（本轮或 R1 小改，2 处措辞）**把"覆盖对称"限定为 §6/§6c，并给 §6d 标注"无 POSIX 对照臂（遗留）"；**B（单列任务，约 15 行）**补 sh 臂：`install.sh --local <含真实 node_modules 的源码>` → 断言 `marker` 保留 && `node_modules` 仍为真实目录（`lstatOrUndefined(...)?.isDirectory() === true && !isSymbolicLink()`）。
- 严重度裁定说明：本项目对"过度断言句"的先例是台账级（F-8 = P3）；本句因落在 **README 用户面 + CI 契约注释**且描述的是**测试覆盖**，取 P2，不升为 P1（无功能/数据影响；缺口为既有，非本批引入）。

**P2-2｜平台判据双惯例并存：`resolveCliInvocation` 未支持平台注入，`.cmd` 分支在 CI 永久零覆盖（且属可平台中立复现的断言）**
- 位置：`lib/service.js:1619-1622`（`const win = globalThis.process?.platform === 'win32'`，形参仅 `(command, args)`）vs `lib/service.js:1549`（`resolveCliSpec(agent, platform = globalThis.process?.platform ?? '')`）
- 事实依据：同文件两种惯例并存；同测试文件 `tests/smoke.mjs:1613-1616` 已在用注入式（`resolveCliSpec({ command: 'gemini', args: '' }, 'win32')`）——即在被门控块**上方 12 行**存在既有平台注入范式。`wrapCmdLine`（:312-317）为纯函数、零平台依赖，其"外引号包裹"语义本可用字面 argv 平台中立复现（现仅 `passthrough` 形态恒跑）。
- 影响：`.cmd` shim + `/d /s /c` 包裹是**只能由 win32 真机覆盖**的分支，本次以可见 skip 呈现（合规）但覆盖缺口未收敛；同一文件平台注入惯例分裂，后续维护者易继续分叉。
- 建议：单列任务——给 `resolveCliInvocation(command, args, platform = globalThis.process?.platform)` 增可选第三参（与 `resolveCliSpec` 同形，向后兼容），shim 断言改注入 `'win32'` 后**全平台恒跑**；`wrapCmdLine outer quotes` 拆出一条字面 argv 断言（如 `['/d','/s','/c','"a b"']` → `'""a b""'`）。

**P2-3｜同文件判据双份（P5）：以注释耦合对齐而非单一实现路径，本次缺陷根因即同族判据漂移**
- 位置：`tests/attachments.mjs:53`（`makeFs.resolve`）与 `:250`（`lruFs.resolve`），耦合说明在 `:241-247`
- 事实依据：两处逐字同判据（`git show` 实证）；本次修复以"对齐注释"固定二者关系，未汇入单点实现 —— 而本批另一项 S-2 修复的主题恰是"行号/位置锚漂移"，同属"靠人工同步维持一致性"的失效模式（同域另有 3 处锚已实测漂移，见 P3-3）。
- 建议：提取单点判据（如 `const isAbsoluteLike = (raw) => raw.includes(':') || raw.startsWith('/')`，或 `resolveWorkspacePath(raw, cwd)`）供 `makeFs` / `lruFs` 共用（约 3 行改动，零行为变化）。

**P2-4｜证据口径不可复现：`3f3e59b` 提交信息中的空 diff 声称在本 HEAD 复跑非空**
- 位置：commit `3f3e59b` 提交信息（「`git diff 2090267..HEAD -- lib/host-abi/llm-selection.js` 为空（该文件自 B4 起零改动）」）
- 事实依据：本审查在 HEAD 复跑 `git diff --stat 2090267..HEAD -- lib/host-abi/llm-selection.js` = `5 insertions(+), 1 deletion(-)`（= 该笔自身改动）；实采为空的是提交时点基线 `2090267..4672973`（本审查实测空），`git log 2090267..HEAD -- <file>` 亦仅命中 `3f3e59b`。
- 影响：结论句「自 B4 起零改动」**成立**，但命令表述不可复现——后人复跑会误判为"B4 后仍有改动"，削弱证据可复查性（红线：结论 MUST 指向可复查事实）。
- 建议：台账注记正确基线（`2090267..3f3e59b^` 或 `2090267..4672973`），并在提交信息/证据行中显式写出"基线 = 本笔提交前 HEAD"。

**P2-5｜FIX-038 闭环证据本地不可得：ubuntu 侧 §6c-sh/§6d/§8 属首次执行面，残差披露缺 §8**
- 位置：`tests/install-entry.mjs:433-454`（6c-sh）、`:455-481`（6d）、`:487-552`（§8，含 3 臂 + ghost 臂）；对照 Developer 残差披露（提交信息）
- 事实依据：CI 首跑套件崩溃于 §6c（`lstatSync` ENOENT，修复前 :413-425 区段）⇒ 其后所有断言**从未在 ubuntu 执行**；本机无 Linux/WSL/docker ⇒ 不可真机复跑。§8 的可推导性（`install.ps1:13` `$ErrorActionPreference='Stop'` + `:52-58` 在线路径首步即 git、失败即 `Write-Error("git clone 失败…")`，伪 git 先于链接语义失败 ⇒ 断言面应为绿）**仅为推导，未经实测**。
- 影响：`#SKIP 7` 与"修复后转绿"目前是**预期**；若 §6c-sh/§8 存在 Linux 侧环境差异，首跑可能仍红，FIX-038 不宜仅凭 Windows 本地绿判闭环。
- 建议：FIX-038 完成判据加两条——① 修复后 ubuntu 首跑**绿**；② `#SKIP 7 (host-contract.mjs×2, smoke.mjs×5)` 实测复核（含 `#SKIP | …` 逐行核对）；并把 §8 与 §6d 一并纳入残差披露（现仅 §6c-sh + `#SKIP` ±1）。

### P3（讨论/建议，不要求修改）—— 7 条

**P3-1｜`ci.yml:62` 超长行破坏既有换行风格**
- 事实依据：该行为口径合并句（`…不再以失败/崩溃形态出现）、宿主运行时装配（真实 DSH runner / fiber`），明显超出全文 ~78 列换行基线（对照 :17-76 其余各行）。
- 建议：拆为两行（语义不变）。

**P3-2｜`#SKIP 7` 表为修复后首跑预测值，建议加限定语**
- 位置：`ci.yml:44-50`、`README.md:249`
- 事实依据：本审查仅实测 Windows 侧 `#SKIP 1 (smoke.mjs×1)`；ubuntu 侧数字系推导（取证 #5），修复后尚未复跑。
- 建议：追加"（修复后首跑前的预期值，以首跑日志复核）"，杜绝将来被读作已验证。

**P3-3｜同类行号锚残留 3 处（含已实测漂移）**
- 位置：`lib/host-abi/llm-selection.js:29`（`git 历史 lib/preset-defaults.js:226-238`，**未 pin revision** ⇒ 读者无法解析）、`:99`（`preset-defaults.js:209-240`）、`:179`（`preset-defaults.js:303-307`）
- 事实依据：`:99` 锚现指向 `installPresetDefaults`/`seed` 段（迁移源 `sessionSelectFaceOf` 已迁出该文件）；`:179` 锚现指向 restore 失败告警段（迁移时点确为 `sessionNeverProduced` :303-307，本审查 git show 实证）——与 S-2 同因同型。
- 建议：单列清扫任务（统一"函数名 + 文件"式；历史锚 pin revision）；本次未改符合编程要求 4（保持修改纯粹性），不建议顺带改。

**P3-4｜`3f3e59b` 新注释两处文字精度**
- 位置：`lib/host-abi/llm-selection.js:133`（「迁移自 preset-defaults.js 子代理 fixup 分支的**内联实现**」）、:132-137（该句嵌于 `（FIX-030-B：…）` 括号内致括号跨 6 行）
- 事实依据：迁移时点（`e541028^:249-263`）实为同文件内**命名函数** `function inheritedRouteOf(parent)`，非内联表达式 ⇒ "内联实现"易误读为"内联写法"; 括号跨 6 行影响可读性。
- 建议：改「该文件内的本地实现」；把锚形说明独立成句（置于括号外）。

**P3-5｜证据脚本留痕不在治理记录内 + 历史残留目录**
- 事实依据：`.test-home/fix038-lru-sim.mjs`（2026-09-12 21:42）、`.test-home/fix038-lru-verify.mjs`（21:48）为本次 POSIX 仿真证据，因 `.test-home/` 在 `.gitignore` 而 `git status` 干净 ⇒ 未入库、未在 evidence-log 引用（它们确实有效：本审查复跑 exit 0，见取证 #6）；另有 `.test-home/entry-{8380,10848,14560}-*`（8/18~8/31）历史中断运行残留（**非本次引入**）。
- 建议：Coordinator 在 evidence-log 机录两脚本路径 + 复跑命令（或移入 `.governance/` 存档）；历史残留可一次性清理（`run-all`/套件自身清理逻辑正常——本次复跑零残留，取证 #3）。

**P3-6｜`lstatSync` 残留于清理路径**
- 位置：`tests/install-entry.mjs:238`（`removeTempDir`）
- 事实依据：条目在 `readdirSync` 与 `lstatSync` 之间消失仍会裸抛；属清理路径、非断言点，风险低（本次缺陷面不在此）。
- 建议：可选同法收口（`lstatOrUndefined` + `continue`），或保持现状（判为可接受）。

**P3-7｜skip 文案与 sh 臂可达性耦合 + skip 行格式契约分散**
- 位置：`tests/install-entry.mjs:357/420/471`（「同一断言面由下方 install.sh / sh --local 臂承担」）vs `:341-342`/`:370`/`:434`（sh 臂以 `if (sh !== null)` 为条件）
- 事实依据：无 sh 环境下 skip 文案会夸大覆盖（此时 :342 另有 `POSIX online checks` skip 行可辨别成因）；另 skip 行格式契约在 4 处重复（`smoke.mjs:53` / `install-entry.mjs:60` / `run-all.mjs:148` 正则 / `host-contract.mjs:89`），无共享常量。
- 建议：可选把"承担"句改条件式（"sh 可用时由 … 承担"）；格式契约现状可接受（进程隔离下共享成本高于收益），仅备选记录。

**P3-8｜缺失对象诊断可加 `detail`（P8 增强，可选）**
- 位置：`tests/install-entry.mjs:429/431/451/453/479`
- 事实依据：`smoke.mjs:38` 的 `check(label, condition, detail)` 支持失败详情报文，但这些调用未传 `detail` ⇒ ENOENT 降级为 FAIL 时，日志只有标签、无线索（如 `depLinkOk=false` 或 `status`）。
- 建议：可选补 `detail`（如 `{ depLinkOk, status: first.status }`），失败时可一次性定位。

---

## 六、硬门槛裁决

| 门槛项 | 阈值 | 实测 | 裁决 |
|--------|------|------|------|
| P0 阻塞问题数 | = 0 | 0（见 §五 P0） | **PASS** |
| 5 维度全覆盖 | = 100% | 正确性/安全性/可维护性/性能/测试覆盖 逐一有结论（§二） | **PASS** |
| 每条发现标注级别 | = 100% | P2×5 + P3×7，每条带文件:行号 + 事实依据 + 建议（发现列表内无未标注项） | **PASS** |
| 设计一致性检查 | 已完成 | 与 ARCH-004 设计 §5.3(c) 演进检测层（CSI 门控不得静默降级）、`ci.yml` 头部契约（§5.3 D3(c) 第①步 / RISK-001）、FIX-037 ①「禁静默降级 + skip 可见」纪律、`AGENTS.md` 项目原则 1/4/7/8/9、P5（单一路径）逐项比对：本批**无偏离**（门控留红能力未削弱、skip 全可见、无产品逻辑改动）；唯一未达成项 = 覆盖对称声明（P2-1） | **PASS（含 1 项 P2 记录）** |
| AI 代码专项 5 项 | 全部完成 | mock 残留/硬编码/幻觉 API/未实现 TODO/过度实现 逐一有结论（§三） | **PASS** |

### 审查结论

> **APPROVED_WITH_NOTES**
> `unresolved_blockers=0`
>
> 理由：三笔 commit 的改动面与声明一致（`cc89119` 测试基础设施、`3f3e59b` 纯注释、`5d8af6e` README 文档），无 P0/P1 缺陷；硬门槛 5 项全部通过；LRU 夹具修复经三重独立取证在 POSIX 与 win32 语义下均正确且产品侧零改动；平台容错纪律（可见 skip、禁静默通过、双向守卫、断言不丢）成立，本机独立复跑门控 `exit 0`。遗留 P2×5（均为口径/覆盖/可维护性建议，其中 P2-1 建议在入仓前或紧随其后做 2 处措辞校正）与 P3×7 记录为后续跟踪项，**不构成阻塞**。

---

## 七、未验证项声明（事实依据红线）

1. **CI 日志本体不可本地取证**：run `34696694673` 的原始日志本机不可读（远端私有仓库）；其失败面结论为**可推导证实**——修复前代码在 POSIX 语义下可逐条复现（LRU×2 FAIL 见取证 #6；shim 组 2 条与 `offline install (-File)` 1 条由 `resolveCliInvocation` 的 `win &&` 门控与 install.ps1 平台耦合直接推出），合计 5 失败 + §6c ENOENT 崩溃，与转述一致。**未标为"已验证日志"**。
2. **ubuntu 侧执行结果未验证**：`#SKIP 7 (host-contract.mjs×2, smoke.mjs×5)` 与"修复后转绿"为预期值/推导（P2-5、P3-2）；§6c-sh / §6d / §8 在 ubuntu 属首次执行面，本地无 Linux/WSL/docker 无法复跑。
3. **win32 语义回归已实测**：本机全量门控 `exit 0`、`#SKIP 1 (smoke.mjs×1)`（取证 #3）——Windows 侧结论为**实测**，非推导。
4. **`lib/` 产品面**：仅 `3f3e59b` 触碰且机器判定 100% 注释行（取证 §四.6）⇒ 产品行为无变化，无需产品级真机验收。

---

## 八、建议 Coordinator 动作（按依赖排序）

1. **复审判定**：本结论为通过终态（APPROVED_WITH_NOTES / `unresolved_blockers=0`）⇒ 无需再 spawn 本 Reviewer；请以 review-record CLI 机录本报告（canonical 名 `review-FIX-038-R0.md`）。
2. **入仓前可选小改（2 处措辞，≤2 行）**：`README.md:249` + `ci.yml:43` 的"覆盖对称"限定化（P2-1-A）；若选择补 sh 臂（P2-1-B）则单列任务。
3. **台账更正（与 F-8 裁决同批）**：① F-8 代码半边 = 无对象（附 pickaxe 证据）+ 更正 `review-REL-012-R{1,2}-input` 的误记事实；② FIX-038 行的 LRU 定性更正（夹具判据缺陷、产品侧零缺陷）；③ FIX-039 交付面记为 `{S-2, S-3, F-10}`（①无对象）；④ `3f3e59b` 空 diff 声称的正确基线（P2-4）。
4. **FIX-038 闭环条件**：加"修复后 ubuntu 首跑绿 + `#SKIP 7` 实测复核"（P2-5），并在残差披露补 §8。
5. **证据归档**：把 `.test-home/fix038-lru-{sim,verify}.mjs` 的路径与复跑命令机录进 evidence-log（P3-5）。
6. **后续候选任务（非本批阻塞）**：P2-2（平台注入 + wrapCmdLine 断言拆分）、P2-3（判据单点化）、P3-3（残留 3 处锚清扫）、P3-1/P3-2 格式与限定语。
