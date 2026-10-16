# ARCH-005 — DSH 宿主版本依赖解耦架构设计（ADR + 蓝军推演）

- **生成时间**: 2026-10-16
- **任务**: ARCH-005（P0）——宿主版本依赖解耦：使未来宿主升级（含 silent update）不再导致插件失效，或至少失效可观测、可低成本适配
- **用户目标（原话，2026-10-16）**: 「先完成新版本的适配，并进一步完成版本依赖的解耦，避免每次升级插件都会失效」
- **插件侧源码（现状锚点来源）**: `D:/AI/agent/deepseek/plugins/router`（v0.5.0，`lib/` 15 模块 + `lib/host-abi/` 8 文件 + `tests/` 26 套件）
- **宿主侧源码（一手只读权威）**: `C:/Users/peter/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh`（**0.2.0-rc.2**，npm 全局安装；嵌套 `node_modules/@deepseek-ai/` 287 包全系 0.2.0-rc.2）
- **事实来源标注**: 本仓断言全部实读（file:line）；宿主侧断言全部为本文撰写时一手探针（只读零写入，2026-10-16）；标注「tracker 记载」的引用 plan-tracker ARCH-005 行。与 Analyst 的 diff 清单并行——本设计不依赖其产出；两侧事实冲突时以一手实读为准并显式标注。
- **输出边界**: 本文档为唯一产出物；不修改任何产品代码/测试/package.json/治理状态文件；最终选型留给用户/审查链（本文给推荐 + 依据）。
- **角色纪律**: Architect Agent——只出方案不改产品代码；不与用户直接交互；决策型任务不做最终决策。

---

## 0. 事实基础（设计输入自勘）

### 0.1 宿主 0.2.0-rc.2 一手探针事实（2026-10-16，全局树只读）

| # | 事实 | 锚点（宿主树相对 `…/dsh/node_modules/@deepseek-ai/`） | 对设计的含义 |
|---|---|---|---|
| **F-A** | **宿主安装位置换代**：0.1.5 时代宿主经 npx cache（`%LOCALAPPDATA%\npm-cache\_npx\…`）供给；0.2.0 为 **npm 全局树**（`%APPDATA%\npm\node_modules\@deepseek-ai\dsh`，顶层仅 dsh 一包，全家桶嵌套其 `node_modules` 内） | `tests/host-contract.mjs:443-450` 靶子解析仅探测 `_npx` 缓存 → **新位置不可达 → S3 宿主侧半边 + S7 增强组全体 skip** | **本次看护面失明的第一根因**——不是判据失效，是靶子解析失明。任何方案必须先修靶子可达性 |
| **F-B** | 嵌套 287 包全系 **0.2.0-rc.2**；`cordis 4.0.5`（dsh 声明 `~4.0.4`）；`schemastery 3.18.5`（dsh 声明 `~3.18.4`） | 各 package.json version 实读 | tracker ARCH-005 行记「cordis 4.0.1→4.0.5、schemastery 3.18.1→3.18.4」——cordis 一致；**schemastery 实测 3.18.5**（声明 ~3.18.4 范围内装到 3.18.5），以一手为准 |
| **F-C** | **关键契约面大量存续（本次为增量漂移为主）**：LlmAdapter 全 7 方法（providerInfo/providerRetryPolicy/imageRequestPricing/listModels/resolveModel/prepareCall/stream）在位；dsh-llm/message 8 导出全在（**新增 `createDeveloperMessage`**）；六个 wire schema 符号（llm_listConfigurableProviders / llm_listProviders / session_modelCatalog / settings_describe / credentials_describe / agentPresets_list 的 `*_result$schema`）全在；`sessionController.selectModel`、`selectionFor(agent)`、`stateOf(agent.session,'modelSelection')`、`directoryFor(sessionId)`、InputState `attachmentIds`（无 imageIds）全在 | `dsh-llm/lib/types/index.js`、`dsh-llm/lib/types/message.js`、`dsh-api-remotes/lib/client.js`、`dsh-api-session-controller/lib/index.js` + `lib/types/agent.js`、`dsh-client-ui-model-selection/lib/types/client/service.d.ts`、`dsh-client-ui-conversation/lib/types/client/contract/input.d.ts` 逐项实读 | ARCH-004 D2/D3 建立的契约基线**主体未穿**——本次失效的痛点在声明面与看护靶子面，而非全部运行面 |
| **F-D** | **转发事件白名单 19 → 27 项纯增量**：旧 19 项全部存续；新增 `deepseek-account/session-expired`、`deepseek-account/model-sign-in-required`、`credentials/record-updated`、`permission-presets/catalog-changed`、`plugin-manager/changed`、`plugin-manager/install-log`、`plugin-manager/install-state`、`schedule/changed` | `dsh-api-remotes/lib/types/remote-events.js` 逐项实读 | 插件镜像 `FORWARDED_EVENT_ALLOWLIST`（`lib/host-abi/events.js:50-70`，19 项）**单向消费断言仍绿**（消费事件全在宿主表内），但 S7 7a 的**镜像全等断言**（`tests/host-contract.mjs:866`）在靶子可达后即红——属「宿主超集增量」判据边界设计的直接输入 |
| **F-E** | **宿主包拆分实证**：`dsh-agent-presets`（复数）已不存在 → 拆为 `dsh-agent-preset` + `dsh-agent-preset-registry`（各 0.2.0-rc.2）；事件 `agent-preset/selected` 仍居白名单首项 | 包表实读 | 「宿主包拆分合并」不是假想蓝军场景，**本次升级已实际发生**。锚点以「包名+文件+符号」登记的判据（FIX-043 批 A 去行号形态）对此类漂移的耐受度需要设计确认 |
| **F-F** | **宿主自带 plugin-manager**：`dsh-plugin-manager` + `dsh-client-ui-plugin-manager` 在场；README 自述「install, remove or select bundles from the Web sidebar」；实现走 **pnpm + profile 目录 node_modules + pnpm-lock.yaml**（`lib/index.js:619` `join(dir,"node_modules",name)`；README.zh.md:133 提及 pnpm 缓存与 `dsh plugin instal…` 命令）；新增 `plugin-manager/*` 转发事件 3 项 | 包实读 | 安装通道官方化：未来插件可能经宿主 plugin-manager 以 pnpm 装入 profile——**插件 dependencies 会按声明范围从 registry 现装**（见 F-I 混装）；且 pnpm 对 peerDependencies 的处理与 npm 安装器不同（auto-install/warn），声明面策略必须考虑 pnpm 语义 |
| **F-G** | **宿主包内部布局漂移**：`dsh-llm/lib/index.js` 仍在但已改为 re-export，类本体移至 `lib/types/index.js`（LlmAdapter）、`lib/types/assembler.js`（BlockAssembler）；`exports` 子路径面扩充（新增 `./invariant`、`./types`、`./brand`、`./assistant-stream`、`./typert`、`./remote`） | `dsh-llm/package.json` exports + 目录实读 | S7 7c 锚「`hostRead('dsh-llm','lib','index.js')` 含方法声明」在 0.2.0 会 miss（符号移走）——**锚文件漂移族**：锚点须跟随宿主编译布局演进，刷新流程是看护面的一部分 |
| **F-H** | **零 enforcement 持续成立**：`dsh-typert-registry` 无 instanceof 校验（contribution 为鸭子对象）；`dsh-llm` 无 `instanceof LlmAdapter`；`cordis-plugin-loader` 代码零处提及 peerDependencies；`dsh-cordis-host-runner` package.json 虽声明 8 项 peers（精确版本）但 lib 代码零 enforcement | 各包 grep 实读（0 命中） | ADR-ARCH-004-A 的裁决（peerDeps 防线已证伪、降级为记录性）在 0.2.0 **仍然成立**——本设计不复活 semver enforcement 幻觉。鸭子类型是混装（F-I）至今未炸的结构性原因 |
| **F-I** | **版本混装实证**：本仓 `node_modules/@deepseek-ai/` 仍为 0.1.5-rc.2 旧树（dsh-llm/dsh-tools/dsh-typert-protocol = 0.1.5-rc.2，cordis 4.0.1，schemastery 3.18.1）；插件 `package.json:56-73` 声明 `^0.1.5-rc.2` ×11（deps 3 + peers 8）。0.x caret 钉死 minor → 按声明安装**永远装不到 0.2.0** → 运行态 = 插件局部 0.1.5 协议对象副本 × 宿主 0.2.0 服务 | 本仓 package.json + node_modules 实读；F-F 安装机制 | 依赖声明面断裂的真实杀伤路径不是「安装失败」（零 enforcement），而是**混装的隐性风险**（靠 F-H 鸭子类型维持）+ 声明失真（记录性基线指向已不存在的世界） |
| **F-J** | 宿主靶子版本一致性判据的现状：`tests/host-contract.mjs:194` `HOST_VERSION_BASELINE`（0.1.5-rc.1/0.1.5-rc.2）与 `tests/host-version-snapshot.mjs:46-51` HOST_BASELINE 由机器一致性断言锁定双份同值 | 两文件实读 | 多基线化改造必须延续「双份常量机器锁定」纪律（FIX-037 R0 P2-1 先例），否则刷新漏改即永久噪声 |

### 0.2 本次（0.1.5→0.2.0）实际穿透点归纳

对照 ARCH-004 四维防御（D1-D4）逐维盘点本次升级的穿透路径：

| 维度 | ARCH-004 资产 | 本次表现 | 结论 |
|---|---|---|---|
| D1 依赖最小化 | 死行删除、记录性声明 | `^0.1.5-rc.2` ×11 全部失真（F-I）；inject 三包仍存续（F-C） | 声明面按设计「记录性」不炸安装，但**记录本身失去意义**——基线跳跃无机制 |
| D2 接口字段解耦 | host-abi 七域 + 降级信封 + 双形态解析 | 契约面主体存续（F-C）——**若插件能加载，运行面大概率不整页崩**（面级降级兜底）；但「插件已被用户卸载止损」说明加载/信任面先于运行面失败 | D2 是本次受害最小的维度；需补的是**版本感知**（知道自己跑在未实测基线上） |
| D3 严格校验 | host-contract S1-S7 + version-snapshot | **靶子失明**（F-A）：S3 宿主侧半边 + S7 全体 skip，宿主源码锚判据空转；白名单镜像全等断言待靶子恢复后即红（F-D，这是**正确行为**——增量登记）；锚文件漂移（F-G） | 判据体系没失效，**观测通道断了**。D3 的升级方向 = 版本矩阵化 + 靶子候选扩充 |
| D4 可调测性 | hostFaceDiagnostics RPC + 健康面板/徽章 + 诊断环形 | 面板可显示面级 degraded，但**无版本三态语义**（不知道「版本不匹配」这件事本身）；宿主升级无人发现直到用户报障 | 需补**版本协商态**与**升级检测通道**（雷达） |

**含义**：ARCH-004 的四维框架无需推翻——本次暴露的缺口集中在「声明面的基线演进机制」「看护面的靶子可达性与多版本矩阵」「运行面的版本协商态」「流程面的升级检测 SOP」四个 ARCH-004 未覆盖/未建满的子面。本设计 = 在 D1-D4 骨架上的**定向扩展**，不是重建。

### 0.3 历史断裂五族与本次状态对照（机制描述与 tracker 记载一致性自勘）

| 族 | tracker 记载机制（plan-tracker ARCH-005 行 + 对应任务行） | 本次 0.2.0-rc.2 同面状态（一手） |
|---|---|---|
| FIX-003 | 宿主静默更新→附件注册行为回归（宿主升级零通知通道，RISK-003 首个实证族） | silent update 模式延续：宿主自更新后插件无任何感知通道（本次用户手动卸载止损即为该族重演） |
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
| peerDeps 记录性语义（ADR-ARCH-004-A） | decision-log（已裁决） | 延续——本设计不复活 enforcement 依赖 |
| 诊断环形 + hostFaceDiagnostics RPC + 健康徽章 | `lib/host-abi/health.js` + `lib/rpc.js` + 设置页面板 | 复用；扩展返回字段（版本协商态 + 能力档案） |

---

## 1. 目标与设计需求映射

| 用户目标（验收维度） | 功能需求 | 非功能需求 |
|---|---|---|
| 「避免每次升级插件都会失效」 | ① 声明面随宿主基线演进有明确策略与更新机制；② 运行面对 additive 漂移自动吸收、对语义变更显式适配且判据成文；③ 升级检测通道（silent update 不再无感） | 适配成本量化（目标：minor 跳位适配 ≤1 人日——ARCH-004 §7.3 已达 0.5-1 人日/面级漂移，本设计保住并扩展到版本级） |
| 「至少失效可观测」 | ④ 版本协商三态（matched / compatible-unknown / incompatible）用户可见；⑤ 看护面靶子对新安装位置可达；⑥ 失效路径全部产出诊断事件（P8） | 零新增常驻开销（探针惰性纪律延续）；面板徽章不依赖 console |
| 「可低成本适配」 | ⑦ 升级 SOP 五步成文（检测→diff→分级→适配批→发布）并与工具接线；⑧ 看护矩阵化：多宿主基线参数化 + 新基线登记半自动化 | SOP 每步有机器可执行入口（雷达/diff 报告/判据红绿演示） |

**硬约束**：P1（一切断言锚定实读事实）/ P4（测试零回退）/ P5（同一动作多触发来源单路径、旧路径删除、禁止推翻重建 ARCH-004 已审资产）/ P8（失败降级可观测，禁止无限容错）/ P9（能力自证，禁单向信任宿主）/ P10-④（测试桩锚定宿主源码）。

**容错边界总纲（本设计的「不许无限容错」条款，先于方案陈述）**：

- **可自动吸收（tolerant reader）**：宿主侧**超集增量**——新增方法、新增导出、新增白名单事件、schema 新增未消费字段、新增包/子路径 exports。判据 = 「宿主实读面 ⊇ 插件消费基线面」。吸收必须留痕（能力档案记录 delta + 一次性诊断事件），不许无观测吸收。
- **必须显式适配（fail-loud）**：已消费面的任何**收缩或改名**——方法移除、字段改名/消失、事件除名、参数签名变化、类型变化。判据 = 「插件消费基线面 ⊄ 宿主实读面」。行为 = 静态测试红（dev/CI 靶子可达时）+ 运行时 degraded 信封/徽章 + `host-face-shape` 类诊断事件。
- **禁止的容错形态**：猜测性别名映射（把 `displayName→display_name` 自动映射之类）、跨类型强制转换、catch 后静默沿用旧逻辑——这些会把语义变更伪装成成功，违反 P1/P8。改名永远走人工显式适配 + 判别测试。

---

## 2. 候选方案（ADR 形式，评估标准先定义）

**评估标准（评估前定义）**：① 对五族断裂模式 + 本次四穿透点（§0.2）的覆盖度；② 单次宿主升级的预期适配成本（人日/文件数/是否自动化）；③ 实施风险与回滚粒度；④ 长期维护成本（声明面膨胀度/矩阵规模/SOP 步数）；⑤ 与 ARCH-004 资产的兼容性（复用率/推翻面）。

### 方案 A：多范围声明 + 人工锚刷新（保守最小改）

- **四维-a 声明面**：deps+peers 全部改多范围 `^0.1.5-rc.2 || ^0.2.0-rc.2`；README 矩阵记录两个实测基线；peerDeps 保持 required + 记录性语义（不改 meta）。
- **四维-b 运行面**：不动 ARCH-004 现状（面级 probe + degraded 信封已天然吸收 additive 漂移——F-C 实证）。不新增版本协商态。
- **四维-c 看护面**：HOST_BASELINE 扩为双版本常量表（0.1.5-rc.2 冻结 + 0.2.0-rc.2 主基线，延续双份机器锁定 F-J）；靶子解析加全局 npm 树候选（修 F-A）；锚与白名单镜像按 0.2.0 实读刷新（F-D/F-G）。新宿主纳入 = 人工刷新（沿用测试文件头既有四步刷新程序）。
- **四维-d 流程面**：无新工具。SOP = 现有 README「宿主升级后请同步刷新基线」一句话 + 测试头注释步骤（人工触发）。
- **入选理由**：改动最小（约 4 文件），与即将进行的 0.2.0 适配批天然合流。
- **排除理由（不推荐为终态）**：多范围集合随版本数线性膨胀（0.3.0 时 `^0.1.5||^0.2.0||^0.3.0`——记录性声明失去可读性）；silent update 检测仍为零（FIX-003 族无对策——用户仍是第一发现人）；每次升级的全量 diff 仍纯人工（Analyst 级工作量每次重付）；版本混装（F-I）无任何可见性。

### 方案 B：基线档案矩阵 + 版本协商态 + 漂移雷达（推荐）

核心思想：把「宿主版本依赖」从**散布在 11 个 semver 字符串 + 一组冻结常量**的东西，收敛为**单一「基线档案」（baseline profile）数据结构**，声明面/看护面/运行面/流程面四维全部从这份数据派生——单一事实源（P5）。

- **四维-a 声明面（基线跳跃式）**：deps+peers 保持**单范围**（适配完成后 `^0.2.0-rc.2`），不做多范围并集；「支持哪些宿主版本」的权威表达移交**基线档案表**（含历史实测基线 0.1.5-rc.2〔冻结——契约基线仍在测试树中〕+ 当前主基线 0.2.0-rc.2）+ README 矩阵（人类可读投影）。peerDeps 加 `peerDependenciesMeta: { "*": { "optional": true } }`（决策点 DEC-2）：记录性语义不变（ADR-ARCH-004-A 不复活 enforcement），但消除 pnpm profile 安装（F-F）下 required-peer 的告警噪声/自动装行为差异。
- **四维-b 运行面（版本协商三态 + 能力档案）**：扩展 `lib/host-abi/version.js` 为版本协商域：
  - `hostCapabilityProfile(ctx)` = `{ versions（复用 hostVersionsOf）, faces: FaceHealth[]（复用 probe 快照）, state: 'matched' | 'compatible-unknown' | 'incompatible' }`；
  - 判定规则（精确语义）：`matched` = 宿主版本组合 ∈ 基线档案表 **且** 关键面 probe 全绿；`compatible-unknown` = 版本 ∉ 档案表 **但** 全部关键面 probe 绿（继续运行 + 健康徽章「未实测宿主版本」提示 + 一次性 `host-version-unknown` 诊断事件——P8）；`incompatible` = 任一关键面 missing/shape-degraded（**面级降级继续运行，不自杀**——ARCH-004 D2 语义延续；徽章 ⚠ 指认具体面）；
  - 关键面清单 = CTX_SERVICES ∪ CLIENT_REMOTE_FACES 派生（复用 `ctxServiceFaceProbes()` 单点派生纪律），不手抄；
  - 容错边界即 §1 总纲：超集增量吸收（如白名单 19→27）自动通过并记录 delta；收缩/改名 fail-loud；
  - 产出并入 `router/hostFaceDiagnostics` RPC（已有通道加字段，报障一键导出自含协商态）。
- **四维-c 看护面（矩阵参数化 + 靶子扩充 + 雷达）**：
  - **靶子解析扩充**：候选链 `DSH_HOST_SOURCE` > `DSH_HOST_PACKAGES` > npm 全局树（`%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai` 探测 + `npm root -g` 兜底）> `_npx` 降序（保留）——修 F-A；靶子多候选时版本一致性告警机制（既有 FIX-037 ③）自然覆盖「混装/多副本」场景的判定；
  - **基线档案驱动**：host-version-snapshot 的 HOST_BASELINE 单表 → 档案表 `[{ id:'0.1.5', dsh:'0.1.5-rc.1', dshPackages:'0.1.5-rc.2', …, status:'frozen' }, { id:'0.2.0', dsh:'0.2.0-rc.2', …, status:'primary' }]`；host-contract 的版本副本断言从「单值相等」改为「主基线项相等」；
  - **白名单镜像断言语义升级**：S7 7a 从全等改为**单向消费断言**（插件消费事件 ⊆ 宿主实读白名单）+ **镜像基线登记**（镜像常量记录其锚定宿主版本；宿主侧超集时绿 + 打印增量清单，消费项除名时红）——F-D 的增量不再制造人工刷新负担，但除名/改名仍红；
  - **锚基线档案化**：HOST_SHAPE_ANCHORS / WIRE_SCHEMA_WHITELIST 条目增加 `since`（锚定宿主版本）；锚文件路径漂移（F-G 族）按 per-anchor 档案刷新；
  - **CI 矩阵 job**：ci.yml 增 matrix（每基线一项）：安装 pinned 宿主关键包（`npm i --no-save @deepseek-ai/dsh@<ver>` 或 registry tarball 到专用目录 + `DSH_HOST_SOURCE` 指向）→ 跑同一条门控命令（单入口复用）→ S3/S7 在 CI 不再全 skip；
  - **漂移雷达（升级检测）**：新增 cron workflow（建议周频）：`npm view @deepseek-ai/dsh version`（registry 查询）比对基线档案主基线 → 发现新版本即触发 **probe-mode job**：安装新宿主 → 跑契约套件的「无基线断言模式」（只产 diff 报告工件：哪些锚 miss、哪些白名单项增删、哪些 schema 字段变化）→ 开 issue 通知。**雷达是探测不是门控**——probe-mode 不红不绿，只产报告（决策点 DEC-3：载体与频率）。
- **四维-d 流程面（SOP 五步 + 接线点）**：
  1. **检测**：雷达 cron（自动）/ 本地跑测试时靶子版本一致性告警（FIX-037 ③ 既有）/ 用户报障时健康面板「未实测宿主版本」徽章（三态）；
  2. **diff**：probe-mode 报告工件（锚/白名单/schema/包表四类 diff）+ Analyst 人工契约比对（本任务并行轨的产出形态固化为模板）；
  3. **分级**：按 §1 容错边界归类——超集增量 → 仅登记（刷新基线档案 + 镜像 + 锚）；语义变更 → 进适配批（改域文件 + 判别测试）；
  4. **适配批**：实施链（见 §6 批次）；声明面基线跳跃 + 档案新增项 + README 矩阵行，一次 commit 承载（编程要求 4）；
  5. **发布**：版本承载 + 装回真机复验（FIX-049 类真机复验随「发布→重装」顺延——tracker ARCH-005 行既有约定）。
  - 接线点汇总：`router/hostFaceDiagnostics` RPC（运行时协商态）/ 健康面板徽章（用户可见）/ 靶子解析启动行（dev 可见）/ 雷达 issue（开发可见）。
- **入选理由**：四穿透点（§0.2）逐一闭合且五族中唯一完整重演的 FIX-003（silent update）获得结构性对策（雷达 + 三态）；单次升级适配成本从「全量人工 diff（3-5 天盲区）」降为「雷达半自动 diff + 分级登记（预期 ≤1 人日，纯增量时接近零代码改动——只刷档案）」；ARCH-004 资产复用率最高（§3 表）。
- **代价**：新增 1 个 cron workflow + 1 份档案数据结构 + 1 个运行时协商函数群；维护面增加「档案登记」义务（SOP 第 4 步内置）。

### 方案 C：宿主供给反转（协议对象从宿主树解析，消混装）

- **四维-a 声明面**：`dependencies` 中 3 个 dsh 运行时包（dsh-llm/dsh-tools/dsh-typert-protocol）降为 peers（或彻底移除）——插件不自带宿主协议对象副本；11 项声明全部 peers + optional meta。
- **四维-b 运行面**：协议对象（LlmAdapter/BlockAssembler/defineTool/TypertRemoteService）经宿主树动态解析（`createRequire` 从宿主 runner 提供的解析根 / 宿主 ctx 暴露的 require 面）——运行态插件与宿主**同一份类定义**，F-I 混装从结构上消失；F-H（零 instanceof）现状下鸭子类型兜底继续有效。
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
| 9 | peerDeps 记录性语义（ADR-ARCH-004-A） | **延续** | 不复活 enforcement；optional meta 仅消 pnpm 告警（DEC-2 裁决后定） | 无 |
| 10 | hostFaceDiagnostics RPC + 健康面板/徽章 | **扩展** | 返回加 `capabilityProfile` 字段；徽章渲染三态（matched 绿 / unknown 黄「未实测宿主版本」/ incompatible ⚠ 面级） | 无 |
| 11 | SOP/升级流程 | **新增**（ARCH-004 无此资产） | §2-B 四维-d 五步 SOP 文档化 + 雷达/报告工具接线 | —（新面） |

**结论**：零推翻项；两项新增（雷达 workflow、SOP 文档），其余全部为「复用」或「沿既有单点的定向扩展」。所有扩展遵守「同一动作多触发来源汇入同一实现路径」（如版本事实源唯一 = 基线档案；靶子解析唯一 = host-contract 既有解析函数扩充而非第二实现）。

---

## 4. 蓝军推演（3 轮 × 每案，攻击场景具体化）

### 第 1 轮：0.3.0 发布当天 silent update（FIX-003 族复演）

| 案 | 推演 | 穿透判定 | 依据 |
|---|---|---|---|
| A | 声明面再失配（`^0.1.5\|\|^0.2.0` 不含 0.3.0）；无人知道宿主已变（无检测通道）；用户第一发现人（功能异常/卸载止损——本次 0.2.0 的实际剧本重演）；开发者介入后全量人工 diff（锚/白名单/schema 逐项手比） | **穿透**：检测延迟 = 用户报障驱动（天级）；适配成本 = 全量人工 | F-A/F-I 机制 + 本轮 0.2.0 实际经历 |
| B | 雷达 cron ≤7 天内发现新版本（或开发者下次本地跑测试即被靶子版本一致性告警拦截——FIX-037 ③ 既有机制 + 新候选路径可达）；probe-mode 自动产 diff 报告；若 0.3.0 为纯超集增量 → 适配 = 刷新基线档案/镜像/锚（近零代码）；若有语义变更 → 对应静态判据红 + 运行时面 degraded 徽章（用户侧早已可见「哪一面不可用」） | **不穿透**（失效可观测 + 适配半自动）；残余暴露面 = 雷达窗口期内（≤7 天）用户已在 unknown 态运行——但三态徽章使其可见 | §2-B 判定规则 + F-D 增量先例 |
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
| A | 拆分（如 dsh-agent-presets→preset+registry）不直接影响插件（插件消费的是 ctx 服务名 `agentPresets` 与事件 `agent-preset/selected`，均存续——F-C/E 实证），但 A 的锚/快照若引用了被拆包名则人工排查定位；混装（插件局部 0.1.5 副本 × 宿主 0.2.0 服务）在零 instanceof（F-H）下**隐性存活**——宿主任何一次引入类品牌校验（instanceof/Symbol.toStringTag）即整链硬崩，A 对此零可见性零防御 | **穿透**（混装为潜伏雷：无观测、无告警、触发即崩） | F-E/F-H/F-I 实证 |
| B | 混装在协商态下**显式可见**：`hostVersionsOf`（读插件局部树=0.1.5）× 靶子/雷达侧宿主版本（0.2.0）不一致 → 版本一致性告警（FIX-037 ③ 既有机制，靶子修复后生效）+ 面板 unknown/incompatible 态暴露；基线档案 primary 跳到 0.2.0 后，局部副本 0.1.5 = 过期混装被档案判据点名（`declaredRange` 断言红）；拆分包名进锚档案 `since` 登记，S2/S5 的包存在性核验对消亡包显式红（非静默 skip——判据现状已如此，:627-629） | **不穿透**（可见 + 判据点名）；残余风险 = 宿主未来引入类品牌校验仍会崩——但三态徽章先期暴露版本错配，排障路径清晰 | F-J + §2-B |
| C | 拆分直接打击解析表（包名→路径映射失效）→ 协议对象解析失败 → 比 A/B 更脆；但混装本身被结构消除（无局部副本可混） | **条件不穿透**：混装消除 vs 解析脆化互为代价 | §2-C |

**蓝军总评**：B 在三轮中均不穿透或降级为可见失效；A 的共同弱点 = 检测通道缺失（第 1 轮穿透）+ 混装零可见（第 3 轮穿透）；C 的供给反转在 silent update 场景下**放大**即时报复面（第 1 轮穿透）——蓝军结论支持 B 推荐，同时识别 B 的两个残余暴露面（雷达窗口期、verifyDeep 非全时覆盖）并如实登记（§7 风险表）。

---

## 5. 推荐方案与理由

**推荐：方案 B（基线档案矩阵 + 版本协商态 + 漂移雷达）**，以 A 的第一步（靶子修复 + 基线刷新）为 B 的 R0 批内容（A ⊂ B，无弃置成本）。

核心理由（按评估标准）：
1. **唯一对 FIX-003（本次完整重演的族）给出结构性对策的方案**——检测通道（雷达 + 靶子告警 + 三态徽章）三层，用户不再是第一发现人；
2. **适配成本结构性下降**：纯增量升级（本次 0.2.0 的主体形态——F-C/F-D 实证）适配 ≈ 刷新档案/镜像/锚的登记动作（近零代码）；语义变更仍保 ARCH-004 已达成的 0.5-1 人日/面级成本；
3. **ARCH-004 复用率最高、零推翻**（§3 表）——P5 纪律直接满足；
4. C 的核心价值（消混装）以可见性方式部分获得且其结构性根治保留为受控预研（DEC-4），不押注未证实前提（P1）。

---

## 6. 实施批划分建议（EVO 链依赖序——编号由 Coordinator 落位，此处以 R* 占位）

> 依赖序：**R0 → R1 →（R2、R3 可并行）→ R4 → R5**。R0 与「0.2.0 适配任务」的适配批存在文件重叠（tests/host-contract.mjs、package.json、README）——合流方式是决策点 DEC-5。
> 每批一个 commit 承载一个问题（编程要求 4）；全批跑全量测试网 `node tests/run-all.mjs`（P4 零回退）。

| 批 | 内容 | 文件面 | 验收门（判别性红/绿） | 回滚 |
|---|---|---|---|---|
| **R0 靶子修复 + 0.2.0 基线登记批**（= 方案 A 全部内容，先行止损） | 靶子解析加 npm 全局树候选；HOST_BASELINE → 双基线（0.1.5 frozen / 0.2.0 primary）；白名单镜像刷新至 27 项 + since 注记；锚刷新（dsh-llm lib/types 布局等 F-G 族）；S7 7a 改单向消费断言 | tests/host-contract.mjs、tests/host-version-snapshot.mjs、lib/host-abi/events.js（镜像常量） | ① 靶子可达（启动行打印全局树路径 + 版本一致性绿）；② S7 全绿（含 27 项白名单单向断言 + 增量清单打印）；③ 红/绿演示：临时删宿主侧一个消费事件 → 红；④ 全量网绿 | revert 单 commit |
| **R1 声明面基线跳跃批** | package.json 11 项 → `^0.2.0-rc.2`；peerDependenciesMeta optional（按 DEC-2 裁决）；README 矩阵改支持基线集表 | package.json、README.md | host-version-snapshot 主基线断言绿（改动假版本 → 红 演示）；npm/pnpm 安装面冒烟（无 required-peer 告警） | revert 单 commit |
| **R2 运行面协商态批** | version.js 增 hostCapabilityProfile + 基线档案表（Node 侧）；RPC 加 capabilityProfile 字段；健康徽章三态渲染 | lib/host-abi/version.js、lib/rpc.js、lib/schemas.js（RPC schema）、lib/client.js（徽章镜像同步——遵守镜像 parity 纪律）、tests/host-abi-health.mjs | 判别测试：stub 版本 ∈ 档案 → matched；∉ 档案且面绿 → unknown + 一次性诊断事件；任一关键面 degraded → incompatible；真机面板截图证据（P10-③）；渲染期零 probe 判别（探针三时机纪律不破） | revert 批 commit（含镜像） |
| **R3 看护矩阵批** | host-contract/host-version-snapshot 档案参数化（多基线断言）；锚/S5 条目 since 字段成文；CI matrix job（pinned 宿主安装 + DSH_HOST_SOURCE 指向 + 同门控命令） | tests/host-contract.mjs、tests/host-version-snapshot.mjs、.github/workflows/ci.yml | CI 矩阵两基线 job 全绿（S3/S7 在 CI 不再 skip——`#SKIP` 计数下降与预期吻合）；单基线断言红/绿演示 | revert 批 commit；matrix job 可独立禁用（workflow 层开关） |
| **R4 雷达批** | cron workflow：registry 版本查询 → 比对档案主基线 → 新版本触发 probe-mode job（装新宿主 → 契约套件 diff 报告工件 + issue）；雷达心跳可观测（连续 N 次未跑 → 自身告警，防雷达静默死亡——蓝军第 1 轮缓解的完整性） | .github/workflows/host-radar.yml（新增文件） | dry-run 演示：以 0.2.0 为「新版本」触发 → 报告工件产出（锚/白名单/schema/包表四类 diff 清单）+ issue 开立 | workflow 删除即回滚（零产品面） |
| **R5 SOP 固化批** | 升级 SOP 五步文档（§2-B 四维-d 成文）+ 基线登记 checklist 模板 + proposed ADR（§8）随报告返回由 Coordinator 写回 decision-log | README.md（维护段）或 docs/（由 Coordinator 定）、.governance/decision-log.md（Coordinator 写回） | 以本次 0.1.5→0.2.0 升级做 SOP retrospective walk-through：五步每步有机器入口且按 SOP 重放可得出与本设计 §0 一致的事实清单 | 文档 revert |

**总量判断**：R0-R1 为适配止损半边（与 0.2.0 适配任务合流，DEC-5）；R2-R4 为解耦增量半边；R5 收口。产品代码面仅 R2 涉及（version.js/rpc/schemas/client 徽章），其余全部在测试/CI/文档面——与「解耦设计」任务性质匹配（架构资产轻侵入）。

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
| 雷达窗口期（cron 间隔内 silent update 已在用户侧运行） | 中 | 中 | 三态徽章用户侧可见（unknown 态显式提示）；本地靶子告警兜底；频率是 DEC-3 裁决项 |
| unknown 态泛滥（宿主高频 rc、档案登记滞后 → 用户长期见黄徽章） | 中 | 低 | SOP 第 4 步内置登记义务；unknown 判据收紧（面全绿才算，任一面 degraded 即 incompatible——不把故障伪装成「只是没测过」） |
| 基线档案成为新单点（漏登记/登记错误 → 四消费方同时失真） | 低 | 中 | 档案本身受 host-version-snapshot 断言看护（自我指涉的最内圈：档案 vs package.json vs README 三方一致）；双份机器锁定纪律延续（F-J） |
| CI 矩阵安装 pinned 宿主的供应链漂移（registry 端 tarball 变化/弃用） | 低 | 中 | pin 精确版本 + integrity；矩阵 job 失败不阻塞主门控（独立 job，主门控维持现有单命令语义） |
| 镜像单向断言放宽后被滥用（消费侧新增事件不更新镜像即静默通过——新消费项仍须镜像内） | 低 | 低 | 单向性是「宿主 ⊇ 镜像」方向；消费事件 ∉ 镜像仍红（S6 既有断言不动）——两个方向各自锁死，无静默缝 |
| verifyDeep 激活面选择不当（过宽 → 性能预算破；过窄 → 字段漂移运行时不可见） | 中 | 中 | DEC-6 留用户裁决；默认保守（仅健康面板刷新 + 失败驱动复检两时机——不进调用热路径） |

---

## 8. ADR（proposed——随报告返回，Coordinator 评审后写回 decision-log）

### ADR-ARCH-005-A：以基线档案（baseline profile）为单一事实源的宿主版本依赖解耦

- **标题**: Adopt a baseline-profile registry as the single source of truth for host version dependency, with version-negotiation tri-state and drift radar
- **日期**: 2026-10-16
- **状态**: proposed（推荐方案 B；最终选型留用户/审查链）
- **背景**: 宿主 0.1.5-rc.2→0.2.0-rc.2 再次证明：0.x minor 跳位使插件声明面（`^0.1.5-rc.2` ×11）整体失真；宿主安装位置换代（npx cache → npm 全局树）使 ARCH-004 D3 看护靶子全体失明（S3/S7 skip）；silent update（FIX-003 族，五族中唯一本次完整重演者）无任何检测通道，用户以卸载止损。同时一手探针证明契约面主体存续（LlmAdapter 7 方法/message 8 导出/六 wire schema/selectModel 链/InputState 均在）、转发白名单 19→27 纯增量、零 enforcement 与零 instanceof 持续成立——失效集中在声明面演进机制、看护靶子可达性、版本感知与升级流程四个子面，ARCH-004 D1-D4 骨架无需推翻。
- **决策（建议）**: ① 以「基线档案」数据结构（版本集 + 状态 primary/frozen + 锚定注记）为宿主版本依赖的单一事实源：声明面单范围基线跳跃（多范围并集排除）、看护面多基线矩阵、运行面协商三态（matched/compatible-unknown/incompatible）、流程面 SOP 五步全部由其派生；② 容错边界成文：宿主超集增量自动吸收留痕，已消费面收缩/改名必须显式适配（fail-loud），禁止猜测性别名映射；③ 升级检测三层（雷达 cron / 靶子版本告警 / 三态徽章）；④ peerDeps 记录性语义延续，不复活 semver enforcement。
- **备选方案**: A 多范围声明 + 人工锚刷新（排除：检测通道缺失、适配成本每次全量重付、声明面线性膨胀）；C 宿主供给反转（排除：核心前提「宿主模块图对插件 require 可达」零一手证据，推翻 D1-6 已审裁决需新证据；silent update 下放大即时报复面——蓝军第 1 轮）。
- **排除理由**: 见 §2 各案排除理由 + §4 蓝军三轮。
- **影响范围**: tests/host-contract.mjs、tests/host-version-snapshot.mjs、lib/host-abi/{version,events}.js、lib/rpc.js、lib/schemas.js、lib/client.js（徽章镜像）、package.json、README.md、.github/workflows/{ci.yml, host-radar.yml}。
- **后续动作**: 实施批 R0-R5（§6）；与 0.2.0 适配任务合流方式（DEC-5）；C 案预研立项与否（DEC-4）。
- **可逆性**: **高**——每批独立 revert；雷达/matrix 为 workflow 层可独立禁用；档案数据结构可回退单基线形态（向后兼容）。

---

## 9. 决策点清单（供用户/审查链裁决——本设计不做最终决策）

| # | 决策点 | 选项与推荐依据 | 推荐 |
|---|---|---|---|
| **DEC-1** | 声明面策略：基线跳跃单范围（B）vs 多范围并集（A） | 基线跳跃：长期可读 + 档案承载历史（§2-B a）；多范围：无档案依赖但线性膨胀（§2-A a） | B |
| **DEC-2** | peerDeps 是否加 `peerDependenciesMeta optional` | 加：消除 pnpm profile 安装（F-F）下 required-peer 告警/自动装差异；不加：保持现状零改动（npm 安装器本来零告警） | 加（低风险） |
| **DEC-3** | 雷达载体与频率 | GitHub Actions cron 周频（推荐）/ 日频（更早发现、配额消耗高）/ 本地脚本（依赖开发者纪律，弱） | Actions cron 周频 |
| **DEC-4** | C 案（宿主供给反转/消混装结构性根治）是否立项预研 | B 落地后以可见性覆盖混装；结构性根治需先证实解析机制（install.ps1/plugin-manager 两形态的 require 可达性一手取证） | 暂缓，B 落地后评估 |
| **DEC-5** | R0/R1 与 0.2.0 适配任务的合流方式 | 单 EVO 链（文件重叠大——tests/package.json/README，避免双头改）/ 分链（适配与解耦分批 triage 清晰） | 单链分批 |
| **DEC-6** | verifyDeep 运行时字段抽查激活面 | 仅健康面板刷新 + 失败驱动复检（保守，零热路径）/ 增加关键 RPC 定期抽查（覆盖广、有轮询纪律成本——需对齐 D1-10 治理口径） | 保守档 |
| **DEC-7** | 基线档案的物理载体 | tests 内常量（与现有 HOST_BASELINE 同形态，零新文件）/ 独立 JSON 档案文件（机器可读性高、多一处同步面） | tests 内常量起步 |

---

## 10. Design Doc 最小结构自检（stage-architecture SKILL 退出条件预检）

- [x] 目标（§1）/ 方案（§2 三案四维）/ 替代方案 ≥2 且各有排除理由（§2 A/C）/ 风险（§7.2）/ 非功能覆盖（§7.1）五项齐全
- [x] 候选方案 ≥3（SKILL 角色 hard gate ≥2 的加强满足）
- [x] 蓝军挑战 ≥3 且逐条回应（§4 三轮九格，各含穿透判定与依据）
- [x] ADR 字段完整：标题+日期+背景+决策+备选方案+排除理由+影响范围+后续动作+可逆性（§8）
- [x] 模块无循环依赖、职责单一：version.js 扩展仍在 host-abi 依赖图「消费者→桶→域→health」单向结构内（§3-2）；基线档案为数据常量非模块
- [x] 独立评审：本文档即为 Design Reviewer 的审查对象（含决策点留位 §9）
- [x] 与项目原则对照：P1（§0 全锚点）/ P4（§6 每批门）/ P5（§3 逐项）/ P8（§1 容错总纲 + §7.2 unknown 观测）/ P9（协商态 = 能力自证）/ P10-④（锚档案 since 登记 + 判别夹具同源延续）
- [ ] Bar Raiser / 蓝军结论用户确认、评审人选与评审结论——**留待审查链（Coordinator 安排 Design Reviewer）**

---

*（完——本文档为 ARCH-005 设计产出物；实施留后续批；ADR proposed 文本由 Coordinator 评审后写回 decision-log；最终选型与 DEC-1…DEC-7 由用户裁决。）*
