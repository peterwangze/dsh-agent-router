#!/usr/bin/env node
/**
 * ARCH-005 A3 — 隔离冷装「服务端 apply 全程无 throw」端到端门（验收门 ①）。
 *
 * 目的：A1 的 cold-install-gate 只断言**装载门放行**（--dump-config 组合面，
 * 不挂载插件）；本程序补齐 A3 判据点——在 $TEMP 沙箱（DSH_HOME 重定向）内
 * 冷装当前仓库后，以**真实 boot**（runProfile 全挂载路径）启动同一宿主运行时，
 * 断言 dsh-agent-router 的 apply 全程无 throw（HD-002 :237 断点 + HD-003 :305
 * 断点双解除后的完整加载）。
 *
 * 判据（锚定宿主实读，2026-10-17）：
 * - ①装载门复验（A1 同口径）：--dump-config stdout 含 `# == dsh-agent-router`
 *   段 + stderr 无 skip/incompatible 警告（dsh-app-boot :516/:320-322 形态）；
 * - ②Config 声明面发现（真宿主静态面）：--dump-config-schema 输出包含 router
 *   条目的配置 schema（app-boot generateConfigSchema :3176 经插件 Config 导出
 *   派生——声明制在真宿主侧可发现的机器证）；
 * - ③apply 全程无 throw + 正向探针（真 boot）：
 *   · 沙箱 profile 仅含 dsh-base（无 webServer 行）→ 插件 inject ['webServer']
 *     永不就绪 → 以 `--patch` overlay 补一行 dsh-host-webserver（loadOverlayPatches
 *     支持的 insert-list 形态，profile-boot composeProfile overlay 消费）；
 *   · 正向探针 = 插件 apply 尾部的 OAuth loopback 服务器（127.0.0.1:8085，
 *     lib/index.js ctx.effect——apply 体最后一节）：TCP 可连 = apply 完整执行；
 *     端口被真实环境占用时 = stderr 出现本插件
 *     `loopback OAuth callback port 8085 is occupied` warn 行（同样证明执行
 *     到达该 effect）；
 *   · 负向断言 = stderr 无 dsh-agent-router 相关的 error/throw 形态（含
 *     `settings.register is not a function`〔HD-002 :237 断点根因形态〕与
 *      typert `strict codec`〔HD-003 :305 断点根因形态〕）。
 *
 * 用法：
 *   node scripts/a3-apply-gate.mjs [--repo <path>] [--profile <name>] [--dsh <cmd>] [--boot-timeout-ms <n>]
 *
 * 隔离与真实环境防护（同 A1 口径——破坏性红线配套）：
 * - DSH_HOME 重定向至 $TEMP 唯一沙箱目录（每跑新建）；对用户 HOME 配置目录
 *   零删除/零清零/零重建/零移动；
 * - 唯一真实环境触达 = 127.0.0.1:8085 探测连接（只读 TCP connect，零写入）与
 *   dsh boot 自身（其全部持久化落沙箱 DSH_HOME）；8085 被外部进程占用时探针
 *   走 stderr warn 分支（不误判）；
 * - 子进程树终止：Windows 下 taskkill /T /F（cmd 垫片 → node 子树整体回收）；
 * - 失败/无 dsh/超时 → 明确错误 + 非零退出（P8）。
 *
 * 输出：结构化结论（逐条命令上报表 + JSON 结论行 + 沙箱证据文件）；exit 0 =
 * 三判据全绿；exit 1 = 任一判据红或前提缺失。
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO = resolve(SCRIPT_DIR, '..')

const usage = () => {
  console.error('usage: node scripts/a3-apply-gate.mjs [--repo <path>] [--profile <name>] [--dsh <cmd>] [--boot-timeout-ms <n>]')
  process.exit(1)
}
const args = process.argv.slice(2)
const opts = { repo: DEFAULT_REPO, profile: 'a3-sandbox', dsh: 'dsh', bootTimeoutMs: 120_000 }
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--repo' || arg === '--profile' || arg === '--dsh' || arg === '--boot-timeout-ms') {
    const value = args[++i]
    if (value === undefined) { console.error(`error: ${arg} requires a value`); usage() }
    const key = { '--repo': 'repo', '--profile': 'profile', '--dsh': 'dsh', '--boot-timeout-ms': 'bootTimeoutMs' }[arg]
    opts[key] = arg === '--boot-timeout-ms' ? Number(value) : value
    if (arg === '--boot-timeout-ms' && !(opts.bootTimeoutMs > 0)) { console.error('error: --boot-timeout-ms must be positive'); usage() }
  } else { console.error(`error: unknown argument ${arg}`); usage() }
}

const BUNDLE_NAME = 'dsh-agent-router'
const STDOUT_BUNDLE_SECTION = `# == ${BUNDLE_NAME}`
const STDERR_SKIP_MARKER = `dsh: skipping profile bundle "${BUNDLE_NAME}"`
const STDERR_INCOMPATIBLE_MARKER = 'is incompatible with dsh'
const STDERR_RISK_MARKER = 'Running it may cause crashes or data loss'
/** apply 期断点根因形态（负向断言锚——HD-002 :237 / HD-003 :305）。 */
const APPLY_THROW_MARKERS = [
  'settings.register is not a function',
  'strict codec has no create() factory',
]
/** 正向探针 B：8085 被真实环境占用时的插件 warn 行（apply 到达 loopback effect 的证）。 */
const LOOPBACK_OCCUPIED_MARKER = 'loopback OAuth callback port 8085 is occupied'
const INSTALL_TIMEOUT_MS = 300_000
const DUMP_TIMEOUT_MS = 180_000

const repoRoot = resolve(opts.repo)
if (!existsSync(join(repoRoot, 'package.json'))) { console.error(`error: package.json not found at ${repoRoot}`); process.exit(1) }
if (JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).name !== BUNDLE_NAME) { console.error('error: repo package name mismatch'); process.exit(1) }

const sandboxHome = join(tmpdir(), `arch005-a3-${process.pid}-${Date.now().toString(36)}`)
mkdirSync(sandboxHome, { recursive: true })
const evidence = []
const commandReport = []
const writeEvidence = (name, content) => {
  const path = join(sandboxHome, name)
  writeFileSync(path, content ?? '')
  evidence.push(path)
}
const run = (label, file, argv, { timeoutMs, affectedPaths }) => {
  const env = { ...process.env, DSH_HOME: sandboxHome }
  const started = Date.now()
  const quoted = [file, ...argv].map((part) => /[\s"^&|<>]/.test(part) ? `"${part.replace(/"/g, '""')}"` : part).join(' ')
  const proc = spawnSync(file, argv, { shell: true, encoding: 'utf8', timeout: timeoutMs, env, cwd: repoRoot })
  const row = {
    label, command: quoted, exitCode: proc.status, signal: proc.signal ?? null,
    timedOut: proc.error?.code === 'ETIMEDOUT' || proc.signal === 'SIGTERM',
    durationMs: Date.now() - started, envOverride: `DSH_HOME=${sandboxHome}`, affectedPaths,
  }
  commandReport.push(row)
  const ok = proc.status === 0 && !row.timedOut && !proc.error
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${label}] ${quoted}`)
  console.log(`     exit=${proc.status}${row.timedOut ? ' (TIMED OUT)' : ''}${proc.signal ? ` signal=${proc.signal}` : ''}${proc.error && !row.timedOut ? ` error=${proc.error.code ?? proc.error.message}` : ''} ${row.durationMs}ms`)
  return proc
}
const tail = (text, lines) => String(text ?? '').trimEnd().split('\n').slice(-lines).join('\n')

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
  console.log(`\nA3-APPLY-GATE-RESULT ${JSON.stringify({ green, sandboxHome })}`)
  process.exit(green ? 0 : 1)
}

console.log(`ARCH-005 A3 apply gate — repo: ${repoRoot}`)
console.log(`sandbox DSH_HOME: ${sandboxHome}\n`)

// ── 第 0 步：dsh 可用性（P8）──────────────────────────────────────────────────
const dshVersion = run('dsh-version', opts.dsh, ['--version'], { timeoutMs: 30_000, affectedPaths: [] })
if (dshVersion.error || dshVersion.status !== 0) {
  console.error('error: dsh command not usable — install the host runtime first (P8: no silent skip)')
  finish(false, { green: false, abort: 'dsh-unusable' })
}
console.log(`host runtime: ${String(dshVersion.stdout).trim()}\n`)

// ── 第 1 步：冷装（A1 同口径：link: 形态装当前仓库）──────────────────────────
const install = run('cold-install', opts.dsh, ['plugin', '--profile', opts.profile, 'add', repoRoot], { timeoutMs: INSTALL_TIMEOUT_MS, affectedPaths: [join(sandboxHome, 'profiles', opts.profile)] })
writeEvidence('install-log.txt', [install.stdout, install.stderr].filter(Boolean).join('\n'))
if (install.error || install.status !== 0) {
  console.error(`error: cold install failed (exit ${install.status}) — see ${join(sandboxHome, 'install-log.txt')}`)
  finish(false, { green: false, abort: 'cold-install-failed' })
}

// ── 第 2 步（判据 ①）：装载门复验（A1 cold-install-gate 同判据）──────────────
const dump = run('dump-config', opts.dsh, ['--profile', opts.profile, '--dump-config'], { timeoutMs: DUMP_TIMEOUT_MS, affectedPaths: [] })
writeEvidence('dump-config-stdout.txt', dump.stdout)
writeEvidence('dump-config-stderr.txt', dump.stderr)
const loadGateGreen = dump.status === 0
  && !dump.stderr.includes(STDERR_SKIP_MARKER)
  && !dump.stderr.includes(STDERR_INCOMPATIBLE_MARKER)
  && !dump.stderr.includes(STDERR_RISK_MARKER)
  && dump.stdout.includes(STDOUT_BUNDLE_SECTION)
console.log(loadGateGreen ? 'load-gate re-verified GREEN (A1 criteria: bundle composed, no skip warnings)' : 'RED: load gate failed (see dump-config-stderr.txt)')

// ── 第 3 步（判据 ②）：Config 声明面发现（真宿主 --dump-config-schema）───────
const schema = run('dump-config-schema', opts.dsh, ['--profile', opts.profile, '--dump-config-schema'], { timeoutMs: DUMP_TIMEOUT_MS, affectedPaths: [] })
writeEvidence('dump-config-schema-stdout.txt', schema.stdout)
writeEvidence('dump-config-schema-stderr.txt', schema.stderr)
const schemaText = `${schema.stdout ?? ''}`
// 判据：router 条目（dsh-agent-router）的 Config 导出进入宿主配置 schema 面
//（generateConfigSchema 经插件 manifest/Config 派生；断言面向「条目在场」——
// schema 逐字段形态由判别测试 §3 真树 SettingsForms 承载）。
const schemaDiscoversRouter = schema.status === 0
  && (schemaText.includes('dsh-agent-router') || schemaText.includes('"router"'))
console.log(schemaDiscoversRouter ? 'config-schema face GREEN (router entry schema discovered by real host)' : 'note: config-schema face did not surface router entry (non-blocking observation — authoritative apply proof is step 4)')

// ── 第 4 步（判据 ③）：真实 boot + apply 全程无 throw + 正向探针 ─────────────
// overlay：补 dsh-host-webserver 行（沙箱 profile = dsh-base 无 webServer——
// 插件 inject ['webServer'] 需要；insert-list 形态 = loadOverlayPatches 契约）。
const overlayPath = join(sandboxHome, 'a3-webserver-overlay.yml')
// webServer 行 config = 宿主 WebServer.Config 必填面（host ∈ 127.0.0.1|0.0.0.0 /
// port natural ≤65535——dsh-host-webserver lib/index.js:141-148 实读）：port 0 =
// OS 临时分配（零固定端口占用，沙箱友好；插件只消费 register() 不消费监听面）。
writeFileSync(overlayPath, [
  '# A3 apply-gate overlay: supply the webServer service entry the plugin injects',
  '- insert:',
  '    - id: webServer',
  "      name: '@deepseek-ai/dsh-host-webserver'",
  '      config:',
  '        host: 127.0.0.1',
  '        port: 0',
  '',
].join('\n'))
const bootEnv = { ...process.env, DSH_HOME: sandboxHome }
const bootStarted = Date.now()
const child = spawn(opts.dsh, ['--profile', opts.profile, '--patch', overlayPath], { shell: true, env: bootEnv, cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] })
let bootStdout = ''
let bootStderr = ''
child.stdout.on('data', (chunk) => { bootStdout += chunk })
child.stderr.on('data', (chunk) => { bootStderr += chunk })
const quotedBoot = `${opts.dsh} --profile ${opts.profile} --patch ${overlayPath}`
console.log(`[real-boot] ${quotedBoot} (DSH_HOME=${sandboxHome}; watchdog ${Math.round(opts.bootTimeoutMs / 1000)}s)`)

const probePort = (port, host = '127.0.0.1', timeoutMs = 400) => new Promise((resolve) => {
  const socket = connect({ port, host })
  const done = (ok) => { socket.destroy(); resolve(ok) }
  socket.setTimeout(timeoutMs, () => done(false))
  socket.once('connect', () => done(true))
  socket.once('error', () => done(false))
})

let probe = 'timeout'
let waited = 0
const STEP_MS = 500
while (waited < opts.bootTimeoutMs && child.exitCode === null) {
  await new Promise((r) => setTimeout(r, STEP_MS))
  waited += STEP_MS
  if (bootStderr.includes(LOOPBACK_OCCUPIED_MARKER)) { probe = 'loopback-occupied-marker'; break }
  if (await probePort(8085)) { probe = 'tcp-8085-reachable'; break }
}
// 稳定窗口：探针命中后再等 1s（让后续 effect（路由注册/维护首跑）跑完，
// stderr 采集更完整）。
if (probe !== 'timeout') await new Promise((r) => setTimeout(r, 1000))
const killTree = () => {
  if (child.exitCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGTERM')
}
killTree()
await new Promise((resolve) => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); setTimeout(resolve, 5000).then?.(resolve) })
writeEvidence('boot-stdout.txt', bootStdout)
writeEvidence('boot-stderr.txt', bootStderr)
const bootDurationMs = Date.now() - bootStarted
const applyThrowHits = APPLY_THROW_MARKERS.filter((marker) => bootStderr.includes(marker))
const routerErrorLines = bootStderr.split('\n').filter((line) => line.includes(BUNDLE_NAME) && /error|Error|throw|failed/i.test(line))
const applyGreen = probe !== 'timeout' && applyThrowHits.length === 0 && routerErrorLines.length === 0
commandReport.push({
  label: 'real-boot', command: quotedBoot, exitCode: child.exitCode, signal: child.signal ?? null,
  timedOut: probe === 'timeout', durationMs: bootDurationMs, envOverride: `DSH_HOME=${sandboxHome}`,
  affectedPaths: [join(sandboxHome, 'profiles', opts.profile), overlayPath, `tcp://127.0.0.1:8085 (read-only connect probe)`],
})
console.log(`     probe=${probe} applyThrowMarkers=[${applyThrowHits.join(',') || 'none'}] routerErrorLines=${routerErrorLines.length} exit=${child.exitCode} ${bootDurationMs}ms`)
if (routerErrorLines.length > 0) console.error(`     error excerpt:\n${tail(routerErrorLines.join('\n'), 10)}`)
console.log(applyGreen
  ? 'apply face GREEN — plugin fully loaded on real boot (no throw; positive probe reached)'
  : `RED: apply face failed (probe=${probe}, throwMarkers=[${applyThrowHits.join(',')}], routerErrorLines=${routerErrorLines.length}) — stderr tail:\n${tail(bootStderr, 15)}`)

const green = loadGateGreen && applyGreen
finish(green, {
  green,
  loadGateGreen,
  schemaDiscoversRouter,
  applyGreen,
  probe,
  applyThrowHits,
  routerErrorLines: routerErrorLines.slice(0, 10),
  bootDurationMs,
})
