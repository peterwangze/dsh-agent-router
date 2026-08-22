/**
 * dsh-agent-router 的 Typert Remote 契约。
 *
 * 宿主侧：`createHostContribution()` 交给 `ctx.typert.register(...)`，
 * 网关据此在 `/api/router/*` 上以 strict codec 提供配置/统计/OAuth
 * 与 cli 子代理（状态/登录/模型）方法。
 * 浏览器侧：`ROUTER_REMOTE` 交给 `ctx.remote.$mount(...)`，安装
 * `remote.router` namespace；两者共用 `wireCodecs` 的形状。
 * @module dsh-agent-router/rpc
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
      typeSymbol: `dsh-agent-router/types#${name}`,
      schema: codec,
    },
  }
}

/** 严格结果 codec。 */
function result(name, codec) {
  return {
    mode: 'strict',
    typeSymbol: `dsh-agent-router/types#${name}`,
    schema: codec,
  }
}

/** Remote 调用描述符（宿主与浏览器侧共用）。 */
export const ROUTER_DESCRIPTORS = [
  {
    id: 'dsh-agent-router#router/catalog',
    service: 'router',
    namespace: 'router',
    method: 'catalog',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.emptyRequest)],
    result: result('CatalogResult', wireCodecs.catalogResult),
  },
  {
    id: 'dsh-agent-router#router/stats',
    service: 'router',
    namespace: 'router',
    method: 'stats',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.emptyRequest)],
    result: result('StatsResult', wireCodecs.statsResult),
  },
  {
    id: 'dsh-agent-router#router/statsExport',
    service: 'router',
    namespace: 'router',
    method: 'statsExport',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.statsExportRequest)],
    result: result('StatsExportResult', wireCodecs.statsExportResult),
  },
  {
    id: 'dsh-agent-router#router/test',
    service: 'router',
    namespace: 'router',
    method: 'test',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.agentIdRequest)],
    result: result('TestResult', wireCodecs.testResult),
  },
  {
    id: 'dsh-agent-router#router/reset',
    service: 'router',
    namespace: 'router',
    method: 'reset',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.emptyRequest)],
    result: result('ResetResult', wireCodecs.resetResult),
  },
  {
    id: 'dsh-agent-router#router/config',
    service: 'router',
    namespace: 'router',
    method: 'config',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.emptyRequest)],
    result: result('ConfigResult', wireCodecs.configResult),
  },
  {
    id: 'dsh-agent-router#router/save',
    service: 'router',
    namespace: 'router',
    method: 'save',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.saveRequest)],
    result: result('SaveResult', wireCodecs.saveResult),
  },
  {
    id: 'dsh-agent-router#router/oauthTokenExchange',
    service: 'router',
    namespace: 'router',
    method: 'oauthTokenExchange',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.oauthTokenExchangeRequest)],
    result: result('OauthTokenExchangeResult', wireCodecs.oauthTokenExchangeResult),
  },
  {
    id: 'dsh-agent-router#router/oauthBegin',
    service: 'router',
    namespace: 'router',
    method: 'oauthBegin',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.oauthBeginRequest)],
    result: result('OauthBeginResult', wireCodecs.oauthBeginResult),
  },
  {
    id: 'dsh-agent-router#router/oauthDiscover',
    service: 'router',
    namespace: 'router',
    method: 'oauthDiscover',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.oauthDiscoverRequest)],
    result: result('OauthDiscoverResult', wireCodecs.oauthDiscoverResult),
  },
  {
    id: 'dsh-agent-router#router/oauthLogout',
    service: 'router',
    namespace: 'router',
    method: 'oauthLogout',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.oauthLogoutRequest)],
    result: result('OauthLogoutResult', wireCodecs.oauthLogoutResult),
  },
  {
    id: 'dsh-agent-router#router/cliStatus',
    service: 'router',
    namespace: 'router',
    method: 'cliStatus',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.agentIdRequest)],
    result: result('CliStatusResult', wireCodecs.cliStatusResult),
  },
  {
    id: 'dsh-agent-router#router/cliLogin',
    service: 'router',
    namespace: 'router',
    method: 'cliLogin',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.agentIdRequest)],
    result: result('CliLoginResult', wireCodecs.cliLoginResult),
  },
  {
    id: 'dsh-agent-router#router/cliModels',
    service: 'router',
    namespace: 'router',
    method: 'cliModels',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.agentIdRequest)],
    result: result('CliModelsResult', wireCodecs.cliModelsResult),
  },
  {
    id: 'dsh-agent-router#router/imageData',
    service: 'router',
    namespace: 'router',
    method: 'imageData',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.imageDataRequest)],
    result: result('ImageDataResult', wireCodecs.imageDataResult),
  },
  {
    id: 'dsh-agent-router#router/uploadFile',
    service: 'router',
    namespace: 'router',
    method: 'uploadFile',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.uploadFileRequest)],
    result: result('UploadFileResult', wireCodecs.uploadFileResult),
  },
  {
    id: 'dsh-agent-router#router/readWorkspaceFile',
    service: 'router',
    namespace: 'router',
    method: 'readWorkspaceFile',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.readWorkspaceFileRequest)],
    result: result('ReadWorkspaceFileResult', wireCodecs.readWorkspaceFileResult),
  },
]

/** 宿主侧 Typert 贡献（face: host，经 `ctx.typert.register` 挂载）。 */
export function createHostContribution() {
  return {
    package: 'dsh-agent-router',
    face: 'host',
    schemas: [],
    invocations: ROUTER_DESCRIPTORS,
    model: { services: [], events: [], objects: [] },
  }
}

/** 浏览器侧 Remote 贡献（经 `ctx.remote.$mount` 挂载）。 */
export const ROUTER_REMOTE = {
  package: 'dsh-agent-router',
  descriptors: ROUTER_DESCRIPTORS,
}
