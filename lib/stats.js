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

/** 明细行格式版本（§4.2 版本迁移：v1 首版；EVO-017 v2 = 预设作用域行）。 */
export const LINE_VERSION = 2

// ── FIX-031 统计归因单点（DEC-029 路由透明性不变量）─────────────────────────
//
// 两条不变量（.governance/decision-log.md DEC-029）：
//  ① 归属不因路由分化——同一真实账号/agent 的用量 MUST 归同一实体；路由中间
//     构件（twin / 包装后缀 / oauth 路由键 / 内部 agentId）不得成为统计或任何
//     用户可见面的独立实体。
//  ② 实现路径不可见——内部键 MUST NOT 出现在任何用户可见面（统计卡标题、
//     服务商列、导出 CSV 列值）。
//
// 本节（normalizeAttribution + accountDisplayLabel + 三张词表）是全仓唯一的
// 归一化实现点：四个记录站点（lib/tool.js / lib/oauth-llm.js / lib/wrapper.js
// onCall / lib/preset-defaults.js recordScope）的事件全部经 StatsStore
// #fold / #foldScope 汇入此处，历史落盘行（v1/v2）load 时同经此处（读侧迁移）。
// 浏览器面（lib/client.js）因模块形态无法 import 本模块，其同构镜像受
// tests/fix-031-attribution.mjs G 组 parity 守卫锁定（P-v3 原则 9）。

/** 包装路由后缀——唯一权威定义（接管路由 `<provider>-router` 由 lib/wrapper.js
 *  注册；本常量是路由键与账号键之间的边界，wrapper.js 从这里取用而非自定义）。 */
export const WRAP_ROUTE_SUFFIX = '-router'

/** 「主模型」统一 agent 键（DEC-029① 用户词汇「主模型」）：主模型链路（twin
 *  包装流 / 插件 oauth 流 / 历史内部 agentId 'twin'、'main'）全部归此实体。 */
export const MAIN_MODEL_AGENT_ID = 'main-model'

/** 主模型链路的内部 agentId 词表（含历史落盘形态——读侧归一，禁止新增成员）。 */
const MAIN_MODEL_AGENT_KEYS = new Set(['twin', 'main', MAIN_MODEL_AGENT_ID])

/** 账号身份命名空间前缀：`oauth:` = 插件 OAuth 账号身份空间（service.js
 *  runOauthChat 按 `oauth:${accountId}` 记账，service.accountHealth 白盒消费
 *  同一形态——账号身份键保留命名空间以防与 llm-pi-ai provider id 假归并，
 *  仅在**显示面**去前缀，见 accountDisplayLabel）。 */
const OAUTH_ACCOUNT_PREFIX = 'oauth:'
/** 账号池键前缀（`oauth:pool:${poolId}`——池是路由构件而非账号，保持独立实体）。 */
const OAUTH_POOL_PREFIX = 'oauth:pool:'
/** 无头 CLI 子代理键前缀（`cli:${entryId}`——子代理条目身份，独立实体）。 */
const CLI_ACCOUNT_PREFIX = 'cli:'
/** 宿主官方路由键（lib/host-route.js:55 HOST_ROUTE_PROVIDER 镜像——配置归
 *  「设置 → 模型」，账号管理区不渲染，但用量是真实账号用量，保持独立实体）。 */
const HOST_ROUTE_ACCOUNT_KEY = 'openai-codex'

/** 插件自注册**路由键** → 真实账号键别名表：路由层造的键不是账号实体，读侧
 *  折回它所服务的账号。唯一条目 `chatgpt-oauth`（权威源 lib/oauth-llm.js:43
 *  OAUTH_PROVIDER——插件为 ChatGPT 订阅注册的宿主可见路由）折回 ChatGPT 订阅
 *  账号键 `oauth:chatgpt`（roster id 即 'chatgpt'，与 service.js runOauthChat
 *  的 `oauth:${accountId}` 记账形态同源）——两形态用量归一，DEC-029①。
 *  stats.js 依赖面锁定为 node: 内建（tests/stats.mjs §22），故此处为常量镜像，
 *  由 tests/fix-031-attribution.mjs G 组源码契约断言锁定不漂移。 */
const ACCOUNT_KEY_ALIASES = new Map([['chatgpt-oauth', 'oauth:chatgpt']])

/**
 * 归一化后的**显示用**账号标签（DEC-029②：内部键不出现在可见面）。
 * 只剥内部命名空间标记（`oauth:pool:` / `oauth:` / `cli:`）→ 实体 id；聚合键
 * 本身保留标记命名空间，供 service.accountHealth 等白盒消费面按 `oauth:<id>`
 * 寻址（FIX-031 兼容约束：归一化只作用于统计视图，不改账号健康寻址空间）。
 * @param {string} accountKey 归一化聚合账号键（normalizeAttribution 输出）
 * @returns {string} 可见面用清洁标签（实体 id，无内部标记）
 */
export function accountDisplayLabel(accountKey) {
  const key = typeof accountKey === 'string' ? accountKey.trim() : ''
  if (!key) return '?'
  let label = key
  while (label.length > WRAP_ROUTE_SUFFIX.length && label.endsWith(WRAP_ROUTE_SUFFIX)) {
    label = label.slice(0, -WRAP_ROUTE_SUFFIX.length)
  }
  if (label.startsWith(OAUTH_POOL_PREFIX)) return label.slice(OAUTH_POOL_PREFIX.length)
  if (label.startsWith(OAUTH_ACCOUNT_PREFIX)) return label.slice(OAUTH_ACCOUNT_PREFIX.length)
  if (label.startsWith(CLI_ACCOUNT_PREFIX)) return label.slice(CLI_ACCOUNT_PREFIX.length)
  return label
}

/**
 * 归因单点：记录站点观测到的 `{provider, agentId}` → 规范实体字段。
 *
 * 账号侧（D1）：`<provider>${WRAP_ROUTE_SUFFIX}` 是准入接管引入的包装路由，
 * 用量归其真实来源账号；插件自注册路由键经 ACCOUNT_KEY_ALIASES 折回账号键。
 * agent 侧（D4）：'twin'（wrapper onCall 历史形态）与 'main'（oauth-llm 记录
 * 形态）与 'main-model' 统一为 MAIN_MODEL_AGENT_ID；真实专业 agent id 原样。
 *
 * 纯函数、无副作用、永不抛（非法形态一律落到清洁缺省值）。
 * @param {{provider?: unknown, agentId?: unknown}} event
 * @returns {{accountKey: string, accountKind: string, accountLabel: string,
 *   agentKey: string, mainModel: boolean}}
 */
export function normalizeAttribution(event = {}) {
  const source = event && typeof event === 'object' ? event : {}
  const rawProvider = typeof source.provider === 'string' ? source.provider.trim() : ''
  const rawAgent = typeof source.agentId === 'string' ? source.agentId.trim() : ''
  let accountKey = rawProvider
  while (accountKey.length > WRAP_ROUTE_SUFFIX.length && accountKey.endsWith(WRAP_ROUTE_SUFFIX)) {
    accountKey = accountKey.slice(0, -WRAP_ROUTE_SUFFIX.length)
  }
  accountKey = ACCOUNT_KEY_ALIASES.get(accountKey) ?? accountKey
  let accountKind = 'provider'
  if (!accountKey) {
    accountKey = '?'
    accountKind = 'unknown'
  } else if (accountKey.startsWith(OAUTH_POOL_PREFIX)) {
    accountKind = 'pool'
  } else if (accountKey.startsWith(OAUTH_ACCOUNT_PREFIX)) {
    accountKind = 'oauth'
  } else if (accountKey.startsWith(CLI_ACCOUNT_PREFIX)) {
    accountKind = 'cli'
  } else if (accountKey === HOST_ROUTE_ACCOUNT_KEY) {
    accountKind = 'host-route'
  }
  const agentKey = !rawAgent || MAIN_MODEL_AGENT_KEYS.has(rawAgent) ? MAIN_MODEL_AGENT_ID : rawAgent
  return {
    accountKey,
    accountKind,
    accountLabel: accountDisplayLabel(accountKey),
    agentKey,
    mainModel: agentKey === MAIN_MODEL_AGENT_ID,
  }
}


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

/** EVO-017：预设作用域单口径快照（totals/models/days/recent 拷贝化）。 */
function scopeArmSnapshot(arm) {
  return {
    calls: arm.calls,
    lastAt: arm.lastAt || undefined,
    models: [...arm.models.values()].sort((a, b) => b.calls - a.calls),
    days: [...arm.days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, day]) => ({
      date,
      calls: day.calls,
      models: [...day.models.values()].sort((a, b) => b.calls - a.calls),
    })),
    recent: [...arm.recent],
  }
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
 * EVO-017 v2 内置迁移：v1 调用行字段集在 v2 完全有效（scope 行为可选新
 * kind，不触碰 v1 形状）——恒等迁移（升版本号即可，老统计盘面零丢失）。
 */
const BUILT_IN_MIGRATIONS = { 2: (line) => ({ ...line }) }
export function migrateLine(line, { toVersion = LINE_VERSION, migrations = {} } = {}) {
  if (!line || typeof line !== 'object' || Array.isArray(line)) return null
  let version = Number(line.v)
  if (!Number.isInteger(version) || version < 1 || version > toVersion) return null
  let out = { ...line }
  while (version < toVersion) {
    const step = migrations[version + 1] ?? BUILT_IN_MIGRATIONS[version + 1]
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
    /**
     * EVO-017 预设作用域聚合态：preset → { main, subagent } 两口径，各含
     * totals（calls/models 分布/lastAt）+ days（date → calls/models）+
     * recent（最新 10 条请求遥测——配置生效观测的实时口径）。数据源 =
     * recordScope（agent/request 只读遥测，installRequestTelemetry 注入）。
     */
    this.presetStats = new Map()
    /**
     * FIX-031 账号视图**计数权威源**聚合态（D3 治本）：accountKey →
     * { provider, accountKind, accountLabel, calls, lastAt, models: Map,
     *   days: Map<date, {calls, models: Map<model, {model, calls}>}> }。
     * 数据源 = recordScope（agent/request 遥测，每请求恰好一条，与站点自愿的
     * call 行解耦）；token/耗时/错误仍在 call 侧（#fold），两权威源由
     * #accountView 单点合并。
     */
    this.accountScope = new Map()
    /**
     * EVO-017 R2 统一分组视图派生（用户裁决：全部 2/3 级分组复用相同逻辑
     * ——总用量/每日用量/实时调用）：per-agent / per-account 按天聚合 +
     * 最近 10 条索引（#fold 折叠维护；load 重放 detail 行重建）。
     */
    this.agentDays = new Map()
    this.accountDays = new Map()
    this.recentByAgent = new Map()
    this.recentByAccount = new Map()

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
      // FIX-031：#fold 内应用归因单点（normalizeAttribution），返回**归一后**的
      // 内存行供 recent/detail/派生索引使用；落盘行仍取站点原观测值（rec）——
      // 盘面格式与字段语义保持基线版本，读侧 load 同经 #fold 归一（不改写盘文件）。
      const folded = this.#fold(rec)
      this.recent.unshift({
        at: folded.at,
        agentId: folded.agentId,
        provider: folded.accountLabel,
        accountKind: folded.accountKind,
        model: folded.model,
        ok: folded.ok,
        ms: folded.ms,
        ...(folded.inputTokens > 0 ? { inputTokens: folded.inputTokens } : {}),
        ...(folded.outputTokens > 0 ? { outputTokens: folded.outputTokens } : {}),
        ...(folded.errorClass ? { errorClass: folded.errorClass } : {}),
        ...(typeof event.error === 'string' && event.error ? { error: event.error.slice(0, 300) } : {}),
        ...(typeof event.error !== 'string' && event.error ? { error: String(event.error).slice(0, 300) } : {}),
        costEstimate: folded.costEstimate,
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

  /**
   * EVO-017：记录一次预设作用域请求遥测（agent/request 只读监听注入——
   * 主会话/subagent 的每次 LLM 请求；计次口径，无 token——token 精确口径
   * 在专业/账号级既有视图）。event：{ preset, origin('main'|'subagent'),
   * provider, model, at? }。同步、永不抛（P7 同 record）。
   *
   * FIX-031：scope 行同时是**账号视图的计数权威源**（每请求恰好一条，不依赖
   * 站点自愿记录 token）——recordScope 折叠经归一化单点（#foldScope）。
   */
  recordScope(event) {
    let rec
    try {
      if (!event || typeof event !== 'object') return
      const preset = typeof event.preset === 'string' && event.preset ? event.preset.slice(0, 64) : ''
      const origin = event.origin === 'subagent' ? 'subagent' : 'main'
      const provider = typeof event.provider === 'string' && event.provider ? event.provider.slice(0, 64) : '?'
      const model = typeof event.model === 'string' && event.model ? event.model.slice(0, 96) : '?'
      if (!preset) return
      const at = Number.isFinite(Number(event.at)) ? Number(event.at) : this.now()
      rec = { at, kind: 'scope', preset, origin, provider, model }
    } catch {
      return
    }
    try {
      this.#foldScope(rec)
      if (!this.persist || this.#closed) return
      // 落盘行走 #lineForWrite（scope 行带 v:2——load 端 #shapeOf 校验版本
      // 后路由 #foldScope；旧实现直推 rec 缺 v 字段 → 重载时被版本门跳过）。
      this.queue.push(this.#lineForWrite(rec))
      while (this.queue.length > this.queueMax) {
        this.queue.shift()
        this.selfReport.dropped += 1
      }
      if (this.queue.length >= this.flushThreshold) this.flush()
      else this.#armTimer()
    } catch {
      this.selfReport.recordErrors += 1
    }
  }

  /** 预设作用域折叠（recordScope 与 load 共用）：两口径 totals/days/recent +
   *  FIX-031 账号视图计数权威源折叠。
   *
   *  FIX-031（DEC-029①/D1）：scope 行的 provider 是宿主实际请求**路由**——经
   *  twin 包装即 `<account>-router`，与同账号的非包装流量分化为两个键；此处过
   *  归一化单点（normalizeAttribution），预设面与账号计数面都只认规范账号键。
   *  盘面行为不变（#lineForWrite 在归一化之外取站点原观测值——读侧迁移）。 */
  #foldScope(raw) {
    const { accountKey, accountKind, accountLabel } = normalizeAttribution(raw)
    const rec = { ...raw, provider: accountKey, accountKind, accountLabel }
    const preset = this.presetStats.get(rec.preset) ?? {
      main: { calls: 0, models: new Map(), days: new Map(), lastAt: 0, recent: [] },
      subagent: { calls: 0, models: new Map(), days: new Map(), lastAt: 0, recent: [] },
    }
    const arm = rec.origin === 'subagent' ? preset.subagent : preset.main
    arm.calls += 1
    arm.lastAt = rec.at
    const modelCount = arm.models.get(`${rec.provider}/${rec.model}`) ?? { provider: rec.accountLabel, accountKind: rec.accountKind, model: rec.model, calls: 0 }
    modelCount.calls += 1
    arm.models.set(`${rec.provider}/${rec.model}`, modelCount)
    const date = dateKeyOf(rec.at)
    const day = arm.days.get(date) ?? { calls: 0, models: new Map() }
    day.calls += 1
    const dayModel = day.models.get(`${rec.provider}/${rec.model}`) ?? { provider: rec.accountLabel, accountKind: rec.accountKind, model: rec.model, calls: 0 }
    dayModel.calls += 1
    day.models.set(`${rec.provider}/${rec.model}`, dayModel)
    arm.days.set(date, day)
    arm.recent.unshift({ at: rec.at, provider: rec.accountLabel, accountKind: rec.accountKind, model: rec.model })
    if (arm.recent.length > 10) arm.recent.length = 10
    this.presetStats.set(rec.preset, preset)
    this.#foldAccountScope(rec)
  }

  /** FIX-031 账号视图计数权威源折叠（scope 行——每请求恰好一条，与 call 行的
   *  站点自愿记录解耦，治 D3 零覆盖）。totals + 按天 + 按天模型分布三层聚合。 */
  #foldAccountScope(rec) {
    const account = this.accountScope.get(rec.provider) ?? {
      provider: rec.provider,
      accountLabel: rec.accountLabel,
      accountKind: rec.accountKind,
      calls: 0,
      lastAt: 0,
      models: new Map(),
      days: new Map(),
    }
    account.accountLabel = rec.accountLabel
    account.accountKind = rec.accountKind
    account.calls += 1
    account.lastAt = rec.at
    const modelTotal = account.models.get(rec.model) ?? { model: rec.model, calls: 0 }
    modelTotal.calls += 1
    account.models.set(rec.model, modelTotal)
    const date = dateKeyOf(rec.at)
    const day = account.days.get(date) ?? { calls: 0, models: new Map() }
    day.calls += 1
    const dayModel = day.models.get(rec.model) ?? { model: rec.model, calls: 0 }
    dayModel.calls += 1
    day.models.set(rec.model, dayModel)
    account.days.set(date, day)
    this.accountScope.set(rec.provider, account)
  }

  /**
   * FIX-031 账号视图**双权威源合并**单点（架构裁决 A-2，用户可观测的账号级统计
   * 全部由此派生——snapshot 与 CSV 导出共用，禁止第二套合并路径）。
   *
   *  - 计数权威 = scope 行（agent/request 遥测，每请求恰好一条，与站点自愿的
   *    call 记录解耦 → 治 D3「非包装 provider 零覆盖」）；
   *  - token / 耗时 / 错误 / 最近明细权威 = call 行；
   *  - **去重规则**（同 (账号, 日期, 模型) 格）：该格有 scope 覆盖时
   *    `calls = scopeCalls + callDay.otherCalls`——主模型链路（twin 流、插件
   *    oauth 流）的 call 行与 scope 行同属一次请求，其计数被 scope 侧吸收，
   *    call 行只贡献 token 级字段；非主模型 call 行（专业 agent 直发、池内
   *    重试）scope 侧结构上无对应行，自行计数不双计。该格无 scope 覆盖
   *    （无预设会话 / 遥测未生效）时回退 call 侧计数，用量不丢。
   *
   * 账号可见标识 = `accountDisplayLabel`（DEC-029②：`oauth:` / `cli:` 等身份
   * 命名空间标记不出现在任何可见面）；聚合内部键（accountKey）保留命名空间供
   * service.accountHealth 等白盒消费面寻址，仅在此处投影为清洁标签。
   * @returns {Array<object>} 按清洁账号标签排序的账号视图行
   */
  #accountView() {
    const keys = new Set([...this.accountTotals.keys(), ...this.accountScope.keys()])
    const rows = []
    for (const key of keys) {
      const callAccount = this.accountTotals.get(key)
      const scopeAccount = this.accountScope.get(key)
      const callDays = this.accountDays.get(key) ?? new Map()
      const scopeDays = scopeAccount?.days ?? new Map()
      const dates = [...new Set([...callDays.keys(), ...scopeDays.keys()])].sort()
      const modelCalls = new Map()
      const days = []
      let calls = 0
      for (const date of dates) {
        const callDay = callDays.get(date)
        const scopeDay = scopeDays.get(date)
        const modelNames = new Set([...(callDay?.models.keys() ?? []), ...(scopeDay?.models.keys() ?? [])])
        let dayCalls = 0
        const dayModels = []
        for (const model of modelNames) {
          const callModel = callDay?.models.get(model)
          const scopeModelCalls = scopeDay?.models.get(model)?.calls ?? 0
          // 去重规则（见方法注释）：scope 覆盖该 (账号, 日期) → 主模型侧 call 计数
          // 被 scope 吸收；未覆盖 → call 侧兜底，用量不丢。
          const merged = scopeDay
            ? scopeModelCalls + (callModel?.otherCalls ?? 0)
            : (callModel?.calls ?? 0)
          if (merged <= 0) continue
          dayCalls += merged
          dayModels.push({ model, calls: merged })
          modelCalls.set(model, (modelCalls.get(model) ?? 0) + merged)
        }
        calls += dayCalls
        days.push({
          date,
          calls: dayCalls,
          errors: callDay?.errors ?? 0,
          inputTokens: callDay?.inputTokens ?? 0,
          outputTokens: callDay?.outputTokens ?? 0,
          ms: callDay?.ms ?? 0,
          cost: callDay?.cost ?? 0,
          models: dayModels.sort((a, b) => (b.calls - a.calls) || (a.model < b.model ? -1 : 1)),
        })
      }
      const models = [...modelCalls.entries()]
        .map(([model, mergedCalls]) => {
          const callModel = callAccount?.models.get(model)
          return {
            model,
            calls: mergedCalls,
            requestCalls: scopeAccount?.models.get(model)?.calls ?? 0,
            callRows: callModel?.calls ?? 0,
            errors: callModel?.errors ?? 0,
            inputTokens: callModel?.inputTokens ?? 0,
            outputTokens: callModel?.outputTokens ?? 0,
            totalMs: callModel?.totalMs ?? 0,
            ...(callModel?.lastAt ? { lastAt: callModel.lastAt } : {}),
          }
        })
        .sort((a, b) => (b.calls - a.calls) || (a.model < b.model ? -1 : 1))
      const lastAt = Math.max(callAccount?.lastAt ?? 0, scopeAccount?.lastAt ?? 0)
      rows.push({
        accountKey: key,
        provider: accountDisplayLabel(key),
        accountKind: callAccount?.accountKind ?? scopeAccount?.accountKind ?? 'unknown',
        calls,
        requestCalls: scopeAccount?.calls ?? 0,
        callRows: callAccount?.calls ?? 0,
        errors: callAccount?.errors ?? 0,
        inputTokens: callAccount?.inputTokens ?? 0,
        outputTokens: callAccount?.outputTokens ?? 0,
        totalMs: callAccount?.totalMs ?? 0,
        ...(lastAt > 0 ? { lastAt } : {}),
        models,
        days,
      })
    }
    return rows.sort((a, b) => (a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0))
  }


  /** 构造落盘行：基线字段（调用行 v1 形状 / scope 行 v2 形状）+ 迁移链升到
   * 当前 lineVersion（单一字段来源）。EVO-017：调用行基线恒 v1——经内置
   * 恒等迁移 + 用户注入迁移升到目标版本（注入迁移对新行同样生效——写路径
   * 与 load 修复路径同一迁移语义）；scope 行基线 v2（仅存在于 v2+）。 */
  #lineForWrite(rec) {
    const base = rec.kind === 'scope'
      ? { v: 2, at: rec.at, kind: 'scope', preset: rec.preset, origin: rec.origin, provider: rec.provider, model: rec.model }
      : {
        v: 1,
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
    if (this.lineVersion === base.v) return base
    const migrated = migrateLine(base, { toVersion: this.lineVersion, migrations: this.migrations })
    return migrated ?? base
  }

  /** 内存聚合折叠（record 与 load 共用）：两级聚合 + 按天 + 明细（有界）。
   *
   * FIX-031 归因单点应用处（DEC-029①②/D1/D2/D4）：进入聚合前过一次
   * `normalizeAttribution`——包装路由键折回真实账号键、内部 agentId（'twin'/
   * 'main'）折回 MAIN_MODEL_AGENT_ID，聚合/派生/明细全部只用规范键；落盘行
   * 由 #lineForWrite 取**站点原观测值**（盘面格式不变，历史数据读侧同经此点）。
   * @returns {object} 归一后的内存行（record 的 recent 行与 detail 同源字段）。 */
  #fold(raw) {
    const attribution = normalizeAttribution(raw)
    const rec = { ...raw, agentId: attribution.agentKey, provider: attribution.accountKey, accountKind: attribution.accountKind, accountLabel: attribution.accountLabel }
    const name = (this.getAgentName && this.getAgentName(rec.agentId)) || rec.agentId
    const total = this.totals.get(rec.agentId) ?? {
      agentId: rec.agentId, name, provider: rec.provider, model: rec.model,
      calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalMs: 0, lastAt: 0,
    }
    total.name = name
    total.provider = rec.provider
    total.accountLabel = rec.accountLabel
    total.accountKind = rec.accountKind
    total.model = rec.model

    total.calls += 1
    if (!rec.ok) total.errors += 1
    total.inputTokens += rec.inputTokens
    total.outputTokens += rec.outputTokens
    total.totalMs += rec.ms
    total.lastAt = rec.at
    this.totals.set(rec.agentId, total)

    const account = this.accountTotals.get(rec.provider) ?? {
      provider: rec.provider, accountKind: rec.accountKind, accountLabel: rec.accountLabel,
      calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalMs: 0, lastAt: 0, models: new Map(),
    }
    account.accountKind = rec.accountKind
    account.accountLabel = rec.accountLabel
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

    // EVO-017 R2 统一分组视图派生：per-agent / per-account 按天聚合 + 最近
    // 10 条索引（与全局 days 同构字段；recent 截断有界）。
    const agentDayMap = this.agentDays.get(rec.agentId) ?? new Map()
    const agentDay = agentDayMap.get(date) ?? { calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, ms: 0, cost: 0, models: new Map() }
    agentDay.calls += 1
    if (!rec.ok) agentDay.errors += 1
    agentDay.inputTokens += rec.inputTokens
    agentDay.outputTokens += rec.outputTokens
    agentDay.ms += rec.ms
    agentDay.cost += rec.costEstimate
    const agentDayModel = agentDay.models.get(rec.model) ?? { model: rec.model, calls: 0 }
    agentDayModel.calls += 1
    agentDay.models.set(rec.model, agentDayModel)
    agentDayMap.set(date, agentDay)
    this.agentDays.set(rec.agentId, agentDayMap)
    const accountDayMap = this.accountDays.get(rec.provider) ?? new Map()
    const accountDay = accountDayMap.get(date) ?? { calls: 0, mainCalls: 0, otherCalls: 0, errors: 0, inputTokens: 0, outputTokens: 0, ms: 0, cost: 0, models: new Map() }
    accountDay.calls += 1
    // FIX-031 双权威源合并所需分解位：主模型链路（twin/oauth 直连）的 call 行
    // 与 scope 行同属一次请求（双产）→ 计数由 scope 侧权威承担；非主模型
    // （专业 agent 直发/池重试）call 行无 scope 对应 → 自行计数。
    if (attribution.mainModel) accountDay.mainCalls += 1
    else accountDay.otherCalls += 1
    if (!rec.ok) accountDay.errors += 1
    accountDay.inputTokens += rec.inputTokens
    accountDay.outputTokens += rec.outputTokens
    accountDay.ms += rec.ms
    accountDay.cost += rec.costEstimate
    const accountDayModel = accountDay.models.get(rec.model) ?? { model: rec.model, calls: 0, mainCalls: 0, otherCalls: 0 }
    accountDayModel.calls += 1
    if (attribution.mainModel) accountDayModel.mainCalls += 1
    else accountDayModel.otherCalls += 1
    accountDay.models.set(rec.model, accountDayModel)
    accountDayMap.set(date, accountDay)
    this.accountDays.set(rec.provider, accountDayMap)
    const agentRecent = this.recentByAgent.get(rec.agentId) ?? []
    agentRecent.unshift({ at: rec.at, agentId: rec.agentId, provider: rec.accountLabel, accountKind: rec.accountKind, model: rec.model, ok: rec.ok, ms: rec.ms, inputTokens: rec.inputTokens, outputTokens: rec.outputTokens })
    if (agentRecent.length > 10) agentRecent.length = 10
    this.recentByAgent.set(rec.agentId, agentRecent)
    // FIX-031 D2：账号级明细行自带 provider/accountKind（清洁账号标签）——旧实现
    // 不带 provider，显示层 `provider || agentId` 回退把内部 agentId 打成「服务商」
    // （用户实证 `twin/glm-5.3`）。
    const accountRecent = this.recentByAccount.get(rec.provider) ?? []
    accountRecent.unshift({ at: rec.at, agentId: rec.agentId, provider: rec.accountLabel, accountKind: rec.accountKind, model: rec.model, ok: rec.ok, ms: rec.ms, inputTokens: rec.inputTokens, outputTokens: rec.outputTokens })
    if (accountRecent.length > 10) accountRecent.length = 10
    this.recentByAccount.set(rec.provider, accountRecent)

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
    return rec
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
      // FIX-031：内存空判定必须把 scope 侧聚合（presetStats/accountScope）算进来
      // ——只发生过 recordScope（无任何 call 行）时内存并非真空，此时 load 会
      // 把盘上 scope 行再折叠一遍 → 请求计数双计（W-4 IBC-1 防双计语义补全）。
      const memoryEmpty = this.totals.size === 0 && this.accountTotals.size === 0 && this.days.size === 0 && this.detail.length === 0 && this.presetStats.size === 0 && this.accountScope.size === 0
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
        if (shaped.kind === 'scope') this.#foldScope(shaped)
        else this.#fold(shaped)
        continue
      }
      kept.push(raw)
      if (shaped.kind === 'scope') this.#foldScope(shaped)
      else this.#fold(shaped)
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

  /** 行形状校验/规整（未知附加字段容忍——向前兼容"只增不删"；EVO-017
   *  v2 起兼容 kind:'scope' 预设作用域行——校验分支独立于 v1 调用行）。 */
  #shapeOf(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    if (parsed.kind === 'scope') {
      const at = Number(parsed.at)
      if (!Number.isFinite(at)) return null
      if (typeof parsed.preset !== 'string' || !parsed.preset) return null
      if (typeof parsed.provider !== 'string' || typeof parsed.model !== 'string') return null
      return {
        at, kind: 'scope',
        preset: parsed.preset.slice(0, 64),
        origin: parsed.origin === 'subagent' ? 'subagent' : 'main',
        provider: parsed.provider || '?', model: parsed.model || '?',
      }
    }
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

  /** recent 从明细尾部重建（磁盘行无错误文本——重启后仅元数据）。
   *  FIX-031：detail 行 = 归一后的内存行（#fold 归一），重启恢复与实时记录
   *  同形同键；可见面 provider 字段取清洁账号标签。 */
  #rebuildRecent() {
    this.recent = this.detail.slice(-RECENT_CAP).reverse().map((rec) => ({
      at: rec.at,
      agentId: rec.agentId,
      provider: rec.accountLabel ?? rec.provider,
      accountKind: rec.accountKind,
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

  /** 聚合视图（RPC stats 消费；service.js statsSnapshot 迁移形状 + days/selfReport
   *  增量）。
   *
   *  FIX-031（DEC-029）：可见面全部输出**归一后**实体——
   *  · agent 面：agentId = agentKey（'twin'/'main' → 'main-model'）；
   *  · 账号面：provider = 清洁账号标签（无 `-router` 伪实体、无 `oauth:`/`pool:`
   *    内部标记），且 calls 走 #accountView 双权威源合并（scope 计数权威 + call
   *    token 权威）；
   *  · 明细面：recent/recentByAgent/recentByAccount 行自带 provider（清洁标签）
   *    + accountKind，显示层不再需要 `provider || agentId` 回退。 */
  snapshot() {
    const cutoff = new Date(this.now() - SERIES_WINDOW_MINUTES * 60_000).toISOString().slice(0, 16)
    const accountRows = this.#accountView()
    const accountTotals = accountRows.map((row) => ({
      provider: row.provider,
      accountKind: row.accountKind,
      calls: row.calls,
      requestCalls: row.requestCalls,
      callRows: row.callRows,
      errors: row.errors,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      totalMs: row.totalMs,
      lastAt: row.lastAt || undefined,
      models: row.models.map((modelTotal) => ({
        model: modelTotal.model,
        calls: modelTotal.calls,
        requestCalls: modelTotal.requestCalls,
        callRows: modelTotal.callRows,
        errors: modelTotal.errors,
        inputTokens: modelTotal.inputTokens,
        outputTokens: modelTotal.outputTokens,
        totalMs: modelTotal.totalMs,
        lastAt: modelTotal.lastAt || undefined,
      })),
    }))
    const accountRowByKey = new Map(accountRows.map((row) => [row.accountKey, row]))
    const totals = [...this.totals.values()].map((total) => ({
      agentId: total.agentId,
      name: total.name,
      provider: total.accountLabel ?? total.provider,
      accountKind: total.accountKind,
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
    const accountSeries = []
    for (const [accountKey, buckets] of this.accountSeries) {
      const kept = [...buckets.values()].filter((bucket) => bucket.minute >= cutoff).sort((a, b) => (a.minute < b.minute ? -1 : 1))
      for (const bucket of [...buckets.values()]) if (bucket.minute < cutoff) buckets.delete(bucket.minute)
      if (kept.length > 0) {
        const row = accountRowByKey.get(accountKey)
        accountSeries.push({ provider: row?.provider ?? accountDisplayLabel(accountKey), accountKind: row?.accountKind ?? normalizeAttribution({ provider: accountKey }).accountKind, buckets: kept })
      }
    }
    const days = {}
    for (const date of [...this.days.keys()].sort()) days[date] = { ...this.days.get(date) }
    // EVO-017：预设作用域聚合（每预设 main/subagent 两口径——totals/models
    // 分布/days/recent≤10；观测配置生效的专用面）。provider 已在 #foldScope
    // 归一（FIX-031 D1：包装路由不得成为预设卡上的独立服务商）。
    const presetStats = [...this.presetStats.entries()].map(([preset, arms]) => ({
      preset,
      main: scopeArmSnapshot(arms.main),
      subagent: scopeArmSnapshot(arms.subagent),
    })).sort((a, b) => (a.preset < b.preset ? -1 : 1))
    // EVO-017 R2：统一分组视图派生（per-agent / per-account 按天 + 最近≤10）。
    const dayMapSnapshot = (map) => [...map.entries()].map(([key, days]) => ({
      key,
      days: [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, day]) => ({
        date,
        calls: day.calls,
        errors: day.errors,
        inputTokens: day.inputTokens,
        outputTokens: day.outputTokens,
        ms: day.ms,
        cost: day.cost,
        models: [...day.models.values()].sort((a, b) => b.calls - a.calls),
      })),
    }))
    const agentDays = dayMapSnapshot(this.agentDays)
    // 账号按天 = 合并视图（计数权威 scope + 明细权威 call），非 call 侧原表。
    const accountDays = accountRows.map((row) => ({ key: row.provider, accountKind: row.accountKind, days: row.days }))
    const recentByAgent = [...this.recentByAgent.entries()].map(([agentId, entries]) => ({ key: agentId, recent: [...entries] }))
    // FIX-031 D2：账号级明细的分组键投影为清洁账号标签（内部身份键不外显）。
    const recentByAccount = [...this.recentByAccount.entries()].map(([accountKey, entries]) => {
      const attribution = normalizeAttribution({ provider: accountKey })
      return {
        key: accountRowByKey.get(accountKey)?.provider ?? attribution.accountLabel,
        accountKind: accountRowByKey.get(accountKey)?.accountKind ?? attribution.accountKind,
        recent: [...entries],
      }
    })
    return {
      totals,
      recent: [...this.recent],
      series,
      accountTotals,
      accountSeries,
      days,
      presetStats,
      agentDays,
      accountDays,
      recentByAgent,
      recentByAccount,
      selfReport: this.statsSelfReport(),
    }
  }


  /**
   * CSV 导出（§4.3 RPC statsExport 消费）：列 date/agent/account/model/calls/
   * errors/inputTokens/outputTokens/p50ms/p95ms/costEstimate；range '7d'|'30d'|
   * '90d'；level 'agent'（按 日期+agent+provider+model 分组）、'account'
   *（按 日期+provider+model 分组，agent 列留空）或 'preset'（EVO-017：按
   * 日期+预设+口径+provider+model 分组——agent 列填预设名、account 列填
   * 口径 main/subagent；计次口径无 token/耗时/成本，对应列留空）。分位从
   * 明细惰性计算（超量降级采样，§4.3）。
   *
   * FIX-031（DEC-029②/③）：导出是用户可见面——三级的 agent / account /
   * provider 列值全部取归一后实体（无 'twin'/'main' 内部 agentId、无 `-router`
   * 伪实体、无 'oauth:'/'pool:' 内部标记）。'account' 级 calls 列与账号卡同源
   * （#accountView 双权威源合并结果），token/分位列仍来自 call 明细。
   */
  export({ range = '7d', level = 'agent' } = {}) {
    const rangeDays = { '7d': 7, '30d': 30, '90d': 90 }[range]
    if (!rangeDays) throw new Error(`无效的统计导出 range："${range}"（可选 7d/30d/90d）`)
    if (level !== 'agent' && level !== 'account' && level !== 'preset') throw new Error(`无效的统计导出 level："${level}"（可选 agent/account/preset）`)
    const cutoffDate = dateKeyOf(this.now() - rangeDays * DAY_MS)
    // EVO-017：preset 级——从 presetStats 的 days 聚合直接展开（计次口径，
    // 无 token/耗时/成本列值）。
    if (level === 'preset') {
      const rows = []
      for (const [preset, arms] of this.presetStats) {
        for (const armName of ['main', 'subagent']) {
          const arm = arms[armName]
          for (const [date, day] of [...arm.days.entries()].sort()) {
            if (date < cutoffDate) continue
            for (const modelCount of [...day.models.values()].sort((a, b) => (a.model < b.model ? -1 : 1))) {
              rows.push({ date, preset, arm: armName, provider: modelCount.provider, model: modelCount.model, calls: modelCount.calls })
            }
          }
        }
      }
      rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
        || (a.preset < b.preset ? -1 : a.preset > b.preset ? 1 : 0)
        || (a.arm < b.arm ? -1 : a.arm > b.arm ? 1 : 0)
        || (a.model < b.model ? -1 : 1))
      const lines = rows.map((row) => [row.date, row.preset, row.arm, row.provider, row.model, row.calls].map(csvEscape).join(','))
      return ['date,preset,origin,provider,model,calls', ...lines].join('\n')
    }
    const groups = new Map()
    for (const rec of this.detail) {
      const date = dateKeyOf(rec.at)
      if (date < cutoffDate) continue
      const agent = level === 'agent' ? rec.agentId : ''
      const account = rec.accountLabel ?? rec.provider
      const key = `${date}|${agent}|${account}|${rec.model}`
      const group = groups.get(key) ?? {
        date, agent, account, model: rec.model,
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
    if (level === 'account') {
      // 账号级 calls 与账号卡同源：合并视图（计数权威 = scope 行）逐格覆盖
      // call 侧计数，并补齐仅有请求遥测、无任何 call 行的格子（D3 零覆盖面）。
      for (const row of this.#accountView()) {
        for (const day of row.days) {
          if (day.date < cutoffDate) continue
          for (const modelCount of day.models) {
            const key = `${day.date}||${row.provider}|${modelCount.model}`
            const group = groups.get(key) ?? {
              date: day.date, agent: '', account: row.provider, model: modelCount.model,
              calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, cost: 0, ms: [],
            }
            group.calls = modelCount.calls
            groups.set(key, group)
          }
        }
      }
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
    this.presetStats.clear()
    this.accountScope.clear()
    this.agentDays.clear()
    this.accountDays.clear()
    this.recentByAgent.clear()
    this.recentByAccount.clear()
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
