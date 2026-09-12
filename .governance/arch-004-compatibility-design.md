# ARCH-004 — DSH 宿主兼容性架构四维设计（Design Doc）

- **生成时间**: 2026-09-12
- **任务**: ARCH-004（P0）——D1 依赖最小化 / D2 解耦单点 / D3 校验看护 / D4 边界可调测性
- **插件侧源码（工作区，现状锚点来源）**: `D:/AI/agent/deepseek/plugins/router`（`lib/` 15 模块 + `tests/` 22 套件，v0.4.6）
- **宿主侧源码（一手只读权威）**: `C:/Users/peter/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/`（0.1.5-rc.2 系，约 220 包）
- **事实来源标注**: 本文宿主侧结论全部实读升级后 checkout（Architect 一手取证 2026-09-12）；标注「Coordinator 机核 2026-09-12」的为 Coordinator 机器核验补充事实；两者一致时以一手复证为准。断链史锚点引用 FIX-* 事件。
- **修订记录**: R0（2026-09-12，同日）——Design Reviewer R0 APPROVED_WITH_NOTES（unresolved_blockers=0）后非阻断修正：W-1（:2116 定性修正 + D1-10 显式裁决）/ W-2（peerDeps 8 项口径）/ W-3（events 域口径收窄 + 守卫对齐）/ W-4（B5 扩入客户端 $on 面：:2093 死订阅修复 + 白名单双检）/ S-5（字段级 wire schema 白名单断言）；机核裁决补记见 §0.5。架构决策（方案 C / 七域 / B0-B6）不变。
- **输出边界**: 本文档为唯一产出物。ADR 以 proposed 文本随附（§11），不直写 decision-log；不修改任何产品代码/测试/package.json/治理状态文件。

---

## 0. 事实基础

### 0.1 宿主漂移现状（本次断裂的宏观背景）

| 事实 | 锚点 | 来源 |
|---|---|---|
| 关键 `@deepseek-ai/*` 包全部 = **0.1.5-rc.2**（dsh=0.1.5-rc.1，cordis=4.0.2） | 宿主 checkout 各 package.json 实测 | Architect 一手 + Coordinator 机核 2026-09-12 |
| 插件上次适配面 = 0.1.1-rc.8 → 0.1.2-rc.1（FIX-028/029/030 链）；本次跨 3 个 rc 小版本静默漂移 | `.governance/` 断裂链 | Coordinator 机核 2026-09-12 |
| **`@deepseek-ai/dsh-client-runtime` 在升级后宿主中不存在**；新包 `dsh-client-modules` 承接（自述 "single replacement for how plugin code arrives"） | 宿主包目录实测（无 dsh-client-runtime；有 dsh-client-modules） | Architect 一手 + Coordinator 机核 |
| 宿主加载器/runner **零 peerDependencies enforcement** | `dsh-cordis-host-runner/lib`、`cordis/lib` grep `peerDependencies` 零命中（实测） | Architect 一手 |
| 插件 peerDeps `^0.1.0-rc.8` / deps `^0.1.0-rc.6` 对 0.1.5-rc.2 宿主**安装器零告警**——依赖声明形同虚设 | `package.json:52-69` vs 宿主实测 | Coordinator 机核 2026-09-12 |
| `dsh.client.inject` 语义已变：informational package-name dependencies（dsh-package-manifest `types.d.ts:42-43`）+「consumer 物化前必须先注册的 package rows」（dsh-client-modules `lib/client.js:252-265`）；模块解析 seed → memoized → boot-graph → factories，**anything else throws**（README L64） | dsh-client-modules 源码实读 | Coordinator 机核 2026-09-12 |
| **inject 行写不存在的包名 = 静默无效**：`arriveGraphRow` 对缺失目标 `if (dependency !== void 0)` 直接跳过 | dsh-client-modules `lib/client.js:265-268` | Architect 一手（关键防御缺口） |
| `dsh.bundle.patch` / cordis.patch.yml 宿主行 insert 语义在 0.1.5 存续未变（新增 `patchReload: live|startup`，web 模板 = live）；**对不存在条目仅 stderr 警告**（又一个静默降级面） | dsh-app-boot `lib/index.js:293-314`、README L50/L55 | Coordinator 机核 2026-09-12 |
| 插件消费的关键服务面在 0.1.5-rc.2 **仍存续**：`sessionController.selectModel/modelCatalog`（dsh-api-session-controller `index.js:605/2502-2503`）、`llm.registerAdapter/listProviders/listConfigurableProviders/listModels`（dsh-llm `index.js:1780/1846/1905/1653`）、`modelDirectories` 服务（dsh-client-ui-model-selection `client.js:272`）、转发事件 `agent-preset/selected`（dsh-api-remotes `API_REMOTE_FORWARDED_EVENTS`） | 宿主源码实读 | Architect 一手 |

**含义**：本次症状不是单一接口移除，而是 (a) 客户端加载体系换代（dsh-client-runtime → dsh-client-modules）叠加 (b) 面内形状漂移的复合风险——任何一处裸消费 undefined 面都会复现 FIX-028 形态的整页崩溃。

### 0.2 症状与断裂模式

- **症状①（部分插件设置页崩溃）**：先例形态 FIX-028——`connection.api` 移除 → `Cannot read properties of undefined (reading 'llm')` 整页崩。当前 `hostApiFace` 内 `unavailable(name)` 仍是 **throw 语义**（`lib/client.js:4908-4912`），面缺失时页面只得到「加载失败」整行而非该面卡片级降级；渲染路径上任何未包 try/catch 的面读取（如 `props` 形状漂移经 FIX-029 B 组同源路径）可直接击穿组件树。
- **症状②（DSH 整体异常卡顿）**：候选机制 = 每渲染探针 / 事件风暴 / RPC 风暴 / 遥测放大。现状锚点（W-1 修订定性，2026-09-12）：**`lib/client.js:2098-2118` = 设置页打开期常驻的用量统计 + presetDiag 双 RPC 轮询（每 2s，注释原词 "实时用量轮询（页签打开期间每 2 秒刷新一次）"）**；`lib/client.js:5122` 30s catalog 轮询（单 timer，有界）；OAuth 登录流轮询实际位于 `lib/client.js:2816-2851,3044-3049` setTimeout 链（用户触发、有界）；服务端 `hostRouteQueue` 自激回环曾在 FIX-030 时代爆发（F-1 回环抑制已落地，`lib/host-route.js:270`）。优先序重排（Coordinator 机核 2026-09-12）：T-10/T-11 权重上升——设置页常驻 2s 双 RPC 轮询取代「每渲染探针」成为症状②首要嫌疑面（显式裁决见 D1-10 / B5）。设计必须保证**适配层与诊断体系自身不成为新的性能负担**（蓝军 BR-01）。

### 0.3 历史断裂链（设计输入：逐点打补丁的证据）

FIX-001（twin 缺 `prepareCall`）→ FIX-003（附件注册行为回归）→ FIX-007（rc.2 附件链 rejected）→ FIX-022（RPC 域名单复数陷阱）→ FIX-023（`ctx.agents` 属性面 inject 缺失）→ FIX-026/027（`modelDirectories` 裸解析）→ FIX-028（`connection.api` 移除 → hostApiFace 适配层诞生）→ FIX-029（input 快照 → useInput + selectionFor 双形态适配）→ FIX-030（apiProxy 消失 + delegation 基线变更 → 双断裂 + presetDiag 64 探针诊断环形）→ FIX-031（归因键空间分裂 → 单点化）→ FIX-032（预设 subagent 模型继承面）。

12 次断裂中 9 次集中在三类面：**客户端 remote/props 面**（028/029）、**服务运行时 ctx 服务面**（023/030/032）、**llm·selection 面**（001/026/027/031）。这是 §2 候选方案分级与 §4 域划分的直接依据。

### 0.4 既有可复用资产盘点（P5 复用门禁——禁止重复造轮子）

| 资产 | 现状锚点 | 本设计的复用方式 |
|---|---|---|
| `hostApiFace` 适配层（FIX-028）：remote.* 五命名空间 → 旧信封收敛，面延迟解析双形态（`ctx.get` 优先 + 属性面兜底，FIX-027 先例） | `lib/client.js:4903-5042`（`faceOf` :4904-4907） | **整体迁入** D2 `host-abi/client-remotes.js`，throw 语义改为面级降级（§4.3） |
| `sessionSelectFaceOf` 双形态适配（FIX-030-A：sessionController 新面优先 / apiProxy 旧面回落，归一信封） | `lib/preset-defaults.js:209-240` | 迁入 D2 `host-abi/llm-selection.js` 作域内标准双形态范式 |
| `inheritedRouteOf` 继承基线（FIX-030-B：与宿主 `parentAgentOptionsForDelegation` 同构） | `lib/preset-defaults.js:249-263` | 同上 |
| `probeHostRoute` P9 parity 自证（写后探活 + 失败回滚，判「目录事实形状」） | `lib/host-route.js:218-232` | 推广为 D3(b) 运行时能力自证的标准范式（真调用判返回形状，非仅存在性） |
| presetDiag 诊断环形（FIX-030-C：64 条有界环形 + `router/presetDiagnostics` RPC + 设置页最近事件行） | `lib/preset-defaults.js:113,124-150`；`lib/rpc.js:64-71`；`lib/schemas.js:388-407`；`lib/client.js:620-621,3521-3526,2109-2110` | **通用化**为 D4 hostDiag（探针注册/一键自检/RPC/健康面板同构扩展，§6.1） |
| adapter-parity 动态契约枚举（FIX-001b F2：`Object.getOwnPropertyNames(LlmAdapter.prototype)` 并集 + 静态补集，宿主新增方法自动受检） | `tests/adapter-parity.mjs:33-41` | 推广为 D3(a) 全面契约快照测试体系的标准写法（§5.1） |
| fix-029 判别测试（宿主面 mock 锚定宿主源码形态：`sessionProjections.stateOf(session,'modelSelection')` → `{lastUsed,pending}`） | `tests/fix-029-host-contract.mjs:56-100` | D3(a) 测试桩宿主面锚定纪律（P10-④）的样板 |
| served-client.js 镜像 hash 守卫（client bundle 双份同步约束） | `tests/served-client.js`（5271 行镜像） | D3(a) 静态层保留；D2 迁移时 client-remotes 域需进镜像同步面（§10 B2 风险） |
| F-1 回环抑制（事件→写入→事件 自激环 gate） | `lib/host-route.js:263-270` | D2 events 域的订阅设计继承该纪律（事件触发写操作必带 gate，§4.6） |

### 0.5 审查轮机核裁决与 Analyst 结论补记（2026-09-12 修订轮）

| 编号 | 裁决/结论 | 锚点与说明 |
|---|---|---|
| Analyst D-2 | **客户端死订阅（唯一实证断裂修复项）**：`lib/client.js:2093` 订阅 `$on('credentials/updated')` ——该事件名不在宿主转发白名单，宿主从未转发（死订阅，凭据变化不触发刷新）；正确事件名 = `credentials/reference-updated` | 宿主白名单单一声明源 `dsh-api-remotes/lib/types/remote-events.js:12-32`（:21 = `credentials/reference-updated`，Architect 一手复核：全表 20 项无 `credentials/updated`）；修复承载 = B5（W-4） |
| T-2 | 证伪（字段级假设） | Coordinator 机核台账 2026-09-12；wire schema 锚点 `dsh-api-remotes/lib/client.js:5727-5734/:8164-8193`（Architect 一手复核存真：`llm.listConfigurableProviders` 结果字段 = provider/displayName/settingsNs/settingsPath[]/declared?/error?；`session.modelCatalog` 结果字段 = default{provider,model,reasoningEffort?}/routableProviders[]/groups[…]/failures[…]）。看护补位设计 = §5.1 第 4 项字段级白名单断言 |
| T-3 | 降级 | 同上台账；与 T-2 同源锚点，处置为降级纳入静态层而非运行时层 |
| T-9 | 前提静态不成立 | Coordinator 机核台账 2026-09-12（结论编号引用，详见 review-ARCH-004 台账） |
| T-10/T-11 | 症状②优先序重排——权重上升 | 见 §0.2：设置页常驻 2s 双 RPC 轮询成为首要嫌疑面；显式裁决 D1-10/B5 |

---

## 1. 目标与设计需求映射

### 1.1 用户四维指令 → 设计需求

| 用户指令（原文，验收维度） | 功能需求 | 非功能需求 |
|---|---|---|
| D1「尽可能减少对 DSH 宿主的依赖」 | 依赖消除/降级候选清单，每项含取舍与建议 | 可回滚（逐项独立） |
| D2「必须的接口和字段依赖，尽量将依赖逻辑解耦，单独维护」 | host-abi 分域边界；每域唯一入口/能力探测/多版本适配/降级行为；迁移策略 | 模块职责 ≤3 句；无循环依赖；新增宿主面变更的预期适配成本量化 |
| D3「对依赖的代码进行严格的依赖性校验和看护」 | 三层看护：静态契约快照 / 启动运行时 fail-loud（非整页崩）/ 演进漂移检测 | 测试看护零回退（P4）；桩锚定宿主源码（P10-④）；CI 落地路径（RISK-001） |
| D4「依赖边界的代码增加可调测性设计，第一时间发现 + 低代价适配」 | 通用诊断环形 + 健康徽章 + 降级可观测（P8）+ 单域收敛验证方法 | 适配层性能预算 + 探针惰性化/采样化（症状②直接关联） |

### 1.2 硬约束（项目质量原则）

P1 事实原则 / P4 测试零回退 / P5 单路径汇入+旧路径删除 / P7 安全（凭据不外泄）/ P8 失败降级可观测 / P9 宿主演进防御（能力自证或 parity 守卫，禁单向信任）/ P10-④ 桩锚定宿主源码。

---

## 2. 候选方案与选型

**评估标准（评估前定义）**：① 对 12 次断裂链模式的覆盖度（防复发能力）；② 实施风险（每批可独立回滚）；③ 性能开销（症状②约束）；④ 适配新宿主面变更的预期成本（人日/文件数）；⑤ 维护成本（模块数/职责清晰度）。

### 方案 A：全面 host-abi 收敛层
15 模块的全部宿主面消费（含从未断裂的 fs/webServer/typert/settings.register 稳定面）一律迁入 7 域适配层，一步到位。
- **入选理由**：边界最纯净、静态守卫规则最简单（全部 `ctx.get` 黑名单化）。
- **排除理由**：工程量最大（估 12-15 人日）；对 0 断裂面（webServer/typert/fs——`lib/index.js:47,280,283`、`lib/service.js:1026+` 全链无断裂史）做迁移只引入回归风险而不消除历史风险；一次性大迁移违反「每批独立可 triage/回滚」的批次原则。**排除。**

### 方案 B：最小逐点防御加固
不动结构：只在现有消费点逐处加 probe + try/catch + 页面徽章；补 peerDeps 版本号。
- **排除理由**：peerDeps 防护已被证伪（§0.1：宿主零 enforcement + 安装器零告警）；逐点 probe 无单点收敛，新增消费点（15 模块仍可自由裸 `ctx.get`）即绕过全部防护——FIX-028 之后 FIX-029/030/031/032 连续四次断裂证明逐点补丁模式不可持续；probe 逻辑在 15 处复制本身就是 P5 违规（现状已有实证：`liveDefaultSelection` 在 `lib/preset-defaults.js:173-182` 与 `lib/prestep.js:209-218` 双份重复；llm face 形状检查在 `lib/wrapper.js:516-519`、`lib/oauth-llm.js:449-452`、`lib/service.js:927-928` 三处独立实现）。**排除。**

### 方案 C：分级混合（**推荐**）
按断裂史分级投放火力：
- **高危面**（断裂 ≥2 次：client remote/props 面、llm·selection 面、服务运行时 ctx 服务面）→ 迁入 host-abi 域，全消费者切换 + 旧路径删除（P5）；
- **低危面**（0 断裂：webServer/typert/fs/settings.register/bundle patch 宿主行）→ 不迁移，仅纳入 D3 静态契约快照与 D4 诊断探针（Coordinator 补充事实：bundle patch insert 语义 0.1.5 存续未变且为低风险稳定面——保留直用）；
- 全局面（无论高低危）：D3 三层看护 + D4 诊断环形/健康徽章 + 静态消费点守卫（守卫规则分级：高危面名全禁裸 `ctx.get`，低危面名白名单放行）。
- **入选理由**：风险调整后收益最大——防复发覆盖度与方案 A 相同（高危面全部域化 + 全局面看护），实施风险与 B 相当（分批），且直接消除现状 P5 违规（双份 `liveDefaultSelection`、三处 llm face 检查收敛为单点）。**选定。**

| 维度 | A 全面收敛 | B 逐点加固 | **C 分级混合** |
|---|---|---|---|
| 断裂链覆盖 | 高 | 低（新点绕过） | 高（高危域化+全局面看护） |
| 实施风险 | 高（大迁移） | 低 | 中低（7 批独立回滚） |
| 性能开销 | 中（全量经层） | 低 | 低（仅高危面经层，透传预算 §7.1） |
| 新面变更适配成本 | 最低 | 最高 | 低（高危面 = 改 1 域文件） |
| 现状 P5 违规消除 | 是 | 否（加剧） | 是 |

---

## 3. D1 依赖最小化（依赖消除/降级候选清单）

> 方法：对 §0.4 表之外的每个依赖面问三个问题——能否内部自算/自持？宿主联动能力失去的代价？断裂史暴露的风险有多大？

| # | 依赖项 | 现状锚点 | 建议 | 取舍（收益 vs 代价） |
|---|---|---|---|---|
| D1-1 | `dsh.client.inject` 中的 `@deepseek-ai/dsh-client-runtime`（宿主已删包） | `package.json:23` | **消除（立即，B0 批）** | 收益：清除死声明；宿主实测对缺失 inject 目标静默跳过（dsh-client-modules `lib/client.js:265-268`），但该行已零语义且构成「声明面 vs 宿主实际面」漂移的第一信号。代价：零——faces 由其余三包 + runner 提供。 |
| D1-2 | `apiProxy` 旧宿主会话选择面回落 | `lib/preset-defaults.js:226-238` | **消除（B3 批随域迁移）** | 收益：删除 ≤0.1.1 宿主专属路径（0.1.2 起全包零注册，FIX-030 取证）；`sessionSelectFaceOf` 单形态化，P5 合规。代价：放弃对 ≤0.1.1 宿主的支持——用户唯一环境已是 0.1.5-rc.2，且 peerDeps 本就声称 rc.8 起；域内保留双形态探测结构（§4.5），需兼容旧宿主时加回形态的成本 = 1 个域内分支 + 1 组判别测试。 |
| D1-3 | `props.input` 旧客户端快照 prop 回落 | `lib/client.js:5231-5233`（FIX-029-B 透传） | **保留** | 收益（消除）：微简化透传。代价：破坏 fix-029 测试夹具形态（`tests/fix-029-host-contract.mjs` B3 组）且运行时零成本（仅透传 undefined）。保留划算——这不是宿主面依赖而是 props 消费兼容，宿主 useInput 形态已是主路径。 |
| D1-4 | `modelDirectories` 双形态解析（属性面兜底） | `lib/client.js:4920-4923,5160-5161` | **降级为可选（B2 批域内化）** | FIX-027 时代属性面兜底是必要的（inject 门控）；现 fiber inject 已声明 `modelDirectories`（`lib/client.js:5060`），`ctx.get` 恒可解析。收敛为 `ctx.get` 单形态 + 域内保留形态探测函数（双形态逻辑存在但仅 probe 用），消除消费点双写。 |
| D1-5 | peerDependencies 8 项 `^0.1.0-rc.8`（W-2 修正计数，`package.json:61-68` 实数：dsh-attachment/agent/agent-default-model/session/settings/subagent/system-prompt/credentials） | `package.json:61-68` | **降级为记录性 + D3 版本快照接管** | 防护已被证伪（宿主零 enforcement，安装器零告警——§0.1）。改为 README 兼容矩阵 + D3(c) 宿主版本 baseline 快照测试为权威防护；peerDeps 保留但视为「声明性文档」（B0 批对齐真实测试范围）。禁止迷信语义化版本防护（ADR-A 决策）。 |
| D1-6 | dependencies `@deepseek-ai/dsh-llm`（BlockAssembler/createUserMessage/LlmAdapter）/ `dsh-tools`（defineTool）/ `dsh-typert-protocol`（TypertRemoteService）/ `schemastery`（Schema） | `lib/service.js:26-28`；`lib/prestep.js:33`；`lib/tool.js:24`；`lib/schemas.js:23`；`lib/rpc.js:11` | **保留（不可消除）** | 这些是宿主协议规范对象（消息构造规范/工具契约/RPC 基类/设置 schema 类型）——自持实现 = fork 宿主协议，断裂风险更大。D2 动作：消费收敛到 host-abi 域 + adapter-parity 式契约守卫（LlmAdapter 已有，其余入 B6 静态层）。 |
| D1-7 | `undici`（OAuth 直连流） | `package.json:58` | **保留** | 换 Node 内置 fetch 收益（减 1 依赖）< 迁移风险（流式语义差异 × oauth-credentials 38KB 现役链路）。非宿主面依赖，不属本任务火力；记录为独立候选。 |
| D1-8 | 客户端 `catalog` 30s 轮询 | `lib/client.js:5119-5126` | **降级为事件驱动 + 兜底轮询（B5 批）** | 已有 `settings/document-updated` 事件触发（:5121）；30s timer 保留为兜底但与事件订阅统一经 events 域（去重单 timer）。收益：卡顿嫌疑面收敛；代价：近零。 |
| D1-9 | 4 处独立 `ctx.on('settings/updated')` 订阅 | `lib/index.js:244` / `lib/service.js:2849` / `lib/wrapper.js:618` / `lib/oauth-llm.js:512` | **收敛（B5 批，events 域）** | 同一宿主事件 4 个独立 listener；events 域提供共享订阅 + 分发（不改变各消费者语义）。收益：订阅面单点可观测（D4 探针可数）；代价：批量迁移 4 处，机械改动。 |
| D1-10 | 设置页打开期常驻 2s 用量统计 + presetDiag 双 RPC 轮询（W-1 显式裁决，症状②首要嫌疑面） | `lib/client.js:2098-2118`（`:2116` setInterval 2000；OAuth 登录轮询另在 `:2816-2851,:3044-3049`） | **保留实时语义 + B5 批治理（非消除）** | 「realtime usage stats」是产品特性（package.json description），消除轮询 = 砍功能；但治理三措施：① 页面隐藏暂停（`document.hidden` / visibilitychange——隐藏态零 RPC）；② 双 RPC 同拍（同周期触发，消除相位拍击造成的突发密集）；③ 判别断言进 B5（打开期稳态 ≤1 RPC/s 量级、隐藏态 = 0）。收益：症状②嫌疑面收敛且可量化验证；代价：行为语义不变，改动局部。 |

**D1 结论**：可立即消除 2 项（D1-1/D1-2，均为死路径）；实证断裂修复 1 项（D1-10 承载的 :2093 死订阅，B5）；降级 4 项；保留并守卫其余。**无一新增宿主依赖。**

---

## 4. D2 解耦单点（host-abi 适配层设计）

### 4.1 总体形态：按域多文件 + 空桶聚合

```
lib/host-abi/
├── index.js            # 桶：仅 re-export，零逻辑（消费者统一 import 入口）
├── health.js           # 诊断环形 + FaceHealth 形状 + probe 运行器（无宿主依赖）
├── inject-manifest.js  # 客户端 inject 声明单一事实源 + fiber 面存在性探测
├── client-remotes.js   # 客户端 remote.* / modelDirectories / conversation 面
├── llm-selection.js    # llm 适配器注册面 + 模型选择/播种面 + 继承基线
├── ctx-services.js     # Node 侧 ctx.get 服务群（llm/credentials/settings/fs/attachments/subagents/agentDefaultModel/sessionController/sessionProjections/agents/agentPresets）
├── events.js           # 共享环境事件订阅单点（域管事件去重 + gate 纪律 + 白名单防线 + 卸载聚合）
└── version.js          # 宿主版本遥测 + 路径/ns/ref 约定常量（HOST_ROUTE_* 迁入）
```

**上帝模块论证（单文件 vs 按域多文件）**：单文件 `host-abi.js` 将聚合 ≥14 个宿主面、≥40 个导出函数——重现 `lib/client.js` 5271 行先例，且每个域的降级策略/探测节奏不同（客户端面惰性 probe、服务面调用时 probe、事件面订阅时 probe），单文件必然演化出配置开关丛林。按域多文件的代价是「域间边界需要守卫」——用 D3(a) 静态黑名单测试替代人工纪律（消费者禁止裸 `ctx.get('<高危面名>')`，正则可测）。桶 index 仅 re-export 保证消费者 import 面单一。**裁决：按域多文件。**

### 4.2 模块划分图（依赖方向，证明无循环）

```
                    ┌────────────────────────────────────────────┐
                    │  消费者层（15 模块，逐批切换）                │
                    │  client.js / service.js / wrapper.js /      │
                    │  preset-defaults.js / prestep.js /          │
                    │  oauth-llm.js / host-route.js / index.js …  │
                    └───────────────┬────────────────────────────┘
                                    │ 只依赖（单向向下）
                    ┌───────────────▼────────────────────────────┐
                    │  host-abi/index.js（空桶 re-export）         │
                    └──┬────────┬─────────┬─────────┬─────────┬──┘
                       │        │         │         │         │
        ┌──────────────▼┐ ┌────▼─────┐ ┌─▼────────┐ │      ┌──▼──────────┐
        │client-remotes │ │llm-      │ │ctx-      │ │      │events       │
        │inject-manifest│ │selection │ │services  │ │      │version      │
        └──────┬────────┘ └──┬───────┘ └─┬────────┘ │      └──┬──────────┘
               │             │           │          │         │
               └─────────────┴─────┬─────┴──────────┴─────────┘
                                   ▼
                        ┌─────────────────────┐
                        │  health.js          │ （被所有域依赖；自身零内部依赖）
                        │  （宿主面本体：      │
                        │  cordis ctx /       │
                        │  @deepseek-ai/* 包） │
                        └─────────────────────┘
```

- 域模块间**互不 import**（横向无依赖）；全部只依赖 `health.js` + 宿主本体。消费者 → 桶 → 域 → health，严格单向，**无循环**。
- `lib/service.js:26-28` 等宿主包直接 import（dsh-llm 等）**保留**（D1-6：协议对象非宿主面消费），不强制绕域——静态守卫只管 `ctx.get('<面名>')` 裸消费。

### 4.3 域定义（每域：唯一入口 / 能力探测 / 多版本适配 / 降级行为）

#### 域 1 `client-remotes.js`（客户端 remote 面——症状①主战场）
- **职责**：① 承载 hostApiFace 全部映射（`lib/client.js:4828-4847` 映射表的唯一维护地）；② 每面能力探测与降级；③ 客户端宿主面健康快照。≤3 句。
- **唯一入口**：`createClientRemotes(ctx)` → `{ api, health() }`；`lib/client.js` 的 hostApiFace 调用点（`lib/client.js:5067`）切换至此并删除原实现（P5）。
- **能力探测**：每面 `probeRemoteFace(ctx, name)` = 存在性（`ctx.get('remote.'+name)` / 属性面兜底——沿用 FIX-027 双形态 `lib/client.js:4904-4907`）+ 形状校验（关键方法 typeof 检查，如 `llm.listProviders && llm.listConfigurableProviders`）。
- **多版本适配**：`envelopeOf`（`lib/client.js:4883-4895`）旧信封包装保留为域内规范；`modelDirectories` 的 `directoryFor(sessionId).load()` 直驱路径（FIX-026，`lib/client.js:5008-5034`）保留。
- **降级行为（关键变更）**：`unavailable(name)` 从 **throw**（`lib/client.js:4910-4912`）改为返回 `degraded face`——该面每个方法返回 `{ result: { ok: false, error: { code: 'host-face-missing', message } } }` + 记 `noteHostDiag({kind:'face-degraded', ...})`。**页面级效果：单面卡片显示降级态 + 健康徽章，其余面照常工作，永不整页崩**（对比 FIX-028 只把崩溃变成可见错误文本，仍是整页失败行）。
- **接口定义**：
  ```js
  // 输入
  createClientRemotes(ctx: ClientFiberCtx): ClientRemotes
  // 输出
  interface ClientRemotes {
    api: {                       // 与现 hostApiFace 同形的旧信封面（消费点零改动）
      llm: { providers(): Envelope; models(): Envelope; discoverModels(p): Envelope }
      settings: { describe(): Envelope; mutate(p): Envelope }
      credentials: { describe(p): Envelope; set(p): Envelope; unset(p): Envelope }
      agentPresets: { list(): Envelope }
      sessions: { models(p): Envelope; selectModel(p): Envelope }
    }
    health(): { faces: Array<{ name, state: 'ok'|'degraded'|'missing', detail?: string }> }
  }
  // 错误码（降级语义）
  // 'host-face-missing'   —— 命名空间未挂载（宿主版本不兼容）
  // 'host-face-shape'     —— 面存在但方法形状不符（形状漂移）
  // 'host-face-call'      —— 面调用被拒（透传宿主错误）
  ```
  envelope 形状 `{ result: { ok, value? , error? } }` 与现状逐字一致（`lib/client.js:4883-4895`）。

#### 域 2 `llm-selection.js`（llm·selection 面——断裂重灾区）
- **职责**：① llm 适配器注册面（registerAdapter/registration/listModels 形状检查——收敛现状三处独立检查：`lib/wrapper.js:516-519`、`lib/oauth-llm.js:449-452`、`lib/service.js:927-928`）；② 会话选择面（`sessionSelectFaceOf` + apiProxy 旧面按 D1-2 删除）；③ 继承基线与全局默认读写（`inheritedRouteOf` + `liveDefaultSelection` 唯一实现——消除 `lib/preset-defaults.js:173-182` 与 `lib/prestep.js:209-218` 双份重复，P5）。≤3 句。
- **能力探测**：`llmFaceOf(ctx)`（三方法 typeof）；`sessionSelectFaceOf(ctx)`（新面 `sessionController.selectModel`，宿主锚点 dsh-api-session-controller `index.js:605,2502`）。
- **多版本适配**：保留 FIX-030-A 归一信封 `{ok:true}|{ok:false,code,message}`；形态探测结构保留（D1-2）便于加回旧形态。
- **降级行为**：面缺失 → `null` + `noteHostDiag({kind:'face-degraded', face:'sessionSelect', consumer:'preset-seed'})`，消费者走既有零动作路径（`lib/preset-defaults.js:363-367` 语义不变）。
- **接口**：`llmFaceOf(ctx) / sessionSelectFaceOf(ctx) / inheritedRouteOf(parent) / liveDefaultSelection(ctx) / sessionNeverProduced(agent)`（后两者签名与现重复实现一致，消费点 import 切换）。

#### 域 3 `ctx-services.js`（服务运行时 ctx 服务面）
- **职责**：Node 侧 11 个 ctx.get 服务的 probe + 访问器收敛（llm/credentials/settings/fs/attachments/subagents/agentDefaultModel/sessionController/sessionProjections/agents/agentPresets）。≤3 句。
- **能力探测**：`serviceFaceOf(ctx, name, requiredMethods)` 通用函数——存在性 + 方法形状，一次实现替换 24 处散点 `this.ctx.get(...)` 各自的 inline 判断（`lib/service.js:927-928,1109-1110,1130-1131,1469-1470` 等模式）。
- **多版本适配**：`agentsRegistryOf`/`agentPresetsServiceOf` 双形态解析逻辑原样迁入（FIX-023，`lib/preset-defaults.js:159-198`）。
- **降级行为**：调用方语义逐面定义（现状已各有降级：`safeListModels` 返 `[]`、attachments 不可用报结构化错误、subagents 不可用 throw 用户可见错误——保持不变，仅收敛获取路径）；探测结果入健康快照。
- **接口**：`serviceFaceOf(ctx, name, methods[]) -> {face|null, probe}`；每服务一个具名导出访问器（`llmOf(ctx)`、`credentialsOf(ctx)`…）。

#### 域 4 `events.js`（事件面）
- **职责**：① **共享环境事件订阅单点**（W-3 收窄口径）：仅域管事件（多消费者/跨面环境事件：`settings/updated`、`llm/adapters-updated`、`settings/document-updated`、`agent-preset/selected`、`credentials/reference-updated`）经 `ctx.on`/`ctx.remote.$on` 订阅，共享 listener + 按名分发 + 卸载聚合；② 事件→写操作回环 gate 纪律（F-1 先例 `lib/host-route.js:263-270` 通用化）。≤3 句。
- **口径裁决（W-3，收窄声明 + 守卫对齐，二选一取收窄）**：scoped 生命周期/请求瀑布钩子（`agent/pre-step`、`agent/created`、`agent/request`）**保留直订不经域**，理由三条：① 各仅单消费者，无去重收益；② `agent/created` 监听器同步抛错具 veto 语义（宿主 announce 语义，`lib/preset-defaults.js:22-24` 头注实证）——分发层会遮蔽/改变 veto 传播；③ `agent/request` 为每请求热路径（EVO-014 原则 2「不介入会话过程」——会话进行中每请求零插件开销，`lib/preset-defaults.js:8-9`）——不加任何分发层。守卫与声明对齐：B6 黑名单仅禁**域管事件名**的域外裸订阅，scoped 钩子直订合法。
- **能力探测**：订阅时探测事件可达性——转发事件（客户端 `$on`）比对宿主转发白名单（`API_REMOTE_FORWARDED_EVENTS`，单一声明源 `dsh-api-remotes/lib/types/remote-events.js:12-32`）；白名单外事件名 = 死订阅，订阅即拒绝 + 诊断事件（Analyst D-2 死订阅的机器防线，§0.5）。
- **降级行为**：订阅失败（事件面不可用）→ warn + 该事件消费者全部进降级名单（健康徽章可见），**不影响其余事件**。
- **接口**：`subscribeEvents(ctx, [{event, consumer, handler, gate?}]) -> disposeAll`；`FORWARDED_EVENT_ALLOWLIST`（镜像宿主白名单，静态比对测试锁定同步）；内部同事件名多 consumer 共享单 listener（D1-9 收敛）。

#### 域 5 `inject-manifest.js`（客户端 inject 声明面）
- **职责**：① fiber inject 名单与 `dsh.client.inject` 包名单的单一事实源（代码侧常量）；② apply 时 fiber 面存在性自检（`ctx.get` 逐一探测，`waitingFor` 语义前置可视化）。≤3 句。
- **关键设计**：`FIBER_INJECT = ['slots','locale','remote','remote.llm','remote.settings','remote.credentials','remote.agentPresets','remote.session','modelDirectories']`（现状 `lib/client.js:5060` 迁出）；`CLIENT_PACKAGE_INJECT = ['@deepseek-ai/dsh-client-ui-settings','@deepseek-ai/dsh-client-locale','@deepseek-ai/dsh-api-remotes']`（dsh-client-runtime 行删除，D1-1）。package.json 与 manifest 的比对进 D3(a) 静态测试（B0 起、B6 成体系）——语义锚点：Coordinator 机核 2026-09-12（informational deps + 缺失行静默跳过 `dsh-client-modules/lib/client.js:265-268`）。
- **降级行为**：apply 时探测失败的面记 `noteHostDiag({kind:'inject-face-missing', face})`——客户端插件在等待 inject 就绪时（宿主 runner `waitingFor` 门控，`dsh-cordis-client-runner client.js:581`）用户无从得知卡在哪一面；本域让「等待面」在页面可打开后立即可见（健康徽章数据源）。

#### 域 6 `version.js`（路径约定面 + 版本遥测）
- **职责**：① 宿主约定常量单点（`HOST_ROUTE_NS/HOST_ROUTE_PROVIDER/HOST_ROUTE_REF/HOST_ROUTE_TICK_MS` 从 `lib/host-route.js:53-65` 迁入）；② 宿主版本读取（`require('@deepseek-ai/dsh-llm/package.json').version` 等三个 dependencies 包——可静态 import；其余面版本经 health 面的 probe 间接观测）。≤3 句。
- **降级行为**：版本读取失败 → `'unknown'`（不阻断任何路径，只影响遥测完整性）。
- **接口**：`hostVersionsOf() -> { llm, tools, typertProtocol }`；常量 re-export。

#### 域 7 `health.js`（诊断基础设施——D4 载体，见 §6）
- **职责**：① `noteHostDiag`/`hostDiagnostics` 通用诊断环形（presetDiag 同构泛化）；② `FaceHealth` 形状定义与 probe 运行器（惰性）；③ 零宿主依赖（纯数据，JSON 安全——沿用 `lib/preset-defaults.js:116-124` 纪律）。≤3 句。

### 4.4 迁移策略（消费者逐模块切换 + 旧路径删除，P5）

1. 每域一批（§10 迁移批次）：先落域模块（纯增量），再切消费者 import，**同批删除被取代的旧实现**（例：B3 删 `lib/preset-defaults.js` 与 `lib/prestep.js` 内重复的 `liveDefaultSelection`；B2 删 `lib/client.js` 内 hostApiFace 本体——镜像同步注意 §10 B2 风险条）。
2. 切换顺序按断裂频率倒序（高危先）：client-remotes → llm-selection → ctx-services → events。
3. 每批全量测试网（P4）+ 判别测试先行（TDD：先写「消费者不再裸 ctx.get」红测试再切换）。

---

## 5. D3 校验看护（三层体系）

### 5.1 (a) 静态层：宿主面契约快照测试体系（`tests/host-contract.mjs`，B6 成体系）

扩展三个先例成体系（P10-④ 桩锚定宿主源码）：

1. **契约快照（adapter-parity F2 范式推广）**：`Object.getOwnPropertyNames(<宿主类>.prototype)` 动态枚举 + 静态补集（抽象方法），锁定的面：
   - `LlmAdapter`（已有 `tests/adapter-parity.mjs:33-41`，保留）；
   - `TypertRemoteService`（`lib/service.js:26` 消费的基类面）；
   - `defineTool` 契约（`lib/tool.js:24`）；
   - `BlockAssembler` / `dsh-llm/message` 导出面（`lib/service.js:27-28`、`lib/prestep.js:33`）。
   断言形态：枚举结果 ⊇ baseline 快照集；宿主新增方法自动入集（漂移即红——RISK-003 真实预警）。
2. **宿主源码形状锚点测试（fix-029 范式推广）**：对高风险非导出面（`sessionController.selectModel` 签名、`modelDirectories.directoryFor` 形状、`sessionProjections.stateOf(session,'modelSelection')` 返回 `{lastUsed,pending}`）——测试桩逐字锚定宿主源码行号（现状先例：`tests/fix-029-host-contract.mjs:7-18` 锚 dsh-api-session-controller `types/agent.js:297-318`）。宿主升级后跑测试 = 自动比对心智模型与宿主现实。
3. **声明面静态比对（新增，Coordinator 机制事实落地）**：
   - `dsh.client.inject` 包名单 vs 宿主 `node_modules/@deepseek-ai/` 实际包表（inject-manifest 域常量为代码侧事实源）；
   - fiber inject 名单 vs 宿主可提供面（静态可查部分）；
   - `cordis.patch.yml` 条目 id 存在性（宿主对不存在条目仅 stderr 警告——Coordinator 机核 2026-09-12，README L55）；
   - **消费点黑名单**：grep 产品源码，高危面名（remote.*/modelDirectories/sessionController/agentDefaultModel/…）禁止裸 `ctx.get(`（域模块文件白名单除外）——P5 单点化的机器 enforcement；**域管事件名**（§4.3 域 4 清单）禁止域外裸 `ctx.on(`/`$on(`（W-3 守卫与声明对齐；scoped 钩子 `agent/pre-step`/`agent/created`/`agent/request` 直订合法）。
   运行环境：dev/CI（读宿主 checkout）；用户运行时**不依赖**文件系统（BR-03 缓解）。
4. **字段级 wire schema 白名单断言（S-5，T-2 证伪/T-3 降级后的看护补位）**：对消费的 remote 面结果逐字段断言，锚定宿主 wire schema 源码——`llm.listConfigurableProviders` 结果 = `{provider, displayName, settingsNs, settingsPath[], declared?, error?}`（api-remotes `lib/client.js:5727-5734`）；`session.modelCatalog` 结果 = `{default{provider,model,reasoningEffort?}, routableProviders[], groups[{id,name,models[…]}], failures[]}`（`:8164-8193`）；同法扩展 `llm.listProviders`/`settings.describe`/`credentials.describe`/`agentPresets.list`（宿主 client.js 内同源 schema 声明）。**设计理由**：运行时 probe（§5.2）只到方法级存在性，字段增删/改名不触发——字段漂移由本静态层捕获（hostApiFace 的 `joinProviderDirectoryHost`（`lib/client.js:4856-4878`）逐字段消费 directory 结果，字段漂移 = 显示层静默错列）。
5. **转发事件白名单双检（W-4）**：静态——插件全部 `$on` 事件名 ⊆ 宿主 `API_REMOTE_FORWARDED_EVENTS`（`dsh-api-remotes/lib/types/remote-events.js:12-32` 单一声明源，events 域持镜像 + 同步锁定测试）；运行时——events 域订阅时白名单外事件名即拒绝 + 诊断事件。**实证**：`lib/client.js:2093` `$on('credentials/updated')` 不在白名单（宿主从未转发，凭据变化不触发刷新——死订阅）；正确名 `credentials/reference-updated`（remote-events.js:21）。修复承载 B5。

### 5.2 (b) 启动/运行时层：能力自证 fail-loud，但非整页崩溃

- **启动自检**：宿主行 apply（`lib/index.js:213`）与客户端 apply（`lib/client.js:5062`）时跑一次全域 probe → FaceHealth 快照（§6.1）。缺失面：结构化诊断事件（`noteHostDiag({kind:'face-missing'...})`）+ 设置页健康徽章——**绝不 throw 阻断 apply**（对比现状 `unavailable()` throw，`lib/client.js:4910-4912`）。
- **调用时自证（P9 深度）**：probe 不止存在性——关键写路径沿用 `probeHostRoute` 范式（真调用 + 判返回「目录事实形状」，`lib/host-route.js:218-232`）。域内定义每面的 `verifyDeep` 可选钩子（如 llm 面探测用 `listModels` 真调用；sessionController 面探测在用户首次播种时做一次受控 selectModel 探测不可行——播种本身就是调用，失败路径已归一，维持浅 probe + 调用失败降级）。
- **失败驱动复检**：面调用失败 → 标记 degraded + debounce 30s 后复检（探针惰性化纪律见 §7.1）。

### 5.3 (c) 演进检测层：宿主版本漂移检测（RISK-003 对策）

1. **peerDeps 语义防线已证伪**（§0.1：宿主 runner/cordis 零 enforcement，安装器零告警）——**不再作为防护**，改为记录性声明（ADR-A）。
2. **版本 baseline 快照测试**：`tests/host-version-snapshot.mjs` 锁定开发/CI 环境宿主包版本集（llm/tools/typert-protocol + 探测可得面）；宿主 checkout 变更（npx cache 静默刷新——RISK-003）→ 下次跑测试即红 + 快照 diff 报告显示哪些包漂移。用户侧无 CI 时由 D4 健康徽章的 `hostVersions` 遥测兜底（§6.2）。
3. **运行时版本遥测**：`hostVersionsOf()`（§4.3 域 6）纳入 `router/hostFaceDiagnostics` RPC 返回——报障时用户一键导出即含宿主版本组合（对 FIX-028 时代「用户截图 + 版本组合不明」排障痛点的直接回应）。
4. **CI 落地路径（RISK-001 衔接）**：本仓库当前无 CI。路径分三步：① B6 落地 `node tests/*.mjs` 全量门控命令（本地，零基础设施）；② package.json `scripts.test` 标准化（后续任务）；③ GitHub Actions 单 job（checkout 插件 + npm i 宿主 0.1.5-rc.2 锁版本 + 跑门控）——宿主依赖在 CI 中**锁定版本安装**使契约快照有确定靶子。①②属本设计批次，③记为后续任务（依赖仓库托管决策，非本任务范围）。

---

## 6. D4 边界可调测性

### 6.1 通用 host-face 诊断环形（presetDiag 先例推广）

复用 FIX-030-C 全链路结构（注册表 → RPC → 设置页面板），泛化为宿主面观测：

```
探针注册（各域 apply 时一次性注册 face probe 清单）
   └→ 一键自检（手动/失败驱动，惰性）
        └→ noteHostDiag 环形（有界 64，先例 PRESET_DIAG_LIMIT=64）
             └→ RPC：router/hostFaceDiagnostics（新 descriptor，复用 rpc.js 模式）
                  └→ 设置页健康面板（复用 presetDiagTitle 显示先例 client.js:620,3521）
                       └→ 健康徽章（nav 行内：✓ 全绿 / ⚠ n 面降级 —— 用户可见信号）
```

- **「第一时间发现」= 用户可见信号设计**：徽章优先（不依赖 console——F12 淹没问题）；降级面卡片内联原因短码（`host-face-missing` 等 §4.3 错误码）；诊断环形含时间戳最近 64 条事件（含 face 探测结果变化）。
- **「低代价适配」验证方法**：新增宿主面变更时，预期改动收敛验证 = 静态黑名单测试指认受影响消费点（grep 结果即文件清单）+ 契约快照 diff 指认漂移面 + 域文件单点修改。量化对比见 §7.3。

### 6.2 宿主面版本 + 能力快照遥测

`router/hostFaceDiagnostics` 返回 `{ hostVersions, faces: FaceHealth[], diag: entries[] }`——版本（域 6）+ 能力（各域 probe）+ 事件（环形）三合一。报障工单模板更新为「导出此 RPC 结果」（后续任务，本设计定接口）。

### 6.3 降级路径可观测（P8）

- 每个降级动作（degraded face 返回、事件订阅失败、probe 失败复检）都产生 `noteHostDiag` 条目——**禁止无观测吞错**（现状基准：`lib/preset-defaults.js:365` `skip:'face-unavailable'` 已是该纪律，推广到全部域）。
- 降级不静默改行为：用户可见徽章 + 面板原因 +（如影响功能）面卡片内联提示（先例：host_route_degraded 事件 + 设置页提示，`lib/host-route.js:161-168`）。

---

## 7. 非功能需求逐项措施

### 7.1 性能（症状②直接关联——适配层不得引入新负担）

| 措施 | 规格 | 锚点/先例 |
|---|---|---|
| 透传开销预算 | 单次透传附加 ≤1μs：一次闭包查找 + 一层信封对象字面量；**零新增异步跳数**（不加 Promise 链——degraded 路径才走诊断）；无每调用新分配热点（信封对象与现状 hostApiFace 同构——`lib/client.js:4883-4895` 本来就每调用建一次，域化不增量） | 现状基线持平 |
| 探针惰性化 | probe 仅三时机：apply 一次 / 健康面板打开或手动刷新 / 面调用失败后 debounce 30s 复检。**绝不进 React 渲染路径**（渲染只读缓存的 FaceHealth 快照） | 症状②候选机制「每渲染探针」结构性排除 |
| 诊断环形有界 | 64 条上限（复用 `PRESET_DIAG_LIMIT=64` 先例，`lib/preset-defaults.js:113`）；溢出环形覆盖不增长 | FIX-030-C 先例 |
| 事件订阅去重 | 同事件名多消费者共享单 listener（D1-9：4 处 `settings/updated` 独立订阅收敛）+ 卸载聚合 | events 域 |
| 轮询纪律 | 保留 30s catalog 兜底单 timer（`lib/client.js:5122`）；**设置页打开期 2s stats+presetDiag 双 RPC 轮询（`lib/client.js:2098-2118`）保留实时语义但 B5 治理：页面隐藏暂停 + 双 RPC 同拍**（D1-10）；OAuth 登录轮询仅登录流内（用户触发有界，`lib/client.js:2816-2851,3044-3049`）；**不新增任何常驻 timer** | D1-10 / W-1 修订定性 |
| 回环纪律 | 事件触发写 pass 必带失败态 gate（F-1 先例 `lib/host-route.js:263-270`），events 域订阅 API 强制暴露 gate 位 | FIX-030 自激环教训 |

### 7.2 安全

- 适配层**不扩大权限面**：域模块只代理既有 ctx 面，不新增 fs/网络/凭据通道；`version.js` 只读包元数据。
- 凭据不变更：`credentials` 面（域 3）仅收敛获取路径，值处理链路（`lib/host-route.js:187-200` diff-only 注入、P7「日志永不携带 token 值」`lib/host-route.js:47`）原样保留；诊断环形条目形状沿用 presetDiag 裁剪纪律（`lib/preset-defaults.js:127-141` 字段白名单 + 长度截断），FaceHealth 不含任何凭据值。
- 客户端降级面错误信息不含敏感路径（错误码 + 面名，不含环境细节）。

### 7.3 可维护性

- 每模块职责 ≤3 句（§4.3 各域已给）；无循环依赖（§4.2 图）；桶无逻辑。
- **新增宿主面变更的预期适配成本对比**（量化，以「宿主某面改名/改形状」场景计）：
  - 现状：定位散点（15 模块 grep + 心智记忆）+ 逐点改 + 各自补防御 —— 估 2-4 人日 / 5-8 文件（FIX-030 实耗先例：双断裂适配跨 4 文件 + 3 轮审查）；
  - 设计后：静态黑名单测试红 → 指认消费点；契约快照 diff → 指认漂移面；改 1 个域文件 + 更新快照 baseline —— **估 0.5-1 人日 / 1-2 文件**。
- 域文件规模上限约定：单域 ≤400 行（client-remotes 最大，因承载映射表；超限 = 拆子面的信号，防上帝模块回潮）。

### 7.4 可回滚

每迁移批次独立可回滚（§10 每批给回滚方案）；域模块纯增量批次（B1）回滚 = 删文件；消费者切换批次（B2-B5）回滚 = revert 该批 commit（旧路径同批删除但 git 历史完整）；B0 声明修正回滚 = revert 单 commit。

---

## 8. 蓝军挑战与回应（≥3——本文给 4 条）

| ID | 挑战 | 回应/缓解 |
|---|---|---|
| **BR-01** 适配层自身成为新单点/性能负担（症状②复发：每渲染探针、订阅风暴、RPC 放大） | ① 探针三时机纪律 + 渲染路径禁入（§7.1）——判别测试锁定（B1/B5 各一组：渲染期间 probe 调用计数 = 0）；② 事件共享订阅（单 listener 多分发）+ 卸载聚合，订阅总数只减不增（4→1 先例）；③ 诊断环形有界 64 + 不新增常驻 timer；④ 性能预算进验收标准（每批跑性能判别断言）。 |
| **BR-02** probe 存在性通过但形状漂移（方法在而签名/返回变——FIX-028 正是 `connection` 面在而 `.api` 无） | ① 浅 probe 检查到方法级 typeof（非仅对象存在）；② 关键面配 `verifyDeep` 真调用判返回「事实形状」（`probeHostRoute` 判 `context.contextWindow` 先例，`lib/host-route.js:226-230`）；③ 静态契约快照锚宿主源码（枚举 + 形状断言，宿主漂移即红）；④ 调用期失败路径全部归一信封 + 进环形（P8）——三层叠加后「形状漂移静默击穿」需同时绕过运行时 probe、调用期捕获、静态快照，单层失效不致命。 |
| **BR-03** 静态层读宿主 node_modules 在用户环境/异构安装不可达（插件装在别处、宿主 cache 路径漂移） | ① 静态层定位 dev/CI 面（§5.1 运行环境声明），CI 中宿主**锁定版本安装**保证有靶子；② 用户运行时防护不依赖文件系统：域 probe + 版本遥测（`hostVersionsOf` 经插件自身 dependencies 可靠解析）+ 健康徽章；③ 报障路径 = 导出 `hostFaceDiagnostics` RPC（含版本 + 面健康），不需要用户找宿主源码。 |
| **BR-04** 旧宿主兼容性丧失（D1-2 删 apiProxy 回落、D1-4 收敛 modelDirectories 双形态 → 支持 ≤0.1.1 宿主的能力永久丢失） | ① 用户唯一环境已 0.1.5-rc.2 且升级单向（npx cache 机制不回退），兼容矩阵单点化（README 声明「实测基线 0.1.5-rc.2」）；② 域内保留形态探测结构（§4.5 域 2「多版本适配」），加回旧形态 = 1 域内分支 + 1 组判别测试（非散点重写）；③ 删除走独立批次（B3）可单独 revert；④ P5 裁量：保留死路径的真实代价（每次面探测多一跳 + 测试面 ×2）> 假想兼容收益。 |

---

## 9. 风险登记（本设计引入/放大的风险）

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| served-client.js 镜像同步约束：client.js hostApiFace 迁出（B2）需同步镜像（历史多轮「镜像同步」commit 证据） | 高 | 中 | B2 批验收标准显式含镜像 hash 守卫通过（`tests/served-client.js` 守卫）；迁移函数块整体搬移减少手工重写面 |
| host-abi 层与宿主新面代差（0.1.5 的 dsh-client-modules 语义与插件假设再漂移） | 中 | 高 | D3(c) 版本快照 + D1-1 删死行 + inject-manifest 静态比对（B0 即生效）；「插件 client 形态与 dsh-client-modules 当前协议一致性」已实证闭合：`tests/served-client.js:21` 使用 `window.__ModuleLoader__.load` factory 形态 = dsh-client-modules `lib/index.js:388-409` bootInjections 原生协议，**无需迁移到 runner host.call 新形态**（Coordinator 机核 2026-09-12 提示评估——评估结论：不适用，本插件非 chat 内动态包） |
| 迁移批次期间新旧路径并存窗口（P5 禁止并存 vs 分批实施的现实） | 中 | 中 | 并存窗口限定在「同批内」：切换 commit 与删除同批落（每批 = 一个问题修改，编程要求 4）；批间不并存 |
| 诊断环形与 probe 在低配机器的固定开销 | 低 | 低 | 全部惰性 + 有界（§7.1）；B5 性能判别测试含预算断言 |

---

## 10. 迁移批次（每批 = 独立可 triage 任务草案，含验收标准与回滚）

> 依赖序：B0 → B1 →（B2、B3 可并行）→ B4 → B5 → B6。总量判断：15 模块中 9 个有宿主面消费（client/service/wrapper/preset-defaults/prestep/oauth-llm/host-route/index/rpc-schemas 面），全部覆盖；6 个纯内部模块（stats/memory/attachments/oauth-credentials/tool/schemas 除宿主协议对象外）不受影响。

### B0 止损修正批（声明面）
- **范围**：删 `package.json:23` 死行 `@deepseek-ai/dsh-client-runtime`；peerDeps/deps 版本范围改为「实测基线」记录（0.1.5-rc.2，README 兼容矩阵同步）；`tests/host-version-snapshot.mjs` 初版（锁基线）。
- **验收**：全量测试网绿；版本快照测试红/绿判定演示（改一个假版本号 → 红）；宿主实机设置页可打开（症状①的声明面因素排除验证）。
- **回滚**：revert 单 commit。

### B1 host-abi 骨架 + 诊断环形批（纯增量）
- **范围**：`lib/host-abi/` 七域文件骨架（health/version 先行，含 noteHostDiag 通用环形）+ `router/hostFaceDiagnostics` RPC descriptor + 设置页健康面板与徽章（读一次性快照）。
- **验收**：设置页显示徽章与面板（真机截图证据，P10-③）；环形有界判别测试（>64 覆盖）；render 期间零 probe 调用判别测试；全量网绿。
- **回滚**：删新增文件（无消费者改动）。

### B2 client-remotes 域批（症状①直接防御）
- **范围**：hostApiFace 迁 `lib/host-abi/client-remotes.js` + throw→degraded 语义 + inject-manifest 落地 + `lib/client.js` 调用点切换 + served-client.js 镜像同步。
- **验收**：面缺失注入测试（stub 掉 remote.llm）→ 该面卡片降级 + 徽章 ⚠ + **其余面正常**（对比现状整页失败行）；镜像 hash 守卫绿；`lib/client.js` 内无 hostApiFace 本体（P5）；全量网绿。
- **回滚**：revert 批 commit（含镜像）。

### B3 llm-selection 域批（P5 违规消除）
- **范围**：sessionSelectFaceOf/inheritedRouteOf/liveDefaultSelection×2/agentsRegistryOf/agentPresetsServiceOf 迁 `lib/host-abi/llm-selection.js`；删 apiProxy 旧面（D1-2）与重复 liveDefaultSelection；preset-defaults/prestep/wrapper/oauth-llm 切换 import。
- **验收**：fix-029 A/B 组、preset-defaults 全套不变绿（行为零回退——P4）；源码 grep `liveDefaultSelection` 单实现；旧 apiProxy 路径负向守卫（防复活测试，先例 `tests/preset-defaults.mjs` I 节模式）。
- **回滚**：revert 批 commit。

### B4 ctx-services 域批
- **范围**：serviceFaceOf 通用 probe + 11 服务访问器；service.js/host-route.js 24 处散点切换；host-route 常量迁 version.js。
- **验收**：`grep -n "ctx\.get(" lib/*.js | grep -v host-abi` 结果仅剩白名单（低危面：settings/typert/webServer/fs 在 index.js/service.js 的直用点——分级放行清单写入测试）；全量网绿。
- **回滚**：revert 批 commit。

### B5 events 域批 + 客户端订阅面 + 性能预算实施（症状②防御；W-4 前置 MUST 已闭合入范围）
- **范围**：
  - events 域（域管事件共享订阅/gate 位/卸载聚合 + 转发事件白名单防线）：4 处 `settings/updated` 与 2 处 `llm/adapters-updated` 收敛；catalog 轮询挂 events 统一管理；
  - **客户端 $on 订阅面（W-4）**：① 修复唯一实证断裂——`lib/client.js:2093` 死订阅 `$on('credentials/updated')` 改订 `credentials/reference-updated`（白名单锚 `dsh-api-remotes/lib/types/remote-events.js:21`，Analyst D-2）；② 转发事件白名单静态比对测试（插件 `$on` 事件名 ⊆ 白名单）+ 运行时可达性探测（events 域订阅时白名单外拒绝 + 诊断）；
  - **设置页 2s 双 RPC 轮询治理（W-1/D1-10）**：页面隐藏暂停（visibilitychange）+ stats/presetDiag 同拍触发；
  - 性能判别测试组（预算断言：probe 渲染期 0 次、订阅数 ≤ 迁移前、无新增常驻 timer、设置页打开期稳态 RPC 频率 ≤1 RPC/s 量级且隐藏态 = 0）。
- **验收**：判别测试绿（含死订阅修复判别：stub 发 `credentials/reference-updated` → 账号卡刷新链路触发；白名单比对测试红/绿演示——临时订阅一个白名单外事件名 → 红）；事件全链路功能回归（预设切换/热同步/凭据变化刷新用例）；全量网绿。
- **回滚**：revert 批 commit。

### B6 静态看护成体系批（D3(a) 完整落地）
- **范围**：`tests/host-contract.mjs`（契约快照四类面 + 宿主源码形状锚点 + 声明面比对 + patch 条目存在性 + 消费点黑名单〔含域管事件名订阅守卫〕+ 字段级 wire schema 白名单断言〔S-5，锚 api-remotes `lib/client.js:5727-5734/:8164-8193`〕+ 转发事件白名单静态比对〔W-4〕）；`node tests/*.mjs` 全量门控命令固化（CI 第①步，RISK-001 路径）。
- **验收**：人为引入一个裸 `ctx.get('sessionController')` 到消费者 → 黑名单测试红；人为订阅白名单外事件名 → 白名单测试红；人为删一个 wire schema 断言字段 → 字段断言红；宿主 checkout 换假版本 → 快照测试红；门控命令单入口可跑。
- **回滚**：revert 批 commit（守卫测试独立于产品代码，无产品面风险）。

---

## 11. ADR 候选（proposed——随报告返回，Coordinator 写回 decision-log）

### ADR-ARCH-004-A：host-abi 分域适配层替代 peerDeps 语义防护作为宿主演进防线

- **标题**: Adopt host-abi domain adapters + three-layer guard as the host-evolution defense, demoting peerDeps to declarative metadata
- **日期**: 2026-09-12
- **状态**: proposed
- **背景**: 宿主已静默漂移至 0.1.5-rc.2（上次适配面 0.1.2-rc.1，跨 3 个 rc 小版本）；实测宿主 runner/cordis 零 peerDependencies enforcement、安装器零告警——`^0.1.0-rc.8` 依赖声明形同虚设（Coordinator 机核 2026-09-12 + Architect grep 复证）。12 次历史断裂（FIX-001…032）证明逐点打补丁模式不可持续，且现状存在同逻辑多实现（liveDefaultSelection ×2、llm face 检查 ×3）。
- **决策**: ① 采用方案 C 分级混合：高危宿主面（client remote/props、llm·selection、服务运行时 ctx 服务）收敛到 `lib/host-abi/` 七域适配层，低危面（webServer/typert/fs/settings.register/bundle patch 行）保留直用仅纳入看护；② 防线改为三层：静态契约快照（锚宿主源码）+ 启动/运行时能力自证（fail-loud 但面级降级不整页崩）+ 版本 baseline 快照与遥测；③ peerDeps 降级为记录性声明，兼容基线以 README 矩阵 + 版本快照测试为权威。
- **备选方案**: A 全面收敛（排除：对零断裂面迁移只引回归风险，工程量 12-15 人日）；B 最小逐点加固（排除：新增消费点即绕过防护，peerDeps 防线已证伪，probe 复制加剧 P5 违规）。
- **排除理由**: 见 §2 各方案排除理由。
- **影响范围**: `lib/host-abi/`（新增 8 文件）、15 模块中 9 个消费模块（分批切换）、`tests/`（host-contract/host-version-snapshot 新套件 + served-client 镜像）、package.json（B0 声明修正）、README（兼容矩阵）。
- **后续动作**: 迁移批次 B0-B6（§10）；CI 第③步（GitHub Actions 锁版本装宿主）待仓库托管决策后立任务。
- **可逆性**: **高**——域桶聚合无侵入；每批独立 revert；低危面从未迁移故无回迁成本。

### ADR-ARCH-004-B：删除 apiProxy 旧宿主会话选择面回落（单形态化）

- **标题**: Remove the legacy apiProxy session-select fallback; sessionSelectFaceOf becomes single-form (sessionController)
- **日期**: 2026-09-12
- **状态**: proposed
- **背景**: `sessionSelectFaceOf`（`lib/preset-defaults.js:209-240`）保留的 apiProxy 旧面自 0.1.2 起宿主全包零注册（FIX-030 取证），当前唯一环境 0.1.5-rc.2 亦无；死路径使每次探测多一跳并使测试面翻倍。
- **决策**: B3 批删除 apiProxy 回落分支，sessionSelectFaceOf 单形态（sessionController，宿主锚点 dsh-api-session-controller `index.js:605,2502`）；域内保留形态探测结构，兼容矩阵基线声明 0.1.5-rc.2。
- **备选方案**: 保留双形态（排除：P5 死路径并存违规；假想兼容收益 < 真实维护成本）；维持现状不迁移（排除：重复实现与散点问题依旧）。
- **排除理由**: 见 §3 D1-2 取舍列。
- **影响范围**: `lib/preset-defaults.js`、`lib/host-abi/llm-selection.js`（新家）、`tests/fix-029-host-contract.mjs`（A4 旧面回落用例改为负向守卫）。
- **后续动作**: 随 B3 批实施；README 兼容矩阵更新。
- **可逆性**: **中**——删除可 revert；若需重新支持 ≤0.1.1 宿主，加回成本 = 1 域内分支 + 1 组判别测试。

---

## 附录 A：宿主面消费现状锚点总表（file:line，供实施批次与审查对照）

**Node 侧 ctx.get（24 处散点）**：llm `service.js:927,1337,1351`/`wrapper.js:516`/`oauth-llm.js:449`/`prestep.js:270`/`host-route.js:219`；agentDefaultModel `service.js:777`/`wrapper.js:526`/`preset-defaults.js:175,413`/`prestep.js:211`；credentials `host-route.js:188,341,399`/`service.js:1987,2072,2874,4022`；settings `host-route.js:206,247,423`/`service.js:3607,3623`；fs `service.js:1026,1089,1109,2046,2566`；attachments `service.js:1130,1570,1842,2035,2231,2662,2886,3378`；subagents `service.js:1469`；sessionController `preset-defaults.js:214`；apiProxy（旧）`preset-defaults.js:228`；agentPresets `preset-defaults.js:163`；agents `preset-defaults.js:194`；sessionProjections `prestep.js:193`。

**客户端面**：fiber inject 9 声明 `client.js:5060`；hostApiFace `client.js:4903-5042`（unavailable throw :4910-4912；envelopeOf :4883-4895；faceOf 双形态 :4904-4907）；modelDirectories 双形态 `client.js:4920-4923,5160-5161`；remote.$mount `client.js:5069`；$on 转发事件 `client.js:2090-2094（:2093 = credentials/updated 死订阅，Analyst D-2）,5121,5182`；设置页 2s 双 RPC 轮询 `client.js:2098-2118`；30s catalog 轮询 `client.js:5122`；OAuth 登录轮询 `client.js:2816-2851,3044-3049`；slots 注入 5 处 `client.js:5094,5196,5210,5224,5235`。

**事件订阅**：`ctx.on` —— `index.js:244`、`service.js:2849`、`wrapper.js:613,618`、`oauth-llm.js:511-512`、`prestep.js:301`、`preset-defaults.js:597-598,667`。

**声明面**：`package.json:22-27`（dsh.client.inject，含死行 :23）、`package.json:52-69`（deps/peerDeps）、`cordis.patch.yml:7-11`（宿主行 router/tool-router）、`lib/index.js:47`（fiber inject settings/typert/webServer）。

**宿主包 import**：`service.js:26-28`、`prestep.js:33`、`tool.js:24`、`schemas.js:23`。

---

*（完——本文档为 ARCH-004 设计产出物；实施留后续 DEV 任务批次；ADR proposed 文本由 Coordinator 评审后写回 decision-log。）*
