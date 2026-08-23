/**
 * 统计持久化模块（roadmap §4 / ADR-006 / EVO-003 Phase 1）。
 *
 * 职责（§4.4，≤3 句）：① 接收 record 事件做内存两级聚合（agent / 账号含模型
 * 细分、最近明细、分钟桶、按天聚合）并写入有界待写队列（一次数组 push，
 * 微秒级，绝不反压调用路径——E7-a）；② 异步批量持久化到 DSH_HOME 按天
 * JSONL + index.json 聚合镜像（原子写 / 损坏自愈 / 版本迁移 / 保留期与软删除
 * 四件套——§4.2）；③ 提供 snapshot / export(CSV) / prune / load / reset
 * 生命周期 API，供 service.js 委托消费（Phase 2 接线）。
 *
 * 设计事实（§4.1/§4.2/ADR-006，Coordinator 已裁决）：
 * - 存储布局（E6-a）：`$DSH_HOME/dsh-agent-router/stats/daily-YYYY-MM-DD.jsonl`
 *   （UTC 日期；每行一条调用事件，字段白名单 v/at/agentId/provider/model/ok/
 *   ms/inputTokens/outputTokens/costEstimate[errorClass]——不含错误文本/凭据，
 *   P7）+ `index.json`（{schemaVersion, days:{date→{calls,errors,tokens,ms,cost,
 *   inputTokens,outputTokens}}}——非权威镜像，可从明细全量重建）。
 * - 写入时机（E7-a）：record() 同步聚合 + 入队；flush 由 ≥flushThreshold（50）、
 *   ≥flushIntervalMs（5s）定时器或优雅退出（flushSync）触发；queueMax（1000）
 *   满时丢弃最旧待写事件并计数 statsSelfReport.dropped（只影响持久化，不影响
 *   内存聚合；崩溃丢失窗口 ≤5s——统计为插件自有非关键数据，P7 语义）。
 * - 成本估算（E8）：estimateCost 纯函数（pricing dict：model → {inputPerM,
 *   outputPerM}，缺省 0 = zero-cost——订阅/未知模型仅计 token）；端点自带
 *   usage.cost（record.usageCost）直读优先。
 * - 损坏自愈（§4.2）：加载逐行 parse，坏行/半行跳过 + skippedLines 计数并修复
 *   文件（去掉坏行）；未知版本行跳过 + skippedVersionLines 计数但**保留在磁盘**
 *   （留给升级后的插件读取——不损用户数据）；文件级不可读（如目录占位）→
 *   rename 为 `daily-*.corrupt-<ts>` 保留现场 + 重建空文件继续服务；index.json
 *   temp+rename 原子替换。
 * - 版本迁移（§4.2）：行 v 字段首版 v1；migrateLine 沿 vN→vN+1 迁移函数链升级，
 *   链缺步返回 null（按未知版本处理）；迁移成功后回写文件（磁盘收敛到当前版本，
 *   避免每次加载重复迁移）。
 * - 保留期与清空（§4.2）：retentionDays 默认 90（DEC-018 Q3）——load() 启动时
 *   + 每日定时 prune 超期 daily 文件（含 .corrupt 现场）与索引项；reset() 软删除
 *   默认（stats/ → 同级 `<name>-backup-<ts>/`，默认即 stats-backup-<ts>，不自动
 *   清理）；hardDelete:true 真删。
 * - 持久化开关（W-4，ARCH-002 IBC-1）：persist=false = 纯内存 = 现状行为
 *   ——不读不写磁盘（load/heal/quarantine/prune/reset 磁盘段全门控，F1）；
 *   开关往返经 setPersist（开→关先 flush 不丢已记录事件；关→开空内存全量
 *   恢复 + 重建索引，非空内存跳过 reload 防双计）。
 * - p50/p95（§4.3）：明细排序 nearest-rank 分位，惰性计算（export 时聚合）；
 *   分组样本超过 PERCENTILE_SAMPLE_MAX 时降级为确定性步长采样（reservoir 预留
 *   接口的 Phase 1 落地形态）。
 *
 * 依赖面（§4.4 依赖源定位，无环）：仅 Node 内建——node:fs（含 promises）、
 * node:path、node:os（homedir：DSH_HOME 未设时回退 ~/.dsh，EV-028 事实 /
 * oauth-credentials.js 同构先例）；零包依赖、不 import 任何兄弟模块——被
 * service.js 消费不反向依赖（§6）。
 *
 * 边界（C3 单职责）：本模块只管统计聚合/持久化/导出——不做 RPC codec、不做
 * UI、不读 settings（schemas 配置接线属 Phase 2）；错误处理内聚（加载/写路径
 * 失败自愈 + 计数，绝不抛入调用路径——record() 永不 throw）。
 * @module dsh-agent-router/stats
 */
import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { appendFileSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

/** 明细行格式版本（§4.2 版本迁移：首版 v1）。 */
export const LINE_VERSION = 1

/** index.json 聚合索引的 schema 版本。 */
export const INDEX_SCHEMA_VERSION = 1

/** 保留期默认天数（DEC-018 Q3 裁决：90 天）。 */
export const DEFAULT_RETENTION_DAYS = 90

/** 待写队列容量上限（E7-a 有界队列；满时丢弃最旧并计数）。 */
export const QUEUE_MAX_DEFAULT = 1000

/** 批量 flush 触发阈值（≥N 条，E7-a）。 */
export const FLUSH_THRESHOLD_DEFAULT = 50

/** 批量 flush 定时间隔（ms，E7-a：崩溃丢失窗口 ≤5s）。 */
export const FLUSH_INTERVAL_MS = 5_000

/** 每日 prune 定时间隔（ms）。 */
export const DAILY_PRUNE_MS = 24 * 3_600_000

/** 最近明细内存上限（与 service.js 现统计同值：RECENT_CAP=100 迁移语义）。 */
export const RECENT_CAP = 100

/** 分钟序列窗口（分钟；与 service.js SERIES_WINDOW_MINUTES=90 迁移语义）。 */
export const SERIES_WINDOW_MINUTES = 90

/** 明细内存上限（行；超出丢最旧并计数——有界内存，BC-E2）。 */
export const DETAIL_MAX_DEFAULT = 250_000

/** 单分组分位计算的样本上限（超出降级确定性步长采样——§4.3 reservoir 预留）。 */
export const PERCENTILE_SAMPLE_MAX = 100_000

const DAY_MS = 86_400_000
/** temp 文件序号（原子写 temp+rename 的临时名后缀）。 */
let TEMP_SEQ = 0

/**
 * 成本估算纯函数（E8）：`input/1e6×inputPerM + output/1e6×outputPerM`。
 * pricing 为 model → {inputPerM, outputPerM} 字典；缺省条目/缺省表 → 0
 * （zero-cost 语义——订阅账号/未知模型仅计 token 不折算现金）。
 */
export function estimateCost(model, inputTokens, outputTokens, pricing = {}) {
  const entry = pricing && typeof pricing === 'object' ? pricing[model] : undefined
  if (!entry || typeof entry !== 'object') return 0
  const inputPerM = Number(entry.inputPerM) || 0
  const outputPerM = Number(entry.outputPerM) || 0
  return (Number(inputTokens) || 0) / 1e6 * inputPerM + (Number(outputTokens) || 0) / 1e6 * outputPerM
}

/**
 * nearest-rank 分位（p50/p95，§4.3）：明细 ms 排序后取第 ceil(p%×n) 位。
 * 空数组 → 0；输入未排序 tolerated（内部排序）。
 */
export function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length))) - 1
  return sorted[index]
}

/**
 * 分位样本降级（§4.3 超量 reservoir 预留接口的确定性落地）：样本超
 * PERCENTILE_SAMPLE_MAX 时按步长取样（首元素保留，确定性可重演）。
 */
function sampleForPercentile(values) {
  if (values.length <= PERCENTILE_SAMPLE_MAX) return values
  const step = Math.ceil(values.length / PERCENTILE_SAMPLE_MAX)
  const out = []
  for (let index = 0; index < values.length; index += step) out.push(values[index])
  return out
}

/**
 * 版本迁移链（§4.2）：把 vN 行沿 migrations[vN+1] 逐步升到 toVersion。
 * 迁移函数只增不删（旧字段缺省）；链缺步 / 版本非法 / 超前版本 → null
 * （调用方按未知版本处理——跳过计数但保留原始数据）。
 */
export function migrateLine(line, { toVersion = LINE_VERSION, migrations = {} } = {}) {
  if (!line || typeof line !== 'object' || Array.isArray(line)) return null
  let version = Number(line.v)
  if (!Number.isInteger(version) || version < 1 || version > toVersion) return null
  let out = { ...line }
  while (version < toVersion) {
    const step = migrations[version + 1]
    if (typeof step !== 'function') return null
    out = step(out)
    if (!out || typeof out !== 'object') return null
    version += 1
  }
  out.v = toVersion
  return out
}

/**
 * 默认统计目录（E6-a / EV-028 事实）：`DSH_HOME` 环境变量存在 →
 * `$DSH_HOME/dsh-agent-router/stats`；未设 → `~/.dsh/dsh-agent-router/stats`。
 * options.env / options.home 仅测试注入用（与真实 process.env 隔离，
 * oauth-credentials.js 同构）。
 */
export function defaultStatsDir(options = {}) {
  const env = options.env ?? process.env
  const home = typeof options.home === 'string' && options.home ? options.home : homedir()
  const override = typeof env.DSH_HOME === 'string' && env.DSH_HOME ? env.DSH_HOME : ''
  return join(override || join(home, '.dsh'), 'dsh-agent-router', 'stats')
}

/** UTC 日期键（按天分文件的文件名段与聚合键）。 */
function dateKeyOf(at) {
  return new Date(at).toISOString().slice(0, 10)
}

/** 分钟键（ISO 截断到分钟——service.js minuteKey 迁移语义）。 */
function minuteKeyOf(at) {
  return new Date(at).toISOString().slice(0, 16)
}

/** CSV 字段转义（含逗号/引号/换行时双引号包裹，引号翻倍）。
 *  R1-F3（carried P2）：公式注入防护——首字符为 = + - @ 时前缀单引号
 *  （OWASP/RFC 建议：Excel 会把 =+-@ 开头的单元格当公式求值）。对已
 *  双引号包裹的字段同样生效（前导 ' 使单元格视为文本，Excel 不再求值）。 */
function csvEscape(value) {
  const text = String(value)
  const escaped = /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  if (/^[=+\-@]/.test(text)) return `'${escaped}`
  return escaped
}

/** 成本数值格式化（µ 精度舍入，避免浮点噪声进入 CSV）。 */
function fmtCost(value) {
  return String(Math.round((Number(value) || 0) * 1e6) / 1e6)
}

const DAILY_FILE_RE = /^daily-(\d{4}-\d{2}-\d{2})\.jsonl$/
const DAILY_CORRUPT_RE = /^daily-(\d{4}-\d{2}-\d{2})\.corrupt-(\d+)$/

/**
 * 统计持久化内核。record() 同步且永不抛出（统计失败绝不影响调用路径，P7）；
 * 全部磁盘路径（load/flush/prune/reset）自愈 + 计数，不向调用方抛错——除
 * reset 的文件系统操作失败（用户显式动作必须得到反馈）。
 */
export class StatsStore {
  /** in-flight flush 合并句柄。 */
  #flushing = null
  /** setPersist 转换串行链（R2-F1：并发翻转时后请求链到在途转换之后，
   *  保证"最后写入者胜出"——旧实现首行早退在转换窗口内吞掉新请求）。 */
  #persistTransition = null
  /** flush 定时器句柄。 */
  #timer = null
  /** 每日 prune 定时器句柄。 */
  #pruneTimer = null
  /** close 后停止入队/定时器。 */
  #closed = false
  /** process 'exit' 同步 flush 钩子。 */
  #exitHandler = null

  constructor(options = {}) {
    /** 统计根目录（stats/ 本体）。 */
    this.dir = typeof options.dir === 'string' && options.dir ? options.dir : defaultStatsDir({ env: options.env, home: options.home })
    /** 持久化开关（W-4 回退开关内核语义：false = 纯内存 = 现状行为）。 */
    this.persist = options.persist !== false
    this.retentionDays = Number.isFinite(Number(options.retentionDays)) && Number(options.retentionDays) > 0 ? Number(options.retentionDays) : DEFAULT_RETENTION_DAYS
    /** E8 单价表（Phase 2 由 schemas router.pricing 接线；缺省 zero-cost）。 */
    this.pricing = options.pricing && typeof options.pricing === 'object' ? options.pricing : {}
    this.queueMax = Number.isFinite(Number(options.queueMax)) && Number(options.queueMax) >= 1 ? Math.floor(Number(options.queueMax)) : QUEUE_MAX_DEFAULT
    this.flushThreshold = Number.isFinite(Number(options.flushThreshold)) && Number(options.flushThreshold) >= 1 ? Math.floor(Number(options.flushThreshold)) : FLUSH_THRESHOLD_DEFAULT
    this.flushIntervalMs = Number.isFinite(Number(options.flushIntervalMs)) && Number(options.flushIntervalMs) > 0 ? Number(options.flushIntervalMs) : FLUSH_INTERVAL_MS
    this.dailyPruneMs = Number.isFinite(Number(options.dailyPruneMs)) && Number(options.dailyPruneMs) > 0 ? Number(options.dailyPruneMs) : DAILY_PRUNE_MS
    /** 启动加载的明细天数窗口（更早日期走 index 聚合种子，BC-E2）。 */
    this.detailDays = Number.isFinite(Number(options.detailDays)) && Number(options.detailDays) >= 1 ? Math.floor(Number(options.detailDays)) : DEFAULT_RETENTION_DAYS
    /** 写出行版本与迁移链（默认 v1；测试/未来版本注入 migrations 升级）。 */
    this.lineVersion = Number.isInteger(Number(options.lineVersion)) && Number(options.lineVersion) >= 1 ? Number(options.lineVersion) : LINE_VERSION
    this.migrations = options.migrations && typeof options.migrations === 'object' ? options.migrations : {}
    /** agent 显示名解析（service.getAgent 迁移缝——Phase 2 注入）。 */
    this.getAgentName = typeof options.getAgentName === 'function' ? options.getAgentName : null
    this.now = typeof options.now === 'function' ? options.now : () => Date.now()

    // 内存聚合态（service.js 五字段迁移语义 + 按天聚合 + 明细）。
    this.totals = new Map()
    this.accountTotals = new Map()
    this.series = new Map()
    this.accountSeries = new Map()
    this.recent = []
    /** date → {calls,errors,inputTokens,outputTokens,tokens,ms,cost}。 */
    this.days = new Map()
    /** 已验证明细行（export 分位惰性计算的数据源；有界）。 */
    this.detail = []

    /** 待写队列（E7-a：有界，满丢最旧）。 */
    this.queue = []
    this.selfReport = { dropped: 0, skippedLines: 0, skippedVersionLines: 0, corruptFiles: 0, migratedLines: 0, writeErrors: 0, indexRebuilt: 0, detailDropped: 0, recordErrors: 0 }

    this.#flushing = null
    this.#timer = null
    this.#pruneTimer = null
    this.#closed = false
    if (this.persist) {
      this.#exitHandler = () => this.flushSync()
      process.on('exit', this.#exitHandler)
    }
  }

  // ── 记录路径（同步、微秒级、永不抛出）────────────────────────────────────

  /**
   * 记录一次调用结果（service.js record 迁移语义 + 持久化入队）。
   * event：{ agentId, provider, model, ok, ms, inputTokens?, outputTokens?,
   * error?, errorClass?, usageCost?, at? }（at 缺省 now——host 回填场景可注入）。
   */
  record(event) {
    let rec
    try {
      if (!event || typeof event !== 'object' || typeof event.agentId !== 'string' || !event.agentId) return
      const at = Number.isFinite(Number(event.at)) ? Number(event.at) : this.now()
      const inputTokens = Math.max(0, Number(event.inputTokens) || 0)
      const outputTokens = Math.max(0, Number(event.outputTokens) || 0)
      const ms = Math.max(0, Number(event.ms) || 0)
      const provider = typeof event.provider === 'string' && event.provider ? event.provider : '?'
      const model = typeof event.model === 'string' && event.model ? event.model : '?'
      const ok = event.ok !== false
      const usageCost = Number(event.usageCost)
      const costEstimate = Number.isFinite(usageCost) ? usageCost : estimateCost(model, inputTokens, outputTokens, this.pricing)
      const errorClass = typeof event.errorClass === 'string' && event.errorClass ? event.errorClass : ''
      rec = { at, agentId: event.agentId, provider, model, ok, ms, inputTokens, outputTokens, costEstimate, errorClass }
    } catch {
      return
    }
    // F2（R1 前置项）：#fold/recent 构造全部纳入 try——注入函数（getAgentName
    // 迁移缝等）抛错只损失本条统计，绝不击穿"record() 永不 throw"不变量
    //（service.js 池 catch 语境在 record 后继续执行，E7-a/P7）。
    try {
      this.#fold(rec)
      this.recent.unshift({
        at: rec.at,
        agentId: rec.agentId,
        provider: rec.provider,
        model: rec.model,
        ok: rec.ok,
        ms: rec.ms,
        ...(rec.inputTokens > 0 ? { inputTokens: rec.inputTokens } : {}),
        ...(rec.outputTokens > 0 ? { outputTokens: rec.outputTokens } : {}),
        ...(rec.errorClass ? { errorClass: rec.errorClass } : {}),
        ...(typeof event.error === 'string' && event.error ? { error: event.error.slice(0, 300) } : {}),
        ...(typeof event.error !== 'string' && event.error ? { error: String(event.error).slice(0, 300) } : {}),
        costEstimate: rec.costEstimate,
      })
      if (this.recent.length > RECENT_CAP) this.recent.length = RECENT_CAP
      if (!this.persist || this.#closed) return
      this.queue.push(this.#lineForWrite(rec))
      while (this.queue.length > this.queueMax) {
        this.queue.shift()
        this.selfReport.dropped += 1
      }
      if (this.queue.length >= this.flushThreshold) this.flush()
      else this.#armTimer()
    } catch {
      // 吞掉：统计失败绝不影响调用路径（P7）。R2-F3（P2）：吞错必须可观测——
      // 计入 selfReport.recordErrors（存储自诊断计数面，P8 同型——fail/digrade
      // 路径产生明确诊断事件，禁止无观测吞错）。wire 面留待下次增量。
      this.selfReport.recordErrors += 1
    }
  }

  /** 构造落盘行：v1 基线字段 + 迁移链升到当前 lineVersion（单一字段来源）。 */
  #lineForWrite(rec) {
    const base = {
      v: LINE_VERSION,
      at: rec.at,
      agentId: rec.agentId,
      provider: rec.provider,
      model: rec.model,
      ok: rec.ok,
      ms: rec.ms,
      inputTokens: rec.inputTokens,
      outputTokens: rec.outputTokens,
      costEstimate: rec.costEstimate,
      ...(rec.errorClass ? { errorClass: rec.errorClass } : {}),
    }
    if (this.lineVersion === LINE_VERSION) return base
    const migrated = migrateLine(base, { toVersion: this.lineVersion, migrations: this.migrations })
    return migrated ?? base
  }

  /** 内存聚合折叠（record 与 load 共用）：两级聚合 + 按天 + 明细（有界）。 */
  #fold(rec) {
    const name = (this.getAgentName && this.getAgentName(rec.agentId)) || rec.agentId
    const total = this.totals.get(rec.agentId) ?? {
      agentId: rec.agentId, name, provider: rec.provider, model: rec.model,
      calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalMs: 0, lastAt: 0,
    }
    total.name = name
    total.provider = rec.provider
    total.model = rec.model
    total.calls += 1
    if (!rec.ok) total.errors += 1
    total.inputTokens += rec.inputTokens
    total.outputTokens += rec.outputTokens
    total.totalMs += rec.ms
    total.lastAt = rec.at
    this.totals.set(rec.agentId, total)

    const account = this.accountTotals.get(rec.provider) ?? {
      provider: rec.provider, calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalMs: 0, lastAt: 0, models: new Map(),
    }
    account.calls += 1
    if (!rec.ok) account.errors += 1
    account.inputTokens += rec.inputTokens
    account.outputTokens += rec.outputTokens
    account.totalMs += rec.ms
    account.lastAt = rec.at
    const modelTotal = account.models.get(rec.model) ?? { model: rec.model, calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalMs: 0, lastAt: 0 }
    modelTotal.calls += 1
    if (!rec.ok) modelTotal.errors += 1
    modelTotal.inputTokens += rec.inputTokens
    modelTotal.outputTokens += rec.outputTokens
    modelTotal.totalMs += rec.ms
    modelTotal.lastAt = rec.at
    account.models.set(rec.model, modelTotal)
    this.accountTotals.set(rec.provider, account)

    const date = dateKeyOf(rec.at)
    const day = this.days.get(date) ?? { calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, tokens: 0, ms: 0, cost: 0 }
    day.calls += 1
    if (!rec.ok) day.errors += 1
    day.inputTokens += rec.inputTokens
    day.outputTokens += rec.outputTokens
    day.tokens += rec.inputTokens + rec.outputTokens
    day.ms += rec.ms
    day.cost += rec.costEstimate
    this.days.set(date, day)

    this.detail.push(rec)
    if (this.detail.length > DETAIL_MAX_DEFAULT) {
      this.detail.shift()
      this.selfReport.detailDropped += 1
    }

    // 分钟桶：仅折叠窗口内事件（重启恢复时窗口外历史无 UI 价值，省内存）。
    if (rec.at >= this.now() - SERIES_WINDOW_MINUTES * 60_000) {
      const key = minuteKeyOf(rec.at)
      const bucketMap = this.series.get(rec.agentId) ?? new Map()
      const bucket = bucketMap.get(key) ?? { minute: key, calls: 0, errors: 0, inputTokens: 0, outputTokens: 0 }
      bucket.calls += 1
      if (!rec.ok) bucket.errors += 1
      bucket.inputTokens += rec.inputTokens
      bucket.outputTokens += rec.outputTokens
      bucketMap.set(key, bucket)
      this.series.set(rec.agentId, bucketMap)
      const accountBucketMap = this.accountSeries.get(rec.provider) ?? new Map()
      const accountBucket = accountBucketMap.get(key) ?? { minute: key, calls: 0, errors: 0, inputTokens: 0, outputTokens: 0 }
      accountBucket.calls += 1
      if (!rec.ok) accountBucket.errors += 1
      accountBucket.inputTokens += rec.inputTokens
      accountBucket.outputTokens += rec.outputTokens
      accountBucketMap.set(key, accountBucket)
      this.accountSeries.set(rec.provider, accountBucketMap)
    }
  }

  // ── 异步批量 flush（E7-a）────────────────────────────────────────────────

  #armTimer() {
    if (this.#timer || this.#closed || !this.persist) return
    this.#timer = setTimeout(() => {
      this.#timer = null
      this.flush()
    }, this.flushIntervalMs)
    this.#timer.unref?.()
  }

  /** 触发一次 flush（合并并发调用；永不 reject——错误自愈 + 计数）。 */
  flush() {
    if (this.#flushing) return this.#flushing
    const run = this.#drain().catch(() => {})
    this.#flushing = run.finally(() => { this.#flushing = null })
    return this.#flushing
  }

  async #drain() {
    // R2-F2（P2）：false 期契约洞——#drain 无 persist 门控会把 toggle-off
    // 写失败回队的残留批次在 false 期显式 flush() 时写盘，违反 F1 不读不写
    // 契约。与 #writeIndex 同构的门控：persist=false 直接退出（不影响
    // toggle-off 语义——该场景 flush 时 persist 仍为 true）。
    if (!this.persist) return
    for (;;) {
      const batch = this.queue.splice(0, this.queue.length)
      if (batch.length === 0) break
      if (this.#timer) { clearTimeout(this.#timer); this.#timer = null }
      try {
        await mkdir(this.dir, { recursive: true })
        const byDate = new Map()
        for (const line of batch) {
          const date = dateKeyOf(line.at)
          const text = byDate.get(date) ?? ''
          byDate.set(date, text + JSON.stringify(line) + '\n')
        }
        for (const [date, text] of byDate) {
          await appendFile(join(this.dir, `daily-${date}.jsonl`), text, 'utf8')
        }
      } catch {
        // 写失败（磁盘满等）：批次回到队首等待重试；队列溢出仍按最旧丢弃。
        this.selfReport.writeErrors += 1
        this.queue.unshift(...batch)
        while (this.queue.length > this.queueMax) {
          this.queue.shift()
          this.selfReport.dropped += 1
        }
        break
      }
    }
    try {
      await this.#writeIndex()
    } catch {
      this.selfReport.writeErrors += 1
    }
    if (this.queue.length > 0 && !this.#closed) this.#armTimer()
  }

  /** 优雅退出路径：同步 flush（process 'exit' 钩子调用；绝不抛出）。 */
  flushSync() {
    if (!this.persist || this.#closed) return
    try {
      const batch = this.queue.splice(0, this.queue.length)
      if (batch.length === 0) return
      mkdirSync(this.dir, { recursive: true })
      const byDate = new Map()
      for (const line of batch) {
        const date = dateKeyOf(line.at)
        byDate.set(date, `${byDate.get(date) ?? ''}${JSON.stringify(line)}\n`)
      }
      for (const [date, text] of byDate) {
        appendFileSync(join(this.dir, `daily-${date}.jsonl`), text, 'utf8')
      }
      this.#writeIndexSync()
    } catch {
      this.selfReport.writeErrors += 1
    }
  }

  // ── index.json 镜像（非权威；temp+rename 原子替换）───────────────────────

  #indexPayload() {
    const days = {}
    for (const date of [...this.days.keys()].sort()) {
      const day = this.days.get(date)
      days[date] = { calls: day.calls, errors: day.errors, tokens: day.tokens, ms: day.ms, cost: day.cost, inputTokens: day.inputTokens, outputTokens: day.outputTokens }
    }
    return `${JSON.stringify({ schemaVersion: INDEX_SCHEMA_VERSION, generatedAt: this.now(), days }, null, 0)}\n`
  }

  async #writeIndex() {
    if (!this.persist) return
    const tmp = join(this.dir, `.index.json.tmp-${++TEMP_SEQ}`)
    await writeFile(tmp, this.#indexPayload(), 'utf8')
    await rename(tmp, join(this.dir, 'index.json'))
  }

  #writeIndexSync() {
    if (!this.persist) return
    const tmp = join(this.dir, `.index.json.tmp-${++TEMP_SEQ}`)
    writeFileSync(tmp, this.#indexPayload(), 'utf8')
    renameSync(tmp, join(this.dir, 'index.json'))
  }

  // ── 加载生命周期（损坏自愈 / 版本迁移 / 保留期）─────────────────────────

  /**
   * 启动加载：prune 超期 → 读窗口内 daily 文件（坏行跳过计数 + 修复、迁移回写、
   * 文件级损坏隔离现场）→ index 种子补全更早日期聚合 → 重建 recent/分钟桶 →
   * 刷新 index 镜像 → 每日 prune 定时器。任何单点失败不阻断启动（§4.2 继续服务）。
   *
   * F1（R1 前置项）：persist=false 时整个加载路径门控——不读不写磁盘
   *（"纯内存=现状行为"语义：无现场修复、无 prune、无聚合恢复）。
   */
  async load() {
    this.#closed = false
    if (!this.persist) return this.statsSelfReport()
    try { this.prune() } catch { /* 启动 prune 失败不阻断加载 */ }
    const cutoffDate = dateKeyOf(this.now() - this.detailDays * DAY_MS)
    const entries = await readdir(this.dir, { withFileTypes: true }).catch(() => [])
    entries.sort((a, b) => (a.name < b.name ? -1 : 1))
    for (const entry of entries) {
      const match = DAILY_FILE_RE.exec(entry.name)
      if (!match) continue
      const date = match[1]
      if (date < cutoffDate) continue
      const path = join(this.dir, entry.name)
      if (!entry.isFile()) {
        this.#quarantine(path, date)
        continue
      }
      let content
      try {
        content = await readFile(path, 'utf8')
      } catch {
        this.#quarantine(path, date)
        continue
      }
      await this.#loadDailyFile(path, date, content)
    }
    await this.#seedFromIndex()
    this.#rebuildRecent()
    try {
      await this.#writeIndex()
    } catch {
      this.selfReport.writeErrors += 1
    }
    if (this.persist && !this.#pruneTimer) {
      this.#pruneTimer = setInterval(() => {
        try { this.prune() } catch { /* 每日 prune 失败静默（下次重试） */ }
      }, this.dailyPruneMs)
      this.#pruneTimer.unref?.()
    }
    return this.statsSelfReport()
  }

  /**
   * W-4 persist 开关往返语义（ARCH-002 IBC-1 / roadmap §4.2，幂等）：
   * - 开→关：先排空待写队列（已记录事件落盘——不因关开关丢数据），再停用
   *   持久化（定时器/退出钩子清理；此后不读不写，F1）。
   * - 关→开：启用 + 退出钩子重挂；内存聚合非空（进程内往返——磁盘数据已在
   *   记录时折叠，再 load 会双计）→ 跳过 load 仅重建 index 镜像；内存为空
   *   （false 期重启/清空后开启）→ load() 全量恢复磁盘聚合 + 重建索引
   *  （IBC-1 ①③：数据不损、空窗后索引重建时机 = 重新启用时）。
   *
   * R2-F1（P2）：并发翻转竞态修复——任意调用先链到在途转换（#persistTransition）
   * 之后执行，等待完成后**重新比较**目标与当前状态；旧实现 `want === this.persist`
   * 首行早退发生在转换窗口内（off 在途 persist 仍为 true 时来 on 请求被吞掉），
   * 终态倒置。串行化后每次请求按到达顺序执行且终态由最后请求决定。
   */
  async setPersist(next) {
    const want = next !== false
    const prevTransition = this.#persistTransition
    let release
    this.#persistTransition = new Promise((resolve) => { release = resolve })
    try {
      if (prevTransition) await prevTransition
      // 等待在途转换结束后再比较——转换窗口内 persist 可能仍是过渡值。
      if (want === this.persist) return
      if (!want) {
        if (this.#flushing) {
          try {
            await this.#flushing
          } catch { /* in-flight flush 收尾失败不阻断关停 */ }
        }
        await this.flush()
        this.persist = false
        this.#clearTimers()
        return
      }
      this.persist = true
      if (!this.#exitHandler) {
        this.#exitHandler = () => this.flushSync()
        process.on('exit', this.#exitHandler)
      }
      const memoryEmpty = this.totals.size === 0 && this.accountTotals.size === 0 && this.days.size === 0 && this.detail.length === 0
      if (memoryEmpty) {
        await this.load()
        return
      }
      try {
        await this.#writeIndex()
      } catch {
        this.selfReport.writeErrors += 1
      }
    } finally {
      release()
    }
  }

  /** 文件级损坏隔离：rename `daily-*.corrupt-<ts>` 保留现场 + 重建空文件。
   *  F1：persist=false 不做现场处置（不读不写）。 */
  #quarantine(path, date) {
    if (!this.persist) return
    try {
      renameSync(path, join(this.dir, `daily-${date}.corrupt-${this.now()}`))
      this.selfReport.corruptFiles += 1
    } catch {
      this.selfReport.writeErrors += 1
      return
    }
    try {
      writeFileSync(path, '', 'utf8')
    } catch {
      this.selfReport.writeErrors += 1
    }
  }

  /**
   * 解析单个 daily 文件：逐行 parse（坏行/半行跳过 + 计数）、未知版本跳过计数
   * 但保留、可迁移行升级折叠；存在坏行或迁移时以 temp+rename 原子重写
   * （坏行清除、迁移行收敛到当前版本——未知版本行原样保留）。
   */
  async #loadDailyFile(path, date, content) {
    const segments = content.split('\n')
    const kept = []
    for (const raw of segments) {
      if (raw === '') continue
      let parsed = null
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = null
      }
      const shaped = this.#shapeOf(parsed)
      if (!shaped) {
        this.selfReport.skippedLines += 1
        continue
      }
      const version = Number(parsed.v)
      if (!Number.isInteger(version) || version < 1 || version > this.lineVersion) {
        this.selfReport.skippedVersionLines += 1
        kept.push(raw)
        continue
      }
      if (version < this.lineVersion) {
        const migrated = migrateLine({ ...parsed, ...shaped }, { toVersion: this.lineVersion, migrations: this.migrations })
        if (!migrated) {
          this.selfReport.skippedVersionLines += 1
          kept.push(raw)
          continue
        }
        this.selfReport.migratedLines += 1
        kept.push(JSON.stringify(migrated))
        this.#fold(shaped)
        continue
      }
      kept.push(raw)
      this.#fold(shaped)
    }
    const rewritten = kept.length > 0 ? `${kept.join('\n')}\n` : ''
    // F1：persist=false 不回写修复（heal 是写盘路径——纯内存模式不触碰现场）。
    if (rewritten !== content && this.persist) {
      const tmp = join(this.dir, `.daily-${date}.heal-${++TEMP_SEQ}`)
      try {
        await writeFile(tmp, rewritten, 'utf8')
        await rename(tmp, path)
      } catch {
        this.selfReport.writeErrors += 1
      }
    }
  }

  /** 行形状校验/规整（未知附加字段容忍——向前兼容"只增不删"）。 */
  #shapeOf(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const at = Number(parsed.at)
    const ms = Number(parsed.ms)
    const inputTokens = Number(parsed.inputTokens)
    const outputTokens = Number(parsed.outputTokens)
    const costEstimate = Number(parsed.costEstimate)
    if (!Number.isFinite(at) || !Number.isFinite(ms) || ms < 0) return null
    if (!Number.isFinite(inputTokens) || inputTokens < 0 || !Number.isFinite(outputTokens) || outputTokens < 0) return null
    if (!Number.isFinite(costEstimate)) return null
    if (typeof parsed.agentId !== 'string' || !parsed.agentId) return null
    if (typeof parsed.provider !== 'string' || typeof parsed.model !== 'string') return null
    if (typeof parsed.ok !== 'boolean') return null
    const errorClass = typeof parsed.errorClass === 'string' && parsed.errorClass ? parsed.errorClass : ''
    return {
      at, agentId: parsed.agentId, provider: parsed.provider || '?', model: parsed.model || '?',
      ok: parsed.ok, ms, inputTokens, outputTokens, costEstimate, errorClass,
    }
  }

  /** index 种子：更早日期（明细窗口外）的聚合从非权威镜像补全。 */
  async #seedFromIndex() {
    let index = null
    try {
      index = JSON.parse(await readFile(join(this.dir, 'index.json'), 'utf8'))
    } catch {
      index = null
    }
    if (!index || typeof index !== 'object' || Number(index.schemaVersion) !== INDEX_SCHEMA_VERSION || !index.days || typeof index.days !== 'object') {
      if (index !== null) this.selfReport.indexRebuilt += 1
      return
    }
    for (const [date, day] of Object.entries(index.days)) {
      if (this.days.has(date)) continue
      if (!day || typeof day !== 'object') continue
      const calls = Number(day.calls) || 0
      const inputTokens = Number(day.inputTokens) || 0
      const outputTokens = Number(day.outputTokens) || 0
      this.days.set(date, {
        calls,
        errors: Number(day.errors) || 0,
        inputTokens,
        outputTokens,
        tokens: Number.isFinite(Number(day.tokens)) ? Number(day.tokens) : inputTokens + outputTokens,
        ms: Number(day.ms) || 0,
        cost: Number(day.cost) || 0,
      })
    }
  }

  /** recent 从明细尾部重建（磁盘行无错误文本——重启后仅元数据）。 */
  #rebuildRecent() {
    this.recent = this.detail.slice(-RECENT_CAP).reverse().map((rec) => ({
      at: rec.at,
      agentId: rec.agentId,
      provider: rec.provider,
      model: rec.model,
      ok: rec.ok,
      ms: rec.ms,
      ...(rec.inputTokens > 0 ? { inputTokens: rec.inputTokens } : {}),
      ...(rec.outputTokens > 0 ? { outputTokens: rec.outputTokens } : {}),
      ...(rec.errorClass ? { errorClass: rec.errorClass } : {}),
      costEstimate: rec.costEstimate,
    }))
  }

  // ── 保留期 prune（§4.2：启动 + 每日）────────────────────────────────────

  /** 删除超期 daily 文件（含 .corrupt 现场）与索引项；返回删除计数。
   *  F1：persist=false 时 no-op（写盘路径门控——纯内存模式不动磁盘现场）。 */
  prune() {
    if (!this.persist) return { removedFiles: 0, removedDays: 0 }
    const cutoffDate = dateKeyOf(this.now() - this.retentionDays * DAY_MS)
    let removedFiles = 0
    let removedDays = 0
    try {
      const entries = readdirSync(this.dir)
      for (const name of entries) {
        const file = DAILY_FILE_RE.exec(name) || DAILY_CORRUPT_RE.exec(name)
        if (!file || file[1] >= cutoffDate) continue
        try {
          rmSync(join(this.dir, name), { recursive: true, force: true })
          removedFiles += 1
        } catch {
          this.selfReport.writeErrors += 1
        }
      }
    } catch {
      // 目录不存在：无可清理。
    }
    // 索引项修剪：在镜像文件上原位裁剪（保留未超期项——镜像可能含内存态
    // 之外的更早日期聚合，不能以内存 days 全量重写覆盖）。
    const indexPath = join(this.dir, 'index.json')
    let index = null
    try {
      index = JSON.parse(readFileSync(indexPath, 'utf8'))
    } catch {
      index = null
    }
    if (index && typeof index === 'object' && index.days && typeof index.days === 'object') {
      let changed = false
      for (const date of Object.keys(index.days)) {
        if (date < cutoffDate) {
          delete index.days[date]
          changed = true
          removedDays += 1
        }
      }
      if (changed) {
        try {
          const tmp = join(this.dir, `.index.json.tmp-${++TEMP_SEQ}`)
          writeFileSync(tmp, `${JSON.stringify(index)}\n`, 'utf8')
          renameSync(tmp, indexPath)
        } catch {
          this.selfReport.writeErrors += 1
        }
      }
    }
    // 内存 days 同步修剪（load 之后的运行期 prune；与镜像一致，不重复计数）。
    for (const date of [...this.days.keys()]) {
      if (date < cutoffDate) this.days.delete(date)
    }
    return { removedFiles, removedDays }
  }

  // ── 视图（snapshot / export）─────────────────────────────────────────────

  /** 聚合视图（RPC stats 消费；service.js statsSnapshot 迁移形状 + days/selfReport 增量）。 */
  snapshot() {
    const cutoff = new Date(this.now() - SERIES_WINDOW_MINUTES * 60_000).toISOString().slice(0, 16)
    const totals = [...this.totals.values()].map((total) => ({
      agentId: total.agentId,
      name: total.name,
      provider: total.provider,
      model: total.model,
      calls: total.calls,
      errors: total.errors,
      inputTokens: total.inputTokens,
      outputTokens: total.outputTokens,
      totalMs: total.totalMs,
      lastAt: total.lastAt || undefined,
    }))
    const series = []
    for (const [agentId, buckets] of this.series) {
      const kept = [...buckets.values()].filter((bucket) => bucket.minute >= cutoff).sort((a, b) => (a.minute < b.minute ? -1 : 1))
      for (const bucket of [...buckets.values()]) if (bucket.minute < cutoff) buckets.delete(bucket.minute)
      if (kept.length > 0) series.push({ agentId, buckets: kept })
    }
    const accountTotals = [...this.accountTotals.values()].map((account) => ({
      provider: account.provider,
      calls: account.calls,
      errors: account.errors,
      inputTokens: account.inputTokens,
      outputTokens: account.outputTokens,
      totalMs: account.totalMs,
      lastAt: account.lastAt || undefined,
      models: [...account.models.values()].map((modelTotal) => ({
        model: modelTotal.model,
        calls: modelTotal.calls,
        errors: modelTotal.errors,
        inputTokens: modelTotal.inputTokens,
        outputTokens: modelTotal.outputTokens,
        totalMs: modelTotal.totalMs,
        lastAt: modelTotal.lastAt || undefined,
      })),
    })).sort((a, b) => (a.provider < b.provider ? -1 : 1))
    const accountSeries = []
    for (const [provider, buckets] of this.accountSeries) {
      const kept = [...buckets.values()].filter((bucket) => bucket.minute >= cutoff).sort((a, b) => (a.minute < b.minute ? -1 : 1))
      for (const bucket of [...buckets.values()]) if (bucket.minute < cutoff) buckets.delete(bucket.minute)
      if (kept.length > 0) accountSeries.push({ provider, buckets: kept })
    }
    const days = {}
    for (const date of [...this.days.keys()].sort()) days[date] = { ...this.days.get(date) }
    return {
      totals,
      recent: [...this.recent],
      series,
      accountTotals,
      accountSeries,
      days,
      selfReport: this.statsSelfReport(),
    }
  }

  /**
   * CSV 导出（§4.3 RPC statsExport 消费）：列 date/agent/account/model/calls/
   * errors/inputTokens/outputTokens/p50ms/p95ms/costEstimate；range '7d'|'30d'|
   * '90d'；level 'agent'（按 日期+agent+provider+model 分组）或 'account'
   *（按 日期+provider+model 分组，agent 列留空）。分位从明细惰性计算
   *（超量降级采样，§4.3）。
   */
  export({ range = '7d', level = 'agent' } = {}) {
    const rangeDays = { '7d': 7, '30d': 30, '90d': 90 }[range]
    if (!rangeDays) throw new Error(`无效的统计导出 range："${range}"（可选 7d/30d/90d）`)
    if (level !== 'agent' && level !== 'account') throw new Error(`无效的统计导出 level："${level}"（可选 agent/account）`)
    const cutoffDate = dateKeyOf(this.now() - rangeDays * DAY_MS)
    const groups = new Map()
    for (const rec of this.detail) {
      const date = dateKeyOf(rec.at)
      if (date < cutoffDate) continue
      const agent = level === 'agent' ? rec.agentId : ''
      const key = `${date}|${agent}|${rec.provider}|${rec.model}`
      const group = groups.get(key) ?? {
        date, agent, account: rec.provider, model: rec.model,
        calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, cost: 0, ms: [],
      }
      group.calls += 1
      if (!rec.ok) group.errors += 1
      group.inputTokens += rec.inputTokens
      group.outputTokens += rec.outputTokens
      group.cost += rec.costEstimate
      group.ms.push(rec.ms)
      groups.set(key, group)
    }
    const rows = [...groups.values()].sort((a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
      || (a.agent < b.agent ? -1 : a.agent > b.agent ? 1 : 0)
      || (a.account < b.account ? -1 : a.account > b.account ? 1 : 0)
      || (a.model < b.model ? -1 : 1))
    const lines = rows.map((row) => [
      row.date, row.agent, row.account, row.model, row.calls, row.errors,
      row.inputTokens, row.outputTokens,
      percentile(sampleForPercentile(row.ms), 50),
      percentile(sampleForPercentile(row.ms), 95),
      fmtCost(row.cost),
    ].map(csvEscape).join(','))
    return ['date,agent,account,model,calls,errors,inputTokens,outputTokens,p50ms,p95ms,costEstimate', ...lines].join('\n')
  }

  // ── 清空保护（§4.2：软删除默认）─────────────────────────────────────────

  /**
   * 清空统计。默认软删除：`stats/` rename 为同级 `stats-backup-<ts>/`（保留
   * 现场，可手工恢复；不自动清理）；`hardDelete: true` 真删。两者均重建空
   * 目录 + 空索引，内存态清零（自诊断计数保留——观测存储健康）。
   * persist=false 时磁盘段整体门控（F1/W-4 IBC-1 ②）：纯内存清零 = 现状
   * resetStats 行为，盘上数据原样保留（无 backup、无删除）。
   */
  async reset({ hardDelete = false } = {}) {
    if (this.#flushing) {
      try {
        await this.#flushing
      } catch { /* in-flight flush 收尾失败不阻断清空 */ }
    }
    if (this.#timer) { clearTimeout(this.#timer); this.#timer = null }
    this.queue.length = 0
    this.totals.clear()
    this.accountTotals.clear()
    this.series.clear()
    this.accountSeries.clear()
    this.recent = []
    this.days.clear()
    this.detail = []
    let backupDir = ''
    // F1/W-4（IBC-1 ②）：persist=false 时磁盘段整体门控——纯内存清零 =
    // 现状 resetStats 行为；盘上数据原样保留（无 backup、无删除），留给
    // 重新启用持久化后 load 恢复。
    if (!this.persist) return { backupDir }
    if (hardDelete) {
      await rm(this.dir, { recursive: true, force: true })
    } else {
      const parent = dirname(this.dir)
      const base = basename(this.dir)
      backupDir = join(parent, `${base}-backup-${this.now()}`)
      let suffix = 2
      while (existsQuiet(backupDir)) {
        backupDir = join(parent, `${base}-backup-${this.now()}-${suffix++}`)
      }
      try {
        renameSync(this.dir, backupDir)
      } catch (error) {
        if (error && error.code !== 'ENOENT') throw error
      }
    }
    mkdirSync(this.dir, { recursive: true })
    if (this.persist) {
      try {
        this.#writeIndexSync()
      } catch {
        this.selfReport.writeErrors += 1
      }
    }
    return { backupDir }
  }

  /** 自诊断计数（E7-a dropped / §4.2 skippedLines 等可观测面）。 */
  statsSelfReport() {
    return { ...this.selfReport }
  }

  /** 关闭：final flush + 定时器/退出钩子清理（幂等）。 */
  async close() {
    this.#closed = true
    this.#clearTimers()
    if (this.persist && this.queue.length > 0) await this.flush()
  }

  #clearTimers() {
    if (this.#timer) { clearTimeout(this.#timer); this.#timer = null }
    if (this.#pruneTimer) { clearInterval(this.#pruneTimer); this.#pruneTimer = null }
    if (this.#exitHandler) {
      process.removeListener('exit', this.#exitHandler)
      this.#exitHandler = null
    }
  }
}

/** 静默存在性探测（reset 备份名去重）。 */
function existsQuiet(path) {
  try {
    readdirSync(path)
    return true
  } catch {
    return false
  }
}
