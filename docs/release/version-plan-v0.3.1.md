# dsh-agent-router v0.3.1 版本规划（version-plan）

| 项 | 值 |
| --- | --- |
| Task ID | REL-004（P1，v0.3.1 发布链——**规划段**；发布执行在 M-4 用户授权后另段执行） |
| 文档类型 | 版本规划（Release Agent 产出，stage-release 子工作流；本仓结构先例 = version-plan-v0.3.0.md 八节） |
| 日期 | 2026-08-30 |
| 状态 | 规划稿（待 Release Reviewer 审查 → M-4 用户发布授权；发布决策/tag/push 一律待用户授权，DEC-143 交互基线） |
| 规划目标版本 | **v0.3.1**（0.3.0 → 0.3.1，MINOR——论证见 §2.2；版本号最终随 M-4 用户确认） |
| 事实源 | `.governance/plan-tracker.md`（路线图 v0.3.1 行 + EVO-006/REL-004 任务行）、`.governance/evidence-log.md`（EV-084/085/086）、`.governance/review-EVO-006-R0.md` + `-input.md`、`.governance/review-REL-004-R0.md` + `-input.md`、`CHANGELOG.md`（未发布段）、`docs/release/version-plan-v0.3.0.md`（结构先例）、`docs/release/feature-flags-v0.3.0.md`（§1/§3/§4/§5 转正注记）、`.governance/risk-log.md`、`package.json`（实读）、`README.md`（实读） |
| Git 事实声明 | 本 Agent 无命令执行权限（角色定义约束）——commit 级事实取自任务书权威输入 + 审查链实采留痕（REL-004 R0 审查实采 `git status -sb` = `[ahead 10]`，review-REL-004-R0-input.md §范围事实）；未自行采集 git log；M-5 执行段 CHANGELOG 收口时 MUST 以 git log 实采对照（v0.3.0 先例：86-commit 三分账，EV-084） |
| 本仓适用性边界 | SKILL 原文 check-release / release-ledger / release-projection / quality-tools / declarative manifest（ADR-010）为治理插件仓专用工具链，**不适用本仓**——发布门禁按 v0.2.1/v0.3.0 先例（REL-001/REL-003/EV-084）本仓四项口径（§3） |

---

## §1 版本基线与事实快照

### 1.1 版本基线

| 项 | 事实 | 来源 |
| --- | --- | --- |
| 当前已发布版本 | **v0.3.0**（annotated tag，peel = `bb81abf`，2026-08-29，GitHub Release + tarball 1,507,506B） | plan-tracker 路线图行 v0.3.0（:125）；EV-084 |
| package.json version | `0.3.0`（bump 至 0.3.1 属 M-4 授权后执行段，Developer 载体） | package.json:4（实读） |
| main 领先发布点 | **ahead 10 commits**（REL-004 R0 审查实采）。构成：EVO-006 段 3 产品 commits（`bf667b3` 服务端语义 / `6ebe9ed` 客户端 UI / `a4d33cd` 文档口径）+ REL-004 收尾段 4 commits（`6cbe4fc` / `f2f3ba5` / `21db990` / `866d4df`）+ 治理 commits（含 `0eb1324` / `820d862`）；**逐 commit 完整清单以 M-5 执行段 git log 实采为准**（§7 核对 #3） | review-REL-004-R0-input.md:8（`## main...origin/main [ahead 10]`）；两份审查报告 diff 范围声明 |
| 依赖面变更（v0.3.0 后） | **零**——EVO-006 与收尾段全部产品 commits 均未触碰 package.json（EVO-006 R0「package.json 不在 diff」+ REL-004 R0「`git diff 0eb1324..HEAD -- package.json` = 空」双重实采）——v0.3.1 tarball 依赖面与 v0.3.0 完全一致（undici ^7.18.0 / peerDeps 8×^0.1.0-rc.8 维持） | review-EVO-006-R0-input.md §范围事实；review-REL-004-R0-input.md §范围事实；package.json:40-57（实读） |
| 宿主面 | 无新增漂移证据；peerDeps 8×rc.8 维持；adapter-parity 14 于 EV-086 复跑全绿 | EV-086；package.json:48-57（实读） |
| 治理面 | 当前阶段 development（6/11）；G4/G5 pending；RISK-001 活跃（CI 面）；check-governance 16 issues（均为插件仓 FIX-281 已申报域 + 非阻塞 WARN——§5.1 如实披露） | plan-tracker 项目总览/Gate 表；risk-log:5；任务书权威输入 |

### 1.2 任务终态快照（v0.3.1 相关，零编造）

| 任务 | 终态摘要 | 与 v0.3.1 的关系 |
| --- | --- | --- |
| EVO-006（P1） | ✅ 代码/审查闭环——3 commits（bf667b3/6ebe9ed/a4d33cd）+ R0 APPROVED_WITH_NOTES/0（DEC-026 C2 六点逐项成立；unresolved_blockers=0）；P2×3/P3×3 台账 → REL-004 收尾闭环；八套件零回退；EV-085 | **v0.3.1 主题**（转正承载，代码已入 main 待发布） |
| REL-004 收尾段（P1） | ✅ 4 commits + R0 APPROVED_WITH_NOTES/0（EVO-006 R0 findings 6/6 逐项闭环无偏差；P3×1 信息性——hooks 产品码路径域，属治理插件域观察，转 FIX-281 跟进）；EV-086 | **v0.3.1 范围**（台账收尾随本版承载） |
| REL-002/REL-003（v0.3.0 链） | ✅ 规划双审 + M-1 全段终态 + 发布完成（EV-084） | 先例参照（结构/口径）；不在 v0.3.1 范围 |

### 1.3 测试基线（**EV-086 权威**——2026-08-30 M-3 无沙箱复跑实测）

| 套件 | 结果 | 备注 |
| --- | --- | --- |
| tests/smoke.mjs | **948 ok / 0 fail / exit 0 / 13s** | §6 install-entry 仓外 mkdir 全绿（沙箱期 exit 1 先在项消除）；账目 = 946 全量投影 + 2 promotion 接线 = 948 精确吻合 |
| tests/stats.mjs | 110 / 0 | |
| tests/routing-paths.mjs | 114 / 114 | 含 ① 层看护 C13/D8b |
| tests/adapter-parity.mjs | 14 / 14 | 宿主 rc.8 契约对齐 |
| tests/attachments.mjs | 65 / 65 | |
| tests/oauth-credentials.mjs | 98 / 0 | |
| tests/oauth-loopback.mjs | 20 / 0 | |
| tests/client-render.mjs | exit 0 | 渲染级「无实验字样」看护 |
| tests/oauth-promotion.mjs | 13 / 13 | 判别组（旧语义必败）+ 关闭能力组（B1~B4） |
| tests/metrics.mjs | ALL PASSED / exit 0 | UPLOAD_FAILED 未复现（环境依赖定性——受限环境失败、全权限通过） |

来源：EV-086（M-3 无沙箱复跑权威数据）。**M-5 执行段 bump 后 MUST 复跑至零回退（RG-1）。**

---

## §2 版本范围表与 semver 论证

### 2.1 入槽清单（in-slot——每项带来源留痕）

| # | 变更项 | 类别 | 来源留痕 |
| --- | --- | --- | --- |
| S-1 | **EVO-006 GPT OAuth 转正（DEC-026 C2）**：`oauthExperimental`/`oauthTosAccepted` 配置键废弃移除（遗留键 schemastery 透传容忍——零阻塞零行为改变）；begin 侧与调用期实验门控链移除；kill-switch ②层双侧判别补全（resolveAgent 直连 service.js:804-806 + oauthBegin 发起 :3228-3231，先于凭据触碰）；UI/i18n 转正（实验区恒渲染、ToS 弹窗移除→平台 ToS/风控非阻断提示、账号名去「（实验）」、实验 tag 删除）；文档口径（README FAQ + CHANGELOG 未发布段 + feature-flags §1/§3/§4/§5） | 变更（功能语义转正） | DEC-026；tracker:34；EV-085；review-EVO-006-R0-input（C2 六点逐项证据）；CHANGELOG 未发布段 |
| S-2 | **REL-004 收尾段**（EVO-006 R0 台账 P2×3/P3×3 闭环）：P2-b oauthBegin ②层停用拒绝补 `account_disabled` telemetry + 判别断言 11→13；P2-a「开过又关」升级披露（CHANGELOG:12 + README:128——披露方案，零 settings 写入）；P2-c+P3-f feature-flags §4 ②层新语义 + oauthDiscover 管理面边界注记；P3-d+P3-e 测试注释精度 | 修复（观测补面 + 披露完善） | tracker:35；EV-086；review-REL-004-R0-input §三闭环表 6/6 |
| S-3 | 治理 commits（0eb1324/820d862 等——审查/证据/记录入账，不入用户面） | 治理 | 任务书权威输入；review-REL-004-R0-input.md:8（账目自洽） |

**用户面语义记录**：CHANGELOG 未发布段已在案（转正主条目 + 升级披露 + 关闭能力说明 + 内部注解）；节标题版本化（Unreleased → v0.3.1）与 git log 对照收口归 M-5 执行段（本 Agent 不触碰 CHANGELOG）。

### 2.2 semver 合规论证（0.3.0 → 0.3.1，**MINOR**——独立论证）

1. **变更性质 = 新能力语义（转正），非缺陷修正**：ChatGPT 通道从「实验开关门控 + ToS 确认的 opt-in」转为「正式通道、缺省可用」——用户可见能力面变化（入口形态/文案/门控语义/升级行为披露）。PATCH 语义（向后兼容的缺陷修正）无法承载「缺省即正式的新通道语义 + 配置面废弃 + 升级行为披露」——**不判 PATCH**。v0.2.1 patch 先例承载的是缺陷修复 + 缺省 false 的新配置开关（不改缺省行为），与本版「缺省即正式」的语义强度不同。
2. **零 breaking 论证（四证）**：
   - ① **无公共 API/协议面变更**：RPC owner-only 面未动；凭据文件格式未变；凭据处理路径未变（EVO-006 R0 安全性 PASS 结论「凭据处理路径未变」）；**依赖面零变更**（package.json 不在任何 v0.3.1 diff——两轮审查实采）。
   - ② **配置键废弃带容忍迁移**：`oauthExperimental`/`oauthTosAccepted` 从 schema 移除属「配置面收窄」，但 schemastery 非 strict 未知字段透传（@deepseek-ai/schemastery@3.18.1 库源码级实证——REL-004 R0 §四：strict 缺省 false + `merge(result, data)` 透传）+ 双断言看护（smoke:95 / oauth-promotion:44-45）→ 遗留键**零启动阻塞、零行为改变**，升级零操作。项目标注口径 = **「配置键废弃（容忍迁移）」**，不构成 semver 意义上的 breaking。
   - ③ **行为变化均有披露与官方替代路径**：「开过又关」cohort 关闭偏好不迁移 = CHANGELOG 显式披露 + 账号卡停用（`enabled=false`）/「登出并删除凭据」两条官方替代路径（P2-a 处置，Coordinator 裁定披露方案——零 settings 写入，P7 数据安全）；既有 v0.3.0 已登录账号升级后**凭据保留、继续可用**（CHANGELOG 未发布段原文承诺）。
   - ④ **关闭能力三层全保留且不弱于 v0.3.0**：① `router.enabled` / ② 账号 `enabled`（双侧判别为 v0.3.1 新增增强）/ ③ 登出删除（恒可用）。唯一关闭面收窄 = 实验 flag 层退役——该层语义本身即被 DEC-026 转正裁决消亡（裁决内语义消亡，非破坏）。
3. **不跳号**：0.3.0 → 0.3.1 相邻 MINOR；不选 0.4.0（无 breaking、无主题断层）；不选 0.3.0-patch 形态（patch 语义不符，见第 1 点）。
4. **结论**：**MINOR（0.3.1）**。反论已否弃：PATCH 论者可称「转正只是移除实验门控 = 行为修正」，但 patch 无法承载配置面废弃与缺省语义翻转的用户可见能力变化（第 1 点）；MAJOR 不适用（0.x 阶段 + 零 breaking 四证）。**版本号最终随 M-4 用户确认**（本论证为规划建议）。

### 2.3 本次明确不发布什么（防 scope creep——显式记录）

| 项 | 来源 |
| --- | --- |
| C-2 Claude 订阅 OAuth | DEC-026 范围红线原文（「仅 GPT 通道，其余等后续我的需求」） |
| C-4/C-5 成功率闭环 + C-9 报告 | plan-tracker 路线图 v0.3.2 行 |
| C-6/C-7/C-8 池泛化 / onboarding 向导 / 官方安装通道 | plan-tracker 路线图 v0.3.3 行 |
| **对话内图片附件显示层残留修复（FIX-008 候选域）** | CHANGELOG v0.3.0 已知问题节已披露（:62）；本版不承载修复——收口时确认披露延续 |
| CI 面建设 | RISK-001 域——另行排期，非本版本承载（G4 pending 持续披露） |
| 出口③设备码 | 已随 v0.3.0 发布（EVO-005，DEC-025 D-2a）——无本版遗留事项（tracker:61 待办行陈旧性观察见 §7 #17） |

---

## §3 发布门禁（本仓四项——REL-001/REL-003/EV-084 先例口径）

> 逐项全 PASS 方可进入 M-4 用户授权；任一 FAIL 阻断。每项结果须有记录（release-checklist-v0.3.1.md 落列）。

| 门禁 | 内容 | 判定方式 | 现状 |
| --- | --- | --- | --- |
| **RG-1** | 全量测试网零回退：smoke 948/0 + stats 110 + routing-paths 114 + adapter-parity 14 + attachments 65 + oauth-credentials 98 + oauth-loopback 20 + client-render exit 0 + oauth-promotion 13 + metrics exit 0（**EV-086 权威值**） | 无沙箱复跑 exit 0 留痕；断言数以运行时实测为权威 | ✅ **PASS（2026-08-30，EV-086）**；M-5 执行段 bump 后 MUST 复跑 ⏳ |
| **RG-2** | tarball 隔离冷装冒烟：npm pack → TEMP 解包 → 环境变量重定向安装（npm_config_cache + DSH_HOME 重定向临时目录）——断言清单见 release-checklist §冷装 runbook | 隔离环境安装冒烟记录（**措辞纪律：「隔离环境安装冒烟（环境变量重定向至临时目录）通过」——无限定语「真实安装/真实环境」= 违规措辞**） | ⏳ **PENDING（M-5 发布执行段跑；本规划列为门禁项）** |
| **RG-3** | GATE-8 归档触发检测（发布收尾段）：`archive.py migrate --auto --dry-run`；触发则 migrate + `check-archive-integrity`，失败阻断发布完成 | 机器输出留痕 | ⏳ **PENDING（M-7 收尾段）**；v0.3.0 先例为跳过（已发布版本计数 0<2，EV-084）——本次结果以实跑为准，预判不写死 |
| **RG-4** | check-governance 健康检查 | 判定口径 = **无本版引入的未申报阻塞项**；已知 16 issues 均为插件仓 FIX-281 已申报域 + 非阻塞 WARN——**如实披露，不伪装为 0**（先例：GOV-001 28 issues 经核查均为 pre-existing，EV-025 口径） | ✅ PASS（披露口径）——已知 16 issues 在案申报；M-7 收尾段复核 ⏳ |

### 3.1 Feature Flag 状态（v0.3.1 发布面——无新增 flag）

| Flag | 缺省 | 状态 |
| --- | --- | --- |
| `router.oauthExperimental` | （已废弃） | **v0.3.1 退役**——转正移除；遗留键容忍透传（feature-flags-v0.3.0.md §3 评估结果注记在案） |
| `router.oauthTosAccepted` | （已废弃） | 随实验开关一并退役；ToS 实验声明转为非阻断风险提示 |
| `router.takeoverDefaultModel` | false | v0.2.1 既有，本版零变更 |
| `router.stats.persist` | true | v0.3.0 既有，本版零变更 |

> v0.3.1 无新增 flag、无灰度机制——不虚构渐进放量（§6 No-overclaim #10）；feature-flags 三件套不另立 v0.3.1 新文件（退役/存量状态以 feature-flags-v0.3.0.md 转正注记 + 本表为准）。

### 3.2 发布策略（本仓形态论证——Big-Bang + kill-switch 三层兜底）

单机本地插件、无灰度基础设施（无 feature-flag 分流面、无服务端放量面）——沿用 v0.3.0 先例：**Big-Bang 发布 + kill-switch 三层兜底 + 48h 观察期 + 回滚预案**。v0.3.1 特殊性：flag 层退役后 kill-switch 为三层新语义（下表），通道级「一键全关」= `router.enabled`（①层）。

### 3.3 Kill-switch 三层验证语义（转正后新语义——「验证过可以」，非「应该可以」）

| 层 | 关闭后行为 | 验证 | 状态 |
| --- | --- | --- | --- |
| ① `router.enabled` 总开关 | route_agent 拒绝调用 + 提示段清空 + 统计暂停 | smoke/routing-paths 既有断言（C13/D8b 看护 lib/tool.js 行为） | ✅ 已验证（EV-086：smoke 948/0 + routing 114 复跑全绿） |
| ② 账号 `enabled=false` | **调用与发起授权双侧拦截并明确提示**（resolveAgent 直连 + oauthBegin 发起，先于凭据触碰）+ 池选号跳过 + 发起拒绝留痕 `account_disabled` telemetry | oauth-promotion B 组判别（B1 直连拒绝零凭据副作用 / B2 发起拒绝留痕） | ✅ 已验证（EV-086：promotion 13/13——EVO-006 转正后②层双侧判别由 B1/B2 判别断言看护） |
| ③ 登出删除（W-5） | 删凭据文件 + 清 oauthAccounts 条目 + 清池引用；**恒可用不受任何开关门控** | 登出后文件不存在断言 + 登出×兑换竞态判别 + B4 双关闭态验证 | ✅ 已验证（EV-086：promotion 13 含 B4；EVO-002 R7/R8 + REL-003 dcd44fa 链） |

边界注记（feature-flags §4，EVO-006 R0 P3-f 闭环）：模型发现（oauthDiscover）不受 ② 门控——管理面（发现/登出删除）与使用面（调用/发起授权）分属不同边界。旧 ③ 层（实验 flag）关闭语义已退役，由上表三层承接。

---

## §4 里程碑（规划段 → Release Reviewer → M-4 授权点 → 执行序列）

> 交互边界：M-4 为唯一用户决策点（DEC-143）；其余为自动/受控执行。

| 里程碑 | 内容 | 出口判据 | 边界 |
| --- | --- | --- | --- |
| **PM-0 规划段**（本文件） | version-plan + release-checklist + rollback-plan 三产物 | 三产物齐 + §7 零编造自检 | Release Agent（自动） |
| **PM-1 Release Reviewer 审查** | 对三产物独立审查（发布计划完成后必须进入审查——角色硬门槛） | APPROVED 或 APPROVED_WITH_NOTES（unresolved_blockers=0）；NEEDS_CHANGE → 返工 → 复审（T1 回路，round<3） | review-record 机器落盘 |
| **M-4 用户发布授权点** | ask_user_question 呈报（§8）：D-1 版本号确认 / D-2 Go-No-Go / D-3 tag+push+Release 逐项授权 / D-4 发布时点 | 授权留痕（decision-log/会话记录） | **用户决策点（DEC-143）**——唯一 transition 授权入口 |
| **M-5 发布执行**（授权后，Coordinator 执行；Release Agent 无命令权限） | 授权后执行序列（一次走完）：**E-1** bump commit（Developer 段载体：package.json 0.3.0→0.3.1 + README 徽章/安装命令同步 + CHANGELOG 未发布段→v0.3.1 节收口——git log 实采对照 + 「破坏性变更：无」显式节 + 已知问题三项延续核对）→ **E-2** 全量门控复跑（RG-1，EV-086 同口径零回退）→ **E-3** npm pack + tarball 隔离冷装冒烟（RG-2——冷装先于 tag，未验证产物不打 tag）→ **E-4** tag v0.3.1（annotated，EV-084 先例）→ **E-5** push main + push tag → **E-6** gh Release 创建（assets 含 tarball，非 draft）→ **E-7** GATE-8 归档触发检测（RG-3，收尾）→ **E-8** 治理收尾（evidence 行 + tracker 路线图行 v0.3.1 已发布 + 风险状态注记） | 每步留痕（EV 行）；RG-1~3 全 PASS；tag/远端 tag/Release 一致 | 授权后执行（maximum-autonomy 域内；push/Release 已获 M-4 逐项授权——EV-084 先例） |
| **M-6 发布后验证** | 48h 观察期（release-checklist 第四步）：安装链路 + 冒烟基线 + 转正通道冒烟（已登录账号升级后继续可用承诺复确认）+ kill-switch 三层复跑 + 宿主 junction 观察 | 冒烟记录 + 观察期无 P0/P1 | 自动 + 用户观察 |
| **M-7 治理收尾** | RG-3 归档检测执行 + RG-4 复核 + tracker/风险注记 | 归档 integrity PASS（若触发迁移） | 自动（Coordinator） |
| **M-8 版本复盘** | P-vN 演进检查 + 观察期结论 + 完成必推荐（task-priority-analysis——Coordinator 执行，从 unblocked + 最高优先级未完成任务推荐） | 复盘记录入仓 | 自动（Coordinator）+ 用户确认下一步 |

---

## §5 风险与回滚

### 5.1 风险登记（发布面——引用 + 处置，不新开不重开）

| 风险 | 等级 | 与 v0.3.1 的关系 | 处置 |
| --- | --- | --- | --- |
| **RISK-001**（risk-log:5，活跃）CI 面缺、回归保护依赖本地测试网 | 中 | v0.2.1/v0.3.0 已两轮带披露发布先例；现行保护 = 本地全量测试网（EV-086 十面零回退） | 持续披露（CHANGELOG 已知问题延续核对列 M-5 E-1）；CI 任务另行排期（G4 pending 不阻塞——先例 DEC-025 D-3a） |
| **RISK-003**（risk-log:7，活跃）宿主接口演进无预警（npx cache 静默刷新） | 高 | **本版零依赖面变更**——宿主漂移风险面与 v0.3.0 发布时点相同；parity 14 全绿（EV-086） | adapter-parity 看护 + 症状知识库；宿主再漂移 = 回归测试触发条件（rollback 触发条件④） |
| R-E1 OpenAI 侧收紧（client/端点/风控） | 高（外部不可控） | 转正后通道恒可用语义使暴露面不再受 flag 收敛——关闭路径 = ①/②层 + 代码层 revert | 三层 kill-switch（§3.3）+ 最坏回退 = revert 转正段（rollback-plan §场景 B）；**flag 兜底退役事实如实披露**（§7 观察 #3） |
| 已知问题：对话内图片附件显示层残留 | 低 | v0.3.0 已知问题披露延续；FIX-008 候选域，本版不承载修复 | CHANGELOG 收口时确认披露延续（E-1）；不虚报修复 |
| 升级披露：「开过又关」cohort | 低（披露面） | P2-a 披露已在 CHANGELOG 未发布段 + README:128 | 规划引用原文，不弱化措辞；回滚侧语义已评估（rollback-plan §C-3） |
| check-governance 16 issues | 低（非阻塞） | 均为插件仓 FIX-281 已申报域 + 非阻塞 WARN | 如实披露（RG-4 判定口径 = 无本版引入未申报阻塞项）；M-7 复核 |

### 5.2 回滚方案（三阶段——详见 rollback-plan-v0.3.1.md）

| 阶段 | 窗口 | 动作 | 耗时 |
| --- | --- | --- | --- |
| 一 | push 前（执行段任一步失败/叫停） | 中止执行序列 + 本地清理（revert bump commit / `tag -d` / tgz 清理） | 分钟级（<5min） |
| 二 | push 后（已 tag/已 Release） | revert 产品段 7 commits + bump commit → 全量复跑 → 前滚修复（v0.3.2 承载，默认建议）或整体回退重发（按用户裁决） | 15–30min |
| 三 | 用户侧（安装态，OPS-001 junction 面） | 开发树 checkout v0.3.0 + 重启（junction 随动）/ v0.3.0 tarball 重装 | 分钟级 |

**本版特定约束**：v0.3.0 回滚方案中的 **undici revert 顺序约束不适用**——undici 已随 v0.3.0 发布入库，v0.3.1 无依赖面变更，产品段 revert 不触碰 package.json（bump commit 除外）（推演——基于 v0.3.0 发布事实 EV-084 + 两轮审查 package.json diff 空，§7 #15）。数据兼容性 = 无 Schema/数据格式变更，回滚无数据冲突（详见 rollback 文件影响评估）。

---

## §6 No-overclaim 边界（本规划与后续发布材料的措辞红线）

1. **不声明「生产就绪/生产级」**——项目处 0.x 演进期。
2. **不声明 OpenAI 官方批准/合作/背书**——「转正」是产品语义面（入口/文案/门控），不等于「无风险」；平台服务条款与账号风控常规风险提示保留（非阻断、非实验声明口径 = CHANGELOG 未发布段原文）；originator 诚实自标识不变。
3. **实测数字口径**——一切验证表述引用 EV-086 权威值（948/110/114/14/65/98/20/exit0/13/exit0）；M-5 执行段复跑后以复跑值为准，不沿用旧值宣称。
4. **隔离验证措辞纪律**——仅使用「隔离环境安装冒烟（环境变量重定向至临时目录）通过」类限定表述；无限定语的「真实安装/真实环境验证」= 违规措辞。
5. **CI 面如实披露**——不声称「CI 全绿」；G4 pending 持续披露。
6. **Kill-switch「验证过可以」**——B1/B2 断言在案（EV-086 promotion 13）方可写「已验证」；未跑的（执行段复跑/冷装/归档检测）一律 PENDING，不预支。
7. **升级披露如实**——「开过又关」cohort 偏好不迁移的披露以 CHANGELOG/README 在案文案为准，材料不弱化、不省略。
8. **无新增 flag 的事实如实**——v0.3.1 发布面 = 存量两 flag + 退役两键；不虚构灰度/渐进放量机制（Big-Bang 论证见 §3.2）。
9. **规划 ≠ 决策**——版本号/发布时点/tag/push 全部待 M-4 用户授权；本文件任何建议不构成既成事实。
10. **推演与实证分层**——机制推演（如回滚后遗留键复活语义）明确标注「推演级」，与运行时实证（EV 留痕）区分呈现。

---

## §7 与 plan-tracker 事实一致性核对表（零编造自检）

| # | 本规划引用事实 | 来源留痕（文件/行） | 核对 |
| --- | --- | --- | --- |
| 1 | v0.3.0 已发布，tag bb81abf，2026-08-29，tarball 1,507,506B | plan-tracker:125；EV-084 | ✅ |
| 2 | package.json version 0.3.0 | package.json:4（实读） | ✅ |
| 3 | ahead 10 commits | review-REL-004-R0-input.md:8（审查实采） | ✅（逐 commit 完整清单待 M-5 git log 实采——EVO-006 段 3 + 收尾段 4 + 治理 0eb1324/820d862 已点名，余量以实采为准）⚠️ |
| 4 | EVO-006 3 commits + R0 APPROVED_WITH_NOTES/0 | plan-tracker:34；EV-085；review-EVO-006-R0.md（机录） | ✅ |
| 5 | REL-004 收尾段 4 commits + R0 APPROVED_WITH_NOTES/0（P3×1 信息性） | plan-tracker:35；EV-086；review-REL-004-R0.md（机录） | ✅ |
| 6 | EV-086 权威值（十面） | evidence-log:194（EV-086 行）+ 任务书权威输入 | ✅ |
| 7 | 门控链/判别式/telemetry 行号事实（service.js:804/3228/3232 等） | review-EVO-006-R0-input §一/§三 + review-REL-004-R0-input §一（审查实读留痕；本 Agent 未复读源码——以审查链为源） | ✅ |
| 8 | 配置键废弃 + schemastery 透传容忍（库源码级实证） | review-REL-004-R0-input §四（strict=false + merge 透传）；smoke:95 / promotion:44-45 双断言 | ✅ |
| 9 | 「开过又关」披露在案 | CHANGELOG:12 + README:128（实读） | ✅ |
| 10 | kill-switch 三层新语义 + B1/B2 已验证 | feature-flags-v0.3.0.md §4（转正注记）+ EV-086 promotion 13 | ✅ |
| 11 | RISK-001 活跃 / RISK-003 活跃 | risk-log:5/:7；plan-tracker:20（G4 待评） | ✅ |
| 12 | FIX-008 候选域披露延续 | CHANGELOG v0.3.0 已知问题（:62）+ EV-084 残留披露 | ✅ |
| 13 | check-governance 16 issues（FIX-281 已申报域 + 非阻塞 WARN） | 任务书权威输入（Coordinator 预核验；本 Agent 无命令权限未自跑） | ⚠️ 以任务书申报为源，M-7 收尾段复核 |
| 14 | 依赖面零变更（package.json 不在任何 v0.3.1 diff） | review-EVO-006-R0-input §范围事实 + review-REL-004-R0-input §范围事实（两轮实采） | ✅ |
| 15 | undici 顺序约束不适用本版回滚 | v0.3.0 已含 undici（CHANGELOG:47 + EV-084）+ #14 → 逻辑推演 | ✅（标注推演级） |
| 16 | 归档检测 v0.3.0 先例跳过（计数 0<2） | EV-084 | ✅（v0.3.1 结果待实跑，预判不写死） |
| 17 | tracker:61「出口③设备码流排期」待办行 vs EVO-005 已终态发布（tracker:31/:125） | 实读对比——疑似陈旧待办行 | ⚠️ 观察项上报（§8 备注），不在本规划修正（.governance 非本 Agent 写域） |
| 18 | README:128 已含「v0.3.1 起为正式通道」表述 | README:128（实读；a4d33cd 文档口径先行，随发布生效） | ✅ |

---

## §8 待用户裁决点汇总（M-4 呈报——Coordinator 转 ask_user_question 用）

| # | 裁决点 | 选项 | 本规划建议 |
| --- | --- | --- | --- |
| D-1 | 版本号确认 | MINOR **0.3.1**（§2.2 论证）/ PATCH 0.3.1（反论见 §2.2 第 1 点） | **MINOR** |
| D-2 | Go/No-Go | RG-1 已 PASS（EV-086）+ RG-2/RG-3 执行段闭环为前置 + PM-1 审查通过 | Go（满足前置后） |
| D-3 | push + GitHub Release 授权 | 逐项授权（tag / push main / push tag / gh Release——EV-084 先例口径） | 授权后 M-5 一次执行 |
| D-4 | 发布时点 | 授权即执行（M-5 序列）/ 指定窗口 | 用户定 |

> 备注：tracker:61「出口③设备码流排期（用户决策项）」疑似陈旧行（EVO-005 已随 v0.3.0 发布闭环）——建议 Coordinator 于 M-7 治理收尾时清账；不构成本版发布阻塞。

---

## 自检清单（硬门槛逐项核对）

| 检查项 | 结果 |
| --- | --- |
| 发布范围与 plan-tracker 路线图/任务终态一致（零编造，§7 逐项留痕） | ✅ 18 项核对（2 项标 ⚠️ 待实采/复核，均已声明） |
| semver 合规：0.3.0→0.3.1 MINOR 论证充分（§2.2：新能力语义 + 零 breaking 四证 + 不跳号 + PATCH 反论否弃） | ✅ |
| 入槽清单每项带来源留痕（§2.1）；「本次不发布什么」显式记录（§2.3） | ✅ |
| 发布门禁 = 本仓四项（RG-1~4，插件仓工具链不适用声明见头表） | ✅ |
| Kill-switch「已验证」仅限断言在案项（§3.3 三层均 EV-086 在案）；未跑项 PENDING | ✅ |
| 风险不关闭不重开（RISK-001/003 持续披露；R-E1 处置更新如实） | ✅ |
| No-overclaim 边界完整（§6 十条） | ✅ |
| 发布决策/tag/push 全部标注待 M-4 用户授权（§4/§8） | ✅ |
| 回滚三阶段 + 本版特定约束（undici 不适用声明 + 数据兼容性） | ✅ |
| 唯一写入目标 = 三产物文件（version-plan/checklist/rollback v0.3.1）；未修改产品代码/CHANGELOG/package.json/.governance；未执行命令；未与用户交互；未创建子 agent | ✅ |
