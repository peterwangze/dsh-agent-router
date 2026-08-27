# REL-002 R0 设计审查报告（Design Reviewer — 版本规划文档设计视角）

**Round**: R0（首审） | **审查对象**: `docs/release/version-plan-v0.3.0.md`（实测 288 行；派发 prompt 预估 ~340 行，以实测为准） | **日期**: 2026-08-27 | **Reviewer**: Design Reviewer（独立，非文档作者）

## 结论：**APPROVED_WITH_NOTES**（unresolved_blockers=0）

0 BLOCKING / 3 P2 / 5 P3。规划核心结构（裁决选项完备性、事实零编造、里程碑 DAG、门禁映射、No-overclaim 边界）全部成立；P2 均为可随 M-1 资产产出闭环的非阻塞缺口，不影响 M-0 四项裁决呈报的有效性。

## 发现总表

| ID | 级别 | 位置 | 摘要 | 修复建议 |
|---|---|---|---|---|
| F-1 | P2 | §3 GATE-5 / §4 M-3 | GATE-5（tarball 隔离冷装）无所属里程碑：M-3 复跑清单未含冷装，M-6 冷装是发布后动作，M-4 却要求 GATE-1~5,7 全 PASS——挂点断链 | M-3 或 M-4 前置补入 bump 后重打包+隔离冷装复跑；GATE-5 行标注执行里程碑 |
| F-2 | P2 | §4 M-2 | 出口①真机验证失败路径未定义（诊断→入账→修复→回 M-2 的回路）；R-E1/RISK-003 仅提供素材，里程碑结构未闭合 | M-2 行补失败处置语义一句（缺陷走 change-triage 入账→修复→重回 M-2） |
| F-3 | P2 | §5.1 | pnpm-lock 首次入仓后安装面时变风险未披露：npm tarball 不含 pnpm-lock.yaml（files 清单未列），发布后新安装解析 undici 7.x 最新，与测试时点不同；fail-loud 是缓解但未列残余风险 | §5.1 增一行：lockfile 不进 tarball→安装期解析时变→major 判别 fail-loud 防线（可选锁定策略说明） |
| F-4 | P3 | §1.2/§2.1/§7 | 行号引用微漂：设备码常量实际 L54-58（引 55-56 漏 verification L57）；runCodexResponsesChat 实际 L2740（引 2728）；oauthCapabilities 调用 L2567（引 2565）。实质主张全部成立 | M-1 资产产出时按实读校正行号 |
| F-5 | P3 | §2.2 A-2a | 设备码补实现工作量估计（"S 量级"）无量化依据（roadmap C-1 ~1140 行未拆分设备码份额） | 任务入账时 triage 附量化估算 |
| F-6 | P3 | §4 M-5 | GitHub Release 依赖用户 gh 授权，REL-001 先例实际发生过重新授权延迟，存在 tag 已推/Release 卡住分叉风险 | M-5 增 gh auth 预检步骤 |
| F-7 | P3 | §5.1 RISK-003 | parity 看护覆盖面口径未区分：枚举基类方法可捕获新增型漂移（prepareCall 型），rc.8 的移除型漂移（图片投影移除）依赖行为断言捕获 | RISK-003 处置列注明 parity 覆盖边界 |
| F-8 | P3 | §1.4 | 测试基线时点账目：EVO-004 终态 877/0 与 FIX-006 后 873+1skip 差值未显式对账（仅解释了 rc.8 866 口径） | M-3 复跑时以 git log 实测统一基线账目 |

## 六维度逐项结论（100% 覆盖）

1. **方案完整性 ✅**：A-1 三选项（a 并入/b 两段叙事/b' 剥离重建）各有利弊与取舍分析，b 的"名实不符"论证、b' 的"审查资产浪费"论证充分；A-2 三选项覆盖可行空间，选项 c 如实标注"手动粘贴实现面未核实，本规划不预设"；A-3/A-4 各三选项。裁决表四项全部带来源留痕，且"裁决=用户"边界严格（§6.10）。
2. **蓝军挑战 ✅（6 条独立 ID，见下）**：含派发 prompt 点名的四条（出口①失败/rc.9 滚动/并入体积/pnpm-lock 安装面），每条有缓解存在性判定或如实标注缺失（F-1/F-2/F-3 即缺失项）。
3. **里程碑依赖结构 ✅（DAG 无环）**：M-0 裁决→M-1 打包（消费 A-4b/A-1）→M-2 用户 E2E→M-3 复跑（在 M-1 提交落地后，时序正确）→M-4 终审+授权→M-5 执行→M-6 验证→M-7 收尾→M-8 复盘。GATE↔里程碑映射闭合除 F-1（GATE-5）一处。
4. **接口/契约面 ✅**：版本号契约（MINOR 四证：E3-a 双轨/门控缺省 false/EV-072/A-006 回退开关）、tag/CHANGELOG 契约（git log 实采对照+breaking 高亮=无+排除清单=§2.4）无歧义；A-4 semver 技术依据成立（`^0.1.0-rc.6` 同 tuple 预发布链确含 rc.8；提升至 rc.8 确实排除 rc.6 环境——双向论证均正确）。
5. **非功能面 ✅**：kill-switch 三层+「验证过可以」断言语义、回滚顺序约束（undici 不可单独回退）、RISK-001 CI 披露三选项、flag 债务控制（oauthExperimental 转正评估）、stats ⑦ 性能项诚实列为观察项——可扩展性/可维护性覆盖充分。
6. **Bar Raiser 独立审查 ✅**：本审查即独立评审（视角切换后独立得出结论），GATE-6 双审要求（Release+Design）已在规划内正确挂点。

## 蓝军挑战记录

| ID | 攻击向量 | 影响评估 | 当前缓解 | 残余风险 | 建议增强 |
|---|---|---|---|---|---|
| BC-R1 | M-2 真机验证失败（代理环境差异/端点变更） | 发布阻断在最后门禁，M-0~M-3 工作悬置 | 部分：R-E1 行（kill-switch+降级链+最坏回退单 commit）+ FIX-006 先例证明回路可走通；**失败循环未写入里程碑** | 中 | F-2 |
| BC-R2 | 宿主 rc.8→rc.9+ 再漂移（发布前后） | 接管路由/图片投影再断裂 | 存在：RISK-003 活跃+parity 14/14+症状知识库+「发布后漂移=回归触发条件」 | 中（移除型漂移覆盖弱） | F-7 |
| BC-R3 | tarball 无 lockfile→安装期解析时变 | 发布后新装用户 undici 解析到测试未目击版本 | 部分：major 判别 fail-loud（FIX-006 已落地）；**§5.1 未披露该残余** | 中 | F-3 |
| BC-R4 | A-1 并入后双主题体积/审查负担 | GATE-7 对照 ~30 commits+CHANGELOG 膨胀 | 存在：选项 a 弊列如实承认+变更控制对冲+M-3 stats 单测复核增补 | 低 | — |
| BC-R5 | GATE-5 执行挂点断链 | M-4 checklist 要求 PASS 但无人产出 | 缺失（v0.2.1 先例是 tag 前完成） | 中 | F-1 |
| BC-R6 | gh 授权延迟→tag/Release 状态分叉 | tag 已推 Release 卡住 | 部分：REL-001 先例已载明授权后执行；无预检 | 低 | F-6 |

## 零编造抽查（13/17 项，门槛 ≥5）

全部相符：#1 v0.2.1/a1ab717（tracker:112）✅、#2 version 0.2.1（package.json:4 实读）✅、#3 EVO-001（:92）✅、#4 EVO-002+待办（:93/:50-51）✅、#5 EVO-003/004（:94-95）✅、#6 FIX-006（:99，873+1skip/110/114/14 与 §1.4 逐字吻合）✅、#8 v0.3.0=C-1+W-5/S-3（:113+DEC-020 decision-log:24）✅、#9 C-3 归 v0.3.1（:114）✅、#10 oauthCapabilities（service.js:523/870/2557 grep 命中）✅、#11 设备码仅常量（grep 全 lib 仅 oauth-credentials.js:54-58 三处 deviceUrls 常量，零 oauthDevice* RPC）✅、#12 oauthExperimental 缺省 false+UAYOR（schemas.js:223/225）✅、#13 RISK-001/003 活跃（risk-log:5/:7）✅、#16 CHANGELOG:29 预告（原文逐字核实）✅。#15（~30 commits）规划已自标注待 git 实采——零编造纪律合格。

## 硬门槛裁决

候选方案数 ≥2（四裁决各 3 选项）✅ | 决策字段完整（日期/背景/选项/利弊/影响/后续=M-0）✅ | 蓝军 ≥3 独立 ID（6 条）✅ | 依赖无环 ✅ | Bar Raiser 已执行（本报告）✅ —— **全部通过**。

**目标一致性**：与项目目标（多模态专业 agent 路由，主线 1 账号配置易用性）及 DEC-017/018/019/020 链一致；A-1 范围倒挂是事实驱动的偏差呈报而非擅自决策，处置合规。

**只读声明**：本次审查仅使用 Read/Grep/Glob/skill 加载，零 Write/Edit/Bash，未触碰 .governance/。结论供 Coordinator 经 review-record CLI 落盘（--task REL-002 --round 0 --result APPROVED_WITH_NOTES --reviewer DesignReviewer）。

**备注跟踪建议**：F-1/F-2/F-3 三条 P2 建议随 M-1 发布资产产出（checklist 模板+rollback 三件套）闭合，无需重写规划；F-4~F-8 P3 随 M-1/M-3 顺带处理。
