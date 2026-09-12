/**
 * ARCH-004 域 1（设计 §4.3 域 1，EVO-019 B1 批）：客户端 remote.* 面的
 * 能力探测 + 健康快照（症状①主战场的 probe 面）。
 *
 * 归属批次声明：本文件 B1 落地 probe 面（真实探测行为）；B2 批承载
 * hostApiFace 本体迁入与消费者切换（createClientRemotes 唯一入口 + 旧信封
 * 映射表 + throw→degraded 语义，届时 lib/client.js 内原实现同批删除——P5）。
 * B1 不预置 createClientRemotes：其真实实现即 hostApiFace 本体，提前落此
 * = 与 lib/client.js 现存实现双份并存（P5 违规），故以文件头声明批次归属，
 * 非未实现存根。
 *
 * 探测语义（§4.3 域 1 能力探测）：每面 = 存在性（ctx.get('remote.<name>')
 * 优先 + ctx.remote.<name> 属性面兜底——FIX-027 双形态先例
 * lib/client.js:4904-4907 同构）+ 方法形状校验（关键方法 typeof 检查）。
 * FaceHealth 状态映射：面未挂载 → missing（host-face-missing）；面在而方法
 * 缺失 → degraded（host-face-shape: <缺失方法表>）；全部就绪 → ok。
 * @module dsh-agent-router/host-abi/client-remotes
 */

/**
 * 客户端 remote.* 五命名空间的方法形状契约（FIX-028 hostApiFace 实测消费
 * 面：lib/client.js:4925-5042 各 face 的 typeof 守卫逐一收录——形状漂移
 * （面在方法变）即 probe 红，BR-02 第一层防线）。
 */
export const CLIENT_REMOTE_FACES = {
  llm: ['listProviders', 'listConfigurableProviders', 'discoverModels'],
  settings: ['describe', 'mutate'],
  credentials: ['describe', 'set', 'unset'],
  agentPresets: ['list'],
  session: ['modelCatalog', 'selectModel'],
}

/**
 * 单面能力探测（§4.3 域 1）：存在性（双形态解析）+ 方法形状校验。
 * @param ctx - 客户端 fiber ctx（inject 声明见 inject-manifest 域 FIBER_INJECT）。
 * @param name - 命名空间名（CLIENT_REMOTE_FACES 键；未登记名 = 存在性-only 探测）。
 * @returns FaceHealth `{ name, state: 'ok'|'degraded'|'missing', detail? }`。
 */
export function probeRemoteFace(ctx, name) {
  const requiredMethods = CLIENT_REMOTE_FACES[name] ?? []
  let face
  try {
    const viaGet = ctx && typeof ctx.get === 'function' ? ctx.get(`remote.${name}`) : undefined
    face = viaGet !== undefined ? viaGet : (ctx && ctx.remote ? ctx.remote[name] : undefined)
  } catch (error) {
    return { name, state: 'missing', detail: `host-face-missing: ${String(error?.message ?? error).slice(0, 80)}` }
  }
  if (!face || typeof face !== 'object') return { name, state: 'missing', detail: 'host-face-missing' }
  const missingMethods = requiredMethods.filter((method) => typeof face[method] !== 'function')
  if (missingMethods.length > 0) return { name, state: 'degraded', detail: `host-face-shape: ${missingMethods.join(',')}` }
  return { name, state: 'ok' }
}

/**
 * 客户端宿主面健康快照：CLIENT_REMOTE_FACES 全量逐面探测（健康面板数据
 * 源之一；B2 批接入 runFaceProbes 注册表后统一经 health 域缓存下发）。
 */
export function clientRemotesHealth(ctx) {
  return Object.keys(CLIENT_REMOTE_FACES).map((name) => probeRemoteFace(ctx, name))
}
