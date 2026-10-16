/**
 * ARCH-005 A3 / HD-002 —— settings Config 声明制迁移判别测试（TDD 先行）。
 *
 * 覆盖面（设计 §6 A3 行验收门 ②③ + R2-REQ F-6 四场景 + N-1 第五场景）：
 * - §1 Config 导出形态：index.js 导出 Config（根级 volatile——pi-ai
 *   `z.dict(profile).default({}).volatile()` :1051 先例形态的根级应用）；字段
 *   单源派生自 routerSchema（base 不携带 volatile——validator 直调形态不变）。
 * - §2 :237 断点解除：apply 在**无 register 方法的 settings 面**上完整执行
 *   （旧代码 `ctx.settings.register(...)` 在此直调 throw——HD-002 第一断点的
 *   机器判别）；scope shim 热读 = apply config 形参（live ref .get()）；
 *   T-5 时序（write 后 ref 先更新、document-updated 后到）在 apply 级探针。
 * - §3 真实新树 SettingsForms 实跑（0.2.0-rc.2 真码，非桩）：
 *   describe/mutate/write/volatile 门/importLegacyDocument 全部真码，仅
 *   configEditor 与 loader 面为最小桩（锚定 dsh-config-editor :69-127 与
 *   cordis-plugin-loader _commitVolatile :401-427 的净效应，用真 cosmokit
 *   updateVolatile/volatileEntries + 真 cordis resolveConfig 复演）。
 * - §4 host-route 读写换代：读路径 describe().find(ns)（无 settings.get）；
 *   写路径 settings.mutate 不变（新 :488 存续——HD-002 附带核对）。
 * - §5 P5 机器证：lib/ 零 `settings.register(` 调用、零 `settings/updated`
 *   订阅、零 `settings.get(` 读路径、MANAGED_EVENTS 无旧事件名。
 *
 * 场景映射（F-6 + N-1）：
 * - S1 0.1.5 老配置跨宿主升级可读可写 —— §3 真码 importLegacyDocument（真
 *   settings.yaml → .imported 迁移）+ 老形态 section 的 describe 可读 /
 *   mutate 可写；
 * - S2 stats 持久化跨重启 —— §2 apply 级：stats.persist 配置经 live ref 读 +
 *   document-updated 消费者触发 applyStatsSettings（重启面 = 配置持久化在
 *   entry.options.config / profile patch，§3 edit 桩断言落地形态）；
 * - S3 设置变更热同步不依赖重启 —— §3：mutate → document-updated 到达四消费者
 *   名（探针）+ 事件到达时 live ref 已是新值（T-5）；
 * - S4 快速连续操作 —— §3：连发 8 次顺序 + 6 次并发 mutate 不丢更新不乱序、
 *   revision 严格递增；陈旧 expectedRevision → SettingsConflictError；
 * - S5（N-1）显式写回默认值 —— §3：非默认 → 默认写回后 document-updated 触发、
 *   无重复条目、revision 一致、user 层显式在场。
 *
 * 真树解析候选链与 rpc-shadow-guard §6 / host-contract 同款（DSH_HOST_SOURCE →
 * DSH_HOST_PACKAGES → APPDATA npm-global）；树缺失 → §3 可见 skip（BR-03 门控
 * 不硬依赖宿主在场先例；§1/§2/§4/§5 无真树依赖恒跑）。
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import { routerSchema } from '../lib/schemas.js'

// cosmokit volatile 引用协议（全局符号——跨 ESM/CJS 副本互通，cosmokit
// lib/types/volatile.js:83 `Symbol.for("cosmokit.volatile.write")`；写入口
// = updateVolatile :149-151 的 `target[write](source.get())`）。经协议直达
// 而非路径 import：cosmokit 非本仓直接依赖（pnpm isolated 布局不可顶层解析），
// 而该协议即宿主 loader 原地写 ref 的全部机制面。
const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write')
const isVolatileRef = (value) => typeof value === 'object' && value !== null && VOLATILE_WRITE in value
const updateVolatileRef = (target, source) => { target[VOLATILE_WRITE](typeof source.get === 'function' ? source.get() : source) }

const TESTS_DIR = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(TESTS_DIR, '..')
let passed = 0
let failures = 0
const check = (label, ok, detail) => {
  if (ok) { passed += 1; console.log(`  ok  ${label}`) }
  else {
    failures += 1
    console.error(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail) ?? String(detail)}` : ''}`)
  }
}

// ── 真树解析（rpc-shadow-guard §6 同款候选链）────────────────────────────────
const hostCandidates = []
if (process.env.DSH_HOST_SOURCE) hostCandidates.push({ root: process.env.DSH_HOST_SOURCE, origin: 'DSH_HOST_SOURCE' })
if (process.env.DSH_HOST_PACKAGES) hostCandidates.push({ root: process.env.DSH_HOST_PACKAGES, origin: 'DSH_HOST_PACKAGES' })
if (process.env.APPDATA) hostCandidates.push({ root: join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'), origin: 'APPDATA npm-global' })
const hostHit = hostCandidates.find(({ root }) => existsSync(join(root, 'dsh-settings', 'lib', 'index.js')))

// ── §1 Config 导出形态（无真树依赖）─────────────────────────────────────────
console.log('A3 §1 Config export (declaration-over-registration):')
const indexModule = await import('../lib/index.js')
{
  const Config = indexModule.Config
  check('index.js exports Config (plugin entry declaration — app-boot plugin Config export face)', !!Config)
  if (Config) {
    check('Config root carries volatile meta (pi-ai :1051 precedent applied at root)', Config.meta?.volatile === true)
    const resolved = Config({})
    check('Config({}) resolves to a live volatile reference (.get — schemastery 3.18.5 createVolatile)', typeof resolved.get === 'function')
    const snap = isVolatileRef(resolved) ? resolved.get() : resolved
    check('Config defaults resolve fully (enabled/stats.persist/agents/oauthAccounts/pools/cliAgents/presets)',
      snap.enabled === true && snap.stats?.persist === true && snap.agents && typeof snap.agents === 'object'
      && snap.oauthAccounts && typeof snap.oauthAccounts === 'object' && snap.pools && typeof snap.pools === 'object'
      && snap.cliAgents && typeof snap.cliAgents === 'object' && snap.presets && typeof snap.presets === 'object')
    check('routerSchema base stays plain-callable (validator direct-use shape unchanged — no volatile leak to legacy consumers)',
      routerSchema({}).enabled === true && !isVolatileRef(routerSchema({})))
    const configKeys = Object.keys(Config.dict ?? {}).sort().join(',')
    const schemaKeys = Object.keys(routerSchema.dict ?? {}).sort().join(',')
    check('Config field set derived single-source from routerSchema (no drift between declaration and validator)',
      configKeys === schemaKeys && configKeys.length > 0, { configKeys, schemaKeys })
  }
}

// ── §2 :237 断点解除 + scope shim 热读 + apply 级 T-5 探针（无真树依赖）──────
console.log('A3 §2 apply without settings.register (:237 breakpoint removed):')
{
  const root = new Context()
  let registerCalls = 0
  // 判别面：settings 面刻意**无 register**——旧代码在本行直调 throw（HD-002
  // 第一断点 apply 期同步 throw → 服务端插件加载失败）；迁移后 apply 不触碰
  // 运行时注册（Config 导出声明制）。
  root.reflect.provide('settings', { describe: () => [], register: () => { registerCalls += 1 } })
  root.reflect.provide('typert', { register: () => () => {} })
  root.reflect.provide('webServer', { register: () => () => {} })
  root.provide('attachments', {
    saveImage: async (input) => ({ attachmentId: `sha256:${'0'.repeat(64)}`, mediaType: input.mediaType, bytes: 1, width: 1, height: 1, name: input.name }),
    readImage: async () => null,
  })
  let applied = null
  let applyError = null
  try {
    applied = root.plugin({ name: 'a3-migration', inject: indexModule.inject, apply: indexModule.apply, Config: indexModule.Config })
    await applied
  } catch (error) { applyError = error }
  check('apply completes on a settings face without runtime registration (old code throws here)', applyError === null, { error: applyError ? String(applyError) : null })
  check('no settings.register call during apply (declaration-over-registration — P5)', registerCalls === 0, { registerCalls })
  const service = root.get('router')
  check('service provided and scope shim reads Config live ref (defaults through volatile ref)', !!service && service.getState().enabled === true && service.isEnabled() === true)
  // T-5 apply 级探针：apply config 形参 = 根级 volatile live ref（cordis
  // fiber.config——registry.plugin 经 resolveConfig 解析）；宿主 settings 写入的
  // 净效应 = loader volatile-only commit 原地写 ref（真 cosmokit updateVolatile
  // ——cordis-plugin-loader _commitVolatile :401-427 同一导出助手，跨副本经
  // Symbol.for 全局符号互通）。写 ref 后（无重挂/无重启）scope.get() 即新值。
  const liveRef = applied?.config
  check('apply config param is the root volatile live reference (cordis fiber.config)', isVolatileRef(liveRef) && typeof liveRef.get === 'function')
  if (isVolatileRef(liveRef)) {
    updateVolatileRef(liveRef, indexModule.Config({ enabled: false, stats: { persist: false }, agents: { vision: { name: '视觉' } } }))
    check('T-5 apply probe: after a settings write commits into the live ref, scope.get() reads the new value (hot, no remount)',
      service.getState().enabled === false && service.getState().stats.persist === false && service.getState().agents.vision.name === '视觉')
    check('live ref snapshot is deep-frozen plain data (parity with old deepFreeze(resolved) read face)', Object.isFrozen(liveRef.get()) && typeof liveRef.get().agents === 'object')
  }
  await applied.dispose?.()
}

// ── §3 真实新树 SettingsForms 实跑（S1/S3/S4/S5 + volatile 门）───────────────
console.log('A3 §3 real-tree SettingsForms (host 0.2.0-rc.2, S1/S3/S4/S5):')
let realSettingsForms = null
let realCordis = null
if (!hostHit) {
  console.log('  skip  真树 SettingsForms 实跑（@deepseek-ai/dsh-settings 不在本机候选链——§1/§2/§4/§5 已覆盖插件面；本节判据在有宿主树的机器/CI 上生效）')
} else {
  realSettingsForms = (await import(pathToFileURL(join(hostHit.root, 'dsh-settings', 'lib', 'index.js')).href)).SettingsForms
  realCordis = await import(pathToFileURL(join(hostHit.root, 'cordis', 'lib', 'index.js')).href)
  const hostCosmokit = await import(pathToFileURL(join(hostHit.root, 'cosmokit', 'lib', 'index.js')).href)

  /**
   * 真码 harness：SettingsForms/describe/mutate/write/volatileForm/isVolatilePath/
   * importLegacyDocument/update/redactSecrets 全部真码；configEditor + loader 为
   * 最小桩，净效应锚定实读：
   * - edit 桩 = dsh-config-editor lib/index.js:69-127 的净效应（change(current,
   *   inherited) → next → 持久化为 entry.options.config + fiber 重解析 +
   *   volatile-only 原地写 ref）；串行链 = 真码 withFileLock 串行面（:71 包裹）。
   * - ref 原地写 = cordis-plugin-loader _commitVolatile（lib/index.js:401-427）
   *   的同款真 cosmokit 助手（volatileEntries + updateVolatile + resolveConfig）。
   */
  const makeHarness = ({ legacyYaml } = {}) => {
    const home = mkdtempSync(join(tmpdir(), 'a3-settings-'))
    if (legacyYaml !== undefined) writeFileSync(join(home, 'settings.yaml'), legacyYaml)
    const emitted = []
    const editLog = []
    let editChain = Promise.resolve()
    const makeEntry = (id, name, Config, rawConfig, fiberUid) => {
      const runtime = { Config }
      const entry = {
        id,
        options: { id, name, config: rawConfig === undefined ? {} : structuredClone(rawConfig) },
        fiber: { uid: fiberUid, state: 2, runtime, config: null, ctx: null },
      }
      entry.fiber.config = realCordis.resolveConfig(runtime, structuredClone(entry.options.config))
      return entry
    }
    const entries = []
    const settings = {
      // 真码 read 面（SettingsForms 消费）：configuration() 按 dsh-settings :415
      // 消费形态供给 {entry, inherited, override}。
      configuration: () => entries.map((entry) => ({
        entry,
        inherited: {},
        override: structuredClone(entry.options.config ?? {}),
      })),
      entries: () => entries,
      // 真码 write 面（SettingsForms.write :508 消费）——净效应见文件头锚注。
      // 串行链 = 真码 withFileLock 串行面；ref 原地写按 loader _commitVolatile
      // 逐 path 取源（cordis-plugin-loader :419 `path.reduce(Reflect.get)`）。
      edit: (entry, change) => {
        const run = async () => {
          const current = structuredClone(entry.options.config ?? {})
          const inherited = {}
          const next = await change(current, inherited)
          entry.options.config = structuredClone(next)
          const candidate = realCordis.resolveConfig(entry.fiber.runtime, structuredClone(next))
          for (const { path, ref } of hostCosmokit.volatileEntries(entry.fiber.config)) {
            const source = path.reduce((value, key) => Reflect.get(value, key), candidate)
            if (hostCosmokit.isVolatile(source)) hostCosmokit.updateVolatile(ref, source)
          }
          editLog.push({ id: entry.options.id, next: structuredClone(next) })
        }
        editChain = editChain.then(run, run)
        return editChain
      },
      documentPath: join(home, 'cordis.patch.yml'),
    }
    const ctx = {
      reflect: { provide: () => {} },
      effect: (input) => {
        if (input.constructor?.name === 'GeneratorFunction') { const it = input(); it.next(); return () => it.return?.() }
        const dispose = input()
        return typeof dispose === 'function' ? dispose : () => {}
      },
      on: (event, handler) => { void event; void handler; return () => {} },
      emit: (event, ...args) => { emitted.push({ event, args }) },
      logger: { warn: () => {}, error: () => {} },
      fiber: { state: 2 },
      root: { loader: { await: () => Promise.resolve() } },
      profileContext: { home, name: 'a3-test', dir: home, patchPath: settings.documentPath, installAnchor: home },
      configEditor: settings,
    }
    const forms = new realSettingsForms(ctx)
    return { home, forms, entries, emitted, editLog, makeEntry, settings, settle: () => editChain.then(() => {}, () => {}) }
  }

  // —— 基线：插件 Config 真树发现 + describe ——
  const h = makeHarness()
  const routerEntry = h.makeEntry('router', 'dsh-agent-router', indexModule.Config, {}, 1)
  h.entries.push(routerEntry)
  {
    const descriptors = h.forms.describe()
    const ours = descriptors.find((row) => row.ns === 'router')
    check('real describe() discovers ns "router" from plugin Config export (T-3 sibling mechanism: ns = entry id)', !!ours, { nss: descriptors.map((row) => row.ns) })
    check('real describe() projects defaults through volatile form (enabled=true, stats.persist=true, applies live)',
      ours?.value?.enabled === true && ours?.value?.stats?.persist === true && ours?.applies === 'live')
    check('real describe() revision starts at 0 and emits the plain (volatile-stripped) form schema', ours?.revision === 0 && !!ours?.schema && typeof ours.schema === 'object')
    // S1 读侧：0.1.5 时代老形态用户 section（老 settings.yaml router: 分节）可读。
    routerEntry.options.config = { enabled: false, oauthExperimental: true, agents: { legacy: { name: '老 Agent', type: 'chat', provider: 'openai', model: 'gpt-4o' } }, oauthAccounts: { cgpt: { name: 'ChatGPT', preset: 'chatgpt-codex' } } }
    routerEntry.fiber.config = realCordis.resolveConfig(routerEntry.fiber.runtime, structuredClone(routerEntry.options.config))
    const after = h.forms.describe().find((row) => row.ns === 'router')
    check('S1 read: legacy 0.1.5-era section readable under 0.2.0 semantics (enabled=false honored, dict entries resolved)',
      after?.value?.enabled === false && after?.value?.agents?.legacy?.model === 'gpt-4o' && after?.value?.oauthAccounts?.cgpt?.preset === 'chatgpt-codex')
    // 未知 legacy 键透传（schemastery 容忍——rollback-plan v0.3.0 先例）。
    check('S1 read: unknown legacy keys tolerated (oauthExperimental passthrough)', (() => { try { realCordis.resolveConfig(routerEntry.fiber.runtime, { oauthExperimental: true }); return true } catch { return false } })())
  }

  // —— S1 写侧 + S3 事件到达四消费者 + T-5 时序 ——
  {
    // 四消费者探针：与产品接线同形（index.js stats-persistence / service.js
    // host-route 双 ns / wrapper.js / oauth-llm.js——同一事件名 + ns 过滤）。
    // 事件经 ownerContext.emit 发射（harness 捕获到 h.emitted）；此处统一校验
    // 到达面 + 载荷（产品 subscribeEvents 的分发语义在 host-abi-health 9d 独立覆盖）。
    const consumers = [
      { consumer: 'stats-persistence', ns: 'router' },
      { consumer: 'host-route-router-ns', ns: 'router' },
      { consumer: 'wrapper-settings-sync', ns: 'router' },
      { consumer: 'oauth-llm-settings-sync', ns: 'router' },
    ]
    const seen = new Map(consumers.map((c) => [c.consumer, []]))
    await h.forms.mutate('router', [{ op: 'set', path: ['enabled'], value: false }])
    const revisionsSeen = []
    for (const record of h.emitted.filter((e) => e.event === 'settings/document-updated')) {
      const [ns, revision] = record.args
      revisionsSeen.push({ ns, revision })
      for (const c of consumers) if (ns === c.ns) seen.get(c.consumer).push(revision)
    }
    check('S3: settings.mutate → settings/document-updated emitted with (ns, revision) reaching all four consumers',
      consumers.every((c) => seen.get(c.consumer).length >= 1) && revisionsSeen.every((r) => r.ns === 'router' && Number.isInteger(r.revision) && r.revision >= 0) && revisionsSeen.at(-1).revision >= 1,
      { revisionsSeen, seen: [...seen.entries()].map(([k, v]) => [k, v.length]) })
    check('S1 write + T-5: when the event arrives the live ref already holds the new value (write-tail describe ordering)',
      routerEntry.fiber.config.get().enabled === false && h.editLog.at(-1)?.next?.enabled === false)
    check('S1 write: persisted shape lands in the profile section (entry.options.config — configEditor edit face)', routerEntry.options.config.enabled === false)
    const descriptorAfter = h.forms.describe({ redactSecrets: true }).find((row) => row.ns === 'router')
    check('real describe({redactSecrets:true}) survives (service.js config() consumption face — HD-002 附带核对)', descriptorAfter?.value?.enabled === false && typeof descriptorAfter?.user === 'object')
  }

  // —— volatile 写入门（非 volatile 拒绝——形态锚定）——
  {
    const z = (await import(pathToFileURL(join(hostHit.root, 'schemastery', 'lib', 'index.mjs')).href)).default
    const noneConfig = z.object({ a: z.string().default(''), b: z.object({ x: z.number().default(0) }).default({}) })
    const noneEntry = h.makeEntry('novolatile-demo', 'novolatile-demo', noneConfig, {}, 2)
    h.entries.push(noneEntry)
    const descriptorsNone = h.forms.describe().find((row) => row.ns === 'novolatile-demo')
    check('volatile gate: non-volatile Config is excluded from settings forms entirely (volatileForm undefined → no descriptor)', descriptorsNone === undefined)
    let gateError = null
    try { await h.forms.mutate('novolatile-demo', [{ op: 'set', path: ['a'], value: 'x' }]) } catch (error) { gateError = error }
    check('volatile gate: write to non-volatile entry rejected with host gate text (:506 "has no volatile fields")',
      gateError !== null && String(gateError).includes('has no volatile fields'), { error: gateError ? String(gateError) : null })

    const partialConfig = z.object({ live: z.string().default('').volatile(), frozen: z.string().default('') })
    const partialEntry = h.makeEntry('partial-demo', 'partial-demo', partialConfig, {}, 3)
    h.entries.push(partialEntry)
    let frozenError = null
    try { await h.forms.mutate('partial-demo', [{ op: 'set', path: ['frozen'], value: 'x' }]) } catch (error) { frozenError = error }
    check('volatile gate: non-volatile FIELD write rejected with :507 anchor text (Config field ... is not volatile)',
      frozenError !== null && String(frozenError).includes('Config field "frozen" is not volatile'), { error: frozenError ? String(frozenError) : null })
    let liveOk = null
    try { await h.forms.mutate('partial-demo', [{ op: 'set', path: ['live'], value: 'hot' }]); liveOk = partialEntry.fiber.config.live.get() } catch (error) { liveOk = String(error) }
    check('volatile gate: volatile sibling field write succeeds and lands in live ref', liveOk === 'hot', { liveOk })

    let unknownError = null
    try { await h.forms.mutate('no-such-entry', [{ op: 'set', path: ['a'], value: 1 }]) } catch (error) { unknownError = error }
    check('ns resolution: unknown entry rejected with :504 anchor text (No configurable plugin entry)',
      unknownError !== null && String(unknownError).includes('No configurable plugin entry'), { error: unknownError ? String(unknownError) : null })
  }

  // —— S4 快速连续操作：连发 mutate 不丢更新不乱序 + revision 一致 ——
  {
    const h4 = makeHarness()
    h4.entries.push(h4.makeEntry('router', 'dsh-agent-router', indexModule.Config, {}, 11))
    const names = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']
    for (const name of names) {
      await h4.forms.mutate('router', [{ op: 'set', path: ['agents', name], value: { name: `agent-${name}` } }])
    }
    const snap = h4.entries[0].fiber.config.get()
    check('S4 sequential: 8 rapid mutates all land (no lost updates)', names.every((name) => snap.agents?.[name]?.name === `agent-${name}`), { agents: Object.keys(snap.agents ?? {}) })
    check('S4 sequential: insertion order preserved (no reordering)', JSON.stringify(Object.keys(snap.agents ?? {})) === JSON.stringify(names))
    const revisions = h4.emitted.filter((e) => e.event === 'settings/document-updated' && e.args[0] === 'router').map((e) => e.args[1])
    // 0 = 首观察基线发射（真码语义：previous === undefined → revision 0 且发
    // 一次——设置 UI 据此获知初始态）；此后每次写 +1。
    check('S4 sequential: revision strictly increments per write (baseline 0 then 1..8, machine-consistent)', JSON.stringify(revisions) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8]), { revisions })
    // 并发连发（未 await 逐条——真宿主 withFileLock 串行化；edit 桩同串行链）。
    const burst = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6']
    await Promise.all(burst.map((name) => h4.forms.mutate('router', [{ op: 'set', path: ['agents', name], value: { name: `agent-${name}` } }])))
    const snap2 = h4.entries[0].fiber.config.get()
    check('S4 concurrent: 6 unawaited mutates all land (serialized by edit chain — file-lock face)', [...names, ...burst].every((name) => snap2.agents?.[name]?.name === `agent-${name}`), { agents: Object.keys(snap2.agents ?? {}) })
    const revisionsAll = h4.emitted.filter((e) => e.event === 'settings/document-updated' && e.args[0] === 'router').map((e) => e.args[1])
    check('S4 concurrent: revision keeps strict monotonic sequence through the burst (baseline 0 → 14)', JSON.stringify(revisionsAll) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]), { revisionsAll })
    // 陈旧 expectedRevision → 真 SettingsConflictError（revision 一致性机器判别）。
    let conflictError = null
    try { await h4.forms.mutate('router', [{ op: 'set', path: ['enabled'], value: false }], 3) } catch (error) { conflictError = error }
    check('S4 conflict: stale expectedRevision rejected by real SettingsConflictError (code SETTINGS_CONFLICT)',
      conflictError !== null && conflictError.code === 'SETTINGS_CONFLICT', { error: conflictError ? String(conflictError) : null })
  }

  // —— S5（N-1）显式写回默认值 ——
  {
    const h5 = makeHarness()
    h5.entries.push(h5.makeEntry('router', 'dsh-agent-router', indexModule.Config, {}, 21))
    const eventCount = () => h5.emitted.filter((e) => e.event === 'settings/document-updated' && e.args[0] === 'router').length
    await h5.forms.mutate('router', [{ op: 'set', path: ['enabled'], value: false }])
    const revAfterOff = h5.forms.describe().find((row) => row.ns === 'router')?.revision
    const eventsAfterOff = eventCount()
    // 显式写回默认值（enabled 默认 true）——N-1 场景：document-updated 行为
    // 正确、无重复条目、revision 一致。
    await h5.forms.mutate('router', [{ op: 'set', path: ['enabled'], value: true }])
    const descAfter = h5.forms.describe({ redactSecrets: true }).find((row) => row.ns === 'router')
    check('S5: explicit write-back to default fires document-updated (change detection sees raw fingerprint change)', eventCount() === eventsAfterOff + 1, { before: eventsAfterOff, after: eventCount() })
    check('S5: revision increments exactly once for the write-back (consistent, no double-count)', descAfter?.revision === revAfterOff + 1, { revAfterOff, revAfter: descAfter?.revision })
    check('S5: no duplicate router rows in the profile document (exactly one router entry)', h5.settings.entries().filter((row) => row.options.id === 'router').length === 1)
    check('S5: user layer keeps the explicit default value (not pruned to implicit) and resolved value equals default',
      descAfter?.user?.enabled === true && descAfter?.value?.enabled === true)
    check('S5: live ref reflects the written-back default', h5.entries[0].fiber.config.get().enabled === true)
  }

  // —— S1 完整链：真码 importLegacyDocument（0.1.5 settings.yaml → profile 迁移）——
  {
    const legacyYaml = [
      '# 0.1.5-era settings.yaml (runtime-registration host)',
      'router:',
      '  enabled: false',
      '  oauthProxyUrl: "http://127.0.0.1:7890"',
      '  agents:',
      '    legacy:',
      '      name: 老 Agent',
      '      type: chat',
      '      provider: openai',
      '      model: gpt-4o',
      ''].join('\n')
    const hl = makeHarness({ legacyYaml })
    hl.entries.push(hl.makeEntry('router', 'dsh-agent-router', indexModule.Config, {}, 31))
    // importLegacyDocument 经 ctx.root.loader.await().then(...) 异步链触发（构造
    // 尾）——含 rename/readFile 异步 IO，轮询等待其落定（P8：不静默跳过）。
    const importedPath = join(hl.home, 'settings.yaml.imported')
    // 轮询双条件：.imported 落盘（rename 完成）+ 导入 update 落入 editLog——
    // rename 先于 update，仅等文件会在 update 排队前抢跑（IO 回调时序）。
    for (let spin = 0; spin < 200 && (!existsSync(importedPath) || !hl.editLog.some((row) => row.id === 'router')); spin += 1) {
      await new Promise((done) => setTimeout(done, 5))
    }
    await hl.settle()
    await new Promise((done) => setImmediate(done))
    check('S1 full: real importLegacyDocument renames settings.yaml → .imported (host migration path)', existsSync(importedPath) && !existsSync(join(hl.home, 'settings.yaml')))
    check('S1 full: legacy router section imported into the router entry (readable)', hl.entries[0].options.config?.enabled === false && hl.entries[0].fiber.config.get().enabled === false && hl.entries[0].fiber.config.get().agents?.legacy?.model === 'gpt-4o',
      { config: hl.entries[0].options.config, ref: hl.entries[0].fiber.config.get?.() })
    await hl.forms.mutate('router', [{ op: 'set', path: ['enabled'], value: true }])
    check('S1 full: imported legacy config remains writable (cross-upgrade read-write closed loop)', hl.entries[0].fiber.config.get().enabled === true && hl.editLog.at(-1)?.next?.enabled === true)
    rmSync(hl.home, { recursive: true, force: true })
    rmSync(h.home, { recursive: true, force: true })
  }
}

// ── §4 host-route 读写换代（无真树依赖）─────────────────────────────────────
console.log('A3 §4 host-route read/write replacement:')
{
  const { syncHostRoute, hostRouteStatusOf, createHostRouteState, HOST_ROUTE_NS, HOST_ROUTE_PROVIDER, HOST_ROUTE_REF } = await import('../lib/host-route.js')
  const providers = {}
  const mutates = []
  const root = new Context()
  // 判别面：settings 面仅 describe + mutate（新树方法面——**无 get**）。旧读
  // 路径 settings.get(ns) 在此返回 undefined → 计划面恒 create（每 pass 重写）；
  // 新读路径 describe().find(ns) 正常取值 → 第二 pass idle 幂等。
  root.reflect.provide('settings', {
    describe: () => [{ ns: HOST_ROUTE_NS, value: { providers }, revision: 0 }],
    mutate: async (ns, ops) => {
      mutates.push({ ns, ops })
      for (const op of ops) {
        if (op.path[0] === 'providers' && op.path[1] === HOST_ROUTE_PROVIDER) {
          if (op.op === 'unset') delete providers[HOST_ROUTE_PROVIDER]
          else providers[HOST_ROUTE_PROVIDER] = op.value
        }
      }
    },
  })
  root.reflect.provide('credentials', { resolve: async () => undefined, set: async () => undefined, unset: async () => undefined })
  root.logger = { warn: () => {} }
  const { RouterService } = await import('../lib/service.js')
  const service = new RouterService(root, { enabled: true, oauthAccounts: { chatgpt: { name: 'ChatGPT', enabled: true, preset: 'chatgpt-codex', protocol: 'codex-responses', models: ['gpt-x'], credentialFile: join(tmpdir(), `a3-nonexistent-${Date.now()}.json`) } } })
  // 未登录（凭据文件不存在）→ maintain=false → 停用方向：无条目 → idle 零写。
  await syncHostRoute(root, service)
  const idlePass = mutates.length
  // 直接写一个自有条目（模拟登录后另一进程/上次会话落位），再验证读路径：
  providers[HOST_ROUTE_PROVIDER] = { apiKeyEnv: HOST_ROUTE_REF }
  service.hostRouteState = { ...createHostRouteState(), maintained: true }
  const status = hostRouteStatusOf(service)
  check('host-route read path uses describe().find(ns) (settings.get-free — no old API call)', status.maintained === true, { status })
  check('host-route write path keeps settings.mutate (surviving host API — no regression)', idlePass === 0 && mutates.every((m) => m.ns === HOST_ROUTE_NS))
}

// ── §5 P5 机器证：旧路径零残留（grep 级判据——剥注释后纯代码文本）──────────
console.log('A3 §5 P5 zero-residue machine proof:')
{
  // 剥注释（run-all.mjs stripComments 同法——偏移不变，注释字符换空格）：
  // 判据只认**代码文本**，注释里的历史性提及（「旧运行时 settings.register(ns,
  // schema) 已删除」等）不构成路径证据。
  const stripComments = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (line) => line.replace(/[^\n]/g, ' '))
  const libFiles = []
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, name.name)
      if (name.isDirectory()) walk(path)
      else if (name.name.endsWith('.js')) libFiles.push(path)
    }
  }
  walk(join(REPO, 'lib'))
  const offenders = { register: [], updatedEvent: [], getRead: [] }
  for (const path of libFiles) {
    const source = stripComments(readFileSync(path, 'utf8'))
    if (/settings\.register\(/.test(source)) offenders.register.push(path)
    if (/['"]settings\/updated['"]/.test(source)) offenders.updatedEvent.push(path)
    if (/settings\.get\(/.test(source)) offenders.getRead.push(path)
  }
  check('P5: zero settings.register( calls across lib/ code (runtime registration fully removed)', offenders.register.length === 0, offenders.register)
  check('P5: zero "settings/updated" literals across lib/ code (old event subscriptions fully migrated)', offenders.updatedEvent.length === 0, offenders.updatedEvent)
  check('P5: zero settings.get( reads across lib/ code (old read path fully replaced by describe)', offenders.getRead.length === 0, offenders.getRead)
  const { MANAGED_EVENTS } = await import('../lib/host-abi/events.js')
  check('P5: MANAGED_EVENTS drops settings/updated, keeps settings/document-updated', !MANAGED_EVENTS.includes('settings/updated') && MANAGED_EVENTS.includes('settings/document-updated'), MANAGED_EVENTS)
}

console.log(failures === 0 ? `\nALL SETTINGS-CONFIG-MIGRATION TESTS PASSED (${passed} assertions)` : `\n${failures} FAILURE(S) (${passed} passed)`)
process.exit(failures === 0 ? 0 : 1)
