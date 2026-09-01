/**
 * EVO-013：预设 Agent 默认模型——`agent/request` 全局层瀑布监听。
 *
 * 宿主契约（Coordinator 侦察，execution-packets EVO-013 facts，按此实现）：
 * - 会话模型选择三层 = picked（进程内，api-proxy WeakMap，插件不可读）→
 *   `agent.session.requestHeader()?.config`（会话日志持久层）→
 *   `agentDefaultModel.currentSelection()`（全局默认）；
 * - `agent/request` 瀑布载荷 `{ agent, turn, step, signal }`（payload.agent 由
 *   dsh-agent agentEvents 注入），返回值 = proposedConfig；宿主 agent 作用域经
 *   @deepseek-ai/dsh-agent 的 installModelSelection 注册选择覆盖（该函数定义
 *   于 dsh-agent/lib/index.js，api-proxy 的 selectionFor 装配调用它）——本模块
 *   在**插件宿主行（全局层）**注册：dsh-scope 事件 admission 沿父链向上扩展，
 *   监听器对**所有预设的全部 agent 会话**可见（lib/prestep.js `agent/pre-step`
 *   同源先例）；
 * - 子代理（dsh-subagent resolveChildAgentOptions）继承 parent.options 的
 *   provider/model **创建时快照** + `request.agentOptions` 显式覆盖优先；子会话
 *   header 含 `origin:'subagent'` / `agentPreset`（加入的预设 id）/
 *   `parentSession` / `delegationDepth`；
 * - 插件自己的 agent 类专业 agent（service.runAgentDelegation）经
 *   `subagents.start('spawn', { agentOptions: { provider, model } })` **显式
 *   指定**模型——预设规则 MUST NOT 覆盖它。
 *
 * 主权规则（三层选择权，缺省零行为变化）：
 * ① 主 agent：条目 main.provider/model 齐备 + 新会话（无 requestHeader）+
 *   resolved 与全局默认一致（= picked 与其它更显式层均未生效）三条件同时成立
 *   才换入预设模型；任一不成立即直通（手动选择与已运行会话永不被覆盖）。
 *   reasoningEffort 不动（适配器默认语义）。
 * ② subagent：child.options ≠ parent.options = 显式指定（插件 agent 类专业
 *   agent / workflow agentOptions）→ 尊重；resolved ≠ child 自身 options seed
 *   = 有更显式层在起作用 → 尊重（防御未来宿主演进）；否则按 subagent 未设
 *   继承 main、设了用 subagent 换入。
 * ③ 红线：绝不走 dsh-host-apiproxy 的 session.selectModel 通路（那会写全局
 *   默认 defaults.saveDefaultModelSelection）——本模块只覆盖当次请求的
 *   proposedConfig。
 *
 * fail-safe 纪律（prestep.js 同款）：handler 内部任何异常都不得击穿宿主请求
 * 链——warn 可观测（P8）后原样返回 resolved。可观测：首次为某
 * (preset, session) 换入默认模型打一条 info（去重：会话级一次）；被主权保护
 * 跳过时不刷屏（零日志）。
 *
 * @module dsh-agent-router/preset-defaults
 */

/** 换入观测去重上限（有界内存：超限整体清空，最多多打一轮 info——P8 语义不受损）。 */
const SWAP_LOG_LIMIT = 512

/**
 * 宿主预设罗盘服务读取（P9 契约防御）：事实源为 `ctx.agentPresets`（cordis
 * 服务属性形态，facts 6 同款措辞）；服务注册面差异时回落 `ctx.get(
 * 'agentPresets')`。两形态都要求 composedPreset 为函数才采信——不存在/
 * 形态不符返回 undefined（调用方 header 兜底）。注：composedPreset 若为
 * 异步签名，同步读取会落空并 header 兜底（安全降级——加入过预设的会话
 * header.agentPreset 恒有快照）。
 */
function agentPresetsServiceOf(ctx) {
  try {
    const viaProperty = ctx?.agentPresets
    if (viaProperty && typeof viaProperty.composedPreset === 'function') return viaProperty
    const viaGet = ctx && typeof ctx.get === 'function' ? ctx.get('agentPresets') : undefined
    if (viaGet && typeof viaGet.composedPreset === 'function') return viaGet
  } catch { /* 服务查找抛错 → undefined（header 兜底） */ }
  return undefined
}

/**
 * live 全局默认读取（prestep.js liveDefaultSelection 同源链）：`ctx.get(
 * 'agentDefaultModel').currentSelection()`；服务缺失/抛错/空值 → null。
 */
function liveDefaultSelection(ctx) {
  try {
    const service = ctx && typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : undefined
    if (!service || typeof service.currentSelection !== 'function') return null
    const current = service.currentSelection()
    return current && typeof current === 'object' ? current : null
  } catch {
    return null
  }
}

/**
 * 主 agent 的预设解析：优先宿主预设罗盘的 live 解析，回落会话 header 的
 * `agentPreset`（resolveSessionPreset 语义：加入预设时写入的快照）。返回
 * '' = 无法解析。
 */
function livePresetOf(agent, ctx, header) {
  try {
    const presets = agentPresetsServiceOf(ctx)
    const composed = typeof presets?.composedPreset === 'function' ? presets.composedPreset(agent?.ctx) : undefined
    if (typeof composed === 'string' && composed) return composed
    if (composed && typeof composed === 'object' && typeof composed.id === 'string' && composed.id) return composed.id
  } catch { /* 罗盘服务缺失/抛错 → header 兜底 */ }
  const fromHeader = header?.agentPreset
  return typeof fromHeader === 'string' && fromHeader ? fromHeader : ''
}

/** 会话观测键（去重用；全部可选链——拿不到就用空串，仍受 preset 键约束有界）。 */
function sessionKeyOf(agent) {
  return String(agent?.session?.id ?? agent?.sessionId ?? agent?.session?.header?.id ?? '')
}

/** 条目主/subagent 模型是否已设置完成（provider/model 同时非空——空串 = 未设置）。 */
const modelSet = (group) => !!(group && typeof group.provider === 'string' && group.provider
  && typeof group.model === 'string' && group.model)

/**
 * 安装预设默认模型监听器：`ctx.on('agent/request', handler)`（全局层，所有
 * 预设的 agent 会话可见）。enabled 总开关关闭时 handler 首行直通（热生效，
 * 与现有总开关语义一致：关闭路由 = 整个插件功能关闭）。
 * @param ctx - 宿主行 ctx（事件注册 + agentDefaultModel/agentPresets/agents
 *   服务查找 + logger）。
 * @param service - RouterService（isEnabled / presetDefaults 热读取）。
 * @returns 卸载器（随宿主行 fiber 卸载）。
 */
export function installPresetDefaults(ctx, service) {
  // (preset, session) 换入观测去重（闭包持有：卸载即弃，测试间互不污染）。
  const swapLogged = new Set()
  const noteSwap = (preset, agent, target) => {
    try {
      const key = `${preset}\u0000${sessionKeyOf(agent)}`
      if (swapLogged.has(key)) return
      if (swapLogged.size >= SWAP_LOG_LIMIT) swapLogged.clear()
      swapLogged.add(key)
      ctx.logger?.info?.(`dsh-agent-router: preset "${preset}" default model applied (provider=${target.provider}, model=${target.model})`)
    } catch { /* 可观测失败不影响请求链 */ }
  }
  const handler = async (payload, next) => {
    const resolved = await next()
    try {
      if (!service.isEnabled()) return resolved
      const presets = service.presetDefaults()
      if (!presets || typeof presets !== 'object') return resolved
      const agent = payload?.agent
      if (!agent?.session) return resolved
      const header = agent.session.header
      const isSubagent = header?.origin === 'subagent'
      const preset = isSubagent && typeof header.agentPreset === 'string' && header.agentPreset
        ? header.agentPreset
        : livePresetOf(agent, ctx, header)
      if (!preset) return resolved
      const cfg = presets[preset]
      if (!cfg || cfg.enabled === false) return resolved
      if (!isSubagent) {
        // 主 agent：未设置完成 = 遵循 DSH 规则（零行为变化）。
        if (!modelSet(cfg.main)) return resolved
        // 主权①：已运行会话（日志 header 层存在）优先。
        if (agent.session.requestHeader?.()) return resolved
        // 主权②（fail-closed，R0 F-2）：picked 层不可读——resolved 与全局默认
        // 不一致 ⇒ 有更显式的选择（picked 或其它层覆盖）⇒ 尊重；live 全局默认
        // 不可读（服务缺失/抛错/空值）= 无法证明「当前是默认层」⇒ 同样不换入
        // （宁可不接管，不可误覆盖——降级环境预设机制停用，主权优先）。
        const live = liveDefaultSelection(ctx)
        if (!live || resolved.provider !== live.provider || resolved.model !== live.model) return resolved
        noteSwap(preset, agent, cfg.main)
        return { ...resolved, provider: cfg.main.provider, model: cfg.main.model }
      }
      // subagent 分支：subagent 未设置 → 继承 main；main 亦未设置 → 不介入。
      const target = modelSet(cfg.subagent) ? cfg.subagent : (modelSet(cfg.main) ? cfg.main : null)
      if (!target) return resolved
      // 显式覆盖保护：child.options 与 parent.options 不一致 = 显式指定
      // （插件 agent 类专业 agent / workflow agentOptions）⇒ 尊重。
      const parentAgent = header.parentSession && ctx && typeof ctx.agents?.get === 'function'
        ? ctx.agents.get(header.parentSession)
        : undefined
      if (parentAgent?.options && agent.options
        && (agent.options.provider !== parentAgent.options.provider || agent.options.model !== parentAgent.options.model)) return resolved
      // 继承链已对齐默认层（child.options = parent.options 创建快照）时
      // resolved 应与 child 自身 seed 一致；不一致 ⇒ 有更显式层在起作用 ⇒ 尊重
      // （防御未来宿主演进）。
      if (resolved.provider !== agent.options?.provider || resolved.model !== agent.options?.model) return resolved
      noteSwap(preset, agent, target)
      return { ...resolved, provider: target.provider, model: target.model }
    } catch (error) {
      // fail-safe：本监听器异常不得击穿宿主请求链——warn 可观测（P8）后直通。
      ctx.logger?.warn?.(`dsh-agent-router: preset default model handler failed, falling back: ${error && error.message ? error.message : String(error)}`)
      return resolved
    }
  }
  return ctx.on('agent/request', handler)
}
