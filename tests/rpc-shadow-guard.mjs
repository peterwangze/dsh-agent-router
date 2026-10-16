/**
 * FIX-011 判别测试：统计读侧 RPC 断裂（字段遮蔽方法）守卫。
 *
 * RCA（Coordinator 已实证，本测试复核）：
 * - v0.3.0（EVO-003 统计迁移）在 RouterService 构造器引入实例字段
 *   `this.stats = new StatsStore(...)`（lib/service.js），该自有属性
 *   遮蔽原型上的 RPC 方法 `stats()`（lib/service.js 的 `stats()` →
 *   `statsSnapshot()` 委托）。
 * - 宿主 typert 网关按 `descriptor.implementation ?? descriptor.method`
 *   经 `Reflect.get(receiver, implementation)` 解析方法并断言函数类型
 *   （宿主 dsh-api-gateway 的 `Reflect.get(receiver, implementation)` 解析面）。`Reflect.get(service, 'stats')`
 *   命中实例字段（StatsStore 对象）→ 非函数 → RPC router/stats 返回
 *   method-unavailable → 设置页统计面板每 2s 轮询静默失败恒 0。
 * - 修复：ROUTER_DESCRIPTORS 中 stats 条目声明 `implementation:
 *   'statsSnapshot'`，网关据此绕开被遮蔽的名字绑定原型方法（字段保持原样
 *   ——内部有大量使用，不改 lib/service.js）。
 *
 * 判别性：旧代码（无 implementation 映射）运行本测试 stats 相关断言必败；
 * 修复后全绿。构造走生产路径（new RouterService + attach），stats 默认
 * persist=false 纯内存——不触碰 ~/.dsh 与 $DSH_HOME。
 *
 * ARCH-005 A2（HD-003）codec 形态判别（§5/§6）：宿主 0.2.0-rc.2 的
 * strict codec 契约从 `{schema}` 换代为 `{create: () => schema}` 惰性工厂
 * ——19 条描述子的 codec 产出 MUST 过新树 validateCodec（§5 形态判据 +
 * §6 真树实跑）。旧 `{schema}` 裸形态判红。
 *
 * 独立入口：node tests/rpc-shadow-guard.mjs（exit 0/1）。
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { ROUTER_DESCRIPTORS, createHostContribution } from '../lib/rpc.js'
import { wireCodecs } from '../lib/schemas.js'
import { RouterService } from '../lib/service.js'

let failures = 0
let passed = 0
const check = (label, condition) => {
  if (condition) { passed++; console.log(`  ok  ${label}`) }
  else { failures++; console.error(`FAIL  ${label}`) }
}

// 最小构造（tests/fix-009-image-solo.mjs 先例）：构造器不访问 settings/llm
// 等（惰性），stats 默认 persist=false 纯内存零磁盘。
const service = new RouterService(new Context())
service.attach({ get: () => ({ enabled: true, agents: {} }) })

// ── 1. 网关绑定契约守卫：每个描述符经 implementation ?? method 解析后
//      必须得到可调用方法（与宿主 dsh-api-gateway 的同一解析语义）。
console.log('descriptor → callable binding (gateway contract):')
for (const descriptor of ROUTER_DESCRIPTORS) {
  const key = descriptor.implementation ?? descriptor.method
  const method = Reflect.get(service, key)
  check(`descriptor ${descriptor.id}: Reflect.get(service, ${JSON.stringify(key)}) is callable`, typeof method === 'function')
}

// ── 2. stats 条目必须显式指向 statsSnapshot（字段遮蔽的绕行锚点）。
console.log('stats descriptor implementation:')
const statsDescriptor = ROUTER_DESCRIPTORS.find((d) => d.id === 'dsh-agent-router#router/stats')
check('stats descriptor declares implementation "statsSnapshot"', statsDescriptor?.implementation === 'statsSnapshot')

// ── 3. statsSnapshot 基础形状（ok/enabled/totals——设置页面板消费面）。
console.log('statsSnapshot shape:')
const snap = service.statsSnapshot()
check('statsSnapshot: ok === true', snap.ok === true)
check('statsSnapshot: enabled is boolean', typeof snap.enabled === 'boolean')
check('statsSnapshot: totals is array', Array.isArray(snap.totals))

// ── 4. FIX-046 双侧 descriptor 集合等价（P5 单点化机器守卫）─────────────
// 根因（EV-217，Coordinator 机读对账）：服务端 ROUTER_DESCRIPTORS（lib/rpc.js）
// 与客户端 $mount 列表（lib/client.js 的 ROUTER_REMOTE.descriptors）曾是**两份
// 事实源**——19 vs 17，缺 { router/presetDiagnostics, router/hostFaceDiagnostics }
// ⇒ 浏览器侧 $mount 只注册 17 个方法 ⇒ `remote.router.hostFaceDiagnostics` 不
// 存在 ⇒ 设置页宿主面健康面板的版本/诊断面被静默跳过（真机
// `host-face-shape: hostFaceDiagnostics`，EV-217）。本段把「两侧 id 集合相等 +
// 逐条 codec schema 深度等价」变成机器判据：**任一单侧增删即判红**（含顺序漂移
// ——同序使差异可逐位定位）。
//
// 读取方式：lib/client.js 是浏览器包（`window.__ModuleLoader__.load({...})`），
// 非 ESM 模块面 ⇒ 在临时 window 垫片上求值后从 factory 导出取面；与
// tests/client-render.mjs 的客户端包求值形态（`new Function('window', source)`
// + `window.__ModuleLoader__.load` 载荷捕获）同源，只读取值不执行 apply。
console.log('FIX-046: client/server descriptor parity (single source of truth):')
{
  const clientPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js')
  const savedWindow = globalThis.window
  const captured = {}
  globalThis.window = {
    __ModuleLoader__: { load: (payload) => { captured.bundle = payload } },
    location: { search: '', pathname: '/' },
  }
  let clientExports = null
  let loadError = null
  try {
    const url = pathToFileURL(clientPath).href
    await import(`${url}?fix046-parity`)
    if (captured.bundle && typeof captured.bundle.factory === 'function') {
      // 最小 react 垫片：factory 体在**本期**只解构 4 个 hook（组件函数体内的
      // 其余使用发生在渲染期，本守卫不渲染）——与 client-render.mjs 的迷你
      // React 同源但更薄：本段只取 descriptor 值面，不触发任何组件渲染。
      const reactShim = {
        createElement: () => null,
        useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
        useEffect: () => {},
        useCallback: (fn) => fn,
        useRef: (value) => ({ current: value }),
      }
      clientExports = captured.bundle.factory((name) => {
        if (name === 'react') return reactShim
        throw new Error(`rpc-shadow-guard: unexpected client require(${JSON.stringify(name)})`)
      })
    }
  } catch (error) {
    loadError = error
  } finally {
    if (savedWindow === undefined) delete globalThis.window
    else globalThis.window = savedWindow
  }
  const clientRemote = clientExports && clientExports.ROUTER_REMOTE
  check('client bundle loads and exports ROUTER_REMOTE (window-shim evaluation, no apply)',
    loadError === null && !!clientRemote && Array.isArray(clientRemote.descriptors), { error: loadError ? String(loadError) : null })
  const clientDescriptors = Array.isArray(clientRemote?.descriptors) ? clientRemote.descriptors : []

  const clientIds = clientDescriptors.map((descriptor) => descriptor.id)
  const serverIds = ROUTER_DESCRIPTORS.map((descriptor) => descriptor.id)
  const clientOnly = clientIds.filter((id) => !serverIds.includes(id))
  const serverOnly = serverIds.filter((id) => !clientIds.includes(id))
  if (clientOnly.length > 0 || serverOnly.length > 0) {
    // 诊断优先（判别失败时直接给出**差集两侧**——修复不必再手工对账；
    // EV-217 的根因报告即靠同一对账得出，此处把对账机器化）。
    console.error(`  detail  客户端 $mount 独有（服务端缺）: ${JSON.stringify(clientOnly)}`)
    console.error(`  detail  服务端 ROUTER_DESCRIPTORS 独有（客户端缺）: ${JSON.stringify(serverOnly)}`)
  }
  check('双侧 descriptor id 集合相等（客户端 $mount === 服务端 ROUTER_DESCRIPTORS）',
    clientIds.length > 0 && serverIds.length > 0 && clientOnly.length === 0 && serverOnly.length === 0,
    { clientCount: clientIds.length, serverCount: serverIds.length, clientOnly, serverOnly })
  check('双侧 descriptor 顺序一致（逐位可比对，差异可定位）',
    clientIds.length === serverIds.length && clientIds.every((id, index) => id === serverIds[index]))
  check('双侧 descriptor id 各自唯一（重复 id 会使集合判据失真）',
    new Set(clientIds).size === clientIds.length && new Set(serverIds).size === serverIds.length)
  // 判据自证：集合判据只有在「客户端确实取到面」时才有判别力（取不到面时
  // clientIds = [] ⇒ 空集，若不拦则「两侧皆空」会假绿）。上面第 1 条断言 +
  // 下方非空断言共同构成 fail-closed 前置闸。
  check('双侧 descriptor 均非空（防「空集对空集」假绿——fail-closed 前置闸）',
    clientIds.length > 0 && serverIds.length > 0, { clientCount: clientIds.length, serverCount: serverIds.length })

  // FIX-047（N-1，R1 P3）：**方法轴**等价——上列判据此前只覆盖 id 集合（+ 新增
  // 两条的 codec 深等），`service`/`namespace`/`method`/`invocation.kind` 未参与
  // ⇒「id 不变而 method 单侧异名」可静默复现 EV-217 同型缺陷（浏览器侧
  // `remote.router.<method>` 仍然缺失，而集合判据全绿）。顺序已由上方判据锁定
  // ⇒ 本项按位成对比较四轴；任一侧任一 descriptor 漂移即红（诊断含双侧值）。
  const methodAxisOf = (descriptor) => [
    descriptor.service, descriptor.namespace, descriptor.method,
    descriptor.invocation && descriptor.invocation.kind,
  ].join(' | ')
  const methodAxisMismatches = []
  for (let index = 0; index < Math.min(clientDescriptors.length, ROUTER_DESCRIPTORS.length); index++) {
    const clientAxis = methodAxisOf(clientDescriptors[index])
    const serverAxis = methodAxisOf(ROUTER_DESCRIPTORS[index])
    if (clientAxis !== serverAxis) methodAxisMismatches.push(`${clientIds[index]} :: 客户端[${clientAxis}] ≠ 服务端[${serverAxis}]`)
  }
  check('双侧 descriptor 方法轴逐条等价（service/namespace/method/invocation.kind 逐位相等——id 不变而方法异名即红；FIX-047 N-1）',
    clientDescriptors.length > 0 && clientDescriptors.length === ROUTER_DESCRIPTORS.length && methodAxisMismatches.length === 0,
    { axisMismatches: methodAxisMismatches })
  if (methodAxisMismatches.length > 0 || clientDescriptors.length !== ROUTER_DESCRIPTORS.length) {
    // 诊断优先（与上方 id 差集同法）：失败时直接给出双侧四轴值，修复不必再对账。
    for (const mismatch of methodAxisMismatches) console.error(`  detail  方法轴不一致: ${mismatch}`)
    if (clientDescriptors.length !== ROUTER_DESCRIPTORS.length) {
      console.error(`  detail  方法轴比较前提失败（双侧条数不等）: 客户端 ${clientDescriptors.length} / 服务端 ${ROUTER_DESCRIPTORS.length}`)
    }
  }

  // 逐条 codec 等价：**本批新增的两条**（presetDiagnostics / hostFaceDiagnostics）
  // 的请求/结果 schema **深度逐值相等**——它们是新增面，无历史包袱，MUST 与
  // lib/schemas.js 的权威形状完全相同（含 typeSymbol）；任一单侧改形状即红。
  // 既有 17 条为**历史镜像**（客户端 v 家族是服务端 schemastery 形状的**有意
  // 缩减镜像**，如 catalog 结果缺 takeoverDefaultModel/mainModelImage——深比会
  // 恒红，非本批授权面）⇒ 只判「形状声明在场且非空」（结构性在场判据）。
  // **FIX-047（N-5，R1 P3）限定语（禁超宣示）**：本判据的语义 = **声明等价
  // ≠ 校验行为等价**——深等只比对两侧**手写 spec 的文本**（lib/schemas.js `v`
  // 构造器 vs lib/client.js `wv` 构造器产出的 spec 字面量），**不覆盖**两侧
  // 校验器实现（lib/schemas.js `check` vs lib/client.js `wireCheck`：未知字段
  // 策略等行为分叉不会在此判红），也**不覆盖**宿主 `$mount` 的 codec 消费面
  // （宿主包不在本仓索引面，仓内不可核验）。
  const parityIds = ['dsh-agent-router#router/presetDiagnostics', 'dsh-agent-router#router/hostFaceDiagnostics']
  const serverByIdForShape = new Map(ROUTER_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor]))
  const specOf = (node) => (node && node.spec ? node.spec : node)
  const codecMismatches = []
  for (const id of parityIds) {
    const clientDescriptor = clientDescriptors.find((descriptor) => descriptor.id === id)
    const serverDescriptor = serverByIdForShape.get(id)
    if (!clientDescriptor || !serverDescriptor) { codecMismatches.push(`${id}: missing`); continue }
    // ARCH-005 A2：schema 经 create() 惰性取回（形态见 §5）。create 缺失
    // （旧 {schema} 形态）按判据红处理并给出诊断——不裸调防未捕获 TypeError
    // 掩盖判别面。
    const clientResultCodec = clientDescriptor.result
    const serverResultCodec = serverDescriptor.result
    const clientParamCodec = clientDescriptor.parameters[0]?.codec
    const serverParamCodec = serverDescriptor.parameters[0]?.codec
    const creatable = (codec) => typeof codec?.create === 'function'
    if (!creatable(clientResultCodec) || !creatable(serverResultCodec) || !creatable(clientParamCodec) || !creatable(serverParamCodec)) {
      codecMismatches.push(`${id}: codec.create 不是函数（旧 {schema} 形态？client.result=${creatable(clientResultCodec)} server.result=${creatable(serverResultCodec)} client.param=${creatable(clientParamCodec)} server.param=${creatable(serverParamCodec)}`)
      continue
    }
    const same = JSON.stringify(specOf(clientResultCodec.create())) === JSON.stringify(specOf(serverResultCodec.create()))
      && clientResultCodec.typeSymbol === serverResultCodec.typeSymbol
      && JSON.stringify(specOf(clientParamCodec.create())) === JSON.stringify(specOf(serverParamCodec.create()))
      && clientParamCodec.typeSymbol === serverParamCodec.typeSymbol
    if (!same) codecMismatches.push(id)
  }
  check('新增两条（presetDiagnostics/hostFaceDiagnostics）请求+结果 codec 深度等价 lib/schemas.js 权威形状（typeSymbol 含内）',
    codecMismatches.length === 0, { codecMismatches })
  check('全部客户端 descriptor 结果/参数 codec 声明在场（结构性在场判据，防静默丢 codec）',
    clientDescriptors.length > 0 && clientDescriptors.every((descriptor) =>
      descriptor.result && typeof descriptor.result.mode === 'string' && typeof descriptor.result.create === 'function'
      && (descriptor.parameters ?? []).length > 0
      && descriptor.parameters.every((entry) => entry.wire === entry.name && !!entry.codec && typeof entry.codec.create === 'function')))

  // ── 5. ARCH-005 A2（HD-003）：strict codec 形态判别 `{schema}` → `{create: () => schema}`。
  //      宿主 0.2.0-rc.2 的 typert-registry 对无 create() 工厂的 strict codec 直接 throw：
  //      `<new>dsh-typert-registry/lib/index.js:562-566`（validateCodec：
  //      `if (typeof codec.create !== "function") throw new Error("typert: ${subject}
  //      strict codec has no create() factory")`）。双通道消费：服务端 register
  //      （TypertRegistry.register :398 → localStore.validate → validateInvocation
  //      :522-561 → validateCodec 对 result+每参数强制）与客户端 $mount
  //      （api-gateway mountContribution :1662 → typert.remotes.register :1664
  //      → RemoteStore.register :141-160 → descriptors.validate :69-81 → 同一
  //      validateInvocation）。
  //      宿主自证形态：`dsh-api-remotes/lib/client.js:11666-11680`（codec:
  //      {mode:"strict", typeSymbol, create: <惰性 $schema 工厂>}，工厂形
  //      `() => $value ??= object({...})`——零参调用返回 schema，消费面
  //      `record.value ??= record.create()`〔typert-registry :510〕）。本段判据：
  //      ① create 为函数（:565 throw 形态判别面）；② codec 键集恰为
  //      {create,mode,typeSymbol}——旧 `schema` 键零残留（P5：被取代的旧路径
  //      MUST 删除，禁止并存）；③ create() 返回值 .parse 可调（schema 对象
  //      本身不变——仅惰性工厂包装，非重造）。
  console.log('ARCH-005 A2: strict codec create() factory form (HD-003, both sides):')
  {
    const codecSitesOf = (descriptor) => [
      [descriptor.result, 'result'],
      ...descriptor.parameters.map((entry) => [entry.codec, `parameter ${entry.name}`]),
    ]
    const formAudit = (descriptors) => {
      const createMissing = []
      const keySetBad = []
      const parseBad = []
      for (const descriptor of descriptors) {
        for (const [codec, subject] of codecSitesOf(descriptor)) {
          if (typeof codec?.create !== 'function') { createMissing.push(`${descriptor.id} ${subject}`); continue }
          const keys = Object.keys(codec).sort().join(',')
          if (keys !== 'create,mode,typeSymbol') { keySetBad.push(`${descriptor.id} ${subject} keys=[${keys}]`); continue }
          if (typeof codec.create().parse !== 'function') parseBad.push(`${descriptor.id} ${subject}`)
        }
      }
      return { createMissing, keySetBad, parseBad }
    }
    const serverForm = formAudit(ROUTER_DESCRIPTORS)
    // 诊断优先（§4 惯例同法——check() 不消费第三参，失败清单 MUST 先打）：
    if (serverForm.createMissing.length > 0) console.error(`  detail  服务端 codec.create 缺失位: ${JSON.stringify(serverForm.createMissing)}`)
    if (serverForm.keySetBad.length > 0) console.error(`  detail  服务端 codec 键集异常位: ${JSON.stringify(serverForm.keySetBad)}`)
    if (serverForm.parseBad.length > 0) console.error(`  detail  服务端 create() 返回值无 .parse 位: ${JSON.stringify(serverForm.parseBad)}`)
    check(`服务端 19 条描述子 result+parameter codec 全部 create 为函数（新树 validateCodec :565 判别面）`,
      serverForm.createMissing.length === 0, { createMissing: serverForm.createMissing })
    check('服务端 codec 键集恰为 {create,mode,typeSymbol}（旧 schema 键零残留——P5 禁止新旧并存）',
      serverForm.keySetBad.length === 0, { keySetBad: serverForm.keySetBad })
    check('服务端 codec.create() 返回值 .parse 可调（schemastery 对象不变，惰性包装）',
      serverForm.parseBad.length === 0, { parseBad: serverForm.parseBad })
    const clientForm = formAudit(clientDescriptors)
    if (clientForm.createMissing.length > 0) console.error(`  detail  客户端 codec.create 缺失位: ${JSON.stringify(clientForm.createMissing)}`)
    if (clientForm.keySetBad.length > 0) console.error(`  detail  客户端 codec 键集异常位: ${JSON.stringify(clientForm.keySetBad)}`)
    if (clientForm.parseBad.length > 0) console.error(`  detail  客户端 create() 返回值无 .parse 位: ${JSON.stringify(clientForm.parseBad)}`)
    check('客户端（$mount 浏览器包）同三判据全过（镜像同形）',
      clientForm.createMissing.length === 0 && clientForm.keySetBad.length === 0 && clientForm.parseBad.length === 0,
      { createMissing: clientForm.createMissing, keySetBad: clientForm.keySetBad, parseBad: clientForm.parseBad })
    // schema 身份锚（服务侧可核）：create() 必须交回同一模块级 wireCodecs 对象
    // ——「schema 对象不变」的直接证据（statExport 请求/结果双锚）。
    const statsExportDescriptor = ROUTER_DESCRIPTORS.find((descriptor) => descriptor.id === 'dsh-agent-router#router/statsExport')
    const statsExportParamCodec = statsExportDescriptor?.parameters?.[0]?.codec
    const statsExportResultCodec = statsExportDescriptor?.result
    check('create() 交回同一 wireCodecs 对象（statsExport 请求/结果身份恒等——schema 不变仅包装）',
      typeof statsExportParamCodec?.create === 'function' && typeof statsExportResultCodec?.create === 'function'
      && statsExportParamCodec.create() === wireCodecs.statsExportRequest
      && statsExportResultCodec.create() === wireCodecs.statsExportResult)
  }

  // ── 6. ARCH-005 A2 验收①（强形态优先）：真实新树 typert-registry 实跑双通道校验。
  //      解析本机 0.2.0 宿主全局树（host-contract.mjs 同款候选链首段：DSH_HOST_SOURCE
  //      → DSH_HOST_PACKAGES → APPDATA npm-global——次序对齐 host-contract :468-469，
  //      双 env 同设时两守卫解析同一棵树），命中则 import 真实
  //      TypertRegistry，19 条描述子过服务端 register + 客户端 remotes.register
  //      （$mount 同一校验链）双通道（validateInvocation→validateCodec 全真码），
  //      并附旧形态负控：真树对 `{schema}` 裸形态必须 throw :565 原文——
  //      即 HD-003 根因的机器复演。树缺失则可见 skip（BR-03：门控不硬依赖
  //      宿主在场——先例 host-contract S3/S7 skip 面；本机 CI 权威树在位）。
  console.log('ARCH-005 A2: real-tree typert-registry validation (host 0.2.0-rc.2):')
  {
    const hostCandidates = []
    if (process.env.DSH_HOST_SOURCE) hostCandidates.push({ root: process.env.DSH_HOST_SOURCE, origin: 'DSH_HOST_SOURCE' })
    if (process.env.DSH_HOST_PACKAGES) hostCandidates.push({ root: process.env.DSH_HOST_PACKAGES, origin: 'DSH_HOST_PACKAGES' })
    if (process.env.APPDATA) hostCandidates.push({ root: join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'), origin: 'APPDATA npm-global' })
    const hostHit = hostCandidates.find(({ root }) => existsSync(join(root, 'dsh-typert-registry', 'lib', 'index.js')))
    if (!hostHit) {
      console.log('  skip  真树校验（@deepseek-ai/dsh-typert-registry 不在本机候选链——§5 形态判据已覆盖；本判据在有宿主树的机器/CI 上生效）')
    } else {
      const { TypertRegistry } = await import(pathToFileURL(join(hostHit.root, 'dsh-typert-registry', 'lib', 'index.js')).href)
      // 最小 ctx 垫片（宿主面锚定实读，P10-④——非按心智模型伪造）：
      // ① `reflect.provide(name, self, check)`——cordis Service 构造尾调用
      //   （宿主树 @deepseek-ai/cordis lib/index.js:1782，TypertRegistry
      //   经 `super(ctx,"typert")` :359-360 触达）；
      // ② `effect(gen, label)`——register 尾部（dsh-typert-registry
      //   lib/index.js:398 服务端 / :152 客户端；校验先行，effect 在后——
      //   本垫片跑首个 next() 提交挂载后返回哑 disposer）；
      // ③ `logger.warn`——observer 失败回调（:352-357；register 路径不触达）。
      // 被测宿主面（validatePackage/validateSchemas/validateInvocation/
      // validateCodec/endpoint+id 去重）**全部真码**。
      const stubCtx = {
        reflect: { provide: () => {} },
        effect: (gen) => { const it = gen(); it.next(); return () => {} },
        logger: { warn: () => {} },
      }
      let serverError = null
      try { new TypertRegistry(stubCtx).register(createHostContribution()) } catch (error) { serverError = error }
      if (serverError !== null) console.error(`  detail  真树服务端 register 异常: ${String(serverError)}`)
      check(`真树服务端 register：19 条描述子全过（validateCodec 实跑，靶子 ${hostHit.origin}）`,
        serverError === null, { error: serverError ? String(serverError) : null })

      let clientError = null
      try { new TypertRegistry(stubCtx).remotes.register({ package: 'dsh-agent-router', descriptors: clientDescriptors }) } catch (error) { clientError = error }
      if (clientError !== null) console.error(`  detail  真树客户端 remotes.register 异常: ${String(clientError)}`)
      check('真树客户端 remotes.register：浏览器侧求值描述子全过（$mount 同一校验链）',
        clientError === null, { error: clientError ? String(clientError) : null })

      // 负控（判别性自证）：旧 `{schema}` 裸形态在同一条真校验链上必须被拒
      // ——throw 文本即 HD-003 根因形态（:562-566，throw 行 :565 逐字锚定）。这同时
      // 是本套判据的「判红能力」证明：若产品码回退旧形态，上方两条通道断言将红。
      const source = ROUTER_DESCRIPTORS[0]
      const oldFormDescriptor = {
        ...source,
        parameters: source.parameters.map((entry) => ({ ...entry, codec: { mode: 'strict', typeSymbol: entry.codec.typeSymbol, schema: wireCodecs.emptyRequest } })),
        result: { mode: 'strict', typeSymbol: source.result.typeSymbol, schema: wireCodecs.catalogResult },
      }
      let negativeError = null
      try { new TypertRegistry(stubCtx).remotes.register({ package: 'dsh-agent-router-old-form-negative-control', descriptors: [oldFormDescriptor] }) } catch (error) { negativeError = error }
      const negativeRejected = negativeError !== null && String(negativeError).includes('strict codec has no create() factory')
      if (!negativeRejected) console.error(`  detail  真树负控未按预期拒旧形态（error=${negativeError === null ? 'null——未被拒' : String(negativeError)}）`)
      check('真树负控：旧 {schema} 裸形态被拒（throw 含 "strict codec has no create() factory"——HD-003 根因机器复演）',
        negativeRejected,
        { error: negativeError ? String(negativeError) : null })
    }
  }
}

console.log(failures === 0 ? `\nALL RPC SHADOW GUARD TESTS PASSED (${passed} assertions)` : `\n${failures} FAILURE(S) (${passed} passed)`)
process.exit(failures === 0 ? 0 : 1)