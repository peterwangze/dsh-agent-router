/**
 * 多模态平台 L1：准入包装（twin 路由）。
 *
 * 主模型为纯文本时，harness 的 prompt 准入按"当前选中模型"的
 * `inputModalities` 拒绝图片内容。本模块为每个已启用 provider 注册一个
 * 包装（twin）路由 `<provider>-vision`：
 * - `resolveModel` / `listModels` 镜像原适配器的元数据与目录，并把
 *   `inputModalities` 声明为 `['text', 'image']` —— 准入检查放行；
 * - `stream()` 里把消息中的图片块（含 tool-result 嵌套）改写为文本证据
 *   后委托原适配器 —— 文本大脑永远见不到裸图片块，而会话日志保留原件
 *   （Web UI 照常显示图片）；
 * - 原模型组不动：用户只有发图时才需选择「+ 自动识图」组。
 *
 * 门控：仅当"总开关开启且存在视觉类 agent"时注册 twin —— 与"开启视觉
 * agent 时才解除发送限制"的产品语义一致；关闭时全部卸载。热同步：监听
 * `settings/document-updated`（router 配置热更新）与
 * `llm/adapters-updated`（provider 热增删）。
 *
 * 参考实现：dsh-vision-router（twin 包装 + 输入层改写模式）；本模块为
 * 独立实现，改写目标指向本插件既有的 route_agent/视觉 agent 通路。
 * @module dsh-agent-router/wrapper
 */

/** twin 路由后缀（包装路由名 = `<provider>-vision`）。 */
export const TWIN_SUFFIX = '-vision'

/** settings namespace 名（与服务配置同源）。 */
export const ROUTER_NS = 'router'

/** 需要包装的 provider 集合：排除自身 twin 与已带后缀的路由。 */
export function wrappableProviders(llm) {
  return (llm.listProviders() ?? [])
    .map((entry) => (entry && typeof entry.id === 'string' ? entry.id : ''))
    .filter((provider) => provider !== '' && !provider.endsWith(TWIN_SUFFIX))
}

/**
 * 图片块的最小改写（L1）：静态工具标记，引导文本大脑经既有
 * route_agent/includeImages 通路把图片交给视觉 agent。
 * L3 里程碑升级为改写器注册表 + 证据缓存（视觉结果按内容哈希缓存）。
 */
export function minimalImageRewrite(block, agentId) {
  const attachment = block?.attachment ?? {}
  const name = typeof attachment.name === 'string' && attachment.name ? attachment.name : '图片'
  const id = attachment.attachmentId ?? 'unknown'
  return {
    type: 'text',
    text: `[图片「${name}」已上传（附件 id ${String(id)}）。当前文本模型无法直接查看图片内容：请调用 route_agent 工具，agent 填 "${agentId}"，includeImages 传 true，task 写清用户需求（当前会话的最近上下文会随调用自动附带）。返回结果原样呈现，不要自行重复分析。]`,
  }
}

/** 深改写：把 content 中所有图片块（含 tool-result 嵌套）替换为文本。 */
export function rewriteImagesDeep(content, replace) {
  let changed = false
  const out = []
  for (const block of content ?? []) {
    if (!block) {
      out.push(block)
      continue
    }
    if (block.type === 'image') {
      changed = true
      out.push(replace(block))
      continue
    }
    if (block.type === 'tool-result' && Array.isArray(block.content)) {
      const inner = rewriteImagesDeep(block.content, replace)
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

/** twin 适配器工厂：镜像原适配器并声明 image；文本轮委托、图片轮改写后委托。 */
export function createTwinAdapter(llm, provider, agentId) {
  const twinRoute = `${provider}${TWIN_SUFFIX}`
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
      return { id: route, name: `${info && info.name ? info.name : provider} + 自动识图` }
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
        // provider 字段并声明 image（模型选择器据此建组）。
        return listed.map((model) => ({ ...model, provider: twinRoute, inputModalities: ['text', 'image'] }))
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
      return { ...resolved, provider: twinRoute, inputModalities: ['text', 'image'] }
    },
    async *stream(options) {
      const rewritten = (options.messages ?? []).map((message) => {
        if (!message || !Array.isArray(message.content)) return message
        const result = rewriteImagesDeep(message.content, (block) => minimalImageRewrite(block, agentId))
        return result.changed ? { ...message, content: result.content } : message
      })
      yield* llm.stream({ ...options, provider, messages: rewritten })
    },
  }
}

/**
 * 安装准入包装：按需同步 twin 路由集合。
 * @param ctx - 宿主行 ctx（与 llm 服务同根作用域，可收 adapters/settings 事件）。
 * @param service - RouterService（isEnabled / listImageVisionAgents）。
 * @returns 卸载器（释放全部 twin 注册与事件监听）。
 */
export function installAdmissionWrapper(ctx, service) {
  const llm = ctx.get('llm')
  if (!llm || typeof llm.registerAdapter !== 'function' || typeof llm.registration !== 'function') {
    ctx.logger?.warn?.('dsh-agent-router: llm service unavailable; admission wrapper disabled')
    return () => {}
  }
  const twinHandles = new Map()
  const sync = () => {
    const targets = service.isEnabled() ? service.listImageVisionAgents() : []
    const agentId = targets.length > 0 ? targets[0][0] : ''
    const wanted = new Set(agentId ? wrappableProviders(llm) : [])
    for (const [provider, handle] of [...twinHandles.entries()]) {
      if (!wanted.has(provider)) {
        handle()
        twinHandles.delete(provider)
      }
    }
    if (agentId) {
      for (const provider of wanted) {
        if (twinHandles.has(provider)) continue
        try {
          const handle = llm.registerAdapter([`${provider}${TWIN_SUFFIX}`], createTwinAdapter(llm, provider, agentId))
          twinHandles.set(provider, handle)
        } catch (error) {
          ctx.logger?.warn?.(`dsh-agent-router: twin route for "${provider}" registration failed: ${error && error.message ? error.message : String(error)}`)
        }
      }
    }
  }
  sync()
  const offAdapters = ctx.on('llm/adapters-updated', sync)
  const offSettings = ctx.on('settings/document-updated', (ns) => {
    if (ns === ROUTER_NS || ns === void 0) sync()
  })
  return () => {
    offAdapters()
    offSettings()
    for (const handle of twinHandles.values()) handle()
    twinHandles.clear()
  }
}
