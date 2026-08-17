/**
 * dsh-agent-router 宿主服务（ctx key：`router`）。
 *
 * 职责：
 * - 持有 `router` settings namespace 的 resolved scope，热读取 agent 配置；
 * - 解析每个 agent 的有效 provider/model（缺省复用主 agent 当前模型）；
 * - 执行四类专业调用：chat（llm.stream 单/多轮，支持图片块）、
 *   agent（经 subagents seam 委派，per-agent 模型覆盖）、
 *   image（OpenAI 兼容 Images API，产物存回附件服务）、
 *   cli（无头 CLI 子代理：codex / claude / gemini 等外部 agent 工具，
 *   宿主直接 spawn，任务经 stdin 文件 FD 注入、stdout/stderr 走文件 FD
 *   重定向（不经管道，兼容受限环境），JSON 输出按 CLI 预设解析）；
 * - 维护进程内实时用量统计（totals / recent / 分钟级 series）；
 * - 提供 gateway 可直达的 RPC 方法：catalog / stats / test / reset /
 *   config / save（配置读写走本插件自己的 Remote 端点，因为
 *   api-proxy 的 settings.describe 只放行其内置白名单 namespace）；
 * - 生成面向主模型的系统提示段文本（由 tool 行注册）。
 *
 * 服务继承 TypertRemoteService：gateway 对严格（strict）契约分发的
 * 接收方要求可见的 typertRemote 绑定（service/serviceKey/namespace）。
 *
 * 注意：本服务只读叶子字段并构造自有 JSON，绝不序列化宿主内部活动对象。
 * @module dsh-agent-router/service
 */
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import { createUserMessage, createAssistantMessage } from '@deepseek-ai/dsh-llm/message'
import { createHash, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { ROUTER_NS } from './schemas.js'

/** 支持的 agent 类型。 */
export const AGENT_TYPES = ['chat', 'agent', 'image', 'speech', 'cli']

/** 委派（agent 类型）最大深度保护：防止路由自递归。 */
export const MAX_ROUTER_DEPTH = 4

/** files URL 下载的大小上限（与 speech 音频一致：25MB）。 */
const URL_FILE_MAX_BYTES = 25 * 1024 * 1024

/** files URL 下载的超时。 */
const URL_FETCH_TIMEOUT_MS = 60_000

/** cli 类型默认执行超时（毫秒）。 */
const CLI_DEFAULT_TIMEOUT_MS = 15 * 60 * 1000

/** cli 类型单个输出文件（stdout/stderr）读取上限（字节）。 */
const CLI_OUTPUT_MAX_BYTES = 2 * 1024 * 1024

/** cli 子进程启动后，任务/输出临时文件前缀（工作区 .router-files/ 下）。 */
const CLI_TMP_PREFIX = 'cli-run-'

/**
 * codex 的按平台安全沙箱默认（Windows 特殊处理）：
 * - macOS/Linux：workspace-write——子代理的产物（如图片）必须能写入工作区，
 *   read-only 会导致任务无法落盘；
 * - Windows：danger-full-access——codex 的 Windows 沙箱实现（受限令牌 +
 *   CreateProcessAsUserW）无法启动 WindowsApps 目录下的 App Execution Alias
 *   外壳（pwsh.exe 等），每条 shell 命令都在执行前确定性失败（实测
 *   CreateProcessAsUserW failed: 5/1920），子代理按重试纪律反复重试并绕路
 *   试探，token 与耗时成倍浪费（同一最小任务实测：workspace-write 75.5k
 *   input tokens vs danger-full-access 36.2k）；关闭 OS 级沙箱后仍保留
 *   审批策略，权限姿态与 claude 的 bypassPermissions / gemini 的 --yolo
 *   旁路模式一致。
 */
function codexSandboxMode(platform) {
  return platform === 'win32' ? 'danger-full-access' : 'workspace-write'
}

/** 旧版插件把 codex 沙箱参数直接写进默认 args 的两种形态（UI 模板与
 *  文档预设）；保存值与之一字不差时按未设置处理，让平台自适应默认生效。 */
const LEGACY_CODEX_DEFAULT_ARGS = new Set([
  'exec --json --sandbox workspace-write',
  'exec --json --sandbox workspace-write --skip-git-repo-check',
])

/**
 * 无头 CLI 子代理（cli 类型）的安全默认参数与结果解析器。
 * 安全默认：自动批准工具调用 + 平台自适应沙箱（见 codexSandboxMode）；
 * 用户可在 agent 配置的 `args` 字段整体覆盖（空格分隔、支持引号；
 * codex 的自定义 args 未显式指定 --sandbox 时按平台自动补齐）。
 * CLI 使用自身登录态（codex login / claude / gemini 各自完成一次
 * OAuth 登录），本插件不接触其凭据。
 * loginArgs/statusArgs/modelsArgs：登录/状态/模型列表命令参数，用户可
 * 经 agent 配置覆盖；modelsArgs 为空（如 codex/claude 不提供列表命令）
 * 时回退 knownModels 常见模型清单。
 */
const CLI_PRESETS = {
  codex: {
    args: (platform) => ['exec', '--json', '--sandbox', codexSandboxMode(platform), '--skip-git-repo-check'],
    modelFlag: '-m',
    parse: extractCodexJsonl,
    loginArgs: ['login'],
    statusArgs: ['login', 'status'],
    modelsArgs: null,
    knownModels: ['gpt-5.4-codex', 'gpt-5.2-codex', 'gpt-5.1-codex', 'gpt-5-codex', 'o4-mini', 'o3', 'gpt-4.1'],
  },
  claude: {
    args: ['-p', '--output-format', 'json', '--permission-mode', 'bypassPermissions'],
    modelFlag: '--model',
    parse: extractCliJsonObject,
    loginArgs: ['auth', 'login'],
    statusArgs: ['auth', 'status'],
    modelsArgs: null,
    knownModels: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-6', 'claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
  },
  gemini: {
    args: ['-p', '--output-format', 'json', '--yolo'],
    modelFlag: '-m',
    parse: extractCliJsonObject,
    loginArgs: ['auth', 'login'],
    statusArgs: ['auth', 'status'],
    modelsArgs: ['--list-models'],
    knownModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'],
  },
}

/** claude auth status 的 JSON 输出解析（loggedIn/authMethod/apiProvider）。 */
export function parseClaudeStatus(raw) {
  let obj = null
  try {
    obj = JSON.parse(String(raw).trim())
  } catch { /* 非 JSON 输出 */ }
  if (obj && typeof obj === 'object' && typeof obj.loggedIn === 'boolean') {
    const detail = ['authMethod', 'apiProvider'].map((key) => (obj[key] ? `${key}: ${obj[key]}` : '')).filter(Boolean).join(' · ')
    return { loggedIn: obj.loggedIn, message: detail }
  }
  return null
}

/** 模型列表输出解析：优先 JSON（{models:[]} / 数组），回退逐行文本。 */
function parseCliModelsList(raw) {
  let obj = null
  try {
    obj = JSON.parse(String(raw).trim())
  } catch { /* 非 JSON 输出 */ }
  const clean = (list) => [...new Set(list.map((item) => String(item ?? '').trim()).filter(Boolean))].slice(0, 50)
  if (Array.isArray(obj)) {
    return clean(obj.map((item) => (typeof item === 'string' ? item : item?.name ?? item?.id ?? item?.model ?? '')))
  }
  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj.models)) return clean(obj.models.map((item) => (typeof item === 'string' ? item : item?.name ?? item?.id ?? '')))
    if (Array.isArray(obj.result)) return clean(obj.result.map((item) => (typeof item === 'string' ? item : item?.name ?? item?.id ?? '')))
  }
  return clean(String(raw).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && !line.startsWith('WARNING')))
}

/**
 * codex exec --json 的 JSONL 解析：收集 assistant 消息文本。
 * 兼容 item 消息行（role=assistant 的 text 块）与 turn 完成行两种形态；
 * 解析不出时回退原文。
 */
export function extractCodexJsonl(raw) {
  const parts = []
  for (const line of String(raw).split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let obj
    try {
      obj = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (obj && obj.type === 'item' && obj.item?.type === 'message' && obj.item?.role === 'assistant') {
      for (const block of obj.item.content ?? []) {
        if (block && block.type === 'text' && block.text) parts.push(block.text)
      }
    }
    if (obj && obj.type === 'turn' && obj.turn?.type === 'message' && obj.turn?.status === 'completed') {
      for (const block of obj.turn.content ?? []) {
        if (block && block.type === 'text' && block.text) parts.push(block.text)
      }
    }
  }
  const text = parts.join('\n').trim()
  return text ? { text } : { text: raw.trim() }
}

/** claude -p --output-format json 与 gemini -p --output-format json 的对象解析。 */
export function extractCliJsonObject(raw) {
  let obj
  try {
    obj = JSON.parse(String(raw).trim())
  } catch {
    return { text: raw.trim() }
  }
  if (!obj || typeof obj !== 'object') return { text: raw.trim() }
  if (typeof obj.result === 'string') return { text: obj.result.trim() }
  if (obj.result && typeof obj.result === 'object') {
    if (typeof obj.result.result === 'string') return { text: obj.result.result.trim() }
    const blocks = (Array.isArray(obj.result.content) ? obj.result.content : []).map((block) => (typeof block === 'string' ? block : block?.text)).filter(Boolean)
    if (blocks.length > 0) return { text: blocks.join('\n').trim() }
  }
  if (typeof obj.response === 'string') return { text: obj.response.trim() }
  if (typeof obj.text === 'string') return { text: obj.text.trim() }
  return { text: raw.trim() }
}

/** 参数文本分词：空格分隔，支持双/单引号包裹含空格的参数。 */
function splitCliArgs(text) {
  if (typeof text !== 'string' || !text.trim()) return []
  const out = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match
  while ((match = re.exec(text))) out.push(match[1] ?? match[2] ?? match[3])
  return out
}

/** argv 中是否已显式指定 codex 沙箱/权限开关：--sandbox / -s /
 *  --sandbox=<mode>，或完整旁路开关 --dangerously-bypass-approvals-and-sandbox。
 *  仅用于 codex 的自动补齐判定（调用方已限定 base === 'codex'）。 */
function hasSandboxFlag(argv) {
  return argv.some((token) => typeof token === 'string' && (token === '--sandbox' || token === '-s' || token.startsWith('--sandbox=') || token === '--dangerously-bypass-approvals-and-sandbox'))
}

/**
 * argv 中生效的 CLI 沙箱模式（按 CLI 语义识别，避免跨 CLI 误读）：
 * - codex：`--sandbox <mode>` / `-s <mode>` / `--sandbox=<mode>` 值形态，
 *   返回 mode（read-only / workspace-write / danger-full-access）；未指定 ''；
 * - gemini：`-s` / `--sandbox` 是布尔标志（无值），出现即视为已启用沙箱，
 *   返回 'on'（其语义为限制写入工作区）；未出现 ''；
 * - 其余 CLI（claude 无沙箱标志等）：一律 ''。
 */
function sandboxFlagValue(argv, base) {
  if (base === 'gemini') {
    return argv.some((token) => typeof token === 'string' && (token === '-s' || token === '--sandbox')) ? 'on' : ''
  }
  if (base !== 'codex') return ''
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]
    if (typeof token !== 'string') continue
    if (token.startsWith('--sandbox=')) return token.slice('--sandbox='.length)
    if (token === '--sandbox' || token === '-s') return index + 1 < argv.length && typeof argv[index + 1] === 'string' ? argv[index + 1] : ''
  }
  return ''
}

/**
 * cli 执行的工作区提示文案：与生效沙箱模式保持一致——
 * - 受限（codex 的 workspace-write/read-only、gemini 启用沙箱的 'on'）：
 *   提示工作区之外的路径受沙箱限制；
 * - 未启用（danger-full-access，或 claude bypassPermissions / gemini --yolo
 *   等旁路形态 ''）：不再声称沙箱限制，改为要求把读写收敛在工作区内。
 * 供 runCli 使用，导出给单测直接覆盖两个分支。
 */
export function cliWorkspaceHint(cwd, sandbox) {
  const restricted = sandbox !== '' && sandbox !== 'danger-full-access'
  return restricted
    ? `工作目录：${cwd}（读写文件请在该目录内进行；工作区之外的路径受沙箱限制，无法访问）`
    : `工作目录：${cwd}（读写文件请在该目录内进行；本次执行未启用 CLI 沙箱，请勿修改工作区之外的任何路径）`
}

/** cmd.exe 命令行引号包裹（双引号双写、% 双写避免变量展开；仅用于 .cmd/.bat shim 形态）。 */
function quoteCmd(arg) {
  const escaped = String(arg).replace(/"/g, '""').replace(/%/g, '%%')
  return `"${escaped}"`
}

/**
 * cmd /s /c 行首尾引号剥离：对已含引号的命令行再包一层，配合
 * spawn 的 windowsVerbatimArguments 原样传递——Node 默认会把 argv 内
 * 的引号用反斜杠转义，破坏 cmd 对 .cmd shim 路径的解析（表现为
 * '"...\codex.cmd"' is not recognized）。
 */
export function wrapCmdLine(argv) {
  if (!Array.isArray(argv) || argv.length !== 4 || argv[0] !== '/d' || argv[1] !== '/s' || argv[2] !== '/c') return argv
  const line = argv[3]
  if (typeof line !== 'string' || !line.startsWith('"')) return argv
  return [...argv.slice(0, 3), `"${line}"`]
}

/** chat 类型 files 注入：单次调用最多注入的图片数。 */
const CHAT_FILES_MAX_IMAGES = 8

/** chat 类型 files 注入：单次 readBytes 的字节上限（与 URL 下载一致）。 */
const CHAT_FILE_READ_MAX_BYTES = 25 * 1024 * 1024

/** chat 类型 files 注入：文本内联的字符上限（单文件与总量一致）。 */
const CHAT_FILES_TEXT_MAX_CHARS = 200_000

/** 统计保留：最近记录条数 / 分钟桶保留窗口（分钟）。 */
const RECENT_CAP = 100
const SERIES_WINDOW_MINUTES = 90

/**
 * 内置公开 OAuth Client（零配置一键授权）：Google Cloud SDK（gcloud）的
 * 公开 client，社区工具广泛借用；其注册回调固定为 http://localhost:8085/。
 * 仅适用于 Google 账号体系（Gemini 预设）；自建 client 仍走 3080 回调。
 */
export const PUBLIC_OAUTH_CLIENT = {
  clientId: '32555940559.apps.googleusercontent.com',
  clientSecret: 'ZmssLNjJy2998hD4CTg2ejr2',
  redirectUri: 'http://localhost:8085/',
  redirectPort: 8085,
}

/**
 * 内置公开 Client 可用的 Gemini OAuth scope。旧 scope
 * `https://www.googleapis.com/auth/generativelanguage` 已被 Google 拒绝
 * （invalid_scope）；官方教程的新 scope
 * `generative-language.retriever` 是受限 scope，公开 client 会被拒
 * （403 restricted_client）。`cloud-platform` 是公开 client 唯一可过
 * 授权页的 scope（gcloud CLI 同款）；但其 token 无法调用 Gemini API
 * （403 insufficient scopes）——公开 client 仅能完成授权。
 */
export const GEMINI_OAUTH_SCOPES = 'https://www.googleapis.com/auth/cloud-platform'

/** 自建 OAuth Client 的 Gemini scope 组合（官方 OAuth quickstart 同款）：
 *  token 可调用 Gemini API（含模型发现）。 */
export const GEMINI_SELF_CLIENT_SCOPES = 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/generative-language.retriever'

/** Gemini scope 迁移：
 *  - builtin（公开 client）：剥掉 retriever 变体与旧 generativelanguage
 *    （公开 client 无权使用受限 scope，403 restricted_client）；剥完为空
 *    则用 cloud-platform；
 *  - 自建 client：旧 generativelanguage 迁移为官方组合（cloud-platform +
 *    generative-language.retriever）。 */
export function migrateGeminiScope(scope, builtin = true) {
  const text = typeof scope === 'string' ? scope.trim() : ''
  if (!text) return text
  if (builtin) {
    const tokens = text.split(/\s+/).filter((token) => !token.includes('retriever') && !token.includes('generativelanguage'))
    return tokens.length > 0 ? tokens.join(' ') : GEMINI_OAUTH_SCOPES
  }
  return text.includes('generativelanguage') && !text.includes('generative-language')
    ? GEMINI_SELF_CLIENT_SCOPES
    : text
}

/** 从任意错误取人类可读消息。 */
export function errorMessage(error) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && typeof error.message === 'string') return error.message
  return String(error)
}

/** 一键授权回调页：极简自包含 HTML，展示结果并尝试自动关闭弹窗。 */
export function oauthCallbackHtml(result) {
  const ok = result?.ok === true
  const message = String(result?.message ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const title = ok ? '授权成功' : '授权失败'
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · dsh-agent-router</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#14151a;color:#e8e9ed;font-family:system-ui,'Segoe UI',sans-serif}
.card{max-width:420px;margin:24px;padding:28px 32px;border:1px solid #2c2e38;border-radius:14px;background:#1b1d24;text-align:center}
.icon{font-size:40px;line-height:1}
.title{font-size:18px;font-weight:600;margin:12px 0 8px}
.message{font-size:13px;line-height:20px;color:#9a9daa;word-break:break-all}
.hint{font-size:12px;line-height:18px;color:#6f7280;margin-top:16px}
</style>
</head>
<body>
<div class="card">
  <div class="icon">${ok ? '✅' : '❌'}</div>
  <div class="title">${title}</div>
  <div class="message">${message}</div>
  <div class="hint">此窗口将自动关闭；如未关闭可手动关闭。设置页会自动刷新登录状态。</div>
</div>
<script>try{setTimeout(function(){window.close()},1800)}catch(e){}</script>
</body>
</html>`
}

/** 从编码字节嗅探图片 media type（默认 png）。 */
function sniffMediaType(data) {
  if (data.length >= 4 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 12 && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return 'image/webp'
  if (data.length >= 4 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'image/gif'
  return 'image/png'
}

/** 严格按魔数识别图片 media type；非 PNG/JPEG/WebP/GIF 返回 undefined。 */
function detectImageMediaType(data) {
  if (data.length >= 4 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 12 && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return 'image/webp'
  if (data.length >= 4 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'image/gif'
  return undefined
}

/** base64（标准字母表）解码为字节。 */
function decodeBase64(text) {
  const binary = globalThis.atob(text)
  const data = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) data[index] = binary.charCodeAt(index)
  return data
}

/** 分钟键：ISO 时间截断到分钟。 */
function minuteKey(at) {
  return new Date(at).toISOString().slice(0, 16)
}

/**
 * 宿主多模型路由服务。
 */
export class RouterService extends TypertRemoteService {
  constructor(ctx, base = {}) {
    super(ctx, 'router')
    /** 组合层 base（settings 未挂载时的后备配置）。 */
    this.base = base ?? {}
    /** settings scope（由 index.js attach）。 */
    this.scope = null
    /** 一键授权进行中的会话：state → { accountId, verifier, redirectUri, expiresAt }。 */
    this.oauthPending = new Map()
    /** 账号池 round-robin 游标（池 id → 下一个候选下标）。 */
    this.poolCursors = new Map()
    /** cli 类型并发计数（agentId → 当前运行数）。 */
    this.cliRunning = new Map()
    /** cli 类型活动子进程集合（停止/卸载时全部杀死）。 */
    this.cliChildren = new Set()
    /** 内置公开 Client 的 8085 回调端口是否已就绪（由 index.js 设置）。 */
    this.oauthLoopbackReady = false
    this.resetStats()
  }

  /** 挂接 settings scope；传入 null 回退到组合层 base。 */
  attach(scope) {
    this.scope = scope ?? null
  }

  /** 当前 resolved 状态（热读取）。 */
  getState() {
    return this.scope ? this.scope.get() : this.base
  }

  /** 总开关。 */
  isEnabled() {
    return this.getState().enabled !== false
  }

  /** 按 id 读取一个 agent 配置（未找到返回 undefined）。 */
  getAgent(id) {
    const agents = this.getState().agents ?? {}
    return agents[id]
  }

  /** 启用的 agent 列表（[id, config]）。 */
  listEnabledAgents() {
    return Object.entries(this.getState().agents ?? {})
      .filter(([, agent]) => agent && agent.enabled !== false)
      .map(([id, agent]) => [id, agent])
  }

  /** 主 agent 默认模型（进程级默认选择）。 */
  defaults() {
    const model = this.ctx.get('agentDefaultModel')
    const selection = typeof model?.currentSelection === 'function' ? model.currentSelection() : undefined
    return {
      provider: selection?.provider ?? '',
      model: selection?.model ?? '',
      reasoningEffort: selection?.reasoningEffort ?? undefined,
    }
  }

  /** 按 id 读取一个 OAuth 账号配置（未找到返回 undefined）。 */
  getOAuthAccount(id) {
    const accounts = this.getState().oauthAccounts ?? {}
    return accounts[id]
  }

  /** 按 id 读取一个账号池配置（未找到返回 undefined）。 */
  getPool(id) {
    const pools = this.getState().pools ?? {}
    return pools[id]
  }

  /** 按 id 读取一个 CLI 子代理条目（未找到返回 undefined）。 */
  getCliEntry(id) {
    const entries = this.getState().cliAgents ?? {}
    return entries[id]
  }

  /**
   * 解析 cli 执行目标。agentId 可能是：
   * - CLI 子代理条目 id（账号区的「子代理」卡片直接调用）；
   * - 专业 agent id：其 `cliAgent` 引用优先；未引用时回退旧形态
   *   （agent 内嵌 command/args 字段，合成伪条目）。
   * 返回 { id, entry, source } 或 { id, error }。
   */
  async resolveCliTarget(agentId) {
    const id = String(agentId ?? '')
    const direct = this.getCliEntry(id)
    if (direct) return { id, entry: direct, source: 'entry' }
    const resolved = await this.resolveAgent(id)
    if (resolved.error) return { id, error: resolved.error }
    if (this.normalizeType(resolved.agent.type) !== 'cli') return { id, error: '该操作仅支持 cli 执行方式的专业 agent（或账号区的 CLI 子代理条目）' }
    const agent = resolved.agent
    const ref = typeof agent.cliAgent === 'string' && agent.cliAgent.trim() ? agent.cliAgent.trim() : ''
    if (ref) {
      const entry = this.getCliEntry(ref)
      if (!entry) return { id: ref, error: `子代理 "${ref}" 不存在：请在 设置 → Agent 路由 → 多模态账号 → 子代理 中创建` }
      return { id: ref, entry, source: 'reference' }
    }
    // 旧形态：agent 内嵌命令配置（迁移前兼容）。
    return { id, entry: { ...agent, name: agent.name || id }, source: 'legacy-agent' }
  }

  /**
   * 解析一个 agent 的有效 provider/model。
   * 若 agent 指定了插件独立管理的 OAuth 账号（account 字段），则返回
   * { mode: 'oauth', account }，调用走插件直连通路，绝不注册 llm 路由；
   * 若指向账号池（`pool:<id>`），返回 { mode: 'pool', pool, candidates }，
   * 调用时按池策略选择账号并失败切换。
   * 否则返回 { mode: 'route', provider, model, source, error? }。
   */
  async resolveAgent(id) {
    const agent = this.getAgent(id)
    if (!agent) return { id, agent: null, mode: 'route', provider: '', model: '', source: 'unknown', error: `未知 agent "${id}"（可用：${this.listEnabledAgents().map(([key]) => key).join(', ') || '无'}）` }
    const accountId = typeof agent.account === 'string' ? agent.account.trim() : ''
    if (accountId.startsWith('pool:')) {
      const poolId = accountId.slice(5)
      const pool = this.getPool(poolId)
      if (!pool) return { id, agent, mode: 'pool', poolId, provider: `oauth:pool:${poolId}`, model: '', source: 'pool', candidates: [], error: `账号池 "${poolId}" 不存在` }
      const candidates = (Array.isArray(pool.accounts) ? pool.accounts : [])
        .map((accountRef) => ({ accountId: String(accountRef), account: this.getOAuthAccount(String(accountRef)) }))
        .filter((entry) => entry.account && entry.account.enabled !== false)
      if (candidates.length === 0) return { id, agent, mode: 'pool', poolId, pool, provider: `oauth:pool:${poolId}`, model: '', source: 'pool', candidates, error: `账号池 "${poolId}"（${pool.name || poolId}）内没有可用账号；请先在池中添加并授权账号` }
      const first = candidates[0].account
      const model = (typeof agent.model === 'string' && agent.model.trim()) || (Array.isArray(first.models) ? first.models[0] ?? '' : '')
      if (!model) return { id, agent, mode: 'pool', poolId, pool, provider: `oauth:pool:${poolId}`, model, source: 'pool', candidates, error: `账号池 "${poolId}"（${pool.name || poolId}）内账号尚未配置模型；请在账号卡片中发现或添加模型` }
      return { id, agent, mode: 'pool', poolId, pool, provider: `oauth:pool:${poolId}`, model, source: 'pool', candidates }
    }
    if (accountId) {
      const account = this.getOAuthAccount(accountId)
      if (!account) return { id, agent, mode: 'oauth', accountId, provider: `oauth:${accountId}`, model: '', source: 'account', error: `OAuth 账号 "${accountId}" 不存在` }
      const model = (typeof agent.model === 'string' && agent.model.trim()) || (Array.isArray(account.models) ? account.models[0] ?? '' : '')
      const provider = `oauth:${accountId}`
      if (!model) return { id, agent, mode: 'oauth', accountId, account, provider, model, source: 'account', error: `OAuth 账号 "${accountId}"（${account.name || accountId}）尚未配置模型；请在账号卡片中发现或添加模型` }
      return { id, agent, mode: 'oauth', accountId, account, provider, model, source: 'account' }
    }
    // cli 类型：模型/服务商不是路由目标（CLI 用自身登录态与默认模型，
    // model 仅作为 -m/--model 可选参数）——不兜底解析主模型；provider 记
    // 为 cli:<子代理 id>，使用量统计按子代理条目聚合。
    if (this.normalizeType(agent.type) === 'cli') {
      const cliRef = typeof agent.cliAgent === 'string' && agent.cliAgent.trim() ? agent.cliAgent.trim() : ''
      return {
        id,
        agent,
        mode: 'route',
        provider: `cli:${cliRef || id}`,
        model: typeof agent.model === 'string' ? agent.model.trim() : '',
        source: 'agent',
      }
    }
    const defaults = this.defaults()
    const agentProvider = typeof agent.provider === 'string' ? agent.provider.trim() : ''
    const agentModel = typeof agent.model === 'string' ? agent.model.trim() : ''
    let provider = agentProvider || defaults.provider || ''
    let model = agentModel
    let source = 'agent'
    if (!model) {
      if (!agentProvider) {
        model = defaults.model || ''
        source = 'main'
      } else {
        const models = await this.safeListModels(provider)
        model = models[0]?.id ?? ''
        source = 'provider-default'
      }
    }
    if (!provider) return { id, agent, mode: 'route', provider, model, source, error: '未解析到服务商：请为该 agent 配置服务商，或先在 设置 → 模型 中配置主模型' }
    if (!model) return { id, agent, mode: 'route', provider, model, source, error: `服务商 "${provider}" 没有可用模型（未注册或未配置）；请先在 设置 → 模型 中完成该服务商的配置` }
    return { id, agent, mode: 'route', provider, model, source }
  }

  /** listModels 的容错包装。 */
  async safeListModels(provider) {
    const llm = this.ctx.get('llm')
    if (!llm || typeof llm.listModels !== 'function') return []
    try {
      return await llm.listModels(provider)
    } catch {
      return []
    }
  }

  /** 归一化 type（未知值按 chat 处理）。 */
  normalizeType(type) {
    return AGENT_TYPES.includes(type) ? type : 'chat'
  }

  /**
   * 执行一次专业调用。input：
   * { agentId, task, extra?, images?: ImageAttachmentRef[], files?: string[],
   *   exec?, signal? }
   * 返回 { kind, text, image?, usage?, stopReason? }；失败抛错。
   */
  async run(input) {
    const id = String(input.agentId)
    const resolved = await this.resolveAgent(id)
    if (resolved.error) throw new Error(resolved.error)
    const type = this.normalizeType(resolved.agent.type)
    const inputFiles = Array.isArray(input.files) ? input.files.filter((item) => typeof item === 'string' && item.trim()) : []
    if (inputFiles.length > 0) {
      // files 按 agent 能力分发，而不是按类型一刀切：
      // - agent / cli 类型：路径注入子代理任务（agent 用 fs 工具读取；
      //   cli 由无头 CLI 自身工具读取）；
      // - chat 类型：按文件内容能力化分发——图片（需 capabilities 含 image）
      //   经附件服务内联注入、文本内联进 task、其余二进制/目录明确报错。
      if (type === 'agent' || type === 'cli') {
        if (resolved.mode !== 'route') throw new Error('files 文件附件仅支持普通 agent / cli 类型专业 agent（OAuth 账号/账号池仅支持 chat 类型）')
        input.filesResolved = await this.resolveInputFiles(inputFiles, input)
      } else if (type === 'chat') {
        input.filesResolved = await this.resolveInputFiles(inputFiles, input)
        input.chatFiles = await this.prepareChatFiles(resolved, input)
      } else {
        throw new Error(`files 文件附件仅支持 chat 与 agent 类型专业 agent（当前类型：${type}）；image/speech 类型请改用 task 描述或 filePath`)
      }
    }
    if (resolved.mode === 'oauth') {
      if (type !== 'chat') throw new Error(`OAuth 账号目前仅支持 chat 类型 agent（当前类型：${type}）`)
      return this.runOauthChat(resolved, input)
    }
    if (resolved.mode === 'pool') {
      if (type !== 'chat') throw new Error(`账号池目前仅支持 chat 类型 agent（当前类型：${type}）`)
      return this.runPooledOauthChat(resolved, input)
    }
    if (type === 'image') return this.runImage(resolved, input)
    if (type === 'agent') return this.runAgentDelegation(resolved, input)
    if (type === 'cli') return this.runCli(resolved, input)
    if (type === 'speech') return this.runSpeech(resolved, input)
    return this.runChat(resolved, input)
  }

  /**
   * 把 files 参数（工作区路径或 http(s) URL 列表，任意类型文件）解析为
   * 可注入子代理任务的条目：
   * - 路径：相对路径按会话 cwd 解析，stat 不存在时报错（目录放行）；
   * - URL：宿主 fetch 下载（≤25MB、60s 超时），落盘到工作区
   *   `.router-files/<basename>` 后按路径注入。
   */
  async resolveInputFiles(paths, input) {
    const fs = this.ctx.get('fs')
    if (!fs || typeof fs.resolve !== 'function' || typeof fs.stat !== 'function') throw new Error('文件服务不可用，无法校验 files 路径')
    const cwd = input.exec?.agent?.session?.header?.cwd
    const resolvedPaths = []
    for (const raw of paths) {
      if (/^https?:\/\//i.test(raw)) {
        resolvedPaths.push(await this.downloadInputFile(raw, input))
        continue
      }
      let target
      try {
        target = await fs.resolve(raw, { ...(cwd ? { cwd } : {}) })
      } catch (error) {
        throw new Error(`无法解析文件路径 "${raw}"：${errorMessage(error)}`)
      }
      try {
        const info = await fs.stat(target, input.signal)
        if (info === undefined) throw new Error('不存在')
        resolvedPaths.push({ input: raw, displayPath: typeof target?.displayPath === 'string' && target.displayPath ? target.displayPath : raw, type: info.type, target })
      } catch (error) {
        throw new Error(`文件路径 "${raw}" 不存在或不可访问（会话工作区：${cwd || '未设置'}）`)
      }
    }
    return resolvedPaths
  }

  /** files 的 URL 条目：下载并落盘到工作区 .router-files/，返回注入条目。 */
  async downloadInputFile(url, input) {
    const cwd = input.exec?.agent?.session?.header?.cwd
    if (!cwd) throw new Error(`files URL 落盘需要会话工作目录：${url}`)
    const dir = join(cwd, '.router-files')
    try {
      mkdirSync(dir, { recursive: true })
    } catch (error) {
      throw new Error(`无法创建工作区下载目录 ${dir}：${errorMessage(error)}`)
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS)
    let response
    try {
      response = await globalThis.fetch(url, { signal: input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal })
    } catch (error) {
      throw new Error(`files URL 下载失败（${url}）：${errorMessage(error)}`)
    } finally {
      clearTimeout(timer)
    }
    if (!response.ok) throw new Error(`files URL 下载失败（${url}）：HTTP ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length > URL_FILE_MAX_BYTES) throw new Error(`files URL 超过大小上限（${url}：${bytes.length} 字节 > 25MB）`)
    let name = ''
    try {
      name = basename(decodeURIComponent(new URL(url).pathname))
    } catch { /* 非标准 URL：用时间戳命名 */ }
    if (!name || name === '/' || name === '.') name = `download-${Date.now().toString(36)}`
    name = name.replace(/[^A-Za-z0-9._-]/g, '_') || `download-${Date.now().toString(36)}`
    const target = join(dir, name)
    try {
      writeFileSync(target, bytes)
    } catch (error) {
      throw new Error(`files URL 落盘失败（${target}）：${errorMessage(error)}`)
    }
    // 落盘后经 fs 服务再解析一次：注入条目携带 FsTarget，供后续读取
    // （agent 类型只注入路径；chat 类型还要按内容能力化分发）。
    const fs = this.ctx.get('fs')
    let fsTarget
    try {
      fsTarget = await fs.resolve(target, {})
    } catch (error) {
      throw new Error(`files URL 落盘后无法解析（${target}）：${errorMessage(error)}`)
    }
    return { input: url, displayPath: typeof fsTarget?.displayPath === 'string' && fsTarget.displayPath ? fsTarget.displayPath : target, type: 'file', kind: 'url', target: fsTarget }
  }

  /**
   * chat 类型 agent 的 files 准备（能力驱动的按需派发）：
   * - 图片文件（魔数识别 PNG/JPEG/WebP/GIF）：要求 agent 的 capabilities
   *   含 image，经附件服务存为持久引用（内容寻址，天然去重）随图片块注入；
   * - 文本文件（首 8KB 无 NUL 且 UTF-8 严格解码成功）：内联进 task；
   * - 其余二进制/目录：明确报错并提示改用 agent 类型。
   * 返回 { images: ImageAttachmentRef[], sections: [{ name, text }] }。
   */
  async prepareChatFiles(resolved, input) {
    const agent = resolved.agent
    const fs = this.ctx.get('fs')
    if (!fs || typeof fs.readBytes !== 'function') throw new Error('文件服务不可用，无法为 chat 类型 agent 注入 files')
    const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities.filter((item) => typeof item === 'string') : []
    const entries = Array.isArray(input.filesResolved) ? input.filesResolved : []
    const images = []
    const sections = []
    const seen = new Set()
    let inlineChars = 0
    for (const entry of entries) {
      if (entry.type === 'directory') throw new Error(`chat 类型 agent 无法读取目录（${entry.displayPath}）：请改用 agent 类型专业 agent（子代理可用 fs 工具遍历目录）`)
      if (!entry.target) throw new Error(`无法定位文件 "${entry.displayPath}"`)
      let bytes
      try {
        bytes = await fs.readBytes(entry.target, input.signal, CHAT_FILE_READ_MAX_BYTES)
      } catch (error) {
        throw new Error(`读取文件 "${entry.displayPath}" 失败：${errorMessage(error)}`)
      }
      const mediaType = detectImageMediaType(bytes)
      if (mediaType) {
        if (!capabilities.includes('image')) throw new Error(`agent "${resolved.id}" 未声明 image 能力，无法接收图片文件 ${entry.displayPath}；请在 agent 配置的 capabilities 中加入 image（或改用 agent 类型专业 agent）`)
        if (images.length >= CHAT_FILES_MAX_IMAGES) throw new Error(`files 图片注入单次上限 ${CHAT_FILES_MAX_IMAGES} 张（本次至少 ${images.length + 1} 张）：请分批调用`)
        const attachments = this.ctx.get('attachments')
        if (!attachments || typeof attachments.saveImage !== 'function') throw new Error('附件服务不可用，无法为 chat 类型 agent 注入图片文件')
        let ref
        try {
          ref = await attachments.saveImage({ data: bytes, mediaType, name: basename(entry.displayPath) })
        } catch (error) {
          throw new Error(`图片文件 "${entry.displayPath}" 无法注入：${errorMessage(error)}`)
        }
        if (!seen.has(String(ref.attachmentId))) {
          seen.add(String(ref.attachmentId))
          images.push(ref)
        }
        continue
      }
      // 非图片：文本嗅探——无 NUL 字节且整段严格 UTF-8 解码成功才算文本。
      let text = ''
      let isText = !bytes.includes(0)
      if (isText) {
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        } catch {
          isText = false
        }
      }
      if (!isText) throw new Error(`chat 类型 agent 无法处理二进制文件 ${entry.displayPath}（远端模型调用，无文件系统）：请改用 agent 类型专业 agent 处理，或把内容以文本写入 task`)
      const capped = text.length > CHAT_FILES_TEXT_MAX_CHARS
        ? `${text.slice(0, CHAT_FILES_TEXT_MAX_CHARS)}\n…（内容过长已截断，完整文件请改用 agent 类型处理）`
        : text
      if (sections.length > 0 && inlineChars + capped.length > CHAT_FILES_TEXT_MAX_CHARS) {
        throw new Error(`files 文本内联总量超过 ${CHAT_FILES_TEXT_MAX_CHARS} 字符上限：请减少文件数量或改用 agent 类型专业 agent`)
      }
      inlineChars += capped.length
      sections.push({ name: entry.displayPath, text: capped })
    }
    return { images, sections }
  }

  /** 组装 files 文本注入段（chat 类型）：图片文件清单 + 文本文件内联。 */
  composeChatFileText(chatFiles) {
    if (!chatFiles) return ''
    const lines = []
    if (Array.isArray(chatFiles.images) && chatFiles.images.length > 0) {
      lines.push(`本任务已附带 ${chatFiles.images.length} 个 files 图片文件（作为图片内容直接可见，顺序与下方图片一致）：${chatFiles.images.map((ref) => ref.name || '图片').join('、')}`)
    }
    for (const section of Array.isArray(chatFiles.sections) ? chatFiles.sections : []) {
      lines.push(`--- 文件：${section.name} ---\n${section.text}`)
    }
    return lines.length > 0 ? `\n\n[files 文件注入]\n${lines.join('\n\n')}` : ''
  }

  /**
   * 账号池调用（扩展功能）：按池策略排序候选账号，逐个尝试；单个账号
   * 失败时记入健康统计并切换到下一个，全部失败才抛错。
   */
  async runPooledOauthChat(resolved, input) {
    const candidates = this.orderPoolCandidates(resolved.poolId, resolved.pool, resolved.candidates)
    let lastError
    for (const candidate of candidates) {
      const started = Date.now()
      try {
        return await this.runOauthChat({
          ...resolved,
          mode: 'oauth',
          accountId: candidate.accountId,
          account: candidate.account,
          provider: `oauth:${candidate.accountId}`,
        }, input)
      } catch (error) {
        lastError = error
        this.record({
          agentId: resolved.id,
          provider: `oauth:${candidate.accountId}`,
          model: resolved.model,
          ok: false,
          ms: Date.now() - started,
          error: errorMessage(error),
        })
      }
    }
    throw new Error(`账号池 "${resolved.poolId}"（${resolved.pool?.name || resolved.poolId}）内所有账号均失败${lastError ? `；最后错误：${errorMessage(lastError)}` : ''}`)
  }

  /** 单个账号的健康摘要（失败次数 + 最近失败时间，来自统计聚合）。 */
  accountHealth(accountId) {
    const provider = `oauth:${accountId}`
    const total = this.accountTotals.get(provider)
    if (!total) return { calls: 0, errors: 0, lastAt: 0 }
    return { calls: total.calls, errors: total.errors, lastAt: total.lastAt }
  }

  /** 按池策略对候选账号排序（healthy / usage-lowest / round-robin）。 */
  orderPoolCandidates(poolId, pool, candidates) {
    const strategy = ['healthy', 'usage-lowest', 'round-robin'].includes(pool?.strategy) ? pool.strategy : 'healthy'
    const copy = [...candidates]
    if (strategy === 'round-robin') {
      const key = `pool:${poolId}`
      const cursor = this.poolCursors.get(key) ?? 0
      this.poolCursors.set(key, (cursor + 1) % Math.max(1, copy.length))
      return [...copy.slice(cursor % copy.length), ...copy.slice(0, cursor % copy.length)]
    }
    const health = (candidate) => this.accountHealth(candidate.accountId)
    copy.sort((a, b) => {
      const ha = health(a)
      const hb = health(b)
      if (strategy === 'usage-lowest') return ha.calls - hb.calls
      // healthy：失败次数升序；同为 0 失败时按最近失败时间越早越优先（=最近没失败过的在前）。
      if (ha.errors !== hb.errors) return ha.errors - hb.errors
      return ha.lastAt - hb.lastAt
    })
    return copy
  }

  /** 组装专业调用文本。 */
  composeTask(task, extra) {
    const base = typeof task === 'string' && task.trim() ? task.trim() : ''
    const more = typeof extra === 'string' && extra.trim() ? extra.trim() : ''
    if (!base && !more) throw new Error('task 不能为空')
    return more ? `${base}\n\n[补充说明]\n${more}` : base
  }

  /** chat 类型：经 llm.stream 单/多轮调用。 */
  async runChat(resolved, input) {
    const llm = this.ctx.get('llm')
    if (!llm || typeof llm.stream !== 'function') throw new Error('llm 服务不可用')
    const agent = resolved.agent
    const chatFiles = input.chatFiles
    const images = [
      ...(Array.isArray(input.images) ? input.images : []),
      ...(Array.isArray(chatFiles?.images) ? chatFiles.images : []),
    ]
    // 带图片的调用自动附带主会话最近上下文：截图是对话上下文的一部分，
    // 视觉 agent 需要它才能给出有意义的分析（孤立 OCR 没有价值）。
    const contextText = images.length > 0 ? this.recentConversationContext(input.exec?.agent) : ''
    const text = this.composeTask(input.task, input.extra)
      + this.composeChatFileText(chatFiles)
      + (contextText ? `\n\n[会话上下文（主会话最近对话）]\n${contextText}\n\n请结合以上上下文理解用户需求：分析围绕用户的实际问题，引用上下文中的具体信息。` : '')
    if (images.length > 0) {
      // 模型能力已知且不含 image 时，前置明确拒绝（多声明代价远大于少声明）。
      // 例外：自定义（declared）路由的 input 声明是 pi-ai 的文本默认值，
      // 不代表模型真实能力（如 GPT 中转的 gpt-5.6-luna 实际支持图片）——
      // 跳过预检，由端点裁决。
      let skipPrecheck = false
      try {
        if (typeof llm.listProviders === 'function') {
          const directory = await llm.listProviders()
          const entry = (directory ?? []).find((item) => (item.id ?? item.provider) === resolved.provider)
          skipPrecheck = !!entry && entry.declared === true
        }
      } catch { /* 目录不可用：保留预检 */ }
      if (!skipPrecheck) {
        try {
          const info = await llm.resolveModelInfo(resolved.provider, resolved.model)
          if (info?.inputModalities && !info.inputModalities.includes('image')) {
            throw new Error(`模型 ${resolved.provider}/${resolved.model} 不支持图片输入；请为该 agent 配置支持视觉的模型（如 openai/gpt-4o）`)
          }
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('模型 ')) throw error
          // resolveModelInfo 不可用：按未知能力放行，由提供方裁决。
        }
      }
    }
    const system = typeof agent.systemPrompt === 'string' && agent.systemPrompt.trim()
      ? agent.systemPrompt.trim()
      : `你是 "${agent.name || resolved.id}" 专业 agent，通过多模型路由被调用。请直接完成任务，只输出最终结果，不要寒暄。`
    const content = [{ type: 'text', text }]
    for (const ref of images) content.push({ type: 'image', attachment: ref })
    const messages = [createUserMessage({ content, source: { kind: 'user' } })]
    const rounds = Math.max(1, Math.min(8, Math.trunc(Number(agent.maxRounds)) || 1))
    let usage
    let blocks = []
    for (let round = 1; round <= rounds; round++) {
      const stream = llm.stream({
        provider: resolved.provider,
        model: resolved.model,
        system,
        messages,
        ...(typeof agent.reasoningEffort === 'string' && agent.reasoningEffort ? { reasoningEffort: agent.reasoningEffort } : {}),
        ...(Number(agent.temperature) > 0 ? { temperature: Number(agent.temperature) } : {}),
        ...(Number(agent.maxTokens) > 0 ? { maxTokens: Number(agent.maxTokens) } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
      })
      const assembler = new BlockAssembler()
      try {
        for await (const chunk of stream) assembler.push(chunk)
      } catch (error) {
        throw new Error(`调用 ${resolved.provider}/${resolved.model} 失败：${errorMessage(error)}`)
      }
      usage = assembler.usage ?? usage
      const finish = assembler.finish
      blocks = assembler.blocks()
      if (finish.kind === 'error' || finish.kind === 'aborted') {
        const failure = finish.failure
        throw new Error(`调用失败（${finish.kind}${failure ? `：${failure.code} ${failure.message}` : ''}）`)
      }
      if (finish.kind === 'stop' || finish.kind === 'tool-calls') break
      // max-tokens：轮数未用尽时继续。
      if (round < rounds) {
        messages.push(createAssistantMessage({ content: blocks, provider: resolved.provider, model: resolved.model }))
        messages.push(createUserMessage({ content: [{ type: 'text', text: '请继续完成剩余内容。' }], source: { kind: 'user' } }))
      }
    }
    let output = blocks.filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim()
    if (!output) {
      output = blocks.filter((block) => block.type === 'reasoning').map((block) => block.text).join('\n').trim()
    }
    return {
      kind: 'chat',
      text: output || '（空响应）',
      // 本次调用注入的图片引用（供工具结果渲染为缩略图——发送的图片
      // 与 files 图片都在对话的 route_agent 工具卡片中可见）。
      ...(images.length > 0 ? { images } : {}),
      usage: usage ? {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        ...(usage.cacheReadTokens !== undefined ? { cacheReadTokens: usage.cacheReadTokens } : {}),
        ...(usage.cacheWriteTokens !== undefined ? { cacheWriteTokens: usage.cacheWriteTokens } : {}),
        ...(usage.reasoningTokens !== undefined ? { reasoningTokens: usage.reasoningTokens } : {}),
      } : undefined,
    }
  }

  /** agent 类型：经 subagents seam 委派，覆盖子 agent 模型。 */
  async runAgentDelegation(resolved, input) {
    const subagents = this.ctx.get('subagents')
    if (!subagents || typeof subagents.start !== 'function') throw new Error('subagent 服务不可用')
    if (!input.exec?.agent) throw new Error('route_agent 只能在会话内调用（缺少调用方 agent）')
    const agent = resolved.agent
    const parent = input.exec.agent
    const depth = Number(parent.session?.header?.delegationDepth) || 0
    if (depth >= MAX_ROUTER_DEPTH) throw new Error(`委派深度超限（${depth} >= ${MAX_ROUTER_DEPTH}），已阻止 agent 类型路由以防止递归`)
    const text = this.composeTask(input.task, input.extra)
    // 子 agent 是零历史上下文：除 task 外，把会话工作目录与附件图片随
    // prompt 一并传过去。图片以 attachment 内容块直传（子 agent 的模型
    // 经同一 llm 适配器解析字节），并明确告知不要按文件路径去读附件。
    const images = Array.isArray(input.images) ? input.images : []
    const cwd = parent.session?.header?.cwd
    const contextLines = []
    if (cwd) contextLines.push(`工作目录：${cwd}（读写文件请在该目录内用 fs 工具操作；工作区之外的路径受沙箱限制，无法访问）`)
    if (images.length > 0) {
      contextLines.push(`本任务已附带 ${images.length} 张图片（作为图片内容直接可见），请直接查看图片内容，不要尝试按文件路径读取它们`)
      const conversation = this.recentConversationContext(parent)
      if (conversation) contextLines.push(`[主会话最近对话上下文]\n${conversation}\n\n请结合以上上下文理解用户需求，分析围绕用户的实际问题。`)
    }
    const filesResolved = Array.isArray(input.filesResolved) ? input.filesResolved : []
    if (filesResolved.length > 0) contextLines.push(`待处理文件（主 agent 显式指定，请用 fs 工具读取，一次可处理多个不同类型）：\n${filesResolved.map((entry) => `- ${entry.displayPath}${entry.type === 'directory' ? '（目录）' : ''}${entry.kind === 'url' ? '（已由宿主下载）' : ''}`).join('\n')}`)
    const promptBlocks = [{ type: 'text', text: contextLines.length > 0 ? `${text}\n\n[会话上下文]\n${contextLines.join('\n')}` : text }]
    for (const ref of images) promptBlocks.push({ type: 'image', attachment: ref })
    const tools = (Array.isArray(agent.tools) ? agent.tools : []).filter((name) => typeof name === 'string' && name)
    const allowsRoute = tools.includes('route_agent')
    let toolFilter
    if (tools.length > 0) {
      toolFilter = allowsRoute ? { allow: tools } : { allow: tools, deny: ['route_agent'] }
    } else if (!allowsRoute) {
      toolFilter = { deny: ['route_agent'] }
    }
    const run = await subagents.start('spawn', {
      label: `router:${resolved.id}`,
      prompt: promptBlocks,
      parent,
      signal: input.signal,
      agentOptions: { provider: resolved.provider, model: resolved.model },
      ...(toolFilter ? { toolFilter } : {}),
      ...(typeof agent.systemPrompt === 'string' && agent.systemPrompt.trim() ? { persona: agent.systemPrompt.trim() } : {}),
    })
    let result
    try {
      result = await run.result
    } finally {
      await run.dispose().catch(() => undefined)
    }
    const output = (result.output ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()
    if (result.stopReason !== 'completed') {
      throw new Error(`子 agent 未完成（${result.stopReason}）${output ? `：${output.slice(0, 500)}` : ''}`)
    }
    return { kind: 'agent', text: output || '（空响应）', stopReason: result.stopReason }
  }

  // ── cli 类型：无头 CLI 子代理（codex / claude / gemini 等）─────────────

  /**
   * 解析 cli 类型的命令与参数：
   * - `command` 字段必填（如 codex / claude / gemini，或任意可执行路径）；
   * - `args` 为空（或与旧版 codex 默认模板一字不差）时使用该 CLI 的安全
   *   默认参数，否则整体使用用户参数；
   * - codex 的用户参数未显式指定 --sandbox 时按平台补齐可用默认（Windows
   *   的 OS 沙箱无法启动 shell，见 codexSandboxMode），显式指定则原样保留；
   * - `model` 非空时经 modelFlag（-m / --model）传给 CLI；
   * - `platform` 供测试注入（默认取当前平台）；返回值携带生效沙箱模式
   *   sandbox，按 CLI 语义识别（codex 值形态 / gemini 布尔 / 其余无，见
   *   sandboxFlagValue）。
   */
  resolveCliSpec(agent, platform = globalThis.process?.platform ?? '') {
    const command = typeof agent?.command === 'string' && agent.command.trim() ? agent.command.trim() : ''
    if (!command) throw new Error('cli 类型 agent 需要 command 字段（如 codex / claude / gemini）；请在 设置 → Agent 路由 的 agent 卡片中填写')
    const base = command.split(/\s+/)[0].toLowerCase().replace(/\.(cmd|exe|ps1|js|mjs|cjs)$/i, '').replace(/^.*[\\/]/, '')
    const preset = CLI_PRESETS[base]
    const userArgs = splitCliArgs(agent.args)
    const legacyDefault = base === 'codex' && LEGACY_CODEX_DEFAULT_ARGS.has(userArgs.join(' '))
    const customArgs = !legacyDefault && userArgs.length > 0 ? userArgs : []
    let args
    if (customArgs.length > 0) {
      args = customArgs
      if (base === 'codex' && !hasSandboxFlag(customArgs)) args = [...customArgs, '--sandbox', codexSandboxMode(platform)]
    } else {
      args = typeof preset?.args === 'function' ? preset.args(platform) : (preset?.args ?? [])
    }
    const model = typeof agent?.model === 'string' && agent.model.trim() ? agent.model.trim() : ''
    const finalArgs = model && preset?.modelFlag ? [...args, preset.modelFlag, model] : args
    const format = finalArgs.includes('--json') || finalArgs.includes('--output-format') ? 'json' : 'text'
    return { command, base, args: finalArgs, format, parse: preset?.parse, sandbox: sandboxFlagValue(finalArgs, base) }
  }

  /** 把附件图片落盘为工作区 .router-files/ 下的文件，返回路径列表（CLI 按路径读图）。 */
  async materializeCliImages(refs, dir, stamp) {
    const attachments = this.ctx.get('attachments')
    if (!attachments || typeof attachments.readImage !== 'function') return []
    const paths = []
    const extOf = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
    let index = 0
    for (const ref of refs ?? []) {
      try {
        const stored = await attachments.readImage(ref)
        const ext = extOf[stored?.ref?.mediaType] ?? 'png'
        const name = `${CLI_TMP_PREFIX}${stamp}-img-${index++}.${ext}`
        writeFileSync(join(dir, name), stored.data)
        paths.push(join(dir, name))
      } catch {
        // 单个图片读取失败跳过（其余图片与 task 文本照常传递）。
      }
    }
    return paths
  }

  /**
   * 把 command 解析为可直接 spawn 的 { executable, argv }：
   * - .js/.mjs/.cjs：经 node 执行；
   * - .cmd/.bat（Windows）：经 cmd.exe 执行（npm shim 形态，参数逐个引号包裹）；
   * - .ps1（Windows）：经 powershell.exe -File 执行；
   * - 无扩展名（Windows）：按 PATH 探测 .exe（直连）→ .cmd（shell 兜底）；
   * - 其余直接 spawn（PATH/execvp 解析交给系统）。
   * stdout/stderr 不经管道捕获：调用方以文件 FD 作为 stdio（兼容受限环境）。
   */
  resolveCliInvocation(command, args) {
    const raw = String(command).trim()
    if (!raw) throw new Error('cli 类型 agent 需要 command 字段（如 codex / claude / gemini）；请在 设置 → Agent 路由 的 agent 卡片中填写')
    const win = globalThis.process?.platform === 'win32'
    const lower = raw.toLowerCase()
    const argv = Array.isArray(args) ? args : []
    if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
      return { executable: globalThis.process?.execPath || 'node', argv: [raw, ...argv] }
    }
    if (win && (lower.endsWith('.cmd') || lower.endsWith('.bat'))) {
      return { executable: globalThis.process?.env?.ComSpec || 'cmd.exe', argv: ['/d', '/s', '/c', `${quoteCmd(raw)}${argv.length > 0 ? ` ${argv.map(quoteCmd).join(' ')}` : ''}`] }
    }
    if (lower.endsWith('.ps1')) {
      if (!win) throw new Error(`.ps1 CLI 仅支持 Windows：${raw}`)
      return { executable: 'powershell.exe', argv: ['-NoProfile', '-NonInteractive', '-File', raw, ...argv] }
    }
    if (win && !/[\\/]/.test(raw) && extname(raw) === '') {
      const dirs = String(globalThis.process?.env?.PATH ?? '').split(';').filter(Boolean)
      for (const dir of dirs) {
        const exe = join(dir, `${raw}.exe`)
        try {
          if (existsSync(exe)) return { executable: exe, argv: [...argv] }
        } catch { /* 目录不可读：继续探测 */ }
      }
      for (const dir of dirs) {
        const shim = join(dir, `${raw}.cmd`)
        try {
          if (existsSync(shim)) return { executable: globalThis.process?.env?.ComSpec || 'cmd.exe', argv: ['/d', '/s', '/c', `${quoteCmd(shim)}${argv.length > 0 ? ` ${argv.map(quoteCmd).join(' ')}` : ''}`] }
        } catch { /* 继续探测 */ }
      }
    }
    return { executable: raw, argv: [...argv] }
  }

  /**
   * 杀死一个 cli 子进程：
   * - Windows：先直接 TerminateProcess（child.kill，直连 spawn 处处可用；
   *   受限环境下 taskkill 等控制台程序可能无法启动），再异步 taskkill /T
   *   清整棵进程树（正常环境下的兜底）；
   * - POSIX：杀进程组。
   */
  killCliProcess(child) {
    if (!child || !child.pid) return
    if (globalThis.process?.platform === 'win32') {
      try {
        child.kill('SIGKILL')
      } catch { /* 进程已退出 */ }
      try {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).once('error', () => undefined)
      } catch { /* taskkill 不可用：直接终止已足够 */ }
      return
    }
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      try {
        child.kill('SIGKILL')
      } catch { /* 进程已退出 */ }
    }
  }

  /** 杀死全部活动 cli 子进程（插件停止/卸载时由 index.js 调用）。 */
  killCliChildren() {
    for (const child of this.cliChildren) this.killCliProcess(child)
  }

  /**
   * 无头执行一次 CLI 进程（文件 FD 捕获，零管道）：stdin 文本写临时文件 →
   * spawn → 等待退出；超时/AbortSignal 时杀进程树并等其真正退出（最多 3s
   * 宽限，避免残留进程占用目录句柄）。返回 { code, out, err, timedOut,
   * aborted, error }；自身不抛错，临时文件在返回前清理。
   */
  async execCliCapture(invocation, options = {}) {
    const cwd = typeof options.cwd === 'string' && options.cwd ? options.cwd : join(tmpdir(), 'dsh-agent-router-cli-probe')
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : CLI_DEFAULT_TIMEOUT_MS
    const dir = join(cwd, '.router-files')
    const stamp = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
    const inFile = join(dir, `${CLI_TMP_PREFIX}${stamp}-in.txt`)
    const outFile = join(dir, `${CLI_TMP_PREFIX}${stamp}-out.log`)
    const errFile = join(dir, `${CLI_TMP_PREFIX}${stamp}-err.log`)
    let child
    try {
      try {
        mkdirSync(dir, { recursive: true })
      } catch (error) {
        return { code: null, out: '', err: '', timedOut: false, aborted: false, error: `无法创建工作区临时目录 ${dir}：${errorMessage(error)}` }
      }
      try {
        writeFileSync(inFile, typeof options.stdinText === 'string' ? options.stdinText : '', 'utf8')
      } catch (error) {
        return { code: null, out: '', err: '', timedOut: false, aborted: false, error: `无法写入 CLI 任务文件：${errorMessage(error)}` }
      }
      let inFd, outFd, errFd
      try {
        inFd = openSync(inFile, 'r')
        outFd = openSync(outFile, 'w')
        errFd = openSync(errFile, 'w')
      } catch (error) {
        return { code: null, out: '', err: '', timedOut: false, aborted: false, error: `无法打开 CLI 临时文件：${errorMessage(error)}` }
      }
      const win = globalThis.process?.platform === 'win32'
      // .cmd/.bat shim：argv 形如 ['/d','/s','/c', 命令行]——wrapCmdLine 只对
      // 这种形状生效（幂等），配合 windowsVerbatimArguments 原样传递引号。
      const spawnArgv = wrapCmdLine(invocation.argv)
      const isCmdShim = spawnArgv !== invocation.argv
      try {
        child = spawn(invocation.executable, spawnArgv, {
          cwd,
          stdio: [inFd, outFd, errFd],
          windowsHide: true,
          detached: !win,
          ...(isCmdShim ? { windowsVerbatimArguments: true } : {}),
        })
      } catch (error) {
        return { code: null, out: '', err: '', timedOut: false, aborted: false, error: errorMessage(error) }
      } finally {
        try { closeSync(inFd) } catch { /* 已关闭 */ }
        try { closeSync(outFd) } catch { /* 已关闭 */ }
        try { closeSync(errFd) } catch { /* 已关闭 */ }
      }
      this.cliChildren.add(child)
      let timedOut = false
      let aborted = false
      const onAbort = () => {
        aborted = true
        this.killCliProcess(child)
      }
      const signal = options.signal
      if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', onAbort, { once: true })
      const outcome = await new Promise((resolve) => {
        let settled = false
        const settle = (value) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(value)
        }
        const onError = (error) => settle({ code: null, error })
        const onExit = (code) => settle({ code, error: null })
        const timer = setTimeout(() => {
          // 超时：先杀进程树，再等其真正退出（最多 3s 宽限），避免
          // 残留进程继续占用工作目录（Windows 目录句柄）。
          timedOut = true
          child.removeListener('error', onError)
          child.removeListener('exit', onExit)
          this.killCliProcess(child)
          const grace = setTimeout(() => settle({ code: null, error: null }), 3000)
          child.once('exit', (code) => {
            clearTimeout(grace)
            settle({ code: code ?? null, error: null })
          })
        }, timeoutMs)
        child.once('error', onError)
        child.once('exit', onExit)
      })
      if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort)
      let out = ''
      try {
        out = readFileSync(outFile, 'utf8')
      } catch { /* 无输出文件：按空输出处理 */ }
      if (out.length > CLI_OUTPUT_MAX_BYTES) out = `${out.slice(0, CLI_OUTPUT_MAX_BYTES)}\n…（输出过长已截断）`
      let err = ''
      try {
        err = readFileSync(errFile, 'utf8').trim().slice(0, 400)
      } catch { /* 无 stderr 文件 */ }
      return {
        code: outcome.code,
        out,
        err,
        timedOut,
        aborted,
        error: outcome.error ? errorMessage(outcome.error) : '',
      }
    } finally {
      if (child) this.cliChildren.delete(child)
      for (const file of [inFile, outFile, errFile]) {
        try {
          rmSync(file, { force: true })
        } catch { /* 清理失败忽略 */ }
      }
    }
  }

  /**
   * cli 类型：宿主直接 spawn 无头 CLI 子代理（.cmd/.bat/.ps1 形态经 shell）。
   * - 任务文本写入工作区临时文件，经 stdin 文件 FD 注入（无需转义任务
   *   内容），stdout/stderr 以文件 FD 重定向（不经管道，兼容受限环境）；
   * - 附件图片与 files 文件一律以工作区路径注入任务（CLI 用自身工具读取）；
   * - AbortSignal / 超时 → 杀进程树；同 agent 并发受 maxConcurrent 限制。
   */
  async runCli(resolved, input) {
    const agent = resolved.agent
    const target = await this.resolveCliTarget(resolved.id)
    if (target.error) throw new Error(target.error)
    const entry = target.entry
    const spec = this.resolveCliSpec({ ...entry, model: typeof agent.model === 'string' && agent.model.trim() ? agent.model.trim() : '' })
    if (input.signal?.aborted) throw new Error(`cli 子代理已被中止：${spec.command}`)
    const cwd = input.exec?.agent?.session?.header?.cwd
    if (!cwd) throw new Error(`cli 子代理需要会话工作目录：${spec.command}`)
    const limit = Math.max(1, Math.min(4, Math.trunc(Number(entry.maxConcurrent)) || 1))
    const running = this.cliRunning.get(target.id) ?? 0
    if (running >= limit) throw new Error(`cli 子代理 "${target.id}" 正忙（并发上限 ${limit}）：请等待当前调用完成后再试`)
    this.cliRunning.set(target.id, running + 1)
    try {
      const dir = join(cwd, '.router-files')
      const stamp = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
      // ── 任务组装：task + 角色设定（systemPrompt）+ 会话上下文 ──
      const text = this.composeTask(input.task, input.extra)
      const system = typeof agent.systemPrompt === 'string' && agent.systemPrompt.trim() ? agent.systemPrompt.trim() : ''
      const caps = Array.isArray(agent.capabilities) ? agent.capabilities : []
      const contextLines = [
        cliWorkspaceHint(cwd, spec.sandbox),
        '重试纪律：同一操作或工具调用连续失败 2 次即停止重试，把最后一次失败的原因（保留错误原文关键行）写入结果并结束任务，不要反复重试或无限换方法试探。',
      ]
      if (caps.includes('image')) contextLines.push('本任务可能需要生成或处理图片：生成的图片文件请保存到工作目录内（或其 .router-files/ 子目录），并在结果中报告文件的完整路径。')
      const filesResolved = Array.isArray(input.filesResolved) ? input.filesResolved : []
      if (filesResolved.length > 0) contextLines.push(`待处理文件（主 agent 显式指定，请用你自身的工具读取，一次可处理多个不同类型）：\n${filesResolved.map((entry) => `- ${entry.displayPath}${entry.type === 'directory' ? '（目录）' : ''}${entry.kind === 'url' ? '（已由宿主下载）' : ''}`).join('\n')}`)
      const imagePaths = await this.materializeCliImages(Array.isArray(input.images) ? input.images : [], dir, stamp)
      if (imagePaths.length > 0) {
        contextLines.push(`本任务已附带 ${imagePaths.length} 张图片（已落盘为工作区文件，请用你的读图工具查看这些路径，不要假设图片内容）：\n${imagePaths.join('\n')}`)
        const conversation = this.recentConversationContext(input.exec?.agent)
        if (conversation) contextLines.push(`[主会话最近对话上下文]\n${conversation}\n\n请结合以上上下文理解用户需求，分析围绕用户的实际问题。`)
      }
      const baseText = system ? `[角色设定]\n${system}\n\n${text}` : text
      const cliTimeout = Number(entry.timeoutMs) > 0 ? Number(entry.timeoutMs) : CLI_DEFAULT_TIMEOUT_MS
      const capture = await this.execCliCapture(this.resolveCliInvocation(spec.command, spec.args), {
        cwd,
        stdinText: contextLines.length > 0 ? `${baseText}\n\n[会话上下文]\n${contextLines.join('\n')}` : baseText,
        timeoutMs: cliTimeout,
        signal: input.signal,
      })
      if (capture.error) throw new Error(`cli 子代理无法启动（${spec.command}）：${capture.error}`)
      if (capture.timedOut) throw new Error(`cli 子代理执行超时（${Math.round(cliTimeout / 1000)}s）：${spec.command}`)
      if (capture.aborted) throw new Error(`cli 子代理已被中止：${spec.command}`)
      if (capture.code !== 0) throw new Error(`cli 子代理失败（exit ${capture.code}）：${capture.err || capture.out.slice(0, 300) || '无输出'}`)
      const parsed = spec.parse && spec.format === 'json' ? spec.parse(capture.out) : { text: capture.out.trim() }
      const output = (typeof parsed.text === 'string' ? parsed.text : '').trim()
      if (!output) throw new Error(`cli 子代理无输出${capture.err ? `；stderr：${capture.err}` : ''}`)
      return { kind: 'cli', text: output, ...(parsed.usage ? { usage: parsed.usage } : {}) }
    } finally {
      this.cliRunning.set(target.id, Math.max(0, (this.cliRunning.get(target.id) ?? 1) - 1))
    }
  }

  /** cli 类型登录状态探测：无头执行 statusArgs（短超时，不动用会话工作区）。 */
  async cliStatus(request) {
    const target = await this.resolveCliTarget(request?.agentId)
    if (target.error) return { ok: false, message: target.error }
    const entry = target.entry
    const spec = this.resolveCliSpec(entry)
    const statusArgs = (typeof entry.statusArgs === 'string' && entry.statusArgs.trim())
      ? splitCliArgs(entry.statusArgs)
      : (CLI_PRESETS[spec.base]?.statusArgs ?? null)
    if (!statusArgs || statusArgs.length === 0) {
      return { ok: false, message: `无法检测 ${spec.command} 的登录状态：未配置状态命令（可在子代理卡片的高级设置中填写，或先完成 CLI 登录）` }
    }
    const capture = await this.execCliCapture(this.resolveCliInvocation(spec.command, statusArgs), {
      stdinText: '',
      timeoutMs: 15_000,
    })
    if (capture.error) return { ok: false, message: `无法运行 ${spec.command} 状态命令：${capture.error}` }
    if (capture.timedOut) return { ok: false, message: `${spec.command} 状态命令超时` }
    const detail = (capture.out + '\n' + capture.err).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('WARNING')).slice(0, 2).join(' · ')
    const claudeParsed = spec.base === 'claude' ? parseClaudeStatus(capture.out) : null
    if (claudeParsed) {
      const extra = claudeParsed.message || detail
      return { ok: true, loggedIn: claudeParsed.loggedIn, message: claudeParsed.loggedIn ? `已登录${extra ? `（${extra}）` : ''}` : (extra || '未登录') }
    }
    const loggedIn = capture.code === 0
    return { ok: true, loggedIn, message: loggedIn ? `已登录${detail ? `（${detail}）` : ''}` : (detail || '未登录') }
  }

  /** cli 类型交互式登录：宿主弹出可见终端窗口运行登录命令（立即返回）。 */
  async cliLogin(request) {
    const target = await this.resolveCliTarget(request?.agentId)
    if (target.error) return { ok: false, message: target.error }
    const entry = target.entry
    const spec = this.resolveCliSpec(entry)
    const loginArgs = (typeof entry.loginArgs === 'string' && entry.loginArgs.trim())
      ? splitCliArgs(entry.loginArgs)
      : (CLI_PRESETS[spec.base]?.loginArgs ?? [])
    const invocation = this.resolveCliInvocation(spec.command, loginArgs)
    const win = globalThis.process?.platform === 'win32'
    // 窗口标题用条目名（agent 名称在 legacy-agent 形态下已并入 entry.name）。
    const label = `${entry.name || spec.command}`
    // 确认进程真正创建（'spawn'/'error' + 5s 宽限），避免静默失败。
    const started = await new Promise((resolve) => {
      let child
      try {
        if (win) {
          const isCmdShim = invocation.argv.length === 4 && invocation.argv[0] === '/d' && invocation.argv[1] === '/s' && invocation.argv[2] === '/c' && typeof invocation.argv[3] === 'string' && invocation.argv[3].startsWith('"')
          const target = isCmdShim
            ? invocation.argv[3]
            : `${quoteCmd(invocation.executable)}${invocation.argv.length > 0 ? ` ${invocation.argv.map(quoteCmd).join(' ')}` : ''}`
          child = spawn(globalThis.process?.env?.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `start "dsh-agent-router: ${label}" ${target}`], { detached: true, stdio: 'ignore', windowsHide: false, windowsVerbatimArguments: true })
        } else {
          child = spawn(invocation.executable, invocation.argv, { detached: true, stdio: 'inherit' })
        }
      } catch (failure) {
        resolve({ ok: false, message: errorMessage(failure) })
        return
      }
      const timer = setTimeout(() => resolve({ ok: false, message: '启动登录窗口超时（5s 内进程未创建）' }), 5000)
      child.once('spawn', () => {
        clearTimeout(timer)
        resolve({ ok: true, message: '' })
      })
      child.once('error', (failure) => {
        clearTimeout(timer)
        resolve({ ok: false, message: errorMessage(failure) })
      })
    })
    if (!started.ok) return { ok: false, message: `无法启动登录：${started.message}（也可在终端手动运行 \`${spec.command.split(/\s+/)[0]} login\`）` }
    return { ok: true, message: `已在终端窗口启动 ${spec.command} 登录：请在弹出的窗口完成授权（浏览器/设备码），完成后点「刷新状态」` }
  }

  /** cli 类型模型列表：优先 CLI 列表命令；无命令时回退预设常见模型。 */
  async cliModels(request) {
    const target = await this.resolveCliTarget(request?.agentId)
    if (target.error) return { ok: false, message: target.error, models: [] }
    const entry = target.entry
    const spec = this.resolveCliSpec(entry)
    const preset = CLI_PRESETS[spec.base]
    const modelsArgs = (typeof entry.modelsArgs === 'string' && entry.modelsArgs.trim())
      ? splitCliArgs(entry.modelsArgs)
      : (preset?.modelsArgs ?? null)
    if (modelsArgs && modelsArgs.length > 0) {
      const capture = await this.execCliCapture(this.resolveCliInvocation(spec.command, modelsArgs), {
        stdinText: '',
        timeoutMs: 30_000,
      })
      if (capture.error) return { ok: false, message: `无法运行模型列表命令：${capture.error}`, models: [] }
      if (capture.timedOut) return { ok: false, message: '模型列表命令超时', models: [] }
      const models = parseCliModelsList(capture.out)
      if (models.length > 0) return { ok: true, message: `来自 ${spec.command} 的 ${models.length} 个模型`, models, source: 'cli' }
      return { ok: false, message: `模型列表命令没有输出${capture.err ? `；stderr：${capture.err}` : ''}`, models: [] }
    }
    if (preset?.knownModels && preset.knownModels.length > 0) {
      return { ok: true, message: `${spec.command} 不提供模型列表命令：展示常见模型（可手工填写任意模型 id）`, models: [...preset.knownModels], source: 'preset' }
    }
    return { ok: false, message: '该 CLI 无已知模型列表：请手工填写模型 id（空 = CLI 默认模型）', models: [] }
  }

  /** image 类型：OpenAI 兼容 Images API 生成，产物存回附件服务。 */
  async runImage(resolved, input) {
    const agent = resolved.agent
    const endpoint = (typeof agent.endpoint === 'string' && agent.endpoint.trim())
      ? agent.endpoint.trim()
      : 'https://api.openai.com/v1/images/generations'
    const apiKeyEnv = (typeof agent.apiKeyEnv === 'string' && agent.apiKeyEnv.trim())
      ? agent.apiKeyEnv.trim()
      : resolved.provider === 'openai' ? 'OPENAI_API_KEY' : ''
    let key
    const credentials = this.ctx.get('credentials')
    if (apiKeyEnv) {
      if (credentials) {
        const resolvedKey = await credentials.resolve(apiKeyEnv)
        if (!resolvedKey) throw new Error(`凭据 ${apiKeyEnv} 未配置；请在 设置 → Agent 路由 的账号区域完成登录`)
        key = resolvedKey.value
      } else {
        key = globalThis.process?.env?.[apiKeyEnv]
        if (!key) throw new Error(`凭据 ${apiKeyEnv} 未配置（环境变量中也未找到）`)
      }
    }
    const prompt = this.composeTask(input.task, input.extra)
    const body = {
      model: resolved.model,
      prompt,
      n: 1,
      size: (typeof agent.imageSize === 'string' && agent.imageSize) ? agent.imageSize : '1024x1024',
      response_format: 'b64_json',
    }
    let response
    try {
      response = await globalThis.fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify(body),
        ...(input.signal ? { signal: input.signal } : {}),
      })
    } catch (error) {
      throw new Error(`图片生成端点不可达（${endpoint}）：${errorMessage(error)}`)
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 400)
      throw new Error(`图片生成失败 HTTP ${response.status}${detail ? `：${detail}` : ''}`)
    }
    let payload
    try {
      payload = await response.json()
    } catch (error) {
      throw new Error(`图片生成端点返回非 JSON：${errorMessage(error)}`)
    }
    const b64 = payload?.data?.[0]?.b64_json
    if (typeof b64 !== 'string' || !b64) {
      throw new Error('端点未返回 b64_json 图片数据（如端点不支持 response_format，请在该 agent 高级设置中更换 endpoint）')
    }
    const data = decodeBase64(b64)
    const attachments = this.ctx.get('attachments')
    if (!attachments || typeof attachments.saveImage !== 'function') throw new Error('附件服务不可用，无法保存生成的图片')
    const saved = await attachments.saveImage({ data, mediaType: sniffMediaType(data), name: `router-${resolved.id}.png` })
    return { kind: 'image', text: `已生成图片（${saved.width}x${saved.height}）`, image: saved }
  }

  /**
   * speech 类型：OpenAI 兼容 Audio Transcriptions 端点（Whisper 系）。
   * 音频经 filePath 从工作区读取（route_agent 工具传入路径）。
   */
  async runSpeech(resolved, input) {
    const fs = this.ctx.get('fs')
    if (!fs || typeof fs.resolve !== 'function' || typeof fs.readBytes !== 'function') throw new Error('文件服务不可用，无法读取音频文件')
    const agent = resolved.agent
    const filePath = typeof input.filePath === 'string' ? input.filePath.trim() : ''
    if (!filePath) throw new Error('语音识别需要 filePath 参数：请给出会话工作区内音频文件的路径')
    const cwd = input.exec?.agent?.session?.header?.cwd
    let target
    try {
      target = await fs.resolve(filePath, { ...(cwd ? { cwd } : {}) })
    } catch (error) {
      throw new Error(`无法解析音频路径 "${filePath}"：${errorMessage(error)}`)
    }
    const maxBytes = 25 * 1024 * 1024
    let data
    try {
      data = await fs.readBytes(target, input.signal, maxBytes)
    } catch (error) {
      throw new Error(`无法读取音频文件 "${filePath}"：${errorMessage(error)}`)
    }
    const endpoint = (typeof agent.endpoint === 'string' && agent.endpoint.trim())
      ? agent.endpoint.trim()
      : 'https://api.openai.com/v1/audio/transcriptions'
    const apiKeyEnv = (typeof agent.apiKeyEnv === 'string' && agent.apiKeyEnv.trim())
      ? agent.apiKeyEnv.trim()
      : resolved.provider === 'openai' ? 'OPENAI_API_KEY' : ''
    let key
    const credentials = this.ctx.get('credentials')
    if (apiKeyEnv) {
      if (credentials) {
        const resolvedKey = await credentials.resolve(apiKeyEnv)
        if (!resolvedKey) throw new Error(`凭据 ${apiKeyEnv} 未配置；请在 设置 → Agent 路由 的账号区域完成登录`)
        key = resolvedKey.value
      } else {
        key = globalThis.process?.env?.[apiKeyEnv]
        if (!key) throw new Error(`凭据 ${apiKeyEnv} 未配置（环境变量中也未找到）`)
      }
    }
    const form = new FormData()
    form.append('file', new Blob([data], { type: 'application/octet-stream' }), 'audio.bin')
    form.append('model', resolved.model || 'whisper-1')
    let response
    try {
      response = await globalThis.fetch(endpoint, {
        method: 'POST',
        headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: form,
        ...(input.signal ? { signal: input.signal } : {}),
      })
    } catch (error) {
      throw new Error(`语音识别端点不可达（${endpoint}）：${errorMessage(error)}`)
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 400)
      throw new Error(`语音识别失败 HTTP ${response.status}${detail ? `：${detail}` : ''}`)
    }
    let payload
    try {
      payload = await response.json()
    } catch (error) {
      throw new Error(`语音识别端点返回非 JSON：${errorMessage(error)}`)
    }
    const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
    if (!text) throw new Error('语音识别返回中没有 text 字段')
    return { kind: 'speech', text }
  }

  /**
   * 最近一条含附件（image 块）的用户消息，返回其 image 块列表。
   * 只做定位，不隐式选取——附件由主 agent 经 `attachments` 序号
   * 或 `includeImages` 快捷方式显式派发。
   */
  recentAttachmentBlocks(agent) {
    const session = agent?.session
    if (!session || typeof session.deriveMessages !== 'function') return []
    let messages
    try {
      messages = session.deriveMessages()
    } catch {
      return []
    }
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index]
      if (message.role !== 'user') continue
      const blocks = (message.content ?? []).filter((block) => block && block.type === 'image')
      if (blocks.length > 0) return blocks
    }
    return []
  }

  /**
   * 按主 agent 显式给出的入参选取附件（按需派发，杜绝隐式 find 拿错）：
   * - `indices`：附件序号数组（0 起，按最近一条含附件的用户消息中出现
   *   的顺序编号），越界/非整数明确报错；
   * - `includeImages`：快捷方式，true = 转发该消息的全部图片附件；
   * - 两者都不给 = 不携带任何附件。
   */
  selectAttachments(agent, options = {}) {
    const blocks = this.recentAttachmentBlocks(agent)
    if (blocks.length === 0) return []
    const { indices, includeImages } = options
    if (Array.isArray(indices) && indices.length > 0) {
      const picked = []
      for (const raw of indices) {
        if (!Number.isInteger(raw)) throw new Error(`attachments 序号必须是整数（0 起）：收到 ${JSON.stringify(raw)}`)
        if (raw < 0 || raw >= blocks.length) throw new Error(`附件序号 ${raw} 不存在：最近一条含附件的用户消息共 ${blocks.length} 个附件（可用序号 0-${blocks.length - 1}）`)
        picked.push(blocks[raw].attachment)
      }
      if (includeImages) for (const block of blocks) picked.push(block.attachment)
      return [...new Set(picked)]
    }
    if (includeImages) return blocks.map((block) => block.attachment)
    return []
  }

  /**
   * 主会话最近对话的文本上下文（带图片的视觉调用自动附带，供视觉 agent
   * 结合上下文理解图片——截图的价值就在于它是上下文的一部分，孤立的
   * OCR 没有意义）：
   * - 只取文本块与工具结果文本，剔除图片块与 `[router:image:…]` 标记；
   * - 含标记的合成注入消息（对话框图片通路的引导消息）整条跳过；
   * - 最近在前，截取 maxMessages 条、总量 maxChars 字符。
   */
  recentConversationContext(agent, options = {}) {
    const session = agent?.session
    if (!session || typeof session.deriveMessages !== 'function') return ''
    let messages
    try {
      messages = session.deriveMessages()
    } catch {
      return ''
    }
    const maxMessages = Number.isInteger(options.maxMessages) && options.maxMessages > 0 ? options.maxMessages : 8
    const maxChars = Number.isInteger(options.maxChars) && options.maxChars > 0 ? options.maxChars : 20000
    const MARKER_RE = /\[router:image:[^\]\n]+\]/g
    const parts = []
    let chars = 0
    for (let index = messages.length - 1; index >= 0 && parts.length < maxMessages; index--) {
      const message = messages[index]
      const blocks = []
      let hasMarker = false
      for (const block of message?.content ?? []) {
        if (!block) continue
        if (block.type === 'text' && typeof block.text === 'string') {
          if (/\[router:image:[^\]\n]+\]/.test(block.text)) hasMarker = true
          const cleaned = block.text.replace(MARKER_RE, '').trim()
          if (cleaned) blocks.push(cleaned)
          continue
        }
        if (block.type === 'tool-result' && Array.isArray(block.content)) {
          for (const inner of block.content) {
            if (!inner) continue
            if (inner.type === 'text' && typeof inner.text === 'string') {
              if (/\[router:image:[^\]\n]+\]/.test(inner.text)) hasMarker = true
              const cleaned = inner.text.replace(MARKER_RE, '').trim()
              if (cleaned) blocks.push(cleaned)
            }
          }
        }
      }
      if (hasMarker) continue
      if (blocks.length === 0) continue
      const role = message.role === 'assistant' ? 'assistant' : 'user'
      const text = blocks.join('\n')
      const capped = chars + text.length > maxChars
        ? `${text.slice(0, Math.max(0, maxChars - chars))}\n…（上下文过长已截断）`
        : text
      chars += capped.length
      parts.unshift(`[${role}]\n${capped}`)
      if (chars >= maxChars) break
    }
    return parts.join('\n\n')
  }

  // ── 多模态展示辅助（vision 先锋）──────────────────────────────────────
  //
  // 发送与准入已由准入包装（lib/wrapper.js 的 twin 路由）接管：图片块留在
  // 会话日志（Web UI 原生显示），模型输入层改写为工具标记。本区保留两件
  // 展示辅助：
  // - 生成图片（draw 等）以纯文本标记渲染进工具结果（绝不把图片块写入
  //   历史，避免文本模型被击穿），浏览器侧 toolview 解析标记后经
  //   router/imageData 取字节渲染缩略图；
  // - listImageVisionAgents：视觉类 agent 目录（准入包装的门控与默认
  //   视觉 agent 选择共用）。

  /** 图片标记前缀（会话文本与工具结果中的纯文本引用）。 */
  static IMAGE_MARKER_PREFIX = '[router:image:'

  /** 标记内 ref 名称的净化：去掉控制字符与方括号（保证标记可按 ] 定界解析）。 */
  static sanitizeImageRefName(name) {
    return String(name ?? '').replace(/[\u0000-\u001f\u007f[\]]/g, '').trim().slice(0, 120)
  }

  /** 把一个完整附件引用序列化为纯文本图片标记。 */
  imageMarkerOf(ref) {
    const safe = { ...ref }
    if (typeof safe.name === 'string') safe.name = RouterService.sanitizeImageRefName(safe.name)
    return `${RouterService.IMAGE_MARKER_PREFIX}${JSON.stringify(safe)}]`
  }

  /** 从文本中提取全部图片标记的引用（容忍损坏负载：解析失败跳过）。 */
  parseImageMarkers(text) {
    const out = []
    if (typeof text !== 'string') return out
    const re = /\[router:image:([^\]\n]+)\]/g
    let match
    while ((match = re.exec(text)) !== null) {
      try {
        const ref = JSON.parse(match[1])
        if (ref && typeof ref === 'object' && typeof ref.attachmentId === 'string' && ref.attachmentId) out.push(ref)
      } catch { /* 非 JSON 负载：忽略 */ }
    }
    return out
  }

  /** 可接收图片的视觉类 agent（capabilities 含 image 且非 image 生成类型），按 id 排序。 */
  listImageVisionAgents() {
    const out = []
    for (const [id, agent] of this.listEnabledAgents()) {
      if (this.normalizeType(agent.type) === 'image') continue
      const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : []
      if (!capabilities.includes('image')) continue
      out.push([id, agent])
    }
    out.sort((a, b) => (a[0] < b[0] ? -1 : 1))
    return out
  }

  /**
   * router/imageData：按完整附件引用读取图片字节（base64）。引用由标记
   * 或工具结果携带；attachmentId 内容寻址且 readImage 校验完整元数据，
   * 不构成未授权读取面。只读，不触碰任何状态。
   */
  async imageData(request) {
    const ref = request?.ref
    if (!ref || typeof ref !== 'object' || typeof ref.attachmentId !== 'string' || !ref.attachmentId) {
      return { ok: false, message: '缺少附件引用' }
    }
    const attachments = this.ctx.get('attachments')
    if (!attachments || typeof attachments.readImage !== 'function') return { ok: false, message: '附件服务不可用' }
    let stored
    try {
      stored = await attachments.readImage(ref)
    } catch (error) {
      return { ok: false, message: `图片读取失败：${errorMessage(error)}` }
    }
    let binary = ''
    const chunk = 32768
    for (let offset = 0; offset < stored.data.length; offset += chunk) binary += String.fromCharCode(...stored.data.subarray(offset, offset + chunk))
    const mediaType = typeof stored.ref?.mediaType === 'string' ? stored.ref.mediaType : ''
    return {
      ok: true,
      message: 'ok',
      ...(mediaType ? { mediaType } : {}),
      data: globalThis.btoa(binary),
      ...(typeof stored.ref?.width === 'number' ? { width: stored.ref.width } : {}),
      ...(typeof stored.ref?.height === 'number' ? { height: stored.ref.height } : {}),
      ...(typeof stored.ref?.name === 'string' && stored.ref.name ? { name: stored.ref.name } : {}),
    }
  }

  // ── OAuth 账号（插件独立管理，直连通路）──────────────────────────────────

  /** 解析 OAuth 账号的 access token（credentials seam → 环境变量后备）。 */
  async resolveOauthToken(account) {
    const ref = typeof account.tokenRef === 'string' && account.tokenRef.trim() ? account.tokenRef.trim() : ''
    if (!ref) throw new Error('该 OAuth 账号未配置凭据引用（tokenRef）；请重新登录')
    const credentials = this.ctx.get('credentials')
    if (credentials) {
      const resolved = await credentials.resolve(ref)
      if (resolved) return resolved.value
    }
    const env = globalThis.process?.env?.[ref]
    if (env) return env
    throw new Error(`OAuth access token（${ref}）未配置；请在账号卡片中完成登录`)
  }

  /** 把附件引用读取为 base64 data URL（OAuth 直连多模态输入）。 */
  async readImagesAsDataUrls(refs) {
    const attachments = this.ctx.get('attachments')
    if (!attachments || typeof attachments.readImage !== 'function') return []
    const out = []
    for (const ref of refs ?? []) {
      try {
        const stored = await attachments.readImage(ref)
        let binary = ''
        for (let index = 0; index < stored.data.length; index++) binary += String.fromCharCode(stored.data[index])
        out.push({ mediaType: stored.ref.mediaType ?? 'image/png', dataUrl: `data:${stored.ref.mediaType ?? 'image/png'};base64,${globalThis.btoa(binary)}` })
      } catch {
        // 单个图片读取失败跳过；失败由端点或文本部分兜底。
      }
    }
    return out
  }

  /**
   * OAuth 账号的 chat 直连调用（不经 llm 注册表，绝不出现在共享模型列表）。
   * 协议：openai-completions / anthropic / gemini。
   */
  async runOauthChat(resolved, input) {
    const account = resolved.account
    const token = await this.resolveOauthToken(account)
    const protocol = ['openai-completions', 'anthropic', 'gemini'].includes(account.protocol) ? account.protocol : 'openai-completions'
    const baseURL = (typeof account.baseURL === 'string' && account.baseURL.trim()) ? account.baseURL.trim().replace(/\/+$/, '') : ''
    if (!baseURL) throw new Error(`OAuth 账号 "${resolved.accountId}" 未配置 Base URL`)
    const agent = resolved.agent
    const chatFiles = input.chatFiles
    const imageRefs = [
      ...(Array.isArray(input.images) ? input.images : []),
      ...(Array.isArray(chatFiles?.images) ? chatFiles.images : []),
    ]
    const contextText = imageRefs.length > 0 ? this.recentConversationContext(input.exec?.agent) : ''
    const text = this.composeTask(input.task, input.extra)
      + this.composeChatFileText(chatFiles)
      + (contextText ? `\n\n[会话上下文（主会话最近对话）]\n${contextText}\n\n请结合以上上下文理解用户需求：分析围绕用户的实际问题，引用上下文中的具体信息。` : '')
    const system = typeof agent.systemPrompt === 'string' && agent.systemPrompt.trim()
      ? agent.systemPrompt.trim()
      : `你是 "${agent.name || resolved.id}" 专业 agent，通过多模型路由被调用。请直接完成任务，只输出最终结果，不要寒暄。`
    const maxTokens = Number(agent.maxTokens) > 0 ? Number(agent.maxTokens) : undefined
    const temperature = Number(agent.temperature) > 0 ? Number(agent.temperature) : undefined
    const images = await this.readImagesAsDataUrls(imageRefs)
    const usageFrom = (payload) => {
      if (!payload) return undefined
      if (payload.usage) return { inputTokens: payload.usage.prompt_tokens ?? payload.usage.input_tokens ?? 0, outputTokens: payload.usage.completion_tokens ?? payload.usage.output_tokens ?? 0 }
      if (payload.usageMetadata) return { inputTokens: payload.usageMetadata.promptTokenCount ?? 0, outputTokens: payload.usageMetadata.candidatesTokenCount ?? 0 }
      return undefined
    }
    const textFrom = (payload) => {
      if (!payload) return ''
      if (Array.isArray(payload.choices) && payload.choices[0]?.message?.content) {
        const content = payload.choices[0].message.content
        if (typeof content === 'string') return content.trim()
        if (Array.isArray(content)) return content.filter((part) => part.type === 'text').map((part) => part.text).join('\n').trim()
      }
      if (Array.isArray(payload.content)) {
        return payload.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n').trim()
      }
      if (Array.isArray(payload.candidates) && payload.candidates[0]?.content?.parts) {
        return payload.candidates[0].content.parts.filter((part) => typeof part.text === 'string').map((part) => part.text).join('\n').trim()
      }
      return ''
    }
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    let url
    let body
    if (protocol === 'anthropic') {
      url = `${baseURL}/messages`
      headers['anthropic-version'] = '2023-06-01'
      body = {
        model: resolved.model,
        max_tokens: maxTokens ?? 4096,
        ...(temperature !== undefined ? { temperature } : {}),
        ...(system ? { system } : {}),
        messages: [{
          role: 'user',
          content: images.length > 0
            ? [{ type: 'image', source: { type: 'base64', media_type: images[0].mediaType, data: images[0].dataUrl.split(',')[1] } }, { type: 'text', text }]
            : text,
        }],
      }
    } else if (protocol === 'gemini') {
      url = `${baseURL}/models/${encodeURIComponent(resolved.model)}:generateContent`
      body = {
        contents: [{
          role: 'user',
          parts: [
            ...images.map((image) => ({ inline_data: { mime_type: image.mediaType, data: image.dataUrl.split(',')[1] } })),
            { text },
          ],
        }],
        ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
        ...(maxTokens !== undefined ? { generationConfig: { maxOutputTokens: maxTokens, ...(temperature !== undefined ? { temperature } : {}) } } : {}),
      }
    } else {
      url = `${baseURL}/chat/completions`
      const userContent = images.length > 0
        ? [{ type: 'text', text }, ...images.map((image) => ({ type: 'image_url', image_url: { url: image.dataUrl } }))]
        : text
      const messages = system ? [{ role: 'system', content: system }] : []
      messages.push({ role: 'user', content: userContent })
      body = {
        model: resolved.model,
        messages,
        ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
      }
    }
    let response
    try {
      response = await globalThis.fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        ...(input.signal ? { signal: input.signal } : {}),
      })
    } catch (error) {
      throw new Error(`OAuth 账号 "${resolved.accountId}" 端点不可达（${url}）：${errorMessage(error)}`)
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 400)
      if (response.status === 401 || response.status === 403) {
        throw new Error(`OAuth access token 无效或已过期（HTTP ${response.status}）${detail ? `：${detail}` : ''}；请在账号卡片中重新登录`)
      }
      throw new Error(`OAuth 调用失败 HTTP ${response.status}${detail ? `：${detail}` : ''}`)
    }
    let payload
    try {
      payload = await response.json()
    } catch (error) {
      throw new Error(`OAuth 端点返回非 JSON：${errorMessage(error)}`)
    }
    const output = textFrom(payload)
    if (!output) throw new Error('OAuth 调用返回中没有文本内容')
    return { kind: 'chat', text: output, ...(imageRefs.length > 0 ? { images: imageRefs } : {}), usage: usageFrom(payload) }
  }

  // ── 统计 ──────────────────────────────────────────────────────────────────

  resetStats() {
    this.totals = new Map()
    this.recent = []
    this.series = new Map()
    this.accountTotals = new Map()
    this.accountSeries = new Map()
  }

  /**
   * 记录一次调用结果。record：
   * { agentId, provider, model, ok, ms, inputTokens?, outputTokens?, error? }
   * 同时按 agent 与按账号（服务商，含模型细分）两级聚合。
   */
  record(record) {
    const at = Date.now()
    const inputTokens = Number(record.inputTokens) || 0
    const outputTokens = Number(record.outputTokens) || 0
    const ms = Number(record.ms) || 0
    const provider = record.provider ?? '?'
    const model = record.model ?? '?'

    const total = this.totals.get(record.agentId) ?? {
      agentId: record.agentId,
      name: '',
      provider,
      model,
      calls: 0,
      errors: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalMs: 0,
      lastAt: 0,
    }
    total.name = this.getAgent(record.agentId)?.name || record.agentId
    total.provider = provider
    total.model = model
    total.calls += 1
    if (!record.ok) total.errors += 1
    total.inputTokens += inputTokens
    total.outputTokens += outputTokens
    total.totalMs += ms
    total.lastAt = at
    this.totals.set(record.agentId, total)

    // 账号（服务商）级聚合，含模型细分。
    const account = this.accountTotals.get(provider) ?? {
      provider,
      calls: 0,
      errors: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalMs: 0,
      lastAt: 0,
      models: new Map(),
    }
    account.calls += 1
    if (!record.ok) account.errors += 1
    account.inputTokens += inputTokens
    account.outputTokens += outputTokens
    account.totalMs += ms
    account.lastAt = at
    const modelTotal = account.models.get(model) ?? { model, calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalMs: 0, lastAt: 0 }
    modelTotal.calls += 1
    if (!record.ok) modelTotal.errors += 1
    modelTotal.inputTokens += inputTokens
    modelTotal.outputTokens += outputTokens
    modelTotal.totalMs += ms
    modelTotal.lastAt = at
    account.models.set(model, modelTotal)
    this.accountTotals.set(provider, account)

    const bucketMap = this.series.get(record.agentId) ?? new Map()
    const key = minuteKey(at)
    const bucket = bucketMap.get(key) ?? { minute: key, calls: 0, errors: 0, inputTokens: 0, outputTokens: 0 }
    bucket.calls += 1
    if (!record.ok) bucket.errors += 1
    bucket.inputTokens += inputTokens
    bucket.outputTokens += outputTokens
    bucketMap.set(key, bucket)
    this.series.set(record.agentId, bucketMap)

    const accountBucketMap = this.accountSeries.get(provider) ?? new Map()
    const accountBucket = accountBucketMap.get(key) ?? { minute: key, calls: 0, errors: 0, inputTokens: 0, outputTokens: 0 }
    accountBucket.calls += 1
    if (!record.ok) accountBucket.errors += 1
    accountBucket.inputTokens += inputTokens
    accountBucket.outputTokens += outputTokens
    accountBucketMap.set(key, accountBucket)
    this.accountSeries.set(provider, accountBucketMap)

    this.recent.unshift({
      at,
      agentId: record.agentId,
      provider,
      model,
      ok: record.ok !== false,
      ms,
      ...(inputTokens > 0 ? { inputTokens } : {}),
      ...(outputTokens > 0 ? { outputTokens } : {}),
      ...(record.error ? { error: String(record.error).slice(0, 300) } : {}),
    })
    if (this.recent.length > RECENT_CAP) this.recent.length = RECENT_CAP
  }

  /** 统计快照（RPC stats 使用）。 */
  statsSnapshot() {
    const cutoff = new Date(Date.now() - SERIES_WINDOW_MINUTES * 60 * 1000).toISOString().slice(0, 16)
    const totals = [...this.totals.values()].map((total) => ({
      agentId: total.agentId,
      name: total.name,
      provider: total.provider,
      model: total.model,
      calls: total.calls,
      errors: total.errors,
      inputTokens: total.inputTokens,
      outputTokens: total.outputTokens,
      totalMs: total.totalMs,
      lastAt: total.lastAt || undefined,
    }))
    const series = []
    for (const [agentId, buckets] of this.series) {
      const kept = [...buckets.values()].filter((bucket) => bucket.minute >= cutoff).sort((a, b) => (a.minute < b.minute ? -1 : 1))
      for (const bucket of [...buckets.values()]) if (bucket.minute < cutoff) buckets.delete(bucket.minute)
      if (kept.length > 0) series.push({ agentId, buckets: kept })
    }
    const accountTotals = [...this.accountTotals.values()].map((account) => ({
      provider: account.provider,
      calls: account.calls,
      errors: account.errors,
      inputTokens: account.inputTokens,
      outputTokens: account.outputTokens,
      totalMs: account.totalMs,
      lastAt: account.lastAt || undefined,
      models: [...account.models.values()].map((modelTotal) => ({
        model: modelTotal.model,
        calls: modelTotal.calls,
        errors: modelTotal.errors,
        inputTokens: modelTotal.inputTokens,
        outputTokens: modelTotal.outputTokens,
        totalMs: modelTotal.totalMs,
        lastAt: modelTotal.lastAt || undefined,
      })),
    })).sort((a, b) => (a.provider < b.provider ? -1 : 1))
    const accountSeries = []
    for (const [provider, buckets] of this.accountSeries) {
      const kept = [...buckets.values()].filter((bucket) => bucket.minute >= cutoff).sort((a, b) => (a.minute < b.minute ? -1 : 1))
      for (const bucket of [...buckets.values()]) if (bucket.minute < cutoff) buckets.delete(bucket.minute)
      if (kept.length > 0) accountSeries.push({ provider, buckets: kept })
    }
    return {
      ok: true,
      enabled: this.isEnabled(),
      totals,
      recent: [...this.recent],
      series,
      accountTotals,
      accountSeries,
    }
  }

  /** 面向主模型的目录文本（tool 行的提示段使用）。 */
  promptText() {
    const state = this.getState()
    if (state.enabled === false) return ''
    const entries = this.listEnabledAgents()
    if (entries.length === 0) return ''
    const lines = entries.map(([id, agent]) => {
      const provider = typeof agent.provider === 'string' && agent.provider.trim()
      const model = typeof agent.model === 'string' && agent.model.trim()
      const accountId = typeof agent.account === 'string' ? agent.account.trim() : ''
      const poolRef = accountId.startsWith('pool:') ? accountId.slice(5) : ''
      const pool = poolRef ? this.getPool(poolRef) : undefined
      const account = accountId && !poolRef ? this.getOAuthAccount(accountId) : undefined
      const type = this.normalizeType(agent.type)
      const cliRef = typeof agent.cliAgent === 'string' && agent.cliAgent.trim() ? agent.cliAgent.trim() : ''
      const cliEntry = cliRef ? this.getCliEntry(cliRef) : undefined
      const cliCommand = typeof agent.command === 'string' && agent.command.trim() ? agent.command.trim().split(/\s+/)[0] : ''
      const meta = type === 'cli'
        ? `子代理:${cliEntry ? (cliEntry.name || cliRef) : (cliCommand || '?')}${model ? `/${model}` : ''}`
        : poolRef
          ? `OAuth 账号池:${pool ? pool.name || poolRef : poolRef}（${(Array.isArray(pool?.accounts) ? pool.accounts : []).length} 个账号）${model ? `/${model}` : ''}`
          : accountId
            ? `OAuth 账号:${account ? account.name || accountId : accountId}${model ? `/${model}` : ''}`
            : provider && model ? `${provider}/${model}` : provider ? `${provider}/*` : '跟随主模型'
      const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities.filter((item) => typeof item === 'string') : []
      const capsText = capabilities.length > 0 ? `，能力:${capabilities.join('/')}` : ''
      const description = typeof agent.description === 'string' && agent.description.trim() ? agent.description.trim() : '未填写说明'
      return `- \`${id}\`（${agent.name || id}，${type}${capsText}）：${description} [${meta}]`
    })
    return [
      '## 多模型路由（Multi-model routing）',
      '',
      `你可以通过 \`route_agent\` 工具把任务交给下列专业 agent，每个 agent 可配置独立的服务商与模型：`,
      '',
      ...lines,
      '',
      '使用规则：',
      '- 仅在任务匹配该 agent 的能力（或能力标签）时调用；普通文本任务不要路由。',
      '- 带图片的任务（识别、OCR、截图/图表解读等）应路由给带 `image` 能力的 agent；语音文件转写路由给带 `audio` 能力的 agent。',
      '- `task` 必须自包含：专业 agent 看不到本会话的完整上下文（chat/image 类型），把需要的全部信息写进去。',
      '- 附件按需显式派发：`attachments` 传附件序号（0 起，按最近一条含附件的用户消息中的出现顺序）；`includeImages: true` 表示把该消息的全部图片一并转发；两者都不给 = 不携带任何附件。',
      '- 用户消息中带 `[用户附带图片]` 工作区路径清单（用户从对话框上传、由插件落盘的图片）时：调用 route_agent，把路径放进 `files` 参数，agent 填带 `image` 能力的视觉 agent（当前会话的最近上下文会随调用自动附带）。',
      '- agent 类型专业 agent 可读写工作区任意文件：在 `task` 里写明文件路径（相对/绝对均可），产物写入工作区并在结果中报告路径。',
      '- `files`：工作区文件路径或 http(s) URL 列表（一次可传多个不同类型）。chat 类型按内容能力化分发：图片文件内联注入（要求该 agent 声明 image 能力）、文本文件内联进 task、其余二进制需 agent 类型；agent 类型把路径注入子代理由其用 fs 工具自行读取；URL 由宿主下载到工作区 .router-files/ 后按同样规则分发。',
      '- 未配置模型的 agent 自动复用主 agent 当前模型。',
      '- 调用后把返回结果原样呈现给用户，不要自行重复分析或改写结论。',
    ].join('\n')
  }

  // ── RPC 方法（typert gateway 直达）──────────────────────────────────────

  /** router/catalog：启用的 agent 目录 + 有效模型解析 + 主模型默认值。 */
  async catalog() {
    const defaults = this.defaults()
    const agents = []
    await Promise.all(this.listEnabledAgents().map(async ([id, agent]) => {
      const resolved = await this.resolveAgent(id)
      agents.push({
        id,
        name: agent.name || id,
        type: this.normalizeType(agent.type),
        enabled: agent.enabled !== false,
        description: typeof agent.description === 'string' ? agent.description : '',
        capabilities: Array.isArray(agent.capabilities) ? agent.capabilities.filter((item) => typeof item === 'string') : [],
        provider: typeof agent.provider === 'string' ? agent.provider : '',
        model: typeof agent.model === 'string' ? agent.model : '',
        account: typeof agent.account === 'string' ? agent.account : '',
        cliAgent: typeof agent.cliAgent === 'string' ? agent.cliAgent : '',
        effectiveProvider: resolved.provider,
        effectiveModel: resolved.model,
        source: resolved.source,
        ...(resolved.error ? { error: resolved.error } : {}),
      })
    }))
    agents.sort((a, b) => (a.id < b.id ? -1 : 1))
    return {
      ok: true,
      enabled: this.isEnabled(),
      defaults: { provider: defaults.provider, model: defaults.model, ...(defaults.reasoningEffort ? { reasoningEffort: defaults.reasoningEffort } : {}) },
      agents,
      oauthAccounts: Object.entries(this.getState().oauthAccounts ?? {}).map(([id, account]) => ({
        id,
        name: account.name || id,
        enabled: account.enabled !== false,
        protocol: typeof account.protocol === 'string' ? account.protocol : 'openai-completions',
        baseURL: typeof account.baseURL === 'string' ? account.baseURL : '',
        tokenRef: typeof account.tokenRef === 'string' ? account.tokenRef : '',
        clientId: typeof account.clientId === 'string' ? account.clientId : '',
        authUrl: typeof account.authUrl === 'string' ? account.authUrl : '',
        tokenUrl: typeof account.tokenUrl === 'string' ? account.tokenUrl : '',
        scope: typeof account.scope === 'string' ? account.scope : '',
        models: Array.isArray(account.models) ? account.models.filter((item) => typeof item === 'string') : [],
        publicClient: account.publicClient === true,
      })).sort((a, b) => (a.id < b.id ? -1 : 1)),
      pools: Object.entries(this.getState().pools ?? {}).map(([id, pool]) => ({
        id,
        name: pool.name || id,
        enabled: pool.enabled !== false,
        strategy: typeof pool.strategy === 'string' ? pool.strategy : 'healthy',
        accounts: Array.isArray(pool.accounts) ? pool.accounts.filter((item) => typeof item === 'string') : [],
        accountHealth: (Array.isArray(pool.accounts) ? pool.accounts : [])
          .map((accountRef) => {
            const health = this.accountHealth(String(accountRef))
            return {
              accountId: String(accountRef),
              calls: health.calls,
              errors: health.errors,
              ...(health.lastAt > 0 ? { lastAt: health.lastAt } : {}),
            }
          }),
      })).sort((a, b) => (a.id < b.id ? -1 : 1)),
      cliAgents: Object.entries(this.getState().cliAgents ?? {}).map(([id, entry]) => ({
        id,
        name: entry.name || id,
        enabled: entry.enabled !== false,
        command: typeof entry.command === 'string' ? entry.command : '',
        args: typeof entry.args === 'string' ? entry.args : '',
        timeoutMs: Number(entry.timeoutMs) || 0,
        maxConcurrent: Math.max(1, Math.min(4, Math.trunc(Number(entry.maxConcurrent)) || 1)),
      })).sort((a, b) => (a.id < b.id ? -1 : 1)),
    }
  }

  /** router/stats：实时用量快照。 */
  stats() {
    return this.statsSnapshot()
  }

  /** router/config：当前配置描述（settings seam 进程内读取，绕过 wire 白名单）。 */
  async config() {
    const settings = this.ctx.get('settings')
    if (!settings || typeof settings.describe !== 'function') throw new Error('settings 服务不可用')
    const descriptor = settings.describe({ redactSecrets: true }).find((entry) => String(entry.ns) === ROUTER_NS)
    if (!descriptor) throw new Error(`settings namespace "${ROUTER_NS}" 未注册：宿主行 dsh-agent-router 未正常挂载`)
    return {
      ok: true,
      enabled: this.isEnabled(),
      revision: descriptor.revision,
      writable: settings.writable === true,
      value: descriptor.value && typeof descriptor.value === 'object' ? descriptor.value : {},
      ...(descriptor.user !== undefined ? { user: descriptor.user } : {}),
    }
  }

  /** router/save：path-op 写入（与 settings.mutate 同语义，冲突时抛错）。 */
  async save(request) {
    const settings = this.ctx.get('settings')
    if (!settings || typeof settings.mutate !== 'function') throw new Error('settings 服务不可用')
    const ops = Array.isArray(request?.ops) ? request.ops : []
    if (ops.length === 0) throw new Error('save 请求缺少 ops')
    await settings.mutate(ROUTER_NS, ops, request?.expectedRevision)
    const descriptor = settings.describe({ redactSecrets: true }).find((entry) => String(entry.ns) === ROUTER_NS)
    return {
      ok: true,
      revision: descriptor ? descriptor.revision : 0,
      ...(descriptor && descriptor.user !== undefined ? { user: descriptor.user } : {}),
    }
  }

  /** 清理过期的一键授权会话（TTL 10 分钟）。 */
  pruneOauthPending() {
    const now = Date.now()
    for (const [state, pending] of this.oauthPending) {
      if (pending.expiresAt < now) this.oauthPending.delete(state)
    }
  }

  /**
   * router/oauthBegin：一键授权起点。宿主生成 PKCE + state 并登记会话，
   * 返回可直接打开的官方授权 URL。redirectUri 由浏览器按其实际 origin
   * 传入（默认为 `<origin>/router-oauth/callback`）；`publicClient` 账号
   * 改用内置公开 Client 与固定回调 http://localhost:8085/（零配置）。
   */
  async oauthBegin(request) {
    const id = String(request?.accountId ?? '')
    const account = this.getOAuthAccount(id)
    if (!account) return { ok: false, message: `OAuth 账号 "${id}" 不存在` }
    const authUrl = (typeof account.authUrl === 'string' && account.authUrl.trim()) ? account.authUrl.trim() : ''
    if (!authUrl) return { ok: false, message: '该账号未配置官方授权端点（authUrl）；可改用「粘贴 access token」方式登录' }
    const builtin = account.publicClient === true
    if (builtin && !this.oauthLoopbackReady) {
      return { ok: false, message: '内置公开 Client 的回调端口 8085 未就绪（可能被 gcloud CLI 等占用）；请关闭占用程序后重启 DSH，或改用自建 OAuth Client' }
    }
    const clientId = builtin ? PUBLIC_OAUTH_CLIENT.clientId : ((typeof account.clientId === 'string' && account.clientId.trim()) ? account.clientId.trim() : '')
    if (!clientId) return { ok: false, message: '该账号未配置 Client ID' }
    const redirectUri = builtin ? PUBLIC_OAUTH_CLIENT.redirectUri : String(request?.redirectUri ?? '').trim()
    if (!redirectUri) return { ok: false, message: '缺少 redirectUri（浏览器侧按当前 origin 传入）' }
    this.pruneOauthPending()
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const state = `router-${randomBytes(12).toString('hex')}`
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    })
    const scope = migrateGeminiScope((typeof account.scope === 'string' && account.scope.trim()) ? account.scope.trim() : '', builtin)
    if (scope) params.set('scope', scope)
    this.oauthPending.set(state, { accountId: id, verifier, redirectUri, expiresAt: Date.now() + 10 * 60 * 1000 })
    return {
      ok: true,
      message: '授权 URL 已生成',
      authUrl: `${authUrl}${authUrl.includes('?') ? '&' : '?'}${params.toString()}`,
      state,
    }
  }

  /**
   * router/oauthTokenExchange：官方 OAuth2 授权码 + PKCE 的 code → token 交换。
   * 一键模式：传 `state`，宿主按登记会话取回 accountId/verifier/redirectUri；
   * 手动模式（兼容旧流程）：传 `accountId` + `codeVerifier` + `redirectUri`。
   */
  async oauthTokenExchange(request) {
    const code = String(request?.code ?? '')
    if (!code) return { ok: false, message: '缺少 code' }
    const state = String(request?.state ?? '')
    let id
    let verifier
    let redirectUri
    if (state) {
      const pending = this.oauthPending.get(state)
      if (!pending || pending.expiresAt < Date.now()) {
        this.oauthPending.delete(state)
        return { ok: false, message: '授权会话不存在或已过期，请回到设置页重新发起一键授权' }
      }
      id = pending.accountId
      verifier = pending.verifier
      redirectUri = pending.redirectUri
    } else {
      id = String(request?.accountId ?? '')
      verifier = String(request?.codeVerifier ?? '')
      redirectUri = String(request?.redirectUri ?? '')
    }
    const account = this.getOAuthAccount(id)
    if (!account) return { ok: false, message: `OAuth 账号 "${id}" 不存在` }
    const tokenUrl = (typeof account.tokenUrl === 'string' && account.tokenUrl.trim()) ? account.tokenUrl.trim() : ''
    if (!tokenUrl) return { ok: false, message: '该账号未配置官方 token 端点（tokenUrl）；可改用「粘贴 access token」方式登录' }
    const params = new URLSearchParams()
    params.set('grant_type', 'authorization_code')
    params.set('code', code)
    params.set('redirect_uri', redirectUri)
    if (verifier) params.set('code_verifier', verifier)
    const builtin = account.publicClient === true
    const clientId = builtin ? PUBLIC_OAUTH_CLIENT.clientId : ((typeof account.clientId === 'string' && account.clientId.trim()) ? account.clientId.trim() : '')
    if (clientId) params.set('client_id', clientId)
    const clientSecret = builtin ? PUBLIC_OAUTH_CLIENT.clientSecret : ((typeof account.clientSecret === 'string' && account.clientSecret.trim()) ? account.clientSecret.trim() : '')
    if (clientSecret) params.set('client_secret', clientSecret)
    const finish = (result) => {
      if (state) this.oauthPending.delete(state)
      return result
    }
    let response
    try {
      response = await globalThis.fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
    } catch (error) {
      return finish({ ok: false, message: `token 端点不可达（${tokenUrl}）：${errorMessage(error)}` })
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0,400)
      return finish({ ok: false, message: `token 交换失败 HTTP ${response.status}${detail ? `：${detail}` : ''}` })
    }
    let payload
    try {
      payload = await response.json()
    } catch (error) {
      return finish({ ok: false, message: `token 端点返回非 JSON：${errorMessage(error)}` })
    }
    const token = typeof payload?.access_token === 'string' && payload.access_token ? payload.access_token : ''
    if (!token) return finish({ ok: false, message: 'token 端点未返回 access_token' })
    const ref = typeof account.tokenRef === 'string' && account.tokenRef.trim() ? account.tokenRef.trim() : ''
    if (!ref) return finish({ ok: false, message: '该账号未配置凭据引用（tokenRef）' })
    const credentials = this.ctx.get('credentials')
    if (!credentials || typeof credentials.set !== 'function') return finish({ ok: false, message: 'credentials 服务不可用' })
    try {
      await credentials.set(ref, token)
    } catch (error) {
      return finish({ ok: false, message: `保存 access token 失败：${errorMessage(error)}` })
    }
    return finish({
      ok: true,
      message: 'OAuth 登录成功，access token 已保存',
      ...(typeof payload.expires_in === 'number' ? { expiresIn: payload.expires_in } : {}),
    })
  }

  /** router/oauthDiscover：用账号的 access token 询问端点公布的模型列表。 */
  async oauthDiscover(request) {
    const id = String(request?.accountId ?? '')
    const account = this.getOAuthAccount(id)
    if (!account) return { ok: false, message: `OAuth 账号 "${id}" 不存在`, models: [] }
    const baseURL = (typeof account.baseURL === 'string' && account.baseURL.trim()) ? account.baseURL.trim().replace(/\/+$/, '') : ''
    if (!baseURL) return { ok: false, message: '该账号未配置 Base URL', models: [] }
    let token
    try {
      token = await this.resolveOauthToken(account)
    } catch (error) {
      return { ok: false, message: errorMessage(error), models: [] }
    }
    const url = `${baseURL}/models`
    let response
    try {
      response = await globalThis.fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    } catch (error) {
      return { ok: false, message: `模型端点不可达（${url}）：${errorMessage(error)}`, models: [] }
    }
    if (!response.ok) {
      let detail = ''
      try {
        const errPayload = await response.json()
        detail = typeof errPayload?.error?.message === 'string' ? errPayload.error.message : ''
      } catch { /* 无 JSON 错误体 */ }
      return { ok: false, message: `模型列表请求失败（${url}）HTTP ${response.status}${detail ? `：${detail}` : ''}`, models: [] }
    }
    let payload
    try {
      payload = await response.json()
    } catch (error) {
      return { ok: false, message: `模型端点返回非 JSON：${errorMessage(error)}`, models: [] }
    }
    // 按协议解析模型列表：Gemini 返回 { models: [{ name: "models/<id>" }] }，
    // OpenAI/Anthropic 返回 { data: [{ id }] }。
    const protocol = ['openai-completions', 'anthropic', 'gemini'].includes(account.protocol) ? account.protocol : 'openai-completions'
    let models
    if (protocol === 'gemini') {
      const list = Array.isArray(payload?.models) ? payload.models : []
      models = list
        .map((entry) => entry && typeof entry.name === 'string' ? entry.name.replace(/^models\//, '') : null)
        .filter((entry) => entry !== null)
    } else {
      const list = Array.isArray(payload?.data) ? payload.data : []
      models = list
        .map((entry) => entry && typeof entry.id === 'string' ? entry.id : null)
        .filter((entry) => entry !== null)
    }
    if (models.length === 0) {
      // 诊断：HTTP 2xx 但解析不出模型——把响应形状与样例反馈给用户定位。
      let shape = '非对象响应'
      if (Array.isArray(payload)) shape = `array(${payload.length})`
      else if (payload && typeof payload === 'object') shape = `{${Object.keys(payload).slice(0, 8).join(', ')}}`
      const sample = JSON.stringify(payload).slice(0, 220)
      return { ok: true, message: `端点未公布模型（可手工添加模型 id）。响应形状：${shape}；样例：${sample}`, models }
    }
    return { ok: true, message: `发现 ${models.length} 个模型`, models }
  }

  /** router/test：对 agent 做一次最小连通性调用（不记入统计）。 */
  async test(request) {
    const id = String(request?.agentId ?? '')
    const started = Date.now()
    const resolved = await this.resolveAgent(id)
    if (resolved.error) return { ok: false, message: resolved.error }
    const type = this.normalizeType(resolved.agent.type)
    if (type === 'image') {
      return { ok: true, message: `模型可解析：${resolved.provider}/${resolved.model}（image 类型不做生成测试）` }
    }
    if (type === 'speech') {
      return { ok: true, message: `模型可解析：${resolved.provider}/${resolved.model}（speech 类型不做转写测试）` }
    }
    if (type === 'cli') {
      const status = await this.cliStatus({ agentId: id })
      if (!status.ok) return { ok: true, message: status.message }
      return { ok: true, message: status.loggedIn ? `CLI 登录正常：${status.message}` : `CLI 未登录：${status.message}（在 多模态账号 → 子代理 中点「登录」完成授权）` }
    }
    try {
      const agent = { ...resolved.agent, maxRounds: 1, maxTokens: Number(resolved.agent.maxTokens) > 0 ? Math.min(Number(resolved.agent.maxTokens), 16) : 16 }
      const runner = resolved.mode === 'oauth' ? this.runOauthChat.bind(this) : this.runChat.bind(this)
      const result = await runner({ ...resolved, agent }, { agentId: id, task: '连通性测试：请只回复 OK', extra: '', images: [] })
      return {
        ok: true,
        message: `连通正常：${resolved.provider}/${resolved.model}，回复：${result.text.slice(0, 120)}`,
        latencyMs: Date.now() - started,
        ...(result.usage ? { usage: result.usage } : {}),
      }
    } catch (error) {
      return { ok: false, message: errorMessage(error), latencyMs: Date.now() - started }
    }
  }

  /** router/reset：清空统计。 */
  reset() {
    this.resetStats()
    return { ok: true }
  }
}
