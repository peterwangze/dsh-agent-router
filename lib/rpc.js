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
// ARCH-004 B1→B4（EVO-019 P3-5 收口）：hostFaceDiagnostics 的宿主侧供数
// 已平移为 RouterService 类方法（lib/service.js 正式装配）——本文件原型
// 挂载过渡形态及其 RouterService/health/version 导入链已删除（P5 零残留，
// tests/host-abi-health.mjs §8d grep 看护）。rpc.js 仅宿主侧导入链消费
// （lib/index.js + 测试）——浏览器包 client.js 自包含不经此文件，无打包
// 面影响；service.js 不反向依赖 rpc.js（无环）。

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
    // FIX-011：RouterService 实例字段 `this.stats`（StatsStore，EVO-003 统计
    // 迁移）遮蔽原型方法 `stats()`——网关按 implementation ?? method 经
    // Reflect.get 解析，命中字段对象 → method-unavailable → 设置页统计面板
    // 恒 0。显式指向未被遮蔽的 statsSnapshot()（字段大量内部使用，保持原样）。
    implementation: 'statsSnapshot',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.emptyRequest)],
    result: result('StatsResult', wireCodecs.statsResult),
  },
  {
    // FIX-030-C：预设播种/修正观测面（诊断环形最近 N 条——设置页预设卡
    // 最近事件行 + 报障排障依据；「配置生效无观测」由此闭环）。
    id: 'dsh-agent-router#router/presetDiagnostics',
    service: 'router',
    namespace: 'router',
    method: 'presetDiagnostics',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.emptyRequest)],
    result: result('PresetDiagnosticsResult', wireCodecs.presetDiagnosticsResult),
  },
  {
    // ARCH-004 B1（§6.1/§6.2）：宿主面健康三合一观测面——hostVersions
    // （域 6 版本遥测）+ faces（FaceHealth 缓存快照——B2-B5 域迁移批次
    // 注册探针，当前空表诚实降级）+ diag（noteHostDiag 通用环形最近 64
    // 条）。读一次性快照语义：RPC 只读缓存态，不触发 probe（§7.1 惰性
    // 纪律；客户端设置页健康面板徽章数据源，§6.1）。
    id: 'dsh-agent-router#router/hostFaceDiagnostics',
    service: 'router',
    namespace: 'router',
    method: 'hostFaceDiagnostics',
    invocation: { kind: 'direct' },
    parameters: [parameter('request', wireCodecs.emptyRequest)],
    result: result('HostFaceDiagnosticsResult', wireCodecs.hostFaceDiagnosticsResult),
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

/**
 * 宿主侧 Typert 贡献（face: host，经 `ctx.typert.register` 挂载）。
 *
 * ARCH-004 B1→B4：`router/hostFaceDiagnostics` 的实现绑定 = RouterService
 * 类方法（lib/service.js hostFaceDiagnostics()——EVO-022 B4 ②平移）；
 * 网关按 `Reflect.get(service, implementation ?? method)` 解析（本描述符
 * 无 implementation 覆盖，直取 method 名；tests/rpc-shadow-guard.mjs 守卫
 * 同语义 + tests/host-abi-health.mjs §5 全链形状/codec 断言）。
 */
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
