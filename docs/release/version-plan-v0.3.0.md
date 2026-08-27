# dsh-agent-router v0.3.0 版本规划（version-plan）

| 项 | 值 |
| --- | --- |
| Task ID | REL-002（P1，release——规划先行第一段） |
| 文档类型 | 版本规划（Release Agent 产出，stage-release 子工作流；插件仓 REL-070/071 规划先例） |
| 日期 | 2026-08-27 |
| 状态 | 规划稿（待 Release Reviewer + Design Reviewer 双审 → M-0 用户裁决；发布决策/transition/tag/push 一律待用户授权，DEC-143 交互基线） |
| 规划目标版本 | **v0.3.0**（0.2.1 → 0.3.0，MINOR——论证见 §2.3） |
| 事实源 | `.governance/plan-tracker.md`（任务终态 + 版本路线图）、`.governance/execution-packets.json`（packets."REL-002"）、`docs/architecture/evolution-roadmap-v1.md`（§2.1 出口六项 / §3 C-1 方案 / §7 ADR-005/006/007 / §8 蓝军 / §10 风险）、`.governance/decision-log.md`（DEC-020 等）、`.governance/risk-log.md`（RISK-001/003）、`.governance/evidence-log.md`（EV-072/073）、`CHANGELOG.md`、`package.json`、`lib/` 源码目击（§7 核对表逐项留痕） |
| Git 事实声明 | 本 Agent 无命令执行权限（角色定义约束）——commit 级事实取自 plan-tracker 留痕与 Coordinator 派发 prompt 预核验（2026-08-27），未自行采集 git log；M-1 CHANGELOG 编写时 MUST 以 git log 实采对照补全 |

---

## §1 版本基线与事实快照

### 1.1 版本基线

| 项 | 事实 | 来源 |
| --- | --- | --- |
| 当前已发布版本 | **v0.2.1**（tag `a1ab717`，2026-08-22，REL-001） | plan-tracker 路线图行 v0.2.1；CHANGELOG.md:6 |
| package.json version | `0.2.1`（bump 至 0.3.0 属 M-1 段） | package.json:4（实读） |
| main 领先发布点 | v0.2.1 后约 30 commits（Coordinator 预核验；含 EVO-002 Step 5-7 终闭环/EVO-003/EVO-004/FIX-003C/FIX-004/FIX-005/FIX-006/GOV 记录） | 派发 prompt + plan-tracker 任务行 commit 留痕 |
| 发布惯例先例（归属拆分——REL-002 Release R0 F-1 修正，随 M-1 落地） | **流程惯例 = REL-001/v0.2.1**：CHANGELOG+bump+README → tarball 离线验证 → tag → push（c006639..067dde3，20 commits）→ GitHub Release（assets 含 tarball，非 draft，用户 gh 授权后执行）→ 治理记录随发布提交入仓（EV-037）；**三件套中的 checklist+rollback 两件 = v0.2.0/DEV-003 惯例**（EV-024——v0.2.1 发布件无三件套）；**feature-flags 件 = v0.3.0 新增**（超出先例的增强；句式与 feature-flags §0 统一——R1 F-6） | plan-tracker REL-001 行；EV-037；EV-024（DEV-003/v0.2.0） |
| 依赖面变更（v0.2.1 后） | `undici ^7.18.0` 新增声明 + pnpm-lock.yaml 入仓（FIX-006，bef08eb）；tarball 依赖完整性经隔离冷装验证 | plan-tracker FIX-006 行；EV-072 |
| 宿主面实证 | 宿主 rc.6→rc.8 滚动漂移（peerDeps 声明 rc.6 / lock 解析 rc.8；rc.8 移除 LlmAdapter.prepareCall 与文本模型图片投影）；npm children-null = 宿主环境 npm 11.8.0 arborist 对 dsh-* 环形 peer 图缺陷（正交，非产品缺陷） | EV-072（RCA 结论）；package.json:43-56（实读） |
| 治理面 | 当前阶段 development（6/11）；G4/G5 pending；RISK-001、RISK-003 活跃；25 任务全终态 | plan-tracker 项目总览/Gate 表；risk-log |

### 1.2 任务终态快照（v0.3.0 相关，零编造——逐行可溯 plan-tracker 任务跟踪表）

| 任务 | 终态摘要 | 与 v0.3.0 的关系 |
| --- | --- | --- |
| EVO-001（P0） | ✅ H2 运行时 PoC 六步全过（P1 登录端到端/P2 用量/P3 SSE 带图/P4 rotating 刷新/P5 失败样本×4/P6 全清；EV-028）；V-EVO-2b 证伪（走 SSE 聚合）/V-EVO-2c 通过（自标识被接受）；代理发现（chatgpt.com 需代理 7890，auth 直连） | C-1 前置门禁通过 = 出口⑥已闭环 |
| EVO-002（P0） | ✅ C-1 实施 Step 1-7 全闭环（R1-R8 审查链；Step 6/7 R7/R8 APPROVED_WITH_NOTES/0，EV-048/050/058/059）；W-5 三层防线；DEC-022-D 废弃（DEC-023）。**开放决策项：出口①真机首联（用户在场）与出口③设备码流排期 = 用户决策项** | v0.3.0 承载主体；出口①=发布 MUST 门禁（§3 GATE-1）；出口③=M-0 裁决项（§2.2） |
| EVO-003（P1） | ✅ C-3 统计持久化 Phase 1+2（1199c0b/c2d01ea；R1/R2 APPROVED_WITH_NOTES/0） | 路线图归 v0.3.1——**范围倒挂事实**（§2.2 A-1） |
| EVO-004（P1） | ✅ C-3 UI 面 + P2 六修（7 commits + R0 APPROVED_WITH_NOTES/0；smoke 877/0 时点） | 同上（范围倒挂） |
| FIX-006（P0） | ✅ undici ^7.18.0 + major 判别 fail-loud + pnpm-lock 入仓 + parity F2（4 commits；R0 APPROVED_WITH_NOTES/0，REVIEW-FIX-006-R0）；门控全绿 + 隔离冷装；EV-072/073 | v0.3.0 发布阻塞已解除（出口①阻断项修复） |
| FIX-004 / FIX-005 / FIX-003C | ✅ 各自终态（R0/R1 APPROVED_WITH_NOTES/0） | v0.2.1 后 main 增量，随 v0.3.0 一并承载（REL-001"范围=main 全部"惯例） |

### 1.3 C-1 出口六项现状核对（evolution-roadmap §2.1 自行读取核对结果）

| 出口 | 判据（roadmap §2.1 原文要义） | 现状 | 来源 |
| --- | --- | --- | --- |
| ① 一键登录端到端 | 授权页→1455 回调→凭据落盘（owner-only）→模型发现→chat 调用返回文本 | **机制面闭环；用户端到端（真机 vision-2 带图调用）未执行**——用户在场动作；FIX-006 后"随时可执行" | tracker 待办行；EVO-002 终态行；EV-073 边界声明 |
| ② token 过期自动刷新（重启后调用成功） | 机制闭环（PoC P4 rotating + 软轮换宽限窗验证；实现随 EVO-002 落地） | 机制闭环 | EVO-001/EVO-002 终态 |
| ③ 设备码后备可用 | — | **未实现**（lib 内仅 CHATGPT_PRESET.deviceUrls 常量，oauth-credentials.js:55-56；无 oauthDevice RPC）——排期 = 用户决策项 | tracker 待办行；源码目击（§7） |
| ④ 默认关闭+显式确认+登出删除路径全部可用 | oauthExperimental 缺省 false（schemas.js:223）+ ToS UAYOR 确认（schemas.js:225 注释）+ W-5 登出删除联动 | 机制闭环（R1-R8 审查链） | EVO-002 终态；源码目击 |
| ⑤ 既有断言零回退+新增用例全绿 | 现基线见 §1.4 | 全绿（持续复跑，M-3 门禁） | EV-072；tracker FIX-006 行 |
| ⑥ H2 PoC 报告归档 evidence-log | EV-028 | ✅ 已归档 | EVO-001 终态；EV-028 |

> 结论：六项中 ②④⑤⑥ 闭环，**① 为发布 MUST 门禁（用户在场）、③ 为 M-0 裁决项**。派发 prompt 表述"仅剩出口①"与 plan-tracker 并列的"出口③设备码流排期（用户决策项，P0）"存在口径差——本规划按零编造原则以 plan-tracker 为准，两者均如实呈报。

### 1.4 测试基线（2026-08-27 FIX-006 后实测）

| 套件 | 结果 | 备注 |
| --- | --- | --- |
| tests/smoke.mjs | **873 ok + 1 skip / 0 FAIL** | 基线漂移账目：rc.8 环境同文件 866（EV-072 披露口径） |
| tests/stats.mjs | 110 / 0 | EVO-003+EVO-004 累计 |
| tests/routing-paths.mjs | 114 / 114 | |
| tests/client-render.mjs | 全绿 | |
| tests/adapter-parity.mjs | 14 / 14 | F2 契约对齐 rc.8（69ccf94） |
| 隔离冷装 | **通过**（TEMP 解包 + `--omit=dev --legacy-peer-deps`；tarball 清单含 undici、ProxyAgent 可构造、零触碰真实 ~/.dsh） | 措辞按 EV-072 原文——隔离环境验证，非"真实安装" |

来源：EV-072（门控自报）+ plan-tracker FIX-006 行 + 派发 prompt 关键事实。**M-3 发布前 MUST 复跑至零回退。**

---

## §2 版本范围表与入出槽裁决（M-0 输入）

### 2.1 入槽清单（in-slot——每项带来源留痕）

| # | 变更项 | 类别 | 来源留痕 |
| --- | --- | --- | --- |
| S-1 | ChatGPT 订阅接入 C-1 全量：preset 账号 + 独立凭据文件（`$DSH_HOME/dsh-agent-router/chatgpt-codex-auth.json`）+ 1455 loopback 回调 + codex-responses 协议分支（第 4 分支，runCodexResponsesChat）+ 账号卡 UI（"ChatGPT（实验）"入口）+ ToS 确认 + 登出删除（W-5 联动） | 新增（功能） | DEC-020（decision-log:24）；EVO-002 终态；lib/service.js:2565/2611-2612/2728、lib/client.js:2412（源码目击）；CHANGELOG v0.2.1 节·变更预告 |
| S-2 | Q2 per-protocol 能力接口（`oauthCapabilities(protocol)` 单点判定替代全局 chat-only 一刀切；image/speech 留桩） | 新增（接口层） | DEC-020/ADR-005 §3.5；lib/service.js:523/870/2557（源码目击） |
| S-3 | 合规三层 kill-switch（`router.enabled` / 账号 `enabled` / `router.oauthExperimental` 缺省 false）+ S-3 绑定（凭据文件锁超时语义，CREDENTIAL_LOCK_TIMEOUT 族） | 新增（开关） | roadmap §3.3/§3.6；DEC-018 S-3 绑定 + DEC-020；lib/schemas.js:223；CHANGELOG v0.2.1 节·变更 |
| S-4 | C-9 埋点启动（v0.3.0 起采集；报告 v0.3.2 出） | 新增（观测） | DEC-020；EVO-002 Step 7（C-9 埋点） |
| S-5 | FIX-006：undici ^7.18.0 依赖声明 + dispatcher major 判别 fail-loud + pnpm-lock 入仓 + parity F2 | 修复（发布阻塞解除） | plan-tracker FIX-006 行；EV-072/073 |
| S-6 | FIX-004（能力自证 + 预检可观测）/ FIX-005（条件化引导）/ FIX-003C（遗留三修） | 修复 | 各任务终态行（6dd6e5b / a484469 / 0782516） |
| S-7 | EVO-002 Step 5-7 相对 v0.2.1 的增量终闭环（v0.2.1 已含 Step 1-4b 不可见预置；CHANGELOG v0.2.1 节·变更预告 v0.3.0 转全量可见） | 新增（功能解锁） | CHANGELOG v0.2.1 节·变更；EVO-002 终态 |
| S-8 | **[待 M-0 裁决 A-1]** C-3 统计持久化 + UI 面（EVO-003/EVO-004：stats.js 分离/按天 JSONL/数据安全四件套/成本单价表/CSV 导出/按天视图/导出按钮/P2 六修） | 新增（范围倒挂项） | 见 §2.2 A-1 |

### 2.2 裁决表（出槽/范围倒挂/待决——每项带来源留痕；裁决 = 用户，本规划不做决策）

#### A-1 范围倒挂：C-3（v0.3.1 路线图范围）已在 main 完成并入

**事实**：EVO-003/EVO-004 均终态合入 main（§1.2）；C-3 无隐藏开关（`router.stats.persist` 缺省 true，W-4 往返语义已实现）——**任何从 main 切出的 v0.3.0 tag 必然携带 C-3 代码与 UI**。CHANGELOG 完整性要求与 git log 对照无遗漏（stage-release 活动清单），"发布一个不含已完成功能的 tag"在 git 事实上不可达，除非 revert/cherry-pick 重构基线。

| 选项 | 内容 | 利 | 弊 |
| --- | --- | --- | --- |
| **a（建议）** | C-3 并入 v0.3.0：范围变更走变更控制（plan-tracker 变更控制四步 + decision-log 入账 + 路线图行更新），CHANGELOG 如实记载；版本语义仍 MINOR（§2.3） | 与 git 事实一致（零 revert 成本）；用户一次拿到两大主线成果；测试基线已覆盖（stats 110/0 + client-render 全绿 + EVO-003 R1/R2 + EVO-004 R0 审查链）；避免 v0.3.1 空壳化 | 版本主题从"单一 C-1"变"双主题"——偏离 DEC-020 四期分版的"版本语义单一"初衷（P4/C4），需变更控制留痕对冲 |
| b | 维持两段叙事：v0.3.0 = C-1 主题，C-3 代码随 tag 携带但正式宣告/出口八项验证归 v0.3.1 快速跟进 | 名义上保留 DEC-020 分版叙事；v0.3.1 有存在感 | CHANGELOG 要么遗漏（违反完整性）要么如实列出（等于选项 a 的内容+b 的标签——名实不符）；v0.3.1 将只剩"补验证"近空壳；统计 UI 已用户可见却"不算发布"属 overclaim 反例 |
| b' | 真·C-1-only：revert C-3 或从 EVO-003 前基线 cherry-pick 重建发布分支 | 范围纯净 | 工程成本高且高风险：EVO-004 六修与 FIX-006 在 service.js/stats 域交织；违背 REL-001"范围=main 全部"惯例；已审查通过的代码被剥离=审查资产浪费。**不建议** |

**建议**：选项 a。若采纳，M-3 门禁增补 stats 四件套/迁移单测复核（EVO-003 已落单测）；stats 出口条件中属实机/规模项（⑦ 加载 ≤200ms @100 天规模）列为发布后观察项而非门禁（No-overclaim，§6）。

#### A-2 出口③设备码后备：DEC-020 范围内、未实现、排期待裁决

**事实**：DEC-020 v0.3.0 范围含"设备码后备"；实现仅到 CHATGPT_PRESET.deviceUrls 常量（oauth-credentials.js:55-56），无 oauthDeviceBegin/account RPC；plan-tracker 待办列"出口③设备码流排期（用户决策项，P0）"；**v0.2.1 CHANGELOG 节·变更曾公开预告"完整功能（协议分支/UI/设备码）将在 v0.3.0 发布"**。

| 选项 | 内容 | 利 | 弊 |
| --- | --- | --- | --- |
| a | v0.3.0 内补实现（新增任务入账 → 实施 → 审查 → 并入 M-3 门禁） | 兑现 v0.2.1 公开预告；出口③闭环；1455 被占场景（BC-E5）有正式降级 | 发布时点后移（估 S-2 量级内小任务，非 L）；EVO-002 已终态需增量任务承载 |
| b | 出槽并如实改口：CHANGELOG/README 载明设备码顺延（目标 v0.3.x 窗口），走变更控制 | 不阻塞发布；降级链仍有 1455 主路径 + 手动粘贴先例（client.js 粘贴 token UI）可参照 | 与 v0.2.1 预告口径不符（需显式改口留痕）；出口③在路线图上保持未闭环 |
| c | 出槽 + 以手动粘贴降级补位（如实现面已具备则仅文档化） | 最小成本 | 手动粘贴实现面现状未核实——需 M-0 后 Developer 核实再定，本规划不预设 |

#### A-3 RISK-001（CI 面缺）处置——风险不关闭不重开，本规划只呈报选项

**事实**：RISK-001 活跃（risk-log:5）；v0.2.1 已带此披露发布（G4 保持 pending）；主轨道（DEV-002 核心通路自动化测试）已完成——RISK-001 升级条件未触发；当前保护 = 本地全量测试网（§1.4 五套件）。

| 选项 | 内容 | 利 | 弊 |
| --- | --- | --- | --- |
| a | 继续带披露发布：RISK-001 状态不动，CHANGELOG 已知问题节如实披露"无 CI 面"；CI 任务另行入账排期（v0.3.x 窗口） | 不阻塞已就绪发布；v0.2.1 先例；本地全量测试网提供手动回归保护 | 外部自动化验证面持续缺位；G4 继续 pending |
| b | 设 CI 为 v0.3.0 硬门禁：先建 CI（新任务入账+实施+稳定）再发布 | 发布质量面自动化闭环 | 发布时点显著后移；RISK-001 本义（回归保护）已实质缓解，CI 属增量 |
| c | 折中：v0.3.0 带披露发布 + **CI 面设为 v0.3.1 硬门禁**（写入本规划与路线图，形成承诺） | 平衡时点与质量演进 | 承诺固化——若 v0.3.1 前 CI 仍未就绪需再次变更控制 |

**建议**：a 或 c。裁决 = 用户。

#### A-4 宿主 peerDeps 锚定策略（RISK-003 域——rc 滚动漂移）

**事实**：package.json peerDependencies 全锚 `^0.1.0-rc.6`（package.json:48-56，实读）；EV-072 实证"peerDeps 声明 rc.6 / lock 解析 rc.8"漂移 + rc.8 两处行为变化（prepareCall 移除/文本模型图片投影移除）；adapter-parity F2 已对齐 rc.8；RISK-003 活跃（宿主无预警通道，npx cache 静默刷新）。

| 选项 | 内容 | 利 | 弊 |
| --- | --- | --- | --- |
| a | 维持 `^0.1.0-rc.6`（semver 范围语义已覆盖 rc.6→rc.8 同 tuple 预发布链，实证解析通过） | 零变更；兼容尚未漂移的 rc.6 宿主环境 | 声明下限落后实测通过版本两个 rc；每轮漂移靠 parity 目击对齐，账目成本递增 |
| b | 随 M-1 bump 提升锚定至 `^0.1.0-rc.8`（声明对齐实证） | 声明与实测一致；阻止后续环境回退到未目击版本 | 收窄 peer 范围——仍运行 rc.6 的宿主环境（其它机器）将被 peer 警告/拒配 |
| c | 放宽（peerDependenciesMeta optional / 上界放宽） | 最大兼容 | 放弃类型化防线，RISK-003 域裸奔——**不建议** |

**建议**：b（随 M-1 执行，保持 adapter-parity 看护）。裁决 = 用户。

### 2.3 semver 合规论证（0.2.1 → 0.3.0，MINOR）

1. **变更性质**：向后兼容的新能力面——C-1 ChatGPT 订阅接入（S-1~S-4）+（若 A-1 裁 a）C-3 统计持久化，均为新增功能/新增配置，无公共 API 移除、无行为破坏。semver 0.x 阶段 MINOR bump = 新增向后兼容功能（项目先例：v0.1.7→v0.2.0 MINOR，DEC-015 用户确认）。
2. **无 breaking 论证**：① 既有 OAuth 通用账号（tokenRef 粘贴）行为不变（ADR-005/E3-a 双轨设计，EVO-002 审查链验证）；② 新能力面全部由 `oauthExperimental`（缺省 false，schemas.js:223）门控——缺省安装用户零可见（CHANGELOG v0.2.1 节·变更同款语义延续）；③ 依赖新增 undici ^7.18.0 属 dependencies 追加（非 peer 收窄），隔离冷装已验证（EV-072）；④ C-3（若并入）行为增量（统计持久化缺省开）带等价回退开关 `router.stats.persist=false`（ADR-006 可逆性）。
3. **不跳号**：0.2.1→0.3.0 为相邻 MINOR；不选 0.2.2（非 patch——大量新功能，patch 语义不符）；不选 0.4.0（无 breaking、无主题断层，跳 MINOR 违反"不跳号"门槛）。
4. **版本号与范围裁决正交**：A-1 无论 a/b，版本号均为 0.3.0（b' 才可能引发范围重排，不建议）。

### 2.4 本次明确不发布什么（Amazon——防 scope creep）

| 项 | 来源 |
| --- | --- |
| C-2 Claude 订阅 OAuth（观察项） | DEC-019 Q1 / DEC-020 |
| Q2 image/speech 的 ChatGPT 端点实施（仅接口层就位；V-EVO-3 未验证） | roadmap §3.5 实施分期 |
| C-4/C-5 成功率闭环 + C-9 报告（v0.3.2）；C-6/C-7/C-8（v0.3.3） | DEC-020 四期分版 |
| 免费开箱链 | DEC-018 Q4 |
| CI 面建设（若 A-3 裁 a/c——作为任务另行排期，非本版本承载） | §2.2 A-3 |
| 出口③设备码（若 A-2 裁 b/c——显式顺延并改口） | §2.2 A-2 |

---

## §3 发布门禁（G9——发布就绪映射）

> 逐项全 PASS 方可进入 M-4 用户授权；任一 FAIL 阻断。每项结果须有记录（M-1 checklist 模板落列）。

| 门禁 | 内容 | 判定方式 | 现状 |
| --- | --- | --- | --- |
| **GATE-1（MUST）** | **出口①用户端到端**：真机 vision-2 带图调用全链（1455 回调 + 代理 7890 + dispatcher 路径）成功返回文本 | 用户在场实测留痕（EV 入账）；不可由自动化替代 | **未执行**——唯一机制外缺口；FIX-006 后随时可执行 |
| GATE-2 | 出口③设备码：按 A-2 裁决结果转为「实现+测试」或「出槽改口留痕」 | 裁决记录 + 对应交付物 | 待 M-0 |
| GATE-3 | 出口②④复核：token 刷新 / kill-switch 三层 / ToS 确认 / 登出删除路径断言全绿（机制闭环证据链 R1-R8 之上复跑） | M-3 全量测试网含 oauth 域断言 + 源码目击（schemas.js:223、client.js:2412） | 机制闭环 |
| GATE-4 | 全量测试网基线零回退：smoke 873 ok+1 skip/0、stats 110/0、routing-paths 114/114、client-render 全绿、adapter-parity 14/14（rc.8 漂移账目按 EV-072 口径披露） | M-3 复跑 exit 0 留痕 | 上次全绿 2026-08-27 |
| GATE-5 | tarball 隔离冷装：TEMP 解包 + `--omit=dev --legacy-peer-deps`，tarball 清单含 undici、ProxyAgent 可构造、零触碰真实 ~/.dsh | 隔离环境安装冒烟记录（措辞按 §1.4——**不使用无限定语的"真实安装"表述**） | 上次通过 2026-08-27（EV-072，FIX-006 时点包）；**执行里程碑 = M-3.5（M-4 前置）——Design F-1 修正挂点**：bump/rc.8 后包面已变，MUST 重打包复跑（runbook 见 release-checklist-v0.3.0.md） |
| GATE-6 | 发布审查：Release Reviewer 终审本规划 + M-1 资产（checklist/rollback/feature-flags/CHANGELOG）APPROVED（unresolved_blockers=0 方为通过终态）+ Design Reviewer 对规划的独立审查（tracker REL-002 行要求双审） | review-record 机器落盘 | 待 M-1 后 |
| GATE-7 | 版本一致性：package.json 0.3.0 + README 徽章与安装命令版本同步 + CHANGELOG 与 git log 对照（v0.2.1 后 ~30 commits 全覆盖、breaking 显式高亮=无、未完成功能排除=§2.4） | 逐项核对记录 | 待 M-1 |
| GATE-8 | 归档触发检测（发布后）：`archive.py migrate --auto --dry-run`；**预计触发发布强制迁移**（25 终态任务均在热文件——非最新已发布版本外仍有热文件历史 task）→ 执行 migrate + `check-archive-integrity`，失败阻断发布完成 | 机器输出留痕 | 待 M-7（预判，非事实断言） |

### Feature Flag 状态（v0.3.0 发布面）

| Flag | 缺省 | 状态与清理计划 |
| --- | --- | --- |
| `router.oauthExperimental` | **false** | v0.3.0 打开后 C-1 全量可见；转正评估：≥30 天稳定 + 出口①持续可用后于 v0.3.x 后续版本裁决移除（flag 债务控制） |
| `router.takeoverDefaultModel` | false | v0.2.1 既有，不在本次范围（状态如实记录于 feature-flags 三件套） |
| `router.stats.persist` | true | （若 A-1 裁 a）W-4 往返语义已实现；false=回纯内存态（回退锚点） |

### Kill-switch 验证语义（「验证过可以」，非「应该可以」）

三层开关（roadmap §3.6）：① `router.enabled` 总开关；② 账号 `enabled`；③ `router.oauthExperimental`（关=入口隐藏 + preset 调用明确报"实验通路已关闭"）。发布门禁要求：**oauthExperimental=false 时 preset 入口不可见 + 既有账号行为零变化 + 登出删除后凭据文件不存在**——三者以断言/实测留痕形式进入 M-3/M-1 checklist，不接受推定。

---

## §4 里程碑 M-0 ~ M-8

> 交互边界：M-0 与 M-4 为用户决策点（DEC-143——transition 授权）；其余为自动/受控执行。发布时点本身 = 用户决策项（tracker 待办行），由 M-0 完成度与出口①就绪情况共同输入。

| 里程碑 | 内容 | 出口判据 | 边界 |
| --- | --- | --- | --- |
| **M-0 范围与策略裁决** | A-1 范围倒挂 / A-2 设备码 / A-3 RISK-001 / A-4 peerDeps 四项裁决（ask_user_question 呈报 §2.2 选项）→ 变更控制入账（decision-log + plan-tracker 路线图行同步） | 四项裁决全部留痕；路线图行与本规划 §2 一致化 | **用户决策点** |
| **M-1 发布资产产出** | 三件套：`docs/release/release-checklist-v0.3.0.md` + `rollback-plan-v0.3.0.md` + `feature-flags-v0.3.0.md`；CHANGELOG v0.3.0 节（git log 实采对照——commit 清单以仓库为准，本规划 §1.1 已知 commit 留痕为底）；package.json bump 0.2.1→0.3.0（若 A-4 裁 b 同步 peerDeps 锚定）；README 徽章/安装命令同步 | 三件套 + CHANGELOG + bump + README 四件齐 | 自动（Developer bump / Release 三件套分工；流程先例 = REL-001，三件套中的 checklist+rollback 两件先例 = v0.2.0/DEV-003——feature-flags 件为 v0.3.0 新增；Release R0 F-1 归属拆分随 M-1 落地，句式统一 R1 F-6） |
| **M-2 出口①用户端到端** | 用户在场真机验证：vision-2 带图调用（1455 + 代理 7890 + dispatcher×原生 fetch 链路）。**失败回路（Design F-2 / BC-R1）**：验证失败 → 缺陷走 change-triage 入账（triage 机器记录）→ 修复（含独立审查）→ 重回 M-2 复验——不跳过、不降级为"机制面闭环"表述、不绕过 GATE-1 | 调用成功返回文本 + EV 留痕（GATE-1）；失败时按回路逐步留痕 | **用户在场动作（MUST 门禁）** |
| **M-3 门禁复跑** | 全量测试网（GATE-4）+ kill-switch 三层验证语义复核（GATE-3）+（若 A-1 裁 a）stats 四件套/迁移单测复核 + CHANGELOG/git log 对照（GATE-7 前置） | 全部 exit 0 + 留痕 | 自动 |
| **M-3.5 tarball 重打包隔离冷装**（Design F-1 修正新增挂点——GATE-5 执行里程碑） | bump 0.3.0 + peerDeps rc.8 + EVO-005/REL-003 代码入版后包面已变：npm pack 重打包 → TEMP 解包 → 隔离安装（`--omit=dev --legacy-peer-deps`，环境变量重定向零触碰真实 ~/.dsh 与 DSH_HOME）→ 断言清单（version 0.3.0 / undici ^7.18.0 / 8 包 peer rc.8 / ProxyAgent 可构造 / 真实环境零变更） | 冷装 runbook 全断言 PASS + EV 留痕（措辞：隔离环境安装冒烟；runbook 落列 release-checklist-v0.3.0.md §冷装） | 自动（Coordinator 执行——Release Agent 无命令权限）；**M-4 前置** |
| **M-4 发布终审 + transition 用户授权点** | Release Reviewer 终审（GATE-6，双审含 Design Reviewer 对本规划）→ checklist candidate 全 PASS（GATE-1~5、7）→ **用户 Go/No-Go + tag/push 逐项授权** | 审查 APPROVED（unresolved_blockers=0）+ 用户授权留痕 | **用户决策点（DEC-143）——唯一 transition 授权入口** |
| **M-5 发布执行** | tag v0.3.0 + push + GitHub Release（assets 含 tarball，非 draft）——REL-001 先例流程 | tag/remote tag 一致 + Release 可见 | 授权后执行（maximum-autonomy 域内） |
| **M-6 发布后验证** | tarball 隔离冷装冒烟复验（发布产物面）+ 宿主升级观察（OPS-001 junction 安装面：junction 指向开发树，升级路径 = tag 检出或刷新后重启，重启生效语义不变）+ C-9 埋点采集确认（v0.3.0 起） | 冒烟记录 + 观察窗无新阻断性缺陷 | 自动 + 用户观察 |
| **M-7 治理收尾** | 治理记录随发布提交入仓 + 归档触发检测/迁移（GATE-8）+ 路线图行更新（v0.3.0 已发布；v0.3.1 范围按 A-1 结果重排）+ 风险状态更新（RISK-001 按 A-3 裁决处置——不关闭不重开，仅状态注记） | 归档 integrity PASS + tracker 一致 | 自动（Coordinator） |
| **M-8 版本复盘** | P-vN 演进检查（版本规划纪律：复盘 MUST 检查 project-principles 是否演进）+ C-9 观察窗启动确认 + v0.3.1 启动评估（含 CI 任务/出口③遗留/后续任务优先级——完成必推荐由 Coordinator 执行 task-priority-analysis） | 复盘记录入仓 | 自动（Coordinator）+ 用户确认下一步 |

---

## §5 风险与回滚

### 5.1 风险登记（发布面——引用 + 处置，不新开不重开）

| 风险 | 等级 | 与 v0.3.0 的关系 | 处置 |
| --- | --- | --- | --- |
| **RISK-001**（risk-log:5，活跃）CI 面缺、回归保护依赖本地测试网 | 中 | v0.2.1 已带披露发布先例 | §2.2 A-3 选项呈报（a 带披露/b CI 门禁/c 折中承诺）——裁决 = 用户 |
| **RISK-003**（risk-log:7，活跃）宿主接口演进无预警（rc.6→rc.8 实证） | 高 | 发布包依赖宿主 peer 链 | §2.2 A-4 锚定策略选项 + adapter-parity 看护（14/14）+ 症状知识库；发布后宿主再漂移 = 回归测试触发条件 |
| R-E1（roadmap §10）OpenAI 侧收紧（client/端点/风控） | 高（外部不可控） | C-1 主体外部风险 | 三层 kill-switch + 默认关闭收敛故障面 + 降级链 + 诚实 originator；最坏回退 = oauthExperimental 关/preset 下架单 commit |
| R-E2 H2 PoC 失败路径 | — | **已解除**（EVO-001 六步全过，EV-028） | 不再活跃——留痕引用 |
| npm children-null（宿主环境 npm 11.8.0 arborist 环缺陷） | 低（环境正交） | 冷装/安装验证受扰 | 正交披露（EV-072）；冷装以 --legacy-peer-deps 验证；不在本版本修复 |
| stats 实机规模项（若 A-1 裁 a：出口⑦ 加载 ≤200ms@100 天） | 低 | 未实证 | 列为发布后观察项（§6 No-overclaim），不虚报为已验证 |
| **pnpm-lock 安装面时变**（Design F-3 / BC-R3——随 M-1 披露） | 中（残余如实披露） | npm tarball 不含 pnpm-lock.yaml（files 清单未列）——发布后新装用户解析 undici 7.x 最新版，与仓库锁/测试时点可能不同 | 缓解 = loadOauthProxyDispatcher major 判别 fail-loud（undici 非 7.x 即明确报错不静默，FIX-006）；残余 = 时变解析至未来 7.x minor/patch（major 下界守住）——如实披露，不虚报全覆盖 |
| **dev 图 unmet-peer 警告**（REL-003 R0 N-1——处置 = 披露路径） | 低 | dev 图（pnpm-lock importers）dependencies 三包 dsh-llm/dsh-tools/dsh-typert-protocol 维持 ^0.1.0-rc.6 = **DEC-025 D-4b/A-4b 裁决范围**（裁决仅 peerDependencies 8 包）——dsh-agent@rc.8 peer 要求 typert-protocol ^rc.8 而 dev 图依锁解析 rc.6 → unmet-peer 警告（pnpm 警告级，不阻断 install） | 生产新装 ^0.1.0-rc.6 范围解析到 rc.8（EV-072 实测宿主环境）——dev/生产图轻微漂移如实记录；dependencies 三包对齐 bump 列为 Release 段裁量遗留候选（不阻塞发布） |

### 5.2 回滚方案（三层资产 + 验证语义）

| 层 | 回滚动作 | 生效语义 | 验证 |
| --- | --- | --- | --- |
| 用户层（秒级） | `router.oauthExperimental=false` | preset 入口隐藏 + preset 调用明确报错；既有账号/其它通路零影响 | GATE-3 断言复跑（"验证过可以"） |
| 数据层 | 账号卡"登出并删除凭据"（W-5 联动：删凭据文件 + 清 oauthAccounts 条目 + 清池引用）；C-3（若并入）清空统计走软删除 backup（EVO-003 落地） | 凭据/数据可撤销，不留孤儿 | EVO-002 R7/R8 + stats 单测；登出后凭据文件不存在断言 |
| 代码层（分钟级） | `git revert` 至 v0.2.1 语义 / preset 分支下架单 commit（ADR-005 可逆性：可逆-中风险）；stats（若并入）`persist=false` 回纯内存 | 回 v0.2.1 行为基线 | 回滚后全量测试网复跑 + tarball 重打包冷装 |

**注意**：revert FIX-006（undici 声明）会使 OAuth 代理路径回到"发布环境必失败"的修复前状态——undici revert 仅应伴随 OAuth 面整体回退执行，不可单独回退（回滚顺序约束，写入 rollback-plan 三件套）。

---

## §6 No-overclaim 边界（本规划与后续发布材料的措辞红线）

1. **不声明"生产就绪/生产级"**——项目处 0.x 演进期（v0.3.x 四期分版中第一版）。
2. **不声明 OpenAI 官方批准/合作/背书**——C-1 借 Codex CLI 公共 client（ADR-005），ToS 风险以 UAYOR 措辞显式声明（schemas.js:225）；originator 诚实自标识 `dsh-agent-router`，不伪装官方 CLI。
3. **不预支出口①**——用户端到端未执行前，一切材料只能说"机制面闭环、待用户验证"；GATE-1 未过不得出现"一键登录已验证可用"表述。
4. **实验性定位如实**——入口文案即"ChatGPT（实验）"（client.js:2412）；缺省关；发布材料不省略"实验"限定。
5. **CI 面如实披露**（若 A-3 裁 a/c）——不声称"CI 全绿"；验证表述限于本地全量测试网实测数字（§1.4）。
6. **隔离验证措辞纪律**——仅使用"隔离环境安装冒烟（TEMP + --legacy-peer-deps）通过"类限定表述；无限定语的"真实安装/真实环境验证"= 违规措辞（AUDIT-146/FIX-271 R3 红线在本仓库发布面的同构适用）。
7. **宿主环境缺陷正交披露**——npm children-null 系宿主 npm arborist 环缺陷，不包装为产品通过项；rc 漂移持续（RISK-003），parity 对齐口径随 EV-072 披露。
8. **C-9 = 启动采集非结论**——报告 v0.3.2 出；发布材料不引用未采集的触发率/成功率数字。
9. **stats 规模性能未实证**（若 A-1 裁 a）——出口⑦类实机项列观察项，不写入"已达标"。
10. **规划 ≠ 决策**——§2.2 四项裁决、发布时点、tag/push 全部"待用户授权"；本规划任何建议（a/b 标注）不构成既成事实。

---

## §7 与 plan-tracker 事实一致性核对表（零编造自检）

| # | 本规划引用事实 | 来源留痕（文件/行） | 核对 |
| --- | --- | --- | --- |
| 1 | v0.2.1 已发布，tag a1ab717，2026-08-22 | plan-tracker 路线图行 v0.2.1（:112） | ✅ |
| 2 | package.json version 0.2.1 | package.json:4（实读） | ✅ |
| 3 | EVO-001 ✅ 六步全过（EV-028） | plan-tracker 任务行 EVO-001（:92） | ✅ |
| 4 | EVO-002 ✅ Step 1-7（R1-R8）；开放项 = 出口①+出口③ | plan-tracker 任务行 EVO-002（:93）+ 待办行（:50-51） | ✅ |
| 5 | EVO-003/EVO-004 ✅（C-3 完成于 main） | plan-tracker 任务行（:94-95） | ✅ |
| 6 | FIX-006 ✅ 门控全绿 + 隔离冷装 | plan-tracker FIX-006 行（:99）+ EV-072 | ✅ |
| 7 | 测试基线 873+1skip/110/114/全绿/14 | EV-072 门控自报 + 派发 prompt（2026-08-27 实测） | ✅ |
| 8 | v0.3.0 路线图范围 = C-1 + W-5/S-3 绑定 | plan-tracker 路线图行 v0.3.0（:113）+ DEC-020（decision-log:24） | ✅ |
| 9 | C-3 原归 v0.3.1（范围倒挂事实） | plan-tracker 路线图行 v0.3.1（:114）+ DEC-020 | ✅ |
| 10 | Q2 per-protocol 接口已实现 | lib/service.js:523/870/2557（源码目击） | ✅ |
| 11 | 设备码仅常量、无 RPC 实现 | lib/oauth-credentials.js:55-56（源码目击）+ plan-tracker 待办（:51） | ✅ |
| 12 | oauthExperimental 缺省 false + ToS UAYOR | lib/schemas.js:223/225（源码目击） | ✅ |
| 13 | RISK-001/RISK-003 活跃（不关闭不重开） | risk-log:5/:7 | ✅ |
| 14 | REL-001 tag/push/GitHub Release 惯例 | plan-tracker REL-001 行（:100） | ✅ |
| 15 | main ~30 commits since v0.2.1 | 派发 prompt（Coordinator 预核验；本 Agent 无 Bash 未自采——已声明） | ⚠️ 待 M-1 git log 实采对照 |
| 16 | v0.2.1 预告"设备码将在 v0.3.0 发布" | CHANGELOG v0.2.1 节·变更（原引 :29——v0.3.0 节前置后行号漂移，R1 F-5 改节锚免漂移） | ✅ |
| 17 | 归档触发条件（发布强制触发器） | AGENTS.md 治理数据归档段 + GOV-002/003/004 先例（跳过因已发布版本 <2——v0.3.0 后条件改变） | ✅（GATE-8 预判已标注为预判） |

---

## §8 待用户裁决点汇总（Coordinator 转 ask_user_question 用）

| # | 裁决点 | 选项 | 本规划建议 |
| --- | --- | --- | --- |
| D-1 | 范围倒挂 A-1：C-3 是否并入 v0.3.0 | a 并入（变更控制）/ b 两段叙事 / b' 剥离重建 | **a** |
| D-2 | 出口③设备码 A-2 | a 本版补实现 / b 出槽顺延+改口 / c 手动粘贴补位（先核实实现面） | 视发布时点紧迫度：a 或 b |
| D-3 | RISK-001 处置 A-3 | a 带披露发布 / b CI 硬门禁 / c 带披露 + v0.3.1 CI 门禁承诺 | a 或 c |
| D-4 | peerDeps 锚定 A-4 | a 维持 rc.6 / b 提升至 rc.8 / c 放宽（不建议） | **b** |
| D-5 | 发布时点 | 出口①（M-2）完成后即走 M-3→M-4 / 其它窗口 | 由用户在 M-2 就绪后定（tracker 待办行：真机首联后评估） |

> 以上五项均未决策——发布决策、transition、tag、push 全部待用户授权（DEC-143）。

---

## 自检清单（硬门槛逐项核对）

| 检查项 | 结果 |
| --- | --- |
| 发布范围与 plan-tracker 路线图/任务终态一致（零编造，§7 逐项留痕） | ✅ 17 项核对（1 项标注待 git 实采） |
| semver 合规：0.2.1→0.3.0 MINOR 论证充分（§2.3：新能力面 + 无 breaking 四证 + 不跳号） | ✅ |
| 入出槽裁决表每项带来源留痕（§2.1/§2.2）；范围倒挂 MUST 呈报选项不做决策（A-1 选项 a/b/b' + 利弊 + 建议） | ✅ |
| 出口③设备码缺口如实呈报（含与派发 prompt 口径差的处置说明，§1.3） | ✅ |
| 风险不关闭不重开（RISK-001 = 选项呈报 A-3；R-E2 解除仅留痕引用） | ✅ |
| No-overclaim 边界完整（§6 十条；不声明生产就绪/官方批准） | ✅ |
| 发布决策/transition/tag/push 全部标注"待用户授权"（§4 M-4、§8） | ✅ |
| 回滚方案含验证语义与顺序约束（§5.2，kill-switch"验证过可以"） | ✅ |
| 唯一写入目标 = 本文件；未修改产品代码/.governance/CI 配置；未执行命令；未与用户交互 | ✅ |
