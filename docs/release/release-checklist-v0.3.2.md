# v0.3.2 发布检查清单（Release Checklist）

| 项 | 值 |
|---|---|
| 发布版本 | v0.3.2（candidate——发布日期以 tag 为准） |
| 上一版本 | v0.3.1（2026-08-30 tag `5ca8b87`，EV-087 发布执行） |
| 任务 | REL-005（规划段 = 本文件随 version-plan-v0.3.2.md 产出；执行段 = M-4 用户授权后，Coordinator 执行） |
| 检查日期 | 2026-08-30（candidate 产出；终态以 M-4 发布决策时点复核为准） |
| 依据 | version-plan-v0.3.2.md §3（RG 门禁）+ DEC-027（FIX-010 三不变量）+ EV-088/089/090/091（修复链/审查链/实测权威）+ release-checklist SKILL 六步 + 本仓先例（REL-001/REL-003/REL-004 口径；checklist+rollback 两件 = 惯例） |
| 生命周期状态 | `lifecycle_state: candidate`——bump/tag/push/GitHub Release 均待 M-4 用户授权（DEC-143 交互基线；无 release-ledger 工具，文字标注机制沿用 v0.2.0/v0.3.0/v0.3.1 先例） |
| 关联产出物 | `docs/release/version-plan-v0.3.2.md` / `docs/release/rollback-plan-v0.3.2.md` / `CHANGELOG.md`（v0.3.2 节——创建与收口归执行段 E-1）/ `docs/release/feature-flags-v0.3.0.md`（§1/§3/§4/§5 注记——v0.3.2 无新增 flag、无 flag 变化，不另立 flags 文件，理由见 version-plan §3.1） |
| 本仓适用性边界 | 插件仓 check-release / release-ledger 工具链不适用——门禁按本仓四项（RG-1~4）+ 支撑项（RG-5/6）执行 |

---

## 第一步：发布范围确认

| # | 检查项 | 通过标准 | 状态 | 说明 |
|---|---|---|---|---|
| 1 | 版本号已定义 | 遵循语义化版本 | ⏳ PENDING（M-4 确认 + 执行段 bump） | 规划建议 **0.3.1 → 0.3.2（PATCH）**——论证 version-plan §2.2（零新能力语义：两缺陷修复 + 一 UX 调整 + 收口；零 breaking 四证；v0.2.1 PATCH 先例）；package.json:4 实读仍 `0.3.1`，bump 属 M-4 授权后执行段（E-1） |
| 2 | 变更范围已列出 | 所有变更项有清单 | ✅ PASS（清单面）/ ⏳ 实采对照（执行段） | 范围 = FIX-009 `8877365`（wrapper.js 占位注入 + fix-009 9 断言）+ FIX-010 `020909b`（prestep header 优先 + fix-010 9 断言）+ EVO-007 `65226a3`+`3665d6a`（账号面板 UX + T1 返工）+ REL-005 收尾段 `1d2bf36`（P1-1 live default 对齐 + P2-2 hygiene + README 5 处）+ 治理 commits；**commit 全量三分账（产品/治理）= M-5 E-1 git log 实采对照**（v0.3.0 先例：86-commit；v0.3.1 先例：12=7+5，EV-087；点名合计 13 枚 vs ahead 12 差 1——实采消歧） |
| 3 | 变更类型已标注 | 新功能/修复/变更/破坏性逐项标注 | ✅ PASS（当前态） | 修复 ×2（FIX-009 400 通路 / FIX-010 气泡显示回归）+ 变更 ×1（EVO-007 UX——入口移除+布局+删除路径补全，README 三处「v0.3.2 起」披露在案）+ 收口（P1-1/P2-2/README）；破坏性变更语义 = **无**——「破坏性变更：无」显式节 = ⏳ PENDING（E-1 收口时创建，论证源 version-plan §2.2 四证） |
| 4 | 发布时间窗口已确定 | 有明确发布计划 | ⏳ 待 M-4 | 用户授权即执行（M-5 序列 E-1~E-8）或指定窗口——用户决策项 |

## 第二步：变更日志检查

| # | 检查项 | 通过标准 | 状态 | 说明 |
|---|---|---|---|---|
| 1 | CHANGELOG 已更新 | 覆盖本次所有变更，与 commit 对照一致 | ⏳ PENDING（E-1 创建收口） | 现态 CHANGELOG 以 v0.3.1 节收尾（无未发布段——实读）——v0.3.2 节由 E-1 **创建**并收口（与 v0.3.1「未发布段先行」路径差异如实标注）：修复节（FIX-009/010，含 DEC-027 语义）+ 变更节（EVO-007，入口移除/布局/删除路径）+ 版本说明（版本号/发布范围三分账/验证基线）；**节标题版本化 + git log 实采对照 = M-5 E-1**（本 Agent 不触碰 CHANGELOG） |
| 2 | 破坏性变更已高亮 | 不兼容变更有说明与迁移指引 | ✅ PASS（披露面）/ ⏳ 显式节 PENDING（收口） | 口径 = 「破坏性变更：无」+ 四证论证（无 API/协议面变更 / 无配置面变更 / 数据面零变更（oauthAccounts 数据域零触碰 EV-090）/ 依赖面零变更）；入口移除披露在案（README L20/L111/L129「v0.3.2 起」）——收口时显式节（v0.3.1 句式先例） |
| 3 | 依赖变更已记录 | 版本号 + 变更原因 | ✅ PASS | **零依赖变更**——package.json 现态 0.3.1 实读（undici ^7.18.0 / peerDeps 8×rc.8 / files 11 与 v0.3.1 完全一致）+ 产品 commits 未触碰 package.json（review-REL-005-R0「无 bump」实证）；收口时如实呈现「无依赖变更」 |
| 4 | 已知问题已列出 | 说明 + workaround | ⏳ PENDING（收口核对——四项延续） | 收口时核对已知问题节四项延续：①无 CI 面（RISK-001 披露）；②对话内图片附件「加载失败」显示层残留（FIX-008 候选域，v0.3.0/v0.3.1 已知问题原文延续——与 FIX-010 修复面不同，不虚报修复）；③deepseek-official 视觉端点挂起（宿主/端点域，vision 旁路 glm 可用——如实披露）；④picked 层盲区（宿主固有 P3，注释披露在案） |

## 第三步：回滚方案验证

| # | 检查项 | 通过标准 | 状态 | 说明 |
|---|---|---|---|---|
| 1 | 回滚方案已编写 | 具体步骤，非泛化描述 | ✅ PASS | `docs/release/rollback-plan-v0.3.2.md`：三阶段——push 前 abort（分钟级）/ push 后 revert 产品段 5 commits + 版本面处置（15–30min，前滚优先建议）/ 用户侧 junction 回退（分钟级）；本版特定约束已声明（undici 顺序约束不适用——零依赖面变更，沿 v0.3.1 先例） |
| 2 | 回滚方案已验证 | 测试环境执行过 | ✅ PASS（门控面——「验证过可以」） | kill-switch 三层断言在案且 EV-090 12 套件全绿：① router.enabled（smoke/routing-paths 既有断言）；② 账号 enabled 双侧（oauth-promotion B1/B2——13/13）；③ 登出删除（文件不存在断言 + 竞态判别 + B4 双关闭态；v0.3.2 ③层入口形态增强——EVO-007 双入口 + R8-F1 重写 14 断言组，EV-090 全绿）；git 层 = 机械操作，验证程序已定义（回滚后全量复跑 + tarball 重打包冷装） |
| 3 | 数据兼容性 | 回滚后数据兼容 | ✅ PASS | v0.3.2 零 Schema/数据格式变更——统计 JSONL/凭据文件格式与 v0.3.1 完全一致；EVO-007 oauthAccounts 数据域零触碰（EV-090，仅 UI 层 + 既有 deleteOauthAccount 服务调用）；回滚目标 v0.3.1 与本版数据面完全兼容（详见 rollback 影响评估） |
| 4 | 回滚影响范围 | 影响已评估 | ✅ PASS | rollback 影响评估表：FIX-009/FIX-010 修复失效回退（image-solo 纯图回到 400 缺陷态[仅当用户环境触发]/气泡显示回回归缺陷态[仅当漂移窗口命中]）；EVO-007 布局回退（OAuth 官方登录不可用入口复活可见 + 位置复原）；**删除路径回 v0.3.1 形态（池行「移除」不清凭据——F-1 缺陷面在 v0.3.1 存在，如实披露）**；判别断言随产品段整段 revert 同退（无失配） |

## 第四步：发布后验证计划（M-6——48h 观察期）

| # | 验证项 | 验证方式 | 责任人 |
|---|---|---|---|
| 1 | 安装链路 | 在线/离线安装命令按 v0.3.2 版本号执行成功；DSH 重启后设置页路由配置正常（tarball 面由 M-5 E-3 冷装前置覆盖——本项验证发布 tag 后真机安装） | Coordinator |
| 2 | tarball 隔离冷装复验 | 发布产物面复跑冷装 runbook（tag 检出后重打包——与 E-3 同一断言清单） | Coordinator |
| 3 | 冒烟基线 | 全量测试网 12 套件 exit 0（E-2 M-3' 口径复跑——含 fix-009 9/9 + fix-010 13/13） | Coordinator |
| 4 | FIX-009 通路冒烟 | image-solo 纯图消息占位注入不再 400（用户已复验过——发布后复确认）；vision 旁路 glm 可用性保持 | 用户 + Coordinator |
| 5 | FIX-010 气泡显示冒烟 | glm-5.3 会话发图 → 气泡图片正常显示（用户已复验过「气泡显示已经正常」——发布后复确认；DEC-027 三不变量保持） | 用户 + Coordinator |
| 6 | EVO-007 新布局冒烟 | 布局核对（API Key → ChatGPT 订阅登录一级 → 子代理 → 高级扩展[账号池]）+ OAuth 官方登录区块不可见 + 池行「删除账号」/孤儿列表删除入口可用（用户 GUI 2/3 已验，点③断言证据在案——发布后复确认） | 用户 + Coordinator |
| 7 | kill-switch 三层 | ① router.enabled / ② 账号 enabled 双侧 / ③ 登出删除——断言复跑（E-2 口径） | Coordinator |
| 8 | 统计落盘回归抽查 | 本版零触碰 stats 域——抽查确认无回归（重启后统计仍在 + 按天视图正常） | Coordinator |
| 9 | 宿主升级观察 | OPS-001 junction 安装面：junction 指向开发树，升级路径 = tag 检出或刷新后重启（重启生效语义不变）；deepseek-official 视觉端点挂起状态观察（宿主域，如实记录不承诺修复） | Coordinator |

> 监控告警项：不适用——本地插件无独立告警体系（v0.2.0/v0.3.0/v0.3.1 先例），以观察期人工核对替代。

## 第五步：数据验证计划（小项目替代标准，沿用先例判定）

- **核心功能冒烟通过**：全量测试网 12 套件全绿（RG-1，E-2 M-3' 口径）+ M-6 安装冒烟。
- **无新 bug 报告 48 小时**：发布后 ≥48h 观察期无 P0/P1 新问题。
- **回滚触发条件**（观察期内任一满足即按 rollback-plan 执行）：① P0/P1 级新 bug；② FIX-009 修复失效（image-solo 纯图 400/1213 复发）；③ FIX-010 修复失效（DEC-027 三不变量断裂——气泡图片再次消失/原始输入呈现被改写）；④ EVO-007 数据主权缺陷（删除路径失效/凭据清理不完整——R8-F1 断言组变红）；⑤ 宿主 dsh-* 漂移适配断裂（RISK-003——parity 复跑变红；本版零依赖变更，概率面与 v0.3.1 相同）；⑥ 用户主动要求回退。
- **成功标准（量化）**：单机自动化面 100%（12 套件 + 冷装断言）；用户面观察期样本采集记基线——**不预支未采集数字**（No-overclaim）。

## 第六步：发布决策（candidate——非最终）

| 决策 | 条件 | 状态 |
|---|---|---|
| 可以发布 | RG-1 PASS（在案基线 PASS + E-2 M-3' 复跑闭环）+ RG-2/RG-3 执行段闭环 + RG-4 披露复核 + Release Reviewer 审查 APPROVED（unresolved_blockers=0）+ M-4 用户 Go/No-Go + tag/push 逐项授权 | ⏳ 待 M-4（候选态——本 checklist 记录现状，**不构成发布决策**） |

**决策理由预留**（M-4 时逐项复核）：① 审查链全通过——FIX-009 R0 / FIX-010 R0 / EVO-007 R0→R1（T1 闭环）/ REL-005 收尾 R0，全部 APPROVED_WITH_NOTES/0（机录在案）；② 门控基线 12 套件全绿（EV-090 Coordinator 实测 + 收尾段 Developer 申报/R0 静态核验断言计数一致）；③ 用户验证——FIX-009 ✓ FIX-010 ✓（复验过）、EVO-007 2/3（点③断言证据闭环）；④ 依赖面零变更——风险面不劣于 v0.3.1 发布时点；⑤ 回滚三阶段就绪、kill-switch 三层断言在案（「验证过可以」）。

---

## RG 门禁总表（本仓四项 + 支撑项：现状 + 判定方式 + 证据路径）

| GATE | 内容 | 判定方式 | 现状（2026-08-30 candidate） | 证据路径 | 执行里程碑 |
|---|---|---|---|---|---|
| **RG-1** | 全量测试网零回退（**12 套件**：smoke 963 ok/1skip + stats 110 + routing 114 + parity 14 + attachments 65 + credentials 98 + loopback 20 + client-render exit0 + promotion 13 + metrics 31 + fix-009 9/9 + fix-010 13/13） | 无沙箱复跑 exit 0 留痕；**断言数以运行时实测为权威** | ✅ **PASS（在案基线）**——EVO-007 后 Coordinator 12 套件实测 + 收尾段 Developer 申报 & R0 静态核验断言计数一致（9/13）；**E-2（M-3'）Coordinator 全量复跑 ⏳ PENDING** | EV-090；EV-091；review-REL-005-R0 §八 | 在案 ✅ / M-5 E-2 ⏳ |
| **RG-2** | tarball 隔离冷装冒烟（npm pack → TEMP 解包 → 环境变量重定向安装；断言清单见 §冷装 runbook——v0.3.2 适配：peerDeps/依赖零变更断言） | 隔离环境安装冒烟记录（**措辞纪律：「隔离环境安装冒烟（环境变量重定向至临时目录）通过」——无限定语「真实安装/真实环境」= 违规措辞**） | ⏳ **PENDING**（发布执行段跑——规划列为门禁项） | EV 行（E-3 执行时） | M-5 E-3 |
| **RG-3** | GATE-8 归档触发检测（发布收尾段）：dry-run → 触发则 migrate + check-archive-integrity（失败阻断发布完成） | 机器输出留痕 | ⏳ **PENDING**（M-7/E-7）；v0.3.0/v0.3.1 先例均跳过（工具计数口径 0<2，EV-084/087）——本次以实跑为准，预判不写死 | 归档命令输出 + `.governance/archive/index.md`（若触发） | M-5 E-7 / M-7 |
| **RG-4** | check-governance 健康检查 | 判定口径 = 无本版引入的未申报阻塞项；**已知 issues 均为插件仓 FIX-281 已申报域 + 非阻塞 WARN——如实披露，不伪装为 0**（v0.3.1 口径延续；先例：GOV-001 28 issues pre-existing 核查口径）；**本版新增披露面 = deepseek-official 视觉端点挂起（宿主域）+ picked 层盲区（宿主固有 P3）——如实入披露** | ✅ PASS（披露口径——已知项在案申报）；收尾段复核 ⏳ | 任务书权威输入 + FIX-281 申报记录（tracker:70）+ EV-088/review-REL-005-R0（新增披露面） | M-7 |
| RG-5 | 发布审查：Release Reviewer 审查规划三产物（发布计划完成后必须进入） | review-record 机器落盘；**仅 APPROVED 或 unresolved_blockers=0 的 APPROVED_WITH_NOTES 为通过终态** | ⏳ PENDING（PM-1——REL-005 R1，本 checklist 产出后的下一环节） | `.governance/review-REL-005-R1-*.md` | PM-1 |
| RG-6 | 版本一致性：package.json 0.3.2 + README 徽章/安装命令同步 + CHANGELOG ↔ git log 实采对照（三分账消歧——点名 13 vs ahead 12）+ 「破坏性变更：无」显式节 + 已知问题四项延续 | 逐项核对记录 | ⏳ PENDING（执行段 E-1；当前 package.json:4 = 0.3.1、README 版本字面量 = v0.3.1——bump 前态如实记录） | E-1 留痕 | M-5 E-1 |

---

## 冷装 runbook（RG-2 / M-5 E-3——Coordinator 执行；Release Agent 无命令权限）

> **真实环境防护（三选一——隔离环境）**：npm cache 与 DSH_HOME 环境变量重定向至临时目录，零触碰真实 `~/.dsh` 与 `$DSH_HOME`。Coordinator 逐条命令上报，结构化结果机写 evidence 行。v0.3.1 先例 runbook：release-checklist-v0.3.1.md §冷装（EV-087）。**v0.3.2 适配：peerDeps/依赖零变更断言（与 v0.3.1 完全一致——package.json 现态实读）。**

| # | 步骤 | 命令要点（pwsh） | 断言 |
|---|---|---|---|
| 1 | 重打包 | 仓库根 `npm pack` → `dsh-agent-router-0.3.2.tgz`——记仓库根绝对路径为 `$tgz`（tgz 位于仓库根而非 $tmp——R1 F-2 路径先例） | tgz 生成；文件名含 0.3.2 |
| 2 | 隔离目录解包 | `$tmp = Join-Path $env:TEMP ("dsh-router-v032-cold-" + [guid]::NewGuid().ToString("N").Substring(0,8))`；`tar -xzf dsh-agent-router-0.3.2.tgz -C $tmp` | 解包 exit 0；`$tmp\package\` 存在 |
| 3 | 清单核验 | 读 `$tmp\package\package.json` | **version = 0.3.2**；dependencies 含 `undici ^7.18.0`（与 v0.3.1 一致——**零依赖变更断言**）；peerDependencies 8 包均 `^0.1.0-rc.8`（**无变更断言**）；files 白名单 11 项与源一致 |
| 4 | 隔离安装 | 环境变量重定向：`$env:npm_config_cache = "$tmp\npm-cache"`、`$env:DSH_HOME = "$tmp\dsh-home"`（先创建）；在 `$tmp\consumer`（新建空 package.json type=module）内 `npm install "$tgz" --omit=dev --legacy-peer-deps`（`$tgz` = 步骤 1 仓库根绝对路径） | **exit 0**；`node_modules\dsh-agent-router` 存在；undici **hoist 感知断言**：consumer 根 `node_modules\undici` **或** 包内嵌套 `node_modules\dsh-agent-router\node_modules\undici` **二者其一**存在且版本 7.x |
| 5 | ProxyAgent 可构造 | createRequire 自包内解析（hoist 布局无关——EV-078 先例做法）：`node -e "const {createRequire}=require('module'); const req=createRequire(require('path').resolve('$tmp','consumer','node_modules','dsh-agent-router','package.json')); const {ProxyAgent}=req('undici'); const a=new ProxyAgent('http://127.0.0.1:9'); console.log(typeof a)"`（路径转义按现场调整） | 输出 `object` |
| 6 | 零触碰校验 | 操作前后核对真实 `~/.dsh` 与 `$DSH_HOME`（原值）目录：无新增/修改（Test-Path + 时间戳抽查） | 真实环境零变更 |
| 7 | 留痕 | 结果机写 `.governance/evidence-log.md` EV 行 | 措辞：「**隔离环境安装冒烟（TEMP 解包 + --omit=dev --legacy-peer-deps，环境变量重定向至临时目录）通过**」 |

**E-3 位置**：E-2（M-3'）门控复跑之后、E-4 tag 之前——**未验证产物不打 tag**（v0.3.0 M-3.5 挂点先例，Design F-1 语义延续；v0.3.1 E-3 同型）。

---

## M-4 用户授权清单（呈报项——Coordinator 转 ask_user_question）

| # | 授权项 | 内容 | 前置 |
|---|---|---|---|
| D-1 | 版本号确认 | PATCH 0.3.2（version-plan §2.2 论证——推荐）/ MINOR 0.3.2（反论） | PM-1 审查通过 |
| D-2 | Go/No-Go | RG-1 在案基线 PASS + E-2（M-3'）复跑 + RG-2/RG-3 执行段闭环承诺 + RG-4 披露口径 | 同上 |
| D-3 | transition 授权 | tag v0.3.2 / push main / push tag / gh Release——逐项授权（EV-087 先例口径） | 同上 |
| D-4 | 发布时点 | 授权即执行（M-5 E-1~E-8 一次走完）或指定窗口 | 同上 |

---

## 版本决策记录（0.3.1 → 0.3.2，semver PATCH bump——candidate）

| 项 | 值 |
|---|---|
| 决策依据 | version-plan-v0.3.2.md §2.2（独立论证）+ DEC-027（FIX-010 三不变量）+ 审查链全通过（FIX-009 R0 / FIX-010 R0 / EVO-007 R1 / REL-005 收尾 R0） |
| 决策 | 0.3.1 → **v0.3.2**（PATCH）——**待 M-4 用户确认** |
| bump 级别 | PATCH（0.3.1 → 0.3.2，主版本 0 不变，次版本 3 不变，修订号 1 → 2） |
| 理由 | ① 零新能力语义——两缺陷修复（FIX-009/FIX-010）+ 一 UX 调整（EVO-007：不可用入口移除 + 布局调整 + 删除路径补全，README 三处披露在案）+ 收口（P1-1/P2-2/README），无 semver MINOR 要求的「新增功能」；② 零 breaking 四证（无 API/协议面变更 / 无配置面变更 / 数据面零变更（oauthAccounts 数据域零触碰）/ 依赖面零变更）；③ 不跳号（相邻 PATCH）；④ v0.2.1 PATCH 先例（缺陷修正 + 有披露的行为调整） |
| 不升 minor 的依据 | 无新增能力语义——MINOR 语义（向后兼容新功能）无承载对象；「用户可见度」≠「版本语义级别」（§2.2 第 3 点） |
| 范围边界 | FIX-009/010 + EVO-007 + 收尾段（REL-005 用户裁决启动）；C-4/C-5 成功率闭环/C-6~C-8/Claude OAuth/FIX-008 候选域/deepseek-official 挂起/CI 面均不承载（version-plan §2.3） |
| 状态 | candidate——正式生效以 M-4 用户确认 + tag 为准 |
