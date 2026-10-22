# 审查报告 — REL-014-R1（v0.6.2 PATCH 热修 · E-4 delta 复审）

> 机录副本：Reviewer 以消息体返回报告（按禁止事项不写文件），Coordinator 落盘后经 review-record CLI 写 canonical 记录。
> **Round: R1**｜引用前轮 `.governance/review-REL-014-R0.md`（APPROVED_WITH_NOTES / unresolved_blockers=0，P2×2 + P3×4）
> **Task: REL-014｜结论: APPROVED_WITH_NOTES｜`unresolved_blockers=0`**（P0=0 / P1=0 / P2=0 / P3=5）
> 结构化事实：`{"task":"REL-014","round":1,"verdict":"APPROVED_WITH_NOTES","unresolved_blockers":0,"p":{"P0":0,"P1":0,"P2":0,"P3":5},"candidate":"735d0799c83d5bda36c74b0a5109d28e08a4171e","delta":"CHANGELOG +4/-3"}`
> **Reviewer**: Release Reviewer（subagent，只读）｜复审方式：R0 findings 逐条原文核验 + 宿主登记表实读 + 终树证据复核；git 对象类事实依赖机验口径并标注。

## 一、R0 findings 逐条比对

| R0 项 | 状态 | 一手核验（原文/证据） |
|---|---|---|
| **P2-1** 影响面措辞 | **已修复** | `CHANGELOG.md:18` = 「除 reminder source 元数据写入点外，客户端与服务端其它逻辑零改动，无数据迁移」——与「修复改 `lib/prestep.js`」不再字面冲突 |
| **P2-2** 版本归属/覆盖范围 | **已修复** | `CHANGELOG.md:16` = 「**本机实测宿主 0.2.1-rc.2（v4 会话格式）**对 v4 会话行执行 producer-owned source kind admission（运行时验证覆盖 = 0.2.1-rc.2 主基线；0.2.0 / 0.1.5 由 CI 三基线矩阵后置覆盖，本版未作运行验证）」——不再断言「0.2.1 起」，且显式标注未运行验证 |
| **自查项** 「第一方、非改名」 | **已修复且事实正确** | 改「（未登记第三方插件名、非改名）」。独立核验宿主 `dsh-session-format-v3-to-v4/lib/index.js:51-85`：`RENAMED_PRODUCERS`（compact/tools-code-mode/tools-ptc/dsh-compaction-basic/@deepseek-ai/dsh-system-prompt）与 `RELEASED_SAME_NAME_PRODUCERS`（23 项）**均不含 `dsh-agent-router`**（host 文件全文 grep `dsh-agent-router` 零命中）⇒ 走默认分支 `plugin:${plugin}`，新措辞准确 |
| **P3-1** FIX-055 引用 | **已修复** | `CHANGELOG.md:29` 补「已立项 FIX-055 承载：真实 admission 合约测试 + 插件名单源/锚守卫」；与 `FIX-055` triage 范围（P2-1 真实 admission + P3-1 锚守卫 + P3-2 插件名单源守卫）逐项对应 |
| **P3-2** 次症状观察披露 | **已修复** | `CHANGELOG.md:28` 新增「另：用户报告『原生多模态模型贴图仍被切 +多模态』为独立待复测观察（…非同线；已记录于 plan-tracker 待办项）——…若复现将独立立案，本版修复不声称覆盖该观察」——诚实、无超宣示，对应 `plan-tracker.md:126` |
| **P3-3** docs 勘正承载 | **义务维持** | `docs/architecture-v3.md:360-361`、`docs/host-upgrade-sop.md:120` 仍为工作树未提交变更；CHANGELOG L29 如实标注归属，**MUST 随 E-5 治理提交入账**（见 N-4） |
| **P3-4** E-5 数值纪律 | **已闭环（证据面）** | `EVD-8`（evidence-log:834）：终树 `735d079` 重打包 = `dsh-agent-router-0.6.2.tgz` **1,703,634B / sha256 6F162A33…**，与 EVD-7 逐字节一致。独立核验一致性逻辑：`package.json:33-55` `files` 白名单 **不含 `CHANGELOG.md`**（包面仅 lib/*、cordis.patch.yml、install*.ps1/sh、docs/images/、README.md）且本轮未改 README ⇒ CHANGELOG-only amend **不可能改变资产**，结论成立；CHANGELOG 全篇无资产定值（grep `1,703,634`/`6F162A`/`1,703,118`/`EA6AFD7B` 零命中） |

**新引入问题：无 P0/P1/P2。** amend 未触碰 README/package.json 内容（README 仍 `0.6.2` 8 处 / `0.6.1` 零命中；package.json 仍 `0.6.2` 单点），CHANGELOG 五段结构完整、无占位/悬空 hash/预填。

## 二、全量终态重核

1. **版本位：维持 PATCH 0.6.2**（纯缺陷修复；无新增能力面/无破坏性/零配置存储变更/声明面 11 项零改动；E-4 独立升降位权本轮无升位理由）。
2. **CHANGELOG 质量：通过**。五段齐全；修复描述与 FIX-054 R0 事实逐项一致；发布范围 3→4 自洽（产品 1 = `4bed2d3` 6 文件；治理 2 = `217f037`/`c259751`，含 `docs/cold-install-gate.md` 勘正如实披露）；数字纪律 = 无资产定值、无 TODO/待回填、无悬空 hash。
3. **README 版本面：通过**。badge / 2×离线 URL / 6×tar 名 / 固定版本示例全 `0.6.2`，`0.6.1` 零命中；资产名 `dsh-agent-router-0.6.2.tar.gz` 逐字一致。
4. **证据一致性：通过**。EVD-7（候选树）+ EVD-8（amend 终树复核：E-2 32.6s exit 0、E-3 恒等哈希、cold-install GREEN）与 CHANGELOG 无冲突（CHANGELOG 明示「本节不预填数字」，资产定值仅存于证据行）。
5. **回滚义务：维持**。FIX-054 缺陷在 v0.6.1 及更早同样存在——Release notes MUST 用诚实措辞「回退到 v0.6.1 会重新引入图片轮失败，需避免图片轮；v0.6.2 是唯一含该修复版本」，禁止写成回滚可规避（R0 三-3 原文仍适用）。
6. **CI 覆盖表述（N-1）**：`ci.yml:198-274` 实证 guard-matrix 每基线 pinned 宿主树 + `DSH_HOST_SOURCE` + `node tests/run-all.mjs` ⇒「三基线矩阵后置覆盖」作为**门控/契约面**成立；它不执行宿主运行时 admission，故建议 Release notes 若再展开时限定「（契约/快照与门控面）」，CHANGELOG 现状未失实（已同句声明「本版未作运行验证」）。

## 三、Notes（P3，非阻塞）

- **N-1** 上述 CI 覆盖措辞可选精化（不改发布物即无需动作）。
- **N-2（记录）** `plan-tracker.md:184` 仍写 `fdccd78` 与「E-4 R0 审查中」——E-5 收口时更新为终树 `735d079` + R1 结论，不阻塞。
- **N-3（记录）** EVD-7 / R0 报告引用的 `fdccd78` 已被 amend 取代（不在分支历史）；EVD-8 已说明「终树 = 735d079（parent 4bed2d3）」——不可变记录 + 勘正行模式正确，无需动作。
- **N-4（承载义务）** 两处 docs 勘正 MUST 随 E-5 治理提交入账（FIX-054 R0 P2-2 闭环条件）。
- **N-5（措辞可选）** L29「插件名单源/锚守卫」建议写作「插件名单点/锚守卫」（防误读），不影响含义与放行。

## 四、终态声明

**APPROVED_WITH_NOTES，`unresolved_blockers=0`**——REL-014 终树 `735d079` 通过 R1 delta 复审：R0 两条 P2 均按建议修复且事实正确，新增自查项（未登记第三方插件名）经宿主登记表实读验证，无新引入问题；P3 项均为记录/承载义务，不阻塞。

## 五、E-5 执行前置条件确认（R1 通过即生效）

1. **tag 打点 = 终树 `735d079`**（annotated tag `v0.6.2`）；**tag 后禁止再改 README/CHANGELOG**（任何改动 → 重走 R2 delta）。
2. **资产由正式 tag 树 `npm pack` 生成**，名逐字 `dsh-agent-router-0.6.2.tar.gz`；实际重打包后与 EVD-7/EVD-8 的 `1,703,634B / sha256 6F162A33…` **逐字节核对**（因 files 白名单不含 CHANGELOG/docs/*.md，预期恒等；仍须实测、不得引用代替）。
3. **三重终验机录 EV**：gh API `state=uploaded` + 重下载 sha1/sha256 双恒等 + 公网 `curl` 200 且字节数精确。
4. **Release notes MUST 含**：诚实回滚表述（v0.6.1 同样含缺陷、需避免图片轮）、验证覆盖范围（运行时=0.2.1-rc.2 主基线；CI 三基线矩阵为门控面后置证据）、已知口径（雷达 issue #1 alpha 打开）、FIX-055 跟踪项、次症状待复测行。
5. **push main + tag 后观察 CI**（三基线矩阵结果入证据）；**E-7 用户真机复测**（文字模型发图 → 接管 +多模态 → 发送成功；截图/日志机录；次症状复现则当场立案）+ SOP §7 其余项按需；**E-6** 归档触发检测。
6. **收口治理**：`review-record` 机录本 R1 → `plan-tracker` REL-014/FIX-054 终态 + 版本路线图 0.6.2 已发布 → DEC（版本位/发布 go）→ 两处 docs 勘正随治理提交入账 → 推荐快照（task-priority-analysis）。
