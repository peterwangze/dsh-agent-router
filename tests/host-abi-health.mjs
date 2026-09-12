/**
 * EVO-019 宿主面健康守护（ARCH-004 设计 §10 B1 批：host-abi 骨架 + 诊断环形）。
 *
 * 覆盖面（任务验收判别项逐一对应）：
 * 1. noteHostDiag 通用诊断环形有界判别（presetDiag 同构泛化，§6.1——写入
 *    >64 条 → 恰好保留 64，最新保留；字段白名单 + 截断 + JSON 安全）。
 * 2. probe 惰性机制（§7.1「绝不进渲染路径」的机制面）：faceHealthSnapshot
 *    纯读缓存零 probe 调用；runFaceProbes 是唯一 probe 触发器；状态变化才
 *    入环形（首跑基线静默）；probe 抛错 fail-safe 降级不外泄。
 * 3. 客户端 render 期零 probe 判别（§6.1 判别锚点，源判别先例 fix-029 C4 /
 *    fix-031 G-H）：hostFaceDiagnostics 调用点唯一且位于 useEffect 内、
 *    绝不进 2s 轮询（D1-10 纪律）；健康面板渲染体零 remote 调用。
 * 4. hostVersionsOf 版本遥测 + 降级（'unknown'，§4.3 域 6）；HOST_ROUTE_*
 *    常量 re-export 值级锚定权威源（fix-031 G14 先例）。
 * 5. router/hostFaceDiagnostics RPC 全链形状（描述符 + 网关绑定契约 +
 *    strict wire codec 通过 + FaceHealth 形状）。
 * 6. 域骨架 probe 真实性抽样（client-remotes / llm-selection / ctx-services /
 *    events / inject-manifest——骨架纪律：真实探测行为，禁 TODO 存根）。
 * 7. EVO-020（ARCH-004 B2 域批）：createClientRemotes 降级语义（面缺失 →
 *    host-face-missing 降级信封 / 形状漂移 → host-face-shape / 调用被拒 →
 *    host-face-call；throw 语义已废）+ 浏览器包镜像行为 parity（client.js
 *    无法 import Node ESM——镜像纪律，漂移即红）+ P5 残留 grep + 域 5
 *    noteInjectFaceGaps（apply 时 inject 缺面诊断）。
 * 8. EVO-022（ARCH-004 B4 ctx-services 域批）：service.js/host-route.js
 *    24 处散点切换后的消费点分级白名单快照（lib/*.js 非 host-abi 的裸
 *    ctx.get 精确计数——越界新增即红）+ 八项累积绑定判别（P2-2 常量权威
 *    翻转 version.js 单点无环 / P3-5 RPC 供数平移 service.js 类方法 /
 *    F-1 agentPresetsServiceOf 归 ctx-services 归并单点 / F-2 形状降级
 *    边缘显式降级 + noteHostDiag / F-3 modelDirectories 缺面短码 + 诊断 /
 *    F-6 HostHealthCard faces 按名去重 / probeLlmAdapterFace 三方法并集）。
 * 9. EVO-023（ARCH-004 B5 events 域批）：域管五事件清单（MANAGED_EVENTS，
 *    W-3 收窄——scoped 钩子保留直订）+ 转发事件白名单双检（静态：插件订阅
 *    事件名字面量 ⊆ FORWARDED_EVENT_ALLOWLIST；运行时：白名单外订阅即拒绝 +
 *    诊断——D-2 死订阅机器防线）+ 共享 listener 聚合（跨调用同事件名单宿主
 *    listener / 单模块卸载摘除自身 consumer / 异步 consumer await 语义）+
 *    浏览器镜像值级 parity + R-5 Node 侧注册表接线（11 ctx 服务面 + 2
 *    llm-selection 面 → faces 生产非空；面板打开复检规则：全绿纯缓存读、
 *    非全绿一次失败驱动复检）+ R-3（F-6 HostHealthCard faces 去重行为断言）+
 *    R-1 锚清扫复核（旧行号式锚零残留、函数名式锚在位）。
 *
 * 红演示证据（任务验收 2）：实现前自然红（模块缺失套件失败）+ 绿后判别红
 * （R1：HOST_DIAG_LIMIT 临时 64→128 → 环形有界断言红；R2：HostHealthCard
 * 渲染体内临时注入第二处 .hostFaceDiagnostics( 调用 → render 期零 probe
 * 判别红）——复原后全绿。B4 追加：临时在 service.js 加一处裸
 * ctx.get('sessionController') → §8a 白名单快照红（分级放行越界）。B5 追加：
 * ① 临时把 client.js 页面订阅改回死名 credentials/updated → §9b 静态比对 +
 * §9c 运行时拒绝红（复原双绿）；② 实现前 §9 组全红（MANAGED_EVENTS 未导出 /
 * 白名单未启用 / faces 空注册表 / R-1 锚未清扫）——见任务结论 RED 记录。
 *
 * 独立入口：node tests/host-abi-health.mjs（exit 0/1）。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { ROUTER_DESCRIPTORS } from '../lib/rpc.js'
import { RouterService } from '../lib/service.js'
import { wireCodecs } from '../lib/schemas.js'
// B4 ①（P2-2）：HOST_ROUTE_* 权威源 = version.js 单点（host-route.js 改
// re-export 消费面——本 import 锚定权威侧，host-route 侧 re-export 由 §8e 锁定）。
import { HOST_ROUTE_NS, HOST_ROUTE_PROVIDER, HOST_ROUTE_REF, HOST_ROUTE_TICK_MS } from '../lib/host-abi/version.js'
import * as hostAbi from '../lib/host-abi/index.js'

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  HOST_DIAG_LIMIT, noteHostDiag, hostDiagnostics, registerFaceProbes, faceHealthSnapshot, runFaceProbes,
  packageVersionOf, hostVersionsOf,
  CLIENT_REMOTE_FACES, probeRemoteFace, clientRemotesHealth, createClientRemotes,
  probeLlmAdapterFace, probeSessionSelectFace,
  serviceFaceOf, agentsRegistryOf, llmOf, ctxServiceFaceProbes,
  FORWARDED_EVENT_ALLOWLIST, MANAGED_EVENTS, isForwardedEvent, subscribeEvents, armEventGate,
  FIBER_INJECT, CLIENT_PACKAGE_INJECT, probeFiberInjectFaces, noteInjectFaceGaps,
} = hostAbi

let failures = 0
let passed = 0
const check = (label, condition, detail) => {
  if (condition) { passed++; console.log(`  ok  ${label}`) }
  else { failures++; console.error(`FAIL  ${label}${detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ''}`) }
}
const FACE_STATES = ['ok', 'degraded', 'missing']

// ── 1. 诊断环形有界（§6.1 / 任务验收「环形有界判别」）────────────────────
console.log('host diag ring bounded (noteHostDiag):')
{
  for (let index = 0; index < HOST_DIAG_LIMIT + 16; index++) noteHostDiag({ kind: `ring-fill-${index}` })
  const entries = hostDiagnostics().entries
  check('ring keeps exactly HOST_DIAG_LIMIT entries after >64 writes', entries.length === HOST_DIAG_LIMIT && HOST_DIAG_LIMIT === 64)
  check('ring keeps the NEWEST entries (overflow dropped from head)', entries[0].kind === `ring-fill-${16}` && entries[entries.length - 1].kind === `ring-fill-${HOST_DIAG_LIMIT + 15}`)
  check('entries carry timestamps and parse as lossless JSON', entries.every((entry) => typeof entry.at === 'number' && typeof entry.kind === 'string') && typeof JSON.stringify(entries) === 'string')
  // 字段白名单 + 截断 + 恶性输入防御（presetDiag :127-141 纪律同构）。
  noteHostDiag({ kind: 'shape', face: 'f'.repeat(300), consumer: 'c'.repeat(300), code: 'x'.repeat(300), detail: 'd'.repeat(500), poison: { nope: true } })
  noteHostDiag(null)
  noteHostDiag({ kind: () => {}, face: { weird: 1 } })
  const tail = hostDiagnostics().entries.slice(-3)
  check('field whitelist truncates (face/consumer ≤64, code ≤48, detail ≤160) and never throws', tail[0].face.length === 64 && tail[0].consumer.length === 64 && tail[0].code.length === 48 && tail[0].detail.length === 160 && !('poison' in tail[0]))
  check('hostile/absent entries degrade to safe shapes instead of throwing', tail[1].kind === '?' && tail[2].kind === '?' && !('face' in tail[2]) && typeof JSON.stringify(tail) === 'string')
  check('snapshot returns a copy (caller mutation cannot corrupt the ring)', (() => { const snap = hostDiagnostics().entries; snap.push({ at: 0, kind: 'mutated' }); return hostDiagnostics().entries.length === HOST_DIAG_LIMIT })())
}

// ── 2. probe 惰性机制：快照零 probe，runFaceProbes 唯一触发器（§7.1）──────
console.log('probe laziness (render reads cache, never probes):')
{
  let probeCalls = 0
  registerFaceProbes([
    { name: 'stub:ok', probe: () => { probeCalls += 1; return { state: 'ok' } } },
    { name: 'stub:degraded', probe: () => { probeCalls += 1; return { state: 'degraded', detail: 'host-face-shape: listProviders' } } },
    { name: 'stub:throws', probe: () => { probeCalls += 1; throw new Error('probe exploded') } },
  ])
  const before = probeCalls
  for (let index = 0; index < 5; index += 1) faceHealthSnapshot()
  check('faceHealthSnapshot is a pure cache read (0 probe calls across repeated reads)', probeCalls === before)
  const baselineLen = hostDiagnostics().entries.length
  const faces = runFaceProbes(null)
  check('runFaceProbes runs each registered probe exactly once', probeCalls === before + 3 && faces.length === 3)
  check('FaceHealth shape: {name, state ∈ ok|degraded|missing, detail?string}', faces.every((face) => typeof face.name === 'string' && FACE_STATES.includes(face.state) && (face.detail === undefined || typeof face.detail === 'string')))
  check('probe throw degrades fail-safe (never escapes; detail carries reason)', faces.find((face) => face.name === 'stub:throws').state === 'degraded' && String(faces.find((face) => face.name === 'stub:throws').detail).includes('probe exploded'))
  check('first run establishes baseline silently (no ring noise without a prior state)', hostDiagnostics().entries.length === baselineLen)
  registerFaceProbes([{ name: 'stub:ok', probe: () => { probeCalls += 1; return { state: 'missing', detail: 'host-face-missing' } } }])
  const changed = runFaceProbes(null)
  const changeEntries = hostDiagnostics().entries.filter((entry) => entry.kind === 'face-state')
  check('subsequent state CHANGES are noted into the ring (face + code = new state)', changed.find((face) => face.name === 'stub:ok').state === 'missing' && changeEntries.length === 1 && changeEntries[0].face === 'stub:ok' && changeEntries[0].code === 'missing')
  const cacheReads = probeCalls
  for (let index = 0; index < 3; index += 1) faceHealthSnapshot()
  check('snapshot after run still never probes (cached FaceHealth)', probeCalls === cacheReads)
}

// ── 3. 客户端 render 期零 probe（源判别——§6.1 判别锚点）──────────────────
console.log('client render-phase zero-probe (source discriminators):')
{
  const source = readFileSync(join(ROOT_DIR, 'lib', 'client.js'), 'utf8')
  const callSites = source.match(/\.hostFaceDiagnostics\(/g) ?? []
  check('exactly one hostFaceDiagnostics call site in client bundle', callSites.length === 1)
  const callPos = source.indexOf('.hostFaceDiagnostics(')
  const effectPos = source.lastIndexOf('useEffect(', callPos)
  check('the call site lives inside a useEffect (never in render body)', effectPos !== -1 && source.slice(effectPos, callPos).includes('ready') && !source.slice(effectPos, callPos).includes('return el('))
  const depsPos = source.indexOf('}, [', callPos)
  const effectWindow = source.slice(effectPos, depsPos)
  check('effect stores the snapshot into state (setHostHealth) — render reads state only', effectWindow.includes('setHostHealth('))
  check('one-shot snapshot is NOT wired into the 2s poll loop (D1-10 discipline: no setInterval in the effect window)', !effectWindow.includes('setInterval'))
  const cardPos = source.indexOf('function HostHealthCard')
  const cardEnd = source.indexOf('\n    function ', cardPos + 1)
  const cardBody = source.slice(cardPos, cardEnd === -1 ? undefined : cardEnd)
  check('HostHealthCard render body contains zero remote/RPC calls (pure snapshot render)', !cardBody.includes('remote(') && !cardBody.includes('.hostFaceDiagnostics(') && cardBody.includes('hostHealth.faces'))
  const mirror = readFileSync(join(ROOT_DIR, 'tests', 'served-client.js'), 'utf8')
  check('served-client mirror stays byte-identical to lib/client.js', mirror === source)
}

// ── 4. 版本遥测 + 降级（§4.3 域 6 / §5.3-3）───────────────────────────────
console.log('host version telemetry:')
{
  check('packageVersionOf degrades to unknown for unresolvable packages', packageVersionOf('@deepseek-ai/dsh-agent-router-no-such-package') === 'unknown')
  const versions = hostVersionsOf()
  check('hostVersionsOf returns the three dependency keys as strings (env-agnostic values)', typeof versions.llm === 'string' && typeof versions.tools === 'string' && typeof versions.typertProtocol === 'string' && Object.keys(versions).length === 3)
  check('installed dev graph resolves real versions (lockfile-synced deps readable)', versions.llm !== 'unknown' && versions.tools !== 'unknown' && versions.typertProtocol !== 'unknown')
  check('HOST_ROUTE_* stay value-anchored to the version.js single point (B4 authority flip; host-route re-export + barrel stay equal — fix-031 G14 precedent)', hostAbi.HOST_ROUTE_NS === HOST_ROUTE_NS && hostAbi.HOST_ROUTE_PROVIDER === HOST_ROUTE_PROVIDER && hostAbi.HOST_ROUTE_REF === HOST_ROUTE_REF && hostAbi.HOST_ROUTE_TICK_MS === HOST_ROUTE_TICK_MS)
}

// ── 5. router/hostFaceDiagnostics RPC 全链（§6.2 三合一形状）──────────────
console.log('router/hostFaceDiagnostics RPC contract:')
{
  const descriptor = ROUTER_DESCRIPTORS.find((item) => item.id === 'dsh-agent-router#router/hostFaceDiagnostics')
  check('descriptor registered (service/namespace router, method hostFaceDiagnostics, direct invocation)', !!descriptor && descriptor.service === 'router' && descriptor.namespace === 'router' && descriptor.method === 'hostFaceDiagnostics' && descriptor.invocation.kind === 'direct')
  check('result codec is the strict wire schema (wireCodecs.hostFaceDiagnosticsResult)', descriptor?.result?.schema === wireCodecs.hostFaceDiagnosticsResult)
  // 网关绑定契约（rpc-shadow-guard 同语义：implementation ?? method 反射可调用）。
  const service = new RouterService(new Context())
  service.attach({ get: () => ({ enabled: true, agents: {} }) })
  const binding = Reflect.get(service, descriptor.implementation ?? descriptor.method)
  check('gateway binding contract: Reflect.get(service, implementation ?? method) is callable', typeof binding === 'function')
  const payload = binding.call(service)
  check('payload shape { hostVersions, faces: FaceHealth[], diag: entries[] }', !!payload && typeof payload.hostVersions === 'object' && Array.isArray(payload.faces) && Array.isArray(payload.diag) && payload.faces.every((face) => typeof face.name === 'string' && FACE_STATES.includes(face.state)))
  check('payload passes the strict wire codec (gateway result validation)', !!wireCodecs.hostFaceDiagnosticsResult.parse(payload))
  check('RPC serves exactly the cached FaceHealth snapshot (read-only semantics, no probe triggering)', JSON.stringify(payload.faces) === JSON.stringify(faceHealthSnapshot()) && typeof payload.hostVersions.llm === 'string')
}

// ── 6. 域骨架 probe 真实性抽样（骨架纪律：真实行为，无 TODO 存根）─────────
console.log('domain skeleton probes (real probing behavior):')
{
  // 6a. client-remotes：存在性 + 方法形状（§4.3 域 1——FIX-027 双形态解析）。
  const remoteFace = { listProviders: () => {}, listConfigurableProviders: () => {}, discoverModels: () => {} }
  const ctxFull = { get: (name) => (name === 'remote.llm' ? remoteFace : undefined), remote: { llm: remoteFace } }
  const ctxMissing = { get: () => undefined, remote: {} }
  const ctxShape = { get: (name) => (name === 'remote.llm' ? { listProviders: () => {} } : undefined), remote: {} }
  check('probeRemoteFace: face present + full method shape → ok', probeRemoteFace(ctxFull, 'llm').state === 'ok' && probeRemoteFace(ctxFull, 'llm').name === 'llm')
  check('probeRemoteFace: namespace absent → missing + host-face-missing code', probeRemoteFace(ctxMissing, 'llm').state === 'missing' && probeRemoteFace(ctxMissing, 'llm').detail.includes('host-face-missing'))
  check('probeRemoteFace: method shape drift → degraded + host-face-shape code', probeRemoteFace(ctxShape, 'llm').state === 'degraded' && probeRemoteFace(ctxShape, 'llm').detail.includes('host-face-shape'))
  check('CLIENT_REMOTE_FACES covers the five FIX-028 namespaces with method shape contracts', ['llm', 'settings', 'credentials', 'agentPresets', 'session'].every((name) => Array.isArray(CLIENT_REMOTE_FACES[name]) && CLIENT_REMOTE_FACES[name].length > 0))
  check('clientRemotesHealth probes every registry face', clientRemotesHealth(ctxFull).length === Object.keys(CLIENT_REMOTE_FACES).length && clientRemotesHealth(ctxFull).every((face) => FACE_STATES.includes(face.state)))
  // 6b. llm-selection：适配器注册面 + 会话选择面（§4.3 域 2；宿主锚点
  //     dsh-api-session-controller index.js:605 selectModel）。
  check('probeSessionSelectFace: sessionController.selectModel present → ok', probeSessionSelectFace({ get: (name) => (name === 'sessionController' ? { selectModel: async () => ({ selected: {} }) } : undefined) }).state === 'ok')
  check('probeSessionSelectFace: face absent → missing (B3 migration target stays single-form)', probeSessionSelectFace({ get: () => undefined }).state === 'missing')
  // B4 ⑥（EVO-019 P2-1 终闭环）：probe 三方法并集（registerAdapter/
  // registration/listModels——与 llmFaceOf LLM_FACE_METHODS 同锚 LlmRuntime）。
  check('probeLlmAdapterFace: 三方法并集形状检查（缺 registration → degraded；桩同步收口）',
    probeLlmAdapterFace({ get: (name) => (name === 'llm' ? { registerAdapter: () => {}, registration: () => {}, listModels: async () => [] } : undefined) }).state === 'ok'
    && probeLlmAdapterFace({ get: (name) => (name === 'llm' ? { registerAdapter: () => {}, listModels: async () => [] } : undefined) }).state === 'degraded'
    && probeLlmAdapterFace({ get: (name) => (name === 'llm' ? { registerAdapter: () => {} } : undefined) }).state === 'degraded')
  // 6c. ctx-services：通用 serviceFaceOf + 具名访问器（§4.3 域 3）。
  const agentsRegistry = { get: () => ({}) }
  const resolved = serviceFaceOf({ get: (name) => (name === 'agents' ? agentsRegistry : undefined) }, 'agents', ['get'])
  const missing = serviceFaceOf({ get: () => undefined }, 'agents', ['get'])
  check('serviceFaceOf resolves {face, probe} with method shape verification', resolved.face === agentsRegistry && resolved.probe.state === 'ok' && missing.face === null && missing.probe.state === 'missing')
  check('named accessor delegates to serviceFaceOf (agentsRegistryOf)', agentsRegistryOf({ get: (name) => (name === 'agents' ? agentsRegistry : undefined) }) === agentsRegistry && agentsRegistryOf({ get: () => undefined }) === null)
  // 6d. events：共享单 listener + fail-safe 分发 + gate 位 + 白名单镜像。
  const listeners = new Map()
  const eventCtx = { on: (event, handler) => { const list = listeners.get(event) ?? []; list.push(handler); listeners.set(event, list); return () => { listeners.set(event, (listeners.get(event) ?? []).filter((item) => item !== handler)) } } }
  let aCalls = 0
  let bCalls = 0
  const disposeAll = subscribeEvents(eventCtx, [
    { event: 'settings/updated', consumer: 'consumer-a', gate: { kind: 'settings-pass', key: 'router' }, handler: () => { aCalls += 1; throw new Error('handler exploded') } },
    { event: 'settings/updated', consumer: 'consumer-b', handler: () => { bCalls += 1 } },
  ])
  check('subscribeEvents dedupes to ONE shared ctx.on listener per event name (D1-9)', listeners.get('settings/updated').length === 1)
  for (const handler of listeners.get('settings/updated')) handler()
  check('handler throw is contained (fail-safe) and sibling consumers still run', aCalls === 1 && bCalls === 1)
  check('handler failure is ring-observed (P8: event-handler-error)', hostDiagnostics().entries.some((entry) => entry.kind === 'event-handler-error' && entry.consumer === 'consumer-a'))
  armEventGate('settings-pass', 'router', true)
  for (const handler of listeners.get('settings/updated')) handler()
  check('armed gate suppresses the gated consumer only (F-1 generalized)', aCalls === 1 && bCalls === 2 && hostDiagnostics().entries.some((entry) => entry.kind === 'event-gated'))
  armEventGate('settings-pass', 'router', false)
  for (const handler of listeners.get('settings/updated')) handler()
  check('disarmed gate resumes dispatch', aCalls === 2 && bCalls === 3)
  disposeAll()
  check('disposeAll removes the shared listeners', (listeners.get('settings/updated') ?? []).length === 0)
  check('FORWARDED_EVENT_ALLOWLIST mirrors host API_REMOTE_FORWARDED_EVENTS (D-2 anchor: reference-updated in, dead name out)', FORWARDED_EVENT_ALLOWLIST.includes('credentials/reference-updated') && !FORWARDED_EVENT_ALLOWLIST.includes('credentials/updated') && FORWARDED_EVENT_ALLOWLIST.length === 19)
  // 6e. inject-manifest：单一事实源 + fiber 面探测（§4.3 域 5）。
  check('FIBER_INJECT is the client.js fiber inject mirror (single source, B2/B6 static comparison)', (() => {
    const declared = readFileSync(join(ROOT_DIR, 'lib', 'client.js'), 'utf8').match(/const inject = \[([^\]]+)\]/)
    const names = declared ? [...declared[1].matchAll(/'([^']+)'/g)].map((match) => match[1]) : []
    return JSON.stringify(names) === JSON.stringify(FIBER_INJECT)
  })())
  check('CLIENT_PACKAGE_INJECT mirrors package.json dsh.client.inject (D1-1 dead line stays gone)', JSON.stringify(JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8')).dsh?.client?.inject) === JSON.stringify(CLIENT_PACKAGE_INJECT) && !CLIENT_PACKAGE_INJECT.includes('@deepseek-ai/dsh-client-runtime'))
  const fiberCtx = { get: (name) => (name === 'remote.llm' ? {} : undefined) }
  const fiberHealth = probeFiberInjectFaces(fiberCtx)
  check('probeFiberInjectFaces probes every FIBER_INJECT face (ok/missing per resolution)', fiberHealth.length === FIBER_INJECT.length && fiberHealth.find((face) => face.name === 'remote.llm').state === 'ok' && fiberHealth.find((face) => face.name === 'modelDirectories').state === 'missing')
  // 6f. 桶：消费者统一入口可达（空桶零逻辑，§4.1）。
  check('host-abi barrel re-exports the domain surface (single consumer entry)', typeof noteHostDiag === 'function' && typeof hostVersionsOf === 'function' && typeof probeRemoteFace === 'function' && typeof subscribeEvents === 'function' && typeof serviceFaceOf === 'function' && Array.isArray(FIBER_INJECT))
}

// ── 7. EVO-020 B2：createClientRemotes 降级语义 + 浏览器镜像 parity（§4.3 域 1）──
console.log('B2 client-remotes domain (degraded semantics + browser mirror parity):')
{
  // 7a. 权威单点（lib/host-abi/client-remotes.js）：throw 语义 → 降级信封。
  const okLlm = {
    listProviders: async () => ({ ok: true, value: [{ id: 'gateway', name: 'Gateway' }] }),
    listConfigurableProviders: async () => ({ ok: true, value: [{ provider: 'gateway', displayName: 'Gateway', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'gateway'], declared: true }] }),
    discoverModels: async () => ({ ok: true, value: [{ id: 'm-a' }] }),
  }
  const okSession = {
    modelCatalog: async () => ({ ok: true, value: { default: { provider: 'deepseek-official', model: 'deepseek-v4-pro' }, routableProviders: ['gateway'], groups: [{ id: 'gateway', models: [{ id: 'old-m', name: 'Old M' }] }], failures: [] } }),
    selectModel: async (payload) => ({ ok: true, value: { selected: { provider: payload.provider } } }),
  }
  const okSettings = { describe: async () => ({ ok: true, value: { writable: true, hasDocument: true, namespaces: [] } }), mutate: async () => ({ ok: true, value: { ns: 'llm-pi-ai' } }) }
  const okCredentials = { describe: async (refs) => ({ ok: true, value: Object.fromEntries((refs ?? []).map((ref) => [ref, { configured: false }])) }), set: async () => ({ ok: true, value: undefined }), unset: async () => ({ ok: true, value: undefined }) }
  const okPresets = { list: async () => ({ ok: true, value: { presets: [], authorable: true } }) }
  const fullCtx = { get: (name) => (name === 'remote.llm' ? okLlm : name === 'remote.session' ? okSession : name === 'remote.settings' ? okSettings : name === 'remote.credentials' ? okCredentials : name === 'remote.agentPresets' ? okPresets : undefined), remote: {} }
  const remotes = createClientRemotes(fullCtx)
  check('B2: createClientRemotes(ctx) → { api, health() }（§4.3 唯一入口签名）', !!remotes && typeof remotes.api === 'object' && remotes.api !== null && typeof remotes.health === 'function')
  const providersEnvelope = await remotes.api.llm.providers({})
  check('B2: ok 路径信封与 FIX-028 旧形状逐字一致（{result:{ok,value}}——消费点零改动承诺）', providersEnvelope.result.ok === true && Array.isArray(providersEnvelope.result.value.providers) && providersEnvelope.result.value.providers.length === 1 && providersEnvelope.result.value.providers[0].provider === 'gateway' && providersEnvelope.result.value.providers[0].active === true && providersEnvelope.result.value.providers[0].declared === true)
  const modelsEnvelope = await remotes.api.llm.models({})
  check('B2: llm.models 映射 session.modelCatalog groups/failures（行为零回退）', modelsEnvelope.result.ok === true && modelsEnvelope.result.value.groups[0].id === 'gateway' && modelsEnvelope.result.value.failures.length === 0)
  const selectEnvelope = await remotes.api.sessions.selectModel({ sessionId: 's1', provider: 'gateway', model: 'old-m' })
  check('B2: sessions.selectModel 直通信封（envelopeOf 路径零回退）', selectEnvelope.result.ok === true && selectEnvelope.result.value.selected.provider === 'gateway')
  // 面缺失（任务验收场景：stub 掉 remote.llm）——同 fixture 其余四面在。
  const mixedCtx = { get: (name) => ({ 'remote.settings': okSettings, 'remote.credentials': okCredentials, 'remote.agentPresets': okPresets, 'remote.session': okSession })[name], remote: {} }
  const mixedRemotes = createClientRemotes(mixedCtx)
  const degradedProviders = await mixedRemotes.api.llm.providers({})
  check('B2: 面缺失 → 降级信封 {ok:false, error.code:host-face-missing}（throw 语义已废）', degradedProviders.result.ok === false && degradedProviders.result.error.code === 'host-face-missing' && typeof degradedProviders.result.error.message === 'string' && degradedProviders.result.error.message.includes('llm'))
  const degradedDiscover = await mixedRemotes.api.llm.discoverModels({ settingsNs: 'llm-pi-ai' })
  check('B2: 缺失面的每个方法都返回降级信封（degraded face——非单方法特例）', degradedDiscover.result.ok === false && degradedDiscover.result.error.code === 'host-face-missing')
  const siblingSettings = await mixedRemotes.api.settings.describe({})
  const siblingPresets = await mixedRemotes.api.agentPresets.list({})
  check('B2: 单面降级不波及兄弟面——settings/agentPresets 照常 ok（其余面正常）', siblingSettings.result.ok === true && siblingPresets.result.ok === true)
  // 形状漂移：面在而方法缺 → host-face-shape（BR-02 第一层防线语义化）。
  const shapeCtx = { get: (name) => (name === 'remote.llm' ? { listProviders: async () => ({ ok: true, value: [] }) } : name === 'remote.session' ? okSession : undefined), remote: {} }
  const shapeEnvelope = await createClientRemotes(shapeCtx).api.llm.providers({})
  check('B2: 形状漂移 → host-face-shape（error.message 列缺失方法名）', shapeEnvelope.result.ok === false && shapeEnvelope.result.error.code === 'host-face-shape' && shapeEnvelope.result.error.message.includes('listConfigurableProviders'))
  // 调用被拒 → host-face-call（透传宿主错误消息，绝不外泄击穿）。
  const rejectCtx = { get: (name) => (name === 'remote.llm' ? { listProviders: async () => { throw new Error('gateway exploded') }, listConfigurableProviders: async () => ({ ok: true, value: [] }) } : undefined), remote: {} }
  const rejectEnvelope = await createClientRemotes(rejectCtx).api.llm.providers({})
  check('B2: 宿主调用被拒 → host-face-call 信封（透传宿主错误消息）', rejectEnvelope.result.ok === false && rejectEnvelope.result.error.code === 'host-face-call' && rejectEnvelope.result.error.message.includes('gateway exploded'))
  // health()：徽章数据源（五面探测快照）+ face-degraded 诊断轨迹（P8）。
  const mixedHealth = mixedRemotes.health()
  check('B2: health().faces 探测五命名空间——llm missing 且兄弟四面 ok（徽章数据源）', mixedHealth.faces.length === Object.keys(CLIENT_REMOTE_FACES).length && mixedHealth.faces.find((face) => face.name === 'llm').state === 'missing' && mixedHealth.faces.filter((face) => face.state === 'ok').length === 4)
  check('B2: 降级调用记 face-degraded 诊断事件（health().diag 可观测，P8）', mixedHealth.diag.some((entry) => entry.kind === 'face-degraded' && entry.face === 'remote.llm' && entry.code === 'host-face-missing' && typeof entry.at === 'number'))
  check('B2: 权威单点降级事件同步上行全局环形（noteHostDiag——RPC 可见面）', hostDiagnostics().entries.some((entry) => entry.kind === 'face-degraded' && entry.face === 'remote.llm' && entry.code === 'host-face-missing'))
  // 7b. 浏览器包镜像 parity（lib/client.js 无法 import Node ESM——镜像纪律，
  //     OAUTH_ROUTE_PROVIDER 先例；envelope/health 行为逐字段相等，漂移即红）。
  const reactStub = { createElement: () => null, useState: () => [null, () => {}], useEffect: () => {}, useCallback: (fn) => fn, useRef: () => ({ current: null }) }
  let bundlePayload = null
  new Function('window', readFileSync(join(ROOT_DIR, 'lib', 'client.js'), 'utf8'))({ __ModuleLoader__: { load: (payload) => { bundlePayload = payload } } })
  const bundleExports = bundlePayload.factory((name) => (name === 'react' ? reactStub : null))
  check('B2: 浏览器包导出 createClientRemotes 镜像（判别测试钩子先例 ModelTakeover）', typeof bundleExports.createClientRemotes === 'function')
  const mirror = bundleExports.createClientRemotes(mixedCtx)
  const mirrorProviders = await mirror.api.llm.providers({})
  check('B2 镜像 parity: 面缺失降级信封与权威单点逐字相等（JSON 级）', JSON.stringify(mirrorProviders) === JSON.stringify(degradedProviders))
  const mirrorSettings = await mirror.api.settings.describe({})
  check('B2 镜像 parity: ok 路径信封与权威单点逐字相等（消费点零改动双面锁定）', JSON.stringify(mirrorSettings) === JSON.stringify(siblingSettings))
  check('B2 镜像 parity: health().faces 与权威单点相等（探测表面同步锁定）', JSON.stringify(mirror.health().faces) === JSON.stringify(mixedRemotes.health().faces))
  const diagTrailOf = (entries) => entries.map((entry) => `${entry.kind}:${entry.face}:${entry.code ?? ''}`).join('|')
  const parityCanonical = createClientRemotes(mixedCtx)
  await parityCanonical.api.llm.providers({})
  check('B2 镜像 parity: health().diag 降级轨迹相等（kind:face:code 序列——同调用序列对照实例）', diagTrailOf(mirror.health().diag) === diagTrailOf(parityCanonical.health().diag))
  // 7c. P5：lib/client.js 内 hostApiFace 本体零残留 + 调用点已切换。
  const clientSource = readFileSync(join(ROOT_DIR, 'lib', 'client.js'), 'utf8')
  check('B2/P5: lib/client.js 内 hostApiFace 零残留（被取代路径禁止并存）', !clientSource.includes('hostApiFace'))
  check('B2/P5: apply() 调用点已切换 createClientRemotes(ctx)（api = remotes.api）', /const remotes = createClientRemotes\(ctx\)/.test(clientSource) && /const api = remotes\.api/.test(clientSource))
  check('B2/P5: 镜像实现唯一（function createClientRemotes 恰一处）', (clientSource.match(/function createClientRemotes\(/g) ?? []).length === 1)
  // 7d. 域 5：noteInjectFaceGaps——apply 时 inject 缺面诊断（不 throw 不阻断）。
  const gapCtx = { get: (name) => (name === 'remote.llm' ? {} : undefined) }
  const gapsBefore = hostDiagnostics().entries.filter((entry) => entry.kind === 'inject-face-missing').length
  const gapFaces = noteInjectFaceGaps(gapCtx)
  check('B2: noteInjectFaceGaps 探测全部 FIBER_INJECT 面并返回 FaceHealth[]', gapFaces.length === FIBER_INJECT.length && gapFaces.find((face) => face.name === 'remote.llm').state === 'ok' && gapFaces.find((face) => face.name === 'slots').state === 'missing')
  check('B2: 缺面记 inject-face-missing 入环形（apply 自检权威单点，不 throw）', hostDiagnostics().entries.filter((entry) => entry.kind === 'inject-face-missing').length === gapsBefore + (FIBER_INJECT.length - 1))
}

// ── 8. EVO-022 B4：ctx-services 域批（24 散点切换分级白名单 + 八项累积绑定）──
console.log('B4 ctx-services batch (scatter whitelist + cumulative bindings):')
{
  const readLib = (name) => readFileSync(join(ROOT_DIR, 'lib', name), 'utf8')
  const serviceSource = readLib('service.js')
  const hostRouteSource = readLib('host-route.js')
  const rpcSource = readLib('rpc.js')
  const clientSourceB4 = readLib('client.js')
  const versionSource = readFileSync(join(ROOT_DIR, 'lib', 'host-abi', 'version.js'), 'utf8')
  const llmSelectionSource = readFileSync(join(ROOT_DIR, 'lib', 'host-abi', 'llm-selection.js'), 'utf8')
  const stripComments = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (line) => line.replace(/[^\n]/g, ' '))

  // 8a. 消费点散点分级白名单（设计 §10 B4 验收：lib/*.js（非 host-abi）内
  //     裸 ctx.get 仅剩放行清单——精确计数快照，越界新增即红）。分级依据：
  //     · service.js fs/settings = 低危面直用（设计 §10 B4 白名单明文）；
  //     · wrapper/prestep/preset-defaults = B4 冻结切换范围（service.js/
  //       host-route.js 24 处）之外的遗留消费点——后续批次候选，非放行扩张；
  //     · tool.js router = 自管服务面（RouterService 为本插件注册的 ctx
  //       key，非宿主 ABI 面）；
  //     · client.js = 客户端 fiber ctx 面（B2 client-remotes/inject 域权威
  //       的浏览器镜像 + FIX-026/027 装配——remote.*/modelDirectories/
  //       conversation 不属 ctx-services 域 3 的 Node 侧服务群）。
  {
    const WHITELIST = {
      'service.js': { fs: 5, settings: 2 },
      'host-route.js': {},
      'wrapper.js': { agentDefaultModel: 1 },
      'prestep.js': { sessionProjections: 1, llm: 1 },
      'tool.js': { router: 3 },
      'preset-defaults.js': { agentDefaultModel: 1 },
      'client.js': { 'remote.*': 2, 'dynamic-inject': 1, 'remote.router': 3, conversation: 1, modelDirectories: 2 },
    }
    const diffs = []
    for (const file of readdirSync(join(ROOT_DIR, 'lib')).filter((name) => name.endsWith('.js'))) {
      const found = {}
      for (const match of stripComments(readLib(file)).matchAll(/ctx\.get\(([^)\n]*)\)/g)) {
        const argument = match[1].trim()
        const face = argument.startsWith('`remote.') ? 'remote.*' : argument === 'name' ? 'dynamic-inject' : argument.startsWith("'") ? argument.slice(1, -1) : argument
        found[face] = (found[face] ?? 0) + 1
      }
      const expected = WHITELIST[file] ?? {}
      for (const key of new Set([...Object.keys(found), ...Object.keys(expected)])) {
        if ((found[key] ?? 0) !== (expected[key] ?? 0)) diffs.push(`${file}:${key} found=${found[key] ?? 0} expected=${expected[key] ?? 0}`)
      }
    }
    check('B4 白名单: lib/*.js（非 host-abi）裸 ctx.get = 分级放行清单精确快照（24 散点已切换，越界新增即红）', diffs.length === 0, diffs.join(' | '))
    check('B4 白名单: host-route.js 零裸消费（7 处散点已切换域访问器）', !/ctx\.get\(/.test(stripComments(hostRouteSource)))
  }

  // 8b. F-2（EVO-021 R0）：形状降级边缘显式化——严格访问器 + noteHostDiag。
  {
    const goodRegistry = { get: () => ({}) }
    const shapeRegistry = { notGet: true }
    check('F-2: agents 面形状降级（.get 非函数）→ 访问器 null（旧 TypeError 被 handler catch 吞掉 → 显式降级）', agentsRegistryOf({ get: (name) => (name === 'agents' ? shapeRegistry : undefined) }) === null)
    check('F-2: 形状降级记 face-degraded 诊断事件（face=agents code=host-face-shape，P8 环形上行）', hostDiagnostics().entries.some((entry) => entry.kind === 'face-degraded' && entry.face === 'agents' && entry.code === 'host-face-shape'))
    check('F-2: 完好面照常返回本体（preset-defaults 两消费点零回退）', agentsRegistryOf({ get: (name) => (name === 'agents' ? goodRegistry : undefined) }) === goodRegistry)
    const llmPartial = { listModels: async () => [] }
    check('F-2 锚定: llmOf 存在性解析（部分形状面透传给消费点自持守卫——smoke 桩最小形状零回退锚定）', llmOf({ get: (name) => (name === 'llm' ? llmPartial : undefined) }) === llmPartial && llmOf({ get: () => undefined }) === null)
  }

  // 8c. F-1（EVO-021 R0）：agentPresetsServiceOf 归属勘正——§4.3 域 3 为准。
  {
    const ctxServices = await import('../lib/host-abi/ctx-services.js')
    const aps = ctxServices.agentPresetsServiceOf
    const apo = ctxServices.agentPresetsOf
    const presetsFace = { composedPreset: () => ({ id: 'p' }) }
    check('F-1: agentPresetsServiceOf 迁 ctx-services 域（llm-selection 域内零残留导出）', typeof aps === 'function' && !/export function agentPresetsServiceOf/.test(llmSelectionSource))
    check('F-1: 双形态解析原样（属性面优先 + ctx.get 回落 + composedPreset 函数门控 → undefined）',
      typeof aps === 'function'
      && aps({ agentPresets: presetsFace }) === presetsFace
      && aps({ get: (name) => (name === 'agentPresets' ? presetsFace : undefined) }) === presetsFace
      && aps({ agentPresets: {}, get: () => undefined }) === undefined)
    check('F-1: 与 agentPresetsOf 归并单点（同一双形态解析；访问器语义 null / 服务语义 undefined——注释成文）', typeof apo === 'function' && apo({ get: () => undefined }) === null && apo({ agentPresets: presetsFace }) === presetsFace)
    check('F-1: 桶导出面不变（消费者 preset-defaults 经桶 import 零改动）', typeof hostAbi.agentPresetsServiceOf === 'function' && hostAbi.agentPresetsServiceOf === aps)
  }

  // 8d. P3-5（EVO-019）：hostFaceDiagnostics 供数从 rpc.js 原型挂载平移
  //     service.js 正式装配（类方法），原型挂载代码删除（P5 grep 零残留）。
  {
    check('P3-5: rpc.js 原型挂载零残留（RouterService 导入与 prototype 绑定双删——代码面，注释历史表述不计）', !/RouterService|prototype\.hostFaceDiagnostics/.test(stripComments(rpcSource)))
    check('P3-5: service.js 类方法正式装配（hostFaceDiagnostics() + 三合一供数）', /hostFaceDiagnostics\(\) \{/.test(serviceSource) && /hostVersionsOf\(\)/.test(serviceSource) && /faceHealthSnapshot\(\)/.test(serviceSource) && /hostDiagnostics\(\)\.entries/.test(serviceSource))
  }

  // 8e. P2-2（EVO-019 MUST）：HOST_ROUTE_* 常量权威源翻转——version.js 自持
  //     单点定义、host-route.js 从 version.js import（依赖方向按 §4.2 图，
  //     防循环 import）。
  {
    const versionModule = await import('../lib/host-abi/version.js')
    const hostRouteModule = await import('../lib/host-route.js')
    check('P2-2: HOST_ROUTE_* 权威源 = version.js 单点定义（四常量字面量在域内声明）',
      /export const HOST_ROUTE_NS = 'llm-pi-ai'/.test(versionSource)
      && /export const HOST_ROUTE_PROVIDER = 'openai-codex'/.test(versionSource)
      && /export const HOST_ROUTE_REF = 'DSH_ROUTER_OPENAI_CODEX'/.test(versionSource)
      && /export const HOST_ROUTE_TICK_MS = 30_000/.test(versionSource))
    check('P2-2: 反向依赖边已断（version.js 零 host-route import——依赖方向无环）', !/from ['"][^'"]*host-route/.test(versionSource))
    check('P2-2: host-route.js 从桶 import + re-export（service.js/tests 消费面 import 零改动；本地零重复定义）',
      /import \{ HOST_ROUTE_NS, HOST_ROUTE_PROVIDER, HOST_ROUTE_REF, HOST_ROUTE_TICK_MS,[^}]*\} from '\.\/host-abi\/index\.js'/.test(hostRouteSource)
      && /export \{ HOST_ROUTE_NS, HOST_ROUTE_PROVIDER, HOST_ROUTE_REF, HOST_ROUTE_TICK_MS \}/.test(hostRouteSource)
      && !/export const HOST_ROUTE_(NS|PROVIDER|REF|TICK_MS)/.test(hostRouteSource))
    check('P2-2: 值级三面锚定（version 权威 === host-route re-export === 桶）',
      versionModule.HOST_ROUTE_NS === hostRouteModule.HOST_ROUTE_NS
      && versionModule.HOST_ROUTE_PROVIDER === hostAbi.HOST_ROUTE_PROVIDER
      && versionModule.HOST_ROUTE_REF === hostRouteModule.HOST_ROUTE_REF
      && versionModule.HOST_ROUTE_TICK_MS === hostAbi.HOST_ROUTE_TICK_MS
      && versionModule.HOST_ROUTE_PROVIDER === 'openai-codex')
  }

  // 8f. F-6（EVO-020）：HostHealthCard faces 合并按名去重（防重复行）。
  {
    const cardPos = clientSourceB4.indexOf('function HostHealthCard')
    const cardEnd = clientSourceB4.indexOf('\n    function ', cardPos + 1)
    const cardBody = clientSourceB4.slice(cardPos, cardEnd === -1 ? undefined : cardEnd)
    check('F-6: HostHealthCard faces 合并按名去重（先到先留——RPC 权威序在前，同名面不重复渲染）', /const mergedFaces = \[/.test(cardBody) && /seen\.has\(face\.name\)/.test(cardBody) && /= mergedFaces\.filter/.test(cardBody))
  }

  // 8g. F-3（EVO-020，绑定 ⑦）：modelDirectories 缺面路径补 code + 诊断事件
  //     （host-face-missing 短码 + noteHostDiag——对齐三错误码降级体系）。
  {
    const reactStub2 = { createElement: () => null, useState: () => [null, () => {}], useEffect: () => {}, useCallback: (fn) => fn, useRef: () => ({ current: null }) }
    let bundlePayload2 = null
    new Function('window', clientSourceB4)({ __ModuleLoader__: { load: (payload) => { bundlePayload2 = payload } } })
    const bundleExports2 = bundlePayload2.factory((name) => (name === 'react' ? reactStub2 : null))
    const dirsMissingCtx = { get: () => undefined, remote: {} }
    const dirsEnvelope = await createClientRemotes(dirsMissingCtx).api.sessions.models({ sessionId: 's1' })
    check('F-3: modelDirectories 缺面 → host-face-missing 短码（对齐 :124-125 三错误码降级体系）', dirsEnvelope.result.ok === false && dirsEnvelope.result.error.code === 'host-face-missing')
    check('F-3: 缺面记 face-degraded 诊断事件（noteHostDiag 上行，P8）', hostDiagnostics().entries.some((entry) => entry.kind === 'face-degraded' && entry.face === 'modelDirectories' && entry.code === 'host-face-missing'))
    const dirsMirror = await bundleExports2.createClientRemotes(dirsMissingCtx).api.sessions.models({ sessionId: 's1' })
    check('F-3 镜像 parity: 缺面降级信封与权威单点逐字相等（JSON 级）', JSON.stringify(dirsMirror) === JSON.stringify(dirsEnvelope))
    const dirsShapeCtx = { get: (name) => (name === 'modelDirectories' ? {} : undefined), remote: {} }
    const dirsShape = await createClientRemotes(dirsShapeCtx).api.sessions.models({ sessionId: 's1' })
    check('F-3 边界: directoryFor 形状漂移/sessionId 缺失保持 failureOf 原语义（不误标 host-face-missing）', dirsShape.result.ok === false && dirsShape.result.error.code === undefined)
  }
}

// ── 9. EVO-023 B5：events 域批（域管事件共享订阅 + 转发白名单双检 + R-5 注册表接线）──
console.log('B5 events domain batch (managed events + forwarded whitelist double-check + R-5 face registry):')
{
  const readLibB5 = (name) => readFileSync(join(ROOT_DIR, 'lib', name), 'utf8')
  const readTestB5 = (name) => readFileSync(join(ROOT_DIR, 'tests', name), 'utf8')
  const clientSourceB5 = readLibB5('client.js')
  const eventsSourceB5 = readFileSync(join(ROOT_DIR, 'lib', 'host-abi', 'events.js'), 'utf8')

  // 9a. 域管事件清单（§4.3 域 4 ① / W-3 收窄口径）。
  const MANAGED_EXPECTED = ['settings/updated', 'llm/adapters-updated', 'settings/document-updated', 'agent-preset/selected', 'credentials/reference-updated']
  check('B5 9a: MANAGED_EVENTS = §4.3 域 4 五事件清单（多消费者/跨面环境事件单点）',
    Array.isArray(MANAGED_EVENTS) && JSON.stringify([...MANAGED_EVENTS].sort()) === JSON.stringify([...MANAGED_EXPECTED].sort()), MANAGED_EVENTS)
  check('B5 9a: W-3 收窄——scoped 生命周期钩子（agent/pre-step、agent/created、agent/request）不在域管清单（veto 语义/热路径零介入）',
    ['agent/pre-step', 'agent/created', 'agent/request'].every((name) => !MANAGED_EVENTS.includes(name)))
  check('B5 9a: scoped 钩子在消费面保留直订不经域（preset-defaults/prestep 源码面 W-3 口径）',
    /ctx\.on\('agent\/created'/.test(readLibB5('preset-defaults.js'))
    && /ctx\.on\('agent\/request'/.test(readLibB5('preset-defaults.js'))
    && /ctx\.on\('agent\/pre-step'/.test(readLibB5('prestep.js')))

  // 9b. 转发白名单双检——静态：插件订阅事件名 ⊆ 宿主白名单映射（W-4）。
  //     订阅点两种写法都扫：直订 `$on('name', …)`（scoped 合法面）与
  //     events 域镜像 `subscribeClientEvents($on, [{ event: 'name' … }])`。
  const onSites = [
    ...[...clientSourceB5.matchAll(/\$on\(\s*'([^']+)'/g)].map((match) => match[1]),
    ...[...clientSourceB5.matchAll(/\bevent:\s*'([^']+)'/g)].map((match) => match[1]),
  ]
  check('B5 9b 静态: client.js 全部订阅事件名字面量 ⊆ FORWARDED_EVENT_ALLOWLIST（≥5 站点——非空判别）',
    onSites.length >= 5 && onSites.every((name) => FORWARDED_EVENT_ALLOWLIST.includes(name)), onSites)
  check('B5 9b 静态: D-2 死订阅名 credentials/updated 零残留 + 正名 credentials/reference-updated 在位（白名单锚）',
    !onSites.includes('credentials/updated') && onSites.includes('credentials/reference-updated'))
  check('B5 9b 迁移: index.js/service.js 的 settings/updated 订阅收敛 events 域（旧裸 ctx.on 零残留，P5）',
    /subscribeEvents\(ctx,/.test(readLibB5('index.js')) && /subscribeEvents\(this\.ctx,/.test(readLibB5('service.js'))
    && !/ctx\.on\('settings\/updated'/.test(readLibB5('index.js')) && !/this\.ctx\.on\('settings\/updated'/.test(readLibB5('service.js')))
  check('B5 9b 迁移: preset-defaults 的 agent-preset/selected（域管事件）经域；agent/created 保留直订（W-3）',
    /subscribeEvents\(ctx,/.test(readLibB5('preset-defaults.js'))
    && !/ctx\.on\('agent-preset\/selected'/.test(readLibB5('preset-defaults.js'))
    && /ctx\.on\('agent\/created'/.test(readLibB5('preset-defaults.js')))

  // 9c. 运行时可达性探测：转发面白名单外订阅拒绝 + 诊断（D-2 机器防线）。
  const forwardedListeners = new Map()
  const forwardedOn = (event, handler) => {
    const list = forwardedListeners.get(event) ?? []
    list.push(handler)
    forwardedListeners.set(event, list)
    return () => { forwardedListeners.set(event, (forwardedListeners.get(event) ?? []).filter((item) => item !== handler)) }
  }
  let forwardedCalls = 0
  const disposeForwarded = subscribeEvents(forwardedOn, [
    { event: 'credentials/updated', consumer: 'dead-subscription', handler: () => { forwardedCalls += 1 } },
    { event: 'credentials/reference-updated', consumer: 'settings-page-reload', handler: () => { forwardedCalls += 1 } },
  ])
  check('B5 9c 运行时: 转发面白名单外事件名订阅被拒——零 listener 注册（credentials/updated 死订阅机器防线）',
    !forwardedListeners.has('credentials/updated') && [...forwardedListeners.keys()].join('|') === 'credentials/reference-updated')
  check('B5 9c 运行时: 拒绝记观测事件（P8：event-subscribe-rejected + code=not-forwarded + 面名）',
    hostDiagnostics().entries.some((entry) => entry.kind === 'event-subscribe-rejected' && entry.face === 'credentials/updated' && entry.code === 'not-forwarded'))
  for (const handler of forwardedListeners.get('credentials/reference-updated') ?? []) handler()
  check('B5 9c 运行时: 白名单内事件名放行（正名订阅派发命中——死订阅修复后的刷新链路）', forwardedCalls === 1)
  disposeForwarded()
  check('B5 9c 运行时: isForwardedEvent 判定与白名单镜像一致（含空/非串防御）',
    isForwardedEvent('credentials/reference-updated') === true && isForwardedEvent('credentials/updated') === false
    && isForwardedEvent('') === false && isForwardedEvent(undefined) === false)
  check('B5 9c 运行时: 宿主面（ctx.on）事件名不受转发白名单约束（settings/updated 非转发事件仍合法）',
    (() => {
      const seen = []
      subscribeEvents({ on: (event, handler) => { seen.push(event); return () => {} } }, [{ event: 'settings/updated', consumer: 'stats-persistence', handler: () => {} }])
      return seen.join('|') === 'settings/updated'
    })())

  // 9d. 共享 listener 聚合（D1-9：跨模块多次 subscribeEvents 收敛单 ctx.on listener）。
  const hostListeners = new Map()
  const hostTarget = {
    on: (event, handler) => {
      const list = hostListeners.get(event) ?? []
      list.push(handler)
      hostListeners.set(event, list)
      return () => { hostListeners.set(event, (hostListeners.get(event) ?? []).filter((item) => item !== handler)) }
    },
  }
  let statsApplies = 0
  let routeSyncs = 0
  const disposeConsumerA = subscribeEvents(hostTarget, [{ event: 'settings/updated', consumer: 'stats-persistence', handler: (ns) => { if (ns === 'router' || ns === undefined) statsApplies += 1 } }])
  const disposeConsumerB = subscribeEvents(hostTarget, [{ event: 'settings/updated', consumer: 'host-route-router-ns', handler: (ns) => { if (ns === 'router') routeSyncs += 1 } }])
  check('B5 9d 聚合: 同目标两次 subscribeEvents 共享单 ctx.on listener（4→3 订阅 census 的机制面）', (hostListeners.get('settings/updated') ?? []).length === 1)
  for (const handler of hostListeners.get('settings/updated') ?? []) handler('router')
  check('B5 9d 聚合: 共享 listener 按名分发到全部 consumer（同事件两模块消费者各得其份）', statsApplies === 1 && routeSyncs === 1)
  disposeConsumerA()
  for (const handler of hostListeners.get('settings/updated') ?? []) handler('router')
  check('B5 9d 聚合: 单模块卸载只摘除自身 consumer（其余消费者不受影响——卸载聚合）', statsApplies === 1 && routeSyncs === 2)
  disposeConsumerB()
  check('B5 9d 聚合: 全量卸载后共享 listener 归零（无残留泄漏）', (hostListeners.get('settings/updated') ?? []).length === 0)
  // 9d-2. 异步 consumer 的 await 语义（域分发不得降级为 fire-and-forget——
  //   preset-defaults 播种串行队列测试与消费链均依赖 `await handler(...)` 与
  //   直订等价；多 consumer 时合并 Promise.all）。
  {
    const asyncListeners = []
    const asyncTarget = { on: (event, handler) => { asyncListeners.push(handler); return () => {} } }
    const settled = []
    subscribeEvents(asyncTarget, [{ event: 'agent-preset/selected', consumer: 'async-consumer', handler: async () => { await new Promise((resolve) => setImmediate(resolve)); settled.push('done'); return 'seeded' } }])
    const outcome = asyncListeners[0]('sess-x', 'preset-x')
    check('B5 9d 异步语义: 域分发表透传 async consumer 的 promise（await handler 与直订等价）', !!outcome && typeof outcome.then === 'function' && settled.length === 0)
    await outcome
    check('B5 9d 异步语义: await 后 handler 副作用可见（preset-defaults 播种队列回归锚）', settled.length === 1)
  }

  // 9e. 浏览器镜像 parity（client.js 无法 import Node ESM——镜像纪律，B2 先例）。
  const reactStubB5 = {
    createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), ...(children.length > 0 ? { children: children.flat(Infinity) } : {}) } }),
    useState: () => [null, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useRef: () => ({ current: null }),
  }
  let bundleB5 = null
  new Function('window', clientSourceB5)({ __ModuleLoader__: { load: (payload) => { bundleB5 = payload } } })
  const bundleExportsB5 = bundleB5.factory((name) => (name === 'react' ? reactStubB5 : null))
  check('B5 9e 镜像 parity: FORWARDED_EVENT_ALLOWLIST 浏览器镜像 === 权威单点（值级，漂移即红）',
    JSON.stringify(bundleExportsB5.FORWARDED_EVENT_ALLOWLIST) === JSON.stringify(FORWARDED_EVENT_ALLOWLIST))
  check('B5 9e 镜像 parity: subscribeClientEvents 镜像导出（判别测试钩子先例 createClientRemotes）', typeof bundleExportsB5.subscribeClientEvents === 'function')
  const mirrorListeners = new Map()
  const mirrorOn = (event, handler) => {
    const list = mirrorListeners.get(event) ?? []
    list.push(handler)
    mirrorListeners.set(event, list)
    return () => { mirrorListeners.set(event, (mirrorListeners.get(event) ?? []).filter((item) => item !== handler)) }
  }
  let mirrorCalls = 0
  const disposeMirror = bundleExportsB5.subscribeClientEvents(mirrorOn, [
    { event: 'credentials/updated', consumer: 'dead-subscription', handler: () => { mirrorCalls += 1 } },
    { event: 'llm/adapters-updated', consumer: 'settings-page-reload', handler: () => { mirrorCalls += 1 } },
  ])
  check('B5 9e 镜像 parity: 白名单拒绝与权威同型（死名零 listener + 白名单内保留）',
    !mirrorListeners.has('credentials/updated') && [...mirrorListeners.keys()].join('|') === 'llm/adapters-updated')
  for (const handler of mirrorListeners.get('llm/adapters-updated') ?? []) handler()
  check('B5 9e 镜像 parity: 放行面派发命中 + 拒绝记本地诊断环形（health().diag 可观测，P8）',
    mirrorCalls === 1 && bundleExportsB5.createClientRemotes({ get: () => undefined, remote: {} }).health().diag.some((entry) => entry.kind === 'event-subscribe-rejected' && entry.face === 'credentials/updated' && entry.code === 'not-forwarded'))
  disposeMirror()
  check('B5 9e 镜像 parity: 卸载聚合归零（镜像与权威同语义）', (mirrorListeners.get('llm/adapters-updated') ?? []).length === 0)
  // 9e-2. 镜像跨调用聚合：同一 `$on` 闭包上的两次订阅（设置页 + apply 级）→
  //   宿主 listener 恒 1（客户端订阅 census 只减不增的机制面；生产路径上
  //   页面经 inject 拿到与 apply 同一 $on 闭包）。
  {
    const dedupListeners = []
    const dedupOn = (event, handler) => { dedupListeners.push({ event, handler }); return () => {} }
    let dedupCalls = 0
    const disposeDedupA = bundleExportsB5.subscribeClientEvents(dedupOn, [{ event: 'settings/document-updated', consumer: 'settings-page-reload', handler: () => { dedupCalls += 1 } }])
    const disposeDedupB = bundleExportsB5.subscribeClientEvents(dedupOn, [{ event: 'settings/document-updated', consumer: 'composer-catalog', handler: () => { dedupCalls += 1 } }])
    check('B5 9e 镜像 parity: 跨调用同 $on 同事件名共享单宿主 listener（设置页 + apply 级聚合）', dedupListeners.length === 1 && dedupListeners[0].event === 'settings/document-updated')
    dedupListeners[0].handler()
    check('B5 9e 镜像 parity: 共享 listener 分发给两消费者（聚合不丢消费者）', dedupCalls === 2)
    disposeDedupA()
    dedupListeners[0].handler()
    check('B5 9e 镜像 parity: 单调用卸载只摘除自身 consumer（聚合卸载语义与权威一致）', dedupCalls === 3)
    disposeDedupB()
  }

  // 9f. R-5：Node 侧注册表接线（faces 生产非空——B1 空注册表落地）+ 面板打开复检规则。
  const fullFaces = {
    llm: { registerAdapter: () => {}, registration: () => ({}), listModels: async () => [] },
    credentials: { resolve: async () => undefined },
    settings: { get: () => undefined, mutate: async () => {} },
    fs: {},
    attachments: {},
    subagents: {},
    agentDefaultModel: { currentSelection: () => null, saveSelection: () => {} },
    sessionController: { selectModel: async () => ({}) },
    sessionProjections: { stateOf: () => null },
    agents: { get: () => ({}) },
    agentPresets: { composedPreset: () => 'p' },
  }
  const probeCtxFull = { get: (name) => fullFaces[name] }
  const nodeProbes = [
    ...ctxServiceFaceProbes(),
    { name: 'llm:adapter', probe: probeLlmAdapterFace },
    { name: 'session:select', probe: probeSessionSelectFace },
  ]
  check('B5 9f R-5: ctxServiceFaceProbes = 11 ctx 服务面（CTX_SERVICES 单点派生，无手抄清单）',
    nodeProbes.length === 13 && ctxServiceFaceProbes().length === Object.keys(hostAbi.CTX_SERVICES).length && ctxServiceFaceProbes().every((item) => typeof item.probe === 'function' && item.name.startsWith('ctx:')))
  registerFaceProbes(nodeProbes)
  // §2 桩面复原为 ok（同会话注册表按名幂等覆盖）——「全绿快照」判定需要。
  registerFaceProbes(['stub:ok', 'stub:degraded', 'stub:throws'].map((name) => ({ name, probe: () => ({ state: 'ok' }) })))
  const nodeFaces = runFaceProbes(probeCtxFull)
  const FACE_NAMES_B5 = ['ctx:llm', 'ctx:credentials', 'ctx:settings', 'ctx:fs', 'ctx:attachments', 'ctx:subagents', 'ctx:agentDefaultModel', 'ctx:sessionController', 'ctx:sessionProjections', 'ctx:agents', 'ctx:agentPresets', 'llm:adapter', 'session:select']
  check('B5 9f R-5: 注册表面真实探测——13 面全 ok（形状齐备 ctx，非占位/非 TODO）',
    FACE_NAMES_B5.every((name) => nodeFaces.find((face) => face.name === name)?.state === 'ok'), nodeFaces.filter((face) => FACE_NAMES_B5.includes(face.name)))
  const nodeFacesMissing = runFaceProbes({ get: () => undefined })
  check('B5 9f R-5: 空 ctx → 13 面全 missing + host-face-missing 短码（探测真实性反向判别）',
    FACE_NAMES_B5.every((name) => nodeFacesMissing.find((face) => face.name === name)?.state === 'missing' && String(nodeFacesMissing.find((face) => face.name === name)?.detail).includes('host-face-missing')))
  // 面板打开复检规则（§7.1 三时机之「健康面板打开」）：全绿 → 纯缓存读；非全绿 → 一次复检。
  runFaceProbes(probeCtxFull)
  let r5ProbeRuns = 0
  registerFaceProbes([{ name: 'b5:count', probe: () => { r5ProbeRuns += 1; return { state: 'ok' } } }])
  runFaceProbes(probeCtxFull)
  const r5BaselineRuns = r5ProbeRuns
  const root9 = new Context()
  for (const [name, value] of Object.entries(fullFaces)) root9.provide(name, value)
  const service9 = new RouterService(root9)
  const payload9 = service9.hostFaceDiagnostics()
  check('B5 9f R-5: Node 消费面（RPC 三合一）faces 生产非空——13 面 + 计数桩全部在场且无缺失态',
    FACE_NAMES_B5.every((name) => payload9.faces.some((face) => face.name === name && face.state === 'ok')) && payload9.faces.length >= 14)
  check('B5 9f R-5: 全绿快照 → RPC 读零 probe（纯缓存读，§7.1 惰性纪律不破）', r5ProbeRuns === r5BaselineRuns)
  const service9b = new RouterService(new Context())
  // 非全绿快照制造：空 ctx 自检（13 面全 missing）→ 下一次 RPC 读触发复检。
  runFaceProbes({ get: () => undefined })
  const r5BeforeDegradedRead = r5ProbeRuns
  const payload9b = service9b.hostFaceDiagnostics()
  check('B5 9f R-5: 非全绿快照 → 面板打开一次复检（失败驱动复检；boot 期面未就绪的陈旧 missing 于打开时自愈）',
    r5ProbeRuns === r5BeforeDegradedRead + 1 && payload9b.faces.filter((face) => FACE_NAMES_B5.includes(face.name) && face.state === 'ok').length === 0)

  // 9g. R-3（F-6 行为断言）：HostHealthCard faces 合并按名去重（RPC 权威序在前）。
  const tStubB5 = (key) => Object.assign((arg) => `${key}(${arg})`, { toString: () => key })
  const cardTree = bundleExportsB5.HostHealthCard({
    hostHealth: { hostVersions: { llm: '0.1.5-rc.2', tools: '0.1.5-rc.2', typertProtocol: '0.1.5-rc.2' }, faces: [{ name: 'llm', state: 'ok' }, { name: 'settings', state: 'ok' }] },
    faceHealth: { faces: [{ name: 'llm', state: 'degraded', detail: 'host-face-shape: listProviders' }, { name: 'remote.llm', state: 'ok' }] },
    t: tStubB5,
  })
  const cardTexts = []
  const collectTextB5 = (node) => {
    if (typeof node === 'string') { cardTexts.push(node); return }
    if (typeof node === 'function') { cardTexts.push(String(node)); return }
    if (typeof node === 'number' || typeof node === 'boolean') { cardTexts.push(String(node)); return }
    if (!node || typeof node !== 'object') return
    for (const child of Array.isArray(node.props?.children) ? node.props.children : []) collectTextB5(child)
  }
  collectTextB5(cardTree)
  const faceRows = cardTexts.filter((text) => /^[✓⚠✗] /.test(text))
  check('B5 9g F-6: faces 合并按名去重——同名 llm 仅一行且取 RPC 权威态（先到先留）',
    faceRows.length === 3 && faceRows.includes('✓ llm') && !faceRows.some((row) => row.startsWith('⚠ llm') || row.startsWith('✗ llm')))
  check('B5 9g F-6: 本地独有面照常渲染（remote.llm 非同名面不被去重丢弃）', faceRows.includes('✓ remote.llm') && faceRows.includes('✓ settings'))
  check('B5 9g F-6: 徽章口径随去重结果（去重后零降级 → 全绿文案，不误报）', cardTexts.includes('hostHealthOk') && !cardTexts.includes('hostHealthWarn(1)'))

  // 9h. R-1 锚清扫复核：旧行号式锚零残留（函数名+文件式锚替代，防行号再漂移）。
  const ANCHOR_CASES = [
    { file: ['lib', 'host-abi', 'ctx-services.js'], stale: ['preset-defaults.js:163', 'preset-defaults.js:194', 'preset-defaults.js:214', 'prestep.js:193', 'wrapper.js:516', 'oauth-llm.js:449', 'service.js:927', 'host-route.js:248'], fresh: ['safeListModels', 'sessionSelectFaceOf', 'agentsRegistryOf', 'agentPresetsServiceOf', 'llmFaceOf'] },
    { file: ['lib', 'host-abi', 'events.js'], stale: ['host-route.js:263-270'], fresh: ['syncHostRoute'] },
    { file: ['lib', 'stats.js'], stale: ['host-route.js:55'], fresh: ['host-abi/version.js'] },
    { file: ['tests', 'fix-031-attribution.mjs'], stale: ['host-route.js HOST_ROUTE_PROVIDER'], fresh: ['host-abi/version.js HOST_ROUTE_PROVIDER'] },
    { file: ['tests', 'client-render.mjs'], stale: ['lib/host-route.js HOST_ROUTE_PROVIDER'], fresh: ['lib/host-abi/version.js HOST_ROUTE_PROVIDER'] },
  ]
  for (const anchorCase of ANCHOR_CASES) {
    const filePath = join(ROOT_DIR, ...anchorCase.file)
    const source = readFileSync(filePath, 'utf8')
    const staleHits = anchorCase.stale.filter((needle) => source.includes(needle))
    const missingFresh = anchorCase.fresh.filter((needle) => !source.includes(needle))
    check(`B5 9h R-1: ${anchorCase.file.join('/')} 行号式锚零残留 + 函数名式锚在位`, staleHits.length === 0 && missingFresh.length === 0, { staleHits, missingFresh })
  }
  void eventsSourceB5
}

console.log(failures === 0 ? `\nALL HOST ABI HEALTH TESTS PASSED (${passed} assertions)` : `\n${failures} FAILURE(S) (${passed} passed)`)
process.exit(failures === 0 ? 0 : 1)
