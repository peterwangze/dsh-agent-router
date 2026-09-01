// EVO-013 判别测试：预设 Agent 默认模型（agent/request 全局层瀑布监听 + 三层选择权主权保护）。
//
// 用户需求（2026-09-01）：不同 DSH 预设的新会话默认落在不同模型上。宿主契约
// （Coordinator 侦察，execution-packets EVO-013 facts）：
//   - 会话模型选择三层 = picked（进程内，插件不可读）→ session.requestHeader().config
//     （日志持久层）→ agentDefaultModel.currentSelection()（全局默认）；
//   - agent/request 瀑布载荷 { agent, turn, step, signal }，返回值 = proposedConfig；
//     插件宿主行（全局层）注册的监听器对所有预设的全部 agent 会话可见；
//   - 子代理继承 parent.options 创建快照 + request.agentOptions 显式覆盖优先；
//     子会话 header 含 origin='subagent'/agentPreset/parentSession；
//   - 插件 agent 类专业 agent（runAgentDelegation）经 agentOptions:{provider,model}
//     显式指定模型——预设规则 MUST NOT 覆盖它（EVO fact 5）；
//   - dsh-host-apiproxy selectModel 会写全局默认——插件不得走该通路。
//
// 判别断言（实现缺失 → 全部 FAIL，RED；实现后全绿）：
//   P1  未配置预设 → handler 直通（provider/model 原样）
//   P2  配置 main → 新会话首请求换入预设模型（reasoningEffort 不动 + 首次 info 观测）
//   P3  会话已有 requestHeader → 不覆盖（主权：日志 header 层优先）
//   P4  resolved ≠ 全局默认（模拟 picked 生效）→ 不覆盖（主权）
//   P5  条目 enabled=false / 总开关 enabled=false → 直通
//   P6  subagent 未配 subagent 模型 → 继承 main；配了 → 用 subagent
//   P7  subagent 显式指定（child.options ≠ parent.options）→ 不覆盖（EVO fact 5 保护）
//   P8  agentPresets 服务缺失 → header.agentPreset 兜底仍生效
//   P9  handler 内部异常 → fail-safe 返回 resolved + warn 可观测
//   P10 settings 热更新（presets 字典变化）→ 下次请求读取新值
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

let failures = 0
function check(label, condition) {
  if (condition) console.log(`  ok  ${label}`)
  else { failures++; console.error(`FAIL  ${label}`) }
}

// EVO-013 目标模块（动态导入：实现缺失时 RED 仍可计数——每条断言按 FAIL 结算，
// 与 fix-012「钩子缺失 exit 1」同型，但保留逐条 RED 数量证据）。
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

/** 伪宿主 ctx：事件注册捕获 + agentDefaultModel live 默认 + 可选 agents/agentPresets。 */
function makeCtx({ live = { ...NATIVE }, agents, agentPresets, logger } = {}) {
  const listeners = {}
  const log = logger ?? {
    infoCalls: [], warnCalls: [],
    info(message) { this.infoCalls.push(String(message)) },
    warn(message) { this.warnCalls.push(String(message)) },
  }
  const ctx = {
    listeners,
    logger: log,
    on(event, handler) {
      ;(listeners[event] ??= []).push(handler)
      return () => { listeners[event] = (listeners[event] ?? []).filter((entry) => entry !== handler) }
    },
    get(key) { return key === 'agentDefaultModel' ? { currentSelection: () => live } : undefined },
  }
  if (agents) ctx.agents = agents
  if (agentPresets) ctx.agentPresets = agentPresets
  return ctx
}

/** 伪 RouterService：与 installPresetDefaults 消费面同构（isEnabled/presetDefaults 热读取）。 */
function makeService(presets, enabled = true) {
  return {
    isEnabled: () => enabled,
    presetDefaults: () => presets,
  }
}

/** 伪 agent：session.header（宿主 dsh-agent 会话头快照）+ requestHeader（日志持久层）。 */
function makeAgent({ header, options, requestHeader, agentCtx, sessionId } = {}) {
  const agent = {
    options,
    session: {
      ...(header ? { header } : {}),
      ...(requestHeader !== undefined ? { requestHeader } : {}),
    },
  }
  if (agentCtx !== undefined) agent.ctx = agentCtx
  if (sessionId !== undefined) agent.sessionId = sessionId
  return agent
}

/** 驱动一次 agent/request 瀑布：安装监听器（每 ctx 一次——对齐宿主行为：
 *  插件宿主行在生命周期内只安装一份监听器，会话级去重才跨请求生效）。 */
const installed = new WeakMap()
async function drive(ctx, service, { agent, proposed = { ...NATIVE, reasoningEffort: '' } } = {}) {
  if (!installed.has(ctx)) installed.set(ctx, installPresetDefaults(ctx, service))
  const handler = (ctx.listeners['agent/request'] ?? [])[0]
  if (typeof handler !== 'function') throw new Error('agent/request 监听器未注册')
  return handler({ agent, turn: 0, step: 0, signal: undefined }, async () => ({ ...proposed }))
}

const presetConfig = (patch = {}) => ({
  enabled: true,
  main: { provider: '', model: '', ...(patch.main ?? {}) },
  subagent: { provider: '', model: '', ...(patch.subagent ?? {}) },
  ...patch.extra,
})

console.log('EVO-013 preset default model (RED until lib/preset-defaults.js exists):')
{
  // P1 未配置预设 → 直通。
  await dcheck('P1a 未配置预设（presets={}）→ provider/model 原样', async () => {
    const out = await drive(makeCtx(), makeService({}), { agent: makeAgent({ header: { origin: 'main', agentPreset: PRESET_ID } }) })
    return out.provider === NATIVE.provider && out.model === NATIVE.model
  })
  await dcheck('P1b 配置残留但会话预设未知（presets 无该键）→ 直通', async () => {
    const out = await drive(makeCtx({ agentPresets: { composedPreset: () => 'ghost-preset' } }), makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), { agent: makeAgent({}) })
    return out.provider === NATIVE.provider && out.model === NATIVE.model
  })
  await dcheck('P1c agent 无 session → 直通（防御）', async () => {
    const out = await drive(makeCtx(), makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), { agent: {} })
    return out.provider === NATIVE.provider && out.model === NATIVE.model
  })
}

{
  // P2 main 换入（composedPreset 解析预设 + 新会话 + resolved=全局默认）。
  const ctx = makeCtx({ agentPresets: { composedPreset: () => PRESET_ID, list: async () => [] } })
  const service = makeService({ governance: presetConfig({ main: MAIN_MODEL }) })
  const agent = makeAgent({ header: { origin: 'main', cwd: '/w' }, agentCtx: {}, sessionId: 'sess-main' })
  await dcheck('P2a 新会话首请求换入预设主模型', async () => {
    const out = await drive(ctx, service, { agent })
    return out.provider === MAIN_MODEL.provider && out.model === MAIN_MODEL.model
  })
  await dcheck('P2b reasoningEffort 不动（适配器默认语义）', async () => {
    const out = await drive(ctx, service, { agent, proposed: { ...NATIVE, reasoningEffort: 'high' } })
    return out.provider === MAIN_MODEL.provider && out.reasoningEffort === 'high'
  })
  await dcheck('P2c 首次换入打 info 观测（含 preset/provider/model），同会话去重不刷屏', async () => {
    const freshCtx = makeCtx({ agentPresets: { composedPreset: () => PRESET_ID }, logger: { infoCalls: [], warnCalls: [], info(m) { this.infoCalls.push(String(m)) }, warn(m) { this.warnCalls.push(String(m)) } } })
    const sessionAgent = makeAgent({ header: { origin: 'main' }, sessionId: 'sess-obs' })
    await drive(freshCtx, service, { agent: sessionAgent })
    await drive(freshCtx, service, { agent: sessionAgent })
    const infos = freshCtx.logger.infoCalls
    return infos.length === 1 && infos[0].includes(PRESET_ID) && infos[0].includes(MAIN_MODEL.provider) && infos[0].includes(MAIN_MODEL.model) && freshCtx.logger.warnCalls.length === 0
  })
}

{
  // P3 主权：日志 header 层优先。
  await dcheck('P3 会话已有 requestHeader → 不覆盖（已运行会话不受配置影响）', async () => {
    const ctx = makeCtx({ agentPresets: { composedPreset: () => PRESET_ID } })
    const agent = makeAgent({ header: { origin: 'main', agentPreset: PRESET_ID }, requestHeader: () => ({ config: { provider: 'openai', model: 'user-picked' } }) })
    const out = await drive(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), { agent })
    // 主权 = 预设模型不换入（resolved 原样 = 宿主按 header 层给出的选择）。
    return out.provider === NATIVE.provider && out.model === NATIVE.model
  })
  // P4 主权：picked 层不可读，但 resolved ≠ 全局默认 ⇒ 有更显式选择 ⇒ 尊重。
  await dcheck('P4 resolved ≠ 全局默认 → 不覆盖（picked/显式层尊重）', async () => {
    const ctx = makeCtx({ live: { ...NATIVE }, agentPresets: { composedPreset: () => PRESET_ID } })
    const agent = makeAgent({ header: { origin: 'main' }, requestHeader: () => null })
    const out = await drive(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), { agent, proposed: { provider: 'anthropic', model: 'claude-x', reasoningEffort: '' } })
    return out.provider === 'anthropic' && out.model === 'claude-x'
  })
  // P4b/P4c（R0 F-2，P2）：主权条件③ fail-closed——live 全局默认不可读（服务
  // 缺失/空值）= 无法证明「当前是默认层」⇒ 不换入（宁可不接管，不可误覆盖）。
  // 旧实现 `if (live && (...))` 在 live=null 时跳过校验直接换入（fail-open）
  // → 本组断言必败（RED）；fail-closed 修复后直通（GREEN）。
  await dcheck('P4b live 默认服务缺失 → 不换入（fail-closed，R0 F-2）', async () => {
    const ctx = makeCtx({ agentPresets: { composedPreset: () => PRESET_ID } })
    ctx.get = () => undefined // agentDefaultModel 服务整体缺失
    const agent = makeAgent({ header: { origin: 'main' }, requestHeader: () => null })
    const out = await drive(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), { agent })
    return out.provider === NATIVE.provider && out.model === NATIVE.model
  })
  await dcheck('P4c live 默认返回空值 → 不换入（fail-closed 同判，R0 F-2）', async () => {
    const ctx = makeCtx({ live: null, agentPresets: { composedPreset: () => PRESET_ID } })
    const agent = makeAgent({ header: { origin: 'main' }, requestHeader: () => null })
    const out = await drive(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), { agent })
    return out.provider === NATIVE.provider && out.model === NATIVE.model
  })
}

{
  // P5 开关语义。
  await dcheck('P5a 条目 enabled=false → 直通', async () => {
    const ctx = makeCtx({ agentPresets: { composedPreset: () => PRESET_ID } })
    const agent = makeAgent({ header: { origin: 'main' }, requestHeader: () => null })
    const out = await drive(ctx, makeService({ governance: presetConfig({ extra: { enabled: false }, main: MAIN_MODEL }) }), { agent })
    return out.provider === NATIVE.provider && out.model === NATIVE.model
  })
  await dcheck('P5b 插件总开关 enabled=false → 整个机制关闭（直通）', async () => {
    const ctx = makeCtx({ agentPresets: { composedPreset: () => PRESET_ID } })
    const agent = makeAgent({ header: { origin: 'main' }, requestHeader: () => null })
    const out = await drive(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }, false), { agent })
    return out.provider === NATIVE.provider && out.model === NATIVE.model
  })
  await dcheck('P5c main 只配 provider 未配 model（未设置完成）→ 遵循 DSH 规则（直通）', async () => {
    const ctx = makeCtx({ agentPresets: { composedPreset: () => PRESET_ID } })
    const agent = makeAgent({ header: { origin: 'main' }, requestHeader: () => null })
    const out = await drive(ctx, makeService({ governance: presetConfig({ main: { provider: MAIN_MODEL.provider, model: '' } }) }), { agent })
    return out.provider === NATIVE.provider && out.model === NATIVE.model
  })
}

{
  // P6 subagent 继承语义。
  const subHeader = () => ({ origin: 'subagent', agentPreset: PRESET_ID, parentSession: 'parent-1', delegationDepth: 1 })
  await dcheck('P6a subagent 未配 subagent 模型 → 换入 main 模型（继承）', async () => {
    const ctx = makeCtx()
    const agent = makeAgent({ header: subHeader(), options: { ...NATIVE }, requestHeader: () => null })
    const out = await drive(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), { agent })
    return out.provider === MAIN_MODEL.provider && out.model === MAIN_MODEL.model
  })
  await dcheck('P6b subagent 配了 subagent 模型 → 换入 subagent 模型（覆盖继承）', async () => {
    const ctx = makeCtx()
    const agent = makeAgent({ header: subHeader(), options: { ...NATIVE }, requestHeader: () => null })
    const out = await drive(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL, subagent: SUB_MODEL }) }), { agent })
    return out.provider === SUB_MODEL.provider && out.model === SUB_MODEL.model
  })
  await dcheck('P6c subagent 且 main/subagent 都未设模型 → 直通', async () => {
    const ctx = makeCtx()
    const agent = makeAgent({ header: subHeader(), options: { ...NATIVE }, requestHeader: () => null })
    const out = await drive(ctx, makeService({ governance: presetConfig() }), { agent })
    return out.provider === NATIVE.provider && out.model === NATIVE.model
  })
}

{
  // P7 显式覆盖保护（EVO fact 5：插件 agent 类专业 agent / workflow agentOptions）。
  const parent = { options: { provider: 'anthropic', model: 'claude-x' } }
  await dcheck('P7a child.options ≠ parent.options（显式指定）→ 不覆盖', async () => {
    const ctx = makeCtx({ agents: { get: (id) => (id === 'parent-1' ? parent : undefined) } })
    const agent = makeAgent({ header: subHeaderOf(), options: { provider: 'anthropic', model: 'claude-explicit' }, requestHeader: () => null })
    const out = await drive(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL, subagent: SUB_MODEL }) }), { agent, proposed: { provider: 'anthropic', model: 'claude-explicit', reasoningEffort: '' } })
    return out.provider === 'anthropic' && out.model === 'claude-explicit'
  })
  await dcheck('P7b resolved ≠ child.options seed（更显式层生效）→ 不覆盖（防御未来宿主演进）', async () => {
    const ctx = makeCtx({ agents: { get: () => ({ options: { ...NATIVE } }) } })
    const agent = makeAgent({ header: subHeaderOf(), options: { ...NATIVE }, requestHeader: () => null })
    const out = await drive(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), { agent, proposed: { provider: 'openai', model: 'picked-by-host', reasoningEffort: '' } })
    return out.provider === 'openai' && out.model === 'picked-by-host'
  })
  await dcheck('P7c child.options == parent.options（纯继承）→ 正常换入', async () => {
    const ctx = makeCtx({ agents: { get: () => ({ options: { ...NATIVE } }) } })
    const agent = makeAgent({ header: subHeaderOf(), options: { ...NATIVE }, requestHeader: () => null })
    const out = await drive(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL, subagent: SUB_MODEL }) }), { agent })
    return out.provider === SUB_MODEL.provider && out.model === SUB_MODEL.model
  })
  function subHeaderOf() {
    return { origin: 'subagent', agentPreset: PRESET_ID, parentSession: 'parent-1', delegationDepth: 1 }
  }
}

{
  // P8 预设解析兜底。
  await dcheck('P8a agentPresets 服务缺失 → header.agentPreset 兜底仍生效（主 agent）', async () => {
    const ctx = makeCtx()
    const agent = makeAgent({ header: { origin: 'main', agentPreset: PRESET_ID }, requestHeader: () => null })
    const out = await drive(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), { agent })
    return out.provider === MAIN_MODEL.provider && out.model === MAIN_MODEL.model
  })
  await dcheck('P8b composedPreset 抛错 → header.agentPreset 兜底（不击穿请求链）', async () => {
    const ctx = makeCtx({ agentPresets: { composedPreset: () => { throw new Error('boom') } } })
    const agent = makeAgent({ header: { origin: 'main', agentPreset: PRESET_ID }, requestHeader: () => null })
    const out = await drive(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), { agent })
    return out.provider === MAIN_MODEL.provider && out.model === MAIN_MODEL.model
  })
  await dcheck('P8c 主 agent 无 preset 解析且 header 无 agentPreset → 直通', async () => {
    const ctx = makeCtx()
    const agent = makeAgent({ header: { origin: 'main' }, requestHeader: () => null })
    const out = await drive(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), { agent })
    return out.provider === NATIVE.provider && out.model === NATIVE.model
  })
}

{
  // P9 fail-safe + 可观测。
  await dcheck('P9a service.presetDefaults 抛错 → fail-safe 返回 resolved + warn', async () => {
    const ctx = makeCtx()
    const service = { isEnabled: () => true, presetDefaults: () => { throw new Error('settings read failed') } }
    const agent = makeAgent({ header: { origin: 'main', agentPreset: PRESET_ID }, requestHeader: () => null })
    const out = await drive(ctx, service, { agent })
    return out.provider === NATIVE.provider && out.model === NATIVE.model && ctx.logger.warnCalls.length === 1 && ctx.logger.warnCalls[0].includes('preset default model')
  })
  await dcheck('P9b agent.session 异常形态（header getter 抛错）→ fail-safe 返回 resolved', async () => {
    const ctx = makeCtx()
    const agent = { session: { get header() { throw new Error('bad session') } } }
    const out = await drive(ctx, makeService({ governance: presetConfig({ main: MAIN_MODEL }) }), { agent })
    return out.provider === NATIVE.provider && out.model === NATIVE.model
  })
}

{
  // P10 settings 热更新：同一 service 实例上字典变化 → 下次请求读取新值。
  await dcheck('P10 presets 字典热更新 → 下次请求换入新模型', async () => {
    const store = { governance: presetConfig({ main: MAIN_MODEL }) }
    const ctx = makeCtx({ agentPresets: { composedPreset: () => PRESET_ID } })
    const service = makeService(store)
    const agent = makeAgent({ header: { origin: 'main' }, sessionId: 'sess-hot', requestHeader: () => null })
    const first = await drive(ctx, service, { agent })
    store.governance = presetConfig({ main: SUB_MODEL })
    const second = await drive(ctx, service, { agent })
    return first.model === MAIN_MODEL.model && second.provider === SUB_MODEL.provider && second.model === SUB_MODEL.model
  })
}

console.log(failures === 0 ? '\nALL EVO-013 DISCRIMINANT TESTS PASSED' : `\n${failures} EVO-013 ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
