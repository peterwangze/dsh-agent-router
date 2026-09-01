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
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

let failures = 0
function check(label, condition) {
  if (condition) console.log(`  ok  ${label}`)
  else { failures++; console.error(`FAIL  ${label}`) }
}

// EVO-014 目标模块（动态导入：实现缺失时 RED 仍可计数——逐条 FAIL 结算）。
let installPresetDefaults = null
let importFailure = null
try {
  ;({ installPresetDefaults } = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'preset-defaults.js')).href))
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

/** 伪宿主 ctx：事件注册捕获 + apiProxy/agentDefaultModel/agentPresets 服务 + agents 注册表。 */
function makeCtx({ defaults, apiProxy, agents, agentPresets } = {}) {
  const listeners = {}
  const logger = {
    infoCalls: [], warnCalls: [],
    info(message) { this.infoCalls.push(String(message)) },
    warn(message) { this.warnCalls.push(String(message)) },
  }
  const ctx = {
    listeners,
    logger,
    on(event, handler) {
      ;(listeners[event] ??= []).push(handler)
      return () => { listeners[event] = (listeners[event] ?? []).filter((entry) => entry !== handler) }
    },
    get(key) {
      if (key === 'agentDefaultModel') return defaults
      if (key === 'apiProxy') return apiProxy
      if (key === 'agentPresets') return agentPresets
      return undefined
    },
  }
  if (agents) ctx.agents = agents
  return ctx
}

/** 伪 RouterService（installPresetDefaults 消费面：isEnabled/presetDefaults 热读取）。 */
function makeService(presets, enabled = true) {
  return {
    isEnabled: () => enabled,
    presetDefaults: () => presets,
  }
}

/** 伪 agent：session.id/header（宿主 dsh-agent 会话头快照）+ requestHeader（日志持久层）。 */
function makeAgent({ id = 'sess-1', header, options, requestHeader, agentCtx } = {}) {
  const agent = {
    options,
    session: {
      id,
      ...(header ? { header } : {}),
      ...(requestHeader !== undefined ? { requestHeader } : {}),
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
  // A6 非空白（恢复的已产出会话）→ 零动作。
  await dcheck('A6 会话已有 requestHeader → 零动作（已产出会话不受配置影响）', async () => {
    const defaults = makeDefaults()
    const apiProxy = makeApiProxy({ defaults })
    const agent = mainBlankAgent({ requestHeader: () => ({ config: { provider: 'anthropic', model: 'user-picked' } }) })
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
  await dcheck('C3 防御：非空白会话收到事件 → 零动作', async () => {
    const apiProxy = makeApiProxy({ defaults: makeDefaults() })
    const agent = mainBlankAgent({ requestHeader: () => ({ config: { provider: 'anthropic', model: 'user-picked' } }) })
    const ctx = makeCtx({ apiProxy, agents: { get: () => agent } })
    await firePresetSelected(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), 'sess-x', PRESET_ID)
    return apiProxy.calls.length === 0
  })
  await dcheck('C4 防御：会话不在 agents 注册表 → 零动作不炸', async () => {
    const apiProxy = makeApiProxy({ defaults: makeDefaults() })
    const ctx = makeCtx({ apiProxy, agents: { get: () => undefined } })
    let rejected = null
    try { await firePresetSelected(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), 'ghost', PRESET_ID) } catch (error) { rejected = error }
    return rejected === null && apiProxy.calls.length === 0
  })
}

// ── D. 主权结构 / fail-safe / 开关 / 热更新 / 观测 ───────────────────────
{
  await dcheck('D1 主权结构断言：模块只注册 agent/created + agent-preset/selected 两个监听，无 agent/request（回归守卫）', () => {
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
  await dcheck('D5 apiProxy 服务缺失 → warn 可观测降级（零动作）+ handler 正常返回（agent 创建不受影响）', async () => {
    const agent = mainBlankAgent()
    const ctx = makeCtx({ defaults: makeDefaults() }) // 无 apiProxy 面
    let rejected = null
    try { await fireCreated(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent) } catch (error) { rejected = error }
    return rejected === null
      && agent.options.provider === NATIVE.provider && agent.options.model === NATIVE.model
      && ctx.logger.warnCalls.some((line) => line.includes('apiProxy') || line.includes('selectModel'))
  })
  await dcheck('D6 sessions.selectModel 非函数（面形态漂移）→ 同 D5 降级不炸', async () => {
    const agent = mainBlankAgent()
    const ctx = makeCtx({ apiProxy: { sessions: {} }, defaults: makeDefaults() })
    let rejected = null
    try { await fireCreated(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), agent) } catch (error) { rejected = error }
    return rejected === null && ctx.logger.warnCalls.some((line) => line.includes('selectModel') || line.includes('preset default'))
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

console.log(failures === 0 ? '\nALL EVO-014 DISCRIMINANT TESTS PASSED' : `\n${failures} EVO-014 ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
