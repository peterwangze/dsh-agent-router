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
 * OAuth 一键授权有两条回调路径：
 * - 自建 OAuth Client：`/router-oauth/callback`（webServer 精确路由）；
 * - 内置公开 OAuth Client（零配置，Google Cloud SDK 公开 client）：
 *   本行在 127.0.0.1:8085 自建极简 HTTP 回调服务（公开 client 的注册
 *   回调固定为 http://localhost:8085/）；端口被占用（如 gcloud CLI
 *   正在运行）时静默降级，`oauthBegin` 会给出明确错误。
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

export function apply(ctx) {
  const service = new RouterService(ctx)

  // settings namespace：热生效（settings.yaml `router:` 分节 / 设置页写入）。
  const scope = ctx.settings.register(ROUTER_NS, routerSchema, { applies: 'live' })
  service.attach(scope)
  ctx.effect(() => () => service.attach(null), 'dsh-agent-router: detach settings scope')

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

  return service
}
