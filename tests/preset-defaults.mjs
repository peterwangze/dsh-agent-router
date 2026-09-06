// EVO-014 判别测试：预设 Agent 默认模型——事件驱动重构。
//
// 用户三原则（本轮设计对话确立，验收基准）：
//   1. 模型跟随**预设变更事件**（agent/created + agent-preset/selected），
//      不是请求流拦截（agent/request 监听 MUST 已移除——回归守卫 D1）；
//   2. **不介入会话过程**——无任何 per-request 钩子；
//   3. 唯一豁免副作用：主会话显示播种借用 sessions.selectModel（显示层
//      picked 写入），其附带的全局默认写入**立即写回恢复**（恢复失败重试
//      一次 + 高声告警）。
//
// 宿主契约（Coordinator 侦察 + 开发期源码实证，dsh-host-apiproxy/dsh-agent/
// dsh-agent-loop/dsh-agent-presets）：
//   - agent/created：Scoped 事件，payload {agent}；resume 路径同样经
//     setupAndPublish→announce 发出（重启恢复的会话也会触发）；
//   - agent-preset/selected(sessionId, agentPreset)：非 scoped 双参事件，
//     仅空白会话切换预设时触发（宿主 agent-preset-locked 保证）；
//   - selectModel 进程内形态：sessions.selectModel({ payload: { sessionId,
//     provider, model, reasoningEffort? } }) → { result: { ok: true, value:
//     { selected } } } | { result: { ok: false, error } }；内部副作用 =
//     picked 写入（显示层）+ saveDefaultModelSelection（全局默认瞬态写）；
//   - 子代理请求纯 options（seedConfig）驱动——改 child.options 即改请求
//     模型，零副作用；child.options ≠ parent.options = 显式指定 → 不碰；
//   - 主会话空白时（无 requestHeader）buildRequest 现读 agent.options——
//     options 突变即首请求路由，与 picked 显示层一致。
//
// 判别断言（旧 request 层实现无事件监听 → 事件断言全败 = RED；重构后全绿）。
//
// Rework（R0 findings）：
//   - E 节 = F-1（P1）播种串行化判别——复刻宿主 fire-and-forget 并发交错
//     （S4：announce/cordis emit 均不 await 监听器），旧实现（无队列）必败；
//   - F 节 = F-2（P2）reasoningEffort 路径断言——对现有实现应全绿
//     （透传 / effort 漂移判据 / 重置路径透传）。
// Rework（R1 finding）：
//   - G 节 = NF-1（P2）seed 拒绝兜底判别——复刻宿主 cordis emit
//     fire-and-forget（不 await 监听器），旧实现（try 内 bare return
//     promise ≠ await）catch 不覆盖 → unhandledRejection 外泄必败；
//     return await 修复后 catch 兜底 warn、零外泄。
// Rework（FIX-023，EVO-014 复验失败——宿主实测 switch-seed 失效）：
//   - H 节 = agents 属性面缺陷判别——真实 cordis 插件 ctx 只有 inject 声明
//     过的服务名才有属性面；本插件 inject 未含 'agents' → ctx.agents 恒
//     undefined → 切换播种静默失效 + subagent 父查找保护降级。stub 全面
//     去属性化（注册表仅经 get('agents') 调用时解析——第三次同型 mock
//     保真度缺陷修复），旧实现（属性访问）必败；C4 强化 = agent 查不到
//     时 P8 warn 含 sessionId（不再静默）。
// Rework（FIX-024，EV-128 显示跟随缺口——宿主状态全对、GUI 目录不刷新）：
//   - I 节 = 种子成功后显式 ctx.emit('llm/adapters-updated') 判别——宿主
//     客户端模型目录仅三个刷新源（该远程事件 / settings/document-updated
//     远程事件 / 目录打开时 load()）；目标模型 = 当前全局默认时 selectModel
//     内部的设置写无值差异 → 文档事件不触发 → 选择器停留旧值。旧实现
//     （无 emit）对 I1/I3/I4 必败（RED）；I2/I5 为负向回归守卫（失败分支
//     与 subagent 零副作用路径绝不 emit）。
// Rework（FIX-025，EV-130 老无消息会话切换不跟随——空白判据与宿主不同构）：
//   - 宿主空白判据 = sessionBlank（dsh-host-apiproxy L1187-1189）：
//     `!session.events.some(e => e.type === 'turn/start')`——标题/目标/命令/
//     plan-mode 等**独立事件不开启 turn**，老无消息会话宿主仍判空白、允许
//     切换预设（a53ec5a2 日志：5× preset 事件 + 0 turn/start + 0
//     request/header）。旧实现 requestHeader 判据更严且不同构——老会话存
//     陈旧 request/header 时宿主允许切、插件跳过播种 → 切换不跟随；
//   - J 节 = 判别节：J1/J2（老会话：独立事件无 turn/start + 陈旧
//     requestHeader → 播种执行）旧实现必败（RED）；J3/J4 = events 不可读
//     回落守卫（requestHeader 反演，保守方向宁漏播不误播）；J5 = 事件元素
//     防御（null/非对象元素不炸）；
//   - A6/C3 按 FIX-025 同构语义修订为「events 含 turn/start → 不播种」
//     负向守卫（原 requestHeader 判据断言退役）；fixture session 增 events
//     数组（真实 Session 形态）。
// Rework（FIX-026 范围追加，EV-132 真机反证 + 用户架构裁决 P5 单一路径）：
//   - EV-132 真机反证 FIX-024 的服务端 emit 链不可达（源码推演通过、真机
//     实证失败）；FIX-026 客户端直驱（client.js 订阅 agent-preset/selected
//     → directoryFor(sessionId).load()）为唯一显示刷新路径，服务端 emit 与
//     之并存 = 双显示刷新逻辑（被取代的旧路径 MUST 删除，P-v3 原则 5）；
//   - I 节由 emit 正向判别改为**零 emit 负向守卫**（防复活）：I1/I3/I4 对
//     旧实现（有 emit）必败（RED）；I2/I5 原负向语义保留（失败零副作用 /
//     subagent 边界）；fixture 的 emit 记录面保留专供本组判别。
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

let failures = 0
function check(label, condition) {
  if (condition) console.log(`  ok  ${label}`)
  else { failures++; console.error(`FAIL  ${label}`) }
}

// EVO-014 目标模块（动态导入：实现缺失时 RED 仍可计数——逐条 FAIL 结算）。
// FIX-030：presetDiagnostics（诊断注册表快照——K 组断言面）。
let installPresetDefaults = null
let presetDiagnostics = null
let importFailure = null
try {
  ;({ installPresetDefaults, presetDiagnostics } = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'preset-defaults.js')).href))
} catch (error) {
  importFailure = error
}
const ready = () => typeof installPresetDefaults === 'function'

/** 判别断言：实现缺失 → 直接 FAIL（计 RED）；否则执行真实断言。 */
async function dcheck(label, fn) {
  if (!ready()) {
    failures++
    console.error(`FAIL  ${label}（RED：lib/preset-defaults.js 未实现${importFailure ? `——${importFailure.code ?? importFailure.message}` : ''}）`)
    return
  }
  let ok = false
  try { ok = (await fn()) === true } catch { ok = false }
  check(label, ok)
}

// ── 夹具 ────────────────────────────────────────────────────────────────
const NATIVE = { provider: 'deepseek-official', model: 'deepseek-v4-pro' }
const MAIN_MODEL = { provider: 'openai', model: 'gpt-5.6-sol' }
const SUB_MODEL = { provider: 'gateway', model: 'cheap-longform' }
const PRESET_ID = 'governance'
const OTHER_PRESET = 'novel'

/**
 * 伪 agentDefaultModel 服务（宿主 dsh-agent-default-model 同构）：
 * currentSelection() 读 live 状态；saveSelection() 写——failIndexes 精确
 * 注入第 N 次（0 起）调用失败（宿主 selectModel 内部对写失败仅 warn 包容，
 * 直接恢复调用则会真实抛错——两个消费路径都在本 stub 内可观测）。
 */
function makeDefaults({ initial = { ...NATIVE }, failIndexes = [] } = {}) {
  const state = { current: initial, saveCalls: [], attempts: 0 }
  const service = {
    state,
    currentSelection: () => state.current,
    async saveSelection(selection) {
      const attempt = state.attempts++ // 独立调用计数：失败也推进（重试不重复命中同一索引）
      if (failIndexes.includes(attempt)) throw new Error(`injected save failure #${attempt}`)
      state.saveCalls.push(selection)
      state.current = { ...selection }
    },
  }
  return service
}

/**
 * 伪 apiProxy 面（宿主 createApiProxy().sessions 同构——selectModel 精确
 * envelope/响应形状复刻：payload 校验 + picked + 全局瞬态写 + ok/err 信封）。
 * unavailable(provider, model) → 复刻 resolveCallConfig 失败分支。
 */
function makeApiProxy({ defaults, unavailable = () => false } = {}) {
  const calls = []
  return {
    calls,
    sessions: {
      async selectModel(request) {
        calls.push(request)
        const payload = request?.payload ?? {}
        const { sessionId, provider, model, reasoningEffort } = payload
        if (typeof sessionId !== 'string' || !sessionId || typeof provider !== 'string' || !provider || typeof model !== 'string' || !model) {
          return { rpcId: request?.rpcId, result: { ok: false, error: { code: 'bad-request', message: 'invalid payload', details: {} } } }
        }
        if (unavailable(provider, model)) {
          return { rpcId: request?.rpcId, result: { ok: false, error: { code: 'model-unavailable', message: `model "${model}" unavailable`, details: { provider, model } } } }
        }
        const selected = { provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) }
        try { await defaults?.saveSelection?.(selected) } catch { /* 宿主对全局写失败仅 warn——不失败 selectModel */ }
        return { rpcId: request?.rpcId, result: { ok: true, value: { selected } } }
      },
    },
  }
}

/**
 * 伪宿主 ctx：事件注册捕获 + apiProxy/agentDefaultModel/agentPresets/agents
 * 服务。FIX-023 fixture 保真度对齐：真实 cordis 插件 ctx 只有 inject 声明过
 * 的服务名才有属性面——本插件 inject 未含 'agents'，故 stub **不提供 agents
 * 属性**，注册表仅经 get('agents') 调用时解析（旧 stub 提供了宿主上不存在的
 * 属性面，掩盖了属性访问恒 undefined 的真实缺陷——第三次同型 mock 保真度
 * 缺陷，同 EVO-013 R0 F-1 / FIX-022 系列）。FIX-024：补 emit 调用记录
 * （真实 cordis ctx.emit 存在——stub 同形记录 (event, args) 供 I 节判别）。
 */
function makeCtx({ defaults, apiProxy, agents, agentPresets, sessionController } = {}) {
  const listeners = {}
  const emitted = []
  const logger = {
    infoCalls: [], warnCalls: [],
    info(message) { this.infoCalls.push(String(message)) },
    warn(message) { this.warnCalls.push(String(message)) },
  }
  return {
    listeners,
    logger,
    emitted,
    on(event, handler) {
      ;(listeners[event] ??= []).push(handler)
      return () => { listeners[event] = (listeners[event] ?? []).filter((entry) => entry !== handler) }
    },
    emit(event, ...args) {
      emitted.push({ event, args })
    },
    get(key) {
      if (key === 'agentDefaultModel') return defaults
      if (key === 'apiProxy') return apiProxy
      if (key === 'agentPresets') return agentPresets
      if (key === 'agents') return agents
      // FIX-030-A：新宿主会话选择面（dsh-api-session-controller
      // `super(ctx, "sessionController", {namespace:"session"})`）。
      if (key === 'sessionController') return sessionController
      return undefined
    },
  }
}

/**
 * 伪 sessionController（FIX-030-A：新宿主 0.1.2-rc.1 同构）：selectModel
 * 直接参数（无 payload 信封）+ 成功返回 {selected} 值 + 失败**抛
 * RemoteError**（非 result 信封）——与 makeApiProxy 形成形态对照。
 */
function makeSessionController({ defaults, unavailable = () => false } = {}) {
  const calls = []
  return {
    calls,
    async selectModel(request) {
      calls.push(request)
      const { sessionId, provider, model, reasoningEffort } = request ?? {}
      if (typeof sessionId !== 'string' || !sessionId || typeof provider !== 'string' || !provider || typeof model !== 'string' || !model) {
        const error = new Error('invalid request'); error.code = 'gateway/bad-request'; throw error
      }
      if (unavailable(provider, model)) {
        const error = new Error(`model "${model}" unavailable`); error.code = 'session/model-unavailable'; throw error
      }
      const selected = { provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) }
      try { await defaults?.saveSelection?.(selected) } catch { /* 宿主对全局写失败仅 warn */ }
      return { selected }
    },
  }
}

/** 伪 RouterService（installPresetDefaults 消费面：isEnabled/presetDefaults 热读取）。 */
function makeService(presets, enabled = true) {
  return {
    isEnabled: () => enabled,
    presetDefaults: () => presets,
  }
}

/** 伪 agent：session.id/header（宿主 dsh-agent 会话头快照）+ requestHeader（日志持久层）
 * + events（FIX-025：真实 Session 对象带事件数组——宿主 sessionBlank 判据事实源；
 * 空白会话 = events 无 turn/start（可含独立事件），fixture 缺省 events: []）。 */
function makeAgent({ id = 'sess-1', header, options, requestHeader, events, agentCtx } = {}) {
  const agent = {
    options,
    session: {
      id,
      ...(header ? { header } : {}),
      ...(requestHeader !== undefined ? { requestHeader } : {}),
      ...(events !== undefined ? { events } : {}),
    },
  }
  if (agentCtx !== undefined) agent.ctx = agentCtx
  return agent
}

/** 安装（每 ctx 一次——对齐宿主行为：插件宿主行生命周期内只安装一份监听）。 */
const installed = new WeakMap()
function setup(ctx, service) {
  if (!installed.has(ctx)) installed.set(ctx, installPresetDefaults(ctx, service))
  return installed.get(ctx)
}

/** 驱动一次 agent/created（payload {agent}）。监听缺失 → false（RED 判据）。 */
async function fireCreated(ctx, service, agent) {
  setup(ctx, service)
  const handler = (ctx.listeners['agent/created'] ?? [])[0]
  if (typeof handler !== 'function') return false
  await handler({ agent })
  return true
}

/** 驱动一次 agent-preset/selected（双参非 scoped 事件）。监听缺失 → false。 */
async function firePresetSelected(ctx, service, sessionId, preset) {
  setup(ctx, service)
  const handler = (ctx.listeners['agent-preset/selected'] ?? [])[0]
  if (typeof handler !== 'function') return false
  await handler(sessionId, preset)
  return true
}

const presetConfig = (patch = {}) => ({
  enabled: true,
  main: { provider: '', model: '', ...(patch.main ?? {}) },
  subagent: { provider: '', model: '', ...(patch.subagent ?? {}) },
  ...patch.extra,
})

const mainBlankAgent = (overrides = {}) => makeAgent({
  header: { origin: 'main', agentPreset: PRESET_ID },
  options: { ...NATIVE },
  requestHeader: () => null,
  events: [], // FIX-025：真实 Session 形态带 events（空白 = 无 turn/start）
  ...overrides,
})

const subHeader = () => ({ origin: 'subagent', agentPreset: PRESET_ID, parentSession: 'parent-1', delegationDepth: 1 })

console.log('EVO-014 preset default model — event-driven (RED until refactored):')

// ── A. agent/created 主会话播种 ──────────────────────────────────────────
{
  // A1-A3 空白主会话 + 已配置 → selectModel 播种 + options 突变 + 全局写回恢复。
  const defaults = makeDefaults()
  const apiProxy = makeApiProxy({ defaults })
  const ctx = makeCtx({ defaults, apiProxy })
  const agent = mainBlankAgent({ id: 'sess-a1' })
  await dcheck('A1 空白主会话+已配置 → selectModel({payload:{sessionId,provider,model}}) 精确 envelope', async () => {
    await fireCreated(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    return apiProxy.calls.length === 1
      && apiProxy.calls[0].payload.sessionId === 'sess-a1'
      && apiProxy.calls[0].payload.provider === MAIN_MODEL.provider
      && apiProxy.calls[0].payload.model === MAIN_MODEL.model
  })
  check('A2 options 突变为预设主模型（seedConfig 一致性 + subagent 继承载体）',
    agent.options.provider === MAIN_MODEL.provider && agent.options.model === MAIN_MODEL.model)
  check('A3 全局默认写回恢复：瞬态写=P.main → 恢复=globalBefore → 净变化为零',
    defaults.state.saveCalls.length === 2
      && defaults.state.saveCalls[0].provider === MAIN_MODEL.provider && defaults.state.saveCalls[0].model === MAIN_MODEL.model
      && defaults.state.saveCalls[1].provider === NATIVE.provider && defaults.state.saveCalls[1].model === NATIVE.model
      && defaults.state.current.provider === NATIVE.provider && defaults.state.current.model === NATIVE.model)
}
{
  // A4-A5 未配置 → 零调用。
  await dcheck('A4 空白+预设不在字典 → 零 selectModel/零全局写/options 不动', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent()
    await fireCreated(makeCtx({ defaults, apiProxy }), makeService({}), agent)
    return apiProxy.calls.length === 0 && defaults.state.saveCalls.length === 0
      && agent.options.provider === NATIVE.provider && agent.options.model === NATIVE.model
  })
  await dcheck('A5 main 未设置完成（只有 provider）→ 遵循 DSH 规则（零动作）', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent()
    await fireCreated(makeCtx({ defaults, apiProxy }), makeService({ governance: presetConfig({ main: { provider: MAIN_MODEL.provider, model: '' } }) }), agent)
    return apiProxy.calls.length === 0 && defaults.state.saveCalls.length === 0 && agent.options.model === NATIVE.model
  })
}
{
  // A6 已产出会话 → 零动作。FIX-025 判据同构修订：已产出 = events 含
  // turn/start（宿主 sessionBlank 判非空白、拒绝切换预设）——requestHeader
  // 真值为真实已产出会话形态，一并列入断言（负向守卫两个事实源）。
  await dcheck('A6 已产出会话（events 含 turn/start）→ 零动作（宿主 sessionBlank 同构负向守卫，FIX-025 判据同构）', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent({
      requestHeader: () => ({ config: { provider: 'anthropic', model: 'user-picked' } }),
      events: [{ type: 'session/title' }, { type: 'turn/start' }, { type: 'turn/end' }],
    })
    await fireCreated(makeCtx({ defaults, apiProxy }), makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    return apiProxy.calls.length === 0 && defaults.state.saveCalls.length === 0
      && agent.options.provider === NATIVE.provider && agent.options.model === NATIVE.model
  })
}
{
  // A7 preset 解析兜底链（EVO-013 composedPreset live + header 兜底保留）。
  await dcheck('A7 header 无 agentPreset → composedPreset live 解析兜底生效', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = makeAgent({ id: 'sess-a7', header: { origin: 'main' }, options: { ...NATIVE }, requestHeader: () => null, agentCtx: {} })
    await fireCreated(makeCtx({ defaults, apiProxy, agentPresets: { composedPreset: () => PRESET_ID } }), makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    return apiProxy.calls.length === 1 && agent.options.provider === MAIN_MODEL.provider
  })
  await dcheck('A8 无 preset 可解析（服务缺失+header 空）→ 零动作', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = makeAgent({ id: 'sess-a8', header: { origin: 'main' }, options: { ...NATIVE }, requestHeader: () => null })
    await fireCreated(makeCtx({ defaults, apiProxy }), makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    return apiProxy.calls.length === 0 && agent.options.provider === NATIVE.provider
  })
  await dcheck('A9 agent 无 session → 防御性零动作（不炸）', async () => {
    const apiProxy = makeApiProxy({ defaults: makeDefaults() })
    const ctx = makeCtx({ defaults: makeDefaults(), apiProxy })
    await fireCreated(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), {})
    return apiProxy.calls.length === 0
  })
}
{
  // A10 fail-closed：globalBefore 不可读 → 无法保证写回 → 跳过播种 + 可观测。
  await dcheck('A10 全局默认 live 读取失败（服务缺失）→ 跳过播种 + warn（fail-closed）', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const ctx = makeCtx({ apiProxy })
    ctx.get = (key) => (key === 'apiProxy' ? apiProxy : undefined)
    const agent = mainBlankAgent()
    await fireCreated(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    return apiProxy.calls.length === 0 && agent.options.provider === NATIVE.provider
      && ctx.logger.warnCalls.some((line) => line.includes('fail-closed') || line.includes('unreadable'))
  })
}
{
  // A11 selectModel 错误分支（模型不可用）→ options 回滚 + warn + 零全局写。
  await dcheck('A11 selectModel 错误（model-unavailable）→ options 回滚 + warn + 零全局写', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults, unavailable: (provider, model) => model === MAIN_MODEL.model })
    const agent = mainBlankAgent()
    const ctx = makeCtx({ defaults, apiProxy })
    await fireCreated(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    return apiProxy.calls.length === 1 && defaults.state.saveCalls.length === 0
      && agent.options.provider === NATIVE.provider && agent.options.model === NATIVE.model
      && ctx.logger.warnCalls.some((line) => line.includes('model-unavailable') || line.includes('selectModel') || line.includes('preset default'))
  })
}

// ── B. subagent 纯 options 修正（零 selectModel / 零全局写） ─────────────
{
  await dcheck('B1 subagent+subagent 配置 → child.options=S，无 selectModel 无全局写', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = makeAgent({ id: 'child-1', header: subHeader(), options: { ...NATIVE }, requestHeader: () => null })
    const parent = { options: { ...NATIVE } }
    await fireCreated(makeCtx({ defaults, apiProxy, agents: { get: (id) => (id === 'parent-1' ? parent : undefined) } }),
      makeService({ governance: presetConfig({ main: MAIN_MODEL, subagent: SUB_MODEL }) }), agent)
    return agent.options.provider === SUB_MODEL.provider && agent.options.model === SUB_MODEL.model
      && apiProxy.calls.length === 0 && defaults.state.saveCalls.length === 0
  })
  await dcheck('B2 subagent 未配 subagent、配 main → child.options=main（继承）', async () => {
    const apiProxy = makeApiProxy({ defaults: makeDefaults() })
    const agent = makeAgent({ id: 'child-2', header: subHeader(), options: { ...NATIVE }, requestHeader: () => null })
    const parent = { options: { ...NATIVE } }
    await fireCreated(makeCtx({ apiProxy, agents: { get: () => parent } }),
      makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    return agent.options.provider === MAIN_MODEL.provider && agent.options.model === MAIN_MODEL.model && apiProxy.calls.length === 0
  })
  await dcheck('B3 subagent 全未配置 → 零动作（天然继承 parent.options）', async () => {
    const apiProxy = makeApiProxy({ defaults: makeDefaults() })
    const agent = makeAgent({ id: 'child-3', header: subHeader(), options: { ...NATIVE }, requestHeader: () => null })
    await fireCreated(makeCtx({ apiProxy, agents: { get: () => ({ options: { ...NATIVE } }) } }),
      makeService({ governance: presetConfig() }), agent)
    return agent.options.provider === NATIVE.provider && apiProxy.calls.length === 0
  })
  await dcheck('B4 显式覆盖（child.options ≠ parent.options）→ 不碰（专业 agent/workflow 保护）', async () => {
    const apiProxy = makeApiProxy({ defaults: makeDefaults() })
    const agent = makeAgent({ id: 'child-4', header: subHeader(), options: { provider: 'anthropic', model: 'claude-explicit' }, requestHeader: () => null })
    const parent = { options: { provider: 'anthropic', model: 'claude-x' } }
    await fireCreated(makeCtx({ apiProxy, agents: { get: () => parent } }),
      makeService({ governance: presetConfig({ main: MAIN_MODEL, subagent: SUB_MODEL }) }), agent)
    return agent.options.model === 'claude-explicit' && apiProxy.calls.length === 0
  })
  await dcheck('B5 parent 不在注册表（父创建早于配置等边缘）→ fixup 仍生效', async () => {
    const apiProxy = makeApiProxy({ defaults: makeDefaults() })
    const agent = makeAgent({ id: 'child-5', header: subHeader(), options: { ...NATIVE }, requestHeader: () => null })
    await fireCreated(makeCtx({ apiProxy, agents: { get: () => undefined } }),
      makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    return agent.options.provider === MAIN_MODEL.provider && apiProxy.calls.length === 0
  })
  await dcheck('B6 options 冻结形态（Object.freeze）→ warn 不炸、无 selectModel', async () => {
    const apiProxy = makeApiProxy({ defaults: makeDefaults() })
    const agent = makeAgent({ id: 'child-6', header: subHeader(), options: Object.freeze({ ...NATIVE }), requestHeader: () => null })
    const ctx = makeCtx({ apiProxy, agents: { get: () => ({ options: { ...NATIVE } }) } })
    let rejected = null
    try {
      await fireCreated(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    } catch (error) { rejected = error }
    return rejected === null && apiProxy.calls.length === 0
      && ctx.logger.warnCalls.some((line) => line.includes('preset default') || line.includes('frozen') || line.includes('options'))
  })
}

// ── C. agent-preset/selected（空白切换实时跟随） ─────────────────────────
{
  await dcheck('C1 空白切换到已配置预设 → 重播新配置（selectModel+options+恢复）', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent({ id: 'sess-c1', header: { origin: 'main' } })
    const ctx = makeCtx({ defaults, apiProxy, agents: { get: (id) => (id === 'sess-c1' ? agent : undefined) } })
    await firePresetSelected(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), 'sess-c1', PRESET_ID)
    return apiProxy.calls.length === 1 && apiProxy.calls[0].payload.provider === MAIN_MODEL.provider
      && agent.options.provider === MAIN_MODEL.provider
      && defaults.state.current.provider === NATIVE.provider
  })
  await dcheck('C2 切到无配置预设 → selectModel(全局默认) 且全局净变化为零', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent({ id: 'sess-c2', header: { origin: 'main' } })
    const ctx = makeCtx({ defaults, apiProxy, agents: { get: (id) => (id === 'sess-c2' ? agent : undefined) } })
    const service = makeService({ governance: presetConfig({ main: MAIN_MODEL }) })
    await firePresetSelected(ctx, service, 'sess-c2', PRESET_ID)
    const afterFirst = { ...defaults.state.current }
    await firePresetSelected(ctx, service, 'sess-c2', OTHER_PRESET)
    return afterFirst.provider === NATIVE.provider
      && apiProxy.calls.length === 2 && apiProxy.calls[1].payload.provider === NATIVE.provider && apiProxy.calls[1].payload.model === NATIVE.model
      && agent.options.provider === NATIVE.provider
      && defaults.state.current.provider === NATIVE.provider && defaults.state.current.model === NATIVE.model
      && defaults.state.saveCalls.length === 3 // P.main 瞬态 + 恢复 + G→G 同值写（无第二次恢复）
  })
  await dcheck('C3 防御：已产出会话（events 含 turn/start）收到切换事件 → 零动作（FIX-025 同构负向守卫）', async () => {
    const apiProxy = makeApiProxy({ defaults: makeDefaults() })
    const agent = mainBlankAgent({
      requestHeader: () => ({ config: { provider: 'anthropic', model: 'user-picked' } }),
      events: [{ type: 'turn/start' }],
    })
    const ctx = makeCtx({ apiProxy, agents: { get: () => agent } })
    await firePresetSelected(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), 'sess-x', PRESET_ID)
    return apiProxy.calls.length === 0
  })
  await dcheck('C4 防御：会话不在 agents 注册表 → 零动作不炸 + P8 warn 含 sessionId（FIX-023：不再静默）', async () => {
    const apiProxy = makeApiProxy({ defaults: makeDefaults() })
    const ctx = makeCtx({ apiProxy, agents: { get: () => undefined } })
    let rejected = null
    try { await firePresetSelected(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), 'ghost', PRESET_ID) } catch (error) { rejected = error }
    return rejected === null && apiProxy.calls.length === 0
      && ctx.logger.warnCalls.some((line) => line.includes('ghost'))
  })
}

// ── D. 主权结构 / fail-safe / 开关 / 热更新 / 观测 ───────────────────────
{
  await dcheck('D1 主权结构断言：播种模块只注册 agent/created + agent-preset/selected 两个监听，无 agent/request（回归守卫——EVO-017 请求遥测是独立函数 installRequestTelemetry 的用户授权豁免，不在本模块）', () => {
    const ctx = makeCtx({})
    setup(ctx, makeService({}))
    const events = Object.keys(ctx.listeners)
    return events.length === 2 && events.includes('agent/created') && events.includes('agent-preset/selected')
      && !Object.keys(ctx.listeners).includes('agent/request')
      && (ctx.listeners['agent/created'] ?? []).length === 1 && (ctx.listeners['agent-preset/selected'] ?? []).length === 1
  })
  await dcheck('D2 卸载器移除全部两个监听（随宿主行 fiber 卸载）', () => {
    const ctx = makeCtx({})
    const dispose = setup(ctx, makeService({}))
    if (typeof dispose !== 'function') return false
    dispose()
    return Object.keys(ctx.listeners).every((event) => (ctx.listeners[event] ?? []).length === 0)
  })
  await dcheck('D3 恢复失败 → 重试一次成功 → 全局已恢复，无高声告警', async () => {
    const defaults = makeDefaults({ failIndexes: [1] }) // #0 瞬态写成功 → #1 恢复失败（抛错不入账）→ #2 重试成功
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent()
    const ctx = makeCtx({ defaults, apiProxy })
    await fireCreated(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    return defaults.state.saveCalls.length === 2 // 成功落账 = 瞬态写 + 重试恢复
      && defaults.state.current.provider === NATIVE.provider
      && !ctx.logger.warnCalls.some((line) => line.includes('手动改回') || line.includes('manually'))
  })
  await dcheck('D4 恢复重试仍失败 → 高声告警（含手动改回指引与原全局值）', async () => {
    const defaults = makeDefaults({ failIndexes: [1, 2] })
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent()
    const ctx = makeCtx({ defaults, apiProxy })
    await fireCreated(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    const loud = ctx.logger.warnCalls.find((line) => line.includes('手动改回') || line.includes('manually'))
    return !!loud && loud.includes(NATIVE.provider) && loud.includes(NATIVE.model)
      && defaults.state.current.provider === MAIN_MODEL.provider // 停留在预设模型（已尽力告警）
  })
  await dcheck('D5 会话选择面缺失（sessionController/apiProxy 双缺失）→ warn 可观测降级（零动作）+ handler 正常返回（agent 创建不受影响）', async () => {
    const agent = mainBlankAgent()
    const ctx = makeCtx({ defaults: makeDefaults() }) // 无任何选择面（FIX-030-A 双形态）
    let rejected = null
    try { await fireCreated(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent) } catch (error) { rejected = error }
    return rejected === null
      && agent.options.provider === NATIVE.provider && agent.options.model === NATIVE.model
      && ctx.logger.warnCalls.some((line) => line.includes('select face') || line.includes('apiProxy'))
  })
  await dcheck('D6 sessions.selectModel 非函数（面形态漂移）→ 同 D5 降级不炸', async () => {
    const agent = mainBlankAgent()
    const ctx = makeCtx({ apiProxy: { sessions: {} }, defaults: makeDefaults() })
    let rejected = null
    try { await fireCreated(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent) } catch (error) { rejected = error }
    // FIX-030-A：双形态适配后降级 warn 文案 = 「no session select face」。
    return rejected === null && ctx.logger.warnCalls.some((line) => line.includes('select face') || line.includes('selectModel'))
  })
  await dcheck('D7 handler 内部异常（presetDefaults 抛错）→ fail-safe warn，不 reject', async () => {
    const agent = mainBlankAgent()
    const ctx = makeCtx({ defaults: makeDefaults(), apiProxy: makeApiProxy({ defaults: makeDefaults() }) })
    const service = { isEnabled: () => true, presetDefaults: () => { throw new Error('settings read failed') } }
    let rejected = null
    try { await fireCreated(ctx, service, agent) } catch (error) { rejected = error }
    return rejected === null && ctx.logger.warnCalls.some((line) => line.includes('preset default'))
  })
  await dcheck('D8 插件总开关 enabled=false → 事件零动作（热关闭）', async () => {
    const apiProxy = makeApiProxy({ defaults: makeDefaults() })
    const agent = mainBlankAgent()
    await fireCreated(makeCtx({ apiProxy }), makeService({ governance: presetConfig({ main: MAIN_MODEL }) }, false), agent)
    return apiProxy.calls.length === 0 && agent.options.provider === NATIVE.provider
  })
  await dcheck('D9 条目 enabled=false → 零动作', async () => {
    const apiProxy = makeApiProxy({ defaults: makeDefaults() })
    const agent = mainBlankAgent()
    await fireCreated(makeCtx({ apiProxy }), makeService({ governance: presetConfig({ extra: { enabled: false }, main: MAIN_MODEL }) }), agent)
    return apiProxy.calls.length === 0 && agent.options.provider === NATIVE.provider
  })
  await dcheck('D10 配置热更新（事件间改 presets 字典）→ 现读生效', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const store = { governance: presetConfig({ main: MAIN_MODEL }) }
    const agent = mainBlankAgent()
    const ctx = makeCtx({ defaults, apiProxy })
    await fireCreated(ctx, makeService(store), agent)
    const firstModel = agent.options.model
    store.governance = presetConfig({ main: SUB_MODEL })
    await fireCreated(ctx, makeService(store), agent)
    return firstModel === MAIN_MODEL.model && agent.options.provider === SUB_MODEL.provider && agent.options.model === SUB_MODEL.model
  })
  await dcheck('D11 观测去重有界：同 (preset, session) 重复事件只打一条 info', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent()
    const ctx = makeCtx({ defaults, apiProxy })
    const service = makeService({ governance: presetConfig({ main: MAIN_MODEL }) })
    await fireCreated(ctx, service, agent)
    await fireCreated(ctx, service, agent)
    const infos = ctx.logger.infoCalls.filter((line) => line.includes(PRESET_ID))
    return infos.length === 1 && infos[0].includes(MAIN_MODEL.provider) && ctx.logger.warnCalls.length === 0
  })
}

// ── E. 播种串行化（R0 F-1：并发事件交错不得污染全局默认） ─────────────────
{
  // 复刻宿主 fire-and-forget（不 await 第一个 handler 就触发第二个）——
  // 旧实现（无串行化队列）交错终态 = 预设模型（h2 把全局默认恢复到 h1 的
  // 瞬态中间值，且无告警）→ 本断言必败（RED 判别）；串行化后 h2 的
  // globalBefore 读到的是 h1 完成恢复后的稳定值 G，全局终态 = G。
  await dcheck('E1 并发播种串行化（agent/created ×2 交错）→ h2 读到恢复后的稳定全局值，终态=G 非中间值', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const ctx = makeCtx({ defaults, apiProxy })
    setup(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }))
    const handler = (ctx.listeners['agent/created'] ?? [])[0]
    const agent1 = mainBlankAgent({ id: 'sess-e1a' })
    const agent2 = mainBlankAgent({ id: 'sess-e1b' })
    const first = handler({ agent: agent1 }) // 不 await——并发时序复刻
    const second = handler({ agent: agent2 })
    await Promise.all([first, second])
    return apiProxy.calls.length === 2
      && agent1.options.provider === MAIN_MODEL.provider && agent1.options.model === MAIN_MODEL.model
      && agent2.options.provider === MAIN_MODEL.provider && agent2.options.model === MAIN_MODEL.model
      && defaults.state.current.provider === NATIVE.provider
      && defaults.state.current.model === NATIVE.model
      && defaults.state.current.reasoningEffort === undefined
  })
  await dcheck('E2 跨事件面并发（agent/created + agent-preset/selected 同窗）→ 同一队列串行化，终态=G', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent1 = mainBlankAgent({ id: 'sess-e2a' })
    const agent2 = mainBlankAgent({ id: 'sess-e2b', header: { origin: 'main' } })
    const ctx = makeCtx({ defaults, apiProxy, agents: { get: (id) => (id === 'sess-e2b' ? agent2 : undefined) } })
    setup(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }))
    const created = (ctx.listeners['agent/created'] ?? [])[0]
    const selected = (ctx.listeners['agent-preset/selected'] ?? [])[0]
    const first = created({ agent: agent1 })
    const second = selected('sess-e2b', PRESET_ID)
    await Promise.all([first, second])
    return apiProxy.calls.length === 2
      && agent1.options.provider === MAIN_MODEL.provider && agent1.options.model === MAIN_MODEL.model
      && agent2.options.provider === MAIN_MODEL.provider && agent2.options.model === MAIN_MODEL.model
      && defaults.state.current.provider === NATIVE.provider
      && defaults.state.current.model === NATIVE.model
  })
}

// ── F. reasoningEffort 路径断言（R0 F-2：透传 / 漂移判据 / 重置透传） ─────
{
  await dcheck('F1 配置 main 带 reasoningEffort → selectModel payload 透传（空串归一=不带）', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent({ id: 'sess-f1' })
    await fireCreated(makeCtx({ defaults, apiProxy }),
      makeService({ governance: presetConfig({ main: { ...MAIN_MODEL, reasoningEffort: 'high' } }) }), agent)
    const passthrough = apiProxy.calls.length === 1 && apiProxy.calls[0].payload.reasoningEffort === 'high'
    // effortOf 归一：空串 = 未设置 → envelope 不含该键。
    const defaults2 = makeDefaults()
    const apiProxy2 = makeApiProxy({ defaults: defaults2 })
    const agent2 = mainBlankAgent({ id: 'sess-f1b' })
    await fireCreated(makeCtx({ defaults: defaults2, apiProxy: apiProxy2 }),
      makeService({ governance: presetConfig({ main: { ...MAIN_MODEL, reasoningEffort: '' } }) }), agent2)
    return passthrough
      && apiProxy2.calls.length === 1
      && !('reasoningEffort' in apiProxy2.calls[0].payload)
  })
  await dcheck('F2 仅 effort 漂移（provider/model 同值）→ drifted 命中 → 恢复且恢复 payload 含原 effort', async () => {
    const defaults = makeDefaults({ initial: { ...NATIVE, reasoningEffort: 'medium' } })
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent({ id: 'sess-f2' })
    await fireCreated(makeCtx({ defaults, apiProxy }),
      makeService({ governance: presetConfig({ main: { provider: NATIVE.provider, model: NATIVE.model, reasoningEffort: 'high' } }) }), agent)
    return apiProxy.calls.length === 1
      && defaults.state.saveCalls.length === 2 // 瞬态写 + 恢复（drifted 不含 effort 判据则不恢复）
      && defaults.state.saveCalls[0].reasoningEffort === 'high'
      && defaults.state.saveCalls[1].reasoningEffort === 'medium'
      && defaults.state.current.reasoningEffort === 'medium'
  })
  await dcheck('F3 重置路径（切无配置预设）→ selectModel payload 透传全局默认的 effort', async () => {
    const defaults = makeDefaults({ initial: { ...NATIVE, reasoningEffort: 'low' } })
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent({ id: 'sess-f3', header: { origin: 'main' } })
    const ctx = makeCtx({ defaults, apiProxy, agents: { get: (id) => (id === 'sess-f3' ? agent : undefined) } })
    const service = makeService({ governance: presetConfig({ main: MAIN_MODEL }) })
    await firePresetSelected(ctx, service, 'sess-f3', PRESET_ID)
    await firePresetSelected(ctx, service, 'sess-f3', OTHER_PRESET)
    return apiProxy.calls.length === 2
      && apiProxy.calls[1].payload.reasoningEffort === 'low'
      && defaults.state.current.reasoningEffort === 'low'
      && agent.options.provider === NATIVE.provider && agent.options.model === NATIVE.model
  })
}

// ── G. seed 拒绝兜底（R1 NF-1：fire-and-forget 下 handler catch 必须覆盖） ─
{
  // 事实链复刻：① try 内 bare return promise ≠ await——run 拒绝时 catch 不
  // 执行，async handler 直接拒绝；② 现实拒绝源 = seed 面可用性预检的
  // ctx.get('apiProxy')（唯一未包 try/catch 的逃逸）；③ 宿主 cordis emit
  // fire-and-forget 丢弃返回值 → unhandledRejection。旧实现必败（RED），
  // return await 后 catch 兜底 warn、零外泄（GREEN）。
  // FIX-030-A 更新：注入点从 seed 调用中段前移到面解析——ctx.get('apiProxy')
  // 抛错被 sessionSelectFaceOf 内 try/catch 捕获 → face=null → 降级 warn
  // （观测语义保持：面不可用可观测）+ 零 unhandledRejection（外泄判据不变）。
  await dcheck('G1 选择面解析拒绝（ctx.get 抛错注入）→ face 降级 warn 可观测 + 零 unhandledRejection 外泄', async () => {
    const defaults = makeDefaults()
    const agent = mainBlankAgent({ id: 'sess-g1', header: { origin: 'main' } })
    const ctx = makeCtx({ defaults, apiProxy: makeApiProxy({ defaults }), agents: { get: (id) => (id === 'sess-g1' ? agent : undefined) } })
    setup(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }))
    const handler = (ctx.listeners['agent-preset/selected'] ?? [])[0]
    // 拒绝注入：仅 ctx.get('apiProxy') 抛错（其余键原样放行——liveDefaultSelection 等不受影响）。
    const realGet = ctx.get
    ctx.get = (key) => {
      if (key === 'apiProxy') throw new Error('injected apiProxy face failure')
      return realGet(key)
    }
    // process 级 unhandledRejection 捕获器（外泄判据——RED 复现点）。
    const captured = []
    const onUnhandled = (reason) => captured.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      // 复刻宿主 cordis emit fire-and-forget（S4）：不 await、丢弃返回值——
      // 只有外泄的 handler 拒绝才会成为 unhandledRejection。
      handler('sess-g1', PRESET_ID)
      // 排空微任务 + 跨 setImmediate 轮次（Node 在 turn 末检测 unhandled rejection）。
      for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve))
      if (captured.length > 0) console.error(`  (G1 诊断: process 级捕获 unhandledRejection ×${captured.length}: ${captured[0]?.message ?? String(captured[0])})`)
      // FIX-030-A：面解析抛错被吞为 face=null → 降级 warn（seeding skipped:
      // no session select face）——可观测保持；handler 零外泄。
      return captured.length === 0
        && ctx.logger.warnCalls.some((line) => line.includes('seeding skipped') && line.includes('select face'))
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
}

// ── H. FIX-023 判别：agents 注册表经 ctx.get('agents') 调用时解析 ────────
{
  // 缺陷事实链（Coordinator 宿主源码 + API 实测双重实证）：插件 inject =
  // ['settings','typert','webServer'] 未含 'agents' → cordis 属性访问
  // （ctx.agents）仅对 inject 声明过的服务名生效 → 恒 undefined →
  // onPresetSelected 静默 return（切换播种永不执行，无日志）+
  // subagentFixup 父查找保护降级。修复形态 = ctx.get('agents') 调用时解析
  // （先例：service.js `this.ctx.get('subagents')`；同模块 seed 内
  // ctx.get('apiProxy') 宿主实证可用）。本节 stub 与真实 cordis ctx 同形
  // （无 agents 属性）——旧实现（属性访问）必败（RED）。
  await dcheck('H1 切换事件 handler 经 ctx.get(\'agents\') 查到 agent 并播种（旧实现属性面 undefined → 静默 skip → 必败）', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent({ id: 'sess-h1', header: { origin: 'main' } })
    const ctx = makeCtx({ defaults, apiProxy, agents: { get: (id) => (id === 'sess-h1' ? agent : undefined) } })
    await firePresetSelected(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), 'sess-h1', PRESET_ID)
    return apiProxy.calls.length === 1 && apiProxy.calls[0].payload.provider === MAIN_MODEL.provider
      && agent.options.provider === MAIN_MODEL.provider
      && defaults.state.current.provider === NATIVE.provider // 写回恢复完成
  })
  await dcheck('H2 subagentFixup 父查找经 ctx.get 生效：parent 在场且 child≠parent → 不碰（显式覆盖保护恢复，旧实现必败）', async () => {
    const apiProxy = makeApiProxy({ defaults: makeDefaults() })
    const agent = makeAgent({ id: 'child-h2', header: subHeader(), options: { provider: 'anthropic', model: 'claude-explicit' }, requestHeader: () => null })
    const parent = { options: { provider: 'anthropic', model: 'claude-x' } }
    await fireCreated(makeCtx({ apiProxy, agents: { get: (id) => (id === 'parent-1' ? parent : undefined) } }),
      makeService({ governance: presetConfig({ main: MAIN_MODEL, subagent: SUB_MODEL }) }), agent)
    return agent.options.model === 'claude-explicit' && apiProxy.calls.length === 0
  })
  check('H3 stub 保真度守卫：ctx 不暴露 agents 属性（防 fixture 再度属性化——同型 mock 缺陷结构防线）',
    (() => {
      const ctx = makeCtx({ agents: { get: () => undefined } })
      return !('agents' in ctx) && typeof ctx.get === 'function' && ctx.get('agents') !== undefined
    })())
}

// ── I. FIX-026 范围追加：服务端 emit 死路径删除——种子成功零 emit 负向守卫（防复活）──
{
  // 演进事实链：FIX-024（EV-128）曾以种子成功后显式 ctx.emit
  // ('llm/adapters-updated') 补显示刷新；EV-132 真机反证该服务端 emit 链
  // 不可达（源码推演通过、真机实证失败），且与 FIX-026 客户端直驱
  // （client.js 订阅 agent-preset/selected → directoryFor(sessionId).load()）
  // 并存 = 双显示刷新逻辑。用户架构裁决（P5 单一路径原则 / P-v3 原则 5）：
  // 删除服务端 emit，客户端订阅为唯一显示刷新路径。本节由 FIX-024 的
  // emit 正向判别改为**负向守卫**：种子全成功路径（含重置路径）绝不打
  // 'llm/adapters-updated'——旧实现（有 emit）对 I1/I3/I4 必败（RED）；
  // fixture 的 emit 记录面保留专供本组防复活判别。I2/I5 原负向语义保留
  // （失败分支与 subagent 纯 options 路径零信号）。
  await dcheck('I1 种子成功 → 零 llm/adapters-updated emit（服务端死路径已删——旧实现恰一次必败 RED）+ 播种照常生效', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent({ id: 'sess-i1' })
    const ctx = makeCtx({ defaults, apiProxy })
    await fireCreated(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    return apiProxy.calls.length === 1
      && agent.options.provider === MAIN_MODEL.provider && agent.options.model === MAIN_MODEL.model
      && ctx.emitted.filter((entry) => entry.event === 'llm/adapters-updated').length === 0
  })
  await dcheck('I2 种子失败分支（selectModel err 信封）→ 零 emit（失败零副作用零信号——原负向语义保留）', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults, unavailable: (provider, model) => model === MAIN_MODEL.model })
    const agent = mainBlankAgent({ id: 'sess-i2' })
    const ctx = makeCtx({ defaults, apiProxy })
    await fireCreated(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    return apiProxy.calls.length === 1 && ctx.emitted.length === 0
      && agent.options.provider === NATIVE.provider && agent.options.model === NATIVE.model // 回滚成立
  })
  await dcheck('I3 重置路径（切无配置预设 → selectModel(全局默认) 成功）→ 同样零 emit（旧实现恰一次必败 RED）', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent({ id: 'sess-i3', header: { origin: 'main' } })
    const ctx = makeCtx({ defaults, apiProxy, agents: { get: (id) => (id === 'sess-i3' ? agent : undefined) } })
    const service = makeService({ governance: presetConfig({ main: MAIN_MODEL }) })
    await firePresetSelected(ctx, service, 'sess-i3', OTHER_PRESET) // OTHER_PRESET 无配置 → 重置回全局默认
    return apiProxy.calls.length === 1 && apiProxy.calls[0].payload.provider === NATIVE.provider
      && agent.options.provider === NATIVE.provider
      && ctx.emitted.filter((entry) => entry.event === 'llm/adapters-updated').length === 0
  })
  await dcheck('I4 emit 面零接触守卫（抛错注入也不可达）→ 零记录 + 零目录刷新告警 + 种子照常生效（旧实现 emit→记录+warn 必败 RED）', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent({ id: 'sess-i4' })
    const ctx = makeCtx({ defaults, apiProxy })
    // 注入「记录 + 抛错」emit：无论复活实现是否自带 try/catch 吞错，只要
    // 触碰 emit 面就会留下记录（判别面比单纯的恰一次断言更强）。
    ctx.emit = (event, ...args) => { ctx.emitted.push({ event, args }); throw new Error('injected emit failure') }
    let rejected = null
    try { await fireCreated(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent) } catch (error) { rejected = error }
    return rejected === null && apiProxy.calls.length === 1
      && agent.options.provider === MAIN_MODEL.provider && agent.options.model === MAIN_MODEL.model
      && ctx.emitted.length === 0
      && !ctx.logger.warnCalls.some((line) => line.includes('adapters-updated') || line.includes('directory refresh'))
  })
  await dcheck('I5 边界：subagent 纯 options 修正（零显示层面变化）→ 零 emit（信号不越出主会话种子路径——原负向语义保留）', async () => {
    const apiProxy = makeApiProxy({ defaults: makeDefaults() })
    const agent = makeAgent({ id: 'child-i5', header: subHeader(), options: { ...NATIVE }, requestHeader: () => null })
    const ctx = makeCtx({ apiProxy, agents: { get: () => ({ options: { ...NATIVE } }) } })
    await fireCreated(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL, subagent: SUB_MODEL }) }), agent)
    return agent.options.provider === SUB_MODEL.provider && agent.options.model === SUB_MODEL.model
      && apiProxy.calls.length === 0 && ctx.emitted.length === 0
  })
}

// ── J. FIX-025 判别：会话空白判据与宿主 sessionBlank 同构（无 turn/start 即播种）──
{
  // 缺陷事实链（EV-130 实测）：宿主空白判据 = `!session.events.some(e =>
  // e.type === 'turn/start')`（dsh-host-apiproxy L1187-1189）——标题/目标/
  // 命令/plan-mode 等**独立事件不开启 turn**，老无消息会话（哪怕数天前创建、
  // 含若干独立事件）宿主仍判空白、允许切换预设（a53ec5a2 日志：5× preset
  // 事件 + 0 turn/start + 0 request/header，终局判别即时生效——机制链路通、
  // 纯判据缺口）。旧插件判据（requestHeader 存在即跳过）与之不同构：老会话
  // 存陈旧 request/header 时宿主允许切、插件跳过播种 → 切换不跟随。
  // 判别点选取（旧实现必败形态）：events 含独立事件 + requestHeader 真值
  // （宿主只看 turn/start 判空白可切；旧实现 requestHeader 真值 return）——
  // J1（切换面，用户报障场景）/J2（resume 面）旧实现必败（RED），新实现
  // 同构判据无 turn/start → 播种（GREEN）。
  await dcheck('J1 老无消息会话（独立事件无 turn/start + 陈旧 requestHeader）切换预设 → 播种执行（旧实现 requestHeader 判据必败 RED）', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent({
      id: 'sess-j1',
      header: { origin: 'main' },
      requestHeader: () => ({ config: { provider: 'anthropic', model: 'stale-header' } }), // 老会话陈旧 header（宿主不据此判非空白）
      events: [{ type: 'agent-preset/selected' }, { type: 'session/title' }, { type: 'session/plan-mode' }], // 独立事件：不开启 turn
    })
    const ctx = makeCtx({ defaults, apiProxy, agents: { get: (id) => (id === 'sess-j1' ? agent : undefined) } })
    await firePresetSelected(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), 'sess-j1', PRESET_ID)
    return apiProxy.calls.length === 1 && apiProxy.calls[0].payload.provider === MAIN_MODEL.provider
      && agent.options.provider === MAIN_MODEL.provider
      && defaults.state.current.provider === NATIVE.provider // 写回恢复完成
  })
  await dcheck('J2 同形态老会话 resume（agent/created 面）→ 播种执行（旧实现必败 RED）', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent({
      id: 'sess-j2',
      requestHeader: () => ({ config: { provider: 'anthropic', model: 'stale-header' } }),
      events: [{ type: 'session/title' }],
    })
    await fireCreated(makeCtx({ defaults, apiProxy }), makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    return apiProxy.calls.length === 1 && agent.options.provider === MAIN_MODEL.provider
  })
  // 回落链（events 不可读 = 形态防御）：Session 恒带 events（宿主实证），
  // 读不到视为形态漂移——回落 requestHeader 反演，保守方向宁漏播（空白会话
  // 少一次播种）不误播（已产出会话被插件接管 = 击穿宿主锁定语义）。
  await dcheck('J3 回落守卫：session 无 events 属性 + requestHeader 真值 → 不播种（防御回落，宁漏播不误播）', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent({ events: undefined, requestHeader: () => ({ config: { provider: 'anthropic', model: 'user-picked' } }) }) // events 显式移除
    await fireCreated(makeCtx({ defaults, apiProxy }), makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    return apiProxy.calls.length === 0 && defaults.state.saveCalls.length === 0
      && agent.options.provider === NATIVE.provider
  })
  await dcheck('J4 回落守卫（切换面）：无 events 属性 + requestHeader 真值 → 不播种', async () => {
    const apiProxy = makeApiProxy({ defaults: makeDefaults() })
    const agent = mainBlankAgent({ events: undefined, requestHeader: () => ({ config: { provider: 'anthropic', model: 'user-picked' } }) })
    const ctx = makeCtx({ apiProxy, agents: { get: () => agent } })
    await firePresetSelected(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), 'sess-y', PRESET_ID)
    return apiProxy.calls.length === 0
  })
  // 事件元素防御：同构判据的 some 谓词带真值守卫（e && e.type === …）——
  // events 含 null/非对象元素不炸，按「无 turn/start」处理。
  await dcheck('J5 events 含 null/非对象元素 → 不炸，同构判据按无 turn/start 处理 → 播种', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent({ id: 'sess-j5', events: [null, 'garbage', { noType: true }] })
    await fireCreated(makeCtx({ defaults, apiProxy }), makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    return apiProxy.calls.length === 1 && agent.options.provider === MAIN_MODEL.provider
  })
}

// ── K. FIX-030 判别：新宿主 0.1.2-rc.1 双适配 + 诊断面 ──────────────────
// 报障（用户 2026-09-05，v0.4.4 发布后）：
//   ① 调整/切换预设后模型不跟随（回归）——根因：新宿主无 apiProxy 服务
//      （全包 grep 零注册）→ 旧预检 ctx.get('apiProxy') 恒 undefined →
//      播种全量静默跳过（仅宿主终端 warn）；
//   ② subagent 模型配置未生效（LLM 侧统计实证）——根因：新宿主
//      parentAgentOptionsForDelegation（dsh-subagent L603-612）把子继承
//      基线从 parent.options 改为「父最近请求头路由」→ 旧判别
//      （child ≠ parent.options = 显式）把普通继承误判 → fixup 全量跳过；
//   ③ 预设/subagent 配置生效缺观测——修复 = 诊断环形注册表（applied/skip
//      原因/target/preset/session）+ router/presetDiagnostics RPC。
{
  const subBlankAgent = ({ id = 'child-1', header, options, parentHeader, parentOptions } = {}) => ({
    options,
    session: { id, header, requestHeader: parentHeader ? () => ({ config: parentHeader }) : undefined },
    ...(parentOptions !== undefined ? {} : {}),
  })
  const makeParent = ({ header, options } = {}) => ({ options, session: { header, requestHeader: header ? () => ({ config: header }) : undefined } })

  // K1 核心判别（报障①）：新宿主形态（仅 sessionController，无 apiProxy）→
  // 播种执行（selectModel 直接参数被调用 + options 突变 + 全局恢复）。
  // 旧实现（预检只认 apiProxy）必败：face unavailable → 零动作。
  await dcheck('K1 新宿主 sessionController 面 → 播种执行（旧实现 apiProxy 预检必败）', async () => {
    const defaults = makeDefaults()
    const controller = makeSessionController({ defaults })
    const agent = mainBlankAgent({ id: 'sess-k1' })
    await fireCreated(makeCtx({ defaults, sessionController: controller }), makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    return controller.calls.length === 1
      && controller.calls[0].provider === MAIN_MODEL.provider && controller.calls[0].model === MAIN_MODEL.model
      && controller.calls[0].sessionId === 'sess-k1'
      && agent.options.provider === MAIN_MODEL.provider
      && defaults.state.current.provider === NATIVE.provider // 全局默认已恢复
  })

  // K2 新宿主 selectModel 抛 RemoteError（model-unavailable）→ 回滚 ① +
  // warn + 诊断 select-rejected（不炸 handler）。
  await dcheck('K2 新宿主面拒绝（抛错形态）→ 回滚 + warn + 诊断 select-rejected', async () => {
    const defaults = makeDefaults()
    const controller = makeSessionController({ defaults, unavailable: () => true })
    const agent = mainBlankAgent({ id: 'sess-k2' })
    const ctx = makeCtx({ defaults, sessionController: controller })
    await fireCreated(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    const diag = presetDiagnostics().entries.filter((entry) => entry.session === 'sess-k2')
    return agent.options.provider === NATIVE.provider
      && ctx.logger.warnCalls.some((line) => line.includes('session/model-unavailable') || line.includes('model "gpt-5.6-sol" unavailable'))
      && diag.some((entry) => entry.skip === 'select-rejected')
  })

  // K3 核心判别（报障②）：新宿主子继承基线——父有请求头路由（≠ parent.
  // options），child.options = 父头路由 → 旧判别误跳；新判别（基线一致 =
  // 普通继承）→ fixup 到配置的 subagent 模型。
  await dcheck('K3 子继承 = 父最近请求头路由（≠ parent.options）→ fixup 执行（旧判别必败）', async () => {
    const presets = presetConfig({ main: MAIN_MODEL, subagent: SUB_MODEL })
    const parentHeaderRoute = { provider: 'glm-local-router', model: 'glm-5.3' }
    const parent = makeParent({ options: { ...NATIVE }, header: parentHeaderRoute })
    const child = subBlankAgent({
      id: 'child-k3',
      header: { origin: 'subagent', agentPreset: PRESET_ID, parentSession: 'parent-k3' },
      options: { ...parentHeaderRoute }, // 新宿主：子继承父头路由（≠ parent.options）
    })
    const ctx = makeCtx({ agents: { get: (id) => (id === 'parent-k3' ? parent : undefined) } })
    await fireCreated(ctx, makeService({ governance: presets }), child)
    return child.options.provider === SUB_MODEL.provider && child.options.model === SUB_MODEL.model
  })

  // K4 显式覆盖仍尊重：child.options ≠ 继承基线（请求方显式 agentOptions）→
  // 不碰（主权保持）+ 诊断 explicit-override。
  await dcheck('K4 child 显式覆盖（≠ 继承基线）→ 尊重不碰 + 诊断 explicit-override', async () => {
    const presets = presetConfig({ main: MAIN_MODEL, subagent: SUB_MODEL })
    const parent = makeParent({ options: { ...NATIVE }, header: { provider: 'glm-local-router', model: 'glm-5.3' } })
    const child = subBlankAgent({
      id: 'child-k4',
      header: { origin: 'subagent', agentPreset: PRESET_ID, parentSession: 'parent-k4' },
      options: { provider: 'openai-codex', model: 'gpt-5.6-terra' }, // 显式指定 ≠ 基线
    })
    const ctx = makeCtx({ agents: { get: (id) => (id === 'parent-k4' ? parent : undefined) } })
    await fireCreated(ctx, makeService({ governance: presets }), child)
    const diag = presetDiagnostics().entries.filter((entry) => entry.session === 'child-k4')
    return child.options.provider === 'openai-codex'
      && diag.some((entry) => entry.skip === 'explicit-override')
  })

  // K5 旧宿主兼容：父无请求头 → 基线回落 parent.options；child = parent
  // options 副本 → 普通继承 → fixup（回归守卫，非判别）。
  await dcheck('K5 父无请求头 → 基线回落 parent.options → 普通继承 fixup 保持', async () => {
    const presets = presetConfig({ main: MAIN_MODEL, subagent: SUB_MODEL })
    const parent = makeParent({ options: { ...NATIVE } })
    const child = subBlankAgent({
      id: 'child-k5',
      header: { origin: 'subagent', agentPreset: PRESET_ID, parentSession: 'parent-k5' },
      options: { ...NATIVE },
    })
    const ctx = makeCtx({ agents: { get: (id) => (id === 'parent-k5' ? parent : undefined) } })
    await fireCreated(ctx, makeService({ governance: presets }), child)
    return child.options.provider === SUB_MODEL.provider
  })

  // K6（报障③）诊断面：播种成功入表（applied + target + kind=seed-main），
  // presetDiagnostics() 返回拷贝且条目有界字段形状。
  await dcheck('K6 诊断注册表：播种成功 applied 条目（kind/target/preset/session）', async () => {
    const defaults = makeDefaults()
    const controller = makeSessionController({ defaults })
    const agent = mainBlankAgent({ id: 'sess-k6' })
    const before = presetDiagnostics().entries.length
    await fireCreated(makeCtx({ defaults, sessionController: controller }), makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    const entries = presetDiagnostics().entries
    const hit = entries.find((entry) => entry.session === 'sess-k6' && entry.kind === 'seed-main' && entry.applied === true)
    return !!hit && hit.target?.provider === MAIN_MODEL.provider && hit.preset === PRESET_ID
      && entries.length === before + 1
  })

  // K7（报障③）skip 观测：未配置预设的切换（重置回全局默认路径前）+
  // produced 跳过 + face 缺失——三类 skip 都入表（原因短码可判读）。
  await dcheck('K7 诊断 skip 短码：produced / face-unavailable 入表', async () => {
    const defaults = makeDefaults()
    // produced：已开 turn 的主会话 agent/created → skip=produced。
    const produced = mainBlankAgent({ id: 'sess-k7a', events: [{ type: 'turn/start' }] })
    const ctxA = makeCtx({ defaults })
    await fireCreated(ctxA, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), produced)
    const producedHit = presetDiagnostics().entries.find((entry) => entry.session === 'sess-k7a' && entry.skip === 'produced')
    // face-unavailable：双面全缺。
    const agent = mainBlankAgent({ id: 'sess-k7b' })
    const ctxB = makeCtx({ defaults })
    await fireCreated(ctxB, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent)
    const faceHit = presetDiagnostics().entries.find((entry) => entry.session === 'sess-k7b' && entry.skip === 'face-unavailable')
    return !!producedHit && !!faceHit
  })
}

// ── L. EVO-017 判别：预设作用域请求遥测（installRequestTelemetry）──────────
// 用户统计分级需求（2026-09-05）授权的观测豁免：agent/request 只读旁路——
// 不改 config（主权）、按 header.agentPreset + origin 归属记 scope 统计、
// 异常零影响请求链。判别：旧实现（无本函数）导出缺失 → RED；新实现全绿。
{
  let installRequestTelemetry = null
  try {
    ;({ installRequestTelemetry } = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'preset-defaults.js')).href))
  } catch { /* RED：导出缺失 */ }
  const scopeAgent = ({ preset, origin, id }) => ({
    options: { ...NATIVE },
    session: { id, header: { origin: origin === 'subagent' ? 'subagent' : 'main', agentPreset: preset } },
  })

  // L1 核心判别：主会话请求 → scope 记录（preset/origin=main/provider/model）。
  await dcheck('L1 主会话请求 → recordScope（preset + origin=main + 路由）', async () => {
    if (typeof installRequestTelemetry !== 'function') return false
    const scopes = []
    const service = { isEnabled: () => true, stats: { recordScope: (event) => scopes.push(event) } }
    const ctx = makeCtx({})
    installRequestTelemetry(ctx, service)
    const handler = (ctx.listeners['agent/request'] ?? [])[0]
    if (typeof handler !== 'function') return false
    const out = await handler({ agent: scopeAgent({ preset: 'novel-writing', origin: 'main', id: 's-l1' }) }, async () => ({ provider: 'glm-local-router', model: 'glm-5.3' }))
    return scopes.length === 1 && scopes[0].preset === 'novel-writing' && scopes[0].origin === 'main'
      && scopes[0].provider === 'glm-local-router' && scopes[0].model === 'glm-5.3'
      && out.provider === 'glm-local-router' // config 原样透传（主权）
  })

  // L2：subagent 请求 → origin=subagent。
  await dcheck('L2 subagent 请求 → recordScope origin=subagent', async () => {
    if (typeof installRequestTelemetry !== 'function') return false
    const scopes = []
    const service = { isEnabled: () => true, stats: { recordScope: (event) => scopes.push(event) } }
    const ctx = makeCtx({})
    installRequestTelemetry(ctx, service)
    const handler = (ctx.listeners['agent/request'] ?? [])[0]
    await handler({ agent: scopeAgent({ preset: 'novel-writing', origin: 'subagent', id: 's-l2' }) }, async () => ({ provider: 'gateway', model: 'qwen3.8-flash' }))
    return scopes.length === 1 && scopes[0].origin === 'subagent' && scopes[0].model === 'qwen3.8-flash'
  })

  // L3 主权判别：next() 的 config 原样返回（旁路零修改——即使 recordScope 后）。
  await dcheck('L3 config 原样透传（只读旁路——含 effort/maxTokens 等字段）', async () => {
    if (typeof installRequestTelemetry !== 'function') return false
    const service = { isEnabled: () => true, stats: { recordScope: () => undefined } }
    const ctx = makeCtx({})
    installRequestTelemetry(ctx, service)
    const handler = (ctx.listeners['agent/request'] ?? [])[0]
    const config = { provider: 'p', model: 'm', reasoningEffort: 'high', maxTokens: 4096 }
    const out = await handler({ agent: scopeAgent({ preset: 'g', origin: 'main', id: 's-l3' }) }, async () => config)
    return out === config && out.reasoningEffort === 'high'
  })

  // L4 fail-safe：next() 拒绝 → 原样上抛（不吞）+ 零 scope 记录。
  await dcheck('L4 next() 拒绝 → 异常上抛 + 零记录（请求链零影响）', async () => {
    if (typeof installRequestTelemetry !== 'function') return false
    const scopes = []
    const service = { isEnabled: () => true, stats: { recordScope: (event) => scopes.push(event) } }
    const ctx = makeCtx({})
    installRequestTelemetry(ctx, service)
    const handler = (ctx.listeners['agent/request'] ?? [])[0]
    let thrown = null
    try { await handler({ agent: scopeAgent({ preset: 'g', origin: 'main', id: 's-l4' }) }, async () => { throw new Error('upstream reject') }) } catch (error) { thrown = error }
    return thrown !== null && thrown.message === 'upstream reject' && scopes.length === 0
  })

  // L5 边界：无 preset header 且罗盘不可解析 → 零记录（不猜归属）；无
  // header agent → 零记录不炸。
  await dcheck('L5 无预设归属 → 零记录（不猜）+ 无 header 不炸', async () => {
    if (typeof installRequestTelemetry !== 'function') return false
    const scopes = []
    const service = { isEnabled: () => true, stats: { recordScope: (event) => scopes.push(event) } }
    const ctx = makeCtx({})
    installRequestTelemetry(ctx, service)
    const handler = (ctx.listeners['agent/request'] ?? [])[0]
    await handler({ agent: scopeAgent({ preset: '', origin: 'main', id: 's-l5a' }) }, async () => ({ provider: 'p', model: 'm' }))
    await handler({}, async () => ({ provider: 'p', model: 'm' }))
    return scopes.length === 0
  })

  // L6 总开关关闭 → 零记录（热关闭语义）。
  await dcheck('L6 enabled=false → 零记录（热关闭）', async () => {
    if (typeof installRequestTelemetry !== 'function') return false
    const scopes = []
    const service = { isEnabled: () => false, stats: { recordScope: (event) => scopes.push(event) } }
    const ctx = makeCtx({})
    installRequestTelemetry(ctx, service)
    const handler = (ctx.listeners['agent/request'] ?? [])[0]
    await handler({ agent: scopeAgent({ preset: 'g', origin: 'main', id: 's-l6' }) }, async () => ({ provider: 'p', model: 'm' }))
    return scopes.length === 0
  })

  // L7 recordScope 抛错 → config 仍透传（观测失败零影响请求链）。
  await dcheck('L7 recordScope 抛错 → 请求链零影响（config 透传）', async () => {
    if (typeof installRequestTelemetry !== 'function') return false
    const service = { isEnabled: () => true, stats: { recordScope: () => { throw new Error('stats boom') } } }
    const ctx = makeCtx({})
    installRequestTelemetry(ctx, service)
    const handler = (ctx.listeners['agent/request'] ?? [])[0]
    const out = await handler({ agent: scopeAgent({ preset: 'g', origin: 'main', id: 's-l7' }) }, async () => ({ provider: 'p', model: 'm' }))
    return out.provider === 'p'
  })

  // L8 D1 精神守卫：播种模块（installPresetDefaults）仍不注册 agent/request
  //（遥测豁免只在独立函数——EVO-014 原则 2 结构边界保持）。
  await dcheck('L8 播种模块零 agent/request（遥测豁免隔离在独立函数）', async () => {
    const ctx = makeCtx({})
    setup(ctx, makeService({}))
    return !(ctx.listeners['agent/request'] ?? []).some((entry) => true)
  })

  // L9 归属错乱修正判别（用户实证 2026-09-06：标准模式会话主会话调用被误归
  // 旧预设 governance，subagent 正确归 standard）：根因 = header.agentPreset
  // 是创建时冻结快照（切换预设只 append 会话事件不更新 header）；修复 =
  // 罗盘 live 解析（composedPreset(agent.ctx)——当前生效预设）优先，header
  // 仅兜底。判别：header=旧预设 + live=新预设 → 归新预设（旧实现必败）。
  await dcheck('L9 归属修正：live 预设优先于 header 冻结快照（旧实现必败）', async () => {
    if (typeof installRequestTelemetry !== 'function') return false
    const scopes = []
    const service = { isEnabled: () => true, stats: { recordScope: (event) => scopes.push(event) } }
    const ctx = makeCtx({ agentPresets: { composedPreset: () => 'standard' } })
    installRequestTelemetry(ctx, service)
    const handler = (ctx.listeners['agent/request'] ?? [])[0]
    await handler({ agent: scopeAgent({ preset: 'governance', origin: 'main', id: 's-l9' }) }, async () => ({ provider: 'opencode-go-local', model: 'omen-alpha' }))
    return scopes.length === 1 && scopes[0].preset === 'standard'
  })

  // L10 罗盘不可用回落 header（旧宿主/服务缺失形态——双向兼容）。
  await dcheck('L10 罗盘不可用 → header 兜底归属保持', async () => {
    if (typeof installRequestTelemetry !== 'function') return false
    const scopes = []
    const service = { isEnabled: () => true, stats: { recordScope: (event) => scopes.push(event) } }
    const ctx = makeCtx({})
    installRequestTelemetry(ctx, service)
    const handler = (ctx.listeners['agent/request'] ?? [])[0]
    await handler({ agent: scopeAgent({ preset: 'novel-writing', origin: 'main', id: 's-l10' }) }, async () => ({ provider: 'p', model: 'm' }))
    return scopes.length === 1 && scopes[0].preset === 'novel-writing'
  })

  // L11 罗盘解析抛错 → header 兜底（fail-safe 双保险）。
  await dcheck('L11 罗盘抛错 → header 兜底 + 请求链零影响', async () => {
    if (typeof installRequestTelemetry !== 'function') return false
    const scopes = []
    const service = { isEnabled: () => true, stats: { recordScope: (event) => scopes.push(event) } }
    const ctx = makeCtx({ agentPresets: { composedPreset: () => { throw new Error('compass boom') } } })
    installRequestTelemetry(ctx, service)
    const handler = (ctx.listeners['agent/request'] ?? [])[0]
    const out = await handler({ agent: scopeAgent({ preset: 'governance', origin: 'main', id: 's-l11' }) }, async () => ({ provider: 'p', model: 'm' }))
    return scopes.length === 1 && scopes[0].preset === 'governance' && out.provider === 'p'
  })
}

console.log(failures === 0 ? '\nALL EVO-014 DISCRIMINANT TESTS PASSED' : `\n${failures} EVO-014 ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
