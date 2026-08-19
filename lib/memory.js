/**
 * imageMemory（v3 §5.3 / N-2 / R-3，MIG-001 Step 4）：附件 id → 识别描述的
 * 进程内跨轮缓存。
 *
 * 解决的问题（LP-1）：图片轮的识别结果只存在于工具结果里，后续文本轮的
 * 模型输入又把历史图片块整体删除（改写不变量 R-2）——主 agent 对"刚才那
 * 张图"一无所知，跨轮指代（"刚才图里那行字"）必然失败。本模块在图片轮
 * route_agent 成功返回后回写描述（M6 回写点，service.run），后续文本轮由
 * 改写层把历史图块的命中描述注入 system 记忆段（M4 消费点，wrapper.js）。
 *
 * 设计要点（DEC-007 修订⑤ / §6 决策 5 C1 定案）：
 * - 进程内 Map（LRU + TTL）：与参考实现 dsh-vision-router 同构；"会话记忆"
 *   语义跨重启价值低，不引入文件生命周期与清理成本；
 * - 单条描述 ≤500 字符（记忆段是摘要不是转录，防 system 膨胀）；
 * - 跨会话共享（全局作用域，§14 D-5 默认）：attachmentId 内容寻址——同
 *   字节同 id，描述不携带会话上下文，复用是去重收益而非泄露；
 * - 移除点：TTL 到期 / LRU 淘汰 / 插件卸载（index.js effect 清理）。
 *
 * 时间参数可注入（now）：TTL/LRU 边界可确定性测试，不依赖真实时钟。
 * @module dsh-agent-router/memory
 */

/** LRU 上限（条）：超限淘汰最久未使用项。 */
export const IMAGE_MEMORY_MAX_ENTRIES = 100

/** TTL（毫秒）：过期条目读取时失效并被清除。 */
export const IMAGE_MEMORY_TTL_MS = 24 * 60 * 60 * 1000

/** 单条描述上限（字符）：回写时截断（§5.3"≤500 字符摘要"）。 */
export const IMAGE_MEMORY_TEXT_MAX = 500

/** 进程内存储：attachmentId → { text, at }（Map 插入序即 LRU 序）。 */
const entries = new Map()

/** 惰性清扫：写入时顺带清掉已过期条目，控制驻留上限。 */
function sweepExpired(now) {
  for (const [id, hit] of entries) {
    if (now - hit.at >= IMAGE_MEMORY_TTL_MS) entries.delete(id)
  }
}

/**
 * 回写一条识别描述（M6 回写点调用；best-effort）。
 * 文本规整为单行（记忆段是内联文本，换行会破坏段落形态）；超限截断。
 * @returns {boolean} 是否真正写入（id/文本非法时为 false）。
 */
export function rememberImage(attachmentId, text, now = Date.now()) {
  if (typeof attachmentId !== 'string' || !attachmentId.trim()) return false
  if (typeof text !== 'string' || !text.trim()) return false
  const summary = text.replace(/\s+/g, ' ').trim().slice(0, IMAGE_MEMORY_TEXT_MAX)
  if (!summary) return false
  sweepExpired(now)
  const id = attachmentId.trim()
  entries.delete(id)
  entries.set(id, { text: summary, at: now })
  while (entries.size > IMAGE_MEMORY_MAX_ENTRIES) {
    entries.delete(entries.keys().next().value)
  }
  return true
}

/**
 * 读取一条描述（M4 消费点调用）：命中且未过期 → 返回 { text, at } 并刷新
 * LRU 序；过期 → 删除并返回 null；未命中 → null。
 */
export function recallImage(attachmentId, now = Date.now()) {
  if (typeof attachmentId !== 'string' || !attachmentId.trim()) return null
  const id = attachmentId.trim()
  const hit = entries.get(id)
  if (!hit) return null
  if (now - hit.at >= IMAGE_MEMORY_TTL_MS) {
    entries.delete(id)
    return null
  }
  entries.delete(id)
  entries.set(id, hit)
  return { text: hit.text, at: hit.at }
}

/** 清空全部记忆（插件卸载清理与测试隔离）。 */
export function clearImageMemory() {
  entries.clear()
}

/** 当前条目数（观测与测试断言用）。 */
export function imageMemorySize() {
  return entries.size
}
