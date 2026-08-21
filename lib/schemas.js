/**
 * dsh-agent-router 配置 schema 与 wire 校验器。
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
 *   `image`（OpenAI 兼容 Images API 图片生成）、
 *   `speech`（OpenAI 兼容 Audio Transcriptions 语音转写）、
 *   `cli`（无头 CLI 子代理：codex / claude / gemini 等外部 agent 工具，
 *   使用 CLI 自身登录态，任务经 stdin 注入、结果按 CLI 的 JSON 输出解析）。
 * @module dsh-agent-router/schemas
 */
import z from '@deepseek-ai/schemastery'

/** Settings namespace 名，与 settings.yaml 的 `router:` 分节对应。 */
export const ROUTER_NS = 'router'

/**
 * v3 模态能力矩阵（§4.3.2 M5 / N-5）枚举：模态取值（R-5 枚举化）。
 * capabilities 字段仍为自由字符串数组（未知值兼容放行，R-5 warning 语义；
 * translate/code/web 等自定义标签继续作为提示面存在）——本枚举只界定
 * 参与矩阵门控与方向语义的模态。
 */
export const MODALITY_VALUES = Object.freeze(['image', 'audio', 'video', 'text', 'file'])

/** 模态能力方向（§4.3.2）：consume = 接收该模态作为输入；produce = 产出该模态。 */
export const MODALITY_DIRECTIONS = Object.freeze(['consume', 'produce'])

/**
 * capabilities 枚举化归一（R-5）：把能力标签列表按枚举拆分——
 * `known` ⊆ MODALITY_VALUES（参与矩阵方向语义），`unknown` 为其余自由标签
 * （兼容放行，不参与门控；仍显示在提示段与目录的能力标签中）。
 */
export function normalizeCapabilities(capabilities) {
  const list = Array.isArray(capabilities) ? capabilities.filter((item) => typeof item === 'string') : []
  const known = []
  const unknown = []
  for (const item of list) {
    if (MODALITY_VALUES.includes(item)) known.push(item)
    else unknown.push(item)
  }
  return { known, unknown }
}

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
  /** 插件独立管理的 OAuth 账号 id；非空时覆盖 provider/model 生效。 */
  account: z.string().default(''),
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
  /** cli 类型的无头 CLI 命令（如 codex / claude / gemini，经系统 shell 解析）。 */
  command: z.string().default(''),
  /** cli 类型的附加参数（空格分隔，可带引号；空 = 该 CLI 的安全默认参数）。 */
  args: z.string().default(''),
  /** cli 类型的执行超时毫秒；0 = 默认 15 分钟。 */
  timeoutMs: z.natural().default(0),
  /** cli 类型的同 agent 并发上限（1-4）。 */
  maxConcurrent: z.natural().min(1).max(4).default(1),
  /** cli 类型的登录命令参数（如 login / auth login）；空 = 该 CLI 的预设默认。 */
  loginArgs: z.string().default(''),
  /** cli 类型的登录状态命令参数（如 login status / auth status）；空 = 该 CLI 的预设默认。 */
  statusArgs: z.string().default(''),
  /** cli 类型的模型列表命令参数（如 --list-models）；空 = 该 CLI 的预设默认（无列表命令时回退常见模型）。 */
  modelsArgs: z.string().default(''),
  /** cli 类型引用的 CLI 子代理条目 id（多模态账号区的「子代理」区维护）；
   *  空 = 旧形态：使用本 agent 内嵌的 command/args 字段。 */
  cliAgent: z.string().default(''),
})

/**
 * CLI 子代理条目（多模态账号区的「子代理」区维护）：codex / claude / gemini
 * 等无头 CLI 工具作为一个可管理的"账号"——配置命令与参数、登录状态、
 * 模型列表与用量统计；专业 agent 经 `cliAgent` 字段引用它作为执行路径。
 */
export const cliAgentSchema = z.object({
  /** 展示名称。 */
  name: z.string().default(''),
  /** 是否启用。 */
  enabled: z.boolean().default(true),
  /** 无头 CLI 命令（如 codex / claude / gemini，或任意可执行路径）。 */
  command: z.string().default(''),
  /** 附加参数（空格分隔，可带引号；空 = 该 CLI 的安全默认参数）。 */
  args: z.string().default(''),
  /** 执行超时毫秒；0 = 默认 15 分钟。 */
  timeoutMs: z.natural().default(0),
  /** 并发上限（1-4）。 */
  maxConcurrent: z.natural().min(1).max(4).default(1),
  /** 登录命令参数；空 = 该 CLI 的预设默认。 */
  loginArgs: z.string().default(''),
  /** 登录状态命令参数；空 = 该 CLI 的预设默认。 */
  statusArgs: z.string().default(''),
  /** 模型列表命令参数；空 = 该 CLI 的预设默认（无列表命令时回退常见模型）。 */
  modelsArgs: z.string().default(''),
})

/**
 * OAuth 预设类型枚举（v0.3.0 C-1 / §3.2 E2-a / ADR-005）：供消费点校验与
 * UI 预设列表使用；扩展新预设（如未来 C-2 anthropic）只需在此追加（P5 泛化）。
 * `preset` 字段本身为自由字符串（未知值兼容放行、消费点校验——与
 * protocol/type/strategy 先例一致），本枚举只界定官方支持的预设。
 */
export const OAUTH_PRESET_VALUES = Object.freeze(['chatgpt-codex'])

/**
 * 插件独立管理的 OAuth 账号（官方 OAuth 登录流）。
 *
 * 与 API Key 账号（写入 llm-pi-ai、进入共享模型列表）不同：OAuth 账号
 * 只存在于 `router.oauthAccounts`，凭据经 credentials seam（tokenRef）
 * 保存，调用由本插件直连端点完成——绝不注册 llm 路由，因此不会出现
 * 在「设置 → 模型」与任何共享模型列表中，模型列表由插件单独维护。
 *
 * 登录方式：
 * - OAuth2 授权码 + PKCE：浏览器生成 PKCE 并打开官方 authorize URL，
 *   宿主经 tokenUrl 完成 code → access_token 交换并存入 tokenRef；
 * - 粘贴 access token（通用，适配任何接受 Bearer 的端点/网关）。
 */
export const oauthAccountSchema = z.object({
  /** 展示名称。 */
  name: z.string().default(''),
  /** 是否启用。 */
  enabled: z.boolean().default(true),
  /** 直连协议：openai-completions / anthropic / gemini。 */
  protocol: z.string().default('openai-completions'),
  /** 端点（如 https://generativelanguage.googleapis.com/v1beta）。 */
  baseURL: z.string().default(''),
  /** 凭据引用（access token），经 credentials seam 解析。 */
  tokenRef: z.string().default(''),
  /** OAuth2 客户端 id（授权码流；用户自有应用）。 */
  clientId: z.string().default(''),
  /** OAuth2 客户端密钥（redact，只写；可留空用于 PKCE 公共客户端）。 */
  clientSecret: z.string().role('secret').default(''),
  /** 使用内置公开 OAuth Client（零配置一键授权；回调走 127.0.0.1:8085）。 */
  publicClient: z.boolean().default(false),
  /** 预设类型（'chatgpt-codex' = ChatGPT 订阅 OAuth，取值见 OAUTH_PRESET_VALUES，
   *  选中即由后续步骤预填端点常量；空 = 通用账号）。未知值放行，消费点校验
   *  在后续步骤（与 protocol/type/strategy 先例一致）。 */
  preset: z.string().default(''),
  /** preset 账号的独立凭据文件路径；空 = 使用凭据模块默认路径
   *  （$DSH_HOME/dsh-agent-router/chatgpt-codex-auth.json，Step 2 实现）。 */
  credentialFile: z.string().default(''),
  /** 官方授权端点。 */
  authUrl: z.string().default(''),
  /** 官方 token 端点。 */
  tokenUrl: z.string().default(''),
  /** OAuth scope。 */
  scope: z.string().default(''),
  /** 插件单独维护的模型列表（发现或手工添加）。 */
  models: z.array(z.string()).default([]),
})

/**
 * 账号池（扩展功能）：把多个 OAuth 账号（oauthAccounts 的 id）组成一个池，
 * agent 的 `account` 字段可指向池（`pool:<id>`），调用时按策略
 * 自动选择账号并在失败时切换下一个健康账号。
 */
export const accountPoolSchema = z.object({
  /** 展示名称。 */
  name: z.string().default(''),
  /** 是否启用。 */
  enabled: z.boolean().default(true),
  /**
   * 选号策略：
   * - `healthy`：失败最少、最近未失败的账号优先（默认）；
   * - `usage-lowest`：累计调用次数最少的账号优先（opencodex 风格）；
   * - `round-robin`：按序轮换。
   */
  strategy: z.string().default('healthy'),
  /** 池内账号 id 列表（引用 oauthAccounts）。 */
  accounts: z.array(z.string()).default([]),
})

/** `router` namespace 的完整 schema。 */
export const routerSchema = z.object({
  /** 总开关：关闭后 route_agent 报错、提示段清空、统计暂停。 */
  enabled: z.boolean().default(true),
  /** ChatGPT 订阅 OAuth 实验通路总开关（合规 kill-switch 第③层，§3.6）：
   *  false = preset 入口隐藏 + 调用时明确报"实验通路已关闭"（报错逻辑在后续步骤）。 */
  oauthExperimental: z.boolean().default(false),
  /** 以 id 为键的自定义 agent 字典。 */
  agents: z.dict(agentSchema).default({}),
  /** 以 id 为键的 OAuth 账号字典（插件独立管理）。 */
  oauthAccounts: z.dict(oauthAccountSchema).default({}),
  /** 以 id 为键的账号池字典（插件独立管理，扩展功能）。 */
  pools: z.dict(accountPoolSchema).default({}),
  /** 以 id 为键的 CLI 子代理条目字典（多模态账号区的「子代理」区维护）。 */
  cliAgents: z.dict(cliAgentSchema).default({}),
})

// ── wire codec（typert strict）─────────────────────────────────────────────

/** 递归形状检查：check(spec, value, path)。未知字段透传。 */
function check(spec, value, path) {
  if (value === undefined || value === null) {
    if (spec.optional === true) return value
    throw new Error(`dsh-agent-router wire: ${path} is required`)
  }
  switch (spec.kind) {
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`dsh-agent-router wire: ${path} must be an object`)
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
      if (!Array.isArray(value)) throw new Error(`dsh-agent-router wire: ${path} must be an array`)
      if (spec.items) {
        for (let index = 0; index < value.length; index++) {
          const next = check(spec.items, value[index], `${path}[${index}]`)
          if (next !== undefined) value[index] = next
        }
      }
      return value
    }
    case 'string':
      if (typeof value !== 'string') throw new Error(`dsh-agent-router wire: ${path} must be a string`)
      return value
    case 'boolean':
      if (typeof value !== 'boolean') throw new Error(`dsh-agent-router wire: ${path} must be a boolean`)
      return value
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`dsh-agent-router wire: ${path} must be a finite number`)
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
      account: v.string(),
      cliAgent: v.string(true),
      effectiveProvider: v.string(),
      effectiveModel: v.string(),
      source: v.string(),
      error: v.string(true),
      /** v3 Step 7（§4.3.2 ModalityCapability）：模态能力（方向语义 wire 面）。 */
      modalities: v.object({
        consume: v.array(v.string()),
        produce: v.array(v.string()),
      }, true),
    })),
    oauthAccounts: v.array(v.object({
      id: v.string(),
      name: v.string(),
      enabled: v.boolean(),
      protocol: v.string(),
      baseURL: v.string(),
      tokenRef: v.string(),
      clientId: v.string(),
      authUrl: v.string(),
      tokenUrl: v.string(),
      scope: v.string(),
      models: v.array(v.string()),
      publicClient: v.boolean(true),
    })),
    pools: v.array(v.object({
      id: v.string(),
      name: v.string(),
      enabled: v.boolean(),
      strategy: v.string(),
      accounts: v.array(v.string()),
      accountHealth: v.array(v.object({
        accountId: v.string(),
        calls: v.number(),
        errors: v.number(),
        lastAt: v.number(true),
      })),
    }), true),
    /** CLI 子代理条目（多模态账号区的「子代理」区）。 */
    cliAgents: v.array(v.object({
      id: v.string(),
      name: v.string(),
      enabled: v.boolean(),
      command: v.string(),
      args: v.string(),
      timeoutMs: v.number(),
      maxConcurrent: v.number(),
    }), true),
  }),
  /** router/oauthBegin 请求（一键授权：宿主生成 PKCE+state 并返回授权 URL）。 */
  oauthBeginRequest: v.object({
    accountId: v.string(),
    redirectUri: v.string(),
  }),
  /** router/oauthBegin 结果。 */
  oauthBeginResult: v.object({
    ok: v.boolean(),
    message: v.string(),
    authUrl: v.string(true),
    state: v.string(true),
  }),
  /** router/oauthTokenExchange 请求（手动模式用 accountId/codeVerifier/redirectUri；一键模式用 state）。 */
  oauthTokenExchangeRequest: v.object({
    code: v.string(),
    state: v.string(true),
    accountId: v.string(true),
    codeVerifier: v.string(true),
    redirectUri: v.string(true),
  }),
  /** router/oauthTokenExchange 结果。 */
  oauthTokenExchangeResult: v.object({
    ok: v.boolean(),
    message: v.string(),
    expiresIn: v.number(true),
  }),
  /** router/oauthDiscover 请求。 */
  oauthDiscoverRequest: v.object({ accountId: v.string() }),
  /** router/oauthDiscover 结果。 */
  oauthDiscoverResult: v.object({
    ok: v.boolean(),
    message: v.string(),
    models: v.array(v.string()),
  }),
  /** router/cliStatus 结果（cli 类型登录状态探测）。 */
  cliStatusResult: v.object({
    ok: v.boolean(),
    message: v.string(),
    loggedIn: v.boolean(true),
  }),
  /** router/cliLogin 结果（cli 类型交互式登录：宿主弹出终端窗口）。 */
  cliLoginResult: v.object({
    ok: v.boolean(),
    message: v.string(),
  }),
  /** router/cliModels 结果（cli 类型模型列表：CLI 命令或常见模型回退）。 */
  cliModelsResult: v.object({
    ok: v.boolean(),
    message: v.string(),
    models: v.array(v.string()),
    source: v.string(true),
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
  /** router/imageData 请求：附件完整引用（attachmentId 内容寻址，readImage 校验元数据）。 */
  imageDataRequest: v.object({
    ref: v.object({
      attachmentId: v.string(),
      mediaType: v.string(),
      bytes: v.number(),
      width: v.number(),
      height: v.number(),
      name: v.string(true),
    }),
  }),
  /** router/imageData 结果：校验后的图片字节（base64）与元数据。 */
  imageDataResult: v.object({
    ok: v.boolean(),
    message: v.string(),
    code: v.string(true),
    mediaType: v.string(true),
    data: v.string(true),
    width: v.number(true),
    height: v.number(true),
    name: v.string(true),
  }),
  /** router/uploadFile 请求：客户端音频/视频/文档字节（浏览器无法直写文件系统，经 F11 按钮落盘）。 */
  uploadFileRequest: v.object({
    name: v.string(),
    mediaType: v.string(),
    dataBase64: v.string(),
  }),
  /** router/uploadFile 结果：落盘路径与内容寻址附件 id（宿主校验：魔数/大小 ≤25MB/写盘/M2 注册）。 */
  uploadFileResult: v.object({
    ok: v.boolean(),
    path: v.string(true),
    attachmentId: v.string(true),
    name: v.string(true),
    message: v.string(true),
    code: v.string(true),
  }),
  /** router/readWorkspaceFile 请求：L3「打开文件」预览（audio/video 播放器、doc 下载）。 */
  readWorkspaceFileRequest: v.object({
    path: v.string(),
  }),
  /** router/readWorkspaceFile 结果：文件字节（base64）与元数据（宿主校验：工作区边界/≤25MB）。 */
  readWorkspaceFileResult: v.object({
    ok: v.boolean(),
    dataBase64: v.string(true),
    mediaType: v.string(true),
    name: v.string(true),
    message: v.string(true),
    code: v.string(true),
  }),
}
