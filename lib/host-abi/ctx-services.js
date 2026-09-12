/**
 * ARCH-004 域 3（设计 §4.3 域 3，EVO-019 B1 骨架 → EVO-022 B4 消费者切换
 * 收口）：Node 侧 ctx.get 服务群（11 服务）的通用 probe + 具名访问器收敛。
 *
 * B4 落地实况：serviceFaceOf 通用探测 + 11 具名访问器自 B1 起为直接实现；
 * B4 批承载 service.js（17 处高危面）+ host-route.js（7 处）共 24 处散点
 * `ctx.get(...)` inline 判断切换至访问器 + 消费点分级白名单看护
 * （tests/host-abi-health.mjs §8a——lib/*.js 非 host-abi 的裸消费精确快照，
 * 越界新增即红）。service.js 的 fs/settings 低危面直用按设计 §10 B4 白名
 * 单保留（分级放行，非切换遗漏）。
 *
 * F-2（EVO-021 R0 裁决，B4 收口）——访问器两级语义：
 * - 严格面（STRICT_SHAPE_FACES）：CTX_SERVICES 方法形状降级（面存在但
 *   方法非函数，如 agents 无 .get）→ **null + noteHostDiag**（显式降级
 *   上行，取代旧 inline 消费点 TypeError 被 handler catch 吞掉的静默
 *   fail-safe——preset-defaults 两消费点恢复 B3 前严格语义：fixup 继续 /
 *   no-agent warn）；
 * - 存在性面（其余服务）：仅存在性解析（face 为对象即返回），方法守卫由
 *   消费点自持（llm 的 listModels/resolveModelInfo/stream、settings 的
 *   get/mutate、agentDefaultModel 的 currentSelection 等守卫各消费点互异，
 *   且测试桩为最小形状——存在性解析是零回退锚定，禁凭域契约统一收紧）。
 *
 * F-1（EVO-021 R0 归属勘正，B4 收口）：agentPresetsServiceOf 自 llm-
 * selection 域迁入本域（§4.3 域 3 为准），与既有 agentPresetsOf 访问器
 * **归并单点**（语义重叠：同面同 composedPreset 门控——单一双形态实现，
 * 两导出名保留：agentPresetsServiceOf 原语义 undefined 兜底 / agentPresetsOf
 * 访问器语义 null 兜底，消费面零改动）。
 *
 * 方法形状契约来源：CTX_SERVICES 逐服务登记——键锚定现存消费者的实测
 * typeof 守卫（agentDefaultModel: preset-defaults.js / service.js defaults；
 * sessionController: preset-defaults.js:214；agents: preset-defaults.js:194；
 * agentPresets: preset-defaults.js:163；sessionProjections: prestep.js:193；
 * llm: wrapper.js:516 / oauth-llm.js:449 / service.js:927；settings:
 * host-route.js:248）。credentials/fs/attachments/subagents 为存在性探测
 * （空方法集——消费点守卫互异且自持，见 F-2 两级语义）。
 * @module dsh-agent-router/host-abi/ctx-services
 */
import { noteHostDiag } from './health.js'

/**
 * 11 个 Node 侧 ctx 服务的方法形状契约（探测口径单一事实源；严格面的
 * 访问器门控 + probe 数据源）。
 */
export const CTX_SERVICES = {
  llm: ['registerAdapter', 'listModels'],
  credentials: [],
  settings: ['mutate'],
  fs: [],
  attachments: [],
  subagents: [],
  agentDefaultModel: ['currentSelection', 'saveSelection'],
  sessionController: ['selectModel'],
  sessionProjections: ['stateOf'],
  agents: ['get'],
  agentPresets: ['composedPreset'],
}

/**
 * 严格形状面（F-2 裁决）：这些服务的访问器在 CTX_SERVICES 方法形状降级
 * 时返回 null + noteHostDiag。入选判据 = 面上无消费者依赖部分形状透传
 * （agents：B3 前本地实现即严格 typeof .get 检查——EVO-021 F-2 原案；
 * sessionController/sessionProjections/agentPresets：B4 时点零访问器
 * 消费者，严格化零回退面）。llm/settings/agentDefaultModel 等有消费者
 * 且桩为最小形状（smoke.mjs llm 桩无 registerAdapter / agentDefaultModel
 * 桩无 saveSelection）——存在性解析（见文件头 F-2 两级语义）。
 */
const STRICT_SHAPE_FACES = new Set(['agents', 'sessionController', 'sessionProjections'])

/**
 * 通用服务面探测（§4.3 域 3 唯一探测入口）：存在性 + 方法形状一次判定。
 * @param ctx - 宿主行 fiber ctx。
 * @param name - ctx.get 服务名（建议取 CTX_SERVICES 键）。
 * @param requiredMethods - 方法形状契约（省略 = 存在性探测）。
 * @returns `{ face: object|null, probe: FaceHealth }`——face 为解析到的
 *   服务对象（缺失/形状漂移时探测结果仍完整返回，face 仅在可安全持有时
 *   非 null；形状漂移时 face 返回原对象由调用方决定是否降级使用）。
 */
export function serviceFaceOf(ctx, name, requiredMethods = []) {
  let face = null
  try {
    const resolved = ctx && typeof ctx.get === 'function' ? ctx.get(name) : undefined
    face = resolved !== undefined && resolved !== null ? resolved : null
  } catch (error) {
    return { face: null, probe: { name, state: 'missing', detail: `host-face-missing: ${String(error?.message ?? error).slice(0, 80)}` } }
  }
  if (!face || typeof face !== 'object') return { face: null, probe: { name, state: 'missing', detail: 'host-face-missing' } }
  const missingMethods = requiredMethods.filter((method) => typeof face[method] !== 'function')
  if (missingMethods.length > 0) {
    return { face, probe: { name, state: 'degraded', detail: `host-face-shape: ${missingMethods.join(',')}` } }
  }
  return { face, probe: { name, state: 'ok' } }
}

/**
 * 具名访问器生成（F-2 两级语义，文件头）：严格面形状降级 → null +
 * noteHostDiag（显式降级上行）；存在性面 → face 或 null（消费点自持守卫）。
 */
const accessorOf = (name) => (ctx) => {
  const { face, probe } = serviceFaceOf(ctx, name, CTX_SERVICES[name])
  if (probe.state === 'degraded' && STRICT_SHAPE_FACES.has(name)) {
    noteHostDiag({ kind: 'face-degraded', face: name, code: 'host-face-shape', consumer: 'ctx-services', detail: probe.detail })
    return null
  }
  return face
}

/** llm 适配器注册面访问器（存在性解析——listModels/resolveModelInfo/stream 守卫消费点自持）。 */
export const llmOf = accessorOf('llm')
/** credentials 服务访问器（存在性解析——resolve/set/unset 守卫消费点自持）。 */
export const credentialsOf = accessorOf('credentials')
/** settings 服务访问器（存在性解析——get/mutate/describe 守卫消费点自持）。 */
export const settingsOf = accessorOf('settings')
/** fs 服务访问器（存在性解析——resolve/stat/readBytes 守卫消费点自持）。 */
export const fsOf = accessorOf('fs')
/** attachments 服务访问器（存在性解析——saveImage/readImage 守卫消费点自持）。 */
export const attachmentsOf = accessorOf('attachments')
/** subagents 服务访问器（存在性解析——start 守卫消费点自持）。 */
export const subagentsOf = accessorOf('subagents')
/** agentDefaultModel（全局默认模型读写）访问器（存在性解析——currentSelection/saveSelection 守卫消费点自持）。 */
export const agentDefaultModelOf = accessorOf('agentDefaultModel')
/** sessionController（会话选择面）访问器（严格面：selectModel 形状降级 → null + 诊断）。 */
export const sessionControllerOf = accessorOf('sessionController')
/** sessionProjections（会话投影）访问器（严格面：stateOf 形状降级 → null + 诊断）。 */
export const sessionProjectionsOf = accessorOf('sessionProjections')
/** agents 注册表访问器（严格面：FIX-023 必须经 ctx.get('agents') 调用时解析；.get 形状降级 → null + 诊断——EVO-021 F-2）。 */
export const agentsRegistryOf = accessorOf('agents')

/**
 * 宿主预设罗盘服务读取（P9 契约防御；EVO-021 B3 迁入 llm-selection →
 * EVO-022 B4 F-1 归属勘正迁回本域，§4.3 域 3 为准；迁移体原样）：
 * 事实源为 `ctx.agentPresets`（cordis 服务属性形态）；服务注册面差异时回落
 * `ctx.get('agentPresets')`。两形态都要求 composedPreset 为函数才采信
 * ——不存在/形态不符返回 undefined（调用方 header 兜底）。
 *
 * F-1 归并单点：与 agentPresetsOf 访问器语义重叠（同面同门控），本实现
 * 为唯一解析点——agentPresetsServiceOf 保留原 undefined 兜底语义
 * （preset-defaults 消费面零改动），agentPresetsOf 委托本实现并以 null
 * 为缺失兜底（访问器语义）。
 */
export function agentPresetsServiceOf(ctx) {
  try {
    const viaProperty = ctx?.agentPresets
    if (viaProperty && typeof viaProperty.composedPreset === 'function') return viaProperty
    const viaGet = ctx && typeof ctx.get === 'function' ? ctx.get('agentPresets') : undefined
    if (viaGet && typeof viaGet.composedPreset === 'function') return viaGet
  } catch { /* 服务查找抛错 → undefined（header 兜底） */ }
  return undefined
}

/** agentPresets（预设罗盘）访问器——委托 agentPresetsServiceOf 单点（F-1 归并；缺失兜底 null = 访问器语义）。 */
export const agentPresetsOf = (ctx) => agentPresetsServiceOf(ctx) ?? null
