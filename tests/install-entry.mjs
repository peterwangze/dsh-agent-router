// dsh-agent-router 平台安装入口测试：
// - BOM 编码守卫：install.ps1 必须带 UTF-8 BOM（PS 5.1 的 -File 离线入口在无 BOM 时
//   按 ANSI 解码 UTF-8 中文注释，产生假解析错误——本机实测）；install.sh 必须无 BOM
//   （POSIX shebang 无法处理 BOM）。
// - 在线命令守卫：本地 HTTP fixture 服务器（复刻 GitHub raw 响应头）按请求生成带/不带
//   BOM 的参数块脚本，对每个可用 PowerShell 宿主执行与 README 一致的在线命令，断言成功；
//   同时反向断言旧命令（irm | iex）在带 BOM 响应下失败，防止假绿。
// - POSIX 在线命令守卫：sh 可用时执行 curl | sh 形式；不可用则跳过。
// - 离线安装守卫：临时 DSH_HOME 下跑 -File/-LocalPath 与 sh --local，验证幂等。
// - 文档一致性守卫：README 与 install.ps1 头部注释记载的命令必须与测试模板一致。
//
// 沙箱兼容：所有子进程 stdio 一律 ignore，断言信号由 fixture 写入结果文件，
// 不依赖捕获子进程管道输出。清理 temp 目录时 junction/symlink 只删链接本身。
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync, existsSync, readdirSync, lstatSync, rmSync, mkdirSync, rmdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

const ONLINE_CMD_CORE = `iex (((irm {URL}) -join [Environment]::NewLine).TrimStart([char]0xFEFF))`
const OLD_CMD_CORE = `irm {URL} | iex`
const RAW_URL = 'https://raw.githubusercontent.com/peterwangze/dsh-agent-router/main/install.ps1'

const BOM = Buffer.from([0xef, 0xbb, 0xbf])

/** 子进程超时（受限环境偶发挂起时快速失败而非无限等待）。 */
const SPAWN_TIMEOUT_MS = 30000

/**
 * 异步执行子进程并等待退出（stdio 全部忽略）。必须异步：fixture 服务器跑在
 * 本进程事件循环里，spawnSync 同步阻塞会饿死 HTTP 响应、导致子进程永远等响应。
 * @returns {Promise<{status: number | null, error: {code?: string} | null}>}
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore', ...options })
    let settled = false
    const finish = (error, status) => {
      if (settled) return
      settled = true
      resolve({ error, status })
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(null, null)
    }, SPAWN_TIMEOUT_MS)
    child.on('error', (error) => {
      clearTimeout(timer)
      finish({ code: error.code ?? 'SPAWN_ERROR' }, null)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      finish(null, code)
    })
  })
}

/** 探测可用的 PowerShell 宿主（5.1 为 powershell.exe，7+ 为 pwsh.exe）。 */
async function powerShellHosts() {
  const hosts = []
  for (const exe of ['powershell', 'pwsh']) {
    const probe = await runCommand(exe, ['-NoProfile', '-Command', 'exit 0'])
    if (probe.error === null) hosts.push(exe)
  }
  return hosts
}

/** 探测可用的 POSIX shell 与 curl。 */
async function posixShell() {
  const probe = await runCommand('sh', ['-c', 'exit 0'])
  if (probe.error !== null) return null
  const curl = await runCommand('curl', ['--version'])
  if (curl.error !== null) return null
  return 'sh'
}

/** 生成带 param 块的 PowerShell fixture（在线入口形态镜像），结果写入文件而非 stdout。 */
function psFixtureBody(resultFile) {
  return [
    `# fixture: mirrors the param-block entry shape of install.ps1 (online iex path).`,
    `param(`,
    `  [string]$RepoUrl = 'https://example.com/dsh-agent-router.git',`,
    `  [string]$Ref = 'main',`,
    `  [string]$LocalPath = '',`,
    `  [string]$Profile = 'web'`,
    `)`,
    `Set-Content -Path '${resultFile.replace(/'/g, "''")}' -Value ("SENTINEL-OK repo={0} ref={1} local={2} profile={3}" -f $RepoUrl, $Ref, $LocalPath, $Profile)`,
    ``,
  ].join('\n')
}

/** 生成 POSIX sh fixture，结果写入文件而非 stdout。 */
function shFixtureBody(resultFile) {
  return `#!/bin/sh\n# fixture: entry-shape mirror for install.sh (online curl|sh path).\necho 'SENTINEL-SH-OK' > '${resultFile.replace(/'/g, "'\\''")}'\n`
}

/**
 * 启动内存 fixture 服务器（复刻 GitHub raw：text/plain; charset=utf-8 + content-length）。
 * 路由值可以是 Buffer，或 (searchParams) => string|Buffer 的按请求生成函数。
 * @returns {{ port: number, register: (path: string, body: Buffer | ((params: URLSearchParams) => string | Buffer)) => void, close: () => Promise<void> }}
 */
function startFixtureServer() {
  const routes = new Map()
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const route = routes.get(url.pathname)
    const body = typeof route === 'function' ? route(url.searchParams) : route
    if (!body) { res.writeHead(404); res.end('not found'); return }
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8')
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'content-length': String(buffer.length) })
    res.end(buffer)
  })
  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        port,
        register: (path, body) => routes.set(path, body),
        close: () => new Promise((done) => server.close(() => done())),
      })
    })
  })
}

/** 在仓库内建测试临时目录（不入库，测试结束清理）。 */
function tempResultDir() {
  const dir = join(ROOT_DIR, `.test-home-entry-${process.pid}-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 删除测试临时目录。junction/symlink 绝不跟随（lstat 判定），只删链接本身，
 * 防止把链接目标（如仓库目录）一并删除。
 */
function removeTempDir(dir) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = lstatSync(full)
    if (stat.isSymbolicLink()) {
      // 链接（symlink/junction）：只删链接本体。
      try { rmSync(full, { force: true }) } catch { try { rmdirSync(full) } catch { /* 尽力清理 */ } }
    } else if (stat.isDirectory()) {
      removeTempDir(full)
    } else {
      rmSync(full, { force: true })
    }
  }
  rmdirSync(dir)
}

export async function runInstallEntryTests(check) {
  console.log('install entry:')

  // ── 1. BOM 编码守卫 ────────────────────────────────────────────────
  {
    // install.ps1 带 BOM：PS 5.1 的 -File 离线入口按 BOM 识别 UTF-8；
    // 无 BOM 时中文字节被按 ANSI 解码、产生假解析错误（本机实测 2 处）。
    const ps1 = readFileSync(join(ROOT_DIR, 'install.ps1'))
    const ps1HasBom = ps1.length >= 3 && ps1[0] === 0xef && ps1[1] === 0xbb && ps1[2] === 0xbf
    check('install.ps1 carries UTF-8 BOM (PS 5.1 -File entry)', ps1HasBom)
    // install.sh 无 BOM：POSIX shebang 与 curl|sh 管道都不接受 BOM 前缀。
    const shBytes = readFileSync(join(ROOT_DIR, 'install.sh'))
    const shHasBom = shBytes.length >= 3 && shBytes[0] === 0xef && shBytes[1] === 0xbb && shBytes[2] === 0xbf
    check('install.sh has no UTF-8 BOM (POSIX shebang)', !shHasBom)
  }

  // ── 2. 文档一致性守卫 ──────────────────────────────────────────────
  {
    const core = ONLINE_CMD_CORE.replace('{URL}', RAW_URL)
    const ps1Text = readFileSync(join(ROOT_DIR, 'install.ps1'), 'utf8')
    const readmeText = readFileSync(join(ROOT_DIR, 'README.md'), 'utf8')
    check('install.ps1 header documents BOM-immune command', ps1Text.includes(core))
    check('README documents BOM-immune command (table + AI prompt)', readmeText.split(core).length - 1 >= 2)
    check('README no longer documents irm|iex form', !readmeText.includes('irm https://raw.githubusercontent.com/peterwangze/dsh-agent-router/main/install.ps1 | iex') && !readmeText.includes('irm https://raw.githubusercontent.com/peterwangze/dsh-agent-router/main/install.ps1 \\| iex'))
  }

  const tmpDir = tempResultDir()
  const server = await startFixtureServer()
  const baseUrl = `http://127.0.0.1:${server.port}`
  try {
    // ── 3. 在线命令守卫（PowerShell 5.1 / 7）────────────────────────
    const hosts = await powerShellHosts()
    if (hosts.length === 0) {
      console.log('  skip PowerShell online checks (no powershell/pwsh available)')
    }
    for (const host of hosts) {
      for (const variant of ['plain', 'bom']) {
        const resultFile = join(tmpDir, `online-${host}-${variant}.txt`)
        const route = (params) => {
          const body = psFixtureBody(params.get('result') ?? resultFile)
          return variant === 'bom' ? Buffer.concat([BOM, Buffer.from(body, 'utf8')]) : body
        }
        const routePath = `/fixture-${variant}-${host}.ps1`
        server.register(routePath, route)
        const command = ONLINE_CMD_CORE.replace('{URL}', `${baseUrl}${routePath}?result=${encodeURIComponent(resultFile)}`)
        const run = await runCommand(host, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command])
        const sentinel = existsSync(resultFile) && readFileSync(resultFile, 'utf8').includes('SENTINEL-OK')
        check(`online command succeeds on ${host} (${variant})`, run.status === 0 && run.error === null && sentinel)
      }
      // 反向守卫：旧命令形式在带 BOM 响应下必须失败——证明本测试能捕获该回归。
      {
        const resultFile = join(tmpDir, `online-old-${host}.txt`)
        const routePath = `/fixture-old-${host}.ps1`
        server.register(routePath, (params) => Buffer.concat([BOM, Buffer.from(psFixtureBody(params.get('result') ?? resultFile), 'utf8')]))
        const command = OLD_CMD_CORE.replace('{URL}', `${baseUrl}${routePath}?result=${encodeURIComponent(resultFile)}`)
        const run = await runCommand(host, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command])
        check(`old irm|iex form rejected under BOM on ${host} (regression witness)`, run.status !== 0 && !existsSync(resultFile))
      }
    }

    // ── 4. POSIX 在线命令守卫 ────────────────────────────────────────
    const sh = await posixShell()
    if (sh === null) {
      console.log('  skip POSIX online checks (no sh/curl available)')
    } else {
      const resultFile = join(tmpDir, 'online-sh.txt')
      server.register('/fixture.sh', (params) => shFixtureBody(params.get('result') ?? resultFile))
      const run = await runCommand(sh, ['-c', `curl -fsSL '${baseUrl}/fixture.sh?result=${encodeURIComponent(resultFile)}' | sh`])
      const sentinel = existsSync(resultFile) && readFileSync(resultFile, 'utf8').includes('SENTINEL-SH-OK')
      check(`online curl|sh command succeeds on ${sh}`, run.status === 0 && run.error === null && sentinel)
    }

    // ── 5. 离线安装守卫（临时 DSH_HOME，不触碰真实 ~/.dsh）──────────
    const dshHome = join(tmpDir, 'offline-dsh-home')
    for (const host of hosts) {
      const runInstall = () => runCommand(host, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(ROOT_DIR, 'install.ps1'), '-LocalPath', ROOT_DIR], { env: { ...process.env, DSH_HOME: dshHome } })
      const first = await runInstall()
      const patch = join(dshHome, 'profiles', 'web', 'cordis.patch.yml')
      const patchOk = existsSync(patch) && readFileSync(patch, 'utf8').includes('name: dsh-agent-router/tool')
      const linkOk = existsSync(join(dshHome, 'profiles', 'node_modules', 'dsh-agent-router', 'package.json'))
      const second = await runInstall()
      const patchAgain = existsSync(patch) && readFileSync(patch, 'utf8').includes('name: dsh-agent-router/tool')
      check(`offline install (-File) succeeds on ${host}`, first.status === 0 && first.error === null && patchOk && linkOk)
      check(`offline install idempotent on ${host}`, second.status === 0 && second.error === null && patchAgain)
    }
    if (sh !== null) {
      const runSh = () => runCommand(sh, ['-c', `DSH_HOME='${dshHome}' sh '${join(ROOT_DIR, 'install.sh')}' --local '${ROOT_DIR}'`])
      const first = await runSh()
      const patch = join(dshHome, 'profiles', 'web', 'cordis.patch.yml')
      const patchOk = existsSync(patch) && readFileSync(patch, 'utf8').includes('name: dsh-agent-router/tool')
      const linkOk = existsSync(join(dshHome, 'profiles', 'node_modules', 'dsh-agent-router', 'package.json'))
      const second = await runSh()
      const patchAgain = existsSync(patch) && readFileSync(patch, 'utf8').includes('name: dsh-agent-router/tool')
      check(`offline install (sh --local) succeeds on ${sh}`, first.status === 0 && first.error === null && patchOk && linkOk)
      check(`offline install (sh --local) idempotent on ${sh}`, second.status === 0 && second.error === null && patchAgain)
    }
  } finally {
    await server.close()
    removeTempDir(tmpDir)
  }
}
