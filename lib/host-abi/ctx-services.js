/**
 * ARCH-004 域 3（设计 §4.3 域 3，EVO-019 B1 批）：Node 侧 ctx.get 服务群
 * （11 服务）的通用 probe + 具名访问器收敛。
 *
 * 归属批次声明：本文件 B1 落地 serviceFaceOf 通用探测 + 11 具名访问器
 * （§4.3 域 3 接口的直接实现——真实行为）；B4 批承载消费者切换
 * （service.js / host-route.js 24 处散点 `ctx.get(...)` inline 判断迁移至
 * 访问器 + 消费点黑名单看护落地）。B1 零消费者改动 = 设计状态（B4 迁移），
 * 非未实现存根。
 *
 * 方法形状契约来源：CTX_SERVICES 逐服务登记——键锚定现存消费者的实测
 * typeof 守卫（agentDefaultModel: preset-defaults.js:175,413；
 * sessionController: preset-defaults.js:214；agents: preset-defaults.js:194；
 * agentPresets: preset-defaults.js:163；sessionProjections: prestep.js:193；
 * llm: wrapper.js:516 / oauth-llm.js:449 / service.js:927；settings:
 * host-route.js:248）。未锚定方法集的服务（credentials/fs/attachments/
 * subagents）暂为存在性探测（空方法集）——B4 迁移各消费者时按实测守卫
 * 逐服务补齐，禁凭心智模型预写（P10-④）。
 * @module dsh-agent-router/host-abi/ctx-services
 */

/**
 * 11 个 Node 侧 ctx 服务的方法形状契约（探测口径单一事实源；B4 批随
 * 消费者迁移逐服务补齐方法集）。
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

/** 具名访问器生成（薄委托 serviceFaceOf——签名/语义 B4 批保持不变）。 */
const accessorOf = (name) => (ctx) => serviceFaceOf(ctx, name, CTX_SERVICES[name]).face

/** llm 适配器注册面访问器（llm runtime）。 */
export const llmOf = accessorOf('llm')
/** credentials 服务访问器。 */
export const credentialsOf = accessorOf('credentials')
/** settings 服务访问器。 */
export const settingsOf = accessorOf('settings')
/** fs 服务访问器。 */
export const fsOf = accessorOf('fs')
/** attachments 服务访问器。 */
export const attachmentsOf = accessorOf('attachments')
/** subagents 服务访问器。 */
export const subagentsOf = accessorOf('subagents')
/** agentDefaultModel（全局默认模型读写）访问器。 */
export const agentDefaultModelOf = accessorOf('agentDefaultModel')
/** sessionController（会话选择面）访问器。 */
export const sessionControllerOf = accessorOf('sessionController')
/** sessionProjections（会话投影）访问器。 */
export const sessionProjectionsOf = accessorOf('sessionProjections')
/** agents 注册表访问器（FIX-023：必须经 ctx.get 调用时解析）。 */
export const agentsRegistryOf = accessorOf('agents')
/** agentPresets（预设罗盘）访问器。 */
export const agentPresetsOf = accessorOf('agentPresets')
