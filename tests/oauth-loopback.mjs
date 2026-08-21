/**
 * ChatGPT preset OAuth 1455 loopback 回调服务测试（roadmap §3.4 条目 3 /
 * 决策 E4 / EVO-002 Step 3）。
 *
 * 覆盖：默认端口常量（H3-3：从 CHATGPT_PRESET.redirectUri 解析 = 1455）、
 * 惰性默认（未显式调用前 codexLoopbackReady 不置位）、启动成功（port 0 临时
 * 端口参数化——默认 1455 值用常量断言而非真监听，避免与 Codex CLI/dsh-codex/
 * yoke233 的生态常态占用冲突）、回调分发（code/state 透传 oauthTokenExchange、
 * error/缺参分支不触发交换）、重复调用幂等（进程级单例复用同一实例）、
 * dispose（标志复位/连接拒绝/幂等/单例清空可重启）、EADDRINUSE 静默降级
 * （ready=false + reason + warn + 不抛错 + 失败不缓存可重试）。
 *
 * 与 oauth-credentials.mjs 同构：导出 runLoopbackTests(check) 供 smoke.mjs
 * 接线；另带独立入口（node tests/oauth-loopback.mjs 直接运行，exit 0/1）。
 * 全部走 127.0.0.1 临时端口（port 0）——不真监听 1455（EV-028：1455 是生态
 * 共用死值，开发机可能正被占用，真监听会 flaky）。请求用 node:http +
 * keepAlive:false agent 而非 fetch：undici 连接池复用已建 socket，会让
 * dispose 后的请求仍命中存活的 keep-alive 连接——测试可控性优先。
 */
import { Agent, createServer, get as httpGet } from 'node:http'
import { pathToFileURL } from 'node:url'
import { createCodexLoopback, CODEX_LOOPBACK_PORT } from '../lib/index.js'
import { CHATGPT_PRESET } from '../lib/oauth-credentials.js'

/** 一次性连接的 GET（keepAlive:false——响应毕即关 socket，dispose 语义可断言）。 */
const oneShotAgent = new Agent({ keepAlive: false })
function request(url) {
  return new Promise((resolve, reject) => {
    const req = httpGet(url, { agent: oneShotAgent }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, contentType: res.headers['content-type'] ?? '', body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
  })
}

/** 轮询直到连接被拒（dispose 后 close 异步完成，留 2s 收敛窗）。 */
async function untilRefused(url, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      await request(url)
    } catch {
      return true
    }
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

/** 伪造 service：记录 oauthTokenExchange 收到的参数（单测零真实网络/零落盘）。 */
function makeFakeService() {
  const exchanges = []
  return {
    exchanges,
    codexLoopbackReady: false,
    async oauthTokenExchange(args) {
      exchanges.push(args)
      return { ok: true, message: '授权成功（测试）' }
    },
  }
}

/** 记录型 logger（断言降级 warn 文案）。 */
function makeLogger() {
  const warns = []
  return { warns, warn: (message) => warns.push(message) }
}

/** 占住一个临时端口（EADDRINUSE 场景构造）。 */
function occupyPort() {
  return new Promise((resolve) => {
    const blocker = createServer(() => {})
    blocker.listen(0, '127.0.0.1', () => resolve(blocker))
  })
}

const closeServer = (server) => new Promise((resolve) => server.close(resolve))

export async function runLoopbackTests(check) {
  // ── 1. 默认端口常量（H3-3）+ 惰性默认 ──────────────────────────────────
  console.log('codex loopback port & lazy default:')
  check('default port derives from preset redirectUri = 1455 (H3-3)', CODEX_LOOPBACK_PORT === 1455 && new URL(CHATGPT_PRESET.redirectUri).port === '1455')
  const lazyService = makeFakeService()
  check('lazy default: codexLoopbackReady stays false without explicit start', lazyService.codexLoopbackReady !== true)

  // ── 2. 启动成功（port 0 临时端口；默认 1455 不真监听——生态占用会 flaky）──
  console.log('start success (ephemeral port 0):')
  const service = makeFakeService()
  const logger = makeLogger()
  const instance = await createCodexLoopback({ service, logger, port: 0 })
  check('resolves ready=true with bound port', instance.ready === true && Number.isInteger(instance.port) && instance.port > 0)
  check('service.codexLoopbackReady flips true after listen', service.codexLoopbackReady === true)
  check('clean start logs no warning', logger.warns.length === 0)
  const base = `http://127.0.0.1:${instance.port}`

  // ── 3. 回调分发：code/state 透传 + error/缺参分支 ────────────────────────
  console.log('callback dispatch:')
  const okRes = await request(`${base}/auth/callback?code=X&state=Y`)
  check('callback answers 200 text/html', okRes.status === 200 && okRes.contentType.startsWith('text/html'))
  check('oauthTokenExchange receives {code, state} verbatim', service.exchanges.length === 1 && service.exchanges[0].code === 'X' && service.exchanges[0].state === 'Y')
  const errRes = await request(`${base}/auth/callback?error=access_denied&error_description=user+backed+out`)
  check('error param renders failure page without exchange', errRes.status === 200 && service.exchanges.length === 1)
  const missingRes = await request(`${base}/auth/callback`)
  check('missing code/state rejected without exchange', missingRes.status === 200 && service.exchanges.length === 1)

  // ── 4. 重复调用幂等（进程级单例：同一实例，不重复监听）──────────────────
  console.log('idempotent re-call:')
  const again = await createCodexLoopback({ service, logger, port: 0 })
  check('second call returns the same running instance', again === instance)
  check('ready flag stays true across re-call', service.codexLoopbackReady === true)

  // ── 5. dispose：标志复位 / 连接拒绝 / 幂等 / 单例清空可重启 ──────────────
  console.log('dispose:')
  instance.dispose()
  check('dispose resets codexLoopbackReady', service.codexLoopbackReady === false)
  check('server no longer answers after dispose', await untilRefused(`${base}/auth/callback?code=Z&state=W`))
  check('refused request never reached oauthTokenExchange', service.exchanges.length === 1)
  let disposeTwice = true
  try { instance.dispose(); instance.dispose() } catch { disposeTwice = false }
  check('dispose is idempotent (repeat calls do not throw)', disposeTwice)
  const revived = await createCodexLoopback({ service, logger, port: 0 })
  check('dispose clears singleton — next call starts a fresh server', revived !== instance && revived.ready === true && service.codexLoopbackReady === true)
  revived.dispose()

  // ── 6. EADDRINUSE 静默降级（E4：ready=false + reason + warn + 不抛错）────
  console.log('EADDRINUSE degrade (E4):')
  const blocker = await occupyPort()
  const blockedPort = blocker.address().port
  const busyService = makeFakeService()
  const busyLogger = makeLogger()
  const busy = await createCodexLoopback({ service: busyService, logger: busyLogger, port: blockedPort })
  check('occupied port resolves ready=false reason EADDRINUSE (no throw)', busy.ready === false && busy.reason === 'EADDRINUSE')
  check('busy service stays not ready', busyService.codexLoopbackReady === false)
  check('degrade logs exactly one occupation warning', busyLogger.warns.length === 1 && busyLogger.warns[0].includes('occupied'))
  const retry = await createCodexLoopback({ service: busyService, logger: busyLogger, port: 0 })
  check('failed attempt is not cached — retry on a free port starts clean', retry.ready === true && busyService.codexLoopbackReady === true)
  retry.dispose()
  await closeServer(blocker)
}

// 独立入口：node tests/oauth-loopback.mjs（与 smoke 接线互补；exit 0/1）。
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  let failures = 0
  let passed = 0
  const check = (label, condition) => {
    if (condition) { passed++; console.log(`  ok  ${label}`) }
    else { failures++; console.error(`FAIL  ${label}`) }
  }
  await runLoopbackTests(check)
  console.log(failures === 0 ? `\nALL OAUTH LOOPBACK TESTS PASSED (${passed} assertions)` : `\n${failures} FAILURES (${passed} passed)`)
  process.exit(failures === 0 ? 0 : 1)
}
