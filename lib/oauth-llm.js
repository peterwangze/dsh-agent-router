// EVO-009：ChatGPT 订阅 OAuth 账号注册为宿主 llm provider——主 agent 的模型
// 选择器可直接选用 ChatGPT 模型（当前只能经 route_agent 专业 agent 中转）。
//
// 设计（EVO-009 微案，2026-08-30）：
// - provider 单路由 `chatgpt-oauth`，显示名「ChatGPT 订阅」：全部启用 preset
//   （chatgpt-codex / codex-responses）账号的 models 并集（保序去重）镜像为该
//   provider 模型目录——主 agent 选择器出现一个组、内含全部账号模型（与
//   wrapper 的「一 provider 一路由」先例一致；同名模型多账号 → 取首个启用
//   账号，注释披露）。
// - 非侵入主权（FIX-002 教训）：只注册/列出，绝不自动切换任何会话的模型；
//   enabled=false / 账号删除 → 模型不列入；无启用账号或总开关关闭 → provider
//   注销（settings/updated + llm/adapters-updated 双事件联动热增删，wrapper
//   先例）；登出不注销（账号条目仍在、模型保留——调用时凭据缺失报「请重新
//   登录」，与专业 agent 路径一致）。
// - 复用 service.js 现成通路（只读复用 + 最小导出缝）：resolvePresetCredential
//   （凭据四元组 + 临期自动刷新）、resolveOauthProxy / loadOauthProxyDispatcher
//   （代理发现与 undici dispatcher）、readImagesAsDataUrls（附件 → dataURL）、
//   parseSseEvents / resolveCodexResponsesUrl（SSE 聚合 / 端点归一，本任务新增
//   导出）、record（统计）。请求构造与宿主 chunk 适配在本模块（不复用
//   runCodexResponsesChat 的单轮组装——主 agent 通路需要完整对话映射与工具
//   往返，形状不同）。
// - 完整对话映射：host messages → Responses input items（user → input_text /
//   input_image；assistant → output_text / function_call；tool-result 块 →
//   function_call_output 独立 item；system 经 options.system → instructions）；
//   options.tools → functions（宿主 agent-loop 经 llm.prepareCall 传入）。
// - 能力声明：inputModalities ['text','image']（账号级，覆盖该账号 models 全
//   列表）——依据：EVO-001 实证 gpt-5.4 系经该端点支持 image 输入；gpt-5.6 系
//   为同端点（chatgpt.com/backend-api/codex/responses）同族新模型，能力继承。
//   比模型名前缀声明更简单且防漏；模型名自由编辑时声明可过宽——可辩护选择。
// - 输出适配宿主 stream 契约（dsh-llm BlockAssembler 词汇表）：聚合后按块发射
//   block-start/text-delta/block-end（文本，index 0）+ tool-call-delta/block-end
//   （function_call，按出现序）+ usage + finish(stop)；失败 throw → 宿主
//   adapterFailureChunk 转 finish(error)。注：聚合发射非真 token 流式（与
//   runCodexResponsesChat 同构的 SSE 聚合后整体呈现——MVP 语义，真实流式
//   留待后续）。
// - 统计：record agentId='main'（主 agent 直选口径；现有 totals 聚合按
//   agentId/account 两级兼容——provider 字段 'chatgpt-oauth' 归入账号级聚合）。
import { ROUTER_NS, normalizeTransport } from './schemas.js'
import { enabledPresetAccounts } from './host-route.js'
import { parseSseEvents, resolveCodexResponsesUrl, resolveOauthProxy, errorMessage } from './service.js'

/** 主 agent 直选 provider 路由（模型选择器组 id）。 */
export const OAUTH_PROVIDER = 'chatgpt-oauth'
/** provider 显示名（模型选择器组名）。 */
export const OAUTH_PROVIDER_NAME = 'ChatGPT 订阅'
/** 能力声明（账号级，见文件头注释依据）。 */
const MODALITIES = ['text', 'image']

/**
 * F-4（EVO-010 R0）：插件组（chatgpt-oauth）账号面 = transport='plugin' 的
 * 启用 preset 账号——transport='host' 账号的模型由宿主官方 openai-codex 组
 * 承载（迁移语义），不再重复注册进插件组（避免双组重名混淆：gpt-5.6-luna
 * 两组同现、背后两条协议栈）。默认 transport='host'（schema 默认）→ 插件组
 * 仅在有 plugin 账号时注册；切换即时生效（settings/updated → 热增删）。
 */
function pluginPresetAccounts(service) {
  return enabledPresetAccounts(service).filter((entry) => normalizeTransport(entry.account.transport) === 'plugin')
}

/** 全部启用 plugin 账号的 models 并集（保序去重）——provider 模型目录。 */
function modelsOf(service) {
  const seen = new Set()
  const out = []
  for (const { account } of pluginPresetAccounts(service)) {
    const models = Array.isArray(account.models) ? account.models.filter((item) => typeof item === 'string' && item.trim()) : []
    for (const model of models) {
      if (seen.has(model)) continue
      seen.add(model)
      out.push({ id: model, name: model, provider: OAUTH_PROVIDER, inputModalities: [...MODALITIES] })
    }
  }
  return out
}

/** 模型 → 归属账号（plugin 面；首个 models 含该模型的启用账号；无 → null）。 */
function accountForModel(service, model) {
  for (const entry of pluginPresetAccounts(service)) {
    const models = Array.isArray(entry.account.models) ? entry.account.models : []
    if (models.includes(model)) return entry
  }
  return null
}

/**
 * 错误映射（H3-14 同构，与 service.js runCodexResponsesChat :2906-2929 语义
 * 一致——401/403 重登指引、429/usage_limit_* 解析 resets_at 剩余分钟、其余
 * 透传 status + error 字段；判别测试锁定 401/429 分支）。
 */
async function oauthHttpError(response) {
  const raw = await response.text().catch(() => '')
  let err = null
  try { err = JSON.parse(raw)?.error ?? null } catch { /* 非 JSON 错误体按原文 */ }
  const code = typeof err?.code === 'string' ? err.code : ''
  let detail = raw
  if (err && (typeof err.message === 'string' || code)) detail = err.message || code
  detail = String(detail).slice(0, 400)
  if (response.status === 401 || response.status === 403) {
    return new Error(`OAuth access token 无效或已过期（HTTP ${response.status}）${detail ? `：${detail}` : ''}；请在账号卡片中重新登录`)
  }
  if (response.status === 429 || /usage_limit_reached|usage_not_included|rate_limit_exceeded/i.test(code)) {
    let when = ''
    if (typeof err?.resets_at === 'number' && Number.isFinite(err.resets_at)) {
      const minutes = Math.max(0, Math.round((err.resets_at * 1000 - Date.now()) / 60000))
      when = `；约 ${minutes} 分钟后重置`
    }
    const plan = typeof err?.plan_type === 'string' && err.plan_type ? `，${err.plan_type} plan` : ''
    return new Error(`ChatGPT 用量限制（HTTP 429${plan}）${detail ? `：${detail}` : ''}${when}`)
  }
  return new Error(`OAuth 调用失败 HTTP ${response.status}${detail ? `：${detail}` : ''}`)
}

/** tool-result 块 → function_call_output.output 文本（text 块拼接，其余 JSON 兜底）。 */
function toolResultText(block) {
  const content = block.content
  if (Array.isArray(content)) {
    const text = content
      .filter((part) => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
      .trim()
    if (text) return text
    return JSON.stringify(content)
  }
  return typeof content === 'string' ? content : JSON.stringify(content ?? '')
}

/**
 * Responses API content 块类型枚举（FIX-017 契约快照——一手取证：用户复验
 * 报错 2026-08-31 09:37 端点原文列出的合法 content 值；**不含 function_call**
 * ——function_call 是顶层 item 类型而非 content 块）。判别测试固化为常量
 * 断言：我们发出的每个 content item type ∈ 本枚举，防未来再犯同类层级错误。
 */
const RESPONSES_CONTENT_TYPES = new Set([
  'input_text', 'input_image', 'input_audio', 'output_text', 'refusal',
  'input_file', 'computer_screenshot', 'summary_text', 'encrypted_content',
])

/**
 * host messages → Responses input items（FIX-017 契约重构——顶层 items 平铺）。
 *
 * 契约取证（2026-08-31，写进实现依据）：
 * - 一手端点证据：用户复验报错 HTTP 400 "Invalid value: 'function_call'.
 *   Supported values are: 'input_text', …, 'encrypted_content'."——content
 *   枚举不含 function_call，即 function_call 不是 message content 块；
 * - 官方 SDK 对照：openai/openai-ruby beta_response_input_item.rb——input
 *   item 类型含 FunctionCall / FunctionCallOutput（顶层 item）；
 *   openai_responses crate（docs.rs）Item 枚举同构（顶层 Item::FunctionCall）；
 * - 本机 codex-cli 0.146.0 为 Rust 原生二进制（协议源码不可读，如实标注）；
 * - EV-028 实证：紧凑消息形态（{role, content}）被 chatgpt.com backend-api
 *   接受——保留，与顶层 function_call / function_call_output item 混用。
 *
 * 全矩阵：
 * - system 消息 → 跳过（经 options.system → instructions）；
 * - user：text → content input_text；image → content input_image（经
 *   readImagesAsDataUrls）；tool-result 块 → **顶层** function_call_output
 *   item（call_id 往返闭环）；
 * - assistant：text 块 → content output_text；tool-call 块 → **顶层**
 *   function_call item（FIX-017：绝不进 content——端点 content 枚举不含）；
 *   文本与工具调用混合轮按块顺序 flush：先累积文本进 message item，遇
 *   tool-call 先 flush 已累积文本再推顶层 function_call item，相对顺序保持；
 * - 未知 role/块跳过（容忍损坏负载，与 wrapper/prestep 同口径）。
 */
async function mapMessagesToItems(messages, service) {
  const items = []
  for (const message of messages ?? []) {
    if (!message || typeof message !== 'object' || typeof message.role !== 'string') continue
    if (message.role === 'system') continue
    const blocks = Array.isArray(message.content) ? message.content : []
    if (message.role === 'user') {
      const textParts = []
      const refs = []
      const outputs = []
      for (const block of blocks) {
        if (!block || typeof block !== 'object') continue
        if (block.type === 'text' && typeof block.text === 'string') textParts.push(block.text)
        else if (block.type === 'image' && block.attachment && typeof block.attachment.attachmentId === 'string') refs.push(block.attachment)
        else if (block.type === 'tool-result') {
          outputs.push({
            call_id: typeof block.toolCallId === 'string' && block.toolCallId ? block.toolCallId : '',
            output: toolResultText(block),
          })
        }
      }
      // function_call_output 先于本条 user 消息（若同消息共存，保持 assistant
      // 调用 → 结果 → 后续轮问询的相对顺序）。
      for (const output of outputs) items.push({ type: 'function_call_output', call_id: output.call_id, output: output.output })
      if (textParts.length > 0 || refs.length > 0) {
        const content = []
        if (textParts.length > 0) content.push({ type: 'input_text', text: textParts.join('\n') })
        if (refs.length > 0) {
          const images = await service.readImagesAsDataUrls(refs)
          for (const image of images) content.push({ type: 'input_image', image_url: image.dataUrl })
        }
        items.push({ role: 'user', content })
      }
    } else if (message.role === 'assistant') {
      // FIX-017：function_call 顶层 item——text 累积 + 遇 tool-call 先 flush。
      let textParts = []
      const flushText = () => {
        if (textParts.length === 0) return
        items.push({ role: 'assistant', content: textParts.map((text) => ({ type: 'output_text', text })) })
        textParts = []
      }
      for (const block of blocks) {
        if (!block || typeof block !== 'object') continue
        if (block.type === 'text' && typeof block.text === 'string' && block.text) {
          textParts.push(block.text)
        } else if (block.type === 'tool-call') {
          flushText()
          items.push({
            type: 'function_call',
            call_id: typeof block.id === 'string' && block.id ? block.id : '',
            name: typeof block.name === 'string' ? block.name : '',
            arguments: typeof block.arguments === 'string' ? block.arguments : '',
          })
        }
      }
      flushText()
    }
  }
  return items
}

/**
 * host options.tools → codex/responses tools（FIX-016 形状修复）。
 * 宿主真实形状（取证 2026-08-31）：assembly.tools 项 = {name, description,
 * parameters}——dsh-system-prompt lib/index.js:254-258（tool provider schemas
 * 解构 + structuredClone）+ dsh-llm-pi-ai lib/index.js:1123-1128（官方 adapter
 * toolsOf 同款读法）双向印证。
 * codex/responses（chatgpt.com/backend-api）契约 = OpenAI Responses API：
 * tools 项为 {type:'function', name, description, parameters}——**name 与
 * description/parameters 在顶层**（type 同级）。旧实现错误嵌套为
 * {type:'function', function:{name,…}} → 端点校验 tools[0].name（顶层）缺失
 * → HTTP 400 "Missing required parameter: 'tools[0].name'"（用户实证
 * 2026-08-31：选 gpt-5.6-luna 为主模型发图对话触发）。守卫：name 非字符串
 * 的工具跳过（宿主契约 name 恒为字符串——tool provider schema 必填）。
 */
function mapTools(tools) {
  if (!Array.isArray(tools)) return []
  const out = []
  for (const tool of tools) {
    if (!tool || typeof tool !== 'object' || typeof tool.name !== 'string' || !tool.name) continue
    out.push({
      type: 'function',
      name: tool.name,
      ...(typeof tool.description === 'string' && tool.description ? { description: tool.description } : {}),
      ...(tool.parameters && typeof tool.parameters === 'object' ? { parameters: tool.parameters } : {}),
    })
  }
  return out
}

/**
 * SSE 聚合（H3-10 / EV-028 十二事件链，与 runCodexResponsesChat 同构——
 * delta 拼接兜底 + output_item.done 槽位文本为准）：文本 → {text}；
 * function_call item → toolCalls（call_id/name/arguments 字符串）；终态事件
 * 取 usage；failed/error 抛错；未见终态视为截断抛错。
 */
async function aggregateCodexSse(body, signal) {
  let deltaText = ''
  const itemTexts = []
  const toolCalls = []
  let usage
  let sawTerminal = false
  for await (const event of parseSseEvents(body, signal)) {
    const type = typeof event?.type === 'string' ? event.type : ''
    if (type === 'response.output_text.delta') {
      if (typeof event.delta === 'string') deltaText += event.delta
    } else if (type === 'response.output_item.done') {
      const item = event.item
      if (item && item.type === 'message' && Array.isArray(item.content)) {
        const itemText = item.content
          .map((part) => (part?.type === 'output_text' && typeof part.text === 'string' ? part.text : (typeof part?.refusal === 'string' ? part.refusal : '')))
          .join('')
        const index = Number.isInteger(event.output_index) && event.output_index >= 0 ? event.output_index : itemTexts.length
        itemTexts[index] = itemText
      } else if (item && item.type === 'function_call') {
        toolCalls.push({
          call_id: typeof item.call_id === 'string' && item.call_id ? item.call_id : `call-${toolCalls.length}`,
          name: typeof item.name === 'string' ? item.name : '',
          arguments: typeof item.arguments === 'string' ? item.arguments : '',
        })
      }
    } else if (type === 'response.completed' || type === 'response.incomplete' || type === 'response.done') {
      sawTerminal = true
      const terminal = event.response
      if (terminal && typeof terminal.usage === 'object' && terminal.usage) {
        usage = { inputTokens: terminal.usage.input_tokens ?? 0, outputTokens: terminal.usage.output_tokens ?? 0 }
      }
      break
    } else if (type === 'response.failed') {
      const failure = event.response?.error
      const failCode = typeof failure?.code === 'string' ? failure.code : ''
      const failMessage = typeof failure?.message === 'string' ? failure.message : ''
      throw new Error(`ChatGPT 调用失败（response.failed${failCode ? `：${failCode}` : ''}）${failMessage ? `：${failMessage}` : ''}`)
    } else if (type === 'error') {
      const nested = event.error && typeof event.error === 'object' ? event.error : {}
      const errorCode = typeof event.code === 'string' ? event.code : (typeof nested.code === 'string' ? nested.code : '')
      const eventMessage = typeof event.message === 'string' ? event.message : (typeof nested.message === 'string' ? nested.message : '')
      throw new Error(`ChatGPT SSE 错误事件${errorCode ? `（${errorCode}）` : ''}${eventMessage ? `：${eventMessage}` : ''}`)
    }
  }
  if (!sawTerminal) throw new Error('ChatGPT SSE 流未返回终态事件（response.completed）——响应可能被截断')
  const text = (itemTexts.filter((part) => typeof part === 'string' && part).join('\n') || deltaText).trim()
  return { text, toolCalls, usage }
}

/** 创建 chatgpt-oauth 适配器（宿主 LlmAdapter 契约：providerInfo / providerRetryPolicy /
 *  listModels / resolveModel / prepareCall / stream——FIX-001 教训：prepareCall
 *  必须显式实现并绑定自身方法）。 */
function createOauthAdapter(ctx, service) {
  const adapter = {
    providerInfo(route) {
      return { id: route, name: OAUTH_PROVIDER_NAME }
    },
    providerRetryPolicy() {
      // 不自定义重试策略（宿主默认）：OAuth 通路错误语义由 stream 内聚合负责。
      return undefined
    },
    async listModels() {
      if (typeof service?.isEnabled === 'function' && !service.isEnabled()) return []
      return modelsOf(service)
    },
    async resolveModel(route, model, signal) {
      // 目录声明为咨询性（宿主注释：adapter 可接受未列出模型，消费方不得把
      // 缺席变拒绝）；模型归属账号校验延迟到 stream（那里有 getState 时点语义）。
      return { provider: OAUTH_PROVIDER, id: model, name: model, inputModalities: [...MODALITIES] }
    },
    async prepareCall(route, model, signal) {
      return {
        model: await adapter.resolveModel(route, model, signal),
        stream: (options) => adapter.stream(options),
      }
    },
    async *stream(options) {
      const started = Date.now()
      let model = ''
      try {
        if (typeof service?.isEnabled === 'function' && !service.isEnabled()) {
          throw new Error('多模型路由已停用（router.enabled=false）——ChatGPT 订阅模型不可用')
        }
        model = typeof options?.model === 'string' ? options.model : ''
        const entry = accountForModel(service, model)
        if (!entry) {
          throw new Error(`ChatGPT 订阅模型 "${model}" 不在任何启用账号的模型列表中（可在账号卡片编辑模型列表）`)
        }
        const cred = await service.resolvePresetCredential(entry.account)
        const system = typeof options.system === 'string' && options.system.trim() ? options.system.trim() : ''
        const items = await mapMessagesToItems(options.messages, service)
        const tools = mapTools(options.tools)
        const url = resolveCodexResponsesUrl(entry.account.baseURL)
        const platform = globalThis.process?.platform ?? 'unknown'
        const arch = globalThis.process?.arch ?? 'unknown'
        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cred.access}`,
          'chatgpt-account-id': cred.accountId,
          originator: 'dsh-agent-router',
          accept: 'text/event-stream',
          'OpenAI-Beta': 'responses=experimental',
          'User-Agent': `dsh-agent-router (${platform} ${arch})`,
        }
        const body = {
          model,
          store: false,
          stream: true,
          ...(system ? { instructions: system } : {}),
          input: items,
          ...(tools.length > 0 ? { tools } : {}),
          include: ['reasoning.encrypted_content'],
        }
        const init = {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          ...(options.signal ? { signal: options.signal } : {}),
        }
        const proxy = resolveOauthProxy(service.getState())
        if (proxy.proxyUrl && String(url).includes('chatgpt.com')) {
          init.dispatcher = await service.loadOauthProxyDispatcher(proxy)
        }
        let response
        try {
          response = await globalThis.fetch(url, init)
        } catch (error) {
          if (error && typeof error.message === 'string' && error.message.includes('undici 代理支持')) throw error
          throw new Error(`ChatGPT 订阅端点不可达（${url}）：${errorMessage(error)}`)
        }
        if (!response.ok) throw await oauthHttpError(response)
        const { text, toolCalls, usage } = await aggregateCodexSse(response.body, options.signal)
        if (!text && toolCalls.length === 0) throw new Error('ChatGPT 订阅调用返回中没有内容')
        service.record({
          agentId: 'main',
          provider: OAUTH_PROVIDER,
          model,
          ok: true,
          ms: Date.now() - started,
          ...(usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } : {}),
        })
        // 宿主 chunk 序列（BlockAssembler 词汇表）：文本块 index 0；function_call
        // 块按出现序（聚合发射非真流式——见文件头注记）。
        let index = 0
        if (text) {
          yield { type: 'block-start', index, blockType: 'text' }
          yield { type: 'text-delta', index, text }
          yield { type: 'block-end', index, block: { type: 'text', text } }
          index += 1
        }
        for (const call of toolCalls) {
          yield { type: 'block-start', index, blockType: 'tool-call' }
          yield { type: 'tool-call-delta', index, id: call.call_id, name: call.name, argumentsDelta: call.arguments }
          yield { type: 'block-end', index, block: { type: 'tool-call', id: call.call_id, name: call.name, arguments: call.arguments } }
          index += 1
        }
        if (usage) yield { type: 'usage', usage }
        yield { type: 'finish', reason: { kind: 'stop' } }
      } catch (error) {
        // P8 可观测：失败经 record 留痕 + throw 转宿主 finish(error) chunk。
        try {
          service.record({
            agentId: 'main',
            provider: OAUTH_PROVIDER,
            model,
            ok: false,
            ms: Date.now() - started,
            error: error && error.message ? error.message : String(error),
          })
        } catch { /* record 自身永不 throw（StatsStore 吞错语义） */ }
        throw error
      }
    },
  }
  return adapter
}

/**
 * 安装 chatgpt-oauth 主 agent provider（EVO-009）：注册/注销按账号与开关
 * 状态热同步（settings/updated 在 resolved 提交后发出——wrapper 同款理由；
 * llm/adapters-updated 兜底宿主侧拓扑变化）。
 * @param ctx - 宿主行 ctx（与 llm 服务同根作用域）。
 * @param service - RouterService（isEnabled / getState / 凭据与代理通路）。
 * @returns 卸载器。
 */
export function installOauthLlmAdapters(ctx, service) {
  const llm = ctx.get('llm')
  if (!llm || typeof llm.registerAdapter !== 'function' || typeof llm.registration !== 'function') {
    ctx.logger?.warn?.('dsh-agent-router: llm service unavailable; chatgpt-oauth provider disabled')
    return () => {}
  }
  const handles = new Map()
  // FIX-015（P8 可观测）：存在启用+已登录 preset 账号但 models 并集为空时，
  // provider 静默不注册会让「主 agent 模型选择器不出现 ChatGPT」无任何诊断。
  // 状态签名去重：仅在状态变化时发一条 warn，避免每次 sync（settings/updated
  // 事件）刷屏。未登录账号（凭据不可解析）不算——新建未登录账号模型空属
  // 正常态；登录态经 resolvePresetCredential 探测（文件读，去重后低频）。
  let warnedEmptyModelsSig = null
  const maybeWarnEmptyModels = async () => {
    // F-4：plugin 面（transport='plugin' 账号）——host 账号模型经官方组承载，
    // 空模型不影响插件组注册判断。
    const entries = pluginPresetAccounts(service)
    if (entries.length === 0) { warnedEmptyModelsSig = null; return }
    if (modelsOf(service).length > 0) { warnedEmptyModelsSig = null; return }
    const sig = entries.map((entry) => entry.id).sort().join(',')
    if (sig === warnedEmptyModelsSig) return
    let loggedIn = false
    for (const { account } of entries) {
      try {
        await service.resolvePresetCredential(account)
        loggedIn = true
        break
      } catch { /* 未登录：跳过（不告警） */ }
    }
    if (!loggedIn) { warnedEmptyModelsSig = null; return }
    warnedEmptyModelsSig = sig
    ctx.logger?.warn?.('dsh-agent-router: chatgpt-oauth provider not registered: enabled account(s) have empty model lists — add models in 设置 → Agent 路由 → ChatGPT 订阅登录')
  }
  const sync = () => {
    let active = false
    try {
      active = (typeof service?.isEnabled !== 'function' || service.isEnabled()) && modelsOf(service).length > 0
    } catch {
      active = false
    }
    const registered = handles.has(OAUTH_PROVIDER)
    if (!active && registered) {
      try {
        handles.get(OAUTH_PROVIDER)()
      } catch (error) {
        ctx.logger?.warn?.(`dsh-agent-router: chatgpt-oauth unregister failed: ${error && error.message ? error.message : String(error)}`)
      }
      handles.delete(OAUTH_PROVIDER)
    }
    if (active && !registered) {
      try {
        const handle = llm.registerAdapter([OAUTH_PROVIDER], createOauthAdapter(ctx, service))
        handles.set(OAUTH_PROVIDER, handle)
      } catch (error) {
        ctx.logger?.warn?.(`dsh-agent-router: chatgpt-oauth registration failed: ${error && error.message ? error.message : String(error)}`)
      }
    }
    // 无条件调用（FIX-015）：active 时仅复位空态签名（modelsOf>0 早退，零探针
    // 开销）——「激活 → 清空模型」转换时签名未复位会导致复发空态不重新告警；
    // unregister 分支不得提前 return（同样需要走本告警路径）。
    void maybeWarnEmptyModels()
  }
  sync()
  const offAdapters = ctx.on('llm/adapters-updated', sync)
  const offSettings = ctx.on('settings/updated', (ns) => {
    if (ns === ROUTER_NS || ns === void 0) sync()
  })
  return () => {
    offAdapters()
    offSettings()
    for (const handle of handles.values()) {
      try { handle() } catch { /* 卸载容错 */ }
    }
    handles.clear()
  }
}
