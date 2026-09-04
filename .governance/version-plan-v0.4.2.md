# dsh-agent-router v0.4.2 版本规划（version-plan）

| 项 | 值 |
| --- | --- |
| Task ID | REL-008（P1，v0.4.2 发布链——**规划先行段**；打包发布在用户授权后另段执行） |
| 文档类型 | 版本规划（Release Agent 产出，stage-release 子工作流；本仓结构先例 = docs/release/version-plan-v0.3.2.md 八节 + version-plan-v0.3.0.md 门禁纪律） |
| 日期 | 2026-09-02（R1 修订同日） |
| 状态 | 规划稿 **R1 修订版**（R0 NEEDS_CHANGE → 已修复 F-1/F-2 BLOCKING + F-3 WARNING + N-1，见修订记录；待 R1 复审 → 用户发布授权；发布决策/tag/push 一律待用户授权，DEC-143 交互基线） |
| 修订记录 | **R1（2026-09-02，按 `.governance/review-report-REL-008-R0.md`）**：F-1 文件名更正 `lib/preset-defaults.js` 复数（审查点名 4 处 + 自查依赖面行 1 处 = 5 处）；F-2 DOC-001 入账（§1.4 行 / §2.1 #15 / §4 E-1 前置项 / §1.4 表述改写 / §7 P-6）；F-3 README 现盘对齐（残余收窄为 L101 一处；L99/L104「日志锚定」为正确宿主语义非缺陷）；N-1 E-4 增列前轮 findings 逐条比对 |
| 规划目标版本 | **v0.4.2**（0.4.1 → 0.4.2，**MINOR**——论证见 §3；版本号最终随用户发布授权确认） |
| 事实源 | `.governance/plan-tracker.md`（EVO-013/014、FIX-022~027、GOV-005/006、REL-007/008 行）、`.governance/evidence-log.md`（EV-122~138）、`CHANGELOG.md`（现态以 v0.4.1 节收尾——无未发布段）、`README.md`（实读 L84-119——DOC-001 刷新后现盘）、`package.json`（实读 :4 = 0.4.1 / :36 files 复数条目）、`lib/schemas.js`（实读 :234/:301）、`tests/` 清单（实采 19 文件） |
| Git 事实声明 | **本稿 git 事实为只读实采**（2026-09-02，Coordinator 授权：`git log --oneline v0.4.1..HEAD` + `git show --stat` 三处归属消歧 + `git diff v0.4.1..HEAD --name-only` + `git tag --list`）——与 v0.3.0/v0.3.2 规划稿"无命令权限"声明不同；E-1 CHANGELOG 收口时仍 MUST 以 git log 三分账复采对照（范围届时可能新增治理收尾与产品面收口 commits——R0 F-2 教训：DOC-001 产品面漂移曾漏预判，复采逐一以 git log 为权威） |
| 写入边界 | 本稿唯一写入 = 本文件（任务指定 `.governance/version-plan-v0.4.2.md`）。注意：历史 version-plan 先例位于 `docs/release/`（v0.3.0/0.3.1/0.3.2 三件）——本稿落位差异如实声明，归档位移（如有）留给 M-7 治理收尾裁决，本规划不移动任何既有文件 |

---

## §1 版本目标与基线

### 1.1 版本目标（一句话）

**预设 Agent 默认模型全链承载版**：以 EVO-013（配置面）+ EVO-014（事件驱动重构）+ FIX-022~027（复验失败修复链）为主题一，让用户按 DSH 预设粒度配置新会话/subagent 默认模型并「打开即显示、切换即跟随」；同时承载主题二治理资产（GOV-005 P-v3 原则 + GOV-006 终态归档 + 全链审查机录入仓）与披露面（DEFERRED-001 宿主 GUI 挂账 + 重启失步缝隙 + P3 台账批）。

### 1.2 版本基线

| 项 | 事实 | 来源 |
| --- | --- | --- |
| 当前已发布版本 | **v0.4.1**（annotated tag，2026-09-01，GitHub Release 带 tgz；发布范围 e818183..v0.4.1） | plan-tracker REL-007 行（:59）；`git tag --list` 实采 v0.4.1 在案 |
| package.json version | `0.4.1`（bump 至 0.4.2 属 E-1 执行段） | package.json:4（实读） |
| main 领先发布点 | **v0.4.1..HEAD = 29 commits**（实采 R1 复核）：27 枚未 push（`main...origin/main [ahead 27]`）+ 2 枚 v0.4.1 发布后治理收尾（`39506cd` E-6 终态 / `de101c0` tracker 终态，已 push）随本版范围携带；增量含 DOC-001 产品面 1 枚（`2e1cdf8` README 功能面刷新——HEAD 现位，R0 后补入账）；另有工作区**未提交** `.governance/evidence-log.md` + `.governance/plan-tracker.md` 修改（TRIAGE-REL-008 等——E-1 前需治理 commit 入账）+ 待 E-1 bump commit | `git log --oneline v0.4.1..HEAD` + `git rev-list v0.4.1..HEAD --count`（=29）+ `git status -sb`（2026-09-02 R1 复采） |
| 依赖面变更（v0.4.1 后） | **deps/peerDeps 零变更**——package.json diff 仅 files 列表新增 `lib/preset-defaults.js` 一行（打包完整性，只增不减，FIX-014 教训的正向应用；R0 F-1 文件名更正）；pnpm-lock 零变更 | `git diff v0.4.1..HEAD -- package.json pnpm-lock.yaml`（实采） |
| tarball 面变更 | **lib 模块 14 → 15**（新增 `lib/preset-defaults.js`——复数；R0 F-1 文件名更正）——E-3 隔离冷装 import 断言基线随之 +1（FIX-014 教训：import OK 必验） | `git diff --name-only` 实采 + lib 目录清点 15 文件 + package.json:36（实读复数） |
| 宿主面 | 无新增漂移证据；peerDeps 8×^0.1.0-rc.8 维持；FIX-022（roster 域名 = 宿主 JS 组名复数 / wire 方法名单数陷阱）已建立 P9 三层防御 | `git diff` 实采；plan-tracker FIX-022 行（:62） |
| 治理面 | 当前阶段 development（6/11）；G4/G5 pending；RISK-001 活跃（CI 面）；项目质量原则已升级 **P-v3**（DEC-028，GOV-005） | plan-tracker 项目总览/Gate 表（:20/:117-120）；GOV-005 行（:65） |

### 1.3 测试基线（门控现状——plan-tracker 采信 + 实采套件清单）

| 项 | 结果 | 备注 |
| --- | --- | --- |
| 全量套件 | **多轮全绿**（最新 smoke ALL PASSED 多轮 + preset-defaults **41 断言** + client-render **207 断言**——FIX-027 后终值） | plan-tracker FIX-027/EVO-014 行（:66/:71）；E-2 复跑后以复跑实测为权威 |
| 判别测试链 | EVO-013 23 断言 / EVO-014 32 断言（RED 20 FAIL→GREEN）/ FIX-022 / FIX-023 RED 9→41/41 / FIX-024 46/46 / FIX-025 50/50 / FIX-026 11 断言反转防复活 / FIX-027 12 RED→207/207——旧实现必败判别全链在案 | 各任务行（:62-72） |
| 套件清单 | `tests/` 实采 **19 文件**：smoke / routing-paths / stats / metrics / adapter-parity / oauth-credentials / oauth-promotion / oauth-loopback / oauth-main-model / client-render / preset-defaults / attachments / fix-009 / fix-010 / fix-012 / rpc-shadow-guard / audit-001 / audit-001-concurrency / install-entry | `tests/*.mjs` glob 实采；门控 canonical 清单以 E-2 Coordinator 实跑为准（先例：REL-007 十七面 / EVO-013 时点十八面） |

### 1.4 任务终态快照（v0.4.2 承载面——零编造，逐行溯 plan-tracker）

| 任务 | 终态 | 与 v0.4.2 的关系 |
| --- | --- | --- |
| EVO-013（P1） | ✅ 开发+审查终态——4 commits + R0→R1 复审 APPROVED_WITH_NOTES/0 双机录（T1 闭环）+ 门控十八面全绿（smoke 1068 ok/0）+ **用户复验通过**（EV-122 链） | **主题一·配置面** |
| EVO-014（P1） | ✅ 开发+审查终态——3 commits + R0→R1→R2 三机录（R2 **APPROVED/0**）+ preset-defaults 38/38 + **用户复验通过**（打开即显示） | **主题一·事件驱动重构**（移除 agent/request 会话过程介入） |
| FIX-022（P0） | ✅ 终态——**用户复验通过**（第二轮截图实证 roster 正常 + governance 配置保存成功） | 主题一·roster 域名修复 |
| FIX-023（P0） | ✅ 终态——用户复验部分通过（根修生效，残余显示层缺口转 FIX-024） | 主题一·ctx.get('agents') 调用时解析 |
| FIX-024（P1） | ✅ 终态（开发+审查；真机反证转 FIX-026 承载——方法论教训留档） | 主题一·显示刷新（后被 FIX-026 收敛取代——旧路径已删除，P5） |
| FIX-025（P1） | ✅ 终态（R0 **APPROVED/0**；待用户重启复验老会话场景并入 E-7 验收项） | 主题一·空白判据与宿主 sessionBlank 同构 |
| FIX-026（P1） | ✅ 终态（真机仍断转 FIX-027 收口——单路径收敛 + 旧路径删除） | 主题一·显示刷新单路径收敛 |
| FIX-027（P0） | ✅ 终态——**用户复验通过**（EV-136/137：新会话六连切遥测全绿 + 两老会话直切显示同步双确认） | 主题一·modelDirectories 规范注入 + 双形态解析 + 结构化遥测 |
| GOV-005（P1） | ✅ 终态——P-v2→**P-v3**（新增 P10 指令式五条 + P5 强化）+ DEC-028 + AGENTS.md 投影同步 | **主题二·治理资产** |
| GOV-006（P1） | ✅ 终态——EV-136~138 归档 + DEFERRED-001 挂账（用户裁决暂不处理）+ 失步缝隙台账 | **主题二·终态归档与披露源** |
| DOC-001（P2） | ✅ 终态——`2e1cdf8` README 功能面刷新（三大主要功能置顶：①Agent 预设与 subagent 默认模型配置②专业 Agent 配置③ChatGPT 订阅登录+主模型调用；简介段/项目目标/特性列表三处定向编辑；多模态账号拆分零丢失；徽章保持 v0.4.1 归 E-1）+ smoke README 3 断言零回退 + R0 APPROVED_WITH_NOTES/0 机录（tracker :63）；P3×2 讨论级（简介枚举自含性 + 通路切换重选组括注）入 E-1 小修批 | **主题一·文档面**（随 v0.4.2 发布承载——R0 F-2 补入账，规划 R0 稿漏记） |

> 承载面任务**全终态**（开发+审查+用户复验三态齐，plan-tracker 直采；含 DOC-001 文档面终态）——无未闭环任务随版；遗留仅为审查/规划发现的**待收口项**（E-1 前置：README 空白判据注记一处修正 + DOC-001 P3×2 小修批 + 未提交治理记录入账——见 §4 E-1/§7），随 E-1 处理，不构成任务未闭环。REL-008 自身 = 本规划段 + 后续打包发布段。

---

## §2 范围三分账（产品 / 治理 / 披露）

### 2.1 产品面（15 commits = 14 预设链 + DOC-001 文档面 1 枚——逐 SHA 实采核实，全部存在于 v0.4.1..HEAD）

| # | SHA | 变更项 | 内容要点 | 来源 |
| --- | --- | --- | --- | --- |
| 1 | `2ab27d6` | EVO-013 机制 | 预设默认模型机制 + 判别 23 断言 RED→GREEN；含 package.json files 列表 +lib/preset-defaults.js（打包完整性） | git log 实采；EVO-013 行（:72） |
| 2 | `97b04ac` | EVO-013 UI | 设置页「预设 Agent」卡片（专业 Agent 卡之前 / 默认折叠 / 统一添加模板下拉选 DSH 预设 / 主+subagent 模型配置）+ render 22 + smoke 通道 7 | 同上 |
| 3 | `08e0461` | EVO-013 文档 | README「2. 预设 Agent 默认模型」使用指南 + 总览四卡片 | 同上 |
| 4 | `75434e7` | EVO-013 Rework | F-1 broken 契约对齐宿主 string 形状（消测试假绿）+ F-2 主权③ fail-closed + F-3 注释更正 | 同上 |
| 5 | `de72e0c` | EVO-014 重构 | `agent/created` + `agent-preset/selected` 事件播种（打开即显示）+ selectModel 全局瞬态写回恢复（用户裁决）+ subagent 纯 options 修正 + 移除 agent/request 会话过程介入（32 断言） | git log 实采；EVO-014 行（:71） |
| 6 | `fe0a94e` | EVO-014 Rework | F-1 播种 Promise 链串行化 + F-2 effort 路径 3 断言 + F-3 README 披露 | 同上 |
| 7 | `4e1d9cc` | EVO-014 MicroFix | NF-1 return await enqueueSeed（消 unhandledRejection 外泄） | 同上 |
| 8 | `740f95a` | FIX-022 | roster RPC 域名对齐宿主——`api.agentPresets` 复数（wire 名单数陷阱）+ P9 三层防御（复数优先/单数回落/缺域明确诊断）+ fixture 对齐宿主真实形状 | git log 实采；FIX-022 行（:62） |
| 9 | `afa6ddc` | FIX-023 | `ctx.get('agents')` 调用时解析 + fixture 去属性化（mock 保真度第三次同型）——**混合 commit**：lib/preset-defaults.js +54 与治理记录同车（commit 标题仅述治理，diff 实采含产品代码；三分账按 tracker 修复载体归属产品面） | `git show --stat afa6ddc` 实采消歧；FIX-023 行（:70） |
| 10 | `ba36836` | FIX-024 | 种子成功后显式 emit llm/adapters-updated（I1/I3/I4 判别 46/46）——后续被 FIX-026 单路径收敛**取代并删除**（P5 旧路径不并存），本版以最终态形态发布 | git log 实采；FIX-024 行（:68） |
| 11 | `a80e935` | FIX-025 | 空白判据与宿主 sessionBlank 完全同构（无 turn/start 即播种；events 不可读回落 requestHeader 反演）——老无消息会话切换跟随（J1/J2 RED→GREEN 50/50） | git log 实采；FIX-025 行（:69） |
| 12 | `98299e5` | FIX-026 | 客户端 `$on('agent-preset/selected')` 直驱 modelDirectories 目录重载（与"打开 mount→load"同源同对象）+ **删除 FIX-024 服务端 emit 死路径**（EV-132 真机反证不可达；P5 单路径收敛） | git log 实采；FIX-026 行（:67） |
| 13 | `8c4cfc5` | FIX-027 | modelDirectories 规范注入声明（inject 扩展）+ 双形态解析防御 + 结构化遥测（前缀 dsh-agent-router[FIX-027]）+ fixture 门控保真度修正（旧实现 12 断言 RED→GREEN 207/207，复现 EV-134 根因） | git log 实采；FIX-027 行（:66） |
| 14 | `6d5e357` | FIX-027 镜像 | served-client.js 镜像同步（双形态同字节） | git log 实采 |
| 15 | `2e1cdf8` | DOC-001 文档 | README 功能面刷新——三大主要功能置顶（项目目标改三大功能主轴；特性列表重排；多模态账号拆分零丢失）+ smoke README 3 断言零回退；R0 APPROVED_WITH_NOTES/0 机录（tracker :63）；HEAD 现位——**R0 F-2 补入账**（规划 R0 稿漏记） | git log 实采（HEAD）；plan-tracker DOC-001 行（:63） |

产品代码触面（`git diff --name-only` 实采）：`lib/preset-defaults.js`（新增）/ `lib/client.js` / `lib/service.js` / `lib/schemas.js` / `lib/index.js` / `README.md` / `package.json`（仅 files 列表）+ `tests/` ×4。**配置面新增 = `router.presets` 配置节**（schemas.js:301 `presets: z.dict(presetDefaultSchema).default({})`——实读）。

### 2.2 治理面（14 commits——逐 SHA 实采）

| # | SHA | 内容 |
| --- | --- | --- |
| 1 | `39506cd` | REL-007 E-6 发布终态（v0.4.1 发布后收尾，已 push——随本版范围携带） |
| 2 | `de101c0` | REL-007 tracker 终态（同上） |
| 3 | `803f9fc` | EVO-013 治理入仓（TRIAGE 机录 + tracker 终态 + EV-122 + R0/R1 双 review 机录） |
| 4 | `7dc78fe` | EVO-013 TPA 调用快照机写留痕（M7.4） |
| 5 | `9c3ee78` | FIX-022 治理入仓（TRIAGE/R0 机录 + EV-123/124 + 台账增补） |
| 6 | `4608413` | EVO-014 治理入仓（TRIAGE + R0/R1/R2 三机录 + EV-125）——含 `.governance/tmp-repro-014.mjs` 入仓（见 §2.3 卫生项） |
| 7 | `06ada14` | FIX-023 治理收尾（R0 机录 + EV-127 + 计数勘误 41/41） |
| 8 | `5988286` | FIX-024 治理入仓（TRIAGE + EV-128 + FIX-023 终态收口） |
| 9 | `017a3fc` | FIX-024 治理收尾（R0 APPROVED 机录 + EV-129） |
| 10 | `7f68c96` | FIX-025 治理收尾（R0 机录 + EV-131 + 取证脚本清理） |
| 11 | `3578d28` | FIX-026 治理收尾（R0 机录 + EV-133）——附带 `tests/served-client.js` 镜像同步 +342（质量网资产，随轮闭环 R0 P2-1） |
| 12 | `d29bc4a` | FIX-027 治理收尾（R0 机录 + EV-135 + 探针清理 + 锁释放） |
| 13 | `07c8d94` | **GOV-005**：P-v3 原则落版（新增 P10 用户报障受理与验证纪律·指令式五条 + P5 强化单路径收敛）+ **DEC-028** 入账 + AGENTS.md 投影同步 |
| 14 | `6a5f029` | **GOV-006**：预设功能链终态归档（EV-136~138 + DEFERRED-001 挂账 + 重启失步缝隙台账 + 用户裁决留痕） |

> 待入账增量：工作区未提交的 `.governance/evidence-log.md` + `.governance/plan-tracker.md`（TRIAGE-REL-008 机录 + tracker 行）——E-1 前以治理 commit 入账，随版携带；E-1 bump commit 本身亦入本账。DOC-001 `2e1cdf8` 已入 HEAD 并计入产品面（§2.1 #15）。最终三分账以 E-1 git log 实采为权威（先例：v0.3.0 86-commit 三分账 EV-084 / v0.3.1 12=7+5 EV-087 / v0.4.1 产品 30+治理 16）。

### 2.3 披露面（随 Release notes / CHANGELOG 已知问题节发布）

| # | 披露项 | 内容与来源 |
| --- | --- | --- |
| 1 | **DEFERRED-001**（宿主域挂账，用户裁决 2026-09-02 暂不处理） | header 无预设形态的会话上 GUI 预设下拉切换不产生 agentPreset.select 请求（用户 F12 Network 零请求行实证；EV-138 三方探针 + 同会话直发 RPC 双确认）——**插件链路无责**；规避 = 该形态会话用「新建会话选预设」或任意一次直接切换动作即恢复跟随；申报证据链完备待用户启动 | plan-tracker 待办行（:102）；GOV-006 行（:64） |
| 2 | **重启恢复失步缝隙**（EV-137 观察） | 带切换历史的空白老会话重启后状态可能不是最后预设配置（resume 链 header 无预设 + 事件重放交互缝隙）——**切一次即恢复**；随后续批次或宿主申报处理 | plan-tracker 待办行（:103） |
| 3 | **P3 台账批（随版披露，不阻发布）** | ①EVO-013 台账（R1 裁入）：F-4 parent 查询失败显式覆盖保护降级披露 / F-5(b)(c)(e) 测试缺口三处 / F-6 liveDefaultSelection 双份实现去重 / F-7 composedPreset {id} 防御死代码 / N-1 判别断言头部索引 / 观察项：已配置条目卡不显示 broken 状态；②FIX-022 台账（R0 裁入）：fixture isDefault 全同构 / 缺域 throw 诊断路径直接测试场景；③EVO-014 NF-2 P3 观察项；④FIX-023 P2×2/P3×2；⑤FIX-025 P3×3（计数口径 51 / 覆盖观察 / 回落可选加固）；⑥FIX-027 P3×6 | plan-tracker 候选行（:61）+ 各任务行 |
| 4 | **v0.4.1 候选批（记录待排期，本版不承载）** | 路由体验优化×2（目录段同源去冗余 / fetch failed 自动重试）+ AUDIT-001 台账（P1×3/P2×13/P3×23）——v0.4.2 后续批次消化 | plan-tracker 候选行（:60）；CHANGELOG v0.4.1 节（:22） |
| 5 | **CI 面缺**（RISK-001 披露延续） | 无持续集成自动化；回归保护 = 本地全量测试网——CHANGELOG 已知问题节延续核对列 E-1 | CHANGELOG v0.4.1 节（:37）；risk-log:5 |
| 6 | **README 空白判据注记滞后**（残余一处，见 §7 P-2；R0 F-3 收窄） | README L101 括号注记「（无请求日志）」作为「空白会话」判据定义仍为 FIX-025 前口径——实现已同构 sessionBlank（session.events 无 turn/start 即空白，判据更宽——含带标题/命令但从未发消息的会话）；L99/L104「日志锚定」为宿主原生行为正确描述**非缺陷**；L104 已含空白预设会话重启播种披露（FIX-025 台账项已部分落地）——E-1 收口仅修正 L101 注记一处 | README 实读 L96-104（DOC-001 刷新后现盘）vs FIX-025 行（:69） |

### 2.4 本次明确不发布什么（防 scope creep）

| 项 | 来源 |
| --- | --- |
| EVO-013~027 P3 台账修复落地 / v0.4.1 候选路由体验优化×2 / AUDIT-001 P1×3/P2×13 消化 | plan-tracker 候选行（:60-61）——本版仅披露不承载 |
| DEFERRED-001 修复（宿主 GUI 域——本仓不可修） | 用户裁决 2026-09-02（EV-138）；本版仅披露 + 规避指引 |
| 重启失步缝隙根治 | plan-tracker（:103）——随后续批次/宿主申报 |
| CI 面建设（G4/RISK-001） | 先例 DEC-025 D-3a 带披露发布；另行排期 |
| C-4+C-5 成功率闭环 / FIX-008 域 / FIX-281 插件仓修复 | plan-tracker（:54/:105） |

---

## §3 版本语义（0.4.1 → 0.4.2，MINOR）

1. **变更性质**：向后兼容的**新能力面**——预设 Agent 默认模型全链（EVO-013 配置 UI + EVO-014 事件驱动播种 + FIX-022~027 修复链收口）+ 治理资产（无用户面）。semver：MINOR = 向后兼容的新增功能；PATCH = 缺陷修正。本版含完整新功能面（新配置节 + 新设置卡片 + 新事件行为），MINOR 判定成立（v0.4.0 先例：EVO-009/010 功能面 = MINOR）。
2. **无 breaking 四证**：
   - ① **配置面**——`router.presets` 为**新增配置节**（schemas.js:301，`z.dict(presetDefaultSchema).default({})`——缺省空字典）：旧配置零迁移零阻塞；功能不配置时零行为变化（README L101「未设置 = 完全遵循 DSH 现行规则」）；
   - ② **依赖面**——deps/peerDeps 逐项零变更（`git diff v0.4.1..HEAD -- package.json` 实采：仅 files 列表 +1 行，打包完整性只增不减）；pnpm-lock 零变更；
   - ③ **数据面**——无既有 Schema/存储格式变更（预设配置为新命名空间，不触碰 oauthAccounts/统计 JSONL/凭据文件）；
   - ④ **行为面**——默认层选择权在三层主权保护之下（picked/header 优先，仅空白会话、仅预设事件、无模型变更监听——EVO-014 用户三原则）；已运行会话/显式指定模型的子代理不受影响（README L101-102）。
3. **不跳号**：0.4.1 → 0.4.2 相邻 MINOR；不选 0.4.1-patch 形态（tag v0.4.1 已发布不可重打）；不选 0.5.0（无 breaking、无主题断层）。
4. **版本号最终随用户发布授权确认**（DEC-143）——本论证为建议输入。

---

## §4 发布门禁（E-1 ~ E-7 清单）

> 逐项全 PASS 方可进入 tag/push；任一 FAIL 阻断。每项结果 EV 留痕。release-checklist / rollback-plan 资产随执行段按三件套惯例产出（v0.3.0 先例）。

| 门禁 | 内容 | 判定方式 | 现状 |
| --- | --- | --- | --- |
| **E-1 bump + CHANGELOG** | package.json 0.4.1→0.4.2 + README 徽章/安装命令同步 + CHANGELOG **创建 v0.4.2 节**（现态以 v0.4.1 收尾，无未发布段）；**前置项——DOC-001 终态闭环核验**（机录在案确认：tracker :63 终态 + R0 APPROVED_WITH_NOTES/0 机录——未闭环任务不得随版）+ README 空白判据注记修正（L101 一处——§2.3 #6）+ DOC-001 R0 P3×2 小修批（简介枚举自含性 + 通路切换重选组括注——tracker :63）+ 未提交治理记录先行入账。新节起草要点：**主题一用户可见行为**（预设 Agent 卡片——按 DSH 预设配置新会话/subagent 默认模型、打开即显示、空白切换实时跟随、subagent 继承、全局默认瞬态写回恢复、串行化队列）+ **主题二治理**（P-v3 原则升级一句带过——用户面弱表述）+ **已知问题披露三条**（DEFERRED-001 + 重启失步缝隙 + 台账批/P3 台账延续）+ 「破坏性变更：无」四证显式节（§3） | git log 实采三分账对照 + 逐项核对记录 | ⏳ PENDING（执行段） |
| **E-2 全量门控复跑** | 命令清单（node tests/ 全量，exit 0 零回退）：**smoke**（含 EVO-013 通道 7 断言）/ **routing-paths** / **stats** / **metrics** / **adapter-parity** / **oauth-credentials** / **oauth-promotion** / **oauth-loopback** / **oauth-main-model** / **preset-defaults**（41 断言基线）/ **client-render**（207 断言基线；渲染级看护经 smoke 通道复核）/ **attachments** / fix-009 / fix-010 / fix-012 / rpc-shadow-guard / audit-001 / audit-001-concurrency / install-entry——共 19 文件实采清单；canonical 口径先例 REL-007 十七面 / EVO-013 十八面，以 Coordinator 实跑清单为准并在 EV 行记录面数 | 无沙箱复跑 exit 0 + 断言数实测留痕 | ✅ 在案基线多轮全绿（§1.3）；**E-2 复跑 ⏳ PENDING** |
| **E-3 tarball 隔离冷装** | npm pack → TEMP 解包 → **DSH_HOME 重定向临时目录**安装 → **import OK 必验**（FIX-014 教训——v0.3.0~v0.3.2 历史教训：只验版本不验 import = tarball 不可用）：断言 version 0.4.2 / **lib 15 模块全 import OK**（14+新增 **preset-defaults.js**——复数，R0 F-1 更正；files 清单 lib 段 15 项与 lib/ 目录逐字清点对照——FIX-014 判别先例）/ peerDeps rc.8 / files 清单含 lib/preset-defaults.js / 真实环境零变更 | 隔离环境安装冒烟记录——**措辞纪律：「隔离环境安装冒烟（环境变量重定向至临时目录）通过」；无限定语「真实安装/真实环境」= 违规措辞** | ⏳ PENDING（先于 tag，未验证产物不打 tag） |
| **E-4 Release Reviewer R0** | 对本规划 + E-1 资产 + E-2/E-3 留痕独立审查；**no-overclaim 锚点**：①打开即显示/切换跟随仅限用户复验在案场景（新会话六连切 + 两老会话直切 = EV-136/137；其余形态如实披露）；②DEFERRED-001 写明「宿主域、插件无责」而非模糊表述；③隔离验证措辞纪律（§4 E-3）；④不声明生产就绪；⑤实测数字以 E-2 复跑值为权威，不沿用旧值宣称；⑥规划 ≠ 决策（发布时点/Go = 用户） | review-record 机器落盘；NEEDS_CHANGE → 返工 → 复审（T1，round<3）；**复审 MUST 逐条比对前轮 findings 修复状态并标注已修复/未修复/新引入**（本规划前轮 = R0 F-1/F-2/F-3/N-1，报告 `.governance/review-report-REL-008-R0.md`）；仅 APPROVED 或 unresolved_blockers=0 的 APPROVED_WITH_NOTES 为通过终态 | ⏳ PENDING |
| **E-5 tag / push / GitHub Release** | **用户授权后**执行：annotated tag v0.4.2（v0.3.1 起先例）→ push main（27+ commits）+ push tag → gh Release 创建（assets 含 tarball，非 draft） | tag/远端 tag/Release 一致 + 授权留痕 | ⏳ PENDING（DEC-143 用户授权点） |
| **E-6 归档检查** | `python <plugin_home>/infra/archive.py migrate --auto --dry-run`（`<plugin_home>` 来自 resolve_entry.py）；触发则 migrate + `check-archive-integrity`，失败阻断发布完成。预判：已发布版本计数 ≥2 且热文件历史 task 存量可归档——**以实跑为准，预判不写死**（v0.3.0~v0.4.1 先例曾因工具计数口径跳过——FIX-281 域观察延续） | 机器输出留痕 | ⏳ PENDING（发布收尾段） |
| **E-7 用户重启验收** | 重启 DSH 后按 §8 验收标准逐项验证（预设卡片 CRUD / 新会话跟随 / 老会话切换跟随 / subagent 继承 / 已知面规避确认）；含 FIX-025 老会话场景待复验闭环 | 用户验证留痕（EV + 截图按需） | ⏳ PENDING（发布后） |

### 4.1 Feature Flag 状态（无新增 flag）

| Flag | 缺省 | 状态 |
| --- | --- | --- |
| `router.presets` | `{}`（空字典） | **非开关、是配置节**——无灰度语义；不配置 = 零行为变化（回滚锚点见 §6.2） |
| `router.takeoverDefaultModel` / `router.stats.persist` | false / true | 既有，本版零变更 |

发布策略沿本仓先例：**Big-Bang + kill-switch ①层兜底**（`router.enabled` 总开关——route_agent 拒绝调用，预设功能依附 router 服务面随之失效）+ 48h 观察期。无新增 flag、无灰度机制——不虚构渐进放量。

---

## §5 里程碑

> 交互边界：用户发布授权（Go/No-Go + tag/push/Release 逐项）为唯一用户决策点（DEC-143）；其余自动/受控执行。

| 里程碑 | 内容 | 出口判据 | 边界 |
| --- | --- | --- | --- |
| **PM-0 规划段**（本文件） | version-plan 八节 + 三分账 + 门禁/风险/回滚 + 发布时点建议 | §7 自检清单全过 | Release Agent（自动） |
| **PM-1 Release Reviewer 审查** | 对本规划独立审查（发布计划完成后必须进入审查——角色硬门槛） | APPROVED / APPROVED_WITH_NOTES（unresolved_blockers=0）；NEEDS_CHANGE → T1 复审（round<3）→ round≥3 转 BLOCKED 升级 | review-record 机录 |
| **M-1 用户发布授权点** | ask_user_question 呈报：D-1 版本号确认（MINOR 0.4.2 建议）/ D-2 Go-No-Go / D-3 tag+push+Release 逐项授权 / D-4 发布时点 | 授权留痕（decision-log/会话记录） | **用户决策点（DEC-143）** |
| **M-2 发布执行**（授权后） | E-1 → E-2 → E-3 → E-4 → E-5 → E-6 一次走完（顺序约束：冷装先于 tag） | 每步 EV 留痕；E-2/E-3/E-6 全 PASS | 授权后执行（maximum-autonomy 域内） |
| **M-3 发布后验证** | E-7 用户重启验收（§8）+ 48h 观察期（安装链路 + 预设全场景冒烟 + kill-switch ①层复跑 + 宿主 junction 观察） | §8 验收留痕 + 观察期无 P0/P1 | 用户动作 + 自动观察 |
| **M-4 治理收尾** | 治理记录入仓 + 归档检测复核 + tracker 路线图 v0.4.2 行更新（已发布）+ 风险状态注记 + `.governance/tmp-repro-014.mjs` 卫生处置（§7 P-3） | 归档 integrity PASS（若触发迁移）+ tracker 一致 | 自动（Coordinator） |
| **M-5 版本复盘** | P-vN 演进检查 + 完成必推荐（task-priority-analysis——从 unblocked + 最高优先级未完成任务推荐 1~3 候选：v0.4.2 候选批台账等） | 复盘记录入仓 | 自动（Coordinator）+ 用户确认下一步 |

---

## §6 风险与回滚

### 6.1 风险登记（发布面——引用 + 处置，不新开不重开）

| 风险 | 等级 | 与 v0.4.2 的关系 | 处置 |
| --- | --- | --- | --- |
| **RISK-001** CI 面缺（活跃） | 中 | 四轮带披露发布先例（v0.2.1~v0.4.1）；保护 = 本地 19 文件全量测试网 | 持续披露（E-1 已知问题节延续）；另行排期 |
| **RISK-003** 宿主接口演进无预警（活跃） | 高 | **本版宿主触面大**（roster 域名/sessionBlank 判据/modelDirectories inject 三处宿主契约对齐）——宿主再漂移时三处判据需 parity 看护；FIX-022 P9 三层防御 + FIX-027 双形态解析已内建防御 | adapter-parity 看护 + preset-defaults 判别测试网；宿主再漂移 = 回归触发条件 |
| R-v1 预设功能真机残余面（DEFERRED-001 + 失步缝隙） | 低（已知可规避） | 用户已裁决挂账；规避方式明确（§2.3 #1/#2） | 随 Release notes 披露 + E-7 验收时现场规避确认；不阻发布、不构成本版回滚触发条件 |
| R-v2 全局默认瞬态写回窗口 | 低 | 播种成功且恢复正常时全局默认不变；异常时自动重试一次 + 高声告警提示手动改回（README L103-104）；fire-and-forget 毫秒级窗口首请求可能短暂走全局默认 | 披露（CHANGELOG 主题一节 + README 已知行为段）；串行化队列看护（EVO-014 F-1） |
| R-v3 README 空白判据注记滞后（L101 一处） | 低 | §2.3 #6——L101 括号注记与 FIX-025 后实现不一致（非代码缺陷；L99/L104「日志锚定」为正确宿主语义非缺陷；L104 播种披露已部分落地） | E-1 收口仅修正 L101 注记（列入门禁项）；不独立阻发布 |
| P3 台账批 | 低（不阻发布） | §2.3 #3 全列 | 台账维持 + 披露；后续批次消化 |

### 6.2 回滚方案（三阶段）

| 阶段 | 窗口 | 动作 | 耗时 |
| --- | --- | --- | --- |
| 一 | push 前（执行段任一步失败/叫停） | 中止执行序列 + 本地清理（revert bump commit / `tag -d` / tgz 清理） | 分钟级（<5min） |
| 二 | push 后（已 tag/已 Release） | **预设功能回滚 = revert 功能 commits**（§2.1 #1-14 按功能域分组 revert）+ revert bump commit → 全量测试网复跑 → 前滚修复（下一版本承载，默认建议）或整体回退重发（按用户裁决） | 15–30min |
| 三 | 用户侧（安装态，junction 面） | 开发树 checkout v0.4.1 + 重启（junction 随动）/ v0.4.1 tarball 重装 | 分钟级 |

**回滚安全论证**：`router.presets` 为新增配置节——功能 commits revert 后**残留配置键无消费者、零行为**（schemas 恢复为无此节，旧配置文件中的 `presets` 键被容忍透传——本仓 settings 遗留键容忍语义先例）；预设链 revert 不触碰 OAuth/统计/凭据域（文件触面正交，§2.1 diff 实采）。**顺序约束**：revert 需按依赖序（FIX-023→024→025→026→027 为同文件演进链，建议整组同 revert；EVO-013 机制 commit 含 files 列表行，revert 后 lib 清单回落 14——tarball 重打包需复跑 E-3 import 断言）。数据兼容性：回滚无数据冲突（新命名空间，无迁移）。

---

## §7 发布时点建议（建议，非决定——DEC-143）

**建议：承载面任务全终态（含 DOC-001；待收口项随 E-1——§1.4）+ 门控在案多轮全绿，随时可发布；建议在 E-1 文档收口完成后、用户在场可重启验收的窗口执行**（E-7 验收需用户重启 DSH）。

依据：①EVO-013/014 + FIX-022~027 全部「开发+审查+用户复验三终态」（plan-tracker 直采——其中 FIX-025 老会话场景复验与 FIX-024 显示面终验并入 E-7 发布后验收，已列入 §8）；②判别测试链完整（旧实现必败防复活）；③已知面均有披露与规避路径（DEFERRED-001/失步缝隙）；④无 breaking、无依赖面变更（§3 四证）。

**建议用户验收项（E-7，重启 DSH 后）**：
1. 设置 → Agent 路由 →「预设 Agent」卡片 CRUD（添加模板下拉选 DSH 预设 / 主模型 + subagent 模型配置 / 折叠展开 / 删除）；
2. 新建会话（选已配置预设）→ 模型选择器**立即显示**预设默认模型（无需发消息）；
3. 老会话切换预设 → 显示跟随（含 FIX-025 场景：带标题/命令但从未发消息的老空白会话）；切到无配置预设回落全局默认；
4. subagent 未设预设模型时继承主预设模型；
5. 已知面确认：DEFERRED-001 形态会话（header 无预设）GUI 切换不发请求——规避路径（新建会话选预设/直接切换一次）生效；重启失步缝隙切一次恢复。

### 规划期问题（本规划发现——如实呈报）

| # | 问题 | 处置建议 |
| --- | --- | --- |
| P-1 | 工作区未提交 `.governance/evidence-log.md` + `plan-tracker.md`（TRIAGE-REL-008 等）——发布范围将携带未入账治理记录 | E-1 前以治理 commit 入账（Coordinator 域） |
| P-2 | README 空白判据注记滞后——**现盘收窄为一处**（R0 F-3）：L101 括号注记「（无请求日志）」仍为 FIX-025 前口径（实现 = session.events 无 turn/start，判据更宽）；L99/L104「日志锚定」为宿主原生行为正确描述非缺陷；L104 已含空白会话播种披露（FIX-025 台账项部分落地——DOC-001 刷新期落地） | E-1 收口修正 L101 注记一处（§4 E-1）；行号以现盘为准 |
| P-3 | `.governance/tmp-repro-014.mjs` 临时取证脚本已入仓且 HEAD 仍在（4608413 携入；后续「取证脚本清理」commits 未清到此件） | M-4 治理收尾处置（删除或移入明确目录），不阻发布 |
| P-4 | 任务书引用先例路径 `.governance/version-plan-v0.3.0.md` 不存在——实际先例位于 `docs/release/`（v0.3.0/0.3.1/0.3.2） | 本稿按任务指定路径落 `.governance/`；落位不一致已声明（头表「写入边界」），归档位移留 M-7 裁决 |
| P-5 | commit 归属两处混合：`afa6ddc`（FIX-023 代码与治理记录同车，标题仅述治理）/ `3578d28`（治理收尾附带 tests/served-client.js 镜像 +342）——三分账归类已按 diff 实采消歧 | 已在 §2.1/§2.2 注记；E-1 实采三分账时沿用本稿归类并复核 |
| P-6 | **DOC-001 范围漂移（R0 F-2 揭出，已处置）**：规划 R0 稿漏记 DOC-001（`2e1cdf8` README 功能面刷新）——产品面台账 14→15 补入账（§1.4 行 / §2.1 #15）、E-1 增列终态闭环核验前置项（§4 E-1）、「承载面全终态」表述改写（§1.4）；DOC-001 本体已终态（tracker :63，R0 机录在案） | 已在本 R1 修订版入账闭合；E-1 git log 复采为权威，防同类漂移复采时逐一核对 |

---

## §8 验收标准（发布有效性判定）

| # | 标准 | 判定 |
| --- | --- | --- |
| 1 | E-2 全量门控复跑 exit 0，断言数 ≥ 在案基线（smoke ALL PASSED / preset-defaults ≥41 / client-render ≥207）零回退 | EV 留痕 |
| 2 | E-3 隔离冷装通过：version 0.4.2 + **lib 15 模块 import OK** + files 清单含 lib/preset-defaults.js（复数）+ 真实环境零变更 | 隔离安装冒烟记录（限定措辞） |
| 3 | E-4 Release Reviewer 通过终态（APPROVED 或 APPROVED_WITH_NOTES/0）；no-overclaim 六锚点无违例 | review-record 机录 |
| 4 | tag v0.4.2 / 远端 tag / GitHub Release（assets 含 tarball，非 draft）三者一致 | 发布执行留痕 |
| 5 | CHANGELOG v0.4.2 节四段齐（主题一用户行为 / 治理 / 已知问题披露三条 / 破坏性变更：无·四证）且与 git log 三分账对照无遗漏 | E-1 核对记录 |
| 6 | §8 E-7 用户验收项 1-4 PASS（验收项 5 为已知面现场确认，不 PASS 不阻已发布事实——按披露口径处置） | 用户验证留痕 |
| 7 | E-6 归档检查留痕（触发则迁移 + integrity PASS） | 机器输出 |
| 8 | 治理收尾：tracker 路线图 v0.4.2 行已发布 + EV 行齐 + tmp-repro-014.mjs 处置完成 | M-4 留痕 |

---

## 自检清单（硬门槛逐项核对）

| 检查项 | 结果 |
| --- | --- |
| 发布范围与 plan-tracker 任务终态/路线图一致（零编造——29 commits 逐 SHA git 实采 + 6 处规划期问题如实呈报；R0 F-1~F-3/N-1 已修复） | ✅ |
| 范围三分账完整（产品 15 = 14 预设链 + DOC-001 文档面 / 治理 14 / 披露 6 项；「本次不发布什么」显式记录 §2.4） | ✅ |
| semver 合规：0.4.1→0.4.2 MINOR 论证充分（§3：新能力面 + 无 breaking 四证 + 不跳号；版本号终决随用户） | ✅ |
| 发布门禁 E-1~E-7 全列 + E-2 命令清单 + E-3 FIX-014 教训 import OK 必验（lib 15）+ 隔离验证措辞纪律 | ✅ |
| 风险不关闭不重开（RISK-001/003 引用；已知面披露与规避路径齐） | ✅ |
| 回滚三阶段 + 预设功能回滚安全论证（残留键零消费）+ revert 顺序约束 | ✅ |
| 发布决策/tag/push 全部标注待用户授权（§4 E-5 / §5 M-1 / §7；DEC-143） | ✅ |
| No-overclaim 锚点（§4 E-4 六点）：复验口径如实 / 宿主域责任清晰 / 实测数字以复跑为权威 | ✅ |
| 唯一写入目标 = 本文件；未修改产品代码/CHANGELOG/package.json/.governance 既有文件；未 git commit；未创建子 agent；未与用户交互 | ✅ |
