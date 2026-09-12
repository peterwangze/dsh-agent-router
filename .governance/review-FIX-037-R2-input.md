# REVIEW-FIX-037-R2（Code Review 输入报告，**终验**）

- **Round**: **R2**（本链最后一次复审；round 2）；**前轮引用** = `.governance/review-FIX-037-R1-input.md`（REVIEW-FIX-037-R1，`APPROVED_WITH_NOTES` / `unresolved_blockers=0` / P0=0·P1=0·P2=1·P3=1）与 `.governance/review-FIX-037-R0-input.md`（R0，P0=0·P1=0·P2=3·P3=7）；机器记录 `.governance/review-FIX-037-R0.md` / `.governance/review-FIX-037-R1.md`
- **Task**: FIX-037-R2（P1）— ARCH-004 终批收账微返工终验
- **审查对象**: 微返工 commit **`c99b4cf`**（父 `df96ddf`；`HEAD == c99b4cf`）；`git show --name-only c99b4cf` = **2 文件**：`.github/workflows/ci.yml`、`README.md`（**零代码/测试语义改动**）
- **对象完整性核验**: `git show --numstat --format="" c99b4cf` = `ci.yml 10/8`、`README.md 1/1`（合计 **+11/−9**，与下发一致）；`git diff --stat df96ddf c99b4cf -- tests lib` = **空**（除两文档外无任何文件变化）⇒ R0/R1 对代码面的全部核验结论（基线副本守卫、7 包版本实读、反向守卫 20/20、镜像 hash）**按构造继续有效**；`git status --porcelain` = 仅治理记录（`M evidence-log.md` + 四个 `review-FIX-037-*.md`，非代码面）；`git ls-files --eol` 两文件 `i/lf w/crlf attr/(空)`（无行尾噪声）；`git diff --name-only a9e06da c99b4cf` = 4 文件（= df96ddf 的 4 文件，本轮未新增文件集）
- **锁/范围**: `.governance/agent-locks.json`（8 项）⊇ 本轮 2 文件 ✓；无锁外改动
- **审查工具边界**: 只读——`read/grep/glob` + 只读 git（`show/log/status/name-only/numstat/diff/ls-files`）+ 只读文件系统探查（`Get-Content`/正则**文本计数**）；**未执行任何测试、未写代码/治理状态**（唯一写入 = 本报告）
- **方法论声明（工具边界诚实项）**: 目录级 `grep` 检索不覆盖隐藏目录（`.github/`），故本报告对 `.github/workflows/ci.yml` 的全部字符串结论均以**显式读文件 + 整文件正则计数**取得（不依赖目录级 grep）

## 1. 审查结论

**APPROVED_WITH_NOTES**（`unresolved_blockers=0`）

- P0 = **0** / P1 = **0** / P2 = **0**（R1 残余全部关闭）/ P3 = **0**（本轮新引入 = 无）；前轮 **R0 P3×7 保持 open**（台账项、非本轮范围、不构成本批阻塞）
- 硬门槛（终验重裁）：P0=0 ✅ / 5 维 100% ✅ / 每条发现带级别 ✅（本轮无新发现）/ 设计一致性完成 ✅ / AI 专项 5 项完成 ✅
- **一句话理由**：R1 的两项残留**逐条闭合且经独立静态复算**——P2-3 残余已改为**环境化口径**（ubuntu 首跑正常态 `#SKIP 3 (host-contract.mjs×2, smoke.mjs×1)`、Windows 本地正常态 `#SKIP 1 (smoke.mjs×1)`，并列出全部构成来源）且判据改为**相对基线增量**（「新增 skip 来源或断言数下降才需研判」，显式声明绝对值不作告警依据）⇒ R1 指出的「首跑正常态触发自设阈值」已消除；P3-1 的「70 条」→「**71 条**（宿主不可达侧；宿主可达侧 **82 条**）」在两文件同步且与 R1 §5.4 的算术（70+1 / 81+1）一致；陈旧字符串（`70 条`/`首跑固定出现`/`SKIP ≥`/旧标签 `FIX-037 R0 P2-3`）在两文件**整文件零命中**，全仓唯一 `FIX-037 R0 P2-3` 命中为 `tests/smoke.mjs:34` 的**历史出处引用**（非过期主张）；聚合串的**顺序与计数**经独立推演逐字吻合（套件按名排序 ⇒ `host-contract.mjs` 先于 `smoke.mjs`）。

## 2. 前轮 findings 逐条比对（R2 强制项）

| 前轮 ID | R1 判定 | R2 标注 | 核验依据（可复查事实） |
|---|---|---|---|
| **R1 P2-1**（= R0 P2-3 残余）预期内 skip 汇总行数值/阈值与 CI 语境不符 | 部分修复 → 文档级残余，1 句可闭合 | **已修复** ✅ | ① `ci.yml:33-39` / `README.md:248`（同上口径）改为「**按环境分列**」：`ubuntu 首跑正常态 = #SKIP 3 (host-contract.mjs×2, smoke.mjs×1)` + 构成（host-contract 在 CI 必然无宿主 ⇒ S3 半边 + S7 组 2 条；smoke 的 `(powershell)` 臂 1 条，5.1 仅 Windows、同一断言由 pwsh 臂完整执行）与 `Windows 本地正常态 = #SKIP 1 (smoke.mjs×1)（install-entry 的 POSIX 臂）`；② 判据改为**相对基线增量**：「新增 skip 来源或断言数下降才需研判（绝对值随平台组合变化，不作告警依据）」⇒ R1 指出的「`#SKIP ≥2` 在首跑正常态即触发」**已消除**（该字符串全仓零命中，见 §5.2）；③ 独立推演复核：ubuntu 侧 = `:534`(S3) + `:658`(S7) 两条 `note()` + smoke 探针失败 1 条（`:88`）+ install-entry 0 条（ubuntu `sh`/`curl`/`pwsh` 皆可用）= **3** ✓；Windows 侧 = 宿主可达且版本一致 0 + smoke 双宿主 0 + install-entry POSIX 臂 1 = **1** ✓；④ **汇总串逐字符可推导**：`run-all.mjs:188` 格式 `#SKIP n (套件×条数)`，`skippedSuites.push(\`${suite}×${k}\`)` 按**排序后套件顺序**累加，`host-contract.mjs` < `smoke.mjs`（字符串序）⇒ `(host-contract.mjs×2, smoke.mjs×1)` **顺序与计数均吻合** ✓ |
| **R1 P3-1**（R1 新引入）「其余 70 条静态断言照跑」陈旧 | 建议 1 行修复 | **已修复** ✅ | `ci.yml:25` = 「其余 **71 条**静态断言照跑（宿主不可达侧；宿主可达侧 **82 条**——FIX-037 R1；宿主面基线为静态常量，不依赖宿主——BR-03）」；`README.md:248` = 「其余 **71 条**…（宿主不可达侧；宿主可达侧 **82 条**——FIX-037 R1 计数更新）」⇒ 与 R1 §5.4 复算（新增 1 条**无条件**断言 `host-contract.mjs:389`，CI 侧 70→71、宿主可达侧 81→82）一致 ✓；两文件整文件 `71 条 = 1 次`、`82 条 = 1 次`、`70 条 = 0 次` ✓ |
| R0 P3-1 / P3-2 / P3-3（`run-all.mjs`：判据语义、`readFileSync` try/catch、失败批次 skip 统计） | 保持 open（非本轮范围） | **未修复（保持 open）** | `git diff df96ddf c99b4cf -- tests` = 空；`tests/run-all.mjs` 自 `a9e06da` 起零改动（`git diff --name-only a9e06da c99b4cf` 不含该文件）✓ |
| R0 P3-4（`oauth-credentials.mjs:126` 恒真断言） | 保持 open（非 8 项锁集内） | **未修复（保持 open）** | 本轮 name-only 不含该文件 ✓ |
| R0 P3-5（smoke 独立运行计数口径） | 保持 open | **未修复（保持 open）** | `tests/smoke.mjs` 自 `a9e06da` 起零改动 ✓ |
| R0 P3-6（③ 失配语义裁决 + 残余） | 裁决项（台账留痕） | **代码面未回退**；台账留痕由 Coordinator 执行 | `host-contract.mjs:369` 仍为「告警 + note」（`git diff df96ddf c99b4cf -- tests` 为空 ⇒ 未改） |
| R0 P3-7（`stripComments` 三副本） | 注释互指（可接受） | **未修复（保持 open）**；未恶化 | 三副本位置不变（`run-all.mjs:68-70` / `host-contract.mjs:97-99` / `host-abi-health.mjs:337`），本轮无新增副本 ✓ |
| R0 L-1 / L-2（基线副本机器锁定 / 包集补 S3 两包） | R1 已关闭 | **保持关闭** ✅ | 本轮零改动，R1 复算结论继承 |
| R0 L-7 / R1 L-3 / R1 L-8 | 待收口 | **全部关闭** ✅ | L-7 = 裁决项（见上）；L-3 = R1 P2-1（本轮闭合）；L-8 = R1 P3-1（本轮闭合） |

**本轮「新引入」项**: **无**（对 `df96ddf → c99b4cf` 的 19 行变更逐行审读，未发现新的不实陈述、未发现数值与实现失配、未发现与 `run-all.mjs`/`smoke.mjs` 实际输出格式的偏差）。

## 3. 硬门槛裁决（5 维 + AI 专项 + 设计一致性，按 c99b4cf 现状）

| 维度 | 结论 | 判定依据（可复查事实） |
|------|------|------------------------|
| 正确性 | **通过** | 文档所陈述的全部数值/字符串均可由既有实现推导：`#SKIP 3 (host-contract.mjs×2, smoke.mjs×1)`（`run-all.mjs:171-174/188` + `host-contract.mjs:534/658` + `smoke.mjs:85-88`）、`#SKIP 1 (smoke.mjs×1)`（`install-entry.mjs:298-299` 经 smoke 进程归入 smoke 套件）、`71/82 条`（`host-contract.mjs:389` 无条件断言 + `check(` 站点 57→58，R1 §5.4）；本轮零代码改动 ⇒ 既有代码结论（R1 §5.1-5.3）无扰动 |
| 安全性 | **通过** | 变更面为 2 个文档的注释/说明文本；无凭据、无输入面、无网络、无新命令面 |
| 可维护性 | **通过** | 预期内 skip 的判据由**绝对阈值**改为**相对基线增量**（更可维护：不受平台组合变化影响）；数字标注了量测前提（宿主不可达侧/可达侧）；环境分列使首跑读者可直接比对；两文件措辞一致（同一表述的 ci.yml 多行注释与 README 单行版本） |
| 性能 | **通过** | 文档变更，无运行期影响 |
| 测试覆盖 | **通过** | 本轮为文档面，无新增可测面；R0/R1 的测试面结论不变（新增的「基线副本」断言仍由 `host-contract.mjs:389` 承载，其 fail-closed 与双向判别力已在 R1 §5.1 复现） |

**AI 代码专项 5 项**

| # | 项 | 结论 | 依据 |
|---|----|------|------|
| 1 | mock 残留 | ✅ 无 | 文档变更 |
| 2 | 硬编码返回值 | ✅ 无 | 无代码；文档中的数字均带量测前提且经独立复算 ✓ |
| 3 | 幻觉 API | ✅ 不适用（无代码） | 文档引用的命令/输出来自仓库实有实现（`run-all.mjs`/`smoke.mjs` 行号可查） |
| 4 | 未实现 TODO | ✅ 无 | 两文件**整文件显式扫描** `\b(TODO\|FIXME\|XXX\|HACK)\b` = **0 / 0**（弥补目录级 grep 不覆盖 `.github/` 的方法论缺口） |
| 5 | 过度实现 | ✅ 无越界 | 变更严格对应 R1 两项（P2-3 残余 → `ci.yml:33-39` + `README:248`；P3-1 → `ci.yml:25` + `README:248`），无夹带；8 项锁集内 ✓ |

**设计一致性**：BR-03 未受影响（「宿主不可达侧照跑静态断言」表述保留且数字更新）；P8（降级可观测）语义不变；P4（不得静默降级）方向保持；R0 P3-6 的③裁决（告警 + note）未回退；文档与实现的「声明 ↔ 机制 ↔ 数值」三者本链首次完全一致。

## 4. 返工声称核验（逐条）

| # | 声称 | 核验 | 证据 |
|---|------|------|------|
| 1 | **P2-3 残余**：改为环境化口径（ubuntu 首跑正常态 = `#SKIP 3 (host-contract.mjs×2, smoke.mjs×1)` 并列出构成；Windows 本地 = `#SKIP 1 (smoke.mjs×1)`）；判据改相对基线增量（「新增 skip 来源或断言数下降才需研判」+ 显式声明绝对值不作告警依据） | **成立** | §2 R1 P2-1 ①-④；`ci.yml:33-39`、`README.md:248` 逐句核验；聚合串顺序/计数/格式与 `run-all.mjs:188` 逐字符吻合 |
| 2 | 本机实证该聚合串（host 不可达变体实跑 `#SKIP 3` 逐字一致） | **机制静态成立；执行侧未复跑**（Reviewer 不执行测试） | 构成推演 = 2（host-contract note）+ 1（smoke 臂）+ 0（install-entry）= 3，且 `skippedSuites` 顺序为 `host-contract.mjs` → `smoke.mjs` ⇒ 串逐字一致；该推演不依赖任何未验证前提（三条发射点均在 R0 §4.5 穷举） |
| 3 | **P3-1**：「70 条」→「71 条」+ 标注宿主可达侧 82；残留字符串扫描（`70 条` / `首跑固定出现 1 条` / `#SKIP ≥2`）全仓零命中 | **成立** | 两文件整文件计数：`70 条`=0、`71 条`=1、`82 条`=1、`首跑固定出现`=0、`SKIP ≥`=0、旧标签 `FIX-037 R0 P2-3`=0（§5.2）；全仓 `FIX-037 R0 P2-3` 唯一命中 = `tests/smoke.mjs:34`（**历史出处引用**：该行说明三参 `check` 形态源自 R0 P2-3，非过期主张）✓ |
| 4 | 全量网 `ALL 20 SUITES + 4 RUNNER MODULES PASSED (26.1s) #SKIP 1` exit 0（本地签名不变） | **未执行（工具边界）**；`#SKIP 1`（Windows 本地）与文档给出的 Windows 正常态**完全一致** ⇒ 自洽 | 本轮零代码改动 ⇒ R0/R1 的环境推演（双 PS 宿主 + `sh` 缺失 + 宿主版本一致 ⇒ 恰 1 条）继承有效；文档与声称使用同一签名 ✓ |
| 5 | 范围：仅 `ci.yml` + `README.md`，零代码/测试语义改动 | **成立** | `git show --numstat` = 2 文件；`git diff --stat df96ddf c99b4cf -- tests lib` = 空 ✓ |

## 5. 独立复算（可复查）

### 5.1 聚合串构成与顺序（两环境）
| 环境 | host-contract | smoke | install-entry（in-process） | 其余 18 套件 | 汇总（`run-all.mjs:188` 格式） |
|---|---|---|---|---|---|
| **ubuntu CI** | 2（`:534` S3 + `:658` S7；无宿主环境变量、Linux 无 `LOCALAPPDATA`） | 1（`powershell` 探针 ENOENT，`:88`） | 0（`sh`+`curl`+`pwsh` 齐备） | 0 | **`#SKIP 3 (host-contract.mjs×2, smoke.mjs×1)`** ✓ 与文档逐字一致 |
| **Windows 本地** | 0（宿主可达且 7 包 === 基线） | 0（双 PS 宿主在位） | 1（POSIX 臂：本机无 `sh`，仅 `curl.exe`） | 0 | **`#SKIP 1 (smoke.mjs×1)`** ✓ 与文档及 Developer 声称一致 |

顺序核验：`suites` 由 `readdirSync().sort()` 生成 ⇒ `host-contract.mjs` 先于 `smoke.mjs` ⇒ 元组顺序与文档串一致（非偶然）。

### 5.2 字符串级核验（整文件正则计数，规避目录级 grep 的隐藏目录缺口）
| 字符串 | `.github/workflows/ci.yml` | `README.md` | 判定 |
|---|---|---|---|
| `70 条` | 0 | 0 | 陈旧值清零 ✓ |
| `71 条` | 1 | 1 | 新值就位 ✓ |
| `82 条` | 1 | 1 | 可达侧标注就位 ✓ |
| `首跑固定出现` | 0 | 0 | 旧口径清零 ✓ |
| `SKIP ≥` | 0 | 0 | 旧阈值清零 ✓ |
| `#SKIP 3` / `#SKIP 1` | 1 / 1 | 1 / 1 | 环境化口径就位 ✓ |
| `按环境分列` / `相对基线增量` | 1 / 1 | 1 / 1 | 新判据就位 ✓ |
| `FIX-037 R0 P2-3`（旧标签） | 0 | 0 | 标签已更新为 `FIX-037 P2-3/R1` ✓ |

### 5.3 回归面（按构造继承，已用 diff 复核）
`tests/run-all.mjs` / `tests/smoke.mjs` / `lib/client.js` / `tests/served-client.js`（a9e06da 起）与 `tests/host-contract.mjs` / `tests/host-version-snapshot.mjs`（df96ddf 起）在本轮**零改动** ⇒ R1 的独立复算（基线副本文本重放 `dsh`/`dshPackages` 双 MATCH + marker 缺失 fail-closed 红、7 包磁盘实读两候选 7/7、反向守卫重放 20/20、镜像 SHA256 `B027C5A8…` 全等）在原树状态下仍成立。

## 6. 本轮发现

**无**（P0=0 / P1=0 / P2=0 / P3=0）。R1 的两项残留均已闭合，未引入新问题；前轮 R0 P3×7 与 R0 L-4/L-5/L-6 保持 open 属**台账项**（非本轮范围、非阻塞），已在 §2 逐条标注。

## 7. 全链终态汇总（R0 → R1 → R2）

| 轮次 | 对象 | 结论 | P 计数 | 关键判定 |
|---|---|---|---|---|
| R0 | `a9e06da` | APPROVED_WITH_NOTES（0 blockers） | 0/0/3/7 | 六项收账全部落地并可独立复算；3 项 P2 为判据覆盖/计数口径/文档预期 |
| R1 | `df96ddf` | APPROVED_WITH_NOTES（0 blockers） | 0/0/1/1（新） | P2-1/P2-2 **已修复**（独立复算）；P2-3 **部分修复**（CI 汇总行数值不实）；P3-1 新引入（「70 条」陈旧） |
| R2 | `c99b4cf` | **APPROVED_WITH_NOTES（0 blockers）** | **0/0/0/0** | R1 两项**全部闭合**（环境化口径 + 相对基线判据 + 计数 71/82）；无新引入 |

六项收账的最终状态：① 门控 skip 可观测性（`run-all` 回显 + smoke/`host-contract` 计数 + 逐宿主原因）✅；② 双向守卫（20/20 命中零假红）✅；③ S7 靶子版本一致性判据（7 包 + 告警 + note，裁决认可）✅；④ smoke 三条死守卫修复（真实数据全绿）✅；⑤ 镜像 detail/白名单一致性（SHA256 全等）✅；⑥ 措辞如实化（含本轮数值精度，三处声明面首次完全自洽）✅。

## 8. 未验证 / 待验证（事实依据红线）

| 项 | 状态 |
|----|------|
| 全量门控实跑（`26.1s / ALL 20 SUITES + 4 RUNNER MODULES PASSED / #SKIP 1 / exit 0`） | **未执行**（Reviewer 不执行测试；Coordinator 已复跑裁终）；机制面零改动 ⇒ 环境推演继承有效，且其 `#SKIP 1` 与文档 Windows 正常态一致 |
| Developer 的 host 不可达变体实跑（`#SKIP 3` 逐字一致） | **未执行**；**构成推演独立成立**（2+1+0=3，顺序与格式逐字吻合），属可静态确证项 |
| CI 首跑实况（ubuntu 是否自带 pwsh、实际 `#SKIP` 条数、registry 可解析性） | **未验证**（与前轮一致）；本轮已把「正常态基线」写成可见预期，首跑即可比对；「registry 待首跑确认」措辞保留在案 ✓ |
| `hostTarget` 是否等价「运行宿主」 | **未验证**（同 R0/R1）；版本判据把该不确定性转为可见告警 |
| 5 个「双形态」模块的门控执行细节 | 静态确认（同 R0/R1），未实跑 |

## 9. 证据索引（可复查事实）

- **提交对象**: `git log --oneline -3`（`c99b4cf` ← `df96ddf` ← `a9e06da`）；`git show --numstat --format="" c99b4cf`（10/8、1/1）；`git show --name-only c99b4cf`（2 文件）；`git diff --stat df96ddf c99b4cf -- tests lib`（空）；`git diff --name-only a9e06da c99b4cf`（4 文件）；`git status --porcelain`（仅治理记录）；`git ls-files --eol`（两文件 `i/lf w/crlf`）
- **文档面（终值）**: `.github/workflows/ci.yml:25`（71/82 条）、`:33-39`（环境化 expect + 相对基线判据）；`README.md:248`（同口径单行版）；对照 `README.md:241`（③ 口径 + 四处刷新，df96ddf 落地）
- **实现面（本轮零改动，供串验证）**: `tests/run-all.mjs:171-174`（`PASS … K skip` + `#SKIP \|` 回显）、`:188`（汇总格式）；`tests/host-contract.mjs:534/658`（S3/S7 note）、`:389`（基线副本断言）、`:717-719`（汇总/退出）；`tests/smoke.mjs:85-88`（探针失败 skip）、`:92`（无宿主聚合 skip）、`:3075-3077`（smoke 汇总）；`tests/install-entry.mjs:269/298-299`（PS/POSIX 臂 skip）
- **独立复算**: §5.1 两环境聚合构成表 + 顺序（排序键 `host-contract.mjs` < `smoke.mjs`）；§5.2 整文件正则计数（两文件 × 10 项，含显式规避隐藏目录 grep 缺口）；§5.3 diff 级回归面复核
- **前轮**: `.governance/review-FIX-037-R0-input.md`（P2-1 :73-86、P2-2 :88-96、P2-3 :90-98、P3×7 :102-110、L-1…L-8 :114-122）；`.governance/review-FIX-037-R1-input.md`（P2-1 :88-101、P3-1 :103-108、遗留 :112-121、未验证 :124-131）

---

**结论（四选一）**: `APPROVED_WITH_NOTES` · `unresolved_blockers=0` · **P0=0 / P1=0 / P2=0 / P3=0（本轮无新发现；前轮 R0 P3×7 与 L-4/L-5/L-6 保持 open，属台账项非阻塞）**
**备注**: R2 终验逐条比对——R1 P2-1（= R0 P2-3 残余）**已修复**：`ci.yml:33-39`/`README:248` 改为按环境分列（ubuntu `#SKIP 3 (host-contract.mjs×2, smoke.mjs×1)`、Windows `#SKIP 1 (smoke.mjs×1)`，构成逐条列出），判据改为**相对基线增量**且显式声明绝对值不作告警依据 ⇒ 「首跑正常态触发自设阈值」消除；聚合串的构成（2+1+0）、顺序（排序后 `host-contract.mjs` 先于 `smoke.mjs`）与格式（`run-all.mjs:188`）经独立推演**逐字符吻合**。R1 P3-1 **已修复**：「其余 71 条（宿主不可达侧；宿主可达侧 82 条）」两文件同步，与 R1 §5.4 算术一致；陈旧字符串整文件零命中，全仓唯一 `FIX-037 R0 P2-3` 命中为 `tests/smoke.mjs:34` 的历史出处引用（非过期主张）。本轮零代码/测试改动，R0/R1 的代码面复算结论按构造继承有效。**本链可终态通过（APPROVED_WITH_NOTES / unresolved_blockers=0）**；前轮 P3 台账项建议随后续批次收口，其中「registry 待 CI 首跑确认」仍属首跑后动作。
