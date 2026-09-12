/**
 * ARCH-004 域 2（设计 §4.3 域 2；EVO-019 B1 probe 骨架 → EVO-021 B3 批
 * 落成适配器本体）：llm·selection 面（断裂重灾区——12 次断裂史中 6 次
 * 所在面）。
 *
 * 域接口（§4.3 域 2 接口行）：llmFaceOf(ctx) / sessionSelectFaceOf(ctx) /
 * inheritedRouteOf(parent) / liveDefaultSelection(ctx) /
 * sessionNeverProduced(agent) + agentPresetsServiceOf(ctx)（预设罗盘
 * 双形态解析，随 B3 消费者 preset-defaults.js 迁入）。
 *
 * 宿主锚点（0.1.5-rc.2 node_modules 一手实读）：llm 适配器注册面 =
 * LlmRuntime（@deepseek-ai/dsh-llm lib/index.js:1698 类定义）——
 * registerAdapter :1780 / registration :2177 / listModels :2018 三方法
 * 齐备；会话选择面 = sessionController.selectModel
 * （dsh-api-session-controller index.js:605, 2502-2503）。
 *
 * 归属勘正（Coordinator 裁准）：agentsRegistryOf 不在本域——B1 已在
 * ctx-services.js 落地（设计 §4.3 域 3 的归属裁决），且桶（index.js 星导出）
 * 重复导出同名会成歧义名、击穿 host-abi-health.mjs 的桶解构断言；
 * preset-defaults.js 经桶 import ctx-services 的 agentsRegistryOf。
 * 设计 §10 B3 行「agentsRegistryOf 迁 llm-selection.js」措辞以此事实勘正。
 *
 * D1-2（apiProxy 旧面删除，ADR-ARCH-004-B）：sessionSelectFaceOf 单形态
 * （sessionController）。旧宿主（≤0.1.1-rc.x）apiProxy.sessions 面
 * （payload/result 双信封）自 0.1.2 起全包零注册（FIX-030 取证）已删——
 * 需兼容旧宿主时加回成本 = sessionSelectFaceOf 内 1 个回落分支（经 apiProxy
 * 服务名解析 sessions 面、selectModel 以 payload 信封调用并按 result 信封
 * 归一，删除前实现见本仓库 git 历史 lib/preset-defaults.js:226-238）+
 * 1 组判别测试（tests/preset-defaults.mjs N 节负向守卫届时翻转为正向）。
 *
 * P2-1 拆半（EVO-019 R0 归并，Coordinator 裁准）：功能性门控 llmFaceOf
 * 用 §4.3 三方法并集（registerAdapter/registration/listModels——收敛
 * wrapper.js / oauth-llm.js 两处独立检查；service.js safeListModels 的
 * listModels 单方法检查留 B4 批切换）。probeLlmAdapterFace 方法集保持
 * {registerAdapter, listModels}——其 'ok' 判定被 host-abi-health.mjs
 * 探测抽样断言锚定（桩同步至三方法已绑定 EVO-020 收口条件）。
 * @module dsh-agent-router/host-abi/llm-selection
 */
import { noteHostDiag } from './health.js'

/** llm 适配器注册面方法契约（§4.3 域 2 职责①：三处独立检查的并集）。 */
const LLM_FACE_METHODS = ['registerAdapter', 'registration', 'listModels']

/**
 * llm 适配器注册面访问器（B3 消费者门控：installAdmissionWrapper /
 * installOauthLlmAdapters 的形状检查收敛点；safeListModels 留 B4）：
 * 存在性 + 三方法 typeof 判定，形状不符/面缺失/查找抛错 → null（调用方
 * 既有 warn 降级路径不变，P8）。
 */
export function llmFaceOf(ctx) {
  try {
    const llm = ctx && typeof ctx.get === 'function' ? ctx.get('llm') : undefined
    if (!llm || typeof llm !== 'object') return null
    return LLM_FACE_METHODS.every((method) => typeof llm[method] === 'function') ? llm : null
  } catch { /* 服务查找抛错 → null（调用方 warn 降级） */ }
  return null
}

/**
 * llm 适配器注册面探测：ctx.get('llm') 存在性 + registerAdapter/listModels
 * 方法形状。FaceHealth 形状（state 映射同 client-remotes 域约定）。
 * 方法集锚定：host-abi-health.mjs 探测抽样断言（'ok' 桩 = 两方法）——
 * 并集化的 probe 半项随该桩同步收口（P2-1 拆半，文件头注）。
 */
export function probeLlmAdapterFace(ctx) {
  let llm
  try {
    llm = ctx && typeof ctx.get === 'function' ? ctx.get('llm') : undefined
  } catch (error) {
    return { name: 'llm', state: 'missing', detail: `host-face-missing: ${String(error?.message ?? error).slice(0, 80)}` }
  }
  if (!llm || typeof llm !== 'object') return { name: 'llm', state: 'missing', detail: 'host-face-missing' }
  const missingMethods = ['registerAdapter', 'listModels'].filter((method) => typeof llm[method] !== 'function')
  if (missingMethods.length > 0) return { name: 'llm', state: 'degraded', detail: `host-face-shape: ${missingMethods.join(',')}` }
  return { name: 'llm', state: 'ok' }
}

/**
 * 会话选择面探测：ctx.get('sessionController') 存在性 + selectModel 方法
 * 形状（0.1.2-rc.1 起唯一形态；D1-2 裁决 apiProxy 旧面回落 B3 删除——
 * 本文件 sessionSelectFaceOf 已单形态化）。
 */
export function probeSessionSelectFace(ctx) {
  let controller
  try {
    controller = ctx && typeof ctx.get === 'function' ? ctx.get('sessionController') : undefined
  } catch (error) {
    return { name: 'sessionSelect', state: 'missing', detail: `host-face-missing: ${String(error?.message ?? error).slice(0, 80)}` }
  }
  if (controller && typeof controller === 'object' && typeof controller.selectModel === 'function') {
    return { name: 'sessionSelect', state: 'ok' }
  }
  return { name: 'sessionSelect', state: 'missing', detail: 'host-face-missing' }
}

/**
 * 会话选择面解析（§4.3 域 2 唯一实现；迁移自 preset-defaults.js:209-240
 * 并按 D1-2 删除 apiProxy 旧面回落，单形态 sessionController）：宿主锚点
 * dsh-api-session-controller `super(ctx, "sessionController", {namespace:
 * "session"})`；selectModel 公共命令（直接参数；成功返回 {selected} 值，
 * 失败抛 RemoteError）→ 归一信封 {ok:true}|{ok:false,code,message}。
 * 面缺失/查找抛错 → null + noteHostDiag（§4.3 域 2 降级行为）——消费者
 * 走既有零动作路径（preset-defaults.js seed 的 P8 降级 warn 语义不变）。
 * @returns {(selection: {sessionId, provider, model, reasoningEffort?}) =>
 *   Promise<{ok: true} | {ok: false, code: string, message: string}> | null}
 */
export function sessionSelectFaceOf(ctx) {
  let controller
  try {
    controller = ctx && typeof ctx.get === 'function' ? ctx.get('sessionController') : undefined
  } catch (error) {
    noteHostDiag({ kind: 'face-degraded', face: 'sessionSelect', consumer: 'preset-seed', code: 'host-face-missing', detail: String(error?.message ?? error).slice(0, 80) })
    return null
  }
  if (controller && typeof controller === 'object' && typeof controller.selectModel === 'function') {
    return async (selection) => {
      try {
        await controller.selectModel({ ...selection })
        return { ok: true }
      } catch (error) {
        return { ok: false, code: String(error?.code ?? 'select-failed'), message: String(error?.message ?? error).slice(0, 300) }
      }
    }
  }
  noteHostDiag({ kind: 'face-degraded', face: 'sessionSelect', consumer: 'preset-seed', code: 'host-face-missing' })
  return null
}

/**
 * 子代理继承基线（FIX-030-B：与宿主 parentAgentOptionsForDelegation 同构；
 * 迁移自 preset-defaults.js:249-263 原样）：父最近请求头路由优先
 * （`parent.session.requestHeader()?.config`——新宿主「The latest request
 * header owns provider, model…」语义），无 header 回落 `parent.options`
 * （旧宿主/父未发请求形态）。返回 null = 基线不可读（父缺失/形态漂移——
 * 调用方保护降级为 fixup 继续，EVO-013 F-4 台账域既有边缘）。
 */
export function inheritedRouteOf(parent) {
  try {
    const headerConfig = parent?.session?.requestHeader?.()?.config
    if (headerConfig && typeof headerConfig.provider === 'string' && headerConfig.provider
      && typeof headerConfig.model === 'string' && headerConfig.model) {
      return { provider: headerConfig.provider, model: headerConfig.model }
    }
    const options = parent?.options
    if (options && typeof options.provider === 'string' && options.provider
      && typeof options.model === 'string' && options.model) {
      return { provider: options.provider, model: options.model }
    }
  } catch { /* 基线读取抛错 → null（调用方降级） */ }
  return null
}

/**
 * live 全局默认读取（每次现读，绝不缓存；域内唯一实现——消除
 * preset-defaults.js 与 prestep.js 双份重复，P5）：`ctx.get('agentDefaultModel')
 * .currentSelection()`；与宿主 selectionFor 第三层同源同时效（host
 * `defaultModelSelection: () => ctx.agentDefaultModel.currentSelection()`）。
 * 服务缺失/无 currentSelection/抛错/空值 → null（调用方回落 options 终回退；
 * P-v2 原则 8：能力判定缺失回落方向确定）。
 */
export function liveDefaultSelection(ctx) {
  try {
    const service = ctx && typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : undefined
    if (!service || typeof service.currentSelection !== 'function') return null
    const current = service.currentSelection()
    return current && typeof current === 'object' ? current : null
  } catch {
    return null
  }
}

/**
 * 会话空白判别（FIX-025；迁移自 preset-defaults.js:303-307 原样）：与宿主
 * sessionBlank **完全同构**（dsh-host-apiproxy L1187-1189：
 * `!session.events.some(e => e.type === 'turn/start')`——标题/目标/命令/
 * plan-mode 等独立事件不开启 turn，老无消息会话宿主仍判空白）。events
 * 不可读（形态漂移）回落 requestHeader 反演——保守方向：宁漏播不误播。
 */
export function sessionNeverProduced(agent) {
  const events = agent?.session?.events
  if (Array.isArray(events)) return !events.some((event) => event && event.type === 'turn/start')
  return agent?.session?.requestHeader?.() ? false : true
}

/**
 * 宿主预设罗盘服务读取（P9 契约防御；迁移自 preset-defaults.js:159-167
 * 原样）：事实源为 `ctx.agentPresets`（cordis 服务属性形态）；服务注册面
 * 差异时回落 `ctx.get('agentPresets')`。两形态都要求 composedPreset 为
 * 函数才采信——不存在/形态不符返回 undefined（调用方 header 兜底）。
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
