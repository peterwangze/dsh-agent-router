// FIX-029 判别测试：宿主 0.1.2-rc.1 双回归（FIX-028 同源漏网面）。
//
// 根因 A（问题②：手切 +多模态 后首图轮被改写成标记文本）：
//   会话 94adf09f 实证 [94184/94185 model/selection glm-local-router] →
//   [94190 user/message 图片块被替换为标记文本] → [94192 request/header
//   glm-local-router 实际路由 = twin]。宿主 selectionFor（dsh-api-session-
//   controller types/agent.js:297-318）首层 = picked，由 durable
//   model/selection 投影 pending 初始化（sessionProjections.stateOf(session,
//   'modelSelection').pending）；pre-step 时当前请求 header 尚未写入，日志末条
//   header 是旧 provider（stale）→ 旧 sessionProvider 链（header → live
//   default → options）误判 onWrapperRoute=false → 逃生组改写污染会话日志。
//
// 根因 B（问题①：贴图不自动接管）：新宿主 conversation.input.right
//   standardProps 只提供 useInput（SnapshotSelectorHook）/inputActions/
//   sessionId（dsh-cordis-client-runner slots 目录 :2920-2932；宿主先例
//   dsh-client-ui-plan inject(sessionId)），不再提供 input（快照 prop）——
//   宿主注入面 = 该宿主包 `lib/client.js` 的 `InputHub` 装配点
//   `ctx.uiSession.provide({ hooks: ["conversation", "input"], props: ["inputActions"], ... })`；input → useInput
//   契约由该包 `SessionStandardProps.useInput` 承载（`lib/types/client/contract/slots.d.ts` 的
//   `useInput: SnapshotSelectorHook<InputState>`）——均为 FIX-044 宿主只读实读定位所得。
//   **FIX-043 批 F 判定 → FIX-044 改指（与 `lib/client.js` 侧同判 = 跨文件同步）**：原锚（对象 =
//   `dsh-client-ui-conversation` 的 `:16041-16056`）的**对象不成立**——`PropsHooks` 在该宿主包内 **0 命中**，
//   该区间实为 InputBar 的 JSX 渲染段（批 C 宿主只读实读判定「不准」）。批 F 按 P10-④ 维持原锚 + 显式登记；
//   本批在同一纪律下**先定位、后改指**为上记实读可达面（零新增未实证符号）。登记面 =
//   `tests/host-abi-health.mjs` 的本文件条目 `notes`（同条另有 `types/agent.js` 的 `:297-318`
//   判据承载锚的保留登记）。
//   ModelTakeover 读 props.input.imageIds → undefined → imageCount 恒 0 →
//   takeoverArmed 永不成立（贴图不接管，用户被迫手动切换）。
//
// 判别断言（TDD 先红后绿）：
//   A-组（prestep pending 优先层）：
//     A1: stale header（旧 provider）+ durable pending（twin）→ 图片块保留
//         （旧实现读 stale header → 逃生组改写 → 必败红）；
//     A2: 同场景不产生标记文本 + reminder 注入保持（accepts 链不回退）；
//     A3: pending 指向非 wrapper（用户切回原生后发图）→ 逃生组改写保持
//         （C-3 纯文本主模型不见裸图块，安全方向不回退）；
//     A4: 投影服务缺失/未注册（旧宿主形态）→ 回落既有 header 链（行为不变）；
//     A5: pending=null（选择已被 request/header 消费）→ 回落 header 链。
//   B-组（ModelTakeover useInput hook 面）：
//     B1: 仅 useInput（新宿主真实形态，快照含 imageIds）→ 贴图接管 twin
//         （旧实现读 props.input undefined → 不接管 → 必败红）；
//     B2: useInput 快照 imageIds 变化（贴图→发送）→ imageCount 驱动与既有
//         input prop 形态同源（发送后保持语义不回退）；
//     B3: 双形态兼容——props.input（旧宿主/旧夹具形态）仍驱动（不破坏
//         FIX-012 既有语义）。
//
// 门控：独立运行（node tests/fix-029-host-contract.mjs），exit 0 全绿。
import { readFileSync } from 'node:fs'
import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createUserMessage } from '@deepseek-ai/dsh-llm/message'
import { installPreStep } from '../lib/prestep.js'

let failures = 0
function check(label, condition) {
  if (condition) console.log(`  ok  ${label}`)
  else { failures++; console.error(`FAIL  ${label}`) }
}

process.env.DSH_HOME = '.tmp-fix029-home'

const WRAP_SUFFIX = '-router'

// ── A 组夹具：prestep handler 直驱（同 fix-010 harness，扩展 sessionProjections 面）──
function installPrestepHarness(service, faces = {}) {
  let handler
  const ctx = {
    get: (key) => {
      if (key === 'llm') return faces.llm
      if (key === 'agentDefaultModel') return faces.agentDefaultModel
      if (key === 'sessionProjections') return faces.sessionProjections
      return undefined
    },
    on: (_event, fn) => { handler = fn; return () => undefined },
    logger: { warn: () => undefined, info: () => undefined },
  }
  installPreStep(ctx, service)
  return async (agent, messages) => {
    const decision = await handler(
      { agent, messages, turn: 0, step: 0, signal: undefined },
      async () => ({ kind: 'enter', messages }),
    )
    return decision.messages
  }
}

const fakeService = {
  isEnabled: () => true,
  getState: () => ({ enabled: true, takeoverDefaultModel: false }),
  listImageVisionAgents: () => [['vision', { name: '视觉', type: 'chat', enabled: true, capabilities: ['image'] }]],
  listImageGenerationAgents: () => [],
}

/** 宿主 sessionProjections 面 mock：stateOf(session,'modelSelection') → {lastUsed, pending}。 */
const projectionsOf = (state) => ({ stateOf: (_session, key) => (key === 'modelSelection' ? state : undefined) })

const imgPlusText = () => [
  createUserMessage({
    content: [
      { type: 'image', attachment: { attachmentId: 'sha256:fix029', mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'shot.png' } },
      { type: 'text', text: '看图' },
    ],
    source: { kind: 'user' },
  }),
]
const hasImageBlock = (msgs) => msgs.some((m) => Array.isArray(m?.content) && m.content.some((b) => b?.type === 'image'))
const hasMarkerText = (msgs) => msgs.some((m) => Array.isArray(m?.content) && m.content.some((b) => b?.type === 'text' && typeof b.text === 'string' && b.text.includes('请直接调用 route_agent 工具')))
const hasReminder = (msgs) => msgs.some((m) => Array.isArray(m?.content) && m.content.some((b) => b?.type === 'text' && typeof b.text === 'string' && b.text.includes('本轮消息包含图片')))

console.log('fix-029 A: prestep durable pending selection (RED on current code — stale header wins):')
{
  // 故障会话 94adf09f 形态复刻：末条 request/header = glm-local（旧 provider，
  // stale），durable pending = glm-local-router（用户手切 twin，尚未发请求）。
  const staleHeaderAgent = {
    options: { provider: 'glm-local', model: 'glm-5.3' },
    session: { requestHeader: () => ({ config: { provider: 'glm-local', model: 'glm-5.3' } }) },
  }

  // A1/A2：pending twin 优先 → onWrapperRoute=true → 图片块保留。
  const runPending = installPrestepHarness(fakeService, {
    sessionProjections: projectionsOf({ lastUsed: { provider: 'glm-local', model: 'glm-5.3' }, pending: { provider: `glm-local${WRAP_SUFFIX}`, model: 'glm-5.3' } }),
  })
  const outA1 = await runPending(staleHeaderAgent, imgPlusText())
  check('A1: stale header + pending twin → 保留原始 image 块（旧实现必败：逃生组改写）', hasImageBlock(outA1))
  check('A2: 同场景标记文本不进会话历史 + reminder 注入保持（accepts 链不回退）', !hasMarkerText(outA1) && hasReminder(outA1))

  // A3：pending 指向非 wrapper（用户切回原生发图）→ 逃生组改写保持（C-3）。
  const runNative = installPrestepHarness(fakeService, {
    sessionProjections: projectionsOf({ lastUsed: { provider: `glm-local${WRAP_SUFFIX}`, model: 'glm-5.3' }, pending: { provider: 'glm-local', model: 'glm-5.3' } }),
  })
  const outA3 = await runNative(staleHeaderAgent, imgPlusText())
  check('A3: pending 非 wrapper → 逃生组改写保持（纯文本主模型不见裸图块）', !hasImageBlock(outA3) && hasMarkerText(outA3))

  // A4：投影服务缺失（旧宿主）→ 回落既有 header 链——header=非 wrapper → 改写保持。
  const runNoProj = installPrestepHarness(fakeService)
  const outA4 = await runNoProj(staleHeaderAgent, imgPlusText())
  check('A4: 投影服务缺失 → 回落 header 链（旧行为不变：改写保持）', !hasImageBlock(outA4) && hasMarkerText(outA4))

  // A5：pending=null（选择已被 request/header 消费）→ 回落 header 链。
  const runConsumed = installPrestepHarness(fakeService, {
    sessionProjections: projectionsOf({ lastUsed: { provider: `glm-local${WRAP_SUFFIX}`, model: 'glm-5.3' }, pending: null }),
  })
  const outA5 = await runConsumed(staleHeaderAgent, imgPlusText())
  check('A5: pending 已消费（null）→ 回落 header 链（改写保持）', !hasImageBlock(outA5) && hasMarkerText(outA5))

  // A6：stateOf 抛错（会话形态漂移防御）→ 回落 header 链，handler 不击穿。
  const runThrow = installPrestepHarness(fakeService, {
    sessionProjections: { stateOf: () => { throw new Error('projection materialize failed') } },
  })
  let outA6 = null
  let threw = false
  try { outA6 = await runThrow(staleHeaderAgent, imgPlusText()) } catch { threw = true }
  check('A6: stateOf 抛错 → 回落 header 链（handler 不击穿，改写保持）', !threw && !hasImageBlock(outA6) && hasMarkerText(outA6))
}

// ── B 组：ModelTakeover useInput hook 面（新宿主真实 slot props 形态）──
// 迷你 React（同 fix-012 harness 语义）。
function makeMiniReact() {
  const instances = new Map()
  const frameStack = []
  let dirty = false
  const hookSlot = (inst, index) => {
    let slot = inst.hooks[index]
    if (!slot) slot = inst.hooks[index] = {}
    return slot
  }
  const arraysEqual = (a, b) => {
    if (a === b) return true
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    for (let index = 0; index < a.length; index++) if (!Object.is(a[index], b[index])) return false
    return true
  }
  function useState(initial) {
    const inst = frameStack[frameStack.length - 1]
    const slot = hookSlot(inst, inst.hookIndex++)
    if (!slot.has) { slot.has = true; slot.value = typeof initial === 'function' ? initial() : initial }
    const setter = (value) => {
      const next = typeof value === 'function' ? value(slot.value) : value
      if (Object.is(next, slot.value)) return
      slot.value = next
      dirty = true
    }
    return [slot.value, setter]
  }
  function useEffect(fn, deps) {
    const inst = frameStack[frameStack.length - 1]
    const slot = hookSlot(inst, inst.hookIndex++)
    slot.fn = fn
    inst.effects.push(slot)
    if (slot.deps === undefined || !arraysEqual(slot.deps, deps)) { slot.deps = deps; slot.pending = true }
    else slot.pending = false
  }
  function useCallback(fn, deps) {
    const inst = frameStack[frameStack.length - 1]
    const slot = hookSlot(inst, inst.hookIndex++)
    if (slot.has && arraysEqual(slot.deps, deps)) return slot.value
    slot.has = true
    slot.deps = deps
    slot.value = fn
    return fn
  }
  function useRef(initial) {
    const inst = frameStack[frameStack.length - 1]
    const slot = hookSlot(inst, inst.hookIndex++)
    if (!slot.has) { slot.has = true; slot.value = { current: initial } }
    return slot.value
  }
  function createElement(type, props, ...children) {
    const flat = []
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false || child === true) continue
      flat.push(child)
    }
    const element = { type, props: { ...(props ?? {}) } }
    if (flat.length > 0) element.props.children = flat
    return element
  }
  const react = { createElement, useState, useEffect, useCallback, useRef }
  let rootElement = null
  let rootKey = 'root'
  function callComponent(type, props, pathKey) {
    let inst = instances.get(pathKey)
    if (!inst) { inst = { hooks: [], hookIndex: 0, effects: [] }; instances.set(pathKey, inst) }
    inst.hookIndex = 0
    inst.effects = []
    frameStack.push(inst)
    let result
    try { result = type(props) } catch (error) { renderErrors.push(error); result = null }
    frameStack.pop()
    for (const slot of inst.effects) {
      if (!slot.pending) continue
      try { slot.fn() } catch (error) { renderErrors.push(error) }
    }
    return result
  }
  const renderErrors = []
  async function settle(maxTurns = 40) {
    for (let turn = 0; turn < maxTurns; turn++) {
      if (dirty) {
        dirty = false
        renderErrors.length = 0
        callComponent(rootElement.type, rootElement.props, rootKey)
      }
      await new Promise((resolve) => setImmediate(resolve))
      if (!dirty) {
        await new Promise((resolve) => setImmediate(resolve))
        if (!dirty) return
      }
    }
  }
  async function renderInto(element, pathKey) {
    rootElement = element
    rootKey = pathKey
    dirty = true
    await settle()
  }
  return { react, renderInto, renderErrors }
}

const sourcePath = process.env.FIX029_CLIENT_SOURCE
  ? (isAbsolute(process.env.FIX029_CLIENT_SOURCE) ? process.env.FIX029_CLIENT_SOURCE : join(process.cwd(), process.env.FIX029_CLIENT_SOURCE))
  : join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js')
const source = readFileSync(sourcePath, 'utf8')
const captured = { bundle: null }
const fakeWindow = { __ModuleLoader__: { load: (payload) => { captured.bundle = payload } } }
new Function('window', source)(fakeWindow)
check('client bundle evaluates', !!captured.bundle && typeof captured.bundle.factory === 'function')
const { react, renderInto, renderErrors } = makeMiniReact()
const bundleExports = captured.bundle.factory((name) => {
  if (name === 'react') return react
  throw new Error(`unexpected require: ${name}`)
})
check('FIX-029 test hooks exported (ModelTakeover + setRouterCatalog)', typeof bundleExports.ModelTakeover === 'function' && typeof bundleExports.setRouterCatalog === 'function')

const NATIVE = { provider: 'deepseek-official', model: 'deepseek-v4-flash' }
const TWIN = { provider: 'deepseek-official-router', model: 'deepseek-v4-flash' }
const visionAgents = [
  { id: 'vision', name: '视觉', type: 'chat', enabled: true, capabilities: ['image'], provider: 'deepseek-official', model: 'deepseek-v4-flash-vision-exp' },
]
const catalogOf = (takeoverDefaultModel) => ({ ok: true, enabled: true, takeoverDefaultModel, defaults: { ...NATIVE }, agents: visionAgents, oauthAccounts: [], pools: [], cliAgents: [] })
function makeApi(initial = NATIVE) {
  let current = { ...initial }
  const calls = []
  return {
    api: {
      sessions: {
        models: async () => ({ result: { ok: true, value: { current: { ...current }, routable: true, groups: [], failures: [] } } }),
        selectModel: async (payload) => {
          calls.push({ ...payload })
          current = { provider: payload.provider, model: payload.model }
          return { result: { ok: true, value: { selected: { provider: payload.provider, model: payload.model } } } }
        },
      },
    },
    calls,
  }
}
const twinSelect = (calls) => calls.some((call) => call.provider === TWIN.provider && call.model === TWIN.model)

console.log('fix-029 B: ModelTakeover useInput slot face (RED on current code — props.input only):')
{
  // B1：新宿主真实形态——只有 useInput（selector hook），无 input 快照 prop。
  //    旧实现读 props.input → undefined → imageCount=0 → 不接管（必败红）。
  const b1 = makeApi()
  bundleExports.setRouterCatalog(catalogOf(false))
  await renderInto(react.createElement(bundleExports.ModelTakeover, {
    sessionId: 'b1',
    useInput: (sel) => sel({ imageIds: ['img-1'] }),
    api: b1.api,
  }), 'takeover-b1')
  check('B1: 仅 useInput（新宿主形态）+ 贴图 → 自动接管 twin（旧实现必败：读 props.input 不武装）', twinSelect(b1.calls))

  // B2：useInput 快照 imageIds 空态（无图）→ 永不切换（FIX-002 主权不回退）。
  const b2 = makeApi()
  bundleExports.setRouterCatalog(catalogOf(false))
  await renderInto(react.createElement(bundleExports.ModelTakeover, {
    sessionId: 'b2',
    useInput: (sel) => sel({ imageIds: [] }),
    api: b2.api,
  }), 'takeover-b2')
  check('B2: useInput 空态（无图 + 开关 false）→ 永不切换', b2.calls.length === 0)

  // B3：双形态兼容——props.input（旧宿主/旧夹具形态）仍驱动（FIX-012 既有语义）。
  const b3 = makeApi()
  bundleExports.setRouterCatalog(catalogOf(false))
  await renderInto(react.createElement(bundleExports.ModelTakeover, {
    sessionId: 'b3',
    input: { imageIds: ['img-1'] },
    api: b3.api,
  }), 'takeover-b3')
  check('B3: props.input（旧形态）+ 贴图 → 接管 twin（双形态兼容，不破坏 FIX-012）', twinSelect(b3.calls))

  // B4：发送后保持——useInput 快照 imageIds 归零 → 零还原调用（FIX-012 语义在
  //     hook 形态下不回退）。
  const b4 = makeApi()
  bundleExports.setRouterCatalog(catalogOf(false))
  await renderInto(react.createElement(bundleExports.ModelTakeover, {
    sessionId: 'b4',
    useInput: (sel) => sel({ imageIds: ['img-1'] }),
    api: b4.api,
  }), 'takeover-b4')
  b4.calls.length = 0
  await renderInto(react.createElement(bundleExports.ModelTakeover, {
    sessionId: 'b4',
    useInput: (sel) => sel({ imageIds: [] }),
    api: b4.api,
  }), 'takeover-b4')
  check('B4: useInput 形态发送后保持 twin（imageCount 归零零还原）', b4.calls.length === 0)
}

if (renderErrors.length > 0) {
  failures += renderErrors.length
  console.error(`FAIL  render errors: ${renderErrors.map((error) => String(error)).join(' | ')}`)
}
// ── C 组：装配点透传契约（FIX-029-B 事故回归守卫）────────────────────────
// 事故形态：组件内修复 B 消费 props.useInput，但 apply() 装配点只透传
// props.input（新宿主恒 undefined，探针实测 input=undefined/useInput=
// function/imgs=1 而接管无声）→ 组件 useInput=undefined → 回落 input=
// undefined → imageCount=0 → 永不武装且 skip-idle 静默。组件级测试（B 组）
// 直渲染组件绕过装配层，漏掉该形态（mock 保真度第六次同型）——本组以装配点
// 源码契约守住：ModelTakeover 装配必须透传 useInput。
console.log('fix-029 C: assembly prop wiring (RED if wiring dropped):')
{
  const mount = source.indexOf('el(ModelTakeover, {')
  check('C0: ModelTakeover 装配点存在', mount > 0)
  if (mount > 0) {
    const wiring = source.slice(mount, source.indexOf('}))', mount))
    check('C1: 装配点透传 useInput（props.useInput → 组件）', /useInput:\s*props\.useInput/.test(wiring))
    check('C2: 装配点透传 sessionId', /sessionId:\s*props\.sessionId/.test(wiring))
    check('C3: 装配点透传 api', /api:\s*props\.api/.test(wiring))
  }
  const served = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'served-client.js'), 'utf8')
  const servedMount = served.indexOf('el(ModelTakeover, {')
  const servedWiring = servedMount > 0 ? served.slice(servedMount, served.indexOf('}))', servedMount)) : ''
  check('C4: served-client 镜像装配同步透传 useInput', servedMount > 0 && /useInput:\s*props\.useInput/.test(servedWiring))
}

// ── D 组：EVO-021（ARCH-004 B3 / 设计 §3 D1-2 + ADR-ARCH-004-B）负向守卫：
// apiProxy 旧会话选择面防复活（源码级）+ llmFaceOf 三方法并集判别（P2-1
// 拆半：功能性门控半项落 llmFaceOf；probe 半项随 host-abi-health.mjs 桩
// 同步，Coordinator 已绑定 EVO-020 收口）。任务原文「A4 旧面回落」系错位
// 引用（本文件 A4 = prestep sessionProjections 回落，与 apiProxy 无关且
// 保持不变）——apiProxy 正向用例真身在 tests/preset-defaults.mjs 播种夹具
// （A-J 节），行为级防复活守卫在该文件 N 节；本组补源码级守卫与域接口判别。
console.log('fix-029 D: D1-2 legacy apiProxy face stays dead + llmFaceOf union gate:')
{
  const domainSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'host-abi', 'llm-selection.js'), 'utf8')
  check('D1: llm-selection 域源码零 apiProxy 解析（D1-2 旧面删除——复活即红）', !/get\(['"]apiProxy['"]\)/.test(domainSource))
  check('D2: sessionSelectFaceOf 域内单形态（sessionController 解析；宿主锚 dsh-api-session-controller 的 selectModel(request) 面 + Remote("selectModel") 注册）', /sessionSelectFaceOf/.test(domainSource) && /get\('sessionController'\)/.test(domainSource))
  check('D3: 域接口 §4.3 域 2 五函数齐备（llmFaceOf/sessionSelectFaceOf/inheritedRouteOf/liveDefaultSelection/sessionNeverProduced）',
    ['llmFaceOf', 'sessionSelectFaceOf', 'inheritedRouteOf', 'liveDefaultSelection', 'sessionNeverProduced']
      .every((name) => new RegExp(`export function ${name}\\b`).test(domainSource)))
  let llmSelection = null
  try { llmSelection = await import('../lib/host-abi/llm-selection.js') } catch { /* RED：导出缺失 */ }
  const fullFace = { registerAdapter: () => {}, registration: () => {}, listModels: async () => [] }
  const missingListModels = { registerAdapter: () => {}, registration: () => {} }
  check('D4: llmFaceOf 三方法并集门控（缺 listModels → null；三方法齐 → 面本体；宿主 LlmRuntime 0.1.5-rc.2 的 registerAdapter/registration/listModels 三方法齐备实证 dsh-llm——零回退）',
    typeof llmSelection?.llmFaceOf === 'function'
    && llmSelection.llmFaceOf({ get: (name) => (name === 'llm' ? missingListModels : undefined) }) === null
    && llmSelection.llmFaceOf({ get: (name) => (name === 'llm' ? fullFace : undefined) }) === fullFace)
  const consumerSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'preset-defaults.js'), 'utf8')
  check('D5: preset-defaults 本地实现已删（六函数 import 切换自 host-abi——P5 源码面零残留）',
    !/function (sessionSelectFaceOf|liveDefaultSelection|inheritedRouteOf|sessionNeverProduced|agentPresetsServiceOf|agentsRegistryOf)\s*\(/.test(consumerSource))
}
console.log(failures === 0 ? '\nALL FIX-029 DISCRIMINANT TESTS PASSED' : `\n${failures} FIX-029 ASSERTION(S) FAILED (RED — fix pending)`)
process.exit(failures === 0 ? 0 : 1)
