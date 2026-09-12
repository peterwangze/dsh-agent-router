# EVO-018-R0 代码审查报告（Round 0）

- **审查对象**: 仓库 `D:/AI/agent/deepseek/plugins/router` commit `3344f0dda6066da72a1977ca9e9fa5b11bad14d2`（3 files，+162/−12：package.json / README.md / tests/host-version-snapshot.mjs 新建 145 行）
- **审查人**: Code Reviewer Agent（只读审查：read/grep/glob + 只读 git；未执行测试、未做任何写操作除本报告）
- **审查轮**: Round 0（首轮，无前轮 findings）
- **设计依据**（实读）: `.governance/arch-004-compatibility-design.md` §10 B0（L383-386）/ §3 D1-5（L125）/ §0.1（L13-29）/ §5.3(c)（L286-291）；事实基线 `.governance/arch-004-dependency-inventory.md`（头部 L5-7、C-8 L220）
- **证据边界声明**: 本报告标「静态核验」的条目均由本审查直接取证（git show diff、三文件现态实读、设计/清单对应节实读、pnpm-lock.yaml + node_modules 实读、grep 残留扫描）；标「Developer 声称」的条目（测试执行结果）按任务边界未复跑，由 Coordinator 独立复跑门控裁终。

---

## 审查结论

**APPROVED_WITH_NOTES**

```
unresolved_blockers=0
```

（独立结构字段：本审查无未解决 BLOCKING finding；上方 P1 为带明确遗留计划的关键建议，非阻塞项，处置路径见 P1-1。）

**分级计数**: P0 = 0 · **P1 = 1** · P2 = 1 · P3 = 3

**一句话理由**: B0 冻结范围三项逐项忠实落实、24 断言对当前工作区静态全过、TDD 判别性静态推演精确吻合、裁量点均在设计自由度内且理由成立；唯一 P1 是 pnpm-lock.yaml 未随声明面同步（dev 图失控重解析 + frozen-lockfile 断点风险），有明确遗留计划，不阻塞本声明面批次。

---

## 发现列表

### P1-1 pnpm-lock.yaml importers 与 package.json 声明面脱同步（本 commit 引入）

- **位置**: `pnpm-lock.yaml:15-46`（importers 段 11 个 dsh 包 specifier 仍为 `^0.1.0-rc.8` / `^0.1.0-rc.6`）vs `package.json:54-67`（已改 `^0.1.5-rc.2`）
- **事实依据（静态核验）**: 实读两侧文件；本仓 dev 图 node_modules 实解析 `dsh-llm`/`dsh-tools` = 0.1.0-rc.8、`dsh-typert-protocol` = 0.1.0-rc.6、`cordis` = 4.0.1、`schemastery` = 3.18.1——与宿主实测基线（0.1.5-rc.2 / 4.0.2 / 3.18.2）为**既存双轨**（非本 commit 引入，dev 图跳变缺口由本 commit 的 specifier 漂移触发）。
- **影响**:
  1. 下次 `pnpm install` 检测 importer specifier 漂移 → 将 11 个 dsh 包重解析至 `^0.1.5-rc.2` 可满足集（≥0.1.5-rc.2，且可能解析到**高于基线**的 0.1.x 新版）并改写锁文件——dev 图自 rc.8 无验证跳变；Developer 的 22/22 证据产自 rc.8 图，新图零验证。这正是 RISK-003/ARCH-004 要治理的「无预警漂移」形态，出现在止损批自身工件侧。
  2. `pnpm install --frozen-lockfile` 将因 lockfile 过期硬失败（当前仓库无 CI——设计 §5.3-4 实证——故暂无自动化断点）。
- **为何非 P0（缓解事实，静态核验）**: package.json `files` 白名单不含 pnpm-lock.yaml → npm 发布面不含锁文件；宿主侧插件安装（`dsh plugin add`，git 依赖按 manifest 装依赖、忽略嵌套锁文件）不受影响。本 commit 未触碰运行时代码，现行测试网不受锁文件状态影响。
- **修复建议**: **不建议**在 B0 内随手刷新锁文件（会当场触发未验证的 dev 图跳变，与「全量网绿」验收冲突）。二选一，由 Coordinator 裁决并记录遗留：
  - (a) 独立小步 commit：`pnpm install` 刷新锁文件 + 全量网复跑 + 记录版本 delta（若网绿）；
  - (b) 记风险/遗留条目，绑定到承接运行时适配的批次（B1/B2）显式处理。
  - 禁止沉默搁置——声明面已守卫而锁文件面无守卫，恰是本批要消灭的漂移类别。

### P2-1 B0 验收第 3 条（宿主实机设置页可打开）无证据

- **位置**: 设计 §10 B0 验收（L385：「宿主实机设置页可打开——症状①的声明面因素排除验证」）vs Developer 声称清单（仅测试网证据）与 commit message（无真机证据）。
- **事实依据**: 按事实纪律标**「未验证」**。背景：依赖清单方法学（L8）注明「真机取证不可行（插件已卸载止损）」——真机验证需先重装插件，延后可能是有意的，但设计验收条目存在即须显式处置（完成或记录延后归属），不得沉默缺失。
- **处置建议**: Coordinator 在验收环节补真机设置页冒烟（重装后），或显式记录延后至重装/适配批次。非代码缺陷，不阻塞合并。

### P3-1 README 断言为子串包含，绑定较弱

- **位置**: `tests/host-version-snapshot.mjs:136-141`——`readme.includes()` 对 `'4.0.2'`/`'3.18.2'` 等短数值串，出现在 README 任意上下文（如未来新增的变更记录行）即通过。
- **评估**: 当前 7 项组合（小节存在性 + 四值 + 记录性语义 + 守卫指针）实践上足以捕获基线漂移；且本审查 grep 证实四个基线串当前仅存在于新小节（L140-141）。建议 B6 静态看护成体系时收紧为对基线行的正则锚定。**可遗留。**

### P3-2 undici `^7.18.0` 不在快照守卫覆盖内

- **事实**: undici 非 `@deepseek-ai` 宿主面包（D1-7 定性为独立候选、非宿主面），B0 范围不含；测试与 README 矩阵均未涉及。如后续愿锁定全声明面可补一项常量断言。**记录性说明，无需动作。**

### P3-3 `caretRangeContains` 的 0.x 分支对当前数据为防御性预留

- **位置**: `tests/host-version-snapshot.mjs:93`——cordis（major 4）/schemastery（major 3）均不走 0.x minor 锁分支；该分支现无数据路径。
- **评估**: 注释（L81-85）已声明函数仅处理 `^M.m.p` 形态且 dsh 范围不走此函数（精确字符串锁定）；0.x 分支与 npm caret 语义一致（^0.1.5 不含 0.2.0），B6 若扩用反而受益。**知识分享级，保留无害。**

---

## 5 维度逐项结论（全覆盖）

| 维度 | 结论 | 要点（静态核验） |
|---|---|---|
| **正确性** | **通过** | diff 三文件逐行核验：死行删除且余 3 项原序不变（ui-settings → locale → api-remotes）；11 项范围改值正确；24 断言逐条走查对当前工作区**静态全过**（inject JSON 精确比对 ✓ / 恰 8 项 peerDeps ✓ / 11 项 `^0.1.5-rc.2` ✓ / `caretRangeContains('^4.0.1','4.0.2')` 与 `('^3.18.1','3.18.2')` 走查为 true ✓ / README 7 串 grep 证实全在 ✓）；`process.exit(failures===0?0:1)` 语义正确。P1-1 属工件同步缺口，非产品逻辑错误。 |
| **安全性** | **通过** | 无敏感信息（无路径泄露/凭据/token）；无注入面——读自有两文件、`Object.freeze` 常量比对、无 eval/动态导入/网络；失败信息仅含包名与期望值。 |
| **可维护性** | **通过** | 与先例 `rpc-shadow-guard.mjs` 同构（check()/passed/failures、分节 console、文件头判别性说明、「独立入口 exit 0/1」尾注）；基线常量单点集中（HOST_BASELINE + 四个名单常量）带事实源注释；三步刷新说明可执行（L26-32：实读 → 三处同步 → 两轮验证）；失败标签含包名与期望值，可诊断。 |
| **性能** | **通过** | 纯静态 2 次文件读 + 24 次常量比对，毫秒级 O(1)；无循环热点、无 IO 放大。 |
| **测试覆盖** | **通过（B0 初版范围内）** | 覆盖设计点逐项：D1-1 死行守卫（精确比对 + 显式负向双保险）、D1-5 记录口径（恰 8 项 + 逐项精确锁定）、deps 3 项锁定、cordis/schemastery 覆盖断言（含「范围改其它形态 → 解析失败 → 红」的形态防漂移）、README 矩阵 7 项、判别性经 Developer 红/绿演示（静态推演吻合，见声称核验表 #5）。**边界（非本批缺口）**：宿主 checkout 实读形态（node_modules 版本比对）按设计属 B6 验收（B0 为「初版（锁基线）」常量形态，文件头 L33 已显式声明不假设 checkout 存在）；锁文件面无守卫（P1-1 关联）。 |

## AI 代码专项 5 项（逐一结论）

| 项 | 结论 | 依据（静态核验） |
|---|---|---|
| mock 残留 | **无** | 零 mock/stub——测试为纯静态读文件与常量比对，不存在伪造宿主面。 |
| 硬编码 | **无（豁免成立）** | HOST_BASELINE/PEER_DEP_NAMES/DSH_RUNTIME_DEPS/INJECT_BASELINE 为快照测试的本质形态（锚定即目的），逐个带事实源注释（inventory §0 / 设计 D1-1/D1-5/W-2）；非魔数坏味道。 |
| 幻觉 API | **无** | 仅使用 `node:fs.readFileSync` / `node:path.join,dirname` / `node:url.fileURLToPath` / `JSON.parse` / `RegExp.exec` / `process.exit`——全部真实标准 API，与先例同构。 |
| 未实现 TODO | **无** | 无 TODO/FIXME/占位实现/空函数。 |
| 过度实现 | **无** | 刻意最小化：未实现完整 semver 解析器（注释声明仅 `^M.m.p` 形态、超范围即红——强制走基线刷新流程）；145 行含 36 行头文档，与守卫职责相称；无投机特性。 |

## 本任务专项（5 审查重点）

1. **设计一致性**：三项逐项对齐 §10 B0 冻结范围（静态核验 diff）——删死行（D1-1，B0 批）✓；peerDeps 8 项 + deps dsh 3 项改实测基线记录（D1-5「B0 批对齐真实测试范围」）✓；README 兼容矩阵同步 ✓；`tests/host-version-snapshot.mjs` 初版 ✓。D1-5「实测基线记录」形态被忠实实现：README 矩阵 + 快照测试为权威防护、peerDeps 降级为记录性声明、禁迷信 semver 防护（ADR-A）全部落实。裁量点核验：① cordis `^4.0.1`/schemastery `^3.18.1` 不动——B0 括号锚定 `0.1.5-rc.2`（dsh 系），两范围真实覆盖基线 4.0.2/3.18.2（静态走查过），无漂移信号，且测试 §4 以覆盖断言兜底并注明理由（L127-128「历史范围未证伪，从简保持」）——**裁量成立**；② undici 不动（D1-7 独立候选）✓；③ `^+基线` 形态——设计未规定具体形态，测试 L51-52 明示「记录性声明口径：^ + 实测基线值」，在自由度内 ✓。
2. **semver 语义正确性**：`^0.1.5-rc.2` 按 npm 语义 = `>=0.1.5-rc.2 <0.2.0-0`——**含** 0.1.5 正式版与 0.1.6+（同 tuple prerelease 0.1.5-rc.N≥rc.2 亦含），**排除** 0.2.0；prerelease tuple 规则下 0.1.6-rc.x 不入范围。该范围在 D1-5 记录性口径下**无防护语义负载**（宿主零 enforcement——§0.1 实证），权威防护为快照测试的精确字符串锁定，语义自洽。`caretRangeContains` 对 `^M.m.p` 数值序实现正确（major 相等 + 0.x minor 锁 + minor/patch ≥ 边界含等号——走查 `^4.0.1∋4.0.2`、`^3.18.1∋3.18.2` 为 true；dsh 范围不经此函数）。死行负向断言**真能防复活**：inject 精确数组比对（任何增删/改序即红）+ 显式 `includes` 负向双保险。
3. **测试桩纪律（P10-④）**：HOST_BASELINE 四值（dsh=0.1.5-rc.1 / dsh-\*=0.1.5-rc.2 / cordis=4.0.2 / schemastery=3.18.2）与设计 §0.1 表 L19 及 inventory 头部 L5 **逐字一致**——dsh 与 dsh-\* 的 rc.1/rc.2 差异如实反映宿主实测（非心智模型抹平）；常量注释锚定事实源（inventory §0 + Coordinator 机核 2026-09-12）。README↔package.json 断言**真实读文件**（`readFileSync` 两文件，L104-105），非复述常量的循环论证。
4. **可维护性**：基线刷新三步说明可执行（实读新 checkout → 三处同步：常量/package.json/README → 单测+全量两轮验证）；断言失败信息含包名与期望值，可诊断。
5. **安全**：无敏感信息；范围值全部来自冻结常量，无注入面。

## Developer 声称核验表（逐条）

| # | 声称 | 核验结果 | 依据 |
|---|---|---|---|
| 1 | 删 inject 死行 `@deepseek-ai/dsh-client-runtime`，剩 3 存续项原序不变 | **核实** | `git show 3344f0d -- package.json`：仅删 L23 一行；余序 ui-settings → locale → api-remotes 不变；grep 全仓：产品/测试/README 零残留（仅历史 docs/CHANGELOG 记录与测试自身注释） |
| 2 | peerDeps 8 项 + dsh deps 3 项 `^0.1.0-rc.8\|rc.6 → ^0.1.5-rc.2`；cordis/schemastery/undici 不动 | **核实** | diff + package.json 现态 L52-67 实读；8 peerDeps 名单与设计 D1-5 W-2 实数逐项一致 |
| 3 | README 新增「### 宿主兼容性（实测基线）」小节（安装章末，+6 行） | **核实** | diff（README +6 行）；现态 L138-142，位于安装章末、「## 使用指南」前 |
| 4 | 独立守卫风格（rpc-shadow-guard.mjs 先例，check()+exit 0/1）；HOST_BASELINE 常量；24 断言；文件头三步说明 | **核实** | 与 rpc-shadow-guard.mjs L28-33/L22 逐要素同构；HOST_BASELINE L44-49 与 §0.1/inventory L5 逐字一致；断言计数 3+（1+8）+3+2+7 = **24**（静态清点）；三步说明 L26-32 |
| 5 | 改前 21/21 → 改后 22/22 零回退；TDD 自然红 20 FAILURE；判别红（9.9.9-FAKE）12 FAILURE → 复原 24/24 | **部分核实（静态推演一致；执行结果未复跑，Coordinator 裁终）** | ① 套件数：glob 实数 tests/ 现有 **22** 个 .mjs（本 commit 唯一新增测试文件）→ 改前 21 ✓；② 新测试 24 断言对当前工作区**静态全过**（逐条走查，见正确性行）；③ **自然红 20 FAILURE = 静态推演精确吻合**：改前面（diff 前态）下 FAIL = inject 精确比对 + 死行负向（2）+ 11 项范围（11）+ README 7 项（7）= **20**，PASS = platform web + 恰 8 项名单 + cordis/schemastery 覆盖 = 4——README 基线串 grep 证实当前仅存在于新小节，故改前面全部缺席成立；④ 判别红 12 = 单常量（dshPackages → 假值）场景算术吻合（11 范围 + 1 README = 12）；⑤ 22/22 与其它 21 套件无冲突（grep 证实无其它套件锁定 peerDeps/范围） |

## 观察项（非本 commit 缺陷，供 Coordinator 文档治理）

1. inventory L366「peerDeps 9 项 + inject 4 项 = 13」为 W-2 修正前遗留口径（该文件 L4 已声明 W-2 修正但结论节未同步）——权威口径 8 项（设计 D1-5 + package.json 实数 + 本批 README「8 项」）。建议勘正，避免后续引用混淆。
2. dev 图（本仓 node_modules：rc.8/rc.6/cordis 4.0.1/schemastery 3.18.1）与宿主基线双轨为既存状态，B 批次运行时适配时收敛——与 P1-1 关联，同批处置可一并考虑。

---

## 结论重申（机器可读）

```
conclusion: APPROVED_WITH_NOTES
unresolved_blockers: 0
P0: 0
P1: 1  （pnpm-lock.yaml 脱同步——遗留计划在案：Coordinator 裁决 (a) 独立刷新 commit+全量网复跑 或 (b) 记风险绑定 B1/B2；禁止沉默搁置）
P2: 1  （B0 验收「宿主实机设置页可打开」无证据——标「未验证」，Coordinator 验收环节补真机冒烟或显式记录延后）
P3: 3  （README 子串断言较弱 / undici 不在守卫内 / caret 0.x 分支预留）
round: 0
```

**建议**: 有条件合并（P0=0 且 P1>0 且遗留计划在案）——Coordinator 记录 P1-1 遗留与 P2-1 验收处置后，本批可通过；回滚路径（revert 单 commit）与设计一致。
