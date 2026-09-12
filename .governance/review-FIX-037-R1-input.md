# REVIEW-FIX-037-R1（Code Review 输入报告）

- **Round**: **R1**（Reviewer 复审轮次）；**前轮引用** = `.governance/review-FIX-037-R0-input.md`（REVIEW-FIX-037-R0，结论 `APPROVED_WITH_NOTES` / `unresolved_blockers=0` / P0=0·P1=0·P2=3·P3=7）；机器记录 `.governance/review-FIX-037-R0.md`
- **Task**: FIX-037-R1（P1）— ARCH-004 终批收账返工复审
- **审查对象**: 返工 commit **`df96ddf`**（父 `a9e06da`；`HEAD == df96ddf`）；`git show --name-only df96ddf` = **4 文件**：`.github/workflows/ci.yml`、`README.md`、`tests/host-contract.mjs`、`tests/host-version-snapshot.mjs`
- **对象完整性核验**: `git show --numstat --format="" df96ddf` = `ci.yml 7/1`、`README.md 2/2`、`tests/host-contract.mjs 30/6`、`tests/host-version-snapshot.mjs 4/2`（合计 **+43/−11**，与下发总数一致；**逐文件数字与下发不同**——下发为 36/6、8/1、4/2、6/2，疑为把 hunk 上下文计入，本报告以 numstat 为准，不构成对代码的判定）；`git status --porcelain` = 仅 `M .governance/evidence-log.md` + `?? review-FIX-037-R0-input.md` + `?? review-FIX-037-R0.md`（**均为治理记录，非本批代码面**）；`git diff --stat a9e06da df96ddf -- tests/run-all.mjs tests/smoke.mjs lib/client.js tests/served-client.js` = **空** ⇒ 上轮四文件本轮确为零改动（R0 对其的核验结论继续有效，**不判「未提交」**）；`git ls-files --eol` 四个返工文件均 `i/lf w/crlf attr/(空)`（无行尾噪声）
- **范围/锁纪律**: `.governance/agent-locks.json:7-28` 与 `:74-79` = **8 项**（含本轮 Coordinator 授权的 `tests/host-version-snapshot.mjs`），本轮改动 4 文件 ⊆ 锁集 ✓，无锁外改动
- **审查工具边界**: 只读——`read/grep/glob` + 只读 git（`show/log/status/name-only/numstat/diff/ls-files`）+ 只读文件系统探查（`Get-Content`/`Get-ChildItem`/正则**文本重放**）；**未执行任何测试、未写代码/治理状态**（唯一写入 = 本报告）

## 1. 审查结论

**APPROVED_WITH_NOTES**（`unresolved_blockers=0`）

- P0 = **0** / P1 = **0** / P2 = **1**（P2-3 残余）/ P3 = **1**（本轮新引入；另 7 项前轮 P3 保持 open，非本轮范围）
- 硬门槛（本轮重新裁决）：P0=0 ✅ / 5 维 100% ✅ / 每条发现带级别 ✅ / 设计一致性完成 ✅ / AI 专项 5 项完成 ✅
- **一句话理由**：R0 的 P2-1/P2-2 **已完整修复且经独立复算**（新建「基线副本」断言经我按同法文本重放确认两键 `MATCH`、块缺失场景 `RED(fail-closed)`；`HOST_KEY_PACKAGES` 7 项在两个 `_npx` 候选上实测 **7/7 === 基线**、零假红；刷新程序「三处→四处」在 `host-version-snapshot.mjs:29`、`host-contract.mjs:150/389`、`README.md:241` 四处措辞一致无残留旧值），P2-3 **部分修复**——「预期内 skip」已写入 `ci.yml:32-37`/`README.md:248` 且 smoke 5.1 臂部分事实精确，但**所引的汇总行 `#SKIP 1 (smoke.mjs×1)` 是 Windows 本地签名**：ubuntu CI 首跑实际为 `#SKIP 3 (host-contract.mjs×2, smoke.mjs×1)`（host-contract 的 S3/S7 两条 `note()` 在无宿主 checkout 时必然产出），导致文档自设的「`#SKIP ≥2` 才需研判」阈值在**首跑即被正常态触发** → 列为 P2 残余（文档级、非阻塞、1 句可闭合）；另发现 1 项**新引入** P3（`ci.yml:25`/`README.md:248` 的「其余 **70** 条静态断言照跑」因新增 1 条无条件断言而陈旧，实为 **71**）。

## 2. 前轮 findings 逐条比对（R1 强制项）

| 前轮 ID | R0 判定 | R1 标注 | 核验依据（可复查事实） |
|---|---|---|---|
| **P2-1** 基线双份常量无机器守卫 | 建议修（P5 方向） | **已修复** ✅ | ① 断言在位：`host-contract.mjs:377-392`（`blockOf(stripComments(readTest('host-version-snapshot.mjs')), 'const HOST_BASELINE = Object.freeze(')` + `snapshotValueOf` + `Object.keys(HOST_VERSION_BASELINE)` 逐键比对 + `check(:389)`）；② **独立重放**：按同法（块注释→行注释两段同长空白替换 + 花括号配平块提取）提取权威块（243 字符，4 键）→ `dsh`/`dshPackages` 两键 `MATCH`（`0.1.5-rc.1`/`0.1.5-rc.2`）⇒ 当前**绿**；③ **fail-closed 复核**：把 marker 改为不存在的 `…freezeX(` → 提取为空块 → `null !== '0.1.5-rc.1'` ⇒ **红**（不因提取失败而静默通过）✓；④ 无硬编码键表（键集来自 `Object.keys(HOST_VERSION_BASELINE)`）✓；⑤ 刷新程序「同步更新三处」→「**四处**」（`host-version-snapshot.mjs:29` + 第四处点名）✓，双向互指（`host-contract.mjs:150-152` 注明「刷新点共四处，第四处即本副本」+ `:151` 说明「独立入口无法 import」的来由）✓，全仓 `三处` 残留检索**无同类旧值**（其余「三处」命中为历史/其它语境）✓；⑥ 断言数 +1 独立佐证：`check(` 出现次数 **57（a9e06da）→ 58（df96ddf）= +1**，且全文件唯一非调用点命中为 `:78` 的注释 ⇒ 「82 断言（+1）」与 FIX-036/EVO-024 普查基数 81 相容 ✓ |
| **P2-2** 版本判据包集缺 S3 两包 + 注释口径不实 | 建议修（1 行 + 1 句） | **已修复** ✅ | ① `host-contract.mjs:164` = `['dsh','dsh-api-remotes','dsh-api-session-controller','dsh-client-ui-model-selection','dsh-llm','dsh-client-ui-settings','dsh-client-locale']`（**7 项**，含 S3 判据两包）✓；② **独立实读**：两个候选 `1e7f6d9597241db0`（靶子）与 `1da1392061ab1944` 的 7 包版本逐一比对基线 → **各 7/7 === 基线，mismatches=0（零假红）** ✓；③ 口径修正：代码注释 `:157-163` 改为「S7 直读四包 + S3 判据两包（`dsh-api-remotes` 为 S3/S7 共用）」，`README.md:241` 同步为「`dsh` + **S7 直读四包** … + **S3 判据两包** …」⇒ 与 `CLIENT_PACKAGE_INJECT_BASELINE:203` / S3 宿主侧判据 `:529-532` 对齐，R0 点名场景（早于 `dsh-client-ui-settings` 的旧副本致 S3 红而版本判据仍绿）**告警与红点自此同源** ✓ |
| **P2-3** `#SKIP` 计数把「平台上不存在的臂」计入 + 文档未预期化 | 建议修（CI 首跑前 1 句文档） | **部分修复（未完全修复）** ⚠️ → 见 §6 P2-1 | 已落地：`ci.yml:32-37` + `README.md:248` 新增「预期内的 skip（非缺陷，FIX-037 R0 P2-3）」段，其中「`powershell` 在 ubuntu 上恒不存在 → 该臂是平台上不存在的执行器 → 同一断言由 pwsh 臂完整执行」**事实准确**，且所引单条行格式 `#SKIP | skip install.ps1 parses (powershell) (probe failed: ENOENT)` 与 `run-all.mjs:174`（`      #SKIP | ${line.trim()}`）+ `smoke.mjs:88`（`probe failed: ${probe.error.code}`）逐字可推导 ✓。**未闭合部分**：同句引用的**汇总行** `#SKIP 1 (smoke.mjs×1)` 与自设阈值 `#SKIP ≥2` 是 **Windows 本地**签名，与 ubuntu CI 语境不符（详见 §6） |
| P3-1 反向守卫判据为文本存在性 / `stripComments` 过剥风险 | 可台账化 | **未修复（保持 open，非本轮范围）** | `tests/run-all.mjs` 本轮零改动（`git diff a9e06da df96ddf -- tests/run-all.mjs` 为空）⇒ 判据与注释未变；R0 §4.2 的 20/20 重放结论在 df96ddf 下**重跑仍成立**（§5.3） |
| P3-2 反向守卫 `readFileSync` 无 try/catch | 可台账化 | **未修复（保持 open）** | 同上（文件零改动） |
| P3-3 失败套件 skip 不计数 | 可台账化 | **未修复（保持 open）** | 同上 |
| P3-4 `oauth-credentials.mjs:126` 恒真断言残留 | 下次触碰该文件 | **未修复（保持 open，非本批锁内）** | 该文件不在 8 项锁集内，本轮无改动（`git show --name-only df96ddf` 无此文件）✓ 与 R0 的口径一致 |
| P3-5 smoke 独立运行计数口径 | 可台账化 | **未修复（保持 open）** | `tests/smoke.mjs` 零改动 |
| P3-6 ③「告警 + note」裁决认可 + 残余 | 台账留痕 | **无代码动作（裁决项）**；代码面维持 | `host-contract.mjs:369` 仍为告警 + `note()`（版本失配时），本轮回工未改变该语义 ✓ 与 R0 认可一致；台账留痕属 Coordinator 动作 |
| P3-7 `stripComments` 三副本 | 注释互指 | **未修复（保持 open）** | 三处副本位置不变；本轮新增的守卫**复用**既有 `blockOf`/`stripComments`（`host-contract.mjs:96-119`），未新增第四份副本 ✓ 方向未恶化 |
| L-1…L-7 遗留项 | 各自期限 | **L-1/L-2 关闭；L-3 部分关闭（见 §6 P2-1）；L-4/L-5/L-6 保持 open；L-7 待台账** | 见 §7 |

**新引入（R1 发现的返工自身问题）**: P3-1（§6 P3-1，「70 条」计数陈旧）——由本轮新增的无条件断言引起，R0 时不存在。

## 3. R1 硬门槛裁决（5 维 + AI 专项 + 设计一致性，按返工后现状重裁）

| 维度 | 结论 | 判定依据（可复查事实） |
|------|------|------------------------|
| 正确性 | **通过** | 新断言逻辑经文本重放确证（提取 → 逐键取值 → 相等判定），`Object.keys` 驱动的键集无硬编码、无空键集旁路（副本含 2 键）；失败方向为**红**（提取空/键改名/任一值不符）⇒ fail-closed ✓；7 包判据在真实宿主上 7/7（§5.2）；`hostTarget` 版本判据的绿分支与 R0 一致（本轮回工未触碰 `:325-374` 的判定逻辑，仅扩包集与注释） |
| 安全性 | **通过** | 返工新增面仅：读取同仓测试文件（`readTest`）+ 一次正则 + 一次 `check` 打印；无网络、无凭据、无用户输入拼接、无新子进程；CI 文档新增内容为静态说明文本 |
| 可维护性 | **通过**（R0 P2-1 已闭合） | 双份常量的来由与锁定机制在**两处**互指（`host-contract.mjs:150-152` / `host-version-snapshot.mjs:29-32`），刷新程序由「三处」修正为「四处」并点名第四处；新守卫自带失败诊断（`key: host-contract=X vs host-version-snapshot=Y|absent`）可定位漏改侧 ✓；残留 nit = 文档数字（§6 P2-1/P3-1） |
| 性能 | **通过** | 新增 1 次 `readFileSync`（host-version-snapshot.mjs ≈6.9KB）+ 2 次单行正则 + `Object.keys`（2 键）；版本判据由 5 包扩至 7 包 ⇒ 每候选 +2 次 `package.json` 读取（本机 2 候选 → 14 次，皆在模块初始化时一次性）⇒ 可忽略 |
| 测试覆盖 | **通过** | 本轮**新增 1 条机器断言**（覆盖 R0 P2-1 的空白面），且其判别力有两条独立论证：① `Object.keys` 逐键比对在任何一侧漏改时红；② 块缺失/键改名走 `null` 分支红（fail-closed，我已复现该分支）；P2-2 的扩包使版本告警覆盖面与 S3 红点同源；**残留**：P2-3 的文档数值不受任何断言看护（文档项，见 §6） |

**AI 代码专项 5 项（返工面）**

| # | 项 | 结论 | 依据 |
|---|----|------|------|
| 1 | mock 残留 | ✅ 无 | 守卫读**真实**文件（`readTest('host-version-snapshot.mjs')`）；无 mock/桩新增 |
| 2 | 硬编码返回值 | ✅ 无（**无硬编码键表**，与声称一致） | 键集 = `Object.keys(HOST_VERSION_BASELINE)`（`host-contract.mjs:387`）；比对另一端来自权威文件**文本提取**而非硬编码；无「恒真返回」；空提取走**红**而非绿 |
| 3 | 幻觉 API | ✅ 零幻觉 | `blockOf`/`stripComments`/`readTest`（`:96-119`/`:94` 既有）、`Object.keys`、`Array.prototype.filter/map`、`RegExp.prototype.exec`、`?.[1]`、`??` 均为真实 API；`readTest` 的路径拼接（`join(ROOT_DIR,'tests',name)`）与 `:94` 定义一致 |
| 4 | 未实现 TODO | ✅ 无 | 4 个改动文件全文 `\b(TODO\|FIXME\|XXX\|HACK)\b` **0 命中**（全仓 3 处命中均在未改动的 `tests/host-abi-health.mjs:18/182/643` 说明文字） |
| 5 | 过度实现 | ✅ 无越界 | 返工严格对应 R0 P2×3：P2-1→`host-contract.mjs:377-392` + `host-version-snapshot.mjs:26-32`；P2-2→`:157-164` + `README.md:241`；P2-3→`ci.yml:32-37` + `README.md:248`。锁定文件集 4 ⊆ 8 锁 ✓；未夹带其它语义改动（`hostTarget` 判定、S1-S7 断言、run-all/smoke/镜像面零改动）✓ |

**设计一致性**：BR-03 保持（新断言为纯静态、不依赖宿主，CI 无宿主时照跑）；P4（看护不得静默降级）方向正确（新守卫 fail-closed）；P5（单点化）**R0 的基线副本缺口已由机器断言闭合**，副本的「存在理由」在同文件注释中显式声明（独立入口不可 import）；P8 不变；P3-6 的裁决语义（告警 + note）维持未回退。

## 4. 返工声称核验（逐条）

| # | 声称 | 核验 | 证据 |
|---|------|------|------|
| 1 | P2-1「基线副本」断言（`blockOf(stripComments(readTest(...)))` 提取 + `Object.keys` 逐键求值，无硬编码键表，fail-closed） | **成立** | §2 P2-1 ①-⑤；断言行 `host-contract.mjs:388-390`（提取 `:382-385`、比较 `:386-387`） |
| 2 | P2-1 双向 RED 演示：① 本副本改 `rc.9` → `FAIL :: ["dshPackages: host-contract=0.1.5-rc.9 vs host-version-snapshot=0.1.5-rc.2"]`；② 权威侧改 `rc.9` → 同断言红而版本一致性判据仍绿 | **① 文案逐字可推导（成立）；② 逻辑成立（含 1 处叙述限定，见备注）；执行侧未复跑** | ① 报文 = `baselineDiffs` 数组 → `check` 的 `JSON.stringify(detail)`（`host-contract.mjs:86`）⇒ `["dshPackages: host-contract=0.1.5-rc.9 vs host-version-snapshot=0.1.5-rc.2"]` **逐字同形** ✓；② 版本判据比较的是「靶子实读 vs **本副本**」（`:357-364`），权威侧常量被改不影响该比较 ⇒ 仍绿 ✓，而新断言读权威文本 ⇒ 红 ✓。**备注**：若「权威侧只改常量」而不按四处程序同步 `package.json`/README，则 `host-version-snapshot.mjs` 自身断言也会红——故「唯一拦截」严格成立于**真实漂移场景**（权威四处刷新完成、副本漏改，或该机无宿主 checkout 时）；此为叙述精度而非判据缺陷 |
| 3 | P2-1 host-version-snapshot 头注「三处」→「四处」+ 双向互指；host-contract 82 断言（+1） | **成立** | `host-version-snapshot.mjs:29-32`（四处 + 点名 host-contract 副本 + 「机器锁定，漏改即红」）；`host-contract.mjs:150-152`；`check(` 站点数 **57→58 = +1**（唯一非调用点为 `:78` 注释）⇒ 82 = 81 + 1（基数来自 FIX-036/EVO-024 普查，a9e06da 未改断言面）✓ |
| 4 | P2-2 `HOST_KEY_PACKAGES` = 7 项（dsh + S7 四包 + S3 两包）；本机 7/7 同版零假红；README:241 口径更新 | **成立** | `host-contract.mjs:164` 逐项计数 = 7 ✓；**独立实读**两候选 7/7 === 基线 ✓（§5.2）；`README.md:241` 新口径逐字核验 ✓；代码注释 `:157-163` 同步 ✓ |
| 5 | P2-3 ci.yml/README 双向预期化（ubuntu 固定 1 条 `(powershell)` 臂 skip、断言由 pwsh 臂完整执行；Windows 固定 1 条 POSIX 臂 skip；「断言数下降或 `#SKIP ≥2` 才需研判」） | **部分成立**：预期化文本已落地且 smoke 部分事实精确；**但汇总行数值/阈值与 CI 语境不符** | 见 §6 P2-1（`#SKIP 1 (smoke.mjs×1)` 为 Windows 本地签名；CI 实为 `#SKIP 3`） |
| 6 | 全量网 `ALL 20 SUITES + 4 RUNNER MODULES PASSED (29.0s) #SKIP 1` exit 0 | **未执行（工具边界）**；`#SKIP 1` 与本机环境推演吻合（R0 已独立论证：双 PS 宿主在位 + `sh` 缺失 + 宿主两候选均基线） | 本轮返工未改变 skip 发射点/计数逻辑（run-all/smoke 零改动）⇒ 该推演结论继承有效 ✓ |
| 7 | 范围：4 文件；其余 4 文件本轮无改动（已在 a9e06da） | **成立** | `git show --name-only df96ddf` = 4 文件；`git diff --stat a9e06da df96ddf -- <其余 4 文件>` = **空** ✓ |

## 5. 独立复算（本轮新增，可复查）

### 5.1 基线副本守卫文本重放
同法实现（块注释 `/\*[\s\S]*?\*/` → 行注释 `(^|[^:])//[^\n]*`，同长空白替换、换行保留）+ 花括号配平块提取（marker = `const HOST_BASELINE = Object.freeze(`）：
- 提取结果 = 243 字符块，含 `dsh / dshPackages / cordis / schemastery` 四键；
- `dsh` → 副本 `0.1.5-rc.1` vs 权威 `0.1.5-rc.1` = **MATCH**；`dshPackages` → `0.1.5-rc.2` vs `0.1.5-rc.2` = **MATCH** ⇒ 断言在 df96ddf 上**绿**；
- fail-closed 探针：marker 改为 `…freezeX(` → 块长 0 → 取值 `null` ⇒ `null !== '0.1.5-rc.1'` ⇒ **RED(fail-closed)** ✓。

### 5.2 7 包版本实读（`%LOCALAPPDATA%\npm-cache\_npx\*`）
| 候选 | dsh | api-remotes | api-session-controller | client-ui-model-selection | llm | client-ui-settings | client-locale | 判定 |
|---|---|---|---|---|---|---|---|---|
| `1e7f6d9597241db0`（靶子） | rc.1 | rc.2 | rc.2 | rc.2 | rc.2 | rc.2 | rc.2 | **7/7 === 基线** |
| `1da1392061ab1944`（未选） | rc.1 | rc.2 | rc.2 | rc.2 | rc.2 | rc.2 | rc.2 | **7/7 === 基线** |

⇒ 扩包后**零假红**（R0 已确认两包本身在位，本轮补全版本级实读）。

### 5.3 反向守卫重放（回归面，因 host-contract.mjs 被改动而必须重跑）
按 `run-all.mjs:68-70` 同法对 20 个未排除套件重放 `process\.exit(?:Code)?|invokedDirectly` ⇒ **20/20 命中、miss = 0**（含被本轮改动 30 行的 `host-contract.mjs`，其退出闸现位于 `:719`）⇒ R0 §4.2 结论在 df96ddf 下继续成立。

### 5.4 返工对 CI 断言/skip 数值的影响（算术复算）
- **断言数**：新增断言位于 `hostTarget` 条件块**之外**（`:377` 起，`if (hostTarget.root)` 块终于 `:375`）⇒ 无条件执行。CI（无宿主 checkout）侧由 `70 → 71`；宿主可达侧 `81 → 82`（与 `check(` 站点 +1 吻合）。
- **CI `#SKIP` 总数**：host-contract 不可达 → `note()` ×2（`:534` S3 / `:658` S7）；smoke `powershell` 探针 ENOENT → ×1（`:88`）；install-entry（ubuntu 上 `sh`+`curl` 与 `pwsh` 均可用）→ 0；其余 18 套件 → 0（R0 §4.5 已穷举发射点）⇒ **合计 3**，汇总行为 `#SKIP 3 (host-contract.mjs×2, smoke.mjs×1)`，host-contract 自身汇总为 `(71 assertions, 2 skipped)`。
- **Windows 本地**（本轮门控环境）：host 可达且版本一致 → 0；smoke 双宿主在位 → 0；install-entry POSIX 臂（`sh` 不存在）→ 1 ⇒ `#SKIP 1 (smoke.mjs×1)` —— **与 Developer 声称的输出一致**，亦印证文档所引汇总行取自本地运行。

## 6. 本轮发现

### P2-1（P2-3 残余，文档级、非阻塞）预期内 skip 的**汇总行数值与研判阈值**与 ubuntu CI 语境不符——首跑即触发「需研判」
- **位置**: `.github/workflows/ci.yml:32-37`（`#      **预期内的 skip（非缺陷，FIX-037 R0 P2-3）**：… 首跑日志**固定出现 1 条** … 与 \`#SKIP 1 (smoke.mjs×1)\` … 出现「断言数下降」或 \`#SKIP ≥2\` 才需研判；`）与 `README.md:248`（同义，附于「在 ubuntu-latest 上会 skip 的断言」条目内）
- **依据（可复查事实）**: ① `#SKIP 1 (smoke.mjs×1)` 是 `run-all.mjs:188/190` 的**全量汇总行**，其值 = 所有通过套件 skip 行之和；② ubuntu CI 上 `host-contract.mjs` 必然无宿主靶子（`ci.yml` 未设 `DSH_HOST_SOURCE`/`DSH_HOST_PACKAGES`，Linux 无 `LOCALAPPDATA`）⇒ 必然执行 `host-contract.mjs:534` 与 `:658` 两条 `note()` ⇒ **+2**；③ `smoke.mjs:88` 的 `powershell` 探针 ENOENT ⇒ +1；④ install-entry 在 ubuntu 两臂皆可用 ⇒ +0 ⇒ **CI 汇总 = `#SKIP 3 (host-contract.mjs×2, smoke.mjs×1)`**（§5.4 算术）；⑤ 因此文档自设阈值「`#SKIP ≥2` 才需研判」会在**首跑的正常态**即命中 ⇒ 与本段「防首跑读者误判」的写作目的相悖（该段的 smoke 单条行描述与「≠ 断言被跳过」的定性**均正确**，问题仅在汇总行数值与阈值未按环境区分）
- **影响**: 无假绿、无假红、不影响门控退出码；仅影响 RISK-001 主轨道的**CI 首跑判读步骤**——读者被文档告知「出现 `#SKIP ≥2` 需研判」，而首跑预期态即为 3
- **建议（1 句，二选一）**: (a) 把该句改为按环境分列：`ubuntu 首跑：host-contract.mjs 2 条（S3/S7 宿主不可达——预期）+ smoke.mjs 1 条（powershell 臂——预期）⇒ 汇总 #SKIP 3 (host-contract.mjs×2, smoke.mjs×1)；Windows 本地：1 条（install-entry POSIX 臂）⇒ #SKIP 1 (smoke.mjs×1)；出现「断言数下降」或 #SKIP 超过上述对应值才需研判`；(b) 或去掉绝对值，仅保留「`(powershell)`/`POSIX online checks` 两条为预期内；**新增**的 skip 行或断言数下降才需研判」的判据
- **标注**: **静态判定**（发射点穷举 + 正则/汇总格式三元确定 + 环境变量事实）；CI 实跑未执行

### P3-1（本轮**新引入**）「其余 70 条静态断言照跑」计数陈旧——新增 1 条无条件断言后应为 71
- **位置**: `.github/workflows/ci.yml:25`（`#      其余 70 条静态断言照跑（宿主面基线为静态常量，不依赖宿主——BR-03）；`）与 `README.md:248`（同句）
- **依据（可复查事实）**: 本轮在 `host-contract.mjs:389` 新增 **1 条无条件断言**（在 `if (hostTarget.root)` 条件块之外 ⇒ CI 无宿主时照跑），`check(` 站点数 57→58 = **+1**（§2 P2-1 ⑥）⇒ CI 侧断言数由 70 变 **71**（宿主可达侧 81→82）；两处文档未同步
- **影响**: 文档数字与实际输出（CI 首跑日志中 `host-contract.mjs` 汇总行将打印 `(71 assertions, 2 skipped)`）相差 1；与 P2-1 同属「声明 ↔ 实测数值」精度问题，不阻塞
- **建议**: 两处「70 条」→「71 条」，或改为不写死数字（如「其余静态断言照跑（数量以套件汇总行为准）」）
- **标注**: 静态判定（断言增量与位置已复算）；CI 实跑未执行

## 7. 遗留项与关闭期限建议

| ID | 内容 | 建议期限 | 备注 |
|----|------|---------|------|
| L-1（R0 P2-1） | 基线副本机器锁定 + 刷新程序四处 | **已关闭** ✅ | `host-contract.mjs:377-392` / `host-version-snapshot.mjs:26-32` |
| L-2（R0 P2-2） | 版本判据包集补 S3 两包 + 口径修正 | **已关闭** ✅ | 7 项包集，两候选 7/7 基线 |
| L-3（R0 P2-3 → 本轮 P2-1） | 预期内 skip 的**汇总行数值/阈值按环境分列**（1 句文档） | **CI 首跑前**（与 P3-1 同一 commit 可闭合，共 2 处 ×2 文件 ≤6 行文档） | 直接关系首跑判读；不阻塞本轮 |
| L-4（R0 P3-1/P3-2） | 反向守卫判据语义注释 + `readFileSync` try/catch | 可台账化 | 文件本轮零改动，保持 open |
| L-5（R0 P3-3/P3-5） | 失败批次 skip 统计、独立运行计数口径 | 可台账化 | 保持 open |
| L-6（R0 P3-4） | `oauth-credentials.mjs:126` 恒真断言改 skip 语义 | 下次触碰该文件 | 非 8 项锁集内文件 |
| L-7（R0 P3-6） | ③ 失配语义裁决 + 残余入台账 | 随本轮审查机录 | 代码面未回退（`host-contract.mjs:369` 仍为告警 + note） |
| L-8（本轮 P3-1） | 「70 条」→「71 条」（或去硬编码数字） | 随 L-3 一并处理 | 2 处，1 行/处 |

## 8. 未验证 / 待验证（事实依据红线）

| 项 | 状态 |
|----|------|
| 全量门控实跑 `ALL 20 SUITES + 4 RUNNER MODULES PASSED (29.0s) #SKIP 1` exit 0 | **未执行**（Reviewer 不执行测试）；机制面：本轮零改动 run-all/smoke/计数路径，R0 的环境推演（双 PS 宿主 + `sh` 缺失 + 宿主版本一致 ⇒ 恰 1 条 skip）继承有效；断言面 +1 已静态复算 |
| 双向 RED 演示（改副本/改权威 → 红）与「82 断言」实跑 | **未执行**；① 的失败文案 `["dshPackages: host-contract=0.1.5-rc.9 vs host-version-snapshot=0.1.5-rc.2"]` 由代码路径**逐字可推导**（比较 + `JSON.stringify`）；② 的方向性成立（版本判据读本副本、新断言读权威文本）；fail-closed 分支我已按同法复现 |
| CI 首跑实况（ubuntu 是否自带 pwsh、`#SKIP` 实际条数、registry 可解析性） | **未验证**；本报告对 CI 的判定为**静态推理**（`powershell` 5.1 仅 Windows、CI 未设宿主环境变量、Linux 无 `LOCALAPPDATA`）；这正是 §6 P2-1 的对象 |
| `hostTarget` 是否指向「运行宿主」 | **未验证**（同 R0）；版本判据已把该不确定性转为可见告警 |
| `host-version-snapshot.mjs` 头注变更对其自身断言的影响 | **静态确认无影响**（本轮回工对该文件仅 4 行注释增 / 2 行注释改，无 `check`/常量变更：`git show df96ddf -- tests/host-version-snapshot.mjs` 逐行核对） |

## 9. 证据索引（可复查事实）

- **提交对象**: `git show --name-only df96ddf`（4 文件）；`git show --numstat --format="" df96ddf`（7/1、2/2、30/6、4/2）；`git log --oneline -3`（`df96ddf` ← `a9e06da` ← `3dc2fa1`）；`git diff --stat a9e06da df96ddf -- tests/run-all.mjs tests/smoke.mjs lib/client.js tests/served-client.js`（空）；`git status --porcelain`（仅治理记录）；`git ls-files --eol` 四文件 `i/lf w/crlf`
- **锁/范围**: `.governance/agent-locks.json:7-28`（8 项 target）、`:74-79`（host-version-snapshot 授权锁扩展）
- **新断言面**: `tests/host-contract.mjs:148-164`（注释 + 双常量）、`:377-392`（守卫块）、`:389`（`check`）、`:534`/`:658`（S3/S7 note）、`:717-719`（汇总与退出）；辅助 `:94`（`readTest`）、`:86`（detail JSON 打印）、`:96-119`（`stripComments`/`blockOf`）
- **刷新程序面**: `tests/host-version-snapshot.mjs:26-32`（「同步更新四处」+ 第四处点名）
- **文档面**: `.github/workflows/ci.yml:24-26`（「70 条」）、`:32-37`（预期内 skip）；`README.md:241`（③ 口径 + 四处刷新）、`:248`（CI skip 条目 + 预期内 skip）
- **独立复算命令面**: 同法文本重放（块注释 → 行注释 → 花括号配平提取 → `\bkey:\s*'([^']+)'`）得 `dsh`/`dshPackages` 双 `MATCH`、marker 缺失时 `RED(fail-closed)`；`git show a9e06da:tests/host-contract.mjs` vs 工作树 `check(` 计数 57→58；`Get-ChildItem $env:LOCALAPPDATA\npm-cache\_npx\*\node_modules\@deepseek-ai` 对 7 包逐一读 `package.json.version`（两候选 7/7）；20 套件反向守卫重放（20/20，miss 0）
- **前轮**: `.governance/review-FIX-037-R0-input.md`（P2-1 :73-86、P2-2 :88-96、P2-3 :90-98、P3-1…P3-7 :102-110、L-1…L-7 :114-122、§7 未验证 :124-133）

---

**结论（四选一）**: `APPROVED_WITH_NOTES` · `unresolved_blockers=0` · P0=0 / P1=0 / P2=1（P2-3 残余）/ P3=1（本轮新引入；前轮 P3×7 保持 open）
**备注**: R1 逐条比对结果——**P2-1 已修复**（新断言经独立文本重放：两键 MATCH、块缺失 fail-closed 红；刷新程序四处一致、无旧值残留；断言 +1 与站点计数 57→58 吻合）、**P2-2 已修复**（7 项包集 + 两候选实测 7/7 基线、零假红；代码注释与 README 口径已按 S7 四包 + S3 两包如实区分）、**P2-3 部分修复**（预期化文本已落地且 smoke 部分事实精确；汇总行 `#SKIP 1 (smoke.mjs×1)` 与阈值 `#SKIP ≥2` 为 Windows 本地签名，ubuntu CI 实为 `#SKIP 3 (host-contract.mjs×2, smoke.mjs×1)` ⇒ 文档级残余，1 句可闭合）；另发现返工自身引入的 1 项 P3（「70 条」计数陈旧，实为 71）。两处均为文档数值精度项，无 P0/P1、无假绿、硬门槛全通过。
