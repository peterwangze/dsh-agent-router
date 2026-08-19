/**
 * dsh-agent-router 的模型面向行（`- id: tool-router; name: dsh-agent-router/tool`）。
 *
 * 推荐挂载位置：宿主组合（web profile 的 cordis.patch.yml，与 `router`
 * 宿主行并列）。宿主平面注册的工具沿 scope 父链对所有 agent 会话可见，
 * 因此内置预设（standard/cordis/code/minimal）与用户自定义/复制的
 * 任意预设都自动获得 route_agent 工具与提示段，开放使用零配置。
 * 仍可按预设挂载（如 governance 模板）作分层覆盖；同名在子层遮蔽
 * 父层，配置相同，二者不冲突。
 *
 * 注册两项贡献（都落在调用方 scope，随所在组合行挂载/卸载）：
 * - `route_agent` 工具：主 agent 把任务路由给配置的专业 agent；
 * - 系统提示段 `router:agents`（order 120）：让主 agent 感知可用
 *   的专业 agent 目录与使用规则；文本每次装配时动态生成，配置
 *   变更即时生效。
 *
 * `tools` / `systemPrompt` 是硬依赖（宿主 base 组合均提供，inject 等待
 * 其就绪），注册直接发生在 apply 内（与 shipped 工具行相同的模式；
 * `tools.register` 自行按调用 fiber 管理注销）。宿主 `router` 服务为
 * 可选依赖：未挂载 dsh-agent-router 宿主行时本行空转（工具调用时报
 * “服务不可用”，提示段输出为空）。
 * @module dsh-agent-router/tool
 */
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-agent-router/tool'

/** 硬依赖：宿主 base 组合中的工具注册表与系统提示注册表。 */
export const inject = ['tools', 'systemPrompt']

/** 工具输出 schema（JSON value 形状）。 */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    agent: { type: 'string' },
    provider: { type: 'string' },
    model: { type: 'string' },
    text: { type: 'string' },
    image: { type: 'json' },
    images: { type: 'json' },
    usage: { type: 'json' },
  },
}

export function apply(ctx) {
  // 图片标记助手：优先复用宿主服务的实现；服务未挂载时用同构最小回退
  // （保证工具行单独挂载时渲染结果仍为纯文本标记，绝不出现图片块）。
  const markerOf = (ref) => {
    const router = ctx.get('router')
    if (router && typeof router.imageMarkerOf === 'function') return router.imageMarkerOf(ref)
    const safe = { ...ref }
    if (typeof safe.name === 'string') safe.name = String(safe.name).replace(/[\u0000-\u001f\u007f[\]]/g, '').trim().slice(0, 120)
    return `[router:image:${JSON.stringify(safe)}]`
  }
  ctx.tools.register(defineTool({
    name: 'route_agent',
    description: [
      '把任务交给配置好的专业 agent（多模型路由）。每个专业 agent 拥有独立的服务商/模型，例如视觉 agent 用于图片识别、图片生成 agent 用于按描述生成图片、翻译 agent 用于翻译、语音识别 agent 用于音频转写。',
      '只有当任务明确匹配某个专业 agent 的能力时才调用；普通文本任务不要路由。',
      '`agent` 填目标 agent 的 id（可用 id 见系统提示中的多模型路由段）。',
      '`task` 写清任务需求即可：带图片的视觉调用会自动附带主会话的最近对话上下文（其余类型看不到本会话上下文，需自包含——agent 类型处理文件时写明工作区文件路径）。',
      '附件按需显式派发：`attachments` 传附件序号（0 起，按最近一条含附件的用户消息中的出现顺序）；`includeImages: true` 表示把该消息的全部图片一并转发；两者都不给 = 不携带任何附件。',
      '`files`：工作区文件路径或 http(s) URL 列表，一次可传多个不同类型。chat 类型按内容分发（图片文件内联注入，需该 agent 声明 image 能力；文本文件内联进 task；其余二进制请改传 agent 类型）；agent 类型把路径注入子代理由其用 fs 工具读取；cli 类型同样把路径注入无头 CLI 子代理（由其自身工具读取）；URL 由宿主下载到工作区 .router-files/ 后按同样规则分发。用户从对话框上传的截图（`[用户附带图片]` 路径清单）即按此参数传入。',
      '`filePath`：语音识别（speech）类 agent 需要——工作区内音频文件的绝对或相对路径。',
      'agent 类型的专业 agent 会自动收到会话工作目录：处理工作区任意文件（PDF/音频/视频/代码等）时在 `task` 里写明路径即可，产物写入工作区并在结果中报告路径。',
      'cli 类型的专业 agent 是无头 CLI 子代理（codex / claude / gemini 等）：使用 CLI 自身登录态（首次需在终端运行 `codex login` 等完成登录），任务经 stdin 注入、在工作区内自动执行，图片附件落盘为工作区文件路径。',
    ].join('\n'),
    parameters: {
      agent: {
        type: 'string',
        required: true,
        description: '目标专业 agent 的 id（见系统提示中的可用目录）。',
      },
      task: {
        type: 'string',
        required: true,
        description: '自包含的任务描述，含全部必要上下文（含要处理的文件路径）。',
      },
      attachments: {
        type: 'array',
        items: { type: 'number' },
        description: '要传给专业 agent 的附件序号数组（从 0 开始，按最近一条含附件的用户消息中附件的出现顺序编号）。显式指定，不传则不携带任何附件；例如只识别该消息的第 2 张图就传 [1]。',
      },
      includeImages: {
        type: 'boolean',
        description: '快捷方式：true 时把最近一条含附件的用户消息中的全部图片一并转发；默认不转发。与 attachments 同时给出时取并集。',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: '要处理的工作区文件路径或 http(s) URL 列表（一次可传多个不同类型的文件）。chat 类型按内容分发：图片文件（PNG/JPEG/WebP/GIF）内联注入（要求该 agent 的 capabilities 含 image）、文本文件内联进 task、其余二进制与目录不支持（改用 agent 类型）；agent 类型把路径注入子代理任务，由其用 fs 工具自行读取；URL 由宿主下载落盘到工作区 .router-files/ 后再按同样规则分发。',
      },
      filePath: {
        type: 'string',
        description: '语音识别（speech）类 agent：工作区内音频文件路径。',
      },
      extra: {
        type: 'string',
        description: '可选：附加要求（输出格式、语言等）。',
      },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render(_args, value) {
        const blocks = []
        if (value && typeof value.text === 'string' && value.text) {
          blocks.push({ type: 'text', text: value.text })
        }
        // 图片一律以纯文本标记渲染，绝不把图片块写入工具结果：
        // 主模型为纯文本时，图片块一旦进入会话历史，每次模型请求都会
        // 报 UNSUPPORTED_CONTENT。浏览器侧 toolview 解析标记渲染缩略图。
        if (value && value.image && typeof value.image === 'object') {
          blocks.push({ type: 'text', text: markerOf(value.image) })
        }
        for (const ref of Array.isArray(value?.images) ? value.images : []) {
          if (ref && typeof ref === 'object') blocks.push({ type: 'text', text: markerOf(ref) })
        }
        if (value && value.usage && typeof value.usage === 'object') {
          blocks.push({
            type: 'text',
            text: `[${value.provider ?? ''}/${value.model ?? ''} · 输入 ${value.usage.inputTokens ?? 0} / 输出 ${value.usage.outputTokens ?? 0} tokens]`,
          })
        }
        return blocks
      },
    },
    // 超时上限需覆盖 cli 子代理的默认 15 分钟执行窗口（其余类型远早于此完成）。
    timeoutMs: 20 * 60 * 1000,
    async execute(args, exec) {
      const service = ctx.get('router')
      if (!service) throw new Error('多模型路由服务不可用：宿主行 dsh-agent-router 未挂载')
      if (!service.isEnabled()) throw new Error('多模型路由未启用：请在 设置 → Agent 路由 中打开总开关')
      const agentId = typeof args.agent === 'string' ? args.agent.trim() : ''
      if (!agentId) throw new Error('缺少 agent 参数')
      // 附件按需显式派发：attachments 序号 + includeImages 快捷方式；
      // 都不给 = 不携带附件。
      const images = service.selectAttachments(exec.agent, {
        indices: Array.isArray(args.attachments) ? args.attachments : undefined,
        includeImages: args.includeImages === true,
      })
      const resolved = await service.resolveAgent(agentId)
      if (resolved.error) throw new Error(resolved.error)
      const started = Date.now()
      try {
        const result = await service.run({
          agentId,
          task: args.task,
          extra: typeof args.extra === 'string' ? args.extra : '',
          filePath: typeof args.filePath === 'string' ? args.filePath : '',
          files: Array.isArray(args.files) ? args.files.filter((item) => typeof item === 'string') : [],
          images,
          exec,
          signal: exec.signal,
        })
        const usage = result.usage
        service.record({
          agentId,
          provider: resolved.provider,
          model: resolved.model,
          ok: true,
          ms: Date.now() - started,
          ...(usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } : {}),
        })
        return {
          ok: true,
          agent: agentId,
          provider: resolved.provider,
          model: resolved.model,
          text: result.text,
          ...(result.image ? { image: result.image } : {}),
          ...(Array.isArray(result.images) && result.images.length > 0 ? { images: result.images } : {}),
          ...(usage ? { usage } : {}),
        }
      } catch (error) {
        service.record({
          agentId,
          provider: resolved.provider,
          model: resolved.model,
          ok: false,
          ms: Date.now() - started,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  }))

  ctx.systemPrompt.section({
    name: 'router:agents',
    order: 120,
    text: () => {
      const router = ctx.get('router')
      return router ? router.promptText() : ''
    },
  })
}
