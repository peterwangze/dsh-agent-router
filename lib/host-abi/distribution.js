/**
 * ARCH-007 B4 / R-1：**分发形态判别域**——「类型声明面是否可验」这一维的单一实现
 * 路径（P5：probe / host-contract 共用，零第二份判据）。
 *
 * 背景（ARCH-007 §2 实测）：同一份宿主有两种分发形态——
 *  - **npm 解包树**：包内 `lib/types/**` 带 `.d.ts`（0.2.1-rc.2 实测 7458 个）；
 *  - **桌面 asar 打包树**：只保留运行时 `.js`，**整树 0 个 `.d.ts`**（0.2.2-rc.1
 *    实测 0，但仍有 24 个包的 package.json 声明 `types: lib/types/index.d.ts`）。
 * 于是「宿主契约锚 miss」分裂成两个**性质不同**的结论：
 *  - `unavailable`：类型声明面整体不存在——分发形态所致，**不是 ABI 位移**，正确
 *    动作是换 npm 形态核验 / 按运行时面重锚，而非改代码；
 *  - `missing`：声明面在（或不该在的类型面之外）而符号/文件不在——**真 ABI 位移**。
 * 两类混算（旧行为：`.d.ts` 缺席与真位移同记 missing）会让报告无法指导适配动作，
 * 并让静态守卫在桌面形态下直接 ENOENT 崩栈（P8 违反）。
 *
 * 判据（**内容判据**，禁路径启发式）：抽样若干「两形态都随宿主分发」的包，读其
 * `lib/types/**` 下 `.d.ts` 数——>0 ⇒ npm；=0 且抽样包在位 ⇒ bundled；抽样包全缺
 * ⇒ unknown（探测层另以 `dsh-api-remotes/lib/client.js` 判可达性，正常不会到
 * unknown）。`--distribution auto|npm|bundled` 的 `requested` 只覆盖 `detected`
 * 标签，判据实测值始终留在 `evidence` 里（forced 形态可对照）。
 *
 * 边界：本模块**只做判定**，不写盘、不读宿主之外的数据、不 import 任何
 * `@deepseek-ai/*`（host-contract S10 静态边界；`node:fs` 有 host-packages.js
 * 先例）。消费方：`scripts/host-radar-probe.mjs`（报告 `distribution` 面）与
 * `tests/host-contract.mjs`（锚点分型：分布不可验 vs 真位移）。
 * @module dsh-agent-router/host-abi/distribution
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** `--distribution` 合法取值（auto = 内容判据；npm/bundled = 显式覆盖标签）。 */
export const DISTRIBUTION_MODES = Object.freeze(['auto', 'npm', 'bundled'])

/**
 * 抽样包（判据面）——选型约束：两个形态都随宿主分发，且覆盖两类包家族
 * （api 服务包：`lib/types` 目录存在、npm 形态带 `.d.ts`；client 包：桌面形态
 * 连 `lib/types` 目录都没有）。任一族的判定被绕过都会让判据失真。
 */
export const DISTRIBUTION_SAMPLE_PACKAGES = Object.freeze([
  'dsh-api-remotes',
  'dsh-api-session-controller',
  'dsh-llm',
  'dsh-client-ui-model-selection',
  'dsh-client-ui-conversation',
  'dsh-client-locale',
])

/** 类型声明文件后缀（判据与消费方分型的单一常量）。 */
export const TYPE_DECLARATION_SUFFIX = '.d.ts'

/**
 * 路径是否类型声明文件（报告里的锚文件串形如 `<包名>/lib/types/...`）。
 * 非字符串 → false（声明面畸形由调用方的完备性判据负责判红，本函数只负责分型）。
 */
export function isTypeDeclarationFile(path) {
  return typeof path === 'string' && path.endsWith(TYPE_DECLARATION_SUFFIX)
}

/**
 * 目录下 `.d.ts` 递归计数（目录缺失 → 0；不做异常吞没的语义判断——
 * 存在性由调用方按包名单独记录在 evidence 里）。
 */
const countTypeDeclarations = (directory) => {
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch {
    return 0
  }
  let total = 0
  for (const entry of entries) {
    if (entry.isDirectory()) {
      total += countTypeDeclarations(join(directory, entry.name))
    } else if (entry.isFile() && entry.name.endsWith(TYPE_DECLARATION_SUFFIX)) {
      total += 1
    }
  }
  return total
}

/**
 * 判别宿主树分发形态。
 *
 * @param {string} hostRoot `@deepseek-ai/` scope 目录（含各宿主包）的绝对/相对路径。
 * @param {{ requested?: 'auto'|'npm'|'bundled' }} [options] `requested` 缺省 auto。
 * @returns {{
 *   requested: string,
 *   detected: 'npm'|'bundled'|'unknown',
 *   byContent: 'npm'|'bundled'|'unknown',
 *   source: string,
 *   typeAnchors: 'available'|'unavailable',
 *   evidence: Array<{ package: string, present: boolean, typesDirPresent: boolean, declarationFiles: number }>,
 * }} `detected` = 生效标签（auto → byContent）；`typeAnchors` = 类型声明面**实况**
 *     （available 仅当抽样面实测到 `.d.ts`）——forced 覆盖不改实况，故 forced bundled
 *     遇到 npm 树仍 `available`（文件在即核验），forced npm 遇到桌面树仍
 *     `unavailable`（消费方按 detected 标签决定 unavailable 是否成立，见
 *     `typeAnchorsUnavailable`）。
 */
export function detectHostDistribution(hostRoot, options = {}) {
  const requested = options.requested ?? 'auto'
  if (!DISTRIBUTION_MODES.includes(requested)) {
    throw new Error(`unknown distribution mode '${requested}' (expected ${DISTRIBUTION_MODES.join('|')})`)
  }
  const evidence = DISTRIBUTION_SAMPLE_PACKAGES.map((packageName) => {
    const packageDir = join(hostRoot, packageName)
    const typesDir = join(packageDir, 'lib', 'types')
    const present = existsSync(packageDir)
    return {
      package: packageName,
      present,
      typesDirPresent: present && existsSync(typesDir),
      declarationFiles: present ? countTypeDeclarations(typesDir) : 0,
    }
  })
  const presentCount = evidence.filter((entry) => entry.present).length
  const declarationTotal = evidence.reduce((sum, entry) => sum + entry.declarationFiles, 0)
  const byContent = declarationTotal > 0 ? 'npm' : presentCount > 0 ? 'bundled' : 'unknown'
  const criteria = `内容判据：${DISTRIBUTION_SAMPLE_PACKAGES.length} 个抽样包 lib/types/**/*.d.ts 合计 ${declarationTotal} 个，抽样包在位 ${presentCount}/${DISTRIBUTION_SAMPLE_PACKAGES.length} ⇒ ${byContent}`
  return {
    requested,
    detected: requested === 'auto' ? byContent : requested,
    byContent,
    source: requested === 'auto'
      ? `auto（${criteria}）`
      : `forced(--distribution ${requested})：${criteria}（显式覆盖只改标签，判据实测值见 evidence——用于两形态对照核验）`,
    typeAnchors: declarationTotal > 0 ? 'available' : 'unavailable',
    evidence,
  }
}

/**
 * 类型声明面锚「不可验」判据（消费方唯一分型函数，禁各自组合条件）：
 * 仅当**生效分发形态 = bundled** 且类型声明面实测缺席时成立（分发形态所致）；
 * forced npm 或 npm 形态下 `.d.ts` 缺席 = 真位移（`missing`），照旧判红。
 */
export function typeAnchorsUnavailable(distribution) {
  return distribution?.detected === 'bundled' && distribution?.typeAnchors === 'unavailable'
}
