# 审查报告 — REL-013-R1（v0.6.1 发布候选 · E-4 复审）

> 机录副本：Reviewer 以消息体返回报告（按禁止事项不写文件），Coordinator 落盘后经 review-record CLI 写 canonical 记录。
> **Round: R1**（引用前轮 `.governance/review-REL-013-R0.md`，结论 NEEDS_CHANGE，P1×2）
> **Task**: REL-013｜**结论: APPROVED_WITH_NOTES｜`unresolved_blockers=0`**（无未解决 BLOCKING）
> **复审对象**: commit `a86883b4fbc878ea1d461f4eedfbd2592ab9f4c1`（声明增量 = README/CHANGELOG 4 行）
> **Reviewer**: Release Reviewer（subagent，只读）｜复审方式：R0 findings 逐条一手核验 + 全量验收点重核（非仅看返工声明）；文件内容类事实全部一手读取，git 对象/未执行命令类事实依赖 Coordinator 机验口径并如实标注。

## 一、R0 findings 逐条比对

| Finding | 状态 | 独立核验事实 |
|---|---|---|
| **P1-1** CHANGELOG E-3 tarball 定值与最终资产必不一致 | **已修复** | `grep 1,703,064\|930a68a7\|1,703,118\|EA6AFD7B\|e960039` 于发布三文件 = **零命中**；CHANGELOG L35 已改为「`npm pack` tarball 形态（33 files）…安装 exit 0…；**发布资产终验（尺寸 / sha256 / 公网下载）以 E-5 机录为准**」——追溯义务移交给 E-5 机录，不再声明不可兑现的定值 |
| **P1-2** README 三处「主基线 = 0.2.0」口径 | **已修复** | `README.md:148` = 「`^0.2.0-rc.2`，**声明面锚定口径**——锚定 0.2.0 frozen 档案项、以覆盖判据容纳主基线 `0.2.1-rc.2`」；`:150` = 「声明面**不再覆盖主基线**（…）时全量测试网即红」；`:262` = 「（主基线 `0.2.1-rc.2`）」；`grep 主基线` 全 README 5 处均指向 0.2.1 / 声明面锚定口径，**零残留 0.2.0=主基线 表述** |
| **P2-1** README §5 只断言 declaredEntry | **已闭环（记录义务）** | `change-triage/FIX-053.json`：P2 / `machine-signal` / files=`tests/host-version-snapshot.mjs` / `touches_real_env=false` / 目标「§5 覆盖 primary 四值 + 恰一 primary 行在场 + 负控」；`TRIAGE-FIX-053` 证据行（evidence-log:815）+ tracker 任务行（`plan-tracker:178`，6 列）在位——**立项即闭环决策成立，但 MUST 在 E-5 后派发执行，不得滞留**（见 N-1） |
| **P2-2** 回滚未文档化 | **保留义务（不阻塞）** | 本版零数据/格式变更；回滚 = 重装 v0.6.0（README L82 固定版本通道）——E-5 Release notes MUST 明示（见前置条件 4） |
| **P3-1** plan-tracker 列形/状态 | **已修复** | `plan-tracker:177` REL-013 = **6 列**；`:176` ARCH-002 已补「P0」= **6 列**；REL-013 状态已更新为「R0 NEEDS_CHANGE 返工中 → R1」 |
| **P3-2** triage reason「4 个提交」时点口径 | **已勘正** | 机器记录不可变原则下，EVD-4 事实依据显式勘正：「`4 个提交` 为 E-1 后时点口径（triage 时点实为 3 = 产品 1 + 治理 2）」 |
| **P3-3** cold-install-gate 文档「主基线四值」 | **已修复** | `docs/cold-install-gate.md:74-90` 已按 ARCH-006 语义重写：`declaredEntry`（0.2.0 frozen）与主基线（0.2.1 primary）分离登记；三方边断言文本与 `tests/host-version-snapshot.mjs:183,225,231,246-249` 实际产出逐项对得上 |
| **P3-4** EVD-3 tarball 归属 | **已勘正** | `EVD-4`（evidence-log:816）显式记录：EVD-3 的 `1,703,064B / 930a68a7` 系 E-1 前候选树产物、非 `5b4d465` 树；终树 E-3 实测 = tarball `1,703,118B / sha256 EA6AFD7B…`（33 files）+ link 形态 GREEN（$TEMP 沙箱 `DSH_HOME` 重定向、stderr 0B、插件段在位） |

**新引入问题：无 P0/P1/P2。**（复核：R1 只动了 3 个 README 措辞行 + 1 个 CHANGELOG 行，均为文字面；README 改动不触碰 `tests/host-version-snapshot.mjs` §5 判据取值。）

## 二、全量验收点重核（R1 独立复验，不采信修复声明）

1. **版本位（独立裁决）：维持 PATCH 0.6.1**。`package.json:4` = `0.6.1` 单点；无新增能力面、无配置/存储格式变更、声明面 `^0.2.0-rc.2` ×11 零改动、基线升格为数据面追加+降档；`plugin-market/changed` 仍仅镜像白名单且**零客户端消费点**（grep 实证）。
2. **CHANGELOG 质量**：`## v0.6.1 — 2026-10-20` 五段结构完整（摘要/变更/破坏性变更/已知行为·口径/版本说明）；发布范围 3→4 口径自洽；验证基线 E-2/E-3 声明与 EVD-3/EVD-4 一致（E-2 通过项/#SKIP 2/exit 0；E-3 双形态判据逐项吻合终树实测）；无 `TODO`/`待回填`/悬空 hash/预填 E-4 结论。
3. **README 与机器权威一致**：支持基线集表三行（0.2.1 primary / 0.2.0 frozen / 0.1.5 frozen）与 `HOST_BASELINE_REGISTRY`（tests/host-version-snapshot.mjs:83-87）**逐值恒等**；版本面 badge/离线 URL/tar 名/固定版本示例全 `0.6.1`，`0.6.0` 零命中；安装前置提示 = 「声明面支持范围下限 0.2.0-rc.2 / 实测主基线 0.2.1-rc.2」与 package.json 声明面自洽。
4. **证据一致性**：EVD-3（候选树 E-2/E-3）+ EVD-4（返工勘正 + 终树 E-2/E-3）相互一致，无矛盾定值；P1-1 后 CHANGELOG 不再引用任何未兑现的资产数值。
5. **回滚义务**：保持 P2-2 要求（E-5 Release notes 明示「重装 v0.6.0；零数据迁移」）。
6. **用户影响**：零用户可见行为变更声明仍成立；资产名 `dsh-agent-router-0.6.1.tar.gz` 与 README 引用逐字一致。

## 三、Notes（非阻塞，不改变通过结论）

- **N-1（P2 义务提醒）** FIX-053 已 triage（machine-signal / P2 / 单文件测试面），**MUST 在 E-5 收口后按 machine-signal 排程派发**；否则「primary 行无断言」缺口将由 E-5 后的 README 变更再次暴露。不得只立项不执行。
- **N-2（P3 记录口径）** CHANGELOG 写「E-2 …发布候选树（本提交定稿前…）」而 EVD-4 记「终树 E-2 = 35.0s」——两者不矛盾（文档面定稿不改动被测代码/配置，§5 README 判据取值未变），但建议 E-5 收口证据行统一时点表述（不改发布物、不触发重审）。
- **N-3（P3 记录卫生）** EVD-3 保留原值不改（不可变记录原则正确），勘正由 EVD-4 承担——已核对，无重复或冲突表述。

## 四、R1 终态声明

**APPROVED_WITH_NOTES，`unresolved_blockers=0`**——v0.6.1 发布候选（`a86883b`）在版本位、CHANGELOG、README/注册表一致性、证据链与回滚义务上满足放行条件。本结论不预填 E-5 结果，由 `review-record` 机录承载。

## 五、E-5 执行前置条件确认（复审通过即生效）

1. **tag 打点 = 最终提交** `a86883b`（annotated tag `v0.6.1`，随 v0.5.0/v0.6.0 先例）；**tag 后禁止再改 README/CHANGELOG**（否则资产-提交对应断裂，须重审）。
2. **资产由正式 tag 树 `npm pack` 生成**（禁止复用 E-3 候选包），资产名逐字 `dsh-agent-router-0.6.1.tar.gz`（README L41/L86 引用）；建议 E-5 机录 tarball 尺寸/sha256 并与 EVD-4 的终树值交叉核对（若同树重打，应逐字节一致）。
3. **三重终验机录 EV**：gh API `state=uploaded` + 重下载 sha1/sha256 双恒等 + 公网 `curl` 200 且字节数精确。
4. **Release notes**：含回滚通道（重装 v0.6.0，零数据迁移）+ 已知口径（雷达 issue #1 alpha 保留）+ 本版无新功能。
5. **push main + tag 后观察 CI**（run 结果入证据）；**E-6** 归档触发检测（`archive.py migrate --auto --dry-run`）；**E-7** 用户重装按 SOP §7 清单 12 条复验（真机证据，不由审查侧代填）。
6. 收口治理：`review-record` 机录本 R1（AWN/0）→ plan-tracker REL-013 终态 → 版本路线图 0.6.1 行（已发布）→ DEC 记录版本位/发布 go → 推荐快照（task-priority-analysis）。
