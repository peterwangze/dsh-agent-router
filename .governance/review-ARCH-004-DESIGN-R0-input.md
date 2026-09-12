# ARCH-004-DESIGN-R0 — 设计审查报告（Round 0）

- **审查任务**: ARCH-004-DESIGN-R0（P0）——DSH 宿主兼容性四维设计 Design Doc 独立审查
- **审查对象**: `.governance/arch-004-compatibility-design.md`（449 行，Architect 产出 2026-09-12）——只读
- **审查人**: Design Reviewer Agent（独立，Round 0）
- **审查日期**: 2026-09-12
- **交叉核验源**: 插件仓库 `D:/AI/agent/deepseek/plugins/router`（v0.4.6）+ 升级后宿主 checkout `C:/Users/peter/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/`（0.1.5-rc.2 系，240 包，插件本体已卸载——与「已卸载止损」背景一致）

---

## 结论

**APPROVED_WITH_NOTES**

```yaml
conclusion: APPROVED_WITH_NOTES
unresolved_blockers: 0
findings:
  blocking: 0
  warning: 4
  suggestion: 5
anchor_verification:
  formal_groups: 37        # 插件侧 21 组 + 宿主侧 16 组（含评审中途 Coordinator 补充 4 组一手复证），展开 70+ 逐条锚点
  content_accurate: 37/37  # 锚点全部真实存在且内容实质相符，零编造
  characterization_errors: 2  # W-1（:2116 定性）、W-2（peerDeps 计数）
  precision_notes: 3         # S-2 路径精度 ×2、S-3 包数量
hard_gates:
  anchor_spotcheck_ge_8: PASS（37 组，覆盖 §0 事实基础 / §0.4 资产盘点 / §2-§10 方案章节 / 附录 A）
  blue_team_ge_3: PASS（4 条 BR-01..04，回应实质）
  alternatives_ge_2: PASS（A/B/C 三案，排除理由基于实证）
  adr_fields_complete: PASS（2 个 ADR 字段 100% 完整）
  no_circular_deps: PASS（§4.2 构造性单向：消费者→桶→域→health，域间互不 import）
mid_review_supplement: >
  Coordinator 机核补充（T-2 证伪 / T-3 降级 / T-9 静态前提不成立 / Analyst 63 条清单）已纳入：
  §0.2 与新证据一致（设计未将 T-9 列为高置信机理，无事实基础误归因）；
  新增 W-4（唯一实证断裂未入 B5 范围 + §0 事实基础待补）与 S-5（字段级 wire schema 校验价值上升）。
```

**一句话理由**：七域适配层 + 三层看护 + 诊断环形的分级混合设计方向正确、事实密度极高（70+ 锚点抽验零编造，P5 复用门禁 8/8 资产全部实证），四维硬门槛全过，且 §0.2 症状候选表述与评审中途到达的 Analyst/Coordinator 新证据一致（防御缺失框架相容、无 T-9 误归因）；存在 4 处非阻塞 WARNING（1 处事实定性错误、1 处计数错误、1 处 P5 范围口径、1 处 B5 范围缺口——唯一实证断裂所在订阅面未入迁移清单），均为文档/批次范围级修正，不动摇架构决策，修复后即可作为 B0-B6 实施依据。

---

## 一、锚点抽验清单（硬门槛：≥8 → 实抽 33 组 / 65+ 条）

### A. 插件侧（21 组）

| # | 设计文档声称 | 实读结果 | 判定 |
|---|---|---|---|
| A1 | `package.json:23` inject 含死行 `@deepseek-ai/dsh-client-runtime`（D1-1） | :23 逐字一致（inject 数组第一项） | ✅ |
| A2 | peerDependencies 9 项 `^0.1.0-rc.8`（D1-5/§0.1） | :60-69 存在，**实际 8 项**（:61-68：attachment/agent/agent-default-model/session/settings/subagent/system-prompt/credentials） | ⚠️ W-2 |
| A3 | deps `^0.1.0-rc.6`（§0.1）、`undici` :58（D1-7） | :55-57 三包 rc.6 ✓；:58 undici ^7.18.0 ✓ | ✅ |
| A4 | hostApiFace `lib/client.js:4903-5042`；faceOf :4904-4907；unavailable throw :4908-4912（§0.2 为 :4908-4912 / §4.3 为 :4910-4912）；envelopeOf :4883-4895；映射表 :4828-4847 | 全部逐字命中：:4903 `function hostApiFace(ctx)` 至 :5042 收口；:4910-4912 `throw new Error(...)`；:4883-4895 信封包装；:4828-4847 消费面↔宿主面映射注释表 | ✅ |
| A5 | modelDirectories 双形态 `client.js:4920-4923, 5160-5161`（D1-4） | :4920-4923 directoryFace（ctx.get 优先+属性面兜底）；:5160-5161 refreshSessionDirectory 同构双形态 | ✅ |
| A6 | fiber inject 9 声明 :5060；apply :5062；hostApiFace 调用点 :5067；$mount :5069 | :5060 inject 数组 9 项逐字一致；:5062 `function apply(ctx)`；:5067 `const api = hostApiFace(ctx)`；:5069 `ctx.remote.$mount` | ✅ |
| A7 | 30s catalog 轮询 :5122（单 timer 有界）+ `settings/document-updated` 事件触发 :5121（D1-8） | :5121 `$on('settings/document-updated', ...)`；:5122 `setInterval(refreshCatalog, 30000)` + :5123-5126 卸载清理 | ✅ |
| A8 | `client.js:2116`「OAuth 登录流 2s 轮询（用户触发、有界）」（§0.2/§7.1） | :2116 存在 2s interval，**但实为「实时用量统计 + presetDiag」轮询**（:2098-2117，useEffect `[ready, remote]`，设置页打开期间常驻，卸载清理）；真正的 OAuth 轮询是 :2816-2851（pollDevice）与 :3044-3049（discoverOauth）的 setTimeout 重试链；全文件仅 2 处 setInterval（:2116/:5122） | ⚠️ W-1 |
| A9 | presetDiag 显示链 `client.js:620-621, 2109-2110, 3521-3526`（§0.4） | 三处逐字命中（i18n 标题 / RPC 拉取 / 设置页 details 面板） | ✅ |
| A10 | presetDiag 环形 `preset-defaults.js:113, 124-150`；字段白名单+截断 :127-141；JSON 安全 :116-124 | :113 `PRESET_DIAG_LIMIT = 64`；:124-150 注册表+快照；:127-141 逐字段 slice 截断；注释「纯数据无宿主引用，JSON 安全」 | ✅ |
| A11 | sessionSelectFaceOf `preset-defaults.js:209-240`（apiProxy 回落 :226-238） | :209-240 逐字命中，:226-238 旧面分支（ctx.get('apiProxy')） | ✅ |
| A12 | inheritedRouteOf `preset-defaults.js:249-263` | :249-263 逐字命中（header 优先 + options 回落） | ✅ |
| A13 | liveDefaultSelection 双份重复（`preset-defaults.js:173-182` vs `prestep.js:209-218`） | 两处函数体**逐字同构**（P5 违规实证成立） | ✅ |
| A14 | 零动作降级路径 `preset-defaults.js:363-367`；:365 `skip:'face-unavailable'`（§4.3/§6.3） | :362-367 selectFace 缺失 → warn + diag + return；:365 逐字命中 | ✅ |
| A15 | host-route.js 常量 :53-65（HOST_ROUTE_TICK_MS=30_000）/ P7 :47 / degraded 事件 :161-168 / diff-only 注入 :187-200 / probeHostRoute :218-232（contextWindow :226-230）/ F-1 gate :263-270 | 六个子锚点全部逐字命中（含 Coordinator 机核 :264-269 一致） | ✅ |
| A16 | llm face 检查 ×3：`wrapper.js:516-519` / `oauth-llm.js:449-452` / `service.js:927-928` | 三处独立实现逐字命中（registerAdapter+registration typeof / listModels typeof）——三处复制实证成立 | ✅ |
| A17 | 事件订阅：settings/updated ×4（index.js:244 / service.js:2849 / wrapper.js:618 / oauth-llm.js:512）+ adapters-updated ×2（wrapper.js:613 / oauth-llm.js:511）（D1-9/B5）；附录 A 另列 prestep.js:301、preset-defaults.js:597-598,667 | 全部逐字命中，计数属实 | ✅ |
| A18 | 稳定面直用 `index.js:47,280,283`、`service.js:1026+`（fs :1026/:1109、attachments :1130、subagents :1469） | 全部逐字命中（inject :47 settings/typert/webServer；typert.register :280；webServer.register :283） | ✅ |
| A19 | 宿主包 import：`service.js:26-28` / `prestep.js:33` / `tool.js:24` / `schemas.js:23`（D1-6） | 四处逐字命中（TypertRemoteService/BlockAssembler/createUserMessage/defineTool/schemastery） | ✅ |
| A20 | `tests/adapter-parity.mjs:33-41` 动态契约枚举（§0.4） | :33-41 逐字命中（getOwnPropertyNames 并集 + 静态补 'stream'/'prepareCall'） | ✅ |
| A21 | `tests/fix-029-host-contract.mjs:7-18, 56-100`（宿主面 mock 锚定宿主源码）+ served-client 镜像守卫 | :6-8 注释锚 dsh-api-session-controller types/agent.js:297-318；:57-100 harness + :86-87 projectionsOf mock（stateOf→{lastUsed,pending}）；:364-367 served-client 镜像同步守卫（C4）；`tests/served-client.js` 5271 行、:21 `window.__ModuleLoader__.load` 均实 | ✅ |

### B. 宿主侧（16 组，升级后 checkout 一手实读；B13-B16 为评审中途 Coordinator 补充锚点的一手复证）

| # | 设计文档声称 | 实读结果 | 判定 |
|---|---|---|---|
| B1 | `dsh-client-runtime` 不存在；`dsh-client-modules` 承接 | Test-Path = False；dsh-client-modules 存在（0.1.5-rc.2） | ✅ |
| B2 | 关键包全部 0.1.5-rc.2（dsh=0.1.5-rc.1、cordis=4.0.2） | 15 包逐一刻读：llm/tools/typert-protocol/api-session-controller/api-remotes/app-boot/cordis-host-runner/cordis-client-runner/ui-model-selection/ui-settings/client-locale/package-manifest/client-modules = 0.1.5-rc.2；dsh=0.1.5-rc.1；cordis=4.0.2。目录总数 240（文档称「约 220 包」——近似值，见 S-3） | ✅ |
| B3 | inject 行写不存在包名 = 静默无效：`dsh-client-modules/lib/client.js:265-268`（`if (dependency !== void 0)` 跳过） | :265-268 逐字命中（arriveGraphRow 对 row.inject 缺失目标直接跳过） | ✅ |
| B4 | `dsh.client.inject` 语义 = informational package-name dependencies（dsh-package-manifest `types.d.ts:42-43`） | 实际路径 `lib/types/types.d.ts:42-43`：`/** Informational package-name dependencies, not Cordis service injection. */ inject?: string[]` ——内容逐字命中（路径精度见 S-2） | ✅ |
| B5 | `dsh.bundle.patch` 机制存续（dsh-app-boot `lib/index.js:293-314`）；patchReload live\|startup、web=live、不存在条目仅 stderr 警告（README L50/L55） | :288-317 文档块完整描述 bundle patch 组合机制（代码常量 :311-316）；README :50 patchReload 段 + :55「A patch naming an entry that does not exist prints a stderr warning」逐字命中 | ✅ |
| B6 | `sessionController.selectModel/modelCatalog` 存续（dsh-api-session-controller `index.js:605/2502-2503`） | 实际路径 `lib/index.js`：:605 `async selectModel(request)`；:2502-2503 `_selectModel_decorators=[Remote("selectModel")]` / `_modelCatalog_decorators=[Remote("modelCatalog")]`——内容命中（路径见 S-2） | ✅ |
| B7 | llm 四方法存续（dsh-llm `index.js:1780/1846/1905/1653`） | `lib/index.js` 四处逐字命中：:1653 `listModels(_provider)`、:1780 `registerAdapter(providers, adapter)`、:1846 `listProviders()`、:1905 `listConfigurableProviders()` | ✅ |
| B8 | `modelDirectories` 服务存续（dsh-client-ui-model-selection `client.js:272`） | `lib/client.js:272` `super(ctx, "modelDirectories")` 逐字命中 | ✅ |
| B9 | 转发事件 `agent-preset/selected`（dsh-api-remotes `API_REMOTE_FORWARDED_EVENTS`） | `lib/types/remote-events.js:12-13` 首项 `{ event: 'agent-preset/selected', mode: 'emit' }`；README :41 确认该名单即 `ctx.remote.$on` 合法键集 | ✅ |
| B10 | runner `waitingFor` 门控（dsh-cordis-client-runner `client.js:581`） | `lib/client.js:581` `waitingFor: Object.keys(fiber.inject).filter((name) => this.env.ctx.get(name) === void 0)` 逐字命中 | ✅ |
| B11 | `__ModuleLoader__.load` factory = dsh-client-modules 原生协议（`lib/index.js:388-409` bootInjections）；README L64「anything else throws」 | :387-409 bootInjections 逐字命中（window.__ModuleLoader__ queue 协议）；README :60「the module system is the single replacement for "how plugin code arrives"」+ :64「...anything else throws」逐字命中 | ✅ |
| B12 | 宿主加载器/runner 零 peerDependencies enforcement（dsh-cordis-host-runner/lib、cordis/lib grep 零命中） | 两目录 grep `peerDependencies` 均零命中 | ✅ |
| B13 | [Coordinator 补充] listConfigurableProviders 0.1.5 wire schema 与插件 joinProviderDirectoryHost 消费逐字段兼容（api-remotes `lib/client.js:5727-5734`，新增可选 `error`） | :5727-5734 schema = {provider, displayName, settingsNs, settingsPath, declared?, error?}；插件消费面（client.js:4856-4878）仅读前五字段且 declared 本就可选——兼容成立，T-2 崩溃候选排除 | ✅ |
| B14 | [Coordinator 补充] modelCatalog 0.1.5 wire schema 完整存续（api-remotes `lib/client.js:8164-8193`） | :8164-8193 schema = {default, routableProviders, groups[{id,name,models[...]}], failures[{id,name,message}]}；插件 hostApiFace llm.models 消费面（client.js:4939-4940，Array.isArray 守卫读 groups/failures）在 schema 内 | ✅ |
| B15 | [Coordinator 补充] probeHostRoute 判据形状 0.1.5 存续（dsh-llm `index.js:2055-2067` 校验并返回 context.contextWindow） | :2053-2067 `resolveModelInfo` 校验 `Number.isInteger(context.contextWindow) > 0` 并于 :2067 原样返回——T-9「parity 恒败→30s 写循环」静态前提不成立 | ✅ |
| B16 | [Coordinator 补充] openai-codex 目录仍在 installed catalog（dsh-llm-pi-ai `index.js:803-804`） | :800-807 文档块逐字含「`openai-codex` is the one the installed catalog ships」 | ✅ |
| B17 | [交叉自证] 唯一实证断裂：插件订阅 `credentials/updated` 而宿主白名单已改名 `credentials/reference-updated` | 插件 `client.js:2093` `$on('credentials/updated', ...)`（本审查 A 组实读）；宿主转发白名单 `remote-events.js:21` 仅含 `credentials/reference-updated`、无 `credentials/updated`（本审查 B9 组实读）——静默死订阅成立（功能退化非崩溃，与 Analyst 结论一致） | ✅ |

**核验率**：37/37 组锚点真实存在且内容实质相符（100%）；其中 2 组含定性/计数错误（A2/A8）、2 组路径精度偏差（B4/B6）、1 组数量近似（B2）。**零编造锚点——不触发 BLOCKING 红线。**

### C. §0.2 症状候选表述与 Coordinator 补充证据的一致性评估（评审中途到达，应 Coordinator 要求裁量）

**结论：一致，无事实基础误归因，不触发新 WARNING/NEEDS_CHANGE（T-9 专项）。**

- 设计 §0.2 症状②的表述是**假设级候选清单**（「候选机制 = 每渲染探针 / 事件风暴 / RPC 风暴 / 遥测放大」）+ 现状轮询/回环锚点，**从未将 T-9（parity 恒败→30s 写循环）列为高置信机理**；相反它如实记载「F-1 回环抑制已落地（lib/host-route.js:270）」（本审查 A15 组实读确认 gate 存在）。T-9 静态前提被 B15/B16 证伪后，该表述反而被强化——设计的义务是「适配层自身不成为新负担」（BR-01），不是裁决心②根因，与新证据「防御缺失+候选未决」的归因框架相容。
- 症状①：设计表述（裸消费 undefined 面 → FIX-028 形态整页崩）与 T-2 排除/T-3 降级/T-8（settings.section 无 per-section 错误边界，单源崩溃放大为多插件页）不矛盾——T-8 是放大器结构事实，设计的 throw→degraded 信封（B2）恰好切断插件自身面对该放大器的贡献。§0.2 未列 T-8 属事实基础不完整（并入 W-4 备注），非错误归因。
- 候选权重向 T-10（catalog 轮询成本）/T-11（错误重抛×宿主重试）转移：D1-8（catalog 事件驱动化）与归一信封（禁 throw 外溢）分别正面覆盖两者——设计方向与转移后的权重一致。

---

## 二、四维逐项审查

### 维度 1：设计合理性 — PASS

- **模块拆分单一职责**：七域每域职责声明均为 ≤3 句（§4.3 逐域核对）；桶 index.js 零逻辑；上帝模块论证（§4.1）给出了单文件方案的量化反对理由（≥14 面 / ≥40 导出 / 5271 行先例）。成立。
- **依赖方向**：§4.2 图构造性证明无循环——域间互不 import、全部只依赖 health.js（health 自身零内部依赖）；`lib/service.js:26-28` 等协议对象直用保留有明确豁免理由（协议规范 ≠ 宿主面消费，D1-6）。成立。
- **接口最小化可版本化**：域 1 接口定义完整（输入/输出/错误码三分 `host-face-missing`/`host-face-shape`/`host-face-call` + 降级信封语义）；envelope 形状与现状 `client.js:4883-4895` 逐字一致（已实读比对）——消费点零改动承诺有事实基础。域 2-6 接口签名齐备。
- **throw→degraded 语义变更**：现状 unavailable 为 throw（:4910-4912 实读确认），设计改为面级降级信封 + 诊断事件，直接回应 FIX-028 教训（整页失败 → 单面卡片降级）。方向正确，B2 验收标准含面缺失注入测试。
- **数据流**：§6.1 五层链路（探针注册→自检→环形→RPC→面板/徽章）每层都有已验证的先例锚点（presetDiag 全链 A9/A10 组）。

### 维度 2：技术债务评估 — PASS

- **P5 复用门禁（抽验 ≥4 → 实抽 8/8 全部实证）**：hostApiFace（A4）、sessionSelectFaceOf/inheritedRouteOf（A11/A12）、probeHostRoute（A15）、presetDiag 环形（A9/A10）、adapter-parity（A20）、fix-029 判别测试（A21）、served-client 镜像（A21）、F-1 gate（A15）——八项资产全部真实存在且复用方式（迁入/推广/通用化/保留）与锚点内容相符。**零重复造轮子**。
- **现状 P5 违规实证成立**：liveDefaultSelection 双份逐字同构（A13）、llm face 检查三处独立实现（A16）——方案 B「加剧违规」与方案 C「直接消除」的论证均有实读证据。
- **过度工程检查**：每域均有「当前需要」理由（断裂史映射，§0.3 的 12 次断裂 → 三类面 → 高/低危分级链条成立）；低危面不迁移（方案 A 排除）的理由基于实证（A18 组核验 webServer/typert/fs 直用点存在且 §0.3 断裂链中无此类面的断裂记录——内部一致）。**方案 A 排除理由成立**。
- **刻意债务有偿还计划**：低危面保留直用但纳入 D3 静态快照 + D4 探针（§2 方案 C）；apiProxy 旧面删除的兼容性债务以「域内保留形态探测结构 + 1 分支 + 1 组判别测试」量化了加回成本（BR-04④）。

### 维度 3：安全与合规 — PASS

- **不扩大权限面**：域模块仅代理既有 ctx 面（§7.2）；version.js 只读包元数据。
- **凭据边界不变**：P7 红线锚点实读确认（host-route.js:47）；diff-only 注入 :187-200 实读确认；诊断环形字段白名单 + 截断 :127-141 实读确认——FaceHealth/新 RPC 面不含凭据值的设计与现状纪律同构。
- **新 RPC 暴露面**（router/hostFaceDiagnostics）：返回版本 + 面健康 + 有界诊断条目，均为非敏感数据；错误信息「错误码 + 面名，不含环境细节」承诺明确。无泄漏面。

### 维度 4：可演进性 — PASS（含 S-1 备注）

- **迁移路径**：B0-B6 每批有独立范围/验收/回滚；依赖序明确；B2/B3 无文件重叠（可并行主张成立）。回滚机制分层合理（B1 删文件 / B2-B5 revert 批 commit / B0 revert 单 commit）。
- **性能预算（BR-01，症状②直接关联）**：已量化（透传 ≤1μs、零新增异步跳数、探针三时机、渲染路径禁入、环形 64 有界、订阅去重、不新增常驻 timer），且结构性断言（probe 渲染期 0 次 / 订阅数 ≤ 迁移前 / 无新增常驻 timer）进了 B1/B5 验收标准——**但 ≤1μs 数值本身无对应判别测试**（见 S-1）；且现状轮询盘点含一处定性错误（W-1），修正后「现状基线持平」的比对基础才完整。
- **适配成本可验证降低**：§7.3 量化对比（2-4 人日/5-8 文件 → 0.5-1 人日/1-2 文件）有 FIX-030 实耗先例支撑，且验证机制（黑名单测试指认消费点 + 快照 diff 指认漂移面）进了 B6 验收（人为注入裸 ctx.get → 红；换假版本 → 红）。可信。

---

## 三、六维度对照（角色定义）

| 维度 | 阈值 | 结果 |
|---|---|---|
| 方案完整性 | 候选≥2、标准预定义、排除理由充分 | ✅ 三案（A/B/C），评估标准五维先行定义（§2 开头），排除理由全部锚定实证 |
| 蓝军挑战 | ≥3 条、每条有缓解 | ✅ 4 条（BR-01..04），逐条评估见 §五 |
| 模块结构 | 职责≤3句、无循环、分层正确 | ✅ 七域均 ≤3 句；构造性无循环；消费者→桶→域→health 单向 |
| 接口契约 | 输入/输出/异常完整 | ✅ 域 1 全契约（含错误码三分）；域 2-6 签名齐备（S 级备注：域 3 `serviceFaceOf` 返回形状已给，各访问器的异常语义继承现状逐面定义——可接受） |
| 非功能需求 | 性能/安全/可扩展/可维护各有方案 | ✅ §7.1-7.4 逐项（S-1 备注） |
| Bar Raiser | 独立评审人参与、结论明确 | ✅ 本报告即独立评审记录（Round 0）；设计文档自身不含评审记录属正常（评审由治理流外部供给） |

---

## 四、P 原则对照

| 原则 | 对照结果 |
|---|---|
| P1（结论锚定事实） | ⚠️ **2 处轻度违反**（W-1/W-2，均文档级事实错误，非编造）；其余全部结论可溯源实证 |
| P5（单路径 + 旧路径删除） | ✅ 每批「切换 + 同批删除旧实现」；现状 ×2/×3 重复收敛为单点；⚠️ 2 处范围口径缺口（W-3：events「单点」声明 vs 守卫覆盖；W-4：客户端 `$on` 订阅面未入 B5——含唯一实证断裂死订阅） |
| P8（降级可观测） | ✅ 每个降级动作 → noteHostDiag 条目；现状基准（:365 skip 码）实读确认；「降级不静默改行为」三信号（徽章/面板/卡片内联）设计完整 |
| P9（能力自证或 parity 守卫） | ✅ 浅 probe（方法级 typeof）+ verifyDeep 真调用（probeHostRoute 先例 :226-230 实读确认）+ 失败驱动复检（degraded + 30s debounce）三层；sessionController 深探测不可行的裁量有说明（播种即调用） |
| P10-④（测试桩锚定宿主源码） | ✅ §5.1 第 2 项成体系推广 fix-029 范式（先例 :7-18 实读确认锚宿主 types/agent.js:297-318）；B6 验收含红/绿演示 |

---

## 五、蓝军评估（门槛 ≥3 → 4 条，逐条实质评估）

| ID | 挑战 | 回应实质评估 |
|---|---|---|
| BR-01 | 适配层自身成新单点/性能负担 | **实质**。四项缓解均为结构性：探针三时机 + 渲染路径禁入（B1/B5 判别测试「render 期 probe 计数=0」可执行）；订阅共享单 listener（4→1 实证先例 A17）；环形 64 有界（先例 A10）；预算进验收（结构性部分）。缺口：≤1μs 数值无测试（S-1）。 |
| BR-02 | 存在性通过但形状漂移 | **实质**。四层叠加（方法级 typeof / verifyDeep 判「目录事实形状」——probeHostRoute :226-230 先例实读属实 / 静态契约快照锚宿主源码 / 调用期失败归一信封进环形），且明示「单层失效不致命」的纵深论证。非口号。 |
| BR-03 | 静态层读宿主 node_modules 用户环境不可达 | **实质**。三层定位切割清晰：静态层限 dev/CI + CI 锁版本安装；用户运行时不依赖文件系统（probe + 版本遥测经自身 dependencies 解析）；报障走 RPC 导出。CI 第③步挂起有明确依赖理由（仓库托管决策）。 |
| BR-04 | 旧宿主兼容永久丧失 | **实质**。单环境 0.1.5-rc.2 + npx 单向刷新的事实基础（B2 组核验）；加回成本量化（1 域内分支 + 1 组判别测试）；独立批次可 revert；P5 裁量给出真实代价对比（探测多一跳 + 测试面 ×2）。 |

---

## 六、替代方案与 ADR 门槛

- **替代方案 ≥2**：✅ A/B/C 三案。A 排除理由（零断裂面迁移只引回归 + 12-15 人日 + 违反批次原则）基于实证；B 排除理由（peerDeps 证伪 B12 + 新消费点绕过 + probe 复制本身 P5 违规 A13/A16）基于实证——**均非偏好**。
- **ADR 门槛 ≥1 字段完整**：✅ 2 个（ADR-ARCH-004-A/B），逐字段核对：标题/日期/状态/背景/决策/备选方案/排除理由/影响范围/后续动作/可逆性 **100% 完整**；可逆性评级（A 高 / B 中）与正文论证一致。

---

## 七、Findings 明细

### BLOCKING（0）

无。锚点零编造；无根本性设计缺陷。

### WARNING（4）

**W-1（P1-violation）事实定性错误：`lib/client.js:2116` 不是「OAuth 登录流 2s 轮询」**
- 证据：§0.2「`lib/client.js:2116` OAuth 登录流 2s 轮询（用户触发、有界）」、§7.1 轮询纪律行同引。实读：:2098-2117 该 interval 是「实时用量统计（stats RPC）+ presetDiag RPC」轮询，`useEffect([ready, remote])` 驱动——**插件设置页打开期间常驻**（卸载清理），非用户单次触发；全文件仅 :2116/:5122 两处 setInterval；真正的 OAuth 轮询是 :2816-2851（pollDevice）与 :3044-3049（discoverOauth）的 setTimeout 重试链。
- 影响：症状②的「现状锚点」盘点不准确；D1-8/B5 的轮询面清单漏掉这条页内常驻 2s 双 RPC 面；§7.1「现状基线持平」的比对基础不完整。
- 建议：① 修正 §0.2/§7.1 定性（OAuth 锚点改指 :2816-2851/:3044-3049；:2116 如实标注为页内常驻统计/presetDiag 轮询）；② 在 D1-8 或 B5 范围中显式裁决该面（接受为基线并记录理由，或纳入事件驱动化），不应留作错误标注。

**W-2（P1-violation）peerDeps 计数错误：9 项 → 实际 8 项**
- 证据：D1-5「peerDependencies 9 项 `^0.1.0-rc.8`（package.json:60-69）」；实读 :61-68 共 8 项。
- 影响：轻微；但 B0 批要以此写 README 兼容矩阵与版本快照，应先正名。
- 建议：改为 8 项并复核 B0 范围描述。

**W-3（P5 口径）events 域「宿主事件订阅单点」声明与守卫覆盖不一致**
- 证据：§4.1/§4.3 域 4 称「宿主事件订阅单点」，但 B5 仅迁移 6 个 listener（settings/updated ×4 + llm/adapters-updated ×2）；`agent/created`、`agent-preset/selected`、`agent/request` 订阅（preset-defaults.js:597-598,667、prestep.js:301，附录 A 自列）保持直连 `ctx.on`；且 §5.1 消费点黑名单只覆盖裸 `ctx.get('<高危面名>')`，**不覆盖 `ctx.on`**——未来新增订阅点可静默绕过 events 域，「单点」无机器 enforcement。
- 建议：二选一——① 把域 4 声明收敛为「共享事件订阅单点（去重/聚合/gate）」（如实反映范围）；② 或扩展 B5 范围至全部宿主事件订阅 + 在 D3(a) 黑名单中增加 `ctx.on`/`$on` 直连规则（域文件白名单除外）。

**W-4（范围缺口，依据评审中途 Coordinator/Analyst 补充证据）唯一实证断裂所在的客户端 `$on` 订阅面未入 B5 迁移范围，§0 事实基础未纳入 Analyst 并行结论**
- 证据：Analyst 63 条/126 接触点清单的**唯一实证断裂** = 事件白名单改名 `credentials/updated` → `credentials/reference-updated`（静默死订阅）。本审查独立复证：插件 `client.js:2093` 订阅旧名 `$on('credentials/updated')`；宿主转发白名单 `dsh-api-remotes lib/types/remote-events.js:21` 仅含 `credentials/reference-updated`——订阅永不触发（功能退化：凭据变化不刷新账号卡，非崩溃）。而 B5 范围仅列「4 处 `settings/updated` 与 2 处 `llm/adapters-updated` 收敛 + catalog 轮询挂 events」——**客户端 `$on` 订阅面（client.js:2090-2095 的 settings/document-updated、credentials/updated（死）、llm/adapters-updated、:5121、:5182）不在其中**，尽管 §4.3 域 4 职责声明明确包含 `ctx.remote.$on`。同批补充：症状①结构候选 T-8（settings.section 无 per-section 错误边界）亦未入 §0.2。
- 影响：events 域的架构价值（订阅可达性探测，锚 API_REMOTE_FORWARDED_EVENTS）恰是该实证断裂的对症解，但按 B5 现范围实施后**该断裂不会被修复也不会被发现**——设计目标「第一时间发现」在唯一已证缺陷上落空。
- 建议（B5 前置修正，非架构变更）：① B5 范围显式纳入客户端 `$on` 订阅迁移，至少含 `credentials/updated` 死订阅的修复（改订 `credentials/reference-updated`）；② 订阅可达性探测实现为「事件名 ∈ API_REMOTE_FORWARDED_EVENTS 转发白名单（scoped 事件分型）」的静态+运行时双检，使此类改名漂移进 D3/D4 看护；③ §0 事实基础补记 Analyst 结论（唯一实证断裂 + T-8 结构候选 + T-2/T-3/T-9 裁定），使设计文档与并行任务证据链闭合。

### SUGGESTION（5）

**S-1** §7.1 透传预算「单次附加 ≤1μs」无对应验收断言（B5 只列结构性断言）。建议补一个微基准断言（N 次透传附加耗时均值阈值），或将该行预算改写为纯结构性表述（零新增异步跳数 / 无每调用新分配热点——后者已用「与现状 envelopeOf 同构」论证）。
**S-2** 宿主锚点路径精度：dsh-api-session-controller 实为 `lib/index.js`（:605/:2502-2503）；dsh-package-manifest 实为 `lib/types/types.d.ts`（:42-43）；dsh-app-boot `lib/index.js:293-314` 是描述机制的文档块（代码常量在 :311-316）。内容全部命中，但 B6 的「桩锚定宿主源码行号」纪律将复制这些锚点——建议统一为精确路径，避免守卫测试锚到错误路径。
**S-3** §头部「约 220 包」实测 240（2026-09-12）。建议刷新数字或标注盘点日期。
**S-4** 域 1 降级面的每方法调用都 `noteHostDiag({kind:'face-degraded'})`：高频消费者重试时同面同码条目会快速 churn 64 槽环形（挤出其他诊断）。建议连续同键条目去重/节流（如同 face+code 30s 内合并计数）。
**S-5**（依据 T-3 降级）modelCatalog 形状漂移假说降级为「渲染层访问 schema 外字段」待验——设计当前 probe 只到方法级 typeof，静态快照只锁导出面集合。建议在 D3(a) 快照或 D2 probe 中增加**字段级 wire schema 白名单断言**（至少覆盖 modelCatalog groups/failures 与 listConfigurableProviders 条目字段集，锚 api-remotes `lib/client.js:5727-5734`/`:8164-8193` 的 wire schema 定义），使该假说机器可判。

---

## 八、结论重申

设计文档以极高的事实密度支撑了方案 C 的每一个决策点：37 组锚点抽验（70+ 条，含评审中途 Coordinator 补充的 4 组一手复证与 1 组交叉自证）零编造、P5 复用门禁 8/8 实证、蓝军 4 条全实质、ADR 双案字段完整、四维硬门槛全过；§0.2 症状候选表述与 Analyst/Coordinator 新证据（T-2 证伪、T-3 降级、T-9 静态前提不成立、唯一实证断裂 = 事件白名单改名死订阅）**一致**——设计从未将 T-9 列为高置信机理，其「防御缺失」框架与「防御缺失+候选未决」新归因相容。4 条 WARNING 均为文档级/批次范围级修正（1 定性、1 计数、1 口径、1 B5 范围缺口），不触及架构决策与批次结构，修复后即可作为 B0-B6 实施输入；其中 **W-4 为 B5 前置修正**（客户端 `$on` 订阅面入 B5 + 死订阅修复 + 白名单可达性双检 + §0 事实基础补记 Analyst 结论）。

**APPROVED_WITH_NOTES** ｜ unresolved_blockers: 0 ｜ BLOCKING 0 / WARNING 4 / SUGGESTION 5 ｜ 锚点核验率 37/37（内容实质 100%，定性偏差 2）

*（本文件为 Reviewer 唯一输出；正式结论由 Coordinator 经 review-record 机录。）*
