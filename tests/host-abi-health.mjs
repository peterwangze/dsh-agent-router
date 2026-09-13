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
 *    R-1 锚清扫复核（**清单内**旧式锚零残留、替代式锚在位；限定语形态，见下）；FIX-040 扩面（R1 N4）：
 *    清扫面扩至 lib/host-abi/llm-selection.js / tests/metrics.mjs / tests/smoke.mjs /
 *    tests/install-entry.mjs / lib/preset-defaults.js / tests/preset-defaults.mjs +
 *    ci.yml / README.md 契约面（stale 零残留 + 符号/断言名式锚在位），并增设
 *    **跨文件对象核验**（9h-2：metrics 断言名式锚所指对象按**声明单源**实存；9h-2b：零自满足；
 *    9h-2c：表内声明源名合法性——未知源名显式判红，不裸抛 TypeError；
 *    9h-2d：对象在其声明源内恰出现 1 次——同源重复/副本即红）
 *    + **入表完备性自检**（9h-3：metrics 候选锚名未入表即红），使锚漂移成为机器看护而非人工巡检。
 * 10. FIX-035（EVO-023 R0 P2-1 收口，§9i）：events 域 attach 失败条目**不入表**
 *    （后续订阅重试 attach——静默死订阅消除）+ event-subscribe-failed 诊断
 *    （code=attach-threw + consumer 标签 + 错误摘要，P8）+ 失败消费者 dispose
 *    降级 no-op（不悬挂）+ 浏览器镜像同型 parity（失败零复用/重试自愈）。
 *
 * 红演示证据（任务验收 2）：实现前自然红（模块缺失套件失败）+ 绿后判别红
 * （R1：HOST_DIAG_LIMIT 临时 64→128 → 环形有界断言红；R2：HostHealthCard
 * 渲染体内临时注入第二处 .hostFaceDiagnostics( 调用 → render 期零 probe
 * 判别红）——复原后全绿。B4 追加：临时在 service.js 加一处裸
 * ctx.get('sessionController') → §8a 白名单快照红（分级放行越界）。B5 追加：
 * ① 临时把 client.js 页面订阅改回死名 credentials/updated → §9b 静态比对 +
 * §9c 运行时拒绝红（复原双绿）；② 实现前 §9 组全红（MANAGED_EVENTS 未导出 /
 * 白名单未启用 / faces 空注册表 / R-1 锚未清扫）——见任务结论 RED 记录。
 * FIX-035 追加：§9i attach 抛错用例在修复前红（死条目被缓存 → 二次订阅零
 * attach + 误记 event-subscribed + 重试后零派发；镜像半边同型红）→ 修复后绿。
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
  // 字段白名单 + 截断 + 恶性输入防御（presetDiag/notePresetDiag 纪律同构）。
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

  // 9h. R-1 锚清扫复核（FIX-039 S-2 起）：**清单内**旧式锚零残留（函数名/符号名/断言名式锚替代，
  //   防行号再漂移；限定语见下条 check 标签——列清单式判据只覆盖清单本身，不声称「整文件无
  //   行号锚」）。清单结构：
  //   - file   = 被守卫文件（相对 ROOT_DIR 的路径段）；
  //   - stale  = **不得残留**的旧行号式锚（或已被取代的旧式锚）；
  //   - fresh  = **必须在位**的新式锚（函数名 / 符号名 / 断言名 / 结构串）；
  //   - notes  = 可选，不可修 / 需产品语义裁决的项以 note 登记（可见，不参与判别）。
  //   另设**跨文件对象核验**（generic，见本段末）：断言名式锚引用的 smoke.mjs 断言名
  //   MUST 在 smoke.mjs 中确实存在（死锚 / 改名漂移即红）——锚指向的对象由机器核验，
  //   而非仅核验锚串本身在位。
  //   FIX-040 扩面（R1 N4）：把 FIX-038 清扫面（llm-selection.js / metrics.mjs / smoke.mjs /
  //   install-entry.mjs / install.sh 引用位与 ci.yml / README 契约面）纳入同一清单，使
  //   「行号式锚零残留」成为机器看护而非人工巡检（此前全部靠手工逐个发现 ⇒ 必然复发）。
  // FIX-042 W2：本守卫**自身**也登记锚判据（自指锚一律用判据名/块名，不用行号——W2 机核实测本文件
  //   零处行号式自指）。自条目的**自满足陷阱**：若把某旧锚串以字面量整串写进本文件，ANCHOR_CASES 对
  //   本文件的 `includes` 判据会命中**本行自身**（X && X 恒真、判别力归零）；与同批其他文件条目的
  //   stale 字面量也会互相碰撞。故此类串统一以**拼接常量**定义——文件内不存在该连续串，而 needle
  //   的值与判据（`source.includes(needle)`）完全不变（改回字面量行号式锚即判红）。
  const OLD_PRESETDIAG_LINE_ANCHOR = 'presetDiag ' + ':127-141'
  const ANCHOR_CASES = [
    { file: ['lib', 'host-abi', 'ctx-services.js'], stale: ['preset-defaults.js:163', 'preset-defaults.js:194', 'preset-defaults.js:214', 'prestep.js:193', 'wrapper.js:516', 'oauth-llm.js:449', 'service.js:927', 'host-route.js:248'], fresh: ['safeListModels', 'sessionSelectFaceOf', 'agentsRegistryOf', 'agentPresetsServiceOf', 'llmFaceOf'] },
    { file: ['lib', 'host-abi', 'events.js'], stale: ['host-route.js:263-270'], fresh: ['syncHostRoute'] },
    // FIX-041 R0 F-2：同族在仓漂移锚收口——lib/stats.js 引 `lib/oauth-llm.js:43`，该行现已
    //   漂移为无关注释（`export const OAUTH_PROVIDER` 实在 :47）⇒ 按 FIX-041 W2 同形去行号
    //   改**符号名式**；本条目一并扩 stale/fresh（原条目只覆盖 `host-route.js:55` 一串）。
    { file: ['lib', 'stats.js'], stale: ['host-route.js:55', 'lib/oauth-llm.js:43'], fresh: ['host-abi/version.js', 'OAUTH_PROVIDER'] },
    { file: ['tests', 'fix-031-attribution.mjs'], stale: ['host-route.js HOST_ROUTE_PROVIDER'], fresh: ['host-abi/version.js HOST_ROUTE_PROVIDER'] },
    // FIX-042 W1（扩充既有条目，P5：同文件不重复登记）：`agentPresetsServiceOf` 先例锚原写
    //   `lib/preset-defaults.js:100-108`（实测漂移——该区间非定义；定义实在
    //   lib/host-abi/ctx-services.js 的 `export function agentPresetsServiceOf`）⇒ 归属文件式。
    { file: ['tests', 'client-render.mjs'], stale: ['lib/host-route.js HOST_ROUTE_PROVIDER', 'lib/preset-defaults.js:100-108', 'lib/client.js:4754-4825', 'lib/client.js:2842-2848'], fresh: ['lib/host-abi/version.js HOST_ROUTE_PROVIDER', 'agentPresetsServiceOf 先例，定义在', 'connection handle 面已无 `api` 字段', 'dsh-client-ui-settings-models 的 static `inject` 声明'] },
    // FIX-040 W8a：llm-selection.js 三处行号锚（R0 P3-3，:99/:179 已实测漂移）→ 符号名式。
    // FIX-042 W3.3（扩充同条目）：该文件头部/中段 5 处**宿主锚**去行号改包名+符号名式
    //   （@deepseek-ai/dsh-llm 类定义与三方法 / dsh-api-session-controller 选择面 /
    //   dsh-host-apiproxy 空白判据）——宿主对象不可机器核验（见基线登记），此处只判本仓锚串形态。
    { file: ['lib', 'host-abi', 'llm-selection.js'], stale: ['preset-defaults.js:226-238', 'preset-defaults.js:209-240', 'preset-defaults.js:303-307', '@deepseek-ai/dsh-llm lib/index.js:1698', 'registerAdapter :1780', 'registration :2177', 'listModels :2018', 'index.js:605, 2502-2503', 'dsh-host-apiproxy L1187-1189'], fresh: ['lib/preset-defaults.js', 'sessionSelectFaceOf', 'sessionNeverProduced', 'inheritedRouteOf', 'LLM_FACE_METHODS', '宿主 @deepseek-ai/dsh-llm 的类定义', '宿主 dsh-api-session-controller', '宿主 dsh-host-apiproxy 的空白判据'] },
    // FIX-040 W4：metrics.mjs 的 12 处 smoke.mjs:<行号> 证据锚（实测偏 ~1038~1200）→ 断言名式。
    //   fresh 只列**连续**锚串（本项判「清单内连续锚串」这一形态，不判跨行/合并写作/片段形态）。
    //   如实界定（R1 P3-2(new)）：跨行/合并形态的**入表完备性**由 9h-3 覆盖；其**对象存活**是否
    //   被核验取决于该名是否在 9h-2 表内（表内 = 按声明单源核验；表外 = 无核验）——不声称闭环。
    { file: ['tests', 'metrics.mjs'], stale: ['smoke.mjs:1162-1177', 'smoke.mjs:1316-1326', 'smoke.mjs:816-820', 'smoke.mjs:1473-1480', 'smoke.mjs:1669-1682', 'smoke.mjs:1500-1507', 'smoke.mjs:1153-1157', 'smoke.mjs:846-868', 'smoke.mjs:1557-1569', 'smoke.mjs:848-867', 'smoke.mjs:1266', 'smoke.mjs:1680-1681'], fresh: ['smoke.mjs「image turn config passes through unchanged (no whole-turn routing)」', 'smoke.mjs「wrapper takes over default model」', 'smoke.mjs「vision call returns text without echoing injected images (B)」', 'smoke.mjs「native multimodal delegate sees raw image (preserveImageInput)」', 'smoke.mjs §7.7 pre-step「image turn on wrapper route injects plugin reminder」', 'smoke.mjs「collectMarkers dedupes by attachment」', 'smoke.mjs「tool parameters schema」', 'smoke.mjs「attachmentIds resolution (M2)」节', 'smoke.mjs「follow-up text turn injects memory segment into system」', 'smoke.mjs「wrapper delegate sees route_agent'] },
    // FIX-040 W2/W8b：smoke.mjs 的旧式锚（行号区间 / 自锚）→ 符号名或内容式指代。
    // FIX-042 W4（扩充既有条目）：`check` 三参形态锚原写 `host-contract.mjs:82-88`（实测 HIT，但属
    //   行号式）⇒ 去行号改签名式（C5 半条）。
    { file: ['tests', 'smoke.mjs'], stale: ['install-entry.mjs:74-77', 'typert contribution registered` 断言行\n  // （符号名式锚；原写死行号', 'host-contract.mjs:82-88'], fresh: ['powerShellHosts', 'typert contribution registered', '紧随的 `19 invocations` 断言行', 'host-contract.mjs 的 `check(label, condition, detail)`'] },
    // FIX-040 W2/W3：install-entry.mjs 引用侧符号锚在位（其 install.sh 行号锚已符号化）。
    { file: ['tests', 'install-entry.mjs'], stale: ['install.sh:94-101', 'install.sh:113-131', '拷贝/链接回退语义仅 win32 可判定'], fresh: ['powerShellHosts', 'lstatOrUndefined', 'PS1_OFFLINE_APPLICABLE', 'PS1_PLATFORM_DETAIL', '源码自带依赖目录', '绝不对真实目录 rm -rf'] },
    // FIX-040 W3：install.sh 契约面引用位（ci.yml 头部契约 + README 覆盖边界）同口径核验。
    //   install.sh 的宿主源码锚（node_modules / dsh-* 上的行号）刻意不入本清单（不在本仓库面）。
    { file: ['.github', 'workflows', 'ci.yml'], stale: ['install.sh:94-101', 'install.sh:113-131'], fresh: ['源码自带依赖目录', 'LINKED=0', '绝不对真实目录 rm -rf'] },
    { file: ['README.md'], stale: ['install.sh:94-101', 'install.sh:113-131'], fresh: ['源码自带依赖目录', 'LINKED=0', '拷贝回退护栏'] },
    // FIX-040 W5：README 行号锚（L16/L158/L165，实测漂移 7 行）→ 关键词/小节名式。
    { file: ['lib', 'preset-defaults.js'], stale: ['README L158', 'README L16', 'README L165'], fresh: ['README「预设 Agent 默认模型」节', '留空 = 继承主 Agent 模型'] },
    { file: ['tests', 'preset-defaults.mjs'], stale: ['README L158', 'README L16', 'README L165'], fresh: ['README「留空 = 继承主 Agent 模型」句', 'README「特性」节'] },
    // FIX-041 W3：同族 `README L125` 行号锚（实测已漂移 ~141 行——`:125` 现为安装提示句，
    //   被引 qwen3.7-plus 事实句现位于 `README.md:266`「常见问题」节「视觉 agent 用什么
    //   模型？」条）→ 关键词/小节名式；两处引用同口径核验。**限定语**（FIX-041 R0 F-5）：
    //   「零残留」只在 **shipped 面（lib/** + tests/**）**成立——`docs/release/` 两处历史
    //   发布文档（`release-checklist-v0.3.2.md:30` / `version-plan-v0.3.2.md:82`）与
    //   `CHANGELOG.md:25`（已发布节冻结）仍含同族 `README L<n>` 锚，属**历史快照**（锚指向
    //   当时的 README 行号），刻意不清扫。
    // FIX-042 W1（扩充既有条目）：`lib/service.js` 裸 `:4074` 锚原指向「设备码会话取消」，
    //   实测 :4074 属 `oauthTokenExchange` 的 tokenRef 解析（对象不符）；同一事实在
    //   `exchangeDeviceCode` 的落盘前 cancelled 复查 ⇒ 符号名式。
    { file: ['lib', 'service.js'], stale: ['README L125', ':4074 的设备码会话取消'], fresh: ['README「常见问题」节「视觉 agent 用什么', '`exchangeDeviceCode` 的落盘前 cancelled 复查'] },
    { file: ['tests', 'routing-paths.mjs'], stale: ['README L125'], fresh: ['README「常见问题」节「视觉 agent 用什么'] },
    // FIX-041 W2：镜像对中**可在本仓核验**的行号锚/自身锚已符号名化（6 处）——stale 零
    //   残留 + 替代式锚在位。镜像侧（tests/served-client.js）**不重复登记**：§3 的字节
    //   恒等判据（`served-client mirror stays byte-identical to lib/client.js`）是更强的
    //   保证（逐字节相等 ⇒ 内容判据自动传递），重复登记只增表面不增判别力。
    //   宿主包锚刻意不入本清单——不在本仓库面，仓库级守卫不可解析（见 FIX-041 W4 报告）。
    //   **存量计数口径**（FIX-041 R0 F-3 收口：使数字可复算，不得只留精确数）——对
    //   `lib/client.js` 全文逐行 `matchAll` 三种行号形态，统计**匹配次数**（非行数；同一行
    //   可含多锚）：① `/[A-Za-z0-9_@\/.-]*[A-Za-z0-9_-]\.(js|mjs|ts|tsx|sh|ps1):\d+(-\d+)?/g`
    //   ② `/\bL\d{2,4}(?:[-–]\d{2,4})?/g` ③ `/(?:^|[^A-Za-z0-9_]):\d{2,4}(\/\d{1,4})?([-–]\d{2,4})?/g`。
    //   本批交付**前**（`524a30d^`）= **47**（15/17/15）；交付**后**（符号名化 6 处）= **41**
    //   （13/17/11），其中余留者**全部**为宿主包锚。**口径差异说明**：不同正则粒度会给出
    //   不同数字（如审查员口径把 `L5682-5760` 只计为 `L5682`、并排除 `/:342` 形态 ⇒
    //   13/17/8 = 38）——**数字必须连口径引用**，且随文本增删自动变化，不得作长期基线。
    { file: ['lib', 'client.js'], stale: ['lib/oauth-llm.js:43', 'presetDiagnostics :2109', 'health.js:35-48', 'OAUTH_ROUTE_PROVIDER :36', '权威单点 :124-125', 'lib/client.js:4754-4825'], fresh: ['lib/oauth-llm.js `export const', 'presetDiagnostics 方法存在性先例', 'lib/host-abi/health.js noteHostDiag', 'HOST_FACE_ERROR_CODES 三错误码', 'connection handle 面只有 isLoopback'] },
    //   **宿主锚核验基线登记**（FIX-042 W3.2，落于本注释处）：
    //     基线 = 依赖声明 `^0.1.5-rc.2`（package.json dependencies/peerDependencies 的
    //     `@deepseek-ai/dsh-*` 面；本机实装抽样 = **0.1.5-rc.2**，宿主 checkout 实测见
    //     .governance/arch-004-compatibility-design.md §1 与 tests/host-version-snapshot.mjs）。
    //     **仓库级守卫不可解析宿主树 ⇒ 本清单不覆盖宿主锚、不声称机器覆盖**（宿主锚的数量与
    //     对象符号只由 W3 清点表登记，机器判据仅覆盖「本仓文本内的锚串形态」）。
    //     **人工复检义务**：宿主升级后 MUST 按 `tests/host-contract.mjs` 头部
    //     「如何刷新本套件（宿主升级后…）」程序、与 `tests/host-version-snapshot.mjs` 刷新步骤
    //     同步执行，逐处重核宿主锚的对象符号（存在性 + 语义）并同步改写本仓注释与基线常量。
    //     试点口径（FIX-042 W3.3）：宿主锚去行号改**符号名/包名式**（如
    //     `dsh-client-connection` 的 connection handle 面、`dsh-api-gateway` 的
    //     `Reflect.get(receiver, implementation)` 解析面）——不引入未实证的宿主符号。
    //   **清点数字的取数修订绑定**（FIX-042 R0 F-1 收口；本批自设纪律「数字必须连口径引用」）：
    //   宿主锚清点 = **97 处 / 22 文件 @ `6bc3841`（FIX-042 批前树）**，其中 H1（同行宿主线索）
    //   57 / H2（仅**上一行**线索）40。**复跑命令**：`node .test-home/fix042-host-family.mjs`
    //   （口径见该脚本头：H1 同行线索 / H2 仅取上一行；排除 .governance/**、docs/**、CHANGELOG.md）；
    //   批前树复现：`git worktree add <tmp> 6bc3841` 后在该目录用同一脚本复跑（实测 97/57/40/22）。
    //   **同一脚本在 HEAD（本批 4 笔之后）复跑 = 92 处 / 19 文件**（H1 54 / H2 38）——**差额可复算**
    //   （工具 `.test-home/fix042-inventory-diff.mjs`，用法见其文件头）：**13 处**「批前有 / HEAD 无」
    //   （= 本批 W3 试点清点的宿主锚位点：镜像对 2 + inject-manifest 1 + llm-selection 4 +
    //   host-route 1 + wrapper 1 + client-render 2 + rpc-shadow-guard 2）；**8 处**「HEAD 有 / 批前无」
    //   （= 本批新增守卫条目行 `:728/:729/:733/:796/:797/:798/:799/:814` 的备忘文本，其自身即行号形态）。
    //   ⇒ 清点数字**随文本增删自动变化**，引用时必须连**取数修订 + 口径 + 复跑命令**，不得作长期基线。
    //   **本批实测计数回填**（FIX-042 R0 F-2 收口；提交信息历史不回改 ⇒ 计数事实以本行为准）：
    //   W1 = **12** 个 MISS 位点 / **8** 文件（`+20/−19`）；W2 = `ANCHOR_CASES` **16→22** 条目 /
    //   断言 165→**171**；W4 = 4 文件（`+14/−4`）/ 条目 22→**24** / 断言 **173**；W3 = 试点 **11** 锚位 /
    //   **8** 文件（5 lib + `tests/rpc-shadow-guard.mjs` + `tests/client-render.mjs` + 镜像侧
    //   `tests/served-client.js`）/ 条目 24→**25** / 断言 **174**；4 笔合计 **15** 文件（`--numstat` 口径）。
    //   **隔行站点登记**（FIX-042 R0 F-3）：对象在同块**隔行**（非同/上一行）的宿主锚未入 97 ——
    //   `lib/client.js:4281`（宿主 dsh-host-apiproxy `lib/index.js:2596-2630`）、`lib/service.js:1326`
    //   （同上宿主面 `:2582-2594`）、`lib/wrapper.js:266`（**本批已按 W3.3 同法**去行号改符号名式：
    //   宿主 dsh-llm 的 `resolveModelInfo → resolveModelInfoFor → adapter.resolveModel` 链——该处
    //   为清单外**真漂移**，审查员以宿主树只读实证 `:1397-1403` 现为 `assembleAssistantStream`）。
    //   前两处本轮**不改**（宿主锚不可本仓核验、同句无具名宿主符号 ⇒ 避免新幻觉引用），后续批以
    //   逐处语义判定收敛。
    // FIX-042 W1/W2：在仓漂移锚收口批（8 文件）的看护接线——FIX-041 R1 §三.3 硬前置「逐处语义
    //   判定」已逐处执行（判定表见 FIX-042 交付报告 W1），本段只登记**判定后**的 stale/fresh 对：
    //   stale = 本轮清除的旧行号式锚串（零残留即绿）；fresh = 替代式符号名/代码串锚（在位即绿）。
    //   宿主锚（`dsh-*` / 宿主 上下文，含 lib/client.js 内 9 处 `lib/client.js:<NNN>`）**不入本
    //   清单**：对象不在本仓库面，仓库级守卫不可解析宿主树（基线登记与人工复检义务见上方注释）。
    { file: ['lib', 'host-abi', 'health.js'], stale: ['lib/preset-defaults.js:116-124', OLD_PRESETDIAG_LINE_ANCHOR], fresh: ['presetDiag/notePresetDiag'] },
    { file: ['lib', 'host-abi', 'inject-manifest.js'], stale: ['（:5060 先例', 'lib/client.js:5060', 'dsh-client-modules lib/client.js:265-268'], fresh: ['const inject =', '宿主 dsh-client-modules 的包表行'] },
    { file: ['lib', 'oauth-llm.js'], stale: ['runCodexResponsesChat :2906-2929'], fresh: ['`runCodexResponsesChat`'] },
    // FIX-042 R0 F-3（扩充同条目）：`lib/wrapper.js:266` 的宿主锚 `（:1397-1403）` 为清单外**真漂移**
    //   （审查员宿主树实读：`dsh-llm resolveModelInfoFor` 在 `:2046`、`adapter.resolveModel` 在 `:2047`；
    //   `:1397-1403` 现为 `assembleAssistantStream`）⇒ 去行号改符号链式（与 W3.3 试点同法）。
    { file: ['lib', 'wrapper.js'], stale: ['stream 直传分支（下方 :353）', 'dsh-llm lib/index.js:1527', '（:1397-1403）'], fresh: ['`stream()` 的图片块保真直传分支', '宿主 dsh-llm 的 `registration()` 实现', '`resolveModelInfo → resolveModelInfoFor → adapter.resolveModel` 链'] },
    { file: ['tests', 'rpc-shadow-guard.mjs'], stale: ['lib/service.js:673', 'lib/service.js:3172', 'dsh-api-gateway/lib/index.js:101-103'], fresh: ['`this.stats = new StatsStore(...)`（lib/service.js）', '`statsSnapshot()` 委托', '宿主 dsh-api-gateway 的 `Reflect.get(receiver, implementation)` 解析面'] },
    // FIX-042 W2：**本守卫自身**的锚注释同口径看护（W2 机核实测：本文件零处行号式自指——自指
    //   一律用判据名/块名，如「9h-2b 的 ANCHOR_OBJECTS_3 校验块」；行号式自指随增删行即失效，
    //   即 FIX-041 R1 P3-2 指出的失效机理）。stale 侧 = 本批自本文件清除的旧行号式锚（拼接常量，
    //   见上）；fresh 侧 = 替代式符号名/代码串锚（同样拼接写出，规避自满足）。
    { file: ['tests', 'host-abi-health.mjs'], stale: [OLD_PRESETDIAG_LINE_ANCHOR], fresh: ['presetDiag/notePresetDiag ' + '纪律同构'] },
    // FIX-042 W4：语义待定 5 项中「在仓且可改」的 2 处（第 3 处 `tests/smoke.mjs` 已并入上方既有条目）：
    //   ① tests/stats.mjs 的 `service.js:2414-2561` 实为**历史迁移源**（现址为模态判定面，对象不符）
    //      ⇒ 改为「EVO-003 迁移前 RouterService 内联聚合」+ 现单点 `StatsStore`；
    //   ② tests/fix-012-image-takeover.mjs 的 `lib/client.js:3226` 指**已勘正的旧注释**（现址为
    //      preset schema 保存形状）⇒ 改为归属文件式（假设文本仍可 grep：`会话已含图`）。
    { file: ['tests', 'stats.mjs'], stale: ['service.js:2414-2561'], fresh: ['EVO-003 迁移前 RouterService 内联聚合'] },
    { file: ['tests', 'fix-012-image-takeover.mjs'], stale: ['lib/client.js:3226'], fresh: ['lib/client.js 的旧假设'] },
    // FIX-042 W3.3：宿主锚有界试点（本仓文本侧判据——去行号改包名+符号名式；宿主对象核验不可机器化，
    //   见上方基线登记）。lib/host-route.js 为本批新增条目（其余试点文件已并入各自既有条目）。
    { file: ['lib', 'host-route.js'], stale: ['dsh-credentials-local resolve(:473)/set(:513)/unset(:517)'], fresh: ['宿主 dsh-credentials-local 的 `resolve`/`set`/`unset`'] },
  ]
  for (const anchorCase of ANCHOR_CASES) {
    const filePath = join(ROOT_DIR, ...anchorCase.file)
    const source = readFileSync(filePath, 'utf8')
    const staleHits = anchorCase.stale.filter((needle) => source.includes(needle))
    const missingFresh = anchorCase.fresh.filter((needle) => !source.includes(needle))
    // P3-1 限定语：本项判的是「**本清单所列**旧式锚零残留」，不等于被守卫文件内无任何行号锚
    //   （如 install-entry.mjs 的 `install.ps1:1` / `install.sh:2` 属宿主入口自述锚，现值准确、
    //   刻意不入本清单——列清单式判据只覆盖清单）。
    check(`B5 9h R-1: ${anchorCase.file.join('/')} 清单所列旧式锚零残留 + 替代式锚在位`, staleHits.length === 0 && missingFresh.length === 0, { staleHits, missingFresh })
    // notes（可选）：不可修 / 需产品语义裁决的项，以 note 形式登记（不参与判别，仅可见）。
    for (const note of anchorCase.notes ?? []) console.log(`  note  B5 9h R-1: ${anchorCase.file.join('/')} ${note}`)
  }
  // 9h-2（FIX-040 W4；R0 P1-1 收口）：跨文件对象核验——metrics.mjs 的断言名式锚
  //   （`smoke.mjs「<label>」`）所引用的断言名 MUST 在 smoke.mjs（或测试面）中确实存在。
  //   判据取**显式对照表**（锚侧原文 → 对象侧原文）：锚串在 metrics.mjs 中在位（失去锚即红）
  //   × 对象在位（标签改名/断言被删即红）——两侧都判，避免「锚指向不存在对象」的静默失效。
  //   **本项覆盖面 = 下表所列锚**（≠ 全文件全部候选锚名）；表外候选名的**入表完备性**由
  //   9h-3 强制入表（新增候选名未入表即红）。**对象存活面的如实界定**（R1 P3-2(new)）：
  //   9h-2 的 21 对各自按**声明的单源**核验其对象；9h-3 只保证"候选名已入表"，**不等于**
  //   对象的存活已被覆盖（两者判据不同、不可互相替代），故不声称"全部候选锚名均有对象核验"。
  //   表结构（R1 P1-1(new) 收口）：`[锚串, 对象串（带判别前缀）, 声明源]` 三元组，对象**只在
  //   其声明源**内查找（禁止多源析取），并由 9h-2b 机器判据保证零自满足（见下）。
  {
    const metricsSource = readFileSync(join(ROOT_DIR, 'tests', 'metrics.mjs'), 'utf8')
    const smokeSource = readFileSync(join(ROOT_DIR, 'tests', 'smoke.mjs'), 'utf8')
    const paritySource = readFileSync(join(ROOT_DIR, 'tests', 'adapter-parity.mjs'), 'utf8')
    const wrapperSource = readFileSync(join(ROOT_DIR, 'lib', 'wrapper.js'), 'utf8')
    const ANCHOR_OBJECTS_3 = [
      ['smoke.mjs「image turn config passes through unchanged (no whole-turn routing)」', "check('image turn config passes through unchanged (no whole-turn routing)'", 'smoke'],
      ['smoke.mjs「wrapper takes over default model」', "check('wrapper takes over default model'", 'smoke'],
      ['wrapper twin mirrors catalog', "check('wrapper twin mirrors catalog'", 'smoke'],
      ['smoke.mjs「vision call returns text without echoing injected images (B)」', "check('vision call returns text without echoing injected images (B)'", 'smoke'],
      ['smoke.mjs「native multimodal delegate sees raw image (preserveImageInput)」', "check('native multimodal delegate sees raw image (preserveImageInput)'", 'smoke'],
      ['smoke.mjs §7.7 pre-step「image turn on wrapper route injects plugin reminder」', "check('image turn on wrapper route injects plugin reminder'", 'smoke'],
      ['reminder carries attachment id + route_agent instruction', "check('reminder carries attachment id + route_agent instruction'", 'smoke'],
      ['escape-group turn also injects reminder', "check('escape-group turn also injects reminder'", 'smoke'],
      ['smoke.mjs「collectMarkers dedupes by attachment」', "check('collectMarkers dedupes by attachment'", 'smoke'],
      ['marker offers recognition and generation routes', "check('marker offers recognition and generation routes'", 'smoke'],
      ['smoke.mjs「tool parameters schema」', "check('tool parameters schema'", 'smoke'],
      ['attachmentIds resolution (M2)', "console.log('attachmentIds resolution (M2):'", 'smoke'],
      ['smoke.mjs「follow-up text turn injects memory segment into system」', "check('follow-up text turn injects memory segment into system'", 'smoke'],
      ['memory segment carries id and untrust annotation', "check('memory segment carries id and untrust annotation'", 'smoke'],
      ['memory segments capped at recent 5', "check('memory segments capped at recent 5'", 'smoke'],
      ['current-turn image not double-injected as memory', "check('current-turn image not double-injected as memory'", 'smoke'],
      ['smoke.mjs「wrapper delegate sees route_agent', "check('wrapper delegate sees route_agent marker in system'", 'smoke'],
      ['log keeps original image block (F3)', "check('log keeps original image block (F3)'", 'smoke'],
      // R0 P1-1：:118-119 的旧锚名（不存在的断言名）已改写为指向本条实存对象——实现面按
      //   声明单源（wrapper）核验；对偶断言按声明单源（parity）核验。
      ['twin 实现保 id 仅改写 provider', 'return { ...resolved, provider: wrapRoute, inputModalities: modalities }', 'wrapper'],
      ['prepared model carries wrapRoute rewrite', "check('prepared model carries wrapRoute rewrite'", 'parity'],
      ['twin resolveModel 镜像模型身份（模型 id 不变）', "checks.push(['twin resolveModel 镜像模型身份（模型 id 不变）'", 'metrics'],
    ]
    const missingAnchors = ANCHOR_OBJECTS_3.filter(([anchor]) => !metricsSource.includes(anchor)).map(([anchor]) => anchor)
    // 对象核验 = **逐行声明的单源**（禁止四源析取）：每个对象串都带**判别前缀**（`check('` /
    // `console.log('` / `checks.push(['`），且只在那一个声明源里找——否则会出现两类自满足
    // 退化（R1 P1-1(new) 实测）：① `anchor === object`（同一谓词判两次 ⇒ X && X 恒真）
    // ② 对象串被**被守卫文件自身**的注释/锚文本碰撞 ⇒ 目标源漂移也不判红。判别前缀使
    // 对象只可能命中"真正的断言发射点"，杜绝与锚文本/注释碰撞。
    const ANCHOR_SOURCES = {
      smoke: smokeSource,
      parity: paritySource,
      wrapper: wrapperSource,
      metrics: metricsSource,
    }
    // 声明源名合法性（FIX-040 R2 P3-1(new) 收口）：表第三元是**字符串源名**，此前
    //   直接 `ANCHOR_SOURCES[origin].includes(...)`——源名误写（如尾随空格的 `'smoke '`）
    //   时取值为 undefined ⇒ 调用 `.includes` 抛 TypeError：套件以栈回溯崩溃退出，而
    //   非「源名非法」的明确报文（非静默，但诊断指向错误）。本项把该形态改为**显式
    //   check FAIL**（带非法源名清单 + 合法源名全集），并把下方核验一律改为安全取值
    //   （`?.includes(...) ?? false`）——非法源名只判红、不裸抛。
    const anchorSourceNames = Object.keys(ANCHOR_SOURCES)
    const unknownAnchorSources = [...new Set(ANCHOR_OBJECTS_3.map(([, , origin]) => origin))]
      .filter((origin) => !anchorSourceNames.includes(origin))
    check('B5 9h-2c R-1: 锚对象表的声明源名全部在 ANCHOR_SOURCES 内（未知源名判红，不得裸抛 TypeError）',
      unknownAnchorSources.length === 0, { unknownAnchorSources, knownSources: anchorSourceNames })
    const deadAnchors = ANCHOR_OBJECTS_3.filter(([, assertion, origin]) => !(ANCHOR_SOURCES[origin]?.includes(assertion) ?? false))
      .map(([, assertion, origin]) => `${origin}: ${assertion}`)
    // 自满足面核验（R1 P1-1(new) 的机器判据，三类恒 0）：
    //   ① anchor === object（同一谓词判两次）② object ⊂ anchor（对象被锚文本包含）
    //   ③ 对象串在**非声明源**里出现（碰撞/自引渠道）。
    //   同源重复渠道（第四类）由下方 **9h-2d** 独立判据判别（见该处说明）。
    const selfSatisfied = {
      identical: ANCHOR_OBJECTS_3.filter(([anchor, assertion]) => anchor === assertion).map(([anchor]) => anchor),
      objectInsideAnchor: ANCHOR_OBJECTS_3.filter(([anchor, assertion]) => anchor !== assertion && anchor.includes(assertion)).map(([anchor, assertion]) => `${anchor} ⊃ ${assertion}`),
      foreignSourceHits: ANCHOR_OBJECTS_3.filter(([, assertion, origin]) => Object.entries(ANCHOR_SOURCES)
        .some(([otherSource, text]) => otherSource !== origin && text.includes(assertion)))
        .map(([, assertion, origin]) => `${origin}: ${assertion}`),
    }
    // 标签取**限定语**形态：本项判别范围 = 本表所列锚（R0 P1-1-C：不得读作「全文件死锚即红」；
    // 表外候选名的入表完备性由 9h-3 强制）。
    check('B5 9h-2 R-1: metrics.mjs 本表所列断言名式锚全部有对象（锚在位 × 对象在其声明单源在位）',
      missingAnchors.length === 0 && deadAnchors.length === 0, { anchorCount: ANCHOR_OBJECTS_3.length, missingAnchors, deadAnchors })
    check('B5 9h-2b R-1: 对象核验零自满足（anchor≠object × 对象不被锚文本包含 × 对象仅在其声明源出现）',
      selfSatisfied.identical.length === 0 && selfSatisfied.objectInsideAnchor.length === 0 && selfSatisfied.foreignSourceHits.length === 0,
      { ...selfSatisfied, tableSize: ANCHOR_OBJECTS_3.length })
    // 9h-2d（FIX-040 R2 P3-2(new) 收口）：**同源重复**判据——对象串在其**声明源**内
    //   MUST **恰出现 1 次**。9h-2b 的三类只覆盖「非声明源 / 锚文本」碰撞：若在声明源
    //   **自身**的注释里复制一份对象串、同时删掉真断言，字符串包含式判别仍判绿（残留
    //   盲区；FIX-040 R1 的实际缺陷即该类碰撞的跨源变体，已由 9h-2b ③ 堵住）——要求「恰 1 次」
    //   把该残留形式化关闭：同源多一份同串 ⇒ 对象存活证据不再唯一 ⇒ 判红。
    //   现状基线：**21/21 对象在其声明源内均恰 1 次**（零暴露、零误红；独立复算见 FIX-041
    //   取证件 .test-home/fix041-occurrence-count.mjs）。
    //   落地形态说明：FIX-040 R2 将该类表述为「9h-2b 第四类」；此处落地为**独立判据 9h-2d**
    //   （不折叠进 9h-2b 聚合谓词）——①判据彼此独立，独立 check 的失败定位更细；②断言
    //   计数如实体现新增判据；③不重复判别（9h-2b 仍判原三类，无并存双路径）。
    //   **告警面与 9h-2 的重叠**（FIX-041 R0 F-4 披露）：谓词 `count !== 1` **含 `count === 0`**
    //   ——即「对象被删/改名」时本项与 9h-2 的 `deadAnchors` **同时判红**（同一根因两条 FAIL）。
    //   这是**有意的冗余双报**（方向偏严、不引入假阴性），**不是**并存双实现：对象存活核验
    //   仍只有 9h-2 一条实现路径；9h-2 判据本体（含「非声明源命中」语义边界）**不得**因本项
    //   而简化或删除。本项 detail 因此语义为「同源计数总览」（`×0` 与 `×N≥2` 均入表）。
    const duplicateInSource = ANCHOR_OBJECTS_3
      .map(([, assertion, origin]) => ({ origin, assertion, count: (ANCHOR_SOURCES[origin] ?? '').split(assertion).length - 1 }))
      .filter((entry) => entry.count !== 1)
      .map((entry) => `${entry.origin}: ×${entry.count} ${entry.assertion}`)
    check('B5 9h-2d R-1: 对象串在其声明源内恰出现 1 次（同源重复/副本即红——9h-2b 跨源判据的盲区）',
      duplicateInSource.length === 0, { duplicateInSource, tableSize: ANCHOR_OBJECTS_3.length })
    // 9h-3（FIX-040 R0 P1-1-B / P2-1 收口）：**入表完备性自检**——metrics.mjs 内出现的
    //   每个「…」候选锚名（逐行抽取，兼容跨行注释被折行/截断的形态）MUST 登记在
    //   ANCHOR_OBJECTS_3 首列 ⇒ **新增锚未入表即红**——把「完备性」由人工改为机器看护
    //   （本批 P1-1 的失效链 = 新写死锚 + 表未收 + 声称「死锚即红」）。
    //   判据强度（R1 P2-1(new) 收口）：用**双向精确判据**而非子串包含式 `key.includes(label)`
    //   ——后者会让「新标签恰为既有键子串」的笔误形态（漏字/截断）静默通过。允许的两种
    //   合法形态：① label 精确等于某表键；② 某表键以 `「label」` 结尾（表键为「前缀 +
    //   「label」」的更长锚串，如 `smoke.mjs「wrapper takes over default model」`）。
    //   注（P2-1(new) 代码卫生）：早期用于兼容 `+「…」` 片段键的显式分支已随 P3-6（片段键
    //   改整串键）删除——该形态现由上述判据②覆盖（表键以 `「label」` 结尾），无遗留分支。
    //   已知漏判面（P3-1(new) 如实披露）：`<12 字符` 的短名不参与本项（避免把普通中文
    //   引号文本误纳）⇒ **短名死锚不会被本项捕获**（当前 metrics.mjs 无 <12 字符的「…」段，
    //   最短 22 字符；该阈值是显式保留的已知盲区，非声称无漏判；如需收紧可改为形态判据
    //   或对短名加显式白名单）。
    {
      const metricsLines = metricsSource.split('\n')
      const tableKeys = ANCHOR_OBJECTS_3.map(([anchor]) => anchor)
      const isKnown = (label) => tableKeys.some((key) => key === label || key.endsWith(`「${label}」`))
      const unregistered = []
      for (let index = 0; index < metricsLines.length; index++) {
        for (const match of metricsLines[index].matchAll(/「([^」]+)」/g)) {
          const label = match[1]
          if (label.length < 12) continue
          if (isKnown(label)) continue
          unregistered.push(`metrics.mjs:${index + 1} 「${label}」`)
        }
      }
      check('B5 9h-3 R-1: metrics.mjs 候选锚名全部已入对象核验表（精确匹配；新增锚未入表即红）',
        unregistered.length === 0, { tableKeys: tableKeys.length, unregistered })
    }
  }
  // 9i. FIX-035（EVO-023 R0 P2-1 收口）：attach 抛错条目**绝不入表**——否则
  //   后续订阅复用死条目（不再 attach）却记正向 event-subscribed = 静默死
  //   订阅 + 观测误导（违反 P8 / §4.3 域 4 降级行为）。三重断言：①失败零
  //   缓存（二次订阅重试 attach）②诊断落环形（code=attach-threw）③失败
  //   消费者 dispose 降级 no-op（不悬挂）；镜像同型 parity（9i-2）。
  {
    const attemptEvents = []
    const flakyListeners = new Map()
    let failNext = true
    const flakyCtx = {
      on: (event, handler) => {
        attemptEvents.push(event)
        if (failNext) { failNext = false; throw new Error('ctx disposed: cannot attach') }
        const list = flakyListeners.get(event) ?? []
        list.push(handler)
        flakyListeners.set(event, list)
        return () => { flakyListeners.set(event, (flakyListeners.get(event) ?? []).filter((item) => item !== handler)) }
      },
    }
    let degradedCalls = 0
    const disposeFailed = subscribeEvents(flakyCtx, [{ event: 'settings/updated', consumer: 'degraded-consumer', handler: () => { degradedCalls += 1 } }])
    check('FIX-035 9i: attach 抛错 → 条目不入表（零宿主 listener，无假订阅）',
      attemptEvents.length === 1 && (flakyListeners.get('settings/updated') ?? []).length === 0)
    check('FIX-035 9i: attach 抛错记 event-subscribe-failed（P8：面名 + code=attach-threw + consumer 标签 + 错误摘要截断）',
      hostDiagnostics().entries.some((entry) => entry.kind === 'event-subscribe-failed' && entry.face === 'settings/updated'
        && entry.code === 'attach-threw' && entry.consumer === 'degraded-consumer' && String(entry.detail).includes('ctx disposed')))
    check('FIX-035 9i: 失败消费者不得记正向 event-subscribed（观测误导消除——诊断不再是「已订阅」的相反信号）',
      !hostDiagnostics().entries.some((entry) => entry.kind === 'event-subscribed' && entry.face === 'settings/updated' && entry.consumer === 'degraded-consumer'))
    // ① 失败条目未缓存 → 同目标同事件二次订阅**重新 attach** 并成功（自愈；
    //   静默死订阅消除——P2-1 的核心判别锚，失败消费者仍在订阅态下测）。
    let retryCalls = 0
    const disposeRetry = subscribeEvents(flakyCtx, [{ event: 'settings/updated', consumer: 'retry-consumer', handler: () => { retryCalls += 1 } }])
    check('FIX-035 9i: 失败条目未缓存 → 二次订阅重试 attach（零复用死条目）',
      attemptEvents.length === 2 && (flakyListeners.get('settings/updated') ?? []).length === 1,
      { attempts: attemptEvents, listeners: (flakyListeners.get('settings/updated') ?? []).length })
    for (const handler of flakyListeners.get('settings/updated') ?? []) handler()
    check('FIX-035 9i: 重试成功后消费者真正收到事件（零 host listener 的静默收不到已消除）',
      retryCalls === 1 && degradedCalls === 0)
    // ③ 入表后跨调用聚合语义不破（第三次订阅零 attach；卸载按 consumer 摘除）。
    const disposeThird = subscribeEvents(flakyCtx, [{ event: 'settings/updated', consumer: 'third-consumer', handler: () => { retryCalls += 1 } }])
    check('FIX-035 9i 非回归: attach 成功后入表 → 跨调用共享单 listener（零第三次 attach）',
      attemptEvents.length === 2 && (flakyListeners.get('settings/updated') ?? []).length === 1)
    for (const handler of flakyListeners.get('settings/updated') ?? []) handler()
    check('FIX-035 9i 非回归: 共享 listener 分发给重试消费者 + 后到消费者（聚合不破）', retryCalls === 3)
    // ② 失败消费者 dispose 为 no-op（幂等、不抛、不悬挂、零跨消费者误摘）。
    check('FIX-035 9i: 失败路径 dispose 降级 no-op（幂等、不抛——活消费者不受影响）', (() => {
      try { disposeFailed(); disposeFailed(); return retryCalls === 3 } catch { return false }
    })())
    for (const handler of flakyListeners.get('settings/updated') ?? []) handler()
    check('FIX-035 9i: 失败消费者 dispose 后活消费者照常派发（无悬挂、无误摘）', retryCalls === 5)
    disposeRetry()
    disposeThird()
    check('FIX-035 9i 非回归: 全量卸载后 listener 归零（无残留泄漏）', (flakyListeners.get('settings/updated') ?? []).length === 0)

    // 9i-2. 镜像 parity（lib/client.js subscribeClientEvents 同型分支；§9e 先例）。
    const mirrorAttempts = []
    const mirrorFlaky = new Map()
    let mirrorFailNext = true
    const flakyOn = (event, handler) => {
      mirrorAttempts.push(event)
      if (mirrorFailNext) { mirrorFailNext = false; throw new Error('remote $on disposed: cannot attach') }
      const list = mirrorFlaky.get(event) ?? []
      list.push(handler)
      mirrorFlaky.set(event, list)
      return () => { mirrorFlaky.set(event, (mirrorFlaky.get(event) ?? []).filter((item) => item !== handler)) }
    }
    const mirrorDiagOf = () => bundleExportsB5.createClientRemotes({ get: () => undefined, remote: {} }).health().diag
    let mirrorRetryCalls = 0
    const disposeMirrorFailed = bundleExportsB5.subscribeClientEvents(flakyOn, [{ event: 'agent-preset/selected', consumer: 'degraded-mirror-consumer', handler: () => { mirrorRetryCalls += 1 } }])
    check('FIX-035 9i-2 镜像 parity: attach 抛错条目不入表 + 本地诊断 event-subscribe-failed（code=attach-threw，与权威侧同语义）',
      mirrorAttempts.length === 1 && (mirrorFlaky.get('agent-preset/selected') ?? []).length === 0
      && mirrorDiagOf().some((entry) => entry.kind === 'event-subscribe-failed' && entry.face === 'agent-preset/selected' && entry.code === 'attach-threw' && entry.consumer === 'degraded-mirror-consumer'))
    const disposeMirrorRetry = bundleExportsB5.subscribeClientEvents(flakyOn, [{ event: 'agent-preset/selected', consumer: 'mirror-retry-consumer', handler: () => { mirrorRetryCalls += 1 } }])
    check('FIX-035 9i-2 镜像 parity: 二次订阅重试 attach（失败条目零复用——镜像与权威侧同判别）',
      mirrorAttempts.length === 2 && (mirrorFlaky.get('agent-preset/selected') ?? []).length === 1,
      { attempts: mirrorAttempts, listeners: (mirrorFlaky.get('agent-preset/selected') ?? []).length })
    for (const handler of mirrorFlaky.get('agent-preset/selected') ?? []) handler()
    check('FIX-035 9i-2 镜像 parity: 重试成功后消费者收到事件（镜像零静默死订阅）', mirrorRetryCalls === 1)
    check('FIX-035 9i-2 镜像 parity: 失败路径 dispose 降级 no-op（幂等、不抛、活消费者不受影响）', (() => {
      try { disposeMirrorFailed(); disposeMirrorFailed(); return mirrorRetryCalls === 1 } catch { return false }
    })())
    for (const handler of mirrorFlaky.get('agent-preset/selected') ?? []) handler()
    check('FIX-035 9i-2 镜像 parity: 失败消费者 dispose 后活消费者照常派发', mirrorRetryCalls === 2)
    disposeMirrorRetry()
    check('FIX-035 9i-2 镜像 parity: 全量卸载后 listener 归零', (mirrorFlaky.get('agent-preset/selected') ?? []).length === 0)
  }

  void eventsSourceB5
}

console.log(failures === 0 ? `\nALL HOST ABI HEALTH TESTS PASSED (${passed} assertions)` : `\n${failures} FAILURE(S) (${passed} passed)`)
process.exit(failures === 0 ? 0 : 1)
