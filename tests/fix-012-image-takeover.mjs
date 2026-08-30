// FIX-012 判别测试：ModelTakeover 图片条件化接管（用户裁决 2026-08-30：
// 贴图即切、发送后保持）。
//
// 问题形态（用户实证 2026-08-30）：主模型为文本模型（DeepSeek-V4-Flash Max）
// 时发送带图消息 → 宿主 GUI Toast「当前模型不支持图片」消息被拦。RCA：
// apiproxy prompt 准入（dsh-host-apiproxy lib/index.js:2749-2760）按当前选中
// 模型的 inputModalities 判图，纯文本模型拒绝（MODEL_DOES_NOT_SUPPORT_IMAGES）；
// 插件 ModelTakeover 的武装条件（FIX-002 后）只看 takeoverDefaultModel 开关
// （默认 false）→ 永不自动切到包装路由 twin → 拦截复现。
//
// 宿主核实（2026-08-30 只读，dsh-host-apiproxy lib/index.js）：
//   - session.selectModel（:2596-2630）仅 resolveCallConfig + 写
//     selectionFor.current（+ best-effort saveDefaultModelSelection），对会话
//     历史/草稿中的图片零校验——旧注释「会话已含图时宿主拒绝切回纯文本」
//     （lib/client.js:3226 假设）不成立；
//   - 图片准入只在 prompt 时点（:2749-2760）与 pi-ai stream 时点
//     （dsh-llm-pi-ai lib/index.js:1721 UNSUPPORTED_CONTENT）。
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
function makeApi() {
  let current = { ...NATIVE }
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
const takeover = (api, sessionId, imageIds, pathKey) => renderInto(react.createElement(bundleExports.ModelTakeover, { sessionId, input: { imageIds }, api }), pathKey)

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

if (renderErrors.length > 0) {
  failures += renderErrors.length
  console.error(`FAIL  render errors: ${renderErrors.map((error) => String(error)).join(' | ')}`)
}
console.log(failures === 0 ? '\nALL FIX-012 DISCRIMINANT TESTS PASSED' : `\n${failures} FIX-012 ASSERTION(S) FAILED (RED — fix pending)`)
process.exit(failures === 0 ? 0 : 1)
