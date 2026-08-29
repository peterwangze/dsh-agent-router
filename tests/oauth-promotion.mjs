/**
 * EVO-006 GPT OAuth 通道转正判别测试（DEC-026 C2，2026-08-29 用户裁决）。
 *
 * 两组判别面：
 * - A 组「旧实验语义必败」：转正前实现（oauthExperimental/oauthTosAccepted
 *   schema 键 + begin/调用期门控）下本组断言必败——证明语义已移除；
 * - B 组「kill-switch 关闭能力保留」：三层语义重构为
 *   ① router.enabled 总开关（tests/routing-paths.mjs C13/D8b 既有断言看护——
 *   看护对象为 lib/tool.js 行为，勿按文件名找断言）② 账号级 enabled
 *   （本组判别——直连调用/发起授权两路）③ 登出删除（W-5 恒可用，
 *   不随任何开关失效）。重构后关闭能力必须真实存在，不得出现
 *   「开关废了、关不掉」的半转正态。
 *
 * 与 smoke.mjs 同构的独立入口：node tests/oauth-promotion.mjs（exit 0/1）；
 * 同时导出 runOauthPromotionTests(check) 供 smoke.mjs 接线。
 * 全部临时目录 + 注入 state——零网络、零真实环境触碰（纯仓内任务红线）。
 */
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { routerSchema } from '../lib/schemas.js'
import { RouterService } from '../lib/service.js'
import { OauthCredentialStore } from '../lib/oauth-credentials.js'

/** 伪造 JWT（header.payload.signature；payload 为 base64url JSON）。 */
function fakeJwt(accountId, sig) {
  const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ 'https://api.openai.com/auth': { chatgpt_account_id: accountId } })}.${sig}`
}

export async function runOauthPromotionTests(check) {
  // ── A 组：旧「实验默认关」语义必败（DEC-026 C2 转正判别）────────────────
  console.log('oauth promotion (EVO-006 / DEC-026 C2):')
  {
    // A1. schema 不再产出实验开关键——旧实现缺省产出 oauthExperimental=false
    //     + oauthTosAccepted=false，转正后两键废弃（判别：旧实现 in 判定必真 → 本断言必败）。
    const c = routerSchema({})
    check('promotion: oauthExperimental/oauthTosAccepted retired from schema (DEC-026 C2)', !('oauthExperimental' in c) && !('oauthTosAccepted' in c))
    // A2. 旧配置遗留键升级兼容：显式 oauthExperimental=false 不阻塞解析
    //     （schemastery 未知字段容忍——rollback-plan v0.3.0 L116 先例语义），
    //     转正语义优先于遗留值。
    //     判别性标注（R0 P3-e）：本断言「非判别——容忍性断言」（旧 schema
    //     合法接受两键，旧实现下亦通过），系升级兼容回归断言。事实注记：
    //     schemastery 对未知字段为透传（遗留键会出现在装配结果中，实测），
    //     故「遗留键不影响装配结果」形态的判别加强不可达；本面判别力由
    //     A1（schema 键移除）与 A3/A4（begin/调用期门控链移除）承担。
    let legacyOk = false
    try { routerSchema({ oauthExperimental: false, oauthTosAccepted: false }); legacyOk = true } catch { legacyOk = false }
    check('promotion: legacy gate keys tolerated as unknown fields (upgrade compat; non-discriminating tolerance assertion)', legacyOk)

    // A3/A4. 服务端门控链移除：state 完全不含实验键（转正自然态）时
    //     begin 直接产出授权 URL、凭据直接解析——旧实现分别在 begin 侧
    //     返回 ok:false「实验通路已关闭」、调用侧 throw 同文案 → 必败。
    const work = mkdtempSync(join(tmpdir(), 'router-promotion-'))
    try {
      const accessJwt = fakeJwt('acct-promotion', 'sig-promo')
      const credFile = join(work, 'promo-auth.json')
      const root = new Context()
      root.provide('credentials', { resolve: async () => undefined, set: async () => undefined, unset: async () => undefined })
      const state = {
        enabled: true,
        oauthAccounts: {
          cgpt: { name: 'ChatGPT', enabled: true, preset: 'chatgpt-codex', credentialFile: credFile, protocol: 'codex-responses', baseURL: 'https://chatgpt.com/backend-api', models: ['gpt-5.4-mini'] },
          off: { name: '已停用账号', enabled: false, preset: 'chatgpt-codex', credentialFile: join(work, 'off-auth.json'), protocol: 'codex-responses', models: ['m'] },
        },
        pools: { main: { name: '主池', enabled: true, strategy: 'healthy', accounts: ['cgpt', 'off'] } },
        agents: {
          cgptchat: { name: 'CGPT', type: 'chat', enabled: true, account: 'cgpt' },
          offchat: { name: 'OFF', type: 'chat', enabled: true, account: 'off' },
          poolchat: { name: '池', type: 'chat', enabled: true, account: 'pool:main' },
        },
      }
      const svc = new RouterService(root)
      svc.attach({ get: () => state })
      // 就绪 loopback 桩：begin 越过（已移除的）门控后直达授权 URL 生成分支。
      svc.codexLoopbackStarter = async () => ({ ready: true, port: 1455, dispose: () => {} })
      const begin = await svc.oauthBegin({ accountId: 'cgpt', redirectUri: 'https://ignored.example/cb' })
      check('promotion: preset begin proceeds without experimental gate keys', begin.ok === true && typeof begin.authUrl === 'string' && begin.authUrl.startsWith('https://auth.openai.com/oauth/authorize'))
      check('promotion: oauth events carry no experimental reasons (kill_switch/tos)', !svc.oauthEvents.some((event) => event.reason === 'kill_switch' || event.reason === 'tos'))
      // P2-b 判别补面（REL-004）：正常路径（启用账号 begin 成功）不产生
      // account_disabled 事件——防遥测过宽（把启用账号也记为停用拒绝）。
      check('promotion: enabled-account begin records no account_disabled telemetry (P2-b)', !svc.oauthEvents.some((event) => event.reason === 'account_disabled'))
      const seeded = new OauthCredentialStore(credFile)
      await seeded.write({ type: 'oauth', access: accessJwt, refresh: 'REFRESH-PROMO', expires: Date.now() + 3_600_000, accountId: 'acct-promotion' })
      const resolved = await svc.resolvePresetCredential(state.oauthAccounts.cgpt)
      check('promotion: call-side credential resolves without gate (fresh, zero network)', resolved.access === accessJwt && resolved.accountId === 'acct-promotion')
    } finally {
      try { rmSync(work, { recursive: true, force: true }) } catch { /* 清理尽力而为 */ }
    }
  }

  // ── B 组：kill-switch 关闭能力保留（三层重构后不得出现关不掉的通道）──────
  console.log('oauth promotion kill-switch retention (② account switch + ③ logout):')
  {
    const work = mkdtempSync(join(tmpdir(), 'router-promo-kill-'))
    try {
      const accessJwt = fakeJwt('acct-kill', 'sig-kill')
      const credFile = join(work, 'kill-auth.json')
      const root = new Context()
      root.provide('credentials', { resolve: async () => undefined, set: async () => undefined, unset: async () => undefined })
      const state = {
        enabled: true,
        oauthAccounts: {
          cgpt: { name: 'ChatGPT', enabled: true, preset: 'chatgpt-codex', credentialFile: credFile, protocol: 'codex-responses', baseURL: 'https://chatgpt.com/backend-api', models: ['gpt-5.4-mini'] },
        },
        pools: { main: { name: '主池', enabled: true, strategy: 'healthy', accounts: ['cgpt'] } },
        agents: {
          cgptchat: { name: 'CGPT', type: 'chat', enabled: true, account: 'cgpt' },
          poolchat: { name: '池', type: 'chat', enabled: true, account: 'pool:main' },
        },
      }
      const svc = new RouterService(root)
      svc.attach({ get: () => state })
      svc.codexLoopbackStarter = async () => ({ ready: true, port: 1455, dispose: () => {} })
      const seeded = new OauthCredentialStore(credFile)
      await seeded.write({ type: 'oauth', access: accessJwt, refresh: 'REFRESH-KILL', expires: Date.now() + 3_600_000, accountId: 'acct-kill' })

      // B1. ②层·直连调用：账号 enabled=false → 调用明确报错（P8 非沉默），
      //     凭据文件零触碰（不读不写——关闭态不得有副作用）。
      const bytesBefore = readFileSync(credFile)
      state.oauthAccounts.cgpt.enabled = false
      let callError = null
      try { await svc.run({ agentId: 'cgptchat', task: 'x' }) } catch (error) { callError = error }
      check('kill-switch ②: direct call rejects disabled account with clear error', !!callError && callError.message.includes('已停用'))
      check('kill-switch ②: disabled account call touches no credential bytes', bytesBefore.equals(readFileSync(credFile)))

      // B2. ②层·发起授权：停用账号不得发起新登录。
      //     telemetry 判别（REL-004 / R0 P2-b）：拒绝必须留痕——
      //     reason='account_disabled'（旧代码拒绝无事件 → 本断言先红；
      //     实验语义 reason kill_switch/tos 不复活，上行「零实验 reason」
      //     断言保持绿）。
      const beginOff = await svc.oauthBegin({ accountId: 'cgpt' })
      check('kill-switch ②: oauthBegin rejects disabled account', beginOff.ok === false && beginOff.message.includes('已停用'))
      check('kill-switch ②: disabled begin rejection records account_disabled telemetry (P2-b)', svc.oauthEvents.some((event) => event.kind === 'preset_begin_fail' && event.reason === 'account_disabled' && event.accountId === 'cgpt'))

      // B3. ②层·账号池：停用账号被候选过滤（既有语义回归看护）。
      const poolResolved = await svc.resolveAgent('poolchat')
      check('kill-switch ②: pool filters out disabled account (existing semantics)', poolResolved.candidates.length === 0 && typeof poolResolved.error === 'string')
      state.oauthAccounts.cgpt.enabled = true
      const poolResolvedBack = await svc.resolveAgent('poolchat')
      check('kill-switch ②: pool restores enabled account', poolResolvedBack.candidates.length === 1)

      // B4. ③层·登出删除恒可用：账号停用 + 总开关关闭双关闭态下，登出
      //     删除路径不受任何开关门控（W-5 合规删除路径，DEC-026 语义不变）。
      state.oauthAccounts.cgpt.enabled = false
      state.enabled = false
      const logout = await svc.oauthLogout({ accountId: 'cgpt' })
      check('kill-switch ③: logout deletion stays usable with every switch off (W-5)', logout.ok === true && !existsSync(credFile))
      state.enabled = true
    } finally {
      try { rmSync(work, { recursive: true, force: true }) } catch { /* 清理尽力而为 */ }
    }
  }
}

// 独立入口：node tests/oauth-promotion.mjs（与 smoke 接线互补；exit 0/1）。
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  let failures = 0
  let passed = 0
  const check = (label, condition) => {
    if (condition) { passed++; console.log(`  ok  ${label}`) }
    else { failures++; console.error(`FAIL  ${label}`) }
  }
  await runOauthPromotionTests(check)
  console.log(failures === 0 ? `\nALL OAUTH PROMOTION TESTS PASSED (${passed} assertions)` : `\n${failures} FAILURES (${passed} passed)`)
  process.exit(failures === 0 ? 0 : 1)
}
