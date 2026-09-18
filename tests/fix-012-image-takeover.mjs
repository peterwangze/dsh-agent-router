// FIX-012 判别测试：ModelTakeover 图片条件化接管（用户裁决 2026-08-30：
// 贴图即切、发送后保持）。
//
// 问题形态（用户实证 2026-08-30）：主模型为文本模型（DeepSeek-V4-Flash Max）
// 时发送带图消息 → 宿主 GUI Toast「当前模型不支持图片」消息被拦。RCA：
// apiproxy prompt 准入（dsh-api-session-controller 的 prompt 侧准入
// MODEL_DOES_NOT_SUPPORT_IMAGES）按当前选中
// 模型的 inputModalities 判图，纯文本模型拒绝（MODEL_DOES_NOT_SUPPORT_IMAGES）；
// 插件 ModelTakeover 的武装条件（FIX-002 后）只看 takeoverDefaultModel 开关
// （默认 false）→ 永不自动切到包装路由 twin → 拦截复现。
//
// 宿主核实（2026-08-30 只读，dsh-api-session-controller）：
//   - session.selectModel（dsh-api-session-controller 的 selectModel(request) 面）
//     仅 resolveCallConfig + 写
//     selectionFor.current（+ best-effort saveDefaultModelSelection），对会话
//     历史/草稿中的图片零校验——旧注释「会话已含图时宿主拒绝切回纯文本」
//     （lib/client.js 的旧假设；该假设现已在组件头注释中标注「不成立」）不成立；
//   - 图片准入只在 prompt 时点（MODEL_DOES_NOT_SUPPORT_IMAGES）
//     与 pi-ai stream 时点（dsh-llm-pi-ai 的 UNSUPPORTED_CONTENT 判定）。
//   → 还原语义按任务方案 P1（基于事实，不臆造）：image-conditional 接管
//     **永不自动还原**——「发送后 imageCount 归零」与「移除未发送图片归零」
//     在组件观测面不可区分（无会话日志查询面）；宿主不拒绝还原意味着还原会
//     成功切回纯文本，下一张图 prompt 被拦（用户报障形态复现）。保持 twin
//     直到用户手动切换（清记忆尊重）或开启 takeoverDefaultModel 后（armed
//     分支把 armedBy 升级为 switch）走既有还原。
//
// 判别断言：
//   ① 四象限（有图/无图 × takeoverDefaultModel true/false）——「有图+开关
//      false」象限旧代码（armed 仅看开关）必败：不接管；
//   ② 贴图接管（写 takeoverMemory——以「解除武装不还原」行为反向证明记忆写入）；
//   ③ 发送后保持：imageCount 归零后**零还原调用**——selectModel mock 返回 ok
//      （宿主真实行为），断言不依赖「宿主拒绝还原」这一不成立假设；
//   ④ 移除未发送图片同③（不可区分，固化永不自动还原语义）；
//   ⑤ 用户手动 twin（无记忆）永不撤销（FIX-002-R7 F1 不回退）；
//   ⑥ 纯文本轮（无图+开关 false）永不切换（FIX-002 主权）；
//   ⑦ 开关驱动接管在解除武装（多模态 agent 清空）后仍走既有还原——「永不
//      自动还原」仅限 image 来源，不吞开关语义（FIX-002 主权不回退）；
//   ⑧ 「开启 takeoverDefaultModel 后走既有还原」：image 接管 → 发送保持 →
//      开关开启（armed 分支升级 armedBy=switch）→ 开关关闭 → 还原发生。
//
// 驱动方式：评估 lib/client.js（window.__ModuleLoader__ 格式）→ 迷你 React
// 渲染 ModelTakeover（测试钩子导出，host 仅消费 apply/inject）→ mock
// sessions.models/selectModel 记录调用序列。旧代码（FIX-012 未实现）下测试
// 钩子缺失 → RED（exit 1）；新代码全绿（exit 0）。
import { readFileSync } from 'node:fs'
import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

let failures = 0
function check(label, condition) {
  if (condition) console.log(`  ok  ${label}`)
  else { failures++; console.error(`FAIL  ${label}`) }
}

// ── 迷你 React 运行时（同 client-render 语义：deps 去重 + 脏标记 settle）──
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

// ── 装配：评估浏览器包 → 迷你 React → 导出测试钩子 ─────────────────────
// FIX012_CLIENT_SOURCE（可选）：覆盖被测 client.js 路径——TDD RED 阶段对
// 「旧逻辑 + 仅追加测试钩子」的临时副本运行，证明 Q1 等断言在旧逻辑下必败
// （逻辑级判别，而非仅钩子缺失）。
const sourcePath = process.env.FIX012_CLIENT_SOURCE
  ? (isAbsolute(process.env.FIX012_CLIENT_SOURCE) ? process.env.FIX012_CLIENT_SOURCE : join(process.cwd(), process.env.FIX012_CLIENT_SOURCE))
  : join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js')
const source = readFileSync(sourcePath, 'utf8')
const captured = { bundle: null }
const fakeWindow = { __ModuleLoader__: { load: (payload) => { captured.bundle = payload } } }
new Function('window', source)(fakeWindow)
check('client bundle evaluates', !!captured.bundle && captured.bundle.id === 'dsh-agent-router' && typeof captured.bundle.factory === 'function')
const { react, renderInto, renderErrors } = makeMiniReact()
const bundleExports = captured.bundle.factory((name) => {
  if (name === 'react') return react
  throw new Error(`unexpected require: ${name}`)
})
check('client exports apply/inject', typeof bundleExports.apply === 'function' && Array.isArray(bundleExports.inject))
check('FIX-012 test hooks exported (ModelTakeover + setRouterCatalog)', typeof bundleExports.ModelTakeover === 'function' && typeof bundleExports.setRouterCatalog === 'function')
if (typeof bundleExports.ModelTakeover !== 'function' || typeof bundleExports.setRouterCatalog !== 'function') {
  console.error('\nRED: FIX-012 测试钩子未导出（旧代码未实现）——判别测试无法驱动组件；exit 1')
  process.exit(1)
}

// ── 夹具 ───────────────────────────────────────────────────────────────
const WRAP_SUFFIX = '-router'
const NATIVE = { provider: 'deepseek-official', model: 'deepseek-v4-flash' }
const TWIN = { provider: 'deepseek-official-router', model: 'deepseek-v4-flash' }
const visionAgents = [
  { id: 'vision', name: '视觉', type: 'chat', enabled: true, capabilities: ['image'], provider: 'deepseek-official', model: 'deepseek-v4-flash-vision-exp' },
]
function catalogOf(takeoverDefaultModel, agents = visionAgents) {
  return { ok: true, enabled: true, takeoverDefaultModel, defaults: { ...NATIVE }, agents, oauthAccounts: [], pools: [], cliAgents: [] }
}
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
    setCurrent: (value) => { current = { ...value } },
  }
}
const twinSelect = (calls) => calls.some((call) => call.provider === TWIN.provider && call.model === TWIN.model)
const nativeSelect = (calls) => calls.some((call) => call.provider === NATIVE.provider && call.model === NATIVE.model)
// FIX-048 标注：本 helper 为**旧宿主形态回落**测试通道——props.input.imageIds
// （宿主 0.1.2-rc.x 前契约，长度即图片数）。现行宿主 0.1.5-rc.1 的 InputState
// （attachmentIds 统一编址）经下方 inputStateOf/takeoverNew 新形态通道驱动。
const takeover = (api, sessionId, imageIds, pathKey) => renderInto(react.createElement(bundleExports.ModelTakeover, { sessionId, input: { imageIds }, api }), pathKey)

// ── FIX-048 新形态夹具（逐字段锚定宿主 InputState 契约，禁心智模型桩——P10-④）──
// 权威宿主契约（2026-09-18 只读实读，宿主 npx checkout 实跑版 0.1.5-rc.1，包
// @deepseek-ai/dsh-client-ui-conversation）：
//  - `lib/types/client/contract/input.d.ts` 的 `export interface InputState`：
//    字段 draft / attachmentIds / draftRev / phase / claim / occurrences /
//    queue；附件 = 不透明 `attachmentIds: readonly DraftAttachmentId[]`
//    （M2 image/file 统一编址），**无 imageIds 字段**（宿主消费点 = 同包
//    lib/client.js 的 InputBar：resolveDraftAttachments(input.attachmentIds)）。
//  - kind 解析面：`lib/types/client/service.d.ts` 的
//    `resolveDraftAttachments(ids): readonly ComposerAttachment[]`
//    （ConversationController 以 `conversation` 名注册 plugin ctx——宿主
//    lib/client.js `super(ctx, "conversation")`）；`ComposerAttachment.kind:
//    'image' | 'file'`（`lib/types/client/contract/slots.d.ts` 的
//    ComposerImageAttachment / ComposerFileAttachment）。
const inputStateOf = (attachmentIds) => ({
  draft: '', attachmentIds, draftRev: 1, phase: 'plain', occurrences: [], queue: [],
})
const makeConversation = (kindsById) => ({
  resolveDraftAttachments: (ids) => ids.map((id) => (kindsById[id] ?? 'file') === 'image'
    ? { kind: 'image', id, file: {}, previewUrl: '' }
    : { kind: 'file', id, file: {} }),
})
// 新形态经 useInput hook 注入（宿主现行 standardProps 面——props.input 恒
// undefined，FIX-029-B 同款驱动）；conversation = kind 解析面 fake。
const takeoverNew = (api, sessionId, snapshot, pathKey, conversation) =>
  renderInto(react.createElement(bundleExports.ModelTakeover, { sessionId, useInput: (sel) => sel(snapshot), api, conversation }), pathKey)

console.log('fix-012 image-conditional takeover (RED on old code — armed only by switch):')
{
  // ① 四象限。Q1 是核心判别：旧代码 armed 仅看开关 → 有图+开关 false 不接管。
  const q1 = makeApi()
  bundleExports.setRouterCatalog(catalogOf(false))
  await takeover(q1.api, 'q1', ['img-1'], 'takeover-q1')
  check('Q1: 有图 + takeoverDefaultModel=false → 自动接管 twin（旧代码必败）', twinSelect(q1.calls))

  const q2 = makeApi()
  bundleExports.setRouterCatalog(catalogOf(true))
  await takeover(q2.api, 'q2', ['img-1'], 'takeover-q2')
  check('Q2: 有图 + takeoverDefaultModel=true → 接管 twin', twinSelect(q2.calls))

  const q3 = makeApi()
  bundleExports.setRouterCatalog(catalogOf(false))
  await takeover(q3.api, 'q3', [], 'takeover-q3')
  check('Q3: 无图 + takeoverDefaultModel=false → 永不切换（FIX-002 主权）', q3.calls.length === 0)

  const q4 = makeApi()
  bundleExports.setRouterCatalog(catalogOf(true))
  await takeover(q4.api, 'q4', [], 'takeover-q4')
  check('Q4: 无图 + takeoverDefaultModel=true → 接管（FIX-002 开启语义保持）', twinSelect(q4.calls))
}

console.log('fix-048 attachmentIds InputState dual-form counting (RED on imageIds-only code):')
{
  // FIX-048：宿主 0.1.5-rc.1 M2 附件统一编址——InputState.attachmentIds 取代
  // imageIds（全宿主树 grep 零 imageIds 命中），旧代码只读 imageIds → imageCount
  // 恒 0 → 贴图永不武装（用户报障 2026-09-18：宿主准入拦「当前模型不支持图片」）。
  // kind 判定取方案 A（解析面可达 → 仅 image-kind 计数，「贴图即切」指图片）+
  // 方案 B 保守回落（面不可达 → attachmentIds.length，宁多切不漏图——file-only
  // 亦武装，wrapper 对无图轮零改写委托原生模型；取舍披露见 lib/client.js
  // inputImageCountOf 注释）。失效窗口 EV-158（2026-09-07 真机验证通过）→ 宿主
  // M2 演进 → 桩形态未锚定宿主源码（P10-④）恒绿的教训由本组修正。
  const attState = inputStateOf

  // N1 核心判别（新形态 + kind 解析面）：现行宿主 InputState 含 image-kind
  // 附件 + 开关 false → 贴图自动切 twin 恢复。旧代码必败（imageCount 恒 0）。
  const n1 = makeApi()
  bundleExports.setRouterCatalog(catalogOf(false))
  await takeoverNew(n1.api, 'n1', attState(['att-img-1']), 'takeover-n1', makeConversation({ 'att-img-1': 'image' }))
  check('N1: attachmentIds(image-kind) + 开关 false → 自动接管 twin（旧代码必败）', twinSelect(n1.calls))

  // N2 方案 A：file-only 附件 → 不武装（kind 解析面可达时精确语义；保守回落
  // 只属于面不可达形态，二者不同时成立——见 N4）。
  const n2 = makeApi()
  bundleExports.setRouterCatalog(catalogOf(false))
  await takeoverNew(n2.api, 'n2', attState(['att-file-1']), 'takeover-n2', makeConversation({ 'att-file-1': 'file' }))
  check('N2: attachmentIds(file-only) + 开关 false → 不武装（方案 A kind 精确语义）', n2.calls.length === 0)

  // N3 混合附件（file+image）→ ≥1 个 image-kind 即武装。
  const n3 = makeApi()
  bundleExports.setRouterCatalog(catalogOf(false))
  await takeoverNew(n3.api, 'n3', attState(['att-file-2', 'att-img-2']), 'takeover-n3', makeConversation({ 'att-img-2': 'image' }))
  check('N3: attachmentIds(file+image 混合) → 接管 twin', twinSelect(n3.calls))

  // N4 方案 B 保守回落：kind 解析面不可达（conversation 缺失）+ attachmentIds
  // 非空 → 武装（kind 未知，宁多切不漏图；降级 warn 可观测——P8）。
  const n4 = makeApi()
  bundleExports.setRouterCatalog(catalogOf(false))
  await takeoverNew(n4.api, 'n4', attState(['att-file-3']), 'takeover-n4', undefined)
  check('N4: 解析面不可达 + attachmentIds 非空 → 保守武装（方案 B 回落）', twinSelect(n4.calls))

  // N5 发送后保持（新形态）：attachmentIds 归零 → 零还原调用（FIX-012「贴图即
  // 切、发送后保持」在 kind 解析形态下不回退；image 来源永不自动还原）。
  const n5 = makeApi()
  bundleExports.setRouterCatalog(catalogOf(false))
  await takeoverNew(n5.api, 'n5', attState(['att-img-3']), 'takeover-n5', makeConversation({ 'att-img-3': 'image' }))
  check('N5a: 新形态贴图即切（armedBy=image）', twinSelect(n5.calls))
  n5.calls.length = 0
  await takeoverNew(n5.api, 'n5', attState([]), 'takeover-n5', makeConversation({}))
  check('N5b: 新形态发送后保持（归零零还原调用）', n5.calls.length === 0)

  // N6 capabilitySuppressed 语义保持（新形态）：多模态主模型 + 新形态贴图 →
  // 图直传主模型不切 twin（FIX-018 门控消费同一 imageCount，kind 形态下等价）。
  const MM = { provider: 'chatgpt-oauth', model: 'gpt-5.6-terra' }
  const n6 = makeApi(MM)
  bundleExports.setRouterCatalog({ ...catalogOf(false), defaults: { ...MM }, mainModelImage: { acceptsImage: true, source: 'host-declared', provider: MM.provider, model: MM.model } })
  await takeoverNew(n6.api, 'n6', attState(['att-img-4']), 'takeover-n6', makeConversation({ 'att-img-4': 'image' }))
  check('N6: 多模态主模型 + 新形态贴图 → 不切 twin（capabilitySuppressed 语义保持）', n6.calls.length === 0)
}

console.log('fix-012 send/remove keep twin (host selectModel has NO image-content rejection):')
{
  // ② 贴图即切 + ③ 发送后保持：断言「零还原调用」而非「还原失败静默」——
  // 宿主 selectModel 会成功切回纯文本（mock 返回 ok 即宿主真实行为），还原
  // 尝试必被拒绝的旧假设不成立，因此行为上根本不发起。
  const h = makeApi()
  bundleExports.setRouterCatalog(catalogOf(false))
  await takeover(h.api, 's1', ['img-1'], 'takeover-s1')
  check('S1: 贴图即切——imageCount>0 接管 twin', twinSelect(h.calls))
  h.calls.length = 0
  await takeover(h.api, 's1', [], 'takeover-s1')
  check('S2: 发送后保持 twin——imageCount 归零零还原调用（不依赖宿主拒绝）', h.calls.length === 0)

  // ④ 移除未发送图片：与发送同为 imageCount 1→0，组件观测面不可区分——
  // 固化「image-conditional 接管永不自动还原」语义（保持 twin，用户可手动切回）。
  const r = makeApi()
  bundleExports.setRouterCatalog(catalogOf(false))
  await takeover(r.api, 's2', ['img-1'], 'takeover-s2')
  r.calls.length = 0
  await takeover(r.api, 's2', [], 'takeover-s2')
  check('S3: 移除未发送图片 → 保持 twin 不还原（不可区分，固化永不自动还原）', r.calls.length === 0)
}

console.log('fix-012 FIX-002 sovereignty (manual twin / pure text / switch restore):')
{
  // ⑤ 用户手动 twin（无 takeoverMemory 记录）→ 永不撤销。
  const m1 = makeApi()
  m1.setCurrent(TWIN)
  bundleExports.setRouterCatalog(catalogOf(false))
  await takeover(m1.api, 'm1', [], 'takeover-m1')
  check('M1: 用户手动 twin（无记忆）→ 永不撤销（FIX-002-R7 F1 不回退）', m1.calls.length === 0)

  // ⑥ 纯文本轮（无图 + 开关 false）→ 永不切换。
  const m2 = makeApi()
  bundleExports.setRouterCatalog(catalogOf(false))
  await takeover(m2.api, 'm2', [], 'takeover-m2')
  check('M2: 纯文本轮 → 永不切换', m2.calls.length === 0)

  // ⑦ 开关驱动接管 → 解除武装（多模态 agent 清空）→ 既有还原保持。
  const sw1 = makeApi()
  bundleExports.setRouterCatalog(catalogOf(true))
  await takeover(sw1.api, 'sw1', [], 'takeover-sw1')
  check('SW1: 开关 true 接管（armedBy=switch）', twinSelect(sw1.calls))
  sw1.calls.length = 0
  bundleExports.setRouterCatalog(catalogOf(true, []))
  await takeover(sw1.api, 'sw1', [], 'takeover-sw1')
  check('SW2: 开关驱动解除武装 → 既有还原保持（永不自动还原仅限 image 来源）', nativeSelect(sw1.calls))
}

console.log('fix-012 switch-on then off restores (FIX-012 commitment):')
{
  // ⑧ image 接管 → 发送保持 → 开启 takeoverDefaultModel（armed 分支升级
  // armedBy=switch）→ 关闭 → 走既有还原。
  const h = makeApi()
  bundleExports.setRouterCatalog(catalogOf(false))
  await takeover(h.api, 'sw2', ['img-1'], 'takeover-sw2')
  check('SW3: image-conditional 接管（armedBy=image）', twinSelect(h.calls))
  h.calls.length = 0
  await takeover(h.api, 'sw2', [], 'takeover-sw2')
  check('SW4: 发送后保持（image 来源不还原）', h.calls.length === 0)
  bundleExports.setRouterCatalog(catalogOf(true))
  await takeover(h.api, 'sw2', [], 'takeover-sw2')
  check('SW5: 开启开关 → 已停 twin 保持（armed 重跑零重复接管）', h.calls.length === 0)
  h.calls.length = 0
  bundleExports.setRouterCatalog(catalogOf(false))
  await takeover(h.api, 'sw2', [], 'takeover-sw2')
  check('SW6: 开启后关闭 → 走既有还原（FIX-012 承诺兑现）', nativeSelect(h.calls))
}

console.log('fix-012 R0 P2-1 deps completeness (switch toggles while image pending):')
{
  // R0 P2-1：effect deps 缺 imageConditional →「图片在途时 takeoverDefaultModel
  // 开→关」不改变 takeoverArmed → effect 不重跑 → armedBy 不升级为 switch →
  // 移除图片后记忆滞留 'image' → 不还原——与组件头承诺「开启 takeoverDefaultModel
  // 后走既有还原」存在未声明边界。修复后 deps 含 imageConditional → 在途开启时
  // 重跑升级分支（armedBy→switch）→ 在途关闭 + 移除图片 → 走既有还原。
  // 判别：旧 deps（缺 imageConditional）下 P2-1d 必败（armedBy 滞留 image）。
  const h = makeApi()
  bundleExports.setRouterCatalog(catalogOf(false))
  await takeover(h.api, 'p21', ['img-1'], 'takeover-p21')
  check('P2-1a: 贴图接管（armedBy=image）', twinSelect(h.calls))
  h.calls.length = 0
  // 在途开启开关：armed 不变（imageCount 仍在）→ 仅 imageConditional 变化 →
  // deps 含 imageConditional 才重跑升级分支（旧 deps 不重跑 → armedBy 滞留 image）。
  bundleExports.setRouterCatalog(catalogOf(true))
  await takeover(h.api, 'p21', ['img-1'], 'takeover-p21')
  check('P2-1b: 在途开启开关 → twin 保持（无重复接管/还原）', h.calls.length === 0)
  // 在途关闭开关：armed 仍 true（image 在途）→ imageConditional 变回 true。
  bundleExports.setRouterCatalog(catalogOf(false))
  await takeover(h.api, 'p21', ['img-1'], 'takeover-p21')
  check('P2-1c: 在途关闭开关 → twin 保持', h.calls.length === 0)
  // 移除图片：armed false → armedBy 已升级 switch → 走既有还原。
  // 旧 deps：armedBy 滞留 'image' → 不还原 → 必败（判别）。
  h.calls.length = 0
  await takeover(h.api, 'p21', [], 'takeover-p21')
  check('P2-1d: 移除图片 → 既有还原（在途交错升级链成立——旧 deps 必败）', nativeSelect(h.calls))
}

console.log('fix-018 capability-gated takeover (RED on old code — armed ignores model capability):')
{
  // FIX-018 缺陷 1：ModelTakeover 武装条件缺「当前模型不支持 image」判定——
  // 已多模态 provider（chatgpt-oauth 等原生多模态）贴图也被切 twin，图被拖进
  // wrapper 路由面（用户实证 2026-08-31）。修复：image 来源接管仅在「当前模型
  // 不支持 image」时武装切换；能力判定服务端单点（router/catalog 的
  // mainModelImage——服务端 decideImagePrecheck 复用 wrapper sourceAcceptsModality），
  // 客户端消费（宿主 RPC 不暴露模态信息：buildModelCatalog 剥离
  // inputModalities、session.models current 仅 {provider,model}——2026-08-31 取证）。
  // 判别：F18-1/F18-5a 旧代码必败（旧武装条件对多模态主模型同样切 twin）。
  const MM = { provider: 'chatgpt-oauth', model: 'gpt-5.6-terra' }
  const mmAccepts = () => ({ acceptsImage: true, source: 'host-declared', provider: MM.provider, model: MM.model })
  // MM 会话的 twin（chatgpt-oauth-router）断言——twinSelect 只认 deepseek-official-router。
  const mmTwinSelect = (calls) => calls.some((call) => call.provider === 'chatgpt-oauth-router' && call.model === MM.model)

  // F18-1 核心判别：当前模型已多模态 + 贴图 → 不切 twin（图直传主模型）。
  const f1 = makeApi(MM)
  bundleExports.setRouterCatalog({ ...catalogOf(false), defaults: { ...MM }, mainModelImage: mmAccepts() })
  await takeover(f1.api, 'f1', ['img-1'], 'takeover-f1')
  check('F18-1: 多模态主模型 + 贴图 → 不切 twin（旧代码必败）', f1.calls.length === 0)

  // F18-2 判别另一侧：当前模型纯文本（能力判定 acceptsImage=false）→ 既有贴图
  // 接管保持（FIX-012 语义零回退）。
  const f2 = makeApi(NATIVE)
  bundleExports.setRouterCatalog({ ...catalogOf(false), mainModelImage: { acceptsImage: false, source: 'probe-failed', provider: NATIVE.provider, model: NATIVE.model } })
  await takeover(f2.api, 'f2', ['img-1'], 'takeover-f2')
  check('F18-2: 纯文本主模型 + 贴图 → 仍切 twin（FIX-012 语义保持）', twinSelect(f2.calls))

  // F18-3 判定对象一致性：能力快照（基于默认选择）与会话当前选择 provider/model
  // 不一致（默认漂移窗口）→ 不认定 → 保守回落既有接管（图经 twin 必可达，
  // 宁多切不漏图）。旧代码亦接管（回归护栏，非 RED 判别）。
  const f3 = makeApi(NATIVE)
  bundleExports.setRouterCatalog({ ...catalogOf(false), defaults: { ...MM }, mainModelImage: mmAccepts() })
  await takeover(f3.api, 'f3', ['img-1'], 'takeover-f3')
  check('F18-3: 能力快照与当前模型不一致 → 保守回落接管', twinSelect(f3.calls))

  // F18-4 开关路径不经门控：takeoverDefaultModel=true + 当前模型已多模态 → 仍
  // 接管（开关开启 = 用户显式要 twin 路由面，FIX-002 语义保持）。
  const f4 = makeApi(MM)
  bundleExports.setRouterCatalog({ ...catalogOf(true), defaults: { ...MM }, mainModelImage: mmAccepts() })
  await takeover(f4.api, 'f4', ['img-1'], 'takeover-f4')
  check('F18-4: 开关 true 不经门控 → 仍接管（FIX-002 语义保持）', mmTwinSelect(f4.calls))

  // F18-5 能力快照变化重评：门控抑制后目录轮询带来能力反转（accepts→不支持，
  // 如适配器注销/模型列表清空）→ effect 重跑补接管。判别依赖 deps 含能力快照
  // 签名——缺该 deps 时 F18-5b 必败（抑制后永不重评）。
  const f5 = makeApi(MM)
  bundleExports.setRouterCatalog({ ...catalogOf(false), defaults: { ...MM }, mainModelImage: mmAccepts() })
  await takeover(f5.api, 'f5', ['img-1'], 'takeover-f5')
  check('F18-5a: 多模态主模型 + 贴图 → 不切 twin（旧代码必败）', f5.calls.length === 0)
  bundleExports.setRouterCatalog({ ...catalogOf(false), defaults: { ...MM }, mainModelImage: { acceptsImage: false, source: 'probe-failed', provider: MM.provider, model: MM.model } })
  await takeover(f5.api, 'f5', ['img-1'], 'takeover-f5')
  check('F18-5b: 能力快照反转为不支持 → effect 重跑补接管（deps 看护）', mmTwinSelect(f5.calls))
}

if (renderErrors.length > 0) {
  failures += renderErrors.length
  console.error(`FAIL  render errors: ${renderErrors.map((error) => String(error)).join(' | ')}`)
}
console.log(failures === 0 ? '\nALL FIX-012 DISCRIMINANT TESTS PASSED' : `\n${failures} FIX-012 ASSERTION(S) FAILED (RED — fix pending)`)
process.exit(failures === 0 ? 0 : 1)
