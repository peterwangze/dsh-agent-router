/**
 * ARCH-004 域 6（设计 §4.3 域 6 / §5.3，EVO-019 B1 批；B4 常量权威迁入）+
 * ARCH-005 R2 扩展（协商域，设计 §2-B 四维-b）：宿主版本遥测 + 宿主约定常量
 * 单点 + 运行面版本协商三态（hostCapabilityProfile + 基线档案表，见下方）。
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
 *
 * 协商面（ARCH-005 R2）：hostCapabilityProfile 读宿主版本组合 × FaceHealth
 * 快照（faceHealthSnapshot 纯缓存读——本域 → health 边为 §4.2 允许向，同
 * events/client-remotes 等域先例）→ matched / compatible-unknown /
 * incompatible 三态 + unknown 一次性诊断事件；数据源基线档案表见下方单源
 * 声明。
 * @module dsh-agent-router/host-abi/version
 */
import { createRequire } from 'node:module'
import { faceHealthSnapshot, noteHostDiag } from './health.js'

/** 宿主 llm-pi-ai settings namespace（dsh-llm-pi-ai:2490 `name` 一手事实——ARCH-005 R0 实证漂移锚刷新；0.1.5 时代旧位 dsh-llm-pi-ai:2344）。 */
export const HOST_ROUTE_NS = 'llm-pi-ai'
/** 官方目录路由 provider id（pi-ai 内置目录，禁写 api 字段）。 */
export const HOST_ROUTE_PROVIDER = 'openai-codex'
/** 插件维护的宿主凭据 ref（正式命名规范）。 */
export const HOST_ROUTE_REF = 'DSH_ROUTER_OPENAI_CODEX'
/** 后台维护 tick 周期（毫秒；service.hostRouteTickMs 可注入覆盖，测试提速）。 */
export const HOST_ROUTE_TICK_MS = 30_000

// ── ARCH-005 R2：宿主基线档案表 + 运行面协商三态（设计 §2-B 四维-b）──────────

/**
 * 宿主基线档案表（运行面协商态的数据源，ARCH-005 R2）。
 *
 * **单源关系（P5 显式声明）**：权威源 = `tests/host-version-snapshot.mjs` 的
 * `HOST_BASELINE_REGISTRY`（宿主树实读登记处，刷新步骤见该文件头注释）；本表
 * 为其**运行面投影**（同形双表）。产品代码 import 该测试文件不可行——它是
 * 顶层执行套件（import 即全量跑测，断言失败时 process.exit(1) 会击穿宿主进程；
 * 依赖方向亦禁止 lib → tests）⇒ 沿用 F-J「双份常量机器锁定」纪律
 * （host-contract 的 HOST_VERSION_BASELINE 副本同款先例）：两侧值级相等由
 * `tests/host-abi-health.mjs` §R2-a 解析锁定断言机器看护——任一侧漂移
 * （宿主升级漏刷 / 单侧手滑改值）即红，禁静默分叉。
 */
export const HOST_BASELINE_REGISTRY = Object.freeze([
  Object.freeze({ id: '0.1.5', status: 'frozen', dsh: '0.1.5-rc.1', dshPackages: '0.1.5-rc.2', cordis: '4.0.2', schemastery: '3.18.2' }),
  Object.freeze({ id: '0.2.0', status: 'frozen', dsh: '0.2.0-rc.2', dshPackages: '0.2.0-rc.2', cordis: '4.0.5', schemastery: '3.18.5' }),
  Object.freeze({ id: '0.2.1', status: 'primary', dsh: '0.2.1-rc.2', dshPackages: '0.2.1-rc.2', cordis: '4.0.5', schemastery: '3.18.5' }),
])

/** 协商三态合法词汇（§2-B 四维-b：matched / compatible-unknown / incompatible）。 */
export const HOST_CAPABILITY_STATES = ['matched', 'compatible-unknown', 'incompatible']

/** unknown 态已记一次性诊断事件的版本组合键集合（§7.1 去重：同组合只记一次）。
 *  作用域限定（返工 F-4）：模块级 Set 为**进程作用域**——宿主/插件重启后同一
 *  组合会各再记一条（每进程恰一条）；诊断环形 64 上限内无害，无跨进程去重
 *  语义，「只记一次」指单进程生命周期内。 */
const notedUnknownVersions = new Set()

/** 版本组合是否命中某档案项（三键全等 = 该项 dshPackages——dsh-* 包全系同版）。 */
function baselineEntryOf(versions) {
  try {
    return HOST_BASELINE_REGISTRY.find((entry) => entry.dshPackages === versions.llm && entry.dshPackages === versions.tools && entry.dshPackages === versions.typertProtocol) ?? null
  } catch { /* 版本对象形状异常 → 视为 ∉ 档案（fail-safe，不阻断） */ }
  return null
}

/**
 * 运行面版本协商三态（ARCH-005 R2，设计 §2-B 四维-b）。
 *
 * 判定序（精确语义）：① 任一关键面 state ≠ 'ok'（degraded/missing）→
 * `incompatible`——面先于版本，不把故障伪装成「只是没测过」（§7.2 unknown
 * 判据收紧；面级降级继续运行不自杀，ARCH-004 D2 语义延续）；② 版本组合 ∈
 * 基线档案表（含 frozen 历史实测项）→ `matched`；③ ∉ 档案但面全绿 →
 * `compatible-unknown`——继续运行 + 健康徽章黄态「未实测宿主版本」提示 +
 * **一次性** `host-version-unknown` 诊断事件（noteHostDiag；同版本组合只记
 * 一次〔进程内——见 notedUnknownVersions 作用域限定〕，与既有诊断环形去重
 * 纪律一致——P8 可观测，禁无观测降级）。
 *
 * 两 regime 边界（§2-B）：本三态仅在 **gate-pass-unknown** regime 可达
 * （宿主版本落在声明范围内过装载门——如 `^0.2.0-rc.2` 下的 0.2.1-alpha.5 /
 * 0.2.0 final）；**gate-block** regime（minor 跳位 → app-boot 装载门整层拒载）
 * 下插件零运行机会，三态/徽章/诊断事件均不可达——该 regime 的失效可观测性
 * 由宿主 skip 警告（stderr）+ 雷达/靶子告警（插件外通道，R4 批）承载。
 *
 * 纯读纪律（§7.1 探针三时机）：versions = hostVersionsOf()（静态 require 包
 * 表，零探测）；faces = faceHealthSnapshot()（纯缓存读，零 probe 调用）——
 * render/RPC 消费同一纯函数，绝不触发探测。测试可注入 { versions, faces }
 * 桩做判别（P10-④ 判别夹具同源）。
 *
 * @param {{ versions?: object, faces?: Array }} [options] - 可选桩注入（缺省实读）。
 * @returns {{ state: string, baselineId: string, versions: object, faces: Array }}
 *   state ∈ HOST_CAPABILITY_STATES；baselineId = 命中档案项 id（未命中为 ''）。
 */
export function hostCapabilityProfile(options = {}) {
  const versions = options && typeof options.versions === 'object' && options.versions !== null ? options.versions : hostVersionsOf()
  const faces = Array.isArray(options?.faces) ? options.faces : faceHealthSnapshot()
  const hasDegradedFace = faces.some((face) => face && face.state !== 'ok')
  const entry = baselineEntryOf(versions)
  let state
  if (hasDegradedFace) state = 'incompatible'
  else if (entry !== null) state = 'matched'
  else state = 'compatible-unknown'
  if (state === 'compatible-unknown') {
    const key = `${versions.llm}|${versions.tools}|${versions.typertProtocol}`
    if (!notedUnknownVersions.has(key)) {
      notedUnknownVersions.add(key)
      noteHostDiag({
        kind: 'host-version-unknown',
        code: 'versions-not-in-baseline-registry',
        detail: `llm=${versions.llm} tools=${versions.tools} typertProtocol=${versions.typertProtocol} faces-green`,
      })
    }
  }
  return { state, baselineId: entry !== null ? entry.id : '', versions, faces }
}

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
