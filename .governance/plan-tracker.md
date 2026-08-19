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
| 总任务数 | 7 |
| 已完成 | 3 |
| 阻塞中 | 1 |
| 关键风险数 | 2 |
| 最近 Gate 结论 | G4 pending（开发+测试→CI） |
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
| MIG-001 | development | v3 迁移实施 Step 0-10（DEC-012） | 按架构 v3 §8 迁移路径逐步实施：Step 0 基线测试 → Step 1 移除整轮路由 → … → Step 10；每步独立提交+测试全绿；验收门 = D-1 五条指标（DEC-012） | 进行中——Step 0-5a 完成（7cb2024/b7261d5/a23b338/374edfa + Step 5a 本提交；R1-R5 审查链全通过，EV-011~015，R5 为恢复会话重试成功）；下一步 Step 5b（内部寻址迁移：prepareChatFiles/materializeCliImages/selectAttachments 改经 M2）→ Step 5c（RPC wire）；P2 遗留 F-1/F-2（R4）+ F-1/F-2（R5：物化双读无断言/read displayPath 字符串 vs FsTarget 不一致）——Step 5b 一并处理 | P0 |
| DEV-001 | development | v0.1.8 行为基线回归验证 | 跑通 tests/smoke.mjs + client-render.mjs，记录 whole-turn 图片路由默认化（c2648d2/963b4f5）后的基线输出 | 待开始 | P1 |
| DEV-002 | development | 核心通路自动化测试补强 | routing/takeover 关键路径具备可重复测试（当前仅 4 个冒烟测试文件） | 待开始 | P1 |
| DEV-003 | release | v0.1.8 发布收尾 | 发布说明/CHANGELOG + tarball + tag（package.json 已 0.1.8，最新 tag v0.1.7） | 阻塞（依赖 RES-001 结论——DEC-003 发布暂停） | P1 |

## 版本规划

### 版本路线图

| 版本 | 状态 | 预计日期 | 核心范围 | 包含任务 | 关键交付物 |
|---|---|---|---|---|---|
| v0.1.7 | 已发布 | 2026-08-17 | 多模态账号 / 用量统计 / 五种执行通路 | — | tag v0.1.7 + tarball |
| v0.1.8 | 进行中（发布暂停——待 RES-001 调研结论，DEC-003） | 待定 | whole-turn 图片消息路由默认化、附件按钮泛化、image-to-image | DEV-001, DEV-003 | tag + tarball + 发布说明 |
| v0.2.0 | 规划中（占位——落位版本待确认） | 待定 | 质量基线：核心通路自动化测试 | DEV-002 | 自动化测试套件 |

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

## 需求跟踪矩阵

| 需求 ID | 描述 | 来源 | 优先级 | 关联任务 | 当前状态 | 验证方式 |
|---|---|---|---|---|---|---|
| REQ-001 | 多模态任务按能力标签自动路由（image/speech/文本/子代理） | README 项目目标 | P0 | DEV-001 | 已实现待验证 | tests/smoke + 手工路由验证 |
| REQ-002 | 核心通路回归保护 | 治理接入评估（EV-001） | P1 | DEV-002 | 待开始 | 自动化测试通过率 |

## 变更控制流程

临时任务纳入机制（新任务先入账再动手）：

1. **优先级判定**（P0/P1/P2）
2. **版本适配**（归入当前版本或下一版本）
3. **冲突检查**（与活跃任务文件/范围冲突 → 串行化）
4. **版本范围更新**（本文件路线图行同步）

**快速通道**：仅限治理记录类修改（`.governance/**`），可跳过 Agent Team spawn，由 Coordinator 直接执行（M1.2）。
