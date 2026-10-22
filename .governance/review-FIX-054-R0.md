# 审查报告 — FIX-054 R0（Code Reviewer）

> 机录副本：Reviewer 以消息体返回报告（按禁止事项不写文件），Coordinator 落盘后经 review-record CLI 写 canonical 记录。
> **结论：APPROVED_WITH_NOTES** ｜ `unresolved_blockers=0`
> 结构化事实：`{"task":"FIX-054","round":0,"verdict":"APPROVED_WITH_NOTES","unresolved_blockers":0,"p":{"P0":0,"P1":0,"P2":2,"P3":4},"commit":"4bed2d3778b3bab4b6d06014afbfa810641ab855"}`
> - **任务**：FIX-054 —— P0 热修：图片轮 pre-step reminder 的 `source.kind='plugin'` 被宿主 v4 会话格式拒收（`format v4 message requires a producer-owned source kind`）。
> - **轮次**：R0（首轮）。
> - **被审对象**：仓库 `D:/AI/agent/deepseek/plugins/router` 的 HEAD `4bed2d3778b3bab4b6d06014afbfa810641ab855`（父提交 `217f037`）。
> - **审查方式**：一手只读核验（工作树文件全文 + 宿主 0.2.1-rc.2 实装树源码 + 治理记录）；审查员仅用 Read/Grep/Glob，未写文件、未运行命令（动态证据标「未运行验证」）。

## 一、审查范围与事实来源

| 项 | 内容 |
|---|---|
| 被审变更集 | `lib/prestep.js`、`tests/smoke.mjs`、`tests/metrics.mjs`、`tests/routing-paths.mjs`、`tests/fix-010-gui-fidelity.mjs`、`tests/fix-029-host-contract.mjs`（任务书声明 6 文件 +112/−16） |
| 一手事实来源 | ① 工作树文件全文（Read）；② 宿主 0.2.1-rc.2 实装树：`dsh-session-format-v3-to-v4/lib/index.js`、`README.zh.md`、`dsh-session-persistence-jsonl/lib/worker.cjs`、`dsh-llm/lib/types/message.d.ts`、`message.js`、`dsh-session-format-v2-to-v3`、`dsh-session-format-v0-to-v1`；③ 插件 `lib/index.js`、`lib/service.js`、`package.json`、`cordis.patch.yml`；④ 治理记录：`change-triage/FIX-054.json`、`plan-tracker.md:29/180`、`evidence-log.md:823`；⑤ `.git/COMMIT_EDITMSG`、`.git/logs/HEAD`；⑥ glob mtime 排序（范围旁证） |
| 未取得/未执行 | `git show --stat`、`git diff`、测试复跑、宿主 0.2.0/0.1.5 旧基线运行（无 Bash）；如实披露 |

## 二、5 维度逐项结论

| 维度 | 结论 | 事实依据 |
|---|---|---|
| 正确性 | ✅ 通过（附 P2-1 测试面） | `buildReminderMessage` 现产出 `source: { kind: REMINDER_SOURCE_KIND }`，无 `plugin` 字段；`REMINDER_SOURCE_KIND`（`:60`）= `plugin:${PLUGIN_NAME}` 单点推导；`PLUGIN_NAME`（`:43`）与 `lib/index.js:52`、`package.json:2`、`cordis.patch.yml:9` 一致。宿主准入 `source()` 只拒 kind 缺失/空/`'plugin'`；`plugin:dsh-agent-router` 为非空非 `'plugin'` 的 direct kind，准入通过 |
| 安全性 | ✅ 通过（N/A 面） | 变更不引入网络/fs/exec/权限面；kind 由模块常量派生，非外部输入；reminder 内容路径未改 |
| 可维护性 | ✅ 通过（附 P3-1/P3-2） | `REMINDER_SOURCE_KIND` 单点；`buildReminderMessage` 仅一处调用（`:269`）；注释锚定宿主源码且带版本 |
| 性能 | ✅ 通过 | 仅新增模块级字符串常量与对象字面量替换，无循环/I/O/缓存变化 |
| 测试覆盖 | ✅ 通过（附 P2-1 缺口） | 5 个套件同步为「精确新 kind + 非空 + `!Object.hasOwn(source,'plugin')`」；`hasReminder` 文本识别保留；旧实现下每套件至少一条失败断言；负向用例仍由长度/文本判据兜底 |

## 三、关键核验（摘要）

- **a 修复正确性**：全仓 Grep `lib/**` 无 `kind: 'plugin'` 写入点；`lib/service.js:1432/1464` 的 `kind:'user'` 未改；`createUserMessage` 只做 `{...input, role:'user'}` + id，不规范化 source。
- **b kind 选择独立结论（不应裸 `dsh-agent-router`）**：宿主 v3→v4 迁移 `producerKind()`（`index.js:87-93`）对非 renamed/same-name 第一方插件统一回落 `plugin:${plugin}`（`:92`）；宿主 README.zh.md:120-134 映射表逐字确认「其他任何插件名 → `plugin:` 后接完整原始名称」；`rewritePluginSource()`（`:101-107`）改写 kind 同时丢弃 `plugin` 字段。裸名虽能过窄准入谓词，但会造成新写裸名/旧会话 `plugin:` 两种 kind 并存，不建议。
- **c 测试改动忠实性**：smoke/metrics/routing-paths/fix-010/fix-029 逐文件核对——断言为收紧而非放水；旧实现（kind `'plugin'` + plugin 字段）下各套件至少一条必红；无恒真断言、未删除既有覆盖；smoke 的负向 check 由 `messages.length === 1` 兜底。
- **d 回归风险**：`buildReminderMessage` 唯一调用点 `prestep.js:269`；handler 门控/能力探测/逃生组/ fail-safe 未改；`client.js` 全文无 `source.kind` 消费，客户端镜像无需跟随；旧 v3 会话由宿主迁移为同形 kind，无需数据迁移；0.2.0/0.1.5 基线未运行验证（标注）。
- **e 注释锚准确性**：逐条实读宿主 0.2.1-rc.2 —— `index.js:126` throw / `:92` `plugin:${plugin}` / `worker.cjs:11641` 内联判据 / `message.d.ts:94-99` 「no shared catch-all plugin kind」全部命中；行号漂移风险已用「0.2.1-rc.2 实测行」标注但无机器守卫（P3-1）。
- **f 范围纯粹性**：HEAD = `4bed2d3` 由 reflog 核实；`COMMIT_EDITMSG` 首行以 `FIX-054` 开头；mtime 旁证 6 文件窗口自洽；`package.json`（0.6.1）与 `cordis.patch.yml` 未变；**P2-2**：`docs/architecture-v3.md` / `docs/host-upgrade-sop.md` 含 FIX-054 文案但不在 6 文件内，属工作树未提交变更（Coordinator 治理文档面），需明确承载提交归属。
- **g AI 专项**：mock 残留 0 / 硬编码绕过 0（产品侧 kind 由 PLUGIN_NAME 派生；测试侧字面量为独立 oracle）/ 幻觉 API 0（宿主 4 锚一手实读命中）/ TODO 0 / 过度实现 0。
- **h 判别力静态自洽**：回旧值全红在断言形态上成立；TDD 先红时序与动态数字「未运行验证」。

## 四、发现列表（P0=0 / P1=0 / P2=2 / P3=4）

| ID | 级别 | 位置 | 事实依据 | 影响 | 建议修法（非强制） |
|---|---|---|---|---|---|
| P2-1 | P2 | 5 个测试文件中的 `isProducerOwnedSource` 镜像 | 测试镜像宿主准入谓词，全仓未 import 真实 `dsh-session-format-v3-to-v4`；真实 admission 在宿主 `index.js:124-127` / `worker.cjs:11639-11642` | 若宿主未来把谓词收紧为白名单，套件仍绿而生产可能再断 | 在 `tests/host-contract.mjs` 宿主树可达组用 `assertV4RowAdmission` 构造 `user/message` row 跑 reminder；负向控制 `kind:'plugin'` 必 throw；若不可 import 则在 S2 增源码锚并标注「镜像级判据」 |
| P2-2 | P2 | `docs/architecture-v3.md:360-361`、`docs/host-upgrade-sop.md:120` | 两处为本次会话改动、不在 6 文件提交内；需明确承载提交 | 文档/lesson 留在工作树丢失风险 | Coordinator 用 `git status --porcelain` + `git show --stat 4bed2d3` 核实并指定承载提交/留痕 |
| P3-1 | P3 | `lib/prestep.js:48-58`；`tests/smoke.mjs:2936-2944` | 新增宿主行号锚准确但无机器守卫 | 宿主补丁/minor 升级会静默漂移 | 保留行号同时补稳定锚（符号名 + README 映射表）；可选 host-contract S2 源码锚 |
| P3-2 | P3 | `lib/prestep.js:43` / `lib/index.js:52` / `cordis.patch.yml:9` | 三处字面量 `dsh-agent-router`，无相等守卫 | 重命名单点漂移会产出与迁移映射不一致 kind | 加低成本守卫断言三处相等或单点派生 |
| P3-3 | P3 | `tests/routing-paths.mjs:1063` 等 | `prestep.js L225` 为修复前行号；控制台标题「RED on current code」历史遗留措辞 | 维护误导，不影响判据 | 改语义式表述（测试卫生，下批） |
| P3-4 | P3 | 5 个测试文件的常量/谓词副本 | 有意「独立 oracle」设计（不 import 实现常量） | kind 再变需 5 处同步 | 无需动作；若再加套件可抽 `tests/support/`（确保不 import 实现常量） |

**P0/P1 计数**：0 / 0。**P4-violation 核查**：未发现违反 project-principles 1~10 的行为。

## 五、范围外观察（不阻塞，仅登记）

1. `docs/architecture-v3.md:314` 的 `collectReminder` 签名与当前实现（返回 string）不一致——**本批之前已存在**，建议后续文档批勘正。
2. 任务书列出的 `lib/served-client.js` 在仓内不存在；镜像实为 `tests/served-client.js`，均未被本提交触及。
3. `GOV-009`（commit-msg hook 对宿主仓 `lib/**` 判定惰性）按任务指令不重开。

## 六、硬门槛裁决

| 门槛 | 阈值 | 实测 | 判定 |
|---|---|---|---|
| P0 阻塞问题数 | = 0 | 0 | ✅ |
| P1 关键问题数 | = 0 | 0 | ✅ |
| 5 维度全覆盖 | 100% | §二 逐项 | ✅ |
| 每条发现标注级别 | 100% | P2×2 + P3×4 | ✅ |
| 设计一致性检查 | 已完成 | 与宿主迁移映射/admission/README 表逐条对齐 | ✅ |
| AI 专项 5 项 | 全部完成 | §三-g | ✅ |

**结论：APPROVED_WITH_NOTES —— `unresolved_blockers=0`，代码侧可在「真机复测用户场景」前提下合并。**

**建议 Coordinator 后续动作**：
1. `review-record` 机录本结论。
2. 核实 `git show --stat 4bed2d3` 与工作树 docs 状态（P2-2）；确认 6 文件口径。
3. 用户真机复测：文字模型发图 → 接管切 `+多模态` → 发送后本轮成功（用户面验收）。
4. 可选：按 P2-1 补宿主真实 admission 合约测试；P3 项入卫生台账。
