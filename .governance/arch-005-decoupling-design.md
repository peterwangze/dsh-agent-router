# ARCH-005 — DSH 宿主版本依赖解耦架构设计（ADR + 蓝军推演）

- **生成时间**: 2026-10-16（初版，commit `fba63ea`）；**返工修订 2026-10-17**（双审 NEEDS_CHANGE 后，见下方修订记录）
- **任务**: ARCH-005（P0）——宿主版本依赖解耦：使未来宿主升级（含 silent update）不再导致插件失效，或至少失效可观测、可低成本适配
- **用户目标（原话，2026-10-16）**: 「先完成新版本的适配，并进一步完成版本依赖的解耦，避免每次升级插件都会失效」
- **插件侧源码（现状锚点来源）**: `D:/AI/agent/deepseek/plugins/router`（v0.5.0，`lib/` 15 模块 + `lib/host-abi/` 8 文件 + `tests/` 26 套件）
- **宿主侧源码（一手只读权威）**: `C:/Users/peter/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh`（**0.2.0-rc.2**，npm 全局安装；嵌套 `node_modules/@deepseek-ai/` 287 个目录条目——**dsh-* 包全系 0.2.0-rc.2**，cordis 4.0.5 / schemastery 3.18.5 随树〔非 0.2.0-rc.2〕——P3-1 处置口径）
- **事实来源标注**: 本仓断言全部实读（file:line）；宿主侧断言全部为撰写时一手探针（只读零写入，2026-10-16）；**返工修订涉及面（app-boot 装载门 / dsh-llm 双树对照 / semver 判定 / `_npx` 树形态）于 2026-10-17 二次实读**；标注「tracker 记载」的引用 plan-tracker ARCH-005 行。与 Analyst 的 diff 清单并行——本设计不依赖其产出；两侧事实冲突时以一手实读为准并显式标注。
- **输出边界**: 本文档为唯一产出物；不修改任何产品代码/测试/package.json/治理状态文件；最终选型留给用户/审查链（本文给推荐 + 依据）。
- **角色纪律**: Architect Agent——只出方案不改产品代码；不与用户直接交互；决策型任务不做最终决策。

### 修订记录（双审返工轮）

| 轮次 | 审查方 | 结论 | 处置 |
|---|---|---|---|
| 初版 R0 | — | — | 2026-10-16 产出（commit `fba63ea`） |
| 双审返工 | Design Reviewer（`review-ARCH-005-R0-DES-input.md`）+ Requirement Reviewer（`review-ARCH-005-R1-REQ-input.md`） | 双 **NEEDS_CHANGE** | **2026-10-17 本修订**——逐 finding 处置如下表；方案 B 推荐与 ARCH-004 零推翻声明维持（两审查均确认成立），修订不扩大推荐面 |

**逐 finding 处置状态表**：

| Finding | 级别 | 处置 | 修订位置 |
|---|---|---|---|
| R0 **P1-1**（宿主装载门控缺席于事实基础） | P1 | **已修复**——实读 `dsh-app-boot/lib/index.js` :286/:292-300/:320-322/:325-430/:930-931/:940-945（含 `peerDependenciesMeta` 全文件 0 命中）+ 本机 semver 复算后重写；「零 enforcement/记录性」叙事废弃 | §0.1 F-H/F-I、§0.2 D1、§0.3 FIX-003、§2-A/B 四维-a、§2-B 四维-b（regime 边界）、§0.4-9、§4 第 1 轮 B、§5-1、§7.2 首行、§8 背景/决策④、DEC-2 |
| R0 **P1-2**（F-G 编造级锚点错误） | P1 | **已修复**——F-G 整条重写为反向事实登记（本修订双树实读：新旧 `lib/index.js` 同构实体编译产物 2390/2326 行、六方法与导出表在位、`exports` 字段新旧逐字相同 → 7c 不 miss）；§0.2 D3 与 R0 批「F-G 族锚刷新」引用同步清理 | §0.1 F-G、§0.2 D3、§6 R0 |
| R0 **P1-3** = R1 **F-1**（批次完备性/HD-002~004 无承载） | P1/P0 | **已修复**——批次表显式插入适配批 **A1~A4**（每批判别性红绿验收门）；依赖序写死 `R0 → R1 → A1 → A2 → A3 → A4 →（R2、R3 可并行）→ R4 → R5`（批序依据成文）；「0.2.0 适配任务」悬空引用消灭（tracker 无独立行——A1~A4 即适配半边批号） | §6 全表、DEC-5、§1 映射注 |
| R0 **P2-2**（F-A「全体 skip」机制句失实） | P2 | **已修复**——实读 `tests/host-contract.mjs:439-481` + 本机 `_npx` 双树实测（rc.1/rc.3 在场、均含 `dsh-api-remotes/lib/client.js`）后改写：实际行为 = S3/S7 跑在过期 rc.3 副本 + FIX-037 ③ 告警，非全体 skip；核心定性（对 0.2.0 看护失明）不变 | §0.1 F-A、§0.2 D3（连带精化 F-D 表述） |
| R0 **P2-3**（T-1~T-5 未挂批） | P2 | **已修复**——逐项挂接：T-1→A4 前置定性；T-3/T-5→A3 前置验证；T-2→R0 后 additive 核对；T-4→A3 端到端时序观察项；SOP 第 2 步引用该映射 | §6 各批行、§2-B 四维-d 步骤 2 |
| R0 **P2-4** = R1 **F-2**（装载门机器判据缺失/R2 真机口径不明） | P2/P1 | **已修复**——R1/A1 验收门补「隔离冷装装载门」直接判据（沙箱 profile + 0.2.0-rc.2 宿主树 + 断言无 `skipping profile bundle "dsh-agent-router"`；引 :320-322 文案与 :941-945 skippedBundles 形态）；R2 截图改双层口径（发布前本机隔离冷装取证 + 重装后真机复验后置） | §6 R1/A1/R2 |
| R1 **F-3**（schemastery 读数仲裁） | P2 | 仲裁 = **3.18.5**，与本设计 F-B 初版一手读数一致（本修订二次实读复核仍 3.18.5）；diff 清单侧勘正归 Analyst 返工（P1-4），本任务不修改该文件 | §0.1 F-B（既有，保持） |
| R1 **F-4**（蓝军两 regime 混淆） | P2 | **已修复**——§2-B 四维-b 显式区分 gate-block（minor 跳位拒载——插件侧不可观测，靠宿主 skip 警告+雷达）vs gate-pass-unknown（rc/patch 内跳位过门——三态徽章可达），本机 semver 复算支撑（0.3.0=false / 0.2.1-alpha.5=true / 0.2.0=true）；蓝军第 1 轮 B 格、§5-1、§7.2 首行按此修正 | §2-B 四维-b、§4 第 1 轮 B、§5-1、§7.2 |
| R1 **F-5**（雷达对预发布通道失明） | P2 | **已修复**——查询规格改 `dist-tags --json` 枚举（latest + next/alpha 等预发布 tag 集合并集比对档案）；DEC-3 扩展该项裁决面 | §2-B 四维-c、§6 R4、DEC-3 |
| R1 **F-6**（用户视角四场景无位） | P2 | **已修复**——A3 验收门 + 重装后真机复验清单显式纳入四场景（0.1.5 老配置可读可写 / stats 持久化跨重启 / 热同步不依赖重启 / 快速连续操作） | §6 A3、§6 R5 |
| R1 **F-7**（复验清单无留位） | P2 | **已修复**——R5 checklist 模板留「重装后真机复验」节，条目来源 = F-2（装载门）+ F-6（四场景） | §6 R5、§2-B 四维-d 步骤 5 |
| R1 **F-8**（CHANGELOG 零承载） | P3 | **已修复**——SOP 第 5 步 + R5 checklist 补 CHANGELOG 义务行 | §2-B 四维-d 步骤 5、§6 R5 |
| R0 **P3-1**（「287 包全系」自相矛盾） | P3 | **已修复**——「dsh-* 包全系 0.2.0-rc.2（cordis 4.0.5/schemastery 3.18.5 随树）」 | 头部、§0.1 F-B |
| R0 **P3-4**（7c 六方法 vs F-C 七方法口径） | P3 | **已修复**——两基线常量口径统一说明（`LLM_ADAPTER_PROTO_BASELINE`:178 = 6 方法 prototype 集；`ADAPTER_CONTRACT_BASELINE`:180 = +stream；stream 不入 7c 锚定集） | §0.1 F-C |
| R0 P1-4 / P2-1 / P3-2 | P1/P2/P3 | Analyst 侧返工处置（schemastery 值 / A-11 锚 :2847 / HD-005 表区间）——不属本文件修改面，此处仅登记 | —（登记） |
| R0 P3-3（7a 正则引号形态提示） | P3 | **复核存疑，登记不改**——本修订实读新树 `dsh-api-remotes/lib/types/remote-events.js`（7a 实际读取的文件）为**单引号**形态（`event: 'agent-preset/selected'`），现行正则 `:865` 可命中；双引号形态见于 `lib/index.js` 编译面（非 7a 读取对象）。R0 批重写 7a 为单向消费断言时以实施时实读为准 | —（登记于 R0 批注） |

---

## 0. 事实基础（设计输入自勘）

### 0.1 宿主 0.2.0-rc.2 一手探针事实（2026-10-16，全局树只读）

| # | 事实 | 锚点（宿主树相对 `…/dsh/node_modules/@deepseek-ai/`） | 对设计的含义 |
|---|---|---|---|
| **F-A** | **宿主安装位置换代**：0.1.5 时代宿主经 npx cache（`%LOCALAPPDATA%\npm-cache\_npx\…`）供给；0.2.0 为 **npm 全局树**（`%APPDATA%\npm\node_modules\@deepseek-ai\dsh`，顶层仅 dsh 一包，全家桶嵌套其 `node_modules` 内） | `tests/host-contract.mjs:439-481` 候选链 = `DSH_HOST_SOURCE` > `DSH_HOST_PACKAGES` > `_npx` 降序——**无 npm 全局树候选**。本机实测 `_npx` 在场两树（0.1.5-rc.1 与 0.1.5-rc.3，均满足 :451 命中条件 `dsh-api-remotes/lib/client.js` 存在）→ 降序取首命中 **0.1.5-rc.3 树**——实际行为 = **S3 宿主侧半边 + S7 增强组跑在过期 rc.3 副本上**，且 FIX-037 ③ 版本一致性告警（:473-475 mismatch 分支：rc.3 ≠ 基线 rc.2）在位告警，**并非全体 skip**〔修订——初版机制句失实，P2-2 处置〕 | **本次看护面失明的第一根因不变——不是判据失效，是靶子解析失明**：S3/S7 结论仅对过期副本成立，对 0.2.0 宿主面零看护。任何方案必须先修靶子可达性（R0 批加 npm 全局树候选） |
| **F-B** | `@deepseek-ai/` 嵌套目录 287 个条目——**dsh-* 包全系 0.2.0-rc.2**；随树非 0.2.0-rc.2 者 = `cordis 4.0.5`（dsh 声明 `~4.0.4`）、`schemastery 3.18.5`（dsh 声明 `~3.18.4`，3.18.5 在范围内）〔P3-1 处置口径〕 | 各 package.json version 实读（本修订 2026-10-17 二次实读复核：schemastery 仍 3.18.5、cordis 仍 4.0.5） | tracker ARCH-005 行记「cordis 4.0.1→4.0.5、schemastery 3.18.1→3.18.4」——cordis 一致；**schemastery 实测 3.18.5**（Analyst 清单记 3.18.4，双审查 + 本设计三方仲裁 = **3.18.5 为准**——R0 开工时单点重读定谳） |
| **F-C** | **关键契约面大量存续（本次为增量漂移为主）**：LlmAdapter 全 7 方法（providerInfo/providerRetryPolicy/imageRequestPricing/listModels/resolveModel/prepareCall/stream）在位；dsh-llm/message 8 导出全在（**新增 `createDeveloperMessage`**）；六个 wire schema 符号（llm_listConfigurableProviders / llm_listProviders / session_modelCatalog / settings_describe / credentials_describe / agentPresets_list 的 `*_result$schema`）全在；`sessionController.selectModel`、`selectionFor(agent)`、`stateOf(agent.session,'modelSelection')`、`directoryFor(sessionId)`、InputState `attachmentIds`（无 imageIds）全在。**口径统一〔P3-4 处置〕**：本行「7 方法」= `ADAPTER_CONTRACT_BASELINE`（`tests/host-contract.mjs:180` = prototype 6 方法 + stream——stream 为抽象声明不在 LlmAdapter.prototype，FIX-001b F2 先例注释在位）；S7 7c 锚定集 = `LLM_ADAPTER_PROTO_BASELINE`（:178，6 方法 prototype 集，**不含 stream**）——两常量各司其职，非口径冲突 | `dsh-llm/lib/types/index.js`、`dsh-llm/lib/types/message.js`、`dsh-api-remotes/lib/client.js`、`dsh-api-session-controller/lib/index.js` + `lib/types/agent.js`、`dsh-client-ui-model-selection/lib/types/client/service.d.ts`、`dsh-client-ui-conversation/lib/types/client/contract/input.d.ts` 逐项实读 | ARCH-004 D2/D3 建立的契约基线**主体未穿**——本次失效的痛点在装载门（HD-001）、声明面与看护靶子面，而非全部运行面 |
| **F-D** | **转发事件白名单 19 → 27 项纯增量**：旧 19 项全部存续；新增 `deepseek-account/session-expired`、`deepseek-account/model-sign-in-required`、`credentials/record-updated`、`permission-presets/catalog-changed`、`plugin-manager/changed`、`plugin-manager/install-log`、`plugin-manager/install-state`、`schedule/changed` | `dsh-api-remotes/lib/types/remote-events.js` 逐项实读（本修订计数复核：rc.3 树 19 项 / 0.2.0 树 27 项） | 插件镜像 `FORWARDED_EVENT_ALLOWLIST`（`lib/host-abi/events.js:50-70`，19 项）**单向消费断言仍绿**（消费事件全在宿主表内）；S7 7a 的**镜像全等断言**（`tests/host-contract.mjs:866`）现状对 rc.3 副本（19 项）**仍绿但看护的是过期面**，靶子刷新指向 0.2.0 树后即红（27≠19）——属「宿主超集增量」判据边界设计的直接输入 |
| **F-E** | **宿主包拆分实证**：`dsh-agent-presets`（复数）已不存在 → 拆为 `dsh-agent-preset` + `dsh-agent-preset-registry`（各 0.2.0-rc.2）；事件 `agent-preset/selected` 仍居白名单首项 | 包表实读 | 「宿主包拆分合并」不是假想蓝军场景，**本次升级已实际发生**。锚点以「包名+文件+符号」登记的判据（FIX-043 批 A 去行号形态）对此类漂移的耐受度需要设计确认 |
| **F-F** | **宿主自带 plugin-manager**：`dsh-plugin-manager` + `dsh-client-ui-plugin-manager` 在场；README 自述「install, remove or select bundles from the Web sidebar」；实现走 **pnpm + profile 目录 node_modules + pnpm-lock.yaml**（`lib/index.js:619` `join(dir,"node_modules",name)`；README.zh.md:133 提及 pnpm 缓存与 `dsh plugin instal…` 命令）；新增 `plugin-manager/*` 转发事件 3 项 | 包实读 | 安装通道官方化：未来插件可能经宿主 plugin-manager 以 pnpm 装入 profile——**插件 dependencies 会按声明范围从 registry 现装**（见 F-I 混装）；且 pnpm 对 peerDependencies 的处理与 npm 安装器不同（auto-install/warn），声明面策略必须考虑 pnpm 语义 |
| **F-G** | **〔返工修订——P1-2：初版整条证伪作废〕dsh-llm 内部布局「漂移」不成立，实为新旧同构双编译面**。初版四项断言（「lib/index.js 已改为 re-export」「类本体移至 lib/types」「exports 子路径面扩充」「S7 7c 会 miss」）经本修订双树实读**全部证伪**。实况：新树 `dsh-llm/lib/index.js` 为 **2390 行实体编译产物**（旧树 2326 行同构形态——内联全部源码非 re-export；六方法 providerInfo:1676 / providerRetryPolicy:1687 / imageRequestPricing:1697 / listModels:1706 / resolveModel:1718 / prepareCall:1734 与 registerAdapter:1833 全在位；末行导出表含 LlmAdapter/BlockAssembler）；`lib/types/index.js` 为**新旧并行的编译面**（两树均有 `export class LlmAdapter`——新 :141 / 旧 :140，非「移走」）；`package.json` 的 `exports` 字段**新旧逐字相同**（./invariant、./types、./brand、./assistant-stream、./typert、./remote 等子路径旧树已有，无扩充） | 双树 `dsh-llm/{package.json, lib/index.js, lib/types/index.js}` 对照实读（2026-10-17） | **S7 7c 锚 `hostRead('dsh-llm','lib','index.js')` 含方法声明在 0.2.0 不会 miss**。「锚点漂移」作为**通用风险面**保留（真实实证样本 = `lib/host-abi/version.js:19` 注释锚 dsh-llm-pi-ai:2344 → 新树实测 :2490 的行号漂移），但 **dsh-llm 布局漂移无实证样本**——R0 批「锚刷新」项相应收窄为实证漂移清单（见 §6 R0） |
| **F-H** | **〔返工修订——P1-1〕0.2.0 起宿主 app-boot 存在 peerDeps 装载门（硬 enforcement）**：`dsh-app-boot/lib/index.js:286` `evaluatePluginCompatibility(manifest, exemptions, runtimeVersion)` 对 manifest `peerDependencies` 中全部 `@deepseek-ai/dsh` / `dsh-*` 条目逐项 `semver.satisfies(runtimeVersion, range, {includePrerelease:true})`（:292-300——:294 按包名前缀过滤、:295-299 `workspace:^/~/\*` 特判指向当前运行时）；不满足且无豁免 → `loadProfileDirectory` :930-931 `throw pluginCompatibilityWarning`（:320-322——文案含 crash/data-loss 风险提示与 `dsh plugin allow-version` 豁免法）→ :940-945 catch 进 `skippedBundles`，**插件整层被宿主拒载**。豁免通道 = profile `compatibility.json` 体系（:325-430；`setProfileVersionExemption` :421 需 `--accept-risk`，键 = 精确 `name@version` × 精确宿主版本）。**门控只遍历 `peerDependencies` 键——该文件 `peerDependenciesMeta` 0 命中，optional 标记不解除门控**；`dependencies`（非 peer）不在门控范围（cordis/schemastery 升版因此不触发）。本机复算（新树 semver 实跑）：`satisfies('0.2.0-rc.2','^0.1.5-rc.2',{includePrerelease:true})` = **false**——插件 8 项 peerDeps 全不过 | `dsh-app-boot/lib/index.js` 上述行实读 + semver 本机复算；插件 `package.json:64-73` 8 peerDeps | **当前插件在 0.2.0-rc.2 宿主上的第一死因 = 整层拒载（= Analyst HD-001）**——初版「零 enforcement 持续成立」叙事作废（require/instanceof 侧确仍零 enforcement，但装载层 enforcement 是 0.2.0 新事实）。声明范围从「记录性」升格为**门控钥匙**：R1 基线跳跃（`^0.2.0-rc.2`——复算 satisfies=true）即解除门控的必要动作 |
| **F-I** | **版本混装实证与杀伤路径改判**：本仓 `node_modules/@deepseek-ai/` 仍为 0.1.5-rc.2 旧树（dsh-llm/dsh-tools/dsh-typert-protocol = 0.1.5-rc.2，cordis 4.0.1，schemastery 3.18.1）；插件 `package.json:56-73` 声明 `^0.1.5-rc.2` ×11（deps 3 + peers 8）。0.x caret 钉死 minor → 按旧声明安装**永远装不到 0.2.0** | 本仓 package.json + node_modules 实读；F-F 安装机制；F-H 门控 | **杀伤路径第一顺位改判〔P1-1〕**：0.2.0 下按旧声明的插件**根本到不了运行态**——app-boot 装载门先行拒载（F-H；宿主 stderr 有可观测 skip 警告，非静默）；「混装的隐性风险」退居第二顺位——仅当豁免通道被显式使用（compatibility.json）、或宿主版本落在 peerDep 声明范围内（如 R1 跳跃后宿主出 0.2.x 内版本）而插件局部 deps 副本过旧时发生；「声明失真（基线指向已不存在的世界）」仍是事实，但其后果在 0.2.0 已被门控显式化 |
| **F-J** | 宿主靶子版本一致性判据的现状：`tests/host-contract.mjs:194` `HOST_VERSION_BASELINE`（0.1.5-rc.1/0.1.5-rc.2）与 `tests/host-version-snapshot.mjs:46-51` HOST_BASELINE 由机器一致性断言锁定双份同值 | 两文件实读 | 多基线化改造必须延续「双份常量机器锁定」纪律（FIX-037 R0 P2-1 先例），否则刷新漏改即永久噪声 |

### 0.2 本次（0.1.5→0.2.0）实际穿透点归纳

对照 ARCH-004 四维防御（D1-D4）逐维盘点本次升级的穿透路径：

| 维度 | ARCH-004 资产 | 本次表现 | 结论 |
|---|---|---|---|
| D1 依赖最小化 | 死行删除、记录性声明 | `^0.1.5-rc.2` ×11 全部失真（F-I）；inject 三包仍存续（F-C） | **〔修订——P1-1〕声明面 0.2.0 起被宿主装载门硬门控（F-H）——初版「记录性不炸安装」叙事作废**：不满足且无豁免即整层拒载。D1 资产（依赖最小化形态）仍是适配载体，但语义从「记录」升格为**门控钥匙**——基线跳跃（R1）即解除门控的必要动作（8 项 peerDeps 过门） |
| D2 接口字段解耦 | host-abi 七域 + 降级信封 + 双形态解析 | 契约面主体存续（F-C）——**若插件能过装载门并完成 HD-002/003 适配，运行面大概率不整页崩**（面级降级兜底）；但本次插件死于装载门/apply 期断点（HD-001→HD-002→HD-003 按序暴露），加载/信任面先于运行面失败 | D2 是本次受害最小的维度；需补的是**版本感知**（知道自己跑在未实测基线上） |
| D3 严格校验 | host-contract S1-S7 + version-snapshot | **靶子失明**（F-A 修订：S3/S7 跑在过期 rc.3 副本上 + 版本一致性告警，对 0.2.0 零看护）；白名单镜像全等断言待靶子刷新至 0.2.0 树后即红（F-D，这是**正确行为**——增量登记）；锚行号漂移的真实样本 = version.js:19 pi-ai :2344→:2490（F-G 修订：dsh-llm 布局漂移**无实证**，锚刷新收窄为实证清单） | 判据体系没失效，**观测通道指错了对象**。D3 的升级方向 = 版本矩阵化 + 靶子候选扩充 |
| D4 可调测性 | hostFaceDiagnostics RPC + 健康面板/徽章 + 诊断环形 | 面板可显示面级 degraded，但**无版本三态语义**（不知道「版本不匹配」这件事本身）；宿主升级无人发现直到用户报障 | 需补**版本协商态**与**升级检测通道**（雷达） |

**含义**：ARCH-004 的四维框架无需推翻——本次暴露的缺口集中在「声明面的基线演进机制」「看护面的靶子可达性与多版本矩阵」「运行面的版本协商态」「流程面的升级检测 SOP」四个 ARCH-004 未覆盖/未建满的子面。本设计 = 在 D1-D4 骨架上的**定向扩展**，不是重建。

### 0.3 历史断裂五族与本次状态对照（机制描述与 tracker 记载一致性自勘）

| 族 | tracker 记载机制（plan-tracker ARCH-005 行 + 对应任务行） | 本次 0.2.0-rc.2 同面状态（一手） |
|---|---|---|
| FIX-003 | 宿主静默更新→附件注册行为回归（宿主升级零通知通道，RISK-003 首个实证族） | silent update 模式延续，且 **0.2.0 起失效首形态改变〔P1-1 修订〕**：宿主升级 → 装载门拒载（F-H）——宿主 stderr 有可观测 skip 警告，但**被拒载的插件侧零感知通道**（无任何代码运行机会）；本次用户手动卸载止损即为该族重演。推论：插件侧检测机制（三态/徽章）在 gate-block regime 天然不可达——升级检测必须含**插件外通道**（雷达 + 靶子告警 + 宿主 skip 警告形态识别），见 §2-B 四维-b regime 边界 |
| FIX-028 | `connection.api` 移除→整页崩（面移除族） | 客户端五命名空间面全存续（F-C）；`modelDirectories` 服务在（F-C） |
| FIX-030 | `apiProxy` 服务移除 + delegation 基线变更（服务消失+语义基线双断裂） | `sessionController.selectModel` / `selectionFor` / `stateOf` 链全在（F-C）；apiProxy 仍零注册（预期） |
| FIX-033 | LlmAdapter 契约漂移：0.1.5-rc.2 prototype 新增 `imageRequestPricing` + `prepareCall` 移入原型——adapter-parity 动态枚举守卫红 = RISK-003 类断裂的**活体捕获**实证 | 7 方法全在位（F-C），本次无新增方法；守卫机制有效性有直接先例 |
| FIX-048 | InputState `attachmentIds`→（旧 `imageIds` 消失），插件只读旧字段→贴图接管静默失效 | `attachmentIds` 在、`imageIds` 无（F-C）——**该面本次未再漂移**，S7 7d 双向锚（正向+负向）设计可延续 |

结论：五族机制描述与 tracker 一致；其中 **FIX-003（静默更新）是唯一在本次完整重演的族**——这正是流程面（检测雷达）的直接设计依据。FIX-033 则证明静态守卫在有靶子时能活体捕获契约漂移——看护面投资的既有回报实证。

### 0.4 ARCH-004 已交付资产盘点（P5 复用门禁——禁止推翻重建）

| 资产 | 现状锚点 | ARCH-005 处置（见 §3 逐项） |
|---|---|---|
| host-abi 桶 + 七域（8 文件） | `lib/host-abi/{index,health,version,client-remotes,llm-selection,ctx-services,events,inject-manifest}.js` | 复用主体；扩展 version.js → 版本协商域 |
| 降级信封 + 三错误码 | `lib/host-abi/client-remotes.js:50-54,111-131` | 复用不变（运行面容错判据的承载机制） |
| FaceHealth probe 三时机纪律 | `lib/host-abi/health.js:69-114`（registerFaceProbes/runFaceProbes/faceHealthSnapshot） | 复用；版本协商态挂在同一快照通道 |
| 转发白名单镜像 + 订阅拒绝 | `lib/host-abi/events.js:50-78,161-236` | 复用；镜像语义从「全等」扩展为「单向消费断言 + 增量登记」（F-D 依据） |
| host-version-snapshot（HOST_BASELINE 机制 + 四处刷新点） | `tests/host-version-snapshot.mjs:46-97` | 扩展为多基线档案（不推翻单文件独立入口结构） |
| host-contract S1-S7 六守卫 + 靶子解析 | `tests/host-contract.mjs`（S1 :520-595 / S2 :598-660 / S3 :663-707 / S4 :710-769 / S5 :772-829 / S6 :832-853 / S7 :856-930；靶子解析 :439-501） | 复用全部判据；扩展靶子候选 + 镜像断言语义 + 锚档案化 |
| CI 门控单入口 | `.github/workflows/ci.yml`（`node tests/run-all.mjs` 单 job） | 扩展 matrix + 雷达 job（同入口命令复用） |
| README 兼容矩阵 | `README.md:138-142` | 扩展为「支持基线集」矩阵 |
| peerDeps 记录性语义（ADR-ARCH-004-A） | decision-log（已裁决） | **修订〔P1-1〕**：「插件侧不依赖 enforcement」半边延续；「宿主侧零 enforcement」被 0.2.0 装载门终结（F-H）——声明范围 = 门控钥匙（R1 跳跃解除）；optional 不解除门控（DEC-2）；修订随 ADR-ARCH-005-A 写回时关联登记 |
| 诊断环形 + hostFaceDiagnostics RPC + 健康徽章 | `lib/host-abi/health.js` + `lib/rpc.js` + 设置页面板 | 复用；扩展返回字段（版本协商态 + 能力档案） |

---

## 1. 目标与设计需求映射

| 用户目标（验收维度） | 功能需求 | 非功能需求 |
|---|---|---|
| 「避免每次升级插件都会失效」 | ① 声明面随宿主基线演进有明确策略与更新机制；② 运行面对 additive 漂移自动吸收、对语义变更显式适配且判据成文；③ 升级检测通道（silent update 不再无感） | 适配成本量化（目标：minor 跳位适配 ≤1 人日——ARCH-004 §7.3 已达 0.5-1 人日/面级漂移，本设计保住并扩展到版本级） |
| 「至少失效可观测」 | ④ 版本协商三态（matched / compatible-unknown / incompatible）用户可见；⑤ 看护面靶子对新安装位置可达；⑥ 失效路径全部产出诊断事件（P8） | 零新增常驻开销（探针惰性纪律延续）；面板徽章不依赖 console |
| 「可低成本适配」 | ⑦ 升级 SOP 五步成文（检测→diff→分级→适配批→发布）并与工具接线；⑧ 看护矩阵化：多宿主基线参数化 + 新基线登记半自动化 | SOP 每步有机器可执行入口（雷达/diff 报告/判据红绿演示） |

**硬约束**：P1（一切断言锚定实读事实）/ P4（测试零回退）/ P5（同一动作多触发来源单路径、旧路径删除、禁止推翻重建 ARCH-004 已审资产）/ P8（失败降级可观测，禁止无限容错）/ P9（能力自证，禁单向信任宿主）/ P10-④（测试桩锚定宿主源码）。

**用户目标三分量 → 实施批映射〔F-1 处置——映射链闭环〕**：① 「先完成新版本的适配」→ R0（靶子/基线）+ R1（声明面）+ **A1~A4 适配批**（装载门收口 / HD-003 codec / HD-002 settings / HD-004 图片直传——§6 批次表逐项验收）；② 「版本依赖解耦」→ R2（协商三态）/ R3（看护矩阵）/ R4（雷达）+ R0/R1；③ 发布承载（版本位随 tracker E-4 独立裁决 / README 矩阵 / CHANGELOG / 每批回滚 / 重装后真机复验）→ R1 + R5 + 发布链。

**容错边界总纲（本设计的「不许无限容错」条款，先于方案陈述）**：

- **可自动吸收（tolerant reader）**：宿主侧**超集增量**——新增方法、新增导出、新增白名单事件、schema 新增未消费字段、新增包/子路径 exports。判据 = 「宿主实读面 ⊇ 插件消费基线面」。吸收必须留痕（能力档案记录 delta + 一次性诊断事件），不许无观测吸收。
- **必须显式适配（fail-loud）**：已消费面的任何**收缩或改名**——方法移除、字段改名/消失、事件除名、参数签名变化、类型变化。判据 = 「插件消费基线面 ⊄ 宿主实读面」。行为 = 静态测试红（dev/CI 靶子可达时）+ 运行时 degraded 信封/徽章 + `host-face-shape` 类诊断事件。
- **禁止的容错形态**：猜测性别名映射（把 `displayName→display_name` 自动映射之类）、跨类型强制转换、catch 后静默沿用旧逻辑——这些会把语义变更伪装成成功，违反 P1/P8。改名永远走人工显式适配 + 判别测试。

---

## 2. 候选方案（ADR 形式，评估标准先定义）

**评估标准（评估前定义）**：① 对五族断裂模式 + 本次四穿透点（§0.2）的覆盖度；② 单次宿主升级的预期适配成本（人日/文件数/是否自动化）；③ 实施风险与回滚粒度；④ 长期维护成本（声明面膨胀度/矩阵规模/SOP 步数）；⑤ 与 ARCH-004 资产的兼容性（复用率/推翻面）。

### 方案 A：多范围声明 + 人工锚刷新（保守最小改）

- **四维-a 声明面**：deps+peers 全部改多范围 `^0.1.5-rc.2 || ^0.2.0-rc.2`——多范围并集使 0.2.0-rc.2 过装载门（F-H 门控逐项 satisfies 含 includePrerelease，`^0.1.5-rc.2 || ^0.2.0-rc.2` 对 0.2.0-rc.2 复算 = true）；README 矩阵记录两个实测基线；peerDeps 保持 required（不改 meta）。
- **四维-b 运行面**：不动 ARCH-004 现状（面级 probe + degraded 信封已天然吸收 additive 漂移——F-C 实证）。不新增版本协商态。
- **四维-c 看护面**：HOST_BASELINE 扩为双版本常量表（0.1.5-rc.2 冻结 + 0.2.0-rc.2 主基线，延续双份机器锁定 F-J）；靶子解析加全局 npm 树候选（修 F-A）；锚与白名单镜像按 0.2.0 实读刷新（F-D + 实证漂移项——F-G 修订后 dsh-llm 布局漂移不入清单）。新宿主纳入 = 人工刷新（沿用测试文件头既有四步刷新程序）。
- **四维-d 流程面**：无新工具。SOP = 现有 README「宿主升级后请同步刷新基线」一句话 + 测试头注释步骤（人工触发）。
- **入选理由**：改动最小（约 4 文件），与 A1~A4 适配批天然合流（A 批即其看护面先行项）。
- **排除理由（不推荐为终态）**：多范围集合随版本数线性膨胀（0.3.0 时 `^0.1.5||^0.2.0||^0.3.0`——多范围声明失去可读性，且门控语义下每个范围段都是「兼容窗承诺」的扩张）；silent update 检测仍为零（FIX-003 族无对策——用户仍是第一发现人）；每次升级的全量 diff 仍纯人工（Analyst 级工作量每次重付）；版本混装（F-I）无任何可见性。

### 方案 B：基线档案矩阵 + 版本协商态 + 漂移雷达（推荐）

核心思想：把「宿主版本依赖」从**散布在 11 个 semver 字符串 + 一组冻结常量**的东西，收敛为**单一「基线档案」（baseline profile）数据结构**，声明面/看护面/运行面/流程面四维全部从这份数据派生——单一事实源（P5）。

- **四维-a 声明面（基线跳跃式）**：deps+peers 保持**单范围**（适配完成后 `^0.2.0-rc.2`），不做多范围并集；「支持哪些宿主版本」的权威表达移交**基线档案表**（含历史实测基线 0.1.5-rc.2〔冻结——契约基线仍在测试树中〕+ 当前主基线 0.2.0-rc.2）+ README 矩阵（人类可读投影）。peerDeps 加 `peerDependenciesMeta: { "*": { "optional": true } }`（决策点 DEC-2）：**作用域限定于安装器行为**——消除 pnpm profile 安装（F-F）下 required-peer 的告警噪声/自动装差异；**对宿主装载门零影响**（F-H：门控只遍历 `peerDependencies` 键、`peerDependenciesMeta` 全文件 0 读取——optional **不解除门控**，解除门控的唯一途径 = 版本范围过 satisfies 或 compatibility.json 显式豁免）。
- **四维-b 运行面（版本协商三态 + 能力档案）**：扩展 `lib/host-abi/version.js` 为版本协商域：
  - `hostCapabilityProfile(ctx)` = `{ versions（复用 hostVersionsOf）, faces: FaceHealth[]（复用 probe 快照）, state: 'matched' | 'compatible-unknown' | 'incompatible' }`；
  - 判定规则（精确语义）：`matched` = 宿主版本组合 ∈ 基线档案表 **且** 关键面 probe 全绿；`compatible-unknown` = 版本 ∉ 档案表 **但** 全部关键面 probe 绿（继续运行 + 健康徽章「未实测宿主版本」提示 + 一次性 `host-version-unknown` 诊断事件——P8）；`incompatible` = 任一关键面 missing/shape-degraded（**面级降级继续运行，不自杀**——ARCH-004 D2 语义延续；徽章 ⚠ 指认具体面）；
  - 关键面清单 = CTX_SERVICES ∪ CLIENT_REMOTE_FACES 派生（复用 `ctxServiceFaceProbes()` 单点派生纪律），不手抄；
  - **协商三态适用边界——两 regime 显式区分〔F-4 处置，semver 本机复算支撑〕**：
    - **gate-pass-unknown**：宿主版本落在声明范围内但 ∉ 基线档案——如 `^0.2.0-rc.2` 下的 0.2.1-alpha.5 / 0.2.0 final（复算 `satisfies(...,{includePrerelease:true})` 均 = true）→ 插件正常装载运行 → **三态徽章 / unknown 诊断事件可达**，三态机制完整生效；
    - **gate-block**：minor 跳位（如 0.3.0 vs `^0.2.0-rc.2`——复算 = false）→ 插件整层拒载（F-H）→ **插件侧一切可观测机制不可达**（三态/徽章/诊断事件无运行机会）；该 regime 的失效可观测性 = 宿主自身 skip 警告（stderr，:320-322 文案形态）+ 雷达/靶子告警（**插件外通道**）。DEC-1 单范围策略的已知代价即在此：minor 跳位窗口期内插件全失效（多范围并集可换回兼容窗但付出声明线性膨胀——§2-A 排除理由）；SOP 第 1 步与 README 矩阵照此口径表述；
  - 容错边界即 §1 总纲：超集增量吸收（如白名单 19→27）自动通过并记录 delta；收缩/改名 fail-loud；
  - 产出并入 `router/hostFaceDiagnostics` RPC（已有通道加字段，报障一键导出自含协商态）。
- **四维-c 看护面（矩阵参数化 + 靶子扩充 + 雷达）**：
  - **靶子解析扩充**：候选链 `DSH_HOST_SOURCE` > `DSH_HOST_PACKAGES` > npm 全局树（`%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai` 探测 + `npm root -g` 兜底）> `_npx` 降序（保留）——修 F-A；靶子多候选时版本一致性告警机制（既有 FIX-037 ③）自然覆盖「混装/多副本」场景的判定；
  - **基线档案驱动**：host-version-snapshot 的 HOST_BASELINE 单表 → 档案表 `[{ id:'0.1.5', dsh:'0.1.5-rc.1', dshPackages:'0.1.5-rc.2', …, status:'frozen' }, { id:'0.2.0', dsh:'0.2.0-rc.2', …, status:'primary' }]`；host-contract 的版本副本断言从「单值相等」改为「主基线项相等」；
  - **白名单镜像断言语义升级**：S7 7a 从全等改为**单向消费断言**（插件消费事件 ⊆ 宿主实读白名单）+ **镜像基线登记**（镜像常量记录其锚定宿主版本；宿主侧超集时绿 + 打印增量清单，消费项除名时红）——F-D 的增量不再制造人工刷新负担，但除名/改名仍红；
  - **锚基线档案化**：HOST_SHAPE_ANCHORS / WIRE_SCHEMA_WHITELIST 条目增加 `since`（锚定宿主版本）；锚路径/行号漂移（通用风险面——实证样本 = version.js:19 pi-ai :2344→:2490；F-G 修订后 dsh-llm 布局漂移无实证样本）按 per-anchor 档案刷新；
  - **CI 矩阵 job**：ci.yml 增 matrix（每基线一项）：安装 pinned 宿主关键包（`npm i --no-save @deepseek-ai/dsh@<ver>` 或 registry tarball 到专用目录 + `DSH_HOST_SOURCE` 指向）→ 跑同一条门控命令（单入口复用）→ S3/S7 在 CI 不再全 skip；
  - **漂移雷达（升级检测）**：新增 cron workflow（建议周频）：**查询规格 = `npm view @deepseek-ai/dsh dist-tags --json` 枚举全部 dist-tag**（latest + next/alpha/beta 等预发布 tag 集合）→ 各 tag 指向版本 ∪ 比对基线档案主基线〔F-5 处置——latest-only 查询默认取 latest dist-tag，对预发布通道失明；宿主 rc/alpha 快速迭代是既定部署通道（用户环境 0.1.5-rc.2→0.2.0-rc.2、registry 已有 0.2.1-alpha.5 流动）〕→ 发现新版本即触发 **probe-mode job**：安装新宿主 → 跑契约套件的「无基线断言模式」（只产 diff 报告工件：哪些锚 miss、哪些白名单项增删、哪些 schema 字段变化）→ 开 issue 通知。**雷达是探测不是门控**——probe-mode 不红不绿，只产报告（决策点 DEC-3：载体与频率与查询规格）。
- **四维-d 流程面（SOP 五步 + 接线点）**：
1. **检测**：雷达 cron（自动）/ 本地跑测试时靶子版本一致性告警（FIX-037 ③ 既有）/ 用户报障时健康面板「未实测宿主版本」徽章（三态——仅 gate-pass-unknown regime 可达）/ **宿主启动 stderr 的 skip 警告形态**（gate-block regime 的唯一用户侧线索——装载日志含 `skipping profile bundle "dsh-agent-router"` + pluginCompatibilityWarning，见 F-H）；
2. **diff**：probe-mode 报告工件（锚/白名单/schema/包表四类 diff）+ Analyst 人工契约比对（本任务并行轨的产出形态固化为模板）；**待验证项 T-1~T-5 按批次挂接消化**（§6：T-1→A4 前置定性；T-3/T-5→A3 前置验证；T-2→R0 后 additive 字段级核对；T-4→A3 端到端时序观察项）；
3. **分级**：按 §1 容错边界归类——超集增量 → 仅登记（刷新基线档案 + 镜像 + 锚）；语义变更 → 进适配批（改域文件 + 判别测试）；
4. **适配批**：实施链（见 §6 批次——R 批解耦 + A 批适配单链）；声明面基线跳跃 + 档案新增项 + README 矩阵行，一次 commit 承载（编程要求 4）；
5. **发布**：版本承载（版本位随 tracker E-4 独立裁决）+ **CHANGELOG 义务**（repo 根 `CHANGELOG.md`——v0.4.5/v0.5.0 发布惯例，本批变更条目必须登记，F-8 处置）+ 装回真机复验（**清单模板见 §6 R5「重装后真机复验」节**——条目来源 = 隔离冷装装载门判据〔F-2〕+ 用户视角四场景〔F-6〕；FIX-049/FIX-052 顺延口径）。
  - 接线点汇总：`router/hostFaceDiagnostics` RPC（运行时协商态）/ 健康面板徽章（用户可见）/ 靶子解析启动行（dev 可见）/ 雷达 issue（开发可见）。
- **入选理由**：四穿透点（§0.2）逐一闭合且五族中唯一完整重演的 FIX-003（silent update）获得结构性对策（雷达 + 三态）；单次升级适配成本从「全量人工 diff（3-5 天盲区）」降为「雷达半自动 diff + 分级登记（预期 ≤1 人日，纯增量时接近零代码改动——只刷档案）」；ARCH-004 资产复用率最高（§3 表）。
- **代价**：新增 1 个 cron workflow + 1 份档案数据结构 + 1 个运行时协商函数群；维护面增加「档案登记」义务（SOP 第 4 步内置）。

### 方案 C：宿主供给反转（协议对象从宿主树解析，消混装）

- **四维-a 声明面**：`dependencies` 中 3 个 dsh 运行时包（dsh-llm/dsh-tools/dsh-typert-protocol）降为 peers（或彻底移除）——插件不自带宿主协议对象副本；11 项声明全部 peers + optional meta。
- **四维-b 运行面**：协议对象（LlmAdapter/BlockAssembler/defineTool/TypertRemoteService）经宿主树动态解析（`createRequire` 从宿主 runner 提供的解析根 / 宿主 ctx 暴露的 require 面）——运行态插件与宿主**同一份类定义**，F-I 混装从结构上消失；require/instanceof 侧零 enforcement（F-H 修订后仍成立）现状下鸭子类型兜底继续有效。
- **四维-c 看护面**：同 B 的矩阵 + 雷达；另增「宿主解析路径可达性」测试面（每基线验证解析根可找到全部协议对象）。
- **四维-d 流程面**：同 B。
- **入选理由**：混装问题（F-I）的唯一样本内根治；声明面最干净（零 dsh deps）。
- **排除理由（不推荐现在做）**：**核心前提未证实**——「宿主模块图对插件 require 可达」的机制（install.ps1 junction 场景 vs plugin-manager pnpm 场景 vs 未来安装形态的分辨率差异）无一有一手实读证据（P1 纪律：不允许假设）；即便可达，协议对象版本从「插件锁定」变为「用户环境函数」，测试矩阵必须再乘一个维度（每基线 × 每安装形态）；与 ARCH-004 D1-6 已审裁决（协议对象保留自持，fork 宿主协议风险更大）方向相反，推翻已审决策需新证据而非推测；宿主包拆分（F-E）会使解析表本身成为新的漂移面。C 的价值（消混装）在 B 中以「可见性」方式部分获得（协商态显式报告混装/未知版本），结构性根治留作 B 落地后的独立预研（决策点 DEC-4）。

### 三案对照矩阵

| 维度 | A 多范围+人工 | **B 基线档案矩阵（推荐）** | C 宿主供给反转 |
|---|---|---|---|
| 五族覆盖（尤其 FIX-003 silent update） | 低（无检测通道） | **高**（雷达+三态+矩阵） | 中（同 B 的看护面，但解析机制自身成新漂移面） |
| 本次四穿透点闭合 | 2/4（F-A/F-I 部分） | **4/4** | 3/4（F-I 结构闭合，前提未证） |
| 单次升级适配成本 | 高（全量人工 diff 每次重付） | **低**（增量≈零代码，语义变更≤1 人日/面） | 中（同 B + 解析表维护） |
| 实施风险/回滚 | 最低 | 中低（每批独立 revert） | 高（前提未证 + 推翻 D1-6） |
| 声明面长期可读性 | 膨胀（范围并集线性增长） | **稳定**（单范围+档案表） | 最干净但转移复杂度到解析层 |
| ARCH-004 兼容性 | 全复用零扩展 | **全复用+定向扩展** | 部分推翻（D1-6） |

---

## 3. 与 ARCH-004 已交付资产的关系逐项声明（P5：复用/扩展/新增，禁止推翻重建）

| # | ARCH-004 资产 | 处置 | ARCH-005 动作 | 推翻面 |
|---|---|---|---|---|
| 1 | host-abi 桶 + 七域模块 | **复用** | 零改动（client-remotes/llm-selection/ctx-services/inject-manifest/health 不动） | 无 |
| 2 | `version.js` 版本遥测 | **扩展** | 增 `hostCapabilityProfile` 协商函数群 + 基线档案表（Node 侧常量）；`hostVersionsOf` 原样保留为其数据源 | 无（旧导出全保留） |
| 3 | 降级信封三错误码 + probe 三时机 | **复用** | 协商态复用同一 FaceHealth 快照通道（`faceHealthSnapshot` 纯读纪律延续——不新增渲染期探测） | 无 |
| 4 | events 域白名单镜像 + 订阅拒绝 | **扩展** | 镜像常量加 `since` 锚定版本注记；**运行时订阅拒绝逻辑不变**（单向消费断言已天然容忍宿主超集——订阅时只判「消费事件是否在镜像内」，镜像刷新即吸收增量） | 无 |
| 5 | host-version-snapshot HOST_BASELINE | **扩展** | 单表 → 基线档案数组（primary/frozen 状态）；断言改「主基线项」；双份机器锁定纪律延续（F-J）——host-contract 副本同步档案化 | 无（独立入口结构保留） |
| 6 | host-contract S1-S7 | **复用 + 定向扩展** | S1-S6 判据零改动；S7 7a 白名单全等→单向消费+增量登记；靶子解析加 npm 全局树候选；锚/S5 条目加 `since` 字段 | 无（判据形态演进沿 FIX-043 批 A 先例） |
| 7 | CI ci.yml 单 job | **扩展** | 增 matrix 维度（每基线一 job，同一条门控命令）+ 新增雷达 cron workflow（独立文件，不混入现有 job） | 无 |
| 8 | README 兼容矩阵 | **扩展** | 单基线段 → 支持基线集表（含冻结历史） | 无 |
| 9 | peerDeps 记录性语义（ADR-ARCH-004-A） | **修订**〔P1-1〕 | 「插件侧不依赖 enforcement」延续；「宿主侧零 enforcement」被 0.2.0 装载门终结（F-H）——声明范围 = 门控钥匙（R1 跳跃解除）；optional meta 不解除门控、仅消 pnpm 告警（DEC-2 裁决后定） | 无（修订随 ADR-ARCH-005-A 写回时关联登记） |
| 10 | hostFaceDiagnostics RPC + 健康面板/徽章 | **扩展** | 返回加 `capabilityProfile` 字段；徽章渲染三态（matched 绿 / unknown 黄「未实测宿主版本」/ incompatible ⚠ 面级） | 无 |
| 11 | SOP/升级流程 | **新增**（ARCH-004 无此资产） | §2-B 四维-d 五步 SOP 文档化 + 雷达/报告工具接线 | —（新面） |

**结论**：零推翻项；两项新增（雷达 workflow、SOP 文档），其余全部为「复用」或「沿既有单点的定向扩展」。所有扩展遵守「同一动作多触发来源汇入同一实现路径」（如版本事实源唯一 = 基线档案；靶子解析唯一 = host-contract 既有解析函数扩充而非第二实现）。

---

## 4. 蓝军推演（3 轮 × 每案，攻击场景具体化）

### 第 1 轮：0.3.0 发布当天 silent update（FIX-003 族复演）

| 案 | 推演 | 穿透判定 | 依据 |
|---|---|---|---|
| A | 声明面再失配（`^0.1.5\|\|^0.2.0` 不含 0.3.0——装载门拒载，插件整体消失〔F-H 机制〕）；无人知道宿主已变（无检测通道）；用户第一发现人（插件被拒载/功能异常直至卸载止损——本次 0.2.0 的实际剧本重演）；开发者介入后全量人工 diff（锚/白名单/schema 逐项手比） | **穿透**：检测延迟 = 用户报障驱动（天级）；适配成本 = 全量人工 | F-A/F-H/F-I 机制 + 本轮 0.2.0 实际经历 |
| B | 雷达 cron ≤7 天内发现新版本（或开发者下次本地跑测试即被靶子版本一致性告警拦截——FIX-037 ③ 既有机制 + 新候选路径可达）；probe-mode 自动产 diff 报告；若 0.3.0 为纯超集增量 → 适配 = 刷新基线档案/镜像/锚（近零代码）；若有语义变更 → 对应静态判据红 + 运行时面 degraded 徽章（用户侧早已可见「哪一面不可用」） | **不穿透**（失效可观测 + 适配半自动）；**残余暴露面按两 regime 拆分〔F-4 修正〕**：雷达窗口期内（≤7 天）若新版本为 patch/rc 内跳位（gate-pass-unknown——过装载门）→ 用户已在 unknown 态运行，**三态徽章使其可见**；若为 minor 跳位（gate-block——0.3.0 复算不过 `^0.2.0-rc.2` 门）→ 插件整层拒载、**插件侧机制不可达**，可观测性 = 宿主 skip 警告（stderr）+ 雷达/靶子告警——徽章在该 regime 不可用，minor 跳位窗口期内插件全失效是 DEC-1 单范围的已知代价 | §2-B 判定规则 + §2-B regime 边界 + F-H 门控本机复算 + F-D 增量先例 |
| C | 宿主树 0.3.0 到位后，插件运行态**立即**解析到新协议对象（无重装缓冲）——若 0.3.0 有语义变更，插件在零变更情况下直接行为漂移（比 A/B 更快暴露且无版本钉扎回退手段）；解析表若涉新拆分包（F-E 族）→ 解析失败路径 | **穿透**（结构性）：供给反转把版本变化直接传导进运行态，反而放大 silent update 的即时报复面 | §2-C 机制推演 |

### 第 2 轮：宿主改字段名不改类型（wire 字段改名族，如 `displayName→display_name`）

| 案 | 推演 | 穿透判定 | 依据 |
|---|---|---|---|
| A | 靶子修复后 S7 7b 从宿主源码重 derive schema 顶层字段 → 与白名单不等 → **红**（dev 测试时捕获）；但在此之前（宿主已升级、开发者未跑测试的窗口），运行态字段改名**穿透到显示层静默错列**（`entry.displayName` 读 undefined——ARCH-004 已登记的已知边界：wire 字段漂移由静态层捕获，运行时面形状守卫只到方法级） | **条件穿透**：dev/CI 侧拦截，用户侧显示层静默错列直至发版 | ARCH-004 §5.1 第 4 项设计理由自认边界 + S5/S7 判据形态 |
| B | 同 A 的静态拦截（判据复用）；**运行面增强**：`hostCapabilityProfile` 的 verifyDeep 抽查（建议激活面见 DEC-6）在健康面板刷新/失败驱动复检时对关键 RPC 结果做字段级 spot-check → 字段缺失即该面 degraded + 徽章 ⚠（用户侧从「静默错列」升为「可见降级」）；静态侧另有雷达 probe-mode diff 提前指认 | **不穿透**（双侧拦截：静态红 + 运行时可见降级）；边界诚实声明：未开面板且未触发复检的静默窗口仍存在（verifyDeep 非每次调用都跑——性能预算约束 §1） | §2-B + ARCH-004 §5.2 verifyDeep 可选钩子既有设计激活 |
| C | 与 A/B 同（字段改名是 wire 层问题，供给反转只动模块解析层——C 的看护面同 B 时静态拦截同 B；但 C 的解析表维护者可能同时是字段改名的受害者：双重适配点） | 同 B（若采 B 的看护面）但适配点多一处 | §2-C |

### 第 3 轮：宿主包拆分合并 + 用户环境版本混装（F-E + F-I 复合）

| 案 | 推演 | 穿透判定 | 依据 |
|---|---|---|---|
| A | 拆分（如 dsh-agent-presets→preset+registry）不直接影响插件（插件消费的是 ctx 服务名 `agentPresets` 与事件 `agent-preset/selected`，均存续——F-C/E 实证），但 A 的锚/快照若引用了被拆包名则人工排查定位；混装（插件局部 0.1.5 副本 × 宿主 0.2.0 服务——发生于豁免装载或门内版本场景，F-I 修订）在零 instanceof（F-H 的 require/instanceof 半边）下**隐性存活**——宿主任何一次引入类品牌校验（instanceof/Symbol.toStringTag）即整链硬崩，A 对此零可见性零防御 | **穿透**（混装为潜伏雷：无观测、无告警、触发即崩） | F-E/F-H/F-I 实证 |
| B | 混装在协商态下**显式可见**：`hostVersionsOf`（读插件局部树=0.1.5）× 靶子/雷达侧宿主版本（0.2.0）不一致 → 版本一致性告警（FIX-037 ③ 既有机制，靶子修复后生效）+ 面板 unknown/incompatible 态暴露；基线档案 primary 跳到 0.2.0 后，局部副本 0.1.5 = 过期混装被档案判据点名（`declaredRange` 断言红）；拆分包名进锚档案 `since` 登记，S2/S5 的包存在性核验对消亡包显式红（非静默 skip——判据现状已如此，:627-629） | **不穿透**（可见 + 判据点名）；残余风险 = 宿主未来引入类品牌校验仍会崩——但三态徽章先期暴露版本错配，排障路径清晰 | F-J + §2-B |
| C | 拆分直接打击解析表（包名→路径映射失效）→ 协议对象解析失败 → 比 A/B 更脆；但混装本身被结构消除（无局部副本可混） | **条件不穿透**：混装消除 vs 解析脆化互为代价 | §2-C |

**蓝军总评**：B 在三轮中均不穿透或降级为可见失效；A 的共同弱点 = 检测通道缺失（第 1 轮穿透）+ 混装零可见（第 3 轮穿透）；C 的供给反转在 silent update 场景下**放大**即时报复面（第 1 轮穿透）——蓝军结论支持 B 推荐，同时识别 B 的两个残余暴露面（雷达窗口期、verifyDeep 非全时覆盖）并如实登记（§7 风险表）。

---

## 5. 推荐方案与理由

**推荐：方案 B（基线档案矩阵 + 版本协商态 + 漂移雷达）**，以 A 的第一步（靶子修复 + 基线刷新）为 B 的 R0 批内容（A ⊂ B，无弃置成本）。

核心理由（按评估标准）：
1. **唯一对 FIX-003（本次完整重演的族）给出结构性对策的方案**——检测通道三层（雷达〔dist-tags 枚举〕+ 靶子告警 + 三态徽章——徽章仅在 gate-pass-unknown regime 可达，gate-block regime 由宿主 skip 警告 + 雷达覆盖，见 §2-B regime 边界），用户不再是第一发现人；
2. **适配成本结构性下降**：纯增量升级（本次 0.2.0 的主体形态——F-C/F-D 实证）适配 ≈ 刷新档案/镜像/锚的登记动作（近零代码）；语义变更仍保 ARCH-004 已达成的 0.5-1 人日/面级成本；
3. **ARCH-004 复用率最高、零推翻**（§3 表）——P5 纪律直接满足；
4. C 的核心价值（消混装）以可见性方式部分获得且其结构性根治保留为受控预研（DEC-4），不押注未证实前提（P1）。

---

## 6. 实施批划分建议（EVO 链依赖序——编号由 Coordinator 落位，R* = 解耦半边 / A* = 适配半边）

> 依赖序：**R0 → R1 → A1 → A2 → A3 → A4 →（R2、R3 可并行）→ R4 → R5**〔P1-3/F-1 处置——适配半边显式入链〕。每批一个 commit 承载一个问题（编程要求 4）；全批跑全量测试网 `node tests/run-all.mjs`（P4 零回退）。
>
> **批序依据**（任务允许可调，本设计维持上述序并给出依据）：
> 1. **R0 先行**：靶子可达 + 0.2.0 基线登记是后续一切判据（红绿演示/靶子断言）的前提；
> 2. **R1 → A1**：装载门验证（A1）以声明面已跳跃（R1）为前提——8 项 peerDeps 过 `semver.satisfies` 门（F-H）才可能装载成功；
> 3. **A2（HD-003）先于 A3（HD-002）——验收依赖而非偏好**：A3 的端到端验收（设置面板改值 → `settings/document-updated` → 热同步）消费插件自身 RPC 面（`remote.router` 的 mutate/诊断/统计等 19 条描述子），描述子在 A2 完成前会被新树 `validateCodec` 双拒（服务端 register + 客户端 $mount——`dsh-typert-registry/lib/index.js:565` throw 形态）——A2 先行使 A3 的面板级验收门可达；A2 本身机械单点（三文件 + 判据），先行风险最低；
> 4. **A3（HD-002）居中**：最重设计项（Config 声明制 + volatile 写入门 + 事件迁移 + host-route 读写 + T-3/T-5 前置验证）；其完成使「服务端 apply 全程无 throw」首次成立（apply 断点顺序 :237〔HD-002〕→ :305〔HD-003〕——两断点分别由 A3/A2 解除）；
> 5. **A4（HD-004）收尾**：守卫降级型（非崩溃）独立小项，与 R 批无验收耦合（其验收不依赖 R2/R3）；
> 6. **R2 硬依赖 A1~A4**：协商态徽章的面板取证前提 = 插件能在 0.2.0 宿主上加载运行；R3 仅依赖 R0（矩阵参数化），故 R2、R3 在 A4 后可并行。

| 批 | 内容 | 文件面 | 验收门（判别性红/绿） | 回滚 |
|---|---|---|---|---|
| **R0 靶子修复 + 0.2.0 基线登记批**（= 方案 A 看护面全部内容，先行止损） | 靶子解析加 npm 全局树候选（修 F-A——现状 S3/S7 跑在过期 rc.3 副本上）；HOST_BASELINE → 双基线（0.1.5 frozen / 0.2.0 primary，**schemastery 以实测 3.18.5 为准**——F-B/F-3 仲裁）；白名单镜像刷新至 27 项 + since 注记；锚刷新**收窄为实证漂移清单**（`lib/host-abi/version.js:19` pi-ai 注释锚 :2344→:2490；dsh-llm 布局漂移无实证不入清单——F-G 修订〔P1-2〕）；S7 7a 改单向消费断言（实施时以靶子实读引号形态为准——修订记录 P3-3 复核登记） | tests/host-contract.mjs、tests/host-version-snapshot.mjs、lib/host-abi/events.js（镜像常量）、lib/host-abi/version.js（注释锚） | ① 靶子可达且指向 0.2.0 全局树（启动行打印全局树路径 + 版本一致性绿）；② S7 全绿（含 27 项白名单单向断言 + 增量清单打印）；③ 红/绿演示：临时删宿主侧一个消费事件 → 红；④ 全量网绿 | revert 单 commit |
| **R1 声明面基线跳跃批**（HD-001 声明半边） | package.json 11 项 → `^0.2.0-rc.2`（8 peers + 3 dsh deps）；peerDependenciesMeta optional（按 DEC-2 裁决——不解除门控，仅安装器行为）；README 矩阵改支持基线集表 | package.json、README.md | ① host-version-snapshot 主基线断言绿（改动假版本 → 红 演示）；② npm/pnpm 安装面冒烟（无 required-peer 告警）；③ **隔离冷装装载门判据〔F-2 处置〕**：沙箱 profile（独立 DSH_HOME）+ 0.2.0-rc.2 宿主树装载 → 断言装载日志**无** `skipping profile bundle "dsh-agent-router"`（skippedBundles 形态 = dsh-app-boot :941-945）且无 pluginCompatibilityWarning（:320-322 文案形态）——注意本批后 apply 期仍于 :237/:305 断点 throw（HD-002/003），断言面仅覆盖**装载门放行**（门控 evaluate 不再拒载），apply 全程绿在 A3 验收门 | revert 单 commit |
| **A1 装载门验证 + HD-001 声明面收口批**〔新增——F-1 处置〕 | 隔离冷装取证口径成文并固化为**可复用程序**（沙箱 profile + 0.2.0-rc.2 宿主树 + 装载日志断言——SOP 第 1 步接线，R2/A3/R5 复用同一口径）；HD-001 收口核对：package.json × HOST_BASELINE 主基线 × README 矩阵**三方版本逐项一致** | 取证程序文档/辅助脚本（定形留实施链；零产品行为变更） | ① 隔离冷装判据同 R1-③ 复验通过（同一实现路径，P5）；② **判别红演示**：临时回退任一 peerDep 至 `^0.1.5-rc.2` → 冷装即现 `skipping profile bundle` 警告（红）——证明判据判别力而非恒绿；③ 三方一致核对绿（版本错位即红）；④ 全量网绿 | revert 单 commit |
| **A2 codec create() 迁移批（HD-003）**〔新增——F-1 处置〕 | 19 条描述子 codec 机械迁移 `{schema}` → `{create: () => schema}`（schemastery schema 对象不变，仅包装惰性工厂——宿主自证形态 `dsh-api-remotes/lib/client.js:11666-11680`）：lib/rpc.js（parameter/result 产出）+ `lib/index.js:305`（typert.register 路径）+ lib/client.js 镜像（parameter/resultOf）+ tests/rpc-shadow-guard.mjs 判据同步 | lib/rpc.js、lib/index.js、lib/client.js、tests/rpc-shadow-guard.mjs | ① 判别测试：新形态描述子过新树 validateCodec 规则（`typeof codec.create === 'function'`——`dsh-typert-registry/lib/index.js:565` throw 形态锚定）；② **红演示**：stub 用旧 `{schema}` 形态 → 判红；③ 客户端镜像 parity 断言（双端同形）；④ 全量网绿 | revert 单 commit |
| **A3 settings Config 声明制迁移批（HD-002——最重设计项）**〔新增——F-1 处置〕 | **前置验证先行**：T-3（llm-pi-ai 条目在 default profile 的 entry id = 'llm-pi-ai'——host-route 写路径 `configEditor.entries().find(row=>row.options.id===ns)` 可达性）+ T-5（`settings/document-updated` 触发时序——write() 尾部 describe() 变更检测 vs 旧「提交即发」，四热同步消费者的及时性探针）结论记录；插件条目改为导出 Config（routerSchema 加 `.volatile()` 标注——先例 `dsh-llm-pi-ai/lib/index.js:1051` `z.dict(profile).default({}).volatile()`）；`lib/index.js:237` settings.register 调用迁移（声明制）；`settings/updated` 四订阅点迁移至 `settings/document-updated`（`lib/index.js:270` / `lib/service.js:2880` / `lib/wrapper.js:657` / `lib/oauth-llm.js:552`）；host-route 读写替代（`lib/host-route.js:209` `settings.get(ns)` → `describe().find(ns).value` 形态；:430 写路径）；`lib/host-abi/events.js:36` MANAGED_EVENTS 同步；T-4（客户端 inject 挂载时序）作端到端观察项 | lib/schemas.js、lib/index.js、lib/service.js、lib/wrapper.js、lib/oauth-llm.js、lib/host-route.js、lib/host-abi/events.js、tests/ | ① **隔离冷装端到端绿**：服务端 apply 全程无 throw（:237 断点由本批解除、:305 已由 A2 解除）→「插件在 0.2.0 下加载成功」完整判据点（装载门判据同 A1 口径复验）；② 判别测试：0.1.5 时代老配置在 0.2.0 下可读可写；非 volatile 字段写入按宿主门 throw（`Config field ... is not volatile` 形态）；settings.mutate → document-updated 到达四消费者（探针）；③ **用户视角四场景〔F-6 处置〕**：0.1.5 老配置跨宿主升级可读可写 / stats 持久化跨重启 / 设置变更热同步不依赖重启 / 快速连续操作（连发 mutate 不丢更新不乱序）；④ 全量网绿 | revert 批 commit |
| **A4 图片直传 addAttachments 迁移批（HD-004——守卫降级型）**〔新增——F-1 处置〕 | **前置定性 T-1 先行**（`npm pack @deepseek-ai/dsh-client-ui-conversation@0.1.5-rc.2` grep createDraftImages——定性「0.2.0 新断」vs「0.1.5 已然降级」，定 changelog 措辞与回归/修复定性并记录）；AttachButton 直传迁移至新通道：上传得 attachment id → `inputActions.addAttachments(ids)`（宿主原生形态——rc.3 旁证 :16776 先例 drafts→addAttachments→失败 releaseDraftAttachments；上传源 = 插件自有 uploadFile RPC 或宿主 file-upload 五参 `upload(sessionId,data,name,signal,onProgress)`，实现定形留实施链） | lib/client.js（:4857-4863 直传路径）、tests/ | ① 判别测试：stub 宿主面在场 → 选择图片 → 上传 → addAttachments 绿；stub 缺面 → `attachUnavailable` 降级不崩（守卫保留——负向判别）；② T-1 定性结论入档；③ 全量网绿 | revert 单 commit |
| **R2 运行面协商态批**（依赖 A1~A4 完成） | version.js 增 hostCapabilityProfile + 基线档案表（Node 侧）；RPC 加 capabilityProfile 字段；健康徽章三态渲染 | lib/host-abi/version.js、lib/rpc.js、lib/schemas.js（RPC schema）、lib/client.js（徽章镜像同步——遵守镜像 parity 纪律）、tests/host-abi-health.mjs | 判别测试：stub 版本 ∈ 档案 → matched；∉ 档案且面绿 → unknown + 一次性诊断事件；任一关键面 degraded → incompatible；**面板三态显示证据（P10-③ 双层口径〔F-2 处置〕）：发布前 = 本机隔离冷装取证（沙箱冷装环境面板渲染截图/录屏——A1 固化口径复用）；重装后 = 真机复验（后置，条目入 R5「重装后真机复验」节清单）**；渲染期零 probe 判别（探针三时机纪律不破） | revert 批 commit（含镜像） |
| **R3 看护矩阵批**（依赖 R0；可与 R2 并行） | host-contract/host-version-snapshot 档案参数化（多基线断言）；锚/S5 条目 since 字段成文；CI matrix job（pinned 宿主安装 + DSH_HOST_SOURCE 指向 + 同门控命令） | tests/host-contract.mjs、tests/host-version-snapshot.mjs、.github/workflows/ci.yml | CI 矩阵两基线 job 全绿（S3/S7 在 CI 不再 skip——`#SKIP` 计数下降与预期吻合）；单基线断言红/绿演示 | revert 批 commit；matrix job 可独立禁用（workflow 层开关） |
| **R4 雷达批** | cron workflow：**`npm view @deepseek-ai/dsh dist-tags --json` 枚举 dist-tag 集合**（latest + next/alpha 等预发布 tag 并集——F-5 处置）→ 比对档案主基线 → 新版本触发 probe-mode job（装新宿主 → 契约套件 diff 报告工件 + issue）；雷达心跳可观测（连续 N 次未跑 → 自身告警，防雷达静默死亡——蓝军第 1 轮缓解的完整性） | .github/workflows/host-radar.yml（新增文件） | dry-run 演示：以 0.2.0 为「新版本」触发 → 报告工件产出（锚/白名单/schema/包表四类 diff 清单）+ issue 开立；**dist-tags 枚举演示**：模拟预发布 tag（如 next→0.2.1-alpha.x）也被捕获 | workflow 删除即回滚（零产品面） |
| **R5 SOP 固化批** | 升级 SOP 五步文档（§2-B 四维-d 成文）+ 基线登记 checklist 模板（含**「重装后真机复验」节**——条目来源 = F-2 隔离冷装装载门判据的真机复验项 + F-6 用户视角四场景：老配置可读可写 / stats 持久化跨重启 / 热同步不依赖重启 / 快速连续操作〔F-7 处置〕）+ **CHANGELOG 义务行**（发布前登记本批变更至 repo 根 CHANGELOG.md——F-8 处置）+ proposed ADR（§8）随报告返回由 Coordinator 写回 decision-log | README.md（维护段）或 docs/（由 Coordinator 定）、CHANGELOG.md、.governance/decision-log.md（Coordinator 写回） | 以本次 0.1.5→0.2.0 升级做 SOP retrospective walk-through：五步每步有机器入口且按 SOP 重放可得出与本设计 §0 一致的事实清单；「重装后真机复验」节条目可直接勾选执行 | 文档 revert |

**总量判断**〔修订〕：R0-R1 为看护面/声明面止损半边；**A1~A4 为适配半边（HD-001 收口 + HD-003/HD-002/HD-004 产品代码迁移——批次完备性由本表闭环〔F-1〕）**；R2-R4 为解耦增量半边；R5 收口。产品代码面 = A2/A3/A4 + R2（version.js/rpc/schemas/client 徽章），其余全部在测试/CI/文档面。**breaking 4 项（HD-001/002/003/004）全部显式承载**：HD-001 → R1+A1；HD-003 → A2；HD-002 → A3；HD-004 → A4；additive 项（HD-006~011）按 SOP 第 2 步分级登记（T-2 于 R0 后随手核对，非批次阻塞项）。

---

## 7. 非功能需求覆盖与风险登记

### 7.1 非功能逐项

| 项 | 措施 | 锚点 |
|---|---|---|
| 性能 | 协商态判定 = 纯函数比对（档案表 + 既有 probe 快照缓存），零新增探测/零常驻 timer；unknown 一次性诊断事件（去重——同版本组合只记一次） | ARCH-004 §7.1 探针三时机纪律延续 |
| 安全 | 档案/雷达零凭据面（版本号 + 包表只读）；probe-mode job 只读 registry 与宿主树 | P7 延续 |
| 可维护性 | 单一事实源 = 基线档案（声明断言/看护矩阵/运行协商态/SOP 四消费方全部派生自它——P5）；雷达与门控 CI 分离（探测不混入门控） | §3 表 |
| 可回滚 | 每批独立 revert（§6）；雷达/matrix 为 workflow 层可独立禁用 | — |

### 7.2 风险登记（本设计引入/放大的风险）

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 雷达窗口期（cron 间隔内 silent update 已在用户侧生效） | 中 | 中 | **按 regime 拆分〔F-4 修正〕**：gate-pass-unknown（patch/rc 内跳位过门）→ 三态徽章用户侧可见（unknown 态显式提示）；gate-block（minor 跳位拒载）→ 插件侧机制不可达，靠宿主 skip 警告（stderr 形态可观测）+ 雷达/本地靶子告警兜底——minor 跳位窗口期插件全失效是 DEC-1 单范围已知代价；本地靶子告警兜底；频率与查询规格是 DEC-3 裁决项（dist-tags 枚举防预发布通道漏检） |
| unknown 态泛滥（宿主高频 rc、档案登记滞后 → 用户长期见黄徽章） | 中 | 低 | SOP 第 4 步内置登记义务；unknown 判据收紧（面全绿才算，任一面 degraded 即 incompatible——不把故障伪装成「只是没测过」） |
| 基线档案成为新单点（漏登记/登记错误 → 四消费方同时失真） | 低 | 中 | 档案本身受 host-version-snapshot 断言看护（自我指涉的最内圈：档案 vs package.json vs README 三方一致）；双份机器锁定纪律延续（F-J） |
| CI 矩阵安装 pinned 宿主的供应链漂移（registry 端 tarball 变化/弃用） | 低 | 中 | pin 精确版本 + integrity；矩阵 job 失败不阻塞主门控（独立 job，主门控维持现有单命令语义） |
| 镜像单向断言放宽后被滥用（消费侧新增事件不更新镜像即静默通过——新消费项仍须镜像内） | 低 | 低 | 单向性是「宿主 ⊇ 镜像」方向；消费事件 ∉ 镜像仍红（S6 既有断言不动）——两个方向各自锁死，无静默缝 |
| verifyDeep 激活面选择不当（过宽 → 性能预算破；过窄 → 字段漂移运行时不可见） | 中 | 中 | DEC-6 留用户裁决；默认保守（仅健康面板刷新 + 失败驱动复检两时机——不进调用热路径） |

---

## 8. ADR（proposed——随报告返回，Coordinator 评审后写回 decision-log）

### ADR-ARCH-005-A：以基线档案（baseline profile）为单一事实源的宿主版本依赖解耦

- **标题**: Adopt a baseline-profile registry as the single source of truth for host version dependency, with version-negotiation tri-state and drift radar
- **日期**: 2026-10-16（背景/决策④/后续动作段随双审返工修订 2026-10-17——装载门事实纳入与批次依赖序写死）
- **状态**: proposed（推荐方案 B；最终选型留用户/审查链）
- **背景**: 宿主 0.1.5-rc.2→0.2.0-rc.2 再次证明：0.x minor 跳位使插件声明面（`^0.1.5-rc.2` ×11）整体失真；**0.2.0 起宿主 app-boot 装载门对全部 `@deepseek-ai/dsh*` peerDeps 逐项 `semver.satisfies(includePrerelease)` 硬门控，不满足且无豁免即整层拒载（本机复算 `^0.1.5-rc.2` ×8 全不过——插件第一死因；`peerDependenciesMeta` 不参与门控）**；宿主安装位置换代（npx cache → npm 全局树）使 ARCH-004 D3 看护靶子指向过期 `_npx` 副本（S3/S7 对 0.2.0 零看护）；silent update（FIX-003 族，五族中唯一本次完整重演者）下被拒载的插件零感知通道，用户以卸载止损。同时一手探针证明契约面主体存续（LlmAdapter 7 方法/message 8 导出/六 wire schema/selectModel 链/InputState 均在）、转发白名单 19→27 纯增量；require/instanceof 侧仍零 enforcement（装载层 enforcement 是 0.2.0 新事实）——失效集中在装载门适配（声明面）、看护靶子可达性、版本感知与升级流程四个子面，ARCH-004 D1-D4 骨架无需推翻。
- **决策（建议）**: ① 以「基线档案」数据结构（版本集 + 状态 primary/frozen + 锚定注记）为宿主版本依赖的单一事实源：声明面单范围基线跳跃（多范围并集排除）、看护面多基线矩阵、运行面协商三态（matched/compatible-unknown/incompatible——适用边界按 gate-block / gate-pass-unknown 两 regime 显式区分）、流程面 SOP 五步全部由其派生；② 容错边界成文：宿主超集增量自动吸收留痕，已消费面收缩/改名必须显式适配（fail-loud），禁止猜测性别名映射；③ 升级检测三层（雷达 cron〔dist-tags 枚举〕/ 靶子版本告警 / 三态徽章）+ gate-block regime 由宿主 skip 警告形态覆盖；④ peerDeps 语义修订：插件侧不依赖 semver enforcement 判定宿主（ADR-ARCH-004-A 该半边延续）；承认并适配宿主装载门的 enforcement——声明范围即门控钥匙（基线跳跃解除门控），`peerDependenciesMeta.optional` 不解除门控（门控不读 meta）。
- **备选方案**: A 多范围声明 + 人工锚刷新（排除：检测通道缺失、适配成本每次全量重付、声明面线性膨胀）；C 宿主供给反转（排除：核心前提「宿主模块图对插件 require 可达」零一手证据，推翻 D1-6 已审裁决需新证据；silent update 下放大即时报复面——蓝军第 1 轮）。
- **排除理由**: 见 §2 各案排除理由 + §4 蓝军三轮。
- **影响范围**: tests/host-contract.mjs、tests/host-version-snapshot.mjs、lib/host-abi/{version,events}.js、lib/rpc.js、lib/index.js、lib/client.js（codec 迁移 + 徽章镜像）、lib/{schemas,service,wrapper,oauth-llm,host-route}.js（HD-002 适配）、package.json、README.md、CHANGELOG.md（发布义务）、.github/workflows/{ci.yml, host-radar.yml}。
- **后续动作**: 实施链单 EVO 批次 **R0 → R1 → A1 → A2 → A3 → A4 →（R2、R3 可并行）→ R4 → R5**（§6，DEC-5 写死）；C 案预研立项与否（DEC-4）。
- **可逆性**: **高**——每批独立 revert；雷达/matrix 为 workflow 层可独立禁用；档案数据结构可回退单基线形态（向后兼容）。

---

## 9. 决策点清单（供用户/审查链裁决——本设计不做最终决策）

| # | 决策点 | 选项与推荐依据 | 推荐 |
|---|---|---|---|
| **DEC-1** | 声明面策略：基线跳跃单范围（B）vs 多范围并集（A） | 基线跳跃：长期可读 + 档案承载历史（§2-B a）；多范围：无档案依赖但线性膨胀（§2-A a） | B |
| **DEC-2** | peerDeps 是否加 `peerDependenciesMeta optional` | 加：消除 pnpm profile 安装（F-F）下 required-peer 告警/自动装差异——**作用域仅安装器行为，对宿主装载门零影响**（F-H：app-boot 门控只遍历 `peerDependencies` 键、该文件 `peerDependenciesMeta` 0 读取——**optional 不解除门控**，解除门控唯一途径 = 版本范围过 satisfies 或 compatibility.json 显式豁免〔P1-1 补注〕）；不加：保持现状零改动（npm 安装器本来零告警） | 加（低风险——语义边界已界定） |
| **DEC-3** | 雷达载体、频率与查询规格 | GitHub Actions cron 周频（推荐）/ 日频（更早发现、配额消耗高）/ 本地脚本（依赖开发者纪律，弱）；**查询规格〔F-5 扩展裁决面〕= `npm view @deepseek-ai/dsh dist-tags --json` 枚举 latest + next/alpha/beta 等预发布 tag 集合并集比对档案**——latest-only 排除（默认取 latest dist-tag，对宿主 rc/alpha 迭代通道失明：用户环境 0.1.5-rc.2→0.2.0-rc.2、registry 已有 0.2.1-alpha.5 流动） | Actions cron 周频 + dist-tags 枚举 |
| **DEC-4** | C 案（宿主供给反转/消混装结构性根治）是否立项预研 | B 落地后以可见性覆盖混装；结构性根治需先证实解析机制（install.ps1/plugin-manager 两形态的 require 可达性一手取证） | 暂缓，B 落地后评估 |
| **DEC-5** | R 批（解耦）与 A 批（适配）的链型与依赖序 | 单 EVO 链分批：**R0 → R1 → A1 → A2 → A3 → A4 →（R2、R3 可并行）→ R4 → R5**（§6 写死；R2 面板取证硬依赖 A1~A4——「插件能加载运行」是其前提〔P1-3/F-1 处置〕）。初版「与 0.2.0 适配任务合流」的悬空引用已消灭：tracker ARCH-005 行即「适配 + 解耦」合一承载、**无独立适配任务行**——A1~A4 就是适配半边的显式批号 | 单链分批（依赖序写死如左） |
| **DEC-6** | verifyDeep 运行时字段抽查激活面 | 仅健康面板刷新 + 失败驱动复检（保守，零热路径）/ 增加关键 RPC 定期抽查（覆盖广、有轮询纪律成本——需对齐 D1-10 治理口径） | 保守档 |
| **DEC-7** | 基线档案的物理载体 | tests 内常量（与现有 HOST_BASELINE 同形态，零新文件）/ 独立 JSON 档案文件（机器可读性高、多一处同步面） | tests 内常量起步 |

---

## 10. Design Doc 最小结构自检（stage-architecture SKILL 退出条件预检）

- [x] 目标（§1）/ 方案（§2 三案四维）/ 替代方案 ≥2 且各有排除理由（§2 A/C）/ 风险（§7.2）/ 非功能覆盖（§7.1）五项齐全
- [x] 候选方案 ≥3（SKILL 角色 hard gate ≥2 的加强满足）
- [x] 蓝军挑战 ≥3 且逐条回应（§4 三轮九格，各含穿透判定与依据）
- [x] ADR 字段完整：标题+日期+背景+决策+备选方案+排除理由+影响范围+后续动作+可逆性（§8）
- [x] 模块无循环依赖、职责单一：version.js 扩展仍在 host-abi 依赖图「消费者→桶→域→health」单向结构内（§3-2）；基线档案为数据常量非模块
- [x] 独立评审：双审已执行（Design Reviewer R0 + Requirement Reviewer R1，均 NEEDS_CHANGE——报告入库 `.governance/review-ARCH-005-{R0-DES,R1-REQ}-input.md`）；本修订为逐 finding 处置（见头部修订记录），**待重 spawn 复审（R2 轮）确认**
- [x] 与项目原则对照：P1（§0 全锚点——返工面二次实读）/ P4（§6 每批门）/ P5（§3 逐项）/ P8（§1 容错总纲 + §7.2 unknown 观测）/ P9（协商态 = 能力自证）/ P10-④（锚档案 since 登记 + 判别夹具同源延续）/ P10-⑤（A3 验收门 + R5 复验清单纳入用户视角四场景——F-6 处置）
- [ ] Bar Raiser / 蓝军结论用户确认、复审轮结论——**留待审查链（Coordinator 安排双 Reviewer 复审）**

---

*（完——本文档为 ARCH-005 设计产出物〔初版 2026-10-16 / 双审返工修订 2026-10-17〕；实施留后续批（§6 依赖序 R0→R1→A1~A4→R2/R3→R4→R5）；ADR proposed 文本由 Coordinator 评审后写回 decision-log；最终选型与 DEC-1…DEC-7 由用户裁决。）*
