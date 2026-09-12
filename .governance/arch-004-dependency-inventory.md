# ARCH-004 — DSH 宿主依赖全量清单 + 升级症状归因域分析

> - **生成时间**: 2026-09-12 08:53 (+08:00)，Analyst Agent（ARCH-004）
> - **修订**: R1（2026-09-12，Requirement Reviewer R0 APPROVED_WITH_NOTES/unresolved_blockers=0 机录 REVIEW-ARCH-004-R1 后的非阻断修正轮）——W-1 C-8 锚点笔误勘正；W-2 Coordinator 三项机核裁决回注（T-2 证伪 / T-3 降级 / T-9 静态前提不成立）+ 症状②候选优先序重排（②-2 ≥ ②-3 > ②-4 > ②-1）；W-3 统计口径可重构化；D-2 加 Reviewer 独立复证注记。本版为 B 批次实施的事实基线冻结版。
> - **被分析变更**: DSH 宿主升级（外部变更）——插件最后一次适配面 = 0.1.2-rc.1（FIX-028/029/030/032 链），本次宿主 = **dsh 0.1.5-rc.1 / 全 dsh-* 包 0.1.5-rc.2 / cordis 4.0.2 / schemastery 3.18.2**（跨 0.1.2→0.1.5 三个 rc 小版本）
> - **宿主 checkout（一手权威，只读）**: `C:/Users/peter/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/`（约 220 包；下文宿主锚点均相对此根，记作 `<host>`）
> - **插件仓库（工作区）**: `D:/AI/agent/deepseek/plugins/router`（lib/ 15 模块 + tests/ 22 套件）
> - **方法学**: 代码级对照取证——插件宿主面期望（文件:行号）vs 升级后宿主源码实际形状（包:文件:行号，全部实读，无记忆填空）。真机取证不可行（插件已卸载止损）。
> - **分级定义**: L1 公开稳定契约 / L2 官方但演进中 / L3 内部实现细节依赖 / L4 无契约事实依赖（纯观察行为）
> - **关键背景事实（Coordinator 机核 + 本文复核）**: ① `@deepseek-ai/dsh-client-runtime` 在升级后宿主中**不存在**（被 `dsh-client-modules` 取代）；② peerDeps `^0.1.0-rc.8` 对 0.1.5-rc.2 语义可满足（semver 范围内）→ **安装器零报警，漂移完全静默**（RISK-003「无预警通道」又一实证）；③ `dsh.bundle.patch` 机制存续（`<host>dsh-app-boot/lib/index.js:293-314` profile patch 组合 + `"dsh": {"bundle": {"patch": ...}}` 声明读取）——插件服务端半加载路径（bundle 注册面）完好。

---

## Step 1: 范围分析（change-impact-checklist）

- **目标一句话**: 盘点 dsh-agent-router 插件对 DSH 宿主的全部依赖点（机器可核查清单，双侧锚点），并定位「升级后部分 plugin 设置页崩溃（症状①）」与「DSH 整体异常卡顿（症状②）」的最可能归因域，作为 Architect 四维兼容性设计（D1 依赖最小化 / D2 必需接口解耦 / D3 严格校验看护 / D4 可调测性）的事实输入。
- **涉及文件**（插件侧 = 宿主面文件全集）:
  - `lib/` 15 模块全量：service.js (238KB) / client.js (359KB) / stats.js (83KB) / preset-defaults.js (41KB) / oauth-credentials.js (38KB) / attachments.js (35KB) / schemas.js (33KB) / wrapper.js (33KB) / oauth-llm.js (27KB) / host-route.js (24KB) / index.js (17KB) / prestep.js (17KB) / tool.js (13KB) / rpc.js (8KB) / memory.js (4KB)
  - `package.json`（deps/peerDeps/dsh.client.inject/dsh.bundle.patch 声明面）
  - `cordis.patch.yml`（宿主平面两行）
  - `tests/` 守卫（adapter-parity.mjs / fix-029-host-contract.mjs / rpc-shadow-guard.mjs / served-client.js 镜像——作为依赖面看护现状引用，非本任务分析对象）
- **层次归属**: 宿主行（index.js/tool.js = cordis 组合层）· 服务/领域层（service.js 及各 install 模块）· 浏览器侧 dual-face（client.js）· 契约声明（schemas.js/rpc.js/package.json/cordis.patch.yml）。

---

## Step 2: 依赖分析（核心清单）

### 2.0 覆盖总表（15 模块 × 宿主接触面）

| # | 模块 | 宿主接触面（类） | 接触点数 | 宿主依赖判定 |
|---|------|------------------|---------|--------------|
| 1 | index.js | A(settings/typert/webServer) + D(settings/updated) + G(bundle 行) + logger | 8 | 有 |
| 2 | service.js | A(llm/fs/attachments/credentials/subagents/settings/agentDefaultModel) + E(TypertRemoteService/BlockAssembler/message) + D(settings/updated) + F(header/requestHeader/exec 形态) | 22 | 有（最重） |
| 3 | client.js | C(4 命名空间全消费 + slots/locale/remote/modelDirectories) + B(RPC 域名面全集) + D(客户端 $on ×4) + F(loader/react/CSS tokens) | 38 | 有（最广） |
| 4 | preset-defaults.js | A(agentPresets/agentDefaultModel/sessionController/apiProxy[回落]/agents) + D(agent/created, agent-preset/selected, agent/request) + F(header/options/继承基线) | 12 | 有 |
| 5 | prestep.js | A(sessionProjections/agentDefaultModel/llm) + D(agent/pre-step) + E(createUserMessage) + F(requestHeader/options/selection 判定链) | 9 | 有 |
| 6 | wrapper.js | A(llm/agentDefaultModel) + D(llm/adapters-updated, settings/updated) + F(适配器契约/chunk 词汇) | 10 | 有 |
| 7 | oauth-llm.js | A(llm) + D(llm/adapters-updated, settings/updated) + F(适配器契约) | 7 | 有 |
| 8 | host-route.js | A(credentials/settings/llm) + F(llm-pi-ai ns/openai-codex 目录形状/ref 命名) | 8 | 有 |
| 9 | tool.js | A(tools/systemPrompt/router[自提供]) + E(defineTool) + F(exec 形态) | 6 | 有 |
| 10 | stats.js | F(DSH_HOME 推导) | 1 | 有（仅路径约定） |
| 11 | attachments.js | F(DSH_HOME/attachments/v1 布局) | 1 | 有（仅路径约定） |
| 12 | oauth-credentials.js | F(DSH_HOME 推导) | 1 | 有（仅路径约定） |
| 13 | rpc.js | A(typert.register 形状) + C(ctx.remote.$mount 形状)——均为**插件自有契约**经宿主通道挂载 | 2 | 有（自有契约面） |
| 14 | schemas.js | E(schemastery z) | 1 | 有（仅外部库） |
| 15 | memory.js | **无宿主依赖**（纯进程内 Map/LRU/TTL，零 ctx/零 import 宿主面） | 0 | 无 |

### 2.1 A 类——服务端 ctx 服务解析（逐条六字段）

#### A-1 `settings` 服务
| 字段 | 内容 |
|---|---|
| 消费面 | `register(ns, schema, {applies:'live'})` / `scope.get()`（attach 后配置读）；`describe({redactSecrets:true})` / `mutate(ns, ops, expectedRevision?)` / `writable` / `get(ns)` 同步内存读 |
| 插件锚点 | index.js:217（register ROUTER_NS）；service.js:3607-3618（config→describe）、:3623-3634（save→mutate）、:2849（settings/updated 监听）；host-route.js:206-211（get 读 providers 条目）、:247-253（mutate 可用性判定）、:318/:357/:381（mutate 写/回滚/清理）、:423-427（get 实时核验） |
| 宿主锚点 | `<host>dsh-settings/lib/index.js:281`（register，:288 `applies: options?.applies ?? "live"` 默认即 live）、`:351`（describe）、`:433`（mutate(ns, ops, expectedRevision) 三参签名一致）、`:566`（settings/updated 提交事件） |
| 分级 | L1（settings seam 为宿主 base 组合行公开面） |
| 历史断裂 | FIX-030-A 关联（apiProxy → sessionController 演进中 settings 语义未变）；无 settings 面直接断裂记录 |
| 当前状态 | **✅ 存在且形状一致**（register/describe/mutate/get/writable + settings/updated 全部实读核对；mutate 三参与插件 save 调用形态吻合） |

#### A-2 `typert` 注册表
| 字段 | 内容 |
|---|---|
| 消费面 | `ctx.typert.register(contribution)`——contribution = {package, face:'host', schemas, invocations, model} |
| 插件锚点 | index.js:280（ctx.typert.register(createHostContribution())）；rpc.js:209-218（contribution 形状）、:37-207（18 个描述子） |
| 宿主锚点 | `<host>dsh-typert-registry/lib/index.js:398`（register(contribution)）、:135-155（ctx.typert 反射面注册 + effect 标签 `typert.remotes.register(...)`） |
| 分级 | L1 |
| 历史断裂 | FIX-011（instance 字段遮蔽方法 → method-unavailable，插件侧缺陷非宿主断裂）；FIX-020（宿主网关断言演进牵制 imageData——已绕开） |
| 当前状态 | **✅ 存在且形状一致** |

#### A-3 `webServer` 路由注册表
| 字段 | 内容 |
|---|---|
| 消费面 | `ctx.webServer.register({kind:'exact'\|'prefix', path, handler})`；前缀路由最长前缀优先语义 |
| 插件锚点 | index.js:283-287（exact `/router-oauth/callback`）、:293-297（prefix `/router-assets`） |
| 宿主锚点 | `<host>dsh-host-webserver/lib/index.js:176-177`（register 按 `route.kind === "exact"` 分流两张表）、:147-148（exact/prefixes 表）、:321-328（match：exact 未命中 → 最长前缀优先，`pathname === prefix || startsWith(prefix + '/')`） |
| 分级 | L1 |
| 历史断裂 | 无 |
| 当前状态 | **✅ 存在且语义一致**（EVO-12 prefix 路由假设仍成立） |

#### A-4 `llm` 服务（最大耦合面）
| 字段 | 内容 |
|---|---|
| 消费面 | `registerAdapter([provider], adapter)` / `registration(provider)` / `listProviders()` / `listModels(provider)` / `resolveModelInfo(provider, model, signal)` / `stream(options)` / `registration(provider).adapter`（适配器对象面：providerInfo / providerRetryPolicy / listModels / resolveModel / **prepareCall** / stream） |
| 插件锚点 | wrapper.js:516-519（可用性判定）、:577/:596（wrappableProviders→listProviders + registerAdapter twin）、:302-376（createWrapAdapter 完整适配器契约，:371 prepareCall 显式实现）、:425/:451（llm.stream 委托）；oauth-llm.js:449-453（可用性）、:499（registerAdapter chatgpt-oauth）、:311-437（createOauthAdapter 全契约，:329 prepareCall）；prestep.js:270-275（registration(probeProvider).adapter 能力探测）；service.js:927-934（safeListModels）、:1337-1346（mainModelImageCapability→resolveModelInfo）、:1351-1352（runChat→stream）；host-route.js:218-232（probeHostRoute→listModels('openai-codex') + resolveModelInfo 期望 `context.contextWindow` 正整数） |
| 宿主锚点 | `<host>dsh-llm/lib/index.js:1780`（registerAdapter(providers, adapter)）、:1846（listProviders）、:2043-2044（resolveModelInfo→registration 链）、:2145-2147（llm 级 prepareCall → `registration.adapter.prepareCall(provider, model, signal)`）、:2177（registration）、:2223-2232（adapterStream：每次分发先 `adapter.prepareCall(options.provider, options.model, options.signal)`）、:1681（LlmAdapter 基类默认 prepareCall——twin 手工对象字面量缺此方法即 `prepareCall is not a function` 的 FIX-001 断裂位）、:1753-1769（llm/adapters-updated 发布） |
| 分级 | L1（服务面）/ L2（适配器对象契约——官方契约但每次 rc 都在演进：FIX-001 prepareCall、FIX-030 apiProxy） |
| 历史断裂 | **FIX-001**（twin 缺 prepareCall 全量断裂——宿主 adapterStream :2232 同型位在 0.1.5 仍在）；FIX-016（tools 映射形状）；FIX-030（apiProxy 消失） |
| 当前状态 | **✅ 服务面与适配器分发协议存在且一致**（prepareCall 分发位实读确认）；~~host-route probe 的 `context.contextWindow` 判据待验证~~ **T-9 已裁决（Coordinator 机核，R1 回注）：静态前提不成立——0.1.5 `resolveModelInfo` 仍返回 context.contextWindow（dsh-llm lib/index.js:2055-2067 实现链 + dsh-llm-pi-ai :803-804 目录解析 / :432 目录数据），probe 恒败的静态前提被证伪**；运行时行为（目录数据实装形态）留真机复验（T-9 收敛，见症状②候选 ②-1 修订） |

#### A-5 `agentDefaultModel` 服务
| 字段 | 内容 |
|---|---|
| 消费面 | `currentSelection()`（live 读 {provider, model, reasoningEffort?}）/ `saveSelection({provider, model, reasoningEffort?})`（写回） |
| 插件锚点 | wrapper.js:526-527/:540-566（takeover 同步）；preset-defaults.js:173-182（liveDefaultSelection）、:410-431（全局默认写回恢复）；prestep.js:209-218（判定链第三层）；service.js:775-784（defaults()） |
| 宿主锚点 | `<host>dsh-agent-default-model/lib/index.js:57`（currentSelection）、`:66`（async saveSelection(next)） |
| 分级 | L1 |
| 历史断裂 | FIX-026/027（显示跟随链——间接消费）；无本面直接断裂 |
| 当前状态 | **✅ 存在且形状一致** |

#### A-6 `agents` 注册表
| 字段 | 内容 |
|---|---|
| 消费面 | `ctx.get('agents')` 调用时解析 → `registry.get(sessionId)` 返回 agent（`.session` / `.options`）——**必须经 get**（FIX-023：cordis 属性面仅对 inject 声明名生效） |
| 插件锚点 | preset-defaults.js:192-198（agentsRegistryOf：typeof get === 'function' 守卫）、:498-499（subagentFixup 父查找）、:566（onPresetSelected 查 agent） |
| 宿主锚点 | `<host>dsh-agent/lib/index.js:299`（`super(ctx, "agents")` 服务注册）、:438/:473/:543（registry 生命周期 + agent/created 发布） |
| 分级 | L2 |
| 历史断裂 | **FIX-023**（ctx.agents 属性面恒 undefined → 播种静默失效；修复 = get 调用时解析 + 测试桩同形） |
| 当前状态 | **✅ 存在**（服务名/注册面实读核对；get 消费形态不受 0.1.5 影响） |

#### A-7 `subagents` 服务
| 字段 | 内容 |
|---|---|
| 消费面 | `subagents.start('spawn', {label, prompt(blocks), parent, signal, agentOptions:{provider,model}, toolFilter?, persona?})` → run `{result, dispose}` |
| 插件锚点 | service.js:1469-1470（可用性判定 start 为函数）、:1501-1514（start 调用 + result/dispose 消费） |
| 宿主锚点 | `<host>dsh-subagent/lib/index.js:3145-3173`（`async start(name, request)`——request 面 label/prompt/parent/signal + capabilities）；`<host>dsh-subagent-spawn-in-process/lib/index.js:13`（providerName 默认 **'spawn'**）、:42（registerProvider）、:17-28（capabilities：`agentOptions: true` / `toolFilter: true` / `persona: true`——三参数面显式声明支持） |
| 分级 | L1（agent 类型专业 agent 的核心通路） |
| 历史断裂 | FIX-030-B（继承基线判别——非 start 面本身）；FIX-032（subagent 留空语义） |
| 当前状态 | **✅ 存在且参数面一致**（'spawn' provider + agentOptions/toolFilter/persona capabilities 实读核对） |

#### A-8 `credentials` 服务
| 字段 | 内容 |
|---|---|
| 消费面 | `resolve(ref)`（→{value} | undefined）/ `set(ref, value)` / `unset(ref)` |
| 插件锚点 | service.js:1987-1996（image 类型 apiKey 解析）、:2874-2881（OAuth token 解析 + env 回落）、:4022-4028（OAuth 登录落凭据）；host-route.js:187-200（injectHostRouteToken：resolve diff + set）、:341-347/:399-409（PoC/正式 ref 清理 unset） |
| 宿主锚点 | `<host>dsh-credentials-local/lib/index.js:473`（resolve(ref)）、`:513`（set）、`:517`（unset）；`<host>dsh-credentials/lib/index.js:113-124`（`credentials/reference-updated` 扇出——**事件名已从 credentials/updated 改名**，见 D-2） |
| 分级 | L1 |
| 历史断裂 | 无（服务面稳定；ARCH-003 PoC 实证每请求活读语义） |
| 当前状态 | **✅ 服务面存在且形状一致**；⚠️ 关联事件名漂移（D-2） |

#### A-9 `attachments` 服务
| 字段 | 内容 |
|---|---|
| 消费面 | `saveImage({data, mediaType, name})`（→{attachmentId, mediaType, bytes, width?, height?, name}）/ `readImage(ref)`（→{data, ref}） |
| 插件锚点 | service.js:1130-1157（files 图片注入→saveImage + registry.registerEntry）、:1570-1599（materializeCliImages→readImage 遗留回退）、:2035-2038（生图产物→saveImage）、:2886-2888（readImagesAsDataUrls→readImage）、:3378（readStoredImage 链）、:2231（在场探测 `'unreadable'|'unavailable'`） |
| 宿主锚点 | `<host>dsh-attachment-local/lib/index.js:1020`（saveImage(input)）、`:1024-1025`（readImage(ref, signal)→readImageFile）、`:1013`（saveImages 批量）、`:284`（root = `DSH_HOME/attachments/v1` 布局注释——F-3 对应） |
| 分级 | L2（FIX-003/007 历史反复区：注册接口行为回归 + rejected 链） |
| 历史断裂 | **FIX-003**（附件注册接口行为回归）、**FIX-007**（rc.2 附件链 rejected「图片加载失败」+ 整链变慢——**本清单中唯一同时呈现「失败+卡顿」双症状的历史断裂**） |
| 当前状态 | **✅ 存在且方法面一致**（saveImage/readImage 签名实读核对） |

#### A-10 `fs` 服务
| 字段 | 内容 |
|---|---|
| 消费面 | `fs.readBytes(target, signal, maxBytes)`（三参：目标/中止信号/上限） |
| 插件锚点 | service.js:1026/:1089/:1109（files 寻址读取）、:1122（readBytes 3 参调用 + CHAT_FILE_READ_MAX_BYTES）、:2046/:2566（speech/upload 路径读取） |
| 宿主锚点 | `<host>dsh-fs-local/lib/index.js:794`（`async readBytes(target, signal, maxBytes)`——签名逐字一致）；同款消费先例 `<host>dsh-tool-fs/lib/index.js:1076`（`ctx.fs.readBytes(target, exec.signal, byteCap)`）、`<host>dsh-api-session-controller/lib/index.js:2342` |
| 分级 | L1 |
| 历史断裂 | 无 |
| 当前状态 | **✅ 存在且签名一致** |

#### A-11 `sessionController` 服务（FIX-030-A 新面）
| 字段 | 内容 |
|---|---|
| 消费面 | `selectModel({sessionId, provider, model, reasoningEffort?})`（直接参数，成功返 `{selected}` / 失败抛 RemoteError） |
| 插件锚点 | preset-defaults.js:209-240（sessionSelectFaceOf：sessionController 优先 + apiProxy 回落双形态单点）、:392（seed 播种调用） |
| 宿主锚点 | `<host>dsh-api-session-controller/lib/index.js:2726`（`super(ctx, "sessionController", { namespace: "session" })`——服务名+命名空间不变）、`:605`（`async selectModel(request)`） |
| 分级 | L2（0.1.2 新面，演进中） |
| 历史断裂 | **FIX-030-A**（旧 apiProxy 面消失 → 预检恒 fail 播种静默跳过） |
| 当前状态 | **✅ 存在且形状一致**；`apiProxy` 回落面在 0.1.5 全宿主**零注册**（服务名扫描 0 命中——符合预期，回落分支永不命中，无新风险） |

#### A-12 `sessionProjections` 服务（FIX-029-A 面）
| 字段 | 内容 |
|---|---|
| 消费面 | `stateOf(session, 'modelSelection')` → `{lastUsed, pending}`（pending = 未消费的下一次选择） |
| 插件锚点 | prestep.js:191-202（pendingModelSelection：stateOf + pending 提取，服务缺失/键未注册/抛错 → null 回落） |
| 宿主锚点 | `<host>dsh-api-session-controller/lib/index.js:280`（`this.ctx.sessionProjections.stateOf(agent.session, "modelSelection")` 同款消费）、`:2044-2046`（modelSelectionProjectionStateSchema：`{lastUsed, pending}` 双字段）、`:2075-2100`（modelSelection projection 注册） |
| 分级 | L2 |
| 历史断裂 | **FIX-029-A**（0.1.2 起 selectionFor picked 首层由 pending 初始化——插件判定链补同序层） |
| 当前状态 | **✅ 存在且形状一致**（{lastUsed, pending} schema 实读） |

#### A-13 `agentPresets` 服务（预设罗盘）
| 字段 | 内容 |
|---|---|
| 消费面 | `composedPreset(agentCtx)`（live 解析会话当前生效预设 → string | {id} | undefined）；属性面 `ctx.agentPresets` + `ctx.get('agentPresets')` 双形态防御 |
| 插件锚点 | preset-defaults.js:158-167（agentPresetsServiceOf 双形态 + composedPreset 函数守卫）、:270-279（livePresetOf）、:644-651（遥测 live 预设优先） |
| 宿主锚点 | `<host>dsh-agent-presets/lib/index.js:1550`（`composedPreset(agentCtx)`）；`:1322-1327`（切换提交后 `ctx.emit("agent-preset/selected", session.id, event.data.agentPreset)`——**双参 emit 形态不变**）；`:1749`（`agent.session.append("agent-preset/selected", ...)` durable 事件类型） |
| 分级 | L2 |
| 历史断裂 | FIX-022（RPC 域名复数/单数陷阱——客户端面）；FIX-025（sessionBlank 同构判据） |
| 当前状态 | **✅ 存在且形状一致**（composedPreset + 双参 emit 实读）；sessionBlank/turn-start 判据在 0.1.5 的形态**待验证**（长尾项 T-1） |

#### A-14 `tools` / `systemPrompt` / `router`（tool.js 硬依赖 + 自有服务）
| 字段 | 内容 |
|---|---|
| 消费面 | `ctx.tools.register(defineTool({...}))`（route_agent 工具）；`ctx.systemPrompt.section({name:'router:agents', order, text()})`（提示段）；`ctx.get('router')`（自有服务可选依赖——未挂载时工具行空转） |
| 插件锚点 | tool.js:30（`export const inject = ['tools', 'systemPrompt']`——**第二个宿主行声明的硬依赖**）、:61（ctx.tools.register(defineTool)）、:221-228（systemPrompt.section）、:54/:143/:225（ctx.get('router') 三处） |
| 宿主锚点 | `<host>dsh-tools/lib/index.js:837`（defineTool(options) 工厂）、`:2773`（ToolRuntime.register(definition)）；`<host>dsh-system-prompt/lib/index.js:238-240`（section({name, ...}) 注册面）、`:295-297`（variable——未消费） |
| 分级 | L1 |
| 历史断裂 | FIX-016（工具形状映射——wire 层非注册层） |
| 当前状态 | **✅ 存在且形状一致** |

### 2.2 B 类——RPC 域名面（客户端 api.* 调用点全集，均在 client.js）

| # | 调用点 | 插件锚点 | 宿主锚点（dsh-api-remotes/lib/client.js 描述子） | 状态 |
|---|--------|---------|------------------------------------------------|------|
| B-1 | `api.llm.providers({})` | client.js:1999（load 并行）→ hostApiFace :4926-4933（listProviders + listConfigurableProviders 连接） | `:5802`（llm/listProviders）、`:5784`（llm/listConfigurableProviders） | **✅（T-2 已裁决证伪，R1 回注）**：listConfigurableProviders 结果条目（provider/displayName/settingsNs/settingsPath/declared）0.1.5 **逐字段兼容**（Coordinator 机核 api-remotes client.js:5727-5734 schema）——症状①候选 ①-2 的形状漂移前提不成立 |
| B-2 | `api.llm.models({})` | client.js:2025-2028（groups/failures 消费）→ hostApiFace :4934-4941（session.modelCatalog） | `:8628`（session/modelCatalog） | **✅ 方法在；T-3 已裁决降级（R1 回注）**：modelCatalog groups schema 0.1.5 **存续**（Coordinator 机核 api-remotes client.js:8164-8193）——「groups 整体消失/改名」型断裂排除；剩余风险收窄为**插件渲染层访问 schema 外字段**（候选 ①-1 降级依据，遗留验证 = 渲染层字段访问清单 vs schema 逐项比对） |
| B-3 | `api.llm.discoverModels(p)` | client.js:1192（探测按钮）、:2609、:3969 → hostApiFace :4942-4954（settingsNs + {provider,baseURL,api,apiKey} 位置参数） | `:5746`（llm/discoverModels，参数 settingsNs + request 双参——**与适配层映射逐字一致**，:5749-5767 实读） | ✅ |
| B-4 | `api.settings.describe({})` | client.js:2001/:2329/:2524 → hostApiFace :4957-4968（writable/hasDocument/namespaces） | `:5057`（settings/describe） | ✅ |
| B-5 | `api.settings.mutate({ns,ops})` | client.js:2369/:2390/:2558/:2589（llm-pi-ai 与 router ns 写入）→ hostApiFace :4969-4975（位置参数 mutate(ns, ops)） | `:5075`（settings/mutate） | ✅ |
| B-6 | `api.credentials.describe({refs})` | client.js:2070/:2409/:3033 → hostApiFace :4978-4985 | `:4949`（credentials/describe） | ✅ |
| B-7 | `api.credentials.set({ref,value})` | client.js:2375/:2396/:2593/:5088 → hostApiFace :4986-4991 | `:4976`（credentials/set） | ✅ |
| B-8 | `api.credentials.unset({ref})` | client.js:2632/:2730 → hostApiFace :4992-4997 | `:5012`（credentials/unset） | ✅ |
| B-9 | `api.agentPresets.list({})` | client.js:2036-2044（复数优先 + 单数回落 + 双缺失结构化报错——FIX-022 防御）→ hostApiFace :4999-5007 | `:4343-4469`（agentPresets 命名空间 5 描述子，含 `:4423` method:"list"） | ✅ 复数命名空间仍在 |
| B-10 | `api.sessions.models({sessionId})` | client.js:4179/:4256/:4265（ModelTakeover 读当前选择）→ hostApiFace :5014-5034（**无 per-session wire RPC** → ctx.modelDirectories.directoryFor(sessionId).load() 等价读） | 宿主确无 per-session models wire（modelCatalog 为全局目录）；modelDirectories 服务见 C-4 | ✅（FIX-028 适配层构造面） |
| B-11 | `api.sessions.selectModel(p)` | client.js:4227/:4269（twin 接管/还原）→ hostApiFace :5035-5039（session.selectModel(payload) 直传） | `:8785`（session/selectModel，参数 codec SessionSelectModelRequest——**参数字段级形状待验证**，长尾 T-4） | ✅ 方法在 |
| B-12 | `remote.router.*`（自有 18 方法：catalog/stats/presetDiagnostics/statsExport/test/reset/config/save/oauthTokenExchange/oauthBegin/oauthDiscover/oauthLogout/cliStatus/cliLogin/cliModels/imageData/uploadFile/readWorkspaceFile） | rpc.js:37-207 描述子；client.js 消费点 1990-2000/2103-2310/2780/2859/2873/3000/3054/5081-5088；$mount :5069 | 挂载通道：`<host>dsh-api-gateway/lib/client.js:1461-1471`（$mount→mountContribution→installNamespace）；校验 `:1509-1535` validateContribution（重复方法/命名空间冲突）+ `:1823-1830` requireStrictDescriptor（**仅要求 codec.mode==='strict'**——插件 18 描述子全部 strict ✓） | ✅ 挂载协议兼容（strict 校验实读通过） |

### 2.3 C 类——客户端 inject 命名空间消费（client.js）

**fiber 级 inject 声明**（client.js:5060）：`['slots', 'locale', 'remote', 'remote.llm', 'remote.settings', 'remote.credentials', 'remote.agentPresets', 'remote.session', 'modelDirectories']`

| # | 消费面 | 插件锚点 | 宿主锚点 | 分级 | 状态 |
|---|--------|---------|---------|------|------|
| C-1 | `ctx.slots.inject('settings.section', ...)` + `ctx.slots.register({name, id, order, label:()=>t(), inject}, render)` | client.js:5094-5106（Agent 路由设置页注册，order 20） | 槽位声明：`<host>dsh-client-ui-settings-general/lib/client.js:621-624`（settings.section kind:list scope:root）+ `:651-661`（官方 general 条目同形注册）；官方消费先例 `<host>dsh-client-ui-settings-models/lib/client.js:2936-2952`（models 条目 {name,id,order,label,inject,children}） | L1 | **✅ 槽位与注册面同形存续** |
| C-2 | `ctx.slots.inject('conversation.input.right', ...)` ×3（router-attach order50 / router-session-gallery order30 / router-model-takeover order40）+ standardProps 消费 `props.input`（旧）/`props.useInput`/`props.inputActions`/`props.sessionId` | client.js:5196-5207（AttachButton）、:5210-5218（SessionGallery）、:5224-5234（ModelTakeover——FIX-029 useInput 透传）、:4154（`useInput((state)=>state)` 快照读取） | 槽位声明：`<host>dsh-client-ui-conversation/lib/client.js:16736-16739`（conversation.input.right kind:list scope:session）；standardProps 提供：`:16593-16608`（`ctx.uiSession.provide({hooks:["conversation","input"], props:["inputActions"], ...})`——input→useInput hook 形态与 FIX-029 适配一致）；渲染点 `:16183`（renderSlot("conversation.input.right", {})） | L1 | **✅ 槽位与 standardProps 面（useInput/inputActions/sessionId）同形存续** |
| C-3 | `ctx.slots.inject('tool.call.toolview', ...)` keyed（key:'route_agent'）+ `props.block` | client.js:5235-5243（RouteAgentToolCard） | 槽位声明与 keyed 语义：`<host>dsh-client-ui-tool/lib/client.js:1688`（官方 keyed 注册）、`:2372`（children 声明）；文档型先例 `<host>dsh-cordis-client-runner/lib/client.js:4497`（key: "tool.call.toolview"）+ `:4554`（注册示例含 key 字段） | L1 | **✅ keyed 槽位面存续** |
| C-4 | `ctx.get('modelDirectories')` / `ctx.modelDirectories` → `directoryFor(sessionId).load()`（{current, routable, groups, failures} 快照） | client.js:4920-4923（directoryFace）、:5160-5168（FIX-026/027 直驱刷新 + 双形态解析 + 遥测）、:5014-5034（sessions.models 等价读） | `<host>dsh-client-ui-model-selection/lib/client.js:258-272`（`static inject` 含 modelDirectories，`super(ctx, "modelDirectories")` 注册）、`:296`（`directoryFor(sessionId)`）；官方消费 `:915-947`（commandUi + slots 双入口经 directoryFor().load()）；README L46（每个常驻目录在 llm/adapters-updated 与 settings/document-updated owner 事件上重拉——**与插件 C-8 事件订阅假设一致**） | L2 | **✅ 服务存续**；~~directory.load() 结果字段级形状待验证~~ **T-3 已裁决（同 B-2）**：groups schema 存续（api-remotes :8164-8193 机核），剩余风险同 ①-1 降级注记 |
| C-5 | `ctx.locale.register(NS, {zh,en})` / `ctx.locale.bind(NS)` | client.js:5063/:5068 | `<host>dsh-client-locale@0.1.5-rc.2` 在包（版本清单实读）；官方消费先例 `<host>dsh-client-ui-workspace/lib/client.js:2731-2734`（locale.register(NS,{zh,en}) 同形） | L1 | **✅ 包存续 + 官方同形消费**（服务面本身未逐行实读——低风险，长尾 T-5） |
| C-6 | `ctx.remote.$mount(ROUTER_REMOTE)` / `ctx.remote.$on(event, listener)` / `ctx.get('remote.router')` / `ctx.get('remote.llm'\|...)` 命名空间组 | client.js:5069-5071（$mount + catch）、:5092（$on 构造）、:5081/:5109（get remote.router）、:4904-4907（faceOf：get 优先 + ctx.remote 属性兜底——FIX-027 双形态） | `<host>dsh-api-gateway/lib/client.js:1461-1471`（$mount 实装）、`:1472-1474`（$on→events.subscribe）、`:579-584`（subscribe→privateEvents().on——**无运行时白名单校验**，非白名单 key = 订阅永不触发的死键，不 throw）；命名空间服务 `:1564-1583`（createNamespace→RemoteNamespaceService） | L1 | **✅ 通道存续**；事件 key 白名单漂移见 D-2 |
| C-7 | `window.__ModuleLoader__.load({id, factory:(require)=>{...}})` + `require('react')`（bundle 形态） | client.js:21-29（loader 队列注册 + react require + createElement/hooks 解构） | boot 队列 facade：`<host>dsh-client-modules/lib/index.js:388-408`（window.__ModuleLoader__ queue→live 模式 + create()）；模块解析序：`<host>dsh-client-modules/lib/client.js:300-310`（makeRequire：seed → memoized → registered factory → 否则 throw）；平台 seed 表：web 内核 bundle（`<host>dsh-web-frontend/dist/assets/index-BKQ_L1z6.js` offset 553121）`by()` = **react / react/jsx-runtime / react-dom / react-dom/client / @deepseek-ai/cordis / dsh-client-store / dsh-client-ui-slots / dsh-client-ui-primitives / dsh-client-ui-dockkit**——**react 在列** | L2（加载体系 0.1.5 整体换代 dsh-client-runtime→dsh-client-modules） | **✅ 插件 bundle 形态兼容**（queue 注册 + require('react') 命中 seed，换代不破坏本面） |
| C-8 | **package.json `dsh.client.inject` 四声明**（`@deepseek-ai/dsh-client-runtime` / `dsh-client-ui-settings` / `dsh-client-locale` / `dsh-api-remotes`） | package.json:22-27 | 语义：`<host>dsh-package-manifest/lib/types/types.d.ts:42-43`（"Informational package-name dependencies, **not Cordis service injection**"）+ `<host>dsh-client-ui-workspace/lib/client.js:2704-2709`（官方自证 "dsh.client.inject edges are informational (loading/prefetch metadata, never apply sequencing)"）；物化行为：`<host>dsh-client-modules/lib/client.js:252-270`（arriveGraphRow——`for (packageName of row.inject) { const dependency = graphRows.get(packageName); if (dependency !== void 0) await ... }`——**缺失行被 if 静默跳过，不 throw**）；图排序只用 external：`<host>dsh-client-modules/lib/index.js:349-371`（orderByModuleGraph 只遍历 entry.external） | L2 | **⚠️ dsh-client-runtime 已不存在但无害（已定性，非待验证）**：四声明之一指向已消亡包——升级后宿主对其的物化 = 静默跳过（if 守卫实读），**不构成加载失败**；其余三包存续。列为 D3 看护候选（声明漂移应被静态校验捕获） |

### 2.4 D 类——宿主事件（服务端 ctx.on + 客户端 $on）

| # | 事件 | 插件锚点 | 宿主锚点 | 分级 | 状态 |
|---|------|---------|---------|------|------|
| D-1 | `settings/updated`（服务端） | index.js:244-248（stats 生命周期）；wrapper.js:618-620（twin 热同步）；oauth-llm.js:512-514（provider 热同步）；service.js:2849-2853（host-route 维护触发：router/llm-pi-ai/undefined 三路 → user/llm/boot 触发源） | `<host>dsh-settings/lib/index.js:566`（提交后发）、`:593`（listener 失败 warn 容错） | L1 | **✅ 存续** |
| D-2 | `credentials/updated`（客户端 $on） | client.js:2093（`$on('credentials/updated', () => loadRef.current())`——账号卡登录态刷新） | **🔴 升级后宿主转发白名单已改名**：`<host>dsh-api-remotes/lib/types/remote-events.js:21` = `credentials/reference-updated`（`credentials/updated` 不在 19 项白名单中）；订阅不 throw（C-6 已证 subscribe 无校验）→ **死订阅**：事件永不触发，账号卡不随凭据变化刷新 | L2 | **🔴 断裂（静默失效型）**——插件消费旧名，宿主只发/只转新名。**已核验：非崩溃源**（降级为功能退化 + D3 看护项）。**Requirement Reviewer R0 独立复证成立（REVIEW-ARCH-004-R1 机录；remote-events.js 全表 19 项白名单逐项核对无旧名）** |
| D-3 | `settings/document-updated`（客户端 $on） | client.js:2090（页面重载）、:5121（composer catalog 轮询刷新） | `<host>dsh-api-remotes/lib/types/remote-events.js:30`（白名单在列） | L2 | **✅ 存续** |
| D-4 | `llm/adapters-updated`（客户端 $on / 服务端 ctx.on） | client.js:2094（页面重载）；wrapper.js:613（twin 同步）；oauth-llm.js:511（provider 同步） | 客户端转发：remote-events.js:29（白名单在列）；服务端发布：`<host>dsh-llm/lib/index.js:1753` | L1/L2 | **✅ 存续** |
| D-5 | `agent-preset/selected`（客户端 $on / 服务端 ctx.on，双参 (sessionId, agentPreset)） | client.js:5182（FIX-026 显示直驱）；preset-defaults.js:598（播种） | 客户端转发：remote-events.js:13（白名单首项）；服务端发布：`<host>dsh-agent-presets/lib/index.js:1327`（`ctx.emit("agent-preset/selected", session.id, event.data.agentPreset)` 双参形态不变） | L1/L2 | **✅ 存续（双参形态一致）** |
| D-6 | `agent/created`（服务端） | preset-defaults.js:597（announce 语义——同步抛错 veto 发布，handler 全程 try/catch） | `<host>dsh-agent/lib/index.js:543`（emit "agent/created"）、`:547-551`（listener rejected→warn 包容——**0.1.5 对 async 拒绝的包容语义与插件 fail-safe 假设一致**） | L2 | **✅ 存续** |
| D-7 | `agent/pre-step`（服务端 waterfall） | prestep.js:238-301（handler 签名 ({agent, messages, turn, step, signal}, next) → decision {kind, messages}） | `<host>dsh-agent-loop/lib/index.js:894-`（`dispatch.waterfall("agent/pre-step", {agent, messages, signal, step}, next)`——payload 字段含 agent+messages+step；agent 注入：`<host>dsh-agent/lib/index.js:209-213` agentEvents fused `({...payload, agent})`） | L2 | **✅ 存续**（payload 融合机制实读） |
| D-8 | `agent/request`（服务端 waterfall，只读遥测） | preset-defaults.js:623-667（handler (payload, next)→config；读 payload.agent.session.header） | `<host>dsh-agent-loop/lib/index.js:1143-1147`（`waterfall("agent/request", {turn, step, signal}, ...)` + agentEvents fused agent 注入——**payload.agent 仍由 dispatcher 统一注入**）；config 判定 :1149 | L2 | **✅ 存续**（agent 字段注入机制不变） |

### 2.5 E 类——dsh-* npm 包 import 面（9 peerDeps + 5 外部 deps）

| # | 包 | import 用了什么 | 插件锚点 | 宿主锚点（0.1.5-rc.2） | 分级 | 状态 |
|---|---|---------|---------|----------------------|------|------|
| E-1 | `@deepseek-ai/dsh-typert-protocol`（dep ^0.1.0-rc.6） | `TypertRemoteService`（服务基类） | service.js:26 | `<host>dsh-typert-protocol/lib/index.js:75`（class 定义）、`:184`（导出在列）；exports "." ✓ | L1 | ✅ |
| E-2 | `@deepseek-ai/dsh-llm`（dep ^0.1.0-rc.6） | `BlockAssembler` | service.js:27 | `<host>dsh-llm/lib/index.js:899`（class）、`:2326`（导出在列） | L1 | ✅ |
| E-3 | `@deepseek-ai/dsh-llm/message`（子路径） | `createUserMessage` / `createAssistantMessage` | prestep.js:33；service.js:28 | exports["./message"] 声明在（package.json exports 实读）；实现 `<host>dsh-llm/lib/types/message.js:45/:56`；主入口亦导出（lib/index.js:2326） | L1 | ✅ |
| E-4 | `@deepseek-ai/dsh-tools`（dep ^0.1.0-rc.6） | `defineTool` | tool.js:24 | `<host>dsh-tools/lib/index.js:837`（定义）、`:3588`（导出在列） | L1 | ✅ |
| E-5 | `@deepseek-ai/schemastery`（dep ^3.18.1） | `z`（默认导出，全部 wire schema） | schemas.js:23 | `<host>schemastery` 3.18.2（版本实读；exports 双形态 cjs/mjs，默认导出面在） | L1 | ✅ |
| E-6 | `undici`（dep ^7.18.0） | **动态 `import('undici')`** 取 `ProxyAgent`（OAuth 代理 dispatcher）+ 版本 major 自检（与 Node 内置 fetch undici 同 major，fail-loud 报错文案） | service.js:4202-4235（loader + major 比对 + 缓存）、:3167/:3329（init.dispatcher 注入） | Node 运行时内置面（非 dsh 包）；版本对齐守卫自含 | L3（undici dispatcher 接口跨 major 不兼容——FIX-006 实证域） | ✅ 机制自守卫（加载失败 = 明确报错非静默）；0.1.5 环境下 Node 内置 undici major **待验证**（长尾 T-6，非本次升级引入——属 Node 环境依赖） |
| E-7 | `@deepseek-ai/cordis`（dep ^4.0.1） | 无直接 import——plugin face（name/inject/apply/ctx.effect/ctx.on）经宿主运行时消费 | index.js/tool.js 导出面（无 import 语句） | `<host>cordis` 4.0.2（semver 兼容 ^4.0.1） | L1 | ✅ |
| E-8 | 9 peerDeps（attachment/agent/agent-default-model/session/settings/subagent/system-prompt/credentials ^0.1.0-rc.8） | **除经 ctx.get 服务面（A 类）外零直接 import**；`dsh-system-prompt` 经 tool.js inject + section 面（A-14）；`dsh-session` 无直接消费点（服务经 header/requestHeader 形态承载于 F 类）——peerDeps 语义 = 版本对齐声明 + 宿主供给面 | package.json:60-69 | 全部对应包 = 0.1.5-rc.2（版本清单实读）；`^0.1.0-rc.8` semver 满足 → **零安装报警**（静默漂移通道，RISK-003） | L2 | ✅ 供给在；⚠️ 版本漂移无预警（见风险 R-候选 5） |

### 2.6 F 类——宿主内部约定

| # | 约定 | 插件锚点 | 宿主锚点 | 分级 | 状态 |
|---|------|---------|---------|------|------|
| F-1 | DSH 数据根：`DSH_HOME` env → `~/.dsh` 回退；统计/凭据/附件子目录推导 | stats.js:313-321（`$DSH_HOME/dsh-agent-router/stats`）；oauth-credentials.js:176-183（`~/.dsh/dsh-agent-router/chatgpt-codex-auth.json`）；attachments.js:509-512（注释锚定宿主 resolveDshHome 对齐） | `<host>dsh-home-paths/lib/index.js:73`（resolveDshHome：explicit > `$DSH_HOME` > `~/.dsh`，:74-82 实读；:15 DSH_HOME_ENV 常量） | L2（无 API 契约，路径事实——EV-028 实证域） | **✅ 一致** |
| F-2 | 宿主附件库布局 `DSH_HOME/attachments/v1`（附件 id 内容寻址 `sha256:64hex`） | attachments.js:38（ATTACHMENT_ID_RE）、:509-512 | `<host>dsh-attachment-local/lib/index.js:284`（root 注释 "absolute `DSH_HOME/attachments/v1` root"——布局不变） | L3 | **✅ 一致** |
| F-3 | 会话 header 形态：`header.agentPreset`（创建期冻结快照）/ `header.origin==='subagent'` / `header.parentSession` / `header.delegationDepth` / `header.cwd` | preset-defaults.js:533-534/:566-571/:498-499；service.js:1474-1483（delegationDepth/cwd）；prestep.js 消费同链 | `<host>dsh-subagent/lib/index.js:502-513`（childSessionMeta：cwd/agentPreset[**live 罗盘**]/parentSession/isSeeded/origin:'subagent'/delegationDepth——字段全在且语义不变） | L3 | **✅ 一致** |
| F-4 | `agent.session.requestHeader()?.config` = {provider, model, reasoningEffort?}（父最近请求头路由） | prestep.js:160-162/:175-177（判定链第二层）；preset-defaults.js:249-263（inheritedRouteOf 继承基线） | `<host>dsh-subagent/lib/index.js:446-456`（parentAgentOptionsForDelegation：`parent.session.requestHeader()?.config` 优先 + options 回落——**FIX-030-B 同构基线在 0.1.5 语义不变**）；`<host>dsh-agent-loop/lib/index.js:1129-1136`（persistedHeader.config 同形态） | L3 | **✅ 一致** |
| F-5 | `agent.options` plain object 可突变（改 options 即改子代理/空白会话首请求路由） | preset-defaults.js:460-465/:511-518（options 回滚/突变）；prestep.js:165-166（终回退） | `<host>dsh-agent-loop/lib/index.js:757`（`this.options = options`——构造器赋值不冻结）、:1131-1134（prepareRequest 路由 = `this.options.provider/model` 现读）、:1149（无 provider/model 时 agent/request waterfall 可补——插件遥测 next() 链与此兼容） | L3 | **✅ 一致**（FIX-030 取证的 buildRequest 现读 this.options 行为在 0.1.5 仍在 :1131-1134） |
| F-6 | LLM 流 chunk 词汇（block-start/text-delta/block-end/tool-call-delta/usage/finish——BlockAssembler 契约） | oauth-llm.js:405-419（适配器 stream 发射序列）；service.js（BlockAssembler 消费） | `<host>dsh-llm/lib/index.js:899-`（BlockAssembler.push 词汇表实读） | L1 | **✅ 一致** |
| F-7 | `turn/start` 会话事件 = 「已产出会话」判据（sessionBlank 同构） | preset-defaults.js:84-90（FIX-025 判据注释 + events 不可读回落 requestHeader 反演） | `<host>dsh-agent-presets`（swap 锁/turnBoundary 投影——0.1.5 形态**未逐行实读**） | L3 | **⚠️ 待验证**（长尾 T-1：若 0.1.5 引入「开 turn」新事件类型，空白判据可能漂移——影响面 = 播种/漏播，非崩溃） |
| F-8 | 浏览器设计令牌 `--dsw-alias-*`（CSS 变量主题面） | client.js:387-478（全部 dshrouter-* 样式引用 --dsw-alias-label-*/border-*/bg-*/state-*/button-*/interactive-*） | `<host>dsh-client-ui-theme@0.1.5-rc.2` 在包；令牌 overrideTokens 契约见 runner `:283-309`（overrideTokens(source, tokens) 双参 + `--dsw-alias-…` 命名） | L2 | **✅ 令牌命名空间不变**（逐令牌级验证未做——样式降级风险低，长尾 T-7） |
| F-9 | `window.__ModuleLoader__` + seed 表 react（客户端 bundle 物化环境） | client.js:21-29 | 见 C-7（seed 表含 react 实读） | L2 | **✅ 兼容** |
| F-10 | 工具 exec 形态：`exec.agent`（调用方 agent）/ `exec.signal`（ToolExecutionInput） | tool.js:142-182（execute(args, exec)）；service.js:949-951（rememberWorkspace 消费 exec.agent.session） | `<host>dsh-agent-loop/lib/index.js:503`（"that becomes each explicit ToolExecutionInput.agent"——exec.agent 注入语义实读注释位） | L2 | **✅ 存续** |

### 2.7 G 类——bundle 宿主行与 dsh.bundle.patch

| # | 面 | 插件锚点 | 宿主锚点 | 分级 | 状态 |
|---|---|---------|---------|------|------|
| G-1 | `cordis.patch.yml` 两条 insert 宿主行（`- id: router; name: dsh-agent-router` + `- id: tool-router; name: dsh-agent-router/tool`） | cordis.patch.yml:7-11 | 机制存续：`<host>dsh-app-boot/lib/index.js:286-314`（profile 组合：bundles = 声明 `"dsh": {"bundle": {"patch": ...}}` 的 npm 包，按 dsh.profile.bundles 序套用 patch 层 + profile 自有 cordis.patch.yml 后套）；insert 条目语义保留（Coordinator 侦察 + README L50/L55；**本任务实读 :286-314 组合段核实**） | L1 | **✅ 机制存续**——服务端半（宿主行 router/tool-router）加载路径完好 |
| G-2 | `package.json dsh.bundle.patch → ./cordis.patch.yml` 声明 | package.json:16-19 | 同上（声明读取位） | L1 | **✅** |
| G-3 | `dsh.client` 声明（platform:'web' + inject 四命名空间） | package.json:20-28 | `<host>dsh-client-modules/lib/index.js:139-154`（parseDshClient——platform 必须为 string 'web'、inject 为 optionalStringArray，**非法字段才 throw，包缺失不 throw**）、:637-667（resolveMeta 声明面索引） | L2 | **✅ 声明合法**（dsh-client-runtime 缺失项见 C-8 判定：informational + skip） |

---

## 症状① 归因域：部分 plugin 设置页崩溃

**先例形态参照（FIX-028）**：inject 面消费 undefined 即整页崩溃（`Cannot read properties of undefined (reading 'llm')`）——崩溃源 = 页面渲染/装配期同步 throw，非 async loader 内 throw（后者被 catch 收敛为页面内错误横幅，client.js:2003-2006/:2048-2050 双 catch 实证）。本清单 C/B 类逐面核对后，**纯「服务/方法名消失」型候选全部被证伪**（见反面证据节）——存留候选集中在**数据形状漂移**与**渲染期同步路径**。

### 候选 ①-1【中低置信度（R1 修订：自中高降级——T-3 裁决）】modelCatalog / directory 快照的 groups 形状漂移 → 目录渲染期崩溃
- **机制**：FIX-028 同型的「面在、形状漂移」变体。`api.llm.models` 的值 = `session.modelCatalog()` 结果（hostApiFace :4934-4941 仅做 `groups ?? []` / `failures ?? []` 包装），随后进入 React state（client.js:2025-2027）被目录渲染/预设合并（mergePresetModels）同步消费。若 groups **条目**形状变化，包装层不挡（`?? []` 只挡数组缺失），**渲染期 `.map`/字段访问 throw → 该 section 崩溃**；且 ModelTakeover `currentModelAcceptsImage` 同链消费目录快照（:4216），会话页与设置页双面受影响。
- **R1 裁决修订（T-3）**：Coordinator 机核 api-remotes client.js:8164-8193——**modelCatalog groups schema 0.1.5 存续**，「groups 整体消失/改名」型断裂排除。候选前提收窄为：**插件渲染层访问 schema 声明之外的字段**（渲染层字段访问全集 vs schema 逐项比对未做——遗留小项，接 T-3 收尾）。置信度由中高降为**中低**。
- **双侧证据**：插件消费 = client.js:2025-2027 + 目录渲染/mergePresetModels 函数群 + :4216；宿主 = api-remotes :8628（方法）+ :8164-8193（groups schema 机核存续）。
- **置信度**：中低（R1 后症状①域内仍开放的最高位候选，但前提已大幅收窄）。

### 候选 ①-2【已证伪（R1 修订：T-2 裁决）】listConfigurableProviders 结果条目漂移 → provider 下拉/账号区渲染期崩溃
- **机制（原假设）**：`joinProviderDirectoryHost`（client.js:4856-4878）对 directory 条目同步解构 `{provider, displayName, settingsNs, settingsPath, declared}`，字段演进即渲染 throw。
- **R1 裁决（T-2）**：Coordinator 机核 api-remotes client.js:5727-5734——listConfigurableProviders 结果条目 **0.1.5 逐字段兼容**（provider/displayName/settingsNs/settingsPath/declared 全在）。形状漂移前提不成立，**本候选证伪**，移入已证伪项。

### 候选 ①-3【中低置信度，结构性疑点】settings.section 渲染无 per-section 错误边界 → 任一插件 section 崩溃放大为「多插件页面崩溃」
- **机制**：症状描述为「**部分 plugin 设置页**崩溃」（复数）——若崩溃源在单一插件页，措辞应指向单页。多插件页同时崩的结构性解释 = 共享宿主面（modelCatalog/providers 目录正是全部模型类设置页的共享数据源——官方 ui-settings-models 与插件页消费同一 catalog），叠加 settings root 对 section 渲染的容错形态。
- **双侧证据**：渲染入口 `<host>dsh-client-ui-settings-general/lib/client.js:167`（`renderSlot("settings.section", {close}, {only: active})`）——**per-slot error boundary 是否存在未核**（长尾 T-8）；共享数据源同候选 ①-1。
- **置信度**：中低（解释症状措辞的最优结构假设，独立证据不足，待真机/源码补证）。

### 已证伪/降级项（防确认偏差，见反面证据节）
- `credentials/updated` 改名（D-2）→ **静默失效非崩溃**（subscribe 无运行时校验，实读 api-gateway :579-584）。
- `dsh-client-runtime` 缺失（C-8）→ **informational + skip-if-missing，不 throw**（实读 client-modules :265-268 + workspace :2704-2709）。
- fiber inject 九服务全部存续（C-1~C-6）→ 「服务未挂载 → 页面永不激活」型排除。
- `remote.$mount` strict 校验（B-12）→ 18 描述子全 strict，实读通过。
- **候选 ①-2（R1 证伪）**：listConfigurableProviders 条目 0.1.5 逐字段兼容（T-2 机核 api-remotes :5727-5734）——形状漂移前提不成立。

---

## 症状② 归因域：DSH 整体异常卡顿

> **R1 修订——优先序重排（Coordinator 三项机核裁决后）**：T-9 裁决使 ②-1 的静态前提不成立（降级至第 ④ 位）；**当前优先序 = ②-2（catalog 轮询成本）≥ ②-3（错误重抛×宿主重试）> ②-4（effect 链）> ②-1（host-route tick 循环，运行时留真机）**。下文保持原条目结构（REVIEW-ARCH-004-R1 已引用），仅更新置信度与裁决链注记。

### 候选 ②-1【中低置信度（R1 修订：自高降级——T-9 裁决）】host-route 维护循环：parity 探活恒败 → 每 30s「写-探-回滚」双落盘 + 双事件广播
- **机制**：`startHostRouteMaintenance`（service.js:2848-2862）= boot 首跑 + settings/updated 触发 + **30s tick（不受 F-1 gate 限制）**。维持路径每 pass：token 注入（credentials.resolve/set，host-route.js:187-200）→ 条目写入 `settings.mutate('llm-pi-ai', set providers.openai-codex)`（:318）→ **probeHostRoute 探活**（:218-232：`llm.listModels('openai-codex')` 非空 + `resolveModelInfo` 返回 `context.contextWindow` 正整数——**0.1.2 pi-ai 目录形状的锚定判据**）→ 失败则**回滚 mutate**（:353-357）→ 各 1 次 `settings/updated` 广播（dsh-settings :566——每次 diff 提交都发）。若 0.1.5 的 resolveModelInfo 返回形状变化（contextWindow 移位/改名/为可选），probe **恒败** → 无限循环：每 30s 两次 settings 落盘写（dsh-settings-file 持久化）+ 两次全局 settings/updated + recordHostRouteFailure 事件 + hostRouteQueue 串行任务。F-1 gate（:270 `gateWrites = trigger==='llm' && failures>0`）只拦 llm-pi-ai 事件触发的 pass，**tick 永不 gate**（FIX-030 后设计如此——自愈通道）。FIX-030 先例同型：宿主面形状变化 → 预检恒 fail（彼时是静默跳过；本机制则是**有副作用的反复写回滚**）。
- **双侧证据**：插件 = host-route.js:244-413 全维持链 + :218-232 probe 判据 + service.js:2854-2856 tick；宿主 = `<host>dsh-llm/lib/index.js:2043`（resolveModelInfo 在）。
- **R1 裁决链（T-9，降级依据）**：① Coordinator 机核 dsh-llm lib/index.js:2055-2067 + dsh-llm-pi-ai :803-804/:432——**0.1.5 `resolveModelInfo` 实现链仍返回 `context.contextWindow`（pi-ai 目录数据同构），probe 恒败的静态前提不成立**；② 循环机制本身仍在（tick 不受 F-1 gate + 写-探-回滚副作用路径未变），但触发条件从「静态形状漂移（高概率）」收窄为「运行时目录数据异常（未证）」——运行时行为留真机复验（T-9 收敛）。置信度由高降为**中低**。
- **置信度**：中低（机制真实、静态触发前提被证伪；升回条件 = 真机观测到 openai-codex 条目周期性出现/消失或 tick 期 settings 落盘写放大）。

### 候选 ②-2【中高置信度（R1 修订：自中上调——症状②当前首要候选）】客户端 catalog 30s 常驻轮询 × catalog RPC 服务端成本
- **机制**：client.js:5112-5126——`refreshCatalog` 的 `setInterval(30000)` 在 apply() **无条件创建**（设置页未打开也在跑，仅随插件 fiber 卸载清除）。每轮 `remote.router.catalog` → 服务端 `service.catalog()`（service.js:3509-3564）：每个 enabled agent `resolveAgent`（未配模型的 agent 走 `safeListModels(provider)` → `llm.listModels`，:915/:926-934）+ `mainModelImageCapability`（→ `llm.resolveModelInfo`，:1333-1347）+ **每个 oauth 账号 `presetLoggedInOf`（凭据文件读，:3563-3564 注释实证）**。0.1.2 上此轮询存在且无卡顿 → 0.1.5 侧差异（listModels/resolveModelInfo 实现成本、缓存行为、或某 provider 目录解析变慢/变网络化）才会引爆；若叠加候选 ②-1（probe 失败 = resolveModelInfo 异常路径），每 30s 服务端两轮全量目录遍历。
- **双侧证据**：插件 = client.js:5122 + service.js:3509-3564；宿主 = dsh-llm :2019（listModels→`registration(provider).adapter.listModels(provider)`——**每 provider 适配器调用，无宿主级缓存证据**）+ pi-ai 适配器成本**待验证**（长尾 T-10）。
- **置信度**：中（机制与常驻事实成立；宿主侧成本增量未证）。

### 候选 ②-3【中高置信度（R1 修订：自中上调——可同时解释两症状）】LLM 请求级错误重试/重抛循环
- **机制**：三个插件注入点让请求经过插件路由：twin wrapper（wrapper.js:377-457 stream——错误 `report(false)` 后**原样上抛** :453-455）、oauth-llm 适配器（oauth-llm.js:335-435——throw 转宿主 finish(error)）、host-route 维护的 openai-codex 官方路由（若 token 注入与宿主刷新锁竞态或目录解析失败 → 官方路由请求失败）。宿主侧重试策略 `<host>dsh-llm`（resolveRetryPolicy/:1985）+ `<host>dsh-llm-retry` 包。FIX-009 先例实证：4xx 重试链 227s/0token——**错误重试风暴既拖慢整体（卡顿）又会在 UI 层制造失败弹层/页面错误（症状①的次生形态）**。若 0.1.5 重试策略参数变化（次数/退避）或凭据链失效（如 openai-codex 目录路由请求失败率上升），插件注册的路由全部请求进入重试循环。
- **双侧证据**：插件 = wrapper.js:425/:451-455（llm.stream 委托 + 原样上抛）+ oauth-llm.js:384-433；宿主 = dsh-llm :2223-2307（adapterStream + waterfall llm/stream）+ dsh-llm-retry 包在场——0.1.5 策略参数**待验证**（长尾 T-11）。
- **置信度**：中。

### 候选 ②-4【低置信度】ModelTakeover effect 链重跑
- **机制**：effect deps 含 `capabilitySig`（client.js:4160/:4288）——capabilitySig 来自 catalog 轮询快照（mainModelImage），每 30s 变化即重跑 effect → `sessions.models`（directoryFor.load() RPC）+ armed 未就位时 selectModel 尝试；若 0.1.5 selectModel 对 wrapped 会话反复拒绝（形状漂移），形成「每 30s 一次 switch 尝试 + 失败 trace」。有 catch + trace（:4231-4234），不崩溃但产生周期性 RPC 噪声。
- **置信度**：低（周期固定 30s、单会话单请求，量级不足「整体卡顿」；列为 D4 可调测性输入）。

---

## 反面证据（直觉危险但对照后发现稳定的依赖）

> 防确认偏差专项：以下面在升级前历史中反复断裂或直觉上最可疑，但 0.1.5 实读核对**完好**。

1. **客户端加载体系换代不破坏本插件 bundle**（C-7）：dsh-client-runtime→dsh-client-modules 整体换代，但 `window.__ModuleLoader__` queue facade（:388-408）、factory(require) 形态、`require('react')` seed 命中（web 内核 by() 实读）全部兼容——**换代是兼容承载而非断裂**。
2. **dsh.client.inject 指向已消亡包不炸**（C-8）：informational 语义 + skip-if-missing 守卫（:265-268）双实读——「缺包 = 崩溃」直觉被证伪。
3. **FIX-001 断裂位（adapterStream prepareCall 分发）协议不变**（A-4）：dsh-llm :2232 仍先调 `adapter.prepareCall(provider, model, signal)`，基类默认实现在 :1681——twin/oauth 适配器的 prepareCall 显式实现（wrapper.js:371/oauth-llm.js:329）继续匹配。
4. **settings.section / conversation.input.right / tool.call.toolview 三槽位注册面同形**（C-1~C-3）：官方插件 0.1.5 同形注册实读（ui-settings-models:2936 / ui-conversation:16593-16608+16736 / ui-tool:1688）。
5. **subagents.start('spawn') 全参数面**（A-7）：provider 名、agentOptions/toolFilter/persona capabilities 显式声明在（spawn-in-process:13-28）。
6. **fs.readBytes 三参签名**（A-10）：dsh-fs-local:794 与插件调用逐字一致，且有宿主自有工具同款消费先例。
7. **FIX-029/030 适配链全部锚点仍成立**：sessionProjections {lastUsed, pending}（:2044-2046）、sessionController.selectModel（:605/:2726）、parentAgentOptionsForDelegation header 优先（dsh-subagent:446-456）、agentEvents payload agent 注入（dsh-agent:209-213）、buildRequest 现读 this.options（agent-loop:1131-1134）——**上一次大适配（0.1.2）建立的全部防御在 0.1.5 未回退**。
8. **DSH_HOME/~/.dsh 与 attachments/v1 布局**（F-1/F-2）：resolveDshHome 优先序与附件根布局不变——统计/凭据/附件三条持久化路径安全。
9. **remote.router $mount strict 校验兼容**（B-12）：requireStrictDescriptor 仅查 codec.mode——18 描述子通过。
10. **客户端 $on 通道对未知事件不 throw**（C-6）：subscribe 无白名单校验——即使订阅键漂移也只是死键，不构成崩溃源。

---

## Step 3: 用户影响分析（Q1~Q4）

- **Q1 用户如何获得本次分析的利益？**: 间接获得——本清单是 ARCH-004 四维兼容性设计与后续修复批次的事实底座；修复落地后用户获得「DSH 升级不再破坏路由插件」的稳定性（不再需要卸载插件止损）。
- **Q2 用户如何感知差异？**: 分析阶段零感知（纯文档产出）。后续按本清单归因域修复后，可感知差异 = 症状①（设置页崩溃消失——R1 后开放候选 = ①-1/①-3）与症状②（卡顿消失——R1 后优先序 = ②-2 catalog 轮询 ≥ ②-3 错误重抛×宿主重试）对应的验证性修复。
- **Q3 用户体验变化与迁移**: 无直接迁移。修复批次可能带来的行为变化（如 credentials/updated→reference-updated 订阅迁移恢复账号卡自动刷新、host-route probe 判据的运行时观测面补强）将在各自任务验收单列明。
- **Q4 迁移指南**: 不适用（分析任务）。对实施批次的指引（R1 修订）：T-2/T-3/T-9 三项静态比对**已由 Coordinator 机核裁决闭合**（见 T 表）；症状①遗留 = 渲染层字段访问清单 vs modelCatalog schema 比对（T-3 收尾）；症状②优先 = T-10（catalog 轮询成本，隔离环境计时探针）+ T-11（retry 策略实读）+ T-9 运行时面（真机）。

## Step 3.5: 目标一致性分析

plan-tracker 项目目标（`## 项目配置`）：「专业的事交给专业的 agent：为 DSH 主 agent 挂载可自定义的专业 agent 目录……按能力标签自动路由，扩展主 agent 的多模态与多模型能力边界」。本分析直接服务该目标的**可持续性**：插件价值全部经由宿主面交付（本清单 126 个模块级接触点实证——lib 15 模块中 14 个有宿主接触面），宿主每跨三个 rc 小版本即产生断裂风险（历史断裂链 FIX-001→FIX-032 十二条 + 本次两症状），不做依赖面治理则目标的交付连续性不可保证。清单同时揭示：多模态路由的核心价值面（附件链 A-9、子代理 A-7、LLM 适配器 A-4、预设链 A-13/D-5~D-8）恰为历史断裂高发区——四维设计（D1~D4）以此聚焦，正是「扩展能力边界」与「宿主演进防御」（项目质量原则 9）的交汇点。

## Step 3.6: 事实依据分析

- **已验证（双侧实读锚点）**: 本清单全部 ✅/🔴 条目——每条附插件 文件:行号 + 宿主 包:文件:行号，宿主侧全部来自升级后 checkout 本次实读（无历史记录/记忆填空）。
- **🔴 断裂实证（1 项）**: D-2 `credentials/updated` → `credentials/reference-updated` 改名（remote-events.js:21 白名单实读 + api-gateway :579-584 subscribe 无校验实读 → 判定静默失效非崩溃）。
- **待验证（显式标注）**: 见文末「待验证清单」T 表（**权威待办来源**）——R1 修订后：T-2/T-3/T-9 三项已由 Coordinator 机核裁决闭合（证伪/降级/静态前提不成立），开放待办 = T-1/T-4/T-5/T-6/T-7/T-8 静态项 + T-10/T-11 探针项 + T-9 运行时余项；全部为「双侧锚点已定、形状/字段级未比对」项，禁止在设计阶段当作事实引用。
- **裁决与事实的边界**: Coordinator 机核裁决（T-2/T-3/T-9，锚点已回注条目）按事实引用；症状候选置信度为推断（R1 已按裁决重排），最终归因仍需真机信息收口。
- **线索与事实的边界**: 历史断裂链（FIX-001~032）仅用于候选机制排序（先例形态参照），未作为本次断裂证据；plan-tracker 在案事实（peerDeps 静默满足、dsh-client-runtime 缺失）经本任务独立复核后才入清单（C-8/E-8）。

## Step 4: 架构影响分析（清单揭示的耦合热点）

1. **client.js 单点过宽（38 接触点，占 126 个模块级接触点的 30.2%）**: 一个 359KB 模块同时承载 C/B/D 三类客户端面 + 全部渲染。FIX-028 适配层（hostApiFace）已把 wire 面收敛到单点（好设计），但**形状假设**（groups/providers 条目字段）仍散落在渲染层——候选 ①-1 的根源 = 适配层只收敛了「面」没收敛「形状」（①-2 已证伪：providers 面 0.1.5 逐字段兼容）。D2 设计输入：目录/提供商数据形状应进 hostApiFace 的显式校验/降级（schema-in adapter）。
2. **无人消费的「版本契约」声明面**: peerDeps 9 项 + dsh.client.inject 4 项 = 13 个声明，宿主对前者 semver 静默满足、对后者 informational 跳过——**声明既不校验也不报警**（E-8/C-8）。D3 设计输入：安装/启动时静态校验通道（如 manifest 校验钩子 + 宿主面能力自证）。
3. **轮询/定时器三处常驻（无生命周期门控）**: 客户端 catalog 30s（client.js:5122）、服务端 host-route tick 30s（service.js:2855）、OAuth 刷新链——三者都是「无人看时也在跑」。D4 设计输入：可调测性（循环计数/节流/健康探针）+ 生命周期门控（设置页可见性、账号在场性）。
4. **错误重抛 × 宿主重试的复合面**: 插件三个 LLM 注入点全部「原样上抛」，重试节奏完全由宿主策略决定（插件不可见不可控）——跨版本重试参数漂移 = 整体卡顿的无预警通道（候选 ②-3）。D2 输入：插件路由的重试边界自声明（providerRetryPolicy 已有面，wrapper.js:325-334 镜像了原适配器——保持）。
5. **单点脆弱面 Top3**（按断裂历史 × 接触面宽度）: A-4 llm 适配器契约（FIX-001/016/030 三断裂 + 10 接触点）、C-4/B-2 目录数据形状（FIX-022/026/027/028/029 五断裂关联）、A-9 附件链（FIX-003/007 两断裂 + 8 接触点）——四维设计的优先打击区。

## Step 5: risk 候选（新发现，交 Coordinator 裁决入 risk-log）

- **R-候选 1（对齐 RISK-003 结构性根治轨道）**: 「宿主升级静默漂移通道」——peerDeps semver 静默满足（E-8）+ dsh.client.inject 缺失包静默跳过（C-8）+ 事件白名单改名零迁移提示（D-2）三通道叠加，任何一次宿主 rc 升级都可能在零报警下引入功能退化。建议入 risk-log 作为 ARCH-004 设计的持续风险锚。
- **R-候选 2**: 「目录/提供商数据形状无校验消费」——client.js 渲染层对 modelCatalog.groups / listConfigurableProviders 条目的字段级假设无 schema 防线（候选 ①-1/①-2 根源），下次宿主目录演进仍会以渲染崩溃形态复发。
- **R-候选 3**: 「host-route 探活判据锚定旧目录形状」——`context.contextWindow` 正整数判据（host-route.js:226-229）为 0.1.2 形状快照，probe 恒败时每 30s 双落盘写循环（候选 ②-1）；判据无形状版本化，pi-ai 目录演进即触发。
- **R-候选 4**: 「客户端常驻轮询无可见性门控」——catalog 30s 轮询在插件在场期间无条件运行（client.js:5122），其服务端成本随 enabled agents/oauth 账号数线性放大（候选 ②-2），且无节流/退避面。
- **R-候选 5**: 「D-2 断裂的同类面未盘点完」——remote-events 白名单 19 项 vs 插件全部 $on 键的系统性比对只核了 4 个消费键（D-2~D-5）；未来新增订阅仍可能踩改名通道（流程性风险）。

---

## 统计

> **口径声明（R1 修订，可重构）**: 分级按各表「分级」列字面标记计数；双标条目（A-4/D-4/D-5 标「L1/L2」）单列一桶、总数只计一次；B 类 12 条为 RPC 调用面（api.*/remote.* 方法消费），其分级随宿主命名空间承接（llm/settings/credentials/agentPresets/session = L1~L2），不在下表单列。**待办项权威来源 = 文末 T 表**（本节状态计数仅覆盖 T 表中「有清单条目对应」的项）。

- **清单条目总数**: A 类 14 + B 类 12 + C 类 8 + D 类 8 + E 类 8 + F 类 10 + G 类 3 = **63 条**（展开至模块级接触点 126 个）
- **分级分布（51 条定级条目）**: L1 = 23 · L1/L2 双标 = 3（A-4 / D-4 / D-5）· L2 = 19 · L3 = 6 · L4 = 0（**无纯观察行为依赖**——历史治理已将观察依赖全部升格为有锚点消费）；B 类 12 条随命名空间承接不定级。勘正（R1）：原文「另有 6 条未定级（E-5~E-7）」有误——E 类 8 条全部已定级（E-5/E-7 = L1，**E-6 = L3**，E-8 = L2 等），缺级来源实为 B 类。
- **当前状态分布（R1 修订后）**: ✅ 存续且形状一致 = 56（含 T-2 证伪转正的 B-1）· 存续但部分待验证 = 5 条清单条目（B-11/C-5/E-6/F-7/F-8，对应 T-4/T-5/T-6/T-1/T-7）+ 2 条已定性结构性注记（C-8 缺失但无害、E-8 漂移无预警——均非待验证）· 🔴 升级后断裂 = 1（D-2 事件改名，Reviewer 独立复证成立）· 「升级后宿主中未定位到」= **0**（apiProxy 回落面 0 注册为预期设计非缺失——A-11 已注）
- **裁决闭合（R1，Coordinator 机核）**: T-2 证伪（①-2 关闭）· T-3 降级（①-1 中高→中低，剩余 = 渲染层 schema 外字段访问）· T-9 静态前提不成立（②-1 高→中低，运行时留真机）
- **模块覆盖**: 15/15（memory.js 显式「无宿主依赖」）
- **症状归因域（R1 后）**: ① 开放候选 2（①-1 中低 / ①-3 中低）+ 已证伪 5 · ② 候选 4（优先序 ②-2 ≥ ②-3 > ②-4 > ②-1）；反面证据 10 条

## 待验证清单（长尾项——禁止当作事实引用；每项附验证方法）

| # | 项 | 双侧锚点 | 验证方法 | 影响面 |
|---|----|---------|---------|--------|
| T-1 | agent-presets sessionBlank / turn-start 判据形态 | preset-defaults.js:84-90 vs `<host>dsh-agent-presets`（未逐行） | grep turn/start + turnBoundary 投影 | 播种误判（多播/漏播），非崩溃 |
| T-2 | ~~listConfigurableProviders 结果条目字段~~ | client.js:4856-4878 vs api-remotes :5784 schema | ~~读描述子 result schema 字段~~ | **R1 已裁决：证伪**——0.1.5 逐字段兼容（Coordinator 机核 api-remotes client.js:5727-5734）；候选 ①-2 关闭（B-1 已回注） |
| T-3 | session.modelCatalog groups / directory.load() 快照字段 | client.js:4934-4941/:5014-5034 + 渲染层 vs api-remotes :8628 + ui-model-selection :296 | ~~结果 schema 比对~~ → **剩余**：插件渲染层字段访问全集 vs schema 逐项比对 | **R1 已裁决：降级**——groups schema 存续（机核 :8164-8193）；候选 ①-1 降为中低，遗留小项 = 渲染层 schema 外字段访问比对（B-2/C-4 已回注） |
| T-4 | session.selectModel 请求字段（SessionSelectModelRequest） | client.js:5035-5039 vs api-remotes :8787-8800 codec schema | 读 schema 定义 | twin 接管链（拒绝则退化） |
| T-5 | dsh-client-locale register/bind 服务面 | client.js:5063/:5068 vs `<host>dsh-client-locale/lib/client.js` | 逐行读（低风险） | 页面文案缺失 |
| T-6 | Node 内置 undici major vs 插件 undici ^7 | service.js:4190-4217 守卫 | 宿主运行环境 `process.versions.undici` 实测（真机/CI） | OAuth 代理链 fail-loud 报错（非静默） |
| T-7 | --dsw-alias-* 令牌逐项存续 | client.js:387-478 vs dsh-client-ui-theme | 令牌清单 diff | 样式降级（低） |
| T-8 | settings.section per-slot 错误边界存在性 | 症状①候选 ③ vs ui-settings-general :167 renderSlot 链 | 读 slot 渲染容错实现 | 崩溃放大半径（结构假设） |
| T-9 | ~~resolveModelInfo 返回 context.contextWindow 形状~~ | host-route.js:226-229 vs dsh-llm :2043 + pi-ai data 目录 | ~~读 pi-ai 目录 JSON~~ → **剩余**：运行时目录数据实装形态（真机） | **R1 已裁决：静态前提不成立**——0.1.5 实现链仍返回 contextWindow（机核 dsh-llm index.js:2055-2067 + pi-ai :803-804/:432）；候选 ②-1 降为中低，运行时留真机（A-4 已回注） |
| T-10 | 0.1.5 listModels/resolveModelInfo 进程内成本与缓存 | 候选 ②-2 vs dsh-llm :2019 + dsh-llm-pi-ai | 隔离环境计时探针 | **症状②当前首要候选（②-2，R1 上调）** |
| T-11 | dsh-llm-retry 0.1.5 策略参数 | 候选 ②-3 vs `<host>dsh-llm-retry/lib/index.js` | 读 RetryPolicy 默认值 | **症状②候选 ②（②-3，R1 上调；可同释两症状）** |

---

## 附：本清单的验证边界声明

1. 宿主侧锚点全部来自 `<host>` checkout（0.1.5-rc.2）本次会话实读；**未运行宿主、未真机取证**（插件已卸载，症状不可复现）——症状归因域为代码级对照推断，最终裁决需 Coordinator/用户结合真机信息（崩溃截图/报错文本/卡顿时段）。R1 修订：T-2/T-3/T-9 三项静态比对已由 Coordinator 机核裁决闭合（REVIEW-ARCH-004-R1 轮，批注已回注 B-1/B-2/C-4/A-4 与 T 表）；真机待办收敛为 T-6/T-9 运行时面。
2. tests/ 守卫现状（adapter-parity / fix-029-host-contract / rpc-shadow-guard / served-client 镜像）未逐套重读——其锚定形态仍为 0.1.2 宿主面，D3 设计应将「测试桩锚定 0.1.5 源码」列为强制项（P10 原则 ④ 既有要求）。
3. `dsh` 主包 0.1.5-rc.1 与 dsh-* 0.1.5-rc.2 的版本错位为主包自身依赖声明，不构成本清单依赖面。

