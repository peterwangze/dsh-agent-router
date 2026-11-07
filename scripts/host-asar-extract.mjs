#!/usr/bin/env node
/**
 * ARCH-007 B4：桌面分发宿主树抽取器（`app.asar` → 真实磁盘树）。
 *
 * 为什么需要它：用户在桌面分发里装的是 **asar 打包宿主**（本机实测
 * `D:\app\dsh\resources\app.asar`，213,202,918 B），而 `--host-source` / 探针 /
 * 静态守卫都只能瞄准**真实文件系统目录**——asar 内部路径（`app.asar/dsh/...`）
 * 不是可遍历路径（`Test-Path` 为 False）。不先把宿主树抽出来，「按分发形态核验
 * 真实发布体」这条路就断在第一步。抽取产物直接是 `@deepseek-ai/` scope 目录，
 * 可原样喂给：
 *   node scripts/host-radar-probe.mjs --host-source <out> --distribution auto --matrix
 *   DSH_HOST_SOURCE=<out> node tests/host-contract.mjs
 *
 * asar 格式（实测有效，Electron pickle 头）：`UInt32LE(4) | UInt32LE(payloadSize)
 * | UInt32LE(...) | UInt32LE(jsonLen) | json(header)`，文件数据起点 =
 * `8 + payloadSize` = `16 + jsonLen`；文件条目绝对偏移 = `dataStart + entry.offset`，
 * 长度 `entry.size`；目录节点 = `{ files: {...} }`；符号链接节点 = `{ link }`。
 *
 * **unpacked 条目**（本机 scope 实测 756 个，分布于 `dsh-session-log-export` 12、
 * `libreoffice-kit` 9、`libreoffice-kit-win32-x64` 735）：asar 常把大文件放外部
 * `app.asar.unpacked/` 下，同构相对路径 = `<archive>.unpacked/<内部路径>`。跳过它们
 * 会让宿主树缺件（探针的包/文件存在性判定随之失真），故本工具从 unpacked 目录读回，
 * 并在报告里单列 `unpackedFiles`。unpacked 声明存在但磁盘缺文件 / 大小与头声明不符
 * → 明确失败退出（P8：不得静默产出残缺树）。
 *
 * 头部健全性：magic ≠ 4、payload/json 长度越界、`payloadSize ≠ jsonLen + 8`、
 * JSON 解析失败、缺 `files` 根、条目 offset/size 越界、内部路径含 `..`/绝对段
 * → 全部明确报错并非 0 退出（本工具不是探针：探针对差异恒 exit 0，抽取失败必须红）。
 *
 * 用法：
 *   node scripts/host-asar-extract.mjs --archive <app.asar> [--prefix <内部前缀>] [--out <scope 目录>]
 *        [--packages a,b,c] [--list]
 *  - `--prefix` 缺省 `dsh/node_modules/@deepseek-ai`（DSH 桌面分发实测形态）；前缀的
 *    直接子项可为**文件或目录**（如 `--prefix dsh`：`desktop-runtime.json`/`package.json`
 *    与 `node_modules` 并列），两者同权抽取——不假设子项必为目录；
 *  - `--out` 是**产物 scope 目录**（= 直接可用的 `--host-source`），产物只落在其下；
 *    不给 `--out`（或给 `--list` 且不给 `--out`）→ 只打印统计与包清单，不写盘；
 *  - `--packages` 只抽指定包（探针核验常用 8 关键包，避免抽 191 MB 的
 *    libreoffice-kit）；给出的包不存在 → 非 0 退出；
 *  - stdout = JSON 报告（`packages/files/unpackedFiles/bytes/links`），stderr = 人读摘要。
 *
 * 本机实测示例：
 *   node scripts/host-asar-extract.mjs --archive "D:\app\dsh\resources\app.asar" ^
 *     --out .inspect-host/host-asar-0.2.2 --packages dsh-api-remotes,dsh-llm,dsh-api-session-controller,dsh-client-ui-model-selection,dsh-client-ui-conversation,dsh-client-locale
 *   node scripts/host-radar-probe.mjs --host-source .inspect-host/host-asar-0.2.2 --distribution auto --matrix
 */
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

const USAGE = `usage: node scripts/host-asar-extract.mjs --archive <app.asar> [--prefix dsh/node_modules/@deepseek-ai] [--out <scope 目录>] [--packages a,b,c] [--list]

  --archive   必填：asar 归档路径（如 D:\\app\\dsh\\resources\\app.asar）
  --prefix    asar 内部前缀（缺省 dsh/node_modules/@deepseek-ai）
  --out       产物 scope 目录（= 可直接作为 --host-source 的 @deepseek-ai 目录）；不给则只统计不写盘
  --packages  只抽前缀下这些顶层条目（包目录或文件）；缺省抽前缀下全部条目
  --list      打印包清单与逐包统计（不写盘）
  --help      本帮助`

/** asar 头首字段（Electron 固定写 4：pickle 头尺寸）。 */
const ASAR_PICKLE_SIZE = 4
/** 缺省内部前缀（DSH 桌面分发 0.2.2-rc.1 实测形态）。 */
const DEFAULT_PREFIX = 'dsh/node_modules/@deepseek-ai'
/** 复制归档区段的分块大小（单文件最大 178 MB，避免整块 alloc）。 */
const COPY_CHUNK = 1 << 20

const die = (message) => {
  console.error(`host-asar-extract: FAIL  ${message}`)
  process.exit(1)
}

const parseArgs = (argv) => {
  const opts = { archive: undefined, prefix: DEFAULT_PREFIX, out: undefined, packages: [], list: false }
  const valueFlags = new Map([
    ['--archive', 'archive'],
    ['--prefix', 'prefix'],
    ['--out', 'out'],
    ['--packages', 'packages'],
  ])
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      console.log(USAGE)
      process.exit(0)
    }
    if (arg === '--list') {
      opts.list = true
      continue
    }
    const field = valueFlags.get(arg)
    if (field === undefined) die(`未知参数 ${arg}\n${USAGE}`)
    const value = argv[++index]
    if (value === undefined || value.startsWith('--')) die(`${arg} 需要取值\n${USAGE}`)
    if (field === 'packages') {
      opts.packages = value.split(',').map((name) => name.trim()).filter((name) => name !== '')
      if (opts.packages.length === 0) die('--packages 取值为空（逗号分隔的包名列表）')
    } else {
      opts[field] = value
    }
  }
  if (opts.archive === undefined) die(`必须给 --archive <app.asar>\n${USAGE}`)
  return opts
}

/** 内部路径段合法性（Windows 分隔符 / `.` / `..` / 空段 / NUL 一律拒绝——路径安全）。 */
const assertSafeSegment = (segment, context) => {
  if (typeof segment !== 'string' || segment === '' || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\') || segment.includes('\0')) {
    die(`${context} 含非法路径段 ${JSON.stringify(segment)}（禁 .. / 绝对路径——产物只能落在 --out 之下）`)
  }
}

const opts = parseArgs(process.argv.slice(2))
const archivePath = resolve(opts.archive)

let archiveStat
try {
  archiveStat = statSync(archivePath)
} catch (error) {
  die(`asar 不可读（${archivePath}）：${error.message}`)
}
if (!archiveStat.isFile()) die(`--archive 不是文件（${archivePath}）`)
if (opts.out !== undefined) {
  const outDir = resolve(opts.out)
  if (outDir === archivePath) die('--out 不能等于 --archive')
}

const fd = openSync(archivePath, 'r')
const readHeader = () => {
  const head = Buffer.alloc(16)
  const headRead = readSync(fd, head, 0, 16, 0)
  if (headRead !== 16) die(`asar 头部不足 16 字节（实际 ${headRead} B）：${archivePath} 不是 asar 或已截断`)
  const pickleSize = head.readUInt32LE(0)
  const payloadSize = head.readUInt32LE(4)
  const jsonLen = head.readUInt32LE(12)
  if (pickleSize !== ASAR_PICKLE_SIZE) die(`asar magic 非法（首字段 = ${pickleSize}，期望 ${ASAR_PICKLE_SIZE}）：${archivePath} 不是 Electron asar 或已损坏`)
  if (jsonLen < 2 || jsonLen > archiveStat.size - 16) die(`asar 头 JSON 长度越界（jsonLen=${jsonLen}，归档 ${archiveStat.size} B）`)
  if (payloadSize !== jsonLen + 8) die(`asar 头长度自相矛盾（payloadSize=${payloadSize} ≠ jsonLen+8=${jsonLen + 8}）`)
  const dataStart = 8 + payloadSize
  if (dataStart !== 16 + jsonLen) die(`asar 数据起点自相矛盾（8+payloadSize=${dataStart} ≠ 16+jsonLen=${16 + jsonLen}）`)
  if (dataStart > archiveStat.size) die(`asar 数据起点越界（${dataStart} > ${archiveStat.size}）`)
  const headerBuffer = Buffer.alloc(jsonLen)
  const jsonRead = readSync(fd, headerBuffer, 0, jsonLen, 16)
  if (jsonRead !== jsonLen) die(`asar 头 JSON 读取不完整（${jsonRead}/${jsonLen} B）`)
  let header
  try {
    header = JSON.parse(headerBuffer.toString('utf8'))
  } catch (error) {
    die(`asar 头 JSON 解析失败：${error.message}`)
  }
  if (header === null || typeof header !== 'object' || header.files === null || typeof header.files !== 'object') {
    die('asar 头缺少 files 根节点（形态非法）')
  }
  return { header, dataStart }
}

const { header, dataStart } = readHeader()
const prefixSegments = opts.prefix.replace(/^\/+|\/+$/g, '').split('/').filter((segment) => segment !== '')
if (prefixSegments.length === 0) die('--prefix 不能为空')
for (const segment of prefixSegments) assertSafeSegment(segment, `--prefix（${opts.prefix}）`)

/** 按内部段序取节点；缺失 → null（不抛——调用方给可诊断信息）。 */
const lookupNode = (segments) => {
  let node = header
  for (const segment of segments) {
    node = node?.files?.[segment]
    if (node === undefined || node === null) return null
    if (typeof node === 'object' && node.files === undefined && node.link !== undefined) return null
  }
  return node
}

const prefixNode = lookupNode(prefixSegments)
if (prefixNode === null) {
  die(`asar 内不存在前缀 ${opts.prefix}（${archivePath}）；归档根条目：${Object.keys(header.files).join(', ')}`)
}
if (prefixNode.files === undefined || typeof prefixNode.files !== 'object') die(`前缀 ${opts.prefix} 不是目录节点（asar 形态非法）`)

const availablePackages = Object.keys(prefixNode.files)
const packageNames = opts.packages.length > 0 ? opts.packages : availablePackages
for (const name of opts.packages) {
  assertSafeSegment(name, '--packages')
  if (!Object.hasOwn(prefixNode.files, name)) {
    die(`--packages 指定的 ${name} 不在前缀 ${opts.prefix} 内（可用包 ${availablePackages.length} 个，例如 ${availablePackages.slice(0, 8).join(', ')}${availablePackages.length > 8 ? ', …' : ''}）`)
  }
}

const unpackedRoot = `${archivePath}.unpacked`
const outDir = opts.out === undefined ? null : resolve(opts.out)

/** 归档区段 → 文件（分块读，避免大文件整块驻留内存）。 */
const copyArchiveRange = (offset, size, targetPath) => {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(size) || size < 0) die(`条目 offset/size 非整数（offset=${offset}, size=${size}）`)
  if (dataStart + offset + size > archiveStat.size) die(`条目越界（dataStart+offset+size=${dataStart + offset + size} > 归档 ${archiveStat.size}）→ asar 头损坏`)
  mkdirSync(dirname(targetPath), { recursive: true })
  const outFd = openSync(targetPath, 'w')
  try {
    let position = dataStart + offset
    let remaining = size
    while (remaining > 0) {
      const chunkSize = Math.min(COPY_CHUNK, remaining)
      const buffer = Buffer.allocUnsafe(chunkSize)
      const read = readSync(fd, buffer, 0, chunkSize, position)
      if (read !== chunkSize) die(`归档读取不完整（${targetPath}: ${read}/${chunkSize} B @ ${position}）`)
      writeSync(outFd, buffer, 0, read)
      position += read
      remaining -= read
    }
  } finally {
    closeSync(outFd)
  }
}

/** unpacked 条目 → 从 `<archive>.unpacked/<内部全路径>` 读回（缺文件 / 大小不符 = 安装体损坏，红）。 */
const copyUnpacked = (internalSegments, declaredSize, targetPath) => {
  const sourcePath = join(unpackedRoot, ...internalSegments)
  if (!existsSync(sourcePath)) {
    die(`unpacked 条目在归档外缺文件：${sourcePath}（asar 头声明 unpacked，但 unpacked 目录无此文件 → 安装体不完整）`)
  }
  const sourceStat = statSync(sourcePath)
  if (sourceStat.size !== declaredSize) {
    die(`unpacked 条目大小与头声明不符：${sourcePath}（磁盘 ${sourceStat.size} B ≠ 头 ${declaredSize} B）→ 安装体损坏`)
  }
  mkdirSync(dirname(targetPath), { recursive: true })
  copyFileSync(sourcePath, targetPath)
}

const packageStats = []
const linkPaths = []
let totalFiles = 0
let totalUnpacked = 0
let totalBytes = 0

/**
 * 记录一个**文件**条目：link 只登记（不伪造实体），packed 按 offset/size 复制，
 * unpacked 从 `<archive>.unpacked/` 读回。prefix 的直接子项与目录内条目共用本路径。
 */
const recordFile = (packageName, node, childSegments, internalSegments, stats) => {
  if (node.link !== undefined) {
    // 符号链接条目（Electron asar `{ link }`）：不伪造实体文件，只登记（可观测）。
    linkPaths.push(internalSegments.join('/'))
    return
  }
  const size = Number(node.size)
  if (!Number.isInteger(size) || size < 0) die(`文件条目 size 非法：${internalSegments.join('/')}（size=${JSON.stringify(node.size)}）`)
  stats.files += 1
  stats.bytes += size
  if (node.unpacked === true) {
    stats.unpackedFiles += 1
    if (outDir !== null) {
      const targetPath = resolve(outDir, packageName, ...childSegments)
      if (targetPath !== join(outDir, packageName, ...childSegments)) die(`产物路径越界：${internalSegments.join('/')}`)
      if (!targetPath.startsWith(resolve(outDir) + sep)) die(`产物路径越界（不在 --out 之下）：${targetPath}`)
      copyUnpacked(internalSegments, size, targetPath)
    }
    return
  }
  const offset = Number(node.offset)
  if (!Number.isInteger(offset) || offset < 0) die(`文件条目 offset 非法：${internalSegments.join('/')}（offset=${JSON.stringify(node.offset)}）`)
  if (dataStart + offset + size > archiveStat.size) die(`条目越界（dataStart+offset+size=${dataStart + offset + size} > 归档 ${archiveStat.size}）→ asar 头损坏：${internalSegments.join('/')}`)
  if (outDir !== null) {
    const targetPath = resolve(outDir, packageName, ...childSegments)
    if (targetPath !== join(outDir, packageName, ...childSegments)) die(`产物路径越界：${internalSegments.join('/')}`)
    if (!targetPath.startsWith(resolve(outDir) + sep)) die(`产物路径越界（不在 --out 之下）：${targetPath}`)
    copyArchiveRange(offset, size, targetPath)
  }
}

/**
 * prefix 的每个直接子项是一个**顶层条目**：既可能是目录（`@deepseek-ai/<pkg>` 一类的包，
 * 也可能是 `--prefix dsh` 下的 `node_modules`），也可能是文件（`dsh/desktop-runtime.json`、
 * `dsh/package.json`）。文件与目录同权抽取——不得把文件条目当目录下降（否则 `--prefix dsh`
 * 直接 FAIL 且零产物）。
 */
const walkEntry = (packageName, packageNode, packageSegments) => {
  const stats = { package: packageName, files: 0, unpackedFiles: 0, bytes: 0 }
  const walk = (node, relativeSegments) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      assertSafeSegment(name, `${packageName}/${relativeSegments.join('/')}`)
      const childSegments = [...relativeSegments, name]
      const childInternal = [...packageSegments, ...childSegments]
      if (child.files !== undefined) {
        if (typeof child.files !== 'object' || child.files === null) die(`目录节点形态非法：${childInternal.join('/')}`)
        walk(child, childSegments)
        continue
      }
      recordFile(packageName, child, childSegments, childInternal, stats)
    }
  }
  if (packageNode.files !== undefined) {
    if (typeof packageNode.files !== 'object' || packageNode.files === null) die(`目录节点形态非法：${packageSegments.join('/')}`)
    walk(packageNode, [])
  } else {
    recordFile(packageName, packageNode, [], packageSegments, stats)
  }
  packageStats.push(stats)
  totalFiles += stats.files
  totalUnpacked += stats.unpackedFiles
  totalBytes += stats.bytes
}

for (const packageName of packageNames) {
  const packageNode = prefixNode.files[packageName]
  walkEntry(packageName, packageNode, [...prefixSegments, packageName])
}
closeSync(fd)

const report = {
  archive: archivePath,
  prefix: opts.prefix,
  out: outDir,
  mode: outDir === null ? 'list' : 'extract',
  packages: packageStats,
  files: totalFiles,
  unpackedFiles: totalUnpacked,
  bytes: totalBytes,
  links: { count: linkPaths.length, paths: linkPaths },
}
console.error(`host-asar-extract: archive=${archivePath} prefix=${opts.prefix}`)
console.error(`host-asar-extract: packages=${packageStats.length} files=${totalFiles} unpackedFiles=${totalUnpacked} bytes=${totalBytes} (${(totalBytes / 1048576).toFixed(1)} MB) links=${linkPaths.length}`)
if (outDir !== null) console.error(`host-asar-extract: out=${outDir}（已写入 ${totalFiles} 个文件；可直接作为 --host-source / DSH_HOST_SOURCE）`)
else console.error('host-asar-extract: 未给 --out → 只统计不写盘（--list 同义）')
if (opts.list || outDir === null) {
  for (const stats of packageStats) {
    console.error(`  ${stats.package}  files=${stats.files} unpacked=${stats.unpackedFiles} bytes=${stats.bytes}`)
  }
}
if (linkPaths.length > 0) console.error(`host-asar-extract: 符号链接条目 ${linkPaths.length} 个（未实体化，已登记在报告 links.paths）：${linkPaths.slice(0, 5).join(', ')}${linkPaths.length > 5 ? ', …' : ''}`)
console.log(JSON.stringify(report, null, 2))
process.exit(0)
