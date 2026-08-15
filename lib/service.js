/**
 * dsh-router 宿主服务（ctx key：`router`）。
 *
 * 职责：
 * - 持有 `router` settings namespace 的 resolved scope，热读取 agent 配置；
 * - 解析每个 agent 的有效 provider/model（缺省复用主 agent 当前模型）；
 * - 执行三类专业调用：chat（llm.stream 单/多轮，支持图片块）、
 *   agent（经 subagents seam 委派，per-agent 模型覆盖）、
 *   image（OpenAI 兼容 Images API，产物存回附件服务）；
 * - 维护进程内实时用量统计（totals / recent / 分钟级 series）；
 * - 提供 gateway 可直达的 RPC 方法：catalog / stats / test / reset /
 *   config / save（配置读写走本插件自己的 Remote 端点，因为
 *   api-proxy 的 settings.describe 只放行其内置白名单 namespace）；
 * - 生成面向主模型的系统提示段文本（由 tool 行注册）。
 *
 * 服务继承 TypertRemoteService：gateway 对严格（strict）契约分发的
 * 接收方要求可见的 typertRemote 绑定（service/serviceKey/namespace）。
 *
 * 注意：本服务只读叶子字段并构造自有 JSON，绝不序列化宿主内部活动对象。
 * @module dsh-router/service
 */
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import { createUserMessage, createAssistantMessage } from '@deepseek-ai/dsh-llm/message'
import { ROUTER_NS } from './schemas.js'

/** 支持的 agent 类型。 */
export const AGENT_TYPES = ['chat', 'agent', 'image', 'speech']

/** 委派（agent 类型）最大深度保护：防止路由自递归。 */
export const MAX_ROUTER_DEPTH = 4

/** 统计保留：最近记录条数 / 分钟桶保留窗口（分钟）。 */
const RECENT_CAP = 100
const SERIES_WINDOW_MINUTES = 90

/** 从任意错误取人类可读消息。 */
export function errorMessage(error) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && typeof error.message === 'string') return error.message
  return String(error)
}

/** 从编码字节嗅探图片 media type（默认 png）。 */
function sniffMediaType(data) {
  if (data.length >= 4 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 12 && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return 'image/webp'
  if (data.length >= 4 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'image/gif'
  return 'image/png'
}

/** base64（标准字母表）解码为字节。 */
function decodeBase64(text) {
  const binary = globalThis.atob(text)
  const data = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) data[index] = binary.charCodeAt(index)
  return data
}

/** 分钟键：ISO 时间截断到分钟。 */
function minuteKey(at) {
  return new Date(at).toISOString().slice(0, 16)
}

/**
 * 宿主多模型路由服务。
 */
export class RouterService extends TypertRemoteService {
  constructor(ctx, base = {}) {
    super(ctx, 'router')
    /** 组合层 base（settings 未挂载时的后备配置）。 */
    this.base = base ?? {}
    /** settings scope（由 index.js attach）。 */
    this.scope = null
    this.resetStats()
  }

  /** 挂接 settings scope；传入 null 回退到组合层 base。 */
  attach(scope) {
    this.scope = scope ?? null
  }

  /** 当前 resolved 状态（热读取）。 */
  getState() {
    return this.scope ? this.scope.get() : this.base
  }

  /** 总开关。 */
  isEnabled() {
    return this.getState().enabled !== false
  }

  /** 按 id 读取一个 agent 配置（未找到返回 undefined）。 */
  getAgent(id) {
    const agents = this.getState().agents ?? {}
    return agents[id]
  }

  /** 启用的 agent 列表（[id, config]）。 */
  listEnabledAgents() {
    return Object.entries(this.getState().agents ?? {})
      .filter(([, agent]) => agent && agent.enabled !== false)
      .map(([id, agent]) => [id, agent])
  }

  /** 主 agent 默认模型（进程级默认选择）。 */
  defaults() {
    const model = this.ctx.get('agentDefaultModel')
    const selection = typeof model?.currentSelection === 'function' ? model.currentSelection() : undefined
    return {
      provider: selection?.provider ?? '',
      model: selection?.model ?? '',
      reasoningEffort: selection?.reasoningEffort ?? undefined,
    }
  }

  /** 按 id 读取一个 OAuth 账号配置（未找到返回 undefined）。 */
  getOAuthAccount(id) {
    const accounts = this.getState().oauthAccounts ?? {}
    return accounts[id]
  }

  /**
   * 解析一个 agent 的有效 provider/model。
   * 若 agent 指定了插件独立管理的 OAuth 账号（account 字段），则返回
   * { mode: 'oauth', account }，调用走插件直连通路，绝不注册 llm 路由。
   * 否则返回 { mode: 'route', provider, model, source, error? }。
   */
  async resolveAgent(id) {
    const agent = this.getAgent(id)
    if (!agent) return { id, agent: null, mode: 'route', provider: '', model: '', source: 'unknown', error: `未知 agent "${id}"（可用：${this.listEnabledAgents().map(([key]) => key).join(', ') || '无'}）` }
    const accountId = typeof agent.account === 'string' ? agent.account.trim() : ''
    if (accountId) {
      const account = this.getOAuthAccount(accountId)
      if (!account) return { id, agent, mode: 'oauth', accountId, provider: `oauth:${accountId}`, model: '', source: 'account', error: `OAuth 账号 "${accountId}" 不存在` }
      const model = (typeof agent.model === 'string' && agent.model.trim()) || (Array.isArray(account.models) ? account.models[0] ?? '' : '')
      const provider = `oauth:${accountId}`
      if (!model) return { id, agent, mode: 'oauth', accountId, account, provider, model, source: 'account', error: `OAuth 账号 "${accountId}"（${account.name || accountId}）尚未配置模型；请在账号卡片中发现或添加模型` }
      return { id, agent, mode: 'oauth', accountId, account, provider, model, source: 'account' }
    }
    const defaults = this.defaults()
    const agentProvider = typeof agent.provider === 'string' ? agent.provider.trim() : ''
    const agentModel = typeof agent.model === 'string' ? agent.model.trim() : ''
    let provider = agentProvider || defaults.provider || ''
    let model = agentModel
    let source = 'agent'
    if (!model) {
      if (!agentProvider) {
        model = defaults.model || ''
        source = 'main'
      } else {
        const models = await this.safeListModels(provider)
        model = models[0]?.id ?? ''
        source = 'provider-default'
      }
    }
    if (!provider) return { id, agent, mode: 'route', provider, model, source, error: '未解析到服务商：请为该 agent 配置服务商，或先在 设置 → 模型 中配置主模型' }
    if (!model) return { id, agent, mode: 'route', provider, model, source, error: `服务商 "${provider}" 没有可用模型（未注册或未配置）；请先在 设置 → 模型 中完成该服务商的配置` }
    return { id, agent, mode: 'route', provider, model, source }
  }

  /** listModels 的容错包装。 */
  async safeListModels(provider) {
    const llm = this.ctx.get('llm')
    if (!llm || typeof llm.listModels !== 'function') return []
    try {
      return await llm.listModels(provider)
    } catch {
      return []
    }
  }

  /** 归一化 type（未知值按 chat 处理）。 */
  normalizeType(type) {
    return AGENT_TYPES.includes(type) ? type : 'chat'
  }

  /**
   * 执行一次专业调用。input：
   * { agentId, task, extra?, images?: ImageAttachmentRef[], exec?, signal? }
   * 返回 { kind, text, image?, usage?, stopReason? }；失败抛错。
   */
  async run(input) {
    const id = String(input.agentId)
    const resolved = await this.resolveAgent(id)
    if (resolved.error) throw new Error(resolved.error)
    const type = this.normalizeType(resolved.agent.type)
    if (resolved.mode === 'oauth') {
      if (type !== 'chat') throw new Error(`OAuth 账号目前仅支持 chat 类型 agent（当前类型：${type}）`)
      return this.runOauthChat(resolved, input)
    }
    if (type === 'image') return this.runImage(resolved, input)
    if (type === 'agent') return this.runAgentDelegation(resolved, input)
    if (type === 'speech') return this.runSpeech(resolved, input)
    return this.runChat(resolved, input)
  }

  /** 组装专业调用文本。 */
  composeTask(task, extra) {
    const base = typeof task === 'string' && task.trim() ? task.trim() : ''
    const more = typeof extra === 'string' && extra.trim() ? extra.trim() : ''
    if (!base && !more) throw new Error('task 不能为空')
    return more ? `${base}\n\n[补充说明]\n${more}` : base
  }

  /** chat 类型：经 llm.stream 单/多轮调用。 */
  async runChat(resolved, input) {
    const llm = this.ctx.get('llm')
    if (!llm || typeof llm.stream !== 'function') throw new Error('llm 服务不可用')
    const agent = resolved.agent
    const text = this.composeTask(input.task, input.extra)
    const images = Array.isArray(input.images) ? input.images : []
    if (images.length > 0) {
      // 模型能力已知且不含 image 时，前置明确拒绝（多声明代价远大于少声明）。
      try {
        const info = await llm.resolveModelInfo(resolved.provider, resolved.model)
        if (info?.inputModalities && !info.inputModalities.includes('image')) {
          throw new Error(`模型 ${resolved.provider}/${resolved.model} 不支持图片输入；请为该 agent 配置支持视觉的模型（如 openai/gpt-4o）`)
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('模型 ')) throw error
        // resolveModelInfo 不可用：按未知能力放行，由提供方裁决。
      }
    }
    const system = typeof agent.systemPrompt === 'string' && agent.systemPrompt.trim()
      ? agent.systemPrompt.trim()
      : `你是 "${agent.name || resolved.id}" 专业 agent，通过多模型路由被调用。请直接完成任务，只输出最终结果，不要寒暄。`
    const content = [{ type: 'text', text }]
    for (const ref of images) content.push({ type: 'image', attachment: ref })
    const messages = [createUserMessage({ content, source: { kind: 'user' } })]
    const rounds = Math.max(1, Math.min(8, Math.trunc(Number(agent.maxRounds)) || 1))
    let usage
    let blocks = []
    for (let round = 1; round <= rounds; round++) {
      const stream = llm.stream({
        provider: resolved.provider,
        model: resolved.model,
        system,
        messages,
        ...(typeof agent.reasoningEffort === 'string' && agent.reasoningEffort ? { reasoningEffort: agent.reasoningEffort } : {}),
        ...(Number(agent.temperature) > 0 ? { temperature: Number(agent.temperature) } : {}),
        ...(Number(agent.maxTokens) > 0 ? { maxTokens: Number(agent.maxTokens) } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
      })
      const assembler = new BlockAssembler()
      try {
        for await (const chunk of stream) assembler.push(chunk)
      } catch (error) {
        throw new Error(`调用 ${resolved.provider}/${resolved.model} 失败：${errorMessage(error)}`)
      }
      usage = assembler.usage ?? usage
      const finish = assembler.finish
      blocks = assembler.blocks()
      if (finish.kind === 'error' || finish.kind === 'aborted') {
        const failure = finish.failure
        throw new Error(`调用失败（${finish.kind}${failure ? `：${failure.code} ${failure.message}` : ''}）`)
      }
      if (finish.kind === 'stop' || finish.kind === 'tool-calls') break
      // max-tokens：轮数未用尽时继续。
      if (round < rounds) {
        messages.push(createAssistantMessage({ content: blocks, provider: resolved.provider, model: resolved.model }))
        messages.push(createUserMessage({ content: [{ type: 'text', text: '请继续完成剩余内容。' }], source: { kind: 'user' } }))
      }
    }
    let output = blocks.filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim()
    if (!output) {
      output = blocks.filter((block) => block.type === 'reasoning').map((block) => block.text).join('\n').trim()
    }
    return {
      kind: 'chat',
      text: output || '（空响应）',
      usage: usage ? {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        ...(usage.cacheReadTokens !== undefined ? { cacheReadTokens: usage.cacheReadTokens } : {}),
        ...(usage.cacheWriteTokens !== undefined ? { cacheWriteTokens: usage.cacheWriteTokens } : {}),
        ...(usage.reasoningTokens !== undefined ? { reasoningTokens: usage.reasoningTokens } : {}),
      } : undefined,
    }
  }

  /** agent 类型：经 subagents seam 委派，覆盖子 agent 模型。 */
  async runAgentDelegation(resolved, input) {
    const subagents = this.ctx.get('subagents')
    if (!subagents || typeof subagents.start !== 'function') throw new Error('subagent 服务不可用')
    if (!input.exec?.agent) throw new Error('route_agent 只能在会话内调用（缺少调用方 agent）')
    const agent = resolved.agent
    const parent = input.exec.agent
    const depth = Number(parent.session?.header?.delegationDepth) || 0
    if (depth >= MAX_ROUTER_DEPTH) throw new Error(`委派深度超限（${depth} >= ${MAX_ROUTER_DEPTH}），已阻止 agent 类型路由以防止递归`)
    const text = this.composeTask(input.task, input.extra)
    const tools = (Array.isArray(agent.tools) ? agent.tools : []).filter((name) => typeof name === 'string' && name)
    const allowsRoute = tools.includes('route_agent')
    let toolFilter
    if (tools.length > 0) {
      toolFilter = allowsRoute ? { allow: tools } : { allow: tools, deny: ['route_agent'] }
    } else if (!allowsRoute) {
      toolFilter = { deny: ['route_agent'] }
    }
    const run = await subagents.start('spawn', {
      label: `router:${resolved.id}`,
      prompt: [{ type: 'text', text }],
      parent,
      signal: input.signal,
      agentOptions: { provider: resolved.provider, model: resolved.model },
      ...(toolFilter ? { toolFilter } : {}),
      ...(typeof agent.systemPrompt === 'string' && agent.systemPrompt.trim() ? { persona: agent.systemPrompt.trim() } : {}),
    })
    let result
    try {
      result = await run.result
    } finally {
      await run.dispose().catch(() => undefined)
    }
    const output = (result.output ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()
    if (result.stopReason !== 'completed') {
      throw new Error(`子 agent 未完成（${result.stopReason}）${output ? `：${output.slice(0, 500)}` : ''}`)
    }
    return { kind: 'agent', text: output || '（空响应）', stopReason: result.stopReason }
  }

  /** image 类型：OpenAI 兼容 Images API 生成，产物存回附件服务。 */
  async runImage(resolved, input) {
    const agent = resolved.agent
    const endpoint = (typeof agent.endpoint === 'string' && agent.endpoint.trim())
      ? agent.endpoint.trim()
      : 'https://api.openai.com/v1/images/generations'
    const apiKeyEnv = (typeof agent.apiKeyEnv === 'string' && agent.apiKeyEnv.trim())
      ? agent.apiKeyEnv.trim()
      : resolved.provider === 'openai' ? 'OPENAI_API_KEY' : ''
    let key
    const credentials = this.ctx.get('credentials')
    if (apiKeyEnv) {
      if (credentials) {
        const resolvedKey = await credentials.resolve(apiKeyEnv)
        if (!resolvedKey) throw new Error(`凭据 ${apiKeyEnv} 未配置；请在 设置 → Agent 路由 的账号区域完成登录`)
        key = resolvedKey.value
      } else {
        key = globalThis.process?.env?.[apiKeyEnv]
        if (!key) throw new Error(`凭据 ${apiKeyEnv} 未配置（环境变量中也未找到）`)
      }
    }
    const prompt = this.composeTask(input.task, input.extra)
    const body = {
      model: resolved.model,
      prompt,
      n: 1,
      size: (typeof agent.imageSize === 'string' && agent.imageSize) ? agent.imageSize : '1024x1024',
      response_format: 'b64_json',
    }
    let response
    try {
      response = await globalThis.fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify(body),
        ...(input.signal ? { signal: input.signal } : {}),
      })
    } catch (error) {
      throw new Error(`图片生成端点不可达（${endpoint}）：${errorMessage(error)}`)
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 400)
      throw new Error(`图片生成失败 HTTP ${response.status}${detail ? `：${detail}` : ''}`)
    }
    let payload
    try {
      payload = await response.json()
    } catch (error) {
      throw new Error(`图片生成端点返回非 JSON：${errorMessage(error)}`)
    }
    const b64 = payload?.data?.[0]?.b64_json
    if (typeof b64 !== 'string' || !b64) {
      throw new Error('端点未返回 b64_json 图片数据（如端点不支持 response_format，请在该 agent 高级设置中更换 endpoint）')
    }
    const data = decodeBase64(b64)
    const attachments = this.ctx.get('attachments')
    if (!attachments || typeof attachments.saveImage !== 'function') throw new Error('附件服务不可用，无法保存生成的图片')
    const saved = await attachments.saveImage({ data, mediaType: sniffMediaType(data), name: `router-${resolved.id}.png` })
    return { kind: 'image', text: `已生成图片（${saved.width}x${saved.height}）`, image: saved }
  }

  /**
   * speech 类型：OpenAI 兼容 Audio Transcriptions 端点（Whisper 系）。
   * 音频经 filePath 从工作区读取（route_agent 工具传入路径）。
   */
  async runSpeech(resolved, input) {
    const fs = this.ctx.get('fs')
    if (!fs || typeof fs.resolve !== 'function' || typeof fs.readBytes !== 'function') throw new Error('文件服务不可用，无法读取音频文件')
    const agent = resolved.agent
    const filePath = typeof input.filePath === 'string' ? input.filePath.trim() : ''
    if (!filePath) throw new Error('语音识别需要 filePath 参数：请给出会话工作区内音频文件的路径')
    const cwd = input.exec?.agent?.session?.header?.cwd
    let target
    try {
      target = await fs.resolve(filePath, { ...(cwd ? { cwd } : {}) })
    } catch (error) {
      throw new Error(`无法解析音频路径 "${filePath}"：${errorMessage(error)}`)
    }
    const maxBytes = 25 * 1024 * 1024
    let data
    try {
      data = await fs.readBytes(target, input.signal, maxBytes)
    } catch (error) {
      throw new Error(`无法读取音频文件 "${filePath}"：${errorMessage(error)}`)
    }
    const endpoint = (typeof agent.endpoint === 'string' && agent.endpoint.trim())
      ? agent.endpoint.trim()
      : 'https://api.openai.com/v1/audio/transcriptions'
    const apiKeyEnv = (typeof agent.apiKeyEnv === 'string' && agent.apiKeyEnv.trim())
      ? agent.apiKeyEnv.trim()
      : resolved.provider === 'openai' ? 'OPENAI_API_KEY' : ''
    let key
    const credentials = this.ctx.get('credentials')
    if (apiKeyEnv) {
      if (credentials) {
        const resolvedKey = await credentials.resolve(apiKeyEnv)
        if (!resolvedKey) throw new Error(`凭据 ${apiKeyEnv} 未配置；请在 设置 → Agent 路由 的账号区域完成登录`)
        key = resolvedKey.value
      } else {
        key = globalThis.process?.env?.[apiKeyEnv]
        if (!key) throw new Error(`凭据 ${apiKeyEnv} 未配置（环境变量中也未找到）`)
      }
    }
    const form = new FormData()
    form.append('file', new Blob([data], { type: 'application/octet-stream' }), 'audio.bin')
    form.append('model', resolved.model || 'whisper-1')
    let response
    try {
      response = await globalThis.fetch(endpoint, {
        method: 'POST',
        headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: form,
        ...(input.signal ? { signal: input.signal } : {}),
      })
    } catch (error) {
      throw new Error(`语音识别端点不可达（${endpoint}）：${errorMessage(error)}`)
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 400)
      throw new Error(`语音识别失败 HTTP ${response.status}${detail ? `：${detail}` : ''}`)
    }
    let payload
    try {
      payload = await response.json()
    } catch (error) {
      throw new Error(`语音识别端点返回非 JSON：${errorMessage(error)}`)
    }
    const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
    if (!text) throw new Error('语音识别返回中没有 text 字段')
    return { kind: 'speech', text }
  }

  /**
   * 扫描调用方会话最近一条带图片的用户消息，返回其图片引用列表。
   */
  findRecentImages(agent) {
    const session = agent?.session
    if (!session || typeof session.deriveMessages !== 'function') return []
    let messages
    try {
      messages = session.deriveMessages()
    } catch {
      return []
    }
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index]
      if (message.role !== 'user') continue
      const images = (message.content ?? []).filter((block) => block && block.type === 'image')
      if (images.length > 0) return images.map((block) => block.attachment)
    }
    return []
  }

  // ── OAuth 账号（插件独立管理，直连通路）──────────────────────────────────

  /** 解析 OAuth 账号的 access token（credentials seam → 环境变量后备）。 */
  async resolveOauthToken(account) {
    const ref = typeof account.tokenRef === 'string' && account.tokenRef.trim() ? account.tokenRef.trim() : ''
    if (!ref) throw new Error('该 OAuth 账号未配置凭据引用（tokenRef）；请重新登录')
    const credentials = this.ctx.get('credentials')
    if (credentials) {
      const resolved = await credentials.resolve(ref)
      if (resolved) return resolved.value
    }
    const env = globalThis.process?.env?.[ref]
    if (env) return env
    throw new Error(`OAuth access token（${ref}）未配置；请在账号卡片中完成登录`)
  }

  /** 把附件引用读取为 base64 data URL（OAuth 直连多模态输入）。 */
  async readImagesAsDataUrls(refs) {
    const attachments = this.ctx.get('attachments')
    if (!attachments || typeof attachments.readImage !== 'function') return []
    const out = []
    for (const ref of refs ?? []) {
      try {
        const stored = await attachments.readImage(ref)
        let binary = ''
        for (let index = 0; index < stored.data.length; index++) binary += String.fromCharCode(stored.data[index])
        out.push({ mediaType: stored.ref.mediaType ?? 'image/png', dataUrl: `data:${stored.ref.mediaType ?? 'image/png'};base64,${globalThis.btoa(binary)}` })
      } catch {
        // 单个图片读取失败跳过；失败由端点或文本部分兜底。
      }
    }
    return out
  }

  /**
   * OAuth 账号的 chat 直连调用（不经 llm 注册表，绝不出现在共享模型列表）。
   * 协议：openai-completions / anthropic / gemini。
   */
  async runOauthChat(resolved, input) {
    const account = resolved.account
    const token = await this.resolveOauthToken(account)
    const protocol = ['openai-completions', 'anthropic', 'gemini'].includes(account.protocol) ? account.protocol : 'openai-completions'
    const baseURL = (typeof account.baseURL === 'string' && account.baseURL.trim()) ? account.baseURL.trim().replace(/\/+$/, '') : ''
    if (!baseURL) throw new Error(`OAuth 账号 "${resolved.accountId}" 未配置 Base URL`)
    const agent = resolved.agent
    const text = this.composeTask(input.task, input.extra)
    const system = typeof agent.systemPrompt === 'string' && agent.systemPrompt.trim()
      ? agent.systemPrompt.trim()
      : `你是 "${agent.name || resolved.id}" 专业 agent，通过多模型路由被调用。请直接完成任务，只输出最终结果，不要寒暄。`
    const maxTokens = Number(agent.maxTokens) > 0 ? Number(agent.maxTokens) : undefined
    const temperature = Number(agent.temperature) > 0 ? Number(agent.temperature) : undefined
    const images = await this.readImagesAsDataUrls(input.images)
    const usageFrom = (payload) => {
      if (!payload) return undefined
      if (payload.usage) return { inputTokens: payload.usage.prompt_tokens ?? payload.usage.input_tokens ?? 0, outputTokens: payload.usage.completion_tokens ?? payload.usage.output_tokens ?? 0 }
      if (payload.usageMetadata) return { inputTokens: payload.usageMetadata.promptTokenCount ?? 0, outputTokens: payload.usageMetadata.candidatesTokenCount ?? 0 }
      return undefined
    }
    const textFrom = (payload) => {
      if (!payload) return ''
      if (Array.isArray(payload.choices) && payload.choices[0]?.message?.content) {
        const content = payload.choices[0].message.content
        if (typeof content === 'string') return content.trim()
        if (Array.isArray(content)) return content.filter((part) => part.type === 'text').map((part) => part.text).join('\n').trim()
      }
      if (Array.isArray(payload.content)) {
        return payload.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n').trim()
      }
      if (Array.isArray(payload.candidates) && payload.candidates[0]?.content?.parts) {
        return payload.candidates[0].content.parts.filter((part) => typeof part.text === 'string').map((part) => part.text).join('\n').trim()
      }
      return ''
    }
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    let url
    let body
    if (protocol === 'anthropic') {
      url = `${baseURL}/messages`
      headers['anthropic-version'] = '2023-06-01'
      body = {
        model: resolved.model,
        max_tokens: maxTokens ?? 4096,
        ...(temperature !== undefined ? { temperature } : {}),
        ...(system ? { system } : {}),
        messages: [{
          role: 'user',
          content: images.length > 0
            ? [{ type: 'image', source: { type: 'base64', media_type: images[0].mediaType, data: images[0].dataUrl.split(',')[1] } }, { type: 'text', text }]
            : text,
        }],
      }
    } else if (protocol === 'gemini') {
      url = `${baseURL}/models/${encodeURIComponent(resolved.model)}:generateContent`
      body = {
        contents: [{
          role: 'user',
          parts: [
            ...images.map((image) => ({ inline_data: { mime_type: image.mediaType, data: image.dataUrl.split(',')[1] } })),
            { text },
          ],
        }],
        ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
        ...(maxTokens !== undefined ? { generationConfig: { maxOutputTokens: maxTokens, ...(temperature !== undefined ? { temperature } : {}) } } : {}),
      }
    } else {
      url = `${baseURL}/chat/completions`
      const userContent = images.length > 0
        ? [{ type: 'text', text }, ...images.map((image) => ({ type: 'image_url', image_url: { url: image.dataUrl } }))]
        : text
      const messages = system ? [{ role: 'system', content: system }] : []
      messages.push({ role: 'user', content: userContent })
      body = {
        model: resolved.model,
        messages,
        ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
      }
    }
    let response
    try {
      response = await globalThis.fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        ...(input.signal ? { signal: input.signal } : {}),
      })
    } catch (error) {
      throw new Error(`OAuth 账号 "${resolved.accountId}" 端点不可达（${url}）：${errorMessage(error)}`)
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 400)
      if (response.status === 401 || response.status === 403) {
        throw new Error(`OAuth access token 无效或已过期（HTTP ${response.status}）${detail ? `：${detail}` : ''}；请在账号卡片中重新登录`)
      }
      throw new Error(`OAuth 调用失败 HTTP ${response.status}${detail ? `：${detail}` : ''}`)
    }
    let payload
    try {
      payload = await response.json()
    } catch (error) {
      throw new Error(`OAuth 端点返回非 JSON：${errorMessage(error)}`)
    }
    const output = textFrom(payload)
    if (!output) throw new Error('OAuth 调用返回中没有文本内容')
    return { kind: 'chat', text: output, usage: usageFrom(payload) }
  }

  // ── 统计 ──────────────────────────────────────────────────────────────────

  resetStats() {
    this.totals = new Map()
    this.recent = []
    this.series = new Map()
    this.accountTotals = new Map()
    this.accountSeries = new Map()
  }

  /**
   * 记录一次调用结果。record：
   * { agentId, provider, model, ok, ms, inputTokens?, outputTokens?, error? }
   * 同时按 agent 与按账号（服务商，含模型细分）两级聚合。
   */
  record(record) {
    const at = Date.now()
    const inputTokens = Number(record.inputTokens) || 0
    const outputTokens = Number(record.outputTokens) || 0
    const ms = Number(record.ms) || 0
    const provider = record.provider ?? '?'
    const model = record.model ?? '?'

    const total = this.totals.get(record.agentId) ?? {
      agentId: record.agentId,
      name: '',
      provider,
      model,
      calls: 0,
      errors: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalMs: 0,
      lastAt: 0,
    }
    total.name = this.getAgent(record.agentId)?.name || record.agentId
    total.provider = provider
    total.model = model
    total.calls += 1
    if (!record.ok) total.errors += 1
    total.inputTokens += inputTokens
    total.outputTokens += outputTokens
    total.totalMs += ms
    total.lastAt = at
    this.totals.set(record.agentId, total)

    // 账号（服务商）级聚合，含模型细分。
    const account = this.accountTotals.get(provider) ?? {
      provider,
      calls: 0,
      errors: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalMs: 0,
      lastAt: 0,
      models: new Map(),
    }
    account.calls += 1
    if (!record.ok) account.errors += 1
    account.inputTokens += inputTokens
    account.outputTokens += outputTokens
    account.totalMs += ms
    account.lastAt = at
    const modelTotal = account.models.get(model) ?? { model, calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalMs: 0, lastAt: 0 }
    modelTotal.calls += 1
    if (!record.ok) modelTotal.errors += 1
    modelTotal.inputTokens += inputTokens
    modelTotal.outputTokens += outputTokens
    modelTotal.totalMs += ms
    modelTotal.lastAt = at
    account.models.set(model, modelTotal)
    this.accountTotals.set(provider, account)

    const bucketMap = this.series.get(record.agentId) ?? new Map()
    const key = minuteKey(at)
    const bucket = bucketMap.get(key) ?? { minute: key, calls: 0, errors: 0, inputTokens: 0, outputTokens: 0 }
    bucket.calls += 1
    if (!record.ok) bucket.errors += 1
    bucket.inputTokens += inputTokens
    bucket.outputTokens += outputTokens
    bucketMap.set(key, bucket)
    this.series.set(record.agentId, bucketMap)

    const accountBucketMap = this.accountSeries.get(provider) ?? new Map()
    const accountBucket = accountBucketMap.get(key) ?? { minute: key, calls: 0, errors: 0, inputTokens: 0, outputTokens: 0 }
    accountBucket.calls += 1
    if (!record.ok) accountBucket.errors += 1
    accountBucket.inputTokens += inputTokens
    accountBucket.outputTokens += outputTokens
    accountBucketMap.set(key, accountBucket)
    this.accountSeries.set(provider, accountBucketMap)

    this.recent.unshift({
      at,
      agentId: record.agentId,
      provider,
      model,
      ok: record.ok !== false,
      ms,
      ...(inputTokens > 0 ? { inputTokens } : {}),
      ...(outputTokens > 0 ? { outputTokens } : {}),
      ...(record.error ? { error: String(record.error).slice(0, 300) } : {}),
    })
    if (this.recent.length > RECENT_CAP) this.recent.length = RECENT_CAP
  }

  /** 统计快照（RPC stats 使用）。 */
  statsSnapshot() {
    const cutoff = new Date(Date.now() - SERIES_WINDOW_MINUTES * 60 * 1000).toISOString().slice(0, 16)
    const totals = [...this.totals.values()].map((total) => ({
      agentId: total.agentId,
      name: total.name,
      provider: total.provider,
      model: total.model,
      calls: total.calls,
      errors: total.errors,
      inputTokens: total.inputTokens,
      outputTokens: total.outputTokens,
      totalMs: total.totalMs,
      lastAt: total.lastAt || undefined,
    }))
    const series = []
    for (const [agentId, buckets] of this.series) {
      const kept = [...buckets.values()].filter((bucket) => bucket.minute >= cutoff).sort((a, b) => (a.minute < b.minute ? -1 : 1))
      for (const bucket of [...buckets.values()]) if (bucket.minute < cutoff) buckets.delete(bucket.minute)
      if (kept.length > 0) series.push({ agentId, buckets: kept })
    }
    const accountTotals = [...this.accountTotals.values()].map((account) => ({
      provider: account.provider,
      calls: account.calls,
      errors: account.errors,
      inputTokens: account.inputTokens,
      outputTokens: account.outputTokens,
      totalMs: account.totalMs,
      lastAt: account.lastAt || undefined,
      models: [...account.models.values()].map((modelTotal) => ({
        model: modelTotal.model,
        calls: modelTotal.calls,
        errors: modelTotal.errors,
        inputTokens: modelTotal.inputTokens,
        outputTokens: modelTotal.outputTokens,
        totalMs: modelTotal.totalMs,
        lastAt: modelTotal.lastAt || undefined,
      })),
    })).sort((a, b) => (a.provider < b.provider ? -1 : 1))
    const accountSeries = []
    for (const [provider, buckets] of this.accountSeries) {
      const kept = [...buckets.values()].filter((bucket) => bucket.minute >= cutoff).sort((a, b) => (a.minute < b.minute ? -1 : 1))
      for (const bucket of [...buckets.values()]) if (bucket.minute < cutoff) buckets.delete(bucket.minute)
      if (kept.length > 0) accountSeries.push({ provider, buckets: kept })
    }
    return {
      ok: true,
      enabled: this.isEnabled(),
      totals,
      recent: [...this.recent],
      series,
      accountTotals,
      accountSeries,
    }
  }

  /** 面向主模型的目录文本（tool 行的提示段使用）。 */
  promptText() {
    const state = this.getState()
    if (state.enabled === false) return ''
    const entries = this.listEnabledAgents()
    if (entries.length === 0) return ''
    const lines = entries.map(([id, agent]) => {
      const provider = typeof agent.provider === 'string' && agent.provider.trim()
      const model = typeof agent.model === 'string' && agent.model.trim()
      const accountId = typeof agent.account === 'string' ? agent.account.trim() : ''
      const account = accountId ? this.getOAuthAccount(accountId) : undefined
      const meta = accountId
        ? `OAuth 账号:${account ? account.name || accountId : accountId}${model ? `/${model}` : ''}`
        : provider && model ? `${provider}/${model}` : provider ? `${provider}/*` : '跟随主模型'
      const description = typeof agent.description === 'string' && agent.description.trim() ? agent.description.trim() : '未填写说明'
      return `- \`${id}\`（${agent.name || id}，${this.normalizeType(agent.type)}）：${description} [${meta}]`
    })
    return [
      '## 多模型路由（Multi-model routing）',
      '',
      `你可以通过 \`route_agent\` 工具把任务交给下列专业 agent，每个 agent 可配置独立的服务商与模型：`,
      '',
      ...lines,
      '',
      '使用规则：',
      '- 仅在任务匹配该 agent 的能力时调用；普通文本任务不要路由。',
      '- `task` 必须自包含：专业 agent 看不到本会话的完整上下文（chat/image 类型），把需要的全部信息写进去。',
      '- `includeImages`（默认 true）会把会话中最近一条带图片的用户消息转发给该 agent；若该 agent 的模型不支持图片会明确报错。',
      '- 未配置模型的 agent 自动复用主 agent 当前模型。',
    ].join('\n')
  }

  // ── RPC 方法（typert gateway 直达）──────────────────────────────────────

  /** router/catalog：启用的 agent 目录 + 有效模型解析 + 主模型默认值。 */
  async catalog() {
    const defaults = this.defaults()
    const agents = []
    await Promise.all(this.listEnabledAgents().map(async ([id, agent]) => {
      const resolved = await this.resolveAgent(id)
      agents.push({
        id,
        name: agent.name || id,
        type: this.normalizeType(agent.type),
        enabled: agent.enabled !== false,
        description: typeof agent.description === 'string' ? agent.description : '',
        capabilities: Array.isArray(agent.capabilities) ? agent.capabilities.filter((item) => typeof item === 'string') : [],
        provider: typeof agent.provider === 'string' ? agent.provider : '',
        model: typeof agent.model === 'string' ? agent.model : '',
        account: typeof agent.account === 'string' ? agent.account : '',
        effectiveProvider: resolved.provider,
        effectiveModel: resolved.model,
        source: resolved.source,
        ...(resolved.error ? { error: resolved.error } : {}),
      })
    }))
    agents.sort((a, b) => (a.id < b.id ? -1 : 1))
    return {
      ok: true,
      enabled: this.isEnabled(),
      defaults: { provider: defaults.provider, model: defaults.model, ...(defaults.reasoningEffort ? { reasoningEffort: defaults.reasoningEffort } : {}) },
      agents,
      oauthAccounts: Object.entries(this.getState().oauthAccounts ?? {}).map(([id, account]) => ({
        id,
        name: account.name || id,
        enabled: account.enabled !== false,
        protocol: typeof account.protocol === 'string' ? account.protocol : 'openai-completions',
        baseURL: typeof account.baseURL === 'string' ? account.baseURL : '',
        tokenRef: typeof account.tokenRef === 'string' ? account.tokenRef : '',
        clientId: typeof account.clientId === 'string' ? account.clientId : '',
        authUrl: typeof account.authUrl === 'string' ? account.authUrl : '',
        tokenUrl: typeof account.tokenUrl === 'string' ? account.tokenUrl : '',
        scope: typeof account.scope === 'string' ? account.scope : '',
        models: Array.isArray(account.models) ? account.models.filter((item) => typeof item === 'string') : [],
      })).sort((a, b) => (a.id < b.id ? -1 : 1)),
    }
  }

  /** router/stats：实时用量快照。 */
  stats() {
    return this.statsSnapshot()
  }

  /** router/config：当前配置描述（settings seam 进程内读取，绕过 wire 白名单）。 */
  async config() {
    const settings = this.ctx.get('settings')
    if (!settings || typeof settings.describe !== 'function') throw new Error('settings 服务不可用')
    const descriptor = settings.describe({ redactSecrets: true }).find((entry) => String(entry.ns) === ROUTER_NS)
    if (!descriptor) throw new Error(`settings namespace "${ROUTER_NS}" 未注册：宿主行 dsh-router 未正常挂载`)
    return {
      ok: true,
      enabled: this.isEnabled(),
      revision: descriptor.revision,
      writable: settings.writable === true,
      value: descriptor.value && typeof descriptor.value === 'object' ? descriptor.value : {},
      ...(descriptor.user !== undefined ? { user: descriptor.user } : {}),
    }
  }

  /** router/save：path-op 写入（与 settings.mutate 同语义，冲突时抛错）。 */
  async save(request) {
    const settings = this.ctx.get('settings')
    if (!settings || typeof settings.mutate !== 'function') throw new Error('settings 服务不可用')
    const ops = Array.isArray(request?.ops) ? request.ops : []
    if (ops.length === 0) throw new Error('save 请求缺少 ops')
    await settings.mutate(ROUTER_NS, ops, request?.expectedRevision)
    const descriptor = settings.describe({ redactSecrets: true }).find((entry) => String(entry.ns) === ROUTER_NS)
    return {
      ok: true,
      revision: descriptor ? descriptor.revision : 0,
      ...(descriptor && descriptor.user !== undefined ? { user: descriptor.user } : {}),
    }
  }

  /** router/oauthTokenExchange：官方 OAuth2 授权码 + PKCE 的 code → token 交换。 */
  async oauthTokenExchange(request) {
    const id = String(request?.accountId ?? '')
    const account = this.getOAuthAccount(id)
    if (!account) return { ok: false, message: `OAuth 账号 "${id}" 不存在` }
    const tokenUrl = (typeof account.tokenUrl === 'string' && account.tokenUrl.trim()) ? account.tokenUrl.trim() : ''
    if (!tokenUrl) return { ok: false, message: '该账号未配置官方 token 端点（tokenUrl）；可改用「粘贴 access token」方式登录' }
    const params = new URLSearchParams()
    params.set('grant_type', 'authorization_code')
    params.set('code', String(request?.code ?? ''))
    params.set('redirect_uri', String(request?.redirectUri ?? ''))
    const verifier = String(request?.codeVerifier ?? '')
    if (verifier) params.set('code_verifier', verifier)
    const clientId = (typeof account.clientId === 'string' && account.clientId.trim()) ? account.clientId.trim() : ''
    if (clientId) params.set('client_id', clientId)
    const clientSecret = (typeof account.clientSecret === 'string' && account.clientSecret.trim()) ? account.clientSecret.trim() : ''
    if (clientSecret) params.set('client_secret', clientSecret)
    let response
    try {
      response = await globalThis.fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
    } catch (error) {
      return { ok: false, message: `token 端点不可达（${tokenUrl}）：${errorMessage(error)}` }
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 400)
      return { ok: false, message: `token 交换失败 HTTP ${response.status}${detail ? `：${detail}` : ''}` }
    }
    let payload
    try {
      payload = await response.json()
    } catch (error) {
      return { ok: false, message: `token 端点返回非 JSON：${errorMessage(error)}` }
    }
    const token = typeof payload?.access_token === 'string' && payload.access_token ? payload.access_token : ''
    if (!token) return { ok: false, message: 'token 端点未返回 access_token' }
    const ref = typeof account.tokenRef === 'string' && account.tokenRef.trim() ? account.tokenRef.trim() : ''
    if (!ref) return { ok: false, message: '该账号未配置凭据引用（tokenRef）' }
    const credentials = this.ctx.get('credentials')
    if (!credentials || typeof credentials.set !== 'function') return { ok: false, message: 'credentials 服务不可用' }
    try {
      await credentials.set(ref, token)
    } catch (error) {
      return { ok: false, message: `保存 access token 失败：${errorMessage(error)}` }
    }
    return {
      ok: true,
      message: 'OAuth 登录成功，access token 已保存',
      ...(typeof payload.expires_in === 'number' ? { expiresIn: payload.expires_in } : {}),
    }
  }

  /** router/oauthDiscover：用账号的 access token 询问端点公布的模型列表。 */
  async oauthDiscover(request) {
    const id = String(request?.accountId ?? '')
    const account = this.getOAuthAccount(id)
    if (!account) return { ok: false, message: `OAuth 账号 "${id}" 不存在`, models: [] }
    const baseURL = (typeof account.baseURL === 'string' && account.baseURL.trim()) ? account.baseURL.trim().replace(/\/+$/, '') : ''
    if (!baseURL) return { ok: false, message: '该账号未配置 Base URL', models: [] }
    let token
    try {
      token = await this.resolveOauthToken(account)
    } catch (error) {
      return { ok: false, message: errorMessage(error), models: [] }
    }
    const url = `${baseURL}/models`
    let response
    try {
      response = await globalThis.fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    } catch (error) {
      return { ok: false, message: `模型端点不可达（${url}）：${errorMessage(error)}`, models: [] }
    }
    if (!response.ok) {
      return { ok: false, message: `模型列表请求失败 HTTP ${response.status}`, models: [] }
    }
    let payload
    try {
      payload = await response.json()
    } catch (error) {
      return { ok: false, message: `模型端点返回非 JSON：${errorMessage(error)}`, models: [] }
    }
    const list = Array.isArray(payload?.data) ? payload.data : []
    const models = list
      .map((entry) => entry && typeof entry.id === 'string' ? entry.id : null)
      .filter((entry) => entry !== null)
    if (models.length === 0) return { ok: true, message: '端点未公布模型（可手工添加模型 id）', models }
    return { ok: true, message: `发现 ${models.length} 个模型`, models }
  }

  /** router/test：对 agent 做一次最小连通性调用（不记入统计）。 */
  async test(request) {
    const id = String(request?.agentId ?? '')
    const started = Date.now()
    const resolved = await this.resolveAgent(id)
    if (resolved.error) return { ok: false, message: resolved.error }
    const type = this.normalizeType(resolved.agent.type)
    if (type === 'image') {
      return { ok: true, message: `模型可解析：${resolved.provider}/${resolved.model}（image 类型不做生成测试）` }
    }
    if (type === 'speech') {
      return { ok: true, message: `模型可解析：${resolved.provider}/${resolved.model}（speech 类型不做转写测试）` }
    }
    try {
      const agent = { ...resolved.agent, maxRounds: 1, maxTokens: Number(resolved.agent.maxTokens) > 0 ? Math.min(Number(resolved.agent.maxTokens), 16) : 16 }
      const runner = resolved.mode === 'oauth' ? this.runOauthChat.bind(this) : this.runChat.bind(this)
      const result = await runner({ ...resolved, agent }, { agentId: id, task: '连通性测试：请只回复 OK', extra: '', images: [] })
      return {
        ok: true,
        message: `连通正常：${resolved.provider}/${resolved.model}，回复：${result.text.slice(0, 120)}`,
        latencyMs: Date.now() - started,
        ...(result.usage ? { usage: result.usage } : {}),
      }
    } catch (error) {
      return { ok: false, message: errorMessage(error), latencyMs: Date.now() - started }
    }
  }

  /** router/reset：清空统计。 */
  reset() {
    this.resetStats()
    return { ok: true }
  }
}
