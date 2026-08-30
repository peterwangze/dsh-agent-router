# 会话快照 — 2026-08-30（v0.3.1 发布 + FIX-009/FIX-010 双 P0 修复 + DEC-027 立版——待用户重启复验）

- **session_id**: 20260830-V031-FIX009-FIX010
- **session_date**: 2026-08-30
- **agent**: glm @ DeepSeek Harness + software-project-governance v0.78.0
- **mode**: always-on × maximum-autonomy

## 当前状态

- **current_stage**: development (6/11)——v0.3.1 已发布（tag v0.3.1 = 5ca8b87）；FIX-009/FIX-010 修复已入仓未 push（ahead 5：8877365/d92dfba/ec94a6c/020909b/49ac8ab）
- **current_gate**: G4 待评（RISK-001 CI 面）
- **工作流版本**: 0.78.0
- **tracker**: 33 终态（32 已完成 + 1 关闭）| 0 阻塞 | 0 锁
- **principles**: P-v2 + **DEC-027 模态路由三不变量**（①模态保真直传 ②原始输入呈现不可侵犯 ③全链路无感）

## 本会话闭环（2026-08-29~30 跨两日超长会话）

- ✅ EVO-006 GPT OAuth 转正（EV-085）+ REL-004 v0.3.1 发布全链（EV-086/087）
- ✅ **FIX-009**：image-solo 400/1213 → RCA（真凶 wrapper 主路径空 content，非 vision）→ 8877365 占位注入 + 判别 9/9 → R0 APPROVED_WITH_NOTES/0（EV-088）
- ✅ **FIX-010**：图片气泡消失 → RCA 全实证（prestep 读 options 快照非实际路由——MIG-001 潜在缺陷，GUI 写回 agent-default-model + 重启引爆；会话实录 L9450/9454/9456 铁证；FIX-009/EVO-006/宿主全排除）→ 020909b 判定序 header 优先 + 判别 9/9 先红后绿 → R0 APPROVED_WITH_NOTES/0（P1-1 回落层窗口入 v0.3.2 台账；直连纯文本 marker = T-2 设计语义）（EV-089）
- ✅ **DEC-027 立版**（用户四轮原则宣告：模态保真直传 / 原始呈现不可侵犯 / 全链路无感）——FIX-010 验收北极星 + 后续演进守卫
- 📌 用户裁决：重启复验两修复（junction 直指开发树——重启即生效）

## 待办池

| 候选 | 状态 | 说明 |
|---|---|---|
| **重启复验**（三面+1） | **下次会话第一动作（用户在场）** | ①单图发送不 400 ②glm-5.3 会话发图气泡显示图片 ③重建账号无实验标 ④reminder 为插件消息不污染原消息 |
| v0.3.2 发布链 | 候选（复验后裁决） | FIX-009+FIX-010 承载 + P1-1（prestep 回落层 live default 对齐）+ P2-2（测试目录 hygiene）+ P3 台账（stats UTC 键/settings 遗留键）+ **UI 两需求**（去多余 OAuth 入口 + ChatGPT 订阅登录与 CLI 子代理位置交换——用户 2026-08-30 提出，待 triage） |
| deepseek-official 视觉端点 | 宿主/端点域 | 用户环境 227s 挂起（ABORTED 复证实证）——vision 旁路 glm/glm-5.3-flash；端点恢复后可切回 |
| 插件仓 FIX-281 | 插件仓会话 | 9 项 + 新观察 |
| C-4+C-5 / C-6 / C-2 / FIX-008 | 等用户需求 | v0.3.2+/v0.3.3 域 |

## 重要事实存档

- **验证基线**：smoke 948/0 · stats 110 · routing 114 · parity 14 · attachments 65 · credentials 98 · loopback 20 · client-render 0 · promotion 13 · metrics 0 · fix-009 判别 9/9 · fix-010 判别 9/9（两判别已并入规范门控清单）
- **宿主**：三包 0.1.1-rc.2 无漂移；junction → 开发树（重启加载）
- **GUI 写回陷阱**（EV-089 RCA）：宿主 GUI 会把 agent-default-model 写回 settings（18:16:20 实证）——切换会话模型可能改变新会话判定；FIX-010 修复后 prestep 读实际路由不受影响
- **settings 现状**：agent-default-model = deepseek-official/deepseek-v4-flash（纯文本——新会话默认）；vision = deepseek-official/deepseek-v4-flash-vision-exp（端点挂起中，旁路 glm 可用）；遗留键 oauthExperimental 等容忍存在
- 治理基线：16 issues（FIX-281 域）；evidence-log ~215KB（28s 近阈值——v0.3.2 发布后归档评估）

## 下次会话第一动作

1. skill 加载 software-project-governance → resolve_entry.py --json
2. 读本快照 + plan-tracker（33 终态；FIX-009/010 待复验）
3. 按复验结果分支：全过 → v0.3.2 链裁决（含 UI 两需求 triage）；失败 → M-2 回路受理
   - 推荐依据：RECO-FIX-010（task-priority-analysis 机写，2026-08-30——全终态，发布承载与 UI 需求为用户决策域）

> FIX-262/REQ-108：本节推荐引用 RECO-FIX-010 机器快照行（2026-08-30）。
