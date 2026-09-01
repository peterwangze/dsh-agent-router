// AUDIT-001 判别套件独立入口：node tests/audit-001.mjs（回归门控仍走 smoke.mjs）。
import { runAudit001ConcurrencyTests } from './audit-001-concurrency.mjs'

let failures = 0
function check(label, condition) {
  if (condition === true) console.log(`  ok  ${label}`)
  else { failures++; console.error(`FAIL  ${label}`) }
}

try {
  await runAudit001ConcurrencyTests(check)
} catch (error) {
  failures++
  console.error('FATAL', error)
}
console.log(failures === 0 ? 'AUDIT-001 suite: ALL GREEN' : `AUDIT-001 suite: ${failures} FAILURE(S)`)
process.exitCode = failures === 0 ? 0 : 1
