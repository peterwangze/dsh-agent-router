// FIX-052 判别测试：预设作用域统计归属错乱修复——归属键重构为**会话预设身份不变量**。
//
// 用户报障（2026-09-18）：
//   ① novel-writing 预设（小说工作流）的调用量被记入 governance 桶——novel 子代理
//      模型 glm-5.3-flash 自 09-16 起 1449/466/1160 次/日全入 `governance|subagent`；
//   ② 治理工作流近期用量漏统计——`governance|main` 自 09-14 起恒 0，本会话 402 次
//      main 调用全记 standard 桶；
//   ③ 时间线与用户重装 governance 预设（09-13 15:42）吻合（settings.yaml 存在
//      `agent-presets.default: standard`）。
//
// 根因（EV-217 机证）：归属键依赖**可变量**——`composedPreset(agent.ctx)`（宿主 live
// 挂载匹配）为权威源 + `header.agentPreset` 冻结快照兜底，两源都随预设重装 / 部署
// 默认（agent-presets.default）/ 全局选择漂移。
//
// 用户裁决的设计原则（MUST）：归属键 MUST 绑定工作流身份不变量 = **会话自身的预设
// 身份**（由该会话自己的 agent-preset/selected 事件链维护）；禁止依赖 live 挂载 /
// 部署默认 / 全局选择等可变量。
//
// 宿主面锚定（P10-④：实读宿主 checkout 源码，非心智模型；锚点一律取**导出名/
// 符号名**——行号式锚按本仓 9h 锚清扫纪律不入仓文本，实读行号见本批交付报告）：
//   - 罗盘 live 解析（公开面）：`@deepseek-ai/dsh-agent-presets` 服务方法
//     `composedPreset(agentCtx) { return standingMountFor(agentCtx)?.presetId }`；
//     同包内部符号 `standingMountFor(agentCtx)` =
//     `livePresetMounts().find((candidate) => candidate.key === standingKey)`——
//     **运行时挂载状态扫描**（预设重装 → 匹配失效/改指 = 漂移源，本文件扰动 A）；
//   - `agent-preset/selected` 载荷形状：同包 `AgentPresets` 服务的 `session/event`
//     订阅里 `ctx.emit("agent-preset/selected", session.id, event.data.agentPreset)`
//     ——**双参 (sessionId, agentPreset) 非 scoped 事件**（签名锚：同包类型面
//     `'agent-preset/selected'(sessionId: SessionId, agentPreset: string): void`；
//     追加点 `agent.session.append("agent-preset/selected", { agentPreset: preset.id })`）；
//     故本文件事件分发严格双参调用（扰动 C）；
//   - 子代理 header 的 agentPreset 由父 **live 罗盘**现写：`@deepseek-ai/dsh-subagent`
//     导出 `childSessionMeta(parent, childDepth, isSeeded)`：
//     `const agentPreset = parent.ctx.get("agentPresets")?.composedPreset(parent.ctx)`
//     并落 `parentSession: parentHeader.id`（宿主语义：子代理 join 父预设）——D1 的
//     子代理 fixture 与"父身份继承"判别锚；
//   - 部署默认是 settings 热读：同包 `AgentPresets` 的 `get defaultId()` getter
//     `{ return this.settings?.get().default ?? this.config.default }`
//     ——对本插件不可见，只经罗盘/创建头渗出（扰动 B）；
//   - 测试桩保真纪律（FIX-023 先例）：真实插件 ctx 只有 inject 声明过的服务名才有
//     属性面，本插件 inject 未含 'agents' → stub 不提供 `agents` 属性，注册表仅经
//     `ctx.get('agents')` 解析；compass 仅经 `ctx.get('agentPresets')` 解析。
//
// TDD（RED 先行，本文件先于实现落盘）：修复前跑批，A1/A2/A3/B2/C1/C2/D1/D2/E3/E4
// 等归属与诊断断言必败（旧实现 = live 罗盘优先）——RED 判别力证据；实现后全绿。
//
// 验收对照（TRIAGE-FIX-052）：①归属键 = 会话身份（映射单点 + header 兜底，live 罗盘
// 非权威）②三类扰动判别测试零漂移 ③novel-writing / governance / standard 三桶正例
// ④诊断可观测（preset-attribution-divergence）⑤映射有界（LRU）。
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

let failures = 0
function check(label, condition, detail) {
  if (condition) console.log(`  ok  ${label}`)
  else {
    failures++
    console.error(`FAIL  ${label}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`)
  }
}

/** 断言执行器：返回 true = 通过；返回对象/字符串 = 失败详情；抛错 = 失败（附消息）。 */
async function step(label, fn) {
  try {
    const outcome = await fn()
    if (outcome === true) check(label, true)
    else check(label, false, outcome)
  } catch (error) {
    check(label, false, String(error?.stack ?? error))
  }
}

// 目标模块（动态导入：导出缺失时 RED 仍可计数）。
let installPresetDefaults = null
let installRequestTelemetry = null
let presetDiagnostics = null
let SESSION_PRESET_LIMIT = null
let sessionPresetIdentityOf = null
let importFailure = null
try {
  ;({ installPresetDefaults, installRequestTelemetry, presetDiagnostics, SESSION_PRESET_LIMIT, sessionPresetIdentityOf } = await import(
    pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'preset-defaults.js')).href
  ))
} catch (error) {
  importFailure = error
}
const ready = () => typeof installPresetDefaults === 'function' && typeof installRequestTelemetry === 'function'

// ── 夹具（宿主面锚定见文件头）─────────────────────────────────────────────
const ROUTE = { provider: 'glm-local-router', model: 'glm-5.3-flash' }

/**
 * 伪宿主 ctx：事件注册捕获 + 服务面。保真纪律同 tests/preset-defaults.mjs
 * （FIX-023）：无 `agents` 属性面、无 `agentPresets` 属性面——全部经 ctx.get 解析。
 */
function makeCtx({ agentPresets } = {}) {
  const listeners = {}
  const logger = { warnCalls: [], infoCalls: [], warn(message) { this.warnCalls.push(String(message)) }, info(message) { this.infoCalls.push(String(message)) } }
  return {
    listeners,
    logger,
    on(event, handler) {
      ;(listeners[event] ??= []).push(handler)
      return () => { listeners[event] = (listeners[event] ?? []).filter((entry) => entry !== handler) }
    },
    emit() { /* 客户端转发面（本任务不涉及） */ },
    get(key) {
      if (key === 'agentPresets') return agentPresets
      return undefined
    },
  }
}

/**
 * 判别装置：**同一 ctx 上按 `lib/index.js` 的真实装配顺序**安装
 * installPresetDefaults（身份播种订阅）+ installRequestTelemetry（归属消费），
 * 使身份映射与遥测解析走同一条真实路径（不是为测试定制的第二实现）。
 * compass 可运行时翻转（模拟预设重装 / 部署默认变更 / 挂载扫描漂移）。
 */
function makeRig({ compassPreset = '', stats } = {}) {
  const scopes = []
  const state = { compassPreset, compassThrows: false }
  const agentPresets = {
    composedPreset() {
      if (state.compassThrows) throw new Error('compass boom')
      return state.compassPreset || undefined
    },
  }
  const ctx = makeCtx({ agentPresets })
  const service = {
    isEnabled: () => true,
    presetDefaults: () => ({}),
    stats: { recordScope: (event) => { scopes.push(event); stats?.recordScope?.(event) } },
  }
  installPresetDefaults(ctx, service)
  installRequestTelemetry(ctx, service)
  const handlerOf = (event) => (ctx.listeners[event] ?? [])[0]
  return {
    ctx,
    scopes,
    state,
    /** agent/created（payload {agent}——宿主 dsh-agent announce 面）。 */
    created: async (agent) => handlerOf('agent/created')({ agent }),
    /** agent-preset/selected(sessionId, agentPreset)——双参非 scoped（宿主 `session/event` 转发点）。 */
    selected: async (sessionId, agentPreset) => handlerOf('agent-preset/selected')(sessionId, agentPreset),
    /** agent/request（只读旁路——next() 交付实际路由）。 */
    request: async (agent, config = { ...ROUTE }) => handlerOf('agent/request')({ agent }, async () => config),
    diag: (sessionId, kind) => presetDiagnostics().entries.filter((entry) => entry.session === sessionId && (kind === undefined || entry.kind === kind)),
  }
}

/** 主会话 fixture：session.header = 创建期冻结快照（agentPreset）+ events（空白判据面）。 */
const mainAgent = (id, preset, { events = [] } = {}) => ({
  options: {},
  session: { id, header: { origin: 'main', agentPreset: preset }, events },
})

/** 子代理 fixture：header 形状锚 dsh-subagent 导出 `childSessionMeta`（origin/parentSession/agentPreset）。 */
const childAgent = (id, { preset, parentSession }) => ({
  options: {},
  session: { id, header: { origin: 'subagent', agentPreset: preset, parentSession, delegationDepth: 1 }, events: [] },
})

const presetRows = (scopes) => scopes.map((row) => `${row.preset}|${row.origin}`)

console.log('FIX-052 preset attribution — session preset identity invariant (RED until refactored):')

// ── 扰动 A：预设重装（live 罗盘翻转 / 失效 / 抛错 → 归属零漂移）───────────────
// 事实链：罗盘 standingMountFor = livePresetMounts() 运行时扫描（宿主内部符号），
// 预设重装后匹配失效或改指他处——旧实现（罗盘优先）在此把 novel 会话写进 governance
// 桶（报障①）。新实现归属键 = 会话身份（创建头播种）→ 罗盘怎么变都不动。
{
  await step('A1 扰动 A（罗盘翻转 novel→governance）：归属零漂移 = 会话身份 novel-writing（旧实现必败 RED）', async () => {
    const rig = makeRig({ compassPreset: 'governance' })
    const agent = mainAgent('fix052-a1', 'novel-writing')
    await rig.created(agent)
    await rig.request(agent)
    const ok = rig.scopes.length === 1 && rig.scopes[0].preset === 'novel-writing' && rig.scopes[0].origin === 'main'
      && rig.scopes[0].provider === ROUTE.provider && rig.scopes[0].model === ROUTE.model
    return ok || { rows: presetRows(rig.scopes), route: rig.scopes[0] }
  })

  await step('A2 扰动 A 续（罗盘解析失效 → undefined）：归属仍走会话身份（创建头 governance 已被选中事件改写为 novel-writing——身份 ≠ 兜底头，旧实现必败 RED）', async () => {
    const rig = makeRig({ compassPreset: 'governance' })
    const agent = mainAgent('fix052-a2', 'governance') // 创建头（冻结快照）= governance
    await rig.created(agent)
    await rig.selected('fix052-a2', 'novel-writing') // 该会话自己的预设事件链 → 身份 = novel-writing
    rig.state.compassPreset = '' // 重装后挂载失配（宿主 standingMountFor 的 livePresetMounts() find 落空）→ composedPreset undefined
    await rig.request(agent)
    return (rig.scopes.length === 1 && rig.scopes[0].preset === 'novel-writing') || { rows: presetRows(rig.scopes) }
  })

  await step('A3 扰动 A 续（罗盘抛错）：归属仍走会话身份 + 请求链零影响（config 透传）（旧实现必败 RED）', async () => {
    const rig = makeRig({ compassPreset: 'governance' })
    const agent = mainAgent('fix052-a3', 'governance')
    await rig.created(agent)
    await rig.selected('fix052-a3', 'novel-writing')
    rig.state.compassThrows = true
    const config = { ...ROUTE }
    const out = await rig.request(agent, config)
    return (rig.scopes.length === 1 && rig.scopes[0].preset === 'novel-writing' && out === config) || { rows: presetRows(rig.scopes), sameConfig: out === config }
  })
}

// ── 扰动 B：部署默认变更（agent-presets.default 改指 → 已建立会话归属不动）────
// 事实链：defaultId = settings 热读（宿主 `AgentPresets.defaultId` getter）；本插件不可见该 setting，
// 其影响只经罗盘/创建头渗出。已建立会话的归属 MUST 不随默认漂移。
{
  await step('B1 对照（默认未变，罗盘与身份一致）：归属 governance 且零 divergence 诊断', async () => {
    const rig = makeRig({ compassPreset: 'governance' })
    const agent = mainAgent('fix052-b1', 'governance')
    await rig.created(agent)
    await rig.request(agent)
    const diverged = rig.diag('fix052-b1', 'preset-attribution-divergence')
    return (rig.scopes.length === 1 && rig.scopes[0].preset === 'governance' && diverged.length === 0)
      || { rows: presetRows(rig.scopes), diverged: diverged.length }
  })

  await step('B2 扰动 B（部署默认 governance→standard）：已建立会话归属仍 governance + 漂移可观测（旧实现必败 RED）', async () => {
    const rig = makeRig({ compassPreset: 'governance' })
    const agent = mainAgent('fix052-b2', 'governance')
    await rig.created(agent)
    rig.state.compassPreset = 'standard' // 部署默认改指（settings.yaml agent-presets.default）
    await rig.request(agent)
    const diverged = rig.diag('fix052-b2', 'preset-attribution-divergence')
    const ok = rig.scopes.length === 1 && rig.scopes[0].preset === 'governance' && diverged.length === 1
      && String(diverged[0].detail ?? '').includes('standard')
    return ok || { rows: presetRows(rig.scopes), diverged: diverged.map((entry) => entry.detail) }
  })
}

// ── 扰动 C：全局选择切换（agent-preset/selected 只更新其所属会话）──────────────
// 事实链：宿主把该会话自己追加的 agent-preset/selected 事实重发为 cordis 双参事件
//（宿主 `session/event` → `ctx.emit` 转发）——归属键唯一权威更新源；另一会话身份 MUST 不受影响。
{
  await step('C1 扰动 C（选中事件只动本会话）：C1 governance→standard，C2 novel-writing 纹丝不动', async () => {
    const rig = makeRig({ compassPreset: 'novel-writing' })
    const c1 = mainAgent('fix052-c1', 'governance')
    const c2 = mainAgent('fix052-c2', 'novel-writing')
    await rig.created(c1)
    await rig.created(c2)
    await rig.selected('fix052-c1', 'standard')
    await rig.request(c1)
    await rig.request(c2)
    const ok = rig.scopes.length === 2 && rig.scopes[0].preset === 'standard' && rig.scopes[1].preset === 'novel-writing'
    return ok || { rows: presetRows(rig.scopes) }
  })

  await step('C2 扰动 C 反向（C2 → governance）：C1 仍是 standard（无跨会话串扰）', async () => {
    const rig = makeRig({ compassPreset: 'standard' })
    const c1 = mainAgent('fix052-c3a', 'governance')
    const c2 = mainAgent('fix052-c3b', 'novel-writing')
    await rig.created(c1)
    await rig.created(c2)
    await rig.selected('fix052-c3a', 'standard')
    await rig.selected('fix052-c3b', 'governance')
    await rig.request(c1)
    await rig.request(c2)
    // 顺序无关判定：按 session 维度核对
    const bySession = new Map([['fix052-c3a', rig.scopes[0]?.preset], ['fix052-c3b', rig.scopes[1]?.preset]])
    const ok = rig.scopes.length === 2 && bySession.get('fix052-c3a') === 'standard' && bySession.get('fix052-c3b') === 'governance'
    return ok || { rows: presetRows(rig.scopes) }
  })
}

// ── D. 三桶正例（novel-writing / governance / standard——报障场景复刻）────────
{
  await step('D1 novel 桶：父 novel-writing + 子代理头被宿主 live 罗盘污染成 governance → 子继承父身份归 novel-writing（旧实现必败 RED）', async () => {
    const rig = makeRig({ compassPreset: 'governance' })
    const parent = mainAgent('fix052-d1p', 'novel-writing')
    // 子头 agentPreset = 宿主 childSessionMeta 现写的父 live 罗盘值（dsh-subagent 导出名锚）——可变量
    const child = childAgent('fix052-d1c', { preset: 'governance', parentSession: 'fix052-d1p' })
    await rig.created(parent)
    await rig.created(child)
    await rig.request(parent)
    await rig.request(child, { provider: 'glm-local-router', model: 'glm-5.3-flash' })
    const ok = rig.scopes.length === 2
      && rig.scopes[0].preset === 'novel-writing' && rig.scopes[0].origin === 'main'
      && rig.scopes[1].preset === 'novel-writing' && rig.scopes[1].origin === 'subagent'
      && rig.scopes[1].model === 'glm-5.3-flash'
    return ok || { rows: presetRows(rig.scopes), origins: rig.scopes.map((row) => row.origin) }
  })

  await step('D2 governance 桶：创建头 standard（部署默认冻结）+ 用户选择事件切 governance → 归 governance（旧实现必败 RED）', async () => {
    const rig = makeRig({ compassPreset: 'standard' })
    const agent = mainAgent('fix052-d2', 'standard')
    await rig.created(agent)
    await rig.selected('fix052-d2', 'governance')
    await rig.request(agent)
    return (rig.scopes.length === 1 && rig.scopes[0].preset === 'governance' && rig.scopes[0].origin === 'main') || { rows: presetRows(rig.scopes) }
  })

  await step('D3 standard 桶：无切换事件的 standard 会话归 standard（罗盘改报他值不夺权）（旧实现必败 RED）', async () => {
    const rig = makeRig({ compassPreset: 'governance' })
    const agent = mainAgent('fix052-d3', 'standard')
    await rig.created(agent)
    await rig.request(agent)
    return (rig.scopes.length === 1 && rig.scopes[0].preset === 'standard') || { rows: presetRows(rig.scopes) }
  })

  await step('D4 无身份会话（无创建头 + 无事件）→ live 罗盘最后兜底 + 降级可观测（preset-attribution-live-fallback）', async () => {
    const rig = makeRig({ compassPreset: 'novel-writing' })
    const agent = mainAgent('fix052-d4', '')
    await rig.created(agent)
    await rig.request(agent)
    const fallback = rig.diag('fix052-d4', 'preset-attribution-live-fallback')
    const ok = rig.scopes.length === 1 && rig.scopes[0].preset === 'novel-writing' && fallback.length === 1
    return ok || { rows: presetRows(rig.scopes), diag: presetDiagnostics().entries.filter((entry) => entry.session === 'fix052-d4') }
  })

  await step('D5 身份与罗盘皆不可解析 → preset 空串记录（不猜；D7 既有语义保持）+ 无 header 零记录不炸', async () => {
    const rig = makeRig({ compassPreset: '' })
    const agent = mainAgent('fix052-d5', '')
    await rig.created(agent)
    await rig.request(agent)
    await rig.request({ session: {} })
    return (rig.scopes.length === 1 && rig.scopes[0].preset === '' && rig.scopes[0].origin === 'main') || { rows: presetRows(rig.scopes) }
  })
}

// ── E. 有界与防御（映射有界 / 空值不覆盖 / 诊断有界 / 主权）──────────────────
{
  await step('E1 会话身份映射有界（LRU）：超限淘汰最旧 → 被淘汰会话回落创建头兜底（行为级判别）', async () => {
    if (!Number.isFinite(SESSION_PRESET_LIMIT) || SESSION_PRESET_LIMIT <= 0) return { limit: SESSION_PRESET_LIMIT }
    const rig = makeRig({ compassPreset: '' })
    const ancient = mainAgent('fix052-e1', 'governance') // 创建头 governance
    await rig.created(ancient)
    await rig.selected('fix052-e1', 'novel-writing') // 身份更新为 novel-writing（≠ 创建头）
    for (let index = 0; index < SESSION_PRESET_LIMIT; index++) {
      await rig.created(mainAgent(`fix052-flood-${index}`, 'standard'))
    }
    await rig.request(ancient)
    // 超限淘汰最旧 → 身份丢失 → 回落创建头 governance（回落路径可用 + 内存有界）
    const ok = rig.scopes.length === 1 && rig.scopes[0].preset === 'governance'
    return ok || { rows: presetRows(rig.scopes), limit: SESSION_PRESET_LIMIT }
  })

  await step('E2 空预设事件值不覆盖已建立身份（防御：身份只被真实预设值改写）', async () => {
    const rig = makeRig({ compassPreset: 'standard' })
    const agent = mainAgent('fix052-e2', 'novel-writing')
    await rig.created(agent)
    await rig.selected('fix052-e2', '')
    await rig.request(agent)
    return (rig.scopes.length === 1 && rig.scopes[0].preset === 'novel-writing') || { rows: presetRows(rig.scopes) }
  })

  await step('E3 divergence 诊断有界（同会话同漂移对去重恰 1 条；换会话产生新条目）', async () => {
    const rig = makeRig({ compassPreset: 'governance' })
    const agent = mainAgent('fix052-e3a', 'novel-writing')
    const other = mainAgent('fix052-e3b', 'standard')
    await rig.created(agent)
    await rig.created(other)
    await rig.request(agent)
    await rig.request(agent)
    await rig.request(agent)
    await rig.request(other)
    const first = rig.diag('fix052-e3a', 'preset-attribution-divergence')
    const second = rig.diag('fix052-e3b', 'preset-attribution-divergence')
    const ok = first.length === 1 && second.length === 1 && rig.scopes.length === 4
      && rig.scopes[0].preset === 'novel-writing' && rig.scopes[3].preset === 'standard'
    return ok || { first: first.length, second: second.length, rows: presetRows(rig.scopes) }
  })

  await step('E4 主权：归属解析重构后 config 仍原样透传（只读旁路零修改）', async () => {
    const rig = makeRig({ compassPreset: 'governance' })
    const agent = mainAgent('fix052-e4', 'novel-writing')
    await rig.created(agent)
    const config = { provider: 'p', model: 'm', reasoningEffort: 'high', maxTokens: 4096 }
    const out = await rig.request(agent, config)
    return (out === config && out.reasoningEffort === 'high' && out.maxTokens === 4096) || { same: out === config }
  })
}

// ── F. 端到端三桶（遥测站点 → 真实 StatsStore 预设视图 = 报障症状面）──────────
// 归属决策（D 组）之后一路走到用户看见的桶：recordScope → #foldScope →
// snapshot().presetStats。三个桶名 MUST 恰为三会话各自的预设身份，漂移罗盘
// 既不夺权也不额外造桶（报障①「novel 记入 governance」/②「governance 记入
// standard」的症状面判别）。
{
  await step('F1 端到端（真实 StatsStore）：novel-writing 主 1 + 子 1 / governance 主 1 / standard 主 1，且零漂移桶', async () => {
    const { StatsStore } = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'stats.js')).href)
    const store = new StatsStore({ dir: 'fix052-e2e-memory', persist: false }) // 纯内存（零磁盘写入）
    const rig = makeRig({ compassPreset: 'governance', stats: store }) // 罗盘全局漂移
    const novelParent = mainAgent('fix052-f1p', 'novel-writing')
    const novelChild = childAgent('fix052-f1c', { preset: 'governance', parentSession: 'fix052-f1p' })
    const gov = mainAgent('fix052-f1g', 'standard')
    const std = mainAgent('fix052-f1s', 'standard')
    await rig.created(novelParent)
    await rig.created(novelChild)
    await rig.created(gov)
    await rig.created(std)
    await rig.selected('fix052-f1g', 'governance')
    await rig.request(novelParent)
    await rig.request(novelChild)
    await rig.request(gov)
    await rig.request(std)
    const rows = new Map(store.snapshot().presetStats.map((row) => [row.preset, row]))
    const novel = rows.get('novel-writing')
    const governance = rows.get('governance')
    const standard = rows.get('standard')
    const ok = rows.size === 3 && !!novel && novel.main.calls === 1 && novel.subagent.calls === 1
      && !!governance && governance.main.calls === 1 && governance.subagent.calls === 0
      && !!standard && standard.main.calls === 1
    return ok || { buckets: [...rows.entries()].map(([preset, row]) => `${preset}:main=${row.main?.calls}/sub=${row.subagent?.calls}`) }
  })
}

// ── G. 源码契约（单点 / 解析链顺序——防复活守卫）─────────────────────────────
{
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'preset-defaults.js'), 'utf8')
  check('G1 罗盘读取单点：lib/preset-defaults.js 中 composedPreset(agent?.ctx) 恰 1 处（消费点不再内联第二份）',
    (source.match(/composedPreset\(agent\?\.ctx\)/g) ?? []).length === 1,
    (source.match(/composedPreset\(agent\?\.ctx\)/g) ?? []).length)

  check('G2 会话身份注册表导出在册（noteSessionPresetIdentity / sessionPresetIdentityOf / SESSION_PRESET_LIMIT）',
    typeof sessionPresetIdentityOf === 'function' && typeof SESSION_PRESET_LIMIT === 'number'
      && /export function noteSessionPresetIdentity\(/.test(source) && /export const SESSION_PRESET_LIMIT/.test(source),
    { identityOf: typeof sessionPresetIdentityOf, limit: SESSION_PRESET_LIMIT })

  const body = source.slice(source.indexOf('export function installRequestTelemetry'))
  const identityAt = body.indexOf('sessionPresetIdentityOf(')
  const liveAt = body.indexOf('liveCompassPresetOf(')
  check('G3 遥测解析链源码顺序：会话身份先于 live 罗盘，且遥测体内零内联罗盘解析（旧实现必败 RED）',
    identityAt >= 0 && liveAt >= 0 && identityAt < liveAt && !/agentPresetsServiceOf\(ctx\)/.test(body),
    { identityAt, liveAt, inlined: /agentPresetsServiceOf\(ctx\)/.test(body) })
}

console.log(failures === 0 ? '\nALL FIX-052 DISCRIMINANT TESTS PASSED' : `\n${failures} FIX-052 ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
