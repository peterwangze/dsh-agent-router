#!/usr/bin/env node
/**
 * ARCH-005 R4 — 升级雷达逻辑单点（probe / dist-tags / heartbeat 三模式 CLI）。
 *
 * 定位：雷达全部判定逻辑的**单一实现路径**（P5）——`.github/workflows/host-radar.yml`
 * 只经本 CLI 编排（cron 周频 + workflow_dispatch 应急），不在 yaml 内复制判定；
 * 判别测试 = tests/host-radar.mjs（四类 diff 判别力 + 探测不门控 + P8 fail-loud）。
 *
 * 三模式：
 *  1. probe（--host-source <dir> | env DSH_HOST_SOURCE）：对指定宿主树跑契约检查的
 *     **无基线断言模式**——不红不绿，只产四类 diff 报告工件 JSON（stdout + --out）：
 *       ① 锚 miss（HOST_SHAPE_ANCHORS 包×文件/符号 + LlmAdapter 方法 + InputState 7d 面针）
 *       ② 白名单增删（宿主 API_REMOTE_FORWARDED_EVENTS vs 镜像 FORWARDED_EVENT_ALLOWLIST 双向）
 *       ③ schema 字段（六面 `<face>_result$schema` 顶层字段 vs WIRE_SCHEMA_WHITELIST 双向）
 *       ④ 包表版本（HOST_KEY_PACKAGES + cordis/schemastery vs 基线档案项——match/mismatch/absent）
 *     **探测不门控**：发现差异 exit 0（差异多少都不开 CI 红——决策归人/issue）；
 *     exit 非零 = 自身故障（树不可达/提取失败/参数非法——P8 可观测，fail-loud）。
 *  2. dist-tags（--dist-tags <json> | --dist-tags-file <file>）：`npm view
 *     @deepseek-ai/dsh dist-tags --json` 结果的**全枚举**比对（设计 F-5：latest +
 *     next/alpha 等预发布 tag 并集——宿主 rc/alpha 快速迭代是既定部署通道，
 *     latest-only 对 0.2.1-alpha.x 流动失明）；--seen <json> 承载已告警版本
 *     （防周频重复 issue）；新版本 = tag 指向版本 ∉（档案在册 dsh 值 ∪ seen）。
 *  3. heartbeat（--heartbeat --last-seen <iso|never>）：连续 N 次未跑判定（gap >
 *     interval × misses → stale）——雷达心跳可观测（防雷达静默死亡）。workflow 侧
 *     状态载体 = workflow 运行历史（gh run list 最近 success 的 updatedAt——平台
 *     侧戳记）+ 已告警版本 = issue 标题前缀 `host-radar: <version> —`；repo
 *     variable 选型经审查裁定不可执行（GITHUB_TOKEN 无 Actions Variables 权限
 *     ——读写均 403），阈值 = 周频 × 2，选型注记见 host-radar.yml 文件头。
 *
 * 基线数据单源（P5——零第三份拷贝）：
 *  - HOST_BASELINE_REGISTRY：文本提取自 tests/host-version-snapshot.mjs（marker =
 *    `const HOST_BASELINE_REGISTRY = Object.freeze(`——与 ci.yml resolve-baselines /
 *    host-contract.mjs R3 提取同 marker 同形态；提取失败 exit 1）；
 *  - HOST_KEY_PACKAGES / HOST_SHAPE_ANCHORS / WIRE_SCHEMA_WHITELIST /
 *    LLM_ADAPTER_PROTO_BASELINE：文本提取自 tests/host-contract.mjs（独立入口套件
 *    不可 import——R3 同法）；FORWARDED_EVENT_ALLOWLIST：lib/host-abi/events.js
 *    直接动态 import（可导入面零提取）；
 *  - S7 7d/7c 内联针（InputState/resolveDraftAttachments/kind——host-contract 内联
 *    字面量，不可标记提取）：本文件持拷贝，由 tests/host-radar.mjs 机器锁判据
 *    锚定权威源（单侧漂移即红——F-J「双份机器锁定」先例形态）。
 *
 * NEW-1 / T-6 吸收（选型 (a)——probe 周频无条件运行）：T-6 现场证 = 主包版本不变
 * 但嵌套树整树静默重写（schemastery 3.18.4→3.18.5）——纯 dist-tags 比对永不触发；
 * registry 端 `npm view <pkg>@<ver> dependencies` 只给**声明 range**（同版本不可变，
 * 实读 2026-10-17：`~3.18.4`）⇒ 备选 (b)「registry 侧包表 diff」对 range 内解析
 * 漂移恒零 diff。故雷达对主基线版本**每周期无条件 probe**（workflow 装一棵 fresh
 * 树——npm 安装时点解析出 range 内最新版），包表 diff ④ 对档案记录值比对——
 * 「主包不变 ≠ 树不变」由此可检（tests/host-radar.mjs T-6 双树判别）。
 *
 * DSH_HOST_SOURCE / DSH_BASELINE 语义复用（R3 机制）：--host-source 缺省回落
 * env DSH_HOST_SOURCE；--baseline（id / status 关键词，缺省 primary）缺省回落
 * env DSH_BASELINE，未知值 exit 1（不静默回退——R3 §0b fail-closed 同语义）。
 * probe 靶子**必须显式瞄准**（不自动探测候选链——F-A 教训：自动发现会把探测
 * 指向过期副本；宿主树形态判据 = dsh-api-remotes/lib/client.js 在 @deepseek-ai
 * scope 目录下，与 host-contract hostTarget 同判据）。
 *
 * 用法：
 *   node scripts/host-radar-probe.mjs --host-source <dir> [--baseline <id|status>] [--out <file>] [--repo <root>]
 *   node scripts/host-radar-probe.mjs --dist-tags '<json>' | --dist-tags-file <file> [--seen '<json>'] [--repo <root>]
 *   node scripts/host-radar-probe.mjs --heartbeat --last-seen <iso|never> [--now <iso>] [--interval-days 7] [--misses 2]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO = resolve(SCRIPT_DIR, '..')

const USAGE = 'usage: node scripts/host-radar-probe.mjs --host-source <dir> [--baseline <id|status>] [--out <file>] [--repo <root>] | --dist-tags <json>|--dist-tags-file <file> [--seen <json>] | --heartbeat --last-seen <iso|never> [--now <iso>] [--interval-days 7] [--misses 2]'
const die = (message) => {
  console.error(`host-radar-probe: ${message}`)
  console.error(USAGE)
  process.exit(1)
}

// ── 参数解析（严格：未知参数即死——静默吞参会把拼写错误变成恒默认行为）────────
const args = process.argv.slice(2)
const opts = {}
const VALUE_FLAGS = {
  '--host-source': 'hostSource', '--baseline': 'baseline', '--out': 'outFile', '--repo': 'repo',
  '--dist-tags': 'distTags', '--dist-tags-file': 'distTagsFile', '--seen': 'seen',
  '--last-seen': 'lastSeen', '--now': 'now', '--interval-days': 'intervalDays', '--misses': 'misses',
}
for (let index = 0; index < args.length; index++) {
  const arg = args[index]
  if (arg === '--heartbeat') { opts.heartbeat = true; continue }
  if (!(arg in VALUE_FLAGS)) die(`unknown argument ${arg}`)
  const value = args[++index]
  if (value === undefined) die(`${arg} requires a value`)
  opts[VALUE_FLAGS[arg]] = value
}
const mode = opts.heartbeat === true ? 'heartbeat'
  : (opts.distTags !== undefined || opts.distTagsFile !== undefined) ? 'dist-tags'
    : (opts.hostSource !== undefined || process.env.DSH_HOST_SOURCE) ? 'probe'
      : null
if (mode === null) die('no mode selected: --host-source (or env DSH_HOST_SOURCE), --dist-tags/--dist-tags-file, or --heartbeat is required')

const repoRoot = resolve(opts.repo ?? DEFAULT_REPO)
const log = (message) => console.error(`[host-radar-probe] ${message}`)

// ── 文本提取工具（host-contract.mjs 同法——剥注释后按 marker 取配对括号字面量）──
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (line) => line.replace(/[^\n]/g, ' '))
const arrayOf = (source, startMarker) => {
  const start = source.indexOf(startMarker)
  if (start < 0) return ''
  const open = source.indexOf('[', start)
  if (open < 0) return ''
  let depth = 0
  for (let index = open; index < source.length; index++) {
    if (source[index] === '[') depth += 1
    else if (source[index] === ']') {
      depth -= 1
      if (depth === 0) return source.slice(open, index + 1)
    }
  }
  return ''
}
const blockOf = (source, startMarker) => {
  const start = source.indexOf(startMarker)
  if (start < 0) return ''
  let depth = 0
  let opened = false
  for (let index = start; index < source.length; index++) {
    if (source[index] === '{') { depth += 1; opened = true } else if (source[index] === '}') {
      depth -= 1
      if (opened && depth === 0) return source.slice(start, index + 1)
    }
  }
  return source.slice(start)
}
/** marker 提取（失败 = 自身故障 → exit 1——P8：marker 缺失必须可观测，不静默空判）。 */
const extractLiteral = (file, marker, bracer) => {
  let text = ''
  try { text = readFileSync(join(repoRoot, file), 'utf8') } catch { die(`${file} unreadable under --repo ${repoRoot} (P8: extraction source missing)`) }
  const literal = bracer(stripComments(text), marker)
  if (!literal) die(`marker '${marker}' not found in ${file} (P8: baseline/contract extraction failed — radar refuses to compare without its authoritative source)`)
  try {
    return new Function(`return ${literal}`)()
  } catch (error) {
    die(`literal after marker '${marker}' in ${file} unparsable: ${error?.message ?? error} (P8 fail-loud)`)
  }
}

// ── 心跳模式（无需基线档案——先于注册表提取分派）──────────────────────────────
if (mode === 'heartbeat') {
  const intervalDays = Number(opts.intervalDays ?? '7')
  const misses = Number(opts.misses ?? '2')
  if (!(intervalDays > 0) || !(misses > 0)) die('--interval-days/--misses must be positive numbers')
  const now = opts.now ?? new Date().toISOString()
  const nowMs = Date.parse(now)
  if (Number.isNaN(nowMs)) die(`--now is not a valid ISO timestamp: ${now}`)
  const lastSeenRaw = String(opts.lastSeen ?? '')
  if (lastSeenRaw === '') die('--last-seen is required for heartbeat mode')
  let lastSeenMs = null
  if (lastSeenRaw !== 'never') {
    lastSeenMs = Date.parse(lastSeenRaw)
    if (Number.isNaN(lastSeenMs)) die(`--last-seen is not a valid ISO timestamp or 'never': ${lastSeenRaw}`)
  }
  const gapDays = lastSeenMs === null ? null : (nowMs - lastSeenMs) / 86_400_000
  const thresholdDays = intervalDays * misses
  const stale = lastSeenMs !== null && gapDays > thresholdDays
  const report = {
    mode: 'heartbeat', generatedAt: new Date().toISOString(),
    lastSeen: lastSeenRaw, now, gapDays: gapDays === null ? null : Number(gapDays.toFixed(3)),
    intervalDays, misses, thresholdDays, stale,
  }
  log(`heartbeat: lastSeen=${lastSeenRaw} gap=${report.gapDays ?? 'n/a'}d threshold=${thresholdDays}d → stale=${stale}`)
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

// ── 基线档案单源提取（registry）+ 目标基线选择（R3 DSH_BASELINE 语义）──────────
const REGISTRY_MARKER = 'const HOST_BASELINE_REGISTRY = Object.freeze('
const registry = extractLiteral('tests/host-version-snapshot.mjs', REGISTRY_MARKER, arrayOf)
if (!Array.isArray(registry) || registry.length === 0) die('HOST_BASELINE_REGISTRY extracted but not a non-empty array (P8 fail-loud)')
const primary = registry.find((entry) => entry?.status === 'primary') ?? null
if (primary === null) die('HOST_BASELINE_REGISTRY has no primary entry (P8 fail-loud)')
const baselineRaw = String(opts.baseline ?? process.env.DSH_BASELINE ?? '').trim()
const selectedBaseline = baselineRaw === ''
  ? primary
  : registry.find((entry) => entry?.id === baselineRaw || entry?.status === baselineRaw) ?? null
if (selectedBaseline === null) {
  die(`unknown --baseline '${baselineRaw}' (valid: ${registry.map((entry) => `${entry.id}/${entry.status}`).join(', ')}; env DSH_BASELINE same semantics — fail-closed, no silent fallback to primary)`)
}
if (selectedBaseline !== primary) log(`baseline selected: ${selectedBaseline.id}(${selectedBaseline.status}) — primary stays ${primary.id} (R3 parameterization; packageTable judges against the selected entry)`)

// ── dist-tags 模式：全枚举比对（F-5：预发布通道不失明）────────────────────────
if (mode === 'dist-tags') {
  const raw = opts.distTags !== undefined ? String(opts.distTags) : (() => {
    try { return readFileSync(resolve(opts.distTagsFile), 'utf8') } catch (error) { die(`--dist-tags-file unreadable: ${error?.code ?? error?.message} (P8: npm view output missing — radar malfunction is observable, never silent)`) }
  })()
  let tags = null
  try { tags = JSON.parse(raw) } catch { die(`dist-tags payload is not JSON (P8 fail-loud): ${raw.slice(0, 120)}`) }
  if (tags === null || typeof tags !== 'object' || Array.isArray(tags) || Object.values(tags).some((value) => typeof value !== 'string' || value.trim() === '')) {
    die('dist-tags payload must be an object of {tag: version-string} (as produced by `npm view @deepseek-ai/dsh dist-tags --json`)')
  }
  let seen = []
  if (opts.seen !== undefined) {
    try { seen = JSON.parse(String(opts.seen)) } catch { die(`--seen is not JSON: ${opts.seen}`) }
    if (!Array.isArray(seen) || seen.some((value) => typeof value !== 'string')) die('--seen must be a JSON array of version strings')
  }
  const known = new Set([...registry.map((entry) => entry.dsh), ...seen])
  const tagVersions = [...new Set(Object.values(tags))]
  const newVersions = tagVersions.filter((version) => !known.has(version))
  const newTagHits = Object.fromEntries(Object.entries(tags).filter(([, version]) => !known.has(version)))
  const report = {
    mode: 'dist-tags', generatedAt: new Date().toISOString(),
    primary: { id: primary.id, dsh: primary.dsh, dshPackages: primary.dshPackages },
    knownVersions: [...known], tags, tagVersions, newVersions, newTagHits,
  }
  log(`dist-tags: ${Object.keys(tags).length} tag(s) [${Object.entries(tags).map(([tag, version]) => `${tag}→${version}`).join(', ')}] vs known ${known.size} → new: ${newVersions.length === 0 ? 'none' : newVersions.join(', ')}`)
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

// ── probe 模式：四类 diff 报告（无基线断言——探测不门控）──────────────────────
const hostSourceRaw = opts.hostSource ?? process.env.DSH_HOST_SOURCE
const hostSource = resolve(hostSourceRaw)
if (!existsSync(join(hostSource, 'dsh-api-remotes', 'lib', 'client.js'))) {
  die(`--host-source is not a host tree (no dsh-api-remotes/lib/client.js under ${hostSource}) — probe must be aimed explicitly (F-A lesson: no auto-discovery of stale copies)`)
}

// 契约常量提取（host-contract.mjs——独立入口套件不可 import，marker 文本提取）
const KEY_PACKAGES = extractLiteral('tests/host-contract.mjs', 'const HOST_KEY_PACKAGES = [', arrayOf)
if (!Array.isArray(KEY_PACKAGES) || KEY_PACKAGES.length === 0) die('HOST_KEY_PACKAGES extracted but not a non-empty array (P8 fail-loud)')
const SHAPE_ANCHORS = extractLiteral('tests/host-contract.mjs', 'const HOST_SHAPE_ANCHORS = [', arrayOf)
if (!Array.isArray(SHAPE_ANCHORS) || SHAPE_ANCHORS.length === 0) die('HOST_SHAPE_ANCHORS extracted but not a non-empty array (P8 fail-loud)')
// （对象字面量提取 marker 取赋值表达式形态 `NAME = {`——blockOf 返回含前缀的块，
// `new Function('return NAME = {...}')` 按赋值表达式求值——host-contract S1c 镜像提取同法）
const WIRE_SCHEMA_WHITELIST = extractLiteral('tests/host-contract.mjs', 'WIRE_SCHEMA_WHITELIST = {', blockOf)
if (WIRE_SCHEMA_WHITELIST === null || typeof WIRE_SCHEMA_WHITELIST !== 'object' || Array.isArray(WIRE_SCHEMA_WHITELIST)) die('WIRE_SCHEMA_WHITELIST extracted but not an object (P8 fail-loud)')
const LLM_ADAPTER_PROTO_BASELINE = extractLiteral('tests/host-contract.mjs', 'const LLM_ADAPTER_PROTO_BASELINE = [', arrayOf)
if (!Array.isArray(LLM_ADAPTER_PROTO_BASELINE) || LLM_ADAPTER_PROTO_BASELINE.length === 0) die('LLM_ADAPTER_PROTO_BASELINE extracted but not a non-empty array (P8 fail-loud)')

// 镜像白名单：lib 域模块直接 import（可导入面零提取——单一声明源）
const { FORWARDED_EVENT_ALLOWLIST } = await import(pathToFileURL(join(repoRoot, 'lib', 'host-abi', 'events.js')).href)
if (!Array.isArray(FORWARDED_EVENT_ALLOWLIST) || FORWARDED_EVENT_ALLOWLIST.length === 0) die('FORWARDED_EVENT_ALLOWLIST import failed (lib/host-abi/events.js — P8 fail-loud)')

// 宿主源码按需读取（只读零写入、按路径缓存——host-contract hostSourceOf 同法）
const hostRead = (() => {
  const cache = new Map()
  return (packageName, file) => {
    const key = `${packageName}/${file}`
    if (!cache.has(key)) {
      const path = join(hostSource, packageName, file)
      cache.set(key, existsSync(path) ? readFileSync(path, 'utf8') : null)
    }
    return cache.get(key)
  }
})()

// ④ 包表版本（T-6 吸收主判据：主包不变但嵌套树漂移 → mismatch 精确点名）
const versionOf = (name) => {
  const paths = name === 'dsh'
    ? [join(hostSource, 'dsh', 'package.json'), join(hostSource, '..', '..', 'package.json')]
    : [join(hostSource, name, 'package.json')]
  for (const path of paths) {
    try {
      const version = JSON.parse(readFileSync(path, 'utf8')).version
      if (typeof version === 'string' && version.trim() !== '') return version
    } catch { /* 试下一形态（pack 树 scope/dsh / 全局树 scope/../..） */ }
  }
  return null
}
const expectedVersionOf = (name) => (name === 'dsh' ? selectedBaseline.dsh
  : name === 'cordis' ? selectedBaseline.cordis
    : name === 'schemastery' ? selectedBaseline.schemastery
      : selectedBaseline.dshPackages)
const packageTable = {}
for (const name of [...KEY_PACKAGES, 'cordis', 'schemastery']) {
  const expected = expectedVersionOf(name)
  const version = versionOf(name)
  packageTable[name] = version === null
    ? { status: 'absent', version: null, expected }
    : { status: version === expected ? 'match' : 'mismatch', version, expected }
}
const packageMismatches = Object.entries(packageTable).filter(([, entry]) => entry.status === 'mismatch').map(([name, entry]) => `${name}@${entry.version} ≠ ${entry.expected}`)
const packageAbsent = Object.entries(packageTable).filter(([, entry]) => entry.status === 'absent').map(([name]) => name)

// ① 锚 miss（S2 形状锚全集——probe 对未知树不按 since 分代收窄：未知树正是全集判据的对象）
const shapeAnchorResults = SHAPE_ANCHORS.map((spec) => {
  const files = Array.isArray(spec.expectFile) ? spec.expectFile : []
  const missingFiles = files.filter((file) => !existsSync(join(hostSource, String(spec.expectPackage ?? ''), file)))
    .map((file) => `${spec.expectPackage}/${file}`)
  const missingSymbols = []
  for (const entry of Array.isArray(spec.expectSymbolHost) ? spec.expectSymbolHost : []) {
    const text = hostRead(String(spec.expectPackage ?? ''), String(entry.file ?? ''))
    for (const symbol of Array.isArray(entry.symbols) ? entry.symbols : []) {
      if (!(text ?? '').includes(symbol)) missingSymbols.push(`${spec.expectPackage}/${entry.file} :: ${symbol}`)
    }
  }
  return {
    face: spec.face, since: spec.since, expectPackage: spec.expectPackage,
    expectSymbolCount: (Array.isArray(spec.expectSymbol) ? spec.expectSymbol : []).length,
    missingFiles, missingSymbols,
  }
})
// S7 7c 半边：LlmAdapter 契约方法源码在位（dsh-llm/lib/index.js——提取基线 6 方法）
const llmIndexText = hostRead('dsh-llm', 'lib/index.js')
const llmAdapter = {
  file: 'dsh-llm/lib/index.js',
  fileAbsent: llmIndexText === null,
  missing: LLM_ADAPTER_PROTO_BASELINE.filter((method) => !new RegExp(`\\b${method}\\(`).test(llmIndexText ?? '')),
}
// S7 7d 半边：InputState 形状（正/负向锚）+ resolveDraftAttachments + kind 判别字段。
// 针为 host-contract.mjs 内联字面量的机器锁拷贝（tests/host-radar.mjs 锚定权威源——F-J 先例）。
const inputContractText = hostRead('dsh-client-ui-conversation', 'lib/types/client/contract/input.d.ts')
const conversationServiceText = hostRead('dsh-client-ui-conversation', 'lib/types/client/service.d.ts')
const composerSlotsText = hostRead('dsh-client-ui-conversation', 'lib/types/client/contract/slots.d.ts')
const inputState = {
  attachmentIds: (inputContractText ?? '').includes('readonly attachmentIds: readonly DraftAttachmentId[]'),
  imageIdsResurrected: inputContractText !== null && /readonly imageIds\s*:/.test(inputContractText),
  resolveDraftAttachments: (conversationServiceText ?? '').includes('resolveDraftAttachments(ids: readonly DraftAttachmentId[]): readonly ComposerAttachment[]'),
  composerKindDiscriminators: (composerSlotsText ?? '').includes("kind: 'image'") && (composerSlotsText ?? '').includes("kind: 'file'"),
}
const inputStateMisses = [
  !inputState.attachmentIds, inputState.imageIdsResurrected, !inputState.resolveDraftAttachments, !inputState.composerKindDiscriminators,
].filter(Boolean).length

// ② 白名单增删（宿主声明源 vs 镜像——双向）
const eventsText = hostRead('dsh-api-remotes', 'lib/types/remote-events.js')
const hostEvents = eventsText === null ? null : [...eventsText.matchAll(/event:\s*'([^']+)'/g)].map((match) => match[1])
const forwardedEvents = hostEvents === null
  ? { hostFile: 'dsh-api-remotes/lib/types/remote-events.js', error: 'unreadable (file absent in probed tree)' }
  : {
      hostFile: 'dsh-api-remotes/lib/types/remote-events.js',
      hostCount: hostEvents.length, mirrorCount: FORWARDED_EVENT_ALLOWLIST.length,
      hostOnly: hostEvents.filter((event) => !FORWARDED_EVENT_ALLOWLIST.includes(event)),
      mirrorOnly: FORWARDED_EVENT_ALLOWLIST.filter((event) => !hostEvents.includes(event)),
    }

// ③ schema 字段（六面顶层字段双向——S7 7b topLevelFields 同算法）
const hostClientLines = (hostRead('dsh-api-remotes', 'lib/client.js') ?? '').split(/\r?\n/)
const schemaBlockOf = (symbol) => {
  const line = hostClientLines.findIndex((text) => text.includes(`${symbol}$schema = `))
  return line < 0 ? '' : hostClientLines.slice(line, line + 60).join('\n')
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
const wireSchemas = {}
for (const [face, spec] of Object.entries(WIRE_SCHEMA_WHITELIST)) {
  const symbol = `${face.replace('.', '_')}_result`
  const block = schemaBlockOf(symbol)
  const hostFields = block === '' ? null : topLevelFields(block)
  wireSchemas[face] = hostFields === null
    ? { symbol, baselineFields: spec.schema, error: `schema symbol '${symbol}$schema' not found in host lib/client.js` }
    : {
        symbol, hostFields, baselineFields: spec.schema,
        hostOnly: hostFields.filter((field) => !spec.schema.includes(field)),
        baselineOnly: spec.schema.filter((field) => !hostFields.includes(field)),
      }
}
const schemaFacesWithDiff = Object.entries(wireSchemas)
  .filter(([, face]) => face.error !== undefined || face.hostOnly.length > 0 || face.baselineOnly.length > 0)
  .map(([face]) => face)

// 汇总（totalDiffs = 四类计数之和——issue 开立判据；exit 恒 0：探测不门控）
const anchorMisses = shapeAnchorResults.reduce((sum, face) => sum + face.missingFiles.length + face.missingSymbols.length, 0)
  + llmAdapter.missing.length + inputStateMisses
const summary = {
  anchorMisses,
  eventHostOnly: forwardedEvents.hostOnly?.length ?? 0,
  eventMirrorOnly: forwardedEvents.mirrorOnly?.length ?? 0,
  eventUnreadable: forwardedEvents.error !== undefined ? 1 : 0,
  schemaFacesWithDiff: schemaFacesWithDiff.length,
  packageMismatches: packageMismatches.length,
  packageAbsent: packageAbsent.length,
  totalDiffs: anchorMisses + (forwardedEvents.hostOnly?.length ?? 0) + (forwardedEvents.mirrorOnly?.length ?? 0)
    + (forwardedEvents.error !== undefined ? 1 : 0) + schemaFacesWithDiff.length + packageMismatches.length,
}
const report = {
  mode: 'probe',
  generatedAt: new Date().toISOString(),
  hostSource, repo: repoRoot,
  baseline: {
    id: selectedBaseline.id, status: selectedBaseline.status,
    dsh: selectedBaseline.dsh, dshPackages: selectedBaseline.dshPackages,
    cordis: selectedBaseline.cordis, schemastery: selectedBaseline.schemastery,
  },
  anchors: { shapeAnchors: shapeAnchorResults, llmAdapter, inputState },
  forwardedEvents,
  wireSchemas,
  packageTable,
  summary,
}
log(`probe: host=${hostSource} baseline=${selectedBaseline.id}(${selectedBaseline.status}) → totalDiffs=${summary.totalDiffs} (anchors=${summary.anchorMisses} events=+${summary.eventHostOnly}/-${summary.eventMirrorOnly}${summary.eventUnreadable ? '/unreadable' : ''} schemas=${summary.schemaFacesWithDiff} packages=${summary.packageMismatches} mismatch + ${summary.packageAbsent} absent) — probe never gates: exit 0`)
if (packageMismatches.length > 0) log(`package mismatches: ${packageMismatches.join('; ')}`)
if (opts.outFile !== undefined) {
  mkdirSync(dirname(resolve(opts.outFile)), { recursive: true })
  writeFileSync(resolve(opts.outFile), `${JSON.stringify(report, null, 2)}\n`)
  log(`report written: ${resolve(opts.outFile)}`)
}
console.log(JSON.stringify(report, null, 2))
process.exit(0)
