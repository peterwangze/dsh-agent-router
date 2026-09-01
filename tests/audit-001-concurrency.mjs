/**
 * AUDIT-001 全库并发正确性专项审计——确证 P0 判别测试（红绿）。
 *
 * 覆盖两个确证 P0 的核心不变量 + 回归守卫：
 *
 * - S1（渲染层 P0-A）：宿主浏览器提供的是**真 React 18.3.1**（dsh-web-frontend
 *   seed 表 `react` → react.production.min.js 18.3.1，createRoot 并发入口）。
 *   真 React createElement 的 RESERVED_PROPS（key/ref/__self/__source）会把
 *   `ref` 从 props 中剥离——RouteImage 若以 `ref` 作为 prop 名接收图片引用，
 *   props.ref 恒为 undefined → directAssetUrlOf 恒空 → 直达路径永不生效 →
 *   RPC 回退（EVO-012/FIX-021 用户侧「三连败」根因；L3 诊断
 *   `site=collapsed ref=undefined` 直接印证）。历史测试全绿是因为迷你 React
 *   shim 原样透传 props（P9 宿主演进防御违反点）——本测试把宿主语义请进
 *   测试网，harness createElement 与宿主 18.3.1 逐语义同构（含剥离）。
 *
 * - S2（收集层，P0-A 伴随不变量）：宿主 attachment 可能为惰性 getter
 *   （首访 truthy / 次访 undefined 双态）。render 期收集若对 getter 读两次
 *   （条件判断 + push），撕裂值 undefined 会混入 refs；展开态对 undefined
 *   取 .attachmentId 直接抛 TypeError（%TEMP%\fix021-repro.js 场景 A 的
 *   渲染级复现）。修复后单次访问存局部 + 对象守卫，重渲染读到 undefined
 *   时优雅跳过（该图显示由同块 text marker 的 ref 承载）。
 *
 * - T1~T4（凭据层 P0-B）：ensureFresh 持锁刷新在途（≤25s 网络）期间，盘上
 *   凭据文档可能被登出删除 / 新登录写入改变。写回前必须做盘上 CAS 守卫：
 *   已删除 → 绝不复活（合规删除 W-5 / 项目原则 7）；refresh 已变化 → 采用
 *   盘上最新文档、放弃写回（旧 refresh 链不得覆盖新登录）。T4 守卫锁内
 *   删除（修复后 oauthLogout 的等价语义）的串行排序不变量。
 *
 * 运行：作为 smoke.mjs 套件之一；亦可用 AUDIT001_CLIENT_SOURCE=<path> 指向
 * 任一 client.js 变体（审计 RED 复现：git show HEAD:lib/client.js）。
 * @module dsh-agent-router/tests/audit-001-concurrency
 */

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OauthCredentialStore } from '../lib/oauth-credentials.js'

// ── 宿主语义 React shim（与 dsh-web-frontend bundle 内 react@18.3.1 同构）──
// createElement 提取 key/ref 但**不**把 ref 放进 props（RESERVED_PROPS 剥离）
// ——这正是真浏览器与旧迷你 shim 的行为分叉点。
const RESERVED_PROPS = { key: true, ref: true, __self: true, __source: true }
function hostFaithfulCreateElement(type, config, ...children) {
  const props = {}
  let key = null
  if (config != null) {
    if (config.ref !== undefined) { /* 提取到元素层：函数组件 props 不可达（18.3.1 语义） */ }
    if (config.key !== undefined) key = String(config.key)
    for (const name in config) {
      if (Object.prototype.hasOwnProperty.call(config, name) && !Object.prototype.hasOwnProperty.call(RESERVED_PROPS, name)) {
        props[name] = config[name]
      }
    }
  }
  const flat = []
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue
    flat.push(child)
  }
  if (flat.length > 0) props.children = flat
  return { type, key, props }
}

const frameStack = []
function useState(initial) {
  const frame = frameStack[frameStack.length - 1]
  let slot = frame.hooks[frame.hookIndex++]
  if (!slot) slot = frame.hooks[frame.hookIndex - 1] = { has: false }
  if (!slot.has) {
    slot.has = true
    slot.value = typeof initial === 'function' ? initial() : initial
  }
  return [slot.value, (value) => { slot.value = typeof value === 'function' ? value(slot.value) : value }]
}
function useEffect() { /* 渲染级判别不需要跑副作用 */ }
function useCallback(fn) { return fn }
function useRef(value) {
  const frame = frameStack[frameStack.length - 1]
  let slot = frame.hooks[frame.hookIndex++]
  if (!slot) slot = frame.hooks[frame.hookIndex - 1] = { has: false }
  if (!slot.has) {
    slot.has = true
    slot.value = { current: value }
  }
  return slot.value
}

function loadClientBundle(source) {
  const registrations = []
  const timers = []
  const window = {
    __ModuleLoader__: { load: (payload) => { registrations.push(payload) } },
    setInterval: (fn, ms) => { const id = setInterval(fn, ms); if (typeof id.unref === 'function') id.unref(); timers.push(id); return id },
    clearInterval: (id) => clearInterval(id),
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    URL: { createObjectURL: () => '' },
  }
  new Function('window', source)(window)
  const bundleRegistration = registrations.find((entry) => entry.id === 'dsh-agent-router')
  if (!bundleRegistration) throw new Error('audit-001: client bundle did not register "dsh-agent-router"')
  const react = { createElement: hostFaithfulCreateElement, useState, useEffect, useCallback, useRef }
  const requireShim = (spec) => {
    if (spec === 'react') return react
    throw new Error(`audit-001: unexpected require("${spec}") in client bundle`)
  }
  return { exports: bundleRegistration.factory(requireShim), timers }
}

/** 组件树调用器：函数型元素就地调用（帧按路径稳定复用，useState 跨重渲染持久）。 */
function invokeTree(element, frames, path = 'n0', errors = []) {
  if (element === null || element === undefined || typeof element !== 'object') return element
  if (typeof element.type === 'function') {
    let frame = frames.get(path)
    if (!frame) { frame = { hooks: [], hookIndex: 0 }; frames.set(path, frame) }
    frame.hookIndex = 0
    frameStack.push(frame)
    let output
    try {
      output = element.type(element.props)
    } catch (error) {
      errors.push(error)
      output = null
    } finally {
      frameStack.pop()
    }
    return invokeTree(output, frames, path, errors)
  }
  const props = element.props
  if (!props) return element
  const next = { ...props }
  if (Array.isArray(props.children)) {
    next.children = props.children.map((child, index) => invokeTree(child, frames, `${path}/${index}`, errors))
  }
  return { type: element.type, key: element.key, props: next }
}

function findAll(node, predicate, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (predicate(node)) out.push(node)
  if (node.props && Array.isArray(node.props.children)) {
    for (const child of node.props.children) findAll(child, predicate, out)
  }
  return out
}

function textOf(node) {
  if (node === null || node === undefined || typeof node !== 'object') return typeof node === 'string' ? node : ''
  if (typeof node.props?.children !== 'object' && node.props?.children !== undefined) return String(node.props.children)
  const children = node.props?.children
  if (!Array.isArray(children)) return ''
  return children.map(textOf).join('')
}

/** 构造 apply(ctx) 可用的最小 ctx；返回 registrations 便于取槽位。 */
function makeTestContext() {
  const registrations = []
  const disposers = []
  const ctx = {
    effect: (fn) => {
      let result
      try { result = fn() } catch { return }
      if (typeof result === 'function') disposers.push(result)
    },
    get: (name) => (name === 'connection' ? { api: {} } : undefined),
    locale: { register: () => {}, bind: () => (key) => key },
    remote: {
      $mount: () => new Promise(() => {}), // 永不 resolve：绕开 remoteReady 后链
      $on: () => () => {},
    },
    slots: {
      inject: (_name, setup) => {
        try { registrations.push(setup()) } catch { /* 槽位注册失败不影响判别面 */ }
      },
      register: (options, render) => ({ options, render }),
    },
  }
  return { ctx, registrations, disposers }
}

function makeGatedFetch(gate, payload) {
  let entered = false
  const fetchImpl = async () => {
    entered = true
    await gate
    return { ok: true, json: async () => payload() }
  }
  return { fetchImpl, entered: () => entered }
}

async function waitFor(condition, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('audit-001: waitFor timeout')
    await new Promise((resolve) => setImmediate(resolve))
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function runAudit001ConcurrencyTests(check) {
  const work = mkdtempSync(join(tmpdir(), 'audit001-'))
  const sourcePath = process.env.AUDIT001_CLIENT_SOURCE || join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js')
  const source = readFileSync(sourcePath, 'utf8')

  // ── S1：宿主真 React 18.3.1 RESERVED_PROPS 剥离语义下的工具卡直达渲染 ──
  console.log('audit-001 S1 (host React reserved-prop semantics):')
  {
    const { exports, timers } = loadClientBundle(source)
    const { ctx, registrations } = makeTestContext()
    exports.apply(ctx)
    for (const id of timers) clearInterval(id)
    const toolview = registrations.find((entry) => entry.options.name === 'tool.call.toolview')
    check('S1: toolview slot registered for route_agent', !!toolview && toolview.options.key === 'route_agent')

    // harness 忠实性自证：ref 被剥离、普通 prop 保留（与宿主 18.3.1 行为一致）。
    const probe = hostFaithfulCreateElement(function Probe() { return null }, { ref: { id: 'x' }, imageRef: { id: 'y' } })
    check('S1: harness mirrors host RESERVED_PROPS stripping', probe.props.ref === undefined && probe.props.imageRef && probe.props.imageRef.id === 'y')

    const markerRef = { attachmentId: 'sha256:tv', mediaType: 'image/png', name: 'router-draw.png' }
    const baseBlock = {
      kind: 'tool-result',
      seq: 1,
      time: 2000,
      callId: 'c1',
      call: { name: 'route_agent', argsRaw: '{"agent":"draw"}' },
      callTime: 1000,
      isError: false,
      subCalls: [],
      content: [{ type: 'text', text: `已生成图片\n[router:image:${JSON.stringify(markerRef)}]` }],
    }
    const renderProps = { t: (key) => key, router: () => ({ imageData: async () => ({ ok: false, error: { message: 'GATEWAY_REJECTED' } }) }), block: baseBlock }
    const frames = new Map()
    const errors = []
    const collapsed = invokeTree(toolview.render(renderProps), frames, 'card', errors)
    const thumbs = findAll(collapsed, (node) => node && node.type === 'img' && node.props && node.props.className === 'dshrouter-toolthumb')
    // 修复前：RouteImage 以 `ref` prop 名接收引用 → 被宿主 React 剥离 →
    // props.ref 恒 undefined → 直达路径不生效 → 无缩略图 img（RED）。
    check('S1: collapsed thumbnail renders via direct asset url under host React semantics (P0-A)',
      thumbs.length === 1 && thumbs[0].props.src === '/router-assets/sha256%3Atv')

    const summary = findAll(collapsed, (node) => node && node.type === 'button' && node.props && node.props.className === 'dshrouter-toolcard-summary')[0]
    check('S1: collapsed summary row present', !!summary)
    if (summary) {
      summary.props.onClick()
      const errorsExpanded = []
      const expanded = invokeTree(toolview.render(renderProps), frames, 'card', errorsExpanded)
      const gallery = findAll(expanded, (node) => node && node.type === 'img' && node.props && node.props.className === 'dshrouter-toolimage')
      check('S1: expanded gallery renders via direct asset url (P0-A)',
        gallery.length === 1 && gallery[0].props.src === '/router-assets/sha256%3Atv')
      check('S1: expanded render throws nothing under host React semantics', errorsExpanded.length === 0)
    }
  }

  // ── S2：attachment 惰性 getter 双态（首访 truthy / 次访 undefined）撕裂守卫 ──
  console.log('audit-001 S2 (attachment getter double-state tear):')
  {
    const { exports, timers } = loadClientBundle(source)
    const { ctx, registrations } = makeTestContext()
    exports.apply(ctx)
    for (const id of timers) clearInterval(id)
    const toolview = registrations.find((entry) => entry.options.name === 'tool.call.toolview')
    let reads = 0
    const markerRef = { attachmentId: 'sha256:s2', mediaType: 'image/png' }
    const tearBlock = {
      kind: 'tool-result',
      seq: 2,
      time: 2000,
      callId: 'c2',
      call: { name: 'route_agent', argsRaw: '{}' },
      callTime: 1000,
      isError: false,
      subCalls: [],
      content: [
        // 奇数次访问返回对象、偶数次返回 undefined——复现「条件判断 truthy、
        // push undefined」双读撕裂（%TEMP%\fix021-repro.js 场景 A 渲染级）。
        { type: 'image', get attachment() { reads += 1; return reads % 2 === 1 ? { attachmentId: 'sha256:cc' } : undefined } },
        { type: 'text', text: `[router:image:${JSON.stringify(markerRef)}]` },
      ],
    }
    const renderProps = { t: (key) => key, router: () => ({ imageData: async () => ({ ok: false, error: { message: 'GATEWAY_REJECTED' } }) }), block: tearBlock }
    const frames = new Map()
    const errors1 = []
    const collapsed = invokeTree(toolview.render(renderProps), frames, 'card', errors1)
    const thumbs = findAll(collapsed, (node) => node && node.type === 'img' && node.props && node.props.className === 'dshrouter-toolthumb')
    // 单次访问快照后：attachment 对象（id 兜底直达）+ marker ref = 2 张缩略图；
    // 双读撕裂（旧代码）：refs 混入 undefined → directRefs 只剩 marker = 1 张（RED）。
    check('S2: collapsed collects attachment snapshot and marker ref without tear',
      errors1.length === 0 && thumbs.length === 2
      && thumbs.some((node) => node.props.src === '/router-assets/sha256%3Acc')
      && thumbs.some((node) => node.props.src === '/router-assets/sha256%3As2'))

    const summary = findAll(collapsed, (node) => node && node.type === 'button' && node.props && node.props.className === 'dshrouter-toolcard-summary')[0]
    if (summary) {
      summary.props.onClick()
      const errors2 = []
      const expanded = invokeTree(toolview.render(renderProps), frames, 'card', errors2)
      // 旧代码展开态：refs 含 undefined → key 取 undefined.attachmentId 直接
      // TypeError（RED）；修复后：本轮读到 undefined 优雅跳过，marker 承载显示。
      const gallery = findAll(expanded, (node) => node && node.type === 'img' && node.props && node.props.className === 'dshrouter-toolimage')
      check('S2: expanded render survives getter double-state without throwing (P0 companion)',
        errors2.length === 0 && gallery.some((node) => node.props.src === '/router-assets/sha256%3As2'))
    }
  }

  // ── T1~T4：凭据刷新在途窗口的写回 CAS 守卫（P0-B）─────────────────────
  console.log('audit-001 T1-T4 (credential write-back CAS guard):')
  {
    // T1：登出删除 vs 在途刷新写回——凭据文件绝不复活（P0-B 核心判别）。
    {
      const store = new OauthCredentialStore(join(work, 't1.json'))
      const stale = { type: 'oauth', access: 'A-OLD', refresh: 'R-OLD', expires: Date.now() + 1_000, accountId: 'acct-1' }
      await store.write(stale)
      let release
      const gate = new Promise((resolve) => { release = resolve })
      const { fetchImpl, entered } = makeGatedFetch(gate, () => ({ access_token: 'A-NEW', refresh_token: 'R-NEW', expires_in: 3_600 }))
      const refreshPromise = store.ensureFresh(stale, { fetchImpl, lockTimeoutMs: 5_000, timeoutMs: 10_000 })
      await waitFor(entered)
      await store.delete() // 无锁删除：模拟与刷新写回交错的登出（判别窗口核心）
      release()
      const result = await refreshPromise
      const onDisk = await store.read()
      check('T1: deleted credential is NOT resurrected by in-flight refresh write-back (P0-B)', onDisk === undefined)
      check('T1: in-flight request still receives its refreshed token (memory-only, no resurrection)', !!result && result.access === 'A-NEW' && onDisk === undefined)
    }

    // T2：新登录写入 vs 在途旧链刷新写回——新登录文档不被覆写、刷新采用盘上最新。
    {
      const store = new OauthCredentialStore(join(work, 't2.json'))
      const stale = { type: 'oauth', access: 'A-OLD2', refresh: 'R-OLD2', expires: Date.now() + 1_000, accountId: 'acct-1' }
      await store.write(stale)
      let release
      const gate = new Promise((resolve) => { release = resolve })
      const { fetchImpl, entered } = makeGatedFetch(gate, () => ({ access_token: 'A-CHAIN', refresh_token: 'R-CHAIN', expires_in: 3_600 }))
      const refreshPromise = store.ensureFresh(stale, { fetchImpl, lockTimeoutMs: 5_000, timeoutMs: 10_000 })
      await waitFor(entered)
      // 模拟登录落盘（persistPresetLogin 的核心写；无锁形态即判别窗口）
      await store.write({ type: 'oauth', access: 'A-LOGIN', refresh: 'R-LOGIN', expires: Date.now() + 3_600_000, accountId: 'acct-2' })
      release()
      const result = await refreshPromise
      const onDisk = await store.read()
      check('T2: concurrent login document survives refresh write-back (P0-B)', !!onDisk && onDisk.refresh === 'R-LOGIN' && onDisk.access === 'A-LOGIN' && onDisk.accountId === 'acct-2')
      check('T2: refresh adopts newer on-disk credential instead of clobbering it', !!result && result.refresh === 'R-LOGIN')
    }

    // T3：无并发变更的正常刷新不受守卫影响（防过度修正回归）。
    {
      const store = new OauthCredentialStore(join(work, 't3.json'))
      const stale = { type: 'oauth', access: 'A-OLD3', refresh: 'R-OLD3', expires: Date.now() + 1_000, accountId: 'acct-3' }
      await store.write(stale)
      const { fetchImpl } = makeGatedFetch(Promise.resolve(), () => ({ access_token: 'A-N3', refresh_token: 'R-N3', expires_in: 3_600 }))
      const result = await store.ensureFresh(stale, { fetchImpl, lockTimeoutMs: 5_000, timeoutMs: 10_000 })
      const onDisk = await store.read()
      check('T3: uncontended refresh still persists normally (no over-correction)', !!onDisk && onDisk.refresh === 'R-N3' && !!result && result.refresh === 'R-N3')
    }

    // T4：锁内删除（修复后 oauthLogout 等价语义）与在途刷新串行——终态已删除。
    {
      const store = new OauthCredentialStore(join(work, 't4.json'))
      const stale = { type: 'oauth', access: 'A-OLD4', refresh: 'R-OLD4', expires: Date.now() + 1_000, accountId: 'acct-4' }
      await store.write(stale)
      let release
      const gate = new Promise((resolve) => { release = resolve })
      const { fetchImpl, entered } = makeGatedFetch(gate, () => ({ access_token: 'A-N4', refresh_token: 'R-N4', expires_in: 3_600 }))
      const refreshPromise = store.ensureFresh(stale, { fetchImpl, lockTimeoutMs: 5_000, timeoutMs: 10_000 })
      await waitFor(entered)
      const deletePromise = store.withLock(10_000, () => store.delete()) // 锁内删除：排队等刷新释放
      release()
      await Promise.all([refreshPromise, deletePromise])
      await sleep(20)
      check('T4: lock-serialized logout lands after refresh write-back — final state deleted (regression guard)', (await store.read()) === undefined)
    }
  }
}
