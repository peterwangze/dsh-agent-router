/**
 * EVO-024（ARCH-004 设计 §10 B6 / RISK-001 第①步）：全量测试门控单入口。
 *
 * 为什么需要本文件：Windows PowerShell 不展开 `node tests/*.mjs` 通配
 * （EVO-018 上报项）——此前门控靠逐文件手工执行或用 shell 内联循环，
 * 漏跑/停跑无人拦。本入口枚举 tests/*.mjs（排除本文件自身），逐一以
 * 子进程顺序执行并聚合退出码：**任一失败即非零退出**（`node tests/run-all.mjs`
 * = 单命令跑全量网，CI 第①步与本地门控共用同一命令）。
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
import { readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const TESTS_DIR = dirname(fileURLToPath(import.meta.url))
const SELF = 'run-all.mjs'
const TIMEOUT_MS = Number.parseInt(process.env.RUN_ALL_TIMEOUT_MS ?? '', 10) > 0
  ? Number.parseInt(process.env.RUN_ALL_TIMEOUT_MS, 10)
  : 10 * 60 * 1000

const suites = readdirSync(TESTS_DIR)
  .filter((name) => name.endsWith('.mjs') && name !== SELF)
  .sort()
const verbose = process.argv.includes('--verbose')

if (suites.length === 0) {
  console.error('run-all: tests/ 下未发现任何 *.mjs 套件（门控空跑——按失败处理）')
  process.exit(1)
}

console.log(`run-all: ${suites.length} suite(s), sequential, timeout ${Math.round(TIMEOUT_MS / 1000)}s/suite\n`)

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
  console.log(`\nALL ${suites.length} SUITES PASSED (${seconds}s)`)
  process.exit(0)
}
console.error(`\n${failures.length}/${suites.length} SUITE(S) FAILED (${seconds}s): ${failures.map((entry) => entry.suite).join(', ')}`)
process.exit(1)
