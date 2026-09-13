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
 * 独立入口：node tests/rpc-shadow-guard.mjs（exit 0/1）。
 */
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { ROUTER_DESCRIPTORS } from '../lib/rpc.js'
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
// tests/client-render.mjs 的加载形态（`:211`）同源，只读取值不执行 apply。
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

  // 逐条 codec 等价：**本批新增的两条**（presetDiagnostics / hostFaceDiagnostics）
  // 的请求/结果 schema **深度逐值相等**——它们是新增面，无历史包袱，MUST 与
  // lib/schemas.js 的权威形状完全相同（含 typeSymbol）；任一单侧改形状即红。
  // 既有 17 条为**历史镜像**（客户端 v 家族是服务端 schemastery 形状的**有意
  // 缩减镜像**，如 catalog 结果缺 takeoverDefaultModel/mainModelImage——深比会
  // 恒红，非本批授权面）⇒ 只判「形状声明在场且非空」（结构性在场判据）。
  const parityIds = ['dsh-agent-router#router/presetDiagnostics', 'dsh-agent-router#router/hostFaceDiagnostics']
  const serverByIdForShape = new Map(ROUTER_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor]))
  const specOf = (node) => (node && node.spec ? node.spec : node)
  const codecMismatches = []
  for (const id of parityIds) {
    const clientDescriptor = clientDescriptors.find((descriptor) => descriptor.id === id)
    const serverDescriptor = serverByIdForShape.get(id)
    if (!clientDescriptor || !serverDescriptor) { codecMismatches.push(`${id}: missing`); continue }
    const same = JSON.stringify(specOf(clientDescriptor.result.schema)) === JSON.stringify(specOf(serverDescriptor.result.schema))
      && clientDescriptor.result.typeSymbol === serverDescriptor.result.typeSymbol
      && JSON.stringify(specOf(clientDescriptor.parameters[0].codec.schema)) === JSON.stringify(specOf(serverDescriptor.parameters[0].codec.schema))
      && clientDescriptor.parameters[0].codec.typeSymbol === serverDescriptor.parameters[0].codec.typeSymbol
    if (!same) codecMismatches.push(id)
  }
  check('新增两条（presetDiagnostics/hostFaceDiagnostics）请求+结果 codec 深度等价 lib/schemas.js 权威形状（typeSymbol 含内）',
    codecMismatches.length === 0, { codecMismatches })
  check('全部客户端 descriptor 结果/参数 codec 声明在场（结构性在场判据，防静默丢 codec）',
    clientDescriptors.length > 0 && clientDescriptors.every((descriptor) =>
      descriptor.result && typeof descriptor.result.mode === 'string' && !!descriptor.result.schema
      && (descriptor.parameters ?? []).length > 0
      && descriptor.parameters.every((entry) => entry.wire === entry.name && !!entry.codec && !!entry.codec.schema)))
}

console.log(failures === 0 ? `\nALL RPC SHADOW GUARD TESTS PASSED (${passed} assertions)` : `\n${failures} FAILURE(S) (${passed} passed)`)
process.exit(failures === 0 ? 0 : 1)