/**
 * dsh-router 宿主行（composition：`- id: router; name: dsh-router`）。
 *
 * 一个行同时是：
 * - 宿主插件：提供 `router` 服务、注册 `router` settings namespace、
 *   挂载 Typert Remote 契约（/api/router/*）；
 * - 浏览器侧插件（dual-face）：package.json 的 `dsh.client` 指向
 *   `./client` 包，modules 节点据此扫描并下发设置/统计页面。
 *
 * `settings` / `typert` 是硬依赖（宿主 base 组合行）：以 inject 等待其
 * 就绪，避免激活顺序竞争（本行在两者之前激活会导致 namespace 与
 * Remote 契约静默缺席）。注册直接发生在 apply 内，随本行 fiber
 * 卸载（`settings.register` 与 `typert.register` 均按调用 fiber 管理注销）。
 *
 * 开关方式：
 * - 组合层：把该行 `disabled: true` 即可整体关闭原生插件；
 * - 运行层：设置页总开关（settings.yaml 的 `router.enabled`）关闭
 *   路由执行、提示段与统计，无需重启。
 * @module dsh-router
 */
import { RouterService } from './service.js'
import { ROUTER_NS, routerSchema } from './schemas.js'
import { createHostContribution } from './rpc.js'

export const name = 'dsh-router'

/** 硬依赖：settings seam 与 typert 注册表（宿主 base 组合行）。 */
export const inject = ['settings', 'typert']

export function apply(ctx) {
  const service = new RouterService(ctx)

  // settings namespace：热生效（settings.yaml `router:` 分节 / 设置页写入）。
  const scope = ctx.settings.register(ROUTER_NS, routerSchema, { applies: 'live' })
  service.attach(scope)
  ctx.effect(() => () => service.attach(null), 'dsh-router: detach settings scope')

  // Typert Remote 契约：网关据此以 strict codec 提供 /api/router/*。
  ctx.typert.register(createHostContribution())

  return service
}
