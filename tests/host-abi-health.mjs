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
 *
 * 红演示证据（任务验收 2）：实现前自然红（模块缺失套件失败）+ 绿后判别红
 * （R1：HOST_DIAG_LIMIT 临时 64→128 → 环形有界断言红；R2：HostHealthCard
 * 渲染体内临时注入第二处 .hostFaceDiagnostics( 调用 → render 期零 probe
 * 判别红）——复原后全绿。
 *
 * 独立入口：node tests/host-abi-health.mjs（exit 0/1）。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { ROUTER_DESCRIPTORS } from '../lib/rpc.js'
import { RouterService } from '../lib/service.js'
import { wireCodecs } from '../lib/schemas.js'
import { HOST_ROUTE_NS, HOST_ROUTE_PROVIDER, HOST_ROUTE_REF, HOST_ROUTE_TICK_MS } from '../lib/host-route.js'
import * as hostAbi from '../lib/host-abi/index.js'

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  HOST_DIAG_LIMIT, noteHostDiag, hostDiagnostics, registerFaceProbes, faceHealthSnapshot, runFaceProbes,
  packageVersionOf, hostVersionsOf,
  CLIENT_REMOTE_FACES, probeRemoteFace, clientRemotesHealth, createClientRemotes,
  probeLlmAdapterFace, probeSessionSelectFace,
  serviceFaceOf, agentsRegistryOf,
  FORWARDED_EVENT_ALLOWLIST, subscribeEvents, armEventGate,
  FIBER_INJECT, CLIENT_PACKAGE_INJECT, probeFiberInjectFaces, noteInjectFaceGaps,
} = hostAbi

let failures = 0
let passed = 0
const check = (label, condition) => {
  if (condition) { passed++; console.log(`  ok  ${label}`) }
  else { failures++; console.error(`FAIL  ${label}`) }
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
  check('HOST_ROUTE_* re-exports stay value-anchored to lib/host-route.js authority (fix-031 G14 precedent)', hostAbi.HOST_ROUTE_NS === HOST_ROUTE_NS && hostAbi.HOST_ROUTE_PROVIDER === HOST_ROUTE_PROVIDER && hostAbi.HOST_ROUTE_REF === HOST_ROUTE_REF && hostAbi.HOST_ROUTE_TICK_MS === HOST_ROUTE_TICK_MS)
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
  check('probeLlmAdapterFace: registerAdapter/listModels shape checked', probeLlmAdapterFace({ get: (name) => (name === 'llm' ? { registerAdapter: () => {}, listModels: async () => [] } : undefined) }).state === 'ok' && probeLlmAdapterFace({ get: (name) => (name === 'llm' ? { registerAdapter: () => {} } : undefined) }).state === 'degraded')
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

console.log(failures === 0 ? `\nALL HOST ABI HEALTH TESTS PASSED (${passed} assertions)` : `\n${failures} FAILURE(S) (${passed} passed)`)
process.exit(failures === 0 ? 0 : 1)
