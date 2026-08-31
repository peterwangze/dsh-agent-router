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

let failures = 0
function check(label, condition) {
  if (condition) console.log(`  ok  ${label}`)
  else { failures++; console.error(`FAIL  ${label}`) }
}

// ── 夹具 ──────────────────────────────────────────────────────────────────
const ACCOUNT_A = {
  name: 'ChatGPT 订阅', enabled: true, preset: 'chatgpt-codex', protocol: 'codex-responses',
  baseURL: '', credentialFile: '', clientId: '', clientSecret: '', publicClient: false,
  authUrl: '', tokenUrl: '', scope: '', models: ['gpt-5.6-sol', 'gpt-5.6-terra'], tokenRef: '',
}
const ACCOUNT_B = {
  name: '二号订阅', enabled: true, preset: 'chatgpt-codex', protocol: 'codex-responses',
  baseURL: '', credentialFile: '', clientId: '', clientSecret: '', publicClient: false,
  authUrl: '', tokenUrl: '', scope: '', models: ['gpt-5.6-terra', 'gpt-5.6-luna'], tokenRef: '',
}
const ACCOUNT_OFF = {
  name: '停用订阅', enabled: false, preset: 'chatgpt-codex', protocol: 'codex-responses',
  baseURL: '', credentialFile: '', clientId: '', clientSecret: '', publicClient: false,
  authUrl: '', tokenUrl: '', scope: '', models: ['gpt-5.6-off'], tokenRef: '',
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
  check('STR-6: assistant tool-call → function_call 回填', input[2].role === 'assistant' && input[2].content[1].type === 'function_call' && input[2].content[1].call_id === 'call-1' && input[2].content[1].name === 'web_search' && input[2].content[1].arguments === '{"q":"x"}')
  check('STR-7: tool-result → 独立 function_call_output item', input[3].type === 'function_call_output' && input[3].call_id === 'call-1' && input[3].output === '结果文本')
  check('STR-8: 带图 user → input_text + input_image（附件经 readImagesAsDataUrls）', input[4].role === 'user' && input[4].content[0].type === 'input_text' && input[4].content[1].type === 'input_image' && input[4].content[1].image_url.startsWith('data:image/png;base64,'))
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

console.log(failures === 0 ? '\nALL EVO-009 DISCRIMINANT TESTS PASSED' : `\n${failures} EVO-009 ASSERTION(S) FAILED (RED — fix pending)`)
process.exit(failures === 0 ? 0 : 1)
