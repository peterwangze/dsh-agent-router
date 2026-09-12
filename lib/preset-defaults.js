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
 *    播种借用宿主会话选择面（显示层 selected 写入），其附带的全局默认写入
 *    **立即写回恢复**（瞬态 ~ms 级；恢复失败重试一次 + 高声告警）。
 *
 * 宿主契约（Coordinator 侦察 + 开发期源码实证，execution-packets EVO-014
 * facts）：
 * - `agent/created`：Scoped 事件，payload `{agent}`（dsh-agent runtime-types
 *   L146）；`enter()` 先落注册表再 `announce()` 发出——监听器运行时
 *   agents 注册表已可查（本模块经 host-abi agentsRegistryOf 解析，见 FIX-023）。**resume 路径同样发出**（dsh-agent
 *   -loop resumeWith → setupAndPublish(…, "resume") → publish → announce）：
 *   重启后恢复已产出会话也触发本事件——FIX-025 sessionBlank 同构判据保证
 *   零动作；恢复的**空白**（events 无 turn/start——含老无消息会话，独立
 *   事件不开启 turn，FIX-025）预设会话则照常播种（已知行为，README 披露）。监听器
 *   **同步抛错会 veto 发布并回滚**（announce 语义）——本模块 handler 一律
 *   async + 全程 try/catch，绝不 reject（async 拒绝被宿主包容为 warn，双保险）。
 * - `agent-preset/selected(sessionId, agentPreset)`：非 scoped 双参 cordis
 *   事件（dsh-agent-presets 在切换提交后转发）；宿主 agent-preset-locked
 *   保证已产出会话不可切——本 handler 的 sessionBlank 同构判据（FIX-025）
 *   是纵深防御。
 * - 会话选择面（FIX-030-A 演进适配 → EVO-021/ARCH-004 B3 单形态化）：唯一
 *   形态 = `ctx.get('sessionController')`（dsh-api-session-controller
 *   `super(ctx, "sessionController", { namespace: "session" })`），
 *   `selectModel({sessionId, provider, model, reasoningEffort?})` 直接参数、
 *   成功返回 `{selected}` 值 / 失败 **抛 RemoteError**（apiProxy 服务名在
 *   新宿主全包 grep 零注册——FIX-030 报障①根因）。面解析与归一信封的唯一
 *   实现在 host-abi llm-selection 域（sessionSelectFaceOf，设计 §4.3 域 2）；
 *   旧宿主（≤0.1.1-rc.x）apiProxy 面回落已按 D1-2 删除（防复活负向守卫 =
 *   tests N 节 + fix-029 D 组）。内部副作用不变：selected/picked 写入 +
 *   `saveSelection` 全局默认瞬态写（③ 写回恢复覆盖）。
 * - 子代理（dsh-subagent）无会话选择面 → 请求纯 options（seedConfig）驱动：
 *   **改 child.options 即改子代理请求模型，零副作用**（新宿主 buildRequest
 *   route 仍现读 this.options——dsh-agent-loop L705-706；且子代理不经
 *   installModelSelection 覆盖：该覆盖仅 api-session-controller composeAgent
 *   setup 装配，dsh-subagent-in-process-driver 的 setup 无此步——FIX-030
 *   取证）。空白主会话的 buildRequest 同样现读 `agent.options`（dsh-agent-loop
 *   L697-707）——options 突变即首请求路由，与 selected 显示层一致。
 * - 子代理继承基线（FIX-030-B 演进适配）：旧宿主 child.options 继承
 *   `parent.options` 原样 → 「child ≠ parent = 显式指定」判别成立；新宿主
 *   `parentAgentOptionsForDelegation`（dsh-subagent L603-612）改为**父最近
 *   请求头路由优先**（"The latest request header owns provider, model…"）→
 *   有请求历史的父几乎恒 child ≠ parent.options → 旧判别把普通继承误判为
 *   显式指定 → fixup 全量跳过（FIX-030 报障②根因）。新判别 = 与宿主同构的
 *   **继承基线**：parent.session.requestHeader()?.config（无 header 回落
 *   parent.options）——child 与基线一致 = 普通继承（fixup）；不一致 = 显式
 *   覆盖（插件 agent 类专业 agent 的 agentOptions / workflow model 覆盖）→
 *   永不碰。
 * - FIX-032（subagent 留空语义修正）：宿主继承基线交付的是父**当前**路由
 *   （含会话内手动切换后的请求路由），subagentFixup 的 cfg.main 回落却把
 *   「留空 = 继承主 Agent 模型」固化为配置时静态值——用户切换主模型后新
 *   派生 subagent 被拉回预设模型（用户主权被子代理路径击穿，报障
 *   2026-09-07）。修正 = target 只认 cfg.subagent；留空 = 零动作（宿主基线
 *   已保证跟随主 agent 当前模型）。
 * - `agent.options` 为 plain object（构造器 `this.options = options`，每次
 *   create/resume 新建，从不冻结——deepFreeze 只作用于 seedConfig 克隆）；
 *   冻结形态按防御处理（warn 不炸）。
 * - 全局默认读写：`ctx.get('agentDefaultModel')` → `currentSelection()`
 *   （读 live）/ `saveSelection({provider, model, reasoningEffort?})`（写回）。
 * - FIX-023（EVO-014 复验失败根因，宿主源码 + API 实测双重实证）：agents
 *   注册表**必须经 `ctx.get('agents')` 调用时解析**（本模块经 host-abi 桶
 *   消费 ctx-services 域的 agentsRegistryOf——EVO-021 迁域，域内含形态
 *   判别）——cordis 属性访问（ctx.agents）仅对 inject 声明过
 *   的服务名生效，本插件 inject（lib/index.js：['settings','typert',
 *   'webServer']）未含 'agents'，属性面恒 undefined：切换播种曾静默失效
 *   （onPresetSelected 查不到 agent 无日志返回）+ subagent 父查找保护降级。
 *   先例：service.js `this.ctx.get('subagents')`；测试 stub 同形对齐：无
 *   agents 属性、仅经 get('agents') 解析（tests H 节判别——mock 保真度
 *   第三次同型缺陷修复）。
 * - FIX-024（EV-128 显示跟随补齐）→ **已由 FIX-026 客户端直驱取代**（EV-132
 *   真机反证服务端 emit 链不可达——源码推演通过、真机实证失败）。种子成功
 *   路径不再 ctx.emit('llm/adapters-updated')：显示刷新唯一路径 = 客户端
 *   订阅 agent-preset/selected → directoryFor(sessionId).load()（lib/client.js
 *   FIX-026 装配区）。用户架构裁决（P5 单一路径原则 / P-v3 原则 5）：被取代
 *   的旧路径 MUST 删除，禁止双显示刷新逻辑并存。tests/preset-defaults.mjs
 *   I 节为防复活负向守卫。
 * - FIX-025（EV-130 老无消息会话切换不跟随）：会话空白判据与宿主
 *   sessionBlank **完全同构**——`!session.events.some(e => e.type ===
 *   'turn/start')`（新宿主 dsh-agent-presets swap 锁等价：turnBoundary
 *   投影 openTurnStartSeq/lastTurn——同「是否开过 turn」语义）；标题/目标/
 *   命令/plan-mode 等**独立事件不开启 turn**，老无消息会话宿主仍判空白、
 *   允许切换预设，插件必须同步播种。events 不可读（形态防御）回落
 *   requestHeader 反演——保守方向：宁可漏播不可误播已产出会话。
 * - EVO-021（ARCH-004 B3，设计 §4.3 域 2 / §10 B3 / D1-2）：本模块宿主面
 *   函数迁 host-abi 桶（sessionSelectFaceOf / inheritedRouteOf /
 *   liveDefaultSelection / sessionNeverProduced / agentPresetsServiceOf →
 *   llm-selection 域唯一实现；agentsRegistryOf → ctx-services 域 B1 落地）
 *   ——liveDefaultSelection 双份实现（本模块 + prestep.js）去重为域内单点
 *   （P5）；apiProxy 旧面回落删除（sessionSelectFaceOf 单形态化）。测试
 *   播种夹具全套翻转为 sessionController 形态；apiProxy 防复活负向守卫 =
 *   tests N 节 + fix-029 D 组。
 *
 * 主权规则（结构化保证）：不注册任何用户模型变更监听；播种仅由两个预设事件
 * 触发；已产出会话无事件（宿主锁定 + FIX-025 sessionBlank 同构判据）——用户会话内手动
 * 选模型 = 宿主原生 selected 覆盖，插件永不打架。
 *
 * fail-safe 纪律（prestep.js 同款）：handler 内部任何异常都不得击穿宿主
 * （agent 创建/预设切换）——warn 可观测（P8）后返回。可观测：首次为某
 * (preset, session) 播种打一条 info（去重：有界，会话级一次）；被主权保护
 * 跳过时零日志。
 *
 * FIX-030-C（观测面）：播种/修正/跳过全量记入 presetDiag 诊断注册表
 * （有界环形，kind/applied/target/skip 原因/preset/session 时间戳）——
 * service 经 RPC `router/presetDiagnostics` 下发（设置页预设卡显示最近
 * 事件行 + 排障依据）；「配置生效无观测」的报障③由此闭环。
 *
 * @module dsh-agent-router/preset-defaults
 */

import { agentsRegistryOf, agentPresetsServiceOf, inheritedRouteOf, liveDefaultSelection, sessionNeverProduced, sessionSelectFaceOf } from './host-abi/index.js'

/** 播种观测去重上限（有界内存：超限整体清空，最多多打一轮 info——P8 语义不受损）。 */
const SWAP_LOG_LIMIT = 512

/** FIX-030-C：预设诊断环形缓冲上限（最近 N 条——设置页最近事件行 + 排障）。 */
export const PRESET_DIAG_LIMIT = 64

/**
 * FIX-030-C：预设播种/修正观测注册表（模块级有界环形——进程内诊断面，
 * service 经 RPC 下发；纯数据无宿主引用，JSON 安全）。条目形状：
 * { at, kind: 'seed-main'|'fixup-subagent', applied: boolean, preset,
 *   session, target?, skip? , detail? }——skip 为跳过原因短码
 * （face-unavailable / not-configured / disabled / produced / explicit-override
 *   / not-mutable / select-threw / select-rejected / restore-failed /
 *   no-agent / fail-closed-default / unconfigured-preset-reset）。
 */
const presetDiag = { entries: [] }
export function notePresetDiag(entry) {
  try {
    const record = {
      at: Date.now(),
      kind: typeof entry?.kind === 'string' ? entry.kind : '?',
      applied: entry?.applied === true,
      preset: typeof entry?.preset === 'string' ? entry.preset.slice(0, 64) : '',
      session: typeof entry?.session === 'string' ? entry.session.slice(0, 48) : '',
      ...(entry?.target && typeof entry.target === 'object' ? {
        target: {
          provider: String(entry.target.provider ?? '').slice(0, 64),
          model: String(entry.target.model ?? '').slice(0, 96),
        },
      } : {}),
      ...(typeof entry?.skip === 'string' ? { skip: entry.skip.slice(0, 40) } : {}),
      ...(typeof entry?.detail === 'string' ? { detail: entry.detail.slice(0, 160) } : {}),
    }
    presetDiag.entries.push(record)
    if (presetDiag.entries.length > PRESET_DIAG_LIMIT) presetDiag.entries.splice(0, presetDiag.entries.length - PRESET_DIAG_LIMIT)
  } catch { /* 诊断失败绝不影响主链 */ }
}

/** FIX-030-C：诊断快照（RPC 下发面——返回拷贝，调用方只读）。 */
export function presetDiagnostics() {
  return { entries: presetDiag.entries.slice() }
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
    const diag = (fields) => notePresetDiag({ kind: 'seed-main', preset, session: sessionKeyOf(agent), target, ...fields })
    // 面可用性预检（先于一切突变）：sessionController 单形态（EVO-021/D1-2
    // 删 apiProxy 旧面回落；面解析与归一信封迁 host-abi llm-selection 域）
    // ——缺失时 P8 可观测降级为完整零动作（避免 options 已突变而显示不
    // 跟随的分裂形态）；域内缺失同时经 noteHostDiag 入宿主诊断环形
    // （face-degraded，§4.3 域 2 降级行为）。
    const selectFace = sessionSelectFaceOf(ctx)
    if (!selectFace) {
      ctx.logger?.warn?.(`dsh-agent-router: preset "${preset}" display seeding skipped: no session select face (sessionController unavailable, P8 degraded, no action taken)`)
      diag({ applied: false, skip: 'face-unavailable' })
      return
    }
    const globalBefore = liveDefaultSelection(ctx)
    if (!globalBefore) {
      ctx.logger?.warn?.(`dsh-agent-router: preset "${preset}" default model not applied to session "${sessionKeyOf(agent)}": live global default selection is unreadable, cannot guarantee restore (fail-closed)`)
      diag({ applied: false, skip: 'fail-closed-default' })
      return
    }
    // ① options 突变（plain object 实证；冻结形态防御——warn 降级，不播种）。
    const prior = { provider: agent.options?.provider, model: agent.options?.model }
    try {
      agent.options.provider = target.provider
      agent.options.model = target.model
    } catch (error) {
      ctx.logger?.warn?.(`dsh-agent-router: preset "${preset}" default model not applied to session "${sessionKeyOf(agent)}": agent options are not mutable (${error && error.message ? error.message : String(error)})`)
      diag({ applied: false, skip: 'not-mutable' })
      return
    }
    // ② selected 播种（显示层 + 请求路由层）：归一信封（host-abi
    // llm-selection 域 sessionSelectFaceOf——成功/失败收敛同一判别形状，
    // 新宿主 RemoteError 在 face 内捕获）。
    const sessionId = agent.session?.id ?? agent.id
    const selection = { sessionId, provider: target.provider, model: target.model }
    const effort = effortOf(target)
    if (effort !== undefined) selection.reasoningEffort = effort
    let outcome
    try {
      outcome = await selectFace(selection)
    } catch (error) {
      // fail-safe：面自身抛错（归一层外）→ 回滚 ① 保持一致 + warn。
      revertOptions(agent, prior)
      ctx.logger?.warn?.(`dsh-agent-router: preset "${preset}" selectModel seeding threw for session "${sessionKeyOf(agent)}": ${error && error.message ? error.message : String(error)}`)
      diag({ applied: false, skip: 'select-threw', detail: String(error?.message ?? error).slice(0, 120) })
      return
    }
    if (!outcome || outcome.ok !== true) {
      // 错误分支（model-unavailable 等）→ 回滚 ①（显示/请求一致零动作）+ warn。
      revertOptions(agent, prior)
      ctx.logger?.warn?.(`dsh-agent-router: preset "${preset}" default model not applied to session "${sessionKeyOf(agent)}": selectModel rejected${outcome?.code ? ` (code=${outcome.code}, message=${outcome.message ?? '?'})` : ''}`)
      diag({ applied: false, skip: 'select-rejected', detail: outcome ? `${outcome.code}: ${outcome.message}`.slice(0, 120) : 'no outcome' })
      return
    }
    // ③ 全局默认写回恢复：selectModel 内部全局默认保存（新宿主 saveSelection
    // / 旧宿主 saveDefaultModelSelection）已完成（await 后读即准）；同值写
    // （G→G）不触发恢复。
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
          diag({ applied: true, skip: 'restore-failed', detail: `${first?.message ?? String(first)}; ${second?.message ?? String(second)}`.slice(0, 120) })
        }
      }
    }
    noteSwap(preset, agent, target)
    diag({ applied: true })
    // FIX-026 范围追加（EV-132 + 用户架构裁决）：此处原 FIX-024 的
    // notifyModelDirectoryRefresh（ctx.emit('llm/adapters-updated')）已删除——
    // 服务端 emit 链真机不可达，显示刷新由客户端直驱唯一承载（lib/client.js
    // FIX-026 装配区；防复活负向守卫见 tests/preset-defaults.mjs I 节）。
  }

  /**
   * 播种串行化队列（R0 F-1 修复）：宿主两个事件面（agent/created 的
   * announce 与 agent-preset/selected 的 cordis emit）均 fire-and-forget——
   * 不 await 监听器；两个并发 seed 交错时后者可能读到前者的瞬态全局值并把
   * 全局默认恢复到错误的中间值（静默污染，无告警）。所有 seed 调用挂到同一
   * Promise 链尾串行执行——h2 的 globalBefore 必然读到 h1 完成恢复后的稳定
   * 值，before/after 快照对闭合。队列本身永不 reject（尾部 .catch 兜底——
   * seed 内部已全防护，此为链条存活的第二道保险；单次 seed 异常不阻断后续，
   * 可观测走 handler 的 catch）；handler 仍 await 自己那次 seed 的完成（宿主
   * 本就不等待监听器，await 只服务插件自身语义与测试可判别性）。
   * subagentFixup 为同步纯 options 操作（无 await）——不进队列。
   */
  let seedQueue = Promise.resolve()
  const enqueueSeed = (agent, preset, target) => {
    const run = seedQueue.then(() => seed(agent, preset, target))
    seedQueue = run.catch(() => { /* 队列永不断裂 */ })
    return run
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
   * 无全局写）。FIX-032 语义：仅 cfg.subagent 显式配置时 fixup；未配置 =
   * 「留空 = 继承主 Agent 模型」（README L158）落地为**跟随主 agent 当前
   * （会话实际）模型**——宿主继承基线 parentAgentOptionsForDelegation
   * （dsh-subagent L603-613）已把父最近请求头路由（含会话内手动切换后的
   * 请求路由）传给 child，零动作即跟随。旧实现的 cfg.main 回落把继承固化
   * 为配置时静态值：用户切换主模型后新派生 subagent 被拉回预设模型
   * （报障 2026-09-07）；「parent 未播种 → fixup 到 P.main」边缘随之退役
   * ——未播种时主 agent 实际运行的全局默认即其当前模型，subagent 跟随之
   * （与主会话一致，不强行接管）。
   */
  const subagentFixup = (agent, header, presets) => {
    const diag = (fields) => notePresetDiag({ kind: 'fixup-subagent', preset: header.agentPreset, session: sessionKeyOf(agent), ...fields })
    const preset = header.agentPreset
    if (typeof preset !== 'string' || !preset) return
    const cfg = presets[preset]
    if (!cfg || cfg.enabled === false) return
    // FIX-032：target 只认 cfg.subagent——未设置 = 零动作（宿主继承基线已
    // 交付父当前路由；旧 cfg.main 回落 = 固化配置值，见上方 doc 注释）。
    const target = modelSet(cfg.subagent) ? cfg.subagent : null
    if (!target) return // subagent 未配置/全未配置 → 子代理天然继承宿主委托的父当前路由——零动作
    // 显式覆盖保护（FIX-030-B 基线重定）：宿主 0.1.2-rc.1 起
    // parentAgentOptionsForDelegation 以**父最近请求头路由**为子继承基线
    // （dsh-subagent L603-612 "The latest request header owns provider,
    // model…"）→ 旧判别（child ≠ parent.options = 显式）把普通继承几乎恒
    // 误判为显式指定 → fixup 全量跳过（FIX-030 报障②根因）。新判别与宿主
    // 同构：child 与**继承基线**（header 路由 ∥ parent.options 回落）一致 =
    // 普通继承 → fixup；不一致 = 显式指定（插件 agent 类专业 agent 的
    // agentOptions / workflow model 覆盖）⇒ 尊重。基线不可读（父缺失/形态
    // 漂移）→ 保护降级、fixup 继续（EVO-013 F-4 台账域既有边缘）。
    const agentsRegistry = header.parentSession ? agentsRegistryOf(ctx) : undefined
    const parent = agentsRegistry ? agentsRegistry.get(header.parentSession) : undefined
    if (parent && agent.options) {
      const baseline = inheritedRouteOf(parent)
      if (baseline
        && (agent.options.provider !== baseline.provider || agent.options.model !== baseline.model)) {
        diag({ applied: false, skip: 'explicit-override', target, detail: `child=${agent.options.provider}/${agent.options.model} baseline=${baseline.provider}/${baseline.model}` })
        return
      }
    }
    // 突变 child.options（子代理请求 = seedConfig 纯 options 驱动——新宿主
    // buildRequest L705-706 现读 this.options，且子代理不经
    // installModelSelection 覆盖（FIX-030 取证））：
    try {
      agent.options.provider = target.provider
      agent.options.model = target.model
    } catch (error) {
      // options 冻结形态防御（实证为 plain object；此处防御宿主演进）。
      ctx.logger?.warn?.(`dsh-agent-router: preset "${preset}" subagent options fixup failed (not mutable): ${error && error.message ? error.message : String(error)}`)
      diag({ applied: false, skip: 'not-mutable', target })
      return
    }
    noteSwap(preset, agent, target)
    diag({ applied: true, target })
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
      // 主会话：已产出（resume 恢复的已运行会话——resume 路径同样触发本
      // 事件）→ 零动作。FIX-025：判据与宿主 sessionBlank 同构（events 无
      // turn/start 即空白——独立事件不开启 turn，老无消息会话照常播种）；
      // requestHeader 反演仅作 events 不可读的形态防御回落（宁漏播不误播）。
      if (!sessionNeverProduced(agent)) {
        notePresetDiag({ kind: 'seed-main', applied: false, skip: 'produced', session: sessionKeyOf(agent), preset: header.agentPreset ?? livePresetOf(agent, ctx, header) })
        return
      }
      // 创建期事实：header.agentPreset 优先（冻结快照）；无则 composedPreset
      // live 解析 + header 兜底链（EVO-013 保留）。
      const preset = typeof header.agentPreset === 'string' && header.agentPreset
        ? header.agentPreset
        : livePresetOf(agent, ctx, header)
      if (!preset) return
      const cfg = presets[preset]
      if (!cfg || cfg.enabled === false || !modelSet(cfg.main)) {
        notePresetDiag({ kind: 'seed-main', applied: false, skip: !cfg ? 'not-configured' : (cfg.enabled === false ? 'disabled' : 'main-unset'), preset, session: sessionKeyOf(agent) })
        return // 未配置 → 零动作
      }
      await enqueueSeed(agent, preset, cfg.main)
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
      const agent = agentsRegistryOf(ctx)?.get(sessionId)
      if (!agent?.session) {
        // P8（FIX-023）：找不到 agent（或无 session）不再静默——属性面失效
        // 时期此处曾无日志返回，切换播种失效不可观测。warn 含 sessionId。
        ctx.logger?.warn?.(`dsh-agent-router: preset "${agentPreset}" default model seeding skipped: agent "${sessionId}" not found in agents registry`)
        notePresetDiag({ kind: 'seed-main', applied: false, skip: 'no-agent', preset: agentPreset, session: String(sessionId ?? '') })
        return
      }
      // 纵深防御（宿主 agent-preset-locked 本应保证空白）。FIX-025：判据与
      // 宿主 sessionBlank 同构（events 无 turn/start 即空白）——宿主允许
      // 切换预设的全部情形本 handler 都播种；requestHeader 反演仅作 events
      // 不可读的形态防御回落（宁漏播不误播）。
      if (!sessionNeverProduced(agent)) {
        notePresetDiag({ kind: 'seed-main', applied: false, skip: 'produced', preset: agentPreset, session: sessionKeyOf(agent) })
        return
      }
      const presets = service.presetDefaults()
      if (!presets || typeof presets !== 'object') return
      const cfg = presets[agentPreset]
      if (cfg && cfg.enabled !== false && modelSet(cfg.main)) return await enqueueSeed(agent, agentPreset, cfg.main)
      // 切到无配置预设 → 重置回全局默认（G→G 写为同值无害；options 同步为
      // DSH 默认；after==before 不触发恢复——全局净变化为零）。
      const global = liveDefaultSelection(ctx)
      if (!global) return
      await enqueueSeed(agent, agentPreset, global)
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

/**
 * EVO-017：预设作用域请求遥测（agent/request 全局层只读监听）——每次 DSH
 * agent-loop 请求（主会话/subagent）解析完成后记一次 scope 统计（计数口径
 * ——token 精确口径在专业/账号级既有视图）。主权保证：**不改 config**（原样
 * 返回 next() 结果——纯旁路观测，零介入）；预设归属 = agent.session.header
 * .agentPreset 快照（缺失时 live 兜底），origin = header.origin ===
 * 'subagent'。fail-safe：任何异常回退 config 原样返回（观测失败绝不影响
 * 请求链）。用户裁决（2026-09-05 统计分级需求）明示开启本监听——EVO-014
 * 「不介入会话过程」原则的观测豁免由用户指令授权（只读旁路，不修改任何
 * 请求字段）。
 * FIX-031：scope 行同时是**账号级统计的计数权威源**（每请求恰好一条）；本站点仍
 * 上报实际请求路由 config.provider（传输事实，含 `<account>-router` 包装路由），
 * 账号/agent 归因一律由 lib/stats.js 归因单点（normalizeAttribution）推导——
 * 站点侧禁止自建映射或改键（P5 多触发来源单路径）。
 * @param ctx - 宿主行 ctx（事件注册 + 服务查找）。
 * @param service - RouterService（isEnabled 门控 + recordScope 统计面）。
 * @returns 卸载器。
 */
export function installRequestTelemetry(ctx, service) {
  const handler = async (payload, next) => {
    let config
    try {
      config = await next()
    } catch (error) {
      notePresetDiag({ kind: 'request-telemetry', applied: false, skip: 'request-failed', preset: '', session: String(payload?.agent?.session?.id ?? ''), detail: String(error?.message ?? error).slice(0, 80) })
      throw error
    }
    try {
      if (!service.isEnabled()) return config
      const agent = payload?.agent
      const header = agent?.session?.header
      if (!header) return config
      // EVO-017 修正（用户实证 2026-09-06 归属错乱）：**live 预设优先**——
      // 宿主罗盘 composedPreset(agent.ctx) 解析会话**当前生效**预设（切换
      // 预设只 append agent-preset/selected 会话事件，session.header.
      // agentPreset 仍是创建时冻结快照——标准模式会话的主会话调用曾被误归
      // 旧预设，而 subagent 的 header 由宿主 childSessionMeta 从父 live 链
      // 现写、恰好正确）；header.agentPreset 仅作罗盘不可用时的兜底（与
      // dsh-subagent childSessionMeta L661-664 同构）。
      let preset = ''
      try {
        const presets = agentPresetsServiceOf(ctx)
        const composed = typeof presets?.composedPreset === 'function' ? presets.composedPreset(agent?.ctx) : undefined
        if (typeof composed === 'string' && composed) preset = composed
        else if (composed && typeof composed === 'object' && typeof composed.id === 'string' && composed.id) preset = composed.id
      } catch { /* 罗盘解析失败 → header 兜底 */ }
      if (!preset && typeof header.agentPreset === 'string' && header.agentPreset) preset = header.agentPreset
      // D7（返工批 3）：解除 preset 门控——无预设会话（如直用宿主官方
      // deepseek-official 默认模型）同样记录 scope 行（preset=''），账号级
      // 计数权威覆盖全部路由形态（与口径披露文案一致）；preset 解析链不动
      //（live 罗盘 → header 兜底 → 都无则 ''）。空串行在 stats.js #foldScope
      // 分流：只进账号视图，不进预设卡。无 header agent 仍零记录（上方早退）。
      if (typeof config?.provider !== 'string' || typeof config?.model !== 'string') return config
      service.stats.recordScope({
        preset,
        origin: header.origin === 'subagent' ? 'subagent' : 'main',
        provider: config.provider,
        model: config.model,
      })
    } catch { /* 观测失败零影响 */ }
    return config
  }
  return ctx.on('agent/request', handler)
}
