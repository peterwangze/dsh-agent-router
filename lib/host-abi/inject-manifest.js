/**
 * ARCH-004 域 5（设计 §4.3 域 5 / D1-1，EVO-019 B1 批）：客户端 inject
 * 声明单一事实源（代码侧常量）+ fiber 面存在性探测。
 *
 * 归属批次声明：本文件 B1 落地常量事实源 + 探测函数（真实行为）；B2 批
 * （EVO-020）接线 apply 时探测自检（noteInjectFaceGaps——「等待面」页面
 * 可视化）与 dsh.client.inject 静态比对守卫进 tests（B6 成体系——含
 * cordis.patch.yml 条目存在性）。
 *
 * 镜像关系（关键纪律）：lib/client.js 为自包含浏览器包（__ModuleLoader__
 * 格式，无法 import Node ESM 模块）——其 fiber inject 数组（`const inject =
 * [...]` 先例，OAUTH_ROUTE_PROVIDER 镜像同构）与本域 FIBER_INJECT 构成
 * 「代码侧事实源 + 浏览器包镜像」对，tests/host-abi-health.mjs 以源提取比对锁定同步
 * （漂移即红，B6 静态比对体系的前置锚点）。dsh-client-runtime 死行已随
 * B0/D1-1 删除（CLIENT_PACKAGE_INJECT 为删后基线，宿主缺失行静默跳过
 * 语义对照 = 宿主 dsh-client-modules 的包表行）。
 * @module dsh-agent-router/host-abi/inject-manifest
 */

import { noteHostDiag } from './health.js'

/**
 * 客户端 fiber inject 声明（9 面——迁移自 lib/client.js 的 `const inject`
 * 声明、同步锚定；slots/locale/remote 为宿主官方客户端装配面，五 remote.*
 * 命名空间 = FIX-028 适配层依赖面，modelDirectories = FIX-027 门控声明面）。
 */
export const FIBER_INJECT = [
  'slots',
  'locale',
  'remote',
  'remote.llm',
  'remote.settings',
  'remote.credentials',
  'remote.agentPresets',
  'remote.session',
  'modelDirectories',
]

/**
 * dsh.client.inject 包名单（3 包基线——@deepseek-ai/dsh-client-runtime
 * 0.1.5 起宿主中不存在，D1-1 已删；B0 后与 package.json 声明面一致，
 * host-version-snapshot 套件守卫 + 本域镜像双锁定）。
 */
export const CLIENT_PACKAGE_INJECT = [
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-api-remotes',
]

/**
 * fiber 面存在性自检（§4.3 域 5 ②）：FIBER_INJECT 逐面 ctx.get 探测 →
 * FaceHealth[]。降级行为：探测失败面 → missing（inject-face-missing）——
 * 「等待面」可视化数据源（B2 接线健康面板后用户可见卡在哪一面，替代
 * 宿主 waitingFor 门控下的无感等待）。
 */
export function probeFiberInjectFaces(ctx) {
  return FIBER_INJECT.map((name) => {
    let resolved
    try {
      resolved = ctx && typeof ctx.get === 'function' ? ctx.get(name) : undefined
    } catch { resolved = undefined }
    return resolved !== undefined ? { name, state: 'ok' } : { name, state: 'missing', detail: 'inject-face-missing' }
  })
}

/**
 * apply 时 fiber 面存在性自检 + 缺面诊断（§4.3 域 5 ② 降级行为，EVO-020
 * B2 接线）：探测失败面记 noteHostDiag({kind:'inject-face-missing', face})——
 * 不 throw 不阻断 apply；宿主 runner waitingFor 门控下用户无从得知卡在
 * 哪一面，本自检让「等待面」在页面打开后立即可见（健康徽章数据源）。
 * 浏览器镜像：lib/client.js apply() 内联同构探测 + 本地诊断环形（无法
 * import 本模块——OAUTH_ROUTE_PROVIDER 镜像先例；行为判别见
 * tests/client-render.mjs B2 块）。
 * @returns probeFiberInjectFaces 结果（FaceHealth[]）。
 */
export function noteInjectFaceGaps(ctx) {
  const faces = probeFiberInjectFaces(ctx)
  for (const face of faces) {
    if (face.state !== 'ok') noteHostDiag({ kind: 'inject-face-missing', face: face.name, code: 'missing' })
  }
  return faces
}
