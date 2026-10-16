/**
 * EVO-018 宿主版本基线快照守卫（ARCH-004 设计 §3 D3(c) 初版，B0 批）。
 *
 * 目的：锁「实测宿主基线」——插件 package.json 声明面（peerDependencies /
 * dependencies 版本范围、dsh.client.inject 注入清单）与 README 兼容矩阵
 * 必须与实测基线一致；任一侧漂移（宿主升级后忘改声明、手滑改回旧范围、
 * 复活已消亡包的注入死行）→ 本测试必红。
 *
 * 实测基线（ARCH-005 R0 起为**双基线档案**，见下方 HOST_BASELINE_REGISTRY）：
 * - 0.1.5（frozen）：dsh 0.1.5-rc.1 / dsh-* 0.1.5-rc.2 / cordis 4.0.2 / schemastery 3.18.2
 *   （2026-09-12 机核；本仓 node_modules/@deepseek-ai/ 树仍为该组合）
 * - 0.2.0（primary）：dsh 与全部 dsh-* 0.2.0-rc.2 / cordis 4.0.5 / schemastery 3.18.5
 *   （npm 全局树实读 2026-10-17，实施时单点复读定谳——禁止照抄文档值）
 *
 * 依据（设计 §3 D1 表 D1-5 行，ADR-A）：宿主 runner/cordis 对 peerDependencies
 * 零 enforcement、安装器零告警——语义化版本范围不构成真实防护。本快照测试 +
 * README 兼容矩阵为权威防护；package.json 版本范围仅为「实测基线的记录性
 * 声明」（^ + 基线值），不做 enforcement 依赖。
 *
 * 判别性（红/绿演示）：把任一基线常量临时改成假版本号 → peerDeps/deps/README
 * 断言必红；package.json 范围改回 ^0.1.0-rc.* 或 inject 复活死行
 * @deepseek-ai/dsh-client-runtime（0.1.5 起宿主中不存在，加载器静默跳过的
 * 纯死重，D1-1 已删）→ 必红；复原后全绿。
 *
 * 如何刷新基线（宿主升级后）：
 * 1. 实读新宿主树（npm 全局树 = %APPDATA%\npm\node_modules\@deepseek-ai\dsh
 *    嵌套 scope 或 DSH_HOST_SOURCE 指向的 checkout）：各 <pkg>/package.json 的
 *    version 字段（dsh CLI 包与 cordis / schemastery 单独核对——**禁止照抄文档
 *    值，实施时单点复读树态定谳**，ARCH-005 T-6 纪律）；
 * 2. 同步更新多处：本文件 HOST_BASELINE_REGISTRY（新增档案项：旧主基线降级
 *    frozen、新项 status primary）、package.json 对应版本范围与 inject 清单
 *    （若有包消亡/新增）、README「宿主兼容性（实测基线）」小节、
 *    tests/host-contract.mjs 的 HOST_VERSION_BASELINE 副本（**主基线项相等**——
 *    S7/S3 靶子版本一致性判据用；两处常量由该文件「基线副本」断言机器锁定，
 *    漏改即红）；
 * 3. 跑 node tests/host-version-snapshot.mjs 确认绿，再跑全量门禁
 *    node tests/*.mjs 确认零回退。
 * 本测试不假设宿主 checkout 路径存在于测试环境——基线以常量形态记录于此。
 *
 * 独立入口：node tests/host-version-snapshot.mjs（exit 0/1）。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── 实测宿主基线档案（ARCH-005 R0：单表 → 双基线；唯一事实源 = 宿主树实读；刷新步骤见文件头注释）──
// 0.1.5（frozen）：历史实测基线——插件本仓 node_modules/@deepseek-ai/ 树仍为该版本组合
//   （ARCH-005 实施链 R1 声明面基线跳跃前的记录态）；契约基线仍由测试树承载。
// 0.2.0（primary）：当前主基线——npm 全局树实读（%APPDATA%\npm\node_modules\@deepseek-ai\dsh
//   嵌套 scope，2026-10-17 实施时单点复读：dsh 主包与全部 dsh-* 包 0.2.0-rc.2；cordis/schemastery
//   随树非 0.2.0-rc.2——4.0.5 / 3.18.5〔设计 F-B / 复审 R1 F-3 三方仲裁 3.18.5，本批复读复核〕）。
// 主基线项 = tests/host-contract.mjs 的 HOST_VERSION_BASELINE 副本（靶子版本一致性判据），
// 同源同值由该文件「基线副本」机器断言锁定（主基线项相等——任一侧刷新漏改即红）。
const HOST_BASELINE_REGISTRY = Object.freeze([
  { id: '0.1.5', status: 'frozen', dsh: '0.1.5-rc.1', dshPackages: '0.1.5-rc.2', cordis: '4.0.2', schemastery: '3.18.2' },
  { id: '0.2.0', status: 'primary', dsh: '0.2.0-rc.2', dshPackages: '0.2.0-rc.2', cordis: '4.0.5', schemastery: '3.18.5' },
])
/** 主基线项（唯一 primary；档案完整性断言在下方 section 0 锁定）。 */
const HOST_BASELINE = Object.freeze(HOST_BASELINE_REGISTRY.find((entry) => entry.status === 'primary'))
/** 各档案项的记录性声明口径（^ + 该项 dshPackages 实测值）。 */
const registeredRanges = HOST_BASELINE_REGISTRY.map((entry) => `^${entry.dshPackages}`)

/** 记录性声明口径：^ + 实测基线值（D1-5：不做 enforcement 依赖）。 */
const declaredRange = (version) => `^${version}`

/** 基线在册的 8 个 peerDeps 宿主供给包（D1-5 W-2 修正计数）。 */
const PEER_DEP_NAMES = [
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-agent-default-model',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-subagent',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-credentials',
]

/** 基线在册的 3 个 dsh-* 运行时依赖（直接 import 面，依赖清单 E 类）。 */
const DSH_RUNTIME_DEPS = [
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-typert-protocol',
]

/** 基线上存续的 3 个客户端注入包（dsh-client-runtime 0.1.5 起已消亡，D1-1 删）。 */
const INJECT_BASELINE = [
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-api-remotes',
]

/**
 * caret 范围（^M.m.p 形态——本仓库声明面实际使用的唯一范围形态）是否包含
 * 实测基线版本（M.m.p 数值序）。预发布后缀场景本断言不涉及（cordis /
 * schemastery 基线均为正式版）；范围改用其它形态 → 解析失败 → 红，
 * 强制走基线刷新流程而非静默放过。
 */
function caretRangeContains(range, version) {
  const base = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(String(range))
  const ver = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version))
  if (!base || !ver) return false
  const [baseMajor, baseMinor, basePatch] = [Number(base[1]), Number(base[2]), Number(base[3])]
  const [verMajor, verMinor, verPatch] = [Number(ver[1]), Number(ver[2]), Number(ver[3])]
  if (verMajor !== baseMajor) return false
  if (verMajor === 0 && verMinor !== baseMinor) return false
  return verMinor > baseMinor || (verMinor === baseMinor && verPatch >= basePatch)
}

let failures = 0
let passed = 0
const check = (label, condition) => {
  if (condition) { passed++; console.log(`  ok  ${label}`) }
  else { failures++; console.error(`FAIL  ${label}`) }
}

const pkg = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8'))
const readme = readFileSync(join(ROOT_DIR, 'README.md'), 'utf8')

// ── 0. 基线档案完整性（ARCH-005 R0：双基线档案自身的机器看护）─────────────
console.log('baseline registry integrity:')
check(`registry has exactly one primary entry (got ${HOST_BASELINE_REGISTRY.filter((entry) => entry.status === 'primary').length})`, HOST_BASELINE_REGISTRY.filter((entry) => entry.status === 'primary').length === 1)
check('registry ids are unique', new Set(HOST_BASELINE_REGISTRY.map((entry) => entry.id)).size === HOST_BASELINE_REGISTRY.length)
check('registry statuses are only frozen/primary', HOST_BASELINE_REGISTRY.every((entry) => entry.status === 'frozen' || entry.status === 'primary'))
check('registry entry fields complete (dsh/dshPackages/cordis/schemastery)', HOST_BASELINE_REGISTRY.every((entry) => [entry.dsh, entry.dshPackages, entry.cordis, entry.schemastery].every((value) => typeof value === 'string' && /^\d+\.\d+\.\d+(-rc\.\d+)?$/.test(value))))
/**
 * package.json 声明面对应的档案项（ARCH-005 R0 过渡窗语义）：
 * - 8 peerDeps + 3 dsh deps 的声明范围 MUST 收敛到**同一个** ^ 范围（分裂即红）；
 * - 该范围 MUST 命中档案某项的记录性口径（R0 时 = frozen 项 ^0.1.5-rc.2——
 *   package.json 属 R1「声明面基线跳跃批」的修改面，本批不动；R1 跳跃后 = primary 项）；
 * - 范围不属于任何档案项（假版本/漏登记基线）→ null → 下方逐项断言红。
 */
const declaredRangeValues = [
  ...PEER_DEP_NAMES.map((name) => pkg.peerDependencies?.[name]),
  ...DSH_RUNTIME_DEPS.map((name) => pkg.dependencies?.[name]),
]
const commonDeclaredRange = declaredRangeValues[0] && declaredRangeValues.every((range) => range === declaredRangeValues[0]) ? declaredRangeValues[0] : null
const declaredEntry = commonDeclaredRange ? HOST_BASELINE_REGISTRY.find((entry) => declaredRange(entry.dshPackages) === commonDeclaredRange) ?? null : null
check(`declared dsh range ${commonDeclaredRange ?? '<split/absent>'} maps to a registry entry (frozen/primary)`, declaredEntry !== null)

// ── 1. inject 静态比对（D1-1 死行守卫 + D3(c) 声明漂移静态校验，B0 即生效）──
console.log('dsh.client.inject manifest vs baseline:')
check('inject declares exactly the 3 baseline-surviving packages in order', JSON.stringify(pkg.dsh?.client?.inject) === JSON.stringify(INJECT_BASELINE))
check('inject no longer lists dead @deepseek-ai/dsh-client-runtime (gone since host 0.1.5)', !pkg.dsh?.client?.inject?.includes('@deepseek-ai/dsh-client-runtime'))
check('dsh.client.platform stays web', pkg.dsh?.client?.platform === 'web')

// ── 2. peerDeps 记录口径：恰为在册 8 项，每项 ∈ 档案记录性口径 ─────────────
console.log('peerDependencies measured-baseline record:')
const peerNames = Object.keys(pkg.peerDependencies ?? {})
check('peerDependencies covers exactly the 8 baseline host packages', JSON.stringify([...peerNames].sort()) === JSON.stringify([...PEER_DEP_NAMES].sort()))
for (const name of PEER_DEP_NAMES) {
  check(`peerDep ${name} records a registered baseline range (${registeredRanges.join(' | ')})`, registeredRanges.includes(pkg.peerDependencies?.[name]))
}

// ── 3. deps dsh 包记录口径：3 项 ∈ 档案记录性口径 ────────────────────────
console.log('dsh runtime deps measured-baseline record:')
for (const name of DSH_RUNTIME_DEPS) {
  check(`dep ${name} records a registered baseline range (${registeredRanges.join(' | ')})`, registeredRanges.includes(pkg.dependencies?.[name]))
}

// ── 4. 非 dsh 范围包含基线（cordis / schemastery：历史范围未证伪，从简保持；
//      断言「声明范围必须覆盖**主基线**」而非逐字锁定，合法 bump 不误伤）────
console.log('non-dsh ranges cover baseline:')
check(`dep @deepseek-ai/cordis range covers primary baseline ${HOST_BASELINE.cordis}`, caretRangeContains(pkg.dependencies?.['@deepseek-ai/cordis'], HOST_BASELINE.cordis))
check(`dep @deepseek-ai/schemastery range covers primary baseline ${HOST_BASELINE.schemastery}`, caretRangeContains(pkg.dependencies?.['@deepseek-ai/schemastery'], HOST_BASELINE.schemastery))

// ── 5. README 兼容矩阵同步（声明面所在档案项的实测基线 + 记录性语义 + 权威防护指针）──
//      R0 过渡窗：package.json 声明 = frozen 项 → README 必须载有 frozen 项四值
//      （当前 README 即该内容）；R1 声明面跳跃并改 README 矩阵后随 declaredEntry 切到 primary。
console.log('README compatibility matrix:')
check('README has 宿主兼容性（实测基线） section', readme.includes('### 宿主兼容性（实测基线）'))
check(`README records host CLI baseline dsh ${declaredEntry?.dsh}`, readme.includes(declaredEntry?.dsh ?? '<no declared entry>'))
check(`README records dsh-* baseline ${declaredEntry?.dshPackages}`, readme.includes(declaredEntry?.dshPackages ?? '<no declared entry>'))
check(`README records cordis baseline ${declaredEntry?.cordis}`, readme.includes(declaredEntry?.cordis ?? '<no declared entry>'))
check(`README records schemastery baseline ${declaredEntry?.schemastery}`, readme.includes(declaredEntry?.schemastery ?? '<no declared entry>'))
check('README declares peerDeps as 记录性 (record-only, no enforcement reliance)', readme.includes('记录性'))
check('README points authoritative guard to tests/host-version-snapshot.mjs', readme.includes('tests/host-version-snapshot.mjs'))

console.log(`baseline registry: ${HOST_BASELINE_REGISTRY.map((entry) => `${entry.id}(${entry.status}: dsh=${entry.dsh} dsh-*=${entry.dshPackages} cordis=${entry.cordis} schemastery=${entry.schemastery})`).join(' | ')} | declared=${commonDeclaredRange ?? '<split/absent>'} -> ${declaredEntry?.id ?? '<none>'}`)
console.log(failures === 0 ? `\nALL HOST VERSION SNAPSHOT TESTS PASSED (${passed} assertions)` : `\n${failures} FAILURE(S) (${passed} passed)`)
process.exit(failures === 0 ? 0 : 1)
