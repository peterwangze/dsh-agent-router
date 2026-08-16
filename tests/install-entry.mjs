// dsh-agent-router 平台安装入口测试：
// - BOM 编码守卫：install.ps1 必须带 UTF-8 BOM（PS 5.1 的 -File 离线入口在无 BOM 时
//   按 ANSI 解码 UTF-8 中文注释，产生假解析错误——本机实测）；install.sh 必须无 BOM
//   （POSIX shebang 无法处理 BOM）。
// - 在线命令守卫：本地 HTTP fixture 服务器（复刻 GitHub raw 响应头）按请求生成带/不带
//   BOM 的参数块脚本，对每个可用 PowerShell 宿主执行与 README 一致的在线命令，断言成功；
//   同时反向断言旧命令（irm | iex）在带 BOM 响应下失败，防止假绿。
// - POSIX 在线命令守卫：sh 可用时执行 curl | sh 形式；不可用则跳过。
// - 离线安装守卫：临时 DSH_HOME 下跑 -File/-LocalPath 与 sh --local，验证幂等。
// - 依赖解析守卫：裸源码（git clone 形态，无 node_modules）安装后，安装脚本必须把
//   profiles 的平坦依赖树链接进源码目录，使插件自身 @deepseek-ai/* 依赖可解析
//   （缺失时 ERR_MODULE_NOT_FOUND 击穿 DSH 启动——实测复现）；自带真实 node_modules
//   的源码目录不得被改动。
// - 文档一致性守卫：README 与 install.ps1 头部注释记载的命令必须与测试模板一致。
//
// 沙箱兼容：所有子进程 stdio 一律 ignore，断言信号由 fixture 写入结果文件，
// 不依赖捕获子进程管道输出。清理 temp 目录时 junction/symlink 只删链接本身。
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync, existsSync, readdirSync, lstatSync, rmSync, mkdirSync, rmdirSync, cpSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
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
 * 创建目录链接（Windows 用 junction，POSIX 用默认 symlink）。
 * @param {string} target - 链接目标（真实目录）。
 * @param {string} link - 链接路径。
 */
function makeDirLink(target, link) {
  symlinkSync(target, link, process.platform === 'win32' ? 'junction' : undefined)
}

/**
 * 从临时 DSH_HOME 的 web profile 目录解析插件本体（模拟 DSH loader 的
 * bare-name import）：probe 脚本写入 profile 目录、结果写入文件（stdio
 * ignore 兼容受限环境）。
 * @param {string} dshHome - 临时 DSH_HOME 根目录。
 * @returns {Promise<string>} probe 输出内容（RESOLVE-OK / RESOLVE-FAIL <code>）。
 */
async function resolvePluginProbe(dshHome) {
  const profileDir = join(dshHome, 'profiles', 'web')
  mkdirSync(profileDir, { recursive: true })
  const probePath = join(profileDir, `.resolve-probe-${Date.now()}.mjs`)
  const resultFile = join(profileDir, `.resolve-result-${Date.now()}.txt`)
  writeFileSync(probePath, `import { writeFileSync } from 'node:fs'
try {
  const mod = await import('dsh-agent-router')
  writeFileSync(${JSON.stringify(resultFile)}, 'RESOLVE-OK ' + Object.keys(mod).join(','))
} catch (error) {
  writeFileSync(${JSON.stringify(resultFile)}, 'RESOLVE-FAIL ' + (error.code ?? '') + ' ' + String(error.message).split('\\n')[0])
}
`)
  const run = await runCommand(process.execPath, [probePath], { cwd: profileDir })
  rmSync(probePath, { force: true })
  if (run.error !== null || run.status !== 0) return `PROBE-CRASH status=${run.status} error=${run.error?.code ?? ''}`
  if (!existsSync(resultFile)) return 'PROBE-NO-RESULT'
  const output = readFileSync(resultFile, 'utf8')
  rmSync(resultFile, { force: true })
  return output
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

/** 在仓库内建测试临时目录（`.test-home/` 已在 .gitignore 内，不入库）。 */
function tempResultDir() {
  const dir = join(ROOT_DIR, '.test-home', `entry-${process.pid}-${Date.now()}`)
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

    // ── 6. 依赖解析守卫：裸源码（git clone 形态，无 node_modules）────
    // 回归目标：junction 挂载后 Node 从插件真实目录解析 `@deepseek-ai/*`
    // 依赖；缺依赖链接时 ERR_MODULE_NOT_FOUND 击穿 DSH 启动（实测复现）。
    // 裸环境放在仓库外：仓库自身的 dev 依赖 junction 会沿父目录污染解析，
    // 使负向见证假绿（本仓库 .gitignore 注明的开发机 node_modules junction）。
    {
      const bareRoot = join(ROOT_DIR, '..', `.test-home-bare-${process.pid}-${Date.now()}`)
      try {
        // 6a. 构造裸源码拷贝 + 模拟 heal 后的平坦依赖树（把插件 4 个
        //     @deepseek-ai 运行时依赖链接进临时 profiles/node_modules）。
        const bareSrc = join(bareRoot, 'bare-plugin')
        mkdirSync(bareSrc, { recursive: true })
        for (const name of ['lib', 'install.ps1', 'install.sh', 'package.json', 'README.md', 'LICENSE', 'docs']) {
          const from = join(ROOT_DIR, name)
          if (existsSync(from)) cpSync(from, join(bareSrc, name), { recursive: true })
        }
        const bareHome = join(bareRoot, 'bare-dsh-home')
        const bareModules = join(bareHome, 'profiles', 'node_modules')
        mkdirSync(bareModules, { recursive: true })
        // 复刻 heal：把安装树的 @deepseek-ai 包按平坦结构链接进临时 home。
        // 从测试进程自身解析各依赖的真实目录（dev junction / pnpm 布局均可）。
        for (const dep of ['schemastery', 'dsh-tools', 'dsh-typert-protocol', 'dsh-llm']) {
          const pkgJson = createRequire(import.meta.url).resolve(`@deepseek-ai/${dep}/package.json`)
          const realDir = dirname(pkgJson)
          const linkParent = join(bareModules, '@deepseek-ai')
          mkdirSync(linkParent, { recursive: true })
          makeDirLink(realDir, join(linkParent, dep))
        }
        // 6b. 负向见证：仅挂插件本体链接（无依赖链接）→ 必须 ERR_MODULE_NOT_FOUND。
        mkdirSync(join(bareHome, 'profiles', 'web'), { recursive: true })
        makeDirLink(bareSrc, join(bareModules, 'dsh-agent-router'))
        const probeNeg = await resolvePluginProbe(bareHome)
        check('bare source without dep link fails to resolve (regression witness)', probeNeg.includes('ERR_MODULE_NOT_FOUND'))
        // 6c. 正向：跑真实安装脚本后，依赖链接被创建且插件可解析；幂等重跑亦然。
        for (const host of hosts) {
          const run = () => runCommand(host, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(ROOT_DIR, 'install.ps1'), '-LocalPath', bareSrc], { env: { ...process.env, DSH_HOME: bareHome } })
          const first = await run()
          const depLinkOk = lstatSync(join(bareSrc, 'node_modules')).isSymbolicLink()
          const probeOk = await resolvePluginProbe(bareHome)
          const second = await run()
          const probeAgain = await resolvePluginProbe(bareHome)
          check(`bare-source install creates dep link on ${host}`, first.status === 0 && first.error === null && depLinkOk)
          check(`bare-source plugin resolves after install on ${host}`, probeOk.includes('RESOLVE-OK'))
          check(`bare-source install idempotent (dep link kept) on ${host}`, second.status === 0 && second.error === null && probeAgain.includes('RESOLVE-OK'))
        }
        // 6c-sh. POSIX 同守卫：install.sh --local 后依赖链接被创建且插件可解析。
        if (sh !== null) {
          const shBareHome = join(bareRoot, 'bare-dsh-home-sh')
          const shBareModules = join(shBareHome, 'profiles', 'node_modules')
          mkdirSync(shBareModules, { recursive: true })
          for (const dep of ['schemastery', 'dsh-tools', 'dsh-typert-protocol', 'dsh-llm']) {
            const pkgJson = createRequire(import.meta.url).resolve(`@deepseek-ai/${dep}/package.json`)
            const linkParent = join(shBareModules, '@deepseek-ai')
            mkdirSync(linkParent, { recursive: true })
            makeDirLink(dirname(pkgJson), join(linkParent, dep))
          }
          mkdirSync(join(shBareHome, 'profiles', 'web'), { recursive: true })
          const run = () => runCommand(sh, ['-c', `DSH_HOME='${shBareHome}' sh '${join(ROOT_DIR, 'install.sh')}' --local '${bareSrc}'`])
          const first = await run()
          const depLinkOk = lstatSync(join(bareSrc, 'node_modules')).isSymbolicLink()
          const probeOk = await resolvePluginProbe(shBareHome)
          const second = await run()
          const probeAgain = await resolvePluginProbe(shBareHome)
          check(`bare-source install (sh --local) creates dep link on ${sh}`, first.status === 0 && first.error === null && depLinkOk)
          check(`bare-source plugin resolves after install on ${sh}`, probeOk.includes('RESOLVE-OK'))
          check(`bare-source install (sh --local) idempotent on ${sh}`, second.status === 0 && second.error === null && probeAgain.includes('RESOLVE-OK'))
        }
        // 6d. 自带真实 node_modules 的源码：跳过依赖链接且不得改动用户目录。
        //     （独立拷贝顶层条目，避免继承 6c 在 bareSrc 里创建的依赖链接。）
        {
          const realNmSrc = join(bareRoot, 'real-nm-plugin')
          mkdirSync(realNmSrc, { recursive: true })
          for (const name of ['lib', 'install.ps1', 'install.sh', 'package.json', 'README.md', 'LICENSE', 'docs']) {
            const from = join(ROOT_DIR, name)
            if (existsSync(from)) cpSync(from, join(realNmSrc, name), { recursive: true })
          }
          mkdirSync(join(realNmSrc, 'node_modules'), { recursive: true })
          writeFileSync(join(realNmSrc, 'node_modules', 'user-marker.txt'), 'keep me')
          const realNmHome = join(bareRoot, 'real-nm-home')
          mkdirSync(join(realNmHome, 'profiles', 'node_modules'), { recursive: true })
          for (const host of hosts) {
            const run = () => runCommand(host, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(ROOT_DIR, 'install.ps1'), '-LocalPath', realNmSrc], { env: { ...process.env, DSH_HOME: realNmHome } })
            const result = await run()
            const markerOk = existsSync(join(realNmSrc, 'node_modules', 'user-marker.txt'))
            const stillRealDir = lstatSync(join(realNmSrc, 'node_modules')).isDirectory() && !lstatSync(join(realNmSrc, 'node_modules')).isSymbolicLink()
            check(`real node_modules dir left untouched on ${host}`, result.status === 0 && markerOk && stillRealDir)
          }
        }
      } finally {
        removeTempDir(bareRoot)
      }
    }
  } finally {
    await server.close()
    removeTempDir(tmpDir)
  }
}
