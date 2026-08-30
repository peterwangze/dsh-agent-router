# Release Review — REL-005 R1（发布段规划三产物审查）

## 报告头

| 项 | 值 |
| --- | --- |
| 任务 | REL-005（v0.3.2 发布链——**规划段**：version-plan + release-checklist + rollback-plan 三产物） |
| 审查轮次 | **R1**（发布段规划审查；前序 R0 = REL-005 收尾段代码审查 APPROVED_WITH_NOTES/0，`.governance/review-REL-005-R0-input.md`） |
| 审查对象 | `docs/release/version-plan-v0.3.2.md`（252 行）/ `docs/release/release-checklist-v0.3.2.md`（128 行）/ `docs/release/rollback-plan-v0.3.2.md`（143 行） |
| 审查者 | Release Reviewer Agent（只读；Read/Grep/Glob + git 只读 rev-list/rev-parse/log/status；未执行任何测试/命令） |
| 审查日期 | 2026-08-30 |
| 结论 | **APPROVED_WITH_NOTES（unresolved_blockers=0）** |
| BLOCKING / WARNING / SUGGESTION | 0 / 2 / 2 |

---

## 一、5 维度审查

### 维度 1：发布就绪 — 通过（含条件）

- 规划段产物三件齐（version-plan / release-checklist / rollback-plan），全部标 `candidate` 态、全部发布动作（bump/tag/push/Release）标注待 M-4 用户授权（DEC-143）——**规划 ≠ 决策** 边界清晰，无既成事实表述 ✓
- Gate 检查：G4/G5 pending 如实披露（RISK-001 活跃，plan-tracker:20/82-83 + risk-log:5 实读核对一致）✓
- P0 任务：FIX-009/FIX-010 全闭环含用户复验（EV-088/089）✓；承载任务全部 APPROVED_WITH_NOTES/0（FIX-009 R0 / FIX-010 R0 / EVO-007 R1（T1 闭环）/ REL-005 R0——四份机录文件实读，unresolved_blockers=0 全部成立）✓
- **PENDING 纪律核验**：RG-2（冷装）→ M-5 E-3、RG-3（归档检测）→ M-7/E-7、RG-5（发布审查）→ PM-1（本次）、RG-6（版本一致性）→ M-5 E-1、E-1/E-2 → M-5——**每一项绑定明确段位，无一项冒充 PASS** ✓；RG-1 标「✅ PASS（在案基线）」有 EV-090 Coordinator 实测 + EV-091 Developer 申报 & R0 静态核验支撑，且 E-2（M-3'）复跑独立标 PENDING——在案基线 ≠ 冒充最终门禁 ✓

### 维度 2：质量门禁 — 通过（在案基线口径）

- RG-1 12 套件构成与 EV-090/EV-091 一致：smoke 963 / stats 110 / routing 114 / parity 14 / attachments 65 / credentials 98 / loopback 20 / client-render exit 0 / promotion 13 / metrics 31 / fix-009 9/9 / fix-010 13/13（E 组后）——断言计数与审查链静态核验（R0 9/13 一致）及 EV-091 申报逐项吻合 ✓
- 门控基线权威标注正确（EV-090 Coordinator 实测 + EV-091 申报/R0 静态核验；E-2 复跑后以实测为权威）✓
- 本仓适用性边界（插件仓 check-release/release-ledger 工具链不适用）声明与 v0.3.1 先例一致 ✓

### 维度 3：回滚能力 — 通过（对照仓库现实逐项）

- **v0.3.1 tag 存在**：`git rev-parse v0.3.1^{}` 实采 = `5ca8b87`，与规划/EV-087 声明一致 ✓
- **远端状态**：`git rev-parse origin/main` 实采 = `4ee80e9`（REL-004 E-8 治理收尾）——三阶段回滚（push 前 abort / push 后 revert / 用户侧 junction checkout）与仓库拓扑吻合；产品段 5 commits 点名（8877365/020909b/65226a3/3665d6a/1d2bf36）与 git log 实采逐枚一致 ✓
- 阶段一 abort 窗口关闭点（E-5 push）定义清晰；阶段二 revert 整段不拆分理由（判别测试与语义 commits 成组）成立；治理段保护（C-3 先例）✓
- kill-switch ③层形态增强注记（EVO-007 双入口 + R8-F1 14 断言组可删语义）与 review-EVO-007-R1 §二/§三、EV-090/091 完全一致 ✓；三层「已验证」均锚定 EV-090 断言在案（B1/B2/B4/文件不存在/竞态判别）——「验证过可以」语义成立 ✓
- 数据兼容：零 Schema/数据格式变更（oauthAccounts 数据域零触碰 EV-090）；EVO-007 回滚特殊代价（删除路径回 v0.3.1 F-1 缺陷面）如实披露 ✓
- B-2 顺序约束不适用论证（零依赖面变更，review-REL-005-R0「无 bump」实证 + package.json 现态实读）成立 ✓；推演级结论（C-3 回退后行为/B-2 推论）显式标注，与实证区分 ✓

### 维度 4：用户影响 — 通过

- 破坏性变更口径 = 「无」+ 四证（无 API/协议面 / 无配置面 / 数据面零变更 / 依赖面零变更）——与 v0.3.1 先例句式一致，收口时显式节（E-1）✓
- 行为变化披露在案：README **三处**「v0.3.2 起」实读核对——L20（特性节：官方 API 不提供 OAuth，v0.3.2 起已移除不可用入口）、L111（高级扩展：v0.3.2 起不再提供 OAuth 官方登录/粘贴 token 表单）、L129（FAQ：v0.3.2 起已移除管理入口）——与实现（review-REL-005-R0 §三 逐项核验）及用户预期一致 ✓
- 已知问题延续四项核对：CI 缺（RISK-001）/ 图片附件「加载失败」显示层残留（FIX-008 候选域）/ deepseek-official 端点挂起（宿主域）/ picked 盲区（宿主固有 P3）——全部列入收口核对项（E-1），不虚报修复 ✓
- 监控告警：不适用声明与先例一致；48h 观察期九项验证计划（M-6）含双修复通路 + EVO-007 布局 + kill-switch 三层复跑 ✓

### 维度 5：版本号合规 — 通过（独立判断成立）

独立论证见 §三（裁量复核 #1）。结论：**PATCH（0.3.2）论证成立**；MINOR 为可辩护替代（0.x 阶段用户自由裁量）已作为 D-1 反论呈报，处理正确。

---

## 二、零编造核对（逐项对照事实源）

| # | 规划引用 | 事实源核对（实读/实采） | 结论 |
| --- | --- | --- | --- |
| 1 | v0.3.1 tag = 5ca8b87，2026-08-30，tarball 1,507,454B | `git rev-parse v0.3.1^{}` = 5ca8b87 ✓；EV-087（1,507,454B）✓ | ✅ |
| 2 | package.json version 0.3.1 | 实读 package.json:4 = "0.3.1" ✓ | ✅ |
| 3 | 依赖面零变更（undici ^7.18.0 / peerDeps 8×rc.8 / files 11） | 实读 package.json:27-57：undici ^7.18.0 ✓、peerDependencies 8 项全 ^0.1.0-rc.8 ✓、files 11 项 ✓ | ✅ |
| 4 | 产品 5 commits 点名 | git log 实采：8877365/020909b/65226a3/3665d6a/1d2bf36 全部在 v0.3.1..HEAD ✓ | ✅ |
| 5 | 治理 8 commits 点名 | git log 实采：d92dfba/ec94a6c/0c7f987/49ac8ab/0234a88/ed229db/b664f52/6877389 全部在 ✓ | ✅ |
| 6 | 四审查 APPROVED_WITH_NOTES/0 | review-FIX-009-R0.md / review-FIX-010-R0.md / review-EVO-007-R1.md / review-REL-005-R0.md 机录实读，unresolved_blockers=0 全部成立 ✓ | ✅ |
| 7 | smoke 963 | EV-090 Coordinator 实测 963 ok/0 fail/exit0 ✓；EV-091 申报 963 持平 ✓ | ✅（skip 口径见 W-2） |
| 8 | fix-009 9/9、fix-010 13/13 | EV-090 实测 fix-009 9/9 + fix-010 9/9（E 组前）；EV-091 申报 fix-010 13/13（E 组随 1d2bf36，9→13）✓ 规划 13/13 对应收尾段后形态正确 | ✅ |
| 9 | EVO-007 用户 GUI 2/3 + 点③断言闭环 | EV-091：布局 ✓ OAuth 区块消失 ✓；点③以 R1 断言证据闭环（vision sha256:bcff4e35），未写成用户目击 ✓ | ✅ |
| 10 | README 三处「v0.3.2 起」（L20/L111/L129）+ L84/L108/L112/L113 | 全部实读，位置/语义逐项吻合 ✓ | ✅ |
| 11 | RISK-001/RISK-003 活跃 | risk-log:5/:7 实读 ✓ | ✅ |
| 12 | deepseek-official 端点挂起（宿主/端点域） | EV-088 用户验证项 ✓ | ✅ |
| 13 | picked 盲区（宿主固有 P3） | review-REL-005-R0-input.md 维度 1-5 源码核验 ✓ | ✅ |
| 14 | P3 台账各项 | review-REL-005-R0（P3×3）/review-FIX-010-R0（P3×4 含 P3-3 carry-forward）/review-EVO-007-R1（N-1~N-4）/EV-088（stats UTC/settings 遗留键）逐项在案 ✓ | ✅ |
| 15 | 归档检测先例跳过（0<2） | EV-084/EV-087 ✓；v0.3.2 预判不写死 ✓ | ✅ |
| 16 | 三层 kill-switch 断言在案 | feature-flags-v0.3.0.md §4 实读（oauthDiscover 边界注记 ✓）+ EV-090 ✓ | ✅ |
| 17 | CHANGELOG 现态无未发布段 | 实读首节 = v0.3.1（2026-08-30），无未发布段 ✓ | ✅ |
| 18 | 路线图 v0.3.2 行口径（C-4+C-5）vs 本版实际 | plan-tracker:133 实读 = C-4+C-5 成功率闭环；:39 REL-005 行 = 实际承载——规划正确识别不一致并建议 M-7 更新 ✓ | ✅（观察项） |
| 19 | plan-tracker:39「ahead 11」陈旧 | 实读确认（现 13）——规划识别正确 ✓ | ✅ |
| 20 | 用户验证口径（FIX-009 ✓ / FIX-010 ✓ / EVO-007 2/3） | EV-088/089/090/091 ✓ | ✅ |

**零编造核对总判**：20/20 项与事实源一致或已诚实标注待实采（ahead 计数差异见 W-1，skip 口径见 W-2，均已在文档内声明待 E-1/E-2 消歧，非隐瞒）。

---

## 三、5 项裁量复核表

| # | Release agent 自报裁量 | 独立复核结论 |
| --- | --- | --- |
| 1 | **semver PATCH 论证**（零新能力/零 breaking 四证/v0.2.1 先例；MINOR 反论否弃——「用户可见度≠版本语义级别」） | **成立**。独立判断：①FIX-009/010 = 缺陷修复（行为恢复设计意图，DEC-027）✓；②EVO-007 入口移除对象 = 从未可用的误导性入口（官方 API 不提供 OAuth，README 披露在案 + 用户已 GUI 验证区块消失）——清理不可用面属缺陷修正面而非能力收窄；删除路径补全 = 恢复 v0.3.1 回归的能力（R8-F1 语义反转），非新功能 ✓；③零 breaking 四证逐项实证（schemas 零触碰 / oauthAccounts 数据域零触碰 / 依赖面零变更 / 无协议面变更——oauthTokenExchange descriptor 保留为正确保留项，review-EVO-007-R1 F-6）✓；④v0.2.1 PATCH 先例（P0 热修 + 行为修正承载）成立 ✓；⑤不跳号、不重打 tag（B-3 论证）✓。MINOR 反论否弃合理：semver MINOR = 向后兼容**新增功能**，本版无新功能承载对象。用户预期一致性：README 三处「v0.3.2 起」事前披露 + 用户 GUI 2/3 验证——一致 ✓。**同意 PATCH**；MINOR 作为 D-1 可辩护替代呈报用户 = 正确处理 |
| 2 | **ahead 计数差异**（点名 13 vs 实采 12——M-5 E-1 消歧在案） | **已消歧，方向正确、引用值过期**。实采：`origin/main..HEAD` = **13**，`v0.3.1..HEAD` = **14**（多一枚 `4ee80e9` REL-004 E-8 治理收尾，v0.3.1 链收尾已在远端）。R0-input.md:8 实采「ahead 12」当时正确（HEAD=1d2bf36，origin/main=4ee80e9）；其后 6877389（R0 机录+EV-091 commit）提交 → 现 13。**点名 13 枚与 git log 实采完全一致（零缺漏零多列）**，「13 vs 12 差 1」之差 = 6877389（R0-input 实采后产生）。规划 §7 #3 已声明「以 M-5 E-1 git log 实采为准」+ §8 备注 2 标注——诚实处理。非阻塞；建议 E-1 明确基准口径（见 S-1） |
| 3 | **plan-tracker:39「ahead 11」陈旧 + :133 路线图行口径** | 确认陈旧（实采现 13）；:133 路线图 v0.3.2 行（C-4+C-5）与本版实际范围（REL-005 承载）不一致——规划建议 M-7 更新路线图行，已列入 M-7 里程碑 ✓ 合理，不构成本版阻塞 |
| 4 | **CHANGELOG 无未发布段路径差异** | 确认：CHANGELOG 现态以 v0.3.1 节收尾（无未发布段），v0.3.2 节由 E-1 创建收口；v0.3.1 先例 = 未发布段先行（version-plan-v0.3.1.md 事实源含「CHANGELOG.md（未发布段）」）——路径差异如实标注 ✓ 与任务书预期一致 |
| 5 | **skip 计数口径**（963 ok/1skip vs 963/0 fail） | EV-090 记录「963 ok/0 fail/exit0」（未提 skip）；规划写「963 ok/1 skip / 0 fail」并注明「skip 计数口径以 E-2 复跑实测为准」——诚实处理（1 skip 源 = 任务书权威输入）✓ 非编造；建议 E-2 复跑明确 skip 并留痕（见 W-2） |
| 6 | **RG-4 披露面**（deepseek-official 端点挂起/picked 盲区/P3 台账/FIX-008 残留延续） | 完整：四披露面全部入案（§5.1 风险表 + checklist 第二步 #4 收口核对项 + §6 No-overclaim #7）——端点挂起如实披露不伪装（EV-088 实证 + 本仓不可修声明）、picked 盲区（宿主 WeakMap 固有 P3 源码核验）、FIX-008 残留延续（CHANGELOG 已知问题原文延续 + 与 FIX-010 修复面区分声明）✓ 无遗漏 |

---

## 四、发现清单

### BLOCKING（0）
无。

### WARNING（2）
- **W-1（ahead 计数引用过期——非编造）**：规划 §1.1 引「ahead 12 commits（review-REL-005-R0-input.md:8 实采）」为当前事实——该值为 R0-input 时点值（HEAD=1d2bf36），当前权威实采 = **origin/main..HEAD 13 / v0.3.1..HEAD 14**（含 4ee80e9，v0.3.1 链收尾）。规划点名 13 枚与实采 13 完全一致（差 1 之谜 = 6877389 在实采后产生），零编造；文档已自注「以 M-5 E-1 git log 实采为准」。建议 E-1 三分账时以实采为准并更新规划行内「以 ahead 12 为准」表述为 13。
- **W-2（skip 计数口径）**：EV-090 实测记录为「963 ok/0 fail/exit0」无 skip 声明，规划写「963 ok/1 skip」且已注明 E-2 实测为准——诚实标注，但 E-1/E-2 执行时 MUST 以复跑输出为准并机写留痕，避免「1 skip」未经实测固化。

### SUGGESTION（2）
- **S-1（E-1 三分账基准口径）**：v0.3.0/v0.3.1 先例分别用 `bb81abf..HEAD`（86）/`bb81abf..HEAD`（12）口径；本版建议 E-1 明确基准 = `origin/main..HEAD`（13，v0.3.2 范围）或 `v0.3.1..HEAD`（14）并注明 4ee80e9 归属 v0.3.1 链（不计入 v0.3.2 三分账用户面），写入 CHANGELOG 版本说明（v0.3.1 先例句式）。
- **S-2（回滚 B-4 基线引用口径）**：B-4 引用「回滚至 v0.3.1 语义基线 = smoke 948（EV-086）」正确；建议执行时注明与当前基线（963，EV-090）的形态差异（fix-009/fix-010 判别测试随产品段整段同退，回滚后 = v0.3.1 时点十套件形态）——rollback-plan 已述「对应基线形态」+「整段 revert 保证实现与断言同退」，语义已覆盖，仅提示执行留痕措辞。

### 观察项（不阻塞）
- 三产物当前为 untracked（git status 实采）——规划段产物待审查通过后入仓（v0.3.1 先例：REL-004 规划段三产物入仓 a9651ad），属正常流程。
- M-7 路线图行更新（C-4+C-5 口径）为规划建议项，已入 M-7 里程碑。

---

## 五、结论

**APPROVED_WITH_NOTES（unresolved_blockers=0）**

- **BLOCKING = 0**；WARNING = 2（W-1 ahead 引用过期——已自注待实采、W-2 skip 口径——已自注 E-2 实测）；SUGGESTION = 2
- 5 维度全部通过：发布就绪（PENDING 纪律全过、无冒充 PASS）、质量门禁（12 套件在案基线口径与 EV-090/091 一致）、回滚能力（三阶段对照仓库现实可执行：tag 5ca8b87 存在 / 远端 4ee80e9 / 产品段 5 commits 与 git log 一致 / ③层形态增强注记准确）、用户影响（破坏性=无 + 四证 + README 三处披露与用户预期一致 + 已知问题四项延续）、版本号合规（PATCH 论证独立成立）
- 零编造核对：20/20 项与事实源一致或已诚实标注待实采；点名 13 枚与 git log 实采完全一致
- 5 项裁量复核：PATCH 成立 / ahead 消歧完成（13=13）/ tracker 陈旧与路线图口径识别正确 / CHANGELOG 路径差异如实 / skip 口径诚实 / RG-4 披露面完整
- 硬门槛：PENDING 项全部绑定段位 ✓；未跑检查全部标「未验证/待验证」✓；无假设编造 ✓；本审查未修改任何发布文档（唯一写入 = 本报告）✓

*报告生成：REL-005 R1 发布段审查 · 审查者：Release Reviewer Agent · 依据 release-review SKILL（事实红线 + PENDING 纪律 + 结论终态规则）*
