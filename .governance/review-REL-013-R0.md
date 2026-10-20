# 审查报告 — REL-013-R0（v0.6.1 发布候选 · E-4 发布审查）

> 机录副本：Reviewer 以消息体返回报告（按禁止事项不写文件），Coordinator 落盘后经 review-record CLI 写 canonical 记录。
> **Round**: R0（首轮）｜**Task**: REL-013｜**结论: NEEDS_CHANGE**｜阻塞级 findings = 2（P1×2）
> **Reviewer**: Release Reviewer（subagent，只读）｜审查方式：一手只读核验（候选三文件 + 机器权威注册表 + 治理证据行 + ARCH-006 审查报告逐项对照），未采信任何自报结论；本轮无 git/Bash 权限，git 对象类事实标注「未独立验证」。

## 一、审查范围与事实来源

- 候选文件：`package.json`（version `0.6.1`，L4）、`CHANGELOG.md`（v0.6.1 条目 L6-35）、`README.md`（版本面 + 宿主兼容性矩阵 L138-151）。
- 机器权威：`tests/host-version-snapshot.mjs:83-87`（`HOST_BASELINE_REGISTRY` 三档案）；`:240-251`（§5 README 判据组，覆盖面 = `declaredEntry`）。
- 治理记录：`.governance/evidence-log.md:811`（EVD-3）；`TRIAGE-REL-013`（`:810`）；`.governance/change-triage/REL-013.json`；`.governance/review-ARCH-006-R0.md`；`.governance/plan-tracker.md:28`（活跃行）`:177`（任务行）。
- 运行面旁证：`lib/host-abi/events.js:62-91`（白名单 28 项 + `plugin-market/changed since 0.2.1-rc.2`）；全仓 grep `plugin-market/changed` 仅命中镜像/白名单/测试，**客户端零 handler**。
- **未独立验证**（只读面无法执行命令）：tag/push 是否存在、工作树是否等于 `5b4d465`、`git show --stat` 三文件、E-2/E-3 命令重放；`package.json` 声明面「相对 v0.6.0 零改动」仅有测试断言与 EVD 记录作间接支撑。

## 二、逐维度结论

1. **发布就绪（通过，除 P1 项）**：版本号 `0.6.1` 单点（`package.json` L4）；CHANGELOG 五段结构齐全（摘要/变更/破坏性变更/已知行为·口径/版本说明），无 `TODO`/`待回填`/悬空 hash 残留（`e960039` 在 v0.6.1 已零命中）；发布范围自洽：E-1 时点 3（产品 1 `6bbf78b` + 治理 2 `4d7f331`/`265acc1`）→ 含 E-1 自身计 4，口径透明。
2. **质量门禁（证据一致性——部分通过）**：EVD-3 与 CHANGELOG 的 E-2 一致（`ALL 23 SUITES + 4 RUNNER MODULES PASSED`、`#SKIP 2 (smoke.mjs×2)`、exit 0；EVD-3 记 33.8s，CHANGELOG 按口径隐去耗时）；E-3 link 形态冷装 + tarball 形态安装的判据逐项吻合（33 files、沙箱 `DSH_HOME` 重定向、installedVersion 0.6.1、零 `link:`、stderr 0B、组合树含插件段）。**但 tarball 字节数/sha256 溯源不成立（P1-1）**。
3. **回滚能力（有条件通过，P2-2）**：本版零用户配置/存储格式变更（无迁移、无 schema 变化），回滚面 = 制品回滚；README L82「固定版本：…`v0.6.1`」提供固定版本安装通道（可换 `v0.6.0`），`docs/release/` 无本版回滚文档、无演练记录（仓内近版 v0.4.x~v0.6.0 同此惯例）。判 P2：要求 E-5 Release notes 明示「回滚 = 重装 v0.6.0（固定版本通道）；无数据迁移」。
4. **用户影响（通过）**：无新增能力面与用户可见行为变更——`plugin-market/changed` 仅入转发镜像白名单且**零消费点**（grep 实证无 handler）；schema 白名单为宿主超集对齐、插件消费面仍用旧 6 字段；README 安装命令/URL/tar 名与计划资产名 `dsh-agent-router-0.6.1.tar.gz` 逐字一致。

## 三、专项裁量结论

- **版本位（独立裁决）：维持 PATCH 0.6.1**。依据：无新增能力面（白名单/判据属看护与数据面）、无配置/存储格式变更、声明面零改动（`^0.2.0-rc.2` ×11 = peers 8 + dsh deps 3）、基线升格为数据面追加+降档且由覆盖判据保证装载门双 GREEN；semver 与仓内先例一致。
- **观察 (a) primary 行无机器断言：判 P2（非阻塞，需闭环任务）**。`tests/host-version-snapshot.mjs:241-243,246-249` 语义自 ARCH-006 起 = 只断言 `declaredEntry`（当前 0.2.0 frozen）四值；本次 README 漂移正是该缺口未拦住。测试属产品代码，超出 REL-013 声明文件集，不得塞入本发布；建议 Coordinator 以「发现即闭环」口径**立即 triage 一个独立任务**（扩 §5：primary 四值 + 「恰一 primary 行」在场断言），不得只登记不做。
- **观察 (b) E-1 提交自身计入发布面：可接受**。口径显式、可复核（3→4），且 E-1 改动面仅版本声明与文档，不承载产品行为；不影响 semver 与回滚判断。
- **ARCH-006 关联一致性：一致**。CHANGELOG 对 0.2.1 吸收 / 事件 27→28 / schema 6→9 / 两项判据演进的表述与 `review-ARCH-006-R0.md`（AWN / unresolved_blockers=0 / P3×3 / 129 断言 / `totalDiffs=0` / 双门 GREEN / 三态 matched）逐项对得上，无超宣示。
- **E-3 tarball 溯源：不一致（见 P1-1）**。

## 四、Findings

**P0：0 条。**

**P1-1（阻塞）E-3 的 tarball 字节数/sha256 不能对应最终 Release 资产（追溯性缺陷）**
- 事实：`README.md` 在 `package.json` `files` 白名单内（L54），即 README 内容进入 npm 包；E-3 的 `1,703,064 字节 / sha256 930a68a7…` 系打包于 E-1 定稿前的候选树（README 基线表两行版），而最终树已恢复 `0.1.5` 行（README +1 行）→ E-5 由最终 tag 树重打包的资产尺寸/hash **必然不同**。CHANGELOG L35 却以定值形式引用，用户核对下载物会失败。
- 修法（二选一，推荐 a）：(a) CHANGELOG L35 删去具体字节/sha256，改为「tarball 形态 33 files；发布资产终验（尺寸 / sha256 / 公网下载）以 E-5 机录为准」；(b) 保留数值但显式标注「候选包值（与最终资产可能不同）」（不推荐）。
- 同批勘正：EVD-3 事实依据把该 tarball 挂在 commit `5b4d465` 下不实——其为 E-1 前候选树产物；改为「E-3 候选包（E-1 前树）」，并在 E-5 由最终 tag 树重跑记录。

**P1-2（阻塞）README 仍有三处「主基线 = 0.2.0」口径，与本版核心信息（0.2.1 primary）矛盾**
- `README.md:262`「直接在公开 registry 可解析（**主基线 `0.2.0-rc.2`**）」→ 事实错误（主基线已为 `0.2.1-rc.2`）。
- `README.md:148`「版本范围（`^0.2.0-rc.2`，**主基线口径**）」→ 过时：ARCH-006 起该范围是**声明面锚定口径**（锚定 0.2.0 frozen 项、以覆盖判据容纳 0.2.1 primary）。
- `README.md:150`「声明面与主基线**不一致**（…）时全量测试网即红」→ 与现状矛盾：声明面锚 0.2.0 frozen、主基线 0.2.1，二者本就"不一致"却全绿；应改为「声明面**不再覆盖**主基线（版本范围漂移/回退历史基线/注入清单引用已消亡包）时红」。
- 修法：三处均为单行措辞修正（仍只动 README.md），分别改为「主基线 `0.2.1-rc.2`」/「声明面锚定口径（覆盖主基线 0.2.1-rc.2）」/「声明面不再覆盖主基线时红」。修毕 amend 后由同一 Reviewer R1 复审。

**P2-1（跟踪）** README §5 断言只覆盖 `declaredEntry`，primary 行无机器断言（详见专项裁量 (a)）→ 独立任务扩断言，不在本发布文件集内。

**P2-2（跟踪）** 回滚未文档化/未演练 → E-5 Release notes 明示回滚通道（重装 v0.6.0，零数据迁移）；本次不阻塞。

**P3-1（记录）** `plan-tracker.md:177` REL-013 行为 **7 列**（表头 6 列；行尾多出 `P0`），且 `:176` ARCH-002 行因此缺「优先级」列；REL-013 状态仍写「待派发」（E-1~E-3 已完成）。请 Coordinator 修复并复跑 write-guard / Check 14。

**P3-2（记录）** `change-triage/REL-013.json` reason 写「4 个提交」，triage 时点实为 3（含 E-1 后=4）——属时点口径混淆，建议备注勘正。

**P3-3（文档）** `docs/cold-install-gate.md:81,89`「主基线四值」表述随 ARCH-006 语义演进已不精确（现应指 declaredEntry 四值）——卫生批处理。

**P3-4（记录）** EVD-3 tarball 归属勘正（并入 P1-1 同批）。

## 五、终态与复审要求

- **NEEDS_CHANGE（R0）**：P1-1 + P1-2 修复后由**同一 Reviewer 复审 R1**（逐条比对修复状态：P1-1 措辞/数值处理、P1-2 三处行文本、EVD-3 勘正、P3-1 记录结构）。
- R1 通过（`APPROVED_WITH_NOTES` 且 `unresolved_blockers=0` 可接受）后，E-5 前置条件：
  1. **tag 打点 = 最终提交**（annotated tag，随 v0.5.0/v0.6.0 先例）；tag 后禁止再改 README/CHANGELOG（破坏资产-提交对应）。
  2. **资产由正式 tag 树 `npm pack` 生成**，不得复用 E-3 候选包；资产名逐字 `dsh-agent-router-0.6.1.tar.gz`（README L41/L86 引用）。
  3. 三重终验机录 EV：gh API `state=uploaded` + 重下载 sha1/sha256 双恒等 + 公网 `curl` 200 且字节数精确。
  4. Release notes 写明回滚通道 + 已知口径（雷达 issue #1 alpha 保持打开）。
  5. push main + tag 后观察 CI（run 结果入证据）；E-6 归档触发检测；E-7 用户重装按 SOP §7 清单 12 条复验（真机证据，不由本审查代填）。
- 附：`CHANGELOG` 的「E-4 结论不在本节预填」口径保持（审查结论由 `review-record` 机录承载，本报告不写入 CHANGELOG）。
