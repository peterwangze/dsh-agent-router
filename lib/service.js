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
 * - 维护进程内实时用量统计（C-3 / §4.4：聚合与持久化委托 lib/stats.js——
 *   totals / recent / 分钟级 series 两级聚合 + DSH_HOME 按天 JSONL 持久化）；
 * - 提供 gateway 可直达的 RPC 方法：catalog / stats / statsExport / test /
 *   reset / config / save（配置读写走本插件自己的 Remote 端点，因为
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
import { createRequire } from 'node:module'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve as pathResolve, relative as pathRelative, isAbsolute as pathIsAbsolute, sep as pathSep } from 'node:path'
import { ROUTER_NS, MODALITY_VALUES, normalizeCapabilities, OAUTH_PRESET_VALUES } from './schemas.js'
import { rememberImage } from './memory.js'
import { AttachmentRegistry, isAttachmentId, ATTACHMENT_ERROR_CODES, probeImageDimensions } from './attachments.js'
import { CHATGPT_PRESET, OauthCredentialStore, resolveCredentialPath, accountIdFromJwt, CREDENTIAL_ERROR_CODES, startDeviceAuthorization, pollDeviceAuthorizationToken, DEVICE_FLOW_TIMEOUT_SECONDS, DEVICE_SLOW_DOWN_ADD_MS, DEVICE_TRANSPORT_RETRY_ADD_MS, DEVICE_MIN_POLL_INTERVAL_MS } from './oauth-credentials.js'
import { StatsStore } from './stats.js'
import { sourceAcceptsModality } from './wrapper.js'

/** 支持的 agent 类型。 */
export const AGENT_TYPES = ['chat', 'agent', 'image', 'speech', 'cli']

/**
 * 模态能力默认映射（v3 §4.3.2 M5 草案表）：agent.type → 消费/产出模态，
 * capabilities 覆盖（见 modalityOfAgent）。方向语义：consume = 接收该模态
 * 作为输入；produce = 产出该模态。
 * - chat（远端模型）：默认文本；媒体能力标签（image/audio/video/file）→ consume；
 * - agent（子代理）：默认任意文件（路径注入，fs 工具读取）；
 * - cli（无头 CLI）：默认任意文件 + 文本/文件产物；媒体能力标签 → produce
 *   （cli 生图 = produce，与 listImageGenerationAgents 现状语义一致——cli 经
 *   files/路径天然可读任意文件，consume 无需标签）；
 * - image（生成端点）：produce image（capabilities 不改变集合——image 类型
 *   绝不进 consume-image 目录，避免识别流程误交生图端点，R8 事实 F14 同源）；
 * - speech（转写端点）：consume audio（filePath 通路）、produce text。
 */
const MODALITY_DEFAULT_MAP = {
  chat: { consume: ['text'], produce: ['text'] },
  agent: { consume: ['file'], produce: ['text'] },
  cli: { consume: ['file'], produce: ['text', 'file'] },
  image: { consume: [], produce: ['image'] },
  speech: { consume: ['audio'], produce: ['text'] },
}

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

// 统计保留窗口常量（RECENT_CAP=100 / SERIES_WINDOW_MINUTES=90）已随 C-3
// 委托迁移至 lib/stats.js（RECENT_CAP / SERIES_WINDOW_MINUTES 导出面）。

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

/** cli 产物收集识别的图片扩展名。 */
const IMAGE_ARTIFACT_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

/**
 * 工作区图片文件快照（路径 → `大小:mtime` 签名，深度上限 4 层，跳过
 * node_modules/.git 与隐藏目录，仅 .router-files 例外）。cli 子代理执行
 * 前后各拍一次，diff 即"本次调用新生成/修改的图片产物"（图生图收集）。
 */
function snapshotImageFiles(root, depth = 0) {
  const map = new Map()
  if (depth > 4 || typeof root !== 'string' || root === '') return map
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return map
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    if (entry.name.startsWith('.') && entry.name !== '.router-files') continue
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      for (const [key, value] of snapshotImageFiles(full, depth + 1)) map.set(key, value)
      continue
    }
    if (!entry.isFile() || !IMAGE_ARTIFACT_EXTS.has(extname(entry.name).toLowerCase())) continue
    try {
      const stat = statSync(full)
      map.set(full, `${stat.size}:${Math.round(stat.mtimeMs)}`)
    } catch { /* 读不到：忽略该文件 */ }
  }
  return map
}

/** 严格按魔数识别图片 media type；非 PNG/JPEG/WebP/GIF 返回 undefined。 */
function detectImageMediaType(data) {
  if (data.length >= 4 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 12 && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return 'image/webp'
  if (data.length >= 4 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'image/gif'
  return undefined
}

/** 常见媒体扩展名 → media type 兜底映射（readWorkspaceFile 魔数未命中时）。 */
const EXT_MEDIA_TYPES = {
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
  '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.opus': 'audio/ogg',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
}

/**
 * 严格按魔数识别 audio/video media type；未命中返回 undefined（对齐
 * detectImageMediaType 风格；V-DSH-4 魔数表：wav/mp3/mp4/webm 头字节）。
 * 不使用 MPEG 帧同步启发式（0xff 0xfe UTF-16 BOM 误判风险），mp3 仅认 ID3。
 * 导出供 smoke 直接单测六个魔数分支（R12 F-3）。
 */
export function detectAudioVideoMediaType(data) {
  // WAV/RIFF：`RIFF....WAVE`
  if (data.length >= 12 && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && data[8] === 0x57 && data[9] === 0x41 && data[10] === 0x56 && data[11] === 0x45) return 'audio/wav'
  // MP3：ID3v2 标签头
  if (data.length >= 3 && data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) return 'audio/mpeg'
  // FLAC：`fLaC`
  if (data.length >= 4 && data[0] === 0x66 && data[1] === 0x4c && data[2] === 0x61 && data[3] === 0x43) return 'audio/flac'
  // Ogg：`OggS`
  if (data.length >= 4 && data[0] === 0x4f && data[1] === 0x67 && data[2] === 0x67 && data[3] === 0x53) return 'audio/ogg'
  // MP4/M4A：`....ftyp`
  if (data.length >= 12 && data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) return 'video/mp4'
  // WebM/Matroska：EBML 头 `1A 45 DF A3`
  if (data.length >= 4 && data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) return 'video/webm'
  return undefined
}

/**
 * 路径包含判定（对齐宿主 fs.contains 语义，dsh-fs-local L719-722）：child
 * 相对 parent 为 `''`（相等）或非 `..` 前缀且非绝对路径即在包含内。F-1
 * realpath 二次校验的后备——宿主 fs.contains 不可用时对 targetKey 做词法复核。
 */
function isPathContained(parent, child) {
  const rel = pathRelative(parent, child)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${pathSep}`) && !pathIsAbsolute(rel))
}

/** base64（标准字母表）解码为字节。 */
function decodeBase64(text) {
  const binary = globalThis.atob(text)
  const data = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) data[index] = binary.charCodeAt(index)
  return data
}

// 分钟键（minuteKey）已随 C-3 委托迁移至 lib/stats.js（minuteKeyOf 私有实现）。

/**
 * codex-responses 端点归一（pi-ai resolveCodexUrl 同款，H3-8）：空 baseURL →
 * 官方默认 `https://chatgpt.com/backend-api`（preset 零配置语义）；已含
 * `/codex/responses` 原样；止于 `/codex` 补 `/responses`；其余补
 * `/codex/responses`（自定义网关/代理形态放行）。
 */
const CODEX_RESPONSES_DEFAULT_BASE_URL = 'https://chatgpt.com/backend-api'

function resolveCodexResponsesUrl(baseURL) {
  const raw = typeof baseURL === 'string' && baseURL.trim() ? baseURL.trim() : ''
  const normalized = (raw || CODEX_RESPONSES_DEFAULT_BASE_URL).replace(/\/+$/, '')
  if (normalized.endsWith('/codex/responses')) return normalized
  if (normalized.endsWith('/codex')) return `${normalized}/responses`
  return `${normalized}/codex/responses`
}

/**
 * §3.5 Q2 per-protocol 能力接口（EVO-002 Step 6）：返回某 OAuth 协议支持的
 * agent 类型列表。v0.3.0 全协议（含未知协议）返回 ['chat']——接口形状就位，
 * 后续版本按协议扩展返回值（如 codex-responses 增补 'image'，V-EVO-3 验证
 * 后）即解开类型限制，无需再改调用点（P5 泛化：单点修改）。
 */
export function oauthCapabilities(protocol) {
  return ['chat']
}

/**
 * EVO-002 Step 6 代理发现（EV-028 实证：chatgpt.com 需经代理 7890 可达、
 * auth.openai.com 直连可达）：显式配置 `router.oauthProxyUrl` 优先；缺省回退
 * 环境代理发现（HTTPS_PROXY/https_proxy/ALL_PROXY/all_proxy 大小写双形态）；
 * 均无 → 空串 = 直连。返回 `{ proxyUrl, source }`——source 供诊断与埋点
 * 说明代理来源；仅作用于 chatgpt.com 目标（auth 端点永不经代理）。
 */
export function resolveOauthProxy(state, env = globalThis.process?.env ?? {}) {
  const configured = typeof state?.oauthProxyUrl === 'string' && state.oauthProxyUrl.trim() ? state.oauthProxyUrl.trim() : ''
  if (configured) return { proxyUrl: configured, source: 'router.oauthProxyUrl' }
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy']) {
    const value = typeof env?.[key] === 'string' && env[key].trim() ? env[key].trim() : ''
    if (value) return { proxyUrl: value, source: key }
  }
  return { proxyUrl: '', source: '' }
}

/**
 * SSE 事件流解析（pi-ai parseSSE 同构；事件形状 = H3-10 / EV-028 十二事件链）：
 * 按 `\n\n` 分帧，帧内 `data:` 行拼接（跨行 data 以 `\n` 连接），`[DONE]` 哨兵
 * 跳过，其余 JSON.parse 后逐事件 yield；`event:` 行忽略（类型以 data JSON 的
 * type 字段为准）。signal 中止时 cancel reader 并抛错（协作式取消）。
 * @param {ReadableStream} body - fetch response.body（须可 getReader）。
 * @param {AbortSignal} [signal] - 调用方取消信号（input.signal 透传）。
 */
async function* parseSseEvents(body, signal) {
  if (!body || typeof body.getReader !== 'function') {
    throw new Error('ChatGPT 端点未返回 SSE 流（response.body 不可读）')
  }
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const onAbort = () => { void reader.cancel().catch(() => {}) }
  signal?.addEventListener?.('abort', onAbort, { once: true })
  try {
    for (;;) {
      if (signal?.aborted) throw new Error('ChatGPT 调用已被取消（signal 中止）')
      const { done, value } = await reader.read()
      if (signal?.aborted) throw new Error('ChatGPT 调用已被取消（signal 中止）')
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx = buffer.indexOf('\n\n')
      while (idx !== -1) {
        const chunk = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const data = chunk
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n')
          .trim()
        if (data && data !== '[DONE]') {
          try {
            yield JSON.parse(data)
          } catch {
            throw new Error(`ChatGPT SSE 数据不是合法 JSON：${data.slice(0, 200)}`)
          }
        }
        idx = buffer.indexOf('\n\n')
      }
    }
  } finally {
    signal?.removeEventListener?.('abort', onAbort)
    try { await reader.cancel() } catch { /* 已关闭 */ }
    try { reader.releaseLock() } catch { /* 已释放 */ }
  }
}

/**
 * 宿主多模型路由服务。
 */
export class RouterService extends TypertRemoteService {
  constructor(ctx, base = {}, statsOptions = {}) {
    super(ctx, 'router')
    /** 组合层 base（settings 未挂载时的后备配置）。 */
    this.base = base ?? {}
    /** settings scope（由 index.js attach）。 */
    this.scope = null
    /** 一键授权进行中的会话：state → { accountId, verifier, redirectUri, expiresAt }。 */
    this.oauthPending = new Map()
    /** EVO-005：设备码流进行中的会话（deviceId → session；1455 被占时
     *  oauthBegin 自动降级发起）。session = { accountId, deviceAuthId,
     *  userCode, intervalMs, initialIntervalMs, expiresAt, status, cancelled,
     *  pollCount, error, done, doneResolve }——终态（ok/failed/expired/
     *  cancelled/exchange_failed）由 pollDeviceLoop 写入并自 Map 清除。 */
    this.oauthDevicePending = new Map()
    /** EVO-005 测试提速注入（实例级覆盖，同 lockTimeoutMs 先例）：0 = 用
     *  DEVICE_SLOW_DOWN_ADD_MS / DEVICE_FLOW_TIMEOUT_SECONDS 默认值。 */
    this.oauthDeviceSlowDownAddMs = 0
    this.oauthDeviceTimeoutMs = 0
    /** 账号池 round-robin 游标（池 id → 下一个候选下标）。 */
    this.poolCursors = new Map()
    /** cli 类型并发计数（agentId → 当前运行数）。 */
    this.cliRunning = new Map()
    /** cli 类型活动子进程集合（停止/卸载时全部杀死）。 */
    this.cliChildren = new Set()
    /** 内置公开 Client 的 8085 回调端口是否已就绪（由 index.js 设置）。 */
    this.oauthLoopbackReady = false
    /** ChatGPT preset 的 1455 惰性回调服务是否已就绪（由 index.js 设置，R3 F-2 声明）。 */
    this.codexLoopbackReady = false
    /** ChatGPT preset 的 1455 惰性启动器（由 index.js 注入；oauthBegin preset
     *  分支消费——未发起 ChatGPT 登录前零监听，R3 F-2 声明）。 */
    this.codexLoopbackStarter = null
    /** preset 账号凭据存储实例缓存（凭据文件路径 → OauthCredentialStore；
     *  同路径复用同实例使锁所有权 token 稳定，§3.4 条目 2）。 */
    this.oauthCredentialStores = new Map()
    /** C-9 埋点（EVO-002 Step 6 启动）：OAuth 登录旅程事件（begin/login/
     *  logout/refresh 失败形态），内存环形缓冲（上限 100 条，v0.3.2 出
     *  报告；stats 清空不联动——登录旅程独立于调用统计）。P7 红线：事件
     *  负载永不携带 access/refresh token 值。 */
    this.oauthEvents = []
    /** P8 能力判定诊断（FIX-004）：图片预检的判定来源/失败事件（自证放行/
     *  安全回落拒绝），内存环形缓冲（上限 100 条）。诊断事件永不携带 token
     *  等敏感字段（P7），只带 provider/model/hostModalities 等判定上下文。 */
    this.capabilityEvents = []
    /** 代理 dispatcher 加载器（仅测试注入用；缺省动态 import('undici')）。 */
    this.oauthUndiciLoader = null
    /** FIX-006：已加载 undici 版本探测（仅测试注入用；缺省 createRequire
     *  读 undici/package.json——undici 7.x 无 exports 限制，子路径可解析；
     *  探测失败返回 '' 不阻断装配：依赖声明已钉 major，探测是跨 major
     *  错配的快线诊断而非可用性门）。 */
    this.oauthUndiciVersionProbe = null
    /** R7-F3：代理 dispatcher 实例缓存（proxyUrl → ProxyAgent）。每次调用
     *  新建连接池会重复 TLS 握手且不显式关闭（GC 依赖）——高频调用下
     *  socket/FD 压力；同 oauthCredentialStores 按路径缓存的先例模式。
     *  键 = proxyUrl。R8-F2（P2）：Map 强引用——旧键实例不随 GC 回收（原
     *  注释"随 GC 回收"机制错误）；读取面旧键自然失效（不再被查询），但
     *  实例被 Map 持有至替换。缓存有界：仅保留最近一次代理配置（代理
     *  配置实际单一），替换时显式 close 旧实例——见 loadOauthProxyDispatcher。 */
    this.oauthProxyDispatchers = new Map()
    /** M2 附件统一编址层（v3 §4.3.1/§5.1，Step 5a 模块 + Step 5b 接线）：
     *  三调用点（prepareChatFiles / materializeCliImages / selectAttachments）
     *  的寻址注册与解析经此统一索引。 */
    this.registry = new AttachmentRegistry(ctx)
    /** F11 上传目标工作区（Step 8）：最近一次 run() 执行记录的会话 cwd。
     *  浏览器侧 router/uploadFile RPC 的 direct invocation 不携带会话上下文
     *  （宿主网关 exact-arguments 断言只放行 request），落盘目标取最近执行
     *  会话的工作区——浏览器上传发生在用户正在操作的会话，该会话必然已至少
     *  运行过一次；多会话切换时以最近执行为准（声明推导，§4.4.2 ②）。 */
    this.lastWorkspace = null
    /** C-3 统计（EVO-003 Phase 2 / §4.4 委托迁移，DEC-011 attachments.js
     *  先例）：totals/recent/series/accountTotals/accountSeries 五实例字段
     *  整体迁移至 StatsStore。未接线前 persist=false（纯内存 = 现状行为）；
     *  index.js 组合根按 settings `router.stats.persist`（默认 true）经
     *  applyStatsSettings/setPersist 启用持久化生命周期（W-4 往返语义）。
     *  statsOptions 仅测试注入用（dir/persist 等透传）。 */
    this.stats = new StatsStore({
      persist: false,
      ...statsOptions,
      getAgentName: (id) => this.getAgent(id)?.name || id,
    })
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
    if (!agent) {
      // FIX-007 F-5：目录空 fail-loud 诊断（P8 可观测）——settings 未挂载
      // （scope=null → 组合层 base 默认空 agents）或配置确实为空时，"可用：无"
      // 不再是静默状态：每次未知 agent 解析记一次诊断事件（含 scopeAttached
      // 与 enabled 状态），宿主日志同步可见（R5「可用：无」取证：RouterService
      // 构造即 provide，settings.register 抛错时 attach(scope) 不执行——服务
      // 存活但目录空的结构脆弱性，根因追踪另立任务）。
      if (this.listEnabledAgents().length === 0) {
        this.recordCapabilityEvent('router_catalog_empty', { requested: String(id).slice(0, 40), scopeAttached: this.scope !== null, enabled: this.isEnabled() })
      }
      return { id, agent: null, mode: 'route', provider: '', model: '', source: 'unknown', error: `未知 agent "${id}"（可用：${this.listEnabledAgents().map(([key]) => key).join(', ') || '无'}）` }
    }
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
    // F11 上传目标工作区记录：每次执行携带 exec.agent.session（会话 header.cwd）
    // 时更新最近会话工作区，供浏览器侧 router/uploadFile RPC 解析落盘目标。
    this.rememberWorkspace(input?.exec?.agent?.session)
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
    let result
    if (resolved.mode === 'oauth' || resolved.mode === 'pool') {
      // §3.5 Q2（EVO-002 Step 6）：oauth/pool 分支收敛至 runOauthDispatch
      // 单点——per-protocol 能力判定（oauthCapabilities）替代全局 chat
      // 一刀切；类型拒绝文案携带协议名（后续版本按协议扩展能力即解开）。
      result = await this.runOauthDispatch(resolved, input)
    } else if (type === 'image') {
      result = await this.runImage(resolved, input)
    } else if (type === 'agent') {
      result = await this.runAgentDelegation(resolved, input)
    } else if (type === 'cli') {
      result = await this.runCli(resolved, input)
    } else if (type === 'speech') {
      result = await this.runSpeech(resolved, input)
    } else {
      result = await this.runChat(resolved, input)
    }
    // 图片轮识别结果回写（v3 §5.3 / N-2，MIG-001 Step 4）：视觉 agent 成功
    // 返回文本 → (attachmentId → 结果摘要) 写入 imageMemory，后续文本轮的
    // 历史图由改写层注入 system 记忆段（跨轮指代）。best-effort：失败不阻塞。
    this.rememberDispatchedImages(resolved, type, input, result)
    return result
  }

  /**
   * imageMemory 回写（M6 回写点）：仅视觉类 agent（chat/agent 类型且
   * capabilities 含 image——与 listImageVisionAgents 同口径）在附件通道
   * 携带图片（attachmentId 存在）且返回非空文本时写入；生图/转写通路与
   * 无 attachmentId 的历史兼容 ref 不回写（"此前识别"的描述语义不成立）。
   * 写入失败静默跳过——绝不阻塞工具结果返回。
   */
  rememberDispatchedImages(resolved, type, input, result) {
    try {
      if (!Array.isArray(input.images) || input.images.length === 0) return
      const capabilities = Array.isArray(resolved.agent?.capabilities) ? resolved.agent.capabilities : []
      const isVision = (type === 'chat' || type === 'agent') && capabilities.includes('image')
      if (!isVision) return
      const text = typeof result?.text === 'string' ? result.text.trim() : ''
      if (!text || text === '（空响应）') return
      for (const ref of input.images) {
        const id = typeof ref?.attachmentId === 'string' ? ref.attachmentId : ''
        if (id) rememberImage(id, text)
      }
    } catch { /* 回写失败不阻塞工具结果 */ }
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
        // v3 Step 5b：寻址结果（路径 → files 引用）注册进 M2 统一索引
        // （§4.3.1 registerEntry，注册经统一索引）——图片经宿主 saveImage
        // 内容寻址去重，注册表建立 id ↔ files 引用条目，供后续
        // materializeCliImages/read/byId 经统一索引解析（解析经统一索引）。
        // 宿主附件 id 非内容寻址（格式未验证，F-5/遗留宿主）时 registerEntry
        // 守卫跳过（注册表只索引 sha256 规范身份），注入行为不变。
        this.registry.registerEntry({
          id: String(ref?.attachmentId ?? ''),
          mediaType: typeof ref?.mediaType === 'string' && ref.mediaType ? ref.mediaType : mediaType,
          bytes: typeof ref?.bytes === 'number' ? ref.bytes : bytes.length,
          ...(typeof ref?.width === 'number' ? { width: ref.width } : {}),
          ...(typeof ref?.height === 'number' ? { height: ref.height } : {}),
          ...(typeof ref?.name === 'string' && ref.name ? { name: ref.name } : { name: basename(entry.displayPath) }),
          source: 'files',
        })
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

  /**
   * 图片预检的模型能力判定（FIX-004 单点）。
   *
   * 问题（用户质疑成立）：宿主 pi-ai 自定义 provider 的 `resolveModelInfo`
   * inputModalities 缺省 `DEFAULT_INPUT=["text"]`——纯靠宿主声明不可信（实测
   * qwen3.7-plus 可看图但会被误拒，README L125 / 同型 D9）。旧预检只信宿主
   * `resolveModelInfo`，宿主判定缺失时无自证路径、无观测，静默拒绝同型
   * R2-F3 吞错零观测。
   *
   * 判定顺序（P5：适配器级能力探测不复制逻辑，复用 wrapper.js 单点
   * `sourceAcceptsModality`）：
   *  ① 宿主明确声明含 image → 信任放行（来源 host-declared——信任宿主声明，
   *     不重复适配器探测；声明可信路径）。
   *  ② 宿主声明 text-only 或缺失（不确定——pi-ai 默认即此形态）→ 走能力自证：
   *     经 `sourceAcceptsModality` 探测适配器 resolveModel；自证确认 → 放行
   *     （来源 self-certified，qwen3.7-plus 同型根治）。
   *  ③ 自证失败/确认纯文本 → 安全回落不放行（来源 probe-failed，F-2 先例：
   *     宁可预检疑似漏图也不把裸图块击穿不确定端点）——由调用方记录诊断事件。
   *
   * @returns {Promise<{accepted: boolean, source: 'host-declared'|'self-certified'|'probe-failed',
   *   hostModalities: string[], hostAvailable: boolean}>}
   */
  async decideImagePrecheck(resolved, llm) {
    let hostInfo
    try {
      hostInfo = await llm.resolveModelInfo(resolved.provider, resolved.model)
    } catch {
      hostInfo = undefined
    }
    const hostModalities = Array.isArray(hostInfo?.inputModalities) ? hostInfo.inputModalities : []
    if (hostModalities.includes('image')) {
      return { accepted: true, source: 'host-declared', hostModalities, hostAvailable: true }
    }
    const original = () => {
      try {
        return llm && typeof llm.registration === 'function' ? llm.registration(resolved.provider)?.adapter : undefined
      } catch {
        return undefined
      }
    }
    const selfCertified = await sourceAcceptsModality(original, resolved.provider, resolved.model, 'image')
    if (selfCertified) {
      return { accepted: true, source: 'self-certified', hostModalities, hostAvailable: typeof hostInfo === 'object' && hostInfo !== null }
    }
    return { accepted: false, source: 'probe-failed', hostModalities, hostAvailable: typeof hostInfo === 'object' && hostInfo !== null }
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
      // 前置拒绝（多声明代价远大于少声明）：模型确认纯文本才拒图。注意宿主
      // resolveModelInfo 在 pi-ai 自定义 provider 下缺省 DEFAULT_INPUT=["text"]，
      // 不可纯信——判定缺失/不确定时先走能力自证（decideImagePrecheck / 复用
      // wrapper.js sourceAcceptsModality 探测适配器），自证确认即放行，自证失败
      // 才回落拒绝（F-2 先例：不放行裸图块击穿不确定端点）+ 诊断事件（P8）。
      // 例外：自定义（declared）路由的 input 声明是 pi-ai 的文本默认值，
      // 不代表模型真实能力（如 GPT 中转的 gpt-5.6-luna 实际支持图片）——
      // 跳过预检，由端点裁决。
      let skipPrecheck = false
      try {
        // declared 判定：真实宿主 llm.listProviders() 的条目只有 {id,name}
        // （FIX-003，21:28 宿主演进实证），declared 目录标记在
        // llm.listConfigurableProviders()（pro-comment：registerConfigurableProviders
        // 发布进 directory，listProviders 读的是 adapters 注册表）。先查
        // configurable 目录（权威），缺失时回退 listProviders 兼容旧宿主。
        if (typeof llm.listConfigurableProviders === 'function') {
          const directory = await llm.listConfigurableProviders()
          const entry = (directory ?? []).find((item) => (item.id ?? item.provider) === resolved.provider)
          skipPrecheck = !!entry && entry.declared === true
        } else if (typeof llm.listProviders === 'function') {
          const directory = await llm.listProviders()
          const entry = (directory ?? []).find((item) => (item.id ?? item.provider) === resolved.provider)
          skipPrecheck = !!entry && entry.declared === true
        }
      } catch { /* 目录不可用：保留预检 */ }
      if (!skipPrecheck) {
        // FIX-004：不再只信宿主 resolveModelInfo——宿主判定缺失/不确定（pi-ai
        // 自定义 provider 缺省 DEFAULT_INPUT=["text"]）时走能力自证（复用
        // wrapper.js 单点 sourceAcceptsModality 探测适配器 resolveModel）。
        // 单点判定见 decideImagePrecheck；失败回落拒绝 + 诊断事件（P8 可观测）。
        const verdict = await this.decideImagePrecheck(resolved, llm)
        if (verdict.source === 'self-certified') {
          // 自证放行也要可观测（P8）：宿主说 text-only/缺失但我们探测确认了。
          this.recordCapabilityEvent('image_precheck_self_certified', { provider: resolved.provider, model: resolved.model, hostModalities: verdict.hostModalities, hostAvailable: verdict.hostAvailable })
        }
        if (!verdict.accepted) {
          this.recordCapabilityEvent('image_precheck_reject', { provider: resolved.provider, model: resolved.model, hostModalities: verdict.hostModalities, hostAvailable: verdict.hostAvailable })
          throw new Error(`模型 ${resolved.provider}/${resolved.model} 不支持图片输入；请为该 agent 配置支持视觉的模型（如 openai/gpt-4o）`)
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

  /**
   * 把附件图片落盘为工作区 .router-files/ 下的文件，返回路径列表（CLI 按路径读图）。
   * v3 Step 5b（寻址经 M2，解析经统一索引）：内容寻址附件（sha256 id）经 M2
   * registry 物化——懒注册单读 + 会话作用域缓存（`sessionId\0id`，W-3），路径
   * .router-files/attachments/<hex>.<ext>；非内容寻址的遗留 ref（旧会话
   * { id, kind } 形态，R6/K-8 兼容）走直接宿主 readImage 回退（cli-run-* 命名）。
   */
  async materializeCliImages(refs, dir, stamp, sessionId = '') {
    const attachments = this.ctx.get('attachments')
    if (!attachments || typeof attachments.readImage !== 'function') return []
    const paths = []
    const extOf = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
    let index = 0
    const cwd = dirname(dir)
    for (const ref of refs ?? []) {
      try {
        const id = typeof ref?.attachmentId === 'string' ? ref.attachmentId : (typeof ref?.id === 'string' ? ref.id : '')
        // FIX-007 F-4：物化耗时埋点（P8——CLI 图片链变慢归因）。
        const materializeStartedAt = Date.now()
        if (isAttachmentId(id)) {
          // 内容寻址：经 M2 统一索引物化（懒注册单读 + 会话缓存，不重复落盘）。
          const materialized = await this.registry.materialize(id, { cwd, sessionId })
          paths.push(materialized.path)
        } else {
          // 遗留 ref（无内容寻址 id）：直接宿主读取落盘（旧会话兼容，R6/K-8）。
          const stored = await attachments.readImage(ref)
          const ext = extOf[stored?.ref?.mediaType] ?? 'png'
          const name = `${CLI_TMP_PREFIX}${stamp}-img-${index++}.${ext}`
          writeFileSync(join(dir, name), stored.data)
          paths.push(join(dir, name))
        }
        const materializeMs = Date.now() - materializeStartedAt
        if (materializeMs > 200) this.recordCapabilityEvent('attachment_materialize_slow', { id: String(id).slice(0, 15), ms: materializeMs })
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
      // 物化缓存按会话作用域键（W-3）：会话 id 取宿主 session 的 sid/id（无则
      // 匿名键——会话内物化仍缓存，跨会话不共享物化路径）。
      const session = input.exec?.agent?.session
      const sessionId = typeof session?.sid === 'string' && session.sid ? session.sid : (typeof session?.id === 'string' && session.id ? session.id : '')
      const imagePaths = await this.materializeCliImages(Array.isArray(input.images) ? input.images : [], dir, stamp, sessionId)
      if (imagePaths.length > 0) {
        contextLines.push(`本任务已附带 ${imagePaths.length} 张图片（已落盘为工作区文件，请用你的读图工具查看这些路径，不要假设图片内容）：\n${imagePaths.join('\n')}`)
        const conversation = this.recentConversationContext(input.exec?.agent)
        if (conversation) contextLines.push(`[主会话最近对话上下文]\n${conversation}\n\n请结合以上上下文理解用户需求，分析围绕用户的实际问题。`)
      }
      const baseText = system ? `[角色设定]\n${system}\n\n${text}` : text
      const cliTimeout = Number(entry.timeoutMs) > 0 ? Number(entry.timeoutMs) : CLI_DEFAULT_TIMEOUT_MS
      // 产物收集：执行前快照（输入图片已物化，不会误判为新产物），执行后
      // diff 出新生成/修改的图片文件 → 存附件返回 images（图生图展示）。
      const attachments = this.ctx.get('attachments')
      const collectArtifacts = !!attachments && typeof attachments.saveImage === 'function'
      const before = collectArtifacts ? snapshotImageFiles(cwd) : new Map()
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
      const images = []
      if (collectArtifacts) {
        const maxArtifacts = Math.min(Math.max(1, Number(attachments.imageLimits?.maxImagesPerMessage) || 8), 8)
        const maxBytes = Number(attachments.imageLimits?.maxImageBytes) || (20 * 1024 * 1024)
        for (const [path, sig] of snapshotImageFiles(cwd)) {
          if (images.length >= maxArtifacts) break
          if (before.get(path) === sig) continue
          try {
            const data = readFileSync(path)
            if (data.length === 0 || data.length > maxBytes) continue
            images.push(await attachments.saveImage({ data, mediaType: sniffMediaType(data), name: basename(path) }))
          } catch { /* 单个产物读取/保存失败跳过，其余照常收集 */ }
        }
      }
      return { kind: 'cli', text: output, ...(images.length > 0 ? { images } : {}), ...(parsed.usage ? { usage: parsed.usage } : {}) }
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
    let picked
    if (Array.isArray(indices) && indices.length > 0) {
      const selected = []
      for (const raw of indices) {
        if (!Number.isInteger(raw)) throw new Error(`attachments 序号必须是整数（0 起）：收到 ${JSON.stringify(raw)}`)
        if (raw < 0 || raw >= blocks.length) throw new Error(`附件序号 ${raw} 不存在：最近一条含附件的用户消息共 ${blocks.length} 个附件（可用序号 0-${blocks.length - 1}）`)
        selected.push(blocks[raw].attachment)
      }
      if (includeImages) for (const block of blocks) selected.push(block.attachment)
      picked = [...new Set(selected)]
    } else if (includeImages) {
      picked = blocks.map((block) => block.attachment)
    } else {
      return []
    }
    // v3 Step 5b（附件派发经 M2，注册经统一索引）：把派发到的内容寻址附件
    // 懒注册进注册表（byId 宿主 readImage 一次建立条目；非内容寻址遗留 ref
    // 不在注册表索引范围——注册表只索引 sha256 规范身份）。fire-and-forget：
    // selectAttachments 保持同步契约（tool.js 同步调用，不得 await），注册
    // 不阻塞派发结果；后续 materializeCliImages/read 经注册表解析，未完成
    // 注册时自行懒注册（幂等，最多一次额外宿主读取）。
    for (const ref of picked) {
      const id = typeof ref?.attachmentId === 'string' ? ref.attachmentId : (typeof ref?.id === 'string' ? ref.id : '')
      if (isAttachmentId(id)) void this.registry.byId(id).catch(() => undefined)
    }
    return picked
  }

  /**
   * attachmentIds 参数解析（v3 §4.3.4 / N-8，Step 7）：内容寻址附件 id 列表 →
   * ImageAttachmentRef[]。每个 id 经 M2 统一编址解析（registry.resolve → byId
   * 懒注册降级 W-2：未注册但宿主可读的 id 经 readImage 建立条目）；id 格式不
   * 匹配内容寻址 → 明确报错（INVALID_ATTACHMENT_ID 语义）；未注册且宿主读不
   * 到 → ATTACHMENT_UNKNOWN（"附件不可解析"）。与 attachments/includeImages
   * 语义正交（调用方合并去重）；exec 仅用于会话 cwd/sessionId（可缺省——
   * id 解析不依赖工作区路径）。
   */
  async resolveAttachmentIds(ids, exec = {}) {
    const session = exec?.agent?.session
    const cwd = typeof session?.header?.cwd === 'string' && session.header.cwd ? session.header.cwd : ''
    const sessionId = typeof session?.sid === 'string' && session.sid ? session.sid : (typeof session?.id === 'string' && session.id ? session.id : '')
    const refs = []
    const seen = new Set()
    for (const raw of Array.isArray(ids) ? ids : []) {
      const id = typeof raw === 'string' ? raw.trim() : ''
      if (!isAttachmentId(id)) throw new Error(`attachmentIds 项必须是内容寻址附件 id（sha256:<64位hex>）：收到 ${JSON.stringify(raw)}`)
      if (seen.has(id)) continue
      seen.add(id)
      const resolved = await this.registry.resolve(id, { cwd, sessionId, signal: exec?.signal })
      const entry = resolved?.entry
      if (!entry) throw new Error(`附件不可解析（${id}）：未注册且宿主无法读取`)
      // FIX-007 F-3：派发 ref 以宿主权威元数据构造（读取单点确认可读后回填）。
      // 旧代码 width/height/name 条件展开 + bytes/mediaType 兜底——条目字段
      // 缺失时产出畸形 ref，经标记 → 浏览器 RouteImage → remote.imageData 时
      // 被客户端 codec（必填 width/height）拒绝（client api: router/imageData
      // rejected "request" 症状）。补全策略（尽力而为 + 降级可观测，R0 F-1）：
      // 条目缺任一必填字段 → 读取单点（完整 ref + 自取证降级）取回字节，对
      // 字节跑魔数/尺寸探测回填；双重失败（字节也不可得）时保留兜底 ref（宽松
      // 宿主兼容）并记 attachment_ref_degraded 诊断事件——降级永不静默（P8）。
      let authoritative = entry
      const missingMeta = typeof entry.mediaType !== 'string' || !entry.mediaType
        || typeof entry.bytes !== 'number' || typeof entry.width !== 'number' || typeof entry.height !== 'number'
      if (missingMeta) {
        const stored = await this.registry.readStoredImage(id, { signal: exec?.signal })
        const data = stored?.data
        const ref = stored?.ref && typeof stored.ref === 'object' ? stored.ref : {}
        if (data) {
          const probedMedia = typeof ref.mediaType === 'string' && ref.mediaType ? ref.mediaType : detectImageMediaType(data)
          const dims = (typeof ref.width === 'number' && typeof ref.height === 'number') ? ref : probeImageDimensions(data)
          authoritative = {
            ...entry,
            ...(probedMedia ? { mediaType: probedMedia } : {}),
            ...(typeof ref.bytes === 'number' ? { bytes: ref.bytes } : { bytes: data.length }),
            ...(dims && typeof dims.width === 'number' ? { width: dims.width } : {}),
            ...(dims && typeof dims.height === 'number' ? { height: dims.height } : {}),
          }
        } else {
          // FIX-007 R0 F-1（P8）：双重失败（条目缺元数据 + 读取单点/自取证均
          // 不可得）仍以兜底值产出派发 ref（宽松宿主兼容——服务端 imageData
          // 同样兜底成功，行为与既有版本一致），但**不再静默**：记录降级诊断
          // 事件（host 区分"附件服务缺失"与"服务在但不可读"），宿主日志同步
          // 可见。畸形 ref 后续被客户端 codec 拒绝时（rejected "request"），
          // 本事件即失败链归因锚点。
          this.recordCapabilityEvent('attachment_ref_degraded', {
            id: String(id).slice(0, 15),
            host: this.ctx.get('attachments') ? 'unreadable' : 'unavailable',
          })
        }
      }
      refs.push({
        id: authoritative.id,
        kind: 'image',
        attachmentId: authoritative.id,
        mediaType: typeof authoritative.mediaType === 'string' && authoritative.mediaType ? authoritative.mediaType : 'image/png',
        bytes: typeof authoritative.bytes === 'number' ? authoritative.bytes : 0,
        ...(typeof authoritative.width === 'number' ? { width: authoritative.width } : {}),
        ...(typeof authoritative.height === 'number' ? { height: authoritative.height } : {}),
        ...(typeof authoritative.name === 'string' && authoritative.name ? { name: authoritative.name } : {}),
      })
    }
    return refs
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

  /**
   * 模态能力矩阵单点（v3 §4.3.2 M5 / N-5，R-5 枚举化 + 方向语义）：
   * 默认映射（MODALITY_DEFAULT_MAP）+ capabilities 覆盖（枚举已知值按 agent
   * 类型的产出语义定方向；未知值兼容放行）。返回 { consume, produce }，
   * 每侧按 MODALITY_VALUES 规范序去重。
   */
  modalityOfAgent(agent) {
    const type = this.normalizeType(agent?.type)
    const base = MODALITY_DEFAULT_MAP[type] ?? MODALITY_DEFAULT_MAP.chat
    const { known } = normalizeCapabilities(agent?.capabilities)
    const consume = new Set(base.consume)
    const produce = new Set(base.produce)
    for (const cap of known) {
      if (type === 'chat' || type === 'agent') consume.add(cap)
      else if (type === 'cli') produce.add(cap)
    }
    return {
      consume: MODALITY_VALUES.filter((modality) => consume.has(modality)),
      produce: MODALITY_VALUES.filter((modality) => produce.has(modality)),
    }
  }

  /**
   * 模态 × 方向查询（v3 §4.3.2 M5 / R-6 目录泛化）：返回启用的、能力矩阵
   * 在该模态/方向上命中的 agent，按 id 排序。direction 非 'produce' 一律按
   * 'consume' 处理；未知模态 → 空列表（无 agent 命中）。
   */
  listAgentsByModality(modality, direction = 'consume') {
    const target = direction === 'produce' ? 'produce' : 'consume'
    const out = []
    for (const [id, agent] of this.listEnabledAgents()) {
      if (this.modalityOfAgent(agent)[target].includes(modality)) out.push([id, agent])
    }
    out.sort((a, b) => (a[0] < b[0] ? -1 : 1))
    return out
  }

  /**
   * 可接收图片输入的视觉识别类 agent（consume-image），按 id 排序。
   * 仅 chat / agent 类型可接收图片并返回文本分析；生图 agent 以 image 类型
   * （生成端点）或 cli 类型（生图 CLI 子代理，如 codex）出现，语义是"产出
   * 图片"（produce-image），必须排除——否则改写标记会把图片误交给生图 CLI、
   * 识别流程卡死（R8 事实）。Step 7 起为 listAgentsByModality 的薄包装。
   */
  listImageVisionAgents() {
    return this.listAgentsByModality('image', 'consume')
  }

  /**
   * 图片生成类 agent（图生图 / 文生图，produce-image），按 id 排序。
   * 生图 agent 以 image 类型（生成端点）或 cli 类型 + image 能力（生图 CLI
   * 子代理，如 codex）出现——它们接收图片作为编辑/参考输入，语义是"产出
   * 图片"。与 listImageVisionAgents（识别）并列：门控与改写标记需同时考虑
   * 两类，图生图走生图 agent。Step 7 起为 listAgentsByModality 的薄包装。
   */
  listImageGenerationAgents() {
    return this.listAgentsByModality('image', 'produce')
  }

  /**
   * 会话工作区记录（F11 上传目标解析，Step 8）：run() 每次执行携带
   * exec.agent.session（会话 header.cwd），记录最近一次执行的工作区。
   * 浏览器侧 router/uploadFile RPC 的 direct invocation 不携带会话上下文
   * （宿主网关 exact-arguments 断言只放行 request 字段），落盘目标以此为准。
   */
  rememberWorkspace(session) {
    const cwd = typeof session?.header?.cwd === 'string' && session.header.cwd ? session.header.cwd : ''
    if (!cwd) return
    const sessionId = typeof session?.sid === 'string' && session.sid ? session.sid : (typeof session?.id === 'string' && session.id ? session.id : '')
    this.lastWorkspace = { sessionId, cwd, at: Date.now() }
  }

  /**
   * router/uploadFile（v3 §4.4.2 / §5.5 输入段 / N-6，F11 输入入口）：
   * 客户端音频/视频/文档字节上传 → 工作区落盘 + M2 注册。浏览器无法直写
   * 文件系统，字节经 RPC 上传。校验序列（§4.3.5）：
   * ① base64 解码（非法 → INVALID_BASE64）→ ② 图片魔数拒绝
   *   （UNSUPPORTED_MEDIA——uploadFile 不接管图片，图片走宿主 addImages
   *   原通道，避免双通道）→ ③ 大小 ≤25MB（FILE_TOO_LARGE，§4.3.5 上限）
   *   → ④ 文件名消毒写 .router-files/<sanitized-name>（UPLOAD_FAILED；同名
   *   碰撞 O_EXCL 写 + `-<n>` 去重后缀，绝不静默覆盖，F-02）→
   *   ⑤ M2 registerPath 注册（非图片 = 字节哈希内容寻址 id + workspacePath
   *   物理载体）→ 返回 { ok:true, path, attachmentId?, name }。
   * 落盘目标工作区经 rememberWorkspace 记录（见其注释）；无记录时返回
   * WORKSPACE_UNAVAILABLE 明确报错（可用性黑洞消除，§5.1 解析失败明确报错
   * 姿态）。
   */
  async uploadFile(request) {
    const name = typeof request?.name === 'string' ? request.name.trim() : ''
    const mediaType = typeof request?.mediaType === 'string' ? request.mediaType.trim() : ''
    const dataBase64 = typeof request?.dataBase64 === 'string' ? request.dataBase64 : ''
    if (!name || !dataBase64) return { ok: false, message: '缺少文件名称或数据', code: 'INVALID_REQUEST' }
    // F-04：解码前大小粗筛——base64 长度上限 ≈ ceil(25MB * 4/3) + padding
    // 余量；wire codec 无大小上限（R7 F-03），超大 payload 先全额解码再拒是
    // 浪费（纵深加固；合法 ≤25MB 文件必低于该阈值，无误伤）。
    if (dataBase64.length > Math.ceil(URL_FILE_MAX_BYTES * 4 / 3) + 16) {
      return { ok: false, message: '文件超过大小上限（数据载荷过大，>25MB）', code: ATTACHMENT_ERROR_CODES.FILE_TOO_LARGE }
    }
    let bytes
    try {
      bytes = decodeBase64(dataBase64)
    } catch {
      return { ok: false, message: '文件数据不是合法的 base64', code: 'INVALID_BASE64' }
    }
    if (detectImageMediaType(bytes)) {
      return { ok: false, message: '图片附件请走原生图片通道（addImages），uploadFile 仅接收音频/视频/文档', code: ATTACHMENT_ERROR_CODES.UNSUPPORTED_MEDIA }
    }
    if (bytes.length > URL_FILE_MAX_BYTES) {
      return { ok: false, message: `文件超过大小上限（${bytes.length} 字节 > 25MB）`, code: ATTACHMENT_ERROR_CODES.FILE_TOO_LARGE }
    }
    const workspace = this.lastWorkspace
    const cwd = workspace && typeof workspace.cwd === 'string' && workspace.cwd ? workspace.cwd : ''
    if (!cwd) return { ok: false, message: '无法确定会话工作目录：当前没有可用的会话工作区', code: 'WORKSPACE_UNAVAILABLE' }
    const dir = join(cwd, '.router-files')
    try {
      mkdirSync(dir, { recursive: true })
    } catch (error) {
      return { ok: false, message: `无法创建工作区上传目录 ${dir}：${errorMessage(error)}`, code: ATTACHMENT_ERROR_CODES.UPLOAD_FAILED }
    }
    // 文件名消毒沿用既有惯例（downloadToWorkspace L270 同款字符集
    // [A-Za-z0-9._-]，防目录穿越；消毒为空时时间戳兜底）。
    const fileName = name.replace(/[^A-Za-z0-9._-]/g, '_') || `upload-${Date.now().toString(36)}`
    // F-02：同名碰撞（消毒映射同源如 `a b.wav`/`a_b.wav`，或同工作区重名文件
    // 二次上传）绝不静默覆盖——O_EXCL 写 + EEXIST 冲突追加 `-<n>` 去重后缀
    // 重试（防并发 TOCTOU；内容寻址承诺 id↔bytes 完整性，§5.1 / D-1-4）。
    let target = join(dir, fileName)
    let writtenName = fileName
    for (let attempt = 1; ; attempt++) {
      try {
        writeFileSync(target, bytes, { flag: 'wx' })
        break
      } catch (error) {
        if (error && (error.code === 'EEXIST' || /EEXIST|already exists/i.test(errorMessage(error)))) {
          writtenName = `${fileName}-${attempt}`
          target = join(dir, writtenName)
          continue
        }
        return { ok: false, message: `附件落盘失败（${target}）：${errorMessage(error)}`, code: ATTACHMENT_ERROR_CODES.UPLOAD_FAILED }
      }
    }
    // M2 注册：registerPath 对非图片返回字节哈希内容寻址 id + workspacePath
    // 物理载体条目（§5.1 三向映射；图片魔数已在上方拒绝，不会走到 saveImage）。
    let entry
    try {
      entry = await this.registry.registerPath(target, { cwd })
    } catch (error) {
      return { ok: false, message: `附件注册失败：${errorMessage(error)}`, code: typeof error?.code === 'string' ? error.code : ATTACHMENT_ERROR_CODES.UPLOAD_FAILED }
    }
    return {
      ok: true,
      path: entry && typeof entry.workspacePath === 'string' && entry.workspacePath ? entry.workspacePath : target,
      ...(entry && isAttachmentId(entry.id) ? { attachmentId: entry.id } : {}),
      name: writtenName,
    }
  }

  /**
   * router/readWorkspaceFile（v3 §4.3.5 / §5 展示段 L3 / N-7，Step 9）：
   * L3「打开文件」预览——audio/video 播放器、doc 下载。浏览器无法直读文件
   * 系统，字节经 RPC 读取。校验序列（§4.3.5）：
   * ① path 非空（INVALID_REQUEST）→ ② 词法工作区边界校验
   *   （PATH_OUTSIDE_WORKSPACE：`..`/绝对路径规范化后必须仍在工作区内——
   *   纵深校验，宿主沙箱对读不设包含约束，读面边界由本服务自守）→
   *   ③ fs.resolve + realpath 二次包含校验（PATH_OUTSIDE_WORKSPACE：宿主
   *   resolve 的 targetKey = realpath(displayPath)（dsh-fs-local 跟随符号链接/
   *   NTFS 联接），stat/readBytes 全部经 targetKey 操作——词法通过但 realpath
   *   逃逸（工作区内链接指向工作区外文件）必须拒绝；优先宿主 fs.contains
   *   （targetKey 包含判定），后备词法 pathRelative 复核）→
   *   ④ fs.stat 校验（FILE_NOT_FOUND；目录拒绝）→ ⑤ 大小 ≤25MB
   *   （FILE_TOO_LARGE，§4.3.5 上限，读前 stat 判定 + 读时宿主 FS_TOO_LARGE
   *   兜底）→ ⑥ fs.readBytes 读字节 → 返回 { ok:true, dataBase64, mediaType?,
   *   name }（mediaType 魔数嗅探 + 扩展名兜底，V-DSH-4）。
   * 工作区来源同 uploadFile（rememberWorkspace——一致限制声明）：浏览器 RPC
   * 的 direct invocation 不携带会话上下文，目标工作区取最近一次 run() 记录
   * 的会话 cwd；无记录 → WORKSPACE_UNAVAILABLE 明确报错。
   */
  async readWorkspaceFile(request) {
    const raw = typeof request?.path === 'string' ? request.path.trim() : ''
    if (!raw) return { ok: false, message: '缺少文件路径', code: 'INVALID_REQUEST' }
    const fs = this.ctx.get('fs')
    if (!fs || typeof fs.resolve !== 'function' || typeof fs.stat !== 'function' || typeof fs.readBytes !== 'function') {
      return { ok: false, message: '文件服务不可用', code: 'SERVICE_UNAVAILABLE' }
    }
    const workspace = this.lastWorkspace
    const cwd = workspace && typeof workspace.cwd === 'string' && workspace.cwd ? workspace.cwd : ''
    if (!cwd) return { ok: false, message: '无法确定会话工作目录：当前没有可用的会话工作区', code: 'WORKSPACE_UNAVAILABLE' }
    // 工作区边界校验（纵深，§4.3.5 PATH_OUTSIDE_WORKSPACE）：规范化后必须
    // 仍在工作区内——`..` 逃逸与工作区外绝对路径一律拒绝（路径逃逸是 L3
    // 读面的首要攻击面：浏览器侧可构造任意 path 请求）。
    const normalized = pathIsAbsolute(raw) ? pathResolve(raw) : pathResolve(cwd, raw)
    const rel = pathRelative(cwd, normalized)
    if (rel === '..' || rel.startsWith(`..${pathSep}`) || pathIsAbsolute(rel)) {
      return { ok: false, message: `文件路径超出会话工作区（${raw}）`, code: ATTACHMENT_ERROR_CODES.PATH_OUTSIDE_WORKSPACE }
    }
    let target
    try {
      target = await fs.resolve(raw, { cwd })
    } catch (error) {
      return { ok: false, message: `无法解析文件路径 "${raw}"：${errorMessage(error)}`, code: ATTACHMENT_ERROR_CODES.PATH_OUTSIDE_WORKSPACE }
    }
    const displayPath = typeof target?.displayPath === 'string' && target.displayPath ? target.displayPath : normalized
    // realpath 二次包含校验（F-1 R12：符号链接/联接逃逸——词法判定不覆盖
    // 解析后真实路径）：宿主 fs.resolve 的 targetKey = realpath(displayPath)
    // （dsh-fs-local 跟随符号链接与 NTFS 联接），stat/readBytes 全部经
    // targetKey 操作；宿主沙箱仅约束写面（writeText/editText），读面无包含
    // 拦截——工作区内符号链接可指向工作区外文件。故解析工作区根的 realpath
    // targetKey，与目标 targetKey 复核包含关系（优先宿主 fs.contains，后备
    // 词法 pathRelative 判定）；realpath 逃逸 → PATH_OUTSIDE_WORKSPACE
    // （fail-closed）。
    let workspaceTarget
    try {
      workspaceTarget = await fs.resolve(cwd)
    } catch (error) {
      return { ok: false, message: `无法解析会话工作区（${cwd}）：${errorMessage(error)}`, code: ATTACHMENT_ERROR_CODES.PATH_OUTSIDE_WORKSPACE }
    }
    const workspaceKey = workspaceTarget && typeof workspaceTarget.targetKey === 'string' && workspaceTarget.targetKey
      ? workspaceTarget.targetKey
      : (workspaceTarget && typeof workspaceTarget.displayPath === 'string' && workspaceTarget.displayPath ? workspaceTarget.displayPath : cwd)
    const targetKey = target && typeof target.targetKey === 'string' && target.targetKey
      ? target.targetKey
      : (target && typeof target.displayPath === 'string' && target.displayPath ? target.displayPath : normalized)
    const contained = typeof fs.contains === 'function'
      ? Boolean(await fs.contains(workspaceTarget, target))
      : isPathContained(workspaceKey, targetKey)
    if (!contained) {
      return { ok: false, message: `文件路径超出会话工作区（${raw}——解析后真实路径越界，可能经符号链接/联接指向工作区外）`, code: ATTACHMENT_ERROR_CODES.PATH_OUTSIDE_WORKSPACE }
    }
    let info
    try {
      info = await fs.stat(target)
    } catch (error) {
      return { ok: false, message: `无法读取文件状态 "${displayPath}"：${errorMessage(error)}`, code: ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND }
    }
    if (info === undefined) return { ok: false, message: `文件路径 "${displayPath}" 不存在或不可访问（会话工作区：${cwd}）`, code: ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND }
    if (info.type === 'directory') return { ok: false, message: `目录不可作为文件预览（${displayPath}）`, code: ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND }
    // 读前大小判定（§4.3.5 上限 ≤25MB）：stat 已带 size 时不浪费读。
    if (typeof info.size === 'number' && info.size > URL_FILE_MAX_BYTES) {
      return { ok: false, message: `文件超过大小上限（${info.size} 字节 > 25MB）`, code: ATTACHMENT_ERROR_CODES.FILE_TOO_LARGE }
    }
    let bytes
    try {
      bytes = await fs.readBytes(target, undefined, URL_FILE_MAX_BYTES)
    } catch (error) {
      // 宿主 readBytes 上限兜底（dsh-fs-local FS_TOO_LARGE）：统一 FILE_TOO_LARGE。
      if (error && (error.code === 'FS_TOO_LARGE' || /too large|exceeds|超过大小上限/i.test(errorMessage(error)))) {
        return { ok: false, message: '文件超过大小上限（>25MB）', code: ATTACHMENT_ERROR_CODES.FILE_TOO_LARGE }
      }
      return { ok: false, message: `文件读取失败（${displayPath}）：${errorMessage(error)}`, code: 'READ_FAILED' }
    }
    const mediaType = detectAudioVideoMediaType(bytes) ?? (EXT_MEDIA_TYPES[extname(displayPath).toLowerCase()] ?? undefined)
    return {
      ok: true,
      dataBase64: Buffer.from(bytes).toString('base64'),
      ...(mediaType ? { mediaType } : {}),
      name: basename(displayPath),
    }
  }

  /**
   * router/imageData：按完整附件引用读取图片字节（base64）。引用由标记
   * 或工具结果携带；attachmentId 内容寻址且 readImage 校验完整元数据，
   * 不构成未授权读取面。只读，不触碰任何状态。
   */
  async imageData(request) {
    const ref = request?.ref
    if (!ref || typeof ref !== 'object' || typeof ref.attachmentId !== 'string' || !ref.attachmentId) {
      return { ok: false, message: '缺少附件引用', code: 'INVALID_ATTACHMENT_REF' }
    }
    // FIX-007 F-1/F-3：读取经 M2 完整 ref 单点（宿主元数据严格校验下裸 id /
    // 畸形 ref 恒拒 ATTACHMENT_CORRUPT）。请求携带的 ref 优先（标记往返的完整
    // ref 可直接命中宿主校验）；失败或字段缺失时经注册表自取证降级取宿主权威
    // 字节（对象文件 → 探测 → 完整 ref 重试 → 哈希兜底），不再让宿主侧拒绝
    // 直接击穿整链。
    let stored = null
    const id = ref.attachmentId
    const attachments = this.ctx.get('attachments')
    if (!attachments || typeof attachments.readImage !== 'function') return { ok: false, message: '附件服务不可用', code: 'SERVICE_UNAVAILABLE' }
    // FIX-007 F-4：宿主读取耗时埋点（P8 可观测——变慢归因：宿主归一化/校验
    // vs 端点重试链）。>200ms 记诊断事件（阈值内视为正常路径零噪声）。
    const readStartedAt = Date.now()
    try {
      stored = await attachments.readImage(ref)
    } catch {
      stored = null
    }
    if (stored && stored.data) {
      const readMs = Date.now() - readStartedAt
      if (readMs > 200) this.recordCapabilityEvent('attachment_read_slow', { id: String(id).slice(0, 15), ms: readMs })
    }
    if (!stored || !stored.data) {
      if (!isAttachmentId(id)) return { ok: false, message: '附件 id 非内容寻址格式', code: 'INVALID_ATTACHMENT_ID' }
      try {
        stored = await this.registry.readStoredImage(id)
      } catch {
        stored = null
      }
      if (!stored || !stored.data) return { ok: false, message: '图片读取失败：未注册且宿主无法读取', code: 'ATTACHMENT_UNKNOWN' }
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

  /**
   * preset 账号的凭据存储实例（roadmap §3.3 / §3.4 条目 2）：路径经
   * resolveCredentialPath 解析（account.credentialFile 非空用之，否则凭据
   * 模块默认路径），按路径缓存实例——同路径复用同实例，锁所有权 token
   * 保持稳定（BC-E6 ③ 多实例场景）。
   */
  credentialStoreFor(account) {
    const path = resolveCredentialPath(account)
    let store = this.oauthCredentialStores.get(path)
    if (!store) {
      store = new OauthCredentialStore(path)
      this.oauthCredentialStores.set(path, store)
    }
    return store
  }

  /**
   * preset 账号 → 刷新后的完整凭据对象（含 accountId，H3-7）。Step 5 从
   * resolveOauthToken 的 preset 分支抽出：codex-responses 协议分支需要
   * accountId 构造 chatgpt-account-id 请求头，单次 read+ensureFresh 同时
   * 供给 access 与 accountId（E3-a：两种凭据形态在此分流，§3.4 条目 5）。
   *
   * 入口即 §3.6 第③层 kill-switch 调用期检查（R5-F1，Step 5 必闭）：
   * oauthExperimental=false 时明确报"实验通路已关闭"——不读凭据文件、
   * 不发刷新请求（网络调用不得越过开关）；单点覆盖 runOauthChat 与
   * oauthDiscover 两个消费方。校验序与 oauthBeginPreset 同构（未知
   * preset → kill-switch → 资源触碰）。
   */
  async resolvePresetCredential(account) {
    const preset = typeof account?.preset === 'string' && account.preset.trim() ? account.preset.trim() : ''
    if (!OAUTH_PRESET_VALUES.includes(preset)) {
      throw new Error(`未知预设类型（preset="${preset}"）；支持的预设：${OAUTH_PRESET_VALUES.join('、')}`)
    }
    if (this.getState().oauthExperimental !== true) {
      throw new Error('ChatGPT 实验通路已关闭（router.oauthExperimental）；如需使用请在设置中开启实验开关')
    }
    const store = this.credentialStoreFor(account)
    const cred = await store.read()
    if (!cred) throw new Error('该 ChatGPT 预设账号尚未登录（无凭据文件）；请先在账号卡片完成授权')
    try {
      return await store.ensureFresh(cred)
    } catch (error) {
      if (error && error.code === CREDENTIAL_ERROR_CODES.REFRESH_FAILED) {
        // C-9 埋点：刷新终态失败（需重登）是登录旅程的关键失败形态。
        this.recordOauthEvent('preset_refresh_fail', {})
        // 文案对齐既有 401 重登语义；timedOut/status 元数据原样转发
        //（R4 转发语义：timedOut=瞬时域、status=HTTP 终态域，不吞掉）。
        const wrapped = new Error(`ChatGPT access token 刷新失败（${errorMessage(error)}）；请在账号卡片中重新登录`)
        wrapped.code = error.code
        if (typeof error.status === 'number') wrapped.status = error.status
        if (error.timedOut === true) wrapped.timedOut = true
        throw wrapped
      }
      throw error
    }
  }

  /**
   * 解析 OAuth 账号的 access token。preset 账号（如 chatgpt-codex）走凭据
   * 模块（独立文件四元组 + ensureFresh 临期自动刷新，§3.4 条目 5）；通用
   * 账号走 credentials seam → 环境变量后备（现状不变，P3）。
   */
  async resolveOauthToken(account) {
    const preset = typeof account?.preset === 'string' && account.preset.trim() ? account.preset.trim() : ''
    if (preset) return (await this.resolvePresetCredential(account)).access
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
   * §3.5 Q2 runOauth 调度接口（EVO-002 Step 6）：run() 的 oauth/pool 分支
   * 收敛单点，内部按 `protocol × type` 派发——v0.3.0 实现全部协议 × chat
   * （现状行为）；image/speech 等类型经 oauthCapabilities 判定后给出
   * per-protocol 明确错误（"该协议暂不支持此类型"，替代全局一刀切——后续
   * 版本扩展能力表即解开，调用点零改动）。池模式按候选账号集语义展示
   * 'account-pool'（池内逐账号派发沿用 runPooledOauthChat 既有循环）。
   */
  async runOauthDispatch(resolved, input) {
    const type = this.normalizeType(resolved.agent.type)
    const protocol = resolved.mode === 'oauth'
      ? (['openai-completions', 'anthropic', 'gemini', 'codex-responses'].includes(resolved.account.protocol) ? resolved.account.protocol : 'openai-completions')
      : 'account-pool'
    const capabilities = oauthCapabilities(protocol)
    if (!capabilities.includes(type)) {
      throw new Error(`OAuth 通路（${protocol}）暂不支持 ${type} 类型调用；当前支持：${capabilities.join('、')}（per-protocol 能力接口，后续版本按协议扩展）`)
    }
    return resolved.mode === 'pool' ? this.runPooledOauthChat(resolved, input) : this.runOauthChat(resolved, input)
  }

  /**
   * C-9 埋点（EVO-002 Step 6）：记录 OAuth 登录旅程事件。kind ∈
   * preset_begin_ok/preset_begin_fail/preset_login_ok/preset_login_fail/
   * preset_logout/preset_logout_fail/preset_refresh_fail（EVO-002）与
   * preset_device_begin/preset_device_login_ok/preset_device_login_fail/
   * preset_device_cancelled（EVO-005 设备码降级通道，F-4 / REL-003 补录）；
   * detail 仅携带 accountId/reason 等非敏感字段（P7：永不携带 token 值）。
   * 环形缓冲上限 100 条（弃最旧）。
   */
  recordOauthEvent(kind, detail = {}) {
    this.oauthEvents.unshift({ at: Date.now(), kind, ...detail })
    if (this.oauthEvents.length > 100) this.oauthEvents.length = 100
  }

  /**
   * P8 能力判定诊断事件记录（FIX-004）：kind ∈
   * image_precheck_self_certified（宿主声明 text-only/缺失、适配器自证确认放行）
   * / image_precheck_reject（预检失败安全回落拒绝）。detail 仅携带 provider /
   * model / hostModalities / hostAvailable 等判定上下文（P7）。环形缓冲上限
   * 100 条（弃最旧）；同时尽力写宿主日志（可观测，测试桩无 logger 时静默）。
   */
  recordCapabilityEvent(kind, detail = {}) {
    this.capabilityEvents.unshift({ at: Date.now(), kind, ...detail })
    if (this.capabilityEvents.length > 100) this.capabilityEvents.length = 100
    const label = `dsh-agent-router: capability ${kind}`
    const context = (detail.provider || detail.model) ? ` (${detail.provider ?? ''}/${detail.model ?? ''})` : ''
    try { this.ctx.logger?.warn?.(`${label}${context}`) } catch { /* 日志不可用不阻断 */ }
  }

  /**
   * OAuth 账号的 chat 直连调用（不经 llm 注册表，绝不出现在共享模型列表）。
   * 协议：openai-completions / anthropic / gemini / codex-responses。第 4 分支
   * codex-responses（E5）派发至 runCodexResponsesChat——ChatGPT 订阅 preset
   * 账号经 chatgpt.com/backend-api/codex/responses 的 SSE 事件链聚合（EV-028
   * P3 实证 stream:false 被拒，SSE 为唯一路径）；其余协议走既有 JSON 端点
   * 分支（现状不变，P3）。
   */
  async runOauthChat(resolved, input) {
    const account = resolved.account
    const protocol = ['openai-completions', 'anthropic', 'gemini', 'codex-responses'].includes(account.protocol) ? account.protocol : 'openai-completions'
    if (protocol === 'codex-responses') return this.runCodexResponsesChat(resolved, input)
    const token = await this.resolveOauthToken(account)
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

  /**
   * codex-responses 协议分支（E5 / EV-028，Step 5）：ChatGPT 订阅 preset 账号
   * 的 chat 直连——POST codex/responses（stream:true 强制：EV-028 P5 实证
   * stream:false 被拒"Stream must be set to true"，SSE 聚合为唯一路径）。
   * 请求构造对齐 H3-8/H3-9（Bearer + chatgpt-account-id + originator 诚实
   * 自标识 + SSE beta 头）；错误处理对齐 H3-14（401/403 重登、
   * 429/usage_limit_* 解析 resets_at 分钟数）；事件聚合对齐 H3-10/EV-028
   * 十二事件链（output_text.delta 拼接兜底、output_item.done 槽位文本为准、
   * completed/incomplete 终态取 usage、failed/error 事件抛错、未见终态视为
   * 截断）。与既有三协议分支同构：同样的任务文本组装与返回形状
   * { kind, text, images?, usage }；仅 preset 账号可用（accountId 随四元组
   * 凭据供给，H3-7）。
   */
  async runCodexResponsesChat(resolved, input) {
    const account = resolved.account
    const preset = typeof account.preset === 'string' && account.preset.trim() ? account.preset.trim() : ''
    if (!preset) {
      throw new Error('codex-responses 协议仅支持 ChatGPT 预设账号（preset 凭据四元组含 accountId，H3-7）；请在账号卡片使用 ChatGPT 预设登录')
    }
    const cred = await this.resolvePresetCredential(account)
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
    const url = resolveCodexResponsesUrl(account.baseURL)
    const platform = globalThis.process?.platform ?? 'unknown'
    const arch = globalThis.process?.arch ?? 'unknown'
    // H3-9：Bearer + chatgpt-account-id（H3-7，凭据四元组）+ originator 诚实
    // 自标识（E5 / V-EVO-2c：'dsh-agent-router' 实证被接受，不伪装 codex_cli）
    // + SSE 双头（OpenAI-Beta / accept）+ 诚实 User-Agent。
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cred.access}`,
      'chatgpt-account-id': cred.accountId,
      originator: 'dsh-agent-router',
      accept: 'text/event-stream',
      'OpenAI-Beta': 'responses=experimental',
      'User-Agent': `dsh-agent-router (${platform} ${arch})`,
    }
    // H3-8 请求体（E5）：stream:true 强制；input 为 Responses 内容块形态
    //（input_text + 带图时 input_image 追加）；include 携带加密推理内容。
    const body = {
      model: resolved.model,
      store: false,
      stream: true,
      ...(system ? { instructions: system } : {}),
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text },
          ...images.map((image) => ({ type: 'input_image', image_url: image.dataUrl })),
        ],
      }],
      include: ['reasoning.encrypted_content'],
      ...(maxTokens !== undefined ? { max_output_tokens: maxTokens } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
    }
    let response
    try {
      // EVO-002 Step 6 代理发现接线：仅 chatgpt.com 目标经代理（auth.openai.com
      // 直连可达——EV-028 实证，永不经代理）；无配置且无环境代理 → 直连
      // 零变化（不设 dispatcher 键）。undici 不可用 → 明确报错（fail-loud，
      // 含代理来源与指引——不静默降级为直连失败）。
      const init = {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        ...(input.signal ? { signal: input.signal } : {}),
      }
      const proxy = resolveOauthProxy(this.getState())
      if (proxy.proxyUrl && String(url).includes('chatgpt.com')) {
        init.dispatcher = await this.loadOauthProxyDispatcher(proxy)
      }
      response = await globalThis.fetch(url, init)
    } catch (error) {
      if (error && typeof error.message === 'string' && error.message.includes('undici 代理支持')) throw error
      throw new Error(`OAuth 账号 "${resolved.accountId}" 端点不可达（${url}）：${errorMessage(error)}`)
    }
    if (!response.ok) {
      // H3-14：401/403 → 重登；429/usage_limit_* → 解析 resets_at（unix 秒）
      // 给出剩余分钟数；其余透传 status 与 error.message（detail 截断 400 字符）。
      const raw = await response.text().catch(() => '')
      let err = null
      try { err = JSON.parse(raw)?.error ?? null } catch { /* 非 JSON 错误体按原文 */ }
      const code = typeof err?.code === 'string' ? err.code : ''
      let detail = raw
      if (err && (typeof err.message === 'string' || code)) detail = err.message || code
      detail = String(detail).slice(0, 400)
      if (response.status === 401 || response.status === 403) {
        throw new Error(`OAuth access token 无效或已过期（HTTP ${response.status}）${detail ? `：${detail}` : ''}；请在账号卡片中重新登录`)
      }
      if (response.status === 429 || /usage_limit_reached|usage_not_included|rate_limit_exceeded/i.test(code)) {
        let when = ''
        if (typeof err?.resets_at === 'number' && Number.isFinite(err.resets_at)) {
          const minutes = Math.max(0, Math.round((err.resets_at * 1000 - Date.now()) / 60000))
          when = `；约 ${minutes} 分钟后重置`
        }
        const plan = typeof err?.plan_type === 'string' && err.plan_type ? `，${err.plan_type} plan` : ''
        throw new Error(`ChatGPT 用量限制（HTTP 429${plan}）${detail ? `：${detail}` : ''}${when}`)
      }
      throw new Error(`OAuth 调用失败 HTTP ${response.status}${detail ? `：${detail}` : ''}`)
    }
    // SSE 聚合（H3-10 / EV-028 十二事件链）：delta 拼接兜底 + output_item.done
    // 槽位文本为准（pi-ai 同款替换语义）；终态事件取 usage 后停止消费；未见
    // 终态视为流截断（单轮任务调用必须拿到完整响应）。
    let deltaText = ''
    const itemTexts = []
    let usage
    let sawTerminal = false
    for await (const event of parseSseEvents(response.body, input.signal)) {
      const type = typeof event?.type === 'string' ? event.type : ''
      if (type === 'response.output_text.delta') {
        if (typeof event.delta === 'string') deltaText += event.delta
      } else if (type === 'response.output_item.done') {
        const item = event.item
        if (item && item.type === 'message' && Array.isArray(item.content)) {
          const itemText = item.content
            .map((part) => (part?.type === 'output_text' && typeof part.text === 'string' ? part.text : (typeof part?.refusal === 'string' ? part.refusal : '')))
            .join('')
          const index = Number.isInteger(event.output_index) && event.output_index >= 0 ? event.output_index : itemTexts.length
          itemTexts[index] = itemText
        }
      } else if (type === 'response.completed' || type === 'response.incomplete' || type === 'response.done') {
        sawTerminal = true
        const terminal = event.response
        if (terminal && typeof terminal.usage === 'object' && terminal.usage) {
          usage = { inputTokens: terminal.usage.input_tokens ?? 0, outputTokens: terminal.usage.output_tokens ?? 0 }
        }
        break
      } else if (type === 'response.failed') {
        const failure = event.response?.error
        const failCode = typeof failure?.code === 'string' ? failure.code : ''
        const failMessage = typeof failure?.message === 'string' ? failure.message : ''
        throw new Error(`ChatGPT 调用失败（response.failed${failCode ? `：${failCode}` : ''}）${failMessage ? `：${failMessage}` : ''}`)
      } else if (type === 'error') {
        const nested = event.error && typeof event.error === 'object' ? event.error : {}
        const errorCode = typeof event.code === 'string' ? event.code : (typeof nested.code === 'string' ? nested.code : '')
        const eventMessage = typeof event.message === 'string' ? event.message : (typeof nested.message === 'string' ? nested.message : '')
        throw new Error(`ChatGPT SSE 错误事件${errorCode ? `（${errorCode}）` : ''}${eventMessage ? `：${eventMessage}` : ''}`)
      }
    }
    if (!sawTerminal) throw new Error('ChatGPT SSE 流未返回终态事件（response.completed）——响应可能被截断')
    const output = (itemTexts.filter((part) => typeof part === 'string' && part).join('\n') || deltaText).trim()
    if (!output) throw new Error('OAuth 调用返回中没有文本内容')
    return { kind: 'chat', text: output, ...(imageRefs.length > 0 ? { images: imageRefs } : {}), usage }
  }

  // ── 统计（C-3 / §4.4 委托迁移：聚合与持久化归 lib/stats.js）───────────────

  /** 账号（服务商）级聚合读视图：Map 归属 StatsStore（白盒读取兼容面）。 */
  get accountTotals() {
    return this.stats.accountTotals
  }

  /**
   * 记录一次调用结果（service.js record 迁移语义，§4.4 委托）：同步、微秒级、
   * 永不反压调用路径（E7-a）、永不 throw（F2——store 内聚吞错）。record：
   * { agentId, provider, model, ok, ms, inputTokens?, outputTokens?, error?,
   * errorClass?, usageCost?, at? }；agent 显示名经构造期注入的 getAgentName
   * 迁移缝解析（this.getAgent 语义保持）。
   */
  record(record) {
    this.stats.record(record)
  }

  /**
   * 统计快照（RPC stats 使用）：ok/enabled 包装留在接线层（R1 F12 备忘——
   * RPC 语义归 service），聚合形状（totals/recent/series/accountTotals/
   * accountSeries）+ 增量字段（days 按天聚合 / selfReport 自诊断）由
   * stats.snapshot() 提供（R1 核验逐字段等价）。
   */
  statsSnapshot() {
    return { ok: true, enabled: this.isEnabled(), ...this.stats.snapshot() }
  }

  /**
   * 清空统计（§4.2 软删除默认：stats/ → stats-backup-\<ts\>/，可手工恢复；
   * hardDelete 语义与 persist=false 纯内存清零由 store 承载——W-4 IBC-1 ②）。
   * 内存清零在首个 await 前同步完成（未 flush 时全程同步——RPC 即时可见）。
   */
  async resetStats() {
    await this.stats.reset()
  }

  /** router/statsExport：CSV 导出（§4.3 {range:'7d'|'30d'|'90d',
   *  level:'agent'|'account'} → CSV 文本，11 列；不落工作区文件）。非法
   *  range/level 返回 ok:false + 明确文案（与 cliModels 先例同构）。 */
  statsExport(request = {}) {
    try {
      const csv = this.stats.export({ range: request.range, level: request.level })
      return { ok: true, message: `已导出 ${csv.split('\n').length - 1} 行`, csv }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  }

  /**
   * C-3 统计持久化设置同步（W-4，index.js 组合根在启动与 settings/updated
   * 时调用）：读 settings `router.stats.persist`（缺省 true）并应用到
   * stats store。翻转的往返语义由 store.setPersist 承载（开→关先 flush
   * 不丢已记录事件；关→开空内存全量恢复磁盘聚合 + 重建索引）。幂等、
   * fire-and-forget（开关热生效，不阻塞调用方）。
   */
  applyStatsSettings() {
    const statsConfig = this.getState().stats
    const persist = !(statsConfig && statsConfig.persist === false)
    void this.stats.setPersist(persist).catch(() => { /* 开关应用失败不击穿宿主事件流 */ })
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
      '- agent 类型专业 agent 可读写工作区任意文件：在 `task` 里写明文件路径（相对/绝对均可），产物写入工作区并在结果中报告路径。',
      '- `files`：工作区文件路径或 http(s) URL 列表（一次可传多个不同类型）。chat 类型按内容能力化分发：图片文件内联注入（要求该 agent 声明 image 能力）、文本文件内联进 task、其余二进制需 agent 类型；agent 类型把路径注入子代理由其用 fs 工具自行读取；URL 由宿主下载到工作区 .router-files/ 后按同样规则分发。',
      '- 未配置模型的 agent 自动复用主 agent 当前模型。',
      '- 当前轮图片若已由主模型原生查看，普通看图无需调用 `route_agent`；仅专业深度分析、跨轮旧图再查（附件 id 来自记忆段或图片标记）或用户显式要求的图像任务才路由。',
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
        // v3 Step 7（§4.3.2 ModalityCapability）：模态能力（方向语义 wire 面）。
        modalities: this.modalityOfAgent(agent),
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
      // FIX-002：客户端会话级接管（client.js ModelTakeover）的开关镜像——
      // 与服务端 wrapper 默认模型接管同源（router.takeoverDefaultModel）。
      takeoverDefaultModel: this.getState().takeoverDefaultModel === true,
      defaults: { provider: defaults.provider, model: defaults.model, ...(defaults.reasoningEffort ? { reasoningEffort: defaults.reasoningEffort } : {}) },
      agents,
      oauthAccounts: (await Promise.all(Object.entries(this.getState().oauthAccounts ?? {}).map(async ([id, account]) => {
        const preset = typeof account.preset === 'string' && account.preset.trim() ? account.preset.trim() : ''
        return {
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
          // EVO-002 Step 6：preset 镜像 + 登录态（账号卡专属渲染与一键授权
          // 轮询数据源；文件读取失败按未登录展示——诊断不抛错）。
          preset,
          ...(OAUTH_PRESET_VALUES.includes(preset) ? { presetLoggedIn: await this.presetLoggedInOf(account) } : {}),
        }
      }))).sort((a, b) => (a.id < b.id ? -1 : 1)),
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
   * 改用内置公开 Client 与固定回调 http://localhost:8085/（零配置）；
   * preset 账号（chatgpt-codex）分流至 oauthBeginPreset（§3.4 条目 1）。
   */
  async oauthBegin(request) {
    const id = String(request?.accountId ?? '')
    const account = this.getOAuthAccount(id)
    if (!account) return { ok: false, message: `OAuth 账号 "${id}" 不存在` }
    const preset = typeof account.preset === 'string' && account.preset.trim() ? account.preset.trim() : ''
    if (preset) return this.oauthBeginPreset(id, preset)
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
   * oauthBegin 的 preset 账号分支（roadmap §3.4 条目 1 / §3.2 E2-a /
   * ADR-005）：authUrl/tokenUrl/clientId/scope/redirectUri 全部取
   * CHATGPT_PRESET 常量（preset 语义 = 零配置，账号内同名字段忽略）；
   * 合规 kill-switch（§3.6 第③层 router.oauthExperimental，默认关闭）；
   * 1455 惰性 loopback 经 codexLoopbackStarter 就绪检查（E4 降级链入口，
   * 未就绪明确报错）。PKCE/state 生成与 oauthPending 会话（10 分钟过期）
   * 复用通用路径同款机制；authorize URL 附加参数对齐 H3-4 先例（pi-ai
   * 同款）：originator 必带（E5 诚实自标识）+ id_token_add_organizations /
   * codex_cli_simplified_flow。
   */
  async oauthBeginPreset(id, preset) {
    if (!OAUTH_PRESET_VALUES.includes(preset)) {
      this.recordOauthEvent('preset_begin_fail', { accountId: id, reason: 'unknown_preset' })
      return { ok: false, message: `未知预设类型（preset="${preset}"）；支持的预设：${OAUTH_PRESET_VALUES.join('、')}` }
    }
    if (this.getState().oauthExperimental !== true) {
      this.recordOauthEvent('preset_begin_fail', { accountId: id, reason: 'kill_switch' })
      return { ok: false, message: 'ChatGPT 实验通路已关闭（router.oauthExperimental）；如需使用请在设置中开启实验开关' }
    }
    // §3.6 显式开启确认（EVO-002 Step 6 ToS 门）：experimental 检查之后、
    // loopback 就绪检查之前——手改配置绕过客户端 ToS 弹窗也不能发起登录。
    if (this.getState().oauthTosAccepted !== true) {
      this.recordOauthEvent('preset_begin_fail', { accountId: id, reason: 'tos' })
      return { ok: false, message: 'ChatGPT 实验条款尚未确认；请在设置中开启「ChatGPT 订阅登录（实验）」开关，并在弹出的条款确认中同意（订阅转插件调用可能导致账号受限，风险自担）' }
    }
    const starter = this.codexLoopbackStarter
    if (typeof starter !== 'function') {
      this.recordOauthEvent('preset_begin_fail', { accountId: id, reason: 'starter_missing' })
      return { ok: false, message: 'ChatGPT 回调服务启动器不可用（插件装配异常）；请重启 DSH 后重试' }
    }
    const loopback = await starter()
    if (!loopback || loopback.ready !== true) {
      // E4 降级链第②级（EVO-005 / DEC-025 D-2a）：1455 被占（Codex CLI /
      // dsh-codex 等）→ 自动降级设备码流——无需回调端口，headless 可用。
      // 降级本身可观测（P8）：preset_device_begin 事件携带占用原因。
      return this.oauthBeginDeviceFallback(id, loopback && typeof loopback.reason === 'string' && loopback.reason ? loopback.reason : 'loopback_not_ready')
    }
    this.pruneOauthPending()
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const state = `router-${randomBytes(12).toString('hex')}`
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CHATGPT_PRESET.clientId,
      redirect_uri: CHATGPT_PRESET.redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      originator: 'dsh-agent-router',
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true',
    })
    params.set('scope', CHATGPT_PRESET.scope)
    this.oauthPending.set(state, { accountId: id, verifier, redirectUri: CHATGPT_PRESET.redirectUri, expiresAt: Date.now() + 10 * 60 * 1000 })
    this.recordOauthEvent('preset_begin_ok', { accountId: id })
    return {
      ok: true,
      message: '授权 URL 已生成',
      authUrl: `${CHATGPT_PRESET.authUrl}${CHATGPT_PRESET.authUrl.includes('?') ? '&' : '?'}${params.toString()}`,
      state,
    }
  }

  /**
   * EVO-005 设备码降级入口（roadmap §3.4 条目 4 / E4 降级链第②级 /
   * DEC-025 D-2a）：1455 loopback 被占时由 oauthBeginPreset 调用。发起
   * usercode 请求（H3-11 端点，startDeviceAuthorization 原语）→ 成功则
   * 登记设备码会话并启动后台轮询（pollDeviceLoop），返回 mode:'device'
   * 响应（userCode + 验证页链接 + 轮询节奏 + 有效期）；失败（服务端未启用
   * /网络/响应畸形）→ ok:false 指向降级链第三兜底（手动粘贴）。
   * 响应 authUrl 复用验证页 URL（客户端打开链接的既有字段语义）。
   */
  async oauthBeginDeviceFallback(id, reason) {
    this.recordOauthEvent('preset_device_begin', { accountId: id, reason })
    let started
    try {
      started = await startDeviceAuthorization(globalThis.fetch)
    } catch (error) {
      this.recordOauthEvent('preset_device_login_fail', { accountId: id, reason: 'usercode_failed' })
      return { ok: false, message: `设备码登录发起失败（${errorMessage(error)}）；1455 回调端口不可用且设备码端点未就绪，可改用手动粘贴 access token 方式完成授权` }
    }
    const deviceId = `router-device-${randomBytes(8).toString('hex')}`
    let doneResolve
    const done = new Promise((resolve) => { doneResolve = resolve })
    // F-7（REL-003 / R0 P3）：轮询间隔下限 1000ms——服务端通告 interval
    // 异常小（含 0）不触发热轮询；实例级注入仅供测试提速（同 slow_down）。
    const minIntervalMs = typeof this.oauthDeviceMinIntervalMs === 'number' && Number.isFinite(this.oauthDeviceMinIntervalMs) && this.oauthDeviceMinIntervalMs > 0 ? this.oauthDeviceMinIntervalMs : DEVICE_MIN_POLL_INTERVAL_MS
    const intervalMs = Math.max(minIntervalMs, started.intervalSeconds * 1000)
    const timeoutMs = typeof this.oauthDeviceTimeoutMs === 'number' && Number.isFinite(this.oauthDeviceTimeoutMs) && this.oauthDeviceTimeoutMs > 0 ? this.oauthDeviceTimeoutMs : DEVICE_FLOW_TIMEOUT_SECONDS * 1000
    const session = {
      accountId: id,
      deviceAuthId: started.deviceAuthId,
      userCode: started.userCode,
      intervalMs,
      initialIntervalMs: intervalMs,
      expiresAt: Date.now() + timeoutMs,
      status: 'pending',
      cancelled: false,
      pollCount: 0,
      error: '',
      done,
      doneResolve,
    }
    this.oauthDevicePending.set(deviceId, session)
    // 后台轮询：不 await（RPC 立即返回设备码；完成/终态经 catalog
    // presetLoggedIn 翻转对客户端可见——与 1455 流同款观察面）。
    void this.pollDeviceLoop(deviceId)
    return {
      ok: true,
      message: '回调端口被占用，已改用设备码登录：请打开验证页并输入设备码完成授权',
      mode: 'device',
      authUrl: CHATGPT_PRESET.deviceUrls.verification,
      userCode: started.userCode,
      verificationUrl: CHATGPT_PRESET.deviceUrls.verification,
      intervalSeconds: started.intervalSeconds,
      // F-6（REL-003 / R0 P3）：expiresIn 由实效 timeoutMs 推导（与上方
      // expiresAt 同源）——客户端等待 deadline 与真实有效期一致，注入
      // 覆盖时不再通告死值。
      expiresIn: Math.floor(timeoutMs / 1000),
    }
  }

  /**
   * 设备码轮询循环（EVO-005 / H3-11）：立即首询（RFC 8628 语义），此后按
   * session.intervalMs 间隔轮询 deviceauth/token（pollDeviceAuthorizationToken
   * 单次归一）。状态机——pending 继续；slow_down 退避（intervalMs +=
   * DEVICE_SLOW_DOWN_ADD_MS，RFC 8628 §3.5）；complete → 兑换 + 落盘
   * （exchangeDeviceCode → persistPresetLogin，与 oauthTokenExchange preset
   * 分支同路径；落盘前复查 cancelled，F-1）；协议 failed（服务器明确拒绝）
   * 终态；传输类失败（网络错误，transport 判别）非终态——退避（intervalMs
   * += DEVICE_TRANSPORT_RETRY_ADD_MS）重试至 expiresAt（F-2 / REL-003）；
   * 超时（expiresAt，15 分钟）终态 expired；cancelled（登出取消）终态。
   * 任何终态：写 session.status、清 Map、resolve
   * session.done、记事件（C-9；负载零 token 值 P7）。
   */
  async pollDeviceLoop(deviceId) {
    const session = this.oauthDevicePending.get(deviceId)
    if (!session) return
    try {
      for (;;) {
        if (session.cancelled) {
          session.status = 'cancelled'
          this.recordOauthEvent('preset_device_cancelled', { accountId: session.accountId })
          break
        }
        const result = await pollDeviceAuthorizationToken({ deviceAuthId: session.deviceAuthId, userCode: session.userCode }, globalThis.fetch)
        session.pollCount += 1
        if (result.status === 'complete') {
          session.status = await this.exchangeDeviceCode(session, result)
          break
        }
        if (result.status === 'failed') {
          // F-2（REL-003 / R0 P1）：传输类失败（网络错误，transport 判别）
          // 非终态——记 poll_transport_error 后退避重试至 expiresAt（瞬时
          // 网络故障不杀死 15 分钟会话）；真协议 failed（服务器明确拒绝）
          // 保持终态 poll_rejected。
          if (result.transport === true) {
            this.recordOauthEvent('preset_device_login_fail', { accountId: session.accountId, reason: 'poll_transport_error' })
            const transportAdd = typeof this.oauthDeviceTransportRetryAddMs === 'number' && Number.isFinite(this.oauthDeviceTransportRetryAddMs) && this.oauthDeviceTransportRetryAddMs > 0 ? this.oauthDeviceTransportRetryAddMs : DEVICE_TRANSPORT_RETRY_ADD_MS
            session.intervalMs += transportAdd
          } else {
            session.status = 'failed'
            session.error = result.message ?? ''
            this.recordOauthEvent('preset_device_login_fail', { accountId: session.accountId, reason: 'poll_rejected' })
            break
          }
        }
        if (result.status === 'slow_down') {
          const add = typeof this.oauthDeviceSlowDownAddMs === 'number' && Number.isFinite(this.oauthDeviceSlowDownAddMs) && this.oauthDeviceSlowDownAddMs > 0 ? this.oauthDeviceSlowDownAddMs : DEVICE_SLOW_DOWN_ADD_MS
          session.intervalMs += add
        }
        if (Date.now() >= session.expiresAt) {
          session.status = 'expired'
          this.recordOauthEvent('preset_device_login_fail', { accountId: session.accountId, reason: 'device_timeout' })
          break
        }
        await new Promise((resolve) => setTimeout(resolve, session.intervalMs))
      }
    } catch (error) {
      session.status = 'failed'
      session.error = errorMessage(error)
      this.recordOauthEvent('preset_device_login_fail', { accountId: session.accountId, reason: 'poll_error' })
    } finally {
      this.oauthDevicePending.delete(deviceId)
      session.doneResolve()
    }
  }

  /**
   * 设备码兑换（EVO-005 / H3-11；pi-ai exchangeAuthorizationCode 同款但
   * redirect_uri 取 deviceUrls.exchangeRedirectUri——deviceauth/callback，
   * 与 1455 流死值不同）：authorization_code + code_verifier 换标准 token
   * 端点 → 响应经 persistPresetLogin 与 oauthTokenExchange preset 分支同
   * 路径校验落盘（roadmap §3.4 条目 4"与 exchange 同路径落凭据"）。
   * @returns {'ok'|'exchange_failed'|'cancelled'} 循环终态码（cancelled =
   *   兑换途中登出取消——未落盘，F-1 / REL-003 落盘前复查）。
   */
  async exchangeDeviceCode(session, result) {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CHATGPT_PRESET.clientId,
      code: result.authorizationCode,
      code_verifier: result.codeVerifier,
      redirect_uri: CHATGPT_PRESET.deviceUrls.exchangeRedirectUri,
    })
    let response
    try {
      response = await globalThis.fetch(CHATGPT_PRESET.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
    } catch (error) {
      this.recordOauthEvent('preset_device_login_fail', { accountId: session.accountId, reason: 'exchange_unreachable' })
      session.error = errorMessage(error)
      return 'exchange_failed'
    }
    if (!response.ok) {
      this.recordOauthEvent('preset_device_login_fail', { accountId: session.accountId, reason: `exchange_http_${typeof response.status === 'number' ? response.status : 0}` })
      session.error = `设备码兑换失败：HTTP ${response.status}`
      return 'exchange_failed'
    }
    let payload
    try {
      payload = await response.json()
    } catch {
      this.recordOauthEvent('preset_device_login_fail', { accountId: session.accountId, reason: 'exchange_bad_json' })
      session.error = '设备码兑换响应不是合法 JSON'
      return 'exchange_failed'
    }
    // F-1（REL-003 / R0 P1）：落盘前复查 cancelled——兑换 fetch 进行中登出
    //（cancelled 已置位）则不把新兑换的凭据写回，消除"登出后凭据复活"
    // 窗口；终态码 'cancelled' 由 pollDeviceLoop 统一自清 + 本事件可观测。
    if (session.cancelled) {
      this.recordOauthEvent('preset_device_cancelled', { accountId: session.accountId })
      return 'cancelled'
    }
    const outcome = await this.persistPresetLogin(session.accountId, payload)
    if (outcome.ok !== true) {
      session.error = outcome.message
      return 'exchange_failed'
    }
    // 通道专属成功事件（C-9 / BC-E5 观察：设备码使用率是端口占用常态下的
    // 关键诊断指标）；persistPresetLogin 内的 preset_login_ok 为两通道共享。
    this.recordOauthEvent('preset_device_login_ok', { accountId: session.accountId })
    return 'ok'
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
    const preset = typeof account.preset === 'string' && account.preset.trim() ? account.preset.trim() : ''
    if (preset && !OAUTH_PRESET_VALUES.includes(preset)) {
      return { ok: false, message: `未知预设类型（preset="${preset}"）；支持的预设：${OAUTH_PRESET_VALUES.join('、')}` }
    }
    // preset：redirect_uri 为 client 注册死值（H3-3），须与 authorize 侧一致
    //（一键会话已存该值；手动模式传参不覆盖——服务端要求两侧匹配）。
    if (preset) redirectUri = CHATGPT_PRESET.redirectUri
    const tokenUrl = preset ? CHATGPT_PRESET.tokenUrl : ((typeof account.tokenUrl === 'string' && account.tokenUrl.trim()) ? account.tokenUrl.trim() : '')
    if (!tokenUrl) return { ok: false, message: '该账号未配置官方 token 端点（tokenUrl）；可改用「粘贴 access token」方式登录' }
    const params = new URLSearchParams()
    params.set('grant_type', 'authorization_code')
    params.set('code', code)
    params.set('redirect_uri', redirectUri)
    if (verifier) params.set('code_verifier', verifier)
    const builtin = account.publicClient === true
    // preset 为 PKCE 公共 client（H3-1）：clientId 取常量、无 secret。
    const clientId = preset ? CHATGPT_PRESET.clientId : (builtin ? PUBLIC_OAUTH_CLIENT.clientId : ((typeof account.clientId === 'string' && account.clientId.trim()) ? account.clientId.trim() : ''))
    if (clientId) params.set('client_id', clientId)
    const clientSecret = preset ? '' : (builtin ? PUBLIC_OAUTH_CLIENT.clientSecret : ((typeof account.clientSecret === 'string' && account.clientSecret.trim()) ? account.clientSecret.trim() : ''))
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
    if (preset) {
      // §3.4 条目 2（EVO-005 起设备码流共用）：preset 保存完整凭据四元组
      // 经 persistPresetLogin——1455 回调流与设备码流同路径落盘。
      return finish(await this.persistPresetLogin(id, payload))
    }
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

  /**
   * preset 登录终段（EVO-005 自 oauthTokenExchange preset 分支提取，行为
   * 逐字等价）：token 端点响应 payload → 校验 refresh_token/expires_in/
   * accountId → 完整凭据四元组写入 OauthCredentialStore（对比通用账号只存
   * access 单值，P3）→ 事件埋点。1455 回调流（oauthTokenExchange）与设备码
   * 流（exchangeDeviceCode）同路径落凭据（roadmap §3.4 条目 4）。
   */
  async persistPresetLogin(id, payload) {
    const account = this.getOAuthAccount(id)
    if (!account) return { ok: false, message: `OAuth 账号 "${id}" 不存在` }
    const token = typeof payload?.access_token === 'string' && payload.access_token ? payload.access_token : ''
    if (!token) { this.recordOauthEvent('preset_login_fail', { accountId: id, reason: 'access_token_missing' }); return { ok: false, message: 'token 端点未返回 access_token' } }
    const refresh = typeof payload?.refresh_token === 'string' && payload.refresh_token ? payload.refresh_token : ''
    if (!refresh) { this.recordOauthEvent('preset_login_fail', { accountId: id, reason: 'refresh_token_missing' }); return { ok: false, message: 'token 响应缺少 refresh_token（ChatGPT 预设需要可长期刷新的凭据）；请重新发起授权' } }
    const expiresIn = typeof payload?.expires_in === 'number' && Number.isFinite(payload.expires_in) && payload.expires_in > 0 ? payload.expires_in : 0
    if (!expiresIn) { this.recordOauthEvent('preset_login_fail', { accountId: id, reason: 'expires_in_missing' }); return { ok: false, message: 'token 响应缺少有效的 expires_in；请重新发起授权' } }
    const accountId = accountIdFromJwt(token)
    if (!accountId) { this.recordOauthEvent('preset_login_fail', { accountId: id, reason: 'account_id_missing' }); return { ok: false, message: '无法从 access token 提取 accountId（JWT 缺少 chatgpt_account_id claim）；请重新发起授权' } }
    try {
      await this.credentialStoreFor(account).write({ type: 'oauth', access: token, refresh, expires: Date.now() + expiresIn * 1000, accountId })
    } catch (error) {
      this.recordOauthEvent('preset_login_fail', { accountId: id, reason: 'write_failed' })
      return { ok: false, message: `保存 ChatGPT 凭据失败：${errorMessage(error)}` }
    }
    this.recordOauthEvent('preset_login_ok', { accountId: id, expiresIn })
    return { ok: true, message: 'OAuth 登录成功，ChatGPT 凭据已保存', expiresIn }
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

  /**
   * router/oauthLogout（EVO-002 Step 6，§3.6 凭据删除路径 / W-5）：preset
   * 账号登出并删除凭据文件（store.delete 幂等——文件不存在也成功）。合规
   * 删除路径不随实验开关关闭失效：用户始终可以移除已落盘的订阅凭据
   *（对照 dsh-codex "卸载不删凭据"，本插件做显式一键删除——更保守）。
   * 账号条目与池引用的清理在客户端删除账号路径联动（W-5）。
   */
  async oauthLogout(request) {
    const id = String(request?.accountId ?? '')
    const account = this.getOAuthAccount(id)
    if (!account) return { ok: false, message: `OAuth 账号 "${id}" 不存在` }
    const preset = typeof account.preset === 'string' && account.preset.trim() ? account.preset.trim() : ''
    if (!OAUTH_PRESET_VALUES.includes(preset)) {
      return { ok: false, message: '登出仅适用于 ChatGPT 预设账号（preset 独立凭据文件）；通用账号请在账号卡片删除 token' }
    }
    // EVO-005（W-5 联动）：取消该账号进行中的设备码轮询会话——登出语义
    // 下不再把新兑换的凭据写回（cancelled 终态由 pollDeviceLoop 自清）。
    for (const session of this.oauthDevicePending.values()) {
      if (session.accountId === id) session.cancelled = true
    }
    try {
      await this.credentialStoreFor(account).delete()
    } catch (error) {
      this.recordOauthEvent('preset_logout_fail', { accountId: id })
      return { ok: false, message: `登出失败（删除凭据文件）：${errorMessage(error)}` }
    }
    this.recordOauthEvent('preset_logout', { accountId: id })
    return { ok: true, message: '已登出并删除 ChatGPT 凭据文件' }
  }

  /** preset 账号登录态（凭据文件可读 = true；缺失/损坏 = false——诊断面不抛错）。 */
  async presetLoggedInOf(account) {
    try {
      const cred = await this.credentialStoreFor(account).read()
      return !!cred
    } catch {
      return false
    }
  }

  /**
   * 加载代理 dispatcher（EVO-002 Step 6）：动态 import('undici') 取
   * ProxyAgent；oauthUndiciLoader 仅供测试注入。Node 原生 fetch 即 undici
   * 实现，init.dispatcher 为其支持的扩展项。FIX-006：dispatcher 接口跨
   * major 不兼容——加载的 undici 必须与内置 fetch 的 undici
   * （process.versions.undici）同 major（v8 ProxyAgent 配内置 v7 fetch
   * 实测 invalid onRequestStart——晦涩下游失败）；装配点对探测到的跨
   * major 错配 fail-loud 给明确指引。
   */
  async loadOauthProxyDispatcher(proxy) {
    try {
      // R7-F3：按 proxyUrl 缓存实例（连接池复用——重复 TLS 握手与未关闭实例
      // 依赖 GC 是高频代理调用的资源压力；配置热变更经旧键自然失效）。
      const cached = this.oauthProxyDispatchers?.get(proxy.proxyUrl)
      if (cached) return cached
      const load = this.oauthUndiciLoader ?? (async () => import('undici'))
      const undici = await load()
      if (!undici || typeof undici.ProxyAgent !== 'function') throw new Error('undici 模块未暴露 ProxyAgent')
      const loadedVersion = await (this.oauthUndiciVersionProbe ?? (async () => {
        try {
          const requireFromHere = createRequire(import.meta.url)
          return String(requireFromHere('undici/package.json')?.version ?? '')
        } catch { return '' }
      }))()
      const builtinVersion = String(globalThis.process?.versions?.undici ?? '')
      const majorOf = (version) => Number.parseInt(version.split('.')[0], 10)
      if (loadedVersion && builtinVersion) {
        const loadedMajor = majorOf(loadedVersion)
        const builtinMajor = majorOf(builtinVersion)
        if (Number.isInteger(loadedMajor) && Number.isInteger(builtinMajor) && loadedMajor !== builtinMajor) {
          throw new Error(`undici 版本不匹配（已加载 undici@${loadedVersion}，Node 原生 fetch 为内置 undici@${builtinVersion}）——dispatcher 接口跨 major 不兼容（v8 配内置 v7 实测 invalid onRequestStart）；请安装 undici@^${builtinMajor}.x 与内置对齐（本插件 package.json 已按此声明）`)
        }
      }
      const dispatcher = new undici.ProxyAgent(proxy.proxyUrl)
      if (this.oauthProxyDispatchers) {
        // R8-F2（P2）：缓存有界——Map 强引用下旧键实例不会随 GC 回收；替换
        // 时显式 close 旧实例（连接池/底层 socket 释放）并淘汰，仅保留最近
        // 一次代理配置（代理配置实际单一——简单淘汰满足有界语义）。
        const firstUrl = this.oauthProxyDispatchers.keys().next().value
        if (firstUrl !== undefined && firstUrl !== proxy.proxyUrl) {
          for (const [url, old] of this.oauthProxyDispatchers) {
            if (url === proxy.proxyUrl) continue
            try { await old?.close?.() } catch { /* close 失败不阻断新代理可用 */ }
            this.oauthProxyDispatchers.delete(url)
          }
        }
        this.oauthProxyDispatchers.set(proxy.proxyUrl, dispatcher)
      }
      return dispatcher
    } catch (error) {
      throw new Error(`已配置代理（${proxy.source}：${proxy.proxyUrl}）但无法加载 undici 代理支持（${errorMessage(error)}）；chatgpt.com 在当前网络需经代理可达——请为宿主环境安装 undici，或配置可直连的网络环境`)
    }
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

  /** router/reset：清空统计（软删除默认 §4.2；内存清零同步即时可见）。 */
  async reset() {
    await this.resetStats()
    return { ok: true }
  }
}
