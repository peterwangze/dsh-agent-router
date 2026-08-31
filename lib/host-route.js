/**
 * EVO-010：ChatGPT 主模型迁移宿主官方 openai-codex 路由——插件从「手写协议层」
 * 转型为「凭据桥 + 路由维护者」（实施依据 .governance/arch-003-bridge-poc.md
 * 实施要点五条 + 真机 PoC 实测）。
 *
 * 职责（单一边界）：
 * ① 路由自动维护：宿主 settings `llm-pi-ai` ns 的
 *    `providers['openai-codex'] = { apiKeyEnv: 'DSH_ROUTER_OPENAI_CODEX' }`
 *    条目按账号状态自动落位/清理（幂等、尊重用户手改、接管 PoC 条目）。
 * ② token 热注入（唯一刷新者）：插件凭据刷新器（oauth-credentials 既有链）
 *    到期前刷新 → 新 access token 写宿主凭据 ref——插件是唯一刷新者，绝不
 *    触碰 pi-ai grant-record 通道（不调 modifyRecord，天然单写者）。
 * ③ transport 降级链：账号级 `transport: 'host' | 'plugin'`（默认 host）；
 *    plugin 账号排除出路由维护；连续失败达阈值 → 诊断事件 + 设置页提示，
 *    不静默改用户配置字段（用户手切——用户主权，FIX-002 教训）。
 * ④ P9 parity 守卫：写入后探活 `llm.resolveModelInfo('openai-codex', …)`
 *    必须返回目录事实形状，失败 → 回滚条目 + warn + 降级计数（fail-closed，
 *    防宿主升级破坏静默）。
 *
 * seam 事实（ Coordinator 一手取证，2026-08-31）：
 * - settings.mutate：dsh-settings lib/index.js:430-436 `{op:'set'|'unset',
 *   path:[string]}` path-op；write()（:439-470）无跨 ns 属主限制——注册 ns
 *   均可写，写前按该 ns schema（llm-pi-ai Config：providers dict，apiKeyEnv
 *   role credential-ref）+ assertServiceable 校验，非法即 reject。
 * - credentials：dsh-credentials-local resolve(:473)/set(:513)/unset(:517)；
 *   ref 形如 POSIX shell 标识符（DSH_ROUTER_OPENAI_CODEX 合法）。resolve 每
 *   请求活读——set 后下一请求即生效，零重启（dsh-llm-pi-ai :1714/:2408 双证）。
 * - 目录路由：`providers['openai-codex'] = { apiKeyEnv }` 不写 api 字段 →
 *   reuseCatalogProvider（llm-pi-ai :803）保留 pi-ai 官方 openai-codex 实现
 *   （chatgpt.com/backend-api/codex/responses + ChatGPT 头全套 + 自动刷新锁
 *   不启用——harnessApiKeyAuth override 供静态 JWT）；routeAuth（:768-775）
 *   对无 apiKey 方法的目录 provider 自动追加凭据 override。
 *
 * P9 parity 判别面：`resolveModelInfo` 经 PiAiAdapter.resolveModel → 目录
 * 事实（data/openai-codex.json：contextWindow/价格/compat）。**context.
 * contextWindow 正整数 = 内置目录形状**——插件手写适配器（oauth-llm.js
 * resolveModel）只返回 provider/id/name/inputModalities、无 context 字段，
 * 构成「官方目录实现 vs 裸适配器」的机器可判别差异。listModels/resolveModel
 * 均为宿主进程内目录解析（零网络），每 tick 探活开销可忽略。
 *
 * 写→探→回滚（设计披露）：resolveModelInfo 需路由已注册（registration(
 * provider)），无法先探后写——采用「写条目 → 探活 → 失败回滚（恢复原值/
 * unset）」，最终态等价「不写条目」；瞬时窗口亚秒级且条目回滚后不可达。
 * 失败计数由周期 tick（默认 30s）自愈：宿主升级后目录恢复 → 下一个 tick
 * 自动重建条目。
 *
 * P7 红线：本模块日志/事件/状态面永不携带 access/refresh token 值。
 * @module dsh-agent-router/host-route
 */
import { normalizeTransport } from './schemas.js'

/** 宿主 llm-pi-ai settings namespace（dsh-llm-pi-ai:2344 `name` 一手事实）。 */
export const HOST_ROUTE_NS = 'llm-pi-ai'
/** 官方目录路由 provider id（pi-ai 内置目录，禁写 api 字段）。 */
export const HOST_ROUTE_PROVIDER = 'openai-codex'
/** 插件维护的宿主凭据 ref（正式命名规范）。 */
export const HOST_ROUTE_REF = 'DSH_ROUTER_OPENAI_CODEX'
/** ARCH-003 PoC 注入的 ref（真机 PoC 手工步骤产品化——检测到即接管迁移）。 */
export const HOST_ROUTE_POC_REF = 'DSH_ROUTER_POC_OPENAI_CODEX'
/** token 注入临期阈值：剩余寿命 ≤ 60s 触发刷新后注入（任务常量）。 */
export const HOST_TOKEN_REFRESH_MARGIN_MS = 60_000
/** 连续失败降级阈值：达到即发 host_route_degraded 事件 + 设置页提示。 */
export const HOST_ROUTE_FAILURE_THRESHOLD = 3
/** 后台维护 tick 周期（毫秒；service.hostRouteTickMs 可注入覆盖，测试提速）。 */
export const HOST_ROUTE_TICK_MS = 30_000

/**
 * 启用中的 ChatGPT 订阅账号（enabled!==false 且 preset/协议匹配）。
 * 单一事实源：oauth-llm.js 的同名谓词迁移至此（oauth-llm 反向导入），消除
 * service → host-route → oauth-llm → service 的 ESM 环。
 */
export function enabledPresetAccounts(service) {
  const state = typeof service?.getState === 'function' ? service.getState() : null
  const accounts = state && typeof state.oauthAccounts === 'object' && state.oauthAccounts ? state.oauthAccounts : {}
  const out = []
  for (const [id, account] of Object.entries(accounts)) {
    if (!account || typeof account !== 'object') continue
    if (account.enabled === false) continue
    const preset = typeof account.preset === 'string' && account.preset.trim() ? account.preset.trim() : ''
    const protocol = typeof account.protocol === 'string' ? account.protocol : ''
    if (preset !== 'chatgpt-codex' || protocol !== 'codex-responses') continue
    out.push({ id, account })
  }
  return out
}

/**
 * 参与宿主路由维护的启用账号（transport 归一后非 'plugin'），按 settings
 * 键序取首个。单一 ref 只能持有一个账号的 JWT（chatgpt-account-id 头由
 * pi-ai 从 JWT 提取）——多账号时确定性选择首个并经状态面 accountId 披露。
 */
export function selectHostAccount(service) {
  for (const entry of enabledPresetAccounts(service)) {
    if (normalizeTransport(entry.account.transport) === 'host') return entry
  }
  return null
}

/**
 * 路由条目变更计划（纯函数，判别测试直驱）。
 * @param currentEntry - llm-pi-ai providers['openai-codex'] 现值（undefined =
 *   不存在）。
 * @param options - { maintain: boolean, ref: string }。
 * @returns {action, ops, poc?}：action ∈ create/idle/update/migrate/unset/
 *   clear-poc/user-modified。ops 为 settings.mutate(HOST_ROUTE_NS) 的 path-op
 *   列表（可能为空 = 幂等零写入）。user-modified（用户手改：额外字段或外来
 *   ref）→ 恒零 ops（尊重用户手改，双向都不覆盖）；poc=true 提示调用方清理
 *   PoC 凭据 ref（credentials.unset）。
 */
export function planHostRouteMutation(currentEntry, { maintain, ref }) {
  const path = ['providers', HOST_ROUTE_PROVIDER]
  const entryIsObject = !!currentEntry && typeof currentEntry === 'object' && !Array.isArray(currentEntry)
  const keys = entryIsObject ? Object.keys(currentEntry) : []
  const currentRef = entryIsObject && typeof currentEntry.apiKeyEnv === 'string' ? currentEntry.apiKeyEnv : ''
  // 插件维护面 = 无条目 / 空条目 / 恰为 { apiKeyEnv: 正式 ref } / 恰为
  // { apiKeyEnv: PoC ref }。其余（额外字段、外来 ref）= 用户手改。
  const isOurs = entryIsObject && keys.every((key) => key === 'apiKeyEnv') && currentRef === ref
  const isPoc = entryIsObject && keys.every((key) => key === 'apiKeyEnv') && currentRef === HOST_ROUTE_POC_REF
  const owned = !entryIsObject || keys.length === 0 || isOurs || isPoc
  if (!owned) {
    // 用户手改（指向自己的 ref、加 models/baseURL/api 等）：尊重手改，不覆盖
    // 不删除，由调用方记诊断事件（P8 可观测）。
    return { action: 'user-modified', ops: [] }
  }
  if (maintain) {
    if (!entryIsObject || keys.length === 0) return { action: isOurs ? 'idle' : 'create', ops: isOurs ? [] : [{ op: 'set', path, value: { apiKeyEnv: ref } }] }
    if (isOurs) return { action: 'idle', ops: [] }
    // PoC 遗留条目（ARCH-003 真机 PoC 手工注入）→ 接管迁移到正式 ref，
    // 避免双条目双 ref 漂移；调用方随后清理 PoC 凭据 ref。
    return { action: 'migrate', ops: [{ op: 'set', path, value: { apiKeyEnv: ref } }], poc: true }
  }
  if (!entryIsObject || keys.length === 0) return { action: 'idle', ops: [] }
  // 停用方向：自有条目 unset；PoC 遗留条目 unset + PoC 凭据 ref 清理。
  return isOurs
    ? { action: 'unset', ops: [{ op: 'unset', path }] }
    : { action: 'clear-poc', ops: [{ op: 'unset', path }], poc: true }
}

/** 进程内路由维护状态（catalog 状态面数据源；永不携带 token 值）。 */
export function createHostRouteState() {
  return {
    maintained: false,
    accountId: '',
    tokenInjected: 'off', // 'ok' | 'failed' | 'off'
    failures: 0,
    degraded: false,
    degradedNoticed: false,
    notice: '',
    lastAction: '',
  }
}

/** 连续失败计数（P8）：达到阈值发一次降级事件 + 提示（不静默改配置）。 */
function recordHostRouteFailure(ctx, service, reason) {
  const state = service.hostRouteState
  state.failures += 1
  state.notice = `宿主官方路由连续失败 ${state.failures} 次（${reason}）——已回退插件内置通路，可在账号卡手动切换「调用通路」`
  try {
    service.recordHostRouteEvent('host_route_maintain_fail', { reason, failures: state.failures })
  } catch { /* 事件面尽力而为 */ }
  if (state.failures >= HOST_ROUTE_FAILURE_THRESHOLD && !state.degradedNoticed) {
    state.degraded = true
    state.degradedNoticed = true
    try {
      service.recordHostRouteEvent('host_route_degraded', { failures: state.failures, reason })
    } catch { /* 尽力而为 */ }
    ctx.logger?.warn?.(`dsh-agent-router: openai-codex host route degraded after ${state.failures} consecutive failures (${reason}); plugin transport remains available — switch 调用通路 in the account card if desired`)
  }
  else {
    ctx.logger?.warn?.(`dsh-agent-router: openai-codex host route failure (${reason}); consecutive failures = ${state.failures}`)
  }
}

/** 失败清零（任何一次完整成功即复位连续计数与降级提示）。 */
function recordHostRouteSuccess(service) {
  const state = service.hostRouteState
  state.failures = 0
  state.degraded = false
  state.degradedNoticed = false
  state.notice = ''
}

/**
 * token 注入（diff-only）：ref 现值与 access 相同 → 零写入（幂等）；不同或
 * 不可读 → credentials.set。返回是否确有写入。
 */
export async function injectHostRouteToken(ctx, ref, access) {
  const credentials = ctx.get('credentials')
  if (!credentials || typeof credentials.set !== 'function') {
    throw new Error('credentials 服务不可用（无法注入宿主凭据 ref）')
  }
  if (typeof credentials.resolve === 'function') {
    try {
      const current = await credentials.resolve(ref)
      if (current && current.value === access) return false
    } catch { /* resolve 失败不阻断 set——set 是权威写入 */ }
  }
  await credentials.set(ref, access)
  return true
}

/**
 * 读取路由条目现值（settings.get 同步内存读；ns 未注册/读取失败 → undefined）。
 */
function readProvidersEntry(ctx) {
  const settings = ctx.get('settings')
  if (!settings || typeof settings.get !== 'function') return undefined
  const value = settings.get(HOST_ROUTE_NS)
  const providers = value && typeof value === 'object' ? value.providers : undefined
  return providers && typeof providers === 'object' ? providers[HOST_ROUTE_PROVIDER] : undefined
}

/**
 * P9 parity 探活：openai-codex 路由在宿主 llm 目录可达且返回内置目录形状。
 * 判别：listModels 非空 + resolveModelInfo 返回 context.contextWindow 正整数
 * （目录事实；手写适配器无 context 字段——见模块头）。失败 throw。
 */
export async function probeHostRoute(ctx) {
  const llm = ctx.get('llm')
  if (!llm || typeof llm.listModels !== 'function' || typeof llm.resolveModelInfo !== 'function') {
    throw new Error('宿主 llm 服务不可用（无法探活 openai-codex 目录路由）')
  }
  const models = await llm.listModels(HOST_ROUTE_PROVIDER)
  const first = Array.isArray(models) ? models.find((model) => model && typeof model.id === 'string' && model.id) : null
  if (!first) throw new Error('openai-codex 目录为空（宿主 pi-ai 内置 codex 目录缺失——疑似宿主升级破坏）')
  const info = await llm.resolveModelInfo(HOST_ROUTE_PROVIDER, first.id)
  const contextWindow = info && info.context && Number.isInteger(info.context.contextWindow) ? info.context.contextWindow : 0
  if (!(contextWindow > 0)) {
    throw new Error(`resolveModelInfo('openai-codex', '${first.id}') 缺少目录事实（contextWindow）——非官方 codex 目录形状（疑似宿主升级破坏）`)
  }
  return first.id
}

/**
 * 宿主路由维护一个完整 pass（幂等；tick / settings/updated / 登录联动共用）。
 * 序（maintain=true）：注入 token（先行——条目不得指向空 ref，PoC 教训）→
 * 计划条目变更并 mutate → 探活 parity → 失败回滚。maintain=false：计划清理
 * 并 mutate。user-modified：事件 + warn，不触碰。
 * @returns 维护后状态快照（hostRouteStatusOf 同形）。
 */
export async function syncHostRoute(ctx, service) {
  const state = service.hostRouteState ?? (service.hostRouteState = createHostRouteState())
  const warn = (message) => { try { ctx.logger?.warn?.(message) } catch { /* 尽力而为 */ } }
  const settings = ctx.get('settings')
  if (!settings || typeof settings.mutate !== 'function') {
    recordHostRouteFailure(ctx, service, 'settings 服务不可用')
    state.maintained = false
    state.tokenInjected = 'off'
    return hostRouteStatusOf(service)
  }
  const selected = selectHostAccount(service)
  const enabled = typeof service.isEnabled === 'function' ? service.isEnabled() : true
  let loggedIn = false
  if (enabled && selected) {
    try {
      loggedIn = await service.presetLoggedInOf(selected.account)
    } catch { loggedIn = false }
  }
  const maintain = enabled && !!selected && loggedIn
  state.accountId = maintain && selected ? selected.id : ''
  let previousEntry = readProvidersEntry(ctx)

  if (maintain) {
    // ① token 注入先行（唯一刷新者：值来自插件凭据文件；失败 fail-closed
    // 不写条目——条目指向空/陈旧 ref 即断路由）。
    try {
      const store = service.credentialStoreFor(selected.account)
      const cred = await store.read()
      if (!cred) throw new Error('凭据文件不可读（刚通过登录态检查即消失）')
      // 临期 → 走既有刷新链（文件锁串行 + rotating 覆写；成功后
      // afterPresetCredentialRefresh 钩子已注入新值）。
      if (cred.expires - Date.now() <= HOST_TOKEN_REFRESH_MARGIN_MS) {
        const fresh = await service.resolvePresetCredential(selected.account)
        await injectHostRouteToken(ctx, HOST_ROUTE_REF, fresh.access)
        state.tokenInjected = 'ok'
      } else if (await injectHostRouteToken(ctx, HOST_ROUTE_REF, cred.access)) {
        state.tokenInjected = 'ok'
        try { service.recordHostRouteEvent('host_route_token_injected', { accountId: selected.id }) } catch { /* 尽力而为 */ }
      } else {
        state.tokenInjected = 'ok'
      }
    } catch (error) {
      state.tokenInjected = 'failed'
      recordHostRouteFailure(ctx, service, `token 注入失败：${error && error.message ? error.message : String(error)}`)
      try { service.recordHostRouteEvent('host_route_token_inject_fail', { accountId: selected.id }) } catch { /* 尽力而为 */ }
      return hostRouteStatusOf(service)
    }
    // ② 条目计划 + 写入（记录前值供回滚）。
    previousEntry = readProvidersEntry(ctx)
    const plan = planHostRouteMutation(previousEntry, { maintain: true, ref: HOST_ROUTE_REF })
    if (plan.action === 'user-modified') {
      try { service.recordHostRouteEvent('host_route_user_modified', { accountId: selected.id }) } catch { /* 尽力而为 */ }
      warn(`dsh-agent-router: llm-pi-ai providers['${HOST_ROUTE_PROVIDER}'] 已被手动修改——尊重手改，跳过官方路由维护（可在设置 → 模型检查该条目）`)
      state.maintained = false
      state.lastAction = 'user-modified'
      return hostRouteStatusOf(service)
    }
    if (plan.ops.length > 0) {
      await settings.mutate(HOST_ROUTE_NS, plan.ops)
      state.lastAction = plan.action
      try { service.recordHostRouteEvent('host_route_maintained', { action: plan.action, accountId: selected.id }) } catch { /* 尽力而为 */ }
    }
    // ③ PoC 凭据 ref 清理（接管迁移后旧 ref 即死值；尽力而为不阻断）。
    if (plan.poc === true) {
      const credentials = ctx.get('credentials')
      if (credentials && typeof credentials.unset === 'function') {
        try { await credentials.unset(HOST_ROUTE_POC_REF) } catch (error) {
          warn(`dsh-agent-router: PoC 凭据 ref 清理失败（${HOST_ROUTE_POC_REF}）：${error && error.message ? error.message : String(error)}`)
        }
      }
      try { service.recordHostRouteEvent('host_route_poc_migrated', { accountId: selected.id, from: HOST_ROUTE_POC_REF }) } catch { /* 尽力而为 */ }
    }
    // ④ P9 parity 探活（写入后自证；失败回滚到前值——fail-closed）。
    try {
      await probeHostRoute(ctx)
    } catch (error) {
      const rollbackOps = previousEntry === undefined
        ? [{ op: 'unset', path: ['providers', HOST_ROUTE_PROVIDER] }]
        : [{ op: 'set', path: ['providers', HOST_ROUTE_PROVIDER], value: previousEntry }]
      try {
        await settings.mutate(HOST_ROUTE_NS, rollbackOps)
      } catch (rollbackError) {
        warn(`dsh-agent-router: parity 回滚失败：${rollbackError && rollbackError.message ? rollbackError.message : String(rollbackError)}`)
      }
      state.maintained = false
      recordHostRouteFailure(ctx, service, `parity 探活失败：${error && error.message ? error.message : String(error)}`)
      try { service.recordHostRouteEvent('host_route_parity_fail', { reason: error && error.message ? error.message.slice(0, 200) : '' }) } catch { /* 尽力而为 */ }
      return hostRouteStatusOf(service)
    }
    state.maintained = true
    recordHostRouteSuccess(service)
    return hostRouteStatusOf(service)
  }

  // maintain=false（无启用账号 / 全部 plugin / 未登录 / 总开关关）→ 清理条目。
  state.tokenInjected = 'off'
  const plan = planHostRouteMutation(previousEntry, { maintain: false, ref: HOST_ROUTE_REF })
  if (plan.action === 'user-modified') {
    state.maintained = false
    state.lastAction = 'user-modified'
    return hostRouteStatusOf(service)
  }
  if (plan.ops.length > 0) {
    await settings.mutate(HOST_ROUTE_NS, plan.ops)
    state.lastAction = plan.action
    state.maintained = false
    try { service.recordHostRouteEvent('host_route_maintained', { action: plan.action }) } catch { /* 尽力而为 */ }
  }
  if (plan.poc === true) {
    const credentials = ctx.get('credentials')
    if (credentials && typeof credentials.unset === 'function') {
      try { await credentials.unset(HOST_ROUTE_POC_REF) } catch { /* 尽力而为 */ }
    }
  }
  state.maintained = false
  recordHostRouteSuccess(service)
  return hostRouteStatusOf(service)
}

/**
 * 路由状态快照（catalog.openaiCodexRoute 数据源）：最近一次维护意图 +
 * 条目实时在场核验（settings.get 内存读）。永不携带 token 值（P7）。
 */
export function hostRouteStatusOf(service) {
  const state = service?.hostRouteState ?? createHostRouteState()
  let present = false
  try {
    const settings = typeof service?.ctx?.get === 'function' ? service.ctx.get('settings') : undefined
    const value = settings && typeof settings.get === 'function' ? settings.get(HOST_ROUTE_NS) : undefined
    const providers = value && typeof value === 'object' ? value.providers : undefined
    const entry = providers && typeof providers === 'object' ? providers[HOST_ROUTE_PROVIDER] : undefined
    present = !!entry && typeof entry === 'object' && entry.apiKeyEnv === HOST_ROUTE_REF
  } catch { present = false }
  return {
    maintained: state.maintained === true && present,
    ref: HOST_ROUTE_REF,
    accountId: typeof state.accountId === 'string' ? state.accountId : '',
    tokenInjected: state.tokenInjected === 'ok' || state.tokenInjected === 'failed' ? state.tokenInjected : 'off',
    degraded: state.degraded === true,
    failures: Number(state.failures) || 0,
    ...(typeof state.notice === 'string' && state.notice ? { notice: state.notice } : {}),
  }
}

/**
 * 后台维护 tick（service.startHostRouteMaintenance 的定时器回调）：完整 sync
 * pass，任何异常不外泄（P8：异常计入失败链路并 warn，循环永不中断）。
 */
export async function runHostRouteTick(ctx, service) {
  try {
    await syncHostRoute(ctx, service)
  } catch (error) {
    try {
      ctx.logger?.warn?.(`dsh-agent-router: host route tick failed: ${error && error.message ? error.message : String(error)}`)
      service.recordHostRouteEvent('host_route_maintain_fail', { reason: 'tick_error' })
    } catch { /* 尽力而为 */ }
    const state = service.hostRouteState
    if (state) state.failures += 1
  }
}
