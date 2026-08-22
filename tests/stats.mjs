/**
 * 统计持久化模块测试（roadmap §4 / ADR-006 / EVO-003 Phase 1）。
 *
 * 覆盖（验收标准逐项）：
 * - estimateCost 纯函数（E8：单价表参数化 / 未知模型 zero-cost / usageCost 直读优先）
 * - percentile 分位（p50/p95 nearest-rank）
 * - defaultStatsDir（DSH_HOME → ~/.dsh 回退，EV-028 / oauth-credentials.js 同构）
 * - 内存两级聚合 + snapshot 形状（迁移自 service.js:2414-2561 的等价语义）
 * - E6-a 存储布局：按天 JSONL + index.json（schemaVersion/days）+ 行字段白名单（P7 无敏感内容）
 * - E7-a 写入时机：flushThreshold 异步批量 flush / 队列满丢弃最旧计数 dropped / record 同步不反压
 * - 存储往返（重启恢复聚合）
 * - kill -9 模拟：不完整行自愈跳过 + 文件修复（无半行残留）
 * - 坏行自愈：skippedLines 计数 + 现场文件修复
 * - 文件级损坏：rename daily-*.corrupt-<ts> 保留现场 + 重建空文件继续服务
 * - 版本迁移：migrateLine v1→v2 链（注入迁移模拟未来版本）/ 未知版本行跳过计数且不删数据
 * - retentionDays prune：超期文件消失（启动 + 显式 prune；corrupt 现场同样超期清理；索引项修剪）
 * - 清空保护：软删除默认 stats-backup-<ts>/ 存在且新统计继续累计 / hardDelete 真删
 * - CSV 导出：列齐全（date/agent/account/model/calls/errors/inputTokens/outputTokens/p50ms/p95ms/costEstimate）
 *   + p50/p95 明细分位 + range 过滤 + 引号转义 + agent/account 两 level
 * - persist=false 纯内存（W-4 回退开关的内核语义）
 * - F1（R1 前置项）：persist=false 时 load/prune/quarantine/heal/reset 全部
 *   磁盘路径门控（不读不写——"纯内存=现状行为"语义补全）
 * - F2（R1 前置项）：record() 永不 throw（注入 getAgentName 抛错不击穿调用路径）
 * - F4（R1 前置项）：队列满丢弃的子集身份断言（保留最新，非最旧）
 * - W-4（ARCH-002 IBC-1）：persist 开关往返语义（开→关先 flush 不丢事件；
 *   关→开内存非空跳过 reload 防双计 / 重启后空内存全量恢复 + 重建 index）
 * - flushSync（进程优雅退出路径）
 * - 依赖面结构断言：仅 node: 内建导入（不反向依赖 service.js —— 无环）
 *
 * 与 oauth-credentials.mjs 同构：导出 runStatsTests(check) 供后续 smoke 接线（Phase 2）；
 * 独立入口 node tests/stats.mjs（exit 0/1）。全部用临时目录——不触碰真实 ~/.dsh。
 */
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { StatsStore, estimateCost, defaultStatsDir, migrateLine, percentile, LINE_VERSION, INDEX_SCHEMA_VERSION } from '../lib/stats.js'

const DAY = 86_400_000
/** 固定参考时刻（UTC 2026-01-15 12:00）——按天分文件 / range 过滤用确定性日期。 */
const T0 = Date.UTC(2026, 0, 15, 12, 0, 0)
const D0 = '2026-01-15'
/** 注入时钟：观察者位于 T0+1d（加载窗口/range 裁剪的确定性参照系）。 */
const NOW_AT = () => T0 + DAY

/** 构造合法 v1 行文本（手写文件注入用）。 */
function lineOf(overrides = {}) {
  return JSON.stringify({
    v: 1,
    at: T0,
    agentId: 'vision',
    provider: 'openai',
    model: 'gpt-4o',
    ok: true,
    ms: 10,
    inputTokens: 1,
    outputTokens: 2,
    costEstimate: 0,
    ...overrides,
  })
}

export async function runStatsTests(check) {
  // ── 1. E8 纯函数：estimateCost / percentile ─────────────────────────────
  console.log('pure functions (E8 / p50-p95):')
  const pricing = { 'gpt-4o': { inputPerM: 2.5, outputPerM: 10 } }
  check('estimateCost: input/1e6×inputPerM + output/1e6×outputPerM', estimateCost('gpt-4o', 1e6, 1e6, pricing) === 12.5)
  check('estimateCost: fractional tokens', estimateCost('gpt-4o', 2e5, 5e5, pricing) === 0.5 + 5)
  check('estimateCost: unknown model → zero-cost (missing pricing entry)', estimateCost('mystery', 1e6, 1e6, pricing) === 0)
  check('estimateCost: empty pricing dict → 0', estimateCost('gpt-4o', 1e6, 1e6, {}) === 0)
  check('percentile: p50 nearest-rank on [10,20,30,40,50]', percentile([10, 20, 30, 40, 50], 50) === 30)
  check('percentile: p95 nearest-rank picks max of 5', percentile([10, 20, 30, 40, 50], 95) === 50)
  check('percentile: single value / empty edge', percentile([7], 95) === 7 && percentile([], 50) === 0)
  check('percentile: unsorted input tolerated', percentile([50, 10, 40, 20, 30], 50) === 30)

  // ── 2. defaultStatsDir（EV-028 事实：DSH_HOME → ~/.dsh 回退）──────────────
  console.log('defaultStatsDir (E6-a / EV-028):')
  const envHome = join(tmpdir(), 'stats-env-home')
  check('DSH_HOME set → $DSH_HOME/dsh-agent-router/stats', defaultStatsDir({ env: { DSH_HOME: envHome } }) === join(envHome, 'dsh-agent-router', 'stats'))
  check('no DSH_HOME → <home>/.dsh/dsh-agent-router/stats', defaultStatsDir({ env: {}, home: envHome }) === join(envHome, '.dsh', 'dsh-agent-router', 'stats'))

  // ── 3. 内存两级聚合 + snapshot 形状（service.js 等价语义）─────────────────
  console.log('in-memory aggregation & snapshot:')
  {
    const work = mkdtempSync(join(tmpdir(), 'stats-mem-'))
    const store = new StatsStore({ dir: join(work, 'stats'), persist: false, getAgentName: (id) => (id === 'vision' ? '视觉' : '') })
    store.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 120, inputTokens: 100, outputTokens: 50 })
    store.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: false, ms: 60, inputTokens: 10, outputTokens: 0, error: 'boom', errorClass: 'network' })
    store.record({ agentId: 'draw', provider: 'openai', model: 'dall-e-3', ok: true, ms: 2000 })
    const snap = store.snapshot()
    const vision = snap.totals.find((t) => t.agentId === 'vision')
    const draw = snap.totals.find((t) => t.agentId === 'draw')
    check('agent totals: calls/errors/tokens/ms aggregated (two-level)', !!vision && vision.calls === 2 && vision.errors === 1 && vision.inputTokens === 110 && vision.outputTokens === 50 && vision.totalMs === 180)
    check('agent totals: name resolved via getAgentName, fallback to id', !!vision && vision.name === '视觉' && !!draw && draw.name === 'draw')
    const account = snap.accountTotals[0]
    check('account totals: provider-level with model breakdown', !!account && account.provider === 'openai' && account.calls === 3 && account.errors === 1 && account.inputTokens === 110 && account.totalMs === 2180 && account.models.length === 2)
    const gpt = account.models.find((m) => m.model === 'gpt-4o')
    check('account model breakdown aggregates per model', !!gpt && gpt.calls === 2 && gpt.errors === 1 && gpt.outputTokens === 50)
    check('recent: newest first, error text kept in memory (truncated 300)', snap.recent.length === 3 && snap.recent[0].agentId === 'draw' && snap.recent[1].error === 'boom' && snap.recent[1].errorClass === 'network')
    const visionBuckets = snap.series.filter((s) => s.agentId === 'vision').flatMap((s) => s.buckets)
    check('minute series: agent buckets within window', visionBuckets.reduce((sum, b) => sum + b.calls, 0) === 2)
    const accountBuckets = snap.accountSeries.filter((s) => s.provider === 'openai').flatMap((s) => s.buckets)
    check('minute series: account buckets', accountBuckets.reduce((sum, b) => sum + b.calls, 0) === 3)
    const dayKeys = Object.keys(snap.days)
    check('days aggregate keyed by UTC date', dayKeys.length === 1 && snap.days[dayKeys[0]].calls === 3 && snap.days[dayKeys[0]].errors === 1 && snap.days[dayKeys[0]].inputTokens === 110)
    check('selfReport surface on snapshot', typeof snap.selfReport === 'object' && snap.selfReport !== null && snap.selfReport.dropped === 0)
    check('record is synchronous (no await on call path)', store.record({ agentId: 'draw', provider: 'openai', model: 'dall-e-3', ok: true, ms: 1 }) === undefined)
    store.close()
    rmSync(work, { recursive: true, force: true })
  }

  // ── 4. E6-a 布局 + E8 落盘 + P7 行白名单 ────────────────────────────────
  console.log('storage layout (E6-a) & line security (P7):')
  {
    const work = mkdtempSync(join(tmpdir(), 'stats-layout-'))
    const dir = join(work, 'stats')
    const store = new StatsStore({ dir, pricing })
    store.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 100, inputTokens: 1e6, outputTokens: 1e6, at: T0 })
    store.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: false, ms: 40, inputTokens: 0, outputTokens: 0, error: 'SECRET failure detail', errorClass: 'network', at: T0 })
    store.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 10, inputTokens: 0, outputTokens: 5e5, usageCost: 0.5, at: T0 })
    await store.flush()
    const daily = join(dir, `daily-${D0}.jsonl`)
    check('daily file named daily-YYYY-MM-DD.jsonl (UTC date of event)', existsSync(daily))
    const rows = readFileSync(daily, 'utf8').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l))
    check('one JSONL line per call event', rows.length === 3)
    check('line v field is 1 (first version)', rows.every((r) => r.v === LINE_VERSION))
    const allowed = new Set(['v', 'at', 'agentId', 'provider', 'model', 'ok', 'ms', 'inputTokens', 'outputTokens', 'costEstimate', 'errorClass'])
    check('line keys within whitelist (no error text / credentials persisted)', rows.every((r) => Object.keys(r).every((k) => allowed.has(k))))
    check('error message never persisted (P7: metadata + token counts only)', !readFileSync(daily, 'utf8').includes('SECRET'))
    check('costEstimate from pricing table (E8 formula)', rows[0].costEstimate === 12.5)
    check('usage.cost direct-read takes precedence over estimate', rows[2].costEstimate === 0.5)
    check('errorClass reserved field persisted when present, absent otherwise', rows[1].errorClass === 'network' && !('errorClass' in rows[0]))
    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
    check('index.json carries schemaVersion', index.schemaVersion === INDEX_SCHEMA_VERSION)
    const day = index.days[D0]
    check('index days aggregate: calls/errors/tokens/ms/cost', !!day && day.calls === 3 && day.errors === 1 && day.tokens === 2_500_000 && day.ms === 150 && day.cost === 13)
    check('no temp file leftovers (atomic index write)', readdirSync(dir).filter((n) => n.startsWith('.')).length === 0)
    await store.close()
    rmSync(work, { recursive: true, force: true })
  }

  // ── 5. E7-a：threshold 异步批量 flush / 队列满丢弃最旧 ──────────────────
  console.log('write timing (E7-a):')
  {
    const work = mkdtempSync(join(tmpdir(), 'stats-thresh-'))
    const store = new StatsStore({ dir: join(work, 'stats'), flushThreshold: 2 })
    store.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 1, at: T0 })
    store.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 2, at: T0 })
    await new Promise((resolve) => setTimeout(resolve, 50))
    const flushed = readFileSync(join(work, 'stats', `daily-${D0}.jsonl`), 'utf8').split('\n').filter((l) => l !== '')
    check('auto flush at >= threshold without manual call', flushed.length === 2)
    await store.close()
    rmSync(work, { recursive: true, force: true })
  }
  {
    const work = mkdtempSync(join(tmpdir(), 'stats-drop-'))
    const store = new StatsStore({ dir: join(work, 'stats'), queueMax: 3, flushThreshold: 50 })
    for (let i = 0; i < 5; i++) store.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: i, at: T0 })
    check('queue full drops oldest pending events and counts statsSelfReport.dropped', store.statsSelfReport().dropped === 2)
    check('in-memory aggregates unaffected by queue drop (live totals keep all calls)', store.snapshot().totals[0].calls === 5)
    await store.flush()
    const lines = readFileSync(join(work, 'stats', `daily-${D0}.jsonl`), 'utf8').split('\n').filter((l) => l !== '')
    check('only bounded subset persisted (3 newest of 5)', lines.length === 3)
    // F4（R1 前置项）：子集身份断言——保留的必须是最新 3 条（ms 2,3,4），
    // 而非最旧 3 条（ms 0,1,2）。旧内核若错丢最新（shift 改 pop）本断言必败。
    check('dropped subset is the oldest two (F4: persisted rows are ms 2,3,4 by identity)', lines.map((l) => JSON.parse(l).ms).join(',') === '2,3,4')
    await store.close()
    rmSync(work, { recursive: true, force: true })
  }
  {
    const work = mkdtempSync(join(tmpdir(), 'stats-syncexit-'))
    const store = new StatsStore({ dir: join(work, 'stats') })
    store.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 1, at: T0 })
    store.flushSync()
    check('flushSync persists pending queue (graceful exit path)', readFileSync(join(work, 'stats', `daily-${D0}.jsonl`), 'utf8').trim() !== '')
    await store.close()
    rmSync(work, { recursive: true, force: true })
  }

  // ── 6. 存储往返（重启恢复）───────────────────────────────────────────────
  console.log('restart round-trip:')
  {
    const work = mkdtempSync(join(tmpdir(), 'stats-rt-'))
    const dir = join(work, 'stats')
    const a = new StatsStore({ dir })
    a.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 120, inputTokens: 100, outputTokens: 50, at: T0 })
    a.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: false, ms: 30, error: 'x', at: T0 })
    a.record({ agentId: 'draw', provider: 'openai', model: 'dall-e-3', ok: true, ms: 2000, at: T0 })
    a.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 90, inputTokens: 11, at: T0 + DAY })
    await a.close()
    const b = new StatsStore({ dir, now: NOW_AT })
    await b.load()
    const snap = b.snapshot()
    const vision = snap.totals.find((t) => t.agentId === 'vision')
    const draw = snap.totals.find((t) => t.agentId === 'draw')
    check('agent totals restored across restart (both days folded)', !!vision && vision.calls === 3 && vision.errors === 1 && vision.inputTokens === 111 && vision.totalMs === 240)
    check('second agent restored', !!draw && draw.calls === 1 && draw.totalMs === 2000)
    check('account totals + model breakdown restored', snap.accountTotals[0].calls === 4 && snap.accountTotals[0].models.length === 2)
    check('days aggregates restored for both UTC dates', Object.keys(snap.days).sort().join(',') === [D0, '2026-01-16'].sort().join(','))
    check('recent rebuilt from detail tail (newest first)', snap.recent.length === 4 && snap.recent[0].at === T0 + DAY)
    check('selfReport clean load (no skipped lines)', b.statsSelfReport().skippedLines === 0)
    await b.close()
    rmSync(work, { recursive: true, force: true })
  }

  // ── 7. kill -9 模拟：不完整行自愈（§4.2 原子写验证）─────────────────────
  console.log('kill -9 torn tail self-heal:')
  {
    const work = mkdtempSync(join(tmpdir(), 'stats-torn-'))
    const dir = join(work, 'stats')
    const a = new StatsStore({ dir })
    a.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 10, at: T0 })
    a.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 20, at: T0 })
    await a.close()
    const daily = join(dir, `daily-${D0}.jsonl`)
    appendFileSync(daily, '{"v":1,"at":1771118400') // 半行（无换行）——崩溃窗口模拟
    const b = new StatsStore({ dir, now: NOW_AT })
    await b.load()
    check('torn last line skipped + counted (skippedLines)', b.statsSelfReport().skippedLines === 1)
    check('good lines before tear fully recovered', b.snapshot().totals[0].calls === 2)
    const healed = readFileSync(daily, 'utf8')
    check('file healed: no half-line residue, every line newline-terminated', healed.endsWith('\n') && healed.split('\n').filter((l) => l !== '').length === 2)
    await b.close()
    rmSync(work, { recursive: true, force: true })
  }

  // ── 8. 坏行自愈（§4.2）───────────────────────────────────────────────────
  console.log('bad line self-heal:')
  {
    const work = mkdtempSync(join(tmpdir(), 'stats-badline-'))
    const dir = join(work, 'stats')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `daily-${D0}.jsonl`), `${lineOf()}\nnot-json garbage\n${lineOf({ ms: 20 })}\n`)
    const store = new StatsStore({ dir, now: NOW_AT })
    await store.load()
    check('bad JSON line skipped + counted', store.statsSelfReport().skippedLines === 1)
    check('good lines around garbage both counted', store.snapshot().totals[0].calls === 2 && store.snapshot().totals[0].totalMs === 30)
    const healed = readFileSync(join(dir, `daily-${D0}.jsonl`), 'utf8').split('\n').filter((l) => l !== '')
    check('garbage line removed from file on heal', healed.length === 2 && !healed.some((l) => l.includes('garbage')))
    await store.close()
    rmSync(work, { recursive: true, force: true })
  }

  // ── 9. 文件级损坏：corrupt rename 保留现场（§4.2）────────────────────────
  console.log('file-level corruption quarantine:')
  {
    const work = mkdtempSync(join(tmpdir(), 'stats-corrupt-'))
    const dir = join(work, 'stats')
    mkdirSync(dir, { recursive: true })
    mkdirSync(join(dir, `daily-${D0}.jsonl`)) // 目录占位 daily 文件名（不可读）
    const store = new StatsStore({ dir, now: NOW_AT })
    let loaded = true
    try { await store.load() } catch { loaded = false }
    check('unreadable daily file does not break startup (service continues)', loaded)
    check('corrupt file renamed daily-*.corrupt-<ts> (scene preserved)', readdirSync(dir).some((n) => new RegExp(`^daily-${D0}\\.corrupt-\\d+$`).test(n)))
    check('empty daily file recreated at original path', statSync(join(dir, `daily-${D0}.jsonl`)).isFile())
    check('statsSelfReport.corruptFiles counted', store.statsSelfReport().corruptFiles === 1)
    store.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 5, at: T0 })
    await store.flush()
    check('new events accumulate into recreated file', readFileSync(join(dir, `daily-${D0}.jsonl`), 'utf8').trim() !== '')
    await store.close()
    rmSync(work, { recursive: true, force: true })
  }

  // ── 10. 版本迁移（§4.2：migrateLine vN→vN+1 链）──────────────────────────
  console.log('version migration:')
  {
    check('migrateLine walks the chain v1→v2 (pure)', (() => {
      const out = migrateLine({ v: 1, at: 1, agentId: 'a', provider: 'p', model: 'm', ok: true, ms: 1, inputTokens: 0, outputTokens: 0, costEstimate: 0 }, { toVersion: 2, migrations: { 2: (l) => ({ ...l, tag: 'm2' }) } })
      return out !== null && out.v === 2 && out.tag === 'm2'
    })())
    check('migrateLine returns null when chain step missing', migrateLine({ v: 1 }, { toVersion: 3, migrations: {} }) === null)
    const work = mkdtempSync(join(tmpdir(), 'stats-mig-'))
    const dir = join(work, 'stats')
    const a = new StatsStore({ dir })
    a.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 10, inputTokens: 3, at: T0 })
    await a.close()
    const migrations = { 2: (l) => ({ ...l, tag: 'm2' }) }
    const b = new StatsStore({ dir, now: NOW_AT, migrations, lineVersion: 2 })
    await b.load()
    check('v1 lines migrated on load (migratedLines counted)', b.statsSelfReport().migratedLines === 1 && b.snapshot().totals[0].calls === 1)
    b.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 5, at: T0 })
    await b.flush()
    const rows = readFileSync(join(dir, `daily-${D0}.jsonl`), 'utf8').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l))
    check('store at lineVersion 2 writes v2 lines; migrated line upgraded on disk', rows.length === 2 && rows.every((r) => r.v === 2 && r.tag === 'm2'))
    await b.close()
    // 未知版本：跳过计数 + 数据保留（P7 不损用户数据——未来版本行留给升级后的插件读）。
    const work2 = mkdtempSync(join(tmpdir(), 'stats-unk-'))
    const dir2 = join(work2, 'stats')
    mkdirSync(dir2, { recursive: true })
    writeFileSync(join(dir2, `daily-${D0}.jsonl`), `${JSON.stringify({ ...JSON.parse(lineOf()), v: 99 })}\n`)
    const c = new StatsStore({ dir: dir2, now: NOW_AT })
    await c.load()
    check('unknown version line skipped + counted (skippedVersionLines)', c.statsSelfReport().skippedVersionLines === 1 && c.snapshot().totals.length === 0)
    check('unknown version line preserved on disk (not deleted)', readFileSync(join(dir2, `daily-${D0}.jsonl`), 'utf8').includes('"v":99'))
    await c.close()
    rmSync(work, { recursive: true, force: true })
    rmSync(work2, { recursive: true, force: true })
  }

  // ── 11. 保留期 prune（§4.2：retentionDays 默认 90，启动 + 每日）──────────
  console.log('retention prune:')
  {
    const work = mkdtempSync(join(tmpdir(), 'stats-prune-'))
    const dir = join(work, 'stats')
    mkdirSync(dir, { recursive: true })
    const today = new Date().toISOString().slice(0, 10)
    const todayAt = new Date(`${today}T12:00:00Z`).getTime()
    writeFileSync(join(dir, 'daily-2020-01-01.jsonl'), `${lineOf({ at: Date.UTC(2020, 0, 1) })}\n`)
    writeFileSync(join(dir, `daily-${today}.jsonl`), `${lineOf({ at: todayAt })}\n`)
    writeFileSync(join(dir, 'daily-2020-01-01.corrupt-1577836800000'), 'scene')
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ schemaVersion: 1, generatedAt: 0, days: { '2020-01-01': { calls: 1, errors: 0, tokens: 3, ms: 10, cost: 0, inputTokens: 1, outputTokens: 2 }, [today]: { calls: 1, errors: 0, tokens: 3, ms: 10, cost: 0, inputTokens: 1, outputTokens: 2 } } }))
    const store = new StatsStore({ dir })
    const result = store.prune()
    check('prune removes expired daily files and expired corrupt scenes', result.removedFiles === 2 && !existsSync(join(dir, 'daily-2020-01-01.jsonl')) && !existsSync(join(dir, 'daily-2020-01-01.corrupt-1577836800000')))
    check('prune keeps files within retentionDays', existsSync(join(dir, `daily-${today}.jsonl`)))
    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
    check('prune trims index days entries', !('2020-01-01' in index.days) && today in index.days)
    // 启动时自动 prune：重建超期文件 → load() 后消失。
    writeFileSync(join(dir, 'daily-2020-01-01.jsonl'), `${lineOf({ at: Date.UTC(2020, 0, 1) })}\n`)
    await store.load()
    check('load() prunes expired files at startup', !existsSync(join(dir, 'daily-2020-01-01.jsonl')) && store.snapshot().totals[0]?.calls === 1)
    await store.close()
    rmSync(work, { recursive: true, force: true })
  }

  // ── 12. 清空保护：软删除默认（§4.2）─────────────────────────────────────
  console.log('clear protection (soft delete default):')
  {
    const work = mkdtempSync(join(tmpdir(), 'stats-reset-'))
    const dir = join(work, 'stats')
    const a = new StatsStore({ dir })
    a.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 10, at: T0 })
    await a.close()
    const b = new StatsStore({ dir, now: NOW_AT })
    await b.load()
    const { backupDir } = await b.reset()
    check('reset() soft-deletes: stats-backup-<ts> dir created as sibling', !!backupDir && basename(backupDir).startsWith('stats-backup-') && dirname(backupDir) === dirname(dir) && existsSync(backupDir))
    check('backup preserves old daily file (recoverable by hand)', existsSync(join(backupDir, `daily-${D0}.jsonl`)))
    check('stats dir recreated + fresh empty index', existsSync(join(dir, 'index.json')) && Object.keys(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).days).length === 0)
    check('in-memory aggregates cleared', b.snapshot().totals.length === 0)
    b.record({ agentId: 'draw', provider: 'openai', model: 'dall-e-3', ok: true, ms: 7, at: T0 + 2 * DAY })
    await b.flush()
    check('new stats accumulate after reset (fresh daily file)', existsSync(join(dir, 'daily-2026-01-17.jsonl')) && b.snapshot().totals[0].calls === 1)
    const backupsBefore = readdirSync(work).filter((n) => n.startsWith('stats-backup-')).length
    await b.reset({ hardDelete: true })
    check('hardDelete:true removes contents without new backup', readdirSync(work).filter((n) => n.startsWith('stats-backup-')).length === backupsBefore && readdirSync(dir).join(',') === 'index.json')
    await b.close()
    rmSync(work, { recursive: true, force: true })
  }

  // ── 13. CSV 导出（§4.3：列齐全 / 分位 / range / 转义 / level）───────────
  console.log('CSV export:')
  {
    const work = mkdtempSync(join(tmpdir(), 'stats-csv-'))
    const dir = join(work, 'stats')
    const store = new StatsStore({ dir, now: NOW_AT, pricing: { 'gpt-4o': { inputPerM: 1000, outputPerM: 2000 } } })
    for (const ms of [10, 20, 30, 40, 50]) store.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms, inputTokens: 10, outputTokens: 5, at: T0 })
    store.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 999, at: T0 - 8 * DAY }) // range 外
    store.record({ agentId: 'draw', provider: 'weird', model: 'm,d"q', ok: false, ms: 7, at: T0 })
    const csv = store.export({ range: '7d', level: 'agent' })
    const [header, ...rows] = csv.split('\n')
    check('CSV header has all 11 columns in spec order', header === 'date,agent,account,model,calls,errors,inputTokens,outputTokens,p50ms,p95ms,costEstimate')
    const visionRow = rows.find((r) => r.startsWith(`${D0},vision,openai,gpt-4o,`))
    check('agent row aggregates calls/tokens with p50/p95 from detail', visionRow === `${D0},vision,openai,gpt-4o,5,0,50,25,30,50,0.1`)
    check('quoted model field escaped (comma + double quote)', rows.some((r) => r.includes('"m,d""q"')))
    check('range 7d excludes events 8 days old', !rows.some((r) => r.startsWith('2026-01-07,')))
    const full = store.export({ range: '90d', level: 'agent' })
    check('range 90d includes old event', full.split('\n').some((r) => r.startsWith('2026-01-07,vision,openai,gpt-4o,1,0,0,0,999,999,0')))
    const accountCsv = store.export({ range: '7d', level: 'account' })
    const accountRows = accountCsv.split('\n').slice(1)
    const openaiRow = accountRows.find((r) => r.startsWith(`${D0},,openai,gpt-4o,`))
    check('account level groups by provider+model with empty agent column', openaiRow === `${D0},,openai,gpt-4o,5,0,50,25,30,50,0.1`)
    check('account level includes other provider row', accountRows.some((r) => r.startsWith(`${D0},,weird,`)))
    await store.close()
    rmSync(work, { recursive: true, force: true })
  }

  // ── 14. persist=false：纯内存（W-4 回退开关内核语义）────────────────────
  console.log('persist=false (memory-only fallback):')
  {
    const work = mkdtempSync(join(tmpdir(), 'stats-nopersist-'))
    const dir = join(work, 'stats')
    const store = new StatsStore({ dir, persist: false })
    store.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 1, at: T0 })
    await store.flush()
    await store.close()
    check('persist=false writes nothing to disk (back to memory-only behaviour)', !existsSync(dir) || readdirSync(dir).length === 0)
    check('persist=false keeps live aggregation', new StatsStore({ dir, persist: false }).snapshot().totals.length === 0)
    rmSync(work, { recursive: true, force: true })
  }

  // ── 15. F1（R1 前置项）：persist=false 时全部磁盘路径门控（不读不写）──
  console.log('persist=false disk-path gating (F1):')
  {
    const work = mkdtempSync(join(tmpdir(), 'stats-f1-'))
    const dir = join(work, 'stats')
    mkdirSync(dir, { recursive: true })
    // 三类会被写路径触碰的现场：超期文件（load 首步 prune 会删）、窗口内
    // 坏行文件（heal 会重写清除）、目录占位 daily 名（quarantine 会 rename
    // 保留现场 + 重建空文件）+ 超期 index 项（prune 会裁剪镜像）。
    writeFileSync(join(dir, 'daily-2020-01-01.jsonl'), `${lineOf({ at: Date.UTC(2020, 0, 1) })}\n`)
    writeFileSync(join(dir, `daily-${D0}.jsonl`), `${lineOf()}\nnot-json garbage\n`)
    mkdirSync(join(dir, 'daily-2026-01-14.jsonl'))
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ schemaVersion: 1, generatedAt: 0, days: { '2020-01-01': { calls: 1, errors: 0, tokens: 3, ms: 10, cost: 0, inputTokens: 1, outputTokens: 2 } } }))
    const before = readdirSync(dir).sort().join(',')
    const badContent = readFileSync(join(dir, `daily-${D0}.jsonl`), 'utf8')
    const store = new StatsStore({ dir, persist: false, now: NOW_AT })
    const report = await store.load()
    check('persist=false load(): expired file NOT pruned (F1 gate)', existsSync(join(dir, 'daily-2020-01-01.jsonl')))
    check('persist=false load(): bad-line file NOT healed (byte-identical)', readFileSync(join(dir, `daily-${D0}.jsonl`), 'utf8') === badContent)
    check('persist=false load(): directory-occupying daily name NOT quarantined', existsSync(join(dir, 'daily-2026-01-14.jsonl')) && !readdirSync(dir).some((n) => n.includes('.corrupt-')))
    check('persist=false load(): index.json NOT rewritten/trimmed (byte-identical dir listing)', readdirSync(dir).sort().join(',') === before)
    check('persist=false load(): nothing folded into memory (no disk read)', store.snapshot().totals.length === 0)
    check('persist=false load(): no heal/quarantine counters (nothing parsed)', report.skippedLines === 0 && report.corruptFiles === 0)
    const pruneResult = store.prune()
    check('persist=false prune(): no-op zeros + files intact', pruneResult.removedFiles === 0 && pruneResult.removedDays === 0 && readdirSync(dir).sort().join(',') === before)
    // false 期清空（W-4 IBC-1 ②）：纯内存清零 = 现状 resetStats 行为；盘上
    // 数据不动（无 backup、无删除——磁盘快照留给重新启用后恢复）。
    store.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 1, at: T0 })
    const resetOut = await store.reset()
    check('persist=false reset(): memory cleared, no backup dir, disk untouched', store.snapshot().totals.length === 0 && resetOut.backupDir === '' && readdirSync(dir).sort().join(',') === before)
    await store.close()
    rmSync(work, { recursive: true, force: true })
  }

  // ── 16. F2（R1 前置项）：record() 永不 throw——注入函数抛错不击穿调用路径
  console.log('record() never throws on injected-function failure (F2):')
  {
    const work = mkdtempSync(join(tmpdir(), 'stats-f2-'))
    const dir = join(work, 'stats')
    // getAgentName 是 service.getAgent 迁移缝（Phase 2 注入）——注入函数抛错
    // 不得击穿 #fold/record（service.js 池 catch 语境依赖"record 永不 throw"）。
    const store = new StatsStore({ dir, persist: false, getAgentName: () => { throw new Error('injected getAgentName boom') } })
    let threw = false
    try {
      store.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 10, inputTokens: 1, at: T0 })
    } catch {
      threw = true
    }
    check('record() swallows injected getAgentName throw (never-throw invariant)', threw === false)
    // 抛错后 store 保持可用（后续正常注入下继续聚合）。
    store.getAgentName = (id) => `name:${id}`
    store.record({ agentId: 'draw', provider: 'openai', model: 'dall-e-3', ok: true, ms: 5, at: T0 })
    check('store remains usable after swallowed record failure', store.snapshot().totals.some((t) => t.agentId === 'draw' && t.calls === 1))
    await store.close()
    rmSync(work, { recursive: true, force: true })
  }

  // ── 17. W-4（ARCH-002 IBC-1）：persist 开关往返语义（开→关→开，统计不损）
  console.log('W-4 persist toggle round-trip:')
  {
    const work = mkdtempSync(join(tmpdir(), 'stats-w4-'))
    const dir = join(work, 'stats')
    const a = new StatsStore({ dir, flushThreshold: 50, now: NOW_AT })
    a.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 10, inputTokens: 1, at: T0 })
    await a.setPersist(false)
    check('setPersist(false) flushes pending queue first (recorded event never lost)', readFileSync(join(dir, `daily-${D0}.jsonl`), 'utf8').split('\n').filter((l) => l !== '').length === 1)
    a.record({ agentId: 'draw', provider: 'openai', model: 'dall-e-3', ok: true, ms: 20, at: T0 })
    await a.flush()
    check('events during persist=false stay memory-only (explicit flush writes nothing)', readFileSync(join(dir, `daily-${D0}.jsonl`), 'utf8').split('\n').filter((l) => l !== '').length === 1)
    check('timeline continuous in memory across toggle-off (both agents visible)', a.snapshot().totals.length === 2)
    await a.setPersist(true)
    check('setPersist(true) with live memory skips reload (no double-count of disk data)', a.snapshot().totals.find((t) => t.agentId === 'vision')?.calls === 1)
    check('setPersist(true) rebuilds index mirror on re-enable', existsSync(join(dir, 'index.json')))
    a.record({ agentId: 'vision', provider: 'openai', model: 'gpt-4o', ok: true, ms: 5, at: T0 })
    await a.close()
    const rows = readFileSync(join(dir, `daily-${D0}.jsonl`), 'utf8').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l))
    check('round-trip loses no data: pre-switch + post-re-enable events persisted', rows.filter((r) => r.agentId === 'vision').length === 2)
    check('memory-only semantics held for false-period events (P7: droppable by design)', !rows.some((r) => r.agentId === 'draw'))
    // false 期重启后重新启用：内存为空 → load 全量恢复磁盘聚合（IBC-1 ①）。
    // 构造 persist=false 模拟"启动时设置即为关"的接线形态，随后开启开关。
    const b = new StatsStore({ dir, now: NOW_AT, persist: false })
    await b.setPersist(true)
    const restored = b.snapshot()
    check('re-enable after restart (empty memory) reloads disk aggregates in full', restored.totals.find((t) => t.agentId === 'vision')?.calls === 2 && restored.totals[0]?.name === restored.totals[0]?.agentId)
    await b.close()
    rmSync(work, { recursive: true, force: true })
  }

  // ── 18. 依赖面结构断言（§4.4：仅 node: 内建，不反向依赖——无环）──────────
  console.log('dependency surface (acyclic):')
  {
    const source = readFileSync(new URL('../lib/stats.js', import.meta.url), 'utf8')
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
    check('stats.js imports only node: builtins (no service.js reverse dependency)', imports.length > 0 && imports.every((spec) => spec.startsWith('node:')))
    check('stats.js does not import sibling runtime modules', !imports.some((spec) => spec.startsWith('./')))
  }
}

// 独立入口：node tests/stats.mjs（与 smoke 接线互补——Phase 2 解锁后接入；exit 0/1）。
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  let failures = 0
  let passed = 0
  const check = (label, condition) => {
    if (condition) { passed++; console.log(`  ok  ${label}`) }
    else { failures++; console.error(`FAIL  ${label}`) }
  }
  await runStatsTests(check)
  console.log(failures === 0 ? `\nALL STATS TESTS PASSED (${passed} assertions)` : `\n${failures} FAILURES (${passed} passed)`)
  process.exit(failures === 0 ? 0 : 1)
}
