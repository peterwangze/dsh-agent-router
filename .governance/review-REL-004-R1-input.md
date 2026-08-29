# REL-004 R1 发布审查报告 — v0.3.1 版本规划三产物（Release Reviewer）

- **Round**: R1（发布段规划产物独立审查；审查对象 = 三产物文档，非代码 diff）
- **前序轮次引用**: R0 = Code Reviewer 收尾段代码审查（`.governance/review-REL-004-R0-input.md` + 机录 `.governance/review-REL-004-R0.md`，APPROVED_WITH_NOTES / unresolved_blockers=0）——**非本审查对象**；本 R1 为发布段独立审查首轮
- **审查对象（三产物逐项通读）**:
  1. `docs/release/version-plan-v0.3.1.md`（237 行）
  2. `docs/release/release-checklist-v0.3.1.md`（126 行）
  3. `docs/release/rollback-plan-v0.3.1.md`（141 行）
- **对照事实源（只读实读）**: `.governance/plan-tracker.md`（:20/:34/:35/:61/:64/:125）、`.governance/evidence-log.md`（EV-084:178 / EV-085:186 / EV-086:194）、`CHANGELOG.md`（未发布段 :6-15 + v0.3.0 节 :47/:62）、`README.md`（:128 FAQ）、`docs/release/feature-flags-v0.3.0.md`（§0~§5 全文）、`docs/release/version-plan-v0.3.0.md`（先例结构抽查）、`.governance/review-EVO-006-R0.md` / `-input.md`、`.governance/review-REL-004-R0.md` / `-input.md`、`.governance/risk-log.md`（:5/:7）、`package.json`（:4 实读）
- **审查方式**: 纯静态（读文件 + grep 交叉核验）；git 只读查询（status/log/rev-list/diff）仅用于获取审查对象事实：`git status --short`、`git log --oneline -12`、`git rev-list --count bb81abf..HEAD` = **11**、`git diff bb81abf..HEAD -- package.json` = **空**。未运行任何测试/构建/安装（协议红线）。
- **工作区实态（审查时点）**: 三产物均为 **untracked**（`??` ×3）；main ahead **11**（R0 时点实采为 10——差量见 W-1）

---

## 一、5 维度逐项结论

### 1. 发布就绪 — PASS
- **门禁现状如实**：RG-1 ✅ PASS（EV-086 权威）；RG-2/RG-3/RG-6 ⏳ PENDING 且逐一绑定执行段位（E-3 / E-7+M-7 / E-1）；RG-4 ✅ PASS（披露口径，M-7 复核 ⏳）；RG-5 = 本审查环节。**无任何 PENDING 被写成通过**。
- **P0 任务全部完成**：EVO-006（3 commits + R0 APPROVED_WITH_NOTES/0，机录在案）+ REL-004 收尾段（4 commits + R0 APPROVED_WITH_NOTES/0，机录在案）均终态；tracker:34/:35 与三产物引用一致。
- **无未解决 BLOCKING**：G4/G5 pending、RISK-001 活跃均持续披露（risk-log:5 实读「活跃」✓）；checklist 第六步决策状态 =「candidate——不构成发布决策」✓。
- **M-4 授权点完整**（详见 §四）：D-1 版本号 / D-2 Go-No-Go / D-3 tag+push+Release **逐项** / D-4 时点四项全覆盖，前置 = PM-1 审查通过，符合 DEC-143 交互基线。

### 2. 质量门禁 — PASS（本仓口径）
- **门禁证据在案**：version-plan §1.3 + RG-1 引用的十面值与 EV-086「门控面（收尾段+M-3 合并终态）」**逐项精确吻合**（smoke 948/0/exit0/13s · stats 110 · routing 114 · parity 14 · attachments 65 · oauth-credentials 98 · oauth-loopback 20 · client-render exit0 · promotion 13 · metrics exit0）。
- **CI 面如实**：三产物均无「CI 全绿」类措辞；RISK-001 披露口径一致（本地全量测试网 = 现行保护，CI 另行排期）。
- **RG-2 冷装 runbook 可执行**：七步完整（pack → TEMP 解包 → 清单核验含 version=0.3.1 + undici ^7.18.0 + peerDeps 8×rc.8 无变更断言 → 隔离安装 `--omit=dev --legacy-peer-deps` + npm_config_cache/DSH_HOME 双重定向 → ProxyAgent createRequire 自包内解析（EV-078 先例）→ 真实环境零触碰前后校验 → EV 留痕）；hoist 感知断言（root 或 nested 二者其一 + 7.x）较 v0.3.0 先例更精细；**真实环境防护三选一之「隔离环境」在案**；E-3 挂点 = E-2 后 E-4 前（未验证产物不打 tag）✓。
- **RG-4 披露口径如实**：16 issues「均为插件仓 FIX-281 已申报域 + 非阻塞 WARN——不伪装为 0」，先例引用（GOV-001 28 issues pre-existing，EV-025）准确；「以任务书申报为源，M-7 收尾段复核 ⚠️」未虚称自跑 ✓。

### 3. 回滚能力 — PASS
- **三阶段步骤具体**：阶段一 push 前 abort（逐已完成步骤逆向清理表：revert bump 不用 reset / tgz 清理 / `tag -d`，abort 窗口关闭点 = E-5 push）——可执行；阶段二 revert 范围 = 7 产品 commits 清单 + bump commit + 治理段保护（v0.3.0 C-3 先例），**7 commits hash 与 git log 实采逐一吻合**；阶段三用户侧 junction checkout（OPS-001 形态）+ tarball 重装双路径。
- **「已验证」仅限断言在案项**：场景 A 三层「✅ 已验证」分别绑定 ① smoke/routing-paths 既有断言（C13/D8b——REL-004 R0 实存 :475/:511 复核成立）② promotion B1/B2（EV-086:13/13）③ 文件不存在断言 + 竞态判别 + B4（EV-086）；git 层/用户侧回退 = 「验证程序已定义；机械操作，触发时执行并记录」——**未把程序定义冒称已验证** ✓。
- **本版特定约束如实标注推演级**：undici 顺序约束不适用——依据 = 零依赖面变更（EVO-006 R0 + REL-004 R0 两轮实采 + 本轮实采 `git diff bb81abf..HEAD -- package.json` = 空 ✓）；回滚后遗留键复活语义（C-3）同样显式标注「推演级」，与 schemastery 透传源码实证（REL-004 R0 §四）分层呈现 ✓。
- **数据兼容性成立**：零 Schema/数据格式变更——收尾段 diff 5 文件（service.js/CHANGELOG/README/feature-flags/oauth-promotion.mjs）+ 注释修正 2 文件，无 stats/oauth-credentials 结构触碰；telemetry 新 reason 回滚后自然消失（环形缓冲无格式冲突——R0 :17 recordOauthEvent 无 reason 白名单实读吻合）。
- **时间可接受**：15–30min（含全量复跑）对单机本地插件合理；触发条件六条含「用户主动要求回退」兜底。

### 4. 用户影响 — PASS
- **breaking 标注形态如实**：「配置键废弃（容忍迁移）」口径在位（CHANGELOG:11「升级零操作（旧配置中的遗留键自动忽略）」）；「破坏性变更：无」显式节 = PENDING（收口补，v0.3.0 句式先例）——**PENDING 如实标注，未预支**。
- **升级披露在案**：「开过又关」披露 CHANGELOG:12 + README:128 双点实读吻合（措辞含两条官方替代路径：账号卡停用 / 登出删除）；风险提示保留非阻断（:13）；关闭能力不变（:14）；v0.3.0 已登录账号升级后「凭据保留、继续可用」承诺（:10）。
- **已知问题延续**：三项核对（无 CI / 图片附件显示层残留 FIX-008 候选 / 披露引用一致性）绑定 E-1 收口；CHANGELOG:62 已知问题原文在案 ✓。
- **监控告警不适用声明如实**：本地插件无告警体系，观察期人工核对替代（先例口径）。

### 5. No-overclaim — PASS
- §6 十条边界完整且在三产物中贯彻：实测数字一律引 EV-086 并注明「M-5 复跑后以复跑值为准」；隔离验证措辞纪律两处显式（RG-2 判定方式 + 冷装 runbook 留痕行）；Big-Bang + 无灰度如实（「不虚构渐进放量」）；kill-switch「已验证」仅限断言在案项（B1/B2），未跑项一律 PENDING；推演级与实证分层（undici 约束、C-3 复活语义、任务终态快照）标注清晰。
- §7 十八项核对表：16 项 ✅ + **2 项 ⚠️ 如实标注**（#3 ahead 账目待实采 / #13 16 issues 以任务书申报为源）——无 ⚠️ 项被写成 ✅。

---

## 二、6 项裁量复核表（任务书 MUST 复核项）

| # | 裁量/遗留 | 复核结论 | 依据 |
|---|---|---|---|
| 1 | **semver MINOR 论证（0.3.0→0.3.1）** | **成立** | 变更性质 = 通道缺省语义翻转（opt-in 实验→缺省正式）+ 配置面废弃，超出 PATCH「缺陷修正」语义；v0.2.1 patch 先例（缺陷修复+默认关闭新开关）与本版「缺省即正式」强度不同——反论否弃合理。零 breaking 四证：①API/协议/依赖面未动（两轮审查实采 + 本轮实采 `git diff bb81abf..HEAD -- package.json` = 空）②schemastery 透传容忍（库源码级实证 R0 §四 + smoke:95/promotion:44-45 双断言——遗留键零阻塞零行为改变）③行为变化有披露与官方替代路径（CHANGELOG:12/README:128 + ②/③层）④关闭能力三层保留不弱于 v0.3.0（唯一收窄 = flag 层，其语义被 DEC-026 裁决本身消亡）。不跳号（相邻 MINOR）；D-1 选项含 PATCH 反论呈现，最终随 M-4 用户确认——程序完备 |
| 2 | **ahead 逐 commit 账目差 1** | **已实采澄清：当前实态 ahead 11，非 10；任务书「差 1」实为差 2 未点名治理 commits** | 本轮实采：`git rev-list --count bb81abf..HEAD` = **11**；R0 时点快照 10（R0 input:8 + EV-086 `"ahead_commits":10`）= bb81abf..866d4df。**820d862（REL-004 收尾段治理 commit：R0 机录 + EV-086 入账）产生于 R0 实采之后**——version-plan 头表引「ahead 10」又点名 820d862，内部数字不自洽。未点名余量 = **b2a1f66（REL-003 v0.3.0 发布链收尾入账——tag 后首个治理 commit，即「第 10 个 commit」身份）+ a6acd06（EVO-006 入账收尾）**。二者与 0eb1324/820d862 均为治理 commit，不入用户面——**CHANGELOG 未发布段无需为差量扩条目**；M-5 E-1 git log 实采三分账 MUST 以 11 为基线。→ W-1（WARNING） |
| 3 | **tracker:61「出口③设备码流排期」陈旧行** | **确认陈旧** | EVO-005（设备码授权流）已终态（tracker:31：R0 APPROVED_WITH_NOTES/0 + M-1 MUST 闭合）；设备码流已随 v0.3.0 发布（tracker:125 核心范围明载）。该待办行属陈旧账。version-plan §2.3/§7#17/§8 备注三处如实上报且不自行修改（.governance 非其写域）——处置正确。→ S-1（SUGGESTION：Coordinator M-7 清账） |
| 4 | **kill-switch 关闭面收窄披露如实性** | **如实** | 三产物 + feature-flags 四点一致：实验 flag 层退役 =「该层语义被 DEC-026 转正裁决消亡，非破坏」；通道级全关 = ①层 `router.enabled`；rollback 场景 A 边界注记明载「v0.3.1 无 flag 层——v0.3.0 场景 A-1 已退役」；feature-flags §1/§5 注记「转正后无开关无弹窗」。①层验证断言实存（C13/D8b，R0 :475/:511 实读），②层 B1/B2 在案（EV-086 promotion 13），③层断言在案——「已验证」字样均有断言支撑，无掩饰 |
| 5 | **feature-flags 不另立 v0.3.1 文件** | **合理** | feature-flags-v0.3.0.md §3 本就是「flag 债务控制」转正评估机制、§5「本清单随版本更新」——同文件转正注记是设计内语义；v0.3.1 发布面无新增 flag（存量 2 + 退役 2），另立文件几乎全为重复；version-plan §3.1 表 + feature-flags §1/§3/§4/§5 注记组合已完整覆盖（缺省/退役/验证语义/流程）。小瑕疵见 S-2（该文件头「v0.3.0（candidate）」字样未随发布刷新——v0.3.0 遗留文档卫生，非本版产物缺陷） |
| 6 | **RG-4 16 issues 披露口径** | **如实** | FIX-281 申报在案（tracker:64：9 项批次 + TRIAGE 机器记录 + DEC-172 版本定位待裁决）；披露明确「不伪装为 0」+ GOV-001 先例口径（EV-025）引用准确；「本 Agent 无命令权限未自跑——以任务书申报为源，M-7 复核」未虚称自验 ✓（§7#13 ⚠️） |

---

## 三、零编造核对结果（逐项对照事实源）

| # | 三产物引用事实 | 核对结果 |
|---|---|---|
| 1 | EV-086 权威值十面（948/110/114/14/65/98/20/exit0/13/exit0） | ✅ 与 evidence-log:194「门控面（收尾段+M-3 合并终态）」逐项精确吻合 |
| 2 | v0.3.0 已发布：tag bb81abf（peel）/ 2026-08-29 / tarball 1,507,506B | ✅ plan-tracker:125 + EV-084:178 |
| 3 | package.json version 0.3.0（:4 实读） | ✅ 本轮实读 `package.json:4` = `"version": "0.3.0"` |
| 4 | 7 产品 commits（bf667b3/6ebe9ed/a4d33cd/6cbe4fc/f2f3ba5/21db990/866d4df） | ✅ git log 实采逐一在案，commit 主题与归属一致 |
| 5 | 双审查链 APPROVED_WITH_NOTES / unresolved_blockers=0（机录） | ✅ review-EVO-006-R0.md + review-REL-004-R0.md 两份机录行在案 |
| 6 | 依赖面零变更 | ✅ 两轮审查实采 + 本轮实采 `git diff bb81abf..HEAD -- package.json` = 空 |
| 7 | RISK-001（risk-log:5）/ RISK-003（risk-log:7）活跃 | ✅ 实读两行均标「活跃」 |
| 8 | CHANGELOG:12（开过又关）/:14（关闭能力三层）/:47（undici FIX-006）/:62（UI 残留已知问题） | ✅ 实读吻合 |
| 9 | README:128「v0.3.1 起为正式通道」+ 披露 | ✅ 实读吻合（含「实验开关已废弃」「关闭偏好不迁移」+ 两条替代路径） |
| 10 | feature-flags §1/§3/§4/§5 转正注记 | ✅ 实读在案（§1 两键退役注记 / §3 评估结果 + 恰满窗 / §4 双侧判别新语义 + B1/B2 + oauthDiscover 边界 / §5 无开关无弹窗） |
| 11 | schemastery 透传容忍（strict 缺省 false + merge） | ✅ 以 REL-004 R0 §四库源码级实证为源（src/index.ts:241/:470/:752-763）——本审查未复读库源码，符合「以审查链为源」边界 |
| 12 | service.js 门控行号（:804-806 直连 / :3228-3231 发起 / :3232 事件） | ✅ 与 REL-004 R0 input §一实读留痕吻合 |
| 13 | promotion 11→13、smoke 946+2=948 账目 | ✅ R0 input §五逐 check 计数 13 + EV-086 账目链吻合 |
| 14 | 归档检测 v0.3.0 先例跳过（0<2） | ✅ EV-084「GATE-8 归档检测跳过」；本次结果待实跑、预判不写死 ✓ |
| 15 | tracker 行号引用（:20/:31/:34/:35/:61/:64/:125） | ✅ 实读全部落位 |
| 16 | ahead 10 | ⚠️ **过时快照**——R0 时点值如实标注来源，但当前实态 = 11（W-1）；缓解声明在案（§7#3「逐 commit 完整清单以 M-5 git log 实采为准」） |

**零编造核对总判定**：15 项 ✅ + 1 项 ⚠️（快照过时，有缓解声明）+ §7 自报 2 项 ⚠️（ahead 实采 / 16 issues 自验）——**未发现任何编造、虚构或把未验证写成通过的事实**。

---

## 四、M-4 授权点完整性核查

| 授权项 | version-plan §8 | checklist §M-4 | 核查 |
|---|---|---|---|
| D-1 版本号确认 | MINOR 建议 + PATCH 反论呈现 | 同左（前置 PM-1） | ✅ 覆盖 |
| D-2 Go/No-Go | 前置显式（RG-1 PASS + RG-2/3 执行段闭环 + 审查通过） | 同左 | ✅ 覆盖 |
| D-3 tag / push main / push tag / gh Release | **逐项授权**（EV-084 先例口径） | 同左 | ✅ 覆盖 |
| D-4 发布时点 | 授权即执行或指定窗口 | 同左（M-5 E-1~E-8 一次走完） | ✅ 覆盖 |

授权清单覆盖版本号确认 / Go-No-Go / push+tag+Release 逐项 / 时点四要素，前置绑定 PM-1 审查通过；发布决策/tag/push 在三产物中全部标注待 M-4（无既成事实措辞）。**完整**。

---

## 五、发现清单

### BLOCKING：**0**

### WARNING（2 项——非阻塞，绑定跟踪）
- **W-1 ahead 账目快照过时 + 内部数字不自洽**：version-plan §1.1 / checklist 第一步#2 引用「ahead 10」（R0 时点实采，来源标注如实），但当前实态 = **ahead 11**（820d862 治理 commit 产生于 R0 实采之后）；且 version-plan 已点名 820d862，与「10」矛盾。任务书「差 1」实为差 **2** 个未点名治理 commits（b2a1f66 + a6acd06）。缓解：§7#3 ⚠️ 已声明以 M-5 实采为准；差量全为治理 commit，零用户面增量，不影响 CHANGELOG 内容与 Go/No-Go。**要求（绑定，不阻塞）**：M-5 E-1 git log 实采三分账 MUST 以 11 为基线逐一点名；M-4 呈报时向用户同步此差量说明。
- **W-2 三产物当前 untracked**：`git status` 实采 `??` ×3（三产物均未入仓）——规划产物尚未成为可追溯的 tag 内事实源。非产物内容缺陷（PM-1 先审查后入仓为正常次序，R0 input:8 亦记录过同类工作区实态）；**处置归 Coordinator**：本审查链闭环后随治理 commit 入仓（M-4 呈报前完成）。

### SUGGESTION（3 项）
- **S-1** tracker:61 陈旧行（出口③设备码排期）建议 Coordinator M-7 治理收尾清账（EVO-005 已终态且随 v0.3.0 发布；version-plan 已三处如实上报）。
- **S-2** feature-flags-v0.3.0.md 头表「发布版本 v0.3.0（candidate）」字样未随 v0.3.0 发布刷新——建议 M-5 E-1 或 M-7 文档卫生时顺手修正；不影响 v0.3.1 flag 面准确性。
- **S-3** version-plan §1.1「main 领先发布点 ahead 10」建议 M-5 实采后同步为实采值并注明实采时点（与 W-1 同源，收口时自然消解）。

---

## 六、结论

- **结论：APPROVED_WITH_NOTES**
- **unresolved_blockers = 0**（独立结构字段；BLOCKING = 0）
- 计数：**BLOCKING = 0 / WARNING = 2 / SUGGESTION = 3**
- 硬门槛自检：发布检查清单 PENDING 项全部如实标注并绑定执行段位（RG-2→E-3 / RG-3→E-7+M-7 / RG-6→E-1）✓；回滚方案存在且「已验证」仅限断言在案项、推演级显式分层 ✓；CHANGELOG 用户视角完整（收口动作 PENDING 绑定 E-1，未预支）✓；breaking 标注 100%（容忍迁移口径 + 显式节收口 PENDING 如实）✓；Kill Switch 关闭验证在案（EV-086 promotion 13 + C13/D8b 实存）✓；M-4 授权点四要素完整 ✓。
- **附带约束（随结论生效）**：W-1/W-2 的「要求/处置」绑定项由 Coordinator 在 M-4 呈报前 / M-5 E-1 执行时落实；三项 SUGGESTION 归 M-7 或文档卫生时机。
- 复审义务：R1 首轮发布段审查无前轮 findings 退回；本结论为唯一轮次产出，处置权在 Coordinator（review-record 机录 + M-4 呈报）。
