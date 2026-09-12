/**
 * ARCH-004 域 6（设计 §4.3 域 6 / §5.3，EVO-019 B1 批）：宿主版本遥测 +
 * 宿主约定常量单点。
 *
 * 版本面（完整实现）：hostVersionsOf 经插件自身 dependencies 静态 require
 * 三包 package.json（dsh-llm / dsh-tools / dsh-typert-protocol——exports
 * 子路径 ./package.json 实测放行）；读取失败 → 'unknown'（不阻断任何路径，
 * 只影响遥测完整性，§4.3 域 6 降级行为）。产出进 router/hostFaceDiagnostics
 * RPC（§5.3-3：报障一键导出即含宿主版本组合）。
 *
 * 常量面：HOST_ROUTE_* 宿主约定常量 re-export（权威源 lib/host-route.js；
 * B1 为 re-export 形态，B4 批随 ctx-services 迁移正式迁入本域为权威源）。
 * @module dsh-agent-router/host-abi/version
 */
import { createRequire } from 'node:module'
import { HOST_ROUTE_NS, HOST_ROUTE_PROVIDER, HOST_ROUTE_REF, HOST_ROUTE_TICK_MS } from '../host-route.js'

/** 宿主约定常量 re-export（B4 批迁入为权威源——当前权威源 host-route.js）。 */
export { HOST_ROUTE_NS, HOST_ROUTE_PROVIDER, HOST_ROUTE_REF, HOST_ROUTE_TICK_MS }

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
