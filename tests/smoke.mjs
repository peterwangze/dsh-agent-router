// dsh-agent-router 冒烟测试：模块解析 + schema 默认值 + RPC 校验器 + 服务核心逻辑。
import { Context } from '@deepseek-ai/cordis'
import { routerSchema, wireCodecs, MODALITY_VALUES, MODALITY_DIRECTIONS, normalizeCapabilities, OAUTH_PRESET_VALUES } from '../lib/schemas.js'
import { createHostContribution, ROUTER_REMOTE } from '../lib/rpc.js'
import { RouterService, AGENT_TYPES, errorMessage, GEMINI_OAUTH_SCOPES, GEMINI_SELF_CLIENT_SCOPES, migrateGeminiScope, extractCodexJsonl, extractCliJsonObject, parseClaudeStatus, wrapCmdLine, cliWorkspaceHint, detectAudioVideoMediaType, oauthCapabilities, resolveOauthProxy } from '../lib/service.js'
import { runClientRender } from './client-render.mjs'
import { runInstallEntryTests } from './install-entry.mjs'
import { runAttachmentTests } from './attachments.mjs'
import { runOauthCredentialTests } from './oauth-credentials.mjs'
import { runLoopbackTests } from './oauth-loopback.mjs'
import { runStatsTests } from './stats.mjs'
import { OauthCredentialStore, CHATGPT_PRESET } from '../lib/oauth-credentials.js'
import { isAttachmentId } from '../lib/attachments.js'
import { BlockAssembler, LlmRuntime, contentHasImage } from '@deepseek-ai/dsh-llm'
import { createUserMessage, createAssistantMessage } from '@deepseek-ai/dsh-llm/message'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const LIB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib')
const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
function check(label, condition) {
  if (condition) console.log(`  ok  ${label}`)
  else { failures++; console.error(`FAIL  ${label}`) }
}

// C-3 统计持久化隔离（EVO-003 Phase 2）：index apply 接线会按 settings 默认
// 启用 persist（真实产品行为，DSH_HOME 是部署契约——E6-a）。测试进程把
// DSH_HOME 指到临时目录，防止 smoke 运行读写真实 ~/.dsh 统计（P7：测试
// 绝不触碰用户数据）。进程退出即弃；无需恢复（子进程环境不影响调用方）。
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'router-smoke-home-'))

// 0. 语法守卫：client.js 是浏览器 bundle，但宿主启动时预打包客户端
//    入口——语法错误会直接击穿 DSH 启动（括号失衡事故教训）。用 node
//    --check 全量把关；install.ps1 由 Windows 用户直接执行，用 PowerShell
//    解析器把关（stdio ignore：不进管道，兼容受限运行环境）。
console.log('syntax:')
{
  for (const file of ['client.js', 'service.js', 'tool.js', 'index.js', 'rpc.js', 'schemas.js', 'wrapper.js', 'memory.js', 'attachments.js', 'prestep.js']) {
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
  // EVO-002 Step 1（C-1 ChatGPT 订阅 OAuth / ADR-005 / roadmap §3.2 E2-a + §3.6）：
  // preset/credentialFile 字段与 oauthExperimental 开关的 schema 层扩展——纯声明式、
  // 零运行时行为变更。关闭词汇表沿用自由字符串先例（protocol/type/strategy）：
  // 未知值放行、消费点校验（OAUTH_PRESET_VALUES 常量供后续步骤与 UI 消费）。
  const c = routerSchema({})
  check('default oauthExperimental=false (§3.6 默认关闭)', c.oauthExperimental === false)
  check('default oauthTosAccepted=false + oauthProxyUrl empty (EVO-002 Step 6)', c.oauthTosAccepted === false && c.oauthProxyUrl === '')
  check('default takeoverDefaultModel=false (FIX-002 默认不接管)', c.takeoverDefaultModel === false)
  const d = routerSchema({ oauthAccounts: { legacy: { name: 'L' } } })
  check('oauth entry preset defaults to empty (P3 既有配置零破坏)', d.oauthAccounts.legacy.preset === '')
  check('oauth entry credentialFile defaults to empty', d.oauthAccounts.legacy.credentialFile === '')
  const e = routerSchema({ oauthExperimental: true, oauthAccounts: { cgpt: { name: 'ChatGPT', preset: 'chatgpt-codex', credentialFile: 'X:\\path.json' } } })
  check('preset/credentialFile/oauthExperimental explicit values kept', e.oauthExperimental === true && e.oauthAccounts.cgpt.preset === 'chatgpt-codex' && e.oauthAccounts.cgpt.credentialFile === 'X:\\path.json')
  const e6 = routerSchema({ oauthTosAccepted: true, oauthProxyUrl: 'http://127.0.0.1:7890' })
  check('oauthTosAccepted/oauthProxyUrl explicit values kept (Step 6 schema)', e6.oauthTosAccepted === true && e6.oauthProxyUrl === 'http://127.0.0.1:7890')
  const f = routerSchema({ oauthAccounts: { odd: { preset: 'foo' } } })
  check('unknown preset tolerated (R-5 放行语义)', f.oauthAccounts.odd.preset === 'foo')
  check('OAUTH_PRESET_VALUES frozen + chatgpt-codex (P5 泛化)', Object.isFrozen(OAUTH_PRESET_VALUES) && OAUTH_PRESET_VALUES.length === 1 && OAUTH_PRESET_VALUES[0] === 'chatgpt-codex')
  // EVO-003 Phase 2（C-3 / W-4，ARCH-002 IBC-1）：router.stats.persist 设置——
  // 默认 true（持久化开）；显式 false = 纯内存（现状行为）；空对象补默认。
  check('default stats.persist=true (W-4 persistence on by default)', c.stats.persist === true)
  check('explicit stats.persist=false kept (W-4 fallback switch)', routerSchema({ stats: { persist: false } }).stats.persist === false)
  check('empty stats object resolves defaults', routerSchema({ stats: {} }).stats.persist === true)
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
  // EVO-003 Phase 2：statsResult C-3 增量字段（days 按天聚合 / selfReport 自诊断
  // / recent costEstimate+errorClass）与 statsExport 请求/结果 codec（§4.3）。
  const sFull = wireCodecs.statsResult.parse({
    ok: true, enabled: true, totals: [], recent: [], series: [], accountTotals: [], accountSeries: [],
    days: { '2026-01-15': { calls: 3, errors: 1, inputTokens: 110, outputTokens: 52, tokens: 162, ms: 2180, cost: 0.1 } },
    selfReport: { dropped: 0, skippedLines: 0, skippedVersionLines: 0, corruptFiles: 0, migratedLines: 0, writeErrors: 0, indexRebuilt: 0, detailDropped: 0 },
  })
  check('statsResult parses days + selfReport increment fields (C-3)', sFull.days['2026-01-15'].calls === 3 && sFull.selfReport.dropped === 0)
  const sRecent = wireCodecs.statsResult.parse({ ok: true, enabled: true, totals: [], recent: [{ at: 1, agentId: 'a', provider: 'p', model: 'm', ok: true, ms: 2, costEstimate: 0.5, errorClass: 'network' }], series: [], accountTotals: [], accountSeries: [] })
  check('statsResult recent parses costEstimate + errorClass (C-3 increment)', sRecent.recent[0].costEstimate === 0.5 && sRecent.recent[0].errorClass === 'network')
  const seReq = wireCodecs.statsExportRequest.parse({ range: '7d', level: 'agent' })
  check('statsExportRequest parses', seReq.range === '7d' && seReq.level === 'agent')
  let seThrew = false
  try { wireCodecs.statsExportRequest.parse({ range: '7d' }) } catch { seThrew = true }
  check('statsExportRequest rejects missing level', seThrew)
  const seRes = wireCodecs.statsExportResult.parse({ ok: true, message: '已导出 1 行', csv: 'date,agent\n2026-01-15,vision' })
  check('statsExportResult parses csv payload', seRes.csv.startsWith('date,'))
  const seErr = wireCodecs.statsExportResult.parse({ ok: false, message: '无效的统计导出 range' })
  check('statsExportResult error shape parses (no csv)', seErr.ok === false && seErr.csv === undefined)
  const dataReq = wireCodecs.imageDataRequest.parse({ ref: { attachmentId: 'sha256:x', mediaType: 'image/png', bytes: 4, width: 2, height: 2 } })
  check('imageDataRequest parses', dataReq.ref.attachmentId === 'sha256:x' && dataReq.ref.name === undefined)
  const dataRes = wireCodecs.imageDataResult.parse({ ok: true, message: 'ok', mediaType: 'image/png', data: 'aGk=', width: 2, height: 2 })
  check('imageDataResult parses', dataRes.ok === true && dataRes.data === 'aGk=')
  const upReq = wireCodecs.uploadFileRequest.parse({ name: 'a.wav', mediaType: 'audio/wav', dataBase64: 'aGVsbG8=' })
  check('uploadFileRequest parses', upReq.name === 'a.wav' && upReq.mediaType === 'audio/wav' && upReq.dataBase64 === 'aGVsbG8=')
  const upRt = wireCodecs.uploadFileRequest.parse({ name: 'a.wav', mediaType: 'audio/wav', dataBase64: 'aGk=', extra: 1 })
  check('uploadFileRequest round-trips (unknown pass-through)', upRt.name === 'a.wav' && upRt.extra === 1)
  let upThrew = false
  try { wireCodecs.uploadFileRequest.parse({ name: 'a.wav', mediaType: 'audio/wav' }) } catch { upThrew = true }
  check('uploadFileRequest rejects missing dataBase64', upThrew)
  let upTypeThrew = false
  try { wireCodecs.uploadFileRequest.parse({ name: 42, mediaType: 'audio/wav', dataBase64: 'aGk=' }) } catch { upTypeThrew = true }
  check('uploadFileRequest rejects wrong type', upTypeThrew)
  const upRes = wireCodecs.uploadFileResult.parse({ ok: true, path: '.router-files/a.wav', attachmentId: 'sha256:x', name: 'a.wav' })
  check('uploadFileResult parses', upRes.ok === true && upRes.path === '.router-files/a.wav' && upRes.attachmentId === 'sha256:x' && upRes.message === undefined && upRes.code === undefined)
  const rwReq = wireCodecs.readWorkspaceFileRequest.parse({ path: '.router-files/a.wav' })
  check('readWorkspaceFileRequest parses', rwReq.path === '.router-files/a.wav')
  let rwThrew = false
  try { wireCodecs.readWorkspaceFileRequest.parse({}) } catch { rwThrew = true }
  check('readWorkspaceFileRequest rejects missing path', rwThrew)
  let rwTypeThrew = false
  try { wireCodecs.readWorkspaceFileRequest.parse({ path: 42 }) } catch { rwTypeThrew = true }
  check('readWorkspaceFileRequest rejects wrong type', rwTypeThrew)
  const rwRes = wireCodecs.readWorkspaceFileResult.parse({ ok: true, dataBase64: 'aGVsbG8=', mediaType: 'audio/wav', name: 'a.wav' })
  check('readWorkspaceFileResult parses', rwRes.ok === true && rwRes.dataBase64 === 'aGVsbG8=' && rwRes.mediaType === 'audio/wav' && rwRes.code === undefined)
  // R7-F-01（Step 8 补齐）：result codec 错误形状（ok:false + message/code 填值，
  // 对应 §4.3.5 错误码 UNSUPPORTED_MEDIA / FILE_TOO_LARGE / UPLOAD_FAILED /
  // PATH_OUTSIDE_WORKSPACE）与 result 类型错误拒绝——Step 8/9 service 实现的
  // wire 契约面（错误码经此形状返回），与 request codec 的类型拒绝判别对称。
  const upErr = wireCodecs.uploadFileResult.parse({ ok: false, message: '文件超过大小上限', code: 'FILE_TOO_LARGE' })
  check('uploadFileResult error shape parses (ok:false + code)', upErr.ok === false && upErr.message === '文件超过大小上限' && upErr.code === 'FILE_TOO_LARGE' && upErr.path === undefined && upErr.attachmentId === undefined && upErr.name === undefined)
  let upErrTypeThrew = false
  try { wireCodecs.uploadFileResult.parse({ ok: 'yes', message: 'x' }) } catch { upErrTypeThrew = true }
  check('uploadFileResult rejects wrong ok type', upErrTypeThrew)
  const rwErr = wireCodecs.readWorkspaceFileResult.parse({ ok: false, message: '路径越界', code: 'PATH_OUTSIDE_WORKSPACE' })
  check('readWorkspaceFileResult error shape parses (ok:false + code)', rwErr.ok === false && rwErr.message === '路径越界' && rwErr.code === 'PATH_OUTSIDE_WORKSPACE' && rwErr.dataBase64 === undefined && rwErr.mediaType === undefined)
  let rwErrTypeThrew = false
  try { wireCodecs.readWorkspaceFileResult.parse({ ok: 'no' }) } catch { rwErrTypeThrew = true }
  check('readWorkspaceFileResult rejects wrong ok type', rwErrTypeThrew)
  // v3 Step 7（N-5/R-5/R-6）：模态枚举（§4.3.2 M5）+ capabilities 归一（未知值
  // 兼容放行）+ catalog 每 agent 模态能力 wire 面（ModalityCapability 形状）。
  const modalityCapAgent = wireCodecs.catalogResult.parse({ ok: true, enabled: true, defaults: { provider: 'p', model: 'm' }, agents: [{ id: 'vision', name: '视觉', type: 'chat', enabled: true, description: '', capabilities: ['image'], provider: '', model: '', account: '', effectiveProvider: 'p', effectiveModel: 'm', source: 'agent', modalities: { consume: ['image', 'text'], produce: ['text'] } }], oauthAccounts: [] })
  check('catalogResult parses agent modalities wire field', modalityCapAgent.agents[0].modalities.consume.includes('image') && modalityCapAgent.agents[0].modalities.produce.includes('text'))
  check('MODALITY_VALUES enum (R-5)', MODALITY_VALUES.length === 5 && MODALITY_VALUES[0] === 'image' && MODALITY_VALUES.includes('audio') && MODALITY_VALUES.includes('video') && MODALITY_VALUES.includes('text') && MODALITY_VALUES.includes('file'))
  check('MODALITY_DIRECTIONS', MODALITY_DIRECTIONS.length === 2 && MODALITY_DIRECTIONS[0] === 'consume' && MODALITY_DIRECTIONS[1] === 'produce')
  const normCaps = normalizeCapabilities(['image', 'translate', 'web', 'audio'])
  check('normalizeCapabilities enum-aware (unknown tolerated)', normCaps.known.length === 2 && normCaps.known[0] === 'image' && normCaps.known[1] === 'audio' && normCaps.unknown.length === 2 && normCaps.unknown.includes('translate') && normCaps.unknown.includes('web'))
}

// 3. typert 贡献形状
console.log('rpc contribution:')
{
  const contribution = createHostContribution()
  check('face host', contribution.face === 'host')
  check('17 invocations', contribution.invocations.length === 17)
  check('descriptors share ids', ROUTER_REMOTE.descriptors.length === 17 && ROUTER_REMOTE.descriptors.every((d, i) => d.id === contribution.invocations[i].id))
  check('strict codecs have parse', contribution.invocations.every((d) => typeof d.result.schema.parse === 'function' && d.parameters.every((p) => typeof p.codec.schema.parse === 'function')))
  check('image RPC descriptors present', contribution.invocations.some((d) => d.method === 'imageData'))
  check('uploadFile RPC descriptor present', contribution.invocations.some((d) => d.method === 'uploadFile' && d.id === 'dsh-agent-router#router/uploadFile'))
  check('readWorkspaceFile RPC descriptor present', contribution.invocations.some((d) => d.method === 'readWorkspaceFile' && d.id === 'dsh-agent-router#router/readWorkspaceFile'))
  // EVO-003 Phase 2（§4.3）：statsExport 描述符——与 stats 相邻注册，
  // strict request/result codec 挂接（CSV 导出 RPC 面）。
  check('statsExport RPC descriptor present (C-3 CSV export)', contribution.invocations.some((d) => d.method === 'statsExport' && d.id === 'dsh-agent-router#router/statsExport' && d.parameters[0].codec.schema === wireCodecs.statsExportRequest && d.result.schema === wireCodecs.statsExportResult))
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
    // resolve 对齐宿主形态（dsh-fs-local）：返回 { displayPath, targetKey }，
    // 相对路径按 opts.cwd 解析（宿主 resolveLocalTarget 同语义；沿用旧 mock
    // 的正斜杠拼接风格，既有断言依赖该形态）；默认无符号链接（targetKey =
    // displayPath）——F-1 逃逸夹具在 readWorkspaceFile 块内临时换挂注入
    // "词法通过但 realpath 逃逸"的 targetKey。
    resolve: async (path, opts) => {
      const cwd = opts && typeof opts.cwd === 'string' && opts.cwd ? opts.cwd : ''
      const displayPath = path.includes(':') || path.startsWith('/') ? path : (cwd ? `${cwd}/${path}` : `D:/work/example/${path}`)
      return { displayPath, targetKey: displayPath }
    },
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
  // 伪 CLI 生图：在会话工作目录落盘一张 1x1 PNG 后输出文本（图生图产物收集）。
  const CLI_GEN_ARGS = `-e "require('fs').writeFileSync(require('path').join(process.cwd(),'gen.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64'));console.log('generated-artifact')"`

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
      codergen: { name: 'CLI生图', type: 'cli', enabled: true, description: '图生图产物', capabilities: ['image'], command: process.execPath, args: CLI_GEN_ARGS },
      coderbad: { name: 'CLI失败', type: 'cli', enabled: true, command: process.execPath, args: CLI_BAD_ARGS },
      coderbusy: { name: 'CLI忙碌', type: 'cli', enabled: true, command: process.execPath, args: CLI_SLEEP_ARGS(1000), maxConcurrent: 1 },
      codertimeout: { name: 'CLI超时', type: 'cli', enabled: true, command: process.execPath, args: CLI_SLEEP_ARGS(5000), timeoutMs: 200 },
      coderacct: { name: 'CLI账号', type: 'cli', enabled: true, account: 'oauth', command: process.execPath, args: CLI_ECHO_ARGS },
      coderflags: { name: 'CLI仿沙箱旗标', type: 'cli', enabled: true, command: process.execPath, args: `${CLI_ECHO_ARGS} -- --sandbox workspace-write -s --output-format json` },
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
  check('catalog lists enabled only', catalog.agents.length === 18 && catalog.agents.every((entry) => entry.id !== 'off'))
  check('catalog mirrors takeover switch (FIX-002 客户端接管开关)', catalog.takeoverDefaultModel === false)
  check('catalog effective', catalog.agents.find((entry) => entry.id === 'vision').effectiveModel === 'deepseek-v4-pro')
  check('catalog cli type kept', catalog.agents.find((entry) => entry.id === 'coder').type === 'cli')
  check('catalog cli no main-model leak', catalog.agents.find((entry) => entry.id === 'coder').effectiveModel === '' && catalog.agents.find((entry) => entry.id === 'coder').effectiveProvider === 'cli:coder' && catalog.agents.find((entry) => entry.id === 'coder').source === 'agent')
  check('catalog cli agent reference kept', catalog.agents.find((entry) => entry.id === 'coderref').cliAgent === 'codexentry' && catalog.agents.find((entry) => entry.id === 'coderref').effectiveProvider === 'cli:codexentry')
  check('catalog cli entries', (catalog.cliAgents ?? []).length === 1 && catalog.cliAgents[0].id === 'codexentry' && catalog.cliAgents[0].command === process.execPath)
  check('catalog oauth accounts', catalog.oauthAccounts.length === 3 && catalog.oauthAccounts[0].id === 'oauth' && catalog.oauthAccounts[0].models.length === 1 && catalog.oauthAccounts.find((entry) => entry.id === 'puboauth').publicClient === true)
  check('catalog oauth agent account', catalog.agents.find((entry) => entry.id === 'vchat').account === 'oauth')
  check('catalog pools', catalog.pools.length === 1 && catalog.pools[0].id === 'gpool' && catalog.pools[0].strategy === 'healthy' && catalog.pools[0].accounts.length === 2 && catalog.pools[0].accountHealth.length === 2)
  check('catalog pool agent', catalog.agents.find((entry) => entry.id === 'pchat').account === 'pool:gpool' && catalog.agents.find((entry) => entry.id === 'pchat').source === 'pool')
  check('catalog carries per-agent modality capability', catalog.agents.find((entry) => entry.id === 'vision').modalities.consume.includes('image') && catalog.agents.find((entry) => entry.id === 'draw').modalities.produce.includes('image') && catalog.agents.find((entry) => entry.id === 'coder').modalities.produce.includes('image'))

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

  // ── EVO-002 Step 4b：ChatGPT preset 授权流分支（oauthBegin / oauthTokenExchange /
  // resolveOauthToken 三点 preset 分流 + kill-switch + 惰性 loopback + 凭据四元组
  // 落盘 + ensureFresh 集成）。独立 service 与临时凭据目录——主夹具零改动，
  // 通用账号行为零改变由上方既有断言全绿证明（P3）。
  console.log('oauth preset branch (EVO-002 Step 4b):')
  {
    const presetWork = mkdtempSync(join(tmpdir(), 'router-preset-'))
    const fakeJwt = (accountId, sig) => {
      const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
      return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ 'https://api.openai.com/auth': { chatgpt_account_id: accountId } })}.${sig}`
    }
    const accessJwt = fakeJwt('acct-cgpt-1', 'sig-exchange')
    const refreshJwt = fakeJwt('acct-cgpt-1', 'sig-refresh')
    const presetRoot = new Context()
    presetRoot.provide('credentials', { resolve: async () => undefined, set: async () => undefined, unset: async () => undefined })
    let oauthExperimental = false
    // Step 6 起 begin 侧新增 ToS 门（§3.6 显式开启确认，experimental 检查之后）；
    // 本夹具聚焦授权流本体——预置已确认态，ToS 语义由 Step 6 块专测。
    const oauthTosAccepted = true
    const presetCredFile = join(presetWork, 'cgpt-auth.json')
    const presetService = new RouterService(presetRoot)
    presetService.attach({ get: () => ({
      enabled: true,
      oauthExperimental,
      oauthTosAccepted,
      oauthAccounts: {
        // 同名字段故意填干扰值：preset 语义 = 常量预填（零配置），账号内
        // authUrl/tokenUrl/clientId/scope 必须被忽略（roadmap §3.4 条目 1）。
        cgpt: { name: 'ChatGPT', enabled: true, preset: 'chatgpt-codex', credentialFile: presetCredFile, authUrl: 'https://evil.example/authorize', tokenUrl: 'https://evil.example/token', clientId: 'WRONG', scope: 'WRONG', protocol: 'openai-completions', baseURL: 'https://chatgpt.com/backend-api' },
        odd: { name: '未知预设', enabled: true, preset: 'mystery-preset' },
      },
      agents: {},
    })})
    let refreshMode = 'ok'
    const presetFetches = []
    const realFetch4b = globalThis.fetch
    globalThis.fetch = async (url, options) => {
      presetFetches.push({ url: String(url), init: options })
      if (String(url) === CHATGPT_PRESET.tokenUrl) {
        const body = new URLSearchParams(String(options?.body ?? ''))
        if (body.get('grant_type') === 'authorization_code') {
          return { ok: true, json: async () => ({ access_token: accessJwt, refresh_token: 'REFRESH-4B-1', expires_in: 3600, token_type: 'bearer' }) }
        }
        if (body.get('grant_type') === 'refresh_token') {
          if (refreshMode === '401') return { ok: false, status: 401, json: async () => ({ error: 'could-not-parse-token' }) }
          return { ok: true, json: async () => ({ access_token: refreshJwt, refresh_token: 'REFRESH-4B-2', expires_in: 864000 }) }
        }
      }
      return { ok: false, status: 404, text: async () => 'not found' }
    }
    try {
      // 1. kill-switch（§3.6 第③层）：oauthExperimental 默认 false → 明确拒绝。
      const killed = await presetService.oauthBegin({ accountId: 'cgpt' })
      check('preset begin kill-switch closed by default', killed.ok === false && killed.message.includes('实验通路已关闭'))
      oauthExperimental = true
      // 2. 惰性 loopback 未就绪（1455 被占，E4 降级链入口）→ 明确报错。
      presetService.codexLoopbackStarter = async () => ({ ready: false, reason: 'EADDRINUSE', dispose: () => {} })
      const notReady = await presetService.oauthBegin({ accountId: 'cgpt' })
      check('preset begin rejects when 1455 loopback not ready', notReady.ok === false && notReady.message.includes('1455') && notReady.message.includes('占用'))
      // 3. 正常路径：preset 常量预填 + PKCE/state + H3-4 附加参数 + originator。
      presetService.codexLoopbackStarter = async () => ({ ready: true, port: 1455, dispose: () => {} })
      const pbegin = await presetService.oauthBegin({ accountId: 'cgpt', redirectUri: 'https://ignored.example/cb' })
      // URLSearchParams 编码（空格→+、:/→%3A%2F）与实现同机制推导期望值。
      const scopeParam = new URLSearchParams([['scope', CHATGPT_PRESET.scope]]).toString()
      const redirectParam = new URLSearchParams([['redirect_uri', CHATGPT_PRESET.redirectUri]]).toString()
      check('preset begin builds authorize url from CHATGPT_PRESET', pbegin.ok === true
        && pbegin.authUrl.startsWith(`${CHATGPT_PRESET.authUrl}?`)
        && pbegin.authUrl.includes(`client_id=${CHATGPT_PRESET.clientId}`)
        && pbegin.authUrl.includes(scopeParam)
        && pbegin.authUrl.includes(redirectParam)
        && pbegin.authUrl.includes(`state=${pbegin.state}`))
      check('preset begin carries PKCE + H3-4 params + originator', pbegin.authUrl.includes('response_type=code') && pbegin.authUrl.includes('code_challenge=') && pbegin.authUrl.includes('code_challenge_method=S256') && pbegin.authUrl.includes('id_token_add_organizations=true') && pbegin.authUrl.includes('codex_cli_simplified_flow=true') && pbegin.authUrl.includes('originator=dsh-agent-router'))
      check('preset begin ignores same-named account fields (zero-config)', !pbegin.authUrl.includes('evil.example') && !pbegin.authUrl.includes('WRONG'))
      check('preset begin registers pending session', presetService.oauthPending.get(pbegin.state)?.accountId === 'cgpt' && typeof presetService.oauthPending.get(pbegin.state)?.verifier === 'string' && presetService.oauthPending.get(pbegin.state)?.redirectUri === CHATGPT_PRESET.redirectUri)
      // 4. 未知 preset → 消费点校验明确报错（schemas Step 1 放行语义的闭合）。
      const odd = await presetService.oauthBegin({ accountId: 'odd' })
      check('preset begin unknown preset rejected', odd.ok === false && odd.message.includes('未知预设类型'))
      // 5. exchange preset：fake token 响应（含 refresh_token/expires_in）→
      //    完整四元组凭据落盘（roadmap §3.4 条目 2），wire 形状沿用现有 codec。
      const beforeExchange = Date.now()
      const pex = await presetService.oauthTokenExchange({ code: 'pc-1', state: pbegin.state })
      const afterExchange = Date.now()
      check('preset exchange succeeds with wire expiresIn', pex.ok === true && pex.expiresIn === 3600)
      const exchangeCall = presetFetches.find((call) => call.url === CHATGPT_PRESET.tokenUrl)
      const exchangeBody = new URLSearchParams(String(exchangeCall?.init?.body ?? ''))
      check('preset exchange posts preset tokenUrl with PKCE and no secret', exchangeBody.get('client_id') === CHATGPT_PRESET.clientId && exchangeBody.get('code') === 'pc-1' && exchangeBody.get('grant_type') === 'authorization_code' && !!exchangeBody.get('code_verifier') && !exchangeBody.has('client_secret'))
      const savedDoc = JSON.parse(readFileSync(presetCredFile, 'utf8'))
      check('preset exchange persists full credential quad', savedDoc.version === 1 && savedDoc.credential.type === 'oauth' && savedDoc.credential.access === accessJwt && savedDoc.credential.refresh === 'REFRESH-4B-1' && savedDoc.credential.accountId === 'acct-cgpt-1')
      check('preset exchange expires is absolute ms', savedDoc.credential.expires > beforeExchange + 3_590_000 && savedDoc.credential.expires <= afterExchange + 3_601_000)
      check('preset pending consumed after exchange', !presetService.oauthPending.has(pbegin.state))
      // 6a. resolveOauthToken preset：新鲜凭据 → 零网络直接返回 access。
      const callsBeforeResolve = presetFetches.length
      const freshToken = await presetService.resolveOauthToken(presetService.getOAuthAccount('cgpt'))
      check('preset resolve returns access without network when fresh', freshToken === accessJwt && presetFetches.length === callsBeforeResolve)
      // 6b. 临期凭据 → ensureFresh 触发刷新（fake fetch）返回新 access + 盘上覆写。
      const seedStore = new OauthCredentialStore(presetCredFile)
      await seedStore.write({ type: 'oauth', access: 'ACCESS-STALE-4B', refresh: 'REFRESH-STALE-4B', expires: Date.now() + 30_000, accountId: 'acct-cgpt-1' })
      const refreshedToken = await presetService.resolveOauthToken(presetService.getOAuthAccount('cgpt'))
      const refreshedDoc = JSON.parse(readFileSync(presetCredFile, 'utf8'))
      check('preset resolve refreshes expiring credential via ensureFresh', refreshedToken === refreshJwt && presetFetches.length === callsBeforeResolve + 1)
      check('preset resolve rotating refresh overwrites disk document', refreshedDoc.credential.access === refreshJwt && refreshedDoc.credential.refresh === 'REFRESH-4B-2')
      // 6c. 刷新 401（REFRESH_FAILED 终态）→ 对齐 401 重登文案 + status 元数据转发
      //    （R4 转发语义：timedOut=瞬时域、status=HTTP 终态域，不吞掉）。
      await seedStore.write({ type: 'oauth', access: 'ACCESS-STALE-4B', refresh: 'REFRESH-STALE-4B', expires: Date.now() + 30_000, accountId: 'acct-cgpt-1' })
      refreshMode = '401'
      let refreshError = null
      try { await presetService.resolveOauthToken(presetService.getOAuthAccount('cgpt')) } catch (error) { refreshError = error }
      check('preset resolve REFRESH_FAILED aligns re-login wording', !!refreshError && refreshError.message.includes('重新登录'))
      check('preset resolve forwards error.status metadata (not swallowed)', !!refreshError && refreshError.status === 401)
      // 6d. 无凭据文件 → 明确报错（未登录，需先授权）。
      const missingAccount = { ...presetService.getOAuthAccount('cgpt'), credentialFile: join(presetWork, 'missing.json') }
      let noCredError = null
      try { await presetService.resolveOauthToken(missingAccount) } catch (error) { noCredError = error }
      check('preset resolve without credential file errors clearly', !!noCredError && noCredError.message.includes('登录'))
    } finally {
      globalThis.fetch = realFetch4b
      try { rmSync(presetWork, { recursive: true, force: true }) } catch { /* 清理尽力而为 */ }
    }
  }

  // ── EVO-002 Step 5：codex-responses 协议分支（runOauthChat 派发 + SSE 事件链
  // 聚合——EV-028 P3 实证 stream:false 被拒，SSE 为唯一路径）+ R5-F1 调用期
  // kill-switch（§3.6 ③：resolveOauthToken preset 入口单点覆盖 runOauthChat 与
  // oauthDiscover 两消费方）。独立 service + 临时凭据目录 + fetch 覆盖——主夹具
  // 零污染；SSE 十二事件链按 EV-028 形态复刻（delta 拼接与 output_item.done
  // 双路径同文返回 POC-OK）。
  console.log('oauth codex-responses branch (EVO-002 Step 5):')
  {
    const codexWork = mkdtempSync(join(tmpdir(), 'router-codex-'))
    const fakeJwt5 = (accountId, sig) => {
      const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
      return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ 'https://api.openai.com/auth': { chatgpt_account_id: accountId } })}.${sig}`
    }
    const accessJwt5 = fakeJwt5('acct-cgpt-5', 'sig-step5')
    const refreshedJwt5 = fakeJwt5('acct-cgpt-5', 'sig-step5-refreshed')
    const codexCredFile = join(codexWork, 'codex-auth.json')
    const bareCredFile = join(codexWork, 'bare-auth.json')
    const codexRoot = new Context()
    codexRoot.provide('credentials', { resolve: async () => undefined, set: async () => undefined, unset: async () => undefined })
    codexRoot.provide('attachments', { readImage: async () => ({ data: Uint8Array.from([1, 2, 3]), ref: { mediaType: 'image/png' } }) })
    let oauthExperimental5 = false
    const codexService = new RouterService(codexRoot)
    codexService.attach({ get: () => ({
      enabled: true,
      oauthExperimental: oauthExperimental5,
      oauthAccounts: {
        cgpt: { name: 'ChatGPT订阅', enabled: true, preset: 'chatgpt-codex', credentialFile: codexCredFile, protocol: 'codex-responses', baseURL: 'https://chatgpt.com/backend-api', models: ['gpt-5.4-mini'] },
        bare: { name: '零配置', enabled: true, preset: 'chatgpt-codex', credentialFile: bareCredFile, protocol: 'codex-responses', models: ['gpt-5.4'] },
        gcodex: { name: '通用codex', enabled: true, protocol: 'codex-responses', baseURL: 'https://example.invalid/api', tokenRef: 'NOPE', models: ['m'] },
      },
      agents: {
        cgptchat: { name: 'CGPT', type: 'chat', enabled: true, account: 'cgpt', systemPrompt: '你是测试助手', maxTokens: 1024, temperature: 0.2 },
        cgptbare: { name: 'CGPT裸', type: 'chat', enabled: true, account: 'bare' },
        gcodexchat: { name: '通用codex', type: 'chat', enabled: true, account: 'gcodex' },
      },
    })})
    const seedStore5 = new OauthCredentialStore(codexCredFile)
    await seedStore5.write({ type: 'oauth', access: accessJwt5, refresh: 'REFRESH-5-SEED', expires: Date.now() + 3_600_000, accountId: 'acct-cgpt-5' })
    // SSE 流响应（ReadableStream 分帧：event: + data: 行、\n\n 分隔——pi-ai
    // parseSSE 同款帧法；解析只取 data: 行）。
    const sseResponse5 = (events) => ({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          for (const event of events) {
            controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`))
          }
          controller.close()
        },
      }),
    })
    // EV-028 P3 十二事件链复刻：4×delta 与 output_item.done 双路径同文。
    const chain5 = (deltas, doneText, usage = { input_tokens: 29, output_tokens: 8 }) => [
      { type: 'response.created', response: { id: 'resp_5' } },
      { type: 'response.in_progress', response: { id: 'resp_5' } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_5' } },
      { type: 'response.content_part.added', output_index: 0, content_index: 0 },
      ...deltas.map((delta) => ({ type: 'response.output_text.delta', output_index: 0, delta })),
      { type: 'response.output_text.done', output_index: 0, text: deltas.join('') },
      { type: 'response.content_part.done', output_index: 0, content_index: 0 },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_5', content: [{ type: 'output_text', text: doneText }] } },
      { type: 'response.completed', response: { id: 'resp_5', usage } },
    ]
    let codexMode5 = {}
    const codexFetches5 = []
    const realFetch5 = globalThis.fetch
    globalThis.fetch = async (url, options) => {
      codexFetches5.push({ url: String(url), init: options })
      if (String(url) === CHATGPT_PRESET.tokenUrl && new URLSearchParams(String(options?.body ?? '')).get('grant_type') === 'refresh_token') {
        return { ok: true, json: async () => ({ access_token: refreshedJwt5, refresh_token: 'REFRESH-5-NEW', expires_in: 864000 }) }
      }
      if (String(url).endsWith('/codex/responses')) {
        if (codexMode5.sse) return sseResponse5(typeof codexMode5.sse === 'function' ? codexMode5.sse() : codexMode5.sse)
        if (codexMode5.http) return codexMode5.http
      }
      return { ok: false, status: 404, text: async () => 'not found' }
    }
    const run5 = async (agentId, task, extra = {}) => {
      try { return { result: await codexService.run({ agentId, task, images: [], ...extra }) } } catch (error) { return { error } }
    }
    try {
      // 1. R5-F1 调用期 kill-switch：凭据在盘且新鲜，但 oauthExperimental=false →
      //    调用明确报"实验通路已关闭"，且零网络（读凭据后的刷新/调用请求都
      //    不得越过开关——R5-F1 义务原文）。
      const killed = await run5('cgptchat', 'x')
      check('codex call blocked while oauthExperimental=false (R5-F1)', !!killed.error && killed.error.message.includes('实验通路已关闭') && codexFetches5.length === 0)
      let killResolveError = null
      try { await codexService.resolveOauthToken(codexService.getOAuthAccount('cgpt')) } catch (error) { killResolveError = error }
      check('codex kill-switch guards resolveOauthToken (oauthDiscover path)', !!killResolveError && killResolveError.message.includes('实验通路已关闭') && codexFetches5.length === 0)
      oauthExperimental5 = true
      // 2. 未知 preset 在 resolve 侧同样拒绝（与 begin 侧同一闭合语义）。
      let unknownPresetError = null
      try { await codexService.resolveOauthToken({ preset: 'mystery-preset' }) } catch (error) { unknownPresetError = error }
      check('codex resolve unknown preset rejected', !!unknownPresetError && unknownPresetError.message.includes('未知预设类型'))
      // 3. codex-responses 协议挂在非 preset 账号 → 明确报错（无四元组凭据则
      //    无法构造 chatgpt-account-id 头；引导使用 ChatGPT 预设账号）。
      const genericRun = await run5('gcodexchat', 'x')
      check('codex-responses on non-preset account rejected with preset guidance', !!genericRun.error && genericRun.error.message.includes('预设'))
      // 4. 主路径：SSE 聚合 → 文本 + usage；端点 / 头 / 请求体形状逐项（E5/H3-8/9）。
      codexMode5 = { sse: chain5(['POC', '-', 'OK'], 'POC-OK') }
      const codexRun = await run5('cgptchat', 'SSE-测试')
      check('codex run aggregates SSE deltas into final text with usage', codexRun.result?.kind === 'chat' && codexRun.result?.text === 'POC-OK' && codexRun.result?.usage?.inputTokens === 29 && codexRun.result?.usage?.outputTokens === 8)
      const codexCall = codexFetches5[codexFetches5.length - 1]
      check('codex request posts to chatgpt.com/backend-api/codex/responses', codexCall?.url === 'https://chatgpt.com/backend-api/codex/responses')
      const codexHeaders = codexCall?.init?.headers ?? {}
      check('codex headers carry bearer/account-id/originator/SSE beta (H3-9/E5)', codexHeaders.Authorization === `Bearer ${accessJwt5}` && codexHeaders['chatgpt-account-id'] === 'acct-cgpt-5' && codexHeaders.originator === 'dsh-agent-router' && codexHeaders.accept === 'text/event-stream' && codexHeaders['OpenAI-Beta'] === 'responses=experimental' && codexHeaders['Content-Type'] === 'application/json')
      const codexBody = JSON.parse(codexCall?.init?.body ?? '{}')
      check('codex body is Responses shape with stream:true (EV-028 P5)', codexBody.model === 'gpt-5.4-mini' && codexBody.store === false && codexBody.stream === true && codexBody.instructions === '你是测试助手' && Array.isArray(codexBody.include) && codexBody.include.includes('reasoning.encrypted_content') && codexBody.max_output_tokens === 1024 && codexBody.temperature === 0.2)
      check('codex input carries user input_text part', Array.isArray(codexBody.input) && codexBody.input[0]?.role === 'user' && codexBody.input[0]?.content?.[0]?.type === 'input_text' && codexBody.input[0]?.content?.[0]?.text?.includes('SSE-测试'))
      // 5. 图片输入 → input_image 内容块（E5 请求体形状，input_text 之后追加）。
      codexMode5 = { sse: chain5(['图'], '图') }
      const codexImageRun = await run5('cgptchat', '看图', { images: [{ attachmentId: 'att-5', mediaType: 'image/png' }] })
      const codexImageBody = JSON.parse(codexFetches5[codexFetches5.length - 1]?.init?.body ?? '{}')
      const imagePart = codexImageBody.input?.[0]?.content?.[1]
      check('codex body carries input_image part for image attachments', codexImageRun.result?.text === '图' && codexImageBody.input?.[0]?.content?.length === 2 && imagePart?.type === 'input_image' && typeof imagePart?.image_url === 'string' && imagePart.image_url.startsWith('data:image/png;base64,'))
      // 6. output_item.done 缺席 → delta 拼接兜底；到场则以其为准（pi-ai 槽位语义）。
      codexMode5 = { sse: [
        { type: 'response.created', response: {} },
        { type: 'response.output_text.delta', output_index: 0, delta: 'POC' },
        { type: 'response.output_text.delta', output_index: 0, delta: '-OK' },
        { type: 'response.completed', response: { usage: { input_tokens: 3, output_tokens: 4 } } },
      ] }
      const deltaOnly = await run5('cgptchat', 'x')
      check('codex falls back to delta text when output_item.done absent', deltaOnly.result?.text === 'POC-OK' && deltaOnly.result?.usage?.inputTokens === 3)
      codexMode5 = { sse: chain5(['WR', 'ONG'], 'POC-OK') }
      const itemPreferred = await run5('cgptchat', 'x')
      check('codex prefers output_item.done text over raw deltas (slot semantics)', itemPreferred.result?.text === 'POC-OK')
      // 7. 错误面：response.failed / error 事件 / HTTP 401 / 429 resets_at / 截断。
      codexMode5 = { sse: [{ type: 'response.failed', response: { error: { code: 'server_error', message: 'boom' } } }] }
      const failedRun = await run5('cgptchat', 'x')
      check('codex response.failed event surfaces code and message', !!failedRun.error && failedRun.error.message.includes('server_error') && failedRun.error.message.includes('boom'))
      codexMode5 = { sse: [{ type: 'error', error: { code: 'rate_limited', message: 'slow down' } }] }
      const errorEventRun = await run5('cgptchat', 'x')
      check('codex error event surfaces message', !!errorEventRun.error && errorEventRun.error.message.includes('slow down'))
      codexMode5 = { http: { ok: false, status: 401, text: async () => JSON.stringify({ error: { message: 'could-not-parse-token' } }) } }
      const authRun = await run5('cgptchat', 'x')
      check('codex HTTP 401 aligns re-login wording', !!authRun.error && authRun.error.message.includes('重新登录'))
      codexMode5 = { http: { ok: false, status: 429, text: async () => JSON.stringify({ error: { code: 'usage_limit_reached', plan_type: 'plus', resets_at: Math.floor(Date.now() / 1000) + 120 } }) } }
      const limitRun = await run5('cgptchat', 'x')
      check('codex HTTP 429 parses resets_at minutes (H3-14)', !!limitRun.error && limitRun.error.message.includes('分钟后重置') && limitRun.error.message.includes('plus'))
      codexMode5 = { sse: [{ type: 'response.created', response: {} }, { type: 'response.output_text.delta', output_index: 0, delta: 'half' }] }
      const truncatedRun = await run5('cgptchat', 'x')
      check('codex stream without terminal event rejected', !!truncatedRun.error && truncatedRun.error.message.includes('终态'))
      // 8. 调用期临期自动刷新：stale 凭据 → ensureFresh 先刷（rotating 盘上覆写）
      //    再以新 access 发起调用（Authorization 头 = 刷新后 token）。
      await seedStore5.write({ type: 'oauth', access: 'ACCESS-STALE-5', refresh: 'REFRESH-STALE-5', expires: Date.now() + 30_000, accountId: 'acct-cgpt-5' })
      codexMode5 = { sse: chain5(['刷'], '刷') }
      const afterRefresh = await run5('cgptchat', '刷新')
      const refreshedCall = codexFetches5[codexFetches5.length - 1]
      const refreshedDoc5 = JSON.parse(readFileSync(codexCredFile, 'utf8'))
      check('codex call refreshes expiring credential and uses fresh access', afterRefresh.result?.text === '刷' && refreshedCall?.init?.headers?.Authorization === `Bearer ${refreshedJwt5}` && refreshedDoc5.credential?.refresh === 'REFRESH-5-NEW')
      // 9. 零配置：无 baseURL 的 preset 账号 → 默认端点（pi-ai resolveCodexUrl
      //    同款三级归一：空 → chatgpt.com/backend-api/codex/responses）。
      await seedStore5.write({ type: 'oauth', access: accessJwt5, refresh: 'REFRESH-5-SEED', expires: Date.now() + 3_600_000, accountId: 'acct-cgpt-5' })
      const bareSeed = new OauthCredentialStore(bareCredFile)
      await bareSeed.write({ type: 'oauth', access: accessJwt5, refresh: 'REFRESH-BARE', expires: Date.now() + 3_600_000, accountId: 'acct-cgpt-5' })
      codexMode5 = { sse: chain5(['零'], '零') }
      const bareRun = await run5('cgptbare', 'x')
      check('codex baseURL defaults to chatgpt backend-api (zero-config)', bareRun.result?.text === '零' && codexFetches5[codexFetches5.length - 1]?.url === 'https://chatgpt.com/backend-api/codex/responses')
    } finally {
      globalThis.fetch = realFetch5
      try { rmSync(codexWork, { recursive: true, force: true }) } catch { /* 清理尽力而为 */ }
    }
  }

  // ── EVO-002 Step 6：账号卡服务面——§3.6 ToS 门（显式开启确认）+ oauthLogout
  // （W-5 凭据删除路径，合规删除不随实验开关关闭失效）+ §3.5 Q2 per-protocol
  // 能力接口（oauthCapabilities/runOauthDispatch，替代全局 chat 一刀切）+
  // 代理发现（resolveOauthProxy 配置>env 回退；chatgpt.com codex 调用经
  // dispatcher 接线；无代理直连零变化）+ C-9 埋点启动（oauthEvents 登录旅程，
  // P7 零 token 值）+ catalog preset 登录态镜像（账号卡 UI 数据源）。独立
  // service + 临时凭据目录 + fetch/undici 注入——主夹具零污染。
  console.log('oauth preset account surface (EVO-002 Step 6):')
  {
    let step6Crash = null
    try {
      const step6Work = mkdtempSync(join(tmpdir(), 'router-step6-'))
      const fakeJwt6 = (accountId) => {
        const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
        return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ 'https://api.openai.com/auth': { chatgpt_account_id: accountId } })}.sig-step6`
      }
      const accessJwt6 = fakeJwt6('acct-cgpt-6')
      const credFile6 = join(step6Work, 'step6-auth.json')
      const root6 = new Context()
      root6.provide('credentials', { resolve: async () => undefined, set: async () => undefined, unset: async () => undefined })
      const state6 = {
        enabled: true,
        oauthExperimental: false,
        oauthTosAccepted: false,
        oauthProxyUrl: '',
        oauthAccounts: {
          cgpt: { name: 'ChatGPT订阅', enabled: true, preset: 'chatgpt-codex', credentialFile: credFile6, protocol: 'codex-responses', baseURL: 'https://chatgpt.com/backend-api', models: ['gpt-5.4-mini'] },
          plain: { name: '通用账号', enabled: true, protocol: 'openai-completions', baseURL: 'https://gw.example/v1', tokenRef: 'PLAIN_TOKEN', models: ['gw-1'] },
        },
        pools: { main: { name: '主池', enabled: true, strategy: 'healthy', accounts: ['cgpt'] } },
        agents: {
          cgptchat: { name: 'CGPT', type: 'chat', enabled: true, account: 'cgpt' },
          cgptimg: { name: 'CGPT生图', type: 'image', enabled: true, account: 'cgpt', provider: 'openai', model: 'gpt-image-1' },
          poolchat: { name: '池chat', type: 'chat', enabled: true, account: 'pool:main' },
          poolimg: { name: '池image', type: 'image', enabled: true, account: 'pool:main', provider: 'openai', model: 'gpt-image-1' },
        },
      }
      const svc6 = new RouterService(root6)
      svc6.attach({ get: () => state6 })
      svc6.codexLoopbackStarter = async () => ({ ready: true, port: 1455, dispose: () => {} })
      const seed6 = async () => {
        const store6 = new OauthCredentialStore(credFile6)
        await store6.write({ type: 'oauth', access: accessJwt6, refresh: 'REFRESH-STEP6', expires: Date.now() + 3_600_000, accountId: 'acct-cgpt-6' })
      }
      const sse6 = (text) => ({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder()
            controller.enqueue(encoder.encode(`event: response.created\ndata: {"type":"response.created"}\n\n`))
            controller.enqueue(encoder.encode(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', output_index: 0, delta: text })}\n\n`))
            controller.enqueue(encoder.encode(`event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: { usage: { input_tokens: 5, output_tokens: 6 } } })}\n\n`))
            controller.close()
          },
        }),
      })
      const fetches6 = []
      const realFetch6 = globalThis.fetch
      // R7-F5：隔离进程代理 env（resolveOauthProxy 运行时读真实 process.env——
      // 设 HTTPS_PROXY 的机器上直连断言/fail-loud 断言必被 env 代理污染破坏）。
      const proxyEnvKeys6 = ['HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy']
      const savedProxyEnv6 = {}
      for (const key of proxyEnvKeys6) { savedProxyEnv6[key] = globalThis.process?.env?.[key]; delete globalThis.process.env[key] }
      globalThis.fetch = async (url, options) => {
        fetches6.push({ url: String(url), init: options })
        if (String(url) === CHATGPT_PRESET.tokenUrl) {
          return { ok: true, json: async () => ({ access_token: accessJwt6, refresh_token: 'REFRESH-STEP6', expires_in: 3600, token_type: 'bearer' }) }
        }
        if (String(url).endsWith('/codex/responses')) return sse6('OK-6')
        return { ok: false, status: 404, text: async () => 'not found' }
      }
      try {
        // A. §3.5 oauthCapabilities：v0.3.0 全协议（含未知协议）返回 ['chat']
        //    ——接口形状就位，后续版本按协议扩展返回值即解开限制（P5 单点）。
        const caps6 = ['openai-completions', 'anthropic', 'gemini', 'codex-responses', 'mystery'].map((protocol) => oauthCapabilities(protocol))
        check('oauthCapabilities returns [chat] for every protocol (§3.5)', caps6.every((caps) => Array.isArray(caps) && caps.length === 1 && caps[0] === 'chat'))
        // B. runOauthDispatch per-protocol 类型拒绝（替代全局一刀切）+ chat 放行。
        state6.oauthExperimental = true
        await seed6()
        let imgErr6 = null
        try { await svc6.run({ agentId: 'cgptimg', task: '画一张图' }) } catch (error) { imgErr6 = error }
        check('oauth dispatch rejects image type with per-protocol wording (§3.5)', !!imgErr6 && imgErr6.message.includes('暂不支持') && imgErr6.message.includes('codex-responses') && imgErr6.message.includes('image'))
        check('oauth dispatch retires old global wording', !!imgErr6 && !imgErr6.message.includes('目前仅支持 chat 类型'))
        let poolImgErr6 = null
        try { await svc6.run({ agentId: 'poolimg', task: 'x' }) } catch (error) { poolImgErr6 = error }
        check('pool dispatch rejects non-chat via same per-protocol gate', !!poolImgErr6 && poolImgErr6.message.includes('account-pool') && poolImgErr6.message.includes('暂不支持'))
        const chat6 = await svc6.run({ agentId: 'cgptchat', task: '你好' })
        check('oauth dispatch passes chat through to protocol branch', chat6.kind === 'chat' && chat6.text === 'OK-6')
        const poolChat6 = await svc6.run({ agentId: 'poolchat', task: '池调用' })
        check('pool dispatch passes chat through', poolChat6.kind === 'chat' && poolChat6.text === 'OK-6')
        // C. §3.6 ToS 门：experimental 开 + ToS 未确认 → begin 拒绝（先于
        //    loopback 就绪检查——1455 ready 也不放行；文案含条款指引）。
        const tosBlocked6 = await svc6.oauthBegin({ accountId: 'cgpt' })
        check('preset begin requires ToS acceptance before loopback (§3.6)', tosBlocked6.ok === false && tosBlocked6.message.includes('条款') && !tosBlocked6.message.includes('1455'))
        state6.oauthTosAccepted = true
        const begin6 = await svc6.oauthBegin({ accountId: 'cgpt' })
        check('preset begin proceeds once ToS accepted', begin6.ok === true && begin6.authUrl.startsWith(`${CHATGPT_PRESET.authUrl}?`))
        const ex6 = await svc6.oauthTokenExchange({ code: 'code-6', state: begin6.state })
        check('preset exchange completes login journey', ex6.ok === true && existsSync(credFile6))
        // R6-F1（kill-switch 冷凭据半边断言）：开关关闭时调用期拒绝——
        // 不读凭据文件（字节不变 = 无读改写）、不发刷新（网络零访问由
        // resolvePresetCredential 早退保证），文案明确"实验通路已关闭"。
        // 判别：旧实现（无调用期检查）会读文件并成功调用 → 必败。
        const coldBytes6 = readFileSync(credFile6)
        state6.oauthExperimental = false
        let coldErr6 = null
        try { await svc6.run({ agentId: 'cgptchat', task: '冷凭据' }) } catch (error) { coldErr6 = error }
        check('kill-switch call-side rejects cold preset credential (R6-F1)', !!coldErr6 && coldErr6.message.includes('实验通路已关闭'))
        check('kill-switch call-side touches no credential file (R6-F1)', coldBytes6.equals(readFileSync(credFile6)))
        state6.oauthExperimental = true
        // D. oauthLogout（W-5）：删凭据文件 + 幂等 + 非 preset 拒绝 + 未知账号
        //    拒绝；实验开关关闭不拦截登出（合规删除路径恒可用）。
        const lo6 = await svc6.oauthLogout({ accountId: 'cgpt' })
        check('preset logout deletes credential file (W-5)', lo6.ok === true && lo6.message.includes('登出') && !existsSync(credFile6))
        const lo6again = await svc6.oauthLogout({ accountId: 'cgpt' })
        check('preset logout idempotent when credential absent', lo6again.ok === true)
        const loPlain6 = await svc6.oauthLogout({ accountId: 'plain' })
        check('logout rejects non-preset account', loPlain6.ok === false && loPlain6.message.includes('ChatGPT 预设'))
        const loUnknown6 = await svc6.oauthLogout({ accountId: 'nope' })
        check('logout rejects unknown account', loUnknown6.ok === false && loUnknown6.message.includes('不存在'))
        state6.oauthExperimental = false
        await seed6()
        const loOff6 = await svc6.oauthLogout({ accountId: 'cgpt' })
        check('logout stays usable while experimental off (compliance path)', loOff6.ok === true && !existsSync(credFile6))
        state6.oauthExperimental = true
        // E. catalog 镜像：preset 标志 + presetLoggedIn（登录态随凭据文件翻转）。
        await seed6()
        const cat6a = await svc6.catalog({})
        const cgptEntry6a = cat6a.oauthAccounts.find((entry) => entry.id === 'cgpt')
        check('catalog mirrors preset flag and logged-in state', cgptEntry6a.preset === 'chatgpt-codex' && cgptEntry6a.presetLoggedIn === true)
        await svc6.oauthLogout({ accountId: 'cgpt' })
        const cat6b = await svc6.catalog({})
        const cgptEntry6b = cat6b.oauthAccounts.find((entry) => entry.id === 'cgpt')
        check('catalog logged-in flips false after logout', cgptEntry6b.presetLoggedIn === false)
        check('catalog generic account carries no preset', (cat6b.oauthAccounts.find((entry) => entry.id === 'plain').preset ?? '') === '')
        // F. 代理发现 resolveOauthProxy：显式配置 > env 回退发现 > 无代理。
        check('resolveOauthProxy prefers router config over env', resolveOauthProxy({ oauthProxyUrl: 'http://127.0.0.1:7890' }, { HTTPS_PROXY: 'http://env-proxy:1' }).proxyUrl === 'http://127.0.0.1:7890')
        check('resolveOauthProxy discovers env proxy fallback', resolveOauthProxy({}, { https_proxy: 'http://env-p:7890' }).proxyUrl === 'http://env-p:7890' && resolveOauthProxy({}, { HTTPS_PROXY: 'http://env-2:1' }).source === 'HTTPS_PROXY')
        check('resolveOauthProxy empty when nothing configured', resolveOauthProxy({}, {}).proxyUrl === '' && resolveOauthProxy({}, {}).source === '')
        // G. codex 调用代理接线（仅 chatgpt.com 目标）：配置代理 → fetch init
        //    带 dispatcher（undici 注入桩）；无代理 → 无 dispatcher（直连零
        //    变化）；undici 不可用 → 明确报错（代理来源 + 指引）。
        await seed6()
        let proxyAgentCount6 = 0
        svc6.oauthUndiciLoader = async () => ({ ProxyAgent: class { constructor(url) { proxyAgentCount6 += 1; this.url = url } } })
        state6.oauthProxyUrl = 'http://127.0.0.1:7890'
        const proxied6 = await svc6.run({ agentId: 'cgptchat', task: '经代理' })
        check('codex call routes via proxy dispatcher when configured', proxied6.text === 'OK-6' && fetches6[fetches6.length - 1]?.init?.dispatcher?.url === 'http://127.0.0.1:7890')
        const proxied6b = await svc6.run({ agentId: 'cgptchat', task: '经代理 2' })
        check('proxy dispatcher cached per proxyUrl (R7-F3)', proxied6b.text === 'OK-6' && proxyAgentCount6 === 1 && fetches6[fetches6.length - 1]?.init?.dispatcher === fetches6[fetches6.length - 2]?.init?.dispatcher)
        state6.oauthProxyUrl = ''
        const direct6 = await svc6.run({ agentId: 'cgptchat', task: '直连' })
        check('codex call stays direct (no dispatcher) when no proxy', direct6.text === 'OK-6' && fetches6[fetches6.length - 1]?.init?.dispatcher === undefined)
        svc6.oauthUndiciLoader = async () => { throw new Error('undici not installed') }
        // R7-F3 缓存交互：fail-loud 场景用未缓存键（7891）——同 URL 已成功
        // 实例化（7890）即证明 undici 可用，缓存命中不报错是正确行为。
        state6.oauthProxyUrl = 'http://127.0.0.1:7891'
        let proxyLoadErr6 = null
        try { await svc6.run({ agentId: 'cgptchat', task: 'x' }) } catch (error) { proxyLoadErr6 = error }
        check('proxy configured but undici unavailable errors clearly', !!proxyLoadErr6 && proxyLoadErr6.message.includes('undici') && proxyLoadErr6.message.includes('代理'))
        state6.oauthProxyUrl = ''
        svc6.oauthUndiciLoader = null
        // H. C-9 埋点：oauthEvents 记录登录旅程（begin fail/ok、login ok、
        //    logout），事件负载零 token 值（P7 红线）。
        const kinds6 = new Set(svc6.oauthEvents.map((event) => event.kind))
        check('oauth telemetry records login journey kinds (C-9)', kinds6.has('preset_begin_fail') && kinds6.has('preset_begin_ok') && kinds6.has('preset_login_ok') && kinds6.has('preset_logout'))
        check('oauth telemetry never carries token values (P7)', !JSON.stringify(svc6.oauthEvents).includes('sig-step6') && !JSON.stringify(svc6.oauthEvents).includes('REFRESH-STEP6'))
      } finally {
        globalThis.fetch = realFetch6
        for (const key of proxyEnvKeys6) {
          if (savedProxyEnv6[key] === undefined) delete globalThis.process.env[key]
          else globalThis.process.env[key] = savedProxyEnv6[key]
        }
        try { rmSync(step6Work, { recursive: true, force: true }) } catch { /* 清理尽力而为 */ }
      }
    } catch (error) {
      step6Crash = error
    }
    check('step6 block completes without unexpected throw', step6Crash === null)
    if (step6Crash) console.error('      step6 crash:', step6Crash && step6Crash.message)
  }

  const text = service.promptText()
  check('promptText lists agents', text.includes('vision') && text.includes('draw') && text.includes('route_agent') && !text.includes('off'))
  check('promptText pool meta', text.includes('OAuth 账号池:G池') && text.includes('2 个账号'))
  check('promptText delegation note', text.includes('可读写工作区任意文件') && text.includes('附件按需显式派发'))
  check('promptText no dead attachment-path rule', !text.includes('[用户附带图片]') && text.includes('files') && !text.includes('attachmentIds'))
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
      // 未启用 CLI 沙箱（本伪 CLI 无沙箱参数）时注入自觉收敛文案，而非错误的「受沙箱限制」。
      check('cli run unsandboxed wording', cliRun.text.includes('未启用 CLI 沙箱') && !cliRun.text.includes('受沙箱限制'))
      // 非 codex CLI 携带 --sandbox/-s 字样（如 gemini 的布尔 -s）不得被按 codex 语义
      // 误读为值形态沙箱：仍应注入未启用文案（沙箱识别按 CLI 语义收敛）。
      const cliFlagsRun = await service.run({ agentId: 'coderflags', task: '旗标文案', images: [], exec: { agent: fakeParentCli } })
      check('cli run sandbox flags not misread for non-codex', cliFlagsRun.kind === 'cli' && cliFlagsRun.text.includes('未启用 CLI 沙箱') && !cliFlagsRun.text.includes('受沙箱限制'))
      // 提示文案双分支的单元覆盖（受限/未启用；gemini 'on' 视为受限）。
      check('cli workspace hint restricted', cliWorkspaceHint('/w', 'workspace-write').includes('受沙箱限制') && cliWorkspaceHint('/w', 'read-only').includes('受沙箱限制') && cliWorkspaceHint('/w', 'on').includes('受沙箱限制'))
      check('cli workspace hint unrestricted', cliWorkspaceHint('/w', 'danger-full-access').includes('未启用 CLI 沙箱') && cliWorkspaceHint('/w', '').includes('未启用 CLI 沙箱') && !cliWorkspaceHint('/w', 'danger-full-access').includes('受沙箱限制'))
      const cliFilesRun = await service.run({ agentId: 'coder', task: '处理文件', images: [], files: ['notes.txt'], exec: { agent: fakeParentCli } })
      // 相对路径按会话 cwd（tmpDir）解析注入（mock resolve 对齐宿主：cwd 感知）；
      // 断言的路径以实际 cwd 为准，不再依赖旧 mock 的固定前缀。
      check('cli files paths injected', cliFilesRun.kind === 'cli' && cliFilesRun.text.includes('待处理文件') && cliFilesRun.text.includes(tmpDir) && cliFilesRun.text.includes('notes.txt'))
      // 经 cliAgent 引用子代理条目执行：使用条目 command/args，而非 agent 内嵌字段。
      const cliRefRun = await service.run({ agentId: 'coderref', task: '引用运行', images: [], exec: { agent: fakeParentCli } })
      check('cli run via entry reference', cliRefRun.kind === 'cli' && cliRefRun.text.includes('引用运行') && cliRefRun.text.includes('工作目录：'))
      const cliImagesRun = await service.run({ agentId: 'coder', task: '看图', images: [{ id: 'att-1', kind: 'image' }], exec: { agent: fakeParentCli } })
      check('cli images materialized as files', cliImagesRun.kind === 'cli' && cliImagesRun.text.includes('已附带 1 张图片') && fsModule.readdirSync(pathModule.join(tmpDir, '.router-files')).some((name) => name.includes('-img-')))
      // 图生图产物收集：cli 子代理落盘的新图片 diff 出来 → 保存附件 → images 返回
      // （工具卡据此渲染缩略图；回归曾因 runCli 不返回 images 导致生成图无处显示）。
      const genRun = await service.run({ agentId: 'codergen', task: '生成一张图', images: [], exec: { agent: fakeParentCli } })
      check('cli generation artifact collected', genRun.kind === 'cli' && genRun.text.includes('generated-artifact') && Array.isArray(genRun.images) && genRun.images.length === 1 && genRun.images[0].name === 'gen.png' && savedImages.some((ref) => ref.name === 'gen.png'))
      check('cli artifact excluded from rerun (unchanged)', (async () => {
        const rerun = await service.run({ agentId: 'codergen', task: '再生成', images: [], exec: { agent: fakeParentCli } })
        return rerun.kind === 'cli' && (!Array.isArray(rerun.images) || rerun.images.length === 0)
      })())
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
      try { await service.run({ agentId: 'coderacct', task: 'x', images: [], exec: { agent: fakeParentCli } }) } catch (error) { cliOauthRejected = String(error.message).includes('暂不支持') && String(error.message).includes('cli') }
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
  // codex 沙箱按平台自适应：Windows 用 danger-full-access（OS 沙箱无法启动
  // WindowsApps 的 shell），其余平台保留 workspace-write 最小权限。
  const cliSpecWin = service.resolveCliSpec({ command: 'codex', args: '' }, 'win32')
  const cliSpecPosix = service.resolveCliSpec({ command: 'codex', args: '' }, 'linux')
  check('cli spec platform sandbox default', cliSpecWin.sandbox === 'danger-full-access' && !cliSpecWin.args.includes('workspace-write') && cliSpecPosix.sandbox === 'workspace-write' && !cliSpecPosix.args.includes('danger-full-access') && cliSpecWin.args.includes('--skip-git-repo-check'))
  // 旧版 UI 模板与文档预设把沙箱参数写死进保存值：一字不差时按未设置迁移。
  const cliSpecLegacyPicker = service.resolveCliSpec({ command: 'codex', args: 'exec --json --sandbox workspace-write' }, 'win32')
  const cliSpecLegacyPreset = service.resolveCliSpec({ command: 'codex', args: 'exec --json --sandbox workspace-write --skip-git-repo-check' }, 'linux')
  check('cli spec legacy codex template migrated', cliSpecLegacyPicker.sandbox === 'danger-full-access' && cliSpecLegacyPreset.sandbox === 'workspace-write')
  // 用户显式指定沙箱：原样保留，不自动改写。
  const cliSpecExplicit = service.resolveCliSpec({ command: 'codex', args: 'exec --json --sandbox read-only' }, 'win32')
  check('cli spec explicit sandbox kept', cliSpecExplicit.sandbox === 'read-only')
  // 用户自定义 args 未指定 --sandbox：按平台补齐可用默认（自定义模型参数等形态）。
  const cliSpecFillWin = service.resolveCliSpec({ command: 'codex', args: 'exec --json -m gpt-5-codex' }, 'win32')
  const cliSpecFillPosix = service.resolveCliSpec({ command: 'codex', args: 'exec --json -m gpt-5-codex' }, 'linux')
  check('cli spec sandbox auto-filled per platform', cliSpecFillWin.sandbox === 'danger-full-access' && cliSpecFillPosix.sandbox === 'workspace-write' && cliSpecFillWin.args.includes('-m') && cliSpecFillPosix.args.includes('-m'))
  // 完整旁路开关已覆盖权限：不再追加 --sandbox。
  const cliSpecBypass = service.resolveCliSpec({ command: 'codex', args: 'exec --json --dangerously-bypass-approvals-and-sandbox' }, 'win32')
  check('cli spec bypass flag skips auto-fill', cliSpecBypass.sandbox === '' && !cliSpecBypass.args.includes('--sandbox'))
  // 非 codex CLI 不受沙箱补齐影响。
  const cliSpecClaude = service.resolveCliSpec({ command: 'claude', args: '' }, 'win32')
  check('cli spec non-codex unaffected', !cliSpecClaude.args.includes('--sandbox') && cliSpecClaude.sandbox === '')
  // gemini 的 -s/--sandbox 是布尔标志（无值）：出现即视为启用沙箱（'on'），
  // 不得按 codex 值形态误读下一个 token。
  const cliSpecGemini = service.resolveCliSpec({ command: 'gemini', args: '' }, 'win32')
  const cliSpecGeminiSbx = service.resolveCliSpec({ command: 'gemini', args: '-p --output-format json -s' }, 'win32')
  check('cli spec gemini boolean sandbox', cliSpecGemini.sandbox === '' && cliSpecGeminiSbx.sandbox === 'on' && cliSpecGeminiSbx.args.includes('--yolo') === false)
  const cliSpecGeminiLongSbx = service.resolveCliSpec({ command: 'gemini', args: '-p --output-format json --sandbox' }, 'win32')
  check('cli spec gemini long boolean sandbox', cliSpecGeminiLongSbx.sandbox === 'on')
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
  // 登录按钮全平台回归（负向见证）：旧实现的窗口标题拼装引用未定义的
  // agent → ReferenceError，登录按钮永远失败；此前该断言只在非 Windows
  // 执行（本机 Windows 被跳过），缺陷从未被捕获。Windows 下经 cmd start
  // 弹出一个立即退出的 node 窗口（spawn 事件即返回，不影响断言）。
  let cliLoginThrew = null
  let loginOk = null
  try {
    loginOk = await service.cliLogin({ agentId: 'coderout' })
  } catch (error) {
    cliLoginThrew = error
  }
  check('cli login starts process (all platforms)', !cliLoginThrew && loginOk && loginOk.ok === true && loginOk.message.includes('终端窗口'))
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

  // EVO-003 Phase 2（§4.3）：statsExport——CSV 列齐全（11 列 §4.3 清单）+
  // 非法 range/level 服务层校验（ok:false + 明确文案；与 cliModels 先例同构）。
  service.record({ agentId: 'vision', provider: 'deepseek-official', model: 'deepseek-v4-pro', ok: true, ms: 30, inputTokens: 100, outputTokens: 20 })
  const exportOk = service.statsExport({ range: '7d', level: 'agent' })
  check('statsExport returns CSV with all 11 columns (§4.3)', exportOk.ok === true && exportOk.csv.split('\n')[0] === 'date,agent,account,model,calls,errors,inputTokens,outputTokens,p50ms,p95ms,costEstimate' && exportOk.csv.split('\n')[1].startsWith(`${new Date().toISOString().slice(0, 10)},vision,deepseek-official,deepseek-v4-pro,`))
  const exportBadRange = service.statsExport({ range: '1y', level: 'agent' })
  check('statsExport rejects invalid range (ok:false + message)', exportBadRange.ok === false && exportBadRange.message.includes('range') && exportBadRange.csv === undefined)
  const exportBadLevel = service.statsExport({ range: '7d', level: 'model' })
  check('statsExport rejects invalid level (ok:false + message)', exportBadLevel.ok === false && exportBadLevel.message.includes('level'))

  // EVO-003 Phase 2（W-4 / ARCH-002 IBC-1）：service 层开关往返——
  // applyStatsSettings 读 settings.stats.persist 热同步 store.setPersist；
  // 开→关先 flush（不丢已记录事件）、false 期纯内存、关→开不双计。
  {
    const w4Work = mkdtempSync(join(tmpdir(), 'router-w4-'))
    const w4Root = new Context()
    const w4 = new RouterService(w4Root, null, { dir: join(w4Work, 'stats'), flushThreshold: 50 })
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    w4.attach({ get: () => ({ enabled: true, stats: { persist: true } }) })
    w4.applyStatsSettings()
    await sleep(80)
    w4.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 10, inputTokens: 1 })
    w4.attach({ get: () => ({ enabled: true, stats: { persist: false } }) })
    w4.applyStatsSettings()
    await sleep(80)
    const dailyFile = readdirSync(join(w4Work, 'stats')).find((n) => /^daily-.*\.jsonl$/.test(n))
    check('W-4 service toggle-off flushes pending events first (nothing lost)', !!dailyFile && readFileSync(join(w4Work, 'stats', dailyFile), 'utf8').split('\n').filter((l) => l !== '').length === 1)
    w4.record({ agentId: 'draw', provider: 'openai', model: 'dall-e-3', ok: true, ms: 5 })
    await w4.stats.flush()
    check('W-4 false period stays memory-only (explicit flush writes nothing)', readFileSync(join(w4Work, 'stats', dailyFile), 'utf8').split('\n').filter((l) => l !== '').length === 1)
    check('W-4 timeline continuous across toggle (both agents visible)', w4.statsSnapshot().totals.length === 2)
    w4.attach({ get: () => ({ enabled: true, stats: { persist: true } }) })
    w4.applyStatsSettings()
    await sleep(80)
    check('W-4 toggle-on with live memory: no double-count of disk data', w4.statsSnapshot().totals.find((t) => t.agentId === 'vision')?.calls === 1)
    await w4.stats.close()
    rmSync(w4Work, { recursive: true, force: true })
  }

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

  // ── 对话框图片通路：标记往返 / imageData（生成图片展示通路）────────
  console.log('dialog image pathway:')
  {
    // 标记往返（生成图片展示用）：名称净化保证标记可按 ] 定界解析。
    const rawRef = { attachmentId: 'sha256:abcd', mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'a]b[c\n.png' }
    const marker = service.imageMarkerOf(rawRef)
    check('image marker built', marker.startsWith('[router:image:') && marker.endsWith(']') && !marker.includes(']b') && marker.includes('abc'))
    const parsed = service.parseImageMarkers(`前文 ${marker} 后文`)
    check('image marker round-trips', parsed.length === 1 && parsed[0].attachmentId === 'sha256:abcd' && parsed[0].mediaType === 'image/png' && parsed[0].name === 'abc.png')
    check('image marker tolerates corrupt payload', service.parseImageMarkers('[router:image:not-json]').length === 0)
    // 视觉识别 agent 选择：仅 chat/agent 类型 + image 能力；生图 agent（image
    // 类型端点、cli 类型生图子代理如 codex）与无 image 能力者除外，按 id 排序。
    const visionList = service.listImageVisionAgents().map(([id]) => id)
    check('vision agents list', visionList.length === 1 && visionList[0] === 'vision' && !visionList.includes('coder') && !visionList.includes('draw') && !visionList.includes('helper') && !visionList.includes('broken'))
    // 生图 agent 选择：image 类型端点 + cli 类型生图子代理（capabilities 含
    // image），供图生图/文生图；识别类 chat/agent 与无 image 能力的 cli 除外。
    const generationList = service.listImageGenerationAgents().map(([id]) => id)
    check('generation agents list', generationList.length === 3 && generationList[0] === 'coder' && generationList[1] === 'codergen' && generationList[2] === 'draw' && !generationList.includes('vision') && !generationList.includes('coderbad'))
    // v3 Step 7（N-5/R-5/R-6）：模态能力矩阵（§4.3.2 M5）——modalityOfAgent
    // 默认映射 + capabilities 覆盖（方向语义），listAgentsByModality 模态×方向泛化。
    const shapeOf = (agent) => service.modalityOfAgent(agent)
    check('matrix chat default text/text', shapeOf({ type: 'chat' }).consume.includes('text') && !shapeOf({ type: 'chat' }).consume.includes('image'))
    check('matrix chat+image consumes image', shapeOf({ type: 'chat', capabilities: ['image'] }).consume.includes('image') && !shapeOf({ type: 'chat', capabilities: ['image'] }).produce.includes('image'))
    check('matrix agent consumes file', shapeOf({ type: 'agent' }).consume.includes('file'))
    check('matrix cli+image produces image', shapeOf({ type: 'cli', capabilities: ['image'] }).produce.includes('image') && !shapeOf({ type: 'cli', capabilities: ['image'] }).consume.includes('image'))
    check('matrix image type produces image (not consumes)', shapeOf({ type: 'image' }).produce.includes('image') && !shapeOf({ type: 'image' }).consume.includes('image'))
    check('matrix speech consumes audio', shapeOf({ type: 'speech' }).consume.includes('audio') && shapeOf({ type: 'speech' }).produce.includes('text'))
    check('matrix unknown capability tolerated', shapeOf({ type: 'chat', capabilities: ['translate'] }).consume.includes('text') && !shapeOf({ type: 'chat', capabilities: ['translate'] }).consume.includes('translate'))
    const consumeImage = service.listAgentsByModality('image', 'consume').map(([id]) => id)
    check('listAgentsByModality consume image = vision list', consumeImage.length === 1 && consumeImage[0] === 'vision')
    const produceImage = service.listAgentsByModality('image', 'produce').map(([id]) => id)
    check('listAgentsByModality produce image = generation list', produceImage.length === 3 && produceImage[0] === 'coder' && produceImage[1] === 'codergen' && produceImage[2] === 'draw')
    check('listAgentsByModality default direction consume', service.listAgentsByModality('image')[0][0] === 'vision')
    check('listAgentsByModality no audio/video agents yet', service.listAgentsByModality('audio', 'consume').length === 0 && service.listAgentsByModality('video', 'consume').length === 0)
    check('listAgentsByModality unknown modality empty', service.listAgentsByModality('bogus').length === 0)
    // imageData：读字节 → base64 与元数据（生成图片展示通路）。
    const imageData = await service.imageData({ ref: { attachmentId: 'sha256:abcd', mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'n.png' } })
    check('imageData returns bytes', imageData.ok === true && imageData.data === Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64') && imageData.mediaType === 'image/png')
    const imageDataMissing = await service.imageData({})
    check('imageData rejects missing ref', imageDataMissing.ok === false && imageDataMissing.message.includes('缺少附件引用'))
  }

  // ── 带图片调用自动附带会话上下文（截图是对话上下文的一部分）────────
  console.log('conversation context:')
  {
    const contextAgent = {
      session: {
        header: { cwd: 'D:/work/example', delegationDepth: 0 },
        deriveMessages: () => [
          { role: 'user', content: [{ type: 'text', text: '我在做一个登录页，改了表单提交逻辑' }] },
          { role: 'assistant', content: [{ type: 'text', text: '好的，把报错信息发我看下' }] },
          { role: 'user', content: [{ type: 'text', text: '看图 [router:image:{"attachmentId":"sha256:x","mediaType":"image/png","bytes":1,"width":1,"height":1}]' }] },
        ],
      },
    }
    lastChatRequest = null
    const withContext = await service.run({ agentId: 'vision', task: '识别这张截图', images: [{ id: 'att-1', kind: 'image' }], exec: { agent: contextAgent } })
    check('vision call carries conversation context', withContext.kind === 'chat' && lastChatRequest && lastChatRequest.messages[0].content.some((block) => block.type === 'text' && block.text.includes('[会话上下文（主会话最近对话）]') && block.text.includes('我在做一个登录页') && block.text.includes('把报错信息发我看下') && block.text.includes('[user]') && block.text.includes('[assistant]')))
    check('vision context skips marker messages', lastChatRequest && lastChatRequest.messages[0].content.some((block) => block.type === 'text' && !block.text.includes('[router:image:')))
    check('vision call returns injected images', withContext.images && withContext.images.length === 1 && withContext.images[0].id === 'att-1')
    lastChatRequest = null
    const withoutImages = await service.run({ agentId: 'vision', task: '纯文本任务', images: [], exec: { agent: contextAgent } })
    check('text-only call carries no context section', withoutImages.kind === 'chat' && lastChatRequest && lastChatRequest.messages[0].content.some((block) => block.type === 'text' && block.text.includes('纯文本任务') && !block.text.includes('[会话上下文')))
    const delegationBefore = delegationRequests.length
    await service.run({ agentId: 'helper', task: '识别这张截图', images: [{ id: 'att-1', kind: 'image' }], exec: { agent: contextAgent } })
    check('delegation carries conversation context', delegationRequests.length === delegationBefore + 1 && delegationRequests[delegationRequests.length - 1].prompt[0].text.includes('[主会话最近对话上下文]') && delegationRequests[delegationRequests.length - 1].prompt[0].text.includes('我在做一个登录页'))
  }

  // ── imageMemory 服务端回写（v3 Step 4 / M6 写入点）：视觉 agent 成功 ──
  // 返回 → 附件通道图片（attachmentId 存在）写入跨轮缓存；无 attachmentId
  // 的 ref 与非视觉 agent（生图/委派）不回写（"此前识别"语义不成立）。
  console.log('imageMemory write-back (M6):')
  {
    const { rememberImage, recallImage, clearImageMemory, imageMemorySize } = await import('../lib/memory.js')
    clearImageMemory()
    const wbAgent = { session: { header: { cwd: 'D:/work/example', delegationDepth: 0 }, deriveMessages: () => [] } }
    const wbRun = await service.run({ agentId: 'vision', task: '识别这张图', images: [{ attachmentId: 'sha256:wb', mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'wb.png' }], exec: { agent: wbAgent } })
    check('vision dispatch writes imageMemory', wbRun.kind === 'chat' && recallImage('sha256:wb') !== null && typeof recallImage('sha256:wb').text === 'string' && recallImage('sha256:wb').text.length > 0)
    await service.run({ agentId: 'helper', task: '识别这张截图', images: [{ id: 'att-9', kind: 'image', attachmentId: 'sha256:nonvision' }], exec: { agent: wbAgent } })
    check('non-vision dispatch does not write imageMemory', imageMemorySize() === 1 && recallImage('sha256:nonvision') === null)
    await service.run({ agentId: 'vision', task: '识别这张图', images: [{ id: 'att-10', kind: 'image' }], exec: { agent: wbAgent } })
    check('ref without attachmentId does not write imageMemory', imageMemorySize() === 1)
    clearImageMemory()
  }

  // v3 Step 7（N-8）：attachmentIds 内容寻址解析（经 M2 统一编址，含懒注册降级
  // W-2）——合法 id 经宿主 readImage 建立条目返回 ref；非法格式 / 未知 id 明确报错。
  console.log('attachmentIds resolution (M2):')
  {
    const idsAgent = { session: { header: { cwd: 'D:/work/example' }, deriveMessages: () => [] } }
    const knownId = `sha256:${'b'.repeat(64)}`
    const refs = await service.resolveAttachmentIds([knownId], { agent: idsAgent })
    check('attachmentIds resolve via M2 (lazy register)', refs.length === 1 && refs[0].attachmentId === knownId && refs[0].mediaType === 'image/png' && typeof refs[0].bytes === 'number')
    const deduped = await service.resolveAttachmentIds([knownId, knownId], { agent: idsAgent })
    check('attachmentIds dedupe within list', deduped.length === 1)
    let badFormat = false
    try { await service.resolveAttachmentIds(['att-1', 'sha256:short'], { agent: idsAgent }) } catch (error) { badFormat = String(error.message).includes('内容寻址') }
    check('attachmentIds non-content-addressed rejected', badFormat)
    let unknownRejected = false
    const attachmentsSvc = service.ctx.get('attachments')
    const originalRead = attachmentsSvc.readImage
    attachmentsSvc.readImage = async () => { throw new Error('no such attachment') }
    try { await service.resolveAttachmentIds([`sha256:${'c'.repeat(64)}`], { agent: idsAgent }) } catch (error) { unknownRejected = String(error.message).includes('附件不可解析') }
    attachmentsSvc.readImage = originalRead
    check('attachmentIds unknown id rejected (ATTACHMENT_UNKNOWN)', unknownRejected)
    const noExec = await service.resolveAttachmentIds([knownId])
    check('attachmentIds resolve without exec (id-only)', noExec.length === 1 && noExec[0].attachmentId === knownId)
  }

  // v3 Step 8（F11 输入入口 / N-6）：router/uploadFile service——base64 解码 →
  // 图片魔数拒绝（双通道规避）→ 大小校验 → 落盘 .router-files/（文件名消毒）
  // → M2 registerPath 注册 → { ok:true, path, attachmentId, name }；非法
  // base64 / 写盘失败 / 无工作区 → { ok:false, message, code }（错误码清晰）。
  console.log('uploadFile (F11):')
  {
    const pathModule = await import('node:path')
    const fsModule = await import('node:fs')
    const osModule = await import('node:os')
    const tmpDir = pathModule.join(osModule.tmpdir(), `dsh-agent-router-upload-${Date.now()}`)
    fsModule.mkdirSync(tmpDir, { recursive: true })
    try {
      // 工作区解析：浏览器 RPC 的 direct invocation 不携带会话上下文（宿主网关
      // exact-arguments 断言只放行 request），目标工作区取最近一次 run() 记录的
      // 会话 cwd（最近一次执行会话的工作区；全新会话首条消息即上传 → 无记录 →
      // WORKSPACE_UNAVAILABLE，F-03：不做"必然已运行"假设）。
      await service.run({ agentId: 'vision', task: 'workspace anchor', images: [], exec: { agent: { session: { header: { cwd: tmpDir, delegationDepth: 0 } } } } })
      check('upload workspace anchored from run exec', service.lastWorkspace && service.lastWorkspace.cwd === tmpDir)
      const base64 = (bytes) => Buffer.from(bytes).toString('base64')
      // 成功：音频落盘 + M2 注册（内容寻址 id + workspacePath 物理载体）。
      const okUpload = await service.uploadFile({ name: 'voice.wav', mediaType: 'audio/wav', dataBase64: base64([0x52, 0x49, 0x46, 0x46, 0x01, 0x02]) })
      const expectedPath = pathModule.join(tmpDir, '.router-files', 'voice.wav')
      check('uploadFile writes file and registers', okUpload.ok === true && okUpload.path === expectedPath && okUpload.name === 'voice.wav' && isAttachmentId(okUpload.attachmentId) && fsModule.existsSync(expectedPath))
      check('uploadFile registers M2 entry (id + path)', (await service.registry.byId(okUpload.attachmentId))?.id === okUpload.attachmentId && service.registry.byPath(expectedPath)?.id === okUpload.attachmentId)
      // 文件名消毒沿用既有惯例（downloadToWorkspace 同款字符集 [A-Za-z0-9._-]）。
      const sanitized = await service.uploadFile({ name: 'a b/wav', mediaType: 'audio/wav', dataBase64: base64([1, 2, 3]) })
      check('uploadFile sanitizes file name', sanitized.ok === true && sanitized.name === 'a_b_wav' && sanitized.path === pathModule.join(tmpDir, '.router-files', 'a_b_wav'))
      // F-02（P1 回归）：同名不同内容两次上传 → 第二条追加去重后缀落盘，绝不
      // 静默覆盖已注册附件（内容寻址承诺 id↔bytes，D-1-4）；两文件并存、注册表
      // 两条目各自可读回原字节。注意：smoke 的 fs.readBytes mock 恒返回固定
      // 字节（M2 id 失真），本用例临时改挂真实读盘以校验真实内容哈希。
      const fsService = service.ctx.get('fs')
      const originalReadBytes = fsService.readBytes
      fsService.readBytes = async (target) => fsModule.readFileSync(String(target?.displayPath ?? ''))
      let firstDoc, secondDoc
      try {
        firstDoc = await service.uploadFile({ name: 'notes.docx', mediaType: 'application/octet-stream', dataBase64: base64([1, 2, 3]) })
        secondDoc = await service.uploadFile({ name: 'notes.docx', mediaType: 'application/octet-stream', dataBase64: base64([9, 9, 9]) })
      } finally {
        fsService.readBytes = originalReadBytes
      }
      const firstDocPath = pathModule.join(tmpDir, '.router-files', 'notes.docx')
      const secondDocPath = pathModule.join(tmpDir, '.router-files', 'notes.docx-1')
      check('uploadFile dedupes colliding sanitized names', firstDoc.ok === true && secondDoc.ok === true && firstDoc.path === firstDocPath && secondDoc.name === 'notes.docx-1' && secondDoc.path === secondDocPath && fsModule.existsSync(firstDocPath) && fsModule.existsSync(secondDocPath))
      check('uploadFile collision keeps both M2 entries byte-correct', firstDoc.attachmentId !== secondDoc.attachmentId && (await service.registry.byId(firstDoc.attachmentId))?.id === firstDoc.attachmentId && (await service.registry.byId(secondDoc.attachmentId))?.id === secondDoc.attachmentId && service.registry.byPath(firstDocPath)?.id === firstDoc.attachmentId && service.registry.byPath(secondDocPath)?.id === secondDoc.attachmentId && Buffer.compare(fsModule.readFileSync(firstDocPath), Buffer.from([1, 2, 3])) === 0 && Buffer.compare(fsModule.readFileSync(secondDocPath), Buffer.from([9, 9, 9])) === 0)
      // 大小校验：>25MB → FILE_TOO_LARGE 明确错误码（§4.3.5 校验序列）。
      const big = await service.uploadFile({ name: 'big.bin', mediaType: 'application/octet-stream', dataBase64: base64(new Uint8Array(25 * 1024 * 1024 + 1)) })
      check('uploadFile over 25MB rejected (FILE_TOO_LARGE)', big.ok === false && big.code === 'FILE_TOO_LARGE' && big.message.includes('25MB'))
      // 非法 base64 → INVALID_BASE64。
      const bad = await service.uploadFile({ name: 'x.bin', mediaType: 'application/octet-stream', dataBase64: 'not-valid-!!' })
      check('uploadFile invalid base64 rejected (INVALID_BASE64)', bad.ok === false && bad.code === 'INVALID_BASE64')
      // F-04（P2 回归）：解码前大小预检——超大载荷（且为非法 base64）在解码前
      // 被拒：若先解码必为 INVALID_BASE64，预检先行使之为 FILE_TOO_LARGE
      // （判别解码顺序；wire codec 无大小上限，R7 F-03）。
      const huge = await service.uploadFile({ name: 'huge.bin', mediaType: 'application/octet-stream', dataBase64: '!'.repeat(Math.ceil(26 * 1024 * 1024 * 4 / 3) + 16) })
      check('uploadFile pre-checks payload size before decode (FILE_TOO_LARGE)', huge.ok === false && huge.code === 'FILE_TOO_LARGE' && huge.message.includes('25MB'))
      // 图片魔数 → UNSUPPORTED_MEDIA（uploadFile 不接管图片，避免双通道）。
      const png = await service.uploadFile({ name: 'shot.png', mediaType: 'image/png', dataBase64: base64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) })
      check('uploadFile rejects image magic (UNSUPPORTED_MEDIA)', png.ok === false && png.code === 'UNSUPPORTED_MEDIA')
      // 无会话工作区 → WORKSPACE_UNAVAILABLE 明确报错（可用性黑洞消除）。
      const savedWorkspace = service.lastWorkspace
      service.lastWorkspace = null
      const noWs = await service.uploadFile({ name: 'x.wav', mediaType: 'audio/wav', dataBase64: base64([1, 2]) })
      service.lastWorkspace = savedWorkspace
      check('uploadFile without workspace rejected (WORKSPACE_UNAVAILABLE)', noWs.ok === false && noWs.code === 'WORKSPACE_UNAVAILABLE')
    } finally {
      try {
        const routerFiles = pathModule.join(tmpDir, '.router-files')
        if (fsModule.existsSync(routerFiles)) {
          for (const name of fsModule.readdirSync(routerFiles)) {
            try { fsModule.rmSync(pathModule.join(routerFiles, name), { force: true }) } catch { /* 继续清理其余文件 */ }
          }
          try { fsModule.rmdirSync(routerFiles) } catch { /* 目录可能已被删除 */ }
        }
        try { fsModule.rmdirSync(tmpDir) } catch { /* 沙箱拒绝清理时留待手动删除 */ }
      } catch { /* 忽略清理失败 */ }
    }
  }

  // R12 F-3（P2）：detectAudioVideoMediaType 六魔数分支直接单测——R12 指出仅
  // WAV 经真实字节路径覆盖，mp3(ID3)/flac/ogg/mp4(ftyp)/webm(EBML) 零直接
  // 用例；此处每分支一条正例 + 截断头（长度不足守卫）与误判负例。
  console.log('detectAudioVideoMediaType (F-3):')
  {
    const magic = (...bytes) => new Uint8Array(bytes)
    check('magic wav RIFF/WAVE', detectAudioVideoMediaType(magic(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45)) === 'audio/wav')
    check('magic mp3 ID3', detectAudioVideoMediaType(magic(0x49, 0x44, 0x33, 0x04, 0x00)) === 'audio/mpeg')
    check('magic flac fLaC', detectAudioVideoMediaType(magic(0x66, 0x4c, 0x61, 0x43, 0x00, 0x00)) === 'audio/flac')
    check('magic ogg OggS', detectAudioVideoMediaType(magic(0x4f, 0x67, 0x67, 0x53, 0x00, 0x02)) === 'audio/ogg')
    check('magic mp4 ftyp', detectAudioVideoMediaType(magic(0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d)) === 'video/mp4')
    check('magic webm EBML', detectAudioVideoMediaType(magic(0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x01)) === 'video/webm')
    // 截断头（长度不足守卫不越界，也不误判）。
    check('magic truncated wav', detectAudioVideoMediaType(magic(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0)) === undefined)
    check('magic truncated id3', detectAudioVideoMediaType(magic(0x49, 0x44)) === undefined)
    check('magic truncated flac', detectAudioVideoMediaType(magic(0x66, 0x4c)) === undefined)
    check('magic truncated ogg', detectAudioVideoMediaType(magic(0x4f, 0x67)) === undefined)
    check('magic truncated ftyp', detectAudioVideoMediaType(magic(0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79)) === undefined)
    check('magic truncated ebml', detectAudioVideoMediaType(magic(0x1a, 0x45)) === undefined)
    // 负例：RIFF 但非 WAVE（AVI 容器）；未知字节；空数据。
    check('magic riff-not-wave undefined', detectAudioVideoMediaType(magic(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x41, 0x56, 0x49, 0x20)) === undefined)
    check('magic unknown bytes undefined', detectAudioVideoMediaType(magic(0x00, 0x01, 0x02, 0x03)) === undefined)
    check('magic empty data undefined', detectAudioVideoMediaType(new Uint8Array(0)) === undefined)
  }

  // v3 Step 9（三级展示 L3 / N-7）：router/readWorkspaceFile service——工作区
  // 边界校验（`..`/绝对路径规范化后必须仍在工作区内，PATH_OUTSIDE_WORKSPACE）
  // → fs.resolve/stat → 大小 ≤25MB（FILE_TOO_LARGE）→ readBytes →
  // { ok:true, dataBase64, mediaType?, name }；越界/超限/读失败 → { ok:false,
  // message, code }（错误码语义清晰）。工作区来源同 uploadFile（rememberWorkspace
  // ——一致限制声明：浏览器 RPC 的 direct invocation 不携带会话上下文，目标取
  // 最近一次 run() 记录的会话 cwd）。
  console.log('readWorkspaceFile (L3):')
  {
    const pathModule = await import('node:path')
    const fsModule = await import('node:fs')
    const osModule = await import('node:os')
    const tmpDir = pathModule.join(osModule.tmpdir(), `dsh-agent-router-read-${Date.now()}`)
    const routerFiles = pathModule.join(tmpDir, '.router-files')
    fsModule.mkdirSync(routerFiles, { recursive: true })
    // 真实符号链接夹具的工作区外目标（兄弟目录；finally 兜底清理）。
    let outsideDir = ''
    // RIFF/WAVE 魔数头（mediaType 嗅探用）。
    const wavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 0x01, 0x02])
    fsModule.writeFileSync(pathModule.join(routerFiles, 'voice.wav'), wavBytes)
    try {
      // 工作区锚定：与 uploadFile 同源（rememberWorkspace——最近一次 run() 的 cwd）。
      await service.run({ agentId: 'vision', task: 'workspace anchor', images: [], exec: { agent: { session: { header: { cwd: tmpDir, delegationDepth: 0 } } } } })
      check('read workspace anchored from run exec', service.lastWorkspace && service.lastWorkspace.cwd === tmpDir)
      const base64 = (bytes) => Buffer.from(bytes).toString('base64')
      const fsService = service.ctx.get('fs')
      // 成功：绝对路径（工作区内）→ 临时换挂真实 readBytes（同 uploadFile 碰撞
      // 用例先例）真实读盘 → 魔数嗅探 mediaType（RIFF/WAVE → audio/wav）。
      const originalReadBytes = fsService.readBytes
      fsService.readBytes = async (target) => fsModule.readFileSync(String(target?.displayPath ?? ''))
      let okRead
      try {
        okRead = await service.readWorkspaceFile({ path: pathModule.join(routerFiles, 'voice.wav') })
      } finally {
        fsService.readBytes = originalReadBytes
      }
      check('readWorkspaceFile reads workspace file (magic mediaType)', okRead.ok === true && okRead.dataBase64 === base64(wavBytes) && okRead.mediaType === 'audio/wav' && okRead.name === 'voice.wav')
      // 相对路径（默认 mock readBytes 非魔数字节 → 扩展名回退 mediaType）。
      const relRead = await service.readWorkspaceFile({ path: '.router-files/voice.wav' })
      check('readWorkspaceFile accepts relative in-workspace path', relRead.ok === true && relRead.dataBase64 === base64([0xff, 0xfe, 0x00]) && relRead.mediaType === 'audio/wav' && relRead.name === 'voice.wav')
      // 越界拒绝：`..` 逃逸 / 工作区外绝对路径 → PATH_OUTSIDE_WORKSPACE（规范化判定）。
      const escape = await service.readWorkspaceFile({ path: '../secret.txt' })
      check('readWorkspaceFile rejects parent escape (PATH_OUTSIDE_WORKSPACE)', escape.ok === false && escape.code === 'PATH_OUTSIDE_WORKSPACE')
      const outsideAbs = await service.readWorkspaceFile({ path: pathModule.join(tmpDir, '..', 'outside.txt') })
      check('readWorkspaceFile rejects absolute outside workspace (PATH_OUTSIDE_WORKSPACE)', outsideAbs.ok === false && outsideAbs.code === 'PATH_OUTSIDE_WORKSPACE')
      // 缺失 path → INVALID_REQUEST；无工作区 → WORKSPACE_UNAVAILABLE（同 uploadFile）。
      const missing = await service.readWorkspaceFile({})
      check('readWorkspaceFile missing path rejected (INVALID_REQUEST)', missing.ok === false && missing.code === 'INVALID_REQUEST')
      const savedWorkspace = service.lastWorkspace
      service.lastWorkspace = null
      const noWs = await service.readWorkspaceFile({ path: '.router-files/voice.wav' })
      service.lastWorkspace = savedWorkspace
      check('readWorkspaceFile without workspace rejected (WORKSPACE_UNAVAILABLE)', noWs.ok === false && noWs.code === 'WORKSPACE_UNAVAILABLE')
      // 文件不存在 → FILE_NOT_FOUND（fs.resolve 放行 + stat 未命中）。
      const notFound = await service.readWorkspaceFile({ path: '.router-files/missing.wav' })
      check('readWorkspaceFile missing file rejected (FILE_NOT_FOUND)', notFound.ok === false && notFound.code === 'FILE_NOT_FOUND')
      // 超限：stat.size > 25MB → FILE_TOO_LARGE（读前判定，不浪费读）。
      const originalStat = fsService.stat
      fsService.stat = async () => ({ type: 'file', version: 1, size: 25 * 1024 * 1024 + 1 })
      const big = await service.readWorkspaceFile({ path: '.router-files/voice.wav' })
      fsService.stat = originalStat
      check('readWorkspaceFile over 25MB rejected (FILE_TOO_LARGE)', big.ok === false && big.code === 'FILE_TOO_LARGE' && big.message.includes('25MB'))
      // 目录 → FILE_NOT_FOUND（目录不可作为文件预览）。
      const originalStat2 = fsService.stat
      fsService.stat = async () => ({ type: 'directory', version: 1 })
      const dirRead = await service.readWorkspaceFile({ path: '.router-files' })
      fsService.stat = originalStat2
      check('readWorkspaceFile rejects directory (FILE_NOT_FOUND)', dirRead.ok === false && dirRead.code === 'FILE_NOT_FOUND')
      // 读失败：readBytes 抛错 → READ_FAILED（明确错误码，不静默）。
      const originalRead = fsService.readBytes
      fsService.readBytes = async () => { throw new Error('disk io error') }
      const readFail = await service.readWorkspaceFile({ path: '.router-files/voice.wav' })
      fsService.readBytes = originalRead
      check('readWorkspaceFile read failure rejected (READ_FAILED)', readFail.ok === false && readFail.code === 'READ_FAILED')
      // F-1（R12 P0）：符号链接/联接逃逸——词法判定通过但 realpath 逃逸。
      // 宿主 fs.resolve 的 targetKey = realpath(displayPath)（dsh-fs-local 跟随
      // 符号链接/NTFS 联接），stat/readBytes 全经 targetKey 操作。smoke mock
      // 已扩展 targetKey 形态（默认 targetKey = displayPath，无链接）；此处注入
      // "词法在工作区内、realpath 指向工作区外"的 resolve——旧代码（无二次
      // 校验）下该请求会经链接读穿工作区外字节并返回 ok:true，断言判别力成立。
      const originalResolve = fsService.resolve
      fsService.resolve = async (path, opts) => {
        const cwd = opts && typeof opts.cwd === 'string' && opts.cwd ? opts.cwd : ''
        const displayPath = path.includes(':') || path.startsWith('/') ? path : `${cwd}/${path}`
        if (String(path).endsWith('link.mp3')) return { displayPath, targetKey: 'D:/outside/secret.txt' }
        return { displayPath, targetKey: displayPath }
      }
      const symlinkEscape = await service.readWorkspaceFile({ path: 'link.mp3' })
      fsService.resolve = originalResolve
      check('readWorkspaceFile rejects symlink/junction escape (PATH_OUTSIDE_WORKSPACE)', symlinkEscape.ok === false && symlinkEscape.code === 'PATH_OUTSIDE_WORKSPACE')
      // fs.contains 优先分支（R12：宿主提供 contains——targetKey 包含判定）：
      // contains 恒 false → 工作区内文件也被拒，证明宿主分支被征询而非忽略。
      const originalContains = fsService.contains
      fsService.contains = () => false
      const containsDeny = await service.readWorkspaceFile({ path: '.router-files/voice.wav' })
      fsService.contains = originalContains
      check('readWorkspaceFile honors fs.contains denial (PATH_OUTSIDE_WORKSPACE)', containsDeny.ok === false && containsDeny.code === 'PATH_OUTSIDE_WORKSPACE')
      // 真实符号链接/联接夹具（尽力而为）：Windows 目录联接（junction，无需
      // 管理员/开发者模式）与 POSIX 文件符号链接指向工作区外文件——resolve 以
      // realpath 作 targetKey 时二次校验必须拒绝。创建失败（无符号链接权限）
      // 则跳过；判别力已由上方 mock 注入用例保证。
      try {
        // 工作区外目标必须是 tmpDir 的兄弟目录（在工作区内则 realpath 仍被
        // 包含，夹具失效——realpath 逃逸必须真实逃逸）。
        outsideDir = pathModule.join(pathModule.dirname(tmpDir), `dsh-agent-router-outside-${Date.now()}`)
        fsModule.mkdirSync(outsideDir, { recursive: true })
        fsModule.writeFileSync(pathModule.join(outsideDir, 'secret.txt'), 'TOP SECRET')
        const linkPath = pathModule.join(tmpDir, 'secret-link')
        if (process.platform === 'win32') {
          fsModule.symlinkSync(outsideDir, linkPath, 'junction')
        } else {
          fsModule.symlinkSync(pathModule.join(outsideDir, 'secret.txt'), linkPath, 'file')
        }
        const realResolve = async (path, opts) => {
          const cwd = opts && typeof opts.cwd === 'string' && opts.cwd ? opts.cwd : ''
          const displayPath = path.includes(':') || path.startsWith('/') ? path : `${cwd}/${path}`
          return { displayPath, targetKey: fsModule.realpathSync(displayPath) }
        }
        fsService.resolve = realResolve
        const viaLink = process.platform === 'win32' ? pathModule.join(linkPath, 'secret.txt') : linkPath
        const realLinkEscape = await service.readWorkspaceFile({ path: viaLink })
        fsService.resolve = originalResolve
        check('readWorkspaceFile rejects real symlink/junction escape (PATH_OUTSIDE_WORKSPACE)', realLinkEscape.ok === false && realLinkEscape.code === 'PATH_OUTSIDE_WORKSPACE')
        // Windows 联接需 rmdirSync 移除（目录重解析点；unlinkSync 会 EPERM），
        // POSIX 文件符号链接用 unlinkSync；均失败时 rmSync 兜底（不跟随链接目标）。
        try {
          if (process.platform === 'win32') fsModule.rmdirSync(linkPath)
          else fsModule.unlinkSync(linkPath)
        } catch {
          try { fsModule.rmSync(linkPath, { force: true, recursive: true }) } catch { /* 清理尽力而为 */ }
        }
      } catch { /* 无符号链接权限：跳过真实夹具（mock 注入用例已保证判别力） */ }
    } finally {
      try {
        if (outsideDir) {
          try { fsModule.rmSync(outsideDir, { recursive: true, force: true }) } catch { /* 清理尽力而为 */ }
        }
        if (fsModule.existsSync(routerFiles)) {
          for (const name of fsModule.readdirSync(routerFiles)) {
            try { fsModule.rmSync(pathModule.join(routerFiles, name), { force: true }) } catch { /* 继续清理其余文件 */ }
          }
          try { fsModule.rmdirSync(routerFiles) } catch { /* 目录可能已被删除 */ }
        }
        try { fsModule.rmdirSync(tmpDir) } catch { /* 沙箱拒绝清理时留待手动删除 */ }
      } catch { /* 忽略清理失败 */ }
    }
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
    // stub 服务面：route_agent 执行契约（isEnabled / promptText / record）+
    // 整轮路由回归夹具（listImageVisionAgents / resolveAgent / visionState
    // 保留：若整轮路由被重新引入，下方 image-turn passthrough 断言会失败）。
    const visionState = { enabled: true, agents: [['vision', {}]] }
    const fakeRouter = {
      isEnabled: () => visionState.enabled,
      promptText: () => 'ROUTER-PROMPT',
      listImageVisionAgents: () => visionState.agents,
      resolveAgent: async (id) => (id === 'vision' ? { provider: 'openai', model: 'gpt-4o' } : { error: 'stub' }),
      record: () => {},
    }
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
    check('tool parameters schema', registered.parameters && registered.parameters.properties && registered.parameters.properties.agent && registered.parameters.properties.task && registered.parameters.properties.attachments && registered.parameters.properties.attachments.type === 'array' && registered.parameters.properties.includeImages && registered.parameters.properties.files && registered.parameters.properties.attachmentIds && registered.parameters.properties.attachmentIds.type === 'array' && registered.parameters.properties.attachmentIds.items.type === 'string')
    check('tool output has render', typeof registered.output.render === 'function' && typeof registered.execute === 'function')
    // 图片渲染为纯文本标记（绝不产生图片块，避免文本模型历史被击穿）。
    // image（生成）与 images（视觉注入）都渲染为标记，供 toolview 显示缩略图。
    const rendered = registered.output.render({}, { ok: true, text: '已生成', image: { attachmentId: 'sha256:aa', mediaType: 'image/png', bytes: 4, width: 2, height: 2 }, images: [{ attachmentId: 'sha256:bb', mediaType: 'image/jpeg', bytes: 4, width: 2, height: 2 }], usage: { inputTokens: 0, outputTokens: 0 } })
    check('tool render emits markers not image blocks', rendered.every((block) => block.type === 'text') && rendered.filter((block) => block.text.includes('[router:image:')).length === 2 && rendered.some((block) => block.text.includes('sha256:aa')) && rendered.some((block) => block.text.includes('sha256:bb')))
    // ── 带图轮不再整轮路由（DEC-008 / X-1）：agent/request 对 config 原样返回 ──
    // 整轮路由已移除，插件不再注册 agent/request——带图轮 = 主 agent 轮次，
    // provider/model 恒为主模型（request/context 不变，D-1-1 指标基础）。
    // 钩子未注册时瀑布返回默认 config 即为正确行为（防重新引入回归）。
    {
      const imageBlock = { type: 'image', attachment: { attachmentId: 'sha256:x', mediaType: 'image/png', bytes: 4, width: 2, height: 2 } }
      const agentOf = (messages) => ({ session: { deriveMessages: () => messages } })
      const defaultConfig = async () => ({ provider: 'text-provider', model: 'brain-1' })
      const runRequest = (messages) => root.events.waterfall('agent/request', { agent: agentOf(messages), turn: 1, step: 1, signal: undefined }, defaultConfig)
      const imageTurn = await runRequest([{ role: 'user', content: [{ type: 'text', text: '看图' }, imageBlock] }])
      check('image turn config passes through unchanged (no whole-turn routing)', imageTurn.provider === 'text-provider' && imageTurn.model === 'brain-1')
      const textTurn = await runRequest([{ role: 'user', content: [{ type: 'text', text: '纯文本' }] }])
      check('text turn config passes through unchanged', textTurn.provider === 'text-provider' && textTurn.model === 'brain-1')
      const followupStep = await runRequest([{ role: 'user', content: [{ type: 'text', text: '看图' }, imageBlock] }, { role: 'assistant', content: [{ type: 'text', text: '已回答' }] }])
      check('answered image turn config passes through unchanged', followupStep.provider === 'text-provider' && followupStep.model === 'brain-1')
    }
    await app.dispose()
  }

  // ── route_agent attachmentIds 调用（v3 Step 7 / N-8）：附件 id 直接派发 ──
  // 经 M2 解析（stub 模拟懒注册结果）与 attachments/includeImages 正交可组合
  //（按附件 id 去重并集）；跨通道同 id 只派发一次。
  {
    let tool2 = null
    let executed = null
    const memId = `sha256:${'e'.repeat(64)}`
    const logId = `sha256:${'d'.repeat(64)}`
    let logRef = { id: 'att-1', kind: 'image', attachmentId: logId, mediaType: 'image/png', bytes: 4, width: 2, height: 2 }
    const fakeRouter2 = {
      isEnabled: () => true,
      selectAttachments: () => [logRef],
      resolveAttachmentIds: async (ids) => ids.map((id) => ({ id, kind: 'image', attachmentId: id, mediaType: 'image/png', bytes: 4, width: 2, height: 2 })),
      resolveAgent: async (id) => (id === 'vision' ? { provider: 'openai', model: 'gpt-4o' } : { error: 'stub' }),
      run: async (input) => { executed = input; return { text: '识别完成' } },
      record: () => {},
    }
    const root2 = new Context()
    await root2.plugin({ name: 'stub-router2', apply: (ctx) => ctx.provide('router', fakeRouter2) })
    await root2.plugin({ name: 'stub-tools2', apply: (ctx) => ctx.provide('tools', { register: (definition) => { tool2 = definition; return () => {} } }) })
    await root2.plugin({ name: 'stub-prompt2', apply: (ctx) => ctx.provide('systemPrompt', { section: () => () => {} }) })
    const app2 = root2.plugin({ name: 'smoke-tool2', inject: toolModule.inject, apply: toolModule.apply })
    await app2
    const out = await tool2.execute({ agent: 'vision', task: '识别', attachmentIds: [memId], includeImages: true }, { agent: { session: { header: { cwd: 'D:/work/example' } } }, signal: undefined })
    check('route_agent attachmentIds merged with includeImages', executed && executed.images.length === 2 && executed.images.some((ref) => ref.attachmentId === memId) && executed.images.some((ref) => ref.attachmentId === logId) && out.ok === true && out.text === '识别完成')
    // 跨通道去重：attachmentIds 与日志附件同 id → 并集去重后 1 条。
    logRef = { ...logRef, attachmentId: memId }
    executed = null
    await tool2.execute({ agent: 'vision', task: '识别', attachmentIds: [memId] }, { agent: { session: { header: { cwd: 'D:/work/example' } } }, signal: undefined })
    check('route_agent attachmentIds dedupe across channels', executed && executed.images.length === 1 && executed.images[0].attachmentId === memId)
    await app2.dispose()
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
    check('typert contribution registered', registeredContribution && registeredContribution.invocations.length === 17 && registeredContribution.package === 'dsh-agent-router')
    check('router service provided', typeof root.get('router') === 'object' && root.get('router') !== null)
    check('oauth callback route registered', webRoute && webRoute.kind === 'exact' && webRoute.path === '/router-oauth/callback' && typeof webRoute.handler === 'function')
    // R3 F-3：真实 service 上断言惰性注入点——apply 后 starter 可用但 1455
    // 未监听（替代 oauth-loopback.mjs 对测试自建 fixture 的同义反复断言）。
    const wiredService = root.get('router')
    check('codex loopback starter injected by apply (lazy seam)', typeof wiredService?.codexLoopbackStarter === 'function')
    check('codex loopback stays unstarted after apply (lazy)', wiredService?.codexLoopbackReady !== true)
    await app.dispose()
  }

  // 客户端 UI 真实渲染（迷你 React 驱动整页，结构断言见 client-render.mjs）。
  console.log('client render:')
  await runClientRender(check)

  // M2 附件编址层（v3 Step 5a，MIG-001）：三向映射/懒注册降级/物化缓存会话隔离。
  await runAttachmentTests(check)

  // EVO-002 Step 2/3：ChatGPT preset 凭据模块 + 1455 惰性 loopback 回调服务。
  await runOauthCredentialTests(check)
  await runLoopbackTests(check)

  // EVO-003 Phase 2（C-3）：统计持久化模块测试接入 smoke（runStatsTests 与
  // oauth-credentials 同构导出；独立入口 node tests/stats.mjs 互补——执行包
  // next_commands 两列均绿）。四件套/版本迁移/往返/W-4 内核语义全量回归。
  await runStatsTests(check)
}

// 7.5 准入包装机制验证：真实 LlmRuntime 上的 twin 路由
// （多模态平台 L1 的核心技术风险预演——图片块进入历史、文本大脑不见裸图、
//   包装模型声明 image 通过准入，全部在 rc.7 真实注册表上证明。）
console.log('twin wrapper mechanism (real LlmRuntime):')
{
  const root = new Context()
  const llm = new LlmRuntime(root)
  // ── 模拟"纯文本原适配器"：见图片块即拒绝（复刻 UNSUPPORTED_CONTENT 语义）──
  const delegateCalls = []
  const textAdapter = {
    providerInfo(provider) { return { id: provider, name: 'TextBrain' } },
    providerRetryPolicy() { return undefined },
    async listModels(provider) {
      return [{ provider, id: 'brain-1', name: 'Brain-1', inputModalities: ['text'] }]
    },
    async resolveModel(provider, model) {
      return { provider, id: model, name: model, inputModalities: ['text'], context: { contextWindow: 100_000 }, defaultMaxTokens: 4096 }
    },
    // FIX-001：宿主 0.1.1-rc.2 adapterStream 每次分发先调 prepareCall——
    // 对象字面量夹具必须显式实现（绑定自身方法，镜像宿主基类默认语义）。
    async prepareCall(provider, model, signal) {
      return { model: await textAdapter.resolveModel(provider, model, signal), stream: (options) => textAdapter.stream(options) }
    },
    async *stream(options) {
      delegateCalls.push(options)
      for (const message of options.messages) {
        if (contentHasImage(message.content)) throw new Error('UNSUPPORTED_CONTENT: text adapter saw a raw image block')
      }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'delegated-ok' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'delegated-ok' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
  // ── twin 包装适配器：声明 image、改写图片块后委托原适配器 ─────────────
  // 接管标签：原名 + " + 多模态"（用户可见钩子已生效）。
  const twinRoute = 'text-provider-router'
  const twinAdapter = {
    providerInfo(provider) { return { id: provider, name: 'TextBrain + 多模态' } },
    providerRetryPolicy(provider) { return llm.registration('text-provider').adapter.providerRetryPolicy(provider) },
    async listModels() {
      const listed = await llm.registration('text-provider').adapter.listModels('text-provider')
      return listed.map((model) => ({ ...model, provider: twinRoute, inputModalities: ['text', 'image'] }))
    },
    async resolveModel(_provider, model, signal) {
      const base = await llm.registration('text-provider').adapter.resolveModel('text-provider', model, signal)
      return { ...base, provider: twinRoute, inputModalities: ['text', 'image'] }
    },
    // FIX-001：宿主 0.1.1-rc.2 prepared-dispatch 契约——夹具 twin 同样需要。
    async prepareCall(provider, model, signal) {
      return { model: await twinAdapter.resolveModel(provider, model, signal), stream: (options) => twinAdapter.stream(options) }
    },
    async *stream(options) {
      // 图片块改写：文本大脑收到的是证据文本，日志层保留原件（L3 语义）。
      const rewritten = (options.messages ?? []).map((message) => {
        if (!message || !Array.isArray(message.content)) return message
        let changed = false
        const content = []
        for (const block of message.content) {
          if (block && block.type === 'image') {
            changed = true
            content.push({ type: 'text', text: `[图片附件 ${String(block.attachment?.attachmentId ?? 'unknown')} 已上传：调用视觉工具查看]` })
          } else {
            content.push(block)
          }
        }
        return changed ? { ...message, content } : message
      })
      yield* llm.stream({ ...options, provider: 'text-provider', messages: rewritten })
    },
  }
  llm.registerAdapter(['text-provider'], textAdapter)
  llm.registerAdapter([twinRoute], twinAdapter)

  // 1) 包装模型声明 image：准入检查（resolveModelInfo）放行。
  const twinInfo = await llm.resolveModelInfo(twinRoute, 'brain-1')
  check('twin declares image input (admission passes)', Array.isArray(twinInfo.inputModalities) && twinInfo.inputModalities.includes('image'))
  const rawInfo = await llm.resolveModelInfo('text-provider', 'brain-1')
  check('raw route stays text-only', !rawInfo.inputModalities.includes('image'))
  // 2) 模型选择器可见性与目录镜像。
  const providers = llm.listProviders()
  check('twin route appears in provider list', providers.some((entry) => entry.id === twinRoute))
  const twinProvider = providers.find((entry) => entry.id === twinRoute)
  check('twin labels multimodal takeover', !!twinProvider && twinProvider.name === 'TextBrain + 多模态')
  const twinModels = await llm.listModels(twinRoute)
  check('twin mirrors catalog with own provider id', twinModels.length === 1 && twinModels[0].provider === twinRoute && twinModels[0].inputModalities.includes('image'))
  // 3) 图片轮经 twin：委托完成、原适配器只见改写文本（无裸图片块）。
  const imageMessage = createUserMessage({ content: [{ type: 'text', text: '看看这张图' }, { type: 'image', attachment: { attachmentId: 'sha256:abc', mediaType: 'image/png', bytes: 4, width: 2, height: 2 } }], source: { kind: 'user' } })
  const assembler = new BlockAssembler()
  let twinText = ''
  for await (const chunk of llm.stream({ provider: twinRoute, model: 'brain-1', system: undefined, messages: [imageMessage] })) {
    assembler.push(chunk)
  }
  twinText = assembler.blocks().filter((block) => block.type === 'text').map((block) => block.text).join('')
  check('image turn via twin completes', assembler.finish.kind === 'stop' && twinText === 'delegated-ok')
  check('delegate saw rewritten text, not raw image', delegateCalls.length === 1 && delegateCalls[0].messages[0].content.some((block) => block.type === 'text' && block.text.includes('调用视觉工具查看')) && delegateCalls[0].messages[0].content.every((block) => block.type !== 'image'))
  // 4) 负向见证：裸图片块直接进原适配器必然失败（twin 是唯一放行路径）。
  //  rc.2 语义演进（FIX-001 适配）：宿主 adapterStream 在文本模型边界直接投影
  //  剥离图片块（projectImagesForTextModel）——裸图永不达文本适配器。负向
  //  见证的新形态：宿主边界强制兜底（不依赖适配器自拒），投影后正常完成。
  const rawAssembler = new BlockAssembler()
  for await (const chunk of llm.stream({ provider: 'text-provider', model: 'brain-1', system: undefined, messages: [imageMessage] })) {
    rawAssembler.push(chunk)
  }
  check('raw route projects image blocks at host boundary (negative witness)', rawAssembler.finish.kind === 'stop' && delegateCalls[delegateCalls.length - 1].messages[0].content.every((block) => block.type !== 'image'))
  // 5) 文本轮原样委托（改写零开销、模型身份不变）。
  const textMessage = createUserMessage({ content: [{ type: 'text', text: '普通文本轮' }], source: { kind: 'user' } })
  const textAssembler = new BlockAssembler()
  for await (const chunk of llm.stream({ provider: twinRoute, model: 'brain-1', system: undefined, messages: [textMessage] })) {
    textAssembler.push(chunk)
  }
  check('text turn delegates verbatim', textAssembler.finish.kind === 'stop' && delegateCalls[delegateCalls.length - 1].messages[0].content.length === 1 && delegateCalls[delegateCalls.length - 1].messages[0].content[0].text === '普通文本轮')
}

// 7.6 准入包装模块（L1）：门控注册 / 改写标记 / 热同步 / 卸载
console.log('admission wrapper (L1):')
{
  const { installAdmissionWrapper, createWrapAdapter, rewriteContentDeep, wrappableProviders, minimalImageRewrite, collectMarkers, collectMemorySegments, memorySegmentText, MEMORY_SEGMENT_MAX, WRAP_SUFFIX, MODALITY_ENTRIES } = await import('../lib/wrapper.js')
  const root = new Context()
  const llm = new LlmRuntime(root)
  const delegateCalls = []
  const textAdapter = {
    providerInfo(provider) { return { id: provider, name: 'TextBrain' } },
    providerRetryPolicy() { return undefined },
    async listModels(provider) { return [{ provider, id: 'brain-1', name: 'Brain-1', inputModalities: ['text'] }] },
    async resolveModel(provider, model) {
      return { provider, id: model, name: model, inputModalities: ['text'], context: { contextWindow: 100_000 }, defaultMaxTokens: 4096 }
    },
    // FIX-001：宿主 0.1.1-rc.2 prepared-dispatch 契约。
    async prepareCall(provider, model, signal) {
      return { model: await textAdapter.resolveModel(provider, model, signal), stream: (options) => textAdapter.stream(options) }
    },
    async *stream(options) {
      delegateCalls.push(options)
      for (const message of options.messages) if (contentHasImage(message.content)) throw new Error('UNSUPPORTED_CONTENT')
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'ok' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
  llm.registerAdapter(['text-provider'], textAdapter)
  // 默认模型接管面：接管/恢复写入都记录（saveSelection 写 settings）。
  const defaultWrites = []
  let defaultSelection = { provider: 'text-provider', model: 'brain-1' }
  root.provide('agentDefaultModel', {
    currentSelection: () => ({ ...defaultSelection }),
    saveSelection: async (next) => {
      defaultSelection = { ...next }
      defaultWrites.push({ ...next })
    },
  })
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
  // 可变服务门控面。takeoverDefaultModel: true 维持本段既有接管断言语义
  //（FIX-002 后默认 false——不开启则默认模型永不被触碰）。
  const config = { enabled: true, takeoverDefaultModel: true, visionAgents: [['vision', { name: '视觉', type: 'chat', enabled: true, capabilities: ['image'] }]], generationAgents: [] }
  const fakeService = {
    isEnabled: () => config.enabled,
    getState: () => config,
    listImageVisionAgents: () => config.visionAgents,
    listImageGenerationAgents: () => config.generationAgents,
  }
  // v3 Step 7（N-5/R-6）：MODALITY_ENTRIES 泛化——image 激活 + audio/video 占位
  //（不激活，无处理实现；只占位结构与门控，新增模态 = 追加条目不改骨架）。
  check('MODALITY_ENTRIES has image + audio/video placeholders', MODALITY_ENTRIES.length === 3 && MODALITY_ENTRIES[0].modality === 'image' && MODALITY_ENTRIES[1].modality === 'audio' && MODALITY_ENTRIES[2].modality === 'video')
  const imageGate = MODALITY_ENTRIES[0].stateOf(fakeService)
  check('MODALITY_ENTRIES image gate still matrix-driven', imageGate && Array.isArray(imageGate.vision) && imageGate.vision[0] === 'vision' && Array.isArray(imageGate.generation))
  check('MODALITY_ENTRIES audio/video placeholders inactive', MODALITY_ENTRIES[1].stateOf(fakeService) === null && MODALITY_ENTRIES[2].stateOf(fakeService) === null)
  // cordis 语义：events.dispatch('emit', …) 返回回调数组、由调用方执行
  //（settings 服务与 LlmRuntime 均如此），测试按同款方式触发。
  // settings 服务顺序：bumpRevision（发 document-updated，resolved 尚未提交）
  // → commit（更新 resolved，发 settings/updated）。包装层必须监听后者，
  // 否则"关闭视觉 agent"读到的还是旧配置、包装组残留（真实 bug 回归）。
  const fireDocumentUpdate = (ns, revision) => {
    for (const callback of root.events.dispatch('emit', ['settings/document-updated', ns, revision])) callback(ns, revision)
  }
  const fireSettingsCommit = (ns) => {
    for (const callback of root.events.dispatch('emit', ['settings/updated', ns, null, null, 'update'])) callback(ns, null, null, 'update')
  }
  // 1) 视觉 agent 存在 → 包装注册、声明 image、目录镜像、+多模态 标签。
  const dispose = installAdmissionWrapper(root, fakeService)
  await tick()
  check('wrapper takes over default model', defaultSelection.provider === `text-provider${WRAP_SUFFIX}` && defaultSelection.model === 'brain-1')
  check('wrapper registers twin when vision agent exists', llm.listProviders().some((entry) => entry.id === `text-provider${WRAP_SUFFIX}`))
  const wrapProvider = llm.listProviders().find((entry) => entry.id === `text-provider${WRAP_SUFFIX}`)
  check('wrapper labels +多模态 takeover', !!wrapProvider && wrapProvider.name === 'TextBrain + 多模态')
  const twinInfo = await llm.resolveModelInfo(`text-provider${WRAP_SUFFIX}`, 'brain-1')
  check('wrapper twin declares image input', twinInfo.inputModalities.includes('image'))
  const twinModels = await llm.listModels(`text-provider${WRAP_SUFFIX}`)
  check('wrapper twin mirrors catalog', twinModels.length === 1 && twinModels[0].provider === `text-provider${WRAP_SUFFIX}` && twinModels[0].inputModalities.includes('image'))
  // 2) 图片轮改写：委托方收到 route_agent/includeImages 标记，无裸图片块。
  const imageMessage = createUserMessage({ content: [{ type: 'text', text: '看图' }, { type: 'image', attachment: { attachmentId: 'sha256:abc', mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'shot.png' } }], source: { kind: 'user' } })
  const assembler = new BlockAssembler()
  for await (const chunk of llm.stream({ provider: `text-provider${WRAP_SUFFIX}`, model: 'brain-1', system: undefined, messages: [imageMessage] })) assembler.push(chunk)
  const lastCall = delegateCalls[delegateCalls.length - 1]
  check('wrapper image turn completes', assembler.finish.kind === 'stop')
  // 完整标记进 system（大脑不复述）；user 消息里的图片块被整体移除——
  // 不留任何占位文本（占位也会被大脑当"用户说的话"复述）。
  check('wrapper delegate sees route_agent marker in system', lastCall && typeof lastCall.system === 'string' && lastCall.system.includes('route_agent') && lastCall.system.includes('"vision"') && lastCall.system.includes('includeImages') && lastCall.system.includes('shot.png'))
  check('wrapper delegate sees no image remnants in message', lastCall && lastCall.messages[0].content.every((block) => block.type !== 'image') && !lastCall.messages[0].content.some((block) => block.type === 'text' && (block.text.includes('处理说明') || block.text.includes('图片'))))
  // 日志原件（F3）：agent-loop 的日志消息与 deriveMessages 共享对象引用，
  // 改写只允许出现在模型输入层——stream 后日志里的 user message 必须仍是
  // 图片块（否则气泡会显示改写标记，即"图片显示有问题"的泄漏形态）。
  {
    const loggedMessage = createUserMessage({ content: [{ type: 'text', text: '看图' }, { type: 'image', attachment: { attachmentId: 'sha256:log', mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'shot.png' } }], source: { kind: 'user' } })
    const logAssembler = new BlockAssembler()
    for await (const chunk of llm.stream({ provider: `text-provider${WRAP_SUFFIX}`, model: 'brain-1', system: undefined, messages: [loggedMessage] })) logAssembler.push(chunk)
    check('log keeps original image block (F3)', logAssembler.finish.kind === 'stop' && loggedMessage.content.some((block) => block.type === 'image') && !loggedMessage.content.some((block) => block.type === 'text' && block.text.includes('route_agent')))
  }
  // ── 能力分级改写（v3 Step 3 / N-4）：原生多模态主模型 → 图片块保真直传 ──
  // 注册一个原生多模态原适配器：resolveModel 声明 ['text','image']、stream
  // 接受图片块不抛错。经其包装路由发带图消息 → 委托方收到原图（零改写、
  // 零 system 标记）；能力探测失败（resolveModel 抛错）→ 回落安全改写。
  {
    const mmDelegateCalls = []
    const mmAdapter = {
      providerInfo(provider) { return { id: provider, name: 'NativeBrain' } },
      providerRetryPolicy() { return undefined },
      async listModels(provider) { return [{ provider, id: 'mm-1', name: 'MM-1', inputModalities: ['text', 'image'] }] },
      async resolveModel(provider, model) {
        // metaless-1：元数据缺失 inputModalities（不代表真实能力）——包装层
        // 覆写声明后准入照常放行，但流内能力探测得 false → 安全回落改写
        // （§5.2.3 BC-2 场景：宁可改写不可漏图击穿端点）。
        if (model === 'metaless-1') return { provider, id: model, name: model, context: { contextWindow: 100_000 }, defaultMaxTokens: 4096 }
        return { provider, id: model, name: model, inputModalities: ['text', 'image'], context: { contextWindow: 100_000 }, defaultMaxTokens: 4096 }
      },
      // FIX-001：宿主 0.1.1-rc.2 prepared-dispatch 契约。
      async prepareCall(provider, model, signal) {
        return { model: await mmAdapter.resolveModel(provider, model, signal), stream: (options) => mmAdapter.stream(options) }
      },
      async *stream(options) {
        mmDelegateCalls.push(options)
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: 'mm-ok' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'mm-ok' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }
    llm.registerAdapter(['mm-provider'], mmAdapter)
    const fireAdapters = () => {
      for (const callback of root.events.dispatch('emit', ['llm/adapters-updated'])) callback()
    }
    fireAdapters()
    await tick()
    // 直传分支：带图轮经包装路由 → 原适配器收到裸图片块（保真）、无 system 标记。
    const mmImage = createUserMessage({ content: [{ type: 'text', text: '直接看图' }, { type: 'image', attachment: { attachmentId: 'sha256:mm', mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'mm-shot.png' } }], source: { kind: 'user' } })
    const mmAssembler = new BlockAssembler()
    for await (const chunk of llm.stream({ provider: `mm-provider${WRAP_SUFFIX}`, model: 'mm-1', system: undefined, messages: [mmImage] })) mmAssembler.push(chunk)
    const mmCall = mmDelegateCalls[mmDelegateCalls.length - 1]
    check('native multimodal delegate sees raw image (preserveImageInput)', mmAssembler.finish.kind === 'stop' && !!mmCall && mmCall.messages[0].content.some((block) => block.type === 'image') && (mmCall.system === undefined || mmCall.system === null || mmCall.system === ''))
    // 日志原件不变（F3 对直传分支同样成立）。
    check('native passthrough keeps log original (F3)', mmImage.content.some((block) => block.type === 'image'))
    // 文本轮直传：无改写、模型身份不变（文本轮零开销对多模态原模型同样成立）。
    const mmText = createUserMessage({ content: [{ type: 'text', text: '纯文本' }], source: { kind: 'user' } })
    for await (const chunk of llm.stream({ provider: `mm-provider${WRAP_SUFFIX}`, model: 'mm-1', system: undefined, messages: [mmText] })) mmAssembler.push(chunk)
    const mmTextCall = mmDelegateCalls[mmDelegateCalls.length - 1]
    check('native text turn delegates verbatim', !!mmTextCall && mmTextCall.messages[0].content.length === 1 && mmTextCall.messages[0].content[0].text === '纯文本')
    // 能力探测失败回落：metaless-1 的 resolveModel 不含 inputModalities
    //（元数据缺失）→ best-effort 判 false → 安全改写（无裸图块到达原适配器、
    // system 带 route_agent 标记）。
    const flakyImage = createUserMessage({ content: [{ type: 'text', text: '看图' }, { type: 'image', attachment: { attachmentId: 'sha256:flaky', mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'f.png' } }], source: { kind: 'user' } })
    const flakyAssembler = new BlockAssembler()
    for await (const chunk of llm.stream({ provider: `mm-provider${WRAP_SUFFIX}`, model: 'metaless-1', system: undefined, messages: [flakyImage] })) flakyAssembler.push(chunk)
    const flakyCall = mmDelegateCalls[mmDelegateCalls.length - 1]
    check('capability probe failure falls back to safe rewrite', flakyAssembler.finish.kind === 'stop' && !!flakyCall && flakyCall.messages[0].content.every((block) => block.type !== 'image') && typeof flakyCall.system === 'string' && flakyCall.system.includes('route_agent'))
    // 清理：注销 mm-provider 包装，避免污染后续门控断言（重新 fire adapters 事件）。
    config.visionAgents = [['vision', { name: '视觉', type: 'chat', enabled: true, capabilities: ['image'] }]]
    fireAdapters()
    await tick()
  }
  // 图生图分流：识别 agent 与生图 agent 并存时，system 标记给大脑两个选项。
  const genMarker = minimalImageRewrite({ attachment: { attachmentId: 'sha256:g', mediaType: 'image/png', bytes: 1, width: 1, height: 1, name: 'ref.png' } }, { vision: ['vision'], generation: ['draw'] })
  check('marker offers recognition and generation routes', typeof genMarker === 'string' && genMarker.includes('视觉 agent') && genMarker.includes('"vision"') && genMarker.includes('生图 agent') && genMarker.includes('"draw"') && genMarker.includes('图生图') && genMarker.includes('includeImages'))
  // 标记收集按 attachmentId 去重（历史轮不再重复注入 system）。
  const markerList = collectMarkers([imageMessage, imageMessage], [{ modality: 'image', state: { vision: ['vision'], generation: [] }, marker: minimalImageRewrite, rewrite: () => null }])
  check('collectMarkers dedupes by attachment', markerList.length === 1 && markerList[0].includes('sha256:abc'))
  // 历史图不再标记：已回答轮次的图由视觉工具承接，后续文本轮不得重复注入（否则大脑重复路由）。
  const historicMarkers = collectMarkers([imageMessage, createUserMessage({ content: [{ type: 'text', text: '后续文本轮' }], source: { kind: 'user' } })], [{ modality: 'image', state: { vision: ['vision'], generation: [] }, marker: minimalImageRewrite, rewrite: () => null }])
  check('collectMarkers skips answered history images', historicMarkers.length === 0)

  // ── imageMemory（v3 Step 4 / N-2 / R-3）：历史图 → system 记忆段 ──────────
  // 单元面：回写/读取/TTL 边界/LRU 淘汰与刷新/文本规整与截断/条数上限；
  // 集成面：真实 twin 路由上图片轮后文本追问轮的 system 注入与消息层零痕迹。
  {
    const { rememberImage, recallImage, clearImageMemory, imageMemorySize, IMAGE_MEMORY_MAX_ENTRIES, IMAGE_MEMORY_TTL_MS, IMAGE_MEMORY_TEXT_MAX } = await import('../lib/memory.js')
    clearImageMemory()
    // 单元：回写 + 读取往返；文本规整为单行；非法入参拒绝。
    check('remember/recall round-trips', rememberImage('sha256:u1', '一张架构图：五层结构') === true && recallImage('sha256:u1')?.text === '一张架构图：五层结构')
    rememberImage('sha256:norm', '第一行\n\n第二行   多空格')
    check('memory text normalized to single line', recallImage('sha256:norm')?.text === '第一行 第二行 多空格')
    rememberImage('sha256:cap', 'x'.repeat(IMAGE_MEMORY_TEXT_MAX + 100))
    check('memory text capped at limit', recallImage('sha256:cap')?.text.length === IMAGE_MEMORY_TEXT_MAX)
    check('invalid id/text rejected', rememberImage('', 'x') === false && rememberImage('sha256:e', '   ') === false && recallImage('') === null)
    // 单元：TTL 边界（到期即失效）。
    rememberImage('sha256:ttl', '过期测试', 1_000)
    check('recall within TTL hits', recallImage('sha256:ttl', 1_000 + IMAGE_MEMORY_TTL_MS - 1)?.text === '过期测试')
    check('recall at TTL expiry misses', recallImage('sha256:ttl', 1_000 + IMAGE_MEMORY_TTL_MS) === null)
    // 单元：LRU 淘汰（超限逐出最旧）与命中刷新（recency）。
    clearImageMemory()
    for (let index = 0; index <= IMAGE_MEMORY_MAX_ENTRIES; index++) rememberImage(`sha256:lru${index}`, `lru${index}`, 5_000 + index)
    check('LRU evicts oldest beyond cap', recallImage('sha256:lru0', 6_000) === null && recallImage(`sha256:lru${IMAGE_MEMORY_MAX_ENTRIES}`, 6_000)?.text === `lru${IMAGE_MEMORY_MAX_ENTRIES}`)
    recallImage('sha256:lru1', 6_000)
    rememberImage('sha256:lru-new', 'new', 7_000)
    check('recall refreshes LRU recency', recallImage('sha256:lru1', 7_000) !== null && recallImage('sha256:lru2', 7_000) === null)
    // 单元：collectMemorySegments 条数上限（最近 N 条按写入时间）。
    //（写入时间用真实时钟基准的递增值——collectMemorySegments 内部读取
    //  用真实时钟，伪造 at=1_000 会被 TTL 判过期。）
    clearImageMemory()
    const capBase = Date.now()
    for (let index = 0; index < 8; index++) rememberImage(`sha256:m${index}`, `描述${index}`, capBase + index)
    const imageEntry = { modality: 'image', state: { vision: ['vision'], generation: [] }, marker: minimalImageRewrite, rewrite: () => null }
    const manyHistory = [createUserMessage({ content: Array.from({ length: 8 }, (_, index) => ({ type: 'image', attachment: { attachmentId: `sha256:m${index}`, mediaType: 'image/png', bytes: 1, width: 1, height: 1, name: `m${index}.png` } })), source: { kind: 'user' } }), createUserMessage({ content: [{ type: 'text', text: '追问' }], source: { kind: 'user' } })]
    const cappedSegments = collectMemorySegments(manyHistory, [imageEntry])
    check('memory segments capped at recent 5', MEMORY_SEGMENT_MAX === 5 && cappedSegments.length === 5 && cappedSegments[0].includes('描述7') && !cappedSegments.some((segment) => segment.includes('描述0') || segment.includes('描述1') || segment.includes('描述2')))
    // 单元：记忆段格式——含附件 id、描述与"不可信证据"标注（BC-4）。
    const singleSegment = memorySegmentText('arch.png', 'sha256:fmt', '五层架构图')
    check('memory segment carries id and untrust annotation', singleSegment.includes('此前识别') && singleSegment.includes('附件 id sha256:fmt') && singleSegment.includes('五层架构图') && singleSegment.includes('不可信证据'))
    // 单元：当前轮同 id 的图不做记忆段双注入（marker 已承载）。
    clearImageMemory()
    rememberImage('sha256:both', '同图重发')
    const currentTurnMessage = createUserMessage({ content: [{ type: 'text', text: '再看一次' }, { type: 'image', attachment: { attachmentId: 'sha256:both', mediaType: 'image/png', bytes: 1, width: 1, height: 1, name: 'again.png' } }], source: { kind: 'user' } })
    const historyOnly = createUserMessage({ content: [{ type: 'image', attachment: { attachmentId: 'sha256:both', mediaType: 'image/png', bytes: 1, width: 1, height: 1, name: 'again.png' } }], source: { kind: 'user' } })
    check('current-turn image not double-injected as memory', collectMemorySegments([historyOnly, currentTurnMessage], [imageEntry]).length === 0)
    // 单元：未命中历史图 → 无记忆段（Step 3 行为保持）。
    clearImageMemory()
    const coldHistory = createUserMessage({ content: [{ type: 'image', attachment: { attachmentId: 'sha256:cold', mediaType: 'image/png', bytes: 1, width: 1, height: 1, name: 'cold.png' } }], source: { kind: 'user' } })
    const coldFollowUp = createUserMessage({ content: [{ type: 'text', text: '刚才图里是什么' }], source: { kind: 'user' } })
    check('memory miss yields no segment (Step 3 behavior)', collectMemorySegments([coldHistory, coldFollowUp], [imageEntry]).length === 0)
    // 集成：图片轮（已回答）后文本追问轮，经 twin 路由——system 收到记忆段、
    // 消息层零图片痕迹、无当前轮 marker（历史轮不重复注入行为指令）。
    clearImageMemory()
    rememberImage('sha256:hist', '一张架构图：最上层是适配层')
    const histImageMessage = createUserMessage({ content: [{ type: 'text', text: '看这张架构图' }, { type: 'image', attachment: { attachmentId: 'sha256:hist', mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'arch.png' } }], source: { kind: 'user' } })
    const answeredTurn = createAssistantMessage({ content: [{ type: 'text', text: '已识别，见工具结果' }], provider: 'text-provider', model: 'brain-1' })
    const followUpTurn = createUserMessage({ content: [{ type: 'text', text: '刚才图里最上层是什么' }], source: { kind: 'user' } })
    const memAssembler = new BlockAssembler()
    for await (const chunk of llm.stream({ provider: `text-provider${WRAP_SUFFIX}`, model: 'brain-1', system: undefined, messages: [histImageMessage, answeredTurn, followUpTurn] })) memAssembler.push(chunk)
    const memCall = delegateCalls[delegateCalls.length - 1]
    check('follow-up text turn injects memory segment into system', memAssembler.finish.kind === 'stop' && typeof memCall.system === 'string' && memCall.system.includes('此前识别') && memCall.system.includes('sha256:hist') && memCall.system.includes('一张架构图'))
    check('memory turn keeps message layer clean', memCall.messages.every((message) => (message.content ?? []).every((block) => block.type !== 'image' && !(block.type === 'text' && block.text.includes('route_agent')))))
    check('history turn injects no current-turn marker', typeof memCall.system === 'string' && !memCall.system.includes('includeImages'))
    // 集成：当前轮新图 + 历史已识别图并存 → marker（当轮指令）与记忆段
    //（历史描述）同时进 system，且互不混淆。
    rememberImage('sha256:old', '旧图：登录页截图')
    const oldImageTurn = createUserMessage({ content: [{ type: 'image', attachment: { attachmentId: 'sha256:old', mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'old.png' } }], source: { kind: 'user' } })
    const oldAnswer = createAssistantMessage({ content: [{ type: 'text', text: '已识别旧图' }], provider: 'text-provider', model: 'brain-1' })
    const newImageTurn = createUserMessage({ content: [{ type: 'text', text: '再看看这张新的' }, { type: 'image', attachment: { attachmentId: 'sha256:newimg', mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'new.png' } }], source: { kind: 'user' } })
    const mixedAssembler = new BlockAssembler()
    for await (const chunk of llm.stream({ provider: `text-provider${WRAP_SUFFIX}`, model: 'brain-1', system: undefined, messages: [oldImageTurn, oldAnswer, newImageTurn] })) mixedAssembler.push(chunk)
    const mixedCall = delegateCalls[delegateCalls.length - 1]
    check('marker and memory segment coexist per turn boundary', mixedAssembler.finish.kind === 'stop' && typeof mixedCall.system === 'string' && mixedCall.system.includes('includeImages') && mixedCall.system.includes('sha256:newimg') && mixedCall.system.includes('此前识别') && mixedCall.system.includes('sha256:old') && !mixedCall.system.includes('此前识别：一张架构图'))
    check('memory does not leak into other ids segments', typeof mixedCall.system === 'string' && !mixedCall.system.includes('sha256:hist'))
    clearImageMemory()
  }
  // 3) 嵌套 tool-result 中的图片块同样被改写（原文本适配器会递归拒绝）。
  const nestedResult = rewriteContentDeep([{ type: 'tool-result', callId: 'c1', content: [{ type: 'image', attachment: { attachmentId: 'sha256:n', mediaType: 'image/png', bytes: 1, width: 1, height: 1 } }, { type: 'text', text: 'x' }] }], [{ modality: 'image', state: { vision: ['vision'], generation: [] }, marker: minimalImageRewrite, rewrite: () => null }])
  check('rewriteContentDeep reaches nested tool-result', nestedResult.changed === true && nestedResult.content[0].content.every((block) => block.type === 'text'))
  // 4) 门控：关闭视觉 agent → settings/updated 提交后包装卸载、默认模型恢复。
  config.visionAgents = []
  // 负向见证：document-updated（resolved 未提交）不得触发卸载——曾因监听
  // 该事件导致"关闭视觉 agent 后 +多模态 组残留"（真实 bug 回归）。
  fireDocumentUpdate('router', 2)
  check('wrapper ignores document-updated (stale resolved)', llm.listProviders().some((entry) => entry.id === `text-provider${WRAP_SUFFIX}`))
  fireSettingsCommit('router')
  await tick()
  check('wrapper drops twin when vision agents disabled', !llm.listProviders().some((entry) => entry.id === `text-provider${WRAP_SUFFIX}`))
  check('wrapper restores default model on disable', defaultSelection.provider === 'text-provider')
  // 5) 门控：总开关关闭 → 同样不注册。
  config.enabled = false
  config.visionAgents = [['vision', { name: '视觉', type: 'chat', enabled: true, capabilities: ['image'] }]]
  fireSettingsCommit('router')
  check('wrapper respects master switch', !llm.listProviders().some((entry) => entry.id === `text-provider${WRAP_SUFFIX}`))
  // 6) 恢复 + adapters 事件热同步；新 provider 出现即补包装；默认模型再接管。
  config.enabled = true
  fireSettingsCommit('router')
  llm.registerAdapter(['another-provider'], { ...textAdapter, providerInfo(provider) { return { id: provider, name: 'Another' } } })
  await tick()
  check('wrapper hot-syncs on adapters event', llm.listProviders().some((entry) => entry.id === `another-provider${WRAP_SUFFIX}`))
  check('wrapper re-takes over default model', defaultSelection.provider === `text-provider${WRAP_SUFFIX}`)
  // 6b) FIX-002 用户主权：一次性接管后用户手动改回原生 → 后续 sync 事件
  //（session 切换/adapters/设置变更）不再强制覆盖回 twin。
  defaultSelection = { provider: 'text-provider', model: 'brain-1' }
  fireSettingsCommit('router')
  await tick()
  check('user revert respected after one-shot takeover (FIX-002)', defaultSelection.provider === 'text-provider')
  // 6c) FIX-002 开关关闭：默认模型永不被触碰（flag=false 时 sync 直接跳过接管）。
  config.takeoverDefaultModel = false
  fireSettingsCommit('router')
  await tick()
  check('takeover off never touches default model (FIX-002)', defaultSelection.provider === 'text-provider')
  check('wrappableProviders excludes twins', wrappableProviders(llm).every((provider) => !provider.endsWith(WRAP_SUFFIX)) && wrappableProviders(llm).includes('text-provider'))
  // 6d) FIX-002-R7 F4 不变量③（开关关回还原——服务端 restore 写路径）：6c 的
  // 前置是"用户已手动改回原生后关开关"——restore 分支虽进入但写被跳过
  //（provider 已非 twin），对还原写路径是 vacuous pass。此处前置改为"接管
  // 在位（默认模型停在 twin）"再关开关：restore 写必须真实执行——断言端态 +
  // 恰一次 saveSelection 写 + 写入内容为原生 provider（FIX-002 之前代码无
  // 开关，事件后默认模型仍停在 twin 且零写，必败）。
  config.takeoverDefaultModel = true
  fireSettingsCommit('router')
  await tick()
  check('wrapper re-arms takeover after switch back on', defaultSelection.provider === `text-provider${WRAP_SUFFIX}`)
  const switchOffWrites = defaultWrites.length
  config.takeoverDefaultModel = false
  fireSettingsCommit('router')
  await tick()
  check('switch-off restores default model while takeover in place (invariant ③)', defaultSelection.provider === 'text-provider' && defaultWrites.length === switchOffWrites + 1 && defaultWrites[switchOffWrites].provider === 'text-provider')
  // 7) 卸载器释放全部注册并恢复默认模型。（FIX-002-R7 F4：6b/6c/6d 之后
  // tookOverFrom 已清空、默认模型已在原生 provider 上——直接 dispose 的
  // "还原"断言成空转（R6-F1 同类掏空教训）。先重新启用开关 + 事件重新
  // 接管，dispose 时默认模型真实停在 twin 上，还原分支才真实执行：补断言
  // 恰一次还原写 + 写入内容为原生 provider——还原写路径被删改即败。）
  config.takeoverDefaultModel = true
  fireSettingsCommit('router')
  await tick()
  check('wrapper re-takes over before uninstall (restore branch armed)', defaultSelection.provider === `text-provider${WRAP_SUFFIX}`)
  const disposeWrites = defaultWrites.length
  dispose()
  await tick()
  check('wrapper uninstaller removes all twins', !llm.listProviders().some((entry) => String(entry.id).endsWith(WRAP_SUFFIX)))
  check('wrapper uninstaller restores default model', defaultSelection.provider === 'text-provider')
  check('uninstall restore executes exactly one write (invariant ③ dispose path)', defaultWrites.length === disposeWrites + 1 && defaultWrites[disposeWrites].provider === 'text-provider')
  // 8) createWrapAdapter 对已消失原适配器明确报错。
  const orphan = createWrapAdapter(llm, 'missing-provider', [{ modality: 'image', state: { vision: ['vision'], generation: [] }, marker: minimalImageRewrite, rewrite: () => null }])
  let orphanRejected = false
  try { await orphan.resolveModel('x', 'y') } catch (error) { orphanRejected = String(error.message).includes('no adapter registered') }
  check('twin without original adapter fails loud', orphanRejected)
  // 9) FIX-002-R7 F4 不变量④（遗留剥离——smoke 级正式断言，F2 形式化）：
  // 模拟 FIX-002 之前版本的遗留状态——旧版无条件接管已把默认选择锁在 twin
  // 上，而新安装的 wrapper 无 tookOverFrom 记忆（全新闭包、开关默认 false）。
  // 首次 sync 剥离一次还原原生（FIX-002 之前代码无剥离分支，默认模型停在
  // twin 零写——必败）；此后用户手动再选 twin，后续 sync 一律尊重（零再剥
  // 零写入——pre-F2 代码（无 legacyStripped 标记）首个事件即再剥，端态 +
  // 写计数双败）；dispose 不再剥（标记已消费）；重装（丢失安装级记忆的自愈
  // 通道）遇遗留状态再剥一次——若标记退化为模块级（重装不重置），重装后
  // 不剥，此断言守护闭包级设计。
  {
    config.takeoverDefaultModel = false
    config.enabled = true
    config.visionAgents = [['vision', { name: '视觉', type: 'chat', enabled: true, capabilities: ['image'] }]]
    defaultSelection = { provider: `text-provider${WRAP_SUFFIX}`, model: 'brain-1' }
    const legacyWrites = defaultWrites.length
    const legacyDispose = installAdmissionWrapper(root, fakeService)
    await tick()
    check('legacy takeover stripped once on fresh install (invariant ④)', defaultSelection.provider === 'text-provider' && defaultWrites.length === legacyWrites + 1 && defaultWrites[legacyWrites].provider === 'text-provider' && llm.listProviders().some((entry) => entry.id === `text-provider${WRAP_SUFFIX}`))
    // one-shot：用户重新手动选择 twin → 后续 sync 事件（settings/adapters/
    // settings 三连）零再剥、零写入。
    defaultSelection = { provider: `text-provider${WRAP_SUFFIX}`, model: 'brain-1' }
    const oneshotWrites = defaultWrites.length
    fireSettingsCommit('router')
    await tick()
    for (const callback of root.events.dispatch('emit', ['llm/adapters-updated'])) callback()
    await tick()
    fireSettingsCommit('router')
    await tick()
    check('no re-strip after user re-selects twin (legacyStripped one-shot)', defaultSelection.provider === `text-provider${WRAP_SUFFIX}` && defaultWrites.length === oneshotWrites)
    // dispose：标记已消费 → 卸载零写、默认模型不动（pre-F2 代码 dispose 会
    // 再剥一次——写计数或端态必败其一）。
    const legacyDisposeWrites = defaultWrites.length
    legacyDispose()
    await tick()
    check('dispose writes nothing after marker consumed', defaultWrites.length === legacyDisposeWrites && defaultSelection.provider === `text-provider${WRAP_SUFFIX}`)
    // 重装自愈：全新闭包重置标记——遗留状态再剥恰一次（守护闭包级标记，
    // 排斥模块级退化）。
    defaultSelection = { provider: `text-provider${WRAP_SUFFIX}`, model: 'brain-1' }
    const reinstallWrites = defaultWrites.length
    const legacyDispose2 = installAdmissionWrapper(root, fakeService)
    await tick()
    check('reinstall strips legacy takeover once more (self-heal channel)', defaultSelection.provider === 'text-provider' && defaultWrites.length === reinstallWrites + 1 && defaultWrites[reinstallWrites].provider === 'text-provider')
    legacyDispose2()
    await tick()
  }
}

// 7.7 pre-step（v3 Step 6 / N-3）：图片轮 reminder 注入（带 id）+ 逃生组分级改写兜底
// 宿主 agent/pre-step 契约（dsh-agent-loop）：waterfall 收到 { agent, messages, turn,
// step, signal }，next() 产出默认 decision { kind:'enter', messages }——handler 返回
// 修改后的 decision.messages，宿主把 decision.messages 追加为会话 user/message 事件
//（V-DSH-1 持久化假设在宿主源码得到印证：pre-step 决策消息即会话事件）。本测试用
// 与宿主同构的 events.waterfall 驱动，验证：① 图片轮注入带 id 的 reminder（包装路由
// 不改写——主改写面留给 wrapper stream）；② 逃生组（非 -router 路由）经能力分级改写
// 兜底——纯文本主模型无裸图块到达模型、原生多模态保真直传；③ 纯文本轮零注入（负向）。
{
  const { installPreStep, collectReminder, rewriteImageTurnsToMarkers } = await import('../lib/prestep.js')
  const { WRAP_SUFFIX } = await import('../lib/wrapper.js')
  const root = new Context()
  const llm = new LlmRuntime(root)
  // 逃生组用独立 provider 名（'escape-provider'/'mm-escape-provider'）：wrapper.js 的
  // 能力查询缓存是模块级 60s TTL，避免与 7.5/7.6 块的历史探测键互相污染。
  const escapeAdapter = {
    providerInfo(provider) { return { id: provider, name: 'EscapeText' } },
    providerRetryPolicy() { return undefined },
    async listModels(provider) { return [{ provider, id: 'brain-1', name: 'Brain-1', inputModalities: ['text'] }] },
    async resolveModel(provider, model) {
      return { provider, id: model, name: model, inputModalities: ['text'], context: { contextWindow: 100_000 }, defaultMaxTokens: 4096 }
    },
    // FIX-001：宿主 0.1.1-rc.2 prepared-dispatch 契约。
    async prepareCall(provider, model, signal) {
      return { model: await escapeAdapter.resolveModel(provider, model, signal), stream: (options) => escapeAdapter.stream(options) }
    },
    async *stream() { yield { type: 'finish', reason: { kind: 'stop' } } },
  }
  const mmEscapeAdapter = {
    ...escapeAdapter,
    async resolveModel(provider, model) {
      return { provider, id: model, name: model, inputModalities: ['text', 'image'], context: { contextWindow: 100_000 }, defaultMaxTokens: 4096 }
    },
    // FIX-001：spread 复制的 prepareCall 闭包绑定 escapeAdapter.resolveModel
    //（纯文本元数据）会导致多模态直传被投影剥图——必须覆写为绑定自身。
    async prepareCall(provider, model, signal) {
      return { model: await mmEscapeAdapter.resolveModel(provider, model, signal), stream: (options) => mmEscapeAdapter.stream(options) }
    },
  }
  llm.registerAdapter(['escape-provider'], escapeAdapter)
  llm.registerAdapter(['mm-escape-provider'], mmEscapeAdapter)
  // 可变门控面：与 7.6 块同款 fakeService 形状（isEnabled + 目录列表）。
  const service = {
    isEnabled: () => true,
    listImageVisionAgents: () => [['vision', { name: '视觉', type: 'chat', enabled: true, capabilities: ['image'] }]],
    listImageGenerationAgents: () => [['draw', { name: '画图', type: 'image', enabled: true }]],
  }
  const dispose = installPreStep(root, service)
  // 与宿主同构的瀑布驱动：默认 decision = { kind:'enter', messages: claimed 副本 }。
  const dispatch = (agent, messages, turn = 1) =>
    root.events.waterfall('agent/pre-step', { agent, messages, turn, step: 1, signal: undefined },
      () => Promise.resolve({ kind: 'enter', messages: [...messages] }))
  // 内容寻址 id 必须匹配 /^sha256:[0-9a-f]{64}$/i（M2 isAttachmentId 守卫）——
  // reminder 只携带经 M2 寻址语义的内容寻址 id（架构 §8 Step 6：id 来自当轮附件块）。
  const contentId = `sha256:${'a'.repeat(64)}`
  const imageMessage = createUserMessage({ content: [{ type: 'text', text: '看图' }, { type: 'image', attachment: { attachmentId: contentId, mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'shot.png' } }], source: { kind: 'user' } })

  // ① 图片轮（包装路由）：注入带 id 的 reminder（通道①），不改写（wrapper stream 主改写面）。
  const twinAgent = { options: { provider: `escape-provider${WRAP_SUFFIX}`, model: 'brain-1' } }
  const twinDecision = await dispatch(twinAgent, [imageMessage])
  check('image turn on wrapper route injects plugin reminder', twinDecision.kind === 'enter' && twinDecision.messages.length === 2 && twinDecision.messages[1].role === 'user' && twinDecision.messages[1].source.kind === 'plugin')
  check('reminder carries a message id (session validation)', typeof twinDecision.messages[1].id === 'string' && twinDecision.messages[1].id.length > 0)
  check('reminder carries attachment id + route_agent instruction', twinDecision.messages[1].content.some((b) => b.type === 'text' && b.text.includes(contentId) && b.text.includes('route_agent') && b.text.includes('includeImages') && b.text.includes('attachmentIds') && b.text.includes('"vision"')))
  check('wrapper route keeps raw image block (no pre-step rewrite)', twinDecision.messages[0].content.some((b) => b.type === 'image'))

  // ② 逃生组路由（纯文本主模型）：分级改写兜底——无裸图块到达模型（复用 Step 3 语义）。
  const escapeAgent = { options: { provider: 'escape-provider', model: 'brain-1' } }
  const escapeDecision = await dispatch(escapeAgent, [imageMessage])
  check('escape-group image turn has no raw image block', escapeDecision.messages[0].content.every((b) => b.type !== 'image'))
  check('escape rewrite embeds marker text with id', escapeDecision.messages[0].content.some((b) => b.type === 'text' && b.text.includes('route_agent') && b.text.includes('includeImages') && b.text.includes(contentId)))
  check('escape-group turn also injects reminder', escapeDecision.messages.length === 2 && escapeDecision.messages[1].source.kind === 'plugin')

  // ③ 逃生组 + 原生多模态主模型：能力判定保真直传（preserveImageInput 语义）。
  const mmAgent = { options: { provider: 'mm-escape-provider', model: 'brain-1' } }
  const mmDecision = await dispatch(mmAgent, [imageMessage])
  check('native multimodal escape keeps raw image (passthrough)', mmDecision.messages[0].content.some((b) => b.type === 'image') && mmDecision.messages.length === 2)

  // ④ 纯文本轮负向：零注入、零改写（同一对象引用返回）。
  const textMessage = createUserMessage({ content: [{ type: 'text', text: '纯文本轮' }], source: { kind: 'user' } })
  const textDecision = await dispatch(escapeAgent, [textMessage])
  check('text-only turn unchanged (no reminder, no rewrite)', textDecision.messages.length === 1 && textDecision.messages[0] === textMessage)

  // ⑤ 门控：总开关关闭 → 图片轮同样零介入（与 wrapper 门控同源）。
  service.isEnabled = () => false
  const gatedDecision = await dispatch(escapeAgent, [imageMessage])
  check('pre-step gated by master switch', gatedDecision.messages.length === 1 && gatedDecision.messages[0] === imageMessage)
  service.isEnabled = () => true

  // ⑥ 单元面：collectReminder（M4 通道① builder）与逃生组改写器。
  const reminderText = collectReminder(['sha256:a', 'sha256:b'], ['vision'])
  check('collectReminder lists attachment ids and vision agents', reminderText.includes('sha256:a') && reminderText.includes('sha256:b') && reminderText.includes('"vision"') && reminderText.includes('route_agent') && reminderText.includes('attachmentIds'))
  const noIdText = collectReminder([], [])
  check('collectReminder tolerates empty ids', noIdText.includes('route_agent') && !noIdText.includes('附件 id'))
  const nested = createUserMessage({ content: [{ type: 'text', text: 'x' }, { type: 'tool-result', callId: 'c1', content: [{ type: 'image', attachment: { attachmentId: 'sha256:n', mediaType: 'image/png', bytes: 1, width: 1, height: 1 } }] }], source: { kind: 'user' } })
  const rewrittenNested = rewriteImageTurnsToMarkers([nested], { vision: ['vision'], generation: [] })
  check('escape rewrite reaches nested tool-result', rewrittenNested[0].content[1].content.every((b) => b.type === 'text') && !rewrittenNested[0].content[1].content.some((b) => b.type === 'image'))
  const untouched = createUserMessage({ content: [{ type: 'text', text: '纯文本' }], source: { kind: 'user' } })
  check('escape rewrite leaves text-only message untouched', rewriteImageTurnsToMarkers([untouched], { vision: ['vision'], generation: [] })[0] === untouched)

  // ⑧ R8-F-02 补齐：宿主真实 decision 形态的映射对齐——宿主默认 decision 为
  // [...claimed, context]（context 为运行时上下文 user 消息，同引用对齐之外
  // 的尾部追加项）：映射须把 index=-1 的 context 原样透传，同时 claimed 前 N 项
  // 照常改写；reject decision 原样透传（不注入 reminder）；handler 内部异常
  // fail-safe 降级为原 decision（绝不击穿宿主 agent 循环）。
  const contextMessage = createUserMessage({ content: [{ type: 'text', text: '运行时上下文' }], source: { kind: 'user' } })
  const contextDispatch = (agent, messages) =>
    root.events.waterfall('agent/pre-step', { agent, messages, turn: 1, step: 1, signal: undefined },
      () => Promise.resolve({ kind: 'enter', messages: [...messages, contextMessage] }))
  const contextDecision = await contextDispatch(escapeAgent, [imageMessage])
  check('context-appended decision maps rewrite + passthrough (index=-1)', contextDecision.kind === 'enter' && contextDecision.messages.length === 3 && contextDecision.messages[0].content.every((b) => b.type !== 'image') && contextDecision.messages[1] === contextMessage && contextDecision.messages[2].source.kind === 'plugin')
  const rejectDecision = await root.events.waterfall('agent/pre-step', { agent: escapeAgent, messages: [imageMessage], turn: 1, step: 1, signal: undefined },
    () => Promise.resolve({ kind: 'reject', reason: 'blocked' }))
  check('reject decision passes through untouched', rejectDecision.kind === 'reject' && rejectDecision.reason === 'blocked' && rejectDecision.messages === undefined)
  // fail-safe：让 handler try 体内的 sessionProvider 抛错（agent.options.provider
  // getter 抛异常——sessionProvider 的 try 只包 requestHeader，options 读取不兜底）
  // → 捕获后返回原 decision（无 reminder、无改写）。
  const throwingOptionsAgent = { options: { get provider() { throw new Error('boom') } } }
  const failSafeDecision = await dispatch(throwingOptionsAgent, [imageMessage])
  check('handler exception falls back to original decision (fail-safe)', failSafeDecision.kind === 'enter' && failSafeDecision.messages.length === 1 && failSafeDecision.messages[0] === imageMessage)

  // ⑦ 卸载器：移除注册后瀑布回到默认 decision（Step 6 回滚 = 卸载 pre-step 注册）。
  dispose()
  const disposedDecision = await dispatch(escapeAgent, [imageMessage])
  check('pre-step uninstaller removes handler', disposedDecision.messages.length === 1 && disposedDecision.messages[0] === imageMessage)
}

// 8. 平台安装入口（BOM 免疫在线命令 + 离线安装幂等；涉及系统宿主与本地 fixture 服务器）
await runInstallEntryTests(check)

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)


