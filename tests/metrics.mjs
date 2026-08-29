// dsh-agent-router MIG-001 Step 10 观测脚本（N-9 成功标准观测）：
// D-1 五指标观测点落地（DEC-012 定稿，docs/architecture-v3.md §11）。
//
// 运行：node tests/metrics.mjs → exit 0 + 结构化报告（五指标逐一）。
//
// 设计契约（与执行包 MIG-001 假设记录一致）：
// - 可完全自动化（现有测试基建重演，不重复造轮子——复用 lib 既有导出）：
//   ① 恒主模型（agent/request 未注册 → config 原样返回；twin resolveModel 镜像
//      模型身份不替换）、④ 编址往返（M2 三向映射 + 错误码 0 静默）
// - 可构造性自动化（机制面，用 mock 会话样本推演）：
//   ② 改写分支（route_agent 视觉调用 messages 含 image 块）、⑤ 跨轮指代机制面
//      （imageMemory 记忆段注入 + attachmentIds 解析可达）
// - 需真实使用样本（不可单机自动化——输出 not-measurable + 测量方法）：
//   ② 端到端图片到达真实视觉模型、③ 触发率（V-DSH-5 关联）、⑤ 成功率
//
// 观测判别性：自动化部分在指标被破坏时必失败（如整轮路由复活 → agent/request
// 注册 → config 被替换 → ① 观测失败；M2 三向映射破坏 → ④ 往返不一致）。
//
// 范围守卫：本脚本纯观测，不修改 lib/（零埋点——全部观测点均可用既有导出
// 重演）；不修改任何既有行为。
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime, BlockAssembler } from '@deepseek-ai/dsh-llm'
import { createUserMessage, createAssistantMessage } from '@deepseek-ai/dsh-llm/message'
import { RouterService } from '../lib/service.js'
import { AttachmentRegistry, isAttachmentId, contentHashId, ATTACHMENT_ERROR_CODES } from '../lib/attachments.js'
import { rememberImage, recallImage, clearImageMemory } from '../lib/memory.js'
import { CHATGPT_PRESET } from '../lib/oauth-credentials.js'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ── 观测结果收集 ──────────────────────────────────────────────────────────────
const results = []
function record(metric) {
  results.push(metric)
  const value = metric.status === 'pass'
    ? `PASS ${metric.value !== undefined ? metric.value : ''}`.trim()
    : `not-measurable（${metric.methodName || '需真实样本'}）`
  console.log(`[${metric.id}] ${metric.name} → ${value}`)
  for (const line of metric.detail || []) console.log(`      ${line}`)
  if (metric.evidence && metric.evidence.length > 0) {
    console.log(`      证据: ${metric.evidence.join('；')}`)
  }
  // 真实样本部分：输出测量方法（验收标准：不可测指标须给出数据来源与采集步骤）。
  for (const field of ['e2e', 'usage', 'success']) {
    const part = metric[field]
    if (part && part.status === 'not-measurable') {
      console.log(`      真实样本测量方法（${part.methodName}）:`)
      console.log(`        ${String(part.method ?? '').replace(/\n/g, '\n        ')}`)
    }
  }
}

// ── 观测 ①：D-1-1 恒主模型（可完全自动化）────────────────────────────────────
// 定义（DEC-012/§11 D-1-1）：带图轮主会话 request/context 恒为主模型（100%，
// 0% 出现专业 agent 的 provider/model）。整轮路由移除后插件不注册 agent/request
// ——瀑布返回默认 config 即为正确行为（smoke.mjs:1162-1177 既有断言面，
// 本观测轻量重演 + 判别性扩展）。
async function observeMainModelConstancy() {
  const toolModule = await import('../lib/tool.js')
  const detail = []
  const checks = []
  let registered = null
  let sections = []
  const visionState = { enabled: true, agents: [['vision', {}]] }
  const fakeRouter = {
    isEnabled: () => visionState.enabled,
    promptText: () => 'ROUTER-PROMPT',
    listImageVisionAgents: () => visionState.agents,
    resolveAgent: async (id) => (id === 'vision' ? { provider: 'openai', model: 'gpt-4o' } : { error: 'stub' }),
    record: () => {},
  }
  const root = new Context()
  await root.plugin({ name: 'metrics-stub-router', apply: (ctx) => ctx.provide('router', fakeRouter) })
  await root.plugin({ name: 'metrics-stub-tools', apply: (ctx) => ctx.provide('tools', { register: (definition) => { registered = definition; return () => {} } }) })
  await root.plugin({ name: 'metrics-stub-prompt', apply: (ctx) => ctx.provide('systemPrompt', { section: (section) => { sections.push(section); return () => {} } }) })
  const app = root.plugin({ name: 'metrics-tool', inject: toolModule.inject, apply: toolModule.apply })
  await app

  const MAIN_PROVIDER = 'text-provider'
  const MAIN_MODEL = 'brain-1'
  const imageBlock = { type: 'image', attachment: { attachmentId: `sha256:${'a'.repeat(64)}`, mediaType: 'image/png', bytes: 4, width: 2, height: 2 } }
  const agentOf = (messages) => ({ session: { deriveMessages: () => messages } })
  const defaultConfig = async () => ({ provider: MAIN_PROVIDER, model: MAIN_MODEL })
  const runRequest = (messages) => root.events.waterfall('agent/request', { agent: agentOf(messages), turn: 1, step: 1, signal: undefined }, defaultConfig)

  // 场景 1：带图轮（当前轮图片）——config 原样返回。
  const imageTurn = await runRequest([{ role: 'user', content: [{ type: 'text', text: '看图' }, imageBlock] }])
  checks.push(['带图轮 config 原样返回（provider/model 恒主模型）', imageTurn.provider === MAIN_PROVIDER && imageTurn.model === MAIN_MODEL])
  // 场景 2：文本轮——config 原样返回。
  const textTurn = await runRequest([{ role: 'user', content: [{ type: 'text', text: '纯文本' }] }])
  checks.push(['文本轮 config 原样返回', textTurn.provider === MAIN_PROVIDER && textTurn.model === MAIN_MODEL])
  // 场景 3：已回答图片轮（历史图）——config 原样返回。
  const followupStep = await runRequest([{ role: 'user', content: [{ type: 'text', text: '看图' }, imageBlock] }, { role: 'assistant', content: [{ type: 'text', text: '已回答' }] }])
  checks.push(['已回答图片轮 config 原样返回', followupStep.provider === MAIN_PROVIDER && followupStep.model === MAIN_MODEL])
  // 场景 4（判别性）：插件不得注册 agent/request 钩子——整轮路由移除。
  // cordis events 无 listenerCount；dispatch 返回匹配监听器数组（空 = 未注册）。
  const hookListeners = root.events.dispatch('waterfall', ['agent/request'])
  checks.push(['agent/request 钩子未注册（整轮路由已移除）', Array.isArray(hookListeners) && hookListeners.length === 0])

  // 场景 5（twin 模型身份）：wrapper resolveModel 镜像原模型（不替换模型身份——
  // D-1-1 的另一半：即便经包装路由，model 仍为主模型原值，仅 provider 加后缀）。
  const { createWrapAdapter, WRAP_SUFFIX } = await import('../lib/wrapper.js')
  const twinLlm = new LlmRuntime(new Context())
  const twinAdapter = {
    providerInfo() { return { id: 'text-provider', name: 'TextBrain' } },
    providerRetryPolicy() { return undefined },
    async listModels() { return [{ provider: 'text-provider', id: MAIN_MODEL, name: 'Brain-1', inputModalities: ['text'] }] },
    async resolveModel(provider, model) {
      return { provider, id: model, name: model, inputModalities: ['text'], context: { contextWindow: 100_000 }, defaultMaxTokens: 4096 }
    },
    async *stream() { yield { type: 'finish', reason: { kind: 'stop' } } },
  }
  twinLlm.registerAdapter(['text-provider'], twinAdapter)
  const wrap = createWrapAdapter(twinLlm, 'text-provider', [{ modality: 'image', state: { vision: ['vision'], generation: [] }, marker: () => 'm', rewrite: () => null }])
  const twinResolved = await wrap.resolveModel(`text-provider${WRAP_SUFFIX}`, MAIN_MODEL)
  // 宿主 resolveModel 返回模型身份字段为 id（dsh-llm 契约，见 smoke.mjs:1266）；
  // twin 镜像 = 原模型 id 不变，仅 provider 加包装后缀。
  checks.push(['twin resolveModel 镜像模型身份（模型 id 不变）', twinResolved.id === MAIN_MODEL && twinResolved.provider === `text-provider${WRAP_SUFFIX}`])
  await app.dispose()
  const failed = checks.filter(([, ok]) => !ok)
  for (const [label, ok] of checks) detail.push(`${ok ? 'ok ' : 'FAIL'} ${label}`)
  record({
    id: 'D-1-1',
    name: '恒主模型（带图轮 request/context 恒为主模型）',
    definition: 'DEC-012 / §11 D-1-1：100%（0% 出现专业 agent 的 provider/model）',
    status: failed.length === 0 ? 'pass' : 'fail',
    value: `100%（${checks.length}/${checks.length} 场景）`,
    detail,
    evidence: [
      'smoke.mjs:1162-1177（image turn config passes through unchanged）',
      'smoke.mjs:1316-1326（twin 目录镜像 model 身份）',
      'docs/architecture-v3.md §11 D-1-1 / DEC-012',
    ],
  })
}

// ── 观测 ②：D-1-2 图片到达视觉输入（机制面可自动化；端到端 not-measurable）──
// 定义（§11 D-1-2）：改写分支——route_agent 视觉调用请求 messages 含 image 块
// 或可解析附件 id/路径（100%）；直传分支——图片块原样到达原生多模态主模型
// （keepOriginalImages 短路零改写）。端到端（真实视觉模型账号收图）需真实样本。
async function observeImageArrival() {
  const detail = []
  const checks = []
  // ── 改写分支机制面：RouterService 带图 run → 视觉调用 messages 含 image 块 ──
  const root = new Context()
  let lastChatRequest = null
  root.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-pro' }) })
  root.provide('settings', {
    writable: true,
    describe: () => [{ ns: 'router', revision: 1, value: { enabled: true, agents: {} }, user: { enabled: true } }],
    mutate: async () => undefined,
  })
  root.provide('llm', {
    listModels: async (provider) => (provider === 'openai' ? [{ id: 'gpt-4o', name: 'GPT-4o' }] : []),
    resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }),
    listProviders: async () => [],
    stream: async function* (request) {
      lastChatRequest = request
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '识别完成' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '识别完成' } }
      yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 1 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  })
  root.provide('attachments', {
    imageLimits: { maxImageBytes: 20 * 1024 * 1024, maxImagesPerMessage: 8, maxMessageImageBytes: 40 * 1024 * 1024, maxImagePixels: 100_000_000, mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
    saveImage: async (input) => ({ attachmentId: contentHashId(input.data), mediaType: input.mediaType, bytes: input.data.length, width: 2, height: 2, name: input.name }),
    readImage: async (ref) => ({ ref, data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }),
  })
  root.provide('fs', {
    resolve: async (path) => ({ displayPath: path, targetKey: path }),
    stat: async () => ({ type: 'file', version: 1, size: 10 }),
    readBytes: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]),
  })
  const service = new RouterService(root)
  service.attach({ get: () => ({
    enabled: true,
    agents: {
      vision: { name: '视觉', type: 'chat', enabled: true, description: '看图', capabilities: ['image'], provider: 'openai', model: 'gpt-4o', maxRounds: 1 },
    },
  }) })

  const contentId = `sha256:${'b'.repeat(64)}`
  const visionAgent = { session: { header: { cwd: 'D:/work/example', delegationDepth: 0 }, deriveMessages: () => [] } }
  const run = await service.run({
    agentId: 'vision',
    task: '识别这张图',
    images: [{ attachmentId: contentId, mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'v.png' }],
    exec: { agent: visionAgent },
  })
  const request = lastChatRequest
  checks.push(['视觉调用完成', run.kind === 'chat'])
  checks.push(['视觉调用 messages 含 image 块', !!request && Array.isArray(request.messages) && request.messages[0].content.some((block) => block.type === 'image')])
  checks.push(['image 块携带可解析附件 id（M2 格式）', !!request && request.messages[0].content.some((block) => block.type === 'image' && isAttachmentId(String(block.attachment?.attachmentId ?? '')) && block.attachment.attachmentId === contentId)])
  detail.push('改写分支（route_agent 视觉调用）：上传图 → 断言视觉调用输入 messages 含 image 块 + 附件 id 可解析')

  // ── 直传分支机制面：原生多模态主模型 → 原图块保真到达（零改写零标记）──
  const { createWrapAdapter, WRAP_SUFFIX } = await import('../lib/wrapper.js')
  const mmCalls = []
  const mmRoot = new Context()
  const mmLlm = new LlmRuntime(mmRoot)
  const mmAdapter = {
    providerInfo() { return { id: 'mm-provider', name: 'NativeBrain' } },
    providerRetryPolicy() { return undefined },
    async listModels() { return [{ provider: 'mm-provider', id: 'mm-1', name: 'MM-1', inputModalities: ['text', 'image'] }] },
    async resolveModel(provider, model) {
      return { provider, id: model, name: model, inputModalities: ['text', 'image'], context: { contextWindow: 100_000 }, defaultMaxTokens: 4096 }
    },
    // FIX-001（metrics 侧补齐）：宿主 0.1.1-rc.2 prepared-dispatch 契约——
    // 对象字面量夹具必须显式实现（smoke 夹具已修，此处同类）。
    async prepareCall(provider, model, signal) {
      return { model: await mmAdapter.resolveModel(provider, model, signal), stream: (options) => mmAdapter.stream(options) }
    },
    async *stream(options) {
      mmCalls.push(options)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'mm-ok' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'mm-ok' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
  mmLlm.registerAdapter(['mm-provider'], mmAdapter)
  const mmWrap = createWrapAdapter(mmLlm, 'mm-provider', [{ modality: 'image', state: { vision: ['vision'], generation: [] }, marker: () => 'm', rewrite: () => null }])
  const mmImage = createUserMessage({ content: [{ type: 'text', text: '直接看图' }, { type: 'image', attachment: { attachmentId: `sha256:${'c'.repeat(64)}`, mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'mm.png' } }], source: { kind: 'user' } })
  const mmAssembler = new BlockAssembler()
  // 直接调用包装适配器 stream（直传分支内部以原 provider 委托 llm.stream）。
  for await (const chunk of mmWrap.stream({ provider: `mm-provider${WRAP_SUFFIX}`, model: 'mm-1', system: undefined, messages: [mmImage] })) mmAssembler.push(chunk)
  const mmCall = mmCalls[mmCalls.length - 1]
  checks.push(['直传分支：原生多模态委托见原图块（keepOriginalImages 短路零改写）', mmAssembler.finish.kind === 'stop' && !!mmCall && mmCall.messages[0].content.some((block) => block.type === 'image') && (mmCall.system === undefined || mmCall.system === '' || mmCall.system === null)])
  detail.push('直传分支（keepOriginalImages 短路，§11 D-1-2 绑定 RES-002 S-3）：原生多模态主模型经包装路由 → 委托方收到原图块、无 system 标记')

  const failed = checks.filter(([, ok]) => !ok)
  for (const [label, ok] of checks) detail.push(`${ok ? 'ok ' : 'FAIL'} ${label}`)
  record({
    id: 'D-1-2',
    name: '图片到达视觉输入',
    definition: 'DEC-012 / §11 D-1-2：100%（直传分支图片块原样到达；改写分支附件 ref/路径到达视觉输入）',
    status: failed.length === 0 ? 'pass' : 'fail',
    value: failed.length === 0 ? '机制面 100%（直传+改写两分支）' : '机制面 FAIL',
    detail,
    evidence: [
      'smoke.mjs:816-820（vision call returns injected images）',
      'smoke.mjs:1473-1480（native multimodal delegate sees raw image）',
      'docs/architecture-v3.md §11 D-1-2 / §5.2.3 失败语义',
    ],
    // 端到端：真实视觉模型账号收图 —— 本环境无真实多模态账号，不可单机自动化。
    e2e: {
      status: 'not-measurable',
      method: '测量方法：① 配置真实视觉 agent（如 openai/gpt-4o + capabilities 含 image）；② 上传图 → 主模型调 route_agent(includeImages) → 视觉调用请求 messages 断言含 image 块且 attachment.id 可经 M2 解析（改写分支）；③ 原生多模态主模型直传场景断言原图块到达（直传分支）。数据来源：真实会话中 route_agent 视觉调用的 llm.stream 请求（可经 record() 统计面 + 会话日志核对）；采集步骤：真实账号端到端跑 N 个带图轮，逐一断言视觉输入含图。当前状态：not-measurable（无真实视觉模型账号）。',
      methodName: '端到端需真实视觉模型账号',
    },
  })
}

// ── 观测 ③：D-1-3 route_agent 触发率（机制面可观测；比率需真实使用统计）──
// 定义（§11 D-1-3）：带图轮主模型调用 route_agent 比率 ≥90%（区分两情况：
// 纯文本主模型主动调 route_agent；多模态主模型直答或调工具均算有效响应）。
// V-DSH-5 关联（主模型对三通道实际响应率 ≥90%）。机制面 = 三通道就位
// （① pre-step reminder ② system marker/记忆段 ③ 工具描述）——可构造性断言；
// 真实比率需真实会话统计（U-3 实测，RES-001 §4.3）。
async function observeTriggerRate() {
  const detail = []
  const checks = []
  // ── 三通道①：pre-step reminder 注入（带 id + route_agent 指令）──
  const { installPreStep, collectReminder } = await import('../lib/prestep.js')
  const preRoot = new Context()
  const service = {
    isEnabled: () => true,
    listImageVisionAgents: () => [['vision', { name: '视觉', type: 'chat', enabled: true, capabilities: ['image'] }]],
    listImageGenerationAgents: () => [['draw', { name: '画图', type: 'image', enabled: true }]],
  }
  const dispose = installPreStep(preRoot, service)
  const contentId = `sha256:${'d'.repeat(64)}`
  const imageMessage = createUserMessage({ content: [{ type: 'text', text: '看图' }, { type: 'image', attachment: { attachmentId: contentId, mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'shot.png' } }], source: { kind: 'user' } })
  const escapeAgent = { options: { provider: 'escape-provider', model: 'brain-1' } }
  const dispatch = (agent, messages) =>
    preRoot.events.waterfall('agent/pre-step', { agent, messages, turn: 1, step: 1, signal: undefined },
      () => Promise.resolve({ kind: 'enter', messages: [...messages] }))
  const decision = await dispatch(escapeAgent, [imageMessage])
  checks.push(['三通道①：图片轮注入 reminder（带 id + route_agent 行为指令）', decision.kind === 'enter' && decision.messages.length === 2 && decision.messages[1].role === 'user' && decision.messages[1].source.kind === 'plugin' && decision.messages[1].content.some((b) => b.type === 'text' && b.text.includes('route_agent') && b.text.includes('includeImages') && b.text.includes(contentId))])
  const reminderText = collectReminder([contentId], ['vision'])
  checks.push(['三通道①：collectReminder 含附件 id + 视觉 agent 指引', reminderText.includes(contentId) && reminderText.includes('"vision"') && reminderText.includes('route_agent') && reminderText.includes('attachmentIds')])
  dispose()

  // ── 三通道②：wrapper system marker（当前轮标记 + 历史记忆段）──
  const { minimalImageRewrite, collectMarkers, collectMemorySegments } = await import('../lib/wrapper.js')
  const marker = minimalImageRewrite({ attachment: { attachmentId: contentId, mediaType: 'image/png', bytes: 1, width: 1, height: 1, name: 'shot.png' } }, { vision: ['vision'], generation: [] })
  checks.push(['三通道②：system marker 含 route_agent/includeImages/视觉 agent 分流', typeof marker === 'string' && marker.includes('route_agent') && marker.includes('includeImages') && marker.includes('"vision"') && marker.includes(contentId)])
  const imageEntry = { modality: 'image', state: { vision: ['vision'], generation: [] }, marker: minimalImageRewrite, rewrite: () => null }
  const markerList = collectMarkers([imageMessage], [imageEntry])
  checks.push(['三通道②：collectMarkers 按附件去重产出标记', markerList.length === 1 && markerList[0].includes(contentId)])
  clearImageMemory()
  rememberImage(contentId, '一张架构图：五层结构')
  const historyImage = createUserMessage({ content: [{ type: 'image', attachment: { attachmentId: contentId, mediaType: 'image/png', bytes: 1, width: 1, height: 1, name: 'arch.png' } }], source: { kind: 'user' } })
  const followUp = createUserMessage({ content: [{ type: 'text', text: '刚才图里最上层是什么' }], source: { kind: 'user' } })
  const segments = collectMemorySegments([historyImage, followUp], [imageEntry])
  checks.push(['三通道②：历史图记忆段注入（跨轮指代机制面）', segments.length === 1 && segments[0].includes('此前识别') && segments[0].includes(contentId)])
  clearImageMemory()

  // ── 三通道③：route_agent 工具描述（主模型感知触发指令）──
  const toolModule = await import('../lib/tool.js')
  let registered = null
  const root = new Context()
  await root.plugin({ name: 'metrics-stub-router3', apply: (ctx) => ctx.provide('router', { isEnabled: () => true, promptText: () => '', selectAttachments: () => [], resolveAttachmentIds: async () => [], resolveAgent: async () => ({ provider: 'openai', model: 'gpt-4o' }), run: async () => ({ text: 'ok' }), record: () => {}, imageMarkerOf: (ref) => `[router:image:${JSON.stringify(ref)}]` }) })
  await root.plugin({ name: 'metrics-stub-tools3', apply: (ctx) => ctx.provide('tools', { register: (definition) => { registered = definition; return () => {} } }) })
  await root.plugin({ name: 'metrics-stub-prompt3', apply: (ctx) => ctx.provide('systemPrompt', { section: () => () => {} }) })
  const app = root.plugin({ name: 'metrics-tool3', inject: toolModule.inject, apply: toolModule.apply })
  await app
  checks.push(['三通道③：route_agent 工具参数含 includeImages/attachmentIds/files（主模型可触发）', !!registered && registered.name === 'route_agent' && !!registered.parameters && !!registered.parameters.properties && !!registered.parameters.properties.includeImages && !!registered.parameters.properties.attachmentIds && !!registered.parameters.properties.files && !!registered.parameters.properties.attachments])
  const descriptionText = registered ? String(registered.description) : ''
  checks.push(['三通道③：工具描述含带图触发指令（includeImages 传 true）', descriptionText.includes('includeImages') && descriptionText.includes('attachmentIds') && descriptionText.includes('files')])
  await app.dispose()

  const failed = checks.filter(([, ok]) => !ok)
  for (const [label, ok] of checks) detail.push(`${ok ? 'ok ' : 'FAIL'} ${label}`)
  record({
    id: 'D-1-3',
    name: 'route_agent 带图触发率',
    definition: 'DEC-012 / §11 D-1-3：≥90%（纯文本主模型主动调 route_agent 比例；多模态主模型直答或调工具均算有效响应）；V-DSH-5 关联',
    status: failed.length === 0 ? 'pass' : 'fail',
    value: failed.length === 0 ? '机制面 100%（三通道就位）' : '机制面 FAIL',
    detail,
    evidence: [
      'smoke.mjs:1669-1682（reminder 注入 + 逃生组改写）',
      'smoke.mjs:1500-1507（marker 分流 + 去重）',
      'smoke.mjs:1153-1157（route_agent 参数 schema）',
      'docs/architecture-v3.md §11 D-1-3 / §13 V-DSH-5 / RES-001 §4.3 U-3',
    ],
    usage: {
      status: 'not-measurable',
      method: '测量方法（U-3 实测，RES-001 §4.3）：① 关整轮路由后（Step 1 已移除）跑 N 个带图轮；② 统计带图轮中主模型主动调 route_agent 的比率（纯文本主模型）；多模态主模型直答或调工具均计为有效响应；③ 数据来源：真实会话日志（deriveMessages 含 image 块 = 带图轮；route_agent 工具调用 = service.record() 统计面已有记录）——采集带图轮总数与 route_agent 调用轮数，比率 = 调用轮数/带图轮总数（区分两种主模型口径分别统计）。当前状态：not-measurable（无真实使用样本）。',
      methodName: '需真实会话使用统计（U-3）',
    },
  })
}

// ── 观测 ④：D-1-4 附件统一编址往返一致（可完全自动化）──────────────────────
// 定义（§11 D-1-4）：id→path→id 与 path→id→path 往返一致（100%）；解析失败率
// 0 静默（错误码明确）。观测 = M2 三向映射重演（复用 tests/attachments.mjs
// 断言逻辑——轻量重演不重复造轮子，判别性：映射破坏则往返不一致）。
async function observeAddressingRoundTrip() {
  const detail = []
  const checks = []
  const root = new Context()
  const store = new Map()
  const attachments = {
    calls: { saveImage: 0, readImage: 0 },
    async saveImage(input) {
      this.calls.saveImage++
      const id = contentHashId(input.data)
      const ref = { attachmentId: id, mediaType: input.mediaType, bytes: input.data.length, width: 2, height: 2, name: input.name }
      store.set(id, { ref, data: input.data })
      return ref
    },
    async readImage(ref) {
      this.calls.readImage++
      const stored = store.get(String(ref?.attachmentId ?? ''))
      if (!stored) throw new Error('attachment not found')
      return { ref: stored.ref, data: stored.data }
    },
  }
  const WORKSPACE = 'D:/work/metrics'
  const fs = {
    resolve: async (path, options = {}) => {
      const raw = String(path)
      const target = raw.includes(':') ? raw : `${options.cwd ?? ''}/${raw}`
      return { displayPath: target }
    },
    stat: async (target) => {
      const raw = String(target?.displayPath ?? target ?? '')
      if (raw.includes('missing')) return undefined
      if (raw.endsWith('dir')) return { type: 'directory', version: 1 }
      return { type: 'file', version: 1, size: 10 }
    },
    readBytes: async (target) => {
      const raw = String(target?.displayPath ?? target ?? '')
      if (raw.endsWith('.png')) return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])
      return new TextEncoder().encode('hello 文本内容')
    },
  }
  root.provide('attachments', attachments)
  root.provide('fs', fs)
  const registry = new AttachmentRegistry(root)
  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])

  // path→id→path 往返：registerPath(路径) → id；byId(id) 取回条目。
  const shotPath = `${WORKSPACE}/shot.png`
  const imageEntry = await registry.registerPath(shotPath, { cwd: WORKSPACE })
  const byIdBack = await registry.byId(imageEntry.id)
  checks.push(['path→id→path：registerPath → byId 往返一致（id 与 mediaType/name 保留）', byIdBack?.id === imageEntry.id && byIdBack.mediaType === 'image/png' && byIdBack.name === 'shot.png'])
  // 非图片条目带 workspacePath（物理载体）→ byPath 反向索引可查（D-1-4
  // path→id 方向；图片条目无 workspacePath 字段——见 attachments.mjs 断言面）。
  const notesPath = `${WORKSPACE}/notes.txt`
  const fileEntry = await registry.registerPath(notesPath, { cwd: WORKSPACE })
  checks.push(['path→id：byPath(工作区路径) 命中注册条目（非图片物理载体）', registry.byPath(notesPath)?.id === fileEntry.id])

  // id→path→id 往返：materialize(id) → 物理路径 → byPath(路径) → id 一致。
  const mat = await registry.materialize(imageEntry.id, { cwd: WORKSPACE, sessionId: 'metrics-session' })
  const matPath = mat.path
  checks.push(['id→path：materialize(id) 产出可解析物理路径', typeof matPath === 'string' && matPath.length > 0 && matPath.includes('.router-files')])
  const matById = await registry.byId(imageEntry.id)
  checks.push(['id→path→id：物化后 byId 仍解析同一条目', matById?.id === imageEntry.id])

  // resolve 三向：resolve(id) → attachment 条目；resolve(path) → path。
  const resolvedId = await registry.resolve(imageEntry.id)
  const resolvedPath = await registry.resolve(shotPath, { cwd: WORKSPACE })
  checks.push(['resolve 三向：resolve(id) 返回 attachment 条目 + resolve(path) 返回 path', resolvedId.kind === 'attachment' && resolvedId.id === imageEntry.id && resolvedPath.kind === 'path' && resolvedPath.path === shotPath])

  // 解析失败率 0 静默：非法格式/未知 id/越界全部明确报错（错误码非静默）。
  // 注：resolve() 对非内容寻址字符串按"路径"解析（§4.3.1 统一入口语义），
  // 非法 id 报错面在 materialize（INVALID_ATTACHMENT_ID）与 byId 懒注册
  // （ATTACHMENT_UNKNOWN）——与 attachments.mjs 断言面同口径。
  let badId = false
  try { await registry.materialize('att-1', { cwd: WORKSPACE }) } catch (error) { badId = error.code === ATTACHMENT_ERROR_CODES.INVALID_ATTACHMENT_ID }
  checks.push(['解析失败 0 静默：非法 id 明确报错（INVALID_ATTACHMENT_ID）', badId])
  let unknown = false
  try { await registry.materialize(`sha256:${'f'.repeat(64)}`, { cwd: WORKSPACE }) } catch (error) { unknown = error.code === ATTACHMENT_ERROR_CODES.ATTACHMENT_UNKNOWN }
  checks.push(['解析失败 0 静默：未知 id 明确报错（ATTACHMENT_UNKNOWN）', unknown])
  let badFormat = false
  try { await registry.materialize('sha256:short', { cwd: WORKSPACE }) } catch (error) { badFormat = error.code === ATTACHMENT_ERROR_CODES.INVALID_ATTACHMENT_ID }
  checks.push(['解析失败 0 静默：格式非法明确报错（INVALID_ATTACHMENT_ID）', badFormat])

  registry.close()
  const failed = checks.filter(([, ok]) => !ok)
  for (const [label, ok] of checks) detail.push(`${ok ? 'ok ' : 'FAIL'} ${label}`)
  record({
    id: 'D-1-4',
    name: '附件统一编址往返一致',
    definition: 'DEC-012 / §11 D-1-4：100%（id→path→id 与 path→id→path 往返一致；解析失败率 0 静默）',
    status: failed.length === 0 ? 'pass' : 'fail',
    value: `100%（${checks.length}/${checks.length} 场景）`,
    detail,
    evidence: [
      'tests/attachments.mjs（三向映射往返/错误码/物化缓存，全量断言面）',
      'smoke.mjs:846-868（attachmentIds resolution via M2）',
      'docs/architecture-v3.md §11 D-1-4 / ADR-004（DEC-011）',
    ],
  })
}

// ── 观测 ⑤：D-1-5 跨轮指代（机制面可自动化；成功率需真实模型）──────────────
// 定义（§11 D-1-5）：图片轮后文本追问轮，主 agent 回答引用图片内容
// （imageMemory 生效）≥80%。机制面 = imageMemory 记忆段注入 + attachmentIds
// 解析可达（Step 4/7 已断言）；成功率（模型行为正确性）需真实模型 N 轮评估。
async function observeCrossTurnReference() {
  const detail = []
  const checks = []
  const { collectMemorySegments, memorySegmentText } = await import('../lib/wrapper.js')
  const imageEntry = { modality: 'image', state: { vision: ['vision'], generation: [] }, marker: () => 'm', rewrite: () => null }

  // 机制面 A：图片轮识别结果回写 → 后续文本轮历史图注入 system 记忆段。
  clearImageMemory()
  const contentId = `sha256:${'e'.repeat(64)}`
  const written = rememberImage(contentId, '一张架构图：最上层是适配层，下层是核心层')
  checks.push(['机制面 A：图片轮识别结果回写 imageMemory（M6 写点）', written === true && recallImage(contentId)?.text.includes('架构图')])
  const historyImage = createUserMessage({ content: [{ type: 'text', text: '看这张架构图' }, { type: 'image', attachment: { attachmentId: contentId, mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'arch.png' } }], source: { kind: 'user' } })
  const answeredTurn = createAssistantMessage({ content: [{ type: 'text', text: '已识别，见工具结果' }], provider: 'text-provider', model: 'brain-1' })
  const followUp = createUserMessage({ content: [{ type: 'text', text: '刚才图里最上层是什么' }], source: { kind: 'user' } })
  const segments = collectMemorySegments([historyImage, answeredTurn, followUp], [imageEntry])
  checks.push(['机制面 A：追问轮 system 注入历史图记忆段（含描述+附件 id）', segments.length === 1 && segments[0].includes('此前识别') && segments[0].includes('适配层') && segments[0].includes(contentId)])
  const segmentText = memorySegmentText('arch.png', contentId, '五层架构图')
  checks.push(['机制面 A：记忆段含 attachmentIds 再查指引（跨轮精确再看）', segmentText.includes(`attachmentIds:[${contentId}]`) && segmentText.includes('不可信证据')])
  clearImageMemory()

  // 机制面 B：attachmentIds 解析可达（主 agent 从记忆段拿 id 直接派发）。
  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])
  const storeBytes = new Map()
  const refBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x02])
  storeBytes.set(contentId, { attachmentId: contentId, mediaType: 'image/png', bytes: refBytes.length, width: 2, height: 2, name: 'arch.png' })
  const root = new Context()
  root.provide('attachments', {
    imageLimits: { maxImageBytes: 20 * 1024 * 1024, maxImagesPerMessage: 8, maxMessageImageBytes: 40 * 1024 * 1024, maxImagePixels: 100_000_000, mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
    saveImage: async (input) => ({ attachmentId: contentHashId(input.data), mediaType: input.mediaType, bytes: input.data.length, width: 2, height: 2, name: input.name }),
    readImage: async (ref) => {
      if (!storeBytes.has(String(ref?.attachmentId ?? ''))) throw new Error('no such attachment')
      return { ref: storeBytes.get(String(ref?.attachmentId ?? '')), data: PNG_BYTES }
    },
  })
  root.provide('fs', {
    resolve: async (path) => ({ displayPath: path, targetKey: path }),
    stat: async () => ({ type: 'file', version: 1, size: 10 }),
    readBytes: async () => PNG_BYTES,
  })
  const service = new RouterService(root)
  service.attach({ get: () => ({ enabled: true, agents: {} }) })
  const refs = await service.resolveAttachmentIds([contentId], { agent: { session: { header: { cwd: 'D:/work/example' }, deriveMessages: () => [] } } })
  checks.push(['机制面 B：记忆段附件 id 经 M2 解析可达（懒注册降级）', refs.length === 1 && refs[0].attachmentId === contentId && refs[0].mediaType === 'image/png'])

  const failed = checks.filter(([, ok]) => !ok)
  for (const [label, ok] of checks) detail.push(`${ok ? 'ok ' : 'FAIL'} ${label}`)
  record({
    id: 'D-1-5',
    name: '跨轮指代成功率',
    definition: 'DEC-012 / §11 D-1-5：≥80%（图片轮后文本轮追问，主 agent 回答引用图片内容——imageMemory 生效）',
    status: failed.length === 0 ? 'pass' : 'fail',
    value: failed.length === 0 ? '机制面 100%（记忆段注入 + attachmentIds 解析可达）' : '机制面 FAIL',
    detail,
    evidence: [
      'smoke.mjs:1557-1569（follow-up text turn injects memory segment）',
      'smoke.mjs:848-867（attachmentIds resolution via M2）',
      'docs/architecture-v3.md §11 D-1-5 / DEC-007 修订⑤',
    ],
    success: {
      status: 'not-measurable',
      method: '测量方法：① 真实会话：图片轮（主模型调 route_agent 识别）→ 文本追问轮（固定模板"刚才图里 X"）；② 主 agent 回答引用图片内容（命中 imageMemory 记忆段或经 attachmentIds 精确再看原图）计为成功；③ N 轮评估（人工或 LLM judge），成功率 = 引用图片内容的回答数 / 追问轮总数 ≥80%。数据来源：真实会话记录（图片轮工具结果 + 追问轮回答）。当前状态：not-measurable（需真实模型行为样本）。',
      methodName: '需真实模型 N 轮评估',
    },
  })
}

// ── 逃生组三项取舍观测面说明（R8 P3：F-05/F-06/F-08）+ V-DSH-5 ─────────────
// 观测面 = 说明三项设计内取舍的观测点与采集方法（不改变行为——本步观测为增量）。
function observeEscapeTradeoffs() {
  console.log('')
  console.log('逃生组三项取舍观测面（R8 P3 记录项，review-MIG-001-R8.md）:')
  console.log('  F-05 user 层标记复述风险：逃生组改写把 route_agent 标记文本放 user 消息层（prestep.js')
  console.log('      rewriteImageTurnsToMarkers——最小改写标记 minimalImageRewrite 替换 user 层图块）；')
  console.log('      复述风险为设计内取舍（vision-router 同款，index.js:4832-4835）。观测点：逃生轮改写后')
  console.log('      decision.messages 消息层含标记文本无裸图块（smoke.mjs:1680-1681 已断言）；复述行为需真实')
  console.log('      模型观测（D-1-3 U-3 会话样本顺带检查）。')
  console.log('  F-06 逃生路径日志层原件缺失：逃生轮原图块在宿主 append 之前被改写（C-4 日志保留原件仅包装')
  console.log('      主路径成立）；影响仅逃生组手动切回原组场景。观测点：逃生轮改写时机（宿主 append 前）')
  console.log('      已由 R8 F6 实读印证；日志层形态需真实会话核对。')
  console.log('  F-08 跨轮边界历史图块：会话中途 twin→逃生组切换后，历史轮原图块（wrapper F3 保留于会话事件）')
  console.log('      在逃生组文本轮经 deriveMessages 原样进入模型输入 → 纯文本主模型 UNSUPPORTED_CONTENT 风险。')
  console.log('      观测点：D-1-3 U-3 会话样本中检查"逃生组 + 历史带图会话"场景的模型输入形态；若实测出现')
  console.log('      击穿按 R8 F-08 记录路径处理（新任务线索）。')
  console.log('  V-DSH-5 主模型对三通道响应率 ≥90%：= D-1-3 触发率本体（本报告观测③ usage 字段），')
  console.log('      测量方法同 U-3（RES-001 §4.3）。')
}

// ── 判别性自检：观测断言在"指标被破坏"时必须失败（验收标准 2）────────────
// 不改产品代码——用破坏性夹具（替换模型身份的 wrap / 被清空的注册表）证明
// 观测逻辑能捕获指标回退。判别成立 = 破坏场景下观测断言为 false。
async function observeDiscrimination() {
  const detail = []
  const checks = []
  const { createWrapAdapter, WRAP_SUFFIX } = await import('../lib/wrapper.js')

  // 判别 1（D-1-1）：恒主模型被破坏 = wrap resolveModel 替换模型身份（整轮
  // 路由复活形态）→ 观测断言 `twinResolved.id === MAIN_MODEL` 必须失败。
  const badLlm = new LlmRuntime(new Context())
  const badAdapter = {
    providerInfo() { return { id: 'text-provider', name: 'TextBrain' } },
    providerRetryPolicy() { return undefined },
    async listModels() { return [{ provider: 'text-provider', id: 'brain-1', name: 'Brain-1', inputModalities: ['text'] }] },
    // 破坏：resolveModel 把模型替换为专业 agent 的模型（整轮路由行为）。
    async resolveModel(provider, model) {
      return { provider, id: 'gpt-4o', name: 'gpt-4o', inputModalities: ['text'], context: { contextWindow: 100_000 }, defaultMaxTokens: 4096 }
    },
    async *stream() { yield { type: 'finish', reason: { kind: 'stop' } } },
  }
  badLlm.registerAdapter(['text-provider'], badAdapter)
  const badWrap = createWrapAdapter(badLlm, 'text-provider', [{ modality: 'image', state: { vision: ['vision'], generation: [] }, marker: () => 'm', rewrite: () => null }])
  const badResolved = await badWrap.resolveModel(`text-provider${WRAP_SUFFIX}`, 'brain-1')
  checks.push(['判别 1：模型身份被替换时 D-1-1 观测断言失败（可判别）', badResolved.id !== 'brain-1'])

  // 判别 2（D-1-4）：编址往返被破坏 = 注册表 pathIndex 被清空（byPath 反向
  // 索引失效）→ 观测断言 `byPath(path)?.id === entry.id` 必须失败。
  const discRoot = new Context()
  const discStore = new Map()
  discRoot.provide('attachments', {
    async saveImage(input) {
      const id = contentHashId(input.data)
      const ref = { attachmentId: id, mediaType: input.mediaType, bytes: input.data.length, width: 2, height: 2, name: input.name }
      discStore.set(id, { ref, data: input.data })
      return ref
    },
    async readImage(ref) {
      const stored = discStore.get(String(ref?.attachmentId ?? ''))
      if (!stored) throw new Error('attachment not found')
      return { ref: stored.ref, data: stored.data }
    },
  })
  discRoot.provide('fs', {
    resolve: async (path, options = {}) => {
      const raw = String(path)
      const target = raw.includes(':') ? raw : `${options.cwd ?? ''}/${raw}`
      return { displayPath: target }
    },
    stat: async (target) => {
      const raw = String(target?.displayPath ?? target ?? '')
      if (raw.includes('missing')) return undefined
      return { type: 'file', version: 1, size: 10 }
    },
    readBytes: async (target) => {
      const raw = String(target?.displayPath ?? target ?? '')
      if (raw.endsWith('.png')) return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])
      return new TextEncoder().encode('hello')
    },
  })
  const discRegistry = new AttachmentRegistry(discRoot)
  const discPath = 'D:/work/metrics-disc/notes.txt'
  const discEntry = await discRegistry.registerPath(discPath, { cwd: 'D:/work/metrics-disc' })
  discRegistry.pathIndex.clear() // 破坏：反向索引失效。
  checks.push(['判别 2：反向索引失效时 D-1-4 byPath 观测断言失败（可判别）', discRegistry.byPath(discPath)?.id !== discEntry.id])
  discRegistry.close()

  // 判别 3（D-1-2 改写分支）：图片到达被破坏 = runChat 不注入 image 块（图片
  // 丢失）→ 观测断言 `messages 含 image 块` 必须失败。复用破坏性 service：
  // 直接验证"无图片注入时观测断言为 false"（观测依赖真实请求形态，非硬编码）。
  const lostRun = await (async () => {
    const lr = new Context()
    let captured = null
    lr.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-pro' }) })
    lr.provide('settings', { writable: true, describe: () => [{ ns: 'router', revision: 1, value: { enabled: true, agents: {} }, user: { enabled: true } }], mutate: async () => undefined })
    lr.provide('llm', {
      listModels: async () => [],
      resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }),
      listProviders: async () => [],
      stream: async function* (request) { captured = request; yield { type: 'finish', reason: { kind: 'stop' } } },
    })
    lr.provide('attachments', { imageLimits: {}, saveImage: async (input) => ({ attachmentId: contentHashId(input.data), mediaType: input.mediaType, bytes: 1, width: 1, height: 1, name: input.name }), readImage: async () => ({ ref: {}, data: new Uint8Array([1]) }) })
    lr.provide('fs', { resolve: async (p) => ({ displayPath: p }), stat: async () => ({ type: 'file', version: 1, size: 1 }), readBytes: async () => new Uint8Array([1]) })
    const svc = new RouterService(lr)
    svc.attach({ get: () => ({ enabled: true, agents: { vision: { name: '视觉', type: 'chat', enabled: true, capabilities: ['image'], provider: 'openai', model: 'gpt-4o', maxRounds: 1 } } }) })
    await svc.run({ agentId: 'vision', task: '识别', images: [], exec: { agent: { session: { header: { cwd: 'D:/work/example', delegationDepth: 0 }, deriveMessages: () => [] } } } })
    return captured
  })()
  checks.push(['判别 3：图片未注入（空 images）时观测断言失败（可判别）', !(lostRun && Array.isArray(lostRun.messages) && lostRun.messages[0].content.some((block) => block.type === 'image'))])

  const failed = checks.filter(([, ok]) => !ok)
  for (const [label, ok] of checks) detail.push(`${ok ? 'ok ' : 'FAIL'} ${label}`)
  record({
    id: 'DISC',
    name: '观测断言判别性自检（破坏夹具）',
    definition: '验收标准 2：自动化观测在指标被破坏时可判别',
    status: failed.length === 0 ? 'pass' : 'fail',
    value: `判别成立（${checks.length}/${checks.length} 破坏场景均可捕获）`,
    detail,
    evidence: ['破坏性夹具（替换模型身份 wrap / 清空 pathIndex / 空 images 请求）——不改产品代码'],
  })
}

// ── 观测 ⑥（C-9-1）：OAuth 登录旅程埋点（EVO-002 Step 6 启动；v0.3.2 出报告）──
// 可完全自动化：直构 RouterService 走完整旅程——begin（kill-switch 拒绝留事件）
// → 开关开 → begin/exchange（登录事件 + 凭据落盘）→ codex 调用（SSE 桩采样）
// → logout（删除事件 + 文件消失）。判别性：oauthEvents 缺失（旧代码无埋点）
// 或事件负载含 token 值（P7 违规）→ 观测失败。
async function observeOauthTelemetry() {
  const detail = []
  const checks = []
  let crash = null
  try {
    const work = mkdtempSync(join(tmpdir(), 'router-c9-'))
    const fakeJwt = (accountId) => {
      const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
      return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ 'https://api.openai.com/auth': { chatgpt_account_id: accountId } })}.sig-c9`
    }
    const access = fakeJwt('acct-c9')
    const credFile = join(work, 'c9-auth.json')
    const root = new Context()
    root.provide('credentials', { resolve: async () => undefined, set: async () => undefined, unset: async () => undefined })
    const service = new RouterService(root)
    service.attach({ get: () => ({
      enabled: true,
      oauthAccounts: { cgpt: { name: 'ChatGPT订阅', enabled: true, preset: 'chatgpt-codex', credentialFile: credFile, protocol: 'codex-responses', baseURL: 'https://chatgpt.com/backend-api', models: ['gpt-5.4-mini'] } },
      agents: { cgptchat: { name: 'CGPT', type: 'chat', enabled: true, account: 'cgpt' } },
    }) })
    service.codexLoopbackStarter = async () => ({ ready: true, port: 1455, dispose: () => {} })
    // R7-F5：隔离进程代理 env——C-9-1 采样调用经真实 resolveOauthProxy
    //  读 process.env，HTTPS_PROXY 机器上会触发环境代理 + fail-loud import。
    const proxyEnvKeysC9 = ['HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy']
    const savedProxyEnvC9 = {}
    for (const key of proxyEnvKeysC9) { savedProxyEnvC9[key] = globalThis.process?.env?.[key]; delete globalThis.process.env[key] }
    const realFetch = globalThis.fetch
    globalThis.fetch = async (url) => {
      if (String(url) === CHATGPT_PRESET.tokenUrl) {
        return { ok: true, json: async () => ({ access_token: access, refresh_token: 'REFRESH-C9', expires_in: 3600, token_type: 'bearer' }) }
      }
      if (String(url).endsWith('/codex/responses')) {
        return { ok: true, status: 200, body: new ReadableStream({ start(controller) {
          const encoder = new TextEncoder()
          controller.enqueue(encoder.encode(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', output_index: 0, delta: 'C9-OK' })}\n\n`))
          controller.enqueue(encoder.encode(`event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: { usage: { input_tokens: 1, output_tokens: 2 } } })}\n\n`))
          controller.close()
        } }) }
      }
      return { ok: false, status: 404, text: async () => 'not found' }
    }
    try {
      // EVO-006（DEC-026 C2 转正）：无实验门控——begin 直达授权 URL；事件
      // 面不再产生 kill_switch/tos reason（判别：旧实现此处 begin 被拒）。
      const begin = await service.oauthBegin({ accountId: 'cgpt' })
      checks.push(['无实验门控直达授权 + 事件零实验 reason', begin.ok === true && !service.oauthEvents.some((event) => event.reason === 'kill_switch' || event.reason === 'tos')])
      const exchange = await service.oauthTokenExchange({ code: 'c9', state: begin.state })
      checks.push(['登录旅程事件链（begin_ok + login_ok）', begin.ok === true && exchange.ok === true && service.oauthEvents.some((event) => event.kind === 'preset_begin_ok') && service.oauthEvents.some((event) => event.kind === 'preset_login_ok')])
      const run = await service.run({ agentId: 'cgptchat', task: 'C-9 采样调用' })
      checks.push(['codex 调用通路采样成功', run.kind === 'chat' && run.text === 'C9-OK'])
      const logout = await service.oauthLogout({ accountId: 'cgpt' })
      checks.push(['登出删除凭据 + logout 事件', logout.ok === true && !existsSync(credFile) && service.oauthEvents.some((event) => event.kind === 'preset_logout')])
      const eventsText = JSON.stringify(service.oauthEvents)
      checks.push(['事件负载零 token 值（P7）', !eventsText.includes('sig-c9') && !eventsText.includes('REFRESH-C9')])
      detail.push(`事件种类: ${[...new Set(service.oauthEvents.map((event) => event.kind))].join(', ')}`)
    } finally {
      globalThis.fetch = realFetch
      for (const key of proxyEnvKeysC9) {
        if (savedProxyEnvC9[key] === undefined) delete globalThis.process.env[key]
        else globalThis.process.env[key] = savedProxyEnvC9[key]
      }
      try { rmSync(work, { recursive: true, force: true }) } catch { /* 清理尽力而为 */ }
    }
  } catch (error) { crash = error }
  if (crash) {
    checks.push(['观测无异常崩溃', false])
    detail.push(String(crash && crash.message))
  }
  const failed = checks.filter(([, ok]) => !ok)
  for (const [name, ok] of checks) detail.push(`${ok ? '✓' : '✗'} ${name}`)
  record({
    id: 'C-9-1',
    name: 'OAuth 登录旅程埋点（C-9 v0.3.0 启动：登录/调用/登出事件 + P7 零 token）',
    status: failed.length === 0 ? 'pass' : 'fail',
    detail,
    evidence: ['RouterService.oauthEvents（内存环形缓冲 100 条）', 'oauthBegin/oauthTokenExchange/run/oauthLogout 直构链'],
  })
}

// ── 主流程：逐项观测 + 汇总 ─────────────────────────────────────────────────
console.log('=== dsh-agent-router D-1 METRICS OBSERVATION (MIG-001 Step 10) ===')
console.log('定义来源: DEC-012 定稿 + docs/architecture-v3.md §11（成功标准候选指标评审定稿）')
console.log('')

await observeMainModelConstancy()
console.log('')
await observeImageArrival()
console.log('')
await observeTriggerRate()
console.log('')
await observeAddressingRoundTrip()
console.log('')
await observeCrossTurnReference()
console.log('')
observeEscapeTradeoffs()
console.log('')
await observeDiscrimination()
console.log('')
await observeOauthTelemetry()
console.log('')

// ── D-1 门判定汇总 ───────────────────────────────────────────────────────────
const automated = results.filter((r) => r.status === 'pass')
const notMeasurable = results.filter((r) => r.status !== 'pass')
console.log('=== D-1 GATE SUMMARY ===')
for (const r of results) {
  const autoPart = r.status === 'pass' ? '自动化观测通过' : '自动化观测 FAIL'
  const realPart = r.e2e?.status === 'not-measurable' || r.usage?.status === 'not-measurable' || r.success?.status === 'not-measurable'
    ? '；真实样本部分待实测（not-measurable + 测量方法已记录）'
    : ''
  console.log(`  ${r.id} ${r.name}: ${autoPart}${realPart}`)
}
console.log('')
const gate = {
  'D-1-1': { threshold: '100%', status: results.find((r) => r.id === 'D-1-1')?.status === 'pass' ? '满足（自动化 100% 全场景）' : 'FAIL' },
  'D-1-2': { threshold: '100%', status: results.find((r) => r.id === 'D-1-2')?.status === 'pass' ? '部分满足（机制面两分支通过；端到端待实测）' : 'FAIL' },
  'D-1-3': { threshold: '≥90%', status: results.find((r) => r.id === 'D-1-3')?.status === 'pass' ? '待实测（机制面三通道就位；触发率需 U-3 真实使用统计）' : 'FAIL' },
  'D-1-4': { threshold: '100%', status: results.find((r) => r.id === 'D-1-4')?.status === 'pass' ? '满足（自动化 100% 全场景）' : 'FAIL' },
  'D-1-5': { threshold: '≥80%', status: results.find((r) => r.id === 'D-1-5')?.status === 'pass' ? '部分满足（机制面通过；成功率需真实模型 N 轮评估）' : 'FAIL' },
}
for (const [id, g] of Object.entries(gate)) console.log(`  ${id}（阈值 ${g.threshold}）: ${g.status}`)

// 自动化观测全过 → exit 0（not-measurable 是合法输出，不计失败）。
const failures = results.filter((r) => r.status === 'fail').length
console.log(failures === 0 ? '\nALL METRICS OBSERVATIONS PASSED（自动化部分；not-measurable 部分按测量方法待实测）' : `\n${failures} METRICS OBSERVATION FAILURES`)
process.exit(failures === 0 ? 0 : 1)
