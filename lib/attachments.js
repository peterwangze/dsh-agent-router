/**
 * M2 附件统一编址层（v3 §4.3.1 / §5.1，MIG-001 Step 5a）。
 *
 * 问题（§5.1）：现状"路径（files）与附件 id（image 块/标记）双轨"——同一张图
 * 在不同环节以不同身份出现（CLI/agent 要路径、chat 要附件 ref、展示要 id、
 * 跨轮要 id、输入落盘要路径），映射散落在 service.js 各处（prepareChatFiles
 * 路径→ref、materializeCliImages ref→路径、imageData id→字节），无统一索引。
 *
 * 本模块（纯新增，无调用点迁移——Step 5b 迁移内部调用点）：
 * - 注册表：attachmentId（内容寻址规范身份）↔ 工作区路径（物理载体）↔
 *   files 参数（工具面字符串引用）三向映射；
 * - 懒注册降级（W-2，跨轮指代闭环边界）：byId/resolve 对"未注册但合法
 *   （宿主可读）的 attachmentId"自动降级——经宿主 attachments.readImage
 *   尝试读取 → 成功则注册后返回；失败才 ATTACHMENT_UNKNOWN。覆盖主 agent
 *   从 imageMemory 记忆段拿到 id 直接引用的场景（图片轮 selectAttachments
 *   直取日志 ref，不经注册表）；
 * - 物化缓存按**会话作用域键 `sessionId\0id`**（W-3）：同一会话内多次
 *   materialize 不重复落盘；跨会话不共享物化路径（A 会话物化的
 *   .router-files/ 文件绝不被 B 会话引用，防跨会话路径泄漏）；
 * - 条目 LRU（上限 200，§5.1 #5）+ 物化缓存独立 LRU；
 * - 错误统一 `{ code, message }` 形状的 Error（§4.3.1 错误码表）。
 *
 * 与 service.js 的 detectImageMediaType 同构（魔数表一致）；统一归位留待
 * Step 5b 迁移时收敛——M2 是依赖源（§4.2 依赖关系），不可反向 import
 * service.js（避免循环依赖）。
 * @module dsh-agent-router/attachments
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

/** 内容寻址 id 格式（与宿主附件一致）。 */
export const ATTACHMENT_ID_RE = /^sha256:[0-9a-f]{64}$/i

/** 注册表条目 LRU 上限（§5.1 #5"如 200 条"）。 */
export const ATTACHMENT_REGISTRY_MAX_ENTRIES = 200

/** 物化缓存 LRU 上限（会话作用域键）。 */
export const ATTACHMENT_MATERIALIZE_CACHE_MAX = 200

/** URL/上传/落盘统一大小上限（对齐 service.js URL_FILE_MAX_BYTES）。 */
export const ATTACHMENT_FILE_MAX_BYTES = 25 * 1024 * 1024

/** URL 下载超时（对齐 service.js URL_FETCH_TIMEOUT_MS）。 */
export const ATTACHMENT_FETCH_TIMEOUT_MS = 60_000

/** 物化子目录（工作区 .router-files/<dir>/ 下）。 */
export const ATTACHMENT_MATERIALIZE_DIR = 'attachments'

/** §4.3.1 错误码。 */
export const ATTACHMENT_ERROR_CODES = Object.freeze({
  INVALID_ATTACHMENT_ID: 'INVALID_ATTACHMENT_ID',
  PATH_OUTSIDE_WORKSPACE: 'PATH_OUTSIDE_WORKSPACE',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_MEDIA: 'UNSUPPORTED_MEDIA',
  ATTACHMENT_UNKNOWN: 'ATTACHMENT_UNKNOWN',
  STORE_UNAVAILABLE: 'STORE_UNAVAILABLE',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
})

/** 构造带 code 的寻址错误（对齐 service.js imageData 的 { ok, message, code } 风格）。 */
export function attachmentError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

/** id 是否匹配内容寻址格式。 */
export function isAttachmentId(value) {
  return typeof value === 'string' && ATTACHMENT_ID_RE.test(value)
}

/** 错误消息提取（与 service.js errorMessage 同构；M2 为依赖源不可反向 import）。 */
function errorMessage(error) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && typeof error.message === 'string') return error.message
  return String(error)
}

/**
 * 严格按魔数识别图片 media type；非 PNG/JPEG/WebP/GIF 返回 undefined。
 * （与 service.js detectImageMediaType 同构，Step 5b 迁移时收敛。）
 */
export function detectImageMediaType(data) {
  if (data.length >= 4 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 12 && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return 'image/webp'
  if (data.length >= 4 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'image/gif'
  return undefined
}

/** 字节 → 内容寻址 id（sha256:hex，与宿主附件同前缀）。 */
export function contentHashId(data) {
  return `sha256:${createHash('sha256').update(data).digest('hex')}`
}

/**
 * M2 附件注册表（§4.3.1 接口实现）。
 * @param ctx - 宿主 ctx（get('attachments') / get('fs')），与 RouterService 同根。
 */
export class AttachmentRegistry {
  constructor(ctx) {
    this.ctx = ctx
    /** 注册表：id → AttachmentEntry（Map 插入序即 LRU 序）。 */
    this.entries = new Map()
    /** 反向索引：workspacePath → id（byPath O(1)）。 */
    this.pathIndex = new Map()
    /** 物化缓存：`${sessionId}\0${id}` → { path, at }（会话作用域，W-3）。 */
    this.materialized = new Map()
  }

  get attachmentsService() {
    const attachments = this.ctx?.get?.('attachments')
    return attachments && typeof attachments.readImage === 'function' ? attachments : undefined
  }

  get fsService() {
    const fs = this.ctx?.get?.('fs')
    return fs && typeof fs.resolve === 'function' && typeof fs.stat === 'function' ? fs : undefined
  }

  /** LRU 写入（重插到尾部并超限淘汰最旧）。 */
  registerEntry(entry) {
    if (!entry || !isAttachmentId(entry.id)) return entry
    this.entries.delete(entry.id)
    this.entries.set(entry.id, entry)
    if (typeof entry.workspacePath === 'string' && entry.workspacePath) {
      this.pathIndex.delete(entry.workspacePath)
      this.pathIndex.set(entry.workspacePath, entry.id)
    }
    while (this.entries.size > ATTACHMENT_REGISTRY_MAX_ENTRIES) {
      const [oldestId, oldest] = this.entries.entries().next().value
      if (typeof oldest?.workspacePath === 'string' && oldest.workspacePath && this.pathIndex.get(oldest.workspacePath) === oldestId) {
        this.pathIndex.delete(oldest.workspacePath)
      }
      this.entries.delete(oldestId)
    }
    return entry
  }

  /** 已注册条目（不触发懒注册；命中刷新 LRU 序——读语义与 imageMemory 一致）。 */
  peek(id) {
    const entry = this.entries.get(id)
    if (!entry) return undefined
    this.entries.delete(id)
    this.entries.set(id, entry)
    return entry
  }

  /**
   * 路径 → 附件（§4.3.1 registerPath）：
   * - URL：下载（≤25MB、60s 超时）落盘 .router-files/<name> 后按路径处理；
   * - 路径：fs.resolve/stat 校验（沙箱外 PATH_OUTSIDE_WORKSPACE；不存在
   *   FILE_NOT_FOUND）；
   * - 图片（魔数）→ 宿主 attachments.saveImage（内容寻址去重，source:
   *   'files'/'url'）；非图片 → 字节哈希 id + workspacePath 条目（物理载体）。
   */
  async registerPath(pathOrUrl, options = {}) {
    const { cwd, signal } = options
    const raw = String(pathOrUrl ?? '').trim()
    if (!raw) throw attachmentError(ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND, '附件路径不能为空')
    const fs = this.fsService
    if (!fs || typeof fs.readBytes !== 'function') throw attachmentError(ATTACHMENT_ERROR_CODES.STORE_UNAVAILABLE, '文件服务不可用，无法注册附件路径')
    let target
    let displayPath = raw
    let source = 'files'
    if (/^https?:\/\//i.test(raw)) {
      const downloaded = await this.downloadToWorkspace(raw, { cwd, signal })
      target = downloaded.target
      displayPath = downloaded.displayPath
      source = 'url'
    } else {
      try {
        target = await fs.resolve(raw, { ...(cwd ? { cwd } : {}) })
      } catch (error) {
        throw attachmentError(ATTACHMENT_ERROR_CODES.PATH_OUTSIDE_WORKSPACE, `无法解析文件路径 "${raw}"：${errorMessage(error)}`)
      }
      displayPath = typeof target?.displayPath === 'string' && target.displayPath ? target.displayPath : raw
    }
    let info
    try {
      info = await fs.stat(target, signal)
    } catch (error) {
      throw attachmentError(ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND, `文件路径 "${raw}" 不存在或不可访问（会话工作区：${cwd || '未设置'}）：${errorMessage(error)}`)
    }
    if (info === undefined) throw attachmentError(ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND, `文件路径 "${raw}" 不存在或不可访问（会话工作区：${cwd || '未设置'}）`)
    if (info.type === 'directory') throw attachmentError(ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND, `目录不可注册为附件（${displayPath}）`)
    if (typeof info.size === 'number' && info.size > ATTACHMENT_FILE_MAX_BYTES) {
      throw attachmentError(ATTACHMENT_ERROR_CODES.FILE_TOO_LARGE, `文件超过大小上限（${displayPath}：${info.size} 字节 > 25MB）`)
    }
    let bytes
    try {
      bytes = await fs.readBytes(target, signal, ATTACHMENT_FILE_MAX_BYTES)
    } catch (error) {
      throw attachmentError(ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND, `读取文件 "${displayPath}" 失败：${errorMessage(error)}`)
    }
    if (bytes.length > ATTACHMENT_FILE_MAX_BYTES) {
      throw attachmentError(ATTACHMENT_ERROR_CODES.FILE_TOO_LARGE, `文件超过大小上限（${displayPath}：${bytes.length} 字节 > 25MB）`)
    }
    const mediaType = detectImageMediaType(bytes)
    if (mediaType) {
      const attachments = this.attachmentsService
      if (!attachments || typeof attachments.saveImage !== 'function') {
        throw attachmentError(ATTACHMENT_ERROR_CODES.STORE_UNAVAILABLE, '附件服务不可用，无法为图片文件建立内容寻址引用')
      }
      let ref
      try {
        ref = await attachments.saveImage({ data: bytes, mediaType, name: basename(displayPath) })
      } catch (error) {
        throw attachmentError(ATTACHMENT_ERROR_CODES.STORE_UNAVAILABLE, `图片文件 "${displayPath}" 无法注入：${errorMessage(error)}`)
      }
      const id = String(ref?.attachmentId ?? '')
      if (!isAttachmentId(id)) throw attachmentError(ATTACHMENT_ERROR_CODES.INVALID_ATTACHMENT_ID, `附件服务返回了非内容寻址 id（${displayPath}：${id || '空'}）`)
      return this.registerEntry({
        id,
        mediaType: typeof ref.mediaType === 'string' && ref.mediaType ? ref.mediaType : mediaType,
        bytes: typeof ref.bytes === 'number' ? ref.bytes : bytes.length,
        ...(typeof ref.width === 'number' ? { width: ref.width } : {}),
        ...(typeof ref.height === 'number' ? { height: ref.height } : {}),
        ...(typeof ref.name === 'string' && ref.name ? { name: ref.name } : { name: basename(displayPath) }),
        source,
        ...(source === 'url' ? { workspacePath: displayPath } : {}),
      })
    }
    // 非图片：字节哈希内容寻址 + 工作区路径物理载体（§5.1；媒体白名单
    // 与 audio/video 魔数判定待 V-DSH-4 验证，5a 不启用 UNSUPPORTED_MEDIA）。
    const id = contentHashId(bytes)
    return this.registerEntry({
      id,
      mediaType: 'application/octet-stream',
      bytes: bytes.length,
      name: basename(displayPath),
      workspacePath: displayPath,
      source,
    })
  }

  /** URL 下载：落盘到工作区 .router-files/，返回 { target, displayPath }（对齐
   *  service.js downloadInputFile；M2 为依赖源，本实现自包含）。 */
  async downloadToWorkspace(url, options = {}) {
    const { cwd, signal } = options
    if (!cwd) throw attachmentError(ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND, `files URL 落盘需要会话工作目录：${url}`)
    const dir = join(cwd, '.router-files')
    try {
      mkdirSync(dir, { recursive: true })
    } catch (error) {
      throw attachmentError(ATTACHMENT_ERROR_CODES.UPLOAD_FAILED, `无法创建工作区下载目录 ${dir}：${errorMessage(error)}`)
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ATTACHMENT_FETCH_TIMEOUT_MS)
    let response
    try {
      response = await globalThis.fetch(url, { signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal })
    } catch (error) {
      throw attachmentError(ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND, `files URL 下载失败（${url}）：${errorMessage(error)}`)
    } finally {
      clearTimeout(timer)
    }
    if (!response.ok) throw attachmentError(ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND, `files URL 下载失败（${url}）：HTTP ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length > ATTACHMENT_FILE_MAX_BYTES) {
      throw attachmentError(ATTACHMENT_ERROR_CODES.FILE_TOO_LARGE, `files URL 超过大小上限（${url}：${bytes.length} 字节 > 25MB）`)
    }
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
      throw attachmentError(ATTACHMENT_ERROR_CODES.UPLOAD_FAILED, `files URL 落盘失败（${target}）：${errorMessage(error)}`)
    }
    const fs = this.fsService
    let fsTarget
    try {
      fsTarget = await fs.resolve(target, {})
    } catch (error) {
      throw attachmentError(ATTACHMENT_ERROR_CODES.PATH_OUTSIDE_WORKSPACE, `files URL 落盘后无法解析（${target}）：${errorMessage(error)}`)
    }
    return { target: fsTarget, displayPath: typeof fsTarget?.displayPath === 'string' && fsTarget.displayPath ? fsTarget.displayPath : target }
  }

  /**
   * 懒注册内部实现（W-2，R5-F-1）：宿主 attachments.readImage 一次，返回
   * `{ entry, data }`——data 供 materialize 复用写盘，避免"懒注册读一次 +
   * 物化分支再读一次"的双读；读取失败/id 非法 → undefined（调用方映射
   * ATTACHMENT_UNKNOWN）。
   */
  async lazyRegisterById(id) {
    const attachments = this.attachmentsService
    if (!attachments) return undefined
    let stored
    try {
      stored = await attachments.readImage({ attachmentId: id })
    } catch {
      return undefined
    }
    if (!stored || !stored.data) return undefined
    const ref = stored.ref && typeof stored.ref === 'object' ? stored.ref : {}
    const entry = this.registerEntry({
      id,
      mediaType: typeof ref.mediaType === 'string' && ref.mediaType ? ref.mediaType : 'image/png',
      bytes: typeof ref.bytes === 'number' ? ref.bytes : stored.data.length,
      ...(typeof ref.width === 'number' ? { width: ref.width } : {}),
      ...(typeof ref.height === 'number' ? { height: ref.height } : {}),
      ...(typeof ref.name === 'string' && ref.name ? { name: ref.name } : {}),
      source: 'image-block',
    })
    return { entry, data: stored.data }
  }

  /**
   * 查注册表：已注册 → 直接返回；未命中但 id 合法（内容寻址格式）→
   * **懒注册降级**（W-2）：经宿主 attachments.readImage 尝试读取 → 成功则
   * 注册条目（source: 'image-block' 推断）并返回；读取失败/id 非法 → undefined
   * （调用方映射 ATTACHMENT_UNKNOWN）。覆盖跨轮指代闭环边界：主 agent 从
   * imageMemory 记忆段拿到的 id 可能未经本会话 registerPath。
   */
  async byId(id, options = {}) {
    if (!isAttachmentId(id)) return undefined
    const existing = this.entries.get(id)
    if (existing) {
      this.entries.delete(id)
      this.entries.set(id, existing)
      return existing
    }
    const lazy = await this.lazyRegisterById(id)
    return lazy ? lazy.entry : undefined
  }

  /** 反向查找：工作区路径 → 条目（仅已注册；命中刷新 LRU 序；未命中 undefined）。 */
  byPath(path) {
    if (typeof path !== 'string' || !path) return undefined
    const id = this.pathIndex.get(path)
    if (!id) return undefined
    return this.peek(id)
  }

  /**
   * 附件 → 路径（物化，§4.3.1 materialize）：写 .router-files/attachments/
   * <hex>.<ext>（供 CLI/agent 类型读取）。物化结果按会话作用域键
   * `${sessionId}\0${id}` 缓存（W-3）；未注册 id 先经 byId 懒注册。
   */
  async materialize(id, options = {}) {
    const { cwd, sessionId } = options
    if (!isAttachmentId(id)) throw attachmentError(ATTACHMENT_ERROR_CODES.INVALID_ATTACHMENT_ID, `附件 id 格式不匹配内容寻址（${String(id ?? '')}）`)
    if (typeof cwd !== 'string' || !cwd) throw attachmentError(ATTACHMENT_ERROR_CODES.PATH_OUTSIDE_WORKSPACE, '物化附件需要会话工作目录（cwd）')
    const cacheKey = `${sessionId ?? ''}\0${id}`
    const cached = this.materialized.get(cacheKey)
    if (cached) {
      this.materialized.delete(cacheKey)
      this.materialized.set(cacheKey, cached)
      return { path: cached.path, entry: cached.entry }
    }
    // 解析条目：已注册直接取（peek 刷新 LRU）；未注册走懒注册——宿主
    // readImage 一次并捕获字节（R5-F-1：物化分支复用同一字节，不再二次读取）。
    let entry = this.peek(id)
    let bytes = null
    if (!entry) {
      const lazy = await this.lazyRegisterById(id)
      if (!lazy) throw attachmentError(ATTACHMENT_ERROR_CODES.ATTACHMENT_UNKNOWN, `附件不可解析（${id}）：未注册且宿主无法读取`)
      entry = lazy.entry
      bytes = lazy.data
    }
    let path
    if (typeof entry.workspacePath === 'string' && entry.workspacePath) {
      path = entry.workspacePath
    } else {
      if (!bytes) {
        const attachments = this.attachmentsService
        if (!attachments) throw attachmentError(ATTACHMENT_ERROR_CODES.STORE_UNAVAILABLE, '附件服务不可用，无法物化附件')
        let stored
        try {
          stored = await attachments.readImage({ attachmentId: id })
        } catch (error) {
          throw attachmentError(ATTACHMENT_ERROR_CODES.ATTACHMENT_UNKNOWN, `附件读取失败（${id}）：${errorMessage(error)}`)
        }
        if (!stored || !stored.data) throw attachmentError(ATTACHMENT_ERROR_CODES.ATTACHMENT_UNKNOWN, `附件读取失败（${id}）：宿主返回空数据`)
        bytes = stored.data
      }
      const extOf = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
      const ext = extOf[entry.mediaType] ?? 'bin'
      const dir = join(cwd, '.router-files', ATTACHMENT_MATERIALIZE_DIR)
      try {
        mkdirSync(dir, { recursive: true })
      } catch (error) {
        throw attachmentError(ATTACHMENT_ERROR_CODES.UPLOAD_FAILED, `无法创建物化目录 ${dir}：${errorMessage(error)}`)
      }
      path = join(dir, `${id.slice('sha256:'.length)}.${ext}`)
      try {
        writeFileSync(path, bytes)
      } catch (error) {
        throw attachmentError(ATTACHMENT_ERROR_CODES.UPLOAD_FAILED, `附件物化落盘失败（${path}）：${errorMessage(error)}`)
      }
    }
    const result = { path, entry }
    this.materialized.delete(cacheKey)
    this.materialized.set(cacheKey, result)
    while (this.materialized.size > ATTACHMENT_MATERIALIZE_CACHE_MAX) {
      this.materialized.delete(this.materialized.keys().next().value)
    }
    return result
  }

  /**
   * 统一解析入口（§4.3.1 resolve）：id | 工作区路径 | http(s) URL →
   * 可执行条目。id 分支 = byId 懒注册语义（未注册合法宿主 id → readImage
   * 降级注册）；路径分支经 fs.resolve/stat 校验；失败明确报错（不静默）。
   */
  async resolve(ref, options = {}) {
    const { cwd, signal, sessionId } = options
    const raw = typeof ref === 'string' ? ref.trim() : ''
    if (!raw) throw attachmentError(ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND, '附件引用不能为空')
    if (isAttachmentId(raw)) {
      const entry = await this.byId(raw, { sessionId })
      if (!entry) throw attachmentError(ATTACHMENT_ERROR_CODES.ATTACHMENT_UNKNOWN, `附件不可解析（${raw}）：未注册且宿主无法读取`)
      return { kind: 'attachment', id: raw, entry }
    }
    if (/^https?:\/\//i.test(raw)) return { kind: 'url', path: raw }
    const fs = this.fsService
    if (!fs) throw attachmentError(ATTACHMENT_ERROR_CODES.STORE_UNAVAILABLE, '文件服务不可用，无法解析附件路径')
    let target
    try {
      target = await fs.resolve(raw, { ...(cwd ? { cwd } : {}) })
    } catch (error) {
      throw attachmentError(ATTACHMENT_ERROR_CODES.PATH_OUTSIDE_WORKSPACE, `无法解析文件路径 "${raw}"：${errorMessage(error)}`)
    }
    try {
      const info = await fs.stat(target, signal)
      if (info === undefined) throw attachmentError(ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND, `文件路径 "${raw}" 不存在或不可访问（会话工作区：${cwd || '未设置'}）`)
      if (info.type === 'directory') throw attachmentError(ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND, `目录不可作为附件引用（${raw}）`)
    } catch (error) {
      if (error && typeof error.code === 'string' && ATTACHMENT_ERROR_CODES[error.code] === error.code) throw error
      throw attachmentError(ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND, `文件路径 "${raw}" 不存在或不可访问（会话工作区：${cwd || '未设置'}）：${errorMessage(error)}`)
    }
    return { kind: 'path', path: typeof target?.displayPath === 'string' && target.displayPath ? target.displayPath : raw }
  }

  /**
   * 内容寻址读取（§4.3.1 read）：image → 宿主 attachments.readImage；
   * 有 workspacePath 的条目（audio/video/doc 物理载体）→ fs.readBytes。
   */
  async read(id, options = {}) {
    const { signal } = options
    if (!isAttachmentId(id)) throw attachmentError(ATTACHMENT_ERROR_CODES.INVALID_ATTACHMENT_ID, `附件 id 格式不匹配内容寻址（${String(id ?? '')}）`)
    const entry = this.entries.get(id)
    if (entry && typeof entry.workspacePath === 'string' && entry.workspacePath) {
      const fs = this.fsService
      if (!fs || typeof fs.resolve !== 'function' || typeof fs.readBytes !== 'function') throw attachmentError(ATTACHMENT_ERROR_CODES.STORE_UNAVAILABLE, '文件服务不可用，无法读取附件文件')
      // R5-F-2：与 registerPath/service.js 保持一致——先经 fs.resolve 取 FsTarget
      // 对象再 readBytes（宿主 readBytes 签名按 FsTarget 形态契约）。
      let target
      try {
        target = await fs.resolve(entry.workspacePath, {})
      } catch (error) {
        throw attachmentError(ATTACHMENT_ERROR_CODES.ATTACHMENT_UNKNOWN, `附件文件无法解析（${id}）：${errorMessage(error)}`)
      }
      let bytes
      try {
        bytes = await fs.readBytes(target, signal, ATTACHMENT_FILE_MAX_BYTES)
      } catch (error) {
        throw attachmentError(ATTACHMENT_ERROR_CODES.ATTACHMENT_UNKNOWN, `附件文件读取失败（${id}）：${errorMessage(error)}`)
      }
      return { bytes, ref: { attachmentId: id, ...(entry.mediaType ? { mediaType: entry.mediaType } : {}), ...(entry.name ? { name: entry.name } : {}) } }
    }
    const attachments = this.attachmentsService
    if (!attachments) throw attachmentError(ATTACHMENT_ERROR_CODES.STORE_UNAVAILABLE, '附件服务不可用，无法读取附件')
    let stored
    try {
      stored = await attachments.readImage({ attachmentId: id })
    } catch (error) {
      throw attachmentError(ATTACHMENT_ERROR_CODES.ATTACHMENT_UNKNOWN, `附件读取失败（${id}）：${errorMessage(error)}`)
    }
    if (!stored || !stored.data) throw attachmentError(ATTACHMENT_ERROR_CODES.ATTACHMENT_UNKNOWN, `附件读取失败（${id}）：宿主返回空数据`)
    return { bytes: stored.data, ref: stored.ref && typeof stored.ref === 'object' ? stored.ref : { attachmentId: id } }
  }

  /** 释放全部进程内状态（插件卸载 / 测试隔离）。 */
  close() {
    this.entries.clear()
    this.pathIndex.clear()
    this.materialized.clear()
  }
}
