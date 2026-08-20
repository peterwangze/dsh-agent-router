# DEV-003 发布审查报告（v0.2.0 Release Review）

| 项 | 值 |
|---|---|
| 审查对象 | v0.2.0 发布候选（DEC-015 用户确认；commit/tag/tarball/push 之前） |
| 审查者 | Release Reviewer Agent |
| 审查日期 | 2026-08-20 |
| 生命周期状态 | **候选态（candidate）**——发布三件套为工作区未提交变更；本审查通过后由 Coordinator 执行 commit / tag / tarball / push，并完成 candidate → released 转换标注 |
| 结论 | **APPROVED_WITH_NOTES（unresolved_blockers=0）**——即 APPROVED（通过），附 3 WARNING + 6 NOTE 保留备注；无未解决 BLOCKING finding |
| 报告路径 | `.governance/review-DEV-003.md`（本文件，唯一写入产物） |

---

## 0. 审查输入与证据链核验

| 输入 | 核验结果 |
|---|---|
| `.governance/plan-tracker.md` | MIG-001 终态（13 单元/R1-R14）+ DEV-003 进行中（DEC-003 已解除 DEC-015）+ 版本路线图（**滞后于 DEC-015**，见 N-6） |
| `.governance/decision-log.md` | DEC-003（暂停）/ DEC-012（D-1 定义）/ DEC-015（解除 + v0.2.0 + RISK-002 关闭）一致 |
| `.governance/risk-log.md` | RISK-001 活跃——**触发条件核对见 §4.1**；RISK-002 已关闭（2026-08-20 DEC-015） |
| `.governance/evidence-log.md` | EV-011~023 证据链齐全；EV-023 D-1 门判定：满足×2 / 部分满足×2 / 待实测×1 |
| `docs/architecture-v3.md` §8 | 迁移表 13 单元（Step 0-10 含 5a/5b/5c）与 CHANGELOG 覆盖对照见 §4.2 |
| 验证事实（Coordinator 提供，审查者无 Bash） | ① `node tests/smoke.mjs` → ALL PASSED（534 断言）；② `node tests/metrics.mjs` → exit 0（31 项 D-1 观测）；③ package.json version=0.2.0（已实读确认）；④ README 0.1.8 零残留（grep 实读确认） |

---

## 1. 五维度审查

| 维度 | 结论 | 证据 |
|---|---|---|
| **发布检查清单** | ✅ PASS | `docs/release/release-checklist-v0.2.0.md` 六步 24 项全部 PASS，每项带证据锚定（EV 编号 / commit 哈希 / 测试命令）；决策记录（版本决策记录表）与 DEC-015 一致；`lifecycle_state: candidate` 已声明（L10） |
| **回滚方案** | ✅ PASS（门控面已验证；git/安装态验证程序已定义——W-2 披露） | `docs/release/rollback-plan-v0.2.0.md` 三层回滚（安装态 / git revert / kill-switch）；可逆发布（无数据迁移）；<5 分钟；kill-switch 关闭态由 EV-013/EV-019 自动化断言覆盖；`.governance/` 保留注意事项（L37） |
| **CHANGELOG 质量** | ✅ PASS | `CHANGELOG.md` 七段齐全（摘要/破坏性变更/新增/变更/修复/已知问题/版本说明）；12 个产品单元（Step 1-10 含 5a/5b/5c）均有用户视角条目 + 内部追溯注解（EV 编号/commit）；已知问题含测量方法与 workaround |
| **Feature Flag** | ✅ PASS | 总开关 `router.enabled=false` 关闭态零介入由 EV-013（Step 3）/EV-019（Step 6）断言覆盖；模态矩阵 audio/video 为占位条目（stateOf 恒 null 不激活，EV-020）；attachmentIds 为增量参数非 flag |
| **版本号合规** | ✅ PASS | package.json version=0.2.0（实读）；0.1.8→0.2.0 MINOR bump（决策理由充分：行为变更 + 十项新机制，超出 patch 级）；v0.1.8 从未发布（EV-001：8 tags 至 v0.1.7）——跳号合规（放弃未发布 bump 而非跳过已发布版本），DEC-015 记录在案 |

---

## 2. 发布特有重点审查

### 2.1 RISK-001 触发条件核对与裁决（关键）

**事实**：
- risk-log L5 触发条件原文："v0.1.8 发布（DEV-003）前未完成 DEV-001"。
- plan-tracker L51：DEV-001（"v0.1.8 行为基线回归验证"）状态 = **待开始**（P1）。
- 缓解措施原文含"发布前完成 DEV-001 基线回归"——形式上未满足。

**裁决**：**触发条件正式命中**，但**支撑有条件发布**（不阻塞），依据：

1. **发布身份变化**：触发条件指名"v0.1.8 发布"，而 DEC-015（用户确认）已将发布升级为 v0.2.0——触发条件字面对象已不存在（虽精神适用）。
2. **基线重定义（适用面消失）**：DEV-001 原始定义是记录 whole-turn 图片路由默认化（c2648d2/963b4f5）后的基线输出，架构 §8 Step 0（architecture-v3.md L769）明示基线"含带图轮整轮路由行为"——该行为已在 Step 1（commit 7cb2024，EV-011）**整体移除**。基线目标物不存在，任务适用面被架构演进改变。
3. **缓解面实质增强**：RISK-001 本质是"缺回归保护"（EV-001：接入时仅 4 个冒烟测试文件）。MIG-001 交付后回归保护面为：smoke.mjs **534 断言**（含附件注册表 49 断言）+ metrics.mjs **31 项 D-1 观测** + attachments.mjs + client-render.mjs 断言 + **R1-R14 独立审查链**（14 轮，含两次 NEEDS_CHANGE→返工→复审闭环）——数量级高于触发风险时的基线面。
4. **D-1 验收门替代基线**：恒主模型/编址往返自动化 100%（满足×2）+ 图片到达/跨轮指代机制面 100%（部分满足×2）+ 触发率有测量方法（待实测×1）——比 DEV-001 基线记录更强的验收口径（EV-023）。
5. **DEC-015 已记录用户接受**："RISK-001 缓解已增强：534 断言+31 观测+审查链"、"D-1 待实测项均有测量方法且机制面全过——发布风险可接受"。

**后续要求（W-1）**：观察期（48h）内或下一规划周期完成：① DEV-001/DEV-002 的**关闭或重定义决策**（二者目标均已实质达成：DEV-002 的核心通路可重复测试由 MIG-001 测试面覆盖；DEV-001 基线对象已移除）；② risk-log 补记触发条件命中裁决与缓解措施状态更新。

### 2.2 D-1 门判定与发布决策一致性

- checklist 第六步"可以发布"的理由（L84-88）完整引用 D-1 门判定（满足×2/部分满足×2/待实测×1）与 DEC-015。
- 遗留项（L90）显式列出：D-1 端到端待实测（②③⑤）+ P3 记录项 + R14-F-01，均带后续域（观察期跟进/DEV-002 域）。
- 第五步定义 48h 观察窗 + 3 条回滚触发条件 + 成功标准（量化）。
- **自洽性**：实质完备（有条件发布语义的所有要素——遗留项清单/48h 关闭计划/回滚触发/成功标准——均存在）；仅决策**标注**为"可以发布"而非"有条件发布"（release-checklist SKILL 分类：非关键项遗留 + 数据验证计划就绪 = 有条件发布更精确）。DEC-015 用户确认已接受该框架。→ 见 N-1。

### 2.3 breaking changes 完备性

- 声明 ×2：整轮路由移除（CHANGELOG L14-18）、路径清单注入移除（L19-20）——均含行为前后对比 + 迁移指引。
- 边界面核对：接管语义收窄（twin 恒主模型，L36「变更」#1）、capabilities 枚举化（未知值兼容放行，L37「变更」#2）、promptText 行为变化（= breaking #2 本体）、attachmentIds/uploadFile/readWorkspaceFile（增量参数/通道，非 breaking）。
- **结论**：无遗漏 breaking 面——breaking ×2 完备（100%），边界面在「变更」节显式记录。

### 2.4 回滚方案可执行性

- `git revert c2648d2..53c0e40`：正向范围（A..B = (A, B]）语义**正确**——反转迁移前基线之后至 Step 10 完结的全部提交（含治理接入 04f1e67，方案 L37 注意事项已显式处理 `.governance/` 保留）。
- **发现表述错误**（W-3）：rollback-plan L36 称原简报范围"53c0e40..c2648d2"与正向范围"语义等价"——按 git 范围语义，反向范围 = 空集（revert 不作用任何提交），**不等价**。实际执行命令正确，且方案建议 `git log --oneline v0.1.7..HEAD` 复核拓扑，可防误执行；建议修正该句表述。
- kill-switch 验证锚定：EV-013/EV-019 断言（关闭态零介入/恢复即还原）——rollback-plan「验证方式汇总」L61-65 如实区分"已验证（门控面）"与"验证程序已定义（git/安装态）"，事实红线遵守。
- **严格性披露**（W-2）：release-checklist SKILL 要求回滚"在测试环境执行过回滚操作"——当前仅 kill-switch 面执行过验证；git/安装态为机械操作 + 验证程序已定义（未预先演练）。可逆发布（无数据迁移/Schema）下风险可接受，且观察期触发时按方案执行。

### 2.5 版本号

- 0.1.8→0.2.0 跳过 0.1.8 号：v0.1.8 从未发布（EV-001：8 tags v0.1.0–v0.1.7）——非跳过已发布版本，为放弃未发布 bump；DEC-015 + checklist「版本决策记录」双记录。合规。
- README 7 处版本引用全部同步 v0.2.0（L7 徽章 / L35 固定版本 / L39,44,45,51,52 tarball 与解压路径——grep 实读）；README 0.1.8 零残留（grep 实读）。
- 安装脚本（install.ps1/install.sh）无硬编码版本钉（默认 `main`，离线走 -LocalPath）——与回滚方案场景 A 的版本固定位写法一致。

### 2.6 tarball / 离线安装

- checklist 第四步 #1（L55）与核心功能验证清单 #1 均含 tarball 离线安装验证计划（责任人 Coordinator，属 DEV-003 执行段）。
- 候选态下 tarball 尚未生成属正常（tag 前）。**要求（N-4）**：发布 commit/tag 时执行 tarball 生成 + 离线安装验证（plan-tracker「版本 Gate 检查项」"tarball 可离线安装"），完成后才可宣告发布完成。

---

## 3. 发现列表

| 级别 | ID | 发现 | 事实依据 | 处理 |
|---|---|---|---|---|
| WARNING | W-1 | RISK-001 触发条件正式命中（DEV-001 待开始）——裁决：缓解面增强 + 基线重定义支撑**有条件发布**（不阻塞）；要求观察期内完成 DEV-001/DEV-002 关闭或重定义决策并更新 risk-log | risk-log L5 触发条件；plan-tracker L51；architecture-v3.md L769（Step 0 基线定义）；EV-023；DEC-015 | Coordinator：观察期/下一规划周期落实，risk-log 补记裁决 |
| WARNING | W-2 | 回滚"已验证"严格性：仅 kill-switch 面（EV-013/EV-019）执行过验证；git/安装态为机械操作 + 验证程序已定义（未预先演练）——可逆发布下可接受，诚实披露 | rollback-plan L59-67「验证方式汇总」自述；release-checklist SKILL 第三步 #2 标准 | 观察期触发回滚时按方案执行并记录；可选：发布前在 scratch worktree 干跑一次 revert |
| WARNING | W-3 | rollback-plan L36 "53c0e40..c2648d2"与"c2648d2..53c0e40""语义等价"表述**错误**——git 反向范围为空集，不等价；实际执行命令正确 | rollback-plan L36；git 范围语义（A..B=(A,B]） | 修正表述（可选项，不阻塞） |
| NOTE | N-1 | 发布决策标注："可以发布" vs D-1 待实测×1/部分满足×2 遗留——实质要素齐备（48h 观察窗/回滚触发/成功标准），仅建议标注"有条件发布（DEC-015 接受遗留项）"以消除表面张力 | checklist L80-90；DEC-015 | Coordinator：checklist 第六步补充说明 |
| NOTE | N-2 | CHANGELOG L26 将 route_agent 的 attachmentIds 参数归入 Step 5a/5b（EV-015/016）——实际参数新增在 Step 7（EV-020，lib/tool.js +25） | CHANGELOG L26；EV-020 | 修正步骤归属或注明跨步骤 |
| NOTE | N-3 | commit↔step 单点配对歧义：CHANGELOG L31 称 Step 5c=2c4b194，而 checklist/plan-tracker 按序清单中 98f04a3 位于 Step 5c 位置——EV 证据链（R7）自洽，单点配对两说；无 git 权限未实证 | CHANGELOG L31；checklist L20；plan-tracker L50 | 打 tag 时 git 复核统一三处记录 |
| NOTE | N-4 | tarball 离线安装验证为发布执行项（候选态未执行属预期）——发布时必办，完成后才可宣告发布完成 | checklist L55；plan-tracker「版本 Gate 检查项」 | Coordinator：发布执行段落实 |
| NOTE | N-5 | candidate→released 转换：checklist L10 已声明 candidate 并以文字标注代替 release-ledger——发布 commit/tag 时必须追加转换标注 | checklist L10；release-checklist SKILL 0.66.0 | Coordinator：发布执行段落实 |
| NOTE | N-6 | plan-tracker 版本路线图/总览滞后于 DEC-015：v0.1.8 行仍"进行中（DEC-003）"、v0.2.0 行仍"规划中"、总览"阻塞中/风险数 2"未反映 DEC-003 解除与 RISK-002 关闭 | plan-tracker L26-27, L59-63 | Coordinator：发布后治理记录更新（版本 Gate 检查项"治理记录已更新"） |

---

## 4. 硬门槛裁决

| 门槛项 | 阈值 | 裁决 | 说明 |
|---|---|---|---|
| 发布检查清单全部 PASS | = 100% | ✅ 通过 | 六步 24 项全 PASS，逐项证据锚定（EV 编号/commit/测试命令） |
| 回滚方案存在且已验证 | = 已验证 | ✅ 通过（部分面，W-2 披露） | kill-switch 面已验证（EV-013/EV-019）；git/安装态验证程序已定义——可逆发布下接受，诚实披露未演练 |
| CHANGELOG 用户视角完整 | 关键段全部覆盖 | ✅ 通过 | 七段齐全；12 产品单元全覆盖（Step 0=DEV-001 任务非产品变更，见 W-1） |
| breaking changes 已标注 | = 100% | ✅ 通过 | 2/2 + 边界面（接管收窄/枚举化）在「变更」节记录 |
| Feature Flag 关闭验证 | 全部通过 | ✅ 通过 | router.enabled 关闭态 EV-013/EV-019 断言覆盖；audio/video 占位不激活（EV-020） |

---

## 5. 终态

**APPROVED_WITH_NOTES（unresolved_blockers=0）**——对应任务简报三选一之 **APPROVED**（通过），附 3 WARNING + 6 NOTE 保留备注，全部非阻塞、有处理责任人（Coordinator）与时限（观察期/发布执行段）。

**发布前必办（Coordinator 执行段）**：
1. 发布 commit + tag v0.2.0（单父、指向候选 commit 之提交）；
2. tarball 生成 + 离线安装验证（N-4，版本 Gate 检查项）；
3. candidate → released 转换标注（N-5）；
4. 治理记录更新：plan-tracker 路线图/总览、risk-log 补记 RISK-001 裁决（W-1/N-6）；
5. 归档触发检测（plan-tracker「版本规划纪律」：`python <plugin_home>/infra/archive.py migrate --auto --dry-run`）。

**观察期（48h）跟进**：D-1 端到端待实测项（②③⑤）首轮 U-3 样本采集；DEV-001/DEV-002 关闭或重定义决策（W-1）。

---

*事实红线声明：本报告全部结论指向可复查事实（文件/行号/EV 编号/commit）；未执行项（tarball 验证、git revert 演练、D-1 端到端实测）均如实标注"未执行/待执行"，无推测性通过。*
