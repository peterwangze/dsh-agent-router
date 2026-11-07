#!/usr/bin/env node
/**
 * ARCH-007：分发形态判别域 + asar 宿主树抽取器的回归网。
 *
 * 两件事必须机器锁住：
 *  1. `lib/host-abi/distribution.js` 的**内容判据**（抽样包 `lib/types` 下 `.d.ts` 计数）
 *     与 forced 标签语义：forced 只改 `detected` 标签，`byContent`/`typeAnchors` 恒为实测。
 *     bundled ⇒ 类型锚 `unavailable`（≠ `missing`）；npm ⇒ `available`；空树 ⇒ `unknown`。
 *  2. `scripts/host-asar-extract.mjs` 的真实 asar 解析：packed 区段按 offset/size 复制，
 *     **unpacked 条目从 `<archive>.unpacked/` 读回**（不得跳过——跳过会让宿主树缺件、
 *     探针包存在性判定失真），头部损坏 / 内部路径含 `..` / unpacked 缺件一律非 0 退出
 *     （P8：抽取失败必须红；探针的「差异恒 exit 0」不适用于抽取器自身故障）。
 *     同时锁「不给 --out ⇒ 不写盘」「--packages 只抽指定包」两条 CLI 契约。
 *
 * 夹具是**手工构造的最小 asar**（pickle 头 + JSON 头 + 连续数据区），不依赖本机桌面
 * 安装体；真实安装体的抽取证据在 ARCH-007 报告里单列（大小/包数/unpacked 计数）。
 *
 * 独立入口：node tests/host-distribution.mjs（exit 0/1）。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DISTRIBUTION_SAMPLE_PACKAGES, DISTRIBUTION_MODES, TYPE_DECLARATION_SUFFIX,
  detectHostDistribution, isTypeDeclarationFile, typeAnchorsUnavailable,
} from '../lib/host-abi/distribution.js'

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EXTRACTOR = join(ROOT_DIR, 'scripts', 'host-asar-extract.mjs')
const PREFIX = 'dsh/node_modules/@deepseek-ai'

let failures = 0
let passed = 0
const check = (label, condition, detail) => {
  if (condition) { passed++; console.log(`  ok  ${label}`) }
  else {
    failures++
    console.error(`FAIL  ${label}${detail === undefined ? '' : ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`)
  }
}
const mkdtemp = (prefix) => mkdtempSync(join(tmpdir(), `arch007-host-dist-${prefix}-`))

/** 构造判据面宿主树：npm 形态写 `.d.ts`，bundled 形态只有运行时代码。 */
const buildDistributionTree = (prefix, options = {}) => {
  const { declarations = true, packages = DISTRIBUTION_SAMPLE_PACKAGES, typesDir = true } = options
  const root = mkdtemp(prefix)
  for (const packageName of packages) {
    const packageDir = join(root, packageName)
    mkdirSync(join(packageDir, 'lib'), { recursive: true })
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: packageName, version: '0.0.0-fixture' }))
    writeFileSync(join(packageDir, 'lib', 'index.js'), 'export const runtime = true\n')
    if (!typesDir) continue
    const typesDirPath = join(packageDir, 'lib', 'types')
    mkdirSync(typesDirPath, { recursive: true })
    if (declarations) writeFileSync(join(typesDirPath, 'index.d.ts'), 'export declare const runtime: boolean\n')
  }
  return root
}

console.log('ARCH-007 distribution（内容判据 × forced 标签语义 × 不可验判据）:')
{
  const npmTree = buildDistributionTree('npm')
  const npm = detectHostDistribution(npmTree)
  check('distribution: .d.ts 在位 → npm/available（内容判据；auto 不改变实测口径）',
    npm.requested === 'auto' && npm.detected === 'npm' && npm.byContent === 'npm'
      && npm.typeAnchors === 'available' && typeAnchorsUnavailable(npm) === false
      && npm.evidence.length === DISTRIBUTION_SAMPLE_PACKAGES.length
      && npm.evidence.every((entry) => entry.present && entry.declarationFiles === 1),
    npm)
  check('distribution: 判据串点名抽样数/实测计数（可观测，非「猜的」）',
    /内容判据/.test(npm.source) && new RegExp(`合计 ${DISTRIBUTION_SAMPLE_PACKAGES.length} 个`).test(npm.source)
      && /npm/.test(npm.source))

  const bundledTree = buildDistributionTree('bundled', { declarations: false })
  const bundled = detectHostDistribution(bundledTree)
  check('distribution: 抽样包在位但 0 个 .d.ts → bundled/unavailable（分发形态所致）',
    bundled.detected === 'bundled' && bundled.byContent === 'bundled'
      && bundled.typeAnchors === 'unavailable' && typeAnchorsUnavailable(bundled) === true
      && bundled.evidence.every((entry) => entry.present && entry.typesDirPresent && entry.declarationFiles === 0),
    bundled)

  const unknown = detectHostDistribution(mkdtemp('empty'))
  check('distribution: 抽样包全缺 → unknown（不猜；接线由可达性判据负责）',
    unknown.detected === 'unknown' && unknown.byContent === 'unknown'
      && unknown.typeAnchors === 'unavailable' && unknown.evidence.every((entry) => entry.present === false),
    unknown)

  const forcedNpm = detectHostDistribution(bundledTree, { requested: 'npm' })
  check('distribution: forced npm 只改标签（detected=npm，byContent/typeAnchors 仍测出 bundled/unavailable）',
    forcedNpm.detected === 'npm' && forcedNpm.byContent === 'bundled'
      && forcedNpm.typeAnchors === 'unavailable' && typeAnchorsUnavailable(forcedNpm) === false
      && /forced/.test(forcedNpm.source),
    forcedNpm)
  const forcedBundled = detectHostDistribution(npmTree, { requested: 'bundled' })
  check('distribution: forced bundled 遇 npm 树 → typeAnchors 仍 available（文件在即核验，不按标签撒谎）',
    forcedBundled.detected === 'bundled' && forcedBundled.byContent === 'npm'
      && forcedBundled.typeAnchors === 'available' && typeAnchorsUnavailable(forcedBundled) === false,
    forcedBundled)

  check('distribution: 非法 requested 抛错且点名合法枚举（fail-loud，不静默回退 auto）',
    (() => {
      try { detectHostDistribution(npmTree, { requested: 'asar' }); return false }
      catch (error) { return DISTRIBUTION_MODES.every((mode) => String(error.message).includes(mode)) }
    })())
  check('distribution: isTypeDeclarationFile 只认 .d.ts 后缀（类型面分型单一常量）',
    isTypeDeclarationFile('pkg/lib/types/a.d.ts') === true
      && isTypeDeclarationFile('pkg/lib/index.js') === false
      && isTypeDeclarationFile('pkg/lib/types/a.d.ts.map') === false
      && isTypeDeclarationFile(undefined) === false
      && TYPE_DECLARATION_SUFFIX === '.d.ts')
}

// ── 最小 asar 构造器（pickle 头 + JSON 头 + 连续数据区）──────────────────────
const insertNode = (root, segments, entry) => {
  let node = root
  for (const segment of segments.slice(0, -1)) {
    node.files[segment] ??= { files: {} }
    node = node.files[segment]
  }
  node.files[segments.at(-1)] = entry
}

/**
 * @param {string} dir 归档所在目录（文件写 `<dir>/app.asar`）
 * @param {Array<{ name: string, files?: Array<{ path: string, content?: string, unpacked?: boolean, link?: string }>, file?: { content?: string } }>} packages
 *   `files` = 前缀下的顶层**目录**条目（包）；`file` = 前缀下的顶层**文件**条目
 *   （与目录并列的混合形态，如真实 `dsh/desktop-runtime.json`）。
 * @param {{ rawHeader?: string, prefix?: string }} [options] rawHeader 用于构造坏 JSON / 缺 files 根的归档；
 *   prefix 缺省 PREFIX（其余用例的归档形态不变）
 * @returns {string} 归档绝对路径
 */
const buildAsar = (dir, packages, options = {}) => {
  mkdirSync(dir, { recursive: true })
  const archivePath = join(dir, 'app.asar')
  const filesRoot = { files: {} }
  const packedChunks = []
  const unpackedWrites = []
  let dataLength = 0
  const prefixSegments = (options.prefix ?? PREFIX).split('/')
  for (const packageSpec of packages) {
    if (packageSpec.file !== undefined) {
      // 顶层文件条目：直接插在 prefix 子树下（值 `{ size, offset }`，无 files 键）。
      const buffer = Buffer.from(packageSpec.file.content ?? '')
      insertNode(filesRoot, [...prefixSegments, packageSpec.name], { size: buffer.length, offset: dataLength })
      packedChunks.push(buffer)
      dataLength += buffer.length
      continue
    }
    for (const file of packageSpec.files ?? []) {
      const internal = [...prefixSegments, packageSpec.name, ...file.path.split('/')]
      if (file.link !== undefined) {
        insertNode(filesRoot, internal, { link: file.link })
        continue
      }
      const buffer = Buffer.from(file.content ?? '')
      if (file.unpacked === true) {
        insertNode(filesRoot, internal, { size: buffer.length, unpacked: true })
        unpackedWrites.push({ internal, buffer })
      } else {
        insertNode(filesRoot, internal, { size: buffer.length, offset: dataLength })
        packedChunks.push(buffer)
        dataLength += buffer.length
      }
    }
  }
  const headerJson = options.rawHeader ?? JSON.stringify(filesRoot)
  const jsonBuffer = Buffer.from(headerJson)
  const payloadSize = jsonBuffer.length + 8
  const header = Buffer.alloc(16)
  header.writeUInt32LE(4, 0)
  header.writeUInt32LE(payloadSize, 4)
  header.writeUInt32LE(payloadSize - 4, 8)
  header.writeUInt32LE(jsonBuffer.length, 12)
  writeFileSync(archivePath, Buffer.concat([header, jsonBuffer, ...packedChunks]))
  for (const { internal, buffer } of unpackedWrites) {
    const target = join(`${archivePath}.unpacked`, ...internal)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, buffer)
  }
  return archivePath
}

const fixturePackages = () => [
  {
    name: 'pkg-a',
    files: [
      { path: 'package.json', content: '{"name":"pkg-a","version":"1.0.0"}' },
      { path: 'lib/index.js', content: 'export const a = 1\n' },
      { path: 'lib/big.bin', content: 'UNPACKED-PAYLOAD-0123456789', unpacked: true },
      { path: 'lib/link-target', link: '../shared/target.js' },
    ],
  },
  { name: 'pkg-b', files: [{ path: 'package.json', content: '{"name":"pkg-b"}' }] },
]

const runExtractor = (args) => {
  const result = spawnSync(process.execPath, [EXTRACTOR, ...args], { encoding: 'utf8', timeout: 120_000 })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}
const parseReport = (run) => {
  try { return JSON.parse(run.stdout) } catch { return null }
}

console.log('ARCH-007 host-asar-extract（packed/unpacked × 头部健全性 × 路径安全 × CLI 契约）:')
{
  const sandbox = mkdtemp('asar')
  const fixture = fixturePackages()
  const archive = buildAsar(join(sandbox, 'rel'), fixture)
  const expectedPackedBytes = fixture
    .flatMap((packageSpec) => packageSpec.files ?? [])
    .filter((file) => file.link === undefined)
    .reduce((sum, file) => sum + Buffer.byteLength(file.content ?? ''), 0)

  // ① 默认不写盘（只统计）：out=null、mode=list、报告计数正确。
  const listRun = runExtractor(['--archive', archive])
  const listReport = parseReport(listRun)
  check('extract: 不给 --out → 只统计不写盘（report.out=null / mode=list / 归档旁无产物目录）',
    listRun.status === 0 && listReport?.out === null && listReport.mode === 'list'
      && !existsSync(join(sandbox, 'rel', 'out')),
    { status: listRun.status, report: listReport })
  check('extract: 统计口径含 unpackedFiles（756 级 unpacked 条目不得被静默跳过）',
    listReport?.files === 4 && listReport.unpackedFiles === 1 && listReport.bytes === expectedPackedBytes
      && listReport.packages.length === 2 && listReport.links.count === 1,
    { files: listReport?.files, unpacked: listReport?.unpackedFiles, bytes: listReport?.bytes, expected: expectedPackedBytes, links: listReport?.links })

  // ② --list 逐包明细（人读面）；不写盘。
  const verboseRun = runExtractor(['--archive', archive, '--list'])
  check('extract: --list 打印逐包 files/unpacked/bytes（可诊断），仍不写盘',
    verboseRun.status === 0 && /pkg-a {2}files=3 unpacked=1/.test(verboseRun.stderr)
      && /pkg-b {2}files=1 unpacked=0/.test(verboseRun.stderr)
      && verboseRun.stderr.includes('只统计不写盘'))

  // ③ --out 抽取：packed 按 offset/size 复制、unpacked 从归档外读回、link 只登记不伪造。
  const outDir = join(sandbox, 'scope')
  const extractRun = runExtractor(['--archive', archive, '--out', outDir])
  const extractReport = parseReport(extractRun)
  const pkgA = join(outDir, 'pkg-a')
  check('extract: --out 产物 = 可直接作为 --host-source 的 scope 目录（<out>/<包>/...）',
    extractRun.status === 0 && extractReport?.mode === 'extract' && extractReport.out === resolve(outDir)
      && readFileSync(join(pkgA, 'package.json'), 'utf8').includes('pkg-a')
      && readFileSync(join(pkgA, 'lib', 'index.js'), 'utf8') === 'export const a = 1\n'
      && readFileSync(join(sandbox, 'scope', 'pkg-b', 'package.json'), 'utf8').includes('pkg-b'),
    { status: extractRun.status, report: extractReport })
  check('extract: unpacked 条目从 <archive>.unpacked/ 读回（大小与头声明一致才通过）',
    readFileSync(join(pkgA, 'lib', 'big.bin'), 'utf8') === 'UNPACKED-PAYLOAD-0123456789'
      && extractReport.unpackedFiles === 1
      && extractReport.packages.find((entry) => entry.package === 'pkg-a')?.unpackedFiles === 1,
    extractReport?.packages)
  check('extract: 符号链接只登记（links.paths 含内部全路径），不伪造实体文件',
    extractReport.links.paths[0] === `${PREFIX}/pkg-a/lib/link-target`
      && !existsSync(join(pkgA, 'lib', 'link-target')))

  // ④ --packages 只抽指定包；未知包 fail-loud。
  const subsetOut = join(sandbox, 'subset')
  const subsetRun = runExtractor(['--archive', archive, '--out', subsetOut, '--packages', 'pkg-a'])
  check('extract: --packages 只抽指定包（其余包不落盘）',
    subsetRun.status === 0 && existsSync(join(subsetOut, 'pkg-a', 'package.json'))
      && !existsSync(join(subsetOut, 'pkg-b')))
  check('extract: --packages 指定不存在的包 → exit 1 + 可用包数点名（不静默抽空树）',
    (() => {
      const run = runExtractor(['--archive', archive, '--packages', 'nope'])
      return run.status === 1 && /nope/.test(run.stderr) && /可用包 2 个/.test(run.stderr)
    })())

  // ⑤ 头部健全性：magic / 长度自相矛盾 / JSON 解析失败 / 缺 files 根 → 全部非 0。
  const corrupt = (name, mutateable) => {
    const path = buildAsar(join(sandbox, `bad-${name}`), fixturePackages())
    mutateable(path)
    return path
  }
  const magicArchive = corrupt('magic', (path) => {
    const buffer = readFileSync(path)
    buffer.writeUInt32LE(5, 0)
    writeFileSync(path, buffer)
  })
  const magicRun = runExtractor(['--archive', magicArchive])
  check('extract P8: magic 非 4 → exit 1 + 明确「不是 asar」诊断（不产出空树）',
    magicRun.status === 1 && /magic 非法/.test(magicRun.stderr))
  const lengthArchive = corrupt('lengths', (path) => {
    const buffer = readFileSync(path)
    buffer.writeUInt32LE(buffer.readUInt32LE(4) - 1, 4)
    writeFileSync(path, buffer)
  })
  const lengthRun = runExtractor(['--archive', lengthArchive])
  check('extract P8: payloadSize ≠ jsonLen+8 → exit 1 + 长度自相矛盾诊断',
    lengthRun.status === 1 && /自相矛盾/.test(lengthRun.stderr))
  const badJsonArchive = buildAsar(join(sandbox, 'bad-json'), fixturePackages(), { rawHeader: '{not json' })
  const badJsonRun = runExtractor(['--archive', badJsonArchive])
  check('extract P8: 头 JSON 不可解析 → exit 1（JSON.parse 异常被包装为结构化诊断）',
    badJsonRun.status === 1 && /JSON 解析失败/.test(badJsonRun.stderr))
  const noFilesArchive = buildAsar(join(sandbox, 'bad-root'), fixturePackages(), { rawHeader: '{"files":null}' })
  const noFilesRun = runExtractor(['--archive', noFilesArchive])
  check('extract P8: 头缺 files 根 → exit 1 + 形态非法诊断',
    noFilesRun.status === 1 && /files 根节点|不是目录节点/.test(noFilesRun.stderr))

  // ⑥ unpacked 声明存在但归档外缺件/大小不符 → 非 0（安装体损坏必须红）。
  const missingUnpacked = buildAsar(join(sandbox, 'unpacked-missing'), fixturePackages())
  rmSync(`${missingUnpacked}.unpacked`, { recursive: true, force: true })
  const missingUnpackedRun = runExtractor(['--archive', missingUnpacked, '--out', join(sandbox, 'unpacked-missing-out')])
  check('extract P8: unpacked 声明但归档外缺文件 → exit 1 + 缺件路径点名（不静默产出残缺树）',
    missingUnpackedRun.status === 1 && /unpacked 条目在归档外缺文件/.test(missingUnpackedRun.stderr))
  const sizeMismatch = buildAsar(join(sandbox, 'unpacked-size'), fixturePackages())
  const backing = join(`${sizeMismatch}.unpacked`, ...PREFIX.split('/'), 'pkg-a', 'lib', 'big.bin')
  writeFileSync(backing, 'WRONG-SIZE')
  const sizeMismatchRun = runExtractor(['--archive', sizeMismatch, '--out', join(sandbox, 'unpacked-size-out')])
  check('extract P8: unpacked 磁盘大小 ≠ 头声明 → exit 1 + 大小不符诊断',
    sizeMismatchRun.status === 1 && /大小与头声明不符/.test(sizeMismatchRun.stderr))

  // ⑦ 路径安全：内部条目名含 `..` → 拒绝，产物不越出 --out。
  const traversalArchive = buildAsar(join(sandbox, 'traversal'), [
    { name: 'pkg-evil', files: [{ path: '..', content: 'escape attempt' }] },
  ])
  const escapeRoot = join(sandbox, 'escape')
  mkdirSync(escapeRoot, { recursive: true })
  const traversalRun = runExtractor(['--archive', traversalArchive, '--out', join(escapeRoot, 'scope')])
  check('extract P8: 内部条目名含 .. → exit 1 + 非法路径段点名（产物只能落在 --out 之下）',
    traversalRun.status === 1 && /非法路径段/.test(traversalRun.stderr)
      && !existsSync(join(escapeRoot, 'scope')) && !existsSync(join(sandbox, 'pkg-evil')))
  check('extract P8: --archive 不存在 / --packages 空值 → exit 1（不启动空跑）',
    (() => {
      const missing = runExtractor(['--archive', join(sandbox, 'nope.asar')])
      const emptyPackages = runExtractor(['--archive', archive, '--packages', ' , '])
      return missing.status === 1 && /不可读/.test(missing.stderr)
        && emptyPackages.status === 1 && /取值为空/.test(emptyPackages.stderr)
    })())

  // ⑧ --prefix 子树内「文件 + 目录」混合形态（真实 app.asar 的 `dsh/`：desktop-runtime.json
  //    等 2 个文件与 node_modules 目录并列）：顶层文件条目不得被误当目录下降，抽取必须
  //    完整落盘（<out>/<条目名>…），零产物退出即红。
  const mixedPrefix = 'dsh'
  const mixedArchive = buildAsar(join(sandbox, 'mixed-prefix'), [
    // 冒号后空格是刻意的：无空格形态会命中 host-abi-health 9h-5 行号锚扫描（P8 可见，
    // 防未来格式化工具改回去）——此处是 JSON 数据字面量，不是行号锚。
    { name: 'desktop-runtime.json', file: { content: '{"runtime":"dsh","abi": 141}' } },
    { name: 'package.json', file: { content: '{"name":"dsh","version":"0.2.2-rc.1"}' } },
    { name: 'node_modules', files: [
      { path: '@deepseek-ai/dsh-core/package.json', content: '{"name":"@deepseek-ai/dsh-core"}' },
      { path: '@deepseek-ai/dsh-core/lib/index.js', content: 'export const core = 1\n' },
    ] },
  ], { prefix: mixedPrefix })
  const mixedOut = join(sandbox, 'mixed-out')
  const mixedRun = runExtractor(['--archive', mixedArchive, '--prefix', mixedPrefix, '--out', mixedOut])
  const mixedReport = parseReport(mixedRun)
  check('extract: --prefix 子树内文件+目录混合形态可抽取（顶层文件不当目录下降；<out>/<条目> 全树落盘、报告计数一致）',
    mixedRun.status === 0 && mixedReport?.mode === 'extract' && mixedReport.files === 4
      && mixedReport.packages.length === 3
      && JSON.parse(readFileSync(join(mixedOut, 'desktop-runtime.json'), 'utf8')).abi === 141
      && readFileSync(join(mixedOut, 'package.json'), 'utf8').includes('0.2.2-rc.1')
      && readFileSync(join(mixedOut, 'node_modules', '@deepseek-ai', 'dsh-core', 'lib', 'index.js'), 'utf8') === 'export const core = 1\n',
    { status: mixedRun.status, report: mixedReport, stderr: mixedRun.stderr.slice(-500) })
}

if (failures > 0) {
  console.error(`\n${failures} FAILURE(S) (${passed} passed)`)
  process.exit(1)
}
console.log(`\nALL HOST DISTRIBUTION TESTS PASSED (${passed} assertions)`)
process.exit(0)
