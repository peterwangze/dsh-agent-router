# 会话快照 — 2026-08-29（EVO-006 GPT OAuth 转正闭环 + v0.3.1 待发布授权）

- **session_id**: 20260829-EVO006-PROMOTION
- **session_date**: 2026-08-29
- **agent**: glm @ DeepSeek Harness + software-project-governance v0.78.0
- **mode**: always-on × maximum-autonomy

## 当前状态

- **current_stage**: development (6/11)——EVO-006 代码/审查闭环（3 commits 未 push）
- **current_gate**: G4 待评（CI 面缺——RISK-001；M-3 无沙箱复跑待 v0.3.1 发布链）
- **工作流版本**: 0.78.0
- **tracker**: 30 终态（29 已完成 + 1 关闭 DEV-001）| 0 阻塞 | 0 锁
- **principles**: P-v2

## 本会话闭环

- ✅ 执行包填充（EVO-006 占位→具体契约；18c/18d/18f/18i 清零：22→16 issues；16 残留 = FIX-281 已申报域）
- ✅ EVO-006 派发 Developer → done（bf667b3 服务端语义 / 6ebe9ed 客户端 UI / a4d33cd 文档口径；DEC-026 C2 六点全落地；TDD 先红后绿）
- ✅ Code Reviewer R0 **APPROVED_WITH_NOTES / unresolved_blockers=0**（C2 六点成立；断言账目 −8/+20 静态自洽；AI 专项 5 项过；安全无 P0/P1）
- ✅ review-record 机录（REVIEW-EVO-006-R0）+ EV-085 + RECO-EVO-006 + tracker 终态 + 锁释放 + 执行包回填
- ✅ 门控：smoke 936 ok/0 fail/1 skip（exit 1 = 沙箱拒仓外 mkdir §6——先在基线即如此）+ stats 110 / routing 114 / parity 14 / attachments 65 / oauth-credentials 98 / oauth-loopback 20 / promotion 11——零回退

## 待办池（含用户决策项）

| 候选 | 状态 | 说明 |
|---|---|---|
| **v0.3.1 发布链** | 推荐下一动作 | EVO-006 转正承载 + P2×3/P3×3 收尾（P2-a cohort 披露 / P2-b begin telemetry / P2-c ff §4 行）+ M-3 无沙箱复跑（smoke §6 全量 946 + hooks 复跑 + metrics ③确认）；发布授权 = 用户决策点 |
| 出口③设备码真机验证 | 随时可做 | v0.3.0 已含设备码实现；需用户在场 |
| FIX-008 残留面 | 待用户需求 | 客户端 imageData 渲染 + R5 目录空根因 + F-6/F-10 加固 + 附件 parity 守卫；启动需 change-triage 入账 |
| 其它 OAuth 演进 | 等用户需求 | C-4+C-5 成功率闭环（v0.3.2 候选）/ C-6 账号池 / C-2 Claude 评估 |
| 插件仓修复 FIX-281 | 插件仓会话 | 9 项 + 本会话新观察（TPA 完成态过滤活体：FIX-006/REL-002 伪阻塞「Unblock pick」推荐——两任务均真实终态） |

## 重要事实存档

- **EVO-006 commits 未 push**（bf667b3/6ebe9ed/a4d33cd——push 随 v0.3.1 发布链，部署决策归用户）
- **沙箱环境边界（M-3 绑定）**：smoke §6 仓外 mkdir 被拒（install-entry 按设计防 junction 污染——先在基线即如此）；git hooks bash 在沙箱崩溃（Developer 已一次性空 hooksPath 提交 + 人工等价推演；R0 复核认可）；metrics.mjs UPLOAD_FAILED 先在失败
- **宿主**：dsh-agent/dsh-attachment/dsh-llm 0.1.1-rc.2（RISK-003 活性域）；插件对齐基线 0.1.0-rc.8
- **插件安装**：junction ~/.dsh/profiles/node_modules/dsh-agent-router → 开发树（OPS-001；重启后加载新代码——EVO-006 转正代码生效同样需宿主重启）
- **代理 7890 未运行**——ChatGPT OAuth 真机路径需代理
- 治理基线：16 issues（FIX-281 域）；RECO-EVO-006 = 空推荐（全终态）

## 下次会话第一动作

1. skill 加载 software-project-governance → resolve_entry.py --json（resolved_root_ok）
2. 读本快照 + plan-tracker（EVO-006 已终态；v0.3.1 待授权）
3. 按用户本轮裁决方向执行：
   - 若授权 v0.3.1 发布链 → P2×3 收尾派发 Developer → M-3 无沙箱复跑 → Release agent 版本规划/打包/发布（M-4 授权点）
   - 若选出口③ → 用户在场设备码真机验证
   - 若选 FIX-008 → change-triage 入账后派发
   - 若暂停 → 保持现状
