/**
 * ARCH-004 域 6（设计 §4.3 域 6 / §5.3，EVO-019 B1 批；B4 常量权威迁入）：
 * 宿主版本遥测 + 宿主约定常量单点。
 *
 * 版本面（完整实现）：hostVersionsOf 经插件自身 dependencies 静态 require
 * 三包 package.json（dsh-llm / dsh-tools / dsh-typert-protocol——exports
 * 子路径 ./package.json 实测放行）；读取失败 → 'unknown'（不阻断任何路径，
 * 只影响遥测完整性，§4.3 域 6 降级行为）。产出进 router/hostFaceDiagnostics
 * RPC（§5.3-3：报障一键导出即含宿主版本组合）。
 *
 * 常量面（EVO-022 B4 ①：P2-2 反向依赖边翻转收口）：HOST_ROUTE_* 四常量
 * 自持单点定义（权威源自 lib/host-route.js 迁入——B1 期 re-export 形态
 * 废除，host-route.js 反向从本域 import，依赖方向按 §4.2 图 消费者 → 桶
 * → 域，无循环 import）。
 * @module dsh-agent-router/host-abi/version
 */
import { createRequire } from 'node:module'

/** 宿主 llm-pi-ai settings namespace（dsh-llm-pi-ai:2344 `name` 一手事实）。 */
export const HOST_ROUTE_NS = 'llm-pi-ai'
/** 官方目录路由 provider id（pi-ai 内置目录，禁写 api 字段）。 */
export const HOST_ROUTE_PROVIDER = 'openai-codex'
/** 插件维护的宿主凭据 ref（正式命名规范）。 */
export const HOST_ROUTE_REF = 'DSH_ROUTER_OPENAI_CODEX'
/** 后台维护 tick 周期（毫秒；service.hostRouteTickMs 可注入覆盖，测试提速）。 */
export const HOST_ROUTE_TICK_MS = 30_000

/** 经 createRequire 解析依赖包（host-abi 为 Node 侧模块，不经浏览器包）。 */
const requirePackage = createRequire(import.meta.url)

/**
 * 单包版本读取（降级单点）：require('<name>/package.json').version；任何
 * 失败（包缺失/exports 封锁/形状异常）→ 'unknown'。
 * @returns {string} 版本号或 'unknown'。
 */
export function packageVersionOf(name) {
  try {
    const pkg = requirePackage(`${String(name)}/package.json`)
    const version = pkg && typeof pkg.version === 'string' && pkg.version ? pkg.version : ''
    return version || 'unknown'
  } catch { /* 版本读取失败 → 'unknown'（不阻断，遥测完整性降级） */ }
  return 'unknown'
}

/**
 * 宿主版本组合（RPC router/hostFaceDiagnostics 的 hostVersions 面）。
 * 三键 = 插件 dependencies 中直接 import 的宿主协议包（D1-6 保留面）。
 */
export function hostVersionsOf() {
  return {
    llm: packageVersionOf('@deepseek-ai/dsh-llm'),
    tools: packageVersionOf('@deepseek-ai/dsh-tools'),
    typertProtocol: packageVersionOf('@deepseek-ai/dsh-typert-protocol'),
  }
}
