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
 * ARCH-007 增补（「可调测性 / 校验层」批）：probe 模式新增两维——
 *   ① `--distribution auto|npm|bundled`：按**内容判据**（抽样包 `lib/types` 下 `.d.ts`
 *      计数；单一实现 = `lib/host-abi/distribution.js`，不按路径猜测）判定宿主分发形态，
 *      报告增 `distribution: {detected, source, typeAnchors}` 面。bundled 形态（桌面 asar
 *      发布体整树无 `.d.ts`）下类型声明锚记 `anchors.unavailable`（单列、不计入
 *      `totalDiffs`，语义 = 分发形态不可验）；真符号/文件缺席仍记 `missing`（真 ABI 位移）。
 *      forced 标签只覆盖 `detected`，`byContent`/`typeAnchors` 恒为实测值（两形态对照）。
 *   ② `--matrix`：把四类 diff 翻译成**升级代价矩阵**（必须改 / 建议改 / 无需改），每条
 *      定位到 package + file + symbol/event/schema 面；stdout 人读面，`--out` 工件增
 *      `matrix` 面。矩阵不改变 exit 语义（探测恒不门控）。
 *   两者均**仅 probe 模式**可用（需要 `--host-source`）；非法取值 / 越模式使用 → exit 1。
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

const USAGE = 'usage: node scripts/host-radar-probe.mjs --host-source <dir> [--baseline <id|status>] [--distribution auto|npm|bundled] [--matrix] [--out <file>] [--repo <root>] | --dist-tags <json>|--dist-tags-file <file> [--seen <json>] | --heartbeat --last-seen <iso|never> [--now <iso>] [--interval-days 7] [--misses 2]'
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
  '--distribution': 'distribution', '--dist-tags': 'distTags', '--dist-tags-file': 'distTagsFile', '--seen': 'seen',
  '--last-seen': 'lastSeen', '--now': 'now', '--interval-days': 'intervalDays', '--misses': 'misses',
}
for (let index = 0; index < args.length; index++) {
  const arg = args[index]
  if (arg === '--heartbeat') { opts.heartbeat = true; continue }
  if (arg === '--matrix') { opts.matrix = true; continue }
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

// 分发形态判定（ARCH-007 R-1）：**单一实现**在 lib/host-abi/distribution.js。
// 该模块只读宿主内容（抽样包 `lib/types` 下 `.d.ts` 计数），不做路径启发式。
// `--repo` 可配 ⇒ 必须按 repoRoot 动态 import（与 events 白名单同法，禁相对静态 import）；
// import 延后到基线档案提取之后：repo 缺失时先报「权威源不可读」根因，而非模块解析栈。
if (opts.distribution !== undefined || opts.matrix === true) {
  if (mode !== 'probe') die('--distribution/--matrix are probe-mode flags (they answer「这份宿主树必须改什么」——需要 --host-source)')
}

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

// 分发形态模块 import（ARCH-007 R-1）：仅 probe 模式需要；失败必须结构化报错（P8），
// 不得以 ERR_MODULE_NOT_FOUND 栈逃逸。DISTRIBUTION_MODES 用于 --distribution 枚举校验。
let detectHostDistribution = null
let isTypeDeclarationFile = null
let typeAnchorsUnavailable = null
if (mode === 'probe') {
  let distributionModule
  try {
    distributionModule = await import(pathToFileURL(join(repoRoot, 'lib', 'host-abi', 'distribution.js')).href)
  } catch (error) {
    die(`lib/host-abi/distribution.js unimportable under --repo ${repoRoot}: ${error?.code ?? error?.message} (P8: distribution detection is part of the probe, not optional)`)
  }
  if (opts.distribution !== undefined && !distributionModule.DISTRIBUTION_MODES.includes(opts.distribution)) {
    die(`--distribution must be one of ${distributionModule.DISTRIBUTION_MODES.join('|')} (got '${opts.distribution}') — fail-closed, no silent auto fallback`)
  }
  ;({ detectHostDistribution, isTypeDeclarationFile, typeAnchorsUnavailable } = distributionModule)
}

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
    // 档案面全量随报告输出（ARCH-007）：测试/消费方从 CLI 报告取基线值，禁止在测试里
    // 硬编码版本常量（基线换代时夹具与断言自动跟随注册表——单源消费，P5）。
    registry: registry.map((entry) => ({
      id: entry.id, status: entry.status, dsh: entry.dsh, dshPackages: entry.dshPackages,
      cordis: entry.cordis, schemastery: entry.schemastery,
    })),
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

// 分发形态（ARCH-007 B4：内容判据，`--distribution auto` 默认）：`bundled` 桌面树整树
// 无 `.d.ts` ⇒ 类型声明锚记 `unavailable`（分发形态所致，**不是 ABI 位移**），单列且
// **不计入 totalDiffs**；真位移（missing）仍计入。forced 标签只覆盖标签，实况留在
// `evidence`。
const distribution = detectHostDistribution(hostSource, { requested: opts.distribution ?? 'auto' })
const anchorsUnavailable = typeAnchorsUnavailable(distribution)
log(`distribution: detected=${distribution.detected} byContent=${distribution.byContent} requested=${distribution.requested} typeAnchors=${distribution.typeAnchors} — ${distribution.source}`)
if (anchorsUnavailable) {
  log('type declarations wholly absent in this distribution shape ⇒ .d.ts anchors will be reported as `unavailable` (excluded from totalDiffs), NOT `missing`; genuine ABI displacement must be judged on an npm-shaped tree or the runtime surface')
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
// ARCH-007 分型：`unavailableFiles/unavailableSymbols` = 分发形态（bundled 无 `.d.ts`）
// 所致不可验；`missingFiles/missingSymbols` = 真 ABI 位移。二者单列、前者不计 diff。
const shapeAnchorResults = SHAPE_ANCHORS.map((spec) => {
  // ARCH-007 D4：与 host-contract 同一解析语义（有序候选落点组；旧位置在前）。
  // probe 是独立入口，不能 import tests/host-contract.mjs（边执行套件）；此处保持
  // 「声明 → 解析」同形，任何语义变化两处同步（tests/host-radar.mjs 设机器锁）。
  const packages = Array.isArray(spec.expectPackage)
    ? spec.expectPackage.filter((name) => typeof name === 'string' && name !== '')
    : (typeof spec.expectPackage === 'string' && spec.expectPackage !== '' ? [spec.expectPackage] : [])
  const fallbackPackage = packages.length === 1 ? packages[0] : null
  const entryFiles = (entry) => (Array.isArray(entry.files)
    ? entry.files.filter((file) => typeof file === 'string' && file !== '')
    : (typeof entry.file === 'string' && entry.file !== '' ? [entry.file] : []))
  const entryPackage = (entry) => (typeof entry.package === 'string' && entry.package !== '' ? entry.package : fallbackPackage)
  const evaluate = (entry) => {
    const packageName = entryPackage(entry)
    const files = entryFiles(entry)
    const absent = packageName === null
      ? files
      : files.filter((file) => !existsSync(join(hostSource, packageName, file)))
    const unavailable = absent.length === files.length && files.length > 0
      && anchorsUnavailable && files.every((file) => isTypeDeclarationFile(file))
    const symbols = Array.isArray(entry.symbols) ? entry.symbols : []
    const text = packageName !== null && files.length > 0 ? hostRead(packageName, files[0]) : null
    const missingSymbols = absent.length === 0
      ? symbols.filter((symbol) => !(text ?? '').includes(symbol))
      : []
    return {
      package: packageName, files, symbols, absent, unavailable, missingSymbols,
      location: `${packageName ?? '<package>'} / ${files.join(' + ') || '<file>'}`,
      hit: absent.length === 0 && missingSymbols.length === 0,
    }
  }
  const required = []
  const groups = new Map()
  for (const entry of Array.isArray(spec.expectSymbolHost) ? spec.expectSymbolHost : []) {
    if (entry === null || typeof entry !== 'object') continue
    if (entry.group === undefined) required.push(evaluate(entry))
    else {
      if (!groups.has(entry.group)) groups.set(entry.group, [])
      groups.get(entry.group).push(evaluate(entry))
    }
  }
  const resolvedGroups = [...groups.entries()].map(([name, candidates]) => {
    const hitIndex = candidates.findIndex((candidate) => candidate.hit)
    return { name, candidates, hitIndex, hit: hitIndex >= 0 ? candidates[hitIndex] : null }
  })
  const missingFiles = []
  const missingSymbols = []
  const unavailableFiles = []
  const unavailableSymbols = []
  const addAbsent = (candidate) => {
    if (candidate.unavailable) {
      unavailableFiles.push(`${candidate.package ?? '<package>'}/${candidate.files.join(' + ')}`)
      unavailableSymbols.push(...candidate.symbols.map((symbol) => `${candidate.package ?? '<package>'}/${candidate.files.join(' + ')} :: ${symbol}`))
    } else {
      for (const file of candidate.absent) missingFiles.push(`${candidate.package ?? '<package>'}/${file}`)
      for (const symbol of candidate.missingSymbols) missingSymbols.push(`${candidate.package ?? '<package>'}/${candidate.files.join(' + ')} :: ${symbol}`)
    }
  }
  for (const candidate of required) addAbsent(candidate)
  const positionDrifts = []
  for (const group of resolvedGroups) {
    if (group.hit !== null) {
      if (group.hitIndex > 0) {
        positionDrifts.push({
          group: group.name,
          from: { package: group.candidates[0].package, files: group.candidates[0].files, symbols: group.candidates[0].symbols },
          to: { package: group.hit.package, files: group.hit.files, symbols: group.hit.symbols },
        })
      }
      continue
    }
    for (const candidate of group.candidates) addAbsent(candidate)
  }
  return {
    face: spec.face, since: spec.since, expectPackage: spec.expectPackage,
    expectSymbolCount: (Array.isArray(spec.expectSymbol) ? spec.expectSymbol : []).length,
    missingFiles, missingSymbols,
    unavailableFiles, unavailableSymbols,
    positionDrifts,
  }
})
for (const face of shapeAnchorResults) {
  for (const drift of face.positionDrifts) {
    log(`anchor position drift: [${face.face}] ${drift.group} ${drift.from.package}/${drift.from.files.join(' + ')} → ${drift.to.package}/${drift.to.files.join(' + ')} (host internal layout changed; contract face unchanged; not an ABI displacement)`)
  }
}
// 不可验锚单列（包 + 文件 + 符号 + 原因）——报告消费方不需要自己从两个数组反推。
const unavailableAnchors = shapeAnchorResults
  .filter((face) => face.unavailableFiles.length > 0 || face.unavailableSymbols.length > 0)
  .map((face) => ({
    face: face.face,
    package: face.expectPackage,
    files: face.unavailableFiles,
    symbols: face.unavailableSymbols,
    reason: `distribution ${distribution.detected}: type declaration files wholly absent (content criterion) — not ABI displacement`,
  }))
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
  // ARCH-007：四字段全部来自 `.d.ts` 声明面——bundled 形态下整面缺席 ⇒ 四字段
  // 「不可验」（false 只表示读不到，不是契约否定），单列不计 diff。
  verifiable: !(anchorsUnavailable && inputContractText === null && conversationServiceText === null && composerSlotsText === null),
}
const inputStateUnavailableFiles = [
  ['lib/types/client/contract/input.d.ts', inputContractText],
  ['lib/types/client/service.d.ts', conversationServiceText],
  ['lib/types/client/contract/slots.d.ts', composerSlotsText],
].filter(([, text]) => text === null).map(([file]) => file)
if (!inputState.verifiable) inputState.unavailableFiles = inputStateUnavailableFiles
const inputStateMisses = inputState.verifiable
  ? [!inputState.attachmentIds, inputState.imageIdsResurrected, !inputState.resolveDraftAttachments, !inputState.composerKindDiscriminators].filter(Boolean).length
  : 0
// 不可验按「面」计：InputState 的 4 个字段各是一面（与 summary 口径一致，避免 1 组 = 1 项的歧义）。
const inputStateUnavailable = inputState.verifiable ? 0 : 4

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

// 汇总（totalDiffs = 不可验除外的 diff 计数之和——issue 开立判据；exit 恒 0：探测不门控）
// ARCH-007：`anchorUnavailable`（分发形态致不可验）**单列、不计入 totalDiffs**；真位移 missing 照旧计入。
const anchorMisses = shapeAnchorResults.reduce((sum, face) => sum + face.missingFiles.length + face.missingSymbols.length, 0)
  + llmAdapter.missing.length + inputStateMisses
const anchorUnavailable = unavailableAnchors.reduce((sum, anchor) => sum + anchor.files.length + anchor.symbols.length, 0)
  + inputStateUnavailable
const anchorPositionDrifts = shapeAnchorResults.reduce((sum, face) => sum + face.positionDrifts.length, 0)
const summary = {
  anchorMisses,
  anchorUnavailable,
  anchorPositionDrifts,
  eventHostOnly: forwardedEvents.hostOnly?.length ?? 0,
  eventMirrorOnly: forwardedEvents.mirrorOnly?.length ?? 0,
  eventUnreadable: forwardedEvents.error !== undefined ? 1 : 0,
  schemaFacesWithDiff: schemaFacesWithDiff.length,
  packageMismatches: packageMismatches.length,
  packageAbsent: packageAbsent.length,
  totalDiffs: anchorMisses + (forwardedEvents.hostOnly?.length ?? 0) + (forwardedEvents.mirrorOnly?.length ?? 0)
    + (forwardedEvents.error !== undefined ? 1 : 0) + schemaFacesWithDiff.length + packageMismatches.length,
}

// ── ② 升级代价矩阵（--matrix）：分桶按**影响**，不解析 semver（ARCH-007 §7）────────
// 必须改 = 不改即错：真 ABI 位移 / 宿主已发射而镜像漏收 / 白名单字段收缩 / 面不可读；
// 建议改 = 需判断后动：版本代差、声明面增量、分发形态不可验（证据缺口）、死项；
// 无需改 = 零差异面（每面一行结论）。
const matrix = (() => {
  const buckets = { must: [], suggest: [], none: [] }
  const seen = new Set()
  const add = (bucket, category, location, detail, action) => {
    const key = `${bucket}|${category}|${location}`
    if (seen.has(key)) return // 同一符号可能被多个锚面共同声明——结论相同，不重复开条目
    seen.add(key)
    buckets[bucket].push({ category, location, detail, action })
  }
  const declarationTotal = distribution.evidence.reduce((sum, entry) => sum + entry.declarationFiles, 0)

  // 1) 分发形态 / 类型声明面（整树级）
  if (distribution.detected === 'unknown') {
    add('must', 'distribution', hostSource, '宿主树不可判别分发形态（抽样包均不在位，矩阵其余条目亦不可信）', '确认 --host-source 指向宿主 @deepseek-ai scope 目录；asar 形态先用 scripts/host-asar-extract.mjs 解包')
  } else if (anchorsUnavailable) {
    add('suggest', 'distribution', `@deepseek-ai/*（${distribution.detected}）`,
      `整树 ${declarationTotal} 个 .d.ts ⇒ ${anchorUnavailable} 项类型声明锚（文件/符号/InputState 面）「不可验」（分发形态所致，不是 ABI 位移）`,
      '声明面换 npm 形态树复核（同版本 npm 包 / npm 全局树）；运行时契约按本矩阵其它条目判——不要因 bundled 树无 .d.ts 改代码')
  } else {
    add('none', 'distribution', `@deepseek-ai/*（${distribution.detected}；${declarationTotal} 个 .d.ts）`, '类型声明面可验', '无需动作')
  }

  // 2) 形状锚 / LlmAdapter / InputState（逐包逐文件逐符号定位）
  let anchorFaceDiff = false
  for (const face of shapeAnchorResults) {
    for (const file of face.missingFiles) {
      anchorFaceDiff = true
      add('must', 'anchor.file', file, `形状锚「${face.face}」声明的宿主文件不存在（真 ABI 位移）`, '核对宿主改名/迁移落点，按运行时面重锚并更新 since')
    }
    for (const symbol of face.missingSymbols) {
      anchorFaceDiff = true
      add('must', 'anchor.symbol', symbol, `形状锚「${face.face}」声明的符号不在宿主源码内（真 ABI 位移）`, '按宿主新落点重锚（ARCH-007 D4 候选落点组：旧位置在前、新位置按实读登记），并更新 since')
    }
    for (const drift of face.positionDrifts) {
      // 位置漂移 = 契约面未变的宿主内部布局变化：不判必须改，但矩阵必须可见（P8）。
      add('none', 'anchor.drift', `${drift.from.package}/${drift.from.files.join(' + ')} → ${drift.to.package}/${drift.to.files.join(' + ')}`,
        `形状锚「${face.face}」命中非首候选落点（${drift.group}；旧位置在前）——宿主内部布局/符号名变化，契约面未变；ARCH-007 D4 候选落点已承接，无需改码`,
        '无需动作')
    }
  }
  for (const method of llmAdapter.missing) {
    anchorFaceDiff = true
    add('must', 'anchor.symbol', `${llmAdapter.file} :: ${method}(`, 'LlmAdapter 契约方法不在宿主源码内（实现面收缩）', '按宿主方法表调整 LlmAdapter 消费/桩；核对是否改名或落到分文件')
  }
  if (inputState.verifiable) {
    if (inputStateMisses > 0) anchorFaceDiff = true
    if (!inputState.attachmentIds) add('must', 'anchor.field', 'dsh-client-ui-conversation/lib/types/client/contract/input.d.ts :: readonly attachmentIds', 'InputState 失去统一附件编址字段（FIX-048 M2 形态）', '按宿主契约调整附件读取面（禁回退 imageIds）')
    if (inputState.imageIdsResurrected) add('must', 'anchor.field', 'dsh-client-ui-conversation/lib/types/client/contract/input.d.ts :: readonly imageIds', '宿主契约重现 imageIds 旧字段（契约再漂移）', '按实读重评双形态回落策略（非机械改码）')
    if (!inputState.resolveDraftAttachments) add('must', 'anchor.field', 'dsh-client-ui-conversation/lib/types/client/service.d.ts :: resolveDraftAttachments', 'conversation 服务声明失去 kind 解析面', '按宿主服务面调整附件接管链路')
    if (!inputState.composerKindDiscriminators) add('must', 'anchor.field', 'dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts :: kind:', "ComposerAttachment kind 判别字段不再是 'image'|'file'", '按宿主 slots 契约调整 kind 解析')
  } else {
    add('suggest', 'anchor.unavailable', 'dsh-client-ui-conversation/lib/types/client/{contract/input.d.ts,service.d.ts,contract/slots.d.ts}', 'InputState 4 面不可验（整树无 .d.ts）', 'npm 形态树下复核；运行时面以 --matrix 的其它条目为准')
  }
  if (!anchorFaceDiff && (inputState.verifiable || !anchorsUnavailable)) {
    add('none', 'anchor', `形状锚 ${shapeAnchorResults.length} 面 + LlmAdapter + InputState（${inputState.verifiable ? '4 面' : '不可验'}）`, '锚文件与符号全在位，InputState 无障碍', '无需动作')
  }

  // 3) 转发事件（双向：漏消费 = 必须；死项 = 建议）
  if (forwardedEvents.error !== undefined) {
    add('must', 'event', forwardedEvents.hostFile, forwardedEvents.error, '确认宿主事件声明源路径（harness 迁移即修探针读取面），否则事件面不可判定')
  } else {
    for (const event of forwardedEvents.hostOnly) add('must', 'event', `event: ${event}`, '宿主已发射、镜像未收录（漏消费 → 永不转发）', '评估后登记 FORWARDED_EVENT_ALLOWLIST（含 since 注记）；确认无需转发需留理由')
    for (const event of forwardedEvents.mirrorOnly) add('suggest', 'event', `event: ${event}`, '镜像收录但宿主声明源已无（死项 → 永不触发）', '从镜像删除，或确认宿主改名后重登记')
    if (forwardedEvents.hostOnly.length + forwardedEvents.mirrorOnly.length === 0) {
      add('none', 'event', forwardedEvents.hostFile, `镜像 ${forwardedEvents.mirrorCount} 项 ⊆ 宿主 ${forwardedEvents.hostCount} 项，无死项`, '无需动作')
    }
  }

  // 4) wire schema（字段收缩 = 必须；声明面增量 = 建议）
  for (const [face, schema] of Object.entries(wireSchemas)) {
    if (schema.error !== undefined) {
      add('must', 'schema', `${face}（${schema.symbol}$schema）`, schema.error, '确认宿主 client.js 的 schema 命名/结构；不可读面 = 消费契约不可判定')
      continue
    }
    for (const field of schema.baselineOnly) add('must', 'schema', `${face}.${field}`, '白名单要求的字段宿主已无（字段收缩 → 以 undefined 参与运算）', '按宿主新字段面调整消费面与白名单，并更新 since')
    for (const field of schema.hostOnly) add('suggest', 'schema', `${face}.${field}`, '宿主新增字段（声明面增量）', '评估语义后决定是否登记白名单字段')
  }
  if (schemaFacesWithDiff.length === 0) {
    add('none', 'schema', `${Object.keys(wireSchemas).length} 个 wire schema 面`, '顶层字段零差异', '无需动作')
  }

  // 5) 包表（版本代差 = 建议；缺包 = 证据缺口 = 建议）
  const packageProblems = Object.entries(packageTable).filter(([, entry]) => entry.status !== 'match')
  if (packageProblems.length === 0) {
    add('none', 'package.version', `${Object.keys(packageTable).length} 项版本`, `全部 === 基线 ${selectedBaseline.id}`, '无需动作')
  } else {
    for (const [name, entry] of Object.entries(packageTable)) {
      if (entry.status === 'mismatch') {
        add('suggest', 'package.version', `${name}@${entry.version}`, `期望 ${entry.expected}（所选基线 ${selectedBaseline.id}）—— 版本代差需判断消费面`, '若为新一代宿主：登记 HOST_BASELINE_REGISTRY 新档案（旧 primary 降 frozen）并确认范围覆盖；契约面零差异则无需改代码')
      } else if (entry.status === 'absent') {
        add('suggest', 'package.absent', name, '宿主树不含该包 → 该面证据缺口（抽取子集 / scope 外依赖会如此）', '补全抽取范围后复跑（完整 scope 树；cordis/schemastery 在 scope 外）')
      }
    }
  }

  return {
    policy: '必须改 = 不改即错的消费面缺口（真位移/漏消费/字段收缩/面不可读）；建议改 = 判断后动（版本代差/声明面增量/分发形态不可验/证据缺口）；无需改 = 零差异面。分桶按影响，不解析 semver（ARCH-007 §7）。',
    must: buckets.must, suggest: buckets.suggest, none: buckets.none,
    counts: { must: buckets.must.length, suggest: buckets.suggest.length, none: buckets.none.length },
  }
})()

const report = {
  mode: 'probe',
  generatedAt: new Date().toISOString(),
  hostSource, repo: repoRoot,
  distribution,
  baseline: {
    id: selectedBaseline.id, status: selectedBaseline.status,
    dsh: selectedBaseline.dsh, dshPackages: selectedBaseline.dshPackages,
    cordis: selectedBaseline.cordis, schemastery: selectedBaseline.schemastery,
  },
  anchors: { shapeAnchors: shapeAnchorResults, llmAdapter, inputState, unavailable: unavailableAnchors },
  forwardedEvents,
  wireSchemas,
  packageTable,
  matrix,
  summary,
}
log(`probe: host=${hostSource} baseline=${selectedBaseline.id}(${selectedBaseline.status}) distribution=${distribution.detected}/typeAnchors=${distribution.typeAnchors} → totalDiffs=${summary.totalDiffs} (anchors=${summary.anchorMisses} missing, ${summary.anchorUnavailable} unavailable 因分发形态不计入, events=+${summary.eventHostOnly}/-${summary.eventMirrorOnly}${summary.eventUnreadable ? '/unreadable' : ''} schemas=${summary.schemaFacesWithDiff} packages=${summary.packageMismatches} mismatch + ${summary.packageAbsent} absent) — probe never gates: exit 0`)
if (packageMismatches.length > 0) log(`package mismatches: ${packageMismatches.join('; ')}`)
if (opts.outFile !== undefined) {
  mkdirSync(dirname(resolve(opts.outFile)), { recursive: true })
  writeFileSync(resolve(opts.outFile), `${JSON.stringify(report, null, 2)}\n`)
  log(`report written: ${resolve(opts.outFile)}`)
}
if (opts.matrix === true) {
  console.log(renderMatrix(report, matrix))
} else {
  console.log(JSON.stringify(report, null, 2))
}
process.exit(0)

/** `--matrix` 可读渲染（同一 `matrix` 对象也随 `--out` JSON 落盘——单一数据源）。 */
function renderMatrix(reportValue, matrixValue) {
  const lines = []
  lines.push('══════════ 宿主升级代价矩阵（ARCH-007 · host upgrade-cost matrix）══════════')
  lines.push(`host: ${reportValue.hostSource}`)
  lines.push(`baseline: ${reportValue.baseline.id}(${reportValue.baseline.status}) dsh=${reportValue.baseline.dsh} dsh-*=${reportValue.baseline.dshPackages} cordis=${reportValue.baseline.cordis} schemastery=${reportValue.baseline.schemastery}`)
  lines.push(`distribution: ${reportValue.distribution.detected}（byContent=${reportValue.distribution.byContent}, requested=${reportValue.distribution.requested}）typeAnchors=${reportValue.distribution.typeAnchors}`)
  lines.push('')
  const sections = [
    ['must', '必须改（不改即错的消费面缺口）'],
    ['suggest', '建议改（判断后动）'],
    ['none', '无需改（零差异面）'],
  ]
  for (const [key, title] of sections) {
    lines.push(`${title}: ${matrixValue.counts[key]}`)
    if (matrixValue[key].length === 0) lines.push('  （无）')
    for (const [index, item] of matrixValue[key].entries()) {
      lines.push(`  ${index + 1}. [${item.category}] ${item.location}`)
      lines.push(`     现象: ${item.detail}`)
      if (item.action !== '无需动作') lines.push(`     动作: ${item.action}`)
    }
    lines.push('')
  }
  const summaryValue = reportValue.summary
  lines.push(`probe 原始计数: anchorMisses=${summaryValue.anchorMisses}（同一符号被多锚面共同声明时矩阵内合并为一条）· anchorPositionDrifts=${summaryValue.anchorPositionDrifts ?? 0}（契约面未变，单列不计 diff）· anchorUnavailable=${summaryValue.anchorUnavailable} 因分发形态不计入 · events +${summaryValue.eventHostOnly}/-${summaryValue.eventMirrorOnly} · schemas=${summaryValue.schemaFacesWithDiff} · packages ${summaryValue.packageMismatches} mismatch + ${summaryValue.packageAbsent} absent`)
  lines.push(`矩阵条目: 必须改 ${matrixValue.counts.must} · 建议改 ${matrixValue.counts.suggest} · 无需改 ${matrixValue.counts.none}`)
  lines.push('矩阵不门控：exit 0（探测层）——结论供人判断适配动作，禁作 CI 门禁替代品')
  return lines.join('\n')
}
