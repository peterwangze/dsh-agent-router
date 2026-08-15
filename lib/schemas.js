/**
 * dsh-router 配置 schema 与 wire 校验器。
 *
 * - `routerSchema`：注册到 DSH settings seam 的 `router` namespace
 *   （schemastery）。用户层写入 `settings.yaml` 的 `router:` 分节，
 *   或由设置页通过 `settings.mutate` 以 path-op 写入；热生效。
 * - `makeValidator`：手写的严格（strict）wire codec，供 typert
 *   gateway 宿主侧与客户端 `$mount` 共用。校验器只做形状检查，
 *   未知字段透传，`parse(value)` 校验失败时抛出带路径的 Error。
 *
 * Agent 配置语义（空字符串 = 跟随主模型 / 未指定）：
 * - `provider` / `model` 都为空：完全复用主 agent 当前模型。
 * - 只填 `provider`：该服务商的第一个已注册模型。
 * - 只填 `model`：在主 agent 的服务商下使用该模型。
 * - `type`：`chat`（单/多轮对话型专业 agent，支持图片输入）、
 *   `agent`（完整子 agent 委派，复用 DSH subagent seam）、
 *   `image`（OpenAI 兼容 Images API 图片生成）。
 * @module dsh-router/schemas
 */
import z from '@deepseek-ai/schemastery'

/** Settings namespace 名，与 settings.yaml 的 `router:` 分节对应。 */
export const ROUTER_NS = 'router'

/** 单个自定义 agent 的配置。 */
export const agentSchema = z.object({
  /** 展示名称。 */
  name: z.string().default(''),
  /** 执行形态：chat / agent / image。 */
  type: z.string().default('chat'),
  /** 是否启用（false 的 agent 不出现在主模型目录与提示段中）。 */
  enabled: z.boolean().default(true),
  /** 面向主模型的说明：这个 agent 能做什么、什么场景该用它。 */
  description: z.string().default(''),
  /** 能力提示标签，如 image / audio / code / web。 */
  capabilities: z.array(z.string()).default([]),
  /** 服务商路由（如 openai、deepseek-official）；空 = 跟随主模型。 */
  provider: z.string().default(''),
  /** 模型 id；空 = 继承（跟随主模型或该服务商第一个模型）。 */
  model: z.string().default(''),
  /** 推理强度（适配器定义的不透明 id，如 high / max）。 */
  reasoningEffort: z.string().default(''),
  /** 采样温度；0 表示不指定。 */
  temperature: z.number().min(0).max(2).default(0),
  /** 单次请求输出上限；0 表示不指定。 */
  maxTokens: z.natural().default(0),
  /** 对话轮数上限（chat 类型）；1 表示单轮。 */
  maxRounds: z.natural().min(1).max(8).default(1),
  /** 专业 agent 的 system prompt；空 = 默认专业助手提示。 */
  systemPrompt: z.string().default(''),
  /** image 类型使用的 OpenAI 兼容 Images 端点；空 = 官方端点。 */
  endpoint: z.string().default(''),
  /** image 类型输出尺寸（1024x1024 / 1792x1024 / 1024x1792）。 */
  imageSize: z.string().default('1024x1024'),
  /** 凭据引用（如 OPENAI_API_KEY），经 credentials seam 解析。 */
  apiKeyEnv: z.string().default(''),
  /** agent 类型的工具白名单；空 = 除 route_agent 外的全部工具。 */
  tools: z.array(z.string()).default([]),
})

/** `router` namespace 的完整 schema。 */
export const routerSchema = z.object({
  /** 总开关：关闭后 route_agent 报错、提示段清空、统计暂停。 */
  enabled: z.boolean().default(true),
  /** 以 id 为键的自定义 agent 字典。 */
  agents: z.dict(agentSchema).default({}),
})

// ── wire codec（typert strict）─────────────────────────────────────────────

/** 递归形状检查：check(spec, value, path)。未知字段透传。 */
function check(spec, value, path) {
  if (value === undefined || value === null) {
    if (spec.optional === true) return value
    throw new Error(`dsh-router wire: ${path} is required`)
  }
  switch (spec.kind) {
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`dsh-router wire: ${path} must be an object`)
      if (spec.properties) {
        for (const [key, child] of Object.entries(spec.properties)) {
          const childSpec = child && child.spec ? child.spec : child
          const next = check(childSpec, value[key], path === '' ? key : `${path}.${key}`)
          if (next !== undefined) value[key] = next
        }
      }
      return value
    }
    case 'array': {
      if (!Array.isArray(value)) throw new Error(`dsh-router wire: ${path} must be an array`)
      if (spec.items) {
        for (let index = 0; index < value.length; index++) {
          const next = check(spec.items, value[index], `${path}[${index}]`)
          if (next !== undefined) value[index] = next
        }
      }
      return value
    }
    case 'string':
      if (typeof value !== 'string') throw new Error(`dsh-router wire: ${path} must be a string`)
      return value
    case 'boolean':
      if (typeof value !== 'boolean') throw new Error(`dsh-router wire: ${path} must be a boolean`)
      return value
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`dsh-router wire: ${path} must be a finite number`)
      return value
    case 'json':
      return value
    /* v8 ignore next -- closed vocabulary */
    default:
      return value
  }
}

/** 包装成 strict codec 形状（{ parse, spec }）。 */
function codecOf(spec) {
  return { parse: (value) => check(spec, value, ''), spec }
}

/** 便捷构造器：返回 codec（{ parse }）。 */
const v = {
  object(properties, optional = false) {
    return codecOf({ kind: 'object', properties, optional })
  },
  array(items, optional = false) {
    return codecOf({ kind: 'array', items: items.spec, optional })
  },
  string(optional = false) {
    return codecOf({ kind: 'string', optional })
  },
  boolean(optional = false) {
    return codecOf({ kind: 'boolean', optional })
  },
  number(optional = false) {
    return codecOf({ kind: 'number', optional })
  },
  json(optional = false) {
    return codecOf({ kind: 'json', optional })
  },
}

/** 统计里一次调用的 wire 形状。 */
export const usageCodec = v.object({
  inputTokens: v.number(true),
  outputTokens: v.number(true),
  cacheReadTokens: v.number(true),
  cacheWriteTokens: v.number(true),
  reasoningTokens: v.number(true),
}, true)

/** 校验器导出：宿主 typert 注册与客户端 $mount 共用同一形状。 */
export const wireCodecs = {
  /** router/catalog 结果。 */
  catalogResult: v.object({
    ok: v.boolean(),
    enabled: v.boolean(),
    defaults: v.object({ provider: v.string(), model: v.string(), reasoningEffort: v.string(true) }),
    agents: v.array(v.object({
      id: v.string(),
      name: v.string(),
      type: v.string(),
      enabled: v.boolean(),
      description: v.string(),
      capabilities: v.array(v.string()),
      provider: v.string(),
      model: v.string(),
      effectiveProvider: v.string(),
      effectiveModel: v.string(),
      source: v.string(),
      error: v.string(true),
    })),
  }),
  /** router/stats 结果。 */
  statsResult: v.object({
    ok: v.boolean(),
    enabled: v.boolean(),
    totals: v.array(v.object({
      agentId: v.string(),
      name: v.string(),
      provider: v.string(),
      model: v.string(),
      calls: v.number(),
      errors: v.number(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      totalMs: v.number(),
      lastAt: v.number(true),
    })),
    recent: v.array(v.object({
      at: v.number(),
      agentId: v.string(),
      provider: v.string(),
      model: v.string(),
      ok: v.boolean(),
      ms: v.number(),
      inputTokens: v.number(true),
      outputTokens: v.number(true),
      error: v.string(true),
    })),
    series: v.array(v.object({
      agentId: v.string(),
      buckets: v.array(v.object({
        minute: v.string(),
        calls: v.number(),
        errors: v.number(),
        inputTokens: v.number(),
        outputTokens: v.number(),
      })),
    })),
    accountTotals: v.array(v.object({
      provider: v.string(),
      calls: v.number(),
      errors: v.number(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      totalMs: v.number(),
      lastAt: v.number(true),
      models: v.array(v.object({
        model: v.string(),
        calls: v.number(),
        errors: v.number(),
        inputTokens: v.number(),
        outputTokens: v.number(),
        totalMs: v.number(),
        lastAt: v.number(true),
      })),
    })),
    accountSeries: v.array(v.object({
      provider: v.string(),
      buckets: v.array(v.object({
        minute: v.string(),
        calls: v.number(),
        errors: v.number(),
        inputTokens: v.number(),
        outputTokens: v.number(),
      })),
    })),
  }),
  /** router/test 结果。 */
  testResult: v.object({
    ok: v.boolean(),
    message: v.string(),
    latencyMs: v.number(true),
    usage: usageCodec,
  }),
  /** router/reset 结果。 */
  resetResult: v.object({ ok: v.boolean() }),
  /** router/config 结果。 */
  configResult: v.object({
    ok: v.boolean(),
    enabled: v.boolean(),
    revision: v.number(),
    writable: v.boolean(),
    value: v.object({}),
    user: v.json(true),
  }),
  /** router/save 请求。 */
  saveRequest: v.object({
    ops: v.array(v.object({
      op: v.string(),
      path: v.array(v.string()),
      value: v.json(true),
    })),
    expectedRevision: v.number(true),
  }),
  /** router/save 结果。 */
  saveResult: v.object({
    ok: v.boolean(),
    revision: v.number(),
    user: v.json(true),
  }),
  /** 空请求对象。 */
  emptyRequest: v.object({}),
  /** {agentId} 请求对象。 */
  agentIdRequest: v.object({ agentId: v.string() }),
}
