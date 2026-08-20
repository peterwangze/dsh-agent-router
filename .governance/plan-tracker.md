# dsh-agent-router — 治理计划跟踪（plan-tracker）

> Profile: **lightweight**（7 合并 Gate + 6 列精简跟踪）· 由 software-project-governance v0.74.0 于 2026-08-18 初始化（Scenario B 半途接入，existing）

## 项目配置

| 项 | 值 |
|---|---|
| 项目名称 | dsh-agent-router |
| 项目目标 | 专业的事交给专业的 agent：为 DSH 主 agent 挂载可自定义的专业 agent 目录（视觉/图片生成/翻译/语音/cli 子代理），按能力标签自动路由，扩展主 agent 的多模态与多模型能力边界 |
| Profile | lightweight |
| 触发模式 | always-on |
| 操作权限模式 | maximum-autonomy |
| 工作流版本 | 0.74.0 |
| 当前阶段 | development（开发实现，6/11） |
| 接入方式 | Scenario B 半途接入（existing）——前置 Gate 标记 passed-on-entry |

## 项目总览

| 项 | 值 |
|---|---|
| 项目名称 | dsh-agent-router |
| 当前阶段 | development (6/11) |
| 总任务数 | 10 |
| 已完成 | 6 |
| 阻塞中 | 0 |
| 已关闭 | 1（DEV-001——DEC-017 重定义关闭，观测义务并入 DEV-002） |
| 关键风险数 | 1（RISK-001 活跃——观察期义务已履行，回归保护主轨道 = DEV-002） |
| 最近 Gate 结论 | G4 待评（MIG-001 完结 + v0.2.0 已发布；CI 面仍缺——RISK-001） |
| 最近复盘日期 | — |

## Gate 状态跟踪（lightweight 7 合并 Gate）

| Gate | 覆盖 | 状态 | 通过日期 | 关键证据 |
|---|---|---|---|---|
| G1 | 立项→调研 | passed-on-entry | 2026-08-18 | README 项目目标/安装文档成熟（EV-001） |
| G2 | 调研+选型→设计 | passed-on-entry | 2026-08-18 | docs/architecture.md + 五层架构设计定稿 commit 8bedfcc（EV-001） |
| G3 | 设计→开发 | passed-on-entry | 2026-08-18 | lib/ 7 模块落地、76 commits、8 个发布 tag（EV-001） |
| G4 | 开发+测试→CI | pending | — | — |
| G5 | CI→发布 | pending | — | — |
| G6 | 发布→运营 | pending | — | — |
| G7 | 运营→维护 | pending | — | — |

## 任务跟踪（lightweight 6 列）

| ID | 阶段 | 任务项 | 目标/预期结果 | 状态 | 优先级 |
|---|---|---|---|---|---|
| RES-001 | research（并行活跃） | 多模态路由机制重新调研 | 定位两个问题并产出修正方案（问题①三机制复合体；问题②四丢失点 LP-1~LP-4）+ 3 方案候选 C1/C2/C3 | 已完成——审查 APPROVED_WITH_NOTES（review-RES-001.md，0 BLOCKING） | P0 |
| RES-002 | research（并行活跃） | 通用附件路由框架调研（DEC-005） | ① dsh-vision-router 原生展示与"图片轮=工具调用轮"机制解剖；② DSH 宿主附件能力盘点（image/audio/video/text）；③ 与本项目现状差距分析 + 通用化架构输入（模态无关路由） | 已完成——审查 APPROVED_WITH_NOTES（review-RES-002.md，0 BLOCKING/4 WARNING 引用精度级） | P0 |
| ARCH-001 | architecture（并行活跃） | 通用附件路由框架架构 v3 设计稿（DEC-007） | 基于 v2 架构 + 两份调研产出 v3 设计：不变量重写、preserveImageInput、三通道感知、imageMemory、三级展示、附件统一编址、F11 输入入口、移除清单、模态矩阵、迁移路径、成功标准候选（D-1 定稿用） | 已完成——R1 NEEDS_CHANGE（B-1+W-1~4）→ 返工 → R2 APPROVED_WITH_NOTES（unresolved_blockers=0；review-ARCH-001-R2.md） | P0 |
| MIG-001 | development | v3 迁移实施 Step 0-10（DEC-012） | 按架构 v3 §8 迁移路径逐步实施：Step 0 基线测试 → Step 1 移除整轮路由 → … → Step 10；每步独立提交+测试全绿；验收门 = D-1 五条指标（DEC-012） | **已完成**——Step 0-10 全 13 单元闭环（7cb2024/b7261d5/a23b338/374edfa/f89b8bd/f294c3c/98f04a3/2c4b194/1f17ea8/12a8c71/e88dfb2/0554c5d + Step 10 本提交）；R1-R14 审查链全通过（含两次 NEEDS_CHANGE→返工→复审闭环）；EV-011~023；V-DSH-1/2/3/7 闭环（1/2/7 验证成立/可用，3 证伪走原生兜底）；**D-1 门判定：满足×2（恒主模型/编址往返 100% 自动化）+ 部分满足×2（图片到达/跨轮指代——机制面 100% 端到端待实测）+ 待实测×1（触发率——U-3 真实统计）**；观测脚本 tests/metrics.mjs（31 项）；遗留转后续域：R14-F-01 测试卫生（DEV-002）+ P3 记录项 + D-1 待实测项（真实使用后评估）+ R4 F-1/F-2 | P0 |
| DEV-001 | development | v0.1.8 行为基线回归验证 | 跑通 tests/smoke.mjs + client-render.mjs，记录 whole-turn 图片路由默认化（c2648d2/963b4f5）后的基线输出 | **已关闭（DEC-017，2026-08-20）**——基线对象（整轮路由行为）已随 v3 Step 1 移除；534 smoke 断言 + 31 项 D-1 观测构成现行基线；"基线观测常态化"并入 DEV-002 范围 | P2 |
| DEV-002 | development | 核心通路自动化测试补强 | routing/takeover 关键路径具备可重复测试（当前仅 4 个冒烟测试文件） | 待开始 | P1 |
| DEV-003 | release | v0.2.0 发布收尾（DEC-015 升级） | 版本 bump 0.2.0 + CHANGELOG（v3 迁移全量记录）+ README 徽章/安装命令同步 + tarball 离线安装验证 + tag v0.2.0 + 归档触发检测 | **已完成（本提交=v0.2.0 发布提交）**——Release agent 三件套 + Developer bump/README + Release Reviewer APPROVED（W-1 有条件发布裁决入 risk-log，48h 观察期义务 DEV-001/002 关闭决策；W-3 回滚范围表述已修正）；tarball/tag 随本提交执行 | P1 |
| GOV-001 | development（治理快速通道） | 项目质量原则固化与持续改进机制建立 | 7 条原则 + 4 条编程要求立版（project-principles.md P-v1，含执行锚点映射）+ AGENTS.md 会话投影 + 持续演进协议（decision-log 入账制 + P-vN 版本化，质量基线只升不降） | **已完成**——DEC-016 决策入账 + EV-025 证据入账；check-governance 28 issues 经事实核查均为 pre-existing（插件仓自审计误期望 + 历史复审命名约定），无 GOV-001 引入项；原则文本与用户 2026-08-20 会话指令逐字一致 | P1 |
| RES-003 | research | 战略对齐与演进调研（DEC-017 方向授权） | ① 目的对齐审查：当前实现 vs 插件本源目的（扩展主 agent 能力边界 / 主 agent 专注主路径 / 任意多模态 agent 扩展 / 多模态账号配置 / 无头模式调用）② 易用性+用户吸引力+粘性评估（安装/配置/统计体验现状）③ 三方向差距分析：A 账号配置易用性（api key 配置 / cli 无头模式 / oauth 一键登录——参考 opencodex / 账号池管理）；B 专业 Agent 调用成功率与交互效果（实际产出+交互界面）；C 统计专业性与持久化+安装配置体验 ④ 演进候选方向与优先级输入（供 ARCH-002） | **已完成——审查 APPROVED_WITH_NOTES**（review-RES-003.md：unresolved_blockers=0；0 BLOCKING/2 WARNING/3 SUGGESTION；40 处抽查 0 不符；W 级经 DEC-018 落实）。核心结论：未偏离目的；OAuth 从未被 DEC 否定（被否定的是 gcloud 公开 Client 路线）；Top3 = ChatGPT 订阅 OAuth（Q1 前置）→ 统计持久化（Q3 已裁 DSH_HOME+90d）→ 成功率闭环；Q4 已裁不引入免费链 | P0 |
| ARCH-002 | architecture | 演进路径与方案设计（依赖 RES-003 结论） | 基于 RES-003 产出：演进路线图（阶段划分+版本规划建议）+ 分方向方案设计（含 oauth/账号池可行性边界）+ 风险与回滚分析；供 D-6 演进定稿决策用 | 待开始（阻塞于 RES-003） | P0 |

## 版本规划

### 版本路线图

| 版本 | 状态 | 预计日期 | 核心范围 | 包含任务 | 关键交付物 |
|---|---|---|---|---|---|
| v0.1.7 | 已发布 | 2026-08-17 | 多模态账号 / 用量统计 / 五种执行通路 | — | tag v0.1.7 + tarball |
| v0.1.8 | **已取消（被 v0.2.0 取代，DEC-015）** | — | whole-turn 图片消息路由默认化、附件按钮泛化、image-to-image | — | 范围被 v3 迁移架构级超越 |
| v0.2.0 | **已发布（2026-08-20）** | 2026-08-20 | v3 附件路由架构全量（MIG-001）/ D-1 验收门 | MIG-001, DEV-003 | tag v0.2.0 + tarball + CHANGELOG |
| v0.3.x | 规划中（战略演进——待 RES-003/ARCH-002 定范围，DEC-017） | 待定 | 三方向：账号配置易用性（api key/cli 无头/oauth/账号池）· 调用成功率与交互效果 · 统计专业性与持久化 | RES-003, ARCH-002 + 待拆分实施任务 | 演进路线图 + 分阶段交付 |

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
