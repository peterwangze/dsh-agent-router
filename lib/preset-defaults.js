/**
 * EVO-014：预设 Agent 默认模型——事件驱动（显示跟随 + 不介入会话过程）。
 *
 * 用户三原则（本轮设计对话确立，验收基准）：
 * 1. 模型跟随**预设变更事件**：播种只由 `agent/created`（新 agent 注册，
 *    含 resume 恢复路径）与 `agent-preset/selected`（空白会话切换预设）两个
 *    事件触发——不做请求流拦截；
 * 2. **不介入会话过程**：EVO-013 的 `agent/request` 全局层瀑布监听已彻底
 *    移除（回归守卫：tests D1）——会话进行中的每个请求零插件开销；
 * 3. 避免会话级模型修改副作用——**唯一豁免**（用户裁决接受）：主会话显示
 *    播种借用 api-proxy 的 `sessions.selectModel`（显示层 picked 写入），
 *    其附带的全局默认写入**立即写回恢复**（瞬态 ~ms 级；恢复失败重试一次
 *    + 高声告警）。
 *
 * 宿主契约（Coordinator 侦察 + 开发期源码实证，execution-packets EVO-014
 * facts）：
 * - `agent/created`：Scoped 事件，payload `{agent}`（dsh-agent runtime-types
 *   L146）；`enter()` 先落注册表再 `announce()` 发出——监听器运行时
 *   `ctx.agents.get(session.id)` 已可查。**resume 路径同样发出**（dsh-agent
 *   -loop resumeWith → setupAndPublish(…, "resume") → publish → announce）：
 *   重启后恢复已产出会话也触发本事件——requestHeader 判据保证零动作；
 *   恢复的**空白**预设会话则照常播种（已知行为，README 披露）。监听器
 *   **同步抛错会 veto 发布并回滚**（announce 语义）——本模块 handler 一律
 *   async + 全程 try/catch，绝不 reject（async 拒绝被宿主包容为 warn，双保险）。
 * - `agent-preset/selected(sessionId, agentPreset)`：非 scoped 双参 cordis
 *   事件（dsh-agent-presets 在切换提交后转发）；宿主 agent-preset-locked
 *   保证已产出会话不可切——本 handler 的 requestHeader 判据是纵深防御。
 * - `sessions.selectModel`（ctx.get('apiProxy')，进程内面）：envelope
 *   `{ payload: { sessionId, provider, model, reasoningEffort? } }`（rpcId
 *   可省——ok() 仅回显）；响应 `{ result: { ok: true, value: { selected } } }`
 *   或 `{ result: { ok: false, error: { code, message, details } } }`（模型
 *   不可用 → code 'model-unavailable'）。内部副作用 = picked 写入（显示层
 *   与请求路由层同时生效）+ `saveDefaultModelSelection`（全局默认瞬态写，
 *   宿主自身包容其失败）。
 * - 子代理（dsh-subagent）无 api-proxy 的 selectionFor → 请求纯 options
 *   （seedConfig）驱动：**改 child.options 即改子代理请求模型，零副作用**。
 *   空白主会话的 buildRequest 同样现读 `agent.options`（dsh-agent-loop
 *   L697-707）——options 突变即首请求路由，与 picked 显示层一致。
 * - `agent.options` 为 plain object（构造器 `this.options = options`，每次
 *   create/resume 新建，从不冻结——deepFreeze 只作用于 seedConfig 克隆）；
 *   冻结形态按防御处理（warn 不炸）。
 * - 全局默认读写：`ctx.get('agentDefaultModel')` → `currentSelection()`
 *   （读 live）/ `saveSelection({provider, model, reasoningEffort?})`（写回）。
 * - 显式覆盖判别：`child.options` ≠ `parent.options`（`ctx.agents.get(
 *   header.parentSession)` 查父）= 显式指定（插件专业 agent 的 agentOptions /
 *   workflow model 覆盖）→ 永不碰。
 *
 * 主权规则（结构化保证）：不注册任何用户模型变更监听；播种仅由两个预设事件
 * 触发；已产出会话无事件（宿主锁定 + requestHeader 判据）——用户会话内手动
 * 选模型 = 宿主原生 picked 覆盖，插件永不打架。
 *
 * fail-safe 纪律（prestep.js 同款）：handler 内部任何异常都不得击穿宿主
 * （agent 创建/预设切换）——warn 可观测（P8）后返回。可观测：首次为某
 * (preset, session) 播种打一条 info（去重：有界，会话级一次）；被主权保护
 * 跳过时零日志。
 *
 * @module dsh-agent-router/preset-defaults
 */

/** 播种观测去重上限（有界内存：超限整体清空，最多多打一轮 info——P8 语义不受损）。 */
const SWAP_LOG_LIMIT = 512

/**
 * 宿主预设罗盘服务读取（P9 契约防御）：事实源为 `ctx.agentPresets`（cordis
 * 服务属性形态）；服务注册面差异时回落 `ctx.get('agentPresets')`。两形态都
 * 要求 composedPreset 为函数才采信——不存在/形态不符返回 undefined（调用方
 * header 兜底）。注：composedPreset 若为异步签名，同步读取会落空并 header
 * 兜底（安全降级——加入过预设的会话 header.agentPreset 恒有快照）。
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
 * live 全局默认读取（每次现读，绝不缓存）：`ctx.get('agentDefaultModel')
 * .currentSelection()`；服务缺失/抛错/空值 → null。
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

/** reasoningEffort 归一（空串/非串 = 未设置——比较与写回共用同一口径）。 */
const effortOf = (selection) => (selection && typeof selection.reasoningEffort === 'string' && selection.reasoningEffort
  ? selection.reasoningEffort
  : undefined)

/** 两次全局默认快照是否发生漂移（provider/model/reasoningEffort 三元组）。 */
const drifted = (before, after) => !before || !after
  || before.provider !== after.provider
  || before.model !== after.model
  || effortOf(before) !== effortOf(after)

/**
 * 安装预设默认模型事件监听器：`agent/created`（Scoped，全局层 admitted——
 * prestep.js `agent/pre-step` 同源先例）+ `agent-preset/selected`（非 scoped
 * 双参）。enabled 总开关关闭时 handler 首行直通（热生效，与现有总开关语义
 * 一致：关闭路由 = 整个插件功能关闭）。
 * @param ctx - 宿主行 ctx（事件注册 + apiProxy/agentDefaultModel/agentPresets/
 *   agents 服务查找 + logger）。
 * @param service - RouterService（isEnabled / presetDefaults 热读取）。
 * @returns 卸载器（随宿主行 fiber 卸载；移除全部两个监听）。
 */
export function installPresetDefaults(ctx, service) {
  // (preset, session) 播种观测去重（闭包持有：卸载即弃，测试间互不污染）。
  const swapLogged = new Set()
  const noteSwap = (preset, agent, target) => {
    try {
      const key = `${preset}\u0000${sessionKeyOf(agent)}`
      if (swapLogged.has(key)) return
      if (swapLogged.size >= SWAP_LOG_LIMIT) swapLogged.clear()
      swapLogged.add(key)
      ctx.logger?.info?.(`dsh-agent-router: preset "${preset}" default model applied (provider=${target.provider}, model=${target.model})`)
    } catch { /* 可观测失败不影响事件链 */ }
  }

  /**
   * 主会话显示播种（唯一豁免的副作用面）：面可用性预检 → fail-closed 前置
   * → ① options 突变（subagent 继承载体 + 空白会话 seedConfig 一致性）→
   * ② selectModel picked 播种（显示层；失败分支回滚 ① 保持显示/请求一致）
   * → ③ 全局默认写回恢复（检测漂移才写；恢复失败重试一次，再失败高声告警）。
   * fail-closed 前置：globalBefore 不可读 = 无法保证写回恢复 → 不做播种
   * （宁可不接管，不可留无法恢复的全局写——EVO-013 R0 F-2 同判）。
   */
  const seed = async (agent, preset, target) => {
    // 面可用性预检（先于一切突变）：进程内调用 apiProxy 面，typeof 守卫——
    // 缺失时 P8 可观测降级为完整零动作（避免 options 已突变而显示不跟随的
    // 分裂形态）。
    const apiProxy = ctx && typeof ctx.get === 'function' ? ctx.get('apiProxy') : undefined
    const sessions = apiProxy && typeof apiProxy === 'object' ? apiProxy.sessions : undefined
    if (!sessions || typeof sessions.selectModel !== 'function') {
      ctx.logger?.warn?.(`dsh-agent-router: preset "${preset}" display seeding skipped: apiProxy sessions.selectModel face unavailable (P8 degraded, no action taken)`)
      return
    }
    const globalBefore = liveDefaultSelection(ctx)
    if (!globalBefore) {
      ctx.logger?.warn?.(`dsh-agent-router: preset "${preset}" default model not applied to session "${sessionKeyOf(agent)}": live global default selection is unreadable, cannot guarantee restore (fail-closed)`)
      return
    }
    // ① options 突变（plain object 实证；冻结形态防御——warn 降级，不播种）。
    const prior = { provider: agent.options?.provider, model: agent.options?.model }
    try {
      agent.options.provider = target.provider
      agent.options.model = target.model
    } catch (error) {
      ctx.logger?.warn?.(`dsh-agent-router: preset "${preset}" default model not applied to session "${sessionKeyOf(agent)}": agent options are not mutable (${error && error.message ? error.message : String(error)})`)
      return
    }
    // ② picked 播种（显示层）：响应校验（ok/err 信封实证），不做形状假设。
    const sessionId = agent.session?.id ?? agent.id
    const selection = { provider: target.provider, model: target.model }
    const effort = effortOf(target)
    if (effort !== undefined) selection.reasoningEffort = effort
    let response
    try {
      response = await sessions.selectModel({ payload: { sessionId, ...selection } })
    } catch (error) {
      // fail-safe：面抛错（非 err 信封形态）→ 回滚 ① 保持一致 + warn。
      revertOptions(agent, prior)
      ctx.logger?.warn?.(`dsh-agent-router: preset "${preset}" selectModel seeding threw for session "${sessionKeyOf(agent)}": ${error && error.message ? error.message : String(error)}`)
      return
    }
    if (!response || typeof response !== 'object' || response.result?.ok !== true) {
      // 错误分支（model-unavailable 等）→ 回滚 ①（显示/请求一致零动作）+ warn。
      revertOptions(agent, prior)
      const error = response?.result?.error
      ctx.logger?.warn?.(`dsh-agent-router: preset "${preset}" default model not applied to session "${sessionKeyOf(agent)}": selectModel rejected${error ? ` (code=${error.code ?? '?'}, message=${error.message ?? '?'})` : ''}`)
      return
    }
    // ③ 全局默认写回恢复：selectModel 内部 saveDefaultModelSelection 已完成
    // （await 后读即准）；同值写（G→G）不触发恢复。
    const globalAfter = liveDefaultSelection(ctx)
    if (drifted(globalBefore, globalAfter)) {
      const restore = async () => {
        const defaults = ctx && typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : undefined
        if (!defaults || typeof defaults.saveSelection !== 'function') throw new Error('agentDefaultModel.saveSelection unavailable')
        const payload = { provider: globalBefore.provider, model: globalBefore.model }
        const restoreEffort = effortOf(globalBefore)
        if (restoreEffort !== undefined) payload.reasoningEffort = restoreEffort
        await defaults.saveSelection(payload)
      }
      try {
        await restore()
      } catch (first) {
        try {
          await restore()
        } catch (second) {
          // 高声告警（可操作文案）：全局默认停留在预设模型。
          ctx.logger?.warn?.(`dsh-agent-router: FAILED TO RESTORE global default model after preset "${preset}" seeding (session "${sessionKeyOf(agent)}"); the global default is left at the preset model — please manually switch it back to ${globalBefore.provider}/${globalBefore.model}${effortOf(globalBefore) ? ` (reasoningEffort=${effortOf(globalBefore)})` : ''} in Settings → Models. restore attempts: ${first && first.message ? first.message : String(first)}; ${second && second.message ? second.message : String(second)}`)
        }
      }
    }
    noteSwap(preset, agent, target)
  }

  /** options 回滚（selectModel 失败分支保持显示/请求一致；尽力而为）。 */
  const revertOptions = (agent, prior) => {
    try {
      agent.options.provider = prior.provider
      agent.options.model = prior.model
    } catch { /* 已尽力的回滚失败不再放大——外层已有 warn */ }
  }

  /**
   * subagent 纯 options 修正（零副作用路径——只改 options，无 selectModel
   * 无全局写）。parent 未播种（父会话创建早于配置保存）时 child.options =
   * 全局默认快照 ≠ P.main → fixup 到 P.main 正确覆盖此边缘。
   */
  const subagentFixup = (agent, header, presets) => {
    const preset = header.agentPreset
    if (typeof preset !== 'string' || !preset) return
    const cfg = presets[preset]
    if (!cfg || cfg.enabled === false) return
    const target = modelSet(cfg.subagent) ? cfg.subagent : (modelSet(cfg.main) ? cfg.main : null)
    if (!target) return // 全未配置 → 子代理天然继承 parent.options——零动作
    // 显式覆盖保护：child.options 与 parent.options 不一致 = 显式指定
    // （插件 agent 类专业 agent / workflow agentOptions）⇒ 尊重。
    const parent = header.parentSession && ctx && ctx.agents && typeof ctx.agents.get === 'function'
      ? ctx.agents.get(header.parentSession)
      : undefined
    if (parent?.options && agent.options
      && (agent.options.provider !== parent.options.provider || agent.options.model !== parent.options.model)) return
    // 突变 child.options（子代理请求 = seedConfig 纯 options 驱动）：
    try {
      agent.options.provider = target.provider
      agent.options.model = target.model
    } catch (error) {
      // options 冻结形态防御（实证为 plain object；此处防御宿主演进）。
      ctx.logger?.warn?.(`dsh-agent-router: preset "${preset}" subagent options fixup failed (not mutable): ${error && error.message ? error.message : String(error)}`)
      return
    }
    noteSwap(preset, agent, target)
  }

  // agent/created handler（Scoped 事件，payload {agent}）。async + 全程
  // try/catch：announce 对监听器同步抛错会 veto agent 发布——绝不 reject。
  const onAgentCreated = async (payload) => {
    try {
      if (!service.isEnabled()) return
      const presets = service.presetDefaults()
      if (!presets || typeof presets !== 'object') return
      const agent = payload?.agent
      if (!agent?.session) return
      const header = agent.session.header ?? {}
      if (header.origin === 'subagent') return subagentFixup(agent, header, presets)
      // 主会话：已产出（恢复的已运行会话——resume 路径同样触发本事件）→
      // requestHeader 层存在 ⇒ DSH 规则零动作。
      if (agent.session.requestHeader?.()) return
      // 创建期事实：header.agentPreset 优先（冻结快照）；无则 composedPreset
      // live 解析 + header 兜底链（EVO-013 保留）。
      const preset = typeof header.agentPreset === 'string' && header.agentPreset
        ? header.agentPreset
        : livePresetOf(agent, ctx, header)
      if (!preset) return
      const cfg = presets[preset]
      if (!cfg || cfg.enabled === false || !modelSet(cfg.main)) return // 未配置 → 零动作
      await seed(agent, preset, cfg.main)
    } catch (error) {
      // fail-safe：本监听器异常不得 veto agent 创建——warn 可观测（P8）后返回。
      ctx.logger?.warn?.(`dsh-agent-router: preset default model handler failed (agent/created), agent creation unaffected: ${error && error.message ? error.message : String(error)}`)
    }
  }

  // agent-preset/selected handler（非 scoped 双参 (sessionId, agentPreset)）。
  // 同 fail-safe 纪律：绝不破坏预设切换。
  const onPresetSelected = async (sessionId, agentPreset) => {
    try {
      if (!service.isEnabled()) return
      const agent = ctx && ctx.agents && typeof ctx.agents.get === 'function'
        ? ctx.agents.get(sessionId)
        : undefined
      if (!agent?.session) return
      // 纵深防御（宿主 agent-preset-locked 本应保证空白）。
      if (agent.session.requestHeader?.()) return
      const presets = service.presetDefaults()
      if (!presets || typeof presets !== 'object') return
      const cfg = presets[agentPreset]
      if (cfg && cfg.enabled !== false && modelSet(cfg.main)) return seed(agent, agentPreset, cfg.main)
      // 切到无配置预设 → 重置回全局默认（G→G 写为同值无害；options 同步为
      // DSH 默认；after==before 不触发恢复——全局净变化为零）。
      const global = liveDefaultSelection(ctx)
      if (!global) return
      await seed(agent, agentPreset, global)
    } catch (error) {
      // fail-safe：异常不得破坏预设切换——warn 可观测后返回。
      ctx.logger?.warn?.(`dsh-agent-router: preset default model handler failed (agent-preset/selected), preset switch unaffected: ${error && error.message ? error.message : String(error)}`)
    }
  }

  const disposeCreated = ctx.on('agent/created', onAgentCreated)
  const disposeSelected = ctx.on('agent-preset/selected', onPresetSelected)
  return () => {
    disposeCreated()
    disposeSelected()
  }
}
