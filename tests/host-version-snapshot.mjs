/**
 * EVO-018 宿主版本基线快照守卫（ARCH-004 设计 §3 D3(c) 初版，B0 批）。
 *
 * 目的：锁「实测宿主基线」——插件 package.json 声明面（peerDependencies /
 * dependencies 版本范围、dsh.client.inject 注入清单）与 README 兼容矩阵
 * 必须与实测基线一致；任一侧漂移（宿主升级后忘改声明、手滑改回旧范围、
 * 复活已消亡包的注入死行）→ 本测试必红。
 *
 * 实测基线（ARCH-005 R0 起为**多基线档案**，见下方 HOST_BASELINE_REGISTRY；ARCH-007
 * 刷新至四档案）：
 * - 0.1.5（frozen）：dsh 0.1.5-rc.1 / dsh-* 0.1.5-rc.2 / cordis 4.0.2 / schemastery 3.18.2
 *   （2026-09-12 机核；仅作档案承载，低于声明范围下界，不参与声明面覆盖判据）
 * - 0.2.0（frozen）：dsh 与全部 dsh-* 0.2.0-rc.2 / cordis 4.0.5 / schemastery 3.18.5
 *   （npm 全局树实读 2026-10-17；ARCH-007 起是逐代并集的**下界代际**，本仓
 *   node_modules 树仍为该组合〔如实记录，不假设已升级〕）
 * - 0.2.1（frozen）：dsh 与全部 dsh-* 0.2.1-rc.2 / cordis 4.0.5 / schemastery 3.18.5
 *   （npm 全局树实读 2026-10-20；ARCH-006 的主基线，ARCH-007 起随 0.2.2 登记降档
 *   frozen——并集里仍保留其独立区间，支持面不缩）
 * - 0.2.2（primary）：dsh 与全部 dsh-* 0.2.2-rc.1 / cordis 4.1.0 / schemastery 3.19.0
 *   （2026-11-07 桌面宿主 `D:\app\dsh\resources\app.asar` 实读：FileVersion
 *   `0.2.2-rc.1`，内部 331 个 `@deepseek-ai` 包版本全为 `0.2.2-rc.1`；
 *   声明面 diff：events 28→30 纯增量，其余为版本号加法；该分发形态的客户端
 *   包零 `.d.ts`〔D3 另案，勿据此断言类型面可验〕）
 *
 * 依据（ARCH-004 §3 D1-5 / ADR-A；ARCH-005 R1 修订口径——旧「宿主 runner/cordis
 * 零 enforcement、安装器零告警」叙事被 0.2.0 装载门终结，见设计 §3-9 / HD-001）：
 * 插件自身运行不依赖 semver enforcement 判定宿主（该半边延续）；但宿主 0.2.0 起
 * dsh-app-boot 装载门对 manifest 全部 @deepseek-ai/dsh* peerDeps 逐项
 * semver.satisfies(includePrerelease) 硬门控——声明范围 = 门控钥匙（不满足且无豁免
 * 即整层拒载，宿主 stderr 有可观测 skip 警告）；peerDependenciesMeta optional 仅
 * 影响安装器行为、不解除装载门。本快照测试 + README 兼容矩阵仍为声明面漂移的
 * 权威防护（防宿主升级后忘改声明 / 基线跳跃被无声回退 / 复活死行）。
 * 声明面 README 判据（§5/§5b）分两层：① §5 要求 README 记录**每个**档案项的四值
 * （dsh CLI / 全系 dsh-* / cordis / schemastery）；② §5b 按「宿主兼容性（实测基线）」
 * 表格**行结构**逐档案项比对四列 + 恰一 primary 行（缺行 / 重复 / 漏改即红）。
 *
 * 判别性（红/绿演示）：把任一基线常量临时改成假版本号 → peerDeps/deps/README
 * 断言必红；声明范围删掉任一已登记代际的区间 → §0 的覆盖/结构断言必红（stock
 * semver 预发布门控）；package.json 范围改回 ^0.1.0-rc.* 或 inject 复活死行
 * @deepseek-ai/dsh-client-runtime（0.1.5 起宿主中不存在，加载器静默跳过的
 * 纯死重，D1-1 已删）→ 必红；复原后全绿。
 *
 * 如何刷新基线（宿主升级后）：
 * 1. 实读新宿主树（npm 全局树 = %APPDATA%\npm\node_modules\@deepseek-ai\dsh
 *    嵌套 scope 或 DSH_HOST_SOURCE 指向的 checkout）：各 <pkg>/package.json 的
 *    version 字段（dsh CLI 包与 cordis / schemastery 单独核对——**禁止照抄文档
 *    值，实施时单点复读树态定谳**，ARCH-005 T-6 纪律）；
 * 2. 同步更新多处：本文件 HOST_BASELINE_REGISTRY（新增档案项：旧主基线降级
 *    frozen、新项 status primary）、`DECLARED_DSH_RANGE`（**每登记一个宿主代际
 *    必须追加一个同代区间**：下界取该代际首个 rc，上界取下一代际开区间
 *    `<M.m+1-0`——成因见 §0 的 semver 预发布门控注释，勿"简化"为单区间）、
 *    package.json 的 `engines.dsh` 与 11 个 dsh-* peer（逐字同串）与 inject 清单
 *    （若有包消亡/新增）、README「宿主兼容性（实测基线）」小节（逐档案项表格行）、
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
// 0.1.5（frozen）：历史实测基线，仅以档案常量承载（低于声明范围下界，不支持声明）。
// 0.2.0（frozen）：逐代并集的下界代际——npm 全局树实读（%APPDATA%\npm\node_modules\
//   @deepseek-ai\dsh 嵌套 scope，2026-10-17）；ARCH-007 声明范围以 `>=0.2.0-rc.2` 起算。
// 0.2.1（frozen）：ARCH-006 主基线（npm 全局树实读，2026-10-20；0.2.1-rc.2；
//   cordis/schemastery 4.0.5 / 3.18.5），ARCH-007 随 0.2.2 升格降档 frozen；并集中
//   保留其独立区间（支持面不因降档收缩）。
// 0.2.2（primary）：桌面宿主 `D:\app\dsh\resources\app.asar` 实读（2026-11-07）——
//   FileVersion 0.2.2-rc.1，内部 331 个 @deepseek-ai 包全为 0.2.2-rc.1，
//   cordis/schemastery 4.1.0 / 3.19.0；客户端包零 .d.ts（D3 另案）。
// 本档案 = 唯一事实源（ARCH-005 R3 起 tests/host-contract.mjs 亦经文本提取消费本注册表
// ——无第二份版本常量，提取/选择失败即红；「双份常量机器锁定」纪律（F-J）随之退役为
// 「单份常量 + 提取判据」）。
const HOST_BASELINE_REGISTRY = Object.freeze([
  { id: '0.1.5', status: 'frozen', dsh: '0.1.5-rc.1', dshPackages: '0.1.5-rc.2', cordis: '4.0.2', schemastery: '3.18.2' },
  { id: '0.2.0', status: 'frozen', dsh: '0.2.0-rc.2', dshPackages: '0.2.0-rc.2', cordis: '4.0.5', schemastery: '3.18.5' },
  { id: '0.2.1', status: 'frozen', dsh: '0.2.1-rc.2', dshPackages: '0.2.1-rc.2', cordis: '4.0.5', schemastery: '3.18.5' },
  { id: '0.2.2', status: 'primary', dsh: '0.2.2-rc.1', dshPackages: '0.2.2-rc.1', cordis: '4.1.0', schemastery: '3.19.0' },
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

/**
 * 声明面 dsh 范围（ARCH-007 D5）：**显式逐代并集**，`engines.dsh` 与 11 个
 * `dsh-*` peer 逐字相同。三个区间 = 三个支持代际（0.2.0 / 0.2.1 / 0.2.2）；
 * 0.1.5 档案低于声明下界，不入范围。成因/维护规则见 §0 的结构断言注释。
 */
const DECLARED_DSH_RANGE = '>=0.2.0-rc.2 <0.2.1-0 || >=0.2.1-rc.1 <0.2.2-0 || >=0.2.2-rc.1 <0.2.3-0'

/** 声明范围下界（= 首个被声明支持的代际的 dshPackages；新增代际不得低于此值）。 */
const DECLARED_RANGE_FLOOR = '0.2.0-rc.2'

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
 * 范围（`^M.m.p` caret 形态，或 ARCH-007 起的**逐代并集** `>=x <y || >=x <y` 形态）
 * 是否包含实测基线版本。
 *
 * - caret 分支：M.m.p 数值序，预发布后缀不参与——宿主装载门
 *   satisfies(includePrerelease) 的镜像判据（ARCH-006 起兼承 dsh 系 rc 版本覆盖判定）。
 * - 并集分支（ARCH-007 D5）：按 **stock semver 语义**逐段准入——版本含预发布后缀时，
 *   仅当该段某个比较器带**同 major.minor.patch** 的预发布才可能满足（semver 2.0.0
 *   §预发布门槛）；无 includePrerelease 旁路。这正是 npm/pnpm/市场与装载门的口径差。
 * 范围改用其它形态 → 解析失败 → 红，强制走基线刷新流程而非静默放过。
 *
 * 注：本函数是**单源文本提取对象**（tests/host-contract.mjs S3 用 blockOf +
 * new Function 复用它），因此体内不得引用本文件其它符号——全部实现自包含。
 */
function caretRangeContains(range, version) {
  const text = String(range)
  const parseSemverLocal = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(value))
    if (match === null) return null
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] ? match[4].split('.') : [] }
  }
  const compareSemverLocal = (left, right) => {
    for (const field of ['major', 'minor', 'patch']) {
      if (left[field] !== right[field]) return left[field] < right[field] ? -1 : 1
    }
    if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0
    if (left.prerelease.length === 0) return 1
    if (right.prerelease.length === 0) return -1
    const length = Math.max(left.prerelease.length, right.prerelease.length)
    for (let index = 0; index < length; index++) {
      const a = left.prerelease[index]
      const b = right.prerelease[index]
      if (a === undefined) return -1
      if (b === undefined) return 1
      const aNumeric = /^\d+$/.test(a)
      const bNumeric = /^\d+$/.test(b)
      if (aNumeric && bNumeric) {
        if (Number(a) !== Number(b)) return Number(a) < Number(b) ? -1 : 1
        continue
      }
      if (aNumeric !== bNumeric) return aNumeric ? -1 : 1
      if (a !== b) return a < b ? -1 : 1
    }
    return 0
  }
  if (text.includes('||')) {
    const target = parseSemverLocal(version)
    if (target === null) return false
    return text.split('||').some((segment) => {
      const comparators = segment.trim().split(/\s+/)
      if (comparators.length !== 2) return false
      const lower = /^>=(\S+)$/.exec(comparators[0])
      const upper = /^<(\S+)$/.exec(comparators[1])
      if (!lower || !upper) return false
      const lowerVersion = parseSemverLocal(lower[1])
      const upperVersion = parseSemverLocal(upper[1])
      if (lowerVersion === null || upperVersion === null) return false
      if (compareSemverLocal(target, lowerVersion) < 0 || compareSemverLocal(target, upperVersion) >= 0) return false
      if (target.prerelease.length === 0) return true
      // 预发布门槛：比较器必须带同 tuple 的预发布才放行该预发布版本（stock semver 规则）。
      return [lowerVersion, upperVersion].some((comparator) => comparator.prerelease.length > 0
        && comparator.major === target.major && comparator.minor === target.minor && comparator.patch === target.patch)
    })
  }
  const base = /^\^(\d+)\.(\d+)\.(\d+)(?:-rc\.\d+)?$/.exec(text)
  const ver = /^(\d+)\.(\d+)\.(\d+)(?:-rc\.\d+)?$/.exec(String(version))
  if (!base || !ver) return false
  const [baseMajor, baseMinor, basePatch] = [Number(base[1]), Number(base[2]), Number(base[3])]
  const [verMajor, verMinor, verPatch] = [Number(ver[1]), Number(ver[2]), Number(ver[3])]
  if (verMajor !== baseMajor) return false
  if (verMajor === 0 && verMinor !== baseMinor) return false
  return verMinor > baseMinor || (verMinor === baseMinor && verPatch >= basePatch)
}

/**
 * 最小 semver 实现（ARCH-007 D5）：仅覆盖声明面实际使用的 `>=x <y` 比较器与
 * 预发布语义，避免为一条断言给仓库引入 `semver` 依赖。语义按 semver 2.0.0
 * 规范（数字标识按数值比较、非数字按字典序、预发布 < 正式版）——与 npm 内置
 * semver 7.x 的 stock `satisfies` 逐例对拍见 §0 的自检断言。
 */
function parseSemver(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(value))
  if (match === null) return null
  return Object.freeze({
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: Object.freeze(match[4] ? match[4].split('.') : []),
  })
}

function compareSemver(left, right) {
  for (const field of ['major', 'minor', 'patch']) {
    if (left[field] !== right[field]) return left[field] < right[field] ? -1 : 1
  }
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0
  if (left.prerelease.length === 0) return 1
  if (right.prerelease.length === 0) return -1
  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index++) {
    const a = left.prerelease[index]
    const b = right.prerelease[index]
    if (a === undefined) return -1
    if (b === undefined) return 1
    const aNumeric = /^\d+$/.test(a)
    const bNumeric = /^\d+$/.test(b)
    if (aNumeric && bNumeric) {
      if (Number(a) !== Number(b)) return Number(a) < Number(b) ? -1 : 1
      continue
    }
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1
    if (a !== b) return a < b ? -1 : 1
  }
  return 0
}

/** 把 `>=x <y` 解析为比较器对；任一区间非此形态 → null（判红）。 */
function parseDeclaredSegments(range) {
  return String(range).split('||').map((segment) => segment.trim()).filter(Boolean).map((segment) => {
    const match = /^>=(\S+)\s+<(\S+)$/.exec(segment)
    if (match === null) return null
    const lower = parseSemver(match[1])
    const upper = parseSemver(match[2])
    return lower === null || upper === null ? null : { lower, upper }
  })
}

/** 比较器对的规范字符串形态（结构锁逐字比对用）。 */
function formatSegment(segment) {
  const format = (version) => `${version.major}.${version.minor}.${version.patch}${version.prerelease.length > 0 ? `-${version.prerelease.join('.')}` : ''}`
  return `>=${format(segment.lower)} <${format(segment.upper)}`
}

/**
 * 单个 `>=x <y` 区间是否含 version（stock semver 语义，含预发布门控）。
 * 门控：带 prerelease 的版本，只有「同一 major.minor.patch 元组、且自身带
 * prerelease 的比较器」存在时才可能命中——即上界 `<0.2.1-0` 这类**下一代际
 * 开区间哨兵**只为该元组的预发布版本开门，不为其正式版开门（正式版由比较器
 * 大小关系另行排除）。
 */
function segmentSatisfies(segment, version) {
  const parsed = parseSemver(version)
  if (parsed === null || segment === null) return false
  if (compareSemver(parsed, segment.lower) < 0) return false
  if (compareSemver(parsed, segment.upper) >= 0) return false
  if (parsed.prerelease.length === 0) return true
  const sameTuple = (comparator) => comparator !== null && comparator.prerelease.length > 0
    && comparator.major === parsed.major && comparator.minor === parsed.minor && comparator.patch === parsed.patch
  return sameTuple(segment.lower) || sameTuple(segment.upper)
}

/** 并集语义：任一区间命中即满足（stock semver 无 includePrerelease）。 */
function satisfiesDeclaredRange(range, version) {
  const segments = parseDeclaredSegments(range)
  return segments.length > 0 && segments.every((segment) => segment !== null) && segments.some((segment) => segmentSatisfies(segment, version))
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
 * package.json 声明面对应的档案项（ARCH-007 重写）：
 * - 8 peerDeps + 3 dsh deps 的声明范围 MUST 收敛到**同一个**范围（分裂即红），
 *   且逐字等于 `DECLARED_DSH_RANGE`；
 * - 该范围 MUST 用 **stock semver（不传 includePrerelease）** 覆盖所有被声明支持
 *   的代际（= 注册表中 dshPackages ≥ 声明下界 的项：0.2.0 / 0.2.1 / 0.2.2）；
 * - 结构锁：区间数 === 被支持代际数，且每个区间逐字由对应代际推导——
 *   忘给新代际加区间（或把区间"简化"掉）→ 红。
 *
 * 为什么必须是逐代并集而不是单区间（D5 根因，勿"优化"）：
 * semver 的预发布门控规定——带 prerelease 的版本只有在「同一 major.minor.patch
 * 元组、且自身带 prerelease 的比较器」存在时才可能命中。单区间
 * `>=0.2.0-rc.2 <0.2.3-0` 只提供 0.2.0（预发布）与 0.2.3（预发布哨兵）两个元组的
 * 比较器，因此 0.2.1-rc.2 / 0.2.2-rc.1 在 npm/pnpm/市场（stock）判定下
 * **不满足**；宿主的装载门（includePrerelease: true）却放行——单区间等于原样
 * 复现 D5。**维护规则：每登记一个新宿主代际，必须追加一个同代际区间**
 * `>=<gen>-rc.1 <next-minor>-0`；§0 的结构断言与正反覆盖断言会同时变红兜底。
 */
const declaredRangeValues = [
  ...PEER_DEP_NAMES.map((name) => pkg.peerDependencies?.[name]),
  ...DSH_RUNTIME_DEPS.map((name) => pkg.peerDependencies?.[name]),
]
const commonDeclaredRange = declaredRangeValues[0] && declaredRangeValues.every((range) => range === declaredRangeValues[0]) ? declaredRangeValues[0] : null
check(`declared dsh range (${commonDeclaredRange ?? '<split/absent>'}) is exactly the ARCH-007 generation union (${DECLARED_DSH_RANGE}; split/absent/old single-range red — D5)`,
  commonDeclaredRange === DECLARED_DSH_RANGE)

/**
 * 被声明支持的代际 = 注册表中 dshPackages 版本 ≥ 下界的项。0.1.5 低于下界，
 * 不参与覆盖判据（且声明面不得回退到它——下面负例含 0.1.5-rc.2）。
 */
const supportedBaselineEntries = HOST_BASELINE_REGISTRY.filter((entry) => {
  const parsed = parseSemver(entry.dshPackages)
  return parsed !== null && compareSemver(parsed, parseSemver(DECLARED_RANGE_FLOOR)) >= 0
})
console.log(`declared range coverage (stock semver, includePrerelease=false): supported generations=${supportedBaselineEntries.map((entry) => entry.id).join('/')}`)

// ── 0a. 自检：比较器必须复现 stock semver 的预发布门控（不是自说自话）────────
check('semver self-check: single segment `>=0.2.0-rc.2 <0.2.3-0` accepts 0.2.0-rc.2 but rejects 0.2.1-rc.2 and 0.2.2-rc.1 (the D5 failure mode this union exists to close)',
  satisfiesDeclaredRange('>=0.2.0-rc.2 <0.2.3-0', '0.2.0-rc.2') === true
  && satisfiesDeclaredRange('>=0.2.0-rc.2 <0.2.3-0', '0.2.1-rc.2') === false
  && satisfiesDeclaredRange('>=0.2.0-rc.2 <0.2.3-0', '0.2.2-rc.1') === false)
check('semver self-check: prerelease sorts below the release of the same tuple and above the previous tuple (0.2.2-rc.1 < 0.2.2 < 0.2.3-0 gate)',
  compareSemver(parseSemver('0.2.2-rc.1'), parseSemver('0.2.2')) === -1
  && compareSemver(parseSemver('0.2.2'), parseSemver('0.2.3-0')) === -1
  && compareSemver(parseSemver('0.2.2-rc.1'), parseSemver('0.2.1-rc.2')) === 1)

// ── 0b. 正例：每个被支持基线的 dsh 版本都必须在 stock 语义下满足 ─────────────
for (const entry of supportedBaselineEntries) {
  check(`stock satisfies: supported baseline ${entry.id} dsh ${entry.dsh} ∈ declared union`, satisfiesDeclaredRange(DECLARED_DSH_RANGE, entry.dsh))
}
check(`stock satisfies: every peer/runtime declared range (${commonDeclaredRange ?? '<split/absent>'}) admits ALL supported baselines under stock semantics (no includePrerelease crutch)`,
  supportedBaselineEntries.length > 0 && supportedBaselineEntries.every((entry) => satisfiesDeclaredRange(commonDeclaredRange, entry.dsh)))

// ── 0c. 负例：范围外的代际/版本必须拒绝（防范围被放宽成"什么都满足"）───────
for (const version of ['0.2.3-0', '0.2.3', '0.3.0', '0.1.5-rc.2', '0.2.1-alpha.5']) {
  check(`stock satisfies: out-of-scope ${version} is NOT in the declared union`, satisfiesDeclaredRange(DECLARED_DSH_RANGE, version) === false)
}

// ── 0d. 结构锁：区间数 === 支持代际数，且每段下界由对应代际推导 ──────────────
const declaredSegments = parseDeclaredSegments(DECLARED_DSH_RANGE)
const expectedDeclaredSegments = supportedBaselineEntries.map((entry, index) => {
  const [major, minor, patch] = entry.id.split('.').map(Number)
  const lower = index === 0 ? DECLARED_RANGE_FLOOR : `${entry.id}-rc.1`
  // 上界哨兵 = 同代际下一 patch 的开区间（`<0.2.1-0`）：该元组带预发布比较器，
  // stock 语义下只为该代际的 `-rc.x` 开门，不替下一代际放行（见 §0 起因注释）。
  return `>=${lower} <${major}.${minor}.${patch + 1}-0`
})
check(`declared range has exactly one segment per supported registry generation (segments=${declaredSegments.length}, supported=${supportedBaselineEntries.length}; appending a new generation without a same-generation segment goes red)`,
  supportedBaselineEntries.length > 0 && declaredSegments.length === supportedBaselineEntries.length)
check(`declared segments are derived 1:1 from supported generations (expected: ${expectedDeclaredSegments.join(' || ')})`,
  declaredSegments.length === expectedDeclaredSegments.length
  && expectedDeclaredSegments.every((expected, index) => declaredSegments[index] !== null && formatSegment(declaredSegments[index]) === expected))
check(`each supported baseline's dshPackages is admitted by its own generation segment (no cross-generation leakage)`,
  supportedBaselineEntries.every((entry, index) => segmentSatisfies(declaredSegments[index], entry.dshPackages)))

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
  console.log(`  ·   DSH_BASELINE=${SELECTED_BASELINE.id}(${SELECTED_BASELINE.status}) 已选定；本套件声明面断言恒以 primary 为锚，选择非主基线不改变任何断言`)
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
/**
 * 旁路通道（R0 审查 P2-3 收口）：纯净性此前只锁 `dependencies`——`optionalDependencies`
 * 与 `bundledDependencies` 同样会被安装器装进 profile 根（前者按需装、后者随包发布），
 * 均能重现提升遮蔽；`dependencies` 的键序敏感断言也一并改为集合比较。
 */
const bundledNames = Array.isArray(pkg.bundleDependencies) ? pkg.bundleDependencies : Array.isArray(pkg.bundledDependencies) ? pkg.bundledDependencies : []
const hostOwnedBypass = [
  ...Object.keys(pkg.optionalDependencies ?? {}).map((name) => `optionalDependencies:${name}`),
  ...bundledNames.map((name) => `bundledDependencies:${name}`),
].filter((entry) => entry.includes('@deepseek-ai/'))
check('optionalDependencies / bundledDependencies declare ZERO @deepseek-ai/* packages (bypass channels for the same hoisting failure — P2-3)',
  hostOwnedBypass.length === 0, hostOwnedBypass)
check('dependencies keeps only genuinely self-owned runtime deps (undici; order-insensitive)', JSON.stringify(Object.keys(pkg.dependencies ?? {}).sort()) === JSON.stringify(['undici']), pkg.dependencies)
check('peerDependencies covers exactly the 13 baseline host packages (8 feature + 3 runtime + 2 platform)', JSON.stringify([...peerNames].sort()) === JSON.stringify([...PEER_DEP_NAMES, ...DSH_RUNTIME_DEPS, ...PLATFORM_DEPS].sort()))
check(`peerDependenciesMeta.optional is exactly the 8 feature peers (hard runtime/platform peers stay required)`,
  JSON.stringify(Object.keys(pkg.peerDependenciesMeta ?? {}).filter((name) => pkg.peerDependenciesMeta[name]?.optional === true).sort()) === JSON.stringify([...PEER_DEP_NAMES].sort()))
for (const name of [...PEER_DEP_NAMES, ...DSH_RUNTIME_DEPS]) {
  check(`peerDep ${name} records the ARCH-007 generation union (split/absent red)`, pkg.peerDependencies?.[name] === commonDeclaredRange)
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

// ── 5. README 兼容矩阵同步（ARCH-007：**逐档案项**记录判据，不再是单个 declaredEntry）──
//      README 必须为注册表中的**每一项**（含 frozen 历史项）记录四值；缺项/漏值即红。
//      行级结构判据（表格行、primary 唯一性）见 §5b。
console.log('README compatibility matrix:')
check('README has 宿主兼容性（实测基线） section', readme.includes('### 宿主兼容性（实测基线）'))
for (const entry of HOST_BASELINE_REGISTRY) {
  check(`README records registry entry ${entry.id} four values (dsh ${entry.dsh} / dsh-* ${entry.dshPackages} / cordis ${entry.cordis} / schemastery ${entry.schemastery})`,
    readme.includes(entry.dsh) && readme.includes(entry.dshPackages) && readme.includes(entry.cordis) && readme.includes(entry.schemastery))
}
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

// ── 5b. README 支持基线集表**行级**判据（ARCH-007 重写；原 FIX-053 只锁 primary 行）──
//      背景：§5 的 readme.includes() 是全文宽松命中——表格行漏改 / 缺行 / 重复 / 多出
//      孤儿行均可能不红。本组解析「宿主兼容性（实测基线）」小节表格，按 HOST_BASELINE_REGISTRY
//      **逐项**比对：每个档案项恰一行、四值逐格相等、状态格与档案一致、行数无多余；
//      另加「恰一 primary 行（含 primary（当前）字样）」。期望值单源取注册表（无第二份
//      版本字面量）。解析失配（小节缺失 / 无版本行）= 红（fail-closed）。
//      表格列为：| 基线 | 状态 | dsh CLI | 全系 dsh-* | cordis | schemastery | 实测时点 |
console.log('README baseline registry table (row-level, ARCH-007):')
const compatSection = (readme.match(/### 宿主兼容性（实测基线）([\s\S]*?)(?=\n## )/) ?? [null, ''])[1]
const compatRows = compatSection.split(/\r?\n/)
  .filter((line) => /^\|\s*\d+\.\d+\.\d+\s*\|/.test(line))
  .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
check(`README §5 table parses (section found=${compatSection !== ''}, baseline rows=${compatRows.length}, registry entries=${HOST_BASELINE_REGISTRY.length})`, compatSection !== '' && compatRows.length >= HOST_BASELINE_REGISTRY.length)
check(`README §5: table has exactly one row per registry entry (rows=${compatRows.length}, entries=${HOST_BASELINE_REGISTRY.length}; missing/duplicate/orphan row red)`, compatRows.length === HOST_BASELINE_REGISTRY.length)
for (const entry of HOST_BASELINE_REGISTRY) {
  const rows = compatRows.filter((cells) => cells[0] === entry.id)
  check(`README §5: registry entry ${entry.id} has exactly one table row (got ${rows.length})`, rows.length === 1)
  const row = rows.length === 1 ? rows[0] : null
  check(`README §5: row ${entry.id} mirrors registry (status=${entry.status}, dsh=${entry.dsh}, dsh-*=${entry.dshPackages}, cordis=${entry.cordis}, schemastery=${entry.schemastery})`,
    row !== null
    && (row[1] ?? '').includes(entry.status)
    && row[2] === '`' + entry.dsh + '`'
    && row[3] === '`' + entry.dshPackages + '`'
    && row[4] === '`' + entry.cordis + '`'
    && row[5] === '`' + entry.schemastery + '`')
}
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

console.log(`baseline registry: ${HOST_BASELINE_REGISTRY.map((entry) => `${entry.id}(${entry.status}: dsh=${entry.dsh} dsh-*=${entry.dshPackages} cordis=${entry.cordis} schemastery=${entry.schemastery})`).join(' | ')} | declared=${commonDeclaredRange ?? '<split/absent>'} segments=${declaredSegments.length}/${supportedBaselineEntries.length} | selected(DSH_BASELINE)=${DSH_BASELINE_RAW || '<unset>'} -> ${SELECTED_BASELINE.id}(${SELECTED_BASELINE.status})`)
console.log(failures === 0 ? `\nALL HOST VERSION SNAPSHOT TESTS PASSED (${passed} assertions)` : `\n${failures} FAILURE(S) (${passed} passed)`)
process.exit(failures === 0 ? 0 : 1)
