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
| 工作流版本 | 0.75.0 |
| 当前阶段 | development（开发实现，6/11） |
| 接入方式 | Scenario B 半途接入（existing）——前置 Gate 标记 passed-on-entry |

## 项目总览

| 项 | 值 |
|---|---|
| 项目名称 | dsh-agent-router |
| 当前阶段 | development (6/11) |
| 总任务数 | 17（去重后，含 GOV-002；原统计 13 滞后于后续入账） |
| 已完成 | 13 |
| 阻塞中 | 0 |
| 已关闭 | 1（DEV-001——DEC-017 重定义关闭，观测义务并入 DEV-002） |
| 关键风险数 | 1（RISK-001 活跃——主轨道 = DEV-002 + 演进路线） |
| 最近 Gate 结论 | G4 待评（v0.2.0/v0.2.1 已发布；CI 面仍缺——RISK-001；v0.3.x 演进定稿 DEC-020 + EVO-001 PoC 通过 C-1 解锁） |
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
| DEV-002 | development | 核心通路自动化测试补强 | routing/takeover 关键路径具备可重复测试（当前仅 4 个冒烟测试文件） | **进行中（2026-08-23 QA 派发 + Test Reviewer 后置）**——routing 决策链 + takeover 双层语义独立套件（新文件域，与 EVO-002 Step 6 并行）；执行包已入 execution-packets.json | P1 |
| DEV-003 | release | v0.2.0 发布收尾（DEC-015 升级） | 版本 bump 0.2.0 + CHANGELOG（v3 迁移全量记录）+ README 徽章/安装命令同步 + tarball 离线安装验证 + tag v0.2.0 + 归档触发检测 | **已完成（本提交=v0.2.0 发布提交）**——Release agent 三件套 + Developer bump/README + Release Reviewer APPROVED（W-1 有条件发布裁决入 risk-log，48h 观察期义务 DEV-001/002 关闭决策；W-3 回滚范围表述已修正）；tarball/tag 随本提交执行 | P1 |
| GOV-001 | development（治理快速通道） | 项目质量原则固化与持续改进机制建立 | 7 条原则 + 4 条编程要求立版（project-principles.md P-v1，含执行锚点映射）+ AGENTS.md 会话投影 + 持续演进协议（decision-log 入账制 + P-vN 版本化，质量基线只升不降） | **已完成**——DEC-016 决策入账 + EV-025 证据入账；check-governance 28 issues 经事实核查均为 pre-existing（插件仓自审计误期望 + 历史复审命名约定），无 GOV-001 引入项；原则文本与用户 2026-08-20 会话指令逐字一致 | P1 |
| GOV-002 | development（治理快速通道） | 治理工作流升级 0.74.0→0.75.0（/governance Scenario C） | bootstrap 段版本行更新 + plan-tracker 版本行 + 归档触发检测 + 过时锁释放 + tracker 去重卫生（FIX-001 重复行/FIX-002 陈旧行） | **已完成**——AGENTS.md @bootstrap-version 0.75.0（轻量模板 diff 仅版本行）；归档检测：跳过（已发布版本 0<2）；EV-038 | P1 |
| EVO-001 | development（v0.3.0 前置） | H2 运行时 PoC（C-1 实施第一步门禁，DEC-020） | 独立测试 profile 安装 yoke233/dsh-openai-codex-auth → 用户在场登录 ChatGPT → P1-P6 六步验证（凭据落盘 owner-only/用量面板/带图对话/token 过期自动刷新/失败形态样本/登出清理）；附加 V-EVO-2b（stream:false 直测）+ V-EVO-2c（originator 观测） | **已完成——PoC 六步全过**（EV-028）：P1 登录端到端（Plus 识别）/P2 用量 21%/P3 SSE 12 事件 POC-OK/P4 rotating+软轮换宽限窗/P5 失败样本×4/P6 全清+Codex CLI 隔离。**H2=可行，C-1 解锁（复杂度 L 确认）**。附加：V-EVO-2b 证伪（走 SSE 聚合）/V-EVO-2c 通过（自标识被接受）/代理发现（chatgpt.com 需代理 7890，auth 直连）/gpt-5.4 系支持 image 输入 | P0 |
| EVO-002 | development（v0.3.0） | C-1 ChatGPT 订阅 OAuth 实施（ADR-005） | 按 evolution-roadmap-v1 §3 实施：schemas preset/credentialFile/oauthExperimental → lib/oauth-credentials.js → 1455 loopback → oauthBegin/Exchange preset 分支 → runOauthChat codex-responses 分支 → 账号卡 UI + ToS 确认 + 登出删除（含 W-5 删账号联动凭据清理）→ C-9 埋点；每步独立提交 + Code Reviewer 审查 + 534+ 断言零回退；~18 改造点/~1140 行 | **进行中**——Step 1 ✅（11c42c0，R1，EV-029）；Step 2 ✅ 凭据模块（8ba6ab18，R2，EV-030）；Step 3 ✅ 1455 loopback 惰性（128cb810，R3，EV-031，DEC-021）；Step 4a ✅ 加固（a2567db，R4，EV-032）；Step 4b ✅ 授权流 preset 分支（564e18c，R5，EV-033——R3 P2 清零）；Step 5 **闭环（db1ddf7 + R6 APPROVED_WITH_NOTES/0 blocker，EV-041/043——R5 P2 存量清零，链 R1-R6 全 P2 闭环）**；待办：Step 6 账号卡 UI + ToS 确认 + 登出删除（含 W-5 联动）+ Q2 能力接口 + **代理发现（部署级缺口，Step 6 任务书必含——R6/EV-041 双记录，首联顺带裁决 R6-F2/F5）** + C-9 埋点；DEC-022-D 版本指纹转 Step 6/7；H2 PoC 已通过（EV-028）解锁；执行包已入 execution-packets.json；H2 PoC 已通过（EV-028）解锁；执行包已入 execution-packets.json | P0 |
| EVO-003 | development（v0.3.1） | C-3 统计持久化实施（ADR-006，可与 EVO-002 并行开发） | lib/stats.js 分离（service.js 2965 基线净减 ~220）+ DSH_HOME 按天 JSONL + 异步批量 flush + 数据安全四件套单测 + 成本单价表 + CSV 导出 + W-4 persist 开关往返语义；~14 改造点/~1000 行 | **进行中——Phase 1 闭环（1199c0b，R1 APPROVED_WITH_NOTES/0 blocker，EV-039/042，8 裁量点全 adopt）**；Phase 2（service.js 委托 + W-4 persist 开关 + smoke 接线 + statsExport RPC，前置项 F1/F2/F4 已入包）串行等 F4 批次释放 smoke.mjs 锁 | P1 |
| FIX-001 | development（P0 热修） | twin adapter 补 prepareCall——宿主 dsh-llm prepared-dispatch 接口演进兼容 | RCA：宿主 adapterStream 每次分发先调 adapter.prepareCall，twin 手工对象字面量缺该方法 → 接管路由全量 TypeError。修复：twin 显式 prepareCall + 接口奇偶回归测试 | **已完成**——f1c4c91（EV-034）+ R6 审查 APPROVED_WITH_NOTES（EV-036）+ FIX-001b 返工 cba0d98（R6-F1 空转通过修复/F2 动态枚举/F3 增强 + 2 测试 bug；parity 首次真实运行 14 断言全绿）——终态闭环 | P0 |
| RES-003 | research | 战略对齐与演进调研（DEC-017 方向授权） | ① 目的对齐审查：当前实现 vs 插件本源目的（扩展主 agent 能力边界 / 主 agent 专注主路径 / 任意多模态 agent 扩展 / 多模态账号配置 / 无头模式调用）② 易用性+用户吸引力+粘性评估（安装/配置/统计体验现状）③ 三方向差距分析：A 账号配置易用性（api key 配置 / cli 无头模式 / oauth 一键登录——参考 opencodex / 账号池管理）；B 专业 Agent 调用成功率与交互效果（实际产出+交互界面）；C 统计专业性与持久化+安装配置体验 ④ 演进候选方向与优先级输入（供 ARCH-002） | **已完成——审查 APPROVED_WITH_NOTES**（review-RES-003.md：unresolved_blockers=0；0 BLOCKING/2 WARNING/3 SUGGESTION；40 处抽查 0 不符；W 级经 DEC-018 落实）。核心结论：未偏离目的；OAuth 从未被 DEC 否定（被否定的是 gcloud 公开 Client 路线）；Top3 = ChatGPT 订阅 OAuth（Q1 前置）→ 统计持久化（Q3 已裁 DSH_HOME+90d）→ 成功率闭环；Q4 已裁不引入免费链 | P0 |
| FIX-002 | development（P0 热修） | 默认模型接管行为修正（双层）——覆盖用户手动选择 + 中间层故障放大 | 用户报障 ×2（①切 session/起子代理时模型被强制切 twin ②文本强制走 twin 失败）。RCA：两个独立接管面均无开关——服务端 wrapper syncDefaultModel 三触发点无条件接管 + 客户端 ModelTakeover 会话级接管（effect 依赖 sessionId，起子代理即触发）。修复（用户裁决方案 A）：takeoverDefaultModel 开关默认 false 统一约束两层（服务端一次性接管+来源记忆；客户端 catalog 镜像开关+armed 条件） | **已完成（终态）**——双层实现（d264f03+5c8f2dc）→ R7 NEEDS_CHANGE（P0×1 用户主权反转缺陷）→ 批次 1（72b2670：F1 takeoverMemory 三态/F2 闭包标记/F3 判别断言）+ 批次 2（0b3c15d：F4 不变量③④断言+掏空修复）→ **R8 复审 APPROVED_WITH_NOTES/0 blocker**（EV-040/044/045；F1-F4 全修复，N1-N3 P3 遗留，F8 转发布说明）；返工载体待下版本承载（发布决策属用户）；DEC-022-D 版本指纹转 EVO-002 Step 6/7 | P0 |
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
| **v0.3.1** | 规划中 | 待定 | 统计持久化与专业指标（C-3）：lib/stats.js 分离 + DSH_HOME 按天 JSONL + 数据安全四件套 + 成本估算 + CSV 导出；**W-4 绑定**（persist 开关往返语义） | EVO-003 | 重启保留 + 按天聚合/p50/p95/成本 + 出口条件八项 |
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
