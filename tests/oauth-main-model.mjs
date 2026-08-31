// EVO-009 判别测试：ChatGPT 订阅 OAuth 账号注册为宿主 llm provider（主 agent
// 模型选择器直接选用）。
//
// 需求（用户指令 2026-08-30）：「支持ChatGPT登陆的账号能被主agent进行模型选择，
// 提升易用性」——主 agent 的模型选择器出现「ChatGPT 订阅」组，选中后对话经插件
// OAuth 通路（凭据刷新/代理/SSE）应答，带图与工具调用可用。
//
// 判别：
//   ① 注册判别（旧代码必败）——安装前 llm.listProviders() 不含 chatgpt-oauth；
//      安装后含（旧代码无 lib/oauth-llm.js 模块 → import 失败即 RED，行为断言
//      在安装后全量生效）；
//   ② 模型目录：启用 preset（chatgpt-codex/codex-responses）账号 models 并集
//      镜像（保序去重 + provider 改写 + inputModalities ['text','image'] 账号级
//      声明）；enabled=false 账号不列入；
//   ③ 注销联动：无启用账号 / 总开关关闭 → provider 注销（listProviders 不含）；
//      settings/updated 热同步恢复；
//   ④ 请求形状（fetch stub 锁定）：model / store:false / stream:true /
//      instructions=system / input 完整对话映射（user input_text+input_image、
//      assistant output_text+function_call 回填、tool-result → function_call_
//      output、相对顺序）/ tools → functions / include / 认证头（Bearer +
//      chatgpt-account-id + originator）；
//   ⑤ 宿主 chunk 序列（BlockAssembler 词汇表）：文本块 block-start/text-delta/
//      block-end + function_call → tool-call-delta/block-end + usage + finish(stop)；
//   ⑥ 错误路径：401 → finish(error)（含重登指引）；SSE 无终态 → finish(error)；
//   ⑦ kill-switch：总开关关闭 → listModels 空 + stream finish(error)；
//   ⑧ 统计：record（agentId 'main' / provider 'chatgpt-oauth' / usage 透传 /
//      失败 ok:false + error）；
//   ⑨ prepareCall 显式实现（FIX-001 教训——宿主 adapterStream 每次分发先调
//      prepareCall，缺失即全量断裂）。
//
// 门控：独立运行（node tests/oauth-main-model.mjs），exit 0 全绿。
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import { installOauthLlmAdapters, OAUTH_PROVIDER, OAUTH_PROVIDER_NAME } from '../lib/oauth-llm.js'
// EVO-010（宿主官方 openai-codex 路由迁移）：路由维护/PoC 迁移/注入链/
// transport/parity 判别断言见文件末尾 evo-010 块。
import {
  HOST_ROUTE_NS, HOST_ROUTE_PROVIDER, HOST_ROUTE_REF, HOST_ROUTE_POC_REF,
  HOST_TOKEN_REFRESH_MARGIN_MS, HOST_ROUTE_FAILURE_THRESHOLD,
  planHostRouteMutation, syncHostRoute, hostRouteStatusOf,
} from '../lib/host-route.js'
import { RouterService } from '../lib/service.js'
import { OauthCredentialStore } from '../lib/oauth-credentials.js'
import { oauthAccountSchema, OAUTH_TRANSPORT_VALUES, normalizeTransport } from '../lib/schemas.js'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let failures = 0
function check(label, condition) {
  if (condition) console.log(`  ok  ${label}`)
  else { failures++; console.error(`FAIL  ${label}`) }
}

// ── 夹具 ──────────────────────────────────────────────────────────────────
// EVO-010 返工（F-4）：插件组（chatgpt-oauth）只列 transport='plugin' 账号——
// 默认 transport='host' 账号的模型由宿主官方 openai-codex 组承载。EVO-009
// 判别块夹具显式 transport:'plugin'（验证插件通路）；EVO-010 路由块用
// routeAccount（默认 host）。
const ACCOUNT_A = {
  name: 'ChatGPT 订阅', enabled: true, preset: 'chatgpt-codex', protocol: 'codex-responses',
  baseURL: '', credentialFile: '', clientId: '', clientSecret: '', publicClient: false,
  authUrl: '', tokenUrl: '', scope: '', models: ['gpt-5.6-sol', 'gpt-5.6-terra'], tokenRef: '', transport: 'plugin',
}
const ACCOUNT_B = {
  name: '二号订阅', enabled: true, preset: 'chatgpt-codex', protocol: 'codex-responses',
  baseURL: '', credentialFile: '', clientId: '', clientSecret: '', publicClient: false,
  authUrl: '', tokenUrl: '', scope: '', models: ['gpt-5.6-terra', 'gpt-5.6-luna'], tokenRef: '', transport: 'plugin',
}
const ACCOUNT_OFF = {
  name: '停用订阅', enabled: false, preset: 'chatgpt-codex', protocol: 'codex-responses',
  baseURL: '', credentialFile: '', clientId: '', clientSecret: '', publicClient: false,
  authUrl: '', tokenUrl: '', scope: '', models: ['gpt-5.6-off'], tokenRef: '', transport: 'plugin',
}
const NON_PRESET = {
  name: '通用账号', enabled: true, preset: '', protocol: 'openai-completions',
  baseURL: 'https://example.com/v1', credentialFile: '', clientId: '', clientSecret: '',
  publicClient: false, authUrl: '', tokenUrl: '', scope: '', models: ['gpt-4o'], tokenRef: '',
}

function sseBody(events) {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
}
const okEvents = [
  { type: 'response.output_text.delta', delta: '你好' },
  { type: 'response.output_text.delta', delta: '，世界' },
  { type: 'response.output_item.done', output_index: 0, item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '你好，世界' }] } },
  { type: 'response.output_item.done', output_index: 1, item: { type: 'function_call', call_id: 'call-9', name: 'web_search', arguments: '{"q":"test"}' } },
  { type: 'response.completed', response: { usage: { input_tokens: 11, output_tokens: 7 } } },
]

function makeHarness(accounts, options = {}) {
  const listeners = []
  const proxyCalls = []
  const records = []
  const warns = []
  const fetchCalls = []
  let fetchMode = options.fetchMode ?? 'ok'
  let accountsRef = accounts
  let enabled = options.enabled !== false
  const service = {
    isEnabled: () => enabled,
    getState: () => ({ oauthAccounts: accountsRef, oauthProxyUrl: options.proxyUrl ?? '' }),
    async resolvePresetCredential(account) {
      if (options.loginFailMode) throw new Error('未登录（无凭据文件）')
      return { access: 'ACCESS-TOKEN', accountId: account === ACCOUNT_B ? 'acct-2' : 'acct-1' }
    },
    async loadOauthProxyDispatcher(proxy) { proxyCalls.push(proxy); return undefined },
    async readImagesAsDataUrls(refs) {
      return (refs ?? []).map((ref) => ({ mediaType: ref.mediaType ?? 'image/png', dataUrl: `data:${ref.mediaType ?? 'image/png'};base64,QUFBQQ==` }))
    },
    record(record) { records.push(record) },
    setEnabled(value) { enabled = value },
    setAccounts(value) { accountsRef = value },
    records,
    proxyCalls,
  }
  const root = new Context()
  const llm = new LlmRuntime(root)
  const ctx = {
    get: (key) => (key === 'llm' ? llm : undefined),
    on: (event, fn) => { listeners.push({ event, fn }); return () => {} },
    logger: { warn: (message) => warns.push(String(message)) },
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init })
    if (fetchMode === 'unauthorized') {
      return new Response(JSON.stringify({ error: { message: 'invalid token', code: 'invalid_token' } }), { status: 401 })
    }
    if (fetchMode === 'truncated') {
      return new Response(sseBody([{ type: 'response.output_text.delta', delta: '半截' }]), { status: 200 })
    }
    return new Response(sseBody(okEvents), { status: 200 })
  }
  return {
    llm,
    ctx,
    service,
    listeners,
    fetchCalls,
    records: () => records,
    warns: () => warns,
    proxyCalls,
    setFetchMode: (mode) => { fetchMode = mode },
    cleanup() {
      globalThis.fetch = originalFetch
    },
  }
}

const callStream = async (llm, options) => {
  const chunks = []
  for await (const chunk of llm.stream({ provider: OAUTH_PROVIDER, model: 'gpt-5.6-sol', system: '你是测试助手', messages: [], signal: undefined, ...options })) {
    chunks.push(chunk)
  }
  return chunks
}
const finishOf = (chunks) => chunks.find((chunk) => chunk.type === 'finish')
const userMsg = (text) => ({ role: 'user', content: [{ type: 'text', text }] })
// assistant 消息恒带 source（宿主 createAssistantMessage 契约；forAdapter 读
// message.source.kind——夹具须如实，否则宿主层先行崩溃）。
const assistantMsg = (content, source) => ({ role: 'assistant', content, source: source ?? { kind: 'model', provider: 'deepseek-official', model: 'deepseek-v4-flash' } })

console.log('oauth-main-model provider registration (RED on old code — no module):')
{
  // ① 安装前无注册（旧代码 = 无此模块 → import 即 RED；此处为安装语义判别）。
  const h = makeHarness({ chatgpt: ACCOUNT_A })
  const before = h.llm.listProviders().some((entry) => entry.id === OAUTH_PROVIDER)
  check('REG-0: 安装前 listProviders 不含 chatgpt-oauth（旧代码必败）', before === false)
  const off = installOauthLlmAdapters(h.ctx, h.service)
  const after = h.llm.listProviders()
  check('REG-1: 安装后注册 chatgpt-oauth provider', after.some((entry) => entry.id === OAUTH_PROVIDER))
  check('REG-2: provider 显示名 = ChatGPT 订阅', h.llm.registration(OAUTH_PROVIDER).adapter.providerInfo(OAUTH_PROVIDER).name === OAUTH_PROVIDER_NAME)
  off()
  h.cleanup()
}

console.log('oauth-main-model model catalog (accounts → provider models):')
{
  const h = makeHarness({ chatgpt: ACCOUNT_A, b: ACCOUNT_B, off: ACCOUNT_OFF, generic: NON_PRESET })
  const off = installOauthLlmAdapters(h.ctx, h.service)
  const listed = await h.llm.registration(OAUTH_PROVIDER).adapter.listModels(OAUTH_PROVIDER)
  const ids = listed.map((entry) => entry.id)
  check('CAT-1: 启用账号 models 并集保序去重（含停用/非 preset 排除）', ids.join(',') === 'gpt-5.6-sol,gpt-5.6-terra,gpt-5.6-luna')
  check('CAT-2: 目录条目 provider 改写为 chatgpt-oauth', listed.every((entry) => entry.provider === OAUTH_PROVIDER))
  check('CAT-3: inputModalities 账号级声明 text+image', listed.every((entry) => Array.isArray(entry.inputModalities) && entry.inputModalities.includes('image') && entry.inputModalities.includes('text')))
  const resolved = await h.llm.registration(OAUTH_PROVIDER).adapter.resolveModel(OAUTH_PROVIDER, 'gpt-5.6-sol', undefined)
  check('CAT-4: resolveModel 声明 image（prompt 准入放行带图）', resolved.provider === OAUTH_PROVIDER && Array.isArray(resolved.inputModalities) && resolved.inputModalities.includes('image'))
  check('CAT-5: prepareCall 显式实现并绑定自身（FIX-001 教训）', typeof h.llm.registration(OAUTH_PROVIDER).adapter.prepareCall === 'function')
  // ③ 注销联动：全部停用 → 注销；恢复 → 重注册（settings/updated 驱动）。
  h.service.setAccounts({ off: ACCOUNT_OFF })
  const settingsListener = h.listeners.find((entry) => entry.event === 'settings/updated')
  settingsListener.fn('router')
  check('CAT-6: 无启用账号 → provider 注销', !h.llm.listProviders().some((entry) => entry.id === OAUTH_PROVIDER))
  h.service.setAccounts({ chatgpt: ACCOUNT_A })
  settingsListener.fn('router')
  check('CAT-7: 重新启用 → provider 恢复注册', h.llm.listProviders().some((entry) => entry.id === OAUTH_PROVIDER))
  off()
  h.cleanup()
}

console.log('oauth-main-model stream mapping (host messages → responses request):')
{
  const h = makeHarness({ chatgpt: ACCOUNT_A })
  const off = installOauthLlmAdapters(h.ctx, h.service)
  const chunks = await callStream(h.llm, {
    messages: [
      userMsg('第一轮你好'),
      assistantMsg([{ type: 'text', text: '你好！' }]),
      assistantMsg([{ type: 'text', text: '查一下' }, { type: 'tool-call', id: 'call-1', name: 'web_search', arguments: '{"q":"x"}' }]),
      { role: 'user', content: [{ type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: '结果文本' }], isError: false }] },
      { role: 'user', content: [{ type: 'image', attachment: { attachmentId: 'sha256:abc', mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'shot.png' } }, { type: 'text', text: '看图' }] },
    ],
  })
  check('STR-1: 请求已发出（fetch stub 捕获）', h.fetchCalls.length === 1 && h.fetchCalls[0].url.endsWith('/codex/responses'))
  const body = JSON.parse(h.fetchCalls[0].init.body)
  check('STR-2: 请求形状 model/store/stream/include', body.model === 'gpt-5.6-sol' && body.store === false && body.stream === true && Array.isArray(body.include))
  check('STR-3: instructions = options.system', body.instructions === '你是测试助手')
  const input = body.input
  check('STR-4: user 文本 → input_text', input[0].role === 'user' && input[0].content[0].type === 'input_text' && input[0].content[0].text === '第一轮你好')
  check('STR-5: assistant 文本 → output_text 回填', input[1].role === 'assistant' && input[1].content[0].type === 'output_text' && input[1].content[0].text === '你好！')
  // FIX-017 后结构：混合轮拆为 message(output_text) + 顶层 function_call item。
  check('STR-6: assistant 文本+tool-call 混合轮 → message 文本 + 顶层 function_call（不在 content）', input[2].role === 'assistant' && input[2].content.length === 1 && input[2].content[0].type === 'output_text' && input[2].content[0].text === '查一下' && input[3].type === 'function_call' && input[3].call_id === 'call-1' && input[3].name === 'web_search' && input[3].arguments === '{"q":"x"}')
  check('STR-7: tool-result → 顶层 function_call_output item', input[4].type === 'function_call_output' && input[4].call_id === 'call-1' && input[4].output === '结果文本')
  check('STR-8: 带图 user → input_text + input_image（附件经 readImagesAsDataUrls）', input[5].role === 'user' && input[5].content[0].type === 'input_text' && input[5].content[1].type === 'input_image' && input[5].content[1].image_url.startsWith('data:image/png;base64,'))
  check('STR-9: 认证头（Bearer + chatgpt-account-id + originator 诚实自标识）', h.fetchCalls[0].init.headers.Authorization === 'Bearer ACCESS-TOKEN' && h.fetchCalls[0].init.headers['chatgpt-account-id'] === 'acct-1' && h.fetchCalls[0].init.headers.originator === 'dsh-agent-router')
  // ⑤ 宿主 chunk 序列。
  const types = chunks.map((chunk) => chunk.type)
  check('STR-10: 文本块发射 block-start/text-delta/block-end', chunks[0].type === 'block-start' && chunks[0].blockType === 'text' && chunks[1].type === 'text-delta' && chunks[1].text === '你好，世界' && chunks[2].type === 'block-end')
  const toolDelta = chunks.find((chunk) => chunk.type === 'tool-call-delta')
  check('STR-11: function_call → tool-call-delta（id/name/arguments）', !!toolDelta && toolDelta.id === 'call-9' && toolDelta.name === 'web_search' && toolDelta.argumentsDelta === '{"q":"test"}')
  const usageChunk = chunks.find((chunk) => chunk.type === 'usage')
  check('STR-12: usage chunk 透传', !!usageChunk && usageChunk.usage.inputTokens === 11 && usageChunk.usage.outputTokens === 7)
  check('STR-13: finish stop', finishOf(chunks).reason.kind === 'stop')
  // ⑧ 统计。
  const okRecord = h.records().find((record) => record.ok === true)
  check('STR-14: record agentId=main / provider=chatgpt-oauth / usage 透传', !!okRecord && okRecord.agentId === 'main' && okRecord.provider === OAUTH_PROVIDER && okRecord.model === 'gpt-5.6-sol' && okRecord.inputTokens === 11 && okRecord.outputTokens === 7 && typeof okRecord.ms === 'number')
  off()
  h.cleanup()
}

console.log('oauth-main-model error paths and kill-switch:')
{
  const h = makeHarness({ chatgpt: ACCOUNT_A })
  const off = installOauthLlmAdapters(h.ctx, h.service)
  // ⑥ 401 → finish(error) + 重登指引 + 失败统计。
  h.setFetchMode('unauthorized')
  const badChunks = await callStream(h.llm, { messages: [userMsg('hi')] })
  const badFinish = finishOf(badChunks)
  check('ERR-1: 401 → finish(error)（非泄漏 throw）', badFinish.reason.kind === 'error' && badFinish.reason.failure && badFinish.reason.failure.message.includes('重新登录'))
  const failRecord = h.records().find((record) => record.ok === false)
  check('ERR-2: 失败 record（ok:false + error 留痕，P8 可观测）', !!failRecord && failRecord.agentId === 'main' && failRecord.error.includes('401'))
  // ⑥ SSE 无终态 → finish(error)。
  h.setFetchMode('truncated')
  const truncChunks = await callStream(h.llm, { messages: [userMsg('hi')] })
  const truncFinish = finishOf(truncChunks)
  check('ERR-3: SSE 无终态 → finish(error)（截断可观测）', truncFinish.reason.kind === 'error' && truncFinish.reason.failure.message.includes('终态'))
  // ⑦ kill-switch：总开关关闭 → listModels 空 + stream finish(error)。
  h.service.setEnabled(false)
  h.setFetchMode('ok')
  const offListed = await h.llm.registration(OAUTH_PROVIDER).adapter.listModels(OAUTH_PROVIDER)
  check('KILL-1: 总开关关闭 → listModels 空', offListed.length === 0)
  const killChunks = await callStream(h.llm, { messages: [userMsg('hi')] })
  check('KILL-2: 总开关关闭 → stream finish(error)', finishOf(killChunks).reason.kind === 'error')
  off()
  h.cleanup()
}

console.log('fix-015 empty-models observability (P8 warn, deduped):')
{
  // RCA（2026-08-31 catalog 探活）：oauthAccounts.chatgpt 已登录但 models=[]
  // → modelsOf=0 → sync inactive 分支静默不注册（零观测）——主 agent 选择器
  // 不出现 ChatGPT 无任何诊断。修 1：存在启用+已登录 preset 账号但 models
  // 并集为空 → 发 warn（状态签名去重；未登录不告警——新建未登录账号属正常态）。
  const EMPTY = { ...ACCOUNT_A, models: [] }
  const h = makeHarness({ chatgpt: EMPTY })
  const off = installOauthLlmAdapters(h.ctx, h.service)
  check('F15-1: 启用+已登录+models 空 → provider 不注册', !h.llm.listProviders().some((entry) => entry.id === OAUTH_PROVIDER))
  await new Promise((resolve) => setImmediate(resolve))
  check('F15-2: 同场景发 warn（旧代码无 warn 必败）', h.warns().some((m) => m.includes('chatgpt-oauth provider not registered') && m.includes('empty model lists')))
  // 去重：再次触发 settings/updated → 仍仅一条 warn。
  const settingsListener = h.listeners.find((entry) => entry.event === 'settings/updated')
  settingsListener.fn('router')
  await new Promise((resolve) => setImmediate(resolve))
  check('F15-3: warn 去重（状态未变不刷屏）', h.warns().filter((m) => m.includes('empty model lists')).length === 1)
  // 保存模型 → 注册 + warn 复位（下次空态重新告警）。
  h.service.setAccounts({ chatgpt: ACCOUNT_A })
  settingsListener.fn('router')
  await new Promise((resolve) => setImmediate(resolve))
  check('F15-4: 保存模型后注册 + 空态签名复位', h.llm.listProviders().some((entry) => entry.id === OAUTH_PROVIDER) && h.warns().filter((m) => m.includes('empty model lists')).length === 1)
  h.service.setAccounts({ chatgpt: EMPTY })
  settingsListener.fn('router')
  await new Promise((resolve) => setImmediate(resolve))
  check('F15-5: 空态复发 → 新告警（签名变化重新触发）', h.warns().filter((m) => m.includes('empty model lists')).length === 2)
  off()
  h.cleanup()
  // 未登录 + models 空：不告警（新建未登录账号模型空属正常态）。
  const h2 = makeHarness({ chatgpt: EMPTY }, { loginFailMode: true })
  const off2 = installOauthLlmAdapters(h2.ctx, h2.service)
  await new Promise((resolve) => setImmediate(resolve))
  check('F15-6: 未登录 + models 空 → 不告警', h2.warns().length === 0)
  off2()
  h2.cleanup()
}

console.log('fix-016 tools shape (host-real shape; old code Missing tools[0].name):')
{
  // 用户实证（2026-08-31）：选 gpt-5.6-luna 为主模型发图对话 → HTTP 400
  // "Missing required parameter: 'tools[0].name'"。根因：mapTools 错误嵌套
  // {type:'function', function:{name,…}}，而 codex/responses 契约
  // （OpenAI Responses API）要求 name/description/parameters 顶层。
  // 宿主真实 tool 形状（取证：dsh-system-prompt lib/index.js:254-258 +
  // dsh-llm-pi-ai lib/index.js:1123-1128 双向印证）：{name, description,
  // parameters}——name 必填字符串。夹具精确复刻该形状。
  const h = makeHarness({ chatgpt: ACCOUNT_A })
  const off = installOauthLlmAdapters(h.ctx, h.service)
  const hostTools = [
    { name: 'web_search', description: '搜索网络', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } },
    { name: 'route_agent', description: '路由专业 agent', parameters: { type: 'object', properties: {} } },
  ]
  const chunks = await callStream(h.llm, { messages: [userMsg('用工具查一下')], tools: hostTools })
  const body = JSON.parse(h.fetchCalls[0].init.body)
  const tools = body.tools
  check('F16-1: 请求携带 tools（2 项透传）', Array.isArray(tools) && tools.length === 2)
  check('F16-2: tools[0].name 顶层存在（旧代码 function 嵌套 → 端点 400 必败）', typeof tools[0].name === 'string' && tools[0].name === 'web_search')
  check('F16-3: type=function 且无 function 嵌套残留', tools[0].type === 'function' && !('function' in tools[0]))
  check('F16-4: description/parameters 顶层透传（宿主形状同构）', tools[0].description === '搜索网络' && tools[0].parameters && tools[0].parameters.type === 'object' && tools[1].name === 'route_agent')
  check('F16-5: 工具调用仍经 function_call 往返（SSE 聚合不受影响）', finishOf(chunks).reason.kind === 'stop')
  off()
  h.cleanup()
}

console.log('fix-017 responses contract (top-level items; function_call never in content):')
{
  // 用户复验（2026-08-31 09:37，重启后）：tools[0].name 已过（FIX-016），但
  // 第二步回传历史时 HTTP 400 "Invalid value: 'function_call'. Supported
  // values are: 'input_text', …, 'encrypted_content'."——旧映射把 function_call
  // 塞进 message content（端点 content 枚举不含）。契约取证：端点报错原文 +
  // openai-ruby 官方 SDK（beta_response_input_item.rb——FunctionCall/
  // FunctionCallOutput 顶层 item）+ openai_responses crate Item 枚举。
  // 两轮场景：user → assistant(text+tool-call 混合) → tool result → user 追问。
  const h = makeHarness({ chatgpt: ACCOUNT_A })
  const off = installOauthLlmAdapters(h.ctx, h.service)
  const chunks = await callStream(h.llm, {
    messages: [
      userMsg('第一轮：查天气'),
      assistantMsg([{ type: 'text', text: '好的，我来查' }, { type: 'tool-call', id: 'call-1', name: 'web_search', arguments: '{"q":"weather"}' }]),
      { role: 'user', content: [{ type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: '晴 25°C' }], isError: false }] },
      userMsg('好的，第二轮继续'),
    ],
  })
  const body = JSON.parse(h.fetchCalls[0].init.body)
  const input = body.input
  check('F17-1: input 顶层 5 个 item（user/assistant/function_call/function_call_output/user）', Array.isArray(input) && input.length === 5)
  check('F17-2: assistant 文本 → message item content=[output_text]', input[1].role === 'assistant' && Array.isArray(input[1].content) && input[1].content.length === 1 && input[1].content[0].type === 'output_text' && input[1].content[0].text === '好的，我来查')
  check('F17-3: tool-call → 顶层 function_call item（绝不在 content）', input[2].type === 'function_call' && input[2].call_id === 'call-1' && input[2].name === 'web_search' && input[2].arguments === '{"q":"weather"}')
  check('F17-4: tool result → 顶层 function_call_output item（call_id 对应）', input[3].type === 'function_call_output' && input[3].call_id === 'call-1' && input[3].output === '晴 25°C')
  check('F17-5: 追问 user → message item（顺序保持）', input[4].role === 'user' && input[4].content[0].type === 'input_text' && input[4].content[0].text === '好的，第二轮继续')
  // 契约快照（端点报错原文枚举）：所有 content 块 type ∈ 合法集合，且
  // function_call item 无 content 数组——旧代码（function_call 在 content）必败。
  const legalContent = ['input_text', 'input_image', 'input_audio', 'output_text', 'refusal', 'input_file', 'computer_screenshot', 'summary_text', 'encrypted_content']
  let allLegal = true
  for (const item of input) {
    if (item && typeof item === 'object' && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (!legalContent.includes(part.type)) allLegal = false
      }
    }
    if (item && item.type === 'function_call' && Array.isArray(item.content)) allLegal = false
  }
  check('F17-6: 契约快照——所有 content 块 type ∈ 端点枚举且 function_call 无 content（旧代码必败）', allLegal)
  check('F17-7: 流式调用不受影响（SSE 聚合 + finish stop）', finishOf(chunks).reason.kind === 'stop')
  off()
  h.cleanup()
}

// ── EVO-010：宿主官方 openai-codex 路由迁移（凭据桥 + 路由维护者）────────
//
// 断言计数口径（F-5 对齐）：本文件全部 check() 计数 = 实测为准（R0 申报
// 「evo-010 块 31 断言」vs 实测 27——偏差已核准：口径 = 顶层 check() 数，
// 非叶子条件数；返工后含 rework 块计数随运行输出标注）。
//
// 判别面（实施依据 .governance/arch-003-bridge-poc.md 实施要点五条）：
//   ROUTE-* 路由自动维护：settings.mutate('llm-pi-ai') 写
//     providers['openai-codex'] = { apiKeyEnv: 'DSH_ROUTER_OPENAI_CODEX' }；
//     无启用账号/总开关关 → unset；用户手改 → 不覆盖 + 诊断事件；
//     PoC ref 接管迁移（DSH_ROUTER_POC_OPENAI_CODEX → 正式 ref + 清理）。
//   INJ-* token 热注入（唯一刷新者）：刷新回调 → credentials.set(ref, token)；
//     值不同才写（diff-only）；注入失败 → warn + 事件 + 不写条目（fail-closed）。
//   TRA-* transport 字段：'host'|'plugin'（默认 host）；plugin 账号排除出路由
//     维护；host/plugin 切换不改 OAUTH_PROVIDER 注册；连续 3 次失败 → 降级
//     事件 + 提示但不静默改用户配置字段（用户主权，FIX-002 教训）。
//   PAR-* parity 守卫（P9）：探活 resolveModelInfo 必须含目录事实
//     （context.contextWindow 正整数 = pi-ai 内置 codex 目录形状——手写适配器
//     resolveModel 无 context 字段，构成判别面）；探活失败 → 回滚条目 + warn。
// 事件面注记：host_route_* 断言读 service.hostRouteEvents 独立环（C-9 的
// oauthEvents 登录旅程环保持专用语义——smoke 既有 journey-order 契约不受
// 维护事件污染，EVO-010 实测教训）。

/** 写一个合法凭据文档到临时目录（presetLoggedInOf/resolvePresetCredential 读面）。 */
function seedCredentialFile(dir, overrides = {}) {
  const file = join(dir, `cred-${Math.random().toString(36).slice(2)}.json`)
  const doc = {
    version: 1,
    credential: {
      type: 'oauth', access: 'ACCESS-TOKEN', refresh: 'REFRESH-TOKEN',
      expires: Date.now() + 3600_000, accountId: 'acct-1', ...overrides,
    },
  }
  writeFileSync(file, JSON.stringify(doc))
  return file
}

/** EVO-010 路由夹具：settings/credentials/llm 三 seam mock + 真 RouterService。
 *  emitEvents=true：settings.mutate 后发射 settings/updated(llm-pi-ai) 事件
 *  （模拟宿主 diff-gated commit 事件——F-1 回环判别所需；reviewer 指出的
 *  既有夹具盲区）；settingsMutateFails=true：mutate 抛错（F-7 mutate 拒绝
 *  判别）。 */
function makeRouteHarness({ accounts, enabled = true, entry, parity = 'ok', tokenInRef, setFails = false, emitEvents = false, settingsMutateFails = false } = {}) {
  const calls = []
  const warns = []
  const providers = entry === undefined ? {} : { [HOST_ROUTE_PROVIDER]: entry }
  const settings = {
    get: (ns) => (ns === HOST_ROUTE_NS ? { providers } : undefined),
    mutate: async (ns, ops) => {
      calls.push({ kind: 'settings.mutate', ns, ops })
      if (ns !== HOST_ROUTE_NS) throw new Error(`unexpected ns ${ns}`)
      if (settingsMutateFails) throw new Error('settings mutate 被拒（assertServiceable）')
      for (const op of ops) {
        if (op.path[0] === 'providers' && op.path[1] === HOST_ROUTE_PROVIDER) {
          if (op.op === 'unset') delete providers[HOST_ROUTE_PROVIDER]
          else providers[HOST_ROUTE_PROVIDER] = op.value
        }
      }
      if (emitEvents) root.emit('settings/updated', HOST_ROUTE_NS)
      return true
    },
  }
  const credentials = {
    resolve: async (ref) => (tokenInRef === undefined ? undefined : { value: tokenInRef }),
    set: async (ref, value) => {
      calls.push({ kind: 'credentials.set', ref, value })
      if (setFails) throw new Error('credentials store 写入失败')
      tokenInRef = value
    },
    unset: async (ref) => { calls.push({ kind: 'credentials.unset', ref }) },
  }
  const llm = parity === 'ok'
    ? {
        listModels: async (provider) => [{ provider, id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', inputModalities: ['text', 'image'] }],
        resolveModelInfo: async (provider, id) => ({ provider, id, name: 'GPT-5.6 Sol', inputModalities: ['text', 'image'], context: { contextWindow: 272000 }, reasoning: { efforts: [{ id: 'high', name: 'High' }] } }),
      }
    : {
        listModels: async () => [],
        resolveModelInfo: async (provider, id) => ({ provider, id, name: 'GPT-5.6 Sol' }),
      }
  // 真 RouterService 需要 cordis Context（TypertRemoteService 构造契约，
  // rpc-shadow-guard 先例）——三个 seam 以 reflect.provide 注入 mock。
  const root = new Context()
  root.reflect.provide('settings', settings)
  root.reflect.provide('credentials', credentials)
  root.reflect.provide('llm', llm)
  root.logger = { warn: (message) => warns.push(String(message)) }
  const service = new RouterService(root, { enabled, oauthAccounts: accounts })
  return { service, ctx: root, calls, warns, providers, settings, credentials, emit: (ns) => root.emit('settings/updated', ns) }
}

/** 带临时凭据文件的启用账号（transport 可覆写）。 */
function routeAccount(dir, overrides = {}) {
  return {
    name: 'ChatGPT 订阅', enabled: true, preset: 'chatgpt-codex', protocol: 'codex-responses',
    baseURL: 'https://chatgpt.com/backend-api', credentialFile: seedCredentialFile(dir),
    clientId: '', clientSecret: '', publicClient: false, authUrl: '', tokenUrl: '', scope: '',
    models: ['gpt-5.6-sol', 'gpt-5.6-terra'], tokenRef: '', ...overrides,
  }
}

console.log('evo-010 host route maintenance (settings llm-pi-ai providers entry):')
{
  const dir = mkdtempSync(join(tmpdir(), 'evo010-route-'))
  // ROUTE-0：ref 命名规范（与 PoC 衔接）+ 任务常量。
  check('ROUTE-0: 正式 ref 命名规范 DSH_ROUTER_OPENAI_CODEX（PoC ref 接管前提）', HOST_ROUTE_REF === 'DSH_ROUTER_OPENAI_CODEX' && HOST_ROUTE_POC_REF === 'DSH_ROUTER_POC_OPENAI_CODEX' && HOST_ROUTE_NS === 'llm-pi-ai' && HOST_ROUTE_PROVIDER === 'openai-codex')
  check('ROUTE-0b: 刷新 margin 60s + 降级阈值 3（任务常量）', HOST_TOKEN_REFRESH_MARGIN_MS === 60_000 && HOST_ROUTE_FAILURE_THRESHOLD === 3)
  // 纯计划函数矩阵。
  const set = (value) => [{ op: 'set', path: ['providers', HOST_ROUTE_PROVIDER], value }]
  const unset = [{ op: 'unset', path: ['providers', HOST_ROUTE_PROVIDER] }]
  check('ROUTE-P1: 无条目+maintain → create', planHostRouteMutation(undefined, { maintain: true, ref: HOST_ROUTE_REF }).action === 'create' && JSON.stringify(planHostRouteMutation(undefined, { maintain: true, ref: HOST_ROUTE_REF }).ops) === JSON.stringify(set({ apiKeyEnv: HOST_ROUTE_REF })))
  check('ROUTE-P2: 恰为自有条目 → idle（幂等零写入）', planHostRouteMutation({ apiKeyEnv: HOST_ROUTE_REF }, { maintain: true, ref: HOST_ROUTE_REF }).action === 'idle' && planHostRouteMutation({ apiKeyEnv: HOST_ROUTE_REF }, { maintain: true, ref: HOST_ROUTE_REF }).ops.length === 0)
  check('ROUTE-P3: PoC 条目 → migrate（接管，避免双条目）', planHostRouteMutation({ apiKeyEnv: HOST_ROUTE_POC_REF }, { maintain: true, ref: HOST_ROUTE_REF }).action === 'migrate' && JSON.stringify(planHostRouteMutation({ apiKeyEnv: HOST_ROUTE_POC_REF }, { maintain: true, ref: HOST_ROUTE_REF }).ops) === JSON.stringify(set({ apiKeyEnv: HOST_ROUTE_REF })))
  check('ROUTE-P4: 用户手改（额外字段/外来 ref）→ user-modified 零 ops', planHostRouteMutation({ apiKeyEnv: HOST_ROUTE_REF, models: ['x'] }, { maintain: true, ref: HOST_ROUTE_REF }).action === 'user-modified' && planHostRouteMutation({ apiKeyEnv: 'USER_OWN_REF' }, { maintain: true, ref: HOST_ROUTE_REF }).action === 'user-modified' && planHostRouteMutation({ apiKeyEnv: 'USER_OWN_REF' }, { maintain: true, ref: HOST_ROUTE_REF }).ops.length === 0)
  check('ROUTE-P5: 停用 → unset 自有/PoC 条目；无条目 → idle', planHostRouteMutation({ apiKeyEnv: HOST_ROUTE_REF }, { maintain: false, ref: HOST_ROUTE_REF }).action === 'unset' && JSON.stringify(planHostRouteMutation({ apiKeyEnv: HOST_ROUTE_REF }, { maintain: false, ref: HOST_ROUTE_REF }).ops) === JSON.stringify(unset) && planHostRouteMutation(undefined, { maintain: false, ref: HOST_ROUTE_REF }).action === 'idle')
  // ROUTE-1（RED on old code）：有启用账号 → mutate 收到 openai-codex 条目。
  const h1 = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir) } })
  await syncHostRoute(h1.ctx, h1.service)
  const mut1 = h1.calls.filter((call) => call.kind === 'settings.mutate')
  check('ROUTE-1: 有启用账号 → llm-pi-ai ns 收到 providers/openai-codex set（ref 正确）', mut1.length === 1 && mut1[0].ns === HOST_ROUTE_NS && mut1[0].ops[0].op === 'set' && mut1[0].ops[0].path.join('.') === `providers.${HOST_ROUTE_PROVIDER}` && mut1[0].ops[0].value.apiKeyEnv === HOST_ROUTE_REF)
  check('ROUTE-1b: 注入先行（token 先于条目落位——PoC 教训：条目不得指向空 ref）', h1.calls.findIndex((call) => call.kind === 'credentials.set') < h1.calls.findIndex((call) => call.kind === 'settings.mutate') && h1.calls.some((call) => call.kind === 'credentials.set' && call.ref === HOST_ROUTE_REF && call.value === 'ACCESS-TOKEN'))
  // ROUTE-2：幂等——二连跑零 mutate。
  await syncHostRoute(h1.ctx, h1.service)
  check('ROUTE-2: 二连跑幂等（条目恰为自有 → 零 mutate）', h1.calls.filter((call) => call.kind === 'settings.mutate').length === 1)
  // ROUTE-3：无启用账号 → unset。
  const h3 = makeRouteHarness({ accounts: {}, entry: { apiKeyEnv: HOST_ROUTE_REF } })
  await syncHostRoute(h3.ctx, h3.service)
  check('ROUTE-3: 无启用账号 → unset 条目', h3.providers[HOST_ROUTE_PROVIDER] === undefined && h3.calls.some((call) => call.kind === 'settings.mutate' && call.ops[0].op === 'unset'))
  // ROUTE-4：总开关关 → unset。
  const h4 = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir) }, enabled: false, entry: { apiKeyEnv: HOST_ROUTE_REF } })
  await syncHostRoute(h4.ctx, h4.service)
  check('ROUTE-4: 总开关关 → unset 条目', h4.providers[HOST_ROUTE_PROVIDER] === undefined)
  // ROUTE-5：用户手改 → 不覆盖 + 诊断事件。
  const h5 = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir) }, entry: { apiKeyEnv: 'USER_OWN_REF', models: ['my-model'] } })
  await syncHostRoute(h5.ctx, h5.service)
  check('ROUTE-5: 用户手改条目 → 不覆盖（mutate 零调用）+ 事件 + warn', h5.calls.filter((call) => call.kind === 'settings.mutate').length === 0 && h5.providers[HOST_ROUTE_PROVIDER].apiKeyEnv === 'USER_OWN_REF' && h5.service.hostRouteEvents.some((event) => event.kind === 'host_route_user_modified') && h5.warns.some((message) => message.includes('openai-codex')))
  // ROUTE-6：PoC 条目接管迁移 + PoC ref 凭据清理。
  const h6 = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir) }, entry: { apiKeyEnv: HOST_ROUTE_POC_REF }, tokenInRef: 'POC-TOKEN' })
  await syncHostRoute(h6.ctx, h6.service)
  check('ROUTE-6: PoC 条目接管 → 正式 ref 落位 + credentials.unset(POC ref) + 事件', h6.providers[HOST_ROUTE_PROVIDER]?.apiKeyEnv === HOST_ROUTE_REF && h6.calls.some((call) => call.kind === 'credentials.unset' && call.ref === HOST_ROUTE_POC_REF) && h6.service.hostRouteEvents.some((event) => event.kind === 'host_route_poc_migrated'))
  console.log('evo-010 token injection chain (single-writer discipline):')
  // INJ-2：注入失败 → warn + 事件 + 不写条目（fail-closed）。
  const h8 = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir) }, setFails: true })
  await syncHostRoute(h8.ctx, h8.service)
  check('INJ-2: 注入失败 → warn + 事件 + 条目不落位（fail-closed）', h8.providers[HOST_ROUTE_PROVIDER] === undefined && h8.warns.some((message) => message.includes('openai-codex')) && h8.service.hostRouteEvents.some((event) => event.kind === 'host_route_token_inject_fail'))
  // INJ-3：ref 值已相同 → diff-only 不重复写。
  const h9 = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir) }, tokenInRef: 'ACCESS-TOKEN', entry: { apiKeyEnv: HOST_ROUTE_REF } })
  await syncHostRoute(h9.ctx, h9.service)
  check('INJ-3: ref 值相同 → 零 credentials.set（diff-only）', !h9.calls.some((call) => call.kind === 'credentials.set'))
  // INJ-1：刷新回调 → credentials.set(ref, 新 token)（唯一刷新者同步宿主 ref）。
  const h10 = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir, { credentialFile: seedCredentialFile(dir, { expires: Date.now() + 10_000 }) }) } })
  h10.service.oauthCredentialStores.set(h10.service.getState().oauthAccounts.chatgpt.credentialFile, new OauthCredentialStore(h10.service.getState().oauthAccounts.chatgpt.credentialFile, {
    fetchImpl: async () => new Response(JSON.stringify({ access_token: 'NEW-ACCESS', refresh_token: 'NEW-REFRESH', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } }),
  }))
  await h10.service.resolvePresetCredential(h10.service.getState().oauthAccounts.chatgpt)
  check('INJ-1: 刷新回调 → credentials.set(DSH_ROUTER_OPENAI_CODEX, 新 access)', h10.calls.some((call) => call.kind === 'credentials.set' && call.ref === HOST_ROUTE_REF && call.value === 'NEW-ACCESS'))
  // TRA-5：plugin 通路账号刷新 → 不写宿主 ref（排除出路由维护）。
  const h11 = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir, { transport: 'plugin', credentialFile: seedCredentialFile(dir, { expires: Date.now() + 10_000 }) }) } })
  h11.service.oauthCredentialStores.set(h11.service.getState().oauthAccounts.chatgpt.credentialFile, new OauthCredentialStore(h11.service.getState().oauthAccounts.chatgpt.credentialFile, {
    fetchImpl: async () => new Response(JSON.stringify({ access_token: 'NEW-ACCESS-2', refresh_token: 'NEW-REFRESH-2', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } }),
  }))
  await h11.service.resolvePresetCredential(h11.service.getState().oauthAccounts.chatgpt)
  check('TRA-5: transport=plugin 账号刷新 → 不写宿主 ref', !h11.calls.some((call) => call.kind === 'credentials.set'))
  console.log('evo-010 transport field and degradation chain:')
  // TRA-1：schema 默认值 + 枚举。
  check('TRA-1: transport schema 默认 host，枚举 host|plugin，normalize 未知值归 host', oauthAccountSchema({}).transport === 'host' && JSON.stringify(OAUTH_TRANSPORT_VALUES) === JSON.stringify(['host', 'plugin']) && normalizeTransport('plugin') === 'plugin' && normalizeTransport('host') === 'host' && normalizeTransport('zzz') === 'host' && normalizeTransport(undefined) === 'host')
  // TRA-2：唯一账号 plugin → unset 条目；OAUTH_PROVIDER 注册不变。
  const h12 = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir, { transport: 'plugin' }) }, entry: { apiKeyEnv: HOST_ROUTE_REF } })
  const runtimeRoot = new Context()
  const runtimeLlm = new LlmRuntime(runtimeRoot)
  const runtimeCtx = { get: (key) => (key === 'llm' ? runtimeLlm : undefined), on: () => () => {}, logger: { warn: () => {} } }
  const off12 = installOauthLlmAdapters(runtimeCtx, h12.service)
  check('TRA-2a: OAUTH_PROVIDER 适配器已注册（并存前提）', runtimeLlm.listProviders().some((entry) => entry.id === OAUTH_PROVIDER))
  await syncHostRoute(h12.ctx, h12.service)
  check('TRA-2b: 唯一账号 transport=plugin → 官方条目 unset（排除出维护）', h12.providers[HOST_ROUTE_PROVIDER] === undefined)
  check('TRA-2c: transport 切换不改 OAUTH_PROVIDER 注册（降级随时可切，零重启）', runtimeLlm.listProviders().some((entry) => entry.id === OAUTH_PROVIDER))
  off12()
  // PAR-1：parity 探活失败 → 回滚条目 + warn + 事件 + 计数。
  const h13 = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir) }, parity: 'fail' })
  await syncHostRoute(h13.ctx, h13.service)
  check('PAR-1: parity 探活失败 → 条目回滚（不写）+ warn + 事件', h13.providers[HOST_ROUTE_PROVIDER] === undefined && h13.warns.some((message) => message.includes('openai-codex')) && h13.service.hostRouteEvents.some((event) => event.kind === 'host_route_parity_fail') && hostRouteStatusOf(h13.service).failures === 1)
  // TRA-3：连续 3 次失败 → 降级事件 + 提示，但用户配置字段不被静默改写。
  const h14 = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir) }, parity: 'fail' })
  await syncHostRoute(h14.ctx, h14.service)
  await syncHostRoute(h14.ctx, h14.service)
  await syncHostRoute(h14.ctx, h14.service)
  const status14 = hostRouteStatusOf(h14.service)
  const touchedAccounts = h14.calls.some((call) => call.kind === 'settings.mutate' && call.ops.some((op) => op.path[0] === 'oauthAccounts'))
  check('TRA-3: 连续 3 次失败 → host_route_degraded 事件 + degraded 状态 + 提示', h14.service.hostRouteEvents.some((event) => event.kind === 'host_route_degraded') && status14.degraded === true && typeof status14.notice === 'string' && status14.notice.length > 0)
  check('TRA-3b: 自动降级只报警不静默改配置（零 oauthAccounts mutate——用户主权）', touchedAccounts === false && h14.service.getState().oauthAccounts.chatgpt.transport !== 'plugin')
  // STA-1：状态面（catalog 消费）。
  const h15 = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir) } })
  await syncHostRoute(h15.ctx, h15.service)
  const status15 = hostRouteStatusOf(h15.service)
  const catalog15 = await h15.service.catalog()
  check('STA-1: hostRouteStatus 形状（maintained/ref/accountId/tokenInjected/degraded）', status15.maintained === true && status15.ref === HOST_ROUTE_REF && status15.accountId === 'chatgpt' && status15.tokenInjected === 'ok' && status15.degraded === false)
  check('STA-2: catalog 下发 openaiCodexRoute + oauthAccounts.transport 镜像', catalog15.openaiCodexRoute?.ref === HOST_ROUTE_REF && catalog15.openaiCodexRoute?.maintained === true && catalog15.oauthAccounts[0].transport === 'host')
}

console.log('evo-010 R0 rework (F-1 loop gate / F-2 queue tick / F-3 ref cleanup / F-4 transport filter / F-7 mutate rejection):')
{
  const dir = mkdtempSync(join(tmpdir(), 'evo010-rework-'))
  // F-1（P1 必修）：parity 持败 + 宿主 diff-gated commit 事件发射（夹具
  // emitEvents——R0 指出的既有夹具盲区）→ llm 事件 pass 在失败态 gate 写入：
  // mutate 次数有界（boot 首跑写+回滚 = 2；此后每事件 pass 零写入）。
  // 旧代码：每事件 pass 又写+回滚（+2）→ 事件→写入→事件 指数增长 → 必败。
  const h21 = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir) }, parity: 'fail', emitEvents: true })
  h21.service.hostRouteTickMs = 60_000 // 测试窗口内不触发 tick——纯事件驱动面
  const off21 = h21.service.startHostRouteMaintenance()
  await new Promise((resolve) => setTimeout(resolve, 40))
  for (let i = 0; i < 5; i++) { h21.emit(HOST_ROUTE_NS); await new Promise((resolve) => setTimeout(resolve, 25)) }
  const mut21 = h21.calls.filter((call) => call.kind === 'settings.mutate').length
  check('F1-1: parity 持败事件流 → mutate 次数有界（≤2——旧代码指数增长必败）', mut21 <= 2 && h21.providers[HOST_ROUTE_PROVIDER] === undefined)
  check('F1-2: 事件 pass 失败态 gate（lastAction=gated，零写入收敛）', h21.service.hostRouteState.lastAction === 'gated')
  off21()
  // F-1 恢复面：tick（'tick' 触发不 gate）在失败态仍重试写入——改成功后
  // 自愈（失败清零 → 事件恢复响应）。parity 无法在 harness 中切换，以
  // 「tick pass 不受 gate」行为断言（hostRouteTickMs 注入驱动）。
  const h21b = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir) }, parity: 'ok' })
  h21b.service.hostRouteTickMs = 25
  const off21b = h21b.service.startHostRouteMaintenance()
  await new Promise((resolve) => setTimeout(resolve, 120))
  check('F1-3: tick 驱动维护自愈生效（条目在 + 写收敛幂等）', h21b.providers[HOST_ROUTE_PROVIDER]?.apiKeyEnv === HOST_ROUTE_REF && h21b.calls.filter((call) => call.kind === 'settings.mutate').length <= 2)
  off21b()
  // F-2（tick 旁路串行队列）：tick 回调改走 queueHostRouteSync（runHostRouteTick
  // 已移除——静态核验：host-route.js 不再导出）；行为保持断言：短 tick 注入下
  // 维护照常（F1-3 已覆盖 tick 生效面）——并发交错判别在 mock 下不可构造
  // （宿主事件真实时序），以代码审查面 + 行为保持闭环，如实标注。
  // F-3（HOST_ROUTE_REF 凭据残留）：maintain=false（停用）→ 条目 unset +
  // ref 凭据 unset（数据主权——旧代码凭据滞留必败）。
  const h23 = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir) }, entry: { apiKeyEnv: HOST_ROUTE_REF }, tokenInRef: 'STALE-TOKEN' })
  await syncHostRoute(h23.ctx, h23.service, 'user')
  h23.calls.length = 0
  h23.service.getState().oauthAccounts.chatgpt.enabled = false
  await syncHostRoute(h23.ctx, h23.service, 'user')
  check('F3-1: 停用后条目 unset + HOST_ROUTE_REF 凭据清理（数据主权）', h23.providers[HOST_ROUTE_PROVIDER] === undefined && h23.calls.some((call) => call.kind === 'credentials.unset' && call.ref === HOST_ROUTE_REF))
  // F-4（transport 过滤插件组）：host 账号不注册 chatgpt-oauth；plugin 账号注册。
  const h24 = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir) } }) // 默认 host
  const runtimeRoot24 = new Context()
  const runtimeLlm24 = new LlmRuntime(runtimeRoot24)
  const runtimeCtx24 = { get: (key) => (key === 'llm' ? runtimeLlm24 : undefined), on: () => () => {}, logger: { warn: () => {} } }
  const off24 = installOauthLlmAdapters(runtimeCtx24, h24.service)
  check('F4-1: transport=host 账号 → 插件组不注册（旧代码必注册必败）', !runtimeLlm24.listProviders().some((entry) => entry.id === OAUTH_PROVIDER))
  off24()
  const h24b = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir, { transport: 'plugin' }) } })
  const runtimeRoot24b = new Context()
  const runtimeLlm24b = new LlmRuntime(runtimeRoot24b)
  const runtimeCtx24b = { get: (key) => (key === 'llm' ? runtimeLlm24b : undefined), on: () => () => {}, logger: { warn: () => {} } }
  const off24b = installOauthLlmAdapters(runtimeCtx24b, h24b.service)
  check('F4-2: transport=plugin 账号 → 插件组注册（降级通路可用）', runtimeLlm24b.listProviders().some((entry) => entry.id === OAUTH_PROVIDER))
  off24b()
  // F-7（mutate 拒绝可观测，P8 口径统一）：settings.mutate 被拒 → 失败计数 +
  // 事件 + warn（旧代码异常外溢 → 直驱调用 throw 崩溃 → 必败）。
  const h25 = makeRouteHarness({ accounts: { chatgpt: routeAccount(dir) }, settingsMutateFails: true })
  await syncHostRoute(h25.ctx, h25.service)
  check('F7-1: mutate 拒绝 → 失败计数 + 事件 + warn（P8 统一链路）', hostRouteStatusOf(h25.service).failures === 1 && h25.service.hostRouteEvents.some((event) => event.kind === 'host_route_maintain_fail') && h25.warns.some((message) => message.includes('openai-codex')))
  rmSync(dir, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL EVO-009/EVO-010 DISCRIMINANT TESTS PASSED' : `\n${failures} ASSERTION(S) FAILED (RED — fix pending)`)
process.exit(failures === 0 ? 0 : 1)
