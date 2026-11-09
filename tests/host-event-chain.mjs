#!/usr/bin/env node
/**
 * FIX-058 行为臂：预设默认模型播种的宿主事件链——真 cordis × 真 dsh-session 组装级回归网。
 *
 * 防复发目标（钉死事实链）：
 *  1. 播种触发 `agent-preset/selected` 的旧订阅形态 = 经 events 域订阅 cordis 双参
 *     事件，依赖宿主 `dsh-agent-preset-registry` 在 `ctx.on("session/event")` 里
 *     重发射（`ctx.emit('agent-preset/selected', session.id, event.data.agentPreset)`）。
 *     该重发射监听没带 `{global:true}`：宿主 0.2.1（cordis 4.0.5）投递可达（播种实测
 *     生效）；宿主 0.2.2（cordis 4.1.0）受 Scoped containment 收紧——空会话载体不在
 *     registry 子树内 → 监听收不到 session/event → 重发射不发生 → 播种静默失效
 *     （两代 registry 代码逐字相同，差异在 cordis 4.1.0 投递收紧）。
 *  2. 修复 = 插件不再依赖 registry 重发射链：`ctx.on('session/event', …, {global:true})`
 *     直订事件流。global 在两代 cordis（4.0.5 与 4.1.0 的 EventsService.dispatch()
 *     内 `hook.global ||` 短路——逐字同款）都短路 Scoped 过滤；宿主一等先例 =
 *     `dsh-api-session-controller/lib/types/state/listener.js` 的
 *     `ctx.on('session/event', cb, { global: true })` 直订。
 *
 * 组装（全部真包，桩仅服务面且锚定真源形状——P10-④）：
 *  - 靶子树解析复用 tests/host-contract.mjs 的 DSH_HOST_SOURCE 机制（默认树 = 本仓
 *    node_modules 的 0.2.0-rc.2 / cordis 4.0.1；显式树按环境变量）。
 *  - 真 cordis root（目标树 `@deepseek-ai/cordis`）→ 真 `dsh-session` SessionStore
 *    最小装配（`root.plugin(SessionStore)` → `sessions.create()` 承载会话的载体
 *    fiber——enter() 内 `scopeTarget(session, scopeOf(ctx))` 建事件载体）。
 *  - 插件真实订阅安装：`installPresetDefaults(hybridCtx, service)`；hybrid ctx 的
 *    `on` 委托真 cordis 插件行 fiber ctx（记录调用供 {global:true} 判定），服务面
 *    用 spy 桩：agents（dsh-agent `super(ctx,"agents")` + `get(id)`）、
 *    sessionController（dsh-api-session-controller `super(ctx, "sessionController",
 *    {namespace:"session"})` + `async selectModel(request)`）、
 *    agentDefaultModel（dsh-agent-default-model currentSelection/saveSelection）。
 *  - 断言主链：按 dsh-session 真源 append API（`Session.append(type, data)`）追加
 *    `{type:'agent-preset/selected', data:{agentPreset:'governance'}}` → 真 dispatch
 *    （carrier + Context.filter 过滤面）→ 插件 global 直订 → onPresetSelected →
 *    selectModel 收到 governance 配置的 main 模型。
 *
 * 红绿判别：旧订阅形态（subscribeEvents 'agent-preset/selected'——依赖重发射链）在
 * 本组装上零 session/event 监听 → append 后播种永不发生 → 必红（红态经改动前代码
 * 实跑验证）；修复后 global 直订经真投递面送达 → 绿。三树各跑：默认 0.2.0-rc.2 /
 * DSH_HOST_SOURCE=0.2.1-rc.2 嵌套布局 / DSH_HOST_SOURCE=0.2.2-rc.1。
 *
 * FIX-059 行为臂扩展（宿主代际写入面判别）：
 *  3. 0.2.2 起 `agentOptions()` 为 **getter-only 活视图**
 *     （dsh-api-session-controller lib/index.js L440-453 `get provider/model`
 *     无 setter）→ 严格模式 `agent.options.provider = x` 抛 TypeError。旧实现
 *     ① 突变失败即 skip='not-mutable' 提前 return——② selectModel 正式写入面
 *     根本不执行 → 0.2.2 播种全断（用户诊断卡 09:36-09:38 八条 ✗ (not-mutable)
 *     实录）。修复 = ① 改为能力探测（tryMutateOptions）→ 不可变分支跳过突变
 *     直接 ② selectModel（0.2.2 路由事实：AgentModel.current() = recordedSelection()
 *     ?? this.options——投影优先，model/selection 事件即请求路由）→ ③ 写回恢复。
 *  4. getter-only 臂（0.2.2 形态）对旧代码必红（① 抛错提前 return → 零
 *     selectModel）——红绿两态都实跑报告；plain options 臂（0.2.1 形态）
 *     现有断言保持（突变 + selectModel 双路径）。
 *
 * 缺包语义：显式 DSH_HOST_SOURCE 树缺 cordis/dsh-session → 可见 skip + exit 0
 * （部分树 ≠ 契约漂移，host-contract 同语义）；默认树缺包 → 红（本仓完整树应含）。
 * 独立入口：node tests/host-event-chain.mjs（exit 0/1）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_TREE = join(REPO_ROOT, 'node_modules', '@deepseek-ai')

let failures = 0
let passed = 0
let skipped = 0
const check = (label, condition, detail) => {
  if (condition) { passed++; console.log(`  ok  ${label}`) }
  else {
    failures++
    console.error(`FAIL  ${label}${detail === undefined ? '' : ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`)
  }
}
const skip = (label, reason) => {
  skipped++
  console.log(`  skip ${label} (${reason})`)
}
/** 微任务排空（fire-and-forget 派发后等待插件内部 async 链完成——先例 tests/preset-defaults.mjs G1）。 */
const drain = async (rounds = 8) => {
  for (let i = 0; i < rounds; i++) await new Promise((resolve) => setImmediate(resolve))
}

// ── 靶子树解析（与 host-contract.mjs 的 DSH_HOST_SOURCE 优先级一致）──────────
const target = process.env.DSH_HOST_SOURCE
  ? { root: process.env.DSH_HOST_SOURCE, origin: `DSH_HOST_SOURCE(${process.env.DSH_HOST_SOURCE})` }
  : { root: DEFAULT_TREE, origin: 'default（本仓 node_modules 树）' }
const versionOf = (pkg) => {
  try { return JSON.parse(readFileSync(join(target.root, pkg, 'package.json'), 'utf8')).version ?? null } catch { return null }
}
console.log('FIX-058 host event chain（真 cordis × 真 dsh-session × 插件真实订阅安装）:')
console.log(`      · 靶子 = ${target.root}（来源 ${target.origin}；cordis ${versionOf('cordis') ?? 'absent'} / dsh-session ${versionOf('dsh-session') ?? 'absent'}）`)

const missing = ['cordis', 'dsh-session'].filter((pkg) => !existsSync(join(target.root, pkg, 'lib', 'index.js')))
if (missing.length > 0) {
  if (process.env.DSH_HOST_SOURCE) {
    skip('真包导入', `显式树缺 ${missing.join('/')}（部分树 ≠ 契约漂移——host-contract 同语义）`)
    console.log(`\nALL HOST EVENT CHAIN TESTS SKIPPED (${passed} passed, ${skipped} skipped)`)
    process.exit(0)
  }
  check('默认树真包在位（本仓完整树应含 cordis + dsh-session）', false, { missing, root: target.root })
  console.log(`\n${failures} FAILURE(S) (${passed} passed)`)
  process.exit(1)
}

// ── 真包导入（目标树实文件——与 dsh-session 自身的 bare-specifier 解析同物理副本）──
const { Context } = await import(pathToFileURL(join(target.root, 'cordis', 'lib', 'index.js')).href)
const dshSession = await import(pathToFileURL(join(target.root, 'dsh-session', 'lib', 'index.js')).href)
check('真包导出形态：Context（cordis）与 SessionStore（dsh-session）均为构造器', typeof Context === 'function' && typeof dshSession.SessionStore === 'function')

// ── 真 cordis root → 真 SessionStore 最小装配 → 承载会话的载体 fiber ──────────
const root = new Context()
const warnLines = []
root.logger = { warn: (m) => warnLines.push(String(m)), info: () => {}, error: () => {} }
const storeFiber = await root.plugin(dshSession.SessionStore)
await drain(2)
const store = root.get('sessions')
check('真 SessionStore 装配：sessions 服务经 ctx.get 解析且 create/append API 在位',
  typeof store?.create === 'function' && typeof store.get === 'function')

let pluginCtx = null
const pluginFiber = await root.plugin({ name: 'dsh-agent-router-fiber', apply: (ctx) => { pluginCtx = ctx } })
await drain(2)
check('插件行 fiber ctx 建立于真 cordis（root 同源）', !!pluginCtx && pluginCtx.root === root)

const SESSION_ID = 'sess-fix058'
const session = store.create(SESSION_ID)
await drain(2)
check(`真 Session 创建：id=${SESSION_ID}（载体 fiber = store.enter 的 scopeTarget carrier）`,
  session?.id === SESSION_ID && session.seq === 0)

// ── 服务面 spy 桩（锚定真源形状）+ 混合 harness ctx ─────────────────────────
const NATIVE = { provider: 'deepseek-official', model: 'deepseek-v4-pro' }
const MAIN_MODEL = { provider: 'openai', model: 'gpt-5.6-sol' }
const PRESET_ID = 'governance'

const agent = { options: { ...NATIVE }, session }
const agentsRegistry = { get: (id) => (id === SESSION_ID ? agent : undefined) } // dsh-agent：super(ctx,"agents") + get(id)
const selectCalls = []
const defaultsState = { current: { ...NATIVE }, saveCalls: [] }
const sessionController = { // dsh-api-session-controller：super(ctx,"sessionController",{namespace:"session"}) + async selectModel(request)
  async selectModel(request) {
    selectCalls.push(request)
    const selected = { provider: request.provider, model: request.model, ...(request.reasoningEffort === undefined ? {} : { reasoningEffort: request.reasoningEffort }) }
    defaultsState.saveCalls.push(selected) // 宿主 selectModel 内部副作用：全局默认瞬态写
    defaultsState.current = { ...selected }
    return { selected }
  },
}
const agentDefaultModel = { // dsh-agent-default-model：currentSelection/saveSelection
  currentSelection: () => defaultsState.current,
  saveSelection: async (selection) => { defaultsState.saveCalls.push(selection); defaultsState.current = { ...selection } },
}
const agentPresets = { composedPreset: () => PRESET_ID } // dsh-agent-preset-registry 罗盘（本路径不消费——面齐备）

// 混合 harness ctx：on 委托真 cordis 插件行 ctx（记录订阅调用），服务面走 spy 桩。
const onCalls = []
const hybridCtx = {
  on(event, listener, options) {
    onCalls.push({ event, options })
    return pluginCtx.on(event, listener, options)
  },
  get(key) {
    if (key === 'agents') return agentsRegistry
    if (key === 'sessionController') return sessionController
    if (key === 'agentDefaultModel') return agentDefaultModel
    if (key === 'agentPresets') return agentPresets
    return undefined
  },
  logger: { warn: (m) => warnLines.push(String(m)), info: () => {} },
}

const service = {
  isEnabled: () => true,
  presetDefaults: () => ({ [PRESET_ID]: { enabled: true, main: { ...MAIN_MODEL }, subagent: { provider: '', model: '' } } }),
}

// ── 插件真实订阅安装 + 判别 ────────────────────────────────────────────────
const { installPresetDefaults } = await import(pathToFileURL(join(REPO_ROOT, 'lib', 'preset-defaults.js')).href)
const dispose = installPresetDefaults(hybridCtx, service)
check('FIX-058 订阅形态：session/event 直订且带 {global:true}（两代 cordis dispatch 的 hook.global || 短路 Scoped 过滤；先例 session-controller state/listener.js 的 global 直订）',
  onCalls.some(({ event, options }) => event === 'session/event' && options && options.global === true),
  onCalls)

// 独立载荷探针（同一真投递面）：锚定 session/event 回调参数形状 = (session, event)。
const seenEvents = []
pluginCtx.on('session/event', (s, e) => { seenEvents.push([s, e]) }, { global: true })

// 主链断言：真 append API 追加预设选中事实 → global 直订 → onPresetSelected → 播种。
session.append('agent-preset/selected', { agentPreset: PRESET_ID })
await drain()
check('真投递面载荷形状：session/event 收 (session, event)，event = {type:\'agent-preset/selected\', data:{agentPreset:\'governance\'}}（钉死事实④）',
  seenEvents.length === 1 && seenEvents[0][0]?.id === SESSION_ID
    && seenEvents[0][1]?.type === 'agent-preset/selected' && seenEvents[0][1]?.data?.agentPreset === PRESET_ID,
  seenEvents.map(([s, e]) => [s?.id, e?.type, e?.data]))
check('播种主链：append → 插件 global 直订 → selectModel 恰一次收到 governance 配置 main 模型',
  selectCalls.length === 1 && selectCalls[0].sessionId === SESSION_ID
    && selectCalls[0].provider === MAIN_MODEL.provider && selectCalls[0].model === MAIN_MODEL.model,
  selectCalls)
check('options 突变与显示层一致（seedConfig 一致性）',
  agent.options.provider === MAIN_MODEL.provider && agent.options.model === MAIN_MODEL.model)
check('全局默认瞬态写 + 写回恢复（净变化为零）',
  defaultsState.saveCalls.length === 2
    && defaultsState.saveCalls[0].provider === MAIN_MODEL.provider && defaultsState.saveCalls[0].model === MAIN_MODEL.model
    && defaultsState.saveCalls[1].provider === NATIVE.provider && defaultsState.saveCalls[1].model === NATIVE.model
    && defaultsState.current.provider === NATIVE.provider && defaultsState.current.model === NATIVE.model)

// 负向过滤守卫：非预设选中事件不触发播种（session/title 不开启 turn 亦不属预设链）。
session.append('session/title', { title: 'fix-058' })
await drain()
check('负向：非 agent-preset/selected 的 session 事件不触发播种（selectCalls 仍为 1）', selectCalls.length === 1)

// ── FIX-059 getter-only options 臂（0.2.2 形态——写入面断代判别）────────────
// 0.2.2 的 agentOptions() 为 getter-only 活视图（源码 L440-453）：把 harness 的
// agent.options 换成同形态（getter 无 setter）→ 旧代码 ① 突变抛 TypeError 即
// skip='not-mutable' 提前 return（② selectModel 不执行）→ 本臂必红；修复后
// 能力探测分支跳过突变直接 selectModel（投影写入面）→ 绿 + 诊断 route 标注。
{
  const SESSION_ID2 = 'sess-fix059'
  const session2 = store.create(SESSION_ID2)
  await drain(2)
  const liveView = { provider: NATIVE.provider, model: NATIVE.model } // 模拟 defaults.currentSelection() 活源
  const getterAgent = {
    get options() {
      // getter-only 活视图（无 setter——对齐 0.2.2 agentOptions 形态；严格模式
      // 赋值 agent.options.provider = x 抛 TypeError）
      return {
        get provider() { return liveView.provider },
        get model() { return liveView.model },
      }
    },
    session: session2,
  }
  const agentsRegistry2 = { get: (id) => (id === SESSION_ID2 ? getterAgent : undefined) }
  const selectCalls2 = []
  const defaultsState2 = { current: { ...NATIVE }, saveCalls: [] }
  const sessionController2 = { // 同 sessionController 桩（saveSelection 副作用镜像）
    async selectModel(request) {
      selectCalls2.push(request)
      const selected = { provider: request.provider, model: request.model }
      defaultsState2.saveCalls.push(selected)
      defaultsState2.current = { ...selected }
      return { selected }
    },
  }
  const agentDefaultModel2 = {
    currentSelection: () => defaultsState2.current,
    saveSelection: async (selection) => { defaultsState2.saveCalls.push(selection); defaultsState2.current = { ...selection } },
  }
  const infoLines2 = []
  const hybridCtx2 = {
    on(event, listener, options) { return pluginCtx.on(event, listener, options) },
    get(key) {
      if (key === 'agents') return agentsRegistry2
      if (key === 'sessionController') return sessionController2
      if (key === 'agentDefaultModel') return agentDefaultModel2
      return undefined
    },
    logger: { warn: (m) => warnLines.push(String(m)), info: (m) => infoLines2.push(String(m)) },
  }
  const { presetDiagnostics } = await import(pathToFileURL(join(REPO_ROOT, 'lib', 'preset-defaults.js')).href)
  const dispose2 = installPresetDefaults(hybridCtx2, service)
  session2.append('agent-preset/selected', { agentPreset: PRESET_ID })
  await drain()
  check('FIX-059 getter-only options 臂：append → selectModel 仍被调用（播种不因 not-mutable 断链；旧代码此处零调用必红）',
    selectCalls2.length === 1 && selectCalls2[0].sessionId === SESSION_ID2
      && selectCalls2[0].provider === MAIN_MODEL.provider && selectCalls2[0].model === MAIN_MODEL.model,
    selectCalls2)
  check('FIX-059 getter-only options 臂：诊断记录 projection-only 路径（成功条目 route 标注）+ 降级 info 可观测',
    (() => {
      const hit = presetDiagnostics().entries.find((entry) => entry.session === SESSION_ID2 && entry.applied === true)
      return !!hit && hit.route === 'projection-only'
        && infoLines2.some((line) => line.includes('projection-only'))
    })(),
    presetDiagnostics().entries.filter((entry) => entry.session === SESSION_ID2))
  check('FIX-059 getter-only options 臂：全局默认写回恢复照常（净变化为零）',
    defaultsState2.saveCalls.length === 2
      && defaultsState2.saveCalls[0].provider === MAIN_MODEL.provider
      && defaultsState2.saveCalls[1].provider === NATIVE.provider
      && defaultsState2.current.provider === NATIVE.provider && defaultsState2.current.model === NATIVE.model,
    defaultsState2.saveCalls)
  check('FIX-059 getter-only options 臂：getter 视图未被改写（liveView 源保持全局默认值）',
    getterAgent.options.provider === NATIVE.provider && getterAgent.options.model === NATIVE.model)
  dispose2()
}

// 卸载器：移除 session/event 监听（dispose 聚合语义保持）。
dispose()
session.append('agent-preset/selected', { agentPreset: PRESET_ID })
await drain()
check('卸载器：dispose 后再 append → 零新播种（监听真被移除）', selectCalls.length === 1)

await pluginFiber.dispose()
await storeFiber.dispose()

if (failures > 0) {
  console.error(`\n${failures} FAILURE(S) (${passed} passed${skipped > 0 ? `, ${skipped} skipped` : ''})`)
  process.exit(1)
}
console.log(`\nALL HOST EVENT CHAIN TESTS PASSED (${passed} assertions${skipped > 0 ? `, ${skipped} skipped` : ''})`)
process.exit(0)
