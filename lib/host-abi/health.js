/**
 * ARCH-004 域 7（设计 §4.3 域 7 / §6.1，EVO-019 B1 批）：宿主面诊断基础
 * 设施——noteHostDiag 通用诊断环形（presetDiag 同构泛化，先例
 * lib/preset-defaults.js:116-124：模块级有界环形 + 字段白名单 + 截断 +
 * try/catch 全防护）+ FaceHealth 形状与 probe 运行器（惰性）。
 *
 * 零宿主依赖纪律：本模块纯数据（JSON 安全，进程内诊断面），被其余六域
 * 依赖（§4.2 依赖图最底层），自身不 import 任何宿主面/消费者模块。
 *
 * probe 三时机纪律（§7.1「绝不进渲染路径」的机制承载）：
 * - registerFaceProbes：各域 apply 时一次性注册（B2-B5 迁移批次接线）；
 * - runFaceProbes：显式自检（手动/失败驱动）——唯一 probe 触发器；
 * - faceHealthSnapshot：纯缓存读（零 probe 调用）——渲染路径/健康面板/
 *   RPC 的唯一合法数据源（读快照绝不触发探测）。
 * B1 批注册表为空属设计状态（faces [] 诚实空态），随 B2-B5 逐域填充。
 * @module dsh-agent-router/host-abi/health
 */

/** 宿主诊断环形上限（先例 PRESET_DIAG_LIMIT=64，FIX-030-C 同构）。 */
export const HOST_DIAG_LIMIT = 64

/** FaceHealth 合法状态集（§4.3：ok = 探测通过 / degraded = 面在但形状漂移或探针失败 / missing = 面未挂载）。 */
const FACE_STATES = ['ok', 'degraded', 'missing']

/**
 * 宿主面诊断注册表（模块级有界环形——进程内诊断面，service 经 RPC
 * `router/hostFaceDiagnostics` 下发；纯数据无宿主引用，JSON 安全）。
 * 条目形状：{ at, kind, face?, consumer?, code?, detail? }——kind 为事件
 * 短码（face-state / event-subscribed / event-handler-error / …各域自定）；
 * 字段白名单 + 长度截断（presetDiag :127-141 纪律同构），诊断失败绝不
 * 影响主链。
 */
const hostDiag = { entries: [] }

export function noteHostDiag(entry) {
  try {
    const record = {
      at: Date.now(),
      kind: typeof entry?.kind === 'string' && entry.kind ? entry.kind.slice(0, 64) : '?',
      ...(typeof entry?.face === 'string' && entry.face ? { face: entry.face.slice(0, 64) } : {}),
      ...(typeof entry?.consumer === 'string' && entry.consumer ? { consumer: entry.consumer.slice(0, 64) } : {}),
      ...(typeof entry?.code === 'string' && entry.code ? { code: entry.code.slice(0, 48) } : {}),
      ...(typeof entry?.detail === 'string' && entry.detail ? { detail: entry.detail.slice(0, 160) } : {}),
    }
    hostDiag.entries.push(record)
    if (hostDiag.entries.length > HOST_DIAG_LIMIT) hostDiag.entries.splice(0, hostDiag.entries.length - HOST_DIAG_LIMIT)
  } catch { /* 诊断失败绝不影响主链（presetDiag 同款纪律） */ }
}

/** 诊断快照（RPC 下发面——返回拷贝，调用方只读）。 */
export function hostDiagnostics() {
  return { entries: hostDiag.entries.slice() }
}

// ── FaceHealth probe 运行器（惰性）────────────────────────────────────────

/** 已注册 face probe 表（name → probe(ctx)）；B1 落机制、B2-B5 各域接线注册。 */
const faceProbes = new Map()

/** 最近一次 runFaceProbes 的缓存快照（faceHealthSnapshot 的唯一数据源）。 */
let faceHealthCache = []

/**
 * 注册 face probe 清单（各域 apply 时一次性调用；同名幂等覆盖）。
 * @param probes - [{ name: string, probe: (ctx) => { state, detail? } | FaceHealth }]
 *   probe 返回 { state: 'ok'|'degraded'|'missing', detail? }；抛错由
 *   runFaceProbes 兜底为 degraded（fail-safe，绝不外泄）。
 */
export function registerFaceProbes(probes) {
  try {
    for (const item of Array.isArray(probes) ? probes : []) {
      if (!item || typeof item.name !== 'string' || !item.name) continue
      if (typeof item.probe !== 'function') continue
      faceProbes.set(item.name, item.probe)
    }
  } catch { /* 注册失败绝不影响主链 */ }
}

/**
 * FaceHealth 缓存快照（纯读：零 probe 调用——渲染路径/RPC/健康面板唯一
 * 合法数据源；§7.1 探针惰性化的机制保证）。返回拷贝。
 */
export function faceHealthSnapshot() {
  return faceHealthCache.map((face) => ({ ...face }))
}

/**
 * 一键自检（手动/失败驱动；唯一 probe 触发器）：逐个执行已注册 probe →
 * FaceHealth[]，结果写入缓存。状态变化（与上次快记比对）才入诊断环形
 * （§6.1「含 face 探测结果变化」；首跑建基线静默）。单 probe 抛错 →
 * degraded + 环形记录，绝不外泄（fail-safe）。返回快照拷贝。
 */
export function runFaceProbes(ctx) {
  const results = []
  try {
    for (const [name, probe] of faceProbes) {
      let face
      try {
        const outcome = probe(ctx)
        const state = FACE_STATES.includes(outcome?.state) ? outcome.state : 'degraded'
        face = { name, state, ...(typeof outcome?.detail === 'string' && outcome.detail ? { detail: outcome.detail.slice(0, 160) } : state === 'ok' ? {} : { detail: 'probe-result-unusable' }) }
      } catch (error) {
        face = { name, state: 'degraded', detail: `probe-threw: ${String(error?.message ?? error).slice(0, 120)}` }
      }
      const previous = faceHealthCache.find((item) => item.name === name)
      if (previous && previous.state !== face.state) {
        noteHostDiag({ kind: 'face-state', face: name, code: face.state, detail: face.detail })
      }
      results.push(face)
    }
    faceHealthCache = results
  } catch { /* 自检失败绝不影响主链 */ }
  return faceHealthSnapshot()
}
