# dsh-agent-router — 治理计划跟踪（plan-tracker）

> Profile: **lightweight**（7 合并 Gate + 6 列精简跟踪）· 由 software-project-governance v0.74.0 于 2026-08-18 初始化（Scenario B 半途接入，existing）

## 项目配置

- **项目名称**: dsh-agent-router
- **项目目标**: 专业的事交给专业的 agent：为 DSH 主 agent 挂载可自定义的专业 agent 目录（视觉/图片生成/翻译/语音/cli 子代理），按能力标签自动路由，扩展主 agent 的多模态与多模型能力边界
- **Profile**: lightweight（7 合并 Gate + 6 列精简跟踪）
- **触发模式**: always-on
- **操作权限模式**: maximum-autonomy
- **工作流版本**: 0.76.0
- **当前阶段**: development（开发实现，6/11）
- **接入方式**: Scenario B 半途接入（existing）——前置 Gate 标记 passed-on-entry

## 项目总览

| 项目 | 当前阶段 | 总任务数 | 已完成 | 阻塞中 | 关键风险数 | 最近 Gate 结论 | 最近复盘日期 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dsh-agent-router | development (6/11) | 22（17 去重后 + FIX-003/FIX-003C/FIX-004/FIX-005/EVO-004 后续入账） | 21（15 基线 + FIX-003 + FIX-003C + EVO-002 + FIX-005 + FIX-004 + EVO-004；另 1 关闭 = DEV-001，22 行全部终态） | 0 | 1（RISK-001 活跃——主轨道 = DEV-002 + 演进路线） | G4 待评（v0.2.0/v0.2.1 已发布；CI 面仍缺——RISK-001；v0.3.x 演进定稿 DEC-020 + EVO-001 PoC 通过 C-1 解锁） | — |

## 当前活跃事项

| 优先级 | ID | 事项 | 依赖 | 目标版本 | 状态 |
| --- | --- | --- | --- | --- | --- |
| P1 | FIX-004 | 模型能力判定缺陷根治：能力自证 + 预检可观测 + 热载替代评估 + 宿主缺陷申报 | — | v0.3.x | 已完成（6dd6e5b + R0 APPROVED_WITH_NOTES/0） |
| P1 | EVO-004 | C-3 统计 UI 面（出口②按天视图/⑤导出按钮）+ R1-F3/R2-F1/F2/F3/R8-F1/F2 遗留六修 | — | v0.3.1 | 已完成（7 commits + R0 APPROVED_WITH_NOTES/0 + 门控实测全绿） |
| P0 | FIX-006 | OAuth 代理路径修复：undici 依赖缺失 + dispatcher 版本兼容（出口①真机首联阻断） | — | v0.3.0 | 待实施（入账 2026-08-23，真机实证 P0） |
| — | OPS-001 | 当前目录插件安装到 DSH 宿主（离线 LocalPath：junction→开发树 + cordis.patch.yml 宿主行；用户指令 2026-08-23） | — | — | ✅ 已完成（EV-069；junction/patch/Node 解析三链验证；重启生效待用户） |
| — | 下一轮 | 无未完成任务——出口①真机首联/出口③设备码流/v0.3.0 发布时点（用户决策项）或插件仓缺陷申报（B 类 7 项入账） | — | v0.3.x | 待定 |

### 最近完成

| 已完成任务 | 完成日期 | 摘要 |
| --- | --- | --- |
| OPS-001 | 2026-08-23 | 当前目录插件安装到 DSH（install.ps1 -LocalPath . @ 8938a54=v0.2.1+62：junction ~/.dsh/profiles/node_modules/dsh-agent-router + cordis.patch.yml router/tool-router 行；EV-069；重启生效） |
| GOV-003 | 2026-08-23 | 治理版本同步 0.75.0→0.76.0（三处版本行 + 快照 28c 修复 + 归档检测跳过 + 锁检查；EV-070） |
| FIX-005 | 2026-08-23 | 条件化引导（a484469 + R1 APPROVED_WITH_NOTES/0；EV-064/065） |
| FIX-003C | 2026-08-23 | FIX-003 R1 遗留三修（0782516 + R1 APPROVED/0；EV-056/057） |
| FIX-003 | 2026-08-22 | 多模态路由失效热修全链闭环（b6581c5 + 用户真机验证；EV-053/054/062/063） |
| EVO-003 | 2026-08-23 | C-3 统计持久化 Phase 1+2（1199c0b/c2d01ea；EV-039/042/051/052） |
| EVO-002 | 2026-08-23 | C-1 OAuth 实施 Step 1-7（R1-R8；EV-048/050/058/059） |

## 待办与决策项（非任务项——18c/18d/18e 不判定域）

- **FIX-003 宿主验证**（用户动作，P0）：宿主重启或 settings 热载后验证 vision 带图 / 气泡图片 / attachmentIds 跨轮——发布前必做
- **出口①真机首联**（用户决策项，P0）：EVO-002 出口①——1455 + 代理 7890 + V-EVO-3 + R6-F2/F5 + dispatcher×原生 fetch；需用户在场
- **出口③设备码流排期**（用户决策项，P0）：EVO-002 出口③ 1455 被占降级路径排期
- **v0.3.0 发布时点**（用户决策项）：出口条件①④机制面已闭环；真机首联后评估
- **EVO-003 UI 批次**（待入账候选，P1）：出口②按天视图/⑤导出按钮 UI 面 + R2-F1/F2/F3 P2×3 + R1-F3 CSV 注入 + R8-F1/F2
- **插件仓缺陷申报**（待入账，B 类）：Check 1 轻量表解析矛盾（verify_workflow.py:9113 vs 13510）+ review-record CLI 无存在性检查覆盖风险（review_record.py:335）+ FIX-174 历史格式迁移路径缺失——走插件仓项目治理

## Gate 状态跟踪

> lightweight profile：7 个合并 Gate（覆盖 11 阶段）

| Gate | 覆盖 | 状态 | 通过日期 | 关键证据 |
|---|---|---|---|---|
| G1 | 立项→调研 | passed-on-entry | 2026-08-18 | README 项目目标/安装文档成熟（EV-001） |
| G2 | 调研+选型→设计 | passed-on-entry | 2026-08-18 | docs/architecture.md + 五层架构设计定稿 commit 8bedfcc（EV-001） |
| G3 | 设计→开发 | passed-on-entry | 2026-08-18 | lib/ 7 模块落地、76 commits、8 个发布 tag（EV-001） |
| G4 | 开发+测试→CI | pending | — | — |
| G5 | CI→发布 | pending | — | — |
| G6 | 发布→运营 | pending | — | — |
| G7 | 运营→维护 | pending | — | — |

## 任务跟踪

> lightweight profile：6 列精简跟踪

| ID | 阶段 | 任务项 | 目标/预期结果 | 状态 | 优先级 |
|---|---|---|---|---|---|
| FIX-004 | development（架构缺陷根治——用户 2026-08-23 指出） | 模型能力判定缺陷根治：能力自证 + 判定缺失可观测 | **问题定性（用户质疑成立）**：①宿主 pi-ai 自定义 provider 模型能力缺省 `DEFAULT_INPUT=["text"]`——视觉能力不自动探测纯靠声明（settings 需手写 `input: [text, image]`），宿主无 settings 热载（adapters 构建时快照，lib/index.js:1527 registration() 无 watch/reload——**配置改后必须重启**）；②插件预检 service.js:1172 纯信宿主 `resolveModelInfo`，宿主判定缺失时无自证路径（插件自己知道 qwen3.7-plus 可看图——README L125 实测 + D9 测试）、无观测、静默拒绝（R2-F3 吞错零观测同型）。**目标**：①插件能力自证——宿主判定缺失/不确定时走自证路径（运行时探测/已验证能力表——P5 泛化禁白名单硬编码）②预检失败可观测（诊断事件而非静默）③评估宿主重启需求的可替代手段（如插件侧 refresh 入口/缓存失效，若宿主 API 不可达则明示重启必要——如实边界）④decision-log 记录宿主层缺陷申报（不可根治面） | **已完成（终态）**——6dd6e5b（+174/-9 仅 2 文件：service.js decideImagePrecheck/recordCapabilityEvent + routing-paths [X] 节）+ R0 APPROVED_WITH_NOTES/0（review-FIX-004-R0；114/114 + smoke 857/0 零回退）；P1-1 台账（宿主 resolveModelInfo 抛错+自证不可用窄边界→误诊纯文本拒图——合规但建议后续区分 undetermined）/P2-1（P9 残留单信面 host-declared，非本轮引入）/P2-2（测试桩复位 try/finally 防御）/P3×3；热载面评估结论=无需修改（sourceAcceptsModality 60s TTL 缓存失效等价 refresh）；DEC-024 宿主申报入册 | P1 |
| FIX-005 | development（用户 2026-08-23 提案——条件化引导） | route_agent 引导/注入按主模型能力条件化（原生多模态不注入引导） | **问题定性（用户洞察 + 源码确认）**：prestep reminder（prestep.js L195-196/L225）**无条件注入**"请调用 route_agent…"——即使主模型原生多模态（逃生组改写 L214-216 已按能力分级保真直传，但 reminder 漏分级）→ 主 agent 被引导自主调用 route_agent（截图 429 误调实锤；本轮系统提示引导我 route_agent 亦为活例）。**用户裁决（2026-08-23 三选一）**：**条件化引导**——①prestep reminder 按能力分级（accepts=true → 不注入；纯文本 → 现状强制引导——C-3 图丢失防护）；②tool.js route_agent 描述中性化（注明"主模型已原生看图；仅专业深析/跨轮旧图/用户显式要求时用"）；③service.js 系统提示目录段同步中性说明；跨轮指代/专业深析能力**保留**；判定复用 sourceAcceptsModality 单点（P5 泛化禁复制）；P8 变更可观测 | **已完成（终态）**——a484469 + R1 APPROVED_WITH_NOTES/0（EV-064/065：108/108 + 856/0；P3 纯文本零变化/P5 单点复用/P8 无新增沉默面验证通过）；P2×2 台账（F-1 prestep 63 行/F-2 探测失败回落判别用例）+ P3×4；用户实测：原生多模态零引导（read_image 全程未触发 route_agent） | P1 |
| FIX-003C | development（收尾批次） | FIX-003 R1 遗留三修（F-1/F-2/F-3） | F-1 dshHomeAttachmentsRoot env 缺省回退补 .dsh（1 行，与注释及宿主默认一致）；F-3 哈希兜底分支与环境 fallback 补 B13c/d/e/f 四断言；F-2 probeImageDimensions VP8X off-by-N（24→30）修正 | **已完成（终态）**——0782516 + R1 APPROVED/0（EV-056/057，F-1/F-2/F-3 全闭，G-1~G-3 P3）；routing-paths 102/102 + smoke 849/0；FIX-003 遗留清单 F-1~F-3 清零（F-4~F-8 P3 保留）；N-extra P3 台账（B6 未知 id 路径真实目录只读探测——测试隔离可选加固，非阻塞） | P1 |
| FIX-003 | development（P0 热修） | 多模态路由失效 + 附件链 + 气泡图片消失（宿主 21:28 静默重装同型事件） | 用户 2026-08-22 21:35 报：①route_agent 视觉调用收不到图（includeImages 未达/attachmentIds "未注册且宿主无法读取"/files 被"模型不支持图片输入"拒绝）②界面气泡总图片消失。**RCA 事实链（Coordinator 侦察）**：附件对象落盘完好（56.7KB PNG 21:34:47，`~/.dsh/attachments/v1/objects/f3/...`，魔数 PNG）；插件前置预检 lib/service.js:1174 因宿主 `resolveModelInfo().inputModalities` 不含 image 拒绝（settings 配置未变：vision=opencode-go-new/qwen3.7-plus，qwen3.7-plus 曾实测可看图——README L125）；**宿主 dsh-llm 0.1.1-rc.2 npx cache 目录修改时间 21:28:23**（FIX-001 06:05 静默刷新同型，RISK-003 域）→ 能力探测与附件注册接口行为回归。修复方向由 Developer RCA 定（能力判定降级/目录重探测/附件注册兼容），验收 = vision 带图调用恢复 + 气泡图片恢复 + routing-paths 95/95 零回退 | **已完成（全链闭环）**——RCA 三环 + b6581c5 + settings 声明修复（EV-053）+ R1 APPROVED_WITH_NOTES/0（EV-054）+ 遗留三修清零（FIX-003C EV-056/057）+ **GUI 模型配置陷阱修复（EV-062：settings models 覆盖内置声明 + ?? [text] 兜底判 text-only）+ 用户真机验证通过（EV-063："已经解决"）**；宿主缺陷申报（GUI 写回丢能力声明）→ FIX-004 输入 | P0 |
| RES-001 | research（并行活跃） | 多模态路由机制重新调研 | 定位两个问题并产出修正方案（问题①三机制复合体；问题②四丢失点 LP-1~LP-4）+ 3 方案候选 C1/C2/C3 | 已完成——审查 APPROVED_WITH_NOTES（review-RES-001.md，0 BLOCKING） | P0 |
| RES-002 | research（并行活跃） | 通用附件路由框架调研（DEC-005） | ① dsh-vision-router 原生展示与"图片轮=工具调用轮"机制解剖；② DSH 宿主附件能力盘点（image/audio/video/text）；③ 与本项目现状差距分析 + 通用化架构输入（模态无关路由） | 已完成——审查 APPROVED_WITH_NOTES（review-RES-002.md，0 BLOCKING/4 WARNING 引用精度级） | P0 |
| ARCH-001 | architecture（并行活跃） | 通用附件路由框架架构 v3 设计稿（DEC-007） | 基于 v2 架构 + 两份调研产出 v3 设计：不变量重写、preserveImageInput、三通道感知、imageMemory、三级展示、附件统一编址、F11 输入入口、移除清单、模态矩阵、迁移路径、成功标准候选（D-1 定稿用） | 已完成——R1 NEEDS_CHANGE（B-1+W-1~4）→ 返工 → R2 APPROVED_WITH_NOTES（unresolved_blockers=0；review-ARCH-001-R2.md） | P0 |
| MIG-001 | development | v3 迁移实施 Step 0-10（DEC-012） | 按架构 v3 §8 迁移路径逐步实施：Step 0 基线测试 → Step 1 移除整轮路由 → … → Step 10；每步独立提交+测试全绿；验收门 = D-1 五条指标（DEC-012） | **已完成**——Step 0-10 全 13 单元闭环（7cb2024/b7261d5/a23b338/374edfa/f89b8bd/f294c3c/98f04a3/2c4b194/1f17ea8/12a8c71/e88dfb2/0554c5d + Step 10 本提交）；R1-R14 审查链全通过（含两次 NEEDS_CHANGE→返工→复审闭环）；EV-011~023；V-DSH-1/2/3/7 闭环（1/2/7 验证成立/可用，3 证伪走原生兜底）；**D-1 门判定：满足×2（恒主模型/编址往返 100% 自动化）+ 部分满足×2（图片到达/跨轮指代——机制面 100% 端到端待实测）+ 待实测×1（触发率——U-3 真实统计）**；观测脚本 tests/metrics.mjs（31 项）；遗留转后续域：R14-F-01 测试卫生（DEV-002）+ P3 记录项 + D-1 待实测项（真实使用后评估）+ R4 F-1/F-2 | P0 |
| DEV-001 | development | v0.1.8 行为基线回归验证 | 跑通 tests/smoke.mjs + client-render.mjs，记录 whole-turn 图片路由默认化（c2648d2/963b4f5）后的基线输出 | **已关闭（DEC-017，2026-08-20）**——基线对象（整轮路由行为）已随 v3 Step 1 移除；534 smoke 断言 + 31 项 D-1 观测构成现行基线；"基线观测常态化"并入 DEV-002 范围 | P2 |
| DEV-002 | development | 核心通路自动化测试补强 | routing/takeover 关键路径具备可重复测试（当前仅 4 个冒烟测试文件） | **已完成（终态）**——tests/routing-paths.mjs 95 断言（3e0e2b5，EV-047）+ Test Reviewer R1 APPROVED_WITH_NOTES/0（EV-049；16 条抽查/突变矩阵 4 项精确吻合/边界 5 类）；P3 台账 T1-T6；RISK-001 主轨道关闭条件①达成 | P1 |
| DEV-003 | release | v0.2.0 发布收尾（DEC-015 升级） | 版本 bump 0.2.0 + CHANGELOG（v3 迁移全量记录）+ README 徽章/安装命令同步 + tarball 离线安装验证 + tag v0.2.0 + 归档触发检测 | **已完成（本提交=v0.2.0 发布提交）**——Release agent 三件套 + Developer bump/README + Release Reviewer APPROVED（W-1 有条件发布裁决入 risk-log，48h 观察期义务 DEV-001/002 关闭决策；W-3 回滚范围表述已修正）；tarball/tag 随本提交执行 | P1 |
| GOV-001 | development（治理快速通道） | 项目质量原则固化与持续改进机制建立 | 7 条原则 + 4 条编程要求立版（project-principles.md P-v1，含执行锚点映射）+ AGENTS.md 会话投影 + 持续演进协议（decision-log 入账制 + P-vN 版本化，质量基线只升不降） | **已完成**——DEC-016 决策入账 + EV-025 证据入账；check-governance 28 issues 经事实核查均为 pre-existing（插件仓自审计误期望 + 历史复审命名约定），无 GOV-001 引入项；原则文本与用户 2026-08-20 会话指令逐字一致 | P1 |
| GOV-002 | development（治理快速通道） | 治理工作流升级 0.74.0→0.75.0（/governance Scenario C） | bootstrap 段版本行更新 + plan-tracker 版本行 + 归档触发检测 + 过时锁释放 + tracker 去重卫生（FIX-001 重复行/FIX-002 陈旧行） | **已完成**——AGENTS.md @bootstrap-version 0.75.0（轻量模板 diff 仅版本行）；归档检测：跳过（已发布版本 0<2）；EV-038 | P1 |
| GOV-003 | development（治理快速通道） | 治理工作流升级 0.75.0→0.76.0（用户选定 2026-08-23） | bootstrap 段版本行更新 + plan-tracker/快照版本行 + 归档触发检测 + 过时锁检查 + 快照 28c 事实源修复（**工作流版本** 中文键对齐 FIX-105 正则） | **已完成**——三处版本行 0.76.0 一致（AGENTS.md @bootstrap-version + plan-tracker **工作流版本** + 快照 **工作流版本**）；轻量模板 diff 仅版本行（项目质量原则 P-v2 投影段为本项目自有，保留）；归档检测：跳过（已发布版本 0<2，与 GOV-002 先例一致）；锁检查：仅 FIX-006 在途锁（TTL 过期，保留至重派刷新，无终态残留锁）；EV-070 | P1 |
| EVO-001 | development（v0.3.0 前置） | H2 运行时 PoC（C-1 实施第一步门禁，DEC-020） | 独立测试 profile 安装 yoke233/dsh-openai-codex-auth → 用户在场登录 ChatGPT → P1-P6 六步验证（凭据落盘 owner-only/用量面板/带图对话/token 过期自动刷新/失败形态样本/登出清理）；附加 V-EVO-2b（stream:false 直测）+ V-EVO-2c（originator 观测） | **已完成——PoC 六步全过**（EV-028）：P1 登录端到端（Plus 识别）/P2 用量 21%/P3 SSE 12 事件 POC-OK/P4 rotating+软轮换宽限窗/P5 失败样本×4/P6 全清+Codex CLI 隔离。**H2=可行，C-1 解锁（复杂度 L 确认）**。附加：V-EVO-2b 证伪（走 SSE 聚合）/V-EVO-2c 通过（自标识被接受）/代理发现（chatgpt.com 需代理 7890，auth 直连）/gpt-5.4 系支持 image 输入 | P0 |
| EVO-002 | development（v0.3.0） | C-1 ChatGPT 订阅 OAuth 实施（ADR-005） | 按 evolution-roadmap-v1 §3 实施：schemas preset/credentialFile/oauthExperimental → lib/oauth-credentials.js → 1455 loopback → oauthBegin/Exchange preset 分支 → runOauthChat codex-responses 分支 → 账号卡 UI + ToS 确认 + 登出删除（含 W-5 删账号联动凭据清理）→ C-9 埋点；每步独立提交 + Code Reviewer 审查 + 534+ 断言零回退；~18 改造点/~1140 行 | **已完成（全任务终态）**——Step 1-7 全闭环（R1-R8 审查链；Step 6/7: R7/R8 APPROVED_WITH_NOTES/0，EV-048/050/058/059）；R7 遗留全清（F1-F5 + R6-F1）；W-5 三层防线；**DEC-022-D 用户裁决废弃（2026-08-23）**；遗留转 UI 批次：R8-F1 判据统一 + R8-F2 注释修正 + P3×6（R7-F9 枚举延续等）；**开放决策项：出口①真机首联（用户在场——1455+代理 7890+V-EVO-3+R6-F2/F5+dispatcher×原生 fetch 兼容 + R8-F6 可选 UX 观察）与出口③设备码流排期 = 用户决策项** | P0 |
| EVO-003 | development（v0.3.1） | C-3 统计持久化实施（ADR-006，可与 EVO-002 并行开发） | lib/stats.js 分离（service.js 2965 基线净减 ~220）+ DSH_HOME 按天 JSONL + 异步批量 flush + 数据安全四件套单测 + 成本单价表 + CSV 导出 + W-4 persist 开关往返语义；~14 改造点/~1000 行 | **已完成（终态）**——Phase 1（1199c0b，R1 APPROVED_WITH_NOTES/0，EV-039/042，8 裁量点全 adopt）+ Phase 2（c2d01ea，R2 APPROVED_WITH_NOTES/0，EV-051/052，前置项 F1/F2/F4 闭合，4 裁量点全 adopt）；smoke 849/0 + stats 99/0 + routing-paths 95/95；遗留台账（转 UI 批次）：R2-F1/F2/F3 P2×3 + carried R1-F3 CSV 注入 + 出口②按天视图/⑤导出按钮 UI 面 + P3×4 | P1 |
| EVO-004 | development（v0.3.1 收尾批次——快照候选"EVO-003 UI 批次"入账） | C-3 统计 UI 面 + P2 遗留五修 | 范围（每项独立 commit）：①出口②按天视图 UI 面（lib/client.js——statsResult.days 按天聚合渲染 + i18n 中英字典）；②出口⑤导出按钮 UI 面（statsExport RPC 面已上线——client 按钮 + range/level 选择 + CSV 下载）；③R1-F3 CSV 公式注入防护（P2，stats.js csvEscape 补 =+-@ 前缀防护——review-EVO-003-R2:51）；④R2-F1 setPersist 并发翻转竞态（P2，stats.js L569-598——transition promise 串行化/最后写入者胜出——review-EVO-003-R2:73）；⑤R2-F2 false 期 flush 契约洞（P2，#drain 起点 `if (!this.persist) return`——:74）；⑥R2-F3 record 吞错零观测（P2，selfReport 计数——P8 同型——:75）；⑦R8-F1 删除入口判据不对称（P2，client.js 判据统一——review-EVO-002-R8:36）；⑧R8-F2 ProxyAgent 缓存生命周期无界+注释错误（P2，service.js :632/:3364-3371——:39）；验收：新增判别测试覆盖每项 + client-render/smoke/stats 全绿零回退 | **已完成（终态）**——7 commits（31a8c74③/4d08990④/a9f98b2⑤/9fd6110⑥/dd5d310⑧/d8ee97c⑦/8938a54①②）+ R0 APPROVED_WITH_NOTES/0（review-EVO-004-R0；smoke 877/0 + stats 110/0 + parity 14 + routing 114/114）；P1×1 遗留（R8-F2 close 在途中断——可重试无损坏）+ P2×3（csvEscape 未覆盖 \t/\r + record 首层 catch 不计数 + client wStats 未声明 days/selfReport）+ P3×6；范围纪律 6 文件；①②合并单 commit（交织无法拆分，Reviewer 认可） | P1 |
| FIX-001 | development（P0 热修） | twin adapter 补 prepareCall——宿主 dsh-llm prepared-dispatch 接口演进兼容 | RCA：宿主 adapterStream 每次分发先调 adapter.prepareCall，twin 手工对象字面量缺该方法 → 接管路由全量 TypeError。修复：twin 显式 prepareCall + 接口奇偶回归测试 | **已完成**——f1c4c91（EV-034）+ R6 审查 APPROVED_WITH_NOTES（EV-036）+ FIX-001b 返工 cba0d98（R6-F1 空转通过修复/F2 动态枚举/F3 增强 + 2 测试 bug；parity 首次真实运行 14 断言全绿）——终态闭环 | P0 |
| RES-003 | research | 战略对齐与演进调研（DEC-017 方向授权） | ① 目的对齐审查：当前实现 vs 插件本源目的（扩展主 agent 能力边界 / 主 agent 专注主路径 / 任意多模态 agent 扩展 / 多模态账号配置 / 无头模式调用）② 易用性+用户吸引力+粘性评估（安装/配置/统计体验现状）③ 三方向差距分析：A 账号配置易用性（api key 配置 / cli 无头模式 / oauth 一键登录——参考 opencodex / 账号池管理）；B 专业 Agent 调用成功率与交互效果（实际产出+交互界面）；C 统计专业性与持久化+安装配置体验 ④ 演进候选方向与优先级输入（供 ARCH-002） | **已完成——审查 APPROVED_WITH_NOTES**（review-RES-003.md：unresolved_blockers=0；0 BLOCKING/2 WARNING/3 SUGGESTION；40 处抽查 0 不符；W 级经 DEC-018 落实）。核心结论：未偏离目的；OAuth 从未被 DEC 否定（被否定的是 gcloud 公开 Client 路线）；Top3 = ChatGPT 订阅 OAuth（Q1 前置）→ 统计持久化（Q3 已裁 DSH_HOME+90d）→ 成功率闭环；Q4 已裁不引入免费链 | P0 |
| FIX-002 | development（P0 热修） | 默认模型接管行为修正（双层）——覆盖用户手动选择 + 中间层故障放大 | 用户报障 ×2（①切 session/起子代理时模型被强制切 twin ②文本强制走 twin 失败）。RCA：两个独立接管面均无开关——服务端 wrapper syncDefaultModel 三触发点无条件接管 + 客户端 ModelTakeover 会话级接管（effect 依赖 sessionId，起子代理即触发）。修复（用户裁决方案 A）：takeoverDefaultModel 开关默认 false 统一约束两层（服务端一次性接管+来源记忆；客户端 catalog 镜像开关+armed 条件） | **已完成（终态）**——双层实现（d264f03+5c8f2dc）→ R7 NEEDS_CHANGE（P0×1 用户主权反转缺陷）→ 批次 1（72b2670：F1 takeoverMemory 三态/F2 闭包标记/F3 判别断言）+ 批次 2（0b3c15d：F4 不变量③④断言+掏空修复）→ **R8 复审 APPROVED_WITH_NOTES/0 blocker**（EV-040/044/045；F1-F4 全修复，N1-N3 P3 遗留，F8 转发布说明）；返工载体待下版本承载（发布决策属用户）；DEC-022-D 版本指纹转 EVO-002 Step 6/7 | P0 |
| FIX-006 | development（出口①真机首联阻断——v0.3.0 发布阻塞） | OAuth 代理路径修复：undici 依赖缺失 + dispatcher 版本兼容 | **问题定性（真机实证，2026-08-23）**：①package.json dependencies 无 undici 声明——运行时代理 dispatcher（service.js:3434 `import('undici')` fail-loud 设计）在发布环境必失败（Cannot find package）——v0.3.0 发布即运行失败（P0 发布阻塞）；②本机装 undici@8.10 后 ProxyAgent dispatcher 报 `invalid onRequestStart method`——Node 24 内置 undici 7.18.2 与新装 v8 接口不匹配——代理路径完全不可用（R6-F2/F5 "dispatcher×原生 fetch 兼容"真实暴露）；实验：原生 fetch 无 dispatcher 直连 chatgpt.com → 401（网络可达）；带 ProxyAgent dispatcher → invalid onRequestStart method（版本接口不匹配）；③npm 依赖树损坏（npm install/ci 冷装均报 children null——npm 缓存已 verify/GC、pnpm 恢复中）。**目标**：①package.json 声明 undici（版本对齐策略——Node 内置 7.18.x 匹配或兼容层）②dispatcher 兼容实现（或修复装配——经代理 fetch 真实可用）③判别测试（旧代码必败：undefined undici 明确报错/版本不匹配必败——测试桩注入）④锁文件策略（package-lock/pnpm-lock 引入与发布 tarball 依赖完整性） | 待实施（入账 2026-08-23） | P0 |
| REL-001 | release（v0.2.1） | v0.2.1 热修版本发布（承载 FIX-001/001b/002/002b） | 用户指令"发布版本承载修改"：P0 修复不等 v0.3.0。范围 = v0.2.0 以来 main 全部；含 metrics 夹具 prepareCall 补齐（发布门禁发现，D-1-2 恢复 100%）；CHANGELOG/bump/README/tag/tarball 离线验证/归档检测 | **已完成（全链）**——EV-037；tag v0.2.1（a1ab717）；tarball 离线验证 OK；**push 完成（c006639..067dde3，20 commits）+ GitHub Release 已发布**（assets 含 tarball，非 draft；用户 gh 重新授权后 Coordinator 执行）；治理记录随 067dde3 入仓 | P0 |
| ARCH-002 | architecture | 演进路径与方案设计（依赖 RES-003 结论） | 基于 RES-003 产出：演进路线图（阶段划分+版本规划建议）+ 分方向方案设计（含 oauth/账号池可行性边界）+ 风险与回滚分析；供 D-6 演进定稿决策用 | **已完成——审查 APPROVED_WITH_NOTES**（review-ARCH-002.md：unresolved_blockers=0；0 BLOCKING/5 WARNING/3 SUGGESTION；28 处抽查；独立蓝军 5 条）。产出：evolution-roadmap-v1.md（662 行）——v0.3.0~v0.3.3 四版本分期 + H3 源码级验证 16 项（Codex OAuth 全协议事实固化）+ ADR-005/006/007 + S-2 量化 + proposed DEC-020。W 级 5 处已修/3 处绑定实施任务书（W-4→v0.3.1/W-5+S-3→v0.3.0）。待 D-6 用户定稿 | P0 |

## 版本规划

### 版本路线图

| 版本 | 状态 | 预计日期 | 核心范围 | 包含任务 | 关键交付物 |
|---|---|---|---|---|---|
| v0.1.7 | 已发布 | 2026-08-17 | 多模态账号 / 用量统计 / 五种执行通路 | — | tag v0.1.7 + tarball |
| v0.1.8 | **已取消（被 v0.2.0 取代，DEC-015）** | — | whole-turn 图片消息路由默认化、附件按钮泛化、image-to-image | — | 范围被 v3 迁移架构级超越 |
| v0.2.0 | **已发布（2026-08-20）** | 2026-08-20 | v3 附件路由架构全量（MIG-001）/ D-1 验收门 | MIG-001, DEV-003 | tag v0.2.0 + tarball + CHANGELOG |
| **v0.2.1** | **已发布（2026-08-22，REL-001）** | 2026-08-22 | P0 热修承载：FIX-001/001b（宿主 prepared-dispatch 兼容 + parity 看护网）+ FIX-002/002b（双层接管用户主权，takeoverDefaultModel 默认 false）+ EVO-002 Step 1-4b OAuth 地基（kill-switch 零可见）+ metrics 夹具修复 | FIX-001, FIX-002, REL-001（EVO-002 Step 1-4b 顺带承载） | tag v0.2.1（a1ab717）+ tarball 1460KB 离线验证 + CHANGELOG；验证基线 smoke 656/parity 14/metrics 31 全绿 |
| **v0.3.0** | 规划中（DEC-020 D-6 定稿——首阶段启动） | 待定 | ChatGPT 订阅接入（C-1）：preset 账号 + 独立凭据文件 + 1455 回调 + 设备码后备 + codex-responses 协议分支 + Q2 per-protocol 能力接口 + 合规三层 kill-switch + C-9 埋点启动；**W-5/S-3 绑定**（删账号联动凭据清理 + 锁超时定义） | EVO-001（H2 PoC 前置门禁）, EVO-002（C-1 实施） | 一键登录端到端 + 出口条件六项（§2.1） |
| **v0.3.1** | 规划中 | 待定 | 统计持久化与专业指标（C-3）：lib/stats.js 分离 + DSH_HOME 按天 JSONL + 数据安全四件套 + 成本估算 + CSV 导出；**W-4 绑定**（persist 开关往返语义） | EVO-003, EVO-004 | 重启保留 + 按天聚合/p50/p95/成本 + 出口条件八项 |
| **v0.3.2** | 规划中 | 待定 | 成功率闭环（C-4+C-5）：五分类 + 预算制重试 + 诊断卡 + doctor 预检 + C-9 报告 | 待拆分（EVO-004 域） | 失败分类覆盖 + 重试预算 + C-9 实测报告 |
| **v0.3.3** | 规划中 | 待定 | 二梯队收敛：C-6 池泛化 + C-7 onboarding 向导（+C-8 官方安装通道可选） | 待拆分（EVO-005 域） | 池泛化 + 首次成功 3 分钟向导 |

### 版本里程碑

| 里程碑 | 目标版本 | 状态 |
|---|---|---|
| 多模态路由闭环 | v0.1.x | 已达成（v0.1.7） |
| 质量基线（测试回归保护） | ≥v0.2.0 | 规划中 |

### 版本 Gate 检查项

- 发布前：版本号已 bump、tarball 可离线安装、README 徽章与安装命令版本同步
- 发布后：tag 已打、治理记录已更新、归档触发检测已运行

### 版本规划纪律

- 版本范围变更走变更控制流程；临时任务先判定优先级再纳入版本
- 发布收尾必须运行归档触发检测（`python <plugin_home>/infra/archive.py migrate --auto --dry-run`，`<plugin_home>` 来自 resolve_entry.py）
- 发布复盘时 MUST 检查 `.governance/project-principles.md` 是否需要演进（P-vN，DEC-016 持续改进协议）

## 需求跟踪矩阵

| 需求 ID | 描述 | 来源 | 优先级 | 关联任务 | 当前状态 | 验证方式 |
|---|---|---|---|---|---|---|
| REQ-001 | 多模态任务按能力标签自动路由（image/speech/文本/子代理） | README 项目目标 | P0 | MIG-001（已交付 v0.2.0） | 已实现（D-1 机制面 100%，端到端待真实使用验证） | tests/smoke + tests/metrics + 真实使用样本 |
| REQ-002 | 核心通路回归保护 | 治理接入评估（EV-001） | P1 | DEV-002 | 待开始 | 自动化测试通过率 |
| REQ-003 | 战略演进三主线：账号配置易用性（api key/cli 无头/oauth/账号池）/ 调用成功率与交互效果 / 统计专业性与持久化+安装配置体验 | 用户战略指令（2026-08-20，DEC-017） | P0 | RES-003, ARCH-002 | 调研中 | RES-003 报告 + ARCH-002 方案审查 |

## 变更控制流程

临时任务纳入机制（新任务先入账再动手）：

1. **优先级判定**（P0/P1/P2）
2. **版本适配**（归入当前版本或下一版本）
3. **冲突检查**（与活跃任务文件/范围冲突 → 串行化）
4. **版本范围更新**（本文件路线图行同步）

**快速通道**：仅限治理记录类修改（`.governance/**`），可跳过 Agent Team spawn，由 Coordinator 直接执行（M1.2）。
