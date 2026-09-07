/**
 * FIX-031 判别组：统计归因单点化 + 路由透明性（DEC-029 不变量验收北极星）。
 *
 * 四缺陷（EV-162 机器实证）逐组判别，每组给出「旧实现必败」的可归因断言：
 *  A 组 D1 账号伪实体——包装路由键 `<account>-router` 不得成为独立账号实体；
 *  B 组 D2 内部键外显——'twin' / 'oauth:' / '-router' / 'chatgpt-oauth' / 裸
 *    'main' agentId 不得出现在任何统计可见面（snapshot 字段值 + 导出 CSV 列值）；
 *  C 组 D3 零覆盖——call 行记录是站点自愿，非包装 provider 的请求必须有账号级
 *    计数（计数权威 = scope 行，每请求恰好一条）；
 *  D 组 双权威源去重——同一请求双产（twin 流既有 scope 行又有 call 行）时计数
 *    只取 scope 侧，call 行只贡献 token 级字段；非双产通路不得被吞并；
 *  E 组 兼容与读侧迁移——历史落盘行（v1 'twin'/'-router' + v2 scope）load 时同
 *    过归一化，且归一化 MUST NOT 改写盘面观测值；
 *  F 组 白盒兼容——聚合内部键命名空间保留（service.accountHealth 的
 *    `accountTotals.get('oauth:'+accountId)` 寻址不回归）；
 *  G 组 归一化实现全仓唯一（P5）+ 双面 parity（P-v3 原则 9）；
 *  H 组 装配点源码契约——旧显示回退形态不得复活（FIX-029 C 组先例）。
 *
 * 期望词汇（'-router' / 'main-model'）在本文件自定义字面量，不从被测模块反读——
 * 判别断言不得依赖实现自证；旧实现同样能跑本文件并给出逐组可归因的 RED 清单
 * （stash 法实证：46 FAIL / 9 PASS，归档 EV-163），而不是在 ESM 链接期整体崩掉。
 *
 * 纪律（acceptance 7）：全部夹具走 mkdtempSync 临时目录 / 内存 StatsStore——零读取
 * 用户真实环境（不触碰 $HOME/.dsh 任何数据）。fixture 老数据行形状先由真实 store
 * 落盘取形状再手写（P10④：禁止按心智模型造面形态）。
 *
 * 返工批（REVIEW-FIX-031-R0 保留项 F-1）：跨 UTC 午夜双计 → 记录站点统一补
 * at: startedAt（D9 真实 wrapper 位点跨午夜驱动 + D9b 合并断言 + D9c 旧形态
 * 对照组 + D10/D11 源码契约；旧代码 stash 复跑 D9/D9b/D10/D11 必红）。
 * 返工批（REVIEW-FIX-031-R0 保留项 F-2）：注释虚指 → G13/G14 权威常量值级
 * 交叉锚定（ACCOUNT_KEY_ALIASES ↔ oauth-llm.js OAUTH_PROVIDER；
 * HOST_ROUTE_ACCOUNT_KEY ↔ host-route.js HOST_ROUTE_PROVIDER）。
 * 返工批 3（用户复验 D5/D6 + 追问 D7）：D6 宿主官方路由归并到路由选中
 * 订阅账号（resolver 注入，D12/D12b/D12c 含动态失效回落）；D5 roster 行
 * 排除宿主路由键 + 身份去重跨 accountKind（D13/D13b，回落诚实标签 D13c/e、
 * 纯函数非法 resolver 全形态 D14/D14b）；D7 账号级计数解除 preset 门控
 * （D15/D15b/D15c 账号视图 + 盘面/导出兼容；D16/D16b 预设视图分流 + 站点
 * 门控解除源码契约）。
 * 微批 4（R2 保留项 N1）：D12d 宿主路由 **scope 行**（D6 生产主路径——插件
 * 在宿主路由通路无 call 记录位点）全链判别 + resolver 未激活回落对照。
 * @module dsh-agent-router/tests/fix-031-attribution
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as statsModule from '../lib/stats.js'
import { createWrapAdapter } from '../lib/wrapper.js'

const { StatsStore, LINE_VERSION } = statsModule

/** 期望词汇——判别断言自持，不从被测实现反读。 */
const WRAP_ROUTE_SUFFIX = '-router'
const MAIN_MODEL_AGENT_ID = 'main-model'

const DAY = 86_400_000
/** 固定参照时刻（UTC 2026-09-06 12:00——EV-162 报障当日）。 */
const T0 = Date.UTC(2026, 8, 6, 12, 0, 0)
const D0 = '2026-09-06'
const NOW_AT = () => T0 + DAY

/** DEC-029② 禁用可见值（子串级）；裸 'main' agentId 按精确值判定。 */
const FORBIDDEN_SUBSTRINGS = ['twin', 'oauth:', '-router', 'chatgpt-oauth']

const here = dirname(fileURLToPath(import.meta.url))
const readRepo = (rel) => readFileSync(join(here, '..', rel), 'utf8')
const statsSource = readRepo('lib/stats.js')
const wrapperSource = readRepo('lib/wrapper.js')
const clientSource = readRepo('lib/client.js')
const presetDefaultsSource = readRepo('lib/preset-defaults.js')
const serviceSource = readRepo('lib/service.js')
const oauthLlmSource = readRepo('lib/oauth-llm.js')
const hostRouteSource = readRepo('lib/host-route.js')
const toolSource = readRepo('lib/tool.js')

let passed = 0
let failed = 0
const check = (label, condition, detail) => {
  if (condition) { passed++; console.log(`  ok  ${label}`); return }
  failed++
  console.error(`FAIL  ${label}`)
  if (detail !== undefined) console.error(`      ↳ 实测：${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}

/** 递归收集对象/数组里的全部字符串值（键名不入扫描——arm 的 main/subagent 是键）。 */
function collectStrings(value, out = []) {
  if (typeof value === 'string') { out.push(value); return out }
  if (Array.isArray(value)) { for (const item of value) collectStrings(item, out); return out }
  if (value && typeof value === 'object') { for (const item of Object.values(value)) collectStrings(item, out) }
  return out
}

/** 可见面禁用词扫描。preset 级 CSV 的 origin 列值 'main' 是口径名（main/
 *  subagent，EV-158 既定语义）而非内部 agentId，按列位例外放行。 */
function scanValues(values, { allowMainToken = false } = {}) {
  const hits = []
  for (const text of values) {
    for (const banned of FORBIDDEN_SUBSTRINGS) {
      if (text.includes(banned)) hits.push(`${banned} ← ${JSON.stringify(text)}`)
    }
    if (text === 'main' && !allowMainToken) hits.push(`bare-main ← ${JSON.stringify(text)}`)
  }
  return hits
}
function scanCsv(csv, { presetOriginColumn = false } = {}) {
  const hits = []
  for (const line of csv.split('\n')) {
    line.split(',').forEach((cell, index) => {
      if (index === 0) return
      hits.push(...scanValues([cell], { allowMainToken: presetOriginColumn && index === 2 }))
    })
  }
  return hits
}

const legacyCallLine = ({ agentId, provider, model, at, ok = true, ms = 100, inputTokens = 5, outputTokens = 1 }) =>
  JSON.stringify({ v: 1, at, agentId, provider, model, ok, ms, inputTokens, outputTokens, costEstimate: 0 })
const legacyScopeLine = ({ preset, origin, provider, model, at }) =>
  JSON.stringify({ v: 2, at, kind: 'scope', preset, origin, provider, model })

/** 探针：真实 store 落盘 → 取盘面行实际形状（P10④——不按心智模型造夹具）。 */
async function diskLineShapes(work) {
  const dir = join(work, 'shape', 'stats')
  const probe = new StatsStore({ dir, now: () => T0 })
  probe.record({ agentId: 'vision', provider: 'glm-local', model: 'glm-5.3', ok: true, ms: 10, inputTokens: 1, outputTokens: 2, at: T0 })
  probe.recordScope({ preset: 'standard', origin: 'main', provider: 'glm-local', model: 'glm-5.3', at: T0 })
  await probe.flush()
  await probe.close()
  const lines = readFileSync(join(dir, `daily-${D0}.jsonl`), 'utf8')
    .split('\n').filter((line) => line !== '').map((line) => JSON.parse(line))
  return {
    callKeys: Object.keys(lines.find((line) => line.kind !== 'scope')).join(','),
    scopeKeys: Object.keys(lines.find((line) => line.kind === 'scope')).join(','),
  }
}

/** 求值浏览器包取 factory 导出面（与 tests/client-render.mjs 同构最小夹具）。 */
async function loadBrowserBundle() {
  let bundle = null
  new Function('window', clientSource)({
    __ModuleLoader__: { load: (payload) => { bundle = payload } },
    location: { search: '', pathname: '/' },
    history: { replaceState: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    confirm: () => true,
  })
  if (!bundle || typeof bundle.factory !== 'function') return null
  const noop = () => {}
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, noop],
    useEffect: noop,
    useCallback: (fn) => fn,
    useRef: (value) => ({ current: value }),
  }
  return bundle.factory((name) => (name === 'react' ? react : (() => { throw new Error(`unexpected require: ${name}`) })()))
}

console.log('FIX-031 统计归因单点 + 路由透明性判别组：')

// ── A 组：D1 账号伪实体 ────────────────────────────────────────────────────
{
  const work = mkdtempSync(join(tmpdir(), 'fix031-a-'))
  const store = new StatsStore({ dir: join(work, 'stats'), persist: false, now: NOW_AT })
  for (let i = 0; i < 19; i++) store.recordScope({ preset: 'standard', origin: 'main', provider: 'glm-local', model: 'glm-5.3', at: T0 + i })
  for (let i = 0; i < 113; i++) store.recordScope({ preset: 'governance', origin: 'main', provider: `glm-local${WRAP_ROUTE_SUFFIX}`, model: 'glm-5.3', at: T0 + 1000 + i })
  store.record({ agentId: 'twin', provider: `glm-local${WRAP_ROUTE_SUFFIX}`, model: 'glm-5.3', ok: true, ms: 200, inputTokens: 7, outputTokens: 2, at: T0 + 1200 })
  store.record({ agentId: 'vision', provider: 'glm-local', model: 'glm-5.3', ok: true, ms: 90, inputTokens: 3, outputTokens: 4, at: T0 + 1300 })
  const snap = store.snapshot()
  const accountKeys = snap.accountTotals.map((row) => row.provider)
  const glm = snap.accountTotals.find((row) => row.provider === 'glm-local')
  check('A1: 包装路由伪实体消失（glm-local-router 不存在，用量归 glm-local）', !accountKeys.includes(`glm-local${WRAP_ROUTE_SUFFIX}`) && accountKeys.includes('glm-local'), accountKeys)
  check('A2: 同一真实账号只一张卡（原生 + 包装 + 专业 agent 三通路归一）', snap.accountTotals.length === 1, accountKeys)
  check('A3: 账号行携带实体种类且可见键无内部标记', glm?.accountKind === 'provider' && !String(glm?.provider).includes(WRAP_ROUTE_SUFFIX), glm && { provider: glm.provider, accountKind: glm.accountKind })
  check('A4: 合并计数 = scope 权威 + 非双产增量（19+113 scope + 1 专业 agent = 133；twin call 被吸收）', glm?.calls === 133 && glm.requestCalls === 132 && glm.callRows === 2, glm && { calls: glm.calls, requestCalls: glm.requestCalls, callRows: glm.callRows })
  check('A5: 预设卡服务商列同样归一（无 -router 独立服务商）', (() => {
    const providers = new Set()
    for (const row of snap.presetStats) {
      for (const arm of [row.main, row.subagent]) {
        for (const entry of arm.models) providers.add(entry.provider)
      }
    }
    return providers.size === 1 && providers.has('glm-local')
  })(), snap.presetStats.map((row) => row.main.models))
  check('A6: agent 面内部键归一（twin → main-model，与 vision 并列两张卡）', snap.totals.map((row) => row.agentId).sort().join(',') === `${MAIN_MODEL_AGENT_ID},vision`, snap.totals.map((row) => row.agentId))
  store.close()
  rmSync(work, { recursive: true, force: true })
}

// ── B 组：D2 内部键外显（可见面 = snapshot 全部字段值 + 导出 CSV 列值）──────
{
  const work = mkdtempSync(join(tmpdir(), 'fix031-b-'))
  const store = new StatsStore({ dir: join(work, 'stats'), persist: false, now: NOW_AT })
  store.record({ agentId: 'twin', provider: `glm-local${WRAP_ROUTE_SUFFIX}`, model: 'glm-5.3', ok: true, ms: 200, inputTokens: 7, outputTokens: 2, at: T0 })
  store.record({ agentId: 'main', provider: 'chatgpt-oauth', model: 'gpt-5.6-sol', ok: true, ms: 300, inputTokens: 11, outputTokens: 5, at: T0 + 10 })
  store.record({ agentId: 'vision', provider: 'oauth:chatgpt', model: 'gpt-5.6-sol', ok: true, ms: 120, inputTokens: 9, outputTokens: 3, at: T0 + 20 })
  store.recordScope({ preset: 'standard', origin: 'subagent', provider: `glm-local${WRAP_ROUTE_SUFFIX}`, model: 'glm-5.3', at: T0 + 30 })
  const snap = store.snapshot()
  check('B1: snapshot 全部字段值无内部键（twin / oauth: / -router / chatgpt-oauth / 裸 main）', scanValues(collectStrings(snap)).length === 0, scanValues(collectStrings(snap)))
  check('B2: agent 面内部 agentId 归一（twin + main → 单一 main-model 实体）', snap.totals.map((row) => row.agentId).sort().join(',') === `${MAIN_MODEL_AGENT_ID},vision`, snap.totals.map((row) => row.agentId))
  check('B3: 订阅路由键与账号键归一张卡（chatgpt-oauth + oauth:chatgpt → chatgpt，用量合并）', (() => {
    const rows = snap.accountTotals.filter((row) => row.accountKind === 'oauth')
    return rows.length === 1 && rows[0].provider === 'chatgpt' && rows[0].calls === 2 && rows[0].inputTokens === 20
  })(), snap.accountTotals)
  check('B4: 账号级明细行自带规范 provider（显示层不再需要 agentId 回退）', (() => {
    const rows = snap.recentByAccount.find((entry) => entry.key === 'glm-local')?.recent ?? []
    return rows.length === 1 && rows[0].provider === 'glm-local' && rows[0].agentId === MAIN_MODEL_AGENT_ID && rows[0].accountKind === 'provider'
  })(), snap.recentByAccount)
  check('B4b: 账号级派生索引可见键无内部标记', [...snap.recentByAccount, ...snap.accountDays, ...snap.accountSeries].every((entry) => scanValues([entry.key ?? entry.provider]).length === 0), { recent: snap.recentByAccount.map((entry) => entry.key), days: snap.accountDays.map((entry) => entry.key), series: snap.accountSeries.map((entry) => entry.provider) })
  const csvAgent = store.export({ range: '7d', level: 'agent' })
  const csvAccount = store.export({ range: '7d', level: 'account' })
  const csvPreset = store.export({ range: '7d', level: 'preset' })
  check('B5: 导出 CSV 三级列值无内部键', scanCsv(csvAgent).length === 0 && scanCsv(csvAccount).length === 0 && scanCsv(csvPreset, { presetOriginColumn: true }).length === 0, { csvAgent, csvAccount, csvPreset })
  check('B6: CSV agent 列用规范实体（main-model 而非 twin/main）', csvAgent.includes(`,${MAIN_MODEL_AGENT_ID},`) && !new RegExp(`^${D0},twin,`, 'm').test(csvAgent) && !new RegExp(`^${D0},main,`, 'm').test(csvAgent), csvAgent)
  check('B7: CSV account 列用清洁账号键（chatgpt / glm-local）', csvAccount.split('\n').some((line) => line.startsWith(`${D0},,chatgpt,`)) && csvAccount.split('\n').some((line) => line.startsWith(`${D0},,glm-local,`)), csvAccount)
  store.close()
  rmSync(work, { recursive: true, force: true })
}

// ── C 组：D3 零覆盖（非包装 provider 账号卡恒 0）───────────────────────────
{
  const work = mkdtempSync(join(tmpdir(), 'fix031-c-'))
  const dir = join(work, 'stats')
  const store = new StatsStore({ dir, now: NOW_AT })
  for (let i = 0; i < 26; i++) store.recordScope({ preset: 'standard', origin: 'main', provider: 'opencode-go-local', model: 'omen-alpha', at: T0 + i })
  for (let i = 0; i < 19; i++) store.recordScope({ preset: 'governance', origin: 'main', provider: 'glm-local', model: 'glm-5.3', at: T0 + i })
  const snap = store.snapshot()
  const opencode = snap.accountTotals.find((row) => row.provider === 'opencode-go-local')
  const glm = snap.accountTotals.find((row) => row.provider === 'glm-local')
  check('C1: 无 call 行的 provider 账号卡可见（计数权威 = scope 行，26 次）', !!opencode && opencode.calls === 26, opencode)
  check('C2: token/耗时/错误仅来自 call 行（零 call 行 → 全 0，不虚增明细）', !!opencode && opencode.inputTokens === 0 && opencode.outputTokens === 0 && opencode.totalMs === 0 && opencode.errors === 0, opencode)
  check('C3: 同账号非包装请求同样入账（glm-local 19 次）', !!glm && glm.calls === 19, glm)
  check('C4: 每日段与总数同源（按天合计 = 账号 calls；模型分布齐备）', (() => {
    const days = snap.accountDays.find((entry) => entry.key === 'opencode-go-local')?.days ?? []
    return days.length === 1 && days[0].calls === 26 && days[0].models.length === 1 && days[0].models[0].model === 'omen-alpha' && days[0].models[0].calls === 26
  })(), snap.accountDays)
  check('C5: lastAt 由请求遥测提供（无 call 行也有最近时间）', !!opencode && opencode.lastAt === T0 + 25, opencode && opencode.lastAt)
  check('C6: 双权威源分解可观测（requestCalls 与 callRows 并存——透明性）', !!opencode && opencode.requestCalls === 26 && opencode.callRows === 0, opencode)
  await store.flush()
  const reloaded = new StatsStore({ dir, now: NOW_AT })
  await reloaded.load()
  const scopeOnly = reloaded.snapshot().accountTotals.find((row) => row.provider === 'opencode-go-local')
  check('C7: 重启恢复后 scope 计数仍在（load 重放 #foldScope）', !!scopeOnly && scopeOnly.calls === 26, scopeOnly)
  await reloaded.close()
  store.close()
  // W-4 往返 × scope 侧聚合：内存已含盘上同一批 scope 行时，关→开不得再 load
  // 重折叠（旧实现空内存判据只看 call 侧 → scope-only 场景判成内存空 → 双计）。
  const toggleWork = mkdtempSync(join(tmpdir(), 'fix031-toggle-'))
  const toggleStore = new StatsStore({ dir: join(toggleWork, 'stats'), now: NOW_AT })
  for (let i = 0; i < 7; i++) toggleStore.recordScope({ preset: 'standard', origin: 'main', provider: 'glm-local', model: 'glm-5.3', at: T0 + i })
  await toggleStore.flush()
  await toggleStore.setPersist(false)
  await toggleStore.setPersist(true)
  const afterToggle = toggleStore.snapshot().accountTotals.find((row) => row.provider === 'glm-local')
  check('C8: persist 关→开往返不双计 scope 请求数（W-4 空内存判据含 scope 侧聚合）', !!afterToggle && afterToggle.calls === 7 && afterToggle.requestCalls === 7, afterToggle)
  await toggleStore.close()
  rmSync(toggleWork, { recursive: true, force: true })
  rmSync(work, { recursive: true, force: true })
}

// ── D 组：双权威源去重（双产不双计，非双产不吞并）──────────────────────────
{
  const work = mkdtempSync(join(tmpdir(), 'fix031-d-'))
  const store = new StatsStore({ dir: join(work, 'stats'), persist: false, now: NOW_AT })
  for (let i = 0; i < 113; i++) store.recordScope({ preset: 'governance', origin: 'main', provider: `glm-local${WRAP_ROUTE_SUFFIX}`, model: 'glm-5.3', at: T0 + i })
  for (let i = 0; i < 18; i++) store.record({ agentId: 'twin', provider: `glm-local${WRAP_ROUTE_SUFFIX}`, model: 'glm-5.3', ok: true, ms: 200, inputTokens: 7, outputTokens: 2, at: T0 + 500 + i })
  for (let i = 0; i < 3; i++) store.record({ agentId: 'vision', provider: 'glm-local', model: 'glm-5.3', ok: false, ms: 40, inputTokens: 1, outputTokens: 0, at: T0 + 600 + i })
  const glm = store.snapshot().accountTotals.find((row) => row.provider === 'glm-local')
  check('D1: 双产请求计数只取 scope 侧（113 scope 吸收 18 twin call，不双计）', !!glm && glm.calls === 116 && glm.requestCalls === 113 && glm.callRows === 21, glm && { calls: glm.calls, requestCalls: glm.requestCalls, callRows: glm.callRows })
  check('D2: 非双产通路 call 行不被吸收（专业 agent 3 次另计 → 116）', !!glm && glm.calls === 113 + 3, glm && glm.calls)
  check('D3: token/耗时/错误权威仍是 call 行（18×7+3 in / 18×2 out / 3 失败）', !!glm && glm.inputTokens === 18 * 7 + 3 && glm.outputTokens === 18 * 2 && glm.errors === 3, glm && { in: glm.inputTokens, out: glm.outputTokens, errors: glm.errors })
  check('D4: 平均耗时按 call 明细口径（totalMs 只累计 call 行）', !!glm && glm.totalMs === 18 * 200 + 3 * 40, glm && glm.totalMs)
  check('D5: 模型分布与合并格同源（calls/requestCalls/callRows 三层一致）', (() => {
    const model = glm?.models.find((entry) => entry.model === 'glm-5.3')
    return !!model && model.calls === 116 && model.requestCalls === 113 && model.callRows === 21 && model.inputTokens === 18 * 7 + 3
  })(), glm && glm.models)
  const csvRow = store.export({ range: '7d', level: 'account' }).split('\n').find((line) => line.startsWith(`${D0},,glm-local,glm-5.3,`))
  check('D6: 导出 CSV account 级与账号卡同源（calls 列 = 116）', !!csvRow && csvRow.split(',')[4] === '116', csvRow)
  const noScope = new StatsStore({ dir: join(work, 's2'), persist: false, now: NOW_AT })
  noScope.record({ agentId: 'main', provider: 'chatgpt-oauth', model: 'gpt-5.6-sol', ok: true, ms: 10, inputTokens: 2, outputTokens: 1, at: T0 })
  const chatgpt = noScope.snapshot().accountTotals.find((row) => row.provider === 'chatgpt')
  check('D7: scope 无覆盖时 call 侧兜底计数（无预设会话/直发通路用量不丢）', !!chatgpt && chatgpt.calls === 1 && chatgpt.requestCalls === 0 && chatgpt.callRows === 1, chatgpt)
  const mixed = new StatsStore({ dir: join(work, 's3'), persist: false, now: NOW_AT })
  mixed.recordScope({ preset: 'standard', origin: 'main', provider: 'glm-local', model: 'glm-4.6', at: T0 })
  mixed.record({ agentId: 'draw', provider: 'glm-local', model: 'cogview-3', ok: true, ms: 500, inputTokens: 1, outputTokens: 9, at: T0 + 1 })
  const mixedRow = mixed.snapshot().accountTotals.find((row) => row.provider === 'glm-local')
  check('D8: 同日跨模型混计不吞并（scope 覆盖 a 模型不影响 b 模型自行计数）', !!mixedRow && mixedRow.calls === 2 && mixedRow.models.length === 2, mixedRow && mixedRow.models)
  store.close(); noScope.close(); mixed.close()
  rmSync(work, { recursive: true, force: true })
}

// ── D 组续（F-1 返工，R0 审查保留项）：跨 UTC 午夜请求不双计 ────────────────
// 缺陷形态（REVIEW-FIX-031-R0 F-1）：scope 行 at=请求起点（遥测在请求解析时即
// 记），call 行 at=流终点（record 缺省 now）→ 跨午夜请求两行分居两日，day2 无
// scope 覆盖走兜底分支全计 → 同请求账号级合计 2。修复 = 记录站点统一补
// at: startedAt（请求起点）。D9 用真实 wrapper 位点驱动（非手捏事件）。
{
  const work = mkdtempSync(join(tmpdir(), 'fix031-d9-'))
  const start = Date.UTC(2026, 8, 6, 23, 59, 58, 500)
  const end = Date.UTC(2026, 8, 7, 0, 0, 1, 500)
  const reports = []
  const realDateNow = Date.now
  try {
    let clock = start
    Date.now = () => clock
    const llmCross = {
      registration: () => ({ adapter: { resolveModel: async (p, m) => ({ provider: p, id: m, name: m, inputModalities: ['text'] }) } }),
      stream: async function* () {
        clock = end
        yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 2 } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }
    const active = [{ modality: 'image', stateOf: null, marker: () => 'MARKER', rewrite: () => null }]
    const twin = createWrapAdapter(llmCross, 'glm-local', active, (event) => reports.push(event))
    for await (const chunk of twin.stream({ provider: `glm-local${WRAP_ROUTE_SUFFIX}`, model: 'glm-5.3', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] })) void chunk
    check('D9: twin onCall 事件携带 at=请求起点（跨午夜流不按终点落日；ms 仍为墙钟时长）', reports.length === 1 && reports[0].at === start && reports[0].ms === end - start, reports[0])
  } finally {
    Date.now = realDateNow
  }
  // 站点事件按真实接线形态入账（installAdmissionWrapper：record({agentId:
  // MAIN_MODEL_AGENT_ID, ...event})；installRequestTelemetry：请求解析时
  // recordScope，provider=实际路由含 -router）→ 同格吸收。
  const store = new StatsStore({ dir: join(work, 'stats'), persist: false, now: NOW_AT })
  store.recordScope({ preset: 'governance', origin: 'main', provider: `glm-local${WRAP_ROUTE_SUFFIX}`, model: 'glm-5.3', at: start })
  store.record({ agentId: MAIN_MODEL_AGENT_ID, ...reports[0] })
  const glm = store.snapshot().accountTotals.find((row) => row.provider === 'glm-local')
  const glmDays = store.snapshot().accountDays.find((entry) => entry.key === 'glm-local')
  check('D9b: 跨午夜同请求对合计恰好 1（scope day1 吸收 twin call；账号按天只 1 日且该日 calls=1）', !!glm && glm.calls === 1 && glm.requestCalls === 1 && glm.callRows === 1 && !!glmDays && glmDays.days.length === 1 && glmDays.days[0].date === D0 && glmDays.days[0].calls === 1, { glm, days: glmDays?.days })
  // 对照组（旧形态复算，缺陷存在性证据）：同一对请求若 call 行按流终点落日
  //（at=end，即修复前 record 缺省 now 形态）→ day2 无 scope 覆盖走兜底分支
  // 全计 → 合计 2、跨两日。
  const legacy = new StatsStore({ dir: join(work, 'legacy'), persist: false, now: NOW_AT })
  legacy.recordScope({ preset: 'governance', origin: 'main', provider: `glm-local${WRAP_ROUTE_SUFFIX}`, model: 'glm-5.3', at: start })
  legacy.record({ agentId: MAIN_MODEL_AGENT_ID, ...reports[0], at: end })
  const legacyGlm = legacy.snapshot().accountTotals.find((row) => row.provider === 'glm-local')
  const legacyDays = legacy.snapshot().accountDays.find((entry) => entry.key === 'glm-local')
  check('D9c: 对照组——call 行按流终点落日即双计（旧形态合计 2、跨两日；F-1 缺陷复算）', !!legacyGlm && legacyGlm.calls === 2 && legacyGlm.requestCalls === 1 && legacyGlm.callRows === 1 && !!legacyDays && legacyDays.days.length === 2, { legacyGlm, days: legacyDays?.days.map((day) => day.date) })
  store.close(); legacy.close()
  // 源码契约（oauth-llm / tool 站点无轻量驱动面——真实通路含 fetch/SSE 与子代理
  // 分发，源码锚定为既定先例形态，同 G3/F4/H 组）：两站点成功 + 失败两条 record
  // 路径都必须携带 at: started。
  check('D10: oauth-llm 两处 record 位点均携带 at=started（成功 + 失败路径）', (oauthLlmSource.match(/at: started,/g) ?? []).length === 2, (oauthLlmSource.match(/.{0,50}at: started,.{0,30}/g) ?? []))
  check('D11: tool.js 两处 record 位点均携带 at=started（专业 agent 行单源无 scope 配对，对齐同规则保持全 call 行同语义）', (toolSource.match(/at: started,/g) ?? []).length === 2, (toolSource.match(/.{0,50}at: started,.{0,30}/g) ?? []))
  rmSync(work, { recursive: true, force: true })
}

// ── D 组续 2（返工批 3，用户复验 D5/D6 + 追问 D7）：账号实体的通路归并收口 ──
// D6：宿主官方路由（openai-codex）与 oauth 通路共用同一份 ChatGPT 订阅凭据
//（host-route selectHostAccount 选首个启用账号注入同一凭据库）——同一真实
// 账号不得拆两张卡。归并 = StatsStore 注入 hostRouteAccountKeyOf resolver
//（service 侧读 hostRouteStatusOf 的 maintained+accountId），归一化单点消费。
// D5：roster provider 行 + 统计 host-route 行同键不同 kind 双卡（dedup 旧判据
// provider+kind 双等）。D7：账号级计数解除 preset 门控（无预设通路可见）。
{
  // D12（D6 归并，store 级真实 resolver 形态——用户实证数字：ChatGPT 19 调用
  // + openai-codex 2 调用 → 修复后单卡 21）。
  const work = mkdtempSync(join(tmpdir(), 'fix031-d12-'))
  let routeAccount = 'chatgpt'
  const store = new StatsStore({ dir: join(work, 's'), persist: false, now: NOW_AT, hostRouteAccountKeyOf: () => (routeAccount ? `oauth:${routeAccount}` : null) })
  for (let i = 0; i < 19; i++) store.record({ agentId: 'vision', provider: 'oauth:chatgpt', model: 'gpt-5.6-sol', ok: true, ms: 1000, inputTokens: 4700, outputTokens: 1736, at: T0 + i })
  for (let i = 0; i < 2; i++) store.record({ agentId: MAIN_MODEL_AGENT_ID, provider: 'openai-codex', model: 'gpt-5.6-sol', ok: true, ms: 200, inputTokens: 4500, outputTokens: 2000, at: T0 + 100 + i })
  const snap = store.snapshot()
  const chatgpt = snap.accountTotals.find((row) => row.provider === 'chatgpt')
  check('D12: host-route 用量经 resolver 归并到路由选中账号（同卡合计恰 21；单一 oauth 实体，kind 继承）', snap.accountTotals.length === 1 && !!chatgpt && chatgpt.accountKind === 'oauth' && chatgpt.calls === 21 && chatgpt.inputTokens === 19 * 4700 + 2 * 4500, snap.accountTotals)
  check('D12b: 归并直达白盒键空间（host-route 行落 oauth:<accountId>——accountHealth 寻址直接吃到；无 openai-codex 残留键）', [...store.accountTotals.keys()].join(',') === 'oauth:chatgpt' && store.accountTotals.get('oauth:chatgpt').calls === 21, [...store.accountTotals.keys()])
  routeAccount = ''
  store.record({ agentId: MAIN_MODEL_AGENT_ID, provider: 'openai-codex', model: 'gpt-5.6-sol', ok: true, ms: 50, at: T0 + 200 })
  const after = store.snapshot()
  check('D12c: resolver 动态失效（路由未激活/账号未知）→ 新行回落独立实体（不伪装进已知账号；已归并不回滚）', after.accountTotals.length === 2 && after.accountTotals.find((row) => row.provider === 'chatgpt').calls === 21 && !!after.accountTotals.find((row) => row.provider === 'openai-codex' && row.accountKind === 'host-route' && row.calls === 1), after.accountTotals.map((row) => `${row.provider}/${row.accountKind}:${row.calls}`))
  // D12d（微批 4，R2 保留项 N1）：D6 的**生产主路径**是 scope 行——宿主官方
  // 路由请求经宿主 pi-ai 适配器，插件在该通路无 call 记录位点（用户实证的
  // openai-codex 用量即请求口径 scope 行形态）。真实 recordScope →
  // #foldScope → #accountView 全链驱动（不经手搓中间态）。
  routeAccount = 'chatgpt'
  const scopeStore = new StatsStore({ dir: join(work, 's-scope'), persist: false, now: NOW_AT, hostRouteAccountKeyOf: () => (routeAccount ? `oauth:${routeAccount}` : null) })
  for (let i = 0; i < 3; i++) scopeStore.recordScope({ preset: '', origin: 'main', provider: 'openai-codex', model: 'gpt-5.6-sol', at: T0 + 300 + i })
  const scopeMergedSnap = scopeStore.snapshot()
  const scopeMergedRow = scopeMergedSnap.accountTotals.find((row) => row.provider === 'chatgpt')
  check('D12d: 宿主路由 scope 行（生产主路径）全链归并——accountScope 权威键落 oauth:<accountId>、快照单卡计数含该请求', scopeMergedSnap.accountTotals.length === 1 && !!scopeMergedRow && scopeMergedRow.accountKind === 'oauth' && scopeMergedRow.calls === 3 && scopeMergedRow.requestCalls === 3 && scopeStore.accountScope.get('oauth:chatgpt')?.calls === 3 && scopeStore.accountScope.get('openai-codex') === undefined, { snap: scopeMergedSnap.accountTotals, scopeKeys: [...scopeStore.accountScope.keys()] })
  routeAccount = ''
  scopeStore.recordScope({ preset: '', origin: 'main', provider: 'openai-codex', model: 'gpt-5.6-sol', at: T0 + 400 })
  const scopeFallbackSnap = scopeStore.snapshot()
  check('D12d 对照：同 scope 形态 resolver 未激活 → 落入独立 host-route 实体（回落对照——不并进已知账号，已归并不回滚）', scopeFallbackSnap.accountTotals.length === 2 && scopeFallbackSnap.accountTotals.find((row) => row.provider === 'chatgpt').calls === 3 && !!scopeFallbackSnap.accountTotals.find((row) => row.provider === 'openai-codex' && row.accountKind === 'host-route' && row.calls === 1) && scopeStore.accountScope.get('openai-codex')?.calls === 1, { snap: scopeFallbackSnap.accountTotals.map((row) => `${row.provider}/${row.accountKind}:${row.calls}`), scopeKeys: [...scopeStore.accountScope.keys()] })
  store.close()
  scopeStore.close()
  rmSync(work, { recursive: true, force: true })
}
{
  // D13（D5 双卡，源码契约 + 浏览器包值级——旧代码 roster 行与统计行双渲染）。
  check('D13: roster 统计行不再为宿主路由键出卡（通路不是账号；取数键与统计行同键空间）', /if \(isHostManagedRoute\(entry\.provider\)\) continue/.test(clientSource) && /accountTotalsById\.get\(accountDisplayKeyOf\(entry\.provider\)\)/.test(clientSource))
  check('D13b: 账号卡身份去重按归一账号键跨 accountKind（旧判据 provider+kind 双等 → 同键双卡）', /accountDisplayKeyOf\(row\.provider\) === accountDisplayKeyOf\(total\.provider\)/.test(clientSource) && !/row\.provider === total\.provider && \(row\.accountKind \?\? 'provider'\) === \(total\.accountKind \?\? 'provider'\)/.test(clientSource))
  const bundle13 = await loadBrowserBundle()
  const t13 = (key) => ({ statsHostRouteAccount: '宿主路由（账号未知）', statsMainModel: '主模型' }[key] ?? key)
  check('D13c: 浏览器包回落标签诚实（host-route 行无 roster 名 → 「宿主路由（账号未知）」，不冒充实体键/已知账号）', bundle13?.statsProviderLabelOf({ provider: 'openai-codex', accountKind: 'host-route' }, new Map(), t13) === '宿主路由（账号未知）', bundle13 && bundle13.statsProviderLabelOf({ provider: 'openai-codex', accountKind: 'host-route' }, new Map(), t13))
  check('D13d: 归并行标签走 oauth 账号名（roster 覆盖同一显示名单点）', bundle13?.statsProviderLabelOf({ provider: 'chatgpt', accountKind: 'oauth' }, new Map([['oauth|chatgpt', 'ChatGPT 订阅']]), t13) === 'ChatGPT 订阅')
  check('D13e: 回落标签 i18n 在册（zh + en）', /statsHostRouteAccount: '宿主路由（账号未知）'/.test(clientSource) && /statsHostRouteAccount: 'Host route \(account unknown\)'/.test(clientSource))
}
{
  // D14（回落诚实性，纯函数直测——resolver 一切非法形态不抛不伪装）。
  const junkResolvers = [null, () => null, () => undefined, () => '', () => 'oauth:', () => 'chatgpt', () => 42, () => { throw new Error('resolver boom') }]
  check('D14: resolver 不可用/返回非法/抛错 → 回落独立实体且永不抛（诚实不伪装）', typeof statsModule.normalizeAttribution === 'function' && junkResolvers.every((resolver) => {
    const out = statsModule.normalizeAttribution({ provider: 'openai-codex' }, resolver)
    return out.accountKey === 'openai-codex' && out.accountKind === 'host-route' && out.accountLabel === 'openai-codex'
  }))
  check('D14b: resolver 佳形态归并（oauth: 前缀 + 非空 id）且幂等（归并键再过单点不变）', (() => {
    if (typeof statsModule.normalizeAttribution !== 'function') return false
    const once = statsModule.normalizeAttribution({ provider: 'openai-codex' }, () => 'oauth:chatgpt')
    return once.accountKey === 'oauth:chatgpt' && once.accountKind === 'oauth' && once.accountLabel === 'chatgpt' && statsModule.normalizeAttribution({ provider: once.accountKey }, () => 'oauth:chatgpt').accountKey === once.accountKey
  })())
}
{
  // D15/D16（D7：账号级计数解除 preset 门控——deepseek-official 形态夹具）。
  const work = mkdtempSync(join(tmpdir(), 'fix031-d15-'))
  const dir = join(work, 'stats')
  const store = new StatsStore({ dir, now: NOW_AT })
  for (let i = 0; i < 17; i++) store.recordScope({ preset: '', origin: 'main', provider: 'deepseek-official', model: 'deepseek-v3.2', at: T0 + i })
  store.recordScope({ preset: 'standard', origin: 'main', provider: 'glm-local', model: 'glm-5.3', at: T0 + 50 })
  const snap = store.snapshot()
  const deepseek = snap.accountTotals.find((row) => row.provider === 'deepseek-official')
  check('D15: 无预设请求进账号视图（preset=\'\' 行——deepseek-official 请求口径计数可见，RED：旧代码该行直接丢弃）', !!deepseek && deepseek.calls === 17 && deepseek.requestCalls === 17 && deepseek.accountKind === 'provider', deepseek)
  await store.flush()
  const reloaded = new StatsStore({ dir, now: NOW_AT })
  await reloaded.load()
  const reDeepseek = reloaded.snapshot().accountTotals.find((row) => row.provider === 'deepseek-official')
  check('D15b: preset=\'\' 盘面行 load 兼容（#shapeOf 容忍空串——重启计数仍在 + 零坏行）', !!reDeepseek && reDeepseek.calls === 17 && reloaded.statsSelfReport().skippedLines === 0 && reloaded.statsSelfReport().skippedVersionLines === 0, reloaded.statsSelfReport())
  const csvRow = reloaded.export({ range: '7d', level: 'account' }).split('\n').find((line) => line.startsWith(`${D0},,deepseek-official,deepseek-v3.2,`))
  check('D15c: 导出 CSV account 级含无预设通路行（与账号卡同源——可见面不缺席）', !!csvRow && csvRow.split(',')[4] === '17', csvRow)
  check('D16: 预设视图不含 preset=\'\' 行（预设卡不出现无预设用量；预设维度对无预设请求不适用）', snap.presetStats.length === 1 && snap.presetStats[0].preset === 'standard' && snap.presetStats[0].main.calls === 1, snap.presetStats.map((row) => `${row.preset}:${row.main.calls}`))
  check('D16b: 遥测站点解除 preset 门控（无预设请求也上报——preset 解析链不动：罗盘 → header → 空串）', /if \(typeof config\?\.provider !== 'string' \|\| typeof config\?\.model !== 'string'\) return config/.test(presetDefaultsSource) && !/if \(!preset \|\| typeof config\?\.provider/.test(presetDefaultsSource))
  await reloaded.close()
  await store.close()
  rmSync(work, { recursive: true, force: true })
}

// ── E 组：读侧迁移 + 盘面基线语义（不改写用户观测值）────────────────────────
{
  const work = mkdtempSync(join(tmpdir(), 'fix031-e-'))
  const shapes = await diskLineShapes(work)
  check('E0: 真实 store 盘面行形状锚定（调用行字段白名单 + 作用域行字段白名单）', shapes.callKeys === 'v,at,agentId,provider,model,ok,ms,inputTokens,outputTokens,costEstimate' && shapes.scopeKeys === 'v,at,kind,preset,origin,provider,model', shapes)
  const dir = join(work, 'stats')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `daily-${D0}.jsonl`)
  const legacy = [
    legacyCallLine({ agentId: 'twin', provider: `glm-local${WRAP_ROUTE_SUFFIX}`, model: 'glm-5.3', at: T0 + 1, inputTokens: 7, outputTokens: 2 }),
    legacyCallLine({ agentId: 'main', provider: 'chatgpt-oauth', model: 'gpt-5.6-sol', at: T0 + 2, inputTokens: 11, outputTokens: 5 }),
    legacyCallLine({ agentId: 'vision', provider: 'oauth:chatgpt', model: 'gpt-5.6-sol', at: T0 + 3, inputTokens: 9, outputTokens: 3 }),
    legacyScopeLine({ preset: 'governance', origin: 'main', provider: `glm-local${WRAP_ROUTE_SUFFIX}`, model: 'glm-5.3', at: T0 + 4 }),
    legacyScopeLine({ preset: 'standard', origin: 'main', provider: 'opencode-go-local', model: 'omen-alpha', at: T0 + 5 }),
  ].join('\n') + '\n'
  writeFileSync(file, legacy, 'utf8')
  const store = new StatsStore({ dir, now: NOW_AT })
  await store.load()
  const snap = store.snapshot()
  check('E1: 历史 v1 行 load 同过归一化（伪实体/内部 agent 键消失；订阅两形态归一）', snap.accountTotals.map((row) => row.provider).sort().join(',') === 'chatgpt,glm-local,opencode-go-local' && !snap.totals.some((row) => row.agentId === 'twin' || row.agentId === 'main'), { accounts: snap.accountTotals.map((row) => row.provider), agents: snap.totals.map((row) => row.agentId) })
  check('E2: 归一化不回写盘面观测值（twin / -router 仍在文件里——读侧迁移语义）', (() => {
    const lines = readFileSync(file, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line))
    const twin = lines.find((line) => line.agentId === 'twin')
    const wrappedScope = lines.find((line) => line.kind === 'scope' && String(line.provider).endsWith(WRAP_ROUTE_SUFFIX))
    return !!twin && !!wrappedScope && String(twin.provider).endsWith(WRAP_ROUTE_SUFFIX)
  })(), readFileSync(file, 'utf8'))
  check('E3: 历史行合并计数正确（同格 scope 吸收 twin call；订阅两键用量相加）', (() => {
    const glm = snap.accountTotals.find((row) => row.provider === 'glm-local')
    const chatgpt = snap.accountTotals.find((row) => row.provider === 'chatgpt')
    return !!glm && glm.calls === 1 && glm.requestCalls === 1 && glm.callRows === 1 && glm.inputTokens === 7 && !!chatgpt && chatgpt.calls === 2 && chatgpt.inputTokens === 20
  })(), snap.accountTotals)
  check('E4: 读侧迁移零破坏自诊断（无坏行/无未知版本行被丢弃）', store.statsSelfReport().skippedLines === 0 && store.statsSelfReport().skippedVersionLines === 0, store.statsSelfReport())
  const writeProbe = new StatsStore({ dir: join(work, 'write-shape'), now: () => T0 })
  writeProbe.record({ agentId: MAIN_MODEL_AGENT_ID, provider: `glm-local${WRAP_ROUTE_SUFFIX}`, model: 'glm-5.3', ok: true, ms: 1, at: T0 })
  writeProbe.flushSync()
  const written = JSON.parse(readFileSync(join(work, 'write-shape', `daily-${D0}.jsonl`), 'utf8').split('\n')[0])
  check('E5: 新写行保持基线字段集与站点原观测值（写侧不做归一化改写）', written.v === LINE_VERSION && written.provider === `glm-local${WRAP_ROUTE_SUFFIX}` && Object.keys(written).join(',') === 'v,at,agentId,provider,model,ok,ms,inputTokens,outputTokens,costEstimate', written)
  await store.close()
  writeProbe.close()
  rmSync(work, { recursive: true, force: true })
}

// ── F 组：白盒兼容（聚合内部键命名空间保留）────────────────────────────────
{
  const work = mkdtempSync(join(tmpdir(), 'fix031-f-'))
  const store = new StatsStore({ dir: join(work, 'stats'), persist: false, now: NOW_AT })
  store.record({ agentId: 'vision', provider: 'oauth:oauth2', model: 'gpt-4o', ok: false, ms: 5, error: 'boom', at: T0 })
  store.record({ agentId: 'twin', provider: `glm-local${WRAP_ROUTE_SUFFIX}`, model: 'glm-5.3', ok: true, ms: 5, inputTokens: 1, at: T0 })
  const internal = store.accountTotals
  check('F1: 聚合内部键保留账号身份命名空间（service.accountHealth 白盒寻址不回归）', internal.get('oauth:oauth2')?.errors === 1, [...internal.keys()])
  check('F2: 包装路由在聚合层已归并（内部键空间无 -router 残留）', internal.get(`glm-local${WRAP_ROUTE_SUFFIX}`) === undefined && internal.get('glm-local')?.calls === 1, [...internal.keys()])
  check('F3: 白盒 Map（身份键）与可见快照（清洁键）分工一致', [...internal.keys()].sort().join(',') === 'glm-local,oauth:oauth2' && store.snapshot().accountTotals.map((row) => row.provider).sort().join(',') === 'glm-local,oauth2', { internal: [...internal.keys()], snap: store.snapshot().accountTotals.map((row) => row.provider) })
  check('F4: 接线层白盒读取面未改（accountHealth 仍按 oauth 身份键取聚合；getter 透传 store Map）', /const provider = `oauth:\$\{accountId\}`/.test(serviceSource) && /this\.accountTotals\.get\(provider\)/.test(serviceSource) && /get accountTotals\(\) \{[\s\S]{0,40}return this\.stats\.accountTotals/.test(serviceSource))
  store.close()
  rmSync(work, { recursive: true, force: true })
}

// ── G 组：归一化实现全仓唯一（P5）+ 双面 parity（P-v3 原则 9）──────────────
{
  const libNames = ['stats.js', 'wrapper.js', 'preset-defaults.js', 'oauth-llm.js', 'tool.js', 'service.js', 'host-route.js', 'index.js', 'prestep.js', 'rpc.js', 'client.js']
  const normalizeOwners = libNames.filter((name) => /function normalizeAttribution/.test(readRepo(`lib/${name}`)))
  check('G0: 归因单点导出在册（normalizeAttribution / accountDisplayLabel / WRAP_ROUTE_SUFFIX / MAIN_MODEL_AGENT_ID）', typeof statsModule.normalizeAttribution === 'function' && typeof statsModule.accountDisplayLabel === 'function' && statsModule.WRAP_ROUTE_SUFFIX === WRAP_ROUTE_SUFFIX && statsModule.MAIN_MODEL_AGENT_ID === MAIN_MODEL_AGENT_ID, { normalize: typeof statsModule.normalizeAttribution, label: typeof statsModule.accountDisplayLabel, suffix: statsModule.WRAP_ROUTE_SUFFIX, mainModel: statsModule.MAIN_MODEL_AGENT_ID })
  check('G1: normalizeAttribution 全仓唯一实现（无并存的第二套归一化路径）', normalizeOwners.join(',') === 'stats.js', normalizeOwners)
  // 只认字符串字面量（注释里以反引号提及 `<provider>-router` 不算定义点）。
  const suffixOwners = libNames.filter((name) => /['"]-router['"]/.test(readRepo(`lib/${name}`)))
  check('G2: -router 字面量唯一定义点 = lib/stats.js（浏览器面包为显示层镜像，双面各自定义是既有约定）', suffixOwners.join(',') === 'stats.js,client.js', suffixOwners)
  check('G3: wrapper.js 从单点取用后缀与主模型键（自有定义与内部 agentId 已删）', /export const WRAP_SUFFIX = WRAP_ROUTE_SUFFIX/.test(wrapperSource) && !/agentId: 'twin'/.test(wrapperSource) && /agentId: MAIN_MODEL_AGENT_ID/.test(wrapperSource), wrapperSource.match(/WRAP_SUFFIX = [^\n]*/g))
  check('G4: 记录站点汇入单点（call → #fold / scope → #foldScope 各过一次归一化，无旁路——D6 起经实例包装 #normalize 携带宿主路由 resolver）', /#fold\(raw\) \{[\s\S]{0,420}this\.#normalize\(raw\)/.test(statsSource) && /#foldScope\(raw\) \{[\s\S]{0,120}this\.#normalize\(raw\)/.test(statsSource))
  check('G5: 双权威源合并单点（#accountView 一处定义、snapshot 与 CSV 共用——无第二合并路径）', (statsSource.match(/#accountView\(\)/g) ?? []).length === 3 && /#accountView\(\) \{/.test(statsSource), (statsSource.match(/#accountView\(\)/g) ?? []).length)
  check('G6: 站点仍上报事实而非归一值（recordScope 报实际路由；站点零归一化代码）', /provider: config\.provider,/.test(presetDefaultsSource) && !/normalizeAttribution\(/.test(presetDefaultsSource) && !/from '\.\/stats\.js'/.test(presetDefaultsSource) && !/WRAP_SUFFIX/.test(presetDefaultsSource))
  // F-2（R0 审查保留项）：stats.js 依赖面锁定 node: 内建（§22）不能 import
  // 权威常量，故以**值级交叉锚定**取代——镜像常量与权威源声明任一侧漂移，
  // 断言即红（此前注释宣称「G 组锁定」但断言不存在：P9 注释虚指；突变验证：
  // 临时改 OAUTH_PROVIDER/HOST_ROUTE_PROVIDER 值 → G13/G14 精确变红）。
  {
    const aliasDecl = /const ACCOUNT_KEY_ALIASES = new Map\(\[\['([^']+)', '([^']+)'\]\]\)/.exec(statsSource)
    const oauthDecl = /export const OAUTH_PROVIDER = '([^']+)'/.exec(oauthLlmSource)
    check('G13: ACCOUNT_KEY_ALIASES 键锚定权威常量（stats.js 别名键 === oauth-llm.js OAUTH_PROVIDER 值；目标键保持 oauth: 身份命名空间）', !!aliasDecl && !!oauthDecl && aliasDecl[1] === oauthDecl[1] && aliasDecl[2].startsWith('oauth:'), { aliasKey: aliasDecl?.[1], aliasTarget: aliasDecl?.[2], oauthProvider: oauthDecl?.[1] })
    const hostDecl = /export const HOST_ROUTE_PROVIDER = '([^']+)'/.exec(hostRouteSource)
    const hostMirrorDecl = /const HOST_ROUTE_ACCOUNT_KEY = '([^']+)'/.exec(statsSource)
    check('G14: HOST_ROUTE_ACCOUNT_KEY 锚定权威常量（stats.js 镜像 === host-route.js HOST_ROUTE_PROVIDER 值）', !!hostDecl && !!hostMirrorDecl && hostDecl[1] === hostMirrorDecl[1], { hostRoute: hostDecl?.[1], statsMirror: hostMirrorDecl?.[1] })
  }
  if (typeof statsModule.normalizeAttribution === 'function') {
    const { normalizeAttribution, accountDisplayLabel } = statsModule
    check('G7: 归一化纯函数不抛且种类判定正确（非法形态落到清洁缺省实体）', (() => {
      const junk = [null, undefined, 42, 'string', {}, { provider: null, agentId: 7 }]
      if (!junk.every((input) => typeof normalizeAttribution(input).accountKey === 'string' && normalizeAttribution(input).agentKey === MAIN_MODEL_AGENT_ID)) return false
      return normalizeAttribution({ provider: `glm-local${WRAP_ROUTE_SUFFIX}` }).accountKind === 'provider'
        && normalizeAttribution({ provider: 'chatgpt-oauth' }).accountKind === 'oauth'
        && normalizeAttribution({ provider: 'oauth:pool:main' }).accountKind === 'pool'
        && normalizeAttribution({ provider: 'cli:codex' }).accountKind === 'cli'
        && normalizeAttribution({ provider: 'openai-codex' }).accountKind === 'host-route'
        && normalizeAttribution({ provider: 'glm-local', agentId: 'vision' }).mainModel === false
        && normalizeAttribution({ provider: 'glm-local', agentId: 'twin' }).mainModel === true
    })())
    check('G8: 归一化幂等（规范键再过单点不变——读侧重放与双写安全）', ['glm-local-router', 'oauth:chatgpt', 'chatgpt-oauth', 'oauth:pool:x', 'cli:y', 'glm-local', 'openai-codex'].every((raw) => {
      const once = normalizeAttribution({ provider: raw }).accountKey
      return once === normalizeAttribution({ provider: once }).accountKey
    }), ['glm-local-router', 'oauth:chatgpt', 'chatgpt-oauth'].map((raw) => `${raw}→${normalizeAttribution({ provider: raw }).accountKey}`))
    const bundleExports = await loadBrowserBundle()
    check('G9: 浏览器包显示层单点可取（exports 面——宿主运行时只消费 apply/inject）', typeof bundleExports?.accountDisplayKeyOf === 'function' && typeof bundleExports?.agentDisplayKeyOf === 'function' && typeof bundleExports?.statsProviderLabelOf === 'function')
    if (bundleExports) {
      const corpus = [
        ['glm-local', 'glm-local'],
        [`glm-local${WRAP_ROUTE_SUFFIX}`, 'glm-local'],
        [`glm-local${WRAP_ROUTE_SUFFIX}${WRAP_ROUTE_SUFFIX}`, 'glm-local'],
        ['oauth:chatgpt', 'chatgpt'],
        ['chatgpt-oauth', 'chatgpt'],
        ['oauth:pool:gpool', 'gpool'],
        ['cli:codexentry', 'codexentry'],
        ['openai-codex', 'openai-codex'],
        ['opencode-go-local', 'opencode-go-local'],
        ['?', '?'],
      ]
      const drift = corpus
        .filter(([raw, expected]) => bundleExports.accountDisplayKeyOf(raw) !== expected || accountDisplayLabel(normalizeAttribution({ provider: raw }).accountKey) !== expected)
        .map(([raw, expected]) => `${raw} → 浏览器面 ${JSON.stringify(bundleExports.accountDisplayKeyOf(raw))} / 服务端 ${JSON.stringify(accountDisplayLabel(normalizeAttribution({ provider: raw }).accountKey))} / 期望 ${JSON.stringify(expected)}`)
      check('G10: 双面账号键值 parity（浏览器镜像与 lib/stats.js 权威单点对同一语料同解）', drift.length === 0, drift)
      const agentDrift = [['twin', MAIN_MODEL_AGENT_ID], ['main', MAIN_MODEL_AGENT_ID], ['main-model', MAIN_MODEL_AGENT_ID], ['vision', 'vision'], ['', MAIN_MODEL_AGENT_ID]]
        .filter(([raw, expected]) => bundleExports.agentDisplayKeyOf(raw) !== expected || normalizeAttribution({ provider: 'glm-local', agentId: raw }).agentKey !== expected)
        .map(([raw, expected]) => `${JSON.stringify(raw)} → 浏览器面 ${JSON.stringify(bundleExports.agentDisplayKeyOf(raw))} / 服务端 ${JSON.stringify(normalizeAttribution({ provider: 'glm-local', agentId: raw }).agentKey)} (期望 ${JSON.stringify(expected)})`)
      check('G11: 双面 agent 键值 parity（twin/main → main-model；专业 agent 原样）', agentDrift.length === 0, agentDrift)
      const t = (key) => (key === 'statsMainModel' ? '主模型' : key)
      const names = new Map([['oauth|chatgpt', 'ChatGPT 订阅登录'], ['provider|glm-local', 'GLM 本地']])
      check('G12: 显示名单点语义（配置名覆盖 / 主模型用户词汇 / 无 roster 回退清洁键）', bundleExports.statsProviderLabelOf({ provider: 'chatgpt', accountKind: 'oauth' }, names, t) === 'ChatGPT 订阅登录'
        && bundleExports.statsProviderLabelOf({ agentId: 'twin' }, names, t) === '主模型'
        && bundleExports.statsProviderLabelOf({ provider: 'glm-local', accountKind: 'provider' }, names, t) === 'GLM 本地'
        && bundleExports.statsProviderLabelOf({ provider: `glm-local${WRAP_ROUTE_SUFFIX}` }, new Map(), t) === 'glm-local', [
        bundleExports.statsProviderLabelOf({ provider: 'chatgpt', accountKind: 'oauth' }, names, t),
        bundleExports.statsProviderLabelOf({ agentId: 'twin' }, names, t),
      ])
    }
  }
}

// ── H 组：装配点源码契约（旧显示形态不得复活——FIX-029 C 组先例）────────────
{
  check('H1: 明细服务商列旧回退形态已删（内部 agentId 不再当服务商打印）', !/row\.provider \|\| row\.agentId/.test(clientSource))
  check('H2: 统计显示名全部经单点解析（账号卡标题 / 明细列 / 预设卡两处 / roster 映射）', (clientSource.match(/statsProviderLabelOf\(/g) ?? []).length >= 4 && /function statsProviderLabelOf/.test(clientSource) && /rosterDisplayName\(/.test(clientSource), (clientSource.match(/statsProviderLabelOf\(/g) ?? []).length)
  check('H3: 主模型用户词汇在册（zh + en）', /statsMainModel: '主模型'/.test(clientSource) && /statsMainModel: 'Main model'/.test(clientSource))
  check('H4: 主模型分组卡挂载专业 Agent 统计面（归一实体可见而非静默丢弃）', /agentStatsRows/.test(clientSource) && /statsTotals\.has\(MAIN_MODEL_AGENT_ID\)/.test(clientSource))
  check('H5: 账号管理区判据消费 accountKind（清洁键不再被当成可配置账号——幽灵卡防复活）', /total\.accountKind && total\.accountKind !== 'provider'/.test(clientSource))
  check('H6: 账号卡标题旧形态已删（displayName 直取聚合键 / 徽标外显身份键）', !/displayName: total\.provider,\n/.test(clientSource) && !/badge: row\.provider,\n/.test(clientSource))
  check('H7: 预设归属逻辑不动（EV-159 live 罗盘优先保持终态）', /composedPreset\(agent\?\.ctx\)/.test(presetDefaultsSource))
  check('H8: 口径披露在册（账号级调用数 = 请求口径；zh + en + 渲染位点）', (clientSource.match(/statsAccountScopeHint/g) ?? []).length >= 3)
  // 注释可提及内部键（说明为什么剥它），但代码里 'twin' 只允许出现在浏览器面
  // 镜像判据（agentDisplayKeyOf）一处；任何 record 站点/渲染点出现即违规。
  const clientCode = clientSource.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n')
  check('H9: 内部键字面量在浏览器面只剩镜像判据位（record 站点/渲染点零出现）', (clientCode.match(/'twin'/g) ?? []).length === 1 && /id === 'twin'/.test(clientCode) && !/agentId: 'twin'/.test(clientSource), (clientCode.match(/.{0,40}'twin'.{0,40}/g) ?? []))
}

console.log(failed === 0 ? `\nALL FIX-031 DISCRIMINANT TESTS PASSED (${passed} assertions)` : `\n${failed} FAILURES (${passed} passed)`)
process.exit(failed === 0 ? 0 : 1)
