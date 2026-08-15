// dsh-router 冒烟测试：模块解析 + schema 默认值 + RPC 校验器 + 服务核心逻辑。
import { Context } from '@deepseek-ai/cordis'
import { routerSchema, wireCodecs } from '../lib/schemas.js'
import { createHostContribution, ROUTER_REMOTE } from '../lib/rpc.js'
import { RouterService, AGENT_TYPES, errorMessage } from '../lib/service.js'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import { createUserMessage, createAssistantMessage } from '@deepseek-ai/dsh-llm/message'
import { defineTool } from '@deepseek-ai/dsh-tools'

let failures = 0
function check(label, condition) {
  if (condition) console.log(`  ok  ${label}`)
  else { failures++; console.error(`FAIL  ${label}`) }
}

// 1. schema 默认值解析
console.log('schemas:')
{
  const a = routerSchema({ enabled: false })
  check('default enabled=false kept', a.enabled === false)
  check('default agents = {}', a.agents && Object.keys(a.agents).length === 0)
  const b = routerSchema({ agents: { vision: { name: 'V' } } })
  check('dict entry resolves defaults', b.agents.vision.type === 'chat' && b.agents.vision.enabled === true && b.agents.vision.maxRounds === 1 && b.agents.vision.imageSize === '1024x1024')
  check('name kept', b.agents.vision.name === 'V')
}

// 2. wire codec
console.log('wire codecs:')
{
  const value = wireCodecs.catalogResult.parse({ ok: true, enabled: true, defaults: { provider: 'p', model: 'm' }, agents: [], oauthAccounts: [] })
  check('catalogResult parses', value.ok === true)
  let threw = false
  try { wireCodecs.catalogResult.parse({ ok: true }) } catch { threw = true }
  check('catalogResult rejects missing fields', threw)
  const s = wireCodecs.statsResult.parse({ ok: true, enabled: true, totals: [], recent: [], series: [], accountTotals: [], accountSeries: [] })
  check('statsResult parses empty', s.ok === true)
}

// 3. typert 贡献形状
console.log('rpc contribution:')
{
  const contribution = createHostContribution()
  check('face host', contribution.face === 'host')
  check('8 invocations', contribution.invocations.length === 8)
  check('descriptors share ids', ROUTER_REMOTE.descriptors.length === 8 && ROUTER_REMOTE.descriptors.every((d, i) => d.id === contribution.invocations[i].id))
  check('strict codecs have parse', contribution.invocations.every((d) => typeof d.result.schema.parse === 'function' && d.parameters.every((p) => typeof p.codec.schema.parse === 'function')))
}

// 4. llm 词法 import
console.log('llm vocabulary:')
{
  const user = createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } })
  check('createUserMessage', user.role === 'user' && user.id)
  const assistant = createAssistantMessage({ content: [{ type: 'text', text: 'hey' }], provider: 'p', model: 'm' })
  check('createAssistantMessage', assistant.role === 'assistant' && assistant.source.kind === 'model')
  const assembler = new BlockAssembler()
  assembler.push({ type: 'block-start', index: 0, blockType: 'text' })
  assembler.push({ type: 'text-delta', index: 0, text: 'ok' })
  assembler.push({ type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } })
  assembler.push({ type: 'usage', usage: { inputTokens: 3, outputTokens: 1 } })
  assembler.push({ type: 'finish', reason: { kind: 'stop' } })
  check('BlockAssembler blocks', assembler.blocks().length === 1 && assembler.blocks()[0].text === 'ok')
  check('BlockAssembler usage', assembler.usage && assembler.usage.inputTokens === 3)
  check('BlockAssembler finish', assembler.finish.kind === 'stop')
}

// 5. defineTool 契约
console.log('defineTool:')
{
  const tool = defineTool({
    name: 'smoke_tool',
    description: 'smoke',
    parameters: { x: { type: 'string', required: true } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' } } }, render: () => [{ type: 'text', text: 'ok' }] },
    async execute(args) { return { ok: Boolean(args.x) } },
  })
  check('defineTool builds definition', tool.name === 'smoke_tool' && typeof tool.execute === 'function')
}

// 6. RouterService 核心逻辑（stub 服务）
console.log('RouterService:')
{
  const root = new Context()
  root.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-pro' }) })
  root.provide('settings', {
    writable: true,
    describe: () => [{
      ns: 'router',
      revision: 7,
      value: { enabled: true, agents: {} },
      user: { enabled: true },
    }],
    mutate: async () => undefined,
  })
  root.provide('credentials', {
    resolve: async (ref) => (ref === 'ROUTER_OAUTH_OAUTH_TOKEN' ? { value: 'tok' } : undefined),
    set: async () => undefined,
    unset: async () => undefined,
  })
  root.provide('llm', {
    listModels: async (provider) => provider === 'openai' ? [{ id: 'gpt-4o', name: 'GPT-4o' }] : [],
    resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }),
    stream: async function* () {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '你好' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '你好' } }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  })
  const service = new RouterService(root)
  service.attach({ get: () => ({
    enabled: true,
    agents: {
      vision: { name: '视觉', type: 'chat', enabled: true, description: '看图', capabilities: ['image'], provider: '', model: '', maxRounds: 1 },
      draw: { name: '画图', type: 'image', enabled: true, description: '画图', provider: 'openai', model: 'dall-e-3' },
      broken: { name: '坏', type: 'chat', enabled: true, provider: 'openai', model: '' },
      vchat: { name: '视觉OAuth', type: 'chat', enabled: true, account: 'oauth' },
      off: { name: '关', type: 'chat', enabled: false },
    },
    oauthAccounts: {
      oauth: { name: 'GPT', enabled: true, protocol: 'openai-completions', baseURL: 'https://api.openai.com/v1', tokenRef: 'ROUTER_OAUTH_OAUTH_TOKEN', tokenUrl: 'https://auth.example/token', clientId: 'cid', models: ['gpt-4o'] },
    },
  })})

  check('isEnabled', service.isEnabled())
  check('normalizeType', service.normalizeType('image') === 'image' && service.normalizeType('speech') === 'speech' && service.normalizeType('bogus') === 'chat')
  check('typertRemote binding', service.typertRemote && service.typertRemote.namespace === 'router' && service.typertRemote.serviceKey === 'router' && service.typertRemote.service === service)

  const config = await service.config()
  check('config reads settings descriptor', config.ok === true && config.revision === 7 && config.writable === true && config.value && config.value.enabled === true)
  const saved = await service.save({ ops: [{ op: 'set', path: ['enabled'], value: false }], expectedRevision: 7 })
  check('save returns fresh descriptor', saved.ok === true && saved.revision === 7)

  const vision = await service.resolveAgent('vision')
  check('inherit main model', vision.provider === 'deepseek-official' && vision.model === 'deepseek-v4-pro' && vision.source === 'main')

  const draw = await service.resolveAgent('draw')
  check('explicit model', draw.provider === 'openai' && draw.model === 'dall-e-3' && draw.source === 'agent')

  const broken = await service.resolveAgent('broken')
  check('provider default model', broken.provider === 'openai' && broken.model === 'gpt-4o' && broken.source === 'provider-default')

  const missing = await service.resolveAgent('nope')
  check('unknown agent error', missing.error && String(missing.error).includes('nope'))

  const catalog = await service.catalog()
  check('catalog lists enabled only', catalog.agents.length === 4 && catalog.agents.every((entry) => entry.id !== 'off'))
  check('catalog effective', catalog.agents.find((entry) => entry.id === 'vision').effectiveModel === 'deepseek-v4-pro')
  check('catalog oauth accounts', catalog.oauthAccounts.length === 1 && catalog.oauthAccounts[0].id === 'oauth' && catalog.oauthAccounts[0].models.length === 1)
  check('catalog oauth agent account', catalog.agents.find((entry) => entry.id === 'vchat').account === 'oauth')

  // OAuth 账号解析与直连调用
  const vchat = await service.resolveAgent('vchat')
  check('oauth resolve', vchat.mode === 'oauth' && vchat.accountId === 'oauth' && vchat.model === 'gpt-4o' && vchat.provider === 'oauth:oauth')
  const badAccount = await service.resolveAgent('vision')
  check('route resolve unaffected', badAccount.mode === 'route')
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/chat/completions')) {
      const body = JSON.parse(options.body)
      return { ok: true, json: async () => ({ choices: [{ message: { content: `echo:${body.messages[1].content}` } }], usage: { prompt_tokens: 5, completion_tokens: 2 } }) }
    }
    if (String(url).includes('auth.example/token')) return { ok: true, json: async () => ({ access_token: 't2', expires_in: 3600 }) }
    if (String(url).endsWith('/models')) return { ok: true, json: async () => ({ data: [{ id: 'm1' }, { id: 'm2' }] }) }
    return { ok: false, status: 404, text: async () => 'not found' }
  }
  try {
    const oauthResult = await service.run({ agentId: 'vchat', task: '你好', images: [] })
    check('oauth run direct call', oauthResult.kind === 'chat' && oauthResult.text === 'echo:你好' && oauthResult.usage.inputTokens === 5 && oauthResult.usage.outputTokens === 2)
    const exchange = await service.oauthTokenExchange({ accountId: 'oauth', code: 'c1', codeVerifier: 'v1', redirectUri: 'http://localhost/' })
    check('oauth token exchange', exchange.ok === true && exchange.expiresIn === 3600 && exchange.message.includes('成功'))
    const discovered = await service.oauthDiscover({ accountId: 'oauth' })
    check('oauth discover', discovered.ok === true && discovered.models.length === 2 && discovered.models[0] === 'm1')
  } finally {
    globalThis.fetch = realFetch
  }

  const text = service.promptText()
  check('promptText lists agents', text.includes('vision') && text.includes('draw') && text.includes('route_agent') && !text.includes('off'))

  const result = await service.runChat(vision, { agentId: 'vision', task: '你好', images: [] })
  check('runChat streams', result.kind === 'chat' && result.text === '你好' && result.usage.inputTokens === 10 && result.usage.outputTokens === 2)

  service.record({ agentId: 'vision', provider: 'deepseek-official', model: 'deepseek-v4-pro', ok: true, ms: 100, inputTokens: 10, outputTokens: 2 })
  service.record({ agentId: 'draw', provider: 'openai', model: 'dall-e-3', ok: false, ms: 200 })
  const stats = service.statsSnapshot()
  check('stats totals', stats.totals.length === 2 && stats.totals.find((t) => t.agentId === 'vision').calls === 1 && stats.totals.find((t) => t.agentId === 'draw').errors === 1)
  check('stats recent', stats.recent.length === 2 && stats.recent[0].agentId === 'draw')
  check('stats series', stats.series.some((s) => s.agentId === 'vision' && s.buckets.length === 1 && s.buckets[0].outputTokens === 2))
  check('stats account totals', stats.accountTotals.length === 2 && stats.accountTotals.find((a) => a.provider === 'openai').calls === 1 && stats.accountTotals.find((a) => a.provider === 'openai').models.length === 1 && stats.accountTotals.find((a) => a.provider === 'openai').models[0].model === 'dall-e-3')
  check('stats account series', stats.accountSeries.some((s) => s.provider === 'deepseek-official' && s.buckets.length === 1 && s.buckets[0].inputTokens === 10))

  const test = await service.test({ agentId: 'vision' })
  check('test ping', test.ok === true && test.message.includes('deepseek-official'))
  const testBad = await service.test({ agentId: 'nope' })
  check('test unknown agent', testBad.ok === false)

  service.reset()
  check('reset clears', service.statsSnapshot().totals.length === 0)

  check('findRecentImages empty', service.findRecentImages(null).length === 0)
  check('errorMessage', errorMessage(new Error('x')) === 'x' && errorMessage({ message: 'y' }) === 'y')
}

// 7. tool.js / index.js 的 apply 装配（stub 服务，验证 inject 等待与直接注册）
console.log('apply wiring:')
{
  const toolModule = await import('../lib/tool.js')
  const indexModule = await import('../lib/index.js')

  // ── tool apply ──
  {
    let registered = null
    let sections = []
    const fakeRouter = { isEnabled: () => true, promptText: () => 'ROUTER-PROMPT', resolveAgent: async () => ({ error: 'stub' }), record: () => {} }
    const root = new Context()
    await root.plugin({ name: 'stub-router', apply: (ctx) => ctx.provide('router', fakeRouter) })
    await root.plugin({ name: 'stub-tools', apply: (ctx) => ctx.provide('tools', { register: (definition) => { registered = definition; return () => {} } }) })
    await root.plugin({ name: 'stub-system-prompt', apply: (ctx) => ctx.provide('systemPrompt', { section: (section) => { sections.push(section); return () => {} } }) })
    check('tool module declares inject', Array.isArray(toolModule.inject) && toolModule.inject.includes('tools') && toolModule.inject.includes('systemPrompt'))
    const app = root.plugin({ name: 'smoke-tool', inject: toolModule.inject, apply: toolModule.apply })
    await app
    check('route_agent registered', registered && registered.name === 'route_agent')
    check('prompt section registered', sections.some((s) => s.name === 'router:agents' && s.order === 120 && s.text() === 'ROUTER-PROMPT'))
    check('tool timeout 5min', registered.timeoutMs === 300000)
    check('tool output has render', typeof registered.output.render === 'function' && typeof registered.execute === 'function')
    await app.dispose()
  }

  // ── index apply ──
  {
    let settingsNs = null
    let registeredContribution = null
    const root = new Context()
    await root.plugin({ name: 'stub-settings', apply: (ctx) => ctx.provide('settings', {
      register: (ns, schema) => {
        settingsNs = { ns, schema }
        return { get: () => ({ enabled: true, agents: {} }) }
      },
    }) })
    await root.plugin({ name: 'stub-typert', apply: (ctx) => ctx.provide('typert', {
      register: (contribution) => { registeredContribution = contribution; return () => {} },
    }) })
    check('index module declares inject', Array.isArray(indexModule.inject) && indexModule.inject.includes('settings') && indexModule.inject.includes('typert'))
    const app = root.plugin({ name: 'smoke-index', inject: indexModule.inject, apply: indexModule.apply })
    await app
    check('settings ns router registered', settingsNs && settingsNs.ns === 'router')
    check('typert contribution registered', registeredContribution && registeredContribution.invocations.length === 8 && registeredContribution.package === 'dsh-router')
    check('router service provided', typeof root.get('router') === 'object' && root.get('router') !== null)
    await app.dispose()
  }
}

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)


