# REL-008 E-4 发布审查报告 — v0.4.2 发布就绪全量状态（执行段 R0）

| 项 | 值 |
| --- | --- |
| Task ID | REL-008（**E-4——发布执行段 Release Reviewer 审查 R0**；审查点 = version-plan-v0.4.2.md §4 E-4 / §5 M-2 执行段门禁） |
| 审查对象 | 发布就绪全量状态（Read 现盘）：`package.json`（0.4.2）/ `CHANGELOG.md`（v0.4.2 节）/ `README.md`（E-1 产物 `2d8b3b1`）+ `.governance/version-plan-v0.4.2.md`（R1 通过版）+ 规划审查链 `.governance/review-report-REL-008-R0.md` / `-R1.md`（双机录在盘） |
| 审查角色 | Release Reviewer（agents/release-reviewer.md + skills/release-review/SKILL.md 绑定，与规划段 R0/R1 同一角色） |
| 审查方式 | 只读（Read/Grep/Glob）——不运行命令、不修改代码、不与用户交互、不创建子 agent；git 事实按任务基准以 Coordinator 门控事实 + version-plan/CHANGELOG 只读实采声明交叉对照，**E-5 前 git 三分账复采为权威**（version-plan 头表同一口径） |
| 审查轮次 | **E-4 R0**（本审查点首轮，无本点前轮；规划段审查链 R0→R1 已闭合：APPROVED_WITH_NOTES/unresolved_blockers=0） |
| 结论 | **NEEDS_CHANGE**（**unresolved_blockers=2**；BLOCKING×2 + SUGGESTION×2） |
| 日期 | 2026-09-04 |

---

## 0. 结论速览

E-1 文档面现盘质量高：三件（package.json / CHANGELOG / README）版本号·徽章·安装命令·披露口径一致；README L101 空白判据注记修正与 DOC-001 P3×2 小修批均已落地；「破坏性变更：无」四证现盘可核部分全部相符（本报告独立复核 schemas.js:301/:306）；v0.4.2 三分账 31 = 产品 16 + 治理 15，逐 SHA 与 version-plan §2.1/§2.2（git 实采、R1 已审）底账完全一致，增量两枚（`4138f53` 规划段终态 / `2d8b3b1` 本 bump）账目自洽（R1 时点 29 → +4138f53 = 30 实采 → +本提交 = 31）；R1 SUGGESTION×2（N-2/N-3）均已落实（§2）。

但存在 **2 项 BLOCKING**，均属发布证据链而非文档质量：

- **F-1**：E-1~E-3 执行段证据**未机写入账**——evidence-log.md 至 ：456 止无 REL-008 执行段任何 EV 行，plan-tracker :64 仍停在「规划段终态——待用户发布授权（M-1）」。§8 #1/#2 以「EV 留痕」为 E-2/E-3 的判定方式；角色红线（release-review SKILL「发布 APPROVED 只能基于可复查事实……风险/证据记录」「不得以叙述替代发布事实」）禁止本席仅凭任务简报叙述对 E-2/E-3 出 PASS。对照先例 EV-119（REL-007）：E-1~E-3 行在 E-4/E-5 续行前已机写——本 rhythm 未被遵循。
- **F-2**：CHANGELOG v0.4.2 已发布口径「**十九面清单全绿复跑**」（已知问题① :34 + 版本说明内部注解 :43 两处）与 E-2 门控事实「**18/18 套件全绿**」存在一套件口径差；tests/ 实采 19 个 .mjs（含 install-entry.mjs），实跑面数 18，差额套件（按命名枚举推定 = install-entry）的 canonical 排除理由/覆盖替代路径**无任何在案记录**可调停。在 EV 行落账前，该发布声明无法对账；若 canonical=18 属实，措辞须在 tag 前一次小修 commit 对齐（先例：`5ca8b87` v0.3.1 / `e818183` v0.3.3——tag 前 CHANGELOG 定稿）。

按 T1（round<3）：Coordinator 返工（纯治理记录动作 + 视核实结果一处措辞小修）→ **重 spawn 同一 Release Reviewer 复审（E-4 R1，round 2）**，复审 MUST 逐条比对 F-1/F-2 修复状态。E-5（tag/push/Release）在本审查点通过终态前**不放行**。

---

## 1. 审查要点逐项结论（对照任务书五要点）

### 要点 1：no-overclaim——**FAIL（F-2 一处；其余 PASS）**

no-overclaim 六锚点（version-plan §4 E-4）逐条裁定：

| # | 锚点 | 裁定 | 证据 |
| --- | --- | --- | --- |
| ① | 打开即显示/切换跟随仅限复验在案场景 | ✅ PASS | CHANGELOG 新增 bullet 限定「新会话/空白会话切换预设」「空白判据与宿主同构——未开启过对话轮即可切」，与 EV-136/137 复验场景（新会话六连切 + 两老会话直切）同域；例外形态由已知问题 #2/#3 如实披露 |
| ② | DEFERRED-001 责任域清晰 | ✅ PASS | 已知问题 #2：「DSH 宿主层问题，插件链路已验证无责（同会话直发 RPC 正常）」+ 规避路径两条，与 EV-138 三方探针证据链一致 |
| ③ | 隔离验证措辞纪律 | ✅ PASS | :43 内部注解用「tarball 隔离环境安装冒烟（环境变量重定向至临时目录）」且为前瞻表述（「随发布链执行，最终以复跑实测值为准」），无无限定语「真实安装」措辞 |
| ④ | 不声明生产就绪 | ✅ PASS | 全节无生产就绪/SLA 类声明 |
| ⑤ | 实测数字以 E-2 复跑值为权威 | ⚠️ **F-2** | 「十九面清单全绿复跑」（:34/:43）vs E-2 门控事实 18/18——复跑面数口径与权威记录脱钩，见 F-2 |
| ⑥ | 规划 ≠ 决策 | ✅ PASS | E-5/M-1 全部标注用户授权（DEC-143）；CHANGELOG 未代行发布声明 |

其余声称抽验（现盘事实对照）：

- **四证无 breaking**：①配置面——`lib/schemas.js:301` = `presets: z.dict(presetDefaultSchema).default({})` **本席独立实读相符**（缺省空字典）；②依赖面——package.json 现盘 deps 6 项 / peerDeps 8×^0.1.0-rc.8 逐项清点与「逐项一致」声称相符，files 列表 lib 段 15 项含 `lib/preset-defaults.js`（只增不减口径相符；与 v0.4.1 的逐项 diff 以 E-1 git 复采为权威）；③数据面——新命名空间不触碰 oauthAccounts(:294)/统计/凭据域（schemas 实读证实）；④行为面——README L100-102 三层主权表述与 CHANGELOG 一致。
- **FIX-024→026 演进表述**：CHANGELOG 修复节「中间态的服务端 emit 路径经真机取证不可达，已删除（多触发来源单路径汇入，旧路径不并存）」——如实（P5 口径），与 version-plan §1.4/§2.1 #10/#12 及 FIX-024「后被取代」终态链一致 ✅。
- **已知问题四条**：CI 延续披露 / DEFERRED-001 / 重启失步缝隙 / P3 台账批（含 v0.4.1 候选批并入）——与 version-plan §2.3 六项对应关系完整（#4 候选批并入 #3 台账批；#6 README 注记滞后属 E-1 修正项非披露项，现盘已修正）✅。
- **README 空白判据注记修正（E-1 前置项 P-2）**：README L101 现文「仅对空白会话生效——未发过消息（未开启过对话轮）」——FIX-025 前口径「（无请求日志）」**已消除** ✅。
- **DOC-001 P3×2 小修批（E-1 前置项）**：简介三大功能枚举自含性（L5/L12）+ 通路切换重选组括注（L147「既有会话切回后需在模型选择器手动重选模型组」）均在盘 ✅。

### 要点 2：范围一致性——**PASS（采信边界内账实自洽）**

- **算术链自洽**：R1 规划时点 29 commits（= 27 ahead + 2 已 push 治理收尾）→ + `4138f53`（REL-008 规划段终态治理 commit）= E-1 实采 30 → + `2d8b3b1`（本 bump commit）= **31**。CHANGELOG 三分账：产品 16（15 底账 + 本提交）+ 治理 15（14 底账 + 4138f53）= 31 = 30 + 本提交 ✅。
- **SHA 底账抽验（全量 30 枚逐字比对）**：产品 15 枚（`2ab27d6`/`97b04ac`/`08e0461`/`75434e7`/`de72e0c`/`fe0a94e`/`4e1d9cc`/`740f95a`/`afa6ddc`/`ba36836`/`a80e935`/`98299e5`/`8c4cfc5`/`6d5e357`/`2e1cdf8`）与 version-plan §2.1 #1-15 **逐字一致**；治理 15 枚（`39506cd`/`de101c0` + 10 枚入仓机录 + `07c8d94`/`6a5f029` + `4138f53`）与 §2.2 #1-14 + 增量**逐字一致** ✅。混合 commit 披露（`afa6ddc` 按 diff 归属产品面）两文档口径一致 ✅。
- **HEAD 状态**：`2d8b3b1`（E-1 产物）为任务简报采信；git 独立复跑不在本角色权限（只读、无命令），以 E-1 实采声明 + CHANGELOG 账目自洽交叉印证，E-5 前复采为权威。
- **结论行核验**：「16 + 15 = 31，与实采一致（30 + 本提交）；产品提交经逐 commit 对照在本节语义全覆盖」——语义覆盖抽验：EVO-013/014 → 新增 bullet；FIX-022/023/024→026/025/027 → 修复四条（FIX-025 空白判据并入新增 bullet「空白判据与宿主同构」）；DOC-001 → 变更·文档；REL-008 → 本提交自指 ✅。

### 要点 3：回滚方案——**PASS**

- version-plan §6.2 三阶段（push 前中止 <5min / push 后 revert 功能 commits + 复跑 + 前滚或整体回退 15-30min / 用户侧 junction checkout v0.4.1 或 tarball 重装）在案，R0（维度三四点逻辑核验）/R1 先后 PASS，本版修订未触 §6.2。
- **现盘一致性复核**：①残留键零消费锚点——`schemas.js:306`「未知字段透传」+ :299-301「未知预设键放行——按配置存在但预设已不存在处理」本席独立实读证实；②revert 顺序约束（FIX-023→027 同文件演进链整组同 revert + EVO-013 机制 commit 含 files 行、revert 后 lib 回落 14 须复跑 E-3 import 断言）与现盘 files 列表相符；③数据面正交（presets 独立命名空间）✅。
- 注：回滚为论证级 + 五轮发布先例级（junction 安装态天然可逆），与本仓先例一致，沿 R0 裁定不构成本轮 finding。

### 要点 4：发布检查清单——**FAIL（F-1/F-2）**

| 门禁 | 现状裁定 |
| --- | --- |
| E-1 bump + CHANGELOG | **产物现盘 PASS**（三件一致性见要点 5；前置项 DOC-001 终态核验 / L101 注记修正 / P3×2 小修批 / 治理记录入账 `4138f53` 均已落地）——但执行段 EV 行未机写（**F-1a**） |
| E-2 全量门控复跑 | 门控事实（18/18 全绿零 FAIL，smoke 1087 ok / preset-defaults / client-render 207 / routing-paths / adapter-parity / oauth 全家 / stats 110 / rpc-shadow 21）按任务基准采信，与 CHANGELOG E-1 时点基线（1087 ok/0 FAIL/1 skip）衔接一致——但 **EV 行缺失（F-1a）+ 十九面 vs 18 口径差（F-2）**，§8#1 判定方式（EV 留痕 + 断言数实测留痕）不可满足 |
| E-3 tarball 隔离冷装 | 门控事实（npm pack 1,601,746B → DSH_HOME/npm_config_cache 重定向临时目录 → install exit 0 → version 0.4.2 → lib 15 模块全验证 OK——14 import + client.js 浏览器模块 node --check 语法 OK，模块形态差异已披露）按任务基准采信；判据与 version-plan §4 E-3（lib 15 / files 含 lib/preset-defaults.js 复数 / 措辞纪律）相符，package.json files lib 段 15 项现盘清点一致——但 EV 行缺失（**F-1a**），§8#2 判定方式（隔离安装冒烟记录留痕）不可满足 |
| E-4 Release Reviewer | 本报告（本审查点） |
| E-5 tag / push / GitHub Release | ⏳ PENDING 正确——**本审查 NEEDS_CHANGE 非通过终态，E-5 不放行**；执行核对注记 2 条见 E4-N-2 |
| E-6 归档检查 | ⏳ PENDING 正确（发布收尾段；dry-run 判据在案） |
| E-7 用户重启验收 | ⏳ PENDING 正确（§7 五项验收清单在案；FIX-025 老会话场景并入在案） |
| 三件套资产（release-checklist / rollback-plan v0.4.2） | 未产出——version-plan §4 表头「随执行段按三件套惯例产出」自承诺；docs/release/ 现存仅至 v0.3.2（v0.3.3/v0.4.1 已无独立三件套，实践已由 version-plan 内联章节替代）——E4-N-1 |

### 要点 5：README / CHANGELOG / package.json 三件一致性——**PASS**

| 核对项 | package.json | README | CHANGELOG v0.4.2 |
| --- | --- | --- | --- |
| 版本号 | `0.4.2`（:4）✅ | 徽章 v0.4.2（:7）✅ | 节头 v0.4.2 — 2026-09-02 ✅ |
| 安装命令 | — | 在线命令 + 固定版本示例「如 v0.4.2」（:37）+ 离线包 v0.4.2（:41-47）✅ | — |
| 披露口径 | files lib 段 15 项含 preset-defaults.js ✅ | L101 空白判据已修正；L103 写回恢复+串行化队列 = CHANGELOG 新增 bullet 同口径；L104 重启播种披露 ✅ | 修复链/遥测/已知问题四条与 README 已知行为段互补不矛盾 ✅ |
| 依赖面 | deps 6 / peers 8×rc.8 ✅ | — | 「与 v0.4.1 逐项一致、pnpm-lock 零变更」采信 E-1 git 复采 ✅ |

---

## 2. 规划段 R1 SUGGESTION×2 落实核对

| 前轮 finding | 落实裁定 | 证据 |
| --- | --- | --- |
| R1-N-2（tracker 行号系统性偏 1——建议 E-1 按内容定位） | ✅ 已落实 | CHANGELOG v0.4.2 全节**零 tracker 行号引用**——定位一律按任务 ID（EVO-013/FIX-022~027/GOV-005/006）+ EV 号（EV-122 链 / EV-136/137）+ SHA 底账，内容寻址 ✅ |
| R1-N-3（version-plan 自身 git 入账状态未声明） | ✅ 已落实 | CHANGELOG 治理面显式入账 `4138f53`（REL-008 规划段终态：version-plan R1 入仓 + 双机录 + tracker 收口）；双机录在盘实证 = evidence-log :454（REVIEW-REL-008-R0）/ :456（REVIEW-REL-008-R1）机录行 + `.governance/review-REL-008-R0.md` / `review-REL-008-R1.md` 机器记录文件 ✅ |

---

## 3. Findings（BLOCKING×2 + SUGGESTION×2）

### F-1【BLOCKING】E-1~E-3 执行段证据未机写入账——§8 判定方式（EV 留痕）不可满足

**事实链（现盘实采）**：

1. `.governance/evidence-log.md` 全文 456 行止：REL-008 相关仅 TRIAGE-REL-008（:448）、REVIEW-REL-008-R0（:454）、REVIEW-REL-008-R1（:456）三行**规划/审查链机录**——**无任何执行段（E-1 bump / E-2 复跑 / E-3 冷装）EV 行**。grep 全文无 `2d8b3b1`、无 `4138f53`、无 `1,601,746`、无 smoke `1087` 复跑记录、无 `dsh-agent-router-0.4.2` tgz 记录。
2. `plan-tracker.md` REL-008 行（:64）状态仍为「**规划段终态——待用户发布授权（M-1）**」——与执行段已推进至 E-4 的实际进度账实差（与 R0 F-2「DOC-001 漂移未入账」同型教训：账面落后于事实）。
3. 对照先例：EV-119（REL-007）E-1~E-3 合并行在 E-4/E-5 续行**之前**已机写（状态「E-4/E-5 待续」）；EV-087/EV-092/EV-101 各发布链执行段均有机录行。本 rhythm 在 REL-008 断裂。

**危害**：version-plan §4 表头「每项结果 EV 留痕」+ §8 #1/#2（E-2/E-3 判定方式 = EV 留痕 / 机器输出留痕）是发布有效性的自设判据。任务简报的门控事实叙述（E-2 18/18、E-3 冷装六断言）本席按角色基准**采信其发生**，但 release-review SKILL 事实依据红线：「发布 APPROVED 只能基于**可复查事实**：命令输出、CI/测试结果、tag/commit、release docs、**风险/证据记录**」「不得用叙述替代发布事实」——证据行落账前，E-1/E-2/E-3 三门禁在台账上处于「已执行、零证据」状态，检查清单「逐项有证据」硬门槛不成立；E-5 之后补账将造成「先发布后补证」的治理倒置。

**修复要求**（Coordinator 域，纯治理记录动作、零代码变更）：

1. 机写 EV 行：E-1（`2d8b3b1` bump + CHANGELOG/README 收口 + 前置项四件落地留痕）、E-2（18/18 逐套件 exit 0 + 断言数实测——**必须显式记录 canonical 面数口径**，见 F-2）、E-3（tgz 字节数 + 重定向措辞 + install exit 0 + version/lib 15 断言 + 逐条命令结构化上报留痕）；plan-tracker REL-008 行同步更新至执行段状态（E-1/E-2/E-3 完成判定 + E-4 进行中）。
2. E-3 留痕措辞纪律：「隔离环境安装冒烟（环境变量重定向至临时目录）通过」。

### F-2【BLOCKING】CHANGELOG「十九面清单全绿复跑」vs E-2 实跑 18/18——一套件口径差无在案记录可调停

**事实链**：

1. `tests/` 现盘 glob 实采 **19 个 .mjs**（含 `install-entry.mjs`——安装入口守卫套件：BOM/在线命令/离线安装/依赖解析/文档一致性五类断言，非装饰性文件）；version-plan §4 E-2 命令清单亦列 19 文件。
2. E-2 门控事实（Coordinator 采信）：**18/18 套件全绿零 FAIL**——命名枚举（smoke/preset-defaults/client-render/routing-paths/adapter-parity/oauth×4/stats/rpc-shadow + 其余 7 = metrics/attachments/fix-009/fix-010/fix-012/audit-001/audit-001-concurrency）合计 18，**install-entry 不在命名之列且总数为 18**。
3. CHANGELOG v0.4.2 **已提交**（2d8b3b1）两处声称：已知问题①（:34）「回归保护依赖发布前本地全量测试网（**十九面清单全绿复跑**，见『版本说明·验证基线』）」；版本说明内部注解（:43）「E-2 全量门控复跑（**十九面清单**……）随发布链执行，最终以复跑实测值为准」。所引「版本说明·验证基线」实际记载的是 E-1 时点 smoke 1087 + E-2/E-3 前瞻表述——**文档内部无一处支撑「十九面全绿已复跑」**。
4. canonical 口径规则（version-plan :41）：「门控 canonical 清单以 E-2 Coordinator 实跑为准（先例：REL-007 十七面 / EVO-013 时点十八面）」——按此规则 18/18 即 canonical 全量，但该排除判定与理由**无在案记录**（F-1 修复的 EV 行正是其落点）。

**危害**：发布文档中的事实性声称（回归保护面数）与权威门控记录相差一套件且不可对账。no-overclaim 锚点⑤「实测数字以 E-2 复跑值为权威，不沿用旧值宣称」要求发布文本向复跑值收敛；若带差异 tag/push，v0.4.2 发布后才发现即成 CHANGELOG 勘误事项（FIX-014 勘误先例示其代价）。

**修复要求**（二选一，均在 E-5 之前完成）：

- **路径 A（推荐）**：E-2 EV 行如实记录 canonical=18 及 install-entry 排除理由与覆盖替代路径（E-3 隔离冷装已覆盖安装链验证 + smoke README 3 断言覆盖文档一致性——如属实），CHANGELOG 两处「十九面」措辞经一次 tag 前小修 commit 对齐（先例：`5ca8b87` v0.3.1 CHANGELOG 定稿 / `e818183` v0.3.3 一行修正裁量）；
- **路径 B**：补跑 install-entry 至全绿留痕，使「十九面全绿复跑」如实成立，EV 行记录 19/19。
- 禁止：不改文档也不留记录（口径差裸奔进 tag）。

### E4-N-1【SUGGESTION】执行段「三件套」资产未产出（version-plan 自承诺项）

version-plan §4 表头：「release-checklist / rollback-plan 资产随执行段按三件套惯例产出（v0.3.0 先例）」。现盘 docs/release/ 仅至 v0.3.2 三件套；v0.3.3/v0.4.1 两轮发布已无独立三件套（实践由 version-plan 内联章节 + CHANGELOG 披露替代），v0.4.2 亦未产出。**处置建议**：E-5 前产出，或在 EV/报告中显式声明沿 v0.3.3/v0.4.1 简化先例（§6.2 回滚三阶段 + §4 门禁清单为替代载体）——二选一留痕即可，非阻塞。

### E4-N-2【SUGGESTION】E-5 执行核对注记 2 条（Release asset 命名 / tag 一致性）

1. README 离线链接指向 `releases/download/v0.4.2/dsh-agent-router-v0.4.2.tar.gz`（带 v 前缀、.tar.gz 后缀），而 E-3 npm pack 实际产物为 `dsh-agent-router-0.4.2.tgz`——E-5 创建 GitHub Release 时 asset 命名 MUST 与 README 链接一致（否则离线安装链接 404），沿 v0.4.1 同型链接先例核对。
2. E-5 三者一致性判据（tag v0.4.2 / 远端 tag / Release 非 draft + assets 含 tarball）+ `40816dc`（v0.4.1 tag hash，CHANGELOG :42 引用）随 E-5 git 复采一并核对。

---

## 4. 采信与未验证边界（事实依据红线声明）

- **本轮独立核实（现盘实采）**：package.json 全文（version 0.4.2 / files lib 段 15 项 / deps 6 / peers 8×rc.8）；CHANGELOG v0.4.2 节全文（三分账 31 计数 + 30 枚 SHA 底账逐字比对 + 四证 + 已知问题四条 + no-overclaim 六锚点文本）；README 全文（徽章/安装链接/L101 修正/P3×2 落地/披露口径）；version-plan R1 全文 263 行；R0/R1 报告全文；evidence-log :440-456 + REL-008/E-2/E-3 关键词全稿检索；plan-tracker REL-008 行；tests/ 19 .mjs 清单 + install-entry.mjs 形态；lib/schemas.js :294-311（presets 缺省 + 未知字段透传）。
- **采信非本轮复跑**（任务基准 + 角色无命令权限）：E-2 18/18 门控事实、E-3 冷装六断言、HEAD `2d8b3b1`、`4138f53` 入账、deps/pnpm-lock 与 v0.4.1 逐项 diff 零变更、v0.4.1 tag `40816dc`——以 Coordinator 门控事实呈报 + version-plan/CHANGELOG 只读实采声明交叉一致为准；**该采信不豁免 F-1 的证据落账义务**（叙述 ≠ 证据记录）。E-5 前 git 三分账复采为权威。
- 全量门控 / 冷装 / 归档检查未在本轮运行（分别属 E-2/E-3/E-6，其中 E-2/E-3 已由 Coordinator 执行、待落账；E-6 PENDING 正确）——无「未验证写成通过」违例。
- 本报告为 E-4 审查点 R0；结论 NEEDS_CHANGE 非终态，Coordinator MUST review-record 机写（NEEDS_CHANGE 自动 next_round），round<3 按 T1 返工后重 spawn 同一 Release Reviewer 复审（E-4 R1），复审 MUST 逐条比对 F-1/F-2 修复状态并标注已修复/未修复/新引入；round≥3 仍 BLOCKING → 转 BLOCKED + escalation。

## 5. 硬门槛裁决

| 硬门槛 | 裁决 |
| --- | --- |
| 发布检查清单全部 PASS（逐项有证据） | **FAIL**——E-1/E-2/E-3 执行段零 EV 行（F-1）；E-2 面数口径差未调停（F-2）；E-5~E-7 待执行项清单完整 ✅ |
| 回滚方案存在且与现盘一致 | PASS（§6.2 在案；残留键容忍/数据正交独立复核；revert 顺序约束与现盘相符） |
| CHANGELOG 用户视角完整 | PASS（新增/变更/修复/破坏性变更四段齐；已知问题四条；语义覆盖抽验通过） |
| breaking changes 标注（四证） | PASS（schemas.js:301/:306 + peers/files 现盘清点相符；diff 项以 E-1 复采为权威） |
| 版本号 semver 合规 | PASS（0.4.1→0.4.2 MINOR，沿规划段 R0/R1 双轮成立论证；终决随用户 DEC-143） |
| no-overclaim 锚点 | FAIL（锚点⑤ F-2 一处；①②③④⑥ PASS） |

## 6. 结论

**NEEDS_CHANGE（unresolved_blockers=2）**

- **BLOCKING×2**：F-1（E-1~E-3 执行段 EV 行机写入账 + plan-tracker REL-008 行更新至执行段状态）；F-2（十九面 vs 18/18 口径差调停——路径 A：EV 行记 canonical 18 + 理由 + CHANGELOG 两处措辞 tag 前小修对齐 / 路径 B：补跑 install-entry 至 19/19 如实成立）。
- **SUGGESTION×2**：E4-N-1（三件套资产产出或显式沿简化先例）；E4-N-2（E-5 asset 命名与 README 链接一致性 + tag/Release 三者一致性核对注记）。
- E-1 文档面产物质量与范围台账（要点 1-3、5 及 R1-N-2/N-3 落实）全部合格——返工范围仅限证据落账与一处措辞对齐（路径 A 时），零产品代码变更。
- **E-5（tag/push/GitHub Release）在 E-4 复审通过终态（APPROVED 或 APPROVED_WITH_NOTES/unresolved_blockers=0）前不放行。**
