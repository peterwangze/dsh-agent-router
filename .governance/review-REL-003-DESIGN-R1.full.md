# REL-003 资产段设计审查报告（Design Reviewer，Round R1）

- **Round**: R1（前轮引用：`.governance/review-REL-002-DESIGN-R0.md` F-1/F-2/F-3 + `.governance/review-REL-002-RELEASE-R0.md` F-1/F-3 + `.governance/review-REL-003-R0.full.md` N-1/N-2——本审查为资产段首轮设计复审，核心任务 = 验证前轮 findings 修正忠实度）
- **审查对象**: 工作树未 commit 6 文件——`docs/release/release-checklist-v0.3.0.md`（144 行）/ `rollback-plan-v0.3.0.md`（128 行）/ `feature-flags-v0.3.0.md`（73 行）三新件 + `version-plan-v0.3.0.md`（291 行，四处 P2 修正）+ `CHANGELOG.md` v0.3.0 节（:6-56）+ `README.md`（版本字面量 ×7 + 统计口径 ×2）
- **审查结论**: **NEEDS_CHANGE**（P1×1——MUST 资产完整性缺陷；非终态，按 M7.4 step 4.6 返工后重 spawn 同一 Reviewer 复审 R2）
- **发现总表**: **P0=0 / P1=1 / P2=3 / P3=4**；四处 P2 修正 + N-1/N-2 处置全部验证落地（见修正忠实度表）；里程碑 DAG 经 F-1 修正后全闭合
- **工具纪律**: 全程只读（Read/Grep/skill 加载）；零 Write/Edit/pwsh；未写 .governance/。**权限声明**：无 Bash——81 commits 逐条 git 枚举不可达，以 EV-078 实采 + tracker 留痕交叉验证（GATE-7 权威对账归 Coordinator M-4 实采）

---

## 一、修正忠实度裁决（逐条对照前轮 findings 原文）

| 前轮 finding | 修正载体 | 实读验证 | 裁决 |
|---|---|---|---|
| Release F-1（P2 三件套先例归属） | version-plan §1.1 基线表 + §4 M-1 边界 + feature-flags §0 + checklist §0③ | 拆分为「流程惯例=REL-001 / checklist+rollback=v0.2.0·DEV-003（EV-024）/ feature-flags=v0.3.0 新增」三段，与 EV-037/EV-024 事实一致 | ✅ 已修复（残留措辞不自洽见 P3-2/F-6） |
| Release F-3（stats 落盘显著披露） | CHANGELOG「变更」节首条（:29） | 三要素齐 + 按天 JSONL 加成 + 显著标记【数据行为变化——请留意】 | ✅ 已修复 |
| Release F-2（披露层级区分，P3 顺带） | checklist 第二步 #4 | 「用户面首披露——治理面 G4 pending 为 v0.2.1 先例」正是处方口径 | ✅ 已修复 |
| Design F-1（GATE-5 挂点断链） | version-plan §3 GATE-5 行 + §4 M-3.5 新行 + checklist GATE 表 + §冷装「M-3.5 位置」 | M-3→M-3.5→M-4 链闭合；M-4 candidate 全 PASS 以 GATE-5 为必要项——前轮断链主张消解 | ✅ 已修复 |
| Design F-2（M-2 失败回路） | version-plan §4 M-2 行 + checklist §M-2 失败回路四环节表 | 受理快照→change-triage 入账→修复含独立审查→重回 M-2 复验；「不跳过、不降级表述、不绕过 GATE-1」三禁止语义完整 | ✅ 已修复 |
| Design F-3（pnpm-lock 安装面时变） | version-plan §5.1 新行 + CHANGELOG 已知问题（:49） | 「npm tarball 不含 pnpm-lock→解析时变→major 判别 fail-loud 防线→残余如实披露」全链落地；EV-078 实采 undici 解析 7.29.0 = 该披露的活体印证 | ✅ 已修复 |
| REL-003 R0 N-1（dev 图 unmet-peer） | version-plan §5.1 新行 + checklist 第二步 #3③ | dependencies 三包维持 rc.6 = D-4b 裁决范围 + dev/生产图漂移如实记录 + Release 段裁量遗留候选 | ✅ 已按披露路径处置 |
| REL-003 R0 N-2（双主题口径） | CHANGELOG:10 摘要 + checklist 头表 | 两处均为「C-1 ChatGPT 订阅接入 + C-3 统计持久化（DEC-025 D-1a）」；与 decision-log:29 DEC-025 原文相符；未沿用 850b30c commit message 措辞 | ✅ 已修复 |

**结论：8 项修正/处置全部落地，无偏离、无缩小。**

## 二、发现明细

| # | 级别 | 位置 | 事实 | 建议 |
|---|------|------|------|------|
| F-1 | **P1** | CHANGELOG.md:33-38（修复节）+ :55（版本说明底账）；release-checklist 第一步 #2/第二步 #1 | **修复节遗漏 FIX-003 P0 热修族**。tracker:84：FIX-003（多模态路由失效+附件链+气泡图片消失，用户 2026-08-22 21:35 报障）终态 = b6581c5 + settings 声明修复（EV-053~063，含 EV-062 GUI 模型配置陷阱修复）——该 commit 族不在 v0.2.1 发布范围清单（CHANGELOG:91 仅列 11 SHA），属 v0.3.0「v0.2.1 以来 main 全部提交」范围；EV-078 GATE-7 实采 81 commits，CHANGELOG 24 SHA 底账的「待补全」枚举仅含「EVO-002 Step 5-7 及治理记录提交」——**FIX-003 既无语义条目也无 SHA 预留**（旁证：OPS-001 行载 2026-08-23 时点即 v0.2.1+62 commits）。受该 P0 影响的用户无法从 CHANGELOG 得知修复版本；GATE-7「所有变更项有清单」/ checklist 第二步 #1 通过标准不成立。EV-078 明载「81 commits 底账对照归双审裁量」——本条即对账结果 | 修复节补 FIX-003 条目（多模态路由失效/附件链断裂/气泡图片消失/GUI 能力声明陷阱，workaround 无需）；版本说明底账补 b6581c5 系列 SHA；M-4 前完成 81 行逐条分类归档（产品/EVO-002 Step5-7/治理三分账，落 EV 行） |
| F-2 | P2 | release-checklist-v0.3.0.md:112-113（§冷装 runbook 步骤 4/5） | runbook 断言写死嵌套路径 `node_modules\dsh-agent-router\node_modules\undici`；EV-078 实况 = **undici 7.29.0 hoisted 于 consumer 根**，且 EV-078 自认「runbook 原嵌套路径断言经现场修正为 hoist 感知」——执行与文档背离，**文本未同步**。按文档重跑者对正确安装得到断言失败（假阴性）；M-6 发布后复验（checklist 第四步 #2「与 M-3.5 同一断言清单」）将继承缺陷 | 步骤 4/5 断言改为 hoist 感知：「consumer 根 `node_modules\undici` 或包内嵌套二者其一存在且 7.x」；ProxyAgent 构造改用 createRequire 自包内解析断言（EV-078 实际做法） |
| F-3 | P2 | CHANGELOG.md:56 + release-checklist GATE-4 行 | 账目链自洽性断裂：`873→908→918（EVO-005 +35、REL-003 +8）`——**908+8=916≠918，+2 差额未解释**。EV-077 机器输出 908（=873+19+16 精确吻合）；REL-003 R0 静态计数 smoke +8（F-6×1+F-7×1+F-2×3+F-1×3）；EV-078 GATE-4 复跑仅留痕「smoke ALL PASSED」**未记录断言数**——918 无机器留痕支撑，两处资产均标注「R0 静态核验吻合」与算术矛盾（No-overclaim §5「验证表述限于实测数字」） | 从 EV-078 本会话 pwsh 输出提取复跑实际断言数，统一 CHANGELOG/checklist/R0 三处（916 或 918 二选一，更正 +N 标注）；GATE-4 复跑留痕模板补「断言数必填」 |
| F-4 | P2 | README.md:128（FAQ「ChatGPT / Claude 能 OAuth 登录吗？」） | FAQ 答复「官方 API 不提供 OAuth：请用官方 API Key；消费级 Web token……可用粘贴 token」——**未提 v0.3.0 已上线的「ChatGPT（实验）」订阅一键登录**，与本版双主题之一（CHANGELOG 新增节权威口径）矛盾：README 门面对主特性给出过时否定性指引。EV-078 实采④「陈旧表述 grep 零残留」仅覆盖版本字面量/统计口径面，未覆盖此语义级陈旧（Claude 半句仍准确） | FAQ 该条增补一句：「ChatGPT **订阅**账号：v0.3.0 起可在设置开启 `oauthExperimental`（实验）后一键登录」（保留实验限定语纪律） |
| F-5 | P3 | version-plan :74/:76/:80/:99/:134/:260 + feature-flags :23 | `CHANGELOG:29` 引用行号漂移：v0.3.0 节前置（29 行）后，v0.2.1 设备码预告实际位于 **:81**；:29 现指向 v0.3.0 统计落盘条目——误导性指针（引文内容本身可检索，CHANGELOG:15 引文与 :81 原文逐字相符） | M-4 刷新时统一改 :81（或去行号改节锚「v0.2.1 节·变更」） |
| F-6 | P3 | version-plan §1.1/§4 M-1 + checklist §0③ | 「**三件套（checklist+rollback）** = v0.2.0/DEV-003 惯例」——两件被冠「三件套」名，名称与列举不自洽（feature-flags §0 句式精确：「三件套中的 checklist+rollback **两件**系 v0.2.0 惯例」） | 统一为 feature-flags §0 句式 |
| F-7 | P3 | README:21（特性清单）+ rollback-plan（影响评估） | stats 四要素逐要素矩阵：CHANGELOG:29 与 README:131 均 4/4 ✅、feature-flags §1 4/4 ✅；**README:21 缺「JSONL」字样**；**rollback-plan 缺「90 天」**（三要素在 :52/:105/:113 齐）——后者语义上反而正确（回滚后 90 天清理机制随 v0.3.0 代码退场不再生效），但该差异宜显式化 | README:21 可不改（:131 已全）；rollback 影响评估补一句「90 天清理随回滚停止生效——文件保留直至手动删除」 |
| F-8 | P3 | release-checklist GATE-4/5/7 现状列 + §0⑥ + CHANGELOG:55「待实采」 | 资产快照（2026-08-28 candidate）滞后于 EV-078 四项实采——**结构上无缺陷**（全部「待」标注诚实、无 overclaim，candidate + M-4 复核模式成立），但 M-4「checklist candidate 全 PASS」判定 MUST 消费 EV-078 后刷新快照（GATE-5 行仍写「必须重打包复跑」、GATE-7 仍「待实采」、§0⑥ 仍「⏳ 冷装待执行」） | M-4 前统一转「已」并引 EV-078；与 F-1 的 81 行对账同一 pass 完成 |

## 三、六维度逐项结论

1. **方案完整性（修正忠实度）✅**：8 项修正/处置逐条对照前轮原文全部落地；候选/裁决结构（DEC-025 四裁决 vs 资产落实面）经 checklist §0⑤ 逐项映射验证。
2. **蓝军挑战 ✅（4 条独立 ID）**：含派发 prompt 点名三条，其中 2 条 materialize 为 P1/P2 发现（BC-A2→F-1、BC-A3→F-2）。
3. **里程碑/门禁 DAG 闭合 ✅（无环）**：M-0→M-1→M-2（含失败回路 back-edge）→M-3→M-3.5→M-4→M-5→M-6→M-7→M-8；GATE↔里程碑映射八项全挂点。
4. **接口/契约面（跨文档一致性）⚠️ PASS with findings**：双主题口径三处一致；设备码兑现引文逐字相符；stats 四要素矩阵 4/5 文档齐平（F-7）；README FAQ 与 C-1 冲突（F-4）；引用指针漂移（F-5）。
5. **非功能面（No-overclaim/措辞纪律）⚠️ PASS with findings**：冷装措辞纪律三处内建；EV-078 实采措辞合规；「待实采」占位诚实（F-8 时序滞后非 overclaim）；**例外**：GATE-4 验证基线数字与自身账目链不可对账（F-3）。
6. **Bar Raiser 独立复审 ✅**：本审查即独立设计复审；GATE-6 双审挂点正确。

## 四、蓝军挑战记录（资产面）

| ID | 攻击向量 | 影响评估 | 当前缓解 | 残余风险 | 建议增强 |
|---|---|---|---|---|---|
| BC-A1 | 出口①/C-1 发布后失败，CHANGELOG 已发如何改口 | 高 | 部分：触发条件六项 + rollback 三层 + kill-switch；**CHANGELOG 勘误/已知问题追补路径未定义** | 中 | M-6/rollback 补「发布后 CHANGELOG 勘误惯例」一句（Keep a Changelog 允许 post-release 修正） |
| BC-A2 | 81 commits 分类底账 24 SHA 漏产品 commit | 高——已成立：FIX-003 P0 热修族遗漏（F-1） | 部分：「待实采」占位诚实 + EV-078 实采完成 | 高（未对账前） | F-1 修复 + 81 行三分账归档 |
| BC-A3 | 冷装 runbook 断言在 hoisted 环境不可复现 | 中 | 部分：EV-078 现场已修正并留痕；**runbook 文本未同步** | 中 | F-2 修复 |
| BC-A4 | GATE-4 账目链不可对账（918 vs 916） | 中 | 部分：EV-072/077 两时点机器留痕在案 + EV-078 复跑全绿（但未记数） | 中 | F-3 修复 |

## 五、零编造抽查（7 组，门槛 ≥5）

1. **24 SHA 底账逐组对照 tracker**：EVO-003×2/EVO-004×7/FIX-004·005·003C×3/FIX-006×4/EVO-005×3/REL-003×5——**24/24 相符**（git 逐 commit 验证超出本 Reviewer 只读权限，GATE-7 M-4 实采为权威）
2. **package.json 实读**：version 0.3.0 ✅；peerDeps 恰 8 包 `^0.1.0-rc.8` ✅；dependencies 三包 rc.6 维持 + undici ^7.18.0 ✅——与 N-1/D-4b 口径逐字一致
3. **schemas.js 锚点实读**：:220/:223/:228/:238——feature-flags §1 四锚点全命中
4. **DEC-025 原文**（decision-log:29）与 CHANGELOG/checklist 头表相符
5. **设备码预告**：v0.2.1 节 :81 原文与 v0.3.0:15 引文逐字相符（引用行号 :29 已漂移 = F-5）
6. **tracker:59 M-1 MUST 六项 ↔ checklist §0①-⑥**：逐项对应 ✅
7. **README 版本字面量 ×7 实证**：7 位置命中；`0.2.1` 残留 grep = 0 ✅

## 六、硬门槛自检

6 维度 100% 覆盖 ✅ / 蓝军 ≥3 独立 ID（4 条）✅ / 每条发现 P0-P3+位置+事实+建议 ✅ / 修正忠实度逐条对照 ✅ / DAG 无环 ✅ / Bar Raiser = 本报告 ✅ / 只读约束遵守 ✅

## 七、结论与复审预留

**NEEDS_CHANGE**——P1×1（F-1）+ P2×3（F-2/F-3/F-4）。修复均为小粒度文档编辑（同段可完成），无需架构返工；四处 P2 修正与 N-1/N-2 处置本身全部验证合格，前轮复审链无回退。

**R2 复审验证清单**：F-1 修复节 FIX-003 条目 + 底账补全 + 81 行三分账归档；F-2 runbook 步骤 4/5 hoist 感知断言；F-3 三处账目统一（916/918 择一 + 更正标注 + EV 断言数留痕）；F-4 README FAQ 增补；F-5~F-8 裁量处理说明。R2 时前轮引用 = 本报告。

**呈 Coordinator 事项**：① NEEDS_CHANGE（round 1）→ T1 复审义务；② F-1 的 81 行逐条 git 对账超出本 Reviewer 权限，建议返工派发时将 EV-078 的 81 行 git log 输出随任务下发；③ F-3 需调取 EV-078 本会话 pwsh 输出中 smoke 实际断言数。
