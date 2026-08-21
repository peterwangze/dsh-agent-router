/**
 * ChatGPT preset OAuth 凭据模块（roadmap §3.3 / ADR-005 / EVO-002 Step 2）。
 *
 * 职责（§3.3，≤3 句）：① ChatGPT preset OAuth 凭据文档（access/refresh/expires/
 * accountId）的读取/校验/原子写入/删除，独立文件存储于 DSH_HOME 插件目录；
 * ② 过期前刷新（rotating refresh token，文件锁串行化防并发双写）；③ 从 access
 * token JWT 提取 accountId（仅解码不验签，H3-7）。
 *
 * 设计事实（不重复调研，Coordinator 已核实）：
 * - 依赖面：本包无 `@deepseek-ai/dsh-atomic-write`（P6/C2 零新依赖）→ 原子写
 *   与文件锁自实现——temp+`rename`（同文件系统原子）+ `.lock` 独占创建（`wx`）
 *   + mtime 陈旧接管 + 获取超时。E3-a 只约束语义不约束载体。
 * - 默认路径：`process.env.DSH_HOME` 存在 → `$DSH_HOME/dsh-agent-router/
 *   chatgpt-codex-auth.json`；未设 → `~/.dsh/dsh-agent-router/...`（EV-028：
 *   DSH 宿主实际数据目录为 ~/.dsh）。
 * - 刷新（H3-6 / EV-028）：POST tokenUrl，`grant_type=refresh_token` + `client_id`
 *   （无 secret）；**rotating refresh token**——响应必含新 refresh，旧值有服务端
 *   宽限窗但客户端必须以新值覆写全文档；auth.openai.com 直连可达（代理问题仅在
 *   chatgpt.com，属后续步骤）。
 * - 文档形状（H3-13 先例）：`{version:1, credential:{type:'oauth', access,
 *   refresh, expires, accountId}}` 严格校验（未知字段拒绝）；POSIX owner-only
 *   （Windows 按 dsh-codex 先例跳过 mode 检查）。
 *
 * 安全边界（P7）：诊断信息（Error message）永不携带 access/refresh token 值
 * （dsh-codex safeMessage 先例，刷新路径按已知 secret 逐字替换 `[redacted]`；
 * JSON 解析失败不内联 parse 错误详情——其可能携带文件内容片段）；temp 文件名
 * 带随机后缀、`wx` 独占创建（O_EXCL 不覆盖先例）且失败必清理。
 *
 * 边界（C3 单职责）：本模块只管凭据存取/刷新/JWT 解码——不做网络会话、协议
 * 调用、账号 UI；service.js/client.js 集成属 Step 4/5/6。错误码风格与
 * lib/attachments.js 同构（封闭 freeze 错误码表 + code 属性 Error）。
 * @module dsh-agent-router/oauth-credentials
 */
import { randomBytes } from 'node:crypto'
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

/**
 * ChatGPT（Codex）preset OAuth 常量（§3.3 接口草案 + §3.1 H3 事实）。
 * clientId 为 Codex CLI 公共 client（H3-1，PKCE 公共客户端无 secret）；
 * redirectUri 的 1455 端口为 client 注册死值（H3-3，不可换）。
 */
export const CHATGPT_PRESET = Object.freeze({
  preset: 'chatgpt-codex',
  authUrl: 'https://auth.openai.com/oauth/authorize',
  tokenUrl: 'https://auth.openai.com/oauth/token',
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
  scope: 'openid profile email offline_access',
  redirectUri: 'http://localhost:1455/auth/callback',
  /** 设备码后备端点（H3-11）。 */
  deviceUrls: Object.freeze({
    userCode: 'https://auth.openai.com/api/accounts/deviceauth/usercode',
    token: 'https://auth.openai.com/api/accounts/deviceauth/token',
    verification: 'https://auth.openai.com/codex/device',
  }),
})

/** 凭据文档文件名（默认路径段；BC-E6：与 dsh-codex/Codex CLI 三方路径独立）。 */
export const CREDENTIAL_FILENAME = 'chatgpt-codex-auth.json'

/** 凭据文档格式版本（H3-13 先例：version 1，其他值拒绝）。 */
export const CREDENTIAL_DOC_VERSION = 1

/** ensureFresh 临期阈值：剩余寿命 > 120s 原样返回（零网络，§3.3）。 */
export const REFRESH_MARGIN_MS = 120_000

/** 文件锁获取超时（默认 5s；超时 → CREDENTIAL_LOCK_TIMEOUT）。 */
export const CREDENTIAL_LOCK_TIMEOUT_MS = 5_000

/** 锁陈旧阈值：锁文件 mtime 超过 30s 视为残留死锁，接管后重建。 */
export const CREDENTIAL_LOCK_STALE_MS = 30_000

/** 锁等待轮询间隔（尽力而为的跨进程语义，单机单插件场景足够）。 */
export const CREDENTIAL_LOCK_POLL_MS = 50

/** §3.3 错误码族（风格同 attachments.js 的封闭错误码表）。 */
export const CREDENTIAL_ERROR_CODES = Object.freeze({
  /** 文档严格校验失败（未知字段/缺字段/类型错/非法 JSON）或读取不可用 → 引导重登。 */
  CREDENTIAL_FILE_CORRUPT: 'CREDENTIAL_FILE_CORRUPT',
  /** 文件锁获取超时（并发持有者长期未释放）。 */
  CREDENTIAL_LOCK_TIMEOUT: 'CREDENTIAL_LOCK_TIMEOUT',
  /** 刷新失败（401/失效/网络错误/响应畸形）——终态语义：需重新登录。 */
  REFRESH_FAILED: 'REFRESH_FAILED',
  /** 凭据文件（或锁文件/目录）写入/删除失败。 */
  CREDENTIAL_FILE_UNWRITABLE: 'CREDENTIAL_FILE_UNWRITABLE',
})

/** 构造带 code 的凭据错误（对齐 attachments.js attachmentError 风格）。 */
export function credentialError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

/** 错误消息提取（与 attachments.js errorMessage 同构；本模块为依赖源自包含）。 */
function errorMessage(error) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && typeof error.message === 'string') return error.message
  return String(error)
}

/** P7 脱敏（safeMessage 先例）：把已知 token 值逐字替换为 [redacted]。 */
function redactSecrets(message, secrets) {
  let out = typeof message === 'string' ? message : String(message ?? '')
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret) out = out.replaceAll(secret, '[redacted]')
  }
  return out
}

/** 刷新/写盘路径的错误脱敏后重抛（诊断永不携带 token 值）。 */
function redactError(error, secrets) {
  if (error instanceof Error) {
    const scrubbed = redactSecrets(error.message, secrets)
    if (scrubbed !== error.message) error.message = scrubbed
    return error
  }
  return credentialError(CREDENTIAL_ERROR_CODES.REFRESH_FAILED, redactSecrets(errorMessage(error), secrets))
}

/**
 * 默认凭据路径解析（EV-028 事实）：`DSH_HOME` 环境变量存在 →
 * `$DSH_HOME/dsh-agent-router/chatgpt-codex-auth.json`；未设 →
 * `~/.dsh/dsh-agent-router/chatgpt-codex-auth.json`。
 * options.env / options.home 仅测试注入用（与真实 process.env 隔离）。
 */
export function defaultCredentialPath(options = {}) {
  const env = options.env ?? process.env
  const home = typeof options.home === 'string' && options.home ? options.home : homedir()
  const override = typeof env.DSH_HOME === 'string' && env.DSH_HOME ? env.DSH_HOME : ''
  return join(override || join(home, '.dsh'), 'dsh-agent-router', CREDENTIAL_FILENAME)
}

/**
 * F-01（R1 审查转发义务）：账号条目 → 凭据文件路径。
 * `account.credentialFile` 非空 → 原样使用；空串/缺省 → 默认路径
 * （与构造器缺省同源——Step 1 的 doc 注释语义在本步落地）。
 */
export function resolveCredentialPath(account, options = {}) {
  const credentialFile = account && typeof account.credentialFile === 'string' ? account.credentialFile : ''
  return credentialFile ? credentialFile : defaultCredentialPath(options)
}

/** 凭据对象允许的字段（严格校验：未知字段拒绝，H3-13 同款）。 */
const CREDENTIAL_FIELDS = Object.freeze(['type', 'access', 'refresh', 'expires', 'accountId'])

/** 校验凭据对象形状；合法返回空串，否则返回问题描述（不含字段值——P7）。 */
function credentialProblem(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'credential 必须是对象'
  for (const key of Object.keys(value)) {
    if (!CREDENTIAL_FIELDS.includes(key)) return `未知字段 "${key}"`
  }
  for (const field of CREDENTIAL_FIELDS) {
    if (!(field in value)) return `缺少字段 "${field}"`
  }
  if (value.type !== 'oauth') return 'type 必须为 "oauth"'
  if (typeof value.access !== 'string' || !value.access) return 'access 必须为非空字符串'
  if (typeof value.refresh !== 'string' || !value.refresh) return 'refresh 必须为非空字符串'
  if (typeof value.expires !== 'number' || !Number.isFinite(value.expires)) return 'expires 必须为有限数字（ms 绝对时间）'
  if (typeof value.accountId !== 'string') return 'accountId 必须为字符串'
  return ''
}

/**
 * 从 access token JWT 提取 accountId（H3-7）：payload claim
 * `https://api.openai.com/auth` → `chatgpt_account_id`。仅 base64url 解码
 * payload，**不做签名验证**；任何畸形输入 → null（不抛错）。
 */
export function accountIdFromJwt(access) {
  if (typeof access !== 'string' || !access) return null
  const parts = access.split('.')
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null
  let payload
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const auth = payload['https://api.openai.com/auth']
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) return null
  const accountId = auth.chatgpt_account_id
  return typeof accountId === 'string' && accountId ? accountId : null
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 执行一次 refresh（H3-6 / EV-028）：POST tokenUrl，body 为
 * `grant_type=refresh_token&refresh_token=...&client_id=...`（无 secret）。
 * 成功 → 返回新凭据对象（rotating：refresh 以响应新值覆写；expires 按响应
 * expires_in 换算 ms 绝对时间；accountId 从新 JWT 提取，失败回退旧值）。
 * 失败（网络错误 / 非 2xx / 响应畸形）→ REFRESH_FAILED（HTTP 响应存在时附带
 * error.status 数值属性，供上层区分 401 终态与瞬时故障）。
 * 消息只含状态码与原因，不含任何 token 值（P7）。
 */
async function refreshCredential(cred, fetchImpl) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: cred.refresh,
    client_id: CHATGPT_PRESET.clientId,
  })
  let response
  try {
    response = await fetchImpl(CHATGPT_PRESET.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: String(body),
    })
  } catch (error) {
    throw credentialError(CREDENTIAL_ERROR_CODES.REFRESH_FAILED, `刷新请求失败（网络错误）：${errorMessage(error)}`)
  }
  if (!response || typeof response.ok !== 'boolean') {
    throw credentialError(CREDENTIAL_ERROR_CODES.REFRESH_FAILED, '刷新响应格式无效（缺少 ok 字段）')
  }
  if (!response.ok) {
    const status = typeof response.status === 'number' ? response.status : 0
    const error = credentialError(CREDENTIAL_ERROR_CODES.REFRESH_FAILED, `刷新失败：HTTP ${status}（refresh token 可能已失效，请重新登录）`)
    if (status) error.status = status
    throw error
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    throw credentialError(CREDENTIAL_ERROR_CODES.REFRESH_FAILED, '刷新响应不是合法 JSON')
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw credentialError(CREDENTIAL_ERROR_CODES.REFRESH_FAILED, '刷新响应必须是 JSON 对象')
  }
  const access = payload.access_token
  const refresh = payload.refresh_token
  const expiresIn = payload.expires_in
  if (typeof access !== 'string' || !access) {
    throw credentialError(CREDENTIAL_ERROR_CODES.REFRESH_FAILED, '刷新响应缺少 access_token')
  }
  if (typeof refresh !== 'string' || !refresh) {
    throw credentialError(CREDENTIAL_ERROR_CODES.REFRESH_FAILED, '刷新响应缺少 refresh_token（rotating 语义要求以新值覆写）')
  }
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw credentialError(CREDENTIAL_ERROR_CODES.REFRESH_FAILED, '刷新响应缺少有效的 expires_in')
  }
  return {
    type: 'oauth',
    access,
    refresh,
    expires: Date.now() + expiresIn * 1000,
    accountId: accountIdFromJwt(access) ?? (typeof cred.accountId === 'string' ? cred.accountId : ''),
  }
}

/**
 * ChatGPT preset OAuth 凭据存储（§3.3 接口）。
 *
 * @param filename - 凭据文件路径；缺省（空/undefined）用 defaultCredentialPath
 *   （DSH_HOME → ~/.dsh 回退）。
 * @param options - { env, home, fetchImpl }：env/home 为测试注入（默认
 *   process.env/os.homedir）；fetchImpl 为可注入网络实现（默认 globalThis.fetch）。
 */
export class OauthCredentialStore {
  constructor(filename, options = {}) {
    this.options = options && typeof options === 'object' ? options : {}
    this.filename = typeof filename === 'string' && filename ? filename : defaultCredentialPath(this.options)
  }

  /**
   * 读取凭据；文件不存在 → undefined（非错误）。文档严格校验（version 必须为 1、
   * credential 字段形状、未知顶层/凭据字段拒绝——H3-13 同款）失败 →
   * CREDENTIAL_FILE_CORRUPT。返回浅拷贝（调用方改动不污染后续读取）。
   */
  async read() {
    let text
    try {
      text = readFileSync(this.filename, 'utf8')
    } catch (error) {
      if (error && error.code === 'ENOENT') return undefined
      throw credentialError(CREDENTIAL_ERROR_CODES.CREDENTIAL_FILE_CORRUPT, `凭据文件无法读取（${this.filename}）：${errorMessage(error)}`)
    }
    let doc
    try {
      doc = JSON.parse(text)
    } catch {
      // 不内联 parse 错误详情：其可能携带文件内容片段（P7 脱敏红线）。
      throw credentialError(CREDENTIAL_ERROR_CODES.CREDENTIAL_FILE_CORRUPT, `凭据文件不是合法 JSON（${this.filename}）`)
    }
    const corrupt = (reason) => credentialError(CREDENTIAL_ERROR_CODES.CREDENTIAL_FILE_CORRUPT, `凭据文件校验失败（${this.filename}）：${reason}`)
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw corrupt('文档必须是 JSON 对象')
    for (const key of Object.keys(doc)) {
      if (key !== 'version' && key !== 'credential') throw corrupt(`未知顶层字段 "${key}"`)
    }
    if (!('version' in doc)) throw corrupt('缺少 version 字段')
    if (doc.version !== CREDENTIAL_DOC_VERSION) throw corrupt(`version 必须为 ${CREDENTIAL_DOC_VERSION}`)
    if (!('credential' in doc)) throw corrupt('缺少 credential 字段')
    const problem = credentialProblem(doc.credential)
    if (problem) throw corrupt(problem)
    return { ...doc.credential }
  }

  /**
   * 原子写入凭据文档：temp 文件（随机后缀 + `wx` 独占创建）→ fsync → `rename`
   * 落位（同文件系统原子，崩溃不产生半写文档）。POSIX owner-only（temp 以
   * 0o600 创建；Windows 按 dsh-codex 先例跳过 mode 检查）。失败清理 temp 后
   * 抛 CREDENTIAL_FILE_UNWRITABLE——任何路径下均无 temp 残留。写入前先做与
   * read 同源的形状校验（拒绝写坏文档）。
   */
  async write(cred) {
    const problem = credentialProblem(cred)
    if (problem) throw credentialError(CREDENTIAL_ERROR_CODES.CREDENTIAL_FILE_CORRUPT, `拒绝写入无效凭据：${problem}`)
    const doc = {
      version: CREDENTIAL_DOC_VERSION,
      credential: {
        type: 'oauth',
        access: cred.access,
        refresh: cred.refresh,
        expires: cred.expires,
        accountId: cred.accountId,
      },
    }
    const dir = dirname(this.filename)
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
    } catch (error) {
      throw credentialError(CREDENTIAL_ERROR_CODES.CREDENTIAL_FILE_UNWRITABLE, `无法创建凭据目录（${dir}）：${errorMessage(error)}`)
    }
    const tempPath = join(dir, `.${basename(this.filename)}.${randomBytes(6).toString('hex')}.tmp`)
    const fail = (message) => {
      try { unlinkSync(tempPath) } catch { /* 清理尽力而为 */ }
      throw credentialError(CREDENTIAL_ERROR_CODES.CREDENTIAL_FILE_UNWRITABLE, message)
    }
    let fd
    try {
      fd = openSync(tempPath, 'wx', 0o600)
    } catch (error) {
      fail(`凭据临时文件创建失败（${this.filename}）：${errorMessage(error)}`)
    }
    try {
      writeSync(fd, JSON.stringify(doc))
      fsyncSync(fd)
    } catch (error) {
      try { closeSync(fd) } catch { /* 已关闭 */ }
      fail(`凭据写入失败（${this.filename}）：${errorMessage(error)}`)
    }
    try {
      closeSync(fd)
    } catch (error) {
      fail(`凭据临时文件关闭失败（${this.filename}）：${errorMessage(error)}`)
    }
    try {
      renameSync(tempPath, this.filename)
    } catch (error) {
      fail(`凭据落盘失败（${this.filename}）：${errorMessage(error)}`)
    }
  }

  /** 删除凭据文件（登出/删除路径，§3.6 合规边界）；文件不存在时幂等。 */
  async delete() {
    try {
      unlinkSync(this.filename)
    } catch (error) {
      if (error && error.code === 'ENOENT') return
      throw credentialError(CREDENTIAL_ERROR_CODES.CREDENTIAL_FILE_UNWRITABLE, `凭据删除失败（${this.filename}）：${errorMessage(error)}`)
    }
  }

  /**
   * 确保凭据可用（§3.3）：剩余寿命 > REFRESH_MARGIN_MS（120s）→ 原样返回
   * （零网络、零拷贝）；临期/过期 → 文件锁内 read-modify-write：
   * ① 获取 `${filename}.lock` 独占锁（`wx` 创建 + mtime 陈旧接管 + 超时 →
   *   CREDENTIAL_LOCK_TIMEOUT）；② 锁内重读盘上文档——等锁期间先到者已完成
   *   刷新则直接采用新凭据（并发只刷一次，BC-E6 ③）；③ 仍临期 → refresh
   *   （rotating：refresh 以响应新值覆写）→ 全文档原子重写 → 返回新凭据。
   * 刷新失败（401/网络/响应畸形）→ REFRESH_FAILED（终态语义 = 需重登；
   * HTTP 响应存在时 error.status 携带状态码）。
   *
   * @param cred - 调用方持有的当前凭据（内存值；盘上更新时以盘为准）。
   * @param options - { fetchImpl, lockTimeoutMs }：fetchImpl 注入网络实现
   *   （优先于构造器 options.fetchImpl / globalThis.fetch）；lockTimeoutMs
   *   覆盖锁获取超时（测试提速用）。
   */
  async ensureFresh(cred, options = {}) {
    const problem = credentialProblem(cred)
    if (problem) throw credentialError(CREDENTIAL_ERROR_CODES.CREDENTIAL_FILE_CORRUPT, `凭据对象无效：${problem}`)
    if (cred.expires - Date.now() > REFRESH_MARGIN_MS) return cred
    const opts = options && typeof options === 'object' ? options : {}
    const fetchImpl = opts.fetchImpl ?? this.options.fetchImpl ?? globalThis.fetch
    if (typeof fetchImpl !== 'function') {
      throw credentialError(CREDENTIAL_ERROR_CODES.REFRESH_FAILED, '刷新需要可用的 fetch 实现（未注入且宿主无 globalThis.fetch）')
    }
    const requested = typeof opts.lockTimeoutMs === 'number' && Number.isFinite(opts.lockTimeoutMs) && opts.lockTimeoutMs > 0 ? opts.lockTimeoutMs : 0
    const timeoutMs = requested || CREDENTIAL_LOCK_TIMEOUT_MS
    return this.withLock(timeoutMs, async () => {
      const disk = await this.read()
      const base = disk ?? cred
      if (disk && base.expires - Date.now() > REFRESH_MARGIN_MS) return disk
      const secrets = [cred.access, cred.refresh, base.access, base.refresh]
      let fresh
      try {
        fresh = await refreshCredential(base, fetchImpl)
      } catch (error) {
        throw redactError(error, secrets)
      }
      try {
        await this.write(fresh)
      } catch (error) {
        throw redactError(error, secrets)
      }
      return fresh
    })
  }

  /**
   * 文件锁临界区（自实现，P6 零新依赖）：`.lock` 后缀同目录、`wx` 独占创建；
   * EEXIST → mtime 陈旧检测（超 CREDENTIAL_LOCK_STALE_MS 的残留死锁接管重建）
   * → 超时判定（CREDENTIAL_LOCK_TIMEOUT）→ 50ms 轮询等待。锁文件内容为
   * `{pid, at}`（诊断用；接管判定走 mtime，跨平台稳定）。释放走 finally 尽力
   * unlink；释放失败残留由后续陈旧接管兜底。跨进程语义尽力而为（单机单插件
   * 场景足够）。
   */
  async withLock(timeoutMs, fn) {
    const dir = dirname(this.filename)
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
    } catch (error) {
      throw credentialError(CREDENTIAL_ERROR_CODES.CREDENTIAL_FILE_UNWRITABLE, `无法创建凭据目录（${dir}）：${errorMessage(error)}`)
    }
    const lockPath = `${this.filename}.lock`
    const deadline = Date.now() + timeoutMs
    for (;;) {
      let fd
      let createError
      try {
        fd = openSync(lockPath, 'wx', 0o600)
      } catch (error) {
        createError = error
      }
      if (fd !== undefined) {
        try {
          writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }))
        } finally {
          try { closeSync(fd) } catch { /* 关闭失败不阻塞临界区 */ }
        }
        break
      }
      if (!createError || createError.code !== 'EEXIST') {
        throw credentialError(CREDENTIAL_ERROR_CODES.CREDENTIAL_FILE_UNWRITABLE, `无法创建锁文件（${lockPath}）：${errorMessage(createError)}`)
      }
      // 已被持有：陈旧检测（mtime 超窗接管）→ 超时判定 → 轮询等待。
      let mtimeMs = NaN
      try {
        mtimeMs = statSync(lockPath).mtimeMs
      } catch (statError) {
        if (statError && statError.code === 'ENOENT') continue
        throw credentialError(CREDENTIAL_ERROR_CODES.CREDENTIAL_FILE_UNWRITABLE, `无法读取锁文件状态（${lockPath}）：${errorMessage(statError)}`)
      }
      if (Date.now() - mtimeMs > CREDENTIAL_LOCK_STALE_MS) {
        try { unlinkSync(lockPath) } catch { /* 并发接管竞态：他人已重建 → 继续轮询 */ }
        continue
      }
      if (Date.now() >= deadline) {
        throw credentialError(CREDENTIAL_ERROR_CODES.CREDENTIAL_LOCK_TIMEOUT, `获取凭据文件锁超时（${timeoutMs}ms，${basename(lockPath)} 被长期持有）`)
      }
      await sleep(CREDENTIAL_LOCK_POLL_MS)
    }
    try {
      return await fn()
    } finally {
      try { unlinkSync(lockPath) } catch { /* 释放尽力而为；残留由陈旧接管兜底 */ }
    }
  }
}
