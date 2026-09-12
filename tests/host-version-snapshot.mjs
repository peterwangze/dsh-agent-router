/**
 * EVO-018 宿主版本基线快照守卫（ARCH-004 设计 §3 D3(c) 初版，B0 批）。
 *
 * 目的：锁「实测宿主基线」——插件 package.json 声明面（peerDependencies /
 * dependencies 版本范围、dsh.client.inject 注入清单）与 README 兼容矩阵
 * 必须与实测基线一致；任一侧漂移（宿主升级后忘改声明、手滑改回旧范围、
 * 复活已消亡包的注入死行）→ 本测试必红。
 *
 * 实测基线（宿主 checkout 各 package.json version 字段实读，Coordinator 机核
 * 2026-09-12；事实源 .governance/arch-004-dependency-inventory.md §0）：
 * - dsh（宿主 CLI 包 @deepseek-ai/dsh）      = 0.1.5-rc.1
 * - 全部 dsh-* 包（8 peerDeps + 3 deps）      = 0.1.5-rc.2
 * - @deepseek-ai/cordis                       = 4.0.2
 * - @deepseek-ai/schemastery                  = 3.18.2
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
 * 1. 实读新宿主 checkout：node_modules/@deepseek-ai/<pkg>/package.json 的 version
 *    字段（dsh CLI 包与 cordis / schemastery 单独核对）；
 * 2. 同步更新四处：本文件 HOST_BASELINE 常量、package.json 对应版本范围与
 *    inject 清单（若有包消亡/新增）、README「宿主兼容性（实测基线）」小节、
 *    tests/host-contract.mjs 的 HOST_VERSION_BASELINE 副本（S7/S3 靶子版本
 *    一致性判据用——两处常量由该文件「基线副本」断言机器锁定，漏改即红）；
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

// ── 实测宿主基线（唯一事实源 = 宿主 checkout 实读；刷新步骤见文件头注释）──
const HOST_BASELINE = Object.freeze({
  dsh: '0.1.5-rc.1',          // 宿主 CLI 包 @deepseek-ai/dsh
  dshPackages: '0.1.5-rc.2',  // 全部 dsh-* 包（8 peerDeps + dsh-llm/dsh-tools/dsh-typert-protocol）
  cordis: '4.0.2',
  schemastery: '3.18.2',
})

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

// ── 1. inject 静态比对（D1-1 死行守卫 + D3(c) 声明漂移静态校验，B0 即生效）──
console.log('dsh.client.inject manifest vs baseline:')
check('inject declares exactly the 3 baseline-surviving packages in order', JSON.stringify(pkg.dsh?.client?.inject) === JSON.stringify(INJECT_BASELINE))
check('inject no longer lists dead @deepseek-ai/dsh-client-runtime (gone since host 0.1.5)', !pkg.dsh?.client?.inject?.includes('@deepseek-ai/dsh-client-runtime'))
check('dsh.client.platform stays web', pkg.dsh?.client?.platform === 'web')

// ── 2. peerDeps 记录口径：恰为在册 8 项，每项 = ^ + 实测基线 ──────────────
console.log('peerDependencies measured-baseline record:')
const peerNames = Object.keys(pkg.peerDependencies ?? {})
check('peerDependencies covers exactly the 8 baseline host packages', JSON.stringify([...peerNames].sort()) === JSON.stringify([...PEER_DEP_NAMES].sort()))
for (const name of PEER_DEP_NAMES) {
  check(`peerDep ${name} records ${declaredRange(HOST_BASELINE.dshPackages)}`, pkg.peerDependencies?.[name] === declaredRange(HOST_BASELINE.dshPackages))
}

// ── 3. deps dsh 包记录口径：3 项 = ^ + 实测基线 ──────────────────────────
console.log('dsh runtime deps measured-baseline record:')
for (const name of DSH_RUNTIME_DEPS) {
  check(`dep ${name} records ${declaredRange(HOST_BASELINE.dshPackages)}`, pkg.dependencies?.[name] === declaredRange(HOST_BASELINE.dshPackages))
}

// ── 4. 非 dsh 范围包含基线（cordis / schemastery：历史范围未证伪，从简保持；
//      断言「声明范围必须覆盖实测基线」而非逐字锁定，合法 bump 不误伤）────
console.log('non-dsh ranges cover baseline:')
check(`dep @deepseek-ai/cordis range covers baseline ${HOST_BASELINE.cordis}`, caretRangeContains(pkg.dependencies?.['@deepseek-ai/cordis'], HOST_BASELINE.cordis))
check(`dep @deepseek-ai/schemastery range covers baseline ${HOST_BASELINE.schemastery}`, caretRangeContains(pkg.dependencies?.['@deepseek-ai/schemastery'], HOST_BASELINE.schemastery))

// ── 5. README 兼容矩阵同步（实测基线 + 记录性语义 + 权威防护指针）──────────
console.log('README compatibility matrix:')
check('README has 宿主兼容性（实测基线） section', readme.includes('### 宿主兼容性（实测基线）'))
check(`README records host CLI baseline dsh ${HOST_BASELINE.dsh}`, readme.includes(HOST_BASELINE.dsh))
check(`README records dsh-* baseline ${HOST_BASELINE.dshPackages}`, readme.includes(HOST_BASELINE.dshPackages))
check(`README records cordis baseline ${HOST_BASELINE.cordis}`, readme.includes(HOST_BASELINE.cordis))
check(`README records schemastery baseline ${HOST_BASELINE.schemastery}`, readme.includes(HOST_BASELINE.schemastery))
check('README declares peerDeps as 记录性 (record-only, no enforcement reliance)', readme.includes('记录性'))
check('README points authoritative guard to tests/host-version-snapshot.mjs', readme.includes('tests/host-version-snapshot.mjs'))

console.log(`baseline: dsh=${HOST_BASELINE.dsh} dsh-*=${HOST_BASELINE.dshPackages} cordis=${HOST_BASELINE.cordis} schemastery=${HOST_BASELINE.schemastery}`)
console.log(failures === 0 ? `\nALL HOST VERSION SNAPSHOT TESTS PASSED (${passed} assertions)` : `\n${failures} FAILURE(S) (${passed} passed)`)
process.exit(failures === 0 ? 0 : 1)
