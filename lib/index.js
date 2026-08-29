/**
 * dsh-agent-router 宿主行（composition：`- id: router; name: dsh-agent-router`）。
 *
 * 一个行同时是：
 * - 宿主插件：提供 `router` 服务、注册 `router` settings namespace、
 *   挂载 Typert Remote 契约（/api/router/*）；
 * - 浏览器侧插件（dual-face）：package.json 的 `dsh.client` 指向
 *   `./client` 包，modules 节点据此扫描并下发设置/统计页面。
 *
 * `settings` / `typert` / `webServer` 是硬依赖（宿主 base 组合行）：
 * 以 inject 等待其就绪，避免激活顺序竞争。注册直接发生在 apply 内，
 * 随本行 fiber 卸载。
 *
 * OAuth 一键授权有三条回调路径：
 * - 自建 OAuth Client：`/router-oauth/callback`（webServer 精确路由）；
 * - 内置公开 OAuth Client（零配置，Google Cloud SDK 公开 client）：
 *   本行在 127.0.0.1:8085 自建极简 HTTP 回调服务（公开 client 的注册
 *   回调固定为 http://localhost:8085/）；端口被占用（如 gcloud CLI
 *   正在运行）时静默降级，`oauthBegin` 会给出明确错误。
 * - ChatGPT preset（Codex 公共 client，EVO-002 Step 3）：127.0.0.1:1455
 *   惰性回调服务——`oauthBegin` 首次发起 ChatGPT 登录时才监听（不常驻，
 *   未发起登录零端口占用——DEC-021 惰性语义，EVO-006 转正后不变；1455 为
 *   client 注册死值，与 Codex CLI/dsh-codex/yoke233 生态共用）；被占用时
 *   静默降级走 E4 降级链（设备码/手动粘贴，Step 4 接线）。
 *
 * 开关方式：
 * - 组合层：把该行 `disabled: true` 即可整体关闭原生插件；
 * - 运行层：设置页总开关（settings.yaml 的 `router.enabled`）关闭
 *   路由执行、提示段与统计，无需重启。
 * @module dsh-agent-router
 */
import { createServer } from 'node:http'
import { RouterService, oauthCallbackHtml, errorMessage, PUBLIC_OAUTH_CLIENT } from './service.js'
import { ROUTER_NS, routerSchema } from './schemas.js'
import { createHostContribution } from './rpc.js'
import { installAdmissionWrapper } from './wrapper.js'
import { installPreStep } from './prestep.js'
import { clearImageMemory } from './memory.js'
import { CHATGPT_PRESET } from './oauth-credentials.js'

export const name = 'dsh-agent-router'

/** 硬依赖：settings seam、typert 注册表与 web 路由注册表（宿主 base 组合行）。 */
export const inject = ['settings', 'typert', 'webServer']

/** OAuth 回调的公共处理：解析 code/state → 交换 → 渲染结果页。 */
async function handleOauthCallback(service, req, res) {
  let result
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const error = url.searchParams.get('error') ?? ''
    const description = url.searchParams.get('error_description') ?? ''
    const code = url.searchParams.get('code') ?? ''
    const state = url.searchParams.get('state') ?? ''
    if (error) {
      result = { ok: false, message: `服务商返回错误：${error}${description ? `（${description}）` : ''}` }
    } else if (!code || !state) {
      result = { ok: false, message: '回调缺少 code/state 参数' }
    } else {
      result = await service.oauthTokenExchange({ code, state })
    }
  } catch (failure) {
    result = { ok: false, message: errorMessage(failure) }
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(oauthCallbackHtml(result))
}

/**
 * ChatGPT preset（Codex 公共 client）的回调端口（roadmap §3.1 H3-3：1455 为
 * client 注册死值，端口不可改；从 CHATGPT_PRESET.redirectUri 解析以保持
 * 单一事实源，随 preset 常量冻结）。
 */
export const CODEX_LOOPBACK_PORT = Number(new URL(CHATGPT_PRESET.redirectUri).port)

/**
 * 进程级单例：当前 1455 回调服务实例（listen 结果 Promise）。模块级而非
 * apply 闭包级的理由：Step 4 的 oauthBegin 会被用户多次触发，单例让重复
 * starter 调用直接复用同一监听（不重复 bind 同一死值端口）；dispose /
 * 启动失败时清空，下次调用可重试。生产进程内单 service 单实例，无跨
 * service 共享面。
 */
let codexLoopbackActive = null

/**
 * 启动 ChatGPT preset 的 1455 loopback 回调服务（EVO-002 Step 3 /
 * roadmap §3.4 条目 3 + 决策 E4）。惰性：由 `service.codexLoopbackStarter`
 * （apply 注入）在 oauthBegin（Step 4 preset 分支）首次需要时调用——本函数
 * 之外的模块加载/apply 路径均不监听。
 *
 * 行为对齐 8085 先例（apply 内 builtin oauth loopback）：handler 复用
 * `handleOauthCallback` + 同款 catch 兜底（500/destroy）；EADDRINUSE
 * （Codex CLI / dsh-codex / yoke233 插件在运行——1455 是生态共用死值，
 * 占用是常态而非异常）→ logger.warn + 静默降级不抛错（ready:false 供
 * 调用方走设备码/手动粘贴降级链）；其他 error 同款 warn + not ready。
 *
 * @param {object} options
 * @param {object} options.service - RouterService（回调内 oauthTokenExchange
 *   消费方；listen 成功后置 `codexLoopbackReady = true`，dispose 复位）。
 * @param {{ warn: (message: string) => void }} options.logger - 宿主 logger。
 * @param {number} [options.port] - 端口覆盖（仅测试注入 port 0 临时端口；
 *   默认 CODEX_LOOPBACK_PORT = 1455，H3-3 死值）。
 * @returns {Promise<{ready: boolean, reason?: string, port?: number,
 *   dispose: () => void}>} listen 结果；dispose 幂等（close + 复位标志 +
 *   清空单例）。Promise 只 resolve 不 reject（降级语义体现在结果对象）。
 */
export function createCodexLoopback({ service, logger, port } = {}) {
  if (codexLoopbackActive) return codexLoopbackActive
  codexLoopbackActive = new Promise((resolve) => {
    const loopback = createServer((req, res) => {
      handleOauthCallback(service, req, res).catch((error) => {
        logger.warn(`dsh-agent-router: codex loopback callback failed: ${errorMessage(error)}`)
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('internal error')
        } else {
          res.destroy()
        }
      })
    })
    let disposed = false
    // R3 F-1：Promise settle 标志（listen 成功与 error handler 共同维护）——
    // 迟发 'error'（settle 后）不再清空单例：旧 server 仍在服务，清空会让下次
    // starter 调用对自身旧实例触发 EADDRINUSE 无谓降级 + ready 标志失真。
    let settled = false
    const dispose = () => {
      if (disposed) return
      disposed = true
      service.codexLoopbackReady = false
      codexLoopbackActive = null
      loopback.close()
    }
    loopback.on('error', (error) => {
      if (!settled) codexLoopbackActive = null // 失败不缓存：下次调用重试（E4 用户可重试语义）
      settled = true
      if (error && error.code === 'EADDRINUSE') {
        logger.warn(`dsh-agent-router: codex loopback OAuth callback port ${port ?? CODEX_LOOPBACK_PORT} is occupied (e.g. Codex CLI / dsh-codex); ChatGPT preset one-click login degraded to device flow (E4)`)
        resolve({ ready: false, reason: 'EADDRINUSE', dispose: () => {} })
        return
      }
      logger.warn(`dsh-agent-router: codex loopback OAuth callback server error: ${errorMessage(error)}`)
      resolve({ ready: false, reason: 'ERROR', dispose: () => {} })
    })
    loopback.listen(port ?? CODEX_LOOPBACK_PORT, '127.0.0.1', () => {
      settled = true
      service.codexLoopbackReady = true
      resolve({ ready: true, port: loopback.address().port, dispose })
    })
  })
  return codexLoopbackActive
}

export function apply(ctx) {
  const service = new RouterService(ctx)

  // settings namespace：热生效（settings.yaml `router:` 分节 / 设置页写入）。
  const scope = ctx.settings.register(ROUTER_NS, routerSchema, { applies: 'live' })
  service.attach(scope)
  ctx.effect(() => () => {
    service.attach(null)
    service.killCliChildren()
  }, 'dsh-agent-router: detach settings scope')

  // Multi-modal platform L1: admission wrapping (twin routing, hot-synced with the vision agent switch).
  ctx.effect(() => installAdmissionWrapper(ctx, service), 'dsh-agent-router: admission wrapper')

  // C-3 statistics persistence lifecycle (EVO-003 Phase 2 / roadmap §4.4 / W-4):
  // enable according to settings router.stats.persist (default true) —— setPersist on toggle
  // handles round-trip semantics (on→off: flush first so no recorded events are lost; off→on: empty memory fully restores disk
  // aggregation + rebuilds index); on unload, final flush + timer cleanup. service defaults to
  // pure in-memory (current behavior), persistence is only enabled here at the composition root (lifetime single point).
  ctx.effect(() => {
    service.applyStatsSettings()
    const offSettings = ctx.on('settings/updated', (ns) => {
      // Listen on settings/updated (issued after resolved commit——same reasoning as wrapper L512,
      // reading must get the new value); only respond to changes in this namespace.
      if (ns === ROUTER_NS || ns === void 0) service.applyStatsSettings()
    })
    return () => {
      offSettings()
      void service.stats.close()
    }
  }, 'dsh-agent-router: stats persistence lifecycle')

  // pre-step（v3 Step 6 / N-3）：图片轮 reminder 注入（通道①，带 id 的插件合成
  // user 消息）+ 逃生组分级改写兜底（非包装路由，复用 Step 3 能力判定与改写
  // 语义）。随宿主行 fiber 卸载（Step 6 回滚 = 卸载本注册，wrapper-only 仍可用）。
  ctx.effect(() => installPreStep(ctx, service), 'dsh-agent-router: pre-step reminder + escape rewrite')

  // imageMemory（v3 §5.3 移除点）：插件卸载时清空进程内跨轮缓存。
  ctx.effect(() => () => {
    clearImageMemory()
  }, 'dsh-agent-router: image memory')

  // Typert Remote 契约：网关据此以 strict codec 提供 /api/router/*。
  ctx.typert.register(createHostContribution())

  // 自建 OAuth Client 的回调页（/router-oauth/callback，主端口）。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/router-oauth/callback',
    handler: (req, res) => handleOauthCallback(service, req, res),
  }), 'dsh-agent-router: oauth callback route')

  // 内置公开 OAuth Client 的回调服务（127.0.0.1:8085，gcloud 公开 client
  // 的固定注册回调）。端口被占用时降级：不抛错、标记未就绪。
  ctx.effect(() => {
    const loopback = createServer((req, res) => {
      handleOauthCallback(service, req, res).catch((error) => {
        ctx.logger.warn(`dsh-agent-router: oauth loopback callback failed: ${errorMessage(error)}`)
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('internal error')
        } else {
          res.destroy()
        }
      })
    })
    loopback.on('error', (error) => {
      if (error && error.code === 'EADDRINUSE') {
        ctx.logger.warn('dsh-agent-router: loopback OAuth callback port 8085 is occupied (e.g. gcloud CLI); built-in public client disabled')
        return
      }
      ctx.logger.warn(`dsh-agent-router: loopback OAuth callback server error: ${errorMessage(error)}`)
    })
    loopback.listen(PUBLIC_OAUTH_CLIENT.redirectPort ?? 8085, '127.0.0.1', () => {
      service.oauthLoopbackReady = true
    })
    return () => {
      service.oauthLoopbackReady = false
      loopback.close()
    }
  }, 'dsh-agent-router: builtin oauth loopback server')

  // ChatGPT preset 的 1455 惰性回调服务（EVO-002 Step 3 / roadmap §3.4 条目 3
  // + 决策 E4）：不常驻监听——oauthBegin（Step 4 的 preset 分支）首次需要时经
  // service.codexLoopbackStarter 启动。1455 是生态共用死值（Codex CLI /
  // dsh-codex / yoke233），仅在用户真的发起 ChatGPT 登录时占用；被占时
  // createCodexLoopback 静默降级（ready:false → 设备码/手动粘贴，Step 4/6）。
  ctx.effect(() => {
    let started = null
    service.codexLoopbackStarter = () => {
      started = createCodexLoopback({ service, logger: ctx.logger })
      return started
    }
    return () => {
      service.codexLoopbackStarter = null
      if (started) started.then((instance) => instance.dispose())
    }
  }, 'dsh-agent-router: codex loopback lazy starter')

  return service
}
