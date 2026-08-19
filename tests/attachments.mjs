/**
 * M2 附件编址层测试（v3 Step 5a，MIG-001）：三向映射往返、错误码（含懒注册
 * 失败 → ATTACHMENT_UNKNOWN）、物化缓存会话隔离、LRU 边界。
 *
 * 与 install-entry.mjs 同构：导出 runAttachmentTests(check)，由 smoke.mjs
 * 调用（smoke 回归 = 本文件 + 既有断言全绿）。
 */
import { Context } from '@deepseek-ai/cordis'
import { rmSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AttachmentRegistry, isAttachmentId, contentHashId, ATTACHMENT_ID_RE, ATTACHMENT_REGISTRY_MAX_ENTRIES, ATTACHMENT_ERROR_CODES } from '../lib/attachments.js'

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const WORKSPACE = join(ROOT_DIR, '.test-attachments-work')

/** 假附件服务：内容寻址去重 + 按 id 读回（与宿主 dsh-attachment 同构）。 */
function makeAttachments() {
  const store = new Map()
  const calls = { saveImage: 0, readImage: 0 }
  const service = {
    calls,
    imageLimits: { maxImageBytes: 20 * 1024 * 1024, maxImagesPerMessage: 8, maxMessageImageBytes: 40 * 1024 * 1024, maxImagePixels: 100_000_000, mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
    async saveImage(input) {
      calls.saveImage++
      const id = contentHashId(input.data)
      const ref = { attachmentId: id, mediaType: input.mediaType, bytes: input.data.length, width: 2, height: 2, name: input.name }
      store.set(id, { ref, data: input.data })
      return ref
    },
    async readImage(ref) {
      calls.readImage++
      const stored = store.get(String(ref?.attachmentId ?? ''))
      if (!stored) throw new Error('attachment not found')
      return { ref: stored.ref, data: stored.data }
    },
  }
  return service
}

/** 假文件服务：工作区沙箱 + 内容映射（与 smoke.mjs root.provide('fs') 同构）；
 *  映射外但位于真实 WORKSPACE 下的路径回退真实文件系统（URL 下载落盘后
 *  的读取路径）。 */
function makeFs(files) {
  const map = new Map()
  for (const [path, bytes] of Object.entries(files ?? {})) map.set(path, bytes)
  const real = (raw) => raw.startsWith(WORKSPACE)
  return {
    resolve: async (path, options = {}) => {
      const raw = String(path)
      if (raw.includes('outside')) throw new Error('outside workspace')
      const target = raw.includes(':') || raw.startsWith('/') ? raw : join(options.cwd ?? '', raw)
      return { displayPath: target }
    },
    stat: async (target) => {
      const raw = String(target?.displayPath ?? target ?? '')
      if (raw.includes('missing')) return undefined
      if (map.has(raw)) return { type: 'file', version: 1, size: map.get(raw).length }
      if (real(raw)) {
        try {
          const info = statSync(raw)
          return { type: info.isDirectory() ? 'directory' : 'file', version: 1, size: info.size }
        } catch { return undefined }
      }
      if (raw.endsWith('dir')) return { type: 'directory', version: 1 }
      return { type: 'file', version: 1, size: 0 }
    },
    readBytes: async (target) => {
      const raw = String(target?.displayPath ?? target ?? '')
      if (map.has(raw)) return map.get(raw)
      if (real(raw)) return readFileSync(raw)
      throw new Error('not found')
    },
  }
}

export async function runAttachmentTests(check) {
  rmSync(WORKSPACE, { recursive: true, force: true })
  console.log('attachment registry (M2):')
  {
    const attachments = makeAttachments()
    const fs = makeFs({
      [join(WORKSPACE, 'notes.txt')]: new TextEncoder().encode('hello 文本内容'),
      [join(WORKSPACE, 'shot.png')]: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]),
      [join(WORKSPACE, 'missing.bin')]: undefined,
    })
    const root = new Context()
    root.provide('attachments', attachments)
    root.provide('fs', fs)
    const registry = new AttachmentRegistry(root)
    const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])

    // ── id 格式与工具函数 ──
    check('id format accepts content-addressed sha256', isAttachmentId('sha256:' + 'a'.repeat(64)) && ATTACHMENT_ID_RE.test('sha256:' + 'B'.repeat(64)))
    check('id format rejects non-conforming', !isAttachmentId('att-1') && !isAttachmentId('sha256:short') && !isAttachmentId(''))
    check('contentHashId derives deterministic id', contentHashId(PNG_BYTES) === contentHashId(PNG_BYTES) && contentHashId(PNG_BYTES).startsWith('sha256:') && contentHashId(PNG_BYTES).length === 'sha256:'.length + 64)

    // ── 三向映射：非图片文件注册（路径 → id；byId/byPath 互查）──
    const notesPath = join(WORKSPACE, 'notes.txt')
    const fileEntry = await registry.registerPath(notesPath, { cwd: WORKSPACE })
    check('registerPath registers non-image with hash id', isAttachmentId(fileEntry.id) && fileEntry.mediaType === 'application/octet-stream' && fileEntry.bytes === 18 && fileEntry.name === 'notes.txt' && fileEntry.workspacePath === notesPath && fileEntry.source === 'files')
    check('byPath finds registered path', registry.byPath(notesPath)?.id === fileEntry.id)
    check('byId returns registered entry', (await registry.byId(fileEntry.id))?.id === fileEntry.id)
    const resolvedPath = await registry.resolve(notesPath, { cwd: WORKSPACE })
    check('resolve path kind', resolvedPath.kind === 'path' && resolvedPath.path === notesPath)
    const resolvedId = await registry.resolve(fileEntry.id)
    check('resolve id kind + entry', resolvedId.kind === 'attachment' && resolvedId.id === fileEntry.id && resolvedId.entry?.mediaType === 'application/octet-stream')

    // ── 三向映射：图片文件注册（saveImage 内容寻址去重）──
    const shotPath = join(WORKSPACE, 'shot.png')
    const imageEntry = await registry.registerPath(shotPath, { cwd: WORKSPACE })
    check('registerPath routes image through saveImage', imageEntry.mediaType === 'image/png' && imageEntry.width === 2 && imageEntry.height === 2 && attachments.calls.saveImage === 1)
    const imageEntryAgain = await registry.registerPath(shotPath, { cwd: WORKSPACE })
    check('saveImage dedupes identical bytes (same id)', imageEntryAgain.id === imageEntry.id && attachments.calls.saveImage === 2)

    // ── read：image 走宿主 readImage；非图片走 fs.readBytes ──
    const imageRead = await registry.read(imageEntry.id)
    check('read image delegates to host readImage', imageRead.bytes.length === PNG_BYTES.length && imageRead.ref.attachmentId === imageEntry.id)
    const fileRead = await registry.read(fileEntry.id)
    check('read workspace file via fs.readBytes', fileRead.bytes.length === 18 && fileRead.ref.name === 'notes.txt')
    let invalidReadRejected = false
    try { await registry.read('sha256:' + 'c'.repeat(64)) } catch (error) { invalidReadRejected = error.code === ATTACHMENT_ERROR_CODES.ATTACHMENT_UNKNOWN }
    check('read unknown attachment throws ATTACHMENT_UNKNOWN', invalidReadRejected)

    // ── 懒注册降级（W-2）：未注册但宿主可读的 id → 自动注册 ──
    // 预置"宿主有、注册表无"的字节：直接经假附件服务 saveImage（绕过注册表），
    // 其内容寻址 id 即懒注册目标。
    const lazyBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00])
    await attachments.saveImage({ data: lazyBytes, mediaType: 'image/gif', name: 'lazy.gif' })
    const lazyId = contentHashId(lazyBytes)
    const beforeReadCalls = attachments.calls.readImage
    const lazyEntry = await registry.byId(lazyId)
    check('byId lazy-registers host-readable id', lazyEntry !== undefined && lazyEntry.id === lazyId && lazyEntry.source === 'image-block' && attachments.calls.readImage === beforeReadCalls + 1)
    const lazyEntryCached = await registry.byId(lazyId)
    check('byId caches after lazy registration', lazyEntryCached?.id === lazyId && attachments.calls.readImage === beforeReadCalls + 1)
    const lazyResolve = await registry.resolve(lazyId)
    check('resolve lazy-registers unregistered id', lazyResolve.kind === 'attachment' && lazyResolve.entry?.source === 'image-block')

    // ── 懒注册失败 → ATTACHMENT_UNKNOWN ──
    const unknownId = 'sha256:' + 'd'.repeat(64)
    check('byId unknown returns undefined', (await registry.byId(unknownId)) === undefined)
    let unknownResolveRejected = false
    try { await registry.resolve(unknownId) } catch (error) { unknownResolveRejected = error.code === ATTACHMENT_ERROR_CODES.ATTACHMENT_UNKNOWN }
    check('resolve unknown id throws ATTACHMENT_UNKNOWN', unknownResolveRejected)

    // ── 错误码：FILE_NOT_FOUND / PATH_OUTSIDE_WORKSPACE / INVALID_ATTACHMENT_ID ──
    let missingRejected = false
    try { await registry.registerPath(join(WORKSPACE, 'missing.bin'), { cwd: WORKSPACE }) } catch (error) { missingRejected = error.code === ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND }
    check('registerPath missing file throws FILE_NOT_FOUND', missingRejected)
    let outsideRejected = false
    try { await registry.resolve('outside-x.bin', { cwd: WORKSPACE }) } catch (error) { outsideRejected = error.code === ATTACHMENT_ERROR_CODES.PATH_OUTSIDE_WORKSPACE }
    check('resolve outside workspace throws PATH_OUTSIDE_WORKSPACE', outsideRejected)
    let badIdRejected = false
    try { await registry.materialize('att-1', { cwd: WORKSPACE }) } catch (error) { badIdRejected = error.code === ATTACHMENT_ERROR_CODES.INVALID_ATTACHMENT_ID }
    check('materialize invalid id throws INVALID_ATTACHMENT_ID', badIdRejected)
    let unknownMaterialize = false
    try { await registry.materialize(unknownId, { cwd: WORKSPACE }) } catch (error) { unknownMaterialize = error.code === ATTACHMENT_ERROR_CODES.ATTACHMENT_UNKNOWN }
    check('materialize unknown id throws ATTACHMENT_UNKNOWN', unknownMaterialize)
    let noCwdRejected = false
    try { await registry.materialize(lazyId, {}) } catch (error) { noCwdRejected = error.code === ATTACHMENT_ERROR_CODES.PATH_OUTSIDE_WORKSPACE }
    check('materialize without cwd throws PATH_OUTSIDE_WORKSPACE', noCwdRejected)

    // ── 物化：写 .router-files/attachments/<hex>.<ext>；会话作用域缓存 ──
    const sessionA = 'session-A'
    const matA = await registry.materialize(lazyId, { cwd: WORKSPACE, sessionId: sessionA })
    check('materialize writes file under attachments dir', matA.path === join(WORKSPACE, '.router-files', 'attachments', `${lazyId.slice('sha256:'.length)}.gif`))
    const readCallsAfterFirst = attachments.calls.readImage
    const matA2 = await registry.materialize(lazyId, { cwd: WORKSPACE, sessionId: sessionA })
    check('materialize cache hit within session (no re-read)', matA2.path === matA.path && attachments.calls.readImage === readCallsAfterFirst)
    const matB = await registry.materialize(lazyId, { cwd: WORKSPACE, sessionId: 'session-B' })
    check('materialize re-materializes across sessions (different key, same path shape)', matB.path === matA.path && attachments.calls.readImage === readCallsAfterFirst + 1)
    const matAnon = await registry.materialize(lazyId, { cwd: WORKSPACE })
    check('materialize without sessionId uses anon key (re-read)', matAnon.path === matA.path && attachments.calls.readImage === readCallsAfterFirst + 2)
    const matFile = await registry.materialize(fileEntry.id, { cwd: WORKSPACE, sessionId: sessionA })
    check('materialize returns workspacePath directly for non-image', matFile.path === fileEntry.workspacePath && matFile.entry.id === fileEntry.id)

    // ── URL：注册（下载落盘 + 大小上限）──
    const fetched = []
    const realFetch = globalThis.fetch
    globalThis.fetch = async (url, options) => {
      if (String(url).includes('example.com/ok.bin')) {
        const bytes = new TextEncoder().encode('url-bytes')
        fetched.push({ url, options })
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer }
      }
      if (String(url).includes('example.com/big.bin')) {
        return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array(26 * 1024 * 1024).buffer }
      }
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }
    }
    try {
      const urlEntry = await registry.registerPath('https://example.com/ok.bin', { cwd: WORKSPACE })
      check('registerPath URL downloads to workspace and registers', urlEntry.source === 'url' && urlEntry.workspacePath === join(WORKSPACE, '.router-files', 'ok.bin') && urlEntry.bytes === 9 && fetched.length === 1)
      let urlBigRejected = false
      try { await registry.registerPath('https://example.com/big.bin', { cwd: WORKSPACE }) } catch (error) { urlBigRejected = error.code === ATTACHMENT_ERROR_CODES.FILE_TOO_LARGE }
      check('registerPath URL over limit throws FILE_TOO_LARGE', urlBigRejected)
      let urlNoCwd = false
      try { await registry.registerPath('https://example.com/ok.bin', {}) } catch (error) { urlNoCwd = error.code === ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND }
      check('registerPath URL without cwd throws FILE_NOT_FOUND', urlNoCwd)
      const resolvedUrl = await registry.resolve('https://example.com/ok.bin')
      check('resolve URL kind', resolvedUrl.kind === 'url' && resolvedUrl.path === 'https://example.com/ok.bin')
    } finally {
      globalThis.fetch = realFetch
    }

    // ── LRU：注册表超限逐出最旧（byPath 同步核验）──
    // lru-*.txt 均为虚构文件（不存在于真实工作区）：覆写 fs 面为"任何路径
    // 都是 1 字节文件"，专注注册表 LRU 语义。
    const lruFs = makeFs({})
    lruFs.resolve = async (path, options = {}) => {
      const target = String(path).includes(':') ? path : join(options.cwd ?? '', path)
      return { displayPath: target }
    }
    lruFs.stat = async (target) => {
      const raw = String(target?.displayPath ?? target ?? '')
      return raw.endsWith('dir') ? { type: 'directory', version: 1 } : { type: 'file', version: 1, size: 1 }
    }
    lruFs.readBytes = async (target) => new TextEncoder().encode(`bytes-${String(target?.displayPath ?? '')}`)
    const lruRoot = new Context()
    lruRoot.provide('attachments', makeAttachments())
    lruRoot.provide('fs', lruFs)
    const lruRegistry = new AttachmentRegistry(lruRoot)
    const lruPaths = []
    for (let index = 0; index < ATTACHMENT_REGISTRY_MAX_ENTRIES + 5; index++) {
      const path = join(WORKSPACE, `lru-${index}.txt`)
      lruPaths.push(path)
      await lruRegistry.registerPath(path, { cwd: WORKSPACE })
    }
    check('registry LRU evicts oldest beyond cap', lruRegistry.byPath(lruPaths[0]) === undefined && lruRegistry.byPath(lruPaths[lruPaths.length - 1]) !== undefined)
    check('registry size stays at cap', lruRegistry.entries.size === ATTACHMENT_REGISTRY_MAX_ENTRIES)
    // LRU 刷新：recall 存活最老条目（lru-5，0-4 已被逐出）后新注册一条 →
    // 淘汰次老（lru-6）而非被刷新者。
    const refreshedPath = lruPaths[5]
    const refreshedEntry = lruRegistry.byPath(refreshedPath)
    await lruRegistry.registerPath(join(WORKSPACE, 'lru-fresh.txt'), { cwd: WORKSPACE })
    check('registry LRU refresh protects recalled entry', refreshedEntry !== undefined && lruRegistry.byPath(refreshedPath)?.id === refreshedEntry.id && lruRegistry.byPath(lruPaths[6]) === undefined)

    // ── close：清空全部状态 ──
    registry.close()
    check('close clears registry state', registry.entries.size === 0 && registry.pathIndex.size === 0 && registry.materialized.size === 0)
  }
  rmSync(WORKSPACE, { recursive: true, force: true })
}
