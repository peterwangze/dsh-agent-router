/**
 * EVO-024（ARCH-004 设计 §5.1(a) D3 静态层 / §10 B6 收官批）：宿主面契约静态看护体系。
 *
 * 定位：D3 三层防线的最外一层（静态层）——**不依赖宿主 checkout 存在**。
 * 宿主面基线与源码锚点以「静态常量 + 注释锚行号」冻结（先例
 * tests/host-version-snapshot.mjs 的 HOST_BASELINE），因此本套件在用户侧 /
 * 异构 CI 环境（BR-03：插件装在别处、宿主 cache 路径漂移）同样可跑；宿主
 * checkout 可达时（环境变量 DSH_HOST_SOURCE / 本地 _npx 探测）追加 S7 增强
 * 靶子组：直读宿主源码逐字核验常量（缺失只记 skip，不失败）。
 *
 * 与 §6.1 诊断环形的边界（设计明文）：本文件是**静态守卫**——只读源码、声明面
 * 与契约形状常量，**不重复运行时探测**（面存在性 = D4 probe / failsafe 环形；
 * 调用期自证 = host-abi 域 guard；行为 parity = tests/host-abi-health.mjs §7）。
 *
 * 五守卫（设计 §5.1 第 1-5 条）：
 *  S1 契约快照四类面：llm 适配器契约（含 twin + oauth-llm 枚举，复用
 *     adapter-parity F2 动态枚举模式）/ 宿主协议对象导出面 / remote 面方法形状
 *     （CLIENT_REMOTE_FACES）/ ctx 服务面（CTX_SERVICES）/ 转发事件白名单（19 项）
 *  S2 宿主源码形状锚点（P10-④：桩形态锚定宿主源码；高风险非导出面以形状
 *     签名断言，宿主漂移即红）
 *  S3 声明面比对：package.json `dsh.client.inject` + peerDeps 8 项 vs
 *     inject-manifest.js 代码侧常量；fiber inject 名单 vs 域面；cordis.patch.yml
 *     两宿主行 id 存在性（宿主对不存在条目仅 stderr 警告——静默面守卫）
 *  S4 消费点黑名单：高危面名禁域模块外裸 ctx.get（白名单分级放行 = B4 §8a
 *     快照口径）；**域管事件名**（MANAGED_EVENTS）禁域外裸 ctx.on（scoped
 *     生命周期钩子 agent/pre-step、agent/created、agent/request 直订合法）
 *  S5 字段级 wire schema 白名单断言（S-5）：消费字段 ⊆ 宿主 schema 字段
 *     （锚 dsh-api-remotes lib/client.js:5727-5734 / :8164-8193 / 同源四例）
 *  S6 转发事件白名单静态比对（W-4）：客户端转发面订阅事件名 ⊆ 白名单 +
 *     镜像值级 parity + Node 面 ctx.on 事件名 ⊆ {域管事件, scoped 钩子}
 *
 * 判别性（红/绿演示——EVO-024 验收各附红→绿实证；演示用临时改动已全部复原，不入提交）：
 *  1. 黑名单：往消费者加一行裸 `ctx.get('sessionController')` → S4 红（分级放行
 *     越界：sessionController 白名单计数 0）；
 *  2. 白名单：往 lib/client.js 转发订阅面加一个白名单外事件名 → S6 红；
 *     往任意 lib/*.js 加裸 `ctx.on('settings/updated', …)` → S4 域管事件守卫红；
 *  3. 字段断言：从 S5 的 schema 白名单删一个被消费字段（如 listConfigurableProviders
 *     的 `declared`）→ 字段断言红（消费字段 ⊆ 白名单被击穿）；
 *  4. 声明面：改 package.json inject / peerDeps 或删 cordis.patch.yml 一行 id → S3 红。
 *
 * 如何刷新本套件（宿主升级后，与 host-version-snapshot 刷新步骤同步执行）：
 *  1. 以宿主 checkout 实读核验本文件各 *_BASELINE / WIRE_SCHEMA / ANCHOR 常量
 *     （行号锚点以 S7 增强组输出的实测行号为准更新）；消费字段漂移则同步更新
 *     对应域模块（lib/host-abi/*.js）与浏览器镜像（lib/client.js）——镜像
 *     parity 由 S1c/S5 双向锁定；
 *  2. 跑 `node tests/host-contract.mjs` 确认绿，再跑全量门控 `node tests/run-all.mjs`。
 *
 * 独立入口：node tests/host-contract.mjs（exit 0/1）。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LlmAdapter, BlockAssembler } from '@deepseek-ai/dsh-llm'
import * as dshMessage from '@deepseek-ai/dsh-llm/message'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createWrapAdapter } from '../lib/wrapper.js'
import { createOauthAdapter } from '../lib/oauth-llm.js'
import { RouterService } from '../lib/service.js'
import { CLIENT_REMOTE_FACES, createClientRemotes } from '../lib/host-abi/client-remotes.js'
import { CTX_SERVICES, ctxServiceFaceProbes } from '../lib/host-abi/ctx-services.js'
import { FORWARDED_EVENT_ALLOWLIST, isForwardedEvent, MANAGED_EVENTS } from '../lib/host-abi/events.js'
import { CLIENT_PACKAGE_INJECT, FIBER_INJECT } from '../lib/host-abi/inject-manifest.js'

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── 计数与断言工具（rpc-shadow-guard.mjs 独立入口风格：check() + exit 0/1）────
let failures = 0
let passed = 0
let skipped = 0
const check = (label, condition, detail) => {
  if (condition) { passed++; console.log(`  ok  ${label}`) }
  else {
    failures++
    console.error(`FAIL  ${label}${detail === undefined ? '' : ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`)
  }
}
const note = (label) => { skipped++; console.log(`  --  ${label}`) }
const deepEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right)

const readLib = (name) => readFileSync(join(ROOT_DIR, 'lib', name), 'utf8')
const readHostAbi = (name) => readFileSync(join(ROOT_DIR, 'lib', 'host-abi', name), 'utf8')
const readTest = (name) => readFileSync(join(ROOT_DIR, 'tests', name), 'utf8')

/** 注释剥离（偏移量保持：注释字符换空格、换行保留）——host-abi-health.mjs 同法。 */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (line) => line.replace(/[^\n]/g, ' '))

/** 取以 startMarker 开头、花括号配对的代码块（先剥注释——块内注释含花括号不误判）。 */
const blockOf = (source, startMarker) => {
  const start = source.indexOf(startMarker)
  if (start < 0) return ''
  let depth = 0
  let opened = false
  for (let index = start; index < source.length; index++) {
    const char = source[index]
    if (char === '{') { depth += 1; opened = true } else if (char === '}') {
      depth -= 1
      if (opened && depth === 0) return source.slice(start, index + 1)
    }
  }
  return source.slice(start)
}

/** 取以 startMarker 定位、方括号配对的数组字面量（注释须先剥离）。 */
const arrayOf = (source, startMarker) => {
  const start = source.indexOf(startMarker)
  if (start < 0) return ''
  const open = source.indexOf('[', start)
  if (open < 0) return ''
  let depth = 0
  for (let index = open; index < source.length; index++) {
    const char = source[index]
    if (char === '[') depth += 1
    else if (char === ']') {
      depth -= 1
      if (depth === 0) return source.slice(open, index + 1)
    }
  }
  return ''
}

/** 从代码块按正则提取消费字段（去重排序——动态提取，非手抄）。 */
const fieldsIn = (block, pattern) => [...new Set([...block.matchAll(pattern)].map((match) => match[1]))].sort()

// ── 冻结基线（唯一事实源 = 宿主 checkout 只读实读；刷新步骤见文件头）──────────
/** llm 适配器契约（dsh-llm lib/index.js:1618 class LlmAdapter；方法行号 :1624/:1635/:1645/:1653/:1665/:1681）。 */
const LLM_ADAPTER_PROTO_BASELINE = ['providerInfo', 'providerRetryPolicy', 'imageRequestPricing', 'listModels', 'resolveModel', 'prepareCall']
/** 静态补集：stream 为抽象声明（不在 LlmAdapter.prototype，FIX-001b F2 先例）。 */
const ADAPTER_CONTRACT_BASELINE = [...LLM_ADAPTER_PROTO_BASELINE, 'stream']
/** 宿主协议对象导出面（dsh-llm/message 导出名——宿主 lib/message.js 实读 8 项）。 */
const MESSAGE_EXPORTS_BASELINE = ['CONTEXT_SUMMARY_MAX_CHARS', 'boundContextSummary', 'createAssistantMessage', 'createMessage', 'createSystemMessage', 'createToolResultMessage', 'createUserMessage', 'freezeMessage']
/** BlockAssembler 原型面（dsh-llm lib/index.js 实读 11 项；本包消费 push/usage/finish/blocks——lib/service.js:1437-1443）。 */
const BLOCK_ASSEMBLER_PROTO_BASELINE = ['push', 'ensure', 'assemble', 'mustGet', 'assembled', 'blocks', 'interruptedBlocks', 'usage', 'finish', 'replayState', 'message']

/** remote.* 面方法形状基线（宿主 dsh-api-remotes TYPERT_REMOTE 描述符实读；域内 CLIENT_REMOTE_FACES 为代码侧权威）。 */
const CLIENT_REMOTE_FACES_BASELINE = {
  llm: ['listProviders', 'listConfigurableProviders', 'discoverModels'],
  settings: ['describe', 'mutate'],
  credentials: ['describe', 'set', 'unset'],
  agentPresets: ['list'],
  session: ['modelCatalog', 'selectModel'],
}
/** Node 侧 ctx 服务面基线（§4.3 域 3 的 11 服务 × 方法形状契约）。 */
const CTX_SERVICES_BASELINE = {
  llm: ['registerAdapter', 'listModels'],
  credentials: [],
  settings: ['mutate'],
  fs: [],
  attachments: [],
  subagents: [],
  agentDefaultModel: ['currentSelection', 'saveSelection'],
  sessionController: ['selectModel'],
  sessionProjections: ['stateOf'],
  agents: ['get'],
  agentPresets: ['composedPreset'],
}
/** 宿主转发事件白名单（dsh-api-remotes lib/types/remote-events.js:12-32 实读 19 项，逐字逐序）。 */
const FORWARDED_EVENT_BASELINE = [
  'agent-preset/selected',
  'approval/request',
  'api-session/activity',
  'api-session/added',
  'api-session/error',
  'api-session/removed',
  'api-session/status',
  'commands/change',
  'credentials/reference-updated',
  'goal/activation-changed',
  'cordis/request-run',
  'cordis/request-run-resolved',
  'cordis/dynamic-package',
  'cordis/dynamic-retract',
  'cordis/inspect-query',
  'cordis/inspect-query-resolved',
  'llm/adapters-updated',
  'settings/document-updated',
  'user-questions/request',
]
/** 客户端 inject 三包基线（@deepseek-ai/dsh-client-runtime 0.1.5 起宿主消亡，B0/D1-1 已删）。 */
const CLIENT_PACKAGE_INJECT_BASELINE = ['@deepseek-ai/dsh-client-ui-settings', '@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-api-remotes']
/** 客户端 fiber inject 九面基线（inject-manifest 域 FIBER_INJECT 镜像源 = lib/client.js inject 数组）。 */
const FIBER_INJECT_BASELINE = ['slots', 'locale', 'remote', 'remote.llm', 'remote.settings', 'remote.credentials', 'remote.agentPresets', 'remote.session', 'modelDirectories']
/** peerDeps 8 项宿主供给包（记录性声明口径 = ^ + 实测基线 0.1.5-rc.2）。 */
const PEER_DEP_BASELINE = [
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-agent-default-model',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-subagent',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-credentials',
]
const HOST_DECLARED_RANGE = '^0.1.5-rc.2'
/** cordis.patch.yml 两宿主行（宿主对不存在条目仅 stderr 警告——静默面守卫）。 */
const PATCH_ROWS_BASELINE = [
  { id: 'router', name: 'dsh-agent-router' },
  { id: 'tool-router', name: 'dsh-agent-router/tool' },
]

/**
 * 消费点分级白名单（B4 §8a 快照口径，精确计数——越界新增即红）。
 * 高危面（CONSUMER_BLACKLIST_FACES）禁域模块外裸 ctx.get：白名单只保留 B4
 * 冻结时点的遗留消费点（分级放行，非放行扩张）；fs/settings/router 为低危面直用。
 */
const CONSUMER_BLACKLIST_FACES = ['llm', 'credentials', 'agentDefaultModel', 'sessionController', 'sessionProjections', 'agents', 'agentPresets', 'modelDirectories', 'remote.*', 'remote.router', 'dynamic-inject', 'conversation', 'attachments', 'subagents']
const CONSUMER_BARE_CTX_GET_ALLOWLIST = {
  'service.js': { fs: 5, settings: 2 },
  'host-route.js': {},
  'wrapper.js': { agentDefaultModel: 1 },
  'prestep.js': { sessionProjections: 1, llm: 1 },
  'tool.js': { router: 3 },
  'preset-defaults.js': { agentDefaultModel: 1 },
  'client.js': { 'remote.*': 2, 'dynamic-inject': 1, 'remote.router': 3, conversation: 1, modelDirectories: 2 },
}
/** scoped 生命周期钩子（W-3 收窄口径：veto 语义 / 热路径零介入——直订合法，不在域管清单）。 */
const SCOPED_HOOK_EVENTS = ['agent/pre-step', 'agent/created', 'agent/request']

/**
 * S2 宿主源码形状锚点（P10-④）：高风险非导出面以「形状签名不一致即红」的
 * 静态常量 + 注释锚行号实现（宿主 checkout 不可假设存在）。consumer 命中
 * 断言 = 该签名必须逐字仍在消费模块源码中（消费面形态漂移即红）；anchor
 * 断言 = 锚点必须带 `路径:行号`（禁心智模型式无锚常量）。
 */
const HOST_SHAPE_ANCHORS = [
  {
    face: 'sessionController.selectModel',
    anchor: 'dsh-api-session-controller lib/index.js:605,2502-2503；selectionFor 语义锚 lib/types/agent.js:289-318（pending 优先层 :297-299）',
    consumer: ['lib/host-abi/llm-selection.js'],
    signatures: ['controller.selectModel({ ...selection })', "get('sessionController')"],
  },
  {
    face: 'sessionProjections.stateOf(session, "modelSelection") → {lastUsed, pending}',
    anchor: 'dsh-api-session-controller lib/types/agent.js:289-318（stateOf(session,"modelSelection") → projectionState.pending）',
    consumer: ['lib/prestep.js'],
    signatures: ["stateOf(agent?.session, 'modelSelection')", 'state.pending'],
    extra: [{ file: 'tests/fix-029-host-contract.mjs', signatures: ['types/agent.js:297-318', "key === 'modelSelection'"] }],
  },
  {
    face: 'modelDirectories.directoryFor(sessionId).load()',
    anchor: 'dsh-client-ui-model-selection lib/types/client/service.d.ts:44（directoryFor）；lib/types/client/directory.d.ts:13-32,60（ModelDirectoryState/load）',
    consumer: ['lib/host-abi/client-remotes.js'],
    signatures: ['directoryService.directoryFor(input.sessionId)', 'directory.load()'],
  },
]

/**
 * S5 字段级 wire schema 白名单（S-5）：消费字段 ⊆ 宿主 schema 字段。
 * schema.*  = 宿主 api-remotes 声明面字段（锚行号实读）；
 * consumed  = 产品消费字段（dynamic 块动态提取——新增字段读取未经白名单即红；
 *             frozen 项为「域内整体透传 + 消费点在浏览器镜像按字段读」的显式声明）。
 */
const WIRE_SCHEMA_WHITELIST = {
  'llm.listConfigurableProviders': {
    anchor: 'dsh-api-remotes lib/client.js:5727-5734',
    schema: ['provider', 'displayName', 'settingsNs', 'settingsPath', 'declared', 'error'],
    dynamic: { file: 'lib/host-abi/client-remotes.js', marker: 'function joinProviderDirectoryHost(', pattern: /entry\.([A-Za-z_]\w*)/g },
  },
  'llm.listProviders': {
    anchor: 'dsh-api-remotes lib/client.js:5735-5738',
    schema: ['id', 'name'],
    dynamic: { file: 'lib/host-abi/client-remotes.js', marker: 'function joinProviderDirectoryHost(', pattern: /provider\.([A-Za-z_]\w*)/g },
  },
  'session.modelCatalog': {
    anchor: 'dsh-api-remotes lib/client.js:8164-8193',
    schema: ['default', 'routableProviders', 'groups', 'failures'],
    dynamic: { file: 'lib/host-abi/client-remotes.js', marker: "models: guard('remote.session'", pattern: /catalog\.([A-Za-z_]\w*)/g },
  },
  'settings.describe': {
    anchor: 'dsh-api-remotes lib/client.js:4712-4730',
    schema: ['writable', 'hasDocument', 'namespaces'],
    dynamic: { file: 'lib/host-abi/client-remotes.js', marker: "describe: guard('remote.settings'", pattern: /\bvalue\.([A-Za-z_]\w*)/g },
  },
  'credentials.describe': {
    anchor: 'dsh-api-remotes lib/client.js:4701-4705（record<string, {configured, source?, writable}>）',
    schema: ['configured', 'source', 'writable'],
    frozen: { consumed: ['configured'], presence: [{ file: 'lib/client.js', pattern: /\?\.configured === true/ }], note: '域内整体透传宿主 map；字段级消费在浏览器镜像账号卡（configured 判定）' },
  },
  'agentPresets.list': {
    anchor: 'dsh-api-remotes lib/client.js:4315-4325',
    schema: ['presets', 'authorable'],
    frozen: { consumed: ['presets'], presence: [{ file: 'lib/host-abi/client-remotes.js', pattern: /presets: \[\]/ }], note: '域内整体透传 {presets}；authorable 未被消费（不越界断言）' },
  },
}

const pkg = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8'))
const patch = readFileSync(join(ROOT_DIR, 'cordis.patch.yml'), 'utf8')
const clientSource = readLib('client.js')
const clientStripped = stripComments(clientSource)

// ═══════════════════════════════════════════════════════════════════════════
console.log('S1 契约快照四类面（宿主面形状漂移即红；宿主新增方法自动入集 = RISK-003 预警）:')

// S1a llm 适配器契约（adapter-parity F2 动态枚举模式：宿主原型枚举 ∪ 静态补集）
{
  const enumerated = typeof LlmAdapter === 'function'
    ? Object.getOwnPropertyNames(LlmAdapter.prototype).filter((name) => name !== 'constructor')
    : []
  const contract = [...new Set([...enumerated, ...ADAPTER_CONTRACT_BASELINE.filter((name) => name === 'stream')])]
  const missing = LLM_ADAPTER_PROTO_BASELINE.filter((name) => !enumerated.includes(name))
  check('S1a 契约快照: LlmAdapter.prototype 动态枚举 ⊇ 基线 6 方法（宿主删/改方法即红；锚 dsh-llm lib/index.js:1618-1687）', missing.length === 0, missing)
  console.log(`      · 快照 diff: 枚举 ${enumerated.length} 项 [${enumerated.join(',')}]${enumerated.some((name) => !LLM_ADAPTER_PROTO_BASELINE.includes(name)) ? '（宿主新增方法已自动入集——twin/oauth 未跟进即下方红）' : ''}`)
  const active = [{ modality: 'image', stateOf: null, marker: () => '', rewrite: () => null }]
  const fakeLlm = { registration: () => ({ adapter: {} }), stream: async function* () {} }
  const twin = createWrapAdapter(fakeLlm, 'contract-probe', active)
  const oauth = createOauthAdapter(null, null)
  const twinMissing = contract.filter((method) => typeof twin[method] !== 'function')
  const oauthMissing = contract.filter((method) => typeof oauth[method] !== 'function')
  check('S1a 契约快照: twin 适配器实现全部契约方法（宿主枚举 ∪ 静态补集；缺任一即红）', twinMissing.length === 0, twinMissing)
  check('S1a 契约快照: oauth-llm 适配器实现全部契约方法（EVO-009 手工对象字面量同型守卫）', oauthMissing.length === 0, oauthMissing)
}

// S1b 宿主协议对象导出面（BlockAssembler / dsh-llm-message / TypertRemoteService / defineTool）
{
  const assemblerProto = typeof BlockAssembler === 'function' ? Object.getOwnPropertyNames(BlockAssembler.prototype).filter((name) => name !== 'constructor') : []
  const assemblerMissing = BLOCK_ASSEMBLER_PROTO_BASELINE.filter((name) => !assemblerProto.includes(name))
  check('S1b 契约快照: BlockAssembler.prototype ⊇ 基线 11 项（消费面 push/blocks/usage/finish——lib/service.js:1437-1443）', assemblerMissing.length === 0, assemblerMissing)
  const messageMissing = MESSAGE_EXPORTS_BASELINE.filter((name) => !(name in dshMessage))
  check('S1b 契约快照: dsh-llm/message 导出面 ⊇ 基线 8 项（createUserMessage/createAssistantMessage 为消费面：service.js:28、prestep.js:33；CONTEXT_SUMMARY_MAX_CHARS 值级常量面）', messageMissing.length === 0, messageMissing)
  check('S1b 契约快照: RouterService extends TypertRemoteService（宿主基类面——lib/service.js:636 继承锚）',
    typeof RouterService === 'function' && typeof TypertRemoteService === 'function' && Object.getPrototypeOf(RouterService) === TypertRemoteService)
  const toolBlock = blockOf(stripComments(readLib('tool.js')), 'ctx.tools.register(defineTool(')
  check('S1b 契约快照: defineTool 函数契约（宿主 dsh-tools lib/index.js 实读：函数 + 单参数 options）', typeof defineTool === 'function' && defineTool.length === 1)
  check('S1b 契约快照: 消费面 options 键守卫（name/description/parameters 键 + execute 方法式——lib/tool.js:61-219 锚宿主 defineTool options 契约）',
    ['name', 'description', 'parameters'].every((key) => new RegExp(`\\b${key}:`).test(toolBlock)) && /(?:^|[\s,{])async execute\(/.test(toolBlock), toolBlock.slice(0, 80))
}

// S1c remote 面方法形状（CLIENT_REMOTE_FACES 代码侧权威 + 浏览器镜像 parity）
{
  check('S1c 契约快照: CLIENT_REMOTE_FACES === 基线五命名空间方法集（域内权威单点）', deepEqual(CLIENT_REMOTE_FACES, CLIENT_REMOTE_FACES_BASELINE), CLIENT_REMOTE_FACES)
  const mirrorMarker = 'CLIENT_REMOTE_FACES = {'
  let mirror = null
  const mirrorLiteral = blockOf(clientStripped, mirrorMarker)
  if (mirrorLiteral) {
    try { mirror = new Function(`return ${mirrorLiteral}`)() } catch { mirror = null }
  }
  check('S1c 契约快照: 浏览器镜像 CLIENT_REMOTE_FACES === 权威单点（值级 parity；漂移即红——B2 镜像纪律）', mirror !== null && deepEqual(mirror, CLIENT_REMOTE_FACES))
  const probeCtx = { get: (name) => (name === 'remote.llm' ? { listProviders: () => {}, listConfigurableProviders: () => {} } : undefined) }
  const faces = createClientRemotes(probeCtx).health().faces
  check('S1c 契约快照: 面形状漂移 → degraded（缺 discoverModels）+ 面缺失 → missing（形状探针口径与基线一致）',
    faces.find((face) => face.name === 'llm')?.state === 'degraded' && String(faces.find((face) => face.name === 'llm')?.detail).includes('discoverModels')
    && faces.find((face) => face.name === 'session')?.state === 'missing')
}

// S1d ctx 服务面（CTX_SERVICES 单点 + probe 派生）
{
  check('S1d 契约快照: CTX_SERVICES === 基线 11 服务 × 方法形状（域内单点派生）', deepEqual(CTX_SERVICES, CTX_SERVICES_BASELINE), CTX_SERVICES)
  const probes = ctxServiceFaceProbes()
  check('S1d 契约快照: ctxServiceFaceProbes 由 CTX_SERVICES 单点派生（无手抄清单；面名 ctx: 前缀防客户端面遮蔽）',
    probes.length === Object.keys(CTX_SERVICES).length && probes.every((item) => typeof item.probe === 'function' && item.name.startsWith('ctx:'))
    && probes.map((item) => item.name.slice(4)).sort().join(',') === Object.keys(CTX_SERVICES).sort().join(','))
}

// S1e 转发事件白名单（19 项 + 镜像 parity + 判定函数）
{
  check('S1e 契约快照: FORWARDED_EVENT_ALLOWLIST === 宿主 19 项基线（逐字逐序——锚 remote-events.js:12-32）',
    FORWARDED_EVENT_ALLOWLIST.length === 19 && deepEqual(FORWARDED_EVENT_ALLOWLIST, FORWARDED_EVENT_BASELINE), FORWARDED_EVENT_ALLOWLIST)
  const mirrorLiteral = arrayOf(clientStripped, 'FORWARDED_EVENT_ALLOWLIST = [')
  let mirror = null
  if (mirrorLiteral) {
    try { mirror = new Function(`return ${mirrorLiteral}`)() } catch { mirror = null }
  }
  check('S1e 契约快照: 浏览器镜像 FORWARDED_EVENT_ALLOWLIST === 权威单点（值级 parity）', mirror !== null && deepEqual(mirror, FORWARDED_EVENT_ALLOWLIST))
  check('S1e 契约快照: isForwardedEvent 判定与镜像一致（含空/非串防御；D-2 死名被判否）',
    isForwardedEvent('credentials/reference-updated') === true && isForwardedEvent('credentials/updated') === false
    && isForwardedEvent('') === false && isForwardedEvent(undefined) === false)
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S2 宿主源码形状锚点（P10-④：形状签名 + 注释锚行号；消费面漂移即红）:')
for (const anchorCase of HOST_SHAPE_ANCHORS) {
  const anchorWellFormed = /[\w./-]+\.\w+:\d+/.test(anchorCase.anchor)
  check(`S2 形状锚点: ${anchorCase.face} 锚点带「路径:行号」（禁无锚心智模型常量）`, anchorWellFormed, anchorCase.anchor)
  let hits = 0
  for (const file of anchorCase.consumer) {
    const source = stripComments(readFileSync(join(ROOT_DIR, file), 'utf8'))
    const missing = anchorCase.signatures.filter((signature) => !source.includes(signature))
    hits += anchorCase.signatures.length - missing.length
    check(`S2 形状锚点: ${anchorCase.face} ← ${file} 形状签名逐字在位（${anchorCase.signatures.length} 项）`, missing.length === 0, missing)
  }
  for (const extra of anchorCase.extra ?? []) {
    const source = readFileSync(join(ROOT_DIR, extra.file), 'utf8')
    const missing = extra.signatures.filter((signature) => !source.includes(signature))
    check(`S2 形状锚点: ${anchorCase.face} ← ${extra.file} 桩锚定宿主源码（P10-④ 判别夹具同源）`, missing.length === 0, missing)
  }
  check(`S2 形状锚点: ${anchorCase.face} 消费命中非空（锚点未失效）`, hits > 0)
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S3 声明面比对（inject / peerDeps / fiber 面 / patch 条目存在性——静默面守卫）:')
{
  check('S3 声明面: dsh.client.inject === inject-manifest 代码侧常量 CLIENT_PACKAGE_INJECT（B0/B1 单源，成体系比对）',
    deepEqual(pkg.dsh?.client?.inject, CLIENT_PACKAGE_INJECT) && deepEqual(CLIENT_PACKAGE_INJECT, CLIENT_PACKAGE_INJECT_BASELINE), pkg.dsh?.client?.inject)
  check('S3 声明面: inject 零死行（@deepseek-ai/dsh-client-runtime 宿主 0.1.5 起消亡——D1-1）',
    !(pkg.dsh?.client?.inject ?? []).includes('@deepseek-ai/dsh-client-runtime'))
  check('S3 声明面: dsh.client.platform === web（客户端装配面声明）', pkg.dsh?.client?.platform === 'web')

  const peerNames = Object.keys(pkg.peerDependencies ?? {}).sort()
  check('S3 声明面: peerDependencies = 基线 8 项宿主供给包（集合相等）', deepEqual(peerNames, [...PEER_DEP_BASELINE].sort()), peerNames)
  const wrongRange = PEER_DEP_BASELINE.filter((name) => pkg.peerDependencies?.[name] !== HOST_DECLARED_RANGE)
  check(`S3 声明面: peerDeps 8 项版本范围 === 记录性口径 ${HOST_DECLARED_RANGE}（实测基线）`, wrongRange.length === 0, wrongRange)

  check('S3 声明面: FIBER_INJECT === 基线九面（inject-manifest 单源）', deepEqual(FIBER_INJECT, FIBER_INJECT_BASELINE), FIBER_INJECT)
  const fiberRemoteFaces = FIBER_INJECT.filter((name) => name.startsWith('remote.')).map((name) => name.slice('remote.'.length))
  check('S3 声明面: fiber inject 的 remote.* 面 ⊆ CLIENT_REMOTE_FACES（声明面 vs 域面交叉一致）',
    fiberRemoteFaces.every((name) => Object.hasOwn(CLIENT_REMOTE_FACES, name)))
  const injectMirrorBlock = arrayOf(clientStripped, 'const inject = [')
  const injectMirror = [...new Set([...injectMirrorBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]))]
  check('S3 声明面: lib/client.js fiber inject 数组 === FIBER_INJECT（浏览器镜像 parity；dsh-abi-health 源提取锁定的同源复核）',
    deepEqual(injectMirror, FIBER_INJECT), injectMirror)

  check('S3 声明面: package.json dsh.bundle.patch 指向 ./cordis.patch.yml 且文件存在',
    pkg.dsh?.bundle?.patch === './cordis.patch.yml' && existsSync(join(ROOT_DIR, 'cordis.patch.yml')))
  const rows = [...patch.matchAll(/^\s*-\s*id:\s*(\S+)\s*\n\s*name:\s*(\S+)\s*$/gm)].map((match) => ({ id: match[1], name: match[2] }))
  check('S3 声明面: cordis.patch.yml 两宿主行 id/name 存在性 === 基线（宿主对不存在条目仅 stderr 警告——静默面守卫）',
    deepEqual(rows, PATCH_ROWS_BASELINE), rows)
  check('S3 声明面: patch insert 段结构完好（insert 块存在 + 行数 = 2）',
    /^-\s*insert:\s*$/m.test(patch) && rows.length === 2)
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S4 消费点黑名单（高危面禁裸 ctx.get + 域管事件禁裸 ctx.on——P5 单点化机器 enforcement）:')
{
  const libFiles = readdirSync(join(ROOT_DIR, 'lib')).filter((name) => name.endsWith('.js'))
  const diffs = []
  const blacklistViolations = []
  const found = {}
  for (const file of libFiles) {
    const source = stripComments(readLib(file))
    const counts = {}
    for (const match of source.matchAll(/ctx\.get\(([^)\n]*)\)/g)) {
      const argument = match[1].trim()
      const face = argument.startsWith('`remote.') ? 'remote.*' : argument === 'name' ? 'dynamic-inject' : argument.startsWith("'") ? argument.slice(1, -1) : argument
      counts[face] = (counts[face] ?? 0) + 1
    }
    found[file] = counts
    const expected = CONSUMER_BARE_CTX_GET_ALLOWLIST[file] ?? {}
    for (const key of new Set([...Object.keys(counts), ...Object.keys(expected)])) {
      if ((counts[key] ?? 0) !== (expected[key] ?? 0)) diffs.push(`${file}:${key} found=${counts[key] ?? 0} expected=${expected[key] ?? 0}`)
    }
    for (const face of CONSUMER_BLACKLIST_FACES) {
      if ((counts[face] ?? 0) !== (expected[face] ?? 0)) blacklistViolations.push(`${file}:${face}`)
    }
  }
  check('S4 黑名单: lib/*.js（非 host-abi）裸 ctx.get = 分级白名单精确快照（B4 §8a 口径；越界新增即红）', diffs.length === 0, diffs)
  check('S4 黑名单: 高危面名裸 ctx.get 仅剩分级放行清单（sessionController/sessionProjections/agents/agentPresets/modelDirectories/remote.* 域外零新增）', blacklistViolations.length === 0, blacklistViolations)
  check('S4 黑名单: host-route.js 零裸消费（B4 七处散点已切换域访问器——不回归）', !/ctx\.get\(/.test(stripComments(readLib('host-route.js'))))

  const domainSources = {
    'host-abi/ctx-services.js': readHostAbi('ctx-services.js'),
    'host-abi/llm-selection.js': readHostAbi('llm-selection.js'),
    'host-abi/client-remotes.js': readHostAbi('client-remotes.js'),
    'host-abi/inject-manifest.js': readHostAbi('inject-manifest.js'),
  }
  const homed = ['llm', 'credentials', 'agentDefaultModel', 'sessionController', 'sessionProjections', 'agents', 'agentPresets', 'modelDirectories', 'remote.*']
  const homeless = homed.filter((face) => {
    const needle = face === 'remote.*' ? 'remote.${name}' : `'${face}'`
    return !Object.values(domainSources).some((source) => source.includes(needle))
  })
  check('S4 黑名单: 每个高危面都有域模块归属单点（域内解析形态在位——face 无家可归即红）', homeless.length === 0, homeless)

  // 域管事件名裸订阅守卫（W-3 口径：scoped 钩子直订合法，域管事件必须经 events 域）
  const bareManaged = []
  for (const file of libFiles) {
    const source = stripComments(readLib(file))
    for (const event of MANAGED_EVENTS) {
      const bare = new RegExp(`(?:ctx|this\\.ctx)\\.on\\(\\s*'${event.replace(/[/-]/g, (char) => `\\${char}`)}'`)
      if (bare.test(source)) bareManaged.push(`${file}:${event}`)
    }
  }
  check('S4 域管事件: MANAGED_EVENTS 域外零裸 ctx.on（五事件全部经 events 域 subscribeEvents——B5/B6 订阅收敛终态）', bareManaged.length === 0, bareManaged)
  const scopedDirect = SCOPED_HOOK_EVENTS.filter((event) => libFiles.some((file) => stripComments(readLib(file)).includes(`ctx.on('${event}'`)))
  check('S4 域管事件: scoped 生命周期钩子保留直订经域外（W-3 收窄口径：agent/pre-step + agent/created + agent/request 三面）',
    deepEqual(scopedDirect.sort(), [...SCOPED_HOOK_EVENTS].sort()), scopedDirect)
  const subscribeSites = libFiles.flatMap((file) => {
    const source = stripComments(readLib(file))
    return [...source.matchAll(/event:\s*'([^']+)'/g)].map((match) => ({ file, event: match[1] }))
  })
  const unhomed = MANAGED_EVENTS.filter((event) => !subscribeSites.some((site) => site.event === event))
  check('S4 域管事件: 五事件各有 ≥1 域订阅站点（事件面单点无遗漏——收敛不丢消费者）', unhomed.length === 0, unhomed)
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S5 字段级 wire schema 白名单断言（S-5：消费字段 ⊆ 宿主 schema 字段）:')
{
  const joinBlock = blockOf(stripComments(readHostAbi('client-remotes.js')), 'function joinProviderDirectoryHost(')
  for (const [face, spec] of Object.entries(WIRE_SCHEMA_WHITELIST)) {
    check(`S5 字段: ${face} 锚点带「路径:行号」（S-5 单一声明源可复核）`, /[\w./-]+\.\w+:\d+/.test(spec.anchor), spec.anchor)
    let consumed
    if (spec.dynamic) {
      const block = blockOf(stripComments(readFileSync(join(ROOT_DIR, spec.dynamic.file), 'utf8')), spec.dynamic.marker)
      consumed = fieldsIn(block, spec.dynamic.pattern)
      check(`S5 字段: ${face} 消费字段动态提取非空（${spec.dynamic.file} 块锚 ${JSON.stringify(spec.dynamic.marker)}）`, consumed.length > 0)
    } else {
      consumed = [...spec.frozen.consumed].sort()
      for (const presence of spec.frozen.presence) {
        check(`S5 字段: ${face} frozen 消费声明有源码实证（${presence.file}）`, presence.pattern.test(readFileSync(join(ROOT_DIR, presence.file), 'utf8')))
      }
    }
    const outside = consumed.filter((field) => !spec.schema.includes(field))
    check(`S5 字段: ${face} 消费字段 ⊆ schema 白名单（${consumed.join(',')} ⊆ ${spec.schema.join(',')}）`, outside.length === 0, outside)
  }
  check('S5 字段: hostApiFace 逐字段消费面（joinProviderDirectoryHost 六字段处理——字段漂移 = 显示层静默错列）',
    ['provider', 'displayName', 'settingsNs', 'settingsPath', 'declared'].every((field) => new RegExp(`entry\\.${field}\\b`).test(joinBlock)))
  const mirrorJoinBlock = blockOf(stripComments(clientSource), 'function joinProviderDirectoryHost(')
  const mirrorFields = fieldsIn(mirrorJoinBlock, /entry\.([A-Za-z_]\w*)/g)
  check('S5 字段: 浏览器镜像逐字段消费面与权威单点一致（B2 镜像纪律；字段面漂移即红）',
    deepEqual(mirrorFields, fieldsIn(joinBlock, /entry\.([A-Za-z_]\w*)/g)), { mirrorFields })
  check('S5 字段: modelCatalog 消费面 = {groups, failures}（default/routableProviders 未消费——白名单容纳不越界）',
    deepEqual(fieldsIn(blockOf(stripComments(readHostAbi('client-remotes.js')), "models: guard('remote.session'"), /catalog\.([A-Za-z_]\w*)/g), ['failures', 'groups']))
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S6 转发事件白名单静态比对（W-4）：客户端转发面 ⊆ 白名单 + Node 面事件名归口:')
{
  const forwardedSites = [...new Set([...clientStripped.matchAll(/event:\s*'([^']+)'/g)].map((match) => match[1]))]
  const outsideForwarded = forwardedSites.filter((event) => !FORWARDED_EVENT_ALLOWLIST.includes(event))
  check('S6 白名单: lib/client.js 全部转发订阅事件名 ⊆ FORWARDED_EVENT_ALLOWLIST（≥4 站点——非空判别）', forwardedSites.length >= 4 && outsideForwarded.length === 0, forwardedSites)
  check('S6 白名单: 客户端裸 $on(字面量) 订阅站点归零（统一经 subscribeClientEvents 白名单受检面）',
    !/\$on\(\s*'/.test(clientStripped))
  check('S6 白名单: D-2 死订阅名 credentials/updated 零残留 + 正名 credentials/reference-updated 在位',
    !forwardedSites.includes('credentials/updated') && forwardedSites.includes('credentials/reference-updated'))
  check('S6 白名单: 客户端转发面进入 events 域 API（subscribeClientEvents 镜像在位 + 白名单拒绝运行时可观测）',
    /subscribeClientEvents/.test(clientStripped) && /event-subscribe-rejected/.test(clientStripped))

  const nodeOnSites = []
  for (const file of readdirSync(join(ROOT_DIR, 'lib')).filter((name) => name.endsWith('.js'))) {
    const source = stripComments(readLib(file))
    for (const match of source.matchAll(/(?:ctx|this\.ctx)\.on\(\s*'([^']+)'/g)) nodeOnSites.push({ file, event: match[1] })
  }
  const allowedNodeEvents = [...MANAGED_EVENTS, ...SCOPED_HOOK_EVENTS]
  const illegalNode = nodeOnSites.filter((site) => !allowedNodeEvents.includes(site.event))
  check('S6 白名单: Node 面裸 ctx.on 事件名 ⊆ {域管事件（经域后本应零裸点）, scoped 钩子}（域外新增事件名即红）',
    illegalNode.length === 0, illegalNode)
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S7 增强靶子（宿主 checkout 可达时直读源码核验常量；不可达 → skip，BR-03 不依赖）:')
{
  const candidates = [
    process.env.DSH_HOST_SOURCE,
    process.env.DSH_HOST_PACKAGES,
    ...(process.env.LOCALAPPDATA
      ? (() => {
          try {
            const npxRoot = join(process.env.LOCALAPPDATA, 'npm-cache', '_npx')
            return readdirSync(npxRoot).map((entry) => join(npxRoot, entry, 'node_modules', '@deepseek-ai'))
          } catch { return [] }
        })()
      : []),
  ].filter((root) => typeof root === 'string' && root.length > 0)
  const hostRoot = candidates.find((root) => existsSync(join(root, 'dsh-api-remotes', 'lib', 'client.js')))
  if (!hostRoot) {
    note('S7 增强靶子: 宿主 checkout 不可达（DSH_HOST_SOURCE 未设且本地无 _npx 缓存）→ 跳过（静态守卫不依赖宿主；CI 第①步同理）')
  } else {
    const hostRead = (...parts) => readFileSync(join(hostRoot, ...parts), 'utf8')
    // 7a 转发事件白名单宿主声明源（单一声明源 parity）
    const eventsSource = hostRead('dsh-api-remotes', 'lib', 'types', 'remote-events.js')
    const hostEvents = [...eventsSource.matchAll(/event:\s*'([^']+)'/g)].map((match) => match[1])
    check(`S7 增强: 宿主 API_REMOTE_FORWARDED_EVENTS === 白名单镜像（${hostEvents.length} 项逐字逐序）`, deepEqual(hostEvents, FORWARDED_EVENT_ALLOWLIST))
    // 7b 字段级 wire schema 宿主声明源（逐面取值级字段表）
    const hostClientLines = hostRead('dsh-api-remotes', 'lib', 'client.js').split(/\r?\n/)
    const schemaBlockOf = (fileName) => {
      const line = hostClientLines.findIndex((text) => text.includes(`${fileName}$schema = `))
      if (line < 0) return ''
      return hostClientLines.slice(line, line + 60).join('\n')
    }
    const topLevelFields = (block) => {
      const start = block.indexOf('{')
      if (start < 0) return []
      const out = []
      let depth = 0
      for (let index = start; index < block.length; index++) {
        const char = block[index]
        if (char === '{') depth += 1
        else if (char === '}') { depth -= 1; if (depth === 0) break } else if (depth === 1 && char === '"') {
          const end = block.indexOf('"', index + 1)
          const next = block.slice(end + 1).match(/^\s*:/)
          if (end > index && next) out.push(block.slice(index + 1, end))
          index = end
        }
      }
      return [...new Set(out)]
    }
    const schemaCases = [
      ['llm_listConfigurableProviders_result', 'llm.listConfigurableProviders'],
      ['llm_listProviders_result', 'llm.listProviders'],
      ['session_modelCatalog_result', 'session.modelCatalog'],
      ['settings_describe_result', 'settings.describe'],
      ['credentials_describe_result', 'credentials.describe'],
      ['agentPresets_list_result', 'agentPresets.list'],
    ]
    for (const [schemaName, face] of schemaCases) {
      const fields = topLevelFields(schemaBlockOf(schemaName))
      const expected = WIRE_SCHEMA_WHITELIST[face].schema
      check(`S7 增强: 宿主 schema ${face} 顶层字段 === 白名单（${fields.join(',')}）`, deepEqual(fields, expected), fields)
    }
    // 7c 形状锚点源码在位（selectionFor / directoryFor / LlmAdapter 方法行）
    const agentTypes = hostRead('dsh-api-session-controller', 'lib', 'types', 'agent.js')
    check('S7 增强: 宿主 selectionFor 锚在位（types/agent.js + stateOf(session,"modelSelection") + projectionState.pending）',
      agentTypes.includes('selectionFor(agent)') && agentTypes.includes("stateOf(agent.session, 'modelSelection')") && agentTypes.includes('projectionState.pending'))
    const directoryTypes = hostRead('dsh-client-ui-model-selection', 'lib', 'types', 'client', 'service.d.ts')
    check('S7 增强: 宿主 modelDirectories 锚在位（directoryFor(sessionId: SessionId): ModelDirectory）', directoryTypes.includes('directoryFor(sessionId: SessionId): ModelDirectory'))
    const llmIndex = hostRead('dsh-llm', 'lib', 'index.js')
    const llmMissing = LLM_ADAPTER_PROTO_BASELINE.filter((method) => !new RegExp(`\\b${method}\\(`).test(llmIndex))
    check('S7 增强: 宿主 LlmAdapter 契约方法源码在位（6 方法声明——快照基线可溯源）', llmMissing.length === 0, llmMissing)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
console.log(failures === 0
  ? `\nALL HOST CONTRACT GUARD TESTS PASSED (${passed} assertions${skipped > 0 ? `, ${skipped} skipped` : ''})`
  : `\n${failures} FAILURE(S) (${passed} passed${skipped > 0 ? `, ${skipped} skipped` : ''})`)
process.exit(failures === 0 ? 0 : 1)
