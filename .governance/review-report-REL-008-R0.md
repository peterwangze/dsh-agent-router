# REL-008 R0 发布审查报告 — version-plan-v0.4.2.md（规划稿）

| 项 | 值 |
| --- | --- |
| Task ID | REL-008（R0——规划先行段审查，对应规划稿 §5 PM-1） |
| 审查对象 | `.governance/version-plan-v0.4.2.md`（Release Agent 规划稿，八节，259 行） |
| 审查角色 | Release Reviewer（agents/release-reviewer.md + skills/release-review/SKILL.md 绑定） |
| 审查方式 | 只读（Read/Grep/Glob）——无命令权限；git 事实按任务基准以 plan-tracker 终态行 + CHANGELOG 既有节交叉对照，**E-1 git log 三分账复采为权威**（规划稿头表已自声明） |
| 审查轮次 | **R0**（首轮；无前轮引用） |
| 结论 | **NEEDS_CHANGE**（unresolved_blockers=**2**；BLOCKING×2 + WARNING×1 + SUGGESTION×1） |
| 日期 | 2026-09-02 |

---

## 0. 结论速览

规划稿整体骨架合格：八节齐备、三分账方法论与先例一致、semver MINOR 论证成立、回滚三阶段逻辑自洽、E-1~E-7 对齐 REL-007 先例且披露三条齐全、DEC-143 授权边界清晰、五处规划期问题（P-1~P-5）如实呈报。但存在 **2 项 BLOCKING**（E-3 门禁判据产物文件名失真；DOC-001 范围漂移未入账致「承载面全终态」声明失准），均须在规划稿文本层面修正后方可进入 M-2 执行段。按 T1（round<3）：Coordinator 返回 Release Agent 修订 → 重 spawn 同一 Reviewer 复审（R1）。

---

## 1. 五维度逐项结论

### 维度一：发布就绪（范围一致性 / no-overclaim）——**FAIL（2 BLOCKING）**

#### F-1【BLOCKING】E-3 门禁判据产物文件名失真：`preset-default.js`（单数）不存在，实为 `preset-defaults.js`（复数）

规划稿四处以反引号精确名声称新增产物为 `lib/preset-default.js`（单数）：

| 位置 | 原文 |
| --- | --- |
| §1.2 基线表「tarball 面变更」 | 「lib 模块 14 → 15（**新增 `lib/preset-default.js`**）」 |
| §2.1 产品面 #1（`2ab27d6`） | 「含 package.json files 列表 **+lib/preset-default.js**（打包完整性）」 |
| §4 E-3 判定方式 | 「断言 version 0.4.2 / **lib 15 模块全 import OK（14+新增 preset-default.js）** / peerDeps rc.8 / **files 清单含 preset-default.js**」 |
| §8 验收标准 #2 | 「**files 清单含 preset-default.js**」 |

现盘核实（三重独立证据）：

1. `lib/` 目录 glob 实采 15 个 .js 文件，含 `preset-defaults.js`（复数），**不存在 `preset-default.js`（单数）**；
2. `package.json:36` files 清单实为 `"lib/preset-defaults.js"`（复数）——lib 段 15 项与「14→15」计数一致，但文件名是复数；
3. `lib/schemas.js:241` 权威单点注释自证「由 **lib/preset-defaults.js** 换入」；`.governance/evidence-log.md` EV-122 同样记为「2ab27d6（**preset-defaults.js** … + files 补录）」。

**危害**：E-3 是「先于 tag、未验证产物不打 tag」的发布硬门禁。其判据按字面执行——「files 清单含 preset-default.js」——在真实 files 清单（`lib/preset-defaults.js`）上**精确子串匹配必失败**（`preset-default.js` 不是 `preset-defaults.js` 的子串：default 与 .js 之间多一个 s）；执行者要么判 FAIL 阻断，要么临场改写判据破坏证据链。这与本仓 FIX-014 教训（files 清单/import 断言必须逐字精确）直接冲突。发布检查清单「逐项有证据」硬门槛在 E-3 判据失真即不成立。

**修复要求**：规划稿四处统一更正为 `lib/preset-defaults.js`（复数）；E-1 复采时将 files 清单 lib 段 15 个文件名与 `lib/` 目录逐字清点对照（先例：FIX-014 判别）。

#### F-2【BLOCKING】DOC-001 范围漂移未入账——「承载面全终态·无未闭环任务依赖」声明失准

事实链（现盘 + 任务简报采信）：

- `plan-tracker.md:63`：**DOC-001**（P2，目标版本 **0.4.2**，「随 v0.4.2 发布承载」）状态「进行中——TRIAGE-DOC-001 机录」——v0.4.2 目标域内**未闭环任务**；
- DOC-001 的 README 功能面刷新已提交（**`2e1cdf8`**，任务简报采信），README 现盘 L84-119 已是刷新后形态（「### 2. 预设 Agent 默认模型」整节重构 + 事件驱动语义）；
- 但规划稿：§1.4 任务终态快照（10 任务）**无 DOC-001**；§2.1 产品面「14 commits 逐 SHA 实采」**无 `2e1cdf8`**；§1.4 注「承载面**全终态**……v0.4.2 **无未闭环任务依赖**」与 tracker :63 直接矛盾；头表 Git 事实声明仅预判「范围届时可能新增**治理** commits」——产品面 commit 漂移不在预判内；§7 规划期问题 P-2 将 README 措辞归因于「FIX-025 台账挂账未落地」，未识别 DOC-001 已部分落地。

**危害**：①规划稿核心交付物三分账（产品 14）相对 HEAD 已事实性不完整（≥15 产品 commits），与自检清单「范围三分账完整（产品 14）✅」「零编造」声明冲突；②v0.4.2 将携带一个**无审查记录、未终态**的 in-flight 任务（DOC-001）的产品产出随版发布，违反规划稿自己声明的「承载面全终态（开发+审查+用户复验三态齐）」前提；③E-1 执行者按本稿台账复采时将遭遇未解释的账实差。

**修复要求**：①§1.4 增补 DOC-001 行（如实标注「进行中——README 刷新已提交 2e1cdf8，审查/终态待闭环」）；②§2.1/§2.2 注记 `2e1cdf8`（产品面·文档）待 E-1 git log 复采正式入账，产品面计数改口为「14 + DOC-001（E-1 复采确认）+ E-1 bump commit」；③§4 E-1 门禁增列前置项「**DOC-001 终态闭环**（按其任务类型完成审查/收尾机录）」——未闭环任务不得随版；④§7 规划期问题增补 P-6（DOC-001 漂移）或改写 P-2。

### 维度二：质量门禁（E-2/E-3 基线与判据）——**FAIL（F-1 牵连）+ PASS 项**

- E-2 命令清单 19 文件与 `tests/*.mjs` 现盘 glob **逐字一致**（19 个 .mjs；`tests/served-client.js` 为镜像资产非测试入口，规划稿「tests/*.mjs glob 实采 19 文件」口径准确）✅；
- 断言基线（smoke 多轮 ALL PASSED / preset-defaults 41 / client-render 207）与 tracker FIX-023（9→41/41）、FIX-027（12 RED→207/207）、EVO-014（38/38 中间值）链路一致，「E-2 复跑后以复跑实测为权威」免责正确 ✅；
- E-3 隔离冷装含 import OK 必验（FIX-014 教训）+ 措辞纪律（「隔离环境安装冒烟（环境变量重定向至临时目录）通过」限定语在 E-3 与 §8#2 双落点）✅——但判定方式内嵌 F-1 错误文件名，**修正 F-1 前本维度整体 FAIL**。
- 版本/依赖面现盘抽验：`package.json:4` = 0.4.1 ✅；peerDeps 8×^0.1.0-rc.8（逐项清点 8 项）✅；deps 面与 v0.4.1 一致性无法独立 diff（无命令权限），以 E-1 复采为权威（规划稿已自声明）。

### 维度三：回滚能力（逻辑核验）——**PASS**

§6.2 三阶段（push 前中止 / push 后 revert+复跑+前滚或整体回退 / 用户侧 junction checkout v0.4.1 或 tarball 重装）窗口、动作、耗时齐备。安全论证逐点核验成立：

1. **残留键零消费**：功能 commits revert 后 schemas 恢复为无 `presets` 节，旧配置残留 `presets` 键经未知字段容忍透传——三重现盘佐证：`schemas.js:306`「未知字段透传」codec 注释、`schemas.js:278-279` 遗留键容忍先例明文（rollback-plan v0.3.0 先例）、`schemas.js:247-248`「未知预设键放行——按配置存在但预设已不存在处理」消费点语义（即使 schemas 未 revert 也不命中行为）。**逻辑成立**；
2. **同文件链整组 revert 约束**：FIX-023→024→025→026→027 为 lib/preset-defaults.js / service.js / client.js 叠进链，部分 revert 必产生冲突——「建议整组同 revert」正确且必要；
3. **files 列表回落**：EVO-013 机制 commit 含 files 行，revert 后 lib 清单回落 14，重打包须复跑 E-3 import 断言——与 FIX-014 教训闭环一致（注意：修复 F-1 后此处的模块名同样须用复数形态）；
4. **数据面正交**：`presets` 为独立命名空间（schemas.js:301），与 oauthAccounts(:294)/stats(:288)/凭据域零触碰，回滚无数据迁移冲突 ✅。

（注：本版回滚为论证级 + 先例级，未做独立演练——与本仓 v0.3.0~v0.4.1 五轮发布先例一致，junction 安装态天然可逆，不构成本轮 finding。）

### 维度四：用户影响（CHANGELOG 收口要点 / 已知问题披露）——**PASS（一处 WARNING 见 F-3）**

- 已知问题披露**三条齐全**：①DEFERRED-001（§2.3#1——宿主域、插件无责、规避路径、EV-138 证据链，与 tracker :103 逐点一致）②重启失步缝隙（§2.3#2 ↔ tracker :104）③P3 台账批（§2.3#3 ↔ tracker :60-61 + 各任务行台账明细逐项对得上）✅；
- E-1 新节起草要点四段齐（主题一用户行为 / 主题二治理弱表述 / 披露三条 / 「破坏性变更：无」四证显式节），与 CHANGELOG v0.4.1 节结构先例对齐 ✅；
- CHANGELOG 现态声明核验：现盘以 `## v0.4.1 — 2026-09-01`（:6）收尾，**无未发布段** ✅；规划稿引用的 :22（AUDIT-001 台账 41 条随 v0.4.2 消化）与 :37（CI 面缺披露延续）行号逐字相符 ✅；
- §2.4「本次明确不发布什么」五项显式（防 scope creep）✅；
- no-overclaim 锚点六条（E-4）内容合格：复验口径限定 EV-136/137 在案场景、DEFERRED-001 责任域清晰、隔离措辞纪律、不声明生产就绪、复跑值为权威、规划≠决策 ✅。

### 维度五：版本号合规——**PASS**

0.4.1 → 0.4.2 **MINOR** 论证成立：新能力面（新配置节 `router.presets` + 新设置卡片 + 新事件行为）符合「向后兼容的新增功能」；无 breaking 四证抽验——①配置面缺省空字典（`schemas.js:301` `.default({})` 实读相符）②依赖面（peerDeps 8×rc.8 现盘清点相符；package.json diff 以 E-1 复采为权威）③数据面新命名空间正交（schemas 实读证实）④行为面三层主权（picked/header 优先——与 schemas.js:240-242 注释同构）；不跳号论证（0.4.1→0.4.2 相邻；0.4.1-patch 不可重打；无 0.5.0 断层）成立；版本号终决随用户授权（DEC-143）标注正确 ✅。

---

## 2. 其余发现

#### F-3【WARNING】P-2/§2.3#6/R-v3 的现盘描述已过时（DOC-001 刷新后行号漂移 + 残余面收窄）

规划稿声称「README **L100**「无请求日志」/ **L103**「日志锚定」仍为 FIX-025 前判据措辞」。现盘实读（DOC-001 刷新后）：

- 「无请求日志」现位于 **L101**（「主 Agent 默认模型：仅对空白会话（无请求日志）生效」）——L100 现为「手动选择即当前会话生效」条目，无该措辞；
- 「日志锚定」现位于 **L99**（「首条消息后锚定……由请求日志锚定（宿主原生行为）」——该句为宿主原生行为描述，**语义正确，非缺陷**）与 **L104**（「已发过消息的会话不受影响（日志锚定）」——同属正确语义）；L103 现为「实现机制……无请求流拦截」——措辞已更新；
- L104 已含「重启后重新打开**从未发过消息的空白预设会话**，同样会触发显示播种」——这正是 FIX-025 台账挂账「README 已知行为段随判据外延更新（老无消息会话=空白可切）入 0.4.2 批」的落地形态，**该台账项已部分落地**；
- **真正的残余缺陷收窄为一处**：L101 括号注记「（无请求日志）」作为「空白会话」的判据定义仍是 FIX-025 前口径（实现 = `session.events` 无 turn/start，判据更宽——含带标题/命令但从未发消息的会话）。

**处置**：不阻本结论之外另行升级——E-1「README 已知行为段判据措辞修正」门禁项**仍然有效且必须执行**，但规划稿文本须按现盘改写（行号 L100/L103 → L101；残余范围收窄为「空白判据括号注记一处」），否则 E-1 执行者按稿索骥将空手而归、误判 P-2 已闭合。随 F-2 的 P-2/P-6 改写一并处理。

#### N-1【SUGGESTION】E-4 复审范围建议显式含前轮 findings 比对

§4 E-4（M-2 执行段复审）与 §5 PM-1（本轮规划审查）为两个审查点。建议 E-4 判定方式补一句「复审 MUST 逐条比对 PM-1/R0 findings（本报告 F-1~F-3）修复状态，标注已修复/未修复/新引入」——复审的本质是验证修复（M7.4 / release-reviewer 角色硬约束），显式写入可防执行段复审脱锚。非阻塞。

---

## 3. 采信与未验证边界（事实依据红线声明）

- **本轮独立核实**（现盘实读）：lib/ 15 文件清单、package.json（:4 版本 / :36 files 复数条目 / peerDeps 8 项）、schemas.js :234/:241/:247-248/:278-279/:301、CHANGELOG 现态（v0.4.1 收尾无未发布段；:22/:37 引用行）、README L80-124、tests/ 20 文件（19 .mjs + served-client.js）、docs/release/ 三 version-plan 先例、`.governance/tmp-repro-014.mjs` 在盘（P-3 属实）、risk-log RISK-001(:5)/RISK-003(:7)、evidence-log EV-122/136/137/138。
- **采信非本轮复跑**（按任务基准）：git log/status/tag 实采值（26 ahead / 28 commits / 逐 SHA 归属——无命令权限，以规划稿只读实采声明 + plan-tracker 终态行交叉一致为准，E-1 复采为权威）；门控多轮全绿与用户复验三终态（tracker/EV 在案记录）；DOC-001 提交 `2e1cdf8` 已入 HEAD（任务简报采信）。
- 全量门控 / 隔离冷装 / 归档检查均未在本轮运行——分别属 E-2/E-3/E-6 执行段，规划稿标注 PENDING 正确，无「未验证写成通过」违例。

---

## 4. 硬门槛裁决

| 硬门槛 | 裁决 |
| --- | --- |
| 发布检查清单全部 PASS = 100% | **FAIL**——E-3 判据文件名失真（F-1）+ 范围台账账实差（F-2）；§8#2 同染 F-1 |
| 回滚方案存在且论证可执行 | PASS（维度三四点逻辑核验成立） |
| CHANGELOG 用户视角完整（E-1 起草要点） | PASS（要点齐；执行在 E-1） |
| 已知问题披露三条齐全 | PASS |
| breaking changes 标注（四证） | PASS（现盘可核部分全相符） |
| 版本号 semver 合规 | PASS（MINOR 论证成立） |

## 5. 结论

**NEEDS_CHANGE**（unresolved_blockers=2）

- **BLOCKING×2**：F-1（E-3/§1.2/§2.1/§8 四处 `preset-default.js` → `lib/preset-defaults.js` 更正）；F-2（DOC-001 行 + `2e1cdf8` 入三分账注记 + E-1 增列「DOC-001 终态闭环」前置 + 「承载面全终态」声明改写）。
- **WARNING×1**：F-3（P-2/§2.3#6/R-v3 按现盘改写：行号 L101、残余面收窄、「日志锚定」两处为正确语义非缺陷）。
- **SUGGESTION×1**：N-1（E-4 复审显式绑定前轮 findings 比对）。

返工路径：Coordinator 将本报告退回 Release Agent 修订规划稿（纯文本修正，零代码变更）→ 重 spawn 本 Reviewer 复审（R1，round<3；复审 MUST 逐条比对 F-1/F-2/F-3/N-1 修复状态）。修订完成且无新 BLOCKING 前，不得进入 M-1 用户授权呈报与 M-2 执行段。
