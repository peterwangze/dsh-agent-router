/**
 * ARCH-004 域 1（设计 §4.3 域 1；EVO-019 B1 probe 面 + EVO-020 B2 迁域批）：
 * 客户端 remote.* 面——hostApiFace 本体的权威单点 + 能力探测 + 健康快照
 * （症状①主战场的 probe 面与降级面）。
 *
 * B2 迁域（§4.3 域 1 唯一入口 + §4.4 P5）：lib/client.js 的 hostApiFace
 * 本体（FIX-028 适配层：映射表/envelopeOf/faceOf/unavailable）整体迁入本
 * 文件落成 createClientRemotes(ctx)；同批 throw→degraded 语义翻转（面缺失/
 * 形状漂移/调用被拒 → 降级信封 + 诊断事件，§4.3 错误码三枚），lib/client.js
 * 内旧实现已删除（grep hostApiFace 零残留）。
 *
 * 浏览器镜像纪律（关键）：lib/client.js 为自包含浏览器包（__ModuleLoader__
 * 格式，仅 require('react')，无法 import Node ESM 模块）——本文件是权威
 * 单点，lib/client.js 内 createClientRemotes 为其行为镜像（OAUTH_ROUTE_
 * PROVIDER lib/client.js:36 镜像先例）；同步由 tests/host-abi-health.mjs §7
 * 行为 parity 判别锁定（降级信封/health faces/diag 轨迹逐字段相等，漂移即红）。
 * 修改本文件必须同步镜像并保持 parity 绿。
 *
 * 降级语义（§4.3 域 1「降级行为（关键变更）」）：unavailable 从 throw 改为
 * 降级信封——页面级效果 = 单面卡片降级（错误短码）+ 健康徽章，其余面照常
 * 工作，永不整页崩（对比 FIX-028 只把崩溃变成可见错误文本、仍是整页失败行）。
 * 每次降级记 face-degraded 诊断事件（本域实例环形 health().diag 可观测 +
 * noteHostDiag 全局环形上行——RPC router/hostFaceDiagnostics 可见，P8）。
 *
 * 探测语义（§4.3 域 1 能力探测）：每面 = 存在性（ctx.get('remote.<name>')
 * 优先 + ctx.remote.<name> 属性面兜底——FIX-027 双形态先例同构）+ 方法形状
 * 校验（关键方法 typeof 检查）。FaceHealth 状态映射：面未挂载 → missing
 * （host-face-missing）；面在而方法缺失 → degraded（host-face-shape）；
 * 全部就绪 → ok。域内 probe 供 health() 显式调用（惰性三时机纪律 §7.1——
 * 绝不进渲染路径；徽章数据源 = 页面一次性 effect 读 health() 快照）。
 * @module dsh-agent-router/host-abi/client-remotes
 */

import { noteHostDiag } from './health.js'

/**
 * 客户端 remote.* 五命名空间的方法形状契约（FIX-028 hostApiFace 实测消费
 * 面：各 face 的 typeof 守卫逐一收录——形状漂移（面在方法变）即 probe 红，
 * BR-02 第一层防线）。
 */
export const CLIENT_REMOTE_FACES = {
  llm: ['listProviders', 'listConfigurableProviders', 'discoverModels'],
  settings: ['describe', 'mutate'],
  credentials: ['describe', 'set', 'unset'],
  agentPresets: ['list'],
  session: ['modelCatalog', 'selectModel'],
}

/** 宿主面降级错误码（§4.3 域 1 接口定义：missing = 命名空间未挂载 / shape = 面在而方法形状不符 / call = 面调用被拒）。 */
export const HOST_FACE_ERROR_CODES = {
  missing: 'host-face-missing',
  shape: 'host-face-shape',
  call: 'host-face-call',
}

/** 域实例诊断环形上限（health.js HOST_DIAG_LIMIT=64 同构——浏览器镜像侧无 import，值随 parity 判别锁定）。 */
const CLIENT_REMOTES_DIAG_LIMIT = 64

/**
 * 单面能力探测（§4.3 域 1）：存在性（双形态解析）+ 方法形状校验。
 * @param ctx - 客户端 fiber ctx（inject 声明见 inject-manifest 域 FIBER_INJECT）。
 * @param name - 命名空间名（CLIENT_REMOTE_FACES 键；未登记名 = 存在性-only 探测）。
 * @returns FaceHealth `{ name, state: 'ok'|'degraded'|'missing', detail? }`。
 */
export function probeRemoteFace(ctx, name) {
  const requiredMethods = CLIENT_REMOTE_FACES[name] ?? []
  let face
  try {
    const viaGet = ctx && typeof ctx.get === 'function' ? ctx.get(`remote.${name}`) : undefined
    face = viaGet !== undefined ? viaGet : (ctx && ctx.remote ? ctx.remote[name] : undefined)
  } catch (error) {
    return { name, state: 'missing', detail: `host-face-missing: ${String(error?.message ?? error).slice(0, 80)}` }
  }
  if (!face || typeof face !== 'object') return { name, state: 'missing', detail: 'host-face-missing' }
  const missingMethods = requiredMethods.filter((method) => typeof face[method] !== 'function')
  if (missingMethods.length > 0) return { name, state: 'degraded', detail: `host-face-shape: ${missingMethods.join(',')}` }
  return { name, state: 'ok' }
}

/**
 * 客户端宿主面健康快照：CLIENT_REMOTE_FACES 全量逐面探测（health() 数据源；
 * 惰性——仅显式调用时探测，绝不进渲染路径，§7.1）。
 */
export function clientRemotesHealth(ctx) {
  return Object.keys(CLIENT_REMOTE_FACES).map((name) => probeRemoteFace(ctx, name))
}

/**
 * 域 1 唯一入口（§4.3 接口签名）：构造旧信封 api 面 + 健康快照访问器。
 * hostApiFace 本体迁域落点（FIX-028 适配层；消费点零改动承诺——envelope
 * 形状 {result:{ok,value?,error?}} 与迁移前逐字一致）。
 *
 * 降级语义（B2 关键变更，对比 FIX-028 throw）：命名空间缺失/方法形状漂移 →
 * 降级信封（HOST_FACE_ERROR_CODES）；宿主调用被拒 → host-face-call 信封
 * （透传宿主错误消息，绝不外泄击穿调用方）。每次降级记 face-degraded 诊断
 * 事件（实例环形 + noteHostDiag 全局上行，P8 禁无观测吞错）。
 * @param ctx - 客户端 fiber ctx（命名空间声明见 inject-manifest 域 FIBER_INJECT）。
 * @returns `{ api, health() }`——api 与原 hostApiFace 同形旧信封面；
 *   health() → `{ faces: FaceHealth[], diag: 降级诊断事件[] }`（徽章数据源）。
 */
export function createClientRemotes(ctx) {
  const diag = []
  const note = (entry) => {
    try {
      diag.push(entry)
      if (diag.length > CLIENT_REMOTES_DIAG_LIMIT) diag.splice(0, diag.length - CLIENT_REMOTES_DIAG_LIMIT)
    } catch { /* 诊断失败绝不影响主链 */ }
    noteHostDiag(entry)
  }
  const noteDegraded = (face, code, detail) => note({ at: Date.now(), kind: 'face-degraded', face, code, ...(detail ? { detail } : {}) })
  const degradedEnvelope = (face, code, message, detail) => {
    noteDegraded(face, code, detail)
    return { result: { ok: false, error: { code, message } } }
  }
  const faceOf = (name) => {
    const viaGet = ctx.get(`remote.${name}`)
    return viaGet !== undefined ? viaGet : (ctx.remote ? ctx.remote[name] : undefined)
  }
  const directoryFace = () => {
    const viaGet = ctx.get('modelDirectories')
    return viaGet !== undefined ? viaGet : ctx.modelDirectories
  }
  // 命名空间缺失 = 降级信封（B2：原 throw 语义已废——单面降级，永不整页崩）。
  const unavailable = (name) => degradedEnvelope(`remote.${name}`, HOST_FACE_ERROR_CODES.missing, `dsh-agent-router: host remote face "${name}" 不可用——宿主 ${name} 命名空间未挂载或插件版本与宿主不兼容`)
  const misshapen = (name, methods) => degradedEnvelope(`remote.${name}`, HOST_FACE_ERROR_CODES.shape, `dsh-agent-router: host remote face "${name}" 形状漂移——方法缺失: ${methods.join(',')}`, methods.join(','))
  // 面解析 + 形状守卫（缺面 → missing 信封；面在方法缺 → shape 信封；就绪 → null 放行）。
  const resolveFace = (name, face, methods) => {
    if (!face) return unavailable(name)
    const missing = methods.filter((method) => typeof face[method] !== 'function')
    if (missing.length > 0) return misshapen(name, missing)
    return null
  }
  const okValue = (value) => ({ result: { ok: true, value } })
  const failureOf = (error) => ({ result: { ok: false, error: error && error.message ? error : { message: String(error) } } })
  // 调用守卫（host-face-call）：宿主调用 throw → 降级信封（透传宿主错误，
  // 绝不外泄击穿调用方整页——§4.3「永不整页崩」的调用期防线）。
  const guard = (face, fn) => async (...args) => {
    try {
      return await fn(...args)
    } catch (error) {
      noteDegraded(face, HOST_FACE_ERROR_CODES.call)
      return failureOf({ code: HOST_FACE_ERROR_CODES.call, message: `dsh-agent-router: host face "${face}" 调用被拒: ${error && error.message ? error.message : String(error)}` })
    }
  }
  const llmFace = () => faceOf('llm')
  const settingsFace = () => faceOf('settings')
  const credentialsFace = () => faceOf('credentials')
  const agentPresetsFace = () => faceOf('agentPresets')
  const sessionFace = () => faceOf('session')
  return {
    api: {
      llm: {
        providers: guard('remote.llm', async () => {
          const llm = llmFace()
          const bad = resolveFace('llm', llm, ['listProviders', 'listConfigurableProviders'])
          if (bad) return bad
          const [registered, declared] = await Promise.all([llm.listProviders(), llm.listConfigurableProviders()])
          if (!registered.ok) return failureOf(registered.error)
          if (!declared.ok) return failureOf(declared.error)
          return okValue({ providers: joinProviderDirectoryHost(registered.value, declared.value) })
        }),
        models: guard('remote.session', async () => {
          const session = sessionFace()
          const bad = resolveFace('session', session, ['modelCatalog'])
          if (bad) return bad
          const response = await session.modelCatalog()
          if (!response.ok) return failureOf(response.error)
          const catalog = response.value ?? {}
          return okValue({ groups: Array.isArray(catalog.groups) ? catalog.groups : [], failures: Array.isArray(catalog.failures) ? catalog.failures : [] })
        }),
        discoverModels: guard('remote.llm', async (payload) => {
          const llm = llmFace()
          const bad = resolveFace('llm', llm, ['discoverModels'])
          if (bad) return bad
          const input = payload && typeof payload === 'object' ? payload : {}
          const response = await llm.discoverModels(input.settingsNs, {
            ...(input.provider !== undefined ? { provider: input.provider } : {}),
            ...(input.baseURL !== undefined ? { baseURL: input.baseURL } : {}),
            ...(input.api !== undefined ? { api: input.api } : {}),
            ...(input.apiKey !== undefined ? { apiKey: input.apiKey } : {}),
          })
          if (!response.ok) return failureOf(response.error)
          return okValue({ models: Array.isArray(response.value) ? response.value : [] })
        }),
      },
      settings: {
        describe: guard('remote.settings', async () => {
          const settings = settingsFace()
          const bad = resolveFace('settings', settings, ['describe'])
          if (bad) return bad
          const response = await settings.describe()
          if (!response.ok) return failureOf(response.error)
          const value = response.value ?? {}
          return okValue({
            writable: value.writable === true,
            hasDocument: value.hasDocument === true,
            namespaces: Array.isArray(value.namespaces) ? value.namespaces : [],
          })
        }),
        mutate: guard('remote.settings', async (payload) => {
          const settings = settingsFace()
          const bad = resolveFace('settings', settings, ['mutate'])
          if (bad) return bad
          const input = payload && typeof payload === 'object' ? payload : {}
          const response = await settings.mutate(input.ns, Array.isArray(input.ops) ? input.ops : [])
          return envelopeOf(response)
        }),
      },
      credentials: {
        describe: guard('remote.credentials', async (payload) => {
          const credentials = credentialsFace()
          const bad = resolveFace('credentials', credentials, ['describe'])
          if (bad) return bad
          const input = payload && typeof payload === 'object' ? payload : {}
          const response = await credentials.describe(Array.isArray(input.refs) ? input.refs : [])
          if (!response.ok) return failureOf(response.error)
          return okValue({ credentials: response.value ?? {} })
        }),
        set: guard('remote.credentials', async (payload) => {
          const credentials = credentialsFace()
          const bad = resolveFace('credentials', credentials, ['set'])
          if (bad) return bad
          const input = payload && typeof payload === 'object' ? payload : {}
          return envelopeOf(await credentials.set(input.ref, input.value))
        }),
        unset: guard('remote.credentials', async (payload) => {
          const credentials = credentialsFace()
          const bad = resolveFace('credentials', credentials, ['unset'])
          if (bad) return bad
          const input = payload && typeof payload === 'object' ? payload : {}
          return envelopeOf(await credentials.unset(input.ref))
        }),
      },
      agentPresets: {
        list: guard('remote.agentPresets', async () => {
          const presets = agentPresetsFace()
          const bad = resolveFace('agentPresets', presets, ['list'])
          if (bad) return bad
          const response = await presets.list()
          if (!response.ok) return failureOf(response.error)
          return okValue(response.value ?? { presets: [] })
        }),
      },
      sessions: {
        // 宿主 0.1.2-rc.1 客户端面无 per-session 模型 wire RPC（api-remotes
        // session 命名空间只有 modelCatalog——全局目录，非会话选择）；
        // 等价读 = ctx.modelDirectories.directoryFor(sessionId).load()
        // （ModelDirectory 快照 {current,routable,groups,failures} 与旧
        // sessions.models 值同形——FIX-026 直驱路径同一机制）。
        models: guard('modelDirectories', async (payload) => {
          const input = payload && typeof payload === 'object' ? payload : {}
          const directoryService = directoryFace()
          if (!directoryService || typeof directoryService.directoryFor !== 'function' || !input.sessionId) {
            return failureOf(new Error('dsh-agent-router: modelDirectories 服务不可用（宿主旧版本？）'))
          }
          let directory
          try {
            directory = directoryService.directoryFor(input.sessionId)
          } catch (error) {
            return failureOf(error)
          }
          if (!directory || typeof directory.load !== 'function') {
            return failureOf(new Error('dsh-agent-router: 会话模型目录不可用'))
          }
          try {
            return okValue(await directory.load())
          } catch (error) {
            return failureOf(error)
          }
        }),
        selectModel: guard('remote.session', async (payload) => {
          const session = sessionFace()
          const bad = resolveFace('session', session, ['selectModel'])
          if (bad) return bad
          return envelopeOf(await session.selectModel(payload))
        }),
      },
    },
    health() {
      return { faces: clientRemotesHealth(ctx), diag: diag.slice() }
    },
  }
}

/**
 * 宿主 provider 目录连接（registered ∪ declared）——dsh-client-ui-
 * settings-models lib/client.js:889-911 joinProviderDirectory 同构镜像
 * （P10：锚定宿主源码形态，非心智模型）：declared 行在前（声明序），
 * 注册而未声明行追加在后（displayName=注册名、settingsNs=""）。
 * （FIX-028 迁域随本体迁入；浏览器镜像同步持同构实现。）
 * @param registered - llm.listProviders 结果（[{id,name}]）。
 * @param directory - llm.listConfigurableProviders 结果
 *   （[{provider, displayName, settingsNs, settingsPath, declared?}]）。
 * @returns 旧 providers 条目数组（含 active/declared 判定）。
 */
function joinProviderDirectoryHost(registered, directory) {
  const active = new Set((registered ?? []).map((provider) => provider.id))
  const declared = new Set((directory ?? []).map((entry) => entry.provider))
  const rows = (directory ?? []).map((entry) => ({
    provider: entry.provider,
    displayName: entry.displayName,
    settingsNs: entry.settingsNs,
    settingsPath: Array.isArray(entry.settingsPath) ? [...entry.settingsPath] : [],
    active: active.has(entry.provider),
    ...(entry.declared === undefined ? {} : { declared: entry.declared }),
  }))
  for (const provider of registered ?? []) {
    if (declared.has(provider.id)) continue
    rows.push({
      provider: provider.id,
      displayName: provider.name,
      settingsNs: '',
      settingsPath: [],
      active: true,
    })
  }
  return rows
}

/**
 * 本包消费面兼容适配（FIX-028 迁域随本体迁入）：把宿主 {ok,value|error}
 * 直面响应包装成旧信封 {result:{ok,value?,error?}}——本包全部消费点以旧
 * 信封判定，包装在单点完成（消费点零改动承诺）。
 */
function envelopeOf(response) {
  if (response && typeof response === 'object' && typeof response.ok === 'boolean') {
    return {
      result: {
        ok: response.ok,
        ...(response.ok
          ? { value: response.value }
          : { error: response.error && response.error.message ? response.error : { message: String(response.error ?? response) } }),
      },
    }
  }
  return { result: { ok: false, error: { message: `dsh-agent-router: host remote answered ${String(response)}` } } }
}
