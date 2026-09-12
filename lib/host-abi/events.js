/**
 * ARCH-004 域 4（设计 §4.3 域 4 / W-3 收窄口径，EVO-019 B1 批）：共享
 * 环境事件订阅单点——域管事件（多消费者/跨面环境事件）的共享 listener +
 * 按名分发 + 卸载聚合 + 回环 gate 纪律 + 转发事件白名单镜像。
 *
 * 归属批次声明：本文件 B1 落地订阅机制本体（真实行为：同事件名多 consumer
 * 共享单 listener〔D1-9 收敛〕+ fail-safe 分发 + gate 抑制 + P8 环形可观测
 * + 白名单镜像常量）；B5 批承载消费者迁移（4 处 settings/updated 与 2 处
 * llm/adapters-updated 独立订阅收敛至此 + catalog 轮询挂域统一管理 +
 * 客户端 $on 死订阅修复〔W-4：lib/client.js:2093 credentials/updated →
 * credentials/reference-updated〕+ 运行时白名单拒绝防线启用）。scoped
 * 生命周期钩子（agent/pre-step、agent/created、agent/request）按 W-3 裁决
 * 保留直订不经域（veto 语义/热路径零介入），B6 黑名单与此口径对齐。
 *
 * gate 纪律（F-1 先例 lib/host-route.js:263-270 通用化）：声明 gate 的订阅
 * （事件→写操作消费者）在 armEventGate(kind, key, true) 挂起期间被跳过并
 * 记环形（event-gated）——消费者在自身失败态挂 gate（对应 F-1 的
 * failures>0 条件门），环在首次失败后即断裂。
 * @module dsh-agent-router/host-abi/events
 */
import { noteHostDiag } from './health.js'

/**
 * 宿主转发事件白名单镜像（单一声明源 dsh-api-remotes/lib/types/
 * remote-events.js:12-32 实读 19 项；B6 批静态比对测试锁定同步——镜像与
 * 宿主声明任一侧漂移即红）。Analyst D-2 锚：credentials/reference-updated
 * 在表（:21）；credentials/updated 不在表（lib/client.js:2093 死订阅根因，
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
 * 共享环境事件订阅（§4.3 域 4 接口）：同事件名多 consumer 共享单
 * ctx.on listener（D1-9），逐 consumer fail-safe 分发（handler 抛错 →
 * 环形记录 event-handler-error，绝不外泄击穿宿主分发），订阅/拒绝/失败
 * 全量 P8 可观测。
 * @param ctx - 宿主行 fiber ctx（ctx.on 事件面）。
 * @param subscriptions - [{ event, consumer?, handler(args…), gate?: {kind, key} }]
 * @returns disposeAll（卸载全部共享 listener）。
 */
export function subscribeEvents(ctx, subscriptions) {
  const byEvent = new Map()
  for (const sub of Array.isArray(subscriptions) ? subscriptions : []) {
    if (!sub || typeof sub.event !== 'string' || !sub.event || typeof sub.handler !== 'function') {
      noteHostDiag({ kind: 'event-subscribe-rejected', detail: 'invalid subscription shape' })
      continue
    }
    const consumer = typeof sub.consumer === 'string' && sub.consumer ? sub.consumer : ''
    const gate = sub.gate && typeof sub.gate === 'object' && typeof sub.gate.kind === 'string' && sub.gate.kind
      && typeof sub.gate.key === 'string' && sub.gate.key ? { kind: sub.gate.kind, key: sub.gate.key } : null
    const consumers = byEvent.get(sub.event) ?? []
    consumers.push({ consumer, handler: sub.handler, gate })
    byEvent.set(sub.event, consumers)
    noteHostDiag({ kind: 'event-subscribed', face: sub.event, consumer, code: gate ? 'gated' : 'ungated' })
  }
  const disposers = []
  for (const [event, consumers] of byEvent) {
    const sharedListener = (...args) => {
      for (const consumer of consumers) {
        if (consumer.gate && armedGates.has(gateKeyOf(consumer.gate.kind, consumer.gate.key))) {
          noteHostDiag({ kind: 'event-gated', face: event, consumer: consumer.consumer, code: 'suppressed' })
          continue
        }
        try {
          consumer.handler(...args)
        } catch (error) {
          noteHostDiag({ kind: 'event-handler-error', face: event, consumer: consumer.consumer, detail: String(error?.message ?? error).slice(0, 120) })
        }
      }
    }
    try {
      const dispose = ctx && typeof ctx.on === 'function' ? ctx.on(event, sharedListener) : null
      if (typeof dispose === 'function') disposers.push(dispose)
      else noteHostDiag({ kind: 'event-subscribe-failed', face: event, detail: 'ctx.on unavailable or returned no disposer' })
    } catch (error) {
      noteHostDiag({ kind: 'event-subscribe-failed', face: event, detail: String(error?.message ?? error).slice(0, 120) })
    }
  }
  return () => {
    for (const dispose of disposers) {
      try { dispose() } catch { /* 卸载尽力而为 */ }
    }
  }
}
