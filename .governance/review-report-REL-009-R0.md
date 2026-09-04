# 审查报告：REL-009 E-4 R0 — v0.4.3 发布就绪独立审查

> **round**: 0（首审） · **审查对象**: v0.4.3 发布候选（HEAD = `c84ea4a`，未 push；发布范围 v0.4.2 tag `e91f77d`..HEAD 共 3 commits：`7965c9d`/`c2be6dc`/`c84ea4a`） · **日期**: 2026-09-04 · **审查方式**: 纯只读（read/grep/glob，零命令、零写操作、零子 agent、零用户交互）

---

## 一、审查结论

## **APPROVED_WITH_NOTES** — `unresolved_blockers=0`

- BLOCKING = 0；WARNING ×4（W1 CHANGELOG 摘要前瞻措辞·附发布约束 / W2 已知问题节断链 / W3 bump 层级张力 / W4 E-3 同构口径精确化）；SUGGESTION ×2
- 硬门槛：发布检查清单 100% PASS ✓｜回滚方案存在且可执行 ✓｜CHANGELOG 用户视角完整 + breaking 显式 ✓｜无未关闭 BLOCKING ✓｜`unresolved_blockers=0` ✓
- **发布约束（不阻本审查结论、阻 E-5c tag）**：E-5b 在线 git spec 隔离 E2E 必须执行且通过后方可 tag（version-plan L43 / R0 遗留项 1 / EV-144 附注三重绑定）；E-5b 失败 → 按回滚 §5-2 处理，且须先修正 CHANGELOG/README 对应声称再发布，不得带未验证声称打 tag。

## 二、8 个必查项逐项结论

### ① 无过度宣示 — PASS（附 W1）

| 用户面声称 | 证据锚点 | 判定 |
|---|---|---|
| "dsh plugin --profile web add/update/remove 官方管理命令真实可用（此前该通道装而不激活）"（CHANGELOG L10） | EV-144①-④（隔离 E2E：add 双登记无 warning / update 双登记保持 / remove 双摘除 / --dump-default-config 32KB 配置含 dsh-agent-router）+ EV-146③（tgz 解包目录 add 双登记）+ F-1（无声明→warning 不激活的现状锚定，version-plan L14） | ✓ 机制可用有 E2E 实证；"官方"=宿主自带命令（F-1：宿主 dsh plugin = pnpm 薄转发器；R0 ② 命令保真度 PASS），属实 |
| "README 安装文档双通道化"（L10/L14） | README L28-67（方式一标准管理 4 象限命令矩阵）/L103-121（迁移三步）/L69-101（方式二保留）/L123-136（AI 安装段）实文 | ✓ |
| "README 离线安装链接勘误——无 v 前缀 / npm pack 形态 package/"（L18） | EV-143 附记勘误×2 + version-plan L44（GitHub API 资产名勘正）+ README L39/L47/L54/L87（package/ 目录实文） | ✓ |
| "每条命令经隔离环境实测"（L10 摘要） | 实测覆盖：离线 file: add（EV-144①④ dev 树 + EV-146③ tgz 解包目录）/ update（EV-144②）/ remove（EV-144③）；**未实测：在线 git spec add（README L36/L37/L132）——绑 E-5b，push 前结构性不可测（origin/main 无 dsh.bundle 声明，测必"装而不激活"）** | ⚠ W1：提交时点为前瞻表述，无"随发布链执行"限定注（对比同节 L33 对 E-2/E-3 的先例处理）；非阻塞理由与约束见发现清单 |
| "与 install.ps1 宿主平面行逐字一致——两通道注册同一对服务"（L14） | cordis.patch.yml L7-11 实读 + R0 ①（vs install.ps1 L163-167/L186-190 逐字比对） | ✓ |
| "smoke 1087→1098 零回退"（L23） | EV-143（+11 精确吻合）+ EV-145（E-2 复跑 1098=基线） | ✓ |
| 内部注解（L14：commit 7965c9d / REVIEW-EVO-015-R0 APPROVED_WITH_NOTES / EV-143~144） | 全部实存可查 | ✓ |

### ② README 链接完整性（P2-2 闭环）— PASS

- 下载链接 ×2（README L41 方式一 / L86 方式二）：`releases/download/v0.4.3/dsh-agent-router-0.4.3.tar.gz`——tag `v0.4.3`（带 v）+ 资产名 **无 v 前缀**。
- 三方逐字一致：E-3 产物（EV-146"无 v 前缀改名，SHA256 F3FA8867…2219"）= version-plan E-5c 门禁（L44"asset `dsh-agent-router-0.4.3.tar.gz`——无 v 前缀…R0 P2-2 勘正"）= README 链接 ✓
- tar 命令 L46/L53/L91/L98 与资产名一致；L82 "如 `v0.4.3`" 为 git ref 形态（tag 带 v），正确。
- 版本残留扫描（grep README 全文）：`0.4.2` 字面 **0 命中**；v 前缀资产名 `dsh-agent-router-v0` **0 命中**；badge L7 = v0.4.3 ✓
- P2-2 闭环确认：version-plan L44（资产名已勘正）+ L53（回滚披露已改为 P3-5 口径 404 措辞）均已同步 ✓

### ③ CHANGELOG 质量 — PASS（附 W2）

- **格式**：摘要/新增/修复/变更/破坏性变更/版本说明六节齐备，对齐 v0.4.2；缺「已知问题」节 → W2（SKILL 硬门槛关键段=新增/变更/修复/breaking，全覆盖，非阻塞）。
- **破坏性变更"无"四证**：
  - ①配置面零新增节：`dsh.bundle` 为包清单声明（package.json L16-19 实读；宿主 `dsh plugin` 通道读取，F-1）非用户配置项；lib/schemas.js 零触碰（R0 ⑤）✓
  - ②依赖面：deps 6 项 + peerDeps 8 项 rc.8（package.json L52-69 实读）与 v0.4.2 状态一致、仅 files +1（L46 cordis.patch.yml）——diff 级比对未复跑（无 git 命令权限，如实标注），由 R0 ⑤ 范围纯粹性（7965c9d 仅四文件、package.json 仅增 dsh.bundle 声明与 files 项）+ 当前文件实读佐证 ✓
  - ③数据面零变更：lib/* 零触碰（R0 ⑤），无存储格式面 ✓
  - ④行为面零强制：R0 ⑧ 源码级——loadProfile 仅映射 `dsh.profile.bundles`（dsh-app-boot L546-556），脚本通道该列表不含本包、不读 dsh.bundle 字段；EV-144⑤/EV-146⑤ 真实环境 hash 前后零变更 ✓
- **发布范围 3 提交**：CHANGELOG L32 自洽（"E-1 时点实采 = 2，加本提交"=3）；与任务上下文及 plan-tracker L76/L77 一致；git rev-list 计数未复跑（无命令权限）——如实标注，以 CHANGELOG E-1 时点实采声明 + tracker 行佐证。

### ④ 回滚方案可执行性 — PASS

version-plan §5（L50-54）三场景逐步核验：①E-0~E-2 失败→本地 revert（未 push 零影响，分钟级——现 E-0~E2 已全过，为有效兜底）；②E-5b 失败→**不打 tag** + main hotfix 重走（<1h），并明示"README 方式一 v0.4.3 链接在 E-5c 前为 404——R0 P3-5 已披露，push 与发布同窗执行即消除；拖延超窗则在 Release notes 披露"——与 R0 P3-5 披露逐字自洽 ✓；③发版后缺陷→v0.4.4 热修同链，标准管理下用户 `update` 即收 ✓。数据回滚 N/A（四证③数据面零变更）；时间 SLA 对 git 发行开发者工具可接受；"演练"未单列——场景 1 为常规 git revert（项目 rework 先例多次）、场景 2 为弃权动作（不打 tag）、场景 3 同链 E-1~E-3 已实走一遍，可接受。

### ⑤ 版本号合规 — PASS（附 W3）

0.4.2→0.4.3（PATCH）：semver 0.x 段规范宽松（initial development，anything MAY change）；版本位经用户裁决明示（version-plan L4 ②"v0.4.3 立即发布"）；理由已记录（CHANGELOG L31）；运行时零变化（lib/* 未动，R0 ⑤），新增面为打包声明 + 文档通道——合规可维持。但按项目自身先例（v0.3.1"0.x 阶段 MINOR 承载新能力语义"/v0.4.2 MINOR/v0.3.3 以"无新增功能面"为由 PATCH）存在张力 → W3 记录在案，非阻塞。

### ⑥ Feature Flag — PASS（"无新 flag"属实）

package.json 无新配置键（`dsh.bundle` 为宿主安装期清单声明，非运行时 flag）；lib/schemas.js 零触碰（R0 ⑤）→ 配置面零新增；README 开关面仅既有总开关（L146）；CHANGELOG v0.4.3 段无任何 flag/开关新增表述；kill-switch 三层（router.enabled / 账号停用 / 登出删除）零变化。无新 flag →「flag 关闭验证」门槛以空集满足。

### ⑦ 遗留义务有主 — PASS

- **E-5b**：version-plan L43（"在线 git spec 隔离 E2E（新步骤，v0.4.3 特有）…README 在线命令真实性证明（push 后 tag 前时序）"）+ R0 遗留项 1（"绑定 REL-009 E-5b…不得跳过"，报告 L111）+ EV-144 附注（L471）——三重绑定 ✓
- **E-5c 资产名门禁**：version-plan L44 门禁列（"README 链接与 asset 名一致"）✓
- **v0.4.4 候选台账行**：plan-tracker L61 实存——P2-1（断言子串→整行收紧）+ P3×5 逐条列出（P3-5 标注"已由发布闭环消除（随发布关闭）"）+ 既有 v0.4.2 候选批延续，状态"已记录待排期" ✓（P3-5 前瞻措辞 → S2）

### ⑧ E-3 边界披露可接受性 — PASS（附 W4）

EV-146（L476）内联披露四要素齐备：失败现象（首轮 4 模块 FAIL）+ 归因（隔离边界——宿主运行时提供的二级传递 peer 缺失）+ 补链方式（宿主缓存树只读）+ client.js node --check 浏览器模块形态披露。「与 v0.4.2 E-3 同构口径」精确核验（EV-141 原文，L462）：**同构者为验证终态口径**（15/15 = 14 import + client.js node --check）；**不同构者为隔离路径纯度**——EV-141（v0.4.2，npm install 路径）import 冒烟无补链直达全绿，EV-146（v0.4.3，宿主 pnpm add 路径）经宿主缓存补链 → W4 精确化记录。结论成立性：安装断言（add → 双登记无 warning，EV-146③）在补链前已通过；import 边界为环境性而非产品性（lib/* 本版零变化 → 运行时行为与已真机验证的 v0.4.2 完全 parity）；真实环境 hash 前后零变更。披露充分，「隔离环境安装冒烟（环境变量重定向至临时目录）通过」结论成立。

## 三、4 维度结论

| 维度 | 结论 | 要点 |
|---|---|---|
| 发布就绪 | ✓ PASS | E-0~E-3 全过有证（EV-143~146，evidence-log L470/471/475/476）；产品任务 EVO-015 终态 R0 APPROVED_WITH_NOTES/0（plan-tracker L76）；BLOCKING=0；剩余 E-5a/b/c、E-6、E-7 有序有主（plan-tracker L77"E-1~E-3 完成，E-4 审查中"）；附 W1 发布约束（E-5b 先于 tag） |
| 质量门禁 | ✓ PASS | E-2 十八面全绿零回退（EV-145：smoke 1098=EV-143 基线精确一致 + 14 计数套件逐一列出 + 4 聚合模块）；无 CI 为既有披露事实（v0.3.0 起延续），本地全量门控为回归保护 |
| 回滚能力 | ✓ PASS | 三场景可执行、E-5b 失败分支与 P3-5 404 披露自洽、数据回滚 N/A、时间可接受（详见必查项④） |
| 用户影响 | ✓ PASS | breaking=无（四证成立）→ 迁移指南 N/A；反向提供主动迁移段（README L103-121 先清后装三步 + L121 双重注册风险明示）；升级零操作（双通道并存零强制）；用户通知=CHANGELOG+README（发布页随 E-5c）；监控 N/A（纯插件无服务端）；已知问题披露断链 → W2 |

## 四、发现清单

| # | 级别 | 位置 | 描述 | 建议/约束 |
|---|---|---|---|---|
| W1 | WARNING | CHANGELOG.md L10 摘要（同型表述 plan-tracker L76"+ 隔离 E2E 实测每条命令"） | "每条命令经隔离环境实测"在 HEAD c84ea4a 时点为部分前瞻：在线 git spec add（README L36/L37/AI 段 L132）未实测——push 前结构性不可测（origin/main 无 dsh.bundle 声明，add 必"装而不激活"），已绑 E-5b；实测覆盖实为离线 file: 全命令 + update/remove。措辞未带"随发布链执行"限定注（对比 L33 对 E-2/E-3 先例）。**非阻塞理由**：E-5b 为 tag 前强制门（三重绑定）；README v0.4.3 链接在 E-5c 前为 404（P3-5）——claim 失真期间无用户可到达的 v0.4.3 发布面；tag 时点断言即为真 | **发布约束**：E-5b 必须执行且通过方可 E-5c tag；E-5b 失败 → 回滚 §5-2，且须先修正 CHANGELOG/README 对应声称再发布。可选（S1）：E-5 窗口内为摘要补限定注 |
| W2 | WARNING | CHANGELOG.md v0.4.3 段（L6-33） | 「已知问题」节缺失——v0.3.1~v0.4.2 五个连续版本均携带延续披露（CI 缺位 / 宿主域 GUI 预设下拉 / resume 状态缝隙 / P3 台账），v0.4.3 断裂；上述事项对 v0.4.3 用户仍成立。SKILL 硬门槛关键段（新增/变更/修复/breaking）全覆盖，故非阻塞 | 下版恢复延续披露；或 E-5 窗口内随产品提交补一节（Release Agent 裁量，非本审查前置） |
| W3 | WARNING | CHANGELOG L31；package.json L4 | 0.4.2→0.4.3（PATCH）承载新增能力面，按项目自身先例（新能力面=MINOR）应为 0.5.0；维持理由：semver 0.x 宽松段 + 用户裁决明示（version-plan L4 ②）+ 理由已记录（L31）+ 运行时零变化（新增面为打包声明+文档通道） | 无需动作；记录在案；后续 bump 层级判定建议回归"新能力面=MINOR"先例或明示修订该口径 |
| W4 | WARNING | evidence-log EV-146（L476）vs EV-141（L462） | 「与 v0.4.2 E-3 同构口径」需精确化：同构者为验证终态（15/15=14 import+1 语法检查）；不同构者为隔离路径——EV-141（npm install 路径）无补链直达全绿，EV-146（宿主 pnpm add 路径）首轮 4 模块 FAIL 经宿主缓存树只读补链。披露本身充分（四要素内联），补链只读、lib 零变化佐证行为 parity | 无需动作；后续 E-3 报告区分「口径同构」与「路径纯度」两维表述 |
| S1 | SUGGESTION | CHANGELOG.md L10 | 可在 E-5 窗口为摘要补限定注，如"每条命令经隔离环境实测（在线 git spec 通道随发布链 E-5b 复验）"，与 L33 先例格式对齐 | 可选 |
| S2 | SUGGESTION | plan-tracker.md L61 | P3-5 行"已由发布闭环消除（随发布关闭）"为前瞻表述（发布未发生） | E-6/E-7 收尾时置为终态措辞并核实 404 窗口确已消除 |

## 五、硬门槛裁决

| 门槛 | 结果 |
|---|---|
| 发布检查清单 100% PASS | ✓（8 必查项全 PASS，各附锚点；未复跑项如实标注"未验证"） |
| 回滚方案存在且可执行 | ✓（三场景 + 自洽性核验） |
| CHANGELOG 用户视角完整 + breaking 显式 | ✓（关键四段全覆盖；breaking"无"四证成立；W2 为非关键段披露断链备注） |
| 无未关闭 BLOCKING | ✓（BLOCKING=0） |
| `unresolved_blockers=0` | ✓ |

**复审协议提示**：本结论为通过终态（APPROVED_WITH_NOTES / unresolved_blockers=0），复审链可闭合。W1 发布约束为 E-5c tag 前置条件（非本审查对象缺陷返工项），不触发 NEEDS_CHANGE 复审轮；由 Coordinator 在 E-5b/E-5c 执行中落实。

— Release Reviewer Agent（只读审查完成：未执行命令、未写文件、未创建子 agent、未与用户交互）
