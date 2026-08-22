// DEV-002 — 核心通路自动化测试套件：routing 决策链 + takeover 双层开关语义。
// 独立可重复：`node tests/routing-paths.mjs` 直跑（CLI runner + PASS/FAIL 计数 +
// exit 0/1）。零依赖既有测试文件（不 import tests/ 下任何模块）——EVO-002 Step 6
// 并行编辑 smoke.mjs 的中间态不影响本套件，独立性即本任务价值（R6-F1 教训：
// 裸跑零输出 = vacuous 命令，本文件顶层即打印、终态必输出计数）。
//
// ── 覆盖声明（stage-testing 纪律：测什么 / 不测什么 + 理由）──────────────────
//
// 测什么（行为断言，非存在性断言；每条附判别性推演——实现错误时必败）：
//  [A] route_agent 附件参数解析（service.selectAttachments）：indices 序号映射/
//      includeImages 快捷方式/两者都不给=不携带/并集去重/越界与非整数明确报错/
//      懒注册 fire-and-forget（M2 索引）。
//  [B] attachmentIds 附件统一编址 M2（service.resolveAttachmentIds + AttachmentRegistry）：
//      懒注册降级（W-2，未注册但宿主可读 → readImage 建立条目）/注册后零重复读/
//      列表内去重/空白容忍/非法 id 明确报错（INVALID 语义）/未知 id ATTACHMENT_UNKNOWN
//      （code+message 双断言）/LRU 容量淘汰/URL 下载失败（超时中止同路径）错误映射。
//  [C] route_agent 工具全链路（真实 lib/tool.js + 真实 RouterService + 桩宿主面）：
//      attachments/attachmentIds/includeImages 正交组合与跨通道按附件 id 去重/
//      files 非字符串过滤（LLM 幻觉参数形态）/chat 类型文本文件内容内联/
//      未知 agent 明确报错/总开关门控/timeoutMs 覆盖 cli 15min 窗口。
//  [D] 模态路由（image 能力标签 → 视觉 agent 派发）：modalityOfAgent 矩阵（chat+
//      image=consume；image 类型/cli+image=produce 绝不进识别目录——R8 事实）/
//      listImageVisionAgents 与 listImageGenerationAgents 目录分野/MODALITY_ENTRIES
//      stateOf 门控（总开关关闭/无模态 agent → 不激活）/带图派发真实到达 llm.stream/
//      文本模型前置拒绝/declared 路由跳过预检/改写标记识别-vs-生图分流/catalog 的
//      takeoverDefaultModel 镜像（客户端会话级开关的服务端 seam）。
//  [E] takeover 服务端双层语义（lib/wrapper.js installAdmissionWrapper + 真实
//      LlmRuntime，FIX-002 终态基线 72b2670+0b3c15d，语义权威 = review-FIX-002-R7/R8）：
//      默认 false 双层零触碰（含字段缺省 undefined 的 fail-safe——F8）/true 一次性
//      接管（恰一次写+模型保留）/接管后幂等/用户改回原生尊重（零覆盖）/用户改走别的
//      twin 尊重（只清记忆零写）/开关关回还原（不变量③：恰一次还原写）/dispose 还原/
//      遗留剥离 one-shot（不变量④：首剥恰一次+再选尊重+dispose 零写+重装自愈——守护
//      闭包级标记）/并发双事件单写（tookOverFrom 先于 await 置位的时序守护）。
//  [F] takeover 客户端会话级（真实 lib/client.js bundle + 本文件自带迷你 react——
//      与 client-render.mjs 零共享状态）：开关 false 不接管（F3-1 同型判别）/开关
//      true 接管+来源记忆生效（关回还原）/用户手动选的 twin 不撤销（F3-2 同型判别）/
//      双会话来源记忆隔离（per-session Map 判别）。
//
// 不测什么 + 理由：
//  - tests/smoke.mjs / client-render.mjs / metrics.mjs 等既有套件的断言域（P3 回归、
//    OAuth、stats、上传、prestep、设置页 UI 渲染、wrapper 流内改写/直传/记忆段）——
//    既有套件已覆盖；本任务验收明确排除以 smoke.mjs 作为验收（其正被 EVO-002 Step 6
//    并行编辑），本套件对其零 import。
//  - 客户端设置页（AgentsPage/cli 卡片/附件按钮）渲染域——client-render.mjs 939 行
//    专属夹具覆盖；本文件仅驱动 ModelTakeover 槽位（takeover 语义域所需最小面）。
//  - 真实 60s URL 下载计时——以超时中止同路径的错误映射（fetch reject → FILE_NOT_FOUND
//    带上下文）+ 时长契约常量断言代替（如实标注，不冒充实测计时）。
//  - OAuth/账号池/cli 子代理执行/上传域——各有专属套件（oauth-credentials.mjs 等）。
//
// ── 边界覆盖（≥5 类每类≥1，qa.md 硬门槛）───────────────────────────────────
//  null/缺省   : A9(agent=null→[]) B7(exec 缺省→id-only 解析) B5.3([null]→明确报错)
//                C14(exec.agent 缺省→成功零附件) D5(modalityOfAgent({})→chat 默认)
//  空          : A5(attachments=[]) C8(attachmentIds=[]) C15(files=[]) A9b(无图消息)
//  超长/极值   : A8(序号 MAX_SAFE_INTEGER→越界) B5.4(4096 字符 id→格式拒绝)
//                B11(5000 重复 id 列表→1 ref)
//  并发        : E13(双 sync 事件竞争接管窗口→恰一次写) B8(同 id 并发解析双双成功)
//  超时        : B9(URL 下载中止错误映射+60s 常量契约) C12(timeoutMs=20min≥cli 15min)
// ─────────────────────────────────────────────────────────────────────────────

import { Context } from '@deepseek-ai/cordis'
import { RouterService } from '../lib/service.js'
import { AttachmentRegistry, isAttachmentId, ATTACHMENT_REGISTRY_MAX_ENTRIES, ATTACHMENT_FETCH_TIMEOUT_MS, ATTACHMENT_ERROR_CODES } from '../lib/attachments.js'
import { installAdmissionWrapper, WRAP_SUFFIX, MODALITY_ENTRIES, minimalImageRewrite } from '../lib/wrapper.js'
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const LIB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib')

let pass = 0
let fail = 0
function check(label, condition) {
  if (condition) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.error(`FAIL  ${label}`) }
}
/** 断言 thunk 以含 match 的消息拒绝（同步/异步抛错均可）；返回是否如预期拒绝。 */
async function rejects(thunk, match) {
  try { await thunk() } catch (error) {
    const message = String(error?.message ?? error)
    if (message.includes(match)) return true
    console.error(`     (rejected with unexpected message: ${message})`)
    return false
  }
  console.error(`     (resolved instead of rejecting with "${match}")`)
  return false
}
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))
const flushAsync = async (turns = 12) => { for (let i = 0; i < turns; i++) await new Promise((resolve) => setImmediate(resolve)) }

console.log('routing-paths: routing 决策链 + takeover 双层语义（DEV-002）')

// 内容寻址 id 夹具（64 位 hex，符合 ATTACHMENT_ID_RE——只认 0-9a-f，勿用 g/h/u 等非 hex 字符）。
const IMG = (ch) => `sha256:${ch.repeat(64)}`
const IMG_A = IMG('a'), IMG_B = IMG('b'), IMG_C = IMG('c')
const IMG_E = IMG('e'), IMG_F = IMG('f')
const IMG_G = `sha256:${'0a'.repeat(32)}`, IMG_H = `sha256:${'0b'.repeat(32)}`
const IMG_U = `sha256:${'0c'.repeat(32)}` // 格式合法但宿主不可读（未知 id）

// ══════════════════════════════════════════════════════════════════════════
// 服务夹具：真实 RouterService + 桩宿主面（llm/fs/attachments/subagents）。
// 与 smoke.mjs 夹具同构但零共享：独立 Context、独立 agents 配置对象。
// ══════════════════════════════════════════════════════════════════════════
const svcConfig = {
  enabled: true,
  agents: {
    vision: { name: '视觉', type: 'chat', enabled: true, description: '看图', capabilities: ['image'], provider: 'openai', model: 'gpt-4o', maxRounds: 1 },
    draw: { name: '画图', type: 'image', enabled: true, provider: 'openai', model: 'dall-e-3' },
    codergen: { name: 'CLI生图', type: 'cli', enabled: true, capabilities: ['image'] },
    textchat: { name: '纯文本', type: 'chat', enabled: true, provider: 'openai', model: 'gpt-4o' },
    textbrain: { name: '文本模型', type: 'chat', enabled: true, provider: 'text-only', model: 't1' },
    relay: { name: '中转', type: 'chat', enabled: true, provider: 'relay', model: 'gpt-5.6-luna' },
    helper: { name: '子代理', type: 'agent', enabled: true, provider: 'openai', model: 'gpt-4o' },
    off: { name: '关', type: 'chat', enabled: false },
  },
  oauthAccounts: {}, pools: {}, cliAgents: {},
}

const chatRequests = []
const delegationRequests = []
const readImageCounts = new Map()
const knownIds = new Set([IMG_A, IMG_B, IMG_C, IMG_E, IMG_F, IMG_G, IMG_H])

const svcRoot = new Context()
svcRoot.provide('llm', {
  listModels: async (provider) => (provider === 'openai' ? [{ id: 'gpt-4o', name: 'GPT-4o' }] : []),
  // 能力矩阵：openai 含 image；其余（text-only 等）纯文本。declared 路由跳过预检用 listProviders。
  resolveModelInfo: async (provider) => ({ inputModalities: provider === 'openai' ? ['text', 'image'] : ['text'] }),
  listProviders: async () => [{ id: 'relay', provider: 'relay', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'relay'], active: true, declared: true }],
  stream: async function* (request) {
    chatRequests.push(request)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: '识别完成' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: '识别完成' } }
    yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 3 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  },
})
svcRoot.provide('subagents', {
  start: async (_kind, request) => {
    delegationRequests.push(request)
    return { result: Promise.resolve({ output: [{ type: 'text', text: '子代理完成' }], stopReason: 'completed' }), dispose: async () => undefined }
  },
})
svcRoot.provide('attachments', {
  readImage: async ({ attachmentId }) => {
    readImageCounts.set(attachmentId, (readImageCounts.get(attachmentId) ?? 0) + 1)
    if (!knownIds.has(attachmentId)) throw new Error('no such attachment')
    return { ref: { attachmentId, mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: `${attachmentId.slice(7, 9)}.png` }, data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }
  },
  saveImage: async (input) => ({ attachmentId: `att-file-${input.name}`, mediaType: input.mediaType, bytes: input.data.length, width: 2, height: 2, name: input.name }),
})
svcRoot.provide('fs', {
  resolve: async (path, opts) => {
    const raw = String(path)
    const cwd = opts && typeof opts.cwd === 'string' && opts.cwd ? opts.cwd : ''
    const displayPath = raw.includes(':') || raw.startsWith('/') ? raw : (cwd ? `${cwd}/${raw}` : `D:/work/routing/${raw}`)
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
    if (displayPath.toLowerCase().endsWith('.txt')) return new TextEncoder().encode('hello 文本内容')
    return new Uint8Array([0xff, 0xfe, 0x00])
  },
})

const service = new RouterService(svcRoot)
service.attach({ get: () => svcConfig })

// 最近一条含附件的用户消息（3 张图，含内容寻址 attachmentId）。
const sessionAgent = {
  session: {
    header: { cwd: 'D:/work/routing', delegationDepth: 0 },
    deriveMessages: () => [
      { role: 'user', content: [{ type: 'text', text: '老消息无图' }] },
      { role: 'assistant', content: [{ type: 'text', text: '收到' }] },
      { role: 'user', content: [
        { type: 'text', text: '看这三张图' },
        { type: 'image', attachment: { id: 'att-a', attachmentId: IMG_A, mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'a.png' } },
        { type: 'image', attachment: { id: 'att-b', attachmentId: IMG_B, mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'b.png' } },
        { type: 'image', attachment: { id: 'att-c', attachmentId: IMG_C, mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'c.png' } },
      ] },
    ],
  },
}
const execOf = (agent = sessionAgent) => ({ agent, signal: undefined })

// ── [A] selectAttachments 参数语义（真实 service，直接调用）──────────────────
console.log('A. selectAttachments 参数解析:')
{
  // A1 判别：序号映射若偏移/颠倒/逆序，picked 顺序 (att-c, att-a) 必不匹配。
  const picked = service.selectAttachments(sessionAgent, { indices: [2, 0] })
  check('[A1] indices 按序映射（保留选择顺序）', picked.length === 2 && picked[0].id === 'att-c' && picked[1].id === 'att-a')
  // A2 判别：includeImages 若只取首图或掺入文本块，长度/首元素必不匹配。
  const all = service.selectAttachments(sessionAgent, { includeImages: true })
  check('[A2] includeImages 转发全部图片', all.length === 3 && all[0].id === 'att-a' && all[2].id === 'att-c')
  // A3 判别：并集若不去重（concat 后重复），长度 4 ≠ 3。
  const merged = service.selectAttachments(sessionAgent, { indices: [1], includeImages: true })
  check('[A3] indices+includeImages 并集去重', merged.length === 3 && merged[0].id === 'att-b')
  // A4 判别：默认不携带是"按需显式派发"的核心（DEC：杜绝隐式 find 拿错）——若默认全带/隐式取最近一张，length 0 必败。
  check('[A4] 两者都不给=不携带附件（默认 none）', service.selectAttachments(sessionAgent).length === 0)
  // A5（空）判别：空数组若被误当"全选"或抛错，结果 ≠ []。
  check('[A5] attachments 空数组视为未提供', service.selectAttachments(sessionAgent, { indices: [] }).length === 0)
  // A6 判别：越界报错需带可用范围上下文；若静默忽略/undefined 入表，rejects 必败。
  check('[A6] 越界序号明确报错（含总数上下文）', await rejects(() => service.selectAttachments(sessionAgent, { indices: [3] }), '共 3 个附件'))
  // A7（边界：非整数/字符串序号——LLM 常见参数形态）判别：非 Number.isInteger 一律拒绝。
  check('[A7a] 非整数序号拒绝', await rejects(() => service.selectAttachments(sessionAgent, { indices: [1.5] }), '必须是整数'))
  check('[A7b] 字符串序号拒绝', await rejects(() => service.selectAttachments(sessionAgent, { indices: ['1'] }), '必须是整数'))
  // A8（超长/极值）判别：MAX_SAFE_INTEGER 远超界——走同一越界分支。
  check('[A8] 极大序号同样越界报错', await rejects(() => service.selectAttachments(sessionAgent, { indices: [Number.MAX_SAFE_INTEGER] }), '不存在'))
  // A9（null/缺省 + 无图消息）判别：agent=null / 无 image 块 → 恒 []；若抛错或隐式选择必败。
  check('[A9a] agent=null → 空附件（不抛错）', service.selectAttachments(null, { includeImages: true }).length === 0)
  const textOnlyAgent = { session: { header: { cwd: 'D:/work/routing' }, deriveMessages: () => [{ role: 'user', content: [{ type: 'text', text: '纯文本' }] }] } }
  check('[A9b] 无图用户消息 → includeImages 也为空', service.selectAttachments(textOnlyAgent, { includeImages: true }).length === 0)
  // A10 懒注册（M2 fire-and-forget）：派发到的内容寻址附件被注册进统一索引。
  // 判别：selectAttachments 若不再经 M2 注册（回归 Step 5 前形态），peek 恒 undefined → 必败。
  {
    const freshAgent = { session: { header: { cwd: 'D:/work/routing' }, deriveMessages: () => [{ role: 'user', content: [{ type: 'image', attachment: { id: 'att-g', attachmentId: IMG_G, mediaType: 'image/png', bytes: 4, width: 2, height: 2 } }] }] } }
    check('[A10a] 懒注册前置：未派发前注册表无条目', service.registry.peek(IMG_G) === undefined)
    service.selectAttachments(freshAgent, { includeImages: true })
    await flushAsync()
    const entry = service.registry.peek(IMG_G)
    check('[A10b] 派发后内容寻址附件进入 M2 注册表（source=image-block）', entry && entry.id === IMG_G && entry.source === 'image-block')
  }
}

// ── [B] attachmentIds 附件统一编址 M2（resolveAttachmentIds + AttachmentRegistry）──
console.log('B. attachmentIds 统一编址 (M2):')
{
  // B1 懒注册降级（W-2）：未注册但宿主可读 → readImage 建立条目并返回规范 ref。
  // 判别：若无懒注册（严格注册表——未注册即拒绝），本调用必抛 ATTACHMENT_UNKNOWN → 必败。
  const countBefore = readImageCounts.get(IMG_E) ?? 0
  const refs = await service.resolveAttachmentIds([IMG_E], execOf())
  check('[B1] 未注册合法 id 经懒注册解析成功', refs.length === 1 && refs[0].attachmentId === IMG_E && refs[0].kind === 'image' && refs[0].mediaType === 'image/png' && typeof refs[0].bytes === 'number')
  check('[B1b] 懒注册真实调用了宿主 readImage', (readImageCounts.get(IMG_E) ?? 0) > countBefore)
  check('[B1c] 条目已建立（后续解析走缓存）', service.registry.peek(IMG_E)?.id === IMG_E)
  // B2 判别：注册表命中若仍重复读宿主（无缓存/每次 readImage），计数必增 → 必败。
  const cached = readImageCounts.get(IMG_E)
  await service.resolveAttachmentIds([IMG_E], execOf())
  check('[B2] 已注册 id 二次解析零重复宿主读取', readImageCounts.get(IMG_E) === cached)
  // B3 判别：列表内去重（seen 集）失效 → 2 条重复 ref。
  check('[B3] 列表内重复 id 去重', (await service.resolveAttachmentIds([IMG_E, IMG_E], execOf())).length === 1)
  // B4 判别：id 解析前 trim；若不 trim，' sha256:… ' 不匹配内容寻址格式必报错。
  check('[B4] id 空白容忍（trim 后解析）', (await service.resolveAttachmentIds([`  ${IMG_E}  `], execOf())).length === 1)
  // B5（非法 id 明确报错——INVALID_ATTACHMENT_ID 语义）判别：静默跳过/放行任意字符串必败。
  check('[B5a] 非内容寻址 id 拒绝（普通附件名）', await rejects(() => service.resolveAttachmentIds(['att-1'], execOf()), '内容寻址'))
  check('[B5b] 短 hex id 拒绝', await rejects(() => service.resolveAttachmentIds(['sha256:short'], execOf()), '内容寻址'))
  check('[B5c] null 项拒绝（null 边界）', await rejects(() => service.resolveAttachmentIds([null], execOf()), '内容寻址'))
  // B5d（超长边界）判别：4096 字符非 hex 串不因"长"而放行——格式正则恰 64 位 hex。
  check('[B5d] 超长非法 id（4096 字符）拒绝', await rejects(() => service.resolveAttachmentIds([`sha256:${'z'.repeat(4096)}`], execOf()), '内容寻址'))
  // B6 未知 id：格式合法但宿主读不到 → ATTACHMENT_UNKNOWN（service 层消息 + registry 层 code 双断言）。
  // 判别：未捕获的 readImage 异常裸抛（无统一错误形状）→ code 断言必败。
  let unknownError = null
  try { await service.resolveAttachmentIds([IMG_U], execOf()) } catch (error) { unknownError = error }
  check('[B6] 未知 id 明确报错（消息+错误码双断言）', !!unknownError && String(unknownError.message).includes('附件不可解析') && unknownError.code === ATTACHMENT_ERROR_CODES.ATTACHMENT_UNKNOWN)
  // B7（null/缺省边界）判别：exec 仅用于 cwd/sessionId，id 解析不得依赖它。
  check('[B7] exec 缺省仍可 id-only 解析', (await service.resolveAttachmentIds([IMG_E])).length === 1)
  // B8（并发边界）判别：并发懒注册若产生竞态异常/损坏条目，任一 promise 必拒绝或 ref 错误。
  {
    const [r1, r2] = await Promise.all([service.resolveAttachmentIds([IMG_F], execOf()), service.resolveAttachmentIds([IMG_F], execOf())])
    check('[B8] 同 id 并发解析双双成功且等值', r1.length === 1 && r2.length === 1 && r1[0].attachmentId === IMG_F && r2[0].attachmentId === IMG_F)
  }
  // B9（超时边界——错误映射路径）：URL 下载中止/失败 → FILE_NOT_FOUND 带 URL 上下文。
  // 注：真实 60s 计时不实测（时长由 B9b 常量契约守护）；abort 与网络失败共用同一 catch 映射。
  {
    const work = mkdtempSync(join(tmpdir(), 'router-paths-'))
    const realFetch = globalThis.fetch
    globalThis.fetch = async () => { throw new Error('The operation was aborted') }
    try {
      let downloadError = null
      try { await service.registry.registerPath('https://example.com/x.bin', { cwd: work }) } catch (error) { downloadError = error }
      check('[B9a] URL 下载中止映射为 FILE_NOT_FOUND（带上下文）', !!downloadError && downloadError.code === ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND && String(downloadError.message).includes('下载失败'))
    } finally {
      globalThis.fetch = realFetch
      try { rmSync(work, { recursive: true, force: true }) } catch { /* 清理尽力而为 */ }
    }
    check('[B9b] URL 下载超时契约 = 60s', ATTACHMENT_FETCH_TIMEOUT_MS === 60_000)
  }
  // B10 LRU 容量淘汰（超长/容量边界）判别：无淘汰逻辑 → size 恒增 > 200 → 必败。
  {
    const reg2 = new AttachmentRegistry(svcRoot)
    check('[B10a] 注册表容量契约 = 200', ATTACHMENT_REGISTRY_MAX_ENTRIES === 200)
    for (let i = 0; i < 205; i++) reg2.registerEntry({ id: `sha256:${i.toString(16).padStart(64, '0')}`, mediaType: 'application/octet-stream', bytes: 1, name: `f${i}`, workspacePath: `D:/w/f${i}` })
    check('[B10b] 超 LRU 上限逐出最旧、保留最新', reg2.entries.size === 200 && reg2.peek(`sha256:${(0).toString(16).padStart(64, '0')}`) === undefined && reg2.peek(`sha256:${(204).toString(16).padStart(64, '0')}`) !== undefined)
  }
  // B11（超长边界）判别：5000 重复 id 列表必须先去重再解析（否则 5000 次宿主读取/同步循环压力）。
  {
    const before = readImageCounts.get(IMG_E) ?? 0
    const big = await service.resolveAttachmentIds(Array.from({ length: 5000 }, () => IMG_E), execOf())
    check('[B11] 5000 重复 id 列表 → 1 ref（先去重后解析）', big.length === 1 && (readImageCounts.get(IMG_E) ?? 0) === before)
  }
  check('[B12] isAttachmentId 格式判别（64hex 大小写容忍/其余拒绝）', isAttachmentId(IMG_A) && isAttachmentId(`sha256:${'A'.repeat(64)}`) && !isAttachmentId('att-1') && !isAttachmentId(`sha256:${'a'.repeat(63)}`))
}
// B13（FIX-003 判别）：宿主 readImage 对裸 id ref 做元数据校验失败（21:28 宿主演进
// 实证：readImageFile byteLength!==undefined → ATTACHMENT_CORRUPT）后，懒注册自取证
// 降级——读 DSH_HOME/attachments/v1/objects/<sha256 前2>/<hex> + 探测尺寸构造完整 ref，
// 再走宿主 readImage（完整 ref 校验通过）/或内容哈希兜底。判别：旧代码（唯一 catch
// → undefined）在该场景下 byId 必 undefined → ATTACHMENT_UNKNOWN；新代码必恢复。
{
  console.log('B13. 懒注册自取证降级（FIX-003）:')
  const tmpHome = mkdtempSync(join(tmpdir(), 'dsh-router-attach-'))
  const prevDshHome = process.env.DSH_HOME
  try {
    process.env.DSH_HOME = tmpHome
    // 构造一个真实 PNG 最小对象（912x510 尺寸；内容哈希作为 id）。
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from([0x00, 0x00, 0x00, 0x0d]),
      Buffer.from([0x49, 0x48, 0x44, 0x52]),
      Buffer.from([0x00, 0x00, 0x03, 0x90, 0x00, 0x00, 0x01, 0xfe]), // 912 x 510
      Buffer.from([0x08, 0x02, 0x00, 0x00, 0x00]),
      Buffer.from(Array.from({ length: 64 }, (_, i) => i & 0xff)),
    ])
    const sha = createHash('sha256').update(png).digest('hex')
    const id = `sha256:${sha}`
    const objDir = join(tmpHome, 'attachments', 'v1', 'objects', sha.slice(0, 2))
    mkdirSync(objDir, { recursive: true })
    writeFileSync(join(objDir, sha), png)
    // 独立 root：宿主面裸 id ref 一律拒绝（元数据校验语义）；完整 ref 才放行。
    const regRoot = new Context()
    regRoot.provide('attachments', {
      readImage: async (ref) => {
        const idOnly = String(ref?.attachmentId ?? '')
        if (typeof ref?.width !== 'number' || typeof ref?.bytes !== 'number') throw new Error(`Stored attachment metadata does not match its reference (${idOnly.slice(0, 20)}…)`)
        if (idOnly !== id) throw new Error('no such attachment')
        return { ref: { attachmentId: id, mediaType: 'image/png', bytes: png.length, width: 912, height: 510 }, data: new Uint8Array(png) }
      },
    })
    const reg = new AttachmentRegistry(regRoot)
    const entry = await reg.byId(id)
    check('[B13a] 宿主元数据校验失败时懒注册自取证恢复', !!entry && entry.mediaType === 'image/png' && entry.width === 912 && entry.height === 510 && entry.bytes === png.length)
    const byIdAgain = await reg.byId(id)
    check('[B13b] 自取证注册后二次命中零宿主读取', !!byIdAgain && byIdAgain === entry)
  } finally {
    if (prevDshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevDshHome
    rmSync(tmpHome, { recursive: true, force: true })
  }
}

// ── [C] route_agent 工具全链路（真实 tool.js + 真实 service）──────────────────
console.log('C. route_agent 工具全链路:')
{
  const toolModule = await import('../lib/tool.js')
  let registered = null
  // 工具接线与 service 同 root（生产拓扑：宿主 app 内 tool 行与 router 服务同作用
  // 域）。RouterService 构造器（TypertRemoteService）已在 root 注册 'router' 服务，
  // 此处不再重复 provide；跨 root 提供 service 会被 cordis traceable 代理重绑
  // this.ctx 到消费方 root（无 llm 桩 → 'llm 服务不可用'）——单 root 保证解析。
  svcRoot.provide('tools', { register: (definition) => { registered = definition; return () => {} } })
  svcRoot.provide('systemPrompt', { section: () => () => {} })
  const app = svcRoot.plugin({ name: 'routing-paths-tool', inject: toolModule.inject, apply: toolModule.apply })
  await app
  check('[C0] route_agent 工具注册成功', !!registered && registered.name === 'route_agent' && typeof registered.execute === 'function')
  const imagesOf = (request) => (request?.messages?.[0]?.content ?? []).filter((block) => block.type === 'image').map((block) => block.attachment.attachmentId)
  const runTool = (args, exec = execOf()) => registered.execute(args, exec)

  // C1 判别：全链路默认不携带——若工具层隐式转发最近图片，imagesOf 长度必非 0。
  await runTool({ agent: 'vision', task: '描述' })
  check('[C1] 工具层默认不携带附件', imagesOf(chatRequests[chatRequests.length - 1]).length === 0)
  // C2 判别：attachments:[1] 恰派发第 2 张（att-b）；偏移/逆序必败。
  await runTool({ agent: 'vision', task: '识别第2张', attachments: [1] })
  check('[C2] attachments 序号精确派发（[1]→IMG_B）', imagesOf(chatRequests[chatRequests.length - 1]).join() === IMG_B)
  // C3 判别：includeImages 全量且保序。
  await runTool({ agent: 'vision', task: '全量', includeImages: true })
  check('[C3] includeImages 全量保序转发', imagesOf(chatRequests[chatRequests.length - 1]).join() === [IMG_A, IMG_B, IMG_C].join())
  // C4 判别：选择顺序保留（[2,0] → c,a 而非 a,c）。
  await runTool({ agent: 'vision', task: '乱序', attachments: [2, 0] })
  check('[C4] attachments 乱序选择保留顺序', imagesOf(chatRequests[chatRequests.length - 1]).join() === [IMG_C, IMG_A].join())
  // C5 判别：indices+includeImages 并集去重——显式序号项在前（插入序，与 smoke
  // 'attachments merged dedupe'（merged[0]=att-b）同语义）；去重失效则 IMG_B 重复出现。
  await runTool({ agent: 'vision', task: '并集', attachments: [1], includeImages: true })
  check('[C5] attachments+includeImages 并集去重（显式项在前）', imagesOf(chatRequests[chatRequests.length - 1]).join() === [IMG_B, IMG_A, IMG_C].join())
  // C6 判别：跨通道（attachmentIds × includeImages）同附件只派发一次——去重键失效则 IMG_A 出现 2 次。
  await runTool({ agent: 'vision', task: '跨通道', attachmentIds: [IMG_A], includeImages: true })
  const c6 = imagesOf(chatRequests[chatRequests.length - 1])
  check('[C6] attachmentIds 与日志附件跨通道去重', c6.length === 3 && c6.filter((id) => id === IMG_A).length === 1)
  // C7 判别：attachmentIds 独立通道（M2 懒注册经工具层真实发生——readImage 计数必增）。
  {
    const before = readImageCounts.get(IMG_H) ?? 0
    await runTool({ agent: 'vision', task: '记忆段指代', attachmentIds: [IMG_H] })
    const c7 = imagesOf(chatRequests[chatRequests.length - 1])
    check('[C7] attachmentIds 独立派发（M2 懒注册经工具层）', c7.join() === IMG_H && (readImageCounts.get(IMG_H) ?? 0) === before + 1)
  }
  // C8（空边界）判别：attachmentIds 空数组 = 不解析不派发（length>0 门）；若空数组触发解析路径必异。
  await runTool({ agent: 'vision', task: '空数组', attachmentIds: [] })
  check('[C8] attachmentIds 空数组视为未提供', imagesOf(chatRequests[chatRequests.length - 1]).length === 0)
  // C9 判别（双层防御）：非字符串 files 项（LLM 幻觉参数形态）——工具层由真实
  // defineTool 参数校验明确拒绝（INVALID_ARGS，不击穿执行）；即便绕过工具层，
  // service.run 自身的过滤仍只放行字符串路径（委派 prompt 仅含合法项、委派完成）。
  check('[C9a] 工具层：非字符串 files 项参数校验明确拒绝', await rejects(() => runTool({ agent: 'helper', task: '处理文件', files: ['report.pdf', 42, null] }), 'must be a string'))
  {
    const before = delegationRequests.length
    const out = await service.run({ agentId: 'helper', task: '处理文件', files: ['report.pdf', 42, null], images: [], exec: execOf() })
    const promptText = delegationRequests[delegationRequests.length - 1]?.prompt?.[0]?.text ?? ''
    check('[C9b] 服务层：非字符串项被过滤（仅合法路径注入）', out.kind === 'agent' && delegationRequests.length === before + 1 && promptText.includes('待处理文件') && promptText.includes('D:/work/routing/report.pdf') && !promptText.includes('42'))
  }
  // C10 判别：chat 类型文本文件按内容分发（内联进 task）——仅注入路径则内容断言必败。
  {
    await runTool({ agent: 'vision', task: '读文件', files: ['notes.txt'] })
    const textBlock = (chatRequests[chatRequests.length - 1].messages[0].content ?? []).find((block) => block.type === 'text')
    check('[C10] chat 类型文本文件内容内联进 task', !!textBlock && textBlock.text.includes('hello 文本内容') && textBlock.text.includes('notes.txt'))
  }
  // C11（空边界）判别：files 空数组 → 零文件注入路径（不进"待处理文件"分支）。
  {
    const before = delegationRequests.length
    await runTool({ agent: 'helper', task: '无文件', files: [] })
    const promptText = delegationRequests[delegationRequests.length - 1]?.prompt?.[0]?.text ?? ''
    check('[C11] files 空数组零注入', delegationRequests.length === before + 1 && !promptText.includes('待处理文件'))
  }
  // C12 判别：未知 agent 明确报错（不静默 fallback）。
  check('[C12] 未知 agent 明确报错', await rejects(() => runTool({ agent: 'nope', task: 'x' }), '未知 agent'))
  // C13 判别：总开关关闭 → 工具层拒绝（若门控缺失，调用继续 → chatRequests 增长 → length 比较必败）。
  {
    const before = chatRequests.length
    svcConfig.enabled = false
    check('[C13] 总开关关闭工具明确拒绝', await rejects(() => runTool({ agent: 'vision', task: 'x' }), '未启用') && chatRequests.length === before)
    svcConfig.enabled = true
  }
  // C14（null/缺省边界）判别：无会话上下文的调用（exec.agent 缺省）仍可完成（路由不依赖会话）。
  {
    const out = await registered.execute({ agent: 'vision', task: '无会话' }, { signal: undefined })
    check('[C14] exec.agent 缺省可完成（零附件）', out.ok === true && imagesOf(chatRequests[chatRequests.length - 1]).length === 0)
  }
  // C15（超时契约）判别：工具超时上限必须覆盖 cli 子代理 15min 默认执行窗（降低则 cli 中途被杀）。
  check('[C15] 工具 timeoutMs=20min 覆盖 cli 15min 窗口', registered.timeoutMs === 20 * 60 * 1000 && registered.timeoutMs > 15 * 60 * 1000)
  await app.dispose()
}

// ── [D] 模态路由（image 能力标签 → 视觉 agent 派发）─────────────────────────
console.log('D. 模态路由:')
{
  const shapeOf = (agent) => service.modalityOfAgent(agent)
  // D1 判别：chat+image 标签必须进 consume（识别方向）；误进 produce → 识别 agent 被当生图 → 必败。
  check('[D1] chat+image → consume image（识别方向）', shapeOf({ type: 'chat', capabilities: ['image'] }).consume.includes('image') && !shapeOf({ type: 'chat', capabilities: ['image'] }).produce.includes('image'))
  // D2 判别：image 类型（生成端点）绝不进 consume-image 目录（R8 事实：识别流程误交生图端点即卡死）。
  check('[D2] image 类型 → 仅 produce（识别目录排除生图端点）', shapeOf({ type: 'image' }).produce.includes('image') && !shapeOf({ type: 'image' }).consume.includes('image'))
  // D3 判别：cli+image 标签 = 产出语义（图生图）；误进 consume → 生图 CLI 出现在识别目录 → 必败。
  check('[D3] cli+image → produce image（图生图）', shapeOf({ type: 'cli', capabilities: ['image'] }).produce.includes('image') && !shapeOf({ type: 'cli', capabilities: ['image'] }).consume.includes('image'))
  // D4 判别：无 image 标签的 chat 两侧都不含 image。
  check('[D4] 纯文本 chat 两侧无 image', !shapeOf({ type: 'chat' }).consume.includes('image') && !shapeOf({ type: 'chat' }).produce.includes('image'))
  // D5（null/缺省边界）判别：agent 形状缺省/未知 type 归一为 chat 默认（text/text），不抛错。
  const emptyShape = shapeOf({})
  check('[D5] 缺省 agent 归一 chat 默认矩阵', emptyShape.consume.includes('text') && !emptyShape.consume.includes('image'))
  // D6 判别：视觉目录 = consume-image 恰 [vision]；生图端点/生图 CLI/纯文本/禁用 agent 混入必败。
  check('[D6] listImageVisionAgents 恰为识别类', service.listImageVisionAgents().map(([id]) => id).join() === 'vision')
  // D7 判别：生图目录 = produce-image（cli 与 image 类型并存，按 id 排序）；识别 agent 混入必败。
  check('[D7] listImageGenerationAgents 为产出类（排序）', service.listImageGenerationAgents().map(([id]) => id).join() === ['codergen', 'draw'].join())
  // D8 门控判别：总开关关闭或无任何模态 agent → stateOf 恒 null（不激活）；门控失效 → 返回非 null → 必败。
  {
    check('[D8a] stateOf：模态 agent 在场时激活', MODALITY_ENTRIES[0].stateOf(service)?.vision?.[0] === 'vision')
    svcConfig.enabled = false
    check('[D8b] stateOf：总开关关闭 → 不激活', MODALITY_ENTRIES[0].stateOf(service) === null)
    svcConfig.enabled = true
    svcConfig.agents.vision.enabled = false; svcConfig.agents.draw.enabled = false; svcConfig.agents.codergen.enabled = false
    check('[D8c] stateOf：无模态 agent → 不激活', MODALITY_ENTRIES[0].stateOf(service) === null)
    svcConfig.agents.vision.enabled = true; svcConfig.agents.draw.enabled = true; svcConfig.agents.codergen.enabled = true
    check('[D8d] audio/video 占位条目恒不激活', MODALITY_ENTRIES[1].stateOf(service) === null && MODALITY_ENTRIES[2].stateOf(service) === null)
  }
  // D9 派发判别：带图调用经路由真实到达 llm.stream——图片块 + 附件 id + provider/model 全链路保真。
  {
    const before = chatRequests.length
    const out = await service.run({ agentId: 'vision', task: '识别这张图', images: [{ attachmentId: IMG_A, mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'a.png' }], exec: execOf() })
    const request = chatRequests[chatRequests.length - 1]
    const imageBlocks = (request?.messages?.[0]?.content ?? []).filter((block) => block.type === 'image')
    check('[D9] image 标签 agent 带图派发真实到达模型', out.kind === 'chat' && chatRequests.length === before + 1 && request.provider === 'openai' && request.model === 'gpt-4o' && imageBlocks.length === 1 && imageBlocks[0].attachment.attachmentId === IMG_A)
    // 判别：带图调用自动附带会话上下文（视觉语义：截图是上下文的一部分）——缺上下文段必败。
    const textBlock = (request.messages[0].content ?? []).find((block) => block.type === 'text')
    check('[D9b] 带图派发自动附带会话上下文', !!textBlock && textBlock.text.includes('[会话上下文'))
  }
  // D10 判别：目标模型纯文本（非 declared）→ 前置明确拒绝；若放行，裸图块将击穿端点 → rejects 必败。
  check('[D10] 纯文本模型前置拒绝图片输入', await rejects(() => service.run({ agentId: 'textbrain', task: '看图', images: [{ attachmentId: IMG_A, mediaType: 'image/png', bytes: 4, width: 2, height: 2 }], exec: execOf() }), '不支持图片输入'))
  // D11 判别：declared 中转路由跳过预检（input 声明不代表真实能力，由端点裁决）——若仍预检，rejects 与"流收到图"双败。
  {
    const before = chatRequests.length
    const out = await service.run({ agentId: 'relay', task: '看图', images: [{ attachmentId: IMG_A, mediaType: 'image/png', bytes: 4, width: 2, height: 2 }], exec: execOf() })
    const request = chatRequests[chatRequests.length - 1]
    check('[D11] declared 路由跳过预检由端点裁决', out.ok !== false && out.kind === 'chat' && chatRequests.length === before + 1 && (request?.messages?.[0]?.content ?? []).some((block) => block.type === 'image'))
  }
  // D12 判别：改写标记给大脑"识别 vs 图生图"分流选项——两个目录 agent 都必须出现。
  {
    const marker = minimalImageRewrite({ attachment: { attachmentId: IMG_A, mediaType: 'image/png', bytes: 1, width: 1, height: 1, name: 'a.png' } }, { vision: ['vision'], generation: ['draw'] })
    check('[D12] 改写标记分流：视觉与生图 agent 双选项', marker.includes('视觉 agent') && marker.includes('"vision"') && marker.includes('生图 agent') && marker.includes('"draw"') && marker.includes('includeImages'))
  }
  // D13/D14 catalog 镜像（客户端会话级开关的服务端 seam——client.js ModelTakeover 的
  // takeoverArmed 门控读 catalog.takeoverDefaultModel===true）。判别：镜像缺省/反向
  // 判断（!==false）会让 F8 fail-safe 方向翻转 → 客户端在旧缓存下误接管 → 必败。
  {
    delete svcConfig.takeoverDefaultModel
    const cat1 = await service.catalog()
    check('[D13] catalog 镜像缺省 false（fail-safe）', cat1.takeoverDefaultModel === false)
    svcConfig.takeoverDefaultModel = true
    const cat2 = await service.catalog()
    check('[D14] catalog 镜像开关 true', cat2.takeoverDefaultModel === true)
    delete svcConfig.takeoverDefaultModel
  }
  // D15（FIX-003 判别）：真实宿主形态——llm.listProviders() 的 provider 条目只有
  // {id,name}（prepareRoutes :1174 实证），declared 目录标记在
  // llm.listConfigurableProviders()（registerConfigurableProviders 发布）。旧代码
  // 只查 listProviders → 任何 provider 的 declared 恒 undefined → "declared 路由
  // 跳过预检"例外从不生效（真实宿主下 opencode-go-new/qwen3.7-plus 必被预检拒）。
  // 判别：若仍走旧判定（或预检未跳过），带图调用必被"不支持图片输入"拒绝 → FAIL。
  {
    console.log('D15. declared 预检例外（listConfigurableProviders 权威源）:')
    const oldLlm = svcRoot.get('llm')
    const d15Requests = []
    // 临时替换 llm fixture 的目录面（真实宿主形态：listProviders 无 declared）。
    // cordis 不允许重复 provide——通过替换对象方法实现（finally 恢复）。
    const origListProviders = oldLlm.listProviders
    const origListConfigurableProviders = oldLlm.listConfigurableProviders
    const origResolveModelInfo = oldLlm.resolveModelInfo
    const origStream = oldLlm.stream
    oldLlm.listProviders = async () => [{ id: 'relay', provider: 'relay' }]
    oldLlm.listConfigurableProviders = async () => [{ id: 'relay', provider: 'relay', displayName: 'Relay', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'relay'], declared: true }]
    oldLlm.resolveModelInfo = async () => ({ inputModalities: ['text'] })
    oldLlm.stream = async function* (request) {
      d15Requests.push(request)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'OK' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'OK' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    try {
      const out = await service.run({ agentId: 'relay', task: '看图', images: [{ attachmentId: IMG_A, mediaType: 'image/png', bytes: 4, width: 2, height: 2 }], exec: execOf() })
      const request = d15Requests[d15Requests.length - 1]
      check('[D15] 真实宿主 declared 判定（listConfigurableProviders 优先）跳过预检', out.ok !== false && d15Requests.length === 1 && (request?.messages?.[0]?.content ?? []).some((block) => block.type === 'image'))
    } finally {
      oldLlm.listProviders = origListProviders
      oldLlm.listConfigurableProviders = origListConfigurableProviders
      oldLlm.resolveModelInfo = origResolveModelInfo
      oldLlm.stream = origStream
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// [E] takeover 服务端双层语义（installAdmissionWrapper + 真实 LlmRuntime）。
// 语义权威：review-FIX-002-R7/R8（DEC-022 ①-⑥）；断言风格对齐 smoke §7.6 的
// 写计数夹具，但本块为独立 root/llm 实例，与 smoke 单进程状态零共享。
// ══════════════════════════════════════════════════════════════════════════
console.log('E. takeover 服务端双层语义:')
{
  const { LlmRuntime } = await import('@deepseek-ai/dsh-llm')
  const root = new Context()
  const llm = new LlmRuntime(root)
  const textAdapter = {
    providerInfo(provider) { return { id: provider, name: 'TextBrain' } },
    providerRetryPolicy() { return undefined },
    async listModels(provider) { return [{ provider, id: 'brain-1', name: 'Brain-1', inputModalities: ['text'] }] },
    async resolveModel(provider, model) { return { provider, id: model, name: model, inputModalities: ['text'], context: { contextWindow: 100_000 }, defaultMaxTokens: 4096 } },
    async prepareCall(provider, model, signal) { return { model: await textAdapter.resolveModel(provider, model, signal), stream: (options) => textAdapter.stream(options) } },
    async *stream() { yield { type: 'finish', reason: { kind: 'stop' } } },
  }
  llm.registerAdapter(['text-provider'], textAdapter)
  // 默认模型接管面：currentSelection/saveSelection 均为桩，写路径全量计数（wrapper 是唯一消费者）。
  const defaultWrites = []
  let defaultSelection = { provider: 'text-provider', model: 'brain-1' }
  let writeDelayMs = 0
  root.provide('agentDefaultModel', {
    currentSelection: () => ({ ...defaultSelection }),
    saveSelection: async (next) => {
      defaultWrites.push({ ...next })
      if (writeDelayMs > 0) await tick(writeDelayMs)
      defaultSelection = { ...next }
    },
  })
  const config = { enabled: true, takeoverDefaultModel: true, visionAgents: [['vision', { name: '视觉', type: 'chat', enabled: true, capabilities: ['image'] }]], generationAgents: [] }
  const fakeService = {
    isEnabled: () => config.enabled,
    getState: () => config,
    listImageVisionAgents: () => config.visionAgents,
    listImageGenerationAgents: () => config.generationAgents,
  }
  const fireSettingsCommit = (ns = 'router') => { for (const cb of root.events.dispatch('emit', ['settings/updated', ns, null, null, 'update'])) cb(ns, null, null, 'update') }
  const fireAdapters = () => { for (const cb of root.events.dispatch('emit', ['llm/adapters-updated'])) cb() }
  const hasTwin = (provider = 'text-provider') => llm.listProviders().some((entry) => entry.id === `${provider}${WRAP_SUFFIX}`)

  // ── α：默认 false 双层零触碰（DEC-022 ①）────────────────────────────────
  // 判别：FIX-002 之前的代码无开关、多模态激活即无条件接管 → defaultWrites 必增 → 必败。
  {
    config.takeoverDefaultModel = false
    const d1 = installAdmissionWrapper(root, fakeService)
    await tick()
    check('[E1] 开关显式 false：默认模型零触碰', defaultWrites.length === 0 && defaultSelection.provider === 'text-provider')
    // 判别：双层解耦——开关只约束默认模型，不约束 twin 注册；若误接门控（关=twin 不注册）→ 必败。
    check('[E1b] 开关 false 时 twin 仍注册（双层解耦）', hasTwin())
    d1()
    await tick()
    // E2 判别（缺省 undefined，F8 fail-safe）：判断若写成 !==false（缺省当 true）→ 卸载/事件路径必写 → 必败。
    check('[E2] 字段缺省 undefined 同样零触碰（fail-safe）', defaultWrites.length === 0)
    delete config.takeoverDefaultModel
    const d2 = installAdmissionWrapper(root, fakeService)
    await tick()
    check('[E2b] 缺省安装期零触碰', defaultWrites.length === 0 && defaultSelection.provider === 'text-provider')
    d2()
    await tick()
    check('[E2c] 缺省卸载零写（从未接管即无还原）', defaultWrites.length === 0)
    config.takeoverDefaultModel = false
  }

  // ── β：true 一次性接管 + 改回尊重 + 关回还原 + dispose 还原（DEC-022 ②③）──
  {
    config.takeoverDefaultModel = true
    const d = installAdmissionWrapper(root, fakeService)
    // E3 判别：一次性接管 = 恰一次写 + twin provider + 模型保留；写 0 次/2 次/模型丢失必败。
    await tick()
    check('[E3] 开关 true 一次性接管（恰一次写+模型保留）', defaultWrites.length === 1 && defaultWrites[0].provider === `text-provider${WRAP_SUFFIX}` && defaultWrites[0].model === 'brain-1' && defaultSelection.provider === `text-provider${WRAP_SUFFIX}`)
    // E4 判别：one-shot——接管记忆置位后，后续事件（settings×2+adapters）不得重复写；每事件重写（旧形态）必败。
    const before4 = defaultWrites.length
    fireSettingsCommit(); await tick()
    fireAdapters(); await tick()
    fireSettingsCommit(); await tick()
    check('[E4] 接管在位后事件幂等（零重复写）', defaultWrites.length === before4 && defaultSelection.provider === `text-provider${WRAP_SUFFIX}`)
    // E5 判别（smoke 6b 同型）：用户手动改回原生 → 后续 sync 不强制拉回 twin；强制覆盖（FIX-002 要消灭的伤害）必败。
    defaultSelection = { provider: 'text-provider', model: 'brain-1' }
    const before5 = defaultWrites.length
    fireSettingsCommit(); await tick()
    fireAdapters(); await tick()
    fireSettingsCommit(); await tick()
    check('[E5] 用户改回原生后尊重（零覆盖写）', defaultWrites.length === before5 && defaultSelection.provider === 'text-provider')
    // E6 判别：用户改走"别的 twin"→ 只清记忆不写设置；还原本若按后缀盲目剥（不校验
    // "仍停在我们的 twin"），会把别的 twin 剥掉 → 写计数必增 → 必败。
    llm.registerAdapter(['other-provider'], { ...textAdapter, providerInfo: (p) => ({ id: p, name: 'Other' }) })
    await tick()
    defaultSelection = { provider: `other-provider${WRAP_SUFFIX}`, model: 'brain-1' }
    const before6 = defaultWrites.length
    config.takeoverDefaultModel = false
    fireSettingsCommit(); await tick()
    check('[E6] 用户改走别的 twin：只清记忆零写（尊重）', defaultWrites.length === before6 && defaultSelection.provider === `other-provider${WRAP_SUFFIX}`)
    // E7 判别（不变量③，smoke 6d 同型）：接管在位再关开关 → restore 写真实执行——
    // 端态 + 恰一次写 + 写入内容为原生 provider 三重断言；还原写被删改必败。
    defaultSelection = { provider: 'text-provider', model: 'brain-1' }
    config.takeoverDefaultModel = true
    fireSettingsCommit(); await tick()
    check('[E7a] 重新武装（接管写发生）', defaultSelection.provider === `text-provider${WRAP_SUFFIX}`)
    const before7 = defaultWrites.length
    config.takeoverDefaultModel = false
    fireSettingsCommit(); await tick()
    check('[E7b] 开关关回：恰一次还原写至原生 provider', defaultWrites.length === before7 + 1 && defaultWrites[before7].provider === 'text-provider' && defaultSelection.provider === 'text-provider')
    // E8 判别（dispose 还原路径，R7-F4 教训：不得掏空）：重新接管在位 → dispose → 恰一次还原写 + twin 全卸载。
    config.takeoverDefaultModel = true
    fireSettingsCommit(); await tick()
    check('[E8a] dispose 前重新接管在位', defaultSelection.provider === `text-provider${WRAP_SUFFIX}`)
    const before8 = defaultWrites.length
    d()
    await tick()
    check('[E8b] dispose：恰一次还原写 + 全部 twin 卸载', defaultWrites.length === before8 + 1 && defaultWrites[before8].provider === 'text-provider' && !hasTwin() && !hasTwin('other-provider'))
  }

  // ── γ：遗留剥离 one-shot + 重装自愈（DEC-022 ④，R7-F2/R8-N3）────────────
  {
    config.takeoverDefaultModel = false
    config.enabled = true
    config.visionAgents = [['vision', { name: '视觉', type: 'chat', enabled: true, capabilities: ['image'] }]]
    defaultSelection = { provider: `text-provider${WRAP_SUFFIX}`, model: 'brain-1' } // 遗留滞留接管（旧版本所置，本安装无记忆）
    const beforeG = defaultWrites.length
    const d = installAdmissionWrapper(root, fakeService)
    await tick()
    // E9 判别：首剥恰一次 + 剥离≠卸载（多模态仍激活，twin 在册）；无剥离分支（旧版升级用户滞留 twin）必败。
    check('[E9] 遗留接管首剥恰一次（twin 仍在册）', defaultWrites.length === beforeG + 1 && defaultWrites[beforeG].provider === 'text-provider' && defaultSelection.provider === 'text-provider' && hasTwin())
    // E10 判别（one-shot 核心）：用户再手动选 twin → 三连事件零再剥零写；pre-F2（无标记）首事件即再剥 → 必败。
    defaultSelection = { provider: `text-provider${WRAP_SUFFIX}`, model: 'brain-1' }
    const before10 = defaultWrites.length
    fireSettingsCommit(); await tick()
    fireAdapters(); await tick()
    fireSettingsCommit(); await tick()
    check('[E10] 用户再选 twin 后零再剥（one-shot）', defaultWrites.length === before10 && defaultSelection.provider === `text-provider${WRAP_SUFFIX}`)
    // E11 判别：dispose 时标记已消费 → 卸载零写（pre-F2 dispose 会再剥一次 → 写计数必败）。
    const before11 = defaultWrites.length
    d()
    await tick()
    check('[E11] 标记消费后 dispose 零写', defaultWrites.length === before11 && defaultSelection.provider === `text-provider${WRAP_SUFFIX}`)
    // E12 判别（重装自愈，守护闭包级标记）：重装 = 全新闭包重置标记 → 遗留状态再剥恰一次；
    // 若标记退化为模块级（重装不重置）→ 重装后不剥 → 必败。
    defaultSelection = { provider: `text-provider${WRAP_SUFFIX}`, model: 'brain-1' }
    const before12 = defaultWrites.length
    const d2 = installAdmissionWrapper(root, fakeService)
    await tick()
    check('[E12] 重装自愈：遗留接管再剥恰一次', defaultWrites.length === before12 + 1 && defaultWrites[before12].provider === 'text-provider')
    d2()
    await tick()
  }

  // ── δ：并发语义（双 sync 事件竞争接管窗口）────────────────────────────────
  // 判别：tookOverFrom 必须先于 await saveSelection 置位（R7-F5 时序的正面价值）——
  // 若记忆在 await 之后置位，install 触发的首写仍在途（writeDelayMs 人为展宽窗口），
  // 双事件各自判定"未接管过"→ 重复接管写 → writes=2+ → 必败。
  {
    writeDelayMs = 10
    config.takeoverDefaultModel = true
    config.enabled = true
    config.visionAgents = [['vision', { name: '视觉', type: 'chat', enabled: true, capabilities: ['image'] }]]
    defaultSelection = { provider: 'text-provider', model: 'brain-1' }
    const writesBefore = defaultWrites.length
    const d = installAdmissionWrapper(root, fakeService)
    fireSettingsCommit()
    fireSettingsCommit()
    await tick(100)
    writeDelayMs = 0
    check('[E13] 并发双事件竞争窗口：接管恰一次写', defaultWrites.length === writesBefore + 1 && defaultWrites[writesBefore].provider === `text-provider${WRAP_SUFFIX}` && defaultSelection.provider === `text-provider${WRAP_SUFFIX}`)
    d()
    await tick()
  }
}

// ══════════════════════════════════════════════════════════════════════════
// [F] takeover 客户端会话级（真实 lib/client.js bundle + 本文件自带迷你 react；
// 与 client-render.mjs 各自独立求值 bundle，takeoverMemory 模块态零共享）。
// 语义权威：review-FIX-002-R7 F1 / R8 F3（takeoverMemory 三态 + 开关门控）。
// ══════════════════════════════════════════════════════════════════════════
console.log('F. takeover 客户端会话级:')
{
  // ── 迷你 React（仅 ModelTakeover 所需：useState/useEffect + 实例帧 + effect 派发）──
  const instances = new Map()
  const frameStack = []
  let hookError = null
  const currentFrame = () => frameStack[frameStack.length - 1]
  const hookSlot = () => {
    const inst = currentFrame()
    let slot = inst.hooks[inst.hookIndex]
    if (!slot) slot = inst.hooks[inst.hookIndex] = {}
    inst.hookIndex++
    return slot
  }
  const arraysEqual = (a, b) => a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i])))
  function useState(initial) {
    const slot = hookSlot()
    if (!slot.has) { slot.has = true; slot.value = typeof initial === 'function' ? initial() : initial }
    return [slot.value, () => {}] // ModelTakeover 不依赖 setter 触发重渲染（每次挂载用全新实例）
  }
  function useEffect(fn, deps) {
    const slot = hookSlot()
    slot.fn = fn
    if (slot.deps === undefined || !arraysEqual(slot.deps, deps)) { slot.deps = deps; slot.pending = true } else slot.pending = false
  }
  function useRef(value) { const slot = hookSlot(); if (!slot.has) { slot.has = true; slot.value = { current: value } } return slot.value }
  function useCallback(fn) { return fn }
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}) }, ...(children.length ? { children } : {}) }), useState, useEffect, useRef, useCallback }
  /** 挂载一次组件（fresh 实例 = effect 必然真实执行——R8 F3 教训：同实例同 deps 不重跑会退化 vacuous）。 */
  function mountOnce(element, prefix) {
    if (!element || typeof element.type !== 'function') return
    const inst = { hooks: [], hookIndex: 0 }
    instances.set(prefix, inst)
    frameStack.push(inst)
    let result = null
    try { result = element.type(element.props) } catch (error) { hookError = error } finally { frameStack.pop() }
    for (const slot of inst.hooks) {
      if (slot && slot.pending && typeof slot.fn === 'function') {
        try { slot.fn() } catch (error) { hookError = error }
        slot.pending = false
      }
    }
    return result
  }

  // ── 装配：求值浏览器包（window.__ModuleLoader__ 格式）→ factory(react) → apply(桩 ctx) ──
  const source = readFileSync(join(LIB_DIR, 'client.js'), 'utf8')
  let bundle = null
  const fakeWindow = {
    __ModuleLoader__: { load: (payload) => { bundle = payload } },
    location: { search: '', pathname: '/' },
    history: { replaceState: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setInterval: () => 0, clearInterval: () => {},
    setTimeout: (fn) => { setImmediate(fn); return 0 }, clearTimeout: () => {},
    confirm: () => true, open: () => {},
  }
  new Function('window', source)(fakeWindow)
  check('[F0] client bundle 求值成功', !!bundle && bundle.id === 'dsh-agent-router' && typeof bundle.factory === 'function')
  const clientExports = bundle.factory((name) => {
    if (name === 'react') return react
    throw new Error(`unexpected require: ${name}`)
  })
  check('[F0b] client 导出 apply/inject', typeof clientExports.apply === 'function' && Array.isArray(clientExports.inject))

  // 可切换目录（takeoverDefaultModel 镜像 + 多模态 agent 在场）。
  let catalogSwitch = false
  const catalogStub = async () => ({
    ok: true,
    value: {
      ok: true, enabled: true, takeoverDefaultModel: catalogSwitch,
      defaults: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
      agents: [
        { id: 'vision', name: '视觉', type: 'chat', enabled: true, capabilities: ['image'], provider: '', model: '', effectiveProvider: '', effectiveModel: '', source: 'main' },
        { id: 'plain', name: '纯文本', type: 'chat', enabled: true, capabilities: [], provider: 'openai', model: 'gpt-4o', effectiveProvider: 'openai', effectiveModel: 'gpt-4o', source: 'agent' },
      ],
      oauthAccounts: [], pools: [], cliAgents: [],
    },
  })
  // 会话级模型选择面：per-session current + selectModel 记录（更新对应会话的 current）。
  const sessionCurrent = new Map()
  const selectCalls = []
  const apiMock = {
    sessions: {
      models: async ({ sessionId }) => ({ result: { ok: true, value: { current: { ...(sessionCurrent.get(sessionId) ?? { provider: 'openai', model: 'gpt-4o' }) } } } }),
      selectModel: async (payload) => {
        selectCalls.push({ ...payload })
        sessionCurrent.set(payload.sessionId, { provider: payload.provider, model: payload.model })
        return { result: { ok: true, value: { selected: { provider: payload.provider, model: payload.model } } } }
      },
    },
  }
  const listeners = []
  const registrations = []
  const ctx = {
    effect: (fn) => { fn(); return () => {} },
    locale: { register: () => () => {}, bind: () => (key) => key },
    get: (key) => (key === 'connection' ? { api: apiMock } : key === 'remote.router' ? { catalog: catalogStub } : undefined),
    remote: { $mount: () => Promise.resolve(), $on: (event, listener) => { listeners.push({ event, listener }); return () => {} } },
    slots: {
      inject: (_slot, factory) => { registrations.push(factory()); return () => {} },
      register: (descriptor, renderFn) => ({ ...descriptor, render: renderFn }),
    },
  }
  clientExports.apply(ctx)
  await flushAsync()
  check('[F0c] ModelTakeover 槽位注册成功', registrations.some((reg) => reg && reg.id === 'router-model-takeover' && typeof reg.render === 'function'))
  const takeoverReg = registrations.find((reg) => reg && reg.id === 'router-model-takeover')
  const fireCatalogRefresh = async () => { for (const entry of listeners) if (entry.event === 'settings/document-updated') entry.listener(); await flushAsync() }
  const mount = async (sessionId, prefix, imageIds = []) => {
    mountOnce(takeoverReg.render({ sessionId, input: { imageIds }, api: apiMock }), prefix)
    await flushAsync()
  }
  check('[F0d] 挂载零渲染异常', hookError === null)

  // F1 判别（F3-1 同型）：开关 false → 会话级不接管。pre-FIX-002 客户端 armed 只看
  // "目录有多模态 agent" → 必调 selectModel('openai-router') → length===0 必败。
  sessionCurrent.set('sess-off', { provider: 'openai', model: 'gpt-4o' })
  selectCalls.length = 0
  await mount('sess-off', 'f1')
  check('[F1] 开关 false：会话级零接管（零 selectModel）', selectCalls.length === 0 && sessionCurrent.get('sess-off').provider === 'openai')

  // F2 判别：开关 true → 接管到 twin + 来源记忆写入（由 F3 的成功还原反证记忆真实存在）。
  catalogSwitch = true
  await fireCatalogRefresh()
  sessionCurrent.set('sess-1', { provider: 'openai', model: 'gpt-4o' })
  selectCalls.length = 0
  await mount('sess-1', 'f2')
  check('[F2] 开关 true：接管至包装路由', selectCalls.length === 1 && selectCalls[0].provider === 'openai-router' && selectCalls[0].model === 'gpt-4o' && sessionCurrent.get('sess-1').provider === 'openai-router')

  // F3 判别：关回开关 → 仅还原本组件接管放上的 twin（记忆命中且仍停在我们的 twin）——
  // 记忆缺失（pre-F1）则不还原 → selectModel 空 → 必败；还原成功才清记忆。
  catalogSwitch = false
  await fireCatalogRefresh()
  selectCalls.length = 0
  await mount('sess-1', 'f3')
  check('[F3] 开关关回：来源记忆驱动还原（恰一次）', selectCalls.length === 1 && selectCalls[0].sessionId === 'sess-1' && selectCalls[0].provider === 'openai' && sessionCurrent.get('sess-1').provider === 'openai')

  // F4 判别（F3-2 同型）：开关 false 下用户手动选的 twin（无记忆）零触碰——
  // pre-F1 的 !armed && wrapped 无记忆分支每次触发都剥回原生 → length===0 必败。
  sessionCurrent.set('sess-man', { provider: 'gateway-router', model: 'm-1' })
  selectCalls.length = 0
  await mount('sess-man', 'f4')
  check('[F4] 开关 false：手动 twin 不被撤销', selectCalls.length === 0 && sessionCurrent.get('sess-man').provider === 'gateway-router')

  // F5 判别（per-session 记忆隔离）：双会话各自接管（不同原生来源）→ 关回后各自还原。
  // 若来源记忆是全局单值（非 per-session Map）：B 的接管覆写来源 → A 挂载时
  // current('openai-router') !== `${来源B}-router` → A 不还原（或缺还原调用）→ 必败。
  catalogSwitch = true
  await fireCatalogRefresh()
  sessionCurrent.set('sess-a', { provider: 'openai', model: 'gpt-4o' })
  sessionCurrent.set('sess-b', { provider: 'gateway', model: 'm-1' })
  await mount('sess-a', 'f5-arm-a')
  await mount('sess-b', 'f5-arm-b')
  check('[F5a] 双会话分别接管至各自 twin', sessionCurrent.get('sess-a').provider === 'openai-router' && sessionCurrent.get('sess-b').provider === 'gateway-router')
  catalogSwitch = false
  await fireCatalogRefresh()
  selectCalls.length = 0
  await mount('sess-a', 'f5-restore-a')
  await mount('sess-b', 'f5-restore-b')
  check('[F5b] 双会话各自还原至各自原生（记忆隔离）',
    selectCalls.length === 2
    && selectCalls.some((call) => call.sessionId === 'sess-a' && call.provider === 'openai')
    && selectCalls.some((call) => call.sessionId === 'sess-b' && call.provider === 'gateway')
    && sessionCurrent.get('sess-a').provider === 'openai'
    && sessionCurrent.get('sess-b').provider === 'gateway')
}

// ── 终态摘要（CLI runner：非空输出 + PASS/FAIL 计数 + exit 语义）──────────────
const total = pass + fail
console.log(`\nrouting-paths: ${pass}/${total} passed, ${fail} failed`)
if (fail > 0) { console.error('ROUTING-PATHS TESTS FAILED'); process.exit(1) }
console.log('ALL ROUTING-PATHS TESTS PASSED')
process.exit(0)
