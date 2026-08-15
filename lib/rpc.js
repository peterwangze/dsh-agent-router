/**
 * dsh-router 的 Typert Remote 契约。
 *
 * 宿主侧：`createHostContribution()` 交给 `ctx.typert.register(...)`，
 * 网关据此在 `/api/router/*` 上以 strict codec 提供四个方法。
 * 浏览器侧：`ROUTER_REMOTE` 交给 `ctx.remote.$mount(...)`，安装
 * `remote.router` namespace；两者共用 `wireCodecs` 的形状。
 * @module dsh-router/rpc
 */
import { wireCodecs } from './schemas.js'

/** 严格参数 codec（唯一参数：请求对象，wire 字段 request）。 */
function parameter(name, codec) {
  return {
    name,
    wire: name,
    source: 'json',
    codec: {
      mode: 'strict',
      typeSymbol: `dsh-router/types#${name}`,
      schema: codec,
    },
  }
}

/** 严格结果 codec。 */
function result(name, codec) {
  return {
    mode: 'strict',
    typeSymbol: `dsh-router/types#${name}`,
    schema: codec,
  }
}

/** 四条 Remote 调用描述符（宿主与浏览器侧共用）。 */
export const ROUTER_DESCRIPTORS = [
  {
    id: 'dsh-router#router/catalog',
    service: 'router',
    namespace: 'router',
    method: 'catalog',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.emptyRequest)],
    result: result('CatalogResult', wireCodecs.catalogResult),
  },
  {
    id: 'dsh-router#router/stats',
    service: 'router',
    namespace: 'router',
    method: 'stats',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.emptyRequest)],
    result: result('StatsResult', wireCodecs.statsResult),
  },
  {
    id: 'dsh-router#router/test',
    service: 'router',
    namespace: 'router',
    method: 'test',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.agentIdRequest)],
    result: result('TestResult', wireCodecs.testResult),
  },
  {
    id: 'dsh-router#router/reset',
    service: 'router',
    namespace: 'router',
    method: 'reset',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.emptyRequest)],
    result: result('ResetResult', wireCodecs.resetResult),
  },
  {
    id: 'dsh-router#router/config',
    service: 'router',
    namespace: 'router',
    method: 'config',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.emptyRequest)],
    result: result('ConfigResult', wireCodecs.configResult),
  },
  {
    id: 'dsh-router#router/save',
    service: 'router',
    namespace: 'router',
    method: 'save',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.saveRequest)],
    result: result('SaveResult', wireCodecs.saveResult),
  },
  {
    id: 'dsh-router#router/oauthTokenExchange',
    service: 'router',
    namespace: 'router',
    method: 'oauthTokenExchange',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.oauthTokenExchangeRequest)],
    result: result('OauthTokenExchangeResult', wireCodecs.oauthTokenExchangeResult),
  },
  {
    id: 'dsh-router#router/oauthDiscover',
    service: 'router',
    namespace: 'router',
    method: 'oauthDiscover',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.oauthDiscoverRequest)],
    result: result('OauthDiscoverResult', wireCodecs.oauthDiscoverResult),
  },
]

/** 宿主侧 Typert 贡献（face: host，经 `ctx.typert.register` 挂载）。 */
export function createHostContribution() {
  return {
    package: 'dsh-router',
    face: 'host',
    schemas: [],
    invocations: ROUTER_DESCRIPTORS,
    model: { services: [], events: [], objects: [] },
  }
}

/** 浏览器侧 Remote 贡献（经 `ctx.remote.$mount` 挂载）。 */
export const ROUTER_REMOTE = {
  package: 'dsh-router',
  descriptors: ROUTER_DESCRIPTORS,
}
