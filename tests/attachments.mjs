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
import { RouterService } from '../lib/service.js'

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

    // ── R5-F-1：未注册 id 首次物化单读（懒注册字节复用，不再二次 readImage）──
    // 预置"宿主有、注册表无"的新附件（绕过注册表 saveImage），直接 materialize：
    // 懒注册读一次 + 物化分支复用同一字节写盘 = 全程 1 次 readImage。
    const freshBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    await attachments.saveImage({ data: freshBytes, mediaType: 'image/gif', name: 'fresh.gif' })
    const freshId = contentHashId(freshBytes)
    const beforeFresh = attachments.calls.readImage
    const matFresh = await registry.materialize(freshId, { cwd: WORKSPACE, sessionId: 'session-F1' })
    check('materialize unregistered id single host read (F-1)', attachments.calls.readImage === beforeFresh + 1 && matFresh.path === join(WORKSPACE, '.router-files', 'attachments', `${freshId.slice('sha256:'.length)}.gif`))
    check('materialize unregistered id writes file bytes', readFileSync(matFresh.path).length === freshBytes.length)
    const matFreshCached = await registry.materialize(freshId, { cwd: WORKSPACE, sessionId: 'session-F1' })
    check('materialize unregistered id cached after first (F-1)', matFreshCached.path === matFresh.path && attachments.calls.readImage === beforeFresh + 1)

    // ── R5-F-2：read() 对 workspacePath 条目经 fs.resolve 取 FsTarget 再 readBytes ──
    // 严格 fs：readBytes 只接受 FsTarget 对象形态（与 registerPath/service.js 一致）。
    {
      const strictFs = makeFs({ [notesPath]: new TextEncoder().encode('hello 文本内容') })
      strictFs.readBytes = async (target) => {
        if (typeof target === 'string' || !target || typeof target.displayPath !== 'string') throw new Error('readBytes must receive FsTarget object')
        return new TextEncoder().encode('hello 文本内容')
      }
      const strictRoot = new Context()
      strictRoot.provide('attachments', makeAttachments())
      strictRoot.provide('fs', strictFs)
      const strictRegistry = new AttachmentRegistry(strictRoot)
      const strictEntry = await strictRegistry.registerPath(notesPath, { cwd: WORKSPACE })
      const strictRead = await strictRegistry.read(strictEntry.id)
      check('read resolves FsTarget before fs.readBytes (F-2)', strictRead.bytes.length === 18 && strictRead.ref.name === 'notes.txt')
    }

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

  // ── Step 5b 迁移后断言：三调用点寻址经 M2（RouterService 接线）────────
  console.log('step 5b addressing via M2:')
  {
    const MIG_PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])
    // 最小 RouterService 测试基建（与 smoke.mjs root.provide 同构；附件/文件
    // 服务用本文件的契约一致 mock——saveImage 返回内容寻址 sha256 id）。
    const makeRouterHarness = (files) => {
      const attachments = makeAttachments()
      const fs = makeFs(files ?? {})
      const root = new Context()
      root.provide('attachments', attachments)
      root.provide('fs', fs)
      root.provide('llm', {
        resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }),
        stream: async function* () {
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'text-delta', index: 0, text: 'ok' }
          yield { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      })
      const service = new RouterService(root)
      service.attach({ get: () => ({ enabled: true, agents: { vision: { name: '视觉', type: 'chat', enabled: true, description: '看图', capabilities: ['image'], provider: 'openai', model: 'gpt-4o', maxRounds: 1 } } }) })
      return { service, attachments, fs }
    }

    // files 注入经 M2：chat 类型 files 图片寻址结果注册进统一索引（注册表条目存在）。
    {
      const { service } = makeRouterHarness({ [join(WORKSPACE, 'shot.png')]: MIG_PNG_BYTES })
      const run = await service.run({
        agentId: 'vision',
        task: '看图写摘要',
        images: [],
        files: ['shot.png'],
        exec: { agent: { session: { header: { cwd: WORKSPACE, delegationDepth: 0 } } } },
      })
      const expectedId = contentHashId(MIG_PNG_BYTES)
      check('chat files injection registers M2 entry', run.kind === 'chat' && (await service.registry.byId(expectedId))?.id === expectedId)
      check('chat files image ref carries registry id', Array.isArray(run.images) && run.images.length === 1 && run.images[0].attachmentId === expectedId && run.images[0].name === 'shot.png' && run.images[0].mediaType === 'image/png')
    }

    // CLI 物化经 M2：materializeCliImages 对内容寻址附件经注册表物化
    // （懒注册单读 + 会话作用域缓存；解析路径经过 registry）。
    {
      const { service, attachments } = makeRouterHarness({})
      const cliBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x03, 0x00, 0x01, 0x00])
      await attachments.saveImage({ data: cliBytes, mediaType: 'image/gif', name: 'cli.gif' })
      const cliId = contentHashId(cliBytes)
      const cliDir = join(WORKSPACE, '.router-files')
      const beforeCli = attachments.calls.readImage
      const cliPaths = await service.materializeCliImages([{ attachmentId: cliId }], cliDir, 'stamp-x', 'session-CLI')
      check('cli image materialize routes through M2 registry', cliPaths.length === 1 && cliPaths[0] === join(WORKSPACE, '.router-files', 'attachments', `${cliId.slice('sha256:'.length)}.gif`))
      check('cli image materialize single read (F-1 via service)', attachments.calls.readImage === beforeCli + 1)
      const beforeCli2 = attachments.calls.readImage
      const cliPaths2 = await service.materializeCliImages([{ attachmentId: cliId }], cliDir, 'stamp-y', 'session-CLI')
      check('cli image materialize session cache hit', cliPaths2.length === 1 && cliPaths2[0] === cliPaths[0] && attachments.calls.readImage === beforeCli2)
      // 遗留 ref（无 attachmentId 的非内容寻址形态）不经注册表（注册表只索引
      // 内容寻址 id）——走直接宿主读取回退；宿主 mock 无法解析遗留 id 时
      // 单次读取失败即跳过（不抛错、不产生路径）。
      const legacyPaths = await service.materializeCliImages([{ id: 'att-legacy-1', kind: 'image' }], cliDir, 'stamp-z', 'session-CLI')
      check('cli materialize legacy ref skipped without registry', legacyPaths.length === 0 && attachments.calls.readImage === beforeCli2 + 1)
    }

    // 附件派发经 M2：selectAttachments 把派发到的内容寻址附件懒注册进注册表
    // （统一索引）；非内容寻址遗留 ref 跳过。
    {
      const { service, attachments } = makeRouterHarness({})
      const pickBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])
      await attachments.saveImage({ data: pickBytes, mediaType: 'image/png', name: 'pick.png' })
      const pickId = contentHashId(pickBytes)
      const pickAgent = {
        session: {
          deriveMessages: () => [
            { role: 'user', content: [
              { type: 'image', attachment: { attachmentId: pickId, mediaType: 'image/png', name: 'pick.png' } },
              { type: 'image', attachment: { id: 'legacy-1', kind: 'image' } },
            ] },
          ],
        },
      }
      const beforePick = attachments.calls.readImage
      const picked = service.selectAttachments(pickAgent, { includeImages: true })
      check('selectAttachments returns picked refs unchanged', picked.length === 2 && picked[0].attachmentId === pickId)
      // fire-and-forget 注册：等微任务结算后注册表条目应已建立（懒注册单读）。
      await new Promise((resolve) => setTimeout(resolve, 0))
      check('selectAttachments registers content-addressed id into M2', (await service.registry.byId(pickId))?.id === pickId && service.registry.entries.size === 1)
      check('selectAttachments lazy registration single read', attachments.calls.readImage === beforePick + 1)
    }
  }
  rmSync(WORKSPACE, { recursive: true, force: true })
}
