# 会话快照 — 2026-08-30（六任务闭环日：v0.3.1 + v0.3.2 双发布 + 双 P0 修复 + DEC-027 + EVO-007 T1 闭环）

- **session_id**: 20260830-V031-V032-DOUBLE-RELEASE
- **session_date**: 2026-08-30
- **agent**: glm @ DeepSeek Harness + software-project-governance v0.78.0
- **mode**: always-on × maximum-autonomy

## 当前状态

- **current_stage**: development (6/11)；**v0.3.2 已发布**（tag v0.3.2 = d63b368，GitHub Release + tarball 1,502,496B；远端 main = b796741 同步）
- **current_gate**: G4 待评（RISK-001）；门控基线 **smoke 963**（12 套件 + fix-009 9/9 + fix-010 13/13）
- **tracker**: 35 终态（34 已完成 + 1 关闭）| 0 阻塞 | 0 锁
- **principles**: P-v2 + DEC-027 三不变量（模态保真直传/原始呈现不可侵犯/全链无感）

## 本会话闭环（六任务，跨 08-29~30）

- ✅ EVO-006 转正 + REL-004 **v0.3.1 发布**（EV-085~087）
- ✅ FIX-009 image-solo 400（8877365，用户复验过；EV-088）
- ✅ FIX-010 图片气泡回归（020909b，用户复验过「气泡显示已经正常」）+ **DEC-027 立版**（EV-089）
- ✅ EVO-007 账号面板 UX（65226a3 + T1 返工 3665d6a；R1 通过；GUI 2/3 验证 + 点③断言闭环；EV-090）
- ✅ REL-005 **v0.3.2 发布**（收尾段 1d2bf36[ P1-1 live default 对齐 + P2-2 hygiene + README 收口] + 三产物 + R0/R1 双审 + M-4 Go + E-1~E-7 全链；EV-091/092）
- 📌 **E-7 归档计数异常显性化**：dry-run「已发布版本 0<2」而 13 tags 实存——FIX-281 域新证据（evidence-log ~235KB 越 200KB 阈值，归档被解析缺陷阻断——插件仓修复后触发）

## 待办池

| 候选 | 状态 | 说明 |
|---|---|---|
| v0.3.2 发布后验证 | 用户动作 | 面板 UX 已验 2/3（发布前）+ 版本号 0.3.2 确认（重启或刷新后设置页/CHANGELOG） |
| 插件仓 FIX-281 | 插件仓会话（优先级提升） | 9 项 + 归档计数新证据（E-7）+ TPA 伪推荐/hooks 产品码路径/28s evidence 增长被阻断——修复后触发归档 |
| C-4+C-5 成功率闭环 | v0.3.3 规划域 | 路线图行（原 v0.3.2 计划——REL-005 实际承载变更，M-7 已更新口径注记） |
| FIX-008 / 出口③ / C-6 / C-2 | 等用户需求 | — |
| deepseek-official 视觉端点 | 宿主域观察 | 挂起中——vision 用 glm/glm-5.3-flash |

## 重要事实存档

- **发布面**：v0.3.2 Release https://github.com/peterwangze/dsh-agent-router/releases/tag/v0.3.2（tarball 1,502,496B）；远端 main = b796741
- **验证基线（v0.3.2 权威）**：smoke 963/0 · 12 套件全 exit0 · fix-009 9/9 · fix-010 13/13（E 组后）· 隔离冷装通过
- **审查链**：本会话六条审查全部 APPROVED_WITH_NOTES/0（FIX-009 R0 / FIX-010 R0 / EVO-007 R0→R1 T1 / REL-005 R0 / REL-005 R1）
- **归档风险**：evidence-log ~235KB（阈值 200KB WARN / 250KB ERROR）——FIX-281 修复前持续增长，250KB 前需插件仓修复触发归档
- 宿主 rc.2 无漂移；junction → 开发树（v0.3.2 已含）

## 下次会话第一动作

1. skill 加载 software-project-governance → resolve_entry.py --json
2. 读本快照 + plan-tracker（35 终态）
3. 等用户方向：v0.3.3 规划（C-4+C-5）/ 插件仓 FIX-281 会话（归档风险）/ 其它需求
   - 推荐依据：RECO-REL-005（task-priority-analysis 机写，2026-08-30——全终态，方向为用户决策域）

> FIX-262/REQ-108：本节推荐引用 RECO-REL-005 机器快照行（2026-08-30）。
