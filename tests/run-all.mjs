/**
 * EVO-024（ARCH-004 设计 §10 B6 / RISK-001 第①步）：全量测试门控单入口。
 *
 * 为什么需要本文件：Windows PowerShell 不展开 `node tests/*.mjs` 通配
 * （EVO-018 上报项）——此前门控靠逐文件手工执行或用 shell 内联循环，
 * 漏跑/停跑无人拦。本入口枚举 tests/*.mjs（排除本文件自身与 runner 模块，
 * 见下），逐一以子进程顺序执行并聚合退出码：**任一失败即非零退出**
 * （`node tests/run-all.mjs` = 单命令跑全量网，CI 第①步与本地门控共用同一命令）。
 *
 * 套件计数口径（FIX-036 P1-2）：启动行区分「N 独立套件 + M runner 模块」。
 * tests/ 下存在 **runner 模块**——只 `export async function runX(check)`，无顶层
 * 执行、无 process.exit，其断言由 smoke.mjs import 后调用承载。把这类模块当套件
 * 子进程执行必然 0 退出 → 打印零断言「PASS」（计数虚高 + per-suite 粒度零判别力 +
 * 静默覆盖丢失的假绿）。故本入口维护显式 RUNNER_MODULES 排除清单，并在跑套件前
 * **机器断言 smoke.mjs 仍 import 并调用这些 runX**——排除不得等于丢覆盖：
 * 调用点消失/改名/模块被误登记，门控即红（反 P4）。
 *
 * 纪律：
 * - **顺序执行**（非并行）：部分套件占用固定端口 / 临时 DSH_HOME / 进程级
 *   单例（oauth-loopback 固定回调端口等），并行会互扰产生假红绿；
 * - **每套件超时**（默认 10 分钟，RUN_ALL_TIMEOUT_MS 可覆盖）：挂死套件不得
 *   吞掉整个门控（超时按失败计并打印其输出尾部）；
 * - 通过套件只打一行摘要（保持 CI 日志可读）；失败套件打印完整输出（诊断优先）；
 * - 确定性顺序（文件名排序）——便于对照历次跑批结果。
 *
 * 用法：
 *   node tests/run-all.mjs                # 全量门控
 *   npm test                              # 等价（package.json scripts.test）
 *   node tests/run-all.mjs --verbose      # 全部套件完整输出
 *   RUN_ALL_TIMEOUT_MS=60000 node tests/run-all.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const TESTS_DIR = dirname(fileURLToPath(import.meta.url))
const SELF = 'run-all.mjs'
/** runner 模块断言的唯一承载套件（pre-flight 调用点断言的对象）。 */
const SMOKE_SUITE = 'smoke.mjs'
/**
 * runner 模块排除清单：只 export `runX(check)`，无顶层执行、无 process.exit
 * → 子进程执行 = 零断言幻影 PASS，不得计入套件。新增 runner 模块 MUST 同时
 * 登记本清单 + 在 smoke.mjs 接线（pre-flight 双向核验：漏登记 → 幻影 PASS 被
 * 本清单拦不住；登记而漏接线/含 process.exit → pre-flight 红）。
 */
const RUNNER_MODULES = ['attachments.mjs', 'audit-001-concurrency.mjs', 'client-render.mjs', 'install-entry.mjs']
const TIMEOUT_MS = Number.parseInt(process.env.RUN_ALL_TIMEOUT_MS ?? '', 10) > 0
  ? Number.parseInt(process.env.RUN_ALL_TIMEOUT_MS, 10)
  : 10 * 60 * 1000

// ── runner 模块覆盖 pre-flight（排除 ≠ 丢覆盖：调用点必须在场）───────────────
{
  const smokeSource = readFileSync(join(TESTS_DIR, SMOKE_SUITE), 'utf8')
  const problems = []
  const wiring = []
  for (const module of RUNNER_MODULES) {
    const path = join(TESTS_DIR, module)
    if (!existsSync(path)) {
      problems.push(`${module}: 清单登记的 runner 模块不存在（清单陈旧——补文件或修正清单，禁留空洞）`)
      continue
    }
    const source = readFileSync(path, 'utf8')
    if (/process\.exit/.test(source)) {
      problems.push(`${module}: 含 process.exit → 是独立套件，不得列入 runner 排除清单（会静默停跑其断言）`)
      continue
    }
    const exported = [...source.matchAll(/export\s+(?:async\s+)?function\s+(run[A-Za-z0-9_]*)/g)].map((match) => match[1])
    if (exported.length === 0) {
      problems.push(`${module}: 零 runX 导出（非 runner 形态——不得列入排除清单）`)
      continue
    }
    if (!new RegExp(`from\\s*['"]\\./${module.replace(/\./g, '\\.')}['"]`).test(smokeSource)) {
      problems.push(`${module}: ${SMOKE_SUITE} 未 import（排除即丢覆盖——断言无承载入口）`)
    }
    for (const name of exported) {
      // 调用点断言：import 行形如 `{ runX }`（名后接 `}`），不匹配 `runX(`——故命中即真调用点。
      if (!new RegExp(`\\b${name}\\s*\\(`).test(smokeSource)) {
        problems.push(`${module}: ${SMOKE_SUITE} 未调用 ${name}()（调用点被移除/改名 = 覆盖静默丢失）`)
      }
    }
    wiring.push(`${module} → ${exported.join(', ')}`)
  }
  if (problems.length > 0) {
    console.error(`run-all: runner 模块覆盖 pre-flight 失败（${RUNNER_MODULES.length} 项排除清单，排除不得静默丢覆盖）:`)
    for (const problem of problems) console.error(`  FAIL  ${problem}`)
    process.exit(1)
  }
  console.log(`run-all: ${RUNNER_MODULES.length} runner module(s) 排除清单已核验（断言由 ${SMOKE_SUITE} 承载，调用点在场）:`)
  for (const line of wiring) console.log(`  · ${line}`)
}

const suites = readdirSync(TESTS_DIR)
  .filter((name) => name.endsWith('.mjs') && name !== SELF && !RUNNER_MODULES.includes(name))
  .sort()
const verbose = process.argv.includes('--verbose')

if (suites.length === 0) {
  console.error('run-all: tests/ 下未发现任何 *.mjs 套件（门控空跑——按失败处理）')
  process.exit(1)
}

console.log(`run-all: ${suites.length} suite(s)（独立套件）, sequential, timeout ${Math.round(TIMEOUT_MS / 1000)}s/suite\n`)

const failures = []
const startedAt = Date.now()
for (const suite of suites) {
  const suiteStarted = Date.now()
  const result = spawnSync(process.execPath, [join(TESTS_DIR, suite)], {
    stdio: verbose ? 'inherit' : 'pipe',
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    env: process.env,
  })
  const ms = Date.now() - suiteStarted
  const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM'
  const ok = !timedOut && result.status === 0
  if (ok) {
    console.log(`PASS  ${suite}  (${ms}ms)`)
    continue
  }
  failures.push({ suite, status: result.status, signal: result.signal, timedOut })
  console.error(`FAIL  ${suite}  (${ms}ms${timedOut ? ', TIMEOUT' : ''}${result.status === null ? '' : `, exit=${result.status}`}${result.signal ? `, signal=${result.signal}` : ''})`)
  if (!verbose) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    const tail = output.split(/\r?\n/).filter((line) => line.length > 0).slice(-25)
    for (const line of tail) console.error(`      | ${line}`)
  }
}

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
if (failures.length === 0) {
  console.log(`\nALL ${suites.length} SUITES + ${RUNNER_MODULES.length} RUNNER MODULES (via ${SMOKE_SUITE}) PASSED (${seconds}s)`)
  process.exit(0)
}
console.error(`\n${failures.length}/${suites.length} SUITE(S) FAILED (${seconds}s): ${failures.map((entry) => entry.suite).join(', ')}`)
process.exit(1)
