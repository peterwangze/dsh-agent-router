# REVIEW-EVO-022-R0-input — B4 ctx-services 域批代码审查（Round 0，重派）

- **Task**: EVO-022-R0（P1）ARCH-004 实施链 **B4 ctx-services 域批**（24 散点切换 + 累积绑定八项）
- **Reviewer**: Code Reviewer Agent（只读；工具边界 = read/grep/glob + 只读 git；未修改产品代码/治理状态，未执行任何测试）
- **审查对象**: commit `2090267d8cd4d1dd7c0969a2fc6a6cc04d7b33ef`（父提交 `05759cf`；14 文件 +419/−148 = 12 产品/测试文件 + 2 治理文件）
- **重派说明**: 前审查者中途失败未出结论；本报告为**独立重审**（未继承任何未完成结论；Coordinator 机核事实按"复核后采用/推翻"处理，见 F-CTX-1 裁决）
- **设计依据**: `arch-004-compatibility-design.md` §4.3 域 3（L223-228）/§4.2 依赖图（L154-184）/§10 B4（L403-406）；DEC-030；八项绑定来源（EVO-019 R0 P2-2/P3-5、EVO-020 R0 F-3/F-6、EVO-021 R0 F-1/F-2/F-3/F-5、probe 半项 EVO-019 P2-1）；`project-principles.md` P-v3（原则 5/8/9 + P10-④）
- **工作树有效性**: `git status --porcelain` 空、HEAD=2090267 → 下列全部实读/grep 对 2090267 有效
- **amend 窗口零树差异**: `git diff b0f608e 2090267` 空 + `git diff --name-status` 空（**独立机核**，非采信）
- **镜像一致性**: `SHA256(lib/client.js) == SHA256(tests/served-client.js) = 2FABABB4F2FAA9ED6BAA0EF121F8BD94774E041A237F460BB79C04309C4DF645`（**独立机核**）

## 硬门槛裁决

| 门槛项 | 结果 | 依据 |
|---|---|---|
| P0 阻塞数 | **0** | 发现列表最高 P2（R-1 注释锚，非功能/设计验收面） |
| P1 关键数 | **0** | 24 散点切换逐点语义等价、八项绑定 8/8 成立、无 P5 残留 |
| 5 维度全覆盖 | **100%** | 逐维结论见下 |
| 每条发现标注级别 | **100%** | R-1（P2）+ R-2~R-5（P3），共 5 条 |
| 设计一致性检查 | **已完成** | §4.3 域 3 / §4.2 依赖图 / §10 B4 验收三项对照 + 八项绑定逐项 |
| AI 专项 5 项 | **全部完成** | 逐项见下 |
| **结论** | **APPROVED_WITH_NOTES**（`unresolved_blockers=0`） | P0=0 且 P1=0，无未解决 BLOCKING finding |

## 5 维度逐项结论

### 维度 1 正确性 — 通过

- **24 散点切换范围精确核实（独立复算，非采信）**：父提交 05759cf 裸 `ctx.get(` 计数 = `service.js 24`（fs=5/settings=2 保留 + 17 切换：agentDefaultModel 1、attachments 8、credentials 4、llm 3、subagents 1）+ `host-route.js 7`（credentials 3/llm 1/settings 3）= 31 处；当前 = 24−17=7（全部为白名单 fs/settings）+ 7−7=0 → **恰 24 处切换**，与设计 §10 B4 L404 及声称一致。切换后 `service.js` 17 处调用点（:782/:932/:1135/:1342/:1356/:1474/:1575/:1847/:1992/:2040/:2077/:2236/:2667/:2879/:2891/:3383/:4042）、`host-route.js` 7 处（:188/:206/:219/:247/:341/:399/:423）逐一实读。
- **语义等价性**：`accessorOf` 存在性面返回 `serviceFaceOf(...).face`，即 `ctx.get(name)` 结果（仅 `undefined → null` 归一，见 `ctx-services.js:78-92`）；24 处消费点原有守卫（`!x || typeof x.m !== 'function'`）对 null/undefined 判定同值。逐站点复核：8 处 attachments、4 处 credentials、3 处 llm、1 处 subagents、1 处 agentDefaultModel、3 处 settings、3+1 处 credentials/settings（host-route）——**零语义漂移**。
- **边界条件**：`host-route.js:423`（`hostRouteStatusOf`）由 `typeof service?.ctx?.get === 'function' ? service.ctx.get('settings') : undefined` 改 `settingsOf(service?.ctx)`——`serviceFaceOf` 自带 `ctx && typeof ctx.get === 'function'` 守卫（:81），无 ctx / 无 get 均返回 null，外层 `try` 语义不变；:2236 的 `attachmentsOf(this.ctx) ? 'unreadable' : 'unavailable'` 为纯存在性判定，与旧 `this.ctx.get('attachments')` 同值。
- **F-2 严格面边缘（唯一真正的语义变更，方向为改善且与设计一致）**：`agents`/`sessionController`/`sessionProjections` 在方法形状降级时返回 `null + noteHostDiag`（`ctx-services.js:98-105`）。两消费点行为核验：`preset-defaults.js:376-377`（`agentsRegistry` 为 null → `parent` undefined → 跳过显式覆盖判别、**fixup 继续**）、`:444-450`（`?.get()` → undefined → **warn + `seed-main/no-agent` 诊断**）——与文件头声明及"取代旧 TypeError 被 catch 吞掉的静默 fail-safe"（原则 8 可观测）一致。
- **F-1 归并双语义**：`agentPresetsServiceOf`（undefined 兜底，`ctx-services.js:140-148`）与 `agentPresetsOf`（`?? null` 委托同点，:151）；对 `agentPresetsOf` 而言，归并使解析面由"仅 `ctx.get`"扩为"属性面优先 + `ctx.get` 回落"——**扩宽非收窄**，且 `agentPresetsOf` 在 `lib/` 内**零生产消费者**（全域 grep：仅定义），无回退面；`agentPresetsServiceOf` 两消费点 `preset-defaults.js:172/:524` 逐字未改、经桶 import（:120）零改动。
- **降级信封（F-3）**：`client-remotes.js:256-262` 权威缺面 → `degradedEnvelope('modelDirectories', HOST_FACE_ERROR_CODES.missing, …)`；镜像 `client.js:5243` 同形（字面量 `'host-face-missing'`，值与权威常量 `client-remotes.js:51` 逐字相等，且 §8g 的 JSON 级 parity 断言锁定漂移）；形状漂移 / `sessionId` 缺失仍走 `failureOf`（**不误标 missing**）——三错误码分级体系对齐 `:124-125`（实读命中）。
- **并发/资源**：零新增共享可变状态；`noteHostDiag` 入既有有界环形（`health.js:46` splice 至 64）；无句柄/定时器变化。
- **常量权威翻转**：`version.js:17` 唯一 import 为 `node:module`、`:19-26` 四字面量自持；`host-route.js:54` 桶 import + `:59` re-export、本地零重复定义（`:111/:210/:223/:226` 等消费点经 re-export 绑定）——`service.js:45-47` 与各测试 import 路径零改动成立。

### 维度 2 安全性 — 通过

- 无新增外部输入面、无权限语义变化、无密钥/token 硬编码（改动全为服务解析路径与注释）。
- 诊断面有界：`noteHostDiag` 字段白名单 + `detail` slice 160（`health.js:35-48`）；`serviceFaceOf` 的 catch detail slice 80（:84）。
- F-3 降级消息为固定字符串（无宿主数据拼接、无用户数据回显）；F-6 去重用 `Set` 按 `face.name` 字符串（无原型链/键注入面）。
- 无新增 eval/动态执行；`lib/client.js` 侧 `new Function` 仅存在于既有测试装载路径（本批未新增）。

### 维度 3 可维护性 — 通过（附 R-1 P2 + R-2 P3）

- P5/单点实证（**独立复跑**）：`rpc.js` 代码面 `RouterService` 0 命中、`prototype.hostFaceDiagnostics` 0 命中；`hostFaceDiagnostics()` 类方法**唯一实现** `service.js:750-756`；`agentPresetsServiceOf`/`agentPresetsOf` 唯一实现在 `ctx-services.js`；`lib/host-route.js` 代码面裸 `ctx.get(` = 0。
- 桶零歧义（**独立复算**）：7 域导出名无重复 → `export *`（`index.js:9-15`）不存在星导出遮蔽（B3 期 `agentsRegistryOf` 歧义先例风险本批机核排除）。
- 域文件职责单一：`ctx-services.js` 151 行（probe/accessor/合流解析），`accessorOf` 为 8 行薄委托，无上帝模块倾向。
- **扣分项 R-1/R-2**：`ctx-services.js:29-35` 契约锚 6/8 失效（其中 1 处由**本批自身编辑**造成）、本批 ①翻转后遗留 3 处陈旧权威引用；`CTX_SERVICES.llm` 方法集与 §4.3 域 2 契约不一致（详见发现列表）。

### 维度 4 性能 — 通过

- 24 处替换为 O(1) 服务解析（一次 `ctx.get` + ≤2 元素 `filter` typeof），与旧 inline 判定同阶；桶 import 为静态绑定零运行时开销。
- 唯一新增成本：存在性面每次调用执行 `requiredMethods.filter()`（空数组分配，`ctx-services.js:87`）与 F-6 的 O(n) Set 去重（n = 面数，个位数量级）；`materializeCliImages`/`readImagesAsDataUrls` 等循环内调用为 I/O 主导 → 量级不影响。
- 无新增常驻 timer、无循环内新增 I/O、无渲染期 probe（`faceHealthSnapshot` 纯读，`service.js:750-756` 保持 §7.1 惰性纪律）。

### 维度 5 测试覆盖 — 通过（附 R-3/R-5 P3）

- 新增 23 条断言语句 / 20 条新 `check`，覆盖：白名单快照（:354-355）、F-2 判别 + 诊断 + 完好面透传 + 存在性锚定（:362-366）、F-1 迁域 + 双形态 + 归并 + 桶面（:375-382）、P3-5 双断言（:388-389）、P2-2 四断言（:398-413）、F-6（:421）、F-3 行为 + parity + 边界（:433-439）。
- **判别力构造性推演**（静态成立）：白名单双向精确比对 → 注入裸 `ctx.get('sessionController')` 必 `found=1 expected=0` 红（与红演示声称一致）；`probeLlmAdapterFace` 新桩对缺 `registration` / 缺 `listModels` 两形态均判 degraded（:183-186），对旧两方法实现必红；§8e 的 `versionSource` 正则 + 值级三面锚定 → 任一侧重定义/漂移即红；§8g 缺面/形状两条路径分别锁 short-code 与"不误标"。
- `fix-031-attribution.mjs:686` G14 权威读取点随迁 `version.js`，断言语义（值级交叉锚定，任一侧漂移即红）保持；`host-abi-health.mjs:47-49` HOST_ROUTE_* 改锚权威侧、re-export 由 §8e 独立锁定。
- **未闭缺口（P3）**：§8f 的 F-6 去重仅源码正则断言，无行为断言；`registerFaceProbes` 在 `lib/` 零接线使 `faces` 生产恒空（跨批遗留）→ R-3/R-5。

## AI 专项 5 项

| # | 项 | 结论 | 依据 |
|---|---|---|---|
| 1 | mock 残留 | 无 | `lib/` 内零测试条件分支；白名单/桩仅在 `tests/host-abi-health.mjs` 内合法存在；新增断言全走真实模块导入或真实 bundle 装载 |
| 2 | 硬编码返回值 | 无（1 处镜像字面量有守卫） | 降级消息为既有固定文案；`client.js:5243` 用字面量 `'host-face-missing'`——与镜像先例（`:5108-5109`）同款，且值等于权威常量 `client-remotes.js:51` 并由 §8g JSON parity 锁定 |
| 3 | 幻觉 API / 伪造锚点 | 无伪造宿主面；**有陈旧引用（R-1，P2）** | 新增代码调用的 API 均已实读存在（`degradedEnvelope`/`failureOf`/`noteHostDiag`/`serviceFaceOf`/`LLM_FACE_METHODS`）；`client-remotes.js` 的 `:124-125` 锚实读命中；`smoke.mjs 桩无 registerAdapter/无 saveSelection` 陈述经实读核实**属实**（见 F-CTX-1）；扣分仅在旧行号锚（stats.js:98 等） |
| 4 | 未实现 TODO | 无裸 TODO | "B4 冻结范围之外的遗留消费点"（wrapper/prestep/preset-defaults）与"probe 接线"为显式批次边界，且前者在 §8a 注释 + 白名单机器锁定，后者见 R-5 |
| 5 | 过度实现 | 无 | 改动面 = 设计 §10 B4 范围（24 散点 + 常量迁 version.js）+ 台账八项绑定原文；无越界重构、无顺手改动（`git diff` 逐文件核对，2 治理文件为 Coordinator A 路径） |

## F-CTX-1 特设裁决（Coordinator 临终疑点：`ctx-services.js:58-66` 注释声明不实？）

**裁定：疑点不成立——Coordinator 机核结论系误读，注释陈述属实且为承重依据；无需修改注释，不构成 NEEDS_CHANGE 理由。**

核验过程（未采信、逐条实读）：

| 疑点依据（Coordinator 机核） | 实读结果 | 判定 |
|---|---|---|
| `tests/smoke.mjs` 存在 `llm.registerAdapter(` 调用（:2411/2412/2489/2586/2723/2860/2861）→ 注释"llm 桩无 registerAdapter"不实 | 上述调用**全部是真实宿主运行时实例的方法调用**：:2411/2412 所在段 `const llm = new LlmRuntime(root)`（smoke.mjs:2346），:2489 段同（:2467），:2860/2861 段同（:2833）。`root.provide('llm', …)` **唯一一处**在 smoke.mjs:290-303，其形状 = `{ listModels, resolveModelInfo, listProviders, stream }`——**无 registerAdapter、无 registration** | 注释属实 |
| `saveSelection:` 定义在 smoke.mjs:2495 → 注释"agentDefaultModel 桩无 saveSelection"不实 | :2495 属**另一段**的夹具（`root.provide('agentDefaultModel', { currentSelection, saveSelection })`，:2493-2499）；注释所指的极简桩在 smoke.mjs:273（`root.provide('agentDefaultModel', { currentSelection: … })`）——**确无 saveSelection** | 注释属实 |
| `tests/host-abi-health.mjs:181-186` 存在三方法探针桩 | 实读属实（:183-186）——但该桩专用于 `probeLlmAdapterFace` 的域 2 探针断言，**不是** ctx-services 消费面夹具，不能反证注释 | 不构成反证 |

**补强证据（注释陈述的承重性）**：`CTX_SERVICES.llm`（`ctx-services.js:45`）与 `CTX_SERVICES.agentDefaultModel`（:51）均含严格方法集；若对这两个面采用严格语义，`smoke.mjs:290` 的 llm 桩（无 registerAdapter）与 :273 的 agentDefaultModel 桩（无 saveSelection）将解析为 null → `RouterService.defaults()`（`service.js:782`）返空 provider/model、`safeListModels`（:932）恒返 `[]`，即相对 B4 前 inline 消费**产生回退**，违反设计 §4.3 L227「调用方语义逐面定义……保持不变，仅收敛获取路径」。第三处独立支撑：`tests/fix-009-image-solo.mjs:128` 的 `settings` 桩仅 `{ describe }`（无 `mutate`），同属下层最小形状夹具。

**两级语义与设计一致性（实质问题）**：一致——严格面 = 消费点不再自持形状守卫的面（`agents` 恢复 B3 前严格语义；`sessionController`/`sessionProjections` B4 时点零访问器消费者），存在性面 = 消费点守卫互异且自持（`llm`/`settings`/`credentials`/`fs`/`attachments`/`subagents`/`agentDefaultModel`）→ 恰为 §4.3 域 3 L227/降级行为原文的"逐面定义、保持不变"。

**误导后续批次风险（B5/B6 会读这些注释）**：低——陈述为真、可复核（已给出文件:行号级等价物），且 §8b:366 以断言形式复核了"存在性解析"这一行为结论。**结论：保留注释原样；本报告不列为发现。**

## 声称核验（Developer 9 条）

| # | 声称 | 裁定 | 关键证据（实读/复算） |
|---|---|---|---|
| 1 | ①P2-2 四常量 version.js 单点 + 桶 import/reexport + 无环 + 值级三面锚定 + G14 重锚 | **属实** | `version.js:17/19-26`；`host-route.js:54/59`（本地零定义）；`host-abi-health.mjs:398/403/404/408`；`fix-031-attribution.mjs:686` |
| 2 | ②P3-5 类方法装配 + rpc 原型挂载删除（4 处命中均注释） | **属实** | `service.js:750-756` 唯一实现；代码面复跑 `rpc.js` `RouterService`=0 / `prototype.hostFaceDiagnostics`=0；`rpc.js:15-19/229-236` 为历史说明注释 |
| 3 | ③F-1 agentPresetsServiceOf 迁域 + 归并单点 + 双语义保留 + 桶零改动 | **属实** | `ctx-services.js:140-148/151`；`llm-selection.js:5-8`（域内零定义）；`preset-defaults.js:120/172/524` 未改；§8c:375-382 |
| 4 | ④F-2 严格面 null+noteHostDiag / 存在性面两级语义 | **属实** | `ctx-services.js:58-67/98-105`；`preset-defaults.js:376-377/444-450`；夹具锚 `smoke.mjs:273/290-303` + `fix-009:128`（见 F-CTX-1） |
| 5 | ⑤注释锚清扫四处（llm-selection 头注 / client / served-client / preset-defaults） | **属实（四处均已完成）；但①翻转遗留 3 处陈旧权威引用 + ctx-services 契约锚 6/8 失效 → 另列 R-1（P2）** | `llm-selection.js:29-38`；`client.js:37-41`+`served-client.js` 镜像；`preset-defaults.js:92-96`；扣分见 R-1 |
| 6 | ⑥probe 三方法并集（LLM_FACE_METHODS 单源）+ 桩同步 | **属实** | `llm-selection.js:43/55/75`；`host-abi-health.mjs:183-186`（三方法 ok / 缺 registration degraded / 缺 listModels degraded） |
| 7 | ⑦F-3 缺面 short-code + 诊断 + 镜像字节同步 + 非缺面保持 failureOf | **属实** | `client-remotes.js:256-262`；`client.js:5238-5246`；§8g:433-439；镜像 SHA256 相等（机核） |
| 8 | ⑧F-6 faces 按名去重（先到先留） | **属实** | `client.js:3742-3755`（`seen` 在 HostHealthCard 作用域内唯一，无遮蔽）；`served-client.js` 镜像；§8f:421 |
| 9 | 24 散点（17+7）/ 白名单快照 §8a / 红演示 / TDD RED 17→GREEN 93 / 23/23 三轮 / 镜像 hash / 治理 2 文件 | **主体属实；运行时项按工具边界标未验证** | 24 散点=31−7（独立复算）✓；白名单独立复算逐项一致 ✓；`check(` 静态计数 = **93**（与 GREEN 93 自洽）✓；镜像 hash ✓；治理文件 ✓（见"治理合规"）；**RED 先红序 / exit 0 / 23/23 / 红演示未验证**（禁止执行测试） |

## 八项累积绑定逐项核验（本任务重点）

| 绑定 | 来源 | 落地位置（实读） | 裁定 |
|---|---|---|---|
| ① P2-2 反向依赖边翻转 | EVO-019 R0 P2-2 | `version.js:19-26`（自持四常量）/ `host-route.js:54,59`（桶 import + re-export，零本地定义）/ `host-abi-health.mjs:398-413` / `fix-031-attribution.mjs:686` | **成立**（无环独立推演见下） |
| ② P3-5 RPC 供数平移 | EVO-019 R0 P3-5 | `service.js:750-756`（hostVersionsOf + faceHealthSnapshot + hostDiagnostics().entries 三合一）；`rpc.js` 原型挂载与 3 个 import 删除（代码面 0 残留） | **成立**（wire 形状/method 名不变） |
| ③ F-1 归属勘正 + 归并单点 | EVO-021 R0 F-1 | `ctx-services.js:140-151`；`llm-selection.js` 域内零导出；桶面不变（§8c:382） | **成立**（附：`agentPresetsOf` 解析面扩宽、零消费者，无回退） |
| ④ F-2 形状降级边缘显式化 | EVO-021 R0 F-2 | `ctx-services.js:68/98-105`；消费点 null 语义 `preset-defaults.js:376-377/444-450`；两级语义注释 :12-21 | **成立**（有诊断事件、有断言 §8b:362-366） |
| ⑤ F-3+F-5 注释锚清扫 | EVO-021 R0 F-3/F-5（B4 承接） | `llm-selection.js:29-38`、`client.js:37-41`+`served-client.js`、`preset-defaults.js:92-96` 四处完成；**遗留 R-1（P2）** | **部分成立**（清扫四处完成；①翻转新引入/遗留陈旧引用 3 处 + `ctx-services.js` 契约锚 6/8 失效） |
| ⑥ probe 三方法并集（probe 半项） | EVO-019 P2-1 / EVO-020 半项 | `llm-selection.js:43` 单源；`:55`（llmFaceOf）/`:75`（probe）同用；`host-abi-health.mjs:183-186` | **成立（终闭环）** |
| ⑦ F-3 modelDirectories 缺面 short-code + 诊断 | EVO-020 R0 F-3 | `client-remotes.js:256-262` + `client.js:5238-5246` + §8g:433-439（含 parity/边界） | **成立** |
| ⑧ F-6 faces 按名去重 | EVO-020 R0 F-6 | `client.js:3742-3755` + 镜像 + §8f:421 | **成立**（测试强度见 R-3） |

## 白名单独立复跑（§8a 复算，逐文件逐面）

| 文件 | 复算（去注释后裸 `ctx.get(` 计数） | 测试 WHITELIST | 一致 |
|---|---|---|---|
| `service.js` | 7 = fs 5 + settings 2 | `{fs:5, settings:2}` | ✅ |
| `host-route.js` | 0 | `{}` | ✅ |
| `wrapper.js` | 1 = agentDefaultModel | `{agentDefaultModel:1}` | ✅ |
| `prestep.js` | 2 = llm 1 + sessionProjections 1 | `{llm:1, sessionProjections:1}` | ✅ |
| `tool.js` | 3 = router | `{router:3}` | ✅ |
| `preset-defaults.js` | 1 = agentDefaultModel | `{agentDefaultModel:1}` | ✅ |
| `client.js` | 9 = remote.\* 2 + dynamic-inject 1 + remote.router 3 + conversation 1 + modelDirectories 2 | 同 | ✅ |
| `index.js` / `oauth-llm.js` / `schemas.js` / `stats.js` / `rpc.js` | 0 | 未登记（=0） | ✅ |

分级放行合理性：#1 设计齐——`service.js` 的 fs/settings 为设计 §10 B4 L405 明示低危面；wrapper/prestep/preset-defaults 为**B4 冻结范围（service.js/host-route.js 24 处）之外的遗留消费点**，白名单注释显式声明"后续批次候选，非放行扩张"；tool.js 的 `router` 为本插件自管 ctx 服务（非宿主 ABI 面）；client.js 为浏览器 fiber 面（B2 域权威 + FIX-026/027 装配，非 §4.3 域 3 "Node 侧 11 服务"）。`preset-defaults.js:291` 遗留（`agentDefaultModel` 1 处）已由白名单 + 台账化承接 → 未见越界放行。

## 无环独立推演（①的关键前提）

1. `host-route.js:54` 依赖闭包 = `host-abi/index.js` → 7 域（`index.js:9-15` 全 `export *`，零逻辑）。
2. 7 域 import 面（**全域 grep**）：`client-remotes.js:34` / `ctx-services.js:38` / `events.js:21` / `inject-manifest.js:20` / `llm-selection.js:40` 仅 `./health.js`；`version.js:17` 仅 `node:module`；`health.js` 零 import；**无任一域 import `host-route.js`/`service.js`/`lib/*`**。
3. 故 `host-route` 的依赖闭包 ⊉ `{host-route, service, oauth-llm}` → **不存在回边**；`service.js:45-52`（host-route + 桶）与 `oauth-llm.js:39-44`（host-route + 桶）均为单向边。与 `host-route.js:70` 头注所述"service → host-route → oauth-llm → service 环"规避纪律相容。
4. 桶零歧义（独立复算 7 域导出名：无重名）→ `export *` 无静默遮蔽；§8e:403/408 另有正则与值级双锁。
5. **结论：① 声称的"反向依赖边已断、无循环 import"独立成立。**

## 治理入仓与锁面合规

- `agent-locks.json` EVO-022 `target_files`/`files` = **13 文件**；commit 修改的 **12 个产品/测试文件 ⊆ 该集合**（`lib/host-abi/index.js` 在锁内未触及）；**2 个治理文件** = `.governance/plan-tracker.md`（EVO-022 行）+ `.governance/evidence-log.md`（EV-179），属 Coordinator A 路径授权留痕（commit message 明文声明）→ **无越锁文件、无未授权改动**。
- 提交时点状态自洽：plan-tracker EVO-022 行 = "开发实现完成（待审查）"、EV-179 = "待审查"，与"先实现提交 → 独立审查 → 终态入仓"的 EVO-020/021 先例一致。
- **观察（非发现）**：EV-179 事实依据栏含"commit 待落（12 文件暂存）"——为提交前写入的不可变历史快照（governance-first A 路径纪律），与 2090267 不矛盾；终态入仓（review-record + 终态行）时补 commit sha 引用即可，无需回改。

## 发现列表（P0~P3）

### R-1（P2 建议）— 注释锚/权威引用清扫未闭环（本批 ⑤ 目标内的残余）

- **位置与依据**（逐条实读命中，均为"注释陈述与代码事实不符"）：
  1. `lib/host-abi/ctx-services.js:29-35`"方法形状契约来源"锚点 8 处中 **6 处失效**：`preset-defaults.js:163` → 现为 `}`；`:194` → 空行；`:214` → `const noteSwap = …`；`prestep.js:193` → 头注文字；`wrapper.js:516` → 无关头注；`oauth-llm.js:449` → `} catch (error) {`。
  2. `lib/host-abi/ctx-services.js:33` 的 `service.js:927` 锚**由本批自身编辑造成失效**——该行现为 `return { id, agent, mode: 'route', … }`，而被引用的 llm 守卫已随切换移至 `service.js:933`（`safeListModels` 内）。
  3. ①权威翻转后遗留陈旧权威引用：`lib/stats.js:98`（"`lib/host-route.js:55 HOST_ROUTE_PROVIDER` 镜像"——`host-route.js:55` 现为**空行**，权威在 `version.js:22`）；`tests/fix-031-attribution.mjs:32`（头注 `↔ host-route.js HOST_ROUTE_PROVIDER`，正文已重锚 `:686`、头注未同步）；`tests/client-render.mjs:1632`（"`lib/host-route.js HOST_ROUTE_PROVIDER`"）。
- **级别理由**：非功能缺陷（值级/行为级均有机器守卫：§8e 值锚 + G14 值锚 + §8a 白名单），故不阻塞；但**不可降为 P3**——① 批内 ⑤ 明文目标即为"注释锚清扫"且该头注块在本 diff 中被改写，属目标未闭环；② `ctx-services.js` 头注是该域契约（`CTX_SERVICES` 方法集）**唯一的来源论证**，P10-④ 禁止无锚定的心智模型形状，陈旧行号使后续批次（B5/B6）无法据以复核；③ 失效面 9 处、其中 1 处为本批自伤，非孤立笔误。
- **建议**：随 B5 首个 commit 一并机械清扫（或独立治理提交）：① 将 `ctx-services.js` 锚点改为"函数名 + 文件"式引用（如 `service.js safeListModels() 内`）替代行号，天然免漂移；② `stats.js:98` / `fix-031-attribution.mjs:32` / `client-render.mjs:1632` 三处改 cite `lib/host-abi/version.js`（`host-route.js` 仅作 re-export 消费面）；③ `fix-031-attribution.mjs:688` 的 detail 键名 `hostRoute` 同步改为 `versionTs`（纯诊断可读性，随批）。

### R-2（P3 讨论）— `CTX_SERVICES.llm` 方法集与 §4.3 域 2 契约/现存守卫不一致

- **位置与依据**：`ctx-services.js:45` `llm: ['registerAdapter','listModels']` vs `llm-selection.js:43` `LLM_FACE_METHODS = ['registerAdapter','registration','listModels']`（§4.3 域 2 L217 "三方法 typeof" 契约）；现存 ctx-services 侧 llm 消费点守卫为**单方法**（`service.js:933` 仅 `listModels`）。文件头自述 `CTX_SERVICES` 为"探测口径单一事实源"，实际已成"分域各自登记"。
- **行为影响**：零——llm 属存在性面（`accessorOf` 忽略 `probe.state`），且 `serviceFaceOf` 的 `probe` 除测试外无消费、未接健康快照（见 R-5）。故仅文档/口径偏差。
- **架构约束说明**：§4.2 L183 "域模块间互不 import" 使域 3 **不能**直接引用域 2 的 `LLM_FACE_METHODS`——本项非编码疏忽，而是跨域契约复述问题。
- **建议**：在 `:44-45` 加一句注释显式声明"本域 llm 登记为 ctx 服务存在性面口径（2 方法），与域 2 适配器注册面三方法契约分属不同判定目标（§4.3 域 2 vs 域 3）"；或在 B6 健康快照接线时决定是否上提共享常量到 `health.js`（需设计侧裁决）。

### R-3（P3 讨论）— F-6 去重缺行为级断言

- **位置与依据**：`tests/host-abi-health.mjs:421` 仅以源码正则（`const mergedFaces = [` / `seen.has(face.name)` / `= mergedFaces.filter`）断言 `client.js` 文本形态；`lib/client.js:3742-3755` 的去重逻辑无渲染/纯函数级断言（同名两源 → 单行 + 先到先留语义）。
- **风险**：源码正则无法识别语义回归（如把 filter 改成恒 true、或把优先级反转），与本批 §8g 已建立的行为级 parity 断言标准不一致。
- **建议**：复用 §8g 既有 bundle 装载路径（`host-abi-health.mjs:427-431` 已能取到镜像导出），追加一条 `HostHealthCard` 渲染或抽出的纯函数断言（`faces=[{name:'x',state:'ok'},{name:'x',state:'missing'}]` → 渲染 1 行且保留首个 state）——成本约 10 行。

### R-4（P3 讨论）— §8a 白名单为双向快照；设计 §10 B4 白名单示例面与实测不符

- **位置与依据**：`host-abi-health.mjs:328-355` 对每个文件的每个面做 `found !== expected` 双向比对 → **收缩也会红**（B5/B6 切换 wrapper/prestep/preset-defaults 遗留点时必先红后改表）。设计 §10 B4 L405 明示白名单面为"settings/typert/webServer/fs 在 **index.js/service.js** 的直用点"，而实测清单中 `index.js` 零裸消费、无 `typert`/`webServer` 面，另多出 wrapper/prestep/tool/preset-defaults/client 各面。
- **风险**：低（双向锁定 = 更严格的安全侧）；但① 后续批次易误判"红色 = 我改错了"而非"需同批更新白名单"；② 按设计原文检索白名单项者会找不到 `typert/webServer`，浪费定位。
- **建议**：① 在白名单注释补一句"收缩同样触发红：切换遗留点时须同批更新本表（有意摩擦）"；② 设计侧或 plan-tracker 的 B5/B6 行同步白名单实测口径（避免后续按设计原文寻项）。

### R-5（P3 讨论）— `registerFaceProbes` 零接线：`faces` 生产恒空（跨批遗留）

- **位置与依据**：全域 grep `registerFaceProbes|runFaceProbes` —— `lib/` 内**仅** `health.js:69/93` 定义，无任何调用；调用方仅 `tests/host-abi-health.mjs:93/107`。故 `RouterService.hostFaceDiagnostics().faces`（`service.js:750-756`）在真机恒为 `[]` → §4.3 域 3 L227 "探测结果入健康快照"对 ctx-services 域未落地（域 1/域 2 同样未接线）。
- **批次判定**：**非本批回归**——B1 头注即声明"注册表为空属设计状态……随 B2-B5 逐域填充"，且 §10 B4 验收（L404-406）只含"白名单 grep + 全量网绿"两项；本批 hostFaceDiagnostics 为**逐字平移**（wire 形状不变），零新增缺口。
- **建议**：在 plan-tracker 显式台账化（EVO-020 已有"真机降级徽章/面板"复验项），归口 B5（events/性能批的探针预算）或 B6（看护成体系）或独立健康面板任务，避免"faces 空态"被误读为本批缺失。

## 未验证项（事实依据红线：工具边界内不可执行）

| 项 | 状态 | 旁证/说明 |
|---|---|---|
| 测试执行（`node tests/host-abi-health.mjs` 等） | **未验证** | 任务禁止执行测试；`check(` 静态计数 = 93 与声称 GREEN 93 自洽 |
| TDD "RED 17" 先红序、红演示（注入裸 `ctx.get('sessionController')` → 精确红） | **未验证（构造性推演成立）** | 白名单双向比对逻辑经独立复算，注入后必 `found=1 expected=0` 红；先红序无法静态复核 |
| 全量网 23/23 exit 0（三轮 / 两轮） | **未验证（本报告不采信为自身复核）** | 已由 Coordinator 独立复跑 @2090267 声明；本审查未执行 |
| 真机面（健康徽章渲染、宿主实机降级观感） | 不属本批范围 | 归 plan-tracker 现有"真机复验"台账（EVO-020 行） |

## 结论

**APPROVED_WITH_NOTES**（`unresolved_blockers=0`）

- **P0 = 0 / P1 = 0 / P2 = 1（R-1）/ P3 = 4（R-2~R-5）**；无未解决 BLOCKING finding（R-1 为零运行时影响的注释可追溯性项，值级与行为级均有机器守卫）。
- **设计一致性**：§4.3 域 3 接口（`serviceFaceOf` + 11 访问器）、§4.2 依赖方向（消费者 → 桶 → 域 → health，无环独立成立）、§10 B4 验收（白名单 grep + 全量网）三项对齐；八项累积绑定 8/8 落地（⑤ 四处清扫完成、残余见 R-1）。
- **一句话理由**：24 处散点切换逐点语义等价、常量权威翻转无环且值级三面锁定、八项绑定全部实读成立、白名单与镜像 hash 独立复算一致；唯一 P2 为注释锚清扫未闭环（含 1 处本批自伤），不构成返工理由，建议随后续批次机械清扫。
