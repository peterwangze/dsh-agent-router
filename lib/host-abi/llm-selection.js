/**
 * ARCH-004 域 2（设计 §4.3 域 2，EVO-019 B1 批）：llm·selection 面（断裂
 * 重灾区——12 次断裂史中 6 次所在面）的 probe 面。
 *
 * 归属批次声明：本文件 B1 落地 probe 面（真实探测行为）；B3 批承载适配器
 * 本体迁入与消费者切换（llmFaceOf / sessionSelectFaceOf / inheritedRouteOf /
 * liveDefaultSelection / sessionNeverProduced——签名见设计 §4.3 域 2 接口，
 * 自 lib/preset-defaults.js:173-263 与 lib/prestep.js:209-218 迁入并删除
 * 重复实现，P5）。B1 不预置上述适配函数：提前落此 = 与 preset-defaults.js
 * 现存实现双份并存（P5 违规），故以文件头声明批次归属，非未实现存根。
 *
 * 探测语义（§4.3 域 2 能力探测，宿主锚点一手实读）：
 * - llm 适配器注册面：registerAdapter / listModels 形状（三处独立检查的
 *   收敛目标——lib/wrapper.js:516-519 / lib/oauth-llm.js:449-452 /
 *   lib/service.js:927-928）；
 * - 会话选择面：sessionController.selectModel（宿主锚点
 *   dsh-api-session-controller index.js:605,2502-2503；apiProxy 旧面回落
 *   由 D1-2/B3 删除，域内单形态探测）。
 * @module dsh-agent-router/host-abi/llm-selection
 */

/**
 * llm 适配器注册面探测：ctx.get('llm') 存在性 + registerAdapter/listModels
 * 方法形状。FaceHealth 形状（state 映射同 client-remotes 域约定）。
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
 * 形状（0.1.2-rc.1 起唯一形态；D1-2 裁决 apiProxy 旧面回落 B3 删除）。
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
