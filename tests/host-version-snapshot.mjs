/**
 * EVO-018 宿主版本基线快照守卫（ARCH-004 设计 §3 D3(c) 初版，B0 批）。
 *
 * 目的：锁「实测宿主基线」——插件 package.json 声明面（peerDependencies /
 * dependencies 版本范围、dsh.client.inject 注入清单）与 README 兼容矩阵
 * 必须与实测基线一致；任一侧漂移（宿主升级后忘改声明、手滑改回旧范围、
 * 复活已消亡包的注入死行）→ 本测试必红。
 *
 * 实测基线（ARCH-005 R0 起为**多基线档案**，见下方 HOST_BASELINE_REGISTRY；ARCH-006
 * 刷新至三档案）：
 * - 0.1.5（frozen）：dsh 0.1.5-rc.1 / dsh-* 0.1.5-rc.2 / cordis 4.0.2 / schemastery 3.18.2
 *   （2026-09-12 机核；R1 安装同步后本仓树已不再保持该组合，见 0.2.0 行）
 * - 0.2.0（frozen）：dsh 与全部 dsh-* 0.2.0-rc.2 / cordis 4.0.5 / schemastery 3.18.5
 *   （npm 全局树实读 2026-10-17；ARCH-006 起降档 frozen——本仓 node_modules 树与
 *   package.json 声明面仍锚定该档案项〔^0.2.0-rc.2 ×11〕，见下方声明面覆盖判据）
 * - 0.2.1（primary）：dsh 与全部 dsh-* 0.2.1-rc.2 / cordis 4.0.5 / schemastery 3.18.5
 *   （npm 全局树实读 2026-10-20 实施时单点复读定谳——禁止照抄文档值；四类 diff 全
 *   additive：锚 0 漂移 / events +1 plugin-market/changed / llm.listConfigurableProviders
 *   schema 6→9 纯超集 / 包表 8 项 dsh 系版本号差，cordis 与 schemastery 未变。装载门
 *   cold-install-gate + apply 门 a3-apply-gate 双 GREEN 实证 ^0.2.0-rc.2 声明容纳
 *   0.2.1-rc.2）
 *
 * 依据（ARCH-004 §3 D1-5 / ADR-A；ARCH-005 R1 修订口径——旧「宿主 runner/cordis
 * 零 enforcement、安装器零告警」叙事被 0.2.0 装载门终结，见设计 §3-9 / HD-001）：
 * 插件自身运行不依赖 semver enforcement 判定宿主（该半边延续）；但宿主 0.2.0 起
 * dsh-app-boot 装载门对 manifest 全部 @deepseek-ai/dsh* peerDeps 逐项
 * semver.satisfies(includePrerelease) 硬门控——声明范围 = 门控钥匙（不满足且无豁免
 * 即整层拒载，宿主 stderr 有可观测 skip 警告）；peerDependenciesMeta optional 仅
 * 影响安装器行为、不解除装载门。本快照测试 + README 兼容矩阵仍为声明面漂移的
 * 权威防护（防宿主升级后忘改声明 / 基线跳跃被无声回退 / 复活死行）。
 * 声明面 README 判据（§5）分两层：① declaredEntry（声明面逐字锚定的 frozen 项）
 * 全文记录判据；② **primary 行结构判据**（FIX-053，REVIEW-REL-013-R0 P2-1）——
 * 「支持基线集」表恰一 primary 行、行内 dsh CLI / 全系 dsh-* / cordis / schemastery
 * 四列逐格 === HOST_BASELINE_REGISTRY 的 primary 项（缺行 / 重复 / 漏改即红）。
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
 *    frozen、新项 status primary）、package.json 对应版本范围（ARCH-006 起仅当现范围
 *    **不再覆盖**新 primary 时才需改——覆盖判据见 section 0）与 inject 清单
 *    （若有包消亡/新增）、README「宿主兼容性（实测基线）」小节（声明面锚定项随动）、
 *    tests/host-contract.mjs（ARCH-005 R3 起经**文本提取**消费本注册表——无第二份
 *    版本常量可漏改，提取/选择失败即红；其靶子面判据按 DSH_BASELINE 所选档案项
 *    判定，声明面判据恒取 primary 项）；
 * 3. 跑 node tests/host-version-snapshot.mjs 确认绿，再跑全量门禁
 *    node tests/*.mjs 确认零回退。
 * 本测试不假设宿主 checkout 路径存在于测试环境——基线以常量形态记录于此。
 *
 * 基线选择（ARCH-005 R3——看护矩阵化）：环境变量 `DSH_BASELINE` 选择**目标基线**
 * （值 = 档案 id（如 '0.1.5'/'0.2.0'）或 status 关键词（'frozen'/'primary'）；未设/空白 =
 * 默认 primary——本地默认行为不变）。选择只作用于**靶子面/契约面**判据（消费方 =
 * tests/host-contract.mjs 的版本一致性判据与 S7/S5/S2 宿主侧判据——后者按条目 since
 * 分代，所选基线低于条目 since 时记可见 skip）；本套件的声明面断言（§0-§5）**恒判
 * primary**（F-1 收紧不因非默认选择放松——DSH_BASELINE=frozen 不是把 package.json
 * 回退 frozen 范围的合法通道）。未知值 → §0b 显式判红并收口退出（P8 fail-closed：
 * 基线切换失败可观测，不静默回退默认）。CI 矩阵 job（.github/workflows/ci.yml 的
 * guard-matrix）按本注册表解析 pinned 版本安装宿主关键包后以同门控命令消费该机制。
 *
 * 独立入口：node tests/host-version-snapshot.mjs（exit 0/1）。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── 实测宿主基线档案（ARCH-005 R0：单表 → 多基线；唯一事实源 = 宿主树实读；刷新步骤见文件头注释）──
// 0.1.5（frozen）：历史实测基线，仅以档案常量承载（R1 安装同步前本仓树曾为该组合；
//   R1 起 frozen 项不再被声明面接受——section 0 的 F-1 收紧，回退即红）。
// 0.2.0（frozen）：ARCH-006 前的主基线——npm 全局树实读（%APPDATA%\npm\node_modules\
//   @deepseek-ai\dsh 嵌套 scope，2026-10-17）；ARCH-006 起随 0.2.1 升格降档 frozen
//   （本仓 node_modules 树与 package.json 声明面 ^0.2.0-rc.2 ×11 仍锚定本档案项——
//   声明面零改动收编，见 section 0 覆盖判据；该范围覆盖新 primary 0.2.1-rc.2）。
// 0.2.1（primary）：当前主基线——npm 全局树实读（同上路径，2026-10-20 实施时单点
//   复读：dsh 主包与全部 dsh-* 包 0.2.1-rc.2；cordis/schemastery 未变——4.0.5 / 3.18.5）。
// 本档案 = 唯一事实源（ARCH-005 R3 起 tests/host-contract.mjs 亦经文本提取消费本注册表
// ——无第二份版本常量，提取/选择失败即红；「双份常量机器锁定」纪律（F-J）随之退役为
// 「单份常量 + 提取判据」）。
const HOST_BASELINE_REGISTRY = Object.freeze([
  { id: '0.1.5', status: 'frozen', dsh: '0.1.5-rc.1', dshPackages: '0.1.5-rc.2', cordis: '4.0.2', schemastery: '3.18.2' },
  { id: '0.2.0', status: 'frozen', dsh: '0.2.0-rc.2', dshPackages: '0.2.0-rc.2', cordis: '4.0.5', schemastery: '3.18.5' },
  { id: '0.2.1', status: 'primary', dsh: '0.2.1-rc.2', dshPackages: '0.2.1-rc.2', cordis: '4.0.5', schemastery: '3.18.5' },
])
/** 主基线项（唯一 primary；档案完整性断言在下方 section 0 锁定）。 */
const HOST_BASELINE = Object.freeze(HOST_BASELINE_REGISTRY.find((entry) => entry.status === 'primary'))

/**
 * 目标基线选择（ARCH-005 R3——看护矩阵化）：`DSH_BASELINE` 环境变量（值 = 档案 id
 * 或 status 关键词；未设/空白 = 默认 primary——本地默认行为不变）。选择结果只供
 * **靶子面/契约面**消费方使用（tests/host-contract.mjs 的版本一致性判据 + 其 S7/S5/S2
 * 宿主侧判据按所选档案项与条目 since 分代判定）；本套件的声明面断言（§0-§5）恒判
 * primary——非默认选择不是把声明面回退 frozen 的通道（F-1 收紧不放松）。未知值在
 * 下方 §0b 显式判红并收口退出（P8 fail-closed：基线切换失败可观测，不静默回退默认）。
 */
const DSH_BASELINE_RAW = String(process.env.DSH_BASELINE ?? '').trim()
const SELECTED_BASELINE = DSH_BASELINE_RAW === ''
  ? HOST_BASELINE
  : HOST_BASELINE_REGISTRY.find((entry) => entry.id === DSH_BASELINE_RAW || entry.status === DSH_BASELINE_RAW) ?? null

/** 记录性声明口径：^ + 实测基线值（D1-5：不做 enforcement 依赖）。 */
const declaredRange = (version) => `^${version}`

/** 基线在册的 8 个 peerDeps 宿主供给包（D1-5 W-2 修正计数；optional 特性面）。 */
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

/**
 * 基线在册的 3 个 dsh-* 运行时依赖（直接 import 面，依赖清单 E 类）。
 *
 * v0.7.0 起重置（2026-10-25 桌面端启动故障）：这 3 包由 `dependencies` 迁入
 * `peerDependencies`——它们**不是本包的依赖**，而是宿主供给的运行面。写成
 * `dependencies` 会让 pnpm 在 profile 根提升出第二份副本，宿主装载门
 * （`dsh-app-boot` preflight → `manifestOf` 走未拦截的最近副本解析）据此判定
 * 核心行 `tools` 代际不兼容并 disable，`agent-loop`（required）永久 pending，
 * 桌面端启动即失败。故本表自 v0.7.0 起从 peerDependencies 读取。
 */
const DSH_RUNTIME_DEPS = [
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-typert-protocol',
]

/** 基线在册的 2 个平台包（cordis / schemastery）——同属宿主供给，禁入 dependencies。 */
const PLATFORM_DEPS = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/schemastery',
]

/** 基线上存续的 3 个客户端注入包（dsh-client-runtime 0.1.5 起已消亡，D1-1 删）。 */
const INJECT_BASELINE = [
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-api-remotes',
]

/**
 * caret 范围（^M.m.p 形态，可选 -rc.N 预发布后缀——本仓库声明面实际使用的唯一范围
 * 形态）是否包含实测基线版本（M.m.p 数值序，预发布后缀不参与——宿主装载门
 * satisfies(includePrerelease) 的镜像判据；ARCH-006 起兼承 dsh 系 rc 版本的覆盖判定）。
 * 范围改用其它形态 → 解析失败 → 红，强制走基线刷新流程而非静默放过。
 */
function caretRangeContains(range, version) {
  const base = /^\^(\d+)\.(\d+)\.(\d+)(?:-rc\.\d+)?$/.exec(String(range))
  const ver = /^(\d+)\.(\d+)\.(\d+)(?:-rc\.\d+)?$/.exec(String(version))
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
 * package.json 声明面对应的档案项：
 * - 8 peerDeps + 3 dsh deps 的声明范围 MUST 收敛到**同一个** ^ 范围（分裂即红）；
 * - 该范围 MUST **覆盖主基线项**（primary）的 dshPackages（ARCH-006 语义演进：范围型
 *   声明容纳主基线——装载门 satisfies(includePrerelease) 判据的镜像；^0.2.0-rc.2 ⊇
 *   0.2.1-rc.2 合法。R1 F-1 的守卫意图不降：回退到不覆盖主基线的范围——frozen 历史
 *   口径（^0.1.5-rc.2）或任何其它范围（假版本/漏登记基线）→ 判红，「基线跳跃被
 *   无声回退」守卫点延续）；
 * - declaredEntry（声明面逐字锚定的档案项——section 5 README 判据用）仅作记录面，
 *   ARCH-006 起允许为 in-registry 非 primary 项（本仓声明面锚 0.2.0 frozen 项）。
 */
const declaredRangeValues = [
  ...PEER_DEP_NAMES.map((name) => pkg.peerDependencies?.[name]),
  ...DSH_RUNTIME_DEPS.map((name) => pkg.peerDependencies?.[name]),
]
const commonDeclaredRange = declaredRangeValues[0] && declaredRangeValues.every((range) => range === declaredRangeValues[0]) ? declaredRangeValues[0] : null
const declaredEntry = commonDeclaredRange ? HOST_BASELINE_REGISTRY.find((entry) => declaredRange(entry.dshPackages) === commonDeclaredRange) ?? null : null
check(`declared dsh range ${commonDeclaredRange ?? '<split/absent>'} covers the PRIMARY registry baseline ${HOST_BASELINE !== undefined ? HOST_BASELINE.dshPackages : '<no primary>'} (ARCH-006: range-style declaration must contain the primary baseline — mirror of the host gate's satisfies(includePrerelease); a range that no longer covers primary, e.g. the frozen ${HOST_BASELINE_REGISTRY.find((entry) => entry.status !== 'primary')?.dshPackages ?? 'legacy'} form, stays red — F-1 tightening intent preserved)`,
  HOST_BASELINE !== undefined && commonDeclaredRange !== null && caretRangeContains(commonDeclaredRange, HOST_BASELINE.dshPackages))
if (declaredEntry === null && commonDeclaredRange !== null) {
  console.log(`  --  declared range ${commonDeclaredRange} anchors no registry entry (fake/unregistered version — README 判据组将红；ARCH-006：声明面锚定项与主基线覆盖关系分离登记)`)
}

// F-3（R0 审查承接）：注册表零 primary 项时 HOST_BASELINE 为 undefined——其后
// section 4 的 HOST_BASELINE.cordis 等派生读数会 TypeError 崩栈、截断全部后续断言
// 与汇总行（结局红、形态不优雅）。前置优雅判红后收口退出（fail-closed 且可诊断）。
if (HOST_BASELINE === undefined) {
  console.error('FAIL  baseline registry has no primary entry — sections 1-5 skipped (fail-closed; fix HOST_BASELINE_REGISTRY before relying on this guard)')
  failures++
  console.error(`\n${failures} FAILURE(S) (${passed} passed)`)
  process.exit(1)
}

// ── 0b. 目标基线选择（ARCH-005 R3）：DSH_BASELINE 解析 + fail-closed ──────────
// 选择只作用于靶子面/契约面（消费方 host-contract）；声明面断言恒判 primary（F-1）。
// 未知值必须显式判红收口——静默回退默认会把「切错基线」伪装成「没切」（P8）。
check(`DSH_BASELINE '${DSH_BASELINE_RAW || '<unset>'}' resolves to a registry entry (id or status keyword; unset → primary)`, SELECTED_BASELINE !== null)
if (SELECTED_BASELINE === null) {
  // 失败计数单记：上方 check() 已 failures++（P3-1 收口——此前此处手动再 ++ 致双记，
  // 与 F-3 块「裸 console.error + 手动单计」形态区分：本块判据经 check 承载）。
  console.error(`FAIL  DSH_BASELINE='${DSH_BASELINE_RAW}' matches no registry entry (valid: ${HOST_BASELINE_REGISTRY.map((entry) => `${entry.id}/${entry.status}`).join(', ')}) — fail-closed, sections 1-5 skipped (P8: baseline switch failure must be observable, never a silent fallback to primary)`)
  console.error(`\n${failures} FAILURE(S) (${passed} passed)`)
  process.exit(1)
}
if (SELECTED_BASELINE !== HOST_BASELINE) {
  console.log(`  --  DSH_BASELINE=${SELECTED_BASELINE.id}(${SELECTED_BASELINE.status}) selected — target-face parameterization (ARCH-005 R3); declaration-face sections 1-5 below stay PRIMARY-anchored (F-1 not relaxed by non-default selection)`)
}

// ── 1. inject 静态比对（D1-1 死行守卫 + D3(c) 声明漂移静态校验，B0 即生效）──
console.log('dsh.client.inject manifest vs baseline:')
check('inject declares exactly the 3 baseline-surviving packages in order', JSON.stringify(pkg.dsh?.client?.inject) === JSON.stringify(INJECT_BASELINE))
check('inject no longer lists dead @deepseek-ai/dsh-client-runtime (gone since host 0.1.5)', !pkg.dsh?.client?.inject?.includes('@deepseek-ai/dsh-client-runtime'))
check('dsh.client.platform stays web', pkg.dsh?.client?.platform === 'web')

// ── 2. peerDeps 记录口径：恰为在册 13 项（8 特性 + 3 运行时 + 2 平台），
//      运行时/特性 11 项 === 共同声明范围（覆盖主基线——F-1 语义演进）──
console.log('peerDependencies measured-baseline record:')
const peerNames = Object.keys(pkg.peerDependencies ?? {})
/**
 * v0.7.0 声明面纯净性守卫（2026-10-25 桌面端启动故障的**直接回归判据**）。
 *
 * 故障一手机制：`@deepseek-ai/*` 出现在 `dependencies` → pnpm（profile 侧
 * `nodeLinker: hoisted`）把它提升到 profile 根 `node_modules` → 宿主装载门
 * `preflight`/`manifestOf` 的最近副本解析读到旧代副本 → 核心行 `tools` 被
 * disable → required `agent-loop` 永久 pending → 桌面端启动失败，且重置
 * bundle/补丁层无法恢复。因此**任何**宿主供给包进入 `dependencies` 即红，
 * 不看版本是否「恰好相容」——新版也会遮蔽宿主自身，同属故障形态。
 */
const hostOwnedDeps = Object.keys(pkg.dependencies ?? {}).filter((name) => name.startsWith('@deepseek-ai/'))
check('dependencies declares ZERO @deepseek-ai/* packages (host-supplied packages must be peerDependencies only — profile-root hoisting disables the host tools row and hard-fails desktop startup)',
  hostOwnedDeps.length === 0, hostOwnedDeps)
check('dependencies keeps only genuinely self-owned runtime deps (undici)', JSON.stringify(Object.keys(pkg.dependencies ?? {})) === JSON.stringify(['undici']), pkg.dependencies)
check('peerDependencies covers exactly the 13 baseline host packages (8 feature + 3 runtime + 2 platform)', JSON.stringify([...peerNames].sort()) === JSON.stringify([...PEER_DEP_NAMES, ...DSH_RUNTIME_DEPS, ...PLATFORM_DEPS].sort()))
check(`peerDependenciesMeta.optional is exactly the 8 feature peers (hard runtime/platform peers stay required)`,
  JSON.stringify(Object.keys(pkg.peerDependenciesMeta ?? {}).filter((name) => pkg.peerDependenciesMeta[name]?.optional === true).sort()) === JSON.stringify([...PEER_DEP_NAMES].sort()))
for (const name of [...PEER_DEP_NAMES, ...DSH_RUNTIME_DEPS]) {
  check(`peerDep ${name} records the common declared range (${commonDeclaredRange ?? '<split/absent>'}) covering PRIMARY ${HOST_BASELINE.dshPackages} (ARCH-006 coverage semantics — split/absent red)`, pkg.peerDependencies?.[name] === commonDeclaredRange)
}
/**
 * engines.dsh 单字段运行时契约（v0.7.0）：宿主 `dsh-app-boot`
 * `unmetRequirements` 语义是「自身 engines.dsh 存在则单独判定、忽略 peer 判定」，
 * 即宿主装载门的**权威输入**。要求它与共同 peer 范围**逐字相同**（单一口径，
 * 防两套范围静默分叉）。
 */
check(`engines.dsh === the common peer range (${commonDeclaredRange ?? '<split/absent>'}; host gate gives engines.dsh precedence over peers — two diverging ranges would silently split the contract)`,
  typeof commonDeclaredRange === 'string' && pkg.engines?.dsh === commonDeclaredRange, pkg.engines)

// ── 3. 平台包范围包含基线（cordis / schemastery 由宿主供给，同为 peer）───────
console.log('platform peer packages range coverage:')
check(`dep @deepseek-ai/cordis range covers primary baseline ${HOST_BASELINE.cordis}`, caretRangeContains(pkg.peerDependencies?.['@deepseek-ai/cordis'], HOST_BASELINE.cordis), pkg.peerDependencies?.['@deepseek-ai/cordis'])
check(`dep @deepseek-ai/schemastery range covers primary baseline ${HOST_BASELINE.schemastery}`, caretRangeContains(pkg.peerDependencies?.['@deepseek-ai/schemastery'], HOST_BASELINE.schemastery), pkg.peerDependencies?.['@deepseek-ai/schemastery'])

// ── 3b. 代码侧声明表（host-abi 域 8）与 package.json 投影值级锁定 ──────────────
//      单源纪律：`HOST_PACKAGE_REGISTRY` 是代码侧唯一事实源，package.json 是其
//      投影；两侧集合/范围任一漂移即红（防「表说 peer、清单写 dep」的静默分叉）。
console.log('host-abi registry vs package.json projection:')
const registryModule = await import(new URL('../lib/host-abi/host-packages.js', import.meta.url).href).catch(() => null)
check('host-abi host-packages.js is importable (registry projection source)', registryModule !== null)
if (registryModule !== null) {
  const registryNames = [...registryModule.HOST_PACKAGE_NAMES].sort()
  check('registry package set === package.json peerDependencies keys', JSON.stringify(registryNames) === JSON.stringify([...peerNames].sort()), registryNames)
  for (const entry of registryModule.HOST_PACKAGE_REGISTRY) {
    check(`registry ${entry.name} range === package.json peerDependencies range`, pkg.peerDependencies?.[entry.name] === entry.range, [pkg.peerDependencies?.[entry.name], entry.range])
    check(`registry ${entry.name} optional flag === package.json peerDependenciesMeta.optional`, (pkg.peerDependenciesMeta?.[entry.name]?.optional === true) === entry.optional)
  }
  check('registry runtime-kind set === 11 dsh-* runtime peers', JSON.stringify([...registryModule.HOST_RUNTIME_PACKAGE_NAMES].sort()) === JSON.stringify([...DSH_RUNTIME_DEPS, ...PEER_DEP_NAMES].sort()))
  check('registry platform-kind set === 2 platform peers', JSON.stringify([...registryModule.HOST_PLATFORM_PACKAGE_NAMES].sort()) === JSON.stringify([...PLATFORM_DEPS].sort()))
}

// ── 5. README 兼容矩阵同步（声明面锚定档案项 = declaredEntry 的实测基线 + 记录性语义 + 权威防护指针）──
//      ARCH-006 起 declaredEntry = 声明范围逐字锚定的在册项（当前 0.2.0 frozen——本仓
//      声明面 ^0.2.0-rc.2 ×11 未随 0.2.1 主基线升格改动，覆盖关系由 section 0 判据看护），
//      README 必须载有该档案项四值（支持基线集表的对应行）。
console.log('README compatibility matrix:')
check('README has 宿主兼容性（实测基线） section', readme.includes('### 宿主兼容性（实测基线）'))
check(`README records host CLI baseline dsh ${declaredEntry?.dsh}`, readme.includes(declaredEntry?.dsh ?? '<no declared entry>'))
check(`README records dsh-* baseline ${declaredEntry?.dshPackages}`, readme.includes(declaredEntry?.dshPackages ?? '<no declared entry>'))
check(`README records cordis baseline ${declaredEntry?.cordis}`, readme.includes(declaredEntry?.cordis ?? '<no declared entry>'))
check(`README records schemastery baseline ${declaredEntry?.schemastery}`, readme.includes(declaredEntry?.schemastery ?? '<no declared entry>'))
/**
 * 声明面语义披露（v0.7.0 重写）：旧断言要求 README 声明「peerDeps 为**记录性**
 * （record-only，不依赖 enforcement）」——该口径自 v0.7.0 起**已不成立**：宿主
 * `dsh-app-boot` 的 `unmetRequirements` 以 `engines.dsh` 为权威输入（存在即单独
 * 判定、忽略 peer），peer 范围退为安装期可观测性声明。守卫意图不变（声明面语义
 * 必须在 README 如实披露），判据改为断言**新真相**：README 必须写明 ① `engines.dsh`
 * 与宿主装载门的判定关系；② 「宿主包永不得写入 `dependencies`」的 P0 纪律
 * （2026-10-25 桌面端启动故障的机制结论——不是提示，是硬纪律）。
 */
check('README discloses the new declaration semantics: engines.dsh is the host gate input + peer ranges no longer gate-only',
  readme.includes('engines.dsh') && readme.includes('宿主装载门'))
check('README states the P0 rule: host-supplied packages must never appear in dependencies (desktop startup outage mechanism)',
  /永不得写入\s*`dependencies`/.test(readme) && /提升到\s*profile\s*根/.test(readme))
check('README points authoritative guard to tests/host-version-snapshot.mjs', readme.includes('tests/host-version-snapshot.mjs'))

// ── 5b. README 支持基线集表 primary 行（FIX-053，REVIEW-REL-013-R0 P2-1 收口）──
//      背景：上方 §5 用 readme.includes() 对 declaredEntry（0.2.0 frozen）四值做
//      全文宽松命中——primary（0.2.1）行若漏改 / 缺行 / 重复均不红（v0.6.1 基线
//      刷新窗口）。本组按 README 表格**行结构**解析「宿主兼容性（实测基线）」小节，
//      期望值单源取 HOST_BASELINE_REGISTRY 的 primary 项（无第二份版本字面量），
//      并加「恰一 primary 行」计数。解析失配（小节缺失 / 无版本行）= 红（fail-closed：
//      提示同步 README 或本解析器）。表格列为：
//      | 基线 | 状态 | dsh CLI | 全系 dsh-* | cordis | schemastery | 实测时点 |
console.log('README primary baseline row (FIX-053):')
const compatSection = (readme.match(/### 宿主兼容性（实测基线）([\s\S]*?)(?=\n## )/) ?? [null, ''])[1]
const compatRows = compatSection.split(/\r?\n/)
  .filter((line) => /^\|\s*\d+\.\d+\.\d+\s*\|/.test(line))
  .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
check(`README §5 table parses (section found=${compatSection !== ''}, baseline rows=${compatRows.length}, registry entries=${HOST_BASELINE_REGISTRY.length})`, compatSection !== '' && compatRows.length >= HOST_BASELINE_REGISTRY.length)
const readmePrimaryRows = compatRows.filter((cells) => (cells[1] ?? '').includes('primary'))
check(`README §5: exactly one primary baseline row (got ${readmePrimaryRows.length}; 0 = missing row, >1 = duplicate — FIX-053)`, readmePrimaryRows.length === 1)
const readmePrimaryRow = readmePrimaryRows.length === 1 ? readmePrimaryRows[0] : null
check(`README §5: primary row baseline id === registry primary ${HOST_BASELINE.id} (got ${readmePrimaryRow?.[0] ?? '<none>'})`, readmePrimaryRow !== null && readmePrimaryRow[0] === HOST_BASELINE.id)
check(`README §5: primary row status cell declares primary（当前） (got ${JSON.stringify(readmePrimaryRow?.[1] ?? null)})`, readmePrimaryRow !== null && (readmePrimaryRow[1] ?? '').includes('primary') && (readmePrimaryRow[1] ?? '').includes('（当前）'))
const README_PRIMARY_COLUMNS = [
  ['dsh CLI', HOST_BASELINE.dsh, 2],
  ['全系 dsh-*', HOST_BASELINE.dshPackages, 3],
  ['cordis', HOST_BASELINE.cordis, 4],
  ['schemastery', HOST_BASELINE.schemastery, 5],
]
for (const [label, value, column] of README_PRIMARY_COLUMNS) {
  check(`README §5: primary row column ${column} (${label}) === \`${value}\` from registry primary (got ${JSON.stringify(readmePrimaryRow?.[column] ?? null)})`, readmePrimaryRow !== null && readmePrimaryRow[column] === '`' + value + '`')
}

console.log(`baseline registry: ${HOST_BASELINE_REGISTRY.map((entry) => `${entry.id}(${entry.status}: dsh=${entry.dsh} dsh-*=${entry.dshPackages} cordis=${entry.cordis} schemastery=${entry.schemastery})`).join(' | ')} | declared=${commonDeclaredRange ?? '<split/absent>'} -> ${declaredEntry?.id ?? '<none>'} | selected(DSH_BASELINE)=${DSH_BASELINE_RAW || '<unset>'} -> ${SELECTED_BASELINE.id}(${SELECTED_BASELINE.status})`)
console.log(failures === 0 ? `\nALL HOST VERSION SNAPSHOT TESTS PASSED (${passed} assertions)` : `\n${failures} FAILURE(S) (${passed} passed)`)
process.exit(failures === 0 ? 0 : 1)
