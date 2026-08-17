/**
 * 多模态平台 L1：准入包装路由（隐身接管的底层）。
 *
 * 主模型为纯文本时，harness 的 prompt 准入按"当前选中模型"的
 * `inputModalities` 拒绝图片内容。本模块在"多模态开启"（存在启用的
 * 模态 agent 且总开关开启）时，为每个已启用 provider 注册一个包装
 * 路由 `<provider>-router`：
 * - `resolveModel` / `listModels` 镜像原适配器的元数据与目录，并把
 *   `inputModalities` 聚合声明为 `['text', ...已启用模态]` —— 准入放行；
 * - `stream()` 里消息块经模态改写注册表逐块改写为文本证据后委托原
 *   适配器 —— 文本大脑永远见不到裸模态块，而会话日志保留原件
 *   （Web UI 照常显示图片）；
 * - 文本轮零开销：无模态块的消息原样以原 provider 委托。
 *
 * 多模态关闭（无任何模态 agent 开启或总开关关闭）时全部卸载、零介入。
 * 热同步：监听 `settings/document-updated`（router 配置热更新）与
 * `llm/adapters-updated`（provider 热增删）。
 *
 * 参考实现：dsh-vision-router（twin 包装 + 输入层改写模式）；本模块为
 * 独立实现，改写目标指向本插件既有的 route_agent/专业 agent 通路。
 * @module dsh-agent-router/wrapper
 */

/** 包装路由后缀（内部 id 命名：`<provider>-router`）。 */
export const WRAP_SUFFIX = '-router'

/** settings namespace 名（与服务配置同源）。 */
export const ROUTER_NS = 'router'

/** 需要包装的 provider 集合：排除自身与已带包装后缀的路由。 */
export function wrappableProviders(llm) {
  return (llm.listProviders() ?? [])
    .map((entry) => (entry && typeof entry.id === 'string' ? entry.id : ''))
    .filter((provider) => provider !== '' && !provider.endsWith(WRAP_SUFFIX))
}

/**
 * image 块改写的完整标记文本（进 system 层）：识别/生图分流选项。
 * 标记放 system 而非 user 消息——大脑把 user 消息内容当"用户说的话"逐字
 * 复述（实测两次，即使注明"不要复述"），system 层指令则不会复述给用户。
 */
export function minimalImageRewrite(block, state) {
  const attachment = block?.attachment ?? {}
  const name = typeof attachment.name === 'string' && attachment.name ? attachment.name : '图片'
  const id = attachment.attachmentId ?? 'unknown'
  const vision = state?.vision ?? []
  const generation = state?.generation ?? []
  const quote = (list) => list.map((agentId) => `"${agentId}"`).join(' / ')
  const options = [
    vision.length > 0 ? `识别/描述/分析图片 → agent 填视觉 agent（${quote(vision)}）` : '',
    generation.length > 0 ? `基于图片生成或编辑图片（图生图）→ agent 填生图 agent（${quote(generation)}）` : '',
  ].filter(Boolean).join('；')
  return `[图片「${name}」已上传（附件 id ${String(id)}）。请直接调用 route_agent 工具，includeImages 传 true——${options}。task 写清用户需求。返回结果原样呈现。]`
}

/** image 块在 user 消息里的中性占位（完整标记在 system 层）。 */
export function imagePlaceholder(block) {
  const attachment = block?.attachment ?? {}
  const name = typeof attachment.name === 'string' && attachment.name ? attachment.name : '图片'
  return { type: 'text', text: `（用户上传了图片「${name}」，处理说明见系统提示）` }
}

/** 遍历消息深找模态块，为每个附件生成 system 标记（按 attachmentId 去重，不修改消息）。 */
export function collectMarkers(messages, active) {
  const markers = []
  const seen = new Set()
  const walk = (content) => {
    for (const block of content ?? []) {
      if (!block) continue
      const handler = active.find((entry) => entry.modality === block.type)
      if (handler) {
        const id = String(block?.attachment?.attachmentId ?? 'unknown')
        if (!seen.has(id)) {
          seen.add(id)
          markers.push(handler.marker(block, handler.state))
        }
        continue
      }
      if (block.type === 'tool-result' && Array.isArray(block.content)) walk(block.content)
    }
  }
  for (const message of messages ?? []) {
    if (message && Array.isArray(message.content)) walk(message.content)
  }
  return markers
}

/**
 * 深改写：content 中所有模态块（含 tool-result 嵌套）经对应改写器替换
 * 为文本证据。改写器注册表（active 条目 = `{ modality, state, rewrite }`）
 * 决定"哪种模态激活、改写时给大脑哪些 agent 选项"——多模态并存时多个
 * 条目各改各的块，聚合进同一包装路由。
 */
export function rewriteContentDeep(content, active) {
  let changed = false
  const out = []
  for (const block of content ?? []) {
    if (!block) {
      out.push(block)
      continue
    }
    const handler = active.find((entry) => entry.modality === block.type)
    if (handler) {
      changed = true
      out.push(handler.rewrite(block, handler.state))
      continue
    }
    if (block.type === 'tool-result' && Array.isArray(block.content)) {
      const inner = rewriteContentDeep(block.content, active)
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

/** 包装适配器工厂：镜像原适配器并聚合声明已启用模态；文本轮委托、模态块改写后委托。 */
export function createWrapAdapter(llm, provider, active) {
  const wrapRoute = `${provider}${WRAP_SUFFIX}`
  const original = () => {
    try {
      return llm.registration(provider).adapter
    } catch {
      return undefined
    }
  }
  return {
    providerInfo(route) {
      const base = original()
      let info
      try {
        info = base && typeof base.providerInfo === 'function' ? base.providerInfo(provider) : undefined
      } catch {
        info = undefined
      }
      // 接管标签：原名 + " + 多模态"——用户一眼确认钩子已生效。
      return { id: route, name: `${info && info.name ? info.name : provider} + 多模态` }
    },
    providerRetryPolicy() {
      const base = original()
      try {
        return base && typeof base.providerRetryPolicy === 'function'
          ? base.providerRetryPolicy(provider)
          : undefined
      } catch {
        return undefined
      }
    },
    async listModels() {
      const base = original()
      if (!base || typeof base.listModels !== 'function') return []
      try {
        const listed = await base.listModels(provider)
        // 宿主按 route 校验 model.provider === provider：目录镜像必须改写
        // provider 字段并聚合声明已启用模态（模型选择器据此建组）。
        const modalities = ['text', ...active.map((entry) => entry.modality)]
        return listed.map((model) => ({ ...model, provider: wrapRoute, inputModalities: modalities }))
      } catch {
        return []
      }
    },
    async resolveModel(_route, model, signal) {
      const base = original()
      if (!base || typeof base.resolveModel !== 'function') {
        throw new Error(`dsh-agent-router: wrapped provider "${provider}" has no adapter registered yet`)
      }
      const resolved = await base.resolveModel(provider, model, signal)
      const modalities = ['text', ...active.map((entry) => entry.modality)]
      return { ...resolved, provider: wrapRoute, inputModalities: modalities }
    },
    async *stream(options) {
      // 完整标记进 system 层（大脑当系统指令执行，不会复述给用户）；
      // user/tool 消息里的图片块改写为中性占位。日志层（气泡）不动。
      const markers = collectMarkers(options.messages, active)
      const rewritten = (options.messages ?? []).map((message) => {
        if (!message || !Array.isArray(message.content)) return message
        const result = rewriteContentDeep(message.content, active)
        return result.changed ? { ...message, content: result.content } : message
      })
      const system = markers.length > 0
        ? [typeof options.system === 'string' && options.system !== '' ? options.system : null, ...markers].filter(Boolean).join('\n\n')
        : options.system
      yield* llm.stream({ ...options, provider, ...(system === options.system ? {} : { system }), messages: rewritten })
    },
  }
}

/**
 * 模态接入注册表：哪个 agent 类型开启，激活哪个模态的声明与改写器。
 * 新增模态 = 追加一个条目（声明聚合与改写分发自动支持并存），
 * 不改包装/同步骨架。
 */
export const MODALITY_ENTRIES = [
  {
    modality: 'image',
    /** 识别/生图任一 agent 存在且总开关开启时激活；返回两类 agent id 列表，
     *  供改写标记给大脑"识别 vs 图生图"的分流提示。 */
    stateOf(service) {
      if (!service.isEnabled()) return null
      const vision = service.listImageVisionAgents().map(([id]) => id)
      const generation = service.listImageGenerationAgents().map(([id]) => id)
      if (vision.length === 0 && generation.length === 0) return null
      return { vision, generation }
    },
    /** system 层完整标记（agent 分流选项）。 */
    marker: minimalImageRewrite,
    /** user/tool 消息里的中性占位替换块。 */
    rewrite: imagePlaceholder,
  },
]

/**
 * 安装准入包装：按需同步包装路由集合。
 * @param ctx - 宿主行 ctx（与 llm 服务同根作用域，可收 adapters/settings 事件）。
 * @param service - RouterService（isEnabled / listImageVisionAgents）。
 * @returns 卸载器（释放全部包装注册与事件监听）。
 */
export function installAdmissionWrapper(ctx, service) {
  const llm = ctx.get('llm')
  if (!llm || typeof llm.registerAdapter !== 'function' || typeof llm.registration !== 'function') {
    ctx.logger?.warn?.('dsh-agent-router: llm service unavailable; admission wrapper disabled')
    return () => {}
  }
  // 默认模型接管（可选）：多模态开启 → 默认模型落到包装路由（新会话零竞态
  // 零操作）；关闭 → 恢复原 provider。已有会话的当前选中由客户端侧接管。
  const defaultModel = ctx.get('agentDefaultModel')
  const canTakeover = !!defaultModel && typeof defaultModel.currentSelection === 'function' && typeof defaultModel.saveSelection === 'function'
  const wrapHandles = new Map()
  const syncDefaultModel = async (takeover) => {
    try {
      const current = defaultModel.currentSelection()
      if (!current || typeof current.provider !== 'string' || typeof current.model !== 'string' || current.model === '') return
      const provider = current.provider
      if (takeover) {
        // 接管：当前默认 provider 可包装且尚未被接管时，切到其包装路由。
        if (!provider.endsWith(WRAP_SUFFIX) && wrappableProviders(llm).includes(provider)) {
          await defaultModel.saveSelection({ provider: `${provider}${WRAP_SUFFIX}`, model: current.model, ...(current.reasoningEffort === void 0 ? {} : { reasoningEffort: current.reasoningEffort }) })
        }
      } else if (provider.endsWith(WRAP_SUFFIX)) {
        // 恢复：默认模型仍指向包装路由时，剥掉后缀还原原 provider。
        await defaultModel.saveSelection({ provider: provider.slice(0, -WRAP_SUFFIX.length), model: current.model, ...(current.reasoningEffort === void 0 ? {} : { reasoningEffort: current.reasoningEffort }) })
      }
    } catch (error) {
      ctx.logger?.warn?.(`dsh-agent-router: default-model takeover sync failed: ${error && error.message ? error.message : String(error)}`)
    }
  }
  const sync = () => {
    // 已启用模态的激活条目：state 非空者进入聚合声明与改写分发。
    const active = MODALITY_ENTRIES
      .map((entry) => ({ modality: entry.modality, state: entry.stateOf(service), marker: entry.marker, rewrite: entry.rewrite }))
      .filter((entry) => entry.state !== null)
    const wanted = new Set(active.length > 0 ? wrappableProviders(llm) : [])
    for (const [provider, handle] of [...wrapHandles.entries()]) {
      if (!wanted.has(provider)) {
        handle()
        wrapHandles.delete(provider)
      }
    }
    if (active.length > 0) {
      for (const provider of wanted) {
        if (wrapHandles.has(provider)) continue
        try {
          const handle = llm.registerAdapter([`${provider}${WRAP_SUFFIX}`], createWrapAdapter(llm, provider, active))
          wrapHandles.set(provider, handle)
        } catch (error) {
          ctx.logger?.warn?.(`dsh-agent-router: wrap route for "${provider}" registration failed: ${error && error.message ? error.message : String(error)}`)
        }
      }
    }
    // 注册/卸载完成后同步默认模型（异步写 settings，不阻塞路由同步）。
    if (canTakeover) void syncDefaultModel(active.length > 0)
  }
  sync()
  const offAdapters = ctx.on('llm/adapters-updated', sync)
  // 监听 settings/updated 而非 settings/document-updated：settings 服务在
  // document-updated 发出时尚未提交 resolved 值（bumpRevision 先于 commit），
  // 彼时 scope.get() 读到的还是旧配置 → 关闭动作不会卸载包装组。
  // settings/updated 在 resolved 提交后发出，读到的一定是新值。
  const offSettings = ctx.on('settings/updated', (ns) => {
    if (ns === ROUTER_NS || ns === void 0) sync()
  })
  return () => {
    offAdapters()
    offSettings()
    for (const handle of wrapHandles.values()) handle()
    wrapHandles.clear()
    if (canTakeover) void syncDefaultModel(false)
  }
}
