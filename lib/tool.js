/**
 * dsh-router 的模型面向行（agent preset 组合：
 * `- id: tool-router; name: dsh-router/tool`）。
 *
 * 注册两项贡献（都落在调用方 scope，随 preset 挂载/卸载）：
 * - `route_agent` 工具：主 agent 把任务路由给配置的专业 agent；
 * - 系统提示段 `router:agents`（order 120）：让主 agent 感知可用
 *   的专业 agent 目录与使用规则；文本每次装配时动态生成，配置
 *   变更即时生效。
 *
 * `tools` / `systemPrompt` 是硬依赖（宿主 base 组合行，inject 等待其
 * 就绪），注册直接发生在 apply 内（与 shipped 工具行相同的模式；
 * `tools.register` 自行按调用 fiber 管理注销）。宿主 `router` 服务为
 * 可选依赖：未挂载 dsh-router 宿主行时本行空转（工具调用时报
 * “服务不可用”，提示段输出为空）。
 * @module dsh-router/tool
 */
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-router/tool'

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
    usage: { type: 'json' },
  },
}

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'route_agent',
    description: [
      '把任务交给配置好的专业 agent（多模型路由）。每个专业 agent 拥有独立的服务商/模型，例如视觉 agent 用于图片识别、图片生成 agent 用于按描述生成图片、翻译 agent 用于翻译、语音识别 agent 用于音频转写。',
      '只有当任务明确匹配某个专业 agent 的能力时才调用；普通文本任务不要路由。',
      '`agent` 填目标 agent 的 id（可用 id 见系统提示中的多模型路由段）。',
      '`task` 必须自包含：专业 agent 看不到本会话完整上下文，需把全部必要信息写入。',
      '`includeImages` 默认 true：把会话中最近一条带图片的用户消息一并转发（图片识别等场景务必保持 true）。',
      '`filePath`：语音识别（speech）类 agent 需要——工作区内音频文件的绝对或相对路径。',
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
        description: '自包含的任务描述，含全部必要上下文。',
      },
      includeImages: {
        type: 'boolean',
        description: '是否把会话最近一张用户图片转发给该 agent；默认 true。',
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
        if (value && value.image && typeof value.image === 'object') {
          blocks.push({ type: 'image', attachment: value.image })
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
    timeoutMs: 5 * 60 * 1000,
    async execute(args, exec) {
      const service = ctx.get('router')
      if (!service) throw new Error('多模型路由服务不可用：宿主行 dsh-router 未挂载')
      if (!service.isEnabled()) throw new Error('多模型路由未启用：请在 设置 → Agent 路由 中打开总开关')
      const agentId = typeof args.agent === 'string' ? args.agent.trim() : ''
      if (!agentId) throw new Error('缺少 agent 参数')
      const images = args.includeImages === false ? [] : service.findRecentImages(exec.agent)
      const resolved = await service.resolveAgent(agentId)
      if (resolved.error) throw new Error(resolved.error)
      const started = Date.now()
      try {
        const result = await service.run({
          agentId,
          task: args.task,
          extra: typeof args.extra === 'string' ? args.extra : '',
          filePath: typeof args.filePath === 'string' ? args.filePath : '',
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
