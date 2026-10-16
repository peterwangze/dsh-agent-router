#!/usr/bin/env node
/**
 * ARCH-005 A1 — 隔离冷装装载门取证程序（reusable，R2/A3/R5 复用同一实现路径——P5）。
 *
 * 目的：把 R1 批验证过的「隔离冷装装载门判据」固化为可复用程序——在 $TEMP 沙箱
 * （DSH_HOME 重定向）内对当前仓库做冷装（`dsh plugin --profile <name> add <repo>`，
 * link: 形态——manifest 实时读自仓库树），再以 headless `--dump-config` 启动同一宿主
 * 运行时，断言宿主 app-boot 装载门对 `dsh-agent-router` 放行（无 skip 警告）。
 *
 * 判据（锚定宿主 dsh-app-boot/lib/index.js 实读，2026-10-17）：
 * - 红（拒载）形态 = stderr 出现 reportSkippedBundles 前缀（:516 形态）
 *   `dsh: skipping profile bundle "dsh-agent-router"` + pluginCompatibilityWarning
 *   模板（:320-322）`is incompatible with dsh` / `Running it may cause crashes or
 *   data loss`（catch 进 skippedBundles 的形态 = :940-945），且 dump-config 组合树
 *   stdout 中 `# == dsh-agent-router` 段消失（bundle 未被组合——R1 沙箱证据
 *   boot1 3 次在场 / boot2-red 0 次的实证形态）；
 * - 绿（放行）形态 = stderr 无上述任一标记，且 stdout 含 `# == dsh-agent-router`
 *   段。注意：本判据只覆盖**装载门放行**；apply 期断点（HD-002/HD-003——服务端
 *   register/settings 声明制）不在断言面，其收口在 A2/A3 批验收门。
 *
 * 用法：
 *   node scripts/cold-install-gate.mjs                      # 绿判据：冷装 + 启动 + 断言放行
 *   node scripts/cold-install-gate.mjs --expect-skip        # 红演示：临时回退一项 peerDep
 *                                                           # → 判红 + 摘录警告 → 恢复 → 复跑绿
 * 可选参数：
 *   --repo <path>          仓库根（默认 = 本脚本所在仓库）
 *   --profile <name>       沙箱 profile 名（默认 sandbox，R1 证据同名）
 *   --revert-pkg <name>    红演示回退的 peerDep（默认 @deepseek-ai/dsh-settings）
 *   --revert-range <range> 红演示回退到的旧范围（默认 ^0.1.5-rc.2）
 *   --dsh <command>        dsh 命令（默认 dsh，走 PATH）
 *
 * 隔离与真实环境防护（破坏性红线配套 R1：隔离环境三选一之 (a)）：
 * - DSH_HOME 重定向至 $TEMP 唯一沙箱目录（每次运行新建）——dsh 的一切 profile /
 *   状态写入只落沙箱；本程序对用户 HOME 配置目录零删除/零清空/零重建/零移动；
 * - 仓库写操作仅存在于 --expect-skip 红演示：package.json 临时回退 → 字节精确
 *   恢复（内存原文 + 沙箱内 repo-pkg-bak.json 双保险）+ 恢复后复读核对；
 * - pnpm 由宿主 plugin-manager 拉起，其用户级 content-addressable store 为追加式
 *   缓存写入（非配置目录写入），如实登记；
 * - 失败/无 dsh/无 profile/超时 → 明确错误信息 + 非零退出（P8 可观测，不静默）。
 *
 * 输出：结构化结论（逐条命令上报表 + JSON 结论行 + 沙箱证据文件路径）；
 * exit 0 = 判定达成（绿，或 --expect-skip 全链红绿演示成功）；exit 1 = 判定失败 /
 * 运行前提缺失。证据文件留在沙箱目录（install-log.txt / bootN-stdout.txt /
 * bootN-stderr.txt / commands.jsonl / result.json）供报告引用。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO = resolve(SCRIPT_DIR, '..')

// ── 参数解析（显式白名单；未知参数即错误——防误用静默生效）──────────────────────
const usage = () => {
  console.error('usage: node scripts/cold-install-gate.mjs [--repo <path>] [--profile <name>] [--expect-skip] [--revert-pkg <pkg>] [--revert-range <range>] [--dsh <command>]')
  process.exit(1)
}
const args = process.argv.slice(2)
const opts = { repo: DEFAULT_REPO, profile: 'sandbox', expectSkip: false, revertPkg: '@deepseek-ai/dsh-settings', revertRange: '^0.1.5-rc.2', dsh: 'dsh' }
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--expect-skip') opts.expectSkip = true
  else if (arg === '--repo' || arg === '--profile' || arg === '--revert-pkg' || arg === '--revert-range' || arg === '--dsh') {
    const value = args[++i]
    if (value === undefined) { console.error(`error: ${arg} requires a value`); usage() }
    const key = { '--repo': 'repo', '--profile': 'profile', '--revert-pkg': 'revertPkg', '--revert-range': 'revertRange', '--dsh': 'dsh' }[arg]
    opts[key] = value
  } else { console.error(`error: unknown argument ${arg}`); usage() }
}

// ── 装载门判据常量（宿主 dsh-app-boot 实读锚定，见文件头）──────────────────────
const BUNDLE_NAME = 'dsh-agent-router'
/** reportSkippedBundles 前缀（dsh-app-boot/lib/index.js:516 形态）。 */
const STDERR_SKIP_MARKER = `dsh: skipping profile bundle "${BUNDLE_NAME}"`
/** pluginCompatibilityWarning 模板两片段（:320-322）。 */
const STDERR_INCOMPATIBLE_MARKER = 'is incompatible with dsh'
const STDERR_RISK_MARKER = 'Running it may cause crashes or data loss'
/** dump-config 组合树中 bundle 段头（绿 = 在场；红 = 消失）。 */
const STDOUT_BUNDLE_SECTION = `# == ${BUNDLE_NAME}`
const INSTALL_TIMEOUT_MS = 300_000
const BOOT_TIMEOUT_MS = 180_000

const tail = (text, lines) => String(text ?? '').trimEnd().split('\n').slice(-lines).join('\n')

// ── P8 前置自检：仓库可读、声明面在位───────────────────────────────────────────
const repoRoot = resolve(opts.repo)
const pkgPath = join(repoRoot, 'package.json')
if (!existsSync(pkgPath)) { console.error(`error: package.json not found at ${pkgPath} (--repo wrong?)`); process.exit(1) }
let pkgText
try { pkgText = readFileSync(pkgPath, 'utf8') } catch (err) { console.error(`error: cannot read ${pkgPath}: ${err.message}`); process.exit(1) }
let pkgJson
try { pkgJson = JSON.parse(pkgText) } catch (err) { console.error(`error: cannot parse ${pkgPath}: ${err.message}`); process.exit(1) }
if (pkgJson.name !== BUNDLE_NAME) { console.error(`error: repo package.json name is ${pkgJson.name}, expected ${BUNDLE_NAME}`); process.exit(1) }
const declaredCurrentRange = pkgJson.peerDependencies?.[opts.revertPkg]
if (typeof declaredCurrentRange !== 'string' || declaredCurrentRange === '') {
  console.error(`error: peerDependencies.${opts.revertPkg} absent in repo package.json — --revert-pkg must name one of the 11 dsh declarations`)
  process.exit(1)
}
if (declaredCurrentRange === opts.revertRange) {
  console.error(`error: peerDependencies.${opts.revertPkg} is already ${opts.revertRange} — red demo needs a reverting step (--revert-range?)`)
  process.exit(1)
}

// ── 沙箱（$TEMP 唯一目录；DSH_HOME 重定向 = 真实环境隔离）──────────────────────
const sandboxHome = join(tmpdir(), `arch005-gate-${process.pid}-${Date.now().toString(36)}`)
mkdirSync(sandboxHome, { recursive: true })
const evidence = []
const commandReport = []
const writeEvidence = (name, content) => {
  const path = join(sandboxHome, name)
  writeFileSync(path, content ?? '')
  evidence.push(path)
}

/** 执行一条宿主命令并登记（R4 配套：命令、退出码、影响路径逐条上报）。 */
const run = (label, file, argv, { timeoutMs, affectedPaths }) => {
  const env = { ...process.env, DSH_HOME: sandboxHome }
  const started = Date.now()
  // shell: true —— Windows 侧 dsh 为 %APPDATA%\npm\dsh.cmd 垫片，需经 shell 解析。
  // 引号保护（quoted）仅作用于**上报表**——quoted 只存 row.command 展示；执行侧
  // spawnSync 以原始数组 + shell:true 运行，Windows 下不自动加引号 ⇒ 要求各参数
  // 路径无空格/shell 元字符（本仓与 $TEMP 沙箱路径均满足；含空格路径未定义行为）。
  const quoted = [file, ...argv].map((part) => /[\s"^&|<>]/.test(part) ? `"${part.replace(/"/g, '""')}"` : part).join(' ')
  const proc = spawnSync(file, argv, { shell: true, encoding: 'utf8', timeout: timeoutMs, env, cwd: repoRoot })
  const row = {
    label,
    command: quoted,
    exitCode: proc.status,
    signal: proc.signal ?? null,
    timedOut: proc.error?.code === 'ETIMEDOUT' || proc.signal === 'SIGTERM',
    durationMs: Date.now() - started,
    envOverride: `DSH_HOME=${sandboxHome}`,
    affectedPaths,
  }
  commandReport.push(row)
  const ok = proc.status === 0 && !row.timedOut && !proc.error
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${label}] ${quoted}`)
  console.log(`     exit=${proc.status}${row.timedOut ? ' (TIMED OUT)' : ''}${proc.signal ? ` signal=${proc.signal}` : ''}${proc.error && !row.timedOut ? ` error=${proc.error.code ?? proc.error.message}` : ''} ${row.durationMs}ms`)
  return proc
}

/** 汇总 + JSON 结论行 + exit（一切终态出口——证据文件总是落盘）。 */
function finish(green, result) {
  writeEvidence('commands.jsonl', commandReport.map((row) => JSON.stringify(row)).join('\n') + '\n')
  writeEvidence('result.json', JSON.stringify({ ...result, sandboxHome, commands: commandReport }, null, 2) + '\n')
  console.log(`\ncommand report (R4 per-command disclosure):`)
  for (const row of commandReport) {
    console.log(`  [${row.label}] exit=${row.exitCode}${row.timedOut ? ' TIMEDOUT' : ''} ${row.durationMs}ms${row.envOverride ? ` env: ${row.envOverride}` : ''}`)
    console.log(`      cmd: ${row.command}`)
    for (const path of row.affectedPaths) console.log(`      path: ${path}`)
  }
  console.log(`\nevidence files (kept for citation):`)
  for (const path of evidence) console.log(`  ${path}`)
  console.log(`\nCOLD-INSTALL-GATE-RESULT ${JSON.stringify({ green, mode: result.mode, sandboxHome })}`)
  process.exit(green ? 0 : 1)
}

/**
 * 启动一次 headless boot（--dump-config 组合后退出）并按装载门判据评级。
 * runnable=false 表示进程未正常完成（exit/信号/超时/拉起失败——P8 上报，不静默）。
 */
const boot = (stepLabel, outFileBase) => {
  const proc = run(stepLabel, opts.dsh, ['--profile', opts.profile, '--dump-config'], { timeoutMs: BOOT_TIMEOUT_MS, affectedPaths: [] })
  const stdout = proc.stdout ?? ''
  const stderr = proc.stderr ?? ''
  writeEvidence(`${outFileBase}-stdout.txt`, stdout)
  writeEvidence(`${outFileBase}-stderr.txt`, stderr)
  const completed = proc.status === 0 && !proc.error && proc.signal === null
  if (!completed) {
    return { runnable: false, green: false, stdoutHasBundle: stdout.includes(STDOUT_BUNDLE_SECTION), stderrMarkers: [], excerpt: tail(stderr || stdout || proc.error?.message, 20), stderrBytes: Buffer.byteLength(stderr) }
  }
  const stderrMarkers = [STDERR_SKIP_MARKER, STDERR_INCOMPATIBLE_MARKER, STDERR_RISK_MARKER].filter((marker) => stderr.includes(marker))
  const stdoutHasBundle = stdout.includes(STDOUT_BUNDLE_SECTION)
  const excerpt = stderr.split('\n').filter((line) => line.includes(BUNDLE_NAME) || line.includes('incompatible')).join('\n')
  return {
    runnable: true,
    green: stderrMarkers.length === 0 && stdoutHasBundle,
    stderrMarkers,
    stdoutHasBundle,
    excerpt,
    stderrBytes: Buffer.byteLength(stderr),
    stderrNote: stderr.trim() && stderrMarkers.length === 0 ? `non-empty stderr without gate markers — tail:\n${tail(stderr, 10)}` : null,
  }
}

console.log(`ARCH-005 A1 cold-install gate — repo: ${repoRoot}`)
console.log(`mode: ${opts.expectSkip ? `--expect-skip (red demo: revert peerDependencies.${opts.revertPkg} ${declaredCurrentRange} -> ${opts.revertRange}, then restore)` : 'green (cold install + boot, assert load-gate passes)'}`)
console.log(`sandbox DSH_HOME: ${sandboxHome}\n`)

// ── 第 0 步：dsh 可用性（P8：无 dsh 即明确报错，不静默跳过）────────────────────
const dshVersion = run('dsh-version', opts.dsh, ['--version'], { timeoutMs: 30_000, affectedPaths: [] })
if (dshVersion.error || dshVersion.status !== 0) {
  console.error(`error: dsh command not usable — install the host runtime first (P8: no silent skip)`)
  finish(false, { mode: opts.expectSkip ? 'expect-skip' : 'green', green: false, abort: 'dsh-unusable' })
}
console.log(`host runtime: ${String(dshVersion.stdout).trim()}\n`)

// ── 第 1 步：冷装（沙箱内全新 profile；link: 形态装当前仓库）───────────────────
const install = run('cold-install', opts.dsh, ['plugin', '--profile', opts.profile, 'add', repoRoot], { timeoutMs: INSTALL_TIMEOUT_MS, affectedPaths: [join(sandboxHome, 'profiles', opts.profile)] })
writeEvidence('install-log.txt', [install.stdout, install.stderr].filter(Boolean).join('\n'))
const installRow = commandReport.at(-1)
if (install.error || install.status !== 0 || installRow.timedOut) {
  console.error(`error: cold install failed (exit ${install.status}) — see ${join(sandboxHome, 'install-log.txt')}; common causes: pnpm missing, registry unreachable, profile init blocked`)
  finish(false, { mode: opts.expectSkip ? 'expect-skip' : 'green', green: false, abort: 'cold-install-failed' })
}
const profileDir = join(sandboxHome, 'profiles', opts.profile)
if (!existsSync(profileDir)) {
  console.error(`error: expected sandbox profile directory ${profileDir} missing after install (P8: fail loud, not skip)`)
  finish(false, { mode: opts.expectSkip ? 'expect-skip' : 'green', green: false, abort: 'profile-dir-missing' })
}

if (!opts.expectSkip) {
  // ── 绿路径：冷装 + 启动 → 断言放行（= R1-③ 判据的程序化复跑，同一实现路径 P5）──
  const result = boot('boot-green', 'boot-green')
  if (!result.runnable) {
    console.error(`\nRED (operational): boot did not complete (exit/signal/timeout) — excerpt:\n${result.excerpt}`)
  } else if (result.green) {
    console.log(`\nGREEN: load gate passed — stderr clean (${result.stderrBytes} bytes), dump-config composes "${STDOUT_BUNDLE_SECTION}" section`)
  } else {
    console.error(`\nRED: load gate rejected the bundle — stderr markers: ${result.stderrMarkers.join(' | ')}; stdout bundle section ${result.stdoutHasBundle ? 'present' : 'ABSENT'} — warning excerpt:\n${result.excerpt || '(none captured)'}`)
  }
  if (result.stderrNote) console.error(`note: ${result.stderrNote}`)
  finish(result.green, {
    mode: 'green',
    green: result.green,
    runnable: result.runnable,
    stderrBytes: result.stderrBytes,
    stderrMarkers: result.stderrMarkers,
    stdoutBundleSection: result.stdoutHasBundle,
  })
}

// ── --expect-skip 红演示：boot1 绿 → 回退单项 → boot2 红 + 摘录 → 恢复 → boot3 绿 ──
const boot1 = boot('boot1-pristine', 'boot1-pristine')
if (!boot1.runnable || !boot1.green) {
  console.error(`error: pristine boot not green before red demo (runnable=${boot1.runnable}, markers=${boot1.stderrMarkers.join('|')}) — declaration face must be loadable first; aborting without touching repo package.json`)
  finish(false, { mode: 'expect-skip', green: false, abort: 'pristine-not-green', pristineGreen: boot1.green })
}
console.log(`boot1 pristine GREEN (stderr ${boot1.stderrBytes} bytes, bundle section present)\n`)

// 回退单项声明（目标串在 package.json 中恰好一次——peerDependenciesMeta 的同名键
// 值为对象形态，不与 `"${pkg}": "${range}"` 串撞；命中数恰 1 为守卫，拒绝盲替换）。
const currentPair = `"${opts.revertPkg}": "${declaredCurrentRange}"`
const revertPair = `"${opts.revertPkg}": "${opts.revertRange}"`
const occurrences = pkgText.split(currentPair).length - 1
if (occurrences !== 1) {
  console.error(`error: expected exactly 1 occurrence of ${currentPair} in package.json, found ${occurrences} — refusing blind replace (P8)`)
  finish(false, { mode: 'expect-skip', green: false, abort: 'ambiguous-revert-target' })
}
writeEvidence('repo-pkg-bak.json', pkgText)
let restoreVerified = false
let revertedRed = false
let boot2 = null
try {
  writeFileSync(pkgPath, pkgText.split(currentPair).join(revertPair))
  commandReport.push({ label: 'revert-declaration', command: `(in-memory write) package.json peerDependencies.${opts.revertPkg}: ${declaredCurrentRange} -> ${opts.revertRange}`, exitCode: 0, signal: null, timedOut: false, durationMs: 0, envOverride: null, affectedPaths: [pkgPath] })
  console.log(`reverted peerDependencies.${opts.revertPkg} to ${opts.revertRange} (backup: ${join(sandboxHome, 'repo-pkg-bak.json')})`)

  boot2 = boot('boot2-reverted', 'boot2-reverted')
  const redSeen = boot2.runnable && boot2.stderrMarkers.includes(STDERR_SKIP_MARKER) && !boot2.stdoutHasBundle
  if (!boot2.runnable) {
    console.error(`error: reverted boot did not complete — excerpt:\n${boot2.excerpt}`)
  } else if (redSeen) {
    console.log(`boot2 reverted RED as expected — markers: ${boot2.stderrMarkers.join(' | ')}; stdout bundle section ABSENT`)
    console.log(`warning excerpt:\n${boot2.excerpt}`)
  } else {
    console.error(`error: red demo FAILED to discriminate — expected "${STDERR_SKIP_MARKER}" on stderr and bundle section absent, got markers=[${boot2.stderrMarkers.join('|')}] stdoutBundle=${boot2.stdoutHasBundle} (gate may be always-green — criterion broken)`)
  }
  revertedRed = redSeen
} catch (err) {
  console.error(`error: red-demo revert step failed: ${err.message}`)
} finally {
  // 恢复：内存原文写回 + 复读字节核对（失败 → 明确报错并指向沙箱备份，绝不静默）。
  const restoreRow = { label: 'restore-declaration', command: '(in-memory write) package.json restore from backup (byte-exact)', exitCode: 0, signal: null, timedOut: false, durationMs: 0, envOverride: null, affectedPaths: [pkgPath] }
  try {
    writeFileSync(pkgPath, pkgText)
    restoreVerified = readFileSync(pkgPath, 'utf8') === pkgText
  } catch (err) {
    restoreRow.exitCode = 1
    console.error(`error: restore write failed: ${err.message}`)
  }
  commandReport.push(restoreRow)
  if (!restoreVerified) {
    console.error(`FATAL: package.json restore NOT verified byte-exact — recover with: cp "${join(sandboxHome, 'repo-pkg-bak.json')}" "${pkgPath}" (or git checkout -- package.json)`)
    finish(false, { mode: 'expect-skip', green: false, abort: 'restore-not-verified', restoreVerified, revert: { pkg: opts.revertPkg, from: declaredCurrentRange, to: opts.revertRange, backup: join(sandboxHome, 'repo-pkg-bak.json') } })
  }
  console.log(`restored package.json byte-exact (verified by re-read)\n`)
}

const boot3 = boot('boot3-restored', 'boot3-restored')
const chainGreen = revertedRed && boot3.runnable && boot3.green && restoreVerified
if (boot3.runnable && boot3.green) {
  console.log(`boot3 restored GREEN (stderr ${boot3.stderrBytes} bytes, bundle section present)`)
} else {
  console.error(`error: post-restore boot not green (runnable=${boot3.runnable}, markers=${boot3.stderrMarkers.join('|')}) — excerpt:\n${boot3.excerpt}`)
}
console.log(chainGreen
  ? '\nGREEN: --expect-skip chain demonstrated discrimination — pristine green -> reverted red (warning captured) -> restored green'
  : `\nRED: --expect-skip chain failed (pristineGreen=${boot1.green ? 1 : 0} revertedRed=${revertedRed ? 1 : 0} restoredGreen=${boot3.green ? 1 : 0} restoreVerified=${restoreVerified ? 1 : 0})`)
finish(chainGreen, {
  mode: 'expect-skip',
  green: chainGreen,
  pristineGreen: boot1.green,
  revertedRed,
  revertedMarkers: boot2?.stderrMarkers ?? [],
  warningExcerpt: boot2?.excerpt ?? '',
  restoredGreen: boot3.green,
  restoreVerified,
  revert: { pkg: opts.revertPkg, from: declaredCurrentRange, to: opts.revertRange, backup: join(sandboxHome, 'repo-pkg-bak.json') },
})
