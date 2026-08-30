# dsh-agent-router v0.3.2 版本规划（version-plan）

| 项 | 值 |
| --- | --- |
| Task ID | REL-005（P1，v0.3.2 发布链——**规划段**；发布执行在 M-4 用户授权后另段执行） |
| 文档类型 | 版本规划（Release Agent 产出，stage-release 子工作流；本仓结构先例 = version-plan-v0.3.1.md 八节） |
| 日期 | 2026-08-30 |
| 状态 | 规划稿（待 Release Reviewer 审查 → M-4 用户发布授权；发布决策/tag/push 一律待用户授权，DEC-143 交互基线） |
| 规划目标版本 | **v0.3.2**（0.3.1 → 0.3.2，**PATCH**——论证见 §2.2；版本号最终随 M-4 用户确认） |
| 事实源 | `.governance/plan-tracker.md`（路线图 v0.3.1 行 :132 + REL-005 任务行 :39）、`.governance/evidence-log.md`（EV-088/089/090/091）、`.governance/review-FIX-009-R0.md` + `-input.md`、`.governance/review-FIX-010-R0.md` + `-input.md`、`.governance/review-EVO-007-R0/R1.md` + `-input.md`、`.governance/review-REL-005-R0.md` + `-input.md`、`CHANGELOG.md`（现态以 v0.3.1 节收尾——无未发布段）、`docs/release/version-plan-v0.3.1.md`（结构先例）、`docs/release/feature-flags-v0.3.0.md`（§1/§3/§4/§5 转正注记）、`.governance/risk-log.md`、`README.md`（实读 L20/L84/L108/L111/L112/L113/L129）、`package.json`（实读） |
| Git 事实声明 | 本 Agent 无命令执行权限（角色定义约束）——commit 级事实取自任务书权威输入 + 审查链实采留痕（review-REL-005-R0-input.md 实采 `ahead 12 of origin/main`）；未自行采集 git log；**M-5 执行段 CHANGELOG 收口时 MUST 以 git log 实采对照**（v0.3.0 先例：86-commit 三分账，EV-084；v0.3.1 先例：12=7+5，EV-087） |
| 本仓适用性边界 | SKILL 原文 check-release / release-ledger / release-projection / quality-tools / declarative manifest（ADR-010）为治理插件仓专用工具链，**不适用本仓**——发布门禁按 v0.2.1/v0.3.0/v0.3.1 先例（REL-001/REL-003/REL-004/EV-084/EV-086/EV-087）本仓四项口径（§3） |

---

## §1 版本基线与事实快照

### 1.1 版本基线

| 项 | 事实 | 来源 |
| --- | --- | --- |
| 当前已发布版本 | **v0.3.1**（annotated tag，peel = `5ca8b87`，2026-08-30，GitHub Release + tarball 1,507,454B） | plan-tracker 路线图行 v0.3.1（:132）；EV-087 |
| package.json version | `0.3.1`（bump 至 0.3.2 属 M-4 授权后执行段，Developer 载体） | package.json:4（实读） |
| main 领先发布点 | **ahead 12 commits**（review-REL-005-R0-input.md:8 实采「ahead 12 of origin/main」）。构成（任务书权威输入）：产品段 5 commits——`8877365` FIX-009 / `020909b` FIX-010 / `65226a3`+`3665d6a` EVO-007（实现+T1 返工）/ `1d2bf36` REL-005 收尾段 + 治理 commits 8 枚（`d92dfba`/`ec94a6c`/`0c7f987`/`49ac8ab`/`0234a88`/`ed229db`/`b664f52`/`6877389`）+ 待 E-1 bump；**逐 commit 完整清单与三分账以 M-5 执行段 git log 实采为准**（点名合计 13 枚 vs ahead 12 差 1——§7 核对 #3 待实采消歧） | review-REL-005-R0-input.md:8；任务书权威输入；plan-tracker:39（REL-005 行「ahead 11」为收尾段 commit 前陈旧值——以审查实采 ahead 12 为准） |
| 依赖面变更（v0.3.1 后） | **零**——FIX-009/010/EVO-007/收尾段全部产品 commits 均未触碰 package.json（review-REL-005-R0「无 bump（package.json/CHANGELOG.md 未触碰——发布段预留）」+ package.json 现态实读 = 0.3.1 同面）——v0.3.2 tarball 依赖面与 v0.3.1 完全一致（undici ^7.18.0 / peerDeps 8×^0.1.0-rc.8 / files 11 维持） | review-REL-005-R0-input.md §四；package.json:27-57（实读） |
| 宿主面 | 无新增漂移证据；peerDeps 8×rc.8 维持；adapter-parity 14 于 EV-090 复跑全绿；deepseek-official 视觉端点挂起（227s/0token）为宿主/端点域现象（vision 旁路 glm 可用，本仓不可修——§5.1 如实披露） | EV-090；EV-088 用户验证项 |
| 治理面 | 当前阶段 development（6/11）；G4/G5 pending；RISK-001 活跃（CI 面）；check-governance 已知 issues 均为插件仓 FIX-281 已申报域 + 非阻塞 WARN（v0.3.1 披露口径延续——§5.1 如实披露） | plan-tracker 项目总览/Gate 表；risk-log:5；任务书权威输入 |

### 1.2 任务终态快照（v0.3.2 相关，零编造）

| 任务 | 终态摘要 | 与 v0.3.2 的关系 |
| --- | --- | --- |
| FIX-009（P0） | ✅ 全闭环含用户复验（2026-08-30）——RCA 三案全破（400 主线根因 = wrapper.js 深改写把 image-solo user 消息改写为 `content:[]` → GLM 端点 400/1213；227s 证伪 = 用户手动中止；实验界面破案 = 存量 preset 账号名）+ 修复 `8877365`（wrapper.js 导出 `IMAGE_SOLO_PLACEHOLDER` + stream 改写点对空 content 注入最小 text part——仅 image-solo 触发/非空零注入/P5 单点/P8 无吞错）+ tests/fix-009-image-solo.mjs 9 断言（A1-A4 注入形态/B1-B2 对照组零注入/C1-C3 4xx 快速失败守卫）+ R0 APPROVED_WITH_NOTES/0；**用户复验通过**（纯图占位接收成功）；EV-088 | **v0.3.2 主题 ①**（多模态双修之一） |
| FIX-010（P0） | ✅ 全闭环含用户复验（2026-08-30）——RCA 全实证（prestep options 快照误判 + GUI 写回默认模型 + 重启引爆 → 逃生组改写污染会话日志 → 气泡图片消失）+ 修复 `020909b`（prestep 判定序 requestHeader 优先 + options 回落——与宿主 selectionFor 对齐）+ tests/fix-010-gui-fidelity.mjs 9 断言 + **DEC-027 三不变量立版** + R0 APPROVED_WITH_NOTES/0（P1-1 回落层 live default 对齐入 v0.3.2 台账）；**用户复验通过**（「气泡显示已经正常」）；EV-089 | **v0.3.2 主题 ②**（多模态双修之一；P1-1 随收尾段闭环） |
| EVO-007（P1） | ✅ 全闭环——R0 NEEDS_CHANGE（F-1 P1 非 preset OAuth 账号删除路径消失——P7 数据主权 + F-2 死文案）→ T1 返工 `3665d6a`（双入口：池行 danger 按钮 + 高级扩展孤儿兜底列表，共用 deleteOauthAccount 原子提交；R8-F1 重写 14 断言组可删语义）→ **R1 APPROVED_WITH_NOTES/0（T1 闭环）**；Coordinator 12 套件实测全绿（smoke 963）；**用户 GUI 验证 2/3 PASS**（布局 ✓ OAuth 区块消失 ✓；点③删除按钮空态无载体以 R1 断言证据闭环——vision 识别 sha256:bcff4e35）；EV-090/091 | **v0.3.2 主题 ③**（账号面板 UX） |
| REL-005 收尾段（P1） | ✅ `1d2bf36`（5 files +111/-20——lib/prestep.js、tests/fix-010-gui-fidelity.mjs、tests/fix-009-image-solo.mjs、.gitignore、README.md）+ R0 APPROVED_WITH_NOTES/0（P2-1 治理记录补录闭环 + P3×3 台账）——P1-1 prestep 回落层 live default 对齐（header → liveDefaultSelection(ctx) → options 终回退，与宿主 selectionFor 三层同源同时效；fix-010 判别 9→13）+ P2-2 fix-009 测试 hygiene（mkdtemp + try/finally + .gitignore glob）+ README OAuth 口径收口（5 处）；EV-091 | **v0.3.2 范围**（收尾闭环随本版承载） |
| REL-004（v0.3.1 链） | ✅ 发布完成（EV-087）——M-4 Go → E-1~E-7 全链；tag v0.3.1@5ca8b87 | 先例参照（结构/口径）；不在 v0.3.2 范围 |

### 1.3 测试基线（**门控基线权威——任务书权威输入 + EV-090 Coordinator 实测 + EV-091 Developer 申报/R0 静态核验**）

| 套件 | 结果 | 备注 |
| --- | --- | --- |
| tests/smoke.mjs | **963 ok / 1 skip / 0 fail / exit 0** | EV-090 Coordinator 实测（951→+12 与申报一致）；skip 计数口径以 E-2 复跑实测为准 |
| tests/stats.mjs | 110 / 0 | |
| tests/routing-paths.mjs | 114 / 114 | 含 ① 层看护 C13/D8b |
| tests/adapter-parity.mjs | 14 / 14 | 宿主 rc.8 契约对齐 |
| tests/attachments.mjs | 65 / 65 | |
| tests/oauth-credentials.mjs | 98 / 0 | |
| tests/oauth-loopback.mjs | 20 / 0 | |
| tests/client-render.mjs | exit 0 | 渲染级看护（接线计数在 smoke 内） |
| tests/oauth-promotion.mjs | 13 / 13 | 判别组（旧语义必败）+ 关闭能力组（B1~B4） |
| tests/metrics.mjs | 31 / ALL PASSED / exit 0 | D-1 观测 31 项 |
| tests/fix-009-image-solo.mjs | **9 / 9** | 判别组（A1-A4/B1-B2/C1-C3）——并入规范门控清单（EV-088 裁决） |
| tests/fix-010-gui-fidelity.mjs | **13 / 13** | 判别组（A/B/C/D/E——E 组 4 断言随收尾段 1d2bf36 新增，9→13） |

来源：任务书权威输入 + EV-090（Coordinator 实测 12 套件）+ EV-091（收尾段后 Developer 申报 + R0 静态核验断言计数 9/13 一致）。**M-5 执行段 E-2（M-3' 门控复跑）Coordinator 全量复跑 12 套件 MUST 至零回退（RG-1）。**

---

## §2 版本范围表与 semver 论证

### 2.1 入槽清单（in-slot——每项带来源留痕）

| # | 变更项 | 类别 | 来源留痕 |
| --- | --- | --- | --- |
| S-1 | **FIX-009 image-solo 400 修复**：lib/wrapper.js 深改写路径对 image-solo 纯图消息注入最小 text 占位（`IMAGE_SOLO_PLACEHOLDER`——仅空 content 触发、非空零注入、历史轮同修、P5 单点 wrapper.js:365、P8 无吞错）；判别测试 9 断言（注入形态/对照组零注入/4xx 快速失败守卫）；并案「实验界面残留」破案（存量 preset 账号名，重建即消）；227s 挂起证伪（用户手动中止，非重试链） | 修复（缺陷） | tracker:36；EV-088；review-FIX-009-R0（机录 APPROVED_WITH_NOTES/0）；用户复验通过 |
| S-2 | **FIX-010 图片气泡显示回归修复**：prestep sessionProvider/sessionModel 判定序 requestHeader 优先 + options 回落（与宿主 selectionFor 对齐——picked → header → live default 覆盖 options seedConfig）；会话日志层保留原始 image 块，气泡恢复显示；DEC-027 三不变量（模态保真直传/原始输入呈现不可侵犯/全链路无感）；判别测试 9 断言 → 13（E 组） | 修复（缺陷） | tracker:37；EV-089；review-FIX-010-R0（机录 APPROVED_WITH_NOTES/0）；DEC-027；用户复验通过 |
| S-3 | **EVO-007 账号面板 UX 调整**：A 移除「OAuth 账号（官方登录）」不可用入口整块（OAuthAccountCard/AddOAuthCard + 7 死处理器 + pkce 客户端工具等 21 符号死代码链清理）+ B ChatGPT 订阅登录上移一级醒目位（与子代理字面交换）+ 高级扩展折叠区仅留账号池；T1 返工补删除路径双入口（池行 danger 按钮 + 孤儿兜底列表——共用 deleteOauthAccount：credentials.unset 幂等→全池引用清理→unset 条目→单次 mutate 原子提交）+ R8-F1 重写 14 断言组可删语义；i18n 53×2 键删除 + presetSummary 新增；oauthAccounts 数据域/池功能/Agent 卡下拉**零触碰** | 变更（UX 面——入口移除/布局调整/删除路径补全） | tracker:38；EV-090/091；review-EVO-007-R1（机录 APPROVED_WITH_NOTES/0，T1 闭环）；用户 GUI 验证 2/3 + 点③断言闭环 |
| S-4 | **REL-005 收尾段**（`1d2bf36`）：P1-1 prestep 回落层 live default 对齐（FIX-010 R0 P1-1 台账闭环——header → liveDefaultSelection(ctx) 新辅助 → options 终回退；宿主源码三级核验同源同时效）+ P2-2 fix-009 测试 hygiene（mkdtemp + try/finally + .gitignore glob）+ README OAuth 口径收口（5 处——v0.3.2 起无官方登录表单声明等） | 修复（回落层对齐）+ 测试卫生 + 文档口径 | tracker:39；EV-091；review-REL-005-R0（机录 APPROVED_WITH_NOTES/0，P2-1 补录闭环 + P3×3） |
| S-5 | 治理 commits（d92dfba/ec94a6c/0c7f987/49ac8ab/0234a88/ed229db/b664f52/6877389——审查/证据/记录入账，不入用户面；完整清单以 E-1 git log 实采为准） | 治理 | 任务书权威输入；review-REL-005-R0-input.md:8 |

**用户面语义记录**：CHANGELOG 现态无未发布段（以 v0.3.1 节收尾）——v0.3.2 节（修复 ×2 / 变更 ×1 / 破坏性变更：无 / 已知问题延续 / 版本说明）由 E-1 创建并收口（git log 实采对照；本 Agent 不触碰 CHANGELOG）。

### 2.2 semver 合规论证（0.3.1 → 0.3.2，**PATCH**——独立论证）

1. **变更性质三分（零新能力语义）**：
   - FIX-009 / FIX-010 = **缺陷修复**（image-solo 纯图 400 整轮失败、气泡图片显示回归）——行为恢复到设计意图（DEC-027 三不变量），属纯修正面；
   - EVO-007 = **UX 调整**——「OAuth 官方登录」入口移除（该入口**本就不可用**——官方 API 不提供 OAuth，README 已声明）+ ChatGPT 订阅登录位置调整（功能不变，仅上移醒目）+ 删除路径补全（v0.3.1 删除路径消失 = 回归/缺陷面，R8-F1 语义反转——恢复删除能力不构成新能力）；**无任何新能力语义**（无新通道/新协议/新配置键/新功能入口——入口只有删除没有新增）；
   - 收尾段 = 缺陷面延续修复（P1-1 回落层对齐）+ 测试卫生 + 文档口径。
2. **PATCH 语义判定（semver：PATCH = 向后兼容的缺陷修正；MINOR = 向后兼容的**新功能**）**：
   - ① **零 breaking 四证**：a) 无公共 API/协议面变更——RPC owner-only 面未动（EVO-007 仅 UI 层调用点删除，service 层 deleteOauthAccount/oauthLogout 为既有 RPC）；b) 无配置面变更——lib/schemas.js 零触碰（无键增删；settings 遗留键容忍语义与 v0.3.1 相同）；c) 数据面零变更——oauthAccounts 数据域/凭据文件/统计 JSONL 结构不变（EV-090「数据域零触碰」）；d) 依赖面零变更——package.json 现态 0.3.1 实读 + 产品 commits 未触碰（review-REL-005-R0 实证）。
   - ② **行为变化均有披露**：入口移除 = README L20/L111/L129「v0.3.2 起」三处声明（审查逐项与实现相符）；删除路径变化 = README L112/L113 区分声明（删除账号 vs 移除出池）。
   - ③ **PATCH 先例充分**：v0.2.1 为 PATCH 承载 P0 热修 ×2 + **行为修正**（FIX-002 接管缺省翻转——用户可见行为变化）+ 不可见地基——「缺陷修正 + 有披露的行为调整」由 PATCH 承载在本仓有先例。
3. **MINOR 反论否弃**：反论者称「入口移除 + 布局变化 = 用户可见行为变化 → MINOR」。但 semver MINOR 语义 = 向后兼容的**新增功能**——本版**无新增功能面**（无 v0.3.0 C-1/C-3、v0.3.1 转正式的新能力语义；唯一「新入口」= 删除按钮双入口，属缺陷补全而非新能力）。入口移除是**清理不可用面**（非能力收窄——该入口从未可用过），布局调整不改变任何功能语义。将 UX 清理/修复判为 MINOR 会混淆「版本语义级别」与「用户可见度」两个维度。
4. **不跳号**：0.3.1 → 0.3.2 相邻 PATCH；不选 0.3.1-patch 形态（tag v0.3.1 已发布不可重打——重打同号 = 「同版本号不同内容」风险，见 rollback-plan B-3 论证）。
5. **结论**：**PATCH（0.3.2）**。MINOR 为可辩护的替代选项（若用户认为入口移除+布局调整需 MINOR 语义承载——v0.3.0/v0.3.1 连续两版 MINOR 后接 PATCH 完全合规，最终以 M-4 用户确认为准）。

### 2.3 本次明确不发布什么（防 scope creep——显式记录）

| 项 | 来源 |
| --- | --- |
| **C-4/C-5 成功率闭环 + C-9 报告**（路线图 v0.3.2 行原计划） | plan-tracker 路线图 v0.3.2 行（:133）——本版实际承载以用户裁决启动的 REL-005 为准（FIX-009/010 + EVO-007 + 收尾段）；**路线图行口径与本版范围不一致，建议 M-7 收尾时更新**（§8 备注；.governance 非本 Agent 写域） |
| C-6/C-7/C-8 池泛化 / onboarding 向导 / 官方安装通道 | plan-tracker 路线图 v0.3.3 行 |
| C-2 Claude 订阅 OAuth | DEC-026 范围红线原文（「仅 GPT 通道，其余等后续我的需求」） |
| **对话内图片附件「加载失败」显示层残留（FIX-008 候选域）** | CHANGELOG v0.3.0/v0.3.1 已知问题节已披露（client imageData 译码/渲染面——与 FIX-010 的「气泡图片消失」为不同缺陷面）；本版不承载修复——收口时确认披露延续 |
| **deepseek-official 视觉端点挂起（227s/0token）** | 宿主/端点域现象（EV-088 用户验证项）——vision 旁路 glm 可用；本仓不可修，如实披露不伪装 |
| CI 面建设 | RISK-001 域——另行排期，非本版本承载（G4 pending 持续披露） |
| 插件仓 FIX-281 修复 | 插件仓会话执行（tracker:70） |

---

## §3 发布门禁（本仓四项——REL-001/REL-003/REL-004 先例口径）

> 逐项全 PASS 方可进入 M-4 用户授权；任一 FAIL 阻断。每项结果须有记录（release-checklist-v0.3.2.md 落列）。

| 门禁 | 内容 | 判定方式 | 现状 |
| --- | --- | --- | --- |
| **RG-1** | 全量测试网零回退——**12 套件**（smoke 963 ok/1skip + stats 110 + routing-paths 114 + adapter-parity 14 + attachments 65 + oauth-credentials 98 + oauth-loopback 20 + client-render exit 0 + oauth-promotion 13 + metrics 31 + **fix-009 9/9 + fix-010 13/13**（E 组后）） | 无沙箱复跑 exit 0 留痕；断言数以运行时实测为权威 | ✅ **PASS（在案基线）**——EV-090 Coordinator 12 套件实测 + 收尾段 Developer 申报 & R0 静态核验断言计数一致（9/13）；**M-5 E-2（M-3'）Coordinator 全量复跑 ⏳ PENDING** |
| **RG-2** | tarball 隔离冷装冒烟：npm pack → TEMP 解包 → 环境变量重定向安装（npm_config_cache + DSH_HOME 重定向临时目录）——断言清单见 release-checklist §冷装 runbook（v0.3.2 适配：peerDeps/依赖零变更断言） | 隔离环境安装冒烟记录（**措辞纪律：「隔离环境安装冒烟（环境变量重定向至临时目录）通过」——无限定语「真实安装/真实环境」= 违规措辞**） | ⏳ **PENDING（M-5 E-3 发布执行段跑；本规划列为门禁项）** |
| **RG-3** | GATE-8 归档触发检测（发布收尾段）：`archive.py migrate --auto --dry-run`；触发则 migrate + `check-archive-integrity`，失败阻断发布完成 | 机器输出留痕 | ⏳ **PENDING（M-7/E-7）**；v0.3.0/v0.3.1 两轮先例均跳过（工具计数口径 0<2，EV-084/087）——本次以实跑为准，预判不写死 |
| **RG-4** | check-governance 健康检查 | 判定口径 = **无本版引入的未申报阻塞项**；已知 issues 均为插件仓 FIX-281 已申报域 + 非阻塞 WARN——**如实披露，不伪装为 0**（先例：v0.3.1 同口径）；**本版新增披露面** = deepseek-official 视觉端点挂起（宿主域）+ picked 层盲区（宿主固有 P3）——如实入披露 | ✅ PASS（披露口径）——已知项在案申报；M-7 收尾段复核 ⏳ |

### 3.1 Feature Flag 状态（v0.3.2 发布面——**无新增 flag、无 flag 变化**）

| Flag | 缺省 | 状态 |
| --- | --- | --- |
| `router.oauthExperimental` | （已废弃） | v0.3.1 已退役——本版零变化；遗留键容忍透传（feature-flags-v0.3.0.md §3 注记在案） |
| `router.oauthTosAccepted` | （已废弃） | 随实验开关一并退役——本版零变化 |
| `router.takeoverDefaultModel` | false | v0.2.1 既有，本版零变更 |
| `router.stats.persist` | true | v0.3.0 既有，本版零变更 |

> v0.3.2 无新增 flag、无 flag 变化、无灰度机制——不虚构渐进放量（§6 No-overclaim #8）；feature-flags 三件套不另立 v0.3.2 新文件（沿用 feature-flags-v0.3.0.md §4 + v0.3.1 口径）。

### 3.2 发布策略（本仓形态论证——Big-Bang + kill-switch 三层兜底）

单机本地插件、无灰度基础设施——沿用 v0.3.0/v0.3.1 先例：**Big-Bang 发布 + kill-switch 三层兜底 + 48h 观察期 + 回滚预案**。v0.3.2 无 flag 面变化——三层语义与 v0.3.1 完全一致；通道级「一键全关」= `router.enabled`（①层）。

### 3.3 Kill-switch 三层验证语义（v0.3.2 无 flag 变化——与 v0.3.1 同语义；「验证过可以」，非「应该可以」）

| 层 | 关闭后行为 | 验证 | 状态 |
| --- | --- | --- | --- |
| ① `router.enabled` 总开关 | route_agent 拒绝调用 + 提示段清空 + 统计暂停 | smoke/routing-paths 既有断言（C13/D8b 看护） | ✅ 已验证（EV-090：12 套件全绿复跑） |
| ② 账号 `enabled=false` | 调用与发起授权双侧拦截并明确提示 + 池选号跳过 + 发起拒绝留痕 `account_disabled` telemetry | oauth-promotion B 组判别（B1 直连拒绝零凭据副作用 / B2 发起拒绝留痕） | ✅ 已验证（EV-090：promotion 13/13） |
| ③ 登出删除（W-5） | 删凭据文件 + 清 oauthAccounts 条目 + 清池引用；**恒可用不受任何开关门控** | 登出后文件不存在断言 + 登出×兑换竞态判别 + B4 双关闭态验证 | ✅ 已验证（EV-090：promotion 13 含 B4） |

**v0.3.2 交互注记（EVO-007）**：③层**入口形态增强**——新增池行 danger「删除账号」按钮 + 高级扩展孤儿兜底列表（仅孤儿存在时渲染），共用 deleteOauthAccount（credentials.unset 幂等 → 全池引用清理 → unset 条目 → 单次 mutate 原子提交；preset 分流 W-5）；R8-F1 重写 14 断言组（可删语义——旧实现必败）。③层**语义不变**（恒可用、不受门控），判别断言更新在案（EV-090 12 套件全绿）。边界注记（feature-flags §4 沿用）：模型发现（oauthDiscover）不受 ② 门控——管理面/使用面分界不变。

---

## §4 里程碑（规划段 → Release Reviewer → M-4 授权点 → 执行序列）

> 交互边界：M-4 为唯一用户决策点（DEC-143）；其余为自动/受控执行。

| 里程碑 | 内容 | 出口判据 | 边界 |
| --- | --- | --- | --- |
| **PM-0 规划段**（本文件） | version-plan + release-checklist + rollback-plan 三产物 | 三产物齐 + §7 零编造自检 | Release Agent（自动） |
| **PM-1 Release Reviewer 审查**（REL-005 R1） | 对三产物独立审查（发布计划完成后必须进入审查——角色硬门槛） | APPROVED 或 APPROVED_WITH_NOTES（unresolved_blockers=0）；NEEDS_CHANGE → 返工 → 复审（T1 回路，round<3） | review-record 机器落盘 |
| **M-4 用户发布授权点** | ask_user_question 呈报（§8）：D-1 版本号确认 / D-2 Go-No-Go / D-3 tag+push+Release 逐项授权 / D-4 发布时点 | 授权留痕（decision-log/会话记录） | **用户决策点（DEC-143）**——唯一 transition 授权入口 |
| **M-5 发布执行**（授权后，Coordinator 执行；Release Agent 无命令权限） | 授权后执行序列（一次走完）：**E-1** bump commit（Developer 段载体：package.json 0.3.1→0.3.2 + README 徽章/安装命令同步 + CHANGELOG **创建** v0.3.2 节并收口——git log 实采三分账对照 + 「破坏性变更：无」显式节 + 已知问题延续核对）→ **E-2** 全量门控复跑（RG-1，**M-3'**——12 套件含 fix-010 E 组 13 断言，在案基线同口径零回退）→ **E-3** npm pack + tarball 隔离冷装冒烟（RG-2——冷装先于 tag，未验证产物不打 tag）→ **E-4** tag v0.3.2（annotated，EV-087 先例）→ **E-5** push main + push tag → **E-6** gh Release 创建（assets 含 tarball，非 draft）→ **E-7** GATE-8 归档触发检测（RG-3，收尾）→ **E-8** 治理收尾（evidence 行 + tracker 路线图行 v0.3.2 已发布 + 范围口径更新 + 风险状态注记） | 每步留痕（EV 行）；RG-1~3 全 PASS；tag/远端 tag/Release 一致 | 授权后执行（maximum-autonomy 域内；push/Release 已获 M-4 逐项授权——EV-087 先例） |
| **M-6 发布后验证** | 48h 观察期（release-checklist 第四步）：安装链路 + 冒烟基线（12 套件）+ 双修复通路冒烟（image-solo 纯图占位 + 气泡显示——用户已复验过，发布后复确认）+ EVO-007 新布局冒烟（布局/删除双入口）+ kill-switch 三层复跑 + 宿主 junction 观察 | 冒烟记录 + 观察期无 P0/P1 | 自动 + 用户观察 |
| **M-7 治理收尾** | RG-3 归档检测执行 + RG-4 复核 + tracker/风险注记 + 路线图 v0.3.2 行口径更新（C-4+C-5 原计划 vs 本版实际范围——§8 备注） | 归档 integrity PASS（若触发迁移） | 自动（Coordinator） |
| **M-8 版本复盘** | P-vN 演进检查 + 观察期结论 + 完成必推荐（task-priority-analysis——Coordinator 执行，从 unblocked + 最高优先级未完成任务推荐） | 复盘记录入仓 | 自动（Coordinator）+ 用户确认下一步 |

---

## §5 风险与回滚

### 5.1 风险登记（发布面——引用 + 处置，不新开不重开）

| 风险 | 等级 | 与 v0.3.2 的关系 | 处置 |
| --- | --- | --- | --- |
| **RISK-001**（risk-log:5，活跃）CI 面缺、回归保护依赖本地测试网 | 中 | v0.2.1/v0.3.0/v0.3.1 三轮带披露发布先例；现行保护 = 本地 12 套件全量测试网（在案基线 + E-2 M-3' 复跑） | 持续披露（CHANGELOG 已知问题延续核对列 M-5 E-1）；CI 任务另行排期（G4 pending 不阻塞——先例 DEC-025 D-3a） |
| **RISK-003**（risk-log:7，活跃）宿主接口演进无预警（npx cache 静默刷新） | 高 | **本版零依赖面变更**——宿主漂移风险面与 v0.3.1 发布时点相同；parity 14 全绿（EV-090） | adapter-parity 看护 + 症状知识库；宿主再漂移 = 回归测试触发条件（rollback 触发条件⑤） |
| R-E1 OpenAI 侧收紧（client/端点/风控） | 高（外部不可控） | 本版零 OAuth 通路语义变化（仅 UI 入口面——移除不可用入口 + 布局调整）；无 flag 面变化 | 三层 kill-switch（§3.3）+ 最坏回退 = revert 产品段（rollback-plan §场景 B） |
| **deepseek-official 视觉端点挂起（227s/0token）** | 中（宿主/端点域） | 本仓不可修（EV-088 用户验证项实证）；vision 旁路 glm/glm-5.3-flash 可用——用户已有通路 | **如实披露不伪装**（CHANGELOG 已知问题收口核对列 M-5 E-1）；不构成本版回滚触发条件（宿主域正交） |
| **picked 层盲区** | 低（宿主固有 P3） | 宿主 api-proxy `selections` WeakMap 进程内状态，插件无访问 API（review-REL-005-R0 源码核验）；prestep 注释如实披露 | 观察项——注释披露在案；不阻发布 |
| **P3 台账**（不阻发布） | 低 | 本版审查链遗留：i18n 口径（EVO-007 i18n 53×2 键删除面）/ EVO-007 R1 N-1~N-4（双重 load 冗余等）/ stats UTC 日期键（stats.js:167 toISOString）/ settings 遗留键（oauthExperimental/oauthTosAccepted 容忍零触碰 +「(实验)」存量 preset 账号名——重建即消）/ prestep.js:193 P8 注释措辞（「不静默吞错」vs catch→null 实现）/ requestHeader 抛错与部分字段缺失覆盖 carry-forward（review-FIX-010-R0 P3-3） | 台账维持 + 如实披露（§7 #14 逐项留痕）；均不阻发布 |
| 已知问题：对话内图片附件「加载失败」显示层残留 | 低 | v0.3.0/v0.3.1 已知问题披露延续；FIX-008 候选域（与 FIX-010 修复面不同——译码/渲染面），本版不承载修复 | CHANGELOG 收口时确认披露延续（E-1）；不虚报修复 |
| check-governance 已知 issues | 低（非阻塞） | 均为插件仓 FIX-281 已申报域 + 非阻塞 WARN（v0.3.1 口径延续） | 如实披露（RG-4 判定口径 = 无本版引入未申报阻塞项）；M-7 复核 |

### 5.2 回滚方案（三阶段——详见 rollback-plan-v0.3.2.md）

| 阶段 | 窗口 | 动作 | 耗时 |
| --- | --- | --- | --- |
| 一 | push 前（执行段任一步失败/叫停） | 中止执行序列 + 本地清理（revert bump commit / `tag -d` / tgz 清理） | 分钟级（<5min） |
| 二 | push 后（已 tag/已 Release） | revert 产品段 5 commits + bump commit → 全量复跑 → 前滚修复（下一版本承载，默认建议）或整体回退重发（按用户裁决） | 15–30min |
| 三 | 用户侧（安装态，OPS-001 junction 面） | 开发树 checkout v0.3.1 + 重启（junction 随动）/ v0.3.1 tarball 重装 | 分钟级 |

**本版特定约束**：v0.3.0 回滚方案中的 undici revert 顺序约束不适用（沿 v0.3.1 先例）——本版**零依赖面变更**（package.json 现态 0.3.1 实读 + 产品 commits 未触碰，review-REL-005-R0 实证），产品段 revert 不触碰 package.json（bump commit 除外）。数据兼容性 = 无 Schema/数据格式变更（oauthAccounts 数据域零触碰，EV-090），回滚无数据冲突。**EVO-007 回滚特殊代价**：删除路径回到 v0.3.1 形态（池行「移除」不清凭据——F-1 缺陷面在 v0.3.1 存在）——如实披露（rollback-plan 影响评估）。

---

## §6 No-overclaim 边界（本规划与后续发布材料的措辞红线）

1. **不声明「生产就绪/生产级」**——项目处 0.x 演进期。
2. **不声明 OpenAI 官方批准/合作/背书**——「移除 OAuth 官方登录入口」= 产品语义面如实（官方 API 不提供 OAuth 的事实陈述 + README 三处「v0.3.2 起」移除声明）；不弱化、不夸大。
3. **实测数字口径**——门控基线引用权威值（smoke 963 ok/1skip + 12 套件全绿——任务书权威输入 + EV-090 Coordinator 实测 + 收尾段 Developer 申报/R0 静态核验）；M-5 E-2 复跑后以复跑值为准，不沿用旧值宣称。
4. **隔离验证措辞纪律**——仅使用「隔离环境安装冒烟（环境变量重定向至临时目录）通过」类限定表述；无限定语的「真实安装/真实环境验证」= 违规措辞。
5. **CI 面如实披露**——不声称「CI 全绿」；G4 pending 持续披露（RISK-001）。
6. **Kill-switch「验证过可以」**——三层断言在案（EV-090 12 套件全绿）方可写「已验证」；未跑的（E-2 复跑/冷装/归档检测）一律 PENDING，不预支。
7. **用户验证口径如实**——FIX-009 ✓ FIX-010 ✓（用户复验在案，EV-088/089）；EVO-007 **2/3 PASS**（布局 ✓ OAuth 区块消失 ✓）——点③删除按钮空态无载体以 R1 断言证据闭环（vision 识别 sha256:bcff4e35），**不写成用户目击通过**。
8. **无新增 flag 的事实如实**——v0.3.2 发布面 = 存量两 flag + 两退役键（零变化）；不虚构灰度/渐进放量机制（Big-Bang 论证见 §3.2）。
9. **规划 ≠ 决策**——版本号/发布时点/tag/push 全部待 M-4 用户授权；本文件任何建议不构成既成事实。
10. **推演与实证分层**——机制推演（如回滚后删除路径缺陷面复活语义）明确标注「推演级」，与运行时实证（EV 留痕）区分呈现。

---

## §7 与 plan-tracker 事实一致性核对表（零编造自检）

| # | 本规划引用事实 | 来源留痕（文件/行） | 核对 |
| --- | --- | --- | --- |
| 1 | v0.3.1 已发布，tag 5ca8b87，2026-08-30，tarball 1,507,454B | plan-tracker:132；EV-087 | ✅ |
| 2 | package.json version 0.3.1 | package.json:4（实读） | ✅ |
| 3 | ahead 12；点名清单：产品 5（8877365/020909b/65226a3/3665d6a/1d2bf36）+ 治理 8（d92dfba/ec94a6c/0c7f987/49ac8ab/0234a88/ed229db/b664f52/6877389）——**点名合计 13 与 ahead 12 差 1**；plan-tracker:39「ahead 11」为陈旧值 | 任务书权威输入；review-REL-005-R0-input.md:8（ahead 12 实采）；plan-tracker:39 | ⚠️ 逐 commit 完整清单与三分账待 M-5 E-1 git log 实采消歧（v0.3.0 先例：86-commit 三分账，EV-084） |
| 4 | FIX-009 8877365 + R0 APPROVED_WITH_NOTES/0 + 用户复验通过 | tracker:36；EV-088；review-FIX-009-R0.md（机录） | ✅ |
| 5 | FIX-010 020909b + R0 APPROVED_WITH_NOTES/0 + 用户复验通过 + DEC-027 | tracker:37；EV-089；review-FIX-010-R0.md（机录） | ✅ |
| 6 | EVO-007 65226a3+3665d6a + R0 NEEDS_CHANGE → R1 APPROVED_WITH_NOTES/0（T1 闭环）+ 用户 GUI 2/3 + 点③断言闭环 | tracker:38；EV-090/091；review-EVO-007-R1.md（机录） | ✅ |
| 7 | REL-005 收尾段 1d2bf36 + R0 APPROVED_WITH_NOTES/0（P2-1 补录闭环 + P3×3） | tracker:39；EV-091；review-REL-005-R0.md（机录） | ✅ |
| 8 | 门控基线 12 套件（smoke 963 ok/1skip + 11 套件） | 任务书权威输入；EV-090（Coordinator 实测）；EV-091（Developer 申报 + R0 静态核验 9/13） | ✅（E-2 复跑后以实测为权威） |
| 9 | 依赖面零变更（package.json 现态 0.3.1 = v0.3.1 同面；产品 commits 未触碰） | package.json:27-57（实读）；review-REL-005-R0-input.md §四「无 bump」 | ✅ |
| 10 | README 三处「v0.3.2 起」移除声明（L20/L111/L129）+ 布局/删除路径描述（L84/L108/L112/L113） | README（实读；审查逐项与 client.js/service.js 现态相符——review-REL-005-R0 §三） | ✅ |
| 11 | RISK-001 活跃 / RISK-003 活跃 | risk-log:5/:7；plan-tracker:20 | ✅ |
| 12 | deepseek-official 视觉端点挂起（宿主/端点域，vision 旁路 glm） | EV-088 用户验证项（任务书权威输入） | ✅ |
| 13 | picked 层盲区（宿主 WeakMap 进程内状态无插件 API，P3 固有） | review-REL-005-R0-input.md 维度 1-5（宿主源码核验） | ✅ |
| 14 | P3 台账各项（i18n 口径/N-1~N-4/stats UTC 键/settings 遗留键/P8 注释措辞/requestHeader carry-forward） | 任务书权威输入；EV-088 遗留台账（stats UTC/settings 遗留键）；EV-090（N-1~N-4）；review-REL-005-R0（P3-1/P3-3） | ✅（台账项，不阻发布） |
| 15 | 归档检测 v0.3.0/v0.3.1 先例跳过（工具计数 0<2） | EV-084；EV-087 | ✅（v0.3.2 结果待实跑，预判不写死） |
| 16 | kill-switch 三层 + B1/B2 断言在案（EV-090 12 套件全绿） | feature-flags-v0.3.0.md §4（转正注记）+ EV-090 | ✅（v0.3.2 无 flag 变化） |
| 17 | EVO-007 oauthAccounts 数据域零触碰（数据面零变更） | EV-090 | ✅ |
| 18 | CHANGELOG 现态无未发布段（v0.3.1 节收尾） | CHANGELOG.md（实读——首节 = v0.3.1） | ✅（v0.3.2 节由 E-1 创建收口；与 v0.3.1 的「未发布段先行」路径差异如实标注） |
| 19 | 路线图 v0.3.2 行原计划（C-4+C-5 成功率闭环）vs 本版实际范围（REL-005 承载） | plan-tracker:133 vs :39 | ⚠️ 口径不一致——观察项上报（§8 备注），建议 M-7 更新路线图行；不在本规划修正（.governance 非本 Agent 写域） |
| 20 | 用户验证口径（FIX-009 ✓ / FIX-010 ✓ / EVO-007 2/3 + 点③断言闭环） | EV-088/089/090/091 | ✅ |

---

## §8 待用户裁决点汇总（M-4 呈报——Coordinator 转 ask_user_question 用）

| # | 裁决点 | 选项 | 本规划建议 |
| --- | --- | --- | --- |
| D-1 | 版本号确认 | **PATCH 0.3.2**（§2.2 论证——两缺陷修复 + 一 UX 调整 + 收口；零新能力语义）/ MINOR 0.3.2（反论见 §2.2 第 3 点——入口移除+布局变化需 MINOR 语义承载） | **PATCH** |
| D-2 | Go/No-Go | RG-1 在案基线 PASS（EV-090 + Developer 申报）+ E-2（M-3'）复跑 + RG-2/RG-3 执行段闭环为前置 + PM-1 审查通过 | Go（满足前置后） |
| D-3 | push + GitHub Release 授权 | 逐项授权（tag / push main / push tag / gh Release——EV-087 先例口径） | 授权后 M-5 一次执行 |
| D-4 | 发布时点 | 授权即执行（M-5 序列）/ 指定窗口 | 用户定 |

> 备注 1：plan-tracker 路线图 v0.3.2 行（:133）原计划 = C-4+C-5 成功率闭环，本版实际承载（REL-005：FIX-009/010 + EVO-007 + 收尾段）由用户裁决启动（TRIAGE-REL-005 机录）——口径不一致建议 Coordinator 于 M-7 治理收尾时更新路线图行；不构成本版发布阻塞。
> 备注 2：plan-tracker:39「ahead 11」与审查实采 ahead 12 存在 1 枚差——M-5 E-1 git log 三分账实采时一并核对（§7 #3）。

---

## 自检清单（硬门槛逐项核对）

| 检查项 | 结果 |
| --- | --- |
| 发布范围与 plan-tracker 路线图/任务终态一致（零编造，§7 逐项留痕） | ✅ 20 项核对（3 项标 ⚠️ 待实采/复核，均已声明） |
| semver 合规：0.3.1→0.3.2 PATCH 论证充分（§2.2：零新能力语义 + 零 breaking 四证 + 不跳号 + MINOR 反论否弃） | ✅ |
| 入槽清单每项带来源留痕（§2.1）；「本次不发布什么」显式记录（§2.3） | ✅ |
| 发布门禁 = 本仓四项（RG-1~4，插件仓工具链不适用声明见头表） | ✅ |
| Kill-switch「已验证」仅限断言在案项（§3.3 三层均 EV-090 在案）；未跑项 PENDING | ✅ |
| 风险不关闭不重开（RISK-001/003 持续披露；deepseek-official 挂起/picked 盲区/P3 台账如实披露） | ✅ |
| No-overclaim 边界完整（§6 十条） | ✅ |
| 发布决策/tag/push 全部标注待 M-4 用户授权（§4/§8） | ✅ |
| 回滚三阶段 + 本版特定约束（undici 约束不适用声明 + 数据兼容性 + EVO-007 回滚特殊代价） | ✅ |
| 唯一写入目标 = 三产物文件（version-plan/checklist/rollback v0.3.2）；未修改产品代码/CHANGELOG/package.json/.governance；未执行命令；未与用户交互；未创建子 agent | ✅ |
