/**
 * v3 Step 6（MIG-001 / N-3）：`agent/pre-step` —— reminder 注入 + 逃生组分级改写兜底。
 *
 * 宿主 `agent/pre-step` 是"图片轮 = 普通工具调用轮"的转换点（dsh-agent-loop）：
 * 每步开始时瀑布分发 `{ agent, messages, turn, step, signal }`，handler 经
 * `next()` 取默认 decision `{ kind:'enter', messages }` 后返回自己的 messages；
 * 宿主把 decision.messages 追加为会话 user/message 事件（V-DSH-1 持久化假设在
 * 宿主源码得到印证：agent-loop 对 decision.messages 逐个 `session.append`）。
 *
 * 本模块做两件事（架构 §5.2.1 T-2 定案——主改写面保留 wrapper stream，pre-step
 * 是逃生组安全网）：
 * ① **reminder 注入（通道①，N-3）**：当前轮含 image 块 → 注入带 id 的插件合成
 *    user 消息（`createUserMessage` 自带 uuid 消息 id——宿主会话校验要求 id，
 *    vision-router index.js:4803-4806 同款约束；文本按 §5.3 通道①：行为指令，
 *    不含图片内容，防复述污染 T-1；带当轮附件的内容寻址 id，寻址经 M2 语义——
 *    `isAttachmentId` 守卫）；
 * ② **逃生组兜底改写**：会话路由非包装路由（provider 不以 `-router` 结尾 =
 *    用户手动切回原组 / wrapper 未接管）时，按 Step 3（v3 N-4）能力分级改写
 *    outgoing messages——复用 `wrapper.js` 的能力判定（`sourceAcceptsModality`，
 *    原适配器 `resolveModel` 探测）与改写语义（`minimalImageRewrite` 标记文本）：
 *    原生多模态主模型 → 保真直传（图片块原样保留）；纯文本/探测失败 → 图片块
 *    改写为 route_agent 标记文本（C-3：纯文本主模型不见裸图块，防
 *    UNSUPPORTED_CONTENT 击穿）。包装路由下不改写——wrapper stream 在模型输入
 *    层改写（F3 日志保留原件）。
 *
 * 与 wrapper 的关系（M4 共用注册表，架构 §4.2）：能力判定与改写语义单点复用
 * wrapper.js 的导出，本模块不复制实现；多模态开关门控与 wrapper 同源
 * （`MODALITY_ENTRIES[0].stateOf(service)`）。降级路径（V-DSH-1 证伪时）：
 * reminder 失效 → 通道①退化为通道②（wrapper system 标记 / 逃生组消息层标记仍
 * 承载行为指令），逃生组兜底改写不依赖 reminder，独立保护 C-3。
 * @module dsh-agent-router/prestep
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm/message'
import { isAttachmentId } from './attachments.js'
import { MODALITY_ENTRIES, WRAP_SUFFIX, minimalImageRewrite, requestHasModality, sourceAcceptsModality } from './wrapper.js'

/** 宿主插件名（source.plugin 标记，与 index.js name 一致）。 */
export const PLUGIN_NAME = 'dsh-agent-router'

/**
 * M4 通道① reminder 文本 builder（§5.3）：行为指令，不含图片内容（防复述污染，
 * T-1）；携带当轮附件的内容寻址 id 与视觉 agent id（M4 collectReminder 签名）。
 * Step 7（F-04 跟进）措辞同步 attachmentIds 参数（§5.3 L520：includeImages 或
 * attachmentIds 双通路，附件的精确再查可用记忆段 id）。
 * @param {string[]} attachmentIds - 当轮 image 块的内容寻址 id（已过 isAttachmentId 守卫）。
 * @param {string[]} visionAgents - 视觉识别 agent id 列表（route_agent 的目标提示）。
 * @returns {string} reminder 文本（宿主按 user 消息持久化，V-DSH-1）。
 */
export function collectReminder(attachmentIds, visionAgents) {
  const ids = [...new Set(Array.isArray(attachmentIds) ? attachmentIds.filter((id) => typeof id === 'string' && id) : [])]
  const vision = (Array.isArray(visionAgents) ? visionAgents : []).filter((id) => typeof id === 'string' && id)
  const quote = (list) => list.map((agentId) => `"${agentId}"`).join(' / ')
  const idPart = ids.length > 0 ? `（附件 id：${ids.join('、')}）` : ''
  const idsParam = ids.length > 0 ? `，或 attachmentIds 传 [${ids.join(', ')}] 精确指定附件` : ''
  const visionPart = vision.length > 0 ? `识别/描述/分析图片 → agent 填视觉 agent（${quote(vision)}）；` : ''
  return `本轮消息包含图片${idPart}。请调用 route_agent 工具：includeImages 传 true${idsParam}；${visionPart}task 写清用户需求；返回结果原样呈现。`
}

/**
 * 逃生组改写器（通道②消息层形态）：当前轮消息里所有 image 块（含 tool-result
 * 嵌套）改写为 route_agent 标记文本（复用 Step 3 的 minimalImageRewrite 语义）。
 * 包装路由下不调用——wrapper stream 在模型输入层改写；此处是"无 wrapper 接管"
 * 时的兜底（C-3 硬约束：纯文本主模型不见裸图块）。非图片消息原引用返回。
 * @param {object[]} messages - 当前轮 claimed 消息（改写只作用于模型输入，日志
 *   层形态由宿主按 pre-step decision 持久化——逃生组无 adapter 时界面显示标记，
 *   vision-router 同款取舍，index.js:4832-4835）。
 * @param {{ vision: string[], generation: string[] }} state - M4 激活条目状态
 *   （MODALITY_ENTRIES stateOf 输出）。
 * @returns {object[]} 与入参等长；含 image 块的消息为新对象，其余原引用。
 */
export function rewriteImageTurnsToMarkers(messages, state) {
  const walk = (content) => {
    let changed = false
    const out = []
    for (const block of content ?? []) {
      if (!block) {
        out.push(block)
        continue
      }
      if (block.type === 'image') {
        changed = true
        out.push({ type: 'text', text: minimalImageRewrite(block, state) })
        continue
      }
      if (block.type === 'tool-result' && Array.isArray(block.content)) {
        const inner = walk(block.content)
        if (inner.changed) {
          changed = true
          out.push({ ...block, content: inner.content })
        } else {
          out.push(block)
        }
        continue
      }
      out.push(block)
    }
    return { changed, content: out }
  }
  return (messages ?? []).map((message) => {
    if (!message || !Array.isArray(message.content)) return message
    const result = walk(message.content)
    return result.changed ? { ...message, content: result.content } : message
  })
}

/** 多模态门控状态（与 wrapper MODALITY_ENTRIES 同源）：开关关/无模态 agent → null。
 *  按 modality 查找条目（不依赖 [0] 下标——Step 7 泛化后 image 仍为首条目，
 *  显式按名查找更稳）。 */
function modalityState(service) {
  try {
    const imageEntry = MODALITY_ENTRIES.find((entry) => entry.modality === 'image')
    return imageEntry ? (imageEntry.stateOf(service) ?? null) : null
  } catch {
    return null
  }
}

/** 收集当轮消息里 image 块的内容寻址 id（M2 isAttachmentId 守卫；去重保序）。 */
function collectAttachmentIds(messages) {
  const ids = []
  const walk = (content) => {
    for (const block of content ?? []) {
      if (!block) continue
      if (block.type === 'image') {
        const id = typeof block?.attachment?.attachmentId === 'string' ? block.attachment.attachmentId : ''
        if (isAttachmentId(id) && !ids.includes(id)) ids.push(id)
        continue
      }
      if (block.type === 'tool-result' && Array.isArray(block.content)) walk(block.content)
    }
  }
  for (const message of messages ?? []) {
    if (message && Array.isArray(message.content)) walk(message.content)
  }
  return ids
}

/**
 * 会话当前 provider（下一请求将使用的路由，agent-loop buildRequest 读
 * `options.provider`）：优先 agent.options（与 buildRequest 同源，首次请求也可用），
 * 回落 session.requestHeader 的折叠头（会话早期 header 事件尚未就位时兜底）。
 */
function sessionProvider(agent) {
  const options = agent?.options
  if (options && typeof options.provider === 'string' && options.provider) return options.provider
  try {
    const header = agent?.session?.requestHeader?.()
    if (header && typeof header.config?.provider === 'string' && header.config.provider) return header.config.provider
  } catch { /* 不可读时按未知处理（回落安全改写） */ }
  return ''
}

/** 会话当前模型（与 sessionProvider 同源）。 */
function sessionModel(agent) {
  const options = agent?.options
  if (options && typeof options.model === 'string' && options.model) return options.model
  try {
    const header = agent?.session?.requestHeader?.()
    if (header && typeof header.config?.model === 'string' && header.config.model) return header.config.model
  } catch { /* 同上 */ }
  return ''
}

/** 构造带 id 的 reminder user 消息（source plugin；id 由 createUserMessage 生成
 *  ——宿主会话校验要求消息带 id，V-DSH-1）。 */
function buildReminderMessage(text) {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: PLUGIN_NAME },
  })
}

/**
 * 安装 pre-step 钩子：图片轮 reminder 注入 + 逃生组分级改写兜底。
 * @param ctx - 宿主行 ctx（事件注册 + llm 服务查找 + logger）。
 * @param service - RouterService（isEnabled / listImageVisionAgents /
 *   listImageGenerationAgents，与 wrapper 门控同源）。
 * @returns 卸载器（移除钩子注册；Step 6 回滚 = 卸载 pre-step 注册，wrapper-only
 *   仍可用）。
 */
export function installPreStep(ctx, service) {
  const handler = async ({ agent, messages, turn, step, signal }, next) => {
    const decision = await next()
    if (!decision || decision.kind === 'reject') return decision
    try {
      const claimed = Array.isArray(messages) ? messages : []
      // 纯文本轮零开销（通道①/②都不触发）；requestHasModality 含 tool-result
      // 嵌套。R8 F-01 修正①：图片存在性判定先于门控状态计算——纯文本步只付
      // content 扫描，不触发 registry 全量遍历 + 排序（modalityState 仅在含图
      // 轮执行）；修正②：单次 requestHasModality(claimed) 替代逐消息 1 元数组
      // 调用（等价语义，零每消息数组分配）。
      if (!requestHasModality(claimed, 'image')) return decision
      const state = modalityState(service)
      if (!state) return decision
      const attachmentIds = collectAttachmentIds(claimed)
      const reminder = buildReminderMessage(collectReminder(attachmentIds, state.vision))
      // 逃生组判定：会话 provider 不是包装路由（`<provider>-router`）→ 本钩子兜底
      // 改写（复用 Step 3 能力判定 + 改写语义）；包装路由 → 不改写，wrapper
      // stream 在模型输入层改写（避免双改写：消息层标记会被大脑当用户发言复述，
      // T-1）。
      const provider = sessionProvider(agent)
      const model = sessionModel(agent)
      const onWrapperRoute = typeof provider === 'string' && provider.endsWith(WRAP_SUFFIX)
      // FIX-005：能力判定提前共用（原生多模态全链路一致——wrapper 分支剥 -router 探测
      // 原适配器；与 wrapper stream L343 语义对齐：判定 key=原 provider\0model\0image，
      // modal 缓存命中共享，无重复开销）。accepts=true → 不注入 reminder（主模型已
      // 原生看图，行为引导是误导——用户 429 误调实案）；accepts=false/探测失败 →
      // 注入保持（C-3：纯文本主模型的行为指令载体）。
      const probeProvider = onWrapperRoute && provider.length > WRAP_SUFFIX.length
        ? provider.slice(0, -WRAP_SUFFIX.length)
        : provider
      const original = () => {
        try {
          const llm = ctx.get('llm')
          return llm && typeof llm.registration === 'function' ? llm.registration(probeProvider)?.adapter : undefined
        } catch {
          return undefined
        }
      }
      const accepts = await sourceAcceptsModality(original, probeProvider, model, 'image')
      let rewritten = null
      if (!onWrapperRoute && !accepts) {
        // 逃生组改写（C-3：纯文本主模型不见裸图块）——能力探测失败 → false → 安全
        // 回落改写（§5.2.3：宁可改写不可漏图击穿）。
        rewritten = rewriteImageTurnsToMarkers(claimed, state)
      }
      const decisionMessages = Array.isArray(decision.messages) ? decision.messages : []
      const out = rewritten
        ? decisionMessages.map((message) => {
            const index = claimed.indexOf(message)
            return index >= 0 && rewritten[index] !== message ? rewritten[index] : message
          })
        : decisionMessages
      // FIX-005：reminder 条件注入——原生多模态（accepts=true）不注入（零引导）；
      // 纯文本/探测失败 → 现状（[...out, reminder]）。
      return { ...decision, messages: accepts ? out : [...out, reminder] }
    } catch (error) {
      // fail-safe：本钩子异常不得击穿宿主 agent 循环——降级为不介入（reminder
      // 缺失时通道②标记仍承载行为指令；逃生组改写失败时宿主准入会明确拒绝，
      // 不会静默漏图）。
      ctx.logger?.warn?.(`dsh-agent-router: pre-step handler failed, falling back to no-op: ${error && error.message ? error.message : String(error)}`)
      return decision
    }
  }
  return ctx.on('agent/pre-step', handler)
}
