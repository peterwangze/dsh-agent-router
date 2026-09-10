# REL-012 E-4 R0 — v0.4.6 发布就绪独立审查（Release Reviewer → Coordinator）

**审查结论：APPROVED_WITH_NOTES**
**unresolved_blockers: 0**

（BLOCKING=0 / WARNING=2 / SUGGESTION=2——两条 WARNING 均为 E-5 执行段门禁与收口义务，非发布候选本身缺陷；候选文件面全部通过。仅 APPROVED / APPROVED_WITH_NOTES(unresolved_blockers=0) 为通过终态，本结论属后者。）

---

## 一、审查范围与方式（事实红线声明）

- **审查轮次**: R0（首次，无前轮）；审查对象 = v0.4.6 发布候选 @ HEAD `65201ad`（发布三件套 + 发布链 E-1/E-2/E-3 已执行段 + 治理记录），非代码 diff（FIX-032 代码审查已由 Code Reviewer R0 机录，本次核验其存在性与覆盖声明，未重复逐行审查）。
- **审查方式**: 全程只读——read/grep/glob + `.git` 引用文件直读（HEAD / refs/remotes/origin/main / refs/tags / logs/HEAD reflog）；**未执行任何命令（Bash/pwsh 零调用）、未修改任何文件（Write/Edit 零调用）、未建子 agent、未与用户交互**。破坏性红线：不适用（只读审查，零真实环境操作）。
- **证据分级**: 「直读」= 本审查员可直接复查的文件/行级事实；「机录采信」= 治理记录（plan-tracker/EV）载明且经交叉印证、但审查员只读约束下未独立复跑的事实（逐处标注）。

## 二、git 事实独立核验（只读 .git，非采信 prompt）

| 事实 | 核验结果 | 锚 |
|---|---|---|
| HEAD | `65201ada60e5…` = **65201ad** ✓ | `.git/refs/heads/main` 直读 |
| 未推送面 | origin/main = `969531b` → 未推送恰 **640e2e4 + 65201ad** 两个 ✓ | `.git/refs/remotes/origin/main` 直读 |
| tag v0.4.5 | 存在（annotated 对象 `a993dcea`）；目标 commit **79d67c7** 由 EV-169（发布时点机录：治理入仓 79d67c7 → push 3307d3f..79d67c7 → tag v0.4.5 push）+ CHANGELOG L36 + reflog 三方一致印证；annotated 对象未直接解引用（只读约束，如实标注） | `.git/refs/tags/v0.4.5` 直读 + EV-169 + reflog L381-382 |
| tag v0.4.6 | **不存在** ✓（正确——E-5 未到，无提前打标） | `.git/refs/tags/v0.4.6` not found |
| 范围提交链 | reflog 四行逐字核对：`79d67c7`（REL-011 治理入仓）→ `969531b`（REL-011 发布终态入仓「v0.4.5 已发布」）→ `640e2e4`（FIX-032：移除 cfg.main 固化回落）→ `65201ad`（REL-012: v0.4.6 发布三件套 bump+CHANGELOG+README E-1） | `.git/logs/HEAD` L381-384 |

**三分账对账（专项必查②）**：CHANGELOG L36「产品 1（640e2e4）+ E-1 1（65201ad，hash 见 git log）+ 治理 1（969531b 归属 v0.4.5 链尾账不入用户面）+ 治理随 E-5 终值回填」与 reflog 逐 commit 对照**完全一致**；「E-1 时点实采 = 2 加本提交」成立（origin/main=969531b 即 tag 后第一笔）；969531b 治理归属声明与 reflog 提交主题逐字吻合。E-5 终值回填为声明的占位纪律（v0.4.5 同型先例），合法。

## 三、findings 列表

### W-1（WARNING）E-5 资产上传名逐字一致——执行门禁（W1/W2 历史同型复发教训）
- **位置**: E-5 GitHub Release 上传动作（未到时点）；README L41/L86 链接为基准
- **事实依据**: README 链接 = `releases/download/v0.4.6/dsh-agent-router-0.4.6.tar.gz`（**tag 带 v × 资产名无 v**），与 v0.4.3（EV-147「asset 无 v 前缀 = README 链接逐字一致」）/ v0.4.5（EV-169 curl -sIL HTTP 200 + Content-Length 1636560）实证惯例一致；但 **v0.4.4 曾 W1 同型复发一次**（EV-156：gh 按本地文件名上传 v 前缀资产 → delete-asset + 重传 + curl 终验才闭环）。全仓 grep `dsh-agent-router-0\.4\.` 仅 README 六处且全部 0.4.6（无陈旧资产名）；install.ps1/install.sh 零版本硬编码（grep 无命中，脚本按分支 ref 安装——无漏同步面）。
- **修复建议**: E-5 MUST 以资产名 **`dsh-agent-router-0.4.6.tar.gz`（无 v 前缀）** 上传（上传后核名），并以 `curl -sIL` 终验 **HTTP 200 + Content-Length = 1,637,114**（E-3 暂存 tarball 尺寸，plan-tracker L26）与 README 链接逐字一致——三版连续先例的既定门禁，缺一不可。

### W-2（WARNING）E-2/E-3 证据当前仅存 plan-tracker 进度列——E-5/E-6 合账义务（v0.4.5 F-2 同型教训）
- **位置**: `.governance/evidence-log.md`（EV 止于 EV-170；无 EV-171+，grep 实证）
- **事实依据**: E-2 21/21 @65201ad、E-3 隔离冷装五数字（1,637,114B / exit 0 / 0.4.6 / lib 15 / IMPORT OK keys=5）现仅记录于 plan-tracker L26 进度列。本仓惯例为链尾合账（EV-156/EV-169 均为「E-2~E-6 终态」单行合账），且 **v0.4.5 的 EV-169 正是 Reviewer F-2 finding 促成的事后补记**——同型状态在上一版曾被判为缺口。
- **修复建议**: E-5/E-6 收口 EV 行 MUST 覆盖 E-1~E-6 全链（含 21 套件清单口径、E-3 五数字、E-4 本结论、E-5 push/tag/Release/资产终验、E-6 归档检查），不再依赖 tracker 进度列作为唯一载体。

### S-1（SUGGESTION）EV-170 遗留边缘未随版披露于 CHANGELOG「已知行为」
- **位置**: CHANGELOG v0.4.6「已知行为 / 口径披露」段（L27-31）
- **事实依据**: EV-170 载明遗留观察——「旧宿主『切换后未发请求即派生 subagent』边缘受宿主委托基线固有限制（同构不越权；台账候选）」：切换后、下一请求发出前派生的 subagent 走 parent.options（最近请求路由）而非 pending 切换值。语义上可辩护（「当前实际模型」= 最近请求实际路由，pending 未成请求不算 actual；README L165 措辞未超此界），且 EV 已机录——但本仓 no-overclaim 纪律曾为更窄边缘做过随版披露（v0.4.4/v0.4.5 先例）。
- **修复建议**: E-5 前在「已知行为」段补一行披露，或在 E-5 治理入仓中明示裁定「台账候选、不随版披露」留痕。二选一即可，不阻塞。

### S-2（SUGGESTION）plan-tracker 项目总览行停留 v0.4.3 时点
- **位置**: `.governance/plan-tracker.md` L20（项目总览表）
- **事实依据**: 总览行仍写「39 任务 / **v0.4.3 已发布（2026-09-04）** / G4 待评」，与当前 v0.4.6 发布链（活跃行 L26/27 准确）相差两个已发布版本。治理卫生项，不影响活跃行准确性与发布门控。
- **修复建议**: 随 E-5 治理入仓刷新总览行（任务数/最近发布/Gate 结论）。

## 四、四维度结论（逐项含证据锚）

| 维度 | 结论 | 证据与说明 |
|---|---|---|
| ① 发布就绪 | **通过** | HEAD=65201ad（直读）；范围 = tag v0.4.5..HEAD 恰 3 commits 与三分账一致（reflog）；版本三件套齐备（package.json L4=0.4.6 直读；CHANGELOG v0.4.6 节 L6-37 五段完整直读；README 8 处版本位直读全 0.4.6）；无未解决 BLOCKING；P0 无未完成（活跃行仅 REL-012 P1〔本审查即其 E-4〕+ FIX-032 P1〔用户复验后置 = 已记录用户裁决〕）；RISK-001（CI 缺）为 v0.3.0 起披露延续口径，v0.4.3~v0.4.5 三版发布先例不阻发布 |
| ② 质量门禁 | **通过（口径如实）** | E-2 门控全量 **21/21 exit 0**（@65201ad）= 机录采信（plan-tracker L26；审查员只读未复跑）；**独立旁证**：tests/ 直读清点恰 21 个 *.mjs ✓；preset-defaults.mjs 直读含 FIX-032 M 判别节（L1047 节头；M1 L1077/M2 L1092/M3 L1104/M4 L1117/M5 L1131）+ B2 L420 / B5 L443 / B6 L456 语义修订 ✓；preset-defaults.js L487 修复态直读在位（`target = modelSet(cfg.subagent) ? cfg.subagent : null` + L488 早退 + L470-477 doc 注释）与代码审查记录一致、工作树无漂移；E-1 smoke 两跑 exit 0（机录）。CI 缺失 = 已披露延续（CHANGELOG L30） |
| ③ 回滚能力 | **通过（一项如实标注未验证）** | 方案存在且可执行：README 双通道（`dsh plugin update` L60-65 / 离线 tarball `file:` 装 L39-56，步骤具体可照做）+ 前版资产可用性有实证（EV-169：v0.4.5 tarball HTTP 200 + Content-Length 逐字一致）；数据面：FIX-032 零存储触碰（代码审查维度② + 修复点直读）→ **0.4.6→0.4.5 回滚数据安全**（v2 统计行为 0.4.5 原生可读）；更深降级（→≤0.4.4）由 CHANGELOG L29 延续 v0.4.5 F-1 口径披露（最坏不可逆清除 + 备份 stats 目录步骤）✓。「回滚专项演练」**未执行（未验证）**——PATCH 零数据面变更 + 通道机理经 E-3（新版 tarball 隔离安装 exit 0，机录）与 v0.4.5 资产 200 实证间接覆盖，不构成阻塞，如实标注 |
| ④ 用户影响 | **通过** | CHANGELOG 用户视角完整（摘要一句话语义 + 现象/根因/修复/语义四态/判别五段，L8-21）；无 breaking（独立裁决见下）；迁移零成本（无配置/数据/API 变更；需旧行为者逃生口 = 显式配置 cfg.subagent，M3 断言在位）；用户复验后置措辞纪律全过（专项必查③）；宿主域三条 + CI 披露延续全过（专项必查④）；监控告警面 = N/A（本插件无生产监控面，统计/诊断面板为既有面） |

## 五、专项必查逐项结论

1. **README 资产命名 × E-5 上传名**: **通过（附 W-1 执行门禁）**——`dsh-agent-router-0.4.6.tar.gz`（无 v）× `releases/download/v0.4.6/`（带 v）= 既证惯例；全仓无陈旧资产名、安装脚本无版本硬编码（grep 实证）。
2. **CHANGELOG 三分账 × git 实采对账**: **通过**——见「二、git 事实独立核验」：reflog 逐 commit 逐字对账一致；969531b 治理归属声明成立；E-5 终值回填为声明占位（合法）。
3. **用户复验后置措辞纪律**: **通过**——CHANGELOG L20「用户真机复验由发布链后置记录，本节不预填」+ L37 同义复现；v0.4.6 节全文（直读）无「已验证/已确认」类用户面宣称；E-2/E-3/E-4 均声明「由 REL-012 链各自入账，本节不预填」——零预填 ✓。
4. **宿主域已知行为三条 + CI 缺披露延续**: **通过**——CHANGELOG L31 三条不变（DEFERRED-001 / 重启状态 / 会话内切换改写全局默认）并指向 v0.4.5 节 L76-78 详情 ✓；L30 CI 缺披露（v0.3.0 起延续）✓；降级兼容（F-1 口径）L29 延续 ✓。
5. **FIX-032 代码审查结论存在性**: **通过**——`review-FIX-032-R0.md` 机录存在（APPROVED_WITH_NOTES / unresolved_blockers=0 / wiring: pending = review-record 标准字段，REL-009/011 同构非异常）+ `review-FIX-032-R0-input.md` 全文在（五维度 100% 表 + AI 专项五查 + 三方设计一致性 + Developer 声称 1-5 逐项核验 + P3×3 台账）；plan-tracker L27 与 EV-170 双登记；P3×3 台账已入 tracker（F-1 诊断建议 / F-2 既有注释行号 / F-3 宿主路径）——无重复审查义务，覆盖声明属实。

## 六、发布检查清单（逐项有证据 = 100%）

| # | 检查项 | 结果 | 证据锚 |
|---|---|---|---|
| 1 | 版本号 bump 0.4.5→0.4.6 | PASS | package.json L4 直读 |
| 2 | README 版本同步（8 处 + 残留审计） | PASS | L7/L41/L46/L53/L82/L86/L91/L98 全 0.4.6 直读；残留仅 L147「v0.4.5 起全部默认折叠」= 历史引入标注合法；其余 0.3.x/0.4.1 均历史功能标注 |
| 3 | CHANGELOG v0.4.6 节完整性 | PASS | 摘要/修复/破坏性/已知行为/版本说明五段直读（L6-37） |
| 4 | 三分账与 git 对账 | PASS | reflog L381-384 逐字（见二） |
| 5 | 门控 E-2 全量 | PASS（机录采信+旁证） | plan-tracker L26；tests/ 21 文件清点 + M1-M5/B2/B5/B6 在位 grep 实证 |
| 6 | E-3 隔离冷装 | PASS（机录采信+旁证） | plan-tracker L26（1,637,114B/exit 0/0.4.6/lib 15/keys=5；peer 供给形态同 v0.4.5 预期 = EV-169 先例）；lib/ 直读恰 15 模块 ≡ package.json files 15 lib 条目 |
| 7 | E-1 冒烟 | PASS（机录） | plan-tracker L26「smoke 两跑 exit 0」 |
| 8 | FIX-032 代码审查存在且通过 | PASS | 机录 + 全文报告 + EV-170 + tracker L27（见五-5） |
| 9 | 回滚方案存在且可执行 | PASS（演练未验证，如实标注） | 见四-③ |
| 10 | Breaking changes 标注与 diff 对照 | PASS | 「无」+ 四证逐证核验（见七） |
| 11 | semver 合规 | PASS | 见八 |
| 12 | 复验后置措辞 + 披露延续 | PASS | 见五-3/五-4 |
| 13 | Feature Flag / Kill Switch | N/A | 本版零新 flag（diff = 1 功能行 + 测试 + README，无 schema/flag 面——代码审查 + L479-522 直读）；旧行为逃生口 = 显式配置（非 flag，语义四态②） |

## 七、破坏性变更独立裁决（不采信 E-1 声明，逐证核验 + 独立理由）

**裁决：FIX-032 非 breaking（CHANGELOG「无」成立）。**

四证逐证核验：
- **① 配置面零新增节：证成**——640e2e4 范围 = preset-defaults.js（唯一功能行 L487，直读在位）+ tests + README（代码审查 + EV-170 + reflog 主题）；schemas 未触，零配置项增删改。
- **② 依赖面零变更：证成（基于 commit 范围事实交叉）**——范围内 package.json 变更仅 E-1 version 1 行（plan-tracker「package 1 行」+ E-1 三件套 scope + 640e2e4 3-files 清单不含 package.json）；当前 deps/peerDeps 面直读在案。审查员未做 v0.4.5 逐字段 diff（只读约束，如实标注），commit 范围证据链闭合。
- **③ 数据面零变更：证成**——修复点为内存中 agent.options 路由写，零存储格式/用户数据触碰（代码审查维度② + 修复函数体直读）。
- **④ 行为面：独立裁决为缺陷修复而非破坏**，理由四条：(a) 旧行为违反更高优先级既有承诺——「会话内手动选择永远优先（用户主权）」自 v0.4.2 特性面即在（README 特性列表），被子代理路径击穿属缺陷，修复 = 恢复契约而非变更契约；(b) 零能力收窄——需旧行为（subagent 固定走预设主模型值）的用户有完整逃生口：显式配置 cfg.subagent（M3 断言在位证明显式配置仍优先）；(c) v0.4.2 时代文档句「继承主预设模型」被取代一事已在 CHANGELOG 修复节「文档」bullet 显式披露，非隐藏变更；README L158 旧短语与 L165 精确定义共存不矛盾（代码审查已裁定，本审查员直读确认）；(d) 语义与版本位均为报障用户本人裁决（2026-09-10 发布裁决在案 plan-tracker L26）。
- 0.x 阶段版本纪律惯例（v0.4.5 版本说明立版：「以用户裁决 + 惯例覆盖 semver 严格口径」）在案，本版未动用该宽松面（PATCH × bug fix 本就严格合规）。

## 八、版本号合规

**PATCH 合规。** 0.4.5 → 0.4.6：顺序递进无跳号（semver §6/§8）；变更内容 = 单点 bug fix（FIX-032）+ 发布三件套，无新功能面、无 API 变更 → 严格 semver 下 PATCH 即正解（无需动用 0.x 惯例宽松面）；bump 理由充分（用户发布裁决 2026-09-10「先提交修改并推送小版本承载修改」+ CHANGELOG L35 载明）。

## 九、核验方法边界（诚实披露）

- **直读核验**: 全部文件面事实（package/CHANGELOG/README/治理三件/preset-defaults.js 修复态/tests 判别节/lib 清点）+ .git 引用事实（HEAD/origin/tags/reflog）。
- **机录采信（未独立复跑，均经旁证交叉）**: E-2 exit 0（旁证 = 套件清单/判别节在位）、E-1 smoke、E-3 五数字（旁证 = lib 15 清点）、tag v0.4.5 注释对象解引用（三方印证）。
- **未验证（如实标注）**: 回滚专项降级演练（四-③）；E-5 资产上传/链接终验（未到时点——W-1 为其设门）。

## 十、结论重申

- **APPROVED_WITH_NOTES，`unresolved_blockers=0`**——v0.4.6 发布候选就绪，可进入 E-5。
- 前置条件（随 E-5 执行，均非候选缺陷）：W-1 资产名逐字 + 200/Content-Length 终验（MUST）；W-2 E-5/E-6 合账 EV 覆盖 E-1~E-6（MUST）；S-1 边缘披露或裁定留痕（建议）；S-2 tracker 总览刷新（建议）。
- 复审条款：若 E-5 前发生补正（如采纳 S-1/S-2），按 M7.4 同一 Reviewer 复审（round+1，注入本报告路径 `.governance/review-REL-012-R0.md`）。
