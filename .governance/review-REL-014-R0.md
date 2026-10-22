# 审查报告 — REL-014-R0（v0.6.2 PATCH 热修 · E-4 发布审查）

> 机录副本：Reviewer 以消息体返回报告（按禁止事项不写文件），Coordinator 落盘后经 review-record CLI 写 canonical 记录。
> **Round: R0（首轮）｜Task: REL-014｜结论: APPROVED_WITH_NOTES｜`unresolved_blockers=0`**（P0=0 / P1=0 / P2=2 / P3=4）
> 结构化事实：`{"task":"REL-014","round":0,"verdict":"APPROVED_WITH_NOTES","unresolved_blockers":0,"p":{"P0":0,"P1":0,"P2":2,"P3":4},"candidate":"fdccd784e48bc42f4ec84c7911a2b5f8ceff127a"}`
> **Reviewer**: Release Reviewer（subagent，只读）｜一手只读核验（候选三文件 + 修复代码/测试 + 宿主 0.2.1-rc.2 实装源码 + 治理证据），未采信自报；git 对象类事实依赖 Coordinator 机验口径并如实标注「未独立验证」。

## 一、审查范围与事实来源

- 候选三件套：`package.json`（`0.6.2` 单点，L4；11 项 dsh 声明 L56-83 零改动）、`CHANGELOG.md`（v0.6.2，L6-34）、`README.md`（版本面 8 处：badge L7 / 离线 URL L41·L86 / tar 名 L46·L53·L91·L98 / 固定版本示例 L82；**`0.6.1` 零命中**）。
- 修复面一手核验：`lib/prestep.js:43`（`PLUGIN_NAME`）、`:60`（`REMINDER_SOURCE_KIND = plugin:${PLUGIN_NAME}`）、`:242`（`source: { kind: REMINDER_SOURCE_KIND }`）；`lib/**` 递归 **零 `kind:'plugin'` 残留**；`lib/client.js` **零 `source.kind` 消费**；三处插件名字面量一致（`package.json:2` / `lib/index.js:52` / `cordis.patch.yml:9`）。
- 测试面一手核验：`tests/smoke.mjs:2936-2959` / `metrics.mjs:290-306` / `routing-paths.mjs:1096-1109` / `fix-010-gui-fidelity.mjs:107-119` / `fix-029-host-contract.mjs:112-124` —— 断言 = 非空字符串 + `!== 'plugin'` + 精确 `plugin:dsh-agent-router` + `!Object.hasOwn(source,'plugin')`，字面量独立（不 import 实现常量），旧实现必红。
- **宿主源码独立复核**（`%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-session-format-v3-to-v4`）：`lib/index.js:124-127` `source()` 对 kind 缺失/空串/`'plugin'` 抛 `SessionFormatError("format v4 message requires a producer-owned source kind")`；`:87-93` `producerKind()` 默认 `plugin:${plugin}`；`:101-106` `rewritePluginSource()` 丢弃 `plugin` 字段；`README.zh.md:120-134` 映射表逐字「其他任何插件名 → `plugin:` 后接完整的原始名称」——**CHANGELOG 根因/kind 选择/旧会话迁移表述全部属实**。
- 治理记录：`evidence-log.md:831`（EVD-7 REL-014 E-1~E-3）、`:828`（EVD-6 FIX-054）、`:827`（TRIAGE-FIX-055）、`:830`（TRIAGE-REL-014）；`.governance/review-FIX-054-R0.md`；`change-triage/REL-014.json`（depends_on=FIX-054，files=三件套，target 0.6.2 / current 0.6.1，demand=user-named，`side_effect.touches_real_env=false` 且网络发布已声明）；`plan-tracker.md:29/30/182/183/184`。
- **未独立验证**：tag/push 是否存在、HEAD=`fdccd78` 与工作树一致性、`git rev-list --count`（3→4）与 `git show --stat`、E-2/E-3 命令重放；`217f037`/`c259751` 两个治理提交仅与 EVD-5/审查记录交叉印证。

## 二、逐维度结论

1. **发布就绪：通过**。版本 `0.6.2` 单点；CHANGELOG 五段齐全（摘要/修复/破坏性变更/已知行为·口径/版本说明）；发布范围 3→4 自洽（产品 1 = `4bed2d3`，6 文件 = `lib/prestep.js` + 5 测试；治理 2 = `217f037`/`c259751`，**`c259751` 含 `docs/cold-install-gate.md` ARCH-006 口径勘正已如实披露**）；无 `TODO`/`待回填`/tarball 定值/悬空 hash（`git grep` 面：`1,703,634`/`6F162A`/`1,703,118`/`EA6AFD7B` 于发布文件零命中）。
2. **质量门禁：通过**。EVD-7 与 CHANGELOG 表述一致（E-1 本地 23/23、`#SKIP 2`、exit 0，32.1s；E-2 32.3s 仅记录于 EVD-7，CHANGELOG 明示「不预填数字」——**无数字冲突、无虚标**）；E-3 双形态（cold-install-gate GREEN + tarball `1,703,634B`/sha256 `6F162A33…` 沙箱安装 version 0.6.2 → dump-config exit 0/stderr 0B/插件段在场）与证据行逐项一致；资产数值仅存于证据，发布物不引用定值（沿用 REL-013 R1 口径）。
3. **回滚能力：有条件通过（措辞必须诚实）**。见专项裁量 3——**回滚到 v0.6.1 不能规避 FIX-054 缺陷**（同源崩溃在 v0.6.1 及更早已存在），Release notes 禁止写成「回滚可修复/规避本缺陷」。
4. **用户影响：通过**。纯 P0 缺陷修复；无新增能力面、无配置/存储格式变更、声明面 11 项零改动；旧 v3 会话由宿主迁移为同形 `plugin:` kind（`producerKind()` 默认分支实证）；客户端零 `source.kind` 消费，镜像无需跟随。

## 三、专项裁量

1. **版本位独立裁决：维持 PATCH 0.6.2**。依据：缺陷修复（P0 用户场景）、无新能力面/无破坏性/零数据迁移、声明面零改动；semver 与仓内先例一致。E-4 保留独立升降位权，本轮无升位理由。
2. **FIX-054 R0 非阻塞项披露：如实且不漏不虚报**。CHANGELOG L28 逐项对应 `review-FIX-054-R0`：P2-1（`isProducerOwnedSource` 为宿主 admission 的**测试镜像**，建议后续补真实 admission 合约测试）、P2-2（`docs/**` 两处文案不在 6 文件内、承载归属 Coordinator 处置）、P3×4（行号锚无守卫 / 三处插件名字面量无相等守卫 / 测试标题历史措辞 / 5 套件常量独立 oracle）——均以「建议/卫生项」表述，**未声称已修**；FIX-055 已 triage（machine-signal，P2）与 plan-tracker 行在位。
3. **回滚表述建议（E-5 Release notes MUST 采用同义诚实措辞）**：
   > 「回滚：若 v0.6.2 出现其它问题需回退，可用 README『固定版本』通道重装 **v0.6.1**；**注意 v0.6.1 及更早版本同样存在本版修复的『文字模型发图 → 整轮失败』缺陷**——回退会重新引入该问题，需避免图片轮。v0.6.2 是当前唯一包含该修复的版本。本版无数据/格式迁移，回滚不涉及数据回退。」
   （禁止措辞：「回滚到 v0.6.1 可规避/修复图片轮失败」。）
4. **E-7 用户面验收（P0 缺陷必须真机取证）**：用户重装 v0.6.2 后——文字模型会话发图 → 自动接管切「+多模态」→ **发送后本轮成功**（无 `format v4 message requires a producer-owned source kind`），附截图/日志行（P10-③；API 状态层不得替代 GUI 验收）。**附加观察项**：plan-tracker:126 记录的「DeepSeek 官方原生多模态模型贴图仍被切 +多模态」为独立线（待复测取证），若复现须当场立案、**不得以本版修复宣称覆盖**。
5. **ARCH-006/宿主一致性**：`plugin-market/changed` 等 0.2.1 基线事实未在本版改动，CHANGELOG 未重述不构成遗漏；v0.6.1 发布记录（EVD-5）已闭环。
6. **文档承载（P2-2 from FIX-054 R0）**：`docs/architecture-v3.md:360-361`（已含 `source:{kind:'plugin:dsh-agent-router'}` + FIX-054 注记）与 `docs/host-upgrade-sop.md:120`（admission 类检索教训）已勘正在工作树——**MUST 随 E-5 治理提交入账**，不得丢失。

## 四、Findings

**P0/P1：0 条。**（放行条件满足）

- **P2-1（措辞，非阻塞）** `CHANGELOG.md:18`「客户端 / 服务端逻辑零改动」与事实不符：修复本身即修改服务端插件模块 `lib/prestep.js` 的 source 元数据写入逻辑。建议改「**除 reminder source 元数据写入点外，客户端与服务端其它逻辑零改动**」。若 tag 前修正 → 需同一 Reviewer R1 delta 复审；若维持，**E-5 Release notes 不得复用「逻辑零改动」表述**（改为「仅 reminder 消息 source 元数据变更」）。
- **P2-2（覆盖范围披露，非阻塞）** `CHANGELOG.md:16`「宿主 0.2.1-rc.2 **起**对 v4 会话行执行 producer-owned kind admission」的版本引入点未独立验证（本机宿主树只读 0.2.1-rc.2；FIX-054 R0 明确记载 **0.2.0/0.1.5 基线未运行验证**）。建议 E-5 Release notes 采用中性表述：「本机实测宿主 0.2.1-rc.2（v4 会话格式）拒收；运行时验证覆盖 = 0.2.1-rc.2 主基线，0.2.0/0.1.5 由 CI 三基线矩阵后置覆盖」。静态旁证：迁移 README.zh.md:120/134 表明 v3 直通 kind 为非空字符串且未知 kind 被原样保留，新 kind 在旧代应可承载（**未运行验证，如实标注**）。
- **P3-1（记录）** CHANGELOG 未引用 FIX-055 编号（P2-1/P3-1/P3-2 已 triage）——E-5 Release notes 可引用，避免读者误以为无跟踪任务。
- **P3-2（披露可选）** plan-tracker:126 的「原生多模态贴图仍被切」用户观察未进 CHANGELOG——属待复测确认的独立线，建议 Release notes 加一行「另：该用户观察待重装后复测，与本版修复非同线」（不阻塞；plan-tracker 已定义证据动作，非「登记待以后」）。
- **P3-3（承载义务）** 两处 docs 勘正（上文 三-6）MUST 由 E-5 治理提交承载；FIX-054 R0 P2-2 的闭环条件即此。
- **P3-4（E-5 数值纪律）** 发布物无 tarball 定值（正确）；EVD-7 的 `1,703,634B / 6F162A33…` 是 tag 前终树值。E-5 必须由**正式 tag 树**重打包并核对：若同树未再改文档 → 应与 EVD-7 逐字节一致；若采纳 P2-1/P2-2 修正（任何文档面改动）→ 必须重打包、重记数值，不得沿用 EVD-7。

## 五、终态声明

**APPROVED_WITH_NOTES，`unresolved_blockers=0`**——v0.6.2 发布候选（`fdccd78`）在版本位、修复正确性、测试判别力、CHANGELOG 质量、证据一致性与回滚义务面满足放行条件；P2×2 为措辞/披露面非阻塞项（建议 Release notes 吸收），P3×4 为记录/承载义务。本结论不预填 E-5 结果。

## 六、E-5 执行前置条件确认

1. **tag 打点 = 候选提交** `fdccd78`（若采纳 P2-1/P2-2 修正则打 amend 后提交并先走 R1 delta 复审）；**tag 后禁止再改 README/CHANGELOG**。
2. **资产由正式 tag 树 `npm pack` 生成**，名逐字 `dsh-agent-router-0.6.2.tar.gz`（README L41/L86）；与 EVD-7 值逐字节核对（同树应恒等）。
3. **三重终验机录 EV**：gh API `state=uploaded` + 重下载 sha1/sha256 双恒等 + 公网 `curl` 200 且字节数精确。
4. **Release notes**：含上述回滚诚实表述（三-3）、验证覆盖范围（三-4/P2-2）、已知口径（雷达 issue #1 alpha 保持打开）、可选 FIX-055 与次症状复测行。
5. **push main + tag 后观察 CI**（三基线矩阵结果入证据）；**E-6** 归档触发检测；**E-7** 用户重装 SOP §7 + 本报告三-4 的 P0 用户面验收（截图/日志，机录）。
6. 收口治理：`review-record` 机录本结论（AWN/0）→ plan-tracker REL-014 终态 / FIX-054 终态 → 版本路线图 0.6.2 已发布 → DEC（版本位/发布 go）→ 两处 docs 勘正随治理提交入账 → 推荐快照（task-priority-analysis）。
