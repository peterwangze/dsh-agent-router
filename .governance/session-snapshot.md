# 会话快照 — 2026-10-20

- **session_id**: 20261016-ARCH005-HOST020-V060（续会话；10-20 段 = ARCH-006 基线刷新）
- **session_date**: 2026-10-20（主链 10-16~17 完成 ARCH-005+v0.6.0 发布；10-20 宿主再升级触发 ARCH-006）
- **agent**: zai-coding-cn-router/glm-5.3 @ ZCode/DSH + software-project-governance **v0.98.0**
- **工作流版本**: 0.98.0
- **最新已发布版本**: **v0.6.0（2026-10-17，tag `3cc1501`→`74ad536` + Release 资产三重终验）**；**main 领先发布版**：`6bbf78b`（ARCH-006 基线刷新——未发版，0.6.1 patch 候选待用户决策）
- **mode**: always-on × maximum-autonomy

## 当前状态

- **current_stage**: 防护网与CI/CD（8/11）；G5~G7 待逐门评估
- **trigger_mode / permission_mode**: always-on / maximum-autonomy
- **远端**: `origin/main` = `6bbf78b`（本会话 push 链 `d71dee2`→`74ad536`→`4d7f331`→`6bbf78b`+收口批；CI 39392930138 于 `6bbf78b` 五 job 全绿）
- **锁**: ARCH-006 收口批内释放
- **宿主形态**: 本机已装 **0.2.1-rc.2**（ARCH-006 已吸收为已测基线 primary；装载门/apply/契约/探针全绿）

## 本轮已完成

- **ARCH-005 宿主 0.2.0 适配 + 解耦全链 + v0.6.0 发布**（10-16~17，详见 git log 与 EV-224；十批 + R4F + 发布链 E-1~E-6 + 审查链 R3~R14 全 AWN/0）
- **ARCH-006 宿主 0.2.1-rc.2 基线档案刷新（10-20）——解耦策略首次实战验证通过**：
  - 雷达首窗（run 39228057201，schedule 10-19 09:10 UTC）自动预警 0.2.1-rc.2 + 0.2.1-alpha.5 开 issue #1/#2——零人工介入
  - Coordinator 检测定性：四类 diff 全 additive（锚 0 漂移 / events +1 / schemas +3 字段 / 包表 8 版本号差）；运行面双门 GREEN；全量门控唯一红 = host-contract S7 schema 超集精确检测；三态黄态桩机证
  - Developer 刷新批 `6bbf78b`（注册表 0.2.1 primary/0.2.0 frozen + 事件白名单 28 + schema 白名单 9 字段 + 两判据语义演进）；审查 R0 AWN/0；CI 五 job 全绿（0.2.1 矩阵 job 单源派生自动新增）
  - EV-225；雷达 issue #2 关闭（#1 alpha 保持打开）
- **雷达首跑复核义务闭合**（R4 登记 → 本会话实证 schedule 触发 + issue 载体 + dist-tags 全枚举含预发布通道）

## 遗留任务

| 任务 ID | 描述 | 完成百分比 | 阻塞原因 | 优先级 |
|---------|------|-----------|----------|--------|
| 真机复验 | 用户重装后按 SOP §7 清单 12 条复验（0.2.1-rc.2 上；FIX-052/049 顺延项在内）——装 v0.6.0 即可用（黄态），装 main/0.6.1 则绿态 | 95% | 用户 GUI 复验动作 | P0 |
| 0.6.1 发版决策 | 基线刷新承载发版（bump+CHANGELOG+tag/Release）——用户决策 | 未启动 | 待决策 | P1 |
| ARCH-006 P3 台账 | caretRangeContains rc 错位方向分歧 / versionTripleOf 畸形输入 fail-closed 对齐 / smoke sh 臂环境性（登记） | 未立项 | — | P3 |
| FIX-052 台账微批 | F-1/F-2/F-4（Reviewer 建议） | 未派发 | — | P2 |
| 卫生批候选 | fix-031 H7 + ctx-services 注释 + 用量表列宽 + E-4 N 系列（N1/N5）+ R4F F-1 canary/F-3 键集互锁 | 未立项 | — | P3 |
| GOV-009 / GOV-011 | 跨仓（需授权） | 已立项待派发 | 跨仓授权 | P2 |
| G5~G7 Gate / Check 36 R2 | 阶段推进（已发 v0.6.0；RISK-003 缓解已落地可重评） | 未启动 | — | P2 |

## 待确认决策

| 决策 ID | 标题 | 上下文 | 截止日期 |
|---------|------|--------|----------|
| — | 0.6.1 发版（候选） | 基线刷新批 `6bbf78b` 已在 main 未发版；发 0.6.1 patch（bump+CHANGELOG+tag/Release）可让重装版本=发布版+绿态徽章 | 用户决策 |

## 活跃风险

| 风险 ID | 描述 | 升级截止日期 | 负责人 |
|---------|------|-------------|--------|
| RISK-003 | 宿主接口演进（四层防护常设化且经 0.2.1-rc.2 实战验证；保持活跃；issue #1 alpha 通道待吸收） | 宿主 minor 跳位（0.3.x）时 gate-block regime | Coordinator |
| RISK-001 | CI 回归保护（矩阵三基线全绿；残余真机面清单不变） | — | Coordinator |

## 未完成 / 已延期

- 真机复验 12 条（用户重装承载）；0.6.1 发版决策
- ARCH-006/FIX-052/E-4/R4F 的 P2/P3 台账微批
- 跨仓 GOV-009/011（需授权）

## 下次会话优先级

1. **0.6.1 发版决策 + 重装真机复验结算**（发版则走发布链 E 缩编：bump/CHANGELOG/门控/冷装→审查→发布；随后 SOP §7 清单 12 条）
2. ARCH-006 P3 + FIX-052 F-1/F-2/F-4 + 卫生批（可合并触碰评估）
3. GOV-009 / GOV-011（跨仓，需授权）
4. G5~G7 Gate 评估 / Check 36 R2 重评

> FIX-262/REQ-108：本节派生自完成必推荐快照。
> - **推荐快照引用**: **RECO-ARCH-006-REFRESH**（完成必推荐 ask 于收口批呈现——首选项 = 0.6.1 发版决策+重装复验）

## 用户偏好设置

- 交互节奏：ask 未响应时按预授权+审查终态推进并如实标注；关键决策 ask 必达；本段新增指令「刷新然后提交推送」已执行（范围克制：无发版——发版为独立决策）
- 文件策略：danger-full-access；commit+push 自动（SSH over 443 瞬态 URL）
- 角色分工：用户执行真机动作；Coordinator 机器取证
- 安全红线延续：「不允许修改当前仓之外的其它仓代码」；真实环境三选一 + R4 逐条上报
