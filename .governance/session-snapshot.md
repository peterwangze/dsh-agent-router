# 会话快照 — 2026-08-23（FIX-004/EVO-004 闭环 + 出口①真机首联进行中 + FIX-006 通道恢复暂停 + OPS-001 本地安装 + GOV-003 版本同步 0.76.0）

- **session_id**: 20260823-GOV-EXIT1-FIX006-CHANNEL-RECOVER
- **session_date**: 2026-08-23
- **agent**: deepseek-v4-flash @ DeepSeek Harness + software-project-governance v0.75.0
- **mode**: always-on × maximum-autonomy

## 当前状态

- **current_stage**: development (6/11)——v0.3.0/v0.3.1 机制面闭合（FIX-004 自证 + EVO-004 UI 面）
- **current_gate**: G4 待评（CI 面缺——RISK-001；测试网：smoke 876-877 / stats 110 / routing 114 / parity 14）
- **工作流版本**: 0.78.0（GOV-004 同步 2026-08-27：AGENTS.md bootstrap + plan-tracker + 本快照三处一致）
- **tracker**: 25 任务 | 23 完成 + 1 关闭（DEV-001）| **FIX-006 待实施（P0）** | 0 阻塞
- **principles**: **P-v2**（P4 门控/P7 不可逆/P8 可观测/P9 宿主演进防御——本会话 P9 两次实证：
  FIX-004 自证落地 + FIX-006 宿主 dsh-llm rc 滚动漂移嫌疑）

## 本会话闭环（EV-029~069 续）

- ✅ **OPS-001 本地安装**（2026-08-23 16:10）：install.ps1 -LocalPath . 离线安装当前开发树（8938a54 = v0.2.1+62）到 DSH——junction ~/.dsh/profiles/node_modules/dsh-agent-router + cordis.patch.yml router/tool-router 宿主行（novel-writing 保留）；Node 解析三链（entry/依赖/./tool）验证通过；重启后生效（与 FIX-006 通道恢复同窗）；EV-069
- ✅ **GOV-003 版本同步 0.75.0→0.76.0**（2026-08-23 16:20，用户选定）：AGENTS.md bootstrap 版本行（轻量模板 diff 仅版本行）+ plan-tracker/快照 **工作流版本** 三处一致；附带 28c 修复（快照键 `workflow_version`→中文 `**工作流版本**` 对齐 FIX-105 正则——20→19 issues）；归档检测跳过（0<2）；FIX-006 在途锁保留至重派刷新；EV-070

- ✅ **GOV-004 版本同步 0.76.0→0.78.0**（2026-08-27，/governance Scenario C）：轻量模板 diff 仅版本行（GOV-003 先例延续）三处一致 0.78.0；前序会话治理记录入仓（f8e9890）；FIX-006 过期锁清理（Check 26 3 blocking 消除，重派时重取）；归档检测跳过（0<2）；EV-071
- ✅ **A 类治理迁移**（26→16 issues 诊断与修复：28c 补节/配置格式/锁重建/快照版本行）
- ✅ **FIX-004 闭环**：能力自证 + P8 双事件——6dd6e5b + R0 APPROVED_WITH_NOTES/0（EV-067）+ DEC-024 宿主申报入册
- ✅ **EVO-004 闭环**：C-3 UI 面（按天视图/导出按钮）+ P2 遗留六修——7 commits + R0 APPROVED_WITH_NOTES/0（EV-068）+ 门控独立复跑全绿 + main 合并（8938a54）
- ✅ **出口①真机首联（进行中）**：登录端到端 ✓（chatgpt-codex-auth.json 2151B @9:47）· 网络层 401/405 实证 ✓· V-EVO-3 实读 ✓（dsh-codex-connect src/transport.ts：401/403→reauthRequired 无 usage_* 细分；image 端点形状可复用，Q2 前置）
- 📌 **FIX-006 入账**（P0 发布阻塞，真机实证）：① undici 依赖缺失（package.json 未声明——发布即运行失败）② dispatcher 版本不兼容（Node 24 内置 undici 7.18.2 vs 装 8.10 → invalid onRequestStart method——R6-F2/F5 原生 fetch 兼容真实暴露）③ smoke admission `raw route projects image blocks` FAIL（EVO-004 门控时绿——宿主 dsh-llm rc 滚动嫌疑 P9）④ npm 树损坏（children null——pnpm 恢复：smoke 876 + stats 110 + routing 114 仅 admission 1 项 FAIL）；triage/执行包 18c-18i 全过/锁已写

## 待办池（含用户决策项）

| 候选 | 状态 | 说明 |
|---|---|---|
| **FIX-006 续派** | **通道恢复后立即** | 子代理通道会话级故障（3 连失败 + 最小探测 Error）→ 用户重启宿主恢复 → 重派 Developer（任务书已就绪：RCA 四现象 → undici 声明 → dispatcher 兼容 → admission 判定 → 判别断言 → 冷装演练） |
| 出口①收尾 | 依赖 FIX-006 | 修复后用户重试 vision-2 带图调用（oauthProxyUrl 已配置 http://127.0.0.1:7890 + 凭据有效）→ 出口条件五项闭环 |
| 出口③设备码流排期 | 用户决策项 | 1455 被占降级路径（Step 6 代码已就位声明） |
| v0.3.0 发布时点 | 用户决策项 | 出口①验证 + ③ 决策后评估（FIX-006 修复为发布前提） |
| 插件仓缺陷申报 | B 类 7 项入账 | 轻量表解析矛盾/配置格式/节边界/CLI 覆盖风险/版本校验混用/EV- EVD 前缀/tpa 完成态识别——走插件仓项目 |
| 遗留台账 | 后续域 | FIX-004 P1-1/P2-1/P2-2 + EVO-004 P1×1/P2×3 + R2-F4~F7/R8-F3/F4/F6/F8 P3 |

## 重要事实存档

- **出口①现场**：settings.yaml router 段已加 `oauthProxyUrl: http://127.0.0.1:7890`（备份 `settings.yaml.bak-20260823-exit1`）；oauthAccounts.chatgpt（preset=chatgpt-codex/protocol=codex-responses/baseURL=chatgpt.com/backend-api/models=[gpt-5.4-mini,gpt-5.4]）；oauthExperimental/oauthTosAccepted=true；vision-2 agent（account=chatgpt/gpt-5.4）验证载体
- **环境状态**：node_modules 由 pnpm 重建（2026-08-23 10:xx）——undici 未装（待 FIX-006）；package-lock 无（项目原无 lock）——FIX-006 锁策略待 RCA；pnpm-lock.yaml untracked 待决策
- **研究区**：.tmp-research/dsh-codex-connect/（V-EVO-3 源，transport.ts 实读记录见本会话）
- 子代理通道故障：0e6daacc/3c7542bf(fork)/cedf5a0c/60484df8 全失败——最小探测硬失败——恢复手段=宿主重启（快照先例 Step 6/7 同型）

## 下次会话第一动作

1. skill 加载 software-project-governance → resolve_entry.py --json（resolved_root_ok）
2. 读本快照 + plan-tracker（FIX-006 待实施）
3. 通道探测（最小 subagent）→ 恢复 → **续派 FIX-006 Developer**（任务书见 plan-tracker 行 + 本会话派发记录）→ 完成 → Code Reviewer → 门控 → 用户重试 vision-2（出口①闭环）；**同窗验证 OPS-001 安装**（设置→Agent 路由页可见 + route_agent 工具注册）
