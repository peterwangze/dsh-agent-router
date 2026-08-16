// dsh-agent-router 冒烟测试：模块解析 + schema 默认值 + RPC 校验器 + 服务核心逻辑。
import { Context } from '@deepseek-ai/cordis'
import { routerSchema, wireCodecs } from '../lib/schemas.js'
import { createHostContribution, ROUTER_REMOTE } from '../lib/rpc.js'
import { RouterService, AGENT_TYPES, errorMessage, GEMINI_OAUTH_SCOPES, GEMINI_SELF_CLIENT_SCOPES, migrateGeminiScope, extractCodexJsonl, extractCliJsonObject, parseClaudeStatus, wrapCmdLine } from '../lib/service.js'
import { runClientRender } from './client-render.mjs'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import { createUserMessage, createAssistantMessage } from '@deepseek-ai/dsh-llm/message'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const LIB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib')
const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
function check(label, condition) {
  if (condition) console.log(`  ok  ${label}`)
  else { failures++; console.error(`FAIL  ${label}`) }
}

// 0. 语法守卫：client.js 是浏览器 bundle，但宿主启动时预打包客户端
//    入口——语法错误会直接击穿 DSH 启动（括号失衡事故教训）。用 node
//    --check 全量把关；install.ps1 由 Windows 用户直接执行，用 PowerShell
//    解析器把关（stdio ignore：不进管道，兼容受限运行环境）。
console.log('syntax:')
{
  for (const file of ['client.js', 'service.js', 'tool.js', 'index.js', 'rpc.js', 'schemas.js']) {
    const result = spawnSync(process.execPath, ['--check', join(LIB_DIR, file)], { stdio: 'ignore' })
    check(`lib/${file} parses`, result.status === 0)
  }
  const installPs1 = join(ROOT_DIR, 'install.ps1')
  if (existsSync(installPs1)) {
    // 路径直接内嵌 PS 单引号字符串（-Command 的尾随参数不进入 $args）。
    const parseScript = `$e=$null; $t=$null; [System.Management.Automation.Language.Parser]::ParseFile('${installPs1}', [ref]$t, [ref]$e) | Out-Null; exit $e.Count`
    const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', parseScript], { stdio: 'ignore' })
    check('install.ps1 parses', result.status === 0)
  }
  // 文案键覆盖守卫：client.js 里每个 t('key') 引用必须同时存在于 zh 与 en
  // 文案表（缺键 = 渲染期崩溃），并检查两张表键集合一致。
  const clientSrc = readFileSync(join(ROOT_DIR, 'lib', 'client.js'), 'utf8')
  const usedKeys = [...clientSrc.matchAll(/\bt\('([a-zA-Z0-9]+)'\)/g)].map((m) => m[1])
  const tableKeys = (name) => {
    const block = clientSrc.split(`const ${name} = {`)[1]
    if (!block) return []
    const end = block.indexOf('\n    }')
    return [...block.slice(0, end).matchAll(/^\s*([a-zA-Z0-9]+):/gm)].map((m) => m[1])
  }
  const zhKeys = tableKeys('zh')
  const enKeys = tableKeys('en')
  const missingZh = [...new Set(usedKeys)].filter((key) => !zhKeys.includes(key))
  const missingEn = [...new Set(usedKeys)].filter((key) => !enKeys.includes(key))
  const zhExtra = zhKeys.filter((key) => !enKeys.includes(key))
  const enExtra = enKeys.filter((key) => !zhKeys.includes(key))
  check('client label keys covered (zh)', missingZh.length === 0 ? true : `missing: ${missingZh.join(', ')}`)
  check('client label keys covered (en)', missingEn.length === 0 ? true : `missing: ${missingEn.join(', ')}`)
  check('client label tables match', zhExtra.length === 0 && enExtra.length === 0 ? true : `zh-only: ${zhExtra.join(', ')} | en-only: ${enExtra.join(', ')}`)
}

// 1. schema 默认值解析
console.log('schemas:')
{
  const a = routerSchema({ enabled: false })
  check('default enabled=false kept', a.enabled === false)
  check('default agents = {}', a.agents && Object.keys(a.agents).length === 0)
  const b = routerSchema({ agents: { vision: { name: 'V' } } })
  check('dict entry resolves defaults', b.agents.vision.type === 'chat' && b.agents.vision.enabled === true && b.agents.vision.maxRounds === 1 && b.agents.vision.imageSize === '1024x1024')
  check('cli fields resolve defaults', b.agents.vision.command === '' && b.agents.vision.args === '' && b.agents.vision.timeoutMs === 0 && b.agents.vision.maxConcurrent === 1)
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
  check('12 invocations', contribution.invocations.length === 12)
  check('descriptors share ids', ROUTER_REMOTE.descriptors.length === 12 && ROUTER_REMOTE.descriptors.every((d, i) => d.id === contribution.invocations[i].id))
  check('strict codecs have parse', contribution.invocations.every((d) => typeof d.result.schema.parse === 'function' && d.parameters.every((p) => typeof p.codec.schema.parse === 'function')))
  const cliStatusCodec = wireCodecs.cliStatusResult.parse({ ok: true, message: '已登录', loggedIn: true })
  check('cliStatusResult parses', cliStatusCodec.ok === true && cliStatusCodec.loggedIn === true)
  const cliModelsCodec = wireCodecs.cliModelsResult.parse({ ok: true, message: 'm', models: ['a'] })
  check('cliModelsResult parses', cliModelsCodec.models.length === 1)
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
    resolve: async (ref) => (ref === 'ROUTER_OAUTH_OAUTH_TOKEN' || ref === 'ROUTER_OAUTH_PUBOAUTH_TOKEN' ? { value: 'tok' } : undefined),
    set: async () => undefined,
    unset: async () => undefined,
  })
  let lastChatRequest = null
  root.provide('llm', {
    listModels: async (provider) => provider === 'openai' ? [{ id: 'gpt-4o', name: 'GPT-4o' }] : [],
    // declared 路由（中转）的 input 声明按 pi-ai 默认纯文本；其余含 image。
    resolveModelInfo: async (provider) => provider === 'relay' ? { inputModalities: ['text'] } : { inputModalities: ['text', 'image'] },
    listProviders: async () => [{ provider: 'relay', displayName: 'Relay', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'relay'], active: true, declared: true }],
    stream: async function* (request) {
      lastChatRequest = request
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '你好' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '你好' } }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  })
  const delegationRequests = []
  root.provide('subagents', {
    start: async (_name, request) => {
      delegationRequests.push(request)
      return {
        result: Promise.resolve({ output: [{ type: 'text', text: '子代理完成' }], stopReason: 'completed' }),
        dispose: async () => undefined,
      }
    },
  })
  const savedImages = []
  root.provide('attachments', {
    imageLimits: { maxImageBytes: 20 * 1024 * 1024, maxImagesPerMessage: 8, maxMessageImageBytes: 40 * 1024 * 1024, maxImagePixels: 100_000_000, mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
    saveImage: async (input) => {
      const ref = { attachmentId: `att-file-${savedImages.length + 1}`, mediaType: input.mediaType, bytes: input.data.length, width: 2, height: 2, name: input.name }
      savedImages.push(ref)
      return ref
    },
    readImage: async (ref) => ({ ref, data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }),
  })
  root.provide('fs', {
    resolve: async (path) => ({ displayPath: path.includes(':') || path.startsWith('/') ? path : `D:/work/example/${path}` }),
    stat: async (target) => {
      const displayPath = String(target?.displayPath ?? '')
      if (displayPath.includes('missing')) return undefined
      if (displayPath.endsWith('dir')) return { type: 'directory', version: 1 }
      return { type: 'file', version: 1, size: 10 }
    },
    readBytes: async (target) => {
      const displayPath = String(target?.displayPath ?? '')
      if (displayPath.toLowerCase().endsWith('.png')) return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])
      if (displayPath.toLowerCase().endsWith('.txt')) return new TextEncoder().encode('hello 文本内容')
      return new Uint8Array([0xff, 0xfe, 0x00])
    },
  })
  // cli 类型测试用的伪 CLI 参数（node -e：读 stdin 回显任务 / 直接失败 / 睡眠）。
  const CLI_ECHO_ARGS = `-e "process.stdin.setEncoding('utf8');let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log('TASK:'+s.trim()))"`
  const CLI_BAD_ARGS = `-e "console.error('boom');process.exit(3)"`
  const CLI_SLEEP_ARGS = (ms) => `-e "setTimeout(()=>console.log('SLEPT'),${ms})"`

  const service = new RouterService(root)
  service.attach({ get: () => ({
    enabled: true,
    agents: {
      vision: { name: '视觉', type: 'chat', enabled: true, description: '看图', capabilities: ['image'], provider: '', model: '', maxRounds: 1 },
      draw: { name: '画图', type: 'image', enabled: true, description: '画图', provider: 'openai', model: 'dall-e-3' },
      broken: { name: '坏', type: 'chat', enabled: true, provider: 'openai', model: '' },
      vchat: { name: '视觉OAuth', type: 'chat', enabled: true, account: 'oauth' },
      pchat: { name: '池chat', type: 'chat', enabled: true, account: 'pool:gpool' },
      helper: { name: '子代理', type: 'agent', enabled: true, description: '委派子代理', provider: 'openai', model: 'gpt-4o' },
      relay: { name: '中转', type: 'chat', enabled: true, description: 'declared 中转', provider: 'relay', model: 'gpt-5.6-luna', maxRounds: 1 },
      coder: { name: 'CLI子代理', type: 'cli', enabled: true, description: '无头 CLI', capabilities: ['image'], command: process.execPath, args: CLI_ECHO_ARGS, systemPrompt: '你是一个测试助手', statusArgs: `-e "process.exit(0)"`, modelsArgs: `-e "console.log('m1\\nm2')"` },
      coderbad: { name: 'CLI失败', type: 'cli', enabled: true, command: process.execPath, args: CLI_BAD_ARGS },
      coderbusy: { name: 'CLI忙碌', type: 'cli', enabled: true, command: process.execPath, args: CLI_SLEEP_ARGS(1000), maxConcurrent: 1 },
      codertimeout: { name: 'CLI超时', type: 'cli', enabled: true, command: process.execPath, args: CLI_SLEEP_ARGS(5000), timeoutMs: 200 },
      coderacct: { name: 'CLI账号', type: 'cli', enabled: true, account: 'oauth', command: process.execPath, args: CLI_ECHO_ARGS },
      coderout: { name: 'CLI未登录', type: 'cli', enabled: true, command: process.execPath, statusArgs: `-e "process.exit(1)"`, loginArgs: `-e "process.exit(0)"` },
      coderref: { name: 'CLI引用', type: 'cli', enabled: true, cliAgent: 'codexentry' },
      coderbadref: { name: 'CLI坏引用', type: 'cli', enabled: true, cliAgent: 'nope' },
      codexpreset: { name: 'Codex预设', type: 'cli', enabled: true, command: 'codex' },
      off: { name: '关', type: 'chat', enabled: false },
    },
    oauthAccounts: {
      oauth: { name: 'GPT', enabled: true, protocol: 'openai-completions', baseURL: 'https://api.openai.com/v1', tokenRef: 'ROUTER_OAUTH_OAUTH_TOKEN', authUrl: 'https://auth.example/authorize', tokenUrl: 'https://auth.example/token', clientId: 'cid', scope: 'openid', models: ['gpt-4o'] },
      oauth2: { name: 'GPT2', enabled: true, protocol: 'openai-completions', baseURL: 'https://api.openai.com/v1', tokenRef: 'ROUTER_OAUTH_OAUTH2_TOKEN', authUrl: 'https://auth.example/authorize', tokenUrl: 'https://auth.example/token', clientId: 'cid2', models: ['gpt-4o'] },
      puboauth: { name: 'Gemini内置', enabled: true, protocol: 'gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta', tokenRef: 'ROUTER_OAUTH_PUBOAUTH_TOKEN', publicClient: true, authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/generativelanguage', models: ['gemini-2.5-flash'] },
    },
    pools: {
      gpool: { name: 'G池', enabled: true, strategy: 'healthy', accounts: ['oauth2', 'oauth'] },
    },
    cliAgents: {
      codexentry: { name: 'Codex 子代理', enabled: true, command: process.execPath, args: CLI_ECHO_ARGS, statusArgs: `-e "process.exit(0)"`, modelsArgs: `-e "console.log('m1\\nm2')"` },
    },
  })})

  check('isEnabled', service.isEnabled())
  check('normalizeType', service.normalizeType('image') === 'image' && service.normalizeType('speech') === 'speech' && service.normalizeType('cli') === 'cli' && service.normalizeType('bogus') === 'chat')
  check('AGENT_TYPES includes cli', AGENT_TYPES.includes('cli'))
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
  check('catalog lists enabled only', catalog.agents.length === 16 && catalog.agents.every((entry) => entry.id !== 'off'))
  check('catalog effective', catalog.agents.find((entry) => entry.id === 'vision').effectiveModel === 'deepseek-v4-pro')
  check('catalog cli type kept', catalog.agents.find((entry) => entry.id === 'coder').type === 'cli')
  check('catalog cli no main-model leak', catalog.agents.find((entry) => entry.id === 'coder').effectiveModel === '' && catalog.agents.find((entry) => entry.id === 'coder').effectiveProvider === 'cli:coder' && catalog.agents.find((entry) => entry.id === 'coder').source === 'agent')
  check('catalog cli agent reference kept', catalog.agents.find((entry) => entry.id === 'coderref').cliAgent === 'codexentry' && catalog.agents.find((entry) => entry.id === 'coderref').effectiveProvider === 'cli:codexentry')
  check('catalog cli entries', (catalog.cliAgents ?? []).length === 1 && catalog.cliAgents[0].id === 'codexentry' && catalog.cliAgents[0].command === process.execPath)
  check('catalog oauth accounts', catalog.oauthAccounts.length === 3 && catalog.oauthAccounts[0].id === 'oauth' && catalog.oauthAccounts[0].models.length === 1 && catalog.oauthAccounts.find((entry) => entry.id === 'puboauth').publicClient === true)
  check('catalog oauth agent account', catalog.agents.find((entry) => entry.id === 'vchat').account === 'oauth')
  check('catalog pools', catalog.pools.length === 1 && catalog.pools[0].id === 'gpool' && catalog.pools[0].strategy === 'healthy' && catalog.pools[0].accounts.length === 2 && catalog.pools[0].accountHealth.length === 2)
  check('catalog pool agent', catalog.agents.find((entry) => entry.id === 'pchat').account === 'pool:gpool' && catalog.agents.find((entry) => entry.id === 'pchat').source === 'pool')

  // OAuth 账号解析与直连调用
  const vchat = await service.resolveAgent('vchat')
  check('oauth resolve', vchat.mode === 'oauth' && vchat.accountId === 'oauth' && vchat.model === 'gpt-4o' && vchat.provider === 'oauth:oauth')
  const badAccount = await service.resolveAgent('vision')
  check('route resolve unaffected', badAccount.mode === 'route')

  // 账号池解析与策略排序
  const pchat = await service.resolveAgent('pchat')
  check('pool resolve', pchat.mode === 'pool' && pchat.poolId === 'gpool' && pchat.source === 'pool' && pchat.provider === 'oauth:pool:gpool' && pchat.model === 'gpt-4o' && pchat.candidates.length === 2)
  const missingPool = await service.resolveAgent('off')
  check('pool unaffected for disabled agent', missingPool.agent.enabled === false)
  const orderedHealthy = service.orderPoolCandidates('gpool', { strategy: 'healthy' }, pchat.candidates)
  check('pool healthy order', orderedHealthy.length === 2 && orderedHealthy[0].accountId === 'oauth2')
  const orderedUsage = service.orderPoolCandidates('gpool', { strategy: 'usage-lowest' }, pchat.candidates)
  check('pool usage order', orderedUsage.length === 2)
  const rr1 = service.orderPoolCandidates('gpool', { strategy: 'round-robin' }, pchat.candidates)
  const rr2 = service.orderPoolCandidates('gpool', { strategy: 'round-robin' }, pchat.candidates)
  check('pool round robin rotates', rr1.length === 2 && rr2.length === 2 && rr1[0].accountId !== rr2[0].accountId)

  const realFetch = globalThis.fetch
  let tokenRequestBody = ''
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/chat/completions')) {
      const body = JSON.parse(options.body)
      return { ok: true, json: async () => ({ choices: [{ message: { content: `echo:${body.messages[1].content}` } }], usage: { prompt_tokens: 5, completion_tokens: 2 } }) }
    }
    if (String(url).includes('auth.example/token') || String(url).includes('oauth2.googleapis.com/token')) {
      tokenRequestBody = String(options.body ?? '')
      return { ok: true, json: async () => ({ access_token: 't2', expires_in: 3600 }) }
    }
    if (String(url).endsWith('/models')) {
      // Gemini 端点返回 { models: [{ name: "models/<id>" }] }；OpenAI 兼容返回 { data: [{ id }] }。
      return String(url).includes('generativelanguage')
        ? { ok: true, json: async () => ({ models: [{ name: 'models/gemini-2.5-flash' }, { name: 'publishers/google/models/gemini-2.5-pro' }] }) }
        : { ok: true, json: async () => ({ data: [{ id: 'm1' }, { id: 'm2' }] }) }
    }
    return { ok: false, status: 404, text: async () => 'not found' }
  }
  try {
    const oauthResult = await service.run({ agentId: 'vchat', task: '你好', images: [] })
    check('oauth run direct call', oauthResult.kind === 'chat' && oauthResult.text === 'echo:你好' && oauthResult.usage.inputTokens === 5 && oauthResult.usage.outputTokens === 2)
    const exchange = await service.oauthTokenExchange({ accountId: 'oauth', code: 'c1', codeVerifier: 'v1', redirectUri: 'http://localhost/' })
    check('oauth token exchange (manual)', exchange.ok === true && exchange.expiresIn === 3600 && exchange.message.includes('成功') && tokenRequestBody.includes('code_verifier=v1'))

    // 一键授权：oauthBegin 生成授权 URL 并登记会话
    const beginMissing = await service.oauthBegin({ accountId: 'nope', redirectUri: 'http://localhost/router-oauth/callback' })
    check('oauth begin unknown account', beginMissing.ok === false)
    const begin = await service.oauthBegin({ accountId: 'oauth', redirectUri: 'http://localhost/router-oauth/callback' })
    check('oauth begin builds auth url', begin.ok === true && begin.authUrl.includes('response_type=code') && begin.authUrl.includes('client_id=cid') && begin.authUrl.includes('code_challenge_method=S256') && begin.authUrl.includes('scope=openid') && begin.authUrl.includes(`state=${begin.state}`))
    check('oauth begin registers pending', service.oauthPending.get(begin.state)?.accountId === 'oauth' && typeof service.oauthPending.get(begin.state)?.verifier === 'string')

    // 一键授权：回调只带 code+state，宿主自动取回 verifier 完成交换并清除会话
    tokenRequestBody = ''
    const autoExchange = await service.oauthTokenExchange({ code: 'c2', state: begin.state })
    check('oauth token exchange (one-click)', autoExchange.ok === true && tokenRequestBody.includes('grant_type=authorization_code') && tokenRequestBody.includes('code=c2') && tokenRequestBody.includes('redirect_uri=http%3A%2F%2Flocalhost%2Frouter-oauth%2Fcallback') && tokenRequestBody.includes('code_verifier=') && !tokenRequestBody.includes('code_verifier=v1'))
    check('oauth pending consumed', !service.oauthPending.has(begin.state))
    const replay = await service.oauthTokenExchange({ code: 'c3', state: begin.state })
    check('oauth pending replay rejected', replay.ok === false)

    // 内置公开 OAuth Client（零配置一键授权）：8085 回调未就绪时拒绝；
    // 就绪后 authUrl 使用内置 clientId 与固定回调；交换带内置 clientSecret。
    const pubNotReady = await service.oauthBegin({ accountId: 'puboauth', redirectUri: 'http://127.0.0.1:3080/router-oauth/callback' })
    check('oauth begin public client not ready', pubNotReady.ok === false && pubNotReady.message.includes('8085'))
    service.oauthLoopbackReady = true
    const pubBegin = await service.oauthBegin({ accountId: 'puboauth', redirectUri: 'http://127.0.0.1:3080/router-oauth/callback' })
    check('oauth begin public client', pubBegin.ok === true && pubBegin.authUrl.includes('client_id=32555940559.apps.googleusercontent.com') && pubBegin.authUrl.includes('redirect_uri=http%3A%2F%2Flocalhost%3A8085%2F'))
    // 旧 Gemini scope（generativelanguage）已被 Google 拒绝，官方新 scope
    // generative-language.retriever 是受限 scope（公开 client 报 403）；
    // oauthBegin 自动迁移为 cloud-platform（gcloud 同款组合，实测可用）。
    check('oauth begin gemini scope migrated', pubBegin.authUrl.includes('cloud-platform') && !pubBegin.authUrl.includes('retriever') && !pubBegin.authUrl.includes('auth%2Fgenerativelanguage'))
    check('migrateGeminiScope legacy', migrateGeminiScope('https://www.googleapis.com/auth/generativelanguage') === GEMINI_OAUTH_SCOPES)
    check('migrateGeminiScope self-client legacy', migrateGeminiScope('https://www.googleapis.com/auth/generativelanguage', false) === GEMINI_SELF_CLIENT_SCOPES)
    check('migrateGeminiScope strips retriever', migrateGeminiScope('https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/generative-language.retriever') === 'https://www.googleapis.com/auth/cloud-platform' && migrateGeminiScope('https://www.googleapis.com/auth/generative-language.retriever') === GEMINI_OAUTH_SCOPES)
    check('migrateGeminiScope passthrough', migrateGeminiScope('openid email') === 'openid email' && migrateGeminiScope(GEMINI_OAUTH_SCOPES) === GEMINI_OAUTH_SCOPES && migrateGeminiScope('') === '' && migrateGeminiScope('https://www.googleapis.com/auth/generative-language.retriever', false) === 'https://www.googleapis.com/auth/generative-language.retriever')
    tokenRequestBody = ''
    const pubExchange = await service.oauthTokenExchange({ code: 'c4', state: pubBegin.state })
    check('oauth exchange public client', pubExchange.ok === true && tokenRequestBody.includes('client_id=32555940559.apps.googleusercontent.com') && tokenRequestBody.includes('client_secret=ZmssLNjJy2998hD4CTg2ejr2'))
    service.oauthLoopbackReady = false

    const discovered = await service.oauthDiscover({ accountId: 'oauth' })
    check('oauth discover', discovered.ok === true && discovered.models.length === 2 && discovered.models[0] === 'm1')
    const geminiDiscovered = await service.oauthDiscover({ accountId: 'puboauth' })
    check('oauth discover gemini models format', geminiDiscovered.ok === true && geminiDiscovered.models.length === 2 && geminiDiscovered.models[0] === 'gemini-2.5-flash' && geminiDiscovered.models[1] === 'publishers/google/models/gemini-2.5-pro')

    // 账号池失败切换：oauth2 的凭据未配置（resolve 返回 undefined）→ 失败，
    // 自动切换 oauth（凭据已配置）→ 成功；失败尝试记入 oauth2 的健康统计。
    const poolRun = await service.run({ agentId: 'pchat', task: '池测试', images: [] })
    check('pool failover succeeds', poolRun.kind === 'chat' && poolRun.text === 'echo:池测试' && poolRun.usage.inputTokens === 5)
    check('pool failed account recorded', service.accountTotals.get('oauth:oauth2')?.calls === 1 && service.accountTotals.get('oauth:oauth2')?.errors === 1)

    // OAuth 账号（chat 直连）同样按能力接收 files：文本内联进请求体。
    const oauthFilesRun = await service.run({ agentId: 'vchat', task: '总结', images: [], files: ['notes.txt'], exec: { agent: { session: { header: { cwd: 'D:/work/example', delegationDepth: 0 } } } } })
    check('oauth chat files text inlined', oauthFilesRun.kind === 'chat' && oauthFilesRun.text.includes('hello 文本内容'))
  } finally {
    globalThis.fetch = realFetch
  }

  const text = service.promptText()
  check('promptText lists agents', text.includes('vision') && text.includes('draw') && text.includes('route_agent') && !text.includes('off'))
  check('promptText pool meta', text.includes('OAuth 账号池:G池') && text.includes('2 个账号'))
  check('promptText delegation note', text.includes('可读写工作区任意文件') && text.includes('附件按需显式派发'))
  check('promptText cli meta', text.includes('子代理:'))

  // agent 类型委派：prompt 必须携带工作目录注入与图片附件块，子代理收到
  // 附件直接查看而非按路径读文件。
  const fakeParent = { session: { header: { cwd: 'D:/work/example', delegationDepth: 0 } } }
  const delegation = await service.run({
    agentId: 'helper',
    task: '识别这张截图',
    images: [{ id: 'att-1', kind: 'image' }],
    exec: { agent: fakeParent },
  })
  check('agent delegation completes', delegation.kind === 'agent' && delegation.text === '子代理完成')
  check('agent delegation prompt context', delegationRequests.length === 1 && delegationRequests[0].prompt[0].type === 'text' && delegationRequests[0].prompt[0].text.includes('工作目录：D:/work/example') && delegationRequests[0].prompt[0].text.includes('已附带 1 张图片'))
  check('agent delegation carries image block', delegationRequests[0].prompt.some((block) => block.type === 'image' && block.attachment && block.attachment.id === 'att-1'))
  check('agent delegation options', delegationRequests[0].agentOptions.provider === 'openai' && delegationRequests[0].agentOptions.model === 'gpt-4o')
  check('agent delegation denies route_agent', delegationRequests[0].toolFilter && delegationRequests[0].toolFilter.deny && delegationRequests[0].toolFilter.deny.includes('route_agent'))

  // files：agent 类型一次调用显式派发多个不同类型的工作区文件（路径注入子代理）。
  const filesRun = await service.run({
    agentId: 'helper',
    task: '解析这些文件并汇总',
    images: [],
    files: ['report.pdf', 'D:/data/sample.wav'],
    exec: { agent: fakeParent },
  })
  check('files injected into delegation', delegationRequests.length === 2 && delegationRequests[1].prompt[0].text.includes('待处理文件') && delegationRequests[1].prompt[0].text.includes('D:/work/example/report.pdf') && delegationRequests[1].prompt[0].text.includes('D:/data/sample.wav'))
  // files：chat 类型按内容能力化分发——图片经附件服务内联注入、文本内联进
  // task；二进制/目录明确报错；未声明 image 能力的 chat agent 拒绝图片。
  lastChatRequest = null
  const chatFilesRun = await service.run({ agentId: 'vision', task: '看图写摘要', images: [], files: ['shot.png', 'notes.txt'], exec: { agent: fakeParent } })
  check('chat files dispatch succeeds', chatFilesRun.kind === 'chat' && chatFilesRun.text === '你好')
  check('chat files text inlined', lastChatRequest && lastChatRequest.messages[0].content.some((block) => block.type === 'text' && block.text.includes('看图写摘要') && block.text.includes('文件：D:/work/example/notes.txt') && block.text.includes('hello 文本内容')))
  check('chat files image injected', lastChatRequest && lastChatRequest.messages[0].content.some((block) => block.type === 'image' && block.attachment && String(block.attachment.attachmentId).startsWith('att-file-')))
  check('chat files image saved via attachments', savedImages.length === 1 && savedImages[0].name === 'shot.png' && savedImages[0].mediaType === 'image/png')
  // declared 自定义路由（中转）：input 声明是 pi-ai 默认纯文本，不代表模型
  // 真实能力——跳过图片预检由端点裁决（gpt-5.6-luna 场景）。
  const relayRun = await service.run({ agentId: 'relay', task: '看图', images: [{ id: 'att-2', kind: 'image' }], exec: { agent: fakeParent } })
  check('declared route skips image precheck', relayRun.kind === 'chat' && relayRun.text === '你好')
  let chatBinaryRejected = false
  try { await service.run({ agentId: 'vision', task: 'x', images: [], files: ['data.bin'], exec: { agent: fakeParent } }) } catch (error) { chatBinaryRejected = String(error.message).includes('二进制') && String(error.message).includes('agent 类型') }
  check('chat files binary rejected', chatBinaryRejected)
  let chatDirRejected = false
  try { await service.run({ agentId: 'vision', task: 'x', images: [], files: ['somedir'], exec: { agent: fakeParent } }) } catch (error) { chatDirRejected = String(error.message).includes('目录') }
  check('chat files directory rejected', chatDirRejected)
  let chatCapRejected = false
  try { await service.run({ agentId: 'broken', task: 'x', images: [], files: ['shot.png'], exec: { agent: fakeParent } }) } catch (error) { chatCapRejected = String(error.message).includes('image 能力') }
  check('chat files image capability gate', chatCapRejected)
  let imageTypeRejected = false
  try { await service.run({ agentId: 'draw', task: 'x', images: [], files: ['notes.txt'], exec: { agent: fakeParent } }) } catch (error) { imageTypeRejected = String(error.message).includes('仅支持 chat 与 agent') }
  check('files rejected for image type', imageTypeRejected)
  let missingRejected = false
  try { await service.run({ agentId: 'helper', task: 'x', images: [], files: ['missing-file.bin'], exec: { agent: fakeParent } }) } catch (error) { missingRejected = String(error.message).includes('不存在或不可访问') }
  check('files missing path rejected', missingRejected)

  // files URL：宿主下载落盘到工作区 .router-files/ 后注入路径。
  {
    const osModule = await import('node:os')
    const pathModule = await import('node:path')
    const fsModule = await import('node:fs')
    const tmpDir = pathModule.join(osModule.tmpdir(), `dsh-agent-router-smoke-${Date.now()}`)
    const realFetch2 = globalThis.fetch
    globalThis.fetch = async (url) => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer })
    try {
      const urlRun = await service.run({
        agentId: 'helper',
        task: '处理下载的文件',
        images: [],
        files: ['https://example.com/data.csv'],
        exec: { agent: { session: { header: { cwd: tmpDir, delegationDepth: 0 } } } },
      })
      const expectedPath = pathModule.join(tmpDir, '.router-files', 'data.csv')
      check('files url downloaded and injected', delegationRequests.length === 3 && delegationRequests[2].prompt[0].text.includes('待处理文件') && delegationRequests[2].prompt[0].text.includes(expectedPath) && delegationRequests[2].prompt[0].text.includes('已由宿主下载') && fsModule.existsSync(expectedPath))
      let urlRejected = false
      try { await service.run({ agentId: 'helper', task: 'x', images: [], files: ['https://example.com/x.bin'], exec: { agent: { session: { header: { delegationDepth: 0 } } } } }) } catch (error) { urlRejected = String(error.message).includes('需要会话工作目录') }
      check('files url without cwd rejected', urlRejected)
    } finally {
      globalThis.fetch = realFetch2
      fsModule.rmSync(tmpDir, { recursive: true, force: true })
    }
  }

  // cli 类型：无头 CLI 子代理——宿主经系统 shell + 文件重定向执行（node -e
  // 作为被测 CLI），任务经 stdin 文件注入，stdout/stderr 重定向到文件。
  {
    const pathModule = await import('node:path')
    const fsModule = await import('node:fs')
    // 用工作区内的临时目录（受限环境下 os.tmpdir 递归删除会被沙箱拒绝）。
    const tmpDir = pathModule.join(ROOT_DIR, `.tmp-cli-smoke-${Date.now()}`)
    fsModule.mkdirSync(tmpDir, { recursive: true })
    const fakeParentCli = { session: { header: { cwd: tmpDir, delegationDepth: 0 } } }
    try {
      const cliRun = await service.run({ agentId: 'coder', task: 'cli测试', images: [], exec: { agent: fakeParentCli } })
      check('cli run spawns headless process', cliRun.kind === 'cli' && cliRun.text.includes('cli测试') && cliRun.text.includes('工作目录：') && cliRun.text.includes('重试纪律') && cliRun.text.includes('生成或处理图片') && cliRun.text.includes('[角色设定]') && cliRun.text.includes('你是一个测试助手'))
      const cliFilesRun = await service.run({ agentId: 'coder', task: '处理文件', images: [], files: ['notes.txt'], exec: { agent: fakeParentCli } })
      check('cli files paths injected', cliFilesRun.kind === 'cli' && cliFilesRun.text.includes('待处理文件') && cliFilesRun.text.includes('D:/work/example/notes.txt'))
      // 经 cliAgent 引用子代理条目执行：使用条目 command/args，而非 agent 内嵌字段。
      const cliRefRun = await service.run({ agentId: 'coderref', task: '引用运行', images: [], exec: { agent: fakeParentCli } })
      check('cli run via entry reference', cliRefRun.kind === 'cli' && cliRefRun.text.includes('引用运行') && cliRefRun.text.includes('工作目录：'))
      const cliImagesRun = await service.run({ agentId: 'coder', task: '看图', images: [{ id: 'att-1', kind: 'image' }], exec: { agent: fakeParentCli } })
      check('cli images materialized as files', cliImagesRun.kind === 'cli' && cliImagesRun.text.includes('已附带 1 张图片') && fsModule.readdirSync(pathModule.join(tmpDir, '.router-files')).some((name) => name.includes('-img-')))
      let cliBadRejected = false
      try { await service.run({ agentId: 'coderbad', task: 'x', images: [], exec: { agent: fakeParentCli } }) } catch (error) { cliBadRejected = String(error.message).includes('exit 3') && String(error.message).includes('boom') }
      check('cli nonzero exit reported', cliBadRejected)
      const busyRun = service.run({ agentId: 'coderbusy', task: '忙', images: [], exec: { agent: fakeParentCli } })
      let cliBusyRejected = false
      try { await service.run({ agentId: 'coderbusy', task: '再忙', images: [], exec: { agent: fakeParentCli } }) } catch (error) { cliBusyRejected = String(error.message).includes('正忙') }
      check('cli concurrency cap', cliBusyRejected)
      const busyResult = await busyRun
      check('cli busy run completes', busyResult.kind === 'cli' && busyResult.text.includes('SLEPT'))
      let cliTimeoutRejected = false
      const timeoutStarted = Date.now()
      try { await service.run({ agentId: 'codertimeout', task: '超时', images: [], exec: { agent: fakeParentCli } }) } catch (error) { cliTimeoutRejected = String(error.message).includes('超时') }
      check('cli timeout kills process', cliTimeoutRejected && Date.now() - timeoutStarted < 5000)
      let cliNoCwdRejected = false
      try { await service.run({ agentId: 'coder', task: 'x', images: [], exec: { agent: { session: { header: { delegationDepth: 0 } } } } }) } catch (error) { cliNoCwdRejected = String(error.message).includes('会话工作目录') }
      check('cli without cwd rejected', cliNoCwdRejected)
      let cliOauthRejected = false
      try { await service.run({ agentId: 'coderacct', task: 'x', images: [], exec: { agent: fakeParentCli } }) } catch (error) { cliOauthRejected = String(error.message).includes('仅支持 chat') }
      check('cli with oauth account rejected', cliOauthRejected)
      service.killCliChildren()
      check('cli children drained after kill', service.cliChildren.size === 0)
    } finally {
      // 逐个删除文件再删目录（受限环境对递归删除的放行不一致）。
      try {
        const routerFiles = pathModule.join(tmpDir, '.router-files')
        if (fsModule.existsSync(routerFiles)) {
          for (const name of fsModule.readdirSync(routerFiles)) {
            try { fsModule.rmSync(pathModule.join(routerFiles, name), { force: true }) } catch { /* 继续清理其余文件 */ }
          }
          try { fsModule.rmdirSync(routerFiles) } catch { /* 目录可能已被删除 */ }
        }
        // Windows 上被杀进程可能短暂占用目录句柄：重试几次。
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            fsModule.rmdirSync(tmpDir)
            break
          } catch {
            await new Promise((done) => setTimeout(done, 200))
          }
        }
      } catch { /* 沙箱拒绝清理时留待手动删除 */ }
    }
  }

  // resolveCliSpec 与 CLI 输出解析器
  const cliSpec = service.resolveCliSpec({ command: 'codex', args: '', model: 'gpt-5' })
  check('cli spec preset defaults', cliSpec.base === 'codex' && cliSpec.args.includes('--json') && cliSpec.args[cliSpec.args.length - 2] === '-m' && cliSpec.args[cliSpec.args.length - 1] === 'gpt-5')
  const cliSpecOverride = service.resolveCliSpec({ command: 'claude.exe', args: '-p "a b"', model: '' })
  check('cli spec user args override', cliSpecOverride.base === 'claude' && cliSpecOverride.args.length === 2 && cliSpecOverride.args[1] === 'a b')
  const cliSpecJsPath = service.resolveCliSpec({ command: '/opt/tools/codex.js', args: '', model: '' })
  check('cli spec preset from js path', cliSpecJsPath.base === 'codex' && cliSpecJsPath.args.includes('--json'))
  let cliSpecMissing = false
  try { service.resolveCliSpec({ command: '', args: '' }) } catch (error) { cliSpecMissing = String(error.message).includes('command 字段') }
  check('cli spec missing command rejected', cliSpecMissing)
  const cmdInv = service.resolveCliInvocation('codex.cmd', ['-p', 'a b'])
  check('cli invocation cmd shim', cmdInv.executable.toLowerCase().includes('cmd.exe') && cmdInv.argv.length === 4 && cmdInv.argv[3].includes('"-p"') && cmdInv.argv[3].includes('"a b"'))
  const wrappedCmd = wrapCmdLine(cmdInv.argv)
  check('wrapCmdLine outer quotes', wrappedCmd[3] === `"${cmdInv.argv[3]}"` && wrappedCmd.slice(0, 3).join('|') === '/d|/s|/c')
  check('wrapCmdLine passthrough', wrapCmdLine(['-p', 'x']).join('|') === '-p|x' && wrapCmdLine(['/d', '/s', '/c', 'plain'])[3] === 'plain')
  const jsInv = service.resolveCliInvocation('./tool.mjs', ['x'])
  check('cli invocation node script', jsInv.executable === process.execPath && jsInv.argv[0] === './tool.mjs')
  const exeInv = service.resolveCliInvocation(process.execPath, [])
  check('cli invocation direct exe', exeInv.executable === process.execPath && exeInv.argv.length === 0)
  check('extractCodexJsonl item', extractCodexJsonl('{"type":"item","item":{"type":"message","role":"assistant","content":[{"type":"text","text":"hi"}]}}').text === 'hi')
  check('extractCodexJsonl turn', extractCodexJsonl('noise\n{"type":"turn","turn":{"type":"message","status":"completed","content":[{"type":"text","text":"ok"}]}}').text === 'ok')
  check('extractCodexJsonl fallback', extractCodexJsonl('not json').text === 'not json')
  check('extractCliJsonObject result string', extractCliJsonObject('{"result":"done"}').text === 'done')
  check('extractCliJsonObject response field', extractCliJsonObject('{"response":"gem"}').text === 'gem')
  check('extractCliJsonObject nested result', extractCliJsonObject('{"result":{"result":"deep"}}').text === 'deep')
  check('extractCliJsonObject fallback', extractCliJsonObject('plain').text === 'plain')

  // cli 登录状态 / 登录 / 模型列表 RPC
  const coderStatus = await service.cliStatus({ agentId: 'coder' })
  check('cli status logged in', coderStatus.ok === true && coderStatus.loggedIn === true)
  const coderOut = await service.cliStatus({ agentId: 'coderout' })
  check('cli status logged out', coderOut.ok === true && coderOut.loggedIn === false)
  const coderBadStatus = await service.cliStatus({ agentId: 'coderbad' })
  check('cli status unknown command rejected', coderBadStatus.ok === false && coderBadStatus.message.includes('状态命令'))
  const nonCliStatus = await service.cliStatus({ agentId: 'vision' })
  check('cli status non-cli rejected', nonCliStatus.ok === false && nonCliStatus.message.includes('cli'))
  const nonCliLogin = await service.cliLogin({ agentId: 'vision' })
  check('cli login non-cli rejected', nonCliLogin.ok === false && nonCliLogin.message.includes('cli'))
  if (globalThis.process?.platform !== 'win32') {
    const loginOk = await service.cliLogin({ agentId: 'coderout' })
    check('cli login starts process', loginOk.ok === true && loginOk.message.includes('终端窗口'))
  }
  const coderModels = await service.cliModels({ agentId: 'coder' })
  check('cli models from command', coderModels.ok === true && coderModels.models.length === 2 && coderModels.models[0] === 'm1' && coderModels.source === 'cli')
  // 子代理条目：按条目 id 直接探测；专业 agent 经 cliAgent 引用探测。
  const entryStatus = await service.cliStatus({ agentId: 'codexentry' })
  check('cli status by entry id', entryStatus.ok === true && entryStatus.loggedIn === true)
  const refStatus = await service.cliStatus({ agentId: 'coderref' })
  check('cli status via agent reference', refStatus.ok === true && refStatus.loggedIn === true)
  const badRefStatus = await service.cliStatus({ agentId: 'coderbadref' })
  check('cli status bad reference rejected', badRefStatus.ok === false && badRefStatus.message.includes('子代理 "nope" 不存在'))
  const entryModels = await service.cliModels({ agentId: 'codexentry' })
  check('cli models by entry id', entryModels.ok === true && entryModels.models.length === 2 && entryModels.models[0] === 'm1')
  const presetModels = await service.cliModels({ agentId: 'codexpreset' })
  check('cli models preset fallback', presetModels.ok === true && presetModels.source === 'preset' && presetModels.models.includes('gpt-5.4-codex'))
  const nonCliModels = await service.cliModels({ agentId: 'vision' })
  check('cli models non-cli rejected', nonCliModels.ok === false && nonCliModels.message.includes('cli'))
  check('parseClaudeStatus loggedIn', parseClaudeStatus('{"loggedIn":false,"authMethod":"none","apiProvider":"firstParty"}').loggedIn === false)
  check('parseClaudeStatus non-json', parseClaudeStatus('nope') === null)

  const result = await service.runChat(vision, { agentId: 'vision', task: '你好', images: [] })
  check('runChat streams', result.kind === 'chat' && result.text === '你好' && result.usage.inputTokens === 10 && result.usage.outputTokens === 2)

  service.record({ agentId: 'vision', provider: 'deepseek-official', model: 'deepseek-v4-pro', ok: true, ms: 100, inputTokens: 10, outputTokens: 2 })
  service.record({ agentId: 'draw', provider: 'openai', model: 'dall-e-3', ok: false, ms: 200 })
  const stats = service.statsSnapshot()
  check('stats totals', stats.totals.length === 3 && stats.totals.find((t) => t.agentId === 'vision').calls === 1 && stats.totals.find((t) => t.agentId === 'draw').errors === 1 && stats.totals.find((t) => t.agentId === 'pchat').calls === 1)
  check('stats recent', stats.recent.length === 3 && stats.recent[2].agentId === 'pchat')
  check('stats series', stats.series.some((s) => s.agentId === 'vision' && s.buckets.length === 1 && s.buckets[0].outputTokens === 2))
  check('stats account totals', stats.accountTotals.length === 3 && stats.accountTotals.find((a) => a.provider === 'openai').calls === 1 && stats.accountTotals.find((a) => a.provider === 'openai').models.length === 1 && stats.accountTotals.find((a) => a.provider === 'openai').models[0].model === 'dall-e-3' && stats.accountTotals.find((a) => a.provider === 'oauth:oauth2').errors === 1)
  check('stats account series', stats.accountSeries.some((s) => s.provider === 'deepseek-official' && s.buckets.length === 1 && s.buckets[0].inputTokens === 10))

  const test = await service.test({ agentId: 'vision' })
  check('test ping', test.ok === true && test.message.includes('deepseek-official'))
  const testBad = await service.test({ agentId: 'nope' })
  check('test unknown agent', testBad.ok === false)
  const testCli = await service.test({ agentId: 'coder' })
  check('test cli reports login status', testCli.ok === true && testCli.message.includes('登录正常'))

  service.reset()
  check('reset clears', service.statsSnapshot().totals.length === 0)

  check('recentAttachmentBlocks empty', service.recentAttachmentBlocks(null).length === 0)

  // 附件按需显式派发：序号映射 / 越界报错 / includeImages 快捷方式 / 默认不携带。
  {
    const fakeAgent = {
      session: {
        deriveMessages: () => [
          { role: 'user', content: [{ type: 'text', text: '老消息' }] },
          { role: 'user', content: [
            { type: 'text', text: '看图' },
            { type: 'image', attachment: { id: 'att-a' } },
            { type: 'image', attachment: { id: 'att-b' } },
            { type: 'image', attachment: { id: 'att-c' } },
          ] },
          { role: 'assistant', content: [{ type: 'text', text: '收到' }] },
        ],
      },
    }
    const none = service.selectAttachments(fakeAgent)
    check('attachments default none', none.length === 0)
    const picked = service.selectAttachments(fakeAgent, { indices: [2, 0] })
    check('attachments indices map', picked.length === 2 && picked[0].id === 'att-c' && picked[1].id === 'att-a')
    const all = service.selectAttachments(fakeAgent, { includeImages: true })
    check('attachments includeImages', all.length === 3 && all[0].id === 'att-a')
    const merged = service.selectAttachments(fakeAgent, { indices: [1], includeImages: true })
    check('attachments merged dedupe', merged.length === 3 && merged[0].id === 'att-b')
    let threw = false
    try { service.selectAttachments(fakeAgent, { indices: [3] }) } catch (error) { threw = String(error.message).includes('共 3 个附件') }
    check('attachments out of range rejected', threw)
    threw = false
    try { service.selectAttachments(fakeAgent, { indices: [1.5] }) } catch (error) { threw = String(error.message).includes('必须是整数') }
    check('attachments non-integer rejected', threw)
  }

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
    check('tool timeout 20min (covers cli 15min default)', registered.timeoutMs === 20 * 60 * 1000)
    check('tool parameters schema', registered.parameters && registered.parameters.properties && registered.parameters.properties.agent && registered.parameters.properties.task && registered.parameters.properties.attachments && registered.parameters.properties.attachments.type === 'array' && registered.parameters.properties.includeImages)
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
    let webRoute = null
    await root.plugin({ name: 'stub-webserver', apply: (ctx) => ctx.provide('webServer', {
      register: (route) => { webRoute = route; return () => {} },
    }) })
    check('index module declares inject', Array.isArray(indexModule.inject) && indexModule.inject.includes('settings') && indexModule.inject.includes('typert') && indexModule.inject.includes('webServer'))
    const app = root.plugin({ name: 'smoke-index', inject: indexModule.inject, apply: indexModule.apply })
    await app
    check('settings ns router registered', settingsNs && settingsNs.ns === 'router')
    check('typert contribution registered', registeredContribution && registeredContribution.invocations.length === 12 && registeredContribution.package === 'dsh-agent-router')
    check('router service provided', typeof root.get('router') === 'object' && root.get('router') !== null)
    check('oauth callback route registered', webRoute && webRoute.kind === 'exact' && webRoute.path === '/router-oauth/callback' && typeof webRoute.handler === 'function')
    await app.dispose()
  }

  // 客户端 UI 真实渲染（迷你 React 驱动整页，结构断言见 client-render.mjs）。
  console.log('client render:')
  await runClientRender(check)
}

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)


