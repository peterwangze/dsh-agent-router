/**
 * ChatGPT preset OAuth 凭据模块测试（roadmap §3.3 / ADR-005 / EVO-002 Step 2）。
 *
 * 覆盖：preset 常量逐字段（H3-1/2/3/5/11）、文档 round-trip 与形状、严格校验
 * （未知字段/缺 version/version≠1/类型错 → CREDENTIAL_FILE_CORRUPT；缺文件 →
 * undefined）、delete 幂等、原子写无残留、owner-only（POSIX）、accountIdFromJwt
 * （H3-7）、ensureFresh（零网络快路径 / rotating refresh 全文档重写 / 401 终态）、
 * 并发锁串行化（fetch 恰一次）、锁超时与陈旧接管、resolveCredentialPath（F-01：
 * credentialFile 回退默认路径，DSH_HOME → ~/.dsh）、P7 脱敏（诊断不含 token 值）、
 * R2 P2 加固（Step 4a）：刷新超时 F-01a（timedOut 标记 + 锁释放 + signal 接线）、
 * 锁所有权校验 F-01b（接管后不误删继任者锁——实例级 token）、锁元数据写失败
 * 清理 F-02（writeLockMeta 注入失败钩子，跨平台确定性模拟）。
 *
 * 与 attachments.mjs 同构：导出 runOauthCredentialTests(check) 供 smoke.mjs 接线；
 * 另带独立入口（node tests/oauth-credentials.mjs 直接运行，exit 0/1）。
 * 全部用临时目录 + 注入 env/home——不依赖真实 process.env 与 ~/.dsh（EV-028 事实 2）。
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { OauthCredentialStore, CHATGPT_PRESET, CREDENTIAL_ERROR_CODES, REFRESH_MARGIN_MS, REFRESH_TIMEOUT_MS, CREDENTIAL_LOCK_STALE_MS, accountIdFromJwt, resolveCredentialPath, defaultCredentialPath, startDeviceAuthorization, pollDeviceAuthorizationToken, DEVICE_FLOW_TIMEOUT_SECONDS } from '../lib/oauth-credentials.js'
import { OAUTH_PRESET_VALUES } from '../lib/schemas.js'

/** 伪造 JWT（header.payload.signature；payload 为 base64url JSON）。 */
function fakeJwt(payload) {
  const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(payload)}.sig-fake`
}

/** 成功刷新响应（rotating：新 access + 新 refresh + expires_in 秒，H3-6/EV-028）。 */
function refreshOk(access, refresh, expiresIn) {
  return { ok: true, status: 200, json: async () => ({ access_token: access, refresh_token: refresh, expires_in: expiresIn }) }
}

/** 捕获请求的注入 fetch（单测零真实网络）。 */
function makeCaptureFetch(respond) {
  const captured = []
  const fetchImpl = async (url, init) => {
    captured.push({ url, init })
    return respond(captured.length, captured[captured.length - 1])
  }
  return { captured, fetchImpl }
}

export async function runOauthCredentialTests(check) {
  const work = mkdtempSync(join(tmpdir(), 'oauth-cred-'))
  try {
    // ── 1. CHATGPT_PRESET 常量逐字段 = H3 事实（§3.1 H3-1/2/3/5/11）────────
    console.log('chatgpt preset constants:')
    check('preset identity fields match H3-1/2/3/5',
      CHATGPT_PRESET.preset === 'chatgpt-codex'
      && CHATGPT_PRESET.clientId === 'app_EMoamEEZ73f0CkXaXp7hrann'
      && CHATGPT_PRESET.authUrl === 'https://auth.openai.com/oauth/authorize'
      && CHATGPT_PRESET.tokenUrl === 'https://auth.openai.com/oauth/token'
      && CHATGPT_PRESET.scope === 'openid profile email offline_access'
      && CHATGPT_PRESET.redirectUri === 'http://localhost:1455/auth/callback')
    check('device flow urls match H3-11',
      CHATGPT_PRESET.deviceUrls.userCode === 'https://auth.openai.com/api/accounts/deviceauth/usercode'
      && CHATGPT_PRESET.deviceUrls.token === 'https://auth.openai.com/api/accounts/deviceauth/token'
      && CHATGPT_PRESET.deviceUrls.verification === 'https://auth.openai.com/codex/device')
    check('preset registered in OAUTH_PRESET_VALUES (Step 1 consistency)', OAUTH_PRESET_VALUES.includes(CHATGPT_PRESET.preset))
    check('refresh margin is 120s per §3.3', REFRESH_MARGIN_MS === 120_000)
    check('refresh timeout default stays below lock stale window (F-01a)', REFRESH_TIMEOUT_MS === 25_000 && REFRESH_TIMEOUT_MS < CREDENTIAL_LOCK_STALE_MS)

    // ── 2/3/4/5/6. 存取面：round-trip / 严格校验 / delete / 原子写 / 权限 ──
    console.log('credential document store:')
    const credPath = join(work, 'cred.json')
    const store = new OauthCredentialStore(credPath)
    check('explicit filename kept by constructor', store.filename === credPath)
    check('read missing file resolves undefined (not an error)', (await store.read()) === undefined)

    const cred = { type: 'oauth', access: 'ACCESS-A', refresh: 'REFRESH-A', expires: Date.now() + 3_600_000, accountId: 'acct-1' }
    await store.write(cred)
    const back = await store.read()
    check('write→read round-trips all fields', back && back.type === 'oauth' && back.access === 'ACCESS-A' && back.refresh === 'REFRESH-A' && back.accountId === 'acct-1' && back.expires === cred.expires)
    const raw = JSON.parse(readFileSync(credPath, 'utf8'))
    check('document shape is {version:1, credential:{...}} (H3-13)', raw.version === 1 && typeof raw.credential === 'object' && raw.credential !== null && raw.credential.access === 'ACCESS-A' && raw.credential.refresh === 'REFRESH-A' && raw.credential.expires === cred.expires && raw.credential.accountId === 'acct-1' && raw.credential.type === 'oauth')
    check('read returns a copy (mutating result does not poison store)', (back.access = 'MUTATED', (await store.read()).access === 'ACCESS-A'))

    // 严格校验（未知顶层/未知凭据字段、缺 version、version≠1、类型错、非 JSON）。
    const bad = (name, doc) => {
      const dir = join(work, `bad-${name}`)
      mkdirSync(dir, { recursive: true })
      const badStore = new OauthCredentialStore(join(dir, 'cred.json'))
      writeFileSync(join(dir, 'cred.json'), typeof doc === 'string' ? doc : JSON.stringify(doc))
      return badStore
    }
    const validCred = { type: 'oauth', access: 'SECRET-ACCESS-XYZ', refresh: 'SECRET-REFRESH-ABC', expires: 1, accountId: 'a' }
    const corruptCases = [
      ['unknown top-level field', { version: 1, credential: validCred, extra: 1 }],
      ['unknown credential field', { version: 1, credential: { ...validCred, extra: 2 } }],
      ['missing version', { credential: validCred }],
      ['version not 1', { version: 2, credential: validCred }],
      ['missing credential', { version: 1 }],
      ['wrong field type', { version: 1, credential: { ...validCred, access: 123 } }],
      ['empty access token', { version: 1, credential: { ...validCred, access: '' } }],
      ['wrong type literal', { version: 1, credential: { ...validCred, type: 'api-key' } }],
      ['non-json payload', '{"version":1,"credential":SECRET-ACCESS-XYZ truncated'],
    ]
    for (const [name, doc] of corruptCases) {
      let rejected = false
      let message = ''
      try { await bad(name, doc).read() } catch (error) { rejected = error.code === CREDENTIAL_ERROR_CODES.CREDENTIAL_FILE_CORRUPT; message = error.message }
      check(`corrupt doc rejected (${name})`, rejected)
      check(`corrupt doc message free of token values (${name})`, !message.includes('SECRET-ACCESS-XYZ') && !message.includes('SECRET-REFRESH-ABC'))
    }
    let badWriteRejected = false
    try { await store.write({ type: 'oauth', access: '', refresh: 'r', expires: 1, accountId: 'a', extra: 1 }) } catch (error) { badWriteRejected = error.code === CREDENTIAL_ERROR_CODES.CREDENTIAL_FILE_CORRUPT }
    check('write rejects invalid credential object', badWriteRejected)

    // delete：成功删除 + 幂等。
    await store.delete()
    check('delete removes credential file', (await store.read()) === undefined)
    let idempotent = true
    try { await store.delete(); await store.delete() } catch { idempotent = false }
    check('delete is idempotent on missing file', idempotent)

    // 原子写：目录内零 temp/锁残留（temp 名模式匹配；只看本目标文件的派生物）。
    await store.write(cred)
    const residue = readdirSync(work).filter((name) => name === 'cred.json' || name.startsWith('.cred.json.') || name.startsWith('cred.json.'))
    check('atomic write leaves no temp/lock residue', residue.length === 1 && residue[0] === 'cred.json')

    // owner-only：POSIX 断言 mode 0o600；Windows 无 mode 语义按 H3-13 先例跳过。
    if (process.platform === 'win32') {
      check('owner-only mode skipped on Windows (H3-13 precedent)', true)
    } else {
      check('owner-only mode 0600 on POSIX', (statSync(credPath).mode & 0o777) === 0o600)
    }

    // ── 7. accountIdFromJwt（H3-7：仅解码不验签）───────────────────────────
    console.log('accountIdFromJwt:')
    const jwtWithClaim = fakeJwt({ sub: 'user-1', 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-jwt-1' } })
    check('extracts chatgpt_account_id from auth claim', accountIdFromJwt(jwtWithClaim) === 'acct-jwt-1')
    check('malformed inputs resolve null', accountIdFromJwt('not-a-jwt') === null && accountIdFromJwt('a.b') === null && accountIdFromJwt('') === null && accountIdFromJwt(null) === null)
    check('missing auth claim resolves null', accountIdFromJwt(fakeJwt({ sub: 'x' })) === null)
    check('non-object auth claim / non-string id resolve null', accountIdFromJwt(fakeJwt({ 'https://api.openai.com/auth': 'flat' })) === null && accountIdFromJwt(fakeJwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 42 } })) === null)
    check('undecodable payload resolves null', accountIdFromJwt(`eyJhbGciOiJub25lIn0.!!!!not-base64!!!!.sig`) === null)

    // ── 8/12. ensureFresh：快路径 / rotating 刷新 / 401 / 脱敏 ──────────────
    console.log('ensureFresh:')
    const freshPath = join(work, 'fresh.json')
    const freshStore = new OauthCredentialStore(freshPath)
    const { captured: zeroCaptured, fetchImpl: zeroFetch } = makeCaptureFetch(() => refreshOk('SHOULD-NOT-HAPPEN', 'SHOULD-NOT-HAPPEN', 1000))
    const freshCred = { type: 'oauth', access: 'ACCESS-FRESH', refresh: 'REFRESH-FRESH', expires: Date.now() + REFRESH_MARGIN_MS + 600_000, accountId: 'acct-f' }
    const freshOut = await freshStore.ensureFresh(freshCred, { fetchImpl: zeroFetch })
    check('fresh credential returned as-is without network', zeroCaptured.length === 0 && freshOut === freshCred)
    await freshStore.delete()

    // 临期（剩余寿命 < 120s）→ 刷新 + 全文档重写（rotating 覆写新 refresh）。
    const staleCred = { type: 'oauth', access: 'SECRET-ACCESS-XYZ', refresh: 'SECRET-REFRESH-ABC', expires: Date.now() + 60_000, accountId: 'acct-1' }
    const refPath = join(work, 'ref.json')
    const refStore = new OauthCredentialStore(refPath)
    await refStore.write(staleCred)
    const { captured, fetchImpl } = makeCaptureFetch(() => refreshOk('ACCESS-B', 'REFRESH-B', 864000))
    const refetched = await refStore.ensureFresh(staleCred, { fetchImpl })
    check('stale credential triggers exactly one refresh call', captured.length === 1)
    check('refresh posts to preset tokenUrl via POST + form content-type', captured[0].url === CHATGPT_PRESET.tokenUrl && captured[0].init.method === 'POST' && String(captured[0].init.headers['content-type']) === 'application/x-www-form-urlencoded')
    const refBody = new URLSearchParams(String(captured[0].init.body))
    check('refresh body carries grant_type/client_id without secret (H3-6)', refBody.get('grant_type') === 'refresh_token' && refBody.get('client_id') === CHATGPT_PRESET.clientId && refBody.get('refresh_token') === 'SECRET-REFRESH-ABC' && !refBody.has('client_secret'))
    const before = Date.now()
    check('returned credential carries new tokens + recomputed expiry + preserved accountId', refetched.type === 'oauth' && refetched.access === 'ACCESS-B' && refetched.refresh === 'REFRESH-B' && refetched.accountId === 'acct-1' && refetched.expires > before + 863_000_000 && refetched.expires <= before + 864_000_1000)
    const reRead = await refStore.read()
    check('rotating refresh overwrites document on disk', reRead.access === 'ACCESS-B' && reRead.refresh === 'REFRESH-B')
    check('rewritten document keeps {version:1, credential} shape', JSON.parse(readFileSync(refPath, 'utf8')).version === 1 && JSON.parse(readFileSync(refPath, 'utf8')).credential.refresh === 'REFRESH-B')
    check('refresh flow leaves no temp/lock residue', readdirSync(work).filter((name) => name.startsWith('ref.json') && name !== 'ref.json').length === 0)

    // 401 → REFRESH_FAILED 终态（EV-028：could-not-parse-token → 引导重登）。
    const failPath = join(work, 'fail.json')
    const failStore = new OauthCredentialStore(failPath)
    await failStore.write(staleCred)
    const failFetch = async () => ({ ok: false, status: 401, json: async () => ({ error: 'could-not-parse-token' }) })
    let refreshFailed = false
    let failMessage = ''
    try { await failStore.ensureFresh(staleCred, { fetchImpl: failFetch }) } catch (error) { refreshFailed = error.code === CREDENTIAL_ERROR_CODES.REFRESH_FAILED && error.status === 401; failMessage = error.message }
    check('refresh 401 throws REFRESH_FAILED terminal error', refreshFailed)
    check('401 message free of token values (P7)', !failMessage.includes('SECRET-ACCESS-XYZ') && !failMessage.includes('SECRET-REFRESH-ABC'))
    check('failed refresh leaves document untouched', (await failStore.read()).refresh === 'SECRET-REFRESH-ABC')
    await failStore.delete()

    // 网络错误（含底层消息意外携带 token）→ REFRESH_FAILED + safeMessage 脱敏。
    const netPath = join(work, 'net.json')
    const netStore = new OauthCredentialStore(netPath)
    await netStore.write(staleCred)
    const leakFetch = async () => { throw new Error('socket hang up after sending SECRET-REFRESH-ABC bytes') }
    let netFailed = false
    let netMessage = ''
    try { await netStore.ensureFresh(staleCred, { fetchImpl: leakFetch }) } catch (error) { netFailed = error.code === CREDENTIAL_ERROR_CODES.REFRESH_FAILED; netMessage = error.message }
    check('network error during refresh throws REFRESH_FAILED', netFailed)
    check('redaction scrubs token values out of diagnostics (safeMessage precedent)', netMessage.includes('[redacted]') && !netMessage.includes('SECRET-REFRESH-ABC') && !netMessage.includes('SECRET-ACCESS-XYZ'))
    await netStore.delete()

    // 畸形成功响应（缺 refresh_token）→ REFRESH_FAILED（rotating 语义不可放行）。
    const halfFetch = async () => ({ ok: true, status: 200, json: async () => ({ access_token: 'ACCESS-H', expires_in: 1000 }) })
    const halfStore = new OauthCredentialStore(join(work, 'half.json'))
    await halfStore.write(staleCred)
    let halfRejected = false
    try { await halfStore.ensureFresh(staleCred, { fetchImpl: halfFetch }) } catch (error) { halfRejected = error.code === CREDENTIAL_ERROR_CODES.REFRESH_FAILED }
    check('response missing refresh_token rejected (rotating overwrite is mandatory)', halfRejected)

    // ── F-01a（R2 P2）：refresh fetch 超时 → REFRESH_FAILED（timedOut 标记）+ 锁释放 ──
    console.log('refresh timeout (F-01a):')
    const tmoPath = join(work, 'tmo.json')
    const tmoStore = new OauthCredentialStore(tmoPath)
    await tmoStore.write(staleCred)
    let sawSignal = null
    const hangFetch = (url, init) => new Promise((_, reject) => {
      // 模拟 undici 行为：尊重 init.signal，超时中止时以错误 reject（永不 resolve）。
      sawSignal = init.signal
      init.signal.addEventListener('abort', () => reject(new Error('This operation was aborted')))
    })
    let tmoError = null
    try { await tmoStore.ensureFresh(staleCred, { fetchImpl: hangFetch, timeoutMs: 50 }) } catch (error) { tmoError = error }
    check('hanging refresh fails as REFRESH_FAILED with timedOut marker', !!tmoError && tmoError.code === CREDENTIAL_ERROR_CODES.REFRESH_FAILED && tmoError.timedOut === true)
    check('timeout message carries timeout marker without token values (P7)', !!tmoError && /timeout/i.test(tmoError.message) && !tmoError.message.includes('SECRET-ACCESS-XYZ') && !tmoError.message.includes('SECRET-REFRESH-ABC'))
    check('abort signal is wired into fetch init (cooperative cancellation)', sawSignal instanceof AbortSignal)
    check('lock released after refresh timeout', !readdirSync(work).some((name) => name === 'tmo.json.lock'))
    const tmoRetry = await tmoStore.ensureFresh(staleCred, { fetchImpl: async () => refreshOk('A11-new', 'R11-new', 864000) })
    check('follow-up ensureFresh proceeds immediately (no lock poisoning)', tmoRetry.access === 'A11-new')

    // ── R4-F1（Step 5 升格必闭）：headers 落定后 body 相位停滞（response.json()
    // 挂起）——超时 timer 覆盖须扩展至 payload 解析之后（abort 会 reject 进行中
    // 的 body 读取），否则 headers-后-stall 可持锁越窗触发陈旧接管重叠（并连带
    // 消解 R5-F3 同实例 lockToken 退化角）。注入 json 尊重 init.signal（协作式
    // 前提，同 hangFetch 模式）。
    console.log('refresh body-phase stall timeout (R4-F1):')
    const bjPath = join(work, 'bodyhang.json')
    const bjStore = new OauthCredentialStore(bjPath)
    await bjStore.write(staleCred)
    let bjSawSignal = null
    const stallJsonFetch = async (url, init) => ({
      ok: true,
      status: 200,
      json: () => new Promise((_, reject) => {
        // 模拟 undici：body 读取尊重 signal——停滞服务器形态下只有 abort 能终止。
        bjSawSignal = init.signal
        init.signal.addEventListener('abort', () => reject(new Error('body read aborted')))
      }),
    })
    let bjError = null
    let bjSettled = false
    // race 护栏：若超时未覆盖 body 相位（R4-F1 修复前形态），json() 永不落定——
    // 2s 后按未决判 FAIL，测试不得挂死。
    await Promise.race([
      bjStore.ensureFresh(staleCred, { fetchImpl: stallJsonFetch, timeoutMs: 60 }).then(
        () => { bjSettled = true },
        (error) => { bjSettled = true; bjError = error },
      ),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ])
    check('body-phase stall fails as REFRESH_FAILED with timedOut marker (R4-F1)', bjSettled && !!bjError && bjError.code === CREDENTIAL_ERROR_CODES.REFRESH_FAILED && bjError.timedOut === true)
    check('body-phase timeout message stays fixed-format and redacted (P7)', bjSettled && !!bjError && /timeout/i.test(bjError.message) && !bjError.message.includes('SECRET-ACCESS-XYZ') && !bjError.message.includes('SECRET-REFRESH-ABC'))
    check('body-phase stall still wires signal into fetch init', bjSawSignal instanceof AbortSignal)
    check('lock released after body-phase timeout', bjSettled && !readdirSync(work).some((name) => name === 'bodyhang.json.lock'))
    let bjRetry = null
    try { bjRetry = await bjStore.ensureFresh(staleCred, { fetchImpl: async () => refreshOk('A12-new', 'R12-new', 864000) }) } catch { bjRetry = null }
    check('follow-up ensureFresh proceeds after body-phase timeout', bjRetry?.access === 'A12-new')

    // ── 9. 并发：锁串行化 + 锁内重读 → fetch 恰一次（BC-E6 ③）──────────────
    console.log('concurrency & locking:')
    const concPath = join(work, 'conc.json')
    const concStore = new OauthCredentialStore(concPath)
    const concCred = { type: 'oauth', access: 'A9', refresh: 'R9', expires: Date.now() + 10_000, accountId: 'acct-9' }
    await concStore.write(concCred)
    let concCalls = 0
    const slowFetch = async () => {
      concCalls++
      await new Promise((resolve) => setTimeout(resolve, 80))
      return refreshOk('A9-new', 'R9-new', 864000)
    }
    const [first, second] = await Promise.all([
      concStore.ensureFresh(concCred, { fetchImpl: slowFetch }),
      concStore.ensureFresh(concCred, { fetchImpl: slowFetch }),
    ])
    check('concurrent ensureFresh refreshes exactly once (lock serializes)', concCalls === 1)
    check('both callers receive the refreshed credential', first.access === 'A9-new' && second.access === 'A9-new' && second.refresh === 'R9-new')
    check('concurrent refresh leaves single clean document', (await concStore.read()).refresh === 'R9-new' && readdirSync(work).filter((name) => name.startsWith('conc.json') && name !== 'conc.json').length === 0)

    // ── 10. 锁超时：外部长期持锁 → CREDENTIAL_LOCK_TIMEOUT（先于任何网络）──
    const lockPath = `${concPath}.lock`
    writeFileSync(lockPath, JSON.stringify({ pid: -1, at: Date.now() }))
    const staleAgain = { type: 'oauth', access: 'SECRET-ACCESS-XYZ', refresh: 'SECRET-REFRESH-ABC', expires: Date.now() + 5_000, accountId: 'a' }
    let lockTimeout = false
    let lockMessage = ''
    try {
      await concStore.ensureFresh(staleAgain, { fetchImpl: async () => { throw new Error('must not be called') }, lockTimeoutMs: 150 })
    } catch (error) { lockTimeout = error.code === CREDENTIAL_ERROR_CODES.CREDENTIAL_LOCK_TIMEOUT; lockMessage = error.message }
    check('externally held lock times out with CREDENTIAL_LOCK_TIMEOUT', lockTimeout)
    check('lock timeout fires before any network call / stays redacted', lockMessage !== '' && !lockMessage.includes('SECRET-ACCESS-XYZ') && !lockMessage.includes('SECRET-REFRESH-ABC'))
    unlinkSync(lockPath)

    // ── 锁陈旧接管：mtime 超窗（>30s）的死锁 → 接管后照常刷新 ──────────────
    const staleLockPath = `${concPath}.lock`
    writeFileSync(staleLockPath, JSON.stringify({ pid: -2, at: Date.now() }))
    const ancient = new Date(Date.now() - 120_000)
    utimesSync(staleLockPath, ancient, ancient)
    const takeoverCred = { type: 'oauth', access: 'A10', refresh: 'R10', expires: Date.now() + 5_000, accountId: 'acct-10' }
    await concStore.write(takeoverCred)
    let takeoverCalls = 0
    const takeoverOut = await concStore.ensureFresh(takeoverCred, {
      fetchImpl: async () => { takeoverCalls++; return refreshOk('A10-new', 'R10-new', 864000) },
    })
    check('stale lock is taken over and refresh proceeds', takeoverCalls === 1 && takeoverOut.access === 'A10-new')
    check('taken-over lock is released after use', !readdirSync(work).some((name) => name === 'conc.json.lock'))

    // ── F-01b（R2 P2）：锁所有权校验——接管后原持有者不误删继任者的锁 ──────────
    console.log('lock ownership (F-01b):')
    const ownPath = join(work, 'own.json')
    const ownStore = new OauthCredentialStore(ownPath)
    const ownCred = { type: 'oauth', access: 'A12', refresh: 'R12', expires: Date.now() + 10_000, accountId: 'acct-12' }
    await ownStore.write(ownCred)
    let takeoverInjected = false
    const successorMeta = JSON.stringify({ pid: process.pid, at: Date.now(), token: 'successor-instance-token' })
    const ownFetch = async () => {
      // 模拟刷新挂起期间锁被继任者接管：同 pid、不同 token（实例级令牌才检得出）。
      writeFileSync(`${ownPath}.lock`, successorMeta)
      takeoverInjected = true
      await new Promise((resolve) => setTimeout(resolve, 30))
      return refreshOk('A12-new', 'R12-new', 864000)
    }
    const ownOut = await ownStore.ensureFresh(ownCred, { fetchImpl: ownFetch })
    check('refresh completes under simulated takeover', takeoverInjected && ownOut.access === 'A12-new')
    const successorLock = readdirSync(work).some((name) => name === 'own.json.lock') ? readFileSync(`${ownPath}.lock`, 'utf8') : ''
    check('original holder keeps successor lock intact (token mismatch skips unlink)', successorLock === successorMeta)
    unlinkSync(`${ownPath}.lock`)

    // ── F-02（R2 P2）：锁元数据写失败 → 清理已创建锁文件（不留 ≤30s 毒化窗口）──
    console.log('lock meta failure cleanup (F-02):')
    const metaPath = join(work, 'metafail.json')
    const metaStore = new OauthCredentialStore(metaPath, { writeLockMeta: () => { throw new Error('simulated ENOSPC while writing lock metadata') } })
    const metaCred = { type: 'oauth', access: 'A13', refresh: 'R13', expires: Date.now() + 10_000, accountId: 'acct-13' }
    await metaStore.write(metaCred)
    let metaFetchCalls = 0
    let metaError = null
    try {
      await metaStore.ensureFresh(metaCred, { fetchImpl: async () => { metaFetchCalls++; return refreshOk('A13-new', 'R13-new', 864000) } })
    } catch (error) { metaError = error }
    check('lock meta write failure throws CREDENTIAL_FILE_UNWRITABLE', !!metaError && metaError.code === CREDENTIAL_ERROR_CODES.CREDENTIAL_FILE_UNWRITABLE)
    check('failed lock meta write cleaned the lock file before any network call', !readdirSync(work).some((name) => name === 'metafail.json.lock') && metaFetchCalls === 0)
    const metaRetry = await new OauthCredentialStore(metaPath).ensureFresh(metaCred, { fetchImpl: async () => refreshOk('A13-new', 'R13-new', 864000) })
    check('no poisoned window: immediate retry with a clean store succeeds', metaRetry.access === 'A13-new')

    // ── 12. 设备码流协议原语（EVO-005 / H3-11）───────────────────────────────
    // 端点形状依据 = .router-files/pi-ai-auth-oauth-openai-codex.js（roadmap
    // H3-11 引用源的一手快照，startOpenAICodexDeviceAuth :145-174 /
    // pollOpenAICodexDeviceAuth :175-227）：usercode JSON {client_id} →
    // {device_auth_id, user_code, interval}（interval 可为字符串）；轮询
    // JSON {device_auth_id, user_code} → 2xx {authorization_code,
    // code_verifier} / 403、404、error=deviceauth_authorization_pending =
    // pending / error=slow_down = 退避 / 其他 = 终态失败。
    console.log('device flow protocol primitives (EVO-005):')
    check('device exchange redirect uri matches pi-ai source fact', CHATGPT_PRESET.deviceUrls.exchangeRedirectUri === 'https://auth.openai.com/deviceauth/callback')
    check('device flow timeout is 15 minutes (H3-11)', DEVICE_FLOW_TIMEOUT_SECONDS === 900)
    {
      const { captured, fetchImpl } = makeCaptureFetch(() => ({ ok: true, json: async () => ({ device_auth_id: 'DAID-12', user_code: 'WDJB-MJHT', interval: 5 }) }))
      const started = await startDeviceAuthorization(fetchImpl)
      check('device usercode start returns normalized fields', started.deviceAuthId === 'DAID-12' && started.userCode === 'WDJB-MJHT' && started.intervalSeconds === 5)
      const init = captured[0].init
      const body = JSON.parse(String(init.body))
      check('device usercode posts JSON {client_id} to H3-11 endpoint', captured[0].url === CHATGPT_PRESET.deviceUrls.userCode && init.method === 'POST' && String(init.headers['content-type']) === 'application/json' && body.client_id === CHATGPT_PRESET.clientId)
    }
    {
      const { fetchImpl } = makeCaptureFetch(() => ({ ok: true, json: async () => ({ device_auth_id: 'd', user_code: 'u', interval: ' 7 ' }) }))
      check('device usercode normalizes string interval (pi-ai compat)', (await startDeviceAuthorization(fetchImpl)).intervalSeconds === 7)
    }
    {
      const { fetchImpl } = makeCaptureFetch(() => ({ ok: true, json: async () => ({ device_auth_id: 'd' }) }))
      let err = null
      try { await startDeviceAuthorization(fetchImpl) } catch (error) { err = error }
      check('device usercode rejects malformed response clearly', !!err && /device_auth_id|user_code|interval/.test(err.message))
    }
    {
      const { fetchImpl } = makeCaptureFetch(() => ({ ok: false, status: 404, text: async () => '' }))
      let err = null
      try { await startDeviceAuthorization(fetchImpl) } catch (error) { err = error }
      check('device usercode 404 means server disabled wording', !!err && err.message.includes('未启用'))
    }
    {
      let err = null
      try { await startDeviceAuthorization(async () => { throw new Error('ECONNRESET') }) } catch (error) { err = error }
      check('device usercode network failure errors clearly', !!err && err.message.includes('ECONNRESET'))
    }
    const pollWith = async (respond) => {
      const { captured, fetchImpl } = makeCaptureFetch(respond)
      const result = await pollDeviceAuthorizationToken({ deviceAuthId: 'DAID-9', userCode: 'CODE-9' }, fetchImpl)
      return { result, captured }
    }
    {
      const { result, captured } = await pollWith(() => ({ ok: true, json: async () => ({ authorization_code: 'AC-1', code_verifier: 'CV-1' }) }))
      const body = JSON.parse(String(captured[0].init.body))
      check('device poll 2xx complete carries code pair', result.status === 'complete' && result.authorizationCode === 'AC-1' && result.codeVerifier === 'CV-1')
      check('device poll posts JSON {device_auth_id, user_code} to H3-11 endpoint', captured[0].url === CHATGPT_PRESET.deviceUrls.token && body.device_auth_id === 'DAID-9' && body.user_code === 'CODE-9' && String(captured[0].init.headers['content-type']) === 'application/json')
    }
    {
      const { result } = await pollWith(() => ({ ok: true, json: async () => ({ foo: 1 }) }))
      check('device poll 2xx missing fields is terminal failed', result.status === 'failed' && !!result.message)
    }
    {
      const a = (await pollWith(() => ({ ok: false, status: 403 }))).result
      const b = (await pollWith(() => ({ ok: false, status: 404 }))).result
      const c = (await pollWith(() => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: 'deviceauth_authorization_pending' }) }))).result
      check('device poll maps 403/404/pending-code to pending', a.status === 'pending' && b.status === 'pending' && c.status === 'pending')
    }
    {
      const a = (await pollWith(() => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: 'slow_down' }) }))).result
      const b = (await pollWith(() => ({ ok: false, status: 429, text: async () => JSON.stringify({ error: { code: 'slow_down' } }) }))).result
      check('device poll maps slow_down in both error shapes', a.status === 'slow_down' && b.status === 'slow_down')
    }
    {
      const a = (await pollWith(() => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: { code: 'deviceauth_authorization_pending' } }) }))).result
      check('device poll maps object-shaped pending code', a.status === 'pending')
    }
    {
      const { result } = await pollWith(() => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: 'access_denied' }) }))
      check('device poll other error codes are terminal failed', result.status === 'failed' && !!result.message)
    }
    {
      const { result } = await pollWith(async () => { throw new Error('ECONNRESET') })
      check('device poll network error maps to failed (not throw)', result.status === 'failed' && result.message.includes('ECONNRESET'))
    }
    {
      const { result } = await pollWith(async () => { throw new Error('ECONNRESET') })
      check('device poll network error carries transport retry flag (F-2)', result.status === 'failed' && result.transport === true)
    }
    {
      const { result } = await pollWith(() => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: 'access_denied' }) }))
      check('device poll protocol rejection has no transport flag (F-2)', result.status === 'failed' && result.transport !== true)
    }

    // ── 11. resolveCredentialPath（F-01：credentialFile 回退默认路径）────────
    console.log('resolveCredentialPath (F-01):')
    const envDir = join(work, 'env-home')
    const custom = resolveCredentialPath({ credentialFile: 'X:\\custom\\cred.json' }, { env: {} })
    check('non-empty credentialFile used as-is', custom === 'X:\\custom\\cred.json')
    const viaEnv = resolveCredentialPath({ credentialFile: '' }, { env: { DSH_HOME: envDir } })
    check('empty credentialFile falls back to $DSH_HOME default', viaEnv === join(envDir, 'dsh-agent-router', 'chatgpt-codex-auth.json'))
    check('missing credentialFile key falls back the same way', resolveCredentialPath({}, { env: { DSH_HOME: envDir } }) === viaEnv)
    const viaHome = resolveCredentialPath(undefined, { env: {}, home: envDir })
    check('no DSH_HOME falls back to <home>/.dsh (EV-028)', viaHome === join(envDir, '.dsh', 'dsh-agent-router', 'chatgpt-codex-auth.json'))
    const injectedStore = new OauthCredentialStore(undefined, { env: { DSH_HOME: envDir } })
    check('store constructor default shares resolution with resolveCredentialPath', injectedStore.filename === viaEnv)
    check('defaultCredentialPath honours injected env (isolated from process.env)', defaultCredentialPath({ env: {} , home: envDir }) === viaHome && defaultCredentialPath({ env: { DSH_HOME: envDir } }) === viaEnv)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

// 独立入口：node tests/oauth-credentials.mjs（与 smoke 接线互补；exit 0/1）。
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  let failures = 0
  let passed = 0
  const check = (label, condition) => {
    if (condition) { passed++; console.log(`  ok  ${label}`) }
    else { failures++; console.error(`FAIL  ${label}`) }
  }
  await runOauthCredentialTests(check)
  console.log(failures === 0 ? `\nALL OAUTH CREDENTIAL TESTS PASSED (${passed} assertions)` : `\n${failures} FAILURES (${passed} passed)`)
  process.exit(failures === 0 ? 0 : 1)
}
