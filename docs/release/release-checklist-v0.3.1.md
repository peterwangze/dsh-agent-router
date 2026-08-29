# v0.3.1 发布检查清单（Release Checklist）

| 项 | 值 |
|---|---|
| 发布版本 | v0.3.1（candidate——发布日期以 tag 为准） |
| 上一版本 | v0.3.0（2026-08-29 tag `bb81abf`，EV-084 发布执行） |
| 任务 | REL-004（规划段 = 本文件随 version-plan-v0.3.1.md 产出；执行段 = M-4 用户授权后，Coordinator 执行） |
| 检查日期 | 2026-08-30（candidate 产出；终态以 M-4 发布决策时点复核为准） |
| 依据 | version-plan-v0.3.1.md §3（RG 门禁）+ DEC-026（C2 转正范围权威）+ EV-086（M-3 无沙箱复跑权威值）+ release-checklist SKILL 六步 + 本仓先例（REL-001/REL-003/EV-084 口径；checklist+rollback 两件 = v0.2.0/DEV-003 惯例） |
| 生命周期状态 | `lifecycle_state: candidate`——bump/tag/push/GitHub Release 均待 M-4 用户授权（DEC-143 交互基线；无 release-ledger 工具，文字标注机制沿用 v0.2.0/v0.3.0 先例） |
| 关联产出物 | `docs/release/version-plan-v0.3.1.md` / `docs/release/rollback-plan-v0.3.1.md` / `CHANGELOG.md`（未发布段——收口归执行段）/ `docs/release/feature-flags-v0.3.0.md`（§1/§3/§4/§5 转正注记——v0.3.1 无新增 flag，不另立 flags 文件，理由见 version-plan §3.1） |
| 本仓适用性边界 | 插件仓 check-release / release-ledger 工具链不适用——门禁按本仓四项（RG-1~4）+ 支撑项（RG-5/6）执行 |

---

## 第一步：发布范围确认

| # | 检查项 | 通过标准 | 状态 | 说明 |
|---|---|---|---|---|
| 1 | 版本号已定义 | 遵循语义化版本 | ⏳ PENDING（M-4 确认 + 执行段 bump） | 规划建议 **0.3.0 → 0.3.1（MINOR）**——论证 version-plan §2.2 四证（零 breaking：API/协议面未动 / 配置键废弃带 schemastery 透传容忍 / 行为变化有披露与替代路径 / 关闭能力三层保留）；package.json:4 实读仍 `0.3.0`，bump 属 M-4 授权后执行段（E-1） |
| 2 | 变更范围已列出 | 所有变更项有清单 | ✅ PASS（清单面）/ ⏳ 实采对照（执行段） | 范围 = EVO-006 转正 3 commits（bf667b3/6ebe9ed/a4d33cd）+ REL-004 收尾段 4 commits（6cbe4fc/f2f3ba5/21db990/866d4df）+ 治理 commits；用户面语义 = CHANGELOG 未发布段在案；**commit 全量三分账（产品/治理）= M-5 E-1 git log 实采对照**（v0.3.0 先例：86-commit 三分账，EV-084；ahead 10 中治理 commit 完整清单待实采点名） |
| 3 | 变更类型已标注 | 新功能/修复/变更/破坏性逐项标注 | ✅ PASS（当前态） | CHANGELOG 未发布段「变更」节齐全（转正主条目 + 升级披露 + 关闭能力说明）；破坏性变更语义 = **配置键废弃（容忍迁移）**——「破坏性变更：无」显式节 + 论证 = ⏳ PENDING（收口时补，v0.3.0 节句式先例，论证源 version-plan §2.2） |
| 4 | 发布时间窗口已确定 | 有明确发布计划 | ⏳ 待 M-4 | 用户授权即执行（M-5 序列 E-1~E-8）或指定窗口——用户决策项 |

## 第二步：变更日志检查

| # | 检查项 | 通过标准 | 状态 | 说明 |
|---|---|---|---|---|
| 1 | CHANGELOG 已更新 | 覆盖本次所有变更，与 commit 对照一致 | ✅ PASS（未发布段在案）/ ⏳ 收口 PENDING（执行段） | 未发布段已含：转正主条目（无需再开任何开关、升级账号不受影响）+ 实验开关/条款确认移除 + 「开过又关」升级披露 + 风险提示保留 + 关闭能力不变 + 内部注解（DEC-026/判别测试）；**节标题版本化（Unreleased → v0.3.1 — 日期）+ git log 实采对照收口 = M-5 E-1**（本 Agent 不触碰 CHANGELOG） |
| 2 | 破坏性变更已高亮 | 不兼容变更有说明与迁移指引 | ✅ PASS（披露面）/ ⏳ 显式节 PENDING（收口） | 口径 = 「破坏性变更：无」+ 配置键废弃（容忍迁移）升级披露在案（schemastery 透传容忍——库源码级实证 review-REL-004-R0 §四）；收口时显式「破坏性变更：无」节 + 四证论证（v0.3.0 句式先例） |
| 3 | 依赖变更已记录 | 版本号 + 变更原因 | ✅ PASS | **零依赖变更**——package.json 不在任何 v0.3.1 diff（EVO-006 R0 + REL-004 R0 两轮审查实采）；undici ^7.18.0 / peerDeps 8×rc.8 与 v0.3.0 完全一致；收口时如实呈现「无依赖变更」 |
| 4 | 已知问题已列出 | 说明 + workaround | ⏳ PENDING（收口核对——三项延续） | 收口时核对已知问题节三项延续：①无 CI 面（RISK-001 用户面披露）；②对话内图片附件显示层残留（FIX-008 候选域，v0.3.0 已知问题 :62 原文延续）；③「开过又关」升级披露（已在变更节，确认已知问题节引用一致性） |

## 第三步：回滚方案验证

| # | 检查项 | 通过标准 | 状态 | 说明 |
|---|---|---|---|---|
| 1 | 回滚方案已编写 | 具体步骤，非泛化描述 | ✅ PASS | `docs/release/rollback-plan-v0.3.1.md`：三阶段——push 前 abort（分钟级）/ push 后 revert+版本面处置（15–30min，前滚优先建议）/ 用户侧 junction 回退（分钟级）；本版特定约束已声明（v0.3.0 的 undici 顺序约束不适用——零依赖面变更） |
| 2 | 回滚方案已验证 | 测试环境执行过 | ✅ PASS（门控面——「验证过可以」） | kill-switch 三层新语义断言在案且 EV-086 全绿：① router.enabled（smoke/routing-paths 既有断言）；② 账号 enabled 双侧（oauth-promotion B1 直连拒绝零凭据副作用 / B2 发起拒绝留痕 account_disabled——13/13）；③ 登出删除（文件不存在断言 + 竞态判别 + B4 双关闭态）；git 层 = 机械操作，验证程序已定义（回滚后全量复跑 + tarball 重打包冷装） |
| 3 | 数据兼容性 | 回滚后数据兼容 | ✅ PASS | v0.3.1 零 Schema/数据格式变更（统计 JSONL/凭据文件格式与 v0.3.0 完全一致；EVO-006/REL-004 无 stats/oauth-credentials 结构改动）；回滚目标 v0.3.0 与本版数据面完全兼容（详见 rollback 影响评估） |
| 4 | 回滚影响范围 | 影响已评估 | ✅ PASS | rollback 影响评估表：转正语义回退 = 通道回到实验门控语义；「开过又关」cohort 遗留键回滚后复活生效（推演级——schemastery 透传实证 + v0.3.0 发布语义）；telemetry 新 reason 回滚后自然消失（环形缓冲无格式冲突） |

## 第四步：发布后验证计划（M-6——48h 观察期）

| # | 验证项 | 验证方式 | 责任人 |
|---|---|---|---|
| 1 | 安装链路 | 在线/离线安装命令按 v0.3.1 版本号执行成功；DSH 重启后设置页路由配置正常（tarball 面由 M-5 E-3 冷装前置覆盖——本项验证发布 tag 后真机安装） | Coordinator |
| 2 | tarball 隔离冷装复验 | 发布产物面复跑冷装 runbook（tag 检出后重打包——与 E-3 同一断言清单） | Coordinator |
| 3 | 冒烟基线 | 全量测试网十面 exit 0（EV-086 口径复跑） | Coordinator |
| 4 | 转正通道冒烟 | ① v0.3.0 已登录账号升级后继续可用（CHANGELOG 兼容承诺复确认）；② 无 flag 场景新一键登录冒烟（1455/设备码链路） | 用户 + Coordinator |
| 5 | kill-switch 三层 | ① router.enabled / ② 账号 enabled 双侧 / ③ 登出删除——断言复跑（EV-086 口径） | Coordinator |
| 6 | 统计落盘回归抽查 | 本版零触碰 stats 域——抽查确认无回归（重启后统计仍在 + 按天视图正常） | Coordinator |
| 7 | 宿主升级观察 | OPS-001 junction 安装面：junction 指向开发树，升级路径 = tag 检出或刷新后重启（重启生效语义不变） | Coordinator |

> 监控告警项：不适用——本地插件无独立告警体系（v0.2.0/v0.3.0 先例），以观察期人工核对替代。

## 第五步：数据验证计划（小项目替代标准，沿用先例判定）

- **核心功能冒烟通过**：全量测试网十面全绿（RG-1，EV-086 口径）+ M-6 安装冒烟。
- **无新 bug 报告 48 小时**：发布后 ≥48h 观察期无 P0/P1 新问题。
- **回滚触发条件**（观察期内任一满足即按 rollback-plan 执行）：① P0/P1 级新 bug；② 转正兼容承诺断裂（v0.3.0 已登录账号升级后不可用）；③ 一键登录新登录链路回归（1455/设备码/兑换）；④ 宿主 dsh-* 漂移适配断裂（RISK-003——parity 复跑变红；本版零依赖变更，概率面与 v0.3.0 相同）；⑤ R-E1 OpenAI 侧收紧升级；⑥ 用户主动要求回退。
- **成功标准（量化）**：单机自动化面 100%（十面套件 + 冷装断言）；用户面观察期样本采集记基线——**不预支未采集数字**（No-overclaim）。

## 第六步：发布决策（candidate——非最终）

| 决策 | 条件 | 状态 |
|---|---|---|
| 可以发布 | RG-1 PASS（已 PASS，执行段 bump 后复跑）+ RG-2/RG-3 执行段闭环 + RG-4 披露复核 + Release Reviewer 审查 APPROVED（unresolved_blockers=0）+ M-4 用户 Go/No-Go + tag/push 逐项授权 | ⏳ 待 M-4（候选态——本 checklist 记录现状，**不构成发布决策**） |

**决策理由预留**（M-4 时逐项复核）：① EVO-006/REL-004 审查链双 APPROVED_WITH_NOTES/0（机录在案）；② EV-086 十面零回退（M-3 无沙箱复跑权威）；③ 依赖面零变更——风险面不劣于 v0.3.0 发布时点；④ 回滚三阶段就绪、kill-switch 三层断言在案（「验证过可以」）。

---

## RG 门禁总表（本仓四项 + 支撑项：现状 + 判定方式 + 证据路径）

| GATE | 内容 | 判定方式 | 现状（2026-08-30 candidate） | 证据路径 | 执行里程碑 |
|---|---|---|---|---|---|
| **RG-1** | 全量测试网零回退（十面：smoke 948/0/exit0 + stats 110 + routing 114 + parity 14 + attachments 65 + credentials 98 + loopback 20 + client-render exit0 + promotion 13 + metrics exit0） | 无沙箱复跑 exit 0 留痕；**断言数以运行时实测为权威** | ✅ **PASS（2026-08-30 M-3 无沙箱复跑）**；执行段 bump 后复跑 ⏳ | EV-086 | M-3 ✅ / M-5 E-2 ⏳ |
| **RG-2** | tarball 隔离冷装冒烟（npm pack → TEMP 解包 → 环境变量重定向安装；断言清单见 §冷装 runbook） | 隔离环境安装冒烟记录（**措辞纪律：「隔离环境安装冒烟（环境变量重定向至临时目录）通过」——无限定语「真实安装/真实环境」= 违规措辞**） | ⏳ **PENDING**（发布执行段跑——规划列为门禁项） | EV 行（E-3 执行时） | M-5 E-3 |
| **RG-3** | GATE-8 归档触发检测（发布收尾段）：dry-run → 触发则 migrate + check-archive-integrity（失败阻断发布完成） | 机器输出留痕 | ⏳ **PENDING**（M-7）；v0.3.0 先例跳过（计数 0<2，EV-084）——本次以实跑为准，预判不写死 | 归档命令输出 + `.governance/archive/index.md`（若触发） | M-5 E-7 / M-7 |
| **RG-4** | check-governance 健康检查 | 判定口径 = 无本版引入的未申报阻塞项；**已知 16 issues 均为插件仓 FIX-281 已申报域 + 非阻塞 WARN——如实披露，不伪装为 0**（先例：GOV-001 28 issues pre-existing 核查口径） | ✅ PASS（披露口径——16 issues 在案申报）；收尾段复核 ⏳ | 任务书权威输入 + FIX-281 申报记录（tracker:64） | M-7 |
| RG-5 | 发布审查：Release Reviewer 审查规划三产物（发布计划完成后必须进入） | review-record 机器落盘；**仅 APPROVED 或 unresolved_blockers=0 的 APPROVED_WITH_NOTES 为通过终态** | ⏳ PENDING（PM-1——本 checklist 产出后的下一环节） | `.governance/review-REL-004-*.md` | PM-1 |
| RG-6 | 版本一致性：package.json 0.3.1 + README 徽章/安装命令同步 + CHANGELOG ↔ git log 实采对照 + 「破坏性变更：无」显式节 + 已知问题三项延续 | 逐项核对记录 | ⏳ PENDING（执行段 E-1；当前 package.json:4 = 0.3.0、README 版本字面量 = v0.3.0——bump 前态如实记录） | E-1 留痕 | M-5 E-1 |

---

## 冷装 runbook（RG-2 / M-5 E-3——Coordinator 执行；Release Agent 无命令权限）

> **真实环境防护（三选一——隔离环境）**：npm cache 与 DSH_HOME 环境变量重定向至临时目录，零触碰真实 `~/.dsh` 与 `$DSH_HOME`。Coordinator 逐条命令上报，结构化结果机写 evidence 行。v0.3.0 先例 runbook：release-checklist-v0.3.0.md §冷装（EV-078）。

| # | 步骤 | 命令要点（pwsh） | 断言 |
|---|---|---|---|
| 1 | 重打包 | 仓库根 `npm pack` → `dsh-agent-router-0.3.1.tgz`——记仓库根绝对路径为 `$tgz`（tgz 位于仓库根而非 $tmp——R1 F-2 路径先例） | tgz 生成；文件名含 0.3.1 |
| 2 | 隔离目录解包 | `$tmp = Join-Path $env:TEMP ("dsh-router-v031-cold-" + [guid]::NewGuid().ToString("N").Substring(0,8))`；`tar -xzf dsh-agent-router-0.3.1.tgz -C $tmp` | 解包 exit 0；`$tmp\package\` 存在 |
| 3 | 清单核验 | 读 `$tmp\package\package.json` | **version = 0.3.1**；dependencies 含 `undici ^7.18.0`（与 v0.3.0 一致——零依赖变更断言）；peerDependencies 8 包均 `^0.1.0-rc.8`（无变更断言）；files 白名单与源一致 |
| 4 | 隔离安装 | 环境变量重定向：`$env:npm_config_cache = "$tmp\npm-cache"`、`$env:DSH_HOME = "$tmp\dsh-home"`（先创建）；在 `$tmp\consumer`（新建空 package.json type=module）内 `npm install "$tgz" --omit=dev --legacy-peer-deps`（`$tgz` = 步骤 1 仓库根绝对路径） | **exit 0**；`node_modules\dsh-agent-router` 存在；undici **hoist 感知断言**：consumer 根 `node_modules\undici` **或** 包内嵌套 `node_modules\dsh-agent-router\node_modules\undici` **二者其一**存在且版本 7.x |
| 5 | ProxyAgent 可构造 | createRequire 自包内解析（hoist 布局无关——EV-078 先例做法）：`node -e "const {createRequire}=require('module'); const req=createRequire(require('path').resolve('$tmp','consumer','node_modules','dsh-agent-router','package.json')); const {ProxyAgent}=req('undici'); const a=new ProxyAgent('http://127.0.0.1:9'); console.log(typeof a)"`（路径转义按现场调整） | 输出 `object` |
| 6 | 零触碰校验 | 操作前后核对真实 `~/.dsh` 与 `$DSH_HOME`（原值）目录：无新增/修改（Test-Path + 时间戳抽查） | 真实环境零变更 |
| 7 | 留痕 | 结果机写 `.governance/evidence-log.md` EV 行 | 措辞：「**隔离环境安装冒烟（TEMP 解包 + --omit=dev --legacy-peer-deps，环境变量重定向至临时目录）通过**」 |

**E-3 位置**：E-2 门控复跑之后、E-4 tag 之前——**未验证产物不打 tag**（v0.3.0 M-3.5 挂点先例，Design F-1 语义延续）。

---

## M-4 用户授权清单（呈报项——Coordinator 转 ask_user_question）

| # | 授权项 | 内容 | 前置 |
|---|---|---|---|
| D-1 | 版本号确认 | MINOR 0.3.1（version-plan §2.2 论证） | PM-1 审查通过 |
| D-2 | Go/No-Go | RG-1 PASS（EV-086）+ RG-2/RG-3 执行段闭环承诺 + RG-4 披露口径 | 同上 |
| D-3 | transition 授权 | tag v0.3.1 / push main / push tag / gh Release——逐项授权（EV-084 先例口径） | 同上 |
| D-4 | 发布时点 | 授权即执行（M-5 E-1~E-8 一次走完）或指定窗口 | 同上 |

---

## 版本决策记录（0.3.0 → 0.3.1，semver MINOR bump——candidate）

| 项 | 值 |
|---|---|
| 决策依据 | version-plan-v0.3.1.md §2.2（独立论证）+ DEC-026（转正裁决） |
| 决策 | 0.3.0 → **v0.3.1**（MINOR）——**待 M-4 用户确认** |
| bump 级别 | MINOR（0.3.0 → 0.3.1，主版本 0 不变，次版本 3 不变，修订号 0 → 1） |
| 理由 | ① 新能力语义（转正——通道缺省即正式）非缺陷修正，不满足 PATCH 语义；② 零 breaking 四证（API/协议面未动 + 配置键废弃带透传容忍 + 行为变化有披露与替代路径 + 关闭能力三层保留）；③ 不跳号（相邻 MINOR） |
| 不升 major 的依据 | 0.x 阶段 + 零 breaking（四证）；项目惯例 0.x MINOR 承载新功能（DEC-015 先例） |
| 范围边界 | 仅 GPT 通道转正（DEC-026 红线）；C-2/C-4~C-8/FIX-008/CI 面均不承载（version-plan §2.3） |
| 状态 | candidate——正式生效以 M-4 用户确认 + tag 为准 |
