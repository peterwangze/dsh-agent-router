/**
 * ARCH-004 域 8（宿主包域）：宿主供给包的**单一声明源** + 宿主包代际自检。
 *
 * 为什么需要本域（2026-10-25 桌面端启动故障的一手机制，实测证据链）：
 * 本插件早期把直接 import 的宿主包（dsh-tools / dsh-llm / dsh-typert-protocol，
 * 以及平台包 cordis / schemastery）写在 `dependencies` 里。宿主 profile 用
 * `nodeLinker: hoisted` 装插件时，pnpm 会把它们**提升到 profile 根
 * `node_modules`**；而宿主 `dsh-app-boot` 的装载门 `prepareProfileEntries` →
 * `preflight` → `manifestOf` 先问 `pluginPackages` 服务（运行时替换层），该层把
 * **profile 自身 node_modules 的物理副本**当本地候选优先路由，于是核心行
 * `tools` 解析到 profile 里那份旧代 `dsh-tools@0.2.0-rc.2`，与运行宿主
 * `0.2.1-rc.3` 不符 → `evaluatePluginCompatibility` 判定不兼容 → 该行被
 * `disabled`（stderr: `disabling profile plugin row "tools": …`）→ `tools`
 * 服务永不发布 → `agent-loop`（required）永远 pending → `startup failed:
 * 1 required plugin did not activate`。桌面端因此完全起不来，且「禁用第三方
 * 插件」也不会恢复（被提升的副本来自依赖树，不是 bundle 选择）。
 *
 * 结论性纪律（本域承载）：**宿主供给包只能声明为 `peerDependencies`，永不得
 * 出现在 `dependencies`**；插件不得在 profile 里制造宿主包的第二份副本。
 * 由 `tests/host-version-snapshot.mjs`（声明面纯净性）与
 * `tests/host-contract.mjs`（import 边界 S10）机器看护。
 *
 * 本域职责边界：
 * - 声明面：{@link HOST_PACKAGE_REGISTRY} 是「本插件需要宿主供给哪些包、以何种
 *   身份、什么范围」的**唯一代码侧事实源**（package.json 的 peerDependencies
 *   是其投影，两侧由测试锁定）；
 * - 观测面：{@link hostGenerationReport} 比对「宿主安装副本」与「插件**实际
 *   解析到**的副本」的代际，代际不一致时 {@link noteHostGeneration} 记一条诊断
 *   进 health 环形（P8：降级/能力判定缺失必须可观测）。
 * - 零逻辑边界：本域**不 import 任何宿主包**（只读其 package.json 元数据），也
 *   不 import 其它域（仅 health 边，§4.2 允许向）——保证探测在任何宿主代际下
 *   都不会自身崩栈。
 *
 * **两侧探测必须用不同机制（关键，反直觉）**：
 * - 宿主安装副本：`createRequire(installAnchor).resolve.paths()` + `existsSync`
 *   ——与宿主 `dsh-app-boot` 的 `packageDirFromAnchor` 同构的**裸 Node 路径序**
 *   （不经运行时替换层），得到宿主自己那份的绝对事实。
 * - 插件实际解析副本：必须走**被替换层路由后的**解析——`pluginPackages.
 *   packageOf()` 服务优先、CJS `require('<pkg>/package.json')` 兜底。绝不能对
 *   插件自身用作弊器式的 `resolve.paths` 探测：那会命中 profile 之上的
 *   `$DSH_HOME/profiles/node_modules`（脚本通道用的扁平宿主树，当前 0.2.1-rc.2），
 *   与桌面端宿主 0.2.1-rc.3 天然不同代 ⇒ 每次启动都误报「遮蔽」。实测：
 *   打包安装的插件用裸路径序读到 dsh-tools@0.2.1-rc.2，而运行时实际加载的是
 *   宿主 0.2.1-rc.3（健康徽章读数为证）。
 *
 * @module dsh-agent-router/host-abi/host-packages
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { noteHostDiag } from './health.js'

/**
 * 宿主包声明表（唯一代码侧事实源；package.json 的 peerDependencies 为其投影）。
 *
 * 字段：
 * - `name`：包名；
 * - `kind`：`runtime` = `@deepseek-ai/dsh*` 宿主运行时包（受宿主装载门
 *   `evaluatePluginCompatibility` 逐项判定）；`platform` = 平台包（cordis /
 *   schemastery，装载门不判定，但同属宿主供给、同样禁入 `dependencies`）；
 * - `usage`：`import` = 本插件静态 import 其导出（host-imports 域单点）；
 *   `service` = 经 cordis 服务注入消费（不 import，仅 install 期可观测性声明）；
 *   `structure` = 结构性依赖（基类/实例同一性来自宿主）；
 * - `range`：记录性声明范围（dsh 运行时包统一口径，见 package.json）；
 * - `optional`：`peerDependenciesMeta.optional` —— 缺失时相应能力降级，
 *   不阻断插件装载（仅影响安装器行为，不解除宿主装载门）。
 */
export const HOST_PACKAGE_REGISTRY = Object.freeze([
  Object.freeze({ name: '@deepseek-ai/cordis', kind: 'platform', usage: 'structure', range: '^4.0.1', optional: false }),
  Object.freeze({ name: '@deepseek-ai/schemastery', kind: 'platform', usage: 'import', range: '^3.18.5', optional: false }),
  Object.freeze({ name: '@deepseek-ai/dsh-llm', kind: 'runtime', usage: 'import', range: '^0.2.0-rc.2', optional: false }),
  Object.freeze({ name: '@deepseek-ai/dsh-tools', kind: 'runtime', usage: 'import', range: '^0.2.0-rc.2', optional: false }),
  Object.freeze({ name: '@deepseek-ai/dsh-typert-protocol', kind: 'runtime', usage: 'import', range: '^0.2.0-rc.2', optional: false }),
  Object.freeze({ name: '@deepseek-ai/dsh-attachment', kind: 'runtime', usage: 'service', range: '^0.2.0-rc.2', optional: true }),
  Object.freeze({ name: '@deepseek-ai/dsh-agent', kind: 'runtime', usage: 'service', range: '^0.2.0-rc.2', optional: true }),
  Object.freeze({ name: '@deepseek-ai/dsh-agent-default-model', kind: 'runtime', usage: 'service', range: '^0.2.0-rc.2', optional: true }),
  Object.freeze({ name: '@deepseek-ai/dsh-session', kind: 'runtime', usage: 'service', range: '^0.2.0-rc.2', optional: true }),
  Object.freeze({ name: '@deepseek-ai/dsh-settings', kind: 'runtime', usage: 'service', range: '^0.2.0-rc.2', optional: true }),
  Object.freeze({ name: '@deepseek-ai/dsh-subagent', kind: 'runtime', usage: 'service', range: '^0.2.0-rc.2', optional: true }),
  Object.freeze({ name: '@deepseek-ai/dsh-system-prompt', kind: 'runtime', usage: 'service', range: '^0.2.0-rc.2', optional: true }),
  Object.freeze({ name: '@deepseek-ai/dsh-credentials', kind: 'runtime', usage: 'service', range: '^0.2.0-rc.2', optional: true }),
])

/** 全部宿主供给包名（peerDependencies 的期望键集合）。 */
export const HOST_PACKAGE_NAMES = Object.freeze(HOST_PACKAGE_REGISTRY.map((entry) => entry.name))

/** 运行时包名（受宿主装载门判定；统一声明范围口径的强制集合）。 */
export const HOST_RUNTIME_PACKAGE_NAMES = Object.freeze(
  HOST_PACKAGE_REGISTRY.filter((entry) => entry.kind === 'runtime').map((entry) => entry.name),
)

/** 平台包名（cordis / schemastery；装载门不判定，但同属宿主供给）。 */
export const HOST_PLATFORM_PACKAGE_NAMES = Object.freeze(
  HOST_PACKAGE_REGISTRY.filter((entry) => entry.kind === 'platform').map((entry) => entry.name),
)

/** 静态 import 面（host-imports 域必须逐包覆盖；测试双向锁定）。 */
export const HOST_IMPORTED_PACKAGE_NAMES = Object.freeze(
  HOST_PACKAGE_REGISTRY.filter((entry) => entry.usage === 'import').map((entry) => entry.name),
)

/** 版本不可判定时的单一口径（与 version 域 `packageVersionOf` 的降级值同形）。 */
export const HOST_VERSION_UNKNOWN = 'unknown'

/** 代际探测的解析路径种类（`interception` = 经宿主运行时替换层；`none` = 不可判定）。 */
export const HOST_ROUTING = Object.freeze({ intercept: 'interception', none: 'none' })

/**
 * 宿主安装锚（宿主自述的 dsh 包 manifest 路径）。
 *
 * 来源：宿主 `runProfile` 的 `profileContext.installAnchor`（CLI 侧 = 全局安装的
 * `dsh/package.json`；桌面侧 = asar 内 `…/@deepseek-ai/dsh/package.json`）。
 * 缺失或形状异常 → `''`（能力缺失，不抛错——本域绝不阻断 apply）。
 * @param ctx - 宿主上下文（可能无 get/profileContext，测试桩安全）。
 * @returns {string} 绝对路径或空串。
 */
export function hostInstallAnchorOf(ctx) {
  try {
    const profile = ctx && typeof ctx.get === 'function' ? ctx.get('profileContext') : undefined
    const anchor = profile && typeof profile.installAnchor === 'string' ? profile.installAnchor : ''
    return anchor
  } catch { /* 宿主上下文形状漂移 → 视为不可判定（不阻断主链） */ }
  return ''
}

/**
 * 按宿主装载门同构的方式定位一个包的最近副本目录（**裸 Node 路径序**）。
 *
 * 与 `dsh-app-boot` 的 `packageDirFromAnchor` 同构：用
 * `createRequire(anchor).resolve.paths(name)` 逐级探测 `package.json` 存在性。
 * 该路径**不经**运行时替换层——这正是宿主自己用来判定「本地物理副本」的口径，
 * 也是本域读「宿主安装副本」一侧的正确机制。
 * 注意：**不要**用它探测插件自身的解析结果（见文件头「两侧探测必须用不同机制」）。
 * @param anchor - 解析锚（文件绝对路径或 file URL）。
 * @param name - 包名。
 * @returns {string|undefined} 包目录绝对路径。
 */
export function packageDirFromAnchor(anchor, name) {
  try {
    for (const searchPath of createRequire(anchor).resolve.paths(String(name)) ?? []) {
      const candidate = join(searchPath, String(name))
      if (existsSync(join(candidate, 'package.json'))) return candidate
    }
  } catch { /* 锚不可解析（asar/权限/畸形路径）→ 不可判定 */ }
  return undefined
}

/**
 * 从给定锚按裸路径序读取一个包的版本。
 * @param anchor - 解析锚。
 * @param name - 包名。
 * @returns {string} 版本号，或 {@link HOST_VERSION_UNKNOWN}。
 */
export function packageVersionFromAnchor(anchor, name) {
  const dir = packageDirFromAnchor(anchor, name)
  if (dir === undefined) return HOST_VERSION_UNKNOWN
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    const version = typeof manifest?.version === 'string' ? manifest.version : ''
    if (version !== '') return version
  } catch { /* 元数据读取失败 → 不可判定（不阻断） */ }
  return HOST_VERSION_UNKNOWN
}

/**
 * 从给定锚批量读取**静态 import 面**的版本表。
 * @param anchor - 解析锚。
 * @param names - 包名集合（默认静态 import 面）。
 * @returns {Record<string, string>} 包名 → 版本（不可判定为 'unknown'）。
 */
export function hostVersionsFromAnchor(anchor, names = HOST_IMPORTED_PACKAGE_NAMES) {
  const versions = {}
  for (const name of names) versions[name] = packageVersionFromAnchor(anchor, name)
  return versions
}

/**
 * 宿主运行时替换层服务（`pluginPackages`）：存在即代表裸包名会经宿主路由。
 * @param ctx - 宿主上下文。
 * @returns {{ packageOf?: Function }|undefined} 服务实例或 undefined。
 */
function pluginPackagesOf(ctx) {
  try {
    const service = ctx && typeof ctx.get === 'function' ? ctx.get('pluginPackages') : undefined
    return service && typeof service.packageOf === 'function' ? service : undefined
  } catch { /* 服务面形状漂移 → 视为不可用（不阻断） */ }
  return undefined
}

/**
 * 插件**实际解析到**的宿主包版本（经替换层路由口径）。
 *
 * 机制优先级：`pluginPackages.packageOf(name, import.meta.url)`（与宿主装载门
 * `manifestOf` 完全同源）→ CJS `require('<pkg>/package.json')`（Node 的 CJS
 * 解析同样被替换层改写）→ `'unknown'`。
 * @param service - `pluginPackages` 服务（可为 undefined）。
 * @param name - 包名。
 * @returns {string} 版本号或 'unknown'。
 */
export function routedVersionOf(service, name) {
  if (service !== undefined) {
    try {
      const pkg = service.packageOf(String(name), import.meta.url)
      const version = pkg && typeof pkg.version === 'string' ? pkg.version : ''
      if (version !== '') return version
    } catch { /* 路由查询失败 → 落到 require 兜底 */ }
  }
  try {
    const pkg = createRequire(import.meta.url)(`${String(name)}/package.json`)
    const version = pkg && typeof pkg.version === 'string' ? pkg.version : ''
    if (version !== '') return version
  } catch { /* 元数据读取失败 → 不可判定 */ }
  return HOST_VERSION_UNKNOWN
}

/**
 * 宿主包代际自检（纯读、无副作用）：宿主安装副本 vs 插件实际解析副本。
 *
 * 判定语义（三态诚实口径）：
 * - `anchorAvailable=false`：宿主未提供安装锚 → `host` 全 'unknown'，
 *   `mismatches` 为空（不可判定 ≠ 一致；由 `noteHostGeneration` 记能力缺失事件）；
 * - `routing='none'`：无运行时替换层服务（老宿主/桩上下文）→ 不给判定，
 *   避免「裸路径序读到 profile 之上的扁平宿主树」这类天然不同代造成误报；
 * - `mismatches` 非空：插件实际加载的副本与宿主安装副本**代际不一致** ——
 *   profile 根被提升出宿主包旧副本（即本次桌面端启动故障）时正是此形态。
 *
 * @param ctx - 宿主上下文。
 * @returns {{ anchor: string, anchorAvailable: boolean, routing: string, host: object, own: object, mismatches: Array<{ name: string, host: string, own: string }> }}
 */
export function hostGenerationReport(ctx) {
  const anchor = hostInstallAnchorOf(ctx)
  const anchorAvailable = anchor !== ''
  const unknown = () => Object.fromEntries(HOST_IMPORTED_PACKAGE_NAMES.map((name) => [name, HOST_VERSION_UNKNOWN]))
  const host = anchorAvailable ? hostVersionsFromAnchor(anchor) : unknown()
  const service = pluginPackagesOf(ctx)
  const routing = service !== undefined ? HOST_ROUTING.intercept : HOST_ROUTING.none
  const own = {}
  for (const name of HOST_IMPORTED_PACKAGE_NAMES) own[name] = routedVersionOf(service, name)
  const mismatches = []
  if (anchorAvailable && routing === HOST_ROUTING.intercept) {
    for (const name of HOST_IMPORTED_PACKAGE_NAMES) {
      const hostVersion = host[name]
      const ownVersion = own[name]
      if (hostVersion === HOST_VERSION_UNKNOWN || ownVersion === HOST_VERSION_UNKNOWN) continue
      if (hostVersion !== ownVersion) mismatches.push({ name, host: hostVersion, own: ownVersion })
    }
  }
  return { anchor, anchorAvailable, routing, host, own, mismatches }
}

/**
 * apply 期宿主包代际自检 + 诊断入环（P8）。
 *
 * 行为：
 * - 有安装锚且 `mismatches` 非空 → `host-package-generation-mismatch`
 *   （detail 逐包 `name host=x own=y`，health 域负责按 160 字符截断）；
 * - 无安装锚 → `host-package-generation-unknown` / `no-install-anchor`；
 * - 无替换层服务 → `host-package-generation-unknown` / `no-plugin-packages`；
 * - 一致 → 零事件（诊断环形只留异常，与既有纪律一致）。
 *
 * 绝不 throw：诊断失败不影响主链（health 域同款纪律）。
 * @param ctx - 宿主上下文。
 * @returns hostGenerationReport 的判定结果（供测试判别）。
 */
export function noteHostGeneration(ctx) {
  let report
  try {
    report = hostGenerationReport(ctx)
  } catch {
    noteHostDiag({ kind: 'host-package-generation-unknown', code: 'probe-threw' })
    return undefined
  }
  if (!report.anchorAvailable) {
    noteHostDiag({ kind: 'host-package-generation-unknown', code: 'no-install-anchor' })
    return report
  }
  if (report.routing === HOST_ROUTING.none) {
    noteHostDiag({ kind: 'host-package-generation-unknown', code: 'no-plugin-packages' })
    return report
  }
  if (report.mismatches.length > 0) {
    noteHostDiag({
      kind: 'host-package-generation-mismatch',
      code: 'shadowed-host-package',
      detail: report.mismatches.map((item) => `${item.name} host=${item.host} own=${item.own}`).join('; '),
    })
  }
  return report
}
