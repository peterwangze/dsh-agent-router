/**
 * ARCH-004 域 4（设计 §4.3 域 4 / W-3 收窄口径，EVO-019 B1 骨架 → EVO-023 B5
 * 消费者收敛）：共享环境事件订阅单点——域管事件（多消费者/跨面环境事件）的
 * 共享 listener + 按名分发 + 卸载聚合 + 回环 gate 纪律 + 转发事件白名单防线。
 *
 * B5 落地实况：① 域管五事件清单（MANAGED_EVENTS）显式化；② 转发面（客户端
 * `$on`）订阅白名单双检的**运行时**半边启用——白名单外事件名订阅即拒绝 +
 * 诊断（W-4；静态半边 = 插件 `$on` 事件名 ⊆ 白名单的比对测试，B6 成体系）；
 * ③ 跨调用共享 listener 注册表——同目标（同一 host ctx / 同一 `$on` 闭包）
 * 同事件名多次 subscribeEvents 收敛为**单个**宿主 listener（D1-9：4 处
 * settings/updated 独立订阅 → 1），卸载按 consumer 摘除、消费者清零才真正
 * dispose（卸载聚合）。消费者迁移：index.js 统计持久化 + service.js 宿主路由
 * 维护（settings/updated）+ preset-defaults `agent-preset/selected`。scoped
 * 生命周期钩子（agent/pre-step、agent/created、agent/request）按 W-3 裁决保留
 * 直订不经域（veto 语义/热路径零介入），B6 黑名单与此口径对齐。
 *
 * gate 纪律（F-1 先例 lib/host-route.js 的 syncHostRoute 回环门通用化）：
 * 声明 gate 的订阅（事件→写操作消费者）在 armEventGate(kind, key, true) 挂起
 * 期间被跳过并记环形（event-gated）——消费者在自身失败态挂 gate，环在首次
 * 失败后即断裂。**口径边界**：域 gate 是**整 handler 抑制**；host-route 的
 * F-1 是**写级**部分抑制（失败态下 llm 事件 pass 照跑只读状态/user-modified
 * 检查、仅写收敛到 tick——tests/oauth-main-model.mjs F1-2 断言的 lastAction=
 * gated 契约），故该订阅不声明域 gate（整 handler 跳过会丢只读检查 = 语义
 * 回退）；域 gate 供「整个 handler 即写路径」的消费者使用。
 * @module dsh-agent-router/host-abi/events
 */
import { noteHostDiag } from './health.js'

/**
 * 域管事件清单（§4.3 域 4 ①，W-3 收窄口径）：多消费者/跨面环境事件——经
 * `ctx.on`（Node 面）或 `ctx.remote.$on`（客户端转发面）订阅，共享 listener +
 * 按名分发 + 卸载聚合。scoped 生命周期钩子（agent/pre-step、agent/created、
 * agent/request）**不在**本清单（保留直订，理由见文件头 W-3 三条）。
 */
export const MANAGED_EVENTS = [
  'settings/updated',
  'llm/adapters-updated',
  'settings/document-updated',
  'agent-preset/selected',
  'credentials/reference-updated',
]

/**
 * 宿主转发事件白名单镜像（单一声明源 dsh-api-remotes/lib/types/
 * remote-events.js:12-32 实读 19 项；B6 批静态比对测试锁定同步——镜像与
 * 宿主声明任一侧漂移即红）。Analyst D-2 锚：credentials/reference-updated
 * 在表（:21）；credentials/updated 不在表（lib/client.js 死订阅根因，
 * B5 修复承载）。
 */
export const FORWARDED_EVENT_ALLOWLIST = [
  'agent-preset/selected',
  'approval/request',
  'api-session/activity',
  'api-session/added',
  'api-session/error',
  'api-session/removed',
  'api-session/status',
  'commands/change',
  'credentials/reference-updated',
  'goal/activation-changed',
  'cordis/request-run',
  'cordis/request-run-resolved',
  'cordis/dynamic-package',
  'cordis/dynamic-retract',
  'cordis/inspect-query',
  'cordis/inspect-query-resolved',
  'llm/adapters-updated',
  'settings/document-updated',
  'user-questions/request',
]

/**
 * 转发事件可达性判定（§4.3 域 4 能力探测的纯函数面）：事件名在宿主转发白名单
 * 镜像内 = 客户端 `$on` 可订阅。非字符串/空串 → false（防御宿主/消费点传参）。
 */
export function isForwardedEvent(event) {
  return typeof event === 'string' && FORWARDED_EVENT_ALLOWLIST.includes(event)
}

/** gate 挂起表（kind\u0000key → armed）。模块级与诊断环形同构（进程内单点）。 */
const armedGates = new Set()

const gateKeyOf = (kind, key) => `${String(kind).slice(0, 64)}\u0000${String(key).slice(0, 64)}`

/**
 * 挂起/解除一个事件回环 gate（F-1 通用化：消费者在失败态 arm，恢复/tick
 * 治愈后 disarm；arm 期间该 (kind, key) 声明的订阅被跳过并记环形）。
 */
export function armEventGate(kind, key, armed) {
  try {
    if (armed === true) armedGates.add(gateKeyOf(kind, key))
    else armedGates.delete(gateKeyOf(kind, key))
  } catch { /* gate 失败不影响主链 */ }
}

/**
 * 共享订阅注册表：目标（host ctx 对象 / 客户端 `$on` 函数）→ 事件名 → 条目
 * { consumers, dispose }。WeakMap 键控防目标泄漏；条目随最后消费者卸载删除。
 * 跨调用复用 = 同一事件名在宿主的 listener 数等于 1（而非每模块一份）。
 */
const sharedListeners = new WeakMap()

const entryTableOf = (target) => {
  let table = sharedListeners.get(target)
  if (!table) {
    table = new Map()
    sharedListeners.set(target, table)
  }
  return table
}

/**
 * 单条目按名分发（逐 consumer fail-safe + gate 抑制；快照遍历防分发中改表）。
 * 返回值语义：单 consumer 且 handler 返回 thenable 时**原样透传该 promise**
 * （宿主 `ctx.on` 对返回值 fire-and-forget 不受影响；测试/调用方 `await
 * handler(...)` 语义与直订等价——preset-defaults 串行队列测试依赖）；多
 * consumer 返回的 promise 合并为 Promise.all；无 thenable 返回时零 Promise
 * 分配（§7.1 透传开销预算：不新增异步跳数）。
 */
const dispatchTo = (event, entry, args) => {
  const pending = []
  for (const consumer of entry.consumers.slice()) {
    if (consumer.gate && armedGates.has(gateKeyOf(consumer.gate.kind, consumer.gate.key))) {
      noteHostDiag({ kind: 'event-gated', face: event, consumer: consumer.consumer, code: 'suppressed' })
      continue
    }
    try {
      const outcome = consumer.handler(...args)
      if (outcome && typeof outcome.then === 'function') pending.push(outcome)
    } catch (error) {
      noteHostDiag({ kind: 'event-handler-error', face: event, consumer: consumer.consumer, detail: String(error?.message ?? error).slice(0, 120) })
    }
  }
  if (pending.length === 0) return undefined
  return pending.length === 1 ? pending[0] : Promise.all(pending)
}

/**
 * 共享环境事件订阅（§4.3 域 4 接口）：同事件名多 consumer 共享单 listener
 * （D1-9），逐 consumer fail-safe 分发（handler 抛错 → 环形记录
 * event-handler-error，绝不外泄击穿宿主分发），订阅/拒绝/失败全量 P8 可观测。
 *
 * 目标形态自动判定（单一实现覆盖两面，接口签名不变）：
 * - 宿主行 ctx（`{ on }`）→ Node 环境事件面（settings/updated、agent-preset/
 *   selected 等 cordis 事件；不做白名单约束——转发白名单只约束客户端面）；
 * - 客户端 `$on` 函数（`ctx.remote.$on` 包装）→ 转发事件面：事件名必须 ⊆
 *   FORWARDED_EVENT_ALLOWLIST，外名**订阅即拒绝** + event-subscribe-rejected
 *   （code=not-forwarded）诊断（W-4 运行时半边；D-2 死订阅的机器防线）。
 *
 * @param target - 宿主 ctx（ctx.on）或客户端 `$on` 函数。
 * @param subscriptions - [{ event, consumer?, handler(args…), gate?: {kind, key} }]
 * @returns disposeAll（卸载本调用的全部 consumer；最后一个 consumer 摘除时
 *   真正 dispose 共享 listener）。
 */
export function subscribeEvents(target, subscriptions) {
  const forwardedFace = typeof target === 'function'
  const attach = forwardedFace
    ? (event, handler) => target(event, handler)
    : target && typeof target.on === 'function'
      ? (event, handler) => target.on(event, handler)
      : null
  const perEvent = new Map()
  for (const sub of Array.isArray(subscriptions) ? subscriptions : []) {
    if (!sub || typeof sub.event !== 'string' || !sub.event || typeof sub.handler !== 'function') {
      noteHostDiag({ kind: 'event-subscribe-rejected', code: 'invalid-shape', detail: 'invalid subscription shape' })
      continue
    }
    const consumer = typeof sub.consumer === 'string' && sub.consumer ? sub.consumer : ''
    if (forwardedFace && !isForwardedEvent(sub.event)) {
      noteHostDiag({ kind: 'event-subscribe-rejected', face: sub.event.slice(0, 64), consumer, code: 'not-forwarded', detail: 'event absent from API_REMOTE_FORWARDED_EVENTS mirror (dead subscription)' })
      continue
    }
    const gate = sub.gate && typeof sub.gate === 'object' && typeof sub.gate.kind === 'string' && sub.gate.kind
      && typeof sub.gate.key === 'string' && sub.gate.key ? { kind: sub.gate.kind, key: sub.gate.key } : null
    const consumers = perEvent.get(sub.event) ?? []
    consumers.push({ consumer, handler: sub.handler, gate })
    perEvent.set(sub.event, consumers)
  }
  if (!attach) {
    if (perEvent.size > 0) noteHostDiag({ kind: 'event-subscribe-failed', detail: 'target exposes neither ctx.on nor a $on function' })
    return () => {}
  }
  const table = entryTableOf(target)
  const disposers = []
  for (const [event, consumers] of perEvent) {
    let entry = table.get(event)
    if (!entry) {
      const created = { consumers: [], dispose: null }
      const sharedListener = (...args) => dispatchTo(event, created, args)
      try {
        const dispose = attach(event, sharedListener)
        created.dispose = typeof dispose === 'function' ? dispose : null
        if (typeof dispose !== 'function') noteHostDiag({ kind: 'event-subscribe-failed', face: event, detail: 'host returned no disposer' })
      } catch (error) {
        noteHostDiag({ kind: 'event-subscribe-failed', face: event, detail: String(error?.message ?? error).slice(0, 120) })
      }
      entry = created
      table.set(event, created)
    }
    entry.consumers.push(...consumers)
    for (const consumer of consumers) {
      noteHostDiag({ kind: 'event-subscribed', face: event, consumer: consumer.consumer, code: consumer.gate ? 'gated' : 'ungated' })
    }
    disposers.push(() => {
      for (const consumer of consumers) {
        const index = entry.consumers.indexOf(consumer)
        if (index >= 0) entry.consumers.splice(index, 1)
      }
      if (entry.consumers.length === 0) {
        try { entry.dispose?.() } catch { /* 卸载尽力而为 */ }
        if (table.get(event) === entry) table.delete(event)
      }
    })
  }
  return () => {
    for (const dispose of disposers.splice(0)) {
      try { dispose() } catch { /* 卸载尽力而为 */ }
    }
  }
}
