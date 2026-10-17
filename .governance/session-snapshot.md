# 会话快照 — 2026-10-17

- **session_id**: 20261016-ARCH005-HOST020-V060
- **session_date**: 2026-10-17（会话起于 10-16，跨 context 续接两次）
- **agent**: zai-coding-cn-router/glm-5.3 @ ZCode/DSH + software-project-governance **v0.98.0**
- **工作流版本**: 0.98.0（GOV-014 本链升级 0.83.0→0.98.0）
- **最新已发布版本**: **v0.6.0（2026-10-17，annotated tag `3cc1501`→`74ad536` + GitHub Release + 资产 `dsh-agent-router-0.6.0.tar.gz` 1,702,929B/sha1 `579cb708…`/公网 curl 200 三重终验全绿——EV-224）**
- **mode**: always-on × maximum-autonomy（文件策略 = danger-full-access，approval prompts 已禁用）

## 当前状态

- **current_stage**: 防护网与CI/CD（8/11）——ARCH-005 发布承载完成；G5~G7 待逐门评估
- **trigger_mode / permission_mode**: always-on / maximum-autonomy
- **远端**: `origin/main` = `74ad536` + 本收口 commit（本会话 push 链 `d71dee2`→`74ad536`→收口批；CI run 38991525002 于 `74ad536` 三 job 全绿实证；收口批 CI 跑次待复核——治理面提交，预期绿）
- **锁**: ARCH-005 收口批内释放（单锁串行实施链——tests/host-radar.mjs 已 amend 入锁）
- **健康**: write-guard 全程 PASS；pre-commit 提示 2 条 stale risk WARN 已由本批 risk-log 刷新处置

## 本轮已完成

- **ARCH-005 宿主 0.1.5-rc.2→0.2.0-rc.2 适配 + 版本依赖解耦全链闭环并发布 v0.6.0**：
  - 十实施批全落地：R0 靶子修复+基线登记 `bd17cac` / R1 声明面基线跳跃 `367b65f` / A1 装载门取证程序 `678ff97` / A2 codec create() 工厂 `43e8267` / A3 settings Config 声明制 `b6aeac4` / A4 图片直传恢复（T-1 定性=恢复非回归）`66878ea` / R2 协商三态 `6d9fead` / R3 看护矩阵化 `dffb553` / R4 升级雷达 `e01213e` / R5 宿主升级 SOP `5b08fea`；**四断点（装载门/RPC codec/settings 声明/图片直传）全解除**——「插件在 0.2.0 宿主完整加载」判据成立
  - R4F CI 矩阵 env 泄漏修复 `d71dee2`（tests/host-radar.mjs 套件封闭化——PROBE_ENV_KEYS 单点净化；矩阵 job 13 条红转绿；REVIEW-ARCH-005-R13 AWN/0）
  - 发布链：E-1~E-3 三件套 `74ad536`（bump 0.6.0 + CHANGELOG 七段 + README 版本面；会话中断丢 agent 报告经产物审计+复验恢复）→ CI 三 job 全绿（38991525002）→ E-4 Release Review **APPROVED_WITH_NOTES/0**（REVIEW-ARCH-005-R14；11/11 PASS + 版本位独立建议维持 MINOR）→ E-5 ask 未响应按用户预授权推进（DEC-34 如实标注）→ E-6 tag+Release+资产三重终验（gh API+下载 sha 双证+Coordinator curl 200/1702929B）
  - 审查链 REVIEW-ARCH-005-R3~R14 全 APPROVED_WITH_NOTES/unresolved_blockers=0
  - 治理：DEC-33（DEC-1~7 默认采纳）→ DEC-34（发布终态三裁决）；EV-224 发布机证；tracker/risk-log（RISK-001/003 刷新）终态
- **v0.5.0 后真机修复四件随版交付**：FIX-046 面板取数 / FIX-048 条件化接管 / FIX-049 贴图误切（+配置字段名勘正代改）/ FIX-052 统计归属（均此前会话完成，本版首随发布面交付）

## 遗留任务

| 任务 ID | 描述 | 完成百分比 | 阻塞原因 | 优先级 |
|---------|------|-----------|----------|--------|
| ARCH-005 真机复验 | 用户重装 v0.6.0 后按 docs/host-upgrade-sop.md §7 清单 12 条复验（装载门/五场景含 N-1 默认值/三态徽章双层/图片直传/FIX-052·049 顺延项——每条 P10-③ 证据形态） | 95%（机器面全闭环） | 用户 GUI 复验动作（重装 = `dsh plugin --profile web add file:./` 或 Release tarball） | P0 |
| 雷达首跑复核 | host-radar.yml schedule 首窗（周一 03:30 UTC）后复核 Actions 日志与 issue 载体行为（R4 登记义务；gh/GITHUB_TOKEN 真机行为以首跑为准） | 未启动 | schedule 时窗未到 | P1 |
| E-4 备注 N 系列 | N1 基线档案 job API 字段异象观察 / N5 CI 平台警告（Node 20 deprecation、ubuntu-latest 2026-10-19 迁移）维护卫生 | 未立项 | — | P3 |
| R4F 备注 F-1/F-3 | host-radar 套件污染负控 canary（判别环境无关化）/ PROBE_ENV_KEYS 与 probe 键集机器互锁 | 未立项 | — | P3 |
| FIX-052 台账微批 | F-1 继承缺失诊断 + F-2 淘汰盲区诊断 + F-4 父缺失分支判别用例 | 未派发 | — | P2 |
| 卫生批候选 | fix-031 H7 标签语义 + ctx-services L36 注释 + 每日用量表列宽折行 | 未立项 | — | P3 |
| GOV-009 / GOV-011 | 跨仓（宿主仓钩子边界 / 治理工具解析侧缺陷 7 项） | 已立项待派发 | 跨仓授权 | P2 |
| G5~G7 Gate 评估 / Check 36 R2 裁决 | 阶段推进（项目已发布 v0.6.0，阶段标签落后）；RISK-003 缓解引用 ARCH-005 已完成——Check 36 R2 处置可重评 | 未启动 | — | P2 |

## 待确认决策

| 决策 ID | 标题 | 上下文 | 截止日期 |
|---------|------|--------|----------|
| — | — | 无未决（DEC-1~7 经 DEC-34 默认确认终态——**非用户显式确认**，E-5 ask 未响应按预授权推进；若用户对 DEC-1 支持面单范围口径有异议可重开，已落地批 revert 粒度在案） | — |

## 活跃风险

| 风险 ID | 描述 | 升级截止日期 | 负责人 |
|---------|------|-------------|--------|
| RISK-003 | 宿主接口演进（ARCH-005 后防护四层常设化：基线档案单源/三态徽章/CI 矩阵+周频雷达/SOP；保持活跃——宿主持续演进；雷达首跑待实证） | 宿主 node_modules 变更后首次接管路由调用 / 雷达首窗复核 | Coordinator |
| RISK-001 | CI 回归保护（主轨道+矩阵闭合；残余 = 真机 GUI/OAuth/宿主装配时序等未覆盖面清单——README 边界清单在案） | — | Coordinator |

## 未完成 / 已延期

- ARCH-005 真机复验 12 条（用户重装后承载）
- host-radar schedule 首跑复核（周一 03:30 UTC 窗口后）
- 收口批 push 的 CI 跑次复核（治理面提交）
- FIX-052 F-1/F-2/F-4 P2 微批 + 卫生批候选 + E-4/R4F P3 备注
- 跨仓 GOV-009/GOV-011（需授权）

## 下次会话优先级

1. **重装 + 真机复验结算**：用户 `dsh plugin --profile web add`（或 Release tarball 离线装）→ 重启 DSH → SOP §7 清单 12 条逐条复验补终验证据行（含 FIX-052/FIX-049 顺延项）
2. **雷达首跑复核**（schedule 首窗后 Actions 日志 + issue 载体 + 心跳形态）
3. FIX-052 F-1/F-2/F-4 P2 微批 + E-4/R4F P3 备注（可合并一次触碰评估）
4. GOV-009 / GOV-011（跨仓，需授权）
5. G5~G7 Gate 评估 / Check 36 R2 处置重评（RISK-003 缓解已落地）

> FIX-262/REQ-108：本节派生自完成必推荐快照。
> - **推荐快照引用**: **RECO-ARCH-005-RELEASE**（完成必推荐 ask 于收口批呈现——首选项 = 重装+真机复验清单 12 条）

## 用户偏好设置

- 交互节奏：ask 未响应时按预授权+审查终态推进并如实标注（DEC-33/34 先例）；关键决策 ask 必达
- 文件策略：danger-full-access + approval prompts 禁用；git commit+push 自动（push 走 SSH over 443 瞬态 URL——OAuth token 缺 workflow scope，不改用户配置）
- 角色分工：用户执行真机动作（重装/重启/点击/观察）；Coordinator 只做机器可完成的复现与取证（P10-②）
- 安全红线延续：「不允许修改当前仓之外的其它仓代码」仍有效；真实环境三选一 + R4 逐条上报全程遵守（$TEMP 沙箱内验证零 HOME 写入）
