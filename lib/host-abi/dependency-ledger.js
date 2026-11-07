/**
 * ARCH-007 B1（设计 §6 轴① / §7 声明层）：**宿主依赖账本**——四类宿主依赖
 * 并集的唯一登记处，逐条回答「这条依赖为什么删不掉」。
 *
 * 四类源（并集 36 条，无重复、无孤儿；机器锁见 `tests/host-abi-health.mjs`
 * §B1）：
 * - `package`（13）：`host-packages.js` 的 `HOST_PACKAGE_REGISTRY`——package.json
 *   `peerDependencies` 的代码侧事实源（11 个 dsh-* + cordis + schemastery）；
 * - `ctx-service`（11）：`ctx-services.js` 的 `CTX_SERVICES`——Node 侧 ctx.get 服务面；
 * - `fiber-face`（9）：`inject-manifest.js` 的 `FIBER_INJECT`——客户端 fiber 注入面；
 * - `client-package`（3）：`inject-manifest.js` 的 `CLIENT_PACKAGE_INJECT`——
 *   package.json `dsh.client.inject` 的宿主客户端包。
 *
 * 字段语义（P1：只登记可核事实）：
 * - `kind`：上列四类之一；
 * - `id`：该源中逐字相同的键名（包名 / 服务名 / fiber 面名）；
 * - `level`：`required` = 缺失即核心功能不可用或装载失败；`optional` = 缺失走
 *   既有降级路径（探针 FaceHealth + noteHostDiag + 可见告警，P8），插件继续运行。
 *   `package` 条目的 level **必须**与 `HOST_PACKAGE_REGISTRY.optional` 及
 *   package.json `peerDependenciesMeta` 三方一致（8 个 optional）；
 * - `evidence`：**消费者文件 + 缺失/降级后果 + 红测断言名**（禁用空泛措辞；
 *   B1-k1 机器锁校验消费者路径与 `→` 后果，B1-k 校验 required 红测三选一，不
 *   代替人读——新增依赖必须写出可核的消费点）；
 * - 「红测」口径（P1 防过度声明）：**该面缺失/降级时确实会变红**的既有断言。
 *   只断言「降级可见 / 探针记 missing / 缺面返回降级信封」的用例**不算**红测——
 *   它们在缺面时恰好是绿的（缺的正是「核心不可用 ⇒ 红」那一侧）。
 * - `redTest` / `redTestGap`：确无既有红测的 required 条目显式登记
 *   `redTest: null` + 非空 `redTestGap`（原因 + 补测方向），并同步加入下方冻结
 *   数组 `RED_TEST_GAPS`；有红测的条目在 evidence 中写 `tests/*.mjs` 断言名。
 * - `since`：该依赖进入「声明面支持基线」的宿主代际（本账本统一以声明范围
 *   下界 `0.2.0-rc.2` 为登记起点；代际档案见 `version.js`）。
 *
 * 维护规则（P5 单点 + P4 防回归）：新增/删除任一宿主依赖时，**本账本与对应
 * 事实源必须同一批改**——b1 锁校验「并集相等 + 条数相等 + 无重复」，只改一侧
 * 即红；改 level 而漏改 `peerDependenciesMeta` 亦红（optional 一致性锁）。
 * required 条目的红测缺口只允许显式登记（`redTestGap` + `RED_TEST_GAPS`），
 * 补上红测后必须同批删除缺口项——禁止「既无红测也无缺口说明」的静默空档。
 * @module dsh-agent-router/host-abi/dependency-ledger
 */

/**
 * 宿主依赖账本（四源并集，冻结单点）。
 * @type {ReadonlyArray<Readonly<{ kind: 'package'|'ctx-service'|'fiber-face'|'client-package', id: string, level: 'required'|'optional', evidence: string, since: string, redTest?: null, redTestGap?: string }>>}
 */
export const DEPENDENCY_LEDGER = Object.freeze([
  // ── package（13 = HOST_PACKAGE_REGISTRY；level 对齐 peerDependenciesMeta）──
  Object.freeze({
    kind: 'package',
    id: '@deepseek-ai/cordis',
    level: 'required',
    evidence: '结构依赖（usage=structure）：lib/index.js 的 apply(ctx) 与 inject=[settings,typert,webServer] 由宿主 cordis runner 装配，插件不 import（禁入 dependencies 的 P0 纪律仍适用）；缺失 → 无 cordis runner 即装载失败（apply 根本不执行）；删声明 → tests/host-version-snapshot.mjs「peerDependencies covers exactly the 13 baseline host packages (8 feature + 3 runtime + 2 platform)」与「registry package set === package.json peerDependencies keys」红',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'package',
    id: '@deepseek-ai/schemastery',
    level: 'required',
    evidence: 'lib/schemas.js 经 lib/host-abi/host-imports.js 的 z 构造 routerSchema（Config 导出声明制）、lib/service.js 用 Schema 校验配置；缺失 → import 失败、插件装载中断；删声明 → tests/host-contract.mjs「S3 声明面: peerDependencies = 基线 13 项宿主供给包（8 特性 + 3 运行时 + 2 平台，集合相等）」与「S10 边界: 声明表包集合与 package.json peerDependencies 键集合相等（投影一致）」红',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'package',
    id: '@deepseek-ai/dsh-llm',
    level: 'required',
    evidence: 'lib/host-abi/host-imports.js 导出 BlockAssembler/createUserMessage/createAssistantMessage，lib/service.js 构造模型消息与流式块；缺失 → import 失败、chat/路由主链不可用；删声明 → tests/host-contract.mjs「S10 边界: 声明表包集合与 package.json peerDependencies 键集合相等（投影一致）」与「S10 边界: host-imports.js 实际 import 包集合 === 声明表 usage=import 集合（双向锁定——表与代码任一侧漂移即红）」红',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'package',
    id: '@deepseek-ai/dsh-tools',
    level: 'required',
    evidence: 'lib/host-abi/host-imports.js 导出 defineTool，lib/tool.js 注册 route_agent 工具；缺失 → import 失败、route_agent 工具不注册；删声明 → tests/host-contract.mjs「S3 声明面: peerDependencies = 基线 13 项宿主供给包（8 特性 + 3 运行时 + 2 平台，集合相等）」与「S10 边界: 声明表包集合与 package.json peerDependencies 键集合相等（投影一致）」红',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'package',
    id: '@deepseek-ai/dsh-typert-protocol',
    level: 'required',
    evidence: 'lib/host-abi/host-imports.js 导出 TypertRemoteService，lib/service.js 挂 /api/router/* RPC 契约（typert 注册）；缺失 → import 失败、RPC 契约面不可用；删声明 → tests/host-contract.mjs「S10 边界: 声明表包集合与 package.json peerDependencies 键集合相等（投影一致）」红',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'package',
    id: '@deepseek-ai/dsh-attachment',
    level: 'optional',
    evidence: 'attachments ctx 面（lib/attachments.js:200 附件物化）；缺省降级 = 附件上传失败显式报错 + 诊断；删声明 → tests/attachments.mjs 与 tests/host-contract.mjs S3/S10 红',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'package',
    id: '@deepseek-ai/dsh-agent',
    level: 'optional',
    evidence: 'agents ctx 面（lib/preset-defaults.js agentsRegistryOf 播种/预设切换）；缺省降级 = 面 missing 诊断、预设播种跳过；删声明 → tests/preset-defaults.mjs 与 tests/host-contract.mjs S3/S10 红',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'package',
    id: '@deepseek-ai/dsh-agent-default-model',
    level: 'optional',
    evidence: 'agentDefaultModel ctx 面（lib/preset-defaults.js:402、lib/wrapper.js:558、lib/host-abi/llm-selection.js liveDefaultSelection）；缺省降级 = 默认模型播种跳过；删声明 → tests/host-contract.mjs S3/S10 红',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'package',
    id: '@deepseek-ai/dsh-credentials',
    level: 'optional',
    evidence: 'credentials ctx 面（lib/service.js:56 credentialsOf、lib/host-abi/client-remotes.js credentials RPC）；缺省降级 = OAuth 凭据 RPC 显式报错；删声明 → tests/oauth-credentials.mjs 红',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'package',
    id: '@deepseek-ai/dsh-session',
    level: 'optional',
    evidence: 'sessionProjections ctx 面（lib/prestep.js:224 会话投影）+ sessionController 面（lib/host-abi/llm-selection.js selectModel）；缺省降级 = 预步骤跳过投影、会话选择降级；删声明 → tests/smoke.mjs 红',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'package',
    id: '@deepseek-ai/dsh-settings',
    level: 'optional',
    evidence: 'settings ctx 面（lib/host-route.js readProvidersEntry/syncHostRoute、lib/service.js:3683）；缺省降级 = 宿主路由配置同步显式报错；删声明 → tests/routing-paths.mjs 红',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'package',
    id: '@deepseek-ai/dsh-subagent',
    level: 'optional',
    evidence: 'subagents ctx 面（lib/service.js:1489 subagentsOf + :1521 start(spawn)）；缺省降级 = agent 路由显式 throw「subagent 服务不可用」（P8 可观测）；删声明 → tests/routing-paths.mjs 红',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'package',
    id: '@deepseek-ai/dsh-system-prompt',
    level: 'optional',
    evidence: 'systemPrompt 面（lib/tool.js:30 inject 声明 + :221 ctx.systemPrompt.section 路由提示段）；缺省降级 = 提示段不注册；删声明 → tests/smoke.mjs 红',
    since: '0.2.0-rc.2',
  }),

  // ── ctx-service（11 = CTX_SERVICES 键集）──
  Object.freeze({
    kind: 'ctx-service',
    id: 'llm',
    level: 'required',
    evidence: 'lib/service.js:937/1357/1371 经 llmOf（safeListModels/resolveModelInfo/stream）+ lib/wrapper.js:548/628、lib/oauth-llm.js:482/532 经 llmFaceOf（registerAdapter/registration 三方法门控）；缺失 → 适配器注册/模型解析/chat 调用显式失败或降级，路由主链不可用；无既有断言在该面缺失时变红（redTestGap 登记）',
    redTest: null,
    redTestGap: '缺 llm 面的既有用例全部是「降级/门控通过即绿」：tests/host-abi-health.mjs「F-2 锚定: llmOf 存在性解析（部分形状面透传给消费点自持守卫——smoke 桩最小形状零回退锚定）」直接断言空 ctx → null，tests/fix-029-host-contract.mjs「D4: llmFaceOf 三方法并集门控（缺 listModels → null；三方法齐 → 面本体；宿主 LlmRuntime 0.1.5-rc.2 的 registerAdapter/registration/listModels 三方法齐备实证 dsh-llm——零回退）」只锁形状门控，tests/host-abi-health.mjs「B2: 面缺失 → 降级信封 {ok:false, error.code:host-face-missing}（throw 语义已废）」断言的是 remote.llm 客户端面的降级信封——三者缺面时都绿。补测 = 在无 llm 的 ctx 上走 service.js 的 route_agent chat 主链，断言显式失败（错误码 + 可读消息）而非静默空结果',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'ctx-service',
    id: 'credentials',
    level: 'optional',
    evidence: 'lib/oauth-credentials.js 经 credentialsOf 存取 OAuth 凭据；缺失 → 授权路径显式报错（P8），其余功能继续',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'ctx-service',
    id: 'settings',
    level: 'required',
    evidence: 'lib/host-route.js:228/297 经 settingsOf（readProvidersEntry/syncHostRoute）+ lib/service.js:3683/3699 设置页 RPC；缺失 → syncHostRoute 记 host_route_maintain_fail 并累计失败（notice/warn 可见），设置页读写显式失败；无既有断言覆盖该缺面（redTestGap 登记）',
    redTest: null,
    redTestGap: '既有套件恒提供 settings：tests/oauth-main-model.mjs 的 makeRouteHarness 在 L463 provide settings，tests/host-abi-health.mjs 仅锁 host-route 消费点源码；补测 = syncHostRoute(ctx 无 settings) → hostRouteStatusOf().maintained === false 且 hostRouteEvents 含 host_route_maintain_fail（reason 含「settings 服务不可用」）',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'ctx-service',
    id: 'fs',
    level: 'required',
    evidence: 'lib/attachments.js:205 fsService + :250 registerPath（STORE_UNAVAILABLE）+ lib/service.js:1036/1099/1119/2072/2593 文件输入/投递；缺失 → 附件注册与 files 路径校验显式报错「文件服务不可用」，不静默吞错；无既有断言覆盖该缺面（redTestGap 登记）',
    redTest: null,
    redTestGap: '既有套件恒提供 fs：tests/attachments.mjs 夹具 provide fs，STORE_UNAVAILABLE / 文件服务不可用在 tests/*.mjs 零命中；补测 = registerPath(无 fs 的 ctx) → error.code === ATTACHMENT_ERROR_CODES.STORE_UNAVAILABLE',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'ctx-service',
    id: 'attachments',
    level: 'optional',
    evidence: 'lib/attachments.js:200 取 attachments 面；缺失 → 附件上传降级为显式错误 + 诊断，文本路由继续',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'ctx-service',
    id: 'subagents',
    level: 'optional',
    evidence: 'lib/service.js:1489 subagentsOf + :1521 start(spawn)；缺失 → agent 路由 throw「subagent 服务不可用」（可见失败）',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'ctx-service',
    id: 'agentDefaultModel',
    level: 'optional',
    evidence: 'lib/preset-defaults.js:402 读写默认模型 + lib/wrapper.js:558 判别；缺失 → 默认模型播种跳过并记诊断',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'ctx-service',
    id: 'sessionController',
    level: 'optional',
    evidence: 'lib/host-abi/llm-selection.js 的 sessionSelectFaceOf（selectModel）；缺失 → 会话模型选择切换降级为 no-op + 诊断',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'ctx-service',
    id: 'sessionProjections',
    level: 'optional',
    evidence: 'lib/prestep.js:224 会话投影 stateOf；缺失 → 预步骤跳过投影读取（不阻断请求）',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'ctx-service',
    id: 'agents',
    level: 'optional',
    evidence: 'lib/preset-defaults.js agentsRegistryOf（get）；缺失 → 预设播种/切换跳过并记诊断',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'ctx-service',
    id: 'agentPresets',
    level: 'optional',
    evidence: 'lib/preset-defaults.js:246 composedPreset；缺失 → 预设感知降级（不阻断请求）',
    since: '0.2.0-rc.2',
  }),

  // ── fiber-face（9 = FIBER_INJECT）──
  Object.freeze({
    kind: 'fiber-face',
    id: 'slots',
    level: 'required',
    evidence: 'lib/client.js 设置/统计页面经 slots 挂载（FIBER_INJECT 含 slots；apply 内 ctx.slots.inject / ctx.slots.register 直调、无缺面守卫）；缺失 → apply 装配中断、页面不挂载 + probeFiberInjectFaces 记 inject-face-missing；无既有断言在该面缺失时变红（redTestGap 登记）',
    redTest: null,
    redTestGap: '缺 slots 面的既有用例全是「缺面被记录即绿」：tests/host-abi-health.mjs「B2: noteInjectFaceGaps 探测全部 FIBER_INJECT 面并返回 FaceHealth[]」的夹具 gapCtx = { get: () => undefined }（只给 remote.llm）直接断言 slots.state === "missing"——缺面时恰好绿、补上面反而红；tests/client-render.mjs 夹具恒 provide slots 桩（ctx 的 slots: { inject/register }），挂载路径永不缺面。补测 = 按 client-render 夹具形态但不 provide slots 调 apply，断言 ① apply 首段面自检先落 inject-face-missing(slots)（可观测）；② 紧随的 ctx.slots.inject 直调失败被显式断言（可读错误/错误态可见），而非裸 TypeError 穿到宿主',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'fiber-face',
    id: 'locale',
    level: 'optional',
    evidence: 'lib/client.js t() 取 locale 文案；缺失 → 回退内置中文文案（页面仍渲染）',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'fiber-face',
    id: 'remote',
    level: 'required',
    evidence: 'lib/client.js 经 remote 面调 /api/router/*（settings/stats/preset RPC，$on = ctx.remote.$on）、load() 守卫 remote.router 缺失即报 host-face-missing；缺失 → 设置页数据不可用（面板不渲染）+ probeFiberInjectFaces 记 inject-face-missing；无既有断言在该面缺失时变红（redTestGap 登记）',
    redTest: null,
    redTestGap: '缺 remote 面的既有用例全是「降级可见即通过」：tests/client-render.mjs「FIX-046-7: remote.router 命名空间缺失 → 显式 host-face-missing 诊断且折叠态可见（R0 F-5 补覆盖；旧实现静默跳过此断言必红）」在缺面时绿，且套件注释自认该分支在生产装配下不可达（load() 守卫先早退为错误态、面板不渲染）；tests/host-abi-health.mjs「B2: 缺面记 inject-face-missing 入环形（apply 自检权威单点，不 throw）」期望缺面被计入（+8），缺面时绿、补上面反而红。补测 = 生产装配形态（ctx 无 remote 面）下断言 load() 早退的错误态可见与恢复路径',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'fiber-face',
    id: 'remote.llm',
    level: 'optional',
    evidence: 'lib/client.js 模型列表/适配器面（模型选择 GUI）；缺失 → 模型目录降级 + 诊断',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'fiber-face',
    id: 'remote.settings',
    level: 'optional',
    evidence: 'lib/client.js 设置读写 remote 面；缺失 → 设置页只读降级 + 诊断',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'fiber-face',
    id: 'remote.credentials',
    level: 'optional',
    evidence: 'lib/client.js 凭据 RPC（OAuth 登录）；缺失 → OAuth 面板显式报错',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'fiber-face',
    id: 'remote.agentPresets',
    level: 'optional',
    evidence: 'lib/client.js 预设列表 remote 面；缺失 → 预设选择器降级 + 诊断',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'fiber-face',
    id: 'remote.session',
    level: 'optional',
    evidence: 'lib/client.js 会话模型选择 remote 面；缺失 → 会话级模型覆盖不可用（诊断可见）',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'fiber-face',
    id: 'modelDirectories',
    level: 'optional',
    evidence: 'lib/client.js composer 模型目录刷新（FIX-026/027）；缺失 → 目录刷新跳过 + 诊断，不阻断页面',
    since: '0.2.0-rc.2',
  }),

  // ── client-package（3 = CLIENT_PACKAGE_INJECT）──
  Object.freeze({
    kind: 'client-package',
    id: '@deepseek-ai/dsh-client-ui-settings',
    level: 'required',
    evidence: 'package.json 的 dsh.client.inject + lib/client.js 设置页宿主槽位（settings.register）；缺失 → 设置页无宿主容器、面板不渲染；删声明 → tests/host-contract.mjs「S3 声明面: dsh.client.inject === inject-manifest 代码侧常量 CLIENT_PACKAGE_INJECT（B0/B1 单源，成体系比对）」红',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'client-package',
    id: '@deepseek-ai/dsh-client-locale',
    level: 'optional',
    evidence: 'package.json dsh.client.inject + lib/client.js 本地化文案；缺失 → 回退内置文案；tests/host-contract.mjs S3 锁定清单',
    since: '0.2.0-rc.2',
  }),
  Object.freeze({
    kind: 'client-package',
    id: '@deepseek-ai/dsh-api-remotes',
    level: 'required',
    evidence: 'package.json 的 dsh.client.inject + lib/client.js 的 $on（= ctx.remote.$on 转发事件订阅，30 项白名单消费）；缺失 → 客户端事件驱动刷新失效，只剩 30s 兜底轮询；删声明 → tests/host-contract.mjs「S3 声明面: dsh.client.inject === inject-manifest 代码侧常量 CLIENT_PACKAGE_INJECT（B0/B1 单源，成体系比对）」红',
    since: '0.2.0-rc.2',
  }),
])

/**
 * 红测缺口冻结清单（ARCH-007 P8）：`kind:id` 形式，仅允许 required 条目。
 * 数组 = 账本声明「当前确实没有任何既有断言在该面缺失/降级时变红」；
 * 每条必须在对应台账记录上同时带 `redTest: null` + 非空 `redTestGap`
 * （原因 + 补测方向）。补上红测后必须同批删除本数组对应项。
 * @type {ReadonlyArray<string>}
 */
export const RED_TEST_GAPS = Object.freeze([
  'ctx-service:llm',
  'ctx-service:settings',
  'ctx-service:fs',
  'fiber-face:remote',
  'fiber-face:slots',
])

