# v0.3.0 发布检查清单（Release Checklist）

| 项 | 值 |
|---|---|
| 发布版本 | v0.3.0（candidate——发布日期以 tag 为准） |
| 上一版本 | v0.2.1（2026-08-22 tag `a1ab717`，REL-001） |
| 任务 | REL-003（M-1 发布资产段；Developer 代码段已完成并通过 R0：dcd44fa / 6dbe57d / fbdfc61 / d78dc00 / 850b30c） |
| 检查日期 | 2026-08-28（candidate 产出；终态以 M-4 发布决策时点复核为准） |
| 依据 | version-plan-v0.3.0.md §3（GATE-1~8）+ DEC-025（M-0 四裁决：D-1a 双主题 / D-2a 设备码 / D-3a 带披露 / D-4b peerDeps rc.8）+ release-checklist SKILL 六步 + REL-002 双审 P2 修正（Release F-1/F-3 + Design F-1/F-2/F-3）+ REL-003 R0（N-1/N-2 处置） |
| 生命周期状态 | `lifecycle_state: candidate`——tag/push/GitHub Release 均待用户 M-4 授权（DEC-143 交互基线；无 release-ledger 工具，文字标注机制沿用 v0.2.0 先例） |
| 关联产出物 | `CHANGELOG.md`（v0.3.0 节）/ `docs/release/rollback-plan-v0.3.0.md` / `docs/release/feature-flags-v0.3.0.md` / `docs/release/version-plan-v0.3.0.md`（双审 P2 修正后） |
| 修订 | R1 返工（2026-08-28）——Design Reviewer R1 NEEDS_CHANGE F-1~F-8 + Release Reviewer R1 重叠项修复；R2 复审待 Coordinator 派发（本表状态刷新不构成通过宣告） |
| 双主题口径 | **C-1 ChatGPT 订阅接入 + C-3 统计持久化**（DEC-025 D-1a 原文——不沿用 850b30c commit message 措辞，REL-003 R0 N-2 处置） |

---

## §0 M-1 MUST 闭合清单对照（tracker:59 六项 → 资产映射）

| # | MUST 项（来源） | 闭合载体 | 状态 |
|---|---|---|---|
| ① | EVO-005 F-1 登出×兑换 TOCTOU + 竞态判别测试（P1） | Developer 代码段 dcd44fa（REL-003 R0 验证闭合：复查位于 fetch+JSON 解析后、persistPresetLogin 前；smoke 5b 块真实构造交错三重判别） | ✅ 已闭合（R0 留痕） |
| ② | EVO-005 F-2 传输错误终态化 + poll_transport_error 区分（P1） | Developer 代码段 6dbe57d（R0 验证：退避累计递增有界 ≤~19 次；expired 终态语义保留） | ✅ 已闭合（R0 留痕） |
| ③ | REL-002 ReleaseF-1 三件套先例归属修正（P2） | 本 checklist 头表 + version-plan §1.1/§4 M-1（流程惯例 = REL-001；**三件套中的 checklist+rollback 两件 = v0.2.0/DEV-003 惯例**；feature-flags 件 = v0.3.0 新增）+ feature-flags-v0.3.0.md §0——句式与 feature-flags §0 统一（R1 F-6） | ✅ 本段闭合 |
| ④ | REL-002 DesignF-1/F-2/F-3（P2） | F-1 → 本 checklist §GATE 表 GATE-5 行「执行里程碑 M-3.5」+ version-plan §3/§4；F-2 → 本 checklist §M-2 失败回路 + version-plan §4 M-2；F-3 → version-plan §5.1 新增行 | ✅ 本段闭合 |
| ⑤ | DEC-025 落实面 | peerDeps rc.8 + version 0.3.0 = Developer 段 d78dc00/850b30c（R0 验证恰 8 包）；stats.persist 落盘显著披露 = CHANGELOG「变更」节显著条目（Release F-3）；RISK-001 用户面披露 = CHANGELOG「已知问题」A-3a | ✅ 本段闭合 |
| ⑥ | 三件套 + CHANGELOG 双主题 + version bump + tarball 隔离冷装 | 三件套 = 本文件 + rollback + feature-flags（本段产出）；CHANGELOG v0.3.0 节（本段产出）；bump = Developer 段已完成；冷装 = §冷装 runbook——**已执行通过（EV-078：undici 7.29.0 hoisted 于 consumer 根 + ProxyAgent=object + 真实 ~/.dsh 393=393 零触碰）** | ✅ 全闭合（EV-078；runbook 断言已按实况同步 hoist 感知——R1 F-2） |

---

## 第一步：发布范围确认

| # | 检查项 | 通过标准 | 状态 | 说明 |
|---|---|---|---|---|
| 1 | 版本号已定义 | 遵循语义化版本 | ✅ PASS | 0.2.1 → **0.3.0**（MINOR；package.json:4 实读 `0.3.0`——Developer 段 850b30c bump）。论证：version-plan §2.3 四证（既有 OAuth 账号行为不变 / C-1 全程 `oauthExperimental` 缺省 false 门控 / undici 为 dependencies 追加非 peer 收窄 / stats 落盘带 `persist=false` 等价回退开关）；0.x MINOR 先例 DEC-015 |
| 2 | 变更范围已列出 | 所有变更项有清单 | ✅ PASS（EV-078 实采） | 双主题 + 修复族已列（CHANGELOG v0.3.0 节）；commit 全量清单已实采：**81 commits**（EV-078 `git log a1ab717..HEAD`；全量归档 `.governance/gate7-commits-v030.txt`）——三分账入 CHANGELOG「版本说明·发布范围」：产品 34 SHA 全量 + 治理 47 按类计数；逐 commit 对照结论 = 用户面语义条目全覆盖（R1 F-1 修复：FIX-003 P0 热修族与 FIX-002 R7 返工条目已补入） |
| 3 | 变更类型已标注 | 新功能/修复/优化/破坏性变更逐项标注 | ✅ PASS | CHANGELOG v0.3.0 节五节齐全：新增 / 变更（含数据行为变化显著披露）/ 修复 / 已知问题（A-3a）/ 版本说明；**破坏性变更 = 无**（§2.3 四证论证，显式声明） |
| 4 | 发布时间窗口已确定 | 有明确发布计划 | ⏳ 待 M-4 | 发布时点 = 用户决策项（tracker:56：真机首联后评估）；流程 = M-2 出口① → M-3/M-3.5 复跑+冷装 → M-4 终审 + Go/No-Go → M-5 执行 |

## 第二步：变更日志检查

| # | 检查项 | 通过标准 | 状态 | 说明 |
|---|---|---|---|---|
| 1 | CHANGELOG 已更新 | 覆盖本次所有变更，与 commit 对照一致 | ✅ PASS（EV-078 实采） | v0.3.0 节已置顶（双主题 DEC-025 原文口径）；81 commits 逐条对照完成（EV-078）：产品 34 语义全覆盖（含 R1 F-1 补入的 FIX-003 P0 热修族与 FIX-002 R7 返工条目）+ 治理 47 不入用户面；三分账结论行见 CHANGELOG「版本说明·发布范围」 |
| 2 | 破坏性变更已高亮 | 不兼容变更有说明与迁移指引 | ✅ PASS | **无破坏性变更**——显式声明 + 四证（见第一步 #1）；最接近行为变化的 stats 缺省落盘以「显著披露」呈现（Release F-3：位置/保留期/关闭开关三要素齐） |
| 3 | 依赖变更已记录 | 版本号 + 变更原因 | ✅ PASS | ①`undici ^7.18.0` 新增（FIX-006——OAuth 代理路径发布环境必失败的 P0 修复）；②peerDependencies 8 包 `^0.1.0-rc.6 → ^0.1.0-rc.8`（DEC-025 D-4b——声明对齐实测宿主；rc.6 宿主环境将被 peer 警告/拒配，已在 CHANGELOG 如实披露）；③dependencies 三包（dsh-llm/dsh-tools/dsh-typert-protocol）维持 rc.6 = D-4b 裁决范围（N-1 披露，见 version-plan §5.1） |
| 4 | 已知问题已列出 | 说明 + workaround | ✅ PASS | A-3a 无 CI（RISK-001 用户面首披露——治理面 G4 pending 为 v0.2.1 先例）；设备码失败客户端可见性弱（EVO-005 F-3 遗留 + workaround）；stats 规模性能观察项；npm children-null 环境正交披露 |

## 第三步：回滚方案验证

| # | 检查项 | 通过标准 | 状态 | 说明 |
|---|---|---|---|---|
| 1 | 回滚方案已编写 | 具体步骤，非泛化描述 | ✅ PASS | `docs/release/rollback-plan-v0.3.0.md`：三层——用户层（`oauthExperimental=false` 秒级）/ 数据层（登出删除 W-5 + `stats.persist=false`）/ 代码层（git revert，含 **FIX-006 undici revert 顺序约束**：不可单独于 OAuth 面执行）+ 安装态（重装 v0.2.1 tarball） |
| 2 | 回滚方案已验证 | 测试环境执行过 | ✅ PASS（门控面） | kill-switch 关闭语义由 smoke oauth 域断言覆盖（「验证过可以」非「应该可以」——M-3 复跑 GATE-3 再确认）；W-5 登出删除 + 登出×兑换竞态 = dcd44fa 竞态判别测试（R0 验证三重判别）；stats 往返 = W-4 单测（开→关先 flush / 关→开全量恢复）；git 层为机械操作，验证程序已定义（回滚后全量测试网复跑 + tarball 重打包冷装） |
| 3 | 数据兼容性 | 回滚后数据兼容 | ✅ PASS | 回滚至 v0.2.1 后：已落盘统计 JSONL 保留（不自动删除——v0.2.1 不读不写该目录，无兼容冲突；用户可手动清理）；ChatGPT 凭据文件残留由「登出并删除凭据」先行清理（回滚 runbook 步骤 0）；agent/账号配置存于 DSH settings 不随插件回滚丢失 |
| 4 | 回滚影响范围 | 影响已评估 | ✅ PASS | 见 rollback-plan「影响评估」：丢 C-1/C-3 全部新能力回 v0.2.1 行为基线（统计回内存态 = 回到 v0.2.1 已知行为）；治理记录随 revert 的保护措施沿用 v0.2.0 先例 |

## 第四步：发布后验证计划（M-6）

| # | 验证项 | 验证方式 | 责任人 |
|---|---|---|---|
| 1 | 安装链路 | 在线/离线安装命令按 v0.3.0 版本号执行成功；DSH 重启后设置页路由配置正常（tarball 面由 M-3.5 冷装前置覆盖——本项验证发布 tag 后真机安装） | Coordinator |
| 2 | tarball 隔离冷装复验 | 发布产物面复跑冷装 runbook（tag 检出后重打包——与 M-3.5 同一断言清单） | Coordinator |
| 3 | 冒烟基线 | 全量测试网五套件 exit 0（GATE-4 口径） | Coordinator |
| 4 | C-1 首联冒烟 | 真机 `oauthExperimental=true` → 一键登录 → 带图对话返回文本（GATE-1 已在 M-2 验证，此处为发布后复确认） | 用户 + Coordinator |
| 5 | kill-switch 三层 | 总开关/账号开关/实验开关关闭态断言复跑（GATE-3 口径） | Coordinator |
| 6 | C-3 落盘确认 | 重启 DSH 后统计仍在（按天视图可见历史）；`persist=false` 往返语义抽查 | Coordinator |
| 7 | 宿主升级观察 | OPS-001 junction 安装面：junction 指向开发树，升级路径 = tag 检出或刷新后重启（重启生效语义不变） | Coordinator |
| 8 | C-9 埋点采集确认 | v0.3.0 起采集事件落盘可观测（报告 v0.3.2 出——启动确认非结论引用，No-overclaim §6.8） | Coordinator |

> 监控告警项：不适用——本地插件无独立告警体系（v0.2.0 先例），以观察期人工核对替代。

## 第五步：数据验证计划（小项目替代标准，沿用 v0.2.0 判定）

- **核心功能冒烟通过**：五套件全绿（M-3 门禁）+ M-6 安装冒烟。
- **无新 bug 报告 48 小时**：发布后 ≥48h 观察期无 P0/P1 新问题。
- **回滚触发条件**（观察期内任一满足即按 rollback-plan 执行）：① P0/P1 级新 bug；② C-1 首联/带图调用在授权成功后失败（GATE-1 复现路径断裂）；③ 宿主 rc 漂移致适配断裂（RISK-003 触发条件——parity 复跑变红）；④ 统计落盘损坏且自愈失效（数据安全四件套兜底失败面）。
- **成功标准（量化）**：单机自动化面 100%（五套件 + 冷装断言）；用户面首轮样本（C-1 首联成功率 / 设备码降级触发率）在观察期采集记基线——**不预支未采集数字**（No-overclaim）。

## 第六步：发布决策（candidate——非最终）

| 决策 | 条件 | 状态 |
|---|---|---|
| 可以发布 | GATE-1~5、7 全 PASS + GATE-6 双审 APPROVED（unresolved_blockers=0）+ 用户 Go/No-Go + tag/push 逐项授权 | ⏳ 待 M-4（候选态——本 checklist 记录现状，**不构成发布决策**） |

**决策理由预留**（M-4 时逐项复核）：① 27 任务全终态、仓内依赖清零（tracker:20）；② EVO-002/003/004/005 + FIX-003C/004/005/006 审查链全 APPROVED_WITH_NOTES/0；③ REL-003 代码段 R0 APPROVED_WITH_NOTES/0（N-1 处置 = 披露路径已落实）；④ 回滚三层就绪且门控面已验证。

---

## GATE 门禁总表（GATE-1~8 逐项：现状 + 判定方式 + 证据路径）

| GATE | 内容 | 判定方式 | 现状（2026-08-28 candidate） | 证据路径 | 执行里程碑 |
|---|---|---|---|---|---|
| **GATE-1（MUST）** | 出口①用户端到端：真机 vision-2 带图调用全链（1455 回调 + 代理 7890 + dispatcher 路径）成功返回文本 | 用户在场实测留痕（EV 入账）；**不可由自动化替代** | **未执行**——唯一机制外缺口；FIX-006 后随时可执行 | `.governance/evidence-log.md` 新 EV 行（M-2 执行时） | M-2（用户在场动作） |
| GATE-2 | 出口③设备码：实现+测试入版 | 裁决记录 + 交付物 | **已闭环**——DEC-025 D-2a 裁决 + EVO-005 终态（3 commits 6355eb7/65e7e34/d49ed4c；R0 APPROVED_WITH_NOTES/0，协议事实 13/13 溯源相符）+ F-1/F-2 P1 经 REL-003 dcd44fa/6dbe57d 闭合 | DEC-025（decision-log:29）；tracker:31/:97；EV-077；`.governance/review-EVO-005-R0.full.md` | ✅ 已达成 |
| GATE-3 | 出口②④复核：token 刷新 / kill-switch 三层 / ToS 确认 / 登出删除断言全绿 | M-3 全量测试网含 oauth 域断言复跑 + 源码目击 | 机制闭环（EVO-002 R1-R8 + EVO-005 R0 门控一致性：`oauthExperimental→ToS→starter→loopback` 严格前置；REL-003 R0 复核 F-1 闭合）；待 M-3 复跑确认 | smoke.mjs oauth 域断言（M-3 exit 0 留痕）；lib/schemas.js:223/228（实读） | M-3 |
| GATE-4 | 全量测试网零回退：smoke / oauth-credentials / stats / routing-paths / client-render / adapter-parity 六面 | 复跑 exit 0 留痕；**断言数以运行时实测为权威（R1 F-3——静态预估仅供交叉参考）** | **已复跑全绿（EV-078 + Coordinator 三次运行时实测）**：smoke **918 ok + 1 skip / 0 FAIL** / oauth-credentials 98 / stats 110 / routing-paths 114 / client-render exit 0 / parity 14（rc.8 对齐）——账目链 873→908→918（EVO-005 +35；REL-003 **+10**——R0 静态预估 +8 漏 2，运行时权威 = 918） | EV-078（六套件复跑全绿留痕）；`.governance/review-REL-003-R0.full.md`；EV-072/077（两时点） | M-3 ✅ 已执行 |
| GATE-5 | tarball 隔离冷装：TEMP 解包 + `--omit=dev --legacy-peer-deps`；断言清单见 §冷装 runbook（**hoist 感知断言——R1 F-2 修正**） | 隔离环境安装冒烟记录（措辞纪律：**「隔离环境安装冒烟（环境变量重定向至临时目录）通过」——无限定语「真实安装/真实环境」= 违规措辞**） | **已执行通过（EV-078，M-3.5）**：tgz 1,505,642B → manifest 三断言（version 0.3.0 / undici ^7.18.0 / peerDeps 8×rc.8）→ 隔离安装 exit 0 → **undici 7.29.0（hoisted 于 consumer 根）** → ProxyAgent=object（createRequire 自包内解析）→ 真实 ~/.dsh **393=393 零触碰** → TEMP+tgz 清理 | EV-078（runbook 断言文本已按实况同步 hoist 感知）；EV-072（FIX-006 时点先例） | M-3.5 ✅ 已执行（M-4 终审消费 EV-078 复核） |
| GATE-6 | 发布审查：Release Reviewer 终审 M-1 资产 + Design Reviewer 独立复审 | review-record CLI 机器落盘；**仅 APPROVED 或 unresolved_blockers=0 的 APPROVED_WITH_NOTES 为通过终态** | 双审 R1 已回：**Release R1 = APPROVED_WITH_NOTES/0；Design R1 = NEEDS_CHANGE（F-1~F-8）→ 本轮返工完成，待 R2 复审**（R2 验证清单见 review-REL-003-DESIGN-R1.full.md §七） | `.governance/review-REL-003-DESIGN-R1.full.md`；R2 机器行（待 Coordinator 落盘） | M-4（R2 通过为前置） |
| GATE-7 | 版本一致性：package.json 0.3.0 ✅ + README 徽章/安装命令同步 ✅ + CHANGELOG ↔ git log 对照 | 逐项核对记录 | package.json:4 实读 0.3.0 ✅；README 版本字面量已同步 ✅（+ R1 F-4 FAQ 增补 ChatGPT 订阅一键登录指引）；**git log 对照已实采（EV-078：81 commits——三分账入 CHANGELOG 版本说明；对照结论 = 产品 34 语义全覆盖）** | EV-078；`.governance/gate7-commits-v030.txt`（81 行全量归档）；本 checklist 第二步 #1 | M-3 ✅ 已执行 / M-4（终核） |
| GATE-8 | 归档触发检测（发布后）：`archive.py migrate --auto --dry-run` → 预计触发发布强制迁移 → migrate + `check-archive-integrity` | 机器输出留痕；失败阻断发布完成 | 未执行（发布后动作；**预判，非事实断言**——27 终态任务均在热文件） | 归档命令输出 + `.governance/archive/index.md` | M-7 |

---

## 冷装 runbook（GATE-5 / M-3.5——Coordinator 执行；Release Agent 无命令权限）

> **真实环境防护（AUDIT-146 / FIX-271 R3）**：本 runbook 采用三选一中的「隔离环境」——npm cache 与 DSH_HOME 环境变量重定向至临时目录，零触碰真实 `~/.dsh` 与 `$DSH_HOME`。Coordinator 逐条命令上报，结构化结果机写 evidence 行。

| # | 步骤 | 命令要点（pwsh） | 断言 |
|---|---|---|---|
| 1 | 重打包 | 仓库根 `npm pack` → `dsh-agent-router-0.3.0.tgz`——**记仓库根绝对路径为 `$tgz`（步骤 4 引用；tgz 位于仓库根而非 $tmp——R1 F-2 路径修正）** | tgz 生成；文件名含 0.3.0 |
| 2 | 隔离目录解包 | `$tmp = Join-Path $env:TEMP ("dsh-router-v030-cold-" + [guid]::NewGuid().ToString("N").Substring(0,8))`；`tar -xzf dsh-agent-router-0.3.0.tgz -C $tmp`（tarball 解包为 `package/` 目录） | 解包 exit 0；`$tmp\package\` 存在 |
| 3 | 清单核验 | 读 `$tmp\package\package.json` | **version = 0.3.0**；dependencies 含 `undici ^7.18.0`；peerDependencies 8 包均 `^0.1.0-rc.8`；files 白名单与源一致（lib×7 + install 脚本 + docs/images + README） |
| 4 | 隔离安装 | 环境变量重定向：`$env:npm_config_cache = "$tmp\npm-cache"`、`$env:DSH_HOME = "$tmp\dsh-home"`（先创建）；在 `$tmp\consumer`（新建空 package.json type=module）内 `npm install "$tgz" --omit=dev --legacy-peer-deps`（**`$tgz` = 步骤 1 仓库根绝对路径——R1 F-2 路径修正**） | **exit 0**；`node_modules\dsh-agent-router` 存在；undici **hoist 感知断言（R1 F-2）**：consumer 根 `node_modules\undici` **或** 包内嵌套 `node_modules\dsh-agent-router\node_modules\undici` **二者其一**存在且版本 7.x（EV-078 实况 = hoisted 于 consumer 根 7.29.0） |
| 5 | ProxyAgent 可构造 | **createRequire 自包内解析（R1 F-2——与 hoist 布局无关）**：`node -e "const {createRequire}=require('module'); const req=createRequire(require('path').resolve('$tmp','consumer','node_modules','dsh-agent-router','package.json')); const {ProxyAgent}=req('undici'); const a=new ProxyAgent('http://127.0.0.1:9'); console.log(typeof a)"`（路径转义按现场调整） | 输出 `object`（undici 7.x 与 Node 24 内置同 major——dispatcher major 判别 fail-loud 语义面通过；EV-078 实测即此做法） |
| 6 | 零触碰校验 | 操作前后核对真实 `~/.dsh` 与 `$DSH_HOME`（原值）目录：无新增/修改（Test-Path + 时间戳抽查） | 真实环境零变更 |
| 7 | 留痕 | 结果机写 `.governance/evidence-log.md` EV 行 | 措辞：「**隔离环境安装冒烟（TEMP 解包 + --omit=dev --legacy-peer-deps，环境变量重定向至临时目录）通过**」 |

**M-3.5 位置**：M-3 门禁复跑之后、M-4 终审之前（M-4 checklist candidate 全 PASS 以 GATE-5 PASS 为必要项——Design F-1：v0.2.1 先例为 tag 前完成，本次显式挂点消除断链）。

---

## M-2 失败回路（Design F-2 / BC-R1——出口①真机验证失败时）

**一句话回路**：M-2 真机验证失败 → 缺陷按 change-triage 四步入账（triage 机器记录）→ Developer 修复（含独立审查）→ **重回 M-2 复验**——不跳过、不降级为「机制面闭环」表述、不绕过 GATE-1。

| 环节 | 动作 | 留痕 |
|---|---|---|
| 失败受理 | 现象/环境/代理链路快照（1455 / 代理 7890 / dispatcher 日志）记录 | EV 行（失败样本——EVO-001 P5 失败样本×4 先例） |
| 入账 | change-triage 入账（P0/P1 定级——出口①为发布 MUST 门禁，失败即发布阻断） | `.governance/` triage 机器记录 |
| 修复 | Developer 定位修复 + 判别测试 + 独立审查（FIX-006 先例：真机实证 → 修复 → 门控全绿 → 冷装） | review-record 机器行 |
| 复验 | 重回 M-2 用户在场复验（GATE-1 语义不变） | 新 EV 行 |

---

## 版本决策记录（0.2.1 → 0.3.0，semver MINOR bump）

| 项 | 值 |
|---|---|
| 决策编号 | DEC-025（M-0 四项裁决，2026-08-27 用户面板确认）+ version-plan §2.3 |
| 决策 | 0.2.1 → **v0.3.0**（MINOR） |
| bump 级别 | MINOR（0.2.1 → 0.3.0，主版本 0 不变，次版本 2 → 3） |
| 理由 | ① 双主题均为向后兼容新能力面（C-1 订阅接入全量解锁 + C-3 统计持久化）；② 无 breaking 四证（version-plan §2.3：既有 OAuth 账号行为不变 / oauthExperimental 缺省 false 门控 / undici 为 dependencies 追加 / stats.persist 等价回退开关）；③ 大量新功能远超 patch 语义 |
| 不升 major 的依据 | 无公共 API 移除、无行为破坏（四证）；semver 0.x 阶段 MINOR 承载新功能（先例：v0.1.7→v0.2.0 MINOR，DEC-015） |
| 范围变更留痕 | C-3 由 v0.3.1 并入（DEC-025 D-1a——范围倒挂变更控制）；设备码由出槽裁为补实现（D-2a，EVO-005 承载）；v0.3.1 范围清空待重规划（tracker:120） |
| 状态 | candidate——正式生效以 M-4 用户 Go/No-Go + tag 为准 |
